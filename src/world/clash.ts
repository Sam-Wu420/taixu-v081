// 拼招角力（E2）：两人同时欺身、或重击撞上重击时，拳对拳顶住——
//   时间放到 0.2 倍（整个世界一起慢，镜头推近；界面的倒计时按真实时间走），0.8 息里三选一：
//   攻克破、破克卸、卸克攻（键盘 A / W / D——就是左、上、右三个方位键，改了键跟着改；手机上弹出三个大按钮）；
//   赢的一方把对方震出硬直、削掉一大截罡气；平手转「连按拼点」：1 息里比谁按得多，NPC 按境界给一个连按速度。
//   两人贴身悬停，脚下压出一圈凹陷的气场（地上是裂纹和尘圈，水面是一圈被压下去的水和外翻的浪）。
// NPC 之间拼招不弹界面，直接按境界和性情结算。
// 伤害一律走 hitEnemy / hitPlayer / npcHit（模组的 damage 钩子照常触发）；随机数只用近战自己的序列（brnd），老路径一个不多取。
import type { Enemy } from './combat';
import type { BrawlSys } from './brawl';
import { brnd } from './brawlrng';
import { isBoss } from './foeskills';
import { audio } from './audio';

/** 攻、破、卸 */
export type Pick = 'atk' | 'brk' | 'par';
export const PICKS: Pick[] = ['atk', 'brk', 'par'];
export const PICK_NAME: Record<Pick, string> = { atk: '攻', brk: '破', par: '卸' };
/** a 克不克 b：攻克破、破克卸、卸克攻 */
export const beats = (a: Pick, b: Pick) => (a === 'atk' && b === 'brk') || (a === 'brk' && b === 'par') || (a === 'par' && b === 'atk');

export const CX = {
  /** 三选一的时限、连按拼点的时限（真实秒） */
  pickT: 0.8, mashT: 1.0,
  /** 拼招期间世界放慢到几倍；结果出来后用多久恢复 */
  slow: 0.2, resultT: 0.75,
  /** 两人贴身悬停：离地多高、相隔多远 */
  hover: 46, gap: 84,
  /** 输家：硬直、罡气削去的比例、伤害（攻力的倍数）、被震开多远 */
  loseStagger: 1.1, losePoise: 0.55, loseDmg: 1.15, losePush: 420,
  /** NPC 的连按速度：基数 + 每个境界（每秒） */
  mashBase: 5.4, mashRealm: 1.0,
} as const;

/** 性情：刚猛（爱出「攻」）、沉稳（爱出「卸」）、狡诈（专挑你常出的那一手来克） */
type Temper = 'fierce' | 'calm' | 'sly';
function temperOf(e: Enemy): Temper {
  let h = 2166136261; const s = e.name + (e.npcId ?? '') + e.def.id;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (['fierce', 'calm', 'sly'] as Temper[])[(h >>> 0) % 3];
}
export const TEMPER_NAME: Record<Temper, string> = { fierce: '刚猛', calm: '沉稳', sly: '狡诈' };
/** 起手式的颜色：攻＝赤、破＝金、卸＝青（和界面三张卡的颜色一致） */
const TELL_COL: Record<Pick, string> = { atk: '255,110,80', brk: '255,210,110', par: '120,210,255' };

export interface ClashState {
  e: Enemy; why: 'rush' | 'heavy';
  /** 真实时间（秒）；阶段：三选一 → （平手）连按 → 结果 */
  t: number; phase: 'pick' | 'mash' | 'result';
  pick: Pick | null; ePick: Pick; revealT: number;
  /** 连按：你按了几下、对方的累计、对方的速度 */
  pN: number; eN: number; eRate: number;
  res: 'win' | 'lose' | null; tie: boolean; resT: number;
  /** 气场中心（两人中点）、脚下是不是水 */
  x: number; y: number; water: boolean;
  /** 两人开始时的高度（结束时放回去） */
  pz0: number; ez0: number; temper: Temper;
  /**
   * 第三轮：对方的起手式——出手前 0.3 息摆出来，让读招有依据。老实的（刚猛、沉稳）摆的就是要出的那一手；
   * 狡诈的有时骗招：摆一手给你看，等你出克它的那一手，它真出的是克你那一手的。feint 记着是不是骗招（界面不显示，测试用）。
   */
  tell: Pick; tellAt: number; feint: boolean; told: boolean;
}

export class ClashSys {
  st: ClashState | null = null;
  /** 你出过的手（高境界、狡诈的对手照这个来克你） */
  habit: Record<Pick, number> = { atk: 0, brk: 0, par: 0 };
  /** 测试用：每一次结算记一笔 */
  log: { res: 'win' | 'lose'; tie: boolean; pick: Pick | null; ePick: Pick; pN: number; eN: number }[] = [];
  /** 不同对手之间的冷却：刚拼完别又马上撞上 */
  private cool = new WeakMap<Enemy, number>();
  constructor(readonly B: BrawlSys) {}
  get on() { return !!this.st; }
  reset() { this.st = null; }

