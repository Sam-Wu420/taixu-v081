// r7-fx3d：立体打击特效的「世界这一侧」——招式只往这里报要什么（不碰 three），画面在 hd2d/hsfx3d.ts（three.js 场景里的真 3D 网格 / 粒子 / 着色器）、
// 空间扭曲在后期（gl/stage.ts 的 uDist）、地面塌陷在地形着色器（hd2d/scene.ts 的 uDent）。撼山客的大招先用，以后别的招照样能调。
//
// 用法（g 是 Game；坐标一律是世界坐标 x / y 加「离地高度」z，和人物的 z / lift 一样）：
//   const F = fx3dOf(g);
//   F.sonic(x, y, z, dx, dy, dz, { power, vx, vy, vz })   音障锥：人前方一个半透明的水汽锥壳（菲涅尔边缘亮、中间透）+ 一圈往外炸开的环状激波
//   F.ring(x, y, z, nx, ny, nz, { r, power })             单独一圈激波环（法线方向给环面朝向；贴地的给 0, 0, 1）
//   F.smear(x0, y0, z0, x1, y1, z1, { w })                高速冲刺的模糊拖影：沿途一段半透明的「身形管」+ 一把立体的速度线
//   F.warp(x, y, z, { r, power, dur })                    空间扭曲冲击波：一层薄亮的膨胀球壳（3D）+ 屏幕空间折射（后期，中心强边缘弱、随时间扩散衰减）
//   F.debris(x, y, { n, r, power, dir, spread, up, z, delay })   有体积的碎石（翻滚、落地弹一下、沉下去）
//   F.dust(x, y, { r, power, delay })                     立体的环形尘浪（一圈往外推的土墙，散得快）
//   F.column(x, y, { h, r, dur, color })                  贯天的光柱（立体的圆柱，往上流）
//   F.halo(x, y, z, { r, dur, color })                    人背后一圈光（朝着镜头）
//   F.fire(key, x, y, z, vx, vy, vz, k, s)                火尾 / 燃烧的压缩空气锥：每帧报一次（不报了就自己熄掉），沿速度方向立体的锥形火焰 + 火粒子 + 烟
//   F.levitate(key, x, y, r, n, k)                        蓄力时脚边碎石浮起（每帧报；不报了就落回去）；F.blastFloat(key, dir) 把浮着的石头往外崩
//   F.dent(x, y, r, depth, hold)                          地面塌陷成深坑（地形网格真的往下陷，坑沿翻起；hold 秒后慢慢回平，地上的坑痕交给破坏系统）
//   F.ripple(x, y, { amp, speed, reach })                 地面震波：一圈地浪从这里往外推（远处的地也在震）
//   F.blast(x, y, power, palette, { z, r })               四层爆炸：白核（两三帧就没）→ 橙黄火焰往外喷（立体火球 + 火粒子）→ 暗红余烬火星（飘一会儿、往下落）
//                                                          → 灰褐烟尘（最后慢慢散）。palette：'fire'（默认）/ 'gold' / 'ink'（墨：白核 + 墨烟，无极一击）/ 'frost' / 'void'
//   F.scorch(x, y, r, { dur })                            焦痕：一片焦黑碎裂、裂缝里透暗红余烬的地面（贴着地形、跟着坑陷下去），几秒后余烬才熄、焦痕再淡掉
//   F.impact(x, y, z, dx, dy, { power, dz })              命中的方向性：白色星形闪光（两三帧）+ 几条朝打击方向射出的冲击线 + 空间扭曲冲击波
//   F.skid(who, dur)                                      被打的人往后滑：脚下一路拖出土（who 每帧给位置；离地高了就不冒）
//   F.jet(x, y, z, dx, dy, { len, power, spread, dz })    往前喷的火龙：一股火粒子沿方向喷出去 + 沿途几团接力的火爆（spread ≥ π 就是绕身一圈甩出去的火）
//   F.trail(x0, y0, x1, y1, n)                            冲刺一路地面冒烟（n 团土）
//   F.inferno(x, y, { r, dur, power })                    r9 满屏的火：一大片地方翻滚的火团 + 满天火星（觉醒大招）
// 都有数量上限、用完回收；没在放大招时这里的队列是空的，画面那边整组藏起来、每帧零开销。
// 规矩：这里一个随机数都不取（画面那边的抖动在渲染里取，不在招式路径上）；不伤人、不改地形的真高度（只是画面）。
// 声音（r7-fx3d）：音障、扭曲冲击波（力度 ≥ 1）、四层爆炸、火龙、坑在这里顺手配上（world/audio.ts 合成的 fx_*）；火尾每帧报的同时报燃烧呼啸（audio.burn）。
// 没有声音设备（无头测试）时 audio 直接返回，不取随机数。
import type { Game } from './game';
import { audio } from './audio';

