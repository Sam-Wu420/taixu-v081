// P10：占山的大宗门——「规划图」。一座宗门占的那座山：台地、石阶、分峰、过道（石梁）、悬空峰、铁索桥、瀑布、山门。
// 这里只有数字（世界单位，相对地点中心；x 向东、y 向南），不碰画布、不碰地形，所以：
//   · 地表（world/surface.ts）按它整地：台地是平的，层与层之间是陡坎，石阶是可走的坡；
//   · 布局（gfx/sectLayout.ts）按它摆殿阁；
//   · 道路（world/terrain.ts）按它绕开山体、接到山门；
//   · 小地点（data/world.ts）按它让出整座山；
// 几处用的是同一份数字，不会对不上。
// 哪些宗门走新布局：默认只有青霞谷（样板）；localStorage taixu.sect=old 退回老布局，taixu.sect=all 让所有大宗门都走新布局（铺开前自测用）。

/** 台面轮廓：中心 (x, y)、宽 w、深 h 的圆角矩形（四角圆角半径 r），南沿向外鼓出 bulge（顺着山势的一道弧） */
import { SECT_LOOK, lookOf, variantPlan, placeYards, strSeed, type SectLook } from './sectVariants';
export type { SectLook };
export interface SectRect { x: number; y: number; w: number; h: number; r?: number; bulge?: number }
/** 一层台地：rise 是相对宗门基准面（山门广场）抬高多少；perch 是崖上岩峰顶的小平台（不砌挡墙，只围一圈石栏） */
export interface SectTerrace extends SectRect { id: string; rise: number; name: string; causeway?: boolean; perch?: boolean; role?: TerraceRole }
/** 台地的用处（布局按它往台上摆东西） */
export type TerraceRole = 'gate' | 'landing' | 'axis' | 'yards' | 'drill' | 'bell' | 'mid' | 'library' | 'hall2' | 'main' | 'tower' | 'top' | 'caves' | 'garden' | 'perch' | 'causeway' | 'lake';
/** 一座院子（kind 0 是空当：fill 是树 / 井 / 晾衣杆） */
export interface SectYard { x: number; y: number; w: number; d: number; kind: number; lit: boolean; roof: number; fill: string }
/** 院落间的小径 */
export interface SectPath { x1: number; y1: number; x2: number; y2: number; w: number }
/** 石阶：从低处 (x1, y1) 到高处 (x2, y2)，宽 w；两头的高度取各自台地的高度，中间是直坡 */
export interface SectStair { x1: number; y1: number; x2: number; y2: number; w: number; lo: string | number; hi: string | number }
/** 悬空峰：浮在半空的岩体，顶面圆心 (x, y)、半径 r、顶面相对基准面的高度 rise */
export interface SectIsle { id: string; x: number; y: number; r: number; rise: number; seed: number }
/** 铁索桥 / 长石桥：两端各在一层台地或一座悬空峰上（at 是台地或悬空峰的 id） */
export interface SectBridge { x1: number; y1: number; x2: number; y2: number; a: string; b: string; kind: 'chain' | 'stone'; w: number }
/** 瀑布：从 (x, y) 处的崖口往 (dx, dy) 方向落下，宽 w */
export interface SectFall { x: number; y: number; dx: number; dy: number; w: number; from: string }
/** 山体的大轮廓：主峰与分峰，各一个圆锥形的隆起（rise 是峰顶高度，r 是山脚半径） */
export interface SectPeak { x: number; y: number; r: number; rise: number }
/** 山间一片淡雾：中心、半宽、半深、离基准面多高 */
export interface SectMist { x: number; y: number; rx: number; ry: number; rise: number }

export interface GrandSectPlan {
  id: string;
  /** 宗门地界：椭圆，中心 (cx, cy)、半轴 rx / ry；椭圆外再过渡 apron 回到原来的地形 */
  cx: number; cy: number; rx: number; ry: number; apron: number;
  terraces: SectTerrace[]; stairs: SectStair[]; isles: SectIsle[]; bridges: SectBridge[]; falls: SectFall[]; peaks: SectPeak[]; mists: SectMist[];
  /** 山门（道路接到这里）与山门外道路的起点 */
  gate: { x: number; y: number }; gateOut: { x: number; y: number };
  /** 新开局的出生点：山门内的广场 */
  spawn: { x: number; y: number };
  /** 台地以外的山坡最低压到基准面以下多少 */
  floor: number;
  /** 样子：骨架、特色、树种、是否魔道 */
  look: SectLook;
  /** 在山里（台阶高差大）；否则在平地上堆出来的小山 */
  mountain: boolean;
  /** 院落、院落间的小径 */
  yards: SectYard[]; paths: SectPath[];
}

/** 开关：'' 默认（只有样板），'old' 全部退回老布局，'all' 所有大宗门都走新布局 */
function sectMode(): string {
  const forced = (globalThis as { __TAIXU_SECT?: string }).__TAIXU_SECT;
  if (typeof forced === 'string') return forced;
  try { return (typeof localStorage !== 'undefined' && localStorage.getItem('taixu.sect')) || ''; } catch { return ''; }
}
/** 本来就在山里的宗门（台阶高差大、基准面取所在山体的高度）；其余在平地上自己堆一座小山 */
const MOUNTAIN = new Set(['huangfeng', 'gujian', 'guiling', 'qianzhu']);

