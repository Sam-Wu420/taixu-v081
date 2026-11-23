// 「遁影惊雷」特效（WebGL）：读取 world/nitian.ts 的状态绘制。
// · 寸阴凝世：一圈霜白震波扫过，脚下日晷停摆，尘埃光点凝在半空，敌人 / 法术各被一道符环定住（画面去色在 nitian.ts 用 CSS 做）
// · 万劫不磨：琉璃金身——金罩、双环、绕身符印、足下金莲、冲天光柱；挨打处迸开金纹；褪去时碎成金屑
// · 逆命回光：万点流光倒卷入体，足下青莲绽开，花瓣升腾
// · 一线开天：蓄势时一根细线越拉越长、四方光点归于掌心；出手一道白芯金晕的裂空之线，沿线雷蛇乱窜、地面焦裂
// · 音爆：垂直于去向的音爆云（气环由小而大、向后滑去），云气向后锥形甩开，激波面碎芒四射；档位越高圈数越多、越大
// · 水遁：身后人字形水线、船头浪、飞沫、涟漪；沸血遁 / 裂脉诀 / 鼓元术 / 玄龟闭息各有随身光效（敌修同款）
import type { Combat } from '../world/combat';
import type { NiEv, NiBoom } from '../world/nitian';
import { FxSys, col, mixc, RGB, fireCell, extOK } from './fx';
import { C } from './atlas';

const TAU = Math.PI * 2;
const WHITE: RGB = [1, 1, 1], GOLD: RGB = [1, 0.86, 0.5], GOLD2: RGB = [1, 0.95, 0.75], ICE: RGB = [0.72, 0.84, 1], BLOOD: RGB = [0.92, 0.16, 0.2], WATER: RGB = [0.62, 0.84, 1];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const nEm = (rate: number, dt: number) => { const f = rate * dt; return Math.floor(f) + (Math.random() < f % 1 ? 1 : 0); };
const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const ease = (k: number) => 1 - (1 - k) * (1 - k);