  /** 能不能和这个人拼招（模组接管、定身、首领狂暴蓄力中的都不行） */
  can(e: Enemy): boolean {
    const g = this.B.combat.game;
    if (this.st || e.dead || e.gone || (e.hideT ?? 0) > 0 || (e as { shell?: boolean }).shell || e.st.freeze || e.st.stun || e.st.root) return false;
    if ((this.cool.get(e) ?? -99) > g.time) return false;
    if (g.hero.dead || g.xukong.active) return false;
    return true;
  }

  /** 开拼：两人拉到中点两侧贴身悬停 */
  start(e: Enemy, why: 'rush' | 'heavy') {
    if (!this.can(e)) return false;
    const B = this.B, g = B.combat.game, p = g.player;
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    const mx = (p.x + e.x) / 2, my = (p.y + e.y) / 2;
    p.x = mx - ux * CX.gap / 2; p.y = my - uy * CX.gap / 2 * 0.8;
    e.x = mx + ux * CX.gap / 2; e.y = my + uy * CX.gap / 2 * 0.8;
    p.st.faceToward(ux, uy, false); e.facing = ux < 0 ? 1 : -1;
    if (e.cs) { e.cs.x = e.x; e.cs.y = e.y; e.cs.faceToward(-ux, -uy, false); e.cs.restart('smash'); }
    p.st.restart('smash');
    const tm = temperOf(e);
    let ePick = this.npcPick(e, tm), tell = ePick, feint = false;
    // 狡诈的骗招：摆出 tell，真出的是「克你拿来克 tell 的那一手」
    if (tm === 'sly' && brnd() < 0.5) { feint = true; const counter = PICKS.find((k) => beats(k, tell))!; ePick = PICKS.find((k) => beats(k, counter))!; }
    const water = B.deepWater(mx, my);
    this.st = { e, why, t: 0, phase: 'pick', pick: null, ePick, revealT: 0, pN: 0, eN: 0, eRate: this.mashRate(e, tm), res: null, tie: false, resT: 0, x: mx, y: my, water, pz0: p.z, ez0: e.lift, temper: tm, tell, tellAt: CX.pickT - 0.3, feint, told: false };
    // 两人都停下：位移、出手、缓冲的一下都作废
    B.haltForClash(e);
    B.combat.fxq.push({ k: 'clash', x: mx, y: my, power: 2, kind: water ? 'water' : 'ground', r: 1 });
    g.juice(0.05, 0.5); g.aberrKick = Math.max(g.aberrKick, 0.6);
    audio.sfx('clang', mx, my); audio.sfx('boom', mx, my);
    B.combat.texts.push({ anchor: { x: mx, y: my, offsetY: -CX.hover }, x: mx, y: my - 160, s: '拼　招', color: '#ffe08a', t: 0, vy: -10, big: true } as never);
    return true;
  }

  /** NPC 心里先定下一手（藏着，到点或你出手后才亮出来） */
  private npcPick(e: Enemy, tm: Temper): Pick {
    const H = this.habit, tot = H.atk + H.brk + H.par;
    // 读你的习惯：境界越高、越狡诈，越会挑克你常出那一手的
    const read = Math.min(0.7, (tot >= 2 ? 0.12 + 0.11 * e.realm : 0) + (tm === 'sly' ? 0.2 : 0));
    if (tot >= 2 && brnd() < read) {
      const fav = (PICKS.slice().sort((a, b) => H[b] - H[a]))[0];
      return PICKS.find((k) => beats(k, fav))!;
    }
    const w: Record<Pick, number> = { atk: 1, brk: 1, par: 1 };
    if (tm === 'fierce') w.atk = 2.2; else if (tm === 'calm') w.par = 2.2; else w.brk = 1.8;
    let r = brnd() * (w.atk + w.brk + w.par);
    for (const k of PICKS) { r -= w[k]; if (r <= 0) return k; }
    return 'atk';
  }
  /** NPC 每秒按几下：境界越高越快，比你境界高的再快一截；刚猛的快一点 */
  private mashRate(e: Enemy, tm: Temper) {
    const gap = e.realm - this.B.combat.game.hero.realm;
    return (CX.mashBase + CX.mashRealm * e.realm) * (1 + 0.12 * Math.max(-2, Math.min(2, gap))) * (tm === 'fierce' ? 1.1 : 1) * (isBoss(e) ? 1.15 : 1);
  }

