// P10：成片街坊的城。按「城墙 → 城门（对着进城的官道）→ 干道 → 街坊 → 院落」排出整座城：
//   一般城约一万见方、大城（嘉禾城，按参考图一）一万六、国都（梁京，按参考图二：宫城、皇城、内城、外城四重相套）两万八。
// 返回 true 表示这座城由这里排好了（坐标、尺寸都是最终值，layoutLocation 不再整体放大）；返回 false 走老布局。
//
// 这里一律用世界单位（人物约 90 高），相对地点中心，x 向东、y 向南；收尾时位置除以 LOC_SCALE 存进 LocLayout。
// 构件参数（宽、深、高）直接是世界单位，由 hd2d/cityPieces.ts 里登记的构件读。
// 一座院落是一个构件（ccourt），一间铺面是一个构件（cshop）：一座城几百上千个构件，而不是几千间房。
import { regionAt, LOCATIONS, WORLD_SCALE, type LocDef } from '../data/world';
import type { LocLayout, Piece } from './building';
import { FAC_NAME, type Env, type Door, type Fac } from './townLayout';
import { mulberry32 } from '../core/rng';
import { cityGrade, cityRects, usesNewCity, realmKindOf, MOAT_OFF, MOAT_W, SUBURB, type CityGrade, type CityRect } from './citySize';

const LS = 1.5;
interface R { x0: number; y0: number; x1: number; y1: number }
const rect = (x0: number, y0: number, x1: number, y1: number): R => ({ x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) });
const hit = (a: R, b: R, pad = 0) => a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.y0 < b.y1 + pad && a.y1 > b.y0 - pad;
const inset = (r: R, d: number): R => ({ x0: r.x0 + d, y0: r.y0 + d, x1: r.x1 - d, y1: r.y1 - d });
const W_ = (r: R) => r.x1 - r.x0, H_ = (r: R) => r.y1 - r.y0;
const area = (r: R) => Math.max(0, W_(r)) * Math.max(0, H_(r));
const overlapArea = (a: R, b: R) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/** 地面铺装的种类（cityGround.ts 照这个画） */
export const CG = { BASE: 0, AVE: 1, ST: 2, ALLEY: 3, YARD: 4, PLAZA: 5, WATER: 6, GARDEN: 7, MARKET: 8, TEMPLE: 9, ALTAR: 10, PALACE: 11, DIRT: 12, FIELD: 13 } as const;

/** 朝向：0 面南、1 面东、2 面北、3 面西（构件里「正面」是本地 +z，转到世界的这个方向） */
type Rot = 0 | 1 | 2 | 3;
const FACE: [number, number][] = [[0, 1], [1, 0], [0, -1], [-1, 0]];

interface Seg { x0: number; y0: number; x1: number; y1: number }
interface Gate { x: number; y: number; side: 's' | 'n' | 'e' | 'w'; main: boolean; barb: boolean; outer: boolean; name?: string }
interface Shop { pc: Piece; x: number; y: number; r: Rot; ave: boolean }

/** 每座城的尺度 */
interface Spec { T: number; H: number; ring: number; ave: number; st: number; alley: number; sx: number; sy: number; wallCol: string }
const SPEC: Record<CityGrade, Spec> = {
  capital: { T: 340, H: 420, ring: 240, ave: 420, st: 240, alley: 120, sx: 2300, sy: 2000, wallCol: '#8a867c' },
  major: { T: 300, H: 380, ring: 240, ave: 360, st: 220, alley: 120, sx: 2250, sy: 1950, wallCol: '#8e8a7e' },
  normal: { T: 240, H: 320, ring: 220, ave: 300, st: 200, alley: 110, sx: 2350, sy: 2050, wallCol: '#8e8a7e' },
};

/**
 * 地域样式：central 中原（梁国等）、jin 中州（更宏大规整、北地灰砖高墙）、frontier 西北荒漠 / 草原边城（夯土黄墙、平顶、少树）、
 * isle 海岛 / 港城（临水、码头、石墙）、demon 魔道地界（暗红黑瓦）；别界：ember 炎墟、nether 幽冥、frost 寒渊、spiritwood 灵木。
 * 构件（cityPieces.ts）按 L.cityStyle 换配色和做法，地面（cityGround.ts）按它调色。
 */
export type StyleId = 'central' | 'jin' | 'frontier' | 'isle' | 'demon' | 'ember' | 'nether' | 'frost' | 'spiritwood';
interface Style { wallCol: string; trees: number; canal: boolean; moat: boolean; docks: boolean; big: number; treeSp: string[] }
const STYLE: Record<StyleId, Style> = {
  central: { wallCol: '#8e8a7e', trees: 1, canal: true, moat: true, docks: false, big: 1, treeSp: ['willow', 'broad', 'peach', 'pine'] },
  jin: { wallCol: '#7e7c78', trees: 0.8, canal: true, moat: true, docks: false, big: 1.15, treeSp: ['broad', 'pine', 'willow', 'cypress'] },
  frontier: { wallCol: '#b8986a', trees: 0.25, canal: false, moat: false, docks: false, big: 1, treeSp: ['dead', 'broad'] },
  isle: { wallCol: '#a8a49a', trees: 0.7, canal: false, moat: false, docks: true, big: 1, treeSp: ['palm', 'broad', 'palm'] },
  demon: { wallCol: '#5a4a48', trees: 0.5, canal: true, moat: true, docks: false, big: 1, treeSp: ['dead', 'cypress'] },
  ember: { wallCol: '#7a4a3a', trees: 0.3, canal: false, moat: true, docks: false, big: 1, treeSp: ['dead'] },
  nether: { wallCol: '#4a4650', trees: 0.5, canal: true, moat: true, docks: false, big: 1, treeSp: ['dead', 'cypress'] },
  frost: { wallCol: '#a8b0b8', trees: 0.6, canal: false, moat: true, docks: false, big: 1, treeSp: ['snowpine', 'pine'] },
  spiritwood: { wallCol: '#7a7a62', trees: 2.2, canal: true, moat: true, docks: false, big: 1, treeSp: ['broad', 'bamboo', 'pine', 'willow'] },
};
function pickStyle(loc: LocDef, env: Env): StyleId {
  const rk = realmKindOf(loc.map);
  // 幽冥界的大城（都、两座大城）归魔道样式：暗红黑瓦；小城仍是幽冥的灰黑
  if (rk === 'nether' && loc.major) return 'demon';
  if (rk) return rk === 'archipelago' ? 'isle' : rk === 'desert' ? 'frontier' : (rk in STYLE ? rk as StyleId : 'central');
  if (loc.island || loc.map === 'luanxing') return 'isle';
  let reg: string | undefined;
  try { reg = regionAt(loc.x, loc.y, true)?.id; } catch { reg = undefined; }
  if (reg === 'modao') return 'demon';
  // 列国盟（镇天城）是对抗朔漠草原的边城
  if (env.arid > 0.45 || reg === 'jixi' || reg === 'tianlan' || reg === 'jiuguo' || loc.id === 'tiantian') return 'frontier';
  if (loc.map === 'dajin') return 'jin';
  return 'central';
}