interface LocLike { id: string; type: string; major?: boolean; scale?: number; minor?: boolean; island?: number }
/** 这个地点走不走新布局：宗门（大宗门占山、其余小号）、以及沧溟海的岛上宗门；taixu.sect=old 整体退回老布局 */
export function isGrandSect(l: LocLike | undefined | null): boolean {
  if (!l || l.minor || sectMode() === 'old') return false;
  if (l.type === 'sect') return true;
  return l.type === 'isle' && SECT_LOOK[l.id]?.variant === 'isle';
}
/** 是占整座山的大宗门（不是小号） */
export function isMajorSect(p: GrandSectPlan | null | undefined): boolean { return !!p && p.look.variant !== 'small'; }

const memo = new Map<string, GrandSectPlan>();
/** 这座大宗门的规划（不是大宗门就返回 null）。同一个 id 只算一次 */
export function grandSectPlan(l: LocLike | undefined | null): GrandSectPlan | null {
  if (!l || !isGrandSect(l)) return null;
  let p = memo.get(l.id);
  if (!p) memo.set(l.id, p = makePlan(l));
  return p;
}
function makePlan(l: LocLike): GrandSectPlan {
  const mountain = MOUNTAIN.has(l.id), look = lookOf({ ...l, major: !!l.major && (l.scale ?? 1) >= 1 || MOUNTAIN.has(l.id) }, mountain);
  let plan: GrandSectPlan;
  if (look.variant === 'hero') plan = heroPlan(l.id, look);
  else {
    const v = variantPlan(look, mountain, strSeed(l.id));
    plan = { id: l.id, ...v, look, mountain, yards: [], paths: [] };
  }
  const y = placeYards(plan, strSeed(l.id));
  plan.yards = y.yards; plan.paths = y.paths;
  return plan;
}

/**
 * 样板的规划（青霞谷）。整座山约 1.5 万 × 1.6 万：
 *   山脚山门牌坊 → 登天长阶（2600 长）→ 山门广场（基准面 0）→ 登山长阶（中间一处歇脚台 +300）→ 外门（+650，弟子院落成排）
 *   → 演武场与钟鼓楼（+1150）→ 中层（+1700，丹房、器殿、藏经阁）→ 主殿广场（+2300，重檐正殿、两侧配殿）→ 最高处祖师殿与禁地（+3000）。
 *   层与层之间隔一道岩坡，台沿下是石砌挡墙。东分峰（+1700，洞府区）、西分峰（+1150，灵药园）各由一道石梁接到主峰；
 *   两座悬空峰（+3300、+2700）由铁索桥接到祖师殿和主殿广场。
 */
