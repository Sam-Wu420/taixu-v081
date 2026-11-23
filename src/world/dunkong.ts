// 遁空：催动遁空梭破空疾行（重构版的「遁空梭」搬过来，规则照旧，只把速度按 B 版的地图大小改了）。
//   蓄势（2 息）：悬停不动，阵纹点亮、四方灵光向梭身汇聚；此时可以转向；
//   疾行：沿航向直冲，遁速是装备后普通遁速的 8 倍；方向键只能缓缓转向，停不下来；点过地图上的去处就自动朝那儿飞、临近自动收势；
//   收势（0.6 息）：速度落回寻常，之后冷却 20 息。
// 启动耗一成法力，疾行每息再耗 1%、期间不回气；与遁光加速互斥。
// 受创、被禁空压落、卸下遁空梭、法力耗尽、撞到天地尽头，都会被迫收势；蓄势时有敌人逼近也会被打断（疾行起来之后只是掠过敌人不算）。
//
// 重构版是 32 倍速——它的三张图之间隔着几百万单位；B 版一张图只有三十万宽，32 倍六秒就横穿了，地面细节也跟不上，
// 实测 8 倍（元婴带梭约每秒 1.3 万单位，横穿南荒二十来秒）地面还能跟上。
//
// 收官 P5：疾行途中被拦截（重构版有）。境界高过你、正锁着你的追兵（没跟丢、在神识锁定范围以内）追不上疾行的梭，
// 就燃血抢到你的航线前方截住：疾行起来后片刻，前方亮起拦截的遁光和落点、头顶冒字提示，约一息后你就会掠到那一点——
//   转向绕开（掠过时离那一点够远）就过去了，他被甩在身后；硬闯（掠过时离那一点太近）挨他一击、遁空梭被迫收势，他就在身边。
// 每趟疾行至多一次；没有追兵、追兵不比你高、已跟丢、在虚空里，都不触发。节奏按哈希取，不取 Math.random。
import type { Game } from './game';
import type { Enemy } from './combat';
import { audio } from './audio';
import { hashU } from '../core/rng';

export const DUNKONG_ITEM = 'art_dunkongsuo';
export const DUNKONG = {
  /** 元婴方可催动 */
  realm: 4,
  chargeSeconds: 2, retractSeconds: 0.6, cooldownSeconds: 20,
  /** 启动耗法力（占上限的比例）；疾行每秒耗法力 */
  startMana: 0.1, manaPerSecond: 0.01,
  /** 疾行时的遁速倍率 */
  speed: 8,
} as const;
export type DunkongPhase = 'idle' | 'charging' | 'cruising' | 'retracting';
/**
 * 疾行途中被拦截：at + jitter·哈希 秒后拦截（疾行起算）；lead：拦截点放在航线前方几息的路程处（也就是预警多久）；
 * reach：掠过拦截点时离它多近算硬闯（占这一刻每秒路程的比例）、至少 minR；giveUp：拦截点落到身后这么多息还没撞上就算绕开了
 */
export const DUNKONG_AMBUSH = { at: 0.8, jitter: 0.7, lead: 1.2, reach: 0.1, minR: 600, giveUp: 0.6 } as const;
/** 一次拦截：x / y 拦截点；r 算撞上的半径；t 亮出以来几秒；e 拦截的追兵 */
export interface DunkongAmbush { x: number; y: number; r: number; t: number; e: Enemy; name: string }
/** 遁空的灵光颜色（梭身的青金色） */
export const DUNKONG_COLOR: [number, number, number] = [0.62, 0.95, 0.92];

export class Dunkong {
  phase: DunkongPhase = 'idle';
  /** 当前阶段已过的秒数 */
  t = 0;
  /** 剩余冷却秒数 */
  cooldown = 0;
  /** 航向（世界平面上的弧度，0 = 正东） */
  heading = 0;
  /** 这一趟从催动起累计的秒数（画面里流光的流动用它） */
  clock = 0;
  /** 画面强度 0..1：疾行时渐到 1，收势后渐回 0 */
  k = 0;
  private lastHp = 1; private lastX = 0; private lastY = 0; private stuckT = 0;
  /** 收官 P5：这一趟疾行里的拦截（亮着的那一次）；ambushAt：几秒后拦截（不拦就是无穷）；trips：疾行过几趟（取哈希用） */
  ambush: DunkongAmbush | null = null;
  private ambushAt = Infinity; private trips = 0;

  constructor(private readonly game: Game) {}

