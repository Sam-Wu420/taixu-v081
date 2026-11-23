// 撼山客招式第二批的画面（world/hsmoves2.ts 发事件、摆场景件，world/hsmoves2fx.ts 是两边共用的数据）：
//   流星百裂的残拳成片、燕回交叉的残影线、点穴的穴位和连环炸开、犁地接触点喷的泥土 / 火星和两边的速度线、
//   天地往返 / 陨星坠下坠的火尾、抡人脚下转的一圈风，以及几样共用打击表现的本地小版本（黑白闪、背后冲击波、超高速追击线、踏空气环；
//   第一批的 impactgl 合并后换掉，世界那边调用处标了 IMPACT）。
// 用户的规矩：招可以炸，但散得快——加色光都短命、偏小，尘土用普通混合、一两息内散尽，不留一屏雾。
import type { Combat } from '../world/combat';
import { FxSys, col, mixc, type RGB, type FlightPoint, smokeCell } from './fx';
import { C } from './atlas';
import { HS2, type Hs2Ev, type Hs2Who } from '../world/hsmoves2fx';

const TAU = Math.PI * 2;
const WHITE: RGB = [1, 1, 1];
const GOLD: RGB = [1, 0.8, 0.45];
const HOT: RGB = [1, 0.62, 0.3];
const INK: RGB = [0.06, 0.05, 0.05];
const DUST: RGB = [0.32, 0.26, 0.19];
const MUD: RGB = [0.27, 0.2, 0.13];
const GRASS: RGB = [0.32, 0.45, 0.2];
const STONE: RGB = [0.5, 0.48, 0.45];
const SPARK: RGB = [1, 0.7, 0.32];
/** 画面自己的随机序列（不碰 Math.random） */
let rs = 0x2f6e2b1;
const rr = () => { rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0; return rs / 4294967296; };
const rnd = (a: number, b: number) => a + rr() * (b - a);

/** 一个人此刻在哪（离地高度） */
function at(c: Combat, w: Hs2Who): { x: number; y: number; z: number } {
  if (w === 'p') { const p = c.game.player; return { x: p.x, y: p.y, z: p.st.lift }; }
  return { x: w.x, y: w.y, z: w.z };
}
/** 短命的线（追击线、穿身而过的那一道）：0.25 息内淡掉 */
const flashes: { a: FlightPoint; b: FlightPoint; t: number; dur: number; w: number; c: RGB }[] = [];