function heroPlan(id: string, look: SectLook): GrandSectPlan {
  const T = (tid: string, name: string, x: number, y: number, w: number, h: number, rise: number, o: Partial<SectTerrace> = {}): SectTerrace => ({ id: tid, name, x, y, w, h, rise, r: 140, ...o });
  // 台面都是圆角、南沿顺着山势微微鼓出；中轴一列是主台，东西两翼的台比主台低半层或高半层，错落开
  const terraces: SectTerrace[] = [
    // 登天长阶上的两处歇脚台（在地界外的山坡上，长阶分三段）
    T('land1', '长阶歇脚台', 0, 11100, 700, 400, -2500, { r: 160 }),
    T('land2', '长阶歇脚台', 0, 9100, 700, 400, -1200, { r: 160 }),
    T('gate', '山门广场', 0, 7000, 1700, 900, 0, { r: 220, bulge: 140 }),
    T('rest', '半山歇脚台', 0, 5700, 760, 320, 300, { r: 140, bulge: 60 }),
    // 外门：中轴一条长台（香炉、碑），两翼四片弟子院落，前低后高、东西不对称
    T('outer', '外门', 0, 4125, 1400, 1850, 650, { r: 160, bulge: 120 }),
    T('yardW1', '外门西院（下）', -2100, 4550, 2200, 1000, 560, { r: 300, bulge: 160 }),
    T('yardW2', '外门西院（上）', -2050, 3500, 2000, 900, 760, { r: 260 }),
    T('yardE1', '外门东院（下）', 2150, 4450, 2300, 1000, 600, { r: 320, bulge: 180 }),
    T('yardE2', '外门东院（上）', 2000, 3450, 1800, 850, 800, { r: 260 }),
    // 演武场：中间一大块，两翼低半层（钟鼓楼）
    T('drill', '演武场', 0, 1350, 3600, 2700, 1150, { r: 240, bulge: 140 }),
    T('drillW', '演武场西翼', -2550, 1500, 1300, 2000, 1000, { r: 320, bulge: 100 }),
    T('drillE', '演武场东翼', 2550, 1200, 1300, 1900, 1000, { r: 320, bulge: 100 }),
    // 中层：中间诸堂，西翼的藏经阁半悬在崖上，东翼接东峰石梁
    T('mid', '中层诸堂', 0, -1800, 3600, 2600, 1700, { r: 260, bulge: 120 }),
    T('midW', '中层西翼', -2350, -1500, 1100, 1900, 1550, { r: 260 }),
    T('midE', '中层东翼', 2350, -2100, 1100, 1700, 1550, { r: 260 }),
    // 主殿广场：正殿居中，两翼低半层（钟鼓楼、配殿）
    T('main', '主殿广场', 0, -4600, 3000, 2000, 2300, { r: 240, bulge: 160 }),
    T('mainW', '主殿西翼', -2050, -4400, 1100, 1500, 2150, { r: 260 }),
    T('mainE', '主殿东翼', 2050, -4700, 1100, 1500, 2150, { r: 260 }),
    T('top', '祖师殿', 0, -6650, 2600, 1300, 3000, { r: 320, bulge: 120 }),
    T('east', '东峰洞府', 5200, -1800, 2000, 2400, 1550, { r: 460 }),
    T('eastway', '东峰石梁', 3550, -1800, 1300, 300, 1550, { causeway: true, r: 0 }),
    T('west', '西峰灵药园', -5200, 1300, 2200, 2400, 1000, { r: 460 }),
    T('westway', '西峰石梁', -3650, 1300, 900, 300, 1000, { causeway: true, r: 0 }),
    // 崖上的观景台：岩峰顶上一小块平地，一座亭（御剑才上得去）
    T('perch1', '崖上亭', 3750, 3650, 420, 420, 980, { r: 210, perch: true }),
    T('perch2', '崖上亭', -3850, 4300, 420, 420, 820, { r: 210, perch: true }),
    T('perch3', '崖上亭', 2980, -3400, 400, 400, 2050, { r: 200, perch: true }),
    T('perch4', '崖上亭', -3150, -2850, 400, 400, 1950, { r: 200, perch: true }),
  ];
  // 层与层之间留一道几百宽的岩坡（台沿下是两三级错落的毛石墙，再往下是山坡、树），石阶从下一层台面里起步，跨过岩坡登上上一层的台沿
  const S = (x1: number, y1: number, x2: number, y2: number, w: number, lo: string | number, hi: string | number): SectStair => ({ x1, y1, x2, y2, w, lo, hi });
  const stairs: SectStair[] = [
    // 登天长阶：从山脚的山门牌坊一路登上山门广场，中间两处歇脚台（最低的一头落在山脚原来的地面上，见 surface.ts）
    S(0, 12900, 0, 11300, 380, 'ground', 'land1'),
    S(0, 10900, 0, 9300, 380, 'land1', 'land2'),
    S(0, 8900, 0, 7590, 380, 'land2', 'gate'),
    S(0, 6550, 0, 5920, 340, 'gate', 'rest'),          // 登山长阶，下段
    S(0, 5540, 0, 5170, 340, 'rest', 'outer'),         // 上段
    // 外门：中轴台与四片院落之间的小石阶
    S(-1180, 4500, -700, 4500, 200, 'yardW1', 'outer'), S(-550, 3600, -1050, 3600, 200, 'outer', 'yardW2'),
    S(1180, 4400, 700, 4400, 200, 'yardE1', 'outer'), S(550, 3550, 1100, 3550, 200, 'outer', 'yardE2'),
    S(-1900, 4300, -1900, 3950, 200, 'yardW1', 'yardW2'), S(1850, 4180, 1850, 3880, 200, 'yardE1', 'yardE2'),
    S(0, 3400, 0, 2840, 320, 'outer', 'drill'),        // 外门 → 演武场
    S(-2300, 3300, -2300, 2585, 220, 'yardW2', 'drillW'), S(2300, 3280, 2300, 2235, 220, 'yardE2', 'drillE'),
    S(-2150, 1650, -1800, 1650, 220, 'drillW', 'drill'), S(2150, 1150, 1800, 1150, 220, 'drillE', 'drill'),
    S(0, 330, 0, -380, 340, 'drill', 'mid'),           // 演武场 → 中层
    S(-2150, -1150, -1800, -1150, 220, 'midW', 'mid'), S(2150, -1700, 1800, -1700, 220, 'midE', 'mid'),
    S(0, -2780, 0, -3440, 360, 'mid', 'main'),         // 中层 → 主殿广场
    S(-1750, -4100, -1500, -4100, 200, 'mainW', 'main'), S(1750, -4300, 1500, -4300, 200, 'mainE', 'main'),
    S(-1000, -5100, -1000, -5950, 260, 'main', 'top'), // 主殿两侧上祖师殿
    S(1000, -5100, 1000, -5950, 260, 'main', 'top'),
  ];
  const isles: SectIsle[] = [
    { id: 'isleA', x: 3800, y: -6700, r: 650, rise: 3300, seed: 11 },
    { id: 'isleB', x: -4300, y: -4700, r: 480, rise: 2500, seed: 23 },
  ];
  const bridges: SectBridge[] = [
    { x1: 1300, y1: -6650, x2: 3160, y2: -6700, a: 'top', b: 'isleA', kind: 'chain', w: 150 },
    { x1: -2600, y1: -4650, x2: -3830, y2: -4700, a: 'mainW', b: 'isleB', kind: 'chain', w: 130 },
    { x1: 2900, y1: -1800, x2: 4200, y2: -1800, a: 'midE', b: 'east', kind: 'stone', w: 300 },
    { x1: -3200, y1: 1300, x2: -4100, y2: 1300, a: 'drillW', b: 'west', kind: 'stone', w: 300 },
  ];
  const falls: SectFall[] = [
    { x: -1250, y: -500, dx: 0, dy: 1, w: 260, from: 'mid' },     // 中层南沿落到演武场的水池
    { x: 5400, y: -600, dx: 0, dy: 1, w: 340, from: 'east' },     // 东峰南崖，落进山谷
    { x: -6300, y: 1300, dx: -1, dy: 0, w: 240, from: 'west' },   // 西峰西崖
  ];
  const peaks: SectPeak[] = [
    { x: 0, y: -6400, r: 9500, rise: 3300 },
    { x: 5200, y: -1800, r: 3200, rise: 1650 },
    { x: -5200, y: 1300, r: 3000, rise: 1100 },
  ];
  // 崖上观景台底下各一座岩峰
  for (const t of terraces) if (t.perch) peaks.push({ x: t.x, y: t.y, r: 1100, rise: t.rise - 30 });
  // 山间云雾：x, y, 半宽, 半深, 抬高（挂在两侧山谷和山脚的半空里，不压在台面上）
  const mists: SectMist[] = [
    { x: 3600, y: -3000, rx: 900, ry: 700, rise: 1050 }, { x: -3500, y: 2700, rx: 900, ry: 700, rise: 250 },
    { x: 4300, y: 5200, rx: 1400, ry: 900, rise: -500 }, { x: -4400, y: 5600, rx: 1400, ry: 900, rise: -600 },
    { x: -3700, y: -1800, rx: 800, ry: 600, rise: 900 },
  ];

  // 各台的用处
  const ROLE: Record<string, TerraceRole> = {
    land1: 'landing', land2: 'landing', gate: 'gate', rest: 'landing', outer: 'axis', yardW1: 'yards', yardW2: 'yards', yardE1: 'yards', yardE2: 'yards',
    drill: 'drill', drillW: 'bell', drillE: 'bell', mid: 'mid', midW: 'library', midE: 'hall2', main: 'main', mainW: 'tower', mainE: 'tower', top: 'top',
    east: 'caves', eastway: 'causeway', west: 'garden', westway: 'causeway',
  };
  for (const t of terraces) t.role = t.perch ? 'perch' : ROLE[t.id];
  const plan: GrandSectPlan = {
    id, cx: 0, cy: 100, rx: 7300, ry: 7800, apron: 1700, look, mountain: true, yards: [], paths: [],
    terraces, stairs, isles, bridges, falls, peaks, mists,
    gate: { x: 0, y: 7450 }, gateOut: { x: 0, y: 12900 },
    spawn: { x: 0, y: 6820 }, floor: -900,
  };
  // 整体往北挪：地点中心落在演武场正中（宗门里的人按地点中心散布，落在演武场上，不落在岩坡上）
  shiftPlan(plan, 0, -1350);
  return plan;
}
function shiftPlan(p: GrandSectPlan, dx: number, dy: number) {
  const mv = (o: { x: number; y: number }) => { o.x += dx; o.y += dy; };
  p.cx += dx; p.cy += dy;
  [...p.terraces, ...p.isles, ...p.falls, ...p.peaks, ...p.mists, p.gate, p.gateOut, p.spawn].forEach(mv);
  for (const s of p.stairs) { s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy; }
  for (const q of [...p.yards]) { q.x += dx; q.y += dy; }
  for (const q of p.paths) { q.x1 += dx; q.y1 += dy; q.x2 += dx; q.y2 += dy; }
  for (const b of p.bridges) { b.x1 += dx; b.y1 += dy; b.x2 += dx; b.y2 += dy; }
}