  get active() { return this.phase !== 'idle'; }
  get cruising() { return this.phase === 'cruising'; }
  /** 身上是否祭着遁空梭 */
  get equipped() { return this.game.hero.equip?.flight === DUNKONG_ITEM; }
  /** 遁速倍率：起步 0.35 秒内冲到满速，收势时落回 1 */
  get speedMul(): number {
    const top = DUNKONG.speed - 1;
    if (this.phase === 'cruising') { const f = Math.min(1, this.t / 0.35); return 1 + top * f * f * (3 - 2 * f); }
    if (this.phase === 'retracting') { const f = Math.max(0, 1 - this.t / DUNKONG.retractSeconds); return 1 + top * f * f; }
    return 1;
  }
  /** 蓄势进度 0..1 */
  get spool(): number { return this.phase === 'charging' ? Math.min(1, this.t / DUNKONG.chargeSeconds) : 0; }
  /** 起步那一下的爆发 1 → 0 */
  get burst(): number { return this.phase === 'cruising' ? Math.max(0, 1 - this.t / 0.5) : 0; }

  /** 现在为什么不能催动；能催动则返回 null */
  refusal(): string | null {
    const g = this.game, h = g.hero;
    if (!this.equipped) return '须先在飞行位祭出遁空梭。';
    if (h.realm < DUNKONG.realm) return '元婴期方可驾驭遁空梭破空疾行。';
    if (this.phase !== 'idle') return '遁空梭正在运转。';
    if (this.cooldown > 0) return `遁空梭灵光未复，还需 ${Math.ceil(this.cooldown)} 息。`;
    if (g.mijing?.active || g.inCave) return '此地施展不开。';
    if (g.yuanying?.active) return '元婴出窍时无法驾驭遁空梭。';
    if (g.nuoyi?.active) return '虚空挪移之中，无法催动。';
    if (g.combat.inCombat) return '激战之中，无暇催动遁空梭。';
    if (g.noFlyT > 0) return `禁空之力未散，遁空梭提不起来！（${Math.ceil(g.noFlyT)} 息）`;
    { const jy = g.jueyu?.dunkongRefusal(); if (jy) return jy; }   // 绝域核心：空间紊乱
    if (h.mp < DUNKONG.startMana) return '法力不足，无法催动遁空梭。';
    return null;
  }

  /** 按键 / 按钮：未运转时催动，运转中收势 */
  toggle(): void {
    if (this.phase === 'charging' || this.phase === 'cruising') { this.retract('你收了遁空梭的灵光。', 'info'); return; }
    if (this.phase === 'retracting') return;
    this.start();
  }

  start(): boolean {
    const g = this.game, h = g.hero, p = g.player;
    const no = this.refusal();
    if (no) { g.toast(no, 'warn'); return false; }
    g.stand(); g.gathering = null;
    if (!p.flying) p.flying = true;
    p.boosting = false;
    h.mp = Math.max(0, h.mp - DUNKONG.startMana);
    this.phase = 'charging'; this.t = 0; this.clock = 0; this.stuckT = 0;
    const at = this.at();
    this.lastHp = h.hp; this.lastX = at.x; this.lastY = at.y;
    // 航向：点过去处就朝那儿，否则沿刚才行进的方向
    const d = g.destination, dir = g.travel.dir;
    if (d) this.heading = Math.atan2(d.y - p.y, d.x - p.x);
    else if (Math.abs(dir.x) + Math.abs(dir.y) > 0.01) this.heading = Math.atan2(dir.y, dir.x);
    else this.heading = p.facing > 0 ? 0 : Math.PI;
    for (let i = 0; i < 3; i++) g.combat.vfx.push({ kind: 'ring', x: p.x, y: p.y, r: 240 - i * 60, t: -i * 0.35, dur: 0.9, color: '160,240,232', fx: 'array' } as never);
    audio.sfx('spool');
    g.toast('遁空梭嗡鸣而起，阵纹逐一点亮——蓄势两息。', 'info');
    g.updateUI(true);
    return true;
  }

  /** 收势。why 是给玩家看的缘由 */
  retract(why?: string, tone: 'info' | 'warn' = 'warn'): void {
    if (this.phase !== 'charging' && this.phase !== 'cruising') return;
    const g = this.game, p = g.player, wasCruising = this.phase === 'cruising';
    this.phase = 'retracting'; this.t = 0; this.ambush = null; this.ambushAt = Infinity;
    if (wasCruising) {
      g.combat.vfx.push({ kind: 'ring', x: p.x, y: p.y, r: 300, t: 0, dur: 0.6, color: '160,240,232' } as never);
      g.juice(0, 0.25); g.aberrKick = Math.max(g.aberrKick, 0.6); audio.sfx('whoosh');
    }
    if (why) g.toast(why, tone);
    g.updateUI(true);
  }