// ------------------------------------------------------------------ 一次性爆发
function burst(F: FxSys, ev: NiEv, lift: number) {
  const x = ev.x, y = ev.y - lift, by = y - 46;
  switch (ev.k) {
    case 'stasis': {
      F.shock(x, by, 1200, 24, 0.9);
      F.shockRing(x, y, 900, ICE, 0.8, 0.55, 0.9); F.shockRing(x, y, 560, WHITE, 0.55, 0.55, 0.8); F.shockRing(x, y, 260, ICE, 0.35);
      F.flash(x, by, 240, [0.8, 0.88, 1], 0.3); F.rays(x, by, 320, ICE, 0.55, 0.45);
      F.emit({ x, y: by, life: 0.9, s0: 120, s1: 1100, c: ICE, a: 0.45, cell: C.Bagua, rot: 0, vr: -1.4 });
      F.emit({ x, y: by, life: 0.6, s0: 60, s1: 700, c: WHITE, a: 0.4, cell: C.RingSoft });
      for (let i = 0; i < 64; i++) { const a = rnd(0, TAU), sp = rnd(300, 900); F.emit({ x, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, life: rnd(0.8, 1.4), s0: rnd(3, 6), s1: 2, c: Math.random() < 0.4 ? WHITE : ICE, a: 0.9, cell: C.Star, drag: 5, rot: rnd(0, TAU) }); }
      break;
    }
    case 'unstasis': {
      F.emit({ x, y: by, life: 0.45, s0: 1000, s1: 40, c: ICE, a: 0.5, cell: C.RingSoft });
      F.shockRing(x, y, 300, WHITE, 0.4, 0.55, 0.6);
      for (let i = 0; i < 26; i++) { const a = rnd(0, TAU), sp = rnd(200, 520); F.emit({ x: x + Math.cos(a) * 30, y: by + Math.sin(a) * 20, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7 - 80, life: rnd(0.5, 0.9), s0: rnd(8, 16), s1: 3, c: Math.random() < 0.5 ? WHITE : ICE, a: 0.9, cell: C.Shard, rot: rnd(0, TAU), vr: rnd(-9, 9), grav: 500 }); }
      F.flash(x, by, 160, ICE, 0.2);
      break;
    }
    case 'inv': {
      F.shock(x, by, 420, 14, 0.5);
      F.shockRing(x, y, 320, GOLD, 0.5, 0.55, 0.9); F.shockRing(x, y, 160, GOLD2, 0.35);
      F.flash(x, by, 200, GOLD2, 0.25); F.rays(x, by, 280, GOLD, 0.6, 0.4); F.rays(x, by, 200, GOLD2, 0.5, 0.3);
      F.emit({ x, y: by, life: 0.6, s0: 50, s1: 340, c: GOLD, a: 0.6, cell: C.Lotus, rot: 0, vr: 1.2 });
      for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; F.emit({ x, y: by, vx: Math.cos(a) * 320, vy: Math.sin(a) * 200, life: 0.7, s0: 30, s1: 10, c: GOLD2, a: 0.9, cell: C.Seal, rot: a, vr: 3, drag: 3 }); }
      for (let i = 0; i < 30; i++) F.emit({ x: x + rnd(-50, 50), y: y - rnd(0, 90), vx: rnd(-30, 30), vy: -rnd(120, 380), life: rnd(0.5, 1), s0: rnd(3, 6), s1: 1, c: GOLD2, a: 0.95, stretch: 0.03 });
      break;
    }
    case 'invhit': {
      const a = ev.ang ?? 0, hx = x + Math.cos(a) * 52, hy = by + Math.sin(a) * 60;
      F.hit(hx, hy, GOLD2, 2, true, a + Math.PI);
      F.emit({ x: hx, y: hy, life: 0.3, s0: 20, s1: 130, c: GOLD2, a: 0.8, cell: C.Ring, rot: 0 });
      F.emit({ x: hx, y: hy, life: 0.22, s0: 30, s1: 90, c: WHITE, a: 0.7, cell: C.Star, rot: rnd(0, TAU), vr: 6 });
      F.glint(hx, hy, 40, WHITE, 0.9, 0.2);
      break;
    }
    case 'invend': {
      for (let i = 0; i < 30; i++) { const a = rnd(0, TAU), sp = rnd(120, 420); F.emit({ x: x + Math.cos(a) * 50, y: by + Math.sin(a) * 70, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8 - 60, life: rnd(0.6, 1.1), s0: rnd(8, 18), s1: 3, c: Math.random() < 0.4 ? WHITE : GOLD, a: 0.9, cell: C.Shard, rot: rnd(0, TAU), vr: rnd(-8, 8), grav: 620 }); }
      F.shockRing(x, y, 180, GOLD, 0.35, 0.55, 0.6);
      break;
    }
    case 'huiguang': {
      const G1: RGB = [0.66, 1, 0.78];
      F.shock(x, by, 380, 10, 0.5);
      for (let i = 0; i < 70; i++) { const a = rnd(0, TAU), r = rnd(200, 340); F.emit({ x: x + Math.cos(a) * r, y: by + Math.sin(a) * r * 0.7, vx: -Math.cos(a) * r * 2.4, vy: -Math.sin(a) * r * 0.7 * 2.4, life: 0.42, s0: rnd(4, 8), s1: 2, c: Math.random() < 0.4 ? WHITE : G1, a: 0.95, stretch: 0.04 }); }
      F.emit({ x, y: y + 4, life: 1.3, s0: 40, s1: 300, c: G1, a: 0.6, cell: C.Lotus, rot: 0, vr: 0.7 });
      F.emit({ x, y: by, life: 0.5, s0: 400, s1: 30, c: WHITE, a: 0.5, cell: C.RingSoft });
      F.rays(x, by, 300, G1, 0.6, 0.6); F.rays(x, by, 220, WHITE, 0.5, 0.45); F.flash(x, by, 260, [0.9, 1, 0.92], 0.35);
      F.shockRing(x, y, 260, G1, 0.7, 0.55, 0.8);
      for (let i = 0; i < 26; i++) F.emit({ x: x + rnd(-70, 70), y: y - rnd(0, 60), vx: rnd(-40, 40), vy: -rnd(90, 260), life: rnd(0.9, 1.6), s0: rnd(10, 16), s1: 6, c: Math.random() < 0.5 ? [1, 0.85, 0.9] : G1, a: 0.9, add: 0.4, cell: C.Petal, rot: rnd(0, TAU), vr: rnd(-4, 4), drag: 1 });
      break;
    }
    case 'ktfire': {
      const a = ev.ang ?? 0, ux = Math.cos(a), uy = Math.sin(a), L = ev.r ?? 1500;
      F.flash(x, by, 420, WHITE, 0.3); F.rays(x, by, 420, GOLD2, 0.7, 0.4);
      for (let d = 60, i = 0; d < L; d += 150, i++) {
        const cx = x + ux * d, cy = by + uy * d;
        if (i % 2 === 0) F.shock(cx, cy, 260, 14, 0.5);
        F.sparks(cx, cy, GOLD2, 10, 520, 0.6, 3);
        F.ink(cx, cy + 46, 120, 0.4, [0.1, 0.08, 0.06]);
        F.emit({ x: cx, y: cy, life: 0.35, s0: 60, s1: 320, c: WHITE, a: 0.5, cell: C.RingSoft });
        F.emit({ x: cx, y: cy + 46, life: 1.4, s0: 150, s1: 170, c: [1, 0.8, 0.45], a: 0.55, cell: C.Crack, rot: a + rnd(-0.3, 0.3) });
      }
      break;
    }
    case 'splash': {
      const k = ev.r ?? 1;
      F.shockRing(x, y, 120 * k, WATER, 0.6, 0.5, 0.8); F.shockRing(x, y, 70 * k, WHITE, 0.4, 0.5, 0.7);
      for (let i = 0; i < 34 * k; i++) F.emit({ x: x + rnd(-24, 24), y: y - rnd(0, 20), vx: rnd(-170, 170), vy: -rnd(180, 560), life: rnd(0.5, 1), s0: rnd(4, 9), s1: 2, c: Math.random() < 0.45 ? WHITE : WATER, a: 0.9, cell: C.Dot, grav: 1100, stretch: 0.02 });
      for (let i = 0; i < 6; i++) F.emit({ x: x + rnd(-30, 30), y: y - 20, vx: rnd(-60, 60), vy: -rnd(120, 260), life: rnd(0.4, 0.7), s0: 40, s1: 110 * k, c: [0.85, 0.95, 1], a: 0.6, cell: C.Water, rot: 0, grav: 300 });
      F.flash(x, y - 30, 120 * k, WATER, 0.2);
      break;
    }
    case 'learn': {
      const cc = col(ev.col ?? '255,240,200');
      F.shock(x, by, 700, 16, 0.8);
      for (let i = 0; i < 3; i++) F.shockRing(x, y, 200 + i * 220, i === 1 ? WHITE : cc, 0.6 + i * 0.25, 0.55, 0.9);
      F.rays(x, by, 420, cc, 0.7, 0.8); F.rays(x, by, 300, WHITE, 0.6, 0.6); F.flash(x, by, 300, WHITE, 0.35);
      F.emit({ x, y: by, life: 1.4, s0: 60, s1: 520, c: cc, a: 0.55, cell: C.Bagua, rot: 0, vr: 1 });
      F.emit({ x, y: y + 4, life: 1.6, s0: 60, s1: 340, c: GOLD2, a: 0.6, cell: C.Lotus, rot: 0, vr: -0.6 });
      for (let i = 0; i < 80; i++) F.emit({ x: x + rnd(-160, 160), y: y - rnd(-20, 60), vx: rnd(-30, 30), vy: -rnd(100, 420), life: rnd(0.8, 1.8), s0: rnd(4, 8), s1: 1, c: Math.random() < 0.4 ? WHITE : cc, a: 0.95, cell: C.Star, rot: rnd(0, TAU), vr: 3 });
      break;
    }
    case 'burst': case 'foe': {
      const cc = col(ev.col ?? '255,255,255'), hot = mixc(cc, WHITE, 0.5), s = ev.s;
      F.shockRing(x, y, ev.k === 'foe' ? 110 : 150, cc, 0.4, 0.55, 0.8);
      F.flash(x, by, 110, hot, 0.18);
      if (s === 'blood' || s === 'xue') {
        F.ink(x, y, 120, 0.4, [0.3, 0.02, 0.04]);
        for (let i = 0; i < 30; i++) { const a = rnd(0, TAU), sp = rnd(80, 360); F.emit({ x, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7 - 60, life: rnd(0.35, 0.7), s0: rnd(16, 30), s1: 4, c: Math.random() < 0.3 ? hot : BLOOD, a: 0.75, cell: fireCell(), rot: 0, drag: 2.5 }); }
        for (let i = 0; i < 16; i++) F.emit({ x, y: by, vx: rnd(-260, 260), vy: rnd(-320, 60), life: rnd(0.4, 0.8), s0: rnd(3, 6), s1: 1, c: [0.8, 0.05, 0.08], a: 1, add: 0.2, cell: C.Dot, grav: 800, stretch: 0.03 });
      } else if (s === 'fire' || s === 'lie') {
        F.flames(x, y, 60, [1, 0.5, 0.18], 12, 0.85); F.embers(x, by, [1, 0.6, 0.2], 24, 40);
        for (let i = 0; i < 5; i++) { const a = rnd(0, TAU); F.bolt(x, by, x + Math.cos(a) * 90, by + Math.sin(a) * 70, Math.random() * 1e6, 14, 1.6, [1, 0.35, 0.15], 0.9, 7, false); }
      } else if (s === 'leaf' || s === 'gu') {
        F.rays(x, by, 180, cc, 0.5, 0.4);
        for (let i = 0; i < 20; i++) F.emit({ x: x + rnd(-40, 40), y: y - rnd(0, 70), vx: rnd(-60, 60), vy: -rnd(80, 240), life: rnd(0.7, 1.2), s0: rnd(10, 15), s1: 5, c: [0.5, 0.82, 0.4], a: 0.95, add: 0.2, cell: C.Leaf, rot: rnd(0, TAU), vr: rnd(-6, 6) });
        F.emit({ x, y: by, life: 0.5, s0: 60, s1: 230, c: cc, a: 0.5, cell: C.RingSoft });
      } else if (s === 'rock' || s === 'gui') {
        F.smokeRing(x, y, 110, [0.45, 0.38, 0.28], 0.4, 0.8);
        F.emit({ x, y: by, life: 0.6, s0: 220, s1: 130, c: cc, a: 0.6, cell: C.Bagua, rot: 0, vr: 2 });
        for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; F.emit({ x: x + Math.cos(a) * 150, y: by + Math.sin(a) * 100, vx: -Math.cos(a) * 320, vy: -Math.sin(a) * 210, life: 0.36, s0: 30, s1: 18, c: hot, a: 0.9, cell: C.Shard, rot: a }); }
      } else if (s === 'marrow') {
        for (let i = 0; i < 22; i++) F.emit({ x: x + rnd(-30, 30), y: y - rnd(10, 90), vx: rnd(-20, 20), vy: -rnd(60, 200), life: rnd(0.5, 0.9), s0: rnd(4, 8), s1: 2, c: i % 2 ? BLOOD : cc, a: 0.95, cell: C.Glow });
        F.emit({ x, y: by, life: 0.5, s0: 300, s1: 30, c: cc, a: 0.5, cell: C.RingSoft });
        F.rays(x, by, 160, cc, 0.5, 0.35);
      } else if (s === 'shui') {
        for (let i = 0; i < 22; i++) F.emit({ x: x + rnd(-20, 20), y: y - rnd(0, 20), vx: rnd(-150, 150), vy: -rnd(160, 460), life: rnd(0.5, 0.9), s0: rnd(4, 8), s1: 2, c: Math.random() < 0.45 ? WHITE : WATER, a: 0.9, cell: C.Dot, grav: 1000, stretch: 0.02 });
      }
      break;
    }
  }
}

