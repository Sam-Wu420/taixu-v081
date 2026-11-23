// 妖兽 / 鬼物：全部以代码绘制的国风淡彩 + 墨线造型（侧视，可翻转），带走动、扑击、受击动画
type G = CanvasRenderingContext2D;
type RGB = [number, number, number];
const TAU = Math.PI * 2;
import { toad, ant, mantis, corpse, yaksha, demon, quadWing } from './beast19';

export type BeastBody = 'wolf' | 'fox' | 'boar' | 'tiger' | 'bear' | 'ape' | 'snake' | 'jiao' | 'centipede' | 'spider' | 'scorpion' | 'eagle' | 'bat' | 'ghost' | 'turtle'
  | 'rat' | 'deer' | 'ox' | 'croc' | 'horse' | 'pangolin' | 'fish' | 'carp' | 'shark' | 'urchin' | 'jelly'
  | 'toad' | 'ant' | 'mantis' | 'corpse' | 'yaksha' | 'demon';
export interface BeastLook {
  body: BeastBody; color: RGB; belly?: RGB; accent?: RGB; eye?: string;
  size: number;          // 1 ≈ 狼大小
  horn?: boolean; mane?: boolean; spikes?: boolean; stripes?: boolean; tails?: number; heads?: number;
  glow?: string;         // 体表灵光 'r,g,b'
  eye3?: boolean;        // 额生第三目（三眼火狼）
  bull?: boolean;        // 双弯牛角
  crest?: RGB;           // 禽类肉冠 / 翎冠
  tail?: 'fan' | 'streamer' | 'fish';  // 禽类尾型
  claws?: number;        // 禽类利爪对数
  wings?: number;        // 霜蚣等的翅膀对数
  face?: 'baby';         // 婴鲤兽：婴儿面首
  eyes?: number;         // 千目妖：眼珠数
}
export interface BeastAnim { move: number; phase: number; atk: number; hit: number; t: number; flying?: boolean }

const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const INK = 'rgba(24,18,14,0.72)';
const WHITE: RGB = [255, 250, 240];

/** 无缝肌肉锥度闭合双段肢体：肩/臀宽厚，至膝肘微曲收窄，踝足收劲（单路径闭合无接缝） */
function taperedLimb(
  g: G,
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  r0: number, r1: number, r2: number,
  col: RGB,
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
  const gr = g.createLinearGradient(x0, y0, x2, y2);
  gr.addColorStop(0, css(col)); gr.addColorStop(1, css(shade(col, 0.85)));
  g.fillStyle = gr; g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.05; g.stroke();
}

function eyeGlow(g: G, x: number, y: number, r: number, col: string) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r * 3.2);
  gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(255,80,40,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 3.2, 0, TAU); g.fill();
  g.fillStyle = 'rgba(20,12,8,0.92)'; g.beginPath(); g.arc(x, y, r * 0.95, 0, TAU); g.fill();
  g.fillStyle = '#fff8e0'; g.beginPath(); g.arc(x + r * 0.16, y - r * 0.12, r * 0.44, 0, TAU); g.fill();
}

export function drawBeast(g: G, L: BeastLook, x: number, y: number, facing: number, A: BeastAnim, scale = 1) {
  g.save();
  g.translate(x, y);
  const s = L.size * scale;
  const alt = A.flying ? 70 + Math.sin(A.t * 2) * 8 : 0;
  g.fillStyle = `rgba(30,30,24,${A.flying ? 0.16 : 0.26})`;
  const sw = L.body === 'snake' || L.body === 'jiao' || L.body === 'centipede' || L.body === 'croc' ? 70 : L.body === 'ghost' || L.body === 'jelly' ? 26 : L.body === 'rat' ? 20 : 38;
  g.beginPath(); g.ellipse(0, 2, sw * s, 9 * s, 0, 0, TAU); g.fill();
  g.translate(0, -alt);
  g.scale(facing * s, s);
  const col = A.hit > 0 ? mix(L.color, WHITE, A.hit * 0.7) : L.color;
  const lum = L.color[0] * 0.3 + L.color[1] * 0.59 + L.color[2] * 0.11;
  if (lum > 185) { g.shadowColor = 'rgba(30,44,60,0.55)'; g.shadowBlur = 7; }
  switch (L.body) {
    case 'snake': case 'jiao': case 'centipede': serpent(g, L, col, A); break;
    case 'spider': spider(g, L, col, A); break;
    case 'scorpion': scorpion(g, L, col, A); break;
    case 'eagle': case 'bat': bird(g, L, col, A); break;
    case 'ghost': ghost(g, L, col, A); break;
    case 'turtle': turtle(g, L, col, A); break;
    case 'pangolin': pangolin(g, L, col, A); break;
    case 'fish': case 'carp': case 'shark': fish(g, L, col, A); break;
    case 'urchin': urchin(g, L, col, A); break;
    case 'jelly': jelly(g, L, col, A); break;
    case 'toad': toad(g, L, col, A); break;
    case 'ant': ant(g, L, col, A); break;
    case 'mantis': mantis(g, L, col, A); break;
    case 'corpse': corpse(g, L, col, A); break;
    case 'yaksha': yaksha(g, L, col, A); break;
    case 'demon': demon(g, L, col, A); break;
    case 'ape': ape(g, L, col, A); break;
    default: quad(g, L, col, A);
  }
  g.restore();
}

// ---------------------------------------------------------------- 四足兽
interface QP {
  len: number; bodyH: number; leg: number; legW: number; head: number; snout: number;
  ear: 'point' | 'round' | 'none'; tail: 'bushy' | 'long' | 'thin' | 'none' | 'rat' | 'thick';
  hoof?: boolean; tusk?: boolean; hump?: number; tuck?: number;
}
const QPS: Record<string, QP> = {
  wolf: { len: 64, bodyH: 25, leg: 31, legW: 5.5, head: 13, snout: 14, ear: 'point', tail: 'bushy', tuck: 7 },
  fox: { len: 50, bodyH: 19, leg: 24, legW: 4.2, head: 11, snout: 13, ear: 'point', tail: 'bushy', tuck: 6 },
  boar: { len: 66, bodyH: 35, leg: 20, legW: 7.5, head: 16, snout: 14, ear: 'point', tail: 'thin', hoof: true, tusk: true, hump: 7 },
  tiger: { len: 82, bodyH: 30, leg: 31, legW: 7.5, head: 16, snout: 10, ear: 'round', tail: 'long', tuck: 6 },
  bear: { len: 74, bodyH: 43, leg: 26, legW: 10.5, head: 17, snout: 9, ear: 'round', tail: 'none', hump: 10 },
  rat: { len: 34, bodyH: 17, leg: 10, legW: 3.6, head: 10, snout: 10, ear: 'round', tail: 'rat', hump: 4 },
  deer: { len: 58, bodyH: 21, leg: 43, legW: 4.4, head: 10, snout: 13, ear: 'point', tail: 'thin', hoof: true, tuck: 6 },
  ox: { len: 84, bodyH: 40, leg: 29, legW: 9.5, head: 16, snout: 11, ear: 'point', tail: 'thin', hoof: true, hump: 10 },
  croc: { len: 94, bodyH: 16, leg: 11, legW: 6, head: 11, snout: 30, ear: 'none', tail: 'thick' },
  horse: { len: 58, bodyH: 23, leg: 39, legW: 4.8, head: 10, snout: 16, ear: 'point', tail: 'bushy', hoof: true, tuck: 5 },
};