/** 店铺名：姓 + 记 / 家 + 行当 */
const SURN = ['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '林', '郭', '何', '高', '罗', '郑', '梁', '谢', '宋', '唐', '许', '韩', '冯', '曹', '彭'];
const TRADE = ['布庄', '茶铺', '米行', '药铺', '酒肆', '当铺', '杂货', '绸缎庄', '书肆', '油坊', '香烛', '铁铺', '饭庄', '果子铺', '漆器', '瓷器', '粮栈', '鞋帽'];

class CB {
  /** 地域样式 */
  style: StyleId = 'central';
  /** 剧情锚点（邹府门口……），世界单位 */
  anchors: Record<string, { x: number; y: number }> = {};
  /** 城墙圈 */
  rs: R[] = [];
  P: Piece[] = [];
  gnd: { t: number; r: R; o?: boolean }[] = [];
  blk: R[] = [];
  lights: { x: number; y: number; r: number; h?: number }[] = [];
  smoke: { x: number; y: number }[] = [];
  flags: { x: number; y: number; color: string }[] = [];
  segs: Seg[] = [];
  spots: { x: number; y: number }[] = [];
  doors: Door[] = [];
  shops: Shop[] = [];
  reserved: R[] = [];
  /** 城里自己挖的水（河道、湖、护城河）：街过水要架桥 */
  water: R[] = [];
  trees = 0; maxTrees: number;
  courts = 0; houses = 0; openCourts = 0;
  /** 海岛城的墙线（shoreOutline）；墙线外先占住的格子 */
  shore: { rc?: number; poly: [number, number][]; spans: { s: 's' | 'e' | 'n' | 'w'; a: number; b: number; c: number }[]; runs: { s: 's' | 'e' | 'n' | 'w'; pts: [number, number][] }[] } | null = null;
  shoreOut: R[] = [];
  /** 港城的码头（岸上那一头、栈桥伸出的方向）：harbor() 从城门修路过来、两边起货栈渔村 */
  dockPts: { x: number; y: number; sx: number; sy: number }[] = [];
  /** 重排时院落排得更紧的档数（0 = 照常） */
  dense = 0;
  sid = 0;
  rnd: () => number;
  /** 天然水面（河、湖）：按 400 见方的格子分三种——全干（0）、全是水（2）、岸线穿过（1，只有这种才逐点问 site） */
  private wetCells = new Map<number, number>();
  wetRuns: R[] = [];
  extent: R = { x0: 0, y0: 0, x1: 0, y1: 0 };
  constructor(public loc: LocDef, public env: Env, public seed: number, public grade: CityGrade, public S: Spec) {
    this.rnd = mulberry32(seed ^ 0x51c17);
    this.maxTrees = grade === 'capital' ? 170 : grade === 'major' ? 110 : 70;
  }
  R(a: number, b: number) { return a + this.rnd() * (b - a); }
  pick<T>(a: readonly T[]): T { return a[Math.floor(this.rnd() * a.length)]; }
  add(kind: string, x: number, y: number, p: Record<string, unknown> = {}): Piece {
    const pc: Piece = { kind, x, y, seed: (this.seed + ++this.sid * 7919) >>> 0, p };
    this.P.push(pc); return pc;
  }
  ground(t: number, r: R, o = false) { if (W_(r) > 1 && H_(r) > 1) this.gnd.push({ t, r, o }); }
  /** 调试：每个碰撞块是谁放的（测试里用来查导航点落在块里的原因） */
  tag = ''; blkTag: string[] = [];
  block(r: R) { if (W_(r) > 1 && H_(r) > 1) { this.blk.push(r); this.blkTag.push(this.tag); } }
  /** h：灯挂的高度（世界单位）。给了高度的灯光晕画在半空、不只神识圈里亮（万家灯火） */
  light(x: number, y: number, r = 40, h = 0) { this.lights.push(h ? { x, y, r, h } : { x, y, r }); }
  /** 这一处的贫富 0..1：城心、内城富，城根、外城穷，按街坊有起伏 */
  wealth(x: number, y: number) {
    const hx = Math.max(...this.rs.map((r) => Math.max(-r.x0, r.x1))), hy = Math.max(...this.rs.map((r) => Math.max(-r.y0, r.y1)));
    let w = 1.05 - Math.hypot(x / hx, y / hy) * 0.85;
    if (this.grade === 'capital') w += y < 2500 ? 0.15 : -0.2;
    const ix = Math.floor(x / 1500), iy = Math.floor(y / 1500);
    let h = Math.imul(ix * 374761393 + iy * 668265263 + this.seed, 1274126177); h ^= h >>> 15;
    w += ((h >>> 0) / 4294967296 - 0.5) * 0.5;
    return Math.max(0, Math.min(1, w));
  }
  shopName() { return this.pick(SURN) + (this.rnd() < 0.5 ? '记' : '家') + this.pick(TRADE); }
  /** 一片立体的树（一个构件）：在 r 里撒 n 棵，躲开 avoid 里的框；types 里挑 c 柏、p 松、b 阔叶 */
  grove(r: R, n: number, types: string, avoid: R[] = [], size = 1) {
    const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2, items: [number, number, number, string][] = [];
    for (let i = 0; i < n * 3 && items.length < n; i++) {
      const x = this.R(r.x0, r.x1), y = this.R(r.y0, r.y1);
      if (avoid.some((q) => x > q.x0 && x < q.x1 && y > q.y0 && y < q.y1) || this.wet(x, y)) continue;
      if (items.some(([u, v]) => Math.hypot(u + cx - x, v + cy - y) < 70 * size)) continue;
      items.push([x - cx, y - cy, size * this.R(0.8, 1.2), types[Math.floor(this.rnd() * types.length)]]);
    }
    if (items.length) this.add('cgrove', cx, cy, { items });
  }
  tree(x: number, y: number, sp: string, s = 0.6, force = false) {
    if (!force && (this.trees >= this.maxTrees || this.wet(x, y))) return false;
    // 树和车马摊子互相让开（不长在车上、马身上）
    if (this.props.some((q) => x > q.x0 - 90 && x < q.x1 + 90 && y > q.y0 - 60 && y < q.y1 + 120)) return false;
    this.trees++; this.treePts.push([x, y]); this.add('tree', x, y, { sp, s }); return true;
  }
  /** 车、马、轿、摊子的占地（树要躲开）；已经种下的树（放车马时躲开） */
  props: R[] = [];
  treePts: [number, number][] = [];
  /** 到河岸距离：400 见方格点上取值并缓存，格内双线性插值（河岸误差几十个单位，排房子够用） */
  private rd = new Map<number, number>();
  private rdAt(i: number, j: number) {
    const k = (i + 4096) * 8192 + j + 4096;
    let d = this.rd.get(k);
    if (d === undefined) { d = this.env.riverDist!(i * 400, j * 400); if (d > 5000) d = 5000; this.rd.set(k, d); }
    return d;
  }
  private cell(x: number, y: number) {
    const cx = Math.floor(x / 400), cy = Math.floor(y / 400), k = (cx + 4096) * 8192 + cy + 4096;
    let c = this.wetCells.get(k);
    if (c === undefined) {
      const x0 = cx * 400, y0 = cy * 400, E = this.env;
      c = 0;
      if (E.wetHint && E.riverDist) {
        // 海岸、湖边：逐点问 site（3）；内陆按四角到河岸的距离分全干 / 全水 / 岸线穿过（1，格内插值）
        if (E.wetHint(x0 - 100, y0 - 100, x0 + 500, y0 + 500)) c = 3;
        else {
          const ds = [this.rdAt(cx, cy), this.rdAt(cx + 1, cy), this.rdAt(cx, cy + 1), this.rdAt(cx + 1, cy + 1)];
          const lo = Math.min(...ds), hi = Math.max(...ds);
          c = lo > 340 ? 0 : hi < -240 ? 2 : 1;
        }
      } else c = 3;
      this.wetCells.set(k, c);
    }
    return c;
  }
  /** 某处是天然的水（或城里挖的水） */
  wet(x: number, y: number) {
    for (const w of this.water) if (x > w.x0 && x < w.x1 && y > w.y0 && y < w.y1) return true;
    return this.natWet(x, y);
  }
  /** 一块地是否全干（四角、四边中点、中心） */
  dry(r: R, pad = 0) {
    const a = r.x0 - pad, b = r.x1 + pad, c = r.y0 - pad, d = r.y1 + pad, mx = (a + b) / 2, my = (c + d) / 2;
    for (const [x, y] of [[a, c], [b, c], [a, d], [b, d], [mx, my], [mx, c], [mx, d], [a, my], [b, my]]) if (this.wet(x, y)) return false;
    return true;
  }
  free(r: R) { for (const q of this.reserved) if (hit(q, r)) return false; return true; }
  /** 这块地压不压在已经修好的街上（街心线两侧各 pad） */
  onStreet(r: R, pad = 140) { return this.segs.some((g) => hit(rect(g.x0, g.y0, g.x1, g.y1), r, pad)); }
  /** 街不能穿过的整块地（皇城、天坛……）：街到这里断开 */
  hard: R[] = [];
  /**
   * 一条街（轴向）：铺装 + 导航线 + 行人落脚点。过水（天然河或城里的河）时架石桥，水面上不铺；遇到整块的保留地断开。
   */
  street(x0: number, y0: number, x1: number, y1: number, w: number, t: number, nav = true) {
    const hz = Math.abs(y1 - y0) < 1, L = hz ? Math.abs(x1 - x0) : Math.abs(y1 - y0);
    if (L < 1) return;
    const dir = hz ? Math.sign(x1 - x0) : Math.sign(y1 - y0);
    let parts: [number, number][] = [[0, L]];
    for (const q0 of this.hard) {
      const q = inset(q0, -90);   // 离保留地的墙留一点
      const cross = hz ? q.y0 < y0 + w / 2 && q.y1 > y0 - w / 2 : q.x0 < x0 + w / 2 && q.x1 > x0 - w / 2;
      if (!cross) continue;
      const a = hz ? (q.x0 - x0) * dir : (q.y0 - y0) * dir, c = hz ? (q.x1 - x0) * dir : (q.y1 - y0) * dir;
      const lo = Math.min(a, c), hi = Math.max(a, c), next: [number, number][] = [];
      for (const [s, e] of parts) { if (hi <= s || lo >= e) { next.push([s, e]); continue; } if (lo > s) next.push([s, lo]); if (hi < e) next.push([hi, e]); }
      parts = next;
    }
    for (const [s, e] of parts) {
      if (e - s < 60) continue;
      const ax = hz ? x0 + dir * s : x0, ay = hz ? y0 : y0 + dir * s, bx = hz ? x0 + dir * e : x0, by = hz ? y0 : y0 + dir * e;
      this.streetPart(ax, ay, bx, by, w, t, nav);
      // 夜里干道两边一串灯笼（檐下、灯杆上），远看是一条条灯带
      if (t === CG.AVE && this.tag !== 'suburb') for (let k = s + 120; k < e - 60; k += 230) for (const side of [-1, 1]) {
        const cx = hz ? x0 + dir * k : x0 + side * (w / 2 - 30), cy = hz ? y0 + side * (w / 2 - 30) : y0 + dir * k;
        if (!this.wet(cx, cy)) this.light(cx, cy, 20, 95);
      }
    }
  }
  private streetPart(x0: number, y0: number, x1: number, y1: number, w: number, t: number, nav: boolean) {
    const hz = Math.abs(y1 - y0) < 1, L = hz ? Math.abs(x1 - x0) : Math.abs(y1 - y0);
    const dir = hz ? Math.sign(x1 - x0) : Math.sign(y1 - y0);
    // 沿街每 60 查一次水
    const step = 60, n = Math.max(1, Math.ceil(L / step));
    const wetAt: boolean[] = [];
    for (let i = 0; i <= n; i++) { const s = Math.min(L, i * step); const x = hz ? x0 + dir * s : x0, y = hz ? y0 : y0 + dir * s; wetAt.push(this.wet(x, y)); }
    let runStart = -1;
    const put = (s0: number, s1: number) => {
      if (s1 - s0 < 2) return;
      const a = hz ? x0 + dir * s0 : x0, b = hz ? x0 + dir * s1 : x0, c = hz ? y0 : y0 + dir * s0, d = hz ? y0 : y0 + dir * s1;
      this.ground(t, hz ? rect(a, c - w / 2, b, c + w / 2) : rect(a - w / 2, c, a + w / 2, d));
    };
    let dryStart = 0;
    for (let i = 0; i <= n + 1; i++) {
      const isWet = i <= n && wetAt[i];
      if (isWet && runStart < 0) { runStart = i; put(dryStart, Math.max(0, (i - 0.5) * step)); }
      if (!isWet && runStart >= 0) {
        const s0 = Math.max(0, (runStart - 1) * step), s1 = Math.min(L, i * step);
        const len = s1 - s0, mid = (s0 + s1) / 2;
        if (len < 1300) {
          const mx = hz ? x0 + dir * mid : x0, my = hz ? y0 : y0 + dir * mid;
          this.add('cbridge', mx, my, { len: len + 80, w: Math.min(w, 300), ax: hz ? 'x' : 'y', rail: 1, arch: len < 500 ? 1 : 0 });
        }
        runStart = -1; dryStart = Math.min(L, (i - 0.5) * step);
      }
    }
    if (runStart < 0) put(dryStart, L);
    if (nav) this.segs.push({ x0, y0, x1, y1 });
  }
  /** 天然水（河、湖）：不算城里自己挖的 */
  natWet(x: number, y: number) {
    const c = this.cell(x, y);
    if (c === 0) return false;
    if (c === 2) return true;
    if (c === 3) return !this.env.site(x, y);
    const fx = x / 400, fy = y / 400, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const d = (this.rdAt(i, j) * (1 - u) + this.rdAt(i + 1, j) * u) * (1 - v) + (this.rdAt(i, j + 1) * (1 - u) + this.rdAt(i + 1, j + 1) * u) * v;
    return d < 60;
  }
  /** 查过、岸线穿过或全是水的 400 见方格子 */
  wetCellList() {
    const out: [number, number, number][] = [];
    for (const [k, v] of this.wetCells) if (v) out.push([(Math.floor(k / 8192) - 4096) * 400, (k % 8192 - 4096) * 400, v]);
    return out;
  }
}

// ======================================================== 城墙、城门、护城河
/** 各块城墙圈的边：去掉落在别的圈里的部分（先列出的圈保留与后面重合的边——国都内城的南墙就是这么留下来的） */
function wallEdges(rs: R[], open: boolean): { a: number; b: number; c: number; ax: 'h' | 'v'; out: number; ri: number }[] {
  const out: { a: number; b: number; c: number; ax: 'h' | 'v'; out: number; ri: number }[] = [];
  rs.forEach((r, i) => {
    const edges: [number, number, number, 'h' | 'v', number][] = [[r.x0, r.x1, r.y0, 'h', -1], [r.x0, r.x1, r.y1, 'h', 1], [r.y0, r.y1, r.x0, 'v', -1], [r.y0, r.y1, r.x1, 'v', 1]];
    for (const [a, b, c, ax, o] of edges) {
      let parts: [number, number][] = [[a, b]];
      rs.forEach((q, j) => {
        if (j === i) return;
        const closed = !open && j < i;
        const qa = ax === 'h' ? q.x0 : q.y0, qb = ax === 'h' ? q.x1 : q.y1, qc0 = ax === 'h' ? q.y0 : q.x0, qc1 = ax === 'h' ? q.y1 : q.x1;
        const inC = closed ? c >= qc0 && c <= qc1 : c > qc0 && c < qc1;
        if (!inC) return;
        const next: [number, number][] = [];
        for (const [s, e] of parts) {
          const cs = Math.max(s, qa), ce = Math.min(e, qb);
          if (ce <= cs) { next.push([s, e]); continue; }
          if (cs > s) next.push([s, cs]);
          if (ce < e) next.push([ce, e]);
        }
        parts = next;
      });
      for (const [s, e] of parts) if (e - s > 1) out.push({ a: s, b: e, c, ax, out: o, ri: i });
    }
  });
  return out;
}

/** 城门：固定的（干道正对的）+ 官道进城处（离已有城门远的另开一座） */
function planGates(b: CB, rs: R[], fixed: Gate[]): Gate[] {
  const gates = fixed.slice();
  const edges = wallEdges(rs, false);
  const outline = edges.filter((e) => {
    // 外沿：边外侧一点不在任何圈里
    const px = e.ax === 'h' ? (e.a + e.b) / 2 : e.c + e.out * 5, py = e.ax === 'h' ? e.c + e.out * 5 : (e.a + e.b) / 2;
    return !rs.some((q) => px > q.x0 && px < q.x1 && py > q.y0 && py < q.y1);
  });
  const roads = b.env.roads?.(40000) ?? [];
  const added = new Set<number>();
  for (const rd of roads) {
    if (!rd.major) continue;
    const P = rd.pts;
    // 路从外面进城：找第一处穿过外沿的地方（从离城远的那一端往里走）
    const far = Math.hypot(P[0][0], P[0][1]) > Math.hypot(P[P.length - 1][0], P[P.length - 1][1]);
    const pts = far ? P : P.slice().reverse();
    let hitAt: { ei: number; t: number } | null = null;
    for (let i = 0; i < pts.length - 1 && !hitAt; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      outline.forEach((e, ei) => {
        if (hitAt) return;
        if (e.ax === 'h') {
          if ((y0 - e.c) * (y1 - e.c) > 0 || y0 === y1) return;
          const x = x0 + (x1 - x0) * (e.c - y0) / (y1 - y0);
          if (x > e.a && x < e.b) hitAt = { ei, t: x };
        } else {
          if ((x0 - e.c) * (x1 - e.c) > 0 || x0 === x1) return;
          const y = y0 + (y1 - y0) * (e.c - x0) / (x1 - x0);
          if (y > e.a && y < e.b) hitAt = { ei, t: y };
        }
      });
    }
    if (!hitAt) continue;
    const { ei, t } = hitAt as { ei: number; t: number }, e = outline[ei];
    const onEdge = (g: Gate) => e.ax === 'h' ? Math.abs(g.y - e.c) < 5 && g.x >= e.a && g.x <= e.b : Math.abs(g.x - e.c) < 5 && g.y >= e.a && g.y <= e.b;
    const near = gates.some((g) => onEdge(g) && Math.abs((e.ax === 'h' ? g.x : g.y) - t) < 2600);
    if (near || added.has(ei)) continue;
    const p = Math.round(Math.max(e.a + 1600, Math.min(e.b - 1600, t)) / 100) * 100;
    if (gates.some((g) => onEdge(g) && Math.abs((e.ax === 'h' ? g.x : g.y) - p) < 2200)) continue;
    const gx = e.ax === 'h' ? p : e.c, gy = e.ax === 'h' ? e.c : p;
    if (b.wet(gx, gy)) continue;
    added.add(ei);
    gates.push({ x: gx, y: gy, side: e.ax === 'h' ? (e.out < 0 ? 'n' : 's') : (e.out < 0 ? 'w' : 'e'), main: false, barb: false, outer: true });
  }
  // 城门在外沿上还是在内墙上（国都正阳门）；瓮城只修在外沿的城门外
  for (const g of gates) {
    g.outer = outline.some((e) => e.ax === (g.side === 'n' || g.side === 's' ? 'h' : 'v') && Math.abs((e.ax === 'h' ? g.y : g.x) - e.c) < 5 && (e.ax === 'h' ? g.x : g.y) > e.a && (e.ax === 'h' ? g.x : g.y) < e.b);
    g.barb = g.barb && g.outer;
  }
  return gates;
}

const GATE_W = 640, GATE_OPEN = 240, BARB_D = 620, BARB_W = 1000;

function buildWalls(b: CB, rs: R[], gates: Gate[], gatesOnly = false) {
  b.tag = 'wall';
  const { T, H, wallCol } = b.S;
  const edges = gatesOnly ? [] : wallEdges(rs, false);
  for (const e of edges) {
    // 墙上的城门把墙切开
    const gs = gates.filter((g) => e.ax === 'h' ? Math.abs(g.y - e.c) < 5 && g.x > e.a && g.x < e.b : Math.abs(g.x - e.c) < 5 && g.y > e.a && g.y < e.b)
      .map((g) => e.ax === 'h' ? g.x : g.y).sort((p, q) => p - q);
    const runs: [number, number][] = []; let s = e.a;
    for (const p of gs) { runs.push([s, p - GATE_W / 2]); s = p + GATE_W / 2; }
    runs.push([s, e.b]);
    for (const [a0, a1] of runs) {
      // 城墙穿过天然水面处断开（水门）
      const len = a1 - a0, n = Math.max(1, Math.ceil(len / 1100));
      for (let i = 0; i < n; i++) {
        const p0 = a0 + len * i / n, p1 = a0 + len * (i + 1) / n, m = (p0 + p1) / 2;
        const cx = e.ax === 'h' ? m : e.c, cy = e.ax === 'h' ? e.c : m;
        if (b.wet(cx, cy)) continue;
        // 两端各伸出半个墙厚，转角处接上
        const ext0 = i === 0 && Math.abs(p0 - e.a) < 1 ? T / 2 : 0, ext1 = i === n - 1 && Math.abs(p1 - e.b) < 1 ? T / 2 : 0;
        const q0 = p0 - ext0, q1 = p1 + ext1, mm = (q0 + q1) / 2;
        b.add('cwall', e.ax === 'h' ? mm : e.c, e.ax === 'h' ? e.c : mm, { len: q1 - q0, ax: e.ax === 'h' ? 'x' : 'y', h: H, t: T, col: wallCol, out: e.out, mer: 1 });
        b.block(e.ax === 'h' ? rect(q0, e.c - T / 2, q1, e.c + T / 2) : rect(e.c - T / 2, q0, e.c + T / 2, q1));
      }
    }
  }
  // 角楼：不落在别的圈里的墙角
  for (let i = 0; i < (gatesOnly ? 0 : rs.length); i++) {
    const r = rs[i];
    for (const [x, y] of [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]]) {
      if (rs.some((q, j) => j !== i && x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1)) continue;
      if (b.wet(x, y)) continue;
      b.add('ctower', x, y, { t: T, h: H, col: wallCol, s: b.grade === 'capital' ? 1.25 : 1 });
      b.block(rect(x - T * 0.75, y - T * 0.75, x + T * 0.75, y + T * 0.75));
      b.light(x, y - 60, 60);
    }
  }
  // 城门：门洞两侧是实的；有瓮城的在外侧再围一圈
  for (const g of gates) {
    const hz = g.side === 'n' || g.side === 's', o = g.side === 's' || g.side === 'e' ? 1 : -1;
    const r: Rot = g.side === 's' ? 0 : g.side === 'e' ? 1 : g.side === 'n' ? 2 : 3;
    b.add('cgate', g.x, g.y, { r, t: T, h: H, w: GATE_W, open: GATE_OPEN, col: wallCol, big: g.main ? 1 : 0, name: g.name ?? '', city: g.main && g.outer ? b.loc.name : '' });
    const side = (GATE_W - GATE_OPEN) / 2;
    if (hz) { b.block(rect(g.x - GATE_W / 2, g.y - T / 2, g.x - GATE_OPEN / 2, g.y + T / 2)); b.block(rect(g.x + GATE_OPEN / 2, g.y - T / 2, g.x + GATE_W / 2, g.y + T / 2)); }
    else { b.block(rect(g.x - T / 2, g.y - GATE_W / 2, g.x + T / 2, g.y - GATE_OPEN / 2)); b.block(rect(g.x - T / 2, g.y + GATE_OPEN / 2, g.x + T / 2, g.y + GATE_W / 2)); }
    void side;
    b.light(g.x + (hz ? -GATE_OPEN : o * T), g.y + (hz ? o * T : -GATE_OPEN), 60); b.light(g.x + (hz ? GATE_OPEN : o * T), g.y + (hz ? o * T : GATE_OPEN), 60);
    // 城门楼通亮：楼上一排窗、檐下灯笼（灯挂在城楼的高度上）
    for (let k = -2; k <= 2; k++) { const a = k * GATE_W * 0.2; b.light(g.x + (hz ? a : o * (T / 2 + 20)), g.y + (hz ? o * (T / 2 + 20) : a), 34, H + 150); }
    if (g.main && b.flags.length < 20) for (const s of [-1, 1]) b.flags.push({ x: g.x + (hz ? s * GATE_W * 0.42 : o * (T / 2 + 40)), y: g.y + (hz ? o * (T / 2 + 40) : s * GATE_W * 0.42), color: '#a8432f' });
    // 门洞里的路
    const d0 = T / 2 + b.S.ring / 2, d1 = g.barb ? T / 2 + BARB_D + 160 : T / 2 + 60;
    b.street(g.x - (hz ? 0 : o * d0), g.y - (hz ? o * d0 : 0), g.x + (hz ? 0 : o * d1), g.y + (hz ? o * d1 : 0), GATE_OPEN, CG.AVE);
    if (g.barb) {
      // 瓮城：门外一圈矮一点的墙，正面开门（门上箭楼）
      const bt = T * 0.7, bh = H * 0.92, fr = T / 2 + BARB_D;   // 瓮城外墙离城墙中线的距离
      const along = (a: number, c: number) => hz ? [g.x + a, g.y + o * c] : [g.x + o * c, g.y + a];
      // 两侧墙
      for (const s of [-1, 1]) {
        const [cx, cy] = along(s * BARB_W / 2, T / 2 + BARB_D / 2);
        b.add('cwall', cx, cy, { len: BARB_D + bt, ax: hz ? 'y' : 'x', h: bh, t: bt, col: b.S.wallCol, out: s, mer: 1 });
        b.block(hz ? rect(cx - bt / 2, cy - BARB_D / 2, cx + bt / 2, cy + BARB_D / 2) : rect(cx - BARB_D / 2, cy - bt / 2, cx + BARB_D / 2, cy + bt / 2));
      }
      // 正面墙（中间是箭楼门）
      const half = BARB_W / 2 + bt / 2;
      for (const s of [-1, 1]) {
        const a0 = s * GATE_W / 2, a1 = s * half, [cx, cy] = along((a0 + a1) / 2, fr);
        b.add('cwall', cx, cy, { len: Math.abs(a1 - a0), ax: hz ? 'x' : 'y', h: bh, t: bt, col: b.S.wallCol, out: o, mer: 1 });
        b.block(hz ? rect(g.x + Math.min(a0, a1), cy - bt / 2, g.x + Math.max(a0, a1), cy + bt / 2) : rect(cx - bt / 2, g.y + Math.min(a0, a1), cx + bt / 2, g.y + Math.max(a0, a1)));
      }
      const [ax, ay] = along(0, fr);
      b.add('cgate', ax, ay, { r, t: bt, h: bh, w: GATE_W, open: GATE_OPEN, col: b.S.wallCol, big: 2 });
      if (hz) { b.block(rect(ax - GATE_W / 2, ay - bt / 2, ax - GATE_OPEN / 2, ay + bt / 2)); b.block(rect(ax + GATE_OPEN / 2, ay - bt / 2, ax + GATE_W / 2, ay + bt / 2)); }
      else { b.block(rect(ax - bt / 2, ay - GATE_W / 2, ax + bt / 2, ay - GATE_OPEN / 2)); b.block(rect(ax - bt / 2, ay + GATE_OPEN / 2, ax + bt / 2, ay + GATE_W / 2)); }
      const [qx, qy] = along(0, T / 2 + BARB_D / 2);
      b.ground(CG.PLAZA, hz ? rect(qx - BARB_W / 2, qy - BARB_D / 2, qx + BARB_W / 2, qy + BARB_D / 2) : rect(qx - BARB_D / 2, qy - BARB_W / 2, qx + BARB_D / 2, qy + BARB_W / 2));
    }
  }
}

/** 护城河：外沿外侧一圈水，城门处架桥；桥外接关厢的街 */
function buildMoat(b: CB, rs: R[], gates: Gate[]) {
  if (!STYLE[b.style].moat) return;
  b.tag = 'moat';
  const M = MOAT_OFF + MOAT_W / 2;
  const off = rs.map((r) => inset(r, -M));
  const edges = wallEdges(off, true);
  for (const e of edges) {
    const hw = MOAT_W / 2;
    const gs = gates.filter((g) => g.outer && (e.ax === 'h' ? (g.side === 'n' || g.side === 's') && Math.abs(g.y + (g.side === 's' ? M : -M) - e.c) < 5 && g.x > e.a && g.x < e.b
      : (g.side === 'e' || g.side === 'w') && Math.abs(g.x + (g.side === 'e' ? M : -M) - e.c) < 5 && g.y > e.a && g.y < e.b)).map((g) => e.ax === 'h' ? g.x : g.y).sort((p, q) => p - q);
    const a = e.a - hw, z = e.b + hw;
    const runs: [number, number][] = []; let s = a;
    for (const p of gs) { runs.push([s, p - 170]); s = p + 170; }
    runs.push([s, z]);
    for (const [p0, p1] of runs) {
      const r = e.ax === 'h' ? rect(p0, e.c - hw, p1, e.c + hw) : rect(e.c - hw, p0, e.c + hw, p1);
      b.ground(CG.WATER, r); b.block(r); b.water.push(r);
    }
    // 城门正对处：水照画，桥由关厢的街过水时架（street 遇水自动架桥）
    for (const p of gs) {
      const r = e.ax === 'h' ? rect(p - 170, e.c - hw, p + 170, e.c + hw) : rect(e.c - hw, p - 170, e.c + hw, p + 170);
      b.ground(CG.WATER, r); b.water.push(r);
    }
  }
}

/** 关厢：出城门、过桥，沿官道一条街，两旁是铺面和民居 */
function suburbs(b: CB, gates: Gate[]) {
  b.tag = 'suburb';
  for (const g of gates) {
    if (!g.outer) continue;
    const hz = g.side === 'n' || g.side === 's', o = g.side === 's' || g.side === 'e' ? 1 : -1;
    const isle = !!b.shore;
    const d0 = b.S.T / 2 + (g.barb ? BARB_D + 160 : 60), d1 = isle ? 1300 * (g.main ? 1 : 0.7) : MOAT_OFF + MOAT_W + SUBURB * (g.main ? 1 : 0.7);
    const P = (a: number, c: number): [number, number] => hz ? [g.x + a, g.y + o * c] : [g.x + o * c, g.y + a];
    const [sx, sy] = P(0, d0), [ex, ey] = P(0, d1);
    b.street(sx, sy, ex, ey, 300, CG.DIRT);
    // 两侧房子：面向街
    for (const s of [-1, 1]) {
      let c = isle ? d0 + 120 : MOAT_OFF + MOAT_W + 140;
      while (c < d1 - 300) {
        const w = b.R(360, 560), dep = b.R(420, 560), [x, y] = P(s * (150 + 20), c + w / 2);
        // 面朝街：街在 s 的反方向
        const r: Rot = hz ? (s < 0 ? 1 : 3) : (s < 0 ? 0 : 2);
        const fp = hz ? rect(x - (s < 0 ? dep : 0), y - w / 2, x + (s < 0 ? 0 : dep), y + w / 2) : rect(x - w / 2, y - (s < 0 ? dep : 0), x + w / 2, y + (s < 0 ? 0 : dep));
        // 锚点在临街的正面中点
        if (b.dry(fp, 20) && b.free(fp)) {
          if (b.rnd() < 0.55) shop(b, x, y, w, dep, r, false);
          else { b.add('chouse', x, y, { w: w * 0.9, d: dep * 0.6, h: 120, r, n: 1 }); b.block(fp); b.houses++; }
          b.reserved.push(fp);
        }
        c += w + b.R(20, 140);
      }
    }
    // 城门外的几棵树
    for (let k = 0; k < 3; k++) { const [x, y] = P(b.R(-1, 1) * 700, b.R(MOAT_OFF + MOAT_W + 200, d1)); if (Math.abs(hz ? x - g.x : y - g.y) > 420) b.tree(x, y, b.pick(['willow', 'broad', 'willow'])); }
  }
}

