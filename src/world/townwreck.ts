// 城镇破坏与恢复（docs/撼山客与破坏系统-设计.md 第五节「城镇」那一层）：城里的东西能被打坏，但会自己修好，游戏不会因此卡死。
//
// 对外仍是 wreck 那几个接口（cone / line / radial / hurl 落地）：wreck.ts 算出「范围里有谁」的同一个判定函数转给这里，
// 由这里决定城里的小件、房子、地面怎么坏、记谁的账。另外两个入口：
//   impact(x, y, dir, power, src)  近战把人轰飞撞上房子（brawl.ts 的 wallHit 等处调；见交付说明）
//   blast(x, y, r, k, src)         大范围法术（combat.ts 的 aoe 调）
//
// 能坏的：
//   小件（ckit 里的摊位、伞摊、货摊、货箱、酒桶、板车、灯杆、酒旗、晾衣架；牌坊）——坏了有倒下 / 碎裂的过程，留残骸，一两天修好
//   房子（铺面、民居院落、民房）——完好 / 破损 / 半塌三档，按耐久走，不会消失；破损三五天、半塌十来天修好
//   地面——石板碎裂的浅坑、浅沟（比野外的浅），一两天修好；城里的树照 wreck 的办法倒（wreck.fellIn 向这里要城里的树）
// 不能坏的（PROT 判定表，依据写在每一条后面）：传送阵、城墙城门角楼（只留焦痕掉砖）、衙署寺院宫殿、有名的府第、塔与钟鼓楼与坛、桥码头路沿、悬赏榜……
// 宗门（含议事殿）整个不归这一层管。
//
// 不卡死：破坏不改挡路（townspace 的碰撞块原样）；半塌的铺子门口摆临时摊、设施照常（beforeOpen）；能走进去的半塌了不让进（indoor.ts 问 collapsed）。
// 恢复：按「天」修——这里的一天是一个昼夜（240 秒，g.day 走 120；日历一天只有两秒，照日历算砸坏的摊子两三秒就好了）。
//   修的最后一截搭脚手架、有敲打声；修好时「焕然一新」。不在场也在修（按 g.day 算，回来已经好了）。捐资修缮（donate）当天搭架、次日修好。
// 后果：玩家（和玩家一方的同伴、召唤物）打坏的记进这座城的「损坏账」；小额只掉民望，累计到门槛城卫执事上来讨赔（赔 / 欠着 / 动手）。
//   NPC（撼山客、妖兽）打坏的不记。欠着不还：这座城的设施（传送阵、悬赏榜除外）拒之门外，直到还清或过了 TW.forgive 天。
// 存档：ws.townwreck（可选字段，存档版本不升）：每座城的损坏条目、地面痕迹、城墙焦痕、账；有上限，修好且没账的城清掉记录。
// 固定种子：这里一个 Math.random 都不取（倒向、碎法、修的天数都按坐标 / 标识取 hash32）。
import type { Combat, Enemy } from './combat';
import type { LocDef } from '../data/world';
import { LOC_SCALE, type LocLayout, type Piece } from '../gfx/building';
import type { DNode } from './modal';
import { hash32 } from './brawlrng';
import { audio } from './audio';
import * as C from './cultivation';

export const TW = {
  /** 一「天」= 一个昼夜（g.day 走 120 = 240 秒） */
  DAY: 120,
  /** 修好要几天：小件、破损、半塌、城墙焦痕、地面（[最少, 最多]，按标识取哈希） */
  fix: { small: [1, 2], dmg: [3, 5], half: [9, 11], wall: [1, 2], ground: [1, 2] } as Record<string, [number, number]>,
  /** 修的最后这一截（占修期的比例）搭脚手架、有工匠敲打 */
  scaffoldK: 0.4,
  /** 房子：耐久剩多少算破损、半塌（占满耐久的比例） */
  tier: { dmg: 0.65, half: 0.25 },
  /** 房子耐久 = clamp(base + 占地 / per, min, max)；挨一下扣 houseMul × 力度 × 远近 */
  houseHp: { base: 12, per: 12000, min: 14, max: 48 }, houseMul: 2.2,
  /** 小件：耐久、价值（灵石）、名字；hw / hh 是占地的半宽半深（本地，转向前），cx 是中心相对锚点的偏移 */
  small: {
    stall: { hw: 66, hh: 40, cx: 0, hp: 1.2, val: 6, name: '摊位' },
    umb: { hw: 62, hh: 62, cx: 0, hp: 0.8, val: 3, name: '伞摊' },
    goods: { hw: 40, hh: 30, cx: 0, hp: 0.8, val: 4, name: '货摊' },
    crate: { hw: 40, hh: 40, cx: 10, hp: 1.0, val: 2, name: '货箱' },
    barrel: { hw: 34, hh: 20, cx: 16, hp: 1.0, val: 2, name: '酒桶' },
    cart: { hw: 80, hh: 40, cx: 0, hp: 1.6, val: 8, name: '板车' },
    lamp: { hw: 22, hh: 10, cx: 18, hp: 0.8, val: 3, name: '灯杆' },
    flag: { hw: 34, hh: 10, cx: 32, hp: 1.0, val: 5, name: '酒旗' },
    laundry: { hw: 60, hh: 10, cx: 0, hp: 0.5, val: 1, name: '晾衣架' },
  } as Record<string, { hw: number; hh: number; cx: number; hp: number; val: number; name: string }>,
  paifang: { hp: 4, val: 60 },
  /** 房子两档的价值（灵石）= round(base + 占地 / per) × 档 */
  houseVal: { base: 8, per: 20000, half: 3 },
  /** 账：多少开始掉民望的提示、多少城卫执事上来讨赔；讨过一回隔几天再讨；欠着多少天后不了了之 */
  bill: { note: 20, demand: 160, askGap: 2, forgive: 20 },
  /** 民望：每一块灵石的损坏掉多少；捐资每一块灵石涨多少（民望在 ±100 之间） */
  good: { perVal: 0.25, perDonate: 1 / 6 },
  /** 加急：剩下的修期按价值的这个倍数要价，最少几块；付了几成天后修好（当天搭架、次日修好） */
  rush: { k: 1.3, min: 3, after: 0.5 },
  /** 上限：一座城记多少条、地面痕迹几处、城墙焦痕几处；一共记几座城 */
  cap: { entries: 160, marks: 24, walls: 24, cities: 12 },
  /** 一次调用最多处理几件；一帧最多几件 */
  call: 60, frame: 200,
  /** 小件倒下的过程多长（秒） */
  fallT: 0.75,
  /** 惊吓：多大范围、持续几秒 */
  panic: { r: 900, t: 7 },
} as const;

/** 不可破坏的判定（构件种类 → 依据）。小件里不在 TW.small 的（井、石狮、鼎、华表、石头、船、车马活物）也不坏 */
export const PROT: Record<string, string> = {
  cteleport: '传送阵：换图、远行的入口，坏了人出不去',
  cgate: '城门：进出城的通路，塌了挡路、进出全乱（可以留焦痕）',
  cwall: '城墙：挡路的主体，不塌、不开口子（可以掉砖、留焦痕）',
  cwallp: '城墙（斜段）：同上',
  ctower: '角楼：城墙的一部分',
  chall: '衙署、寺院、宫殿正殿：官府与主线常用（城主府、议事、剧情见人）',
  ccourt_named: '有名有主的府第（邹府等）：主线要用',
  story: '主线锚点（邹府门口等）附近的房子：剧情要在那里见人',
  cpagoda: '塔：地标',
  cbell: '钟鼓楼：地标',
  caltar: '坛：地标', cround: '圜丘：地标', cterrace: '台：地标', cmound: '山丘：地形',
  cgatehouse: '宫门：宫城通路',
  cpav: '亭：园林地标',
  cbridge: '桥：通行，塌了断路', cpier: '码头：通行', ccurb: '路沿：挡路',
  notice: '悬赏榜：设施（接悬赏）',
  sect: '宗门（含议事殿）：不归城镇这一层管',
};

