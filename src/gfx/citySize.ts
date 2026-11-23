// P10：成片街坊的城——哪些城走新布局、各自城墙圈多大（世界单位，相对地点中心，x 向东、y 向南）。
// 布局（cityLayout.ts）和「把落在城里的小地点挪到城外」（data/world.ts）都按这里的尺寸，两边对得上。
// 本文件不引用任何别的模块（world.ts 也要用它，免得循环引用）。

/** 一块城墙圈：矩形。国都是内城、外城两块拼成的「凸」字 */
export interface CityRect { x0: number; y0: number; x1: number; y1: number }
export type CityGrade = 'capital' | 'major' | 'normal';

/** 样板城（taixu.city=sample 时只有这两座走新布局） */
const SAMPLE = new Set(['jiayuan', 'yuejing']);

/** localStorage taixu.city：old = 全部退回老布局；sample = 只有样板城；不设 = 所有城都走新布局 */
function cityMode(): 'old' | 'all' | 'sample' {
  try {
    const g = globalThis as { __TAIXU_CITY?: string; localStorage?: { getItem(k: string): string | null } };
    const v = g.__TAIXU_CITY ?? g.localStorage?.getItem('taixu.city') ?? '';
    return v === 'old' ? 'old' : v === 'sample' ? 'sample' : 'all';
  } catch { return 'all'; }
}
let MODE: ReturnType<typeof cityMode> | null = null;

export function usesNewCity(loc: { id: string; type: string; island?: number }): boolean {
  if (loc.type !== 'city') return false;
  MODE ??= cityMode();
  if (MODE === 'old') return false;
  if (MODE === 'all') return true;
  return SAMPLE.has(loc.id);
}

export function cityGrade(loc: { id: string; major?: boolean }): CityGrade {
  return loc.id === 'yuejing' || loc.id === 'jinjing' ? 'capital' : loc.major ? 'major' : 'normal';
}

/** 别界的图是哪一种（炎墟、幽冥……）：world.ts 造别界时登记，城的样式按它选 */
const REALM_KIND = new Map<string, string>();
export function setRealmKind(map: string, kind: string) { REALM_KIND.set(map, kind); }
export function realmKindOf(map: string | undefined): string | undefined { return map ? REALM_KIND.get(map) : undefined; }

/** 海岛上的城：城墙圈按岛的大小收（island 是宏观格数的半径，×300 = 世界单位） */
function islandHalf(island: number | undefined): number { return island ? island * 300 * 0.58 : Infinity; }

/** 城墙圈（世界单位）。国都：[内城, 外城]；外城在南、比内城宽。海岛城按岛收小 */
export function cityRects(grade: CityGrade, island?: number): CityRect[] {
  let rs: CityRect[];
  if (grade === 'capital') rs = [{ x0: -9500, y0: -11000, x1: 9500, y1: 2500 }, { x0: -12500, y0: 2500, x1: 12500, y1: 11000 }];
  else if (grade === 'major') rs = [{ x0: -6750, y0: -5750, x1: 6750, y1: 5750 }];
  else rs = [{ x0: -5200, y0: -4450, x1: 5200, y1: 4450 }];
  const h = islandHalf(island);
  if (h < Infinity) {
    const k = Math.min(1, h / Math.max(...rs.map((r) => Math.max(-r.x0, r.x1, -r.y0, r.y1))));
    if (k < 1) rs = rs.map((r) => ({ x0: Math.round(r.x0 * k / 50) * 50, y0: Math.round(r.y0 * k / 50) * 50, x1: Math.round(r.x1 * k / 50) * 50, y1: Math.round(r.y1 * k / 50) * 50 }));
  }
  return rs;
}

/** 城墙外护城河离墙的距离、河宽；城外再留出关厢的进深 */
export const MOAT_OFF = 1050, MOAT_W = 300, SUBURB = 1700;   // 护城河在瓮城之外

/** 城池占地（墙外加护城河和关厢）：其它小地点不能落在这个框里 */
export function cityClearRect(grade: CityGrade, island?: number): CityRect {
  const rs = cityRects(grade, island), m = MOAT_OFF + MOAT_W + SUBURB;
  return { x0: Math.min(...rs.map((r) => r.x0)) - m, y0: Math.min(...rs.map((r) => r.y0)) - m, x1: Math.max(...rs.map((r) => r.x1)) + m, y1: Math.max(...rs.map((r) => r.y1)) + m };
}

/**
 * 把落在新布局城池里的小地点（程序生成的村镇、洞府、巢穴、茶寮）挪到城外，id、名字不变。
 * 坐标是地图宏观坐标（×300 = 世界单位）；ok(x, y) 判断某处能不能放（陆地、不在湖里）。
 */