// ------------------------------------------------------------------ 音爆云
function drawBooms(F: FxSys, booms: NiBoom[]) {
  for (const b of booms) {
    const ux = Math.cos(b.ang), uy = Math.sin(b.ang), T = b.tier, y0 = b.y - b.lift - 40;
    if (!b.seen) {
      b.seen = true;
      F.shock(b.x, y0, 240 + T * 150, 9 + T * 5, 0.4 + T * 0.08);
      // 被推开的云气：向后方锥形甩出
      for (let i = 0; i < 10 + T * 7; i++) { const a = b.ang + Math.PI + rnd(-0.75, 0.75), sp = rnd(180, 420 + T * 120); F.emit({ x: b.x, y: y0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.35, 0.7), s0: rnd(26, 44), s1: rnd(70, 120) + T * 16, c: [0.92, 0.95, 1], a: 0.34, cell: C.Wisp, rot: a, drag: 2.2 }); }
      // 激波面上的碎芒：垂直于去向炸开
      for (let i = 0; i < 12 + T * 6; i++) { const sd = Math.random() < 0.5 ? 1 : -1, a = b.ang + sd * Math.PI / 2 + rnd(-0.35, 0.35), sp = rnd(300, 700 + T * 160); F.emit({ x: b.x, y: y0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.18, 0.4), s0: 3, s1: 1, c: WHITE, a: 0.9, stretch: 0.05, drag: 3 }); }
      F.flash(b.x, y0, 70 + T * 34, [0.9, 0.95, 1], 0.14);
      if (b.lift < 70) F.smokeRing(b.x, b.y, 90 + T * 46, [0.62, 0.6, 0.56], 0.26, 0.8);
      if (T >= 3 && extOK()) F.emit({ x: b.x, y: y0, life: 0.3, s0: 160, s1: 520 + (T - 3) * 240, c: WHITE, a: 0.4, cell: C.KRays1, rot: rnd(0, TAU) });
      if (T >= 4) for (let i = 0; i < 4; i++) { const a = rnd(0, TAU); F.bolt(b.x, y0, b.x + Math.cos(a) * 220, y0 + Math.sin(a) * 150, Math.random() * 1e6, 26, 2, [0.85, 0.92, 1], 0.9, 10, true); }
    }
    // 一圈垂直于去向的气环，由小而大、向后滑去；高档位叠两三圈
    const rings = T >= 3 ? 3 : T >= 1 ? 2 : 1;
    for (let i = 0; i < rings; i++) {
      const kk = (b.t - i * 0.07) / b.dur; if (kk <= 0 || kk >= 1) continue;
      const R = (64 + T * 40) * (0.3 + 1.5 * ease(kk)) * (1 - i * 0.18), a = Math.pow(1 - kk, 1.4) * (0.8 - i * 0.2);
      const cx = b.x - ux * (26 + i * 44) * kk * 2, cy = y0 - uy * (26 + i * 44) * kk * 2;
      F.sprite(C.RingSoft, cx, cy, R * 0.55, R * 2, b.ang, WHITE, a * 0.8);
      F.sprite(C.Ring, cx, cy, R * 0.62, R * 2.2, b.ang, [0.85, 0.93, 1], a);
      F.sprite(C.Glow, cx, cy, R * 0.5, R * 1.5, b.ang, [0.8, 0.9, 1], a * 0.3);
    }
  }
}

