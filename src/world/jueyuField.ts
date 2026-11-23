// 绝域的「离岸多远」：按大陆坐标（南荒的坐标）给出任一点离最近的岸有多远（世界单位）。
//
// 为什么单独算一张场、不直接问地形：南荒、沧溟海、中州各有自己的地形对象，人飞在交界里时只建好了其中一两张，
// 两边问出来的岸也不完全一样（地形各自按自己的图揉岸线）。这里照着地形生成陆地的同一套做法（同样的扭曲噪声、
// 同样的群岛撒点随机序列），在大陆坐标的一张粗网格（每格 2000）上把三张图和图外的草原拼成一张陆地图，
// 再做一次欧氏距离变换。只算一次、两边共用，所以南荒一侧、沧溟海一侧对同一个大陆坐标点问出来的一定是同一个数。
//
// 四座有名的海岛也算岸，但只撑起一小圈：离岛的距离乘 ISLE_K 再和离大陆的距离取小——
// 岛边是近海、能落脚歇息，却不至于把它们之间的核心海域整片抹掉（无边海的四座岛都在海峡正中）。
//
// 图内的海再深也封顶（CAP_IN，加上离图边多远）：沧溟海本身就是一片海，图内不该出现迷雾断层；
// 封顶值随离图边的距离往外长，所以在图边上是连续的。
//
// 计算量：陆地判定约十万个网格点（每点六次三层噪声），加一次距离变换。分片做（step 每次只做几毫秒），
// 新开局的头一两秒在后台做完；无头测试里直接 ensure() 一口气做完。
import { fbm, mulberry32 } from '../core/rng';
import { MAP_IDS, MAP_SEAMS, SEA_ISLES, WORLD_SCALE, mapFrame, mapShoreData, pointInPoly, type MapId, type P } from '../data/world';
import { outlandAt } from './outland';

/** 网格边长（世界单位） */
export const FIELD_G = 2000;
/**
 * 图内的海离岸再远也只算这么多（再加上离图边多远）。取得很小：分带按「出了图边多远」走，
 * 无边海的核心才是计划里算的那约八万多宽（十五万宽的海峡两头各让出三万多）；离真正的岸有多远另有 trueDepthAt（罗盘用）。
 */
export const CAP_IN = 2000;
/** 有名的海岛：离岛的距离按这个倍数算（岛只撑起一小圈近海） */
export const ISLE_K = 3;

interface Rect { x0: number; y0: number; x1: number; y1: number; map: MapId }
/** 一张图在大陆坐标里的矩形 */
function rectOf(map: MapId): Rect {
  const f = mapFrame(map), D = mapShoreData(map);
  return { x0: -f.dx, y0: -f.dy, x1: -f.dx + D.W * WORLD_SCALE, y1: -f.dy + D.H * WORLD_SCALE, map };
}
/** 绝域覆盖的几张图（有交界、图外铺着海的那几张；别界的图不在这里） */
const FIELD_MAPS: MapId[] = MAP_IDS.filter((m) => !!MAP_SEAMS[m]);

