// 原著名地与高阶妖物造型——火蟾兽、铁火蚁、金背妖螂、炼尸、银翼夜叉、古魔血焰
// 与 beast.ts 同一坐标约定：侧视朝右，脚底 y=0，体型 1 ≈ 狼
import type { BeastLook, BeastAnim } from './beast';
type G = CanvasRenderingContext2D;
type RGB = [number, number, number];
const TAU = Math.PI * 2;
const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const INK = 'rgba(24,18,14,0.72)';
const WHITE: RGB = [255, 250, 240];

function glowDot(g: G, x: number, y: number, r: number, col: string, a = 1) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}

function eye(g: G, x: number, y: number, r: number, col: string) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r * 3.2);
  gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(255,80,40,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 3.2, 0, TAU); g.fill();
  g.fillStyle = 'rgba(18,10,8,0.92)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.fillStyle = '#fff6dc'; g.beginPath(); g.arc(x + r * 0.22, y - r * 0.2, r * 0.42, 0, TAU); g.fill();
}

/** 无缝双段肌肉锥度肢体（单路径闭合，消除膝肘接缝与缺口） */
function muscleLimb(
  g: G,
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  r0: number, r1: number, r2: number,
  fill: string | CanvasGradient, outline = INK,
) {
  const d1x = x1 - x0, d1y = y1 - y0, l1 = Math.hypot(d1x, d1y) || 1;
  const u1x = d1x / l1, u1y = d1y / l1, n1x = -u1y, n1y = u1x;
  const d2x = x2 - x1, d2y = y2 - y1, l2 = Math.hypot(d2x, d2y) || 1;
  const u2x = d2x / l2, u2y = d2y / l2, n2x = -u2y, n2y = u2x;
  let nmx = n1x + n2x, nmy = n1y + n2y;
  const nmL = Math.hypot(nmx, nmy);
  if (nmL > 0.2) { nmx /= nmL; nmy /= nmL; } else { nmx = n1x; nmy = n1y; }

  g.beginPath();
  g.moveTo(x0 + n1x * r0, y0 + n1y * r0);
  g.quadraticCurveTo((x0 + x1) * 0.5 + n1x * (r0 + r1) * 0.54, (y0 + y1) * 0.5 + n1y * (r0 + r1) * 0.54, x1 + nmx * r1, y1 + nmy * r1);
  g.quadraticCurveTo((x1 + x2) * 0.5 + n2x * (r1 + r2) * 0.54, (y1 + y2) * 0.5 + n2y * (r1 + r2) * 0.54, x2 + n2x * r2, y2 + n2y * r2);
  g.quadraticCurveTo(x2 + u2x * r2 * 1.25, y2 + u2y * r2 * 1.25, x2 - n2x * r2, y2 - n2y * r2);
  g.quadraticCurveTo((x1 + x2) * 0.5 - n2x * (r1 + r2) * 0.52, (y1 + y2) * 0.5 - n2y * (r1 + r2) * 0.52, x1 - nmx * r1, y1 - nmy * r1);
  g.quadraticCurveTo((x0 + x1) * 0.5 - n1x * (r0 + r1) * 0.52, (y0 + y1) * 0.5 - n1y * (r0 + r1) * 0.52, x0 - n1x * r0, y0 - n1y * r0);
  g.closePath();
  g.fillStyle = fill; g.fill();
  if (outline) { g.strokeStyle = outline; g.lineWidth = 1.1; g.stroke(); }
}

