// 通用打击表现的画面（world/impactfx.ts 发的事件 + 持续的状态）。r7 撼山客招式第一批起，以后几批和玩家学的招都用。
//   · hsblast  背后炸开的冲击波：对手背后一记爆闪、顺着锥形喷出去的气流丝、贴地往外推的几道弧形气浪、扬尘、碎石（和 wreck.cone 的倒树碎石一起）；
//   · hspress  拳压：一道压缩的白色气浪沿直线推过去（3000/秒，和倒树的先后对得上），身后贴地拖一道淡淡的风痕、两侧卷起的草屑尘土；
//   · hsblink  超高速追击：起点一团墨影散开（人没了），一道细亮的线连到落点，落点一圈气爆——没有中间帧；
//   · hsring   踏空气环：空中脚下炸开的一圈扁平气环（两层）和往下散的气丝；
//   · hsqihe   气合：一声大喝，三圈往外推的声浪、空间扭一下、贴地一圈尘；
//   · hsgold   金刚不坏的反震：一圈金色罡气炸开（贴地两层环、金芒）；
//   · hspinch / hsshatter / hsclamp：一把捏灭火球（火星往里一收、一缕烟）、法术和飞剑被震碎（碎片）、两指夹住飞剑（指尖一点亮）；
//   · hsstomp  震脚：落脚处一圈龟裂的亮缝、两层贴地冲击环、往上蹦的碎石和一圈尘。
// 持续的：金刚不坏期间身上的金色罡气（淡）、夹在指间的飞剑。
// 守着用户的话：光都短命、偏小，尘用普通混合、散得快，不留一屏雾（「别糊画面」）。抖动用自己的小随机序列（不碰 Math.random）。
import type { Combat } from '../world/combat';
import type { FxEvent } from './combatgl';
import { FxSys, col, mixc, smokeCell, extOK, type RGB } from './fx';
import { C } from './atlas';

const TAU = Math.PI * 2;
const WHITE: RGB = [1, 1, 1];
const PALE: RGB = [0.93, 0.91, 0.85];
const GOLD: RGB = [1, 0.8, 0.38];
const DUST: RGB = [0.32, 0.27, 0.21];
const ROCK: RGB = [0.3, 0.26, 0.22];
let seed = 0x2b7e1516;
const rr = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const rnd = (a: number, b: number) => a + rr() * (b - a);

/** 通用打击表现的事件名（combatgl 按这个转给 impactEvent） */
export const IMPACT_EVENTS = new Set<string>(['hsblast', 'hspress', 'hsblink', 'hsring', 'hsqihe', 'hsgold', 'hspinch', 'hsshatter', 'hsclamp', 'hsstomp']);

/** 贴地画 */
function flat(F: FxSys, fn: () => void) { const prev = F.B.billboard; F.B.billboard = null; fn(); F.B.billboard = prev; }

/** 活着的场景件：拳压的气浪、超高速追击的那道线（每帧按时间重画） */
interface Live { k: 'press' | 'blink'; t: number; dur: number; x0: number; y0: number; x1: number; y1: number; z0: number; z1: number; w: number; p: number; c: RGB }
const live: Live[] = [];
const push = (q: Live) => { if (live.length >= 12) live.shift(); live.push(q); };
export const impactPieces = () => live.length;

