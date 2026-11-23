// 野外破坏的画面（world/wreck.ts 的特效）：冲击波一圈的尘浪和飞土、锥形的尘柱、直线的一路扬尘、树倒地的一团尘和落叶、
// 拔起石头树木的土块、碎石落地的尘、分海的深沟与两侧水墙。
// 用户的话（交接文档、记忆）：云雾、尘、光晕只做点缀，散得快，别留一屏灰雾、别糊住人和房子——所以尘都淡、都短命（一息以内），
// 光只在重击那一下闪一闪。夜里特效层不受夜色压暗，尘和土块的颜色按天光自己压暗。
// 随机数用自己的序列（不碰 Math.random）。
import type { Combat } from '../world/combat';
import type { WreckFx, WreckSplit } from '../world/wreck';
import type { TWFx } from '../world/townwreck';
import { splitOpen } from '../world/wreck';
import { FxSys, RGB, mixc, extOK } from './fx';
import { C } from './atlas';
import { mulberry32 } from '../core/rng';

const TAU = Math.PI * 2;
const R0 = mulberry32(0x5a11d);
const rnd = (a: number, b: number) => a + R0() * (b - a);
const SMOKES = [C.KSmoke1, C.KSmoke2, C.KSmoke3];
const smoke = () => (extOK() ? SMOKES[(R0() * 3) | 0] : C.Smoke);
const DUST: RGB = [0.34, 0.29, 0.22], CLOD: RGB = [0.33, 0.26, 0.19], LEAF: RGB = [0.32, 0.42, 0.2], WARM: RGB = [1, 0.86, 0.62];
const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

/** 每帧（combatgl.drawCombatGL 调）：取走这一帧的事件、画劈开的水沟和飞着的东西的影子 */
export function drawWreckGL(F: FxSys, c: Combat, t: number, dt: number) {
  const W = c.wreck; if (!W) return;
  const lk = 0.4 + 0.6 * Math.max(0, Math.min(1, c.game.light * 1.4));   // 夜里压暗（特效层不吃夜色）
  if (W.fx.length) { for (const e of W.fx) event(F, e, lk); W.fx.length = 0; }
  const T = W.town; if (T?.fx.length) { for (const e of T.fx) townEvent(F, e, lk); T.fx.length = 0; }   // 城镇破坏（world/townwreck.ts）
  for (const s of W.splits) drawSplit(F, c, s, t, dt, lk);
  F.B.billboard = null;
  for (const cr of W.carries) {
    if (cr.st === 'done' || cr.z < 6) continue;
    F.ground(C.Disc, cr.x, cr.y, cr.size * (1.1 - Math.min(0.6, cr.z / 1200)), 0, [0.05, 0.04, 0.03], 0.3 * (1 - Math.min(0.7, cr.z / 1400)), 0, 0.5);
    if (cr.st === 'fly' && R0() < dt * 30) { F.B.billboard = { x: cr.x, y: cr.y }; F.emit({ x: cr.x + rnd(-20, 20), y: cr.y - cr.z - rnd(0, cr.size), vx: rnd(-40, 40), vy: rnd(-20, 30), life: rnd(0.3, 0.5), s0: rnd(14, 22), s1: 40, c: scale(DUST, lk), a: 0.18, add: 0, cell: smoke(), drag: 2 }); F.B.billboard = null; }
  }
}