/** 头顶一圈计时点：还剩几成亮几颗 */
function dots(F: FxSys, x: number, y: number, k: number, cc: RGB) {
  const n = 12, lit = Math.ceil(k * n);
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i / n) * TAU, on = i < lit; F.glow(x + Math.cos(a) * 30, y + Math.sin(a) * 30 * 0.45, on ? 5 : 3, on ? cc : [0.4, 0.4, 0.45], on ? 0.95 : 0.4, C.Dot); }
}

// ------------------------------------------------------------------ 寸阴凝世
function drawStasis(F: FxSys, c: Combat, t: number) {
  const ni = c.ni, p = c.game.player, lift = p.st.lift || 0;
  const age = ni.stasisMax - ni.stasisT, a = Math.max(0, Math.min(1, age / 0.35, ni.stasisT / 0.3));
  const ox = ni.stasisX, oy = ni.stasisY, R = 820;
  F.ground(C.Ring, ox, oy, R * Math.min(1, age / 0.45), 0, ICE, 0.5 * a, 1, 0.55);
  F.ground(C.Rune, ox, oy, 560, 0, ICE, 0.13 * a, 1, 0.55);
  F.ground(C.Bagua, ox, oy, 300, 0, ICE, 0.2 * a, 1, 0.55);
  // 日晷：两根针卡在原地，微微颤
  const j = Math.sin(t * 46) * 0.012;
  F.beam(ox, oy, ox + Math.cos(-1.1 + j) * 250, oy + Math.sin(-1.1 + j) * 250 * 0.55, 7, WHITE, 0.45 * a);
  F.beam(ox, oy, ox + Math.cos(0.5 - j) * 160, oy + Math.sin(0.5 - j) * 160 * 0.55, 10, ICE, 0.45 * a);
  // 凝在半空的尘埃与光点（一动不动）
  for (let i = 0; i < 54; i++) {
    const ax = hash(i * 3.1) * TAU, rr = Math.sqrt(hash(i * 7.7)) * R;
    F.glow(ox + Math.cos(ax) * rr, oy + Math.sin(ax) * rr * 0.6 - 30 - hash(i * 1.3) * 190, 4 + hash(i) * 5, i % 3 ? ICE : WHITE, (0.35 + 0.3 * hash(i * 5.5)) * a, i % 4 === 0 ? C.Star : C.Glow);
  }
  // 被定住的人与物
  for (const e of c.units) {
    if (e.dead || Math.abs(e.x - p.x) > 1500 || Math.abs(e.y - p.y) > 1100) continue;
    F.ground(C.Ring, e.x, e.y, 52, 0, ICE, 0.6 * a, 1, 0.55);
    F.ground(C.Rune, e.x, e.y, 48, 0, ICE, 0.3 * a, 1, 0.55);
    F.glow(e.x, e.y - 44, 64, [0.5, 0.62, 0.95], 0.2 * a);
    F.sprite(C.Seal, e.x, e.y - 128, 26, 26, 0, ICE, 0.8 * a);
  }
  for (const pr of c.projs as any[]) if (pr.fac !== 'p') { F.sprite(C.Ring, pr.x, pr.y, 44, 44, 0, ICE, 0.7 * a); F.glow(pr.x, pr.y, 22, WHITE, 0.3 * a); }
  dots(F, p.x, p.y - lift - 150, ni.stasisT / Math.max(0.01, ni.stasisMax), ICE);
}

