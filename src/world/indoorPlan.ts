// 收官 P8（丁）：室内陈设——按建筑类别和种子，在一间屋子的本地坐标里摆出地面、墙、柜台、货架、桌椅、屏风、丹炉……
// 这里只出「数据」（摆件、碰撞、站位、灯），不碰 three：画法在 hd2d/indoorGl.ts，碰撞和人在 world/indoor.ts。
//
// 本地坐标：x 横跨门面（-W/2..W/2），z 从门口（z = 0）往里到后墙（z = -D）；y 从室内地坪算起。人物约 130 高、40 宽。
// 同一间屋（同一个种子）每次摆出来一模一样：只用这里自己的随机序列（mulberry32），不取 Math.random，不碰布局生成的随机数。
// 以后加一类建筑 = 在 KINDS 里加一份配置（几套陈设变体 + 掌柜站位），不用改别处。
import { mulberry32 } from '../core/rng';

export type RoomKind = 'inn' | 'tavern' | 'shop' | 'hall';
/** 摆件：盒子、圆柱（n 边）、贴墙的平板（挂画、匾）。glow：夜里发光（灯笼、烛火）；side：墙段（1 南 2 东 3 北 4 西，本地方向，见 indoor.ts 转成世界方向），朝镜头那面墙按它削低 */
export type Prim =
  | { t: 'box'; x: number; y: number; z: number; w: number; h: number; d: number; c: string; glow?: boolean; side?: number }
  | { t: 'cyl'; x: number; y: number; z: number; r: number; h: number; c: string; n?: number; top?: string; glow?: boolean }
  | { t: 'panel'; x: number; y: number; z: number; w: number; h: number; c: string; face: 'n' | 's' | 'e' | 'w'; glow?: boolean };
/** 碰撞的占地（本地，x0 < x1，z0 < z1） */
export interface Solid { x0: number; z0: number; x1: number; z1: number }
/** 人的站位：fx, fz 是面朝的方向；talk = 交谈打开设施面板的那位 */
export interface Seat { x: number; z: number; fx: number; fz: number; sit: boolean; role: 'keeper' | 'helper' | 'patron' | 'head' | 'deacon' | 'elder'; title: string; talk?: boolean; lines?: string[] }
/** 灯：地上一团暖光（x, z, 半径）；y 是灯本身的高度 */
export interface Lamp { x: number; z: number; y: number; r: number }
export interface Plan {
  W: number; D: number;
  /** 墙削到多高（朝镜头的那面再削到 sill） */
  H: number; sill: number;
  floor: 'wood' | 'stone' | 'mat' | 'slab';
  prims: Prim[]; solids: Solid[]; seats: Seat[]; lamps: Lamp[];
  /** 比地坪高起的台面（殿里的宝座台）：坐在上头的人脚下按这个高度（world/indoor.ts 的 floorFn） */
  raise: (Solid & { y: number })[];
  /** 柜台前、殿前可以站人交谈的一点（测试：门口到这里走得通） */
  front: { x: number; z: number };
  /** 门洞：中心 x、宽 */
  door: { x: number; w: number };
  variant: number;
}

const WOOD = ['#5a3a26', '#6e4630', '#7a5034', '#4e3222'];
const LACQ = '#7a2418', DARK = '#2a2220', PAPER = '#efe2c0', GOLD = '#c8a040', BRASS = '#a8843a';
const pickOf = (r: () => number) => <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)];