export function clearCityGrounds(locs: { id: string; type: string; x: number; y: number; minor?: boolean; major?: boolean; island?: number }[],
  ok: (x: number, y: number) => boolean, moved?: (l: { x: number; y: number }) => void, S = 300) {
  const cities = locs.filter((l) => usesNewCity(l));
  if (!cities.length) return;
  // 别界按种子撒的城彼此太近（两座城的整地台地叠在一起，高低不一）：后一座往外推开，直到两块台地之间留出一段
  const radOf = (c: { id: string; major?: boolean; island?: number }) => ((Math.max(...cityRects(cityGrade(c), c.island).flatMap((q) => [Math.hypot(q.x0, q.y0), Math.hypot(q.x1, q.y1), Math.hypot(q.x0, q.y1), Math.hypot(q.x1, q.y0)])) + 600) * 1.15) / S;
  // 别界按种子撒的城压在海边、湖边（城里一大片是水，房子排不满）：往近旁整块的陆地上挪
  const landFrac = (c: { major?: boolean; id: string; island?: number }, x: number, y: number) => {
    const r = cityClearRect(cityGrade(c), c.island); let n = 0, k = 0;
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) { n++; if (ok(x + (r.x0 + (r.x1 - r.x0) * i / 8) / S, y + (r.y0 + (r.y1 - r.y0) * j / 8) / S)) k++; }
    return k / n;
  };
  for (const c of cities) {
    if (!/^r\d+_h/.test(c.id) || c.island) continue;
    const f0 = landFrac(c, c.x, c.y);
    if (f0 >= 0.97) continue;
    let best = { x: c.x, y: c.y, f: f0 };
    for (let rr = 2; rr <= 36 && best.f < 0.99; rr += 2) for (let a = 0; a < 16; a++) {
      const x = c.x + Math.cos(a / 16 * Math.PI * 2) * rr, y = c.y + Math.sin(a / 16 * Math.PI * 2) * rr;
      if (cities.some((o) => o !== c && Math.hypot(o.x - x, o.y - y) < radOf(o) + radOf(c) + 4)) continue;
      const f = landFrac(c, x, y);
      if (f > best.f + 0.02) best = { x, y, f };
    }
    if (best.x !== c.x || best.y !== c.y) { c.x = best.x; c.y = best.y; moved?.(c); }
  }
  for (let j = 0; j < cities.length; j++) {
    const b2 = cities[j];
    if (!/^r\d+_h/.test(b2.id)) continue;
    for (let i = 0; i < j; i++) {
      const a2 = cities[i], need = radOf(a2) + radOf(b2) + 4, d = Math.hypot(b2.x - a2.x, b2.y - a2.y);
      if (d >= need) continue;
      const ux = d > 0.01 ? (b2.x - a2.x) / d : 1, uy = d > 0.01 ? (b2.y - a2.y) / d : 0;
      for (let t = need; t < need + 40; t += 2) { const x = a2.x + ux * t, y = a2.y + uy * t; if (ok(x, y)) { b2.x = x; b2.y = y; moved?.(b2); break; } }
    }
  }
  // 框：城墙加护城河、关厢；圆：城整地台地的半径（见 cityLayout 的 gw 和 terrain.ts 的 1.15）再留 1500——别的地点自己的台地不能压进城的台地
  const boxes = cities.map((c) => {
    const r = cityClearRect(cityGrade(c), c.island), far = Math.max(...cityRects(cityGrade(c), c.island).flatMap((q) => [Math.hypot(q.x0, q.y0), Math.hypot(q.x1, q.y0), Math.hypot(q.x0, q.y1), Math.hypot(q.x1, q.y1)]));
    return { c, x0: c.x + r.x0 / S, y0: c.y + r.y0 / S, x1: c.x + r.x1 / S, y1: c.y + r.y1 / S, rad: ((far + 600) * 1.15 + 1500) / S };
  });
  const inside = (x: number, y: number, pad: number) => boxes.some((b) => (x > b.x0 - pad && x < b.x1 + pad && y > b.y0 - pad && y < b.y1 + pad) || Math.hypot(x - b.c.x, y - b.c.y) < b.rad + pad);
  const placed: { x: number; y: number }[] = [];
  // 别界按种子造的宗门、坊市（id 形如 r12_h3）也能挪：它们没有原设里的固定位置
  const movable = (l: { id: string; minor?: boolean; type: string }) => l.minor || (/^r\d+_h/.test(l.id) && l.type !== 'city');
  for (const l of locs) {
    if (!movable(l) || !inside(l.x, l.y, 0)) continue;
    const b = boxes.find((q) => (l.x > q.x0 && l.x < q.x1 && l.y > q.y0 && l.y < q.y1) || Math.hypot(l.x - q.c.x, l.y - q.c.y) < q.rad)!;
    // 从城中心朝它原来的方向往外推到框外，再在两侧找一处空地（彼此至少隔 6 格 = 1800 世界单位）
    const a0 = Math.atan2(l.y - b.c.y, l.x - b.c.x);
    let best: [number, number] | null = null;
    for (let tries = 0; tries < 48 && !best; tries++) {
      const a = a0 + (tries % 2 ? 1 : -1) * Math.ceil(tries / 2) * 0.13;
      const dx = Math.cos(a), dy = Math.sin(a);
      // 射线出框的距离
      const tx = dx > 0 ? (b.x1 - b.c.x) / dx : dx < 0 ? (b.x0 - b.c.x) / dx : 1e9;
      const ty = dy > 0 ? (b.y1 - b.c.y) / dy : dy < 0 ? (b.y0 - b.c.y) / dy : 1e9;
      for (let extra = 2; extra < 20 && !best; extra += 2) {
        const t = Math.max(Math.min(tx, ty), b.rad) + extra, x = b.c.x + dx * t, y = b.c.y + dy * t;
        if (inside(x, y, 1.5) || !ok(x, y)) continue;
        if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < 6)) continue;
        if (locs.some((o) => o !== l && !o.minor && Math.hypot(o.x - x, o.y - y) < 8)) continue;
        best = [x, y];
      }
    }
    if (!best) continue;
    l.x = best[0]; l.y = best[1]; placed.push({ x: l.x, y: l.y });
    moved?.(l);
  }
}
