// v0.53：结丹神通「灵力化形」——金丹灵力离体凝形，化作青龙 / 火凤 / 白虎 / 玄武 / 雷鹏 / 麒麟 / 魔猿。
//   每一形都是一个出手实体（Act）：凝形 → 出手 → 化光消散。实体走 Y 排序的世界层（灵体立绘），光效走 WebGL 层。
//   元婴之后照样能用，体形放大三成、威力再加两成半，每形各多一段后招（「叠加」：元婴出窍时由元婴施出）。
//   灵体画材按需程序生成；生成失败时退回代码绘制的灵光轮廓，玩法不受影响。
import type { Combat, Enemy } from './combat';
import type { Drawable } from './life';
import type { FxSys, RGB } from '../gl/fx';
import type { ArtSkill } from '../data/arts';
import { Act, Src, eh, lookOf } from './artacts';
import { itemDef } from '../data/items';
import { v53, meta53 } from '../gfx/v053Tex';
import { audio } from './audio';

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const ease = (u: number) => 1 - Math.pow(1 - clamp(u, 0, 1), 3);
const easeIn = (u: number) => Math.pow(clamp(u, 0, 1), 2.2);
const rgb = (s: string): RGB => { const p = s.split(',').map(Number); return [p[0] / 255, p[1] / 255, p[2] / 255]; };
const WHITE: RGB = [1, 1, 1];

export type FormId = 'long' | 'feng' | 'hu' | 'gui' | 'peng' | 'qilin' | 'yuan';
export interface FormDef {
  id: FormId; name: string; art: string;
  /** 世界中的身长（像素，人约 120）；元婴期再放大 */
  len: number;
  /** 灵兽身体在画面中的悬空高度（飞禽高，走兽贴地） */
  air: number;
  /** 观兽悟形：斩杀名字里带这些字的妖兽，可参悟此形 */
  kin: RegExp;
  color: string;
  blurb: string;
}
export const FORMS: Record<FormId, FormDef> = {
  long: { id: 'long', name: '青龙', art: 'hx_long', len: 560, air: 70, kin: /[蛟龙蟒]/, color: '95,224,192', blurb: '贯穿' },
  feng: { id: 'feng', name: '火凤', art: 'hx_feng', len: 400, air: 230, kin: /[火焰炎赤朱凰]/, color: '255,160,64', blurb: '俯冲火海' },
  hu: { id: 'hu', name: '白虎', art: 'hx_hu', len: 320, air: 0, kin: /[虎豹狼狮]/, color: '232,240,255', blurb: '扑杀破甲' },
  gui: { id: 'gui', name: '玄武', art: 'hx_gui', len: 300, air: 0, kin: /[龟蟹鳄甲蛇]/, color: '90,160,255', blurb: '护身引敌' },
  peng: { id: 'peng', name: '雷鹏', art: 'hx_peng', len: 420, air: 260, kin: /[鹰雕鹞鸢鹫禽鸟翅鹏]/, color: '176,144,255', blurb: '连环雷击' },
  qilin: { id: 'qilin', name: '麒麟', art: 'hx_qilin', len: 320, air: 0, kin: /[鹿牛马羊鼠犀]/, color: '255,207,106', blurb: '踏地震晕' },
  yuan: { id: 'yuan', name: '魔猿', art: 'hx_yuan', len: 330, air: 0, kin: /[猿熊猴]/, color: '255,106,74', blurb: '横扫击飞' },
};
export const FORM_IDS = Object.keys(FORMS) as FormId[];
export const formOfSkill = (id: string): FormId | null => (id.startsWith('hx_') && (FORMS as any)[id.slice(3)] ? id.slice(3) as FormId : null);

function shadow(g: G, x: number, y: number, r: number, a: number) {
  if (a <= 0.01) return;
  g.fillStyle = `rgba(20,16,12,${0.26 * a})`; g.beginPath(); g.ellipse(x, y, r, r * 0.3, 0, 0, TAU); g.fill();
}

