// 撼山客 · 岳千钧 招式第三批：虚空三招（一拳破界、一脚还界、借星）+ 终结技两招（无极一击、千钧坠）。
// r7-fx3d 重做（用户看了展示视频：「火焰效果怎么这么平面」「无极一击不是发波」「千钧坠不够震撼」）：
//   · 无极一击：蓄力（沉身、脚下开裂、碎石浮起、空气扭曲、天地变黑白只留两人）→ 踩地冲刺（脚下炸坑 + 音障锥 + 激波环 + 模糊残影 + 速度线，
//     瞬间到敌人面前）→ 一拳（终结技全屏演出：白闪、黑白闪、拳头定格特写、集中线、「無極」大字；空间扭曲冲击波、星闪；被打的人轰飞很远）→
//     从命中点往前犁出一道扇形长沟（wreck.fan：越往前越宽，沿途树倒石裂、碎石尘浪按 3000/秒 推过去）。拳路上是海：同一拳把海沿扇形劈开（原「分海」并进来）。
//   · 一拳破界 / 一脚还界：同样蓄力 → 踩地冲刺 → 一拳往上打出（「破」）/ 借星折返后一脚往下踢（「還」），命中带空间扭曲冲击波；
//     被打上天、坠下来的火尾是立体的（hd2d/hsfx3d.ts 的 fire），落地砸坑用三维碎石、尘浪、焦痕。
//   · 千钧坠：蓄力 → 起跳（脚下炸坑、往上的音障锥）→ 高空顿住（天色压暗、背后一圈光、天上一道光柱打下来标出落点）→
//     下坠（空气被压缩成燃烧的锥）→ 落地（「墜」+ 踩落定格特写；地面整片塌陷成深坑、碎石成片飞起、一圈立体尘墙往外推、地浪、扭曲冲击波、焦痕、树放射状倒）。
//   立体特效都走 world/fx3d.ts（招式不碰 three），全屏演出走 impactfx.finisher。
// 设计定稿：docs/撼山客与破坏系统-设计.md 第四节；画面在 gl/hsmoves3gl.ts。
//
// 招牌是「一拳打到虚空，再一脚打回世界」（破界 → 还界），全程不切画面：
//   · 被打的是你：拳一到你就被打上天——先是一小段腾起，到高空的顶就走「飞出天穹」那条现成的无缝通道（xukong 的 climb → void），
//     只是升降由这一拳接管（xukong.force：一直往上、快几倍）。还在界内（云层以下）时按脱困就停在高空；
//     穿过界壁荡开符文涟漪、出了界，他跟着破界追出来（虚空斗法，斗法场里他借陨石折返加速——借星），一脚把你踢回下界——
//     走 voidfall 的「被打落」那一路（流星坠向落点、界内接回、砸出大坑；途中照样能脱困），他随后落回你身边。
//   · 被打的是别人（妖王、木人桩、你的对手）：在界内演——它化作一道冲天的流星，一根光柱直贯天穹，天上荡开一圈涟漪；
//     他一蹲一纵追上天去；片刻后那人带着火尾从天上砸回落点（大坑），他随后落下。镜头不动，你一直看得见、一直能操作。
// 你学会的一拳破界（化神）：把对手打进虚空，按追击键冲天追上去（同一条通道），在虚空里照常把它往下砸（E3 的坠界）；不追，它过几息自己摔回来。
//
// 规矩：伤害一律走 combat.hitEnemy / hitPlayer / npcHit（MoveCtx.hit、近战的撞击）；被模组接管的单位（shell）不能被打进虚空；
// 这一批的路径上不取 Math.random（落点、碎石、陨石的样子都按 hash32）；不新增默认按键（脱困 / 追击用现成的那个键）。
import type { Game } from './game';
import { realmTakeK, type Enemy } from './combat';
import type { Hanshan } from './hanshan';
import { registerMove, type SpecialMove, type MoveCtx } from './brawlmoves';
import { startMove } from './brawlmoverun';
import { hash32 } from './brawlrng';
import { ALT } from './alt';
import { VOID_SCALE, pointToVoid } from '../data/zhujie';
import { ACTIVE_MAP } from '../data/world';
import { bindOf, keyLabel } from '../core/keymap';
import { IS_TOUCH } from '../core/touch';
import type { Action } from '../gfx/character';
import { audio } from './audio';
import type { WreckSplit } from './wreck';
import { fx3dOf, type RGB3 } from './fx3d';

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (k: number) => { const t = clamp(k, 0, 1); return t * t * (3 - 2 * t); };
/** 按整数取 0‥1 的稳定数（这一批的「随机」都从这里来） */
const hu = (...n: number[]) => hash32(...n) / 4294967296;

// ------------------------------------------------------------------ 可调的数
export const HS3 = {
  /** 大招（三个终结技和一拳破界）：一场里（这么多息内）最多几次、两次之间至少隔多久 */
  bigMax: 2, bigWin: 120, bigGap: 25,
  pojie: {
    /** 前摇（蹲身蓄劲，脚下亮圈）、出拳够得着多远、伤害（占对手气血）、冷却 */
    wind: 0.8, reach: 280, frac: 0.12, cd: 45,
    /** 被打上天：腾起的速度（到高空的顶）、通道里往上快几倍、出了界壁再升多少才停（界壁高度的倍数） */
    liftV: 2600, riseK: 3.6, over: 1.12,
    /** 被打上天的别人：初速、加速度、飞多高算出了天穹、他在天上待多久再砸回来 */
    v0: 2600, acc: 5200, top: 4200, wait: 0.9, waitAlone: 1.6,
    /** 砸回来的高度和速度；落点离出拳处多远 */
    dropZ: 2600, dropVz: -3400, landD: 900,
    /** 你学会的一拳破界：被打上天的人在虚空里等你多久（不追就自己摔回来） */
    chase: 8,
  },
  huanjie: { frac: 0.1, kickShift: 1200 },
  jiexing: { rocks: 3, appear: 0.55, legs: [0.24, 0.18, 0.14], frac: 0.08 },
  /** 无极一击：蓄力多久、几时锁定方向、冲刺用时（最远冲多远）、扇形沟（长、起点半宽、末端半宽）、伤害、冷却、远山缺口 */
  /** 无极一击（照参考视频「烈火强拳」99.8–101.5）：旋身甩火 spin 秒、之后弓步举拳蓄力到 wind（拳上的火越烧越亮），lock 定死方向；冲刺用时、最远冲多远 */
  wuji: { spin: 0.17, wind: 0.85, lock: 0.6, dash: 0.13, dashMax: 1300, len: 2600, w0: 150, w1: 820, frac: 0.32, cd: 60, notchT: 6, notchBack: 1.5, fly: 4200 },
  /** 千钧坠：蹲、起跳、高空顿住（光柱在顿住开头打下来）、下坠；最高、圈半径、力度、伤害、冷却、落点几成时定死；坑（半径、深度、留多久） */
  qianjun: { crouch: 0.32, rise: 0.5, hang: 0.38, dive: 0.18, top: 1000, r: 720, power: 6, frac: 0.22, cd: 40, lockAt: 0.62, dentR: 560, dentD: 200, dentHold: 26 },
  /** 拳路上是海（无极一击劈开海面）：至少几成是深水才劈、沟宽 */
  sea: { wet: 0.6, w: 420, dur: 2.8 },
  /** 一拳破界的冲刺：最远冲多远、用时 */
  pojieDash: { max: 760, dur: 0.11 },
} as const;

/** 这一批的招（技能栏 id 是 bxm_ + id；HS_MOVES 里玩家学的用的是同一个 id） */
export const HS3_IDS = ['pojie', 'huanjie', 'jiexing', 'wuji', 'qianjunzhui'] as const;   // r7-fx3d：分海并进无极一击（拳路上是海时同一拳劈开），不再单列
export type Hs3Id = typeof HS3_IDS[number];

// ------------------------------------------------------------------ 画面要的状态（gl/hsmoves3gl.ts 每帧读）
export interface Hs3Warn { k: 'ring' | 'line' | 'foam' | 'column' | 'fan'; x: number; y: number; x2: number; y2: number; r: number; t: number; dur: number; fade: number; r2?: number; blue?: boolean }
export interface Hs3Pillar { x: number; y: number; t: number; dur: number; w: number; col: string }
export interface Hs3Riser { e: Enemy | 'p'; x: number; y: number; z: number; t: number; fire: number; down: boolean }
export interface Hs3Rock { x: number; y: number; z: number; r: number; seed: number; t: number; broken: number }
export interface Hs3Streak { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; t: number; dur: number; col: string }
export interface Hs3Vis {
  /** 天地变黑白（0‥1），只有这几个人留着颜色；dim 天色压暗（千钧坠高空顿住那一下，r7-fx3d） */
  mono: number; keep: (Enemy | 'p')[]; dim: number;
  /** IMPACT 黑白闪：命中那一两帧（秒） */
  flash: number;
  /** 拳上蓄的劲：在谁身上（null = 你）、多满、什么颜色、是不是在吸墨（无极一击） */
  charge: { e: Enemy | null; k: number; col: string; ink: boolean } | null;
  warns: Hs3Warn[]; pillars: Hs3Pillar[]; risers: Hs3Riser[]; rocks: Hs3Rock[]; streaks: Hs3Streak[];
  /** 远山缺一块（地形往下挖）：位置、半径、深度、此刻几成 */
  notch: { x: number; y: number; r: number; depth: number; k: number; t: number } | null;
  /** 定格特写：哪张、从什么时刻开始（真实时间，毫秒） */
  cutin: { img: 'fist' | 'eyes' | 'stomp'; at: number } | null;
}

/** 破界 → 还界这一趟 */
interface Trip {
  by: 'hs' | 'p';
  tgt: Enemy | 'p';
  chain: boolean;
  ph: 'lift' | 'rise' | 'engage' | 'kick' | 'fall' | 'up' | 'gone' | 'chase' | 'down' | 'hsdown' | 'done';
  t: number;
  x0: number; y0: number; dirX: number; dirY: number;
  z: number; lx: number; ly: number;
  /** 他在界内原来站的地方（还界之后照这里接回）；他跳上天的高度 */
  hx: number; hy: number; hz: number;
  kicks: number; teched: boolean; atk0: number; seed: number;
  /** 你砸回界内落了地（r7-fx3d：落地的立体特效只放一次） */
  crashed?: boolean;
  /** 你学会的破界：你按了追击、冲天追上去 */
  chasing: boolean;
}

/** 一局里这一批的状态（挂在 Game 上） */
export class HsBatch3 {
  readonly vis: Hs3Vis = { mono: 0, keep: [], dim: 0, flash: 0, charge: null, warns: [], pillars: [], risers: [], rocks: [], streaks: [], notch: null, cutin: null };
  trip: Trip | null = null;
  /** 大招用过的时刻（游戏时间） */
  big: number[] = [];
  /** 试玩入口、perform 强行出招时不看频率（只看场合） */
  forcing = false;
  /** 测试用：这一批发生过什么 */
  log: string[] = [];
  /** 无极一击的取景：出拳后几息里框着他、对手和犁开的扇形沟（海上：劈开的那道海沟合拢前一直框着）；pts 交给 brawl.stagePts */
  wujiCam: { s: WreckSplit | null; tgt: Enemy | 'p'; pts: [number, number, number][]; t: number } | null = null;
  /** 无极一击的远景：缺口还剩多久 */
  private monoT = 0; private monoTo = 0;
  constructor(readonly g: Game) {}
  get H(): Hanshan { return this.g.hanshan; }
  get ent(): Enemy | null { return this.H?.ent ?? null; }

  // ---------------------------------------------------------------- 频率
  /** 大招的名额还有没有（AI 选招时问；强行出招不问） */
  bigOk(): boolean {
    if (this.forcing) return true;
    const t = this.g.time; this.big = this.big.filter((a) => t - a < HS3.bigWin);
    return this.big.length < HS3.bigMax && (!this.big.length || t - this.big[this.big.length - 1] >= HS3.bigGap);
  }
  useBig() { this.big.push(this.g.time); }

