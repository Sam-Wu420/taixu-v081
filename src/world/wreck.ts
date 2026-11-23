// 野外破坏（docs/撼山客与破坏系统-设计.md 第五节「野外」、第六节第 1 项）：以后做招式的人只调这里的接口——
//   cone   锥形（背后炸开的冲击波）      line   直线（拳压、犁地）       radial 放射（高空砸下、震脚）
//   fan    扇形长沟（无极一击：从拳头往前越犁越宽）
//   uproot 拔起一块石头 / 一棵树         hold   拿在手里（每帧给位置）   hurl   扔出去，落地砸碎并触发一次 radial
//   split  把水面沿一条线劈开（两边立起水墙，一两秒后合拢）
// 每个接口都有力度和数量上限；同一帧调很多次也不卡（超过每帧的预算就只返回受波及的单位，不再倒树碎石）。
//
// 规矩（模组契约）：这里不伤人——cone / line / radial 只把「范围里有哪些单位、各自的方向和力度」返回给调用方，
// 伤害由调用方走 combat.hitEnemy / hitPlayer，击飞走近战的 launch。
// 固定种子：倒向、碎块、坑的样子都用自己的随机序列（按坐标取 hash32），地形生成、刷怪、日结算路径上的 Math.random 一个不多取。
//
// 画面：
//   · 树林成片倒：地形装饰里的树、灌木按稳定标识（坐标的哈希）记「已倒」——倒的过程是立板按时间转过去（顺着冲击方向，
//     先慢后快，落地弹一下），落地后改贴在地面上（地贴，跟着地形起伏、受光照），过一阵烂掉只剩树桩，再过一阵长回来。
//     不动地形的分块缓存、不重烘静态图集：倒了的那几棵由 render.ts 跳过原来的画法、改画这里给的姿势。
//   · 地上的坑、沟、龟裂：代码画的带明暗的贴图，画进地贴（贴合山坡、夜里跟着变暗）；坑里、沟里的草清掉，周围的草压伏。
//     小的一会儿就淡掉；大坑、长沟留几个游戏日、存进存档（ws.wreck，可选字段，存档版本不升），有上限，最旧的先淘汰。
//     只是看的：不改地形高度和通行。
//   · 巨石、礁石、船骸碎成几大块滚开（breakables.smash 调 chunksOf），外加 gore 的碎屑。
//   · 特效（扬尘、飞土、水墙）在 gl/wreckgl.ts，散得快，不留一屏灰雾。
import type { Combat, Enemy } from './combat';
import type { Drawable } from './life';
import type { Deco, TreeDeco, ImgDeco } from './terrain';
import type { Rock, RockKind } from './breakables';
import { rockSprite } from './breakables';
import { hash32 } from './brawlrng';
import { mulberry32 } from '../core/rng';
import { makeCanvas } from '../core/canvas';
import { ACTIVE_MAP, LOC_BY_ID } from '../data/world';
import { audio } from './audio';
import { TownWreck, type TWResult } from './townwreck';

/** 地形分块边长（terrain.ts 的 CHUNK；这里抄一份，免得为一个数去拉地形模块） */
const TCHUNK = 1024;
const TAU = Math.PI * 2;

export const WK = {
  /** 记着的倒树（含树桩、长回来中的）最多几棵；满了最旧的先长回去 */
  maxDown: 480,
  /** 同时躺在地上的树干最多几棵（每帧都要画进地贴）：多了最早倒的先烂掉 */
  maxLying: 60,
  /** 树倒下以后多久长回来：游戏时钟秒数（一个昼夜 240 秒），或者日历过了这么多天（闭关、远行） */
  regrow: 240, regrowDays: 120,
  /** 倒地的树干在地上躺多久、烂掉要多久、长回来要多久（秒） */
  lieT: 40, rotT: 3, growT: 2.2, shrubLie: 14,
  /** 短命的坑、沟、龟裂：最多几处，各留多久（秒） */
  maxMarks: 60, markLife: 40, crackLife: 60,
  /** 留得久的大坑、长沟：最多几处（所有图合计），留几天（日历日；一个昼夜约 120 日——三个昼夜上下） */
  maxKeep: 48, keepDays: 360,
  /** 多大算「大坑」「长沟」（坑的半径、沟的长度，世界单位） */
  bigPit: 150, bigFurrow: 600,
  /** 石头碎成的大块：最多几块、各留多久（秒） */
  maxChunks: 36, chunkLife: 7,
  /** 拔起来拿在手里 / 飞在半空的：最多几件；拿着没人扔多久自己掉下来（秒） */
  maxCarry: 6, carryIdle: 12,
  /** 同时劈开的水沟最多几道 */
  maxSplit: 3,
  /** 草被压伏的范围：最多几处、多久回正（秒） */
  maxGrass: 40, grassLife: 25,
  /** 一次调用最多倒几棵树、碎几块石头、返回几个单位 */
  call: { trees: 80, rocks: 12, units: 40 },
  /** 一帧的预算：完整处理几次调用、合计倒几棵树 / 碰几块石头、发几个特效事件、现建几块地形装饰 */
  frame: { calls: 32, trees: 240, rocks: 30, fx: 12, builds: 2 },
  /** 倒树的「重力」（世界单位 / 秒²，画面上的，比真实的夸张） */
  fallG: 1400,
} as const;

export type WreckSrc = Enemy | 'p' | null | undefined;
/** 受波及的一个单位：e = null 表示主角。ux / uy 是该往哪边推（单位向量），k 是 0‥1 的远近衰减，power = 力度 × k */
export interface WreckHit { e: Enemy | null; player: boolean; ally: boolean; x: number; y: number; ux: number; uy: number; d: number; k: number; power: number; launchable: boolean }
export interface WreckResult {
  /** 这一下倒了几棵树（含灌木、小石景）、碰了几块可破坏物、碎了几块 */
  trees: number; rocks: number; smashed: number;
  /** 范围里的单位（调用方自己去打：combat.hitEnemy / hitPlayer、brawl.launch） */
  units: WreckHit[];
  /** 留下的坑 / 沟 / 龟裂（没留就是 null） */
  mark: WreckMark | null;
  /** 有没有因为数量上限、每帧预算被截掉一部分 */
  capped: boolean;
  /** 城里：坏了几件小件、几座房子掉档、记了多少账（不在城里就是 undefined；world/townwreck.ts） */
  town?: TWResult;
}
export interface WreckOpts {
  /** 地上留什么：radial 默认坑（'pit'），震脚用 'crack'（成圈龟裂）；'none' 不留 */
  mark?: 'pit' | 'crack' | 'none';
  /** 这一下最多倒几棵树、碰几块石头（不超过 WK.call） */
  maxTrees?: number; maxRocks?: number;
  /** 不发特效（测试、远处的） */
  fx?: boolean;
  /** 震不震屏（默认震，按离主角远近） */
  shake?: boolean;
}
/** 地上的痕迹。k：pit 圆坑、furrow 直沟、crack 成圈龟裂、fan 扇形长沟（起点半宽 r、末端半宽 r2）。m：哪张图；keep：留得久（存档）；d：生成时的日历日；c：生成时的破坏钟 */
export interface WreckMark { k: 'pit' | 'furrow' | 'crack' | 'fan'; m: string; x: number; y: number; x2?: number; y2?: number; r: number; r2?: number; s: number; d: number; c: number; keep: boolean; p: number; life?: number }
/** 存档里的那一份（ws.wreck，可选） */
export interface WreckSave { v: number; marks: WreckMark[] }

type DownKind = 'tree' | 'shrub' | 'stone' | 'reed';
type DownPh = 'wait' | 'fall' | 'lie' | 'rot' | 'stump' | 'gone' | 'grow';
/** 一棵倒了的树（或灌木、小石景）。lx/ly：躺下的方向（世界，单位向量），px/py：躺下后树冠的横向（世界向量，落地那一刻按镜头定下） */
export interface WreckDown {
  key: number; kind: DownKind; x: number; y: number; h: number; w: number; dir: number; ph: DownPh;
  t: number; th: number; om: number; hits: number; born: number; day: number; wait: number;
  lx: number; ly: number; px: number; py: number; v: number; uproot: boolean;
  /** 扔出去落地的树（不在地形装饰里）：自己带着装饰的样子 */
  deco?: Deco;
}
/** 拔起来的东西（石头或树） */
export interface WreckCarry {
  id: number; kind: 'rock' | 'tree';
  rock?: { kind: RockKind; v: number; s: number; flip: boolean; r: number; h: number };
  deco?: TreeDeco;
  x: number; y: number; z: number; rot: number; vr: number;
  st: 'lift' | 'held' | 'fly' | 'done'; t: number; idle: number;
  /** 飞行：起点、终点、用时、弧高 */
  fx0: number; fy0: number; fz0: number; tx: number; ty: number; T: number; arc: number;
  power: number; radius: number; src: WreckSrc;
  /** 落地以后填上（radial 的结果）；onLand 落地时调一次 */
  result: WreckResult | null; onLand?: (r: WreckResult) => void;
  size: number;
}
export interface WreckSplit { id: number; x0: number; y0: number; x1: number; y1: number; w: number; t: number; dur: number; p: number; pal: { mid: [number, number, number]; deep: [number, number, number]; foam: [number, number, number] }; medium: string }
export type SplitResult = { ok: true; split: WreckSplit } | { ok: false; reason: string };
/** 画面这边要的事件（gl/wreckgl.ts 每帧取走） */
export interface WreckFx { k: 'radial' | 'cone' | 'line' | 'fell' | 'uproot' | 'land' | 'chunk' | 'split' | 'close'; x: number; y: number; x2?: number; y2?: number; r?: number; dir?: number; half?: number; p: number; seed: number; c?: number }
/** 镜头：屏幕右方、上方在地面上的方向，地面纵深压缩（render.ts 每帧给） */
export interface WreckView { rx: number; ry: number; ux: number; uy: number; fs: number }
/** 立板姿势：贴图的横轴（wx, wy）、竖轴「向上」（ux, uy），都是立板平面里的单位（2D 比例） */
export interface WreckPose { wx: number; wy: number; ux: number; uy: number; a: number }
interface Chunk { pc: Piece; x: number; y: number; z: number; vx: number; vy: number; vz: number; rot: number; vr: number; t: number; s: number; flip: boolean }
interface GrassZone { sh: 0 | 1 | 2; x: number; y: number; x2: number; y2: number; r: number; dir: number; half: number; t0: number; life: number }

/** 一棵装饰物的稳定标识（坐标的哈希，记在装饰物上） */
export function decoKey(d: Deco): number {
  const D = d as Deco & { _wk?: number };
  return D._wk ??= hash32(Math.round(d.x * 4), Math.round(d.y * 4), 0x7ee);
}

