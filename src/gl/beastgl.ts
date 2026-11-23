// v0.63：四级以上妖兽的妖气、起手、落招 —— WebGL 粒子版（取代原先的像素特效）。
// world/beastfx.ts 只把事件排进 beastEvq；这里每帧取走：一次性的迸发直接喷粒子，
// 要持续几帧的（火柱、冰棱、落雷、鬼手、龙卷、剑雨……）进 live 列表逐帧画。
import type { Combat } from '../world/combat';
import { FxSys, col, mixc, RGB, fireCell, smokeCell, extOK } from './fx';
import { C } from './atlas';
import { enemyVis } from '../world/combatfx';
import { elOf, EL_COL } from '../world/foeskills';
import type { El } from '../world/foeskills';
import { beastEvq } from '../world/beastfx';
import type { BeastEv } from '../world/beastfx';

const TAU = Math.PI * 2, SQ = 0.55;
const WHITE: RGB = [1, 1, 1];
const ROCK: RGB = [0.42, 0.33, 0.24];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const ease = (u: number) => 1 - Math.pow(1 - clamp(u, 0, 1), 3);
const frac = (v: number) => v - Math.floor(v);
const nEm = (rate: number, dt: number) => { const f = rate * dt; return Math.floor(f) + (Math.random() < f % 1 ? 1 : 0); };
const EC = (el: El): RGB => col(EL_COL[el]);
/** 各系的暗部色（火的深红、冰的深蓝……），和本命色搭配出层次 */
const SUB: Record<El, RGB> = {
  phys: [0.55, 0.42, 0.28], fire: [1, 0.26, 0.05], ice: [0.3, 0.56, 1], water: [0.14, 0.38, 0.95], thunder: [0.42, 0.38, 1], poison: [0.16, 0.42, 0.08],
  blood: [0.5, 0.02, 0.06], ghost: [0.16, 0.5, 0.46], wind: [0.38, 0.82, 0.68], earth: [0.5, 0.36, 0.2], sword: [0.45, 0.88, 0.78], gold: [1, 0.58, 0.14], metal: [0.58, 0.63, 0.74],
};
const fireTall = () => (extOK() ? C.KFire1 : C.Flame);
const wispCell = () => (extOK() ? (Math.random() < 0.5 ? C.KWisp1 : C.KWisp2) : C.Wisp);
const isClaw = (el: El) => el === 'phys' || el === 'sword' || el === 'metal' || el === 'earth';

interface Live { ev: BeastEv; t: number; dur: number; seed: number }
const live: Live[] = [];
const keep = (ev: BeastEv, dur: number, seed: number) => { if (live.length < 40) live.push({ ev, t: 0, dur, seed }); };
const LIVE_DUR: Record<El, number> = { fire: 0.8, ice: 1.0, thunder: 0.45, gold: 0.45, poison: 1.0, blood: 0.7, ghost: 1.05, wind: 1.15, water: 0.85, sword: 0.6, metal: 0.6, earth: 0.95, phys: 0.95 };

export function drawBeastGL(F: FxSys, c: Combat, t: number, dt: number) {
  if (beastEvq.length) { for (const ev of beastEvq) spawn(F, ev); beastEvq.length = 0; }
  for (let i = live.length - 1; i >= 0; i--) {
    const L = live[i]; L.t += dt;
    if (L.t >= L.dur) { live.splice(i, 1); continue; }
    drawLive(F, L, t, dt);
  }
  auras(F, c, t, dt);
}

function spawn(F: FxSys, ev: BeastEv) {
  const seed = Math.random() * 1000;
  if (ev.k === 'dust') { dust(F, ev); return; }
  if (ev.k === 'cast' || ev.k === 'seal') { keep(ev, ev.dur ?? 1, seed); return; }
  boom(F, ev, seed);
}

/** 疾行扬尘：脚下三团土烟 + 一道掠过的风线 */
function dust(F: FxSys, ev: BeastEv) {
  const s = 0.6 + Math.min(0.6, ev.lv * 0.06);
  if (ev.el !== 'wind') for (let i = 0; i < 3; i++) F.emit({ x: ev.x + rnd(-14, 14), y: ev.y + rnd(-2, 6), vx: rnd(-40, 40), vy: rnd(-50, -15), life: rnd(0.45, 0.8), s0: rnd(16, 26) * s, s1: rnd(50, 70) * s, c: [0.5, 0.44, 0.36], a: 0.3, add: 0, cell: smokeCell(), rot: rnd(0, TAU), vr: rnd(-1, 1), drag: 2 });
  for (let i = 0; i < 2; i++) F.emit({ x: ev.x + rnd(-20, 20), y: ev.y - rnd(10, 50), vx: rnd(-240, 240), vy: rnd(-30, 30), life: 0.22, s0: 2.2, s1: 1, c: [0.9, 0.95, 0.9], a: 0.45, stretch: 0.08 });
}