// ------------------------------------------------------------------ 万劫不磨（金身）
function shell(F: FxSys, x: number, y: number, by: number, t: number, a: number, s = 1) {
  const pu = 0.5 + 0.5 * Math.sin(t * 7);
  F.glow(x, by, 100 * s, GOLD, (0.24 + 0.08 * pu) * a);
  F.sprite(C.RingSoft, x, by, 132 * s, 184 * s, 0, GOLD, 0.34 * a);
  F.sprite(C.Ring, x, by, 124 * s, 174 * s, 0, GOLD2, 0.8 * a);
  F.ring(x, by, 80 * s, GOLD2, 0.6 * a, 0.3, false, t * 1.6);
  F.ring(x, by, 80 * s, GOLD, 0.5 * a, 0.3, false, -t * 1.6 + 1.2);
  for (let i = 0; i < 6; i++) { const an = t * 1.8 + (i / 6) * TAU; F.sprite(C.Seal, x + Math.cos(an) * 84 * s, by + Math.sin(an) * 30 * s - Math.sin(an * 2 + i) * 14, 20 * s, 20 * s, 0, GOLD2, (0.55 + 0.35 * Math.sin(an)) * a); }
  F.ground(C.Lotus, x, y, 110 * s, t * 0.5, GOLD, 0.5 * a, 1, 0.5);
  F.ground(C.Rune, x, y, 150 * s, -t * 0.8, GOLD, 0.28 * a, 1, 0.5);
  F.beam(x, by + 50, x, by - 430, 80 * s, GOLD, 0.13 * a); F.beam(x, by + 50, x, by - 430, 16 * s, GOLD2, 0.2 * a);
}