export function impactEvent(F: FxSys, ev: FxEvent) {
  const p = ev.power ?? 1;
  switch (ev.k as string) {
    case 'hsblast': {
      const d = ev.dir ?? 0, len = ev.r ?? 760, half = Number(ev.kind ?? 0.42), sd = F.B.direction(Math.cos(d), Math.sin(d));
      const bx = ev.x + Math.cos(d) * 30, by = ev.y - 60;
      // 背后的爆点：白芯一闪、碎芒、空间猛地一扭
      F.flash(bx, by, 22 + p * 5, WHITE, 0.07);
      if (extOK()) F.emit({ x: bx, y: by, life: 0.14, s0: 30, s1: 70 + p * 12, c: WHITE, a: 0.6, cell: C.KBurst2, rot: sd });
      F.shock(bx, by, 200 + p * 70, 12 + p * 3, 0.42);
      // 顺着锥喷出去的气流丝（长、快、散得快）
      const n = Math.round(22 + p * 6);
      for (let i = 0; i < n; i++) {
        const a = d + (i / (n - 1) - 0.5) * 2 * half * rnd(0.7, 1.05), sa = F.B.direction(Math.cos(a), Math.sin(a)), v = rnd(1300, 2500) * (0.8 + p * 0.1);
        F.emit({ x: bx, y: by + rnd(-26, 26), vx: Math.cos(sa) * v, vy: Math.sin(sa) * v * 0.75, life: rnd(0.14, 0.28), s0: rnd(3, 5.5), s1: 1.2, c: i % 4 ? WHITE : GOLD, a: 0.85, drag: 3.2, stretch: 0.055, cell: C.Glow });
      }
      // 两道竖着的弧（拳劲穿出背后的那一层「膜」）
      for (let i = 0; i < 2; i++) F.emit({ x: bx + Math.cos(sd) * (20 + i * 40), y: by + Math.sin(sd) * (20 + i * 40) * 0.6, vx: Math.cos(sd) * (900 + i * 500), vy: Math.sin(sd) * (900 + i * 500) * 0.6, life: 0.2 + i * 0.06, s0: 60 + i * 20, s1: 160 + p * 30, c: i ? PALE : WHITE, a: 0.6 - i * 0.2, drag: 3, cell: C.Slash, rot: sd });
      // 贴地：几道往外推的弧形气浪 + 扬尘（普通混合）+ 一道锥形的地痕
      flat(F, () => {
        for (let i = 0; i < 4; i++) {
          const a = d + (i - 1.5) / 1.5 * half * 0.7, ga = F.B.direction(Math.cos(a), Math.sin(a)), v = rnd(1500, 2100);
          F.emit({ x: ev.x + Math.cos(a) * 60, y: ev.y + Math.sin(a) * 60, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.32, s0: 70, s1: 240 + p * 40, c: PALE, a: 0.45, drag: 2.6, cell: C.Slash, rot: ga, groundMotion: true });
        }
        for (let i = 0; i < 14 + p * 3; i++) {
          const a = d + rnd(-half, half), r0 = rnd(40, len * 0.35), v = rnd(380, 900);
          F.emit({ x: ev.x + Math.cos(a) * r0, y: ev.y + Math.sin(a) * r0, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.45, 0.8), s0: rnd(28, 46), s1: rnd(90, 140), c: DUST, a: 0.3, add: 0, cell: smokeCell(), drag: 2.6, rot: rnd(0, TAU), groundMotion: true });
        }
        F.emit({ x: ev.x + Math.cos(d) * len * 0.35, y: ev.y + Math.sin(d) * len * 0.35, life: 0.5, s0: len * 0.5, s1: len * 0.75, c: PALE, a: 0.18, cell: C.Wisp, rot: sd, groundMotion: true });
      });
      // 碎石：顺着锥飞出去、落下
      for (let i = 0; i < 9 + p * 2; i++) {
        const a = d + rnd(-half, half), sa = F.B.direction(Math.cos(a), Math.sin(a)), v = rnd(500, 1100);
        F.emit({ x: bx, y: ev.y - 20, vx: Math.cos(sa) * v, vy: Math.sin(sa) * v * 0.6 - rnd(250, 520), grav: 1500, life: rnd(0.55, 0.95), s0: rnd(5, 10), s1: 4, c: ROCK, a: 1, add: 0, cell: C.Shard, rot: rnd(0, TAU), vr: rnd(-12, 12) });
      }
      break;
    }
    case 'hspress': {
      const x1 = ev.x2 ?? ev.x, y1 = ev.y2 ?? ev.y, L = Math.hypot(x1 - ev.x, y1 - ev.y) || 1;
      push({ k: 'press', t: 0, dur: L / 3000 + 0.3, x0: ev.x, y0: ev.y, x1, y1, z0: 0, z1: 0, w: ev.r ?? 130, p, c: PALE });
      // 拳口：一圈竖着的气爆
      const d = Math.atan2(y1 - ev.y, x1 - ev.x), sd = F.B.direction(Math.cos(d), Math.sin(d));
      F.B.billboard = { x: ev.x, y: ev.y };
      F.flash(ev.x + Math.cos(sd) * 50, ev.y - 70, 26, WHITE, 0.08);
      F.emit({ x: ev.x + Math.cos(sd) * 40, y: ev.y - 70, vx: Math.cos(sd) * 600, vy: Math.sin(sd) * 400, life: 0.18, s0: 40, s1: 120, c: WHITE, a: 0.6, drag: 3, cell: C.Slash, rot: sd });
      F.B.billboard = null;
      break;
    }
    case 'hsblink': {
      const x1 = ev.x2 ?? ev.x, y1 = ev.y2 ?? ev.y, z0 = ev.r ?? 0, z1 = ev.power ?? 0, cc = col(ev.color ?? '255,226,170');
      push({ k: 'blink', t: 0, dur: 0.32, x0: ev.x, y0: ev.y, x1, y1, z0, z1, w: 1, p: 1, c: cc });
      // 起点：人没了，一团墨影散开
      F.B.billboard = { x: ev.x, y: ev.y, offsetY: -z0 };
      for (let i = 0; i < 6; i++) F.emit({ x: ev.x + rnd(-14, 14), y: ev.y - rnd(20, 110), vx: rnd(-60, 60), vy: rnd(-40, 10), life: rnd(0.25, 0.42), s0: rnd(18, 30), s1: 50, c: [0.1, 0.09, 0.08], a: 0.5, add: 0, cell: C.Ink, rot: rnd(0, TAU) });
      // 落点：一圈气爆
      F.B.billboard = { x: x1, y: y1, offsetY: -z1 };
      F.flash(x1, y1 - 70, 30, mixc(cc, WHITE, 0.6), 0.1);
      F.shockRing(x1, y1 - 60, 70, WHITE, 0.22, 0.9, 0.7);
      F.shock(x1, y1 - 60, 200, 10, 0.32);
      F.B.billboard = null;
      flat(F, () => { F.shockRing(x1, y1, 150, PALE, 0.32, 0.55, 0.35, true); F.smokeRing(x1, y1, 110, DUST, 0.22, 0.5); });
      break;
    }
    case 'hsring': {
      // 空中踩一步：脚下一圈扁平的气环（两层）、往下散的几缕气丝（billboard 已按 anchor 设在那个高度）
      F.shockRing(ev.x, ev.y, 60 + p * 18, WHITE, 0.24, 0.32, 0.9);
      F.shockRing(ev.x, ev.y, 110 + p * 30, PALE, 0.38, 0.3, 0.45);
      F.flash(ev.x, ev.y, 18, WHITE, 0.07);
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; F.emit({ x: ev.x, y: ev.y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 150 + 160, life: 0.26, s0: 3, s1: 1, c: WHITE, a: 0.6, drag: 3, stretch: 0.04, cell: C.Glow }); }
      break;
    }
    case 'hsqihe': {
      const r = ev.r ?? 600;
      F.B.billboard = { x: ev.x, y: ev.y };
      F.flash(ev.x, ev.y - 90, 22, WHITE, 0.07);
      F.shockRing(ev.x, ev.y - 80, 120, WHITE, 0.2, 0.92, 0.32);
      F.shockRing(ev.x, ev.y - 80, 260, PALE, 0.3, 0.92, 0.16);
      F.shock(ev.x, ev.y - 80, r * 1.2, 20, 0.55);
      F.B.billboard = null;
      flat(F, () => {
        F.shockRing(ev.x, ev.y, r * 0.55, PALE, 0.26, 0.55, 0.3, true);
        F.shockRing(ev.x, ev.y, r, PALE, 0.4, 0.55, 0.2, true);
        F.shockRing(ev.x, ev.y, r * 1.3, WHITE, 0.5, 0.55, 0.1, true);
        F.smokeRing(ev.x, ev.y, r * 0.7, DUST, 0.18, 0.5);
      });
      break;
    }
    case 'hsgold': {
      const r = ev.r ?? 420;
      F.B.billboard = { x: ev.x, y: ev.y };
      F.flash(ev.x, ev.y - 75, 34, mixc(GOLD, WHITE, 0.5), 0.1);
      F.rays(ev.x, ev.y - 75, 180, GOLD, 0.45, 0.32);
      F.glint(ev.x, ev.y - 75, 70, mixc(GOLD, WHITE, 0.4), 0.8, 0.22);
      F.shock(ev.x, ev.y - 60, r * 1.1, 16, 0.5);
      F.sparks(ev.x, ev.y - 70, GOLD, 22, 760, 0.4, 3);
      F.B.billboard = null;
      flat(F, () => { F.shockRing(ev.x, ev.y, r * 0.6, mixc(GOLD, WHITE, 0.4), 0.26, 0.55, 0.5, true); F.shockRing(ev.x, ev.y, r, GOLD, 0.45, 0.55, 0.3, true); });
      break;
    }
    case 'hspinch': {
      // 一把捏灭火球：火星往掌心一收，冒一缕烟（billboard 按 anchor）
      const cc = col(ev.color ?? '255,140,60');
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, r0 = rnd(30, 48); F.emit({ x: ev.x + Math.cos(a) * r0, y: ev.y + Math.sin(a) * r0 * 0.8, vx: -Math.cos(a) * r0 * 6, vy: -Math.sin(a) * r0 * 5, life: 0.16, s0: 4, s1: 1, c: cc, a: 0.9, cell: C.Glow }); }
      F.flash(ev.x, ev.y, 22, mixc(cc, WHITE, 0.4), 0.08);
      for (let i = 0; i < 4; i++) F.emit({ x: ev.x + rnd(-6, 6), y: ev.y - 6, vx: rnd(-14, 14), vy: rnd(-70, -40), life: rnd(0.6, 0.9), s0: 10, s1: 34, c: [0.35, 0.33, 0.31], a: 0.35, add: 0, cell: smokeCell(), rot: rnd(0, TAU) });
      break;
    }
    case 'hsshatter': {
      const cc = col(ev.color ?? '220,230,255');
      F.flash(ev.x, ev.y, 26, mixc(cc, WHITE, 0.5), 0.08);
      F.sparks(ev.x, ev.y, mixc(cc, WHITE, 0.4), 12, 520, 0.32, 2.6);
      for (let i = 0; i < 8; i++) { const a = rnd(0, TAU), v = rnd(220, 520); F.emit({ x: ev.x, y: ev.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - 120, grav: 900, life: rnd(0.35, 0.6), s0: rnd(4, 7), s1: 3, c: cc, a: 0.95, cell: C.Shard, rot: rnd(0, TAU), vr: rnd(-14, 14) }); }
      F.shockRing(ev.x, ev.y, 46, WHITE, 0.18, 0.9, 0.6);
      break;
    }
    case 'hsclamp': {
      F.glint(ev.x, ev.y, 30, WHITE, 0.95, 0.26);
      F.flash(ev.x, ev.y, 16, WHITE, 0.07);
      F.sparks(ev.x, ev.y, mixc(col(ev.color ?? '220,230,255'), WHITE, 0.5), 8, 360, 0.22, 2.2);
      break;
    }
    case 'hsstomp': {
      const r = ev.r ?? 420;
      flat(F, () => {
        F.shockRing(ev.x, ev.y, r * 0.55, PALE, 0.22, 0.55, 0.32, true);
        F.shockRing(ev.x, ev.y, r, PALE, 0.4, 0.55, 0.24, true);
        F.ground(C.Crack, ev.x, ev.y, r * 0.55, rnd(0, TAU), [1, 0.78, 0.45], 0.55, 1, 0.5);
        F.smokeRing(ev.x, ev.y, r * 0.75, DUST, 0.22, 0.55);
      });
      F.B.billboard = { x: ev.x, y: ev.y };
      F.flash(ev.x, ev.y - 10, 28, WHITE, 0.08);
      F.shock(ev.x, ev.y - 20, r * 1.2, 18, 0.5);
      for (let i = 0; i < 14; i++) { const a = rnd(0, TAU), r0 = rnd(30, r * 0.6); F.emit({ x: ev.x + Math.cos(a) * r0, y: ev.y + Math.sin(a) * r0 * 0.5, vx: Math.cos(a) * rnd(60, 200), vy: -rnd(380, 760), grav: 1700, life: rnd(0.5, 0.8), s0: rnd(4, 9), s1: 3, c: ROCK, a: 1, add: 0, cell: C.Shard, rot: rnd(0, TAU), vr: rnd(-12, 12) }); }
      F.B.billboard = null;
      break;
    }
  }
}

