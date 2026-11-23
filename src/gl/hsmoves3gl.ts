// 撼山客招式第三批的画面（world/hsmoves3.ts）：一拳破界的冲天光柱和流星、天上的符文涟漪、借星的陨石与超高速追击线、
// 无极一击的拳压（地上一路犁开、云被拳压推开一条缝、远山缺口处碎石冲天）、千钧坠的巨坑、分海的水线，以及蓄劲、预警。
// 后期：天地变黑白（stage.ts 的 uMono）、远山缺口（hd2d/scene.ts 的 uNotch）、定格特写（这里的 DOM 叠层，只动 transform / opacity）。
//
// 守着近战画面的老规矩：加色的光都短命、偏小；尘、云、水用普通混合；散得快，不糊住人和能玩的地方（云只在拳路两边、往外推开）。
// 凡是第一批（impactfx / impactgl）在做的共用打击表现，都用 // IMPACT: 标出，合并时换成共用的那一份。
// 画面这边也不取 Math.random：自己一个小随机序列（只影响样子）。
import type { Combat } from '../world/combat';
import type { Game } from '../world/game';
import type { Enemy } from '../world/combat';
import type { FxEvent } from './combatgl';
import { FxSys, col, mixc, RGB, FlightPoint, extOK } from './fx';
import { C } from './atlas';
import { K } from './fxbake';
import { decal } from './bakefx';
import { hs3Peek } from '../world/hsmoves3';
import { hsp2Peek } from '../world/hsp2';

const TAU = Math.PI * 2;
const WHITE: RGB = [1, 1, 1];
const GOLD: RGB = [1, 0.8, 0.45];
const DUST: RGB = [0.3, 0.25, 0.19];
const INK: RGB = [0.07, 0.06, 0.07];
const CLOUD: RGB = [0.88, 0.89, 0.9];
const SEA: RGB = [0.55, 0.82, 0.98], FOAM: RGB = [0.9, 0.97, 1];
let rs = 0x3a9e1;
const r01 = () => { rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0; return rs / 4294967296; };
const rnd = (a: number, b: number) => a + r01() * (b - a);
const smoke = () => (extOK() ? C.KSmoke1 + ((r01() * 3) | 0) : C.Smoke);

/** 这一批的事件名（combatgl 按这个转过来） */
export const HS3_EVENTS = new Set<string>(['hs3up', 'hs3hit', 'hs3ripple', 'hs3leap', 'hs3land', 'hs3rock', 'hs3gather', 'hs3wuji', 'hs3peak', 'hs3stomp', 'hs3split', 'hs3tremble']);

const NONE: { x: number; y: number; t: number; dur: number; w: number; col: string }[] = [];
const NONE_R: { e: unknown; x: number; y: number; z: number; t: number; fire: number; down: boolean }[] = [];
/** 贴地画 */
function flat(F: FxSys, fn: () => void) { const prev = F.B.billboard; F.B.billboard = null; fn(); F.B.billboard = prev; }

