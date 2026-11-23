// v0.53：元婴神通「元婴出窍」
// - 出窍：肉身就地盘坐，罩一层护体金光（护光吸收的是气血上限的比例）；元婴离体——其实就是主角本人缩成尺许，
//   周身金光流转，遁速倍增、法术伤害 +25%、所受伤害 ×0.75，出窍一刹放出神识冲击震慑四方
// - 元婴走不出神识之外：离肉身太远会被牵回来
// - 敌人更愿意去打毫无还手之力的肉身（仇恨目标「肉身」权重高）：护光碎了，元婴被震回肉身、眩晕一息
// - 归窍：再按一次；时限到、法力枯竭、护光被打破、进城 / 进洞府 / 传送时自行归窍
// - 元婴之身可以照常施法、灵力化形（化形从元婴身上起手），元婴瞬移更远、冷却减半；出窍时神识看得穿禁制阵眼
// - 一切都是代码绘制：元婴 = drawCharacter 缩小 + 金光；出窍 / 归窍光柱、护体金光、神识冲击都在这里画
import type { Game } from './game';
import type { Drawable } from './life';
import type { FxSys, RGB } from '../gl/fx';
import type { ArtSkill } from '../data/arts';
import type { Enemy } from './combat';
import { CharState, drawCharacter } from '../gfx/character';
import { realmTakeK } from './combat';
import { audio } from './audio';

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const GOLD: RGB = [1, 0.85, 0.52];
const VIOLET: RGB = [0.72, 0.6, 1];
/** 元婴相对肉身的缩放 */
export const YING_SCALE = 0.46;

interface Body { x: number; y: number; st: CharState; shield: number; max: number; flying: boolean; hitT: number }
interface Pillar { x: number; y: number; t: number; dur: number; up: boolean }

export class YuanyingSys {
  active = false;
  t = 0; max = 0; lv = 0;
  body: Body | null = null;
  private pillars: Pillar[] = [];
  private waves: { x: number; y: number; t: number; r: number }[] = [];
  private motes: { a: number; r: number; h: number; s: number }[] = Array.from({ length: 14 }, (_, i) => ({ a: (i / 14) * TAU, r: 18 + Math.random() * 16, h: Math.random() * 40, s: 0.8 + Math.random() * 1.4 }));
  private trail: [number, number, number][] = [];
  constructor(public game: Game) {}

  /** 元婴（或主角）此刻所在——化形、玄武跟随用 */
  anchor(): { x: number; y: number } | null { const p = this.game.player; return this.active ? { x: p.x, y: p.y } : null; }
  get leash() { return Math.max(900, this.game.senseRadius * 1.05); }
  /** 出窍时的伤害加成 / 受伤系数 */
  atkMul() { return this.active ? 1.25 : 1; }
  takeMul() { return this.active ? 0.75 : 1; }