function quad(g: G, L: BeastLook, col: RGB, A: BeastAnim) {
  const P = QPS[L.body] ?? QPS.wolf;
  const far = shade(col, 0.62), dark = shade(col, 0.42);
  const belly = L.belly ? (A.hit > 0 ? mix(L.belly, WHITE, A.hit * 0.7) : L.belly) : mix(col, WHITE, 0.25);
  const ph = A.phase, mv = A.move;
  const lunge = Math.sin(Math.min(1, A.atk) * Math.PI) * 14;
  const bob = Math.abs(Math.sin(ph)) * 2.2 * mv;
  const hipX = -P.len / 2 + lunge * 0.4, shX = P.len / 2 - 6 + lunge;
  const topY = -P.leg - P.bodyH + bob;
  const midY = -P.leg - P.bodyH * 0.45 + bob;
  const tuck = P.tuck ?? 0;

  const legs = (farSide: boolean) => {
    const legCol = farSide ? shade(col, 0.54) : shade(col, 0.96);
    for (const [bx0, off] of [[hipX + 10, 0], [shX - 8, Math.PI]] as [number, number][]) {
      const bx = bx0 + (farSide ? 3 : 0);
      const sw = Math.sin(ph + off + (farSide ? Math.PI : 0)) * 0.52 * mv;
      const y0 = -P.leg + bob - 5;
      const isHind = off === 0;
      const kx = bx + Math.sin(sw) * P.leg * 0.45 + (isHind ? -4 : 3);
      const ky = y0 + P.leg * 0.52;
      const lift = Math.max(0, Math.sin(ph + off + (farSide ? Math.PI : 0) + 1.2)) * 6 * mv;
      const fx = bx + Math.sin(sw * 1.35) * P.leg * 0.88, fy = -lift - (farSide ? 4 : 1);
      taperedLimb(g, bx, y0 - 6, kx, ky, fx, fy, P.legW * (isHind ? 1.18 : 1.02), P.legW * 0.6, P.legW * 0.43, legCol);
      if (P.hoof) {
        g.fillStyle = css(shade(col, farSide ? 0.22 : 0.3));
        g.beginPath(); g.moveTo(fx - 3, fy - 1); g.lineTo(fx + 5, fy - 1); g.lineTo(fx + 6, fy + 3); g.lineTo(fx - 3, fy + 3); g.closePath(); g.fill();
      } else {
        g.fillStyle = css(farSide ? shade(col, 0.32) : dark);
        g.beginPath(); g.ellipse(fx + 2, fy + 1, P.legW * 0.65, P.legW * 0.36, 0, 0, TAU); g.fill();
        g.strokeStyle = css(shade(col, 0.25)); g.lineWidth = 1;
        for (let t = 0; t < 2; t++) { g.beginPath(); g.moveTo(fx + 4, fy + t); g.lineTo(fx + 7, fy + t + 1.5); g.stroke(); }
      }
    }
  };

  // 尾巴
  const tw = Math.sin(A.t * 3) * 0.2 + mv * Math.sin(ph) * 0.15;
  g.strokeStyle = css(shade(col, 0.78)); g.lineCap = 'round';
  if (P.tail === 'bushy') {
    const tCol = shade(col, 0.85);
    const drawTail = (ang: number, alpha: number, c: RGB) => {
      g.save(); g.globalAlpha *= alpha;
      g.fillStyle = css(c);
      g.beginPath(); g.moveTo(hipX + 3, topY + 6);
      g.quadraticCurveTo(hipX - 24, topY + 2 + ang * 26, hipX - 38, topY + 22 + ang * 34);
      g.quadraticCurveTo(hipX - 26, topY + 28 + ang * 24, hipX + 3, topY + 14); g.closePath(); g.fill();
      g.strokeStyle = INK; g.lineWidth = 1.1; g.stroke();
      g.restore();
    };
    drawTail(tw * 0.6, 1, tCol);
    if ((L.tails ?? 1) > 1) for (let i = 1; i < (L.tails ?? 1); i++) {
      const a = (i / (L.tails! - 1) - 0.5) * 0.9;
      drawTail(a + tw * 0.4, 0.85, mix(col, WHITE, 0.18));
    }
  } else if (P.tail === 'long') {
    g.lineWidth = 5; g.beginPath(); g.moveTo(hipX + 2, topY + 8);
    g.bezierCurveTo(hipX - 30, topY + 4, hipX - 34, topY - 24 + tw * 30, hipX - 50, topY - 20 + tw * 20); g.stroke();
  } else if (P.tail === 'rat') {
    g.strokeStyle = css(mix(col, [220, 170, 160], 0.4)); g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(hipX + 2, topY + 10); g.bezierCurveTo(hipX - 18, topY + 14 + tw * 12, hipX - 30, -P.leg * 0.2, hipX - 46, -2 - tw * 8); g.stroke();
  } else if (P.tail === 'thick') {
    const sway = Math.sin(A.t * 2 + ph * 0.5) * 8;
    g.fillStyle = css(shade(col, 0.9));
    g.beginPath(); g.moveTo(hipX + 6, topY + 2);
    g.quadraticCurveTo(hipX - 30, topY + 2 + sway * 0.5, hipX - 64, -6 + sway);
    g.quadraticCurveTo(hipX - 30, -P.leg + 6 + sway * 0.4, hipX + 6, -P.leg + bob + 2); g.closePath(); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = css(shade(col, 0.5));
    for (let i = 0; i < 6; i++) { const u = i / 6, sx = hipX - u * 58, sy = topY + 2 + u * 12 + sway * u * 0.9; g.beginPath(); g.moveTo(sx - 3, sy + 1); g.lineTo(sx, sy - 6 + u * 3); g.lineTo(sx + 3, sy + 1); g.fill(); }
  } else if (P.tail === 'thin') {
    g.lineWidth = 2.4; g.beginPath(); g.moveTo(hipX + 2, topY + 7); g.quadraticCurveTo(hipX - 10, topY + 11 + tw * 10, hipX - 8, topY + 21); g.stroke();
    g.fillStyle = css(dark); g.beginPath(); g.ellipse(hipX - 8, topY + 22, 3, 2, 0.4, 0, TAU); g.fill();
  }

  // 四肢全部置于躯干下层，自然从胸腹下方长出（远侧暗色收里，近侧亮色踏地）
  legs(true);
  legs(false);
  if (L.wings) quadWing(g, L, col, A, shX - P.len * 0.25, topY + 4, true);

  // 躯干：饱满肩胸 + 收腹弧度 + 圆润臀线（自然融入四肢）
  g.beginPath();
  g.moveTo(hipX - 2, midY - 2);
  g.bezierCurveTo(hipX - 4, topY - 1, hipX + P.len * 0.3, topY - (P.hump ?? 0) * 0.3, shX - P.len * 0.16, topY - (P.hump ?? 0));
  g.bezierCurveTo(shX + 4, topY - (P.hump ?? 0), shX + 14, midY - 2, shX + 11, midY + 8);
  g.bezierCurveTo(shX + 6, -P.leg + bob + 8, shX - 10, -P.leg + bob + 6, shX - 18, -P.leg + bob + 4);
  g.quadraticCurveTo((hipX + shX) * 0.48, -P.leg + bob + 2 - tuck, hipX + 13, -P.leg + bob + 2);
  g.bezierCurveTo(hipX + 1, -P.leg + bob + 2, hipX - 4, -P.leg + bob - 6, hipX - 2, midY - 2);
  g.closePath();
  const gr = g.createLinearGradient(0, topY, 0, -P.leg + bob + 6);
  gr.addColorStop(0, css(shade(col, 0.8))); gr.addColorStop(0.55, css(col)); gr.addColorStop(1, css(belly));
  g.fillStyle = gr; g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.45; g.stroke();

  // 牛垂肉（仅 ox，柔顺垂弧）
  if (L.body === 'ox') {
    g.fillStyle = css(mix(col, belly, 0.45));
    g.beginPath(); g.moveTo(shX - 10, -P.leg + bob + 5);
    g.quadraticCurveTo(shX + 6, -P.leg + bob + 14, shX + 14, midY + 4);
    g.lineTo(shX + 8, midY - 6); g.closePath(); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
  }

  // 斑纹 / 鬃毛 / 背刺 / 鳄甲脊
  if (L.stripes) {
    g.strokeStyle = css(shade(col, 0.28), 0.78); g.lineWidth = 3;
    for (let i = 0; i < 6; i++) { const sx = hipX + 10 + i * (P.len - 18) / 6; g.beginPath(); g.moveTo(sx, topY + 1); g.quadraticCurveTo(sx + 4, topY + P.bodyH * 0.3, sx - 1, topY + P.bodyH * 0.55); g.stroke(); }
  }
  if (L.mane || P.tusk) {
    g.fillStyle = css(shade(col, 0.48));
    for (let i = 0; i < 9; i++) { const sx = hipX + P.len * 0.35 + i * P.len * 0.07, sy = topY - (P.hump ?? 0) * (i / 9) + 1; g.beginPath(); g.moveTo(sx - 3, sy + 3); g.lineTo(sx + 1, sy - 7 - (i % 2) * 3); g.lineTo(sx + 4, sy + 3); g.fill(); }
  }
  if (L.spikes) {
    g.fillStyle = css(L.accent ?? shade(col, 0.4));
    for (let i = 0; i < 7; i++) { const sx = hipX + 6 + i * P.len / 7, sy = topY - (P.hump ?? 0) * (i / 7) + 2; g.beginPath(); g.moveTo(sx - 4, sy + 2); g.lineTo(sx, sy - 11); g.lineTo(sx + 4, sy + 2); g.fill(); }
  }
  if (L.wings) quadWing(g, L, col, A, shX - P.len * 0.3, topY + 6, false);

  // 绒毛/肌理短笔触 + 轻柔肩臀肌理暗示（不遮压侧面）
  g.strokeStyle = css(shade(col, 0.5), 0.38); g.lineWidth = 1.05;
  for (let i = 0; i < 6; i++) { const sx = hipX + 8 + i * P.len / 6.5; g.beginPath(); g.moveTo(sx, topY + 5); g.lineTo(sx + 5, topY + 9); g.stroke(); }
  g.strokeStyle = css(shade(col, 0.42), 0.32); g.lineWidth = 1.1;
  g.beginPath();
  g.moveTo(hipX + 14, -P.leg + bob + 1); g.quadraticCurveTo(hipX + 18, midY + 4, hipX + 13, midY - 4);
  g.moveTo(shX - 13, -P.leg + bob + 2); g.quadraticCurveTo(shX - 15, midY + 4, shX - 9, midY - 4);
  g.stroke();

  // 颈与头（按体态画一体化解剖轮廓，告别圆球粘椭圆！）
  const hx = shX + P.head * 0.72, hy = topY - (P.hump ?? 0) * 0.58 + 2 + (A.atk > 0 ? lunge * 0.2 : Math.sin(A.t * 1.5) * 1);
  // 颈部过渡
  g.fillStyle = css(col);
  g.beginPath();
  g.moveTo(shX - 9, topY - (P.hump ?? 0) + 2);
  g.quadraticCurveTo(hx - 4, hy - P.head * 0.72, hx + 4, hy);
  g.lineTo(shX + 8, midY + 7);
  g.closePath(); g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.1; g.beginPath(); g.moveTo(shX - 8, topY - (P.hump ?? 0) + 2); g.quadraticCurveTo(hx - 4, hy - P.head * 0.72, hx + 2, hy - P.head * 0.45); g.stroke();

  // 远耳
  if (P.ear === 'point') {
    g.fillStyle = css(shade(col, 0.56));
    g.beginPath(); g.moveTo(hx - 2, hy - P.head * 0.48); g.lineTo(hx + 1, hy - P.head * 1.38); g.lineTo(hx + 6, hy - P.head * 0.52); g.closePath(); g.fill();
  }

  // 狮鬃 / 马鬃
  if (L.mane && (L.body === 'tiger' || L.body === 'horse')) {
    const mc = L.body === 'horse' ? shade(col, 0.78) : mix(col, WHITE, 0.35);
    const n = L.body === 'horse' ? 7 : 13;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), wv = Math.sin(A.t * 3 + i) * 3;
      g.fillStyle = css(i % 2 ? mc : shade(mc, 0.86));
      if (L.body === 'horse') {
        const sx = hx - 4 - u * P.len * 0.38, sy = hy - P.head * 0.7 + u * 12;
        g.beginPath(); g.moveTo(sx + 4, sy); g.quadraticCurveTo(sx - 6, sy + 2 + wv, sx - 10 + wv, sy + 14); g.lineTo(sx, sy + 6); g.fill();
      } else {
        const a = 1.45 + u * 3.2, r = P.head * 2.0;
        g.beginPath(); g.moveTo(hx - 3 + Math.cos(a) * P.head * 0.6, hy + Math.sin(a) * P.head * 0.6);
        g.quadraticCurveTo(hx - 6 + Math.cos(a - 0.2) * r, hy + Math.sin(a - 0.2) * r + wv, hx - 10 + Math.cos(a + 0.1) * r * 1.15 + wv, hy + Math.sin(a + 0.1) * r * 1.1);
        g.lineTo(hx - 3 + Math.cos(a + 0.35) * P.head * 0.7, hy + Math.sin(a + 0.35) * P.head * 0.7); g.fill();
      }
    }
  }

  // 一体化兽首轮廓
  const open = Math.sin(Math.min(1, A.atk) * Math.PI) * 0.55;
  const Hh = P.head, Sn = P.snout;
  const hgr = g.createRadialGradient(hx + Hh * 0.3, hy - Hh * 0.35, Hh * 0.1, hx, hy, Hh + Sn * 0.7);
  hgr.addColorStop(0, css(mix(col, WHITE, 0.12))); hgr.addColorStop(0.55, css(col)); hgr.addColorStop(1, css(shade(col, 0.7)));
  g.fillStyle = hgr;
  g.beginPath();
  if (L.body === 'croc') {
    // 扁长鳄首
    g.moveTo(hx - Hh * 0.9, hy - Hh * 0.55);
    g.quadraticCurveTo(hx + Hh * 0.2, hy - Hh * 0.95, hx + Hh * 0.6, hy - Hh * 0.45);
    g.lineTo(hx + Sn + 6, hy - Hh * 0.22);
    g.quadraticCurveTo(hx + Sn + 9, hy + Hh * 0.05, hx + Sn + 4, hy + Hh * 0.22);
    g.lineTo(hx + Hh * 0.4, hy + Hh * 0.28);
    g.lineTo(hx + Sn + 2, hy + Hh * 0.42 + open * 8);
    g.quadraticCurveTo(hx, hy + Hh * 0.68, hx - Hh * 0.8, hy + Hh * 0.45);
  } else if (L.body === 'tiger' || L.body === 'bear') {
    // 方厚虎/熊首：高眉弓 + 厚重吻颚
    g.moveTo(hx - Hh * 0.85, hy - Hh * 0.5);
    g.quadraticCurveTo(hx - Hh * 0.2, hy - Hh * 0.98, hx + Hh * 0.55, hy - Hh * 0.62);
    g.lineTo(hx + Hh * 0.75 + Sn * 0.85, hy - Hh * 0.18);
    g.quadraticCurveTo(hx + Hh * 0.82 + Sn * 0.9, hy + Hh * 0.18, hx + Hh * 0.55 + Sn * 0.65, hy + Hh * 0.28);
    g.lineTo(hx + Hh * 0.35, hy + Hh * 0.34);
    g.lineTo(hx + Hh * 0.5 + Sn * 0.5, hy + Hh * 0.48 + open * 10);
    g.quadraticCurveTo(hx + Hh * 0.1, hy + Hh * 0.82, hx - Hh * 0.75, hy + Hh * 0.55);
  } else if (L.body === 'boar' || L.body === 'ox') {
    // 猪/牛：厚颅斜下至平鼻端
    g.moveTo(hx - Hh * 0.82, hy - Hh * 0.6);
    g.quadraticCurveTo(hx + Hh * 0.1, hy - Hh * 0.95, hx + Hh * 0.65, hy - Hh * 0.45);
    g.lineTo(hx + Hh * 0.68 + Sn * 0.85, hy - Hh * 0.05);
    g.lineTo(hx + Hh * 0.64 + Sn * 0.8, hy + Hh * 0.35);
    g.quadraticCurveTo(hx + Hh * 0.15, hy + Hh * 0.72 + open * 8, hx - Hh * 0.75, hy + Hh * 0.5);
  } else {
    // 狼/狐/鹿/马/鼠：流畅楔形窄吻
    g.moveTo(hx - Hh * 0.85, hy - Hh * 0.45);
    g.quadraticCurveTo(hx - Hh * 0.15, hy - Hh * 0.95, hx + Hh * 0.48, hy - Hh * 0.52);
    g.lineTo(hx + Hh * 0.6 + Sn * 1.0, hy - Hh * 0.12);
    g.quadraticCurveTo(hx + Hh * 0.7 + Sn * 1.05, hy + Hh * 0.1, hx + Hh * 0.55 + Sn * 0.9, hy + Hh * 0.2);
    g.lineTo(hx + Hh * 0.3, hy + Hh * 0.26);
    g.lineTo(hx + Hh * 0.45 + Sn * 0.78, hy + Hh * 0.35 + open * 11);
    g.quadraticCurveTo(hx, hy + Hh * 0.7, hx - Hh * 0.75, hy + Hh * 0.48);
  }
  g.closePath(); g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.25; g.stroke();

  // 鼻尖与颊毛/虎斑
  const noseX = L.body === 'croc' ? hx + Sn + 6 : hx + Hh * 0.62 + Sn * 0.92;
  const noseY = L.body === 'boar' || L.body === 'ox' ? hy + Hh * 0.12 : hy - Hh * 0.02;
  g.fillStyle = '#1b1410'; g.beginPath(); g.ellipse(noseX, noseY, 2.4, 1.8, 0, 0, TAU); g.fill();
  if (L.body === 'tiger') {
    g.strokeStyle = css(shade(col, 0.28), 0.75); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(hx - 4, hy - Hh * 0.55); g.lineTo(hx + 3, hy - Hh * 0.35); g.moveTo(hx - 6, hy - Hh * 0.25); g.lineTo(hx, hy - Hh * 0.15); g.stroke();
  }
  if (L.body === 'croc') {
    g.fillStyle = '#efe8d0';
    for (let i = 0; i < 6; i++) { const tx = hx + Hh * 0.5 + i * 4.5; g.beginPath(); g.moveTo(tx, hy + Hh * 0.24); g.lineTo(tx + 1.5, hy + Hh * 0.42); g.lineTo(tx + 3, hy + Hh * 0.24); g.fill(); }
  }
  if (open > 0.08 && L.body !== 'croc' && L.body !== 'ox') {
    g.fillStyle = '#601814';
    g.beginPath(); g.moveTo(hx + Hh * 0.32, hy + Hh * 0.22); g.lineTo(hx + Hh * 0.55 + Sn * 0.78, hy + Hh * 0.22 + open * 10); g.lineTo(hx + Hh * 0.42 + Sn * 0.6, hy + Hh * 0.36); g.fill();
    g.fillStyle = '#f4ecd8';
    for (let i = 0; i < 3; i++) { const tx = hx + Hh * 0.48 + i * Sn * 0.25; g.beginPath(); g.moveTo(tx, hy + Hh * 0.22); g.lineTo(tx + 1.6, hy + Hh * 0.22 + 4.2); g.lineTo(tx + 3.2, hy + Hh * 0.22); g.fill(); }
  }

  // 近耳（带深色内耳廓）
  if (P.ear === 'point') {
    g.fillStyle = css(shade(col, 0.78));
    g.beginPath(); g.moveTo(hx - 7, hy - Hh * 0.44); g.lineTo(hx - 4, hy - Hh * 1.48); g.lineTo(hx + 3, hy - Hh * 0.52); g.closePath(); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1.05; g.stroke();
    g.fillStyle = css(mix(col, belly, 0.5));
    g.beginPath(); g.moveTo(hx - 5, hy - Hh * 0.55); g.lineTo(hx - 3.5, hy - Hh * 1.2); g.lineTo(hx + 0.5, hy - Hh * 0.6); g.closePath(); g.fill();
  } else if (P.ear === 'round') {
    g.fillStyle = css(shade(col, 0.72)); g.beginPath(); g.arc(hx - 5, hy - Hh * 0.75, Hh * 0.32, 0, TAU); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
  }

  // 獠牙 / 牛角 / 分叉鹿角 / 独角
  if (P.tusk) {
    g.fillStyle = '#f6eed8';
    g.beginPath(); g.moveTo(hx + Hh * 0.85, hy + Hh * 0.32); g.quadraticCurveTo(hx + Hh * 1.38 + Sn * 0.5, hy + Hh * 0.45, hx + Hh * 1.25 + Sn * 0.5, hy - Hh * 0.22);
    g.quadraticCurveTo(hx + Hh * 1.15 + Sn * 0.3, hy + Hh * 0.22, hx + Hh * 0.82, hy + Hh * 0.2); g.closePath(); g.fill();
    g.strokeStyle = INK; g.lineWidth = 0.9; g.stroke();
  }
  if (L.bull) {
    for (const side of [-1, 1]) {
      g.fillStyle = css(side < 0 ? shade(L.accent ?? [210, 200, 170], 0.68) : (L.accent ?? [230, 220, 190]));
      g.beginPath(); g.moveTo(hx - 4 + side * 2, hy - Hh * 0.55);
      g.quadraticCurveTo(hx - 18 + side * 3, hy - Hh * 1.25, hx - 6 + side * 4, hy - Hh * 2.1);
      g.quadraticCurveTo(hx - 11 + side * 3, hy - Hh * 1.18, hx + 4 + side * 2, hy - Hh * 0.6); g.closePath(); g.fill();
      g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
    }
  }
  if (L.horn) {
    const hc = css(L.accent ?? [220, 200, 160]);
    if (L.body === 'deer') {
      // 真正分叉鹿角（主枝 + 三叉枝桠）
      for (const side of [-1, 1]) {
        g.strokeStyle = side < 0 ? css(shade(L.accent ?? [220, 200, 160], 0.65)) : hc;
        g.lineCap = 'round';
        g.lineWidth = 3;
        g.beginPath(); g.moveTo(hx - 2 + side * 2, hy - Hh * 0.6); g.quadraticCurveTo(hx - 10 + side * 3, hy - Hh * 1.6, hx - 4 + side * 5, hy - Hh * 2.5); g.stroke();
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(hx - 6 + side * 2, hy - Hh * 1.25); g.lineTo(hx + 4 + side * 3, hy - Hh * 1.65);
        g.moveTo(hx - 7 + side * 3, hy - Hh * 1.85); g.lineTo(hx + 3 + side * 4, hy - Hh * 2.3); g.stroke();
      }
    } else {
      g.fillStyle = hc;
      g.beginPath(); g.moveTo(hx - 4, hy - Hh * 0.6); g.quadraticCurveTo(hx - 3, hy - Hh * 1.7, hx + 9, hy - Hh * 2.15);
      g.quadraticCurveTo(hx + 2, hy - Hh * 1.45, hx + 2, hy - Hh * 0.6); g.closePath(); g.fill();
      g.strokeStyle = INK; g.lineWidth = 0.9; g.stroke();
    }
  }
  if (L.eye3) {
    g.fillStyle = '#2a0c08'; g.beginPath(); g.ellipse(hx + Hh * 0.14, hy - Hh * 0.56, 2.2, 3.4, 0, 0, TAU); g.fill();
    eyeGlow(g, hx + Hh * 0.14, hy - Hh * 0.56, 1.8, L.eye ?? 'rgba(255,90,40,0.9)');
  }
  eyeGlow(g, hx + Hh * 0.34, hy - Hh * 0.22, 2.1, L.eye ?? 'rgba(255,90,40,0.9)');

  if (L.glow) {
    g.globalCompositeOperation = 'lighter';
    const gg = g.createRadialGradient(0, midY, 0, 0, midY, P.len * 0.8);
    gg.addColorStop(0, `rgba(${L.glow},0.22)`); gg.addColorStop(1, `rgba(${L.glow},0)`);
    g.fillStyle = gg; g.beginPath(); g.arc(0, midY, P.len * 0.8, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
  }
}