export function hs3Event(F: FxSys, ev: FxEvent) {
  const cc = col(ev.color ?? '255,214,150'), core = mixc(cc, WHITE, 0.6), p = ev.power ?? 1;
  switch (ev.k as string) {
    case 'hs3up': {
      // 冲天拳：脚下一圈尘浪，往上一道贯天的光、竖着的冲击环、往上喷的气流和火星
      flat(F, () => { F.shockRing(ev.x, ev.y, 160 + p * 40, DUST, 0.5, 0.55, 0.5, true); F.smokeRing(ev.x, ev.y, 140, DUST, 0.32, 0.8); decal(K.Crack, ev.x, ev.y, 60, 120 + p * 30, 4, [0.1, 0.08, 0.06], 0.6, { add: 0, sq: 0.5, rot: rnd(0, TAU), ease: 6, fin: 0.03 }); });
      F.B.billboard = { x: ev.x, y: ev.y };
      F.flash(ev.x, ev.y - 90, 30 + p * 6, core, 0.12);
      F.beam(ev.x, ev.y - 40, ev.x, ev.y - 1600, 60 + p * 10, cc, 0.18);
      F.beam(ev.x, ev.y - 40, ev.x, ev.y - 1600, 16, core, 0.6);
      for (let i = 0; i < 3; i++) F.shockRing(ev.x, ev.y - 120 - i * 120, 60 + i * 26, i ? cc : core, 0.22 + i * 0.06, 0.35, 0.7 - i * 0.18);
      for (let i = 0; i < 24 + p * 4; i++) { const a = -Math.PI / 2 + rnd(-0.28, 0.28), v = rnd(1400, 2600); F.emit({ x: ev.x + rnd(-14, 14), y: ev.y - 80, vx: Math.cos(a) * v * 0.6, vy: Math.sin(a) * v, life: rnd(0.15, 0.3), s0: rnd(3, 5), s1: 1, c: i % 3 ? WHITE : core, a: 0.85, drag: 4, stretch: 0.04, cell: C.Glow }); }
      F.shock(ev.x, ev.y - 60, 420, 14, 0.4);
      break;
    }
    case 'hs3hit': {
      // 重击命中：爆点、两层冲击环、全屏径向扭曲；顺着打的方向「背后炸开」一锥冲击波和气流（IMPACT: 背后冲击波，第一批的共用效果）
      const dir = ev.dir ?? 0, d = F.B.direction(Math.cos(dir), Math.sin(dir));
      F.flash(ev.x, ev.y, 22 + p * 7, core, 0.12);
      F.glint(ev.x, ev.y, 20 + p * 6, core, 0.85, 0.18);
      F.shockRing(ev.x, ev.y, 60 + p * 22, core, 0.24, 0.9, 0.75);
      F.shockRing(ev.x, ev.y, 120 + p * 36, cc, 0.42, 0.85, 0.35);
      F.shock(ev.x, ev.y, 600 + p * 140, 18 + p * 3, 0.45);
      F.rays(ev.x, ev.y, 90 + p * 25, cc, 0.32, 0.24);
      const ca = Math.cos(d), sa = Math.sin(d), L = 300 + p * 110;
      for (let i = 0; i < 3; i++) F.shockRing(ev.x + ca * L * (0.25 + i * 0.28), ev.y + sa * L * (0.25 + i * 0.28), 40 + i * 22 + p * 8, i ? cc : core, 0.2 + i * 0.06, 0.4, 0.65 - i * 0.15);
      for (let i = 0; i < 26 + p * 6; i++) { const a = d + rnd(-0.45, 0.45), v = rnd(1300, 2600); F.emit({ x: ev.x, y: ev.y + rnd(-10, 10), vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.8, life: rnd(0.12, 0.26), s0: rnd(3, 5.5), s1: 1, c: i % 3 ? WHITE : core, a: 0.85, drag: 5, stretch: 0.035, cell: C.Glow }); }
      if (extOK()) F.emit({ x: ev.x, y: ev.y, life: 0.18, s0: 60 + p * 10, s1: 140 + p * 30, c: cc, a: 0.5, cell: C.KBurst1, rot: d });
      break;
    }
    case 'hs3ripple': {
      // 穿过天穹：天上荡开一圈符文涟漪（压扁的圆环叠一圈符印、往外扩、淡出）
      const R = ev.r ?? 1200, z = 820;
      F.B.billboard = { x: ev.x, y: ev.y };
      const y = ev.y - z;
      F.shockRing(ev.x, y, R * 0.5, core, 0.9, 0.35, 0.55);
      F.shockRing(ev.x, y, R * 0.8, cc, 1.3, 0.35, 0.3);
      F.shockRing(ev.x, y, R * 1.1, cc, 1.6, 0.3, 0.22);
      if (extOK()) F.emit({ x: ev.x, y, life: 1.0, s0: R * 0.3, s1: R * 0.65, c: core, a: 0.2, cell: C.KCompass, rot: rnd(0, TAU), vr: 0.6 });   // r7-polish：罗盘纹小一号、淡一些（加色的，原来铺满半屏）
      for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, v = R * 0.7; F.emit({ x: ev.x + Math.cos(a) * R * 0.12, y: y + Math.sin(a) * R * 0.04, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.35, life: 0.9, s0: 18, s1: 6, c: core, a: 0.7, drag: 1.5, cell: C.Seal, rot: a }); }
      F.flash(ev.x, y, 40 * p, core, 0.15);
      break;
    }
    case 'hs3leap': {
      // 纵身：脚下一圈炸裂、尘浪、往上的风线
      flat(F, () => { F.shockRing(ev.x, ev.y, 200, DUST, 0.5, 0.55, 0.55, true); F.smokeRing(ev.x, ev.y, 160, DUST, 0.35, 0.9); decal(K.Crack, ev.x, ev.y, 50, 130, 5, [0.1, 0.08, 0.06], 0.7, { add: 0, sq: 0.5, rot: rnd(0, TAU), ease: 6, fin: 0.03 }); });
      F.B.billboard = { x: ev.x, y: ev.y };
      for (let i = 0; i < 18; i++) F.emit({ x: ev.x + rnd(-40, 40), y: ev.y - rnd(0, 60), vx: rnd(-40, 40), vy: -rnd(900, 1600), life: rnd(0.2, 0.35), s0: 2.5, s1: 1, c: WHITE, a: 0.5, stretch: 0.05, cell: C.Glow });
      for (let i = 0; i < 10; i++) { const a = rnd(0, TAU), v = rnd(150, 420); F.emit({ x: ev.x, y: ev.y - 10, vx: Math.cos(a) * v, vy: -rnd(200, 600), life: rnd(0.6, 1), s0: rnd(5, 10), s1: 3, c: [0.38, 0.32, 0.25], add: 0, a: 1, grav: 1500, cell: C.Shard, rot: a, vr: rnd(-10, 10) }); }
      break;
    }
    case 'hs3land': {
      flat(F, () => { F.shockRing(ev.x, ev.y, 180, DUST, 0.45, 0.55, 0.45, true); F.smokeRing(ev.x, ev.y, 150, DUST, 0.3, 0.9); });
      break;
    }
    case 'hs3rock': {
      // 借星：一脚蹬碎陨石——碎块四散（往蹬的反方向多）、一闪、一圈星屑
      const r = ev.r ?? 80, a0 = (ev.dir ?? 0) + Math.PI;
      F.flash(ev.x, ev.y, r * 0.5, [0.85, 0.82, 1], 0.12);
      F.shockRing(ev.x, ev.y, r * 1.6, [0.8, 0.75, 1], 0.3, 0.8, 0.6);
      F.shock(ev.x, ev.y, r * 4, 10, 0.3);
      for (let i = 0; i < 26; i++) { const a = r01() < 0.6 ? a0 + rnd(-0.9, 0.9) : rnd(0, TAU), v = rnd(250, 900); F.emit({ x: ev.x + rnd(-r, r) * 0.3, y: ev.y + rnd(-r, r) * 0.3, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.8, life: rnd(0.6, 1.1), s0: rnd(8, 18) * r / 80, s1: 4, c: mixc([0.24, 0.22, 0.27], WHITE, rnd(0, 0.2)), add: 0, a: 1, drag: 1.2, cell: C.Shard, rot: a, vr: rnd(-12, 12) }); }
      for (let i = 0; i < 18; i++) { const a = rnd(0, TAU), v = rnd(300, 800); F.emit({ x: ev.x, y: ev.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7, life: rnd(0.3, 0.6), s0: 3, s1: 1, c: [0.9, 0.85, 1], a: 0.85, drag: 3, stretch: 0.03, cell: C.Glow }); }
      break;
    }
    case 'hs3gather': {
      // 无极一击蓄力：四下的墨丝往他拳上收拢（普通混合，越蓄越密）
      const n = Math.round(6 + p * 4), hy = ev.y - 70;
      for (let i = 0; i < n; i++) { const a = rnd(0, TAU), R = rnd(220, 420), T = rnd(0.35, 0.5); F.emit({ x: ev.x + Math.cos(a) * R, y: hy + Math.sin(a) * R * 0.6, vx: -Math.cos(a) * R / T, vy: -Math.sin(a) * R * 0.6 / T, life: T, s0: rnd(30, 50), s1: 8, c: INK, a: 0.55, add: 0, cell: C.Wisp, rot: a }); }
      F.emit({ x: ev.x, y: hy, life: 0.3, s0: 160, s1: 30, c: [0.9, 0.9, 0.9], a: 0.35, cell: C.Ring });
      break;
    }
    case 'hs3wuji': {
      // 无极一击的拳压：一路犁出去——地上一道白芯的冲击带（外层灰白）、沿线一串竖环、两侧扬尘；
      // 天上（拳路上方）的云被拳压往两边推开：两排云团从拳路往外翻、几息后散掉，中间留一条干净的缝
      const x0 = ev.x, y0 = ev.y, x1 = ev.x2 ?? ev.x, y1 = ev.y2 ?? ev.y, half = ev.r ?? 150;
      const L = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / L, uy = (y1 - y0) / L, nx = -uy, ny = ux;
      flat(F, () => {
        F.beam(x0, y0, x1, y1, half * 1.6, [0.82, 0.82, 0.82], 0.16);
        F.beam(x0, y0, x1, y1, half * 0.8, WHITE, 0.55);
        F.beam(x0, y0, x0 + ux * L * 0.85, y0 + uy * L * 0.85, 18, WHITE, 0.9);
        for (let i = 0; i < 8; i++) { const u = (i + 0.5) / 8; F.shockRing(x0 + ux * L * u, y0 + uy * L * u, half * (1.3 + u), [0.9, 0.9, 0.9], 0.3 + u * 0.4, 0.5, 0.45 - u * 0.25, true); }
        F.shock(x0 + ux * 300, y0 + uy * 300, 1400, 28, 0.6);
      });
      F.B.billboard = null;
      // 两侧扬尘（贴地，往外翻；r7-polish：小一号、一息内散）
      for (let i = 0; i < 18; i++) { const u = 0.15 + 0.85 * r01(), s = r01() < 0.5 ? -1 : 1, x = x0 + ux * L * u + nx * s * half, y = y0 + uy * L * u + ny * s * half; F.emit({ x, y, vx: nx * s * rnd(200, 420), vy: ny * s * rnd(100, 220) - 40, life: rnd(0.6, 1), s0: rnd(36, 56), s1: rnd(90, 130), c: DUST, a: 0.26, add: 0, cell: smoke(), drag: 1.8, rot: rnd(0, TAU) }); }
      // 云被推开（r7-polish：原来一排云团贴着拳路、离地七百多，在画面上成了一堵灰白雾墙盖住右半屏）——
      // 只在拳路远端（出拳处往前四成以后）、高空（离地一千五，画面上方），从缝两边往外翻，小、淡、两息内散；地面和人那一块不放
      const zc = 1500;
      for (let i = 0; i < 10; i++) {
        const u = 0.45 + 0.85 * (i / 9), cx = x0 + ux * L * u, cy = y0 + uy * L * u;
        for (const s of [-1, 1]) {
          const off = rnd(220, 320), x = cx + nx * s * off, y = cy + ny * s * off;
          F.B.billboard = { x, y };
          F.emit({ x, y: y - zc, vx: nx * s * rnd(320, 520), vy: ny * s * rnd(160, 260), life: rnd(1.5, 2.1), s0: rnd(90, 130), s1: rnd(170, 230), c: mixc(CLOUD, WHITE, rnd(0, 0.3)), a: rnd(0.16, 0.24), add: 0, cell: smoke(), drag: 0.9, rot: rnd(0, TAU), vr: rnd(-0.2, 0.2) });
        }
      }
      // 缝里透下来的一道天光（很淡，短）
      F.B.billboard = null;
      flat(F, () => F.beam(x0, y0, x0 + ux * L * 1.1, y0 + uy * L * 1.1, half * 1.6, [1, 0.97, 0.88], 0.12, C.Beam, 1));
      break;
    }
    case 'hs3peak': {
      // 远山缺口：山头炸开、大石块冲天、尘柱（几息就散）
      const r = ev.r ?? 400;
      flat(F, () => { F.shockRing(ev.x, ev.y, r * 1.6, DUST, 0.8, 0.55, 0.5, true); F.smokeRing(ev.x, ev.y, r * 1.2, DUST, 0.45, 1.4); });
      F.B.billboard = { x: ev.x, y: ev.y };
      F.flash(ev.x, ev.y - 60, 60, [1, 0.95, 0.85], 0.18);
      for (let i = 0; i < 40; i++) { const a = rnd(0, TAU), v = rnd(200, 800); F.emit({ x: ev.x + Math.cos(a) * r * 0.3, y: ev.y - rnd(0, 60), vx: Math.cos(a) * v, vy: -rnd(700, 1600), life: rnd(1.2, 2), s0: rnd(16, 34), s1: 10, c: mixc([0.4, 0.36, 0.32], WHITE, rnd(0, 0.15)), add: 0, a: 1, grav: 1400, drag: 0.3, cell: C.Shard, rot: a, vr: rnd(-8, 8) }); }
      for (let i = 0; i < 14; i++) { const a = rnd(0, TAU); F.emit({ x: ev.x + Math.cos(a) * r * 0.4, y: ev.y - rnd(20, 200), vx: Math.cos(a) * rnd(100, 260), vy: -rnd(120, 320), life: rnd(1.6, 2.6), s0: rnd(120, 180), s1: rnd(300, 420), c: DUST, a: 0.38, add: 0, cell: smoke(), drag: 1.2, rot: rnd(0, TAU) }); }
      break;
    }
    case 'hs3stomp': {
      // 千钧坠：巨坑——一圈压下去的气浪、放射的裂纹、坑边翻起的土墙、往外压平的草（树倒交给破坏系统）
      const r = ev.r ?? 600;
      flat(F, () => {
        // r7-polish：亮的只留坑口一圈、0.3 息退掉；外面几圈是尘浪（普通混合，不发光）；往外的光丝淡、短
        F.shockRing(ev.x, ev.y, r * 0.5, [1, 0.85, 0.6], 0.3, 0.55, 0.45, true);
        for (let i = 1; i < 4; i++) F.shockRing(ev.x, ev.y, r * (0.6 + i * 0.45), DUST, 0.4 + i * 0.25, 0.55, 0.6 - i * 0.1, true);
        F.shock(ev.x, ev.y, r * 2.4, 34, 0.8);
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + rnd(-0.1, 0.1); F.emit({ x: ev.x + Math.cos(a) * r * 0.3, y: ev.y + Math.sin(a) * r * 0.15, vx: Math.cos(a) * r * 1.4, vy: Math.sin(a) * r * 0.7, life: 0.3, s0: 30, s1: 60, c: [1, 0.9, 0.7], a: 0.16, add: 1, drag: 2.5, cell: C.Streak, rot: a }); }
      });
      F.B.billboard = { x: ev.x, y: ev.y };
      // 坑边翻起的土墙（一圈往外、往上抛的土块）
      for (let i = 0; i < 36; i++) { const a = i / 36 * TAU + rnd(-0.05, 0.05), v = rnd(380, 760); F.emit({ x: ev.x + Math.cos(a) * r * 0.35, y: ev.y + Math.sin(a) * r * 0.2 - 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - rnd(500, 900), life: rnd(0.8, 1.3), s0: rnd(12, 24), s1: 8, c: mixc([0.36, 0.3, 0.24], WHITE, rnd(0, 0.12)), add: 0, a: 1, grav: 1700, drag: 0.4, cell: C.Shard, rot: a, vr: rnd(-12, 12) }); }
      for (let i = 0; i < 18; i++) { const a = i / 18 * TAU; F.emit({ x: ev.x + Math.cos(a) * r * 0.55, y: ev.y + Math.sin(a) * r * 0.3 - 30, vx: Math.cos(a) * rnd(300, 520), vy: Math.sin(a) * rnd(120, 240) - 60, life: rnd(1.2, 1.8), s0: rnd(70, 100), s1: rnd(200, 280), c: DUST, a: 0.36, add: 0, cell: smoke(), drag: 1.8, rot: rnd(0, TAU) }); }
      break;
    }
    case 'hs3split': {
      // 分海：一道白蓝的拳压沿着水面劈出去、两边一路炸起水柱（水墙由破坏系统画）
      const x0 = ev.x, y0 = ev.y, x1 = ev.x2 ?? ev.x, y1 = ev.y2 ?? ev.y, w = ev.r ?? 380;
      const L = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / L, uy = (y1 - y0) / L, nx = -uy, ny = ux;
      flat(F, () => {
        F.beam(x0, y0, x1, y1, w * 0.6, SEA, 0.12);   // r7-polish：原来 0.9 宽、0.25 浓，一整块浅色方块盖住半屏
        F.beam(x0, y0, x0 + ux * L * 0.9, y0 + uy * L * 0.9, 26, FOAM, 0.8);
        for (let i = 0; i < 7; i++) { const u = (i + 0.5) / 7; F.shockRing(x0 + ux * L * u, y0 + uy * L * u, w * 0.8, FOAM, 0.4 + u * 0.4, 0.5, 0.5, true); }
        F.shock(x0 + ux * L * 0.4, y0 + uy * L * 0.4, 1600, 26, 0.6);
      });
      for (let i = 0; i < 16; i++) {
        const u = (i + 0.5) / 16;
        for (const s of [-1, 1]) {
          const x = x0 + ux * L * u + nx * s * w * 0.55, y = y0 + uy * L * u + ny * s * w * 0.55;
          F.B.billboard = { x, y };
          for (let j = 0; j < 3; j++) F.emit({ x: x + rnd(-20, 20), y: y - 8, vx: nx * s * rnd(60, 180), vy: -rnd(700, 1200), life: rnd(0.7, 1.1), s0: rnd(6, 11), s1: 3, c: j ? FOAM : SEA, a: 0.9, add: 0, grav: 1500, cell: C.Glow });
        }
      }
      F.B.billboard = null;
      break;
    }
    case 'hs3tremble': {
      // 分海前摇：拳路上的海面翻起白沫（看得见要劈在哪）
      const x0 = ev.x, y0 = ev.y, x1 = ev.x2 ?? ev.x, y1 = ev.y2 ?? ev.y;
      for (let i = 0; i < 10; i++) { const u = r01(), x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u; F.B.billboard = { x, y }; F.emit({ x: x + rnd(-30, 30), y: y - 4, vx: rnd(-30, 30), vy: -rnd(80, 220), life: rnd(0.4, 0.7), s0: rnd(4, 8), s1: 2, c: FOAM, a: 0.8, add: 0, grav: 600, cell: C.Glow }); }
      F.B.billboard = null;
      break;
    }
  }
}