  /** 施放「元婴出窍」：combat.cast 已扣法力、记冷却 */
  out(s: ArtSkill, lv: number, dmg: number, src: { realm: number; stCh: number; status?: ArtSkill['status']; school?: ArtSkill['school'] }) {
    const g = this.game, p = g.player, h = g.hero, c = g.combat;
    if (this.active) return;
    if (g.inCave || g.tianxiang?.active) { g.toast('此时此地，元婴出不得窍。', 'warn'); return; }
    if (p.sitting) g.stand();
    const st = new CharState(p.x, p.y);
    st.yaw = st.targetYaw = p.st.yaw; st.setAction('sit'); (st as any).blend = 1;
    const max = 0.38 + lv * 0.06 + (h.realm >= 5 ? 0.2 : 0);
    this.body = { x: p.x, y: p.y, st, shield: max, max, flying: p.flying, hitT: 0 };
    this.active = true; this.lv = lv;
    this.max = this.t = (s.dur ?? 25) * (1 + lv * 0.15);
    p.flying = true; p.boosting = false;
    p.st.strands.clear(); p.st.springs.clear();
    this.trail = [];
    // 出窍光柱 + 神识冲击
    this.pillars.push({ x: p.x, y: p.y, t: 0, dur: 0.9, up: true });
    const R = (s.radius ?? 420) * (1 + lv * 0.1);
    this.waves.push({ x: p.x, y: p.y, t: 0, r: R });
    for (const e of c.enemies) {
      if (e.dead || Math.hypot(e.x - p.x, (e.y - p.y) * 1.2) > R) continue;
      c.hitEnemy(e, dmg * (lv >= 3 ? 1.4 : 1), { realm: src.realm, status: s.status, stCh: (s.status?.ch ?? 0) + lv * 0.05, school: '识', skill: s.id }, p.x, p.y);
    }
    c.impact(p.x, p.y, 3, '255,215,140');
    c.invulnT = Math.max(c.invulnT, 0.6);
    g.cinema(p.x, p.y - 60, 1.12, 1.1);
    audio.sfx('bell'); audio.sfx('chime');
    g.toast(`元婴出窍！（${Math.round(this.t)} 息；再按一次归窍。肉身护光被打破会被震回）`, 'good');
    g.updateUI(true);
  }
  /** 归窍：元婴回到肉身 */
  back(why: 'manual' | 'time' | 'mp' | 'broken' | 'force' | 'leave') {
    const g = this.game, p = g.player, b = this.body;
    if (g.yingEsc) { g.endYingEscape('rebuild'); return; }   // v0.70：肉身已毁的元婴——没有窍可归，只能就地重塑肉身
    if (!this.active || !b) { this.active = false; this.body = null; return; }
    this.pillars.push({ x: p.x, y: p.y, t: 0, dur: 0.45, up: false });
    if (why !== 'force') {
      g.combat.addGhosts(p.x, p.y, b.x, b.y, 8, '255,215,140', 0.5);
      p.x = b.x; p.y = b.y; p.st.x = b.x; p.st.y = b.y;
      g.cam.x += (b.x - g.cam.x) * 0.5; g.cam.y += (b.y - g.cam.y) * 0.5;
      p.flying = b.flying;
      this.pillars.push({ x: b.x, y: b.y, t: 0, dur: 0.6, up: false });
    }
    // 衣袂、发丝是按世界坐标模拟的弹簧：瞬间回到肉身、又从尺许放回原身，必须重置，否则会被甩成一地尖刺
    p.st.strands.clear(); p.st.springs.clear();
    this.active = false; this.body = null; this.t = 0;
    if (why === 'broken') {
      g.combat.pst.stun = { t: 1, dps: 0 };
      g.combat.impact(p.x, p.y, 2, '255,200,120');
      g.toast('肉身护光碎裂——元婴被震回肉身，神魂一阵眩晕！', 'warn');
    } else if (why === 'time') g.toast('出窍时限已到，元婴归窍。', 'info');
    else if (why === 'mp') g.toast('法力枯竭，元婴不得不归窍。', 'warn');
    else if (why === 'manual') g.toast('元婴归窍。', 'info');
    audio.sfx('whoosh');
    g.renderer?.resetStill();
    g.updateUI(true);
  }
  /** 读档 / 新开局 / 倒下：直接清掉（不移动主角） */
  reset() { this.active = false; this.body = null; this.t = 0; this.pillars = []; this.waves = []; this.trail = []; }

