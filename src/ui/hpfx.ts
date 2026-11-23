// r11-lock 第二件：血条打击感 · 修仙版（参考《死亡细胞》：掉的那一截从血条上碎下来往下掉，持续掉血是滴血，右端闪一下；对象池循环）。
// 不照搬，改成修仙的路数：
//   · 碎玉：掉掉的那一截（宽 = 总宽 × 掉的比例，左沿贴住掉血后红条的右沿）裂成两三块带锯齿边的玉片（重击 / 暴击四到六块），
//     合起来正好是那一截；往下掉、翻转，落尽化成一缕墨烟 / 灵气散掉；
//   · 按伤害类型变：火 → 琥珀色碎片、余烬卷着往上飘；冰 → 冰晶碎片、霜屑；毒 → 绿玉、绿烟；雷 → 紫白碎片、电火花；寻常 / 近战 → 白金灵光碎玉；
//   · 重击（掉超过约 15%）/ 暴击：碎得更多、血条轻震一下（CSS 只动 transform）、边框上闪过一道裂纹；
//   · 持续掉血（燃烧、中毒）：红条右端一颗颗往下滴的血珠，落下溅成小墨点，不出碎片；
//   · 右端闪光：一团朱砂墨晕在血条右端「按」一下、晕开再收（重击再叠一枚朱砂印）；
//   · 回血：青绿的灵气光点从外面流进血条右端，荡开一圈玉色波纹；
//   · 罡气条被打空：琉璃一样碎开。
// 画在 GameView 里一张盖在界面上的小画布（.hpfx-layer，不接点击）；有东西在动才跑 rAF，动完停、清屏。
// 画质：低画质档只留闪光（残影条在 DOM 里，一直有）。随机数用自己的小序列，不碰 Math.random。
import jadeUrl from '../assets/hpfx/jade.webp';
import inkUrl from '../assets/hpfx/inkbloom.webp';
import sealUrl from '../assets/hpfx/seal.webp';
import type { Statuses } from '../world/combat';

export type HpKind = 'normal' | 'fire' | 'ice' | 'poison' | 'thunder';
export type HpTheme = 'hp' | 'mp';

// ---------------------------------------------------------------- 纯算法（有单测）
/** 掉掉的那一截：左沿 = 总宽 × 掉血后的比例（锚点在左），宽 = 总宽 × 掉的比例 */
export function shardSpan(width: number, prev: number, next: number): { left: number; width: number } {
  const a = Math.max(0, Math.min(1, next)), b = Math.max(a, Math.min(1, prev));
  return { left: width * a, width: width * (b - a) };
}
/** 把那一截切成 n 块：返回 n + 1 条分界的标称位置（首 = 左沿，尾 = 右沿；各块宽度加起来正好是那一截） */
export function splitShards(left: number, width: number, n: number, rnd: () => number): number[] {
  const xs = [left];
  if (n <= 1) { xs.push(left + width); return xs; }
  // 每块宽度按 0.6–1.4 的权重分（不是均分，看着像真碎的），最后一条贴住右沿
  const w: number[] = []; let sum = 0;
  for (let i = 0; i < n; i++) { const k = 0.6 + rnd() * 0.8; w.push(k); sum += k; }
  let x = left;
  for (let i = 0; i < n - 1; i++) { x += width * w[i] / sum; xs.push(x); }
  xs.push(left + width);
  return xs;
}
/** 这一下按什么类型碎：看这一帧身上新挂上的状态（没有就看还挂着的）；都没有就是寻常 */
export function hitKind(st: Statuses | undefined, before: Set<string> | null): HpKind {
  if (!st) return 'normal';
  const order: [string, HpKind][] = [['shock', 'thunder'], ['burn', 'fire'], ['freeze', 'ice'], ['slow', 'ice'], ['poison', 'poison']];
  for (const [k, kind] of order) if ((st as Record<string, { t: number } | undefined>)[k]?.t && before && !before.has(k)) return kind;
  for (const [k, kind] of order) if ((st as Record<string, { t: number } | undefined>)[k]?.t) return kind;
  return 'normal';
}
/** 持续掉血的状态在身上没有（燃烧、中毒） */
export const dotOn = (st: Statuses | undefined) => !!(st && ((st.burn?.t ?? 0) > 0 || (st.poison?.t ?? 0) > 0));
export interface HpReact { type: 'none' | 'shard' | 'drip' | 'heal'; heavy: boolean }
/** 一次数值变化该怎么反应：掉了 → 碎片（持续掉血里的小跳 → 滴血）；涨了够多 → 回血；HEAVY = 掉超过 15% */
export const HEAVY = 0.15;
export function classifyHp(prev: number, next: number, dot: boolean, healAcc = 0): HpReact {
  const d = prev - next;
  if (d > 0.0015) {
    if (dot && d < 0.04) return { type: 'drip', heavy: false };
    return { type: 'shard', heavy: d > HEAVY };
  }
  if (-d + healAcc >= 0.03) return { type: 'heal', heavy: false };
  return { type: 'none', heavy: false };
}