/** 摆件收集器：所有尺寸是本地坐标 */
class PB {
  prims: Prim[] = []; solids: Solid[] = []; seats: Seat[] = []; lamps: Lamp[] = []; raise: (Solid & { y: number })[] = [];
  constructor(public W: number, public D: number, public r: () => number) {}
  box(x: number, y: number, z: number, w: number, h: number, d: number, c: string, glow = false) { if (w > 0 && h > 0 && d > 0) this.prims.push({ t: 'box', x, y, z, w, h, d, c, glow: glow || undefined }); }
  cyl(x: number, y: number, z: number, r: number, h: number, c: string, n = 8, top?: string, glow = false) { this.prims.push({ t: 'cyl', x, y, z, r, h, c, n, top, glow: glow || undefined }); }
  panel(x: number, y: number, z: number, w: number, h: number, c: string, face: 'n' | 's' | 'e' | 'w', glow = false) { this.prims.push({ t: 'panel', x, y, z, w, h, c, face, glow: glow || undefined }); }
  solid(cx: number, cz: number, w: number, d: number) { this.solids.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2 }); }
  seat(s: Seat) { this.seats.push(s); }
  /** 挂着的灯笼：一根吊绳 + 红灯笼（夜里亮）+ 上下两道黑箍；地上一团光 */
  lantern(x: number, z: number, y: number, s = 1, col = '#c83a2a') {
    this.box(x, y + 26 * s, z, 1.6, 40 * s, 1.6, DARK);
    this.cyl(x, y - 12 * s, z, 11 * s, 26 * s, col, 8, undefined, true);
    this.box(x, y + 15 * s, z, 12 * s, 3 * s, 12 * s, DARK); this.box(x, y - 13 * s, z, 12 * s, 3 * s, 12 * s, DARK);
    this.box(x, y - 22 * s, z, 2, 10 * s, 2, '#e0b040');
    this.lamps.push({ x, z, y, r: 120 * s });
  }
  /** 落地烛台：细杆 + 托盘 + 一点烛火 */
  candle(x: number, z: number, h = 70) {
    this.cyl(x, 0, z, 7, 4, BRASS, 6); this.box(x, h / 2, z, 3, h, 3, BRASS); this.cyl(x, h, z, 8, 3, BRASS, 6);
    this.box(x, h + 7, z, 3.4, 10, 3.4, '#f4ecd8'); this.box(x, h + 15, z, 2.2, 5, 2.2, '#ffd27a', true);
    this.solid(x, z, 14, 14); this.lamps.push({ x, z, y: h + 15, r: 90 });
  }
  /** 方桌 + 四条凳（或两条长凳）；桌上茶具 / 酒壶 */
  table(x: number, z: number, o: { w?: number; d?: number; bench?: boolean; wine?: boolean; wood?: string } = {}) {
    const w = o.w ?? 70, d = o.d ?? 56, wd = o.wood ?? WOOD[1], top = 40;
    this.box(x, top - 2, z, w, 4, d, wd);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(x + sx * (w / 2 - 4), (top - 4) / 2, z + sz * (d / 2 - 4), 4, top - 4, 4, shade(wd, -0.2));
    if (o.bench) for (const sz of [-1, 1]) { this.box(x, 22, z + sz * (d / 2 + 16), w + 10, 4, 14, wd); for (const sx of [-1, 1]) this.box(x + sx * (w / 2), 10, z + sz * (d / 2 + 16), 4, 20, 10, shade(wd, -0.2)); }
    else for (const [sx, sz] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) { const sxp = x + sx * (w / 2 + 16), szp = z + sz * (d / 2 + 16); this.box(sxp, 22, szp, 20, 4, 20, wd); this.box(sxp, 10, szp, 14, 20, 14, shade(wd, -0.25)); }
    // 桌上：一把壶、两三只杯，酒楼再加一坛酒、一碟菜
    this.cyl(x - 8, top, z - 4, 6, 12, o.wine ? '#7a5a3a' : '#e8e2d2', 8, o.wine ? '#5a3a2a' : '#c8d8d0');
    for (let i = 0; i < 3; i++) this.cyl(x + 6 + i * 7, top, z + 8 - (i % 2) * 10, 3, 5, '#f0ece0', 6);
    if (o.wine) { this.cyl(x + 14, top, z - 12, 10, 3, '#f0ece0', 8); this.box(x + 14, top + 3.5, z - 12, 10, 2, 8, ['#8a5a2a', '#5a7a3a', '#a8432f'][Math.floor(this.r() * 3)]); }
    this.solid(x, z, w + (o.bench ? 10 : 50), d + 56);
  }
  /** 柜台：台面、正面深色板、一副算盘、一本账册；L 形时侧面再接一截 */
  counter(x: number, z: number, w: number, d = 30, wood = WOOD[1], side?: { dir: -1 | 1; len: number }) {
    const h = 54;
    this.box(x, h / 2, z, w, h, d, shade(wood, -0.15));
    this.box(x, h + 2, z, w + 6, 4, d + 6, wood);
    this.box(x, h * 0.45, z + d / 2 + 0.6, w - 8, h * 0.6, 1, shade(wood, -0.35));
    // 算盘
    this.box(x + w * 0.22, h + 5, z + 2, 30, 2, 14, DARK); for (let i = 0; i < 5; i++) this.box(x + w * 0.22 - 12 + i * 6, h + 7, z + 2, 2, 2, 12, '#c8a070');
    this.box(x - w * 0.18, h + 5, z, 22, 3, 16, '#e8dcbc'); this.box(x - w * 0.18, h + 7, z, 2, 1, 14, '#a83a2a');
    this.solid(x, z, w + 6, d + 6);
    if (side) {
      const sx = x + side.dir * (w / 2 - d / 2), sz = z - side.len / 2 - d / 2;
      this.box(sx, h / 2, sz, d, h, side.len, shade(wood, -0.15)); this.box(sx, h + 2, sz, d + 6, 4, side.len + 6, wood);
      this.solid(sx, sz, d + 6, side.len + 6);
    }
  }
  /**
   * 靠墙的货架：几层隔板，层上的货按行当摆（丹瓶、兵刃、符纸、货包……）。
   * (x, z) 是架子背面贴着的墙线上的中点；face 是架子正面朝哪：s = 靠后墙朝门，e = 靠西墙朝东，w = 靠东墙朝西。
   * 先在「背靠 lz = -dp、正面 lz = 0」的框里排好，再转过去
   */
  shelf(x: number, z: number, w: number, goods: Goods, o: { h?: number; depth?: number; face?: 's' | 'e' | 'w'; wood?: string } = {}) {
    const h = o.h ?? 150, dp = o.depth ?? 24, wd = o.wood ?? WOOD[0], face = o.face ?? 's';
    const at = (lx: number, lz: number): [number, number] => face === 's' ? [x + lx, z + dp + lz] : face === 'e' ? [x + dp + lz, z + lx] : [x - dp - lz, z - lx];
    const put = (lx: number, ly: number, lz: number, bw: number, bh: number, bd: number, c: string, glow = false) => {
      const [px, pz] = at(lx, lz);
      if (face === 's') this.box(px, ly, pz, bw, bh, bd, c, glow); else this.box(px, ly, pz, bd, bh, bw, c, glow);
    };
    const cy = (lx: number, ly: number, lz: number, r: number, hh: number, c: string, top?: string) => { const [px, pz] = at(lx, lz); this.cyl(px, ly, pz, r, hh, c, 7, top); };
    const n = Math.max(3, Math.round(h / 38));
    for (const s of [-1, 1]) put(s * (w / 2 - 2.5), h / 2, -dp / 2, 5, h, dp, wd);
    put(0, h / 2, -dp + 1.5, w, h, 3, shade(wd, -0.25));
    for (let i = 0; i < n; i++) {
      const y = 6 + i * (h - 10) / (n - 1);
      put(0, y, -dp / 2, w - 4, 3, dp, wd);
      if (i === n - 1) break;
      // 这一层上的货
      const k = Math.max(2, Math.floor((w - 10) / 22));
      for (let j = 0; j < k; j++) {
        if (this.r() < 0.18) continue;
        const gx = -w / 2 + 10 + (j + 0.5) * (w - 20) / k, gz = -dp / 2 + 2;
        goods(put, cy, gx, y + 1.5, gz, this.r);
      }
    }
    const fw = face === 's' ? w : dp + 4, fd = face === 's' ? dp + 4 : w;
    this.solid(face === 's' ? x : face === 'e' ? x + dp / 2 : x - dp / 2, face === 's' ? z + dp / 2 : z, fw, fd);
  }
  /** 屏风：几扇立板，木框、画心（山水 / 花鸟的几块色） */
  screen(x: number, z: number, w: number, h = 120, alongX = true, wood = DARK) {
    const n = Math.max(3, Math.round(w / 34)), pw = w / n;
    for (let i = 0; i < n; i++) {
      const o = -w / 2 + (i + 0.5) * pw, zz = (i % 2 ? 3 : -3);
      const px = alongX ? x + o : x + zz, pz = alongX ? z + zz : z + o;
      this.box(px, h / 2 + 4, pz, alongX ? pw - 1 : 3, h, alongX ? 3 : pw - 1, wood);
      // 画心：朝两面各一块浅色
      const ink = ['#e8e0cc', '#e4dccb', '#ece4d0'][i % 3];
      this.box(px, h / 2 + 8, pz, alongX ? pw - 7 : 3.6, h - 18, alongX ? 3.6 : pw - 7, ink);
      if (i % 2 === 0) this.box(px, h * 0.55, pz, alongX ? pw * 0.4 : 4, h * 0.25, alongX ? 4 : pw * 0.4, ['#6a7a6a', '#8a9a8a', '#a86a5a'][i % 3]);
      this.box(px, 3, pz, alongX ? pw - 2 : 8, 6, alongX ? 8 : pw - 2, wood);
    }
    this.solid(x, z, alongX ? w : 14, alongX ? 14 : w);
  }
  /** 丹炉：三足鼎，炉身、炉盖、炉耳，炉膛一点火光 */
  furnace(x: number, z: number, s = 1) {
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.5; this.box(x + Math.cos(a) * 16 * s, 9 * s, z + Math.sin(a) * 16 * s, 6 * s, 18 * s, 6 * s, '#4a4036'); }
    this.cyl(x, 16 * s, z, 24 * s, 30 * s, '#6a5a44', 10, '#5a4a38');
    this.cyl(x, 46 * s, z, 18 * s, 8 * s, '#7a6a50', 10);
    this.cyl(x, 54 * s, z, 6 * s, 10 * s, '#8a7656', 8);
    for (const sx of [-1, 1]) this.box(x + sx * 26 * s, 42 * s, z, 6 * s, 12 * s, 4 * s, '#5a4a38');
    this.box(x, 24 * s, z + 23 * s, 12 * s, 9 * s, 2, '#ff8a3a', true);
    this.solid(x, z, 58 * s, 58 * s); this.lamps.push({ x, z, y: 24 * s, r: 80 * s });
  }
  /** 兵器架：两根立柱两道横杆，挂几把剑、立几杆枪 */
  rack(x: number, z: number, w = 90, alongX = true) {
    const P = (o: number, y: number, hh: number, c: string, t = 4) => alongX ? this.box(x + o, y, z, t, hh, t, c) : this.box(x, y, z + o, t, hh, t, c);
    P(-w / 2, 60, 120, WOOD[0], 6); P(w / 2, 60, 120, WOOD[0], 6);
    for (const y of [40, 100]) alongX ? this.box(x, y, z, w, 4, 5, WOOD[1]) : this.box(x, y, z, 5, 4, w, WOOD[1]);
    const n = Math.max(3, Math.round(w / 18));
    for (let i = 0; i < n; i++) {
      const o = -w / 2 + 10 + i * (w - 20) / (n - 1);
      if (i % 2) { P(o, 70, 130, '#7a5a3a', 2.2); P(o, 134, 10, '#c8ccd0', 3); }       // 枪
      else { P(o, 70, 70, '#c8d0d8', 2.6); P(o, 104, 6, GOLD, 8); P(o, 113, 12, '#3a2a20', 3); }   // 剑
    }
    this.solid(x, z, alongX ? w + 10 : 18, alongX ? 18 : w + 10);
  }
  /** 书架 / 卷架：格子里塞满卷轴 */
  books(x: number, z: number, w: number, face: 's' | 'e' | 'w' = 's') {
    this.shelf(x, z, w, (put, cy, gx, y, gz, r) => {
      for (let k = 0; k < 3; k++) put(gx - 6 + k * 6, y + 5, gz, 5, 10, 14, ['#e8dcc0', '#d8c8a0', '#c8b890', '#a86a4a'][Math.floor(r() * 4)]);
      void cy;
    }, { h: 170, face });
  }
  /** 床榻：榻身、被褥、枕，四角立柱撑一顶帐 */
  bed(x: number, z: number, w = 90, d = 60) {
    this.box(x, 14, z, w, 28, d, WOOD[2]);
    this.box(x, 31, z + 4, w - 10, 6, d - 14, '#b8504a'); this.box(x - w / 2 + 14, 34, z, 16, 6, d - 18, '#e8e0cc');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(x + sx * (w / 2 - 3), 70, z + sz * (d / 2 - 3), 4, 140, 4, WOOD[2]);
    this.box(x, 140, z, w, 3, d, '#d8ccb0');
    this.solid(x, z, w + 6, d + 6);
  }
  /** 酒坛：一排大小不一的坛子，坛口红布封 */
  jars(x: number, z: number, n = 4, alongX = true) {
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * 30, r = 12 + this.r() * 4, px = alongX ? x + o : x, pz = alongX ? z : z + o;
      this.cyl(px, 0, pz, r, 30 + this.r() * 8, ['#6a4a30', '#5a3e2a', '#7a5636'][i % 3], 8, '#a8302a');
    }
    this.solid(x, z, alongX ? n * 30 : 32, alongX ? 32 : n * 30);
  }
  /** 挂画：贴在后墙上（z 是墙面，朝南） */
  scroll(x: number, z: number, y: number, w = 44, h = 96) {
    this.panel(x, y, z + 1, w + 6, h + 14, '#5a4a30', 's');
    this.panel(x, y, z + 1.5, w, h, '#ece4d0', 's');
    this.panel(x, y + h * 0.08, z + 2, w * 0.7, h * 0.5, ['#7a8a7a', '#6a7a8a', '#9a8a6a'][Math.floor(this.r() * 3)], 's');
    this.box(x, y + h / 2 + 9, z + 3, w + 14, 3, 3, WOOD[0]); this.box(x, y - h / 2 - 9, z + 3, w + 14, 4, 4, WOOD[0]);
  }
  /** 一盆花木 */
  plant(x: number, z: number) {
    this.cyl(x, 0, z, 12, 18, '#8a6a4a', 8, '#5a4030');
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; this.box(x + Math.cos(a) * 7, 30 + i * 3, z + Math.sin(a) * 7, 10, 18, 10, ['#4a7a3a', '#5a8a46', '#3e6a32'][i % 3]); }
    this.solid(x, z, 26, 26);
  }
  /** 蒲团 */
  cushion(x: number, z: number) { this.cyl(x, 0, z, 16, 6, '#c8a858', 10, '#b89848'); }
}
/** 货架一格上的货：put(本地 x, y, z, 宽, 高, 深, 色)；cy(本地 x, y, z, 半径, 高, 色, 顶色) */
type Goods = (put: (lx: number, ly: number, lz: number, w: number, h: number, d: number, c: string, glow?: boolean) => void, cy: (lx: number, ly: number, lz: number, r: number, h: number, c: string, top?: string) => void, gx: number, y: number, gz: number, r: () => number) => void;

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16), f = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------- 各行当的货
const GOODS: Record<string, Goods> = {
  // 丹药铺：葫芦、瓷瓶、贴红签的药匣
  pill: (put, cy, gx, y, gz, r) => {
    const k = r();
    if (k < 0.45) { cy(gx - 4, y, gz, 5, 9, ['#c8a050', '#7a9a6a', '#d8d0c0', '#a85a3a'][Math.floor(r() * 4)]); cy(gx - 4, y + 9, gz, 3, 5, '#c8b880'); cy(gx + 6, y, gz, 4, 11, ['#e8e4d8', '#6a8a9a'][Math.floor(r() * 2)], '#a83a2a'); }
    else if (k < 0.8) { put(gx, y + 6, gz, 18, 12, 12, '#8a5a3a'); put(gx, y + 6, gz + 6.2, 6, 6, 0.6, '#c83a2a'); }
    else { cy(gx, y, gz, 7, 8, '#7a5a3a'); cy(gx, y + 8, gz, 4, 6, '#9a7a4a'); }
  },
  // 法器阁：平放的剑、小盾、铜铃、玉佩匣
  artifact: (put, cy, gx, y, gz, r) => {
    const k = r();
    if (k < 0.4) { put(gx, y + 1.5, gz, 20, 2.4, 3, '#d0d8e0'); put(gx - 10, y + 2, gz, 3, 3, 8, GOLD); }
    else if (k < 0.65) cy(gx, y, gz, 8, 3, ['#8a6a3a', '#5a6a7a', '#7a3a2a'][Math.floor(r() * 3)], GOLD);
    else if (k < 0.85) { cy(gx, y, gz, 4, 8, BRASS); cy(gx, y + 8, gz, 1.5, 3, BRASS); }
    else { put(gx, y + 4, gz, 16, 8, 10, '#3a2a24'); put(gx, y + 8.3, gz, 8, 0.6, 6, '#9fd0b0'); }
  },
  // 符箓斋：一摞摞黄纸符、卷起的玉简、朱砂盒
  talisman: (put, cy, gx, y, gz, r) => {
    const k = r();
    if (k < 0.45) { const n = 2 + Math.floor(r() * 4); for (let i = 0; i < n; i++) put(gx, y + 0.8 + i * 1.6, gz, 12, 1.4, 16, i % 2 ? '#f0d878' : '#e8cc60'); put(gx, y + n * 1.6 + 0.9, gz, 2, 0.4, 12, '#b02a1a'); }
    else if (k < 0.8) { put(gx - 5, y + 4, gz, 4, 8, 14, '#9fc0a8'); put(gx + 2, y + 4, gz, 4, 8, 14, '#c8d8c0'); }
    else put(gx, y + 3, gz, 10, 6, 10, '#a8302a');
  },
  // 坊市：麻袋、竹筐、成捆的灵草、矿石
  market: (put, cy, gx, y, gz, r) => {
    const k = r();
    if (k < 0.35) put(gx, y + 7, gz, 16, 14, 14, '#c8b080');
    else if (k < 0.65) { cy(gx, y, gz, 8, 9, '#a8844a'); put(gx, y + 10, gz, 10, 4, 10, ['#5a8a4a', '#8a6a9a', '#c86a3a'][Math.floor(r() * 3)]); }
    else if (k < 0.85) for (let i = 0; i < 3; i++) put(gx - 5 + i * 5, y + 5, gz, 3, 10, 3, '#4a7a3a');
    else put(gx, y + 4, gz, 12, 8, 10, ['#7a8a9a', '#9a8a7a', '#6a6a72'][Math.floor(r() * 3)]);
  },
  // 客栈、酒楼的架子：酒坛、碗碟
  wine: (put, cy, gx, y, gz, r) => {
    if (r() < 0.6) cy(gx, y, gz, 7, 13, ['#6a4a30', '#5a3e2a', '#7a5636'][Math.floor(r() * 3)], '#a8302a');
    else { for (let i = 0; i < 3; i++) put(gx, y + 1 + i * 2, gz, 12 - i, 1.6, 12 - i, '#f0ece0'); }
  },
};