/** 照 terrain.ts 的 buildSteps 撒岛（同一个随机序列、同样的规则；只取位置和半径，宏观坐标） */
function islandsOf(map: MapId): { x: number; y: number; r: number }[] {
  const D = mapShoreData(map), rnd = mulberry32(20261014), out: { x: number; y: number; r: number }[] = [];
  for (const l of D.locations) if (l.island) out.push({ x: l.x, y: l.y, r: l.island });
  const F = D.islandField, n0 = out.length;
  let tries = 0;
  if (F) {
    const fw = F.x1 - F.x0, fh = F.y1 - F.y0;
    const cores = out.filter((o) => o.r >= 9).map((o) => ({ x: o.x, y: o.y, s: o.r * 3.2 }));
    for (let i = 0; i < 30; i++) cores.push({ x: F.x0 + rnd() * fw, y: F.y0 + rnd() * fh, s: 14 + rnd() * 26 });
    const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
    while (out.length < F.count + n0 && tries++ < F.count * 20) {
      let x: number, y: number;
      if (rnd() < 0.82) { const c = cores[Math.floor(rnd() * cores.length)]; const a = rnd() * Math.PI * 2, d = Math.abs(gauss()) * c.s * 1.6; x = c.x + Math.cos(a) * d * 1.25; y = c.y + Math.sin(a) * d * 0.85; }
      else { x = F.x0 + rnd() * fw; y = F.y0 + rnd() * fh; }
      if (x < F.x0 || x > F.x1 || y < F.y0 || y > F.y1 || pointInPoly(x, y, D.mainland)) continue;
      const outer = (x - F.x0) / fw > 0.78;
      if (outer && rnd() < 0.55) continue;
      const r = (1.1 + Math.pow(rnd(), 2.6) * (outer ? 4.5 : 6.5)) * D.islandK;
      if (out.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 1.6)) continue;
      out.push({ x, y, r });
    }
  }
  for (const E of D.extraIslands) for (let i = 0; i < E.n; i++) {
    const x = E.x0 + rnd() * (E.x1 - E.x0), y = E.y0 + rnd() * (E.y1 - E.y0);
    if (!pointInPoly(x, y, D.mainland)) out.push({ x, y, r: E.r0 + rnd() * (E.r1 - E.r0) });
  }
  return out;
}