  // ---------------------------------------------------------------- 每帧（世界在跑时，由 hanshan.tick 的钩子调）
  /** 返回 true = 他正被这一批的招接管着（hanshan.ts 这一帧不驱动他：不收起、不走平时 / 打架的那套） */
  private wsRef: unknown = null;
  tick(dt: number): boolean {
    if (this.g.ws !== this.wsRef) { if (this.wsRef) this.reset(); this.wsRef = this.g.ws; }   // 读档、新开局
    this.visTick(dt);
    fx3dOf(this.g).tick(dt);
    this.wujiFrame(dt);
    const T = this.trip;
    if (T) { try { this.tripTick(T, dt); } catch (err) { this.dropTrip(); if ((globalThis as { __TAIXU_DEV?: boolean }).__TAIXU_DEV) console.warn(err); } }
    this.fireTick();
    const e = this.ent;
    if (!e) return false;
    if (this.trip && this.trip.by === 'hs') return true;
    const b = this.g.combat.brawl.peek(e);
    return !!b?.move && HS3_IDS.includes(b.move.def.id as Hs3Id);
  }
  /** 无极一击之后：沟（海上是劈开的海沟，合拢前）一直框着 */
  private wujiFrame(dt: number) {
    const F = this.wujiCam; if (!F) return;
    const B = this.g.combat.brawl, e = this.ent;
    F.t -= dt;
    const live = !!e && !e.dead && (F.s ? this.g.combat.wreck.splits.includes(F.s) : F.t > 0);
    if (!live) { this.wujiCam = null; B.stagePts = []; return; }
    B.stageKeep(e!, F.tgt); B.stagePts = F.pts;
  }
  /**
   * r7-fx3d：立体的火尾——被打上天 / 坠下来的人（risers）、带火尾坠落的流星（近战的 meteor，你被一脚踢回下界时也是），每帧报给 fx3d。
   * 平面的那份火（gl/brawlgl.ts）看到这里报了就不画
   */
  private fireTick() {
    const g = this.g, F = fx3dOf(g), B = g.combat.brawl, p = g.player, xk = g.xukong;
    for (const r of this.vis.risers) { if (r.fire <= 0.01) continue; F.fire(r.e === 'p' ? 'rise-p' : 'rise-' + r.e.id, r.x, r.y, r.z, 0, 0, r.down ? -3400 : 3400, r.fire * 1.25); }
    if (B.pb.air && B.pb.meteor) F.fire('met-p', p.x, p.y, B.pb.z, B.pb.vx, B.pb.vy, Math.min(-1500, B.pb.vz), 1.15);
    else if (xk.fall.falling && !xk.inVoid) F.fire('met-p', p.x, p.y, Math.max(0, p.st.lift), 0, 0, -3400, 1.15);
    for (const e of g.combat.units) { const b = B.peek(e); if (b?.air && b.meteor && !e.dead) F.fire('met-' + e.id, e.x, e.y, b.z, b.vx, b.vy, Math.min(-1500, b.vz), 1.15); }
  }
  /** 带火尾砸地：四层爆炸、碎石、尘墙、焦痕、坑陷下去、地浪（流星落地、你被一脚还界砸回来） */
  crashFx(x: number, y: number, k = 1) {
    const F = fx3dOf(this.g);
    F.blast(x, y, 1.6 * k, 'fire', { z: 10, r: 260 * k });
    F.debris(x, y, { n: Math.round(34 * k), r: 200 * k, power: 1.3 * k, up: 1.15, size: 0.7 });   // r9：1.3 → 0.7（推近后飞过镜头前的是一块块半屏大的石板）
    F.dust(x, y, { r: 820 * k, power: 2 * k });
    F.scorch(x, y, 300 * k, { dur: 7 });
    F.dent(x, y, 300 * k, 110 * k, 18);
    F.ripple(x, y, { amp: 16 * k, reach: 2000 * k });
    F.warp(x, y, 60, { r: 900 * k, power: 1.6 * k, dur: 0.6 });
    F.ring(x, y, 8, 0, 0, 1, { r: 1100 * k, power: 1.5 * k, dur: 0.5 });
    this.log.push('crash-fx');
  }
  /** 冲天 / 落点的光柱：平面的记一笔（测试看），画面是立体的圆柱（fx3d.column） */
  pillar(x: number, y: number, dur: number, w: number, col: string) {
    this.vis.pillars.push({ x, y, t: 0, dur, w, col });
    const c = col.split(',').map((v) => +v / 255) as [number, number, number];
    fx3dOf(this.g).column(x, y, { h: 4200, r: 120 * w, dur, col: [c[0] * 1.3, c[1] * 1.3, c[2] * 1.3] });
  }
  /** 画面状态的计时（世界停住时也走：xukong.force 的 tick 里也调） */
  visTick(dt: number) {
    const V = this.vis;
    V.flash = Math.max(0, V.flash - dt);
    V.dim = Math.max(0, V.dim - dt * 3);
    if (this.monoT > 0) { this.monoT -= dt; V.mono += (this.monoTo - V.mono) * Math.min(1, dt * 3); }
    else { V.mono = Math.max(0, V.mono - dt * 2.2); if (V.mono <= 0 && V.dim <= 0) V.keep = []; }
    for (const w of V.warns) w.t += dt;
    V.warns = V.warns.filter((w) => w.t < w.dur + w.fade);
    for (const p of V.pillars) p.t += dt;
    V.pillars = V.pillars.filter((p) => p.t < p.dur);
    for (const s of V.streaks) s.t += dt;
    V.streaks = V.streaks.filter((s) => s.t < s.dur);
    for (const r of V.rocks) { r.t += dt; if (r.broken > 0) r.broken += dt; }
    V.rocks = V.rocks.filter((r) => r.broken < 0.9 && r.t < 8);
    for (const r of V.risers) r.t += dt;
    const N = V.notch;
    if (N) { N.t += dt; const W = HS3.wuji; N.k = N.t < 0.25 ? smooth(N.t / 0.25) : N.t < W.notchT ? 1 : 1 - smooth((N.t - W.notchT) / W.notchBack); if (N.t > W.notchT + W.notchBack) V.notch = null; }
  }
  /** 天地变黑白：往 to 走，持续 T 秒（之后自己褪回去） */
  monoTo2(to: number, T: number, keep: (Enemy | 'p')[]) { this.monoTo = to; this.monoT = Math.max(this.monoT, T); this.vis.keep = keep; }
  /** IMPACT 黑白闪：五帧（频率上限在 impactfx） */
  impactFlash() { this.g.combat.brawl.impact.inkFlash(); }   // 黑白闪：第一批的共用效果（频率上限在 impactfx）
  /** r7-fx3d：终结技最重那一击的全屏演出（白闪 → 黑白闪 →（定格特写）→ 书法大字砸屏；集中线、整屏压暗只留 keep 的人亮着） */
  finisher(word: string, keep: (Enemy | 'p')[]) { const ok = this.g.combat.brawl.impact.finisher(word, { keep, ink: 3, wordDelay: 0.32 });   // r8-p2：黑白闪短一些、大字等火球炸开再砸
  this.log.push('fin-' + word); if (ok) audio.sfx('fx_finisher'); return ok; }   // 终结技再叠一声低频轰鸣
  cutin(img: 'fist' | 'eyes' | 'stomp') { this.g.combat.brawl.impact.cutIn(img); this.log.push('cutin-' + img); }   // 定格特写：第一批的共用全屏切入（ui/CutIn.tsx）

  // ---------------------------------------------------------------- 工具
  /** 他这一下打多重（照 hanshan.pace 的算法：按对手的气血取一个比例；你在切磋里时 hitPlayer 自己保底不致死） */
  rawFor(user: Enemy, tg: Enemy | 'p', frac: number): number {
    const g = this.g;
    if (tg === 'p') { const ps = g.combat.pStats; return frac * ps.hp / realmTakeK(user.realm - g.hero.realm, g.hero.realm) + ps.def * 0.8; }
    return frac * tg.maxHp / (realmTakeK(clamp(user.realm - tg.realm, -3, 3), tg.realm) * 0.55) + tg.dfn * 0.8;
  }
  /** 出招者打一下：他按对手气血的比例，你按近战攻力的倍数（MoveCtx.hit：走 hitEnemy / hitPlayer / npcHit） */
  strike(c: MoveCtx, who: Enemy | 'p', frac: number, playerK: number, kind: string): boolean {
    if (!c.user) return c.hit(who, playerK, kind);
    const raw = this.rawFor(c.user, who, frac);
    return c.hit(who, raw / Math.max(1e-6, c.user.atk), kind);
  }
  /** 这一点他（或你）能不能落：陆地、走得通、不在城镇宗门里 */
  landOk(x: number, y: number): boolean {
    const g = this.g, T = g.terrain;
    if (!T.isLand(x, y) || T.walkFactor(x, y) <= 0 || g.combat.safeAt(x, y)) return false;
    if (T.inLocZone(x, y, 600)) return false;
    return true;
  }
  /** 落点：从 (x, y) 沿方向找一处合法的（陆地野外；起点就在水上时水面也行——那是砸海） */
  pickLanding(x: number, y: number, ux: number, uy: number, D: number): { x: number; y: number } {
    const wet = this.g.combat.brawl.deepWater(x, y);
    for (const k of [1, 0.7, 0.45, 0.2, 0]) {
      for (const a of [0, 0.5, -0.5, 1, -1]) {
        const c = Math.cos(a), s = Math.sin(a), vx = ux * c - uy * s, vy = ux * s + uy * c;
        const px = x + vx * D * k, py = y + vy * D * k;
        if (this.landOk(px, py) || (wet && this.g.combat.brawl.deepWater(px, py) && !this.g.terrain.inLocZone(px, py, 600))) return { x: px, y: py };
      }
    }
    return { x, y };
  }
  /** 主角在半空（没御剑）：借近战的「悬在半空」那一份（aloft）定高度 */
  setAloft(z: number) {
    const B = this.g.combat.brawl as unknown as { aloft: { z: number; vz: number; hold: number } | null; playerLift: number };
    if (z <= 0) { B.aloft = null; B.playerLift = 0; return; }
    if (!B.aloft) B.aloft = { z, vz: 0, hold: 9 };
    B.aloft.z = z; B.aloft.vz = 0; B.aloft.hold = 9; B.playerLift = z;
  }
  private pAct(a: Action, dur = 0.5) { (this.g.combat.brawl as unknown as { playAct(a: Action, d: number): void }).playAct(a, dur); }
  private eAct(e: Enemy, a: Action) { if (e.cs && e.cs.action !== a) e.cs.restart(a); }
  /** 他身上的 cs 跟着走（平时 shell 时寻常 AI 不推它的动画） */
  private syncCs(e: Enemy, dt: number) {
    if (!e.cs) return;
    e.cs.x = e.x; e.cs.y = e.y; e.cs.lift = e.flyH + e.lift;
    if ((e as { shell?: boolean }).shell) e.cs.update(dt);
  }
  say(e: Enemy | null, s: string, color = '#ffe0a0') {
    const g = this.g, x = e ? e.x : g.player.x, y = e ? e.y : g.player.y, z = e ? e.z : g.player.z;
    g.combat.texts.push({ anchor: { x, y, offsetY: -z }, x, y: y - 200, s, color, t: 0, vy: -16, big: true } as never);
  }
  fx(ev: Record<string, unknown>) { this.g.combat.fxq.push(ev as never); }

  // ================================================================ 破界 → 还界
  /** 一拳把 tg 打上天（by：他还是你）。chain：他追上去一脚踢回来 */
  launchUp(by: 'hs' | 'p', user: Enemy | null, tg: Enemy | 'p', chain: boolean, dirX: number, dirY: number): boolean {
    const g = this.g, p = g.player, B = g.combat.brawl;
    if (this.trip) return false;
    const x0 = tg === 'p' ? p.x : tg.x, y0 = tg === 'p' ? p.y : tg.y;
    const H = this.ent;
    const T: Trip = { by, tgt: tg, chain, ph: tg === 'p' ? 'lift' : 'up', t: 0, x0, y0, dirX, dirY, z: tg === 'p' ? Math.max(p.z, B.aloftZ) : tg.z, lx: x0, ly: y0,
      hx: H?.x ?? x0, hy: H?.y ?? y0, hz: 0, kicks: 0, teched: false, atk0: H?.atk ?? 0, seed: hash32(Math.round(x0), Math.round(y0), Math.floor(g.time * 10)), chasing: false };
    this.trip = T;
    this.pillar(x0, y0, 1.5, 1, by === 'hs' ? '255,196,110' : '170,220,255');
    this.vis.risers.push({ e: tg, x: x0, y: y0, z: T.z, t: 0, fire: 1, down: false });
    this.fx({ k: 'hs3up', x: x0, y: y0, power: 3, color: '255,210,140' });
    audio.sfx('boom', x0, y0); audio.sfx('whoosh', x0, y0);
    if (tg === 'p') {
      const b = B.pb;
      b.air = false; b.vx = b.vy = b.vz = 0; b.z = 0;   // 不走近战的击飞：高度由这一趟接管
      g.stand(); g.destination = null;
      if (!p.flying) this.setAloft(Math.max(1, T.z));
      if (H) { (H as { shell?: boolean }).shell = false; }
      this.log.push('launch-p');
    } else {
      B.clear(tg);
      tg.windup = 0; if (tg.cast) g.combat.foe.interrupt(tg);
      tg.kx = tg.ky = 0;
      const bb = B.body(tg); bb.freezeT = 0.05; B.track(tg);
      this.log.push('launch-e');
      if (by === 'p') {
        const key = IS_TOUCH ? '「追」' : keyLabel(bindOf('dodge'));
        g.toast(`${tg.name}被你一拳打穿云层、飞出了天穹！按 ${key} 冲天追上去，在虚空里把它踢回来——不追，它过几息自己摔回来。`, 'good');
      }
    }
    return true;
  }
  /** 收掉这一趟（异常、读档、身死） */
  dropTrip() {
    const T = this.trip; if (!T) return;
    this.trip = null;
    if (T.tgt !== 'p' && !this.wujiCam && this.g.combat?.brawl) this.g.combat.brawl.stagePts = [];
    const g = this.g, xk = g.xukong;
    if (xk.force) xk.force = null;
    if (T.tgt !== 'p') { T.tgt.hideT = 0; if (!g.combat.enemies.includes(T.tgt) && !T.tgt.dead && !xk.fight.on) g.combat.enemies.push(T.tgt); }
    const H = this.ent;
    if (H) this.restoreHs(H);
    this.vis.risers = [];
  }
  /** 他回到平时的那一套（shell、仇恨、攻力） */
  private restoreHs(H: Enemy) {
    const hs = this.H;
    (H as { shell?: boolean }).shell = hs.mode === 'calm';
    H.hideT = 0; H.hunt = hs.mode === 'angry';
    if (hs.mode !== 'calm') { H.aggro = true; H.tgP = true; }
    if (this.trip?.atk0) H.atk = this.trip.atk0;
  }

