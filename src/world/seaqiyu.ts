// 收官 B3：无边海的奇遇——幽灵古船与百鬼海市、潮汐古魔祭坛。挂在 game.jueyu.qiyu（world/jueyu.ts 的构造里建），由 jueyu.tick 每帧驱动。
//
// 用户要的（2026-11-15）：
//   · 幽灵古船：血月夜或黑水暴时，核心 / 断层里出现一艘幽灵古船（sb_ghostship 贴图，半透明、带鬼火）；登船后是一个小集市——
//     鬼修摊主卖稀罕货（复用摆摊的 StallPanel：这里实现它要的那几样接口，不另写一套界面）、可以打听深海的消息（标出一处海底遗迹的方位）。
//     天亮 / 风暴过去船就散。
//   · 潮汐古魔祭坛：每隔几个游戏日退潮时在固定的几处（按种子）浮出海面，是一小块能落脚的礁盘加祭坛；献祭海兽材料换一次性的加持
//     （一段时间避水、定风、海兽不近身），或叩坛引出一场守坛战。涨潮前示警，不走会落水。
//   · 罗盘上给这些奇遇远远的方位提示（不直接标点，保留探索感）。
//
// 血月：原来没有这个天象。这里定成「夜里、按夜的序号掷一次、三成的夜是血月」（自己的哈希，不碰 Math.random）；黑水暴＝人在核心海域的飓风里。
// 船、祭坛都是「大立板」（原画是斜俯视的），人站上去走的是「甲板」：人的世界坐标钉在立板前面一线，前后走动换成在甲板上的深浅（立板抬高），
// 左右走沿着甲板——画出来就是站在甲板上来回走。上去、下来都是玩家自己操作：飞过去落下、游到船边就攀上去、驾船靠过去上岸。
import { pressKey } from '../core/keymap';   // 第五轮：说明里的键位从 keymap 取，触屏换说法
import type { Game } from './game';
import type { NpcData } from './npc';
import type { StallGood, StallInfo } from './stall';
import type { DNode } from './modal';
import * as C from './cultivation';
import { Enemy } from './combat';
import { itemDef } from '../data/items';
import { ENEMIES, lvRealm } from '../data/enemies';
import { gearDropId, SETS } from '../data/gear';
import { ACTIVE_MAP, mapFrame } from '../data/world';
import { hashU, mulberry32 } from '../core/rng';
import { audio } from './audio';
import { C as AT } from '../gl/atlas';
import type { FxSys, RGB } from '../gl/fx';
import type { SeaView } from './seabeast';
import { seaImg } from '../gfx/seaImg';

/** 昼夜一轮多少现实秒（同 game.ts 的 DAY_CYCLE；这里不 import game.ts，免得循环引用） */
const DAY_CYCLE = 240;
const smooth01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const sstep = (a: number, b: number, x: number) => smooth01((x - a) / (b - a));
const H = (a: number, b: number, s: number) => hashU(a | 0, b | 0, s | 0);
function quiet<T>(seed: number, f: () => T): T { const r = Math.random; Math.random = mulberry32(seed | 0); try { return f(); } finally { Math.random = r; } }

/** 一块能站的「甲板」：x、y 是立板脚下的中点（本图坐标），half 半长；lift(u, v)：u 沿船身 0（船头 / 左）–1，v 往里 0（前沿）–1，给出甲板离水面多高 */
export interface Deck { id: string; x: number; y: number; half: number; depth: number; lift: (u: number, v: number) => number; width: (v: number) => number; name: string }
/** 人站在甲板上：钉在立板前面这么远 */
const DECK_FRONT = 26;

/** 鬼船：按大陆坐标分格，血月夜每格一艘（核心、断层里） */
const GS_CELL = 36000;
const GS_H = 900;
/** 鬼船原画（900×603，船头朝左）上的几处：船灯（鬼火）的像素位置 */
const GS_LAMPS: [number, number][] = [[152, 345], [322, 355], [540, 393], [588, 320], [638, 265], [740, 345], [884, 285]];
/** 祭坛：按大陆坐标分格；每格至多一座 */
const ALT_CELL = 42000, ALT_H = 640;
/** 祭坛隔几个昼夜退一次潮、露出来多久（占一个周期的几成）、涨潮前几成开始示警 */
const ALT_CYCLES = 2, ALT_UP = 0.3, ALT_WARN = 0.06;

interface Vendor { i: number; name: string; title: string; ware: 'dan' | 'qi' | 'yao' | 'za'; shout: string[]; tint: [number, number, number]; u: number }
const VENDORS: Vendor[] = [
  { i: 0, name: '幽灯行商', title: '鬼修 · 行商', ware: 'qi', shout: ['船、珠子、出海的家什……灵石照收，海里的东西更好。', '活人的灵石，死人的船——要不要？'], tint: [0.7, 1, 0.9], u: 0.3 },
  { i: 1, name: '无面药婆', title: '鬼修 · 药婆', ware: 'dan', shout: ['避水丹，避水丹，沉下去也喘得上气。', '海灵芝要不要？万年的，就剩这一株。'], tint: [0.85, 0.75, 1], u: 0.46 },
  { i: 2, name: '骨匠', title: '鬼修 · 骨匠', ware: 'za', shout: ['龟甲打的冠、玉，带着海里的寒气。', '死在海上的修士，身上的好东西都在我这儿。'], tint: [1, 0.85, 0.6], u: 0.62 },
  { i: 3, name: '说书鬼', title: '鬼修 · 说书', ware: 'yao', shout: ['想知道海底哪儿埋着古魔的东西？', '一钱灵石一句话，童叟无欺。'], tint: [0.6, 0.85, 1], u: 0.78 },
];

interface Ship { on: boolean; k: number; x: number; y: number; cx: number; cy: number; why: 'moon' | 'storm' | ''; key: string; warned: boolean }
interface Altar { id: number; cx: number; cy: number; ph: number; up: number; warn: boolean; cyc: number }

