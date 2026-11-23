// 城镇破坏的立体画法（world/townwreck.ts 定坏成什么样，hd2d/townwreckGl.ts 每件建一个替身）：
// 替身 = 原样把这件构件再拼一遍（buildings.buildPieceInto，同一条路、同一份随机数，所以和原来的房子严丝合缝），再在这里做后处理——
//   破损：屋面掉了几片瓦（露出挂瓦条）、墙面裂开、门前一点碎瓦；
//   半塌：屋顶塌下去一块（屋面挖掉、露出断椽和檩、屋里黑着、里头一堆瓦砾）、墙裂得更狠、门口一堆瓦砾和断木；铺子门口支一张临时摊；
//   修：脚手架（竹竿、横杆、斜撑、跳板）；
//   牌坊：柱子齐腰断开、断口封一块茬、上半截碎在脚下；
//   小件的残骸（kitDebris）：塌在地上的案板和布棚、倒地的灯杆旗杆、散了一地的货；
//   城墙：熏黑的焦痕、掉了砖的坑、墙脚几块碎砖（不开口子）。
// 不改原来的块（不重烘）：原来的那件由 buildings.setHidden 藏起来。随机数一律按种子（mulberry32），不碰 Math.random。
import { Color, LinearSRGBColorSpace } from 'three';
import { ArchBuilder } from './arch';
import type { Plaque } from './cityText';
import { mulberry32 } from '../core/rng';