  /** 这一趟每帧（世界在跑的时候） */
  private tripTick(T: Trip, dt: number) {
    const g = this.g, B = g.combat.brawl, xk = g.xukong, V = xk.fall, F = xk.fight, p = g.player, H = this.ent;
    T.t += dt;
    if (g.hero.dead) { this.dropTrip(); return; }
    // r7-polish：这一趟（破界冲天、还界砸回）镜头一直框着（界内那一段；虚空里归虚空的镜头）。
    // r8-p2：被打的是别人时只框他和地上那一点（光柱脚下 / 落点）——原来连冲上四千高的人一起框，镜头仰到天上、远景雾整屏发白一秒多
    if (H && !H.dead) {
      if (T.tgt === 'p') B.stageKeep(H, T.tgt);
      else { B.stageKeep(H, H); B.stagePts = T.ph === 'down' || T.ph === 'hsdown' ? [[T.lx, T.ly, 0]] : [[T.x0, T.y0, 0]]; }
    }
    // —— 被打的是你
    if (T.tgt === 'p') {
      if (T.ph === 'lift') {
        // 腾起的那一小段（到高空的顶）：然后交给飞出天穹的通道
        const R = this.vis.risers.find((r) => r.e === 'p');
        T.z += HS3.pojie.liftV * dt;
        this.pAct('tumble', 0.3);
        if (p.flying) { p.z = p.zTarget = Math.min(ALT.max, T.z); } else this.setAloft(Math.min(ALT.max, T.z));
        if (R) { R.x = p.x; R.y = p.y; R.z = T.z; }
        if (T.z >= ALT.max - 1) this.toCorridor(T);
        return;
      }
      if (T.ph === 'rise') {
        // 通道里那一段（界内）：xukong.force 推着往上；这里只管动作和拖尾
        if (xk.phase === 'climb') { this.pAct('tumble', 0.3); const R = this.vis.risers.find((r) => r.e === 'p'); if (R) { R.x = p.x; R.y = p.y; R.z = p.z; } }
        if (xk.phase === 'none') { this.finishTrip(T, 'abort'); }   // 被别的东西（读档、身死）打断了
        return;
      }
      if (T.ph === 'engage') {
        // 斗法场里：他从下面（画面下方）冲上来，镜头拉到位就出脚
        if (!H || !F.on) { this.finishTrip(T, 'abort'); return; }
        const dx = p.x - H.x, dy = p.y - H.y, d = Math.hypot(dx, dy) || 1;
        if (d > 320) {
          const sp = Math.min(d - 300, (1500 + 2600 * smooth(F.k)) * dt), ox = H.x, oy = H.y;
          H.x += dx / d * sp; H.y += dy / d * sp; H.hx = H.x; H.hy = H.y; H.flyH = p.z;
          if (H.cs) { H.cs.faceToward(dx, dy, false); }
          this.eAct(H, 'rush'); this.syncCs(H, dt);
          if (sp > 30) this.vis.streaks.push({ x0: ox, y0: oy, z0: H.z + 60, x1: H.x, y1: H.y, z1: H.z + 60, t: 0, dur: 0.3, col: '255,214,150' });   // IMPACT: 超高速追击线
        }
        if (F.handed && T.t > 0.4) {
          T.ph = 'kick'; T.t = 0;
          const mv = MOVES_HS3.huanjie;
          this.forcing = true;
          let ok = false; try { ok = startMove(B, mv, H, 'p'); } finally { this.forcing = false; }
          if (!ok) this.finishTrip(T, 'abort');
        }
        return;
      }
      if (T.ph === 'kick') {
        // 还界那一脚（huanjie 招式在推进）；踢出去以后 voidfall 接手
        if (V.mode === 'dropped' && V.drop?.e === H) { T.ph = 'fall'; T.t = 0; this.log.push('kicked'); }
        else if (T.t > 6 || !F.on) this.finishTrip(T, 'abort');
        return;
      }
      if (T.ph === 'fall') {
        // 被踢回下界：voidfall 推着坠落；途中脱困了——他接着在虚空里追你，再踢一脚（最多两脚）
        if (V.mode === 'none' && H && F.on && F.foes.some((f) => f.e === H)) {
          if (T.kicks >= 2) { this.hsLeaveVoid(T); return; }
          T.ph = 'engage'; T.t = 0; this.log.push('teched-void');
          return;
        }
        // r7-fx3d：你砸进界内落地的那一下：三维碎石、尘墙、焦痕、坑
        if (!T.crashed && V.mode === 'none' && xk.phase === 'none' && !B.pb.air) { T.crashed = true; this.crashFx(p.x, p.y, 1.2); }
        // 他已经落回界内你身边（placeFollower），落了地就收场
        if (V.mode === 'none' && xk.phase === 'none' && H && g.combat.enemies.includes(H) && !B.isAir(H)) this.finishTrip(T, 'landed');
        else if (V.mode === 'none' && xk.phase === 'none' && T.t > 12) this.finishTrip(T, 'landed');
        return;
      }
      return;
    }
    // —— 被打的是别人：界内演
    const e = T.tgt;
    if (e.dead) { this.finishTrip(T, 'dead'); return; }
    const R = this.vis.risers.find((r) => r.e === e);
    if (T.ph === 'chase') { this.chaseTick(T); return; }
    if (T.ph === 'rise') { e.hideT = 99; if (g.xukong.phase === 'none' && T.t > 1) this.finishTrip(T, 'abort'); return; }   // 你正冲天追它（通道里）
    if (T.ph === 'up') {
      const t = T.t, P = HS3.pojie;
      T.z = Math.max(T.z, P.v0 * t + 0.5 * P.acc * t * t);
      e.x = T.x0; e.y = T.y0; e.flyH = 0; e.lift = T.z; e.kx = e.ky = 0;
      if (e.cs) { e.cs.x = e.x; e.cs.y = e.y; e.cs.lift = T.z; e.cs.setAction('tumble'); e.cs.update(dt); }
      const b = B.body(e); b.freezeT = Math.max(b.freezeT, 0.1);
      if (R) { R.x = e.x; R.y = e.y; R.z = T.z; }
      if (T.z > 1100 && !this.log.includes('ripple-e')) { this.log.push('ripple-e'); this.fx({ k: 'hs3ripple', x: T.x0, y: T.y0, r: 1400, power: 2, color: '255,226,170' }); audio.sfx('chime'); }
      if (T.z >= P.top) {
        T.ph = 'gone'; T.t = 0; e.hideT = 99; e.aggro = false;
        if (R) R.fire = 0;
        this.log.push('gone');
      }
      if (H && T.by === 'hs') this.syncCs(H, dt);
      return;
    }
    if (T.ph === 'gone') {
      e.hideT = 99; e.lift = HS3.pojie.top; const b = B.body(e); b.freezeT = Math.max(b.freezeT, 0.1);
      // 他追上去：一蹲一纵
      if (T.by === 'hs' && H) {
        if (T.chain) {
          const k = T.t;
          if (k < 0.3) { this.eAct(H, 'hs3Crouch'); }
          else {
            if (T.hz === 0) { this.pillar(H.x, H.y, 1.2, 0.7, '255,230,170'); this.fx({ k: 'hs3leap', x: H.x, y: H.y, power: 2 }); const F = fx3dOf(g); F.sonic(H.x, H.y, 80, 0, 0, 1, { power: 1.3, vz: 3000 }); F.debris(H.x, H.y, { n: 14, r: 120, up: 1.2 }); F.dust(H.x, H.y, { r: 420 }); audio.sfx('whoosh', H.x, H.y); this.log.push('hs-leap'); }
            T.hz = Math.min(4000, T.hz + (1800 + 9000 * (k - 0.3)) * dt);
            H.flyH = T.hz; H.lift = 0; this.eAct(H, 'hs3Leap');
            if (T.hz > 2600) H.hideT = 99;
          }
          this.syncCs(H, dt);
          if (T.t >= 0.3 + HS3.pojie.wait) this.dropBack(T);
        } else if (T.t >= HS3.pojie.waitAlone) this.dropBack(T);
        return;
      }
      // 你打上去的：等你追（按追击键冲天），不追就自己摔回来
      if (T.by === 'p') {
        if (T.chasing) { this.chaseTick(T); return; }
        if (T.t >= HS3.pojie.chase) this.dropBack(T);
      }
      return;
    }
    if (T.ph === 'down') {
      // 它带着火尾砸回来了（近战的流星落地：坑、撞击伤害、嵌地）；落定了他再下来
      if (R) { R.x = e.x; R.y = e.y; R.z = e.z; R.down = true; R.fire = 1; }
      if (!B.isAir(e) || T.t > 3) {
        if (!B.isAir(e)) this.crashFx(e.x, e.y, 1.1);   // r7-fx3d：落地砸坑用三维碎石、尘浪、焦痕
        this.vis.risers = this.vis.risers.filter((r) => r.e !== e);
        if (T.by === 'hs' && T.chain && H) { T.ph = 'hsdown'; T.t = 0; T.hz = HS3.pojie.dropZ * 0.9; H.hideT = 0; const q = this.pickLanding(T.lx, T.ly, -T.dirX, -T.dirY, 260); H.x = H.hx = q.x; H.y = H.hy = q.y; }
        else this.finishTrip(T, 'landed');
      }
      return;
    }
    if (T.ph === 'hsdown' && H) {
      // 他从天上落下来（一脚踩地，起一圈小坑）
      const v = 2200 + 9000 * T.t;
      T.hz = Math.max(0, T.hz - v * dt);
      H.flyH = T.hz; H.lift = 0; this.eAct(H, T.hz > 60 ? 'hs3Stomp' : 'idle');
      if (H.cs) H.cs.faceToward(e.x - H.x, e.y - H.y, false);
      this.syncCs(H, dt);
      if (T.hz <= 0) {
        const W = g.combat.wreck;
        try { W.radial(H.x, H.y, 260, 2, H, { mark: 'crack' }); } catch { /* 破坏系统出错不拖垮出招 */ }
        this.fx({ k: 'crater', x: H.x, y: H.y, power: 2, r: 160 }); this.fx({ k: 'hs3land', x: H.x, y: H.y, power: 1.5 });
        { const F = fx3dOf(g); F.debris(H.x, H.y, { n: 14, r: 120 }); F.dust(H.x, H.y, { r: 520, power: 1.2 }); F.ring(H.x, H.y, 6, 0, 0, 1, { r: 700 }); }
        g.juice(0, 0.35); audio.sfx('land', H.x, H.y);
        this.finishTrip(T, 'landed');
      }
    }
  }
  /** 别人：从天上砸回落点（流星、火尾、大坑；撞击伤害算出手的那个——他走 npcHit、你走 hitEnemy） */
  private dropBack(T: Trip) {
    const g = this.g, B = g.combat.brawl, e = T.tgt as Enemy, H = this.ent;
    const q = this.pickLanding(T.x0, T.y0, T.dirX, T.dirY, HS3.pojie.landD);
    T.lx = q.x; T.ly = q.y; T.ph = 'down'; T.t = 0;
    e.hideT = 0; e.x = e.hx = q.x; e.y = e.hy = q.y; e.lift = 0; e.flyH = 0; e.kx = e.ky = 0;
    if (e.cs) { e.cs.x = q.x; e.cs.y = q.y; }
    if (!g.combat.enemies.includes(e)) g.combat.enemies.push(e);
    const by = T.by === 'hs' && H ? H : 'p';
    if (by !== 'p') { H!.atk = Math.max(1, this.rawFor(H!, e, HS3.pojie.frac * 1.4) / 0.55); }
    B.meteorIn(e, by, HS3.pojie.dropZ, T.by === 'hs' && T.chain ? HS3.pojie.dropVz : HS3.pojie.dropVz * 0.75, false);
    if (by !== 'p') { const b = B.body(e); b.byAtk = H!.atk; }
    const R = this.vis.risers.find((r) => r.e === e); if (R) { R.down = true; R.fire = 1; }
    this.fx({ k: 'hs3ripple', x: q.x, y: q.y, r: 1100, power: 1.4, color: '255,180,110' });
    if (T.by === 'hs' && T.chain && H) { this.say(H, '一脚还界！', '#ffcf8a'); this.impactFlash(); }
    audio.sfx('thunder', q.x, q.y);
    this.log.push('drop-back');
  }
  /** 你：交给飞出天穹的通道（xukong 的 climb），升降由这一拳接管 */
  private toCorridor(T: Trip) {
    const g = this.g, p = g.player, xk = g.xukong;
    this.setAloft(0);
    p.flying = true; p.sitting = false; p.z = p.zTarget = ALT.max;
    (xk as unknown as { hinted: boolean }).hinted = true;   // 「再往上便出了这方天地」那条提示是给自己飞的：被打上去时不报
    xk.force = { key: 1, k: HS3.pojie.riseK, tick: (dt) => this.forceTick(dt) };
    if (!xk.leave()) { xk.force = null; this.finishTrip(T, 'abort'); return; }
    T.ph = 'rise'; T.t = 0;
    this.log.push('corridor');
  }
  /** 世界停住（身在虚空）时也跑的那一份：由 xukong.update 每帧调（xukong.force.tick） */
  forceTick(dt: number) {
    this.visTick(0);
    const T = this.trip, g = this.g, xk = g.xukong;
    if (!T) { xk.force = null; return; }
    T.t += g.halted ? dt : 0;
    if (T.ph !== 'rise') return;
    if (xk.phase !== 'void') return;
    // 出了界壁、再往上一截：停住，他破界追出来——交给虚空斗法
    const dome = xk.domeAt(xk.ref, xk.x, xk.y), stop = Math.min(xk.refDepth * 0.9, Math.max(dome * HS3.pojie.over, dome + 120));
    if (xk.force) xk.force.k = HS3.pojie.riseK * (0.35 + 0.65 * clamp((stop - xk.alt) / Math.max(1, stop * 0.25), 0, 1));   // 快到顶慢下来（一个看得见的顶点）
    if (xk.alt < stop) return;
    xk.force = null;
    T.ph = 'engage'; T.t = 0;
    this.vis.risers = this.vis.risers.filter((r) => r.e !== 'p');
    this.log.push('void');
    const H = this.ent;
    if (T.tgt === 'p' && T.by === 'hs' && T.chain && H) this.hsEnterVoid(T, H);
    else if (T.tgt === 'p') { this.finishTrip(T, 'free'); g.toast('被一拳打出了天穹……四下是无声的星海。按住下降原路回去。', 'info'); }
    else this.playerArrive(T);
  }
  /** 他跟着破界追出来：进虚空斗法（斗法场里他在你下方——画面下方——冲上来） */
  private hsEnterVoid(T: Trip, H: Enemy) {
    const g = this.g, xk = g.xukong, F = xk.fight, B = g.combat.brawl;
    B.clear(H);
    H.hideT = 0; H.dead = false; H.gone = false;
    F.engage({ id: 'hs3-hanshan', name: this.H.plate, x: xk.x + 0.001, y: xk.y + 1, tier: H.realm, enemy: H, onEnd: () => { /* 结局由这一趟处置 */ } });
    // 斗法场里：从你正下方（画面下方）一千四冲上来
    const p = g.player;
    H.x = H.hx = p.x + 60; H.y = H.hy = p.y + 1400; H.flyH = p.z; H.lift = 0; H.aggro = true; H.tgP = true;
    this.eAct(H, 'rush');
    g.toast(`${this.H.plate}破开界壁追了上来！`, 'warn');
    audio.sfx('boom');
    this.log.push('hs-void');
  }
  /** 你学会的破界：你追上了虚空里的它——进斗法，它罡气已散、晕着，等你往下砸 */
  private playerArrive(T: Trip) {
    const g = this.g, xk = g.xukong, F = xk.fight, B = g.combat.brawl, e = T.tgt as Enemy;
    e.hideT = 0; e.lift = 0; B.clear(e);
    if (!g.combat.enemies.includes(e)) g.combat.enemies.push(e);
    F.engage({ id: 'hs3-up', name: e.name, x: xk.x + 1, y: xk.y, tier: e.realm, enemy: e });
    this.vis.risers = this.vis.risers.filter((r) => r.e !== e);
    T.ph = 'chase'; T.t = 0;
    this.log.push('p-void');
  }
  /** 你学会的破界：在虚空斗法里摆好它（罡气破、晕着）；之后的坠界交给 voidfall（重击 + 下降） */
  private chaseTick(T: Trip) {
    const g = this.g, F = g.xukong.fight, B = g.combat.brawl, e = T.tgt as Enemy, p = g.player;
    if (T.ph !== 'chase') return;
    if (!F.on) { this.finishTrip(T, 'abort'); return; }
    if (!F.handed) return;
    e.x = e.hx = p.x + 130; e.y = e.hy = p.y + 10; e.flyH = p.z;
    const b = B.body(e); b.poise = 0; b.breakT = 4; b.staggerT = Math.max(b.staggerT, 1.6);
    g.combat.lock = e; g.combat.manual = true;
    g.toast(`追上了！${IS_TOUCH ? '长按「崩」点「降」' : `按住 ${keyLabel(bindOf('descend'))} 再按右键崩山`}，把它踢回下界去。`, 'good');
    this.finishTrip(T, 'free');
  }
  /** 你脱困两回了：他笑一声，自己降回界内（斗法收场，你在虚空里接着飞） */
  private hsLeaveVoid(T: Trip) {
    const g = this.g, F = g.xukong.fight, H = this.ent!;
    this.say(H, '好身法！今天就到这儿。', '#ffe0a0');
    F.release(H);
    g.combat.enemies = g.combat.enemies.filter((q) => q !== H);
    F.finish('force');
    this.putHsHome(T, H);
    this.finishTrip(T, 'free');
  }
  /** 把他放回界内原来站的地方 */
  private putHsHome(T: Trip, H: Enemy) {
    const g = this.g, B = g.combat.brawl;
    B.clear(H);
    H.x = H.hx = T.hx; H.y = H.hy = T.hy; H.flyH = 0; H.lift = 0; H.hideT = 0; H.kx = H.ky = 0;
    if (H.cs) { H.cs.x = H.x; H.cs.y = H.y; H.cs.lift = 0; }
    if (!g.combat.enemies.includes(H)) g.combat.enemies.push(H);
  }
  /** 这一趟收场 */
  private finishTrip(T: Trip, how: 'landed' | 'abort' | 'free' | 'dead') {
    if (this.trip !== T) return;
    const g = this.g, xk = g.xukong, H = this.ent;
    this.trip = null;
    if (T.tgt !== 'p' && !this.wujiCam) g.combat.brawl.stagePts = [];
    if (xk.force) xk.force = null;
    T.ph = 'done';
    this.vis.risers = this.vis.risers.filter((r) => r.e !== T.tgt);
    if (T.tgt !== 'p' && !T.tgt.dead && how !== 'free') { T.tgt.hideT = 0; if (!g.combat.enemies.includes(T.tgt) && !xk.fight.on) g.combat.enemies.push(T.tgt); }
    if (H && T.by === 'hs') {
      // 他还挂在虚空斗法外面（异常收场）：放回界内原地
      if (how === 'abort' && !g.combat.enemies.includes(H) && !xk.fight.on) this.putHsHome(T, H);
      H.atk = T.atk0 || H.atk;
      (H as { shell?: boolean }).shell = this.H.mode === 'calm';
      H.hideT = 0; H.hunt = this.H.mode === 'angry';
      if (this.H.mode !== 'calm') { H.aggro = true; H.tgP = true; }
      if (H.flyH > 0 && !xk.fight.on) { H.flyH = 0; H.lift = 0; }
    }
    this.log.push('trip-' + how);
  }