// ============================================================== 落招：一次性迸发
function boom(F: FxSys, ev: BeastEv, seed: number) {
  const cc = EC(ev.el), hot = mixc(cc, WHITE, 0.6), sub = SUB[ev.el];
  if (ev.shape === 'cone') { coneBurst(F, ev, cc, hot); keep(ev, 0.55, seed); return; }
  if (ev.shape === 'line') { lineBurst(F, ev, cc); keep(ev, 0.35, seed); return; }
  const x = ev.x, y = ev.y, r = Math.max(50, ev.r), el = ev.el;
  keep(ev, el === 'poison' && ev.pool ? clamp(ev.pool, 1, 4) : LIVE_DUR[el], seed);
  F.shockRing(x, y, r * 1.1, cc, 0.45, SQ, 0.85);
  F.shockRing(x, y, r * 0.7, hot, 0.3, SQ, 0.6);
  switch (el) {
    case 'fire':
      F.flash(x, y - 40, r * 0.9, hot, 0.2);
      for (let i = 0; i < 26; i++) F.emit({ x: x + rnd(-0.5, 0.5) * r, y: y + rnd(-0.25, 0.25) * r, vx: rnd(-60, 60), vy: rnd(-560, -220), life: rnd(0.5, 0.95), s0: rnd(40, 72), s1: rnd(10, 20), c: Math.random() < 0.35 ? hot : cc, a: 0.75, cell: fireCell(), rot: rnd(-0.25, 0.25), drag: 1 });
      F.embers(x, y - 30, hot, 18, r * 0.6);
      F.smokeRing(x, y, r, [0.2, 0.15, 0.12], 0.35, 1);
      break;
    case 'ice':
      F.flash(x, y - 30, r * 0.8, [0.85, 0.95, 1], 0.18);
      for (let i = 0; i < 22; i++) { const a = rnd(0, TAU), v = rnd(160, 480); F.emit({ x, y: y - 20, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - rnd(80, 260), life: rnd(0.5, 0.9), s0: rnd(8, 16), s1: 3, c: Math.random() < 0.5 ? WHITE : cc, a: 0.95, cell: C.Shard, rot: rnd(0, TAU), vr: rnd(-8, 8), grav: 620, drag: 0.8 }); }
      for (let i = 0; i < 8; i++) { const a = rnd(0, TAU); F.emit({ x: x + Math.cos(a) * r * 0.4, y: y + Math.sin(a) * r * 0.2 - 10, vx: Math.cos(a) * 70, vy: Math.sin(a) * 35 - 20, life: rnd(0.8, 1.3), s0: rnd(40, 60), s1: rnd(110, 150), c: [0.8, 0.92, 1], a: 0.1, cell: C.Glow, drag: 1.5 }); }
      break;
    case 'thunder': case 'gold':
      F.flash(x, y - 60, r * 1.3, hot, 0.2); F.sparks(x, y - 10, hot, 28, 720, 0.4, 3); F.shock(x, y, r * 2, 14, 0.4); F.glint(x, y - 40, r * 0.8, WHITE, 0.9, 0.25);
      break;
    case 'poison':
      for (let i = 0; i < 22; i++) { const a = rnd(0, TAU), v = rnd(60, 260); F.emit({ x, y: y - 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - rnd(260, 620), life: rnd(0.6, 1), s0: rnd(10, 20), s1: 5, c: Math.random() < 0.3 ? hot : cc, a: 0.85, cell: C.Water, rot: rnd(0, TAU), grav: 1100 }); }
      for (let i = 0; i < 9; i++) { const a = rnd(0, TAU); F.emit({ x: x + Math.cos(a) * r * 0.5, y: y + Math.sin(a) * r * 0.25, vx: Math.cos(a) * 50, vy: -rnd(20, 60), life: rnd(0.9, 1.5), s0: rnd(36, 56), s1: rnd(100, 140), c: sub, a: 0.4, add: 0, cell: smokeCell(), rot: rnd(0, TAU), vr: rnd(-0.6, 0.6), drag: 1.2 }); }
      break;
    case 'blood':
      F.flash(x, y - 30, r * 0.7, [1, 0.35, 0.35], 0.18); F.ink(x, y + 8, r * 1.2, 0.45, [0.35, 0.02, 0.05]); F.rays(x, y - 30, r, cc, 0.45, 0.3);
      for (let i = 0; i < 26; i++) { const a = rnd(0, TAU), v = rnd(200, 560); F.emit({ x, y: y - 24, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - rnd(60, 300), life: rnd(0.4, 0.8), s0: rnd(4, 8), s1: 2, c: Math.random() < 0.25 ? hot : cc, a: 0.95, stretch: 0.03, grav: 900 }); }
      break;
    case 'ghost':
      for (let i = 0; i < 9; i++) { const a = rnd(0, TAU), rr = rnd(0.1, 0.8) * r; F.emit({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr * SQ, vx: rnd(-20, 20), vy: -rnd(150, 290), life: rnd(0.8, 1.3), s0: rnd(46, 70), s1: rnd(100, 140), c: Math.random() < 0.4 ? sub : cc, a: 0.42, cell: wispCell(), rot: rnd(-0.3, 0.3), vr: rnd(-0.5, 0.5), drag: 0.8 }); }
      for (let i = 0; i < 14; i++) { const a = rnd(0, TAU), rr = rnd(0, 0.8) * r; F.emit({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr * SQ, vy: -rnd(80, 200), life: rnd(0.5, 0.9), s0: rnd(16, 26), s1: 4, c: cc, a: 0.6, cell: fireCell(), rot: rnd(-0.2, 0.2) }); }
      break;
    case 'wind':
      for (let i = 0; i < 22; i++) { const a = rnd(0, TAU), v = rnd(300, 620); F.emit({ x: x + Math.cos(a) * r * 0.3, y: y + Math.sin(a) * r * 0.15 - rnd(0, 60), vx: -Math.sin(a) * v, vy: Math.cos(a) * v * 0.5 - 60, life: rnd(0.25, 0.45), s0: 2.6, s1: 1, c: hot, a: 0.7, stretch: 0.06 }); }
      for (let i = 0; i < 8; i++) { const a = rnd(0, TAU), v = rnd(200, 400); F.emit({ x, y: y - 30, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - rnd(100, 300), life: rnd(0.7, 1.2), s0: rnd(10, 16), s1: 8, c: [0.5, 0.72, 0.4], a: 0.95, add: 0, cell: C.Leaf, rot: rnd(0, TAU), vr: rnd(-9, 9), grav: 300, drag: 1 }); }
      F.smokeRing(x, y, r, [0.5, 0.5, 0.46], 0.25, 0.8);
      break;
    case 'water':
      for (let i = 0; i < 28; i++) { const a = rnd(0, TAU), v = rnd(40, 240); F.emit({ x, y: y - 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - rnd(320, 760), life: rnd(0.6, 1), s0: rnd(6, 12), s1: 3, c: Math.random() < 0.4 ? WHITE : cc, a: 0.85, cell: Math.random() < 0.3 ? C.Water : C.Glow, grav: 1300 }); }
      F.shockRing(x, y, r * 1.4, hot, 0.7, SQ, 0.5);
      break;
    case 'sword': case 'metal':
      F.sparks(x, y - 20, WHITE, 18, 620, 0.35, 2.6);
      for (let i = 0; i < 3; i++) F.emit({ x: x + rnd(-0.3, 0.3) * r, y: y - 30 + rnd(-0.15, 0.15) * r, life: 0.2, s0: r * 0.9, s1: r * 1.5, c: i ? cc : WHITE, a: 0.8, cell: C.Slash, rot: rnd(0, TAU) });
      break;
    default:
      F.shock(x, y, r * 1.6, 12, 0.4); F.smokeRing(x, y, r * 1.1, [0.36, 0.3, 0.24], 0.4, 1);
      for (let i = 0; i < 20; i++) { const a = rnd(0, TAU), v = rnd(120, 420); F.emit({ x: x + Math.cos(a) * r * 0.3, y: y + Math.sin(a) * r * 0.15, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - rnd(240, 560), life: rnd(0.6, 1), s0: rnd(7, 15), s1: rnd(5, 9), c: ROCK, a: 1, add: 0, cell: C.Shard, rot: rnd(0, TAU), vr: rnd(-8, 8), grav: 1300 }); }
      F.sparks(x, y - 10, hot, 10, 380, 0.35, 2.6);
  }
}