// ---------------------------------------------------------------- 猿猴 / 巨猿 / 石傀儡（半直立阔肩长臂）
function ape(g: G, L: BeastLook, col: RGB, A: BeastAnim) {
  const far = shade(col, 0.56), dark = shade(col, 0.36);
  const belly = L.belly ? (A.hit > 0 ? mix(L.belly, WHITE, A.hit * 0.7) : L.belly) : mix(col, WHITE, 0.32);
  const ph = A.phase, mv = A.move;
  const lunge = Math.sin(Math.min(1, A.atk) * Math.PI);
  const bob = Math.abs(Math.sin(ph)) * 3 * mv;
  const breath = Math.sin(A.t * 2.2) * 1.3;
  // 攻击时抬胸昂首抡砸双臂；走动/待机时前倾伏肩撑地
  const hipX = -15 + lunge * 4, hipY = -29 + bob - lunge * 3;
  const shX = 9 + lunge * 3, shY = -60 + bob - lunge * 6 + breath * 0.6;
  const hx = shX + 12 + lunge * 2, hy = shY - 12 - lunge * 2;
  const stride = Math.sin(ph) * 11 * mv;
  const armSw = Math.sin(ph + Math.PI) * 13 * mv;

  const drawFist = (fx: number, fy: number, c: RGB) => {
    g.fillStyle = css(c);
    g.beginPath(); g.ellipse(fx, fy, 7.2, 5.4, 0.15, 0, TAU); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1.05; g.stroke();
    g.strokeStyle = css(dark, 0.75); g.lineWidth = 1;
    for (let i = -1; i <= 1; i++) {
      g.beginPath(); g.moveTo(fx + i * 2.3, fy + 1.5); g.lineTo(fx + i * 2.5 + 1.5, fy + 4.8); g.stroke();
    }
  };
  const drawFoot = (fx: number, fy: number, c: RGB) => {
    g.fillStyle = css(c);
    g.beginPath(); g.ellipse(fx + 3, fy, 8, 3.8, 0, 0, TAU); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
  };
  const drawArm = (sx: number, sy: number, ex: number, ey: number, hx2: number, hy2: number, c: RGB) => {
    taperedLimb(g, sx, sy, ex, ey, hx2, hy2, 9.8, 8.2, 6.8, c);
    // 圆润肩峰平滑覆合，避免直线切口与内侧描边线
    g.fillStyle = css(c);
    g.beginPath(); g.arc(sx, sy, 9.6, 0, TAU); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1.05;
    g.beginPath(); g.arc(sx, sy, 9.6, Math.PI * 0.95, Math.PI * 1.95); g.stroke();
    drawFist(hx2, hy2, mix(c, shade(c, 0.85), 0.25));
  };

  // 1) 远侧后肢与长臂（压暗拉出景深，肩点略低避开下颚）
  const fKneeX = hipX + 9 - stride * 0.45, fKneeY = hipY + 14;
  const fFootX = hipX + 2 - stride, fFootY = -3;
  taperedLimb(g, hipX + 2, hipY, fKneeX, fKneeY, fFootX, fFootY, 8.8, 6.2, 4.6, far);
  drawFoot(fFootX, fFootY, far);

  const fElbX = shX + 12 - armSw * 0.35 + lunge * 16, fElbY = shY + 23 - lunge * 17;
  const fHandX = shX + 18 - armSw + lunge * 27, fHandY = -5 - lunge * 28;
  drawArm(shX + 4, shY + 7, fElbX, fElbY, fHandX, fHandY, far);

  // 2) 健硕半直立躯干（阔肩、厚背弓起、收腹）
  g.beginPath();
  g.moveTo(hipX - 11, hipY + 6);
  g.quadraticCurveTo(hipX - 18, (hipY + shY) * 0.5 + 2, shX - 16, shY - 8);
  g.quadraticCurveTo(shX - 2, shY - 18, shX + 13, shY - 7);
  g.quadraticCurveTo(shX + 19, (shY + hipY) * 0.5 - 2, hipX + 12, hipY + 4);
  g.quadraticCurveTo(hipX, hipY + 11, hipX - 11, hipY + 6);
  g.closePath();
  const gr = g.createLinearGradient(shX - 14, shY - 16, hipX + 10, hipY + 8);
  gr.addColorStop(0, css(mix(col, WHITE, 0.14)));
  gr.addColorStop(0.55, css(col));
  gr.addColorStop(1, css(shade(col, 0.65)));
  g.fillStyle = gr; g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.35; g.stroke();

  // 浅色胸腹裸甲区 + 胸肌墨线
  g.fillStyle = css(belly, 0.92);
  g.beginPath();
  g.moveTo(shX + 4, shY - 3);
  g.quadraticCurveTo(shX + 17, shY + 4, shX + 13, shY + 18);
  g.quadraticCurveTo(hipX + 12, hipY + 2, hipX + 4, hipY + 6);
  g.quadraticCurveTo(hipX - 1, (hipY + shY) * 0.5 + 4, shX + 4, shY - 3);
  g.closePath(); g.fill();
  g.strokeStyle = css(dark, 0.45); g.lineWidth = 1.1;
  g.beginPath(); g.moveTo(shX + 2, shY + 8); g.quadraticCurveTo(shX + 9, shY + 11, shX + 14, shY + 7); g.stroke();

  // 魔猿披肩颈鬃（yuan 化形或带 mane 的猿类：贴合肩颈向后披散）
  if (L.mane) {
    const mc = L.accent ?? shade(col, 0.62);
    g.fillStyle = css(mc, 0.9);
    g.beginPath();
    g.moveTo(hx - 10, hy + 4);
    g.quadraticCurveTo(shX - 24, shY - 18, shX - 26, shY - 2);
    g.lineTo(shX - 20, shY + 3);
    g.lineTo(shX - 25, shY + 10);
    g.lineTo(shX - 14, shY + 9);
    g.lineTo(shX - 17, shY + 17);
    g.quadraticCurveTo(shX - 4, shY + 8, shX + 6, shY - 2);
    g.closePath(); g.fill();
    g.strokeStyle = INK; g.lineWidth = 0.95; g.stroke();
  }

  // 3) 猿首：圆颅、厚眉弓、短平鼻面、前凸下颚与獠牙、侧耳（绝非熊吻）
  g.fillStyle = css(col);
  g.beginPath();
  g.moveTo(hx - 12, hy + 4);
  g.quadraticCurveTo(hx - 14, hy - 13, hx - 2, hy - 14);
  g.quadraticCurveTo(hx + 9, hy - 14, hx + 12, hy - 6);
  g.lineTo(hx + 15, hy - 3);
  g.lineTo(hx + 12, hy + 1);
  g.quadraticCurveTo(hx + 17, hy + 4, hx + 14, hy + 10 + lunge * 3);
  g.quadraticCurveTo(hx + 4, hy + 14 + lunge * 3, hx - 7, hy + 10);
  g.closePath(); g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.25; g.stroke();

  // 面庞裸区（如山魈红颊/浅面）
  g.fillStyle = css(L.accent && L.body === 'ape' && !L.mane ? mix(belly, L.accent, 0.42) : belly, 0.9);
  g.beginPath();
  g.moveTo(hx + 2, hy - 4);
  g.quadraticCurveTo(hx + 13, hy - 5, hx + 13, hy + 1);
  g.quadraticCurveTo(hx + 15, hy + 8 + lunge * 2, hx + 6, hy + 10 + lunge * 2);
  g.quadraticCurveTo(hx, hy + 5, hx + 2, hy - 4);
  g.closePath(); g.fill();

  // 侧低位猴耳（区别于熊耳在头顶）
  g.fillStyle = css(shade(col, 0.78));
  g.beginPath(); g.ellipse(hx - 8, hy - 1, 4.2, 5.2, -0.15, 0, TAU); g.fill();
  g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
  g.fillStyle = css(belly, 0.65);
  g.beginPath(); g.ellipse(hx - 7.5, hy - 0.5, 2.1, 2.8, -0.15, 0, TAU); g.fill();

  // 凶悍眉线、大口裂与尖獠牙
  g.strokeStyle = css(dark, 0.9); g.lineWidth = 1.8;
  g.beginPath(); g.moveTo(hx + 3, hy - 5); g.lineTo(hx + 13, hy - 3.5); g.stroke();
  const open = lunge * 4.5;
  g.strokeStyle = '#241410'; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(hx + 6, hy + 5.5); g.quadraticCurveTo(hx + 11, hy + 5 + open * 0.7, hx + 14.5, hy + 6 + open); g.stroke();
  if (open > 1) {
    g.fillStyle = '#240b0b';
    g.beginPath(); g.ellipse(hx + 10.5, hy + 6 + open * 0.45, 4, open * 0.42, 0, 0, TAU); g.fill();
  }
  g.fillStyle = '#f8f2e4';
  g.beginPath(); g.moveTo(hx + 10.5, hy + 5.2); g.lineTo(hx + 11.8, hy + 8.6 + open * 0.25); g.lineTo(hx + 13, hy + 5.4); g.closePath(); g.fill();

  eyeGlow(g, hx + 8.5, hy - 2.2, 2.0, L.eye ?? 'rgba(255,210,70,0.95)');

  // 4) 近侧粗壮后肢与超长挥击前臂（曲肘有力感）
  const nKneeX = hipX + 11 + stride * 0.45, nKneeY = hipY + 14;
  const nFootX = hipX + 3 + stride, nFootY = -2;
  taperedLimb(g, hipX - 2, hipY + 1, nKneeX, nKneeY, nFootX, nFootY, 9.6, 6.8, 5.0, col);
  drawFoot(nFootX, nFootY, col);

  const nElbX = shX - 6 + armSw * 0.45 + lunge * 16, nElbY = shY + 25 - lunge * 10;
  const nHandX = shX + 9 + armSw + lunge * 28, nHandY = -4 - lunge * 12;
  drawArm(shX - 4, shY + 2, nElbX, nElbY, nHandX, nHandY, col);

  if (L.glow) {
    g.globalCompositeOperation = 'lighter';
    const gg = g.createRadialGradient(0, -45, 0, 0, -45, 74);
    gg.addColorStop(0, `rgba(${L.glow},0.22)`); gg.addColorStop(1, `rgba(${L.glow},0)`);
    g.fillStyle = gg; g.beginPath(); g.arc(0, -45, 74, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
  }
}

// ---------------------------------------------------------------- 蛇 / 蛟 / 蜈蚣
function serpent(g: G, L: BeastLook, col: RGB, A: BeastAnim) {
  const N = L.body === 'centipede' ? 16 : 18;
  const len = L.body === 'jiao' ? 150 : L.body === 'centipede' ? 110 : 120;
  const pts: [number, number][] = [];
  const lunge = Math.sin(Math.min(1, A.atk) * Math.PI);
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const x = 30 + lunge * 20 - u * len;
    const wave = Math.sin(A.t * (3 + A.move * 5) - u * 7) * (8 + u * 6);
    pts.push([x, -4 - wave * 0.55 - (i === 0 ? 10 + lunge * 10 : 0) * (1 - u)]);
  }
  const w0 = L.body === 'jiao' ? 15 : L.body === 'centipede' ? 11 : 10;
  const belly = L.belly ?? mix(col, WHITE, 0.4);
  if (L.body === 'centipede') {
    g.strokeStyle = css(shade(col, 0.5)); g.lineWidth = 2;
    for (let i = 1; i < N - 1; i++) { const [px, py] = pts[i]; const sw = Math.sin(A.t * 14 + i) * 4; g.beginPath(); g.moveTo(px, py); g.lineTo(px + sw - 3, py + 12); g.moveTo(px, py); g.lineTo(px - sw - 3, py - 8); g.stroke(); }
  }
  if (L.wings) {
    const fl = Math.sin(A.t * 22);
    for (let w = 0; w < L.wings; w++) {
      const [px, py] = pts[2 + w * 3];
      for (const far of [true, false]) {
        const lift = (far ? 1.05 : 1) * (18 + fl * 8) + (far ? 12 : 0);
        g.fillStyle = far ? 'rgba(220,240,255,0.28)' : 'rgba(235,248,255,0.42)';
        g.strokeStyle = 'rgba(200,230,255,0.75)'; g.lineWidth = 0.9;
        g.save(); if (far) { g.translate(px, py); g.scale(-0.85, 0.9); g.translate(-px, -py); }
        g.beginPath(); g.moveTo(px, py - 6); g.quadraticCurveTo(px - 6, py - lift - 12, px - 32, py - lift - 6); g.quadraticCurveTo(px - 22, py - lift * 0.4, px - 4, py - 4); g.closePath(); g.fill(); g.stroke(); g.restore();
      }
    }
  }
  for (let i = N - 1; i > 0; i--) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i - 1];
    const w = w0 * (0.35 + 0.65 * Math.pow(1 - i / N, 0.6));
    g.strokeStyle = css(i % 2 && L.body !== 'centipede' ? col : shade(col, 0.88)); g.lineWidth = w * 2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    if (L.body === 'centipede') { g.strokeStyle = INK; g.lineWidth = 1; g.beginPath(); g.arc(x1, y1, w, 0, TAU); g.stroke(); }
  }
  g.strokeStyle = css(belly, 0.8); g.lineWidth = 3;
  g.beginPath(); pts.forEach(([px, py], i) => { const w = w0 * (0.35 + 0.65 * Math.pow(1 - i / N, 0.6)); if (i) g.lineTo(px, py + w * 0.55); else g.moveTo(px, py + w * 0.55); }); g.stroke();
  g.strokeStyle = css(shade(col, 0.5), 0.6); g.lineWidth = 1;
  for (let i = 2; i < N - 1; i++) { const [px, py] = pts[i]; g.beginPath(); g.arc(px, py - 2, 3, Math.PI * 0.9, Math.PI * 2.1); g.stroke(); }
  if (L.spikes || L.body === 'jiao') {
    g.fillStyle = css(L.accent ?? shade(col, 0.5));
    for (let i = 1; i < N - 2; i += 2) { const [px, py] = pts[i]; const w = w0 * (0.35 + 0.65 * Math.pow(1 - i / N, 0.6)); g.beginPath(); g.moveTo(px - 4, py - w + 2); g.lineTo(px - 1, py - w - 10); g.lineTo(px + 3, py - w + 2); g.fill(); }
  }
  if (L.body === 'jiao') {
    for (const k of [3, 9]) {
      const [px, py] = pts[k]; const w = w0 * (0.35 + 0.65 * Math.pow(1 - k / N, 0.6));
      const sw = Math.sin(A.t * 6 + k) * 4 * (0.4 + A.move);
      taperedLimb(g, px, py + w * 0.4, px + 3 + sw * 0.5, py + w + 5, px + 8 + sw, py + w + 10, 4.2, 2.8, 2, shade(col, 0.72));
      g.strokeStyle = css(L.accent ?? [230, 210, 160]); g.lineWidth = 1.4;
      for (let c = -1; c <= 1; c++) { g.beginPath(); g.moveTo(px + 8 + sw, py + w + 10); g.lineTo(px + 13 + sw + c * 2, py + w + 14 + Math.abs(c) * 1.4); g.stroke(); }
    }
  }
  const [hx, hy] = pts[0];
  const hr = w0 * 1.25;
  const jaw = Math.sin(Math.min(1, A.atk) * Math.PI) * hr * 0.38;
  g.beginPath(); g.moveTo(hx - hr * 0.72, hy - hr * 0.62);
  g.quadraticCurveTo(hx + hr * 0.48, hy - hr * 1.08, hx + hr * 1.78, hy - hr * 0.22);
  g.quadraticCurveTo(hx + hr * 1.98, hy + hr * 0.12, hx + hr * 1.6, hy + hr * 0.3);
  g.lineTo(hx + hr * 0.4, hy + hr * 0.42);
  g.lineTo(hx + hr * 1.45, hy + hr * 0.5 + jaw);
  g.quadraticCurveTo(hx + hr * 0.6, hy + hr * 0.95 + jaw * 0.5, hx - hr * 0.72, hy + hr * 0.62);
  g.closePath();
  const hg = g.createLinearGradient(0, hy - hr, 0, hy + hr);
  hg.addColorStop(0, css(shade(col, 0.78))); hg.addColorStop(0.55, css(col)); hg.addColorStop(1, css(belly));
  g.fillStyle = hg; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.3; g.stroke();
  g.strokeStyle = css(shade(col, 0.45), 0.7); g.lineWidth = 1.4; g.beginPath(); g.moveTo(hx + hr * 0.2, hy - hr * 0.62); g.quadraticCurveTo(hx + hr * 0.7, hy - hr * 0.72, hx + hr * 1.05, hy - hr * 0.42); g.stroke();
  g.fillStyle = '#1a1410'; g.beginPath(); g.arc(hx + hr * 1.55, hy - hr * 0.12, 1.4, 0, TAU); g.fill();
  if (L.body === 'jiao' || L.horn) {
    // 蛟角与肉冠（实心尖角取代硬直棍）
    const ac = css(L.accent ?? [230, 210, 160]);
    g.fillStyle = ac;
    for (const dx of [0, 4]) {
      g.beginPath(); g.moveTo(hx + dx - 2, hy - hr * 0.62); g.quadraticCurveTo(hx + dx - 7, hy - hr * 1.65, hx + dx - 16, hy - hr * 2.25);
      g.quadraticCurveTo(hx + dx - 4, hy - hr * 1.45, hx + dx + 3, hy - hr * 0.6); g.closePath(); g.fill();
      g.strokeStyle = INK; g.lineWidth = 0.8; g.stroke();
    }
    g.strokeStyle = ac; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(hx + hr * 1.2, hy + 2); g.quadraticCurveTo(hx + hr * 2, hy + 10 + Math.sin(A.t * 3) * 5, hx + hr * 2.6, hy + 4); g.stroke();
  }
  if (L.body === 'centipede') { g.strokeStyle = css(L.accent ?? [200, 60, 40]); g.lineWidth = 2.5; g.beginPath(); g.moveTo(hx + hr, hy + 3); g.quadraticCurveTo(hx + hr * 2, hy + 8, hx + hr * 1.6, hy + 14); g.stroke(); }
  if (L.body === 'snake' && Math.sin(A.t * 5) > 0.3) {
    g.strokeStyle = '#c02020'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(hx + hr * 1.8, hy + 2); g.lineTo(hx + hr * 2.5, hy + 3); g.lineTo(hx + hr * 2.9, hy); g.moveTo(hx + hr * 2.5, hy + 3); g.lineTo(hx + hr * 2.9, hy + 6); g.stroke();
  }
  eyeGlow(g, hx + hr * 0.75, hy - hr * 0.35, 2, L.eye ?? 'rgba(255,200,40,0.9)');
}

