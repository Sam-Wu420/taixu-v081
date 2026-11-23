// 虚空里的东西：空间乱流、上古残殿、巨兽遗骨、会追人的虚空兽。
//   都在飞行平面那一层（各界的穹顶之上、界与界之间）；位置按格子的种子定，所以每个人的虚空是同一个样子。
//   乱流：闯进去遁速大减、法力流失、被气流裹着走；
//   残殿、遗骨：飞近了按「交互」探查一次——或得遗宝，或有感悟，或惊动了什么；探过的记在存档里；
//   虚空兽：平日缓缓游弋，察觉到人就追上来。被追上（或自己撞上去）就是即时斗法（voidfight.ts），打不过可以飞开甩脱；
//   追兵：元婴以上的追兵会跟着破界追出来（chase），追上了同样斗法；甩出神识范围、或降回某一界，就算逃脱。
import type { Game } from './game';
import type { Realm } from '../data/zhujie';
import type { DNode } from './modal';
import type { Enemy } from './combat';
import * as C from './cultivation';
import { VOIDFIGHT, type VoidFoeSrc } from './voidfight';
import { audio } from './audio';

export type VoidKind = 'storm' | 'ruin' | 'bones' | 'beast';
export interface VoidThing {
  id: string; kind: VoidKind; x: number; y: number;
  /** 乱流的半径 / 残殿、遗骨、兽的大小（虚空单位） */
  r: number; seed: number;
  /** 朝向（弧度）；兽：是否已盯上人；残殿遗骨：是否探过 */
  a: number; hot?: boolean; done?: boolean;
  /** 兽的品阶（4＝元婴，5＝化神，6＝炼虚） */
  tier?: number; name: string;
  /** 收官 P9（画面用）：交手那一刻网格换立板——边缘亮起 0..1；往立板那一层（lift，飞行平面上的高度）靠的程度 0..1 */
  flare?: number; lift?: number; liftK?: number;
  /** 收官 P9（画面用）：网格显几成（交接时淡出），不给是 1 */
  fade?: number;
}
interface Beast extends VoidThing { vx: number; vy: number; home: { x: number; y: number }; calm: number; wander: number; rest: number; fight?: boolean; onEnd?: VoidFoeSrc['onEnd'] }
/** 追进虚空的追兵 */
export interface VoidChaser { id: string; name: string; x: number; y: number; vx: number; vy: number; enemy: Enemy; calm: number; fight?: boolean; onEnd?: VoidFoeSrc['onEnd'] }

const CELL = 9000;
const mix = (h: number) => { h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };
const RUINS = ['上古残殿', '坠星台', '无名仙阙', '断碑林', '沉舟墟'];
const BONES = ['鲲骨', '巨龙遗骸', '吞天兽骨', '玄龟残甲'];
const BEASTS: [string, number][] = [['噬灵鳐', 4], ['虚空游鲲', 5], ['裂界蠕龙', 5], ['星骸蜃', 4], ['无相渊兽', 6]];

export const VOIDLIFE = {
  /** 多近算「在旁边」（可以探查） */ reach: 520,
  /** 兽察觉人的距离、追丢的距离 */ sense: 3200, lose: 7600,
  /** 乱流里的遁速倍率、每秒流失的法力（比例） */ stormSlow: 0.42, stormDrain: 0.035,
};

export class VoidLife {
  private cells = new Map<string, VoidThing[]>();
  private beasts: Beast[] = [];
  /** 追进虚空的追兵（至多一个） */
  chaser: VoidChaser | null = null;
  /** 正在游动的虚空兽（给画面：斗法换手之前，交手的那几头按界内的画法画） */
  get roaming(): readonly VoidThing[] { return this.beasts; }
  /** 这一帧在人周围的东西（给画面和界面） */
  near: VoidThing[] = [];
  /** 身在乱流里的程度 0..1；乱流的推力（虚空单位 / 秒） */
  storm = 0; push = { x: 0, y: 0 };
  private hintT = 0; private stormHinted = false; private beastHinted = false;
  private clock = 0;
  constructor(private game: Game) { /* */ }

  private get seen(): Record<string, number> { const w = this.game.ws as unknown as { voidSeen?: Record<string, number> }; return (w.voidSeen ??= {}); }