// ---------------------------------------------------------------- 各类建筑的陈设变体
interface Ctx { b: PB; W: number; D: number; fac: string; wood: string; dir: -1 | 1 }
const KEEPER_LINES: Record<string, string[]> = {
  pill: ['回气、疗伤丹常备，客官要几颗？', '新到的一炉，成色好得很。', '本店童叟无欺，丹毒一概验过。'],
  artifact: ['飞剑法盾，件件开过锋。', '客官掂掂这柄，趁手得很。', '好法器认主，也看缘分。'],
  talisman: ['符纸朱砂都是上品。', '破禁符、回府符，出门在外备几张。', '玉简里的法术，概不赊欠。'],
  market: ['灵草材料，一应俱全。', '这个月的货刚到。', '看看再说，看看再说。'],
  rest: ['客官住店？上房还有。', '热水已经烧上了。', '楼上清静，好打坐。'],
  tavern: ['好酒好菜，坐下慢慢说。', '想打听消息？问我就对了。', '小二，给这位客官上壶好酒！'],
  sect: ['宗门差事，都在这册子上。', '贡献够了，自可来换。', '掌门在上，莫要喧哗。'],
};
const TITLE: Record<string, string> = { pill: '丹药铺掌柜', artifact: '法器阁掌柜', talisman: '符箓斋掌柜', market: '坊市掌柜', rest: '客栈掌柜', tavern: '酒楼掌柜', sect: '执事' };