// ---------------------------------------------------------------- 蜘蛛
function spider(g: G, L: BeastLook, col: RGB, A: BeastAnim) {
  const lunge = Math.sin(Math.min(1, A.atk) * Math.PI) * 10;
  const by = -22 + Math.sin(A.t * 4) * 1;
  for (const farSide of [true, false]) {
    g.strokeStyle = css(farSide ? shade(col, 0.55) : shade(col, 0.8)); g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const sx = 4 + i * 6 + lunge, sw = Math.sin(A.phase * 1.4 + i * 1.6 + (farSide ? Math.PI : 0)) * 8 * A.move;
      const dir = i < 2 ? 1 : -1;
      const kx = sx + dir * (18 + i * 2) + sw, ky = by - 22 + (farSide ? -4 : 0);
      const fx = sx + dir * (30 + i * 5) + sw * 1.4, fy = farSide ? -4 : 2;
      g.lineWidth = farSide ? 2.5 : 3.2;
      g.beginPath(); g.moveTo(sx, by); g.lineTo(kx, ky); g.lineTo(fx, fy); g.stroke();
    }
  }
  const gr = g.createRadialGradient(-16, by - 8, 2, -16, by, 24);
  gr.addColorStop(0, css(mix(col, WHITE, 0.2))); gr.addColorStop(1, css(shade(col, 0.6)));
  g.fillStyle = gr; g.beginPath(); g.ellipse(-16 + lunge * 0.3, by - 2, 24, 18, -0.15, 0, TAU); g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.3; g.stroke();
  if (L.accent) { g.fillStyle = css(L.accent, 0.9); g.beginPath(); g.moveTo(-20, by - 10); g.lineTo(-14, by - 2); g.lineTo(-20, by + 6); g.lineTo(-26, by - 2); g.fill(); }
  g.fillStyle = css(col); g.beginPath(); g.ellipse(10 + lunge, by + 2, 13, 11, 0, 0, TAU); g.fill(); g.strokeStyle = INK; g.stroke();
  for (let i = 0; i < 4; i++) eyeGlow(g, 16 + lunge + (i % 2) * 4, by - 2 + Math.floor(i / 2) * 4, 1.2, L.eye ?? 'rgba(255,40,40,0.9)');
  g.strokeStyle = '#2a1a10'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(20 + lunge, by + 6); g.lineTo(26 + lunge, by + 12 + lunge * 0.3); g.stroke();
}