function event(F: FxSys, ev: Hs2Ev) {
  const z = ev.z ?? 0, p = ev.p ?? 1, dir = ev.dir ?? 0, ux = Math.cos(dir), uy = Math.sin(dir);
  F.B.billboard = { x: ev.x, y: ev.y };
  const hy = ev.y - z;
  switch (ev.k) {
    case 'fist': {
      // 一记残拳：拳头大小的亮团顺着拳路一闪，带一道光丝
      const ox = rnd(-30, 30), oy = rnd(-26, 26);
      F.emit({ x: ev.x - ux * 30 + ox, y: hy + oy, vx: ux * 900, vy: uy * 500, life: 0.09, s0: 22, s1: 34, c: GOLD, a: 0.55, cell: C.Glow, drag: 8 });
      F.emit({ x: ev.x - ux * 30 + ox, y: hy + oy, vx: ux * 1400, vy: uy * 700, life: 0.08, s0: 4, s1: 2, c: WHITE, a: 0.9, stretch: 0.03, cell: C.Glow });
      break;
    }
    case 'blink': case 'pass': {
      // 超高速追击线（本地版）：一道细亮线，两头各一点闪
      const z2 = ev.z2 ?? z;
      flashes.push({ a: [ev.x, ev.y, -z - 60], b: [ev.x2 ?? ev.x, ev.y2 ?? ev.y, -z2 - 60], t: 0, dur: ev.k === 'pass' ? 0.18 : 0.26, w: ev.k === 'pass' ? 34 : 26, c: ev.k === 'pass' ? GOLD : [0.85, 0.9, 1] });
      if (flashes.length > 12) flashes.shift();
      F.flash(ev.x, hy - 60, 14, WHITE, 0.08);
      break;
    }
    case 'ring': {
      // 踏空气环（本地版）：脚下一圈扁环 + 几点碎光
      F.shockRing(ev.x, hy - 4, 90, mixc(GOLD, WHITE, 0.5), 0.3, 0.32, 0.9);
      F.shockRing(ev.x, hy - 4, 150, GOLD, 0.4, 0.32, 0.35);
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; F.emit({ x: ev.x, y: hy, vx: Math.cos(a) * 520, vy: Math.sin(a) * 160, life: 0.22, s0: 4, s1: 1, c: WHITE, a: 0.8, drag: 4, cell: C.Glow }); }
      break;
    }
    case 'burst': {
      // 背后冲击波（本地版）：命中点往冲击方向炸开一圈竖环和一锥气流
      const bx = ev.x + ux * 40, by = hy - 60 + uy * 24;
      F.shockRing(bx, by, 50 + p * 26, mixc(GOLD, WHITE, 0.5), 0.22, 0.9, 0.8);
      F.shockRing(bx, by, 90 + p * 40, GOLD, 0.34, 0.85, 0.3);
      F.shock(bx, by, 160 + p * 60, 8 + p * 3, 0.3);
      for (let i = 0; i < 8 + p * 5; i++) { const a = dir + rnd(-0.45, 0.45), v = rnd(900, 1700); F.emit({ x: bx, y: by + rnd(-12, 12), vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6, life: rnd(0.12, 0.22), s0: rnd(3, 5), s1: 1, c: i % 3 ? WHITE : GOLD, a: 0.85, drag: 5, stretch: 0.035, cell: C.Glow }); }
      break;
    }
    case 'ink': {
      // 黑白闪（本地版）：一团墨色往外一炸、一圈黑环，散得很快
      F.ink(ev.x, hy - 40, 140 * p, 0.5, INK);
      F.shockRing(ev.x, hy - 50, 120 * p, INK, 0.25, 0.8, 0.5);
      F.flash(ev.x, hy - 50, 24 * p, WHITE, 0.07);
      break;
    }
    case 'poke': {
      F.glint(ev.x, hy, 14, [1, 0.85, 0.6], 0.9, 0.16);
      F.sparks(ev.x, hy, [1, 0.8, 0.5], 5, 240, 0.2, 2, dir, 1.2);
      break;
    }
    case 'pop': {
      // 穴位炸开：一点爆闪、火星、一圈环；最后一处炸得大
      F.flash(ev.x, hy, 18 * p, [1, 0.85, 0.6], 0.12);
      F.shockRing(ev.x, hy, 46 * p, [1, 0.55, 0.3], 0.26, 0.85, 0.8);
      F.sparks(ev.x, hy, [1, 0.62, 0.3], Math.round(10 * p), 520 * p, 0.3, 2.8);
      if (p > 1.5) { F.rays(ev.x, hy, 90, [1, 0.6, 0.3], 0.4, 0.22); F.shock(ev.x, hy, 260, 12, 0.35); }
      break;
    }
    case 'slamdirt': case 'grind': case 'lift': case 'plunge': {
      // 按地、撞碎石头、起跳、陨星落地：贴地一圈尘浪 + 往上崩的土块（石地带火星）
      const big = ev.k === 'plunge' ? 2.2 : ev.k === 'grind' ? 1.2 * p : ev.k === 'lift' ? 1.2 * p : 1.6;
      const prev = F.B.billboard; F.B.billboard = null;
      F.shockRing(ev.x, ev.y, 120 * big, DUST, 0.45, 0.5, 0.5, true);
      if (ev.k === 'plunge') { F.shockRing(ev.x, ev.y, 420, mixc(GOLD, WHITE, 0.4), 0.4, 0.5, 0.55, true); F.shockRing(ev.x, ev.y, 620, DUST, 0.7, 0.5, 0.3, true); }
      F.B.billboard = prev;
      const rock = !!ev.rock;
      for (let i = 0; i < 10 * big; i++) { const a = dir + Math.PI + rnd(-1.6, 1.6), v = rnd(140, 420) * big; F.emit({ x: ev.x + rnd(-20, 20), y: ev.y - 6, vx: Math.cos(a) * v, vy: -rnd(240, 620) * Math.sqrt(big), life: rnd(0.45, 0.8), s0: rnd(4, 9), s1: 2, c: rock ? STONE : i % 3 ? MUD : GRASS, add: 0, a: 0.95, grav: 1500, drag: 0.6, cell: C.Shard, rot: a, vr: rnd(-12, 12) }); }
      for (let i = 0; i < 4 * big; i++) { const a = rnd(0, TAU); F.emit({ x: ev.x + Math.cos(a) * 30, y: ev.y - 8, vx: Math.cos(a) * rnd(90, 220), vy: rnd(-70, -20), life: rnd(0.5, 0.9), s0: rnd(24, 36), s1: 80, c: DUST, a: 0.26, add: 0, cell: smokeCell(), drag: 2.6, rot: rnd(0, TAU) }); }
      if (rock || ev.k === 'grind') F.sparks(ev.x, ev.y - 20, SPARK, Math.round(8 * big), 620, 0.3, 2.6, dir, 1.6);
      break;
    }
    case 'swing': {
      F.flash(ev.x, hy - 40, 20, WHITE, 0.1);
      F.shockRing(ev.x, hy - 40, 80, GOLD, 0.26, 0.85, 0.7);
      F.sparks(ev.x, hy - 40, GOLD, 12, 700, 0.3, 3, dir, 1.4);
      break;
    }
  }
  F.B.billboard = null;
}