/** 铺子（丹药铺、法器阁、符箓斋、坊市共用骨架，换货和摆件）：三套。z 越大越靠门口 */
function shopPlan(c: Ctx, v: number) {
  const { b, W, D, fac, wood, dir } = c, goods = GOODS[fac] ?? GOODS.market;
  const back = -D + 8, sideX = W / 2 - 8;
  const keeper = (x: number, z: number) => b.seat({ x, z, fx: 0, fz: 1, sit: false, role: 'keeper', title: TITLE[fac] ?? '掌柜', talk: true, lines: KEEPER_LINES[fac] });
  // 店里的客人：一位在货架前挑货（背对镜头看货），有时还有一个伙计在理货
  const browse = (x: number, z: number, fx: number, fz: number) => b.seat({ x, z, fx, fz, sit: false, role: 'patron', title: '挑货的客人', lines: ['这个……成色如何？', '再便宜些吧。', '嗯，再看看。'] });
  const helper = (x: number, z: number, fx: number, fz: number) => { if (b.r() < 0.6) b.seat({ x, z, fx, fz, sit: false, role: 'helper', title: '伙计', lines: ['客官随便看。', '这几样是新到的。'] }); };
  const corner = (z: number) => { if (fac === 'pill') b.furnace(-dir * (W / 2 - 46), z, 0.8); else if (fac === 'artifact') b.rack(-dir * (W / 2 - 18), z, 76, false); else if (fac === 'talisman') b.books(-dir * sideX, z, 90, dir > 0 ? 'e' : 'w'); else b.jars(-dir * (W / 2 - 24), z, 2, false); };
  if (v === 0) {
    // 一：后墙一排货架，前面横一道柜台，掌柜站在架子和柜台之间
    const sw = Math.min(W - 30, 380), n = Math.max(2, Math.round(sw / 110));
    for (let i = 0; i < n; i++) b.shelf(-sw / 2 + (i + 0.5) * sw / n, back, sw / n - 6, goods, { h: 150 });
    const cz = back + 24 + 50 + 15;
    b.counter(0, cz, Math.min(W * 0.62, 260), 30, wood);
    keeper(dir * 24, cz - 40);
    b.lantern(-W * 0.26, cz + 44, 150); b.lantern(W * 0.26, cz + 44, 150);
    corner(-40);
    b.plant(dir * (W / 2 - 26), -26);
    browse(-dir * W * 0.3, cz + 46, 0, -1); helper(-dir * W * 0.2, back + 46, 0, -1);
    return { x: 0, z: cz + 42 };
  }
  if (v === 1) {
    // 二：L 形柜台在一侧，另一侧靠墙一排货架，后墙中间挂画、一张小案
    const cw = Math.min(W * 0.42, 170), cx = dir * (W / 2 - cw / 2 - 26), cz = back + 24 + 46 + 14;
    b.counter(cx, cz, cw, 28, wood, { dir: dir as -1 | 1, len: Math.max(30, Math.min(60, cz - back - 40)) });
    keeper(cx - dir * 6, cz - 38);
    b.shelf(dir * (W / 2 - 66), back, 104, goods, { h: 140 });
    const sl = Math.min(D - 90, 210);
    b.shelf(-dir * sideX, back + 10 + sl / 2, sl, goods, { face: dir > 0 ? 'e' : 'w', h: 150 });
    b.scroll(-dir * W * 0.04, back, 100, 40, 80);
    b.lantern(cx, cz + 34, 150); b.lantern(-dir * W * 0.12, -D * 0.4, 150);
    if (fac === 'pill') b.furnace(-dir * W * 0.04, back + 70, 0.7); else b.table(-dir * W * 0.04, back + 64, { w: 60, d: 40, wood: WOOD[2] });
    browse(-dir * (W / 2 - 70), -D * 0.45, -dir, 0);
    return { x: cx, z: cz + 40 };
  }
  // 三：两侧都是货架，柜台在后，中间一张展台摆着样货
  const sl = Math.min(D - 100, 190);
  b.shelf(-sideX, back + 30 + sl / 2, sl, goods, { face: 'e', h: 150 }); b.shelf(sideX, back + 30 + sl / 2, sl, goods, { face: 'w', h: 150 });
  const cz = back + 58;
  b.counter(0, cz, Math.min(W * 0.46, 200), 28, wood);
  keeper(dir * 26, cz - 34);
  // 展台偏在一边（不挡着门口到柜台那条道）
  const tz = Math.min(-60, cz + 82), tx = -dir * W * 0.17;
  b.box(tx, 22, tz, 90, 44, 46, shade(wood, -0.1)); b.box(tx, 46, tz, 96, 4, 52, wood);
  for (let i = 0; i < 4; i++) goods((lx, ly, lz, w, h, d, col, gl) => b.box(tx + lx - 30 + i * 20, ly, tz + lz + 12, w, h, d, col, gl), (lx, ly, lz, r, h, col, top) => b.cyl(tx + lx - 30 + i * 20, ly, tz + lz + 12, r, h, col, 7, top), 0, 48, -12, b.r);
  b.solid(tx, tz, 100, 56);
  b.lantern(tx, tz, 150); b.lantern(dir * W * 0.2, cz + 40, 150);
  b.scroll(-dir * W * 0.1, back, 100, 40, 76);
  browse(dir * (W / 2 - 66), -D * 0.4, dir, 0); helper(tx, tz + 46, 0, -1);
  return { x: dir * 40, z: cz + 36 };
}

