// 诸界：虚空里各个世界摆在哪儿、长什么样。
//
// 虚空是一张平面（虚空坐标，x 向东、y 向南），修士在这张平面上飞；各界悬在平面下方不同的深处，
// 都是「一块平坦的大陆坐在岩石底座上，上面罩一层穹顶界壁」。从虚空看，一界被缩成界内的四十分之一
// （VOID_SCALE）：人界三张图连同四周的海，在虚空里是两万来宽的一块浮陆。
//
// 人界在虚空原点，里面三张图的相对位置：南荒在南，中州隔着天穹草原在北（与交界地带的平移一致），沧溟海隔着无边海在东。
// 其余三千界按「星域」成团分布（布局办法取自重构版 universe-layout：星域内按葵花籽螺线排开，星域之间隔着大片空无），
// 距离按 B 版的遁速重新定过：星域内相邻两界御剑约半分钟，星域之间要靠遁空梭。
import { MAP_FRAME, SEAM_DEPTH, SEA_DEPTH, WORLD_SCALE, MAP_IDS, mapSize, mapRanges, setMapSource, type MapId, type MapData, type P } from './world';

/** 虚空里的一个单位 = 界内的多少单位 */
export const VOID_SCALE = 40;
export const REALM_TOTAL = 3000;

export type RealmKind = 'human' | 'archipelago' | 'desert' | 'frost' | 'spiritwood' | 'ember' | 'nether';
export const REALM_KIND_NAME: Record<RealmKind, string> = { human: '人界', archipelago: '沧海界', desert: '瀚漠界', frost: '寒渊界', spiritwood: '灵木界', ember: '炎墟界', nether: '幽冥界' };
/** 各类世界的界壁颜色（穹顶的光） */
export const REALM_KIND_COLOR: Record<RealmKind, [number, number, number]> = {
  human: [1.0, 0.86, 0.52], archipelago: [0.42, 0.82, 1.0], desert: [1.0, 0.72, 0.36], frost: [0.72, 0.9, 1.0],
  spiritwood: [0.46, 1.0, 0.66], ember: [1.0, 0.42, 0.32], nether: [0.74, 0.5, 1.0],
};

export interface Realm {
  /** 'human' 或 'realm-N' */
  id: string; index: number; name: string; kind: RealmKind;
  /** 所在的星域（人界没有） */
  region: string;
  /** 虚空坐标里的中心、东西向 / 南北向的半径 */
  x: number; y: number; rx: number; ry: number;
  /** 大陆表面在飞行平面下方多深（正数）；穹顶的高度 */
  depth: number; dome: number;
  color: [number, number, number];
  seed: number;
}

// ---------------------------------------------------------------- 人界
interface Rect { x: number; y: number; w: number; h: number }
const size = (m: MapId) => { const s = mapSize(m); return { w: s.W * WORLD_SCALE, h: s.H * WORLD_SCALE }; };
const TN = size('tiannan'), DJ = size('dajin'), LX = size('luanxing');
/** 中州的坐标比南荒的多出这么多（纵向）：与交界地带的平移是同一个数 */
const DJ_SHIFT = MAP_FRAME.dajin!.dy;
/** 无边海有多宽：南荒东缘到沧溟海西缘 */
/** 人界的「大陆坐标」：就是南荒的坐标。三张图各占的矩形 */
export const HOME_RECTS: Record<MapId, Rect> = {
  tiannan: { x: 0, y: 0, w: TN.w, h: TN.h },
  dajin: { x: -MAP_FRAME.dajin!.dx, y: -DJ_SHIFT, w: DJ.w, h: DJ.h },
  luanxing: { x: -MAP_FRAME.luanxing!.dx, y: -MAP_FRAME.luanxing!.dy, w: LX.w, h: LX.h },
};
/** 浮陆的边比三张图再往外多出这么多（海） */
const HOME_MARGIN = 60000;
const HB = (() => {
  const r = Object.values(HOME_RECTS);
  const x0 = Math.min(...r.map((q) => q.x)) - HOME_MARGIN, x1 = Math.max(...r.map((q) => q.x + q.w)) + HOME_MARGIN;
  const y0 = Math.min(...r.map((q) => q.y)) - HOME_MARGIN, y1 = Math.max(...r.map((q) => q.y + q.h)) + HOME_MARGIN;
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
})();
/** 人界浮陆在大陆坐标里的范围（画俯瞰图用） */
export const HOME_BOUNDS = HB;