function coneGeo(ev: BeastEv) {
  const ang = ev.ang ?? 0, r = Math.max(80, ev.r), sp = clamp(ev.spread ?? 0.5, 0.2, 1.2);
  return { ang, r, sp, ox: ev.x + Math.cos(ang) * 24, oy: ev.y - 34 };
}
/** 扇形：爪击系（体 / 金 / 剑 / 土）是三道裂空爪痕；其余是一口吐息（由 coneLive 持续喷） */
function coneBurst(F: FxSys, ev: BeastEv, cc: RGB, hot: RGB) {
  const { ang, r, ox, oy } = coneGeo(ev);
  F.flash(ox, oy, 46, hot, 0.14); F.shockRing(ev.x, ev.y, 70, cc, 0.3, SQ, 0.6);
  if (!isClaw(ev.el)) return;
  const cx = ev.x + Math.cos(ang) * r * 0.55, cy = ev.y + Math.sin(ang) * r * 0.55 * 0.7 - 30;
  const vx = Math.cos(ang) * 120, vy = Math.sin(ang) * 84;
  F.emit({ x: cx, y: cy, vx, vy, life: 0.3, s0: r * 0.9, s1: r * 1.35, c: hot, a: 0.95, cell: C.Fang, rot: ang });
  F.emit({ x: cx, y: cy, vx, vy, life: 0.24, s0: r * 0.7, s1: r * 1.1, c: WHITE, a: 0.8, cell: C.Slash, rot: ang });
  F.sparks(cx, cy, hot, 16, 560, 0.35, 2.8, ang, 1.4);
  F.shock(cx, cy, r * 0.9, 9, 0.3);
}
/** 直线：冲撞 / 贯穿，沿线迸出两侧的碎光 */
function lineBurst(F: FxSys, ev: BeastEv, cc: RGB) {
  const ang = ev.ang ?? 0, len = ev.len ?? 300, w = ev.w ?? 70, ux = Math.cos(ang), uy = Math.sin(ang);
  for (let i = 0; i < 18; i++) { const q = Math.random(), s = Math.random() < 0.5 ? 1 : -1, v = rnd(120, 360); F.emit({ x: ev.x + ux * len * q, y: ev.y + uy * len * q - 24, vx: -uy * s * v + ux * 200, vy: ux * s * v * 0.6 - 60, life: rnd(0.25, 0.5), s0: rnd(3, 5), s1: 1, c: Math.random() < 0.4 ? WHITE : cc, a: 0.9, stretch: 0.04 }); }
  F.shockRing(ev.x + ux * len, ev.y + uy * len, w * 1.6, cc, 0.4, SQ, 0.8);
  F.smokeRing(ev.x + ux * len * 0.5, ev.y + uy * len * 0.5, w, [0.4, 0.36, 0.3], 0.25, 0.7);
}