// ---------------------------------------------------------------- 画面
type RGBA = [number, number, number];
const KIND_COL: Record<HpKind, { fill: RGBA; edge: RGBA; glow: RGBA }> = {
  normal: { fill: [244, 236, 210], edge: [255, 214, 120], glow: [255, 230, 170] },
  fire: { fill: [255, 176, 92], edge: [255, 110, 40], glow: [255, 140, 60] },
  ice: { fill: [210, 240, 255], edge: [140, 210, 255], glow: [170, 225, 255] },
  poison: { fill: [170, 226, 140], edge: [90, 190, 80], glow: [140, 220, 110] },
  thunder: { fill: [228, 214, 255], edge: [170, 140, 255], glow: [200, 190, 255] },
};
const MP_COL = { fill: [176, 214, 255] as RGBA, edge: [90, 150, 240] as RGBA, glow: [130, 180, 255] as RGBA };
const rgba = (c: RGBA, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;

/** 一个粒子：碎片 / 余烬 / 电火花 / 烟 / 血珠 / 墨点 / 灵气光点 / 波纹 / 墨晕 / 朱砂印 / 裂纹 / 琉璃 */
interface P {
  on: boolean; k: 'shard' | 'ember' | 'spark' | 'smoke' | 'drop' | 'dot' | 'flow' | 'ripple' | 'bloom' | 'seal' | 'crack' | 'glass';
  x: number; y: number; vx: number; vy: number; rot: number; vr: number; t: number; life: number; s: number;
  /** 碎片 / 琉璃的形状（相对中心的点，x, y 交替） */
  poly: number[]; c: RGBA; c2: RGBA; kind: HpKind; tx: number; ty: number; floor: number; group: number; tex: boolean;
}
const MAX_P = 280, MAX_GROUPS = 10;

export class HpFx {
  private cv: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private pool: P[] = [];
  private live = 0;
  private raf = 0; private last = 0;
  private seed = 0x2f6e2b1;
  private groups: number[] = []; private groupN = 0; private groupSeq = 0;
  private img: { jade?: HTMLImageElement; ink?: HTMLImageElement; seal?: HTMLImageElement } = {};
  /** 画质档（0 低：只留闪光） */
  tier: () => number = () => 2;
  /** 测试 / 截图读：这一帧活着多少 */
  get count() { return this.live; }
  rnd = () => { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; };
  private r = (a: number, b: number) => a + this.rnd() * (b - a);

  attach(cv: HTMLCanvasElement) {
    this.cv = cv; this.g = cv.getContext('2d');
    if (typeof Image !== 'undefined' && !this.img.jade) {
      const ld = (u: string) => { const im = new Image(); im.decoding = 'async'; im.src = u; return im; };
      this.img = { jade: ld(jadeUrl), ink: ld(inkUrl), seal: ld(sealUrl) };
    }
  }
  detach(cv: HTMLCanvasElement) { if (this.cv === cv) { cancelAnimationFrame(this.raf); this.raf = 0; this.cv = null; this.g = null; for (const p of this.pool) p.on = false; this.live = 0; } }

  private get(): P | null {
    if (this.live >= MAX_P) return null;
    let p = this.pool.find((q) => !q.on);
    if (!p) { p = { on: false, k: 'dot', x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, t: 0, life: 1, s: 1, poly: [], c: [0, 0, 0], c2: [0, 0, 0], kind: 'normal', tx: 0, ty: 0, floor: 0, group: 0, tex: false }; this.pool.push(p); }
    p.on = true; p.t = 0; p.vx = p.vy = p.rot = p.vr = 0; p.poly.length = 0; p.group = 0; p.tex = false; p.kind = 'normal';
    this.live++;
    return p;
  }
  private add(k: P['k'], x: number, y: number, life: number, s: number, c: RGBA, init?: (p: P) => void) {
    const p = this.get(); if (!p) return null;
    p.k = k; p.x = x; p.y = y; p.life = life; p.s = s; p.c = c; p.c2 = c;
    init?.(p); this.kick(); return p;
  }
  /** 元素在画布里的位置（CSS 像素） */
  private rect(el: Element) {
    if (!this.cv) return null;
    const a = el.getBoundingClientRect(), b = this.cv.getBoundingClientRect();
    if (!(a.width > 0)) return null;
    return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
  }

  /** 掉血：碎玉 + 右端墨晕；重击再叠朱砂印、裂纹、轻震 */
  damage(el: Element, prev: number, next: number, kind: HpKind, heavy: boolean, theme: HpTheme = 'hp', light = false) {
    const R = this.rect(el); if (!R) return;
    const ex = R.x + R.w * Math.max(0, next), ey = R.y + R.h / 2;
    this.flash(ex, ey, R.h, theme, heavy && !light);
    if (this.tier() <= 0) return;
    const span = shardSpan(R.w, prev, next);
    if (heavy && !light) { this.crack(R, span.left); shake(el); }
    if (span.width < 2) return;
    if (this.groupN >= MAX_GROUPS) return;
    const group = ++this.groupSeq; this.groupN++; this.groups.push(group);
    const n = light ? 1 + (span.width > 40 ? 1 : 0) : heavy ? 4 + Math.floor(this.rnd() * 3) : 2 + Math.floor(this.rnd() * 2);
    const xs = splitShards(R.x + span.left, span.width, Math.max(1, Math.min(n, Math.floor(span.width / 3))), this.rnd);
    const col = theme === 'mp' ? MP_COL : KIND_COL[kind];
    // 每条分界线是一条竖着的锯齿线（相邻两块共用，拼得严丝合缝）
    const H = R.h, jag = xs.map((x, i) => {
      const pts: number[] = []; const m = 3, amp = i === xs.length - 1 ? 0 : Math.min(3.5, H * 0.45);
      for (let j = 0; j <= m; j++) pts.push(x + (j === 0 || j === m ? 0 : this.r(-amp, amp)), R.y + H * j / m);
      return pts;
    });
    for (let i = 0; i < xs.length - 1; i++) {
      const L = jag[i], Rt = jag[i + 1];
      const cx = (xs[i] + xs[i + 1]) / 2, cy = R.y + H / 2;
      this.add('shard', cx, cy, this.r(0.85, 1.25) * (light ? 0.7 : 1), 1, col.fill, (p) => {
        // 左边那条锯齿线自上而下、右边那条自下而上，围成一块
        for (let j = 0; j < L.length; j += 2) p.poly.push(L[j] - cx, L[j + 1] - cy);
        for (let j = Rt.length - 2; j >= 0; j -= 2) p.poly.push(Rt[j] - cx, Rt[j + 1] - cy);
        p.c2 = col.edge; p.kind = theme === 'mp' ? 'normal' : kind; p.group = group; p.tex = theme === 'hp' && kind === 'normal';
        p.vx = this.r(-30, 50) + (i - (xs.length - 2) / 2) * 18; p.vy = this.r(-120, -50) * (heavy ? 1.3 : 1);
        p.vr = this.r(-5, 5) * (heavy ? 1.4 : 1);
      });
    }
    if (kind === 'thunder' && !light) for (let i = 0; i < 6; i++) this.add('spark', R.x + span.left + this.rnd() * span.width, R.y + this.rnd() * H, this.r(0.15, 0.3), this.r(6, 12), [235, 225, 255], (p) => { p.rot = this.r(0, Math.PI * 2); });
  }
  /** 右端那一下：朱砂墨晕「按」一下、晕开再收（法力是一团蓝光）；重的再叠一枚朱砂印 */
  private flash(x: number, y: number, h: number, theme: HpTheme, seal: boolean) {
    const s = Math.max(10, h * 2.6);
    this.add('bloom', x, y, 0.5, s, theme === 'mp' ? MP_COL.glow : [200, 30, 20], (p) => { p.kind = theme === 'mp' ? 'ice' : 'normal'; });
    if (seal) this.add('seal', x, y - h * 0.2, 0.62, Math.max(16, h * 2.4), [200, 30, 20]);
  }
  /** 重击：边框上闪过一道裂纹（从剩下那截的右沿往左劈一段） */
  private crack(R: { x: number; y: number; w: number; h: number }, left: number) {
    this.add('crack', R.x + left, R.y, 0.3, Math.min(R.w * 0.45, 160), [255, 236, 190], (p) => {
      let x = 0; const n = 7; p.poly.push(0, R.h * this.r(0, 1));
      for (let i = 1; i <= n; i++) { x -= p.s / n; p.poly.push(x, R.h * this.r(-0.4, 1.4)); }
    });
  }
  /** 持续掉血：右端一颗血珠往下滴，落到下方溅成小墨点 */
  drip(el: Element, v: number, kind: HpKind) {
    if (this.tier() <= 0) return;
    const R = this.rect(el); if (!R) return;
    const x = R.x + R.w * Math.max(0, v) - 1, c: RGBA = kind === 'poison' ? [70, 140, 50] : [150, 18, 14];
    this.add('drop', x, R.y + R.h, 1.4, Math.max(1.6, R.h * 0.28), c, (p) => { p.vy = this.r(10, 30); p.floor = R.y + R.h + Math.max(14, R.h * 2.6); p.kind = kind; });
  }
  /** 回血：青绿的灵气光点从外面流进右端，荡开一圈玉色波纹 */
  heal(el: Element, v: number) {
    if (this.tier() <= 0) return;
    const R = this.rect(el); if (!R) return;
    const tx = R.x + R.w * Math.max(0, Math.min(1, v)), ty = R.y + R.h / 2;
    for (let i = 0; i < 9; i++) {
      const a = this.r(-Math.PI * 0.9, Math.PI * 0.9) + Math.PI, d = this.r(26, 54);
      this.add('flow', tx + Math.cos(a) * d * 0.6 + 14, ty + Math.sin(a) * d * 0.7, this.r(0.4, 0.6), this.r(1.5, 2.6), [120, 255, 200], (p) => { p.tx = tx; p.ty = ty; p.vx = p.x; p.vy = p.y; p.t = -i * 0.03; });
    }
    this.add('ripple', tx, ty, 0.55, Math.max(10, R.h * 2.2), [150, 255, 210], (p) => { p.t = -0.32; });
  }
  /** 罡气条被打空：琉璃一样碎开 */
  shatter(el: Element) {
    if (this.tier() <= 0) return;
    const R = this.rect(el); if (!R) return;
    const n = Math.min(14, Math.max(6, Math.round(R.w / 14)));
    for (let i = 0; i < n; i++) {
      const cx = R.x + (i + 0.5) / n * R.w, cy = R.y + R.h / 2, s = Math.max(4, R.w / n * 0.8);
      this.add('glass', cx, cy, this.r(0.6, 0.95), s, [255, 228, 160], (p) => {
        p.poly.push(this.r(-s, -s * 0.2), this.r(-s * 0.7, -s * 0.2), this.r(s * 0.2, s), this.r(-s * 0.5, 0), this.r(-s * 0.3, s * 0.3), this.r(s * 0.3, s * 0.8));
        p.vx = (cx - (R.x + R.w / 2)) * this.r(1.5, 3) + this.r(-40, 40); p.vy = this.r(-160, -60); p.vr = this.r(-9, 9);
      });
    }
  }

  private kick() { if (!this.raf && this.cv && typeof requestAnimationFrame !== 'undefined') { this.last = performance.now(); this.raf = requestAnimationFrame(this.frame); } }
  private frame = () => {
    this.raf = 0;
    const cv = this.cv, g = this.g; if (!cv || !g) return;
    const now = performance.now(), dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.step(dt, g);
    if (this.live > 0) this.raf = requestAnimationFrame(this.frame);
    else { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); }
  };
  /** 走一步并画（g 为空时只走不画：测试用） */
  step(dt: number, g: CanvasRenderingContext2D | null) {
    for (const p of this.pool) {
      if (!p.on) continue;
      p.t += dt;
      if (p.t >= p.life) { this.die(p); continue; }
      if (p.t < 0) continue;
      this.move(p, dt);
      if (g) this.draw(g, p);
    }
  }
  private die(p: P) {
    p.on = false; this.live--;
    if (p.group) { const i = this.groups.indexOf(p.group); if (i >= 0 && !this.pool.some((q) => q.on && q.group === p.group)) { this.groups.splice(i, 1); this.groupN--; } }
    // 碎片落尽：化成一缕墨烟 / 灵气（按类型）
    if (p.k === 'shard' && this.tier() > 0) {
      const k = p.kind;
      if (k === 'fire') for (let i = 0; i < 4; i++) this.add('ember', p.x + this.r(-4, 4), p.y, this.r(0.6, 1.1), this.r(1.2, 2.2), [255, this.r(120, 190) | 0, 50], (q) => { q.vy = this.r(-90, -50); q.vx = this.r(-20, 20); });
      else if (k === 'thunder') for (let i = 0; i < 3; i++) this.add('spark', p.x + this.r(-6, 6), p.y + this.r(-4, 4), this.r(0.12, 0.25), this.r(5, 9), [235, 225, 255], (q) => { q.rot = this.r(0, Math.PI * 2); });
      else if (k === 'ice') for (let i = 0; i < 3; i++) this.add('glass', p.x, p.y, this.r(0.35, 0.6), 3, [220, 245, 255], (q) => { q.poly.push(-3, -1, 0, -3, 3, 1, 0, 3); q.vx = this.r(-40, 40); q.vy = this.r(-40, 10); q.vr = this.r(-8, 8); });
      this.add('smoke', p.x, p.y, this.r(0.7, 1.1), this.r(6, 10), k === 'poison' ? [90, 170, 70] : k === 'normal' ? [60, 52, 46] : k === 'fire' ? [90, 60, 40] : k === 'ice' ? [200, 230, 255] : [150, 140, 220], (q) => { q.vy = this.r(-24, -10); q.vx = this.r(-8, 8); q.kind = k; });
    }
    if (p.k === 'drop') for (let i = 0; i < 3; i++) this.add('dot', p.x + this.r(-5, 5), p.floor + this.r(-1, 1), this.r(0.6, 0.9), this.r(0.8, 1.8), [40, 20, 16], (q) => { q.vx = this.r(-26, 26); });
  }
  private move(p: P, dt: number) {
    switch (p.k) {
      case 'shard': case 'glass': p.vy += 620 * dt; p.vx *= 1 - dt * 0.8; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; break;
      case 'ember': p.vx += Math.sin((p.t + p.s) * 9) * 60 * dt; p.x += p.vx * dt; p.y += p.vy * dt; break;
      case 'smoke': p.x += p.vx * dt; p.y += p.vy * dt; p.s += dt * 14; break;
      case 'drop': if (p.y < p.floor) { p.vy += 380 * dt; p.y = Math.min(p.floor, p.y + p.vy * dt); if (p.y >= p.floor) p.t = p.life; } break;
      case 'dot': p.x += p.vx * dt; p.vx *= 1 - dt * 6; break;
      case 'flow': { const u = Math.min(1, p.t / p.life), e = u * u; p.x = p.vx + (p.tx - p.vx) * e; p.y = p.vy + (p.ty - p.vy) * e; break; }
      default: break;
    }
  }
  private draw(g: CanvasRenderingContext2D, p: P) {
    const u = p.t / p.life, fade = u > 0.6 ? 1 - (u - 0.6) / 0.4 : 1;
    switch (p.k) {
      case 'shard': {
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.beginPath(); for (let i = 0; i < p.poly.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, p.poly[i], p.poly[i + 1]); g.closePath();
        g.globalAlpha = fade;
        // 灵光：外面一圈柔光（加色）
        g.shadowColor = rgba(p.c2, 0.9); g.shadowBlur = 6;
        g.fillStyle = rgba(p.c, 0.95); g.fill();
        g.shadowBlur = 0;
        if (p.tex && this.img.jade?.complete && this.img.jade.naturalWidth) {   // 白金碎玉：贴上玉纹
          g.save(); g.clip(); g.globalAlpha = 0.85 * fade; const s = 40; g.drawImage(this.img.jade, -s * 0.3, -s * 0.5, s * 0.6, s); g.restore();
        }
        g.lineWidth = 1; g.strokeStyle = rgba(p.c2, 0.95 * fade); g.stroke();
        g.restore(); break;
      }
      case 'glass': {
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = fade;
        g.beginPath(); for (let i = 0; i < p.poly.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, p.poly[i], p.poly[i + 1]); g.closePath();
        g.fillStyle = rgba(p.c, 0.45); g.fill(); g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.stroke(); g.restore(); break;
      }
      case 'ember': g.globalAlpha = fade; g.fillStyle = rgba(p.c, 1); g.beginPath(); g.arc(p.x, p.y, p.s * (1 - u * 0.5), 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; break;
      case 'spark': {
        g.globalAlpha = 1 - u; g.strokeStyle = rgba(p.c, 1); g.lineWidth = 1.4; g.beginPath();
        let x = p.x, y = p.y; g.moveTo(x, y);
        for (let i = 0; i < 3; i++) { x += Math.cos(p.rot + (i % 2 ? 0.9 : -0.9)) * p.s / 3; y += Math.sin(p.rot + (i % 2 ? 0.9 : -0.9)) * p.s / 3; g.lineTo(x, y); }
        g.stroke(); g.globalAlpha = 1; break;
      }
      case 'smoke': {
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s);
        gr.addColorStop(0, rgba(p.c, 0.32 * (1 - u))); gr.addColorStop(1, rgba(p.c, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.s, 0, Math.PI * 2); g.fill(); break;
      }
      case 'drop': g.fillStyle = rgba(p.c, 0.95); g.beginPath(); g.ellipse(p.x, p.y, p.s * 0.8, p.s * (1 + Math.min(1.2, p.vy / 200)), 0, 0, Math.PI * 2); g.fill(); break;
      case 'dot': g.fillStyle = rgba(p.c, 0.7 * (1 - u)); g.beginPath(); g.ellipse(p.x, p.y, p.s * 1.4, p.s * 0.7, 0, 0, Math.PI * 2); g.fill(); break;
      case 'flow': {
        g.globalAlpha = Math.min(1, p.t * 6) * (0.4 + 0.6 * (1 - u)); g.fillStyle = rgba(p.c, 1);
        g.shadowColor = rgba(p.c, 1); g.shadowBlur = 6; g.beginPath(); g.arc(p.x, p.y, p.s, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0; g.globalAlpha = 1; break;
      }
      case 'ripple': {
        const r = p.s * (0.3 + u * 1.2); g.strokeStyle = rgba(p.c, 0.9 * (1 - u)); g.lineWidth = 2 * (1 - u) + 0.6;
        g.beginPath(); g.ellipse(p.x, p.y, r, r * 0.55, 0, 0, Math.PI * 2); g.stroke(); break;
      }
      case 'bloom': {
        // 「按」一下：先压小（0–0.12 息）再晕开、收淡
        const k = u < 0.18 ? 0.55 + u / 0.18 * 0.6 : 1.15 + (u - 0.18) * 0.5, a = u < 0.18 ? 1 : 1 - (u - 0.18) / 0.82, s = p.s * k;
        const im = this.img.ink;
        if (p.kind === 'normal' && im?.complete && im.naturalWidth) { g.globalAlpha = 0.85 * a; g.drawImage(im, p.x - s / 2, p.y - s / 2, s, s); g.globalAlpha = 1; }
        else { const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, s / 2); gr.addColorStop(0, rgba(p.c, 0.8 * a)); gr.addColorStop(1, rgba(p.c, 0)); g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, s / 2, 0, Math.PI * 2); g.fill(); }
        break;
      }
      case 'seal': {
        const im = this.img.seal; if (!im?.complete || !im.naturalWidth) break;
        const k = u < 0.15 ? 1.7 - u / 0.15 * 0.7 : 1, a = u < 0.15 ? u / 0.15 : 1 - Math.max(0, u - 0.45) / 0.55, s = p.s * k;
        g.save(); g.globalAlpha = 0.95 * a; g.translate(p.x, p.y); g.rotate(-0.12); g.drawImage(im, -s / 2, -s / 2, s, s); g.restore(); break;
      }
      case 'crack': {
        g.globalAlpha = 1 - u; g.strokeStyle = rgba(p.c, 1); g.lineWidth = 1.6; g.shadowColor = 'rgba(255,220,150,1)'; g.shadowBlur = 5;
        g.beginPath(); for (let i = 0; i < p.poly.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, p.x + p.poly[i], p.y + p.poly[i + 1]); g.stroke();
        g.shadowBlur = 0; g.globalAlpha = 1; break;
      }
    }
  }
}
export const hpfx = new HpFx();