export const HOME: Realm = {
  id: 'human', index: 0, name: '人界', kind: 'human', region: '',
  x: 0, y: 0, rx: (HB.x1 - HB.x0) / 2 / VOID_SCALE, ry: (HB.y1 - HB.y0) / 2 / VOID_SCALE,
  depth: 2600, dome: 2100, color: REALM_KIND_COLOR.human, seed: 0x48554d,
};

/** 某张图里的一点 → 人界的大陆坐标 */
export function mapToHome(map: MapId, x: number, y: number) { const r = HOME_RECTS[map]; return { x: r.x + x, y: r.y + y }; }
/** 某张图里的一点 → 虚空坐标（正上方） */
export function mapToVoid(map: MapId, x: number, y: number) { const h = mapToHome(map, x, y); return { x: (h.x - HB.cx) / VOID_SCALE, y: (h.y - HB.cy) / VOID_SCALE }; }
/**
 * 虚空里的一点 → 正下方是人界的哪张图、图里的哪儿。落在海上或图外时，取最近的能落脚的地方。
 * 南荒与中州之间的天穹草原以中线为界，南半归南荒、北半归中州（和飞越交界时的换图位置一致）。
 */
export function voidToMap(vx: number, vy: number): { map: MapId; x: number; y: number } {
  const fx = vx * VOID_SCALE + HB.cx, fy = vy * VOID_SCALE + HB.cy, m = 600, half = SEAM_DEPTH / 2;
  // 草原里两张图都有的那一段经度（中州比南荒窄，而且错开摆）
  const sx0 = Math.max(0, HOME_RECTS.dajin.x), sx1 = Math.min(TN.w, HOME_RECTS.dajin.x + DJ.w);
  const zones: { map: MapId; x0: number; x1: number; y0: number; y1: number }[] = [
    { map: 'tiannan', x0: m, x1: TN.w - m, y0: m, y1: TN.h - m },
    { map: 'tiannan', x0: sx0 + m, x1: sx1 - m, y0: -half + 2000, y1: m },
    { map: 'dajin', x0: HOME_RECTS.dajin.x + m, x1: HOME_RECTS.dajin.x + DJ.w - m, y0: -DJ_SHIFT + m, y1: -DJ_SHIFT + DJ.h - m },
    { map: 'dajin', x0: sx0 + m, x1: sx1 - m, y0: -DJ_SHIFT + DJ.h - m, y1: -half - 2000 },
    { map: 'luanxing', x0: HOME_RECTS.luanxing.x + m, x1: HOME_RECTS.luanxing.x + LX.w - m, y0: HOME_RECTS.luanxing.y + m, y1: HOME_RECTS.luanxing.y + LX.h - m },
    // 无边海同样以中线为界：西半归南荒、东半归沧溟海；只取两张图都有的那一段纬度
    { map: 'tiannan', x0: TN.w - m, x1: TN.w + SEA_DEPTH / 2 - 2000, y0: Math.max(0, HOME_RECTS.luanxing.y) + m, y1: Math.min(TN.h, HOME_RECTS.luanxing.y + LX.h) - m },
    { map: 'luanxing', x0: TN.w + SEA_DEPTH / 2 + 2000, x1: HOME_RECTS.luanxing.x + m, y0: Math.max(0, HOME_RECTS.luanxing.y) + m, y1: Math.min(TN.h, HOME_RECTS.luanxing.y + LX.h) - m },
  ];
  let best = zones[0], bx = 0, by = 0, bd = Infinity;
  for (const z of zones) {
    const cx = Math.max(z.x0, Math.min(z.x1, fx)), cy = Math.max(z.y0, Math.min(z.y1, fy)), d = Math.hypot(cx - fx, cy - fy);
    if (d < bd) { bd = d; best = z; bx = cx; by = cy; }
  }
  const r = HOME_RECTS[best.map];
  return { map: best.map, x: bx - r.x, y: by - r.y };
}