/** 画一只灵体：x,y 为地面落点，h 为悬空高度；len 为身长；face 1 朝右 / -1 朝左；tilt 俯冲倾角 */
export function drawSpirit(g: G, f: FormDef, pose: 'idle' | 'attack', x: number, y: number, h: number, len: number, face: number, alpha: number, t: number, tilt = 0, squash = 1) {
  if (alpha <= 0.01) return;
  const im = v53(`${f.art}_${pose}`) ?? v53(`${f.art}_idle`);
  const M = meta53(`${f.art}_${pose}`) ?? { w: 640, h: 480 };
  const k = len / M.w, dw = M.w * k, dh = M.h * k;
  const flying = f.air > 0;
  // 灵体呼吸：轻微起伏与明暗
  const breathe = 1 + 0.025 * Math.sin(t * 3.1);
  const cy = flying ? y - h - dh * 0.1 : y - h - dh * 0.48;
  g.save();
  g.translate(x, cy);
  if (tilt) g.rotate(tilt * face);
  g.scale(face * breathe, squash * breathe);
  g.globalAlpha *= alpha;
  if (im) {
    g.drawImage(im, -dw / 2, -dh / 2, dw, dh);
    // 加色叠一层，让灵体在亮地面上也透出光来
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha *= (f.id === 'hu' ? 0.06 : f.id === 'gui' || f.id === 'qilin' ? 0.16 : 0.26) + 0.08 * Math.sin(t * 5);
    g.drawImage(im, -dw / 2, -dh / 2, dw, dh);
  } else {
    // 画材未就绪：灵光轮廓
    const c = f.color;
    g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, dw * 0.5);
    gr.addColorStop(0, `rgba(${c},0.55)`); gr.addColorStop(0.6, `rgba(${c},0.18)`); gr.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, dw * 0.5, dh * 0.38, 0, 0, TAU); g.fill();
    g.strokeStyle = `rgba(${c},0.8)`; g.lineWidth = 3;
    g.beginPath(); for (let i = 0; i <= 24; i++) { const u = i / 24, px = -dw * 0.45 + u * dw * 0.9, py = Math.sin(u * 6 + t * 6) * dh * 0.12; if (i) g.lineTo(px, py); else g.moveTo(px, py); } g.stroke();
  }
  g.restore();
}

/** 凝形 / 消散的光丝团（画材缺时用代码粒子） */
function drawBurst(g: G, key: 'hx_gather' | 'hx_dissolve', x: number, y: number, r: number, a: number, rot: number, color: string) {
  if (a <= 0.01) return;
  const im = v53(key);
  g.save(); g.translate(x, y); g.rotate(rot); g.globalCompositeOperation = 'lighter'; g.globalAlpha *= a;
  if (im) g.drawImage(im, -r, -r, r * 2, r * 2);
  else {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
    gr.addColorStop(0, `rgba(${color},0.7)`); gr.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  }
  g.restore();
  // 主色光晕
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha *= a * 0.6;
  const gr = g.createRadialGradient(x, y, 0, x, y, r * 0.8);
  gr.addColorStop(0, `rgba(${color},0.6)`); gr.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 0.8, 0, TAU); g.fill();
  g.restore();
}
/** 身后灵力尾迹 */
function drawTrail(g: G, pts: [number, number][], w: number, color: string, a: number) {
  if (pts.length < 2 || a <= 0.01) return;
  const im = v53('hx_trail');
  g.save(); g.globalCompositeOperation = 'lighter';
  if (im) {
    const [x0, y0] = pts[0], [x1, y1] = pts[pts.length - 1];
    const L = Math.hypot(x1 - x0, y1 - y0); if (L < 4) { g.restore(); return; }
    g.translate(x1, y1); g.rotate(Math.atan2(y1 - y0, x1 - x0)); g.globalAlpha *= a;
    g.drawImage(im, -L, -w / 2, L, w);
  } else {
    g.strokeStyle = `rgba(${color},${0.45 * a})`; g.lineWidth = w * 0.5; g.lineCap = 'round';
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  }
  g.restore();
}

interface HxOpt { lv: number; ying: boolean; ox: number; oy: number }