// ---------------------------------------------------------------- 蝎
function scorpion(g: G, L: BeastLook, col: RGB, A: BeastAnim) {
  const lunge = Math.sin(Math.min(1, A.atk) * Math.PI);
  const by = -14;
  g.strokeStyle = css(shade(col, 0.6)); g.lineWidth = 2.4; g.lineCap = 'round';
  for (let i = 0; i < 4; i++) { const sx = -10 + i * 8, sw = Math.sin(A.phase * 1.5 + i * 1.7) * 6 * A.move; g.beginPath(); g.moveTo(sx, by); g.lineTo(sx + sw - 6, by - 8); g.lineTo(sx + sw - 12, 2); g.stroke(); }
  for (let i = 0; i < 5; i++) { g.fillStyle = css(i % 2 ? col : shade(col, 0.85)); g.beginPath(); g.ellipse(14 - i * 9, by, 9, 7, 0, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke(); }
  let tx = -30, ty = by;
  for (let i = 0; i < 6; i++) {
    const a = -0.6 - i * 0.5 + lunge * 0.4 * (i / 6);
    const nx = tx + Math.cos(a + Math.PI) * -9, ny = ty + Math.sin(a) * 9 - 2;
    g.fillStyle = css(shade(col, 0.9 - i * 0.04)); g.beginPath(); g.arc(nx, ny, 6 - i * 0.5, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
    tx = nx; ty = ny;
  }
  g.fillStyle = css(L.accent ?? [200, 40, 40]); g.beginPath(); g.moveTo(tx, ty - 4); g.lineTo(tx + 12 + lunge * 8, ty + 4); g.lineTo(tx + 2, ty + 5); g.fill();
  for (const dy of [-5, 5]) {
    g.strokeStyle = css(col); g.lineWidth = 4;
    g.beginPath(); g.moveTo(20, by + dy * 0.5); g.lineTo(32 + lunge * 6, by + dy - 4); g.stroke();
    g.fillStyle = css(shade(col, 0.8)); g.beginPath(); g.ellipse(38 + lunge * 6, by + dy - 5, 7, 4, dy * 0.06, 0, TAU); g.fill();
  }
  eyeGlow(g, 20, by - 4, 1.4, L.eye ?? 'rgba(255,60,40,0.9)');
}

// ---------------------------------------------------------------- 飞禽 / 蝙蝠
function bird(g: G, L: BeastLook, col: RGB, A: BeastAnim) {
  const bat = L.body === 'bat';
  const flapHz = bat ? 14 : 6.5;
  const ph = A.t * flapHz;
  const flap = Math.sin(ph);
  const dive = Math.sin(Math.min(1, A.atk) * Math.PI);
  g.rotate(dive * 0.45 - 0.04);
  const span = bat ? 52 : 66;
  const dark = shade(col, 0.55), light = mix(col, WHITE, 0.3);
  const bob = -Math.cos(ph) * 3;
  g.translate(0, bob);
  const wing = (farSide: boolean) => {
    const c = farSide ? shade(col, 0.62) : col;
    const k = farSide ? 0.82 : 1;
    const lift = (flap * 34 + (farSide ? 18 : 0)) * k, fold = 0.8 + 0.2 * Math.abs(flap);
    const sx = -2, sy = -6;
    const ex = (bat ? -span * 0.35 : -span * 0.18) * fold, ey = sy - lift * (bat ? 0.55 : 0.62) - 4;
    const tx = (bat ? -span * 0.84 : -span * 0.5) * fold, ty = sy - lift * (bat ? 1 : 1.25) - 2;
    g.fillStyle = css(c, farSide ? 0.92 : 1);
    if (bat) {
      g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(ex + 6, ey - 8, ex, ey); g.lineTo(tx, ty);
      g.quadraticCurveTo(tx + 5, ty + 12, tx + 8, ty + 20);
      g.quadraticCurveTo((tx + ex) * 0.5 + 4, (ty + ey) * 0.5 + 14, ex + 2, ey + 19);
      g.quadraticCurveTo(-span * 0.12, 6, 8, 3); g.closePath(); g.fill();
      g.strokeStyle = INK; g.lineWidth = 1.1; g.stroke();
      g.strokeStyle = css(shade(c, 0.55)); g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(ex, ey); g.lineTo(tx + 8, ty + 20); g.moveTo(ex, ey); g.lineTo(ex + 2, ey + 19); g.stroke();
      return;
    }
    const a = Math.atan2(ty - ey, tx - ex), a2 = Math.atan2(ey - sy, ex - sx);
    const fc = shade(c, 0.78), fcD = shade(c, 0.6);
    for (let i = 0; i < 6; i++) {
      const u = (i + 0.5) / 6, bx = sx + (ex - sx) * u, by = sy + (ey - sy) * u;
      feather(g, bx, by, a2 - 1.25 - u * 0.15, 15 + u * 6, 4.2, i % 2 ? fc : fcD);
    }
    for (let i = 0; i < 7; i++) {
      const u = i / 6, bx = ex + (tx - ex) * u, by = ey + (ty - ey) * u;
      feather(g, bx, by, a - 1.0 + u * 0.85, 22 + u * 12 - (i === 6 ? 6 : 0), 4.6, i % 2 ? fcD : fc);
    }
    const nx = Math.sin(a2), ny = -Math.cos(a2), nx2 = Math.sin(a), ny2 = -Math.cos(a);
    g.beginPath(); g.moveTo(sx + 6, sy - 2);
    g.quadraticCurveTo((sx + ex) / 2 + nx * 4, (sy + ey) / 2 + ny * 4 - 2, ex, ey - 1);
    g.lineTo(tx - nx2 * 1, ty);
    g.lineTo(ex + (tx - ex) * 0.55 - nx2 * 7, ey + (ty - ey) * 0.55 - ny2 * 7);
    g.quadraticCurveTo(ex - nx * 10, ey - ny * 10, sx - nx * 9 + 4, sy - ny * 9 + 4);
    g.closePath();
    const cg = g.createLinearGradient(sx, sy, tx, ty);
    cg.addColorStop(0, css(mix(c, WHITE, 0.12))); cg.addColorStop(1, css(c));
    g.fillStyle = cg; g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
    g.strokeStyle = css(light, 0.45); g.lineWidth = 1;
    for (let i = 1; i < 4; i++) { const u = i / 4; g.beginPath(); g.arc(sx + (ex - sx) * u - nx * 4, sy + (ey - sy) * u - ny * 4, 3.5, a2 + 0.6, a2 + 2.4); g.stroke(); }
  };
  const tw = Math.sin(A.t * 2.4) * 0.12;
  if (!bat) {
    if (L.tail === 'streamer') {
      for (let i = 0; i < 3; i++) {
        const w = Math.sin(A.t * 3 + i * 1.3) * 10;
        g.strokeStyle = css(i === 1 ? (L.accent ?? light) : shade(col, 0.8), 0.95); g.lineWidth = 3.5 - i * 0.6;
        g.beginPath(); g.moveTo(-18, -2); g.bezierCurveTo(-40, -6 + w * 0.3 + i * 4, -60, 4 + w + i * 3, -88 - i * 8, -2 + w * 1.4 + i * 6); g.stroke();
        g.fillStyle = css(L.accent ?? light); g.beginPath(); g.ellipse(-88 - i * 8, -2 + w * 1.4 + i * 6, 4, 2.4, 0.3, 0, TAU); g.fill();
      }
    } else if (L.tail === 'fish') {
      const sw = Math.sin(A.t * 4) * 0.3;
      g.save(); g.translate(-18, 0); g.rotate(sw * 0.4);
      g.fillStyle = css(shade(col, 0.85));
      g.beginPath(); g.moveTo(0, -6); g.quadraticCurveTo(-18, -4, -26, 0); g.quadraticCurveTo(-18, 5, 0, 6); g.fill();
      g.fillStyle = css(L.accent ?? light, 0.95);
      g.beginPath(); g.moveTo(-24, 0); g.quadraticCurveTo(-36, -16 + sw * 10, -46, -20); g.quadraticCurveTo(-38, -4, -42, 2); g.quadraticCurveTo(-38, 8, -46, 20); g.quadraticCurveTo(-36, 14 - sw * 10, -24, 0); g.fill();
      g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
      g.strokeStyle = css(shade(col, 0.5), 0.5); for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(-6 - i * 5, 0, 3, Math.PI * 0.6, Math.PI * 1.4); g.stroke(); }
      g.restore();
    } else {
      const fan = L.tail === 'fan' ? 1.6 : 1;
      g.fillStyle = css(shade(col, 0.72));
      g.beginPath(); g.moveTo(-16, -3);
      for (let i = 0; i <= 4; i++) { const a = (i / 4 - 0.5) * 0.5 * fan + tw; g.lineTo(-34 - Math.cos(a) * 4 * fan, Math.sin(a) * 18 * fan - 1); }
      g.lineTo(-16, 4); g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
    }
  }
  g.save(); g.translate(-2, -6); g.scale(-0.82, 0.85); g.translate(2, 6); wing(true); g.restore();
  const claws = L.claws ?? (bat ? 0 : 1);
  for (let c = 0; c < claws; c++) {
    const cx = -4 + c * 9 + dive * 14, cy = 9 + dive * 6;
    g.strokeStyle = '#c8a050'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(cx - 2, 5); g.lineTo(cx + 2 + dive * 6, cy); g.stroke();
    g.lineWidth = 1.3; for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(cx + 2 + dive * 6, cy); g.lineTo(cx + 6 + dive * 6 + k * 2, cy + 3 + Math.abs(k)); g.stroke(); }
  }
  g.beginPath(); g.moveTo(24, -5); g.bezierCurveTo(14, -15, -12, -12, -20, -3); g.bezierCurveTo(-12, 9, 12, 10, 24, 0); g.closePath();
  const bg = g.createLinearGradient(0, -12, 0, 10);
  bg.addColorStop(0, css(shade(col, 0.85))); bg.addColorStop(0.55, css(col)); bg.addColorStop(1, css(L.belly ?? light));
  g.fillStyle = bg; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke();
  if (L.tail === 'fish') { g.strokeStyle = css(shade(col, 0.55), 0.55); g.lineWidth = 0.9; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(-8 + i * 6, 4, 3, 0.2, Math.PI - 0.2); g.stroke(); } }
  const hx = 25, hy = -6;
  g.fillStyle = css(L.belly && !bat ? mix(col, L.belly, 0.45) : col);
  g.beginPath(); g.ellipse(hx, hy, 8.5, 7.5, 0, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke();
  if (L.crest) {
    g.fillStyle = css(L.crest);
    g.beginPath(); g.moveTo(hx - 6, hy - 5);
    for (let i = 0; i < 4; i++) { const a = -2.4 + i * 0.35; g.lineTo(hx - 4 + Math.cos(a) * 15 - i * 2, hy - 4 + Math.sin(a) * 13 + Math.sin(A.t * 4 + i) * 1.2); g.lineTo(hx - 2 + i * 2, hy - 6); }
    g.closePath(); g.fill();
  }
  if (bat) {
    g.fillStyle = css(dark); g.beginPath(); g.moveTo(hx - 4, hy - 5); g.lineTo(hx - 2, hy - 15); g.lineTo(hx + 2, hy - 6); g.moveTo(hx + 1, hy - 6); g.lineTo(hx + 4, hy - 14); g.lineTo(hx + 6, hy - 5); g.fill();
    g.fillStyle = '#f0e8d0'; g.beginPath(); g.moveTo(hx + 4, hy + 4); g.lineTo(hx + 5, hy + 8); g.lineTo(hx + 6.5, hy + 4); g.fill();
  } else {
    const open = dive * 0.35;
    g.fillStyle = '#e0b040';
    g.beginPath(); g.moveTo(hx + 6, hy - 3); g.quadraticCurveTo(hx + 17, hy - 2, hx + 15, hy + 4 - open * 4); g.lineTo(hx + 7, hy + 1); g.fill();
    g.fillStyle = '#b08020'; g.beginPath(); g.moveTo(hx + 7, hy + 1.5); g.lineTo(hx + 13, hy + 3 + open * 8); g.lineTo(hx + 6, hy + 4); g.fill();
  }
  eyeGlow(g, hx + 2.5, hy - 2, 1.7, L.eye ?? 'rgba(255,60,40,0.9)');
  wing(false);
}