// ============================================================== 持续几帧的部分
function drawLive(F: FxSys, L: Live, t: number, dt: number) {
  const ev = L.ev, u = L.t / L.dur, cc = EC(ev.el), hot = mixc(cc, WHITE, 0.6), sub = SUB[ev.el];
  if (ev.k === 'cast') { castLive(F, L, u, t, dt, cc, hot); return; }
  if (ev.k === 'seal') { sealLive(F, L, u, t, dt); return; }
  if (ev.shape === 'cone') { coneLive(F, ev, u, dt, cc, hot, sub); return; }
  if (ev.shape === 'line') {
    const ang = ev.ang ?? 0, len = ev.len ?? 300, w = ev.w ?? 70, a = 1 - u, x2 = ev.x + Math.cos(ang) * len, y2 = ev.y + Math.sin(ang) * len;
    F.beam(ev.x, ev.y - 24, x2, y2 - 24, w * 1.4 * a, cc, 0.45 * a); F.beam(ev.x, ev.y - 24, x2, y2 - 24, w * 0.4 * a, WHITE, 0.6 * a); F.beam(ev.x, ev.y, x2, y2, w * 1.2, cc, 0.14 * a);
    return;
  }
  const x = ev.x, y = ev.y, r = Math.max(50, ev.r), fade = 1 - u, sd = L.seed;
  F.ground(C.Glow, x, y, r * 1.15, 0, cc, 0.3 * fade, 1, SQ);
  switch (ev.el) {
    case 'fire': {   // 火柱冲天：脚下火环急旋，三层焰柱
      const up = ease(u * 3.5), a = Math.pow(fade, 1.2), h = r * 3.4 * up, w = r * 1.5 * (0.92 + 0.08 * Math.sin(t * 30));
      F.ground(C.FireRing, x, y, r * (0.75 + 0.45 * u), t * 3 + sd, cc, 0.75 * a, 1, SQ);
      F.sprite(fireTall(), x, y - h * 0.5 + 10, w, h, 0, sub, 0.6 * a);
      F.sprite(fireTall(), x, y - h * 0.47 + 10, w * 0.75, h * 0.94, 0, cc, 0.7 * a);
      F.sprite(fireTall(), x, y - h * 0.42 + 10, w * 0.4, h * 0.8, 0, hot, 0.6 * a);
      F.beam(x, y, x, y - h * 0.9, r * 0.5, hot, 0.3 * a);
      F.glow(x, y - h * 0.3, r * 1.4, cc, 0.25 * a);
      for (let i = nEm(50 * a, dt); i > 0; i--) F.emit({ x: x + rnd(-0.4, 0.4) * r, y: y + rnd(-0.2, 0.2) * r, vx: rnd(-40, 40), vy: rnd(-420, -200), life: rnd(0.35, 0.6), s0: rnd(26, 46), s1: 8, c: Math.random() < 0.3 ? hot : cc, a: 0.6, cell: fireCell(), rot: rnd(-0.2, 0.2) });
      break;
    }
    case 'ice': case 'earth': case 'phys': {   // 冰棱 / 地刺破土：一丛尖刺次第顶出，随后隐去
      const ice = ev.el === 'ice', n = r > 180 ? 11 : 7, fd = 1 - clamp((u - 0.6) / 0.4, 0, 1);
      if (ice) F.ground(C.Crack, x, y, r * 0.95, sd, hot, 0.6 * fd, 1, SQ);
      else { F.ground(C.Crack, x, y, r * 0.95, sd, [0.08, 0.06, 0.04], 0.6 * fd, 0, SQ); F.ground(C.Crack, x, y, r * 0.9, sd, hot, 0.35 * fd, 1, SQ); }
      for (let i = 0; i < n; i++) {
        const an = sd + i * 2.399, rr = i === 0 ? 0 : r * (0.2 + 0.62 * frac(i * 0.618)), tx = x + Math.cos(an) * rr, ty = y + Math.sin(an) * rr * SQ;
        const h = (i === 0 ? 1.25 : 0.6 + 0.6 * frac(i * 0.37)) * Math.min(220, 60 + r * 0.7) * ease(u * 6 - i * 0.12);
        if (h < 4) continue;
        const lean = i === 0 ? 0 : Math.cos(an) * 0.28, px = tx + Math.sin(lean) * h * 0.5, py = ty - h * 0.5;
        if (ice) { F.sprite(C.Thorn, px, py, h * 0.42, h, lean, cc, 0.9 * fd); F.sprite(C.Thorn, px, py, h * 0.2, h * 0.9, lean, WHITE, 0.6 * fd); F.glow(tx, ty, h * 0.35, cc, 0.3 * fd); }
        else { F.sprite(C.Thorn, px, py, h * 0.5, h, lean, ROCK, 0.97 * fd, 0); F.sprite(C.Thorn, px, py, h * 0.22, h * 0.9, lean, hot, 0.22 * fd); }
      }
      if (ice && Math.random() < dt * 40 * fd) { const a = rnd(0, TAU), rr = rnd(0, 0.8) * r; F.emit({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr * SQ - rnd(0, 120), vy: -rnd(10, 40), life: rnd(0.4, 0.8), s0: rnd(8, 14), s1: 2, c: WHITE, a: 0.9, cell: C.Star, rot: rnd(0, TAU) }); }
      break;
    }
    case 'thunder': case 'gold': {   // 落雷：三道天雷自天穹劈落，地上电蛇乱窜
      const a = fade, fl = Math.floor(L.t * 40);
      for (let b = 0; b < 3; b++) F.bolt(x + (b - 1) * r * 0.3 + rnd(-10, 10), y - 900, x + (b - 1) * r * 0.25, y, sd + fl * 7 + b * 131, 44, 3.2 - b * 0.7, b ? cc : hot, a, 14, b === 0);
      if (extOK()) F.sprite(Math.floor(sd) % 2 ? C.KBoltV1 : C.KBoltV2, x, y - 340, 220, 720, 0, hot, 0.75 * a * a);
      F.beam(x, y, x, y - 900, 90, cc, 0.22 * a);
      F.ground(C.Crack, x, y, r * 0.85, sd, hot, 0.85 * a, 1, SQ);
      F.glow(x, y - 30, r * 1.5, cc, 0.4 * a);
      for (let k = 0; k < 2; k++) { const an = rnd(0, TAU), a2 = an + rnd(0.6, 1.6), r1 = rnd(0.2, 0.9) * r, r2 = rnd(0.2, 0.9) * r; F.bolt(x + Math.cos(an) * r1, y + Math.sin(an) * r1 * SQ, x + Math.cos(a2) * r2, y + Math.sin(a2) * r2 * SQ, Math.random() * 1e6, 12, 1.2, hot, 0.8 * a, 6, false); }
      break;
    }
    case 'poison': {   // 毒沼：墨绿瘴气贴地翻涌，毒泡不断冒起
      const a = Math.min(1, u * 6) * Math.min(1, fade * 3);
      F.ground(C.Smoke, x, y, r * 1.05, t * 0.4 + sd, sub, 0.42 * a, 0, SQ);
      F.ground(C.Swirl, x, y, r * 0.95, -t * 0.9, cc, 0.3 * a, 1, SQ);
      F.ground(C.Ring, x, y, r, 0, cc, 0.3 * a, 1, SQ);
      for (let i = nEm(16 * a, dt); i > 0; i--) { const an = rnd(0, TAU), rr = Math.sqrt(Math.random()) * r * 0.9; F.emit({ x: x + Math.cos(an) * rr, y: y + Math.sin(an) * rr * SQ, vy: -rnd(30, 80), life: rnd(0.5, 0.9), s0: rnd(5, 9), s1: rnd(14, 22), c: Math.random() < 0.3 ? hot : cc, a: 0.7, cell: extOK() ? C.KBubble : C.Ring }); }
      for (let i = nEm(5 * a, dt); i > 0; i--) { const an = rnd(0, TAU), rr = Math.sqrt(Math.random()) * r * 0.8; F.emit({ x: x + Math.cos(an) * rr, y: y + Math.sin(an) * rr * SQ, vy: -rnd(20, 50), life: rnd(0.9, 1.5), s0: rnd(30, 44), s1: rnd(80, 110), c: sub, a: 0.3, add: 0, cell: smokeCell(), rot: rnd(0, TAU), vr: rnd(-0.5, 0.5) }); }
      break;
    }
    case 'blood': {   // 血煞：血漩急旋，一道血光冲起
      F.ground(C.Ink, x, y, r * (0.6 + 0.4 * u), sd, [0.45, 0.02, 0.05], 0.5 * fade, 0, SQ);
      F.ground(C.Swirl, x, y, r * (0.7 + 0.5 * u), t * 3 + sd, cc, 0.55 * fade, 1, SQ);
      F.beam(x, y, x, y - 420 * ease(u * 3), r * 0.7 * fade, cc, 0.3 * fade);
      F.beam(x, y, x, y - 420 * ease(u * 3), r * 0.2 * fade, hot, 0.5 * fade);
      F.glow(x, y - 40, r * 1.2, cc, 0.3 * fade);
      break;
    }
    case 'ghost': {   // 幽冥鬼手：数只鬼手自地下探出，抓向圈心
      const n = r > 180 ? 7 : 5, fd = Math.min(1, fade * 2.5);
      F.ground(C.Disc, x, y, r * 0.9, 0, [0.01, 0.04, 0.035], 0.35 * fd, 0, SQ);
      F.ground(C.Swirl, x, y, r, -t * 1.4 + sd, cc, 0.35 * fd, 1, SQ);
      for (let i = 0; i < n; i++) {
        const an = sd + i * 2.399, rr = r * (0.25 + 0.55 * frac(i * 0.618)), bx = x + Math.cos(an) * rr, by = y + Math.sin(an) * rr * SQ;
        const H = (110 + 70 * frac(i * 0.37)) * ease(u * 3 - i * 0.1); if (H < 6) continue;
        const pts: [number, number][] = [];
        for (let s = 0; s <= 6; s++) { const q = s / 6; pts.push([bx + Math.sin(q * 3 + t * 4 + i) * 12 * q + (x - bx) * 0.25 * q * q, by - H * q]); }
        F.trail(pts, 26, cc, 0.5 * fd, C.Glow, 1, 0.75);
        F.trail(pts, 9, hot, 0.6 * fd);
        const tp = pts[6];
        F.sprite(C.Fang, tp[0], tp[1] - 6, 46, 46, -Math.PI / 2, hot, 0.75 * fd);
        F.glow(tp[0], tp[1], 26, cc, 0.4 * fd);
      }
      break;
    }
    case 'wind': {   // 龙卷：九层风环叠成漏斗，摆动着升起，风丝绕柱急旋
      const a = Math.min(1, u * 5) * Math.min(1, fade * 3), H = Math.min(360, 160 + r);
      F.ground(C.Swirl, x, y, r, t * 5, cc, 0.4 * a, 1, SQ);
      for (let j = 0; j < 9; j++) {
        const q = j / 8, rad = r * (0.16 + 0.8 * q * q) * (0.92 + 0.08 * Math.sin(t * 9 + j)), ox = Math.sin(t * 5 + q * 4) * 16 * q;
        F.sprite(C.RingSoft, x + ox, y - q * H, rad * 2, rad * 0.8, 0, j % 2 ? hot : cc, 0.3 * a * (1 - q * 0.4));
      }
      for (let i = nEm(120 * a, dt); i > 0; i--) { const q = Math.random(), rad = r * (0.16 + 0.8 * q * q), an = rnd(0, TAU), v = 520 + 300 * q; F.emit({ x: x + Math.cos(an) * rad, y: y - q * H + Math.sin(an) * rad * 0.4, vx: -Math.sin(an) * v, vy: Math.cos(an) * v * 0.4 - 90, life: rnd(0.16, 0.28), s0: rnd(2, 3.4), s1: 1, c: Math.random() < 0.4 ? WHITE : cc, a: 0.7, stretch: 0.05 }); }
      if (Math.random() < dt * 14 * a) F.emit({ x: x + rnd(-0.3, 0.3) * r, y, vx: rnd(-60, 60), vy: -rnd(20, 60), life: rnd(0.6, 1), s0: rnd(30, 44), s1: 80, c: [0.5, 0.48, 0.42], a: 0.25, add: 0, cell: smokeCell(), rot: rnd(0, TAU), drag: 1.5 });
      break;
    }
    case 'water': {   // 水柱：一道水龙冲起，落下水珠，地上涟漪层层
      const a = Math.min(1, fade * 2.2), H = Math.min(420, 180 + r) * ease(u * 4);
      F.beam(x, y, x, y - H, r * 0.9, cc, 0.4 * a); F.beam(x, y, x, y - H, r * 0.35, WHITE, 0.4 * a);
      F.sprite(C.Water, x, y - H, r * 1.3, r * 0.9, 0, hot, 0.7 * a);
      for (let i = 0; i < 3; i++) { const q = frac(u * 2 + i / 3); F.ground(C.Ring, x, y, r * (0.4 + q), 0, hot, 0.5 * (1 - q) * a, 1, SQ); }
      for (let i = nEm(60 * a, dt); i > 0; i--) F.emit({ x: x + rnd(-0.3, 0.3) * r, y: y - H * rnd(0.6, 1), vx: rnd(-160, 160), vy: rnd(-160, 40), life: rnd(0.4, 0.7), s0: rnd(4, 8), s1: 2, c: Math.random() < 0.4 ? WHITE : cc, a: 0.8, cell: C.Glow, grav: 900 });
      break;
    }
    default: {   // 剑 / 金：一阵剑雨自空中钉落
      const n = r > 180 ? 11 : 7;
      for (let i = 0; i < n; i++) {
        if (L.t < i * 0.035) continue;
        const an = sd + i * 2.399, rr = i === 0 ? 0 : r * (0.2 + 0.6 * frac(i * 0.618)), tx = x + Math.cos(an) * rr, ty = y + Math.sin(an) * rr * SQ;
        const q = clamp((L.t - i * 0.035) / 0.14, 0, 1), fy = ty - 60 - (1 - q) * 520, a = q < 1 ? 1 : Math.min(1, fade * 1.6);
        F.sprite(C.Blade, tx, fy, 130, 30, Math.PI / 2, cc, 0.9 * a);
        F.sprite(C.Blade, tx, fy, 112, 10, Math.PI / 2, WHITE, 0.9 * a);
        if (q < 1) F.beam(tx, fy - 60, tx, fy - 260, 8, hot, 0.4); else F.ground(C.Glow, tx, ty, 34, 0, cc, 0.5 * a, 1, SQ);
      }
    }
  }
}