// ------------------------------------------------------------------ 一线开天
function drawKaitian(F: FxSys, c: Combat, t: number, dt: number) {
  const k = c.ni.kt!, lift = c.game.player.st.lift || 0;
  const x0 = k.x + k.dx * 20, y0 = k.y - 46 - lift;
  if (!k.fired) {
    const u = Math.min(1, k.t / k.charge), L = k.len * (0.25 + 0.75 * u), x1 = x0 + k.dx * L, y1 = y0 + k.dy * L;
    F.beam(x0, y0, x1, y1, k.w * 2, [1, 0.9, 0.6], 0.05 + 0.08 * u);
    F.beam(x0, y0, x1, y1, 3 + 5 * u, WHITE, 0.35 + 0.55 * u);
    F.glow(x0, y0, 30 + 70 * u, GOLD2, 0.7); F.glow(x0, y0, 12 + 20 * u, WHITE, 0.95, C.Core);
    if (extOK()) F.sprite(C.KFlare, x0, y0, 160 + 260 * u, 40 + 40 * u, Math.atan2(k.dy, k.dx), GOLD2, 0.5 * u);
    for (let i = nEm(90, dt); i > 0; i--) { const a = rnd(0, TAU), r = rnd(120, 260); F.emit({ x: x0 + Math.cos(a) * r, y: y0 + Math.sin(a) * r * 0.7, vx: -Math.cos(a) * r * 3, vy: -Math.sin(a) * r * 2.1, life: 0.32, s0: rnd(3, 6), s1: 1, c: Math.random() < 0.5 ? WHITE : GOLD2, a: 0.9, stretch: 0.04 }); }
    if (Math.random() < dt * 22) { const d = rnd(0, L); F.bolt(x0 + k.dx * d, y0 + k.dy * d, x0 + k.dx * (d + 90), y0 + k.dy * (d + 90), Math.random() * 1e6, 16, 1.2, GOLD2, 0.8, 6, false); }
    return;
  }
  const f = Math.min(1, (k.t - k.charge) / 0.9), x1 = x0 + k.dx * k.len, y1 = y0 + k.dy * k.len, a = Math.pow(1 - f, 1.3), w = k.w * (1 - f * 0.55);
  F.beam(x0, y0, x1, y1, w * 4.2, [0.75, 0.6, 1], 0.3 * a);
  F.beam(x0, y0, x1, y1, w * 2.2, GOLD, 0.6 * a);
  F.beam(x0, y0, x1, y1, w * 0.9, WHITE, 0.95 * a);
  if (f < 0.6) for (let i = 0; i < 3; i++) F.bolt(x0, y0, x1, y1, Math.floor(t * 40) * 13 + i * 71, 46, 2.6, GOLD2, 0.9 * a, 22, true);
  F.glow(x0, y0, 150 * a + 40, GOLD2, 0.8 * a); F.glow(x1, y1, 120, GOLD2, 0.6 * a);
  for (let i = nEm(240 * a, dt); i > 0; i--) { const d = rnd(0, k.len); F.emit({ x: x0 + k.dx * d + rnd(-w, w) * 0.5, y: y0 + k.dy * d + rnd(-w, w) * 0.5, vx: rnd(-90, 90), vy: -rnd(40, 300), life: rnd(0.4, 0.9), s0: rnd(3, 7), s1: 1, c: Math.random() < 0.5 ? WHITE : GOLD, a: 0.95, stretch: 0.03 }); }
}

// ------------------------------------------------------------------ 水遁
const wake: [number, number][] = [];
let ripT = 0;
function drawWater(F: FxSys, c: Combat, t: number, dt: number) {
  const w = c.ni.wd!, p = c.game.player, x = p.x, y = p.y;
  const sp = Math.hypot(p.st.vx, p.st.vy), ux = sp > 1 ? p.st.vx / sp : 0, uy = sp > 1 ? p.st.vy / sp : 0;
  if (!w.inW) {   // 还没入水：三滴水珠绕身
    wake.length = 0;
    for (let i = 0; i < 3; i++) { const a = t * 3 + (i / 3) * TAU, ax = x + Math.cos(a) * 46, ay = y - 50 + Math.sin(a) * 16; F.glow(ax, ay, 7, WATER, 0.85, C.Dot); F.glow(ax, ay, 16, WATER, 0.3); }
    return;
  }
  const last = wake[wake.length - 1];
  if (last && Math.hypot(x - last[0], y - last[1]) > 400) wake.length = 0;
  if (!wake.length || Math.hypot(x - wake[wake.length - 1][0], y - wake[wake.length - 1][1]) > 12) wake.push([x, y]);
  if (wake.length > 30) wake.shift();
  const sea = w.kind === 'sea', deep: RGB = sea ? [0.35, 0.6, 0.95] : [0.5, 0.78, 1];
  const n = wake.length;
  if (n >= 2) {   // 人字形水线：越靠后越向两侧分开
    const L: [number, number][] = [], R: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = wake[Math.max(0, i - 1)], b = wake[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
      const spread = (n - 1 - i) * 3.4 + 6;
      L.push([wake[i][0] + nx * spread, wake[i][1] + ny * spread * 0.7]); R.push([wake[i][0] - nx * spread, wake[i][1] - ny * spread * 0.7]);
    }
    F.trail(wake, 46, deep, 0.32, C.Beam, 1, 0.8);
    F.trail(L, 9, WHITE, 0.6, C.Beam, 1, 0.8); F.trail(R, 9, WHITE, 0.6, C.Beam, 1, 0.8);
    F.trail(wake, 12, [0.9, 0.97, 1], 0.5, C.Beam, 1, 0.9);
  }
  // 水线裹身
  F.glow(x, y - 30, 80, deep, 0.32);
  for (let i = 0; i < 3; i++) F.sprite(C.Swirl, x, y - 16 - i * 22, 120 - i * 26, 46 - i * 8, t * (7 + i * 2) + i, i ? WATER : deep, 0.42 - i * 0.08, 0.7);
  if (sp > 60) {
    F.sprite(C.Water, x + ux * 30, y - 14 + uy * 18, 84, 56, 0, [0.9, 0.97, 1], 0.8);
    for (let i = nEm(sea ? 90 : 70, dt); i > 0; i--) F.emit({ x: x + rnd(-14, 14), y: y - rnd(0, 18), vx: -ux * sp * 0.25 + rnd(-110, 110), vy: -uy * sp * 0.1 - rnd(90, 330), life: rnd(0.35, 0.7), s0: rnd(3, 7), s1: 2, c: Math.random() < 0.5 ? WHITE : WATER, a: 0.9, cell: C.Dot, grav: 1000, stretch: 0.02 });
    ripT -= dt; if (ripT <= 0) { ripT = 0.16; F.shockRing(x - ux * 20, y - uy * 14, 70, WATER, 0.6, 0.5, 0.45); }
    if (sea && Math.random() < dt * 5) F.emit({ x: x - ux * 40, y: y - 30, vx: -ux * 60, vy: -120, life: 0.6, s0: 50, s1: 130, c: [0.85, 0.95, 1], a: 0.4, cell: C.Water, rot: 0, grav: 260 });
  } else if (Math.random() < dt * 3) F.shockRing(x, y, 60, WATER, 0.8, 0.5, 0.35);
  if (w.t < 2.5) dots(F, x, y - 150, w.t / 2.5, WATER);
}