// ---------------------------------------------------------------- 鬼物：飘忽国风厉鬼/怨魂（浓重水墨幽纱 + 垂袖鬼爪）
function ghost(g: G, L: BeastLook, col: RGB, A: BeastAnim) {
  const fl = Math.sin(A.t * 2) * 5;
  const h = 76 * ((L.heads ?? 1) > 1 ? 1.15 : 1);
  const reach = Math.sin(Math.min(1, A.atk) * Math.PI) * 20;
  g.save();
  g.translate(0, -52 + fl);
  g.globalAlpha *= 0.92;

  // 底层玄墨怨气拖尾
  const aura = g.createRadialGradient(-2, 0, 4, -2, 8, h * 0.75);
  aura.addColorStop(0, css(shade(col, 0.38), 0.35));
  aura.addColorStop(1, css(col, 0));
  g.fillStyle = aura; g.beginPath(); g.arc(-2, 4, h * 0.75, 0, TAU); g.fill();

  // 碎裂宽大幽纱寿衣 + 尾烟飘散
  const gr = g.createLinearGradient(0, -h * 0.46, 0, h * 0.68);
  gr.addColorStop(0, css(shade(col, 0.48), 0.95));
  gr.addColorStop(0.5, css(col, 0.76));
  gr.addColorStop(1, css(col, 0));
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(-15, -h * 0.34);
  g.quadraticCurveTo(-25, h * 0.08, -28 + Math.sin(A.t * 2.2) * 5, h * 0.58);
  for (let i = 0; i <= 6; i++) {
    const x = -26 + i * 9 + Math.sin(A.t * 3.1 + i) * 3.5;
    const y = h * 0.56 + (i % 2 ? -12 : 10) + Math.sin(A.t * 4.5 + i * 1.4) * 5;
    g.lineTo(x, y);
  }
  g.quadraticCurveTo(22, h * 0.06, 13, -h * 0.34);
  g.closePath(); g.fill();
  g.strokeStyle = css(shade(col, 0.3), 0.45); g.lineWidth = 1; g.stroke();

  // 垂袖飘带 + 枯骨鬼爪前伸
  g.fillStyle = css(shade(col, 0.55), 0.85);
  g.beginPath(); g.moveTo(2, -h * 0.25); g.lineTo(24 + reach * 0.7, -h * 0.16);
  g.quadraticCurveTo(18 + reach * 0.5, h * 0.18, 2, h * 0.08); g.closePath(); g.fill();
  for (const s of [-1, 1]) {
    const gx = 16 + reach * 0.85, gy = -h * 0.16 + s * 6;
    g.strokeStyle = css(mix(col, WHITE, 0.28), 0.92); g.lineWidth = 2.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(4, -h * 0.22 + s * 4); g.quadraticCurveTo(gx, gy - 4, gx + 15 + reach * 0.4, gy + s * 2); g.stroke();
    g.strokeStyle = 'rgba(20,24,24,0.85)'; g.lineWidth = 1.1;
    for (let k = -1; k <= 1; k++) {
      g.beginPath(); g.moveTo(gx + 15 + reach * 0.4, gy + s * 2); g.lineTo(gx + 22 + reach * 0.4, gy + s * 2 + k * 3 + 2); g.stroke();
    }
  }

  // 阴森瘦削幽面 + 披散长墨发（无滑稽圆嘴）
  const hx = 3, hy = -h * 0.45;
  g.fillStyle = css(mix(col, WHITE, 0.42), 0.96);
  g.beginPath();
  g.moveTo(hx - 11, hy - 12); g.quadraticCurveTo(hx + 2, hy - 18, hx + 13, hy - 8);
  g.lineTo(hx + 12, hy + 7); g.quadraticCurveTo(hx + 3, hy + 16, hx - 9, hy + 10);
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(20,24,28,0.55)'; g.lineWidth = 1.1; g.stroke();
  g.fillStyle = 'rgba(16,18,22,0.92)';
  g.beginPath(); g.moveTo(hx - 12, hy - 8); g.quadraticCurveTo(hx - 2, hy - 22, hx + 11, hy - 10);
  g.lineTo(hx + 2, hy - 6); g.quadraticCurveTo(hx - 6, hy + 14, hx - 14, hy + 32 + Math.sin(A.t * 3) * 4);
  g.lineTo(hx - 21, hy + 18); g.closePath(); g.fill();
  g.fillStyle = 'rgba(8,10,16,0.9)';
  g.beginPath(); g.ellipse(hx + 2, hy - 3, 3.2, 4.2, 0, 0, TAU); g.ellipse(hx + 9.5, hy - 3, 2.6, 3.8, 0, 0, TAU); g.fill();
  eyeGlow(g, hx + 2, hy - 3, 1.35, L.eye ?? 'rgba(120,255,200,0.94)');
  eyeGlow(g, hx + 9.5, hy - 3, 1.15, L.eye ?? 'rgba(120,255,200,0.94)');
  // 窄横鬼口嘶裂纹
  g.strokeStyle = 'rgba(18,16,22,0.85)'; g.lineWidth = 1.3;
  g.beginPath(); g.moveTo(hx + 2, hy + 7); g.quadraticCurveTo(hx + 6.5, hy + 5.5 - Math.abs(Math.sin(A.t * 2.5)) * 1.5, hx + 10.5, hy + 7.5); g.stroke();

  g.restore();
}