/** 吐息：自口中喷出一扇本命之气，持续半息 */
function coneLive(F: FxSys, ev: BeastEv, u: number, dt: number, cc: RGB, hot: RGB, sub: RGB) {
  const { ang, r, sp, ox, oy } = coneGeo(ev), el = ev.el, a = 1 - u * u, lf = 0.42;
  if (isClaw(el)) return;
  F.glow(ox, oy, 40, cc, 0.4 * a);
  for (let i = nEm(240 * a, dt); i > 0; i--) {
    const d = ang + rnd(-sp, sp) * 0.9, v = (r / lf) * rnd(0.7, 1.1), vx = Math.cos(d) * v, vy = Math.sin(d) * v * 0.7, rot = Math.atan2(vy, vx) + Math.PI / 2, life = lf * rnd(0.8, 1.1);
    if (el === 'fire' || el === 'blood') F.emit({ x: ox, y: oy, vx, vy, life, s0: rnd(16, 26), s1: rnd(70, 110), c: Math.random() < 0.3 ? hot : Math.random() < 0.3 ? sub : cc, a: 0.55, cell: fireCell(), rot, vr: rnd(-1.5, 1.5) });
    else if (el === 'ice' || el === 'water') {
      if (Math.random() < 0.4) F.emit({ x: ox, y: oy, vx, vy, life, s0: rnd(7, 13), s1: 3, c: Math.random() < 0.5 ? WHITE : cc, a: 0.9, cell: el === 'ice' ? C.Shard : C.Glow, rot: rnd(0, TAU), vr: rnd(-8, 8) });
      else F.emit({ x: ox, y: oy, vx, vy, life, s0: rnd(20, 30), s1: rnd(90, 130), c: el === 'ice' ? [0.82, 0.93, 1] : cc, a: 0.16, cell: C.Glow });
    } else if (el === 'wind') F.emit({ x: ox, y: oy, vx, vy, life, s0: rnd(2, 3.4), s1: 1, c: Math.random() < 0.5 ? WHITE : cc, a: 0.6, stretch: 0.05 });
    else if (el === 'poison') F.emit({ x: ox, y: oy, vx, vy, life: life * 1.3, s0: rnd(18, 28), s1: rnd(80, 120), c: Math.random() < 0.5 ? sub : cc, a: 0.3, add: Math.random() < 0.5 ? 0 : 1, cell: smokeCell(), rot: rnd(0, TAU), vr: rnd(-1, 1), drag: 0.6 });
    else if (el === 'ghost') F.emit({ x: ox, y: oy, vx, vy, life: life * 1.2, s0: rnd(24, 36), s1: rnd(80, 110), c: Math.random() < 0.4 ? sub : cc, a: 0.3, cell: wispCell(), rot, vr: rnd(-1, 1) });
    else F.emit({ x: ox, y: oy, vx, vy, life: life * 0.7, s0: rnd(2.4, 3.6), s1: 1, c: Math.random() < 0.5 ? WHITE : cc, a: 0.9, stretch: 0.04 });
  }
  if (el === 'thunder' || el === 'gold') for (let k = 0; k < 2; k++) { const d = ang + rnd(-sp, sp), rr = r * rnd(0.5, 1); F.bolt(ox, oy, ox + Math.cos(d) * rr, oy + 30 + Math.sin(d) * rr * 0.7, Math.random() * 1e6, 20, 1.8, hot, 0.9 * a, 9, false); }
}

