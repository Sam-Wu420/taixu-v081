// r11-lock：锁定标记（立体画面里画；只在有立体投影时画，平面兼容画法仍用 combatfx.ts 里原来那圈椭圆）。
//   · 脚下一圈锁定环：横躺在单位脚下的高度上（被击飞、御剑、腾起都跟着走，地面起伏跟着贴），一圈实线 + 三段反向旋转的弧；
//     颜色按态度：敌对朱红、中立金色、友方青色（world/locktarget.ts 的 lockStance）；
//   · 头顶一枚竖长的菱形 + 下指的「V」（名牌上方），上下轻轻浮动；
//   · 透过遮挡：箭头整个、锁定环朝镜头的那半圈再画一层淡的「透视」版（深度写成最近，树和房子挡不住）——
//     半圈只取朝镜头的那一半，免得透视层盖在被锁的人自己身上；
//   · 换目标：环从两倍多大收缩落定、外面一圈亮环一闪、箭头从上面落下来（手动锁上更亮）；
//   · 目标在画面外：屏幕边缘出一枚指向它的箭头（避开四角的人物牌、小地图和底下的快捷栏）。
// 只用现成的图集格（Beam / Glow / Disc；菱形和「V」用 Disc 格正中的实心一小块拼），不改图集和混合方式；抖动、旋转全按时间算，不取 Math.random。
import type { Combat, Enemy } from '../world/combat';
import { FLOATS } from './batch';
import { FxSys, mixc, type RGB } from './fx';
import { C, cellUV } from './atlas';
import { lockStance, LOCK_RGB, LOCK_SNAP, lockHeadH } from '../world/locktarget';
import { enemyVis } from '../world/combatfx';

const TAU = Math.PI * 2;
const WHITE: RGB = [1, 1, 1];
const INK: RGB = [0.06, 0.04, 0.03];
const pts = new Float64Array(2 * 80);

/** 把 from 之后新加的顶点深度改成最近（-1）：透过树、房子也看得见 */
function xray(F: FxSys, from: number) { const d = F.B.data; for (let i = from; i < F.B.n; i++) d[i * FLOATS + 8] = -1; }

/** 一段水平的弧（世界坐标，脚下 z 高处），从 a0 到 a1；ends = 两头淡出 */
function arc(F: FxSys, x: number, y: number, r: number, a0: number, a1: number, z: number, w: number, c: RGB, a: number, add: number, ends: boolean) {
  const n = Math.max(3, Math.min(79, Math.ceil(Math.abs(a1 - a0) / TAU * 64) + 1));
  for (let i = 0; i < n; i++) { const an = a0 + (a1 - a0) * i / (n - 1); pts[i * 2] = x + Math.cos(an) * r; pts[i * 2 + 1] = y + Math.sin(an) * r; }
  F.B.strip(C.Beam, pts, n, () => w, ends ? (i) => a * Math.min(1, Math.sin(Math.PI * i / (n - 1)) * 2.2) : () => a, c[0], c[1], c[2], add, -z);
}