/** 一条立体的带子（两层：金带 + 白芯） */
function band(F: FxSys, a: FlightPoint, b: FlightPoint, w: number, cc: RGB, k: number) {
  const T: FlightPoint[] = [a, b];
  F.flightTrail(T, w * 2.2, cc, 0.22 * k, C.Glow, 1, 1);
  F.flightTrail(T, w, cc, 0.5 * k, C.Beam, 1, 1);
  F.flightTrail(T, w * 0.25, WHITE, 0.85 * k, C.Beam, 1, 1);
}

/** 每帧（drawCombatGL 里调一次） */
export function drawHs2GL(F: FxSys, c: Combat, t: number, dt: number) {
  const now = c.game.time;
  if (HS2.q.length) { for (const ev of HS2.q) event(F, ev); HS2.q.length = 0; }
  // 追击线
  for (let i = flashes.length - 1; i >= 0; i--) { const f = flashes[i]; f.t += dt; if (f.t >= f.dur) { flashes.splice(i, 1); continue; } band(F, f.a, f.b, f.w, f.c, 1 - f.t / f.dur); }
  // 燕回的交叉残影线：一道道留在对手周围，两息内淡掉（中段最亮）
  if (HS2.lines.length) {
    HS2.lines = HS2.lines.filter((L) => now - L.t0 < L.dur);
    for (const L of HS2.lines) {
      const u = (now - L.t0) / L.dur, k = u < 0.08 ? u / 0.08 : Math.pow(1 - u, 1.4);
      const a: FlightPoint = [L.x0, L.y0, -L.z], b: FlightPoint = [L.x1, L.y1, -L.z];
      F.flightTrail([a, b], 70, [0.1, 0.08, 0.06], 0.16 * k, C.Glow, 0, 1);   // 暗底：亮草地上也看得见
      band(F, a, b, 22, col(L.c), k);
    }
  }
  // 点穴：身上一个个发光的穴位，越接近炸开闪得越急
  if (HS2.marks.length) {
    HS2.marks = HS2.marks.filter((m) => !(m.done && now > m.boom + 0.2) && now - m.t0 < 12);
    for (const m of HS2.marks) {
      if (m.done) continue;
      const q = at(c, m.who), left = m.boom ? Math.max(0, m.boom - now) : 3, hz = 2 + 14 / (0.4 + left), pulse = 0.55 + 0.45 * Math.sin(t * hz * TAU);
      F.B.billboard = { x: q.x, y: q.y };
      const x = q.x + m.ox, y = q.y - q.z - m.oz;
      F.glow(x, y, 16 + 6 * pulse, [1, 0.45, 0.2], 0.45 * pulse);
      F.glow(x, y, 5, WHITE, 0.9);
      F.B.billboard = null;
    }
  }
  // 犁地：接触点往后、往两边喷泥土 / 草屑（石地是火星和石屑），冲刺两边一道道速度线
  if (HS2.drags.length) {
    HS2.drags = HS2.drags.filter((d) => d.on || now - d.t0 < 0.1);
    for (const d of HS2.drags) {
      if (!d.on || d.sp < 50) continue;
      const v = at(c, d.who), u = at(c, d.user), ux = Math.cos(d.dir), uy = Math.sin(d.dir) * 0.8;
      const hx = (v.x + u.x) / 2 + ux * 46, hy = (v.y + u.y) / 2 + uy * 40;   // 接触点：两人之间偏前（它的头）
      const n = Math.max(1, Math.round(dt * 90));
      F.B.billboard = { x: hx, y: hy };
      for (let i = 0; i < n; i++) {
        const side = rr() < 0.5 ? -1 : 1, a = d.dir + Math.PI + side * rnd(0.3, 1.1), sp = rnd(260, 620);
        if (d.rock) {
          F.emit({ x: hx, y: hy - 6, vx: Math.cos(a) * sp * 1.6, vy: Math.sin(a) * sp * 0.5 - rnd(80, 260), life: rnd(0.16, 0.32), s0: 3, s1: 1, c: rr() < 0.7 ? SPARK : WHITE, a: 0.95, stretch: 0.03, grav: 900, cell: C.Glow });
          if (rr() < 0.5) F.emit({ x: hx, y: hy - 4, vx: Math.cos(a) * sp, vy: -rnd(160, 420), life: rnd(0.4, 0.7), s0: rnd(3, 6), s1: 2, c: STONE, add: 0, a: 0.95, grav: 1500, cell: C.Shard, rot: a, vr: rnd(-12, 12) });
        } else {
          F.emit({ x: hx, y: hy - 4, vx: Math.cos(a) * sp, vy: -rnd(200, 520), life: rnd(0.4, 0.75), s0: rnd(3, 7), s1: 2, c: rr() < 0.3 ? GRASS : MUD, add: 0, a: 0.95, grav: 1500, drag: 0.4, cell: C.Shard, rot: a, vr: rnd(-12, 12) });
        }
      }
      if (rr() < dt * 22) F.emit({ x: hx - ux * 30, y: hy - 6, vx: -ux * 120 + rnd(-40, 40), vy: rnd(-60, -20), life: rnd(0.5, 0.8), s0: rnd(20, 30), s1: 70, c: DUST, a: 0.24, add: 0, cell: smokeCell(), drag: 2.4, rot: rnd(0, TAU) });
      F.glow(hx, hy - 8, 30, d.rock ? HOT : [0.8, 0.6, 0.35], d.rock ? 0.35 : 0.15);
      // 速度线：两人四周往后掠的细丝（世界里的，跟着人走，不糊画面中心）
      F.B.billboard = { x: u.x, y: u.y };
      // r7-polish：镜头跟上去以后速度线要更显眼（多一根、粗一点、亮一点；仍是细丝，不糊画面）
      if (rr() < dt * 60) for (let i = 0; i < 3; i++) {
        const off = rnd(60, 200) * (rr() < 0.5 ? -1 : 1), along = rnd(-60, 160);
        F.emit({ x: u.x - uy * off / 0.8 + ux * along, y: u.y - rnd(10, 150) + ux * off * 0.3, vx: -ux * 2900, vy: -uy * 2900, life: 0.13, s0: 3.5, s1: 1, c: WHITE, a: 0.72, stretch: 0.06, cell: C.Glow });
      }
      F.B.billboard = null;
    }
  }
  // 流星百裂：拳影成片（对手胸前一团残拳，持续冒）
  if (HS2.barrages.length) {
    HS2.barrages = HS2.barrages.filter((b) => b.on);
    for (const b of HS2.barrages) {
      const v = at(c, b.who), u = at(c, b.user), ux = Math.cos(b.dir), uy = Math.sin(b.dir);
      const cx = (u.x * 0.35 + v.x * 0.65), cy = (u.y * 0.35 + v.y * 0.65);
      F.B.billboard = { x: cx, y: cy };
      const n = Math.max(1, Math.round(dt * 160));
      for (let i = 0; i < n; i++) {
        const ox = rnd(-46, 46), oy = rnd(-50, 30);
        F.emit({ x: cx + ox - ux * 30, y: cy - 66 + oy, vx: ux * 1100, vy: uy * 500, life: 0.07, s0: rnd(16, 26), s1: 30, c: rr() < 0.5 ? GOLD : [1, 0.92, 0.75], a: 0.5, cell: C.Glow, drag: 10 });
        if (rr() < 0.5) F.emit({ x: cx + ox, y: cy - 66 + oy, vx: ux * 1600, vy: uy * 800, life: 0.07, s0: 3, s1: 1.5, c: WHITE, a: 0.85, stretch: 0.03, cell: C.Glow });
      }
      F.glow(v.x, v.y - v.z - 62, 60, GOLD, 0.16);
      if (rr() < dt * 18) F.shockRing(v.x - ux * 10, v.y - v.z - 62, 60, mixc(GOLD, WHITE, 0.5), 0.14, 0.9, 0.55);
      F.B.billboard = null;
    }
  }
  // 下坠的火尾（天地往返最后一趟、陨星坠）
  if (HS2.falls.length) {
    HS2.falls = HS2.falls.filter((f) => f.on);
    for (const f of HS2.falls) {
      const q = at(c, f.who); if (q.z < 30) continue;
      F.B.billboard = { x: q.x, y: q.y };
      const hy = q.y - q.z - 40, k = f.hot;
      F.glow(q.x, hy, 70 + 50 * k, HOT, 0.22 * k); F.glow(q.x, hy, 30, [1, 0.92, 0.7], 0.35 * k);
      if (rr() < dt * 50 * k) F.emit({ x: q.x + rnd(-20, 20), y: hy + rnd(-20, 10), vx: rnd(-50, 50), vy: -rnd(300, 600), life: rnd(0.18, 0.32), s0: rnd(18, 30), s1: 6, c: rr() < 0.5 ? [1, 0.55, 0.15] : [1, 0.82, 0.4], a: 0.7, cell: C.Flame, rot: rnd(-0.3, 0.3) });
      if (rr() < dt * 40) F.emit({ x: q.x + rnd(-40, 40), y: hy - rnd(0, 80), vx: 0, vy: -1800, life: 0.1, s0: 2.5, s1: 1, c: WHITE, a: 0.6, stretch: 0.05, cell: C.Glow });
      F.B.billboard = null;
    }
  }
  // 抡人：脚下一圈转着的风
  if (HS2.spins.length) {
    HS2.spins = HS2.spins.filter((s) => s.on);
    for (const s of HS2.spins) {
      const q = at(c, s.user);
      F.ground(C.RingSoft, q.x, q.y + 2, s.r, t * 9, [0.9, 0.85, 0.7], 0.22, 1, 0.5);
      F.ground(C.Swirl, q.x, q.y + 2, s.r * 0.85, -t * 12, DUST, 0.3, 0, 0.5);
      if (rr() < dt * 20) { const a = rnd(0, TAU); F.emit({ x: q.x + Math.cos(a) * s.r, y: q.y + Math.sin(a) * s.r * 0.5 - 6, vx: -Math.sin(a) * 300, vy: Math.cos(a) * 120 - 30, life: rnd(0.4, 0.7), s0: rnd(18, 28), s1: 60, c: DUST, a: 0.22, add: 0, cell: smokeCell(), drag: 2, rot: rnd(0, TAU), groundMotion: true }); }
    }
  }
}
