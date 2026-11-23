// r16 夜无赦：贴图还没生成出来时的占位剪影（帧名 yws_<形态>_<姿势>，形态 h 人身 / b 半魔 / m 魔躯）。
// 照轮廓画一个紫黑色的魔修，手里一柄巨镰；每个姿势按下面的参数摆（身子前倾、下蹲、持镰那只手和镰的角度、另一只手、腿），
// 够玩法线先把招式接上、截图看得出挤压 / 翻转 / 残影。原画都朝左，这里也朝左画。
// 画布 320×400（人身 / 半魔）、400×400（魔躯）；脚在底边往上 12 像素处。在没有 document 的地方（node 测试）返回 null。

/** 姿势参数：lean 身子前倾（弧度，正 = 朝前 / 朝左倒）、crouch 下蹲 0–1、arm 持镰手臂的角度（0 = 朝前平伸，正 = 往上）、
 *  scythe 镰杆的角度（同上，镰刃在杆的前端、朝下勾）、off 另一只手、air 1 = 腾空（腿收起）、stride 两腿分开 0–1、wide 1 = 双臂张开 */
export interface YwsPoseArt { lean: number; crouch: number; arm: number; scythe: number; off: number; air?: number; stride?: number; wide?: number; noScythe?: boolean }
const D2R = Math.PI / 180;
const P = (lean: number, crouch: number, arm: number, scythe: number, off: number, ex: Partial<YwsPoseArt> = {}): YwsPoseArt => ({ lean: lean * D2R, crouch, arm: arm * D2R, scythe: scythe * D2R, off: off * D2R, ...ex });
/** 姿势表（名字和 world/yewushe-anim.ts 的 YWS_POSES 一一对应；没列的按 idle 画） */
export const PLACEHOLDER_POSES: Record<string, YwsPoseArt> = {
  idle: P(4, 0.05, -50, 70, -70, { stride: 0.4 }),
  walk: P(8, 0.08, -40, 60, -60, { stride: 0.9 }),
  hurt: P(-18, 0.15, -80, 40, -120, { stride: 0.5 }),
  down: P(-70, 0.6, -150, -10, -160, { stride: 0.2 }),
  raise: P(-12, 0.1, 110, 150, 100, { stride: 0.6 }),
  windup: P(-10, 0.35, 160, 200, -120, { stride: 0.9 }),
  slash: P(22, 0.3, -10, -40, -150, { stride: 1 }),
  sweep: P(18, 0.45, 0, 10, -170, { stride: 1 }),
  upper: P(-8, 0.2, 80, 120, -100, { stride: 0.8 }),
  slam: P(40, 0.6, -40, -80, -60, { stride: 1 }),
  stab: P(25, 0.35, 5, 0, -160, { stride: 1 }),
  spin: P(0, 0.2, 10, 0, 170, { stride: 0.6, wide: 1 }),
  throw: P(28, 0.3, 30, 0, -150, { stride: 1, noScythe: true }),
  catch: P(-6, 0.1, 60, 110, -70, { stride: 0.5 }),
  cast: P(6, 0.1, -60, 60, 20, { stride: 0.6 }),
  grab: P(20, 0.25, -60, 60, 0, { stride: 0.9 }),
  claw: P(30, 0.4, -60, 50, 10, { stride: 1 }),
  fist: P(25, 0.3, -70, 50, 0, { stride: 1 }),
  roar: P(-22, 0.15, 30, 110, 40, { stride: 0.7, wide: 1 }),
  guard: P(-4, 0.25, 70, 100, 80, { stride: 0.5 }),
  dash: P(42, 0.45, -150, -170, -150, { stride: 1 }),
  leap: P(10, 0, 120, 160, 60, { air: 1 }),
  dive: P(35, 0, -20, -60, -40, { air: 1 }),
  charge: P(-5, 0.5, -120, -150, -80, { stride: 0.8 }),
  transform: P(-25, 0.3, 40, 90, 40, { stride: 0.8, wide: 1 }),
  summon: P(-6, 0.05, 100, 140, 100, { stride: 0.5, wide: 1 }),
  fly: P(8, 0, 60, 100, 60, { air: 1, wide: 1 }),
};

const cache = new Map<string, unknown>();
/** 画一张占位剪影（同一帧名只画一次） */
export function ywsPlaceholder(key: string): unknown {
  if (typeof document === 'undefined') return null;
  const hit = cache.get(key); if (hit) return hit;
  const m = /^yws_([hbm])_([a-z0-9]+)/.exec(key);
  const form = m?.[1] ?? 'h', pose = PLACEHOLDER_POSES[m?.[2] ?? 'idle'] ?? PLACEHOLDER_POSES.idle;
  const big = form === 'm', W = big ? 400 : 320, H = 400;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  paint(g, W, H, form, pose);
  cache.set(key, cv); return cv;
}