type V3 = [number, number, number];
type RGB = [number, number, number];
const LIN = new Map<string, RGB>();
/** 颜色串 → 线性 RGB（和 ArchBuilder 一样的解析） */
export function lin(hex: string): RGB { let v = LIN.get(hex); if (!v) { const c = new Color().setStyle(hex, LinearSRGBColorSpace); v = [c.r, c.g, c.b]; LIN.set(hex, v); } return v; }
const mulc = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ---------------------------------------------------------------- 基本形：四边面、斜放的盒子、梁
/** 四边面（a→b→c→d 逆时针为正面），颜色线性 RGB */
function face(B: ArchBuilder, a: V3, b: V3, c: V3, d: V3, col: RGB) {
  const n = norm(cross(sub(b, a), sub(c, a)));   // 用 a b c 三点（d 可以和 a 重合：扇形的一片）
  for (const p of [a, b, c, a, c, d]) B.rawVertex(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2]);
}
/** 斜放的盒子：中心 c、三根轴 ex ey ez（单位向量）、半长 hx hy hz */
function obox(B: ArchBuilder, c: V3, ex: V3, ey: V3, ez: V3, hx: number, hy: number, hz: number, col: RGB, bottom = false) {
  const ax: [V3, number][] = [[ex, hx], [ey, hy], [ez, hz]];
  for (let i = 0; i < 3; i++) for (const s of [1, -1]) {
    if (i === 1 && s < 0 && !bottom) continue;
    const [A, hA] = ax[i], [U0, hU] = ax[(i + 1) % 3], [V0, hV] = ax[(i + 2) % 3];
    const N = scl(A, s);
    let U = U0, V = V0, hu = hU, hv = hV;
    if (dot(cross(U, V), N) < 0) { U = V0; V = U0; hu = hV; hv = hU; }
    const o = add(c, scl(N, hA));
    const p = (a: number, b: number) => add(o, add(scl(U, a * hu), scl(V, b * hv)));
    const k = i === 1 && s > 0 ? 1 : i === 1 ? 0.6 : 0.86;   // 顶面亮一点，侧面暗一点（受光由着色器算，这里只是一点区分）
    face(B, p(-1, -1), p(1, -1), p(1, 1), p(-1, 1), mulc(col, k));
  }
}
/** 按偏航 yaw（绕 y）、俯仰 pitch（绕 x）、横滚 roll（绕 z）转出来的三根轴 */
function axes(yaw: number, pitch: number, roll: number): [V3, V3, V3] {
  const rot = (v: V3): V3 => {
    let [x, y, z] = v;
    // roll（绕 z）
    let c = Math.cos(roll), s = Math.sin(roll); [x, y] = [x * c - y * s, x * s + y * c];
    // pitch（绕 x）
    c = Math.cos(pitch); s = Math.sin(pitch); [y, z] = [y * c - z * s, y * s + z * c];
    // yaw（绕 y）
    c = Math.cos(yaw); s = Math.sin(yaw); [x, z] = [x * c + z * s, -x * s + z * c];
    return [x, y, z];
  };
  return [rot([1, 0, 0]), rot([0, 1, 0]), rot([0, 0, 1])];
}
function rbox(B: ArchBuilder, c: V3, yaw: number, pitch: number, roll: number, hx: number, hy: number, hz: number, col: RGB) { const [ex, ey, ez] = axes(yaw, pitch, roll); obox(B, c, ex, ey, ez, hx, hy, hz, col, Math.abs(pitch) + Math.abs(roll) > 0.4); }
/** 一根梁：从 a 到 b，粗 t */
function beam(B: ArchBuilder, a: V3, b: V3, t: number, col: RGB) {
  const d = sub(b, a), L = Math.hypot(d[0], d[1], d[2]); if (L < 1) return;
  const ex = scl(d, 1 / L), up: V3 = Math.abs(ex[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const ez = norm(cross(ex, up)), ey = cross(ez, ex);
  obox(B, scl(add(a, b), 0.5), ex, ey, ez, L / 2, t / 2, t / 2, col, true);
}

// ---------------------------------------------------------------- 读、拆、写三角形
/** 一个顶点 11 个数：x y z nx ny nz r g b u v */
type Vx = Float64Array;
function vtx(S: ReturnType<ArchBuilder['raw']>, i: number): Vx {
  const v = new Float64Array(11), p = S.p, n = S.n, c = S.c, t = S.t;
  v[0] = p[i * 3]; v[1] = p[i * 3 + 1]; v[2] = p[i * 3 + 2]; v[3] = n[i * 3]; v[4] = n[i * 3 + 1]; v[5] = n[i * 3 + 2];
  v[6] = c[i * 3]; v[7] = c[i * 3 + 1]; v[8] = c[i * 3 + 2]; v[9] = t[i * 2]; v[10] = t[i * 2 + 1];
  return v;
}
const mid = (a: Vx, b: Vx): Vx => { const v = new Float64Array(11); for (let k = 0; k < 11; k++) v[k] = (a[k] + b[k]) / 2; return v; };
const lerpV = (a: Vx, b: Vx, u: number): Vx => { const v = new Float64Array(11); for (let k = 0; k < 11; k++) v[k] = a[k] + (b[k] - a[k]) * u; return v; };
function put(O: ArchBuilder, v: Vx, col?: RGB, flat = false) { O.rawVertex(v[0], v[1], v[2], v[3], v[4], v[5], col ? col[0] : v[6], col ? col[1] : v[7], col ? col[2] : v[8], flat ? 0 : v[9], flat ? 0 : v[10]); }
/** 原样拷过去 */
function copyAll(S: ArchBuilder, O: ArchBuilder) { const R = S.raw(); for (let i = 0; i < R.count; i++) put(O, vtx(R, i)); }

interface Region { x: number; z: number; r: number; k: 0 | 1; amp: number[]; ph: number[]; P: V3; n: V3 }
const qOf = (g: Region, x: number, z: number) => { const dx = x - g.x, dz = z - g.z, a = Math.atan2(dz, dx); let s = 1; for (let i = 0; i < g.amp.length; i++) s += g.amp[i] * Math.sin((i + 2) * a + g.ph[i]); return Math.hypot(dx, dz) / (g.r * s); };

// ---------------------------------------------------------------- 房子：破损 / 半塌 / 脚手架 / 临时摊
export interface HouseDmg {
  tier: number; seed: number; scaffold: boolean;
  /** 开张的铺子（半塌时门口摆临时摊），摊上幌子写的字 */
  fn?: string; sign?: string;
  /** 占地（地点本地坐标，x 东 z 南）、正面朝向（本地 xz 的单位向量） */
  x0: number; z0: number; x1: number; z1: number; fx: number; fz: number;
  /** 本地坐标的地面高度 */
  ground: (x: number, z: number) => number;
}
const TILE: RGB = lin('#4a4e54'), LATH: RGB = lin('#4a3626'), WOOD: RGB = lin('#4a3424'), WOOD2: RGB = lin('#6a4e34'), DUSTY: RGB = lin('#8a8274'), INSIDE: RGB = lin('#1a1512'), CRACK: RGB = lin('#2a2018');
const BAMBOO: RGB = lin('#b49a62'), PLANK: RGB = lin('#8a6a48'), CLOTH: RGB = lin('#a8432f'), TABLE: RGB = lin('#8a6a48');

/** 屋面三角形：瓦面坐标 v ≥ 1（tiled 的四边面）、朝上 */
function isRoof(R: ReturnType<ArchBuilder['raw']>, i: number) { return R.t[i * 2 + 1] >= 0.9 && R.t[i * 2 + 3] >= 0.9 && R.t[i * 2 + 5] >= 0.9 && R.n[i * 3 + 1] > 0.15; }
function triArea(R: ReturnType<ArchBuilder['raw']>, i: number) {
  const p = R.p, a: V3 = [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]], b: V3 = [p[i * 3 + 3], p[i * 3 + 4], p[i * 3 + 5]], c: V3 = [p[i * 3 + 6], p[i * 3 + 7], p[i * 3 + 8]];
  const n = cross(sub(b, a), sub(c, a)); return Math.hypot(n[0], n[1], n[2]) / 2;
}

/** 把 S（原样拼好的一件）按破损档做后处理写进 O；返回要另外贴的字（临时摊的幌子） */
export function damageHouse(S: ArchBuilder, O: ArchBuilder, d: HouseDmg): Plaque[] {
  const R = S.raw(), n3 = R.count;
  const rnd = mulberry32(d.seed >>> 0), Rr = (a: number, b: number) => a + (b - a) * rnd();
  let baseY = Infinity, topY = -Infinity;
  for (let i = 0; i < n3; i++) { const y = R.p[i * 3 + 1]; if (y < baseY) baseY = y; if (y > topY) topY = y; }
  if (!(n3 > 0)) return [];
  const W = d.x1 - d.x0, D = d.z1 - d.z0, small = Math.min(W, D);
  // 屋面上可以挖洞 / 掉瓦的地方：朝镜头那一侧（本地 +z 是朝南、朝镜头）或平的屋面，面积大的优先
  const cand: { i: number; a: number }[] = [];
  let roofC: RGB = [0, 0, 0], roofN = 0;
  for (let t = 0; t < n3 / 3; t++) {
    const i = t * 3;
    if (!isRoof(R, i)) continue;
    roofC = [roofC[0] + R.c[i * 3], roofC[1] + R.c[i * 3 + 1], roofC[2] + R.c[i * 3 + 2]]; roofN++;
    if (R.n[i * 3 + 2] < -0.15 || R.p[i * 3 + 1] < baseY + 30) continue;
    cand.push({ i, a: triArea(R, i) });
  }
  const tileC: RGB = roofN ? mulc(roofC, 0.85 / roofN) : TILE;
  cand.sort((a, b) => b.a - a.a);
  const regions: Region[] = [];
  const pickOn = (i: number, low: number): { P: V3; n: V3 } => {
    let u = Rr(0.15, 0.7), v = Rr(0.15, 0.7); if (u + v > 0.9) { u *= 0.6; v *= 0.6; }
    const p = R.p, A: V3 = [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]], B: V3 = [p[i * 3 + 3], p[i * 3 + 4], p[i * 3 + 5]], C: V3 = [p[i * 3 + 6], p[i * 3 + 7], p[i * 3 + 8]];
    let P = add(A, add(scl(sub(B, A), u), scl(sub(C, A), v)));
    // 洞往檐口那边挪（屋面下半截朝着镜头，看得清）：往这块三角形里最低、最靠外的那条边拉一拉
    if (low > 0) { const lo = [A, B, C].sort((a, b) => a[1] - b[1]); const e = scl(add(lo[0], lo[1]), 0.5); P = add(P, scl(sub(e, P), low)); }
    return { P, n: norm([R.n[i * 3], R.n[i * 3 + 1], R.n[i * 3 + 2]]) };
  };
  const region = (k: 0 | 1, i: number, r: number) => {
    const q = pickOn(i, k === 0 ? 0.45 : 0);
    if (regions.some((g) => Math.hypot(g.x - q.P[0], g.z - q.P[2]) < (g.r + r) * 0.9)) return false;
    regions.push({ x: q.P[0], z: q.P[2], r, k, P: q.P, n: q.n, amp: [0, 1, 2, 3, 4].map((j) => Rr(-0.13, 0.13) / (1 + j * 0.3)), ph: [0, 1, 2, 3, 4].map(() => Rr(0, Math.PI * 2)) });
    return true;
  };
  if (d.tier >= 2) {
    const nh = W * D > 260000 ? 2 : 1, rH = Math.max(45, Math.min(120, small * 0.26));
    for (const c of cand) { if (regions.filter((g) => g.k === 0).length >= nh) break; region(0, c.i, rH * Rr(0.85, 1.1)); }
  }
  {
    const np = d.tier >= 2 ? 2 : 4, rP = Math.max(13, Math.min(24, small * 0.065));
    for (let k = 0, tries = 0; k < np && tries < 30 && cand.length; tries++) { const c = cand[Math.floor(rnd() * Math.min(cand.length, 12))]; if (region(1, c.i, rP * Rr(0.8, 1.25))) k++; }
  }
  /** 占地里（外扩 pad）：洞只挖在屋子上方，屋里变暗也只在占地里（门前的凉棚不算屋里） */
  const inFoot = (x: number, z: number, pad: number) => x > d.x0 - pad && x < d.x1 + pad && z > d.z0 - pad && z < d.z1 + pad;
  // 门脸在哪：正面那条边的中点；out(x, z) = 这一点在门脸外多远
  const fcx = Math.abs(d.fz) >= Math.abs(d.fx) ? (d.x0 + d.x1) / 2 : d.fx > 0 ? d.x1 : d.x0, fcz = Math.abs(d.fz) >= Math.abs(d.fx) ? (d.fz > 0 ? d.z1 : d.z0) : (d.z0 + d.z1) / 2;
  const outOf = (x: number, z: number) => (x - fcx) * d.fx + (z - fcz) * d.fz;
  // 屋里地面的高度（洞底下看见的那一层）：洞下方朝上的非屋面里最高的那片
  const floorOf = (g: Region) => {
    let fy = -Infinity;
    for (let t = 0; t < n3 / 3; t++) {
      const i = t * 3; if (isRoof(R, i) || R.n[i * 3 + 1] < 0.85) continue;
      const xs = [R.p[i * 3], R.p[i * 3 + 3], R.p[i * 3 + 6]], zs = [R.p[i * 3 + 2], R.p[i * 3 + 5], R.p[i * 3 + 8]];
      if (Math.max(...xs) - Math.min(...xs) < 40 || Math.max(...zs) - Math.min(...zs) < 40) continue;   // 屋身的顶（大块的平面），不是正脊、额枋那种细长条
      const cx = (xs[0] + xs[1] + xs[2]) / 3, cy = (R.p[i * 3 + 1] + R.p[i * 3 + 4] + R.p[i * 3 + 7]) / 3, cz = (zs[0] + zs[1] + zs[2]) / 3;
      if (cy < topY - 20 && cy > baseY + 20 && inFoot(cx, cz, -4) && Math.hypot(cx - g.x, cz - g.z) < g.r * 1.5 && cy > fy) fy = cy;
    }
    return fy > -Infinity ? fy : g.P[1] - 70;
  };
  const floors = regions.map((g) => (g.k === 0 ? floorOf(g) : 0));
  // ---- 拆三角形：碰到洞 / 掉瓦的那几块细分，按小三角形的中心分类
  const leaf = (a: Vx, b: Vx, c: Vx, roof: boolean, ny: number) => {
    const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
    let col: RGB | undefined, flat = false;
    for (let k = 0; k < regions.length; k++) {
      const g = regions[k], q = qOf(g, cx, cz);
      if (roof) {
        if (g.k === 0 && cy > floors[k] + 6 && inFoot(cx, cz, 45)) { if (q < 0.92) return; if (q < 1.12 && !col) col = mulc([a[6], a[7], a[8]], 0.45); }
        else if (g.k === 1 && q < 1.18) { col = q < 1 ? LATH : mulc([a[6], a[7], a[8]], 0.55); flat = q < 1; }
      } else if (g.k === 0 && ny > 0.85 && q < 1.05 && cy > baseY + 20 && cy <= floors[k] + 1 && inFoot(cx, cz, -4)) col = INSIDE;
    }
    put(O, a, col, flat); put(O, b, col, flat); put(O, c, col, flat);
  };
  const touch = (a: Vx, b: Vx, c: Vx) => {
    const x0 = Math.min(a[0], b[0], c[0]), x1 = Math.max(a[0], b[0], c[0]), z0 = Math.min(a[2], b[2], c[2]), z1 = Math.max(a[2], b[2], c[2]);
    let lim = 0;
    for (const g of regions) { const dx = Math.max(x0 - g.x, 0, g.x - x1), dz = Math.max(z0 - g.z, 0, g.z - z1); if (Math.hypot(dx, dz) < g.r * 1.3) { const l = g.k === 0 ? 15 : 9; lim = lim ? Math.min(lim, l) : l; } }
    return lim;
  };
  const split = (a: Vx, b: Vx, c: Vx, roof: boolean, ny: number, depth: number) => {
    const lim = touch(a, b, c);
    if (!lim) { put(O, a); put(O, b); put(O, c); return; }
    const ab = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), bc = Math.hypot(b[0] - c[0], b[1] - c[1], b[2] - c[2]), ca = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const L = Math.max(ab, bc, ca);
    if (L <= lim || depth > 11) { leaf(a, b, c, roof, ny); return; }
    if (L === ab) { const m = mid(a, b); split(a, m, c, roof, ny, depth + 1); split(m, b, c, roof, ny, depth + 1); }
    else if (L === bc) { const m = mid(b, c); split(a, b, m, roof, ny, depth + 1); split(a, m, c, roof, ny, depth + 1); }
    else { const m = mid(c, a); split(a, b, m, roof, ny, depth + 1); split(m, b, c, roof, ny, depth + 1); }
  };
  let awn: RGB | null = null, awnA = 0;
  const P = R.p;
  for (let t = 0; t < n3 / 3; t++) {
    const i = t * 3;
    // 快路：离洞、掉瓦的地方都远的三角形（绝大多数）直接照抄，不拆、不分配
    if (d.tier < 2 || outOf((P[i * 3] + P[i * 3 + 3] + P[i * 3 + 6]) / 3, (P[i * 3 + 2] + P[i * 3 + 5] + P[i * 3 + 8]) / 3) <= 25) {
      const x0 = Math.min(P[i * 3], P[i * 3 + 3], P[i * 3 + 6]), x1 = Math.max(P[i * 3], P[i * 3 + 3], P[i * 3 + 6]), z0 = Math.min(P[i * 3 + 2], P[i * 3 + 5], P[i * 3 + 8]), z1 = Math.max(P[i * 3 + 2], P[i * 3 + 5], P[i * 3 + 8]);
      let hit = false;
      for (const g of regions) { const dx = Math.max(x0 - g.x, 0, g.x - x1), dz = Math.max(z0 - g.z, 0, g.z - z1); if (dx * dx + dz * dz < g.r * g.r * 1.69) { hit = true; break; } }
      if (!hit) { for (let k = i; k < i + 3; k++) O.rawVertex(P[k * 3], P[k * 3 + 1], P[k * 3 + 2], R.n[k * 3], R.n[k * 3 + 1], R.n[k * 3 + 2], R.c[k * 3], R.c[k * 3 + 1], R.c[k * 3 + 2], R.t[k * 2], R.t[k * 2 + 1]); continue; }
    }
    const roof = isRoof(R, i);
    // 半塌：门脸外头挂着的（凉棚、招幌、挑杆）塌下来——原处拿掉，地上另画
    if (d.tier >= 2 && !roof) {
      const cx = (R.p[i * 3] + R.p[i * 3 + 3] + R.p[i * 3 + 6]) / 3, cy = (R.p[i * 3 + 1] + R.p[i * 3 + 4] + R.p[i * 3 + 7]) / 3, cz = (R.p[i * 3 + 2] + R.p[i * 3 + 5] + R.p[i * 3 + 8]) / 3;
      if (outOf(cx, cz) > 25 && cy > baseY + 30) { const a = triArea(R, i); if (a > awnA && R.t[i * 2 + 1] > -1.5) { awnA = a; awn = [R.c[i * 3], R.c[i * 3 + 1], R.c[i * 3 + 2]]; } continue; }
    }
    split(vtx(R, i), vtx(R, i + 1), vtx(R, i + 2), roof, R.n[i * 3 + 1], 0);
  }
  // ---- 洞里：断椽、断檩、屋里的瓦砾；洞沿挂着的几片瓦
  regions.forEach((g, k) => {
    const nv = g.n, dn = norm(add([0, -1, 0], scl(nv, nv[1]))), rv = norm(cross(nv, dn));
    if (g.k === 0) {
      const P = add(g.P, scl(nv, -4));
      for (const o of [-0.72, -0.36, 0, 0.36, 0.72]) {
        const base = add(P, scl(rv, o * g.r)), a = add(base, scl(dn, -g.r * 1.15));
        if (rnd() < 0.45) { const b = add(add(base, scl(dn, g.r * Rr(-0.1, 0.35))), [0, -g.r * Rr(0.3, 0.6), 0]); beam(O, a, b, Rr(5, 7), WOOD); }
        else beam(O, a, add(base, scl(dn, g.r * 1.15)), Rr(5, 7), WOOD);
      }
      // 檩：横着一根，中间断开往下塌
      const q = add(g.P, scl(nv, -8)), sag: V3 = [0, -g.r * 0.4, 0];
      beam(O, add(q, scl(rv, -g.r * 1.15)), add(add(q, scl(rv, -0.08 * g.r)), sag), 8, WOOD2);
      beam(O, add(add(q, scl(rv, 0.1 * g.r)), scl(sag, 0.7)), add(q, scl(rv, g.r * 1.15)), 8, WOOD2);
      // 屋里一堆瓦砾和断木（掉下来的那块屋顶）
      const fy = floors[k];
      for (let j = 0; j < 14; j++) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * g.r * 0.75; rbox(O, [g.x + Math.cos(a) * r, fy + Rr(2, 10), g.z + Math.sin(a) * r], rnd() * 6, Rr(-0.6, 0.6), Rr(-0.6, 0.6), Rr(5, 12), Rr(2, 4), Rr(4, 9), mulc(tileC, Rr(0.7, 1.05))); }
      for (let j = 0; j < 3; j++) { const a = rnd() * Math.PI * 2, r = rnd() * g.r * 0.5, c: V3 = [g.x + Math.cos(a) * r, fy + 6, g.z + Math.sin(a) * r]; beam(O, add(c, [-Rr(20, 40), Rr(0, 20), Rr(-10, 10)]), add(c, [Rr(20, 40), 0, Rr(-10, 10)]), 6, WOOD); }
      // 洞沿挂着、翘起来的瓦
      for (let j = 0; j < 7; j++) {
        const a = rnd() * Math.PI * 2, c = add(g.P, add(scl(rv, Math.cos(a) * g.r * 0.95), scl(dn, Math.sin(a) * g.r * 0.95)));
        const [ex, , ez] = axes(rnd() * 6, Rr(-0.9, 0.9), Rr(-0.9, 0.9));
        obox(O, add(c, scl(nv, 2)), ex, nv, ez, Rr(5, 9), 1.5, Rr(4, 7), mulc(tileC, Rr(0.8, 1.1)), true);
      }
    } else {
      // 掉了瓦的一片：几根挂瓦条横着
      for (const o of [-0.5, 0, 0.5]) { const c = add(add(g.P, scl(dn, o * g.r)), scl(nv, 1.3)); beam(O, add(c, scl(rv, -g.r * 0.85)), add(c, scl(rv, g.r * 0.85)), 2.6, mulc(WOOD2, 1.25)); }
    }
  });
  // ---- 墙裂：朝镜头的大块墙面上一两道之字形的裂缝（半塌的更多更粗）
  const walls: { i: number; a: number }[] = [];
  for (let t = 0; t < n3 / 3; t++) { const i = t * 3; if (isRoof(R, i) || Math.abs(R.n[i * 3 + 1]) > 0.2 || R.n[i * 3 + 2] < 0.6) continue; const a = triArea(R, i); if (a > 1800) walls.push({ i, a }); }
  walls.sort((a, b) => b.a - a.a);
  const nCr = d.tier >= 2 ? 3 : 1;
  for (let k = 0; k < Math.min(nCr, walls.length); k++) {
    const i = walls[Math.min(walls.length - 1, k * 2)].i, p = R.p;
    const xs = [p[i * 3], p[i * 3 + 3], p[i * 3 + 6]], ys = [p[i * 3 + 1], p[i * 3 + 4], p[i * 3 + 7]], zs = [p[i * 3 + 2], p[i * 3 + 5], p[i * 3 + 8]];
    const xa = Math.min(...xs), xb = Math.max(...xs), ya = Math.min(...ys), yb = Math.max(...ys), z = Math.max(...zs) + 0.9;
    if (xb - xa < 30 || yb - ya < 30) continue;
    let x = Rr(xa + (xb - xa) * 0.2, xb - (xb - xa) * 0.2), y = yb - Rr(2, 8);
    const w = d.tier >= 2 ? 3.2 : 2.2, segs = 5 + Math.floor(rnd() * 4);
    for (let s = 0; s < segs && y > ya + 6; s++) {
      const nx = Math.max(xa + 3, Math.min(xb - 3, x + Rr(-16, 16))), ny = Math.max(ya + 3, y - (yb - ya) * Rr(0.08, 0.17));
      const dx = nx - x, dy = ny - y, L = Math.hypot(dx, dy) || 1, ox = -dy / L * w / 2, oy = dx / L * w / 2;
      face(O, [x - ox, y - oy, z], [nx - ox, ny - oy, z], [nx + ox, ny + oy, z], [x + ox, y + oy, z], CRACK);
      face(O, [x + ox, y + oy, z], [nx + ox, ny + oy, z], [nx - ox, ny - oy, z], [x - ox, y - oy, z], CRACK);
      if (s === 2 && d.tier >= 2) { const bx = x + Rr(-30, 30), by = y - Rr(15, 35); face(O, [x, y - 1, z], [bx, by - 1, z], [bx, by + 1, z], [x, y + 1, z], CRACK); }
      x = nx; y = ny;
    }
  }
  // ---- 门前的碎瓦（半塌：一堆瓦砾、断木、几块泥灰）
  const front = Math.abs(d.fz) >= Math.abs(d.fx)
    ? { cx: (d.x0 + d.x1) / 2, cz: d.fz > 0 ? d.z1 : d.z0, ax: [1, 0] as [number, number], span: W }
    : { cx: d.fx > 0 ? d.x1 : d.x0, cz: (d.z0 + d.z1) / 2, ax: [0, 1] as [number, number], span: D };
  const atFront = (along: number, out: number): V3 => { const x = front.cx + front.ax[0] * along + d.fx * out, z = front.cz + front.ax[1] * along + d.fz * out; return [x, d.ground(x, z), z]; };
  const chips = d.tier >= 2 ? 26 : 7;
  const heapAt = Rr(-0.25, 0.25) * front.span;
  for (let j = 0; j < chips; j++) {
    const heap = d.tier >= 2 && j < 16, al = heap ? heapAt + Rr(-60, 60) : Rr(-0.4, 0.4) * front.span, out = heap ? Rr(6, 60) : Rr(8, 50);
    const P = atFront(al, out), h = heap ? Math.max(0, 14 - Math.hypot(al - heapAt, out - 30) * 0.18) : 0;
    rbox(O, [P[0], P[1] + 2 + h * rnd(), P[2]], rnd() * 6, Rr(-0.5, 0.5), Rr(-0.5, 0.5), Rr(5, 11), Rr(1.5, 3.5), Rr(4, 8), mulc(j % 4 === 0 ? DUSTY : tileC, Rr(0.75, 1.05)));
  }
  if (d.tier >= 2) {
    // 瓦砾堆底下一层土灰（压低的一个小丘）
    const C0 = atFront(heapAt, 30), rr = 62;
    for (let k = 0; k < 10; k++) { const a0 = k / 10 * Math.PI * 2, a1 = (k + 1) / 10 * Math.PI * 2; const p0: V3 = [C0[0] + Math.cos(a0) * rr, d.ground(C0[0] + Math.cos(a0) * rr, C0[2] + Math.sin(a0) * rr * 0.7) + 0.6, C0[2] + Math.sin(a0) * rr * 0.7], p1: V3 = [C0[0] + Math.cos(a1) * rr, d.ground(C0[0] + Math.cos(a1) * rr, C0[2] + Math.sin(a1) * rr * 0.7) + 0.6, C0[2] + Math.sin(a1) * rr * 0.7], top: V3 = [C0[0], C0[1] + 12, C0[2]]; face(O, p1, p0, top, top, mulc(DUSTY, 0.8)); }
    for (let j = 0; j < 4; j++) { const P = atFront(heapAt + Rr(-50, 50), Rr(10, 50)); beam(O, [P[0] - Rr(20, 45), P[1] + Rr(3, 14), P[2] + Rr(-14, 14)], [P[0] + Rr(20, 45), P[1] + Rr(2, 8), P[2] + Rr(-14, 14)], Rr(5, 8), WOOD); }
  }
  // ---- 半塌：塌下来的凉棚布盖在门前地上，两根撑杆倒着
  if (awn && awnA > 400) {
    const al0 = -heapAt * 0.6, w = Math.min(front.span * 0.55, 240);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
      const u0 = al0 - w / 2 + i * w / 4, u1 = u0 + w / 4, v0 = 50 + j * 50, v1 = v0 + 50;
      const h = (u: number, v: number) => 3 + 6 * Math.abs(Math.sin(u * 0.045 + v * 0.07 + d.seed));
      const P = (u: number, v: number) => { const q = atFront(u, v); return [q[0], q[1] + h(u, v), q[2]] as V3; };
      // 正面朝上：按门脸朝向定绕向
      const a = P(u0, v0), b = P(u1, v0), c = P(u1, v1), e = P(u0, v1);
      if (cross(sub(b, a), sub(c, a))[1] >= 0) face(O, a, b, c, e, mulc(awn, (i + j) % 2 ? 0.82 : 1)); else face(O, a, e, c, b, mulc(awn, (i + j) % 2 ? 0.82 : 1));
    }
    for (let j = 0; j < 2; j++) { const P = atFront(al0 + (j ? 1 : -1) * w * 0.45, 70); beam(O, [P[0], P[1] + 3, P[2]], add(P, [Rr(-60, 60), 3, Rr(-60, 60)]), 4, lin('#8a7050')); }
  }
  // ---- 脚手架：竹竿两排、横杆、斜撑、跳板（门脸一面；门脸不朝镜头的，朝镜头那面也搭）
  if (d.scaffold) {
    const H = baseY + (topY - baseY) * 0.8;
    const sides: { ax: [number, number]; cx: number; cz: number; nx: number; nz: number; span: number }[] = [{ ax: front.ax, cx: front.cx, cz: front.cz, nx: d.fx, nz: d.fz, span: front.span }];
    if (d.fz < 0.5) sides.push({ ax: [1, 0], cx: (d.x0 + d.x1) / 2, cz: d.z1, nx: 0, nz: 1, span: W });
    for (const s of sides) {
      const n = Math.max(2, Math.round(s.span / 80)), step = s.span / n;
      const P = (al: number, out: number, y: number): V3 => [s.cx + s.ax[0] * al + s.nx * out, y, s.cz + s.ax[1] * al + s.nz * out];
      const gy = (al: number, out: number) => { const p = P(al, out, 0); return d.ground(p[0], p[2]); };
      for (let i = 0; i <= n; i++) for (const out of [16, 40]) {
        const al = -s.span / 2 + i * step, g0 = gy(al, out);
        beam(O, P(al, out, g0), P(al, out, H + 16), 4, BAMBOO);
      }
      const levels: number[] = []; for (let y = baseY + 55; y < H; y += 60) levels.push(y);
      for (const y of levels) for (const out of [16, 40]) beam(O, P(-s.span / 2 - 6, out, y), P(s.span / 2 + 6, out, y), 3, BAMBOO);
      for (let i = 0; i < n; i++) { const al = -s.span / 2 + i * step, y0 = levels[0] ?? baseY + 50, y1 = levels[Math.min(levels.length - 1, 2)] ?? H; beam(O, P(al, 40, i % 2 ? y0 : y1), P(al + step, 40, i % 2 ? y1 : y0), 2.6, mulc(BAMBOO, 0.85)); }
      for (const y of levels.slice(0, 2)) for (let i = 0; i < n; i++) { const a = -s.span / 2 + i * step + 4, b = a + step - 8; const c = P((a + b) / 2, 28, y + 2.5); const [ex, ey, ez] = s.ax[0] ? axes(0, 0, 0) : axes(Math.PI / 2, 0, 0); obox(O, c, ex, ey, ez, (b - a) / 2, 1.5, 11, PLANK); }
    }
  }
  // ---- 临时摊（半塌的铺子）：门口一张方桌、一块红布、几样货、一根杆子挑着布幌子
  const plaques: Plaque[] = [];
  if (d.fn && d.tier >= 2) {
    const side = Math.abs(heapAt) < front.span * 0.12 ? (heapAt > 0 ? -1 : 1) : -Math.sign(heapAt);
    const al = side * front.span * 0.3, P = atFront(al, 105), yaw = Math.atan2(front.ax[1], front.ax[0]) * -1;
    const [ex, ey, ez] = axes(yaw, 0, 0);
    obox(O, [P[0], P[1] + 40, P[2]], ex, ey, ez, 48, 3, 24, TABLE);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) obox(O, add(P, add(add(scl(ex, sx * 42), scl(ez, sz * 18)), [0, 19, 0])), ex, ey, ez, 2.5, 19, 2.5, mulc(TABLE, 0.7));
    obox(O, [P[0], P[1] + 44, P[2]], ex, ey, ez, 50, 1, 26, CLOTH);
    face(O, add(P, add(scl(ex, -50), add(scl(ez, 26.5), [0, 18, 0]))), add(P, add(scl(ex, 50), add(scl(ez, 26.5), [0, 18, 0]))), add(P, add(scl(ex, 50), add(scl(ez, 26.5), [0, 45, 0]))), add(P, add(scl(ex, -50), add(scl(ez, 26.5), [0, 45, 0]))), mulc(CLOTH, 0.85));
    for (let j = 0; j < 4; j++) obox(O, add(P, add(scl(ex, -30 + j * 20), [0, 52, Rr(-8, 8)])), ex, ey, ez, 6, 6 + (j % 2) * 3, 6, lin(['#c8a050', '#7a8a4a', '#d8c8a0', '#6a7a8a'][j]));
    // 布幌子：竹竿 + 横杆 + 一幅布，字朝镜头
    const pole = add(P, scl(ex, 56)), top = pole[1] + 170;
    beam(O, pole, [pole[0], top, pole[2]], 5, mulc(WOOD2, 1.1));
    beam(O, [pole[0] - 2, top - 6, pole[2]], [pole[0] - 2, top - 6, pole[2] + 42], 4, mulc(WOOD2, 1.1));
    const bx0 = pole[0] - 15, bx1 = pole[0] + 15, by0 = top - 100, by1 = top - 10, bz = pole[2] + 30;
    const BAN = lin('#e8dcc0');
    face(O, [bx0, by0, bz], [bx1, by0, bz], [bx1, by1, bz], [bx0, by1, bz], BAN);
    face(O, [bx1, by0, bz - 0.4], [bx0, by0, bz - 0.4], [bx0, by1, bz - 0.4], [bx1, by1, bz - 0.4], mulc(BAN, 0.8));
    if (d.sign) plaques.push({ p: [bx0 + 2, by0 + 6, bz + 0.5, bx1 - 2, by0 + 6, bz + 0.5, bx1 - 2, by1 - 6, bz + 0.5, bx0 + 2, by1 - 6, bz + 0.5], text: d.sign, kind: 'banner', color: '#e8dcc0' });
  }
  return plaques;
}