// ---------------------------------------------------------------- 山体高度模型（相对基准面；地表与测试共用）
const smooth = (t: number) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
/** 点到台面轮廓的距离（在里面为负：离最近的台沿多远）。圆角矩形，南沿按 bulge 鼓出一道弧 */
export function rectDist(r: SectRect, x: number, y: number): number {
  let px = x - r.x, py = y - r.y;
  if (r.bulge && py > 0) { const k = 2 * px / r.w; if (k > -1 && k < 1) py -= r.bulge * (1 - k * k); }
  const rr = Math.min(r.r ?? 0, r.w / 2, r.h / 2);
  const qx = Math.abs(px) - r.w / 2 + rr, qy = Math.abs(py) - r.h / 2 + rr;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr;
}
/**
 * 台面轮廓的折线（闭合；y 向南时按顺时针走），每段不长于 step；每个点带朝外的法线 [x, y, nx, ny]。
 * 挡墙、石栏、底图铺地都顺着它走。
 */
export function terraceOutline(t: SectRect, step = 120): [number, number, number, number][] {
  const rr = Math.min(t.r ?? 0, t.w / 2, t.h / 2), hw = t.w / 2 - rr, hh = t.h / 2 - rr;
  const raw: [number, number][] = [];
  const line = (x0: number, y0: number, x1: number, y1: number) => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step)); for (let i = 0; i < n; i++) raw.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]); };
  const arc = (cx: number, cy: number, a0: number) => { if (rr <= 0) { raw.push([cx, cy]); return; } const n = Math.max(2, Math.ceil(rr * Math.PI / 2 / step)); for (let i = 0; i < n; i++) { const a = a0 + Math.PI / 2 * i / n; raw.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } };
  // 从北沿西端起：北沿 → 东北角 → 东沿 → 东南角 → 南沿 → 西南角 → 西沿 → 西北角
  line(-hw, -t.h / 2, hw, -t.h / 2); arc(hw, -hh, -Math.PI / 2);
  line(t.w / 2, -hh, t.w / 2, hh); arc(hw, hh, 0);
  line(hw, t.h / 2, -hw, t.h / 2); arc(-hw, hh, Math.PI / 2);
  line(-t.w / 2, hh, -t.w / 2, -hh); arc(-hw, -hh, Math.PI);
  const pts = raw.map(([x, y]) => {
    if (t.bulge && y > 0) { const k = 2 * x / t.w; if (k > -1 && k < 1) y += t.bulge * (1 - k * k); }
    return [t.x + x, t.y + y] as [number, number];
  });
  return pts.map(([x, y], i) => {
    const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [x, y, dy / l, -dx / l];   // 这样走（y 向南）时，这个方向朝外
  });
}

