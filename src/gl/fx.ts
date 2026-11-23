// 特效系统：粒子池 + 常用图元 + 预设（命中、爆炸、墨溅、余烬……）
// 粒子全部在 CPU 上以定长数组更新，GPU 一次绘制。
import { hfSetting } from '../world/hfsetting';   // r9-hitfeel
import { Batch, type GroundAnchor } from './batch';
import { C, atlasExtReady } from './atlas';

export type RGB = [number, number, number];
export interface TrailElevation { readonly groundOffsetY: number; readonly elevation: number }
export type FlightPoint = [x: number, groundY: number, verticalOffset: number];
import { bakeTex, bakeUV } from './fxbake';
import type { FlashLight } from '../hd2d/lights';
const cache = new Map<string, RGB>();
/** "255,130,40" / "#ff8228" -> [1, .51, .16] */
export function col(s: string | RGB): RGB {
  if (typeof s !== 'string') return s;
  let c = cache.get(s);
  if (!c) {
    if (s.startsWith('#')) c = [parseInt(s.slice(1, 3), 16) / 255, parseInt(s.slice(3, 5), 16) / 255, parseInt(s.slice(5, 7), 16) / 255];
    else { const p = s.split(',').map(Number); c = [(p[0] ?? 255) / 255, (p[1] ?? 255) / 255, (p[2] ?? 255) / 255]; }
    cache.set(s, c);
  }
  return c;
}
export const mixc = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const WHITE: RGB = [1, 1, 1];
const TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
// 第三十四步：CC0 贴图格（图集未就绪时退回代码格）
const SMOKES = [C.KSmoke1, C.KSmoke2, C.KSmoke3];
const RAYS = [C.KRays1, C.KRays2, C.KRays3];
const BURSTS = [C.KBurst1, C.KBurst2, C.KBurst3];
const FIRES = [C.KFire2, C.KFlick, C.KFire3];
const pk = (a: number[]) => a[(Math.random() * a.length) | 0];
/** 随机烟团格 */
export const smokeCell = () => (atlasExtReady() ? pk(SMOKES) : C.Smoke);
/** 随机火舌格（尖朝上） */
export const fireCell = () => (atlasExtReady() ? (Math.random() < 0.45 ? C.Flame : pk(FIRES)) : C.Flame);
export const rayCell = () => (atlasExtReady() ? pk(RAYS) : C.Star);
export const burstCell = () => (atlasExtReady() ? pk(BURSTS) : C.Core);
export const extOK = atlasExtReady;

// 粒子字段
const F = 23;
const X = 0, Y = 1, VX = 2, VY = 3, LIFE = 4, MAX = 5, S0 = 6, S1 = 7, ROT = 8, VR = 9, R = 10, G = 11, B = 12, A = 13, ADD = 14, CELL = 15, DRAG = 16, GRAV = 17, STR = 18, Z = 19;
const ANCHOR_X = 20, ANCHOR_Y = 21, LOCAL = 22;

export interface Emit {
  x: number; y: number; vx?: number; vy?: number; life: number; s0: number; s1?: number;
  rot?: number; vr?: number; c: RGB; a?: number; add?: number; cell?: number; drag?: number; grav?: number;
  stretch?: number; // >0：沿速度拉长（火花）
  z?: number;       // 高度偏移（向上为负），用于“落地”判定可忽略
  groundMotion?: boolean; // 速度沿世界地面移动；默认在立板平面运动
}

export class FxSys {
  B: Batch;
  private P = new Float32Array(F * 6000);
  private np = 0;
  quality = 1; // 0.5 = 粒子减半
  shocks: { x: number; y: number; r: number; amp: number; t: number; dur: number; R: number; A: number; anchor: GroundAnchor | null }[] = [];

  constructor(B: Batch) { this.B = B; }