// ---------------------------------------------------------------- 龟（海兽：六角龟甲纹 + 鳍足 + 鹰嘴龟首）
function turtle(g: G, L: BeastLook, col: RGB, A: BeastAnim) {
  const lunge = Math.sin(Math.min(1, A.atk) * Math.PI) * 10;
  // 粗壮鳍足（前大后小，带爪）
  for (const [x, o, far] of [[-24, 0, true], [20, Math.PI, true], [-18, Math.PI, false], [24, 0, false]] as [number, number, boolean][]) {
    const sw = Math.sin(A.phase + o) * 6 * A.move;
    taperedLimb(g, x, -14, x + sw * 0.4 + 2, -6, x + sw + 6, -1, far ? 5.5 : 6.5, 4.5, 3.5, far ? shade(col, 0.58) : shade(col, 0.85));
  }
  const sh = L.accent ?? shade(col, 0.6);
  const gr = g.createLinearGradient(0, -48, 0, -10); gr.addColorStop(0, css(mix(sh, WHITE, 0.15))); gr.addColorStop(1, css(shade(sh, 0.68)));
  // 龟壳穹顶 + 裙边
  g.fillStyle = gr;
  g.beginPath(); g.ellipse(0, -18, 41, 26, 0, Math.PI, 0); g.closePath(); g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = css(shade(sh, 0.52));
  g.beginPath(); g.ellipse(0, -16, 43, 5, 0, 0, TAU); g.fill(); g.stroke();
  // 六角龟甲块纹
  g.strokeStyle = css(shade(sh, 0.36), 0.78); g.lineWidth = 1.25;
  for (const cx of [-18, 0, 18]) {
    const cy = -29 + Math.abs(cx) * 0.22;
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = k * TAU / 6;
      const px = cx + Math.cos(a) * 9, py = cy + Math.sin(a) * 7;
      if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath(); g.stroke();
  }
  // 皱纹鹰嘴龟首
  const hx = 43 + lunge, hy = -16;
  g.fillStyle = css(col);
  g.beginPath(); g.moveTo(32, -20); g.quadraticCurveTo(hx, -26, hx + 11, -18);
  g.lineTo(hx + 13, -12); g.quadraticCurveTo(hx + 5, -7, 32, -11); g.closePath(); g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke();
  eyeGlow(g, hx + 5, hy - 3, 1.7, L.eye ?? 'rgba(255,200,60,0.9)');
}

// ---------------------------------------------------------------- 土甲龙
function pangolin(g: G, L: BeastLook, col: RGB, A: BeastAnim) {
  const mv = A.move, ph = A.phase;
  const bob = Math.abs(Math.sin(ph * 1.3)) * 3 * mv;
  const R = 30, cy = -R - 6 + bob;
  const dark = shade(col, 0.55);
  const tw = Math.sin(A.t * 3) * 6;
  g.strokeStyle = css(shade(col, 0.75)); g.lineWidth = 2.4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-R + 4, cy + 10); g.bezierCurveTo(-R - 18, cy + 18, -R - 24, -8 + tw, -R - 44, -4 + tw); g.stroke();
  for (const [bx, off] of [[-14, 0], [12, Math.PI], [-6, Math.PI], [20, 0]] as [number, number][]) {
    const sw = Math.sin(ph * 1.3 + off) * 5 * mv;
    taperedLimb(g, bx, cy + R * 0.65, bx + sw * 0.5, -10, bx + sw, -2, 6, 4.5, 3.2, off ? dark : shade(col, 0.72));
  }
  const gr = g.createRadialGradient(-8, cy - 12, 4, 0, cy, R * 1.15);
  gr.addColorStop(0, css(mix(col, WHITE, 0.25))); gr.addColorStop(0.6, css(col)); gr.addColorStop(1, css(shade(col, 0.6)));
  g.fillStyle = gr; g.beginPath(); g.ellipse(0, cy, R * 1.12, R, 0, 0, TAU); g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.5; g.stroke();
  g.strokeStyle = css(dark, 0.7); g.lineWidth = 1.6;
  for (let i = 0; i < 5; i++) { const x = -R * 0.8 + i * R * 0.4; g.beginPath(); g.ellipse(x, cy, 5 + Math.abs(2 - i) * 1.5, R * (0.95 - Math.abs(2 - i) * 0.12), 0, -Math.PI * 0.62, Math.PI * 0.4); g.stroke(); }
  g.fillStyle = css(dark, 0.55);
  for (let i = 0; i < 14; i++) { const a = i * 2.4, r = (i * 7 % 10) / 10 * R * 0.8; g.beginPath(); g.arc(Math.cos(a) * r, cy + Math.sin(a) * r * 0.85, 1.6, 0, TAU); g.fill(); }
  const hx = R + 4, hy = cy + 8;
  g.fillStyle = css(col); g.beginPath(); g.ellipse(hx, hy, 12, 9, -0.15, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke();
  g.beginPath(); g.moveTo(hx + 6, hy - 5); g.quadraticCurveTo(hx + 20, hy - 1, hx + 21, hy + 3); g.quadraticCurveTo(hx + 14, hy + 7, hx + 6, hy + 6); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#2a1a14'; g.beginPath(); g.arc(hx + 20, hy + 2, 1.8, 0, TAU); g.fill();
  g.fillStyle = css(shade(col, 0.7)); g.beginPath(); g.arc(hx - 5, hy - 8, 4.5, 0, TAU); g.fill();
  eyeGlow(g, hx + 3, hy - 3, 1.6, L.eye ?? 'rgba(255,200,60,0.9)');
}