export type TWKind = 'house' | 'small' | 'wall' | 'prot';
/** 城里一件能挨打的东西（世界坐标）。id = 构件序号 × 128 + 小件序号 + 1（整件的小件序号是 -1） */
export interface TWTarget {
  id: number; k: TWKind; sub: string; pi: number; ii: number;
  x: number; y: number; x0: number; y0: number; x1: number; y1: number;
  hp: number; val: number; prot: string | null; fn?: string; room: boolean; r: number;
  /** 门口（世界） */ fx: number; fy: number;
}
interface TreeFake { kind: 'tree'; x: number; y: number; h: number; w: number; v: number; s: number; _tw: { loc: string; pi: number } }
interface CityModel { l: LocDef; L: LocLayout; ox: number; oy: number; T: TWTarget[]; byId: Map<number, TWTarget>; grid: Map<number, number[]>; trees: TreeFake[]; treeByPi: Map<number, TreeFake>; x0: number; y0: number; x1: number; y1: number }
/** 存档：一件的损坏。hp 剩多少；t 档（房子 0‥2，小件 2 = 坏了）；d 哪天坏的、f 哪天修好（g.day）；by 1 = 玩家；dir 挨打的方向；rush 加急了 */
export interface TWEntry { id: number; hp: number; t: number; d: number; f: number; by: number; dir: number; rush?: number }
/** 存档：地面痕迹。k 0 浅坑、1 浅沟、2 龟裂 */
export interface TWMark { k: number; x: number; y: number; x2?: number; y2?: number; r: number; d: number; f: number; s: number }
/** 存档：城墙上的焦痕掉砖（pi 那段墙；x y 打在墙面哪一点；n 墙的哪一面 ±1；z 离地多高；s 大小） */
export interface TWWall { pi: number; x: number; y: number; z: number; n: number; s: number; d: number; f: number; seed: number }
export interface TWCity { v: number; e: TWEntry[]; m: TWMark[]; w: TWWall[]; bill: number; owe: number; oweD: number; good: number; seen: number; ask: number; paid?: number;
  /** 恩怨重做 · 各地口碑（world/enyuan.ts 在 good 上扩成通用口碑）：最近一次为什么变、哪天变的 */
  kbWhy?: string; kbDay?: number }
export interface TWSave { v: number; c: Record<string, TWCity> }
/** 画面要的事件（hd2d/townwreckGl.ts 每帧取走）：break 小件碎了、hit 房子挨打、tier 掉档、fresh 修好了、knock 工匠敲打、wall 城墙挨打 */
export interface TWFx { k: 'break' | 'hit' | 'tier' | 'fresh' | 'knock' | 'wall' | 'ground'; loc: string; x: number; y: number; r: number; p: number; dir: number; seed: number; pi?: number }
/** 正在倒的小件 */
export interface TWFall { loc: string; pi: number; ii: number; sub: string; x: number; y: number; dir: number; t: number; seed: number }
/** 一件构件此刻的样子（画面按它重建替身） */
export interface TWPieceView { pi: number; tier: number; scaffold: boolean; items: Map<number, 'fall' | 'broken'>; dir: number; seed: number; fn?: string; key: string }
type Test = (px: number, py: number, pad: number) => { k: number; ux: number; uy: number; d: number } | null;
export type TWSrc = Enemy | 'p' | null | undefined;
export interface TWResult { houses: number; small: number; broken: number; tiers: number; walls: number; prot: number; bill: number }

const CELL = 400;
const FACE: [number, number][] = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** 本地（构件的正面朝 +z）→ 世界：cityPieces 的 app() 同一套转法 */
function rotXY(r: number, x: number, z: number): [number, number] { r = ((r % 4) + 4) % 4; return r === 0 ? [x, z] : r === 1 ? [z, -x] : r === 2 ? [-x, -z] : [-z, x]; }
/** 按标识取 [a, b] 天 */
function daysOf(id: number, salt: number, ab: readonly [number, number]) { return ab[0] + (hash32(id, salt) % 1000) / 1000 * (ab[1] - ab[0]); }

export class TownWreck {
  constructor(readonly c: Combat) {}
  private get g() { return this.c.game; }
  private models = new WeakMap<LocLayout, CityModel>();
  falls: TWFall[] = [];
  fx: TWFx[] = [];
  private panicL: { x: number; y: number; r: number; t: number }[] = [];
  /** 画面要重建的时候 +1 */
  ver = 0;
  clock = 0;
  private tick = 0;
  private usedFrame = 0;
  private noteT = -99;
  private wsRef: object | null = null;
  /** 测试 / 量数 */
  stats = { calls: 0, hits: 0, broken: 0, tiers: 0, fixed: 0, capped: 0 };

  reset() { this.falls = []; this.fx = []; this.panicL = []; this.ver++; }

