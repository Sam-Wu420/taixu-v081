// 收官 E3：虚空一拳打进世界。
//
// 用户原话：「最好能在虚空可以把别人一拳无缝打到世界的海上或者大陆上这种的战斗」。「无缝」在这个项目里的意思是
// 玩家自己飞过去：没有过场、没有闪白、没有黑屏淡入淡出、没有锁操作。所以这里只做三件事——
//   1. 虚空斗法里，对破了罡的对手往下砸（近战重击 + 下降键、技能栏崩山带下砸、俯冲砸击接砸），下方够得着某一界时，
//      对手变成一颗带火尾的流星朝正下方坠下去，穿过界壁时荡开一圈符文涟漪；斗法场的镜头拉回巡航的远近（还是同一个斗法：
//      fight.on 一直开着到落进界内为止，所以界内那一套照常跑、不算「停住的虚空」）；
//   2. 玩家按追击键（架势里空格 / 技能栏缩地 / 手机「追」）就俯冲追下去：走的是现成的降界通道（xukong 的 void → dive），
//      只是升降的快慢乘了几倍；方向照常能拨，按住上升就作罢——全程自己飞；
//   3. 换手到界内画面的那一刻，把这个对手（同一个 Enemy：血量、名字、追杀都接着）放回界内的落点，从你脚下不远处砸下去：
//      陆上是大坑、气浪、飞石，海里是冲天水柱；人嵌在地里 / 沉在海里一会儿（硬直），接着用界内的战斗打。
// 反过来也成立：体修（或会近战的大妖）在虚空里一记重击打空了你的罡气，就把你砸下去——你成了流星，一路往下坠；
// 途中按脱困（同一个键）就定住身形、接着在虚空里斗；没脱困就一路砸进界内（吃撞击伤害、硬直），对手追下来。
//
// 伤害一律走 combat 的 hitEnemy / hitPlayer（落地撞击在 brawl.landed 里结算），照常触发模组的 damage 钩子。
// 新的随机数一个都不取（落点、时间都是算出来的）。
import type { Game } from './game';
import type { Enemy } from './combat';
import type { VoidFoeSrc } from './voidfight';
import { landing, voidToPoint, VOID_SCALE } from '../data/zhujie';
import { ACTIVE_MAP, type MapId } from '../data/world';
import { ascendLabel, bindOf, keyLabel } from '../core/keymap';
import { IS_TOUCH } from '../core/touch';
import { ALT } from './alt';
import { audio } from './audio';

export const VOIDFALL = {
  /** 流星的落势：离大陆面的高度按 ln(h0/h) = accel·t²/2 往下掉（先慢后快，约 2.6 息落地） */
  accel: 1.6,
  /** 你在追的时候，流星总在你下方（高度不超过你的这么多成），落地前不会被你超过去 */
  lead: 0.55,
  /** 俯冲追击 / 被打落：升降的快慢（xukong 的 rate）乘几倍；只按住下降键（没按追击）时乘几倍 */
  plungeK: 3.4, dropK: 3.0, holdK: 1.8,
  /** 换手到界内时，对手从你脚下这么高（你高度的几成，最多这么高）、以这个速度砸下去 */
  replayK: 0.6, replayMax: 1500, replayVz: -2800,
  /** 嵌地 / 沉海的硬直（息） */
  stunLand: 2.4, stunSea: 2.2,
  /** 出拳后多久之内落进界内，还能看到它砸下去；更晚就只是躺在那儿（已经爬起来了） */
  replayWithin: 14,
  /** 没追下去：落下去的对手在落点等多久（游戏内秒；之后你自己找到落点附近，它就在那儿，伤还在、仇也记着） */
  keep: 1800,
  /** 走到落点多近，它就现身 */
  findR: 7000,
  /** 流星落定后一直没往下追，这么久就收场（回到寻常的虚空飞行） */
  idleEnd: 2.2,
  /** 被打落途中脱困：耗多少灵力（占上限） */
  techMp: 0.2,
} as const;

export type FallMode = 'none' | 'meteor' | 'dropped';