// ---------------------------------------------------------------- 三千界
const SPIRAL_STEP = 17000, WORLD_HALF = 6000, FIRST_GAP = 12000;
export const STAR_REGION_GAP = 250000;
const GOLDEN = 2.399963229728653;
const regionFirst = ['玄', '苍', '青', '赤', '紫', '太', '九', '天', '幽', '北', '南', '东', '西', '星', '云', '明'];
const regionLast = ['霄', '冥', '渊', '虚', '穹', '衡', '曜', '垣', '溟', '极', '辰', '阙', '汉', '岳', '野', '玑'];
const worldFirst = ['苍', '玄', '云', '寒', '青', '赤', '灵', '岚', '沧', '荒', '瀚', '星', '翠', '霜', '碧', '金'];
const worldLast = ['澜', '沙', '羽', '霄', '渊', '漠', '岳', '泽', '海', '霞', '川', '岚', '林', '原', '泉', '峰'];
const KINDS: RealmKind[] = ['archipelago', 'desert', 'frost', 'spiritwood', 'ember', 'nether'];

function mix(value: number): number {
  value = Math.imul(value ^ value >>> 16, 0x7feb352d);
  value = Math.imul(value ^ value >>> 15, 0x846ca68b);
  return (value ^ value >>> 16) >>> 0;
}
export interface StarRegion { index: number; name: string; x: number; y: number; radius: number; first: number; count: number }
function spiral(k: number, rotation: number) { const r = SPIRAL_STEP * Math.sqrt(k + 0.5), a = k * GOLDEN + rotation; return { x: Math.cos(a) * r, y: Math.sin(a) * r }; }

let regionCache: StarRegion[] | null = null;
/** 所有星域。第一个紧挨在人界南边，其余绕着人界一圈圈往外排，彼此之间至少隔着 STAR_REGION_GAP */
export function starRegions(): readonly StarRegion[] {
  if (regionCache) return regionCache;
  const regions: StarRegion[] = [], homeR = Math.hypot(HOME.rx, HOME.ry);
  for (let index = 0, first = 1; first <= REALM_TOTAL; index++) {
    const seed = mix(index + 0x5354);
    const count = Math.min(REALM_TOTAL - first + 1, 30 + seed % 91), radius = SPIRAL_STEP * Math.sqrt(count + 0.5) + WORLD_HALF;
    let x = 0, y = HOME.ry + FIRST_GAP + radius;
    if (index > 0) {
      const angle = index * GOLDEN;
      for (let distance = homeR + FIRST_GAP + radius; ; distance += 40000) {
        x = Math.cos(angle) * distance; y = Math.sin(angle) * distance;
        if (regions.every((o) => Math.hypot(o.x - x, o.y - y) >= o.radius + radius + STAR_REGION_GAP)) break;
      }
    }
    regions.push({ index, name: regionFirst[seed % 16] + regionLast[(seed >>> 8) % 16] + '域', x, y, radius, first, count });
    first += count;
  }
  return regionCache = regions;
}

const realmCache = new Map<number, Realm>();
/** 第 index 界（1..REALM_TOTAL）。位置、名字、样貌都由序号定死，不用存 */
export function realmAt(index: number): Realm {
  let r = realmCache.get(index);
  if (r) return r;
  const regions = starRegions();
  let lo = 0, hi = regions.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (regions[mid].first <= index) lo = mid; else hi = mid - 1; }
  const region = regions[lo], seed = mix(index + 0x4c41), o = spiral(index - region.first, region.index * 1.7);
  const kind = KINDS[seed % KINDS.length], f = (n: number) => ((seed >>> n) & 255) / 255;
  const rx = 2800 + f(8) * 2800, tint = REALM_KIND_COLOR[kind], dome = rx * (0.3 + f(24) * 0.14);
  r = {
    id: 'realm-' + index, index, kind, region: region.name,
    name: `${worldFirst[(seed >>> 4) % 16]}${worldLast[(seed >>> 12) % 16]}界`,
    x: Math.round(region.x + o.x), y: Math.round(region.y + o.y), rx, ry: rx * (0.72 + f(16) * 0.28),
    depth: dome + 500 + f(20) * 2200, dome,   // 穹顶的顶点总在飞行平面之下
    color: [tint[0] * (0.88 + f(3) * 0.12), tint[1] * (0.88 + f(11) * 0.12), tint[2] * (0.88 + f(19) * 0.12)],
    seed,
  };
  realmCache.set(index, r);
  return r;
}

