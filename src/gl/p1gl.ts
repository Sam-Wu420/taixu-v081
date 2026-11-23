// 撼山客第一阶段（照参考视频还原）的光效画面：world/p1fx.ts 和 world/hsmovesp1.ts 发的 p1* 事件。
// 照用户的话（「特效一定要炫酷好看，不需要参考我们现在游戏的画风弄得那么扁平化」）放开做：高亮发光、粒子、拖尾；
// 但守着「别留一屏雾」：光都短命，尘和烟用普通混合、半秒到一秒就散。抖动用自己的小随机序列（不碰 Math.random）。
//   p1star   命中：白色四芒星闪 + 爆闪碎芒 + 朝打击方向射出的冲击线（3–6 条）+ 火星（轻 / 重 / 终结三档）
//   p1arc    挥击弧光：拳脚划过的一段蓝白（扫腿橙、勾拳红）弧带，一两帧
//   p1slide  被打者往后滑：脚下拖一道土、往后喷的尘
//   p1dust   冲刺起步：脚下炸一团棕黄色尘土（往后喷）
//   p1band   速度带：一条青蓝色的光带连到落点（带白芯、往后飞的光丝）
//   p1spikes 地面一道往后的黄色冲击刺
//   p1land   到位那一下的小冲击
//   p1boom   四层爆炸（平面版；r9 起 p1fx.boom 改走三维模块，这里留给旧事件）
//   p1elec   蓝白电光冲击（命中后跟着炸开的一团电弧）
//   p1ring   竖着的冲击环（平面版；r9 起 p1fx.shock 改走三维模块的冲击环 + 扭曲冲击波）
//   p1sphere 一大团蓝白光球（闪电之舞、瞬影的终结）
//   p1diamond 竖着的一道菱形亮光（瞬影）
//   p1flare  头顶一团白光（霸体）
//   p1charge 脚下蓄劲：暗色放射线 → 白光团 → 一圈环（断脉腿）
//   p1xslash 红色的 X 形斩光（冲膝）
//   p1beam   侧踢时从脚往前喷的一道粗青蓝光柱（像冲击波）
import type { Combat } from '../world/combat';
import type { FxEvent } from './combatgl';
import { FxSys, col, mixc, smokeCell, extOK, type RGB } from './fx';
import { C } from './atlas';

const TAU = Math.PI * 2;
const WHITE: RGB = [1, 1, 1];
const ICE: RGB = [0.72, 0.9, 1];
const CYAN: RGB = [0.3, 0.88, 1];
const FIRE: RGB = [1, 0.62, 0.18];
const EMBER: RGB = [0.75, 0.16, 0.06];
const DUST: RGB = [0.72, 0.6, 0.4];
const SMOKE: RGB = [0.3, 0.26, 0.22];
let seed = 0x5a17c3e1;
const rr = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const rnd = (a: number, b: number) => a + rr() * (b - a);

export const P1_EVENTS = new Set<string>(['p1star', 'p1arc', 'p1slide', 'p1dust', 'p1band', 'p1spikes', 'p1land', 'p1boom', 'p1elec', 'p1ring', 'p1sphere', 'p1diamond', 'p1flare', 'p1charge', 'p1xslash', 'p1beam']);

type V3 = { x: number; y: number; z: number };
/** 活着的场景件（每帧按时间重画）：弧光、速度带、竖环、菱光、X 斩、光柱 */
interface Live { k: 'arc' | 'band' | 'ring' | 'diamond' | 'xslash' | 'beam' | 'spikes'; t: number; dur: number; pts: V3[]; c: RGB; p: number; dir: number }
const live: Live[] = [];
const push = (q: Live) => { if (live.length >= 24) live.shift(); live.push(q); };
export const p1Pieces = () => live.length;
function flat(F: FxSys, fn: () => void) { const prev = F.B.billboard; F.B.billboard = null; fn(); F.B.billboard = prev; }
const at = (F: FxSys, x: number, y: number, z: number) => { F.B.billboard = { x, y, offsetY: -z }; };