/** 一颗流星（被你打下去的对手），或者被打落时跟着你追下来的那个对手 */
export interface FallDrop {
  e: Enemy; src: VoidFoeSrc | null; name: string;
  /** 在虚空里的位置（虚空坐标；流星笔直往下掉） */
  vx: number; vy: number;
  /** 离大陆面的高度（界内单位）、出手时的高度、过了几息 */
  h: number; h0: number; t: number;
  /** 穿过了界壁、落定了、已经放回了界内 */
  crossed: boolean; landed: boolean; placed: boolean;
  /** 出手的时刻（game.time） */
  at: number;
}
/** 落下去了但人没跟下去：记下它在哪张图的哪儿，之后降进那一界就把它放回去 */
interface Pending { e: Enemy; name: string; map: MapId; x: number; y: number; at: number }
/** 穿过界壁的符文涟漪（画面用）：虚空坐标、离大陆面的高度、1 → 0 */
export interface FallRipple { vx: number; vy: number; h: number; k: number }

export class VoidFall {
  mode: FallMode = 'none';
  drop: FallDrop | null = null;
  /** 正在俯冲追击（自己按的，按住上升或再按一次就作罢） */
  plunge = false;
  ripple: FallRipple | null = null;
  pending: Pending | null = null;
  /** 被打落：从什么时候开始、谁打的 */
  private idleT = 0; private hinted = false;
  /** 测试 / 界面：这一趟发生过什么 */
  log: string[] = [];
  constructor(private readonly game: Game) {}

  /** 正在进行（流星还在、或者你正在坠）：这期间斗法不收场、界内那一套照常跑 */
  get live(): boolean { return this.mode !== 'none'; }
  /** 画面：被打落的那个人（你）身上要拖火尾 */
  get falling(): boolean { return this.mode === 'dropped'; }
  /** 一键追击：俯冲时自动朝流星的落点飞（虚空坐标）；没在追时为 null */
  aim(): { x: number; y: number } | null { const d = this.drop; return this.mode === 'meteor' && this.plunge && d && !d.placed ? { x: d.vx, y: d.vy } : null; }

  // ---------------------------------------------------------------- 触发
  /** 这一界的落点（脚下够不着任何一界、或进不去时为 null） */
  private below(vx: number, vy: number) {
    const xk = this.game.xukong, o = xk.over;
    return o ? landing(o, vx, vy) : null;
  }
  /** 能不能把 e 砸下去：虚空斗法中、还没有别的流星、脚下够得着一界 */
  canDrop(e: Enemy): boolean {
    const g = this.game, F = g.xukong.fight;
    if (!F.on || this.live || e.dead || (e as { shell?: boolean }).shell) return false;
    const v = F.toVoid(e.x, e.y);
    return !!this.below(v.x, v.y);
  }
  /** 你（主角）能不能被 by 砸下去：虚空斗法中、它是体修或会近战的大妖、脚下够得着一界 */
  canDropPlayer(by: Enemy): boolean {
    const g = this.game, F = g.xukong.fight, xk = g.xukong;
    if (!F.on || this.live || g.hero.dead || by.dead) return false;
    if (!(by.school === 'tixiu' || by.boss || by.def.id.startsWith('xk_') || by.def.id === 'bx_tixiu')) return false;
    return !!this.below(xk.x, xk.y);
  }

