import { X_DEMON } from '../data/sects';
// 人界地形：宏观栅格 + 分块水墨渲染
import { fbm, hash2, valueNoise, mulberry32, clamp, hashU, pnoise } from '../core/rng';
import { IS_TOUCH } from '../core/touch';
import {
  MACRO_W, MACRO_H, WORLD_SCALE, MAINLAND, LAKES, LAKE_ISLES, RANGES, RIVERS, ARID_ZONES, COLD_ZONES, FOREST_ZONES,
  LOCATIONS, ISLAND_FIELD, EXTRA_ISLANDS, ISLAND_K, pointInPoly, toLegacy, P, zoneAt } from '../data/world';
import type { MtnSpec, MtnStyle } from '../gfx/mountain';
import { pickSpecies, Species, TREE_SIZE } from '../gfx/tree';
import { getLayout, setLayoutEnv, LOC_SCALE } from '../gfx/building';
import { GRASS_VARIANTS, type GrassKind } from '../gfx/grass';
import { RiverGeo } from './rivergeo';
import { LANDMARKS, SCENIC, landmarkAt, lmCleared, lmNoGrass, type GroveSpot, type FallSpot } from '../data/landmarks';

export const CHUNK = 1024;          // 每块世界像素
export const CHUNK_RES = 384;       // 每块纹理分辨率（含笔触细节）
const PIX_RES = 192;                // 底色像素分辨率（柔和水彩，之后放大）
const CELL = 256;                   // 装饰物摆放网格
const MTILE = 256;                  // 流式宏观地形块边长（宏观单位）
const MSTRIDE = MTILE + 1;          // 含右/下 1 格重叠边，双线性插值不跨块
const MTILE_CACHE_MAX = IS_TOUCH ? 48 : 64;         // LRU 常驻宏观块上限（覆盖大地图整行扫描及热点区且控制内存）
const CHUNK_CACHE_MAX = IS_TOUCH ? 80 : 130;
const DECO_CACHE_MAX = 4096;
const GRASS_CACHE_MAX = 1024;
const HALO_LAND = 68;               // 海岸噪声扰动(58) + 水深二次模糊(10)
const HALO_CLIM = 28;               // 气候区二次模糊(14+14)
const ZERO_F32 = new Float32Array(MSTRIDE * MSTRIDE);
const SEA_DEPTH = new Float32Array(MSTRIDE * MSTRIDE).fill(0.02);
const ZERO_U8 = new Uint8Array(MSTRIDE * MSTRIDE);

interface MacroTile {
  tx: number; ty: number;
  allSea: boolean;
  land: Float32Array; depth: Float32Array;
  elev: Float32Array; arid: Float32Array; cold: Float32Array; forest: Float32Array;
  riverMask: Uint8Array; roadMask: Uint8Array;
}

export interface Sample { land: number; elev: number; arid: number; cold: number; forest: number; depth: number }

export interface ImgDeco { kind: 'img'; img: HTMLCanvasElement; x: number; y: number; w: number; h: number; flip: boolean; alpha: number }
export interface TreeDeco { kind: 'tree'; sp: Species; v: number; x: number; y: number; w: number; h: number; s: number; flip: boolean; ph: number; lod: number }
export interface MtnDeco { kind: 'mtn'; id: string; spec: MtnSpec; x: number; y: number; w: number; h: number; flip: boolean }
/** 第十九步：瀑布（崖壁精灵 + 逐帧水练） */
export interface FallDeco { kind: 'fall'; id: string; x: number; y: number; w: number; h: number; seed: number; tiers: number; name?: string }
export type Deco = ImgDeco | TreeDeco | MtnDeco | FallDeco;
const GROVE_MIX: Species[] = ['peach', 'peach', 'peach', 'peach', 'peach', 'peach', 'peach', 'peach', 'peach', 'apricot', 'apricot', 'apricot', 'apricot', 'apricot', 'apricot', 'plum', 'plum', 'plum', 'maple', 'maple'];
const GVC = 2600, FC = 3000;
/** 草丛（实时绘制，见 gfx/grass.ts） */
export interface Clump { x: number; y: number; kind: GrassKind; v: number; s: number; ph: number; lod: number }
export const TREE_VARIANTS = 24;
const DEMON_SECTS = ['tianmo', 'guiling', 'yuling', 'tiansha', 'yinluo', 'hehuan', 'qianhuan', ...X_DEMON];
const GRASS_TOWNS = LOCATIONS.filter((l) => l.type === 'city' || l.type === 'town');

export interface Chunk { cx: number; cy: number; canvas: HTMLCanvasElement; used: number; season: number }

function boxBlur(src: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  const k = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[y * w + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = s / k;
      s += src[y * w + clamp(x + r + 1, 0, w - 1)] - src[y * w + clamp(x - r, 0, w - 1)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / k;
      s += tmp[clamp(y + r + 1, 0, h - 1) * w + x] - tmp[clamp(y - r, 0, h - 1) * w + x];
    }
  }
  return out;
}

function segDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  const ex = px - (ax + dx * t), ey = py - (ay + dy * t);
  return ex * ex + ey * ey;
}

function polyEdgeDistSq(x: number, y: number, pts: P[]) {
  let d2 = 1e18;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const dd = segDistSq(x, y, pts[j][0], pts[j][1], pts[i][0], pts[i][1]);
    if (dd < d2) d2 = dd;
  }
  return d2;
}