/** 重击：血条轻震（CSS 动画只动 transform；重新挂类名让动画重播） */
function shake(el: Element) {
  const h = el as HTMLElement; if (!h.classList) return;
  h.classList.remove('hpfx-shake'); void h.offsetWidth; h.classList.add('hpfx-shake');
}

/** 一条血条的「上一帧」：数值、身上的状态、回血攒了多少、上次滴血 */
export interface HpWatch { v: number; st: Set<string> | null; heal: number; dripT: number; poiseBroken?: boolean }
export const newWatch = (v: number): HpWatch => ({ v, st: null, heal: 0, dripT: 0 });
/** 每次数值更新时调：按变化发碎片 / 滴血 / 回血（el 是整条血条；st 是这位身上的状态，用来认伤害类型和持续掉血） */
export function watchHp(w: HpWatch, el: Element | null, v: number, st: Statuses | undefined, theme: HpTheme = 'hp', light = false, now = typeof performance !== 'undefined' ? performance.now() / 1000 : 0): HpReact {
  const prev = w.v;
  const react = classifyHp(prev, v, theme === 'hp' && dotOn(st), w.heal);
  const before = w.st;
  w.st = st ? new Set(Object.entries(st).filter(([, s]) => s && s.t > 0).map(([k]) => k)) : null;
  w.v = v;
  if (!el) return react;
  if (react.type === 'shard') {
    if (theme === 'mp' && prev - v < 0.01) return react;   // 法力：持续的小耗（御剑、神识外放）不碎
    w.heal = 0; hpfx.damage(el, prev, v, hitKind(st, before), react.heavy, theme, light);
  } else if (react.type === 'drip') {
    if (now - w.dripT > 0.14) { w.dripT = now; hpfx.drip(el, v, hitKind(st, before)); }
  } else if (react.type === 'heal') { w.heal = 0; if (theme === 'hp') hpfx.heal(el, v); }
  else if (v > prev) w.heal += v - prev;
  return react;
}