/** 实心：取 Disc 格正中间一小块（全白），quadS 画出来就是实心的矩形 / 菱形 */
let SOLID: [number, number, number, number] | null = null;
function solid(F: FxSys, x: number, y: number, w: number, h: number, rot: number, c: RGB, a: number, add: number, sq = 1) {
  if (!SOLID) { const [u0, v0, u1, v1] = cellUV(C.Disc), cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, du = (u1 - u0) * 0.06, dv = (v1 - v0) * 0.06; SOLID = [cu - du, cv - dv, cu + du, cv + dv]; }
  F.B.quadS(C.Disc, x, y, w, h, rot, c[0], c[1], c[2], a, add, SOLID, sq);
}
/** 屏幕空间的「V」形箭头：尖在 (x, y)，指向 ang；L 臂长、th 粗 */
function chevron(F: FxSys, x: number, y: number, ang: number, L: number, th: number, c: RGB, a: number, add: number) {
  for (const sgn of [-1, 1]) { const d = ang + Math.PI + sgn * 0.68; solid(F, x + Math.cos(d) * L * 0.5, y + Math.sin(d) * L * 0.5, L + th * 0.6, th, d, c, a, add); }
}
/** 指向 ang 的箭头：外面一团光、描黑边、填色、白芯 */
function arrowS(F: FxSys, sx: number, sy: number, s: number, ang: number, c: RGB, a: number) {
  F.B.quadS(C.Glow, sx - Math.cos(ang) * s * 0.4, sy - Math.sin(ang) * s * 0.4, s * 3, s * 3, 0, c[0], c[1], c[2], 0.3 * a, 1);
  chevron(F, sx, sy, ang, s * 1.05, s * 0.62, INK, 0.85 * a, 0);
  chevron(F, sx, sy, ang, s, s * 0.38, c, a, 0.2);
  chevron(F, sx - Math.cos(ang) * s * 0.5, sy - Math.sin(ang) * s * 0.5, ang, s * 0.75, s * 0.3, mixc(c, WHITE, 0.25), 0.85 * a, 0.3);
}
/** 头顶的锁定标记：一枚竖长的菱形（描黑边、填色、左上一点白光），下面一个朝下的「V」 */
function headMark(F: FxSys, x: number, y: number, s: number, c: RGB, a: number) {
  F.B.quadS(C.Glow, x, y, s * 3.4, s * 3.4, 0, c[0], c[1], c[2], 0.34 * a, 1);
  solid(F, x, y - s * 0.55, s * 0.98, s * 0.98, Math.PI / 4, INK, 0.85 * a, 0, 1.45);
  solid(F, x, y - s * 0.55, s * 0.74, s * 0.74, Math.PI / 4, c, a, 0.15, 1.45);
  solid(F, x - s * 0.1, y - s * 0.72, s * 0.26, s * 0.26, Math.PI / 4, WHITE, 0.85 * a, 0.5, 1.45);
  chevron(F, x, y + s * 0.62, Math.PI / 2, s * 0.62, s * 0.36, INK, 0.85 * a, 0);
  chevron(F, x, y + s * 0.62, Math.PI / 2, s * 0.56, s * 0.2, c, a, 0.25);
}

/** 屏幕边缘的边距：上面让出人物牌 / 小地图那一行，下面让出快捷栏、摇杆 */
function edgeBox(W: number, H: number) { return { l: 46, r: W - 46, t: Math.min(120, H * 0.2), b: H - Math.min(150, H * 0.26) }; }