  // ---------------------------------------------------------------- 脱困 / 追击键（brawl.escape 钩子）
  /** 返回 true = 这一下被这一批接走了 */
  onDodge(): boolean {
    const T = this.trip, g = this.g, xk = g.xukong;
    if (!T) return false;
    // 被他打上天、还在界内那一段：脱困，停在高空
    if (T.tgt === 'p' && (T.ph === 'lift' || (T.ph === 'rise' && xk.phase === 'climb'))) {
      const h = g.hero, B = g.combat.brawl, cost = 0.2;
      if (B.pb.techCd > 0) { g.toast('脱困还在调息中。', 'info'); return true; }
      if (h.mp < cost - 1e-6) { g.toast('灵力不足，脱不了困！', 'warn'); return true; }
      h.mp -= cost; B.pb.techCd = 5; B.pb.poise = Math.max(B.pb.poise, B.pb.poiseMax * 0.5); B.pb.breakT = 0;
      xk.force = null;
      if (T.ph === 'lift') { const p = g.player; this.setAloft(0); p.flying = true; p.z = p.zTarget = Math.min(ALT.max, T.z); }
      this.fx({ k: 'tech', anchor: { x: g.player.x, y: g.player.y, offsetY: -g.player.z }, x: g.player.x, y: g.player.y - 60, color: '170,230,255', r: 300 });
      audio.sfx('whoosh');
      g.toast('脱困！在高空稳住了身形。（按住下降落回去）', 'good');
      T.teched = true; this.log.push('tech-climb');
      this.finishTrip(T, 'free');
      return true;
    }
    // 你打上天的：冲天追上去
    if (T.by === 'p' && T.tgt !== 'p' && T.ph === 'gone' && !T.chasing) {
      const no = xk.refusal();
      if (no) { g.toast(no, 'info'); return true; }
      if (xk.phase !== 'none') return false;
      T.chasing = true;
      const p = g.player, B = g.combat.brawl;
      B.pb.air = false;
      const z = Math.max(p.z, B.aloftZ, 1);
      g.stand(); g.destination = null;
      this.pillar(p.x, p.y, 1.1, 0.7, '170,220,255');
      this.vis.risers.push({ e: 'p', x: p.x, y: p.y, z, t: 0, fire: 0.6, down: false });
      this.fx({ k: 'hs3leap', x: p.x, y: p.y, power: 2 });
      // 腾起到高空的顶，再走通道（同一条：飞出天穹）
      const lift = { z };
      const self = this;
      const go = () => {
        p.flying = true; p.sitting = false; p.z = p.zTarget = ALT.max; self.setAloft(0);
        (xk as unknown as { hinted: boolean }).hinted = true;
        xk.force = { key: 1, k: HS3.pojie.riseK, tick: (dt) => self.forceTick(dt) };
        if (!xk.leave()) { xk.force = null; T.chasing = false; return; }
        T.ph = 'rise';
      };
      if (p.flying || z >= ALT.max - 1) go();
      else { this.chaseLift = { lift, go }; if (!p.flying) this.setAloft(z); }
      audio.sfx('whoosh');
      this.log.push('p-chase');
      return true;
    }
    return false;
  }
  /** 你冲天追上去时腾起的那一小段（没御剑时） */
  private chaseLift: { lift: { z: number }; go: () => void } | null = null;
  /** 每帧（世界在跑）：你腾起的那一小段 */
  liftTick(dt: number) {
    const L = this.chaseLift; if (!L) return;
    L.lift.z += HS3.pojie.liftV * dt;
    this.pAct('rush', 0.3);
    const R = this.vis.risers.find((r) => r.e === 'p'); const p = this.g.player;
    if (R) { R.x = p.x; R.y = p.y; R.z = L.lift.z; }
    if (L.lift.z >= ALT.max - 1) { this.chaseLift = null; L.go(); }
    else this.setAloft(L.lift.z);
  }
  /** 读档、新开局：全清 */
  reset() {
    const V = this.vis;
    this.trip = null; this.chaseLift = null; this.big = []; this.monoT = 0;
    if (this.wujiCam) { this.wujiCam = null; this.g.combat?.brawl && (this.g.combat.brawl.stagePts = []); }
    fx3dOf(this.g).reset();
    V.mono = 0; V.keep = []; V.dim = 0; V.flash = 0; V.charge = null; V.warns = []; V.pillars = []; V.risers = []; V.rocks = []; V.streaks = []; V.notch = null; V.cutin = null;
    if (this.g.xukong?.force) this.g.xukong.force = null;
  }
}

/** 一局一份 */
const STATE = new WeakMap<Game, HsBatch3>();
export function hs3Of(g: Game): HsBatch3 { let s = STATE.get(g); if (!s) { s = new HsBatch3(g); STATE.set(g, s); } return s; }
/** 画面用：这一局有没有这一批的状态（没有就不画） */
export function hs3Peek(g: Game): HsBatch3 | undefined { return STATE.get(g); }

// ==================================================================== 招式
/** 出招者是不是撼山客本人（这一批他专属的招只给他） */
const isHs = (B: MoveCtx['B'], u: Enemy | null) => !!u && u === B.g.hanshan?.ent;
const S3 = (B: MoveCtx['B']) => hs3Of(B.g);
/** 对手的位置 */
const posOf = (c: MoveCtx, who: Enemy | 'p' | null) => { const p = c.B.g.player; return who === 'p' ? { x: p.x, y: p.y, z: p.z + c.B.playerLift } : who ? { x: who.x, y: who.y, z: who.z } : null; };
/** 出招者的位置 */
const userPos = (c: MoveCtx) => { const p = c.B.g.player; return c.user ? { x: c.user.x, y: c.user.y, z: c.user.z } : { x: p.x, y: p.y, z: p.z + c.B.playerLift }; };
/** 出招者摆动作 */
const act = (c: MoveCtx, a: Action, dur = 0.5) => {
  if (c.user) { if (c.user.cs && c.user.cs.action !== a) c.user.cs.restart(a); return; }
  (c.B as unknown as { playAct(a: Action, d: number): void }).playAct(a, dur);
};
/** 出招者面朝 */
const face = (c: MoveCtx, x: number, y: number) => {
  const u = userPos(c), dx = x - u.x, dy = y - u.y;
  if (Math.abs(dx) + Math.abs(dy) < 1e-3) return;
  if (c.user) { c.user.cs?.faceToward(dx, dy, false); c.user.facing = dx >= 0 ? 1 : -1; }
  else c.B.g.player.st.faceToward(dx, dy, false);
};
/** 他身上的 cs（平时 shell 时没人推它） */
const syncUser = (c: MoveCtx, dt: number) => { if (c.user) { const e = c.user; if (e.cs) { e.cs.x = e.x; e.cs.y = e.y; e.cs.lift = e.flyH + e.lift; if ((e as { shell?: boolean }).shell) e.cs.update(dt); } } };

