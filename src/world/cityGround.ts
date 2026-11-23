// P10：成片街坊的城的地面（街道、胡同、院内铺地、广场、集市、河道、护城河、花园……）。
// 上万见方的城画成一张贴图会糊成一片，这里分块画：每块 512×512 像素，按当前地贴的清晰度挑一档（每档世界尺寸翻倍），
// 画好的块缓存起来（最近用过的留着），每帧限时补画新块；还没画好的块先用粗一档的顶上，再没有就铺一层底色。
// 纹理（石板、条石、青砖、方砖……）都是开局用代码画的小图，按世界坐标平铺，相邻块无缝。
import { makeCanvas } from '../core/canvas';
import { mulberry32 } from '../core/rng';
import { LOC_SCALE, type LocLayout } from '../gfx/building';

const TILE_PX = 512;
/** 地面种类（与 cityLayout.ts 的 CG 一致） */
const T = { BASE: 0, AVE: 1, ST: 2, ALLEY: 3, YARD: 4, PLAZA: 5, WATER: 6, GARDEN: 7, MARKET: 8, TEMPLE: 9, ALTAR: 10, PALACE: 11, DIRT: 12, FIELD: 13 };
/** 远看时的平涂色 */
const FLAT: Record<number, string> = {
  [T.BASE]: '#c9ba95', [T.AVE]: '#b9b1a0', [T.ST]: '#beb5a2', [T.ALLEY]: '#a9a59b', [T.YARD]: '#cdc4ae', [T.PLAZA]: '#c8c0ac', [T.WATER]: '#6f989c',
  [T.GARDEN]: '#7f9a64', [T.MARKET]: '#cdbb92', [T.TEMPLE]: '#cfc6b0', [T.ALTAR]: '#e4e0d6', [T.PALACE]: '#d6d0c2', [T.DIRT]: '#bfae88', [T.FIELD]: '#8aa25e',
};

type Item = { t: number; x0: number; y0: number; x1: number; y1: number; o: boolean };
interface State { tint?: [string, string, number]; items: Item[]; grid: Map<number, number[]>; wet: { x0: number; y0: number; x1: number; y1: number }[]; ext: { x0: number; y0: number; x1: number; y1: number }; id: string }
const states = new WeakMap<LocLayout, State | null>();
const GC = 2048;

function stateOf(L: LocLayout): State | null {
  let s = states.get(L);
  if (s !== undefined) return s;
  const info = (L as LocLayout & { cityInfo?: { extent: { x0: number; y0: number; x1: number; y1: number }; gext?: { x0: number; y0: number; x1: number; y1: number } } }).cityInfo;
  if (!info) { states.set(L, null); return null; }
  const S = LOC_SCALE, items: Item[] = [];
  for (const g of L.ground) {
    if (g.kind !== 'cg') continue;
    items.push({ t: g.p!.t, x0: (g.x - g.w / 2) * S, y0: (g.y - g.h / 2) * S, x1: (g.x + g.w / 2) * S, y1: (g.y + g.h / 2) * S, o: !!g.p!.o });
  }
  const grid = new Map<number, number[]>();
  items.forEach((it, i) => {
    for (let gx = Math.floor(it.x0 / GC); gx <= Math.floor(it.x1 / GC); gx++) for (let gy = Math.floor(it.y0 / GC); gy <= Math.floor(it.y1 / GC); gy++) {
      const k = (gx + 512) * 1024 + gy + 512; let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i);
    }
  });
  const wet = (L.wet ?? []).map((r) => ({ x0: r.x * S, y0: r.y * S, x1: (r.x + r.w) * S, y1: (r.y + r.h) * S }));
  // 地域样式的地色：边城黄土、寒渊积雪、幽冥灰暗、炎墟赭红……（整块乘一层 / 盖一层）
  const st = (L as LocLayout & { cityStyle?: string }).cityStyle ?? 'central';
  // source-atop：只染已经画了的地方（城外留空的地方仍透明）
  const TINT: Record<string, [string, string, number]> = { frontier: ['source-atop', '#c8a468', 0.32], frost: ['source-atop', '#f4f8fc', 0.45], nether: ['source-atop', '#3a3848', 0.38], ember: ['source-atop', '#8a4a30', 0.3],
    demon: ['source-atop', '#4a3434', 0.3], jin: ['source-atop', '#8a8a88', 0.18], spiritwood: ['source-atop', '#6a8a50', 0.22], isle: ['source-atop', '#f0ece2', 0.15] };
  s = { items, grid, wet, ext: info.gext ?? info.extent, id: L.id, tint: TINT[st] };
  states.set(L, s);
  return s;
}