/** 化形出手：七形共用一个实体，按形态分支 */
export class HuaxingAct extends Act {
  f: FormDef; s: ArtSkill; lv: number; ying: boolean;
  x: number; y: number; h = 0; face = 1; tilt = 0; pose: 'idle' | 'attack' = 'idle';
  len: number; alpha = 0; ph = 0; pt = 0; gone = 0; spawnT = 0.35;
  trail: [number, number][] = [];
  hitSet = new Set<number>(); tgts: Enemy[] = []; n = 0;
  sx = 0; sy = 0; tx = 0; ty = 0; ang = 0; dmg: number; src: Src; radius: number;
  life = 12; hp = 1; nextBite = 0.8; reflect = 0;
  cc: RGB;
  constructor(c: Combat, s: ArtSkill, dmg: number, src: Src, a: { x: number; y: number; dx: number; dy: number; target: Enemy | null }, radius: number, o: HxOpt) {
    super(c, { itemId: 'art_qingzhu', art: itemDef('art_qingzhu').art!, L: lookOf('art_qingzhu'), cc: rgb(s.color), dmg, src, pieces: 1, ax: a.x, ay: a.y, target: a.target });
    this.f = FORMS[s.id.slice(3) as FormId]; this.s = s; this.lv = o.lv; this.ying = o.ying;
    this.len = this.f.len * (o.ying ? 1.3 : 1) * (1 + o.lv * 0.05);
    this.dmg = dmg * (o.ying ? 1.25 : 1); this.src = src; this.radius = radius * (o.ying ? 1.2 : 1);
    this.cc = rgb(s.color);
    this.x = o.ox; this.y = o.oy;
    this.face = a.x >= o.ox ? 1 : -1;
    this.tx = a.x; this.ty = a.y + 24; this.ang = Math.atan2(a.dy, a.dx);
    this.sx = o.ox; this.sy = o.oy;
    const id = this.f.id;
    if (id === 'long') { this.x = o.ox - Math.cos(this.ang) * 140; this.y = o.oy - Math.sin(this.ang) * 60; this.h = this.f.air; }
    else if (id === 'feng' || id === 'peng') { this.h = 60; }
    else if (id === 'yuan') { this.x = o.ox + this.face * 70; this.y = o.oy - 10; }
    else if (id === 'gui') { this.x = o.ox - 90; this.y = o.oy + 20; this.face = 1; this.life = (s.dur ?? 12) * (1 + o.lv * 0.12) * (o.ying ? 1.25 : 1); this.reflect = o.lv >= 3 || o.ying ? 0.3 : 0; }
    this.c.impact(this.x, this.y, 1, s.color);
    audio.sfx('chime');
  }
  get color() { return this.s.color; }
  private hitE(e: Enemy, k: number, fx: number, fy: number, st?: ArtSkill['status']) {
    const src = st ? { ...this.src, status: st, stCh: Math.max(this.src.stCh, st.ch) } : this.src;
    this.c.hitEnemy(e, this.dmg * k, src, fx, fy);
  }
  private foes(x: number, y: number, r: number) { return this.c.enemies.filter((e) => !e.dead && !(e.hideT > 0) && Math.hypot(e.x - x, (e.y - y) * 1.2) < r); }
  /** 化光消散 */
  private finish() { if (this.ph < 90) { this.ph = 90; this.pt = 0; audio.sfx('whoosh'); } }
  update(dt: number) {
    if (!Number.isFinite(dt) || dt < 0) return;
    this.t += dt; this.pt += dt;
    // 凝形：由淡到浓
    if (this.ph < 90) this.alpha = Math.min(1, this.t / this.spawnT);
    else { this.alpha = Math.max(0, 1 - this.pt / 0.45); if (this.pt > 0.55) this.done = true; return; }
    if (this.trail.length > 14) this.trail.shift();
    this.trail.push([this.x, this.y - this.h - 20]);
    switch (this.f.id) {
      case 'long': return this.upLong(dt);
      case 'feng': return this.upFeng(dt);
      case 'hu': return this.upHu(dt);
      case 'gui': return this.upGui(dt);
      case 'peng': return this.upPeng(dt);
      case 'qilin': return this.upQilin(dt);
      case 'yuan': return this.upYuan(dt);
    }
  }
  // —— 青龙：身后盘起 → 贯穿 →（大成 / 元婴）回首再撞
  private upLong(dt: number) {
    if (this.ph === 0) { if (this.t >= this.spawnT + 0.15) { this.ph = 1; this.pt = 0; this.pose = 'attack'; this.c.impact(this.x, this.y, 2, this.color); audio.sfx('thunder'); } return; }
    const range = this.s.range * (1 + this.lv * 0.08);
    const sp = 1700;
    if (this.ph === 1 || this.ph === 2) {
      const dir = this.ph === 1 ? this.ang : this.ang + Math.PI;
      this.x += Math.cos(dir) * sp * dt; this.y += Math.sin(dir) * sp * dt * 0.8;
      this.face = Math.cos(dir) >= 0 ? 1 : -1;
      for (const e of this.foes(this.x, this.y, this.radius + 40)) {
        if (this.hitSet.has(e.id)) continue; this.hitSet.add(e.id);
        this.hitE(e, this.ph === 1 ? 1 : 0.6, this.x, this.y, this.lv >= 3 ? { k: 'stun', dur: 0.8, ch: 0.6 } : undefined);
        e.kx += Math.cos(dir) * 500; e.ky += Math.sin(dir) * 300;
      }
      if (this.pt * sp > range) {
        if (this.ph === 1 && (this.lv >= 2 || this.ying)) { this.ph = 2; this.pt = 0; this.hitSet.clear(); this.c.impact(this.x, this.y, 2, this.color); }
        else this.finish();
      }
    }
  }
  // —— 火凤：冲上半空 → 敛翼俯冲 → 火海；圆满 / 元婴再俯冲一次
  private upFeng(dt: number) {
    if (this.ph === 0) {
      const u = ease(this.t / 0.55); this.h = 60 + u * (this.f.air + 60); this.y -= dt * 20;
      if (this.t >= 0.55) { this.ph = 1; this.pt = 0; this.pose = 'attack'; this.sx = this.x; this.sy = this.y; audio.sfx('fire'); }
      return;
    }
    if (this.ph === 1) {
      const u = easeIn(this.pt / 0.32);
      this.x = this.sx + (this.tx - this.sx) * u; this.y = this.sy + (this.ty - this.sy) * u; this.h = (this.f.air + 120) * (1 - u);
      this.face = this.tx >= this.sx ? 1 : -1; this.tilt = 0.5 * u;
      if (this.pt >= 0.32) {
        const r = this.radius * (1 + this.lv * 0.1);
        for (const e of this.foes(this.tx, this.ty, r)) this.hitE(e, this.n === 0 ? 1 : 0.55, this.tx, this.ty);
        this.c.impact(this.tx, this.ty, this.n === 0 ? 3 : 2, this.color);
        this.c.fxq.push({ k: 'impact', x: this.tx, y: this.ty, color: this.color, power: 3 });
        this.c.fields.push({ x: this.tx, y: this.ty, r: r * 0.85, t: 0, dur: 3.5 + this.lv * 0.8 + (this.ying ? 1.5 : 0), fx: 'flame', color: this.color, dmg: this.dmg * 0.12, tick: 0, status: this.s.status, stCh: 0.4, school: '火', lv: this.lv, realm: this.src.realm });
        audio.sfx('boom');
        this.n++;
        if (this.n < ((this.lv >= 3 || this.ying) ? 2 : 1)) {
          // 再起再落：落向身旁另一敌，没有就原地再砸
          const e = this.foes(this.tx, this.ty, 600).sort((a, b) => b.hp - a.hp)[0];
          this.sx = this.tx; this.sy = this.ty; if (e) { this.tx = e.x; this.ty = e.y; }
          this.ph = 3; this.pt = 0; this.pose = 'idle'; this.tilt = 0;
        } else { this.ph = 4; this.pt = 0; this.pose = 'idle'; this.tilt = 0; }
      }
      return;
    }
    if (this.ph === 3) { const u = ease(this.pt / 0.35); this.h = u * (this.f.air + 120); if (this.pt >= 0.35) { this.ph = 1; this.pt = 0; this.pose = 'attack'; this.sx = this.x; this.sy = this.y; } return; }
    if (this.ph === 4) { this.h += dt * 260; if (this.pt > 0.3) this.finish(); }
  }
  // —— 白虎：扑向锁定之敌，再扑身旁之敌
  private upHu(dt: number) {
    if (this.ph === 0) {
      if (this.t < this.spawnT) return;
      const e = this.I.target && !this.I.target.dead ? this.I.target : this.foes(this.tx, this.ty, 260)[0];
      this.nextTarget(e ?? null);
      return;
    }
    if (this.ph === 1) {
      const T = 0.26, u = clamp(this.pt / T, 0, 1);
      this.x = this.sx + (this.tx - this.sx) * ease(u); this.y = this.sy + (this.ty - this.sy) * ease(u);
      this.h = Math.sin(u * Math.PI) * 90;
      if (u >= 1) {
        const tg = this.tgts[this.tgts.length - 1];
        const k = this.n === 0 ? 1 : 0.6;
        if (tg && !tg.dead) this.hitE(tg, k, this.x - this.face * 40, this.y, (this.n === 0 || this.lv >= 3) ? this.s.status : undefined);
        for (const e of this.foes(this.x, this.y, 110)) if (e !== tg) this.hitE(e, k * 0.35, this.x, this.y);
        this.c.impact(this.x, this.y, this.n === 0 ? 3 : 2, this.color);
        audio.sfx('clang');
        this.n++;
        this.ph = 2; this.pt = 0; this.pose = 'idle';
      }
      return;
    }
    if (this.ph === 2 && this.pt > 0.16) {
      const max = (this.lv >= 2 ? 3 : 2) + (this.ying ? 1 : 0);
      if (this.n >= max) { this.finish(); return; }
      const e = this.foes(this.x, this.y, 520).filter((o) => !this.tgts.includes(o)).sort((a, b) => Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y))[0];
      if (!e) { this.finish(); return; }
      this.nextTarget(e);
    }
  }
  private nextTarget(e: Enemy | null) {
    this.sx = this.x; this.sy = this.y;
    if (e) { this.tgts.push(e); this.tx = e.x - (e.x >= this.x ? 60 : -60); this.ty = e.y + 4; }
    this.face = this.tx >= this.x ? 1 : -1;
    this.ph = 1; this.pt = 0; this.pose = 'attack';
    audio.sfx('whoosh');
  }
  // —— 玄武：盘踞身侧，龟甲护身、引敌，蛇首噬咬
  private upGui(dt: number) {
    const p = this.c.game.player;
    const yy = this.c.game.yuanying?.anchor();
    const ax = (yy?.x ?? p.x) - 100, ay = (yy?.y ?? p.y) + 26;
    this.x += (ax - this.x) * Math.min(1, dt * 3); this.y += (ay - this.y) * Math.min(1, dt * 3);
    this.life -= dt;
    this.nextBite -= dt;
    if (this.pose === 'attack' && this.pt > 0.45) this.pose = 'idle';
    if (this.nextBite <= 0) {
      this.nextBite = (this.lv >= 1 ? 1.2 : 1.6) * (this.ying ? 0.8 : 1);
      const e = this.foes(this.x, this.y, 420).sort((a, b) => Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y))[0];
      if (e) {
        this.face = e.x >= this.x ? 1 : -1; this.pose = 'attack'; this.pt = 0;
        this.hitE(e, 0.16, this.x, this.y, { k: 'slow', dur: 1.5, ch: 0.6 });
        this.c.vfx.push({ kind: 'beam', x: this.x + this.face * 60, y: this.y - 90, x2: e.x, y2: e.y - eh(e), r: 10, t: 0, dur: 0.22, color: this.color, fx: 'frost', seed: Math.random() * 1e6 } as any);
      }
    }
    if (this.life <= 0 || this.hp <= 0) { if (this.hp <= 0) this.c.texts.push({ x: this.x, y: this.y - 160, s: '玄武散形', color: '#9ac8ff', t: 0, vy: -30, big: true }); this.finish(); }
  }
  /** 玄武替你挨打：龟甲吸收（返回吸收后余下的伤害比例） */
  absorb(frac: number, from?: Enemy): number {
    if (!Number.isFinite(frac) || frac < 0 || !Number.isFinite(this.hp)) return 0;
    if (!Number.isFinite(this.hp - frac * 0.7 / (this.ying ? 1.6 : 1.1))) return 0;
    if (this.f.id !== 'gui' || this.ph >= 90) return frac;
    const take = frac * 0.7;
    this.hp -= take / (this.ying ? 1.6 : 1.1);
    if (this.reflect && from && !from.dead) this.c.hitEnemy(from, this.dmg * 0.25 * this.reflect * 3, this.src, this.x, this.y);
    this.c.fxq.push({ k: 'block', x: this.x, y: this.y - 70, color: this.color } as any);
    return frac - take;
  }
  get guarding() { return this.f.id === 'gui' && this.ph < 90 && this.t > 0.2; }
  // —— 雷鹏：盘旋于敌阵上空，一次次挟雷俯冲
  private upPeng(dt: number) {
    const cx = this.tx, cy = this.ty;
    if (this.ph === 0) {
      const u = ease(this.t / 0.5);
      this.x += (cx - 140 - this.x) * Math.min(1, dt * 3); this.y += (cy - this.y) * Math.min(1, dt * 3); this.h = 60 + u * this.f.air;
      if (this.t >= 0.5) { this.ph = 1; this.pt = 0; }
      return;
    }
    const max = (this.s.count ?? 6) + this.lv + (this.ying ? 3 : 0);
    const per = 0.32;
    // 盘旋
    const a = this.t * 2.6;
    if (this.pose === 'idle') { this.x = cx + Math.cos(a) * 200; this.y = cy + Math.sin(a) * 70; this.face = -Math.sin(a) >= 0 ? 1 : -1; this.h = this.f.air; }
    if (this.pt >= per) {
      this.pt = 0;
      if (this.n >= max) { this.finish(); return; }
      const pool = this.foes(cx, cy, this.radius);
      const e = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
      this.n++;
      if (!e) { if (this.n > 2) this.finish(); return; }
      this.pose = 'attack'; this.face = e.x >= this.x ? 1 : -1;
      this.c.vfx.push({ kind: 'chain', x: this.x, y: this.y - this.h, x2: e.x, y2: e.y - eh(e), r: 0, t: 0, dur: 0.3, color: this.color, fx: 'lightning', seed: Math.random() * 1e6, w: 4 + this.lv } as any);
      this.hitE(e, 1, this.x, this.y - this.h);
      if (this.lv >= 3 || this.ying) { const o = this.foes(e.x, e.y, 300).find((q) => q !== e); if (o) { this.c.vfx.push({ kind: 'chain', x: e.x, y: e.y - eh(e), x2: o.x, y2: o.y - eh(o), r: 0, t: 0, dur: 0.25, color: this.color, fx: 'lightning', seed: Math.random() * 1e6, w: 3 } as any); this.hitE(o, 0.5, e.x, e.y); } }
      this.c.impact(e.x, e.y, 1, this.color);
      if (this.n % 2 === 1) audio.sfx('thunder');
      this.x = e.x - this.face * 90; this.y = e.y - 10; this.h = this.f.air * 0.55;
    } else if (this.pose === 'attack' && this.pt > 0.16) this.pose = 'idle';
  }
  // —— 麒麟：腾空落入敌群，人立踏地，余震一圈圈荡开
  private upQilin(dt: number) {
    if (this.ph === 0) { if (this.t >= this.spawnT) { this.ph = 1; this.pt = 0; this.sx = this.x; this.sy = this.y; this.face = this.tx >= this.x ? 1 : -1; audio.sfx('whoosh'); } return; }
    if (this.ph === 1) {
      const T = 0.48, u = clamp(this.pt / T, 0, 1);
      this.x = this.sx + (this.tx - this.sx) * ease(u); this.y = this.sy + (this.ty - this.sy) * ease(u); this.h = Math.sin(u * Math.PI) * 220;
      if (u > 0.55) this.pose = 'attack';
      if (u >= 1) {
        const r = this.radius * (1 + this.lv * 0.08);
        for (const e of this.foes(this.x, this.y, r)) { this.hitE(e, e.def.evil && this.lv >= 3 ? 2 : 1, this.x, this.y); }
        this.c.impact(this.x, this.y, 3, this.color);
        this.c.scorch.push({ x: this.x, y: this.y, r: r * 0.9, t: 0, dur: 8, rot: Math.random() * TAU, color: '120,90,50' });
        this.c.vfx.push({ kind: 'ring', x: this.x, y: this.y, r, t: 0, dur: 0.6, color: this.color, fx: 'rock' } as any);
        audio.sfx('boom');
        this.ph = 2; this.pt = 0; this.n = 0;
      }
      return;
    }
    if (this.ph === 2) {
      const waves = (this.lv >= 2 ? 3 : 2) + (this.ying ? 1 : 0);
      if (this.pt >= 0.34) {
        this.pt = 0; this.n++;
        const r = this.radius * (1.2 + this.n * 0.35);
        this.c.vfx.push({ kind: 'ring', x: this.x, y: this.y, r, t: 0, dur: 0.5, color: this.color, fx: 'rock' } as any);
        for (const e of this.foes(this.x, this.y, r)) if (Math.hypot(e.x - this.x, e.y - this.y) > r * 0.55) this.hitE(e, 0.35, this.x, this.y, { k: 'stun', dur: 0.6, ch: 0.5 });
        this.c.impact(this.x, this.y, 1, this.color);
        if (this.n >= waves) this.finish();
      }
      if (this.pt > 0.2) this.pose = 'idle';
    }
  }
  // —— 魔猿：立于身侧，抡臂横扫；大成 / 元婴反手再扫
  private upYuan(dt: number) {
    void dt;
    if (this.ph === 0) { if (this.t >= this.spawnT + 0.1) { this.ph = 1; this.pt = 0; this.sweep(1); } return; }
    if (this.ph === 1 && this.pt > 0.55) {
      if ((this.lv >= 2 || this.ying) && this.n < 2) { this.face = -this.face; this.pose = 'idle'; this.ph = 2; this.pt = 0; return; }
      this.finish();
    }
    if (this.ph === 2 && this.pt > 0.25) { this.face = -this.face; this.ph = 1; this.pt = 0; this.sweep(0.7); }
  }
  private sweep(k: number) {
    this.pose = 'attack'; this.n++;
    const range = this.s.range * (1 + this.lv * 0.1) * (this.ying ? 1.2 : 1), spread = (this.s.radius ?? 1.3);
    const dir = this.ang;
    this.c.vfx.push({ kind: 'cone', x: this.x, y: this.y - 40, r: range, t: 0, dur: 0.4, color: this.color, fx: 'palm', ang: dir, spread } as any);
    for (const e of this.c.enemies) {
      if (e.dead) continue;
      const dx = e.x - this.x, dy = e.y - this.y, d = Math.hypot(dx, dy);
      if (d > range + 30) continue;
      let da = Math.atan2(dy, dx) - dir; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      if (Math.abs(da) > spread + 0.15) continue;
      this.hitE(e, k, this.x, this.y, this.lv >= 3 ? { k: 'slow', dur: 3, ch: 0.9 } : undefined);
      const dd = d || 1; e.kx += dx / dd * 1300; e.ky += dy / dd * 800;
    }
    this.c.impact(this.x + Math.cos(dir) * 160, this.y + Math.sin(dir) * 80, 3, this.color);
    audio.sfx('boom');
  }

  bodies(out: Drawable[]) {
    const f = this.f, t = this.t, a = this.alpha;
    const grow = this.ph < 90 ? 0.6 + 0.4 * ease(this.t / this.spawnT) : 1 + this.pt * 0.25;
    const air = f.air > 0 || this.h > 1;
    out.push({ y: this.y + (air ? 60 : 0), k: 'D·化形', draw: (g) => {
      shadow(g, this.x, this.y + 4, this.len * 0.22, a * clamp(1 - this.h / 500, 0.25, 1));
      if (this.trail.length > 3 && (this.pose === 'attack' || f.id === 'long')) drawTrail(g, this.trail, this.len * 0.35, f.color, a * 0.8);
      if (this.t < this.spawnT + 0.2) drawBurst(g, 'hx_gather', this.x, this.y - this.h - 60, this.len * 0.42, (1 - this.t / (this.spawnT + 0.2)) * 1.1, -t * 3, f.color);
      if (this.ph >= 90) drawBurst(g, 'hx_dissolve', this.x, this.y - this.h - 60, this.len * (0.35 + this.pt * 0.5), 1 - this.pt / 0.5, 0, f.color);
      drawSpirit(g, f, this.pose, this.x, this.y, this.h, this.len * grow, this.face, a, t, this.tilt);
      // 玄武护身：龟甲灵光
      if (f.id === 'gui' && this.ph < 90) {
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha *= 0.5 * a * (0.7 + 0.3 * Math.sin(t * 4));
        g.strokeStyle = `rgba(${f.color},0.8)`; g.lineWidth = 2;
        g.beginPath(); g.ellipse(this.x + 100, this.y - 20, 90, 32, 0, 0, TAU); g.stroke();
        g.restore();
      }
    } });
  }
  glow(F: FxSys, t: number, dt: number) {
    if (this.alpha <= 0.02) return;
    const c = this.cc, x = this.x, y = this.y - this.h - 50;
    F.glow(x, y, this.len * 0.42, c, 0.18 * this.alpha);
    if (Math.random() < dt * 40) F.sparks(x + (Math.random() - 0.5) * this.len * 0.5, y + (Math.random() - 0.5) * 60, c, 1, 60, 0.6, 3);
    if (this.pose === 'attack') F.glow(x, y, this.len * 0.25, WHITE, 0.12 * this.alpha);
    if (this.ph >= 90 && this.pt < dt * 1.5) F.sparks(x, y, c, 30, 260, 0.8, 4);
    void t;
  }
}