// ---------------------------------------------------------------- 火蟾兽：蹲伏巨蟾，熔岩疣，鼓动喉囊
export function toad(g: G, L: BeastLook, col: RGB, A: BeastAnim) {
  const hop = A.move > 0.1 ? Math.max(0, Math.sin(A.phase * 0.8)) * 16 : 0;
  const lunge = Math.sin(Math.min(1, A.atk) * Math.PI);
  const breathe = Math.sin(A.t * 2.2);
  g.translate(0, -hop);
  const dark = shade(col, 0.55), belly: RGB = L.belly ?? [220, 170, 110];
  // 折叠粗壮后腿
  g.fillStyle = css(shade(col, 0.7));
  g.beginPath(); g.ellipse(-22, -16, 22, 16, -0.3, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke();
  muscleLimb(g, -26, -10, -40 - hop * 0.5, -2 + hop * 0.5, -22, 0 + hop, 5.5, 4.2, 3.2, css(dark));
  // 蟾躯
  const gr = g.createLinearGradient(0, -52, 0, 0);
  gr.addColorStop(0, css(shade(col, 0.72))); gr.addColorStop(0.58, css(col)); gr.addColorStop(1, css(belly));
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(-34, -6);
  g.bezierCurveTo(-40, -40, -6, -56, 18, -46);
  g.bezierCurveTo(35, -40, 44, -26, 40, -12);
  g.quadraticCurveTo(20, 2, -34, -6); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke();
  // 熔岩疣
  for (let i = 0; i < 11; i++) {
    const x = -26 + (i * 37 % 50), y = -40 + (i * 23 % 22);
    const pulse = 0.6 + 0.4 * Math.sin(A.t * 3 + i);
    glowDot(g, x, y, 6, L.glow ?? '255,120,40', 0.55 * pulse);
    g.fillStyle = css(mix([255, 150, 60], [255, 230, 140], pulse * 0.5)); g.beginPath(); g.arc(x, y, 2.3, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(40,10,6,0.6)'; g.lineWidth = 0.8; g.beginPath(); g.arc(x, y, 3.5, 0, TAU); g.stroke();
  }
  // 喉囊
  const sac = 9 + breathe * 3 + lunge * 6;
  g.fillStyle = css(mix(belly, [255, 120, 60], 0.35), 0.95); g.beginPath(); g.ellipse(30, -10, sac, sac * 0.75, 0, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
  // 阔口
  g.strokeStyle = 'rgba(30,10,6,0.85)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(18, -24); g.quadraticCurveTo(34, -18 + lunge * 6, 44, -24); g.stroke();
  if (lunge > 0.2) { g.fillStyle = `rgba(255,140,50,${lunge})`; g.beginPath(); g.ellipse(44, -22, 6 * lunge, 4 * lunge, 0, 0, TAU); g.fill(); }
  muscleLimb(g, 22, -13, 25, -5, 31, 0, 4.5, 3.4, 2.8, css(shade(col, 0.82)));
  g.fillStyle = css(shade(col, 0.8)); g.beginPath(); g.arc(22, -42, 8, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke();
  eye(g, 24, -43, 2.6, L.eye ?? 'rgba(255,220,60,0.95)');
}

// ---------------------------------------------------------------- 铁火蚁
export function ant(g: G, L: BeastLook, col: RGB, A: BeastAnim) {
  const by = -12, lunge = Math.sin(Math.min(1, A.atk) * Math.PI);
  g.lineCap = 'round';
  for (let i = 0; i < 3; i++) for (const far of [true, false]) {
    const sx = -2 + i * 9, sw = Math.sin(A.phase * 2 + i * 2.1 + (far ? Math.PI : 0)) * 6 * A.move;
    g.strokeStyle = css(far ? shade(col, 0.5) : shade(col, 0.8)); g.lineWidth = 2;
    g.beginPath(); g.moveTo(sx, by); g.lineTo(sx + sw + (i - 1) * 6, by - 9); g.lineTo(sx + sw * 1.4 + (i - 1) * 10, 1); g.stroke();
  }
  const seg = (x: number, y: number, rx: number, ry: number) => {
    const gr = g.createRadialGradient(x - rx * 0.3, y - ry * 0.4, 0, x, y, rx);
    gr.addColorStop(0, css(mix(col, WHITE, 0.25))); gr.addColorStop(1, css(shade(col, 0.6)));
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
  };
  seg(-18, by - 2, 13, 9); seg(4, by, 8, 6); seg(18 + lunge * 4, by - 3, 8, 7);
  for (const [x, y] of [[-6, by], [11, by - 1], [-18, by - 2]] as [number, number][]) glowDot(g, x, y, 7, L.glow ?? '255,70,30', 0.7 + 0.3 * Math.sin(A.t * 5 + x));
  g.strokeStyle = css(shade(col, 0.6)); g.lineWidth = 2;
  g.beginPath(); g.moveTo(24 + lunge * 4, by - 2); g.lineTo(31 + lunge * 7, by + 1 - lunge * 3); g.moveTo(24 + lunge * 4, by + 1); g.lineTo(30 + lunge * 7, by + 4 + lunge * 3); g.stroke();
  g.lineWidth = 1.2; g.beginPath(); g.moveTo(20, by - 9); g.quadraticCurveTo(26, by - 20, 33, by - 18); g.stroke();
  eye(g, 21, by - 5, 1.2, L.eye ?? 'rgba(255,90,40,0.95)');
}

// ---------------------------------------------------------------- 金背妖螂
export function mantis(g: G, L: BeastLook, col: RGB, A: BeastAnim) {
  const lunge = Math.sin(Math.min(1, A.atk) * Math.PI);
  const sway = Math.sin(A.t * 1.6) * 2;
  g.lineCap = 'round';
  for (let i = 0; i < 2; i++) for (const far of [true, false]) {
    const sx = -10 + i * 14, sw = Math.sin(A.phase * 1.6 + i * 2 + (far ? Math.PI : 0)) * 7 * A.move;
    g.strokeStyle = css(shade(col, far ? 0.55 : 0.85)); g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(sx, -24); g.lineTo(sx + sw - 8, -32); g.lineTo(sx + sw * 1.5 - 14, 0); g.stroke();
  }
  g.fillStyle = css(col); g.beginPath(); g.ellipse(-22, -26, 22, 8, 0.12, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
  const gold: RGB = L.accent ?? [230, 190, 70];
  const gg = g.createLinearGradient(-36, -34, 6, -20); gg.addColorStop(0, css(shade(gold, 0.7))); gg.addColorStop(0.5, css(mix(gold, WHITE, 0.4))); gg.addColorStop(1, css(gold));
  g.fillStyle = gg; g.beginPath(); g.moveTo(6, -30); g.quadraticCurveTo(-18, -42, -40, -28); g.quadraticCurveTo(-18, -26, 6, -26); g.fill(); g.strokeStyle = INK; g.stroke();
  g.strokeStyle = css(col); g.lineWidth = 6;
  g.beginPath(); g.moveTo(2, -28); g.lineTo(18, -46 + sway); g.stroke();
  const ax = 16, ay = -42 + sway;
  g.strokeStyle = css(shade(col, 0.9)); g.lineWidth = 4;
  g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + 10 + lunge * 14, ay - 18 + lunge * 20); g.stroke();
  g.fillStyle = css(mix(col, WHITE, 0.15));
  g.beginPath(); g.moveTo(ax + 10 + lunge * 14, ay - 18 + lunge * 20); g.quadraticCurveTo(ax + 26 + lunge * 18, ay - 12 + lunge * 24, ax + 20 + lunge * 20, ay + 2 + lunge * 22); g.lineTo(ax + 14 + lunge * 14, ay - 12 + lunge * 20); g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
  g.fillStyle = css(col); g.beginPath(); g.moveTo(16, -48 + sway); g.lineTo(28, -52 + sway); g.lineTo(24, -42 + sway); g.closePath(); g.fill(); g.strokeStyle = INK; g.stroke();
  eye(g, 25, -50 + sway, 1.6, L.eye ?? 'rgba(160,255,120,0.95)');
  g.strokeStyle = css(shade(col, 0.6)); g.lineWidth = 1; g.beginPath(); g.moveTo(22, -52 + sway); g.quadraticCurveTo(30, -68, 40, -66 + sway); g.stroke();
}

// ---------------------------------------------------------------- 炼尸：古风破袍道尸（告别火柴人！）
export function corpse(g: G, L: BeastLook, col: RGB, A: BeastAnim) {
  const robe: RGB = L.accent ?? [44, 42, 48];
  const lunge = Math.sin(Math.min(1, A.atk) * Math.PI);
  const step = A.move > 0.05 ? A.phase : 0;
  const sw = Math.sin(step) * 0.22;
  const H = 148, head = H / 7;
  const hipY = -H * 0.46, shY = -H * 0.78 + 6, shX = 8;

  // 双腿：破裤小腿 + 翘头布靴，双段肌肉轮廓
  for (const [s, far] of [[1, true], [-1, false]] as [number, boolean][]) {
    const a = sw * s;
    const kx = Math.sin(a) * H * 0.2, ky = hipY + H * 0.22;
    const fx = Math.sin(a * 1.15) * H * 0.42, fy = -3;
    muscleLimb(g, far ? -3 : 3, hipY, kx, ky, fx, fy, head * 0.34, head * 0.26, head * 0.19, css(shade(robe, far ? 0.52 : 0.76)));
    // 翘头布靴
    g.fillStyle = css(shade(robe, far ? 0.42 : 0.62));
    g.beginPath(); g.moveTo(fx - 4, fy - 2); g.lineTo(fx + 10, fy - 1); g.quadraticCurveTo(fx + 14, fy + 2, fx + 8, fy + 4); g.lineTo(fx - 5, fy + 4); g.closePath(); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
  }

  // 远侧手臂（微抬）
  const ax = shX + 6, ay = shY + 6;
  muscleLimb(g, ax - 3, ay, ax + 18 + lunge * 10, ay + 4 - lunge * 4, ax + 38 + lunge * 14, ay + 6 - lunge * 6, head * 0.22, head * 0.16, head * 0.11, css(shade(col, 0.72)));

  // 破旧古风宽袖长袍躯干（有领襟、收腰革带、下摆碎裂飘摇）
  const rg = g.createLinearGradient(-head, shY, head, hipY + 34);
  rg.addColorStop(0, css(mix(robe, WHITE, 0.08))); rg.addColorStop(0.55, css(robe)); rg.addColorStop(1, css(shade(robe, 0.62)));
  g.fillStyle = rg;
  g.beginPath();
  g.moveTo(shX - head * 0.85, shY - 2);
  g.quadraticCurveTo(shX, shY - 8, shX + head * 0.78, shY + 2);
  g.lineTo(head * 0.82, hipY + 22);
  for (let i = 0; i <= 7; i++) {
    const px = head * 0.82 - i * head * 0.26;
    const py = hipY + 26 + (i % 2 ? -9 : 7) + Math.sin(A.t * 2.2 + i) * 2.5;
    g.lineTo(px, py);
  }
  g.quadraticCurveTo(-head * 0.95, (shY + hipY) * 0.52, shX - head * 0.85, shY - 2);
  g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.3; g.stroke();

  // 交领白边与破洞幽绿尸气
  g.strokeStyle = css(mix(robe, [180, 175, 160], 0.35), 0.75); g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(shX + 2, shY - 2); g.lineTo(shX + 10, shY + 14); g.lineTo(shX + 2, shY + 24); g.stroke();
  g.fillStyle = css(shade(robe, 0.45));
  g.fillRect(shX - head * 0.75, hipY - 4, head * 1.48, 5.5);
  g.fillStyle = 'rgba(130,185,120,0.45)';
  g.beginPath(); g.ellipse(shX + 4, shY + 22, 4, 3, 0.3, 0, TAU); g.fill();

  // 垂袖 + 铁青枯爪手臂前伸
  const ex = ax + 22 + lunge * 12, ey = ay + 5 - lunge * 4;
  const hxHand = ax + 45 + lunge * 16, hyHand = ay + 6 - lunge * 6;
  // 宽大垂袖
  g.fillStyle = css(shade(robe, 0.88));
  g.beginPath(); g.moveTo(ax - 2, ay - 5); g.lineTo(ex + 2, ey - 5);
  g.quadraticCurveTo(ex + 3, ey + 15, ex - 9, ey + 16);
  g.quadraticCurveTo(ax + 4, ay + 12, ax - 3, ay + 5); g.closePath(); g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.1; g.stroke();
  // 干瘦铁青前臂与五指弯爪
  muscleLimb(g, ex - 2, ey, (ex + hxHand) * 0.5, (ey + hyHand) * 0.5, hxHand, hyHand, 4.2, 3.3, 2.5, css(col));
  g.strokeStyle = css(shade(col, 0.55)); g.lineWidth = 1.4;
  for (let k = -1; k <= 1; k++) {
    g.beginPath(); g.moveTo(hxHand, hyHand + k * 1.4);
    g.quadraticCurveTo(hxHand + 6, hyHand + k * 2.5 - 1, hxHand + 8, hyHand + k * 3 + 3); g.stroke();
  }

  // 腕间真正扣连垂挂的铁链
  for (let i = 0; i < 6; i++) {
    const cx = hxHand - 6 - Math.sin(i * 0.25) * 4, cy = hyHand + 4 + i * 5.2 + Math.sin(A.t * 3 + i) * 1.5;
    g.strokeStyle = i % 2 ? '#6e6a64' : '#969088'; g.lineWidth = 1.6;
    g.beginPath(); g.ellipse(cx, cy, 3.2, 2.1, i % 2 ? 0.25 : 1.35, 0, TAU); g.stroke();
  }

  // 枯槁僵首：突出颌骨、高颧骨、披散乱发、黄纸镇尸符
  const hx = shX + head * 0.45, hy = shY - head * 0.55;
  g.fillStyle = css(col);
  g.beginPath();
  g.moveTo(hx - head * 0.36, hy - head * 0.44);
  g.quadraticCurveTo(hx + head * 0.28, hy - head * 0.56, hx + head * 0.46, hy - head * 0.12);
  g.lineTo(hx + head * 0.42, hy + head * 0.22);
  g.quadraticCurveTo(hx + head * 0.3, hy + head * 0.48, hx, hy + head * 0.46);
  g.quadraticCurveTo(hx - head * 0.4, hy + head * 0.35, hx - head * 0.36, hy - head * 0.44);
  g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke();
  // 披散乱发
  g.fillStyle = 'rgba(22,20,20,0.92)';
  g.beginPath(); g.moveTo(hx - head * 0.44, hy - head * 0.25);
  g.quadraticCurveTo(hx - head * 0.1, hy - head * 0.72, hx + head * 0.36, hy - head * 0.35);
  g.lineTo(hx + head * 0.08, hy - head * 0.28);
  g.quadraticCurveTo(hx - head * 0.16, hy + head * 0.15, hx - head * 0.32, hy + head * 0.78);
  g.lineTo(hx - head * 0.56, hy + head * 0.62);
  g.closePath(); g.fill();
  // 额前黄符（微微飘起）
  const ft = Math.sin(A.t * 3.5) * 2.5;
  g.fillStyle = '#ebd068';
  g.beginPath(); g.moveTo(hx + head * 0.22, hy - head * 0.38); g.lineTo(hx + head * 0.44, hy - head * 0.35);
  g.lineTo(hx + head * 0.48 + ft * 0.4, hy + head * 0.32); g.lineTo(hx + head * 0.26 + ft * 0.4, hy + head * 0.3); g.closePath(); g.fill();
  g.strokeStyle = '#9c2c22'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(hx + head * 0.33, hy - head * 0.28); g.lineTo(hx + head * 0.36 + ft * 0.2, hy + head * 0.2);
  g.moveTo(hx + head * 0.27, hy - head * 0.12); g.lineTo(hx + head * 0.41, hy - head * 0.08); g.stroke();
  eye(g, hx + head * 0.28, hy - head * 0.06, 1.5, L.eye ?? 'rgba(120,255,140,0.92)');
  // 飘散尸气
  for (let i = 0; i < 4; i++) {
    const ph = (A.t * 0.45 + i / 4) % 1;
    g.fillStyle = `rgba(96,156,104,${0.18 * (1 - ph)})`;
    g.beginPath(); g.arc(hx - 4 + Math.sin(i * 2.1 + A.t) * 10, hy - ph * 38, 7 + ph * 10, 0, TAU); g.fill();
  }
}

// ---------------------------------------------------------------- 银翼夜叉：精悍肌肉体态 + 骨节羽翼 + 尖角利爪
export function yaksha(g: G, L: BeastLook, col: RGB, A: BeastAnim) {
  const lunge = Math.sin(Math.min(1, A.atk) * Math.PI);
  const flap = Math.sin(A.t * (A.flying ? 7 : 2.5));
  const silver: RGB = L.accent ?? [220, 228, 240];
  const H = 152, head = H / 7;
  const shY = -H * 0.78, hipY = -H * 0.45;
  // 远翅（保留 test-beast-wings.ts 约定 scale(-0.82, 0.85)）
  const wing = (far: boolean) => featherWing(g, -4, shY + 8, far ? 0.68 : 0.82, flap * (A.flying ? 26 : 9), silver, far, 0.92);
  g.save(); g.translate(-4, shY + 8); g.scale(-0.82, 0.85); g.translate(4, -shY - 8); wing(true); g.restore();

  // 反关节兽化下肢（肌肉腿 + 锐利脚爪）
  for (const [s, far] of [[1, true], [-1, false]] as [number, boolean][]) {
    const a = A.move > 0.05 ? Math.sin(A.phase + (s > 0 ? Math.PI : 0)) * 0.38 : 0;
    const c = css(shade(col, far ? 0.52 : 0.84));
    const kx = 12 + Math.sin(a) * 16, ky = hipY + 26;
    const ax = -6 + Math.sin(a) * 24, ay = -15;
    const fx = 6 + Math.sin(a) * 26, fy = -2;
    muscleLimb(g, 0, hipY, kx, ky, ax, ay, head * 0.42, head * 0.28, head * 0.18, c);
    muscleLimb(g, ax, ay, (ax + fx) * 0.5, (ay + fy) * 0.5, fx, fy, head * 0.18, head * 0.15, head * 0.12, c);
    g.strokeStyle = css(silver); g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + 9, fy + 2); g.moveTo(fx - 2, fy + 1); g.lineTo(fx - 8, fy + 2); g.stroke();
  }

  // 远侧手臂
  muscleLimb(g, 2, shY + 9, 18 + lunge * 12, shY + 26, 32 + lunge * 18, shY + 18, head * 0.26, head * 0.18, head * 0.13, css(shade(col, 0.6)));

  // 精壮倒三角躯干 + 破兽皮腰裙
  const gr = g.createLinearGradient(0, shY, 0, hipY);
  gr.addColorStop(0, css(mix(col, WHITE, 0.12))); gr.addColorStop(1, css(shade(col, 0.68)));
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(-head * 0.55, shY + 2);
  g.quadraticCurveTo(head * 0.25, shY - head * 0.45, head * 1.15, shY + 4);
  g.quadraticCurveTo(head * 0.85, (shY + hipY) * 0.5, head * 0.46, hipY + 2);
  g.lineTo(-head * 0.36, hipY + 2);
  g.quadraticCurveTo(-head * 0.85, (shY + hipY) * 0.52, -head * 0.55, shY + 2);
  g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.3; g.stroke();
  // 兽皮腰裙 + 胸肌腹肌墨线
  g.fillStyle = css(shade(col, 0.38));
  g.beginPath(); g.moveTo(-head * 0.42, hipY - 2); g.lineTo(head * 0.5, hipY - 2);
  for (let i = 0; i <= 5; i++) g.lineTo(head * 0.5 - i * head * 0.18, hipY + 11 + (i % 2 ? 5 : -3));
  g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
  g.strokeStyle = css(shade(col, 0.45), 0.7); g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(head * 0.1, shY + 14); g.quadraticCurveTo(head * 0.45, shY + 17, head * 0.85, shY + 14); g.stroke();

  // 近侧肌肉臂与五指银钩爪
  const ax = head * 0.55, ay = shY + 8;
  const ex = ax + 18 + lunge * 18, ey = ay + 18 - lunge * 10;
  const hxHand = ax + 36 + lunge * 28, hyHand = ay + 8 - lunge * 12;
  muscleLimb(g, ax, ay, ex, ey, hxHand, hyHand, head * 0.28, head * 0.21, head * 0.14, css(col));
  g.strokeStyle = css(silver); g.lineWidth = 2;
  for (let i = -1; i <= 1; i++) {
    g.beginPath(); g.moveTo(hxHand, hyHand);
    g.quadraticCurveTo(hxHand + 8, hyHand + i * 4 - 4, hxHand + 11, hyHand + i * 6 + 4); g.stroke();
  }

  // 狰狞夜叉首：尖耳、双短角、飘扬长发、獠牙、银目
  const hx = head * 0.68, hy = shY - head * 0.55;
  g.fillStyle = css(shade(col, 0.45));
  g.beginPath(); g.moveTo(hx - head * 0.25, hy - head * 0.42);
  g.quadraticCurveTo(hx - head * 1.15, hy - head * 0.3 + Math.sin(A.t * 4) * 3, hx - head * 1.4, hy + head * 0.25);
  g.quadraticCurveTo(hx - head * 0.7, hy + head * 0.05, hx - head * 0.2, hy + head * 0.1); g.fill();
  g.fillStyle = css(col);
  g.beginPath(); g.moveTo(hx - head * 0.35, hy - head * 0.4);
  g.quadraticCurveTo(hx + head * 0.25, hy - head * 0.58, hx + head * 0.56, hy - head * 0.12);
  g.lineTo(hx + head * 0.52, hy + head * 0.25);
  g.quadraticCurveTo(hx + head * 0.2, hy + head * 0.48, hx - head * 0.35, hy + head * 0.32);
  g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke();
  // 尖耳与头角
  g.fillStyle = css(shade(col, 0.78));
  g.beginPath(); g.moveTo(hx - head * 0.18, hy - head * 0.38); g.lineTo(hx - head * 0.62, hy - head * 1.22); g.lineTo(hx + head * 0.12, hy - head * 0.44); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#f4f0e0';
  g.beginPath(); g.moveTo(hx + head * 0.32, hy + head * 0.22); g.lineTo(hx + head * 0.4, hy + head * 0.58); g.lineTo(hx + head * 0.48, hy + head * 0.22); g.fill();
  eye(g, hx + head * 0.24, hy - head * 0.1, 2.1, L.eye ?? 'rgba(230,240,255,1)');
  wing(false);
}

// ---------------------------------------------------------------- 古魔血焰 / 真魔：威严魔神轮廓 + 沸腾血焰
export function demon(g: G, L: BeastLook, col: RGB, A: BeastAnim) {
  const lunge = Math.sin(Math.min(1, A.atk) * Math.PI);
  const t = A.t;
  const H = 172;
  g.translate(0, -14 + Math.sin(t * 1.4) * 4);

  // 背后升腾的血焰魔气漩涡
  for (let i = 0; i < 14; i++) {
    const u = i / 13, x = -44 + u * 88, ph = t * 3.2 + i * 1.6;
    const hgt = H * (0.58 + 0.42 * Math.sin(u * Math.PI)) + Math.sin(ph) * 14;
    const gr = g.createLinearGradient(0, 0, 0, -hgt);
    gr.addColorStop(0, css(shade(col, 0.5), 0)); gr.addColorStop(0.32, css(col, 0.48)); gr.addColorStop(1, css(mix(col, [255, 200, 120], 0.45), 0));
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(x - 14, 0); g.quadraticCurveTo(x - 18 + Math.sin(ph) * 9, -hgt * 0.62, x + Math.sin(ph * 1.3) * 10, -hgt); g.quadraticCurveTo(x + 18, -hgt * 0.5, x + 14, 0); g.fill();
  }

  // 远侧巨臂
  muscleLimb(g, -26, -H * 0.62, -44, -H * 0.44, -46, -H * 0.24, 10, 8, 5, css(shade(col, 0.58)), INK);

  // 倒三角魔躯（阔肩收腰，下摆裂作飘摇血焰魔袍）
  const gr = g.createLinearGradient(0, -H * 0.78, 0, 0);
  gr.addColorStop(0, css(shade(col, 0.45))); gr.addColorStop(0.55, css(col)); gr.addColorStop(1, css(shade(col, 0.25), 0.15));
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(-36, -H * 0.64);
  g.quadraticCurveTo(0, -H * 0.77, 38, -H * 0.64);
  g.quadraticCurveTo(32, -H * 0.4, 21, -H * 0.22);
  g.quadraticCurveTo(28, -H * 0.08, 22, -4);
  for (let i = 0; i <= 5; i++) {
    const px = 22 - i * 8.8;
    const py = (i % 2 ? -18 : 2) + Math.sin(t * 3 + i) * 3;
    g.lineTo(px, py);
  }
  g.quadraticCurveTo(-28, -H * 0.08, -21, -H * 0.22);
  g.quadraticCurveTo(-32, -H * 0.42, -36, -H * 0.64);
  g.closePath(); g.fill();

  // 暗金魔甲肩吞（双层尖甲）与胸膛魔纹核心
  for (const s of [-1, 1]) {
    g.fillStyle = css(shade(col, 0.3));
    g.beginPath(); g.moveTo(s * 12, -H * 0.68); g.quadraticCurveTo(s * 42, -H * 0.75, s * 46, -H * 0.56);
    g.lineTo(s * 30, -H * 0.52); g.lineTo(s * 18, -H * 0.55); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,195,110,0.65)'; g.lineWidth = 1.2; g.stroke();
  }
  // 胸腹暗红护甲纹理 + 魔核光环
  g.strokeStyle = 'rgba(255,195,110,0.55)'; g.lineWidth = 1.3;
  g.beginPath();
  g.moveTo(-22, -H * 0.57); g.quadraticCurveTo(-6, -H * 0.48, 0, -H * 0.51); g.quadraticCurveTo(6, -H * 0.48, 22, -H * 0.57);
  g.moveTo(-14, -H * 0.41); g.quadraticCurveTo(0, -H * 0.35, 14, -H * 0.41);
  g.moveTo(-10, -H * 0.32); g.quadraticCurveTo(0, -H * 0.27, 10, -H * 0.32);
  g.stroke();
  glowDot(g, 0, -H * 0.49, 10, '255,120,60', 0.65 + Math.sin(t * 4) * 0.2);
  g.strokeStyle = 'rgba(255,215,140,0.8)'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(0, -H * 0.54); g.lineTo(5, -H * 0.49); g.lineTo(0, -H * 0.44); g.lineTo(-5, -H * 0.49); g.closePath(); g.stroke();

  // 近侧粗壮魔臂 + 燃焰五指魔爪
  const sx = 28, sy = -H * 0.6;
  const ex = 44 + lunge * 22, ey = sy + 26 - lunge * 16;
  const hxHand = 50 + lunge * 40, hyHand = sy + 44 - lunge * 30;
  muscleLimb(g, sx, sy, ex, ey, hxHand, hyHand, 10, 8.5, 6, css(col), INK);
  glowDot(g, hxHand, hyHand, 18, '255,120,60', 0.75);
  g.strokeStyle = 'rgba(255,220,140,0.9)'; g.lineWidth = 2;
  for (let k = -1; k <= 1; k++) {
    g.beginPath(); g.moveTo(hxHand, hyHand + k * 2); g.lineTo(hxHand + 10, hyHand + k * 5 + 3); g.stroke();
  }

  // 狰狞魔面与双曲铁角
  const hx = 6, hy = -H * 0.8;
  g.fillStyle = css(shade(col, 0.48));
  g.beginPath();
  g.moveTo(hx - 15, hy - 14); g.quadraticCurveTo(hx, hy - 24, hx + 18, hy - 12);
  g.lineTo(hx + 20, hy + 6); g.quadraticCurveTo(hx + 6, hy + 22, hx - 12, hy + 16);
  g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.3; g.stroke();
  // 双曲角
  g.fillStyle = 'rgba(32,12,12,0.95)';
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(hx + s * 8, hy - 13);
    g.quadraticCurveTo(hx + s * 30, hy - 28, hx + s * 22, hy - 54);
    g.quadraticCurveTo(hx + s * 19, hy - 29, hx + s * 2, hy - 17); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,150,90,0.5)'; g.lineWidth = 1; g.stroke();
  }
  // 魔瞳与獠牙嘴
  for (const dx of [-3, 11]) {
    glowDot(g, hx + dx, hy - 3, 9, '255,230,140', 0.9);
    g.fillStyle = '#fff4c0'; g.beginPath(); g.ellipse(hx + dx, hy - 3, 3.2, 1.8, dx < 0 ? 0.2 : -0.2, 0, TAU); g.fill();
  }
  g.fillStyle = 'rgba(28,6,6,0.92)';
  g.beginPath(); g.moveTo(hx - 4, hy + 7); g.lineTo(hx + 16, hy + 7); g.lineTo(hx + 8, hy + 13 + lunge * 5); g.closePath(); g.fill();
  // 上浮火星
  for (let i = 0; i < 8; i++) {
    const ph = (t * 0.6 + i / 8) % 1;
    g.fillStyle = `rgba(255,${150 + i * 10},80,${1 - ph})`;
    g.beginPath(); g.arc(Math.sin(i * 2.4 + t) * 40, -H * (0.3 + ph * 0.9), 2, 0, TAU); g.fill();
  }
}