/** 虚空里某点周围 radius 以内的各界（含人界），由近到远 */
export function realmsNear(x: number, y: number, radius: number): Realm[] {
  const out: Realm[] = [];
  if (Math.hypot(x, y) <= radius + Math.max(HOME.rx, HOME.ry)) out.push(HOME);
  for (const g of starRegions()) {
    if (Math.hypot(g.x - x, g.y - y) > g.radius + radius) continue;
    for (let k = 0; k < g.count; k++) {
      const o = spiral(k, g.index * 1.7);
      if (Math.hypot(g.x + o.x - x, g.y + o.y - y) <= radius + WORLD_HALF) out.push(realmAt(g.first + k));
    }
  }
  return out.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
}

/** 这一点是否在某界的正上方（穹顶之内）：k 是把半径收紧的比例 */
export function overRealm(r: Realm, x: number, y: number, k = 0.94): boolean {
  const dx = (x - r.x) / (r.rx * k), dy = (y - r.y) / (r.ry * k);
  if (r.kind === 'human') return Math.pow(Math.abs(dx), 6) + Math.pow(Math.abs(dy), 6) <= 1;   // 人界是圆角的方形（见 realmOutline）
  return dx * dx + dy * dy <= 1;
}
/** 离某界的边还有多远（虚空单位；在正上方时为 0） */
export function realmDistance(r: Realm, x: number, y: number): number {
  if (overRealm(r, x, y, 1)) return 0;
  const dx = x - r.x, dy = y - r.y, d = Math.hypot(dx, dy) || 1;
  return Math.max(0, d - Math.hypot(dx / d * r.rx, dy / d * r.ry));
}
/** 距离换成「里」给人看（界内一里按五百单位算，虚空里的一个单位是界内的 VOID_SCALE 倍） */
export function voidLi(d: number): string {
  const li = d * VOID_SCALE / 500;
  return li >= 10000 ? (li / 10000).toFixed(li >= 100000 ? 0 : 1) + ' 万里' : Math.max(1, Math.round(li / 10) * 10) + ' 里';
}

/** 浮陆的轮廓：方位角 theta 处的边离中心有多远（rx / ry 的倍数）。人界是圆角的方形，别界是有几处起伏的椭圆 */
export function realmOutline(r: Realm, theta: number): number {
  if (r.kind === 'human') return Math.pow(Math.pow(Math.abs(Math.cos(theta)), 6) + Math.pow(Math.abs(Math.sin(theta)), 6), -1 / 6);
  const a = (r.seed & 255) / 255 * 6.283, b = ((r.seed >>> 8) & 255) / 255 * 6.283, c = ((r.seed >>> 16) & 255) / 255 * 6.283;
  return 1 + 0.09 * Math.sin(3 * theta + a) + 0.055 * Math.sin(5 * theta + b) + 0.035 * Math.sin(9 * theta + c);
}