  // ================================================================ 城的模型（布局只读）
  /** 一座城的可破坏物（按布局建一次，记在布局上） */
  model(l: LocDef, L: LocLayout, ox: number, oy: number): CityModel {
    let m = this.models.get(L);
    if (m && m.ox === ox && m.oy === oy) return m;
    m = buildModel(l, L, ox, oy);
    this.models.set(L, m);
    return m;
  }
  /** (x0, y0)–(x1, y1) 碰到的城（只看主角附近已经排好布局的；宗门不算） */
  private citiesIn(x0: number, y0: number, x1: number, y1: number): CityModel[] {
    const out: CityModel[] = [];
    for (const n of this.g.space?.near ?? []) {
      const t = n.l.type;
      if (t !== 'city' && t !== 'town' && t !== 'isle') continue;
      const m = this.model(n.l, n.L, n.ox, n.oy);
      if (m.x1 < x0 || m.x0 > x1 || m.y1 < y0 || m.y0 > y1) continue;
      out.push(m);
    }
    return out;
  }
  /** 主角所在（或最近）的一座有街巷的城 */
  here(): CityModel | null {
    const p = this.g.player;
    let best: CityModel | null = null, bd = Infinity;
    for (const n of this.g.space?.near ?? []) {
      const t = n.l.type; if (t !== 'city' && t !== 'town' && t !== 'isle') continue;
      const m = this.model(n.l, n.L, n.ox, n.oy);
      const dx = Math.max(m.x0 - p.x, 0, p.x - m.x1), dy = Math.max(m.y0 - p.y, 0, p.y - m.y1), d = Math.hypot(dx, dy);
      if (d < bd) { bd = d; best = m; }
    }
    return bd < 3000 ? best : null;
  }
  /** 测试 / 试玩：按地点取模型（布局已排好） */
  modelOf(l: LocDef): CityModel | null {
    const n = this.g.space?.near.find((q) => q.l.id === l.id);
    return n ? this.model(n.l, n.L, n.ox, n.oy) : null;
  }
  private inside(m: CityModel, x: number, y: number) { return x > m.x0 && x < m.x1 && y > m.y0 && y < m.y1; }
  private near(m: CityModel, x0: number, y0: number, x1: number, y1: number, fn: (t: TWTarget) => void) {
    const seen = new Set<number>();
    for (let gy = Math.floor(y0 / CELL); gy <= Math.floor(y1 / CELL); gy++) for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) {
      const a = m.grid.get(gx * 100003 + gy); if (!a) continue;
      for (const i of a) { if (seen.has(i)) continue; seen.add(i); fn(m.T[i]); }
    }
  }

  // ================================================================ 存档那一份
  private store() { return this.g.ws.townwreck ??= { v: 1, c: {} }; }
  /** 一座城的状态（顺手把到期的修好）；create = false 时没有就返回 null */
  state(id: string, create = false): TWCity | null {
    const S = this.g.ws?.townwreck;
    let st = S?.c[id] ?? null;
    if (!st) {
      if (!create) return null;
      const s = this.store();
      st = s.c[id] = { v: 1, e: [], m: [], w: [], bill: 0, owe: 0, oweD: 0, good: 0, seen: this.g.day, ask: -1e9 };
      this.capCities();
    }
    this.settle(id, st);
    return st;
  }
  /** 到期的修好（离场也在修：只按 g.day 算） */
  private settle(id: string, st: TWCity) {
    const day = this.g.day;
    if (st.e.length) {
      let n = 0;
      for (let i = st.e.length - 1; i >= 0; i--) {
        const e = st.e[i];
        if (e.f > day) continue;
        st.e.splice(i, 1); n++;
        if (e.t > 0) this.freshFx(id, e);
      }
      if (n) { this.stats.fixed += n; this.ver++; }
    }
    if (st.m.length) { const k = st.m.filter((m) => m.f > day); if (k.length !== st.m.length) { st.m = k; this.ver++; } }
    if (st.w.length) { const k = st.w.filter((w) => w.f > day); if (k.length !== st.w.length) { st.w = k; this.ver++; } }
    if (st.owe > 0 && day - st.oweD > TW.bill.forgive * TW.DAY) { st.owe = 0; }
  }
  /** 修好、没账、很久没来的城：清掉记录；记的城太多：最久没来、没账的先清 */
  private capCities() {
    const S = this.g.ws.townwreck; if (!S) return;
    const ids = Object.keys(S.c);
    for (const id of ids) { const st = S.c[id]; if (!st.e.length && !st.m.length && !st.w.length && st.bill <= 0 && st.owe <= 0 && Math.abs(st.good) < 1 && this.g.day - st.seen > TW.DAY) delete S.c[id]; }
    let left = Object.keys(S.c);
    while (left.length > TW.cap.cities) {
      left.sort((a, b) => ((S.c[a].bill + S.c[a].owe > 0 ? 1 : 0) - (S.c[b].bill + S.c[b].owe > 0 ? 1 : 0)) || S.c[a].seen - S.c[b].seen);
      delete S.c[left[0]]; left = Object.keys(S.c);
    }
  }
  private freshFx(loc: string, e: TWEntry) {
    const m = this.cityById(loc); if (!m) return;
    const t = m.byId.get(e.id); if (!t) return;
    this.pushFx({ k: 'fresh', loc, x: t.x, y: t.y, r: Math.max(t.x1 - t.x0, t.y1 - t.y0) * 0.5, p: 1, dir: 0, seed: e.id, pi: t.pi });
  }
  private cityById(id: string): CityModel | null {
    for (const n of this.g.space?.near ?? []) if (n.l.id === id) return this.model(n.l, n.L, n.ox, n.oy);
    return null;
  }
  entry(st: TWCity, id: number) { return st.e.find((e) => e.id === id) ?? null; }

  // ================================================================ 每帧
  update(dt: number) {
    this.clock += dt; this.usedFrame = 0;
    const g = this.g;
    if (this.wsRef !== g.ws) { this.wsRef = g.ws; this.falls = []; this.ver++; }
    if (this.fx.length > 64) this.fx.splice(0, this.fx.length - 64);
    for (let i = this.falls.length - 1; i >= 0; i--) { const f = this.falls[i]; f.t += dt; if (f.t >= TW.fallT) { this.falls.splice(i, 1); this.ver++; } }
    if (this.panicL.length) this.panicL = this.panicL.filter((q) => this.clock - q.t < TW.panic.t);
    this.tick -= dt;
    if (this.tick > 0) return;
    this.tick = 1;
    const S = g.ws?.townwreck; if (!S) return;
    const here = this.here();
    for (const id of Object.keys(S.c)) {
      const st = S.c[id]; this.settle(id, st);
      if (here && here.l.id === id) {
        st.seen = g.day;
        // 修到最后一截：脚手架搭起来（画面重建）；有人在场就有敲打声
        let sc = 0;
        for (const e of st.e) if (e.t > 0 && this.scaffolding(e)) { sc++; if (sc <= 3) { const t = here.byId.get(e.id); if (t && Math.hypot(t.x - g.player.x, t.y - g.player.y) < 1400 && hash32(e.id, Math.floor(this.clock)) % 3 === 0) { this.pushFx({ k: 'knock', loc: id, x: t.x, y: t.y, r: 40, p: 0.4, dir: 0, seed: e.id + Math.floor(this.clock), pi: t.pi }); audio.sfx('clang', t.x, t.y); } } }
        if (sc !== this.lastScaffold) { this.lastScaffold = sc; this.ver++; }
        this.collector(here, st);
      }
    }
    this.capCities();
  }
  private lastScaffold = -1;
  /** 这一件是不是正在搭着脚手架修（修期的最后 scaffoldK，或者加急了） */
  scaffolding(e: TWEntry): boolean { return !!e.rush || this.g.day >= e.f - (e.f - e.d) * TW.scaffoldK; }

  // ================================================================ 破坏
  private isPlayer(src: TWSrc) { return src === 'p' || (!!src && typeof src === 'object' && !!(src as Enemy).ally); }
  /** wreck.ts 的 cone / line / radial 调：test 是 wreck 那一下的范围判定。shape 决定地面留什么 */
  area(test: Test, x0: number, y0: number, x1: number, y1: number, power: number, src: TWSrc, shape: { k: 'radial' | 'cone' | 'line' | 'crack'; x: number; y: number; x2?: number; y2?: number; r: number; dir?: number }, mark = true): TWResult {
    const res: TWResult = { houses: 0, small: 0, broken: 0, tiers: 0, walls: 0, prot: 0, bill: 0 };
    if (!(power > 0)) return res;
    const cities = this.citiesIn(x0 - 200, y0 - 200, x1 + 200, y1 + 200);
    if (!cities.length) return res;
    this.stats.calls++;
    for (const m of cities) {
      let n = 0;
      const st = this.state(m.l.id, true)!;
      const bill0 = st.bill;
      this.near(m, x0 - 200, y0 - 200, x1 + 200, y1 + 200, (t) => {
        if (n >= TW.call || this.usedFrame >= TW.frame) { this.stats.capped++; return; }
        const pad = Math.min(t.x1 - t.x0, t.y1 - t.y0) * 0.5;
        const q = test(t.x, t.y, pad); if (!q) return;
        n++; this.usedFrame++;
        if (t.k === 'prot') { res.prot++; return; }
        if (t.k === 'wall') { if (power * q.k >= 1.2 && res.walls < 3) { this.wallMark(m, st, t, shape.x, shape.y, power * q.k); res.walls++; } return; }
        const r = this.damage(m, st, t, power * q.k * (t.k === 'house' ? TW.houseMul : 1), src, Math.atan2(q.uy, q.ux));
        if (t.k === 'house') { res.houses++; if (r) res.tiers++; } else { res.small++; if (r) res.broken++; }
      });
      if (mark && power >= 1 && this.inside(m, shape.x, shape.y)) this.groundMark(m, st, shape, power);
      res.bill += st.bill - bill0;
      if (this.inside(m, shape.x, shape.y)) this.scare(shape.x, shape.y, Math.max(TW.panic.r, shape.r));
    }
    return res;
  }
  /** 大范围法术（combat.ts 的 aoe）：k = 这一下的伤害 ÷ 主角攻击 */
  blast(x: number, y: number, r: number, k: number, src: TWSrc = 'p'): TWResult | null {
    if (r < 100 || !(k > 0.6)) return null;
    const power = clamp(k * 1.2, 0, 4.5);
    const test: Test = (px, py, pad) => { const dx = px - x, dy = py - y, d = Math.hypot(dx, dy); if (d > r + pad) return null; const a = d > 1 ? Math.atan2(dy, dx) : 0; return { k: 1 - Math.min(1, d / r) * 0.6, ux: Math.cos(a), uy: Math.sin(a), d }; };
    return this.area(test, x - r, y - r, x + r, y + r, power, src, { k: 'radial', x, y, r }, power >= 2);
  }
  /**
   * 近战把人轰飞撞上房子（brawl.ts 的 wallHit 等处调）：(x, y) 撞上那一点（墙外最后一个空着的点），dir 飞的方向，power 力度（1 轻 ‥ 3 重），
   * src 这一下算谁的（被轰飞的人身上记着的出手人：brawl 的 body.by）。返回撞上了什么。
   */
  impact(x: number, y: number, dir: number, power: number, src: TWSrc): { k: TWKind; sub: string; tier: number; broken: boolean } | null {
    if (!(power > 0)) return null;
    const ax = x + Math.cos(dir) * 50, ay = y + Math.sin(dir) * 50;
    const cities = this.citiesIn(ax - 100, ay - 100, ax + 100, ay + 100);
    for (const m of cities) {
      let best: TWTarget | null = null, bd = 90;
      this.near(m, ax - 120, ay - 120, ax + 120, ay + 120, (t) => {
        const dx = Math.max(t.x0 - ax, 0, ax - t.x1), dy = Math.max(t.y0 - ay, 0, ay - t.y1), d = Math.hypot(dx, dy);
        if (d < bd || (d === bd && best && t.k === 'small')) { bd = d; best = t; }
      });
      if (!best) continue;
      const t = best as TWTarget;
      const st = this.state(m.l.id, true)!;
      this.stats.calls++;
      if (t.k === 'prot') return { k: 'prot', sub: t.sub, tier: 0, broken: false };
      if (t.k === 'wall') { this.wallMark(m, st, t, x, y, power); return { k: 'wall', sub: t.sub, tier: 0, broken: false }; }
      const ch = this.damage(m, st, t, power * (t.k === 'house' ? TW.houseMul : 1.2), src, dir);
      const e = this.entry(st, t.id);
      this.scare(x, y, 600);
      return { k: t.k, sub: t.sub, tier: e?.t ?? 0, broken: t.k === 'small' ? (e?.t ?? 0) >= 2 : ch };
    }
    return null;
  }
  /** 一件挨了 dmg：返回这一下有没有让它掉档（小件：碎了） */
  private damage(m: CityModel, st: TWCity, t: TWTarget, dmg: number, src: TWSrc, dir: number): boolean {
    const g = this.g, day = g.day, id = m.l.id;
    let e = this.entry(st, t.id);
    this.stats.hits++;
    if (t.k === 'small') {
      if (e && e.t >= 2) return false;
      const hp = (e?.hp ?? t.hp) - dmg;
      if (hp > 0) { if (!e) { e = { id: t.id, hp, t: 0, d: day, f: day + TW.DAY, by: 0, dir }; this.push(st, e); } else e.hp = hp; return false; }
      if (!e) { e = { id: t.id, hp: 0, t: 2, d: day, f: 0, by: 0, dir }; this.push(st, e); }
      e.hp = 0; e.t = 2; e.d = day; e.f = day + daysOf(t.id, 0x5a11, TW.fix.small) * TW.DAY; e.dir = dir; e.rush = undefined;
      e.by = this.isPlayer(src) ? 1 : 0;
      this.stats.broken++;
      this.falls.push({ loc: id, pi: t.pi, ii: t.ii, sub: t.sub, x: t.x, y: t.y, dir, t: 0, seed: hash32(t.id, Math.floor(day)) });
      if (this.falls.length > 24) this.falls.shift();
      this.pushFx({ k: 'break', loc: id, x: t.x, y: t.y, r: Math.max(t.x1 - t.x0, t.y1 - t.y0) * 0.5, p: Math.min(3, dmg), dir, seed: t.id, pi: t.pi });
      audio.sfx('break', t.x, t.y);
      if (e.by) this.charge(m, st, t.val, TW.small[t.sub]?.name ?? (t.sub === 'paifang' ? '牌坊' : '摊子'));
      this.ver++;
      return true;
    }
    // 房子：按耐久掉档，不会消失
    const hp0 = e?.hp ?? t.hp, t0 = e?.t ?? 0;
    const hp = Math.max(0, hp0 - dmg);
    const tier = hp <= t.hp * TW.tier.half ? 2 : hp <= t.hp * TW.tier.dmg ? 1 : 0;
    if (!e) { e = { id: t.id, hp, t: 0, d: day, f: day + TW.DAY, by: 0, dir }; this.push(st, e); }
    e.hp = hp;
    this.pushFx({ k: 'hit', loc: id, x: t.x, y: t.y, r: Math.max(t.x1 - t.x0, t.y1 - t.y0) * 0.5, p: Math.min(3, dmg / 3), dir, seed: hash32(t.id, this.stats.hits), pi: t.pi });
    if (tier > t0) {
      e.t = tier; e.d = day; e.dir = dir; e.rush = undefined;
      e.f = day + daysOf(t.id, 0x40a5 + tier, tier === 2 ? TW.fix.half : TW.fix.dmg) * TW.DAY;
      e.by = this.isPlayer(src) ? 1 : 0;
      this.stats.tiers++;
      this.pushFx({ k: 'tier', loc: id, x: t.x, y: t.y, r: Math.max(t.x1 - t.x0, t.y1 - t.y0) * 0.5, p: tier, dir, seed: t.id, pi: t.pi });
      audio.sfx(tier === 2 ? 'boom' : 'break', t.x, t.y);
      if (this.isPlayer(src)) this.charge(m, st, t.val * (tier === 2 ? TW.houseVal.half : 1) - (t0 === 1 ? t.val : 0), tier === 2 ? '半塌的屋子' : '屋瓦');
      this.ver++;
      return true;
    }
    // 没掉档：挨打推迟修好（修到一半又挨一下）
    if (tier > 0) e.f = Math.max(e.f, day + daysOf(t.id, 0x40a5 + tier, tier === 2 ? TW.fix.half : TW.fix.dmg) * TW.DAY * 0.5);
    else e.f = Math.max(e.f, day + TW.DAY);
    if (e.rush && tier > 0) e.rush = undefined;
    return false;
  }
  private push(st: TWCity, e: TWEntry) {
    st.e.push(e);
    if (st.e.length > TW.cap.entries) {
      // 记满了：最早修好的那几件先当作修好（只丢没档的擦伤，再丢最早的）
      const i = st.e.findIndex((x) => x.t === 0);
      st.e.splice(i >= 0 ? i : 0, 1); this.ver++;
    }
  }
  /** 记账（只有玩家一方打坏的）：账上加、民望掉；小额只提示一句 */
  private charge(m: CityModel, st: TWCity, v: number, what: string) {
    if (!(v > 0)) return;
    const g = this.g;
    st.bill += v; st.good = clamp(st.good - v * TW.good.perVal, -100, 100);
    if (v >= 20) g.ws.rep -= Math.min(2, v / 60);
    if (st.bill >= TW.bill.note && this.clock - this.noteT > 6) { this.noteT = this.clock; g.toast(`你在${m.l.name}打坏了${what}，围观的人对你指指点点（${m.l.name}民望 ${Math.round(st.good)}，损坏账 ${Math.round(st.bill)} 块灵石）`, 'warn'); }
  }
  private wallMark(m: CityModel, st: TWCity, t: TWTarget, x: number, y: number, power: number) {
    const day = this.g.day;
    // 打在墙面上哪一点：墙心线上离 (x, y) 最近的点，按哪一侧挨的打定墙面
    const along = t.sub === 'x';
    const px = along ? clamp(x, t.x0 + 20, t.x1 - 20) : (t.x0 + t.x1) / 2, py = along ? (t.y0 + t.y1) / 2 : clamp(y, t.y0 + 20, t.y1 - 20);
    const n = along ? (y >= py ? 1 : -1) : (x >= px ? 1 : -1);
    const seed = hash32(Math.round(px), Math.round(py), st.w.length);
    const near = st.w.find((w) => w.pi === t.pi && Math.hypot(w.x - px, w.y - py) < 80);
    if (near) { near.s = Math.min(3, near.s + 0.3); near.f = day + daysOf(seed, 0x3a, TW.fix.wall) * TW.DAY; }
    else {
      st.w.push({ pi: t.pi, x: px, y: py, z: 40 + (seed % 1000) / 1000 * 140, n, s: clamp(0.6 + power * 0.3, 0.6, 2.2), d: day, f: day + daysOf(seed, 0x3a, TW.fix.wall) * TW.DAY, seed });
      if (st.w.length > TW.cap.walls) st.w.shift();
    }
    this.pushFx({ k: 'wall', loc: m.l.id, x: px, y: py, r: 60, p: power, dir: n > 0 ? 0 : Math.PI, seed, pi: t.pi });
    this.ver++;
  }
  private groundMark(m: CityModel, st: TWCity, s: { k: 'radial' | 'cone' | 'line' | 'crack'; x: number; y: number; x2?: number; y2?: number; r: number; dir?: number }, power: number) {
    const day = this.g.day, seed = hash32(Math.round(s.x), Math.round(s.y), this.stats.calls);
    let mk: TWMark;
    if (s.k === 'line' && s.x2 !== undefined) mk = { k: 1, x: s.x, y: s.y, x2: s.x2, y2: s.y2, r: clamp(s.r * 0.35, 24, 120), d: day, f: 0, s: seed };
    else if (s.k === 'radial') mk = { k: 0, x: s.x, y: s.y, r: clamp(s.r * 0.1 + power * 10, 30, 220), d: day, f: 0, s: seed };
    else mk = { k: 2, x: s.x + Math.cos(s.dir ?? 0) * 30, y: s.y + Math.sin(s.dir ?? 0) * 30, r: clamp(s.k === 'crack' ? s.r * 0.5 : 40 + power * 18, 40, 420), d: day, f: 0, s: seed };
    mk.f = day + daysOf(seed, 0x6d, TW.fix.ground) * TW.DAY;
    // 同一处反复砸：并成一个大一点的
    const o = st.m.find((q) => q.k === mk.k && mk.k !== 1 && Math.hypot(q.x - mk.x, q.y - mk.y) < Math.max(q.r, mk.r) * 0.5);
    if (o) { o.r = Math.min(260, Math.max(o.r, mk.r) * 1.05); o.f = mk.f; }
    else { st.m.push(mk); if (st.m.length > TW.cap.marks) st.m.shift(); }
    this.pushFx({ k: 'ground', loc: m.l.id, x: mk.x, y: mk.y, r: mk.r, p: power, dir: 0, seed });
    this.ver++;
  }
  private pushFx(f: TWFx) { this.fx.push(f); }

  // ================================================================ 给 wreck.ts：城里的树（照野外的倒法）
  /** (x0, y0)–(x1, y1) 里城中的树（布局里的 'tree' 构件；记成和地形装饰一样的样子，wreck.fellIn 照常倒） */
  treesIn(x0: number, y0: number, x1: number, y1: number): TreeFake[] {
    const out: TreeFake[] = [];
    for (const m of this.citiesIn(x0, y0, x1, y1)) for (const t of m.trees) if (t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1) out.push(t);
    return out;
  }
  /** render.ts：城里第 pi 件构件（一棵树）对应的「装饰物」；不是树返回 null */
  treeDeco(l: LocDef, L: LocLayout, ox: number, oy: number, pi: number): TreeFake | null { return this.model(l, L, ox, oy).treeByPi.get(pi) ?? null; }

  // ================================================================ 给画面：一座城此刻的样子
  private viewCache: { loc: string; ver: number; day: number; v: Map<number, TWPieceView> } | null = null;
  /** 这座城里要换替身的构件（pi → 样子）：房子掉了档的、小件坏了 / 正在倒的、牌坊 */
  pieces(m: CityModel): Map<number, TWPieceView> {
    const st = this.state(m.l.id);
    if (this.viewCache && this.viewCache.loc === m.l.id && this.viewCache.ver === this.ver) return this.viewCache.v;
    const v = new Map<number, TWPieceView>();
    const get = (t: TWTarget) => { let pv = v.get(t.pi); if (!pv) v.set(t.pi, pv = { pi: t.pi, tier: 0, scaffold: false, items: new Map(), dir: 0, seed: t.pi, fn: t.fn, key: '' }); return pv; };
    if (st) for (const e of st.e) {
      const t = m.byId.get(e.id); if (!t) continue;
      if (t.k === 'house' && e.t > 0) { const pv = get(t); pv.tier = e.t; pv.scaffold = this.scaffolding(e); pv.dir = e.dir; pv.seed = hash32(e.id, Math.floor(e.d)); }
      else if (t.k === 'small' && e.t >= 2) { const pv = get(t); pv.items.set(t.ii, 'broken'); pv.dir = e.dir; }
    }
    for (const f of this.falls) if (f.loc === m.l.id) { const t = m.byId.get(f.pi * 128 + f.ii + 1); if (t) get(t).items.set(f.ii, 'fall'); }
    for (const pv of v.values()) pv.key = `${pv.tier}|${pv.scaffold ? 1 : 0}|${[...pv.items].map(([i, s]) => i + s[0]).join(',')}|${pv.seed}`;
    this.viewCache = { loc: m.l.id, ver: this.ver, day: this.g.day, v };
    return v;
  }
  /**
   * r7-fix：这座城里此刻坏着的灯杆、牌坊（世界坐标；修好为止）。render.ts 拿它关掉灯杆那一处的灯光、收起断了的牌坊头顶的名牌。
   * 按 ver 缓存（坏、修好都会 +1）；没坏东西的城返回 null，不建模型。
   */
  private darkCache = new Map<string, { ver: number; lamps: number[]; arches: number[] }>();
  broken(locId: string): { lamps: number[]; arches: number[] } | null {
    const st = this.g.ws?.townwreck?.c[locId]; if (!st || !st.e.length) return null;
    const c = this.darkCache.get(locId); if (c && c.ver === this.ver) return c.lamps.length || c.arches.length ? c : null;
    const m = this.cityById(locId), out = { ver: this.ver, lamps: [] as number[], arches: [] as number[] };
    if (m) for (const e of st.e) {
      if (e.t < 2) continue;
      const t = m.byId.get(e.id); if (!t || t.k !== 'small') continue;
      if (t.sub === 'lamp') out.lamps.push(t.x, t.y); else if (t.sub === 'paifang') out.arches.push(t.fx, t.fy);
    }
    if (this.darkCache.size > 8) this.darkCache.clear();
    this.darkCache.set(locId, out);
    return out.lamps.length || out.arches.length ? out : null;
  }
  /** 半塌了没有（indoor.ts：半塌的屋不让进） */
  collapsed(locId: string, pi: number): boolean {
    const st = this.state(locId); if (!st || !st.e.length) return false;
    const e = st.e.find((q) => q.id === pi * 128);
    return !!e && e.t >= 2;
  }
  /** 这间屋（构件 pi）此刻第几档 */
  tierOf(locId: string, pi: number): number {
    const st = this.state(locId); if (!st) return 0;
    const e = st.e.find((q) => q.id === pi * 128); return e ? e.t : 0;
  }

  // ================================================================ NPC
  /** 城里这一带刚出过事（打砸）：给行人躲开用。返回从出事的地方往外的方向和还要怕多久（秒）；没事返回 null */
  scareAt(x: number, y: number): { ux: number; uy: number; t: number } | null {
    for (const q of this.panicL) {
      const dx = x - q.x, dy = y - q.y, d = Math.hypot(dx, dy);
      if (d < q.r) { const left = TW.panic.t - (this.clock - q.t); if (left > 0) return { ux: d > 1 ? dx / d : 1, uy: d > 1 ? dy / d : 0, t: left }; }
    }
    return null;
  }
  scare(x: number, y: number, r: number) {
    const o = this.panicL.find((q) => Math.hypot(q.x - x, q.y - y) < 200);
    if (o) { o.t = this.clock; o.r = Math.max(o.r, r); } else { this.panicL.push({ x, y, r, t: this.clock }); if (this.panicL.length > 16) this.panicL.shift(); }
  }
  /** 摊位点 (sx, sy)（stall.ts 的摊主座位）对应的摊子：ok 好好的；panic 刚被砸（摊主跑开）；broken 砸了还没修好（摊主站在旁边卖） */
  stallAt(sx: number, sy: number): { s: 'ok' | 'panic' | 'broken'; t?: TWTarget } {
    for (const m of this.citiesIn(sx - 10, sy - 10, sx + 10, sy + 10)) {
      let hit: TWTarget | null = null;
      this.near(m, sx - 80, sy - 220, sx + 80, sy, (t) => { if (!hit && t.sub === 'stall' && Math.abs(t.x - sx) < 40 && sy - t.y > 20 && sy - t.y < 200) hit = t; });
      if (!hit) continue;
      const T = hit as TWTarget, st = this.state(m.l.id);
      const e = st ? this.entry(st, T.id) : null;
      if (!e || e.t < 2) return { s: 'ok', t: T };
      const sec = (this.g.day - e.d) / Math.max(1e-6, (TW.DAY / 240));   // g.day → 秒
      return { s: sec < TW.panic.t ? 'panic' : 'broken', t: T };
    }
    return { s: 'ok' };
  }

  // ================================================================ 设施、账、捐资
  /** 这座城的状态（没有就是 null）——城里任何一点 */
  cityAt(l: LocDef): TWCity | null { return this.state(l.id); }
  /** 加急修好要多少灵石（只算没修好的；没有要修的返回 0） */
  rushPrice(l: LocDef, onlyPi?: number): number {
    const st = this.state(l.id); if (!st) return 0;
    const m = this.cityById(l.id), day = this.g.day;
    let v = 0;
    for (const e of st.e) {
      if (e.t <= 0 || e.rush) continue;
      const t = m?.byId.get(e.id);
      if (onlyPi !== undefined && t?.pi !== onlyPi) continue;
      const base = t ? (t.k === 'house' ? t.val * (e.t === 2 ? TW.houseVal.half : 1) : t.val) : 5;
      const left = clamp((e.f - day) / Math.max(1, e.f - e.d), 0, 1);
      v += base * left * TW.rush.k;
    }
    if (onlyPi === undefined) for (const q of st.m) v += 1.5;
    return v > 0 ? Math.max(TW.rush.min, Math.round(v)) : 0;
  }
  /** 捐资修缮：付了钱，要修的全部当天搭架、次日修好；民望涨一点 */
  donate(l: LocDef, onlyPi?: number): boolean {
    const price = this.rushPrice(l, onlyPi); if (price <= 0) return false;
    const h = this.g.hero;
    if (C.bagCount(h, 'mat_lingshi') < price) return false;
    C.removeItem(h, 'mat_lingshi', price);
    const st = this.state(l.id)!, m = this.cityById(l.id), day = this.g.day;
    for (const e of st.e) {
      if (e.t <= 0) continue;
      if (onlyPi !== undefined && m?.byId.get(e.id)?.pi !== onlyPi) continue;
      e.rush = 1; e.f = Math.min(e.f, day + TW.DAY * TW.rush.after);
    }
    if (onlyPi === undefined) for (const q of st.m) q.f = Math.min(q.f, day + TW.DAY * TW.rush.after);
    st.good = clamp(st.good + price * TW.good.perDonate, -100, 100);
    st.paid = (st.paid ?? 0) + price;
    this.g.ws.rep += Math.min(3, price / 100);
    this.ver++;
    return true;
  }
  /** 赔账：赔清了就销 */
  payBill(l: LocDef): boolean {
    const st = this.state(l.id); if (!st) return false;
    const due = Math.ceil(st.bill + st.owe); if (due <= 0) return false;
    const h = this.g.hero; if (C.bagCount(h, 'mat_lingshi') < due) return false;
    C.removeItem(h, 'mat_lingshi', due);
    st.bill = 0; st.owe = 0; st.oweD = 0; st.good = clamp(st.good + 5, -100, 100);
    return true;
  }
  /** 欠着不还的城：设施（传送阵、悬赏榜除外）不做你的生意 */
  refuses(l: LocDef, fac?: string): boolean {
    if (fac === 'teleport' || fac === 'board') return false;
    const st = this.state(l.id); return !!st && st.owe > 0;
  }
  /**
   * towns.open 之前问一句：欠账的城拒之门外（给一段对话，可以当场还清）；半塌的铺子由掌柜在门口的临时摊上办事（对话里照常办）。
   * 返回 null 照常开；open 是照常开的那个函数（不再问这里）。
   */
  beforeOpen(l: LocDef, fac: string | undefined, open: () => void): DNode | null {
    const st = this.state(l.id); if (!st) return null;
    const g = this.g;
    if (this.refuses(l, fac)) {
      const due = Math.ceil(st.owe + st.bill), have = C.bagCount(g.hero, 'mat_lingshi');
      return { speaker: '伙计', text: `伙计把门板一横：「城卫执事交代过了——你在${l.name}砸坏的东西还欠着 ${due} 块灵石没赔，本店不做你的生意。」`, options: [
        { label: `当场赔清（${due} 灵石）`, tone: 'gold', disabled: have < due, hint: have < due ? '灵石不足' : undefined, act: () => { this.payBill(l); g.toast(`赔清了${l.name}的损坏账。`, 'good'); open(); return null; } },
        { label: '走开', act: () => null },
      ] };
    }
    if (!fac) return null;
    const m = this.cityById(l.id); if (!m) return null;
    const t = m.T.find((q) => q.fn === fac && q.k === 'house'); if (!t) return null;
    const e = this.entry(st, t.id); if (!e || e.t < 2) return null;
    const price = this.rushPrice(l, t.pi), have = C.bagCount(g.hero, 'mat_lingshi');
    return { speaker: '掌柜', text: `铺面塌了半边，掌柜在门口支起一张方桌、挑起一块布幌子：「客官莫见怪，里头进不去了，就在这儿办吧——东西一样不少。」`, options: [
      { label: '照常办事', tone: 'good', act: () => { open(); return null; } },
      ...(price > 0 ? [{ label: `捐资修缮这间铺子（${price} 灵石，次日修好）`, tone: 'gold' as const, disabled: have < price, hint: have < price ? '灵石不足' : undefined, act: () => { this.donate(l, t.pi); g.toast(`掌柜连声道谢：工匠今日就来搭架子。（${l.name}民望 +${Math.max(1, Math.round(price * TW.good.perDonate))}）`, 'good'); return null; } }] : []),
      { label: '离开', act: () => null },
    ] };
  }
  /** 城镇面板上的「捐资修缮」一栏（没有要修的、也没账：null） */
  card(l: LocDef): { name: string; desc: string; act: () => DNode } | null {
    const st = this.state(l.id); if (!st) return null;
    const price = this.rushPrice(l), due = Math.ceil(st.bill + st.owe);
    if (price <= 0 && due <= 0) return null;
    const bits: string[] = [];
    if (price > 0) bits.push(`城里有 ${st.e.filter((e) => e.t > 0).length} 处待修`);
    if (due > 0) bits.push(`你欠着 ${due} 块灵石的损坏账`);
    return { name: '捐资修缮', desc: bits.join('，'), act: () => this.donateNode(l) };
  }
  donateNode(l: LocDef): DNode {
    const g = this.g, st = this.state(l.id, true)!, price = this.rushPrice(l), due = Math.ceil(st.bill + st.owe), have = C.bagCount(g.hero, 'mat_lingshi');
    const M = this.cityById(l.id), kindOf = (e: TWEntry) => M?.byId.get(e.id)?.k ?? 'small';
    const broken = st.e.filter((e) => e.t > 0), small = broken.filter((e) => kindOf(e) === 'small').length, half = broken.filter((e) => e.t === 2 && kindOf(e) === 'house').length, dmg = broken.filter((e) => e.t === 1).length;
    const lines = [`坊市管事翻开一本簿子：「${l.name}眼下待修的——`];
    if (half) lines.push(`　半塌的屋子 ${half} 座`); if (dmg) lines.push(`　掉了瓦、裂了墙的 ${dmg} 座`); if (small) lines.push(`　砸坏的摊子、灯杆、旗杆 ${small} 件`); if (st.m.length) lines.push(`　碎了的石板路 ${st.m.length} 处`);
    if (!broken.length && !st.m.length) lines.push('　没有了，城里都修好了。');
    lines.push(price > 0 ? `照工匠的价，出 ${price} 块灵石，今日就搭架子，明日便焕然一新。」` : '」');
    if (due > 0) lines.push(`\n（你在城里砸坏的东西记着账：${due} 块灵石。）`);
    lines.push(`\n${l.name}民望：${Math.round(st.good)}`);
    return { speaker: '坊市管事', text: lines.join('\n'), options: [
      ...(price > 0 ? [{ label: `捐资修缮（${price} 灵石）`, tone: 'gold' as const, disabled: have < price, hint: have < price ? '灵石不足' : undefined, act: (): DNode | null => { this.donate(l); g.toast(`捐了 ${price} 块灵石修城：工匠今日就来。（${l.name}民望 +${Math.max(1, Math.round(price * TW.good.perDonate))}）`, 'good'); return null; } }] : []),
      ...(due > 0 ? [{ label: `赔清损坏账（${due} 灵石）`, tone: 'good' as const, disabled: have < due, hint: have < due ? '灵石不足' : undefined, act: (): DNode | null => { this.payBill(l); g.toast(`赔清了${l.name}的损坏账，账已销。`, 'good'); return null; } }] : []),
      { label: '告辞', act: () => null },
    ] };
  }
  /** 账够了门槛、主角在这座城里：城卫执事上来讨赔（隔几天讨一回） */
  private collector(m: CityModel, st: TWCity) {
    const g = this.g, p = g.player;
    if (!this.inside(m, p.x, p.y) || g.modal || g.hero.dead || this.c.inCombat) return;
    const due = st.bill + st.owe;
    if (st.bill < TW.bill.demand && !(st.owe > 0 && due >= TW.bill.demand * 0.5)) return;
    if (g.day - st.ask < TW.bill.askGap * TW.DAY) return;
    st.ask = g.day;
    g.openDialog(this.collectorNode(m.l));
  }
  /** 城卫执事讨赔：赔 / 欠着 / 动手 */
  collectorNode(l: LocDef): DNode {
    const g = this.g, st = this.state(l.id, true)!, due = Math.ceil(st.bill + st.owe), have = C.bagCount(g.hero, 'mat_lingshi');
    return { speaker: '城卫执事', title: `${l.name}城卫`, mood: 'danger',
      text: `两名城卫一左一右拦住去路，执事拱了拱手，翻开账簿：「道友留步。这几日你在${l.name}打砸——摊子、屋瓦、半塌的铺面，街坊都记着呢。照价，一共 ${due} 块灵石。赔了，这事就算揭过；不赔……城里的铺子可就不敢做你的生意了。」`,
      options: [
        { label: `赔（${due} 灵石）`, tone: 'gold', disabled: have < due, hint: have < due ? '灵石不足' : undefined, act: () => { this.payBill(l); g.toast(`赔清了${l.name}的损坏账，账已销。`, 'good'); return { speaker: '城卫执事', text: '执事合上账簿：「道友爽快。往后在城里，还请收着点手。」', options: [{ label: '好说', act: () => null }] }; } },
        { label: '先欠着', act: () => { st.owe += st.bill; st.bill = 0; st.oweD = g.day; st.good = clamp(st.good - 8, -100, 100); g.toast(`${l.name}的铺子不做你的生意了，直到还清 ${Math.ceil(st.owe)} 块灵石（城镇面板「捐资修缮」里可以还）。`, 'warn'); return { speaker: '城卫执事', text: `执事冷笑一声，在账簿上画了个圈：「记下了。${l.name}的铺子，往后不做你的生意。」`, options: [{ label: '随你', act: () => null }] }; } },
        { label: '动手', tone: 'bad', act: () => { this.fight(l, st); return null; } },
      ] };
  }
  /** 动手：照城里动手的后果走——正道声望掉、民望大掉、城卫随后追来（pursuit），账照旧记着 */
  private fight(l: LocDef, st: TWCity) {
    const g = this.g;
    st.owe += st.bill; st.bill = 0; st.oweD = g.day; st.good = clamp(st.good - 30, -100, 100);
    g.ws.rep -= 10;
    g.toast(`你在${l.name}对城卫动了手：正道声望 -10，${l.name}民望大跌，城卫随后就到。`, 'warn');
    try { g.pursuit?.start({ reason: `${l.name}城卫追拿毁坏街市、拒不赔偿之人`, name: `${l.name}城卫`, gap: 0, why: `毁我${l.name}街市还敢拒捕` }); } catch (e) { console.warn('[城镇破坏] 追拿', e); }
  }

  // ================================================================ 测试 / 试玩
  /** 把一座城的状态整个清掉（试玩「复原」） */
  clear(l: LocDef) { const S = this.g.ws?.townwreck; if (S) delete S.c[l.id]; this.falls = this.falls.filter((f) => f.loc !== l.id); this.ver++; }
  /** 一座城的所有可破坏物（测试用） */
  targetsOf(l: LocDef): TWTarget[] { return this.modelOf(l)?.T ?? []; }
}