type Ev = FxEvent & { pts?: V3[]; x2?: number; y2?: number };
/**
 * 锯齿星（视频里命中那一下的星闪）：一圈长短交错的尖刺 + 实心的芯，普通混合（亮草地上加色的白会被洗掉）。
 * 先画一圈稍大的描边色（黄 / 橙），再画白的，像漫画里描了边的星
 */
function spikeStar(F: FxSys, x: number, y: number, R: number, n: number, fill: RGB, edge: RGB | null, life: number, rot0 = rr() * TAU) {
  const ang: number[] = [], len: number[] = [];
  for (let i = 0; i < n; i++) { ang.push(rot0 + i / n * TAU + rnd(-0.14, 0.14)); len.push(R * (i % 2 ? rnd(0.5, 0.72) : rnd(0.85, 1.08))); }
  const layer = (k: number, c: RGB, a: number) => {
    for (let i = 0; i < n; i++) { const L = len[i] * k, an = ang[i]; F.emit({ x: x + Math.cos(an) * L * 0.4, y: y + Math.sin(an) * L * 0.4, life, s0: L, s1: L * 1.12, c, a, add: 0, cell: C.Thorn, rot: an + Math.PI / 2 }); }
    F.emit({ x, y, life, s0: R * 0.62 * k, s1: R * 0.75 * k, c, a, add: 0, cell: C.Disc });
  };
  if (edge) layer(1.22, edge, 0.95);
  layer(1, fill, 1);
}
export function p1Event(F: FxSys, ev0: FxEvent) {
  const ev = ev0 as Ev, p = ev.power ?? 1, prev = F.B.billboard;
  switch (ev.k as string) {
    case 'p1star': {
      // 命中：billboard 已按 anchor 设在命中点的高度（事件坐标就是那一点）
      // r9：照视频收小——一块小一些的实心白星（描一圈黄）+ 朝打击方向的冲击线，被打的人仍看得见（原来星闪 + 爆闪碎芒 + 白圈 + 放射光把人整个洗白）。
      // 星闪偏到打击方向那一侧，压在接触点上，不盖住两个人的身子
      const d = ev.dir ?? 0, sd = F.B.direction(Math.cos(d), Math.sin(d)), cc = col(ev.color ?? '200,230,255'), tier = Math.max(1, Math.min(3, p)), x = ev.x + Math.cos(sd) * (22 + 10 * tier), y = ev.y + Math.sin(sd) * (12 + 6 * tier);
      F.light(x, y, 0, 90 + tier * 35, mixc(cc, WHITE, 0.5), 0.6 + tier * 0.3, 0.07);
      // 实心的（普通混合，不是加色）：亮草地上加色的白会被洗掉，视频里的星闪是实打实的一块白、外面描一圈黄
      spikeStar(F, x, y, 16 + tier * 10, 8 + tier * 2, WHITE, [1, 0.8, 0.28], 0.06 + tier * 0.025);
      F.emit({ x, y, life: 0.05, s0: 10 + tier * 4, s1: 16 + tier * 6, c: mixc(cc, WHITE, 0.6), a: 0.6, cell: C.Core });
      if (extOK()) { F.emit({ x, y, life: 0.06 + tier * 0.015, s0: 20 + tier * 9, s1: 32 + tier * 12, c: mixc(cc, WHITE, 0.3), a: 0.28, cell: tier > 1 ? C.KStarBurst : C.KBurst2, rot: rnd(0, TAU) }); }
      // 冲击线：朝打击方向射出去（3–6 条，长、快、短命），身后反方向两条短的
      const n = 2 + tier * 1 + (tier === 3 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const a = sd + rnd(-0.55, 0.55) * (i === 0 ? 0.2 : 1), v = rnd(1700, 2700) * (0.8 + tier * 0.15);
        F.emit({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.09, 0.15), s0: rnd(6, 9) + tier * 2, s1: 2, c: i % 2 ? WHITE : mixc(cc, WHITE, 0.3), a: 1, add: 0.3, stretch: 0.07, drag: 4, cell: C.Streak, rot: a });
      }
      for (let i = 0; i < 2; i++) { const a = sd + Math.PI + rnd(-0.6, 0.6), v = rnd(700, 1100); F.emit({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.08, s0: 5, s1: 1.5, c: WHITE, a: 0.8, stretch: 0.05, drag: 4, cell: C.Streak, rot: a }); }
      F.sparks(x, y, mixc(cc, WHITE, 0.4), 5 + tier * 3, 900 + tier * 250, 0.2, 2.6, sd, 1.4);
      if (tier >= 2) F.shockRing(x, y, 40 + tier * 16, mixc(cc, WHITE, 0.5), 0.1 + tier * 0.02, 0.5, 0.45);
      if (tier >= 3) F.shock(x, y, 220, 14, 0.35);
      break;
    }
    case 'p1arc': {
      const pts = ev.pts ?? []; if (pts.length < 2) break;
      push({ k: 'arc', t: 0, dur: 0.1 + p * 0.02, pts: pts.map((q) => ({ ...q })), c: col(ev.color ?? '170,220,255'), p, dir: 0 });
      break;
    }
    case 'p1slide': {
      const d = ev.dir ?? 0, ux = Math.cos(d), uy = Math.sin(d);
      flat(F, () => {
        F.emit({ x: ev.x + ux * 40, y: ev.y + uy * 40, life: 0.5, s0: 50 + p * 20, s1: 120 + p * 40, c: DUST, a: 0.32, add: 0, cell: C.Wisp, rot: Math.atan2(uy, ux), groundMotion: true });
        for (let i = 0; i < 4 + p * 2; i++) { const v = rnd(250, 600) * (0.7 + p * 0.2), a = d + rnd(-0.5, 0.5); F.emit({ x: ev.x + rnd(-20, 20), y: ev.y + rnd(-10, 10), vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.3, 0.55), s0: rnd(14, 24), s1: rnd(40, 70), c: DUST, a: 0.38, add: 0, drag: 3, cell: smokeCell(), rot: rnd(0, TAU), groundMotion: true }); }
      });
      // 往上蹦的土粒
      at(F, ev.x, ev.y, 0);
      for (let i = 0; i < 5; i++) F.emit({ x: ev.x + rnd(-16, 16), y: ev.y - 4, vx: rnd(-140, 140) - Math.cos(F.B.direction(ux, uy)) * 60, vy: -rnd(200, 420), grav: 1500, life: rnd(0.3, 0.5), s0: rnd(3, 5), s1: 2, c: [0.36, 0.28, 0.18], a: 1, add: 0, cell: C.Shard, rot: rnd(0, TAU), vr: rnd(-10, 10) });
      break;
    }
    case 'p1dust': {
      // 起步：脚下炸一团土，往后喷（几团扬尘 + 往后飞的土粒 + 一道贴地的风）
      const d = ev.dir ?? 0;
      flat(F, () => {
        for (let i = 0; i < 7; i++) { const a = d + rnd(-0.7, 0.7), v = rnd(300, 800); F.emit({ x: ev.x + rnd(-14, 14), y: ev.y + rnd(-8, 8), vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.35, 0.6), s0: rnd(18, 30), s1: rnd(60, 95), c: mixc(DUST, [0.85, 0.72, 0.45], rr() * 0.6), a: 0.45, add: 0, drag: 3.4, cell: smokeCell(), rot: rnd(0, TAU), groundMotion: true }); }
      });
      at(F, ev.x, ev.y, 0);
      F.emit({ x: ev.x, y: ev.y - 10, life: 0.1, s0: 40, s1: 90, c: [1, 0.85, 0.55], a: 0.7, cell: extOK() ? C.KBurst1 : C.Star, rot: rnd(0, TAU) });
      const sd = F.B.direction(Math.cos(d), Math.sin(d));
      for (let i = 0; i < 8; i++) { const a = sd + rnd(-0.5, 0.5); F.emit({ x: ev.x, y: ev.y - 6, vx: Math.cos(a) * rnd(400, 900), vy: Math.sin(a) * rnd(200, 400) - rnd(100, 300), grav: 1400, life: rnd(0.25, 0.45), s0: rnd(3, 5), s1: 2, c: [0.42, 0.33, 0.2], a: 1, add: 0, cell: C.Shard, rot: rnd(0, TAU), vr: rnd(-12, 12) }); }
      break;
    }
    case 'p1band': {
      const z0 = ev.r ?? 0, z1 = ev.power ?? 0;
      push({ k: 'band', t: 0, dur: 0.3, pts: [{ x: ev.x, y: ev.y, z: z0 }, { x: ev.x2 ?? ev.x, y: ev.y2 ?? ev.y, z: z1 }], c: col(ev.color ?? '90,225,255'), p: 1, dir: 0 });
      break;
    }
    case 'p1spikes': {
      push({ k: 'spikes', t: 0, dur: 0.28, pts: [{ x: ev.x, y: ev.y, z: 0 }, { x: ev.x2 ?? ev.x, y: ev.y2 ?? ev.y, z: 0 }], c: [1, 0.86, 0.45], p: 1, dir: 0 });
      break;
    }
    case 'p1land': {
      const z = ev.r ?? 0;
      at(F, ev.x, ev.y, z);
      F.emit({ x: ev.x, y: ev.y - 70, life: 0.07, s0: 40, s1: 70, c: WHITE, a: 0.8, cell: C.Star });
      F.shockRing(ev.x, ev.y - 60, 60, ICE, 0.18, 0.9, 0.6);
      flat(F, () => { F.shockRing(ev.x, ev.y, 110, [1, 0.92, 0.7], 0.25, 0.55, 0.35, true); F.smokeRing(ev.x, ev.y, 80, DUST, 0.25, 0.45); });
      break;
    }
    case 'p1boom': {
      const x = ev.x, y = ev.y, k = p, hasDir = ev.dir !== undefined, sd = hasDir ? F.B.direction(Math.cos(ev.dir!), Math.sin(ev.dir!)) : 0;
      F.light(x, y, 0, 240 * k, [1, 0.6, 0.25], 2.2 * k, 0.18);
      // 第一层：白核（一两帧）
      F.emit({ x, y, life: 0.07, s0: 70 * k, s1: 120 * k, c: WHITE, a: 1, add: 0, cell: C.Disc });
      spikeStar(F, x, y, 110 * k, 14, [1, 0.97, 0.85], [1, 0.62, 0.12], 0.12);
      if (extOK()) F.emit({ x, y, life: 0.16, s0: 140 * k, s1: 300 * k, c: [1, 0.9, 0.6], a: 0.85, cell: C.KStarBurst, rot: rnd(0, TAU) });
      // 第二层：橙黄火焰往外往上喷，带几根朝外的光刺
      for (let i = 0; i < 16 * k; i++) {
        const a = hasDir && i % 2 ? sd + rnd(-0.6, 0.6) : rnd(0, TAU), v = rnd(260, 700) * k;
        F.emit({ x: x + rnd(-14, 14), y: y + rnd(-14, 14), vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - rnd(80, 260), life: rnd(0.22, 0.45), s0: rnd(36, 60) * k, s1: rnd(14, 26) * k, c: mixc([1, 0.42, 0.06], [1, 0.85, 0.3], rr() * 0.6), a: 0.95, add: i % 3 === 0 ? 0.6 : 0, drag: 3, grav: -260, cell: extOK() ? (i % 3 === 0 ? C.KFire2 : C.KFire1) : C.Flame, rot: rnd(-0.3, 0.3) });
      }
      for (let i = 0; i < 7; i++) { const a = (hasDir && i < 4 ? sd + (i - 1.5) * 0.25 : rnd(0, TAU)), v = rnd(2200, 3200); F.emit({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.12, 0.2), s0: rnd(10, 16) * k, s1: 3, c: [1, 0.9, 0.55], a: 1, stretch: 0.08, drag: 3, cell: C.Streak, rot: a }); }
      if (extOK()) F.emit({ x, y, life: 0.25, s0: 160 * k, s1: 300 * k, c: [1, 0.7, 0.3], a: 0.55, cell: C.KRays1, rot: rnd(0, TAU) });
      F.shockRing(x, y, 160 * k, [1, 0.85, 0.55], 0.28, 0.9, 0.8);
      F.shock(x, y, 420 * k, 22, 0.45);
      // 第三层：暗红余烬火星（飘 0.5–1 秒）
      for (let i = 0; i < 22 * k; i++) { const a = rnd(0, TAU), v = rnd(120, 520); F.emit({ x: x + rnd(-30, 30), y: y + rnd(-30, 30), vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - rnd(60, 220), life: rnd(0.5, 1.0), s0: rnd(2.5, 4.5), s1: 1, c: rr() < 0.5 ? EMBER : [1, 0.45, 0.12], a: 1, drag: 1.6, grav: -40, cell: C.Glow }); }
      // 第四层：灰褐烟尘（最后散，一秒上下；普通混合、不留雾）
      for (let i = 0; i < 6 * k; i++) { const a = rnd(0, TAU), v = rnd(80, 260); F.emit({ x: x + rnd(-40, 40), y: y + rnd(-20, 30), vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - rnd(40, 120), life: rnd(0.7, 1.1), s0: rnd(40, 60) * k, s1: rnd(110, 150) * k, c: SMOKE, a: 0.32, add: 0, drag: 2, cell: smokeCell(), rot: rnd(0, TAU) }); }
      // 碎石
      for (let i = 0; i < 10 * k; i++) { const a = rnd(0, TAU), v = rnd(300, 800); F.emit({ x, y, vx: Math.cos(a) * v, vy: -rnd(300, 700), grav: 1600, life: rnd(0.5, 0.9), s0: rnd(5, 9), s1: 4, c: [0.32, 0.26, 0.2], a: 1, add: 0, cell: C.Shard, rot: rnd(0, TAU), vr: rnd(-12, 12) }); }
      break;
    }
    case 'p1elec': {
      const x = ev.x, y = ev.y, r = ev.r ?? 90, cc = col(ev.color ?? '150,210,255');
      F.emit({ x, y, life: 0.09, s0: r * 0.8, s1: r * 1.4, c: mixc(cc, WHITE, 0.5), a: 0.9, cell: C.Core });
      for (let i = 0; i < 7; i++) { const a = rnd(0, TAU), L = r * rnd(0.8, 1.4); F.bolt(x, y, x + Math.cos(a) * L, y + Math.sin(a) * L, (seed = (seed + 7919) >>> 0), 9, 2.4, cc, 0.95, 6, i % 2 === 0); }
      if (extOK()) for (let i = 0; i < 3; i++) F.emit({ x: x + rnd(-r, r) * 0.4, y: y + rnd(-r, r) * 0.4, life: rnd(0.08, 0.14), s0: r * 0.9, s1: r * 1.3, c: mixc(cc, WHITE, 0.4), a: 0.9, cell: i % 2 ? C.KSpark1 : C.KSpark2, rot: rnd(0, TAU) });
      F.sparks(x, y, mixc(cc, WHITE, 0.5), 14, 900, 0.24, 2.4);
      break;
    }
    case 'p1ring': {
      const d = ev.dir ?? 0, z = ev.r ?? 90;
      push({ k: 'ring', t: 0, dur: 0.34 + p * 0.06, pts: [{ x: ev.x, y: ev.y, z }], c: col(ev.color ?? '140,200,255'), p, dir: d });
      break;
    }
    case 'p1sphere': {
      const x = ev.x, y = ev.y, r = (ev.r ?? 120) * p, cc = col(ev.color ?? '150,215,255');
      F.light(x, y, 0, r * 2, cc, 2.2, 0.16);
      F.emit({ x, y, life: 0.06, s0: r * 0.55, s1: r * 0.8, c: WHITE, a: 0.85, add: 0, cell: C.Disc });   // r9：白芯收小、半透（不把被打的人整个盖成一块白）
      F.emit({ x, y, life: 0.14, s0: r * 0.8, s1: r * 1.3, c: mixc(cc, WHITE, 0.4), a: 0.32, add: 0, cell: C.Disc });
      F.emit({ x, y, life: 0.2, s0: r * 1.2, s1: r * 2.0, c: mixc(cc, [0.1, 0.3, 0.9], 0.4), a: 1, add: 0, cell: C.Ring });
      if (extOK()) F.emit({ x, y, life: 0.2, s0: r * 1.3, s1: r * 2.0, c: mixc(cc, WHITE, 0.3), a: 0.5, cell: C.KBubble, rot: rnd(0, TAU) });
      for (let i = 0; i < 10; i++) { const a = rnd(0, TAU), v = rnd(1500, 2600); F.emit({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.1, 0.18), s0: rnd(8, 12), s1: 2, c: i % 3 ? WHITE : [1, 0.4, 0.4], a: 1, stretch: 0.07, drag: 4, cell: C.Streak, rot: a }); }
      F.shock(x, y, r * 3, 18, 0.4);
      break;
    }
    case 'p1diamond': {
      push({ k: 'diamond', t: 0, dur: 0.26, pts: [{ x: ev.x, y: ev.y, z: ev.r ?? 90 }], c: col(ev.color ?? '170,220,255'), p, dir: 0 });
      break;
    }
    case 'p1flare': {
      const x = ev.x, y = ev.y, cc = col(ev.color ?? '255,240,200');
      F.emit({ x, y, life: 0.16, s0: 60, s1: 130, c: WHITE, a: 1, cell: C.Star, rot: rnd(-0.2, 0.2) });
      F.emit({ x, y, life: 0.24, s0: 70, s1: 150, c: mixc(cc, WHITE, 0.5), a: 0.8, cell: C.Core });
      F.glint(x, y, 70, mixc(cc, WHITE, 0.5), 0.95, 0.3);
      if (extOK()) F.emit({ x, y, life: 0.3, s0: 90, s1: 220, c: cc, a: 0.6, cell: C.KRays3, rot: rnd(0, TAU) });
      F.light(x, y, 0, 220, cc, 2, 0.2);
      break;
    }
    case 'p1charge': {
      const x = ev.x, y = ev.y, kind = ev.kind ?? 'lines';
      if (kind === 'lines') {
        // 暗色的放射线往里收（脚下蓄劲）
        for (let i = 0; i < 14; i++) { const a = rnd(0, TAU), r0 = rnd(60, 110); F.emit({ x: x + Math.cos(a) * r0, y: y + Math.sin(a) * r0, vx: -Math.cos(a) * r0 * 8, vy: -Math.sin(a) * r0 * 8, life: 0.1, s0: 6, s1: 2, c: [0.55, 0.75, 1], a: 0.9, stretch: 0.06, cell: C.Streak, rot: a }); }
        F.emit({ x, y, life: 0.08, s0: 40, s1: 60, c: [0.6, 0.8, 1], a: 0.6, cell: C.Star, rot: rnd(0, TAU) });
      } else if (kind === 'ball') {
        F.emit({ x, y, life: 0.1, s0: 50, s1: 70, c: WHITE, a: 1, cell: C.Core });
        F.emit({ x, y, life: 0.12, s0: 70, s1: 100, c: [0.85, 0.95, 1], a: 0.8, cell: C.Star, rot: rnd(0, TAU) });
        F.light(x, y, 0, 140, ICE, 1.5, 0.1);
      } else {
        F.emit({ x, y, life: 0.16, s0: 50, s1: 90, c: [0.7, 0.9, 1], a: 0.85, cell: C.Ring });
        F.emit({ x, y, life: 0.14, s0: 40, s1: 70, c: [0.5, 0.75, 1], a: 0.4, cell: C.Glow });
      }
      break;
    }
    case 'p1xslash': {
      push({ k: 'xslash', t: 0, dur: 0.2, pts: [{ x: ev.x, y: ev.y, z: ev.r ?? 100 }], c: col(ev.color ?? '255,70,80'), p, dir: ev.dir ?? 0 });
      break;
    }
    case 'p1beam': {
      const d = ev.dir ?? 0, L = (ev.power ?? 1) * 420, z = ev.r ?? 80;
      push({ k: 'beam', t: 0, dur: 0.24, pts: [{ x: ev.x, y: ev.y, z }, { x: ev.x + Math.cos(d) * L, y: ev.y + Math.sin(d) * L, z }], c: col(ev.color ?? '90,225,255'), p: 1, dir: d });
      break;
    }
  }
  F.B.billboard = prev;
}