export class SeaQiyu {
  /** 此刻的鬼船（没有就是 on = false） */
  ship: Ship = { on: false, k: 0, x: 0, y: 0, cx: 0, cy: 0, why: '', key: '', warned: false };
  /** 附近的祭坛 */
  altars: Altar[] = [];
  /** 人站在哪块甲板上、往里多深（0–1）、沿着多远（0–1） */
  deck: Deck | null = null; dv = 0.3; du = 0.5;
  /** 界面（Compass.tsx 读）：远远的方位提示 */
  hud = { ghostDir: NaN, ghostTxt: '', altarDir: NaN, altarTxt: '', rumorDir: NaN, rumorTxt: '', prompt: '', deckWarn: '' };
  private fdx = 0; private fdy = 0; private scanT = 0;
  private fight: { altar: number; foes: Enemy[]; done: boolean } | null = null;
  private fxq: { k: 'rise' | 'sink' | 'bless' | 'fade'; x: number; y: number }[] = [];
  private seen = new WeakSet<Enemy>();

  constructor(readonly game: Game) {}

  // ------------------------------------------------------------ 时令
  /** 第几夜（按昼夜循环数） */
  private nightNo(): number { return Math.floor(this.game.clock / DAY_CYCLE + 0.5); }
  /** 今夜是不是血月（三成的夜） */
  bloodMoon(): boolean { const g = this.game; return g.night > 0.55 && H(this.nightNo(), 0, 9301) < 0.3; }
  /** 血月的程度（界面、天色用） */
  get moonK(): number { const g = this.game; return H(this.nightNo(), 0, 9301) < 0.3 ? sstep(0.4, 0.75, g.night) : 0; }