  /** 一拳砸下去（brawl.slam 在虚空斗法里调）：对手成了流星，斗法场的镜头往回拉 */
  punch(e: Enemy): void {
    const g = this.game, xk = g.xukong, F = xk.fight, c = g.combat, B = c.brawl;
    const v = F.toVoid(e.x, e.y), src = F.release(e);
    B.clear(e);
    c.enemies = c.enemies.filter((q) => q !== e);
    if (c.lock === e) c.lock = null;
    if (xk.life.chaser?.enemy === e) xk.life.chaser = null;   // 追进虚空的追兵：落进界内后追杀照旧（不算甩掉）
    this.drop = { e, src, name: e.name, vx: v.x, vy: v.y, h: xk.h, h0: xk.h, t: 0, crossed: false, landed: false, placed: false, at: g.time };
    this.mode = 'meteor'; this.plunge = false; this.idleT = 0;
    this.log.push('punch');
    // 斗法场里：往下一记贯穿的光柱、爆闪、色散，收尾一击的慢放和大字（大字只出一次，见 brawl.combo）
    c.fxq.push({ k: 'voidpunch', anchor: { x: e.x, y: e.y, offsetY: -e.z }, x: e.x, y: e.y - 60, color: '255,170,90', power: 3 });
    g.juice(0.09, 0.7); g.slowmo(0.22); g.aberrKick = Math.max(g.aberrKick, 0.85);
    B.punchCam(1.4);
    audio.sfx('boom'); audio.sfx('thunder');
    B.combo(e, '坠界', false);
    // 脚下那一块先备着（界内的画面在底下准备好，追下去时换手不卡）
    const to = this.below(v.x, v.y); if (to) xk.prewarm(to);
    // 斗法场里没有别的对手了：镜头拉回巡航的远近、画面换回虚空（同一个斗法，没有收场）
    if (!F.foes.some((f) => !f.e.dead)) F.toFall();
    const key = IS_TOUCH ? '「追」' : `${keyLabel(bindOf('dodge'))}（或技能栏「缩地」）`;
    g.toast(`${e.name}被你一拳砸向下界！按 ${key} 俯冲追下去——按住${ascendLabel()}就作罢。`, 'good');
  }

  /** 你被 by 一记重击砸下去（brawlfoe 的重击在虚空斗法里、你罡气已破时调） */
  dropPlayer(by: Enemy): void {
    const g = this.game, xk = g.xukong, F = xk.fight, c = g.combat, B = c.brawl;
    const src = F.release(by);
    c.enemies = c.enemies.filter((q) => q !== by);
    if (c.lock === by) c.lock = null;
    if (xk.life.chaser?.enemy === by) xk.life.chaser = null;
    B.clear(by);
    this.drop = { e: by, src, name: by.name, vx: xk.x, vy: xk.y, h: xk.h * 1.5, h0: xk.h, t: 0, crossed: false, landed: false, placed: false, at: g.time };
    this.mode = 'dropped'; this.plunge = false; this.idleT = 0;
    this.log.push('dropped');
    const p = g.player;
    c.fxq.push({ k: 'voidpunch', anchor: { x: p.x, y: p.y, offsetY: -p.z }, x: p.x, y: p.y - 60, color: '200,120,255', power: 3 });
    g.juice(0.08, 0.8); g.aberrKick = Math.max(g.aberrKick, 0.9);
    B.punchCam(1.2);
    audio.sfx('boom');
    F.toFall();
    g.toast(`${by.name}一拳把你砸向下界！按 ${IS_TOUCH ? '「脱」' : keyLabel(bindOf('dodge'))} 脱困（耗 ${Math.round(VOIDFALL.techMp * 100)}% 灵力），不然就一路砸进去。`, 'warn');
  }