  // ---------------------------------------------------------------- P2：一闪而过的光（命中、爆点、雷、弹道）
  /** 渲染器每帧把还亮着的交给点光源（hd2d/lights.ts）；life = 0 的只亮这一帧（弹道这种每帧重登的） */
  flashLights: FlashLight[] = [];
  /** x、y 世界坐标（2D）；h 离地多高；r 照亮半径；i 强度。有立板锚点时按锚点的脚下算位置、把纵向偏移折成高度 */
  light(x: number, y: number, h: number, r: number, c: RGB, i: number, life = 0) {
    if (this.flashLights.length >= 96 || !(i > 0) || !Number.isFinite(x + y)) return;
    const a = this.B.billboard;
    if (a) { h += Math.max(0, a.y - y) - (a.offsetY ?? 0); x = a.x; y = a.y; }
    this.flashLights.push({ x, y, h, r, c, i, t: 0, life });
  }

  // ---------------------------------------------------------------- 第三十五步：烘焙特效贴图（先入队，帧末一次性画）
  private bq = new Float32Array(16 * 1024); private nbq = 0;
  private readonly projectedAnchor = { x: 0, y: 0, offsetY: 0 };
  /** 世界坐标、世界尺寸的烘焙贴图四边形。sq：纵向压扁（地面贴花传 0.5 左右） */
  bk(k: number, x: number, y: number, w: number, h: number, rot: number, c: RGB, a: number, add = 1, sq = 1, ground = false) {
    if (!(a > 0.004) || this.nbq >= 1024 || !(w > 0.5 && h > 0.5 && w < 8000 && h < 8000) || !Number.isFinite(x + y + rot)) return;
    const o = this.nbq * 16, q = this.bq;
    q[o] = k; q[o + 1] = x; q[o + 2] = y; q[o + 3] = w; q[o + 4] = h; q[o + 5] = rot; q[o + 6] = c[0]; q[o + 7] = c[1]; q[o + 8] = c[2]; q[o + 9] = a; q[o + 10] = add; q[o + 11] = sq;
    const anchor = this.B.billboard;
    q[o + 12] = anchor?.x ?? 0; q[o + 13] = anchor?.y ?? 0; q[o + 14] = ground ? 2 : anchor ? 1 : 0; q[o + 15] = anchor?.offsetY ?? 0;
    this.nbq++;
  }
  /** 地面贴花（半径 r，先旋转再按透视压扁） */
  bkG(k: number, x: number, y: number, r: number, rot: number, c: RGB, a: number, add = 1, squash = 0.5) { this.bk(k, x, y, r * 2, r * 2, rot, c, a, add, squash, true); }
  /** 帧末：切到烘焙贴图画完队列，再切回图集 */
  flushBake(atlas: WebGLTexture | null) {
    const T = bakeTex(), n = this.nbq; this.nbq = 0;
    if (!T || !n || (globalThis as any).__noBake) return;
    const B = this.B, q = this.bq, previous = B.billboard, anchor = this.projectedAnchor;
    B.tex(T);
    for (let i = 0; i < n; i++) {
      const o = i * 16;
      if (q[o + 14] === 2) B.groundQuad(-2, q[o + 1], q[o + 2], q[o + 3] / 2, q[o + 5], q[o + 6], q[o + 7], q[o + 8], q[o + 9], q[o + 10], q[o + 11], bakeUV(q[o]));
      else {
        anchor.x = q[o + 12]; anchor.y = q[o + 13]; anchor.offsetY = q[o + 15]; B.billboard = q[o + 14] === 1 ? anchor : null;
        B.pt(q[o + 1], q[o + 2]); B.quadS(-2, B.ox, B.oy, q[o + 3] * B.os, q[o + 4] * B.os, q[o + 5], q[o + 6], q[o + 7], q[o + 8], q[o + 9], q[o + 10], bakeUV(q[o]), q[o + 11], B.od);
      }
    }
    B.billboard = previous;
    B.tex(atlas);
  }

  get count() { return this.np; }

  emit(e: Emit) {
    if (this.np >= 6000) return;
    if (this.quality < 1 && Math.random() > this.quality) return;
    const o = this.np * F, P = this.P;
    P[o + X] = e.x; P[o + Y] = e.y; P[o + VX] = e.vx ?? 0; P[o + VY] = e.vy ?? 0;
    P[o + LIFE] = 0; P[o + MAX] = e.life; P[o + S0] = e.s0; P[o + S1] = e.s1 ?? e.s0;
    P[o + ROT] = e.rot ?? 0; P[o + VR] = e.vr ?? 0;
    P[o + R] = e.c[0]; P[o + G] = e.c[1]; P[o + B] = e.c[2]; P[o + A] = e.a ?? 1; P[o + ADD] = e.add ?? 1;
    P[o + CELL] = e.cell ?? C.Glow; P[o + DRAG] = e.drag ?? 0; P[o + GRAV] = e.grav ?? 0; P[o + STR] = e.stretch ?? 0;
    const anchor = this.B.billboard;
    P[o + Z] = (e.z ?? 0) + (anchor?.offsetY ?? 0);
    P[o + ANCHOR_X] = anchor?.x ?? e.x; P[o + ANCHOR_Y] = anchor?.y ?? e.y; P[o + LOCAL] = anchor || !e.groundMotion ? 1 : 0;
    this.np++;
  }

