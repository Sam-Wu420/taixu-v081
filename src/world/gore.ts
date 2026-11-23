// 打击感：溅血、血雾、地上的血迹；击杀时被打飞、落地才散；暴击击杀或一下打得远超剩余气血时整个炸开（碎块带着旋转飞散）；
// 一场战斗的最后一击放慢一下；首领分两段炸。
//
// 用户定的（2026-11-15）：写实鲜红；你和同伴挨打也溅血；地上的血迹二三十秒淡掉；其余按推荐——
//   流的东西分种类：妖兽、修士流血，虫类是绿色体液，鬼物是黑烟磷火；
//   碎块是把这只怪自己的样子画进一张小画布再切开，每种妖兽炸开都不一样；
//   设置里「血腥程度：关 / 适中 / 浓烈」，默认适中；远处、短时间死得太多的自动降级。
// 画面那一半（粒子、地面血迹）在 gl/goregl.ts；这里管逻辑、物理、碎块的绘制项。
import type { Combat, Enemy } from './combat';
import type { Drawable } from './life';
import type { Active } from './npc';
import { drawBeast } from '../gfx/beast';
import { drawBeastSprite } from '../gfx/beastTex';
import { drawCharacter } from '../gfx/character';
import { beastBox, charBox } from '../hd2d/boxes';
import { makeCanvas } from '../core/canvas';

export type Fluid = 'blood' | 'ichor' | 'ghost';
/** 血腥程度：0 关、1 适中（默认）、2 浓烈 */
export function goreLevel(): number {
  try { const v = typeof localStorage !== 'undefined' ? localStorage.getItem('taixu.gore') : null; return v === null ? 1 : Math.max(0, Math.min(2, Number(v) || 0)); } catch { return 1; }
}
export function setGoreLevel(v: number) { try { localStorage.setItem('taixu.gore', String(v)); } catch { /* */ } }
export const fluidOf = (e: Enemy): Fluid => (e.def.kind === 'ghost' ? 'ghost' : e.def.kind === 'insect' ? 'ichor' : 'blood');

export const GORE = {
  /** 地上血迹多久淡掉（秒）；最多留几块 */
  stainLife: 25, maxStains: 90,
  /** 碎块最多同时几块；一秒内最多炸开几个（再多的按普通击杀） */
  maxGibs: 80, burstPerSec: 4,
  /** 离你多远以外只出简化版 */
  near: 1600,
  /** 被打飞：水平速度、向上的初速、重力 */
  tossV: 520, tossUp: 420, grav: 1800,
} as const;

export interface Stain { x: number; y: number; r: number; rot: number; t: number; dur: number; fluid: Fluid; drops: [number, number, number][] }
interface Pending { x: number; y: number; r: number; at: number; fluid: Fluid }
interface Gib { x: number; y: number; z: number; vx: number; vy: number; vz: number; rot: number; vr: number; t: number; life: number; canvas: HTMLCanvasElement; sx: number; sy: number; sw: number; sh: number; w: number; h: number; fluid: Fluid | 'rock'; landed: boolean }
interface Toss { vx: number; vy: number; vz: number; z: number; fluid: Fluid; big: boolean }
interface Later { at: number; fn: () => void }

export class GoreSys {
  stains: Stain[] = [];
  private pending: Pending[] = [];
  private gibs: Gib[] = [];
  private later: Later[] = [];
  private bursts: number[] = [];
  private clock = 0;
  constructor(private readonly c: Combat) {}
  reset() { this.stains = []; this.pending = []; this.gibs = []; this.later = []; this.bursts = []; }
  private get k(): number { const L = goreLevel(); return L === 0 ? 0 : L === 2 ? 1.8 : 1; }
  private near(x: number, y: number) { const p = this.c.game.player; return Math.hypot(x - p.x, y - p.y) < GORE.near; }
  /** r9：撼山客出招的演出取景里（brawl.shotWho）：喷血、地上的血摊收小——镜头推得很近，一下下叠出来的血摊铺满半个画面 */
  private get staged(): boolean { try { return !!this.c.brawl?.shotWho; } catch { return false; } }

