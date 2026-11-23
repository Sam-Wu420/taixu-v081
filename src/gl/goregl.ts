// 打击感的画面（逻辑在 world/gore.ts）：溅血、血雾、暴击斩痕、炸开、地上的血迹。写实鲜红；虫类绿色体液；鬼物黑烟磷火。
// 全用粒子池和地面印花，正常混合（不叠加发白），只有磷火、斩痕的高光用叠加。
import type { FxSys, RGB } from './fx';
import { mixc, smokeCell } from './fx';
import { C } from './atlas';
import type { FxEvent } from './combatgl';
import type { Combat } from '../world/combat';
import type { Fluid } from '../world/gore';

const TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** 各种体液：喷出来的亮色、干了的暗色、雾 */
const PAL: Record<Fluid, { hi: RGB; lo: RGB; mist: RGB }> = {
  blood: { hi: [0.86, 0.03, 0.05], lo: [0.4, 0.0, 0.02], mist: [0.66, 0.05, 0.07] },
  ichor: { hi: [0.52, 0.82, 0.14], lo: [0.2, 0.36, 0.05], mist: [0.42, 0.62, 0.16] },
  ghost: { hi: [0.45, 1.0, 0.68], lo: [0.1, 0.07, 0.14], mist: [0.14, 0.1, 0.2] },
};

/** 一次溅血：顺着 dir 喷出血点和几道血线，留一团血雾；暴击多一道斩痕 */
export function bloodFx(F: FxSys, ev: FxEvent) {
  const fluid = (ev.kind as Fluid) ?? 'blood', P = PAL[fluid] ?? PAL.blood, power = Math.min(5, ev.power ?? 1);
  const dir = ev.dir ?? Math.random() * TAU, cx = Math.cos(dir), cy = Math.sin(dir) * 0.55;
  const big = !!ev.big;
  if (fluid === 'ghost') {
    // 鬼物：没有血，一团黑烟裹着几点磷火
    for (let i = 0; i < 3 + power * 2; i++) F.emit({ x: ev.x + rnd(-10, 10), y: ev.y + rnd(-10, 10), vx: cx * rnd(30, 140) + rnd(-30, 30), vy: cy * rnd(30, 140) - rnd(20, 60), life: rnd(0.5, 0.9), s0: rnd(14, 24), s1: rnd(50, 80), c: P.lo, a: 0.45, add: 0, cell: smokeCell(), rot: Math.random() * TAU, drag: 2 });
    for (let i = 0; i < 4 + power * 3; i++) F.emit({ x: ev.x, y: ev.y, vx: cx * rnd(80, 260) + rnd(-60, 60), vy: cy * rnd(80, 260) - rnd(40, 120), life: rnd(0.4, 0.8), s0: rnd(4, 8), s1: 1, c: P.hi, a: 0.9, add: 1, cell: C.Glow, drag: 2.5, grav: -40 });
    return;
  }
  // 血点：沿攻击方向的扇面，带重力往下落
  const n = Math.min(46, Math.round(6 + power * 9 * (big ? 1.4 : 1)));
  for (let i = 0; i < n; i++) {
    const a = dir + rnd(-0.55, 0.55) * (big ? 2.2 : 1), v = rnd(120, 420 + power * 90);
    F.emit({ x: ev.x + rnd(-6, 6), y: ev.y + rnd(-6, 6), vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.55 - rnd(60, 220), life: rnd(0.32, 0.7), s0: rnd(10, 18) * (ev.crit ? 1.3 : 1), s1: rnd(5, 8), c: mixc(P.hi, P.lo, Math.random() * 0.5), a: 1, add: 0, cell: C.Ink, rot: Math.random() * TAU, grav: 1300, drag: 1.1 });
  }
  // 几颗大血珠：慢一点、重一点，看得清
  for (let i = 0; i < Math.min(6, 1 + Math.round(power * 1.2)); i++) {
    const a = dir + rnd(-0.6, 0.6), v = rnd(140, 340);
    F.emit({ x: ev.x, y: ev.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.55 - rnd(160, 300), life: rnd(0.45, 0.75), s0: rnd(20, 30) * (ev.crit ? 1.2 : 1), s1: rnd(10, 14), c: mixc(P.hi, P.lo, 0.25), a: 1, add: 0, cell: C.Ink, rot: Math.random() * TAU, vr: rnd(-4, 4), grav: 1500, drag: 0.6 });
  }
  // 几道拉长的血线：快、短
  for (let i = 0; i < Math.min(8, 2 + Math.round(power * 1.5)); i++) {
    const a = dir + rnd(-0.35, 0.35), v = rnd(520, 900);
    F.emit({ x: ev.x, y: ev.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.55 - rnd(40, 140), life: rnd(0.14, 0.26), s0: rnd(10, 14), s1: 4, c: P.hi, a: 1, add: 0, cell: C.Ink, grav: 900, drag: 2, stretch: 0.05 });
  }
  // 血雾：一两团淡红的雾，半息左右散掉
  for (let i = 0; i < Math.min(5, 1 + Math.round(power)); i++) F.emit({ x: ev.x + cx * rnd(10, 40), y: ev.y + cy * rnd(10, 40), vx: cx * rnd(30, 90), vy: cy * rnd(30, 90) - rnd(10, 30), life: rnd(0.5, 0.95), s0: rnd(26, 38), s1: rnd(70, 100) + power * 20, c: P.mist, a: 0.5, add: 0, cell: smokeCell(), rot: Math.random() * TAU, drag: 2.2 });
  // 暴击：一道斩痕划过、一点白红的闪
  if (ev.crit) {
    const sa = dir + Math.PI / 2 + rnd(-0.4, 0.4);
    F.emit({ x: ev.x, y: ev.y, vx: Math.cos(sa) * 2600, vy: Math.sin(sa) * 1400, life: 0.08, s0: 9, s1: 4, c: [1, 0.92, 0.85], a: 1, add: 1, cell: C.Glow, stretch: 0.06 });
    F.emit({ x: ev.x, y: ev.y, vx: -Math.cos(sa) * 2600, vy: -Math.sin(sa) * 1400, life: 0.08, s0: 9, s1: 4, c: [1, 0.92, 0.85], a: 1, add: 1, cell: C.Glow, stretch: 0.06 });
    F.flash(ev.x, ev.y, 46, [1, 0.35, 0.3], 0.12);
  }
}