function event(F: FxSys, e: WreckFx, lk: number) {
  const p = e.p, dust = scale(DUST, lk), clod = scale(CLOD, lk);
  F.B.billboard = null;
  switch (e.k) {
    case 'radial': {
      const r = e.r ?? 300, crack = e.c === 1;
      // 贴地两圈冲击环（尘色，不发光），屏幕一下扭曲
      F.shockRing(e.x, e.y, r * (crack ? 0.8 : 0.95), dust, 0.42, 0.55, 0.42, true);
      F.shockRing(e.x, e.y, r * 1.45, dust, 0.6, 0.55, 0.22, true);
      if (p >= 1.5) F.shock(e.x, e.y, r * 1.8, 8 + p * 4, 0.42);
      F.B.billboard = { x: e.x, y: e.y };
      // 飞土：从坑沿往外崩、带旋转（重力拉回来，一息内落地）
      const n = Math.min(40, Math.round(8 + p * 7));
      for (let i = 0; i < n; i++) { const a = R0() * TAU, d = r * rnd(0.05, 0.3), v = rnd(160, 300 + p * 120); F.emit({ x: e.x + Math.cos(a) * d, y: e.y - 8, vx: Math.cos(a) * v, vy: -rnd(240, 420 + p * 110), life: rnd(0.55, 1.0), s0: rnd(5, 9 + p * 2), s1: 3, c: mixc(clod, [1, 1, 1], rnd(0, 0.12)), a: 0.95, add: 0, grav: 1700, drag: 0.5, cell: C.Shard, rot: a, vr: rnd(-12, 12) }); }
      // 尘：几团贴地往外推的淡尘，散得快
      const m = Math.min(12, Math.round(3 + p * 1.8));
      for (let i = 0; i < m; i++) { const a = i / m * TAU + rnd(-0.3, 0.3), d = r * rnd(crack ? 0.5 : 0.25, crack ? 0.8 : 0.55); F.emit({ x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d * 0.7 - 10, vx: Math.cos(a) * rnd(160, 300), vy: Math.sin(a) * rnd(60, 120) - 20, life: rnd(0.55, 0.9), s0: rnd(30, 46), s1: rnd(80, 120), c: dust, a: 0.2, add: 0, cell: smoke(), drag: 2.6, rot: R0() * TAU }); }
      if (p >= 3) { F.flash(e.x, e.y - 30, 18 + p * 4, mixc(WARM, [1, 1, 1], 0.4), 0.1); F.sparks(e.x, e.y - 20, WARM, Math.round(6 + p * 3), 700, 0.3, 2.6); }
      break;
    }
    case 'cone': {
      const L = e.r ?? 500, half = e.half ?? 0.5, dir = e.dir ?? 0;
      F.shockRing(e.x, e.y, 90 + p * 20, dust, 0.3, 0.55, 0.4, true);
      if (p >= 1.5) F.shock(e.x + Math.cos(dir) * L * 0.4, e.y + Math.sin(dir) * L * 0.4, L * 0.9, 8 + p * 3, 0.38);
      // 顺着锥往外喷的尘柱：贴着地面往外推（速度在地面上），越远越淡
      const n = Math.min(26, Math.round(8 + p * 5));
      for (let i = 0; i < n; i++) {
        const a = dir + rnd(-half, half), d0 = rnd(20, L * 0.25), v = L * rnd(0.9, 1.5);
        F.emit({ x: e.x + Math.cos(a) * d0, y: e.y + Math.sin(a) * d0, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.45, 0.75), s0: rnd(24, 36), s1: rnd(70, 110), c: dust, a: 0.18, add: 0, cell: smoke(), drag: 2.2, rot: R0() * TAU, z: -16, groundMotion: true });
      }
      // 地上被掀起的土块和草屑
      for (let i = 0; i < Math.min(24, 6 + p * 4); i++) {
        const a = dir + rnd(-half, half), d0 = rnd(30, L * 0.8), x = e.x + Math.cos(a) * d0, y = e.y + Math.sin(a) * d0;
        F.B.billboard = { x, y };
        F.emit({ x, y: y - 6, vx: Math.cos(a) * rnd(180, 380), vy: -rnd(200, 420), life: rnd(0.5, 0.9), s0: rnd(4, 8), s1: 2, c: i % 3 ? clod : scale(LEAF, lk), a: 0.95, add: 0, grav: 1600, cell: i % 3 ? C.Shard : C.Leaf, rot: a, vr: rnd(-10, 10) });
      }
      F.B.billboard = null;
      break;
    }
    case 'line': {
      const x2 = e.x2 ?? e.x, y2 = e.y2 ?? e.y, L = Math.hypot(x2 - e.x, y2 - e.y) || 1, ux = (x2 - e.x) / L, uy = (y2 - e.y) / L, w = e.r ?? 120;
      const n = Math.min(30, Math.max(4, Math.round(L / 70)));
      for (let i = 0; i < n; i++) {
        const u = (i + R0()) / n, x = e.x + (x2 - e.x) * u, y = e.y + (y2 - e.y) * u, s = R0() < 0.5 ? -1 : 1;
        F.B.billboard = { x, y };
        F.emit({ x: x - uy * s * w * 0.3, y: y + ux * s * w * 0.2 - 10, vx: -uy * s * rnd(80, 200) + ux * 60, vy: -rnd(20, 70), life: rnd(0.5, 0.8), s0: rnd(26, 38), s1: rnd(70, 100), c: dust, a: 0.2, add: 0, cell: smoke(), drag: 2.4, rot: R0() * TAU });
        for (let k = 0; k < 2; k++) F.emit({ x, y: y - 6, vx: -uy * s * rnd(150, 320) + ux * rnd(-40, 120), vy: -rnd(200, 420) * Math.min(1.4, 0.6 + p * 0.25), life: rnd(0.5, 0.9), s0: rnd(4, 8), s1: 2, c: clod, a: 0.95, add: 0, grav: 1600, cell: C.Shard, rot: R0() * TAU, vr: rnd(-10, 10) });
      }
      F.B.billboard = null;
      if (p >= 1.5) F.shock((e.x + x2) / 2, (e.y + y2) / 2, L * 0.6, 6 + p * 3, 0.36);
      break;
    }
    case 'fell': {
      // 树冠砸在地上：一团贴地的尘、几片落叶慢慢飘下、一圈很淡的尘环
      const r = (e.r ?? 120) * 0.6, dir = e.dir ?? 0;
      F.shockRing(e.x, e.y, r * 1.6, dust, 0.4, 0.55, 0.22, true);
      F.B.billboard = { x: e.x, y: e.y };
      for (let i = 0; i < (p >= 1 ? 4 : 2); i++) { const a = dir + rnd(-1.6, 1.6); F.emit({ x: e.x + Math.cos(a) * r * 0.4, y: e.y - 14, vx: Math.cos(a) * rnd(70, 150), vy: rnd(-40, -10), life: rnd(0.5, 0.8), s0: rnd(24, 34), s1: rnd(60, 90), c: dust, a: 0.18, add: 0, cell: smoke(), drag: 2.4, rot: R0() * TAU }); }
      for (let i = 0; i < (p >= 1 ? 9 : 4); i++) F.emit({ x: e.x + rnd(-r, r), y: e.y - rnd(20, 70), vx: rnd(-60, 60), vy: rnd(-90, -30), life: rnd(0.9, 1.5), s0: rnd(5, 8), s1: 4, c: mixc(scale(LEAF, lk), [0.5, 0.42, 0.2], R0() * 0.5), a: 0.9, add: 0, grav: 160, drag: 1.4, cell: C.Leaf, rot: R0() * TAU, vr: rnd(-6, 6) });
      F.B.billboard = null;
      break;
    }
    case 'uproot': case 'chunk': {
      const r = e.r ?? 60, big = e.k === 'uproot';
      F.B.billboard = { x: e.x, y: e.y };
      for (let i = 0; i < (big ? 16 : 4); i++) { const a = R0() * TAU; F.emit({ x: e.x + Math.cos(a) * r * 0.5, y: e.y - 6, vx: Math.cos(a) * rnd(60, 220), vy: -rnd(big ? 260 : 120, big ? 520 : 260), life: rnd(0.5, 0.9), s0: rnd(4, 9), s1: 2, c: clod, a: 0.95, add: 0, grav: 1600, cell: C.Shard, rot: a, vr: rnd(-10, 10) }); }
      for (let i = 0; i < (big ? 4 : 1); i++) F.emit({ x: e.x + rnd(-r, r) * 0.5, y: e.y - 10, vx: rnd(-80, 80), vy: rnd(-40, -10), life: rnd(0.45, 0.7), s0: rnd(20, 30), s1: rnd(50, 80), c: dust, a: big ? 0.2 : 0.14, add: 0, cell: smoke(), drag: 2.4, rot: R0() * TAU });
      F.B.billboard = null;
      if (big) F.shockRing(e.x, e.y, r * 2, dust, 0.35, 0.55, 0.3, true);
      break;
    }
    case 'land': {
      F.flash(e.x, e.y - 40, 14 + p * 4, mixc(WARM, [1, 1, 1], 0.4), 0.08);
      break;
    }
    case 'split': case 'close': {
      // 劈开那一下：沿线往两边炸开的水花；合拢那一下：两边的水往中间拍，水沫往上溅
      const x2 = e.x2 ?? e.x, y2 = e.y2 ?? e.y, L = Math.hypot(x2 - e.x, y2 - e.y) || 1, ux = (x2 - e.x) / L, uy = (y2 - e.y) / L, w = e.r ?? 260;
      const n = Math.min(36, Math.max(6, Math.round(L / 60))), close = e.k === 'close';
      const FOAM: RGB = scale([0.9, 0.96, 1], lk), SEA: RGB = scale([0.5, 0.72, 0.86], lk);
      for (let i = 0; i < n; i++) {
        const u = (i + R0()) / n, x = e.x + (x2 - e.x) * u, y = e.y + (y2 - e.y) * u, s = R0() < 0.5 ? -1 : 1;
        const bx = x - uy * s * w * (close ? 0.5 : 0.2), by = y + ux * s * w * (close ? 0.35 : 0.14);
        F.B.billboard = { x: bx, y: by };
        for (let k = 0; k < 2; k++) F.emit({ x: bx, y: by - 10, vx: -uy * s * rnd(60, 220) * (close ? -1 : 1), vy: -rnd(260, 620), life: rnd(0.6, 1.0), s0: rnd(4, 8), s1: 2, c: k ? SEA : FOAM, a: 0.9, add: 0, grav: 1400, cell: C.Glow });
      }
      F.B.billboard = null;
      F.shock((e.x + x2) / 2, (e.y + y2) / 2, L * 0.7, close ? 10 : 16, 0.45);
      break;
    }
  }
  F.B.billboard = null;
}