class FastNoise2D {
  private lx = NaN;
  private ly = NaN;
  private a = 0;
  private b = 0;
  private c = 0;
  private d = 0;
  constructor(private readonly seed: number) {}
  eval(x: number, y: number): number {
    const xi = Math.floor(x), yi = Math.floor(y);
    if (xi !== this.lx || yi !== this.ly) {
      this.lx = xi; this.ly = yi;
      const s = this.seed;
      this.a = hash2(xi, yi, s);
      this.b = hash2(xi + 1, yi, s);
      this.c = hash2(xi, yi + 1, s);
      this.d = hash2(xi + 1, yi + 1, s);
    }
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = this.a, b = this.b, c = this.c, d = this.d;
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
}

class FastFbm3 {
  private readonly n0: FastNoise2D;
  private readonly n1: FastNoise2D;
  private readonly n2: FastNoise2D;
  constructor(seed: number) {
    this.n0 = new FastNoise2D(seed);
    this.n1 = new FastNoise2D(seed + 17);
    this.n2 = new FastNoise2D(seed + 34);
  }
  eval(x: number, y: number): number {
    let s = 0.5 * this.n0.eval(x, y);
    s += 0.25 * this.n1.eval(x * 2.03, y * 2.03);
    s += 0.125 * this.n2.eval(x * 4.1209, y * 4.1209);
    return s / 0.875;
  }
}

const FN_LAND_WX = new FastFbm3(11);
const FN_LAND_WY = new FastFbm3(29);
const FN_LAND_BX0 = new FastFbm3(53);
const FN_LAND_BX1 = new FastFbm3(71);
const FN_LAND_BY0 = new FastFbm3(59);
const FN_LAND_BY1 = new FastFbm3(73);
const FN_LAND_SURF = new FastNoise2D(5);
const FN_ELEV_RIDGE = new FastNoise2D(3);
const FN_ELEV_N = new FastFbm3(7);
const FN_ZONE_QX = new FastFbm3(61);
const FN_ZONE_QXV = new FastNoise2D(63);
const FN_ZONE_QY = new FastFbm3(67);
const FN_ZONE_QYV = new FastNoise2D(69);
const FN_FOREST = new FastFbm3(41);

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

// Catmull-Rom 平滑 + 噪声扰动，让河流自然弯曲
function smoothLine(pts: P[], seed: number, jitter: number): P[] {
  const out: P[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(4, Math.ceil(len / 1.5));
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      const n = (valueNoise(x * 0.15, y * 0.15, seed) - 0.5) * jitter;
      out.push([x + n, y - n * 0.6]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export class Terrain {
  W = MACRO_W; H = MACRO_H;
  ready = false;
  islands: { x: number; y: number; r: number }[] = [];
  rivers: { pts: P[]; w: number }[] = [];
  chunks = new Map<string, Chunk>();
  decoCache = new Map<string, { d: Deco[]; used: number }>();
  grassCache = new Map<string, { d: Clump[]; used: number }>();
  fgGrassCache = new Map<string, { d: Clump[]; used: number }>();
  /** 当前季节（0 春 1 夏 2 秋 3 冬）：底图随之重烘焙 */
  season = 1;
  locZones: { x: number; y: number; rx: number; ry: number; id: string }[] = [];
  waveGlyph?: HTMLCanvasElement;
  grassGlyph?: HTMLCanvasElement;
  rockGlyphs: HTMLCanvasElement[] = [];
  reedGlyph?: HTMLCanvasElement;
  shrubGlyph?: HTMLCanvasElement; yurtGlyph?: HTMLCanvasElement;
  roads: { pts: P[]; major: boolean }[] = [];
  frame = 0;
  /** 树木密度抽稀（0 = 不生成树，1 = 全部；2~8 按坐标哈希取子集），随设置面板持久化 */
  _treeStride?: number;
  /** 树草缓存版本，供渲染列表和块统计作废。 */
  decoRevision = 0;

  // 流式宏观块缓存（按 256×256 宏观块按需生成 + LRU 淘汰，彻底摆脱全图 W×H 内存与 4096 纹理限制）
  private macroCache = new Map<number, MacroTile>();
  private macroCacheLimit = MTILE_CACHE_MAX;
  private lastMacroKey = -1;
  private lastMacroTile: MacroTile | null = null;
  private warpQx = new Float32Array((MSTRIDE + HALO_CLIM * 2) * (MSTRIDE + HALO_CLIM * 2));
  private warpQy = new Float32Array((MSTRIDE + HALO_CLIM * 2) * (MSTRIDE + HALO_CLIM * 2));
  private warpStamp = new Int32Array((MSTRIDE + HALO_CLIM * 2) * (MSTRIDE + HALO_CLIM * 2));
  private warpEpoch = 0;
  private mainlandBB: [number, number, number, number] | null = null;
  private islandBoxes: { x: number; y: number; r: number; pad: number }[] = [];
  private rangeBoxes: number[][] = [];
  private aridBoxes: [number, number, number, number][] = [];
  private coldBoxes: [number, number, number, number][] = [];
  private forestBoxes: [number, number, number, number][] = [];
  private riverBoxes: [number, number, number, number][] = [];
  private roadBoxes: [number, number, number, number][] = [];
  private tileCvRaw?: HTMLCanvasElement;
  private tileCtxRaw?: CanvasRenderingContext2D;
  private tileCvMask?: HTMLCanvasElement;
  private tileCtxMask?: CanvasRenderingContext2D;
  overviewScale = 1;

  constructor() {
    const gg = globalThis as any;
    if (gg) gg.__terrains = [...(gg.__terrains ?? []).slice(-3), this];
  }

  /** 当前树木密度（0~8）：设置优先，其次实例缓存，最后 localStorage / 默认 1（全部） */
  private treeStride(): number {
    const g = (globalThis as any).__treeDensity;
    if (Number.isFinite(g)) return Math.max(0, Math.min(8, Math.round(g)));
    if (this._treeStride !== undefined) return this._treeStride;
    let saved = NaN;
    try { const raw = localStorage.getItem('fanren.treeDensity'); saved = raw === null ? NaN : Number(raw); } catch { /* */ }
    this._treeStride = Number.isFinite(saved) && saved >= 0 ? Math.min(8, Math.round(saved)) : 5;   // 默认 20% 密度（stride 5）
    return this._treeStride;
  }
  /** 设置面板改密度：清掉已生成 chunk 的树/草缓存，下次取块按新密度重建 */
  applyTreeDensity(v: number) {
    this._treeStride = Math.max(0, Math.min(8, Math.round(v)));
    this.decoCache.clear();
    this.grassCache.clear();
    this.fgGrassCache.clear();
    this.decoRevision++;
  }

  private polyBox(pts: P[], pad = 0): [number, number, number, number] {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  }

  private trimMacroCache(limit = MTILE_CACHE_MAX) {
    this.macroCacheLimit = limit;
    while (this.macroCache.size > limit) {
      const oldest = this.macroCache.keys().next().value!;
      this.macroCache.delete(oldest);
      if (oldest === this.lastMacroKey) { this.lastMacroKey = -1; this.lastMacroTile = null; }
    }
  }

  private buildInitStep() {
    const fullTiles = Math.ceil(this.W / MTILE) * Math.ceil(this.H / MTILE);
    this.macroCacheLimit = Math.max(MTILE_CACHE_MAX, Math.min(256, fullTiles));
    this.macroCache.clear();
    this.lastMacroKey = -1;
    this.lastMacroTile = null;
    this.roadSegs = null;
    this.zoneById.clear();

    // ---------- 1. 岛屿列表（矢量圆）与几何包围盒索引 ----------
    const rnd = mulberry32(20261014);
    this.islands = [];
    for (const loc of LOCATIONS) if (loc.island) this.islands.push({ x: loc.x, y: loc.y, r: loc.island });
    const F = ISLAND_FIELD;
    let tries = 0;
    const n0 = this.islands.length;
    if (F) {
      const fw = F.x1 - F.x0, fh = F.y1 - F.y0;
      const cores: { x: number; y: number; s: number }[] = this.islands.filter((o) => o.r >= 9).map((o) => ({ x: o.x, y: o.y, s: o.r * 3.2 }));
      for (let i = 0; i < 30; i++) cores.push({ x: F.x0 + rnd() * fw, y: F.y0 + rnd() * fh, s: 14 + rnd() * 26 });
      const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
      while (this.islands.length < F.count + n0 && tries++ < F.count * 20) {
        let x: number, y: number;
        if (rnd() < 0.82) { const c = cores[Math.floor(rnd() * cores.length)]; const a = rnd() * Math.PI * 2, d = Math.abs(gauss()) * c.s * 1.6; x = c.x + Math.cos(a) * d * 1.25; y = c.y + Math.sin(a) * d * 0.85; }
        else { x = F.x0 + rnd() * fw; y = F.y0 + rnd() * fh; }
        if (x < F.x0 || x > F.x1 || y < F.y0 || y > F.y1 || pointInPoly(x, y, MAINLAND)) continue;
        const outer = (x - F.x0) / fw > 0.78;
        if (outer && rnd() < 0.55) continue;
        const r = (1.1 + Math.pow(rnd(), 2.6) * (outer ? 4.5 : 6.5)) * ISLAND_K;
        if (this.islands.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 1.6)) continue;
        this.islands.push({ x, y, r });
      }
    }
    for (const E of EXTRA_ISLANDS) for (let i = 0; i < E.n; i++) {
      const x = E.x0 + rnd() * (E.x1 - E.x0), y = E.y0 + rnd() * (E.y1 - E.y0);
      if (!pointInPoly(x, y, MAINLAND)) this.islands.push({ x, y, r: E.r0 + rnd() * (E.r1 - E.r0) });
    }
    this.islandBoxes = this.islands.map((is) => ({ x: is.x, y: is.y, r: is.r, pad: Math.max(is.r * 1.9 + 6, 12) }));

    // 主大陆包围盒
    if (MAINLAND.length > 2 || LAKES.length || LAKE_ISLES.length) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const [x, y] of MAINLAND) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
      for (const l of LAKES) { x0 = Math.min(x0, l.c[0] - l.r); y0 = Math.min(y0, l.c[1] - l.r); x1 = Math.max(x1, l.c[0] + l.r); y1 = Math.max(y1, l.c[1] + l.r); }
      for (const l of LAKE_ISLES) { x0 = Math.min(x0, l.c[0] - l.r); y0 = Math.min(y0, l.c[1] - l.r); x1 = Math.max(x1, l.c[0] + l.r); y1 = Math.max(y1, l.c[1] + l.r); }
      this.mainlandBB = [x0 - 4, y0 - 4, x1 + 4, y1 + 4];
    } else {
      this.mainlandBB = null;
    }

    // 山脉与气候区包围盒
    this.rangeBoxes = RANGES.map((r) => this.polyBox(r.pts, r.w * 1.4));
    const A = 46;
    this.aridBoxes = ARID_ZONES.map((z) => this.polyBox(z.pts, A + 2));
    this.coldBoxes = COLD_ZONES.map((z) => this.polyBox(z.pts, A + 2));
    this.forestBoxes = FOREST_ZONES.map((z) => this.polyBox(z.pts, A + 2));
  }

  private ensureLocOnLand(l: (typeof LOCATIONS)[number]) {
    if (l.island || this.landAtMacro(l.x, l.y) > 0.6) return;
    let done = false;
    for (let r = 1; r < 40 && !done; r += 1) for (let a = 0; a < 16; a++) {
      const qx = l.x + Math.cos(a / 16 * Math.PI * 2) * r, qy = l.y + Math.sin(a / 16 * Math.PI * 2) * r;
      if (this.landAtMacro(qx, qy) > 0.75 && this.landAtMacro(qx + 3, qy) > 0.6 && this.landAtMacro(qx - 3, qy) > 0.6) { l.x = qx; l.y = qy; done = true; break; }
    }
  }

  private buildRiversAndRoadsStep() {
    this.rivers = RIVERS.map((r, i) => ({ pts: smoothLine(r.pts, 100 + i, 3.2), w: r.w }));
    this.riverBoxes = this.rivers.map((r) => this.polyBox(r.pts, r.w * 0.8 + 8));
    this.roadBoxes = [];
    this.buildRoads();
    this.roadBoxes = this.roads.map((r) => this.polyBox(r.pts, 4));
    this.buildSegs();

    // 仅为已缓存块补填 riverMask / roadMask（保留已算好的 land/elev/气候缓存，免重复重算）
    for (const tile of this.macroCache.values()) {
      const gx0 = tile.tx * MTILE, gy0 = tile.ty * MTILE, gx1 = gx0 + MSTRIDE - 1, gy1 = gy0 + MSTRIDE - 1;
      const lr = this.rivers.filter((_, i) => this.boxOverlap(this.riverBoxes[i], gx0 - 2, gy0 - 2, gx1 + 2, gy1 + 2));
      const ld = this.roads.filter((_, i) => this.boxOverlap(this.roadBoxes[i], gx0 - 2, gy0 - 2, gx1 + 2, gy1 + 2));
      if (!lr.length && !ld.length) continue;
      if (tile.allSea) {
        const k = tile.ty * 4096 + tile.tx;
        this.macroCache.delete(k);
        if (k === this.lastMacroKey) { this.lastMacroKey = -1; this.lastMacroTile = null; }
        continue;
      }
      const masks = this.rasterizeMasks(gx0, gy0, lr, ld);
      tile.riverMask = masks.riverMask;
      tile.roadMask = masks.roadMask;
    }

    setLayoutEnv((l) => {
      const ox = l.x * WORLD_SCALE, oy = l.y * WORLD_SCALE, sm = this.sample(ox, oy);
      return { site: (x: number, y: number) => this.isLand(ox + x, oy + y) && this.riverEdge(ox + x, oy + y) > 50, cold: sm.cold, arid: sm.arid };
    });
  }

  private buildLocZone(l: (typeof LOCATIONS)[number]) {
    const L = getLayout(l);
    return { x: l.x * WORLD_SCALE, y: l.y * WORLD_SCALE, rx: L.gw * LOC_SCALE * 0.42, ry: L.gh * LOC_SCALE * 0.42, id: l.id };
  }

  build(keepCache = false) {
    try {
      this.buildInitStep();
      for (const l of LOCATIONS) this.ensureLocOnLand(l);
      this.buildRiversAndRoadsStep();
      this.locZones = LOCATIONS.map((l) => this.buildLocZone(l));
      for (const z of this.locZones) this.zoneById.set(z.id, z);
      this.makeGlyphs();
      this.ready = true;
    } finally {
      if (!keepCache) this.trimMacroCache(MTILE_CACHE_MAX);
    }
  }

  /** 分片异步建图（供浏览器端启动/跨界切图使用，避免长同步计算阻塞主线程） */
  async buildAsync(onProgress?: (frac: number) => void, keepCache = false) {
    const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0));
    try {
      this.buildInitStep();
      let tSlice = performance.now();
      const totalLocs = Math.max(1, LOCATIONS.length);
      for (let i = 0; i < LOCATIONS.length; i++) {
        this.ensureLocOnLand(LOCATIONS[i]);
        if ((i & 7) === 7 && performance.now() - tSlice >= 48) {
          onProgress?.(0.62 * (i / totalLocs));
          await yieldFrame();
          tSlice = performance.now();
        }
      }
      onProgress?.(0.65);
      await yieldFrame();
      this.buildRiversAndRoadsStep();
      onProgress?.(0.78);
      await yieldFrame();
      tSlice = performance.now();
      this.locZones = new Array(LOCATIONS.length);
      for (let i = 0; i < LOCATIONS.length; i++) {
        const z = this.buildLocZone(LOCATIONS[i]);
        this.locZones[i] = z;
        this.zoneById.set(z.id, z);
        if ((i & 15) === 15 && performance.now() - tSlice >= 48) {
          onProgress?.(0.78 + 0.2 * (i / totalLocs));
          await yieldFrame();
          tSlice = performance.now();
        }
      }
      this.makeGlyphs();
      this.ready = true;
      onProgress?.(1);
    } finally {
      if (!keepCache) this.trimMacroCache(MTILE_CACHE_MAX);
    }
  }

  private getMacroTile(tx: number, ty: number): MacroTile {
    const maxTx = Math.max(0, Math.ceil(this.W / MTILE) - 1);
    const maxTy = Math.max(0, Math.ceil(this.H / MTILE) - 1);
    tx = clamp(tx, 0, maxTx);
    ty = clamp(ty, 0, maxTy);
    const key = ty * 4096 + tx;
    if (key === this.lastMacroKey && this.lastMacroTile) return this.lastMacroTile;
    const hit = this.macroCache.get(key);
    if (hit) {
      this.macroCache.delete(key);
      this.macroCache.set(key, hit);
      this.lastMacroKey = key;
      this.lastMacroTile = hit;
      return hit;
    }
    const tile = this.buildMacroTile(tx, ty);
    this.macroCache.set(key, tile);
    if (this.macroCache.size > this.macroCacheLimit) {
      const oldest = this.macroCache.keys().next().value!;
      this.macroCache.delete(oldest);
      if (oldest === this.lastMacroKey) { this.lastMacroKey = -1; this.lastMacroTile = null; }
    }
    this.lastMacroKey = key;
    this.lastMacroTile = tile;
    return tile;
  }

  private boxOverlap(a: [number, number, number, number], bx0: number, by0: number, bx1: number, by1: number) {
    return a[2] >= bx0 && a[0] <= bx1 && a[3] >= by0 && a[1] <= by1;
  }

  private buildMacroTile(tx: number, ty: number): MacroTile {
    const gx0 = tx * MTILE, gy0 = gyStart(ty), S = MSTRIDE, SN = S * S;
    function gyStart(t: number) { return t * MTILE; }
    const gx1 = gx0 + S - 1, gy1 = gy0 + S - 1;
    const W = this.W, H = this.H;

    // 1. 判定是否为纯深海快速块（无大陆、无岛、无山脉、无气候区、无河路）
    const hitsMain = !!(this.mainlandBB && this.boxOverlap(this.mainlandBB, gx0 - HALO_LAND, gy0 - HALO_LAND, gx1 + HALO_LAND, gy1 + HALO_LAND));
    const localIslands = this.islandBoxes.filter((is) =>
      is.x + is.pad >= gx0 - HALO_LAND && is.x - is.pad <= gx1 + HALO_LAND &&
      is.y + is.pad >= gy0 - HALO_LAND && is.y - is.pad <= gy1 + HALO_LAND);
    const localRanges: number[] = [];
    for (let i = 0; i < this.rangeBoxes.length; i++) {
      const bb = this.rangeBoxes[i];
      if (bb[2] >= gx0 && bb[0] <= gx1 && bb[3] >= gy0 && bb[1] <= gy1) localRanges.push(i);
    }
    const hitsArid = this.aridBoxes.some((b) => this.boxOverlap(b, gx0 - HALO_CLIM, gy0 - HALO_CLIM, gx1 + HALO_CLIM, gy1 + HALO_CLIM));
    const hitsCold = this.coldBoxes.some((b) => this.boxOverlap(b, gx0 - HALO_CLIM, gy0 - HALO_CLIM, gx1 + HALO_CLIM, gy1 + HALO_CLIM));
    const hitsForest = this.forestBoxes.some((b) => this.boxOverlap(b, gx0 - HALO_CLIM, gy0 - HALO_CLIM, gx1 + HALO_CLIM, gy1 + HALO_CLIM));
    const localRivers = this.riverBoxes.length === this.rivers.length ? this.rivers.filter((_, i) => this.boxOverlap(this.riverBoxes[i], gx0 - 2, gy0 - 2, gx1 + 2, gy1 + 2)) : [];
    const localRoads = this.roadBoxes.length === this.roads.length ? this.roads.filter((_, i) => this.boxOverlap(this.roadBoxes[i], gx0 - 2, gy0 - 2, gx1 + 2, gy1 + 2)) : [];

    if (!hitsMain && localIslands.length === 0 && localRanges.length === 0 && !hitsArid && !hitsCold && !hitsForest && localRivers.length === 0 && localRoads.length === 0) {
      const land = new Float32Array(SN);
      for (let ly = 0; ly < S; ly++) {
        const y = Math.min(H - 1, gy0 + ly);
        const row = ly * S;
        for (let lx = 0; lx < S; lx++) {
          const x = Math.min(W - 1, gx0 + lx);
          land[row + lx] = clamp((valueNoise(x * 0.18, y * 0.18, 5) - 0.5) * 0.25, 0, 1);
        }
      }
      return {
        tx, ty, allSea: true,
        land, depth: SEA_DEPTH, elev: ZERO_F32, arid: ZERO_F32, cold: ZERO_F32, forest: ZERO_F32,
        riverMask: ZERO_U8, roadMask: ZERO_U8,
      };
    }

    // 2. 局部带边缘光栅化 land0 / isle0
    const S_RAW = S + 2 * HALO_LAND;
    if (!this.tileCvRaw) {
      this.tileCvRaw = document.createElement('canvas');
      this.tileCvRaw.width = this.tileCvRaw.height = S_RAW;
      this.tileCtxRaw = this.tileCvRaw.getContext('2d', { willReadFrequently: true })!;
    }
    const g = this.tileCtxRaw!;
    const oxRaw = gx0 - HALO_LAND, oyRaw = gy0 - HALO_LAND;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000'; g.fillRect(0, 0, S_RAW, S_RAW);
    g.translate(-oxRaw, -oyRaw);
    if (hitsMain) {
      g.fillStyle = '#f00';
      if (MAINLAND.length > 2) { g.beginPath(); MAINLAND.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); }
      g.fillStyle = '#000';
      for (const l of LAKES) { g.beginPath(); g.arc(l.c[0], l.c[1], l.r, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#f00'; for (const l of LAKE_ISLES) { g.beginPath(); g.arc(l.c[0], l.c[1], l.r, 0, Math.PI * 2); g.fill(); }
    }
    if (localIslands.length) {
      g.globalCompositeOperation = 'lighter'; g.fillStyle = '#0f0';
      for (const is of localIslands) {
        const h = hashU(Math.round(is.x * 7), Math.round(is.y * 7), 77);
        let q = h; const r1 = () => { q = (q * 1664525 + 1013904223) >>> 0; return q / 4294967296; };
        const rot = r1() * Math.PI, el = 0.55 + r1() * 0.45;
        g.beginPath(); g.ellipse(is.x, is.y, is.r * (0.85 + r1() * 0.3), is.r * el, rot, 0, Math.PI * 2); g.fill();
        const k = is.r > 2.5 ? 3 + Math.floor(r1() * 4) : 1;
        for (let j = 0; j < k; j++) {
          const a = rot + (r1() - 0.5) * 2.2 + (j % 2 ? Math.PI : 0), d = is.r * (0.45 + r1() * 0.5), rr = is.r * (0.28 + r1() * 0.4);
          g.beginPath(); g.ellipse(is.x + Math.cos(a) * d, is.y + Math.sin(a) * d * 0.8, rr, rr * (0.5 + r1() * 0.5), a, 0, Math.PI * 2); g.fill();
        }
      }
      g.globalCompositeOperation = 'source-over';
    }
    const raw = g.getImageData(0, 0, S_RAW, S_RAW).data;
    const rawN = S_RAW * S_RAW;
    const land0 = new Float32Array(rawN), isle0 = new Float32Array(rawN);
    for (let i = 0; i < rawN; i++) { land0[i] = raw[i * 4] / 255; isle0[i] = raw[i * 4 + 1] / 255; }

    // 前缀和快速跳过深海/内陆腹地
    const PW = S_RAW + 1;
    const prefNonZero = new Int32Array(PW * (S_RAW + 1));
    const prefNotOne = new Int32Array(PW * (S_RAW + 1));
    for (let y = 0; y < S_RAW; y++) {
      let rowNZ = 0, rowNO = 0;
      const yOff = y * S_RAW, pCur = (y + 1) * PW, pPrev = y * PW;
      for (let x = 0; x < S_RAW; x++) {
        const i = yOff + x;
        if (land0[i] > 0 || isle0[i] > 0) rowNZ++;
        if (land0[i] < 1) rowNO++;
        prefNonZero[pCur + x + 1] = prefNonZero[pPrev + x + 1] + rowNZ;
        prefNotOne[pCur + x + 1] = prefNotOne[pPrev + x + 1] + rowNO;
      }
    }
    const sampRaw = (src: Float32Array, gx: number, gy: number) => {
      const cx = clamp(gx, 0, W - 1.001) - oxRaw;
      const cy = clamp(gy, 0, H - 1.001) - oyRaw;
      const lx = clamp(cx, 0, S_RAW - 1.001), ly = clamp(cy, 0, S_RAW - 1.001);
      const xi = lx | 0, yi = ly | 0, fx = lx - xi, fy = ly - yi, i = yi * S_RAW + xi;
      const a = src[i], b = src[i + 1], c = src[i + S_RAW], d = src[i + S_RAW + 1];
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };

    // 3. 海岸扰动 land（带 M_DEP = 10 边缘用于二次 5 格水深模糊）
    const M_DEP = 10, S_DEP = S + 2 * M_DEP, PAD = 58;
    const landPad = new Float32Array(S_DEP * S_DEP);
    for (let by0 = 0; by0 < S_DEP; by0 += 16) {
      const by1 = Math.min(S_DEP - 1, by0 + 15);
      const gyMin = clamp(gy0 - M_DEP + by0, 0, H - 1), gyMax = clamp(gy0 - M_DEP + by1, 0, H - 1);
      const by0R = Math.max(0, gyMin - oyRaw - PAD), by1R = Math.min(S_RAW, gyMax - oyRaw + PAD + 1);
      const br0 = by0R * PW, br1 = by1R * PW;
      for (let bx0 = 0; bx0 < S_DEP; bx0 += 16) {
        const bx1 = Math.min(S_DEP - 1, bx0 + 15);
        const gxMin = clamp(gx0 - M_DEP + bx0, 0, W - 1), gxMax = clamp(gx0 - M_DEP + bx1, 0, W - 1);
        const bx0R = Math.max(0, gxMin - oxRaw - PAD), bx1R = Math.min(S_RAW, gxMax - oxRaw + PAD + 1);
        if (prefNonZero[br1 + bx1R] - prefNonZero[br0 + bx1R] - prefNonZero[br1 + bx0R] + prefNonZero[br0 + bx0R] === 0) {
          for (let py = by0; py <= by1; py++) {
            const gy = clamp(gy0 - M_DEP + py, 0, H - 1), pRow = py * S_DEP;
            for (let px = bx0; px <= bx1; px++) {
              const gx = clamp(gx0 - M_DEP + px, 0, W - 1);
              const v = (FN_LAND_SURF.eval(gx * 0.18, gy * 0.18) - 0.5) * 0.25;
              landPad[pRow + px] = v < 0 ? 0 : v > 1 ? 1 : v;
            }
          }
        } else if (prefNotOne[br1 + bx1R] - prefNotOne[br0 + bx1R] - prefNotOne[br1 + bx0R] + prefNotOne[br0 + bx0R] === 0) {
          for (let py = by0; py <= by1; py++) {
            const gy = clamp(gy0 - M_DEP + py, 0, H - 1), pRow = py * S_DEP;
            for (let px = bx0; px <= bx1; px++) {
              const gx = clamp(gx0 - M_DEP + px, 0, W - 1);
              const v = 1 + (FN_LAND_SURF.eval(gx * 0.18, gy * 0.18) - 0.5) * 0.25;
              landPad[pRow + px] = v < 0 ? 0 : v > 1 ? 1 : v;
            }
          }
        } else {
          for (let py = by0; py <= by1; py++) {
            const gy = clamp(gy0 - M_DEP + py, 0, H - 1);
            const ry = gy - oyRaw;
            const y0 = Math.max(0, ry - PAD), y1 = Math.min(S_RAW, ry + PAD + 1);
            const r0 = y0 * PW, r1 = y1 * PW, pRow = py * S_DEP;
            for (let px = bx0; px <= bx1; px++) {
              const gx = clamp(gx0 - M_DEP + px, 0, W - 1);
              const rx = gx - oxRaw;
              const x0 = Math.max(0, rx - PAD), x1 = Math.min(S_RAW, rx + PAD + 1);
              let v: number;
              if (prefNonZero[r1 + x1] - prefNonZero[r0 + x1] - prefNonZero[r1 + x0] + prefNonZero[r0 + x0] === 0) {
                v = 0;
              } else if (prefNotOne[r1 + x1] - prefNotOne[r0 + x1] - prefNotOne[r1 + x0] + prefNotOne[r0 + x0] === 0) {
                v = 1;
              } else {
                const wx = (FN_LAND_WX.eval(gx * 0.022, gy * 0.022) - 0.5) * 16;
                const wy = (FN_LAND_WY.eval(gx * 0.022, gy * 0.022) - 0.5) * 16;
                const bx = (FN_LAND_BX0.eval(gx * 0.008, gy * 0.008) - 0.5) * 70 + (FN_LAND_BX1.eval(gx * 0.04, gy * 0.04) - 0.5) * 26;
                const by = (FN_LAND_BY0.eval(gx * 0.008, gy * 0.008) - 0.5) * 70 + (FN_LAND_BY1.eval(gx * 0.04, gy * 0.04) - 0.5) * 26;
                v = Math.max(sampRaw(land0, gx + wx + bx, gy + wy + by), sampRaw(isle0, gx + wx * 0.35, gy + wy * 0.35));
              }
              v += (FN_LAND_SURF.eval(gx * 0.18, gy * 0.18) - 0.5) * 0.25;
              landPad[pRow + px] = v < 0 ? 0 : v > 1 ? 1 : v;
            }
          }
        }
      }
    }
    const depthPad = boxBlur(boxBlur(landPad, S_DEP, S_DEP, 5), S_DEP, S_DEP, 5);
    const land = new Float32Array(SN), depth = new Float32Array(SN);
    for (let ly = 0; ly < S; ly++) {
      const sOff = (ly + M_DEP) * S_DEP + M_DEP, dOff = ly * S;
      for (let lx = 0; lx < S; lx++) {
        land[dOff + lx] = landPad[sOff + lx];
        depth[dOff + lx] = depthPad[sOff + lx];
      }
    }

    // 4. 海岛高度与山脉海拔 elev
    if (!this.tileCvMask) {
      this.tileCvMask = document.createElement('canvas');
      this.tileCvMask.width = this.tileCvMask.height = S;
      this.tileCtxMask = this.tileCvMask.getContext('2d', { willReadFrequently: true })!;
    }
    const mg = this.tileCtxMask!;
    let isleRaw: Uint8ClampedArray | null = null;
    if (localIslands.length) {
      mg.setTransform(1, 0, 0, 1, 0, 0);
      mg.fillStyle = '#000'; mg.fillRect(0, 0, S, S);
      mg.translate(-gx0, -gy0);
      for (const is of localIslands) {
        const rg = mg.createRadialGradient(is.x, is.y, 0, is.x, is.y, is.r);
        const peak = is.r > 7 ? 0.6 : 0.38;
        rg.addColorStop(0, `rgba(255,255,255,${peak})`); rg.addColorStop(1, 'rgba(255,255,255,0)');
        mg.fillStyle = rg; mg.beginPath(); mg.arc(is.x, is.y, is.r, 0, Math.PI * 2); mg.fill();
      }
      isleRaw = mg.getImageData(0, 0, S, S).data;
    }
    const elev = new Float32Array(SN);
    for (let ly = 0; ly < S; ly++) {
      const y = Math.min(H - 1, gy0 + ly), row = ly * S;
      for (let lx = 0; lx < S; lx++) {
        const i = row + lx;
        if (land[i] < 0.3) continue;
        const x = Math.min(W - 1, gx0 + lx);
        let ridge = 0;
        for (let k0 = 0; k0 < localRanges.length; k0++) {
          const ri = localRanges[k0], bb = this.rangeBoxes[ri];
          if (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3]) continue;
          const r = RANGES[ri];
          let d = 1e9;
          for (let k = 0; k < r.pts.length - 1; k++) {
            const [ax, ay] = r.pts[k], [bx, by] = r.pts[k + 1];
            d = Math.min(d, segDist(x, y, ax, ay, bx, by));
          }
          if (d > r.w * 1.3) continue;
          const half = r.w * (0.7 + 0.6 * FN_ELEV_RIDGE.eval(x * 0.05, y * 0.05));
          if (d < half) ridge = Math.max(ridge, r.h * Math.pow(1 - d / half, 1.3));
        }
        const n = FN_ELEV_N.eval(x * 0.04, y * 0.04);
        const hills = Math.max(0, n - 0.55) * 1.1;
        const isle = isleRaw ? isleRaw[i * 4] / 255 : 0;
        elev[i] = clamp(ridge * (0.65 + 0.7 * n) + hills + isle, 0, 1.2) * clamp((land[i] - 0.3) * 3, 0, 1);
      }
    }

    // 5. 气候区域（arid / cold / forest），局部带边缘模糊，与全局一致
    // 同一宏观块内 arid/cold/forest 共用同一坐标扰动 (qx, qy)，且按 16×16 分块做多边形距离裁剪（纯外/纯内块零噪声）
    const W_STRIDE = S + 2 * HALO_CLIM;
    const warpEpoch = ++this.warpEpoch;
    const wQx = this.warpQx, wQy = this.warpQy, wSt = this.warpStamp;
    const evalZoneTile = (zones: { pts: P[]; v: number }[], boxes: [number, number, number, number][], blur: number) => {
      const M = blur * 2, SZ = S + 2 * M, padDiff = HALO_CLIM - M;
      const a = new Float32Array(SZ * SZ);
      let any = false, anyHit = false;
      for (let zi = 0; zi < zones.length; zi++) {
        const bb = boxes[zi];
        if (!this.boxOverlap(bb, gx0 - M, gy0 - M, gx1 + M, gy1 + M)) continue;
        any = true;
        const z = zones[zi], zv = z.v, pts = z.pts;
        const py0 = Math.max(0, Math.floor(bb[1]) - (gy0 - M)), py1 = Math.min(SZ - 1, Math.ceil(bb[3]) - (gy0 - M));
        const px0 = Math.max(0, Math.floor(bb[0]) - (gx0 - M)), px1 = Math.min(SZ - 1, Math.ceil(bb[2]) - (gx0 - M));
        for (let by0 = py0; by0 <= py1; by0 += 16) {
          const by1 = Math.min(py1, by0 + 15);
          const gMinY = clamp(gy0 - M + by0, 0, H - 1), gMaxY = clamp(gy0 - M + by1, 0, H - 1);
          for (let bx0 = px0; bx0 <= px1; bx0 += 16) {
            const bx1 = Math.min(px1, bx0 + 15);
            const gMinX = clamp(gx0 - M + bx0, 0, W - 1), gMaxX = clamp(gx0 - M + bx1, 0, W - 1);
            if (gMaxX < bb[0] || gMinX > bb[2] || gMaxY < bb[1] || gMinY > bb[3]) continue;
            const cx = (gMinX + gMaxX) * 0.5, cy = (gMinY + gMaxY) * 0.5;
            const safeR = 120.5 + Math.hypot(gMaxX - gMinX, gMaxY - gMinY) * 0.5;
            if (polyEdgeDistSq(cx, cy, pts) > safeR * safeR) {
              if (!pointInPoly(cx, cy, pts)) continue;
              const fullBox = gMinX >= bb[0] && gMaxX <= bb[2] && gMinY >= bb[1] && gMaxY <= bb[3];
              for (let py = by0; py <= by1; py++) {
                const gy = clamp(gy0 - M + py, 0, H - 1);
                if (!fullBox && (gy < bb[1] || gy > bb[3])) continue;
                const row = py * SZ;
                for (let px = bx0; px <= bx1; px++) {
                  const gx = clamp(gx0 - M + px, 0, W - 1);
                  if (!fullBox && (gx < bb[0] || gx > bb[2])) continue;
                  if (zv > a[row + px]) a[row + px] = zv;
                  anyHit = true;
                }
              }
              continue;
            }
            for (let py = by0; py <= by1; py++) {
              const gy = clamp(gy0 - M + py, 0, H - 1);
              if (gy < bb[1] || gy > bb[3]) continue;
              const row = py * SZ, wRow = (py + padDiff) * W_STRIDE + padDiff;
              for (let px = bx0; px <= bx1; px++) {
                const gx = clamp(gx0 - M + px, 0, W - 1);
                if (gx < bb[0] || gx > bb[2]) continue;
                const wi = wRow + px;
                let qx: number, qy: number;
                if (wSt[wi] === warpEpoch) {
                  qx = wQx[wi]; qy = wQy[wi];
                } else {
                  qx = gx + (FN_ZONE_QX.eval(gx * 0.011, gy * 0.011) - 0.5) * 230 + (FN_ZONE_QXV.eval(gx * 0.06, gy * 0.06) - 0.5) * 10;
                  qy = gy + (FN_ZONE_QY.eval(gx * 0.011, gy * 0.011) - 0.5) * 230 + (FN_ZONE_QYV.eval(gx * 0.06, gy * 0.06) - 0.5) * 10;
                  wQx[wi] = qx; wQy[wi] = qy; wSt[wi] = warpEpoch;
                }
                if (pointInPoly(qx, qy, pts)) {
                  if (zv > a[row + px]) a[row + px] = zv;
                  anyHit = true;
                }
              }
            }
          }
        }
      }
      if (!any || !anyHit) return ZERO_F32;
      const v0 = a[0];
      let uniform = v0 > 0;
      if (uniform) {
        for (let i = 1, len = SZ * SZ; i < len; i++) {
          if (a[i] !== v0) { uniform = false; break; }
        }
      }
      if (uniform) return new Float32Array(SN).fill(v0);
      const b = boxBlur(boxBlur(a, SZ, SZ, blur), SZ, SZ, blur);
      const out = new Float32Array(SN);
      for (let ly = 0; ly < S; ly++) {
        const sOff = (ly + M) * SZ + M, dOff = ly * S;
        for (let lx = 0; lx < S; lx++) out[dOff + lx] = b[sOff + lx];
      }
      return out;
    };
    const arid = hitsArid ? evalZoneTile(ARID_ZONES, this.aridBoxes, 12) : ZERO_F32;
    const cold = hitsCold ? evalZoneTile(COLD_ZONES, this.coldBoxes, 14) : ZERO_F32;
    let forest = ZERO_F32;
    if (hitsForest) {
      const fb = evalZoneTile(FOREST_ZONES, this.forestBoxes, 14);
      if (fb !== ZERO_F32) {
        forest = new Float32Array(SN);
        for (let ly = 0; ly < S; ly++) {
          const y = Math.min(H - 1, gy0 + ly), row = ly * S;
          for (let lx = 0; lx < S; lx++) {
            const i = row + lx;
            if (fb[i] <= 0) continue;
            const x = Math.min(W - 1, gx0 + lx);
            forest[i] = clamp(fb[i] * (0.4 + 1.0 * FN_FOREST.eval(x * 0.035, y * 0.035)) - arid[i] * 0.6, 0, 1);
          }
        }
      }
    }

    // 6. 局部河流与道路栅格掩码
    const { riverMask, roadMask } = this.rasterizeMasks(gx0, gy0, localRivers, localRoads);

    return { tx, ty, allSea: false, land, depth, elev, arid, cold, forest, riverMask, roadMask };
  }

  private rasterizeMasks(gx0: number, gy0: number, localRivers: { pts: P[]; w: number }[], localRoads: { pts: P[]; major: boolean }[]) {
    const S = MSTRIDE, SN = S * S;
    if (!localRivers.length && !localRoads.length) return { riverMask: ZERO_U8, roadMask: ZERO_U8 };
    if (!this.tileCvMask) {
      this.tileCvMask = document.createElement('canvas');
      this.tileCvMask.width = this.tileCvMask.height = S;
      this.tileCtxMask = this.tileCvMask.getContext('2d', { willReadFrequently: true })!;
    }
    const mg = this.tileCtxMask!;
    let riverMask = ZERO_U8;
    if (localRivers.length) {
      mg.setTransform(1, 0, 0, 1, 0, 0);
      mg.fillStyle = '#000'; mg.fillRect(0, 0, S, S);
      mg.translate(-gx0, -gy0);
      mg.strokeStyle = '#fff'; mg.lineCap = 'round'; mg.lineJoin = 'round';
      for (const rv of localRivers) { mg.lineWidth = rv.w * 0.8 + 6.5; mg.beginPath(); rv.pts.forEach(([x, y], i) => (i ? mg.lineTo(x, y) : mg.moveTo(x, y))); mg.stroke(); }
      const rr = mg.getImageData(0, 0, S, S).data;
      riverMask = new Uint8Array(SN);
      for (let i = 0; i < SN; i++) riverMask[i] = rr[i * 4] > 60 ? 1 : 0;
    }
    let roadMask = ZERO_U8;
    if (localRoads.length) {
      mg.setTransform(1, 0, 0, 1, 0, 0);
      mg.fillStyle = '#000'; mg.fillRect(0, 0, S, S);
      mg.translate(-gx0, -gy0);
      mg.strokeStyle = '#fff'; mg.lineWidth = 1.6; mg.lineCap = 'round'; mg.lineJoin = 'round';
      for (const r of localRoads) { mg.beginPath(); r.pts.forEach(([x, y], i) => (i ? mg.lineTo(x, y) : mg.moveTo(x, y))); mg.stroke(); }
      const rr = mg.getImageData(0, 0, S, S).data;
      roadMask = new Uint8Array(SN);
      for (let i = 0; i < SN; i++) roadMask[i] = rr[i * 4] > 60 ? 1 : 0;
    }
    return { riverMask, roadMask };
  }

  private buildRoads() {
    const nodes = LOCATIONS.filter((l) => l.type !== 'isle' && !l.island && pointInPoly(l.x, l.y, MAINLAND));
    const pairs = new Set<string>();
    this.roads = [];
    for (const a of nodes) {
      const near = nodes.filter((b) => b !== a && (a.minor || !b.minor)).map((b) => ({ b, d: Math.hypot(a.x - b.x, a.y - b.y) }))
        .filter((o) => o.d < (a.minor ? 40 : 95)).sort((u, v) => u.d - v.d).slice(0, a.minor ? (a.type === 'town' ? 2 : 1) : 3);
      for (const { b, d } of near) {
        const key = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
        if (pairs.has(key)) continue;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (this.landAtMacro(mx, my) < 0.6) continue;
        if ([0.15, 0.3, 0.42, 0.58, 0.7, 0.85].some((q) => this.landAtMacro(a.x + (b.x - a.x) * q, a.y + (b.y - a.y) * q) < 0.6)) continue;
        pairs.add(key);
        const h = hash2(a.x + b.x, a.y + b.y, 61) - 0.5;
        const nx = -(b.y - a.y) / d, ny = (b.x - a.x) / d;
        const mid: P = [mx + nx * h * d * 0.25, my + ny * h * d * 0.25];
        const pts = smoothLine([[a.x, a.y], mid, [b.x, b.y]], 300 + pairs.size, 2.2);
        const major = (a.type === 'city' || a.major) && (b.type === 'city' || b.major);
        this.roads.push({ pts, major });
      }
    }
  }

  /** 世界坐标线段（Catmull-Rom 细分到 ~150px，GPU 地表与 CPU 判定共用）：
   *  每段 8 个数 [ax,ay,bx,by, 宽, 累计长, 标记, 0]；河：标记=河号；路：标记=1 官道 */
  rivSegW = new Float32Array(0); roadSegW = new Float32Array(0);
  /** 与 GPU 地表一致的蜿蜒河道（第十七步） */
  riverGeo: RiverGeo | null = null;
  /** 到河水边缘的有符号距离（负 = 在河里） */
  riverEdge(wx: number, wy: number) { return this.nearRiver(wx, wy) && this.riverGeo ? this.riverGeo.edgeDist(wx, wy) : 1e9; }
  private buildSegs() {
    const S = WORLD_SCALE;
    const resample = (pts: P[]) => {
      const out: number[] = [];
      const at = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
        const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * S;
        const n = Math.max(1, Math.ceil(len / 150));
        for (let k = 0; k < n; k++) {
          const t = k / n, t2 = t * t, t3 = t2 * t;
          const x = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
          const y = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
          out.push(x * S, y * S);
        }
      }
      const l = pts[pts.length - 1]; out.push(l[0] * S, l[1] * S);
      return out;
    };
    const riv: number[] = [];
    this.rivers.forEach((rv, ri) => {
      const p = resample(rv.pts);
      let tot = 0; for (let i = 2; i < p.length; i += 2) tot += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
      let acc = 0;
      for (let i = 2; i < p.length; i += 2) {
        const L = Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
        // 源头窄、入海宽
        const w = 110 * rv.w * (0.55 + 0.45 * Math.min(1, (acc + L / 2) / tot));
        riv.push(p[i - 2], p[i - 1], p[i], p[i + 1], w, acc, ri, 0);
        acc += L;
      }
    });
    const road: number[] = [];
    for (const r of this.roads) {
      const p = resample(r.pts);
      for (let i = 2; i < p.length; i += 2) road.push(p[i - 2], p[i - 1], p[i], p[i + 1], r.major ? 40 : 24, 0, r.major ? 1 : 0, 0);
    }
    this.rivSegW = new Float32Array(riv); this.roadSegW = new Float32Array(road);
    this.riverGeo = new RiverGeo(this.rivSegW);
  }

  /** 将滑动宏观窗口 [x0, x0+w*step) × [y0, y0+h*step) 打包进 GPU 地表双通道缓冲 */
  packMacroWindow(x0: number, y0: number, w: number, h: number, step: number, a: Float32Array, b: Float32Array) {
    const W = this.W, H = this.H;
    if (step === 1) {
      for (let iy = 0; iy < h; iy++) {
        const gy = Math.min(H - 1, Math.max(0, y0 + iy));
        const ty = (gy / MTILE) | 0, ly = gy - ty * MTILE;
        let ix = 0;
        while (ix < w) {
          const gx = Math.min(W - 1, Math.max(0, x0 + ix));
          const tx = (gx / MTILE) | 0, lx0 = gx - tx * MTILE;
          const tile = this.getMacroTile(tx, ty);
          const span = Math.min(w - ix, gx === W - 1 ? w - ix : MTILE - lx0);
          const tRow = ly * MSTRIDE;
          if (tile.allSea) {
            for (let k = 0; k < span; k++) {
              const di = (iy * w + ix + k) * 4;
              const lx = Math.min(MTILE, lx0 + k);
              a[di] = tile.land[tRow + lx]; a[di + 1] = 0; a[di + 2] = 0; a[di + 3] = 0;
              b[di] = 0; b[di + 1] = 0.02; b[di + 2] = 0; b[di + 3] = 0;
            }
          } else {
            for (let k = 0; k < span; k++) {
              const si = tRow + Math.min(MTILE, lx0 + k), di = (iy * w + ix + k) * 4;
              a[di] = tile.land[si]; a[di + 1] = tile.elev[si]; a[di + 2] = tile.arid[si]; a[di + 3] = tile.cold[si];
              b[di] = tile.forest[si]; b[di + 1] = tile.depth[si]; b[di + 2] = 0; b[di + 3] = 0;
            }
          }
          ix += span;
        }
      }
      return;
    }
    for (let iy = 0; iy < h; iy++) {
      const gy = Math.min(H - 1, Math.max(0, y0 + iy * step));
      const ty = (gy / MTILE) | 0, ly = gy - ty * MTILE;
      for (let ix = 0; ix < w; ix++) {
        const gx = Math.min(W - 1, Math.max(0, x0 + ix * step));
        const tx = (gx / MTILE) | 0, lx = gx - tx * MTILE;
        const tile = this.getMacroTile(tx, ty);
        const si = ly * MSTRIDE + lx, di = (iy * w + ix) * 4;
        a[di] = tile.land[si]; a[di + 1] = tile.elev[si]; a[di + 2] = tile.arid[si]; a[di + 3] = tile.cold[si];
        b[di] = tile.forest[si]; b[di + 1] = tile.depth[si]; b[di + 2] = 0; b[di + 3] = 0;
      }
    }
  }

  private _gl: { W: number; H: number; scale: number; packWindow: (x0: number, y0: number, w: number, h: number, step: number, a: Float32Array, b: Float32Array) => void } | null = null;
  /** GPU 地表所需的流式宏观窗口接口 */
  glData() {
    if (this._gl) return this._gl;
    return (this._gl = {
      W: this.W,
      H: this.H,
      scale: WORLD_SCALE,
      packWindow: (x0, y0, w, h, step, a, b) => this.packMacroWindow(x0, y0, w, h, step, a, b),
    });
  }

  private roadSegs: Map<string, number[]> | null = null;
  /** 精确：距道路中线 < pad（世界像素） */
  nearRoad(wx: number, wy: number, pad: number) {
    if (!this.onRoad(wx, wy)) return false;
    const RC = 600;
    if (!this.roadSegs) {
      const m = new Map<string, number[]>();
      const R = this.roadSegW;
      {
        for (let q = 0; q < R.length; q += 8) {
          const ax = R[q], ay = R[q + 1], bx = R[q + 2], by = R[q + 3], w = R[q + 4] / 2;
          for (let gy = Math.floor((Math.min(ay, by) - 60) / RC); gy <= Math.floor((Math.max(ay, by) + 60) / RC); gy++)
            for (let gx = Math.floor((Math.min(ax, bx) - 60) / RC); gx <= Math.floor((Math.max(ax, bx) + 60) / RC); gx++) {
              const key = gx + ',' + gy; let a = m.get(key); if (!a) m.set(key, (a = [])); a.push(ax, ay, bx, by, w);
            }
        }
      }
      this.roadSegs = m;
    }
    const a = this.roadSegs.get(Math.floor(wx / RC) + ',' + Math.floor(wy / RC));
    if (!a) return false;
    for (let i = 0; i < a.length; i += 5) if (segDist(wx, wy, a[i], a[i + 1], a[i + 2], a[i + 3]) < a[i + 4] + pad) return true;
    return false;
  }

  onRoad(wx: number, wy: number) {
    const x = (wx / WORLD_SCALE) | 0, y = (wy / WORLD_SCALE) | 0;
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return false;
    const tx = (x / MTILE) | 0, ty = (y / MTILE) | 0;
    const tile = this.getMacroTile(tx, ty);
    if (tile.roadMask === ZERO_U8) return false;
    return tile.roadMask[(y - ty * MTILE) * MSTRIDE + (x - tx * MTILE)] === 1;
  }

  private makeGlyphs() {
    // 水波纹
    const w = document.createElement('canvas'); w.width = 160; w.height = 60;
    const wg = w.getContext('2d')!;
    wg.strokeStyle = 'rgba(70,100,110,0.45)'; wg.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      wg.lineWidth = 2.2 - k * 0.5;
      wg.beginPath();
      const oy = 18 + k * 13, ox = k * 14;
      wg.moveTo(10 + ox, oy);
      wg.bezierCurveTo(35 + ox, oy - 12, 55 + ox, oy - 12, 70 + ox, oy);
      wg.bezierCurveTo(85 + ox, oy + 9, 105 + ox, oy + 9, 125 + ox, oy - 2);
      wg.stroke();
    }
    this.waveGlyph = w;
    // 草叶（草原）
    const gr = document.createElement('canvas'); gr.width = 90; gr.height = 50;
    const gg = gr.getContext('2d')!;
    gg.strokeStyle = 'rgba(110,105,60,0.55)'; gg.lineCap = 'round';
    for (let k = 0; k < 9; k++) {
      gg.lineWidth = 1.6;
      const x = 10 + k * 8 + Math.sin(k) * 3;
      gg.beginPath(); gg.moveTo(x, 48); gg.quadraticCurveTo(x + 4, 30, x + 10 - (k % 3) * 6, 8 + (k % 4) * 6); gg.stroke();
    }
    this.grassGlyph = gr;
    // 山石（几块圆润巨石，墨线勾勒 + 皴擦）
    const rr = mulberry32(777);
    for (let v = 0; v < 3; v++) {
      const c = document.createElement('canvas'); c.width = 160; c.height = 110;
      const q = c.getContext('2d')!;
      const stones = v === 0 ? [[80, 100, 52, 46]] : v === 1 ? [[62, 100, 44, 40], [112, 102, 30, 24]] : [[50, 102, 30, 26], [92, 100, 46, 44], [132, 104, 20, 14]];
      for (const [cx0, by, rw, rh] of stones) {
        const pts: P[] = [];
        const N = 14;
        for (let k = 0; k <= N; k++) {
          const t = Math.PI + (k / N) * Math.PI;
          const j = 0.82 + rr() * 0.3;
          pts.push([cx0 + Math.cos(t) * rw * j, by + Math.sin(t) * rh * j * (k === 0 || k === N ? 0 : 1)]);
        }
        const path = new Path2D();
        path.moveTo(pts[0][0], by);
        for (let k = 1; k < pts.length; k++) {
          const [x0, y0] = pts[k - 1], [x1, y1] = pts[k];
          path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
        }
        path.lineTo(pts[N][0], by); path.closePath();
        const grd = q.createLinearGradient(cx0 - rw * 0.4, by - rh, cx0 + rw * 0.3, by);
        grd.addColorStop(0, 'rgba(206,204,190,0.98)'); grd.addColorStop(0.55, 'rgba(150,152,138,0.98)'); grd.addColorStop(1, 'rgba(96,100,90,0.98)');
        q.fillStyle = grd; q.fill(path);
        q.save(); q.clip(path);
        q.strokeStyle = 'rgba(50,52,44,0.45)'; q.lineWidth = 1.6; q.lineCap = 'round';
        for (let k = 0; k < 5; k++) {
          const x = cx0 + (rr() - 0.3) * rw, y = by - rh * (0.2 + rr() * 0.6);
          q.beginPath(); q.moveTo(x, y); q.quadraticCurveTo(x + 4, y + 7, x + 1 + rr() * 8, y + 14 + rr() * 8); q.stroke();
        }
        q.fillStyle = 'rgba(60,62,54,0.18)'; q.fillRect(cx0 + rw * 0.1, by - rh, rw, rh);
        q.restore();
        q.strokeStyle = 'rgba(34,36,30,0.9)'; q.lineWidth = 2.4; q.lineJoin = 'round'; q.stroke(path);
        q.fillStyle = 'rgba(40,64,44,0.75)';
        for (let k = 0; k < 4; k++) { q.beginPath(); q.ellipse(cx0 + (rr() - 0.5) * rw * 1.1, by - rh * (0.75 + rr() * 0.2), 2.6, 1.8, 0, 0, Math.PI * 2); q.fill(); }
      }
      q.strokeStyle = 'rgba(70,100,62,0.6)'; q.lineWidth = 1.5; q.lineCap = 'round';
      for (let k = 0; k < 12; k++) { const x = 14 + rr() * 132; q.beginPath(); q.moveTo(x, 106); q.quadraticCurveTo(x + 1, 98, x + (rr() - 0.5) * 8, 92 - rr() * 6); q.stroke(); }
      this.rockGlyphs.push(c);
    }
    // 枯枝灌木（荒漠）
    {
      const c = document.createElement('canvas'); c.width = 110; c.height = 90;
      const q = c.getContext('2d')!; q.lineCap = 'round'; q.strokeStyle = 'rgba(60,46,32,0.85)';
      const br = (x: number, y: number, a: number, len: number, w: number, d: number) => {
        if (d > 4 || len < 4) return;
        const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
        q.lineWidth = w; q.beginPath(); q.moveTo(x, y); q.lineTo(x2, y2); q.stroke();
        br(x2, y2, a - 0.45 - rr() * 0.3, len * 0.68, w * 0.65, d + 1);
        br(x2, y2, a + 0.4 + rr() * 0.3, len * 0.64, w * 0.65, d + 1);
      };
      br(55, 88, -Math.PI / 2 - 0.15, 26, 3.4, 0); br(55, 88, -Math.PI / 2 + 0.6, 18, 2.4, 1); br(55, 88, -Math.PI / 2 - 0.8, 16, 2.2, 1);
      q.fillStyle = 'rgba(120,96,60,0.35)'; q.beginPath(); q.ellipse(55, 88, 30, 4, 0, 0, Math.PI * 2); q.fill();
      this.shrubGlyph = c;
    }
    // 毡帐（草原部落）
    {
      const c = document.createElement('canvas'); c.width = 120; c.height = 96;
      const q = c.getContext('2d')!;
      q.fillStyle = 'rgba(60,50,30,0.25)'; q.beginPath(); q.ellipse(60, 88, 52, 8, 0, 0, Math.PI * 2); q.fill();
      const body = new Path2D(); body.moveTo(14, 86); body.lineTo(16, 52); body.lineTo(104, 52); body.lineTo(106, 86); body.closePath();
      q.fillStyle = '#efe9da'; q.fill(body);
      const dome = new Path2D(); dome.moveTo(10, 54); dome.quadraticCurveTo(60, 2, 110, 54); dome.closePath();
      q.fillStyle = '#e6dfcc'; q.fill(dome);
      q.fillStyle = 'rgba(120,110,90,0.25)'; q.fillRect(64, 52, 42, 34);
      q.strokeStyle = 'rgba(40,36,28,0.9)'; q.lineWidth = 2.4; q.lineJoin = 'round'; q.stroke(body); q.stroke(dome);
      q.fillStyle = '#a8352a'; q.fillRect(15, 56, 90, 5);
      q.fillStyle = '#3a2e22'; q.fillRect(50, 64, 18, 22);
      q.strokeStyle = 'rgba(40,36,28,0.6)'; q.lineWidth = 1.2;
      for (let k = 0; k < 5; k++) { q.beginPath(); q.moveTo(60, 14); q.lineTo(18 + k * 21, 52); q.stroke(); }
      q.fillStyle = '#5a4630'; q.beginPath(); q.ellipse(60, 16, 6, 3, 0, 0, Math.PI * 2); q.fill();
      this.yurtGlyph = c;
    }
    // 芦苇（水边）
    const rd = document.createElement('canvas'); rd.width = 80; rd.height = 90;
    const rq = rd.getContext('2d')!; rq.lineCap = 'round';
    for (let k = 0; k < 9; k++) {
      const x = 10 + k * 7 + Math.sin(k * 2.3) * 3, top = 14 + (k % 3) * 12;
      rq.strokeStyle = 'rgba(70,80,55,0.75)'; rq.lineWidth = 1.5;
      rq.beginPath(); rq.moveTo(x, 88); rq.quadraticCurveTo(x + 3, 50, x + 6 - (k % 2) * 10, top); rq.stroke();
      if (k % 2 === 0) { rq.fillStyle = 'rgba(120,96,60,0.8)'; rq.beginPath(); rq.ellipse(x + 6 - (k % 2) * 10, top + 4, 2.4, 8, 0.2, 0, Math.PI * 2); rq.fill(); }
    }
    this.reedGlyph = rd;
  }

  private landAtMacro(x: number, y: number): number {
    const gx = clamp(Math.round(x), 0, this.W - 1), gy = clamp(Math.round(y), 0, this.H - 1);
    const tx = (gx / MTILE) | 0, ty = (gy / MTILE) | 0;
    const tile = this.getMacroTile(tx, ty);
    return tile.land[(gy - ty * MTILE) * MSTRIDE + (gx - tx * MTILE)];
  }

  private macroAt(x: number, y: number) {
    const gx = clamp(x | 0, 0, this.W - 1), gy = clamp(y | 0, 0, this.H - 1);
    const tx = (gx / MTILE) | 0, ty = (gy / MTILE) | 0;
    const tile = this.getMacroTile(tx, ty);
    const i = (gy - ty * MTILE) * MSTRIDE + (gx - tx * MTILE);
    return { land: tile.land[i], elev: tile.elev[i], arid: tile.arid[i], cold: tile.cold[i], forest: tile.forest[i], depth: tile.depth[i] };
  }

  // 宏观坐标采样（双线性，按 256×256 流式宏观块 + 1 格重叠边免跨块）
  private bilField(pick: (t: MacroTile) => Float32Array, x: number, y: number) {
    x = clamp(x, 0, this.W - 1.001); y = clamp(y, 0, this.H - 1.001);
    const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi;
    const tx = (xi / MTILE) | 0, ty = (yi / MTILE) | 0;
    const tile = this.getMacroTile(tx, ty);
    const a = pick(tile);
    const i = (yi - ty * MTILE) * MSTRIDE + (xi - tx * MTILE);
    const p = a[i], q = a[i + 1], r = a[i + MSTRIDE], s = a[i + MSTRIDE + 1];
    return p + (q - p) * fx + (r - p) * fy + (p - q - r + s) * fx * fy;
  }

  private bilLand(x: number, y: number) {
    x = clamp(x, 0, this.W - 1.001); y = clamp(y, 0, this.H - 1.001);
    const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi;
    const tx = (xi / MTILE) | 0, ty = (yi / MTILE) | 0;
    const a = this.getMacroTile(tx, ty).land;
    const i = (yi - ty * MTILE) * MSTRIDE + (xi - tx * MTILE);
    const p = a[i], q = a[i + 1], r = a[i + MSTRIDE], s = a[i + MSTRIDE + 1];
    return p + (q - p) * fx + (r - p) * fy + (p - q - r + s) * fx * fy;
  }

  private bilElev(x: number, y: number) {
    x = clamp(x, 0, this.W - 1.001); y = clamp(y, 0, this.H - 1.001);
    const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi;
    const tx = (xi / MTILE) | 0, ty = (yi / MTILE) | 0;
    const t = this.getMacroTile(tx, ty);
    if (t.allSea) return 0;
    const a = t.elev;
    const i = (yi - ty * MTILE) * MSTRIDE + (xi - tx * MTILE);
    const p = a[i], q = a[i + 1], r = a[i + MSTRIDE], s = a[i + MSTRIDE + 1];
    return p + (q - p) * fx + (r - p) * fy + (p - q - r + s) * fx * fy;
  }

  sample(wx: number, wy: number): Sample {
    const x = clamp(wx / WORLD_SCALE, 0, this.W - 1.001), y = clamp(wy / WORLD_SCALE, 0, this.H - 1.001);
    const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi, w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
    const tx = (xi / MTILE) | 0, ty = (yi / MTILE) | 0;
    const t = this.getMacroTile(tx, ty);
    const i = (yi - ty * MTILE) * MSTRIDE + (xi - tx * MTILE);
    const i1 = i + 1, i2 = i + MSTRIDE, i3 = i2 + 1;
    const land = t.land[i] * w00 + t.land[i1] * w10 + t.land[i2] * w01 + t.land[i3] * w11;
    if (t.allSea) return { land, elev: 0, arid: 0, cold: 0, forest: 0, depth: 0.02 };
    return {
      land,
      elev: t.elev[i] * w00 + t.elev[i1] * w10 + t.elev[i2] * w01 + t.elev[i3] * w11,
      arid: t.arid[i] * w00 + t.arid[i1] * w10 + t.arid[i2] * w01 + t.arid[i3] * w11,
      cold: t.cold[i] * w00 + t.cold[i1] * w10 + t.cold[i2] * w01 + t.cold[i3] * w11,
      forest: t.forest[i] * w00 + t.forest[i1] * w10 + t.forest[i2] * w01 + t.forest[i3] * w11,
      depth: t.depth[i] * w00 + t.depth[i1] * w10 + t.depth[i2] * w01 + t.depth[i3] * w11,
    };
  }

  /** 底图上画出来的海岸线所用的陆地值（0.5 为岸） */
  visLand(wx: number, wy: number) {
    return this.bilLand(wx / WORLD_SCALE, wy / WORLD_SCALE) + (pnoise(wx / 150, wy / 150, 9) - 0.5) * 0.12;
  }
  isLand(wx: number, wy: number) {
    return this.bilLand(wx / WORLD_SCALE, wy / WORLD_SCALE) + (pnoise(wx / 150, wy / 150, 9) - 0.5) * 0.12 > 0.5;
  }

  // 徒步速度倍率（0 表示不可通行）
  walkFactor(wx: number, wy: number) {
    if (!this.isLand(wx, wy)) return 0;
    const s = this.sample(wx, wy);
    let f = 1;
    if (s.elev > 0.55) f *= 0.6; else if (s.elev > 0.35) f *= 0.8;
    if (s.forest > 0.6) f *= 0.88;
    if (s.cold > 0.6) f *= 0.85;
    if (this.onRoad(wx, wy)) f = Math.max(f, 1) * 1.25;
    else if (this.riverEdge(wx, wy) < 0) f *= 0.5;   // 涉水而过
    return f;
  }

  // ---------- 颜色 ----------
  private colorAt(wx: number, wy: number, out: number[]) {
    const x = clamp(wx / WORLD_SCALE, 0, this.W - 1.001), y = clamp(wy / WORLD_SCALE, 0, this.H - 1.001);
    const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi;
    const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
    const tx = (xi / MTILE) | 0, ty = (yi / MTILE) | 0;
    const t0 = this.getMacroTile(tx, ty);
    const idx = (yi - ty * MTILE) * MSTRIDE + (xi - tx * MTILE);
    const i1 = idx + 1, i2 = idx + MSTRIDE, i3 = i2 + 1;
    const land = t0.land[idx] * w00 + t0.land[i1] * w10 + t0.land[i2] * w01 + t0.land[i3] * w11;
    const n1 = fbm(wx / 1400, wy / 1400, 3, 3);
    const n2 = pnoise(wx / 150, wy / 150, 9);
    const L = land + (n2 - 0.5) * 0.12;
    let r: number, g: number, b: number;
    if (L < 0.5) {
      const dep = t0.allSea ? 0.02 : (t0.depth[idx] * w00 + t0.depth[i1] * w10 + t0.depth[i2] * w01 + t0.depth[i3] * w11);
      const t = clamp(dep * 1.6, 0, 1);       // 越近岸越浅
      r = 70 + 82 * t; g = 122 + 72 * t; b = 136 + 50 * t;
      // 外海深水区：大尺度水墨海流与苍青深海过渡
      if (t < 0.35) {
        const deepK = (0.35 - t) / 0.35;
        const cur = fbm(wx / 14000, wy / 14000, 3, 19);
        const cur2 = valueNoise(wx / 6500, wy / 6500, 23);
        const ink = (0.35 + 0.65 * cur) * deepK;
        r += (44 - r) * ink * 0.65; g += (86 - g) * ink * 0.58; b += (108 - b) * ink * 0.45;
        const streak = (cur2 - 0.5) * 18 * deepK;
        r += streak * 0.7; g += streak * 0.9; b += streak;
      }
      const m = 0.94 + 0.12 * n1 + (n2 - 0.5) * 0.05;
      r *= m; g *= m; b *= m;
      if (L > 0.44) { const k = (L - 0.44) / 0.06; r += (222 - r) * k * 0.55; g += (226 - g) * k * 0.55; b += (214 - b) * k * 0.55; }
    } else {
      const elev = t0.allSea ? 0 : (t0.elev[idx] * w00 + t0.elev[i1] * w10 + t0.elev[i2] * w01 + t0.elev[i3] * w11);
      const arid = t0.allSea ? 0 : (t0.arid[idx] * w00 + t0.arid[i1] * w10 + t0.arid[i2] * w01 + t0.arid[i3] * w11);
      const cold = t0.allSea ? 0 : (t0.cold[idx] * w00 + t0.cold[i1] * w10 + t0.cold[i2] * w01 + t0.cold[i3] * w11);
      const forest = t0.allSea ? 0 : (t0.forest[idx] * w00 + t0.forest[i1] * w10 + t0.forest[i2] * w01 + t0.forest[i3] * w11);
      // 基础：宣纸色平原
      r = 226; g = 217; b = 184;
      // 湿润绿意
      const green = clamp((1 - arid) * (0.5 + 0.5 * n1), 0, 1);
      const nm = valueNoise(wx / 700, wy / 700, 13);   // 成片的嫩绿 / 青绿
      const gr0 = 168 + nm * 30, gg0 = 194 + nm * 14, gb0 = 128 - nm * 10;
      r += (gr0 - r) * green; g += (gg0 - g) * green; b += (gb0 - b) * green;
      // 森林
      const f = clamp(forest * 1.2, 0, 1);
      r += (136 - r) * f; g += (166 - g) * f; b += (118 - b) * f;
      // 干旱/草原/荒漠
      const a = clamp(arid, 0, 1);
      const desert = clamp((arid - 0.74) / 0.18, 0, 1);
      const steppe = a * (1 - desert);
      r += (210 - r) * steppe; g += (200 - g) * steppe; b += (128 - b) * steppe;
      r += (234 - r) * desert; g += (208 - g) * desert; b += (152 - b) * desert;
      // 山地
      const e = clamp((elev - 0.2) * 1.4, 0, 1);
      r += (168 - r) * e; g += (172 - g) * e; b += (154 - b) * e;
      // 冰雪
      const c = clamp(cold * (0.7 + elev * 0.6), 0, 1);
      r += (243 - r) * c; g += (242 - g) * c; b += (238 - b) * c;
      // 水彩斑驳
      const m = 0.93 + 0.11 * n1 + (n2 - 0.5) * 0.04;
      r *= m; g *= m; b *= m;
      // 山体明暗（光自西北来）：随高度起伏的整体光影
      const ex = this.bilElev(x + 0.9, y) - this.bilElev(x - 0.9, y);
      const ey = this.bilElev(x, y + 0.9) - this.bilElev(x, y - 0.9);
      const sh = clamp((ex * 0.8 + ey) * 3.2, -0.3, 0.26);
      if (sh > 0) { r += (250 - r) * sh * 0.55; g += (246 - g) * sh * 0.55; b += (228 - b) * sh * 0.5; }
      else { const k2 = -sh; r *= 1 - k2 * 0.55; g *= 1 - k2 * 0.5; b *= 1 - k2 * 0.38; }
      // 高处略带青灰（远山感）
      const hi = clamp((elev - 0.55) * 1.2, 0, 0.35);
      r += (150 - r) * hi * 0.4; g += (160 - g) * hi * 0.4; b += (160 - b) * hi * 0.4;
      // 四季：春嫩、夏浓、秋黄、冬枯（雪原另算）
      const veg = clamp(green * (1 - desert) * (1 - c) * (1 - e * 0.6), 0, 1);
      const S = this.season;
      if (S === 0) { const k = 0.3 * veg; r += (184 - r) * k; g += (210 - g) * k; b += (132 - b) * k; }
      else if (S === 2) { const k = (0.62 + 0.2 * n1) * veg; r += (200 - r) * k; g += (180 - g) * k; b += (108 - b) * k; }
      else if (S === 3) {
        const k = 0.75 * veg; r += (206 - r) * k; g += (202 - g) * k; b += (180 - b) * k;
        const sn = clamp((valueNoise(wx / 420, wy / 420, 29) - 0.55) * 4, 0, 1) * veg;
        r += (244 - r) * sn; g += (244 - g) * sn; b += (240 - b) * sn;
      }
      // 海岸墨线
      if (L < 0.535) { const k = 1 - (L - 0.5) / 0.035; r += (96 - r) * k * 0.7; g += (104 - g) * k * 0.7; b += (92 - b) * k * 0.7; }
    }
    out[0] = r; out[1] = g; out[2] = b;
  }

  getChunk(cx: number, cy: number, allowBuild: boolean): Chunk | null {
    const key = cx + ',' + cy;
    let c = this.chunks.get(key);
    if (c && (c.season === this.season || !allowBuild)) { c.used = this.frame; return c; }
    if (!allowBuild) return null;
    c = this.buildChunk(cx, cy);
    this.chunks.set(key, c);
    if (this.chunks.size > CHUNK_CACHE_MAX) this.evict();
    return c;
  }

  private evict() {
    const arr = [...this.chunks.values()].sort((a, b) => a.used - b.used);
    const drop = Math.max(1, arr.length - Math.floor(CHUNK_CACHE_MAX * 0.7));
    for (let i = 0; i < drop; i++) {
      this.chunks.delete(arr[i].cx + ',' + arr[i].cy);
      arr[i].canvas.width = arr[i].canvas.height = 0;
    }
  }

  releaseCaches() {
    for (const c of this.chunks.values()) { c.canvas.width = c.canvas.height = 0; }
    this.chunks.clear();
    this.decoCache.clear();
    this.grassCache.clear();
    this.fgGrassCache.clear();
    this.macroCache.clear();
    this.lastMacroKey = -1;
    this.lastMacroTile = null;
    this.gvMemo.clear();
    this.fallMemo.clear();
  }

  private buildChunk(cx: number, cy: number): Chunk {
    const R = CHUNK_RES, PR = PIX_RES, sc = CHUNK / PR;
    const ox = cx * CHUNK, oy = cy * CHUNK;
    // 底色（低分辨率水彩）
    const base = document.createElement('canvas'); base.width = base.height = PR;
    const bg = base.getContext('2d')!;
    const img = bg.createImageData(PR, PR);
    const d = img.data, col = [0, 0, 0];
    for (let j = 0; j < PR; j++) for (let i = 0; i < PR; i++) {
      this.colorAt(ox + (i + 0.5) * sc, oy + (j + 0.5) * sc, col);
      const k = (j * PR + i) * 4;
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255;
    }
    bg.putImageData(img, 0, 0);
    const cv = document.createElement('canvas'); cv.width = cv.height = R;
    const g = cv.getContext('2d')!;
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(base, 0, 0, R, R);
    g.save();
    g.scale(R / CHUNK, R / CHUNK); g.translate(-ox, -oy);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const rnd = mulberry32(((cx * 73856093) ^ (cy * 19349663)) >>> 0);
    let landish = false;
    for (let k = 0; k < 9 && !landish; k++) landish = this.sample(ox + (k % 3 + 0.5) * CHUNK / 3, oy + ((k / 3 | 0) + 0.5) * CHUNK / 3).land > 0.4;

    if (landish) {
      // 1. 水墨晕染（全局网格，跨块连续，避免接缝）
      const BC = 640;
      const bx0 = Math.floor((ox - 700) / BC), bx1 = Math.floor((ox + CHUNK + 700) / BC);
      const by0 = Math.floor((oy - 700) / BC), by1 = Math.floor((oy + CHUNK + 700) / BC);
      for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) {
        const x = (bx + hash2(bx, by, 81)) * BC, y = (by + hash2(bx, by, 82)) * BC;
        const r = 220 + hash2(bx, by, 83) * 420;
        if (x + r < ox || x - r > ox + CHUNK || y + r < oy || y - r > oy + CHUNK) continue;
        const sm = this.sample(x, y);
        if (sm.land < 0.55) continue;
        const a = 0.05 + hash2(bx, by, 84) * 0.07;
        const c = sm.cold > 0.5 ? '120,135,150' : sm.arid > 0.78 ? '170,130,70' : sm.arid > 0.45 ? '110,120,60' : sm.elev > 0.4 ? '80,86,76' : '60,96,62';
        const rg = g.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, `rgba(${c},${a})`); rg.addColorStop(0.6, `rgba(${c},${a * 0.6})`); rg.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // 2. 田畴
      this.drawFields(g, ox, oy);
    }
    // 3. 河流
    for (const rv of this.rivers) {
      const pts = rv.pts.map(([x, y]) => [x * WORLD_SCALE, y * WORLD_SCALE]);
      if (!pts.some(([x, y]) => x > ox - 2000 && x < ox + CHUNK + 2000 && y > oy - 2000 && y < oy + CHUNK + 2000)) continue;
      const path = () => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); };
      path(); g.strokeStyle = 'rgba(92,110,104,0.55)'; g.lineWidth = 70 * rv.w + 26; g.stroke();
      path(); g.strokeStyle = 'rgba(150,178,180,0.95)'; g.lineWidth = 70 * rv.w; g.stroke();
      path(); g.strokeStyle = 'rgba(190,210,206,0.6)'; g.lineWidth = 20 * rv.w; g.stroke();
      // 水纹
      g.strokeStyle = 'rgba(240,248,245,0.5)'; g.lineWidth = 3;
      for (let k = 0; k < pts.length - 1; k += 3) {
        const [x, y] = pts[k];
        if (x < ox - 100 || x > ox + CHUNK + 100 || y < oy - 100 || y > oy + CHUNK + 100) continue;
        const h = hash2(x, y, 3);
        if (h > 0.5) continue;
        const off = (h - 0.25) * 70 * rv.w;
        g.beginPath(); g.moveTo(x - 20, y + off); g.quadraticCurveTo(x, y + off - 6, x + 22, y + off); g.stroke();
      }
    }
    // 4. 道路
    for (const rd of this.roads) {
      const pts = rd.pts;
      let hit = false;
      for (let k = 0; k < pts.length; k += 4) { const x = pts[k][0] * WORLD_SCALE, y = pts[k][1] * WORLD_SCALE; if (x > ox - 800 && x < ox + CHUNK + 800 && y > oy - 800 && y < oy + CHUNK + 800) { hit = true; break; } }
      if (!hit) continue;
      const path = () => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * WORLD_SCALE, y * WORLD_SCALE) : g.moveTo(x * WORLD_SCALE, y * WORLD_SCALE))); };
      const w = rd.major ? 34 : 22;
      // 土路：柔和路肩 → 深色路缘 → 夯土路面 → 两道车辙 → 中间被踩亮的一线
      path(); g.strokeStyle = 'rgba(150,132,88,0.16)'; g.lineWidth = w + 30; g.stroke();
      path(); g.strokeStyle = 'rgba(118,98,64,0.34)'; g.lineWidth = w + 7; g.stroke();
      path(); g.strokeStyle = 'rgba(206,188,146,0.96)'; g.lineWidth = w; g.stroke();
      path(); g.strokeStyle = 'rgba(160,138,96,0.4)'; g.lineWidth = w * 0.66; g.stroke();
      path(); g.strokeStyle = 'rgba(214,198,158,1)'; g.lineWidth = w * 0.54; g.stroke();
      path(); g.strokeStyle = 'rgba(234,224,194,0.55)'; g.lineWidth = w * 0.18; g.stroke();
    }
    if (landish) {
      // 5. 水彩笔触：成片的嫩绿/墨绿晕染 + 细密草纹（远看有质感，近看由实时草丛接管）
      const dune = new Path2D(), drift = new Path2D(), pebble = new Path2D();
      const hatchA = new Path2D(), hatchB = new Path2D();
      // 全局网格摆放，跨块连续（无接缝）
      const DC = 64;
      for (let Y = Math.floor((oy - 200) / DC); Y <= Math.floor((oy + CHUNK + 200) / DC); Y++) for (let X = Math.floor((ox - 200) / DC); X <= Math.floor((ox + CHUNK + 200) / DC); X++) {
        if (hash2(X, Y, 61) > 0.26) continue;
        const x = (X + hash2(X, Y, 62)) * DC, y = (Y + hash2(X, Y, 63)) * DC;
        const h4 = hash2(X, Y, 64), h5 = hash2(X, Y, 65);
        const rw = 50 + h4 * 130, rh = rw * (0.14 + h5 * 0.14);
        if (x + rw < ox || x - rw > ox + CHUNK || y + rh < oy || y - rh > oy + CHUNK) continue;
        const sm = this.sample(x, y);
        if (sm.land < 0.62 || sm.cold > 0.6 || sm.arid > 0.8) continue;
        const lightK = h5 < 0.55;
        const S = this.season;
        const c = sm.arid > 0.45 ? (lightK ? '226,214,150' : '150,140,80')
          : S === 2 ? (lightK ? '234,206,126' : '130,100,48')
          : S === 3 ? (lightK ? '248,248,244' : '140,134,112')
          : (lightK ? (S === 0 ? '214,234,150' : '206,226,150') : '70,112,64');
        g.fillStyle = `rgba(${c},${0.05 + h4 * 0.06})`;
        g.beginPath(); g.ellipse(x, y, rw, rh, (h4 - 0.5) * 0.4, 0, Math.PI * 2); g.fill();
      }
      for (let i = 0; i < 700; i++) {
        const x = ox + rnd() * CHUNK, y = oy + rnd() * CHUNK;
        const sm = this.sample(x, y);
        if (sm.land < 0.62 || sm.cold > 0.6 || sm.arid > 0.8 || sm.elev > 0.5) continue;
        const L = 6 + rnd() * 8, lean = (rnd() - 0.5) * 6;
        const P2 = rnd() < 0.5 ? hatchA : hatchB;
        P2.moveTo(x, y); P2.lineTo(x + lean, y - L);
        P2.moveTo(x + 4, y + 1); P2.lineTo(x + 4 + lean * 0.6, y - L * 0.7);
      }
      for (let i = 0; i < 240; i++) {
        const x = ox + rnd() * CHUNK, y = oy + rnd() * CHUNK;
        const sm = this.sample(x, y);
        if (sm.land < 0.62) continue;
        if (sm.cold > 0.6) {
          const q = rnd();
          if (q < 0.12) { pebble.moveTo(x + 6, y); pebble.ellipse(x, y, 6 + rnd() * 5, 3 + rnd() * 2, 0, 0, Math.PI * 2); }
          else if (q < 0.5) { const L = 40 + rnd() * 90; drift.moveTo(x, y); drift.quadraticCurveTo(x + L / 2, y - 6 - rnd() * 8, x + L, y + rnd() * 4); }
        } else if (sm.arid > 0.8 && i % 3 === 0) {
          const L = 120 + rnd() * 220, b = 14 + rnd() * 18;
          dune.moveTo(x, y); dune.bezierCurveTo(x + L * 0.3, y - b, x + L * 0.7, y - b, x + L, y + rnd() * 10);
          dune.moveTo(x + L * 0.2, y + 12); dune.quadraticCurveTo(x + L * 0.5, y - b * 0.4, x + L * 0.8, y + 14);
        }
      }
      for (let i = 0; i < 22; i++) {
        const x = ox + rnd() * CHUNK, y = oy + rnd() * CHUNK;
        const sm = this.sample(x, y);
        if (sm.land < 0.62 || sm.elev < 0.25 || this.nearRoad(x, y, 10)) continue;
        const r = 4 + rnd() * 7;
        pebble.moveTo(x + r, y); pebble.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2);
      }
      g.lineWidth = 2.2; g.strokeStyle = 'rgba(60,96,54,0.16)'; g.stroke(hatchA);
      g.strokeStyle = 'rgba(190,214,140,0.22)'; g.stroke(hatchB);
      g.lineWidth = 3; g.strokeStyle = 'rgba(150,115,60,0.32)'; g.stroke(dune);
      g.lineWidth = 2.5; g.strokeStyle = 'rgba(120,140,165,0.35)'; g.stroke(drift);
      g.fillStyle = 'rgba(176,172,156,0.7)'; g.fill(pebble);
      g.lineWidth = 1.4; g.strokeStyle = 'rgba(90,88,76,0.4)'; g.stroke(pebble);
    }
    g.restore();
    return { cx, cy, canvas: cv, used: this.frame, season: this.season };
  }

  /** 是否落在 drawFields 画出的某块田里（与其网格同构） */
  /** 第二十二步：田畴环绕城镇——内圈让出整座城（贴图布局占地大得多） */
  fieldR(l: { id: string; type: string }): [number, number] {
    const z = this.zoneById.get(l.id);
    const hole = z ? Math.max(620, Math.max(z.rx, z.ry * 1.2) + 260) : 620;
    return [hole, hole + (l.type === 'city' ? 2100 : 1200)];
  }
  zoneById = new Map<string, { rx: number; ry: number }>();
  private inField(wx: number, wy: number, locs: typeof LOCATIONS) {
    const cw = 300, chh = 210;
    for (const l of locs) {
      const lx = l.x * WORLD_SCALE, ly = l.y * WORLD_SCALE;
      const [hole, RR] = this.fieldR(l);
      const ang = (hash2(l.x, l.y, 77) - 0.5) * 0.7;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const dx = wx - lx, dy = wy - ly;
      const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
      const j = Math.floor(v / chh);
      const i = Math.floor((u - (j % 2 ? cw * 0.4 : 0)) / cw);
      const fx = i * cw + (j % 2 ? cw * 0.4 : 0), fy = j * chh;
      const dd = Math.hypot(fx + cw / 2, (fy + chh / 2) * 1.2);
      const h = hashU(i + ((l.x * 7) | 0), j + ((l.y * 13) | 0), 5);
      if (dd > RR * (0.55 + 0.45 * h) || dd < hole || h < 0.12) continue;
      return true;
    }
    return false;
  }

  // 城镇周边的田畴
  private drawFields(g: CanvasRenderingContext2D, ox: number, oy: number) {
    const PAL = ['196,202,136', '172,192,118', '214,198,128', '152,184,118', '204,210,160'];
    for (const l of LOCATIONS) {
      if (l.type !== 'city' && l.type !== 'town') continue;
      const lx = l.x * WORLD_SCALE, ly = l.y * WORLD_SCALE;
      const [hole, RR] = this.fieldR(l);
      if (lx + RR < ox || lx - RR > ox + CHUNK || ly + RR < oy || ly - RR > oy + CHUNK) continue;
      const ang = (hash2(l.x, l.y, 77) - 0.5) * 0.7;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const cw = 300, chh = 210;
      const n = Math.ceil(RR / chh);
      g.save(); g.translate(lx, ly); g.rotate(ang);
      for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
        const fx = i * cw + (j % 2 ? cw * 0.4 : 0), fy = j * chh;
        const cxm = fx + cw / 2, cym = fy + chh / 2;
        const dd = Math.hypot(cxm, cym * 1.2);
        const h = hashU(i + ((l.x * 7) | 0), j + ((l.y * 13) | 0), 5);
        if (dd > RR * (0.55 + 0.45 * h) || dd < hole) continue;
        const wx = lx + cxm * ca - cym * sa, wy = ly + cxm * sa + cym * ca;
        if (wx < ox - 400 || wx > ox + CHUNK + 400 || wy < oy - 400 || wy > oy + CHUNK + 400) continue;
        const sm = this.sample(wx, wy);
        if (sm.land < 0.62 || sm.elev > 0.3 || sm.cold > 0.6 || sm.arid > 0.75) continue;
        if (h < 0.12) continue; // 留白
        const c = PAL[(h * 97 | 0) % PAL.length];
        const a = 0.42 + h * 0.2;
        g.fillStyle = `rgba(${c},${a})`;
        const x0 = fx + 7, y0 = fy + 7, w = cw - 14, hh = chh - 14;
        g.fillRect(x0, y0, w, hh);
        g.strokeStyle = 'rgba(110,100,70,0.22)'; g.lineWidth = 2;
        g.beginPath();
        if (h > 0.55) for (let t = 18; t < w; t += 22) { g.moveTo(x0 + t, y0 + 4); g.lineTo(x0 + t, y0 + hh - 4); }
        else for (let t = 16; t < hh; t += 20) { g.moveTo(x0 + 4, y0 + t); g.lineTo(x0 + w - 4, y0 + t); }
        g.stroke();
        g.strokeStyle = 'rgba(96,110,70,0.35)'; g.lineWidth = 3; g.strokeRect(x0, y0, w, hh);
      }
      g.restore();
    }
  }

  nearRiver(wx: number, wy: number) {
    const x = (wx / WORLD_SCALE) | 0, y = (wy / WORLD_SCALE) | 0;
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return false;
    const tx = (x / MTILE) | 0, ty = (y / MTILE) | 0;
    const tile = this.getMacroTile(tx, ty);
    if (tile.riverMask === ZERO_U8) return false;
    return tile.riverMask[(y - ty * MTILE) * MSTRIDE + (x - tx * MTILE)] === 1;
  }
  inLocZone(wx: number, wy: number, pad = 0) {
    for (const z of this.locZones) {
      const dx = (wx - z.x) / (z.rx + pad), dy = (wy - z.y) / (z.ry + pad);
      if (dx * dx + dy * dy < 1) return z;
    }
    return null;
  }
  /** 地点核心区（广场、院落）：不长野草；外围仍可 */
  inLocCore(wx: number, wy: number) {
    for (const z of this.locZones) {
      const dx = (wx - z.x) / (z.rx * 0.62), dy = (wy - z.y) / (z.ry * 0.62);
      if (dx * dx + dy * dy < 1) return true;
    }
    return false;
  }
  demonNear(wx: number, wy: number) {
    for (const z of this.locZones) if (DEMON_SECTS.includes(z.id) && Math.hypot(wx - z.x, wy - z.y) < 5200) return true;
    return false;
  }

  private static readonly EMPTY_MTNS: readonly MtnDeco[] = [];
  private static readonly EMPTY_TREES: readonly TreeDeco[] = [];

  /** 装饰物（独立于底图缓存，可预取更大范围，避免高山突然出现） */
  getDecos(cx: number, cy: number): Deco[] {
    const key = cx + ',' + cy;
    let e = this.decoCache.get(key);
    if (!e) {
      e = { d: this.buildDecos(cx, cy), used: this.frame };
      this.decoCache.set(key, e);
      // 保留 O(1) LRU：覆盖视野及周边区域，避免长距离高速飞行时缓存颠簸重算 buildDecos。
      while (this.decoCache.size > DECO_CACHE_MAX) this.decoCache.delete(this.decoCache.keys().next().value!);
    } else {
      this.decoCache.delete(key);
      this.decoCache.set(key, e);
    }
    e.used = this.frame;
    return e.d;
  }

  /** 极远视口专用的山峰收集：只生成本块山峰，不触发树林/花林/小景计算，也不挤占 decoCache */
  getMountains(cx: number, cy: number): readonly MtnDeco[] {
    const hit = this.decoCache.get(cx + ',' + cy);
    if (hit) {
      const mtns = hit.d.filter((d): d is MtnDeco => d.kind === 'mtn');
      return mtns.length ? mtns : Terrain.EMPTY_MTNS;
    }
    const out: MtnDeco[] = [];
    this.collectLandforms(cx, cy, out, true);
    return out.length ? out : Terrain.EMPTY_MTNS;
  }

  /** 远景树片烘焙专用的树木收集：只生成本块真实树木，不触发山峰/小景计算，也不挤占 decoCache */
  getTrees(cx: number, cy: number): readonly TreeDeco[] {
    const hit = this.decoCache.get(cx + ',' + cy);
    if (hit) {
      const trees = hit.d.filter((d): d is TreeDeco => d.kind === 'tree');
      return trees.length ? trees : Terrain.EMPTY_TREES;
    }
    const out: TreeDeco[] = [];
    const lc = this.chunkLocalContext(cx, cy);
    this.collectTreesInChunk(cx, cy, lc, out);
    return out.length ? out : Terrain.EMPTY_TREES;
  }

  /** 草丛分布：按 56 像素网格抖动，随地貌决定疏密与种类（跨块连续） */
  getGrass(cx: number, cy: number): Clump[] {
    const key = cx + ',' + cy;
    let e = this.grassCache.get(key);
    if (!e) {
      e = { d: this.buildGrass(cx, cy), used: this.frame };
      this.grassCache.set(key, e);
      while (this.grassCache.size > GRASS_CACHE_MAX) this.grassCache.delete(this.grassCache.keys().next().value!);
    } else {
      this.grassCache.delete(key);
      this.grassCache.set(key, e);
    }
    e.used = this.frame;
    return e.d;
  }
  /** GPU 地表开启时只需前景摇摆大草，预过滤缓存减少 ~70% 每帧草丛循环 */
  getFgGrass(cx: number, cy: number): Clump[] {
    const key = cx + ',' + cy;
    let e = this.fgGrassCache.get(key);
    if (!e) {
      const all = this.getGrass(cx, cy);
      const fg: Clump[] = [];
      for (let i = 0; i < all.length; i++) {
        const c = all[i];
        if (c.lod > 1 || c.kind === 'sprig' || ((c.kind === 'tuft' || c.kind === 'clover') && c.ph > 1.6)) continue;
        fg.push(c);
      }
      e = { d: fg, used: this.frame };
      this.fgGrassCache.set(key, e);
      while (this.fgGrassCache.size > GRASS_CACHE_MAX) this.fgGrassCache.delete(this.fgGrassCache.keys().next().value!);
    } else {
      this.fgGrassCache.delete(key);
      this.fgGrassCache.set(key, e);
    }
    e.used = this.frame;
    return e.d;
  }
  private buildGrass(cx: number, cy: number): Clump[] {
    const out: Clump[] = [];
    const GC = 40, ox = cx * CHUNK, oy = cy * CHUNK;
    // 灌木（sprig）跟随「树木密度」：0 = 不生成，其余按网格索引取子集
    const stride = this.treeStride();
    // 城镇周边田畴：草少
    const towns = GRASS_TOWNS.filter((l) => Math.abs(l.x * WORLD_SCALE - ox - CHUNK / 2) < 3600 && Math.abs(l.y * WORLD_SCALE - oy - CHUNK / 2) < 3600);
    for (let Y = Math.floor(oy / GC); Y < Math.ceil((oy + CHUNK) / GC); Y++) for (let X = Math.floor(ox / GC); X < Math.ceil((ox + CHUNK) / GC); X++) {
      const h1 = hash2(X, Y, 41), h2 = hash2(X, Y, 42), h3 = hash2(X, Y, 43), h4 = hash2(X, Y, 44);
      const x = (X + h1) * GC, y = (Y + h2) * GC;
      if (x < ox || x >= ox + CHUNK || y < oy || y >= oy + CHUNK) continue;
      const s = this.sample(x, y);
      if (s.land < 0.6 || !this.isLand(x, y)) continue;
      if (this.riverEdge(x, y) < 14) continue;
      if (lmNoGrass(x, y)) continue;
      // 疏密：大尺度噪声形成成片的草甸与空地
      const patch = valueNoise(x / 520, y / 520, 47);
      let dens = clamp((patch - 0.4) * 2.0, 0.02, 0.62);   // 第十七步：成簇而疏（地表着色器已有细草）
      dens *= 1 - clamp((s.elev - 0.25) * 1.6, 0, 0.85);
      if (s.arid > 0.82) dens *= 0.12; else if (s.arid > 0.45) dens *= 0.36;
      if (s.cold > 0.6) dens *= 0.035;
      if (h3 > dens) {
        // 空地上的零星小草（sprig 跟随树木密度：0 不生成，>1 按网格取子集）
        if (stride > 0 && (stride === 1 || (X * 5 + Y * 3) % stride === 0)
          && h3 - dens < 0.35 && s.cold < 0.6 && s.arid < 0.82 && !this.nearRoad(x, y, 8) && !this.inLocCore(x, y))
          out.push({ x: x + 13, y: y + 9, kind: 'sprig', v: Math.floor(h4 * GRASS_VARIANTS), s: 0.9 + h1 * 0.4, ph: h2 * 6.28, lod: 2 });
        continue;
      }
      if (this.nearRoad(x, y, 14) || this.inLocCore(x, y)) continue;
      if (towns.length && this.inField(x, y, towns) && h4 > 0.15) continue;
      let kind: GrassKind;
      const k = hash2(X, Y, 45);
      if (s.cold > 0.6) kind = 'snow';
      else if (s.arid > 0.45) kind = k < 0.55 ? 'dry' : k < 0.8 ? 'tall' : k < 0.9 ? 'flower' : 'tuft';
      else if (s.forest > 0.45) kind = k < 0.1 ? 'fern' : k < 0.26 ? 'clover' : k < 0.36 ? 'flower' : 'tuft';
      else kind = k < 0.13 ? 'flower' : k < 0.24 ? 'clover' : k < 0.3 ? 'tall' : 'tuft';
      out.push({ x, y, kind, v: Math.floor(h4 * GRASS_VARIANTS), s: 0.85 + hash2(X, Y, 46) * 0.4 + patch * 0.25, ph: h1 * 6.28, lod: h2 < 0.45 ? 0 : 1 });
    }
    out.sort((a, b) => a.y - b.y);
    return out;
  }

  // ---------- 第十九步：程序化花林与瀑布 ----------
  private gvMemo = new Map<string, GroveSpot | null>();
  private fallMemo = new Map<string, FallSpot | null>();
  private procGrove(gx: number, gy: number): GroveSpot | null {
    const key = gx + ',' + gy;
    if (this.gvMemo.has(key)) return this.gvMemo.get(key)!;
    let res: GroveSpot | null = null;
    if (hash2(gx, gy, 311) < 0.12) {
      const x = (gx + 0.2 + hash2(gx, gy, 312) * 0.6) * GVC, y = (gy + 0.2 + hash2(gx, gy, 313) * 0.6) * GVC;
      const s = this.sample(x, y);
      if (s.land > 0.7 && this.isLand(x, y) && s.elev < 0.38 && s.arid < 0.4 && s.cold < 0.4 && !this.inLocZone(x, y, 500) && !landmarkAt(x, y, 600) && !this.nearRiver(x, y)) {
        const r = 300 + hash2(gx, gy, 314) * 260;
        res = { x, y, r, sp: 'peach', seed: (gx * 7919 + gy * 104729) >>> 0 } as GroveSpot;
        (res as any).mix = true;
      }
    }
    this.gvMemo.set(key, res);
    return res;
  }
  grovesNear(x: number, y: number, pad: number): GroveSpot[] {
    const out: GroveSpot[] = [];
    for (const g of SCENIC.groves) if (Math.abs(g.x - x) < g.r + pad && Math.abs(g.y - y) < g.r + pad) out.push(g);
    const gx = Math.floor(x / GVC), gy = Math.floor(y / GVC);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const g = this.procGrove(gx + i, gy + j); if (g && Math.abs(g.x - x) < g.r + pad && Math.abs(g.y - y) < g.r + pad) out.push(g); }
    return out;
  }
  /** 矩形范围内全部花林（供远景林色层一次性枚举，避免按 1000px 格点重复调 grovesNear） */
  grovesInRect(x0: number, y0: number, x1: number, y1: number): GroveSpot[] {
    const out: GroveSpot[] = [];
    for (const g of SCENIC.groves) {
      if (g.x + g.r >= x0 && g.x - g.r <= x1 && g.y + g.r >= y0 && g.y - g.r <= y1) out.push(g);
    }
    const gx0 = Math.floor(x0 / GVC) - 1, gx1 = Math.floor(x1 / GVC) + 1;
    const gy0 = Math.floor(y0 / GVC) - 1, gy1 = Math.floor(y1 / GVC) + 1;
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
      const g = this.procGrove(gx, gy);
      if (g && g.x + g.r >= x0 && g.x - g.r <= x1 && g.y + g.r >= y0 && g.y - g.r <= y1) out.push(g);
    }
    return out;
  }
  groveHere(x: number, y: number): GroveSpot | null {
    for (const g of this.grovesNear(x, y, 0)) { const dx = (x - g.x) / g.r, dy = (y - g.y) / (g.r * 0.75); if (dx * dx + dy * dy < 1.1) return g; }
    return null;
  }
  private procFall(gx: number, gy: number): FallSpot | null {
    const key = gx + ',' + gy;
    if (this.fallMemo.has(key)) return this.fallMemo.get(key)!;
    let res: FallSpot | null = null;
    if (hash2(gx, gy, 321) < 0.3) {
      const x = (gx + 0.2 + hash2(gx, gy, 322) * 0.6) * FC, y = (gy + 0.2 + hash2(gx, gy, 323) * 0.6) * FC;
      const s = this.sample(x, y);
      if (s.land > 0.7 && this.isLand(x, y) && this.isLand(x, y + 120) && s.elev > 0.5 && s.elev < 1.1 && s.arid < 0.45 && s.cold < 0.45 && !this.inLocZone(x, y, 500) && !landmarkAt(x, y, 300) && !this.onRoad(x, y)) {
        const h4 = hash2(gx, gy, 324);
        const w = 420 + h4 * 260, h = w * (0.9 + hash2(gx, gy, 325) * 0.45);
        res = { id: `wf${gx}_${gy}`, x, y, w, h, seed: (gx * 48271 + gy * 69621) >>> 0, tiers: 1 + Math.floor(hash2(gx, gy, 326) * 3) };
      }
    }
    this.fallMemo.set(key, res);
    return res;
  }
  procFallsNear(x: number, y: number, pad: number): FallSpot[] {
    const out: FallSpot[] = [];
    const gx = Math.floor(x / FC), gy = Math.floor(y / FC);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const f = this.procFall(gx + i, gy + j); if (f && Math.abs(f.x - x) < f.w + pad && Math.abs(f.y - y) < f.h + pad) out.push(f); }
    return out;
  }
  private nearProcFall(x: number, y: number, pad: number) {
    for (const f of this.procFallsNear(x, y, 0)) if (Math.abs(x - f.x) < f.w * 0.6 + pad * 0.5 && y < f.y + f.w * 0.5 + pad * 0.3 && y > f.y - f.h * 0.6 - pad) return true;
    return false;
  }
  /** 当前地图所有瀑布（地图界面、水声用） */
  allFallsIn(x0: number, y0: number, x1: number, y1: number): FallSpot[] {
    const out: FallSpot[] = SCENIC.falls.filter((f) => f.x > x0 && f.x < x1 && f.y > y0 && f.y < y1);
    for (let gy = Math.floor(y0 / FC); gy <= Math.floor(y1 / FC); gy++) for (let gx = Math.floor(x0 / FC); gx <= Math.floor(x1 / FC); gx++) { const f = this.procFall(gx, gy); if (f && f.x > x0 && f.x < x1 && f.y > y0 && f.y < y1) out.push(f); }
    return out;
  }

  private mountainStyle(wx: number, wy: number, s: Sample, h: number): MtnStyle {
    const mx = wx / WORLD_SCALE, my = wy / WORLD_SCALE;
    if (s.cold > 0.42 || (s.elev > 1.15 && s.cold > 0.2)) return 'snow';
    if (this.demonNear(wx, wy) && h < 0.75) return 'demon';
    if (s.arid > 0.75) return 'desert';
    if (s.arid > 0.45) return h < 0.7 ? 'qianjiang' : 'hill';
    const island = !pointInPoly(mx, my, MAINLAND);
    if (island) return 'island';
    const [lx, ly] = toLegacy(mx, my);   // 喀斯特峰林：梁国南部与正一盟一带（按旧版经纬）
    if (ly > 540 && lx > 430 && lx < 600 && h < 0.4) return 'karst';
    if (ly > 440 && ly < 540 && lx < 340 && h < 0.3) return 'karst';
    return h < 0.72 ? 'qinglv' : 'qianjiang';
  }

  /** 山峰删减区：青霞谷（南荒）为中心，r1 内删八成五，r1–r2 由五成五渐减到一成五 */
  private thinC: { x: number; y: number; r1: number; r2: number } | null | undefined;
  private thinCenter() {
    if (this.thinC !== undefined) return this.thinC;
    const l = LOCATIONS.find((q) => q.id === 'huangfeng');
    return (this.thinC = l ? { x: l.x * WORLD_SCALE, y: l.y * WORLD_SCALE, r1: 7500, r2: 16000 } : null);
  }

  private collectLandforms(cx: number, cy: number, out: Deco[], mountainsOnly: boolean) {
    const ox = cx * CHUNK, oy = cy * CHUNK;
    const inChunk = (x: number, y: number) => x >= ox && x < ox + CHUNK && y >= oy && y < oy + CHUNK;
    // ---------- 1. 山（粗网格，高处更密更高）----------
    // 网格 740（原 460 → 640 → 740）：山峰舒朗不重叠，减轻群山区域渲染负载。
    // 可用 __mtnMC 临时改（调试/对比用）。
    const MC = Number((globalThis as any).__mtnMC) || 740;
    // v0.57：青霞谷一带山太密，刚入门就卡——谷周围的寻常山峰大幅删减（名山、瀑布背后的山不动）
    // 青霞谷一带的「山峰删减区」默认关闭（原本会删掉谷周围约 85% 的寻常山峰）；
    // 需要旧行为：__mtnThin = 1
    const hf = Number((globalThis as any).__mtnThin) ? this.thinCenter() : null;
    for (let gy = Math.floor(oy / MC); gy <= Math.floor((oy + CHUNK) / MC); gy++) for (let gx = Math.floor(ox / MC); gx <= Math.floor((ox + CHUNK) / MC); gx++) {
      for (let k = 0; k < 2; k++) {
        const h1 = hash2(gx, gy, 101 + k * 10), h2 = hash2(gx, gy, 102 + k * 10), h3 = hash2(gx, gy, 103 + k * 10), h4 = hash2(gx, gy, 104 + k * 10), h5 = hash2(gx, gy, 105 + k * 10);
        const wx = (gx + h1) * MC, wy = (gy + h2) * MC;
        if (!inChunk(wx, wy)) continue;
        const s = this.sample(wx, wy);
        if (s.land < 0.55 || !this.isLand(wx, wy + 40)) continue;
        if (this.inLocZone(wx, wy, 260) || this.onRoad(wx, wy)) continue;
        if (lmCleared(wx, wy, 260) || this.nearProcFall(wx, wy, 700)) continue;
        if (hf) {
          const dd = Math.hypot(wx - hf.x, wy - hf.y);
          if (dd < hf.r2 && (k === 1 || h5 < (dd < hf.r1 ? 0.85 : 0.55 * (1 - (dd - hf.r1) / (hf.r2 - hf.r1)) + 0.15))) continue;
        }
        const e = s.elev;
        if (k === 1 && e < 0.88) continue; // 高山区第二座（叠峦）
        let w = 0, hh = 0, style: MtnStyle;
        if (e > 0.42) {
          const p = clamp((e - 0.42) * 2.4, 0, 0.97);
          if (h3 > p) continue;
          style = this.mountainStyle(wx, wy, s, h4);
          { const LM = landmarkAt(wx, wy); if (LM?.mtnStyle && style !== 'snow') style = LM.mtnStyle; }
          w = (540 + (e - 0.42) * 1800 * (0.6 + h4 * 0.65)) * (k ? 0.75 : 1);
          w = Math.min(w, 1750);
          hh = w * (0.42 + Math.min(1, e) * 0.3) * (0.8 + h5 * 0.4);
          if (style === 'karst') hh *= 1.12;
          if (style === 'desert') hh *= 0.6;
          if (style === 'hill') hh *= 0.5;
        } else if (e > 0.24) {
          if (h3 > 0.32) continue;
          style = s.arid > 0.75 ? 'desert' : this.mountainStyle(wx, wy, s, h4) === 'island' ? 'island' : s.cold > 0.42 ? 'snow' : 'hill';
          w = 360 + h4 * 360; hh = w * (0.32 + h5 * 0.15);
        } else continue;
        // 整体再抽掉 30%（默认保留 70%），按坐标哈希决定，重建/读档都不会变。
        // 想改比例：__mtnKeep = 0.8（保留八成），下一块地图生效。
        if (hash2(gx, gy, 106 + k * 10) > Number((globalThis as any).__mtnKeep ?? 0.70)) continue;
        const id = `m${gx}_${gy}_${k}`;
        const spec: MtnSpec = {
          seed: (gx * 92821 + gy * 68917 + k * 7) >>> 0, style, w, h: hh,
          cliff: h5 < 0.28 && style !== 'hill', waterfall: e > 0.66 && s.arid < 0.5 && s.cold < 0.5 && h1 < 0.22 && style !== 'desert' && style !== 'demon',
          path: h2 < 0.08 && style !== 'snow', snowcap: e > 0.9 && style !== 'snow' && style !== 'desert' && style !== 'hill' && s.arid < 0.6, pavilion: h2 < 0.05, clouds: w > 1250 && h4 < 0.45, layers: w > 1400 ? 3 : w > 680 ? 2 : 1,
        };
        out.push({ kind: 'mtn', id, spec, x: wx, y: wy + 30, w, h: hh, flip: h5 < 0.5 });
      }
    }
    // ---------- 1b. 原著名地的山峰、名山 ----------
    const named = [...SCENIC.peaks];
    for (const L of LANDMARKS) if (Math.abs(L.x - ox) < L.r + CHUNK * 2 && Math.abs(L.y - oy) < L.r + CHUNK * 2) named.push(...L.peaks as any);
    for (const p of named) {
      if (!inChunk(p.x, p.y)) continue;
      const spec: MtnSpec = { seed: p.seed >>> 0, style: p.style, w: p.w, h: p.h, cliff: p.style !== 'danxia', waterfall: !!p.waterfall, path: false, pavilion: false, snowcap: !!p.snow, clouds: !!p.clouds, layers: p.w > 1400 ? 3 : 2 };
      out.push({ kind: 'mtn', id: p.id, spec, x: p.x, y: p.y, w: p.w, h: p.h, flip: !!p.flip });
    }
    // ---------- 1c. 瀑布 ----------
    for (const f of [...SCENIC.falls, ...this.procFallsNear(ox + CHUNK / 2, oy + CHUNK / 2, CHUNK)]) {
      if (!inChunk(f.x, f.y)) continue;
      if (!mountainsOnly) out.push({ kind: 'fall', id: f.id, x: f.x, y: f.y, w: f.w, h: f.h, seed: f.seed, tiers: f.tiers, name: f.name });
      // 背后的山：瀑布挂在山脚的崖壁上，不至于孤零零立在平地
      const s0 = this.sample(f.x, f.y);
      const bst: MtnStyle = s0.cold > 0.42 ? 'snow' : landmarkAt(f.x, f.y)?.mtnStyle ?? (this.mountainStyle(f.x, f.y, s0, 0.3) === 'karst' ? 'karst' : 'qinglv');
      const bw = Math.min(1850, f.w * 2.4), bh = Math.max(f.h * 1.7, bw * 0.62);
      out.push({ kind: 'mtn', id: f.id + '_bg', spec: { seed: (f.seed * 31 + 7) >>> 0, style: bst, w: bw, h: bh, cliff: true, waterfall: false, path: false, pavilion: false, snowcap: false, clouds: bw > 1300, layers: bw > 1400 ? 3 : 2 }, x: f.x + (hash2(f.x | 0, 1, 3) - 0.5) * f.w * 0.3, y: f.y - f.h * 0.42, w: bw, h: bh, flip: hash2(f.x | 0, 2, 3) < 0.5 });
    }
  }

  private chunkLocalContext(cx: number, cy: number) {
    const ox = cx * CHUNK, oy = cy * CHUNK;
    const cxMid = ox + CHUNK * 0.5, cyMid = oy + CHUNK * 0.5, halfChunk = CHUNK * 0.5;
    const chunkZones = this.locZones.filter((z) => Math.abs(z.x - cxMid) < z.rx + 260 + halfChunk && Math.abs(z.y - cyMid) < z.ry + 260 + halfChunk);
    const inZoneLocal = (x: number, y: number, pad: number) => {
      for (let i = 0; i < chunkZones.length; i++) {
        const z = chunkZones[i];
        const dx = (x - z.x) / (z.rx + pad), dy = (y - z.y) / (z.ry + pad);
        if (dx * dx + dy * dy < 1) return true;
      }
      return false;
    };
    const chunkGroves: GroveSpot[] = [];
    for (const g of SCENIC.groves) if (Math.abs(g.x - cxMid) < g.r + CHUNK && Math.abs(g.y - cyMid) < g.r + CHUNK) chunkGroves.push(g);
    for (let gy = Math.floor(oy / GVC) - 1; gy <= Math.floor((oy + CHUNK) / GVC) + 1; gy++) {
      for (let gx = Math.floor(ox / GVC) - 1; gx <= Math.floor((ox + CHUNK) / GVC) + 1; gx++) {
        const g = this.procGrove(gx, gy);
        if (g && Math.abs(g.x - cxMid) < g.r + CHUNK && Math.abs(g.y - cyMid) < g.r + CHUNK) chunkGroves.push(g);
      }
    }
    const inGroveLocal = (x: number, y: number) => {
      for (let i = 0; i < chunkGroves.length; i++) {
        const g = chunkGroves[i];
        const dx = (x - g.x) / g.r, dy = (y - g.y) / (g.r * 0.75);
        if (dx * dx + dy * dy < 1.1) return true;
      }
      return false;
    };
    const chunkFalls: FallSpot[] = [];
    for (let gy = Math.floor(oy / FC) - 1; gy <= Math.floor((oy + CHUNK) / FC) + 1; gy++) {
      for (let gx = Math.floor(ox / FC) - 1; gx <= Math.floor((ox + CHUNK) / FC) + 1; gx++) {
        const f = this.procFall(gx, gy);
        if (f && Math.abs(f.x - cxMid) < f.w * 0.6 + 130 + halfChunk && Math.abs(f.y - cyMid) < Math.max(f.w * 0.5 + 78, f.h * 0.6 + 260) + halfChunk) chunkFalls.push(f);
      }
    }
    const nearFallLocal = (x: number, y: number, pad: number) => {
      for (let i = 0; i < chunkFalls.length; i++) {
        const f = chunkFalls[i];
        if (Math.abs(x - f.x) < f.w * 0.6 + pad * 0.5 && y < f.y + f.w * 0.5 + pad * 0.3 && y > f.y - f.h * 0.6 - pad) return true;
      }
      return false;
    };
    let hasLm = false;
    for (const L of LANDMARKS) { if (Math.abs(cxMid - L.x) <= L.r + 3000 + halfChunk && Math.abs(cyMid - L.y) <= L.r + 3000 + halfChunk) { hasLm = true; break; } }
    if (!hasLm) for (const p of SCENIC.peaks) { if (Math.abs(cxMid - p.x) < p.w * 0.55 + halfChunk && Math.abs(cyMid - p.y) < Math.max(250, p.h * 0.5) + halfChunk) { hasLm = true; break; } }
    if (!hasLm) for (const f of SCENIC.falls) { if (Math.abs(cxMid - f.x) < f.w * 0.75 + halfChunk && Math.abs(cyMid - f.y) < Math.max(f.w * 0.6, f.h * 0.6) + halfChunk) { hasLm = true; break; } }

    const mx0 = Math.max(0, ((ox / WORLD_SCALE) | 0) - 1), mx1 = Math.min(this.W - 1, (((ox + CHUNK) / WORLD_SCALE) | 0) + 1);
    const my0 = Math.max(0, ((oy / WORLD_SCALE) | 0) - 1), my1 = Math.min(this.H - 1, (((oy + CHUNK) / WORLD_SCALE) | 0) + 1);
    let hasRoad = false, hasRiver = false;
    const tx0 = (mx0 / MTILE) | 0, tx1 = (mx1 / MTILE) | 0, ty0 = (my0 / MTILE) | 0, ty1 = (my1 / MTILE) | 0;
    for (let ty = ty0; ty <= ty1 && (!hasRoad || !hasRiver); ty++) {
      for (let tx = tx0; tx <= tx1 && (!hasRoad || !hasRiver); tx++) {
        const tile = this.getMacroTile(tx, ty);
        if (tile.allSea) continue;
        if (tile.roadMask === ZERO_U8 && tile.riverMask === ZERO_U8) continue;
        const lx0 = Math.max(0, mx0 - tx * MTILE), lx1 = Math.min(MTILE - 1, mx1 - tx * MTILE);
        const ly0 = Math.max(0, my0 - ty * MTILE), ly1 = Math.min(MTILE - 1, my1 - ty * MTILE);
        for (let ly = ly0; ly <= ly1 && (!hasRoad || !hasRiver); ly++) {
          const row = ly * MSTRIDE;
          for (let lx = lx0; lx <= lx1; lx++) {
            if (tile.roadMask[row + lx] === 1) hasRoad = true;
            if (tile.riverMask[row + lx] === 1) hasRiver = true;
          }
        }
      }
    }
    return { ox, oy, chunkZones, inZoneLocal, chunkGroves, inGroveLocal, chunkFalls, nearFallLocal, hasLm, hasRoad, hasRiver };
  }

  private collectTreesInChunk(cx: number, cy: number, lc: ReturnType<Terrain['chunkLocalContext']>, out: Deco[]) {
    const { ox, oy, chunkZones, inZoneLocal, chunkGroves, inGroveLocal, chunkFalls, nearFallLocal, hasLm, hasRoad, hasRiver } = lc;
    const stride = this.treeStride();
    const keepTree = (x: number, y: number) => stride !== 0 && (stride === 1 || (((Math.round(x) * 73856093) ^ (Math.round(y) * 19349663)) >>> 0) % stride === 0);
    const inChunk = (x: number, y: number) => x >= ox && x < ox + CHUNK && y >= oy && y < oy + CHUNK;

    // ---------- 1d. 花林（桃、杏，冬梅秋枫）----------
    for (const gv of chunkGroves) {
      const SP = 70;
      const rnd = mulberry32((gv.seed ^ 0x9e37) >>> 0);
      for (let yy = Math.floor((oy) / SP); yy <= Math.floor((oy + CHUNK) / SP); yy++) for (let xx = Math.floor(ox / SP); xx <= Math.floor((ox + CHUNK) / SP); xx++) {
        const j1 = hash2(xx, yy, 301), j2 = hash2(xx, yy, 302), j3 = hash2(xx, yy, 303);
        const x = (xx + j1 * 0.8) * SP, y = (yy + j2 * 0.8) * SP;
        if (!inChunk(x, y)) continue;
        const dx = (x - gv.x) / gv.r, dy = (y - gv.y) / (gv.r * 0.75);
        const q = dx * dx + dy * dy + (valueNoise(x / 160, y / 160, gv.seed & 255) - 0.5) * 0.5;
        if (q > 1) continue;
        if (q > 0.6 && j3 < (q - 0.6) * 1.6) continue;           // 林缘稀疏
        if (j3 > 0.86) continue;                                // 林间空地
        if (!this.isLand(x, y) || (hasRoad && this.onRoad(x, y)) || (chunkZones.length && inZoneLocal(x, y, 200)) || (hasRiver && this.riverEdge(x, y) < 40) || (hasLm && lmCleared(x, y))) continue;
        let sp = gv.sp;
        if ((gv as any).mix) sp = GROVE_MIX[Math.floor(hash2(xx, yy, 304) * GROVE_MIX.length)];
        else if (hash2(xx, yy, 305) < 0.12) sp = sp === 'peach' ? 'apricot' : sp === 'apricot' ? 'peach' : sp;
        const sc = (0.82 + hash2(xx, yy, 306) * 0.36) * (1.08 - q * 0.2);
        const base = TREE_SIZE[sp] * sc;
        if (!keepTree(x, y)) continue;
        out.push({ kind: 'tree', sp, v: Math.floor(hash2(xx, yy, 307) * TREE_VARIANTS), x, y, w: base * 1.2, h: base * 1.35, s: sc, flip: rnd() < 0.5, ph: rnd() * Math.PI * 2, lod: (xx + yy) % 3 });
      }
    }
    // ---------- 2. 树林（成片的林子，大小不一）----------
    const GC = 640;
    for (let gy = Math.floor((oy - 700) / GC); gy <= Math.floor((oy + CHUNK + 700) / GC); gy++) for (let gx = Math.floor((ox - 700) / GC); gx <= Math.floor((ox + CHUNK + 700) / GC); gx++) {
      const h1 = hash2(gx, gy, 201), h2 = hash2(gx, gy, 202), h3 = hash2(gx, gy, 203), h4 = hash2(gx, gy, 204);
      const gcx = (gx + h1) * GC, gcy = (gy + h2) * GC;
      const s = this.sample(gcx, gcy);
      if (s.land < 0.5) continue;
      const nearW = this.nearRiver(gcx, gcy) || s.land < 0.66;
      let dens = s.forest * 1.15 + 0.14;
      if (s.arid > 0.8) dens = 0.06; else if (s.arid > 0.45) dens = 0.1 + s.forest * 0.3;
      if (s.cold > 0.62) dens = 0.12 + s.forest * 0.5;
      if (nearW) dens += 0.25;
      if (s.elev > 0.6) dens *= 0.35;
      dens *= 0.42;                                   // 第三步：野外树木大幅减少，留出开阔田野
      if (this.inLocZone(gcx, gcy, 900)) dens *= 0.3; // 城镇宗门周边空旷
      if (h3 > dens) continue;
      const island = !pointInPoly(gcx / WORLD_SCALE, gcy / WORLD_SCALE, MAINLAND);
      const zq = zoneAt(gcx, gcy);   // 第三十步：魔道地界多枫与枯木，阴地多枯木与柏
      const zone = this.inLocZone(gcx, gcy, 2600)?.id === 'huangfeng' ? 'ymaple' : zq.k > 0.3 ? (zq.t === 1 ? 'demon' : 'ghost') : undefined;
      const R = (90 + h4 * 230 + s.forest * 180) * (s.arid > 0.6 ? 0.5 : 1);
      const sp1 = pickSpecies(h4, { ...s, nearWater: nearW, island, zone });
      const sp2 = pickSpecies(hash2(gx, gy, 205), { ...s, nearWater: nearW, island, zone });
      const spacing = s.forest > 0.5 ? 74 : 100;
      const n = Math.min(42, Math.max(1, Math.round((Math.PI * R * R) / (spacing * spacing) * (0.45 + s.forest * 0.6))));
      const rnd = mulberry32((gx * 73856093) ^ (gy * 19349663) ^ 0x7777);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * R;
        const x = gcx + Math.cos(a) * rr, y = gcy + Math.sin(a) * rr * 0.75;
        const hv = rnd(), hs = rnd(), hf = rnd(), hp = rnd(), hsp = rnd();
        if (!inChunk(x, y)) continue;
        if (!this.isLand(x, y)) continue;
        if ((hasRoad && this.onRoad(x, y)) || (chunkZones.length && inZoneLocal(x, y, 260))) continue;
        if (hasRiver && this.riverEdge(x, y) < 40) continue;
        if ((hasLm && lmCleared(x, y)) || (chunkGroves.length && inGroveLocal(x, y)) || (chunkFalls.length && nearFallLocal(x, y, 260))) continue;
        const ss = this.sample(x, y);
        if (ss.elev > 0.62 && hsp < 0.8) continue;
        let sp: Species = hsp < 0.72 ? sp1 : sp2;
        const LM = hasLm ? landmarkAt(x, y) : null;
        if (LM?.trees) { if (LM.treeK !== undefined && LM.treeK < 1 && hv > LM.treeK) continue; sp = LM.trees[Math.floor(hsp * LM.trees.length) % LM.trees.length]; }
        if (sp === 'willow' && !((hasRiver && this.nearRiver(x, y)) || ss.land < 0.66)) sp = s.cold > 0.4 ? 'pine' : 'broad';
        // 边缘的树小一点，林心大
        const sc = (0.78 + hs * 0.4) * (1.1 - (rr / R) * 0.25);
        const base = TREE_SIZE[sp] * sc;
        if (!keepTree(x, y)) continue;
        out.push({ kind: 'tree', sp, v: Math.floor(hv * TREE_VARIANTS), x, y, w: base * 1.2, h: base * 1.35, s: sc, flip: hf < 0.5, ph: hp * Math.PI * 2, lod: i % 3 });
      }
    }
  }

  private buildDecos(cx: number, cy: number): Deco[] {
    const out: Deco[] = [];
    this.collectLandforms(cx, cy, out, false);
    const lc = this.chunkLocalContext(cx, cy);
    this.collectTreesInChunk(cx, cy, lc, out);
    const { ox, oy, chunkZones, inZoneLocal, hasRoad, hasRiver } = lc;
    const inChunk = (x: number, y: number) => x >= ox && x < ox + CHUNK && y >= oy && y < oy + CHUNK;
    // ---------- 3. 小装饰（芦苇、浪花、草丛、山石、灌木、毡帐）----------
    const n = CHUNK / CELL;
    for (let gy = 0; gy < Math.ceil(n); gy++) for (let gx = 0; gx < Math.ceil(n); gx++) {
      const X = Math.floor(ox / CELL) + gx, Y = Math.floor(oy / CELL) + gy;
      const h1 = hash2(X, Y, 1), h2 = hash2(X, Y, 2), h3 = hash2(X, Y, 3), h4 = hash2(X, Y, 4), h5 = hash2(X, Y, 5);
      const wx = X * CELL + h1 * CELL, wy = Y * CELL + h2 * CELL;
      if (!inChunk(wx, wy)) continue;
      const s = this.sample(wx, wy);
      const onLand = this.isLand(wx, wy);
      if (!onLand) {
        if (s.land < 0.3 && h3 < 0.06 && this.waveGlyph) out.push({ kind: 'img', img: this.waveGlyph, x: wx, y: wy, w: 150, h: 56, flip: h4 < 0.5, alpha: 0.7 });
        else if (s.land > 0.36 && s.land < 0.5 && h3 < 0.35 && this.reedGlyph && s.cold < 0.5) out.push({ kind: 'img', img: this.reedGlyph, x: wx, y: wy, w: 62, h: 70, flip: h4 < 0.5, alpha: 0.9 });
        continue;
      }
      if ((chunkZones.length && inZoneLocal(wx, wy, 40)) || (hasRoad && this.nearRoad(wx, wy, 40))) continue;
      const rock = this.rockGlyphs.length ? this.rockGlyphs[(h5 * 3) | 0] : null;
      const re = hasRiver ? this.riverEdge(wx, wy) : 1e9;
      if (re < -18) continue;
      if (re < 70 && this.reedGlyph && h3 < 0.55 && s.cold < 0.5) out.push({ kind: 'img', img: this.reedGlyph, x: wx, y: wy, w: 62, h: 70, flip: h4 < 0.5, alpha: 0.9 });
      else if (s.elev > 0.3) { if (rock && h3 < 0.18) { const k = 0.7 + h4 * 0.6; out.push({ kind: 'img', img: rock, x: wx, y: wy, w: 120 * k, h: 86 * k, flip: h4 < 0.5, alpha: 1 }); } }
      else if (s.arid > 0.8) {
        if (this.shrubGlyph && h3 < 0.14) out.push({ kind: 'img', img: this.shrubGlyph, x: wx, y: wy, w: 80 + h4 * 40, h: (80 + h4 * 40) * 0.82, flip: h4 < 0.5, alpha: 0.95 });
        else if (h3 > 0.93 && rock) out.push({ kind: 'img', img: rock, x: wx, y: wy, w: 110, h: 76, flip: h4 < 0.5, alpha: 1 });
      } else if (s.arid > 0.45) {
        if (h3 > 0.95 && rock) out.push({ kind: 'img', img: rock, x: wx, y: wy, w: 100, h: 69, flip: h4 < 0.5, alpha: 1 });
      } else if (h3 > 0.965 && rock) out.push({ kind: 'img', img: rock, x: wx, y: wy, w: 90, h: 62, flip: h4 < 0.5, alpha: 1 });
    }
    return out;
  }

  // ---------- 全图（世界地图界面用） ----------
  overviewBase: HTMLCanvasElement | null = null;
  buildOverview(scale = 1): HTMLCanvasElement {
    const MAX_OV = 1600;
    const ovScale = Math.min(scale, MAX_OV / Math.max(this.W, this.H));
    this.overviewScale = ovScale;
    const W = Math.max(1, Math.round(this.W * ovScale)), H = Math.max(1, Math.round(this.H * ovScale));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d')!;
    const fullTiles = Math.ceil(this.W / MTILE) * Math.ceil(this.H / MTILE);
    this.macroCacheLimit = Math.max(MTILE_CACHE_MAX, Math.min(256, fullTiles));
    try {
      const img = g.createImageData(W, H);
      this.overviewRows(img, 0, 0, ovScale, 0, H);
      g.putImageData(img, 0, 0);
      // 不带图标的底色副本（小地图放大时先把它平滑放大，再在上面画清晰的矢量）
      const base = document.createElement('canvas'); base.width = W; base.height = H; base.getContext('2d')!.drawImage(cv, 0, 0);
      this.overviewBase = base;
      this.overviewVectors(g, 0, 0, W, H, ovScale);
    } finally {
      this.trimMacroCache(MTILE_CACHE_MAX);
    }
    return cv;
  }

  /** 分片异步渲染全图缩略底图，避免浏览器主线程卡顿 */
  async buildOverviewAsync(scale = 1, onProgress?: (frac: number) => void): Promise<HTMLCanvasElement> {
    const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0));
    const MAX_OV = 1600;
    const ovScale = Math.min(scale, MAX_OV / Math.max(this.W, this.H));
    this.overviewScale = ovScale;
    const W = Math.max(1, Math.round(this.W * ovScale)), H = Math.max(1, Math.round(this.H * ovScale));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d')!;
    const fullTiles = Math.ceil(this.W / MTILE) * Math.ceil(this.H / MTILE);
    this.macroCacheLimit = Math.max(MTILE_CACHE_MAX, Math.min(256, fullTiles));
    try {
      const img = g.createImageData(W, H);
      let y = 0;
      while (y < H) {
        const tSlice = performance.now();
        while (y < H && performance.now() - tSlice < 48) {
          const y2 = Math.min(H, y + 32);
          this.overviewRows(img, 0, 0, ovScale, y, y2);
          y = y2;
        }
        onProgress?.(0.85 * (y / H));
        if (y < H) await yieldFrame();
      }
      g.putImageData(img, 0, 0);
      const base = document.createElement('canvas'); base.width = W; base.height = H; base.getContext('2d')!.drawImage(cv, 0, 0);
      this.overviewBase = base;
      await yieldFrame();
      this.overviewVectors(g, 0, 0, W, H, ovScale);
      onProgress?.(1);
    } finally {
      this.trimMacroCache(MTILE_CACHE_MAX);
    }
    return cv;
  }

  /** 第二十步：小地图放大用的局部高清底图——逐行填像素（可分帧），x0/y0 为宏观单位，img 尺寸 = 区域 × scale */
  overviewRows(img: ImageData, x0: number, y0: number, scale: number, rowFrom: number, rowTo: number) {
    const W = img.width, col = [0, 0, 0];
    for (let y = rowFrom; y < rowTo; y++) for (let x = 0; x < W; x++) {
      this.colorAt((x0 + (x + 0.5) / scale) * WORLD_SCALE, (y0 + (y + 0.5) / scale) * WORLD_SCALE, col);
      const k = (y * W + x) * 4;
      img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
    }
  }

  /** 河流、道路、山林小图标（矢量），画到以 (x0,y0) 宏观单位为左上角、每单位 scale 像素的画布上 */
  overviewVectors(g: CanvasRenderingContext2D, x0: number, y0: number, Wpx: number, Hpx: number, scale: number) {
    const fine = scale >= 3;
    // 随缩放倍率的连续插值系数（1× → 2× → 4× 平滑过渡，避免在某个挡位处山林/路网尺寸突变）
    const fineT = Math.max(0, Math.min(1, (scale - 1) / 3));
    const padX = fine ? 6 : 12, padTop = 4, padBot = fine ? 8 : 20;
    const ux0 = x0 - padX, uy0 = y0 - padTop, ux1 = x0 + Wpx / scale + padX, uy1 = y0 + Hpx / scale + padBot;
    g.save(); g.scale(scale, scale); g.translate(-x0, -y0);
    // 河流
    g.lineCap = 'round'; g.lineJoin = 'round';
    // 第三十步：按包围盒剔除——放大地图时每块只描与之相交的河 / 路（整条描边、尤其是虚线，很贵）
    const off = (o: any) => { let b = o._bb; if (!b) { b = o._bb = [1e9, 1e9, -1e9, -1e9]; for (const [x, y] of o.pts) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; } } return b[2] < ux0 - 4 || b[0] > ux1 + 4 || b[3] < uy0 - 4 || b[1] > uy1 + 4; };
    if (scale >= 2 && this.rivSegW.length >= 8) {
      g.strokeStyle = 'rgba(116,150,158,0.92)';
      const S = WORLD_SCALE, seg = this.rivSegW;
      const rwMul = 1.05 + (1 - fineT) * 0.25;
      for (let i = 0; i < seg.length; i += 8) {
        const ax = seg[i] / S, ay = seg[i + 1] / S, bx = seg[i + 2] / S, by = seg[i + 3] / S;
        const mw = seg[i + 4] / S;
        if (Math.max(ax, bx) + mw < ux0 || Math.min(ax, bx) - mw > ux1 || Math.max(ay, by) + mw < uy0 || Math.min(ay, by) - mw > uy1) continue;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by);
        g.lineWidth = Math.max(0.28, mw * rwMul);
        g.stroke();
      }
    } else {
      for (const rv of this.rivers) {
        if (off(rv)) continue;
        g.beginPath(); rv.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.strokeStyle = 'rgba(120,150,155,0.9)'; g.lineWidth = 0.9 * rv.w; g.stroke();
      }
    }
    // 道路
    // 山林图标尺寸随 scale 平滑过渡（step=3 整除 6/12/24/48 切片边界，保证无缝衔接）
    const iconK = 1 - fineT * 0.6;
    const step = scale >= 2 ? 3 : 6;
    const jit = scale >= 2 ? 2 + (1 - fineT) * 0.8 : 4;
    g.setLineDash([2 / Math.max(1, scale / 3), 2 / Math.max(1, scale / 3)]);
    for (const rd of this.roads) {
      if (off(rd)) continue;
      g.beginPath(); rd.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.strokeStyle = 'rgba(120,96,60,0.55)'; g.lineWidth = (rd.major ? 1.1 : 0.7) / Math.max(1, scale / 2); g.stroke();
    }
    g.setLineDash([]);
    // 山与林的小图标（代码绘制）
    const gy0 = Math.max(4, 4 + Math.floor((uy0 - 4) / step) * step), gx0 = Math.max(4, 4 + Math.floor((ux0 - 4) / step) * step);
    const mtLineW = 0.5 - fineT * 0.28;
    const fk = 1 - fineT * 0.5;
    for (let y = gy0; y < this.H && y < uy1; y += step) for (let x = gx0; x < this.W && x < ux1; x += step) {
      const jx = x + (hash2(x, y, 5) - 0.5) * jit, jy = y + (hash2(x, y, 6) - 0.5) * jit;
      const m = this.macroAt(jx, jy);
      if (m.land < 0.55) continue;
      const e = m.elev;
      if (e > 0.45 && hash2(x, y, 8) < (e - 0.3) * 1.6) {
        const w = (6 + e * 9) * iconK, h = w * (0.55 + hash2(x, y, 9) * 0.4);
        const snow = m.cold > 0.42, desert = m.arid > 0.75;
        const base = snow ? '#c8d0dc' : desert ? '#c09a62' : '#6f8a7a';
        g.beginPath(); g.moveTo(jx - w / 2, jy); g.quadraticCurveTo(jx - w * 0.15, jy - h * 0.7, jx, jy - h); g.quadraticCurveTo(jx + w * 0.2, jy - h * 0.6, jx + w / 2, jy); g.closePath();
        g.fillStyle = base; g.fill();
        g.beginPath(); g.moveTo(jx, jy - h); g.quadraticCurveTo(jx + w * 0.2, jy - h * 0.6, jx + w / 2, jy); g.lineTo(jx + w * 0.05, jy); g.closePath();
        g.fillStyle = 'rgba(30,40,40,0.28)'; g.fill();
        if (snow || e > 0.95) { g.beginPath(); g.moveTo(jx - w * 0.12, jy - h * 0.75); g.lineTo(jx, jy - h); g.lineTo(jx + w * 0.1, jy - h * 0.78); g.closePath(); g.fillStyle = '#fafcff'; g.fill(); }
        g.strokeStyle = 'rgba(40,40,36,0.6)'; g.lineWidth = mtLineW;
        g.beginPath(); g.moveTo(jx - w / 2, jy); g.quadraticCurveTo(jx - w * 0.15, jy - h * 0.7, jx, jy - h); g.quadraticCurveTo(jx + w * 0.2, jy - h * 0.6, jx + w / 2, jy); g.stroke();
      } else if (m.forest > 0.5 && hash2(x, y, 7) < 0.7) {
        g.fillStyle = m.cold > 0.5 ? 'rgba(50,80,70,0.7)' : 'rgba(60,100,60,0.65)';
        for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(jx + (k - 1) * 1.6 * fk, jy - (k % 2) * 1.2 * fk, 1.4 * fk, 0, Math.PI * 2); g.fill(); }
      }
    }
    g.restore();
  }
}

// 全局树木密度设置（设置面板调用）：写完立刻让所有地形实例失效树/草缓存并重算
if (typeof globalThis !== 'undefined') {
  const gg = globalThis as any;
  if (!gg.__setTreeDensity) {
    gg.__setTreeDensity = (v: number) => {
      const n = Math.max(0, Math.min(8, Math.round(v)));
      gg.__treeDensity = n;
      for (const t of (gg.__terrains ?? [])) t.applyTreeDensity?.(n);
    };
  }
}