/** 每帧：弧光、速度带、竖环、菱光、X 斩、光柱、冲击刺（drawCombatGL 里调） */
export function drawP1GL(F: FxSys, _c: Combat, _t: number, dt: number) {
  if (!live.length) return;
  const prev = F.B.billboard; F.B.billboard = null;
  for (let i = live.length - 1; i >= 0; i--) {
    const q = live[i]; q.t += dt;
    if (q.t >= q.dur) { live.splice(i, 1); continue; }
    const u = q.t / q.dur, k = Math.pow(1 - u, 1.4);
    switch (q.k) {
      case 'arc': {
        // 挥击弧光：沿拳脚划过的几个点，外晕 + 亮芯，从尾到头越来越亮
        const P = q.pts, n = P.length;
        for (let j = 0; j < n - 1; j++) {
          const a = P[j], b = P[j + 1], w = (j + 1) / (n - 1);
          F.lineSprite(C.Glow, a.x, a.y, -a.z, b.x, b.y, -b.z, 1.15, 46 + q.p * 14, q.c, 0.4 * k * w);
          F.beam(a.x, a.y, b.x, b.y, 14 + q.p * 5, q.c, 0.9 * k * w, C.Beam, 0, [-a.z, -b.z]);
          F.beam(a.x, a.y, b.x, b.y, 6 + q.p * 2, WHITE, 0.95 * k * w, C.Beam, 0, [-a.z, -b.z]);
        }
        break;
      }
      case 'band': {
        // 速度带：外晕青蓝、白芯，随时间从起点往落点收（尾巴先淡）
        const a = q.pts[0], b = q.pts[1], s = Math.min(1, u * 1.4), ax = a.x + (b.x - a.x) * s, ay = a.y + (b.y - a.y) * s, az = a.z + (b.z - a.z) * s;
        const h = 70;
        // r9：收细一半多（推近到人占三成多以后，原来那条速度带有半个人高、几条交叉着把整个画面盖成青色）
        F.lineSprite(C.Glow, ax, ay, -(az + h), b.x, b.y, -(b.z + h), 1.05, 38, q.c, 0.26 * k);
        F.beam(ax, ay, b.x, b.y, 16, q.c, 0.7 * k, C.Beam, 0, [-(az + h), -(b.z + h)]);
        F.beam(ax, ay, b.x, b.y, 5, WHITE, 0.9 * k, C.Beam, 0, [-(az + h), -(b.z + h)]);
        if (rr() < dt * 80) { const v = rr(); const x = ax + (b.x - ax) * v, y = ay + (b.y - ay) * v, z = az + (b.z - az) * v + h + rnd(-40, 40); const d = Math.atan2(a.y - b.y, a.x - b.x); F.B.billboard = { x, y, offsetY: -z }; const sd = F.B.direction(Math.cos(d), Math.sin(d)); F.emit({ x, y, vx: Math.cos(sd) * rnd(900, 1500), vy: Math.sin(sd) * rnd(300, 600), life: 0.12, s0: 5, s1: 1.5, c: mixc(q.c, WHITE, 0.5), a: 0.9, stretch: 0.06, cell: C.Streak }); F.B.billboard = null; }
        break;
      }
      case 'spikes': {
        // 一排往后倒的黄色冲击刺：从落点往起点方向，近的高、远的矮
        const a = q.pts[0], b = q.pts[1], L = Math.hypot(b.x - a.x, b.y - a.y) || 1, n = Math.min(7, Math.max(3, Math.round(L / 70)));
        const grow = Math.min(1, u * 6);
        for (let j = 0; j < n; j++) {
          const s = 0.08 + j / n * 0.6, x = a.x + (b.x - a.x) * s, y = a.y + (b.y - a.y) * s, h = (115 - j * 11) * grow * (0.75 + 0.25 * ((j * 7) % 3) / 2);
          F.lineSprite(C.Thorn, x, y, 0, x + (b.x - a.x) / L * 46, y + (b.y - a.y) / L * 46, -h, 1, 38, q.c, 0.95 * k);
        }
        break;
      }
      case 'ring': {
        // 竖着的冲击环：垂直于打击方向的一圈。侧面看是竖椭圆（宽 = 半径 × |打击方向在画面纵深里的分量|，至少两成）
        const c0 = q.pts[0]; F.B.billboard = { x: c0.x, y: c0.y, offsetY: -c0.z };
        const sd = F.B.direction(Math.cos(q.dir), Math.sin(q.dir));
        F.B.billboard = { x: c0.x, y: c0.y, offsetY: -c0.z };
        const r = (90 + 260 * Math.pow(u, 0.6)) * (0.8 + q.p * 0.2), w = r * Math.max(0.22, Math.abs(Math.sin(sd)) * 0.9 + 0.12);
        F.B.quad(C.Ring, c0.x + Math.cos(sd) * 60 * u, c0.y, w * 2, r * 2, 0, q.c[0], q.c[1], q.c[2], 0.95 * k, 0);
        F.B.quad(C.RingSoft, c0.x + Math.cos(sd) * 40 * u, c0.y, w * 2.2, r * 2.2, 0, 1, 1, 1, 0.45 * k, 1);
        F.B.billboard = null;
        break;
      }
      case 'diamond': {
        const c0 = q.pts[0]; F.B.billboard = { x: c0.x, y: c0.y, offsetY: -c0.z };
        const sx = 1 - Math.pow(u, 2);
        F.B.quad(C.Shard, c0.x, c0.y, 90 * sx, 380 * (0.6 + u * 0.5), 0, q.c[0], q.c[1], q.c[2], 0.9 * k, 0);
        F.B.quad(C.Shard, c0.x, c0.y, 34 * sx, 300 * (0.6 + u * 0.5), 0, 1, 1, 1, k, 0);
        F.B.billboard = null;
        break;
      }
      case 'xslash': {
        const c0 = q.pts[0]; F.B.billboard = { x: c0.x, y: c0.y, offsetY: -c0.z };
        const g = Math.min(1, u * 5);
        // 两道直的斩光交成 X（视频里是两条笔直的红光，白芯）
        for (const s of [1, -1]) {
          F.B.quad(C.Beam, c0.x, c0.y, 230 * g, 30, s * 0.62, q.c[0], q.c[1], q.c[2], 0.95 * k, 0);   // r9：收小（推近后两道斩光横过大半个画面）
          F.B.quad(C.Beam, c0.x, c0.y, 215 * g, 9, s * 0.62, 1, 1, 1, 0.95 * k, 0);
        }
        F.B.billboard = null;
        break;
      }
      case 'beam': {
        // 侧踢的光柱：从脚往前喷，头冲得快、尾先淡
        const a = q.pts[0], b = q.pts[1], s = Math.min(1, u * 4), hx = a.x + (b.x - a.x) * s, hy = a.y + (b.y - a.y) * s;
        F.lineSprite(C.Glow, a.x, a.y, -a.z, hx, hy, -a.z, 1.1, 70, q.c, 0.4 * k);   // r9：收细（推近后原来半个画面高）
        F.beam(a.x, a.y, hx, hy, 32, q.c, 0.8 * k, C.Beam, 0, [-a.z, -a.z]);
        F.beam(a.x, a.y, hx, hy, 10, WHITE, k, C.Beam, 0, [-a.z, -a.z]);
        break;
      }
    }
  }
  F.B.billboard = prev;
}