function paint(g: CanvasRenderingContext2D, W: number, H: number, form: string, p: YwsPoseArt) {
  const big = form === 'm', half = form === 'b';
  const S = big ? 1.0 : 0.82;                 // 整体比例
  const body = big ? '#2a1640' : '#1c1426', edge = big ? '#5b2a86' : '#3f2a5a', red = '#b0182a', blade = '#2a2a33', bladeEdge = '#c9b8ff';
  const footY = H - 12, cx = W * 0.52;
  const legL = (big ? 120 : 118) * S, torso = (big ? 130 : 105) * S, headR = (big ? 30 : 20) * S, armL = (big ? 105 : 82) * S;
  const air = p.air ?? 0, crouch = p.crouch, stride = p.stride ?? 0.5;
  const hipY = footY - legL * (1 - crouch * 0.45) - air * 40;
  const hipX = cx;
  // 朝左：前方 = -x。lean 正 = 往左倒
  const sh = { x: hipX - Math.sin(p.lean) * torso, y: hipY - Math.cos(p.lean) * torso };
  const head = { x: sh.x - Math.sin(p.lean) * headR * 1.3, y: sh.y - Math.cos(p.lean) * headR * 1.3 };
  g.lineCap = 'round'; g.lineJoin = 'round';
  const glowCol = big ? 'rgba(170,60,255,0.55)' : half ? 'rgba(150,50,230,0.45)' : 'rgba(120,60,200,0.3)';
  g.shadowColor = glowCol; g.shadowBlur = 14;
  // —— 魔躯的翼（身后）
  if (big) {
    g.fillStyle = '#1a0d28'; g.strokeStyle = edge; g.lineWidth = 3;
    const wx = sh.x + 30, wy = sh.y + 10, sp = (p.wide ?? 0) > 0 ? 1.25 : 0.85;
    g.beginPath(); g.moveTo(wx, wy);
    g.lineTo(wx + 150 * sp, wy - 120 * sp); g.lineTo(wx + 120 * sp, wy - 40 * sp); g.lineTo(wx + 170 * sp, wy - 10 * sp); g.lineTo(wx + 110 * sp, wy + 20 * sp); g.lineTo(wx + 140 * sp, wy + 70 * sp); g.lineTo(wx + 40, wy + 60);
    g.closePath(); g.fill(); g.stroke();
    // 尾
    g.strokeStyle = body; g.lineWidth = 14; g.beginPath(); g.moveTo(hipX + 10, hipY); g.quadraticCurveTo(hipX + 110, hipY + 20, hipX + 140, footY - 20); g.stroke();
  }
  // —— 斗篷（身后一片，往后飘）
  g.fillStyle = big ? '#24123a' : '#120c1a'; g.strokeStyle = red; g.lineWidth = 2;
  g.beginPath(); g.moveTo(sh.x + 6, sh.y); g.lineTo(sh.x + 60 * S + air * 20, hipY + 40 * S); g.lineTo(hipX + 80 * S, footY - 6 - air * 30); g.lineTo(hipX + 10, footY - 20 - air * 30); g.lineTo(hipX, hipY); g.closePath(); g.fill(); g.stroke();
  // —— 腿
  g.strokeStyle = body; g.lineWidth = (big ? 34 : 20) * S;
  const leg = (dir: number) => {
    const fx = hipX + dir * stride * 46 * S, fy = footY - air * 60;
    const kx = (hipX + fx) / 2 + (air ? -24 : -crouch * 22), ky = (hipY + fy) / 2 - (air ? 20 : 0) + crouch * 8;
    g.beginPath(); g.moveTo(hipX, hipY); g.lineTo(kx, ky); g.lineTo(fx, air ? fy - 10 : fy); g.stroke();
  };
  leg(-1); leg(1);
  // —— 躯干（袍子，下摆张开）
  g.fillStyle = body; g.strokeStyle = edge; g.lineWidth = 3;
  const tw = (big ? 46 : 28) * S;
  g.beginPath();
  g.moveTo(sh.x - tw, sh.y); g.lineTo(sh.x + tw, sh.y);
  g.lineTo(hipX + tw * 1.3, hipY + 34 * S); g.lineTo(hipX - tw * 1.5, hipY + 34 * S); g.closePath(); g.fill(); g.stroke();
  // 腰间的红带
  g.strokeStyle = red; g.lineWidth = 6 * S; g.beginPath(); g.moveTo(hipX - tw * 1.1, hipY - 4); g.lineTo(hipX + tw * 1.05, hipY - 4); g.stroke();
  if (big || half) { g.fillStyle = '#ff3048'; g.beginPath(); g.arc((sh.x + hipX) / 2, (sh.y + hipY) / 2 - 10, (big ? 12 : 6) * S, 0, Math.PI * 2); g.fill(); }
  // —— 头、角
  g.fillStyle = body; g.strokeStyle = edge; g.lineWidth = 3;
  g.beginPath(); g.arc(head.x, head.y, headR, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = '#ff2a3a'; g.beginPath(); g.arc(head.x - headR * 0.5, head.y - headR * 0.1, headR * 0.18, 0, Math.PI * 2); g.fill();
  const horn = (dx: number, len: number) => { g.fillStyle = '#0d0812'; g.beginPath(); g.moveTo(head.x + dx - 6, head.y - headR * 0.6); g.quadraticCurveTo(head.x + dx + len * 0.6, head.y - headR - len * 0.8, head.x + dx + len, head.y - headR - len * 0.3); g.lineTo(head.x + dx + 6, head.y - headR * 0.7); g.closePath(); g.fill(); };
  if (big) { horn(-10, 46); horn(12, 52); }
  else if (half) horn(6, 30);
  else { g.fillStyle = '#0a0610'; g.beginPath(); g.moveTo(head.x - headR, head.y); g.lineTo(head.x + headR * 1.6, head.y + headR * 2.2); g.lineTo(head.x + headR, head.y - headR); g.closePath(); g.fill(); }   // 披发
  // —— 另一只手（身后那只，先画）
  const arm = (ang: number, len: number, w: number, claw: boolean) => {
    // ang：0 = 朝前（左）平伸，正 = 往上
    const ex = sh.x - Math.cos(ang) * len * 0.55, ey = sh.y - Math.sin(ang) * len * 0.55;
    const hx = sh.x - Math.cos(ang) * len, hy = sh.y - Math.sin(ang) * len;
    g.strokeStyle = body; g.lineWidth = w; g.beginPath(); g.moveTo(sh.x, sh.y); g.lineTo(ex, ey + 4); g.lineTo(hx, hy); g.stroke();
    if (claw) { g.strokeStyle = '#ff3a5a'; g.lineWidth = 3; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx - Math.cos(ang + i * 0.35) * w * 1.1, hy - Math.sin(ang + i * 0.35) * w * 1.1); g.stroke(); } }
    return { x: hx, y: hy };
  };
  const w = (big ? 30 : 16) * S;
  if (p.wide) arm(p.off, armL, w, big || half); else arm(p.off, armL * 0.95, w * 0.9, big || half);
  // —— 持镰的手和镰
  const hand = arm(p.arm, armL, w, big);
  if (!p.noScythe) {
    const L = (big ? 300 : 250) * S, a = p.scythe;
    // 杆：从手往前后各伸一截（手握在杆的三成处）
    const ux = -Math.cos(a), uy = -Math.sin(a);
    const tipX = hand.x + ux * L * 0.65, tipY = hand.y + uy * L * 0.65, endX = hand.x - ux * L * 0.35, endY = hand.y - uy * L * 0.35;
    g.strokeStyle = '#2b1a12'; g.lineWidth = 7 * S; g.beginPath(); g.moveTo(endX, endY); g.lineTo(tipX, tipY); g.stroke();
    g.strokeStyle = red; g.lineWidth = 7 * S; g.beginPath(); g.moveTo(hand.x - ux * 10, hand.y - uy * 10); g.lineTo(hand.x + ux * 22, hand.y + uy * 22); g.stroke();
    // 刃：从杆头朝「杆的右手边」（画面上往下勾）弯出一大弯
    const nx = -uy, ny = ux;   // 杆的法线
    const bl = (big ? 170 : 140) * S;
    g.fillStyle = blade; g.strokeStyle = bladeEdge; g.lineWidth = 2.5;
    if (half || big) { g.shadowColor = 'rgba(190,70,255,0.95)'; g.shadowBlur = 26; }
    g.beginPath(); g.moveTo(tipX, tipY);
    g.quadraticCurveTo(tipX + ux * bl * 0.2 + nx * bl * 0.55, tipY + uy * bl * 0.2 + ny * bl * 0.55, tipX - ux * bl * 0.35 + nx * bl * 0.95, tipY - uy * bl * 0.35 + ny * bl * 0.95);
    g.quadraticCurveTo(tipX + nx * bl * 0.35 - ux * 10, tipY + ny * bl * 0.35 - uy * 10, tipX - ux * 18, tipY - uy * 18);
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#e8e0ff'; g.beginPath(); g.arc(tipX, tipY, 6 * S, 0, Math.PI * 2); g.fill();
  }
  g.shadowBlur = 0;
}