export function drawLockGL(F: FxSys, c: Combat, t: number) {
  const B = F.B, hd = B.hd;
  if (!hd) return;
  const e: Enemy | null = c.lock && !c.lock.dead ? c.lock : null;
  if (!e) return;
  const g = c.game;
  const vis = Math.max(0.35, enemyVis(c, e));
  const T = c.lockTrack, u = T.cur === e ? Math.min(1, T.since / LOCK_SNAP) : 1, ease = 1 - (1 - u) ** 3;
  const hard = T.hard && u < 1, manual = c.manual;
  const cc = LOCK_RGB[lockStance(e)], hot = mixc(cc, WHITE, 0.45);
  const size = Math.max(0.8, Math.min(2.4, e.def.look?.size ?? 1));
  const R0 = (e.def.kind === 'human' ? 44 : 50) * size, R = R0 * (1 + (hard ? 1.6 : 0.7) * (1 - ease));
  const z = e.z + 3, zoom = Math.max(0.2, g.cam.zoom), px = 1 / zoom;   // px：一个屏幕像素合多少世界单位（线宽按屏幕像素定，远近都看得清）
  const prevBb = B.billboard; B.billboard = null;
  const a = vis * (manual ? 1 : 0.82);
  // 脚下离画面太远（目标在画面外）：锁定环整个不画，只出边缘箭头
  B.pt(e.x, e.y);
  const fx = B.ox, fy = B.oy, M = 260 + R * B.os;
  const ringOn = Number.isFinite(fx) && fx > -M && fx < B.hw * 2 + M && fy > -M && fy < B.hh * 2 + M;
  if (ringOn) {
  // ---- 脚下的锁定环（深度照常：被身子、树挡住的那截就挡住）
  arc(F, e.x, e.y, R, 0, TAU, z, 16 * px, cc, 0.3 * a, 1, false);                  // 外晕
  arc(F, e.x, e.y, R, 0, TAU, z, 4.6 * px, hot, 1 * a, 0.5, false);              // 实线
  const spin = t * (manual ? 1.6 : 1.1);
  for (let k = 0; k < 3; k++) { const a0 = -spin + k * TAU / 3; arc(F, e.x, e.y, R * 1.26, a0, a0 + 0.95, z, 6.5 * px, cc, 0.95 * a, 0.35, true); }   // 三段反转的弧
  if (manual) for (let k = 0; k < 4; k++) { const a0 = spin * 0.6 + k * TAU / 4; arc(F, e.x, e.y, R * 0.78, a0, a0 + 0.42, z, 2.4 * px, hot, 0.7 * a, 0.6, true); }   // 手动锁定：里圈四个短刻
  // 落定那一下：外面一圈亮环往里收，一团光
  if (u < 1) {
    const k = 1 - u;
    arc(F, e.x, e.y, R0 * (1 + 2.6 * (1 - ease)), 0, TAU, z, (hard ? 7 : 4) * px, hot, (hard ? 0.95 : 0.5) * k * vis, 1, false);
    if (hard) { B.billboard = { x: e.x, y: e.y, offsetY: -(e.lift + e.flyH) }; F.glow(e.x, e.y - 50 * size, 90 * size, cc, 0.4 * k * vis); B.billboard = null; }
  }
  // ---- 透视层：朝镜头的那半圈，深度写成最近
  const n0 = B.n;
  const front = Math.atan2(hd.rx, -hd.ry);   // 地面上朝镜头的方向（屏幕向下）
  arc(F, e.x, e.y, R, front - Math.PI / 2, front + Math.PI / 2, z, 3.4 * px, cc, 0.45 * a, 0.5, true);
  xray(F, n0);
  }
  // 头顶箭头：名牌上方，上下浮动；锁上那一下从上面落下来
  const lift = e.lift + e.flyH, head = lockHeadH(e, zoom);
  B.billboard = { x: e.x, y: e.y, offsetY: -lift };
  B.pt(e.x, e.y - head);
  B.billboard = null;
  const hx = B.ox, hy = B.oy - 4 + Math.sin(t * 4.2) * 3.5 - (1 - ease) * (hard ? 46 : 18);
  const s = manual ? 22 : 18, W = B.hw * 2, H = B.hh * 2;
  const n1 = B.n;
  const onScreen = (hx > 8 && hx < W - 8 && hy > 8 && hy < H - 8 && Number.isFinite(hx) && Number.isFinite(hy)) || (fx > 8 && fx < W - 8 && fy > 8 && fy < H - 8);   // 头顶或脚下有一处在画面里就算在画面里
  if (onScreen) {
    // 顶上是顶栏堆叠（目标大血条、消息）：头顶标记被顶到那一带时往下让，贴在身子上（不让到脚下以下）
    const top = Math.min(edgeBox(W, H).t * 0.85, (Number.isFinite(fy) ? fy : H) - 24);
    headMark(F, hx, Math.max(hy - s * 0.8, top), s * (1 + (hard ? 0.5 : 0.2) * (1 - ease)), cc, Math.min(1, a + 0.15) * (0.4 + 0.6 * ease));
  } else {
    // ---- 画面外：边缘一枚指向它的箭头（从画面中心朝它的方向，夹在边距框上）
    let tx = fx, ty = fy;   // 脚下（地面点）
    if (!Number.isFinite(tx) || tx < -1e5) { tx = W / 2 + (e.x - g.player.x); ty = H / 2 + (e.y - g.player.y); }   // 在镜头背后：按地面方向
    const E = edgeBox(W, H), cx = W / 2, cy = (E.t + E.b) / 2, dx = tx - cx, dy = ty - cy;
    const kx = dx > 0 ? (E.r - cx) / dx : dx < 0 ? (E.l - cx) / dx : Infinity, ky = dy > 0 ? (E.b - cy) / dy : dy < 0 ? (E.t - cy) / dy : Infinity;
    const k = Math.min(kx, ky, 1), ex = cx + dx * k, ey = cy + dy * k, ang = Math.atan2(dy, dx);
    const pulse = 0.82 + 0.18 * Math.sin(t * 6);
    B.quadS(C.Disc, ex, ey, 46, 46, 0, INK[0], INK[1], INK[2], 0.5, 0);
    arrowS(F, ex + Math.cos(ang) * 6 * pulse, ey + Math.sin(ang) * 6 * pulse, 22, ang, cc, 0.95);
  }
  xray(F, n1);
  B.billboard = prevBb;
}