  // ------------------------------------------------------------ 受击
  /** 打中一个敌人：顺着攻击方向喷、留一团雾、血点落地成血迹 */
  onHit(e: Enemy, frac: number, crit: boolean, dir: number) {
    const k = this.k; if (!k) return;
    const fluid = fluidOf(e), power = Math.min(this.staged ? 0.7 : 3, Math.min(3, 0.5 + frac * 7) * (crit ? 1.6 : 1) * (this.near(e.x, e.y) ? 1 : 0.4));
    this.c.fxq.push({ k: 'blood', anchor: { x: e.x, y: e.y, offsetY: -e.flyH - e.lift }, x: e.x, y: e.y - this.c.hitY(e), dir, power: power * k, kind: fluid, crit });
    if (fluid !== 'ghost') this.splash(e.x, e.y, dir, power * k, fluid, e.flyH + e.lift);
  }
  /** 你挨打 */
  onPlayerHit(x: number, y: number, lift: number, big: boolean, dir: number) {
    const k = this.k; if (!k) return;
    const power = (big ? 1.8 : 0.9) * k * (this.staged ? 0.45 : 1);
    this.c.fxq.push({ k: 'blood', anchor: { x, y, offsetY: -lift }, x, y: y - 60, dir, power, kind: 'blood', crit: big });
    this.splash(x, y, dir, power * 0.8, 'blood', lift);
  }
  /** 同伴挨打 */
  onAllyHit(a: Active, frac: number, dir: number) {
    const k = this.k; if (!k) return;
    const power = Math.min(2.2, 0.6 + frac * 5) * k * 0.8;
    this.c.fxq.push({ k: 'blood', anchor: { x: a.st.x, y: a.st.y, offsetY: -a.st.lift }, x: a.st.x, y: a.st.y - 60, dir, power, kind: 'blood' });
    this.splash(a.st.x, a.st.y, dir, power * 0.7, 'blood', a.st.lift);
  }
  /** 血点飞出去落地：在攻击方向的前方撒几块血迹（隔一会儿才出现＝落地的时候） */
  private splash(x: number, y: number, dir: number, power: number, fluid: Fluid, lift: number) {
    const st = this.staged, n = Math.min(st ? 2 : 6, Math.round(1 + power * 1.6)), cx = Math.cos(dir), cy = Math.sin(dir);
    const fall = Math.sqrt(Math.max(0, lift) * 2 / GORE.grav);
    for (let i = 0; i < n; i++) {
      const d = 20 + Math.random() * (60 + power * 70), sp = (Math.random() - 0.5) * 0.9;
      const ex = x + (cx * Math.cos(sp) - cy * Math.sin(sp)) * d, ey = y + (cy * Math.cos(sp) + cx * Math.sin(sp)) * d * 0.7;
      this.pending.push({ x: ex, y: ey, r: st ? 6 + Math.random() * 6 : 10 + Math.random() * 14 + power * 6, at: this.clock + 0.22 + Math.random() * 0.25 + fall, fluid });
    }
  }
  stain(x: number, y: number, r: number, fluid: Fluid) {
    if (fluid === 'ghost') return;
    const drops: [number, number, number][] = [];
    for (let i = 0, n = 2 + Math.floor(Math.random() * 4); i < n; i++) { const a = Math.random() * Math.PI * 2, d = r * (0.8 + Math.random() * 1.2); drops.push([Math.cos(a) * d, Math.sin(a) * d * 0.6, r * (0.12 + Math.random() * 0.2)]); }
    this.stains.push({ x, y, r, rot: Math.random() * Math.PI * 2, t: 0, dur: GORE.stainLife * (goreLevel() === 2 ? 1.2 : 1), fluid, drops });
    if (this.stains.length > GORE.maxStains) this.stains.splice(0, this.stains.length - GORE.maxStains);
  }

