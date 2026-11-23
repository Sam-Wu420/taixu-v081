import { MOUNTAINS, TerrainSurface, type SurfaceRoad } from './surface';
import type { TerrainBakeData, FieldSite, SeamFrame } from './terrain-bake-data';
import { grandSectPlan, routeAroundGrandSect, rectDist, onPlanStair, planDeck } from '../data/sectPlan';
import { grandSectGrounds, paintGrandSects, type GrandSectGround } from './sectGround';
import { sectChunkTrees } from './sectTrees';
import { X_DEMON } from '../data/sects';
// 人界地形：宏观栅格 + 分块水墨渲染
import { fbm, hash2, valueNoise, mulberry32, clamp, hashU, pnoise } from '../core/rng';
import { MAP_SEAMS, mapFrame, mapSize, SEAM_ROAD, ACTIVE_MAP as SEAM_MAP, MAP_TINT, TN_K } from '../data/world';
import { outlandAt, type OutlandField } from './outland';
/** 图外交界地带：离图边这么多宏观格以内，从图边的地貌渐变成草原（30 格 = 9000 单位） */
const OUTLAND_BLEND = 30;
/** 不通的边外铺多宽的海（世界单位）：和世界地图上人界浮陆四周那圈海一样宽 */
const OCEAN_MARGIN = 60000;
/** 不通的边外，图边的地貌化成深海要多远（宏观格）；化开的距离再用噪声揉 ±一半，岸线才是曲折的 */
const OCEAN_BLEND = 26;
import { makeCanvas } from '../core/canvas';
import {
  MACRO_W, MACRO_H, WORLD_SCALE, MAINLAND, LAKES, LAKE_ISLES, RANGES, RIVERS, ARID_ZONES, COLD_ZONES, FOREST_ZONES,
  LOCATIONS, ISLAND_FIELD, EXTRA_ISLANDS, ISLAND_K, pointInPoly, toLegacy, P, zoneAt } from '../data/world';
import type { MtnSpec, MtnStyle } from '../gfx/mountain';
import { pickSpecies, Species, TREE_SIZE } from '../gfx/tree';
import { getLayout, setLayoutEnv, LOC_SCALE } from '../gfx/building';
import { usesNewCity } from '../gfx/citySize';
import { GRASS_VARIANTS, type GrassKind } from '../gfx/grass';
import { RiverGeo } from './rivergeo';
import { LANDMARKS, SCENIC, landmarkAt, lmCleared, lmNoGrass, type GroveSpot, type FallSpot } from '../data/landmarks';

export const CHUNK = 1024;          // 每块世界像素
export const CHUNK_RES = 384;       // 每块纹理分辨率（含笔触细节）
const PIX_RES = 192;                // 底色像素分辨率（柔和水彩，之后放大）
const CELL = 256;                   // 装饰物摆放网格

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

export interface Chunk { cx: number; cy: number; canvas: HTMLCanvasElement; used: number; season: number; preview?: boolean }

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

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/**
 * 第五轮地形线：原设名地（封魔山、归墟殿……）的地面贴花（玉砖广场、冰火道、坑洞、血潭）和石殿、牌坊、塔这些构件，
 * 有的摆在地点中心外两三千远，而地点自己的平台只有五六百半径：平台外是山坡，玉砖广场就顺着山坡斜铺下去，
 * 从侧面看是一大块石板斜插在山坡里（封魔山）。整地平台的半径放大到包住这些贴花和构件（最多 3000）。
 * 宗门、城不管（它们按自己的布局整地）。
 */