// ==================================================================== 每帧：蓄劲、预警、光柱、流星、陨石、追击线
const unitPos = (g: Game, u: Enemy | 'p' | null) => { const p = g.player; if (u === 'p' || u === null) return { x: p.x, y: p.y, z: p.z + g.combat.brawl.playerLift }; return { x: u.x, y: u.y, z: u.z }; };
export function drawHs3GL(F: FxSys, c: Combat, t: number, dt: number) {
  const g = c.game, S = hs3Peek(g); if (!S) return;
  const V = S.vis;
  if (!V.charge && !V.warns.length && !V.pillars.length && !V.risers.length && !V.rocks.length && !V.streaks.length) return;
  const prev = F.B.billboard;
  // —— 预警（地上）
  for (const w of V.warns) {
    const k = Math.min(1, w.t / Math.max(0.01, w.dur)), fade = w.t > w.dur ? 1 - (w.t - w.dur) / Math.max(0.01, w.fade) : 1, pulse = 0.65 + 0.35 * Math.sin(t * 18);
    F.B.billboard = null;
    if (w.k === 'ring' || w.k === 'column') {
      const R = w.r, red: RGB = w.blue ? [0.35, 0.65, 1] : [1, 0.35 + 0.3 * (1 - k), 0.2];
      F.circle(w.x, w.y, R, 6, red, 0.55 * fade * pulse, 0.5);
      F.circle(w.x, w.y, R * (1 - k) + 6, 4, [1, 0.85, 0.5], 0.7 * fade, 0.5);
      F.ground(C.RingSoft, w.x, w.y, R * 1.05, 0, red, 0.18 * fade, 1, 0.5);
      if (w.k === 'column') { F.B.billboard = { x: w.x, y: w.y }; F.beam(w.x, w.y, w.x, w.y - 900, 90, [1, 0.8, 0.5], 0.08 * fade * pulse); F.beam(w.x, w.y, w.x, w.y - 900, 14, [1, 0.9, 0.7], 0.25 * fade * k); }
    } else if (w.k === 'fan') {
      // r7-fx3d 无极一击的扇面：两条越往前越张开的边线、中间淡淡一层、往前推的箭头纹
      const L = Math.hypot(w.x2 - w.x, w.y2 - w.y) || 1, ux = (w.x2 - w.x) / L, uy = (w.y2 - w.y) / L, nx = -uy, ny = ux, r2 = w.r2 ?? w.r;
      const colr: RGB = [1, 0.5 + 0.4 * (1 - k), 0.3];
      for (const s of [-1, 1]) F.beam(w.x + nx * s * w.r, w.y + ny * s * w.r, w.x2 + nx * s * r2, w.y2 + ny * s * r2, 8, colr, 0.6 * fade * pulse);
      for (let i = 0; i < 4; i++) { const a = i / 4, b = (i + 1) / 4, wa = w.r + (r2 - w.r) * (a + b) / 2; F.beam(w.x + ux * L * a, w.y + uy * L * a, w.x + ux * L * b, w.y + uy * L * b, wa * 2, colr, 0.08 * fade * (0.5 + k)); }
      const n = 6, sp = 0.6 + 2.4 * k;
      for (let i = 0; i < n; i++) { const u = ((i / n + t * sp * 0.25) % 1), x = w.x + (w.x2 - w.x) * u, y = w.y + (w.y2 - w.y) * u; F.ground(C.Ring, x, y, (w.r + (r2 - w.r) * u) * 0.7, Math.atan2(uy, ux), colr, 0.35 * fade * (1 - u), 1, 0.4); }
    } else if (w.k === 'line' || w.k === 'foam') {
      const L = Math.hypot(w.x2 - w.x, w.y2 - w.y) || 1, nx = -(w.y2 - w.y) / L, ny = (w.x2 - w.x) / L;
      const colr: RGB = w.k === 'foam' ? FOAM : [1, 0.5 + 0.4 * (1 - k), 0.3];
      for (const s of [-1, 1]) F.beam(w.x + nx * s * w.r, w.y + ny * s * w.r, w.x2 + nx * s * w.r, w.y2 + ny * s * w.r, 8, colr, 0.6 * fade * pulse);
      F.beam(w.x, w.y, w.x2, w.y2, w.r * (w.k === 'foam' ? 1.2 : 2), colr, (w.k === 'foam' ? 0.07 : 0.1) * fade * (0.5 + k));   // r7-polish：分海的白沫预警带收窄、淡一半（两边的边线照旧标出范围）
      // 往前推的箭头纹：越临出手越快
      const n = 6, sp = 0.6 + 2.4 * k;
      for (let i = 0; i < n; i++) { const u = ((i / n + t * sp * 0.25) % 1), x = w.x + (w.x2 - w.x) * u, y = w.y + (w.y2 - w.y) * u; F.ground(C.Ring, x, y, w.r * 0.7, Math.atan2(w.y2 - w.y, w.x2 - w.x), colr, 0.35 * fade * (1 - u), 1, 0.4); }
    }
  }
  // —— 拳上蓄的劲
  const ch = V.charge;
  if (ch) {
    const u = unitPos(g, ch.e), k = Math.min(1, ch.k), cc = col(ch.col), hy = u.y - u.z - 70;
    F.B.billboard = { x: u.x, y: u.y };
    if (ch.ink) {
      // 吸墨：拳上一团越来越浓的墨，外面一圈白
      F.glow(u.x, hy, 40 + 70 * k, INK, 0.5 * k, C.Glow);
      F.emit({ x: u.x + rnd(-6, 6), y: hy + rnd(-6, 6), life: 0.12, s0: 20 + 40 * k, s1: 10, c: INK, a: 0.6, add: 0, cell: C.Smoke, rot: rnd(0, TAU) });
      F.glow(u.x, hy, 14 + 14 * k, WHITE, 0.4 + 0.4 * k);
    } else {
      F.glow(u.x, hy, 40 + 60 * k, cc, 0.25 + 0.3 * k);
      F.glow(u.x, hy, 12 + 16 * k, mixc(cc, WHITE, 0.6), 0.6 + 0.3 * k);
      if (r01() < dt * 30) { const a = rnd(0, TAU), R = rnd(60, 130); F.emit({ x: u.x + Math.cos(a) * R, y: hy + Math.sin(a) * R * 0.7, vx: -Math.cos(a) * R * 4, vy: -Math.sin(a) * R * 2.8, life: 0.25, s0: 4, s1: 1.5, c: mixc(cc, WHITE, 0.4), a: 0.9, stretch: 0.02, cell: C.Glow }); }
    }
    // 脚下的土被劲压出一圈
    F.B.billboard = null;
    F.ground(C.RingSoft, u.x, u.y, 90 + 90 * k, t * 0.6, ch.ink ? [0.2, 0.2, 0.2] : DUST, 0.22 * k, 0, 0.5);
  }
  // —— 光柱（贯天，几息淡掉）、冲天 / 坠下来的流星：r7-fx3d 起是立体的（world/fx3d.ts 的 column、fire），平面的不画了
  for (const p of NONE) {
    const k = p.t / p.dur, a = (1 - k) * Math.min(1, p.t / 0.06), cc = col(p.col), w = p.w;
    F.B.billboard = { x: p.x, y: p.y };
    F.beam(p.x, p.y + 6, p.x, p.y - 4200, 150 * w * (1 + k * 0.6), cc, 0.12 * a);
    F.beam(p.x, p.y + 6, p.x, p.y - 4200, 46 * w * (1 - k * 0.5), mixc(cc, WHITE, 0.5), 0.35 * a);
    F.beam(p.x, p.y + 6, p.x, p.y - 4200, 10 * w, WHITE, 0.7 * a);
  }
  // —— 冲天 / 坠下来的流星（白芯、金焰、身后一道长火尾）
  for (const r of NONE_R) {
    if (r.fire <= 0.01) continue;
    const hy = r.y - r.z - 50, up = !r.down;
    F.B.billboard = { x: r.x, y: r.y };
    F.glow(r.x, hy, 120, [1, 0.62, 0.25], 0.3 * r.fire); F.glow(r.x, hy, 50, [1, 0.95, 0.8], 0.5 * r.fire);
    const tail = Math.min(900, 220 + r.t * 900), ty = up ? hy + tail : hy - tail;
    F.beam(r.x, hy, r.x, ty, 70, [1, 0.55, 0.2], 0.22 * r.fire);
    F.beam(r.x, hy, r.x, hy + (ty - hy) * 0.7, 22, [1, 0.92, 0.7], 0.6 * r.fire);
    if (r01() < dt * 50) F.emit({ x: r.x + rnd(-24, 24), y: hy + rnd(-10, 30) * (up ? 1 : -1), vx: rnd(-60, 60), vy: (up ? 1 : -1) * rnd(200, 500), life: rnd(0.25, 0.45), s0: rnd(20, 36), s1: 6, c: r01() < 0.5 ? [1, 0.55, 0.15] : [1, 0.82, 0.4], a: 0.7, cell: C.Flame, rot: up ? Math.PI : 0 });
  }
  // —— 借星的陨石（斗法场里，浮在两人的高度）
  for (const r of V.rocks) {
    if (r.broken > 0) continue;
    const ap = Math.min(1, r.t / 0.4), bob = Math.sin(t * 1.3 + r.seed) * 8, hy = r.y - r.z + bob;
    F.B.billboard = { x: r.x, y: r.y };
    F.glow(r.x, hy, r.r * 1.6, [0.75, 0.6, 1], 0.12 * ap);
    F.glow(r.x, hy, r.r * 0.9, [0.06, 0.05, 0.08], 0.55 * ap, C.Disc);
    for (let i = 0; i < 5; i++) {
      const a = (r.seed % 628) / 100 + i * 1.3 + t * 0.15, d = r.r * 0.35 * ((i * 37 + r.seed) % 7) / 7;
      F.sprite(C.Shard, r.x + Math.cos(a) * d, hy + Math.sin(a) * d * 0.8, r.r * (1.1 - i * 0.12), r.r * (0.8 - i * 0.08), a, mixc([0.22, 0.2, 0.25], [0.5, 0.46, 0.55], i / 5), 0.95 * ap, 0);
    }
    F.sprite(C.Ring, r.x, hy, r.r * 2.1, r.r * 1.6, 0, [0.85, 0.7, 1], 0.25 * ap, 1);
  }
  // —— 超高速追击线（IMPACT: 第一批的共用效果，合并时换）
  for (const s of V.streaks) {
    const a = 1 - s.t / s.dur, cc = col(s.col);
    const pts: FlightPoint[] = [[s.x0, s.y0, -s.z0], [s.x1, s.y1, -s.z1]];
    F.flightTrail(pts, 46, cc, 0.35 * a, C.Beam, 1, 0.4);
    F.flightTrail(pts, 10, WHITE, 0.8 * a, C.Beam, 1, 0.2);
  }
  F.B.billboard = prev;
}