// ---------------------------------------------------------------- 牌坊（和别的高的单件）：齐腰断开
/** S 里的整件按 cut 高度切开：下半截留着、断口封一块茬、上半截碎在脚下（rubble = false 时只留下半截：倒下的过程里用） */
export function snapPiece(S: ArchBuilder, O: ArchBuilder, o: { seed: number; cutK: number; rubble: boolean; ground: (x: number, z: number) => number }) {
  const R = S.raw(), n3 = R.count; if (!n3) return;
  const rnd = mulberry32(o.seed >>> 0), Rr = (a: number, b: number) => a + (b - a) * rnd();
  let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  let roofC: RGB = [0, 0, 0], rn = 0, trimC: RGB = [0, 0, 0], tn = 0;
  for (let i = 0; i < n3; i++) { const x = R.p[i * 3], y = R.p[i * 3 + 1], z = R.p[i * 3 + 2]; y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const cut = y0 + (y1 - y0) * o.cutK;
  const cutAt = (x: number, z: number) => cut + 14 * Math.sin(x * 0.07 + z * 0.05) + 8 * Math.sin(x * 0.19 + 1.3);
  const edges: V3[] = [];
  for (let t = 0; t < n3 / 3; t++) {
    const i = t * 3, vs = [vtx(R, i), vtx(R, i + 1), vtx(R, i + 2)];
    const roof = isRoof(R, i);
    if (roof) { roofC = [roofC[0] + vs[0][6], roofC[1] + vs[0][7], roofC[2] + vs[0][8]]; rn++; } else if (vs[0][1] > cut) { trimC = [trimC[0] + vs[0][6], trimC[1] + vs[0][7], trimC[2] + vs[0][8]]; tn++; }
    const cx = (vs[0][0] + vs[1][0] + vs[2][0]) / 3, cz = (vs[0][2] + vs[1][2] + vs[2][2]) / 3, c = cutAt(cx, cz);
    const inside = vs.map((v) => v[1] <= c);
    if (inside.every(Boolean)) { for (const v of vs) put(O, v); continue; }
    if (!inside.some(Boolean)) continue;
    // 一个平面切三角形（Sutherland–Hodgman）：切出来 3 或 4 个点
    const poly: Vx[] = [];
    for (let k = 0; k < 3; k++) {
      const a = vs[k], b = vs[(k + 1) % 3], ia = inside[k], ib = inside[(k + 1) % 3];
      if (ia) poly.push(a);
      if (ia !== ib) { const u = (c - a[1]) / (b[1] - a[1]); const m = lerpV(a, b, u); poly.push(m); edges.push([m[0], m[1], m[2]]); }
    }
    for (let k = 1; k + 1 < poly.length; k++) { put(O, poly[0]); put(O, poly[k]); put(O, poly[k + 1]); }
  }
  // 断口：按断点聚成几簇（每根柱子一簇），封一块参差的茬
  const STUB = lin('#6a5444');
  const groups: { x0: number; x1: number; z0: number; z1: number; y: number }[] = [];
  for (const e of edges) {
    let g = groups.find((q) => e[0] > q.x0 - 30 && e[0] < q.x1 + 30 && e[2] > q.z0 - 30 && e[2] < q.z1 + 30);
    if (!g) groups.push(g = { x0: e[0], x1: e[0], z0: e[2], z1: e[2], y: e[1] });
    g.x0 = Math.min(g.x0, e[0]); g.x1 = Math.max(g.x1, e[0]); g.z0 = Math.min(g.z0, e[2]); g.z1 = Math.max(g.z1, e[2]); g.y = Math.max(g.y, e[1]);
  }
  for (const g of groups) {
    const w = g.x1 - g.x0, d = g.z1 - g.z0; if (w > 80 || d > 80) continue;
    const c: V3 = [(g.x0 + g.x1) / 2, g.y - 2, (g.z0 + g.z1) / 2];
    rbox(O, c, 0, 0, 0, w / 2 + 1, 3, d / 2 + 1, STUB);
    for (let j = 0; j < 3; j++) rbox(O, add(c, [Rr(-w / 3, w / 3), Rr(2, 9), Rr(-d / 3, d / 3)]), rnd() * 6, Rr(-0.4, 0.4), Rr(-0.4, 0.4), Math.max(1.5, w * 0.18), Rr(3, 8), Math.max(1.5, d * 0.18), STUB);
  }
  if (!o.rubble) return;
  // 上半截碎在脚下：几大块屋檐（瓦色）、几截横梁、一地碎片——都落在牌坊脚下左右，不横在街心
  const rc: RGB = rn ? mulc(roofC, 1 / rn) : TILE, tc: RGB = tn ? mulc(trimC, 1 / tn) : WOOD2;
  const along = x1 - x0 >= z1 - z0, L = along ? x1 - x0 : z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const at = (u: number, v: number): V3 => { const x = along ? cx + u : cx + v, z = along ? cz + v : cz + u; return [x, o.ground(x, z), z]; };
  for (let j = 0; j < 7; j++) { const P = at(Rr(-0.5, 0.5) * L, Rr(-40, 40)); rbox(O, [P[0], P[1] + 6, P[2]], (along ? 0 : Math.PI / 2) + Rr(-0.5, 0.5), Rr(-0.35, 0.35), Rr(-0.35, 0.35), Rr(16, 34), Rr(3, 6), Rr(10, 22), mulc(rc, Rr(0.8, 1.05))); }
  for (let j = 0; j < 4; j++) { const P = at(Rr(-0.45, 0.45) * L, Rr(-30, 30)), a = (along ? 0 : Math.PI / 2) + Rr(-0.6, 0.6), l = Rr(30, 70); beam(O, [P[0] - Math.cos(a) * l, P[1] + Rr(3, 12), P[2] - Math.sin(a) * l], [P[0] + Math.cos(a) * l, P[1] + 4, P[2] + Math.sin(a) * l], Rr(7, 11), tc); }
  for (let j = 0; j < 24; j++) { const P = at(Rr(-0.55, 0.55) * L, Rr(-55, 55)); rbox(O, [P[0], P[1] + 2, P[2]], rnd() * 6, Rr(-0.5, 0.5), Rr(-0.5, 0.5), Rr(4, 9), Rr(1.5, 3), Rr(3, 7), mulc(j % 3 ? rc : DUSTY, Rr(0.75, 1.05))); }
}

// ---------------------------------------------------------------- 小件的残骸（本地坐标，正面朝 +z，脚下 y = 0；cityPieces.kit 在原处拼进去）
export function kitDebris(B: ArchBuilder, kind: string, color: string, seed: number) {
  const rnd = mulberry32(seed >>> 0), Rr = (a: number, b: number) => a + (b - a) * rnd();
  const C = lin(color), POLE = lin('#5a4030'), POLE2 = lin('#6a5038'), BOARD = lin('#8a6a48');
  const GOODS = ['#c8a050', '#9a6a3a', '#7a8a4a', '#c86a3a', '#d8c8a0', '#6a7a8a', '#a8432f'].map(lin);
  const scatter = (n: number, R: number, s: number) => { for (let j = 0; j < n; j++) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * R; rbox(B, [Math.cos(a) * r, Rr(3, 6), Math.sin(a) * r * 0.7], rnd() * 6, Rr(-0.5, 0.5), Rr(-0.5, 0.5), s * Rr(0.6, 1.2), s * Rr(0.6, 1.1), s * Rr(0.6, 1.2), GOODS[Math.floor(rnd() * GOODS.length)]); } };
  const lying = (len: number, t: number, col: RGB, y = 3) => { const a = rnd() * Math.PI * 2, x = Rr(-30, 30), z = Rr(-20, 20); beam(B, [x - Math.cos(a) * len / 2, y, z - Math.sin(a) * len / 2], [x + Math.cos(a) * len / 2, y + Rr(0, 4), z + Math.sin(a) * len / 2], t, col); };
  const cloth = (w: number, d: number, col: RGB) => {
    // 塌在地上的布：几块起伏的面
    const a = Rr(-0.3, 0.3), ca = Math.cos(a), sa = Math.sin(a), P = (x: number, z: number, y: number): V3 => [x * ca - z * sa, y, x * sa + z * ca];
    const n = 3;
    for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) {
      const u0 = -w / 2 + i * w / n, u1 = u0 + w / n, v0 = -d / 2 + j * d / 2, v1 = v0 + d / 2;
      const h = (x: number, z: number) => 4 + 7 * Math.abs(Math.sin(x * 0.05 + z * 0.09 + seed));
      face(B, P(u0, v1, h(u0, v1)), P(u1, v1, h(u1, v1)), P(u1, v0, h(u1, v0)), P(u0, v0, h(u0, v0)), mulc(col, (i + j) % 2 ? 0.85 : 1));
    }
  };
  switch (kind) {
    case 'stall':
      rbox(B, [Rr(-8, 8), 10, Rr(-6, 6)], Rr(-0.3, 0.3), Rr(-0.2, 0.2), Rr(0.18, 0.32), 55, 4, 28, BOARD);   // 案板歪在地上
      for (let j = 0; j < 3; j++) lying(Rr(24, 32), 5, POLE);   // 案腿
      for (let j = 0; j < 3; j++) lying(Rr(80, 118), 4, POLE2);   // 撑杆
      cloth(132, 76, C);
      scatter(7, 70, 8);
      break;
    case 'umb':
      lying(110, 4, POLE);
      { const tilt = Rr(1.3, 1.5), cx = Rr(20, 40), [ex, ey, ez] = axes(rnd() * 6, tilt, 0);
        const apex = add([cx, 16, 0], scl(ey, 26));
        for (let i = 0; i < 10; i++) { const a0 = i / 10 * Math.PI * 2, a1 = (i + 1) / 10 * Math.PI * 2; const p0 = add([cx, 16, 0], add(scl(ex, Math.cos(a0) * 60), scl(ez, Math.sin(a0) * 60))), p1 = add([cx, 16, 0], add(scl(ex, Math.cos(a1) * 60), scl(ez, Math.sin(a1) * 60))); face(B, p0, p1, apex, apex, mulc(C, i % 2 ? 0.85 : 1)); face(B, p1, p0, apex, apex, mulc(C, 0.6)); } }
      rbox(B, [30, 10, 10], Rr(-0.4, 0.4), 0, Rr(0.2, 0.5), 25, 8, 20, lin('#9a7a50'));
      break;
    case 'goods': scatter(10, 60, 9); break;
    case 'crate':
      for (let j = 0; j < 6; j++) rbox(B, [Rr(-30, 40), Rr(2, 6), Rr(-25, 30)], rnd() * 6, Rr(-0.3, 0.3), Rr(-0.3, 0.3), Rr(14, 22), 1.5, Rr(3, 5), mulc(BOARD, Rr(0.85, 1.1)));
      rbox(B, [30, 14, 20], Rr(-0.3, 0.3), Rr(-0.2, 0.2), Rr(0.3, 0.6), 17, 14, 17, lin('#9a7a50'));
      break;
    case 'barrel':
      for (const [x, z] of [[Rr(-10, 10), Rr(-10, 10)], [Rr(30, 50), Rr(0, 20)]]) { const a = rnd() * Math.PI; for (let k = 0; k < 8; k++) { const t0 = k / 8 * Math.PI * 2, r = 15; rbox(B, [x + Math.cos(a) * 0, 15 + Math.cos(t0) * r, z + Math.sin(t0) * r * 0.2], a, 0, t0, 19, 1.5, 6, mulc(lin('#7a5a3a'), k % 2 ? 0.85 : 1)); } }
      break;
    case 'cart':
      rbox(B, [Rr(-10, 10), 22, 0], Rr(-0.2, 0.2), Rr(-0.15, 0.15), Rr(0.25, 0.4), 70, 4, 30, BOARD);
      for (let j = 0; j < 2; j++) rbox(B, [Rr(-60, 60), 4, Rr(30, 50) * (j ? 1 : -1)], rnd() * 6, Math.PI / 2, 0, 22, 22, 3, lin('#5a4030'));
      lying(90, 5, POLE);
      scatter(5, 70, 9);
      break;
    case 'lamp':
      { const a = Rr(-0.6, 0.6) + (rnd() < 0.5 ? 0 : Math.PI); beam(B, [0, 4, 0], [Math.cos(a) * 140, 4, Math.sin(a) * 140 * 0.8], 7, lin('#4a3a2a'));
        rbox(B, [Math.cos(a) * 150, 8, Math.sin(a) * 150 * 0.8 + 10], rnd() * 6, Rr(-0.4, 0.4), Rr(0.5, 1.2), 9, 7, 9, lin('#b83a2a')); }
      break;
    case 'flag':
      { const a = Rr(-0.5, 0.5) + (rnd() < 0.5 ? 0 : Math.PI), L = 250; beam(B, [0, 4, 0], [Math.cos(a) * L, 4, Math.sin(a) * L * 0.8], 7, lin('#4a3a2a'));
        const P = (u: number, v: number): V3 => [Math.cos(a) * u - Math.sin(a) * v, 5 + 3 * Math.abs(Math.sin(u * 0.05)), Math.sin(a) * u * 0.8 + Math.cos(a) * v];
        face(B, P(140, 0), P(250, 0), P(250, 60), P(140, 60), C); }
      break;
    case 'laundry':
      lying(120, 4, POLE); lying(110, 4, POLE);
      cloth(80, 40, lin('#e8e0d0'));
      break;
    default:
      scatter(5, 40, 8);
  }
}