// ---------------------------------------------------------------- 鱼类：吞海鱼 / 婴鲤兽 / 卧虎鲨
function fish(g: G, L: BeastLook, col: RGB, A: BeastAnim) {
  const carp = L.body === 'carp', shark = L.body === 'shark';
  const sw = Math.sin(A.t * (4 + A.move * 4)) * (0.5 + A.move * 0.5);
  const lunge = Math.sin(Math.min(1, A.atk) * Math.PI);
  const len = shark ? 96 : carp ? 80 : 64, h = shark ? 22 : carp ? 23 : 20;
  const y0 = -20 - Math.sin(A.t * 1.6) * 3;
  g.translate(lunge * 14, y0);
  const belly = L.belly ?? mix(col, WHITE, 0.5);

  // 水纹
  g.strokeStyle = 'rgba(230,245,255,0.55)'; g.lineWidth = 1.4;
  for (let i = 0; i < 3; i++) { const r = ((A.t * 30 + i * 18) % 54); g.beginPath(); g.ellipse(-len * 0.1, 18, len * 0.4 + r, 6 + r * 0.15, 0, Math.PI * 0.05, Math.PI * 0.95); g.stroke(); }

  // 尾鳍
  g.save(); g.translate(-len * 0.5, 0); g.rotate(sw * 0.35);
  g.fillStyle = css(L.accent ?? shade(col, 0.8), carp ? 0.82 : 0.96);
  g.beginPath(); g.moveTo(4, 0); g.quadraticCurveTo(-10, -6, -24, -h * (shark ? 1.3 : carp ? 1.25 : 1)); g.quadraticCurveTo(-14, 0, -24, h * (shark ? 0.7 : carp ? 1.15 : 1)); g.quadraticCurveTo(-10, 6, 4, 0); g.fill();
  g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
  g.strokeStyle = css(shade(col, 0.5), 0.45); for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(0, 0); g.lineTo(-20, i * h * 0.35); g.stroke(); }
  g.restore();

  // 背鳍
  g.fillStyle = css(L.accent ?? shade(col, 0.75), carp ? 0.85 : 0.96);
  g.beginPath();
  if (shark) { g.moveTo(-6, -h + 3); g.quadraticCurveTo(-2, -h - 24, -16, -h - 26); g.quadraticCurveTo(-16, -h - 6, -24, -h + 4); }
  else { g.moveTo(len * 0.2, -h + 3); for (let i = 0; i <= 6; i++) g.lineTo(len * 0.2 - i * len * 0.09, -h - 10 + (i % 2) * 4 + Math.sin(A.t * 5 + i) * 1.5); g.lineTo(-len * 0.36, -h * 0.6); }
  g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke();

  // 鱼身
  g.beginPath(); g.moveTo(len * 0.5, 0);
  g.bezierCurveTo(len * 0.4, -h * 1.15, -len * 0.25, -h * 1.1, -len * 0.52, -2);
  g.bezierCurveTo(-len * 0.25, h * 0.95, len * 0.35, h * 1.05, len * 0.5, 0); g.closePath();
  const gr = g.createLinearGradient(0, -h, 0, h);
  gr.addColorStop(0, css(shade(col, 0.75))); gr.addColorStop(0.5, css(col)); gr.addColorStop(1, css(belly));
  g.fillStyle = gr; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.3; g.stroke();

  if (!shark) {
    g.save(); g.clip();
    g.strokeStyle = css(mix(col, WHITE, 0.42), 0.45); g.lineWidth = 0.9;
    for (let r = -2; r <= 2; r++) for (let i = 0; i < 9; i++) { const x = len * 0.32 - i * len * 0.09 + (r % 2) * len * 0.045, y = r * h * 0.36; g.beginPath(); g.arc(x, y, h * 0.24, Math.PI * 0.55, Math.PI * 1.45); g.stroke(); }
    g.restore();
  } else {
    g.strokeStyle = css(shade(col, 0.4), 0.7); g.lineWidth = 3;
    for (let i = 0; i < 6; i++) { const x = len * 0.22 - i * len * 0.11; g.beginPath(); g.moveTo(x, -h * 0.95); g.quadraticCurveTo(x - 4, -h * 0.4, x + 1, -h * 0.05); g.stroke(); }
  }
  if (L.spikes) {
    g.strokeStyle = 'rgba(235,240,250,0.95)'; g.lineWidth = 1.6;
    for (let i = 0; i < 12; i++) { const u = i / 11, x = len * 0.38 - u * len * 0.8, yy = -h * Math.sin(Math.PI * (0.15 + u * 0.7)) * 0.95, ny = i % 2 ? 1 : -1; g.beginPath(); g.moveTo(x, yy * ny); g.lineTo(x - 5, yy * ny + ny * 10); g.stroke(); }
  }

  // 胸鳍（婴鲤兽为如翼飘纱长鳍）
  const fl = Math.sin(A.t * 5) * (carp ? 0.55 : 0.3);
  g.save(); g.translate(len * 0.12, h * 0.25); g.rotate(0.5 + fl);
  g.fillStyle = css(L.accent ?? mix(col, WHITE, 0.3), carp ? 0.78 : 0.9);
  const fw = carp ? 36 : shark ? 22 : 14;
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-fw * 0.4, fw * 0.28, -fw, fw * 0.8); g.quadraticCurveTo(-fw * 0.4, fw * 0.1, 6, -2); g.fill(); g.strokeStyle = INK; g.lineWidth = 0.9; g.stroke();
  g.restore();

  // 婴鲤兽：两对自然曲肘/曲膝的小手小脚 + 山海经风格诡魅婴首（告别表情包与直棍！）
  if (L.face === 'baby') {
    for (let i = 0; i < 4; i++) {
      const bx = len * 0.16 - i * 11, wv = Math.sin(A.t * 5.2 + i * 1.6) * 4.5;
      const dir = i < 2 ? 1 : -1;
      taperedLimb(g, bx, h * 0.52, bx + dir * 4 + wv * 0.4, h + 3, bx + dir * 8 + wv, h + 11, 3.5, 2.6, 2.1, [238, 218, 206]);
    }
    const hx = len * 0.34;
    // 鳞片颈环过渡
    g.fillStyle = css(shade(col, 0.78));
    g.beginPath(); g.ellipse(hx - 6, 0, 5.5, h * 0.6, 0, 0, TAU); g.fill();
    // 苍白阴郁婴首（饱满侧脸轮廓）
    g.fillStyle = 'rgba(244,228,218,0.98)';
    g.beginPath();
    g.moveTo(hx - 6, -h * 0.56);
    g.quadraticCurveTo(hx + 10, -h * 0.68, hx + 18, -h * 0.22);
    g.lineTo(hx + 21, 0);
    g.lineTo(hx + 18, 4);
    g.quadraticCurveTo(hx + 14, h * 0.58, hx + 1, h * 0.56);
    g.quadraticCurveTo(hx - 8, h * 0.35, hx - 6, -h * 0.56);
    g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.1; g.stroke();
    // 湿贴墨发与诡异幽黑双眸
    g.fillStyle = 'rgba(22,20,26,0.9)';
    g.beginPath(); g.moveTo(hx - 7, -h * 0.38); g.quadraticCurveTo(hx + 3, -h * 0.74, hx + 14, -h * 0.48);
    g.quadraticCurveTo(hx + 5, -h * 0.32, hx - 1, 3); g.lineTo(hx - 7, 5); g.closePath(); g.fill();
    g.fillStyle = '#120e12';
    g.beginPath(); g.ellipse(hx + 11.5, -5, 2.4, 1.5, -0.15, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.68)'; g.beginPath(); g.arc(hx + 12.1, -5.3, 0.7, 0, TAU); g.fill();
    g.strokeStyle = '#7e3034'; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(hx + 12, 6); g.quadraticCurveTo(hx + 15, 7 + lunge * 2, hx + 17.5, 5.5); g.stroke();
  } else {
    const hx = len * 0.36;
    g.strokeStyle = css(shade(col, 0.5), 0.8); g.lineWidth = 1.3; g.beginPath(); g.arc(hx - 6, 0, h * 0.7, -0.9, 0.9); g.stroke();
    if (shark) { g.strokeStyle = 'rgba(240,235,225,0.9)'; g.lineWidth = 1; for (let i = 0; i < 5; i++) { const x = len * 0.42 + i * 3; g.beginPath(); g.moveTo(x, 6); g.lineTo(x + 1.5, 9 + lunge * 3); g.stroke(); } }
    g.strokeStyle = '#2a1a14'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(len * 0.5, 2); g.lineTo(len * 0.38, 6 + lunge * 5); g.stroke();
    eyeGlow(g, hx + 4, -h * 0.3, 1.8, L.eye ?? 'rgba(255,220,80,0.9)');
  }
}

// ---------------------------------------------------------------- 千目妖
function urchin(g: G, L: BeastLook, col: RGB, A: BeastAnim) {
  const R = 30, cy = -R - 8 + Math.sin(A.t * 1.4) * 3;
  const pulse = 1 + Math.sin(Math.min(1, A.atk) * Math.PI) * 0.12;
  g.translate(0, cy); g.scale(pulse, pulse);
  for (let i = 0; i < 46; i++) {
    const a = i * 2.39996, wob = Math.sin(A.t * 2 + i) * 0.06;
    const len = R * (0.55 + ((i * 37) % 10) / 22);
    g.strokeStyle = css(i % 3 ? (L.accent ?? [210, 60, 40]) : shade(L.accent ?? [210, 60, 40], 0.7)); g.lineWidth = 2.2 - (i % 3) * 0.4;
    g.beginPath(); g.moveTo(Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8); g.lineTo(Math.cos(a + wob) * (R + len), Math.sin(a + wob) * (R + len)); g.stroke();
  }
  const gr = g.createRadialGradient(-8, -10, 3, 0, 0, R);
  gr.addColorStop(0, css(mix(col, WHITE, 0.3))); gr.addColorStop(0.7, css(col)); gr.addColorStop(1, css(shade(col, 0.55)));
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke();
  const n = L.eyes ?? 18;
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996 + 0.4, r = R * Math.sqrt((i + 0.5) / n) * 0.82;
    const ex = Math.cos(a) * r, ey = Math.sin(a) * r * 0.9;
    const open = Math.max(0.14, Math.sin(A.t * 1.3 + i * 1.7) * 0.5 + 0.6);
    const er = 3.5 - r / R * 1.2;
    g.fillStyle = '#f2f6e8'; g.beginPath(); g.ellipse(ex, ey, er, er * Math.min(1, open), 0, 0, TAU); g.fill();
    g.strokeStyle = css(shade(col, 0.45)); g.lineWidth = 0.7; g.stroke();
    if (open > 0.3) {
      g.fillStyle = 'rgba(55,195,88,1)'; g.beginPath(); g.arc(ex + 0.5, ey, er * 0.6, 0, TAU); g.fill();
      g.fillStyle = '#081a0a'; g.beginPath(); g.ellipse(ex + 0.6, ey, er * 0.18, er * 0.44, 0, 0, TAU); g.fill();
    }
  }
}

// ---------------------------------------------------------------- 寒魅
function jelly(g: G, L: BeastLook, col: RGB, A: BeastAnim) {
  const p = Math.sin(A.t * 2.2);
  const cy = -64 + p * 5;
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 9; i++) {
    const x0 = -20 + i * 5;
    g.strokeStyle = css(mix(col, WHITE, 0.4), 0.48); g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(x0, cy + 8);
    for (let k = 1; k <= 5; k++) g.lineTo(x0 + Math.sin(A.t * 3 + i + k * 0.8) * 5 * k * 0.5, cy + 8 + k * 11);
    g.stroke();
  }
  const w = 28 + p * 3, h = 24 - p * 2;
  const gr = g.createRadialGradient(-6, cy - 10, 2, 0, cy, w * 1.1);
  gr.addColorStop(0, 'rgba(250,254,255,0.65)'); gr.addColorStop(0.45, css(col, 0.45)); gr.addColorStop(1, css(shade(col, 0.7), 0.32));
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(-w, cy + 6); g.bezierCurveTo(-w, cy - h * 1.4, w, cy - h * 1.4, w, cy + 6);
  for (let i = 0; i <= 8; i++) g.quadraticCurveTo(w - (i + 0.5) * w / 4, cy + 12, w - (i + 1) * w / 4, cy + 6);
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(230,248,255,0.75)'; g.lineWidth = 1.2; g.stroke();
  // 内透菱形冰晶核
  g.fillStyle = 'rgba(220,248,255,0.55)';
  g.beginPath(); g.moveTo(0, cy - h * 0.72); g.lineTo(7, cy - 2); g.lineTo(0, cy + 5); g.lineTo(-7, cy - 2); g.closePath(); g.fill();
  for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) eyeGlow(g, sd * (w * 0.72 - i * 3), cy - 6 + i * 6, 1.5, L.eye ?? 'rgba(255,40,40,0.95)');
  g.globalCompositeOperation = 'lighter';
  const fg = g.createRadialGradient(0, cy, 0, 0, cy, 70); fg.addColorStop(0, css(col, 0.07)); fg.addColorStop(1, css(col, 0));
  g.fillStyle = fg; g.beginPath(); g.arc(0, cy, 70, 0, TAU); g.fill();
  g.globalCompositeOperation = 'source-over';
}

/** 一根羽毛 */
function feather(g: G, x: number, y: number, ang: number, len: number, w: number, c: RGB) {
  const cx = Math.cos(ang), cy = Math.sin(ang), px = -cy, py = cx;
  const tx = x + cx * len, ty = y + cy * len;
  g.beginPath(); g.moveTo(x + px * w * 0.4, y + py * w * 0.4);
  g.quadraticCurveTo(x + cx * len * 0.55 + px * w, y + cy * len * 0.55 + py * w, tx, ty);
  g.quadraticCurveTo(x + cx * len * 0.5 - px * w * 0.8, y + cy * len * 0.5 - py * w * 0.8, x - px * w * 0.4, y - py * w * 0.4);
  g.closePath(); g.fillStyle = css(c); g.fill();
  g.strokeStyle = 'rgba(28,24,20,0.4)'; g.lineWidth = 0.8; g.stroke();
  g.strokeStyle = css(mix(c, WHITE, 0.35), 0.6); g.lineWidth = 0.7; g.beginPath(); g.moveTo(x, y); g.lineTo(x + cx * len * 0.85, y + cy * len * 0.85); g.stroke();
}