/** 起手：脚下法阵由小张大，四周妖气向口中收拢，一道光柱渐起 */
function castLive(F: FxSys, L: Live, u: number, t: number, dt: number, cc: RGB, hot: RGB) {
  const ev = L.ev, src = ev.src as any, ok = src && !src.dead;
  const x = ok ? src.x : ev.x, y = ok ? src.y : ev.y, hy = y - 40 - (ok ? (src.flyH ?? 0) + (src.lift ?? 0) : 0);
  const a = Math.min(1, u * 5) * Math.min(1, (1 - u) * 4), R = ev.r * (0.55 + 0.45 * ease(u * 1.6));
  F.ground(C.Disc, x, y, R * 1.05, 0, [0, 0, 0], 0.2 * a, 0, SQ);
  F.ground(C.Rune, x, y, R, t * 1.6 + L.seed, cc, 0.55 * a, 1, SQ);
  F.ground(C.Ring, x, y, R * 1.08, 0, hot, 0.5 * a, 1, SQ);
  if (extOK()) F.ground(C.KCompass, x, y, R * 0.7, -t * 2.2, hot, 0.35 * a, 1, SQ);
  if (ev.big) F.ground(C.Bagua, x, y, R * 1.5, -t * 0.7, cc, 0.3 * a, 1, SQ);
  for (let i = nEm(40 + ev.lv * 5, dt); i > 0; i--) { const an = rnd(0, TAU), rr = R * rnd(0.9, 1.5), px = x + Math.cos(an) * rr, py = y + Math.sin(an) * rr * SQ; F.emit({ x: px, y: py, vx: (x - px) * 2.4, vy: (hy - py) * 2.4, life: 0.4, s0: rnd(4, 7), s1: 1.5, c: Math.random() < 0.3 ? hot : cc, a: 0.9, stretch: 0.03 }); }
  F.glow(x, hy, 30 + 50 * u, cc, (0.22 + 0.18 * u) * a);
  F.glow(x, hy, 10 + 16 * u, WHITE, 0.25 * u * a);
  F.beam(x, y, x, y - 260 * u, 30 * (1 - u * 0.5), cc, 0.16 * a);
}