/** 客栈：柜台在一侧（身后酒架），上楼的木梯沿另一侧墙，堂里一两张桌子，住店的客人坐着，小二张罗 */
function innPlan(c: Ctx, v: number) {
  const { b, W, D, wood, dir } = c;
  const back = -D + 8;
  const cw = Math.min(W * 0.36, 150), cx = dir * (W / 2 - cw / 2 - 22), cz = back + 24 + 48 + 15;
  b.counter(cx, cz, cw, 30, wood);
  b.shelf(cx, back, Math.min(cw + 10, 150), GOODS.wine, { h: 140 });
  b.seat({ x: cx, z: cz - 40, fx: 0, fz: 1, sit: false, role: 'keeper', title: '客栈掌柜', talk: true, lines: KEEPER_LINES.rest });
  // 楼梯：贴另一侧墙，从门边往里一级级升上去（台阶 + 扶手）
  const sx = -dir * (W / 2 - 34), n = Math.max(3, Math.min(7, Math.floor((D - 70) / 22)));
  for (let i = 0; i < n; i++) b.box(sx, (i + 1) * 9, -44 - i * 22, 50, (i + 1) * 18, 22, shade(wood, i % 2 ? -0.08 : 0));
  b.box(sx + dir * 27, 30 + n * 9, -44 - (n - 1) * 11, 3, 60 + n * 18, n * 22, WOOD[0]);
  b.solid(sx, -44 - (n - 1) * 11, 58, n * 22 + 8);
  // 堂里的桌子：一张或两张
  const tz = Math.max(back + 130, -D * 0.42), tx = v === 0 ? dir * 4 : -dir * W * 0.02;
  b.table(tx, tz, { w: 66, d: 50 });
  // 第二张桌子摆在楼梯这一侧（门口到柜台那一片留空）
  if (W > 380 && v !== 2) b.table(tx - dir * 118, tz + 50, { w: 56, d: 44 });
  b.seat({ x: tx, z: tz - 40, fx: 0, fz: 1, sit: true, role: 'patron', title: '住店的客人', lines: ['这一路风尘，总算能歇歇。', '明日一早赶路。'] });
  if (v !== 1) b.seat({ x: tx - 50, z: tz, fx: 1, fz: 0, sit: true, role: 'patron', title: '住店的客人', lines: ['小二，再添壶茶。', '听说城外不太平。'] });
  if (v === 2) b.screen(-dir * W * 0.08, back + 10, 100, 110);
  else b.scroll(-dir * W * 0.08, back, 100, 44, 84);
  b.lantern(cx - dir * 20, cz + 46, 160); b.lantern(tx, tz, 165, 1.1);
  b.plant(dir * (W / 2 - 24), -26);
  b.seat({ x: tx + dir * 62, z: tz - 18, fx: -dir, fz: 0, sit: false, role: 'helper', title: '店小二', lines: ['客官里边请！', '上房一间，热水马上来。', '您的茶。'] });
  return { x: cx, z: cz + 42 };
}