/** 港城：沿岸找几处离城近的水边，伸出栈桥，靠着船 */
function docks(b: CB) {
  if (!STYLE[b.style].docks) return;
  b.tag = 'dock';
  const placed: [number, number][] = [];
  const hx = Math.max(...b.rs.map((r) => Math.max(-r.x0, r.x1))), hy = Math.max(...b.rs.map((r) => Math.max(-r.y0, r.y1)));
  // P10 收尾：先沿 72 个方向各找一处岸，再按离城远近排——码头先落在离城最近的岸上（原来按方向顺序挑，常挑到岛另一头几千步外）
  const cand: { px: number; py: number; dx: number; dy: number; t: number }[] = [];
  for (let a = 0; a < 72; a++) {
    const ang = a / 72 * Math.PI * 2, dx = Math.cos(ang), dy = Math.sin(ang);
    // 从城墙外一点往外走，找第一处水
    const t0 = b.shore ? 800 : Math.min(hx / Math.max(0.01, Math.abs(dx)), hy / Math.max(0.01, Math.abs(dy))) + 200;
    let px = 0, py = 0, found = false, tt = t0;
    for (let t = t0; t < t0 + (b.shore ? 12000 : 4000); t += 100) {
      const x = dx * t, y = dy * t;
      if (b.natWet(x, y)) { found = true; tt = t; break; }
      px = x; py = y;
    }
    if (found) cand.push({ px, py, dx, dy, t: tt });
  }
  cand.sort((p, q) => p.t - q.t);
  for (const { px, py, dx, dy } of cand) {
    if (placed.length >= 9 || placed.some(([x, y]) => Math.hypot(x - px, y - py) < 2600)) continue;
    // 栈桥沿离中心最近的轴向伸进水里
    const ax = Math.abs(dx) > Math.abs(dy), sx = ax ? Math.sign(dx) : 0, sy = ax ? 0 : Math.sign(dy);
    let len = 0;
    for (let t = 100; t < 900; t += 100) if (b.natWet(px + sx * t, py + sy * t)) len = t; else if (len) break;
    if (len < 300) continue;
    placed.push([px, py]); b.dockPts.push({ x: px, y: py, sx, sy });
    const r: Rot = sy > 0 ? 0 : sx > 0 ? 1 : sy < 0 ? 2 : 3;
    b.add('cpier', px, py, { len: len + 120, w: 130, r });
    const ex = px + sx * len * 0.8, ey = py + sy * len * 0.8;
    b.add('ckit', ex - sy * 160, ey + sx * 160, { items: [['boat', 0, 0, ax ? 0 : 1]] });
    if (b.rnd() < 0.6) b.add('ckit', ex + sy * 170, ey - sx * 170, { items: [['boat', 0, 0, ax ? 0 : 1]] });
    b.add('ckit', px - sx * 160, py - sy * 160, { items: [['crate', 40, 0, 0], ['barrel', -60, 20, 0], ['cart', 0, 120, ax ? 1 : 0]] });
    b.light(px + sx * len, py + sy * len, 50, 120);
    b.segs.push({ x0: px - sx * 200, y0: py - sy * 200, x1: px + sx * (len - 40), y1: py + sy * (len - 40) });
    // 头三座码头岸上一排货栈（仓房）；第一座码头的岸角起一座灯塔（夜里塔顶通亮）
    const k = placed.length - 1;
    if (k < 3) {
      const wx = px - sx * 520 + sy * 420, wy = py - sy * 520 - sx * 420, w = 520, d = 260;
      const fp = rect(wx - (ax ? d : w) / 2 - 20, wy - (ax ? w : d) / 2 - 20, wx + (ax ? d : w) / 2 + 20, wy + (ax ? w : d) / 2 + 20);
      if (b.dry(fp, 20) && b.free(fp) && !b.blk.some((q) => hit(q, fp)) && !b.onStreet(fp)) {
        b.add('chouse', wx, wy + (ax ? 0 : d / 2), { w, d, h: 130, r: ax ? (sx > 0 ? 1 : 3) : (sy > 0 ? 0 : 2), gran: 1, n: 1 });
        b.block(fp); b.reserved.push(fp); b.houses++;
      }
    }
    if (k === 0) {
      const lx = px + sy * 380, ly = py - sx * 380, fp = rect(lx - 130, ly - 260, lx + 130, ly + 20);
      if (!b.natWet(lx, ly) && b.free(fp) && !b.blk.some((q) => hit(q, fp)) && !b.onStreet(fp)) {
        b.add('cpagoda', lx, ly, { w: 150, h: 720, n: 4, pal: { roof: '#3e4a52', wall: '#e6e0d0', pillar: '#7a3a2a', accent: '#c8a03a' } });
        b.block(fp); b.reserved.push(fp);
        b.light(lx, ly - 120, 90, 700);
      }
    }
  }
}


/**
 * P10 收尾：港区。码头离城墙远（岸在几千步外）时，城墙和码头之间原来是一大片空草地：
 * 从朝着码头那一侧的城门修一条土路过去（先出城门直走，再拐向码头，两段都在墙线外），
 * 路两边起一排排临街的屋子（离码头近的多是货栈），码头边再聚一小片渔村（矮屋、货箱木桶、几棵树）。
 */
function harbor(b: CB, gates: Gate[]) {
  if (!b.dockPts.length) return;
  b.tag = 'harbor';
  const far = Math.max(...b.rs.flatMap((r) => [Math.hypot(r.x0, r.y0), Math.hypot(r.x1, r.y1), Math.hypot(r.x0, r.y1), Math.hypot(r.x1, r.y0)]));
  const W = 240;
  // 一段轴向的路两边：临街的屋子，正面朝路；near 是码头的位置（离它近的屋子多做货栈）
  const row = (x0: number, y0: number, x1: number, y1: number, near: [number, number]) => {
    const hz = Math.abs(y1 - y0) < 1, L = hz ? Math.abs(x1 - x0) : Math.abs(y1 - y0), dir = hz ? Math.sign(x1 - x0) : Math.sign(y1 - y0);
    for (const s of [-1, 1]) {
      let c = 160;
      while (c < L - 160) {
        const ww = b.R(240, 420), dep = b.R(280, 420), m = c + ww / 2;
        const x = hz ? x0 + dir * m : x0 + s * (W / 2 + 20), y = hz ? y0 + s * (W / 2 + 20) : y0 + dir * m;
        const r: Rot = hz ? (s < 0 ? 0 : 2) : (s < 0 ? 1 : 3);
        const fp = hz ? rect(x - ww / 2, y - (s < 0 ? dep : 0), x + ww / 2, y + (s < 0 ? 0 : dep)) : rect(x - (s < 0 ? dep : 0), y - ww / 2, x + (s < 0 ? 0 : dep), y + ww / 2);
        if (Math.hypot(x, y) < far * 1.25 && b.rnd() < 0.85 && b.dry(fp, 30) && b.free(fp) && !b.blk.some((q) => hit(q, fp, 20)) && !b.onStreet(fp, 125)) {
          const gran = Math.hypot(x - near[0], y - near[1]) < 1500 && b.rnd() < 0.5;
          b.add('chouse', x, y, { w: ww * 0.9, d: dep * 0.6, h: gran ? 130 : 105, r, n: 1, ...(gran ? { gran: 1 } : {}) });
          b.block(fp); b.reserved.push(fp); b.houses++;
          if (b.rnd() < 0.3) b.light(x, y - 20, 30, 70);
        }
        c += ww + b.R(30, 160);
      }
    }
  };
  for (const D of b.dockPts) {
    // 码头本来就挨着城墙（岸线收墙的城）：不必修路
    const toWall = b.shore ? Math.min(...b.shore.poly.map(([x, y]) => Math.hypot(x - D.x, y - D.y))) : 0;
    if (toWall < 1500) continue;
    // 挑城门：门外直走能到码头那一排（门外方向上码头至少在 600 以外），两段路加起来最短
    let best: { legs: [number, number, number, number][]; len: number } | null = null;
    for (const g of gates) {
      if (!g.outer) continue;
      const hz = g.side === 'n' || g.side === 's', o = g.side === 's' || g.side === 'e' ? 1 : -1, d0 = b.S.T / 2 + (g.barb ? BARB_D + 160 : 60);
      const ex = D.x - D.sx * 120, ey = D.y - D.sy * 120;   // 路修到岸上，离栈桥头一点
      if (hz ? o * (ey - g.y) < 600 : o * (ex - g.x) < 600) continue;
      const legs: [number, number, number, number][] = hz ? [[g.x, g.y + o * d0, g.x, ey], [g.x, ey, ex, ey]] : [[g.x + o * d0, g.y, ex, g.y], [ex, g.y, ex, ey]];
      const len = legs.reduce((a, [x0, y0, x1, y1]) => a + Math.abs(x1 - x0) + Math.abs(y1 - y0), 0);
      // 路上水多（隔着海湾）就不修
      let wet = 0, n = 0;
      for (const [x0, y0, x1, y1] of legs) for (let k = 0, L = Math.abs(x1 - x0) + Math.abs(y1 - y0); k <= L; k += 150) { n++; if (b.natWet(x0 + Math.sign(x1 - x0) * k, y0 + Math.sign(y1 - y0) * k)) wet++; }
      if (wet > n * 0.12 || len > 10000) continue;
      if (!best || len < best.len) best = { legs, len };
    }
    // 两段路先都修好，再沿路起屋（免得头一段的屋子压在第二段路上）
    if (best) { const legs = best.legs.filter(([x0, y0, x1, y1]) => Math.abs(x1 - x0) + Math.abs(y1 - y0) >= 60); for (const [x0, y0, x1, y1] of legs) b.street(x0, y0, x1, y1, W, CG.DIRT); for (const [x0, y0, x1, y1] of legs) row(x0, y0, x1, y1, [D.x, D.y]); }
    // 码头边的渔村：几间矮屋、晒网的木架换成货箱木桶，几棵树
    for (let k = 0, made = 0; k < 40 && made < 7; k++) {
      const a = b.rnd() * Math.PI * 2, rr = b.R(500, 1300), x = D.x - D.sx * 400 + Math.cos(a) * rr, y = D.y - D.sy * 400 + Math.sin(a) * rr;
      const w = b.R(220, 320), d = b.R(160, 220), fp = rect(x - w / 2 - 40, y - d - 40, x + w / 2 + 40, y + 40);
      if (Math.hypot(x, y) > far * 1.3 || !b.dry(fp, 40) || !b.free(fp) || b.blk.some((q) => hit(q, fp, 30)) || b.onStreet(fp)) continue;
      const r: Rot = Math.abs(D.sx) > 0 ? (D.sx > 0 ? 1 : 3) : (D.sy > 0 ? 0 : 2);
      b.add('chouse', x, y, { w, d, h: 90, r, n: 1 }); b.block(fp); b.reserved.push(fp); b.houses++; made++;
      if (b.rnd() < 0.6) { const kx = x + b.R(-160, 160), ky = y + 90; const q = rect(kx - 60, ky - 40, kx + 60, ky + 40); if (b.dry(q) && b.free(q)) { b.add('ckit', kx, ky, { items: [['crate', 0, 0, 0], ['barrel', 50, 20, 0]] }); b.reserved.push(q); } }
      if (b.rnd() < 0.5) b.tree(x + b.R(-260, 260), y - d - b.R(60, 200), b.pick(['palm', 'broad', 'pine']), b.R(0.5, 0.7), true);
      if (b.rnd() < 0.5) b.light(x, y - 30, 30, 70);
    }
  }
}

// ======================================================== 海岛城：城墙顺着岸线
/** 点在多边形里（偶奇规则） */
function inPoly(P: [number, number][], x: number, y: number) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/**
 * 海岛城不套方城：四条边每 500 取一点，从边往里找到离水 500 的地方当墙线（最多收进去半边的 45%），
 * 门口那一截拉平、城门跟着挪到墙线上。墙线以外、方框以内的地先占住（不排街坊），排完城里再放开给关厢和岸边。
 */
function shoreOutline(b: CB, gates: Gate[]) {
  const r = b.rs[0], hx = (r.x1 - r.x0) / 2, hy = (r.y1 - r.y0) / 2, GAP = 500;
  type Side = 's' | 'e' | 'n' | 'w';
  const horiz = (s: Side) => s === 's' || s === 'n';
  const outOf = (s: Side) => (s === 's' || s === 'e' ? 1 : -1);
  const edgeOf = (s: Side) => (s === 's' ? r.y1 : s === 'n' ? r.y0 : s === 'e' ? r.x1 : r.x0);
  // P10 返工：岛大、岸离方框远（观星城这类）时墙线一直贴着方框，四角方方正正。四角改成半径 RC 的圆角：
  // 每条边只走到圆弧的 45° 那一点（clampT），相邻两边在那里接上，墙线不自交；门在边的中段，不受影响
  const RC = Math.min(hx, hy) * 0.42, cut = RC * (1 - Math.SQRT1_2);
  const corner = (s: Side, t: number) => {
    const mid = horiz(s) ? (r.x0 + r.x1) / 2 : (r.y0 + r.y1) / 2, half = horiz(s) ? hx : hy, d = Math.abs(t - mid) - (half - RC);
    return d > 0 ? RC - Math.sqrt(Math.max(0, RC * RC - d * d)) : 0;
  };
  const clampT = (s: Side, t: number) => horiz(s) ? Math.max(r.x0 + cut, Math.min(r.x1 - cut, t)) : Math.max(r.y0 + cut, Math.min(r.y1 - cut, t));
  const line = (s: Side, t: number) => {
    const out = outOf(s), edge0 = edgeOf(s), inner = edge0 - out * (horiz(s) ? hy : hx) * 0.45;
    const edge = edge0 - out * corner(s, t);
    for (let k = 0; k < 20000; k += 100) {
      const c = inner + out * k;
      if (out * (c - edge) > 600) return edge;
      const x = horiz(s) ? t : c, y = horiz(s) ? c : t;
      if (b.natWet(x, y)) { const w = c - out * GAP; return out > 0 ? Math.max(inner, Math.min(edge, w)) : Math.min(inner, Math.max(edge, w)); }
    }
    return edge;
  };
  const poly: [number, number][] = [], spans: { s: Side; a: number; b: number; c: number }[] = [];
  const order: [Side, number, number][] = [['s', r.x0, r.x1], ['e', r.y1, r.y0], ['n', r.x1, r.x0], ['w', r.y0, r.y1]];
  const sideRuns: { s: Side; pts: [number, number][] }[] = [];
  for (const [s, a0, a1] of order) {
    const dir = Math.sign(a1 - a0), out = outOf(s);
    // 这条边上的门：门口一截拉平到最靠里的那一点
    const gs = gates.filter((g) => g.side === s);
    const gl = gs.map((g) => {
      const t = horiz(s) ? g.x : g.y, cs = [t - GATE_W / 2, t, t + GATE_W / 2].map((q) => line(s, q));
      const c = out > 0 ? Math.min(...cs) : Math.max(...cs);
      if (horiz(s)) g.y = c; else g.x = c;
      spans.push({ s, a: t - GATE_W / 2, b: t + GATE_W / 2, c });
      return { t, c };
    });
    const ts: number[] = [];
    for (let t = a0; dir * (a1 - t) > 1; t += dir * 500) ts.push(t);
    ts.push(a1);
    for (let d = 200; d < RC; d += 200) ts.push(a0 + dir * d, a1 - dir * d);   // 圆角那一段取密一点，弧线才圆
    for (const g of gl) ts.push(g.t - GATE_W / 2, g.t + GATE_W / 2);
    ts.sort((p, q) => dir * (p - q));
    const pts: [number, number][] = [];
    for (const t0 of ts) {
      const t = clampT(s, t0);
      const g = gl.find((q) => Math.abs(t - q.t) <= GATE_W / 2 + 0.5);
      const c = g ? g.c : line(s, t);
      const p: [number, number] = horiz(s) ? [t, c] : [c, t];
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 1) pts.push(p);
    }
    sideRuns.push({ s, pts });
    poly.push(...pts);
  }
  b.shore = { poly, spans, runs: sideRuns, rc: RC };
  // 墙线以外、方框以内：先占住
  const C = 300;
  for (let y = r.y0; y < r.y1; y += C) {
    let a: number | null = null;
    for (let x = r.x0; x <= r.x1; x += C) {
      const out = x < r.x1 && !inPoly(poly, x + C / 2, y + C / 2);
      if (out && a === null) a = x;
      if ((!out || x >= r.x1) && a !== null) { const q = rect(a, y, x, Math.min(r.y1, y + C)); b.reserved.push(q); b.hard.push(q); b.shoreOut.push(q); a = null; }
    }
  }
}

/** 按 shoreOutline 的墙线砌墙：横平竖直的段用 cwall，斜段用 cwallp；拐角起角楼 */
function shoreWalls(b: CB) {
  const sh = b.shore!, { T, H, wallCol } = b.S;
  const inGate = (x: number, y: number) => sh.spans.some((g) => (g.s === 's' || g.s === 'n' ? Math.abs(y - g.c) < 2 && x > g.a + 1 && x < g.b - 1 : Math.abs(x - g.c) < 2 && y > g.a + 1 && y < g.b - 1));
  const seg = (x0: number, y0: number, x1: number, y1: number) => {
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (L < 20 || inGate((x0 + x1) / 2, (y0 + y1) / 2)) return;
    const n = Math.max(1, Math.ceil(L / 1100));
    for (let i = 0; i < n; i++) {
      const ax = x0 + (x1 - x0) * i / n, ay = y0 + (y1 - y0) * i / n, bx = x0 + (x1 - x0) * (i + 1) / n, by = y0 + (y1 - y0) * (i + 1) / n;
      const mx = (ax + bx) / 2, my = (ay + by) / 2, l = L / n + T;
      if (b.wet(mx, my)) continue;
      if (Math.abs(ay - by) < 1) { b.add('cwall', mx, my, { len: l, ax: 'x', h: H, t: T, col: wallCol, out: my > 0 ? 1 : -1, mer: 1 }); b.block(rect(mx - l / 2, my - T / 2, mx + l / 2, my + T / 2)); continue; }
      if (Math.abs(ax - bx) < 1) { b.add('cwall', mx, my, { len: l, ax: 'y', h: H, t: T, col: wallCol, out: mx > 0 ? 1 : -1, mer: 1 }); b.block(rect(mx - T / 2, my - l / 2, mx + T / 2, my + l / 2)); continue; }
      const ang = Math.atan2(by - ay, bx - ax), px = -Math.sin(ang), py = Math.cos(ang);
      b.add('cwallp', mx, my, { len: l, ang, h: H, t: T, col: wallCol, out: px * mx + py * my > 0 ? 1 : -1, mer: 1 });
      // 斜墙的碰撞：沿墙一串方块
      for (let k = 0; k <= l; k += T * 0.6) { const cx = ax + (bx - ax) * (k / l), cy = ay + (by - ay) * (k / l); b.block(rect(cx - T * 0.5, cy - T * 0.5, cx + T * 0.5, cy + T * 0.5)); }
    }
  };
  const runs = sh.runs;
  for (let i = 0; i < runs.length; i++) {
    const P = runs[i].pts;
    for (let k = 0; k + 1 < P.length; k++) seg(P[k][0], P[k][1], P[k + 1][0], P[k + 1][1]);
    // 拐角：这条边的末点接下一条边的首点，角楼骑在两头
    const a = P[P.length - 1], c = runs[(i + 1) % runs.length].pts[0];
    seg(a[0], a[1], c[0], c[1]);
    for (const [x, y] of [a, c]) {
      if (b.wet(x, y)) continue;
      b.add('ctower', x, y, { t: T, h: H, col: wallCol, s: 1 });
      b.block(rect(x - T * 0.75, y - T * 0.75, x + T * 0.75, y + T * 0.75));
      b.light(x, y - 60, 60);
    }
  }
}