/** 每帧：拳压的气浪、超高速追击的线、金刚不坏的金色罡气、夹在指间的飞剑（drawCombatGL 里调） */
export function drawImpactGL(F: FxSys, c: Combat, _t: number, dt: number) {
  for (let i = live.length - 1; i >= 0; i--) {
    const q = live[i]; q.t += dt;
    if (q.t >= q.dur) { live.splice(i, 1); continue; }
    if (q.k === 'blink') {
      const k = Math.pow(1 - q.t / q.dur, 1.6), el: [number, number] = [-(q.z0 + 64), -(q.z1 + 64)];
      F.beam(q.x0, q.y0, q.x1, q.y1, 22, q.c, 0.32 * k, C.Glow, 1, el);
      F.beam(q.x0, q.y0, q.x1, q.y1, 5, WHITE, 0.95 * k, C.Beam, 1, el);
      continue;
    }
    // 拳压：气浪的头按 3000/秒往前推，身后贴地拖一道风痕
    const L = Math.hypot(q.x1 - q.x0, q.y1 - q.y0) || 1, ux = (q.x1 - q.x0) / L, uy = (q.y1 - q.y0) / L;
    const s = Math.min(L, q.t * 3000), hx = q.x0 + ux * s, hy = q.y0 + uy * s, done = s >= L;
    const fade = done ? Math.max(0, 1 - (q.t - L / 3000) / 0.3) : 1;
    flat(F, () => {
      F.beam(q.x0 + ux * 40, q.y0 + uy * 40, hx, hy, q.w * 1.1, q.c, 0.14 * fade, C.Glow, 1);
      F.beam(q.x0 + ux * 40, q.y0 + uy * 40, hx, hy, q.w * 0.25, WHITE, 0.22 * fade, C.Beam, 1);
    });
    if (!done) {
      const sd = F.B.direction(ux, uy);
      F.B.billboard = { x: hx, y: hy };
      F.B.quad(C.Slash, hx, hy - 60, q.w * 1.5, 150 + q.p * 20, sd, 1, 1, 1, 0.55, 1);
      F.B.quad(C.Glow, hx, hy - 50, q.w * 1.8, 110, sd, PALE[0], PALE[1], PALE[2], 0.22, 1);
      if (rr() < dt * 70) { const nx = -uy, ny = ux, o = rnd(-q.w, q.w); F.emit({ x: hx + nx * o, y: hy + ny * o - rnd(0, 90), vx: Math.cos(sd) * rnd(1400, 2200), vy: Math.sin(sd) * rnd(800, 1400), life: 0.14, s0: 3, s1: 1, c: WHITE, a: 0.6, stretch: 0.05, drag: 3, cell: C.Glow }); }
      if (rr() < dt * 40) F.emit({ x: hx + rnd(-30, 30), y: hy - rnd(0, 30), vx: Math.cos(sd) * rnd(300, 600) + rnd(-120, 120), vy: -rnd(120, 300), grav: 500, life: rnd(0.4, 0.7), s0: rnd(14, 24), s1: 50, c: DUST, a: 0.28, add: 0, cell: smokeCell(), rot: rnd(0, TAU) });
      F.B.billboard = null;
    }
  }
  const I = c.brawl.impact; if (!I) return;
  const p = c.game.player;
  // 金刚不坏：身上一层金色罡气（淡；贴地一圈细环），收尾前慢慢散
  for (const a of I.auras) {
    const e = a.who, x = e ? e.x : p.x, y = e ? e.y : p.y, z = e ? e.z : p.z;
    const k = Math.min(1, a.t / 0.12) * Math.min(1, (a.dur - a.t) / 0.3), pulse = 0.85 + 0.15 * Math.sin(a.t * 18);
    F.B.billboard = { x, y, offsetY: -z };
    F.glow(x, y - 80, 70, GOLD, 0.09 * k * pulse);   // r9：淡一半、不再垫一圈金色的椭圆（推近的镜头里是一个罩住人的金色胶囊；视频里只有贴身的金边）
    F.B.billboard = null;
    flat(F, () => F.ring(x, y, 92, GOLD, 0.4 * k, 0.55, true));
  }
  // 两指夹住的飞剑：剑身横在指间，剑尖微微颤，偶尔迸一点火星
  for (const h of I.held) {
    const cc = col(h.color), sd = F.B.direction(Math.cos(h.ang), Math.sin(h.ang)) + Math.sin(h.t * 40) * 0.03;
    F.B.billboard = { x: h.x, y: h.y, offsetY: -h.z };
    if (h.fx === 'sword') {
      F.B.quad(C.Blade, h.x, h.y, 96, 22, sd, cc[0], cc[1], cc[2], 0.95, 1);
      F.B.quad(C.Glow, h.x, h.y, 120, 34, sd, cc[0], cc[1], cc[2], 0.25, 1);
    } else F.glow(h.x, h.y, 26, cc, 0.6);
    if (rr() < dt * 10) F.sparks(h.x, h.y, mixc(cc, WHITE, 0.5), 2, 220, 0.2, 2);
    F.B.billboard = null;
  }
}