// ================================================================ 按布局建模型
function buildModel(l: LocDef, L: LocLayout, ox: number, oy: number): CityModel {
  const T: TWTarget[] = [], trees: TreeFake[] = [], treeByPi = new Map<number, TreeFake>();
  const anchors = (L as LocLayout & { anchors?: Record<string, { x: number; y: number }> }).anchors ?? {};
  const story: [number, number][] = [];
  for (const [k, v] of Object.entries(anchors)) if (!k.startsWith('mkt') && k !== 'tp') story.push([ox + v.x * LOC_SCALE, oy + v.y * LOC_SCALE]);
  const doors = (L.doors ?? []).map((d) => ({ x: ox + d.x * LOC_SCALE, y: oy + d.y * LOC_SCALE, fn: d.fn }));
  const add = (t: Omit<TWTarget, 'x' | 'y'>) => T.push({ ...t, x: (t.x0 + t.x1) / 2, y: (t.y0 + t.y1) / 2 });
  /** 本地矩形（x 宽 w 居中，z 从 0 往后 d）按朝向转到世界 */
  const footprint = (X: number, Y: number, r: number, xa: number, xb: number, za: number, zb: number) => {
    const P = [rotXY(r, xa, za), rotXY(r, xb, za), rotXY(r, xa, zb), rotXY(r, xb, zb)];
    return { x0: X + Math.min(...P.map((p) => p[0])), x1: X + Math.max(...P.map((p) => p[0])), y0: Y + Math.min(...P.map((p) => p[1])), y1: Y + Math.max(...P.map((p) => p[1])) };
  };
  const houseHp = (w: number, d: number) => clamp(TW.houseHp.base + w * d / TW.houseHp.per, TW.houseHp.min, TW.houseHp.max);
  const houseVal = (w: number, d: number) => Math.round(TW.houseVal.base + w * d / TW.houseVal.per);
  const isStory = (x0: number, y0: number, x1: number, y1: number) => story.some(([x, y]) => x > x0 - 260 && x < x1 + 260 && y > y0 - 260 && y < y1 + 260);
  L.pieces.forEach((pc: Piece, pi: number) => {
    const p = pc.p, X = ox + pc.x * LOC_SCALE, Y = oy + pc.y * LOC_SCALE, r = (p.r as number) ?? 0;
    const base = { pi, ii: -1, id: pi * 128, room: false, r, fx: X, fy: Y };
    switch (pc.kind) {
      case 'cshop': case 'chouse': {
        const w = p.w as number, d = p.d as number, fp = footprint(X, Y, r, -w / 2, w / 2, -d, 0);
        const [fx, fy] = FACE[((r % 4) + 4) % 4];
        const named = isStory(fp.x0, fp.y0, fp.x1, fp.y1);
        add({ ...base, ...fp, k: named ? 'prot' : 'house', sub: pc.kind, hp: houseHp(w, d), val: houseVal(w, d), prot: named ? PROT.story : null, fn: p.fn as string | undefined, room: !!p.fn && ['rest', 'tavern', 'pill', 'artifact', 'talisman', 'market'].includes(p.fn as string), fx: X + fx * 70, fy: Y + fy * 70 });
        break;
      }
      case 'ccourt': {
        const w = p.w as number, d = p.d as number, fp = footprint(X, Y, 0, -w / 2, w / 2, -d, 0);
        const named = !!p.name || isStory(fp.x0, fp.y0, fp.x1, fp.y1);
        add({ ...base, ...fp, k: named ? 'prot' : 'house', sub: 'ccourt', hp: houseHp(w, d), val: houseVal(w, d), prot: named ? (p.name ? PROT.ccourt_named : PROT.story) : null, fy: Y + 40 });
        break;
      }
      case 'B': case 'house': case 'hut': {
        if (p.prop) break;
        const w = (p.w as number) ?? 70, h = (p.h as number) ?? 60, s = pc.kind === 'B' ? 1 : LOC_SCALE;
        const ww = w * s * 0.88, dd = Math.min(h * 0.38, w * 0.42) * s + 30;
        const fp = { x0: X - ww / 2, x1: X + ww / 2, y0: Y - dd, y1: Y };
        const named = isStory(fp.x0, fp.y0, fp.x1, fp.y1);
        add({ ...base, ...fp, k: named ? 'prot' : 'house', sub: pc.kind, hp: houseHp(ww, dd), val: houseVal(ww, dd), prot: named ? PROT.story : null, fy: Y + 40 });
        break;
      }
      case 'ckit': {
        const items = (p.items ?? []) as [string, number, number, number?, string?][];
        items.forEach((it, ii) => {
          const k = it[0], S = TW.small[k], ir = it[3] ?? 0;
          if (k === 'notice') { add({ ...base, ii, id: pi * 128 + ii + 1, x0: X + it[1] - 60, x1: X + it[1] + 60, y0: Y + it[2] - 20, y1: Y + it[2] + 20, k: 'prot', sub: 'notice', hp: 1, val: 0, prot: PROT.notice }); return; }
          if (!S) return;
          const [cx, cz] = rotXY(ir, S.cx, 0), odd = ir % 2 === 1, hw = odd ? S.hh : S.hw, hh = odd ? S.hw : S.hh;
          const x = X + it[1] + cx, y = Y + it[2] + cz;
          // 靠着设施门口的小件不坏（门口别堵一地残骸）
          if (doors.some((d) => d.fn && Math.hypot(d.x - x, d.y - y) < 60)) return;
          add({ ...base, ii, id: pi * 128 + ii + 1, x0: x - hw, x1: x + hw, y0: y - hh, y1: y + hh, k: 'small', sub: k, hp: S.hp, val: S.val, prot: null, r: ir });
        });
        break;
      }
      case 'cpaifang': {
        const w = p.w as number, fp = r % 2 ? { x0: X - 18, x1: X + 18, y0: Y - w / 2, y1: Y + w / 2 } : { x0: X - w / 2, x1: X + w / 2, y0: Y - 18, y1: Y + 18 };
        add({ ...base, ...fp, k: 'small', sub: 'paifang', hp: TW.paifang.hp, val: TW.paifang.val, prot: null, id: pi * 128 });
        break;
      }
      case 'tree': {
        const s = (p.s as number) ?? 0.55;
        const tf: TreeFake = { kind: 'tree', x: X, y: Y, h: 330 * s * LOC_SCALE, w: 150 * s * LOC_SCALE, v: pc.seed >>> 0, s, _tw: { loc: l.id, pi } };
        trees.push(tf); treeByPi.set(pi, tf);
        break;
      }
      case 'cwall': {
        const len = p.len as number, t = (p.t as number) ?? 200, along = p.ax === 'x';
        const fp = along ? { x0: X - len / 2, x1: X + len / 2, y0: Y - t / 2, y1: Y + t / 2 } : { x0: X - t / 2, x1: X + t / 2, y0: Y - len / 2, y1: Y + len / 2 };
        add({ ...base, ...fp, k: 'wall', sub: along ? 'x' : 'y', hp: 1, val: 0, prot: PROT.cwall });
        break;
      }
      case 'cwallp': case 'cgate': case 'ctower': case 'cteleport': case 'chall': case 'cpagoda': case 'cbell': case 'caltar': case 'cround': case 'cterrace': case 'cgatehouse': case 'cpav': {
        const w = (p.w as number) ?? (p.len as number) ?? (p.r as number) ?? 300, d = (p.d as number) ?? (p.t as number) ?? w;
        const R = pc.kind === 'cteleport' ? (p.r as number) ?? 170 : 0;
        const fp = R ? { x0: X - R, x1: X + R, y0: Y - R, y1: Y + R } : { x0: X - Math.max(w, d) / 2, x1: X + Math.max(w, d) / 2, y0: Y - Math.max(w, d) / 2, y1: Y + Math.max(w, d) / 2 };
        add({ ...base, ...fp, k: 'prot', sub: pc.kind, hp: 1, val: 0, prot: PROT[pc.kind] ?? '地标', r: 0 });
        break;
      }
    }
  });
  const grid = new Map<number, number[]>();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  T.forEach((t, i) => {
    x0 = Math.min(x0, t.x0); y0 = Math.min(y0, t.y0); x1 = Math.max(x1, t.x1); y1 = Math.max(y1, t.y1);
    for (let gy = Math.floor(t.y0 / CELL); gy <= Math.floor(t.y1 / CELL); gy++) for (let gx = Math.floor(t.x0 / CELL); gx <= Math.floor(t.x1 / CELL); gx++) {
      const k = gx * 100003 + gy; let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i);
    }
  });
  if (!T.length) { x0 = ox - L.gw * LOC_SCALE / 2; x1 = ox + L.gw * LOC_SCALE / 2; y0 = oy - L.gh * LOC_SCALE / 2; y1 = oy + L.gh * LOC_SCALE / 2; }
  return { l, L, ox, oy, T, byId: new Map(T.map((t) => [t.id, t])), grid, trees, treeByPi, x0, y0, x1, y1 };
}