  // ------------------------------------------------------------ 击杀
  /**
   * 敌人倒下。crit：这一击是暴击；over：这一击比剩下的气血多出一大截（超杀）。
   * 暴击击杀或超杀 → 炸开（首领分两段）；否则被打飞、落地才散。
   */
  onKill(e: Enemy, crit: boolean, over: boolean, dir: number, boss: boolean) {
    const k = this.k, fluid = fluidOf(e);
    // 最后一击：周围再没有盯着你的敌人了，放慢一下
    const p = this.c.game.player;
    if (!this.c.enemies.some((o) => o !== e && !o.dead && o.aggro && !o.spar && Math.hypot(o.x - p.x, o.y - p.y) < 1400)) this.c.game.slowmo(boss ? 0.45 : 0.22);
    if (!k) return;
    this.bursts = this.bursts.filter((t) => t > this.clock - 1);
    const canBurst = (crit || over || boss) && this.near(e.x, e.y) && this.bursts.length < GORE.burstPerSec;
    if (canBurst) {
      this.bursts.push(this.clock);
      if (boss) {
        // 首领：先是身上几处迸裂，半息后整个炸开
        const D = e as Enemy & { gibbed?: boolean; hold?: number };
        D.hold = this.clock + 0.5;   // 炸开之前先别淡出（倒地动画按 deathT 淡出）
        for (let i = 0; i < 3; i++) this.later.push({ at: this.clock + i * 0.13, fn: () => {
          this.c.fxq.push({ k: 'blood', anchor: { x: e.x, y: e.y, offsetY: -e.flyH - e.lift }, x: e.x + (Math.random() - 0.5) * 80, y: e.y - this.c.hitY(e) + (Math.random() - 0.5) * 60, dir: Math.random() * Math.PI * 2, power: 2.2 * k, kind: fluid, crit: true });
          this.c.game.juice(0.04, 0.25);
        } });
        this.later.push({ at: this.clock + 0.5, fn: () => { this.explode(e, fluid, k, dir, true); D.gibbed = true; e.deathT = 0.79; } });
      } else { this.explode(e, fluid, k, dir, crit); (e as Enemy & { gibbed?: boolean }).gibbed = true; e.deathT = 0.79; }
      return;
    }
    // 普通击杀：顺着最后一击的方向被打飞，落地时血溅一地
    const T = e as Enemy & { toss?: Toss };
    const v = GORE.tossV * (0.6 + Math.random() * 0.6) * ((e.def.look?.size ?? 1) > 2 ? 0.4 : 1);
    T.toss = { vx: Math.cos(dir) * v, vy: Math.sin(dir) * v * 0.6, vz: GORE.tossUp * (0.7 + Math.random() * 0.5), z: e.flyH + Math.max(0, e.lift), fluid, big: crit };
  }

  /** 炸开：把它的样子切成碎块飞散，一大摊血花、一团血雾、顿帧震屏 */
  private explode(e: Enemy, fluid: Fluid, k: number, dir: number, big: boolean) {
    const g = this.c.game;
    this.c.fxq.push({ k: 'gore', anchor: { x: e.x, y: e.y, offsetY: -e.flyH - e.lift }, x: e.x, y: e.y - this.c.hitY(e), dir, power: (big ? 2.4 : 1.8) * k * Math.max(1, (e.def.look?.size ?? 1) * 0.7), kind: fluid, big });
    if (fluid !== 'ghost') {
      const s = Math.max(1, (e.def.look?.size ?? 1) * 0.8);
      this.stain(e.x, e.y + 6, 60 * s * (0.8 + k * 0.3), fluid);
      for (let i = 0; i < 4 + Math.round(k * 3); i++) { const a = dir + (Math.random() - 0.5) * 2.2, d = 50 + Math.random() * 160 * s; this.pending.push({ x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d * 0.7, r: 12 + Math.random() * 22, at: this.clock + 0.3 + Math.random() * 0.4, fluid }); }
    }
    g.juice(big ? 0.11 : 0.08, big ? 0.6 : 0.45);
    this.gibsOf(e, fluid, dir);
  }