/** 海岛城墙外到岸边：滩上礁石、树丛，免得整地台地光秃秃一片 */
function shoreDress(b: CB) {
  const sh = b.shore; if (!sh) return;
  b.tag = 'shore';
  const e = b.extent; let n = 0;
  for (let y = e.y0 + 200; y < e.y1; y += 360) for (let x = e.x0 + 200; x < e.x1; x += 360) {
    const jx = x + b.R(-120, 120), jy = y + b.R(-120, 120);
    if (inPoly(sh.poly, jx, jy) || b.natWet(jx, jy)) continue;
    if (sh.poly.some(([px, py]) => Math.hypot(px - jx, py - jy) < 420)) continue;
    const q = rect(jx - 110, jy - 110, jx + 110, jy + 110);
    if (!b.free(q) || b.blk.some((k) => hit(k, q)) || b.onStreet(q, 130)) continue;
    // 离水近：礁石、滩涂；离水远：松、阔叶树丛
    const nearSea = b.natWet(jx + 450, jy) || b.natWet(jx - 450, jy) || b.natWet(jx, jy + 450) || b.natWet(jx, jy - 450);
    const t = b.rnd();
    if (nearSea && t < 0.35) { b.add('ckit', jx, jy, { items: [['rock', 0, 0, Math.floor(b.rnd() * 4)], ['rock', b.R(-80, 80), b.R(-60, 60), 1]] }); b.block(rect(jx - 60, jy - 50, jx + 60, jy + 50)); n++; }
    else if (!nearSea && t < 0.42) { b.tree(jx, jy, b.pick(['pine', 'broad', 'pine', 'willow']), b.R(0.5, 0.7), true); n++; }
    if (n > 160) return;
  }
}

/** 牌楼：主城门进来的干道上、离城心约一半处各立一座（远看高出两边民居一截，夜里檐下挂灯） */
function paifangs(b: CB, gates: Gate[]) {
  const NAMES = ['崇文', '德化', '宣仁', '昭德', '安仁', '利民', '永康', '太平', '承恩', '迎祥', '聚宝', '文明', '兴贤', '敦义'];
  let k = strHash(b.loc.id) % NAMES.length;
  for (const g of gates) {
    if (!g.main || !g.outer) continue;
    const hz = g.side === 'n' || g.side === 's';
    const x = hz ? g.x : g.x * 0.5, y = hz ? g.y * 0.5 : g.y, w = b.S.ave + 80;
    if (b.wet(x, y)) continue;
    const span = hz ? rect(x - w / 2 - 30, y - 40, x + w / 2 + 30, y + 40) : rect(x - 40, y - w / 2 - 30, x + 40, y + w / 2 + 30);
    // 跨在街上：两头的柱脚不能压房子
    const feet = hz ? [rect(x - w / 2 - 30, y - 30, x - w / 2 + 30, y + 30), rect(x + w / 2 - 30, y - 30, x + w / 2 + 30, y + 30)]
      : [rect(x - 30, y - w / 2 - 30, x + 30, y - w / 2 + 30), rect(x - 30, y + w / 2 - 30, x + 30, y + w / 2 + 30)];
    if (feet.some((f) => b.blk.some((q) => hit(q, f)))) continue;
    void span;
    b.add('cpaifang', x, y, { w, h: 320, r: hz ? 0 : 1, name: NAMES[k++ % NAMES.length], stone: b.style === 'jin' || b.style === 'frontier' ? 1 : 0 });
    for (const f of feet) b.block(f);
    for (const s of [-1, 1]) b.light(hz ? x + s * w * 0.3 : x, hz ? y : y + s * w * 0.3, 30, 230);
  }
}

// ======================================================== 街坊与院落
/** 铺面（前店后宅）：锚点是临街正面中点，r 是朝向 */
function shop(b: CB, x: number, y: number, w: number, d: number, r: Rot, ave: boolean) {
  const awn = b.pick(['#c8a058', '#d8c8a0', '#b8603a', '#5a7a8a', '#d0b070', '#a8432f', '#e0d4b0']);
  const wl = b.wealth(x, y);
  const pc = b.add('cshop', x, y, { w, d, r, two: b.rnd() < (ave ? 0.35 + wl * 0.35 : 0.15 + wl * 0.25) ? 1 : 0, awn, ban: b.rnd() < 0.7 ? b.pick(['#a8432f', '#2a4a6a', '#c89a3a', '#3a5a3a', '#f0e8d0']) : '', goods: Math.floor(b.rnd() * 5), n: 2, wl: Math.round(wl * 10) / 10, name: b.shopName() });
  const [fx, fy] = FACE[r];
  // 碰撞：屋身（凉棚下能走）
  const dd = d - 70;
  const fp = r === 0 ? rect(x - w / 2 + 8, y - d, x + w / 2 - 8, y - 70) : r === 2 ? rect(x - w / 2 + 8, y + 70, x + w / 2 - 8, y + d)
    : r === 1 ? rect(x - d, y - w / 2 + 8, x - 70, y + w / 2 - 8) : rect(x + 70, y - w / 2 + 8, x + d, y + w / 2 - 8);
  void dd;
  b.block(fp);
  b.shops.push({ pc, x, y, r, ave });
  // 临干道的铺子门口：停着的车、拴着的马驴、轿子、货堆（贴着门面，不挡街心）
  if (ave && b.rnd() < 0.22 && b.S.ave >= 340) {
    const k = b.pick(['cart', 'horse', 'donkey', 'sedan', 'barrel', 'crate', 'donkey', 'cart']);
    const along = b.R(-0.3, 0.3) * w, out = Math.min(k === 'cart' ? 120 : 95, b.S.ave / 2 - 80);
    const kx = x + fx * out - fy * along, ky = y + fy * out + fx * along;
    const rot = r === 0 || r === 2 ? (b.rnd() < 0.5 ? 0 : 2) : (b.rnd() < 0.5 ? 1 : 3);
    if (!b.treePts.some(([tx, ty]) => Math.abs(tx - kx) < 160 && ty - ky > -120 && ty - ky < 80)) {   // 门口有树就不停车马
      // 车、马顺着街摆
      b.add('ckit', kx, ky, { items: [[k, 0, 0, rot]] });
      const hw = (k === 'cart' || k === 'sedan' || k === 'horse' || k === 'donkey') ? 75 : 30, hd = 30;
      const pr = r === 0 || r === 2 ? rect(kx - hw, ky - hd, kx + hw, ky + hd) : rect(kx - hd, ky - hw, kx + hd, ky + hw);
      b.block(pr); b.props.push(pr);
    }
  }
  // 檐下两盏灯笼（夜里神识范围内有暖光）
  for (const s of [-1, 1]) b.light(x + fx * 30 + s * fy * w * 0.36, y + fy * 30 + s * fx * w * 0.36, 26, 100);
  b.houses += 2; b.courts++;
  if (b.rnd() < 0.06) b.smoke.push({ x: x - fx * d * 0.7, y: y - fy * d * 0.7 - 200 });
  return pc;
}

type CourtKind = 'one' | 'two' | 'big';
/** 一座院落：锚点是南面（正面）中点，院子向北伸 d */
/** 敞门院落的碰撞：院墙（门口留缺）、各座房子各一块，院子当中能走。几何跟 cityPieces.ts 的 court() 一一对应 */
function courtBlocks(b: CB, x: number, yF: number, w: number, d: number, k: CourtKind, gx: number) {
  if (k === 'big') {
    const wl = Math.round(w * 0.6);
    courtBlocks(b, x - w / 2 + wl / 2, yF, wl, d, 'two', gx);
    courtBlocks(b, x + w / 2 - (w - wl) / 2, yF, w - wl, d, 'one', 1);
    return;
  }
  const ins = 8, wt = 22, t = 30;
  const x0 = -w / 2 + ins, x1 = w / 2 - ins, zF = -ins, zB = -d + ins;
  const gW = 84, gX = gx * (w / 2 - ins - 70);
  const R_ = (a: number, za: number, c: number, zc: number) => b.block(rect(x + Math.min(a, c), yF + Math.min(za, zc), x + Math.max(a, c), yF + Math.max(za, zc)));
  // 院墙
  R_(x0 - t / 2, zF - t / 2, gX - gW / 2, zF + t / 2); R_(gX + gW / 2, zF - t / 2, x1 + t / 2, zF + t / 2);
  R_(x0 - t / 2, zB - t / 2, x1 + t / 2, zB + t / 2);
  R_(x0 - t / 2, zB, x0 + t / 2, zF); R_(x1 - t / 2, zB, x1 + t / 2, zF);
  // 房子：锚点是正面中点，rot 0 屋身向北（-z）、1 向西、2 向南、3 向东
  const H = (rot: number, hx: number, hz: number, len: number, dep: number) => {
    if (rot === 0) R_(hx - len / 2, hz - dep, hx + len / 2, hz);
    else if (rot === 2) R_(hx - len / 2, hz, hx + len / 2, hz + dep);
    else if (rot === 1) R_(hx - dep, hz - len / 2, hx, hz + len / 2);
    else R_(hx, hz - len / 2, hx + dep, hz + len / 2);
  };
  if (k === 'one') {
    const dm = Math.min(180, d * 0.29), wm = w - 2 * ins - 2 * wt - (w > 560 ? 90 : 20);
    H(0, 0, zB + wt / 2 + dm + 4, wm, dm);
    const L = d * 0.34, ds = Math.min(118, w * 0.21), zc = zB + wt + dm + (zF - zB - dm - wt * 2) * 0.48;
    H(1, x0 + wt / 2 + ds, zc, L, ds);
    if (w > 440) H(3, x1 - wt / 2 - ds, zc, L, ds);
    if (d > 560 && w > 480) H(2, -gx * 60, zF - wt / 2 - 96, w - 2 * ins - 2 * wt - 140, 96);
    return;
  }
  const zMid = zF - d * 0.3, dm = Math.min(190, d * 0.2), wd = w - 2 * ins - 2 * wt - 130;
  H(2, -gx * 50, zF - wt / 2 - 96, wd, 96);
  R_(x0, zMid - 12, -60, zMid + 12); R_(60, zMid - 12, x1, zMid + 12);   // 垂花门隔墙
  const zR = zB + wt / 2 + 4, dr = 110;
  H(0, 0, zR + dr, w - 2 * ins - 2 * wt - 10, dr);
  H(0, 0, zR + dr + 30 + dm, w * 0.72, dm + 18);
  const L = (zMid - (zR + dr + 30 + dm)) * 0.7, ds = Math.min(122, w * 0.18), zc = (zMid + zR + dr + 30 + dm) / 2;
  H(1, x0 + wt / 2 + ds, zc, L, ds); H(3, x1 - wt / 2 - ds, zc, L, ds);
  R_(-26, zMid - 166, 26, zMid - 114);   // 荷花缸（院心，绕得过去）
}

function court(b: CB, x0: number, x1: number, yF: number, d: number, k: CourtKind, roof?: string, inside = false, o: { open?: boolean; gx?: number; name?: string } = {}) {
  const w = x1 - x0, x = (x0 + x1) / 2;
  const fp = rect(x0 + 6, yF - d + 6, x1 - 6, yF - 6);
  // inside：宫城、皇城里的院子（整块地本来就是保留给它们的）
  if (!b.dry(fp, 30) || (!inside && !b.free(fp))) return false;
  // 水井空地：偶尔空出一格，一口井、一棵树
  if (k === 'one' && b.rnd() < 0.05) {
    b.ground(CG.PLAZA, fp);
    b.add('ckit', x, yF - d / 2, { items: [['well', 0, 0, 0], ['laundry', -w * 0.25, -d * 0.25, 0], ['barrel', w * 0.3, d * 0.2, 0]] });
    b.block(rect(x - 40, yF - d / 2 - 40, x + 40, yF - d / 2 + 40));
    b.tree(x + w * 0.28, yF - d * 0.6, b.pick(['broad', 'willow', 'pine']));
    b.spots.push({ x, y: yF - d / 2 + 90 });
    return true;
  }
  const gx = o.gx ?? (b.rnd() < 0.7 ? 1 : -1);
  const n = k === 'one' ? (w > 470 ? 4 : 3) : k === 'two' ? 6 : 9;
  const wl = inside ? 1 : b.wealth(x, yF - d / 2);
  // 敞门的院子：富户的两进院、大宅一半敞着门，能走进去；其余院子整块挡住
  const open = o.open ?? (!inside && k !== 'one' && wl > 0.5 && d >= 560 && w >= 420 && b.rnd() < 0.5);
  b.add('ccourt', x, yF, { w, d, k, gx, r: 0, n, roof: roof ?? '', wl: Math.round(wl * 10) / 10, open: open ? 1 : 0, name: o.name ?? '' });
  b.ground(CG.YARD, fp);
  if (open) {
    courtBlocks(b, x, yF, w, d, k, gx);
    b.openCourts++;
  } else b.block(fp);
  b.courts++; b.houses += n;
  if (b.rnd() < 0.3 + wl * 0.5) b.light(x + gx * (w / 2 - 78), yF + 26, 24, 110);   // 门楼灯笼
  if (b.rnd() < 0.8) b.light(x + b.R(-0.25, 0.25) * w, yF - d + 160, 30, 70);   // 正房窗光
  if (k !== 'one' && wl > 0.55) for (const s of [-1, 1]) b.light(x + s * w * 0.18, yF - d * 0.36, 24, 90);   // 大宅院里：垂花门两侧挂灯
  if (k !== 'one' && b.rnd() < 0.7) b.light(x + b.R(-0.3, 0.3) * w, yF - d * 0.45, 26, 70);   // 厢房窗光
  if (k === 'one' && b.rnd() < 0.45 + wl * 0.3) b.light(x + b.R(-0.2, 0.2) * w, yF - d * 0.5, 24, 60);   // P10 收尾：一进院院里也亮一盏（夜里远看万家灯火更密）
  if (b.rnd() < 0.08) b.smoke.push({ x: x + b.R(-0.3, 0.3) * w, y: yF - d * 0.8 });
  // 院里的树（立板树，画面上冒出墙头）
  if (k !== 'one' && b.rnd() < 0.6) b.tree(x + b.R(-0.2, 0.2) * w, yF - d * (k === 'big' ? 0.5 : 0.42), b.pick(['broad', 'peach', 'pine', 'maple']), 0.5, true);
  else if (k === 'one' && b.rnd() < 0.2 + wl * 0.2) b.tree(x + b.R(-0.15, 0.15) * w, yF - d * 0.45, b.pick(['broad', 'peach', 'plum']), 0.45, true);
  return true;
}

/** 把长度 L 分成若干段，每段在 [a, b] 之间，正好铺满 */
function split(b: CB, L: number, a: number, c: number): number[] {
  const n = Math.max(1, Math.round(L / ((a + c) / 2)));
  const ws: number[] = [];
  for (let i = 0; i < n; i++) ws.push(b.R(a, c));
  const s = L / ws.reduce((p, q) => p + q, 0);
  return ws.map((v) => v * s);
}

interface Sides { s: boolean; n: boolean; e: boolean; w: boolean; /** 街坊东、西、南边到外面街心的距离（胡同、院里的路要接到街心） */ el: number; er: number; es: number }
/**
 * 一个街坊：东西向的胡同把它分成几排，每排一溜坐北朝南的院落；临干道的一面是铺面（前店后宅）。
 * 两侧若临南北向干道，沿边一溜铺面朝外；胡同从铺面之间穿出去接干道。
 */