// ------------------------------------------------------------------ r7-fx3d：踩地冲刺、终结一击的命中（无极一击、一拳破界、你学会的版本共用）
const F3 = (c: MoveCtx) => fx3dOf(c.B.g);
export interface Dash { x0: number; y0: number; x1: number; y1: number; z: number; t0: number; dur: number; lx: number; ly: number; gx: number; gy: number; gn: number }
/** 模糊残影的上限：一个残影要整个人重画两遍（画进立板图集），量过 26 个同时在场时这一项一帧 20–40 毫秒；一次冲刺最多留这么多个、同时在场最多这么多个 */
const GHOST_DASH = 4, GHOST_LIVE = 6;
/** 留一个被拉糊的残影（同时在场的超过上限就把最老的挤掉） */
export function pushGhost(c: MoveCtx, x: number, y: number, z: number, sx: number, sy: number, dur = 0.34, color = '235,235,245') {
  const B = c.B, yaw = c.user ? (c.user.cs?.yaw ?? 0) : B.g.player.st.yaw;
  B.ghosts.push({ e: c.user, x, y, z, t: 0, dur, yaw, color, sx, sy });
  let n = 0; for (let i = B.ghosts.length - 1; i >= 0; i--) if (B.ghosts[i].sx !== undefined && ++n > GHOST_LIVE) { B.ghosts.splice(i, 1); }
}
/** 蓄力：脚边碎石浮起、空气一阵阵扭（每 0.3 息一圈）、脚下开裂一次 */
export function chargeFx(c: MoveCtx, key: string, k: number, dt: number, r = 240) {
  const u = userPos(c), F = F3(c);
  if (!c.data.hum) { c.data.hum = 1; audio.sfx('fx_charge', u.x, u.y); }   // 蓄力：低沉的嗡鸣渐强
  F.levitate(key, u.x, u.y, r, 18, k);
  if (Math.floor(c.t / 0.3) !== Math.floor((c.t - dt) / 0.3)) F.warp(u.x, u.y, u.z + 80, { r: r * (0.9 + 0.6 * k), power: 0.3 + 0.35 * k, dur: 0.5 });
  // 劲一起，脚下成圈龟裂、身边的小树被气劲推倒（也省得一棵树挡在他和镜头之间）
  if (!c.data.cracked && k > 0.25) { c.data.cracked = 1; try { c.B.g.combat.wreck.radial(u.x, u.y, r * 1.1, 1.8, c.user ?? 'p', { mark: 'crack', maxTrees: 0, maxRocks: 0, shake: false }); } catch { /* 破坏系统出错不拖垮出招 */ } }   // r9：蓄力不再推倒身边的树、不再打碎身边的枯树 / 石头（枯树是可破坏物，碎成几截黑色的树枝飘在画面上——无极一击 0.55 那几根「黑棍」）
}
/** 起步：脚下炸坑、音障锥 + 激波环、碎石往后崩、尘浪；蓄力浮着的石头往外崩 */
export function dashGo(c: MoveCtx, key: string, x1: number, y1: number, dur: number, z = 30, col?: RGB3): Dash {
  const u = userPos(c), dx = x1 - u.x, dy = y1 - u.y, L = Math.hypot(dx, dy), ux = L > 1 ? dx / L : c.dirX, uy = L > 1 ? dy / L : c.dirY, F = F3(c), W = c.B.g.combat.wreck;
  try { W.pit(u.x, u.y, 85, 2.4); W.cracks(u.x, u.y, 240, 2); } catch { /* 破坏系统出错不拖垮出招 */ }
  F.sonic(u.x + ux * 80, u.y + uy * 80, z + 70, ux, uy, 0.03, { power: 1.5, vx: ux * 2800, vy: uy * 2800, col });
  F.debris(u.x, u.y, { n: 18, r: 110, power: 1.15, dir: Math.atan2(-uy, -ux), spread: 1.1, up: 0.95 });
  F.dust(u.x, u.y, { r: 460, power: 1.3 });
  F.blastFloat(key, Math.atan2(-uy, -ux), 1.2);
  c.fx({ k: 'hs3leap', x: u.x, y: u.y, power: 1.6 });
  audio.sfx('fx_launch', u.x, u.y);   // 踩地起步：闷爆 + 碎石（音障的尖啸由 fx3d.sonic 配）
  c.shake(0.5);
  return { x0: u.x, y0: u.y, x1, y1, z, t0: c.t, dur, lx: u.x, ly: u.y, gx: u.x, gy: u.y, gn: 0 };
}
/** 冲刺途中：先慢后快地往前挪，一路留下被拉糊的残影；返回 true = 到了 */
export function dashStep(c: MoveCtx, D: Dash): boolean {
  const k = clamp((c.t - D.t0) / Math.max(0.01, D.dur), 0, 1), e = k * k * (0.35 + 0.65 * k) + k * 0.35 * (1 - k);
  const x = D.x0 + (D.x1 - D.x0) * e, y = D.y0 + (D.y1 - D.y0) * e, z = D.z * Math.sin(Math.PI * Math.min(1, k * 1.1));
  if (c.user) c.place(null, x, y, z); else c.place(null, x, y);
  act(c, 'rush', 0.3);
  // 残影：每冲过一段（全程的四分之一）留一个，一次冲刺最多 GHOST_DASH 个
  const seg = Math.max(80, Math.hypot(D.x1 - D.x0, D.y1 - D.y0) / GHOST_DASH), gd = Math.hypot(x - D.gx, y - D.gy);
  if (gd >= seg && D.gn < GHOST_DASH) { D.gn++; pushGhost(c, D.gx + (x - D.gx) * 0.5, D.gy + (y - D.gy) * 0.5, z, (x - D.gx) / gd * 70, (y - D.gy) / gd * 70, 0.36); D.gx = x; D.gy = y; }
  D.lx = x; D.ly = y;
  return k >= 1;
}
/** 到了：整条路一段拖影 + 立体速度线，脚下刹出一圈尘 */
export function dashEnd(c: MoveCtx, D: Dash) {
  const F = F3(c);
  if (Math.hypot(D.x1 - D.x0, D.y1 - D.y0) > 60) { F.smear(D.x0, D.y0, 80, D.x1, D.y1, 80, { w: 52, dur: 0.34 }); F.trail(D.x0, D.y0, D.x1, D.y1, Math.min(10, 3 + Math.round(Math.hypot(D.x1 - D.x0, D.y1 - D.y0) / 140))); }
  F.dust(D.x1, D.y1, { r: 260, power: 0.8 });
}
/** 终结一击命中的方向性：星闪 + 朝打击方向的冲击线 + 扭曲冲击波；被打的人整个闪白，往后滑时脚下拖土 */
export function heavyHit(c: MoveCtx, who: Enemy | 'p', ux: number, uy: number, uz: number, power: number) {
  const q = posOf(c, who); if (!q) return;
  const F = F3(c);
  F.impact(q.x, q.y, q.z + 95, ux, uy, { power, dz: uz, warp: 0.6 });   // r9：扭曲球壳 1.2 → 0.6（推近的镜头里一个白色大球罩住被打的人）
  audio.sfx('fx_hit', q.x, q.y);   // 重拳的闷响 + 爆裂
  if (who !== 'p') who.hitFlash = Math.max(who.hitFlash, 0.1);   // r9：0.32 → 0.1（hitFlash 在单位身上画一团白光，0.32 是 0.12 的近三倍亮、停三分之一秒，被打的人整个被一颗白球罩住）
  else c.B.g.hurtFlash = Math.max(c.B.g.hurtFlash, 0.5);
  F.skid(() => { const p = posOf(c, who); return p && (who === 'p' || !who.dead) ? p : null; }, 1.1);
}

// ------------------------------------------------------------------ 一拳破界
const POJIE: SpecialMove = {
  id: 'pojie', name: '一拳破界', glyph: '破', color: '255,200,120', realm: 5, mp: 0.35, cd: HS3.pojie.cd, range: HS3.pojieDash.max + 100,
  desc: '沉身蓄劲，踩地一冲到对手跟前，一记冲天拳把它打穿云层、送出天穹。对手进了虚空，按追击键冲天追上去，在虚空里把它往下砸回界内；不追，它过几息自己摔回来。（化神）',
  who: 'both', ai: { weight: 0.55, max: HS3.pojieDash.max },
  can(B, u) {
    const g = B.g, S = S3(B), xk = g.xukong;
    if (S.trip) return false;
    if (u === null) {
      // 你：这一界有没有虚空可去
      const no = g.offWorld || xk.phase !== 'none' || xk.fall.live ? '此刻身不由己，打不出这一拳。' : xk.refusal();
      if (no) { g.toast(`一拳破界：${no}`, 'info'); return false; }
      return true;
    }
    if (!isHs(B, u) || g.offWorld || xk.phase !== 'none' || xk.fall.live) return false;
    return S.bigOk();
  },
  begin(c) {
    const S = S3(c.B), g = c.B.g, tg = c.target;
    if (!tg) { if (!c.user) g.toast('身前没有可打的人。', 'info'); return false; }
    if (tg !== 'p' && ((tg as { shell?: boolean }).shell || !c.B.launchable(tg))) { if (!c.user) g.toast('打不动它。', 'info'); return false; }
    if (tg === 'p') {
      // 打你：你得渡得过界壁（元婴以上），这一界有虚空可去
      const xk = g.xukong;
      if (xk.refusal() || g.offWorld || xk.phase !== 'none' || g.hero.dead || c.B.pSubT > 0) return false;
    }
    if (c.user) { S.useBig(); (c.user as { shell?: boolean }).shell = false; }
    const q = posOf(c, tg)!;
    c.data.tx = q.x; c.data.ty = q.y; c.data.hit = 0;
    face(c, q.x, q.y);
    act(c, 'hs3Crouch', 0.9);
    S.vis.warns.push({ k: 'column', x: q.x, y: q.y, x2: q.x, y2: q.y, r: 170, t: 0, dur: HS3.pojie.wind + 0.15, fade: 0.2 });
    S.vis.charge = { e: c.user, k: 0, col: '255,196,110', ink: false };
    if (c.user) S.say(c.user, '上去吧！', '#ffcf8a');
    audio.sfx('clang');
    S.log.push('pojie');
  },
  tick(c, dt) {
    const S = S3(c.B), P = HS3.pojie, g = c.B.g, F = F3(c), key = c.user ? 'pojie-h' : 'pojie-p';
    syncUser(c, dt);
    const tg = c.target!;
    // —— 蓄力：沉身、脚下开裂、碎石浮起、空气扭
    if (c.t < P.wind) {
      const q = posOf(c, tg);
      if (q) { face(c, q.x, q.y); const w = S.vis.warns.find((w) => w.k === 'column'); if (w && c.t < P.wind * 0.6) { w.x = w.x2 = q.x; w.y = w.y2 = q.y; } }
      if (S.vis.charge) S.vis.charge.k = c.t / P.wind;
      chargeFx(c, key, c.t / P.wind, dt, 200);
      act(c, 'hs3Crouch', 0.6);
      return true;
    }
    // —— 踩地冲刺：瞬间到它跟前（贴身就原地起拳）
    if (!c.data.dash) {
      S.vis.charge = null;
      const u = userPos(c), q = posOf(c, tg) ?? u, d = Math.hypot(q.x - u.x, q.y - u.y), ux = d > 1 ? (q.x - u.x) / d : c.dirX, uy = d > 1 ? (q.y - u.y) / d : c.dirY;
      const go = clamp(d - 75, 0, HS3.pojieDash.max);
      c.data.dash = dashGo(c, key, u.x + ux * go, u.y + uy * go, go > 40 ? HS3.pojieDash.dur : 0.01, c.user ? 30 : 0, [1, 0.92, 0.8]);
    }
    const D = c.data.dash as Dash;
    if (!c.data.arrived) {
      if (!dashStep(c, D)) return true;
      c.data.arrived = 1; c.data.at0 = c.t; dashEnd(c, D);
      if (!c.user) S.setAloft(0);
      act(c, 'hs3Upper', 0.6);
    }
    if (!c.data.hit) {
      c.data.hit = 1;
      act(c, 'hs3Upper', 0.6);
      const u = userPos(c), q = posOf(c, tg);
      if (!q || Math.hypot(q.x - u.x, q.y - u.y) > P.reach + (tg === 'p' ? 0 : 20) || (tg !== 'p' && !c.B.launchable(tg)) || (tg === 'p' && (c.B.pSubT > 0 || g.hero.dead))) {
        // 打空：拳风冲天，脚下一圈尘
        c.fx({ k: 'hs3up', x: u.x + c.dirX * 80, y: u.y + c.dirY * 60, power: 1.2, color: '255,220,160' });
        F.sonic(u.x, u.y, u.z + 140, 0, 0, 1, { power: 1, vz: 2400 });
        audio.sfx('whoosh', u.x, u.y);
        c.data.miss = 1; S.log.push('pojie-miss');
        return true;
      }
      const ok = S.strike(c, tg, P.frac, 3.2, 'pojie');
      // 终结技全屏演出：白闪 → 黑白闪 → 集中线、「破」字砸屏；命中：星闪 + 往上的冲击线 + 空间扭曲冲击波
      S.finisher('破', [c.user ?? 'p', tg]);
      heavyHit(c, tg, 0, 0, 1, 2.2);
      F.blast(q.x, q.y, 1.7, 'gold', { z: q.z + 70, r: 260 });
      F.sonic(q.x, q.y, q.z + 150, 0, 0, 1, { power: 1.7, vz: 3400, col: [1, 0.86, 0.6] });
      F.ring(q.x, q.y, 8, 0, 0, 1, { r: 1000, power: 1.6 });
      F.debris(q.x, q.y, { n: 20, r: 150, power: 1, up: 1.6 });
      F.dust(q.x, q.y, { r: 640, power: 1.5 });
      c.freeze(0.08); c.shake(0.9); c.cam(1.1);
      g.slowmo(0.12); g.aberrKick = Math.max(g.aberrKick, 0.7);
      c.fx({ k: 'hs3hit', x: q.x, y: q.y - q.z - 60, anchor: { x: q.x, y: q.y, offsetY: -q.z }, power: 3, dir: -Math.PI / 2, color: '255,210,140' });   // IMPACT: 背后冲击波（往上炸开）
      c.B.combo(tg === 'p' ? (c.user as Enemy) : tg, '一拳破界', true);
      if (c.user) S.say(c.user, '一拳破界！', '#ffcf8a');
      if (ok || tg === 'p') S.launchUp(c.user ? 'hs' : 'p', c.user, tg, !!c.user, c.dirX, c.dirY);
      return true;
    }
    // 收拳：仰头看天
    const at0 = c.data.at0 as number;
    if (c.data.miss) return c.t < at0 + 0.45;
    return c.t < at0 + 0.55;
  },
  end(c) { const S = S3(c.B); if (S.vis.charge?.e === c.user) S.vis.charge = null; if (!c.user) S.setAloft(0); },
};