  // ---------------------------------------------------------------- 操作
  /** 追击键 / 脱困键：俯冲追下去（再按一次作罢）；被打落时是脱困。返回 true = 用掉了这个键 */
  act(): boolean {
    const g = this.game;
    if (this.mode === 'meteor') {
      if (this.drop?.placed) return false;   // 已经在界内了：照常的缩地追击
      this.plunge = !this.plunge;
      this.log.push(this.plunge ? 'plunge' : 'abandon');
      if (this.plunge) {
        audio.sfx('whoosh');
        if (!this.hinted) { this.hinted = true; g.toast('俯冲！方向键照常能拨，按住上升就作罢。', 'info'); }
      }
      return true;
    }
    if (this.mode === 'dropped') { this.tech(); return true; }
    return false;
  }
  /** 被打落途中脱困：定住身形，接着在虚空里斗 */
  private tech(): void {
    const g = this.game, h = g.hero, xk = g.xukong, F = xk.fight, d = this.drop, B = g.combat.brawl;
    if (B.pb.techCd > 0) { g.toast('脱困还在调息中。', 'info'); return; }
    if (h.mp < VOIDFALL.techMp - 1e-6) { g.toast('灵力不足，脱不了困！', 'warn'); return; }
    h.mp -= VOIDFALL.techMp;
    B.pb.techCd = 5; B.pb.poise = Math.max(B.pb.poise, B.pb.poiseMax * 0.5); B.pb.breakT = 0;
    this.mode = 'none'; this.drop = null;
    this.log.push('tech');
    audio.sfx('whoosh');
    if (xk.phase === 'void' && F.on && d) {
      // 还在虚空里：斗法接着来（镜头再拉近），对手追到身边
      F.resume(d.e, d.src);
      g.toast(`脱困！稳住了身形——${d.name}追了下来。`, 'good');
    } else {
      // 已经进了界内那一段：自己往下飞（不再被拽着坠），对手照样追下来
      if (d) this.placeFollower(d);
      g.toast('脱困！稳住了身形。', 'good');
    }
  }

  // ---------------------------------------------------------------- 每帧
  /** 升降的方向：被打落一直往下坠；俯冲追击一直往下；按住上升作罢 */
  steer(key: -1 | 0 | 1): -1 | 0 | 1 {
    if (this.mode === 'dropped') return -1;
    if (this.mode === 'meteor' && this.plunge) {
      if (key > 0) { this.plunge = false; this.log.push('abandon'); return key; }
      return -1;
    }
    return key;
  }
  /** 升降的快慢乘几倍 */
  rateK(key: -1 | 0 | 1): number {
    if (this.mode === 'dropped') return VOIDFALL.dropK;
    if (this.mode === 'meteor') return this.plunge ? VOIDFALL.plungeK : key < 0 ? VOIDFALL.holdK : 1;
    return 1;
  }
  /** 每帧（xukong.update 最前面）：流星往下掉、穿界壁、落定；没人追就收场 */
  tick(dt: number): void {
    if (this.ripple) { this.ripple.k -= dt / 1.6; if (this.ripple.k <= 0) this.ripple = null; }
    const g = this.game, xk = g.xukong, d = this.drop;
    if (this.pending && g.time - this.pending.at > VOIDFALL.keep) { this.pending = null; }
    this.seek();
    if (!d || d.placed) return;
    d.t += dt;
    if (this.mode === 'dropped') {
      // 跟着你追下来：一直在你上方一点
      d.vx += (xk.x - d.vx) * Math.min(1, dt * 3); d.vy += (xk.y - d.vy) * Math.min(1, dt * 3);
      d.h = Math.max(xk.h * 1.35, d.h * Math.exp(-dt * 2.4));
      return;
    }
    if (d.landed) {
      // 落定了：你没往下追（还在虚空里、没在降），过一会儿收场
      if (xk.phase === 'void' && !xk.warming && !this.plunge && xk.dir >= 0) { this.idleT += dt; if (this.idleT > VOIDFALL.idleEnd) this.giveUp(); }
      else this.idleT = 0;
      return;
    }
    const before = d.h;
    d.h = d.h0 * Math.exp(-VOIDFALL.accel * d.t * d.t / 2);
    if (this.plunge && xk.phase === 'void') d.h = Math.min(d.h, xk.h * VOIDFALL.lead);   // 你追得再快，它也在你下方
    // 穿过界壁：荡开一圈符文涟漪
    const dome = xk.domeAt(xk.ref, d.vx, d.vy) * VOID_SCALE;
    if (!d.crossed && dome > 0 && before > dome && d.h <= dome) {
      d.crossed = true; this.ripple = { vx: d.vx, vy: d.vy, h: dome, k: 1 };
      this.log.push('crossed');
      audio.sfx('chime'); audio.sfx('boom');
    }
    if (d.h <= ALT.max) {
      d.h = 0; d.landed = true; this.idleT = 0;
      this.log.push('landed');
      // 落在了哪张图的哪儿：之后降进那一界就把它放回去
      const to = this.below(d.vx, d.vy);
      if (to) this.pending = { e: d.e, name: d.name, map: to.map, x: to.x, y: to.y, at: g.time };
      if (!this.plunge) this.fallHurt(d);
    }
  }
  /**
   * 不追不算赢：没追下去的那个，带着坠落的伤活在落点。你之后自己（走、飞、降界都行）到了那张图上它的落点附近，它就在那儿——
   * 伤着、仇恨照记。每帧查一次（只比一次距离）。
   */
  private seek(): void {
    const g = this.game, P = this.pending;
    if (!P || this.live || g.xukong.phase !== 'none' || g.offWorld || P.map !== ACTIVE_MAP) return;
    const p = g.player;
    if (Math.hypot(P.x - p.x, P.y - p.y) > VOIDFALL.findR) return;
    this.pending = null;
    if (P.e.dead) return;
    this.putBack(P.e, P.x, P.y);
    const b = g.combat.brawl.body(P.e); b.staggerT = Math.max(b.staggerT, 0.6);
    g.combat.fxq.push({ k: 'crater', x: P.x, y: P.y, power: 2, r: 260 });
    this.log.push('found');
    g.toast(`${P.name}就在这儿——坠地的坑还冒着烟，人带着伤，眼里全是恨。`, 'warn');
  }
  /** 没追下去：落定那一刻，它吃一下坠落的伤（走 hitEnemy；留它一口气） */
  private fallHurt(d: FallDrop): void {
    const g = this.game, e = d.e, c = g.combat;
    const raw = c.pStats.atk * c.brawl.meleeMul * 1.2;
    if (e.dead || e.hp <= raw * 2.5) return;
    c.hitEnemy(e, raw, { realm: g.hero.realm, stCh: 0, school: '体', brawl: 'impact' } as never, e.x, e.y);
  }
  /** 没追下去：斗法收场（不算赢、不结算奖励），回到寻常的虚空飞行；它带着伤留在落点 */
  private giveUp(): void {
    const g = this.game, F = g.xukong.fight, d = this.drop;
    this.mode = 'none'; this.plunge = false; this.drop = null;
    this.log.push('gave-up');
    if (d?.src) d.src.onEnd?.('fell', d.e);
    if (F.on) F.finish('fall');
    g.toast(`${d?.name ?? '对手'}坠进了下界，没入云海——没追下去，这一场不算赢。它带着伤活在落点，要了结就去那里寻它。`, 'info');
  }