  /** 你出手：三选一阶段选一手；连按阶段算一下 */
  pick(k: Pick) {
    const S = this.st; if (!S) return;
    if (S.phase === 'mash') { this.mash(); return; }
    if (S.phase !== 'pick' || S.pick) return;
    S.pick = k; this.habit[k]++;
    S.revealT = S.t;
    audio.sfx('clang');
  }
  mash() { const S = this.st; if (S?.phase === 'mash') { S.pN++; if (S.pN % 3 === 0) this.B.combat.fxq.push({ k: 'clash', x: S.x, y: S.y, power: 0.6, kind: S.water ? 'water' : 'ground', r: 0 }); } }

  /** 世界此刻放慢到几倍（game 的主循环按这个缩 dt） */
  timeK(): number {
    const S = this.st; if (!S) return 1;
    if (S.phase !== 'result') return CX.slow;
    return CX.slow + (1 - CX.slow) * Math.min(1, S.resT / 0.35);
  }

  /** 每帧（真实时间）：两人钉在原地悬停、倒计时、到点结算 */
  tick(rdt: number) {
    const S = this.st; if (!S) return;
    const B = this.B, c = B.combat, g = c.game, p = g.player, e = S.e;
    // 对方没了 / 被模组接管 / 被定身：拼招作罢
    if (e.dead || e.gone || (e as { shell?: boolean }).shell || e.st.freeze || e.st.stun || g.hero.dead) { this.end(); return; }
    S.t += rdt;
    const lift = Math.min(1, S.t / 0.18) * (S.phase === 'result' ? Math.max(0, 1 - S.resT / 0.25) : 1);
    if (!B.pb.air) B.playerLift = g.isFlying ? 0 : CX.hover * lift;
    if (!B.isAir(e)) e.lift = Math.max(S.ez0, CX.hover * lift);
    if (S.phase !== 'result') { B.clashHold(e); p.st.faceToward(e.x - p.x, e.y - p.y, false); }
    if (S.phase === 'pick') {
      // 起手式：到点摆出来（人物换一个能认的架子、身上一闪对应颜色的蓄劲光）
      if (!S.told && S.t >= S.tellAt) {
        S.told = true;
        if (e.cs) e.cs.restart(S.tell === 'atk' ? 'punch' : S.tell === 'brk' ? 'smash' : 'feint');
        c.fxq.push({ k: 'bxcharge', anchor: { x: e.x, y: e.y, offsetY: -e.z }, x: e.x, y: e.y - 70, color: TELL_COL[S.tell], power: 2, r: 0.3 });
      }
      // 你出了手：再过一拍亮出对方那一手；时限到了还没出手——犹豫即败
      if (S.pick && S.t - S.revealT >= 0.16) this.decide();
      else if (S.t >= CX.pickT) { S.pick = null; this.decide(); }
    } else if (S.phase === 'mash') {
      S.eN += S.eRate * rdt;
      if (S.t >= CX.mashT) this.settle(S.pN > Math.floor(S.eN) || (S.pN === Math.floor(S.eN) && g.hero.realm >= e.realm) ? 'win' : 'lose');
    } else {
      S.resT += rdt;
      if (S.resT >= CX.resultT) this.end();
    }
  }

  private decide() {
    const S = this.st!;
    if (S.pick && S.pick === S.ePick) {   // 平手：转连按拼点
      S.tie = true; S.phase = 'mash'; S.t = 0; S.pN = 0; S.eN = 0;
      this.B.combat.texts.push({ anchor: { x: S.x, y: S.y, offsetY: -CX.hover }, x: S.x, y: S.y - 200, s: '势均力敌 · 拼点！', color: '#ffe08a', t: 0, vy: -16, big: true } as never);
      this.B.combat.fxq.push({ k: 'clash', x: S.x, y: S.y, power: 1.6, kind: S.water ? 'water' : 'ground', r: 0 });
      audio.sfx('clang');
      return;
    }
    this.settle(S.pick && beats(S.pick, S.ePick) ? 'win' : 'lose');
  }