export type RGB3 = [number, number, number];
/** r8-p2 弧带的参数（见 Fx3dState.arc） */
export interface Fx3dArc { e1: [number, number, number]; a0: number; sweep: number; w: number; mode: 'fire' | 'wind' | 'purple'; tall: boolean; spin: number; sweepT: number; tail: number }
export interface Fx3dEv {
  k: 'sonic' | 'ring' | 'smear' | 'warp' | 'debris' | 'dust' | 'column' | 'halo' | 'blast' | 'scorch' | 'star' | 'puff' | 'jet' | 'flare' | 'arc' | 'inferno';
  /** r8-p2：弧带（arc）、火球闪 / 太阳（flare 的 n：0 火球闪、1 太阳、2 星芒） */
  arc?: Fx3dArc;
  /** blast 的配色 */
  pal?: Fx3dPalette;
  x: number; y: number; z: number;
  /** 第二个点（smear 的终点）或方向（sonic / ring 的朝向） */
  x2: number; y2: number; z2: number;
  r: number; p: number; dur: number;
  n: number; dir: number; spread: number; up: number; delay: number;
  vx: number; vy: number; vz: number;
  col: RGB3 | null;
}
/** 四层爆炸的配色：白核、焰（热 → 冷）、余烬、烟 */
export type Fx3dPalette = 'fire' | 'gold' | 'ink' | 'frost' | 'void';
export interface Fx3dSkid { at: () => { x: number; y: number; z: number } | null; t: number; dur: number; acc: number; lx: number; ly: number }
export interface Fx3dFire { key: string; x: number; y: number; z: number; vx: number; vy: number; vz: number; k: number; seen: number; s: number }
export interface Fx3dFloat { key: string; x: number; y: number; r: number; n: number; k: number; seen: number; blast: { dir: number; p: number } | null }
export interface Fx3dDent { x: number; y: number; r: number; depth: number; t: number; hold: number; out: number }
export interface Fx3dRipple { x: number; y: number; t: number; amp: number; speed: number; reach: number }

/** 可调的数 */
export const FX3D = {
  /** 队列最多压几件（没有画面消费时——无头测试——多出来的丢掉最旧的） */
  queueMax: 96,
  /** 同时塌着的坑最多几个、地浪最多几圈 */
  dentMax: 2, rippleMax: 1,
  /** 坑：陷下去多快（秒）、回平要多久 */
  dentIn: 0.12, dentOut: 3,
} as const;

export class Fx3dState {
  q: Fx3dEv[] = [];
  readonly fires = new Map<string, Fx3dFire>();
  readonly floats = new Map<string, Fx3dFloat>();
  dents: Fx3dDent[] = [];
  ripples: Fx3dRipple[] = [];
  skids: Fx3dSkid[] = [];
  /** 测试 / 交付说明用 */
  stats = { ev: 0, dropped: 0 };
  private clock = 0;
  constructor(readonly g: Game) {}
  /** 世界时间（这一份自己的钟：sonic 等事件的时刻、fire / levitate 的「还在报」都按它算） */
  get now() { return this.clock; }

  /** 有没有要画的（render.ts 每帧先问这一句；false 就整组藏起来、不更新） */
  get busy(): boolean { return this.q.length > 0 || this.fires.size > 0 || this.floats.size > 0 || this.dents.length > 0 || this.ripples.length > 0 || this.skids.length > 0 || this.auras.size > 0; }