function fillBlock(b: CB, c: R, side: Sides) {
  b.tag = 'block';
  const S = b.S, Wa = S.alley;
  if (W_(c) < 500 || H_(c) < 450) { b.ground(CG.GARDEN, c); if (b.rnd() < 0.5) b.tree((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2, 'broad'); return; }
  // 排：从南往北
  const H = H_(c);
  const want: number[] = [];
  let acc = 0;
  const shopRow = side.s;
  while (acc < H) {
    const first = want.length === 0;
    const wl = b.wealth((c.x0 + c.x1) / 2, c.y1 - acc), tight = b.grade === 'normal' ? 0.88 - b.dense * 0.07 : 1;
    const d = (first && shopRow ? b.R(460, 540) : b.rnd() < 0.15 + wl * 0.4 ? b.R(790, 870) : b.R(500, 580)) * tight;
    want.push(d); acc += d + Wa;
  }
  // 调到正好铺满：去掉多余的、按比例伸缩
  let n = want.length;
  const fit = (k: number) => (H - (k - 1) * Wa) / want.slice(0, k).reduce((p, q) => p + q, 0);
  while (n > 1 && fit(n) < 0.86) n--;
  const s = fit(n), depths = want.slice(0, n).map((d) => d * s);
  const stripW = 500;   // 两侧临干道的铺面进深
  const xa = c.x0 + (side.w ? stripW : 0), xb = c.x1 - (side.e ? stripW : 0);
  let yF = c.y1;
  for (let i = 0; i < n; i++) {
    const d = depths[i], yB = yF - d;
    // 两侧铺面
    for (const [on, sx] of [[side.w, -1], [side.e, 1]] as [boolean, number][]) {
      if (!on || d < 300) continue;
      const ws = d > 700 ? split(b, d, 340, 460) : [d];
      let yy = yB;
      for (const w of ws) {
        const fx = sx < 0 ? c.x0 : c.x1, cy = yy + w / 2;
        const fp = rect(fx - sx * stripW, yy, fx, yy + w);
        if (b.dry(fp, 20) && b.free(fp)) { shop(b, fx, cy, w, stripW, sx < 0 ? 3 : 1, true); b.ground(CG.YARD, rect(fx - sx * stripW, yy + 10, fx - sx * 300, yy + w - 10)); }
        yy += w;
      }
    }
    if (i === 0 && shopRow) {
      // 临街一排铺面，面南
      let xx = xa;
      for (const w of split(b, xb - xa, 320, 460)) {
        const fp = rect(xx, yB, xx + w, yF);
        if (b.dry(fp, 20) && b.free(fp)) { shop(b, xx + w / 2, yF, w, d, 0, true); b.ground(CG.YARD, rect(xx + 10, yB + 10, xx + w - 10, yB + d * 0.45)); }
        xx += w;
      }
    } else {
      const two = d > 760;
      const wl = b.wealth((c.x0 + c.x1) / 2, yF - d / 2);
      let xx = xa;
      const ws: number[] = [];
      // 大宅：两进深的排里偶尔一座，宽一倍
      let rest = xb - xa;
      while (rest > 0) {
        const big = two && b.rnd() < 0.03 + wl * 0.1 && rest > 1200;
        // 穷巷：窄小的一进院挤在一起；富户：宽一些
        const tw = b.grade === 'normal' ? 0.86 - b.dense * 0.07 : 1;
        const w = big ? b.R(1050, 1400) : (two ? b.R(480, 640) : wl < 0.35 ? b.R(340, 440) : b.R(400, 560)) * tw;
        ws.push(big ? -w : w); rest -= w;
      }
      const tot = ws.reduce((p, q) => p + Math.abs(q), 0), k = (xb - xa) / tot;
      for (const w0 of ws) {
        const w = Math.abs(w0) * k, big = w0 < 0;
        if (w > 280) court(b, xx, xx + w, yF, d, big ? 'big' : two ? 'two' : 'one');
        xx += w;
      }
    }
    // 北面的胡同
    yF = yB - Wa;
    if (i < n - 1) {
      const ay = yB - Wa / 2;
      // 胡同两头接到街坊外的街心（行人的路要连上）
      b.street(c.x0 - side.el, ay, c.x1 + side.er, ay, Wa, CG.ALLEY);
      for (let k = 0; k < 2; k++) b.spots.push({ x: b.R(c.x0 + 100, c.x1 - 100), y: ay });
    }
  }
}

interface Special { at: [number, number]; min?: [number, number]; fn: (c: R, side: Sides) => void }
interface Line { p: number; w: number; t: number; canal?: boolean }

/**
 * 一片城区：给定的干道（must）之间按间距补上次街，切出街坊；特殊地块（集市、寺院、官署……）就近认领一个街坊，其余填院落。
 * region 是街坊所在的范围（已去掉城墙和顺城街）。街的两头伸到 region 外 ext 处（接顺城街的街心）。
 */
function gridFill(b: CB, region: R, vMust: Line[], hMust: Line[], specials: Special[], ext: number) {
  const S = b.S;
  const lines = (lo: number, hi: number, must: Line[], sp: number): Line[] => {
    const m = must.filter((l) => l.p > lo + 300 && l.p < hi - 300).sort((p, q) => p.p - q.p);
    const out: Line[] = [];
    let prev = lo;
    for (const l of [...m, { p: hi, w: 0, t: -1 }]) {
      const gap = l.p - prev, k = Math.round(gap / sp);
      for (let i = 1; i < k; i++) out.push({ p: Math.round((prev + gap * i / k + b.R(-0.06, 0.06) * sp) / 10) * 10, w: S.st, t: CG.ST });
      if (l.t >= 0) out.push(l);
      prev = l.p;
    }
    return out;
  };
  const vx = lines(region.x0, region.x1, vMust, S.sx), hy = lines(region.y0, region.y1, hMust, S.sy);
  // 街
  for (const l of vx) b.street(l.p, region.y0 - ext, l.p, region.y1 + ext, l.w, l.t);
  for (const l of hy) {
    if (l.canal) canal(b, region.x0, region.x1, l.p, vx, ext);
    else b.street(region.x0 - ext, l.p, region.x1 + ext, l.p, l.w, l.t);
  }
  // 街坊
  const xs = [{ p: region.x0, w: 0, t: -1 } as Line, ...vx, { p: region.x1, w: 0, t: -1 } as Line];
  const ys = [{ p: region.y0, w: 0, t: -1 } as Line, ...hy, { p: region.y1, w: 0, t: -1 } as Line];
  const cells: { r: R; side: Sides }[] = [];
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
    const r = rect(xs[i].p + xs[i].w / 2, ys[j].p + ys[j].w / 2, xs[i + 1].p - xs[i + 1].w / 2, ys[j + 1].p - ys[j + 1].w / 2);
    if (W_(r) < 200 || H_(r) < 200) continue;
    cells.push({ r, side: { w: xs[i].t === CG.AVE, e: xs[i + 1].t === CG.AVE, n: ys[j].t === CG.AVE, s: ys[j + 1].t === CG.AVE || ys[j + 1].canal === true,
      el: i === 0 ? ext : xs[i].w / 2, er: i + 1 === xs.length - 1 ? ext : xs[i + 1].w / 2, es: j + 1 === ys.length - 1 ? ext : ys[j + 1].canal ? 55 : ys[j + 1].w / 2 } });
  }
  const taken = new Set<number>();
  for (const sp of specials) {
    let bi = -1, bd = 1e18;
    cells.forEach((c, i) => {
      if (taken.has(i)) return;
      if (sp.min && (W_(c.r) < sp.min[0] || H_(c.r) < sp.min[1])) return;
      if (!b.dry(c.r, 0) || !b.free(c.r)) return;
      const d = Math.hypot((c.r.x0 + c.r.x1) / 2 - sp.at[0], (c.r.y0 + c.r.y1) / 2 - sp.at[1]);
      if (d < bd) { bd = d; bi = i; }
    });
    if (bi < 0) continue;
    taken.add(bi);
    sp.fn(cells[bi].r, cells[bi].side);
    b.reserved.push(cells[bi].r);
  }
  cells.forEach((c, i) => {
    if (taken.has(i)) return;
    // 和保留地（宫城、广场……）大半重叠的街坊整块让出
    if (b.reserved.some((q) => overlapArea(q, c.r) > area(c.r) * 0.6)) return;
    fillBlock(b, c.r, c.side);
  });
}

/** 城里的河：中间是水，两岸各一条河沿（石砌岸 + 柳树），过街处架石拱桥 */
function canal(b: CB, x0: number, x1: number, y: number, vx: Line[], ext: number) {
  b.tag = 'canal';
  const hw = 150, bank = 110;
  x0 += 140; x1 -= 140;   // 水到顺城街前为止
  const water = rect(x0, y - hw, x1, y + hw);
  b.water.push(water);
  b.ground(CG.WATER, water);
  for (const s of [-1, 1]) {
    const by = y + s * (hw + bank / 2);
    b.street(x0 - 140 - ext, by, x1 + 140 + ext, by, bank, CG.ST);
    b.add('ccurb', (x0 + x1) / 2, y + s * hw, { len: x1 - x0, ax: 'x', h: 26, t: 30 });
  }
  // 水面挡人；过街的地方架桥
  const cuts = vx.map((l) => l.p).sort((p, q) => p - q);
  let s = x0;
  for (const p of cuts) {
    b.block(rect(s, y - hw, p - 160, y + hw)); s = p + 160;
    b.add('cbridge', p, y, { len: hw * 2 + 140, w: 280, ax: 'y', rail: 1, arch: 1 });
    b.segs.push({ x0: p, y0: y - hw - bank, x1: p, y1: y + hw + bank });
  }
  b.block(rect(s, y - hw, x1, y + hw));
  // 柳树
  for (let x = x0 + 300; x < x1 - 300; x += b.R(500, 900)) {
    if (cuts.some((p) => Math.abs(p - x) < 260)) continue;
    b.tree(x, y + (b.rnd() < 0.5 ? -1 : 1) * (hw + bank + 20), 'willow', 0.6);
  }
  // 河边的船
  for (let k = 0; k < Math.floor((x1 - x0) / 2500); k++) {
    const x = b.R(x0 + 400, x1 - 400);
    if (cuts.some((p) => Math.abs(p - x) < 400)) continue;
    b.add('ckit', x, y + b.R(-40, 40), { items: [['boat', 0, 0, b.rnd() < 0.5 ? 1 : 3]] });
  }
}

// ======================================================== 特殊地块
/** 院墙一圈（gate：南面开门的宽度，0 不开），返回门的位置 */
function enclose(b: CB, r: R, h: number, col: string, cap: string, gate: number, gateSide: 's' | 'n' | 'e' | 'w' = 's', t = 40, sideGateX?: number) {
  const segs: [number, number, number, number][] = [];
  if (sideGateX !== undefined && gate === 0) { gate = 200; }
  const hz = (y: number, a: number, c: number) => segs.push([a, y, c, y]);
  const vt = (x: number, a: number, c: number) => segs.push([x, a, x, c]);
  const mx = sideGateX ?? (r.x0 + r.x1) / 2, my = (r.y0 + r.y1) / 2;
  if (gateSide === 's' && gate > 0) { hz(r.y1, r.x0, mx - gate / 2); hz(r.y1, mx + gate / 2, r.x1); } else hz(r.y1, r.x0, r.x1);
  if (gateSide === 'n' && gate > 0) { hz(r.y0, r.x0, mx - gate / 2); hz(r.y0, mx + gate / 2, r.x1); } else hz(r.y0, r.x0, r.x1);
  if (gateSide === 'w' && gate > 0) { vt(r.x0, r.y0, my - gate / 2); vt(r.x0, my + gate / 2, r.y1); } else vt(r.x0, r.y0, r.y1);
  if (gateSide === 'e' && gate > 0) { vt(r.x1, r.y0, my - gate / 2); vt(r.x1, my + gate / 2, r.y1); } else vt(r.x1, r.y0, r.y1);
  for (const [a, c, e, f] of segs) {
    const hzl = Math.abs(c - f) < 1, L = hzl ? Math.abs(e - a) : Math.abs(f - c);
    const n = Math.max(1, Math.ceil(L / 1200));
    for (let i = 0; i < n; i++) {
      const p0 = (hzl ? Math.min(a, e) : Math.min(c, f)) + L * i / n, p1 = p0 + L / n, m = (p0 + p1) / 2;
      b.add('cwall', hzl ? m : a, hzl ? c : m, { len: p1 - p0 + t, ax: hzl ? 'x' : 'y', h, t, col, cap, mer: 0 });
    }
    b.block(hzl ? rect(Math.min(a, e) - t / 2, c - t / 2, Math.max(a, e) + t / 2, c + t / 2) : rect(a - t / 2, Math.min(c, f) - t / 2, a + t / 2, Math.max(c, f) + t / 2));
  }
  return gateSide === 's' ? [mx, r.y1] : gateSide === 'n' ? [mx, r.y0] : gateSide === 'w' ? [r.x0, my] : [r.x1, my];
}

/** 殿：锚点是正面中点，殿身向北 d；碰撞块含台基 */
function hall(b: CB, x: number, yF: number, w: number, d: number, h: number, o: { tiers?: number; pal?: Record<string, string>; base?: number; r?: Rot; lit?: boolean } = {}) {
  const r = o.r ?? 0;
  b.add('chall', x, yF, { w, d, h, tiers: o.tiers ?? 1, pal: o.pal, base: o.base ?? 0, r });
  const m = w * 0.1 + 20, md = d * 0.1 + 20;
  if (r === 0) b.block(rect(x - w / 2 - m, yF - d - md, x + w / 2 + m, yF + md * 0.3));
  else if (r === 2) b.block(rect(x - w / 2 - m, yF - md * 0.3, x + w / 2 + m, yF + d + md));
  else if (r === 1) b.block(rect(x - d - md, yF - w / 2 - m, x + md * 0.3, yF + w / 2 + m));
  else b.block(rect(x - md * 0.3, yF - w / 2 - m, x + d + md, yF + w / 2 + m));
  if (o.lit !== false) { b.light(x - w * 0.25, yF - 40, 50); b.light(x + w * 0.25, yF - 40, 50); }
}

/** 门殿（山门、衙门大门、太和门）：中间一间是门洞能穿过，碰撞块分两边 */
function gateHall(b: CB, x: number, yF: number, w: number, d: number, h: number, pal: Record<string, string>, base = 0, name = '') {
  const open = 150;
  b.add('chall', x, yF, { w, d, h, tiers: 1, pal, base, r: 0, open, name });
  for (const s of [-1, 1]) b.block(rect(x + s * open / 2, yF - d - 20, x + s * (w / 2 + 30), yF + 10));
  b.light(x - w * 0.3, yF + 20, 40); b.light(x + w * 0.3, yF + 20, 40);
}

/** 集市：整块空场，一行行摊位和凉棚，北面一排铺面朝南对着空场 */
function market(b: CB, c: R, es = b.S.st / 2) {
  b.tag = 'market';
  b.ground(CG.MARKET, c);
  // 北边一排铺面
  let xx = c.x0 + 40;
  for (const w of split(b, W_(c) - 80, 380, 520)) { shop(b, xx + w / 2, c.y0 + 520, w, 500, 0, true); xx += w; }
  const inner = rect(c.x0 + 120, c.y0 + 700, c.x1 - 120, c.y1 - 120);
  // 摊位行：东西向，每行之间是过道
  const rows = Math.max(1, Math.floor(H_(inner) / 330));
  const colors = ['#c84a3a', '#3a6a8a', '#c8a03a', '#5a8a4a', '#8a4a8a', '#d8c8a0', '#b8603a'];
  for (let i = 0; i < rows; i++) {
    const y = inner.y0 + (i + 0.5) * H_(inner) / rows;
    const items: unknown[][] = [];
    for (let x = inner.x0 + 90; x < inner.x1 - 90; x += b.R(150, 230)) {
      if (Math.abs(x - (c.x0 + c.x1) / 2) < 140) continue;   // 中间留一条南北过道
      const t = b.rnd();
      const k = t < 0.62 ? 'stall' : t < 0.75 ? 'umb' : t < 0.83 ? 'goods' : t < 0.89 ? 'cart' : t < 0.94 ? 'donkey' : 'crate';
      items.push([k, x - (c.x0 + c.x1) / 2, b.R(-20, 20), b.rnd() < 0.5 ? 0 : 2, b.pick(colors)]);
      // 收官 D：摊位点导出成锚点（摊位南侧过道边，NPC 坐这里摆摊；只记坐标，不多取一个布局随机数）
      if (k === 'stall') b.anchors['mkt' + Object.keys(b.anchors).length] = { x, y: y + 82 };
    }
    b.add('ckit', (c.x0 + c.x1) / 2, y, { items });
    b.props.push(rect(inner.x0, y - 70, inner.x1, y + 70));
    b.block(rect(inner.x0 + 50, y - 55, (c.x0 + c.x1) / 2 - 140, y + 55));
    b.block(rect((c.x0 + c.x1) / 2 + 140, y - 55, inner.x1 - 50, y + 55));
    if (i < rows - 1) { const ay = y + H_(inner) / rows / 2; b.segs.push({ x0: inner.x0, y0: ay, x1: inner.x1, y1: ay }); for (let k = 0; k < 4; k++) b.spots.push({ x: b.R(inner.x0, inner.x1), y: ay }); }
    for (let k = 0; k < 3; k++) b.light(b.R(inner.x0, inner.x1), y, 40);
  }
  const mx = (c.x0 + c.x1) / 2;
  b.segs.push({ x0: mx, y0: c.y0 + 600, x1: mx, y1: c.y1 + es });
  b.add('ckit', mx + 260, c.y1 - 60, { items: [['well', 0, 0, 0], ['lamp', 120, 0, 0], ['lamp', -520, 0, 0], ['flag', -260, 10, 0, '#a8432f']] });
  b.block(rect(mx + 220, c.y1 - 100, mx + 300, c.y1 - 20));
  for (let k = 0; k < 2; k++) b.tree(c.x0 + 150 + k * (W_(c) - 300), c.y1 - 150, 'broad');
}

/** 寺院：山门、天王殿、大雄宝殿、宝塔、钟鼓亭 */
function temple(b: CB, c: R, big = false, es = b.S.st / 2) {
  b.tag = 'temple';
  const r = inset(c, 40), mx = (r.x0 + r.x1) / 2;
  b.ground(CG.TEMPLE, r);
  enclose(b, r, 150, '#b0563a', '#5a5048', 240, 's', 44);
  const pal = { roof: '#5a5650', pillar: '#8a2e24', wall: '#e8dcc4', accent: '#c89a3a' };
  gateHall(b, mx, r.y1 + 20, 360, 160, 120, pal, 0, b.pick(['大相国寺', '开元寺', '报恩寺', '慈恩寺', '兴教寺', '光孝寺', '天宁寺', '净慈寺', '护国寺', '万寿寺']));   // 山门（中间门洞能走）
  const D = H_(r);
  hall(b, mx, r.y1 - D * 0.3, 460, 200, 130, { pal });                   // 天王殿
  hall(b, mx, r.y1 - D * 0.58, big ? 720 : 600, 280, 170, { pal, tiers: 2, base: 40 });   // 大雄宝殿
  // 塔：在后院正中或一侧
  const px = W_(r) > 1500 ? mx + W_(r) * 0.3 : mx, py = W_(r) > 1500 ? r.y1 - D * 0.3 : r.y0 + D * 0.16;
  b.add('cpagoda', px, py, { w: big ? 240 : 190, h: big ? 1150 : 900, n: big ? 9 : 7, pal: { roof: '#4a4a48', wall: '#e6dcc6', pillar: '#7a3a2a', accent: '#c8a03a' } });
  b.block(rect(px - 170, py - 170 - 120, px + 170, py + 170 - 120));
  b.light(px, py - 100, 70);
  for (const s of [-1, 1]) { b.add('cpav', mx + s * W_(r) * 0.28, r.y1 - D * 0.18, { w: 150, pal }); b.block(rect(mx + s * W_(r) * 0.28 - 95, r.y1 - D * 0.18 - 190, mx + s * W_(r) * 0.28 + 95, r.y1 - D * 0.18)); }
  // 两侧厢房
  for (const s of [-1, 1]) { const x = mx + s * (W_(r) / 2 - 160); b.add('chouse', x, r.y1 - D * 0.55, { w: D * 0.32, d: 200, h: 120, r: s < 0 ? 1 : 3, n: 1 }); b.block(rect(x - 110, r.y1 - D * 0.71, x + 110, r.y1 - D * 0.39)); b.houses++; }
  b.add('ckit', mx, r.y1 - D * 0.44, { items: [['ding', 0, 0, 0]] });
  b.block(rect(mx - 60, r.y1 - D * 0.44 - 60, mx + 60, r.y1 - D * 0.44 + 40));
  b.segs.push({ x0: mx, y0: r.y1 + 40 + es, x1: mx, y1: r.y1 - D * 0.3 + 60 });
  for (let k = 0; k < 3; k++) b.tree(b.R(r.x0 + 120, r.x1 - 120), b.R(r.y0 + 120, r.y0 + D * 0.3), b.pick(['pine', 'cypress', 'pine']), 0.6);
  b.grove(rect(r.x0 + 80, r.y0 + 80, r.x1 - 80, r.y0 + D * 0.3), 14, 'cpp', [rect(px - 240, py - 400, px + 240, py + 120)]);
  for (const s of [-1, 1]) b.grove(rect(mx + s * W_(r) * 0.18 - 120, r.y1 - D * 0.3, mx + s * W_(r) * 0.18 + 120, r.y1 - 160), 4, 'c');
  b.houses += 4;
}

/** 官署：照壁、大门、大堂、二堂、两厢；门前石狮、旗杆 */
function yamen(b: CB, c: R, big = false, es = b.S.st / 2) {
  b.tag = 'yamen';
  const r = inset(c, 50), mx = (r.x0 + r.x1) / 2, D = H_(r);
  b.ground(CG.PLAZA, r);
  enclose(b, r, 150, '#9a958a', '#4a4e54', 300, 's', 44);
  const pal = { roof: '#4a5058', pillar: '#7a2a20', wall: '#e2d8c4', accent: '#b89040' };
  gateHall(b, mx, r.y1 + 20, 380, 170, 120, pal, 0, b.grade === 'normal' ? '县衙' : big ? '府衙' : '州衙');
  hall(b, mx, r.y1 - D * 0.36, big ? 640 : 540, 240, 150, { pal, base: 30 });
  hall(b, mx, r.y1 - D * 0.66, 460, 200, 130, { pal });
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
    const x = mx + s * (W_(r) / 2 - 150), y = r.y1 - D * (0.2 + k * 0.34);
    b.add('chouse', x, y, { w: D * 0.24, d: 190, h: 110, r: s < 0 ? 1 : 3, n: 1 }); b.block(rect(x - 100, y - D * 0.12, x + 100, y + D * 0.12)); b.houses++;
  }
  // 石狮、旗杆
  b.add('ckit', mx, r.y1 + 70, { items: [['lion', -170, 0, 0], ['lion', 170, 0, 0]] });
  if (b.flags.length < 22) b.flags.push({ x: mx - 250, y: r.y1 + 60, color: '#c83a2a' }, { x: mx + 250, y: r.y1 + 60, color: '#c83a2a' });
  b.segs.push({ x0: mx, y0: r.y1 + 50 + es, x1: mx, y1: r.y1 - D * 0.36 + 60 });
  b.tree(r.x0 + 150, r.y0 + 150, 'pine'); b.tree(r.x1 - 150, r.y0 + 150, 'pine');
  // 后院：一排库房、几棵老槐
  const yb = r.y0 + 40 + 150;
  b.add('chouse', mx, yb, { w: W_(r) * 0.7, d: 150, h: 110, r: 0, n: 1 }); b.block(rect(mx - W_(r) * 0.35, yb - 160, mx + W_(r) * 0.35, yb + 10)); b.houses++;
  for (const s of [-1, 1]) b.grove(rect(mx + s * W_(r) * 0.3 - 100, r.y1 - D * 0.6, mx + s * W_(r) * 0.3 + 100, r.y1 - D * 0.45), 2, 'b');
  b.houses += 3;
}