  // ------------------------------------------------------------ 每帧
  reset() { this.ship.on = false; this.ship.k = 0; this.altars = []; this.deck = null; this.fight = null; this.scanT = 0; this.fxq.length = 0; }
  tick(dt: number) {
    const g = this.game, J = g.jueyu, p = g.player;
    const f = mapFrame(ACTIVE_MAP); this.fdx = f.dx; this.fdy = f.dy;
    if (!J.profile || !J.profile.medium.qiyu || g.offWorld || g.inCave || g.xukong?.active) { this.deck = null; this.ship.on = false; this.ship.k = 0; return; }   // 收官 B4：鬼船、祭坛是无边海的，别界不放
    this.scanT -= dt; if (this.scanT <= 0) { this.scanT = 0.5; this.scanAltars(); }
    this.shipTick(dt);
    this.altarTick(dt);
    this.deckTick(dt);
    this.fightTick();
    this.updHud();
    void p;
  }
  // ------------------------------------------------------------ 鬼船
  private shipTick(dt: number) {
    const g = this.game, J = g.jueyu, p = g.player, S = this.ship, [pcx, pcy] = J.toHome(p.x, p.y);
    // 今夜的那一艘：血月夜，人附近格子里离人最近的一艘；黑水暴：在人所在那场飓风的风眼里
    let want: { cx: number; cy: number; why: 'moon' | 'storm'; key: string } | null = null;
    const st = J.stormNear(p.x, p.y);
    if (st && J.depth > 30000) { /* 人在飓风里（雨带、风眼都算） */ const s = J.stormCenter(st.id); if (s) want = { cx: s.x, cy: s.y, why: 'storm', key: 's' + st.id }; }
    if (!want && this.moonK > 0) {
      const n = this.nightNo(), ci = Math.floor(pcx / GS_CELL), cj = Math.floor(pcy / GS_CELL);
      let bd = Infinity;
      for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
        if (H(i * 7 + n, j, 9311) > 0.75) continue;
        const cx = (i + 0.2 + 0.6 * H(i, j + n, 9312)) * GS_CELL, cy = (j + 0.2 + 0.6 * H(i + n, j, 9313)) * GS_CELL;
        if (this.game.jueyu.homeDepth(cx, cy) < 14000) continue;
        const d = Math.hypot(cx - pcx, cy - pcy); if (d < bd) { bd = d; want = { cx, cy, why: 'moon', key: `m${n}:${i}:${j}` }; }
      }
    }
    if (S.on && S.key === this.forced && g.time < this.forcedUntil) want = { cx: S.cx, cy: S.cy, why: S.why || 'moon', key: S.key };   // 试玩 / 测试强行起的那一艘
    if (want && (!S.on || S.key !== want.key) && S.k < 0.05) { S.on = true; S.key = want.key; S.cx = want.cx; S.cy = want.cy; S.why = want.why; S.warned = false; }
    if (S.on && want && S.key === want.key) { S.cx = want.cx; S.cy = want.cy; S.k = Math.min(1, S.k + dt / 6); S.warned = false; }
    else if (S.on) {
      // 天亮了 / 风暴过去了：船慢慢淡下去
      if (!S.warned && S.k > 0.5) { S.warned = true; if (this.deck?.id === 'ship') g.toast(S.why === 'moon' ? '东方泛白，鬼船的轮廓一点点淡了下去——再不走就要落进海里！' : '风暴过去了，鬼船像一口吹散的雾，正在散开——快离开甲板！', 'warn'); this.fxq.push({ k: 'fade', x: S.x, y: S.y }); }
      S.k = Math.max(0, S.k - dt / 14);
      if (S.k <= 0) S.on = false;
    }
    // 黑水暴里船跟着风眼走；平时随浪原地漂一点
    S.x = S.cx + this.fdx + Math.sin(g.time * 0.11) * 30; S.y = S.cy + this.fdy + Math.cos(g.time * 0.09) * 18;
  }
  private shipDeck(): Deck | null {
    const S = this.ship; if (!S.on || S.k < 0.45) return null;
    const W = GS_H * 900 / 603;
    return {
      id: 'ship', name: '幽灵古船', x: S.x + W * 0.03, y: S.y, half: W * 0.37, depth: 70,
      // 原画：甲板中段离船底约三成六，往里升到四成八；船尾的楼阁那一截再高一点；船头的龙首那一截低一点
      // 立板本身往水下沉了一成二（船底在水线以下），甲板离水面的高度要减去这一截
      lift: (u, v) => GS_H * (0.31 + 0.12 * v + 0.07 * sstep(0.74, 0.86, u) - 0.03 * (1 - sstep(0.05, 0.2, u)) - 0.12),
      width: () => 1,
    };
  }
  // ------------------------------------------------------------ 祭坛
  private scanAltars() {
    const g = this.game, J = g.jueyu, [pcx, pcy] = J.toHome(g.player.x, g.player.y), ci = Math.floor(pcx / ALT_CELL), cj = Math.floor(pcy / ALT_CELL);
    const keep = new Map(this.altars.map((a) => [a.id, a]));
    const out: Altar[] = [];
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
      const a = this.altarIn(i, j); if (!a) continue;
      out.push(keep.get(a.id) ?? a);
    }
    this.altars = out;
  }
  /** 一格里有没有祭坛（大陆坐标；测试直接调它验「按种子」） */
  altarIn(i: number, j: number): Altar | null {
    if (H(i, j, 9401) >= 0.55) return null;
    const cx = (i + 0.25 + 0.5 * H(i, j, 9402)) * ALT_CELL, cy = (j + 0.25 + 0.5 * H(i, j, 9403)) * ALT_CELL;
    { const sd = this.game.jueyu.homeDepth(cx, cy); if (sd < 16000 || sd > 44000) return null; }   // 绝域里罡风把人吹回来，站不住，不放祭坛
    return { id: (Math.imul(i, 40503) ^ Math.imul(j, 81233) ^ 0xa17a) >>> 0, cx, cy, ph: H(i, j, 9404), up: 0, warn: false, cyc: -1 };
  }
  /** 祭坛此刻的潮相：0–1 在一个周期里的位置；露出水面的程度 0–1；这一周期的序号 */
  tide(a: Altar): { p: number; up: number; cyc: number; warn: boolean } {
    const x = this.game.clock / DAY_CYCLE / ALT_CYCLES + a.ph, cyc = Math.floor(x), p = x - cyc;
    const up = p < ALT_UP ? sstep(0, 0.035, p) * (1 - sstep(ALT_UP - 0.025, ALT_UP, p)) : 0;
    return { p, up, cyc, warn: p > ALT_UP - ALT_WARN && p < ALT_UP };
  }
  private altarTick(_dt: number) {
    const g = this.game, p = g.player;
    for (const a of this.altars) {
      const T = this.tide(a), was = a.up;
      a.up = T.up; a.cyc = T.cyc;
      const [x, y] = this.altarLocal(a), d = Math.hypot(x - p.x, y - p.y);
      if (was < 0.05 && a.up >= 0.05 && d < 6000) { this.fxq.push({ k: 'rise', x, y }); if (d < 4000) g.toast('退潮了——远处的海面上，一块黑礁带着一座古魔祭坛慢慢浮了出来。', 'info'); }
      if (T.warn && !a.warn) { a.warn = true; if (this.deck?.id === 'altar' + a.id) { g.toast('潮水开始回涨，礁盘边上已经漫上了水——快离开祭坛！', 'warn'); audio.sfx('bell'); } }
      if (!T.warn) a.warn = false;
      if (was > 0.05 && a.up <= 0.05 && d < 6000) this.fxq.push({ k: 'sink', x, y });
    }
  }
  private altarLocal(a: Altar): [number, number] { return [a.cx + this.fdx, a.cy + this.fdy]; }
  private altarDeck(a: Altar): Deck | null {
    if (a.up < 0.9) return null;
    const [x, y] = this.altarLocal(a), W = ALT_H * 640 / 489;
    return {
      id: 'altar' + a.id, name: '古魔祭坛', x, y, half: W * 0.4, depth: 60,
      // 礁盘：前沿离底约一成六，往里到四成；两头窄（椭圆）
      lift: (_u, v) => ALT_H * (0.15 + 0.2 * v - 0.12) - (1 - a.up) * ALT_H * 0.55,   // 立板沉下去的一成二要减掉
      width: (v) => Math.sqrt(Math.max(0.05, 1 - Math.pow((v - 0.45) * 1.6, 2))),
    };
  }
  /** 一点（本图坐标）站不站得上某块甲板（jueyu.footholds 登记） */
  deckAt(x: number, y: number): Deck | null {
    const ds: Deck[] = []; const sd = this.shipDeck(); if (sd) ds.push(sd);
    for (const a of this.altars) { const ad = this.altarDeck(a); if (ad) ds.push(ad); }
    for (const D of ds) if (Math.abs(y - (D.y + DECK_FRONT)) < 70 && Math.abs(x - D.x) < D.half * D.width(this.deck?.id === D.id ? this.dv : 0.3)) return D;
    return null;
  }
  /** 船走不过去的地方（鬼船的船身、祭坛的礁盘） */
  blocksBoat(x: number, y: number): boolean {
    const S = this.ship;
    if (S.on && S.k > 0.4 && Math.abs(x - S.x) < GS_H * 0.62 && y < S.y + 30 && y > S.y - 180) return true;
    for (const a of this.altars) { if (a.up < 0.3) continue; const [ax, ay] = this.altarLocal(a); if (((x - ax) / 380) ** 2 + ((y - ay + 60) / 150) ** 2 < 1) return true; }
    return false;
  }
  /** 甲板：人站上去以后，前后走换成往里走、左右走沿着甲板（每帧，移动积分之后） */
  private deckTick(_dt: number) {
    const g = this.game, p = g.player, J = g.jueyu;
    const D0 = this.deck, D = D0 ? (D0.id === 'ship' ? this.shipDeck() : this.altarDeckById(D0.id)) : null;
    if (D0 && !D) {
      // 船散了 / 潮涨了：脚下没了
      this.deck = null;
      if (!p.flying && !J.deep.active) { J.swimming = true; J.stagger = 0.5; g.toast(D0.id === 'ship' ? '脚下的甲板化成一团冷雾——你掉进了海里！' : '潮水漫过了礁盘，祭坛沉回了海里——你也跟着落了水。', 'warn'); }
      return;
    }
    if (D) {
      if (p.flying || J.deep.active || J.boat.aboard) { this.deck = null; return; }
      // 前后：人被移动推离了钉的那条线，差多少就往里 / 往外走多少
      const fy = D.y + DECK_FRONT, dy = p.y - fy;
      this.dv = Math.max(0, Math.min(1, this.dv - dy / D.depth / 4));
      if (dy > 18 && this.dv <= 0) { this.deck = null; p.y = fy + 60; J.swimming = true; g.toast(`从${D.name}的边上跳进了海里。`, 'info'); return; }
      const wv = D.width(this.dv), x0 = D.x - D.half * wv, x1 = D.x + D.half * wv;
      p.y = fy; p.x = Math.max(x0, Math.min(x1, p.x));
      this.du = (p.x - (D.x - D.half)) / (2 * D.half);
      this.deck = D;
      return;
    }
    // 不在甲板上：飞落 / 游过来 / 下了船，脚下是甲板就站上去
    if (!p.flying && !J.deep.active && !J.boat.aboard) {
      const hit = this.deckAt(p.x, p.y);
      if (hit) { this.deck = hit; this.dv = 0.25; J.swimming = false; p.y = hit.y + DECK_FRONT; g.toast(hit.id === 'ship' ? '踏上了幽灵古船的甲板。船灯幽绿，桅杆上挂着破帆，甲板上影影绰绰摆着几个鬼市的摊子。' : '踏上了湿滑的礁盘。祭坛上刻着古魔的面孔，坛里积着一汪发光的海水。', 'info'); if (hit.id === 'ship') g.hint('sea-ghostship', `百鬼海市：靠近摊主${pressKey('interact', '点「谈」')}买卖。说书鬼能打听到海底古魔遗迹的方位。天一亮（或风暴过去），船就散了——留意提示，及时离开。`); }
    }
  }
  private altarDeckById(id: string): Deck | null { const a = this.altars.find((q) => 'altar' + q.id === id); return a ? this.altarDeck(a) : null; }
  /** 同伴站到甲板上（render 前调，同 lingzhou.preRender） */
  preRender() {
    const D = this.deck; if (!D) return;
    const g = this.game, p = g.player; let i = 0;
    for (const a of g.npcs.followers()) { const off = (i++ % 2 ? 1 : -1) * (70 + 40 * Math.floor(i / 2)); const x = Math.max(D.x - D.half, Math.min(D.x + D.half, p.x + off)), u = (x - (D.x - D.half)) / (2 * D.half); a.st.x = x; a.st.y = D.y + DECK_FRONT - 4; a.st.lift = D.lift(u, Math.min(1, this.dv + 0.15)); a.d.x = a.st.x; a.d.y = a.st.y; }
    const pe = g.pets?.ent; if (pe) { pe.x = p.x + 60; pe.y = D.y + DECK_FRONT - 4; pe.z = D.lift(this.du, this.dv); }
  }
  /** 人在甲板上时立板抬多高（jueyu.waterTick 读） */
  deckLift(): number | null { const D = this.deck; return D ? D.lift(this.du, this.dv) : null; }

  // ------------------------------------------------------------ 交谈（game.interact 先问这里）
  interact(): boolean {
    const g = this.game, p = g.player, D = this.deck;
    if (!D) return false;
    if (D.id === 'ship') {
      const v = this.vendorNear(); if (!v) return false;
      if (v.i === 3) { g.openDialog(this.rumorNode()); return true; }
      g.openModal({ kind: 'stall', npc: 'ghost:' + v.i });
      audio.sfx('chime');
      return true;
    }
    const a = this.altars.find((q) => 'altar' + q.id === D.id);
    if (a && Math.abs(p.x - D.x) < 220) { g.openDialog(this.altarNode(a)); return true; }
    return false;
  }
  private vendorNear(): Vendor | null {
    const D = this.deck; if (!D || D.id !== 'ship') return null;
    let best: Vendor | null = null, bd = 140;
    for (const v of VENDORS) { const dx = Math.abs(this.du - v.u) * 2 * D.half; if (dx < bd && this.dv > 0.15) { bd = dx; best = v; } }
    return best;
  }
  // ------------------------------------------------------------ 鬼市：给 StallPanel 的接口
  /** StallPanel 问：这个 id 是不是鬼市摊主（'ghost:N'），是就给出摊主和那几样接口 */
  vendor(npc: string): { d: NpcData; S: GhostStall; pic: string | undefined } | null {
    if (!npc.startsWith('ghost:')) return null;
    const v = VENDORS[+npc.slice(6)]; if (!v) return null;
    return { d: this.vendorNpc(v), S: new GhostStall(this, v), pic: seaImg('sb_chuanling_' + (v.i % 2))?.src };
  }
  private vendorNpc(v: Vendor): NpcData {
    return { id: 'ghost:' + v.i, name: v.name, pers: 'greedy', favor: 0, realm: 4, stage: 1, faction: 'merchant', seed: 9300 + v.i, alive: true, wealth: 60000, bag: {}, home: '' } as unknown as NpcData;
  }
  /** 这一夜摊上的货（自己的序列；卖掉的记在 ws.flags.gm 里，同一夜读档也不会再长出来） */
  goodsOf(v: Vendor): { id: string; n: number; price: number }[] {
    const g = this.game, night = this.ship.key, r = mulberry32((H(v.i, night.length, 9501) * 1e9) ^ hashStr(night));
    const pick: [string, number, number][] =
      v.i === 0 ? [['lz_wupeng', 1, 1.0], ['lz_polang', 1, 0.55], ['hy_bishuizhu', 1, 0.3], ['hy_bishuidan', 3, 0.9], ['lz_xuangui', 1, 0.06], ['pill_huiqi', 8, 0.9]]
      : v.i === 1 ? [['hy_bishuidan', 4, 1], ['mat_sb_lingcao', 3, 0.8], ['mat_hy_haizhi', 1, 0.25], ['pill_liaoshang', 8, 0.9], ['pill_huiqi', 10, 1], ['mat_sb_jingxian', 1, 0.3]]
      : v.i === 2 ? [[SETS.xuangui.pieces[Math.floor(r() * 4)], 1, 0.8], [gearDropId((r() * 1e9) | 0, 4), 1, 0.7], [gearDropId((r() * 1e9) | 0, 5), 1, 0.35], ['mat_hy_chenmu', 4, 0.8], ['mat_hy_yuantie', 2, 0.5], ['mat_hy_gumo', 1, 0.3]]
      : [];
    const sold = ((g.ws.flags as Record<string, unknown>).gm ??= {}) as Record<string, number>;
    const out: { id: string; n: number; price: number }[] = [];
    for (const [id, n, ch] of pick) { if (r() >= ch) continue; const k = `${night}|${v.i}|${id}`, left = n - (sold[k] ?? 0); if (left <= 0) continue; out.push({ id, n: left, price: Math.round(itemDef(id).price * (1.25 + 0.5 * r())) }); }
    return out;
  }
  markSold(v: Vendor, id: string) { const sold = ((this.game.ws.flags as Record<string, unknown>).gm ??= {}) as Record<string, number>; const k = `${this.ship.key}|${v.i}|${id}`; sold[k] = (sold[k] ?? 0) + 1; }
  /** 说书鬼：打听深海——付灵石或一件海兽材料，标出最近一处没打过的遗迹 */
  private rumorNode(): DNode {
    const g = this.game, h = g.hero, cost = 800;
    const mats = ['mat_sb_guichi', 'mat_sb_chuxu', 'mat_sb_leiyi', 'mat_sb_monang'].filter((m) => C.bagCount(h, m) > 0);
    const tell = (): DNode => {
      const r = g.jueyu.deep.nearestRuin(g.player.x, g.player.y, 5);
      if (!r) return { speaker: '说书鬼', title: '鬼修 · 说书', text: '它歪着头想了半天：「这一片的海底……什么都没有。往深处走走吧。」', options: [{ label: '离开' }], mood: 'mystic' };
      ((g.ws.flags as Record<string, unknown>).hyRumor = { id: r.id, x: r.cx, y: r.cy, name: g.jueyu.deep.ruinName(r) });
      C.addItem(h, 'hy_haitu', 1);
      return { speaker: '说书鬼', title: '鬼修 · 说书', text: `它用指甲在船板上划了一道：「${g.jueyu.deep.ruinName(r)}……往那边去，沉到底。门口守着一尊古傀，打碎它，箱子自己就开了。」\n（罗盘上记下了方位；储物袋里多了一张海渊残图）`, options: [{ label: '多谢' }], mood: 'mystic' };
    };
    return {
      speaker: '说书鬼', title: '鬼修 · 说书', mood: 'mystic',
      text: '一个没有下巴的鬼影咧着嘴：「海底埋着古魔的东西，门口守着石傀，箱子里的宝贝够你修到元婴。一钱灵石一句话——或者拿海里的东西来换。」',
      options: [
        { label: `付 ${cost} 灵石，打听一处遗迹`, disabled: C.bagCount(h, 'mat_lingshi') < cost, act: () => { C.removeItem(h, 'mat_lingshi', cost); return tell(); } },
        { label: mats.length ? `用一份${itemDef(mats[0]).name}换` : '用海兽材料换（身上没有）', disabled: !mats.length, act: () => { C.removeItem(h, mats[0], 1); return tell(); } },
        { label: '离开' },
      ],
    };
  }
  // ------------------------------------------------------------ 祭坛：献祭与守坛战
  private altarNode(a: Altar): DNode {
    const g = this.game, h = g.hero, F = g.ws.flags as Record<string, unknown>, used = ((F.altar ??= {}) as Record<string, number>)[a.id] === a.cyc;
    const has = (ids: string[], n: number) => ids.reduce((s, id) => s + C.bagCount(h, id), 0) >= n;
    const take = (ids: string[], n: number) => { for (const id of ids) { while (n > 0 && C.bagCount(h, id) > 0) { C.removeItem(h, id, 1); n--; } } };
    const done = (txt: string): DNode => { (F.altar as Record<string, number>)[a.id] = a.cyc; this.fxq.push({ k: 'bless', x: g.player.x, y: g.player.y }); audio.sfx('chime'); g.updateUI(true); return { speaker: '古魔祭坛', text: txt, options: [{ label: '退开' }], mood: 'mystic' }; };
    const A = ['mat_sb_guichi', 'mat_sb_chuxu', 'mat_sb_leiyi', 'mat_sb_monang', 'mat_sb_hundeng', 'mat_sb_jiaolin'];
    const J = g.jueyu, S = g.seabeast;
    if (used) return { speaker: '古魔祭坛', text: '坛里的水已经暗了下去。这一次退潮，它只应你一回。', options: [{ label: '退开' }], mood: 'mystic' };
    return {
      speaker: '古魔祭坛', mood: 'mystic',
      text: '石坛上的古魔面孔半张着嘴，坛里积着一汪发光的海水。把海里的东西投进去，它会还你一点什么——或者叩一叩坛，看看下面守着的是什么。',
      options: [
        { label: '投两件海兽材料，求「避水」（三百息避水 +50%）', disabled: !has(A, 2), act: () => { take(A, 2); J.deep.altarT = 300; return done('坛水翻起一团青光裹住了你——三百息内入海渊，水压近不了身。'); } },
        { label: '投一件海兽材料，求「定风」（三百息风浪推不动你）', disabled: !has(A, 1), act: () => { take(A, 1); J.calmT = 300; return done('坛上的古魔面孔吐出一口冷气，四下里的风声一下子远了——三百息内风浪推不动你。'); } },
        { label: '投一个海魔墨囊或魂灯芯，求「辟兽」（两百四十息海兽不近身）', disabled: !has(['mat_sb_monang', 'mat_sb_hundeng'], 1), act: () => { take(['mat_sb_monang', 'mat_sb_hundeng'], 1); S.repelT = 240; return done('一股古魔的气息从坛里漫出去，水下的黑影纷纷掉头——两百四十息内海兽不敢近身。'); } },
        { label: '叩坛（引出守坛古魔影，打赢了坛下的东西归你）', tone: 'bad', act: () => { (F.altar as Record<string, number>)[a.id] = a.cyc; this.startFight(a); return null; } },
        { label: '退开' },
      ],
    };
  }
  private startFight(a: Altar) {
    const g = this.game, [x, y] = this.altarLocal(a), foes: Enemy[] = [];
    for (let q = 0; q < 3; q++) {
      const def = ENEMIES.sb_tan_ying, rs = lvRealm(def.lv![0]), ang = q / 3 * Math.PI * 2 + 0.4;
      const e = quiet((a.id ^ (q * 7919) ^ a.cyc) | 0, () => new Enemy(def, x + Math.cos(ang) * 420, y + Math.sin(ang) * 260, rs.realm, rs.stage, true));
      e.aggro = true; e.flyH = 60; g.combat.enemies.push(e); foes.push(e);
    }
    this.fight = { altar: a.id, foes, done: false };
    g.juice(0.05, 0.6); audio.sfx('boom');
    g.toast('坛水炸开，三道血红的古魔影子从坛里爬了出来！', 'warn');
  }
  private fightTick() {
    const F = this.fight; if (!F || F.done) return;
    const g = this.game;
    for (const e of F.foes) if (e.dead && !this.seen.has(e)) this.seen.add(e);
    if (F.foes.every((e) => e.dead || !g.combat.enemies.includes(e))) {
      F.done = true;
      const a = this.altars.find((q) => q.id === F.altar); if (!a || !F.foes.every((e) => e.dead)) return;
      const [x, y] = this.altarLocal(a), r = mulberry32(a.id ^ a.cyc), put = (id: string, n = 1) => g.combat.loot.push({ x: x + (r() - 0.5) * 220, y: y + 30 + (r() - 0.5) * 60, id, n, t: 0.5 });
      put('mat_lingshi', 2000 + Math.floor(r() * 3000)); put('mat_hy_gumo'); if (r() < 0.5) put(SETS.xuangui.pieces[Math.floor(r() * 4)]); if (r() < 0.4) put('hy_bishuidan', 2); if (r() < 0.15) put('hy_bishuizhu');
      this.fxq.push({ k: 'bless', x, y }); audio.sfx('chime');
      g.toast('最后一道古魔影散了，坛底裂开一道缝——里面压着前人献祭的东西。', 'good');
    }
  }
  // ------------------------------------------------------------ 界面
  private updHud() {
    const g = this.game, p = g.player, Hd = this.hud, t = g.time, J = g.jueyu;
    // 方向故意不准：远了在真方向左右晃四五十度，近了才准——给个大概，自己去找
    const fuzz = (dir: number, d: number, seed: number) => dir + (Math.sin(t * 0.13 + seed) * 0.6 + Math.sin(t * 0.37 + seed * 2) * 0.3) * sstep(3000, 16000, d);
    const S = this.ship;
    if (S.on && S.k > 0.05) { const d = Math.hypot(S.x - p.x, S.y - p.y); Hd.ghostDir = d < 30000 ? fuzz(Math.atan2(S.y - p.y, S.x - p.x), d, 1) : NaN; Hd.ghostTxt = d < 2500 ? '' : S.why === 'moon' ? '血月当空，海上飘来若有若无的鬼火……' : '风眼里隐约有一艘船的影子……'; }
    else { Hd.ghostDir = NaN; Hd.ghostTxt = ''; }
    let ba: Altar | null = null, bd = Infinity;
    for (const a of this.altars) { const T = this.tide(a), [x, y] = this.altarLocal(a), d = Math.hypot(x - p.x, y - p.y); if ((T.up > 0.05 || T.p > 0.92) && d < bd) { bd = d; ba = a; } }
    if (ba && bd < 26000) { const [x, y] = this.altarLocal(ba), T = this.tide(ba); Hd.altarDir = fuzz(Math.atan2(y - p.y, x - p.x), bd, 2); Hd.altarTxt = bd < 2200 ? '' : T.up > 0.05 ? '退潮了，远处有礁石露出了水面……' : '潮水在退，远处的海面泛着奇怪的光……'; }
    else { Hd.altarDir = NaN; Hd.altarTxt = ''; }
    const R = (g.ws.flags as Record<string, unknown>).hyRumor as { id: number; x: number; y: number; name: string } | undefined;
    if (R && !(((g.ws.flags as Record<string, unknown>).hyRuin as Record<string, number> | undefined)?.[R.id] !== undefined)) { const x = R.x + this.fdx, y = R.y + this.fdy, d = Math.hypot(x - p.x, y - p.y); Hd.rumorDir = fuzz(Math.atan2(y - p.y, x - p.x), d * 0.4, 3); Hd.rumorTxt = d < 1500 ? `${R.name}就在脚下的海底` : ''; }
    else { Hd.rumorDir = NaN; Hd.rumorTxt = ''; }
    // 甲板上的提示：摊主、祭坛、涨潮
    // 第五轮：提示里不再带「T：」——情境提示那颗胶囊自己在前面画当前键位（电脑），手机上那颗胶囊就是按钮
    const D = this.deck;
    Hd.prompt = ''; Hd.deckWarn = '';
    if (D?.id === 'ship') { const v = this.vendorNear(); if (v) Hd.prompt = v.i === 3 ? '向说书鬼打听深海' : `看看${v.name}的摊子`; if (S.warned) Hd.deckWarn = '鬼船正在散去——快离开甲板！'; }
    else if (D) { const a = this.altars.find((q) => 'altar' + q.id === D.id); if (a) { if (Math.abs(p.x - D.x) < 220) Hd.prompt = '向古魔祭坛献祭'; if (this.tide(a).warn) Hd.deckWarn = '潮水在涨——快离开礁盘！'; } }
    void J;
  }
  // ------------------------------------------------------------ 画面
  view(V: SeaView) {
    const g = this.game, t = g.time, p = g.player, under = g.jueyu.deep.k > 0.5;
    const S = this.ship;
    if (S.on && S.k > 0.01) { seaImg('sb_chuanling_0'); seaImg('sb_chuanling_1'); }   // 摊位窗口的摊主像（先加载上）
    if (S.on && S.k > 0.01 && !under && Math.hypot(S.x - p.x, S.y - p.y) < 6000) {
      V.sprites.push({ under: true, key: 'sb_ghostship', x: S.x, y: S.y, lift: -GS_H * 0.12 + Math.sin(t * 0.7) * 6, H: GS_H, face: -1, alpha: S.k * 0.88, flash: 0, sx: 1, sy: 1, rot: Math.sin(t * 0.5) * 0.012, glow: 0.95 + 0.25 * Math.sin(t * 1.7), glowCol: [0.4, 1, 0.75], tint: [0.85, 1, 0.95] });   // 夜里也要看得出船：自己泛一层鬼火的青光
      const D = this.shipDeck();
      if (D) for (const v of VENDORS) {
        const x = D.x - D.half + v.u * 2 * D.half;
        V.sprites.push({ key: `sb_chuanling_${Math.floor(t * 1.6 + v.i) % 2}`, x, y: D.y + DECK_FRONT + 6, lift: D.lift(v.u, 0.55) - 20 + Math.sin(t * 1.4 + v.i) * 6, H: 170, face: p.x > x ? 1 : -1, alpha: S.k * 0.9, flash: 0, sx: 1, sy: 1, rot: Math.sin(t + v.i) * 0.04, glow: 0.6, glowCol: v.tint, tint: v.tint });
      }
    }
    if (!under) for (const a of this.altars) {
      if (a.up < 0.01) continue;
      const [x, y] = this.altarLocal(a); if (Math.hypot(x - p.x, y - p.y) > 6000) continue;
      V.sprites.push({ under: true, key: 'hy_altar', x, y, lift: -ALT_H * 0.12 - (1 - a.up) * ALT_H * 0.55, H: ALT_H, face: 1, alpha: 1, flash: 0, sx: 1, sy: 1, rot: 0, glow: 0.35 + 0.2 * Math.sin(t * 1.3), glowCol: [0.4, 1, 0.8] });
    }
    // 守坛战的古魔影：shell 没设，走寻常立板；这里只给它们一层血红（seabeast.view 不管它们）
    void t;
  }
  drawGL(F: FxSys, dt: number) {
    const g = this.game, t = g.time, p = g.player, GHOST: RGB = [0.45, 1, 0.75], FOAM: RGB = [0.9, 0.97, 1];
    // 收官 B4 / 打磨：鬼船又大又暗，人站在甲板上几乎看不见——人身边一圈鬼火映出的光，头顶一盏引路的灯笼，三点磷火绕着人慢慢转
    if (this.deck?.id === 'ship') {
      const lift = this.deckLift() ?? 0, bob = Math.sin(t * 1.6) * 6;
      // 光只照亮脚下一圈、不压过人（原先叠得太亮，人反被光吞了）；灯笼挂在人身侧偏上
      F.ground(AT.Glow, p.x, p.y, 280, 0, [0.5, 0.95, 0.78], 0.16, 1, 0.5);
      F.ground(AT.Glow, p.x, p.y, 130, 0, [1, 0.9, 0.68], 0.1, 1, 0.5);
      F.sprite(AT.Glow, p.x + 70, p.y - lift - 190 + bob, 120, 120, 0, [1, 0.75, 0.42], 0.3, 1);
      F.sprite(AT.Core, p.x + 70, p.y - lift - 190 + bob, 22, 30, 0, [1, 0.9, 0.7], 0.85, 1);
      for (let i = 0; i < 3; i++) { const a = t * 0.9 + i * 2.094, x = p.x + Math.cos(a) * 110, y = p.y + Math.sin(a) * 50; F.sprite(AT.Glow, x, y - lift - 90 - 18 * Math.sin(t * 2 + i), 54, 54, 0, GHOST, 0.32, 1); F.sprite(AT.Core, x, y - lift - 90 - 18 * Math.sin(t * 2 + i), 12, 12, 0, [0.85, 1, 0.92], 0.8, 1); }
    }
    for (const e of this.fxq) {
      if (e.k === 'rise' || e.k === 'sink') { F.shockRing(e.x, e.y, 500, FOAM, 0.8, 0.5, 1, true); F.sparks(e.x, e.y - 20, FOAM, 30, 500, 0.9, 6, -Math.PI / 2, 2); }
      else if (e.k === 'bless') { F.flash(e.x, e.y - 60, 220, [0.5, 1, 0.85]); F.shockRing(e.x, e.y, 260, [0.5, 1, 0.85], 0.7, 0.5, 0.9, true); F.sparks(e.x, e.y - 40, [0.5, 1, 0.85], 30, 300, 1, 4, -Math.PI / 2, 1.6); }
      else if (e.k === 'fade') { for (let i = 0; i < 20; i++) F.emit({ x: e.x + (Math.random() - 0.5) * 1200, y: e.y - Math.random() * 500, vy: -30, life: 3, s0: 120, s1: 260, c: [0.7, 0.8, 0.8], a: 0.25, add: 0, cell: AT.Smoke }); }
    }
    this.fxq.length = 0;
    const S = this.ship;
    if (S.on && S.k > 0.05 && g.jueyu.deep.k < 0.5 && Math.hypot(S.x - p.x, S.y - p.y) < 5200) {
      const W = GS_H * 900 / 603;
      // 船灯：一盏盏幽绿的鬼火，一明一灭
      GS_LAMPS.forEach(([lx, ly], i) => { const x = S.x - (lx - 450) / 900 * W * -1 * -1 + 0, lift = (603 - ly) / 603 * GS_H - GS_H * 0.12, k = S.k * (0.7 + 0.3 * Math.sin(t * 3 + i * 1.7)); const xx = S.x + (lx - 450) / 900 * W; F.glow(xx, S.y - lift, 120 + 16 * Math.sin(t * 5 + i), GHOST, 0.75 * k); if (Math.random() < dt * 1.5) F.emit({ x: xx, y: S.y - lift, vy: -26, life: 1.6, s0: 16, s1: 4, c: GHOST, a: 0.7 * k, add: 1, cell: AT.Wisp }); void x; });
      // 船身四周贴着水面的冷雾、甲板上飘的磷火
      if (Math.random() < dt * 6) F.emit({ x: S.x + (Math.random() - 0.5) * W * 1.1, y: S.y + (Math.random() - 0.5) * 120, vx: (Math.random() - 0.5) * 30, vy: -8, life: 4, s0: 140, s1: 320, c: [0.62, 0.78, 0.74], a: 0.14 * S.k, add: 0, cell: AT.Smoke, groundMotion: true });
      if (Math.random() < dt * 8) F.emit({ x: S.x + (Math.random() - 0.5) * W * 0.8, y: S.y - GS_H * (0.25 + Math.random() * 0.5), vy: -40, life: 2, s0: 10, s1: 2, c: GHOST, a: 0.8 * S.k, add: 1, cell: AT.Glow });
      F.ground(AT.RingSoft, S.x, S.y + 10, W * 0.42, 0, GHOST, 0.05 * S.k, 1, 0.3);
      // 鬼市摊主手里的灯
      const D = this.shipDeck();
      if (D) for (const v of VENDORS) { const x = D.x - D.half + v.u * 2 * D.half; F.glow(x + 30, D.y - D.lift(v.u, 0.55) - 60, 34 + 5 * Math.sin(t * 4 + v.i), v.tint as RGB, 0.35 * S.k); }
    }
    for (const a of this.altars) {
      if (a.up < 0.02 || g.jueyu.deep.k > 0.5) continue;
      const [x, y] = this.altarLocal(a); if (Math.hypot(x - p.x, y - p.y) > 5000) continue;
      // 退下去的潮水：礁盘边上一圈白沫；坛里的水发光；涨潮前礁盘边一圈圈漫水
      F.ground(AT.RingSoft, x, y + 10, 430 + 20 * Math.sin(t * 1.2), 0, FOAM, 0.12 * a.up, 1, 0.42);
      F.glow(x, y - ALT_H * 0.42 * a.up, 120 + 15 * Math.sin(t * 2), [0.4, 1, 0.8], 0.4 * a.up);
      if (this.tide(a).warn) F.ground(AT.RingSoft, x, y + 10, 380 + 80 * ((t * 0.8) % 1), 0, [0.7, 0.9, 1], 0.5, 1, 0.42);
      if (Math.random() < dt * 3 * a.up) F.emit({ x: x + (Math.random() - 0.5) * 600, y: y + (Math.random() - 0.5) * 180, vy: -30, life: 1.5, s0: 10, s1: 2, c: [0.5, 1, 0.85], a: 0.7, add: 1, cell: AT.Glow });
    }
  }
  /** 纯 2D 回退：鬼船、祭坛 */
  draw2D(ctx: CanvasRenderingContext2D) {
    const S = this.ship;
    if (S.on && S.k > 0.02) { const im = seaImg('sb_ghostship'); if (im) { const w = GS_H * im.width / im.height; ctx.save(); ctx.globalAlpha = S.k * 0.85; ctx.drawImage(im, S.x - w / 2, S.y - GS_H * 0.88, w, GS_H); ctx.restore(); } }
    for (const a of this.altars) { if (a.up < 0.02) continue; const im = seaImg('hy_altar'); if (!im) continue; const [x, y] = this.altarLocal(a), w = ALT_H * im.width / im.height; ctx.save(); ctx.globalAlpha = a.up; ctx.drawImage(im, x - w / 2, y - ALT_H * 0.88 + (1 - a.up) * ALT_H * 0.5, w, ALT_H); ctx.restore(); }
  }
  /** 试玩 / 测试：在人旁边强行起一艘鬼船（血月以外的时候也行），t 秒后散 */
  forceShip(x: number, y: number, why: 'moon' | 'storm' = 'moon', life = 600) { const [cx, cy] = this.game.jueyu.toHome(x, y); this.ship = { on: true, k: 1, x, y, cx, cy, why, key: 'force' + Math.floor(this.game.time), warned: false }; this.forced = this.ship.key; this.forcedUntil = this.game.time + life; }
  forced = ''; forcedUntil = 0;
  /** 最近一座祭坛（试玩入口用） */
  nearestAltar(x: number, y: number, R = 5): Altar | null {
    const [cx, cy] = this.game.jueyu.toHome(x, y), ci = Math.floor(cx / ALT_CELL), cj = Math.floor(cy / ALT_CELL);
    let best: Altar | null = null, bd = Infinity;
    for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) { const a = this.altarIn(i, j); if (!a || !this.reachable(a.cx, a.cy)) continue; const d = Math.hypot(a.cx - cx, a.cy - cy); if (d < bd) { bd = d; best = a; } }
    return best;
  }
  /** 这一点（大陆坐标）在不在此刻这张图走得到、而且是海的地方（图外没有地块的地方地形会当成陆地） */
  private reachable(cx: number, cy: number): boolean { const g = this.game, f = mapFrame(ACTIVE_MAP), x = cx + f.dx, y = cy + f.dy, B = g.bounds; return x > B.x0 && x < B.x1 && y > B.y0 && y < B.y1 && !g.terrain.isLand(x, y); }
  altarPos(a: Altar): [number, number] { return this.altarLocal(a); }
  get debug() { return { ship: this.ship.on, shipK: this.ship.k, why: this.ship.why, deck: this.deck?.id ?? '', altars: this.altars.length, altarUp: this.altars.map((a) => a.up) }; }
}