/** 酒楼：几张桌子坐着喝酒的人，一侧是柜台、身后一排酒坛，屏风隔出一角 */
function tavernPlan(c: Ctx, v: number) {
  const { b, W, D, wood, dir } = c;
  const back = -D + 8;
  const cw = Math.min(W * 0.34, 140), cx = dir * (W / 2 - cw / 2 - 20), cz = back + 36 + 44 + 15;
  b.counter(cx, cz, cw, 30, wood);
  b.jars(cx, back + 18, Math.max(2, Math.floor(cw / 32)));
  b.seat({ x: cx, z: cz - 40, fx: 0, fz: 1, sit: false, role: 'keeper', title: '酒楼掌柜', talk: true, lines: KEEPER_LINES.tavern });
  // 桌子：两张错开摆，桌边坐着人
  const zA = Math.max(back + 80, -D * 0.62), zB = Math.min(-60, -D * 0.3);
  // 门口到柜台前那一片（柜台这一侧的前半间）留空；桌子摆在另一侧和后半间正中
  const spots: [number, number][] = v === 0 ? [[-dir * W * 0.24, zB], [-dir * W * 0.03, zA]] : v === 1 ? [[-dir * W * 0.25, zA], [-dir * W * 0.3, zB + 6]] : [[-dir * W * 0.26, (zA + zB) / 2 - 10], [dir * W * 0.02, zA]];
  const names = ['喝酒的散修', '赶路的行商', '说书先生', '喝酒的散修'];
  spots.forEach(([x, z], i) => {
    b.table(x, z, { wine: true, bench: i % 2 === 1, w: i % 2 ? 76 : 64, d: i % 2 ? 44 : 52 });
    b.seat({ x: x - 44, z, fx: 1, fz: 0, sit: true, role: 'patron', title: names[i % 4], lines: ['再来一壶！', '听说城外又有妖兽伤人……', '这酒，够劲。', '道友也是来打听消息的？'] });
    if (i === 0 || v === 1) b.seat({ x: x + 44, z: z - 4, fx: -1, fz: 0, sit: true, role: 'patron', title: names[(i + 1) % 4], lines: ['嘘——隔墙有耳。', '干了这杯！', '那洞府的禁制，啧啧……'] });
  });
  b.screen(-dir * (W / 2 - 20), back + 20 + Math.min(D * 0.45, 110) / 2, Math.min(D * 0.45, 110), 116, false);
  for (const [x, z] of spots) b.lantern(x, z, 160, 1.1);
  b.lantern(cx, cz + 40, 160);
  b.scroll(-dir * W * 0.06, back, 100, 40, 80);
  return { x: cx, z: cz + 40 };
}