/** spawnHeroAct 的化形分支：起手点在元婴（出窍时）或主角身上 */
export function spawnHuaxing(c: Combat, s: ArtSkill, lv: number, dmg: number, src: Src, a: { x: number; y: number; dx: number; dy: number; target: Enemy | null }, radius: number): boolean {
  if (!formOfSkill(s.id)) return false;
  const g = c.game, p = g.player;
  const ying = g.hero.realm >= 4;
  // 玄武只能有一只：再放则续上
  if (s.id === 'hx_gui') { const old = c.acts.list.find((x) => x instanceof HuaxingAct && x.f.id === 'gui' && x.ph < 90) as HuaxingAct | undefined; if (old) { old.life = Math.max(old.life, s.dur ?? 12); old.hp = 1; return true; } }
  c.acts.list.push(new HuaxingAct(c, s, dmg, src, a, radius, { lv, ying, ox: p.x, oy: p.y }));
  g.cinema(a.x, a.y, 1.06, 0.8);
  return true;
}
/** v0.54.2：同行友人化形——从友人身上起手（玄武不在其列：它跟着的是你） */
export function spawnHuaxingFrom(c: Combat, s: ArtSkill, lv: number, dmg: number, src: Src, a: { x: number; y: number; dx: number; dy: number; target: Enemy | null }, radius: number, ox: number, oy: number, ying: boolean) {
  if (!formOfSkill(s.id) || s.id === 'hx_gui') return false;
  c.acts.list.push(new HuaxingAct(c, s, dmg, src, a, radius, { lv, ying, ox, oy }));
  return true;
}
/** 此刻护在身旁的玄武 */
export function guardGui(c: Combat): HuaxingAct | null {
  for (const x of c.acts.list) if (x instanceof HuaxingAct && x.guarding) return x;
  return null;
}