  /** 把敌人现在的样子画进一张小画布，切成几块，带着旋转向外飞散 */
  private gibsOf(e: Enemy, fluid: Fluid, dir: number) {
    const free = GORE.maxGibs - this.gibs.length; if (free < 4) return;
    const look = e.def.look, size = look?.size ?? 1;
    const box = e.look ? charBox(1.06, 0) : beastBox(size, 0);
    const K = 0.6, W = Math.ceil((box[1] - box[0]) * K), H = Math.ceil((box[3] - box[2]) * K);
    let canvas: HTMLCanvasElement;
    try { canvas = makeCanvas(W, H) as HTMLCanvasElement; } catch { return; }
    const g = canvas.getContext('2d'); if (!g) return;
    g.setTransform(K, 0, 0, K, (-box[0] - e.x) * K, (-box[2] - e.y) * K);
    // 刚挨了这一击，身上还带着受击的白闪：画碎块时先去掉，不然碎块是发白的
    const hit0 = e.anim.hit, flash0 = e.hitFlash; e.anim.hit = 0; e.hitFlash = 0;
    try {
      if (e.look && e.cs) drawCharacter(g as unknown as CanvasRenderingContext2D, e.look, e.cs, 1.06, 0);
      else if (look && !drawBeastSprite(g as unknown as CanvasRenderingContext2D, 'e:' + e.def.id, e.x, e.y, e.facing, e.anim, 1)) drawBeast(g as unknown as CanvasRenderingContext2D, look, e.x, e.y, e.facing, e.anim, 1);
    } catch { e.anim.hit = hit0; e.hitFlash = flash0; return; }
    e.anim.hit = hit0; e.hitFlash = flash0;
    this.cut(canvas, g, W, H, K, box, e.x, e.y, e.flyH + Math.max(0, e.lift), dir, fluid, Math.random, free);
  }
  /**
   * 近战（E2）：把一张现成的图（礁石、巨石的样子）切成碎块飞散——撞碎可破坏物用。
   * (l, r, t, b) 是图在世界里相对脚底 (x, y) 的范围；rnd 由调用方给（近战用自己的随机序列，不碰 Math.random）。
   */
  shatterImage(img: HTMLCanvasElement, l: number, r: number, t: number, b: number, x: number, y: number, z0: number, dir: number, fluid: Fluid | 'rock', rnd: () => number, _flip = false) {
    const free = GORE.maxGibs - this.gibs.length; if (free < 4) return;
    const g = img.getContext('2d'); if (!g) return;
    const K = img.width / Math.max(1, r - l);
    this.cut(img, g, img.width, img.height, K, [l, r, t, b], x, y, z0, dir, fluid, rnd, Math.min(free, 12), 4);
  }
  /** 切块：先找出画布里真正画了东西的范围，再切成 n×n，空白的块不要；碎块带着旋转向外飞散（随机数次序与原先一致） */
  private cut(canvas: HTMLCanvasElement, g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, W: number, H: number, K: number, box: readonly [number, number, number, number], ex: number, ey: number, z0: number, dir: number, fluid: Fluid | 'rock', rnd: () => number, free: number, n = 3) {
    // 先找出画布里真正画了东西的范围（立板框比身子大得多），再把这一块切成三列三行，空白的块不要
    let data: Uint8ClampedArray | null = null;
    try { data = g.getImageData(0, 0, W, H).data; } catch { data = null; }
    let bx0 = 0, by0 = 0, bx1 = W, by1 = H;
    if (data) {
      bx0 = W; by0 = H; bx1 = 0; by1 = 0;
      for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (data[(y * W + x) * 4 + 3] > 40) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
      if (bx1 <= bx0 || by1 <= by0) return;
    }
    const cols = n, rows = n, cw = (bx1 - bx0 + 2) / cols, ch = (by1 - by0 + 2) / rows;
    const filled = (x0: number, y0: number) => {
      if (!data) return true;
      let n = 0; for (let y = y0; y < y0 + ch; y += 3) for (let x = x0; x < x0 + cw; x += 3) { if (x < W && y < H && data[((y | 0) * W + (x | 0)) * 4 + 3] > 40) n++; }
      return n > 2;
    };
    const cxw = (box[0] + box[1]) / 2, cyw = (box[2] + box[3]) / 2;
    const rock = fluid === 'rock';
    let made = 0;
    for (let r = 0; r < rows && made < free; r++) for (let c = 0; c < cols && made < free; c++) {
      const sx = bx0 + c * cw, sy = by0 + r * ch; if (!filled(sx, sy)) continue;
      // 这一块在身上的位置（相对脚底，世界单位）
      const ox = box[0] + (sx + cw / 2) / K, oz = -(box[2] + (sy + ch / 2) / K);
      const out = Math.atan2(-(oz - (-cyw)) * 0.5, ox - cxw);
      const a = rnd() < 0.6 ? dir + (rnd() - 0.5) * 1.6 : out, v = (260 + rnd() * 420) * (rock ? 1.3 : 1);
      this.gibs.push({ x: ex + ox, y: ey + (rnd() - 0.5) * 20, z: z0 + Math.max(0, oz), vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6, vz: (260 + rnd() * 520) * (rock ? 1.2 : 1), rot: 0, vr: (rnd() - 0.5) * 14,
        t: 0, life: 1.5 + rnd() * 0.6, canvas, sx, sy, sw: cw, sh: ch, w: cw / K, h: ch / K, fluid, landed: false });
      made++;
    }
  }