  // ---------------------------------------------------------------- 一次性的
  private push(e: Partial<Fx3dEv> & Pick<Fx3dEv, 'k' | 'x' | 'y'>) {
    const ev: Fx3dEv = { z: 0, x2: 0, y2: 0, z2: 0, r: 0, p: 1, dur: 0, n: 0, dir: 0, spread: Math.PI, up: 1, delay: 0, vx: 0, vy: 0, vz: 0, col: null, ...e };
    this.q.push(ev); this.stats.ev++;
    if (this.q.length > FX3D.queueMax) { this.q.shift(); this.stats.dropped++; }
  }
  sonic(x: number, y: number, z: number, dx: number, dy: number, dz: number, o: { power?: number; vx?: number; vy?: number; vz?: number; col?: RGB3; delay?: number } = {}) {
    const L = Math.hypot(dx, dy, dz) || 1;
    this.push({ k: 'sonic', x, y, z, x2: dx / L, y2: dy / L, z2: dz / L, p: o.power ?? 1, vx: o.vx ?? 0, vy: o.vy ?? 0, vz: o.vz ?? 0, col: o.col ?? null, delay: o.delay ?? 0 });
    audio.sfx('fx_sonic', x, y);
  }
  ring(x: number, y: number, z: number, nx: number, ny: number, nz: number, o: { r?: number; power?: number; col?: RGB3; delay?: number; dur?: number } = {}) {
    const L = Math.hypot(nx, ny, nz) || 1;
    this.push({ k: 'ring', x, y, z, x2: nx / L, y2: ny / L, z2: nz / L, r: o.r ?? 260, p: o.power ?? 1, col: o.col ?? null, delay: o.delay ?? 0, dur: o.dur ?? 0.38 });
  }
  /** r19 top：画在最上面（不被人物立板挡住；夜无赦的十字光刃横贯在几丈高的魔躯前面） */
  smear(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, o: { w?: number; col?: RGB3; dur?: number; top?: boolean } = {}) {
    this.push({ k: 'smear', x: x0, y: y0, z: z0, x2: x1, y2: y1, z2: z1, r: o.w ?? 46, col: o.col ?? null, dur: o.dur ?? 0.32, ...(o.top ? { p: 2 } : {}) });
  }
  warp(x: number, y: number, z: number, o: { r?: number; power?: number; dur?: number; delay?: number } = {}) {
    this.push({ k: 'warp', x, y, z, r: o.r ?? 520, p: o.power ?? 1, dur: o.dur ?? 0.55, delay: o.delay ?? 0 });
    if ((o.power ?? 1) >= 1) audio.sfx('fx_warp', x, y);
  }
  /** hot：火爆里崩出来的（红褐色） */
  debris(x: number, y: number, o: { n?: number; r?: number; power?: number; dir?: number; spread?: number; up?: number; z?: number; delay?: number; size?: number; hot?: boolean } = {}) {
    this.push({ k: 'debris', x, y, z: o.z ?? 0, n: o.n ?? 14, r: o.r ?? 120, p: o.power ?? 1, dir: o.dir ?? 0, spread: o.spread ?? Math.PI, up: o.up ?? 1, delay: o.delay ?? 0, dur: o.size ?? 1, col: o.hot ? [0.7, 0.3, 0.15] : null });
  }
  dust(x: number, y: number, o: { r?: number; power?: number; delay?: number; col?: RGB3 } = {}) {
    this.push({ k: 'dust', x, y, r: o.r ?? 500, p: o.power ?? 1, delay: o.delay ?? 0, col: o.col ?? null });
  }
  column(x: number, y: number, o: { h?: number; r?: number; dur?: number; col?: RGB3; z?: number } = {}) {
    this.push({ k: 'column', x, y, z: o.z ?? 0, z2: o.h ?? 4200, r: o.r ?? 110, dur: o.dur ?? 1.3, col: o.col ?? null });
  }
  halo(x: number, y: number, z: number, o: { r?: number; dur?: number; col?: RGB3 } = {}) {
    this.push({ k: 'halo', x, y, z, r: o.r ?? 260, dur: o.dur ?? 0.8, col: o.col ?? null });
  }