  /** 转向：want 是玩家想去的方向（世界平面，可以是零向量）。蓄势时转得快，疾行时只能缓缓带 */
  steer(wantX: number, wantY: number, dt: number): void {
    if (Math.abs(wantX) + Math.abs(wantY) < 0.05) return;
    let d = Math.atan2(wantY, wantX) - this.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const rate = (this.phase === 'charging' ? 4 : this.game.destination ? 2.2 : 1.1) * dt;
    this.heading += Math.max(-rate, Math.min(rate, d));
  }

  /** 每帧推进（玩家可以行动时才调）。位移在 Game 的移动代码里做，这里只管阶段、法力和被迫收势 */
  update(dt: number): void {
    const g = this.game, h = g.hero, p = g.player;
    const target = this.phase === 'cruising' ? 1 : 0;
    this.k += (target - this.k) * Math.min(1, dt * (target > this.k ? 5 : 3.2));
    if (this.phase === 'idle') { if (this.cooldown > 0) { const was = Math.ceil(this.cooldown); this.cooldown = Math.max(0, this.cooldown - dt); if (Math.ceil(this.cooldown) !== was) g.updateUI(); } return; }
    this.t += dt; this.clock += dt;
    if (this.phase === 'charging' || this.phase === 'cruising') {
      if (!this.equipped) this.retract('遁空梭离了身，灵光一敛。');
      else if (!p.flying) this.retract('遁光被压落，遁空梭被迫收势！');
      else if (h.hp < this.lastHp - 0.0005) this.retract('受创！遁空梭灵光一散，被迫收势。');
      // 蓄势时有敌人逼近会被打断；已经疾行起来就不怕了——一掠而过，只有真挨了打才会被打落
      else if (g.combat.inCombat && this.phase === 'charging') this.retract('敌袭！遁空梭被迫收势。');
      else if (!g.combat.canMove) this.retract('身形受制，遁空梭被迫收势。');
    }
    this.lastHp = h.hp;
    if (this.phase === 'charging') {
      if (this.t >= DUNKONG.chargeSeconds) {
        this.phase = 'cruising'; this.t = 0; this.stuckT = 0;
        this.planAmbush();
        g.combat.vfx.push({ kind: 'ring', x: p.x, y: p.y, r: 420, t: 0, dur: 0.7, color: '200,250,245' } as never);
        g.juice(0, 0.4); g.aberrKick = Math.max(g.aberrKick, 1); audio.sfx('thunder');
        g.updateUI(true);
      }
    } else if (this.phase === 'cruising') {
      h.mp = Math.max(0, h.mp - DUNKONG.manaPerSecond * dt);
      const d = g.destination;
      // 撞到天地尽头（位置不再变化）
      const at = this.at();
      if (Math.hypot(at.x - this.lastX, at.y - this.lastY) < 1) this.stuckT += dt; else this.stuckT = 0;
      if (this.ambush || this.t >= this.ambushAt) this.tickAmbush(dt);   // 收官 P5：被拦截（硬闯就在这里被迫收势）
      if (this.phase === 'cruising') {
        if (h.mp <= 0.001) this.retract('法力枯竭，遁空梭收势。');
        else if (d && Math.hypot(d.x - p.x, d.y - p.y) < g.speed * DUNKONG.speed * 0.45 + 500) this.retract('已近去处，遁空梭收势。', 'info');
        else if (this.stuckT > 0.25) this.retract('前方已是天地尽头，遁空梭收势。', 'info');
      }
    } else if (this.phase === 'retracting' && this.t >= DUNKONG.retractSeconds) {
      this.phase = 'idle'; this.t = 0; this.cooldown = DUNKONG.cooldownSeconds;
      g.updateUI(true);
    }
    { const at = this.at(); this.lastX = at.x; this.lastY = at.y; }
  }
  /** 人现在在哪儿：在虚空里飞时，位置是虚空坐标（界内的坐标停在出界的那一点不动） */
  private at(): { x: number; y: number } { const g = this.game; return g.xukong?.inVoid ? g.xukong : g.player; }