  /** 冲击波（屏幕扭曲）：世界坐标，半径世界单位 */
  shock(x: number, y: number, R: number, amp = 14, dur = 0.5) { if (this.shocks.length < 6) this.shocks.push({ x, y, r: 0, amp, t: 0, dur, R, A: amp, anchor: this.B.billboard }); }

  update(dt: number) {
    // P2：上一帧登记的光按寿命走，过期的丢掉（只亮一帧的此时也到期了）
    if (this.flashLights.length) { for (const l of this.flashLights) l.t += dt; this.flashLights = this.flashLights.filter((l) => l.t < l.life); }
    const P = this.P;
    let i = 0;
    while (i < this.np) {
      const o = i * F;
      P[o + LIFE] += dt;
      if (P[o + LIFE] >= P[o + MAX]) {
        // 与末尾交换
        const last = (this.np - 1) * F;
        if (o !== last) P.copyWithin(o, last, last + F);
        this.np--; continue;
      }
      const dr = P[o + DRAG];
      if (dr) { const k = Math.exp(-dr * dt); P[o + VX] *= k; P[o + VY] *= k; }
      P[o + VY] += P[o + GRAV] * dt;
      P[o + X] += P[o + VX] * dt; P[o + Y] += P[o + VY] * dt;
      P[o + ROT] += P[o + VR] * dt;
      i++;
    }
    for (const s of this.shocks) { s.t += dt; const u = s.t / s.dur; s.r = s.R * (1 - Math.pow(1 - Math.min(1, u), 2.4)); s.amp = s.A * Math.pow(1 - Math.min(1, u), 1.5); }
    this.shocks = this.shocks.filter((s) => s.t < s.dur);
  }

  drawParticles() {
    const P = this.P, Bt = this.B, previous = Bt.billboard, anchor = this.projectedAnchor;
    for (let i = 0; i < this.np; i++) {
      const o = i * F;
      const u = P[o + LIFE] / P[o + MAX];
      const s = P[o + S0] + (P[o + S1] - P[o + S0]) * u;
      // 淡入 10%，其后淡出
      const fa = u < 0.1 ? u / 0.1 : 1 - (u - 0.1) / 0.9;
      const a = P[o + A] * fa * (P[o + ADD] > 0.5 ? 1 : fa);
      const str = P[o + STR];
      anchor.x = P[o + ANCHOR_X]; anchor.y = P[o + ANCHOR_Y]; anchor.offsetY = 0; Bt.billboard = P[o + LOCAL] ? anchor : null;
      Bt.pt(P[o + X], P[o + Y], P[o + Z]);
      if (str > 0) {
        const vx = P[o + VX], vy = P[o + VY], sp = Math.hypot(vx, vy);
        const L = Math.max(s, sp * str);
        Bt.quadS(C.Streak, Bt.ox, Bt.oy, L * 2 * Bt.z, s * 1.6 * Bt.z, Bt.direction(vx, vy), P[o + R], P[o + G], P[o + B], a, P[o + ADD], undefined, 1, Bt.od);
      } else Bt.quadS(P[o + CELL], Bt.ox, Bt.oy, s * Bt.z, s * Bt.z, P[o + ROT], P[o + R], P[o + G], P[o + B], a, P[o + ADD], undefined, 1, Bt.od);
    }
    Bt.billboard = previous;
  }