function hashStr(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

/** 鬼市摊主：照 StallSys 的那几样接口（StallPanel 只调这些） */
export class GhostStall {
  constructor(private Q: SeaQiyu, private v: Vendor) {}
  private get g() { return this.Q.game; }
  info(d: NpcData): StallInfo { const v = this.v, t = this.g.time; return { d, name: `鬼市·${v.name}`, ware: v.ware, shout: v.shout[Math.floor(t / 8) % v.shout.length], urgent: false }; }
  goods(_d: NpcData): StallGood[] {
    const F = this.g.ws.flags as Record<string, unknown>, hag = ((F.gmHag ??= {}) as Record<string, 'ok' | 'fail'>);
    return this.Q.goodsOf(this.v).map((s) => { const key = s.id, hk = `${this.Q.ship.key}|${this.v.i}|${key}`, h = hag[hk]; return { key, id: s.id, n: s.n, price: h === 'ok' ? Math.round(s.price * 0.82) : s.price, ref: itemDef(s.id).price, hag: h, probed: true }; });
  }
  buy(_d: NpcData, gd: StallGood): string | null {
    const g = this.g, h = g.hero;
    if (!this.Q.ship.on || this.Q.ship.k < 0.3) return '摊主的身影已经淡得看不清了。';
    if (gd.hag === 'fail') return '鬼修冷笑一声：这件不卖你了。';
    if (C.bagCount(h, 'mat_lingshi') < gd.price) return '灵石不够。';
    C.removeItem(h, 'mat_lingshi', gd.price);
    if (itemDef(gd.id).type === 'gear') C.addItem(h, gd.id, 1); else C.addItem(h, gd.id, 1);
    this.Q.markSold(this.v, gd.id);
    g.updateUI(true);
    return null;
  }
  hagChance(_d: NpcData): number { return 0.3; }
  haggle(_d: NpcData, gd: StallGood): { ok: boolean; price: number; line: string } | null {
    const F = this.g.ws.flags as Record<string, unknown>, hag = ((F.gmHag ??= {}) as Record<string, 'ok' | 'fail'>), hk = `${this.Q.ship.key}|${this.v.i}|${gd.key}`;
    if (hag[hk]) return null;
    const ok = H(hashStr(hk), 1, 9601) < 0.3; hag[hk] = ok ? 'ok' : 'fail';
    return { ok, price: ok ? Math.round(gd.price * 0.82) : gd.price, line: ok ? '嘿……活人也有会说话的。依你。' : '还价？去海底跟古魔还吧。' };
  }
  probe(_d: NpcData, _gd: StallGood): { spottedFake: boolean; msg: string } { return { spottedFake: false, msg: '神识一扫：鬼市的货不掺假，只是贵——死人用不着骗你。' }; }
  /** 鬼修只收海里来的东西，出价是行情的一倍半（「以物易物」的那一半） */
  offer(_d: NpcData, b: C.BagItem): number { const it = itemDef(b.id); if (!/^mat_(sb|hy)_/.test(b.id) || b.worn) return 0; return Math.round(it.price * 1.5); }
  sellTo(_d: NpcData, b: C.BagItem): string | null {
    const g = this.g, h = g.hero, p = this.offer(_d, b);
    if (!p) return '鬼修摇摇头：我只收海里来的东西。';
    if (!h.bag.includes(b)) return '袋里没有这件了。';
    C.removeItem(h, b.id, 1); C.addItem(h, 'mat_lingshi', p); g.updateUI(true);
    return null;
  }
}