// ------------------------------------------------------------------ 秘术随身光效（主角与敌修共用）
function aura(F: FxSys, k: string, x: number, y: number, by: number, t: number, dt: number, ux: number, uy: number, sp: number, s: number) {
  switch (k) {
    case 'feixue': case 'xue': {   // 沸血遁：血焰裹身、血线后掠、血珠滴落
      F.glow(x, by, 74 * s, BLOOD, 0.3);
      F.ground(C.FireRing, x, y, 58 * s, t * 3, BLOOD, 0.5, 1, 0.5);
      for (let i = nEm(46, dt); i > 0; i--) F.emit({ x: x + rnd(-16, 16), y: by + rnd(-30, 36), vx: -ux * sp * 0.2 + rnd(-30, 30), vy: -uy * sp * 0.2 - rnd(30, 140), life: rnd(0.3, 0.6), s0: rnd(14, 26) * s, s1: 3, c: Math.random() < 0.3 ? [1, 0.5, 0.4] : BLOOD, a: 0.7, cell: fireCell(), rot: 0, drag: 2 });
      if (sp > 120) for (let i = nEm(30, dt); i > 0; i--) F.emit({ x: x + rnd(-26, 26), y: by + rnd(-40, 40), vx: -ux * sp * 0.6, vy: -uy * sp * 0.6, life: 0.22, s0: 2.6, s1: 1, c: [1, 0.6, 0.55], a: 0.8, stretch: 0.07 });
      if (Math.random() < dt * 10) F.emit({ x, y: by, vx: rnd(-80, 80), vy: rnd(-40, 80), life: 0.6, s0: 4, s1: 1, c: [0.8, 0.05, 0.08], a: 1, add: 0.2, cell: C.Dot, grav: 700 });
      break;
    }
    case 'liemai': case 'lie': {   // 裂脉诀：周身赤纹乱窜、火气升腾
      const O: RGB = [1, 0.5, 0.2];
      F.glow(x, by, 70 * s, O, 0.26 + 0.08 * Math.sin(t * 12));
      F.ground(C.FireRing, x, y, 66 * s, -t * 2.4, O, 0.5, 1, 0.5);
      if (Math.random() < dt * 26) { const a = rnd(0, TAU), r = rnd(14, 40); F.bolt(x + Math.cos(a) * 8, by + Math.sin(a) * 20, x + Math.cos(a) * r, by + Math.sin(a) * r * 1.5, Math.random() * 1e6, 9, 1.4, [1, 0.3, 0.14], 0.95, 5, false); }
      for (let i = nEm(26, dt); i > 0; i--) F.emit({ x: x + rnd(-20, 20), y: by + rnd(-10, 40), vx: rnd(-20, 20), vy: -rnd(60, 200), life: rnd(0.3, 0.6), s0: rnd(10, 20) * s, s1: 3, c: O, a: 0.75, cell: fireCell(), rot: 0 });
      break;
    }
    case 'guyuan': case 'gu': {   // 鼓元术：青金光罩一鼓一缩、足下生莲
      const G1: RGB = [0.62, 0.95, 0.55], pu = Math.sin(t * 5);
      F.glow(x, by, (84 + 12 * pu) * s, G1, 0.24);
      F.sprite(C.RingSoft, x, by, (140 + 16 * pu) * s, (190 + 20 * pu) * s, 0, G1, 0.3);
      F.ground(C.Lotus, x, y, 80 * s, t * 0.6, G1, 0.4, 1, 0.5);
      for (let i = nEm(14, dt); i > 0; i--) F.emit({ x: x + rnd(-40, 40), y: y - rnd(0, 30), vx: rnd(-20, 20), vy: -rnd(60, 160), life: rnd(0.7, 1.2), s0: rnd(8, 12), s1: 4, c: [0.5, 0.82, 0.4], a: 0.9, add: 0.2, cell: C.Leaf, rot: rnd(0, TAU), vr: rnd(-5, 5) });
      break;
    }
    case 'guixi': case 'gui': {   // 玄龟闭息：龟甲纹罩、甲片绕身
      const S1: RGB = [0.86, 0.76, 0.5];
      F.ground(C.Bagua, x, y, 92 * s, t * 0.3, S1, 0.5, 1, 0.5);
      F.sprite(C.RingSoft, x, by, 150 * s, 160 * s, 0, S1, 0.34);
      F.sprite(C.Rune, x, by, 136 * s, 136 * s, t * 0.4, S1, 0.2);
      F.sprite(C.Ring, x, by, 140 * s, 150 * s, 0, [1, 0.92, 0.7], 0.55);
      for (let i = 0; i < 6; i++) { const a = -t * 0.9 + (i / 6) * TAU; F.sprite(C.Shard, x + Math.cos(a) * 70 * s, by + Math.sin(a) * 40 * s, 26 * s, 20 * s, a, S1, 0.5 + 0.3 * Math.sin(a), 0.4); }
      break;
    }
    case 'shui': {   // 敌修的沧浪遁
      F.glow(x, by + 20, 60, WATER, 0.3);
      for (let i = nEm(40, dt); i > 0; i--) F.emit({ x: x + rnd(-14, 14), y: y - rnd(0, 18), vx: rnd(-110, 110), vy: -rnd(90, 300), life: rnd(0.35, 0.7), s0: rnd(3, 6), s1: 2, c: Math.random() < 0.5 ? WHITE : WATER, a: 0.9, cell: C.Dot, grav: 1000 });
      F.sprite(C.Swirl, x, y - 20, 100, 40, t * 8, WATER, 0.4, 0.7);
      break;
    }
  }
}