/** 宗门阵纹：rune 地面符阵 / holy 天降光柱 / mana 灵光聚拢 */
function sealLive(F: FxSys, L: Live, u: number, t: number, dt: number) {
  const ev = L.ev, x = ev.x, y = ev.y, R = 44 * (ev.sc ?? 1);
  const cc: RGB = ev.pal === 'blood' ? [0.95, 0.16, 0.2] : ev.pal === 'gold' ? [1, 0.82, 0.4] : [0.82, 0.95, 1], hot = mixc(cc, WHITE, 0.55);
  const a = Math.min(1, L.t * 3) * Math.min(1, (L.dur - L.t) * 2);
  if (ev.key === 'holy') {
    F.beam(x, y, x, y - 760, R * 1.3, cc, 0.3 * a); F.beam(x, y, x, y - 760, R * 0.4, WHITE, 0.5 * a);
    F.ground(C.Lotus, x, y, R * 1.2, t * 0.4, hot, 0.5 * a, 1, SQ); F.ground(C.Ring, x, y, R * 1.5, 0, cc, 0.5 * a, 1, SQ);
    F.glow(x, y - 40, R * 1.6, cc, 0.3 * a);
    for (let i = nEm(40 * a, dt); i > 0; i--) F.emit({ x: x + rnd(-1, 1) * R * 0.7, y: y - rnd(300, 700), vy: rnd(260, 520), life: rnd(0.5, 0.9), s0: rnd(3, 5), s1: 1, c: Math.random() < 0.4 ? WHITE : cc, a: 0.9, stretch: 0.04 });
  } else if (ev.key === 'mana') {
    F.glow(x, y, R * (1 + u), cc, 0.4 * a); F.glow(x, y, R * 0.4, WHITE, 0.5 * a);
    for (let i = nEm(60 * a, dt); i > 0; i--) { const an = rnd(0, TAU), rr = R * rnd(1.4, 2.2), px = x + Math.cos(an) * rr, py = y + Math.sin(an) * rr * 0.8; F.emit({ x: px, y: py, vx: (x - px) * 3, vy: (y - py) * 3, life: 0.32, s0: rnd(3, 6), s1: 1, c: Math.random() < 0.4 ? WHITE : cc, a: 0.9, stretch: 0.03 }); }
  } else {
    F.ground(C.Disc, x, y, R * 1.05, 0, [0, 0, 0], 0.22 * a, 0, SQ);
    F.ground(C.Rune, x, y, R, t * 0.7 + L.seed, cc, 0.6 * a, 1, SQ);
    F.ground(C.Bagua, x, y, R * 0.5, -t * 0.9, hot, 0.5 * a, 1, SQ);
    F.circle(x, y, R * 1.04, Math.max(2.5, R * 0.03), hot, 0.6 * a, SQ);
    F.ground(C.Glow, x, y, R * 1.3, 0, cc, 0.14 * a, 1, SQ);
    for (let i = nEm(Math.min(60, 10 + R * 0.12) * a, dt); i > 0; i--) { const an = rnd(0, TAU), rr = R * rnd(0.6, 1); F.emit({ x: x + Math.cos(an) * rr, y: y + Math.sin(an) * rr * SQ, vy: -rnd(40, 130), life: rnd(0.6, 1.2), s0: rnd(3, 6), s1: 1, c: Math.random() < 0.3 ? WHITE : cc, a: 0.8, cell: C.Glow }); }
  }
}