/** 仓廪：围墙里一排排长长的廒房 */
function granary(b: CB, c: R, es = b.S.st / 2) {
  b.tag = 'granary';
  const r = inset(c, 50), mx = (r.x0 + r.x1) / 2;
  b.ground(CG.DIRT, r);
  enclose(b, r, 170, '#9a958a', '#4a4e54', 280, 's', 44);
  const rows = Math.max(1, Math.floor((H_(r) - 300) / 420));
  for (let i = 0; i < rows; i++) {
    const y = r.y0 + 240 + i * (H_(r) - 300) / rows + 220;
    for (const s of [-1, 1]) {
      const w = W_(r) / 2 - 220, x = mx + s * (w / 2 + 110);
      b.add('chouse', x, y, { w, d: 220, h: 130, r: 0, gran: 1, n: 1 });
      b.block(rect(x - w / 2 - 20, y - 240, x + w / 2 + 20, y + 10)); b.houses++;
    }
  }
  b.segs.push({ x0: mx, y0: r.y1 + 50 + es, x1: mx, y1: r.y0 + 150 });
  b.add('ckit', mx + 160, r.y1 - 120, { items: [['cart', 0, 0, 0], ['donkey', 120, 20, 0], ['crate', -150, 30, 0], ['crate', -200, -20, 0]] });
}

/** 钟楼 / 鼓楼：砖台 + 重檐楼阁；砖台四面开券洞 */
function bellTower(b: CB, x: number, y: number, w: number, drum = false) {
  b.add('cbell', x, y, { w, drum: drum ? 1 : 0, name: drum ? '鼓楼' : '钟楼' });
  b.block(rect(x - w / 2, y - w, x + w / 2, y));
  b.light(x, y - w / 2, 80);
  // 钟鼓楼通亮：楼阁四面的灯（砖台上头那一层的高度）
  for (const [dx, dy] of [[0, 0.02], [-0.5, -0.5], [0.5, -0.5], [0, -1]]) b.light(x + dx * w, y + dy * w, 46, w * 0.9);
}

// ======================================================== 国都
function capitalCity(b: CB, gates: Gate[]) {
  b.tag = 'capital';
  const S = b.S, ring = S.ring, T = S.T;
  const I = cityRects('capital')[0], O = cityRects('capital')[1];
  const red = '#a8402e', yellow = '#c8a030';
  const ppal = { roof: yellow, pillar: '#a02a1a', wall: '#a8402e', accent: '#e0b040', stone: '#e8e4d8' };
  // —— 皇城：红墙黄瓦，四门
  const HC = rect(-3600, -9200, 3600, -1400);
  b.reserved.push(inset(HC, -S.st));
  b.ground(CG.BASE, HC);
  const hcGates: [number, number, Rot][] = [[0, HC.y1, 0], [0, HC.y0, 2], [HC.x1, -5000, 1], [HC.x0, -5000, 3]];
  {
    const t = 120, h = 260;
    const edges: [number, number, number, number][] = [[HC.x0, HC.y0, HC.x1, HC.y0], [HC.x0, HC.y1, HC.x1, HC.y1], [HC.x0, HC.y0, HC.x0, HC.y1], [HC.x1, HC.y0, HC.x1, HC.y1]];
    for (const [a, c, e, f] of edges) {
      const hz = Math.abs(c - f) < 1;
      const gs = hcGates.filter(([gx, gy]) => hz ? Math.abs(gy - c) < 1 : Math.abs(gx - a) < 1).map(([gx, gy]) => hz ? gx : gy);
      const lo = hz ? a : c, hi = hz ? e : f;
      const runs: [number, number][] = []; let s = lo;
      for (const p of gs.sort((p, q) => p - q)) { runs.push([s, p - 380]); s = p + 380; }
      runs.push([s, hi]);
      for (const [p0, p1] of runs) {
        const n = Math.max(1, Math.ceil((p1 - p0) / 1200));
        for (let i = 0; i < n; i++) { const q0 = p0 + (p1 - p0) * i / n, q1 = q0 + (p1 - p0) / n, m = (q0 + q1) / 2; b.add('cwall', hz ? m : a, hz ? c : m, { len: q1 - q0 + t, ax: hz ? 'x' : 'y', h, t, col: red, cap: yellow, mer: 0 }); }
        b.block(hz ? rect(p0, c - t / 2, p1, c + t / 2) : rect(a - t / 2, p0, a + t / 2, p1));
      }
    }
    for (const [gx, gy, r] of hcGates) {
      b.add('cgate', gx, gy, { r, t: 200, h: 300, w: 760, open: 240, col: red, roof: yellow, big: gy === HC.y1 ? 3 : 1, palace: 1 });
      const hz = r === 0 || r === 2;
      if (hz) { b.block(rect(gx - 380, gy - 60, gx - 120, gy + 60)); b.block(rect(gx + 120, gy - 60, gx + 380, gy + 60)); }
      else { b.block(rect(gx - 60, gy - 380, gx + 60, gy - 120)); b.block(rect(gx - 60, gy + 120, gx + 60, gy + 380)); }
    }
  }
  // —— 宫城（紫禁城）：筒子河、红墙、角楼；午门、三大殿、后三宫、御花园、东西六宫
  const GC = rect(-1400, -7800, 1400, -3200);
  {
    const moat = inset(GC, -340);
    b.ground(CG.PALACE, rect(-600, HC.y0, 600, HC.y1));   // 中轴御道
    for (const [x0, y0, x1, y1] of [[moat.x0, moat.y0, moat.x1, moat.y0 + 160], [moat.x0, moat.y1 - 160, moat.x1, moat.y1], [moat.x0, moat.y0, moat.x0 + 160, moat.y1], [moat.x1 - 160, moat.y0, moat.x1, moat.y1]] as [number, number, number, number][]) {
      const r = rect(x0, y0, x1, y1);
      b.ground(CG.WATER, r);
      // 南北两条在中轴处架桥
      if (H_(r) < 200) { b.block(rect(r.x0, r.y0, -170, r.y1)); b.block(rect(170, r.y0, r.x1, r.y1)); b.add('cbridge', 0, (r.y0 + r.y1) / 2, { len: 300, w: 300, ax: 'y', rail: 1, white: 1 }); }
      else b.block(r);
      b.water.push(r);
    }
    b.ground(CG.PALACE, GC);
    const t = 200, h = 330;
    for (const [a, c, e, f, gate] of [[GC.x0, GC.y0, GC.x1, GC.y0, 1], [GC.x0, GC.y1, GC.x1, GC.y1, 1], [GC.x0, GC.y0, GC.x0, GC.y1, 0], [GC.x1, GC.y0, GC.x1, GC.y1, 0]] as [number, number, number, number, number][]) {
      const hz = Math.abs(c - f) < 1;
      const runs: [number, number][] = gate ? [[a, -420], [420, e]] : [[hz ? a : c, hz ? e : f]];
      for (const [p0, p1] of runs) {
        const n = Math.max(1, Math.ceil((p1 - p0) / 1200));
        for (let i = 0; i < n; i++) { const q0 = p0 + (p1 - p0) * i / n, q1 = q0 + (p1 - p0) / n, m = (q0 + q1) / 2; b.add('cwall', hz ? m : a, hz ? c : m, { len: q1 - q0 + t, ax: hz ? 'x' : 'y', h, t, col: red, cap: yellow, mer: 1, out: hz ? (c < -5000 ? -1 : 1) : (a < 0 ? -1 : 1), white: 1 }); }
        b.block(hz ? rect(p0, c - t / 2, p1, c + t / 2) : rect(a - t / 2, p0, a + t / 2, p1));
      }
    }
    for (const [x, y] of [[GC.x0, GC.y0], [GC.x1, GC.y0], [GC.x0, GC.y1], [GC.x1, GC.y1]]) { b.add('ctower', x, y, { t: 200, h, col: red, roof: yellow, s: 1.1, fancy: 1 }); b.block(rect(x - 180, y - 180, x + 180, y + 180)); }
    // 午门（正面一座重檐大门楼，两翼伸出阙楼）、神武门
    b.add('cgate', 0, GC.y1, { r: 0, t, h, w: 840, open: 240, col: red, roof: yellow, big: 3, palace: 1, wings: 1 });
    b.block(rect(-420, GC.y1 - 100, -120, GC.y1 + 100)); b.block(rect(120, GC.y1 - 100, 420, GC.y1 + 100));
    for (const s of [-1, 1]) { b.add('cwall', s * 560, GC.y1 + 300, { len: 600, ax: 'y', h, t: 260, col: red, cap: yellow, mer: 0 }); b.block(rect(s * 560 - 130, GC.y1, s * 560 + 130, GC.y1 + 600)); b.add('cpav', s * 560, GC.y1 + 640, { w: 220, pal: ppal, lift: h }); }
    b.add('cgate', 0, GC.y0, { r: 2, t, h, w: 840, open: 240, col: red, roof: yellow, big: 1, palace: 1 });
    b.block(rect(-420, GC.y0 - 100, -120, GC.y0 + 100)); b.block(rect(120, GC.y0 - 100, 420, GC.y0 + 100));
    // 中轴：太和门 → 三台 → 太和殿、中和殿、保和殿 → 乾清门 → 后三宫 → 御花园
    gateHall(b, 0, -3700, 560, 220, 150, ppal, 40);
    b.add('cterrace', 0, -4300, { w: 1500, d: 1700, h: 70, tiers: 3 });
    b.block(rect(-750, -6000, 750, -4300));
    hall(b, 0, -4700, 760, 330, 210, { pal: ppal, tiers: 2, base: 210 });
    b.add('chall', 0, -5180, { w: 280, d: 280, h: 150, tiers: 1, pal: ppal, base: 210, pointed: 1 });
    hall(b, 0, -5500, 640, 280, 190, { pal: ppal, tiers: 2, base: 210 });
    hall(b, 0, -6150, 440, 180, 140, { pal: ppal, base: 30 });
    hall(b, 0, -6500, 560, 260, 180, { pal: ppal, tiers: 2, base: 60 });
    hall(b, 0, -6950, 420, 220, 160, { pal: ppal, base: 60 });
    // 御花园
    b.ground(CG.GARDEN, rect(-900, -7650, 900, -7150));
    b.add('cpav', -450, -7300, { w: 200, pal: ppal }); b.add('cpav', 450, -7300, { w: 200, pal: ppal });
    b.block(rect(-560, -7520, -340, -7300)); b.block(rect(340, -7520, 560, -7300));
    for (let k = 0; k < 8; k++) b.tree(b.R(-850, 850), b.R(-7600, -7200), b.pick(['pine', 'cypress', 'peach']), 0.5, true);
    // 东西六宫：黄瓦小院
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const x0 = s < 0 ? GC.x0 + 70 : GC.x1 - 70 - 300, y = -6100 - i * 340;
      court(b, x0, x0 + 300, y + 320, 300, 'one', yellow, true);
    }
    // 宫城前的殿庭（太和门前、午门内）
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) { const x = s * (GC.x1 - 200), y = -3500 - k * 330; b.add('chouse', x, y, { w: 300, d: 160, h: 110, r: s < 0 ? 1 : 3, roof: yellow, n: 1 }); b.block(rect(x - 90, y - 150, x + 90, y + 150)); b.houses++; }
    // 宫里的路：中轴进午门、穿太和门到三台前，从三台两侧绕到后宫、御花园，出神武门
    b.segs.push({ x0: 0, y0: -2200, x1: 0, y1: -4220 }, { x0: -900, y0: -4220, x1: 900, y1: -4220 });
    for (const s of [-1, 1]) b.segs.push({ x0: s * 900, y0: -4220, x1: s * 900, y1: -7260 });
    b.segs.push({ x0: -900, y0: -7260, x1: 900, y1: -7260 }, { x0: 0, y0: -7260, x1: 0, y1: GC.y0 - 420 });
    b.segs.push({ x0: -1000, y0: -3450, x1: 1000, y1: -3450 });
  }
  // 皇城内：端门、太庙、社稷坛、三海（北海白塔）、景山、内务府的院子
  {
    b.add('cgate', 0, -2200, { r: 0, t: 160, h: 260, w: 700, open: 240, col: red, roof: yellow, big: 1, palace: 1 });
    for (const s of [-1, 1]) { b.add('cwall', s * 550, -2200, { len: 400, ax: 'x', h: 220, t: 100, col: red, cap: yellow, mer: 0 }); b.block(rect(s > 0 ? 120 : -750, -2250, s > 0 ? 750 : -120, -2150)); }
    b.ground(CG.PALACE, rect(-500, -3200, 500, -1400));
    // 太庙（东）、社稷坛（西）
    const tm = rect(800, -3150, 3000, -1650);
    b.ground(CG.TEMPLE, tm); enclose(b, tm, 150, red, yellow, 240, 'w', 50);
    hall(b, 1950, -2250, 820, 300, 180, { pal: ppal, tiers: 2, base: 60 });
    for (let k = 0; k < 6; k++) b.tree(b.R(900, 2900), b.R(-1900, -1750), 'cypress', 0.55, true);
    const sj = rect(-3000, -3150, -800, -1650);
    b.ground(CG.TEMPLE, sj); enclose(b, sj, 150, red, yellow, 240, 'e', 50);
    b.add('caltar', -1900, -2400, { r: 360, tiers: 2, sq: 1, col: '#e8e4d8' });
    b.block(rect(-2300, -2800, -1500, -2000));
    hall(b, -1900, -1800, 420, 160, 130, { pal: ppal, r: 0 });
    // 三海：北海、中海、南海，北海里一座白塔
    const seas: [number, number, number, number][] = [[-2500, -8100, 1300, 1700], [-2550, -5900, 1100, 1700], [-2550, -4150, 1000, 800]];
    for (const [cx, cy, w, h] of seas) {
      const r = rect(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2);
      b.ground(CG.WATER, r, true); b.water.push(inset(r, 60));
      b.block(inset(r, 90));
      for (let k = 0; k < 10; k++) { const a = b.rnd() * Math.PI * 2; b.tree(cx + Math.cos(a) * (w / 2 + 80), cy + Math.sin(a) * (h / 2 + 70), b.pick(['willow', 'willow', 'broad']), 0.6, true); }
    }
    b.ground(CG.GARDEN, rect(-2800, -8500, -2300, -8000), true);
    b.add('cmound', -2550, -8200, { w: 460, d: 420, h: 90, n: 2 });
    b.add('cpagoda', -2550, -8410, { w: 200, h: 640, n: 1, white: 1, base: 90 });
    b.light(-2550, -8350, 80);
    // 景山：宫城北面的土山，山顶一亭
    b.ground(CG.GARDEN, rect(-1200, -9050, 1200, -8100));
    b.add('cmound', 0, -8300, { w: 1900, d: 760, h: 260, n: 4 });
    b.block(rect(-880, -8980, 880, -8340));
    b.add('cpav', 0, -8520, { w: 220, pal: ppal, lift: 250 });
    for (let k = 0; k < 10; k++) b.tree(b.R(-1100, 1100), b.R(-9000, -8150), b.pick(['pine', 'cypress']), 0.55, true);
    // 皇城东北、东南的院子（内务府、各监）：灰瓦院落
    // 东安门、西安门进来的东西向小街（皇城里的院子要让开）
    const lanes = [rect(1700, -5110, 3600, -4890), rect(-3600, -5110, -1740, -4890)];
    const hitsInner = (r: R) => lanes.some((q) => hit(q, r));
    const fillHC = (r: R, e0: number, e1: number) => { for (let y = r.y1; y - 640 > r.y0; y -= 640 + 120) { let x = r.x0; for (const w of split(b, W_(r), 480, 640)) { court(b, x, x + w, y, 620, 'one', undefined, !hitsInner(rect(x, y - 620, x + w, y))); x += w; } b.street(r.x0 - e0, y - 680, r.x1 + e1, y - 680, 120, CG.ALLEY); } };
    fillHC(rect(1950, -8950, 3400, -3500), 100, 0);
    fillHC(rect(-1700, -9000, -1250, -8000), 150, 200);
    b.segs.push({ x0: 0, y0: HC.y1 + 200, x1: 0, y1: -2200 });
    // 神武门出来绕过景山，出地安门
    b.segs.push({ x0: -1050, y0: GC.y0 - 420, x1: 1050, y1: GC.y0 - 420 });
    for (const s of [-1, 1]) b.segs.push({ x0: s * 1050, y0: GC.y0 - 420, x1: s * 1050, y1: HC.y0 + 130 });
    b.segs.push({ x0: -1050, y0: HC.y0 + 130, x1: 1050, y1: HC.y0 + 130 }, { x0: 0, y0: HC.y0 + 130, x1: 0, y1: HC.y0 - 200 });
    b.street(HC.x0 - 200, -5000, -1850, -5000, 200, CG.ST); b.street(HC.x1 + 200, -5000, 1850, -5000, 200, CG.ST);
    for (const s of [-1, 1]) b.segs.push({ x0: s * 1850, y0: s < 0 ? -7200 : -8950, x1: s * 1850, y1: -3250 });
  }
  // —— 皇城前：长安街（东西大街）、天街与千步廊、两侧衙署
  {
    b.street(I.x0 + T / 2 + ring / 2, -700, I.x1 - T / 2 - ring / 2, -700, S.ave, CG.AVE);
    b.reserved.push(rect(-3600, -1000, 3600, I.y1 - T / 2));
    b.ground(CG.PALACE, rect(-520, -400, 520, I.y1 - T / 2 - 20));
    b.street(0, -1300, 0, I.y1 - T / 2 - ring / 2, 480, CG.PALACE);
    for (const s of [-1, 1]) {
      b.add('chouse', s * 620, 2000, { w: 2200, d: 130, h: 110, r: s < 0 ? 1 : 3, roof: '#5a5650', n: 1, open: 1 });
      b.houses++;   // 千步廊是敞廊，能穿过
      // 衙署：每侧三座，面朝天街
      for (let i = 0; i < 3; i++) {
        const y0 = -300 + i * 800, x0 = s < 0 ? -3500 : 820, r = rect(x0, y0, x0 + 2680, y0 + 760);
        b.ground(CG.PLAZA, r);
        enclose(b, r, 140, '#9a958a', '#4a4e54', 260, s < 0 ? 'e' : 'w', 40);
        const fx = s < 0 ? r.x1 - 200 : r.x0 + 200, pal = { roof: '#4a5058', pillar: '#7a2a20', wall: '#e2d8c4', accent: '#b89040' };
        hall(b, fx + s * 700, y0 + 380, 480, 220, 140, { pal, r: s < 0 ? 1 : 3 });
        hall(b, fx + s * 1500, y0 + 380, 420, 200, 130, { pal, r: s < 0 ? 1 : 3 });
        // 两厢配房（面朝院心）
        for (const t of [-1, 1]) { const hx = fx + s * 1150, hy = y0 + 380 + t * 250; b.add('chouse', hx, hy, { w: 340, d: 120, h: 110, r: t < 0 ? 0 : 2, n: 1 }); b.block(t < 0 ? rect(hx - 170, hy - 120, hx + 170, hy) : rect(hx - 170, hy, hx + 170, hy + 120)); b.houses++; }
        b.segs.push({ x0: s * 300, y0: y0 + 380, x1: fx + s * 620, y1: y0 + 380 });
        b.houses += 4;
      }
    }
    // 天街南头：传送阵、悬赏榜
    b.add('cteleport', 0, 1650, { r: 170 }); b.doors.push({ x: 0, y: 1650, fn: 'teleport', name: FAC_NAME.teleport }); b.anchors.tp = { x: 0, y: 1900 }; b.light(0, 1650, 70, 30);
    b.add('ckit', 330, 1250, { items: [['notice', 0, 0, 0]] }); b.doors.push({ x: 330, y: 1290, fn: 'board', name: FAC_NAME.board });
    // 正阳门内、承天门前的石狮华表
    b.add('ckit', 0, -1150, { items: [['lion', -200, 0, 0], ['lion', 200, 0, 0], ['huabiao', -360, 60, 0], ['huabiao', 360, 60, 0]] });
    b.ground(CG.PALACE, rect(-1600, -1250, 1600, -900));
  }
  // —— 钟鼓楼：中轴北端
  {
    const yN = I.y0 + T / 2 + ring;   // 内城北顺城街的内沿
    const pz = rect(-900, yN + 20, 900, HC.y0 - S.st);
    b.reserved.push(pz); b.hard.push(pz);
    b.ground(CG.PLAZA, pz);
    bellTower(b, 0, -9450, 380, true);
    bellTower(b, 0, -10120, 340, false);
    b.street(-900, -9975, 900, -9975, 200, CG.ST);
    b.street(0, HC.y0 - S.st / 2, 0, pz.y1, 360, CG.AVE);
    for (const s of [-1, 1]) b.street(s * 600, pz.y1, s * 600, I.y0 + T / 2 + ring / 2, 200, CG.ST);
    b.street(-600, pz.y1 - 40, 600, pz.y1 - 40, 120, CG.ST);
    // 皇城根：皇城外一圈街，北边两段接到内城北顺城街
    const q = inset(HC, -S.st / 2);
    b.street(q.x0, q.y0, q.x1, q.y0, S.st, CG.ST); b.street(q.x0, q.y1, q.x1, q.y1, S.st, CG.ST);
    b.street(q.x0, I.y0 + T / 2 + ring / 2, q.x0, I.y1 - T / 2 - ring / 2, S.st, CG.ST); b.street(q.x1, I.y0 + T / 2 + ring / 2, q.x1, I.y1 - T / 2 - ring / 2, S.st, CG.ST);
  }
  // —— 内城：东西两片 + 北边一条
  const inn = inset(I, T / 2 + ring);
  const sp = (at: [number, number], fn: (c: R, s: Sides) => void, min?: [number, number]): Special => ({ at, fn, min });
  b.hard.push(HC);
  gridFill(b, rect(inn.x0, inn.y0, HC.x0 - S.st, inn.y1), [{ p: -5200, w: S.ave, t: CG.AVE }], [{ p: -7500, w: S.ave, t: CG.AVE }, { p: -700, w: S.ave, t: CG.AVE }],
    [sp([-7000, -4200], (c, sd) => market(b, c, sd.es), [1400, 1300]), sp([-7000, -9000], (c, sd) => temple(b, c, true, sd.es), [1400, 1400]), sp([-6800, 600], (c, sd) => yamen(b, c, true, sd.es), [1400, 1300]),
     sp([-4600, -9500], (c) => bigEstate(b, c), [1400, 1000]), sp([-8200, -2500], (c) => bigEstate(b, c), [1400, 1000])], ring / 2);
  gridFill(b, rect(HC.x1 + S.st, inn.y0, inn.x1, inn.y1), [{ p: 5200, w: S.ave, t: CG.AVE }], [{ p: -7500, w: S.ave, t: CG.AVE }, { p: -700, w: S.ave, t: CG.AVE }],
    [sp([7600, -3800], (c, sd) => granary(b, c, sd.es), [1400, 1300]), sp([7600, -1900], (c, sd) => granary(b, c, sd.es), [1400, 1300]), sp([7000, -9000], (c, sd) => temple(b, c, false, sd.es), [1400, 1400]),
     sp([7000, 600], (c, sd) => market(b, c, sd.es), [1400, 1300]), sp([4600, -6000], (c) => bigEstate(b, c), [1400, 1000]), sp([6600, -5600], (c, sd) => yamen(b, c, false, sd.es), [1400, 1300])], ring / 2);
  gridFill(b, rect(HC.x0, inn.y0, HC.x1, HC.y0 - S.st), [], [], [], S.st / 2);
  // —— 外城：中轴前门大街、东西大街；天坛（东南）、先农坛（西南）、天桥市场
  const out = rect(O.x0 + T / 2 + ring, O.y0 + T / 2 + ring, O.x1 - T / 2 - ring, O.y1 - T / 2 - ring);
  const TT = rect(2400, 4700, 6600, out.y1 - 100), XN = rect(-6600, 5200, -2400, out.y1 - 100);
  b.reserved.push(TT, XN); b.hard.push(TT, XN);
  temple_of_heaven(b, TT);
  farmAltar(b, XN);
  gridFill(b, out, [{ p: 0, w: S.ave, t: CG.AVE }, { p: -7000, w: S.ave, t: CG.AVE }, { p: 7000, w: S.ave, t: CG.AVE }], [{ p: 7000, w: S.ave, t: CG.AVE }, { p: 4400, w: 520, t: CG.WATER, canal: true }],
    [sp([-1500, 3600], (c, sd) => market(b, c, sd.es), [1300, 1000]), sp([1500, 3600], (c, sd) => market(b, c, sd.es), [1300, 1000]), sp([-10000, 9000], (c, sd) => temple(b, c, false, sd.es), [1300, 1300]), sp([10000, 9000], (c, sd) => yamen(b, c, false, sd.es), [1300, 1200])], ring / 2);
  // —— 四郊坛庙：地坛（北）、日坛（东）、月坛（西）
  for (const [x, y, col] of [[3000, -13150, '#d8c860'], [11550, -4500, '#d86040'], [-11550, -4500, '#e8e8e0']] as [number, number, string][]) {
    const r = rect(x - 580, y - 580, x + 580, y + 580);
    if (!b.dry(r, 0)) continue;   // 落在护城河上（离墙 1050 起）或天然水里就不修
    b.ground(CG.TEMPLE, r); enclose(b, r, 120, red, '#4a5a4a', 240, x < -5000 ? 'e' : x > 5000 ? 'w' : 's', 40);
    b.add('caltar', x, y, { r: 300, tiers: 2, sq: 1, col: '#e8e4d8', top: col });
    b.block(rect(x - 330, y - 330, x + 330, y + 330));
    for (let k = 0; k < 6; k++) b.tree(x + b.R(-520, 520), y + (k % 2 ? -1 : 1) * b.R(420, 540), 'cypress', 0.55, true);
    b.reserved.push(r);
  }
  void gates;
}