  /** 一格里的东西（不含离各界太近的） */
  private cell(cx: number, cy: number, realms: readonly Realm[]): VoidThing[] {
    const key = cx + ',' + cy;
    let list = this.cells.get(key);
    if (list) return list;
    list = [];
    const s = mix(Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663) ^ 0x5bd1e995), f = (b: number) => ((mix(s + b * 7919) >>> 8) & 0xffff) / 65535;
    const roll = f(1), x = (cx + 0.15 + f(2) * 0.7) * CELL, y = (cy + 0.15 + f(3) * 0.7) * CELL;
    const clear = (pad: number) => !realms.some((q) => Math.hypot((x - q.x) / (q.rx + pad), (y - q.y) / (q.ry + pad)) < 1) && Math.hypot(x, y) > 9000;
    if (roll < 0.11) { if (clear(2600)) list.push({ id: 's' + key, kind: 'storm', x, y, r: 1500 + f(4) * 1900, seed: s, a: f(5) * 6.28, name: '空间乱流' }); }
    else if (roll < 0.18) { if (clear(900)) list.push({ id: 'r' + key, kind: 'ruin', x, y, r: 420 + f(4) * 260, seed: s, a: f(5) * 6.28, name: RUINS[s % RUINS.length] }); }
    else if (roll < 0.22) { if (clear(900)) list.push({ id: 'b' + key, kind: 'bones', x, y, r: 900 + f(4) * 700, seed: s, a: f(5) * 6.28, name: BONES[s % BONES.length] }); }
    else if (roll < 0.29) { if (clear(2200)) { const B = BEASTS[s % BEASTS.length]; list.push({ id: 'v' + key, kind: 'beast', x, y, r: 170 + f(4) * 150 + (B[1] - 4) * 90, seed: s, a: f(5) * 6.28, tier: B[1], name: B[0] }); } }
    this.cells.set(key, list);
    if (this.cells.size > 900) this.cells.clear();
    return list;
  }

  /** 每帧：身在飞行平面那一层时才有这些（还在某一界的穹顶里时没有） */
  update(dt: number, x: number, y: number, vx: number, vy: number, speed: number, realms: readonly Realm[], out: boolean): void {
    this.clock += dt;
    this.near.length = 0; this.storm = 0; this.push.x = this.push.y = 0;
    this.chaseTick(dt, x, y, speed);
    if (!out) { this.beasts.length = 0; return; }
    const g = this.game, h = g.hero, cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), day = g.day;
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) for (const t of this.cell(cx + i, cy + j, realms)) {
      if (t.kind === 'beast') {
        // 巢里的兽：没被打跑的就放出来游弋
        const gone = this.seen[t.id];
        if (gone && day - gone < 30) continue;
        if (!this.beasts.some((b) => b.id === t.id)) this.beasts.push({ ...t, vx: 0, vy: 0, home: { x: t.x, y: t.y }, calm: 0, wander: t.a, rest: 0 });
        continue;
      }
      if (t.kind !== 'storm') t.done = !!this.seen[t.id];
      this.near.push(t);
      if (t.kind === 'storm') {
        const d = Math.hypot(x - t.x, y - t.y);
        if (d < t.r) {
          const k = Math.min(1, (t.r - d) / (t.r * 0.35));
          if (k > this.storm) this.storm = k;
          // 气流绕着乱流眼打转，略往里吸
          const tx = -(y - t.y) / (d || 1), ty = (x - t.x) / (d || 1), sp = speed * 0.33 * k;
          this.push.x += tx * sp - (x - t.x) / (d || 1) * sp * 0.25; this.push.y += ty * sp - (y - t.y) / (d || 1) * sp * 0.25;
        }
      }
    }
    if (this.storm > 0) {
      h.mp = Math.max(0, h.mp - VOIDLIFE.stormDrain * this.storm * dt);
      if (h.mp <= 0.001) h.hp = Math.max(0.05, h.hp - 0.02 * this.storm * dt);
      if (!this.stormHinted) { this.stormHinted = true; g.toast('闯进了空间乱流——遁速大减，法力不住流失。朝外飞出去。', 'warn'); audio.sfx('thunder'); }
    } else if (this.stormHinted && this.clock > this.hintT) { this.stormHinted = false; this.hintT = this.clock + 8; }
    // —— 虚空兽
    const F = g.xukong.fight;
    for (let i = this.beasts.length - 1; i >= 0; i--) {
      const b = this.beasts[i], dx = x - b.x, dy = y - b.y, d = Math.hypot(dx, dy);
      if (b.fight) continue;   // 正在斗法场里
      if (d > 26000) { this.beasts.splice(i, 1); continue; }
      b.calm = Math.max(0, b.calm - dt); b.rest = Math.max(0, b.rest - dt);
      if (!b.hot && b.calm <= 0 && d < VOIDLIFE.sense) { b.hot = true; if (!this.beastHinted) { this.beastHinted = true; g.toast(`${b.name}察觉到了你的气息，正朝这边游来——全速飞开，或者等它近了再作打算。`, 'warn'); } audio.sfx('boom'); }
      if (b.hot && d > VOIDLIFE.lose) { b.hot = false; b.calm = 6; }
      let tx: number, ty: number, sp: number;
      if (b.hot) {
        // 追：比人的巡航遁速略慢，直线甩得掉；每隔一阵猛蹿一下
        const burst = b.rest <= 0 && d < 2600;
        if (burst) b.rest = 7;
        sp = speed * (b.rest > 5.2 ? 1.35 : 0.84);
        tx = dx / (d || 1); ty = dy / (d || 1);
      } else {
        b.wander += (Math.sin(this.clock * 0.13 + b.seed) * 0.4) * dt;
        const hx = b.home.x - b.x, hy = b.home.y - b.y, hd = Math.hypot(hx, hy);
        tx = Math.cos(b.wander) + (hd > 3000 ? hx / hd : 0); ty = Math.sin(b.wander) + (hd > 3000 ? hy / hd : 0);
        const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl; sp = speed * 0.12;
      }
      const e = Math.min(1, dt * 1.6);
      b.vx += (tx * sp - b.vx) * e; b.vy += (ty * sp - b.vy) * e;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (Math.hypot(b.vx, b.vy) > 1) b.a = Math.atan2(b.vy, b.vx);
      this.near.push(b);
      // 撞上了（它追上来，或者自己飞进它的身形里）：即时斗法
      // （刚被甩开的那一阵它还没回过神，不会马上又扑上来）
      if (b.calm <= 0 && d < b.r * 0.6 + VOIDFIGHT.engage && !g.modal && !g.hero.dead) this.engage(b);
    }
    void vx; void vy;
  }

  /** 和一头虚空兽交手：交给斗法；打完按结局处置这条记录 */
  private engage(b: Beast): void {
    const g = this.game;
    b.fight = true; b.hot = true;
    b.onEnd = (how) => {
      b.fight = false;
      if (how === 'won') { this.seen[b.id] = g.day || 1; this.beasts = this.beasts.filter((q) => q !== b); }
      else { b.hot = false; b.calm = 14; b.vx = b.vy = 0; }
    };
    g.xukong.fight.engage(b);
  }

  /** 追兵跟着破界追了出来：落在身后一段，照样追 */
  chase(e: Enemy, name: string, x: number, y: number): void {
    const a = Math.random() * Math.PI * 2;
    this.chaser = { id: 'chaser', name, x: x + Math.cos(a) * 160, y: y + Math.sin(a) * 160, vx: 0, vy: 0, enemy: e, calm: 2.5 };
  }
  /** 追兵就此跟丢了（甩开、降回某一界）：结束这场追杀 */
  loseChaser(): void {
    const c = this.chaser; if (!c) return;
    this.chaser = null;
    const P = this.game.pursuit?.cur;
    if (P && P.e === c.enemy) this.game.pursuit.finish(c.enemy.dead ? 'killed' : 'escaped');
  }
  private chaseTick(dt: number, x: number, y: number, speed: number): void {
    const c = this.chaser, g = this.game;
    if (!c) return;
    if (c.enemy.dead) { this.loseChaser(); return; }
    if (c.fight) return;
    const dx = x - c.x, dy = y - c.y, d = Math.hypot(dx, dy);
    if (d > VOIDLIFE.lose) { g.toast(`${c.name}的气机越来越远，终于断了——甩掉了！`, 'good'); this.loseChaser(); return; }
    c.calm = Math.max(0, c.calm - dt);
    // 比人的遁速略慢：直线飞、催动遁空都甩得掉；刚交过手的那几息落在后面
    const sp = speed * (c.calm > 0 ? 0.5 : 0.9), e = Math.min(1, dt * 2);
    c.vx += (dx / (d || 1) * sp - c.vx) * e; c.vy += (dy / (d || 1) * sp - c.vy) * e;
    c.x += c.vx * dt; c.y += c.vy * dt;
    if (c.calm <= 0 && d < VOIDFIGHT.engage * 0.8 && !g.modal && !g.hero.dead) {
      c.fight = true;
      c.onEnd = (how) => { c.fight = false; if (how === 'won') this.loseChaser(); else { c.calm = 6; c.vx = c.vy = 0; } };
      g.xukong.fight.engage({ id: c.id, name: c.name, x: c.x, y: c.y, tier: c.enemy.realm, enemy: c.enemy, onEnd: (how, e) => { const q = g.xukong.fight.toVoid(e.x, e.y); c.x = q.x; c.y = q.y; c.onEnd?.(how, e); } });
    }
  }

  /** 身边可以探查的残殿 / 遗骨 */
  target(x: number, y: number): VoidThing | null {
    let best: VoidThing | null = null, bd = Infinity;
    for (const t of this.near) { if ((t.kind !== 'ruin' && t.kind !== 'bones') || t.done) continue; const d = Math.hypot(t.x - x, t.y - y) - t.r; if (d < VOIDLIFE.reach && d < bd) { bd = d; best = t; } }
    return best;
  }

  /** 按了交互：探查身边的残殿 / 遗骨 */
  interact(x: number, y: number): boolean {
    const t = this.target(x, y); if (!t) return false;
    const g = this.game, h = g.hero, s = mix(t.seed ^ 0x2545f491), roll = (s & 1023) / 1023;
    const done = () => { this.seen[t.id] = g.day || 1; t.done = true; };
    const close = (text: string, mood: DNode['mood'] = 'mystic'): DNode => ({ speaker: t.name, text, options: [{ label: '离开', act: () => null }], mood });
    const stones = Math.round((1800 + roll * 4200) * (1 + Math.max(0, h.realm - 4) * 0.8) / 100) * 100;
    if (t.kind === 'ruin') {
      g.openDialog({
        speaker: t.name, title: '虚空 · 遗迹', mood: 'mystic',
        text: '一截断裂的殿基悬在虚空里，柱础上的符文早已黯淡，偶尔还有一丝灵光顺着裂缝游走。不知是哪一界崩碎时飘出来的。\n\n殿心有一道半塌的石门，门后似乎还有东西。',
        options: [
          { label: '进去搜一搜', act: () => {
            done();
            if (roll < 0.5) { C.addItem(h, 'mat_lingshi', stones); return close(`石门后是一间储物的偏殿。架子早已朽烂，地上散着几只玉匣——其中一只的禁制还在。\n\n获得：灵石 ${stones}。`); }
            if (roll < 0.78) { const sk = g.combat.randomScroll(Math.min(4, h.realm)); if (sk) { C.addItem(h, sk, 1); return close('偏殿的石壁上嵌着一枚玉简，灵光未散。你将神识探入——是一门完整的法诀。\n\n获得：一卷法术玉简。'); } C.addItem(h, 'mat_lingshi', stones); return close(`只找到些散落的灵石。\n\n获得：灵石 ${stones}。`); }
            h.hp = Math.max(0.2, h.hp - 0.3); h.mp = Math.max(0, h.mp - 0.3); C.addItem(h, 'mat_lingshi', Math.round(stones / 2));
            return close(`你刚跨过门槛，残存的禁制轰然发动！你硬扛着退了出来，气血翻涌——禁制后面只剩半匣灵石。\n\n获得：灵石 ${Math.round(stones / 2)}。受了些伤。`, 'danger' as DNode['mood']);
          } },
          { label: '只在殿外参详符文', act: () => { done(); const msgs: C.Msg[] = []; C.gainExp(h, C.need(h) * C.INSIGHT * 0.12, msgs); return close('你绕着柱础看了许久。这些符文的走势与如今各派所传大不相同，像是更古老的一脉——虽不能尽解，却隐约触到了一点什么。\n\n略有感悟。'); } },
          { label: '不碰为妙', act: () => null },
        ],
      });
    } else {
      g.openDialog({
        speaker: t.name, title: '虚空 · 遗骨', mood: 'mystic',
        text: '一副大得不可思议的骨架横在虚空里，每一根肋骨都有山岳那么长。骨上没有血肉，只余一层淡淡的荧光——它死了不知多少万年，威压却仍让人心悸。',
        options: [
          { label: '在骨下打坐，感悟它残留的威压', act: () => {
            done();
            const msgs: C.Msg[] = []; C.gainExp(h, C.need(h) * C.INSIGHT * (0.16 + roll * 0.1), msgs);
            const days = 20 + Math.round(roll * 30); C.passDays(h, days, false, 1, msgs); g.day += days; g.npcs.daily(days);
            return close(`你在巨骨之下盘膝坐定。那股威压如山如海，初时几乎喘不过气；${days} 日之后，你竟渐渐能在其中运转周天了。\n\n修为有所精进。`);
          } },
          { label: '取一截骨刺', act: () => { done(); C.addItem(h, 'mat_lingshi', stones * 2); return close(`骨刺离体的一瞬，整副骨架的荧光暗了一分。这等上古遗骨的碎片，拿到任何一界的坊市都是抢手货——你当即估了价。\n\n折合灵石 ${stones * 2}。`); } },
          { label: '离开', act: () => null },
        ],
      });
    }
    return true;
  }

  reset(): void { this.chaser = null; this.beasts.length = 0; this.near.length = 0; this.storm = 0; this.cells.clear(); this.stormHinted = this.beastHinted = false; }
}