// ==================================================================== 后期：天地变黑白、远山缺口、定格特写
type Proj = (x: number, y: number, h: number) => { x: number; y: number };
interface Hd { upDir?: { x: number; y: number }; projectAbsolute(x: number, y: number, h: number): { x: number; y: number }; heightAt(x: number, y: number): number; boost: number; setNotch?(x: number, y: number, r: number, d: number): void }
let notchOn = false;
/** render.ts 的后期参数里调：返回天地变黑白要的参数（没有就 null）；顺带把远山缺口交给地形、定格特写的叠层推一帧 */
export function hs3Post(g: Game, hd: Hd | null, W: number, H: number, camX: number, camY: number, z: number): { k: number; flash: number; dim: number; black?: number; wash?: [number, number, number, number]; keep: [number, number, number][]; keepW: [number, number, number, number][]; up: [number, number]; fxKeep?: number } | null {
  const S = hs3Peek(g);
  cutinFrame(S?.vis.cutin ?? null);
  if (!S) { if (notchOn && hd?.setNotch) { hd.setNotch(0, 0, 1, 0); notchOn = false; } return null; }
  const V = S.vis, N = V.notch;
  if (hd?.setNotch) {
    if (N && N.k > 0.001) { hd.setNotch(N.x, N.y, N.r, N.depth * N.k); notchOn = true; }
    else if (notchOn) { hd.setNotch(0, 0, 1, 0); notchOn = false; }
  }
  // r8-p2：第二阶段的整屏效果（压暗、压黑、整屏变色）一起交过去
  const P = hsp2Peek(g)?.vis, I = g.combat?.brawl?.impact, dim = Math.max(V.dim, I?.dimK() ?? 0, P?.dim ?? 0), black = P?.black ?? 0, wash = P && P.wash[3] > 0.002 ? P.wash : undefined;
  if (V.mono < 0.002 && V.flash <= 0 && dim < 0.002 && black < 0.002 && !wash) return null;
  const proj: Proj = hd ? (x, y, h) => hd.projectAbsolute(x, y, hd.heightAt(x, y) + h * hd.boost) : (x, y, h) => ({ x: W / 2 + (x - camX) * z, y: H / 2 + (y - h - camY) * z });
  const keep: [number, number, number][] = [], keepW: [number, number, number, number][] = [];
  const keepList = V.keep.length ? V.keep : P?.keep.length ? P.keep : (I?.finKeep ?? []);
  for (const u of keepList.slice(0, 3)) {
    // r8-p2：贴着人形（窄、竖着的椭圆）——原来按一人高的 1.25 倍取半径，压黑时两人身边各留一大团没压暗的椭圆
    const uh = u === 'p' ? 175 : (u as { keepH?: number }).keepH ?? 175;   // r16：人高按单位的立板高（几丈高的魔躯不再只有脚下一截留色）
    const q = unitPos(g, u), a = proj(q.x, q.y, q.z), b = proj(q.x, q.y, q.z + uh), hp = Math.abs(a.y - b.y);
    keep.push([(a.x + b.x) / 2, (a.y + b.y) / 2, Math.max(26, hp * 0.42)]);
    // r9：人形遮罩用的世界坐标（three 坐标：x、高度、y）：脚下、一人高（按立板的竖向放大）
    if (hd) { const b0 = hd.boost; keepW.push([q.x, hd.heightAt(q.x, q.y) + q.z * b0, q.y, uh * b0]); }
  }
  const ud = hd?.upDir ?? { x: 0, y: -1 };
  return { k: Math.min(1, V.mono), flash: V.flash > 0 ? 1 : 0, dim, black, wash, keep, keepW, up: [ud.x, ud.y], fxKeep: P?.fxKeep ?? 0 };
}