  // ---------------------------------------------------------------- 图元（世界坐标）
  glow(x: number, y: number, r: number, c: RGB, a = 1, cell: number = C.Glow) { this.B.quad(cell, x, y, r * 2, r * 2, 0, c[0], c[1], c[2], a, 1); }
  /** 白热亮核 + 彩色光晕 */
  orb(x: number, y: number, r: number, c: RGB, a = 1) {
    this.B.quad(C.Glow, x, y, r * 3.2, r * 3.2, 0, c[0], c[1], c[2], a * 0.55, 1);
    this.B.quad(C.Core, x, y, r * 1.6, r * 1.6, 0, c[0] * 0.6 + 0.4, c[1] * 0.6 + 0.4, c[2] * 0.6 + 0.4, a, 1);
    this.B.quad(C.Glow, x, y, r * 0.7, r * 0.7, 0, 1, 1, 1, a * 0.9, 1);
  }
  /** 定宽圆环（世界单位宽度），闭合条带 */
  circle(x: number, y: number, r: number, w: number, c: RGB, a: number, squash = 1, segs = 72) {
    // 第五轮性能：点阵和宽度 / 透明度的回调复用（神识圈每帧都画，原来每圈新建一个数组和两个闭包）；仍是 Float32，数值与原来一致
    if (!this.circPts || this.circPts.length < (segs + 1) * 2) this.circPts = new Float32Array(Math.max(146, (segs + 1) * 2));
    const pts = this.circPts;
    for (let i = 0; i <= segs; i++) { const an = (i / segs) * TAU; pts[i * 2] = x + Math.cos(an) * r; pts[i * 2 + 1] = y + Math.sin(an) * r * squash; }
    this.circW = w; this.circA = a;
    this.B.strip(C.Beam, pts, segs + 1, this.circWf ??= () => this.circW, this.circAf ??= () => this.circA, c[0], c[1], c[2], 1);
  }
  private circPts?: Float32Array; private circW = 0; private circA = 0; private circWf?: () => number; private circAf?: () => number;
  ring(x: number, y: number, r: number, c: RGB, a: number, squash = 0.55, soft = false, rot = 0) {
    this.B.quad(soft ? C.RingSoft : C.Ring, x, y, r * 2, r * 2 * squash, rot, c[0], c[1], c[2], a, 1);
  }
  ground(cell: number, x: number, y: number, r: number, rot: number, c: RGB, a: number, add = 1, squash = 0.5) {
    // 地面贴花：先旋转再压扁（透视）——用两次变换近似：压扁的旋转贴图
    this.B.groundQuad(cell, x, y, r, rot, c[0], c[1], c[2], a, add, squash);
  }
  sprite(cell: number, x: number, y: number, w: number, h: number, rot: number, c: RGB, a: number, add = 1) { this.B.quad(cell, x, y, w, h, rot, c[0], c[1], c[2], a, add); }