// ---------------------------------------------------------------- 城墙：焦痕、掉砖（墙面上，不开口子）、墙脚碎砖
export interface WallMarkGeo { x: number; z: number; y: number; nx: number; nz: number; s: number; seed: number; col: RGB; ground: number }
export function wallMarks(O: ArchBuilder, list: WallMarkGeo[]) {
  for (const m of list) {
    const rnd = mulberry32(m.seed >>> 0), Rr = (a: number, b: number) => a + (b - a) * rnd();
    const N: V3 = [m.nx, 0, m.nz], T: V3 = [m.nz, 0, -m.nx], UP: V3 = [0, 1, 0];
    const C0: V3 = [m.x + m.nx * 1.6, m.y, m.z + m.nz * 1.6];
    const at = (u: number, v: number, off = 0): V3 => add(add(C0, add(scl(T, u), scl(UP, v))), scl(N, off));
    // 焦痕：不规则的一团，越往外越淡（几圈颜色由深到浅）
    const R0 = 46 * m.s, ph = [Rr(0, 6), Rr(0, 6), Rr(0, 6)];
    const rad = (a: number) => R0 * (1 + 0.22 * Math.sin(3 * a + ph[0]) + 0.14 * Math.sin(5 * a + ph[1]) + 0.08 * Math.sin(7 * a + ph[2]));
    for (const [k, c] of [[1, 0.62], [0.72, 0.42], [0.42, 0.26]] as [number, number][]) {
      const col = mulc(m.col, c), n = 16;
      for (let i = 0; i < n; i++) { const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2; face(O, at(0, 0, k * 0.2), at(Math.cos(a0) * rad(a0) * k, Math.sin(a0) * rad(a0) * k * 0.8, k * 0.2), at(Math.cos(a1) * rad(a1) * k, Math.sin(a1) * rad(a1) * k * 0.8, k * 0.2), at(0, 0, k * 0.2), col); }
    }
    // 掉了砖的坑：几块暗下去的砖位，上沿一道亮边
    const nb = 3 + Math.floor(rnd() * 4 * m.s);
    for (let j = 0; j < nb; j++) {
      const u = Rr(-0.5, 0.5) * R0, v = Rr(-0.4, 0.4) * R0, bw = Rr(12, 18), bh = 7;
      face(O, at(u - bw, v - bh, 1.1), at(u + bw, v - bh, 1.1), at(u + bw, v + bh, 1.1), at(u - bw, v + bh, 1.1), mulc(m.col, 0.2));
      face(O, at(u - bw, v + bh - 1.5, 1.2), at(u + bw, v + bh - 1.5, 1.2), at(u + bw, v + bh, 1.2), at(u - bw, v + bh, 1.2), mulc(m.col, 1.15));
    }
    // 墙脚的碎砖
    for (let j = 0; j < 6; j++) { const u = Rr(-0.6, 0.6) * R0, out = Rr(10, 60); const P: V3 = [m.x + T[0] * u + m.nx * out, m.ground + 4, m.z + T[2] * u + m.nz * out]; rbox(O, P, rnd() * 6, Rr(-0.4, 0.4), Rr(-0.4, 0.4), Rr(7, 12), Rr(3, 5), Rr(4, 7), mulc(m.col, Rr(0.7, 1.0))); }
  }
}