/** 炸开：一团血花、血雾、四面迸射的血点和血块、一圈淡红气浪（掉妖丹的光由原有的妖丹特效画，真掉了才有） */
export function goreFx(F: FxSys, ev: FxEvent) {
  const fluid = (ev.kind as Fluid) ?? 'blood', P = PAL[fluid] ?? PAL.blood, power = Math.min(6, ev.power ?? 2);
  const dir = ev.dir ?? 0;
  // 不用白闪（会把血色冲淡、盖住画面）：一团实心的血花在中间一爆、一圈淡红的气浪
  if (fluid === 'ghost') F.flash(ev.x, ev.y, 50 + power * 10, [0.5, 0.9, 0.7], 0.14);
  else for (let i = 0; i < 3; i++) F.emit({ x: ev.x + rnd(-10, 10), y: ev.y + rnd(-10, 10), life: rnd(0.22, 0.32), s0: 40 + power * 8, s1: 110 + power * 18, c: mixc(P.hi, P.lo, 0.2 + i * 0.25), a: 0.9, add: 0, cell: C.Ink, rot: Math.random() * TAU });
  F.shockRing(ev.x, ev.y + 30, 110 + power * 30, fluid === 'ghost' ? P.hi : [0.7, 0.06, 0.06], 0.45, 0.4, 0.32);
  // 雾团
  for (let i = 0; i < 6 + power * 2; i++) { const a = Math.random() * TAU, v = rnd(40, 200); F.emit({ x: ev.x + rnd(-20, 20), y: ev.y + rnd(-20, 20), vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - rnd(10, 60), life: rnd(0.7, 1.3), s0: rnd(24, 40), s1: rnd(90, 150) + power * 12, c: P.mist, a: fluid === 'ghost' ? 0.55 : 0.5, add: 0, cell: smokeCell(), rot: Math.random() * TAU, drag: 1.8 }); }
  if (fluid === 'ghost') { for (let i = 0; i < 26; i++) { const a = Math.random() * TAU, v = rnd(100, 380); F.emit({ x: ev.x, y: ev.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 80, life: rnd(0.6, 1.2), s0: rnd(5, 10), s1: 1, c: P.hi, a: 0.95, add: 1, cell: C.Glow, drag: 1.8, grav: -60 }); } return; }
  // 血点：四面八方，偏向最后一击的方向
  for (let i = 0; i < Math.min(110, 40 + power * 14); i++) {
    const a = Math.random() < 0.55 ? dir + rnd(-0.9, 0.9) : Math.random() * TAU, v = rnd(160, 760);
    F.emit({ x: ev.x + rnd(-14, 14), y: ev.y + rnd(-20, 20), vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - rnd(120, 420), life: rnd(0.45, 1.0), s0: rnd(10, 20), s1: rnd(5, 8), c: mixc(P.hi, P.lo, Math.random() * 0.6), a: 1, add: 0, cell: C.Ink, rot: Math.random() * TAU, grav: 1500, drag: 0.8 });
  }
  // 血块：大一些、慢一些
  for (let i = 0; i < 6 + power; i++) { const a = Math.random() * TAU, v = rnd(120, 420); F.emit({ x: ev.x, y: ev.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - rnd(200, 500), life: rnd(0.6, 1.0), s0: rnd(16, 26), s1: rnd(10, 14), c: P.lo, a: 0.95, add: 0, cell: C.Ink, rot: Math.random() * TAU, vr: rnd(-8, 8), grav: 1500, drag: 0.5 }); }
}

/** 地上的血迹：一块主印加几点溅开的小点，最后五息慢慢淡掉 */
export function drawStains(F: FxSys, c: Combat) {
  const st = c.gore?.stains; if (!st?.length) return;
  for (const s of st) {
    const k = Math.min(1, s.t / 0.12) * Math.min(1, (s.dur - s.t) / 5); if (k <= 0.01) continue;
    const P = PAL[s.fluid] ?? PAL.blood, fresh = Math.max(0, 1 - s.t / 4);
    const tint = mixc(P.lo, P.hi, 0.35 * fresh);   // 刚溅上去更鲜，慢慢发暗
    F.ground(C.Ink, s.x, s.y, s.r, s.rot, tint, 0.82 * k, 0, 0.5);
    F.ground(C.Ink, s.x, s.y, s.r * 0.6, s.rot + 1.3, P.lo, 0.5 * k, 0, 0.5);
    for (const d of s.drops) F.ground(C.Glow, s.x + d[0], s.y + d[1], d[2], 0, tint, 0.85 * k, 0, 0.5);
  }
}