// ---------------------------------------------------------------- 纹理（256 世界单位一周期，1 像素 = 1 单位）
let PAT: Record<number, HTMLCanvasElement> | null = null;
function patterns(): Record<number, HTMLCanvasElement> {
  if (PAT) return PAT;
  const N = 256, rnd = mulberry32(0x5eed);
  const mk = (base: string, f: (g: CanvasRenderingContext2D) => void) => { const c = makeCanvas(N, N) as HTMLCanvasElement, g = c.getContext('2d')!; g.fillStyle = base; g.fillRect(0, 0, N, N); f(g); return c; };
  const speck = (g: CanvasRenderingContext2D, n: number, a: number, dark = true) => { for (let i = 0; i < n; i++) { g.fillStyle = dark ? `rgba(60,48,32,${a * rnd()})` : `rgba(255,250,235,${a * rnd()})`; g.fillRect(rnd() * N, rnd() * N, 1 + rnd() * 3, 1 + rnd() * 3); } };
  /** 错缝石板：行高 rh，每块宽在 [a, b] 之间，块色略有深浅 */
  const slabs = (g: CanvasRenderingContext2D, rh: number, a: number, b: number, base: [number, number, number], seam: string, jitter = 14) => {
    for (let y = 0; y < N; y += rh) {
      let x = -rnd() * b;
      while (x < N) {
        const w = a + rnd() * (b - a), k = (rnd() - 0.5) * jitter;
        g.fillStyle = `rgb(${base[0] + k | 0},${base[1] + k | 0},${base[2] + k * 0.9 | 0})`;
        g.fillRect(x, y, w, rh);
        // 平铺要无缝：跨右边界的那块在左边再画一次
        if (x + w > N) g.fillRect(x - N, y, w, rh);
        g.fillStyle = seam; g.fillRect(x, y, 1.6, rh); if (x + w > N) g.fillRect(x - N, y, 1.6, rh);
        x += w;
      }
      g.fillStyle = seam; g.fillRect(0, y, N, 1.6);
    }
  };
  PAT = {
    [T.BASE]: mk('#c9ba95', (g) => { for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '120,100,70' : '230,220,190'},${0.08 + rnd() * 0.1})`; g.beginPath(); g.ellipse(rnd() * N, rnd() * N, 6 + rnd() * 26, 4 + rnd() * 14, rnd() * 3, 0, Math.PI * 2); g.fill(); } speck(g, 500, 0.35); }),
    [T.DIRT]: mk('#bfae88', (g) => { for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '110,92,62' : '220,208,175'},${0.08 + rnd() * 0.12})`; g.beginPath(); g.ellipse(rnd() * N, rnd() * N, 8 + rnd() * 30, 4 + rnd() * 12, rnd() * 3, 0, Math.PI * 2); g.fill(); } speck(g, 400, 0.4); }),
    [T.AVE]: mk('#b9b1a0', (g) => { slabs(g, 64, 70, 130, [186, 178, 162], 'rgba(70,62,50,0.55)', 18); speck(g, 300, 0.25); speck(g, 200, 0.25, false); }),
    [T.ST]: mk('#beb5a2', (g) => { slabs(g, 32, 40, 80, [190, 181, 163], 'rgba(70,62,50,0.5)', 16); speck(g, 300, 0.25); }),
    [T.ALLEY]: mk('#a9a59b', (g) => { slabs(g, 16, 30, 34, [168, 164, 154], 'rgba(60,58,52,0.5)', 10); speck(g, 200, 0.2); }),
    [T.YARD]: mk('#cdc4ae', (g) => { for (let y = 0; y < N; y += 32) for (let x = 0; x < N; x += 32) { const k = (rnd() - 0.5) * 12; g.fillStyle = `rgb(${205 + k | 0},${196 + k | 0},${174 + k | 0})`; g.fillRect(x, y, 32, 32); } g.fillStyle = 'rgba(90,80,64,0.45)'; for (let i = 0; i < N; i += 32) { g.fillRect(i, 0, 1.4, N); g.fillRect(0, i, N, 1.4); } speck(g, 150, 0.2); }),
    [T.PLAZA]: mk('#c8c0ac', (g) => { slabs(g, 64, 90, 140, [202, 194, 176], 'rgba(80,72,58,0.45)', 14); speck(g, 200, 0.2); }),
    [T.TEMPLE]: mk('#cfc6b0', (g) => { slabs(g, 64, 64, 64, [208, 199, 178], 'rgba(90,76,58,0.45)', 10); speck(g, 150, 0.2); }),
    [T.PALACE]: mk('#d6d0c2', (g) => { slabs(g, 128, 128, 128, [216, 210, 196], 'rgba(110,100,84,0.4)', 8); speck(g, 120, 0.15); }),
    [T.ALTAR]: mk('#e4e0d6', (g) => { slabs(g, 64, 128, 128, [230, 226, 216], 'rgba(120,112,100,0.35)', 6); }),
    [T.MARKET]: mk('#cdbb92', (g) => { for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(150,140,120,${0.2 + rnd() * 0.3})`; g.fillRect(rnd() * N, rnd() * N, 10 + rnd() * 20, 8 + rnd() * 14); } speck(g, 600, 0.4); }),
    [T.GARDEN]: mk('#7f9a64', (g) => { for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '60,90,44' : '150,170,100'},${0.2 + rnd() * 0.3})`; g.beginPath(); g.ellipse(rnd() * N, rnd() * N, 2 + rnd() * 6, 1 + rnd() * 3, rnd() * 3, 0, Math.PI * 2); g.fill(); } }),
    [T.FIELD]: mk('#8aa25e', (g) => { for (let y = 0; y < N; y += 16) { g.fillStyle = 'rgba(70,90,40,0.5)'; g.fillRect(0, y, N, 6); g.fillStyle = 'rgba(160,140,90,0.35)'; g.fillRect(0, y + 10, N, 3); } }),
    [T.WATER]: mk('#6f989c', (g) => { for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(230,240,235,${0.12 + rnd() * 0.18})`; g.lineWidth = 1.2; const x = rnd() * N, y = rnd() * N, w = 10 + rnd() * 30; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 3, x + w, y); g.stroke(); } }),
  };
  return PAT;
}

// ---------------------------------------------------------------- 分块缓存
interface Tile { c: HTMLCanvasElement; used: number }
const cache = new Map<string, Tile>();
const MAX_TILES = 64;
let frame = 0, frameAt = -1, spent = 0;
/** 测量用：缓存的块数、本帧画了几块 */
export const cityGroundStats = { tiles: 0, painted: 0, ms: 0, msMax: 0 };
if (typeof window !== 'undefined') (window as unknown as { __cityGround: typeof cityGroundStats }).__cityGround = cityGroundStats;

function paint(s: State, lv: number, i: number, j: number): HTMLCanvasElement {
  const res = Math.pow(2, lv), tw = TILE_PX / res, tx0 = i * tw, ty0 = j * tw, tx1 = tx0 + tw, ty1 = ty0 + tw;
  const c = makeCanvas(TILE_PX, TILE_PX) as HTMLCanvasElement, g = c.getContext('2d')!;
  g.setTransform(res, 0, 0, res, -tx0 * res, -ty0 * res);
  const fine = res >= 0.2, P = fine ? patterns() : null;
  const pats = new Map<number, CanvasPattern | string>();
  const fill = (t: number) => { let p = pats.get(t); if (!p) { p = (P && P[t] ? g.createPattern(P[t], 'repeat') : null) ?? FLAT[t] ?? '#c0b090'; pats.set(t, p); } return p; };
  const seen = new Set<number>(), list: number[] = [];
  for (let gx = Math.floor(tx0 / GC); gx <= Math.floor(tx1 / GC); gx++) for (let gy = Math.floor(ty0 / GC); gy <= Math.floor(ty1 / GC); gy++)
    for (const k of s.grid.get((gx + 512) * 1024 + gy + 512) ?? []) if (!seen.has(k)) { seen.add(k); list.push(k); }
  list.sort((a, b) => a - b);   // 按布局里的先后画（底在下、街在上）
  for (const k of list) {
    const it = s.items[k];
    if (it.x1 < tx0 || it.x0 > tx1 || it.y1 < ty0 || it.y0 > ty1) continue;
    const w = it.x1 - it.x0, h = it.y1 - it.y0;
    g.fillStyle = fill(it.t);
    if (it.t === T.DIRT && Math.min(w, h) <= 600) {
      // 城外的土路（关厢街、港区路）：底下那一圈土地是同一种土色，照样铺上去等于没画——
      // 压实的路面深一档、两边留浅色路肩、中间两道车辙
      const hz = w > h, len = hz ? w : h, wid = hz ? h : w;
      g.fillRect(it.x0, it.y0, w, h);
      g.fillStyle = 'rgba(128,100,62,0.34)'; g.fillRect(it.x0, it.y0, w, h);
      if (fine) {
        g.fillStyle = 'rgba(236,224,190,0.5)';
        if (hz) { g.fillRect(it.x0, it.y0, len, 7); g.fillRect(it.x0, it.y1 - 7, len, 7); } else { g.fillRect(it.x0, it.y0, 7, len); g.fillRect(it.x1 - 7, it.y0, 7, len); }
        g.fillStyle = 'rgba(92,70,42,0.3)';
        for (const k of [0.36, 0.64]) { if (hz) g.fillRect(it.x0, it.y0 + wid * k - 5, len, 10); else g.fillRect(it.x0 + wid * k - 5, it.y0, 10, len); }
      }
      continue;
    }
    if (it.t === T.DIRT) {
      // 城外一圈土地：边缘渐淡，和野地接上
      g.globalAlpha = 0.45; g.fillRect(it.x0, it.y0, w, h);
      g.globalAlpha = 0.5; g.fillRect(it.x0 + 500, it.y0 + 500, w - 1000, h - 1000);
      g.globalAlpha = 1;
      continue;
    }
    if (it.o) { g.beginPath(); g.ellipse((it.x0 + it.x1) / 2, (it.y0 + it.y1) / 2, w / 2, h / 2, 0, 0, Math.PI * 2); g.fill(); }
    else g.fillRect(it.x0, it.y0, w, h);
    if (fine) {
      // 边：街沿、院墙根、河岸
      if (it.t === T.WATER) { g.strokeStyle = 'rgba(150,145,130,0.95)'; g.lineWidth = 7; if (it.o) { g.beginPath(); g.ellipse((it.x0 + it.x1) / 2, (it.y0 + it.y1) / 2, w / 2, h / 2, 0, 0, Math.PI * 2); g.stroke(); } else g.strokeRect(it.x0, it.y0, w, h); }
      else if (it.t === T.AVE || it.t === T.ST) {
        g.fillStyle = 'rgba(80,70,56,0.32)';
        if (w > h) { g.fillRect(it.x0, it.y0, w, 5); g.fillRect(it.x0, it.y1 - 5, w, 5); } else { g.fillRect(it.x0, it.y0, 5, h); g.fillRect(it.x1 - 5, it.y0, 5, h); }
      } else if (it.t === T.YARD || it.t === T.PLAZA || it.t === T.TEMPLE || it.t === T.PALACE) { g.strokeStyle = 'rgba(90,80,64,0.35)'; g.lineWidth = 4; g.strokeRect(it.x0 + 2, it.y0 + 2, w - 4, h - 4); }
    }
  }
  if (s.tint) { g.globalCompositeOperation = s.tint[0] as GlobalCompositeOperation; g.globalAlpha = s.tint[2]; g.fillStyle = s.tint[1]; g.fillRect(tx0, ty0, tw, tw); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
  // 天然的河、湖：挖掉，露出底下地形画的水
  if (s.wet.length) {
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
    for (const r of s.wet) if (!(r.x1 < tx0 || r.x0 > tx1 || r.y1 < ty0 || r.y0 > ty1)) g.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    g.globalCompositeOperation = 'source-over';
  }
  return c;
}

/**
 * 画一座城的地面（世界坐标的画布上，渲染器已设好世界变换）。L 不是新布局的城就返回 false。
 * ox, oy：城中心的世界坐标；left..bottom：可见地面范围。
 */
export function drawCityGround(ctx: CanvasRenderingContext2D, L: LocLayout, ox: number, oy: number, left: number, top: number, right: number, bottom: number): boolean {
  const s = stateOf(L);
  if (!s) return false;
  if ((globalThis as { __noCityGround?: boolean }).__noCityGround) return true;   // 调试：不画城的地面
  const now = performance.now();
  if (now - frameAt > 4) { frame++; frameAt = now; spent = 0; cityGroundStats.painted = 0; }
  // 当前地贴每世界单位多少像素 → 挑一档（每档 2 倍），不超过 1
  const m = ctx.getTransform(), px = Math.hypot(m.a, m.b);
  const lv = Math.max(-6, Math.min(0, Math.round(Math.log2(Math.max(1e-4, px)))));
  const res = Math.pow(2, lv), tw = TILE_PX / res;
  const e = s.ext;
  const x0 = Math.max(e.x0, left - ox), x1 = Math.min(e.x1, right - ox), y0 = Math.max(e.y0, top - oy), y1 = Math.min(e.y1, bottom - oy);
  if (x0 >= x1 || y0 >= y1) return true;
  const i0 = Math.floor(x0 / tw), i1 = Math.floor(x1 / tw), j0 = Math.floor(y0 / tw), j1 = Math.floor(y1 / tw);
  const t0 = performance.now();
  // 离画面中心近的先画
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, order: [number, number, number][] = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) order.push([i, j, Math.hypot((i + 0.5) * tw - cx, (j + 0.5) * tw - cy)]);
  order.sort((a, b) => a[2] - b[2]);
  for (const [i, j] of order) {
    const key = `${s.id}:${lv}:${i}:${j}`;
    let tile = cache.get(key);
    // 粗一档的块里有这一截就先顶着，留到下一帧再画；一块都没有才硬画（每帧至少一块，免得一直空着）
    const hasFallback = () => { for (let up = 1; up <= 4; up++) { const l2 = lv - up; if (l2 < -6) break; const tw2 = TILE_PX / Math.pow(2, l2); if (cache.has(`${s.id}:${l2}:${Math.floor(i * tw / tw2)}:${Math.floor(j * tw / tw2)}`)) return true; } return false; };
    if (!tile && (spent < 2.5 || (cityGroundStats.painted === 0 && !hasFallback()))) {
      const a = performance.now();
      tile = { c: paint(s, lv, i, j), used: frame };
      cache.set(key, tile); cityGroundStats.painted++;
      spent += performance.now() - a;
    }
    if (tile) { tile.used = frame; ctx.drawImage(tile.c, ox + i * tw, oy + j * tw, tw, tw); continue; }
    // 还没画好：用粗一档（或更粗）的块里对应的那一截顶上
    let ok = false;
    for (let up = 1; up <= 4 && !ok; up++) {
      const l2 = lv - up; if (l2 < -6) break;
      const tw2 = TILE_PX / Math.pow(2, l2), i2 = Math.floor(i * tw / tw2), j2 = Math.floor(j * tw / tw2);
      const t2 = cache.get(`${s.id}:${l2}:${i2}:${j2}`);
      if (!t2) continue;
      const sx = (i * tw - i2 * tw2) / tw2 * TILE_PX, sy = (j * tw - j2 * tw2) / tw2 * TILE_PX, sw = tw / tw2 * TILE_PX;
      t2.used = frame; ctx.drawImage(t2.c, sx, sy, sw, sw, ox + i * tw, oy + j * tw, tw, tw); ok = true;
    }
    if (!ok) {
      // 一层底色
      ctx.fillStyle = FLAT[T.BASE];
      const ax = Math.max(e.x0, i * tw), ay = Math.max(e.y0, j * tw), bx = Math.min(e.x1, (i + 1) * tw), by = Math.min(e.y1, (j + 1) * tw);
      ctx.globalAlpha = 0.6; ctx.fillRect(ox + ax, oy + ay, bx - ax, by - ay); ctx.globalAlpha = 1;
    }
  }
  // 远一档的整城预画一块（拉远时不至于空白）：每帧顺手补一块
  if (spent < 1.2) {
    const l2 = Math.max(-6, lv - 3), tw2 = TILE_PX / Math.pow(2, l2);
    for (let j = Math.floor(e.y0 / tw2); j <= Math.floor(e.y1 / tw2) && spent < 1.2; j++) for (let i = Math.floor(e.x0 / tw2); i <= Math.floor(e.x1 / tw2) && spent < 1.2; i++) {
      const key = `${s.id}:${l2}:${i}:${j}`;
      if (cache.has(key)) continue;
      const a = performance.now(); cache.set(key, { c: paint(s, l2, i, j), used: frame }); spent += performance.now() - a;
    }
  }
  // 只留最近用过的
  if (cache.size > MAX_TILES) {
    const old = [...cache.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [k, t] of old) { if (cache.size <= MAX_TILES) break; if (t.used >= frame) continue; cache.delete(k); t.c.width = t.c.height = 0; }
  }
  cityGroundStats.tiles = cache.size; cityGroundStats.ms = performance.now() - t0; cityGroundStats.msMax = Math.max(cityGroundStats.msMax, cityGroundStats.ms);
  return true;
}