/**
 * 城镇破坏的特效：小件碎了（木屑、布条、一小团尘）、房子挨打（几片瓦掉下来）、掉档（一阵瓦雨和尘，半塌的多）、
 * 城墙挨打（碎砖、一团黑烟）、工匠敲打（几粒木屑）、修好（几点暖光往上飘、一圈很淡的光环）。都淡、都短命，不留一街灰雾。
 */
const WOODC: RGB = [0.42, 0.3, 0.19], TILEC: RGB = [0.3, 0.32, 0.35], BRICK: RGB = [0.45, 0.42, 0.38], SOOT: RGB = [0.08, 0.07, 0.06];
function townEvent(F: FxSys, e: TWFx, lk: number) {
  const dust = scale(DUST, lk), p = e.p, r = e.r;
  F.B.billboard = { x: e.x, y: e.y };
  const shards = (n: number, y0: number, c: RGB, spread: number, up: number) => { for (let i = 0; i < n; i++) { const a = R0() * TAU; F.emit({ x: e.x + Math.cos(a) * spread * rnd(0.2, 1), y: e.y - y0 - rnd(0, 30), vx: Math.cos(a) * rnd(60, 220), vy: -rnd(up * 0.4, up), life: rnd(0.55, 0.95), s0: rnd(4, 8), s1: 2, c: scale(mixc(c, [1, 1, 1], rnd(0, 0.15)), lk), a: 0.95, add: 0, grav: 1500, drag: 0.4, cell: C.Shard, rot: a, vr: rnd(-12, 12) }); } };
  const puff = (n: number, y0: number, s: number, c: RGB, a: number) => { for (let i = 0; i < n; i++) F.emit({ x: e.x + rnd(-r, r) * 0.5, y: e.y - y0 - rnd(0, 20), vx: rnd(-70, 70), vy: rnd(-50, -10), life: rnd(0.45, 0.8), s0: s * rnd(0.8, 1.1), s1: s * rnd(2, 2.6), c, a, add: 0, cell: smoke(), drag: 2.4, rot: R0() * TAU }); };
  switch (e.k) {
    case 'break': shards(Math.min(16, 6 + Math.round(p * 3)), 30, WOODC, r * 0.6, 340); puff(2, 10, 24, dust, 0.16); break;
    case 'hit': shards(4 + Math.round(p * 2), 160, TILEC, r * 0.4, 160); puff(1, 60, 26, dust, 0.14); break;
    case 'tier': {
      const half = p >= 2;
      shards(half ? 20 : 9, 180, TILEC, r * 0.5, 200); shards(half ? 8 : 0, 150, WOODC, r * 0.4, 160);
      puff(half ? 5 : 2, half ? 140 : 120, half ? 40 : 30, dust, half ? 0.2 : 0.16);
      if (half) F.shockRing(e.x, e.y, r * 1.1, dust, 0.4, 0.55, 0.2, true);
      break;
    }
    case 'wall': shards(10, 100, BRICK, 50, 260); puff(2, 100, 30, scale(SOOT, 1), 0.22); break;
    case 'knock': shards(2, 120, WOODC, 30, 120); break;
    case 'fresh': {
      const WARMC = mixc(WARM, [1, 1, 1], 0.3);
      for (let i = 0; i < 12; i++) F.emit({ x: e.x + rnd(-r, r) * 0.6, y: e.y - rnd(40, 200), vx: rnd(-20, 20), vy: -rnd(40, 90), life: rnd(0.8, 1.4), s0: rnd(3, 6), s1: 1, c: WARMC, a: 0.85, add: 1, drag: 0.8, cell: C.Glow });
      F.shockRing(e.x, e.y, r * 1.2, mixc(WARM, [1, 1, 1], 0.5), 0.6, 0.55, 0.16, true);
      break;
    }
  }
  F.B.billboard = null;
}