/** 羽翼：初级飞羽（分叉长羽）、次级飞羽、覆羽三层；x,y 为翼根，向左后方展开 */
function featherWing(g: G, x: number, y: number, k: number, up: number, c: RGB, far: boolean, span = 1) {
  const base = far ? shade(c, 0.68) : c;
  const wx = x - 34 * k * span, wy = y - 46 * k - up;
  const tx = x - 100 * k * span, ty = y - 40 * k - up * 1.6;
  for (let i = 0; i < 7; i++) {
    const u = i / 6, px = wx + (tx - wx) * u, py = wy + (ty - wy) * u;
    const ang = Math.PI * (0.62 + u * 0.32) + up * 0.004, len = (34 + u * 26) * k * span;
    g.save(); g.translate(px, py); g.rotate(ang);
    g.fillStyle = css(mix(base, [40, 36, 30], 0.18 + u * 0.12), 0.97);
    g.beginPath(); g.moveTo(0, -3.5 * k); g.quadraticCurveTo(len * 0.6, -5 * k, len, 0); g.quadraticCurveTo(len * 0.6, 4 * k, 0, 3.5 * k); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(30,26,22,0.45)'; g.lineWidth = 0.7; g.stroke();
    g.restore();
  }
  for (let i = 0; i < 6; i++) {
    const u = i / 5, px = x + (wx - x) * u, py = y + (wy - y) * u;
    const len = (30 + u * 10) * k * span;
    g.save(); g.translate(px, py); g.rotate(Math.PI * 0.72 + u * 0.08);
    g.fillStyle = css(mix(base, [40, 36, 30], 0.1), 0.98);
    g.beginPath(); g.moveTo(0, -4.5 * k); g.quadraticCurveTo(len * 0.7, -5 * k, len, 0); g.quadraticCurveTo(len * 0.7, 5 * k, 0, 4.5 * k); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(30,26,22,0.4)'; g.lineWidth = 0.7; g.stroke();
    g.restore();
  }
  const gr = g.createLinearGradient(x, y, wx, wy); gr.addColorStop(0, css(mix(base, WHITE, 0.15))); gr.addColorStop(1, css(base));
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(x + 8, y + 2);
  g.quadraticCurveTo(x - 10 * k, wy - 6 * k, wx, wy); g.quadraticCurveTo((wx + tx) / 2, (wy + ty) / 2 - 4 * k, tx + 30 * k * span, ty + 6 * k);
  g.quadraticCurveTo(wx - 4 * k, wy + 22 * k, x - 14 * k, y + 14 * k); g.closePath(); g.fill();
  g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
  g.strokeStyle = css(shade(base, 0.7), 0.6); g.lineWidth = 0.7;
  for (let i = 0; i < 6; i++) { const u = (i + 0.5) / 6, px = x + (wx - x) * u, py = y + (wy - y) * u + 8 * k; g.beginPath(); g.arc(px, py, 5 * k, Math.PI * 0.1, Math.PI * 0.9); g.stroke(); }
}

/** 狮禽兽等四足兽的羽翼（quad 内调用） */
export function quadWing(g: G, L: BeastLook, col: RGB, A: BeastAnim, x: number, y: number, far: boolean) {
  const flap = Math.sin(A.t * (A.flying ? 6 : 1.6));
  const c: RGB = L.accent ?? mix(col, WHITE, 0.3);
  g.save(); if (far) { g.translate(x, y); g.scale(-0.82, 0.85); g.translate(-x, -y); }
  featherWing(g, x, y, far ? 0.62 : 0.7, flap * (A.flying ? 26 : 8), c, far, 0.9);
  g.restore();
}