  /** xukong.arrive 落到界内那张图之前：斗法收场（人回到界内），对手的记录交还 */
  beforeArrive(): void {
    const g = this.game, F = g.xukong.fight, d = this.drop;
    if (d?.src && this.live) { d.src.onEnd?.('fell', d.e); d.src = null; }
    if (F.on) F.finish('fall');
  }
  /**
   * 换手到界内画面的那一刻（xukong 进 dive）：把对手放回界内。
   *   · 你打下去的：在落点从你脚下砸下去（落得太久的就直接躺在那儿）；
   *   · 你被打下去：它在你上方追下来；
   *   · 早先落下去、你没跟下来的：降进同一张图、离得不远，它就在那儿。
   */
  onDive(): void {
    const g = this.game, d = this.drop;
    if (d && !d.placed) {
      if (this.mode === 'meteor') this.placeMeteor(d);
      else if (this.mode === 'dropped') this.placeFollower(d);
      return;
    }
    const P = this.pending, p = g.player;
    if (P && P.map === ACTIVE_MAP && !P.e.dead && Math.hypot(P.x - p.x, P.y - p.y) < 9000) {
      this.pending = null;
      this.putBack(P.e, P.x, P.y);
      this.log.push('found');
      g.toast(`${P.name}就在下面——坠地的坑还冒着烟。`, 'warn');
    }
  }
  /** 你在界内的那一段降到了高空的顶（xukong.finish）：被打落的，接着从这个高度砸到地上 / 海里 */
  onCorridorEnd(): void {
    const g = this.game, B = g.combat.brawl;
    if (this.mode === 'dropped') {
      const by = this.drop?.e ?? null;
      this.mode = 'none';
      if (this.drop && !this.drop.placed) this.placeFollower(this.drop);
      this.drop = null;
      B.meteorPlayer(by);
      this.log.push('player-impact');
      return;
    }
    if (this.mode === 'meteor') { this.mode = 'none'; this.plunge = false; this.drop = null; this.log.push('chased'); }
  }