/** 天坛：坛墙里北边祈年殿（三层圆台 + 三重檐圆殿），南边圜丘（三层白石圆台），中间丹陛桥相连；满是柏树 */
function temple_of_heaven(b: CB, r: R) {
  b.tag = 'tiantan';
  b.ground(CG.GARDEN, r);
  enclose(b, r, 150, '#a8402e', '#3a5a6a', 300, 'w', 50);
  const mx = (r.x0 + r.x1) / 2;
  const qn = r.y0 + H_(r) * 0.28, yq = r.y1 - H_(r) * 0.24;
  b.ground(CG.ALTAR, rect(mx - 1000, qn - 900, mx + 1000, qn + 700));
  b.add('caltar', mx, qn, { r: 520, tiers: 3, col: '#eeeae0' });
  b.add('cround', mx, qn, { r: 220, h: 560, tiers: 3, base: 3 * 46 });
  b.block(rect(mx - 560, qn - 560, mx + 560, qn + 560));
  b.ground(CG.ALTAR, rect(mx - 900, yq - 900, mx + 900, yq + 900));
  b.add('caltar', mx, yq, { r: 600, tiers: 3, col: '#f0ece4' });
  b.block(rect(mx - 640, yq - 640, mx + 640, yq + 640));
  b.ground(CG.PALACE, rect(mx - 180, qn + 560, mx + 180, yq - 640));
  b.segs.push({ x0: r.x0 - 200, y0: (r.y0 + r.y1) / 2, x1: mx, y1: (r.y0 + r.y1) / 2 }, { x0: mx, y0: qn + 620, x1: mx, y1: yq - 700 });
  b.light(mx, qn - 200, 120); b.light(mx, yq, 100);
  for (let k = 0; k < 14; k++) {
    const x = b.R(r.x0 + 150, r.x1 - 150), y = b.R(r.y0 + 150, r.y1 - 150);
    if (Math.abs(x - mx) < 1150) continue;
    b.tree(x, y, 'cypress', 0.6, true);
  }
  // 满园的古柏（立体的一片片）
  const keep = [rect(mx - 1150, r.y0, mx + 1150, r.y1)];
  for (let gy = r.y0 + 100; gy < r.y1 - 100; gy += 1000) { b.grove(rect(r.x0 + 100, gy, mx - 1150, gy + 950), 26, 'ccp', keep); b.grove(rect(mx + 1150, gy, r.x1 - 100, gy + 950), 26, 'ccp', keep); }
}
/** 先农坛：方坛、殿一座，坛前一片耕田 */
function farmAltar(b: CB, r: R) {
  b.tag = 'xiannong';
  b.ground(CG.GARDEN, r);
  enclose(b, r, 140, '#a8402e', '#4a5a4a', 280, 'e', 46);
  const mx = (r.x0 + r.x1) / 2, my = (r.y0 + r.y1) / 2;
  b.ground(CG.FIELD, rect(r.x0 + 300, my + 200, r.x1 - 300, r.y1 - 300));
  b.add('caltar', mx - 800, my - 700, { r: 320, tiers: 1, sq: 1, col: '#e8e4d8' });
  b.block(rect(mx - 1150, my - 1050, mx - 450, my - 350));
  hall(b, mx + 900, my - 400, 640, 240, 150, { pal: { roof: '#4a5a6a', pillar: '#8a2e24', wall: '#e8dcc4', accent: '#c89a3a' }, tiers: 1 });
  b.segs.push({ x0: r.x1 + 200, y0: my, x1: mx, y1: my });
  for (let k = 0; k < 6; k++) b.tree(b.R(r.x0 + 150, r.x1 - 150), b.R(r.y0 + 150, my - 100), b.pick(['pine', 'cypress']), 0.55, true);
  b.grove(rect(r.x0 + 120, r.y0 + 120, r.x1 - 120, my - 120), 40, 'ccpb', [rect(mx - 1150, my - 1050, mx - 450, my - 350), rect(mx + 400, my - 800, mx + 1400, my - 100)]);
}
/** 大宅（王府、邹府这样的人家）：两三进的院子带花园 */
function bigEstate(b: CB, c: R, name = '') {
  b.tag = 'estate';
  const r = inset(c, 40);
  const gw = Math.min(W_(r) * 0.36, 1000);
  // 东边住宅（两进三进），西边花园
  const hx0 = r.x0 + gw, H = H_(r);
  const nm = name || b.pick(SURN) + '府';
  // 院墙南面留缺口：头一进院子的宅门（门楼挂府名匾、门扇敞着）开在住宅西头，缺口往西多留一截通花园
  enclose(b, r, 150, '#9a958a', '#4a4e54', 220, 's', 40, hx0 + 60);
  let y = r.y1;
  const n = Math.max(1, Math.floor(H / 980));
  for (let i = 0; i < n; i++) { court(b, hx0 + 20, r.x1 - 20, y, H / n - 20, i === 0 ? 'two' : 'big', undefined, false, i === 0 ? { open: true, gx: -1, name: nm } : { open: false }); y -= H / n; }
  const g = rect(r.x0 + 20, r.y0 + 20, hx0 - 20, r.y1 - 20);
  b.ground(CG.GARDEN, g);
  const pond = rect(g.x0 + W_(g) * 0.15, g.y0 + H_(g) * 0.3, g.x1 - W_(g) * 0.15, g.y0 + H_(g) * 0.6);
  b.ground(CG.WATER, pond, true); b.block(inset(pond, 40)); b.water.push(inset(pond, 40));
  b.add('cpav', (g.x0 + g.x1) / 2, pond.y1 + 120, { w: 170 });
  b.add('ckit', (g.x0 + g.x1) / 2, g.y0 + H_(g) * 0.2, { items: [['rock', -60, 0, 0], ['rock', 80, 30, 1], ['rock', 0, -60, 2]] });
  for (let k = 0; k < 6; k++) b.tree(b.R(g.x0 + 60, g.x1 - 60), b.R(g.y0 + 60, g.y1 - 60), b.pick(['willow', 'peach', 'pine', 'maple', 'plum']), 0.55, true);
  if (name === '邹府') { b.anchors.mofu = { x: hx0 + 98, y: r.y1 + 140 }; b.anchors.mofuIn = { x: hx0 + 98, y: r.y1 - 160 }; }
  b.reserved.push(c);
}

// ======================================================== 大城 / 一般城
function ordinaryCity(b: CB, gates: Gate[]) {
  b.tag = 'city';
  const S = b.S, R0 = b.rs[0], T = S.T, ring = S.ring;
  const inn = inset(R0, T / 2 + ring);
  const major = b.grade === 'major';
  const st = STYLE[b.style];
  // 干道：正对城门；中心十字口一片广场，钟楼居中、鼓楼在西北角
  const vMust: Line[] = [], hMust: Line[] = [];
  for (const g of gates) {
    if (g.side === 'n' || g.side === 's') { if (!vMust.some((l) => Math.abs(l.p - g.x) < 900)) vMust.push({ p: g.x, w: S.ave, t: CG.AVE }); }
    else if (!hMust.some((l) => Math.abs(l.p - g.y) < 900)) hMust.push({ p: g.y, w: S.ave, t: CG.AVE });
  }
  // 城里的河：南半城一条东西向的河道，过街处架桥
  if (major && st.canal) {
    const yc = Math.round(R0.y1 * 0.45 / 10) * 10;
    if (!hMust.some((l) => Math.abs(l.p - yc) < 1100)) hMust.push({ p: yc, w: 520, t: CG.WATER, canal: true });
  }
  const plaza = rect(-780, -640, 780, 640);
  b.reserved.push(plaza);
  b.ground(CG.PLAZA, plaza);
  // 钟楼、鼓楼分立在十字口北侧两角，四条干道照样穿过广场
  bellTower(b, 430, -200, major ? 340 : 290, false);
  bellTower(b, -430, -200, major ? 300 : 270, true);
  b.add('ckit', 0, 380, { items: [['lamp', -300, 0, 0], ['lamp', 300, 0, 0], ['notice', 420, -60, 0]] });
  b.doors.push({ x: 420 + 0, y: 380, fn: 'board', name: FAC_NAME.board });
  // 传送阵：广场西南角一座阵台（能走上去）
  b.add('cteleport', -480, 420, { r: 150 });
  b.doors.push({ x: -480, y: 420, fn: 'teleport', name: FAC_NAME.teleport });
  b.anchors.tp = { x: -480, y: 580 };
  b.light(-480, 420, 60, 30);
  for (let k = 0; k < 6; k++) b.spots.push({ x: b.R(-600, 600), y: b.R(-450, 450) });
  const hw = W_(inn) / 2, hh = H_(inn) / 2;
  const sp = (at: [number, number], fn: (c: R, s: Sides) => void, min: [number, number]): Special => ({ at, fn, min });
  const specials: Special[] = [
    sp([-0.34 * hw, 0.32 * hh], (c, sd) => market(b, c, sd.es), [1300, 1100]),
    sp([0.32 * hw, -0.34 * hh], (c, sd) => temple(b, c, false, sd.es), [1300, 1300]),
    sp([-0.3 * hw, -0.32 * hh], (c, sd) => yamen(b, c, false, sd.es), [1300, 1200]),
  ];
  if (major) specials.push(
    sp([0.62 * hw, 0.4 * hh], (c, sd) => granary(b, c, sd.es), [1300, 1100]),
    sp([-0.66 * hw, -0.62 * hh], (c) => bigEstate(b, c, b.loc.id === 'jiayuan' ? '邹府' : ''), [1300, 1000]),
    sp([0.66 * hw, -0.7 * hh], (c) => bigEstate(b, c), [1300, 1000]),
  );

  gridFill(b, inn, vMust, hMust, specials, ring / 2);
}

