// v0.63：功法的通用点缀 —— 起手一圈灵光升腾（castFlourish）、飞行中的法术按五行各带一道尾迹（projSparkle）。
// 开局那几门（火弹、冰锥、风刃、金针……）原先只有一个弹头贴图 + 光晕，飞起来干巴巴的；这里给每一系补上拖尾粒子。
import type { Combat } from '../world/combat';
import { FxSys, col, mixc, RGB, fireCell, smokeCell } from './fx';
import { C } from './atlas';

const TAU = Math.PI * 2;
const WHITE: RGB = [1, 1, 1];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const nEm = (rate: number, dt: number) => { const f = rate * dt; return Math.floor(f) + (Math.random() < f % 1 ? 1 : 0); };

/** 起手：脚下一圈灵光向内收、向上升，身前一记四芒闪光 */
export function castFlourish(F: FxSys, x: number, y: number, cc: RGB, k: number) {
  const hot = mixc(cc, WHITE, 0.5), n = Math.round(8 + 8 * k), r = 46 * (0.6 + 0.5 * k);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + Math.random() * 0.3;
    F.emit({ x: x + Math.cos(a) * r, y: y + 34 + Math.sin(a) * r * 0.5, vx: -Math.cos(a) * 60, vy: -rnd(120, 260) * (0.6 + 0.4 * k), life: rnd(0.4, 0.7), s0: rnd(3, 5), s1: 1, c: Math.random() < 0.35 ? hot : cc, a: 0.9, stretch: 0.035, drag: 1.2 });
  }
  F.shockRing(x, y + 36, 54 * (0.6 + 0.5 * k), hot, 0.3, 0.5, 0.5);
  F.emit({ x, y: y - 6, life: 0.26, s0: 26 * k + 10, s1: 70 * k + 20, c: hot, a: 0.5, cell: C.Star, rot: Math.random() * TAU, vr: 4 });
}