  blast(x: number, y: number, power = 1, pal: Fx3dPalette = 'fire', o: { z?: number; r?: number; delay?: number } = {}) {
    this.push({ k: 'blast', x, y, z: o.z ?? 0, p: power, r: o.r ?? 220 * (0.6 + 0.4 * power), pal, delay: o.delay ?? 0 });
    audio.sfx('fx_blast', x, y);
  }
  scorch(x: number, y: number, r: number, o: { dur?: number; delay?: number } = {}) {
    this.push({ k: 'scorch', x, y, r, dur: o.dur ?? 7, delay: o.delay ?? 0 });
  }
  impact(x: number, y: number, z: number, dx: number, dy: number, o: { power?: number; dz?: number; warp?: number } = {}) {
    const L = Math.hypot(dx, dy, o.dz ?? 0) || 1, p = o.power ?? 1;
    this.push({ k: 'star', x, y, z, x2: dx / L, y2: dy / L, z2: (o.dz ?? 0) / L, p, r: 120 * (0.7 + 0.3 * p) });
    if ((o.warp ?? 1) > 0) this.warp(x, y, z, { r: 420 * (0.6 + 0.4 * p) * (o.warp ?? 1), power: p, dur: 0.5 });
  }
  jet(x: number, y: number, z: number, dx: number, dy: number, o: { len?: number; power?: number; spread?: number; dz?: number; pal?: Fx3dPalette; delay?: number } = {}) {
    const L = Math.hypot(dx, dy, o.dz ?? 0) || 1;
    this.push({ k: 'jet', x, y, z, x2: dx / L, y2: dy / L, z2: (o.dz ?? 0) / L, r: o.len ?? 1200, p: o.power ?? 1, spread: o.spread ?? 0.18, pal: o.pal ?? 'fire', delay: o.delay ?? 0 });
    audio.sfx('fx_roar', x, y);
  }
  /**
   * r8-p2 火球闪 / 太阳 / 星芒：朝着镜头的一大团光（HDR：白芯过曝、橙黄、红边，几根朝外的光刺）。r 是半径（世界单位），
   * mode：'blast' 爆炸的火球闪（一下子胀开、零点几息退掉）、'sun' 赤日（圆、外圈火焰、光刺转着）、'star' 只有星芒
   */
  flare(x: number, y: number, z: number, o: { r?: number; dur?: number; mode?: 'blast' | 'sun' | 'star'; col?: RGB3; delay?: number } = {}) {
    this.push({ k: 'flare', x, y, z, r: o.r ?? 300, dur: o.dur ?? 0.42, n: o.mode === 'sun' ? 1 : o.mode === 'star' ? 2 : 0, col: o.col ?? null, delay: o.delay ?? 0 });
  }
  /**
   * r8-p2 弧带：一段圆弧上的一条光带——甩出去的火焰弧、绕身的火环、风刃、横躺的飓风环、凤翼。圆心 (x, y, 离地 z)，
   * n 圆面的法线（世界方向，贴地的给 0, 0, 1），e1 圆面上 0 度的方向（不给就自己找一个）；a0 起始角、sweep 扫过多少（弧度，负的反着扫）；
   * r 半径、w 带宽；sweepT 头扫完要多久（之后整条留着淡掉）、tail 尾巴多短（越大越短）；spin 整条绕圆心转（弧度 / 秒）；
   * tall：带宽沿法线（立起来的一圈墙，飓风环）而不是沿半径；mode 火 / 风 / 紫
   */
  arc(x: number, y: number, z: number, o: { nx?: number; ny?: number; nz?: number; e1?: [number, number, number]; a0?: number; sweep?: number; r?: number; w?: number; dur?: number; sweepT?: number; tail?: number; spin?: number; tall?: boolean; mode?: 'fire' | 'wind' | 'purple'; power?: number; delay?: number; col?: RGB3 } = {}) {
    const nx = o.nx ?? 0, ny = o.ny ?? 0, nz = o.nz ?? 1, L = Math.hypot(nx, ny, nz) || 1;
    this.push({ k: 'arc', x, y, z, x2: nx / L, y2: ny / L, z2: nz / L, r: o.r ?? 200, dur: o.dur ?? 0.5, p: o.power ?? 1, delay: o.delay ?? 0, col: o.col ?? null,
      arc: { e1: o.e1 ?? [0, 0, 0], a0: o.a0 ?? 0, sweep: o.sweep ?? Math.PI, w: o.w ?? 60, mode: o.mode ?? 'fire', tall: !!o.tall, spin: o.spin ?? 0, sweepT: o.sweepT ?? (o.dur ?? 0.5) * 0.4, tail: o.tail ?? 3 } });
  }
  /**
   * r9 满屏的火：dur 息里在 (x, y) 周围 r 以内不断冒大团火舌（一层层往上卷）、满天火星——觉醒大招里整屏翻滚的火团。
   * power 越大越密；up：火团离地能冒多高（按 r 的几成）
   */
  inferno(x: number, y: number, o: { r?: number; dur?: number; power?: number; z?: number; up?: number; delay?: number } = {}) {
    this.push({ k: 'inferno', x, y, z: o.z ?? 0, r: o.r ?? 700, dur: o.dur ?? 0.8, p: o.power ?? 1, up: o.up ?? 1, delay: o.delay ?? 0 });
    audio.sfx('fx_roar', x, y);
  }
  /** r8-p2 燃身：每帧报一次（不报了就熄），人身上立体的火一直往上蹿、身后一圈亮边。k 火势（0‥2） */
  aura(key: string, x: number, y: number, z: number, k = 1) {
    let a = this.auras.get(key);
    if (!a) { a = { key, x, y, z, k, seen: this.clock }; this.auras.set(key, a); }
    a.x = x; a.y = y; a.z = z; a.k = k; a.seen = this.clock;
  }
  readonly auras = new Map<string, { key: string; x: number; y: number; z: number; k: number; seen: number }>();
  trail(x0: number, y0: number, x1: number, y1: number, n = 6) {
    for (let i = 0; i < n; i++) { const u = (i + 0.5) / n; this.push({ k: 'puff', x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u, p: 0.8, delay: u * 0.08 }); }
  }
  /** 被打的人往后滑、脚下拖土：at 每帧给位置（null = 没了）；dur 秒 */
  skid(at: () => { x: number; y: number; z: number } | null, dur = 0.7) {
    this.skids.push({ at, t: 0, dur, acc: 0, lx: NaN, ly: NaN });
    if (this.skids.length > 4) this.skids.shift();
  }