// —— 定格特写：一条斜着的宽幅切进来半秒（只动 transform / opacity）
const CUTIN_SRC = { fist: 'art/cutin/yqj_fist.webp', eyes: 'art/cutin/yqj_eyes.webp', stomp: 'art/cutin/yqj_stomp.webp' } as const;
let cutEl: HTMLDivElement | null = null, cutImg: HTMLImageElement | null = null, cutAt = -1;
function cutinFrame(ci: { img: keyof typeof CUTIN_SRC; at: number } | null) {
  if (!ci || ci.at === cutAt || typeof document === 'undefined') return;
  cutAt = ci.at;
  try {
    if (!cutEl) {
      cutEl = document.createElement('div');
      cutEl.className = 'hs3-cutin';
      // 一条斜着的宽幅：上下各留出画面（不是整屏盖住）；黑边是墨色描边
      Object.assign(cutEl.style, { position: 'fixed', left: '0', right: '0', top: '50%', height: 'min(56vh, 46vw)', marginTop: 'calc(min(56vh, 46vw) / -2)', zIndex: '40', pointerEvents: 'none', opacity: '0',
        clipPath: 'polygon(0 14%, 100% 0, 100% 86%, 0 100%)', background: '#0d0b0a', willChange: 'transform, opacity' } as CSSStyleDeclaration);
      cutImg = document.createElement('img');
      Object.assign(cutImg.style, { position: 'absolute', inset: '3% 0', width: '100%', height: '94%', objectFit: 'cover', clipPath: 'polygon(0 12%, 100% 0, 100% 88%, 0 100%)', willChange: 'transform' } as CSSStyleDeclaration);
      cutEl.appendChild(cutImg);
      document.body.appendChild(cutEl);
    }
    cutImg!.src = CUTIN_SRC[ci.img];
    cutImg!.style.objectPosition = ci.img === 'eyes' ? '50% 45%' : ci.img === 'stomp' ? '50% 60%' : '45% 50%';
    cutEl.getAnimations?.().forEach((a) => a.cancel()); cutImg!.getAnimations?.().forEach((a) => a.cancel());
    cutEl.animate([
      { opacity: 0, transform: 'translateX(-7%) skewX(-6deg)' },
      { opacity: 1, transform: 'translateX(0) skewX(-6deg)', offset: 0.14 },
      { opacity: 1, transform: 'translateX(1.2%) skewX(-6deg)', offset: 0.82 },
      { opacity: 0, transform: 'translateX(5%) skewX(-6deg)' },
    ], { duration: 520, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
    cutImg!.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(1.0)', offset: 0.18 }, { transform: 'scale(1.05)' }], { duration: 520, easing: 'ease-out', fill: 'forwards' });
  } catch { /* 无头 / 没有 DOM */ }
}
