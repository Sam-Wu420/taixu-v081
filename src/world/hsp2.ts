// r8-p2 撼山客 · 岳千钧 第二阶段：赤阳罡（解放演出 + 燃身）、五招火焰腿法、两个觉醒大招，照参考视频（DNF 男散打）逐帧还原。
// 规格：docs/撼山客-参考视频动作分解.md 第三、四、五节。姿势（关键帧表）在 gfx/character.ts 末尾的 p2Pose；立体特效走 world/fx3d.ts；
// 整屏压暗 / 压黑 / 变色走后期（gl/stage.ts 的 uMono / uMonoC，经 gl/hsmoves3gl.ts 的 hs3Post 交过去）；书法大字、横贯光线、横向速度线在 ui/P2Show.tsx。
//
//   · 赤阳罡：切磋 / 惹怒里他气血掉到一半，或者你撑过 25 息后他喝完一口酒，放一次「解放」（胸前光核 → 整屏压成暗紫红、他全身赤红 →
//     一人多高的火里往前走 → 白闪 + 前方火海、冲到你身后），之后进燃身：立体的火贴着他一直往上蹿、身后一圈亮边；连招表换成第二阶段的招，
//     伤害、速度略高。切磋里撑到这里算「逼出了他的真本事」，切磋收场后多教三样：赤焰回旋腿、炎阳炮拳、赤阳罡（撞山靠是第一阶段那条线做的，有就一起教）。
//   · 五招：赤焰回旋腿 p2xuan、燕旋 p2yan、碎心踢 p2sui、坠火踢 p2zhui、炎阳炮拳 p2pao（和无极一击同一个动作模板：短、小，普通招）。
//   · 觉醒大招：霸皇蹴 p2bahuang、逐日 p2zhuri——只在第二阶段出，和无极一击、一拳破界合用「两分钟两次」的名额（hsmoves3 的 bigOk / useBig）。
//   · 玩家学会的：赤焰回旋腿、炎阳炮拳、赤阳罡（技能栏里开燃身：耗灵力，燃 18 息；燃着时这两招多三成伤害）。
//
// 每招自己一份钟（c.data.T）：命中顿帧时钟停住、姿势也停住（姿势时刻 = 这份钟，st.actionT 每帧由这里写）；帧时照抄视频（游戏 1 秒 = 视频 1 秒）。
// 规矩：伤害一律走 MoveCtx.hit（hitEnemy / hitPlayer / npcHit，经 hsmoves3 的 strike）；这一路上一个 Math.random 都不取；不新增默认按键。
import type { Game } from './game';
import type { Enemy } from './combat';
import type { Hanshan } from './hanshan';
import { registerMove, learnMove, MOVES, type SpecialMove, type MoveCtx } from './brawlmoves';
import { startMove } from './brawlmoverun';
import { hs3Of, dashGo, dashStep, dashEnd, heavyHit, pushGhost, type Dash } from './hsmoves3';
import { fx3dOf, type RGB3 } from './fx3d';
import { audio, type P2Sfx } from './audio';
import { keyStrike, type Action } from '../gfx/character';
import { sideSpot, kput, screenRight, snapClothOf } from './hsmovesp1';
import { p1 } from './p1fx';
import { HS3_IDS } from './hsmoves3';

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (k: number) => { const t = clamp(k, 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ 可调的数
export const P2 = {
  /** 进第二阶段：气血掉到几成；喝酒那一下要你从他还手起撑过多少息才算 */
  trigHp: 0.5, drinkHeld: 25,
  /** 第二阶段他的招伤害乘多少、走得多快 */
  fracK: 1.15, speed: 250,
  /** 玩家的赤阳罡：燃多久、燃着时回旋腿 / 炮拳伤害乘多少 */
  burn: 18, burnK: 1.3,
} as const;
/** 第二阶段的招（技能栏 id 是 bxm_ + id） */
export const P2_IDS = ['p2xuan', 'p2yan', 'p2sui', 'p2zhui', 'p2pao', 'p2bahuang', 'p2zhuri', 'p2jie', 'p2gang'] as const;
export type P2Id = typeof P2_IDS[number];
/** 撑到第二阶段后多教的（撞山靠由第一阶段那条线做，名字对上就一起教） */
export const P2_TEACH = ['p2xuan', 'p2pao', 'p2gang'] as const;

/** 界面那一层的事件（ui/P2Show.tsx 订阅）：书法大字从左 / 右砸进来、横贯全屏的光线、横向速度线 */
export interface P2Ui { id: number; k: 'word' | 'beam' | 'lines' | 'img'; word?: string; side?: 'l' | 'r'; dur: number; col?: string; /** r17：k = 'img' 时放的那张首领贴图（gfx/ywsTexData.ts 的帧名，如 yws_m_aw2_face）——全屏半透明特写 + 竖条光幕 */ img?: string; /** r19：实的特写（半身像不透明、不叠色，光幕压得更实，入场一顿再上漂淡出） */ solid?: boolean }

/** 一局里第二阶段的状态（挂在 Game 上） */
export class HsP2 {
  /** 他进了第二阶段（燃身，连招表换了） */
  on = false;
  /** 这一场切磋逼出过第二阶段（收场时多教几招） */
  reached = false;
  /** 正在放解放 */
  releasing = false;
  /** 试玩入口：强行出招（不看阶段、不看大招名额） */
  force = false;
  /** 玩家的赤阳罡还剩几息 */
  playerBurnT = 0;
  /** 后期：压暗、压黑、整屏变色（几成）、哪几个人留着；每帧往 0 退（招式在要的那几帧里每帧写） */
  readonly vis = { dim: 0, black: 0, wash: [0, 0, 0, 0] as [number, number, number, number], keep: [] as (Enemy | 'p')[], fxKeep: 0 };   // r19 fxKeep：压暗、压黑只压场景、不压特效（夜无赦用：暗底上的光刃、光柱不被一起压掉）
  ui: P2Ui[] = [];
  private uiId = 0;
  readonly listeners = new Set<() => void>();
  log: string[] = [];
  private drinkWas = false; private modeWas = 'calm';
  constructor(readonly g: Game) {}
  get H(): Hanshan { return this.g.hanshan; }

  /** 界面事件（大字、光线、速度线） */
  show(ev: Omit<P2Ui, 'id'>) { const e = { ...ev, id: ++this.uiId }; this.ui.push(e); if (this.ui.length > 8) this.ui.shift(); this.log.push('ui-' + ev.k + (ev.word ?? '')); for (const f of this.listeners) { try { f(); } catch { /* 界面出错不拖垮战斗 */ } } }
  /** 招式在某几帧要的整屏效果（取大的那一个） */
  scr(o: { dim?: number; black?: number; wash?: [number, number, number, number]; keep?: (Enemy | 'p')[]; fxKeep?: boolean }) {
    const V = this.vis;
    if (o.fxKeep) V.fxKeep = 1;
    if (o.dim !== undefined) V.dim = Math.max(V.dim, o.dim);
    if (o.black !== undefined) V.black = Math.max(V.black, o.black);
    if (o.wash && o.wash[3] >= V.wash[3] - 0.02) V.wash = [...o.wash] as [number, number, number, number];
    if (o.keep) V.keep = o.keep;
  }
  /** 进第二阶段（解放演出里身上起火的那一刻） */
  ignite() {
    if (this.on) return;
    this.on = true; this.reached = this.H?.mode === 'spar' || this.reached; this.log.push('on');
    const e = this.H?.ent; if (e) audio.p2('p2_ignite', e.x, e.y);
  }
  /** 回到第一阶段（打完、收手） */
  douse() { if (!this.on) return; this.on = false; this.log.push('off'); }

  /** 每帧（hanshan.hold 的钩子里，世界在跑时） */
  private wsRef: unknown = null;
  /** r9：燃身时第一阶段的招伤害同第二阶段 ×1.15、p1fx 读 burnOf 给命中加火爆——挂到近战上（近战比撼山客晚建，每帧看一眼、没挂就挂） */
  hook() {
    const B = this.g.combat?.brawl; if (!B || B.burnOf) return;
    B.moveHitK = (run) => (this.on && !!run.user && run.user === this.H?.ent && !isP2Move(run.def.id) ? P2.fracK : 1);
    B.burnOf = (u) => this.on && !!u && u === this.H?.ent;
  }
  tick(dt: number) {
    this.hook();
    if (this.g.ws !== this.wsRef) { if (this.wsRef) this.reset(); this.wsRef = this.g.ws; }
    const V = this.vis;
    V.dim = Math.max(0, V.dim - dt * 3); V.black = Math.max(0, V.black - dt * 3.2); V.wash[3] = Math.max(0, V.wash[3] - dt * 4);
    if (V.dim <= 0 && V.black <= 0 && V.wash[3] <= 0) { V.keep = []; V.fxKeep = 0; }
    const H = this.H, e = H?.ent, F = fx3dOf(this.g);
    // 玩家的赤阳罡
    if (this.playerBurnT > 0) { this.playerBurnT = Math.max(0, this.playerBurnT - dt); const p = this.g.player; F.aura('p2-p', p.x, p.y, p.z + this.g.combat.brawl.playerLift, 0.9 + 0.3 * Math.min(1, this.playerBurnT)); }
    if (!e || e.dead) { this.drinkWas = false; return; }
    // 他燃着：贴身的火、走得快
    if (this.on) {
      F.aura('p2-hs', e.x, e.y, e.z, 1.1);
      if (H.mode === 'spar' || H.mode === 'angry') e.speed = Math.max(e.speed, P2.speed);
      // r9：燃身时放第一阶段的招（缩地、一寸崩……），踢出去 / 打出去那一下拳脚拖一道火尾
      const r = this.g.combat.brawl.peek(e)?.move;
      if (r && !isP2Move(r.def.id) && e.cs) {
        const k = keyStrike(e.cs);
        if (k) {
          const yaw = e.cs.yaw, fx = Math.sin(yaw), fy = Math.cos(yaw);   // 人朝向（世界）
          for (const lb of k.limbs) {
            const leg = lb[1] === 'L', reach = leg ? 85 + 25 * Math.min(1, k.hip / 1.6) : 75, z = leg ? 25 + 105 * Math.sin(Math.min(Math.PI / 2, Math.max(0, k.hip))) : 112;
            F.fire('p1b-' + lb, e.x + fx * reach, e.y + fy * reach, e.z + z - 60, fx * 1500, fy * 1500, leg ? 300 : 0, 1.1, leg ? 0.5 : 0.38);
          }
        }
      }
    }
    // 收手了（切磋收场 / 回到平时）：熄火；切磋里逼出过第二阶段就多教几招
    if (H.mode === 'calm' && this.modeWas !== 'calm') { if (this.reached && this.modeWas === 'spar') this.teach(); this.douse(); this.reached = false; }
    this.modeWas = H.mode;
    // 进第二阶段：气血掉到一半，或撑过 25 息后他喝完一口酒
    const drinking = e.cs?.action === 'drink';
    const sp = H.spar, held = sp && sp.counterAt >= 0 ? this.g.time - sp.counterAt : 0;
    const drankOff = this.drinkWas && !drinking && H.mode === 'spar' && held >= P2.drinkHeld;
    this.drinkWas = drinking;
    if (!this.on && !this.releasing && (H.mode === 'spar' ? sp && sp.counterAt >= 0 : H.mode === 'angry') && (e.hp <= e.maxHp * P2.trigHp + 1 || drankOff) && !this.g.combat.brawl.peek(e)?.move) {
      this.releasing = true; this.log.push(drankOff ? 'trig-drink' : 'trig-hp');
      const ok = startMove(this.g.combat.brawl, MOVES_P2.p2jie, e, 'p');
      if (!ok) { this.releasing = false; this.ignite(); }
    }
  }
  /** 撑到第二阶段：多教赤焰回旋腿、炎阳炮拳、赤阳罡（还有撞山靠，若已做出来） */
  teach(): string[] {
    const h = this.g.hero, got: string[] = [];
    const ids: string[] = [...P2_TEACH];
    for (const m of MOVES.values()) if (m.name === '撞山靠' && !ids.includes(m.id)) ids.unshift(m.id);
    for (const id of ids) { const had = h.arts.some((a) => a.id === 'bxm_' + id); if (learnMove(h, id) && !had) got.push(MOVES.get(id)!.name); }
    if (got.length) {
      this.g.news(`逼出了撼山客的真本事（赤阳罡）。他手把手传了${got.map((n) => '「' + n + '」').join('、')}。`, 'personal');
      this.g.toast(`你学会了${got.map((n) => '「' + n + '」').join('、')}——法术书里多了这几门，可以拖进技能栏。`, 'good');
    }
    this.log.push('teach-' + got.length);
    return got;
  }
  reset() { this.on = false; this.reached = false; this.releasing = false; this.playerBurnT = 0; this.vis.dim = this.vis.black = 0; this.vis.wash = [0, 0, 0, 0]; this.vis.keep = []; this.vis.fxKeep = 0; this.ui = []; this.drinkWas = false; this.modeWas = 'calm'; }
}

/** r9：觉醒大招、终结技这几招放的时候界面收起来（任务列、技能栏、小地图、右下按钮圈、小牌淡出；血条留着） */
export const CINE_MOVES = new Set(['p2bahuang', 'p2zhuri', 'p2jie', 'wuji', 'qianjunzhui', 'pojie', 'huanjie', 'jiexing',
  'yws_ruti', 'yws_jiangshen', 'yws_shixian', 'yws_moyi', 'yws_mochao']);   // r16：夜无赦的两次变身、两个觉醒大招、极恶魔潮
/** r9：此刻是不是在演大招（ui/P2Show.tsx 每 0.1 息问一次，切 .game-root 的 hs-cine） */
export function hsCine(g: Game): boolean {
  { const y = (g as Game & { yewushe?: { ent: Enemy | null } }).yewushe?.ent; if (y && !y.dead) for (const r of g.combat.brawl.runs) if (r.user === y && !r.done && CINE_MOVES.has(r.def.id)) return true; }   // r16：夜无赦的大招
  const e = g.hanshan?.ent; if (!e || e.dead) return false;
  if (hs3Of(g).trip) return true;
  for (const r of g.combat.brawl.runs) if (r.user === e && !r.done && CINE_MOVES.has(r.def.id)) return true;
  return false;
}

/** 第二阶段自己的招、第三批（大招）——这些伤害、火由自己管，燃身加成和拳脚火尾不再叠 */
const isP2Move = (id: string) => (P2_IDS as readonly string[]).includes(id) || (HS3_IDS as readonly string[]).includes(id);

const STATE = new WeakMap<Game, HsP2>();
export function hsp2Of(g: Game): HsP2 { let s = STATE.get(g); if (!s) { s = new HsP2(g); STATE.set(g, s); } return s; }
/** 画面用：这一局有没有（没有就不画） */
export function hsp2Peek(g: Game): HsP2 | undefined { return STATE.get(g); }

// ==================================================================== 招式的小工具
const P2S = (B: MoveCtx['B']) => hsp2Of(B.g);
const isHs = (B: MoveCtx['B'], u: Enemy | null) => !!u && u === B.g.hanshan?.ent;
const posOf = (c: MoveCtx, who: Enemy | 'p' | null) => { const p = c.B.g.player; return who === 'p' ? { x: p.x, y: p.y, z: p.z + c.B.playerLift } : who ? { x: who.x, y: who.y, z: who.z } : null; };
const userPos = (c: MoveCtx) => { const p = c.B.g.player; return c.user ? { x: c.user.x, y: c.user.y, z: c.user.z } : { x: p.x, y: p.y, z: p.z + c.B.playerLift }; };
interface D2 { T: number; hold: number; ux: number; uy: number; [k: string]: unknown }
/** 招式自己的钟：命中顿帧（hold）时停住 */
function clock(c: MoveCtx, dt: number): number { const d = c.data as D2; if (d.hold > 0) d.hold -= dt; else d.T += dt; return d.T; }
const D = (c: MoveCtx) => c.data as D2;
/** 到了 t 这一刻（只返回一次） */
function at(c: MoveCtx, k: string, t: number): boolean { const d = c.data as D2; if (d.T >= t && !d[k]) { d[k] = 1; return true; } return false; }
/** 起手：方向、钟 */
function init(c: MoveCtx, side = false) {
  const d = c.data as D2; d.T = 0; d.hold = 0;
  // r9：侧面近景——他放第二阶段的招前，两人要是在画面上竖着（一前一后）就先一记闪步挪到对手的左边或右边（画面横向），和第一阶段一样「两人横着对打」
  if (side && c.user && isHs(c.B, c.user) && c.target) {
    const a = userPos(c), t = posOf(c, c.target)!, dx = a.x - t.x, dy = a.y - t.y, L = Math.hypot(dx, dy);
    const r = screenRight(c.B), along = L > 1 ? Math.abs(dx * r.x + dy * r.y) / L : 1;
    if (L > 1 && along < 0.8) {
      const q = sideSpot(c, c.target, clamp(L, 160, 460));
      if (Math.hypot(q.x - a.x, q.y - a.y) > 40) { kput(c, c.user, q.x, q.y); p1(c.B).dash(c.user, a, { x: q.x, y: q.y, z: 0 }, { n: 2, col: '255,170,110', ghost: '255,200,160' }); }
    }
  }
  const u = userPos(c), q = posOf(c, c.target);
  if (q) { const dx = q.x - u.x, dy = q.y - u.y, L = Math.hypot(dx, dy); d.ux = L > 1 ? dx / L : c.dirX; d.uy = L > 1 ? dy / L : c.dirY; } else { d.ux = c.dirX; d.uy = c.dirY; }
  // r9：不再起手先放倒一片树——挡在镜头和两人之间的树、房由画面那边渐隐（render.ts 的 occFadeOf，只在取景期间）
}
/** 摆这一招的姿势：动作不对就换上（卡帧：过渡很短），姿势时刻 = 招式自己的钟 */
function pose(c: MoveCtx, a: Action, t: number, dur = 4) {
  if (c.user) { const cs = c.user.cs; if (!cs) return; if (cs.action !== a) { cs.restart(a); cs.blend = 0.65; } cs.actionT = t; return; }
  const st = c.B.g.player.st;
  if (st.action !== a) { (c.B as unknown as { playAct(a: Action, d: number): void }).playAct(a, dur); st.blend = 0.65; }
  st.actionT = t;
}
/** 朝着 (dx, dy) 方向（立刻转过去：旋身时一帧转好几十度） */
function faceDir(c: MoveCtx, dx: number, dy: number, snap = false) {
  if (Math.abs(dx) + Math.abs(dy) < 1e-4) return;
  const cs = c.user ? c.user.cs : c.B.g.player.st; if (!cs) return;
  cs.faceToward(dx, dy, false); if (snap) cs.yaw = cs.targetYaw;
  if (c.user) c.user.facing = dx >= 0 ? 1 : -1;
}
/** 他身上的 cs（shell 时没人推它） */
const syncUser = (c: MoveCtx, dt: number) => { if (c.user) { const e = c.user; if (e.cs) { e.cs.x = e.x; e.cs.y = e.y; e.cs.lift = e.flyH + e.lift; if ((e as { shell?: boolean }).shell) e.cs.update(dt); } } };
/** 挪到 (x, y)，离地 z（你出招时离地由近战管） */
function put(c: MoveCtx, x: number, y: number, z = 0) {
  const u = userPos(c); if (Math.hypot(x - u.x, y - u.y) > 30) snapClothOf((c.user ? c.user.cs : c.B.g.player.st) as never);   // r9：一下子挪出一大截，衣带直接贴过去
  if (c.user) c.place(null, x, y, z); else c.place(null, x, y);
}
/** 对手在不在 (x, y) 的 r 以内 */
function near(c: MoveCtx, x: number, y: number, r: number): boolean { const q = posOf(c, c.target); return !!q && Math.hypot(q.x - x, q.y - y) < r && (c.target !== 'p' || (c.B.pSubT <= 0 && !c.B.g.hero.dead)); }
/** 打一下：frac 按对手气血（他出手）/ pk 按攻力（你出手）；命中方向性特效、顿帧（两人一起停 stop 息，招式的钟也停） */
function strike(c: MoveCtx, frac: number, pk: number, kind: string, o: { power?: number; stop?: number; uz?: number; ux?: number; uy?: number; sfx?: P2Sfx | null } = {}): boolean {
  const tg = c.target; if (!tg) return false;
  const S3 = hs3Of(c.B.g), d = D(c);
  const k = c.user ? (isHs(c.B, c.user) && P2S(c.B).on ? P2.fracK : 1) : (P2S(c.B).playerBurnT > 0 ? P2.burnK : 1);
  const ok = S3.strike(c, tg, frac * k, pk * k, kind);
  heavyHit(c, tg, o.ux ?? d.ux, o.uy ?? d.uy, o.uz ?? 0, o.power ?? 1.2);
  const q = posOf(c, tg); if (q && o.sfx !== null) audio.p2(o.sfx ?? 'p2_kick', q.x, q.y);
  const stop = o.stop ?? 0.07; if (stop > 0) { c.freeze(stop); d.hold = Math.max(d.hold, stop); }
  P2S(c.B).log.push('hit-' + kind);
  return ok;
}
/** 整屏效果（只对他出招时：你学会的版本不压整屏） */
const scr = (c: MoveCtx, o: Parameters<HsP2['scr']>[0]) => { if (c.user) P2S(c.B).scr({ keep: [c.user, ...(c.target ? [c.target] : [])], ...o }); };
const white = (c: MoveCtx, f = 2) => { const I = c.B.impact; I.whiteF = Math.max(I.whiteF, f + 1); };
/** 招式开头：他喊一声、记一笔 */
function say(c: MoveCtx, s: string, col = '#ffb070') { if (c.user) hs3Of(c.B.g).say(c.user, s, col); }
const F3 = (c: MoveCtx) => fx3dOf(c.B.g);
/** r9：赤焰回旋腿的火环——视频里是白芯、橙黄、红边的火（粉只在弧的头上一抹），原来整圈粉白在亮草地上是一圈粉色的纸带 */
const XFIRE: RGB3 = [1.55, 0.62, 0.42];
const PINK: RGB3 = [1.35, 0.75, 1.15], FIREC: RGB3 = [1.9, 0.75, 0.3], PURP: RGB3 = [1.2, 0.5, 1.6], CYAN: RGB3 = [0.5, 1.1, 1.6];
/** 他的境界和名额：他专属、在第二阶段（觉醒大招再看名额） */
const hsCan = (B: MoveCtx['B'], u: Enemy | null, big = false) => isHs(B, u) && !B.g.offWorld && !hs3Of(B.g).trip && (P2S(B).on || hs3Of(B.g).forcing) && (!big || hs3Of(B.g).bigOk());

// ==================================================================== 赤焰回旋腿（炽焰旋风腿，视频 27.3–30.7）
const XUAN: SpecialMove = {
  id: 'p2xuan', name: '赤焰回旋腿', glyph: '旋', color: '255,120,150', realm: 2, mp: 0.12, cd: 9, range: 420,
  desc: '背身一沉，低身横扫甩出一道粉白的火弧，原地旋身两圈卷起火环；再往前连踢三脚，最后单腿高抬一脚，火柱从脚下冲天。（撼山客的赤阳罡腿法）',
  who: 'both', ai: { weight: 0.8, max: 360 },
  can(B, u) { return u === null || hsCan(B, u); },
  begin(c) { init(c, true); say(c, '着！'); P2S(c.B).log.push('xuan'); },
  tick(c, dt) {
    const T = clock(c, dt), d = D(c), F = F3(c), u = userPos(c), ux = d.ux, uy = d.uy, nx = -uy, ny = ux;
    syncUser(c, dt);
    pose(c, 'p2Xuan', T);
    // 第一段：背身、旋身两圈（0.08–0.95 转两整圈），之后面朝对手
    if (T > 0.08 && T < 0.95) { const a = Math.atan2(uy, ux) + Math.PI + (T - 0.08) / 0.87 * TAU * 2; faceDir(c, Math.cos(a), Math.sin(a), true); }
    else { const q = posOf(c, c.target); if (q && T > 1.2) { const dx = q.x - u.x, dy = q.y - u.y, L = Math.hypot(dx, dy); if (L > 40) { d.ux = dx / L; d.uy = dy / L; } } faceDir(c, d.ux, d.uy, T < 1.2); }
    if (at(c, 'a1', 0.2)) { F.arc(u.x, u.y, 45, { e1: [ux, uy, 0], a0: -1.4, sweep: 2.9, r: 175, w: 80, dur: 0.42, sweepT: 0.11, tail: 2.2, mode: 'fire', col: PINK, power: 1.4 }); audio.p2('p2_flame', u.x, u.y); }
    if (at(c, 'a2', 0.37)) { F.arc(u.x, u.y, 30, { sweep: TAU, r: 120, w: 42, dur: 0.32, sweepT: 0.02, tail: 0.01, spin: 11, mode: 'fire', col: XFIRE }); if (near(c, u.x, u.y, 260)) strike(c, 0.02, 0.8, 'p2xuan', { power: 0.8, stop: 0.04, sfx: 'p2_flame' }); }
    if (at(c, 'a3', 0.53)) { F.arc(u.x, u.y, 30, { sweep: TAU, r: 165, w: 48, dur: 0.34, sweepT: 0.02, tail: 0.01, spin: -12, mode: 'fire', col: XFIRE, power: 1.3 }); F.ring(u.x, u.y, 8, 0, 0, 1, { r: 420, power: 1, col: [1.4, 0.6, 0.9], dur: 0.3 }); if (near(c, u.x, u.y, 300)) strike(c, 0.02, 0.8, 'p2xuan', { power: 0.9, stop: 0.04, sfx: null }); }
    if (at(c, 'a4', 0.72)) F.arc(u.x, u.y, 50, { e1: [ux, uy, 0], a0: 0.3, sweep: 1.4, r: 120, w: 40, dur: 0.25, sweepT: 0.1, mode: 'fire', col: PINK });
    if (at(c, 'a5', 0.87)) { F.arc(u.x, u.y, 25, { sweep: TAU, r: 105, w: 34, dur: 0.25, sweepT: 0.02, tail: 0.01, spin: 14, mode: 'fire', col: XFIRE }); audio.p2('p2_flame', u.x, u.y); }
    // 往前一脚（脚上带火）
    if (T > 0.95 && T < 1.15) { const k = (T - 0.95) / 0.2; if (!d.x0) { d.x0 = u.x; d.y0 = u.y; } put(c, (d.x0 as number) + ux * 90 * smooth(k), (d.y0 as number) + uy * 90 * smooth(k)); F.fire('xuan-f', u.x + ux * 70, u.y + uy * 70, u.z + 70, ux * 1600, uy * 1600, 0, 0.9, 0.3); }
    if (at(c, 'k0', 1.05) && near(c, u.x + ux * 120, u.y + uy * 120, 200)) strike(c, 0.02, 1, 'p2xuan', { power: 1 });
    // 第二段：贴上去连踢
    if (T > 1.4 && T < 1.62) { const q = posOf(c, c.target); if (q) { if (d.sx === undefined) { d.sx = u.x; d.sy = u.y; } const gx = q.x - d.ux * 115, gy = q.y - d.uy * 115, k = smooth((T - 1.4) / 0.22); put(c, (d.sx as number) + (gx - (d.sx as number)) * k, (d.sy as number) + (gy - (d.sy as number)) * k); } }
    const legFire = (T > 1.62 && T < 1.8) || (T > 1.82 && T < 1.98) || (T > 2.12 && T < 2.45) || (T > 2.62 && T < 2.95);
    if (legFire) F.fire('xuan-f', u.x + d.ux * 80, u.y + d.uy * 80, u.z + (T > 2.1 ? 150 : 90), d.ux * 1800, d.uy * 1800, T > 2.6 ? 900 : 200, 1.1, 0.35);
    const z = T > 1.8 && T < 2.05 ? 45 * Math.sin(Math.PI * (T - 1.8) / 0.25) : T > 2.62 && T < 3.05 ? 70 * Math.sin(Math.PI * (T - 2.62) / 0.43) : 0;
    if (c.user) put(c, u.x, u.y, z);
    const hitAt = (k: string, t: number, frac: number, p: number, blast: number) => {
      if (!at(c, k, t)) return;
      const q = posOf(c, c.target), fx = u.x + d.ux * 120, fy = u.y + d.uy * 120;
      // r9：火爆炸在脚和人接触的那一侧（往他这边挪、收小），不再整团罩住对手的上身
      if (q && near(c, fx, fy, 230)) { strike(c, frac, 1.1, 'p2xuan', { power: p }); F.blast(q.x - d.ux * 45, q.y - d.uy * 45, blast * 0.8, 'fire', { z: q.z + (T > 2.1 ? 120 : 80), r: 50 }); }
      else F.blast(fx, fy, blast * 0.7, 'fire', { z: 90, r: 70 });
    };
    hitAt('k1', 1.72, 0.025, 1.2, 1.2);
    if (at(c, 'k2s', 1.86)) audio.p2('p2_flame', u.x, u.y);
    hitAt('k2', 1.9, 0.02, 1.1, 1);
    hitAt('k3', 2.22, 0.03, 1.4, 1.4);
    // 单腿高抬一脚：整屏偏白一帧、火柱从脚下冲天、对手被掀上天
    if (at(c, 'k4', 2.72)) {
      const fx = u.x + d.ux * 70, fy = u.y + d.uy * 70;
      white(c, 1);
      F.blast(fx, fy, 1.7, 'fire', { z: 40, r: 120 });
      F.jet(fx, fy, 30, 0, 0, { dz: 1, len: 780, power: 1.5, spread: 0.13 });
      F.column(fx, fy, { h: 1700, r: 30, dur: 0.55, col: [1.7, 0.6, 0.22] });
      F.inferno(fx, fy, { r: 50, dur: 0.5, power: 0.5, up: 10 });   // r9：火柱外面裹一层往上翻的火舌（不再是一根白管子把人盖住）
      F.flare(fx, fy, 160, { r: 150, dur: 0.3, mode: 'star', col: [1.3, 0.9, 1.2] });
      audio.p2('p2_pillar', fx, fy); audio.p2('p2_blast', fx, fy);
      if (near(c, fx, fy, 260)) { strike(c, 0.04, 2, 'p2xuan', { power: 1.8, uz: 1, stop: 0.09, sfx: null }); if (c.target) c.launch(c.target, d.ux, d.uy, 260, 1500); }
      c.shake(0.8); c.cam(0.8);
    }
    if (at(c, 'k5', 2.9)) F.jet(u.x + d.ux * 70, u.y + d.uy * 70, 200, 0, 0, { dz: 1, len: 300, power: 0.8, spread: 0.6, pal: 'void' });   // 火柱散成紫红火星往上飘
    return T < 3.3;
  },
};

// ==================================================================== 燕旋（飞燕旋风，视频 81.0–82.0）
const YAN: SpecialMove = {
  id: 'p2yan', name: '燕旋', glyph: '燕', color: '255,170,120', cd: 10, range: 620,
  desc: '一冲到跟前原地高速旋身，横躺的飓风环把人卷进去连打，环往前一撞炸开，把人炸上天。',
  who: 'npc', ai: { weight: 0.7, min: 150, max: 560 },
  can(B, u) { return hsCan(B, u); },
  begin(c) { init(c, true); const u = userPos(c); D(c).sx = u.x; D(c).sy = u.y; P2S(c.B).log.push('yan'); },
  tick(c, dt) {
    const T = clock(c, dt), d = D(c), F = F3(c), u = userPos(c);
    syncUser(c, dt);
    pose(c, 'p2Yan', T);
    const q = posOf(c, c.target);
    // 冲刺（0–0.17）→ 带着旋风往前顶（0.17–0.45）
    if (T < 0.45 && q) {
      const go = clamp(Math.hypot(q.x - (d.sx as number), q.y - (d.sy as number)) - 120, 0, 520), k = T < 0.17 ? 0.75 * smooth(T / 0.17) : 0.75 + 0.25 * smooth((T - 0.17) / 0.28);
      put(c, (d.sx as number) + d.ux * go * k, (d.sy as number) + d.uy * go * k);
    }
    if (at(c, 'dash', 0.01)) { F.dust(u.x, u.y, { r: 260, power: 0.8 }); F.trail(u.x, u.y, u.x + d.ux * 300, u.y + d.uy * 300, 4); pushGhost(c, u.x, u.y, u.z, d.ux * 60, d.uy * 60, 0.3); }
    if (T > 0.17 && T < 0.5) { const a = (T - 0.17) * TAU * 6; faceDir(c, Math.cos(a), Math.sin(a), true); } else faceDir(c, d.ux, d.uy, true);
    // 飓风环：白芯、红橙、最外一圈蓝色风刃（立起来的几圈墙，绕着他转）
    if (at(c, 'cy', 0.17)) {
      for (const [r, w, sp, mode, col, z] of [[90, 190, 16, 'fire', [1.7, 1.4, 1.2], 70], [140, 140, -13, 'fire', FIREC, 60], [195, 95, 11, 'wind', CYAN, 55], [235, 60, -9, 'wind', [0.6, 0.9, 1.5], 50]] as [number, number, number, 'fire' | 'wind', RGB3, number][])
        F.arc(u.x + d.ux * 40, u.y + d.uy * 40, z, { sweep: TAU * 0.92, r, w, dur: 0.38, sweepT: 0.02, tail: 0.6, spin: sp, tall: true, mode, col, power: 1.4 });
      audio.p2('p2_cyclone', u.x, u.y);
    }
    if (at(c, 'cy2', 0.3)) for (const [r, w, sp, mode, col] of [[110, 170, 15, 'fire', [1.6, 1.2, 1]], [200, 90, -12, 'wind', CYAN]] as [number, number, number, 'fire' | 'wind', RGB3][]) F.arc(u.x + d.ux * 90, u.y + d.uy * 90, 65, { sweep: TAU * 0.92, r, w, dur: 0.28, sweepT: 0.02, tail: 0.6, spin: sp, tall: true, mode, col, power: 1.4 });
    for (const [k, t] of [['h1', 0.24], ['h2', 0.31], ['h3', 0.38], ['h4', 0.45]] as [string, number][]) if (at(c, k, t) && near(c, u.x, u.y, 320)) { strike(c, 0.017, 0.7, 'p2yan', { power: 0.9, stop: 0.03, sfx: null }); const q2 = posOf(c, c.target)!; F.flare(q2.x - d.ux * 40, q2.y - d.uy * 40, q2.z + 90, { r: 45, dur: 0.1, mode: 'star' }); }
    // 环往前一撞炸开：巨大的白黄爆带光刺、对手被炸上天
    if (at(c, 'bl', 0.5)) {
      const bx = (q?.x ?? u.x + d.ux * 160), by = (q?.y ?? u.y + d.uy * 160);
      F.blast(bx, by, 2.2, 'fire', { z: 100, r: 115 });
      F.ring(bx, by, 100, d.ux, d.uy, 0, { r: 420, power: 1.6, dur: 0.35 });
      audio.p2('p2_blast', bx, by);
      if (near(c, bx, by, 300)) { strike(c, 0.05, 2.2, 'p2yan', { power: 2, uz: 0.6, stop: 0.08, sfx: null }); if (c.target) c.launch(c.target, d.ux, d.uy, 520, 1500); }
      c.shake(0.9); c.cam(0.9);
    }
    return T < 1.25;
  },
};

// ==================================================================== 碎心踢（旋风碎心踢，视频 83.7–85.0）
const SUI: SpecialMove = {
  id: 'p2sui', name: '碎心踢', glyph: '碎', color: '120,210,255', cd: 10, range: 560,
  desc: '跳起旋踢，身后甩出一道巨大的青蓝风刃；落地再蓄，一记腾空侧踹，旋转的火轮撞进对手怀里炸开。',
  who: 'npc', ai: { weight: 0.7, min: 120, max: 520 },
  can(B, u) { return hsCan(B, u); },
  begin(c) { init(c, true); const u = userPos(c); D(c).sx = u.x; D(c).sy = u.y; P2S(c.B).log.push('sui'); },
  tick(c, dt) {
    const T = clock(c, dt), d = D(c), F = F3(c), u = userPos(c), nx = -d.uy, ny = d.ux;
    syncUser(c, dt);
    pose(c, 'p2Sui', T);
    faceDir(c, d.ux, d.uy, true);
    const z = T > 0.1 && T < 0.33 ? 70 * Math.sin(Math.PI * (T - 0.1) / 0.23) : T > 0.6 && T < 0.9 ? 60 * Math.sin(Math.PI * (T - 0.6) / 0.3) : 0;
    // 跳起旋踢：身后一道大风刃（竖着的弧，像镰刀甩出去）
    if (at(c, 'blade', 0.15)) { F.arc(u.x, u.y, 110, { nx, ny, nz: 0, e1: [-d.ux, -d.uy, 0], a0: -0.5, sweep: 3.1, r: 190, w: 95, dur: 0.45, sweepT: 0.1, tail: 1.6, mode: 'wind', col: CYAN, power: 1.5 }); F.arc(u.x, u.y, 110, { nx, ny, nz: 0, e1: [-d.ux, -d.uy, 0], a0: -0.3, sweep: 2.6, r: 140, w: 40, dur: 0.35, sweepT: 0.1, tail: 2, mode: 'wind', col: [1.4, 1.6, 1.8] }); audio.p2('p2_blade', u.x, u.y); }
    if (at(c, 'land', 0.33)) { for (const [r, sp] of [[120, 10], [160, -8]] as [number, number][]) F.arc(u.x, u.y, 10, { sweep: 2.2, r, w: 34, dur: 0.35, sweepT: 0.05, tail: 1.2, spin: sp, mode: 'wind', col: CYAN }); F.dust(u.x, u.y, { r: 220, power: 0.6 }); }
    // 腾空侧踹：冲过去，火轮撞上
    if (T > 0.6 && T < 0.72) { const q = posOf(c, c.target); if (q) { if (d.kx === undefined) { d.kx = u.x; d.ky = u.y; } const go = clamp(Math.hypot(q.x - (d.kx as number), q.y - (d.ky as number)) - 100, 0, 420), k = smooth((T - 0.6) / 0.12); put(c, (d.kx as number) + d.ux * go * k, (d.ky as number) + d.uy * go * k, z); } }
    else if (c.user) put(c, u.x, u.y, z);
    if (T > 0.6 && T < 0.9) F.fire('sui-f', u.x + d.ux * 70, u.y + d.uy * 70, u.z + 100, d.ux * 1700, d.uy * 1700, 0, 1, 0.3);
    if (at(c, 'hit', 0.67)) {
      white(c, 1);
      const fx = u.x + d.ux * 110, fy = u.y + d.uy * 110;
      // 旋转的红色火焰轮（竖着、朝对手）+ 一个准星似的十字星芒 + 后面一道青白风刃、一团墨绿色的烟
      F.arc(fx, fy, 100, { nx: d.ux, ny: d.uy, nz: 0, sweep: TAU * 0.85, r: 105, w: 30, dur: 0.32, sweepT: 0.02, tail: 0.8, spin: 15, mode: 'fire', col: [2, 0.5, 0.3], power: 1.5 });
      F.arc(fx, fy, 100, { nx: d.ux, ny: d.uy, nz: 0, sweep: 1.6, r: 150, w: 18, dur: 0.3, sweepT: 0.04, spin: -10, mode: 'fire', col: [2, 1.6, 0.6] });
      F.flare(fx, fy, 100, { r: 120, dur: 0.16, mode: 'star', col: [1.6, 1.4, 0.9] });
      F.arc(u.x, u.y, 110, { nx, ny, nz: 0, e1: [-d.ux, -d.uy, 0], a0: -0.2, sweep: 2.4, r: 170, w: 70, dur: 0.35, sweepT: 0.08, mode: 'wind', col: CYAN });
      F.dust(fx, fy, { r: 300, power: 0.9, col: [0.18, 0.26, 0.18] });
      audio.p2('p2_blade', fx, fy);
      if (near(c, fx, fy, 240)) strike(c, 0.05, 1.6, 'p2sui', { power: 1.7, stop: 0.08 });
    }
    // 前方一大团橙黄火爆，几道黄色光刃往下射
    if (at(c, 'bl', 0.83)) {
      const q = posOf(c, c.target), bx = q?.x ?? u.x + d.ux * 160, by = q?.y ?? u.y + d.uy * 160;
      F.blast(bx, by, 2.2, 'fire', { z: 90, r: 140 });
      F.flare(bx, by, 100, { r: 230, dur: 0.38 });
      audio.p2('p2_blast', bx, by);
      if (near(c, bx, by, 280)) { strike(c, 0.04, 1.8, 'p2sui', { power: 1.6, stop: 0.06, sfx: null }); if (c.target) c.launch(c.target, d.ux, d.uy, 900, 700); }
      c.shake(0.8);
    }
    return T < 1.3;
  },
};

// ==================================================================== 坠火踢（烈火强踢 · 落火，视频 96.2–97.3）
const ZHUI: SpecialMove = {
  id: 'p2zhui', name: '坠火踢', glyph: '坠', color: '255,150,90', cd: 12, range: 420,
  desc: '原地起跳，竖着一脚踢成一字马（脚尖一团光核），劈落时一道火柱从天上贯下来，脚前炸开一团巨大的白黄火爆，碎石四飞。',
  who: 'npc', ai: { weight: 0.7, max: 380 },
  can(B, u) { return hsCan(B, u); },
  begin(c) { init(c, true); const u = userPos(c); D(c).sx = u.x; D(c).sy = u.y; say(c, '落！'); P2S(c.B).log.push('zhui'); },
  tick(c, dt) {
    const T = clock(c, dt), d = D(c), F = F3(c), u = userPos(c), nx = -d.uy, ny = d.ux;
    syncUser(c, dt);
    pose(c, 'p2Zhui', T);
    faceDir(c, d.ux, d.uy, true);
    // 起跳（身后一个灰色残影）→ 一字马 → 往前劈落
    const q0 = posOf(c, c.target), go = q0 ? clamp(Math.hypot(q0.x - (d.sx as number), q0.y - (d.sy as number)) - 150, 0, 240) : 0;
    const z = T > 0.12 && T < 0.5 ? 85 * Math.sin(Math.PI * (T - 0.12) / 0.38) : 0, k = smooth((T - 0.12) / 0.38);
    put(c, (d.sx as number) + d.ux * go * k, (d.sy as number) + d.uy * go * k, z);
    if (at(c, 'jump', 0.14)) { pushGhost(c, u.x, u.y, 0, 0, 0, 0.3, '210,210,220'); F.dust(u.x, u.y, { r: 200, power: 0.6 }); audio.sfx('whoosh', u.x, u.y); }
    if (at(c, 'split', 0.33)) {
      // 脚尖一大团亮紫白光核、一道火焰弧从脚划下来
      F.flare(u.x + d.ux * 30, u.y + d.uy * 30, z + 290, { r: 150, dur: 0.3, mode: 'star', col: [1.4, 1.1, 1.6] });
      F.arc(u.x, u.y, z + 130, { nx, ny, nz: 0, e1: [0, 0, 1], a0: 0.15, sweep: -1.9, r: 160, w: 60, dur: 0.35, sweepT: 0.14, tail: 1.6, mode: 'fire', col: FIREC, power: 1.3 });
      audio.p2('p2_flame', u.x, u.y);
    }
    // 劈落：一道火柱从天上贯下来到脚前、地面一圈蓝色冲击
    const fx = u.x + d.ux * 110, fy = u.y + d.uy * 110;
    if (at(c, 'axe', 0.5)) {
      F.column(fx, fy, { h: 2000, r: 42, dur: 0.42, col: [1.8, 0.62, 0.22] });
      F.ring(fx, fy, 6, 0, 0, 1, { r: 380, power: 1.2, col: [0.45, 0.65, 1.4], dur: 0.32 });
      F.sonic(fx, fy, 260, 0, 0, -1, { power: 1.4, vz: -3600, col: [1, 0.6, 0.3] });
      audio.p2('p2_kick', fx, fy);
    }
    if (T > 0.42 && T < 0.62) F.fire('zhui-f', u.x + d.ux * 80, u.y + d.uy * 80, u.z + 60, d.ux * 400, d.uy * 400, -2400, 1.1, 0.35);
    // 整屏偏白一帧、脚前一团巨大的白黄火爆 → 碎石四飞、火往上喷、上方一团红色余烬
    if (at(c, 'bl', 0.67)) {
      white(c, 1);
      F.blast(fx, fy, 2.3, 'fire', { z: 40, r: 140 });   // r9：2.9 → 2.3（推近之后整屏一片白）
      F.jet(fx, fy, 20, 0, 0, { dz: 1, len: 600, power: 2, spread: 0.4 });
      F.debris(fx, fy, { n: 34, r: 220, power: 1.3, up: 1.3, size: 0.36, hot: true });
      F.dust(fx, fy, { r: 700, power: 1.6 });
      F.scorch(fx, fy, 300, { dur: 7 });
      F.dent(fx, fy, 220, 70, 10);
      F.warp(fx, fy, 60, { r: 900, power: 1.6 });
      try { c.B.g.combat.wreck.radial(fx, fy, 320, 2.4, c.user ?? 'p', { mark: 'crack', maxTrees: 12, shake: false }); } catch { /* 破坏系统出错不拖垮出招 */ }
      audio.p2('p2_blast', fx, fy);
      if (near(c, fx, fy, 300)) { strike(c, 0.09, 3, 'p2zhui', { power: 2.2, uz: 0.6, stop: 0.1, sfx: null }); if (c.target) c.launch(c.target, d.ux, d.uy, 500, 1200); }
      c.shake(1.2); c.cam(1);
    }
    if (at(c, 'em', 0.85)) F.jet(fx, fy, 300, 0, 0, { dz: 1, len: 260, power: 0.9, spread: 0.9 });
    return T < 1.4;
  },
};

// ==================================================================== 炎阳炮拳（烈火强拳，视频 99.8–101.5；和无极一击同一个动作模板，短、小，普通招）
const PAO: SpecialMove = {
  id: 'p2pao', name: '炎阳炮拳', glyph: '炮', color: '255,140,70', realm: 2, mp: 0.15, cd: 10, range: 900,
  desc: '旋身甩火，弓步举拳（拳上一团火越烧越亮），踩地一冲到对手面前一拳——白核火爆、往前喷的火龙，把人打飞。（无极一击的小号）',
  who: 'both', ai: { weight: 0.75, min: 160, max: 820 },
  can(B, u) { return u === null || hsCan(B, u); },
  begin(c) { init(c, true); P2S(c.B).log.push('pao'); },
  tick(c, dt) {
    const T = clock(c, dt), d = D(c), F = F3(c), u = userPos(c);
    syncUser(c, dt);
    const SPIN = 0.17, WIND = 0.5, DASH = 0.1;
    if (T < SPIN) {
      if (at(c, 'spin', 0)) { F.jet(u.x, u.y, 110, d.ux, d.uy, { len: 220, spread: Math.PI, power: 0.8 }); F.arc(u.x, u.y, 100, { sweep: TAU, r: 140, w: 45, dur: 0.25, sweepT: 0.12, tail: 1.5, mode: 'fire', col: FIREC }); audio.p2('p2_flame', u.x, u.y); }
      const a = Math.atan2(d.uy, d.ux) + T / SPIN * TAU; faceDir(c, Math.cos(a), Math.sin(a), true);
      pose(c, 'hs3Spin', T); return true;
    }
    if (T < WIND) {
      const q = posOf(c, c.target); if (q && T < WIND - 0.12) { const dx = q.x - u.x, dy = q.y - u.y, L = Math.hypot(dx, dy); if (L > 1) { d.ux = dx / L; d.uy = dy / L; } }
      faceDir(c, d.ux, d.uy, true);
      const k = (T - SPIN) / (WIND - SPIN);
      F.fire('pao-fist', u.x - d.ux * 18, u.y - d.uy * 18, u.z + 108, 0, 0, -320, 0.6 + 0.8 * k, 0.18 + 0.08 * k);
      pose(c, 'hs3Brace', T - SPIN); return true;
    }
    if (!d.dash) { const q = posOf(c, c.target), along = q ? (q.x - u.x) * d.ux + (q.y - u.y) * d.uy : 0, go = clamp(along - 85, 0, 780); d.dash = dashGo(c, 'pao', u.x + d.ux * go, u.y + d.uy * go, go > 40 ? DASH : 0.01, 20, [1, 0.85, 0.7]); }
    const Dd = d.dash as Dash;
    if (!d.arrived) { F.fire('pao-fist', u.x, u.y, u.z + 115, (Dd.x1 - Dd.x0) / DASH, (Dd.y1 - Dd.y0) / DASH, 0, 1, 0.3); if (!dashStep(c, Dd)) return true; d.arrived = 1; d.at = T; dashEnd(c, Dd); }
    pose(c, 'hs3Cannon', T - (d.at as number));
    if (at(c, 'hit', 0)) {
      const u2 = userPos(c), x0 = u2.x + d.ux * 70, y0 = u2.y + d.uy * 70;   // 冲到了：按这一刻的位置（不是这一帧开头冲刺前的）
      F.blast(x0 + d.ux * 40, y0 + d.uy * 40, 2.1, 'fire', { z: 100, r: 130 });
      F.flare(x0 + d.ux * 40, y0 + d.uy * 40, 100, { r: 200, dur: 0.35 });
      F.jet(x0, y0, 100, d.ux, d.uy, { len: 460, power: 1.7, spread: 0.16 });
      F.ring(x0, y0, 100, d.ux, d.uy, 0, { r: 380, power: 1.4, dur: 0.32 });
      audio.p2('p2_blast', x0, y0);
      if (near(c, x0, y0, 260)) { strike(c, 0.08, 3, 'p2pao', { power: 2, stop: 0.08, sfx: null }); if (c.target) c.launch(c.target, d.ux, d.uy, 1300, 750); }
      c.shake(1); c.cam(1);
    }
    return T < (d.at as number) + 0.35;
  },
};

// ==================================================================== 解放（赤阳罡入状态，视频 70.7–74.3）
const JIE: SpecialMove = {
  id: 'p2jie', name: '赤阳罡·解放', glyph: '罡', color: '255,90,60', cd: 1, range: 2000,
  desc: '胸前一团光核，整片天地压成暗紫红，他全身赤红发光、在一人多高的火里往前走；一声白闪，前方一片火海——从此燃身。',
  who: 'npc', ai: { weight: 0 },
  can(B, u) { return isHs(B, u) && !B.g.offWorld; },
  begin(c) { init(c); const S = P2S(c.B); S.releasing = true; say(c, '……好。让你见识见识。', '#ff9a70'); audio.p2('p2_hum', userPos(c).x, userPos(c).y); S.log.push('jie'); },
  tick(c, dt) {
    const T = clock(c, dt), d = D(c), F = F3(c), u = userPos(c), S = P2S(c.B);
    syncUser(c, dt);
    const q = posOf(c, c.target);
    if (q && T < 2.9) { const dx = q.x - u.x, dy = q.y - u.y, L = Math.hypot(dx, dy); if (L > 1) { d.ux = dx / L; d.uy = dy / L; } }
    faceDir(c, d.ux, d.uy, true);
    // 往前走（1.3–2.9）：一人多高的火里一步步逼过去
    if (T > 1.3 && T < 2.9 && q && Math.hypot(q.x - u.x, q.y - u.y) > 300) { put(c, u.x + d.ux * 150 * dt, u.y + d.uy * 150 * dt); if (c.user?.cs) { if (c.user.cs.action !== 'walk') c.user.cs.setAction('walk'); c.user.cs.speed = 150; } }
    else pose(c, 'p2Jie', T);
    if (T < 0.6) F.aura('p2-hs', u.x, u.y, u.z, 0.4 + T);
    if (at(c, 'core', 0.6)) { F.flare(u.x + d.ux * 20, u.y + d.uy * 20, u.z + 115, { r: 120, dur: 0.6, mode: 'star', col: [1.4, 1.1, 1.7] }); audio.p2('p2_core', u.x, u.y); }
    if (T > 0.6 && T < 1) F.flare(u.x + d.ux * 20, u.y + d.uy * 20, u.z + 115, { r: 60 + 100 * (T - 0.6), dur: 0.06, mode: 'star', col: [1.2, 1, 1.5] });
    // 整屏压成暗紫红、他全身赤红发光、火星往上飘
    if (T > 1.0 && T < 2.9) { const k = T < 1.3 ? 1 : 0.45; S.scr({ wash: [0.5, 0.07, 0.18, 0.55 * k], dim: 0.6 * k, keep: [c.user!, ...(c.target ? [c.target] : [])] }); F.aura('p2-hs', u.x, u.y, u.z, 2); }
    if (at(c, 'ign', 1.0)) { S.ignite(); F.ring(u.x, u.y, 10, 0, 0, 1, { r: 420, power: 0.9, col: [1.6, 0.4, 0.3], dur: 0.28 }); F.jet(u.x, u.y, 40, 0, 0, { dz: 1, len: 260, power: 0.8, spread: 0.5 }); c.shake(0.6); }
    // 白闪一帧、前方一团巨大的白光 → 一片暗红火海（火焰层 + 余烬层，铺满半屏）
    const fx = u.x + d.ux * 220, fy = u.y + d.uy * 220;
    if (at(c, 'wh', 3.0)) { white(c, 1); F.flare(fx, fy, 100, { r: 300, dur: 0.22 }); F.sonic(u.x + d.ux * 60, u.y + d.uy * 60, 100, d.ux, d.uy, 0.02, { power: 1.6, vx: d.ux * 2600, vy: d.uy * 2600 }); audio.p2('p2_blast', fx, fy); }
    if (at(c, 'sea', 3.3)) {
      F.blast(fx, fy, 2.0, 'fire', { z: 30, r: 230 });   // 火海：暗红的火焰层 + 余烬层（不要白芯火球闪）
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; F.jet(fx + Math.cos(a) * 160, fy + Math.sin(a) * 110, 10, Math.cos(a) * 0.3, Math.sin(a) * 0.3, { dz: 1, len: 300, power: 1.1, spread: 0.5, delay: i * 0.03 }); }
      F.scorch(fx, fy, 420, { dur: 8 });
    }
    // 冲到对手身后，对手被打倒
    if (at(c, 'pass', 3.55) && q) {
      const bx = q.x + d.ux * 170, by = q.y + d.uy * 170;
      c.B.impact.blink(u.x, u.y, bx, by, 60, 60, '255,170,120');
      pushGhost(c, u.x, u.y, u.z, d.ux * 70, d.uy * 70, 0.35, '255,150,110');
      put(c, bx, by);
      if (near(c, q.x, q.y, 400)) { strike(c, 0.07, 2, 'p2jie', { power: 1.8, stop: 0.08 }); if (c.target) c.launch(c.target, -d.ux, -d.uy, 260, 500); }
      faceDir(c, -d.ux, -d.uy, true);
    }
    return T < 3.95;
  },
  end(c) { const S = P2S(c.B); S.releasing = false; if (isHs(c.B, c.user)) S.ignite(); },
};

// ==================================================================== 霸皇蹴（极武霸皇踢，视频 103.0–106.75）
const BAHUANG: SpecialMove = {
  id: 'p2bahuang', name: '霸皇蹴', glyph: '霸', color: '255,80,60', cd: 70, range: 700,
  desc: '闪步穿过对手，回身一踏，地里一排火柱冲天；踏着火柱逼上去高踢，一道火龙甩上天、转成紫红——双拳下砸，整片天地变红，「爆」「碎」两字砸下，白光横贯，火爆冲天。（觉醒）',
  who: 'npc', ai: { weight: 0.5, min: 120, max: 640 },
  can(B, u) { return hsCan(B, u, true); },
  begin(c) { init(c); hs3Of(c.B.g).useBig(); if (c.user) (c.user as { shell?: boolean }).shell = false; say(c, '霸皇——', '#ff8a5a'); audio.p2('p2_hum', userPos(c).x, userPos(c).y); P2S(c.B).log.push('bahuang'); },
  tick(c, dt) {
    const T = clock(c, dt), d = D(c), F = F3(c), u = userPos(c), S = P2S(c.B), nx = -d.uy, ny = d.ux;
    syncUser(c, dt);
    pose(c, 'p2Ba', T);
    const q = posOf(c, c.target);
    if (T < 0.5) faceDir(c, d.ux, d.uy, true);
    // 闪步冲到对手身后（一路尘土、对手身上一团蓝白冲击）
    if (at(c, 'dash', 0.5) && q) {
      white(c, 1);
      const bx = q.x + d.ux * 170, by = q.y + d.uy * 170;
      F.trail(u.x, u.y, bx, by, 7); F.smear(u.x, u.y, 80, bx, by, 80, { w: 50, dur: 0.3 }); F.dust(u.x, u.y, { r: 300, power: 1 });
      c.B.impact.blink(u.x, u.y, bx, by, 60, 60, '200,230,255');
      put(c, bx, by); d.bx = bx; d.by = by;
      if (near(c, q.x, q.y, 500)) { strike(c, 0.035, 1.4, 'p2bahuang', { power: 1.4, stop: 0.06, sfx: 'p2_blade' }); F.flare(q.x, q.y, q.z + 90, { r: 70, dur: 0.12, mode: 'star', col: [1, 1.3, 1.7] }); }
      audio.sfx('fx_launch', u.x, u.y);
    }
    // 回身（脚下一路尘土和火）；地面一排火柱从地里往上蹿（斜着往上的火刃）
    if (T >= 0.75) { const q2 = posOf(c, c.target); if (q2) { const dx = q2.x - u.x, dy = q2.y - u.y, L = Math.hypot(dx, dy); if (L > 30 && T < 1.5) { d.vx = dx / L; d.vy = dy / L; } } faceDir(c, (d.vx as number) ?? -d.ux, (d.vy as number) ?? -d.uy, true); }
    const vx = (d.vx as number) ?? -d.ux, vy = (d.vy as number) ?? -d.uy;
    if (at(c, 'turn', 0.75)) { F.dust(u.x, u.y, { r: 220, power: 0.7 }); F.fire('ba-ft', u.x, u.y, 20, -vx * 600, -vy * 600, 0, 0.8, 0.3); }
    const pillars = (k: string, t: number, x0: number, y0: number, n: number) => {
      if (!at(c, k, t)) return;
      for (let i = 0; i < n; i++) { const s = 60 + i * 95, px = x0 + vx * s, py = y0 + vy * s; F.jet(px, py, 0, vx * 0.45, vy * 0.45, { dz: 1, len: 360 + i * 20, power: 1.3, spread: 0.12, delay: i * 0.055 }); F.blast(px, py, 0.8, 'fire', { z: 10, r: 60, delay: i * 0.055 }); F.inferno(px, py, { r: 55, dur: 0.5, power: 0.35, up: 5, delay: i * 0.055 }); }   // r9：每根火柱一团往上卷的火舌（立体、有体积）
      audio.p2('p2_pillar', x0, y0);
    };
    pillars('p1', 1.0, u.x, u.y, 6);
    if (at(c, 'pop', 1.25) && q) { F.blast(q.x - vx * 40, q.y - vy * 40, 1.4, 'fire', { z: q.z + 40, r: 70 }); if (near(c, q.x, q.y, 600)) { strike(c, 0.035, 1.4, 'p2bahuang', { power: 1.3, stop: 0.05, sfx: null }); if (c.target) c.launch(c.target, vx, vy, 80, 700); } }
    // 踏着火柱往前
    if (T > 1.45 && T < 1.95 && q) { const dd = Math.hypot(q.x - u.x, q.y - u.y); if (dd > 130) put(c, u.x + vx * Math.min(dd - 130, 900 * dt), u.y + vy * Math.min(dd - 130, 900 * dt)); }
    pillars('p2', 1.5, u.x + vx * 200, u.y + vy * 200, 5);
    // 整屏压暗、高踢：一道巨大的火龙从脚尖甩上天
    if (T > 1.95 && T < 2.5) S.scr({ black: 0.75 * smooth((T - 1.95) / 0.1), keep: [c.user!, ...(c.target ? [c.target] : [])] });
    if (at(c, 'dragon', 2.0)) {
      F.arc(u.x, u.y, 140, { nx: -vy, ny: vx, nz: 0, e1: [vx, vy, 0], a0: -0.5, sweep: 2.3, r: 280, w: 130, dur: 0.6, sweepT: 0.16, tail: 1.3, mode: 'fire', col: FIREC, power: 1.8 });
      F.jet(u.x + vx * 60, u.y + vy * 60, 200, vx * 0.3, vy * 0.3, { dz: 1, len: 1000, power: 2.4, spread: 0.18 });
      audio.p2('p2_flame', u.x, u.y); audio.sfx('fx_roar', u.x, u.y);
      if (near(c, u.x, u.y, 350)) strike(c, 0.035, 1.4, 'p2bahuang', { power: 1.4, uz: 1, stop: 0.05, sfx: null });
    }
    // 火龙转成紫红，双拳下砸
    if (at(c, 'purple', 2.25)) { F.arc(u.x, u.y, 160, { nx: -vy, ny: vx, nz: 0, e1: [vx, vy, 0], a0: 0.2, sweep: -2.4, r: 260, w: 110, dur: 0.5, sweepT: 0.18, tail: 1.3, mode: 'purple', col: PURP, power: 1.6 }); F.jet(u.x, u.y, 600, 0, 0, { dz: -1, len: 500, power: 1.2, pal: 'void', spread: 0.3 }); }
    // 整屏变红：「爆」从左砸进来、一道横贯全屏的白紫光线；「碎」从右；中间紫色电光
    const tq = posOf(c, c.target) ?? { x: u.x + vx * 140, y: u.y + vy * 140, z: 0 };
    if (T > 2.5 && T < 3.25) S.scr({ wash: [0.85, 0.05, 0.05, 0.72], black: 0.2, keep: [c.user!, ...(c.target ? [c.target] : [])] });
    if (at(c, 'w1', 2.5)) { F.inferno(tq.x, tq.y, { r: 900, dur: 0.75, power: 0.9, up: 0.6 }); S.show({ k: 'word', word: '爆', side: 'l', dur: 1.05 }); S.show({ k: 'beam', dur: 0.4, col: '235,200,255' }); audio.p2('p2_slam'); audio.p2('p2_beam', tq.x, tq.y); if (near(c, u.x, u.y, 450)) strike(c, 0.05, 2, 'p2bahuang', { power: 1.6, stop: 0.1, sfx: null }); c.shake(1); }
    if (at(c, 'w2', 2.8)) { S.show({ k: 'word', word: '碎', side: 'r', dur: 0.8 }); audio.p2('p2_slam'); if (near(c, u.x, u.y, 450)) strike(c, 0.035, 1.5, 'p2bahuang', { power: 1.4, stop: 0.05, sfx: null }); }
    if (T > 2.5 && T < 3.2 && Math.floor(T * 12) !== Math.floor((T - dt) * 12)) F.arc(tq.x, tq.y, tq.z + 90, { nx: Math.cos(T * 7), ny: Math.sin(T * 5), nz: 0.6, sweep: 2.2, r: 120 + 40 * Math.sin(T * 9), w: 14, dur: 0.12, sweepT: 0.03, tail: 2, mode: 'purple', col: [1.6, 1, 2] });
    // 整屏白、一团巨大的火焰 + 灰尘爆开 → 整屏偏红、火星满屏 → 恢复，地上一大片焦痕和余烟
    if (at(c, 'boom', 3.25)) {
      white(c, 3); S.scr({ wash: [1.3, 1.2, 1.05, 0.8] });
      F.blast(tq.x, tq.y, 3.4, 'fire', { z: 60, r: 260 });
      F.jet(tq.x, tq.y, 30, 0, 0, { dz: 1, len: 700, power: 2.2, spread: 0.5 });
      F.dust(tq.x, tq.y, { r: 1100, power: 2.6 }); F.debris(tq.x, tq.y, { n: 36, r: 300, power: 1.4, up: 1.3, size: 0.36, hot: true });   // r9：碎石小一号（推近后飞到镜头前的是一块块大板）
      F.scorch(tq.x, tq.y, 520, { dur: 10 }); F.dent(tq.x, tq.y, 360, 110, 16); F.ripple(tq.x, tq.y, { amp: 20, reach: 2400 });
      F.warp(tq.x, tq.y, 80, { r: 1400, power: 2.2 });
      F.inferno(tq.x, tq.y, { r: 1100, dur: 1.0, power: 1.6, up: 0.8 });   // r9：整屏偏红、火星满屏（视频 106.5）——一大片翻滚的火团
      try { c.B.g.combat.wreck.radial(tq.x, tq.y, 560, 4, c.user ?? 'p', { maxTrees: 30, shake: false }); } catch { /* 破坏系统出错不拖垮出招 */ }
      audio.p2('p2_blast', tq.x, tq.y); audio.sfx('fx_finisher');
      if (near(c, tq.x, tq.y, 500)) { strike(c, 0.07, 3.4, 'p2bahuang', { power: 2.6, uz: 0.5, stop: 0.12, sfx: null }); if (c.target) c.launch(c.target, vx, vy, 2200, 1100); }
      c.B.stageFar = 800; c.shake(1.5); c.cam(1.4);
    }
    if (T > 3.33 && T < 3.7) S.scr({ wash: [0.9, 0.12, 0.06, 0.38] });
    if (at(c, 'em', 3.4)) F.jet(tq.x, tq.y, 120, 0, 0, { dz: 1, len: 500, power: 1.4, spread: Math.PI });
    return T < 4.1;
  },
};

// ==================================================================== 逐日（焚火逐日拳，视频 124.8–139.3 压成四段）
const ZHURI: SpecialMove = {
  id: 'p2zhuri', name: '逐日', glyph: '日', color: '255,200,80', cd: 90, range: 600,
  desc: '全身化作火焰人形，胸口一团紫白光核——天地压黑，只剩他和火；一拳一个颜色的连环轰击，竖着的冲击光环被他一拳穿过；最后拳头里炸出一轮赤日，回身一甩凤翼，把人甩上天。（觉醒）',
  who: 'npc', ai: { weight: 0.45, min: 100, max: 560 },
  can(B, u) { return hsCan(B, u, true); },
  begin(c) { init(c); hs3Of(c.B.g).useBig(); if (c.user) (c.user as { shell?: boolean }).shell = false; say(c, '逐日——', '#ffcf6a'); P2S(c.B).log.push('zhuri'); },
  tick(c, dt) {
    const T = clock(c, dt), d = D(c), F = F3(c), u = userPos(c), S = P2S(c.B), nx = -d.uy, ny = d.ux;
    syncUser(c, dt);
    pose(c, 'p2Ri', T);
    const keep = [c.user!, ...(c.target ? [c.target] : [])] as (Enemy | 'p')[];
    const q = posOf(c, c.target) ?? { x: u.x + d.ux * 150, y: u.y + d.uy * 150, z: 0 };
    if (T < 1.2) faceDir(c, d.ux, d.uy, true);
    F.aura('p2-hs', u.x, u.y, u.z, T < 1 ? 2.2 : 1.6);
    const wash = (t0: number, t1: number, w: [number, number, number, number]) => { if (T >= t0 && T < t1) S.scr({ wash: w, keep }); };
    const hit = (k: string, t: number, frac: number, p: number, sfx: P2Sfx | null = 'p2_kick') => { if (at(c, k, t) && near(c, u.x, u.y, 420)) strike(c, frac, 1.5, 'p2zhuri', { power: p, stop: 0.05, sfx }); };
    // —— 一：燃身蓄、火焰人形甩手、胸口光核 → 整屏紫白 → 压成紫黑、紫色电光往上蹿
    if (at(c, 'core', 0.2)) { F.flare(u.x + d.ux * 20, u.y + d.uy * 20, u.z + 115, { r: 140, dur: 0.45, mode: 'star', col: [1.4, 1.1, 1.8] }); audio.p2('p2_core', u.x, u.y); }
    wash(0.33, 0.43, [1.1, 0.95, 1.4, 0.85]);
    if (T > 0.43 && T < 0.75) { S.scr({ black: 0.85, wash: [0.45, 0.12, 0.75, 0.45], keep }); if (Math.floor(T * 15) !== Math.floor((T - dt) * 15)) F.arc(u.x, u.y, 60, { nx: Math.cos(T * 9), ny: Math.sin(T * 9), nz: 0.2, e1: [0, 0, 1], a0: -0.3, sweep: 1.2, r: 90 + 30 * Math.sin(T * 13), w: 14, dur: 0.15, sweepT: 0.05, tail: 2, mode: 'purple', col: [1.5, 1, 2] }); }
    if (at(c, 'hum', 0.45)) { F.inferno(u.x, u.y, { r: 520, dur: 0.4, power: 0.45, up: 0.9 }); audio.p2('p2_hum', u.x, u.y); F.ring(u.x, u.y, 10, 0, 0, 1, { r: 460, power: 1.3, col: [1.2, 0.5, 1.6], dur: 0.4 }); }
    // —— 二：画面整个变黑只剩他和火——挥拳凤翼 → 一拳一个颜色（白黄、橙黄 + 竖着的光环、青蓝 + 闪电、白、粉紫）→ 压黑，焦黑裂开的地上燃火
    if (T > 0.95 && T < 2.95) S.scr({ black: 0.97, keep });
    if (at(c, 'wing', 1.0)) { for (const s of [1, -1]) F.arc(u.x, u.y, 110, { nx, ny, nz: 0, e1: [-d.ux * s, -d.uy * s, 0], a0: -0.4, sweep: 2.6 * s, r: 230, w: 120, dur: 0.5, sweepT: 0.14, tail: 1.4, mode: 'fire', col: FIREC, power: 1.6 }); audio.p2('p2_flame', u.x, u.y); }
    if (at(c, 'go1', 1.25)) { const bx = q.x - d.ux * 100, by = q.y - d.uy * 100; c.B.impact.blink(u.x, u.y, bx, by, 60, 60, '255,210,140'); put(c, bx, by); }
    wash(1.5, 1.62, [1.4, 1.2, 0.65, 0.9]); hit('h1', 1.5, 0.035, 1.6, 'p2_blast');
    if (at(c, 'b1', 1.5)) { F.blast(q.x, q.y, 1.8, 'fire', { z: q.z + 90, r: 120 }); F.flare(q.x, q.y, q.z + 90, { r: 260, dur: 0.3 }); F.inferno(q.x, q.y, { r: 700, dur: 0.45, power: 1.1, up: 0.7 }); }
    wash(1.66, 1.88, [1.25, 0.55, 0.1, 0.72]);
    if (at(c, 'ring', 1.68)) { F.ring(q.x, q.y, q.z + 100, d.ux, d.uy, 0, { r: 300, power: 2, col: [1.6, 1.5, 1.3], dur: 0.35 }); S.show({ k: 'lines', dur: 0.35, col: '255,240,200' }); audio.p2('p2_ring', q.x, q.y); }
    if (at(c, 'rings', 1.88)) { for (const r of [220, 340]) F.ring(q.x + d.ux * 40, q.y + d.uy * 40, q.z + 100, d.ux, d.uy, 0, { r, power: 1.6, col: [1.6, 0.7, 0.25], dur: 0.3 }); const bx = q.x + d.ux * 170, by = q.y + d.uy * 170; pushGhost(c, u.x, u.y, u.z, d.ux * 70, d.uy * 70, 0.3, '255,180,110'); put(c, bx, by); faceDir(c, -d.ux, -d.uy, true); }
    wash(1.98, 2.15, [0.3, 0.95, 1.35, 0.78]); hit('h2', 2.0, 0.025, 1.3, 'p2_beam');
    if (at(c, 'cy', 2.0)) { S.show({ k: 'lines', dur: 0.3, col: '190,250,255' }); for (let i = 0; i < 4; i++) F.arc(q.x, q.y, q.z + 100, { nx: Math.cos(i * 1.7), ny: Math.sin(i * 1.7), nz: 0.4, sweep: 1.4, r: 130 + i * 30, w: 10, dur: 0.15, sweepT: 0.03, tail: 2.5, mode: 'wind', col: [1.6, 1.8, 2] }); }
    wash(2.18, 2.28, [1.35, 1.35, 1.35, 0.9]); hit('h3', 2.2, 0.025, 1.3, 'p2_kick');
    if (at(c, 'sm', 2.2)) F.dust(q.x + d.ux * 120, q.y + d.uy * 120, { r: 360, power: 1, col: [0.42, 0.42, 0.44] });
    wash(2.38, 2.55, [1.15, 0.45, 1.05, 0.65]); hit('h4', 2.4, 0.025, 1.3, 'p2_flame');
    if (at(c, 'sc', 2.45)) F.jet(q.x, q.y, q.z + 90, d.ux, d.uy, { spread: Math.PI, len: 260, power: 1, pal: 'void' });
    if (at(c, 'gr', 2.9)) { F.scorch(u.x, u.y, 420, { dur: 9 }); F.dent(u.x, u.y, 260, 50, 10); try { c.B.g.combat.wreck.cracks(u.x, u.y, 420, 2.4); } catch { /* */ } }
    // —— 三：黑底连打 → 白核 + 横向青蓝光线 → 往前喷的白黄火焰 → 整屏橙黄大爆、光刺往外放射 → 余火、红烟
    if (T > 3.1 && T < 4.65) S.scr({ black: 0.95, keep });
    if (at(c, 'go3', 3.1)) { const bx = q.x - d.ux * 100, by = q.y - d.uy * 100; put(c, bx, by); faceDir(c, d.ux, d.uy, true); }
    hit('h5', 3.2, 0.02, 1.2);
    if (at(c, 'h6x', 3.4)) { F.flare(q.x, q.y, q.z + 95, { r: 120, dur: 0.18, mode: 'star' }); F.smear(q.x - d.ux * 300, q.y - d.uy * 300, 95, q.x + d.ux * 500, q.y + d.uy * 500, 95, { w: 20, dur: 0.25, col: [0.5, 0.9, 1] }); }
    hit('h6', 3.4, 0.02, 1.2, 'p2_beam');
    if (at(c, 'h7x', 3.6)) { F.jet(u.x + d.ux * 60, u.y + d.uy * 60, 100, d.ux, d.uy, { len: 560, power: 2, spread: 0.12 }); F.smear(u.x, u.y, 110, u.x + d.ux * 700, u.y + d.uy * 700, 110, { w: 18, dur: 0.25, col: [0.5, 0.9, 1] }); }
    hit('h7', 3.6, 0.02, 1.3, 'p2_flame');
    wash(3.88, 4.05, [1.35, 0.85, 0.2, 0.82]);
    if (at(c, 'b8', 3.9)) { F.blast(q.x, q.y, 2.8, 'fire', { z: q.z + 90, r: 190 }); F.inferno(q.x, q.y, { r: 850, dur: 0.55, power: 1.5, up: 0.7 }); audio.p2('p2_blast', q.x, q.y); c.shake(1); }
    hit('h8', 3.9, 0.04, 2, null);
    if (at(c, 'b9', 4.1)) F.blast(q.x + d.ux * 60, q.y + d.uy * 60, 1.3, 'fire', { z: q.z + 80, r: 100 });
    if (at(c, 'rs', 4.2)) F.dust(q.x, q.y, { r: 320, power: 0.9, col: [0.55, 0.12, 0.08] });
    // —— 四：整屏红、拳头里炸出一轮赤日（火焰弧绕着它甩）→ 收成橙红火球、一圈蓝色冲击环、红色光刃往外飞 → 整屏一个巨大的太阳 → 回身上甩凤翼、把人甩上天 → 白黄 → 橙黄光环、速度线 → 恢复
    const sx = u.x + d.ux * 120, sy = u.y + d.uy * 120;
    wash(4.8, 5.3, [0.95, 0.07, 0.04, 0.7]); if (T > 4.8 && T < 5.3) S.scr({ black: 0.5, keep });
    if (at(c, 'sun1', 4.8)) { F.inferno(sx, sy, { r: 800, dur: 0.6, power: 0.9, up: 0.8 }); F.flare(sx, sy, 110, { r: 280, dur: 0.5, mode: 'sun' }); F.arc(sx, sy, 110, { nx: d.ux, ny: d.uy, nz: 0, sweep: TAU * 0.8, r: 210, w: 60, dur: 0.5, sweepT: 0.1, tail: 1, spin: 6, mode: 'fire', col: FIREC, power: 1.6 }); audio.p2('p2_sun', sx, sy); c.shake(1); }
    hit('h9', 4.82, 0.04, 2, null);
    if (at(c, 'sun2', 5.3)) { F.blast(sx, sy, 1.9, 'fire', { z: 110, r: 130 }); F.ring(sx, sy, 110, 0, 0, 0, { r: 520, power: 1.6, col: [0.5, 0.7, 1.6], dur: 0.35 }); audio.p2('p2_ring', sx, sy); }
    wash(5.68, 6.0, [1.1, 0.6, 0.12, 0.35]);
    if (at(c, 'sun3', 5.7)) { F.flare(sx, sy, 120, { r: 300, dur: 0.65, mode: 'sun' }); F.inferno(sx, sy, { r: 900, dur: 0.7, power: 1.1, up: 0.8 }); audio.p2('p2_sun', sx, sy); }   // r9：太阳占画面七八成高（原来半径一千多，整屏只剩一片白）
    hit('h10', 5.72, 0.03, 1.6, null);
    if (at(c, 'sc2', 6.0)) F.jet(sx, sy, 110, d.ux, d.uy, { spread: Math.PI, len: 380, power: 1.4 });
    if (at(c, 'wing2', 6.25)) {
      F.arc(u.x, u.y, 120, { nx, ny, nz: 0, e1: [-d.ux, -d.uy, 0], a0: -0.6, sweep: 3.2, r: 300, w: 150, dur: 0.6, sweepT: 0.16, tail: 1.3, mode: 'fire', col: FIREC, power: 1.9 });
      F.jet(u.x + d.ux * 60, u.y + d.uy * 60, 150, d.ux * 0.4, d.uy * 0.4, { dz: 1, len: 900, power: 2.2, spread: 0.2 });
      audio.p2('p2_flame', u.x, u.y);
      if (near(c, u.x, u.y, 450)) { strike(c, 0.05, 2.4, 'p2zhuri', { power: 2, uz: 1, stop: 0.06, sfx: null }); if (c.target) c.launch(c.target, d.ux, d.uy, 300, 1700); }
    }
    wash(6.8, 6.95, [1.4, 1.25, 0.7, 0.88]);
    wash(7.15, 7.5, [1.25, 0.6, 0.12, 0.6]);
    if (at(c, 'fin', 7.15)) {
      F.ring(u.x + d.ux * 100, u.y + d.uy * 100, 150, d.ux, d.uy, 0.4, { r: 460, power: 2, col: [1.6, 1.5, 1.3], dur: 0.4 }); S.show({ k: 'lines', dur: 0.4, col: '255,230,170' });
      F.blast(q.x, q.y, 3, 'fire', { z: Math.max(80, q.z), r: 220 });
      F.inferno(u.x + d.ux * 200, u.y + d.uy * 200, { r: 900, dur: 0.7, power: 1.3, up: 0.6 });
      F.scorch(u.x + d.ux * 120, u.y + d.uy * 120, 560, { dur: 10 });
      audio.p2('p2_blast', q.x, q.y); audio.p2('p2_ring', u.x, u.y); audio.sfx('fx_finisher');
      if (c.target) { const q2 = posOf(c, c.target)!; if (Math.hypot(q2.x - u.x, q2.y - u.y) < 900) { strike(c, 0.04, 2, 'p2zhuri', { power: 2.4, stop: 0.08, sfx: null }); c.launch(c.target, d.ux, d.uy, 1800, 900); } }
      c.B.stageFar = 800; c.shake(1.4); c.cam(1.3);
    }
    return T < 7.75;
  },
};

// ==================================================================== 赤阳罡（玩家：在技能栏里开燃身）
const GANG: SpecialMove = {
  id: 'p2gang', name: '赤阳罡', glyph: '罡', color: '255,110,70', realm: 2, mp: 0.3, cd: 40, range: 9999,
  desc: `沉身一握拳，赤阳罡气透体而出——燃身 ${P2.burn} 息：火贴着身子往上蹿，赤焰回旋腿、炎阳炮拳多三成伤害。（撼山客的第二阶段）`,
  who: 'player',
  begin(c) { init(c); const S = P2S(c.B), p = c.B.g.player; S.playerBurnT = P2.burn; audio.p2('p2_ignite', p.x, p.y); S.log.push('gang'); },
  tick(c, dt) {
    const T = clock(c, dt), F = F3(c), u = userPos(c);
    pose(c, 'p2Gang', T, 0.8);
    if (at(c, 'flare', 0.35)) { F.ring(u.x, u.y, 8, 0, 0, 1, { r: 360, power: 1.1, col: [1.6, 0.5, 0.3], dur: 0.35 }); F.jet(u.x, u.y, 40, 0, 0, { dz: 1, len: 300, power: 1, spread: 0.7 }); c.shake(0.4); }
    return T < 0.75;
  },
};

export const MOVES_P2: Record<P2Id, SpecialMove> = { p2xuan: XUAN, p2yan: YAN, p2sui: SUI, p2zhui: ZHUI, p2pao: PAO, p2bahuang: BAHUANG, p2zhuri: ZHURI, p2jie: JIE, p2gang: GANG };

/** 第二阶段的连招表：五招为主，夹第一阶段的缩地、一寸崩衔接；隔一阵来一记大招（觉醒两招、无极一击、一拳破界合用两分钟两次的名额） */
function p2Combo(d: number, tg: Enemy | null, rnd: () => number): string[] {
  const far: string[][] = [['p2pao'], ['p2yan', 'p2sui'], ['suodi', 'p2xuan'], ['p2yan', 'p2zhui'], ['suodi', 'p2sui', 'p2pao']];
  const near: string[][] = [['p2xuan'], ['p2sui', 'p2pao'], ['p2zhui', 'p2yan'], ['yicunbeng', 'p2xuan'], ['p2xuan', 'p2zhui'], ['p2sui', 'p2zhui']];
  const L = d > 520 ? far : near;
  const q = L[Math.floor(rnd() * L.length) % L.length].slice();
  if (rnd() < 0.3) q.push(['p2bahuang', 'p2zhuri', 'p2bahuang', 'p2zhuri', 'wuji'][Math.floor(rnd() * 5) % 5]);
  void tg;
  return q;
}

let registered = false;
/** 注册（hanshan.ts 的构造里调一次）：招式挂进近战的特殊招式表、他的出招表；每帧的钩子、连招表的钩子接上 */
export function registerHsP2(game: Game, H: Hanshan) {
  if (!registered) { registered = true; for (const m of Object.values(MOVES_P2)) registerMove(m); }
  const S = hsp2Of(game);
  for (const id of P2_IDS) {
    if (id === 'p2gang') continue;
    H.registerMove(id, (tg) => {
      const e = H.ent; if (!e) return false;
      // 觉醒大招照名额（两分钟两次，和无极一击、一拳破界合用）；试玩入口（S.force）不看名额和阶段
      const S3 = hs3Of(game), big = id === 'p2bahuang' || id === 'p2zhuri';
      if (big && !S.force && (!S.on || !S3.bigOk())) return false;
      S3.forcing = true;
      try { return startMove(game.combat.brawl, MOVES_P2[id], e, tg ?? 'p'); } finally { S3.forcing = false; }
    });
  }
  const prev = H.hold;
  H.hold = (dt) => { S.tick(dt); return prev ? prev(dt) : false; };
  S.hook();
  H.p2Combo = (d, tg, rnd) => (S.on ? p2Combo(d, tg, rnd) : null);
}