  // ---------------------------------------------------------------- 每帧报的
  /** s：大小（1 = 裹住一个人的火尾；拳头上的一团火给 0.3 上下） */
  fire(key: string, x: number, y: number, z: number, vx: number, vy: number, vz: number, k = 1, s = 1) {
    let f = this.fires.get(key);
    if (!f) { f = { key, x, y, z, vx, vy, vz, k, seen: this.clock, s }; this.fires.set(key, f); }
    f.x = x; f.y = y; f.z = z; f.vx = vx; f.vy = vy; f.vz = vz; f.k = k; f.seen = this.clock; f.s = s;
    audio.burn(key, k * Math.min(1, 0.4 + s), x, y);
  }
  levitate(key: string, x: number, y: number, r: number, n: number, k: number) {
    let f = this.floats.get(key);
    if (!f) { f = { key, x, y, r, n, k, seen: this.clock, blast: null }; this.floats.set(key, f); }
    f.x = x; f.y = y; f.r = r; f.n = n; f.k = k; f.seen = this.clock;
  }
  /** 浮着的石头往 dir 方向崩出去（之后这一份就收了） */
  blastFloat(key: string, dir: number, p = 1) { const f = this.floats.get(key); if (f) { f.blast = { dir, p }; f.seen = this.clock; } }
  dent(x: number, y: number, r: number, depth: number, hold = 24) {
    this.dents.push({ x, y, r, depth, t: 0, hold, out: 0 });
    audio.sfx('fx_crash', x, y);
    if (this.dents.length > FX3D.dentMax) this.dents.shift();
  }
  ripple(x: number, y: number, o: { amp?: number; speed?: number; reach?: number } = {}) {
    this.ripples.push({ x, y, t: 0, amp: o.amp ?? 22, speed: o.speed ?? 2600, reach: o.reach ?? 2600 });
    if (this.ripples.length > FX3D.rippleMax) this.ripples.shift();
  }