// ------------------------------------------------------------------ 一脚还界（破界之后他在虚空里的那一脚；借星接在前头）
/** 借星：斗法场里撒几块陨石，他从一块蹬到下一块折返加速，最后一下扑到对手跟前。返回每一步（时刻、位置） */
function starPath(S: HsBatch3, c: MoveCtx, n: number): { x: number; y: number }[] {
  const u = userPos(c), q = posOf(c, c.target)!;
  const dx = q.x - u.x, dy = q.y - u.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
  const seed = hash32(Math.round(u.x), Math.round(u.y), Math.round(c.B.g.time * 10));
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0.5 : 0.18 + 0.64 * i / (n - 1), side = i % 2 ? -1 : 1, off = (420 + 160 * hu(seed, i, 1)) * side;
    const along = i === n - 1 ? d + 380 : d * f;   // 最后一块在对手身后：从背后折回来一脚
    pts.push({ x: u.x + ux * along + nx * off, y: u.y + uy * along + ny * off * 0.8 });
  }
  for (let i = 0; i < pts.length; i++) S.vis.rocks.push({ x: pts[i].x, y: pts[i].y, z: q.z + 40 + 50 * hu(seed, i, 2), r: 70 + 40 * hu(seed, i, 3), seed: hash32(seed, i), t: 0, broken: 0 });
  return pts;
}
/** 借星的一步一步：t 是从开蹬算起的时刻；返回 true = 已经扑到对手跟前 */
function starTick(S: HsBatch3, c: MoveCtx, pts: { x: number; y: number }[], legs: readonly number[], t: number, z: number): boolean {
  const e = c.user!, q = posOf(c, c.target)!;
  let acc = 0;
  const from = (i: number) => (i === 0 ? { x: c.data.sx as number, y: c.data.sy as number } : pts[i - 1]);
  for (let i = 0; i <= pts.length; i++) {
    const L = legs[Math.min(i, legs.length - 1)] * (i === pts.length ? 0.8 : 1);
    if (t < acc + L) {
      const a = from(i), b = i === pts.length ? { x: q.x - (q.x - a.x) * 0.12, y: q.y - (q.y - a.y) * 0.12 } : pts[i];
      const k = smooth((t - acc) / L), ox = e.x, oy = e.y;
      e.x = e.hx = a.x + (b.x - a.x) * k; e.y = e.hy = a.y + (b.y - a.y) * k; e.flyH = z; e.lift = 0;
      e.cs?.faceToward(b.x - a.x, b.y - a.y, false);
      if (e.cs && e.cs.action !== 'rush') e.cs.restart('rush');
      S.vis.streaks.push({ x0: ox, y0: oy, z0: z + 60, x1: e.x, y1: e.y, z1: z + 60, t: 0, dur: 0.35, col: i === pts.length ? '255,226,160' : '200,190,255' });   // IMPACT: 超高速追击线
      { const dx = e.x - ox, dy = e.y - oy, L = Math.hypot(dx, dy); if (L > 30 && Math.floor(c.t * 20) !== Math.floor((c.t - 1 / 60) * 20)) pushGhost(c, (ox + e.x) / 2, (oy + e.y) / 2, z, dx / L * 70, dy / L * 70, 0.3, '220,210,255'); }   // r7-fx3d：模糊残影（每 1/20 息一个，有上限）
      return false;
    }
    acc += L;
    // 蹬碎这一块
    const r = S.vis.rocks[S.vis.rocks.length - pts.length + i];
    if (i < pts.length && r && !r.broken) {
      r.broken = 0.001;
      c.fx({ k: 'hs3rock', x: r.x, y: r.y - r.z, anchor: { x: r.x, y: r.y, offsetY: -r.z }, r: r.r, power: 1 + i * 0.5, dir: Math.atan2(r.y - from(i).y, r.x - from(i).x) });
      { const F = F3(c), nx = i < pts.length - 1 ? pts[i + 1] : q, dx = nx.x - r.x, dy = nx.y - r.y, L = Math.hypot(dx, dy) || 1;   // r7-fx3d：蹬碎陨石——碎块是立体的，往下一步的方向一记音爆
        F.debris(r.x, r.y, { z: r.z, n: 12, r: r.r, power: 0.9, up: 0.5 }); F.sonic(r.x, r.y, r.z + 60, dx / L, dy / L, 0, { power: 1 + i * 0.3, vx: dx / L * 2600, vy: dy / L * 2600, col: [0.85, 0.8, 1] }); }
      c.shake(0.25 + i * 0.1); audio.sfx('break', r.x, r.y);
      if (e.cs) e.cs.restart('hs3Kick');
    }
  }
  return true;
}

const HUANJIE: SpecialMove = {
  id: 'huanjie', name: '一脚还界', glyph: '还', color: '255,170,100', cd: 8, range: 3000,
  desc: '破界之后追进虚空，借陨石折返加速，一脚把人踢回下界——流星坠向落点，砸出大坑。',
  who: 'npc', ai: { weight: 0.0001, max: 3000 },
  can(B, u) { const S = S3(B); return isHs(B, u) && !!S.trip && S.trip.ph === 'kick' && B.g.xukong.fight.handed; },
  begin(c) {
    const S = S3(c.B);
    if (!c.user || c.target !== 'p') return false;
    c.data.sx = c.user.x; c.data.sy = c.user.y; c.data.st = 0; c.data.kicked = 0;
    c.data.pts = starPath(S, c, HS3.jiexing.rocks);
    act(c, 'hs3Crouch');
    S.log.push('huanjie');
  },
  tick(c, dt) {
    const S = S3(c.B), J = HS3.jiexing, e = c.user!, g = c.B.g, p = g.player;
    syncUser(c, dt);
    const pts = c.data.pts as { x: number; y: number }[];
    if (c.t < J.appear) { face(c, p.x, p.y); e.flyH = p.z; return true; }   // 陨石从虚空里浮出来
    if (!c.data.kicked) {
      const there = starTick(S, c, pts, J.legs, c.t - J.appear, p.z);
      if (!there) return true;
      c.data.kicked = 1;
      // 一脚还界：从背后折回来，一脚往下踢
      act(c, 'hs3Kick');
      face(c, p.x, p.y);
      S.strike(c, 'p', HS3.huanjie.frac, 0, 'huanjie');
      // r7-fx3d：终结技全屏演出（「還」）；命中：星闪 + 往下的冲击线 + 扭曲冲击波、一团火爆、往下的燃烧音障锥
      S.finisher('還', [e, 'p']);
      heavyHit(c, 'p', c.dirX * 0.25, c.dirY * 0.25, -1, 2.2);
      { const F = F3(c); F.blast(p.x, p.y, 1.6, 'fire', { z: p.z + 70, r: 240 }); F.sonic(p.x, p.y, p.z + 40, 0, 0, -1, { power: 1.7, vz: -3000, col: [1, 0.66, 0.36] }); }
      c.fx({ k: 'hs3hit', x: p.x, y: p.y - p.z - 60, anchor: { x: p.x, y: p.y, offsetY: -p.z }, power: 3.4, dir: Math.PI / 2, color: '255,170,100' });   // IMPACT: 背后冲击波
      S.say(e, '一脚还界！', '#ffcf8a');
      g.aberrKick = Math.max(g.aberrKick, 0.8);
      const xk = g.xukong, V = xk.fall, T = S.trip;
      // 他的撞击伤害按这一下来（坠地那一下也是他的）
      e.atk = Math.max(1, S.rawFor(e, 'p', HS3.huanjie.frac * 1.6) / 0.45);
      if (T) T.kicks++;
      if (V.canDropPlayer(e)) {
        V.dropPlayer(e);
        // 落点：往他踢的方向挪一截，落在野外的空地上（不在城里；起点在海上就砸海）
        if (T) {
          const ux = c.dirX, uy = c.dirY, L = Math.hypot(ux, uy) || 1;
          const q = S.pickLanding(T.x0, T.y0, ux / L, uy / L, HS3.huanjie.kickShift);
          const v = pointToVoid(ACTIVE_MAP, q.x, q.y); xk.x = v.x; xk.y = v.y; xk.vx = xk.vy = 0;
          if (V.drop) { V.drop.vx = v.x; V.drop.vy = v.y; }
          T.lx = q.x; T.ly = q.y;
        }
      } else { c.launch('p', c.dirX, c.dirY, 1400, 300); }
      return false;
    }
    return false;
  },
};

// ------------------------------------------------------------------ 借星（虚空斗法里单用：蹬碎陨石折返加速，扑到跟前一记重拳）
const JIEXING: SpecialMove = {
  id: 'jiexing', name: '借星', glyph: '星', color: '200,190,255', cd: 14, range: 2600,
  desc: '在虚空里踩碎陨石折返加速，几个折返之后扑到跟前一记重拳。',
  who: 'npc', ai: { weight: 1.2, min: 300, max: 2600 },
  can(B, u) { const F = B.g.xukong.fight; return isHs(B, u) && F.on && F.handed && !S3(B).trip; },
  begin(c) {
    const S = S3(c.B);
    if (!c.user || !c.target) return false;
    c.data.sx = c.user.x; c.data.sy = c.user.y; c.data.done = 0;
    c.data.pts = starPath(S, c, HS3.jiexing.rocks);
    act(c, 'hs3Crouch');
    S.log.push('jiexing');
  },
  tick(c, dt) {
    const S = S3(c.B), J = HS3.jiexing, e = c.user!;
    syncUser(c, dt);
    const q = posOf(c, c.target); if (!q) return false;
    const pts = c.data.pts as { x: number; y: number }[];
    if (c.t < J.appear) { face(c, q.x, q.y); return true; }
    if (!c.data.done) {
      if (!starTick(S, c, pts, J.legs, c.t - J.appear, q.z)) return true;
      c.data.done = 1; c.data.at = c.t;
      act(c, 'smash');
      S.strike(c, c.target!, J.frac, 2.4, 'jiexing');
      c.fx({ k: 'hs3hit', x: q.x, y: q.y - q.z - 60, anchor: { x: q.x, y: q.y, offsetY: -q.z }, power: 2.4, dir: Math.atan2(q.y - e.y, q.x - e.x), color: '200,190,255' });   // IMPACT: 背后冲击波
      c.launch(c.target, q.x - e.x, q.y - e.y, 1800, 200);
      c.freeze(0.07); c.shake(0.5);
      return true;
    }
    return c.t < (c.data.at as number) + 0.35;
  },
};