export class WreckSys {
  /** 倒了的树（按装饰物的稳定标识；Map 的次序就是倒下的先后） */
  readonly down = new Map<number, WreckDown>();
  /** 扔出去落地躺着的树 */
  props: WreckDown[] = [];
  /** 短命的痕迹（大的在 ws.wreck 里） */
  marks: WreckMark[] = [];
  chunks: Chunk[] = [];
  carries: WreckCarry[] = [];
  splits: WreckSplit[] = [];
  /** 给 gl/wreckgl.ts 的事件 */
  fx: WreckFx[] = [];
  private grass: GrassZone[] = [];
  view: WreckView = { rx: 1, ry: 0, ux: 0, uy: -1, fs: 1 };
  /** 破坏钟（游戏时间，秒） */
  clock = 0;
  private scope = '';
  private wsRef: object | null = null;
  private seq = 1;
  private rs = 0x77ec51;
  /** 这一帧的预算用了多少 */
  private used = { calls: 0, trees: 0, rocks: 0, fx: 0, builds: 0 };
  private dayT = 0;
  /** 测试：一共倒了几棵、碎了几块 */
  stats = { felled: 0, smashed: 0, calls: 0, capped: 0 };
  /** 城镇那一层（城里的小件、房子、地面、城里的树归它管；world/townwreck.ts） */
  readonly town: TownWreck;
  constructor(readonly c: Combat) { this.town = new TownWreck(c); }
  private get g() { return this.c.game; }
  /** 自己的随机序列（mulberry32 的一步；不碰 Math.random） */
  private rnd(): number { let t = (this.rs = (this.rs + 0x6d2b79f5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  /** 测试用：重置序列 */
  reseed(s: number) { this.rs = s | 0; }
  get downCount() { return this.down.size + this.props.length; }

  reset() {
    this.down.clear(); this.props = []; this.marks = []; this.chunks = []; this.carries = []; this.splits = []; this.fx = []; this.grass = [];
    this.scope = '';
    this.town.reset();
  }

  /** 现在是哪一片（换图、进出秘境、读档就把只在内存里的整个换掉；大坑在存档里，按图分开） */
  private scopeKey(): string {
    const g = this.g;
    if (g.xukong?.active || g.xukong?.fight?.on || g.inCave) return '';
    if (g.mijing?.active) return 'mj';
    if (g.offWorld) return '';
    return 'w:' + ACTIVE_MAP;
  }
  /** 换了片（换图、进出秘境）或读了档：只在内存里的全部作废；读进来的大坑算作早就有的（不再播「砸出来」那一下） */
  private sync() {
    const g = this.g, sc = this.scopeKey();
    if (sc === this.scope && this.wsRef === g.ws) return;
    if (this.wsRef !== g.ws) for (const m of g.ws?.wreck?.marks ?? []) m.c = -1e6;
    this.down.clear(); this.props = []; this.marks = []; this.chunks = []; this.carries = []; this.splits = []; this.grass = [];
    this.scope = sc; this.wsRef = g.ws;
  }
  /** 大坑、长沟存档那一份（读档换了 ws 自然就换了） */
  get keep(): WreckMark[] { return this.g.ws?.wreck?.marks ?? []; }
  private store(): WreckSave { const ws = this.g.ws; return ws.wreck ??= { v: 1, marks: [] }; }
  /** 此刻能画、能存的痕迹（当前这张图的） */
  private get world() { return this.scope.startsWith('w:'); }

  // ================================================================ 每帧
  update(dt: number) {
    this.clock += dt;
    this.used.calls = this.used.trees = this.used.rocks = this.used.fx = this.used.builds = 0;
    const g = this.g;
    this.sync();
    if (this.fx.length > 64) this.fx.splice(0, this.fx.length - 64);   // 没有画面（无头）时别越攒越多
    this.tickDown(dt);
    this.tickChunks(dt);
    this.tickCarries(dt);
    this.town.update(dt);
    for (let i = this.splits.length - 1; i >= 0; i--) { const s = this.splits[i]; const was = s.t < s.dur - 0.7; s.t += dt; if (was && s.t >= s.dur - 0.7) this.pushFx({ k: 'close', x: s.x0, y: s.y0, x2: s.x1, y2: s.y1, r: s.w, p: s.p, seed: s.id }); if (s.t >= s.dur) this.splits.splice(i, 1); }
    // 短命的痕迹、压伏的草
    if (this.marks.length) this.marks = this.marks.filter((m) => this.clock - m.c < (m.life ?? WK.markLife));
    if (this.grass.length) this.grass = this.grass.filter((z) => this.clock - z.t0 < z.life);
    // 大坑过期（每秒看一次就够）
    this.dayT -= dt;
    if (this.dayT <= 0) {
      this.dayT = 1;
      const st = g.ws?.wreck;
      if (st?.marks.length) { const day = g.day; const keep = st.marks.filter((m) => day - m.d < WK.keepDays && day >= m.d - 1); if (keep.length !== st.marks.length) st.marks = keep; }
    }
  }
  private tickDown(dt: number) {
    const g = this.g, regrowAt = this.clock - WK.regrow, dayAt = g.day - WK.regrowDays;
    let lying = 0;
    for (const s of this.down.values()) if (s.ph === 'lie') lying++;
    for (const [k, s] of this.down) {
      s.t += dt;
      switch (s.ph) {
        case 'wait': if (s.t >= s.wait) { s.ph = 'fall'; s.t = 0; } break;
        case 'fall': this.integrate(s, dt); break;
        case 'lie': if (s.t >= (s.kind === 'tree' ? WK.lieT : WK.shrubLie) || lying > WK.maxLying) { s.ph = 'rot'; s.t = 0; lying--; } break;
        case 'rot': if (s.t >= WK.rotT) { s.ph = s.kind === 'tree' && !s.uproot ? 'stump' : 'gone'; s.t = 0; } break;
        case 'stump': case 'gone': if (s.born < regrowAt || s.day < dayAt) { s.ph = 'grow'; s.t = 0; } break;
        case 'grow': if (s.t >= WK.growT) this.down.delete(k); break;
      }
    }
    for (let i = this.props.length - 1; i >= 0; i--) {
      const s = this.props[i]; s.t += dt;
      if (s.ph === 'lie' && s.t >= WK.lieT) { s.ph = 'rot'; s.t = 0; }
      else if (s.ph === 'rot' && s.t >= WK.rotT) this.props.splice(i, 1);
    }
  }
  /** 倒下的过程：绕树根转的细杆，角加速度 ∝ sin θ（先慢后快），落地弹一下再躺平 */
  private integrate(s: WreckDown, dt: number) {
    const L = Math.max(40, s.h), k = 1.5 * WK.fallG / L;
    let left = dt;
    while (left > 0) {
      const h = Math.min(left, 1 / 120); left -= h;
      s.om += k * Math.sin(Math.max(0.02, s.th)) * h; s.th += s.om * h;
      if (s.th >= Math.PI / 2) {
        s.th = Math.PI / 2;
        if (s.hits === 0) { s.om = -s.om * 0.2; s.hits = 1; this.landFx(s); }
        else { s.om = 0; this.settle(s); return; }
      }
    }
  }
  /** 落地：定下躺着的方向和横向（之后镜头怎么转，地上那棵都不动） */
  private settle(s: WreckDown) {
    const V = this.view, cd = Math.cos(s.dir), sd = Math.sin(s.dir);
    const cx = cd * V.rx + sd * V.ry, phi = Math.PI / 2 * cx, sc = 1 + (V.fs - 1) * Math.abs(Math.sin(phi));
    const wx = Math.cos(phi) * sc, wy = Math.sin(phi) * sc;
    s.lx = cd; s.ly = sd;
    s.px = wx * V.rx - wy / V.fs * V.ux; s.py = wx * V.ry - wy / V.fs * V.uy;
    s.ph = 'lie'; s.t = 0;
  }
  private landFx(s: WreckDown) {
    const L = s.h * 0.62;
    this.pushFx({ k: 'fell', x: s.x + Math.cos(s.dir) * L, y: s.y + Math.sin(s.dir) * L * 0.9, dir: s.dir, r: s.w, p: s.kind === 'tree' ? 1 : 0.5, seed: s.key });
  }

  // ================================================================ 公共：查询
  /** render.ts：这棵装饰物倒了没有（等着倒的、没倒的返回 null） */
  treeAt(d: Deco): WreckDown | null {
    if (!this.down.size) return null;
    const s = this.down.get(decoKey(d));
    return s && s.ph !== 'wait' ? s : null;
  }
  /** 倒下 / 长回来过程中立板的姿势（结果写进 out） */
  pose(s: WreckDown, out: WreckPose): WreckPose {
    const V = this.view;
    if (s.ph === 'grow') { const u = Math.min(1, s.t / WK.growT), g = 0.25 + 0.75 * (1 - Math.pow(1 - u, 3)); out.wx = g; out.wy = 0; out.ux = 0; out.uy = -g; out.a = Math.min(1, u * 3); return out; }
    const th = s.ph === 'fall' ? s.th : s.ph === 'wait' ? 0 : Math.PI / 2;
    const cd = Math.cos(s.dir), sd = Math.sin(s.dir), cx = cd * V.rx + sd * V.ry, cy = cd * V.ux + sd * V.uy;
    const st = Math.sin(th), ct = Math.cos(th);
    out.ux = st * cx; out.uy = -(ct + st * cy * V.fs);
    const phi = th * cx, sc = 1 + (V.fs - 1) * Math.abs(Math.sin(phi));
    out.wx = Math.cos(phi) * sc; out.wy = Math.sin(phi) * sc; out.a = 1;
    return out;
  }
  /** 躺在地上那一段的透明度（烂掉时淡出） */
  lieAlpha(s: WreckDown): number { return s.ph === 'rot' ? Math.max(0, 1 - s.t / WK.rotT) : 1; }
  /** 树桩还在不在、多不透明 */
  stumpAlpha(s: WreckDown): number {
    if (s.kind !== 'tree' || s.uproot) return 0;
    if (s.ph === 'grow') return Math.max(0, 1 - s.t / (WK.growT * 0.6));
    if (s.ph === 'fall') return Math.max(0, Math.min(1, (s.th - 0.55) / 0.5));   // 树干倒过去一截才露出树桩（不然树桩挡在还立着的树前面）
    return s.ph === 'wait' ? 0 : 1;
  }
  /** 树桩的立板（代码画的，按大小分几档） */
  stumpSprite(s: WreckDown): StaticSpriteLike { return stumpSprite(Math.min(2, Math.floor(s.w / 70)), s.v & 3); }
  /** 草：画面范围里有没有要压伏 / 清掉的（render.drawGrass 每帧问一次；没有返回 false，草照旧） */
  grassPrep(left: number, top: number, right: number, bottom: number): boolean {
    const L = this.gl; L.length = 0;
    if (!this.world && this.scope !== 'mj') return false;
    const pad = 400;
    const vis = (x0: number, y0: number, x1: number, y1: number) => !(x1 < left - pad || x0 > right + pad || y1 < top - pad || y0 > bottom + pad);
    for (const m of this.keep) if (m.m === ACTIVE_MAP && this.world && this.markVis(m, vis)) L.push(m);
    for (const m of this.marks) if (this.markVis(m, vis)) L.push(m);
    const Z = this.gz; Z.length = 0;
    for (const z of this.grass) if (vis(Math.min(z.x, z.x2) - z.r, Math.min(z.y, z.y2) - z.r, Math.max(z.x, z.x2) + z.r, Math.max(z.y, z.y2) + z.r)) Z.push(z);
    return L.length > 0 || Z.length > 0;
  }
  private gl: WreckMark[] = []; private gz: GrassZone[] = [];
  private markVis(m: WreckMark, vis: (a: number, b: number, c: number, d: number) => boolean) {
    const R = m.k === 'furrow' ? m.r * 1.4 : m.k === 'fan' ? Math.max(m.r, m.r2 ?? m.r) * 1.4 : m.r * 1.7;
    return vis(Math.min(m.x, m.x2 ?? m.x) - R, Math.min(m.y, m.y2 ?? m.y) - R, Math.max(m.x, m.x2 ?? m.x) + R, Math.max(m.y, m.y2 ?? m.y) + R);
  }
  /** 草（grassPrep 之后）：0 照旧；0‥1 压伏多少；2 清掉 */
  grassAt(x: number, y: number): number {
    let f = 0;
    for (const m of this.gl) {
      if (m.k === 'pit') { const d = Math.hypot(x - m.x, y - m.y); if (d < m.r * 0.92) return 2; if (d < m.r * 1.65) f = Math.max(f, 1 - (d - m.r * 0.92) / (m.r * 0.73) * 0.7); }
      else if (m.k === 'crack') { const d = Math.hypot(x - m.x, y - m.y); if (d < m.r * 0.35) return 2; if (d < m.r * 1.05) f = Math.max(f, 0.75); }
      else if (m.k === 'fan') { const q = segDist(x, y, m.x, m.y, m.x2!, m.y2!), w = m.r + ((m.r2 ?? m.r) - m.r) * Math.max(0, Math.min(1, q.t)); if (q.t > 0.02 && q.t < 0.98 && q.d < w * 0.55) return 2; if (q.d < w * 1.2 && q.t > -0.05 && q.t < 1.05) f = Math.max(f, 0.9); }
      else { const q = segDist(x, y, m.x, m.y, m.x2!, m.y2!); if (q.t > 0.02 && q.t < 0.98 && q.d < m.r * 0.5) return 2; if (q.d < m.r * 1.15 && q.t > -0.05 && q.t < 1.05) f = Math.max(f, 0.85); }
    }
    for (const z of this.gz) {
      const fade = 1 - Math.max(0, (this.clock - z.t0) / z.life - 0.6) / 0.4;
      if (fade <= 0) continue;
      let inside = false;
      if (z.sh === 0) inside = Math.hypot(x - z.x, y - z.y) < z.r;
      else if (z.sh === 1) { const q = segDist(x, y, z.x, z.y, z.x2, z.y2); inside = q.d < z.r && q.t > -0.02 && q.t < 1.02; }
      else { const dx = x - z.x, dy = y - z.y, d = Math.hypot(dx, dy); inside = d < z.r && Math.abs(angDiff(Math.atan2(dy, dx), z.dir)) < z.half; }
      if (inside) f = Math.max(f, 0.9 * fade);
    }
    return f;
  }

  // ================================================================ 公共：破坏
  /**
   * 锥形冲击波（一寸崩：力道从对手背后炸出去）。从 (x, y) 朝 dir 方向、长 length、半张角 halfAngle（弧度）；
   * power 力度（1 轻、2 中、3 重、4–5 终结技）。src：出手的人（不算进受波及的单位）。
   */
  cone(x: number, y: number, dir: number, length: number, halfAngle: number, power: number, src?: WreckSrc, o: WreckOpts = {}): WreckResult {
    const res = this.begin();
    length = clampN(length, 20, 3000); halfAngle = clampN(halfAngle, 0.05, Math.PI * 0.95); power = clampN(power, 0, 6);
    const test = (px: number, py: number, pad: number) => {
      const dx = px - x, dy = py - y, d = Math.hypot(dx, dy);
      if (d > length + pad) return null;
      const da = Math.abs(angDiff(Math.atan2(dy, dx), dir));
      if (d > 30 && da > halfAngle + Math.atan2(pad, Math.max(1, d))) return null;
      const k = (1 - Math.min(1, d / length) * 0.6) * (1 - Math.min(1, da / halfAngle) * 0.4);
      const a = d > 1 ? Math.atan2(dy, dx) : dir, ua = dir + angDiff(a, dir) * 0.6;   // 顺着锥的方向往外推
      return { k, ux: Math.cos(ua), uy: Math.sin(ua), d };
    };
    this.unitsBy(test, x, y, length + 60, power, src, res);
    if (!this.full(res)) return res;
    const bx0 = x + Math.min(0, Math.cos(dir - halfAngle) * length, Math.cos(dir + halfAngle) * length, Math.cos(dir) * length) - 60;
    const bx1 = x + Math.max(0, Math.cos(dir - halfAngle) * length, Math.cos(dir + halfAngle) * length, Math.cos(dir) * length) + 60;
    const by0 = y + Math.min(0, Math.sin(dir - halfAngle) * length, Math.sin(dir + halfAngle) * length, Math.sin(dir) * length) - 60;
    const by1 = y + Math.max(0, Math.sin(dir - halfAngle) * length, Math.sin(dir + halfAngle) * length, Math.sin(dir) * length) + 60;
    this.fellIn(bx0, by0, bx1, by1, (d) => { const q = test(d.x, d.y, 0); if (!q) return null; return { pk: power * q.k, dir: Math.atan2(q.uy, q.ux), delay: q.d / 1800, d: q.d }; }, Math.min(o.maxTrees ?? WK.call.trees, WK.call.trees), res);
    this.rocksIn(x + Math.cos(dir) * length * 0.5, y + Math.sin(dir) * length * 0.5, length * 0.6 + 120, (r) => { const q = test(r.x, r.y, r.r * 0.6); return q ? { pk: power * q.k, dir: Math.atan2(q.uy, q.ux) } : null; }, Math.min(o.maxRocks ?? WK.call.rocks, WK.call.rocks), res);
    this.addGrass({ sh: 2, x, y, x2: x, y2: y, r: length, dir, half: halfAngle, t0: this.clock, life: WK.grassLife });
    this.townArea(res, test, bx0, by0, bx1, by1, power, src, { k: 'cone', x, y, r: length, dir }, o.mark !== 'none' && power >= 1.5);
    if (o.mark !== 'none' && power >= 1.5) res.mark = this.addMark({ k: 'crack', m: ACTIVE_MAP, x: x + Math.cos(dir) * 30, y: y + Math.sin(dir) * 30, r: clampN(40 + power * 22, 40, 160), s: this.markSeed(x, y), d: this.g.day, c: this.clock, keep: false, p: power, life: WK.crackLife * 0.6 });
    if (o.fx !== false) { this.pushFx({ k: 'cone', x, y, dir, half: halfAngle, r: length, p: power, seed: this.markSeed(x, y) }); this.boom(x, y, power, o.shake); }
    return res;
  }
  /** 直线（拳压·开山、犁地）：从 (x0, y0) 到 (x1, y1)、宽 width。沿线犁出一道沟，树往两边倒，石头裂开 */
  line(x0: number, y0: number, x1: number, y1: number, width: number, power: number, src?: WreckSrc, o: WreckOpts = {}): WreckResult {
    const res = this.begin();
    width = clampN(width, 10, 1200); power = clampN(power, 0, 6);
    const L = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / L, uy = (y1 - y0) / L, nx = -uy, ny = ux, half = width / 2;
    const test = (px: number, py: number, pad: number) => {
      const q = segDist(px, py, x0, y0, x1, y1);
      if (q.d > half + pad || q.t < -pad / L || q.t > 1 + pad / L) return null;
      const side = (px - x0) * nx + (py - y0) * ny >= 0 ? 1 : -1;
      const k = 1 - Math.min(1, q.d / (half + pad + 1)) * 0.5;
      const vx = nx * side * 0.8 + ux * 0.45, vy = ny * side * 0.8 + uy * 0.45, vl = Math.hypot(vx, vy);
      return { k, ux: vx / vl, uy: vy / vl, d: q.t * L, side };
    };
    this.unitsBy(test, (x0 + x1) / 2, (y0 + y1) / 2, L / 2 + half + 60, power, src, res, 30);
    if (!this.full(res)) return res;
    const pad = half + 200;
    this.fellIn(Math.min(x0, x1) - pad, Math.min(y0, y1) - pad, Math.max(x0, x1) + pad, Math.max(y0, y1) + pad, (d) => {
      const q = test(d.x, d.y, Math.min(200, d.h * 0.25)); if (!q) return null;
      return { pk: power * q.k, dir: Math.atan2(q.uy, q.ux), delay: Math.max(0, q.d) / 3000, d: q.d };
    }, Math.min(o.maxTrees ?? WK.call.trees * 0.6, WK.call.trees), res);
    this.rocksIn((x0 + x1) / 2, (y0 + y1) / 2, L / 2 + half + 100, (r) => { const q = test(r.x, r.y, r.r * 0.6); return q ? { pk: power * q.k, dir: Math.atan2(q.uy, q.ux) } : null; }, Math.min(o.maxRocks ?? WK.call.rocks, WK.call.rocks), res);
    this.addGrass({ sh: 1, x: x0, y: y0, x2: x1, y2: y1, r: half * 1.4 + 30, dir: 0, half: 0, t0: this.clock, life: WK.grassLife });
    this.townArea(res, test, Math.min(x0, x1) - half, Math.min(y0, y1) - half, Math.max(x0, x1) + half, Math.max(y0, y1) + half, power, src, { k: 'line', x: x0, y: y0, x2: x1, y2: y1, r: width }, o.mark !== 'none' && power >= 0.8 && L > 60);
    if (o.mark !== 'none' && power >= 0.8 && L > 60) {
      const w = clampN(width * 0.45 * (0.7 + power * 0.15), 26, 220);
      res.mark = this.addMark({ k: 'furrow', m: ACTIVE_MAP, x: x0, y: y0, x2: x1, y2: y1, r: w, s: this.markSeed(x0, y0), d: this.g.day, c: this.clock, keep: L >= WK.bigFurrow && power >= 2, p: power });
    }
    if (o.fx !== false) { this.pushFx({ k: 'line', x: x0, y: y0, x2: x1, y2: y1, r: width, p: power, seed: this.markSeed(x0, y1) }); this.boom((x0 + x1) / 2, (y0 + y1) / 2, power * 0.8, o.shake); }
    return res;
  }
  /**
   * 扇形（r7-fx3d 无极一击）：从 (x, y) 朝 dir 犁出去、长 length，起点半宽 w0、末端半宽 w1——越往前越宽。
   * 沿途犁出一道扇形长沟（留得久），树顺着拳路往前、往两边倒（倒的先后按 3000/秒 推过去），石头裂开；范围里的单位照常返回（不伤人）
   */
  fan(x: number, y: number, dir: number, length: number, w0: number, w1: number, power: number, src?: WreckSrc, o: WreckOpts = {}): WreckResult {
    const res = this.begin();
    length = clampN(length, 40, 4000); w0 = clampN(w0, 10, 1200); w1 = clampN(w1, w0, 1600); power = clampN(power, 0, 6);
    const ux = Math.cos(dir), uy = Math.sin(dir), nx = -uy, ny = ux;
    const x1 = x + ux * length, y1 = y + uy * length;
    const test = (px: number, py: number, pad: number) => {
      const t = (px - x) * ux + (py - y) * uy, n = (px - x) * nx + (py - y) * ny;
      if (t < -pad || t > length + pad) return null;
      const half = w0 + (w1 - w0) * clampN(t / length, 0, 1), an = Math.abs(n);
      if (an > half + pad) return null;
      const side = n >= 0 ? 1 : -1, lat = Math.min(1, an / half);
      const k = (1 - clampN(t / length, 0, 1) * 0.45) * (1 - lat * 0.45);
      const vx = ux * 0.85 + nx * side * (0.25 + 0.6 * lat), vy = uy * 0.85 + ny * side * (0.25 + 0.6 * lat), vl = Math.hypot(vx, vy);
      return { k, ux: vx / vl, uy: vy / vl, d: Math.max(0, t) };
    };
    const cx = (x + x1) / 2, cy = (y + y1) / 2, R = Math.hypot(length / 2, w1) + 60;
    this.unitsBy(test, cx, cy, R, power, src, res, 30);
    if (!this.full(res)) return res;
    const pad = w1 + 200;
    this.fellIn(Math.min(x, x1) - pad, Math.min(y, y1) - pad, Math.max(x, x1) + pad, Math.max(y, y1) + pad, (d) => {
      const q = test(d.x, d.y, Math.min(160, d.h * 0.2)); if (!q) return null;
      return { pk: power * q.k, dir: Math.atan2(q.uy, q.ux), delay: q.d / 3000, d: q.d };
    }, Math.min(o.maxTrees ?? WK.call.trees, WK.call.trees), res);
    this.rocksIn(cx, cy, R + 60, (r) => { const q = test(r.x, r.y, r.r * 0.6); return q ? { pk: power * q.k, dir: Math.atan2(q.uy, q.ux) } : null; }, Math.min(o.maxRocks ?? WK.call.rocks, WK.call.rocks), res);
    this.addGrass({ sh: 1, x, y, x2: x1, y2: y1, r: (w0 + w1) * 0.6 + 30, dir: 0, half: 0, t0: this.clock, life: WK.grassLife });
    this.townArea(res, test, Math.min(x, x1) - w1, Math.min(y, y1) - w1, Math.max(x, x1) + w1, Math.max(y, y1) + w1, power, src, { k: 'line', x, y, x2: x1, y2: y1, r: w0 + w1 }, o.mark !== 'none' && power >= 0.8);
    if (o.mark !== 'none' && power >= 0.8) {
      // 沟比冲击的扇面窄一截（扇面里倒树、沟在当中）：起点半宽四成、末端半宽三成五
      res.mark = this.addMark({ k: 'fan', m: ACTIVE_MAP, x, y, x2: x1, y2: y1, r: clampN(w0 * 0.42, 30, 260), r2: clampN(w1 * 0.36, 40, 420), s: this.markSeed(x, y), d: this.g.day, c: this.clock, keep: length >= WK.bigFurrow && power >= 2, p: power });
    }
    if (o.fx !== false) { this.pushFx({ k: 'line', x, y, x2: x1, y2: y1, r: (w0 + w1), p: power, seed: this.markSeed(x, y1) }); this.boom(cx, cy, power * 0.8, o.shake); }
    return res;
  }
  /** 放射（千钧坠、陨星坠、震脚）：(x, y) 为心、半径 radius。默认砸出一个坑（大小按力度），树向外倒，冲击波一圈 */
  radial(x: number, y: number, radius: number, power: number, src?: WreckSrc, o: WreckOpts = {}): WreckResult {
    const res = this.begin();
    radius = clampN(radius, 20, 3000); power = clampN(power, 0, 6);
    const test = (px: number, py: number, pad: number) => {
      const dx = px - x, dy = py - y, d = Math.hypot(dx, dy);
      if (d > radius + pad) return null;
      const a = d > 1 ? Math.atan2(dy, dx) : 0;
      return { k: 1 - Math.min(1, d / radius) * 0.7, ux: Math.cos(a), uy: Math.sin(a), d };
    };
    this.unitsBy(test, x, y, radius + 60, power, src, res, 30);
    if (!this.full(res)) return res;
    this.fellIn(x - radius - 60, y - radius - 60, x + radius + 60, y + radius + 60, (d) => { const q = test(d.x, d.y, 30); if (!q) return null; return { pk: power * (1 - Math.min(1, q.d / radius) * 0.5), dir: Math.atan2(q.uy, q.ux), delay: q.d / 1400, d: q.d }; }, Math.min(o.maxTrees ?? WK.call.trees, WK.call.trees), res);
    this.rocksIn(x, y, radius + 90, (r) => { const q = test(r.x, r.y, r.r * 0.6); return q ? { pk: power * q.k, dir: Math.atan2(q.uy, q.ux) } : null; }, Math.min(o.maxRocks ?? WK.call.rocks, WK.call.rocks), res);
    this.addGrass({ sh: 0, x, y, x2: x, y2: y, r: radius * 0.95, dir: 0, half: 0, t0: this.clock, life: WK.grassLife });
    const mk = o.mark ?? 'pit';
    this.townArea(res, test, x - radius, y - radius, x + radius, y + radius, power, src, { k: mk === 'crack' ? 'crack' : 'radial', x, y, r: radius }, mk !== 'none' && power >= 0.6);
    if (mk === 'pit' && power >= 0.6) {
      const r = clampN(radius * (0.16 + 0.05 * power), 30, 420);
      res.mark = this.addMark({ k: 'pit', m: ACTIVE_MAP, x, y, r, s: this.markSeed(x, y), d: this.g.day, c: this.clock, keep: r >= WK.bigPit, p: power });
    } else if (mk === 'crack' && power >= 0.6) {
      res.mark = this.addMark({ k: 'crack', m: ACTIVE_MAP, x, y, r: clampN(radius * 0.7, 60, 900), s: this.markSeed(x, y), d: this.g.day, c: this.clock, keep: false, p: power, life: WK.crackLife });
    }
    if (o.fx !== false) { this.pushFx({ k: 'radial', x, y, r: radius, p: power, seed: this.markSeed(x, y), c: mk === 'crack' ? 1 : 0 }); this.boom(x, y, power, o.shake); }
    return res;
  }

  /** 砸 / 犁一个坑、一条沟、一圈龟裂（不倒树、不打人；给需要单独留痕迹的招式） */
  pit(x: number, y: number, r: number, power = 2): WreckMark | null { return this.addMark({ k: 'pit', m: ACTIVE_MAP, x, y, r: clampN(r, 20, 420), s: this.markSeed(x, y), d: this.g.day, c: this.clock, keep: r >= WK.bigPit, p: power }); }
  furrow(x0: number, y0: number, x1: number, y1: number, w: number, power = 2): WreckMark | null { return this.addMark({ k: 'furrow', m: ACTIVE_MAP, x: x0, y: y0, x2: x1, y2: y1, r: clampN(w, 20, 220), s: this.markSeed(x0, y0), d: this.g.day, c: this.clock, keep: Math.hypot(x1 - x0, y1 - y0) >= WK.bigFurrow, p: power }); }
  cracks(x: number, y: number, r: number, power = 2): WreckMark | null { return this.addMark({ k: 'crack', m: ACTIVE_MAP, x, y, r: clampN(r, 40, 900), s: this.markSeed(x, y), d: this.g.day, c: this.clock, keep: false, p: power, life: WK.crackLife }); }

  // ---------------------------------------------------------------- 拔起、扔出去
  /**
   * 拔起 (x, y) 附近 R 以内最近的一块巨石 / 礁石 / 船骸 / 枯树（可破坏物）或一棵树（地形装饰）。what 只要石头 / 只要树。
   * 返回拿在手里的东西（原地慢慢升起来）；找不到、已经拿满了返回 null。之后每帧用 hold 给它位置，或者直接 hurl 扔出去。
   */
  uproot(x: number, y: number, R = 260, what: 'rock' | 'tree' | 'any' = 'any'): WreckCarry | null {
    this.sync();
    if (this.carries.filter((c) => c.st !== 'done').length >= WK.maxCarry) return null;
    let best: { d: number; rock?: Rock; deco?: TreeDeco } | null = null;
    if (what !== 'tree') for (const r of this.c.brawl.brk.near(x, y, R + 100)) {
      if (r.dead) continue;
      const d = Math.hypot(r.x - x, r.y - y); if (d > R || (best && d >= best.d)) continue;
      best = { d, rock: r };
    }
    const towns = what !== 'rock' && this.world ? this.townsIn(x - R, y - R, x + R, y + R) : false;
    if (what !== 'rock' && this.world) this.eachDeco(x - R, y - R, x + R, y + R, (dc) => {
      if (dc.kind !== 'tree' || (towns && this.inTown(dc.x, dc.y))) return;
      const d = Math.hypot(dc.x - x, dc.y - y); if (d > R || (best && d >= best.d)) return;
      const s = this.down.get(decoKey(dc)); if (s && s.ph !== 'grow') return;
      best = { d, deco: dc };
    });
    if (!best) return null;
    const B = best as { d: number; rock?: Rock; deco?: TreeDeco };
    const id = this.seq++;
    let cr: WreckCarry;
    const base = { id, rot: 0, vr: 0, st: 'lift' as const, t: 0, idle: 0, fx0: 0, fy0: 0, fz0: 0, tx: 0, ty: 0, T: 0, arc: 0, power: 3, radius: 0, src: undefined, result: null };
    if (B.rock) {
      const r = B.rock;
      if (!this.c.brawl.brk.lift(r)) return null;
      cr = { ...base, kind: 'rock', rock: { kind: r.kind, v: r.v, s: r.s, flip: r.flip, r: r.r, h: r.h }, x: r.x, y: r.y, z: 0, size: r.r };
      this.pit(r.x, r.y, r.r * 0.9, 1.2);
    } else {
      const d = B.deco!;
      const key = decoKey(d);
      this.down.set(key, { key, kind: 'tree', x: d.x, y: d.y, h: d.h, w: d.w, dir: 0, ph: 'gone', t: 0, th: 0, om: 0, hits: 0, born: this.clock, day: this.g.day, wait: 0, lx: 0, ly: 0, px: 0, py: 0, v: d.v, uproot: true });
      cr = { ...base, kind: 'tree', deco: d, x: d.x, y: d.y, z: 0, size: d.w * 0.5 };
      this.pit(d.x, d.y, Math.max(40, d.w * 0.35), 1);
    }
    this.carries.push(cr);
    this.pushFx({ k: 'uproot', x: cr.x, y: cr.y, r: cr.size, p: 1, seed: id });
    return cr;
  }
  /** 拿着：每帧给它的位置（离地 z） */
  hold(cr: WreckCarry, x: number, y: number, z: number, rot = cr.rot) {
    if (cr.st === 'done' || cr.st === 'fly') return;
    cr.st = 'held'; cr.x = x; cr.y = y; cr.z = Math.max(0, z); cr.rot = rot; cr.idle = 0;
  }
  /**
   * 扔出去：从 (x0, y0)（离地取它此刻的高度）飞到 (x1, y1)，落地砸碎（石头碎成几大块、树断成一截躺着）并触发一次 radial。
   * o.speed 飞行速度、o.arc 弧高（占距离的比例）、o.power 落地的力度、o.radius 落地 radial 的半径、o.src 算谁扔的、o.onLand 落地回调。
   */
  hurl(cr: WreckCarry, x0: number, y0: number, x1: number, y1: number, o: { speed?: number; arc?: number; power?: number; radius?: number; src?: WreckSrc; onLand?: (r: WreckResult) => void } = {}): boolean {
    if (cr.st === 'done' || cr.st === 'fly') return false;
    const D = Math.hypot(x1 - x0, y1 - y0);
    cr.st = 'fly'; cr.t = 0; cr.fx0 = x0; cr.fy0 = y0; cr.fz0 = cr.z || cr.size * 1.2; cr.tx = x1; cr.ty = y1;
    cr.T = clampN(D / (o.speed ?? 1500), 0.3, 3); cr.arc = clampN(o.arc ?? 0.22, 0, 1) * D;
    cr.power = clampN(o.power ?? 3, 0.5, 6); cr.radius = o.radius ?? clampN(cr.size * 3.2, 140, 900); cr.src = o.src; cr.onLand = o.onLand;
    cr.vr = (cr.kind === 'tree' ? 5 : 9) * (x1 >= x0 ? 1 : -1);
    return true;
  }
  private tickCarries(dt: number) {
    for (const cr of this.carries) {
      if (cr.st === 'done') continue;
      cr.t += dt;
      if (cr.st === 'lift') { const u = Math.min(1, cr.t / 0.45); cr.z = (1 - Math.pow(1 - u, 3)) * cr.size * 1.2; cr.rot = Math.sin(cr.t * 30) * 0.03 * (1 - u); if (u >= 1) { cr.st = 'held'; cr.idle = 0; } continue; }
      if (cr.st === 'held') { cr.idle += dt; if (cr.idle > WK.carryIdle) this.hurl(cr, cr.x, cr.y, cr.x + 1, cr.y, { speed: 400, arc: 0, power: 1 }); continue; }
      const u = Math.min(1, cr.t / cr.T);
      cr.x = cr.fx0 + (cr.tx - cr.fx0) * u; cr.y = cr.fy0 + (cr.ty - cr.fy0) * u;
      cr.z = cr.fz0 * (1 - u) + cr.arc * 4 * u * (1 - u); cr.rot += cr.vr * dt;
      if (u >= 1) this.crash(cr);
    }
    if (this.carries.length > WK.maxCarry * 2) this.carries = this.carries.filter((c) => c.st !== 'done');
  }
  /** 扔出去的东西落地 */
  private crash(cr: WreckCarry) {
    cr.st = 'done'; cr.z = 0;
    const dir = Math.atan2(cr.ty - cr.fy0, cr.tx - cr.fx0);
    if (cr.kind === 'rock' && cr.rock) {
      const fake = { x: cr.x, y: cr.y, kind: cr.rock.kind, v: cr.rock.v, s: cr.rock.s, flip: cr.rock.flip, r: cr.rock.r } as Rock;
      this.chunksOf(fake, dir, cr.power);
      this.c.fxq.push({ k: 'rubble', x: cr.x, y: cr.y, r: cr.rock.r, dir, power: Math.min(3, cr.power), kind: cr.rock.kind, big: this.c.brawl.deepWater(cr.x, cr.y) });
    } else if (cr.deco) {
      const d = cr.deco;
      this.props.push({ key: -cr.id, kind: 'tree', x: cr.x, y: cr.y, h: d.h, w: d.w, dir, ph: 'lie', t: 0, th: Math.PI / 2, om: 0, hits: 2, born: this.clock, day: this.g.day, wait: 0, lx: Math.cos(dir), ly: Math.sin(dir), px: -Math.sin(dir), py: Math.cos(dir), v: d.v, uproot: true, deco: { ...d, x: cr.x, y: cr.y } as Deco });
      if (this.props.length > 12) this.props.shift();
    }
    const r = this.radial(cr.x, cr.y, cr.radius, cr.power, cr.src);
    cr.result = r;
    this.pushFx({ k: 'land', x: cr.x, y: cr.y, r: cr.size, p: cr.power, seed: cr.id });
    try { cr.onLand?.(r); } catch (e) { console.warn('[破坏] onLand', e); }
  }

  // ---------------------------------------------------------------- 分海
  /**
   * 把水面沿 (x0, y0)→(x1, y1) 劈开：宽 width 的一道深沟，两边立起水墙，dur 秒后合拢（合拢的最后 0.7 秒水墙倒回去）。
   * 近海、别界的海水 / 冥河 / 瘴泽成立；流沙、冰海、熔岩不支持（返回 ok = false 和原因）。线上大半不是水也不行。
   */
  split(x0: number, y0: number, x1: number, y1: number, width = 260, o: { dur?: number; power?: number } = {}): SplitResult {
    this.sync();
    const g = this.g, alien = g.jueyu?.alienMedium ?? null;
    if (alien && alien !== 'ming' && alien !== 'miasma' && alien !== 'sea') return { ok: false, reason: `介质不支持：${alien}` };
    if (!this.world) return { ok: false, reason: '这里没有水面' };
    const L = Math.hypot(x1 - x0, y1 - y0); if (L < 40) return { ok: false, reason: '太短' };
    const n = Math.max(4, Math.min(40, Math.round(L / 120)));
    let wet = 0;
    for (let i = 0; i <= n; i++) { const u = i / n; if (this.c.brawl.deepWater(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u)) wet++; }
    if (wet < (n + 1) * 0.6) return { ok: false, reason: '线上大半不是水' };
    const P = (g.jueyu as unknown as { profile?: { medium: { palette: { mid: [number, number, number]; deep: [number, number, number]; foam: [number, number, number] } } } | null })?.profile;
    const pal = alien && P ? P.medium.palette : { mid: [0.2, 0.42, 0.52] as [number, number, number], deep: [0.03, 0.09, 0.15] as [number, number, number], foam: [0.88, 0.95, 0.98] as [number, number, number] };
    if (this.splits.length >= WK.maxSplit) this.splits.shift();
    const s: WreckSplit = { id: this.seq++, x0, y0, x1, y1, w: clampN(width, 60, 900), t: 0, dur: clampN(o.dur ?? 1.8, 0.8, 6) + 0.7, p: clampN(o.power ?? 3, 1, 6), pal, medium: alien ?? 'sea' };
    this.splits.push(s);
    this.pushFx({ k: 'split', x: x0, y: y0, x2: x1, y2: y1, r: s.w, p: s.p, seed: s.id });
    audio.sfx('boom', (x0 + x1) / 2, (y0 + y1) / 2);
    return { ok: true, split: s };
  }
  /** 某一点此刻被劈开了多少（0 没有，1 完全劈开——以后让人能走到海底用） */
  splitAt(x: number, y: number): number {
    let k = 0;
    for (const s of this.splits) {
      const q = segDist(x, y, s.x0, s.y0, s.x1, s.y1); if (q.d > s.w / 2 || q.t < 0 || q.t > 1) continue;
      k = Math.max(k, splitOpen(s, q.t));
    }
    return k;
  }

  // ================================================================ 内部
  private begin(): WreckResult {
    this.sync();
    this.stats.calls++;
    return { trees: 0, rocks: 0, smashed: 0, units: [], mark: null, capped: false };
  }
  /** 城镇那一层：范围碰到城（主角附近已排好布局的城、镇、海岛城；宗门不算）就转给 townwreck（小件、房子、地面、城墙焦痕、记账） */
  private townArea(res: WreckResult, test: (x: number, y: number, pad: number) => { k: number; ux: number; uy: number; d: number } | null, x0: number, y0: number, x1: number, y1: number, power: number, src: WreckSrc, shape: Parameters<TownWreck['area']>[7], mark: boolean) {
    if (!this.world) return;
    const r = this.town.area(test, x0, y0, x1, y1, power, src, shape, mark);
    if (r.houses || r.small || r.walls || r.prot) res.town = r;
  }
  /** 这一帧还有没有余量把这一下完整做完（没有就只返回单位） */
  private full(res: WreckResult): boolean {
    if (++this.used.calls > WK.frame.calls) { res.capped = true; this.stats.capped++; return false; }
    return true;
  }
  /** 范围里的单位（不含出手的人；死的、沉在水里的不算） */
  private unitsBy(test: (x: number, y: number, pad: number) => { k: number; ux: number; uy: number; d: number } | null, cx: number, cy: number, R: number, power: number, src: WreckSrc, res: WreckResult, pad = 20) {
    const B = this.c.brawl;
    for (const e of this.c.units) {
      if (e === src || e.dead || e.hideT > 0 || e.gone) continue;
      if (Math.abs(e.x - cx) > R + 200 || Math.abs(e.y - cy) > R + 200) continue;
      const q = test(e.x, e.y, pad); if (!q) continue;
      if (res.units.length >= WK.call.units) { res.capped = true; break; }
      res.units.push({ e, player: false, ally: !!e.ally, x: e.x, y: e.y, ux: q.ux, uy: q.uy, d: q.d, k: q.k, power: power * q.k, launchable: B.launchable(e) });
    }
    if (src !== 'p') {
      const p = this.g.player, q = test(p.x, p.y, pad);
      if (q && !this.g.hero.dead) res.units.push({ e: null, player: true, ally: false, x: p.x, y: p.y, ux: q.ux, uy: q.uy, d: q.d, k: q.k, power: power * q.k, launchable: true });
    }
  }
  /** 城镇、宗门、海岛的城（野外破坏不碰，城镇破坏另做）：这一下的范围里有哪几处（每次调用扫一遍地点表；没有返回 false） */
  private townL: { x: number; y: number; rx: number; ry: number }[] = [];
  private townsIn(x0: number, y0: number, x1: number, y1: number): boolean {
    const L = this.townL; L.length = 0;
    for (const z of this.g.terrain.locZones) {
      const rx = z.rx + 300, ry = z.ry + 300;
      if (z.x + rx < x0 || z.x - rx > x1 || z.y + ry < y0 || z.y - ry > y1) continue;
      const t = LOC_BY_ID.get(z.id)?.type;
      if (t === 'city' || t === 'town' || t === 'sect' || t === 'isle') L.push({ x: z.x, y: z.y, rx, ry });
    }
    return L.length > 0;
  }
  private inTown(x: number, y: number) { for (const z of this.townL) { const dx = (x - z.x) / z.rx, dy = (y - z.y) / z.ry; if (dx * dx + dy * dy < 1) return true; } return false; }
  /** 地形装饰：(x0, y0)–(x1, y1) 里的树、灌木、小石景（缓存里没有的块最多现建两块） */
  private eachDeco(x0: number, y0: number, x1: number, y1: number, fn: (d: TreeDeco) => void, imgFn?: (d: ImgDeco) => void) {
    const T = this.g.terrain;
    for (let cy = Math.floor(y0 / TCHUNK); cy <= Math.floor(y1 / TCHUNK); cy++) for (let cx = Math.floor(x0 / TCHUNK); cx <= Math.floor(x1 / TCHUNK); cx++) {
      if (!T.hasChunk(cx, cy)) continue;
      let ds = T.peekDecos(cx, cy);
      if (!ds) { if (this.used.builds >= WK.frame.builds) continue; this.used.builds++; ds = T.getDecos(cx, cy); }
      for (const d of ds) {
        if (d.x < x0 || d.x > x1 || d.y < y0 || d.y > y1) continue;
        if (d.kind === 'tree') fn(d);
        else if (d.kind === 'img' && imgFn) imgFn(d);
      }
    }
  }
  private imgKind(d: ImgDeco): DownKind | null {
    const T = this.g.terrain;
    if (d.img === T.shrubGlyph) return 'shrub';
    if (d.img === T.reedGlyph) return 'reed';
    if (T.rockGlyphs.includes(d.img)) return 'stone';
    return null;
  }
  /** 倒树：按 pick 给的力度、方向、延迟，从近到远最多 max 棵 */
  private fellIn(x0: number, y0: number, x1: number, y1: number, pick: (d: { x: number; y: number; h: number }) => { pk: number; dir: number; delay: number; d: number } | null, max: number, res: WreckResult) {
    if (!this.world) return;
    const left = WK.frame.trees - this.used.trees;
    if (left <= 0) { res.capped = true; return; }
    max = Math.min(max, left);
    const cand: { d: Deco; kind: DownKind; dir: number; delay: number; dist: number; pk: number }[] = [];
    const towns = this.townsIn(x0, y0, x1, y1);
    const consider = (d: Deco, kind: DownKind, h: number, town = false) => {
      if (!town && towns && this.inTown(d.x, d.y)) return;   // 地形装饰里落在城镇、宗门里的不归野外破坏管（城里的树是布局里的，下面单独问 townwreck）
      const s = this.down.get(decoKey(d)); if (s && s.ph !== 'grow') return;
      const q = pick({ x: d.x, y: d.y, h }); if (!q) return;
      const need = kind === 'tree' ? 0.9 + Math.min(1, h / 420) * 0.7 : kind === 'stone' ? 1.6 : kind === 'shrub' ? 0.55 : 0.3;
      if (q.pk < need) return;
      cand.push({ d, kind, dir: q.dir, delay: q.delay, dist: q.d, pk: q.pk });
    };
    this.eachDeco(x0, y0, x1, y1, (d) => consider(d, 'tree', d.h), (d) => { const k = this.imgKind(d); if (k) consider(d, k, d.h); });
    if (towns) for (const d of this.town.treesIn(x0, y0, x1, y1)) consider(d as unknown as Deco, 'tree', d.h, true);   // 城里的树（布局的 'tree' 构件）照野外的倒法
    cand.sort((a, b) => a.dist - b.dist);
    if (cand.length > max) { cand.length = max; res.capped = true; }
    for (const q of cand) {
      const jit = (hash32(decoKey(q.d), this.stats.calls) / 4294967296 - 0.5) * 0.5;
      this.fell(q.d, q.kind, q.dir + jit, q.delay, q.pk);
      res.trees++;
    }
    this.used.trees += cand.length;
    this.stats.felled += cand.length;
  }
  private fell(d: Deco, kind: DownKind, dir: number, delay: number, pk: number) {
    const key = decoKey(d);
    if (this.down.size >= WK.maxDown) this.evict();
    const h = kind === 'tree' ? d.h : d.h * 0.9;
    const s: WreckDown = { key, kind, x: d.x, y: d.y, h, w: d.w, dir, ph: delay > 0.01 ? 'wait' : 'fall', t: 0, th: 0.04, om: 0.15 + Math.min(0.75, pk * 0.12), hits: 0, born: this.clock, day: this.g.day, wait: delay, lx: 0, ly: 0, px: 0, py: 0, v: (d as TreeDeco).v ?? 0, uproot: false };
    if (kind === 'stone') { s.ph = 'gone'; this.pushFx({ k: 'chunk', x: d.x, y: d.y, r: d.w * 0.4, p: 1, seed: key }); }
    else if (kind === 'reed') { s.th = Math.PI / 2; s.ph = 'lie'; this.settle(s); }
    this.down.delete(key); this.down.set(key, s);
  }
  /** 记满了：最早倒下、已经不在动的那棵先长回去 */
  private evict() {
    for (const [k, s] of this.down) if (s.ph !== 'fall' && s.ph !== 'wait') { this.down.delete(k); return; }
    const first = this.down.keys().next(); if (!first.done) this.down.delete(first.value);
  }
  /** 可破坏物：范围里的石头按力度挨一下（够狠就碎：breakables.smash → chunksOf 碎成几大块） */
  private rocksIn(cx: number, cy: number, R: number, pick: (r: Rock) => { pk: number; dir: number } | null, max: number, res: WreckResult) {
    const brk = this.c.brawl.brk;
    if (!brk.n) return;
    const left = WK.frame.rocks - this.used.rocks;
    if (left <= 0) { res.capped = true; return; }
    const list = brk.near(cx, cy, R).filter((r) => !r.dead).map((r) => ({ r, q: pick(r) })).filter((o) => o.q).sort((a, b) => Math.hypot(a.r.x - cx, a.r.y - cy) - Math.hypot(b.r.x - cx, b.r.y - cy));
    const n = Math.min(list.length, max, left);
    if (list.length > n) res.capped = true;
    for (let i = 0; i < n; i++) {
      const { r, q } = list[i];
      brk.damage(r, q!.pk * 1.3, q!.dir);
      res.rocks++;
      if (r.dead) { res.smashed++; this.stats.smashed++; }
    }
    this.used.rocks += n;
  }
  /**
   * 巨石、礁石、船骸碎成几大块（breakables.smash 调；扔出去的石头落地也调）：把它的样子按几刀放射状的线切开，
   * 每块带着旋转往外崩，落地弹几下、滚一段停下，过几息沉下去。
   */
  chunksOf(r: Pick<Rock, 'x' | 'y' | 'kind' | 'v' | 's' | 'flip' | 'r'>, dir: number, power: number) {
    if (r.kind === 'tree') return;
    const P = rockPieces(r.kind, r.v); if (!P.length) return;
    const free = WK.maxChunks - this.chunks.length;
    if (free < P.length) this.chunks.splice(0, P.length - free);
    const sp = 170 + Math.min(3, power) * 80;
    for (const pc of P) {
      const ox = pc.cx * r.s * (r.flip ? -1 : 1), oz = pc.cy * r.s;
      const out = (ox >= 0 ? 0 : Math.PI) + (this.rnd() - 0.5) * 1.2;
      const a = this.rnd() < 0.55 ? dir + (this.rnd() - 0.5) * 1.4 : out + (this.rnd() - 0.5) * 0.6;
      const v = sp * (0.55 + this.rnd() * 0.6);
      this.chunks.push({ pc, x: r.x + ox, y: r.y + (this.rnd() - 0.5) * 16, z: Math.max(2, oz - pc.h * r.s * 0.5), vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6, vz: 180 + this.rnd() * 300 * Math.min(1.5, power / 2 + 0.4), rot: 0, vr: (this.rnd() - 0.5) * 5, t: 0, s: r.s, flip: r.flip });
    }
  }
  private tickChunks(dt: number) {
    if (!this.chunks.length) return;
    for (const b of this.chunks) {
      b.t += dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.vz -= 1900 * dt; b.rot += b.vr * dt;
      if (b.z <= 0) {
        b.z = 0;
        if (b.vz < -160) { b.vz = -b.vz * 0.32; b.vx *= 0.62; b.vy *= 0.62; b.vr *= 0.6; if (b.vz > 120) this.pushFx({ k: 'chunk', x: b.x, y: b.y, r: b.pc.w * b.s * 0.3, p: 0.4, seed: (b.x * 7 + b.y) | 0 }); }
        else {
          b.vz = 0; const f = Math.exp(-3.2 * dt); b.vx *= f; b.vy *= f; b.vr = b.vx / Math.max(20, b.pc.w * b.s * 0.5);   // 贴地滚：转速跟着滚的速度
          if (Math.abs(b.vx) < 60) { const q = Math.round(b.rot / (Math.PI / 2)) * (Math.PI / 2); b.rot += (q - b.rot) * Math.min(1, dt * 6); b.vr = 0; }   // 滚停了：倒向最近的一面放平
        }
      }
    }
    this.chunks = this.chunks.filter((b) => b.t < WK.chunkLife);
  }
  /** 立板：碎块、拿着 / 飞着的石头（combatfx.collectCombat 调；拿着的树由 render.ts 画——树的贴图在那边） */
  collect(out: Drawable[], view: { left: number; top: number; right: number; bottom: number }) {
    for (const b of this.chunks) {
      if (b.x < view.left - 200 || b.x > view.right + 200 || b.y < view.top - 100 || b.y > view.bottom + 300) continue;
      const pc = b.pc, k = b.s, hw = Math.max(pc.w, pc.h) * k * 0.75 + 6, a = Math.min(1, (WK.chunkLife - b.t) / 1);
      const sink = b.t > WK.chunkLife - 1 ? (b.t - (WK.chunkLife - 1)) * pc.h * k * 0.5 : 0;
      out.push({ y: b.y, k: 'D·碎石', hx: b.x, hy: b.y, hb: [-hw, hw, -b.z - hw * 2, hw * 0.6], draw: (g) => {
        g.save(); g.globalAlpha *= a; g.translate(b.x, b.y - b.z - pc.h * k * 0.5 + sink); g.rotate(b.rot); if (b.flip) g.scale(-1, 1);
        g.drawImage(pc.c as CanvasImageSource, -pc.w * k / 2, -pc.h * k / 2, pc.w * k, pc.h * k);
        g.restore();
      } });
    }
    for (const cr of this.carries) {
      if (cr.st === 'done' || cr.kind !== 'rock' || !cr.rock) continue;
      const S = rockSprite(cr.rock.kind, cr.rock.v); if (!S) continue;
      const k = cr.rock.s, cy = (S.t + S.b) / 2 * k, hw = Math.max(S.r - S.l, S.b - S.t) * k * 0.6 + 10;
      out.push({ y: cr.y, k: 'D·拔石', hx: cr.x, hy: cr.y, hb: [-hw, hw, -cr.z - hw * 2.2 + cy, hw], draw: (g) => {
        g.save(); g.translate(cr.x, cr.y - cr.z + cy); g.rotate(cr.rot); if (cr.rock!.flip) g.scale(-1, 1);
        g.drawImage(S.image as CanvasImageSource, S.l * k, S.t * k - cy, (S.r - S.l) * k, (S.b - S.t) * k);
        g.restore();
      } });
    }
  }

  // ---------------------------------------------------------------- 痕迹
  private markSeed(x: number, y: number) { return hash32(Math.round(x), Math.round(y), this.stats.calls); }
  private addMark(m: WreckMark): WreckMark | null {
    if (!this.scope) return null;
    if (this.world) {
      const x2 = m.x2 ?? m.x, y2 = m.y2 ?? m.y;
      if (this.townsIn(Math.min(m.x, x2) - 1, Math.min(m.y, y2) - 1, Math.max(m.x, x2) + 1, Math.max(m.y, y2) + 1) && (this.inTown(m.x, m.y) || this.inTown(x2, y2) || this.inTown((m.x + x2) / 2, (m.y + y2) / 2))) return null;   // 城里、宗门里不留坑（城镇破坏另做）
    }
    if (this.scope === 'mj') m.keep = false;
    if (!this.onLand(m)) return null;
    const list = m.keep ? this.store().marks : this.marks;
    // 同一处反复砸：并成一个更大的坑（不叠一摞、也不把上限挤满）
    if (m.k === 'pit') for (const o of this.world ? [...this.keep, ...this.marks] : this.marks) {
      if (o.k !== 'pit' || o.m !== m.m) continue;
      if (Math.hypot(o.x - m.x, o.y - m.y) < Math.max(o.r, m.r) * 0.5) {
        if (m.keep && !o.keep) { this.marks.splice(this.marks.indexOf(o), 1); m.r = Math.min(460, Math.max(o.r, m.r) * 1.04); break; }   // 小坑上砸出大坑：小的并进大的（进存档）
        o.r = Math.min(460, Math.max(o.r, m.r) * 1.04); o.d = m.d; if (o.keep) o.c = Math.min(o.c, m.c); else o.c = m.c; o.p = Math.max(o.p, m.p); return o;
      }
    }
    if (m.keep && !this.world) return null;
    list.push(m);
    const cap = m.keep ? WK.maxKeep : WK.maxMarks;
    if (list.length > cap) list.splice(0, list.length - cap);
    return m;
  }
  /**
   * 痕迹只留在陆上（地贴也铺在水面上，不裁就画到海里去了）：沟按线上的陆地裁成最长的一段；坑、龟裂心在水里就不留，
   * 靠岸的把半径收到岸线以内。改了 m 本身；整个在水里返回 false
   */
  private onLand(m: WreckMark): boolean {
    const wet = (x: number, y: number) => this.c.brawl.deepWater(x, y);
    if (m.k === 'furrow' || m.k === 'fan') {
      const x0 = m.x, y0 = m.y, x1 = m.x2!, y1 = m.y2!, L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.min(60, Math.ceil(L / 40)));
      let best0 = -1, best1 = -1, s = -1;
      for (let i = 0; i <= n; i++) {
        const dry = !wet(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n);
        if (dry && s < 0) s = i;
        if ((!dry || i === n) && s >= 0) { const e = dry ? i : i - 1; if (e - s > best1 - best0) { best0 = s; best1 = e; } s = -1; }
      }
      if (best0 < 0 || best1 - best0 < 2) return false;
      m.x = x0 + (x1 - x0) * best0 / n; m.y = y0 + (y1 - y0) * best0 / n; m.x2 = x0 + (x1 - x0) * best1 / n; m.y2 = y0 + (y1 - y0) * best1 / n;
      if (m.k === 'fan') { const r0 = m.r, r1 = m.r2 ?? m.r; m.r = r0 + (r1 - r0) * best0 / n; m.r2 = r0 + (r1 - r0) * best1 / n; }   // 扇形：两头的宽跟着裁
      if (Math.hypot(m.x2 - m.x, m.y2 - m.y) < WK.bigFurrow) m.keep = false;
      return true;
    }
    if (wet(m.x, m.y)) return false;
    const R = m.k === 'pit' ? m.r * 1.3 : m.r;
    let near = R;
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; for (let d = R * 0.25; d <= R; d += R * 0.25) if (wet(m.x + Math.cos(a) * d, m.y + Math.sin(a) * d)) { near = Math.min(near, d); break; } }
    if (near < R) { m.r *= Math.max(0.25, near / R * 0.9); if (m.k === 'pit' && m.r < WK.bigPit) m.keep = false; }
    return m.r >= 18;
  }
  private addGrass(z: GrassZone) { this.grass.push(z); if (this.grass.length > WK.maxGrass) this.grass.shift(); }
  /** render.ts：把画面里的坑、沟、龟裂画进地贴（ctx 已是世界变换） */
  drawGround(g: CanvasRenderingContext2D, left: number, top: number, right: number, bottom: number) {
    if (!this.world && this.scope !== 'mj') return;
    genLeft = 1;
    const vis = (m: WreckMark) => this.markVis(m, (x0, y0, x1, y1) => !(x1 < left || x0 > right || y1 < top || y0 > bottom));
    const day = this.g.day;
    const one = (m: WreckMark, a: number) => {
      if (a <= 0.01 || !vis(m)) return;
      const age = this.clock - m.c, grow = age < 0 || age > 0.18 ? 1 : age / 0.18;
      const k = 0.7 + 0.3 * grow;
      g.globalAlpha = a * Math.max(0.25, grow);
      if (m.k === 'pit') { const cv = pitSprite(m.s & 3); if (cv) { const R = m.r * 1.6 * k; g.drawImage(cv, m.x - R, m.y - R, R * 2, R * 2); } }
      else if (m.k === 'crack') { const cv = crackSprite(m.s & 3); if (cv) { const R = m.r * 1.05 * k; g.drawImage(cv, m.x - R, m.y - R, R * 2, R * 2); } }
      else if (m.k === 'fan') {
        // 扇形长沟：直沟的贴图沿长度切成 16 段，每段按那里的宽度拉开（越往前越宽）；犁开的过程按 3000/秒 往前长
        const L = Math.hypot(m.x2! - m.x, m.y2! - m.y), a0 = Math.atan2(m.y2! - m.y, m.x2! - m.x);
        const cv = furrowSprite(a0, 1); if (!cv) return;
        const r0 = m.r * 1.15, r1 = (m.r2 ?? m.r) * 1.15, N = 16, reach = Math.min(1, 0.05 + Math.max(0, age) * 3000 / Math.max(1, L));
        const sw = cv.width / N, total = L + r0 * 0.3 + r1 * 0.3;
        g.save(); g.translate(m.x, m.y); g.rotate(a0);
        for (let i = 0; i < N; i++) {
          const u0 = i / N; if (u0 > reach) break;
          const u1 = Math.min(reach, (i + 1) / N), um = (u0 + u1) / 2, W = r0 + (r1 - r0) * Math.max(0, Math.min(1, (um * total - r0 * 0.3) / L));
          g.drawImage(cv, i * sw, 0, sw * (u1 - u0) * N, cv.height, -r0 * 0.3 + u0 * total, -W, (u1 - u0) * total + 1, W * 2);
        }
        g.restore();
      }
      else {
        const L = Math.hypot(m.x2! - m.x, m.y2! - m.y), a0 = Math.atan2(m.y2! - m.y, m.x2! - m.x);
        const cv = furrowSprite(a0, 0); if (!cv) return;
        const W = m.r * 1.15;
        g.save(); g.translate(m.x, m.y); g.rotate(a0); g.drawImage(cv, -W * 0.3, -W, (L + W * 0.6) * Math.min(1, 0.2 + grow), W * 2); g.restore();
      }
    };
    if (this.world) for (const m of this.keep) if (m.m === ACTIVE_MAP) one(m, 1 - Math.max(0, (day - m.d) / WK.keepDays - 0.5) * 1.6);
    for (const m of this.marks) { const life = m.life ?? WK.markLife, age = this.clock - m.c; one(m, Math.min(1, (life - age) / (life * 0.35))); }
    g.globalAlpha = 1;
  }
  private pushFx(f: WreckFx) { if (this.used.fx >= WK.frame.fx) return; this.used.fx++; this.fx.push(f); }
  private boom(x: number, y: number, power: number, shake = true) {
    const g = this.g, p = g.player, d = Math.hypot(x - p.x, y - p.y);
    if (shake && d < 1800 && power >= 1.5) g.juice(0, Math.min(0.7, power * 0.12) * (1 - d / 1800));
    if (power >= 1) audio.sfx(power >= 2.5 ? 'boom' : 'land', x, y);
  }
}

// ================================================================ 小工具
function clampN(v: number, a: number, b: number) { return !(v >= a) ? a : v > b ? b : v; }
function angDiff(a: number, b: number) { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
/** 点到线段的距离 d 和投影位置 t（0‥1 在线段上） */
function segDist(px: number, py: number, x0: number, y0: number, x1: number, y1: number) {
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1, t = ((px - x0) * dx + (py - y0) * dy) / L2;
  const tc = t < 0 ? 0 : t > 1 ? 1 : t, qx = x0 + dx * tc - px, qy = y0 + dy * tc - py;
  return { d: Math.hypot(qx, qy), t };
}
/** 劈开的水沟在 u（0‥1 沿线）处此刻开了多少：先从起点往终点一路劈开，最后 0.7 秒合拢 */
export function splitOpen(s: WreckSplit, u: number): number {
  const L = Math.hypot(s.x1 - s.x0, s.y1 - s.y0), age = s.t - (u * L) / 7000;
  if (age <= 0) return 0;
  const rise = Math.min(1, age / 0.22), close = Math.max(0, (s.t - (s.dur - 0.7)) / 0.7);
  return (1 - Math.pow(1 - rise, 3)) * (1 - close * close);
}

// ================================================================ 贴图（代码画的；按变体缓存，画布小）
type StaticSpriteLike = { image: HTMLCanvasElement; l: number; r: number; t: number; b: number };
const cache = new Map<string, HTMLCanvasElement | null>();
/** 这一帧还能现画几张贴图（一张十几毫秒：一帧只画一张，没轮上的痕迹晚一帧出来） */
let genLeft = 1;
export function wreckGenBudget(n: number) { genLeft = n; }
function cached(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement | null {
  if (cache.has(key)) return cache.get(key)!;
  if (genLeft <= 0) return null;
  genLeft--;
  let c: HTMLCanvasElement | null = null;
  try { c = make(); } catch { c = null; }
  cache.set(key, c);
  return c;
}
/** 世界里的光从西北来、偏高（和山石贴图的受光面一致）：x 向右、y 向下（南）、z 向上 */
const LX = -0.55, LY = -0.62, LZ = 0.56;
function vnoise(rnd: () => number, n: number) {
  // 可平铺的格点噪声：坐标超出 0‥1 就绕回来（不外推）
  const g = new Float32Array(n * n); for (let i = 0; i < g.length; i++) g[i] = rnd();
  const w = (k: number) => ((k % n) + n) % n;
  return (u: number, v: number) => {
    const x = u * n, y = v * n, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, i0 = w(xi), i1 = w(xi + 1), j0 = w(yi) * n, j1 = w(yi + 1) * n;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), a = g[j0 + i0], b = g[j0 + i1], c = g[j1 + i0], d = g[j1 + i1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
/** 按高度场逐点算明暗，填进一张画布：h(x, y) 高度、col(x, y) 底色、al(x, y) 不透明度（都是 0‥N 的像素坐标） */
function shade(N: number, M: number, h: Float32Array, col: (i: number, j: number, out: number[]) => void, al: (i: number, j: number) => number, lx = LX, ly = LY, k = 1): HTMLCanvasElement {
  const cv = makeCanvas(N, M) as HTMLCanvasElement, g = cv.getContext('2d')!, img = g.createImageData(N, M), D = img.data, c = [0, 0, 0];
  const flat = LZ;
  for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
    const a = al(i, j); const o = (j * N + i) * 4; if (a <= 0.004) { D[o + 3] = 0; continue; }
    const hx = (h[j * N + Math.min(N - 1, i + 1)] - h[j * N + Math.max(0, i - 1)]) * k, hy = (h[Math.min(M - 1, j + 1) * N + i] - h[Math.max(0, j - 1) * N + i]) * k;
    const nl = Math.hypot(hx, hy, 1), dot = (-hx * lx - hy * ly + LZ) / nl;
    const L = Math.max(0.3, Math.min(1.55, 0.25 + 0.75 * dot / flat));
    col(i, j, c);
    D[o] = Math.min(255, c[0] * L * 255); D[o + 1] = Math.min(255, c[1] * L * 255); D[o + 2] = Math.min(255, c[2] * L * 255); D[o + 3] = Math.min(255, a * 255);
  }
  g.putImageData(img, 0, 0);
  return cv;
}
/** 圆坑：碗形的坑、隆起的坑沿（向光的一面亮、背光的一面暗）、外圈翻出来的土和碎土块、往外的裂纹。画布的半边 = 1.6 个坑半径 */
function pitSprite(v: number): HTMLCanvasElement | null {
  return cached('pit' + v, () => {
    const N = 168, R = N / 2 / 1.6, rnd = mulberry32(hash32(v, 0x9179)), nz = vnoise(rnd, 9), rimN = vnoise(rnd, 7);
    const amp: number[] = [], ph: number[] = []; for (let i = 0; i < 7; i++) { amp.push((rnd() - 0.5) * 0.09 / (1 + i * 0.4)); ph.push(rnd() * TAU); }
    const rim = (a: number) => { let s = 1; for (let i = 0; i < 7; i++) s += amp[i] * Math.sin((i + 2) * a + ph[i]); return s; };
    const h = new Float32Array(N * N), rho = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i - N / 2) / R, y = (j - N / 2) / R, a = Math.atan2(y, x), q = Math.hypot(x, y) / rim(a);
      rho[j * N + i] = q;
      const bump = (nz(i / N, j / N) - 0.5) * 0.06;
      h[j * N + i] = (q < 1 ? -0.42 * (1 - q * q) + 0.16 * Math.pow(q, 6) : 0.16 * Math.exp(-Math.pow((q - 1) / 0.2, 2)) + Math.max(0, 0.05 * (1.45 - q)) * (nz(i / N * 2, j / N * 2) - 0.3)) * R + bump * R;
    }
    return shade(N, N, h, (i, j, o) => {
      const q = rho[j * N + i], n = nz(i / N * 1.7, j / N * 1.7);
      if (q < 0.75) { o[0] = 0.27 + n * 0.05; o[1] = 0.21 + n * 0.04; o[2] = 0.155 + n * 0.03; }
      else if (q < 1.15) { o[0] = 0.42 + n * 0.06; o[1] = 0.33 + n * 0.05; o[2] = 0.24 + n * 0.04; }
      else { o[0] = 0.38 + n * 0.07; o[1] = 0.3 + n * 0.06; o[2] = 0.215 + n * 0.04; }
    }, (i, j) => {
      const q = rho[j * N + i]; if (q < 1.1) return 0.96;
      const e = 1 - (q - 1.1) / 0.45; if (e <= 0) return 0;
      const patch = rimN(i / N * 1.6, j / N * 1.6);
      return Math.max(0, Math.min(0.92, e * 1.2 - (1 - patch) * 0.55 * (1 - e)));
    }, LX, LY, 0.65);
  }) ? decoratePit(v) : null;
}
const decorated = new Set<number>();
/** 坑的细节：往外的裂纹（暗缝 + 向光的一道亮边）、坑沿上翻起的土块 */
function decoratePit(v: number): HTMLCanvasElement | null {
  const cv = cache.get('pit' + v) ?? null; if (!cv || decorated.has(v)) return cv;
  decorated.add(v);
  const g = cv.getContext('2d')!, N = cv.width, R = N / 2 / 1.6, rnd = mulberry32(hash32(v, 0x5eed));
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = 0; i < 7; i++) {
    const a0 = rnd() * TAU; let x = N / 2 + Math.cos(a0) * R * 0.95, y = N / 2 + Math.sin(a0) * R * 0.95, a = a0;
    const pts: [number, number][] = [[x, y]];
    const n = 3 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) { a += (rnd() - 0.5) * 0.7; const s = R * (0.07 + rnd() * 0.07); x += Math.cos(a) * s; y += Math.sin(a) * s; pts.push([x, y]); }
    const w = 1.2 + rnd() * 1.6;
    g.strokeStyle = 'rgba(205,185,150,0.35)'; g.lineWidth = w * 0.7; g.beginPath(); pts.forEach(([px, py], k) => (k ? g.lineTo(px + 1.1, py + 1.2) : g.moveTo(px + 1.1, py + 1.2))); g.stroke();
    g.strokeStyle = 'rgba(24,17,11,0.75)'; g.lineWidth = w; g.beginPath(); pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
  }
  for (let i = 0; i < 26; i++) {
    const a = rnd() * TAU, d = R * (0.95 + rnd() * 0.5), x = N / 2 + Math.cos(a) * d, y = N / 2 + Math.sin(a) * d, s = 1.5 + rnd() * 3.2;
    g.fillStyle = 'rgba(30,22,14,0.55)'; g.beginPath(); g.ellipse(x + s * 0.4, y + s * 0.5, s, s * 0.7, a, 0, TAU); g.fill();
    g.fillStyle = `rgba(${120 + rnd() * 30},${96 + rnd() * 24},${70 + rnd() * 20},0.9)`; g.beginPath(); g.ellipse(x, y, s, s * 0.72, a, 0, TAU); g.fill();
    g.fillStyle = 'rgba(225,205,170,0.4)'; g.beginPath(); g.ellipse(x - s * 0.3, y - s * 0.35, s * 0.45, s * 0.3, a, 0, TAU); g.fill();
  }
  return cv;
}
/** 成圈的龟裂（震脚）：浅浅的一个碟、放射的裂缝和两三圈断续的环缝、翘起的几块地皮。画布的半边 = 1.05 个半径 */
function crackSprite(v: number): HTMLCanvasElement | null {
  return cached('crk' + v, () => {
    const N = 288, R = N / 2 / 1.05, rnd = mulberry32(hash32(v, 0xc4ac)), nz = vnoise(rnd, 8);
    const h = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = (i - N / 2) / R, y = (j - N / 2) / R, q = Math.hypot(x, y); h[j * N + i] = (q < 1 ? -0.07 * (1 - q * q) : 0) * R; }
    const cv = shade(N, N, h, (i, j, o) => { const n = nz(i / N, j / N); o[0] = 0.4 + n * 0.06; o[1] = 0.32 + n * 0.05; o[2] = 0.235 + n * 0.04; }, (i, j) => { const q = Math.hypot(i - N / 2, j - N / 2) / R; return q < 0.3 ? 0.75 : Math.max(0, 0.55 * (1 - (q - 0.3) / 0.75)) * (0.5 + nz(i / N * 2, j / N * 2) * 0.7); }, LX, LY, 1);
    const g = cv.getContext('2d')!; g.lineCap = 'round'; g.lineJoin = 'round';
    const crack = (pts: [number, number][], w: number) => {
      g.strokeStyle = 'rgba(205,185,150,0.32)'; g.lineWidth = w * 0.7; g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x + 1.3, y + 1.4) : g.moveTo(x + 1.3, y + 1.4))); g.stroke();
      g.strokeStyle = 'rgba(32,23,15,0.68)'; g.lineWidth = w; g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    };
    const n = 13 + Math.floor(rnd() * 5);
    for (let i = 0; i < n; i++) {
      let a = (i + rnd() * 0.6) / n * TAU, d = R * (0.06 + rnd() * 0.08);
      const pts: [number, number][] = [[N / 2 + Math.cos(a) * d, N / 2 + Math.sin(a) * d]];
      const end = R * (0.65 + rnd() * 0.38);
      while (d < end) { d += R * (0.07 + rnd() * 0.07); a += (rnd() - 0.5) * 0.32; pts.push([N / 2 + Math.cos(a) * d, N / 2 + Math.sin(a) * d]); if (rnd() < 0.18 && pts.length > 2) { const b = a + (rnd() < 0.5 ? 0.5 : -0.5), [bx, by] = pts[pts.length - 1]; crack([[bx, by], [bx + Math.cos(b) * R * 0.14, by + Math.sin(b) * R * 0.14], [bx + Math.cos(b + 0.2) * R * 0.24, by + Math.sin(b + 0.2) * R * 0.24]], 1.2); } }
      crack(pts, 2.2 - d / R * 1.1);
    }
    for (const rr of [0.34, 0.62, 0.86]) {
      let a = rnd() * TAU; const span = TAU * (0.5 + rnd() * 0.35);
      for (let s = 0; s < span; ) { const seg = 0.25 + rnd() * 0.5, pts: [number, number][] = []; for (let u = 0; u <= 1; u += 0.25) { const aa = a + seg * u, q = R * rr * (1 + (rnd() - 0.5) * 0.06); pts.push([N / 2 + Math.cos(aa) * q, N / 2 + Math.sin(aa) * q]); } crack(pts, 1.6); a += seg + 0.15 + rnd() * 0.35; s += seg + 0.3; }
    }
    // 翘起的地皮：几块小多边形，向光边亮、背光边一道暗
    for (let i = 0; i < 10; i++) {
      const a = rnd() * TAU, d = R * (0.15 + rnd() * 0.45), x = N / 2 + Math.cos(a) * d, y = N / 2 + Math.sin(a) * d, s = R * (0.012 + rnd() * 0.018);
      g.fillStyle = 'rgba(25,18,12,0.55)'; g.beginPath(); for (let k = 0; k < 5; k++) { const b = a + k / 5 * TAU + rnd() * 0.4; g.lineTo(x + 1.5 + Math.cos(b) * s, y + 1.8 + Math.sin(b) * s); } g.fill();
      g.fillStyle = 'rgba(118,96,70,0.85)'; g.beginPath(); for (let k = 0; k < 5; k++) { const b = a + k / 5 * TAU + rnd() * 0.4; g.lineTo(x + Math.cos(b) * s, y + Math.sin(b) * s); } g.fill();
    }
    return cv;
  });
}
/** 直沟：一条凹下去的槽、两边翻起的土埂（按沟的走向分 16 档定哪边向光），两头收尖，末端拱起一堆土。画布：长 512 × 宽 96 */
function furrowSprite(angle: number, v: number): HTMLCanvasElement | null {
  const b = ((Math.round(angle / TAU * 8) % 8) + 8) % 8;
  return cached(`fur${b}:${v}`, () => {
    const N = 384, M = 80, rnd = mulberry32(hash32(b, v, 0xf0f)), nz = vnoise(rnd, 12), nz2 = vnoise(rnd, 5);
    const a = b / 8 * TAU, ca = Math.cos(a), sa = Math.sin(a);
    const lu = LX * ca + LY * sa, lv = -LX * sa + LY * ca;   // 光在沟自己的坐标里（u 沿沟、v 横过沟）
    // 画布横向 0‥N 对应沟的 -0.3W‥L+0.3W：两头各留一点收尖的余地（drawGround 按这个比例摆）
    const h = new Float32Array(N * M), keep = new Float32Array(N * M);
    for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
      const u = i / N, vv = (j - M / 2) / (M / 2);
      const env = Math.min(1, u / 0.07) * Math.min(1, (1 - u) / 0.05);
      const wob = (nz2(u * 3, 0.3) - 0.5) * 0.12, av = Math.abs(vv + wob);
      const width = 0.4 * (0.35 + 0.65 * env);
      let z = 0, al = 0;
      if (av < width) { z = -0.5 * (1 - (av / width) ** 2) * env; al = 0.95 * Math.min(1, env * 3); }
      else if (av < width + 0.55) { const t = (av - width) / 0.55; z = 0.28 * Math.sin(Math.PI * Math.min(1, t * 1.25)) * (0.6 + 0.4 * env) * (0.75 + nz(u * 6, vv) * 0.5); al = Math.max(0, (1 - t) * 1.1) * Math.min(1, env * 2.5) * (0.55 + nz(u * 9, vv * 2) * 0.6); }
      // 末端推起的土堆
      if (u > 0.88) { const q = Math.hypot((u - 0.95) / 0.05, vv / 0.55); if (q < 1) { z = Math.max(z, 0.4 * (1 - q * q)); al = Math.max(al, 0.9 * (1 - q * q * 0.5)); } }
      h[j * N + i] = z * M * 0.5; keep[j * N + i] = Math.min(0.95, al);
    }
    const cv = shade(N, M, h, (i, j, o) => { const z = h[j * N + i], n = nz(i / N * 4, j / M); if (z < 0) { o[0] = 0.28 + n * 0.05; o[1] = 0.215 + n * 0.04; o[2] = 0.16 + n * 0.03; } else { o[0] = 0.41 + n * 0.07; o[1] = 0.325 + n * 0.06; o[2] = 0.235 + n * 0.04; } }, (i, j) => keep[j * N + i], lu, lv, 0.25);
    // 槽底的划痕、埂上的土块
    const g = cv.getContext('2d')!; g.lineCap = 'round';
    for (let i = 0; i < 7; i++) { const y = M / 2 + (rnd() - 0.5) * M * 0.22, x0 = N * (0.06 + rnd() * 0.3), x1 = x0 + N * (0.2 + rnd() * 0.45); g.strokeStyle = 'rgba(22,15,10,0.45)'; g.lineWidth = 1 + rnd() * 1.4; g.beginPath(); g.moveTo(x0, y); g.lineTo(Math.min(N * 0.92, x1), y + (rnd() - 0.5) * 3); g.stroke(); }
    for (let i = 0; i < 40; i++) { const side = rnd() < 0.5 ? -1 : 1, x = N * (0.05 + rnd() * 0.9), y = M / 2 + side * M * (0.3 + rnd() * 0.18), s = 1.4 + rnd() * 2.6; g.fillStyle = 'rgba(28,20,13,0.5)'; g.beginPath(); g.ellipse(x + 0.8, y + 0.9, s, s * 0.7, 0, 0, TAU); g.fill(); g.fillStyle = `rgba(${122 + rnd() * 28},${98 + rnd() * 22},${72 + rnd() * 18},0.9)`; g.beginPath(); g.ellipse(x, y, s, s * 0.7, 0, 0, TAU); g.fill(); }
    return cv;
  });
}
/** 树桩：一截断开的树干，顶上参差的断茬、年轮，脚下一点影子（size 0‥2 粗细三档，v 四种断法） */
const stumps = new Map<string, StaticSpriteLike | null>();
export function stumpSprite(size: number, v: number): StaticSpriteLike {
  const key = size * 4 + v + '';
  const hit = stumps.get(key);
  if (hit) return hit;
  const W = 11 + size * 4, H = 13 + size * 5 + v * 3, K = 2, l = -W - 14, r = W + 14, t = -H - 18, b = 12;
  let s: StaticSpriteLike;
  try {
    const cv = makeCanvas((r - l) * K, (b - t) * K) as HTMLCanvasElement, g = cv.getContext('2d')!;
    g.setTransform(K, 0, 0, K, -l * K, -t * K);
    const rnd = mulberry32(hash32(size, v, 0x57a));
    g.fillStyle = 'rgba(25,20,14,0.3)'; g.beginPath(); g.ellipse(2, 2, W * 1.5, W * 0.45, 0, 0, TAU); g.fill();
    // 根：两三条往外伸
    g.fillStyle = 'rgb(66,50,36)';
    for (let i = 0; i < 3; i++) { const sx = (i - 1) * W * 0.8; g.beginPath(); g.moveTo(sx - 4, 0); g.quadraticCurveTo(sx * 1.6, 3, sx * 2 + (rnd() - 0.5) * 6, 4); g.quadraticCurveTo(sx * 1.3, -4, sx + 4, -6); g.fill(); }
    // 树干：底宽顶略窄，顶上一圈参差的断茬
    const top: [number, number][] = []; const n = 7;
    for (let i = 0; i <= n; i++) { const x = W * 0.42 - i / n * W * 0.84; top.push([x, -H + (rnd() < 0.35 ? -rnd() * 14 : rnd() * 6)]); }
    const grd = g.createLinearGradient(-W / 2, 0, W / 2, 0); grd.addColorStop(0, 'rgb(112,88,62)'); grd.addColorStop(0.5, 'rgb(86,66,46)'); grd.addColorStop(1, 'rgb(52,40,28)');
    g.fillStyle = grd; g.beginPath(); g.moveTo(-W * 0.5, 0); g.lineTo(W * 0.5, 0); for (const [x, y] of top) g.lineTo(x, y); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(30,22,14,0.7)'; g.lineWidth = 1.3; g.stroke();
    // 树皮纹
    g.strokeStyle = 'rgba(35,26,18,0.55)'; g.lineWidth = 1; for (let i = 0; i < 5; i++) { const x = -W * 0.38 + i * W * 0.19; g.beginPath(); g.moveTo(x, -2); g.lineTo(x + (rnd() - 0.5) * 3, -H * (0.5 + rnd() * 0.4)); g.stroke(); }
    // 断面：浅色的木头和年轮
    g.fillStyle = 'rgb(196,166,120)'; g.beginPath(); g.ellipse(0, -H + 1, W * 0.42, W * 0.16, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(120,90,55,0.7)'; g.lineWidth = 0.8; for (let i = 1; i <= 2; i++) { g.beginPath(); g.ellipse(0, -H + 1, W * 0.42 * i / 3, W * 0.16 * i / 3, 0, 0, TAU); g.stroke(); }
    // 断茬上的木刺
    g.fillStyle = 'rgb(176,146,104)'; for (let i = 0; i < 3; i++) { const x = (rnd() - 0.5) * W * 0.6; g.beginPath(); g.moveTo(x - 2, -H + 2); g.lineTo(x + (rnd() - 0.5) * 3, -H - 6 - rnd() * 10); g.lineTo(x + 2.5, -H + 2); g.fill(); }
    s = { image: cv, l, r, t, b };
  } catch { s = { image: null as unknown as HTMLCanvasElement, l, r, t, b }; }
  stumps.set(key, s);
  return s;
}
/** 石头碎成的大块：把它的样子从靠下的一点按 4–5 刀放射状切开（每块一张小画布；按石头的种类和样子缓存） */
interface Piece { c: HTMLCanvasElement; w: number; h: number; cx: number; cy: number }
const pieceCache = new Map<string, Piece[]>();
function rockPieces(kind: RockKind, v: number): Piece[] {
  const key = kind + v;
  const hit = pieceCache.get(key); if (hit) return hit;
  const out: Piece[] = [];
  try {
    const S = rockSprite(kind, v);
    if (S) {
      const img = S.image, K = img.width / (S.r - S.l);
      // 石头的身子大约占 l‥r 的中间六成、t‥0 的下面八成；从身子中下部的一点切
      const ox = 0, oy = S.t * 0.42, rnd = mulberry32(hash32(kind.charCodeAt(0), v, 0xc4));
      const n = 6 + (v & 1), a0 = rnd() * TAU, cuts: number[] = [];
      for (let i = 0; i < n; i++) cuts.push(a0 + (i + 0.2 + rnd() * 0.6) / n * TAU);
      const Rr = Math.max(S.r - S.l, S.b - S.t);
      for (let i = 0; i < n; i++) {
        const a = cuts[i], b = cuts[(i + 1) % n] + (i === n - 1 ? TAU : 0);
        const poly: [number, number][] = [[ox, oy]];
        for (let k = 0; k <= 4; k++) { const t = a + (b - a) * k / 4, jag = 1 + (k > 0 && k < 4 ? (rnd() - 0.5) * 0.1 : 0); poly.push([ox + Math.cos(t) * Rr * jag, oy + Math.sin(t) * Rr * jag]); }
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        // 只留落在石头身子上的那一截（画布范围收到身子的大致外框）
        x0 = Math.max(x0, S.l * 0.72); x1 = Math.min(x1, S.r * 0.72); y0 = Math.max(y0, S.t * 0.95); y1 = Math.min(y1, 4);
        if (x1 - x0 < 8 || y1 - y0 < 8) continue;
        const w = x1 - x0, hh = y1 - y0, c = makeCanvas(Math.ceil(w * K), Math.ceil(hh * K)) as HTMLCanvasElement, g = c.getContext('2d')!;
        g.setTransform(K, 0, 0, K, -x0 * K, -y0 * K);
        g.beginPath(); poly.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.clip();
        g.drawImage(img as CanvasImageSource, S.l, S.t, S.r - S.l, S.b - S.t);
        // 新鲜的断面：沿切口一道浅色
        g.strokeStyle = kind === 'reef' ? 'rgba(120,140,150,0.5)' : kind === 'wreck' ? 'rgba(200,160,110,0.55)' : 'rgba(215,200,175,0.55)'; g.lineWidth = 2.2;
        g.beginPath(); g.moveTo(poly[1][0], poly[1][1]); g.lineTo(ox, oy); g.lineTo(poly[poly.length - 1][0], poly[poly.length - 1][1]); g.stroke();
        // 空白太多的不要（切到了石头外面）
        let filled = 0; try { const d = g.getImageData(0, 0, c.width, c.height).data; for (let q = 3; q < d.length; q += 16) if (d[q] > 60) filled++; filled = filled / (d.length / 16); } catch { filled = 1; }
        if (filled < 0.12) continue;
        out.push({ c, w, h: hh, cx: (x0 + x1) / 2, cy: -(y0 + y1) / 2 });
      }
    }
  } catch { /* 无头测试没有画布 */ }
  pieceCache.set(key, out);
  return out;
}