  /** 这一刻坑（和地浪）让地面在 (x, y) 处往下陷了多少（render.ts 给立体画面的取高：人站在坑里、地浪上） */
  dentAt(x: number, y: number): number {
    let h = 0;
    for (const d of this.dents) {
      const k = dentK(d); if (k <= 0) continue;
      const q = Math.hypot(x - d.x, y - d.y) / d.r;
      h += dentProfile(q) * d.depth * k;
    }
    for (const r of this.ripples) h += rippleAt(r, x, y);
    return h;
  }

  /** 每帧（世界在跑时；放在 hanshan.tick 的钩子之前也行，顺序无所谓） */
  tick(dt: number) {
    this.clock += dt;
    for (const [k, f] of this.fires) if (this.clock - f.seen > 0.6) this.fires.delete(k);
    for (const [k, f] of this.floats) if (this.clock - f.seen > (f.blast ? 0.3 : 1.2)) this.floats.delete(k);
    for (const [k, a] of this.auras) if (this.clock - a.seen > 0.6) this.auras.delete(k);
    for (const d of this.dents) d.t += dt;
    this.dents = this.dents.filter((d) => d.t < FX3D.dentIn + d.hold + FX3D.dentOut);
    for (const r of this.ripples) r.t += dt;
    this.ripples = this.ripples.filter((r) => r.t * r.speed < r.reach + 600);
    // 往后滑：贴地时每隔一小段冒一团土（按走过的路程，不是按时间：停下了就不冒）
    for (const s of this.skids) {
      s.t += dt;
      const q = s.at(); if (!q) { s.t = s.dur; continue; }
      if (!Number.isNaN(s.lx) && q.z < 50) { s.acc += Math.hypot(q.x - s.lx, q.y - s.ly); if (s.acc > 55) { s.acc = 0; this.push({ k: 'puff', x: q.x, y: q.y, p: Math.max(0.4, 1 - s.t / s.dur) }); } }
      s.lx = q.x; s.ly = q.y;
    }
    if (this.skids.length) this.skids = this.skids.filter((s) => s.t < s.dur);
  }
  reset() { this.q = []; this.fires.clear(); this.floats.clear(); this.dents = []; this.ripples = []; this.skids = []; this.auras.clear(); }
}

/** 坑的剖面（q = 离心距离 / 半径）：碗底往下（正数是往下陷），坑沿一圈往上翻（负数） */
export function dentProfile(q: number): number {
  if (q >= 1.7) return 0;
  const bowl = q < 1 ? (1 - q * q) * (1 - q * q) : 0;
  const u = (q - 1.08) / 0.24, rim = Math.exp(-u * u) * 0.22;
  return bowl - rim;
}
/** 坑此刻陷了几成：一下子陷下去，hold 之后慢慢回平 */
export function dentK(d: Fx3dDent): number {
  if (d.t < FX3D.dentIn) { const u = d.t / FX3D.dentIn; return 1.25 * u - 0.25 * u * u * u; }   // 先砸过头一点再弹回
  const t2 = d.t - FX3D.dentIn - d.hold;
  if (t2 <= 0) return 1;
  const u = Math.min(1, t2 / FX3D.dentOut);
  return 1 - u * u * (3 - 2 * u);
}
/** 一圈地浪在 (x, y) 处的起伏（正数往下）：波前按 speed 往外推，越远越弱 */
export function rippleAt(r: Fx3dRipple, x: number, y: number): number {
  const L = Math.hypot(x - r.x, y - r.y), R = r.t * r.speed, w = 260;
  const u = (L - R) / w;
  if (u < -2.2 || u > 2.2 || L > r.reach) return 0;
  const fade = (1 - L / r.reach) * Math.min(1, r.t / 0.05);
  return -Math.sin(u * Math.PI) * Math.exp(-u * u) * r.amp * fade;
}