  // ---------------------------------------------------------------- 收官 P5：疾行途中被拦截
  /**
   * 拦得住你的追兵：境界高过你、正锁着你（没跟丢）、没被定住；在虚空里不算（那里有虚空自己的追法）。
   * reach：还要在锁定范围以内（疾行起来那一刻看；之后你飞得比他快，到点时早已出了范围——他是燃血抢到前头去的）
   */
  private interceptor(reach: boolean): { e: Enemy; name: string } | null {
    const g = this.game, P = g.pursuit?.cur, p = g.player;
    if (!P || P.lost || P.e.dead || g.xukong?.inVoid) return null;
    if (P.realm <= g.hero.realm) return null;
    if (reach && Math.hypot(P.e.x - p.x, P.e.y - p.y) > P.lockR) return null;
    const st = P.e.st; if (st.freeze || st.stun || st.root) return null;
    return { e: P.e, name: P.name };
  }
  /** 疾行起来那一刻：有够得着的追兵，就定下几秒后拦截 */
  private planAmbush() {
    this.ambush = null; this.ambushAt = Infinity; this.trips++;
    const who = this.interceptor(true); if (!who) return;
    const A = DUNKONG_AMBUSH;
    this.ambushAt = A.at + A.jitter * hashU((who.e.id * 1e9) | 0, this.trips, 0x6b1);
  }
  private tickAmbush(dt: number) {
    const g = this.game, p = g.player, A = DUNKONG_AMBUSH, c = g.combat;
    if (!this.ambush) {
      // 到点了：他还拦得住，就抢到航线前方
      this.ambushAt = Infinity;
      const who = this.interceptor(false); if (!who) return;
      const v = (g.speed ?? 0) * this.speedMul, e = who.e;
      const x = p.x + Math.cos(this.heading) * v * A.lead, y = p.y + Math.sin(this.heading) * v * A.lead;
      this.ambush = { x, y, r: Math.max(A.minR, v * A.reach), t: 0, e, name: who.name };
      // 拦截的遁光：从他所在处一道血光抢到前方；落点亮起预警圈；头顶冒字
      c.fxq?.push({ k: 'xueying', x: e.x, y: e.y, x2: x, y2: y } as never);
      e.x = x; e.y = y; e.kx = 0; e.ky = 0; e.hx = x; e.hy = y; if (e.cs) { e.cs.x = x; e.cs.y = y; } e.trailReset = true; e.aggro = true;
      const P = g.pursuit?.cur; if (P && P.e === e) { P.blinkCd = Math.max(P.blinkCd, 6); P.lastX = p.x; P.lastY = p.y; }
      c.vfx?.push({ kind: 'warn', x, y, r: this.ambush.r, t: 0, dur: A.lead + A.giveUp, color: '255,90,70' } as never);
      // 航线上铺一道红光直到拦截点：疾行时拦截点远在画面外，脚下这道光告诉你「这条线上有人等着」——偏出去就绕开了
      c.vfx?.push({ kind: 'beam', x: p.x, y: p.y, x2: x, y2: y, r: 22, t: 0, dur: A.lead, color: '210,50,40' } as never);
      c.texts?.push({ x: p.x, y: p.y - 170, s: '前方有人截道！', color: '#ff8a70', t: 0, vy: -18, big: true } as never);
      g.toast(`${who.name}燃血抢到你航线前方截住去路——转向绕开，或者硬闯！`, 'warn');
      if (g.renderer) g.renderer.sense.alarm = 1;
      audio.sfx('ambush');
      return;
    }
    const a = this.ambush;
    a.t += dt;
    const d = Math.hypot(a.x - p.x, a.y - p.y);
    if (d < a.r) {
      // 硬闯：迎面挨一击，遁空梭被迫收势；他就在身边
      const e = a.e, name = a.name;
      this.retract(`${name}迎面截住，一掌把遁空梭打得灵光溃散——被迫收势！`);
      e.x = p.x + Math.cos(this.heading) * 260; e.y = p.y + Math.sin(this.heading) * 260; e.hx = e.x; e.hy = e.y; if (e.cs) { e.cs.x = e.x; e.cs.y = e.y; } e.trailReset = true;
      if (c.enemies && !c.enemies.includes(e)) c.enemies.push(e);
      c.hitPlayer(e.atk * 1.2, e.realm, undefined, e.x, e.y, e);
      g.juice(0.08, 0.5); audio.sfx('bladehit');
      return;
    }
    // 拦截点已落在身后、又没撞上：绕开了
    const ahead = (a.x - p.x) * Math.cos(this.heading) + (a.y - p.y) * Math.sin(this.heading);
    if ((ahead < 0 && d > a.r) || a.t > A.lead * 2 + A.giveUp) {
      this.ambush = null;
      g.toast(`绕开了${a.name}的拦截——他被甩在了身后！`, 'good');
      audio.sfx('whoosh');
    }
  }

  /** 读档、换图、身死时归零 */
  reset(): void { this.phase = 'idle'; this.t = 0; this.cooldown = 0; this.k = 0; this.clock = 0; this.ambush = null; this.ambushAt = Infinity; }
}