  /** 结算：输的一方震出硬直、削一大截罡气、吃一下伤（走 hitEnemy / hitPlayer） */
  private settle(res: 'win' | 'lose') {
    const S = this.st!, B = this.B, c = B.combat, g = c.game, p = g.player, e = S.e;
    S.res = res; S.phase = 'result'; S.resT = 0;
    this.log.push({ res, tie: S.tie, pick: S.pick, ePick: S.ePick, pN: S.pN, eN: Math.floor(S.eN) });
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    const atk = c.pStats.atk * B.meleeMul;
    if (res === 'win') {
      B.dealTo(e, atk * CX.loseDmg, 'clash', p.x, p.y);
      const b = B.body(e);
      B.poiseDmg(b, b.poiseMax * CX.losePoise, e);
      b.staggerT = Math.max(b.staggerT, CX.loseStagger * (isBoss(e) ? 0.45 : 1));
      if (B.launchable(e)) B.launch(e, ux, uy, CX.losePush, 260, 'p', g.hero.realm, atk, false);
      B.combo(e, '拼招', false);   // 大字只上界面（头顶已经有一行胜负，再飘一行会叠在一起）
    } else {
      B.hurtPlayer(e.atk * 1.3, e.realm, e.x, e.y, e, 'clash');
      const pb = B.pb;
      B.poiseDmg(pb, pb.poiseMax * CX.losePoise, null);
      pb.staggerT = Math.max(pb.staggerT, CX.loseStagger * 0.8);
      B.launchPlayer(-ux, -uy, CX.losePush, 260, e);
    }
    const win = res === 'win';
    c.texts.push({ anchor: { x: S.x, y: S.y, offsetY: -CX.hover }, x: S.x, y: S.y - 270, s: S.tie ? (win ? `拼点胜 ${S.pN} : ${Math.floor(S.eN)}` : `拼点负 ${S.pN} : ${Math.floor(S.eN)}`) : `${S.pick ? PICK_NAME[S.pick] : '迟疑'} 对 ${PICK_NAME[S.ePick]} · ${win ? '胜' : '败'}`, color: win ? '#ffe08a' : '#ff8a6a', t: 0, vy: -14, big: true } as never);
    c.fxq.push({ k: 'clash', x: S.x, y: S.y, power: 3, kind: S.water ? 'water' : 'ground', r: 2, dir: Math.atan2(win ? uy : -uy, win ? ux : -ux) });
    g.juice(0.09, 0.75); g.aberrKick = 1;
    audio.sfx('boom', S.x, S.y);
    this.cool.set(e, g.time + 4);
  }

  private end() {
    const S = this.st; if (!S) return;
    const B = this.B, g = B.combat.game;
    if (!B.pb.air) B.playerLift = 0;
    if (!B.isAir(S.e)) S.e.lift = S.ez0;
    this.cool.set(S.e, g.time + 4);
    this.st = null;
  }

  /** NPC 之间拼招：不弹界面，按境界和性情直接结算（输的硬直、掉罡气、挨一下 npcHit） */
  npcClash(a: Enemy, b: Enemy): Enemy {
    const B = this.B, c = B.combat;
    const score = (e: Enemy) => e.realm * 1.0 + (temperOf(e) === 'fierce' ? 0.35 : temperOf(e) === 'calm' ? 0.2 : 0.28) + (isBoss(e) ? 1 : 0) + brnd() * 1.2;
    const sa = score(a), sb = score(b), win = sa >= sb ? a : b, lose = win === a ? b : a;
    const dx = lose.x - win.x, dy = lose.y - win.y, d = Math.hypot(dx, dy) || 1;
    c.npcHit(win, lose, win.atk * CX.loseDmg, win.realm, undefined, win.x, win.y);
    const lb = B.body(lose);
    B.poiseDmg(lb, lb.poiseMax * CX.losePoise, lose);
    lb.staggerT = Math.max(lb.staggerT, CX.loseStagger * 0.8);
    if (B.launchable(lose)) B.launch(lose, dx / d, dy / d, CX.losePush, 240, win, win.realm, win.atk, false);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    c.fxq.push({ k: 'clash', x: mx, y: my, power: 2.2, kind: B.deepWater(mx, my) ? 'water' : 'ground', r: 2, dir: Math.atan2(dy, dx) });
    c.texts.push({ x: mx, y: my - 170, s: `拼招 · ${win.name}胜`, color: '#ffd890', t: 0, vy: -20, big: false } as never);
    audio.sfx('clang', mx, my);
    this.cool.set(a, c.game.time + 4); this.cool.set(b, c.game.time + 4);
    return win;
  }

  /** 界面（BrawlHUD 每 0.1 息读一次） */
  hud() {
    const S = this.st; if (!S) return null;
    return { phase: S.phase, t: S.t, left: S.phase === 'pick' ? Math.max(0, CX.pickT - S.t) / CX.pickT : S.phase === 'mash' ? Math.max(0, CX.mashT - S.t) / CX.mashT : 0,
      pick: S.pick, ePick: S.phase === 'result' || (S.pick && S.t - S.revealT >= 0.12) || S.tie ? S.ePick : null, res: S.res, tie: S.tie,
      pN: S.pN, eN: Math.floor(S.eN), foe: S.e.name, temper: TEMPER_NAME[S.temper],
      /** 对方的起手式（摆出来以后才有） */
      tell: S.phase === 'pick' && S.told ? S.tell : null };
  }
}