// ---------------------------------------------------------------- 别界的地图：进得去的山河
// 一界在虚空里的外接矩形就是它的地图：虚空里的一个单位是界内的 VOID_SCALE 个单位，所以半径三四千的一界，
// 地图有二三十万宽，和南荒差不多大。山河按种子现造（海岸线就是浮陆的轮廓往里收一圈、再揉皱），
// 气候按样貌定大势（寒渊冷、瀚漠旱、灵木多林、沧海是星罗棋布的岛、炎墟是干裂的山地、幽冥是寒荒），界内再分区：见下面「界内的气候分区」。
// 眼下只有地形，没有地点和人；妖兽按通用的规则刷。
/** 地图的宏观尺寸（宏观单位） */
function realmMapSize(r: Realm) { return { W: Math.round(r.rx * 2 * VOID_SCALE / WORLD_SCALE), H: Math.round(r.ry * 2 * VOID_SCALE / WORLD_SCALE) }; }
function realmMapData(r: Realm): Omit<MapData, 'id' | 'regions' | 'labels' | 'locations'> {
  const { W, H } = realmMapSize(r), cx = W / 2, cy = H / 2;
  let seed = r.seed || 1;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const all: P[] = [[-20, -20], [W + 20, -20], [W + 20, H + 20], [-20, H + 20]];
  const sea = r.kind === 'archipelago';
  // 海岸线：浮陆的轮廓往里收，再叠几道起伏
  const N = 96, wob = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28], mainland: P[] = [];
  const edge = (th: number) => realmOutline(r, th) * (0.8 + 0.045 * Math.sin(7 * th + wob[0]) + 0.03 * Math.sin(13 * th + wob[1]) + 0.02 * Math.sin(23 * th + wob[2]));
  if (!sea) for (let i = 0; i < N; i++) { const th = i / N * Math.PI * 2, k = edge(th); mainland.push([cx + Math.cos(th) * cx * k, cy + Math.sin(th) * cy * k]); }
  // 陆地里的一点（极坐标随机取，离岸留些余量）
  const inland = (lim = 0.78): P => { const th = rnd() * Math.PI * 2, k = Math.sqrt(rnd()) * edge(th) * lim; return [cx + Math.cos(th) * cx * k, cy + Math.sin(th) * cy * k]; };
  const ranges: MapData['ranges'] = [], rivers: MapData['rivers'] = [], lakes: MapData['lakes'] = [];
  if (!sea) {
    const nr = r.kind === 'ember' ? 7 : r.kind === 'desert' ? 3 : 5;
    for (let i = 0; i < nr; i++) {
      const a = inland(0.7), dir = rnd() * Math.PI * 2, len = W * (0.12 + rnd() * 0.22), pts: P[] = [a];
      for (let k = 1; k <= 3; k++) pts.push([a[0] + Math.cos(dir + (rnd() - 0.5) * 0.7) * len * k / 3, a[1] + Math.sin(dir + (rnd() - 0.5) * 0.7) * len * k / 3]);
      ranges.push({ pts, w: 12 + rnd() * 10, h: 0.6 + rnd() * 0.4 });
    }
    const nv = r.kind === 'desert' || r.kind === 'ember' ? 1 : 3 + Math.floor(rnd() * 2);
    for (let i = 0; i < nv; i++) {
      // 河：从内陆一点蜿蜒流到海岸
      const a = inland(0.45), th = Math.atan2((a[1] - cy) / cy, (a[0] - cx) / cx) + (rnd() - 0.5) * 1.2, k = edge(th) * 1.02, end: P = [cx + Math.cos(th) * cx * k, cy + Math.sin(th) * cy * k], pts: P[] = [];
      for (let j = 0; j <= 6; j++) { const t = j / 6, w = Math.sin(t * Math.PI) * W * 0.035; pts.push([a[0] + (end[0] - a[0]) * t + (rnd() - 0.5) * w, a[1] + (end[1] - a[1]) * t + (rnd() - 0.5) * w]); }
      rivers.push({ pts, w: 0.9 + rnd() * 0.7 });
    }
    for (let i = 0, n = r.kind === 'desert' ? 1 : 2 + Math.floor(rnd() * 2); i < n; i++) lakes.push({ c: inland(0.6), r: 4 + rnd() * 7 });
  }
  const K = r.kind;
  // 界内的气候分区：每一界有一个「底色」（全境都有的最低程度），再叠几块更重的区域——地形那边对各区取最大值、把边缘揉皱抹匀。
  // 这样一界之内也有冷暖干湿的差别：瀚漠里有几片不那么旱的绿洲地带，寒渊向阳的一侧是泰加林而不是冰原，灵木的高纬是寒林、背风处是疏林草地。
  // 三个量互相独立地分区（干旱、寒冷、林木），叠出来的组合比按样貌一刀切多得多。
  type Zone = { pts: P[]; v: number };
  const whole = (v: number): Zone[] => (v > 0 ? [{ pts: all, v }] : []);
  /** 一块不规则的区域：中心、两个半径（宏观单位） */
  const blob = (c: P, rx: number, ry: number, v: number): Zone => {
    const pts: P[] = [], n = 11, ph = rnd() * 6.28;
    for (let i = 0; i < n; i++) { const th = i / n * Math.PI * 2, k = 0.78 + 0.34 * rnd() + 0.1 * Math.sin(th * 3 + ph); pts.push([c[0] + Math.cos(th) * rx * k, c[1] + Math.sin(th) * ry * k]); }
    return { pts, v };
  };
  /** 横贯东西的一条纬度带：y0..y1 是占全图高度的比例，边缘略斜 */
  const band = (y0: number, y1: number, v: number): Zone => {
    const t = (rnd() - 0.5) * 0.12;
    return { pts: [[-20, H * (y0 - t)], [W + 20, H * (y0 + t)], [W + 20, H * (y1 + t)], [-20, H * (y1 - t)]], v };
  };
  const blobs = (n: number, size: number, v: number, lim = 0.7): Zone[] => Array.from({ length: n }, () => blob(inland(lim), W * size * (0.7 + rnd() * 0.6), H * size * (0.7 + rnd() * 0.6), v));
  // 这一界冷的那一头在北还是在南（各界不一样）
  const polar = rnd() < 0.5 ? band(-0.1, 0.24 + rnd() * 0.08, 1) : band(0.76 - rnd() * 0.08, 1.1, 1);
  const pole = (v: number): Zone => ({ pts: polar.pts, v });
  let arid: Zone[], cold: Zone[], forest: Zone[];
  if (K === 'desert') {          // 瀚漠：大片沙海，沙海之间是稍润的草滩和绿洲；极地一侧是寒漠
    arid = [...whole(0.4), ...blobs(6, 0.25, 1, 0.9)]; cold = [pole(0.5)]; forest = blobs(4, 0.08, 0.9, 0.6);
  } else if (K === 'ember') {    // 炎墟：焦土为主，几处火山灰肥出来的谷地有林；没有冷的地方
    arid = [...whole(0.45), ...blobs(6, 0.25, 0.95, 0.9)]; cold = []; forest = blobs(3, 0.09, 0.85, 0.55);
  } else if (K === 'frost') {    // 寒渊：冰原与冻土，背着极地的那一侧是泰加林
    cold = [...whole(0.36), pole(1), ...blobs(5, 0.24, 0.95, 0.85)]; arid = blobs(1, 0.14, 0.4, 0.6); forest = [...whole(0.12), ...blobs(4, 0.14, 0.6, 0.7)];
  } else if (K === 'nether') {   // 幽冥：寒荒，极地一侧冻死，另有成片的枯林与瘴泽
    cold = [...whole(0.36), pole(0.95), ...blobs(3, 0.2, 0.8, 0.8)]; arid = [...whole(0.3), ...blobs(3, 0.18, 0.7, 0.75)]; forest = blobs(4, 0.13, 0.75, 0.7);
  } else if (K === 'spiritwood') { // 灵木：遍地密林，高纬是寒林，背风处有疏林草地（稍旱）
    forest = [...whole(0.55), ...blobs(5, 0.2, 0.95, 0.8)]; cold = [pole(0.6)]; arid = blobs(2, 0.14, 0.5, 0.65);
  } else {                        // 沧海：星罗棋布的岛，暖的一头林密，冷的一头是寒岛
    forest = [...whole(0.4), ...blobs(4, 0.2, 0.8, 0.9)]; cold = [pole(0.7)]; arid = blobs(2, 0.12, 0.45, 0.8);
  }
  return {
    W, H, mainland, lakes, ranges, rivers, arid, cold, forest,
    islandField: sea ? { x0: W * 0.08, y0: H * 0.08, x1: W * 0.92, y1: H * 0.92, count: Math.round(W * H / 5200) } : null,
    extraIslands: sea ? [{ x0: W * 0.25, y0: H * 0.25, x1: W * 0.75, y1: H * 0.75, n: 5, r0: 14, r1: 30 }] : [],
    islandK: sea ? 1.2 : 1,
    // 从外面看是焦黑透红 / 紫灰一片的界，进去以后也该是那个颜色
    tint: K === 'ember' ? { land: [128, 84, 72], sea: [150, 58, 30], k: 0.72 } : K === 'nether' ? { land: [112, 100, 146], sea: [34, 28, 62], k: 0.7 } : K === 'frost' ? { land: [214, 226, 236], sea: [96, 130, 160], k: 0.35 } : undefined,
  };
}
/**
 * 一界的山河略图：从天外看这一界时，照它画大陆面的样子、做山体的起伏——和进去以后的山河是同一份数据。
 * 坐标都归一到大陆面的外接矩形（u 向东、v 向南，0..1）；宽度、半径以 u 方向的全宽为 1。
 * 人界只给山脉（它的大陆面贴的是三张图的俯瞰图）。
 */