/** 宗门大殿（议事殿）：殿后高起一座宝座台，掌门坐在上头；台前左右一列执事案，两排红柱、红毯、香炉、蒲团 */
function hallPlan(c: Ctx, v: number) {
  const { b, W, D } = c;
  const back = -D + 10;
  // 红毯：从门口铺到宝座台
  b.box(0, 0.6, -D * 0.45 - 10, Math.min(160, W * 0.14), 1.2, D * 0.9 - 40, '#8a2a24');
  b.box(0, 0.9, -D * 0.45 - 10, Math.min(160, W * 0.14) - 16, 1.2, D * 0.9 - 56, '#9a3428');
  // 宝座台：两级，上面一张宽座、一张案，背后一座大屏风
  const dw = Math.min(W * 0.36, 420), dz = back + 70;
  b.box(0, 12, dz, dw, 24, 120, '#6a5a4a'); b.box(0, 30, dz - 10, dw - 60, 12, 96, '#7a6a56');
  for (let i = 0; i < 3; i++) b.box(0, 4 + i * 8, dz + 64 + (2 - i) * 10, 120, 8, 10, shade('#6a5a4a', -0.05 * i));
  b.solid(0, dz, dw, 124);
  b.raise.push({ x0: -dw / 2, z0: dz - 60, x1: dw / 2, z1: dz + 60, y: 24 }, { x0: -(dw - 60) / 2, z0: dz - 58, x1: (dw - 60) / 2, z1: dz + 38, y: 36 });
  b.box(0, 52, dz - 16, 110, 10, 50, LACQ); b.box(0, 80, dz - 40, 110, 60, 8, LACQ); for (const s of [-1, 1]) b.box(s * 52, 62, dz - 16, 8, 30, 46, LACQ);
  b.box(0, 76, dz + 18, 90, 4, 30, DARK); for (const s of [-1, 1]) b.box(s * 40, 60, dz + 18, 4, 32, 26, DARK);
  b.screen(0, back + 4, Math.min(dw + 40, 380), 200, true, LACQ);
  b.seat({ x: 0, z: dz - 12, fx: 0, fz: 1, sit: true, role: 'head', title: '掌门', talk: true, lines: ['宗门之事，问执事便是。', '修行之人，当守本心。', '嗯。'] });
  // 两排红柱（殿里的金柱）
  const cols = Math.max(2, Math.min(4, Math.floor(D / 160)));
  for (const s of [-1, 1]) for (let i = 0; i < cols; i++) {
    const x = s * W * 0.3, z = -60 - i * (D - 200) / Math.max(1, cols - 1) * 0.92;
    b.cyl(x, 0, z, 15, 280, '#8a2a20', 10); b.cyl(x, 0, z, 20, 12, '#9a9286', 10);
    b.solid(x, z, 40, 40);
  }
  // 执事案：台前一侧；另一侧两张交椅坐长老
  const ex = W * 0.17, ez = dz + 130;
  b.box(ex, 24, ez, 90, 48, 40, LACQ); b.box(ex, 50, ez, 96, 4, 46, DARK);
  b.box(ex + 20, 54, ez, 26, 4, 18, '#e8dcbc'); b.box(ex - 22, 56, ez, 10, 8, 10, BRASS);
  b.solid(ex, ez, 100, 50);
  b.seat({ x: ex, z: ez - 36, fx: 0, fz: 1, sit: false, role: 'deacon', title: '执事', talk: true, lines: KEEPER_LINES.sect });
  for (let i = 0; i < (v === 1 ? 1 : 2); i++) {
    const x = -W * 0.2 - i * 70, z = ez + 10;
    b.box(x, 22, z, 40, 4, 40, LACQ); b.box(x, 11, z, 34, 22, 34, shade(LACQ, -0.3)); b.box(x, 44, z - 18, 40, 40, 4, LACQ);
    b.solid(x, z, 46, 46);
    b.seat({ x, z: z - 2, fx: 0, fz: 1, sit: true, role: 'elder', title: '长老', lines: ['近来山下不太平。', '弟子们该多历练历练。'] });
  }
  // 香炉、蒲团、长明灯
  b.furnace(0, -D * 0.33, 1.1);
  for (const s of [-1, 1]) for (let i = 0; i < 2; i++) b.cushion(s * (60 + i * 50), -D * 0.2 + i * 6);
  for (const s of [-1, 1]) { b.candle(s * (dw / 2 + 30), dz + 40, 90); b.lantern(s * W * 0.3, -D * 0.5, 230, 1.4); }
  // 殿里的弟子：两个侍立在宝座台两侧，几个外门弟子跪坐在蒲团上听训
  for (const s of [-1, 1]) b.seat({ x: s * (dw / 2 + 24), z: dz + 20, fx: 0, fz: 1, sit: false, role: 'helper', title: '侍立弟子' });
  for (let i = 0; i < (v === 1 ? 3 : 2); i++) { const s = i % 2 ? 1 : -1, k = Math.floor(i / 2); b.seat({ x: s * (60 + k * 50), z: -D * 0.2 + k * 6 - 4, fx: 0, fz: -1, sit: true, role: 'patron', title: '外门弟子', lines: ['弟子谨记。', '……'] }); }
  // 殿匾：屏风上方一块黑底金边的大匾
  b.box(0, 262, back + 6, Math.min(dw * 0.6, 220), 46, 6, DARK); b.box(0, 262, back + 9.5, Math.min(dw * 0.6, 220) - 12, 34, 1, '#3a2a20');
  for (let i = 0; i < 3; i++) b.box(-50 + i * 50, 262, back + 10.5, 22, 22, 1, GOLD);
  // 两侧墙上挂长幡
  for (const s of [-1, 1]) for (let i = 0; i < 2; i++) b.box(s * (W / 2 - 14), 170, -D * (0.35 + i * 0.3), 4, 160, 40, i % 2 ? '#c8a040' : '#8a2a24');
  return { x: ex, z: ez + 40 };
}