/** 一局一份（挂在 Game 上，不改 Game 的字段） */
const STATE = new WeakMap<Game, Fx3dState>();
export function fx3dOf(g: Game): Fx3dState { let s = STATE.get(g); if (!s) { s = new Fx3dState(g); STATE.set(g, s); } return s; }
/** 画面用：这一局有没有（没有就不画） */
export function fx3dPeek(g: Game): Fx3dState | undefined { return STATE.get(g); }

// ==================================================================== r16 夜无赦：魔修特效（世界这一侧；画法在 hd2d/ywsfx3d.ts）
// 只增不改：一份自己的队列 yq（画面那边 YwsFx3D 每帧取走），外加每帧报的魔翼（wing，不报了就收）。
//   F.scythe(x, y, z, { nx, ny, nz, e1, a0, sweep, r, w, dur })   魂镰刀光：一段立体的弧带（紫黑的芯、血红的刃边、外沿一层暗紫的魔焰），普通混合 + 一层加色的刃光
//   F.spike(x, y, { h, r, dur, tilt, dir, delay, n })             冥狱石柱：从地里拔起的立体石柱（多棱、带裂纹，裂缝里透暗红），拔起时崩出碎石，停一会儿沉回去
//   F.gate(x, y, { r, dur, dir, z })                              鬼门：立起来的一副门框（两根柱、一道横梁，暗石刻纹）+ 门里一面往里旋的紫黑旋涡
//   F.tendril(x, y, z, x2, y2, z2, { w, dur, n, wave })           魔触：一条分节的立体带子从 (x, y, z) 伸向 (x2, y2, z2)，一节一节蠕动、末端带钩
//   F.wing(key, x, y, z, ang, k, span)                            魔翼：背后一对巨大的立体翼面（骨架 + 翼膜，翼膜透暗红），每帧报一次，不报了就收起
//   F.soul(x, y, z, { r, dur, n })                                噬魂：一圈魂火往中心吸
export type YwsFxKind = 'scythe' | 'spike' | 'gate' | 'tendril' | 'soul' | 'pillar';
export interface YwsFxEv {
  k: YwsFxKind; x: number; y: number; z: number;
  /** 法线 / 终点 / 朝向 */
  nx: number; ny: number; nz: number; x2: number; y2: number; z2: number;
  e1: [number, number, number]; a0: number; sweep: number;
  r: number; w: number; h: number; dur: number; delay: number; p: number; n: number; dir: number; tilt: number; wave: number;
  col: RGB3 | null;
}
export interface YwsWing { key: string; x: number; y: number; z: number; ang: number; k: number; span: number; seen: number }
export interface Fx3dState {
  /** 魔修特效的队列（hd2d/ywsfx3d.ts 每帧取走；没有画面时多出来的丢掉最旧的） */
  yq: YwsFxEv[];
  ywings: Map<string, YwsWing>;
  scythe(x: number, y: number, z: number, o?: { nx?: number; ny?: number; nz?: number; e1?: [number, number, number]; a0?: number; sweep?: number; r?: number; w?: number; dur?: number; col?: RGB3; power?: number; delay?: number }): void;
  spike(x: number, y: number, o?: { h?: number; r?: number; dur?: number; tilt?: number; dir?: number; delay?: number; n?: number; col?: RGB3 }): void;
  gate(x: number, y: number, o?: { r?: number; dur?: number; dir?: number; z?: number; col?: RGB3; delay?: number }): void;
  tendril(x: number, y: number, z: number, x2: number, y2: number, z2: number, o?: { w?: number; dur?: number; n?: number; wave?: number; col?: RGB3; delay?: number }): void;
  soul(x: number, y: number, z: number, o?: { r?: number; dur?: number; n?: number; col?: RGB3; delay?: number }): void;
  wing(key: string, x: number, y: number, z: number, ang: number, k?: number, span?: number): void;
  /** r19：魔光柱——紫黑的烟柱（普通混合，压暗）、血红的边（菲涅尔），柱身里紫电往上窜；col 是边的颜色 */
  pillar(x: number, y: number, o?: { h?: number; r?: number; dur?: number; col?: RGB3; delay?: number }): void;
  /** 魔修特效有没有要画的 */
  readonly ywsBusy: boolean;
}
function ywsPush(S: Fx3dState, e: Partial<YwsFxEv> & Pick<YwsFxEv, 'k' | 'x' | 'y'>) {
  const q = (S.yq ??= []);
  q.push({ z: 0, nx: 0, ny: 0, nz: 1, x2: 0, y2: 0, z2: 0, e1: [0, 0, 0], a0: 0, sweep: Math.PI, r: 100, w: 40, h: 300, dur: 0.5, delay: 0, p: 1, n: 1, dir: 0, tilt: 0, wave: 1, col: null, ...e });
  S.stats.ev++;
  if (q.length > FX3D.queueMax) { q.shift(); S.stats.dropped++; }
}
Object.defineProperty(Fx3dState.prototype, 'ywsBusy', { get(this: Fx3dState) { return (this.yq?.length ?? 0) > 0 || (this.ywings?.size ?? 0) > 0; } });
Fx3dState.prototype.scythe = function (this: Fx3dState, x, y, z, o = {}) {
  const nx = o.nx ?? 0, ny = o.ny ?? 0, nz = o.nz ?? 1, L = Math.hypot(nx, ny, nz) || 1;
  ywsPush(this, { k: 'scythe', x, y, z, nx: nx / L, ny: ny / L, nz: nz / L, e1: o.e1 ?? [0, 0, 0], a0: o.a0 ?? 0, sweep: o.sweep ?? Math.PI, r: o.r ?? 180, w: o.w ?? 60, dur: o.dur ?? 0.42, col: o.col ?? null, p: o.power ?? 1, delay: o.delay ?? 0 });
};
Fx3dState.prototype.spike = function (this: Fx3dState, x, y, o = {}) {
  ywsPush(this, { k: 'spike', x, y, h: o.h ?? 320, r: o.r ?? 46, dur: o.dur ?? 1.6, tilt: o.tilt ?? 0, dir: o.dir ?? 0, delay: o.delay ?? 0, n: o.n ?? 1, col: o.col ?? null });
};
Fx3dState.prototype.gate = function (this: Fx3dState, x, y, o = {}) {
  ywsPush(this, { k: 'gate', x, y, z: o.z ?? 0, r: o.r ?? 160, dur: o.dur ?? 1.6, dir: o.dir ?? 0, col: o.col ?? null, delay: o.delay ?? 0 });
};
Fx3dState.prototype.tendril = function (this: Fx3dState, x, y, z, x2, y2, z2, o = {}) {
  ywsPush(this, { k: 'tendril', x, y, z, x2, y2, z2, w: o.w ?? 30, dur: o.dur ?? 0.8, n: o.n ?? 14, wave: o.wave ?? 1, col: o.col ?? null, delay: o.delay ?? 0 });
};
Fx3dState.prototype.soul = function (this: Fx3dState, x, y, z, o = {}) {
  ywsPush(this, { k: 'soul', x, y, z, r: o.r ?? 420, dur: o.dur ?? 0.9, n: o.n ?? 24, col: o.col ?? null, delay: o.delay ?? 0 });
};
Fx3dState.prototype.pillar = function (this: Fx3dState, x, y, o = {}) {
  ywsPush(this, { k: 'pillar', x, y, h: o.h ?? 3000, r: o.r ?? 110, dur: o.dur ?? 0.6, col: o.col ?? null, delay: o.delay ?? 0 });
};
Fx3dState.prototype.wing = function (this: Fx3dState, key, x, y, z, ang, k = 1, span = 520) {
  const m = (this.ywings ??= new Map());
  let w = m.get(key);
  if (!w) { w = { key, x, y, z, ang, k, span, seen: this.now }; m.set(key, w); }
  w.x = x; w.y = y; w.z = z; w.ang = ang; w.k = k; w.span = span; w.seen = this.now;
};
/** 魔翼不报了就收（画面那边每帧调；世界这边的 tick 不动它——只增不改） */
export function ywsWingSweep(S: Fx3dState) { const m = S.ywings; if (!m) return; for (const [k, w] of m) if (S.now - w.seen > 0.5) m.delete(k); }