/** 飞行中的法术 / 法器弹道：按五行补尾迹。弹道多时自动减量 */
export function projSparkle(F: FxSys, c: Combat, dt: number) {
  const P = c.projs as any[];
  if (!P.length || dt <= 0) return;
  const q = P.length > 30 ? 0.3 : P.length > 14 ? 0.55 : 1;
  for (const pr of P) {
    const sp = Math.hypot(pr.vx || 0, pr.vy || 0);
    if (sp < 20 || !Number.isFinite(pr.x + pr.y)) continue;
    const fx: string = pr.fx ?? '', cc = col(pr.color ?? '255,236,200'), hot = mixc(cc, WHITE, 0.55);
    const ux = pr.vx / sp, uy = pr.vy / sp, s = Math.min(2, Math.max(0.7, pr.size ?? 1));
    const n = nEm((pr.fac === 'p' ? 46 : 26) * q, dt);
    const bx = pr.x - ux * 10, by = pr.y - uy * 10;
    if (/fire|flame|crow|snake|sun/.test(fx)) {
      for (let i = 0; i < n; i++) F.emit({ x: bx + rnd(-5, 5), y: by + rnd(-5, 5), vx: -ux * 70 + rnd(-30, 30), vy: -uy * 70 - rnd(10, 50), life: rnd(0.25, 0.45), s0: rnd(12, 20) * s, s1: 3, c: Math.random() < 0.4 ? hot : cc, a: 0.6, cell: fireCell(), rot: Math.atan2(-uy, -ux) + Math.PI / 2 });
      if (Math.random() < dt * 22 * q) F.emit({ x: bx, y: by, vx: rnd(-90, 90), vy: rnd(-140, -20), life: rnd(0.4, 0.8), s0: 3, s1: 1, c: hot, a: 0.9, stretch: 0.03, grav: 260 });
      if (Math.random() < dt * 8 * q) F.emit({ x: bx, y: by, vx: -ux * 30, vy: -30, life: rnd(0.5, 0.8), s0: 14 * s, s1: 40 * s, c: [0.14, 0.12, 0.11], a: 0.22, add: 0, cell: smokeCell(), rot: rnd(0, TAU) });
    } else if (/ice|frost|icicle|snow/.test(fx)) {
      for (let i = 0; i < n; i++) {
        if (Math.random() < 0.6) F.emit({ x: bx + rnd(-6, 6), y: by + rnd(-6, 6), vx: -ux * 40 + rnd(-40, 40), vy: -uy * 40 + rnd(-40, 40), life: rnd(0.3, 0.6), s0: rnd(5, 9) * s, s1: 1.5, c: Math.random() < 0.5 ? WHITE : cc, a: 0.9, cell: Math.random() < 0.6 ? C.Shard : C.Star, rot: rnd(0, TAU), vr: rnd(-8, 8), grav: 90 });
        else F.emit({ x: bx, y: by, vx: -ux * 30, vy: -uy * 30, life: rnd(0.4, 0.7), s0: 12 * s, s1: 40 * s, c: [0.8, 0.92, 1], a: 0.12, cell: C.Glow });
      }
    } else if (/lightning|thunder/.test(fx)) {
      for (let i = 0; i < n; i++) F.emit({ x: bx, y: by, vx: rnd(-320, 320), vy: rnd(-320, 320), life: 0.14, s0: 2.4, s1: 1, c: hot, a: 0.9, stretch: 0.05 });
      if (Math.random() < dt * 14 * q) { const a = rnd(0, TAU), L = rnd(24, 54) * s; F.bolt(pr.x, pr.y, pr.x + Math.cos(a) * L, pr.y + Math.sin(a) * L, Math.random() * 1e6, 8, 1, hot, 0.85, 5, false); }
    } else if (/wind|tornado|gale/.test(fx)) {
      for (let i = 0; i < n; i++) F.emit({ x: bx + rnd(-8, 8), y: by + rnd(-8, 8), vx: -ux * 220 + rnd(-60, 60), vy: -uy * 220 + rnd(-60, 60), life: rnd(0.16, 0.28), s0: 2.2, s1: 1, c: Math.random() < 0.5 ? WHITE : cc, a: 0.6, stretch: 0.07 });
    } else if (/sword|needle|blade|jian/.test(fx)) {
      for (let i = 0; i < n; i++) {
        if (Math.random() < 0.3) F.emit({ x: bx + rnd(-6, 6), y: by + rnd(-6, 6), life: rnd(0.16, 0.28), s0: rnd(9, 14) * s, s1: 2, c: hot, a: 0.9, cell: C.Star, rot: rnd(0, TAU) });
        else F.emit({ x: bx, y: by, vx: -ux * 160 + rnd(-20, 20), vy: -uy * 160 + rnd(-20, 20), life: 0.2, s0: 2, s1: 1, c: Math.random() < 0.5 ? WHITE : cc, a: 0.8, stretch: 0.08 });
      }
    } else if (/water|wave|rain/.test(fx)) {
      for (let i = 0; i < n; i++) F.emit({ x: bx + rnd(-6, 6), y: by + rnd(-6, 6), vx: -ux * 50 + rnd(-60, 60), vy: -uy * 50 - rnd(0, 80), life: rnd(0.3, 0.55), s0: rnd(4, 7) * s, s1: 2, c: Math.random() < 0.4 ? WHITE : cc, a: 0.8, cell: C.Glow, grav: 520 });
    } else if (/vine|leaf|wood|thorn/.test(fx)) {
      for (let i = 0; i < n; i++) if (Math.random() < 0.5) F.emit({ x: bx, y: by, vx: -ux * 40 + rnd(-70, 70), vy: -uy * 40 + rnd(-70, 30), life: rnd(0.4, 0.8), s0: rnd(8, 12) * s, s1: 5, c: [0.45, 0.72, 0.35], a: 0.95, add: 0, cell: C.Leaf, rot: rnd(0, TAU), vr: rnd(-8, 8), grav: 160 });
      else F.emit({ x: bx, y: by, vx: -ux * 30, vy: -uy * 30 - 20, life: rnd(0.3, 0.5), s0: 4, s1: 1, c: hot, a: 0.8, cell: C.Glow });
    } else if (/blood|ghost|devil|mind|dark|soul|corpse/.test(fx)) {
      for (let i = 0; i < n; i++) F.emit({ x: bx + rnd(-6, 6), y: by + rnd(-6, 6), vx: -ux * 50 + rnd(-20, 20), vy: -uy * 50 - rnd(10, 50), life: rnd(0.4, 0.8), s0: rnd(14, 22) * s, s1: 5, c: Math.random() < 0.4 ? hot : cc, a: 0.4, cell: C.Wisp, rot: Math.atan2(uy, ux) });
    } else if (/rock|earth|stone|brick/.test(fx)) {
      for (let i = 0; i < n; i++) if (Math.random() < 0.5) F.emit({ x: bx, y: by, vx: -ux * 60 + rnd(-80, 80), vy: -uy * 60 - rnd(0, 100), life: rnd(0.4, 0.7), s0: rnd(4, 8) * s, s1: 3, c: [0.42, 0.33, 0.24], a: 1, add: 0, cell: C.Shard, rot: rnd(0, TAU), vr: rnd(-8, 8), grav: 700 });
    } else {
      for (let i = 0; i < n; i++) F.emit({ x: bx + rnd(-5, 5), y: by + rnd(-5, 5), vx: -ux * 60 + rnd(-30, 30), vy: -uy * 60 + rnd(-30, 30), life: rnd(0.25, 0.45), s0: rnd(3, 5) * s, s1: 1, c: Math.random() < 0.35 ? WHITE : cc, a: 0.8, cell: C.Glow });
    }
  }
}