  /** 拖尾：pts 为 [x,y] 数组（旧 -> 新） */
  trail(pts: [number, number][], w: number, c: RGB, a: number, cell: number = C.Beam, add = 1, taper = 1, elevation?: TrailElevation) {
    const n = pts.length; if (n < 2) return;
    const flat = new Float32Array(n * 2), B = this.B, previous = B.billboard;
    const groundOffset = elevation?.groundOffsetY ?? 0;
    for (let i = 0; i < n; i++) { flat[i * 2] = pts[i][0]; flat[i * 2 + 1] = pts[i][1] + groundOffset; }
    if (elevation) B.billboard = null;
    B.strip(cell, flat, n, (i) => w * (1 - taper + taper * (i / (n - 1))), (i) => a * Math.pow(i / (n - 1), 1.3), c[0], c[1], c[2], add, elevation ? -groundOffset - elevation.elevation : 0);
    B.billboard = previous;
  }
  flightTrail(pts: readonly FlightPoint[], w: number, c: RGB, a: number, cell: number = C.Beam, add = 1, taper = 1) {
    const n = pts.length; if (n < 2) return;
    const flat = new Float32Array(n * 2), offsets = new Float32Array(n), B = this.B, previous = B.billboard;
    for (let i = 0; i < n; i++) { flat[i * 2] = pts[i][0]; flat[i * 2 + 1] = pts[i][1]; offsets[i] = pts[i][2]; }
    B.billboard = null;
    B.strip(cell, flat, n, (i) => w * (1 - taper + taper * (i / (n - 1))), (i) => a * Math.pow(i / (n - 1), 1.3), c[0], c[1], c[2], add, offsets);
    B.billboard = previous;
  }
  beam(x1: number, y1: number, x2: number, y2: number, w: number, c: RGB, a: number, cell: number = C.Beam, add = 1, elevations?: readonly [number, number]) {
    const flat = [x1, y1, x2, y2], previous = this.B.billboard;
    if (elevations) this.B.billboard = null;
    this.B.strip(cell, flat, 2, () => w, () => a, c[0], c[1], c[2], add, elevations ?? 0);
    this.B.billboard = previous;
  }
  lineSprite(cell: number, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, lengthScale: number, height: number, c: RGB, alpha: number, rotation = 0): void {
    const B = this.B, previous = B.billboard; B.billboard = null;
    B.pt(x1, y1, z1); const ax = B.ox, ay = B.oy, ad = B.od;
    B.pt(x2, y2, z2); const bx = B.ox, by = B.oy, bd = B.od;
    B.quadS(cell, (ax + bx) / 2, (ay + by) / 2, Math.hypot(bx - ax, by - ay) * lengthScale, height * B.os, Math.atan2(by - ay, bx - ax) + rotation, c[0], c[1], c[2], alpha, 1, undefined, 1, (ad + bd) / 2);
    B.billboard = previous;
  }
  /** 闪电：分形折线（seed 决定形状），带外晕与白芯 */
  bolt(x1: number, y1: number, x2: number, y2: number, seed: number, amp: number, w: number, c: RGB, a: number, segs = 12, branches = true, elevations?: readonly [number, number]) {
    const previous = this.B.billboard;
    if (elevations) this.B.billboard = null;
    const pts = jagPts(x1, y1, x2, y2, seed, amp, segs);
    const n = pts.length / 2;
    // P2：雷光照亮一大片（多半每帧重画，所以只亮一小会儿）
    this.light((x1 + x2) / 2, (y1 + y2) / 2, 90, Math.min(1100, Math.max(260, Math.hypot(x2 - x1, y2 - y1) * 0.8)), [c[0] * 0.5 + 0.5, c[1] * 0.5 + 0.5, c[2] * 0.5 + 0.5], 3 * Math.min(1, a), 0.06);
    const offsets = elevations ? Float32Array.from({ length: n }, (_, i) => elevations[0] + (elevations[1] - elevations[0]) * i / (n - 1)) : 0;
    this.B.strip(C.Beam, pts, n, () => w * 4, () => a * 0.45, c[0], c[1], c[2], 1, offsets);
    this.B.strip(C.Bolt, pts, n, () => w * 1.6, () => a, c[0] * 0.5 + 0.5, c[1] * 0.5 + 0.5, c[2] * 0.5 + 0.5, 1, offsets);
    if (branches) {
      let s = seed;
      for (let k = 2; k < n - 2; k += 3) {
        s = (s * 9301 + 49297) % 233280;
        if (s / 233280 > 0.55) continue;
        const bx = pts[k * 2], by = pts[k * 2 + 1];
        const ang = Math.atan2(y2 - y1, x2 - x1) + ((s % 2) ? 0.7 : -0.7);
        const L = Math.hypot(x2 - x1, y2 - y1) * 0.18;
        const bp = jagPts(bx, by, bx + Math.cos(ang) * L, by + Math.sin(ang) * L, s, amp * 0.4, 5);
        this.B.strip(C.Bolt, bp, bp.length / 2, (i) => w * (1 - i / 5) * 1.1, () => a * 0.8, c[0] * 0.5 + 0.5, c[1] * 0.5 + 0.5, c[2] * 0.5 + 0.5, 1, elevations ? elevations[0] + (elevations[1] - elevations[0]) * k / (n - 1) : 0);
      }
    }
    this.B.billboard = previous;
  }