  // ------------------------------------------------------------ 每帧
  update(dt: number) {
    this.clock += dt;
    for (let i = this.later.length - 1; i >= 0; i--) if (this.later[i].at <= this.clock) { const L = this.later[i]; this.later.splice(i, 1); L.fn(); }
    for (let i = this.pending.length - 1; i >= 0; i--) { const P = this.pending[i]; if (P.at <= this.clock) { this.pending.splice(i, 1); this.stain(P.x, P.y, P.r, P.fluid); } }
    for (const s of this.stains) s.t += dt;
    this.stains = this.stains.filter((s) => s.t < s.dur);
    // 被打飞的尸身：飞、落地溅血、再淡掉；首领炸开前先别淡
    for (const e of this.c.enemies) {
      const H = e as Enemy & { hold?: number }; if (e.dead && H.hold && H.hold > this.clock) e.deathT = 0;
      const T = e as Enemy & { toss?: Toss };
      const t = T.toss; if (!e.dead || !t) continue;
      if (t.vz !== 0 || t.z > 0) {
        e.deathT = Math.max(0, e.deathT - dt);   // 还在空中：先不淡
        e.x += t.vx * dt; e.y += t.vy * dt; t.vx *= Math.exp(-1.2 * dt); t.vy *= Math.exp(-1.2 * dt);
        t.z += t.vz * dt; t.vz -= GORE.grav * dt;
        e.flyH = 0; e.lift = Math.max(0, t.z);
        if (t.z <= 0) {
          t.z = 0; t.vz = 0; e.lift = 0;
          const k = this.k;
          if (k) {
            this.c.fxq.push({ k: 'blood', anchor: { x: e.x, y: e.y }, x: e.x, y: e.y - 20, dir: Math.atan2(t.vy, t.vx), power: (t.big ? 2.2 : 1.5) * k, kind: t.fluid, crit: t.big, big: true });
            if (t.fluid !== 'ghost') { this.stain(e.x, e.y + 4, (34 + (e.def.look?.size ?? 1) * 18) * (0.8 + k * 0.25), t.fluid); this.splash(e.x, e.y, Math.atan2(t.vy, t.vx), 1.4 * k, t.fluid, 0); }
          }
          e.deathT = 0.45;   // 落地后很快散掉
        }
      }
    }
    // 碎块
    for (const b of this.gibs) {
      b.t += dt;
      b.vx *= Math.exp(-(b.landed ? 4 : 0.6) * dt); b.vy *= Math.exp(-(b.landed ? 4 : 0.6) * dt);
      b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.vr * dt;
      b.z += b.vz * dt; b.vz -= GORE.grav * dt;
      if (b.z <= 0) {
        b.z = 0;
        if (!b.landed && this.k && b.fluid !== 'ghost' && b.fluid !== 'rock') this.stain(b.x, b.y, 8 + Math.random() * 10, b.fluid);   // 近战撞碎的石块（'rock'）不留血迹
        b.landed = true; b.vz = Math.abs(b.vz) > 120 ? -b.vz * 0.3 : 0; b.vr *= 0.5;
      }
    }
    this.gibs = this.gibs.filter((b) => b.t < b.life);
  }

  /** 碎块的绘制项（和人物一样立成立板） */
  collect(out: Drawable[]) {
    for (const b of this.gibs) {
      const a = Math.min(1, (b.life - b.t) / 0.4), hw = Math.max(b.w, b.h) * 0.75;
      out.push({ y: b.y, k: 'D·碎块', hx: b.x, hy: b.y, hb: [-hw, hw, -b.z - hw * 1.5, hw * 0.5], draw: (g) => {
        g.save(); g.globalAlpha *= a; g.translate(b.x, b.y - b.z - b.h * 0.3); g.rotate(b.rot);
        g.drawImage(b.canvas, b.sx, b.sy, b.sw, b.sh, -b.w / 2, -b.h / 2, b.w, b.h);
        g.restore();
      } });
    }
  }
  get gibCount() { return this.gibs.length; }
}