// ============================================================== 周身妖气
/** 一粒本命妖气：各系形态不同（火舌 / 冰晶 / 电火 / 毒泡 / 血丝 / 鬼雾 / 风丝 / 土石 / 水珠 / 剑芒） */
function mote(F: FxSys, el: El, x: number, y: number, cc: RGB, hot: RGB, sub: RGB, size: number) {
  switch (el) {
    case 'fire': F.emit({ x, y, vx: rnd(-20, 20), vy: rnd(-120, -50), life: rnd(0.5, 0.9), s0: rnd(14, 24) * size, s1: 4, c: Math.random() < 0.4 ? hot : Math.random() < 0.4 ? sub : cc, a: 0.55, cell: fireCell(), rot: rnd(-0.3, 0.3) }); break;
    case 'ice': F.emit({ x, y, vx: rnd(-14, 14), vy: rnd(-40, -10), life: rnd(0.6, 1), s0: rnd(6, 10) * size, s1: 2, c: Math.random() < 0.5 ? WHITE : cc, a: 0.85, cell: Math.random() < 0.6 ? C.Shard : C.Star, rot: rnd(0, TAU), vr: rnd(-3, 3) }); break;
    case 'thunder': case 'gold': F.emit({ x, y, vx: rnd(-220, 220), vy: rnd(-220, 220), life: 0.15, s0: 2.4, s1: 1, c: hot, a: 0.9, stretch: 0.06 }); break;
    case 'poison': F.emit({ x, y, vx: rnd(-12, 12), vy: rnd(-60, -25), life: rnd(0.6, 1), s0: rnd(4, 7), s1: rnd(12, 18), c: cc, a: 0.6, cell: extOK() ? C.KBubble : C.Ring }); break;
    case 'blood': F.emit({ x, y, vx: rnd(-16, 16), vy: rnd(-90, -40), life: rnd(0.6, 1), s0: rnd(16, 24) * size, s1: 6, c: Math.random() < 0.5 ? sub : cc, a: 0.42, cell: C.Wisp, rot: rnd(-0.4, 0.4) + Math.PI / 2 }); break;
    case 'ghost': F.emit({ x, y, vx: rnd(-16, 16), vy: rnd(-90, -40), life: rnd(0.8, 1.3), s0: rnd(22, 30) * size, s1: rnd(46, 60) * size, c: Math.random() < 0.4 ? sub : cc, a: 0.28, cell: wispCell(), rot: rnd(-0.3, 0.3), vr: rnd(-0.5, 0.5) }); break;
    case 'wind': F.emit({ x, y, vx: rnd(-280, 280), vy: rnd(-50, 10), life: 0.25, s0: 2, s1: 1, c: hot, a: 0.5, stretch: 0.08 }); break;
    case 'water': F.emit({ x, y, vx: rnd(-30, 30), vy: rnd(-110, -50), life: rnd(0.5, 0.8), s0: rnd(4, 7), s1: 2, c: Math.random() < 0.4 ? WHITE : cc, a: 0.75, cell: C.Glow, grav: 260 }); break;
    case 'sword': case 'metal': F.emit({ x, y, life: rnd(0.2, 0.35), s0: rnd(12, 18), s1: 2, c: hot, a: 0.9, cell: C.Star, rot: rnd(0, TAU) }); break;
    default: F.emit({ x, y, vx: rnd(-30, 30), vy: rnd(-90, -40), life: rnd(0.5, 0.8), s0: rnd(4, 7), s1: 3, c: ROCK, a: 0.9, add: 0, cell: C.Shard, rot: rnd(0, TAU), vr: rnd(-6, 6), grav: 260 });
  }
}

/**
 * 四级以上妖兽周身的妖气（随五行变色、随级别加码）：
 *   四级起：脚下一池本命色灵光 + 周身升腾的妖气；六级起：背后两团妖焰随呼吸摇曳；
 *   七级起：脚下旋转符阵；八级起：一枚妖丹绕身而行；九级起：火环 + 顶上妖轮。
 */
function auras(F: FxSys, c: Combat, t: number, dt: number) {
  const p = c.game.player;
  let n = 0;
  for (const e of c.enemies) {
    if (n >= 8) break;
    const lv = e.blv ?? 0;
    if (lv < 4 || e.dead || !e.aggro || e.def.kind === 'human') continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    if (dx * dx + dy * dy > 1300 * 1300) continue;
    const v = enemyVis(c, e); if (v <= 0.05) continue;
    n++;
    const el = elOf(e), cc = EC(el), hot = mixc(cc, WHITE, 0.5), sub = SUB[el], a = e as any;
    const size = e.def.look?.size ?? 1, bx = e.x, gy = e.y, by = e.y - (a.flyH ?? 0) - (a.lift ?? 0), H = (e.anim.flying ? 70 : 46) * size;
    const tier = lv >= 9 ? 3 : lv >= 7 ? 2 : lv >= 6 ? 1 : 0, ph = (e.id % 97) * 0.37;
    const pul = 0.85 + 0.15 * Math.sin(t * 3 + ph);
    F.ground(C.Glow, bx, gy, (60 + lv * 6) * size, 0, cc, (0.1 + 0.025 * tier) * v * pul, 1, SQ);
    if (tier >= 2) { const R = (56 + lv * 5) * size; F.ground(C.Rune, bx, gy, R, t * 0.5 + ph, cc, 0.32 * v, 1, SQ); F.ground(C.Ring, bx, gy, R * 1.06, 0, hot, 0.28 * v * pul, 1, SQ); }
    if (tier >= 3) F.ground(C.FireRing, bx, gy, (78 + lv * 5) * size, -t * 0.8, cc, 0.32 * v * pul, 1, SQ);
    if (tier >= 1) for (let s = -1; s <= 1; s += 2) {
      const w = 64 * size * (1 + tier * 0.15), h = 140 * size * (1 + tier * 0.22) * pul;
      F.sprite(fireTall(), bx + s * 24 * size + Math.sin(t * 2.3 + s + ph) * 4, by - h * 0.42, w, h, s * 0.2 + Math.sin(t * 1.7 + s * 2 + ph) * 0.07, cc, 0.17 * v);
      F.sprite(fireTall(), bx + s * 20 * size, by - h * 0.36, w * 0.5, h * 0.72, s * 0.16, hot, 0.1 * v);
    }
    for (let i = nEm((8 + lv * 2.5) * v, dt); i > 0; i--) mote(F, el, bx + rnd(-30, 30) * size, by - rnd(0, H), cc, hot, sub, size);
    if (lv >= 8) {
      const an = t * 2.2 + ph, ox = bx + Math.cos(an) * 54 * size, oy = by - H * 0.6 + Math.sin(an) * 20 * size;
      F.orb(ox, oy, 5 + lv * 0.4, cc, 0.9 * v);
      if (Math.random() < dt * 30) F.emit({ x: ox, y: oy, life: 0.35, s0: 8, s1: 1, c: hot, a: 0.7 * v, cell: C.Glow });
    }
    if (tier >= 3) { F.sprite(C.Ring, bx, by - H - 34 * size, 74 * size, 24 * size, 0, hot, 0.6 * v * pul); F.glow(bx, by - H - 34 * size, 30 * size, cc, 0.2 * v); }
    if ((el === 'thunder' || el === 'gold') && Math.random() < dt * (3 + tier * 2)) { const an = rnd(0, TAU), rr = rnd(40, 80) * size; F.bolt(bx, by - H * 0.5, bx + Math.cos(an) * rr, by - H * 0.5 + Math.sin(an) * rr * 0.7, Math.random() * 1e6, 12, 1.1, hot, 0.8 * v, 6, false); }
  }
}