  update(dt: number) {
    for (const q of this.pillars) q.t += dt; this.pillars = this.pillars.filter((q) => q.t < q.dur);
    for (const w of this.waves) w.t += dt; this.waves = this.waves.filter((w) => w.t < 0.9);
    if (!this.active || !this.body) return;
    const g = this.game, p = g.player, h = g.hero, b = this.body;
    if (h.dead) { this.reset(); return; }
    this.t -= dt;
    b.hitT = Math.max(0, b.hitT - dt);
    b.st.x = b.x; b.st.y = b.y; b.st.setAction('sit'); b.st.update(dt);
    h.mp = Math.max(0, h.mp - dt * 0.006);
    // 元婴走不出神识：牵回
    const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy), L = this.leash;
    if (d > L) { p.x = b.x + dx / d * L; p.y = b.y + dy / d * L; if (Math.random() < dt * 2) g.toast('元婴离肉身太远，神魂一阵牵扯，再远不得。', 'warn'); }
    // 元婴金色尾迹
    this.trail.push([p.x, p.y - p.st.lift - 30, g.time]);
    while (this.trail.length && g.time - this.trail[0][2] > 0.5) this.trail.shift();
    if (this.t <= 0) this.back('time');
    else if (h.mp <= 0.01) this.back('mp');
  }
  /** 敌人打在肉身上：护光先挡，挡不住震回元婴、余下的伤落到气血上 */
  hitBody(raw: number, srcRealm: number, from?: Enemy) {
    const g = this.game, b = this.body, c = g.combat, h = g.hero;
    if (!b || !this.active) return;
    const frac = raw * realmTakeK(srcRealm - h.realm, h.realm) / Math.max(1, c.pStats.hp);
    b.hitT = 0.25;
    const ab = Math.min(b.shield, frac);
    b.shield -= ab;
    c.texts.push({ x: b.x, y: b.y - 120, s: b.shield > 0 ? `护光 -${Math.max(1, Math.round(ab * 100))}%` : '护光碎裂', color: '#ffd890', t: 0, vy: -40 } as any);
    void from;
    if (b.shield <= 1e-4) {
      const rest = frac - ab;
      this.back('broken');
      if (rest > 0) { h.hp -= rest * 1.5; if (h.hp <= 0) h.hp = 0.02; }
    }
  }

  // ------------------------------------------------------------ 绘制
  /** 肉身（Y 排序）与出窍 / 归窍光柱 */
  collect(out: Drawable[]) {
    const g = this.game, t = g.time, b = this.body;
    if (b && this.active) {
      out.push({ y: b.y, k: 'D·元婴肉身', draw: (gc) => this.drawBody(gc, b, t) });
    }
    for (const q of this.pillars) out.push({ y: q.y + 2, k: 'D·元婴', draw: (gc) => this.drawPillar(gc, q) });
    for (const w of this.waves) out.push({ y: w.y - w.r * 0.5, k: 'D·元婴', draw: (gc) => this.drawWave(gc, w) });
  }
  private drawBody(g: G, b: Body, t: number) {
    const p = this.game.player;
    g.save();
    g.fillStyle = 'rgba(40,40,30,0.3)'; g.beginPath(); g.ellipse(b.x, b.y + 2, 26, 8, 0, 0, TAU); g.fill();
    // 肉身：神魂离体，形如入定，色泽略黯
    g.globalAlpha *= 0.92;
    drawCharacter(g, p.look, b.st, 1.12, 0);
    g.restore();
    // 护体金光：钟形光罩 + 莲瓣 + 旋转符环；越薄越淡，受击时闪
    const k = clamp(b.shield / b.max, 0, 1), flash = b.hitT * 4;
    const R = 62, H = 150;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const a = (0.25 + 0.55 * k) * (0.85 + 0.15 * Math.sin(t * 3)) + flash * 0.4;
    const gr = g.createRadialGradient(b.x, b.y - H * 0.45, 4, b.x, b.y - H * 0.45, H * 0.7);
    gr.addColorStop(0, `rgba(255,220,150,${0.06 * a})`); gr.addColorStop(0.7, `rgba(255,205,120,${0.16 * a})`); gr.addColorStop(1, 'rgba(255,200,110,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(b.x - R, b.y); g.bezierCurveTo(b.x - R * 1.15, b.y - H * 0.6, b.x - R * 0.5, b.y - H, b.x, b.y - H); g.bezierCurveTo(b.x + R * 0.5, b.y - H, b.x + R * 1.15, b.y - H * 0.6, b.x + R, b.y); g.closePath(); g.fill();
    g.strokeStyle = `rgba(255,224,160,${0.55 * a})`; g.lineWidth = 2;
    g.stroke();
    // 莲瓣
    for (let i = 0; i < 8; i++) {
      const an = (i / 8) * TAU + t * 0.4, px = b.x + Math.cos(an) * R * 1.05, py = b.y + Math.sin(an) * R * 0.32;
      g.fillStyle = `rgba(255,214,140,${0.22 * a})`;
      g.beginPath(); g.ellipse(px, py - 6, 9, 16, Math.cos(an) * 0.6, 0, TAU); g.fill();
    }
    // 底环 + 符环
    g.strokeStyle = `rgba(255,220,150,${0.6 * a})`; g.lineWidth = 2.5;
    g.beginPath(); g.ellipse(b.x, b.y, R * 1.15, R * 0.36, 0, 0, TAU); g.stroke();
    g.setLineDash([6, 10]); g.lineDashOffset = -t * 30; g.lineWidth = 1.5;
    g.beginPath(); g.ellipse(b.x, b.y, R * 1.35, R * 0.43, 0, 0, TAU); g.stroke();
    g.setLineDash([]);
    g.restore();
    // 护光余量
    g.save();
    g.fillStyle = 'rgba(20,16,10,0.5)'; g.fillRect(b.x - 30, b.y - H - 14, 60, 5);
    g.fillStyle = k > 0.35 ? 'rgba(255,214,130,0.95)' : 'rgba(255,120,90,0.95)'; g.fillRect(b.x - 30, b.y - H - 14, 60 * k, 5);
    g.restore();
  }
  private drawPillar(g: G, q: Pillar) {
    const u = q.t / q.dur, a = Math.sin(Math.min(1, u) * Math.PI);
    const H = 520, w = 46 * (q.up ? 1 - u * 0.4 : 0.5 + u * 0.5);
    g.save(); g.globalCompositeOperation = 'lighter';
    const top = q.up ? q.y - 40 - H * Math.min(1, u * 1.8) : q.y - 40 - H * (1 - u);
    const gr = g.createLinearGradient(0, q.y, 0, top);
    gr.addColorStop(0, `rgba(255,235,180,${0.75 * a})`); gr.addColorStop(0.5, `rgba(255,210,130,${0.4 * a})`); gr.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = gr; g.fillRect(q.x - w / 2, top, w, q.y - top);
    g.fillStyle = `rgba(255,250,230,${0.6 * a})`; g.fillRect(q.x - w * 0.12, top, w * 0.24, q.y - top);
    g.strokeStyle = `rgba(255,220,150,${0.7 * a})`; g.lineWidth = 3;
    g.beginPath(); g.ellipse(q.x, q.y, 50 + u * 60, 16 + u * 18, 0, 0, TAU); g.stroke();
    g.restore();
  }
  private drawWave(g: G, w: { x: number; y: number; t: number; r: number }) {
    const u = w.t / 0.9;
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const uu = clamp(u * 1.3 - i * 0.15, 0, 1); if (uu <= 0 || uu >= 1) continue;
      const r = w.r * (0.15 + 0.85 * uu), a = (1 - uu) * 0.7;
      g.strokeStyle = `rgba(${i === 1 ? '200,170,255' : '255,220,160'},${a})`; g.lineWidth = 6 * (1 - uu) + 1.5;
      g.beginPath(); g.ellipse(w.x, w.y, r, r * 0.42, 0, 0, TAU); g.stroke();
    }
    g.restore();
  }
  /** 画元婴本体（替代 render.drawPlayer 里的主角绘制）：金光 + 缩小的人 */
  drawYing(g: G, dt: number, scale: number) {
    const game = this.game, p = game.player, st = p.st, t = game.time;
    const x = p.x, y = p.y - st.lift;
    const breathe = 1 + 0.06 * Math.sin(t * 3);
    // 尾迹
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 1; i < this.trail.length; i++) {
      const [x0, y0] = this.trail[i - 1], [x1, y1, tt] = this.trail[i];
      const a = clamp(1 - (t - tt) / 0.5, 0, 1);
      g.strokeStyle = `rgba(255,214,140,${0.45 * a})`; g.lineWidth = 10 * a; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    // 背后金光
    const R = 64 * breathe;
    const gr = g.createRadialGradient(x, y - 28, 2, x, y - 28, R);
    gr.addColorStop(0, 'rgba(255,240,200,0.55)'); gr.addColorStop(0.45, 'rgba(255,205,120,0.25)'); gr.addColorStop(1, 'rgba(200,160,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y - 28, R, 0, TAU); g.fill();
    // 头后光轮
    g.strokeStyle = `rgba(255,226,160,${0.55 + 0.2 * Math.sin(t * 4)})`; g.lineWidth = 1.6;
    g.beginPath(); g.arc(x, y - 52, 15 * breathe, 0, TAU); g.stroke();
    g.restore();
    // 本体：缩小的主角（略透，像一团凝实的灵光）
    g.save();
    g.globalAlpha *= 0.94;
    drawCharacter(g, p.look, st, scale, dt);
    // 加色罩一层金光
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.22 + 0.08 * Math.sin(t * 5);
    drawCharacter(g, p.look, st, scale, 0, { ghost: true, alpha: 1 });
    g.restore();
    // 绕身光点
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      const an = m.a + t * m.s, px = x + Math.cos(an) * m.r * 1.6, py = y - 24 - m.h * 0.5 + Math.sin(an) * m.r * 0.5;
      const front = Math.sin(an) > 0;
      g.fillStyle = front ? 'rgba(255,236,190,0.85)' : 'rgba(200,170,255,0.55)';
      g.beginPath(); g.arc(px, py, front ? 2.4 : 1.6, 0, TAU); g.fill();
    }
    g.restore();
    // 剩余时间：头顶一线金弧
    const k = clamp(this.t / Math.max(1, this.max), 0, 1);
    g.save(); g.strokeStyle = 'rgba(255,220,150,0.9)'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.arc(x, y - 78, 10, -Math.PI / 2, -Math.PI / 2 + k * TAU); g.stroke(); g.restore();
  }
  glow(F: FxSys, t: number, dt: number) {
    const p = this.game.player;
    if (this.active) {
      F.glow(p.x, p.y - p.st.lift - 28, 70, GOLD, 0.16 + 0.04 * Math.sin(t * 4));
      if (Math.random() < dt * 20) F.sparks(p.x, p.y - p.st.lift - 28, Math.random() < 0.7 ? GOLD : VIOLET, 1, 60, 0.7, 3);
      const b = this.body;
      if (b) F.glow(b.x, b.y - 60, 90, GOLD, 0.1 * (0.4 + 0.6 * b.shield / b.max));
    }
    for (const q of this.pillars) if (q.t < dt * 1.5) { F.flash(q.x, q.y - 120, 160, GOLD, 0.25); F.sparks(q.x, q.y - 60, GOLD, 40, 380, 0.9, 4); }
  }
}