  // ---------------------------------------------------------------- 预设
  sparks(x: number, y: number, c: RGB, n: number, speed = 320, life = 0.45, size = 3, dir?: number, spread = TAU) {
    for (let i = 0; i < n; i++) {
      const a = dir === undefined ? Math.random() * TAU : dir + (Math.random() - 0.5) * spread, v = speed * rnd(0.35, 1);
      this.emit({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7, life: life * rnd(0.6, 1.2), s0: size * rnd(0.7, 1.3), s1: size * 0.3, c: mixc(c, WHITE, 0.35), drag: 4, grav: 260, stretch: 0.035 });
    }
  }
  embers(x: number, y: number, c: RGB, n: number, r = 20) {
    for (let i = 0; i < n; i++) this.emit({ x: x + rnd(-r, r), y: y + rnd(-r, r) * 0.6, vx: rnd(-20, 20), vy: rnd(-90, -30), life: rnd(0.5, 1.2), s0: rnd(3, 7), s1: 1, c, drag: 1.5, grav: -20, cell: C.Glow });
  }
  smoke(x: number, y: number, n: number, c: RGB = [0.16, 0.15, 0.14], a = 0.35, r = 16, size = 40) {
    for (let i = 0; i < n; i++) this.emit({ x: x + rnd(-r, r), y: y + rnd(-r, r) * 0.6, vx: rnd(-30, 30), vy: rnd(-50, -10), life: rnd(0.7, 1.4), s0: size * 0.5, s1: size * rnd(1.2, 1.8), rot: Math.random() * TAU, vr: rnd(-1, 1), c, a: a * (atlasExtReady() ? 0.85 : 1), add: 0, cell: smokeCell(), drag: 2 });
  }
  /** 墨溅：水墨风受击（覆盖混合） */
  ink(x: number, y: number, s: number, a = 0.6, c: RGB = [0.1, 0.09, 0.09]) {
    this.emit({ x, y, life: 0.6, s0: s * 0.5, s1: s * 1.15, rot: Math.random() * TAU, c, a, add: 0, cell: C.Ink });
  }
  flash(x: number, y: number, r: number, c: RGB, life = 0.16) {
    this.light(x, y, 40, r * 5 + 90, c, 2.4, life * 2.4);   // P2：闪光照亮周围的地面和墙
    this.emit({ x, y, life, s0: r * 1.6, s1: r * 2.2, c: mixc(c, WHITE, 0.4), a: 0.75, cell: C.Core });
    this.emit({ x, y, life: life * 1.6, s0: r * 2.4, s1: r * 3.6, c, a: 0.32, cell: C.Glow });
    if (r > 26 && atlasExtReady()) this.emit({ x, y, life: life * 1.4, s0: r * 2.2, s1: r * 4, c: mixc(c, WHITE, 0.3), a: 0.32, cell: rayCell(), rot: Math.random() * TAU });
  }
  /** 放射光芒（短促） */
  rays(x: number, y: number, r: number, c: RGB, a = 0.45, life = 0.25) { if (!atlasExtReady()) return; this.emit({ x, y, life, s0: r * 0.8, s1: r * 2, c, a, cell: rayCell(), rot: Math.random() * TAU, vr: rnd(-0.6, 0.6) }); }
  /** 横向镜头光 + X 形闪光（暴击、剑芒） */
  glint(x: number, y: number, r: number, c: RGB, a = 0.8, life = 0.22) {
    if (!atlasExtReady()) { this.emit({ x, y, life, s0: r, s1: r * 1.6, c, a, cell: C.Star }); return; }
    this.emit({ x, y, life, s0: r * 2.2, s1: r * 3.4, c, a: a * 0.7, cell: C.KFlare });
    this.emit({ x, y, life: life * 0.8, s0: r * 0.9, s1: r * 1.5, c: mixc(c, WHITE, 0.5), a, cell: C.KGlint, rot: Math.random() * 0.6 });
  }
  /** 电火花团 */
  crackle(x: number, y: number, r: number, c: RGB, a = 0.9, n = 2) {
    if (!atlasExtReady()) return;
    for (let i = 0; i < n; i++) this.emit({ x: x + rnd(-r, r) * 0.4, y: y + rnd(-r, r) * 0.3, life: rnd(0.08, 0.16), s0: r * rnd(0.8, 1.2), s1: r * 1.3, c: mixc(c, WHITE, 0.45), a, cell: Math.random() < 0.5 ? C.KSpark1 : C.KSpark2, rot: Math.random() * TAU });
  }
  /** 火舌升腾（爆炸 / 火系落点） */
  flames(x: number, y: number, r: number, c: RGB, n: number, a = 0.85) {
    for (let i = 0; i < n; i++) { const an = Math.random() * TAU, d = Math.sqrt(Math.random()) * r; this.emit({ x: x + Math.cos(an) * d, y: y + Math.sin(an) * d * 0.5, vx: rnd(-20, 20), vy: rnd(-160, -60), life: rnd(0.35, 0.75), s0: rnd(0.35, 0.6) * r, s1: r * 0.12, c: mixc(c, [1, 0.95, 0.7], Math.random() * 0.35), a, cell: fireCell(), drag: 1.5, grav: -60 }); }
  }
  /** 烟环（爆点向外推开的烟圈，覆盖混合） */
  smokeRing(x: number, y: number, r: number, c: RGB = [0.2, 0.17, 0.14], a = 0.4, life = 0.9) {
    if (!atlasExtReady()) return;
    this.emit({ x, y, life, s0: r * 0.6, s1: r * 2.1, c, a, add: 0, cell: C.KSmokeRing, rot: Math.random() * TAU, vr: rnd(-0.5, 0.5) });
  }
  shockRing(x: number, y: number, r: number, c: RGB, life = 0.4, squash = 0.55, alpha = 1, ground = false) {
    // 用“椭圆环”粒子：S0->S1 扩张；粒子系统不支持非等比，故用竖向压扁的单帧图元在 update 里画——这里改为多段环粒子近似
    this.ringFx.push({ x, y, r, c, t: 0, life, squash, alpha, ground, anchor: this.B.billboard });
  }
  ringFx: { x: number; y: number; r: number; c: RGB; t: number; life: number; squash: number; alpha?: number; ground: boolean; anchor: GroundAnchor | null }[] = [];
  drawRings(dt: number) {
    const previous = this.B.billboard;
    for (const g of this.ringFx) {
      this.B.billboard = g.anchor;
      g.t += dt; const u = Math.min(1, g.t / g.life);
      const rr = g.r * (0.2 + 0.8 * (1 - Math.pow(1 - u, 3)));
      const a = Math.pow(1 - u, 1.4) * (g.alpha ?? 1) * (g.alpha !== undefined ? Math.min(1, u * 6) : 1);
      // r7-polish：尘色（暗）的贴地环本意是「尘浪，不发光」（各处调用的注释都这么写），原来照样加色、再叠一圈白——
      // 大坑、千钧坠这种半径上千的环会把半屏洗白。暗色的改成普通混合、不叠白圈；亮色的照旧
      const dark = g.c[0] * 0.3 + g.c[1] * 0.59 + g.c[2] * 0.11 < 0.45;
      if (g.ground && dark) {
        this.ground(C.RingSoft, g.x, g.y, rr, 0, g.c, a * 0.7, 0, g.squash);
      } else if (g.ground && hfSetting.on) {
        this.ground(C.Ring, g.x, g.y, rr, 0, g.c, a * 0.55, 1, g.squash);   // r9-hitfeel：亮色的贴地环只留一圈细边（软边那层在人脚下是一大片发白的光盘）
      } else if (g.ground) {
        this.ground(C.RingSoft, g.x, g.y, rr, 0, g.c, a * 0.9, 1, g.squash);
        this.ground(C.Ring, g.x, g.y, rr * 0.97, 0, WHITE, a * 0.5, 1, g.squash);
      } else if (hfSetting.on) {
        // r9-hitfeel：立着的冲击环只留一圈细边（原来软边的那一层在人身上是一整颗发白的柔光球，被打的人看不见轮廓——实拍看过）
        this.ring(g.x, g.y, rr, g.c, a * 0.7, g.squash, false);
      } else {
        this.ring(g.x, g.y, rr, g.c, a * 0.9, g.squash, true);
        this.ring(g.x, g.y, rr * 0.97, WHITE, a * 0.5, g.squash, false);
      }
    }
    this.B.billboard = previous;
    this.ringFx = this.ringFx.filter((g) => g.t < g.life);
  }