const LM_FLAT_GROUND = new Set(['lavalake', 'bloodpool', 'blackpond', 'pit', 'jadeplaza', 'icepath', 'lavapath', 'ghostland', 'taiji', 'lotus']);
function landmarkFloor(l: (typeof LOCATIONS)[number]): number {
  if (l.type === 'sect' || l.type === 'city' || usesNewCity(l) || grandSectPlan(l)) return 0;
  const x = l.x * WORLD_SCALE, y = l.y * WORLD_SCALE;
  let r = 0;
  for (const L of LANDMARKS) {
    if (Math.abs(L.x - x) > 1 || Math.abs(L.y - y) > 1) continue;
    for (const g of L.ground) if (LM_FLAT_GROUND.has(g.k)) r = Math.max(r, Math.hypot(Math.abs(g.x - x) + g.w / 2, Math.abs(g.y - y) + g.h / 2));
    for (const s of L.stands) if (s.k !== 'wall' && s.k !== 'sprite' && s.k !== 'remains') r = Math.max(r, Math.hypot(s.x - x, s.y - y) + Math.min(s.w, 400) / 2);
  }
  return Math.min(3000, r);
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
  land!: Float32Array; elev!: Float32Array; arid!: Float32Array; cold!: Float32Array; forest!: Float32Array; depth!: Float32Array;
  islands: { x: number; y: number; r: number }[] = [];
  rivers: { pts: P[]; w: number }[] = [];
  chunks = new Map<string, Chunk>();
  private visibleChunks = new Set<string>();
  private chunkLimit = 130;
  decoCache = new Map<string, { d: Deco[]; used: number }>();
  grassCache = new Map<string, { d: Clump[]; used: number }>();
  /** 当前季节（0 春 1 夏 2 秋 3 冬）：底图随之重烘焙 */
  season = 1;
  riverMask!: Uint8Array;
  locZones: { x: number; y: number; rx: number; ry: number; id: string }[] = [];
  waveGlyph?: HTMLCanvasElement;
  grassGlyph?: HTMLCanvasElement;
  rockGlyphs: HTMLCanvasElement[] = [];
  reedGlyph?: HTMLCanvasElement;
  shrubGlyph?: HTMLCanvasElement; yurtGlyph?: HTMLCanvasElement;
  roads: { pts: P[]; major: boolean }[] = [];
  roadMask!: Uint8Array;
  fieldSites: readonly FieldSite[] = LOCATIONS;
  /** P10：占山的大宗门（底图上铺台地石板用；随烘焙数据传给 Worker） */
  grandSects: GrandSectGround[] = [];
  frame = 0;
  /** 图外的交界地带（天穹草原）：哪条边、与交界坐标系差多少、有多深。建地形时按当前地图定下，随烘焙数据传给后台线程 */
  seam: SeamFrame | null = (() => {
    const list = MAP_SEAMS[SEAM_MAP]; if (!list?.length) return null;
    const f = mapFrame(SEAM_MAP), out: SeamFrame = { dx: f.dx, dy: f.dy, n: 0, s: 0, e: 0, w: 0, ocean: OCEAN_MARGIN };
    const span: NonNullable<SeamFrame['span']> = {};
    for (const s of list) {
      out[s.side] = s.depth;
      const o = mapFrame(s.to), os = mapSize(s.to), ox = (f.dx - o.dx) / WORLD_SCALE, oy = (f.dy - o.dy) / WORLD_SCALE;
      span[s.side] = s.side === 'n' || s.side === 's' ? [ox, ox + os.W] : [oy, oy + os.H];
    }
    out.span = span;
    return out;
  })();
  /** 整张图的色调：建地形时按当前地图定下，随烘焙数据传给后台线程 */
  tint = MAP_TINT;
  /** 正在按「大陆坐标」生成图外的分块时：传进来的坐标要加上这么多宏观格才是本图坐标（平时为 0） */
  private gapRow = 0; private gapCol = 0;
  /** 树木密度抽稀（0 = 不生成树，1 = 全部；2~8 按坐标哈希取子集），随设置面板持久化 */
  _treeStride?: number;

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
    try { const raw = localStorage.getItem('taixu.treeDensity'); saved = raw === null ? NaN : Number(raw); } catch { /* */ }
    this._treeStride = Number.isFinite(saved) && saved >= 0 ? Math.min(8, Math.round(saved)) : 5;   // 默认 20% 密度（stride 5）
    return this._treeStride;
  }
  /** 设置面板改密度：清掉已生成 chunk 的树/草缓存，下次取块按新密度重建 */
  applyTreeDensity(v: number) {
    this._treeStride = Math.max(0, Math.min(8, Math.round(v)));
    this.decoCache.clear();
    this.grassCache.clear();
  }

  /** 一口气建完 */
  build() { for (const _ of this.buildSteps()) { /* */ } }
  /**
   * 分段建地形：每做完一段交还一次，调用方可以每帧只做几毫秒（后台悄悄建邻图的地形时用）。
   * 注意每一段执行时「当前地图」都必须是这张地形所属的图。
   */
  *buildSteps(): Generator<void, void, void> {
    const W = this.W, H = this.H, N = W * H;
    this.buildPhase = 'coast';
    // ---------- 1. 陆地掩码（用 Canvas 栅格化多边形） ----------
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true })!;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#f00';
    if (MAINLAND.length > 2) { g.beginPath(); MAINLAND.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); }
    g.fillStyle = '#000';
    for (const l of LAKES) { g.beginPath(); g.arc(l.c[0], l.c[1], l.r, 0, Math.PI * 2); g.fill(); }
    // 第四十五步：湖心岛
    g.fillStyle = '#f00'; for (const l of LAKE_ISLES) { g.beginPath(); g.arc(l.c[0], l.c[1], l.r, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#000';
    // 岛屿
    const rnd = mulberry32(20261014);
    this.islands = [];
    for (const loc of LOCATIONS) if (loc.island) this.islands.push({ x: loc.x, y: loc.y, r: loc.island });
    const F = ISLAND_FIELD;
    let tries = 0;
    const n0 = this.islands.length;
    if (F) {
      // 群岛：以大岛为核，四周撒落成串的小岛；群岛之间留出开阔海面；外海（东侧）稀疏而多礁
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
    // 外海零星小岛（南荒东、南外海，中州北海，沧溟海西侧无边海）
    for (const E of EXTRA_ISLANDS) for (let i = 0; i < E.n; i++) {
      const x = E.x0 + rnd() * (E.x1 - E.x0), y = E.y0 + rnd() * (E.y1 - E.y0);
      if (!pointInPoly(x, y, MAINLAND)) this.islands.push({ x, y, r: E.r0 + rnd() * (E.r1 - E.r0) });
    }
    g.globalCompositeOperation = 'lighter'; g.fillStyle = '#0f0';
    for (const is of this.islands) {
      // 海岛轮廓：主椭圆 + 3~6 个偏心小椭圆（形如半岛、岬角），随机朝向
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
    const raw = g.getImageData(0, 0, W, H).data;
    const land0 = new Float32Array(N), isle0 = new Float32Array(N);
    for (let i = 0; i < N; i++) { land0[i] = raw[i * 4] / 255; isle0[i] = raw[i * 4 + 1] / 255; }

    yield;
    // ---------- 2. 噪声扰动海岸线 ----------
    const land = new Float32Array(N);
    const samp = (src: Float32Array, x: number, y: number) => {
      x = clamp(x, 0, W - 1.001); y = clamp(y, 0, H - 1.001);
      const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi, i = yi * W + xi;
      const a = src[i], b = src[i + 1], c = src[i + W], d = src[i + W + 1];
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
    for (let y = 0; y < H; y++) { if ((y & 7) === 7) yield; for (let x = 0; x < W; x++) {
      const wx = (fbm(x * 0.022, y * 0.022, 3, 11) - 0.5) * 16;
      const wy = (fbm(x * 0.022, y * 0.022, 3, 29) - 0.5) * 16;
      // 大陆海岸：大尺度扭曲（海湾、半岛）+ 中尺度扭曲（岬角、小湾）
      const bx = (fbm(x * 0.008, y * 0.008, 3, 53) - 0.5) * 70 + (fbm(x * 0.04, y * 0.04, 3, 71) - 0.5) * 26;
      const by = (fbm(x * 0.008, y * 0.008, 3, 59) - 0.5) * 70 + (fbm(x * 0.04, y * 0.04, 3, 73) - 0.5) * 26;
      let v = Math.max(samp(land0, x + wx + bx, y + wy + by), samp(isle0, x + wx * 0.35, y + wy * 0.35));
      v += (valueNoise(x * 0.18, y * 0.18, 5) - 0.5) * 0.25;
      land[y * W + x] = clamp(v, 0, 1);
    } }
    this.land = land;
    yield;
    { const once = boxBlur(land, W, H, 5); yield; this.depth = boxBlur(once, W, H, 5); }
    yield;
    const landAt = (x: number, y: number) => land[clamp(Math.round(y), 0, H - 1) * W + clamp(Math.round(x), 0, W - 1)];
    for (const l of LOCATIONS) {
      if (l.island || landAt(l.x, l.y) > 0.6) continue;
      let done = false;
      for (let r = 1; r < 40 && !done; r += 1) for (let a = 0; a < 16; a++) {
        const qx = l.x + Math.cos(a / 16 * Math.PI * 2) * r, qy = l.y + Math.sin(a / 16 * Math.PI * 2) * r;
        if (landAt(qx, qy) > 0.75 && landAt(qx + 3, qy) > 0.6 && landAt(qx - 3, qy) > 0.6) { l.x = qx; l.y = qy; done = true; break; }
      }
    }

    yield;
    // ---------- 3. 山脉高度 ----------
    this.buildPhase = 'mountain';
    // 海岛高度：Canvas 径向渐变栅格化
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    for (const is of this.islands) {
      const rg = g.createRadialGradient(is.x, is.y, 0, is.x, is.y, is.r);
      const peak = is.r > 7 ? 0.6 : 0.38;
      rg.addColorStop(0, `rgba(255,255,255,${peak})`); rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(is.x, is.y, is.r, 0, Math.PI * 2); g.fill();
    }
    const isleRaw = g.getImageData(0, 0, W, H).data;
    const rangeBoxes = RANGES.map((r) => {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const [x, y] of r.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const m = r.w * 1.4;
      return [x0 - m, y0 - m, x1 + m, y1 + m];
    });
    const elev = new Float32Array(N);
    for (let y = 0; y < H; y++) { if ((y & 15) === 15) yield; for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (land[i] < 0.3) continue;
      let ridge = 0;
      for (let ri = 0; ri < RANGES.length; ri++) {
        const bb = rangeBoxes[ri];
        if (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3]) continue;
        const r = RANGES[ri];
        let d = 1e9;
        for (let k = 0; k < r.pts.length - 1; k++) {
          const [ax, ay] = r.pts[k], [bx, by] = r.pts[k + 1];
          d = Math.min(d, segDist(x, y, ax, ay, bx, by));
        }
        if (d > r.w * 1.3) continue;
        const half = r.w * (0.7 + 0.6 * valueNoise(x * 0.05, y * 0.05, 3));
        if (d < half) ridge = Math.max(ridge, r.h * Math.pow(1 - d / half, 1.3));
      }
      const n = fbm(x * 0.04, y * 0.04, 3, 7);
      const hills = Math.max(0, n - 0.55) * 1.1;
      const isle = isleRaw[i * 4] / 255;
      elev[i] = clamp(ridge * (0.65 + 0.7 * n) + hills + isle, 0, 1.2) * clamp((land[i] - 0.3) * 3, 0, 1);
    } }
    this.elev = elev;

    yield;
    // ---------- 4. 气候区域 ----------
    this.buildPhase = 'climate';
    const zone = function* (zones: { pts: P[]; v: number }[], blur: number): Generator<void, Float32Array, void> {
      const a = new Float32Array(N);
      const A = 46;   // 扭曲幅度（宏观单位）
      for (const z of zones) {
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const [x, y] of z.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        for (let y = Math.max(0, (y0 - A) | 0); y < Math.min(H, y1 + A + 1); y++) {
          if ((y & 7) === 7) yield;
          for (let x = Math.max(0, (x0 - A) | 0); x < Math.min(W, x1 + A + 1); x++) {
            const qx = x + (fbm(x * 0.011, y * 0.011, 3, 61) - 0.5) * A * 5 + (valueNoise(x * 0.06, y * 0.06, 63) - 0.5) * 10;
            const qy = y + (fbm(x * 0.011, y * 0.011, 3, 67) - 0.5) * A * 5 + (valueNoise(x * 0.06, y * 0.06, 69) - 0.5) * 10;
            if (pointInPoly(qx, qy, z.pts)) a[y * W + x] = Math.max(a[y * W + x], z.v);
          }
        }
      }
      yield;
      const once = boxBlur(a, W, H, blur);
      yield;
      return boxBlur(once, W, H, blur);
    };
    this.arid = yield* zone(ARID_ZONES, 12);
    yield;
    this.cold = yield* zone(COLD_ZONES, 14);
    yield;
    const forestBase = yield* zone(FOREST_ZONES, 14);
    yield;
    const forest = new Float32Array(N);
    for (let y = 0; y < H; y++) { if ((y & 15) === 15) yield; for (let x = 0; x < W; x++) {
      const i = y * W + x;
      forest[i] = clamp(forestBase[i] * (0.4 + 1.0 * fbm(x * 0.035, y * 0.035, 3, 41)) - this.arid[i] * 0.6, 0, 1);
    } }
    this.forest = forest;

    yield;
    // ---------- 5. 河流 ----------
    this.buildPhase = 'river';
    this.rivers = RIVERS.map((r, i) => ({ pts: smoothLine(r.pts, 100 + i, 3.2), w: r.w }));

    yield;
    // ---------- 6. 道路（连接相邻城镇宗门的官道/小径）----------
    this.buildPhase = 'road';
    yield* this.buildRoads(g);   // r10：里面分段交还（以前一口气三秒多，加载画面的进度、字都僵住）；算法和顺序没变，结果逐位一样
    yield;
    this.buildSegs();

    yield;
    // ---------- 7. 河流栅格（近水判定：柳树、芦苇、鱼跃）----------
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const rv of this.rivers) { g.lineWidth = rv.w * 0.8 + 6.5; g.beginPath(); rv.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
    const rr = g.getImageData(0, 0, W, H).data;
    this.riverMask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) this.riverMask[i] = rr[i * 4] > 60 ? 1 : 0;
    yield;
    // ---------- 8. 地点占地（装饰物避让）----------
    this.buildPhase = 'site';
    // 第二十二步：布局按此处地形避开水面、河道（屋不落水）
    setLayoutEnv((l) => {
      const ox = l.x * WORLD_SCALE, oy = l.y * WORLD_SCALE, sm = this.sample(ox, oy);
      return { site: (x: number, y: number) => this.isLand(ox + x, oy + y) && this.riverEdge(ox + x, oy + y) > 50, cold: sm.cold, arid: sm.arid,
        // P10：进城的路（相对地点中心的世界坐标）——城门对着官道开
        // 粗查某块地（相对中心的世界坐标）里可能有水：按宏观格子查陆地值和河道掩码，比逐点 site 便宜得多
        wetHint: (x0: number, y0: number, x1: number, y1: number) => {
          const W = this.W, H = this.H;
          const a0 = Math.max(0, Math.floor((ox + x0) / WORLD_SCALE) - 1), a1 = Math.min(W - 1, Math.floor((ox + x1) / WORLD_SCALE) + 1);
          const b0 = Math.max(0, Math.floor((oy + y0) / WORLD_SCALE) - 1), b1 = Math.min(H - 1, Math.floor((oy + y1) / WORLD_SCALE) + 1);
          for (let j = b0; j <= b1; j++) for (let i = a0; i <= a1; i++) if (this.land[j * W + i] < 0.8) return true;
          return false;
        },
        // 到河岸的有符号距离（负 = 河里；附近没河是个很大的数）
        riverDist: (x: number, y: number) => this.riverEdge(ox + x, oy + y),
        roads: (r: number) => this.roads.map((rd) => ({ major: rd.major, pts: rd.pts.map(([x, y]) => [x * WORLD_SCALE - ox, y * WORLD_SCALE - oy] as [number, number]) }))
          .filter((rd) => rd.pts.some(([x, y]) => Math.abs(x) < r && Math.abs(y) < r)) };
    });
    this.locZones = []; this.cityBoxes = [];
    for (let i = 0; i < LOCATIONS.length; i++) {
      const l = LOCATIONS[i], L = getLayout(l);
      this.locZones.push({ x: l.x * WORLD_SCALE, y: l.y * WORLD_SCALE, rx: L.gw * LOC_SCALE * 0.42, ry: L.gh * LOC_SCALE * 0.42, id: l.id });
      const ce = (L as { cityInfo?: { extent: { x0: number; y0: number; x1: number; y1: number } } }).cityInfo?.extent;
      if (ce) this.cityBoxes.push({ x0: l.x * WORLD_SCALE + ce.x0 + 300, y0: l.y * WORLD_SCALE + ce.y0 + 300, x1: l.x * WORLD_SCALE + ce.x1 - 300, y1: l.y * WORLD_SCALE + ce.y1 - 300 });
      if (i % 12 === 11) yield;
    }
    yield;
    for (const z of this.locZones) this.zoneById.set(z.id, z);
    this.buildPhase = 'surface';
    const roads: SurfaceRoad[] = [];
    for (let i = 0; i < this.roadSegW.length; i += 8) roads.push({ x1: this.roadSegW[i], y1: this.roadSegW[i + 1], x2: this.roadSegW[i + 2], y2: this.roadSegW[i + 3], width: this.roadSegW[i + 4] });
    this.surface = new TerrainSurface({
      elevationAt: (x, y) => this.bil(this.elev, x / WORLD_SCALE, y / WORLD_SCALE), roads,
      landAt: (x, y) => this.bil(this.land, x / WORLD_SCALE, y / WORLD_SCALE) + this.coastNoise(x, y),
      gapFrame: (x, y) => {
        const S = this.seam; if (!S || (!S.dx && !S.dy)) return null;
        const out = this.outDist(x / WORLD_SCALE, y / WORLD_SCALE, S);
        if (out <= 0) return null;
        const t = Math.min(1, out / OUTLAND_BLEND);
        return { x: x - S.dx, y: y - S.dy, k: t * t * (3 - 2 * t) };
      },
      sites: LOCATIONS.map((l, i) => ({ id: l.id, x: l.x * WORLD_SCALE, y: l.y * WORLD_SCALE, radius: Math.max(Math.max(this.locZones[i].rx, this.locZones[i].ry) * (usesNewCity(l) ? 1.15 : 1), landmarkFloor(l)), kind: l.type, massif: grandSectPlan(l), flat: usesNewCity(l) })),
    });
    this.grandSects = grandSectGrounds(LOCATIONS, WORLD_SCALE);
    yield;
    // ---------- 9. 预制装饰图 ----------
    this.makeGlyphs();
  }

  /** r10：分段建地形时眼下在做哪一段（加载画面的阶段文字用；不影响结果） */
  buildPhase: 'coast' | 'mountain' | 'climate' | 'river' | 'road' | 'site' | 'surface' | '' = '';
  private *buildRoads(g: CanvasRenderingContext2D): Generator<void, void, void> {
    const W = this.W, H = this.H;
    const nodes = LOCATIONS.filter((l) => l.type !== 'isle' && !l.island && pointInPoly(l.x, l.y, MAINLAND));
    const pairs = new Set<string>();
    this.roads = [];
    // 南荒放大后，有名的大地点之间隔得远了一倍：它们之间连路的距离上限跟着放大（村镇的密度没变，上限不变）
    const dk = SEAM_MAP === 'tiannan' ? TN_K : 1;
    let tick = 0;
    for (const a of nodes) {
      if ((++tick & 15) === 0) yield;
      const near = nodes.filter((b) => b !== a && (a.minor || !b.minor)).map((b) => ({ b, d: Math.hypot(a.x - b.x, a.y - b.y) }))
        .filter((o) => o.d > 0 && o.d < (a.minor ? 40 : 95 * dk)).sort((u, v) => u.d - v.d).slice(0, a.minor ? (a.type === 'town' ? 2 : 1) : 3);
      for (const { b, d } of near) {
        const key = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
        if (pairs.has(key)) continue;
        // 中点需在陆地上
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (this.land[(my | 0) * W + (mx | 0)] < 0.6) continue;
        // 第四十五步：路不穿湖
        if ([0.15, 0.3, 0.42, 0.58, 0.7, 0.85].some((q) => this.land[((a.y + (b.y - a.y) * q) | 0) * W + ((a.x + (b.x - a.x) * q) | 0)] < 0.6)) continue;
        pairs.add(key);
        const h = hash2(a.x + b.x, a.y + b.y, 61) - 0.5;
        const nx = -(b.y - a.y) / d, ny = (b.x - a.x) / d;
        const mid: P = [mx + nx * h * d * 0.25, my + ny * h * d * 0.25];
        const pts = smoothLine([[a.x, a.y], mid, [b.x, b.y]], 300 + pairs.size, 2.2);
        const major = (a.type === 'city' || a.major) && (b.type === 'city' || b.major);
        this.roads.push({ pts, major });
      }
    }
    // 高山模式：山里的地点全靠山道进出，不能有哪个地点一条路都没接上。
    // 上面的规则只连一定距离内的邻居；没连上任何路的地点，这里补一条通往最近邻居的山道（仍要求沿途在陆地上）。
    if (MOUNTAINS) {
      const linked = new Set<string>();
      for (const key of pairs) for (const id of key.split('|')) linked.add(id);
      for (const a of nodes) {
        if (linked.has(a.id)) continue;
        const candidates = nodes.filter((b) => b !== a).map((b) => ({ b, d: Math.hypot(a.x - b.x, a.y - b.y) })).filter((o) => o.d > 0 && o.d < (a.minor ? 160 : 160 * dk)).sort((u, v) => u.d - v.d);
        for (const { b } of candidates) {
          if ([0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9].some((q) => this.land[((a.y + (b.y - a.y) * q) | 0) * W + ((a.x + (b.x - a.x) * q) | 0)] < 0.6)) continue;
          pairs.add(a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id);
          this.roads.push({ pts: smoothLine([[a.x, a.y], [(a.x + b.x) / 2, (a.y + b.y) / 2], [b.x, b.y]], 300 + pairs.size, 2.2), major: false });
          linked.add(a.id); linked.add(b.id);
          break;
        }
      }
      // 路网可能分成几片（深山里几个地点彼此连着、却没有一条路通到外面）：把每一小片接到别的片上，直到连成一张网。
      const group = new Map<string, string>();
      const find = (id: string): string => { let r = id; while (group.get(r) !== r) r = group.get(r)!; group.set(id, r); return r; };
      for (const n of nodes) group.set(n.id, n.id);
      for (const key of pairs) { const [p, q] = key.split('|'); if (group.has(p) && group.has(q)) group.set(find(p), find(q)); }
      for (let round = 0; round < 40; round++) {
        yield;
        const size = new Map<string, number>();
        for (const n of nodes) { const r = find(n.id); size.set(r, (size.get(r) ?? 0) + 1); }
        if (size.size <= 1) break;
        let main = '', most = 0;
        for (const [r, c] of size) if (c > most) { most = c; main = r; }
        let joined = false;
        for (const [r] of size) {
          if (r === main) continue;
          yield;
          let best: { a: (typeof nodes)[number]; b: (typeof nodes)[number]; d: number } | null = null;
          for (const a of nodes) {
            if (find(a.id) !== r) continue;
            for (const b of nodes) {
              if (find(b.id) === r) continue;
              const d = Math.hypot(a.x - b.x, a.y - b.y);
              if (d > 260 * dk || (best && d >= best.d)) continue;
              if ([0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9].some((q) => this.land[((a.y + (b.y - a.y) * q) | 0) * W + ((a.x + (b.x - a.x) * q) | 0)] < 0.6)) continue;
              best = { a, b, d };
            }
          }
          if (!best) continue;
          const { a, b } = best;
          pairs.add(a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id);
          this.roads.push({ pts: smoothLine([[a.x, a.y], [(a.x + b.x) / 2, (a.y + b.y) / 2], [b.x, b.y]], 300 + pairs.size, 2.2), major: false });
          group.set(find(a.id), find(b.id));
          joined = true;
        }
        if (!joined) break;
      }
    }
    // P10：占山的大宗门——通到宗门的路改接山门，穿过山体的路沿地界外缘绕开
    for (const l of nodes) {
      const plan = grandSectPlan(l); if (!plan) continue;
      for (const r of this.roads) r.pts = routeAroundGrandSect(r.pts, [l.x, l.y], plan, WORLD_SCALE);
      yield;
    }
    // 道路栅格（用于加速步行）
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const r of this.roads) { g.beginPath(); r.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
    const raw = g.getImageData(0, 0, W, H).data;
    this.roadMask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) this.roadMask[i] = raw[i * 4] > 60 ? 1 : 0;
  }

  /** 世界坐标线段（Catmull-Rom 细分到 ~150px，GPU 地表与 CPU 判定共用）：
   *  每段 8 个数 [ax,ay,bx,by, 宽, 累计长, 标记, 0]；河：标记=河号；路：标记=1 官道 */
  rivSegW = new Float32Array(0); roadSegW = new Float32Array(0);
  /** 与 GPU 地表一致的蜿蜒河道（第十七步） */
  riverGeo: RiverGeo | null = null;
  /** 到河水边缘的有符号距离（负 = 在河里） */
  riverEdge(wx: number, wy: number) { return this.riverMask && this.nearRiver(wx, wy) && this.riverGeo ? this.riverGeo.edgeDist(wx, wy) : 1e9; }
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
      for (let i = 2; i < p.length; i += 2) {
        const ax = Math.fround(p[i - 2]), ay = Math.fround(p[i - 1]), bx = Math.fround(p[i]), by = Math.fround(p[i + 1]);
        if (ax === bx && ay === by) continue;
        road.push(ax, ay, bx, by, r.major ? 40 : 24, 0, r.major ? 1 : 0, 0);
      }
    }
    this.rivSegW = new Float32Array(riv); this.roadSegW = new Float32Array(road);
    this.riverGeo = new RiverGeo(this.rivSegW);
  }

  private _gl: { W: number; H: number; scale: number; a: Float32Array; b: Float32Array } | null = null;
  /** GPU 地表所需的宏观图（陆地/海拔/干旱/寒冷 + 森林/水深），只打包一次 */
  glData() {
    if (this._gl) return this._gl;
    const N = this.W * this.H, a = new Float32Array(N * 4), b = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      a[i * 4] = this.land[i]; a[i * 4 + 1] = this.elev[i]; a[i * 4 + 2] = this.arid[i]; a[i * 4 + 3] = this.cold[i];
      b[i * 4] = this.forest[i]; b[i * 4 + 1] = this.depth[i];
    }
    return (this._gl = { W: this.W, H: this.H, scale: WORLD_SCALE, a, b });
  }

  private roadSegs: Map<string, number[]> | null = null;
  /** 精确：距道路中线 < pad（世界像素） */
  nearRoad(wx: number, wy: number, pad: number) {
    { const sd = this.seamRoadDist(wx, wy); if (sd < 1e8) return sd < 22 + pad; }
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
    const x = Math.floor(wx / WORLD_SCALE), y = Math.floor(wy / WORLD_SCALE);
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return this.seamRoadDist(wx, wy) < 150;   // 图外：草原上的商道（与图内的栅格一样宽松）
    return this.roadMask[y * this.W + x] === 1;
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

  // 宏观坐标采样（双线性）
  private bil(a: Float32Array, x: number, y: number) {
    x += this.gapCol; y += this.gapRow;
    const S = this.seam;
    if (S && ((S.n && y < 0) || (S.s && y > this.H - 1) || (S.w && x < 0) || (S.e && x > this.W - 1))) {
      // 交界地带：越过不通的那条边（图角外面）以后同样化成海，草原的两头才不会在图角外截成一条直线
      const v = this.outlandValue(a, x, y, S);
      if (!S.ocean) return v;
      const sh = this.outShut(x, y, S);
      // 越出了地峡（两张图之间那个梯形）的地方：不必和哪张图的图边连续，照常化成海——否则贴着图边那一行的值会沿着交界拉出一道细线
      const c = clamp(sh.d / (OCEAN_BLEND * 0.5), 0, 1), e = Math.max(sh.e, c * c * (3 - 2 * c));
      return this.toOcean(a, v, sh.d, x, y, sh.m, e);
    }
    if (S?.ocean && (x < 0 || y < 0 || x > this.W - 1 || y > this.H - 1)) return this.oceanValue(a, x, y);
    return this.bilIn(a, x, y);
  }
  /** d：越过地峡两侧多远（宏观格，没越过为负）；m：在地峡深处的程度（贴着两张图的图边为 0，正中为 1） */
  private outShut(x: number, y: number, S: SeamFrame): { d: number; m: number; e: number } {
    let d = -1e9, m = 0, e = 0;
    // 地峡的两侧：沿着交界的深度，从本图这条边的范围线性收到对面那条边的范围
    const side = (along: number, u: number, a0: number, a1: number, r?: [number, number]) => {
      const lo = r ? a0 + (r[0] - a0) * u : a0, hi = r ? a1 + (r[1] - a1) * u : a1;
      // 大幅的起伏只给西（北）侧：东侧草原自己有一道东海岸（outland.ts 的 steppeAt），两条岸叠着收会把草原东边吃掉一块
      const dl = lo - along, dh = along - (hi - 1);
      d = Math.max(d, dl, dh); if (dl >= dh) m = Math.max(m, Math.sin(Math.PI * u));
      // 贴着两张图的图边那一小段（深度的一成以内）先不化成海，再往外渐渐生效：图边内外才连续
      const w = clamp(Math.min(u, 1 - u) / 0.1, 0, 1); e = Math.max(e, w * w * (3 - 2 * w));
    };
    const D = (v: number) => Math.max(1, v / WORLD_SCALE), c01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
    if (S.n && y < 0) side(x, c01(-y / D(S.n)), 0, this.W, S.span?.n);
    // 深度从图边量起：南、东两边的图边在 H、W 上（不是 H-1），两张图量出来的 u 才正好互补，地峡是同一个梯形
    if (S.s && y > this.H - 1) side(x, c01((y - this.H) / D(S.s)), 0, this.W, S.span?.s);
    if (S.w && x < 0) side(y, c01(-x / D(S.w)), 0, this.H, S.span?.w);
    if (S.e && x > this.W - 1) side(y, c01((x - this.W) / D(S.e)), 0, this.H, S.span?.e);
    return { d, m, e };
  }
  /** 把一个地貌值按「越过不通的边多远」揉着化成深海（out ≤ 0 原样返回） */
  private toOcean(a: Float32Array, v: number, out: number, x: number, y: number, m = 0, e = 1) {
    // 地峡中段（m→1）起伏大、整体往里收，接近两张图（m→0）时收拢到图角；内收量总大于起伏，岸不会越出图角。
    // 收多少有上限：天穹草原上的营地一直摆到中州西缘往里一万二（data/world.ts genFrontier），海岸再往里就把营地淹了
    const big = 2 + 20 * m;
    if (out <= -(2.5 + big * 0.85) * OCEAN_BLEND) return v;   // 离岸还远：不用算噪声（这个界要盖住内收量加最大的起伏）
    // 按大陆坐标取噪声：两张图算出来是同一道岸。地峡的两岸很长，起伏要大才不像一条斜线
    const S = this.seam!, cx = x - S.dx / WORLD_SCALE, cy = y - S.dy / WORLD_SCALE;
    const n = (fbm(cx / 70, cy / 70, 3, 414) - 0.5) * big + (fbm(cx / 18, cy / 18, 3, 413) - 0.5) * 1.5;
    const t = clamp((out + (n + 1.2 + big * 0.3) * OCEAN_BLEND) / OCEAN_BLEND, 0, 1), k = t * t * (3 - 2 * t) * e;
    const target = a === this.land ? 0 : a === this.depth ? 0 : a === this.forest ? 0 : a === this.elev ? Math.min(v, 0.05) : v;
    return v + (target - v) * k;
  }
  /**
   * 不通的边外：图边那一行的地貌（夹到图边取）揉着化成深海。陆地顶到图边的地方（中州北缘的雪山）会在外面长出一道曲折的海岸、
   * 再往外是越来越深的海；本来就是海的边接着是海，颜色一路连过去。
   */
  private oceanValue(a: Float32Array, x: number, y: number) {
    const out = Math.max(-x, -y, x - (this.W - 1), y - (this.H - 1));
    const edge = this.bilIn(a, x, y);
    const n = fbm(x / 22, y / 22, 3, 413) - 0.5;
    const t = clamp((out + n * OCEAN_BLEND) / OCEAN_BLEND, 0, 1), k = t * t * (3 - 2 * t);
    const target = a === this.land ? 0 : a === this.depth ? 0 : a === this.forest ? 0 : a === this.elev ? Math.min(edge, 0.05) : edge;
    return edge + (target - edge) * k;
  }
  /** 这一点在通着的那几条边外多远（宏观格）；在图内为负或 0 */
  private outDist(x: number, y: number, S: SeamFrame): number {
    return Math.max(S.n ? -y : -1, S.s ? y - (this.H - 1) : -1, S.w ? -x : -1, S.e ? x - (this.W - 1) : -1);
  }
  /**
   * 图外交界地带的地貌：靠近图边的一段从图边那一行的值渐变过来，再往外就是草原——整片是陆地、平缓起伏、偏旱、几乎无林。
   * 草原的值按「交界坐标」取噪声，所以南荒和中州两边算出来是同一片地。
   */
  private outlandValue(a: Float32Array, x: number, y: number, S: SeamFrame) {
    const out = this.outDist(x, y, S);
    const edge = this.bilIn(a, x, y);   // bilIn 自己会夹到图边
    // 从图边那一行化过去的距离按大陆坐标揉一揉：陆地顶到图边的地方，外面的岸才不会平行于图边一条直线（两张图取的是同一份噪声）
    // 噪声只把化开的起点往外推（0～2 个混合宽度），不往图边里提前：图边上内外一定是连续的
    const n = fbm((x - S.dx / WORLD_SCALE) / 40, (y - S.dy / WORLD_SCALE) / 40, 3, 415);
    const t = clamp((out - n * OUTLAND_BLEND * 2) / OUTLAND_BLEND, 0, 1), k = t * t * (3 - 2 * t);
    const which: OutlandField = a === this.land ? 'land' : a === this.elev ? 'elev' : a === this.arid ? 'arid' : a === this.cold ? 'cold' : a === this.forest ? 'forest' : 'depth';
    const target = outlandAt(which, x * WORLD_SCALE - S.dx, y * WORLD_SCALE - S.dy);
    return edge + (target - edge) * k;
  }
  /** 这一点是否在图外的交界地带 */
  inOutland(wx: number, wy: number): boolean {
    const S = this.seam; if (!S) return false;
    return (!!S.n && wy < 0) || (!!S.s && wy > this.H * WORLD_SCALE) || (!!S.w && wx < 0) || (!!S.e && wx > this.W * WORLD_SCALE);
  }
  /** 这一点的大陆坐标（正在按大陆坐标生成时，传进来的本来就是） */
  private homeXY(wx: number, wy: number): [number, number] {
    const S = this.seam; if (!S || this.gapCol || this.gapRow) return [wx, wy];
    return [wx - S.dx, wy - S.dy];
  }
  /** 天穹草原上的商道：离它的中线多远（世界单位）；不在草原一带就是很大的数 */
  seamRoadDist(wx: number, wy: number): number {
    const S = this.seam; if (!S) return 1e9;
    const [hx, hy] = this.homeXY(wx, wy);
    if (hy > 4000 || hy < -126000 || hx < 380000 || hx > 425000) return 1e9;
    let best = 1e9;
    for (let i = 0; i < SEAM_ROAD.length - 1; i++) {
      const a = SEAM_ROAD[i], b = SEAM_ROAD[i + 1];
      if (hy > a[1] + 600 || hy < b[1] - 600) continue;
      // 折线再加一点左右摆动，免得笔直
      const d = segDist(hx + Math.sin(hy / 2100) * 260, hy, a[0], a[1], b[0], b[1]);
      if (d < best) best = d;
    }
    return best;
  }
  /** 整块都在图外、且本图坐标与大陆坐标不同（中州、沧溟海一侧）的分块：返回它比大陆坐标多出的行列数；否则 null */
  private gapOf(cx: number, cy: number): { cols: number; rows: number } | null {
    const S = this.seam; if (!S || (!S.dx && !S.dy) || this.gapRow || this.gapCol) return null;
    return this.chunkOutside(cx, cy) ? { cols: S.dx / CHUNK, rows: S.dy / CHUNK } : null;
  }
  /** 按大陆坐标执行一段生成（分块底图、草、树石）：其间凡是取地貌的地方都会自动换回本图坐标 */
  private inGapFrame<T>(gap: { cols: number; rows: number }, f: () => T): T {
    this.gapRow = gap.rows * CHUNK / WORLD_SCALE; this.gapCol = gap.cols * CHUNK / WORLD_SCALE;
    // 图外也有地点（草原上的驿站、营地）：它们的位置是本图坐标，这里临时换成大陆坐标的一份
    const zones = this.locZones, sites = this.fieldSites, dx = gap.cols * CHUNK, dy = gap.rows * CHUNK;
    if (this.gapZones?.src !== zones || this.gapZones.n !== zones.length) this.gapZones = { src: zones, n: zones.length, list: zones.map((z) => ({ ...z, x: z.x - dx, y: z.y - dy })) };
    if (this.gapSites?.src !== sites || this.gapSites.n !== sites.length) this.gapSites = { src: sites, n: sites.length, list: sites.map((l) => ({ id: l.id, type: l.type, look: l.look, x: l.x - dx / WORLD_SCALE, y: l.y - dy / WORLD_SCALE })) };
    this.locZones = this.gapZones.list; this.fieldSites = this.gapSites.list;
    try { return f(); } finally { this.gapRow = 0; this.gapCol = 0; this.locZones = zones; this.fieldSites = sites; }
  }
  private gapZones: { src: unknown; n: number; list: Terrain['locZones'] } | null = null;
  private gapSites: { src: unknown; n: number; list: FieldSite[] } | null = null;
  private bilIn(a: Float32Array, x: number, y: number) {
    const W = this.W;
    x = clamp(x, 0, this.W - 1.001); y = clamp(y, 0, this.H - 1.001);
    const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi, i = yi * W + xi;
    const p = a[i], q = a[i + 1], r = a[i + W], s = a[i + W + 1];
    return p + (q - p) * fx + (r - p) * fy + (p - q - r + s) * fx * fy;
  }

  surface!: TerrainSurface;
  surfaceHeight(x: number, y: number) { return this.surface.heightAt(x, y); }
  /** 地形网格的高度：不含悬在半空的桥面、悬空峰顶（见 surface.ts） */
  terrainHeight(x: number, y: number) { return this.surface.terrainHeightAt(x, y); }
  canTraverse(ax: number, ay: number, bx: number, by: number) { return this.surface.canTraverse(ax, ay, bx, by); }

  sample(wx: number, wy: number): Sample {
    const x = wx / WORLD_SCALE, y = wy / WORLD_SCALE;
    return {
      land: this.bil(this.land, x, y), elev: this.bil(this.elev, x, y), arid: this.bil(this.arid, x, y),
      cold: this.bil(this.cold, x, y), forest: this.bil(this.forest, x, y), depth: this.bil(this.depth, x, y),
    };
  }

  /** 底图上画出来的海岸线所用的陆地值（0.5 为岸） */
  visLand(wx: number, wy: number) {
    return this.bil(this.land, wx / WORLD_SCALE, wy / WORLD_SCALE) + this.coastNoise(wx, wy);
  }
  isLand(wx: number, wy: number) {
    const x = wx / WORLD_SCALE, y = wy / WORLD_SCALE;
    const l = this.bil(this.land, x, y) + this.coastNoise(wx, wy);
    return l > 0.5;
  }
  /** 揉岸线的细噪声。图外的交界地带按大陆坐标取，两张图看到的岛才是同一个形状 */
  private coastNoise(wx: number, wy: number) {
    const S = this.seam;
    if (S && (S.dx || S.dy) && !this.gapCol && !this.gapRow && this.inOutland(wx, wy)) { wx -= S.dx; wy -= S.dy; }
    return (pnoise(wx / 150, wy / 150, 9) - 0.5) * 0.12;
  }

  // 徒步速度倍率（0 表示不可通行）
  walkFactor(wx: number, wy: number) {
    if (!this.isLand(wx, wy)) return 0;
    const s = this.sample(wx, wy);
    let f = 1;
    if (!MOUNTAINS) { if (s.elev > 0.55) f *= 0.6; else if (s.elev > 0.35) f *= 0.8; }
    if (s.forest > 0.6) f *= 0.88;
    if (s.cold > 0.6) f *= 0.85;
    if (this.onRoad(wx, wy)) f = Math.max(f, 1) * 1.25;
    else if (this.riverEdge(wx, wy) < 0) f *= 0.5;   // 涉水而过
    // 高山模式：不在路上时越陡越慢（缓坡不受影响，最陡的可走坡降到四成半）；原先按宏观高程一刀切的减速不再叠加
    if (MOUNTAINS && this.surface && !this.onRoad(wx, wy) && !this.surface.onRoadBed(wx, wy)) {
      const slope = this.surface.sample(wx, wy).slope;
      if (slope > 0.3) f *= Math.max(0.45, 1 - (slope - 0.3) * 1.1);
    }
    return f;
  }

  // ---------- 颜色 ----------
  /** 任意一点的地色（含图外的草原与海）：小地图画图外那一圈用 */
  groundColor(wx: number, wy: number, out: number[]) { this.colorAt(wx, wy, out); }
  private colorAt(wx: number, wy: number, out: number[]) {
    const x = wx / WORLD_SCALE, y = wy / WORLD_SCALE;
    const land = this.bil(this.land, x, y);
    const n1 = fbm(wx / 1400, wy / 1400, 3, 3);
    const L = land + this.coastNoise(wx, wy), n2 = (L - land) / 0.12 + 0.5;
    let r: number, g: number, b: number;
    if (L < 0.5) {
      const dep = this.bil(this.depth, x, y);
      const t = clamp(dep * 1.6, 0, 1);       // 越近岸越浅
      r = 70 + 82 * t; g = 122 + 72 * t; b = 136 + 50 * t;
      const m = 0.94 + 0.12 * n1 + (n2 - 0.5) * 0.05;
      r *= m; g *= m; b *= m;
      if (L > 0.44) { const k = (L - 0.44) / 0.06; r += (222 - r) * k * 0.55; g += (226 - g) * k * 0.55; b += (214 - b) * k * 0.55; }
    } else {
      const elev = this.bil(this.elev, x, y), arid = this.bil(this.arid, x, y), cold = this.bil(this.cold, x, y), forest = this.bil(this.forest, x, y);
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
      const ex = this.bil(this.elev, x + 0.9, y) - this.bil(this.elev, x - 0.9, y);
      const ey = this.bil(this.elev, x, y + 0.9) - this.bil(this.elev, x, y - 0.9);
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
    const T = this.tint;
    if (T) {
      // 保留原来的明暗起伏，颜色往这一界的色调上偏
      const c = L < 0.5 ? T.sea : T.land, lum = (r * 0.3 + g * 0.59 + b * 0.11) / (L < 0.5 ? 150 : 205), k = T.k;
      r += (c[0] * lum - r) * k; g += (c[1] * lum - g) * k; b += (c[2] * lum - b) * k;
    }
    out[0] = r; out[1] = g; out[2] = b;
  }

  getChunk(cx: number, cy: number, allowBuild: boolean): Chunk | null {
    const key = cx + ',' + cy;
    let c = this.chunks.get(key);
    if (c && (!allowBuild || c.season === this.season && !c.preview)) { c.used = this.frame; return c; }
    if (!allowBuild) return null;
    c = this.buildChunk(cx, cy);
    this.chunks.set(key, c);
    if (this.chunks.size > this.chunkLimit) this.evict();
    return c;
  }

  setChunkView(order: readonly { cx: number; cy: number; visible: boolean }[]) {
    this.visibleChunks = new Set(order.filter(item => item.visible).map(item => item.cx + ',' + item.cy));
    // 占山的宗门里镜头能拉到 0.13，一屏有四百多块地面：上限若还是三百，装不下的地方就是一片白纸（还会来回挤掉看得见的块、烘不完）。
    // 每块 384² 的贴图约 0.6 MB，放到 480 块多占一百来兆，只在拉得这么远时才用得到。
    this.chunkLimit = Math.min(MOUNTAINS ? 480 : 192, Math.max(130, this.visibleChunks.size + 16));
    if (this.chunks.size > this.chunkLimit) this.evict();
  }

  bakeData(): TerrainBakeData {
    return { W: this.W, H: this.H, land: this.land, elev: this.elev, arid: this.arid, cold: this.cold, forest: this.forest, depth: this.depth,
      roadMask: this.roadMask, roadSegW: this.roadSegW, rivers: this.rivers, roads: this.roads, zoneById: this.zoneById, fieldSites: this.fieldSites, seam: this.seam, tint: this.tint, grandSects: this.grandSects };
  }

  previewChunk(cx: number, cy: number): Chunk {
    const gap = this.gapOf(cx, cy);
    if (gap) { const c = this.inGapFrame(gap, () => this.previewChunk(cx - gap.cols, cy - gap.rows)); this.chunks.delete((cx - gap.cols) + ',' + (cy - gap.rows)); c.cx = cx; c.cy = cy; this.chunks.set(cx + ',' + cy, c); return c; }
    const size = 12, canvas = makeCanvas(size, size), ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(size, size), color = [0, 0, 0], ox = cx * CHUNK, oy = cy * CHUNK;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      this.colorAt(ox + (x + 0.5) * CHUNK / size, oy + (y + 0.5) * CHUNK / size, color);
      const i = (y * size + x) * 4;
      image.data[i] = color[0]; image.data[i + 1] = color[1]; image.data[i + 2] = color[2]; image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    const chunk: Chunk = { cx, cy, canvas, used: this.frame, season: this.season, preview: true };
    this.chunks.set(cx + ',' + cy, chunk);
    if (this.chunks.size > this.chunkLimit) this.evict();
    return chunk;
  }

  adoptChunk(cx: number, cy: number, season: number, bitmap: ImageBitmap) {
    const canvas = makeCanvas(CHUNK_RES, CHUNK_RES);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    bitmap.close();
    this.chunks.set(cx + ',' + cy, { cx, cy, canvas, used: this.frame, season });
    if (this.chunks.size > this.chunkLimit) this.evict();
  }

  /** 离开这张图时调用：地面分块、花草山石的缓存都丢掉（各几十上百兆），只留下高程等数据，回来时现画 */
  dropCaches(): void { this.chunks.clear(); this.visibleChunks.clear(); this.decoCache.clear(); this.grassCache.clear(); }
  /** 这个分块有没有地面可画：图内，或者图外的交界地带 */
  hasChunk(cx: number, cy: number): boolean {
    // 通着的边外是交界地带；不通的边外铺一圈海（S.ocean），一出图边地面不会断
    const S = this.seam, n = (d: number | undefined) => (d || S?.ocean) ? Math.ceil((d || S!.ocean!) / CHUNK) + 2 : 0;
    if (cx < -n(S?.w) || cx * CHUNK > this.W * WORLD_SCALE + n(S?.e) * CHUNK) return false;
    return cy >= -n(S?.n) && cy * CHUNK <= this.H * WORLD_SCALE + n(S?.s) * CHUNK;
  }
  /** 这个分块是否整块在图外的交界地带 */
  private chunkOutside(cx: number, cy: number): boolean {
    const S = this.seam; if (!S) return false;
    return (!!S.s && cy * CHUNK >= this.H * WORLD_SCALE) || (!!S.n && (cy + 1) * CHUNK <= 0) || (!!S.e && cx * CHUNK >= this.W * WORLD_SCALE) || (!!S.w && (cx + 1) * CHUNK <= 0);
  }
  /**
   * 从相邻的图接手交界地带的缓存。两边是同一片地、只差一个平移（dy，世界单位），
   * 所以分块底图、草丛、树石原样搬过来改个行号就能用，省得重画——飞过中线时地面才不会闪。
   */
  adoptOutland(from: Terrain, dx: number, dy: number): void {
    const rows = dy / CHUNK, cols = dx / CHUNK;
    for (const c of from.chunks.values()) {
      if (!from.chunkOutside(c.cx, c.cy) || !this.chunkOutside(c.cx + cols, c.cy + rows)) continue;
      c.cx += cols; c.cy += rows; c.used = this.frame; this.chunks.set(c.cx + ',' + c.cy, c);
    }
    const move = <T extends { x: number; y: number }>(src: Map<string, { d: T[]; used: number }>, dst: Map<string, { d: T[]; used: number }>) => {
      for (const [key, e] of src) {
        const [cx, cy] = key.split(',').map(Number);
        if (!from.chunkOutside(cx, cy) || !this.chunkOutside(cx + cols, cy + rows)) continue;
        dst.set((cx + cols) + ',' + (cy + rows), { d: e.d.map((o) => ({ ...o, x: o.x + dx, y: o.y + dy })), used: this.frame });
      }
    };
    move(from.decoCache as never, this.decoCache as never); move(from.grassCache as never, this.grassCache as never);
    this.season = from.season;
  }
  private evict() {
    const arr = [...this.chunks.values()].sort((a, b) => a.used - b.used);
    const target = Math.max(this.visibleChunks.size, this.chunkLimit - 40);
    for (const chunk of arr) {
      if (this.chunks.size <= target) break;
      const key = chunk.cx + ',' + chunk.cy;
      if (!this.visibleChunks.has(key)) this.chunks.delete(key);
    }
    for (const chunk of arr) {
      if (this.chunks.size <= this.chunkLimit) break;
      this.chunks.delete(chunk.cx + ',' + chunk.cy);
    }
  }

  buildChunk(cx: number, cy: number): Chunk {
    // 中州一侧整块在图外的分块：按交界坐标系（南荒的坐标）来画，画出来和南荒那边是同一块地
    const gap = this.gapOf(cx, cy);
    if (gap) { const c = this.inGapFrame(gap, () => this.buildChunk(cx - gap.cols, cy - gap.rows)); c.cx = cx; c.cy = cy; return c; }
    const R = CHUNK_RES, PR = PIX_RES, sc = CHUNK / PR;
    const ox = cx * CHUNK, oy = cy * CHUNK;
    // 底色（低分辨率水彩）
    const base = makeCanvas(PR, PR);
    const bg = base.getContext('2d')!;
    const img = bg.createImageData(PR, PR);
    const d = img.data, col = [0, 0, 0];
    for (let j = 0; j < PR; j++) for (let i = 0; i < PR; i++) {
      this.colorAt(ox + (i + 0.5) * sc, oy + (j + 0.5) * sc, col);
      const k = (j * PR + i) * 4;
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255;
    }
    bg.putImageData(img, 0, 0);
    const cv = makeCanvas(R, R);
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
    // 4b. 草原上的商道（图外，按大陆坐标）
    {
      const [hx, hy] = this.homeXY(ox, oy);
      if (this.seam && hy < 6000 && hy + CHUNK > -127000 && hx + CHUNK > 388000 && hx < 418000) {
        const path = () => {
          g.beginPath(); let first = true;
          for (let i = 0; i < SEAM_ROAD.length - 1; i++) {
            const a = SEAM_ROAD[i], b = SEAM_ROAD[i + 1];
            if (a[1] < hy - 1500 || b[1] > hy + CHUNK + 1500) continue;
            for (let y = a[1]; y >= b[1]; y -= 120) {
              if (y > hy + CHUNK + 900 || y < hy - 900) continue;
              const x = a[0] + (b[0] - a[0]) * (a[1] - y) / (a[1] - b[1]) - Math.sin(y / 2100) * 260;
              if (first) { g.moveTo(x - hx + ox, y - hy + oy); first = false; } else g.lineTo(x - hx + ox, y - hy + oy);
            }
          }
        };
        const w = 38;
        path(); g.strokeStyle = 'rgba(150,132,88,0.16)'; g.lineWidth = w + 30; g.stroke();
        path(); g.strokeStyle = 'rgba(118,98,64,0.34)'; g.lineWidth = w + 7; g.stroke();
        path(); g.strokeStyle = 'rgba(206,188,146,0.96)'; g.lineWidth = w; g.stroke();
        path(); g.strokeStyle = 'rgba(160,138,96,0.4)'; g.lineWidth = w * 0.66; g.stroke();
        path(); g.strokeStyle = 'rgba(214,198,158,1)'; g.lineWidth = w * 0.54; g.stroke();
        path(); g.strokeStyle = 'rgba(234,224,194,0.55)'; g.lineWidth = w * 0.18; g.stroke();
      }
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
    // 6. P10：占山宗门的台地石板与石阶（主线程、Worker 同一份数据）
    if (this.grandSects?.length) paintGrandSects(g, ox, oy, CHUNK, this.grandSects);
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
  private inField(wx: number, wy: number, locs: readonly FieldSite[]) {
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
    for (const l of this.fieldSites) {
      if ((l.type !== 'city' && l.type !== 'town') || l.look === 'camp') continue;   // 游牧的营地不种田
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
    return this.riverMask[y * this.W + x] === 1;
  }
  inLocZone(wx: number, wy: number, pad = 0) {
    for (const z of this.locZones) {
      const dx = (wx - z.x) / (z.rx + pad), dy = (wy - z.y) / (z.ry + pad);
      if (dx * dx + dy * dy < 1) return z;
    }
    return null;
  }
  /** 地点核心区（广场、院落）：不长野草；外围仍可 */
  /** P10：成片街坊的城整个占地（城墙、护城河、关厢）：不长野草（世界坐标的框） */
  cityBoxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
  inLocCore(wx: number, wy: number) {
    for (const b of this.cityBoxes) if (wx > b.x0 && wx < b.x1 && wy > b.y0 && wy < b.y1) return true;
    for (const z of this.locZones) {
      const dx = (wx - z.x) / (z.rx * 0.62), dy = (wy - z.y) / (z.ry * 0.62);
      if (dx * dx + dy * dy < 1) return true;
    }
    // 占山的宗门：台面、石阶上不长野草（山坡上照长）
    for (const g of this.grandSects) {
      const lx = wx - g.x, ly = wy - g.y, P = g.plan;
      if (Math.abs(lx - P.cx) > P.rx || Math.abs(ly - P.cy) > P.ry) continue;
      if (P.terraces.some((t) => rectDist(t, lx, ly) < 40) || onPlanStair(P, lx, ly, 60)) return true;
      const deck = planDeck(P, lx, ly); if (deck === deck) return true;   // 铁索桥面、悬空峰顶
    }
    return false;
  }
  demonNear(wx: number, wy: number) {
    for (const z of this.locZones) if (DEMON_SECTS.includes(z.id) && Math.hypot(wx - z.x, wy - z.y) < 5200) return true;
    return false;
  }

  /** 装饰物（独立于底图缓存，可预取更大范围，避免高山突然出现） */
  getDecos(cx: number, cy: number): Deco[] {
    const key = cx + ',' + cy;
    let e = this.decoCache.get(key);
    if (!e) {
      const gap = this.gapOf(cx, cy);
      e = { d: gap ? this.inGapFrame(gap, () => this.buildDecos(cx - gap.cols, cy - gap.rows)).map((d) => ({ ...d, x: d.x + gap.cols * CHUNK, y: d.y + gap.rows * CHUNK })) : this.buildDecos(cx, cy), used: this.frame };
      this.decoCache.set(key, e);
      // P10：高山模式镜头拉到 0.13 时一屏要三百来块的装饰，原来的 260 块装不下，每帧都在扔掉又重建正要画的块
      //（占山宗门的山林几千棵树，重建一次几十到几百毫秒的长帧）。放大上限，且只扔这一两帧没用到的块
      if (this.decoCache.size > (MOUNTAINS ? 640 : 260)) {
        const arr = [...this.decoCache.entries()].filter((q) => q[1].used < this.frame - 1).sort((a, b) => a[1].used - b[1].used);
        for (let i = 0; i < Math.min(60, arr.length); i++) this.decoCache.delete(arr[i][0]);
      }
    }
    e.used = this.frame;
    return e.d;
  }

  /** P10：不生成，只看缓存里有没有（渲染时每帧限量生成新块，飞得快时不至于一帧生成好几块卡一下） */
  peekGrass(cx: number, cy: number): Clump[] | null { const e = this.grassCache.get(cx + ',' + cy); if (e) e.used = this.frame; return e ? e.d : null; }
  peekDecos(cx: number, cy: number): Deco[] | null { const e = this.decoCache.get(cx + ',' + cy); if (e) e.used = this.frame; return e ? e.d : null; }
  /** 草丛分布：按 56 像素网格抖动，随地貌决定疏密与种类（跨块连续） */
  getGrass(cx: number, cy: number): Clump[] {
    const key = cx + ',' + cy;
    let e = this.grassCache.get(key);
    if (!e) {
      const gap = this.gapOf(cx, cy);
      e = { d: gap ? this.inGapFrame(gap, () => this.buildGrass(cx - gap.cols, cy - gap.rows)).map((c) => ({ ...c, x: c.x + gap.cols * CHUNK, y: c.y + gap.rows * CHUNK })) : this.buildGrass(cx, cy), used: this.frame };
      this.grassCache.set(key, e);
      if (this.grassCache.size > 200) {
        const arr = [...this.grassCache.entries()].sort((a, b) => a[1].used - b[1].used);
        for (let i = 0; i < 50; i++) this.grassCache.delete(arr[i][0]);
      }
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
    const towns = this.fieldSites.filter((l) => (l.type === 'city' || l.type === 'town') && l.look !== 'camp' && Math.abs(l.x * WORLD_SCALE - ox - CHUNK / 2) < 3600 && Math.abs(l.y * WORLD_SCALE - oy - CHUNK / 2) < 3600);
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
    const island = !pointInPoly(mx, my, MAINLAND) && !this.inOutland(wx + this.gapCol * WORLD_SCALE, wy + this.gapRow * WORLD_SCALE);   // 图外的草原不是海岛
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

  private buildDecos(cx: number, cy: number): Deco[] {
    const out: Deco[] = [];
    const ox = cx * CHUNK, oy = cy * CHUNK;
    const stride = this.treeStride();
    const keepTree = (x: number, y: number) => stride !== 0 && (stride === 1 || (((Math.round(x) * 73856093) ^ (Math.round(y) * 19349663)) >>> 0) % stride === 0);
    const inChunk = (x: number, y: number) => x >= ox && x < ox + CHUNK && y >= oy && y < oy + CHUNK;
    // ---------- 1. 山（粗网格，高处更密更高）----------
    // 网格 460 → 640：山很宽（最宽约 2 千米），网格太密会层层叠在一起、看不出峰形。
    // 可用 __mtnMC 临时改（调试/对比用）。
    const MC = Number((globalThis as any).__mtnMC) || 640;
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
        if (k === 1 && e < 0.82) continue; // 高山区第二座（叠峦）
        let w = 0, hh = 0, style: MtnStyle;
        if (e > 0.42) {
          const p = clamp((e - 0.42) * 2.4, 0, 0.97);
          if (h3 > p) continue;
          style = this.mountainStyle(wx, wy, s, h4);
          { const LM = landmarkAt(wx, wy); if (LM?.mtnStyle && style !== 'snow') style = LM.mtnStyle; }
          w = (560 + (e - 0.42) * 2000 * (0.6 + h4 * 0.7)) * (k ? 0.75 : 1);
          w = Math.min(w, 2100);
          hh = w * (0.42 + Math.min(1, e) * 0.32) * (0.8 + h5 * 0.45);
          if (style === 'karst') hh *= 1.15;
          if (style === 'desert') hh *= 0.6;
          if (style === 'hill') hh *= 0.5;
        } else if (e > 0.24) {
          if (h3 > 0.32) continue;
          style = s.arid > 0.75 ? 'desert' : this.mountainStyle(wx, wy, s, h4) === 'island' ? 'island' : s.cold > 0.42 ? 'snow' : 'hill';
          w = 360 + h4 * 380; hh = w * (0.32 + h5 * 0.15);
        } else continue;
        // 整体再抽掉 30%（默认保留 70%），按坐标哈希决定，重建/读档都不会变。
        // 想改比例：__mtnKeep = 0.8（保留八成），下一块地图生效。
        if (hash2(gx, gy, 106 + k * 10) > Number((globalThis as any).__mtnKeep ?? 0.70)) continue;
        const id = `m${gx}_${gy}_${k}`;
        const big = w > 1100;
        const spec: MtnSpec = {
          seed: (gx * 92821 + gy * 68917 + k * 7) >>> 0, style, w, h: hh,
          cliff: h5 < 0.35 && style !== 'hill', waterfall: e > 0.62 && s.arid < 0.5 && s.cold < 0.5 && h1 < 0.3 && style !== 'desert' && style !== 'demon',
          path: h2 < 0.08 && style !== 'snow', snowcap: e > 0.9 && style !== 'snow' && style !== 'desert' && style !== 'hill' && s.arid < 0.6, pavilion: h2 < 0.05, clouds: big && h4 < 0.6, layers: big ? 3 : w > 600 ? 2 : 1,
        };
        out.push({ kind: 'mtn', id, spec, x: wx, y: wy + 30, w, h: hh, flip: h5 < 0.5 });
      }
    }
    // ---------- 1b. 原设名地的山峰、名山 ----------
    const named = [...SCENIC.peaks];
    for (const L of LANDMARKS) if (Math.abs(L.x - ox) < L.r + CHUNK * 2 && Math.abs(L.y - oy) < L.r + CHUNK * 2) named.push(...L.peaks as any);
    for (const p of named) {
      if (!inChunk(p.x, p.y)) continue;
      const big = p.w > 1100;
      const spec: MtnSpec = { seed: p.seed >>> 0, style: p.style, w: p.w, h: p.h, cliff: p.style !== 'danxia', waterfall: !!p.waterfall, path: false, pavilion: false, snowcap: !!p.snow, clouds: !!p.clouds, layers: big ? 3 : 2 };
      out.push({ kind: 'mtn', id: p.id, spec, x: p.x, y: p.y, w: p.w, h: p.h, flip: !!p.flip });
    }
    // ---------- 1c. 瀑布 ----------
    for (const f of [...SCENIC.falls, ...this.procFallsNear(ox + CHUNK / 2, oy + CHUNK / 2, CHUNK)]) {
      if (!inChunk(f.x, f.y)) continue;
      out.push({ kind: 'fall', id: f.id, x: f.x, y: f.y, w: f.w, h: f.h, seed: f.seed, tiers: f.tiers, name: f.name });
      // 背后的山：瀑布挂在山脚的崖壁上，不至于孤零零立在平地
      const s0 = this.sample(f.x, f.y);
      const bst: MtnStyle = s0.cold > 0.42 ? 'snow' : landmarkAt(f.x, f.y)?.mtnStyle ?? (this.mountainStyle(f.x, f.y, s0, 0.3) === 'karst' ? 'karst' : 'qinglv');
      const bw = Math.min(2300, f.w * 2.6), bh = Math.max(f.h * 1.7, bw * 0.62);
      out.push({ kind: 'mtn', id: f.id + '_bg', spec: { seed: (f.seed * 31 + 7) >>> 0, style: bst, w: bw, h: bh, cliff: true, waterfall: false, path: false, pavilion: false, snowcap: false, clouds: bw > 1300, layers: 3 }, x: f.x + (hash2(f.x | 0, 1, 3) - 0.5) * f.w * 0.3, y: f.y - f.h * 0.42, w: bw, h: bh, flip: hash2(f.x | 0, 2, 3) < 0.5 });
    }
    // ---------- 1d. 花林（桃、杏，冬梅秋枫）----------
    for (const gv of this.grovesNear(ox + CHUNK / 2, oy + CHUNK / 2, CHUNK)) {
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
        if (!this.isLand(x, y) || this.onRoad(x, y) || this.inLocZone(x, y, 200) || this.riverEdge(x, y) < 40 || lmCleared(x, y)) continue;
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
      const island = !pointInPoly(gcx / WORLD_SCALE, gcy / WORLD_SCALE, MAINLAND) && !this.inOutland(gcx + this.gapCol * WORLD_SCALE, gcy + this.gapRow * WORLD_SCALE);   // 图外的草原不是海岛
      const zq = zoneAt(gcx, gcy);   // 第三十步：魔道地界多枫与枯木，阴地多枯木与柏
      const zone = this.inLocZone(gcx, gcy, 2600)?.id === 'huangfeng' ? 'ymaple' : zq.k > 0.3 ? (zq.t === 1 ? 'demon' : 'ghost') : undefined;
      const R = (90 + h4 * 230 + s.forest * 180) * (s.arid > 0.6 ? 0.5 : 1);
      const sp1 = pickSpecies(h4, { ...s, nearWater: nearW, island, zone });
      const sp2 = pickSpecies(hash2(gx, gy, 205), { ...s, nearWater: nearW, island, zone });
      const spacing = s.forest > 0.5 ? 74 : 100;
      const n = Math.min(42, Math.max(1, Math.round((Math.PI * R * R) / (spacing * spacing) * (0.45 + s.forest * 0.6))));
      const rnd = mulberry32((gx * 73856093) ^ (gy * 19349663) ^ 0x7777);
      // 泊松盘：林子里的树彼此留出间距（大树占的地方大、小树可以挨得近），不再随手撒点叠成一团。
      // 整片林子的落点先按同一串随机数定下来（哪一块地面来问都一样），再看落在不在本块里。
      const placed: number[] = [];
      for (let i = 0, made = 0; i < n * 3 && made < n; i++) {
        const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * R;
        const x = gcx + Math.cos(a) * rr, y = gcy + Math.sin(a) * rr * 0.75;
        const hv = rnd(), hs = rnd(), hf = rnd(), hp = rnd(), hsp = rnd();
        const keep = spacing * 0.4 * (0.78 + hs * 0.4) * (1.1 - (rr / R) * 0.25);
        let clear = true;
        for (let j = 0; j < placed.length; j += 3) { const dx = x - placed[j], dy = (y - placed[j + 1]) * 1.33, q = keep + placed[j + 2]; if (dx * dx + dy * dy < q * q) { clear = false; break; } }
        if (!clear) continue;
        placed.push(x, y, keep); made++;
        if (!inChunk(x, y)) continue;
        if (!this.isLand(x, y)) continue;
        if (this.onRoad(x, y) || this.inLocZone(x, y, 260)) continue;
        if (this.riverEdge(x, y) < 40) continue;
        if (lmCleared(x, y) || this.groveHere(x, y) || this.nearProcFall(x, y, 260)) continue;
        const ss = this.sample(x, y);
        if (ss.elev > 0.62 && hsp < 0.8) continue;
        let sp: Species = hsp < 0.72 ? sp1 : sp2;
        const LM = landmarkAt(x, y);
        if (LM?.trees) { if (LM.treeK !== undefined && LM.treeK < 1 && hv > LM.treeK) continue; sp = LM.trees[Math.floor(hsp * LM.trees.length) % LM.trees.length]; }
        if (sp === 'willow' && !(this.nearRiver(x, y) || ss.land < 0.66)) sp = s.cold > 0.4 ? 'pine' : 'broad';
        // 生态规则（高山模式）：峭壁上不长树，陡坡只挂得住松柏；林线以上没有树，林线附近只剩稀疏的松
        if (MOUNTAINS && this.surface) {
          const g = this.surface.sample(x, y);
          if (g.slope > 0.95 || g.height > 4700) continue;
          const steep = g.slope > 0.6, high = g.height > 3500;
          if ((steep || high) && hv > 0.55) continue;
          if (high) sp = ss.cold > 0.3 || g.height > 4100 ? 'snowpine' : 'pine';
          else if (steep && sp !== 'pine' && sp !== 'cypress' && sp !== 'snowpine' && sp !== 'dead') sp = hsp < 0.6 ? 'pine' : 'cypress';
        }
        // 边缘的树小一点，林心大
        const sc = (0.78 + hs * 0.4) * (1.1 - (rr / R) * 0.25);
        const base = TREE_SIZE[sp] * sc;
        if (!keepTree(x, y)) continue;
        out.push({ kind: 'tree', sp, v: Math.floor(hv * TREE_VARIANTS), x, y, w: base * 1.2, h: base * 1.35, s: sc, flip: hf < 0.5, ph: hp * Math.PI * 2, lod: (placed.length / 3) % 3 });
      }
    }
    // ---------- 2b. P10：占山宗门的山林（地界里台面以外的山坡，见 sectTrees.ts）----------
    if (this.grandSects.length) for (const t of sectChunkTrees(this.grandSects, ox, oy, CHUNK)) {
      const base = TREE_SIZE[t.sp] * t.s;
      out.push({ kind: 'tree', sp: t.sp, v: Math.floor(t.hv * TREE_VARIANTS), x: t.x, y: t.y, w: base * 1.2, h: base * 1.35, s: t.s, flip: t.hf < 0.5, ph: t.hp * Math.PI * 2, lod: Math.floor(t.hv * 97) % 3 });
    }
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
      if (this.inLocZone(wx, wy, 40) || this.nearRoad(wx, wy, 40)) continue;
      const rock = this.rockGlyphs.length ? this.rockGlyphs[(h5 * 3) | 0] : null;
      const re = this.riverEdge(wx, wy);
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
  buildOverview(scale = 1): HTMLCanvasElement { const it = this.overviewSteps(scale); for (;;) { const r = it.next(); if (r.done) return r.value; } }
  /** 分段画全图缩略（后台悄悄准备邻图时用）：每 16 行交还一次 */
  *overviewSteps(scale = 1): Generator<void, HTMLCanvasElement, void> {
    const W = this.W * scale, H = this.H * scale;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d')!;
    const img = g.createImageData(W, H);
    for (let row = 0; row < H; row += 16) { this.overviewRows(img, 0, 0, scale, row, Math.min(H, row + 16)); yield; }
    g.putImageData(img, 0, 0);
    // 不带图标的底色副本（小地图放大时先把它平滑放大，再在上面画清晰的矢量）
    const base = document.createElement('canvas'); base.width = W; base.height = H; base.getContext('2d')!.drawImage(cv, 0, 0);
    this.overviewBase = base;
    yield;
    this.overviewVectors(g, 0, 0, W, H, scale);
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
    const ux0 = x0 - 12, uy0 = y0 - 4, ux1 = x0 + Wpx / scale + 12, uy1 = y0 + Hpx / scale + 20;
    g.save(); g.scale(scale, scale); g.translate(-x0, -y0);
    // 河流
    g.lineCap = 'round'; g.lineJoin = 'round';
    // 第三十步：按包围盒剔除——放大地图时每块只描与之相交的河 / 路（整条描边、尤其是虚线，很贵）
    const off = (o: any) => { let b = o._bb; if (!b) { b = o._bb = [1e9, 1e9, -1e9, -1e9]; for (const [x, y] of o.pts) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; } } return b[2] < ux0 - 4 || b[0] > ux1 + 4 || b[3] < uy0 - 4 || b[1] > uy1 + 4; };
    for (const rv of this.rivers) {
      if (off(rv)) continue;
      g.beginPath(); rv.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.strokeStyle = 'rgba(120,150,155,0.9)'; g.lineWidth = 0.9 * rv.w; g.stroke();
    }
    // 道路
    // 放大时山林图标更小更密（每 3 单位一格），免得一座山占半张小地图
    const fine = scale >= 3, iconK = fine ? 0.4 : 1, step = fine ? 3 : 6, jit = fine ? 2 : 4;
    g.setLineDash([2 / Math.max(1, scale / 3), 2 / Math.max(1, scale / 3)]);
    for (const rd of this.roads) {
      if (off(rd)) continue;
      g.beginPath(); rd.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.strokeStyle = 'rgba(120,96,60,0.55)'; g.lineWidth = (rd.major ? 1.1 : 0.7) / Math.max(1, scale / 2); g.stroke();
    }
    g.setLineDash([]);
    // 山与林的小图标（代码绘制）
    const gy0 = Math.max(4, 4 + Math.floor((uy0 - 4) / step) * step), gx0 = Math.max(4, 4 + Math.floor((ux0 - 4) / step) * step);
    for (let y = gy0; y < this.H && y < uy1; y += step) for (let x = gx0; x < this.W && x < ux1; x += step) {
      const jx = x + (hash2(x, y, 5) - 0.5) * jit, jy = y + (hash2(x, y, 6) - 0.5) * jit;
      const i = (jy | 0) * this.W + (jx | 0);
      if (this.land[i] < 0.55) continue;
      const e = this.elev[i];
      if (e > 0.45 && hash2(x, y, 8) < (e - 0.3) * 1.6) {
        const w = (6 + e * 9) * iconK, h = w * (0.55 + hash2(x, y, 9) * 0.4);
        const snow = this.cold[i] > 0.42, desert = this.arid[i] > 0.75;
        const base = snow ? '#c8d0dc' : desert ? '#c09a62' : '#6f8a7a';
        g.beginPath(); g.moveTo(jx - w / 2, jy); g.quadraticCurveTo(jx - w * 0.15, jy - h * 0.7, jx, jy - h); g.quadraticCurveTo(jx + w * 0.2, jy - h * 0.6, jx + w / 2, jy); g.closePath();
        g.fillStyle = base; g.fill();
        g.beginPath(); g.moveTo(jx, jy - h); g.quadraticCurveTo(jx + w * 0.2, jy - h * 0.6, jx + w / 2, jy); g.lineTo(jx + w * 0.05, jy); g.closePath();
        g.fillStyle = 'rgba(30,40,40,0.28)'; g.fill();
        if (snow || e > 0.95) { g.beginPath(); g.moveTo(jx - w * 0.12, jy - h * 0.75); g.lineTo(jx, jy - h); g.lineTo(jx + w * 0.1, jy - h * 0.78); g.closePath(); g.fillStyle = '#fafcff'; g.fill(); }
        g.strokeStyle = 'rgba(40,40,36,0.6)'; g.lineWidth = fine ? 0.22 : 0.5;
        g.beginPath(); g.moveTo(jx - w / 2, jy); g.quadraticCurveTo(jx - w * 0.15, jy - h * 0.7, jx, jy - h); g.quadraticCurveTo(jx + w * 0.2, jy - h * 0.6, jx + w / 2, jy); g.stroke();
      } else if (this.forest[i] > 0.5 && hash2(x, y, 7) < 0.7) {
        g.fillStyle = this.cold[i] > 0.5 ? 'rgba(50,80,70,0.7)' : 'rgba(60,100,60,0.65)';
        const fk = fine ? 0.5 : 1;
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