  /** 把一个对手挂回界内的战斗：位置、仇恨、追杀 */
  private putBack(e: Enemy, x: number, y: number): void {
    const g = this.game, c = g.combat;
    e.x = e.hx = x; e.y = e.hy = y; e.lpx = e.lpy = NaN; e.mvx = e.mvy = 0; e.vx = e.vy = 0; e.kx = e.ky = 0;
    e.flee = false; e.gone = false; e.aggro = true; e.tgP = true; e.hunt = true; e.flyH = 0; e.lift = 0;
    if (e.cs) { e.cs.x = x; e.cs.y = y; e.cs.lift = 0; }
    e.trailReset = true;
    if (!c.enemies.includes(e)) c.enemies.push(e);
    const P = g.pursuit?.cur; if (P && P.e === e) { P.lost = false; P.searching = false; P.lastX = g.player.x; P.lastY = g.player.y; }
  }
  /** 你打下去的那一个：落点在你正下方附近（它掉下去的那一点），从你脚下砸下去 */
  private placeMeteor(d: FallDrop): void {
    const g = this.game, p = g.player, B = g.combat.brawl;
    let q = voidToPoint(ACTIVE_MAP, d.vx, d.vy);
    // 落点离你太远（落在了另一张图那边）：就近放在你前下方
    if (!(Math.hypot(q.x - p.x, q.y - p.y) < 6000)) q = { x: p.x + 160, y: p.y + 220 };
    d.placed = true; this.pending = null;
    this.putBack(d.e, q.x, q.y);
    if (g.time - d.at < VOIDFALL.replayWithin) {
      const z0 = Math.min(VOIDFALL.replayMax, Math.max(260, p.z * VOIDFALL.replayK));
      B.meteorIn(d.e, 'p', z0, VOIDFALL.replayVz, false);
      this.log.push('replay');
    } else this.log.push('lying');
  }
  /** 打落你的那一个：在你上方追下来（落地也砸个坑，但不伤自己） */
  private placeFollower(d: FallDrop): void {
    const g = this.game, p = g.player, B = g.combat.brawl;
    d.placed = true;
    this.putBack(d.e, p.x + 220, p.y - 140);
    B.meteorIn(d.e, null, Math.min(2200, Math.max(500, p.z * 1.3)), -900, true);
    this.log.push('follower');
  }

  /** 读档、新开局、身死时归零 */
  reset(): void { this.mode = 'none'; this.drop = null; this.plunge = false; this.ripple = null; this.pending = null; this.idleT = 0; }
  /** 换图（读档）前后接回这一趟的状态 */
  snapshot() { return { mode: this.mode, drop: this.drop, plunge: this.plunge, ripple: this.ripple, pending: this.pending, idleT: this.idleT, hinted: this.hinted }; }
  restore(s: ReturnType<VoidFall['snapshot']>) { this.mode = s.mode; this.drop = s.drop; this.plunge = s.plunge; this.ripple = s.ripple; this.pending = s.pending; this.idleT = s.idleT; this.hinted = s.hinted; }

  /** 画面：流星（或跟着你追下来的那个）在虚空里的位置和离大陆面的高度 */
  figure(): { e: Enemy; vx: number; vy: number; h: number; fire: number } | null {
    const d = this.drop;
    if (!d || d.placed || (d.landed && this.mode === 'meteor')) return null;
    return { e: d.e, vx: d.vx, vy: d.vy, h: d.h, fire: this.mode === 'meteor' ? Math.min(1, d.t * 3) : 0.35 };
  }
}