export interface KindConf {
  /** 陈设变体的套数 */
  variants: number;
  floor: Plan['floor'];
  H: number; sill: number;
  build: (c: Ctx, v: number) => { x: number; z: number };
}
/** 以后加类别（藏经阁、丹房……）只是在这里加一份 */
export const KINDS: Record<RoomKind, KindConf> = {
  shop: { variants: 3, floor: 'wood', H: 170, sill: 22, build: shopPlan },
  inn: { variants: 3, floor: 'wood', H: 175, sill: 22, build: innPlan },
  tavern: { variants: 3, floor: 'wood', H: 175, sill: 22, build: tavernPlan },
  hall: { variants: 2, floor: 'slab', H: 300, sill: 26, build: hallPlan },
};

/** 一间屋的陈设。W、D 是屋里净宽、净深（本地），seed 定一切 */
export function makePlan(kind: RoomKind, fac: string, W: number, D: number, seed: number): Plan {
  const conf = KINDS[kind], r = mulberry32((seed ^ 0x1d00a5) >>> 0), pick = pickOf(r);
  const variant = Math.floor(r() * conf.variants), dir: -1 | 1 = r() < 0.5 ? -1 : 1;
  const b = new PB(W, D, r);
  const wood = pick(WOOD);
  const front = conf.build({ b, W, D, fac, wood, dir }, variant);
  const doorW = kind === 'hall' ? Math.min(160, W * 0.3) : Math.min(120, W * 0.36);
  // 地板颜色的细微差别也按种子：木地板偏黄 / 偏褐
  void pick;
  return { W, D, H: conf.H, sill: conf.sill, floor: kind === 'shop' && r() < 0.3 ? 'stone' : conf.floor, prims: b.prims, solids: b.solids, seats: b.seats, lamps: b.lamps, raise: b.raise, front, door: { x: 0, w: doorW }, variant };
}