// ------------------------------------------------------------------ 无极一击
/** 远处最高的那一点（沿着拳路 from‥to 之间）：远山的缺口落在那儿 */
function farPeak(g: Game, x: number, y: number, ux: number, uy: number, from: number, to: number): { x: number; y: number; h: number; base: number } {
  const T = g.terrain;
  const base = T.surfaceHeight(x, y);
  let best = { x: x + ux * to, y: y + uy * to, h: -Infinity, base };
  for (let d = from; d <= to; d += 120) {
    const px = x + ux * d, py = y + uy * d, h = T.surfaceHeight(px, py);
    if (h > best.h) best = { x: px, y: py, h, base };
  }
  return best;
}
/** 拳路上是不是海：(x, y) 往前一拳的那一段大半是深水（照破坏系统 split 的判法），是就返回劈开的那一段 */
export function seaLine(g: Game, x: number, y: number, ux: number, uy: number, len = HS3.wuji.len): { x0: number; y0: number; x1: number; y1: number } | null {
  const B = g.combat.brawl;
  if (g.offWorld) return null;
  const x0 = x + ux * 120, y0 = y + uy * 120, x1 = x + ux * len, y1 = y + uy * len;
  const n = 20; let wet = 0;
  for (let i = 0; i <= n; i++) { const u = i / n; if (B.deepWater(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u)) wet++; }
  return wet >= (n + 1) * HS3.sea.wet ? { x0, y0, x1, y1 } : null;
}
const WUJI: SpecialMove = {
  id: 'wuji', name: '无极一击', glyph: '极', color: '240,240,240', cd: HS3.wuji.cd, range: HS3.wuji.dashMax + 150,
  desc: '蓄力时天地失色，踩地一冲瞬间到敌人面前，一拳把人轰飞——拳压从拳头往前犁出一道越来越宽的扇形长沟，树倒石裂，远山缺一块；拳路上是海，就把海劈开。',
  who: 'npc', ai: { weight: 0.5, min: 160, max: HS3.wuji.dashMax },
  can(B, u) { const g = B.g; return isHs(B, u) && !g.offWorld && !S3(B).trip && S3(B).bigOk(); },
  begin(c) {
    const S = S3(c.B), u = c.user, q = posOf(c, c.target), W = HS3.wuji;
    if (!u || !q) return false;
    S.useBig();
    c.data.ux = c.dirX; c.data.uy = c.dirY; c.data.hit = 0;
    act(c, 'hs3Crouch');
    // r8-p2：不再整段蓄力都「天地变黑白」（整屏发灰、太久）——只在蓄力最后 0.3 息和命中那几帧压暗：背景暗下去，人和火照旧彩色、更亮
    S.vis.charge = { e: u, k: 0, col: '235,235,235', ink: true };
    S.vis.warns.push({ k: 'fan', x: q.x, y: q.y, x2: q.x + c.dirX * W.len, y2: q.y + c.dirY * W.len, r: W.w0, r2: W.w1, t: 0, dur: W.wind + W.dash, fade: 0.25 });
    S.say(u, '……', '#e8e8e8');
    audio.sfx('thunder', u.x, u.y);
    S.log.push('wuji');
  },
  tick(c, dt) {
    const S = S3(c.B), W = HS3.wuji, u = c.user!, g = c.B.g, F = F3(c);
    syncUser(c, dt);
    const q = posOf(c, c.target);
    // —— 蓄力：沉身、脚下开裂、碎石浮起、空气扭曲、天地变黑白（只留两人）；方向 lock 之前跟着对手走，之后定死（看得见的预兆：地上的扇面不再动，人可以闪开）
    if (c.t < W.wind) {
      if (q && c.t < W.lock) { const dx = q.x - u.x, dy = q.y - u.y, d = Math.hypot(dx, dy) || 1; c.data.ux = dx / d; c.data.uy = dy / d; }
      const ux = c.data.ux as number, uy = c.data.uy as number;
      const w = S.vis.warns.find((w) => w.k === 'fan'); if (w && q && c.t < W.lock) { w.x = q.x; w.y = q.y; w.x2 = q.x + ux * W.len; w.y2 = q.y + uy * W.len; }
      if (c.t < W.spin) {
        // 旋身一圈，一圈火从身上甩出去
        if (!c.data.spun) { c.data.spun = 1; F.jet(u.x, u.y, 110, ux, uy, { len: 300, spread: Math.PI, power: 0.9 }); F.ring(u.x, u.y, 110, 0, 0, 1, { r: 380, power: 1.3, col: [1, 0.6, 0.3], dur: 0.3 }); audio.sfx('whoosh', u.x, u.y); }
        const a = Math.atan2(uy, ux) + (c.t / W.spin) * Math.PI * 2;
        face(c, u.x + Math.cos(a) * 100, u.y + Math.sin(a) * 100);
        act(c, 'hs3Spin');
        return true;
      }
      // 弓步蓄力：右拳举在头侧，拳上一团火越烧越亮；脚下开裂、碎石浮起、空气扭、天地变黑白
      face(c, u.x + ux * 100, u.y + uy * 100);
      const k = (c.t - W.spin) / (W.wind - W.spin);
      if (S.vis.charge) S.vis.charge.k = k;
      chargeFx(c, 'wuji', k, dt, 300);
      F.fire('wuji-fist', u.x - ux * 18, u.y - uy * 18, u.z + 108, 0, 0, -320, 0.5 + 0.9 * k, 0.2 + 0.1 * k);
      if (k > 0.6 && !c.data.crack2) { c.data.crack2 = 1; try { g.combat.wreck.cracks(u.x, u.y, 420, 2.4); } catch { /* */ } }
      if (Math.floor(c.t * 8) !== Math.floor((c.t - dt) * 8)) c.fx({ k: 'hs3gather', x: u.x, y: u.y, power: 1 + k, anchor: { x: u.x, y: u.y, offsetY: -u.z } });
      if (c.t > W.wind - 0.3) { S.vis.dim = Math.max(S.vis.dim, 0.9 * smooth((c.t - (W.wind - 0.3)) / 0.12)); S.vis.keep = [u, c.target!]; }
      act(c, 'hs3Brace');
      return true;
    }
    // —— 踩地冲刺：脚下炸坑、音障锥、激波环、模糊残影，瞬间到它面前
    if (!c.data.dash) {
      S.vis.charge = null;
      const ux = c.data.ux as number, uy = c.data.uy as number;
      const along = q ? (q.x - u.x) * ux + (q.y - u.y) * uy : 0, go = clamp(along - 85, 0, W.dashMax);
      c.data.dash = dashGo(c, 'wuji', u.x + ux * go, u.y + uy * go, go > 40 ? W.dash : 0.01, 30);
    }
    const D = c.data.dash as Dash;
    if (!c.data.hit) { S.vis.dim = Math.max(S.vis.dim, 0.9); S.vis.keep = [u, c.target!]; }
    if (!c.data.arrived) { if (c.user) F.fire('wuji-fist', u.x, u.y, u.z + 120, (D.x1 - D.x0) / W.dash, (D.y1 - D.y0) / W.dash, 0, 1.2, 0.35); if (!dashStep(c, D)) return true; c.data.arrived = 1; dashEnd(c, D); }
    // —— 一拳
    if (!c.data.hit) {
      c.data.hit = 1;
      act(c, 'hs3Cannon');
      const ux = c.data.ux as number, uy = c.data.uy as number, dir = Math.atan2(uy, ux), nx = -uy, ny = ux;
      const x0 = u.x + ux * 70, y0 = u.y + uy * 70;
      S.finisher('無極', [u, c.target!]);   // 白闪 → 黑白闪 → 拳头定格特写 →「無極」大字
      S.cutin('fist');
      c.freeze(0.3); c.shake(1.3); c.cam(1.4);
      g.slowmo(0.2); g.aberrKick = Math.max(g.aberrKick, 1);
      c.B.stageFar = 700;   // r8-p2：镜头留在他身上，被轰飞的人飞出画面（照视频），不跟着拉远
      // 拳路上是海：同一拳把海沿扇形劈开（两边立水墙再合拢）；陆上：犁出扇形长沟
      const sea = seaLine(g, u.x, u.y, ux, uy, W.len);
      let res: ReturnType<typeof g.combat.wreck.fan> | null = null, split: WreckSplit | null = null;
      if (sea) {
        const r = g.combat.wreck.split(sea.x0, sea.y0, sea.x1, sea.y1, HS3.sea.w, { dur: HS3.sea.dur, power: 5 });
        if (r.ok) split = r.split;
        c.fx({ k: 'hs3split', x: sea.x0, y: sea.y0, x2: sea.x1, y2: sea.y1, r: HS3.sea.w, power: 5 });
        S.log.push('wuji-sea');
      } else {
        // 倒树限 48 棵：量过命中那一帧「U·战斗」52 毫秒，大头是破坏系统一次放倒 80 棵树（倒下的树还要占立板图集，太多会把人挤出图集）
        try { res = g.combat.wreck.fan(x0, y0, dir, W.len, W.w0, W.w1, 5, u, { maxTrees: 48 }); } catch { /* 破坏系统出错不拖垮出招 */ }
      }
      // 打谁：正对着的对手（够得着拳头）+ 扇面里的人（你只在他冲着你打时才挨）
      const hitSet = new Set<Enemy | 'p'>();
      const inFan = (x: number, y: number) => { const t = (x - x0) * ux + (y - y0) * uy, n = Math.abs((x - x0) * nx + (y - y0) * ny); return t > -120 && t < W.len && n < W.w0 + (W.w1 - W.w0) * clamp(t / W.len, 0, 1) + 40; };
      if (c.target && q && Math.hypot(q.x - x0, q.y - y0) < 280) hitSet.add(c.target);
      for (const h of res?.units ?? []) { if (h.player) { if (c.target === 'p') hitSet.add('p'); } else if (h.e && h.e !== u) hitSet.add(h.e); }
      if (sea) for (const who of ['p' as const, ...g.combat.enemies.filter((e) => !e.dead && e !== u)]) { if (who === 'p' && c.target !== 'p') continue; const p2 = posOf(c, who)!; if (inFan(p2.x, p2.y)) hitSet.add(who); }
      for (const who of hitSet) {
        const main = who === c.target;
        S.strike(c, who, main ? W.frac : W.frac * 0.5, 0, 'wuji');
        c.launch(who, ux, uy, main ? W.fly : 1800, main ? 950 : 380);   // 照视频：被打的人被火龙吹起、打飞上天
        if (main) heavyHit(c, who, ux, uy, 0.08, 2.6);
      }
      // 立体：拳口一团爆、往前的音障锥、垂直于拳路的激波环、扭曲冲击波；沿扇面按 3000/秒 一路碎石、尘浪
      // r8-p2：照视频命中那一下——半屏大的白黄火球（白芯过曝、橙黄、红边、光刺）、往前喷的长火龙（大小按推近后的镜头重新定：火球直径约两个半人高）
      F.blast(x0 + ux * 60, y0 + uy * 60, 3, sea ? 'frost' : 'fire', { z: 100, r: 280 });
      F.jet(x0, y0, 100, ux, uy, { len: 780, power: 2.6, dz: 0.06, pal: sea ? 'frost' : 'fire', spread: 0.14 });   // 往前喷的火龙
      F.jet(x0, y0, 100, -ux, -uy, { len: 260, power: 1.2, dz: 0.1, pal: sea ? 'frost' : 'fire', spread: 0.3 });   // 往后也喷一股（视频里火往两边甩）
      F.sonic(x0 + ux * 60, y0 + uy * 60, 100, ux, uy, 0.02, { power: 2.2, vx: ux * 3200, vy: uy * 3200 });
      F.ring(x0, y0, 100, ux, uy, 0, { r: 1100, power: 2.2, dur: 0.42 });
      F.warp(x0, y0, 100, { r: 1500, power: 2.2, dur: 0.75 });
      for (let i = 0; i < 8; i++) {
        const s = (i + 0.6) / 8, d = s * W.len, cx = x0 + ux * d, cy = y0 + uy * d, half = W.w0 + (W.w1 - W.w0) * s, delay = d / 3000;
        if (!sea) {
          F.debris(cx, cy, { n: 9, r: half * 0.7, power: 1.15, dir, spread: 1.5, up: 1.25, delay, size: 1 + s * 0.6 });
          for (const sd of [-1, 1]) F.debris(cx + nx * sd * half * 0.8, cy + ny * sd * half * 0.8, { n: 4, r: 70, power: 0.9, dir: Math.atan2(ny * sd, nx * sd), spread: 0.7, up: 0.9, delay });
        }
        if (i % 2 === 1) F.dust(cx, cy, { r: half * 1.5, power: 1.4, delay, col: sea ? [0.82, 0.9, 0.96] : undefined });
      }
      c.fx({ k: 'hs3hit', x: x0, y: y0 - u.z - 70, anchor: { x: x0, y: y0, offsetY: -u.z }, power: 4, dir: Math.atan2(uy * 0.75, ux), color: '240,240,240' });   // IMPACT: 背后冲击波
      // 远处山头缺一块（地形往下挖几秒再长回来；海上不挖）
      if (!sea) {
        const pk = farPeak(g, u.x, u.y, ux, uy, 1700, 4200);
        const rise = Math.max(0, pk.h - pk.base);
        S.vis.notch = { x: pk.x, y: pk.y, r: 380 + Math.min(420, rise * 0.4), depth: clamp(rise * 0.5 + 160, 180, 900), k: 0, t: 0 };
        try { g.combat.wreck.radial(pk.x, pk.y, 520, 5, u, { shake: false }); } catch { /* */ }
        c.fx({ k: 'hs3peak', x: pk.x, y: pk.y, r: S.vis.notch.r, power: 4 });
      }
      // 取景：他、被轰飞的人、犁开的扇面（海沟）前六成一起框住，几息后交还
      const L1 = 420, hw = W.w0;   // r8-p2：推近以后只框到拳前一小段（视频里镜头留在他身上）
      S.wujiCam = { s: split, tgt: u, t: 2.6, pts: [[u.x - ux * 300, u.y - uy * 300, 0], [x0 + ux * L1 + nx * hw, y0 + uy * L1 + ny * hw, 0], [x0 + ux * L1 - nx * hw, y0 + uy * L1 - ny * hw, 0], [x0 + ux * L1 * 0.5, y0 + uy * L1 * 0.5, 300]] };
      S.say(u, '无极！', '#f2f2f2');
      audio.sfx('boom', x0, y0); audio.sfx('thunder', x0 + ux * W.len, y0 + uy * W.len);
      c.data.at = c.t;
      S.log.push('wuji-hit');
      return true;
    }
    // 收拳：停一下就收（取景交给 wujiCam：框他和犁开的沟，不跟着被轰上天的人拉远）
    return c.t < (c.data.at as number) + 0.35;
  },
  end(c) { const S = S3(c.B); if (S.vis.charge?.e === c.user) S.vis.charge = null; S.monoTo2(0, 0.01, S.vis.keep); },
};