/** 石阶两侧各多整平这么宽（垂带落脚处），免得石阶边上的地形一格之内陡起陡落 */
const STAIR_PAD = 60;
/**
 * 台沿以外往下：头 90 单位落 300（两级毛石墙就砌在这一截上，见 hd2d/sectPieces.ts 的 sWall），
 * 再往外是长满树的山坡（1:0.95，仍比步行限坡陡，走不下去）
 */
const dropAt = (d: number) => d < 90 ? d * 3.33 : 300 + (d - 90) * 0.95;
/** 台沿以外往上（台地嵌进山里，后面的山更高）：头 70 单位是崖壁，再往外 1:1.6 */
const upAt = (d: number) => d < 70 ? d * 4 : 280 + (d - 70) * 1.6;

function h2(ix: number, iy: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vn(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** 地界内的权重：椭圆里为 1，过渡带里渐降到 0 */
export function planWeight(p: GrandSectPlan, x: number, y: number): number {
  const e = Math.hypot((x - p.cx) / p.rx, (y - p.cy) / p.ry);
  if (e <= 1) return 1;
  // 伸出地界的石阶、歇脚台（山脚的登天长阶）整条都按规划走，不和原地形混
  for (const s of p.stairs) if (stairAt(s, 0, 0, x, y, STAIR_PAD) === 0) return 1;
  for (const t of p.terraces) if (rectDist(t, x, y) < 60) return 1;
  // 山脚引道口（登山石阶落在原地面的那一头）一带回到原地形：山里的宗门地界外的山坡按规划压得很低，
  // 不收的话石阶脚下、接进来的山道两侧会有一道几百高的坎（test-mountain-paths 的「路基横向高差」）
  const dg = Math.hypot(x - p.gateOut.x, y - p.gateOut.y), foot = dg < 900 ? smooth((dg - 140) / 760) : 1;
  return (1 - smooth((e - 1) * Math.min(p.rx, p.ry) / p.apron)) * foot;
}
/**
 * 把规划里写成 'ground' 的石阶端点（落在山脚原地形上的那一头）换成具体的抬高值。
 * natural(x, y) 给出本地坐标处原来的地面海拔，base 是基准面。地表建山时调一次，之后用换好的这份。
 */
export function resolvePlan(p: GrandSectPlan, natural: (x: number, y: number) => number, base: number): GrandSectPlan {
  if (!p.stairs.some((s) => s.lo === 'ground' || s.hi === 'ground')) return p;
  const fix = (v: string | number, x: number, y: number) => v === 'ground' ? natural(x, y) - base : v;
  return { ...p, stairs: p.stairs.map((s) => ({ ...s, lo: fix(s.lo, s.x1, s.y1), hi: fix(s.hi, s.x2, s.y2) })) };
}

/** 石阶上这一点的高度（不在这道石阶上返回 NaN）。lo / hi 是两头的高度 */
function stairAt(s: SectStair, lo: number, hi: number, x: number, y: number, pad = 0): number {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1, L2 = dx * dx + dy * dy;
  const t = ((x - s.x1) * dx + (y - s.y1) * dy) / L2;
  if (t < -0.001 || t > 1.001) return NaN;
  const d = Math.abs((x - s.x1) * dy - (y - s.y1) * dx) / Math.sqrt(L2);
  if (d > s.w / 2 + pad) return NaN;
  return lo + (hi - lo) * Math.max(0, Math.min(1, t));
}

/**
 * 地界里某一点相对基准面的高度：
 *   在台地里 → 台地的高度（平的）；在石阶上 → 两头之间的直坡；
 *   其余 → 山体轮廓（主峰、分峰的隆起加一点岩纹），但夹在各台地「台沿往下的挡墙与岩坡」和「台沿往上的崖壁」之间。
 */
/** planRise 顺带告诉调用方：这一点是不是在台面 / 石阶上（是的话高度是定死的；否则是山坡，地表可以让原地形更高的地方照旧高） */
export const planHit = { exact: false, near: Infinity, nearRise: 0 };
/**
 * 平地堆的小山碰上本来就更高的原地形（坡地、岛上的山）：台地切进去，切口是一道 1:0.9 的削坡（不是一堵竖墙），
 * 离最近的台沿 d 处最高到台面 + 这么多（相对基准面；见 surface.ts 的 applyMassifs）
 */
export const knollCut = (rise: number, d: number) => Math.max(0, rise) + Math.max(0, d - 40) * 0.9;
export function planRise(p: GrandSectPlan, x: number, y: number): number {
  let inside = -Infinity;
  planHit.exact = true;
  for (const t of p.terraces) if (t.rise > inside && Math.abs(x - t.x) <= t.w / 2 && Math.abs(y - t.y) <= t.h / 2 + (t.bulge ?? 0) && rectDist(t, x, y) <= 0) inside = t.rise;
  // 石阶优先于台地：石阶伸进下一层台地的那一截是凸起的坡
  for (const s of p.stairs) {
    const lo = riseOf(p, s.lo), hi = riseOf(p, s.hi), h = stairAt(s, lo, hi, x, y, STAIR_PAD);
    if (h === h) return h;
  }
  if (inside > -Infinity) return inside;
  planHit.exact = false;
  if (!p.mountain) return knollRise(p, x, y);
  let hill = p.floor;
  for (const k of p.peaks) {
    const d = Math.hypot(x - k.x, y - k.y) / k.r;
    if (d < 1) hill = Math.max(hill, p.floor + (k.rise - p.floor) * Math.pow(1 - d, 1.35));
  }
  let lo = -Infinity, hi = Infinity, near = Infinity, nearT: SectTerrace | null = null;
  for (const t of p.terraces) {
    const d = rectDist(t, x, y);
    if (d < near) { near = d; nearT = t; }
    lo = Math.max(lo, t.rise - dropAt(d));
    hi = Math.min(hi, t.rise + upAt(d));
  }
  // 台沿外的山坡不和台面齐平（否则从台沿就能直接走出去）：离台沿 700 以内，山坡要么在台面以下一道坎、要么以上一道崖
  //   越往外越放开（250 以内定死，700 以外不管），中间渐变，免得山坡上凭空多出一道断崖；
  //   平地上堆的小山多半往下让（台子立在小山上），山里的宗门按原来哪边近往哪边
  if (nearT && near < 700) {
    const r = nearT.rise, below = r - dropAt(near), above = r + upAt(near);
    if (hill > below && hill < above) {
      const target = (p.mountain ? hill < r : hill < r + 250) ? below : above, k = 1 - smooth((near - 250) / 450);
      hill += (target - hill) * k;
    }
  }
  // 岩纹：离台沿越远起伏越大（台沿本身不动，免得挡墙对不上）
  hill += (vn(x / 700 + 13.1, y / 700 - 4.7) - 0.5) * 260 * Math.min(1, near / 500);
  let h = Math.max(hill, lo);
  if (h > hi) h = Math.max(hi, lo);
  return h;
}

/**
 * 平地上堆的小山（不在山里的宗门）：一座和缓的土山，台地是顺着坡切出来的一层层平台。
 *   1. 山形：各层台地的高度按「离台沿多远」反距离加权揉成一个光滑的山包（台地越近权重越大），地界边缘往原地面收；
 *      主峰 / 分峰当作几个山头的控制点，山包在殿后微微隆起。山坡大多比步行限坡缓，长满树。
 *   2. 台沿：山包在台面前沿往往比台面低、后沿比台面高——前沿那一截（60 宽）就是一道挡墙，后沿是一道护坡；
 *      高差大的地方是墙（走不下去），小的地方只是一道坎，台地之间多半是能走的缓坡。
 *   3. 局部的崖：半悬在台沿外的楼阁（藏经阁、器殿、钟鼓楼）底下切出一道陡崖；铁索桥底下切出一道山沟（桥下能过）。
 * 「挡墙和崖只在局部」——从远处看是一座被树盖住的小山上露出殿阁，而不是一圈断崖围着平台。
 */
const KNOLL_R0 = 700, KNOLL_BAND = 60;
function knollRise(p: GrandSectPlan, x: number, y: number): number {
  let num = 0, den = 0, near = Infinity, nearT: SectTerrace | null = null;
  for (const t of p.terraces) {
    const d = Math.max(0, rectDist(t, x, y));
    if (d < near) { near = d; nearT = t; }
    const w = 1 / ((d + KNOLL_R0) * (d + KNOLL_R0));
    num += w * Math.max(0, t.rise); den += w;
  }
  // 山头：主峰、分峰（只给一半权重：殿后隆起一点，不压过台地）
  for (const k of p.peaks) { const d = Math.hypot(x - k.x, y - k.y), w = 0.5 / ((d + KNOLL_R0) * (d + KNOLL_R0)); num += w * k.rise * 0.9; den += w; }
  // 山脚：离最外一圈台地越远越往原地面收（台地之间离台沿都近，不受影响；地界外的过渡带再渐变回原地形）
  const G = p.floor - 80, foot = p.look.variant === 'small' ? 1000 : 1700;
  let h = G + (num / den - G) * (1 - smooth(near / foot));
  // 土山上一点起伏（离台沿越远越大）
  h += (vn(x / 900 + 13.1, y / 900 - 4.7) - 0.5) * 90 * Math.min(1, near / 600);
  // 崖壁栈阁：台地背后（北沿中段）是一道崖，崖顶齐上一层台的高度——一层层栈阁贴着崖壁
  if (p.look.variant === 'cliff' && nearT && y < nearT.y - nearT.h / 2 + 20 && Math.abs(x - nearT.x) < nearT.w * 0.4) {
    let up = Infinity; for (const o of p.terraces) if (o.rise > nearT.rise + 1) up = Math.min(up, o.rise);
    const cliff = nearT.rise + Math.min(up - nearT.rise, upAt(near));
    if (up < Infinity && near < 900 && cliff > h) h = cliff;
  }
  planHit.near = near; planHit.nearRise = nearT ? nearT.rise : 0;
  // 台沿：60 宽一截从台面高度过渡到山包（前沿是挡墙、后沿是护坡，高差小的地方只是一道坎）
  if (nearT && near < KNOLL_BAND) { const r = Math.max(0, nearT.rise); h = r + (h - r) * smooth(near / KNOLL_BAND); }
  // 局部的崖：半悬的楼阁底下（台的外侧、楼阁正下方一带）
  for (const t of p.terraces) {
    if (t.role !== 'library' && t.role !== 'tower' && t.role !== 'hall2') continue;
    const side = t.x < 0 ? -1 : 1, hx = t.x + side * t.w / 2, hy = t.y - 120;
    const dh = Math.hypot(x - hx, y - hy); if (dh > 900 || (x - t.x) * side < t.w / 2 - 200) continue;
    const d = Math.max(0, rectDist(t, x, y)), k = 1 - smooth((dh - 420) / 480), target = t.rise - dropAt(d);
    if (target < h) h += (target - h) * k;
  }
  // 铁索桥底下：一道山沟，沟底比桥面低三百多（人能从桥下过）
  for (const b of p.bridges) {
    if (b.kind !== 'chain') continue;
    const dx = b.x2 - b.x1, dy = b.y2 - b.y1, L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
    const t = ((x - b.x1) * dx + (y - b.y1) * dy) / L2; if (t < -0.05 || t > 1.05) continue;
    const s = Math.abs((x - b.x1) * dy - (y - b.y1) * dx) / L, k = 1 - smooth((s - b.w / 2 - 120) / 520);
    if (k <= 0) continue;
    const target = chainDeck(riseOf(p, b.a), riseOf(p, b.b), L, Math.max(0, Math.min(1, t))) - 340 - Math.max(0, s - b.w / 2) * 0.35;
    if (target < h) h += (target - h) * k;
  }
  // 双峰夹谷：桥下的山沟往南顺下去，接到谷中的演武场（一道浅浅的溪谷，瀑布从沟北的崖上落下来）
  const vt = p.look.variant === 'twin' ? p.terraces.find((t) => t.role === 'drill') : undefined, br = vt ? p.bridges.find((b) => b.kind === 'chain') : undefined;
  if (vt && br) {
    const yb = (br.y1 + br.y2) / 2, ye = vt.y - vt.h / 2, u = (y - yb) / (ye - yb);
    if (u > 0 && u < 1.05) {
      const sx = Math.abs(x - (br.x1 + br.x2) / 2), k = 1 - smooth((sx - 160) / 460);
      const deep = chainDeck(riseOf(p, br.a), riseOf(p, br.b), Math.abs(br.x2 - br.x1), 0.5) - 340;
      const target = deep + (vt.rise - 20 - deep) * smooth(Math.min(1, u)) + Math.max(0, sx - 160) * 0.3;
      if (k > 0 && target < h) h += (target - h) * k;
    }
  }
  return h;
}
export function riseOf(p: GrandSectPlan, id: string | number): number {
  if (typeof id === 'number') return id;
  for (const t of p.terraces) if (t.id === id) return t.rise;
  for (const s of p.isles) if (s.id === id) return s.rise;
  return 0;
}
/** 是否在石阶上（步行时石阶始终可走）。pad：两侧放宽多少 */
export function onPlanStair(p: GrandSectPlan, x: number, y: number, pad = 20): boolean {
  for (const s of p.stairs) {
    // 两头各多算 80：踏上最后一级、迈上台面的那一步也算在石阶上（陡的石阶最后一步不会被限坡卡住）
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1, L2 = dx * dx + dy * dy, L = Math.sqrt(L2), e = 80 / L;
    const t = ((x - s.x1) * dx + (y - s.y1) * dy) / L2;
    if (t < -e || t > 1 + e) continue;
    if (Math.abs((x - s.x1) * dy - (y - s.y1) * dx) / L <= s.w / 2 + pad) return true;
  }
  return false;
}
/** 这座宗门的山体在宏观坐标里占多大（让出地界的小地点、绕开山体的道路用）：外加过渡带的椭圆半轴 */
export function planReach(p: GrandSectPlan, extra = 0): { cx: number; cy: number; rx: number; ry: number } {
  return { cx: p.cx, cy: p.cy, rx: p.rx + p.apron + extra, ry: p.ry + p.apron + extra };
}

/**
 * 小地点让出大宗门的地界：落在山体（含过渡带）里的村落、洞府、妖兽巢穴沿径向推到山外。
 * 只挪位置、不增删、不改 id（旧存档里记着的地点都还在）。x, y 是宏观坐标；scale = 每宏观单位多少世界单位。
 */
export function yieldGrandSectGround(locs: { id: string; type: string; x: number; y: number; major?: boolean; scale?: number; minor?: boolean }[], scale: number, onLand: (x: number, y: number) => boolean): void {
  for (const g of locs) {
    const p = grandSectPlan(g); if (!p) continue;
    const R = planReach(p, 600), cx = g.x + p.cx / scale, cy = g.y + p.cy / scale, rx = R.rx / scale, ry = R.ry / scale;
    for (const l of locs) {
      if (!l.minor || l === g) continue;
      const dx = (l.x - cx) / rx, dy = (l.y - cy) / ry, e = Math.hypot(dx, dy);
      if (e >= 1) continue;
      const a0 = Math.atan2(dy, dx);
      for (let k = 0; k < 24; k++) {
        const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.13;
        const nx = cx + Math.cos(a) * rx * 1.04, ny = cy + Math.sin(a) * ry * 1.04;
        if (k < 23 && !onLand(nx, ny)) continue;
        l.x = nx; l.y = ny; break;
      }
    }
  }
}

/**
 * 道路绕开大宗门：通到宗门中心的路改接到山外的「山门路口」再直上山门；其余穿过山体的路沿地界外缘绕过去。
 * pts 是宏观坐标的折线（就地改）。center 是宗门中心（宏观坐标），scale 同上。
 */
export function routeAroundGrandSect(pts: [number, number][], center: [number, number], p: GrandSectPlan, scale: number): [number, number][] {
  const R = planReach(p, 500), cx = center[0] + p.cx / scale, cy = center[1] + p.cy / scale, rx = R.rx / scale, ry = R.ry / scale;
  // 路的起点被 smoothLine 加了一点抖动（宏观单位一个上下），终点才是准的：按 1.5 个宏观单位算「从宗门出发」。
  // 以前只认准点，从宗门出发的那一头没接上山门，被当成穿山的路推到地界边上（断刀坞那条路停在离山门四千多步的山脚）
  const at = (q: [number, number]) => Math.hypot(q[0] - center[0], q[1] - center[1]) < 1.5;
  let out = pts.slice();
  const tail: [number, number][] = [];
  const gOut: [number, number] = [center[0] + p.gateOut.x / scale, center[1] + p.gateOut.y / scale], gate: [number, number] = [center[0] + p.gate.x / scale, center[1] + p.gate.y / scale];
  if (at(out[0])) out.reverse();
  // 路接到山脚的山门牌坊（登天长阶的起点），从那里起是宗门自己的石阶
  if (at(out[out.length - 1])) out[out.length - 1] = gOut;
  void gate;
  const inside = (q: [number, number]) => Math.hypot((q[0] - cx) / rx, (q[1] - cy) / ry) < 1;
  // 先把穿过地界附近的那几段加密（半个宏观单位一点）：只看控制点的话，两点之间的弦会切进山体
  if (out.some((q) => Math.hypot((q[0] - cx) / rx, (q[1] - cy) / ry) < 3)) {
    const dense: [number, number][] = [out[0]];
    for (let i = 1; i < out.length; i++) {
      const a = out[i - 1], b = out[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5));
      for (let k = 1; k <= n; k++) dense.push(k === n ? b : [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    out = dense;
  }
  const hits = out.filter(inside);
  if (hits.length) {
    // 统一往一侧绕：按穿进去那几点的平均位置定东西
    const side = hits.reduce((s, q) => s + q[0] - cx, 0) >= 0 ? 1 : -1;
    out = out.map((q) => {
      if (!inside(q) || q === gOut) return q;
      const v = Math.max(-0.999, Math.min(0.999, (q[1] - cy) / ry));
      return [cx + side * rx * Math.sqrt(1 - v * v) * 1.02, q[1]] as [number, number];
    });
  }
  return out.concat(tail);
}

/**
 * 悬在半空、能走的面：铁索桥的桥面（垂成一道弧）和悬空峰的顶面。地表高度是单值的，桥下是山谷，
 * 所以这一层不进地形网格，只给走路、人物落脚、点地面用（见 surface.ts 的 deckAt）。
 * 返回相对基准面的高度；不在桥面 / 峰顶上返回 NaN。铁索桥的弧和 hd2d/sectPieces.ts 的 sChain 用的是同一个式子。
 */
export function planDeck(p: GrandSectPlan, x: number, y: number): number {
  for (const s of p.isles) if (Math.hypot(x - s.x, y - s.y) < s.r * 0.94) return s.rise;
  for (const b of p.bridges) {
    if (b.kind !== 'chain') continue;
    const dx = b.x2 - b.x1, dy = b.y2 - b.y1, L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
    const t = ((x - b.x1) * dx + (y - b.y1) * dy) / L2, ext = 110 / L;
    // 两头各往台面里多伸一截（高度就是台面的高度）：台沿那一格地形网格是斜的，不伸进去会在桥头绊一下
    if (t < -ext || t > 1 + ext) continue;
    if (Math.abs((x - b.x1) * dy - (y - b.y1) * dx) / L > b.w / 2 - 6) continue;
    return chainDeck(riseOf(p, b.a), riseOf(p, b.b), L, Math.max(0, Math.min(1, t)));
  }
  return NaN;
}
/** 铁索桥桥面：两头高度 a、b，水平长 L，t 从 0 到 1；中间垂下 6% 的长度 */
export function chainDeck(a: number, b: number, L: number, t: number): number { return a + (b - a) * t - Math.sin(t * Math.PI) * L * 0.06; }
/** 桥面、峰顶的外接框（相对地点中心），地表用来一步跳过 */
export function planDeckBox(p: GrandSectPlan): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of p.isles) { x0 = Math.min(x0, s.x - s.r); x1 = Math.max(x1, s.x + s.r); y0 = Math.min(y0, s.y - s.r); y1 = Math.max(y1, s.y + s.r); }
  for (const b of p.bridges) if (b.kind === 'chain') { x0 = Math.min(x0, b.x1, b.x2) - b.w; x1 = Math.max(x1, b.x1, b.x2) + b.w; y0 = Math.min(y0, b.y1, b.y2) - b.w; y1 = Math.max(y1, b.y1, b.y2) + b.w; }
  return x0 < x1 ? { x0, y0, x1, y1 } : null;
}