// ======================================================== 收尾
function finish(b: CB, L: LocLayout, rs: R[]) {
  const k = 1 / LS;
  // 顺城街：每块城墙圈里沿墙一圈
  // P10 返工：海岛城的四角是圆角（shoreOutline），方框的顺城街在圆角那一截会钻进墙里：四角各留一块不铺（街从两边的直墙段走，
  // 拐角由城里的街接上）；只在这一步临时当作保留地，铺完拿掉
  const tmp: R[] = [];
  if (b.shore?.rc) { const r = rs[0], c = b.shore.rc + b.S.T + b.S.ring; for (const [x, y] of [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]]) tmp.push(rect(Math.min(x, x + (x === r.x0 ? c : -c)), Math.min(y, y + (y === r.y0 ? c : -c)), Math.max(x, x + (x === r.x0 ? c : -c)), Math.max(y, y + (y === r.y0 ? c : -c)))); }
  b.hard.push(...tmp);
  for (const r of rs) {
    const d = b.S.T / 2 + b.S.ring / 2;
    const q = inset(r, d);
    b.street(q.x0, q.y0, q.x1, q.y0, b.S.ring, CG.ST); b.street(q.x0, q.y1, q.x1, q.y1, b.S.ring, CG.ST);
    b.street(q.x0, q.y0, q.x0, q.y1, b.S.ring, CG.ST); b.street(q.x1, q.y0, q.x1, q.y1, b.S.ring, CG.ST);
  }
  b.hard.length -= tmp.length;
  // 铺面里挑几家开成能进的店（离城中心近、临干道的优先）
  // 原版每座城（townLayout.ts 的 city()）都开：丹药铺、法器阁、符箓斋、客栈、酒楼、拍卖行、坊市，北头悬赏榜、传送阵——逐城核对过，一样不少
  const fns: Fac[] = ['tavern', 'rest', 'pill', 'market', 'artifact', 'talisman', 'auction'];
  const near = (p: Shop, q: Shop) => Math.hypot(p.x, p.y) - Math.hypot(q.x, q.y);
  // 先挑临干道、彼此隔开 700 的；小岛上的城铺子少，再放宽到背街、挨着也行
  const passes: [Shop[], number][] = [[b.shops.filter((s) => s.ave).sort(near), 700], [b.shops.slice().sort(near), 250], [b.shops.slice().sort(near), 0]];
  const cand = passes.flatMap(([list, gap]) => list.map((s) => [s, gap] as const));
  const used: Shop[] = [];
  for (const [s, gap] of cand) {
    if (used.length >= fns.length) break;
    if (used.includes(s) || used.some((u) => Math.hypot(u.x - s.x, u.y - s.y) < gap)) continue;
    const fn = fns[used.length];
    s.pc.p.fn = fn; s.pc.p.name = FAC_NAME[fn]; s.pc.p.two = 1;
    const [fx, fy] = FACE[s.r];
    b.doors.push({ x: s.x + fx * 70, y: s.y + fy * 70, fn, name: FAC_NAME[fn] });
    used.push(s);
  }
  // 底：整座城（墙内）一层夯土；关厢一圈土地
  const ext = b.extent;
  const base: { t: number; r: R; o?: boolean }[] = [{ t: CG.DIRT, r: inset(ext, 200) }, ...rs.map((r) => ({ t: CG.BASE, r }))];
  const gnd = [...base, ...b.gnd];
  // 天然水面：挖掉（铺装不压在河上）
  const wet: R[] = [];
  {
    // 只细查粗查时可能有水的 400 见方格子（多数城一格都没有）
    const C = 200;
    for (const [cx, cy, v] of b.wetCellList()) {
      if (cx + 400 < ext.x0 || cx > ext.x1 || cy + 400 < ext.y0 || cy > ext.y1) continue;
      if (v === 2) { wet.push(rect(cx, cy, cx + 400, cy + 400)); continue; }
      for (let y = cy; y < cy + 400; y += C) {
        let a: number | null = null;
        for (let x = cx; x <= cx + 400; x += C) {
          const isWet = x < cx + 400 && b.natWet(x + C / 2, y + C / 2);
          if (isWet && a === null) a = x;
          if (!isWet && a !== null) { wet.push(rect(a, y, x, y + C)); a = null; }
        }
      }
    }
  }
  L.pieces.push(...b.P.map((p) => ({ ...p, x: p.x * k, y: p.y * k })));
  // 名牌：城门、钟鼓楼、衙署 / 寺院的山门、开张的铺子（丹药铺……）、府第、牌楼
  const names: NonNullable<LocLayout['names']> = [];
  for (const p of b.P) {
    const nm = p.p.name as string | undefined; if (!nm) continue;
    const hh = (p.p.h as number | undefined) ?? 0;
    const e = p.kind === 'cgate' ? { h: hh + 300, k: p.p.big ? 0 : 1 } : p.kind === 'cbell' ? { h: 560, k: 0 } : p.kind === 'chall' ? { h: hh + 150, k: 0 }
      : p.kind === 'cshop' && p.p.fn ? { h: 260, k: 0 } : p.kind === 'ccourt' ? { h: 220, k: 0 } : p.kind === 'cpaifang' ? { h: 360, k: 1 } : null;
    if (e) names.push({ x: p.x * k, y: p.y * k, h: e.h, t: nm, k: e.k });
  }
  L.names = names;
  L.ground.push(...gnd.map((g) => ({ kind: 'cg', x: (g.r.x0 + g.r.x1) / 2 * k, y: (g.r.y0 + g.r.y1) / 2 * k, w: W_(g.r) * k, h: H_(g.r) * k, p: { t: g.t, o: g.o ? 1 : 0 } })));
  L.blocks.push(...b.blk.map((r) => ({ x: r.x0 * k, y: r.y0 * k, w: W_(r) * k, h: H_(r) * k })));
  L.lights.push(...b.lights.map((l) => (l.h ? { x: l.x * k, y: l.y * k, r: l.r * k, h: l.h } : { x: l.x * k, y: l.y * k, r: l.r * k })));
  L.smoke.push(...b.smoke.map((s) => ({ x: s.x * k, y: s.y * k })));
  L.flags.push(...b.flags.map((f) => ({ ...f, x: f.x * k, y: f.y * k })));
  L.doors = b.doors.map((d) => ({ ...d, x: d.x * k, y: d.y * k }));
  L.wet = wet.length ? wet.map((r) => ({ x: r.x0 * k, y: r.y0 * k, w: W_(r) * k, h: H_(r) * k })) : undefined;
  // 导航：街心线按 320 一个点，交叉、丁字口并成一张网
  const nav = buildNav(b.segs);
  joinNav(nav, b.blk);
  L.nav = { pts: nav.pts.map((v) => v * k), adj: nav.adj };
  const spots = b.spots.concat(nav.spots);
  L.spots = spots.map((s) => ({ x: s.x * k, y: s.y * k }));
  // 占地：地点范围（椭圆 rx = gw·LOC_SCALE·0.42）罩住城墙四角——野树、野草不长进城里；
  // 整地的圆再大一圈（terrain.ts 给新布局的城乘 1.15），连护城河、关厢一起整平
  const far = Math.max(...rs.flatMap((r) => [Math.hypot(r.x0, r.y0), Math.hypot(r.x1, r.y0), Math.hypot(r.x0, r.y1), Math.hypot(r.x1, r.y1)])) + 600;
  L.gw = L.gh = far / 0.42 * k;
  const X = L as LocLayout & { cityInfo?: unknown; cityStyle?: StyleId; anchors?: Record<string, { x: number; y: number }> };
  // 地面铺装画到哪：占地范围再加上伸出去的港区土路（码头离城远时路在占地外，原来画不出来）
  const gext = { ...ext }; for (const g of gnd) { gext.x0 = Math.min(gext.x0, g.r.x0); gext.y0 = Math.min(gext.y0, g.r.y0); gext.x1 = Math.max(gext.x1, g.r.x1); gext.y1 = Math.max(gext.y1, g.r.y1); }
  X.cityInfo = { courts: b.courts, houses: b.houses, openCourts: b.openCourts, pieces: b.P.length, blocks: b.blk.length, extent: ext, gext, walls: rs, grade: b.grade, blkTag: b.blkTag, style: b.style };
  X.cityStyle = b.style;
  // 剧情锚点（布局单位，相对地点中心）
  X.anchors = Object.fromEntries(Object.entries(b.anchors).map(([key, v]) => [key, { x: v.x * k, y: v.y * k }]));
}

/** 导航网还分成几片时：每一小片找离大片最近、中间不隔碰撞块的一对点接上（800 以内） */
function joinNav(nav: { pts: number[]; adj: number[][] }, blk: R[]) {
  const G = new Map<number, number[]>();
  blk.forEach((r, i) => { for (let gx = Math.floor(r.x0 / 500); gx <= Math.floor(r.x1 / 500); gx++) for (let gy = Math.floor(r.y0 / 500); gy <= Math.floor(r.y1 / 500); gy++) { const k = (gx + 4096) * 8192 + gy + 4096; let a = G.get(k); if (!a) G.set(k, a = []); a.push(i); } });
  const solid = (x: number, y: number) => { for (const i of G.get((Math.floor(x / 500) + 4096) * 8192 + Math.floor(y / 500) + 4096) ?? []) { const r = blk[i]; if (x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1) return true; } return false; };
  const clear = (ax: number, ay: number, bx: number, by: number) => { const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 30); for (let i = 1; i < n; i++) if (solid(ax + (bx - ax) * i / n, ay + (by - ay) * i / n)) return false; return true; };
  const P = nav.pts, adj = nav.adj, N = adj.length;
  for (let round = 0; round < 6; round++) {
    const comp = new Int32Array(N).fill(-1); let nc = 0;
    for (let i = 0; i < N; i++) if (comp[i] < 0) { const st = [i]; comp[i] = nc; while (st.length) { const c = st.pop()!; for (const v of adj[c]) if (comp[v] < 0) { comp[v] = nc; st.push(v); } } nc++; }
    if (nc <= 1) return;
    const size = new Int32Array(nc); for (let i = 0; i < N; i++) size[comp[i]]++;
    let big = 0; for (let c = 1; c < nc; c++) if (size[c] > size[big]) big = c;
    // 大片的点按 400 见方分桶
    const B = new Map<number, number[]>();
    for (let i = 0; i < N; i++) if (comp[i] === big) { const k = (Math.floor(P[i * 2] / 400) + 4096) * 8192 + Math.floor(P[i * 2 + 1] / 400) + 4096; let a = B.get(k); if (!a) B.set(k, a = []); a.push(i); }
    let joined = 0;
    for (let c = 0; c < nc; c++) {
      if (c === big) continue;
      let best = -1, bj = -1, bd = 800 * 800;
      for (let i = 0; i < N; i++) {
        if (comp[i] !== c) continue;
        const x = P[i * 2], y = P[i * 2 + 1], gx = Math.floor(x / 400), gy = Math.floor(y / 400);
        for (let u = -2; u <= 2; u++) for (let v = -2; v <= 2; v++) for (const j of B.get((gx + u + 4096) * 8192 + gy + v + 4096) ?? []) {
          const d = (P[j * 2] - x) ** 2 + (P[j * 2 + 1] - y) ** 2;
          if (d < bd && clear(x, y, P[j * 2], P[j * 2 + 1])) { bd = d; best = i; bj = j; }
        }
      }
      if (best >= 0) { adj[best].push(bj); adj[bj].push(best); joined++; }
    }
    if (!joined) return;
  }
}

/** 导航网：每条街心线按 ≤320 取点；一条线的端点落在另一条线上、或两线相交，就在那里插一个公共点 */
function buildNav(segs: Seg[]) {
  const key = (x: number, y: number) => `${Math.round(x / 30)},${Math.round(y / 30)}`;
  const ids = new Map<string, number>(); const pts: number[] = []; const edges = new Set<string>();
  const node = (x: number, y: number) => { const kk = key(x, y); let i = ids.get(kk); if (i === undefined) { i = pts.length / 2; pts.push(x, y); ids.set(kk, i); } return i; };
  // 按 2000 见方分桶找相交
  const B = new Map<string, number[]>();
  const norm = segs.map((s) => ({ x0: Math.min(s.x0, s.x1), y0: Math.min(s.y0, s.y1), x1: Math.max(s.x0, s.x1), y1: Math.max(s.y0, s.y1), hz: Math.abs(s.y0 - s.y1) < 1 }));
  norm.forEach((s, i) => { for (let gx = Math.floor(s.x0 / 2000); gx <= Math.floor(s.x1 / 2000); gx++) for (let gy = Math.floor(s.y0 / 2000); gy <= Math.floor(s.y1 / 2000); gy++) { const kk = gx + ',' + gy; let a = B.get(kk); if (!a) B.set(kk, a = []); a.push(i); } });
  const spots: { x: number; y: number }[] = [];
  norm.forEach((s, i) => {
    const ts = new Set<number>([0, s.hz ? s.x1 - s.x0 : s.y1 - s.y0]);
    const L = s.hz ? s.x1 - s.x0 : s.y1 - s.y0;
    const seen = new Set<number>();
    for (let gx = Math.floor(s.x0 / 2000); gx <= Math.floor(s.x1 / 2000); gx++) for (let gy = Math.floor(s.y0 / 2000); gy <= Math.floor(s.y1 / 2000); gy++) for (const j of B.get(gx + ',' + gy) ?? []) {
      if (j === i || seen.has(j)) continue; seen.add(j);
      const o = norm[j];
      if (s.hz === o.hz) {
        // 平行：端点落在这条线上（首尾相接）
        if (s.hz ? Math.abs(o.y0 - s.y0) < 20 : Math.abs(o.x0 - s.x0) < 20) for (const p of s.hz ? [o.x0, o.x1] : [o.y0, o.y1]) { const t = p - (s.hz ? s.x0 : s.y0); if (t > 0 && t < L) ts.add(t); }
        continue;
      }
      // 垂直：交点
      const cx = s.hz ? o.x0 : s.x0, cy = s.hz ? s.y0 : o.y0;
      const pad = 130;   // 端点离垂直的街心不到这么远就接上
      if (cx >= s.x0 - pad && cx <= s.x1 + pad && cy >= s.y0 - pad && cy <= s.y1 + pad && cx >= o.x0 - pad && cx <= o.x1 + pad && cy >= o.y0 - pad && cy <= o.y1 + pad) ts.add(Math.max(0, Math.min(L, s.hz ? cx - s.x0 : cy - s.y0)));
    }
    const sorted = [...ts].sort((a, c) => a - c);
    const all: number[] = [];
    for (let k = 0; k < sorted.length; k++) {
      all.push(sorted[k]);
      if (k < sorted.length - 1) { const gap = sorted[k + 1] - sorted[k], n = Math.ceil(gap / 320); for (let m = 1; m < n; m++) all.push(sorted[k] + gap * m / n); }
    }
    let prev = -1;
    for (const t of all) {
      const x = s.hz ? s.x0 + t : s.x0, y = s.hz ? s.y0 : s.y0 + t;
      const id = node(x, y);
      if (prev >= 0 && prev !== id) edges.add(prev < id ? prev + ',' + id : id + ',' + prev);
      prev = id;
    }
    for (let t = 160; t < L; t += 480) spots.push({ x: s.hz ? s.x0 + t : s.x0, y: s.hz ? s.y0 : s.y0 + t });
  });
  const adj: number[][] = []; for (let i = 0; i < pts.length / 2; i++) adj.push([]);
  for (const e of edges) { const [a, c] = e.split(',').map(Number); adj[a].push(c); adj[c].push(a); }
  return { pts, adj, spots };
}

function strHash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export function layoutCity(loc: LocDef, L: LocLayout, env: Env): boolean {
  if (!usesNewCity(loc)) return false;
  const grade = cityGrade(loc), S = SPEC[grade];
  const PF = (globalThis as { __cityProf?: Record<string, number> }).__cityProf, tick = (k: string) => { if (PF) { const n = performance.now(); PF[k] = (PF[k] ?? 0) + n - (PF._t ?? n); PF._t = n; } };
  if (PF) {
    PF._t = performance.now(); const E = env, wrap = <A extends unknown[], T>(k: string, f: (...a: A) => T) => (...a: A) => { const t = performance.now(); const r = f(...a); PF[k + 'Ms'] = (PF[k + 'Ms'] ?? 0) + performance.now() - t; PF[k + 'N'] = (PF[k + 'N'] ?? 0) + 1; return r; };
    env = { ...E, site: wrap('site', E.site), riverDist: E.riverDist && wrap('rd', E.riverDist), wetHint: E.wetHint && wrap('hint', E.wetHint) };
    PF._t = performance.now();
  }
  // 一般城被水、别的地点切掉一块时房子不够 600 间：院落排得再紧一档重排（最多两档）
  let b = plan(loc, env, grade, S, 0, tick);
  for (let dense = 1; dense <= 2 && grade === 'normal' && b.houses < 600; dense++) { const c = plan(loc, env, grade, S, dense, tick); if (c.houses > b.houses) b = c; }
  finish(b, L, b.rs); tick('finish');
  L.pal = { ...L.pal, roof: '#545a62', ground: '#cdbf9c' };
  (L as LocLayout & { cityName?: string }).cityName = loc.name;
  return true;
}

function plan(loc: LocDef, env: Env, grade: CityGrade, S: Spec, dense: number, tick: (k: string) => void): CB {
  const b = new CB(loc, env, strHash(loc.id), grade, S);
  b.dense = dense;
  b.style = pickStyle(loc, env);
  b.S = { ...S, wallCol: STYLE[b.style].wallCol, ...(b.style === 'jin' ? { T: S.T * 1.15, H: S.H * 1.18, ave: S.ave * 1.12 } : {}) };
  const rs: R[] = cityRects(grade, loc.island).map((r: CityRect) => ({ ...r }));
  b.rs = rs;
  b.maxTrees = Math.round(b.maxTrees * STYLE[b.style].trees);
  // 城门：干道正对的几座（国都按图二的格局），再加官道进城处
  const fixed: Gate[] = [];
  const G = (x: number, y: number, side: Gate['side'], main = false, barb = false, name?: string) => fixed.push({ x, y, side, main, barb, outer: true, name });
  if (grade === 'capital') {
    const [I, O] = rs;
    G(0, I.y1, 's', true, true, '正阳门'); G(-5200, I.y1, 's', false, false, '宣武门'); G(5200, I.y1, 's', false, false, '崇文门');
    G(-5200, I.y0, 'n', true, false, '德胜门'); G(5200, I.y0, 'n', true, false, '安定门');
    G(I.x0, -7500, 'w', false, false, '西直门'); G(I.x0, -700, 'w', true, false, '阜成门'); G(I.x1, -7500, 'e', false, false, '东直门'); G(I.x1, -700, 'e', true, false, '朝阳门');
    G(0, O.y1, 's', true, true, '永定门'); G(-7000, O.y1, 's', false, false, '右安门'); G(7000, O.y1, 's', false, false, '左安门');
    G(O.x0, 7000, 'w', true, false, '广安门'); G(O.x1, 7000, 'e', true, false, '广渠门'); G(-11000, O.y0, 'n', false, false, '西便门'); G(11000, O.y0, 'n', false, false, '东便门');
  } else {
    const r = rs[0], barb = grade === 'major';
    const nm = (a: string[]) => a[strHash(loc.id + a[0]) % a.length];
    G(0, r.y1, 's', true, barb, nm(['南门', '迎恩门', '承恩门', '南熏门', '正南门'])); G(0, r.y0, 'n', true, barb, nm(['北门', '拱极门', '安定门', '望京门']));
    G(r.x0, 0, 'w', true, barb, nm(['西门', '庆丰门', '西成门', '通远门'])); G(r.x1, 0, 'e', true, barb, nm(['东门', '迎春门', '朝阳门', '镇东门']));
  }
  const gates = planGates(b, rs, fixed); tick('gates');
  // 占地范围（含护城河、关厢）
  const isle = STYLE[b.style].docks;
  const M = isle ? 1300 : MOAT_OFF + MOAT_W + SUBURB;   // 海岛城没有护城河，关厢浅：整地台地小一圈
  b.extent = rect(Math.min(...rs.map((r) => r.x0)) - M, Math.min(...rs.map((r) => r.y0)) - M, Math.max(...rs.map((r) => r.x1)) + M, Math.max(...rs.map((r) => r.y1)) + M);
  // 占地里还有别的地点（海上的小岛、没挪走的地方）：那一片不盖房、不铺街
  for (const o of LOCATIONS) {
    if (o === loc) continue;
    const dx = (o.x - loc.x) * WORLD_SCALE, dy = (o.y - loc.y) * WORLD_SCALE;
    if (dx < b.extent.x0 - 1800 || dx > b.extent.x1 + 1800 || dy < b.extent.y0 - 1800 || dy > b.extent.y1 + 1800) continue;
    const q = rect(dx - 1800, dy - 1800, dx + 1800, dy + 1800);
    b.reserved.push(q); b.hard.push(q); b.water.push(q);
  }
  if (isle && grade !== 'capital') { shoreOutline(b, gates); shoreWalls(b); buildWalls(b, rs, gates, true); } else buildWalls(b, rs, gates);
  tick('walls');
  buildMoat(b, rs, gates); tick('moat');
  if (grade === 'capital') capitalCity(b, gates); else ordinaryCity(b, gates);
  paifangs(b, gates);
  // 墙线外先占住的地放开：关厢、岸边还要用
  if (b.shoreOut.length) { const S2 = new Set(b.shoreOut); b.reserved = b.reserved.filter((q) => !S2.has(q)); b.hard = b.hard.filter((q) => !S2.has(q)); }
  tick('city');
  suburbs(b, gates); tick('suburbs');
  docks(b);
  harbor(b, gates);
  shoreDress(b);
  return b;
}