// ------------------------------------------------------------------ 千钧坠
const QIANJUN: SpecialMove = {
  id: 'qianjunzhui', name: '千钧坠', glyph: '坠', color: '255,190,110', realm: 2, mp: 0.25, cd: HS3.qianjun.cd, range: 1100,
  desc: '蓄力纵身直上高空，顿住一瞬——天上一道光柱打下来标出落点——裹着燃烧的气锥一脚踩落：地面整片塌陷成深坑，碎石成片飞起，一圈尘墙往外推，树木放射状倒伏。',
  who: 'both', ai: { weight: 0.7, min: 250, max: 1100 },
  can(B, u) { if (u === null) return true; const g = B.g; return isHs(B, u) && !g.offWorld && !S3(B).trip && S3(B).bigOk(); },
  begin(c) {
    const S = S3(c.B), g = c.B.g, p = g.player, u = userPos(c);
    let q = posOf(c, c.target);
    if (!q) { const d = c.B.aimDir(); q = { x: u.x + d.x * 520, y: u.y + d.y * 520, z: 0 }; }
    if (c.user) { S.useBig(); (c.user as { shell?: boolean }).shell = false; }
    else if (g.isFlying) { p.flying = false; p.zTarget = 0; }   // 御剑也能放：先落下遁光，从此刻的高度起跳
    c.data.tx = q.x; c.data.ty = q.y; c.data.z = c.user ? 0 : Math.max(p.z, c.B.aloftZ); c.data.sx = u.x; c.data.sy = u.y; c.data.landed = 0; c.data.locked = 0;
    act(c, 'hs3Crouch', 0.6);
    const Q = HS3.qianjun;
    S.vis.warns.push({ k: 'ring', x: q.x, y: q.y, x2: q.x, y2: q.y, r: Q.r, t: 0, dur: Q.crouch + Q.rise + Q.hang + Q.dive, fade: 0.2, blue: true });   // 照视频：落点一圈蓝色标记
    face(c, q.x, q.y);
    if (c.user) S.say(c.user, '接住了——', '#ffcf8a');
    audio.sfx('clang');
    S.log.push('qianjun');
  },
  tick(c, dt) {
    const S = S3(c.B), Q = HS3.qianjun, g = c.B.g, F = F3(c), key = c.user ? 'qj-h' : 'qj-p';
    syncUser(c, dt);
    const T1 = Q.crouch, T2 = T1 + Q.rise, T3 = T2 + Q.hang, T4 = T3 + Q.dive;
    const w = S.vis.warns.find((w) => w.k === 'ring');
    // 落点：起跳后一阵还跟着对手，之后定死（给你看清、躲开的时间）
    if (c.t < T1 + Q.lockAt * Q.rise && c.target) { const q = posOf(c, c.target); if (q) { c.data.tx = q.x; c.data.ty = q.y; if (w) { w.x = w.x2 = q.x; w.y = w.y2 = q.y; } } }
    const tx = c.data.tx as number, ty = c.data.ty as number, sx = c.data.sx as number, sy = c.data.sy as number, z0 = c.data.z as number;
    const setZ = (x: number, y: number, z: number) => {
      if (c.user) { c.place(null, x, y, z); return; }
      c.place(null, x, y); S.setAloft(z);
    };
    const keep: (Enemy | 'p')[] = c.target ? [c.user ?? 'p', c.target] : [c.user ?? 'p'];
    // —— 蓄力：沉身、脚下开裂、碎石浮起、空气一阵阵扭
    if (c.t < T1) { act(c, 'hs3Crouch', 0.6); face(c, tx, ty); chargeFx(c, key, c.t / T1, dt, 260); return true; }
    if (c.t < T2) {
      // 起跳：脚下炸坑、往上的音障锥、一圈贴地激波和尘浪、碎石往上崩；一路冲上高空（水平往落点挪一半），身后一串残影
      if (!c.data.leap) {
        c.data.leap = 1;
        try { g.combat.wreck.pit(sx, sy, 120, 3); g.combat.wreck.cracks(sx, sy, 320, 2.4); } catch { /* */ }
        F.sonic(sx, sy, 90, 0, 0, 1, { power: 1.9, vz: 3600 });
        F.ring(sx, sy, 10, 0, 0, 1, { r: 900, power: 1.7 });
        F.debris(sx, sy, { n: 24, r: 150, power: 1.2, up: 1.5 });
        F.dust(sx, sy, { r: 640, power: 1.6 });
        F.blastFloat(key, Math.atan2(ty - sy, tx - sx) + Math.PI, 0.9);
        c.fx({ k: 'hs3leap', x: sx, y: sy, power: 2.2 }); audio.sfx('boom', sx, sy); audio.sfx('whoosh', sx, sy);
        c.shake(0.6);
      }
      const k = 1 - Math.pow(1 - (c.t - T1) / Q.rise, 3);
      const x = sx + (tx - sx) * 0.55 * k, y = sy + (ty - sy) * 0.55 * k, z = z0 + (Q.top - z0) * k;
      const pu = userPos(c);
      if (Math.floor(c.t * 10) !== Math.floor((c.t - dt) * 10)) pushGhost(c, pu.x, pu.y, pu.z, 0, 60, 0.32, '255,226,180');   // 每 0.1 息一个往上拉糊的残影
      setZ(x, y, z);
      act(c, 'hs3Leap', 0.6);
      return true;
    }
    if (c.t < T3) {
      // 高空顿住：天色压暗（只留两人）、背后一圈光；天上一道光柱打下来标出落点
      const k = (c.t - T2) / Q.hang;
      const x = sx + (tx - sx) * (0.55 + 0.1 * k), y = sy + (ty - sy) * (0.55 + 0.1 * k), z = Q.top + 30 * Math.sin(k * Math.PI);
      if (!c.data.apex) {
        // 照视频（强袭重击 17.67 + 炼狱坠星腿 1:57.3）：天上一道红色光柱先打下来定位；空中回身一拳，一圈火环
        c.data.apex = 1;
        F.halo(x, y, Q.top + 100, { r: 320, dur: Q.hang + 0.12 });
        F.column(tx, ty, { h: 4600, r: 75, dur: Q.hang + Q.dive + 0.3, col: [1.7, 0.4, 0.32] });
        F.ring(tx, ty, 8, 0, 0, 1, { r: Q.r * 1.1, power: 1, col: [0.5, 0.75, 1.3], dur: Q.hang });
        F.ring(x, y, Q.top + 110, 0, 1, 0.8, { r: 190, power: 1.3, col: [1.4, 0.45, 0.7], dur: 0.32 });
        F.blast(x, y, 0.9, 'fire', { z: Q.top + 110, r: 120 });
        audio.sfx('chime'); audio.sfx('whoosh', x, y);
        S.log.push('qianjun-apex');
      }
      S.vis.dim = Math.max(S.vis.dim, 0.85 * Math.min(1, k * 4)); S.vis.keep = keep;
      setZ(x, y, z);
      face(c, tx, ty);
      act(c, k < 0.6 ? 'hs3AirPunch' : 'hs3Stomp', 0.6);
      return true;
    }
    if (c.t < T4) {
      // 踩落：一道直线砸下去，空气被压成一个燃烧的锥裹着他
      const k = (c.t - T3) / Q.dive, kk = k * k;
      const ux0 = sx + (tx - sx) * 0.65, uy0 = sy + (ty - sy) * 0.65;
      const x = ux0 + (tx - ux0) * k, y = uy0 + (ty - uy0) * k, z = Q.top * (1 - kk);
      const pu = userPos(c);
      S.vis.streaks.push({ x0: pu.x, y0: pu.y, z0: pu.z + 70, x1: x, y1: y, z1: z + 70, t: 0, dur: 0.25, col: '255,200,120' });   // IMPACT: 超高速追击线
      if (!c.data.dive) { c.data.dive = 1; F.sonic(x, y, z + 30, 0, 0, -1, { power: 2, vz: -5000, col: [1, 0.62, 0.32] }); F.column(tx, ty, { h: Q.top * 1.2, r: 90, dur: 0.4, col: [1.8, 0.8, 0.3] }); }   // 一道火柱贯到地面
      F.fire(key + '-dive', x, y, z, (tx - ux0) / Q.dive, (ty - uy0) / Q.dive, -Q.top * 2 * k / Q.dive - 2000, 1.6);
      if (Math.floor(c.t * 20) !== Math.floor((c.t - dt) * 20)) pushGhost(c, pu.x, pu.y, pu.z, 0, -60, 0.28, '255,200,140');
      S.vis.dim = Math.max(S.vis.dim, 0.55); S.vis.keep = keep;
      setZ(x, y, z);
      act(c, 'hs3Stomp', 0.6);
      return true;
    }
    if (!c.data.landed) {
      c.data.landed = 1;
      setZ(tx, ty, 0);
      if (!c.user) { S.setAloft(0); }
      // 巨坑：放射推倒树、碎石飞、坑边的人震上半空
      const src = c.user ?? 'p';
      let res: ReturnType<typeof g.combat.wreck.radial> | null = null;
      try { res = g.combat.wreck.radial(tx, ty, Q.r, Q.power, src); } catch { /* */ }
      const hits = new Set<Enemy | 'p'>();
      for (const h of res?.units ?? []) { if (h.player) { if (c.user) hits.add('p'); } else if (h.e && h.e !== c.user && !(h.ally && !c.user)) hits.add(h.e); }
      // 落点正中的对手（radial 的单位清单不含出招的人；目标若在圈里一定算上）
      if (c.target) { const q = posOf(c, c.target); if (q && Math.hypot(q.x - tx, q.y - ty) < Q.r * 0.9) hits.add(c.target); }
      for (const who of hits) {
        const q = posOf(c, who)!, d = Math.hypot(q.x - tx, q.y - ty), k = 1 - Math.min(1, d / Q.r) * 0.6;
        S.strike(c, who, Q.frac * k, 5.5 * k, 'qianjun');
        const ux = q.x - tx, uy = q.y - ty;
        if (who === 'p') c.launch('p', ux || 1, uy, 380 + 300 * k, 900);
        else { c.launch(who, ux || 1, uy, 500 + 700 * k, 1000 * k + 300); who.hitFlash = Math.max(who.hitFlash, 0.1); }
      }
      // 终结技全屏演出（「墜」+ 踩落定格特写）；地面整片塌陷、碎石成片飞起、一圈立体尘墙往外推、地浪、扭曲冲击波、焦痕
      S.finisher('墜', keep);
      S.cutin('stomp');
      F.dent(tx, ty, Q.dentR, Q.dentD, Q.dentHold);
      F.ripple(tx, ty, { amp: 30, speed: 2600, reach: 3600 });
      F.blast(tx, ty, 2.6, 'fire', { z: 40, r: 170 });   // r9：推近之后原来那一下整屏白了一息多——收到占画面半屏上下   // r8-p2：终结技那一档（白黄火球 + 光刺），大小按推近的镜头定
      F.jet(tx, ty, 30, 0, 0, { dz: 1, len: 520, power: 2.2, spread: 0.35 });   // 火往上喷（视频 1:37 落地爆：火焰往上冲）
      F.impact(tx, ty, 40, 0, 0, { dz: -1, power: 2.6, warp: 0 });
      F.warp(tx, ty, 80, { r: 1100, power: 2, dur: 0.7 });
      F.ring(tx, ty, 12, 0, 0, 1, { r: 1300, power: 1.8, dur: 0.55 });
      F.dust(tx, ty, { r: 1600, power: 3 });
      F.debris(tx, ty, { n: 60, r: 420, power: 1.7, up: 1.35, size: 0.65, hot: true });   // r8-p2：小一号、红褐（推近的镜头里原来的石块像一堆灰色大多面体）
      F.debris(tx, ty, { n: 26, r: 700, power: 1.1, up: 0.9, delay: 0.07, size: 0.7 });
      F.scorch(tx, ty, 600, { dur: 9 });
      c.fx({ k: 'hs3stomp', x: tx, y: ty, r: Q.r, power: 5 });
      c.shake(1.4); c.cam(1.3); c.freeze(0.1);
      g.slowmo(0.14); g.aberrKick = Math.max(g.aberrKick, 0.9);
      audio.sfx('boom', tx, ty); audio.sfx('thunder', tx, ty);
      c.data.at = c.t; c.data.trees = res?.trees ?? 0;
      S.log.push('qianjun-hit');
      return true;
    }
    // 照视频：踩落之后他浑身燃火站起
    { const u = userPos(c), k = 1 - (c.t - (c.data.at as number)) / 0.8; F.fire(key + '-burn', u.x, u.y, 30, 0, 0, -420, 0.35 + 0.5 * Math.max(0, k), 0.5); }
    act(c, c.t - (c.data.at as number) < 0.35 ? 'hs3Crouch' : 'idle', 0.4);
    return c.t < (c.data.at as number) + 0.8;
  },
  end(c) { if (!c.user) { const B = c.B as unknown as { aloft: unknown; playerLift: number }; if (B.aloft) { B.aloft = null; B.playerLift = 0; } } },
};

export const MOVES_HS3: Record<Hs3Id, SpecialMove> = { pojie: POJIE, huanjie: HUANJIE, jiexing: JIEXING, wuji: WUJI, qianjunzhui: QIANJUN };

let registered = false;
/**
 * 注册这一批（hanshan.ts 的构造里调一次）：招式挂进近战的特殊招式表（技能栏 id 为 bxm_ + id），
 * 他的 perform(id) 也能直接出；近战的脱困键、虚空的通道、他每帧的那一份都接上钩子。
 */
export function registerHsBatch3(game: Game, H?: Hanshan) {
  if (!registered) { registered = true; for (const m of Object.values(MOVES_HS3)) registerMove(m); }
  const hs = H ?? game.hanshan;
  const S = hs3Of(game);
  for (const id of HS3_IDS) {
    hs.registerMove(id, (tg) => {
      const e = hs.ent; if (!e) return false;
      const B = game.combat.brawl;
      // 一脚还界 / 借星单拿出来：都是虚空里的事——在界内就从破界打起（破界 → 还界，借星在中间）
      const def = id === 'huanjie' || (id === 'jiexing' && !game.xukong.fight.on) ? POJIE : MOVES_HS3[id];
      S.forcing = true;
      try { return startMove(B, def, e, tg ?? 'p'); } finally { S.forcing = false; }
    });
  }
  // 近战在 Game 的构造里才建（比他晚）：脱困键的钩子第一帧再挂
  const esc = () => S.onDodge();
  hs.hold = (dt) => { const B = game.combat.brawl; if (B.escape !== esc) B.escape = esc; S.liftTick(dt); return S.tick(dt); };
}