export interface RealmSketch {
  mainland: P[]; lakes: { c: P; r: number }[]; rivers: { pts: P[]; w: number }[]; ranges: { pts: P[]; w: number; h: number }[];
  /** 没有大陆、满是岛（沧海界） */
  islands: boolean;
}
const sketchCache = new Map<string, RealmSketch>();
export function realmSketch(r: Realm): RealmSketch {
  let k = sketchCache.get(r.id);
  if (k) return k;
  if (r === HOME) {
    const W = HB.x1 - HB.x0, H = HB.y1 - HB.y0, ranges: RealmSketch['ranges'] = [];
    for (const m of MAP_IDS) {
      const q = HOME_RECTS[m];
      for (const g of mapRanges(m)) ranges.push({ pts: g.pts.map((t): P => [(q.x + t[0] * WORLD_SCALE - HB.x0) / W, (q.y + t[1] * WORLD_SCALE - HB.y0) / H]), w: g.w * WORLD_SCALE / W, h: g.h });
    }
    k = { mainland: [], lakes: [], rivers: [], ranges, islands: false };
  } else {
    const d = realmMapData(r), n = (t: P): P => [t[0] / d.W, t[1] / d.H];
    k = { mainland: d.mainland.map(n), lakes: d.lakes.map((l) => ({ c: n(l.c), r: l.r / d.W })), rivers: d.rivers.map((v) => ({ pts: v.pts.map(n), w: v.w / d.W })),
      ranges: d.ranges.map((g) => ({ pts: g.pts.map(n), w: g.w / d.W, h: g.h })), islands: r.kind === 'archipelago' };
  }
  sketchCache.set(r.id, k);
  return k;
}
setMapSource((id) => { const m = /^realm-(\d+)$/.exec(id); const n = m ? +m[1] : 0; if (n < 1 || n > REALM_TOTAL) return null; const r = realmAt(n); return { name: (r.region ? r.region + '·' : '') + r.name, kind: r.kind, seed: r.seed, data: realmMapData(r) }; });