/** 大陆多边形扫描线填充（宏观格，1 = 陆地），再挖掉湖 */
function rasterMainland(map: MapId): Uint8Array {
  const D = mapShoreData(map), W = D.W, H = D.H, out = new Uint8Array(W * H), poly: P[] = D.mainland;
  if (poly.length > 2) {
    const xs: number[] = [];
    for (let j = 0; j < H; j++) {
      const yc = j + 0.5; xs.length = 0;
      for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
        const a = poly[i], b = poly[k];
        if ((a[1] <= yc) !== (b[1] <= yc)) xs.push(a[0] + (yc - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort((p, q) => p - q);
      for (let n = 0; n + 1 < xs.length; n += 2) {
        const i0 = Math.max(0, Math.ceil(xs[n] - 0.5)), i1 = Math.min(W - 1, Math.floor(xs[n + 1] - 0.5));
        for (let i = i0; i <= i1; i++) out[j * W + i] = 1;
      }
    }
  }
  for (const l of D.lakes) {
    const r = l.r, x0 = Math.max(0, Math.floor(l.c[0] - r)), x1 = Math.min(W - 1, Math.ceil(l.c[0] + r)), y0 = Math.max(0, Math.floor(l.c[1] - r)), y1 = Math.min(H - 1, Math.ceil(l.c[1] + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (Math.hypot(x + 0.5 - l.c[0], y + 0.5 - l.c[1]) < r) out[y * W + x] = 0;
  }
  return out;
}

/** 一维平方距离变换（Felzenszwalb）：f 进、d 出 */
function edt1(f: Float32Array, n: number, d: Float32Array, v: Int32Array, z: Float32Array) {
  let k = 0; v[0] = 0; z[0] = -1e20; z[1] = 1e20;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const t = q - v[k]; d[q] = t * t + f[v[k]]; }
}

const BIG = 1e12;

export class ShoreField {
  readonly G = FIELD_G;
  x0 = 0; y0 = 0; nx = 0; ny = 0;
  /** 每个网格点离最近的陆地点多远（单位：格）；算好之前是 null */
  private dist: Float32Array | null = null;
  /** 各图在大陆坐标里的矩形 */
  readonly rects: Rect[] = [];
  /** 可飞越的海峡（大陆坐标的矩形）：海峡里没有「绝域」，外圈那片没有对岸的海才有 */
  channels: { x0: number; y0: number; x1: number; y1: number }[] = [];
  private job: Generator<void, void, void> | null = null;
  ready = false;
  /** 计算一共花了多少毫秒（测试和性能页看） */
  costMs = 0;

  /**
   * 收官 B4：maps 不给＝人界那三张图（有交界、图外铺海）；给一张别界的图（'realm-N'）就只算这一张：
   * 别界的图就是它在虚空里的外接矩形，大陆以外到图边是一整圈「海」（瀚漠是流沙、炎墟是熔岩……），险地就在这一圈里。
   * capIn：图内的海封不封顶（人界封顶，见 CAP_IN；别界不封，险地本来就在图内）。
   */
  constructor(maps: MapId[] = FIELD_MAPS, readonly capIn = true) {
    this.rects.push(...maps.map(rectOf));
    const M = capIn ? 64000 : 4000;
    this.x0 = Math.floor((Math.min(...this.rects.map((r) => r.x0)) - M) / FIELD_G) * FIELD_G;
    this.y0 = Math.floor((Math.min(...this.rects.map((r) => r.y0)) - M) / FIELD_G) * FIELD_G;
    this.nx = Math.ceil((Math.max(...this.rects.map((r) => r.x1)) + M - this.x0) / FIELD_G) + 1;
    this.ny = Math.ceil((Math.max(...this.rects.map((r) => r.y1)) + M - this.y0) / FIELD_G) + 1;
    // 海峡：交界标着 sea 的那几条，取两张图之间那一段
    for (const m of FIELD_MAPS) for (const S of MAP_SEAMS[m] ?? []) {
      if (!S.sea || m > S.to) continue;
      const a = this.rects.find((r) => r.map === m), b = this.rects.find((r) => r.map === S.to);
      if (!a || !b) continue;
      if (S.side === 'e' || S.side === 'w') { const l = S.side === 'e' ? a : b, r = S.side === 'e' ? b : a; this.channels.push({ x0: l.x1, x1: r.x0, y0: Math.max(a.y0, b.y0), y1: Math.min(a.y1, b.y1) }); }
      else { const t = S.side === 's' ? a : b, u = S.side === 's' ? b : a; this.channels.push({ y0: t.y1, y1: u.y0, x0: Math.max(a.x0, b.x0), x1: Math.min(a.x1, b.x1) }); }
    }
  }

  /** 分片计算：最多花 budgetMs 毫秒；算完返回 true */
  step(budgetMs: number): boolean {
    if (this.ready) return true;
    const t0 = performance.now();
    this.job ??= this.build();
    while (performance.now() - t0 < budgetMs) { if (this.job.next().done) { this.ready = true; this.job = null; break; } }
    this.costMs += performance.now() - t0;
    return this.ready;
  }
  /** 一口气算完（测试、读档时人已经在海上） */
  ensure(): void { while (!this.step(1000)) { /* */ } }

  private *build(): Generator<void, void, void> {
    const { nx, ny, x0, y0 } = this, G = FIELD_G, N = nx * ny;
    const land = new Uint8Array(N);
    // 1. 各图图内：照地形的做法把大陆多边形扭一扭（同样的噪声），岛按半径盖章
    for (const R of this.rects) {
      const D = mapShoreData(R.map), W = D.W, H = D.H, f = mapFrame(R.map);
      const raster = rasterMainland(R.map); yield;
      const i0 = Math.max(0, Math.ceil((R.x0 - x0) / G)), i1 = Math.min(nx - 1, Math.floor((R.x1 - x0) / G));
      const j0 = Math.max(0, Math.ceil((R.y0 - y0) / G)), j1 = Math.min(ny - 1, Math.floor((R.y1 - y0) / G));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = (x0 + i * G + f.dx) / WORLD_SCALE, y = (y0 + j * G + f.dy) / WORLD_SCALE;
          const wx = (fbm(x * 0.022, y * 0.022, 3, 11) - 0.5) * 16, wy = (fbm(x * 0.022, y * 0.022, 3, 29) - 0.5) * 16;
          const bx = (fbm(x * 0.008, y * 0.008, 3, 53) - 0.5) * 70 + (fbm(x * 0.04, y * 0.04, 3, 71) - 0.5) * 26;
          const by = (fbm(x * 0.008, y * 0.008, 3, 59) - 0.5) * 70 + (fbm(x * 0.04, y * 0.04, 3, 73) - 0.5) * 26;
          const sx = Math.min(W - 1, Math.max(0, Math.floor(x + wx + bx))), sy = Math.min(H - 1, Math.max(0, Math.floor(y + wy + by)));
          if (raster[sy * W + sx]) land[j * nx + i] = 1;
        }
        if ((j & 7) === 7) yield;
      }
      for (const is of islandsOf(R.map)) this.stamp(land, is.x * WORLD_SCALE - f.dx, is.y * WORLD_SCALE - f.dy, is.r * WORLD_SCALE * 0.9);
      yield;
    }
    // 2. 图外：两张图之间陆路相连的交界（天穹草原），在两条图边围成的梯形里、草原那一边算陆地
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const cx = x0 + i * G, cy = y0 + j * G;
        if (land[j * nx + i] || this.rects.some((r) => cx >= r.x0 && cx <= r.x1 && cy >= r.y0 && cy <= r.y1)) continue;
        if (this.inLandSeam(cx, cy) && outlandAt('land', cx, cy) > 0.5) land[j * nx + i] = 1;
      }
      if ((j & 31) === 31) yield;
    }
    // 3. 距离变换（先逐列、再逐行）
    const f = new Float32Array(N);
    for (let i = 0; i < N; i++) f[i] = land[i] ? 0 : BIG;
    const n = Math.max(nx, ny), col = new Float32Array(n), out = new Float32Array(n), v = new Int32Array(n), z = new Float32Array(n + 1);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) col[j] = f[j * nx + i];
      edt1(col, ny, out, v, z);
      for (let j = 0; j < ny; j++) f[j * nx + i] = out[j];
      if ((i & 63) === 63) yield;
    }
    for (let j = 0; j < ny; j++) {
      const row = f.subarray(j * nx, j * nx + nx);
      col.set(row); edt1(col, nx, out, v, z);
      for (let i = 0; i < nx; i++) row[i] = Math.sqrt(out[i]);
      if ((j & 63) === 63) yield;
    }
    this.dist = f;
  }
  /** 一座岛：半径以内的网格点都算陆地；再小也至少盖住最近的那一点 */
  private stamp(land: Uint8Array, cx: number, cy: number, r: number) {
    const G = FIELD_G, fi = (cx - this.x0) / G, fj = (cy - this.y0) / G, rr = r / G;
    const i0 = Math.max(0, Math.floor(fi - rr)), i1 = Math.min(this.nx - 1, Math.ceil(fi + rr)), j0 = Math.max(0, Math.floor(fj - rr)), j1 = Math.min(this.ny - 1, Math.ceil(fj + rr));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (Math.hypot(i - fi, j - fj) <= rr) land[j * this.nx + i] = 1;
    const ni = Math.round(fi), nj = Math.round(fj);
    if (ni >= 0 && nj >= 0 && ni < this.nx && nj < this.ny) land[nj * this.nx + ni] = 1;
  }
  /** 是否在陆路交界（两条图边围成的梯形）里 */
  private inLandSeam(cx: number, cy: number): boolean {
    for (const m of FIELD_MAPS) for (const S of MAP_SEAMS[m] ?? []) {
      if (S.sea) continue;
      const a = this.rects.find((r) => r.map === m), b = this.rects.find((r) => r.map === S.to);
      if (!a || !b) continue;
      if (S.side === 'n' || S.side === 's') {
        const ya = S.side === 'n' ? a.y0 : a.y1, yb = S.side === 'n' ? b.y1 : b.y0;
        const u = (cy - ya) / (yb - ya); if (u < 0 || u > 1) continue;
        if (cx >= a.x0 + (b.x0 - a.x0) * u && cx <= a.x1 + (b.x1 - a.x1) * u) return true;
      } else {
        const xa = S.side === 'w' ? a.x0 : a.x1, xb = S.side === 'w' ? b.x1 : b.x0;
        const u = (cx - xa) / (xb - xa); if (u < 0 || u > 1) continue;
        if (cy >= a.y0 + (b.y0 - a.y0) * u && cy <= a.y1 + (b.y1 - a.y1) * u) return true;
      }
    }
    return false;
  }

  /** 离图（任何一张图的矩形）多远；在图内为 0 */
  outsideRect(cx: number, cy: number): number {
    let best = Infinity;
    for (const r of this.rects) {
      const dx = Math.max(r.x0 - cx, 0, cx - r.x1), dy = Math.max(r.y0 - cy, 0, cy - r.y1), d = Math.hypot(dx, dy);
      if (d < best) best = d;
    }
    return best;
  }
  /** 离海峡多远（在海峡里为 0） */
  outsideChannel(cx: number, cy: number): number {
    let best = Infinity;
    for (const r of this.channels) {
      const dx = Math.max(r.x0 - cx, 0, cx - r.x1), dy = Math.max(r.y0 - cy, 0, cy - r.y1), d = Math.hypot(dx, dy);
      if (d < best) best = d;
    }
    return best;
  }
  /** 离大陆（三张图的陆地、图内的岛、草原）多远：网格上双线性取 */
  private mainDepth(cx: number, cy: number): number {
    const D = this.dist;
    if (!D) return CAP_IN + this.outsideRect(cx, cy);   // 还没算好：按离图边的距离估一个，算好后由调用方慢慢过渡过去
    const fx = Math.min(this.nx - 1.001, Math.max(0, (cx - this.x0) / FIELD_G)), fy = Math.min(this.ny - 1.001, Math.max(0, (cy - this.y0) / FIELD_G));
    const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * this.nx + i, nx = this.nx;
    const a = D[k], b = D[k + 1], c = D[k + nx], d = D[k + nx + 1];
    const g = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    // 越出网格（不会到那么远，防御）：按越出的距离接着长
    const ox = Math.max(0, -((cx - this.x0) / FIELD_G), (cx - this.x0) / FIELD_G - (this.nx - 1)), oy = Math.max(0, -((cy - this.y0) / FIELD_G), (cy - this.y0) / FIELD_G - (this.ny - 1));
    return Math.max(0, g + Math.hypot(ox, oy) - 0.5) * FIELD_G;
  }
  /** 离有名的海岛多远（已乘 ISLE_K） */
  isleDepth(cx: number, cy: number): number {
    if (!this.capIn) return Infinity;   // 别界没有「有名的海岛」
    let best = Infinity;
    for (const s of SEA_ISLES) { const d = Math.max(0, Math.hypot(cx - s.x, cy - s.y) - s.r * 0.85); if (d < best) best = d; }
    return best * ISLE_K;
  }
  /** 离岸多远（大陆坐标，世界单位）：大陆、海岛、图内封顶三者取小 */
  depthAt(cx: number, cy: number): number {
    if (!this.capIn) return this.mainDepth(cx, cy);
    return Math.min(this.mainDepth(cx, cy), this.isleDepth(cx, cy), CAP_IN + this.outsideRect(cx, cy));
  }
  /** 收官 B4：离陆地多远、不封顶也不算海岛（本界的小险地——南荒的腐骨瘴泽——按湖心离岸多远分带） */
  landDepth(cx: number, cy: number): number { return this.mainDepth(cx, cy); }
  /** 离真正的岸（大陆、岛）多远，不封顶：罗盘报「离岸多远」用 */
  trueDepthAt(cx: number, cy: number): number { return Math.min(this.mainDepth(cx, cy), this.isleDepth(cx, cy) / ISLE_K); }
  /** 往深处的方向（单位向量；在岸上或平地上是 0） */
  gradAt(cx: number, cy: number, out: { x: number; y: number }, h = FIELD_G * 0.75): { x: number; y: number } {
    const gx = this.depthAt(cx + h, cy) - this.depthAt(cx - h, cy), gy = this.depthAt(cx, cy + h) - this.depthAt(cx, cy - h), l = Math.hypot(gx, gy);
    if (l < 1e-6) { out.x = 0; out.y = 0; } else { out.x = gx / l; out.y = gy / l; }
    return out;
  }
}

/** 全局一份（三张图共用） */
export const shoreField = new ShoreField();

/** 收官 B4：别界的图各一份（按需现算，留最近的几份） */
const realmFields = new Map<MapId, ShoreField>();
export function realmField(map: MapId): ShoreField {
  let f = realmFields.get(map);
  if (!f) {
    f = new ShoreField([map], false); realmFields.set(map, f);
    if (realmFields.size > 4) realmFields.delete(realmFields.keys().next().value!);
  }
  return f;
}