export function drawNitianGL(F: FxSys, c: Combat, t: number, dt: number) {
  const ni = c.ni; if (!ni) return;
  const g = c.game, p = g.player, lift = p.st.lift || 0, x = p.x, y = p.y - lift, by = y - 46;
  if (ni.evq.length) { const q = ni.evq; ni.evq = []; for (const ev of q) burst(F, ev, Math.abs(ev.x - p.x) + Math.abs(ev.y - p.y) < 2 ? lift : 0); }
  if (ni.booms.length) drawBooms(F, ni.booms);
  if (ni.stasisT > 0) drawStasis(F, c, t);
  if (ni.invT > 0) {
    const a = Math.min(1, (ni.invMax - ni.invT) / 0.25) * (ni.invT < 1 ? 0.6 + 0.4 * Math.sin(t * 24) : 1);   // 将尽时闪烁示警
    shell(F, x, y, by, t, a);
    for (let i = nEm(30, dt); i > 0; i--) F.emit({ x: x + rnd(-50, 50), y: y - rnd(0, 40), vx: rnd(-10, 10), vy: -rnd(90, 260), life: rnd(0.6, 1.1), s0: rnd(3, 6), s1: 1, c: GOLD2, a: 0.9, cell: Math.random() < 0.3 ? C.Star : C.Glow });
    dots(F, x, y - 150, ni.invT / Math.max(0.01, ni.invMax), GOLD2);
  }
  if (ni.kt) drawKaitian(F, c, t, dt);
  if (ni.wd) drawWater(F, c, t, dt); else if (wake.length) wake.length = 0;
  if (ni.mods.length) {
    const now = g.time, sp = Math.hypot(p.st.vx, p.st.vy), ux = sp > 1 ? p.st.vx / sp : 0, uy = sp > 1 ? p.st.vy / sp : 0;
    let bad = false;
    for (const m of ni.mods) { if (now < m.from || now >= m.until) continue; if (m.bad) bad = true; else aura(F, m.id, x, y, by, t, dt, ux, uy, sp, 1); }
    if (bad) {   // 代价期：周身晦暗、浊气下沉
      F.glow(x, by, 62, [0.3, 0.26, 0.36], 0.14);
      if (Math.random() < dt * 9) F.emit({ x: x + rnd(-24, 24), y: by - rnd(-10, 40), vx: 0, vy: rnd(30, 70), life: rnd(0.5, 0.9), s0: rnd(3, 5), s1: 1, c: [0.55, 0.5, 0.65], a: 0.7, cell: C.Dot, grav: 160 });
    }
  }
  // 敌修
  for (const e of c.units) {
    if (e.dead || e.def.kind !== 'human' || Math.abs(e.x - p.x) > 1500 || Math.abs(e.y - p.y) > 1100) continue;
    const st = ni.fs.get(e); if (!st) continue;
    const ey = e.y - (e.flyH || 0), eby = ey - 46;
    if (st.k && st.ph === 0) { const sp = Math.hypot(e.mvx, e.mvy); aura(F, st.k, e.x, ey, eby, t, dt, sp > 1 ? e.mvx / sp : 0, sp > 1 ? e.mvy / sp : 0, sp, 0.9); }
    if (st.inv > 0) shell(F, e.x, ey, eby, t, Math.min(1, st.inv / 0.3), 0.95);
  }
}