/** 这张图属于哪一界 */
export function realmOfMap(map: MapId): Realm { const m = /^realm-(\d+)$/.exec(map); return m ? realmAt(+m[1]) : HOME; }
/** 图里的一点 → 虚空坐标（正上方） */
export function pointToVoid(map: MapId, x: number, y: number) {
  const r = realmOfMap(map);
  return r === HOME ? mapToVoid(map, x, y) : { x: r.x - r.rx + x / VOID_SCALE, y: r.y - r.ry + y / VOID_SCALE };
}
/** 虚空坐标里的一点 → 这张图里的坐标（pointToVoid 的反函数；可以落在图外） */
export function voidToPoint(map: MapId, vx: number, vy: number) {
  const r = realmOfMap(map);
  if (r === HOME) { const q = HOME_RECTS[map as keyof typeof HOME_RECTS]; return { x: vx * VOID_SCALE + HB.cx - q.x, y: vy * VOID_SCALE + HB.cy - q.y }; }
  return { x: (vx - (r.x - r.rx)) * VOID_SCALE, y: (vy - (r.y - r.ry)) * VOID_SCALE };
}
/** 从虚空里这一点降进这一界，会落在哪张图的哪儿（进不去则为 null）。人界落在正下方那张图上；别界的图就是它的外接矩形 */
export function landing(r: Realm, x: number, y: number): { map: MapId; x: number; y: number } | null {
  if (r === HOME) return voidToMap(x, y);
  const W = r.rx * 2 * VOID_SCALE, H = r.ry * 2 * VOID_SCALE, m = 600;
  return { map: `realm-${r.index}`, x: Math.max(m, Math.min(W - m, (x - (r.x - r.rx)) * VOID_SCALE)), y: Math.max(m, Math.min(H - m, (y - (r.y - r.ry)) * VOID_SCALE)) };
}