/** 劈开的水沟：沟里一道深色的水（贴水面）、沟沿两道白沫、两侧立起的水墙（一片片竖着的水幕连成墙，上沿翻着白沫、水幕上有往下淌的白纹），合拢时水墙往中间倒 */
function drawSplit(F: FxSys, c: Combat, s: WreckSplit, t: number, dt: number, lk: number) {
  const L = Math.hypot(s.x1 - s.x0, s.y1 - s.y0) || 1, ux = (s.x1 - s.x0) / L, uy = (s.y1 - s.y0) / L, nx = -uy, ny = ux;
  const n = Math.max(4, Math.min(44, Math.round(L / 70))), w = s.w, step = L / n, closing = Math.max(0, (s.t - (s.dur - 0.7)) / 0.7);
  const deep = scale(s.pal.deep, lk), mid = scale(s.pal.mid, lk), foam = scale(s.pal.foam, lk), body = mixc(mid, foam, 0.18), dark = mixc(deep, mid, 0.35);
  const B = c.brawl;
  const wet = (x: number, y: number, r: number) => B.deepWater(x, y) && B.deepWater(x + nx * r, y + ny * r) && B.deepWater(x - nx * r, y - ny * r) && B.deepWater(x + ux * r * 0.7, y + uy * r * 0.7) && B.deepWater(x - ux * r * 0.7, y - uy * r * 0.7);
  F.B.billboard = null;
  // 沟：贴水面的深色（整圈都在水上才铺，不漫到岸上）、沟沿的白沫
  for (let i = 0; i <= n; i++) {
    const u = i / n, k = splitOpen(s, u); if (k <= 0.02) continue;
    const px = s.x0 + (s.x1 - s.x0) * u, py = s.y0 + (s.y1 - s.y0) * u, r = w * 0.6 * k;
    if (!wet(px, py, r)) continue;
    if (i % 2 === 0) F.ground(C.Disc, px, py, r, 0, deep, 0.7 * k, 0, 0.5);
    else for (const sd of [-1, 1]) F.ground(C.Glow, px + nx * sd * w * 0.5, py + ny * sd * w * 0.5, w * 0.18, 0, foam, 0.5 * k, 0, 0.5);
  }
  // 水墙：每一段一片竖着的水幕（暗底、水身、往下淌的白纹），上沿一团白沫；合拢时往沟心倒
  const H0 = 150 + s.p * 48, wW = step * 2.4;
  for (let i = 0; i <= n; i++) {
    const u = i / n, k = splitOpen(s, u); if (k <= 0.02) continue;
    const px = s.x0 + (s.x1 - s.x0) * u, py = s.y0 + (s.y1 - s.y0) * u;
    for (const sd of [-1, 1]) {
      const off = w * (0.5 + 0.06 * (1 - k)), x = px + nx * sd * off, y = py + ny * sd * off;
      if (!B.deepWater(x, y) || !B.deepWater(x + nx * sd * 60, y + ny * sd * 60)) continue;
      const H = H0 * k * (1 + 0.1 * Math.sin(t * 5 + i * 1.3 + sd));
      // 往外微微翻、合拢时往沟心倒：倒的方向是这一侧指向沟心的方向在画面上的横向分量（立板平面里只能左右倒）
      const inward = -sd * (nx >= 0 ? 1 : -1), lean = (0.15 * (1 - closing) * -inward + 0.9 * closing * inward) * H;
      F.B.billboard = { x, y };
      F.beam(x, y + 8, x + lean, y - H, wW * 1.25, dark, 0.55 * k, C.Beam, 0);
      F.beam(x, y + 6, x + lean * 0.95, y - H + 12, wW, body, 0.6 * k, C.Beam, 0);
      for (const q of [-0.22, 0.18]) F.beam(x + wW * q * 0.3, y + 4, x + lean * 0.9 + wW * q * 0.25, y - H + 30, wW * 0.12, foam, 0.32 * k, C.Beam, 0);
      F.sprite(C.Water, x + lean, y - H + 4, wW * 0.9, 40 + H * 0.12, 0, foam, 0.7 * k, 0);
      if (R0() < dt * 5) F.emit({ x: x + lean, y: y - H, vx: rnd(-60, 60), vy: -rnd(60, 200), life: rnd(0.5, 0.8), s0: rnd(4, 7), s1: 2, c: foam, a: 0.9, add: 0, grav: 1300, cell: C.Glow });
    }
  }
  F.B.billboard = null;
}