  /** 命中：亮闪 + 火花 + 墨溅 + 小冲击环。power 0..3 */
  hit(x: number, y: number, c: RGB, power = 1, crit = false, dir?: number) {
    const p = Math.min(3, power);
    this.flash(x, y, 18 + p * 10 + (crit ? 14 : 0), c, crit ? 0.2 : 0.13);
    this.sparks(x, y, c, Math.round(6 + p * 5 + (crit ? 10 : 0)), 280 + p * 80, 0.4, 3 + p, dir, dir === undefined ? TAU : 1.6);
    if (p >= 0.8 || crit) this.ink(x, y + 6, 40 + p * 18, 0.35 + (crit ? 0.15 : 0));
    if (crit || p >= 1.5) { this.shockRing(x, y + 20, 70 + p * 30, c, 0.35, 0.55, 0.55); this.emit({ x, y, life: 0.2, s0: 40 + p * 20, s1: 80 + p * 26, c: WHITE, a: 0.7, cell: C.Star, rot: Math.random() }); }
    if (atlasExtReady()) {
      // 碎芒（随机三种之一）+ 放射光
      this.emit({ x, y, life: 0.12 + p * 0.03, s0: 26 + p * 14, s1: 44 + p * 22, c: mixc(c, WHITE, 0.5), a: 0.55 + p * 0.1, cell: burstCell(), rot: Math.random() * TAU });
      if (p >= 1 || crit) this.rays(x, y, 50 + p * 26, c, 0.28 + p * 0.06, 0.2);
      if (crit) this.glint(x, y, 40 + p * 10, mixc(c, WHITE, 0.6), 0.85, 0.26);
    }
  }
  /** 爆炸：火球、雷爆等 */
  explode(x: number, y: number, r: number, c: RGB, opts: { smoke?: boolean; shock?: boolean; debris?: boolean } = {}) {
    this.flash(x, y, r * 0.45, c, 0.22);
    this.shockRing(x, y + r * 0.15, r * 1.3, c, 0.5);
    this.sparks(x, y, c, Math.round(14 + r / 6), 260 + r * 2.5, 0.6, 4);
    for (let i = 0; i < 10; i++) { const a = Math.random() * TAU, v = rnd(40, 140); this.emit({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 30, life: rnd(0.35, 0.7), s0: r * 0.45, s1: r * 0.12, c, drag: 3, cell: C.Glow, a: 0.45 }); }
    if (opts.smoke !== false) this.smoke(x, y, 6, [0.14, 0.12, 0.1], 0.3, r * 0.4, r * 0.9);
    if (atlasExtReady()) {
      this.emit({ x, y, life: 0.2, s0: r * 0.9, s1: r * 1.7, c: mixc(c, WHITE, 0.55), a: 0.85, cell: burstCell(), rot: Math.random() * TAU });
      this.rays(x, y, r * 1.6, c, 0.35, 0.3);
      if (opts.smoke !== false) this.smokeRing(x, y + r * 0.1, r * 1.1, [0.18, 0.15, 0.12], 0.35, 0.9);
      // 暖色爆炸：火舌冲起
      if (c[0] > 0.7 && c[2] < 0.55) this.flames(x, y, r * 0.7, c, Math.round(5 + r / 18), 0.8);
    }
    if (opts.shock !== false) this.shock(x, y, r * 2.2, 10 + r * 0.05, 0.55);
    if (opts.debris) for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + rnd(-1.2, 1.2), v = rnd(200, 420); this.emit({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.5, 0.9), s0: rnd(5, 10), c: [0.35, 0.28, 0.2], a: 0.9, add: 0, cell: C.Shard, rot: Math.random() * TAU, vr: rnd(-8, 8), grav: 900 }); }
    if (opts.debris && atlasExtReady()) this.emit({ x, y: y + 6, life: 0.9, s0: r * 0.8, s1: r * 1.5, c: [0.3, 0.24, 0.17], a: 0.55, add: 0, cell: C.KDirt, rot: Math.random() * TAU });
  }
}

export function jagPts(x1: number, y1: number, x2: number, y2: number, seed: number, amp: number, segs: number): number[] {
  let s = (seed | 0) % 233280; if (s < 0) s += 233280;
  const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  const out = [x1, y1];
  for (let i = 1; i < segs; i++) { const u = i / segs, o = (r() - 0.5) * amp * Math.sin(u * Math.PI) * 2; out.push(x1 + dx * u + nx * o, y1 + dy * u + ny * o); }
  out.push(x2, y2);
  return out;
}
