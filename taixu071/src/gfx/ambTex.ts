// 精细程序绘制的环境动物与上界灵禽（水墨勾边 + 体积渐变 + 羽片毛簇 + 眸光点睛）。
// 每种轮廓按需高倍抗锯齿烘焙一次，原有行走、受惊、飞行与水跃变形继续由 life.ts 驱动。
import { makeCanvas } from '../core/canvas';
import { AMB_DIM } from './ambDims';

type G = CanvasRenderingContext2D;
const cache = new Map<string, HTMLCanvasElement>();
const PI = Math.PI;
const INK = 'rgba(34,26,22,0.72)';

export function ambDim(k: string) { return AMB_DIM[k]; }

function grad(g: G, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  for (const [t, c] of stops) gr.addColorStop(t, c);
  return gr;
}

function ellipse(g: G, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, angle = 0, stroke?: string, lw = 1.2) {
  g.fillStyle = fill;
  g.beginPath();
  g.ellipse(x, y, rx, ry, angle, 0, PI * 2);
  g.fill();
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}

function line(g: G, points: number[], color: string, width: number) {
  g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]);
  g.stroke();
}

function poly(g: G, pts: number[], fill: string | CanvasGradient, stroke?: string, lw = 1.1) {
  g.fillStyle = fill;
  g.beginPath(); g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath(); g.fill();
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.lineJoin = 'round'; g.stroke(); }
}

function eye(g: G, x: number, y: number, r = 1.6, iris = '#231b17') {
  ellipse(g, x, y, r * 1.15, r * 1.05, iris);
  ellipse(g, x - r * 0.35, y - r * 0.35, r * 0.42, r * 0.42, 'rgba(255,252,240,0.92)');
}

function drawFish(g: G, k: 'carp_a' | 'carp_b' | 'jade_carp') {
  const koi = k === 'carp_a', jade = k === 'jade_carp';
  const tailCol = jade ? grad(g, 8, 30, 28, 70, [[0, '#ffd86b'], [0.6, '#ff9d42'], [1, '#ffe9a8']])
    : koi ? grad(g, 8, 30, 28, 70, [[0, '#e66e4e'], [1, '#c84d32']])
    : grad(g, 8, 32, 28, 68, [[0, '#cbb082'], [1, '#987c54']]);
  // Flowing forked tail & pectoral fins
  g.fillStyle = tailCol;
  g.beginPath();
  g.moveTo(27, 50);
  g.quadraticCurveTo(16, 35, 6, 26);
  g.quadraticCurveTo(13, 46, 15, 50);
  g.quadraticCurveTo(13, 54, 6, 74);
  g.quadraticCurveTo(16, 65, 27, 50);
  g.closePath(); g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.1; g.stroke();

  // Dorsal & ventral fins
  poly(g, [39, 34, 46, 19, 60, 34], jade ? '#ffc655' : koi ? '#d6684f' : '#968060', INK, 1.0);
  poly(g, [44, 66, 51, 78, 58, 66], jade ? 'rgba(255,216,110,0.85)' : 'rgba(220,200,175,0.82)', INK, 0.9);

  // Body with dorsal/ventral gradient
  const bodyGrad = jade
    ? grad(g, 51, 28, 51, 72, [[0, '#fff3c4'], [0.45, '#f2b84b'], [1, '#d97e2b']])
    : koi
      ? grad(g, 51, 29, 51, 71, [[0, '#faf3e8'], [0.65, '#eee2ce'], [1, '#c9b79f']])
      : grad(g, 51, 29, 51, 71, [[0, '#c8ae82'], [0.6, '#ae9167'], [1, '#7e6648']]);
  ellipse(g, 52, 50, 28, 19.5, bodyGrad, 0, INK, 1.3);

  // Koi spots / jade scales
  if (koi) {
    ellipse(g, 41, 44, 10, 7.5, '#d45a3d', 0.28);
    ellipse(g, 61, 54, 8.5, 6.5, '#dd764b', -0.2);
  } else if (jade) {
    ellipse(g, 44, 43, 9, 6, 'rgba(130,245,215,0.58)', 0.25);
    ellipse(g, 60, 52, 7, 5, 'rgba(255,245,190,0.6)', -0.15);
  }
  // Subtle scale arcs
  g.strokeStyle = jade ? 'rgba(180,105,30,0.34)' : 'rgba(90,70,55,0.22)';
  g.lineWidth = 0.9;
  for (let sx = 38; sx <= 60; sx += 7) {
    for (let sy = 43; sy <= 57; sy += 7) {
      g.beginPath(); g.arc(sx, sy, 3.6, -0.9, 0.9); g.stroke();
    }
  }
  // Gill cover + whiskers + eye
  g.strokeStyle = INK; g.lineWidth = 1.2;
  g.beginPath(); g.arc(65, 50, 9, 1.9, 4.3); g.stroke();
  line(g, [77, 52, 83, 57], '#a58056', 1.1);
  line(g, [76, 54, 81, 61], '#a58056', 1.0);
  eye(g, 71.5, 45, 2.0);
}

function drawFlyBird(g: G, k: 'crane_fly' | 'seagull' | 'spirit_crane' | 'luan_bird') {
  const crane = k === 'crane_fly' || k === 'spirit_crane';
  const spirit = k === 'spirit_crane', luan = k === 'luan_bird';
  // Back trailing legs / tail streamers
  if (luan) {
    // Twin glowing cyan-gold tail ribbons
    line(g, [28, 56, 12, 64, 4, 76], '#3ac8b2', 3.0);
    line(g, [30, 52, 10, 48, 3, 40], '#7ef5d8', 2.4);
    line(g, [14, 62, 7, 72], '#ffd86b', 1.4);
  } else {
    line(g, [30, 57, 10, 62], crane ? '#3e4242' : '#96968e', 2.4);
    line(g, [32, 60, 12, 67], crane ? '#2c3030' : '#85857e', 2.0);
  }
  // Far wing (shaded behind)
  const wingFar = spirit
    ? grad(g, 38, 56, 26, 78, [[0, '#dbece8'], [1, '#79c2b8']])
    : luan
      ? grad(g, 38, 56, 26, 78, [[0, '#58d4be'], [1, '#267872']])
      : grad(g, 38, 56, 26, 78, [[0, '#d8dcd8'], [1, '#9ca4a2']]);
  g.fillStyle = wingFar;
  g.beginPath();
  g.moveTo(41, 56); g.quadraticCurveTo(32, 73, 24, 81); g.quadraticCurveTo(42, 72, 57, 57); g.closePath();
  g.fill(); g.strokeStyle = INK; g.lineWidth = 1.0; g.stroke();

  // Neck & head
  const neckCol = spirit ? '#f6fbf9' : luan ? '#4acbb6' : crane ? '#f3f2eb' : '#e6e5de';
  line(g, [61, 51, 73, 45, 84, 41], neckCol, luan ? 6.2 : 5.2);
  ellipse(g, 83, 40.5, 5.2, 4.2, neckCol, -0.1, INK, 1.0);
  poly(g, [86, 39, 98.5, 43.5, 86, 45], spirit ? '#e2aa4a' : luan ? '#ffd86a' : crane ? '#c45b42' : '#d2a252', INK, 0.9);
  if (crane) ellipse(g, 82.5, 37.5, 3.2, 1.8, spirit ? '#35d0b5' : '#c93a32');
  if (luan) poly(g, [79, 37, 71, 29, 77, 34, 68, 25, 82, 36], '#ffd86a', INK, 0.8);

  // Body
  const bodyGrad = spirit
    ? grad(g, 45, 42, 45, 65, [[0, '#ffffff'], [0.65, '#e8f6f2'], [1, '#b8ddd6']])
    : luan
      ? grad(g, 45, 42, 45, 65, [[0, '#72e8cf'], [0.55, '#34a898'], [1, '#216966']])
      : grad(g, 45, 42, 45, 65, [[0, '#f8f7f2'], [0.65, '#e5e5dd'], [1, '#b9bebc']]);
  ellipse(g, 47, 53.5, 24.5, 9.8, bodyGrad, -0.1, INK, 1.25);

  // Near wing with primary feather tips
  const wingNear = spirit
    ? grad(g, 40, 20, 40, 50, [[0, '#9bf0dd'], [0.45, '#f6fbfa'], [1, '#ffffff']])
    : luan
      ? grad(g, 40, 20, 40, 50, [[0, '#ffd86b'], [0.4, '#4fd6bd'], [1, '#2c8a80']])
      : grad(g, 40, 20, 40, 50, [[0, '#f7f7f0'], [0.7, '#eef0ec'], [1, '#d8ddda']]);
  g.fillStyle = wingNear;
  g.beginPath();
  g.moveTo(33, 49);
  g.quadraticCurveTo(25, 29, 24, 17);
  g.quadraticCurveTo(39, 25, 55, 48);
  g.closePath(); g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.15; g.stroke();

  // Dark/gold primary tips & feather vanes
  if (crane || k === 'seagull') {
    poly(g, [24, 17, 34, 24, 39, 32, 28, 28], spirit ? '#228c7d' : '#353b3b');
  }
  g.strokeStyle = spirit ? 'rgba(40,140,125,0.45)' : luan ? 'rgba(255,220,120,0.55)' : 'rgba(110,115,112,0.38)';
  g.lineWidth = 1.0;
  for (const [fx, fy, tx, ty] of [[28, 24, 36, 40], [33, 29, 41, 44], [38, 34, 46, 46]]) {
    line(g, [fx, fy, tx, ty], g.strokeStyle as string, 1.0);
  }
  eye(g, 84.5, 40.5, 1.6);
}

function drawStandBird(g: G, k: 'egret' | 'crane_idle' | 'duck' | 'chicken') {
  const tall = k === 'egret' || k === 'crane_idle', chicken = k === 'chicken';
  const bodyTop = chicken ? '#d89a6a' : k === 'duck' ? '#e8dcc0' : '#f9f8f2';
  const bodyBot = chicken ? '#945d3b' : k === 'duck' ? '#b3a384' : '#cfd5d3';
  const legCol = tall ? '#454a4a' : '#ba7f3c';
  // Thin jointed legs + toes
  line(g, tall ? [39, 70, 36, 83, 33, 94, 26, 96] : [42, 72, 40, 82, 39, 90, 32, 92], legCol, 2.3);
  line(g, tall ? [52, 70, 50, 83, 50, 94, 44, 96] : [54, 72, 54, 82, 55, 90, 62, 92], legCol, 2.3);

  const bGrad = grad(g, 42, 46, 42, 76, [[0, bodyTop], [1, bodyBot]]);
  ellipse(g, 42, 62.5, 26.5, tall ? 13 : 19.5, bGrad, -0.1, INK, 1.25);
  // Folded wing contour + feather arcs
  ellipse(g, 37, 62, 16.5, tall ? 8.5 : 11.5, tall ? '#dde2df' : '#baa888', -0.14, 'rgba(60,52,44,0.35)', 0.9);
  if (tall) {
    // S-curve neck + head + beak + crest/crown
    line(g, [59, 60, 62, 44, 69, 28, 76, 25], bodyTop, 6.8);
    line(g, [58, 61, 61, 45, 68, 28], 'rgba(34,26,22,0.28)', 1.2);
    ellipse(g, 76.5, 25, 6.2, 4.8, bodyTop, 0, INK, 1.1);
    poly(g, [82, 24.5, 97.5, 27.5, 82, 29.5], '#b88c52', INK, 0.9);
    if (k === 'crane_idle') {
      ellipse(g, 76, 20.5, 3.8, 2.0, '#cc3d32');
      poly(g, [18, 60, 12, 68, 24, 68], '#373d3d'); // black tail plume
    } else {
      line(g, [72, 22, 62, 19], '#f2f1ea', 1.8); // egret crest plume
    }
    eye(g, 78.5, 24.5, 1.5);
  } else {
    ellipse(g, 67.5, 50.5, 11.5, 10, bGrad, 0, INK, 1.15);
    poly(g, [77, 49.5, 89.5, 53.5, 77, 57.5], '#db9e44', INK, 0.95);
    if (chicken) {
      poly(g, [62, 42, 65, 33, 69, 40, 73, 33, 76, 44], '#c7352b', INK, 0.8);
      ellipse(g, 73, 58, 3, 4.2, '#c7352b');
      poly(g, [18, 56, 8, 46, 13, 58, 9, 64], '#70492f', INK, 0.9);
    } else {
      ellipse(g, 68, 45, 9, 4.5, '#2b6c5c'); // mallard sheen on duck head
    }
    eye(g, 71.5, 48, 1.5);
  }
}

function drawQuadruped(g: G, k: string) {
  if (k === 'turtle') {
    for (const lx of [28, 64]) ellipse(g, lx, 75, 7.5, 5.5, '#68744c', 0, INK, 1.0);
    const shGrad = grad(g, 48, 38, 48, 80, [[0, '#96a66c'], [0.6, '#70824f'], [1, '#4d5d38']]);
    ellipse(g, 48, 60, 30, 20, '#5a6d43', 0, INK, 1.25);
    ellipse(g, 49, 56.5, 26, 15.5, shGrad, 0, 'rgba(38,48,28,0.55)', 1.0);
    line(g, [29, 56, 39, 46, 50, 56, 39, 67, 29, 56, 50, 56, 62, 46, 70, 56, 62, 67, 50, 56], '#405234', 1.5);
    ellipse(g, 80, 61, 9.5, 7, grad(g, 80, 54, 80, 68, [[0, '#97a774'], [1, '#6c7c4e']]), 0, INK, 1.1);
    eye(g, 84, 58, 1.4);
    return;
  }

  const palette: Record<string, [string, string, string, string]> = {
    deer: ['#b9835c', '#885838', '#ead4b4', '#5c3c27'],
    spirit_deer: ['#e6f8f3', '#8fd6c6', '#ffffff', '#2e8c7d'],
    rabbit: ['#cfbeaa', '#9f8c76', '#f4ede2', '#705e50'],
    snowfox: ['#f0f1ec', '#c5cad0', '#ffffff', '#63686f'],
    monkey: ['#9b795d', '#6e523d', '#d3b296', '#4a3a2d'],
    camel: ['#c8a070', '#967048', '#e2c59d', '#634932'],
    yak: ['#6d5d53', '#433831', '#a99781', '#2d2621'],
    dog: ['#ba8d64', '#86603f', '#ead6ba', '#4f3a2b'],
    ox: ['#9c846d', '#6d5846', '#d3c0a8', '#42372f'],
    sheep: ['#e8dfd0', '#c7bca8', '#fcf9f0', '#695f50'],
    horse: ['#b07650', '#794a2e', '#d6af87', '#3f2a22'],
  };
  const [top, mid, light, dark] = palette[k] ?? ['#9b8065', '#765e47', '#d4bea0', '#59483b'];

  if (k === 'rabbit') {
    const rGrad = grad(g, 40, 48, 40, 88, [[0, top], [1, mid]]);
    ellipse(g, 16, 69, 6.5, 6.5, light, 0, INK, 1.0);
    ellipse(g, 41, 70, 25, 19, rGrad, -0.05, INK, 1.2);
    ellipse(g, 44, 78, 14, 7.5, light);
    ellipse(g, 65, 58, 13, 12, rGrad, 0, INK, 1.15);
    ellipse(g, 59, 36, 4.8, 17.5, top, -0.15, INK, 1.0);
    ellipse(g, 69, 36, 4.5, 16.5, top, 0.12, INK, 1.0);
    ellipse(g, 59, 36, 1.9, 11.5, '#e3b3ae', -0.15);
    eye(g, 70.5, 54, 1.7);
    ellipse(g, 77, 59, 1.8, 1.4, '#e39696');
    return;
  }

  if (k === 'monkey') {
    const mGrad = grad(g, 44, 44, 44, 88, [[0, top], [1, mid]]);
    line(g, [27, 70, 14, 72, 10, 60, 18, 53], dark, 4.2);
    line(g, [36, 77, 28, 93, 22, 93], dark, 4.2);
    line(g, [54, 79, 60, 92, 68, 92], dark, 4.2);
    ellipse(g, 44, 67, 22.5, 20.5, mGrad, 0, INK, 1.2);
    ellipse(g, 48, 72, 11, 11, light);
    ellipse(g, 66, 44, 13, 13.5, mGrad, 0, INK, 1.15);
    ellipse(g, 70.5, 46.5, 9, 9, light);
    ellipse(g, 55, 43, 3.8, 4.5, light, 0, INK, 0.9);
    line(g, [57, 60, 69, 72, 78, 72], top, 4.2);
    eye(g, 73.5, 43, 1.6);
    return;
  }

  // Tail behind body
  if (k === 'snowfox' || k === 'dog') {
    poly(g, [26, 65, 6, 51, 8, 67, 19, 77, 30, 71], k === 'snowfox' ? light : top, INK, 1.0);
    if (k === 'snowfox') poly(g, [6, 51, 12, 55, 11, 64, 7, 61], '#ffffff');
  } else if (k === 'spirit_deer') {
    poly(g, [22, 58, 10, 50, 13, 62, 23, 64], '#9bf0dd', INK, 0.9);
  } else {
    line(g, [22, 57, 12, 65, 10, 77], dark, 3.0);
  }

  // Far legs then near legs
  const legW = k === 'deer' || k === 'spirit_deer' || k === 'horse' ? 3.2 : 5.0;
  for (const [x, dx, c] of [[28, -3, dark], [61, -2, dark], [36, 2, mid], [68, 3, mid]] as [number, number, string][]) {
    line(g, [x, 67, x + dx, 90, x + dx + 3, 92], c, legW);
    ellipse(g, x + dx + 2.5, 92, legW * 0.65, 2.2, '#2b221e');
  }

  if (k === 'camel') {
    const hGrad = grad(g, 45, 31, 45, 68, [[0, top], [1, mid]]);
    ellipse(g, 37, 49, 13, 18, hGrad, 0, INK, 1.1);
    ellipse(g, 54, 48, 13, 18, hGrad, 0, INK, 1.1);
  }

  const bodyGrad = grad(g, 46, 42, 46, 82, [[0, top], [0.7, mid], [1, dark]]);
  ellipse(g, 46, 62, 30, 19, bodyGrad, 0, INK, 1.25);
  ellipse(g, 46, 74, 19, 6.5, light);

  if (k === 'sheep') {
    for (const [x, y] of [[26, 55], [37, 48], [49, 49], [61, 53], [29, 66], [42, 65], [56, 66]]) {
      ellipse(g, x, y, 9.2, 8.2, light, 0, 'rgba(130,118,100,0.35)', 0.9);
    }
  }
  if (k === 'yak') {
    poly(g, [18, 61, 19, 79, 29, 84, 37, 77, 45, 85, 54, 78, 65, 83, 73, 67], dark, INK, 1.0);
  }
  if (k === 'deer' || k === 'spirit_deer' || k === 'horse' || k === 'camel') {
    poly(g, [61, 58, 68, 35, 78, 32, 78, 62], grad(g, 68, 32, 68, 62, [[0, top], [1, mid]]), INK, 1.1);
  }
  if (k === 'horse') {
    line(g, [65, 37, 60, 47, 58, 59], dark, 4.4);
  }

  // Head & muzzle
  ellipse(g, 76, 47, k === 'horse' ? 14 : 12, k === 'horse' ? 12.5 : 11, grad(g, 76, 36, 76, 58, [[0, top], [1, mid]]), 0, INK, 1.15);
  ellipse(g, 84, 52, 8, 5.8, light, 0, 'rgba(60,46,38,0.35)', 0.8);
  poly(g, [69, 39, 69, 27, 76, 37], top, INK, 0.95);
  poly(g, [78, 38, 83, 27, 84, 41], top, INK, 0.95);

  if (k === 'deer' || k === 'spirit_deer') {
    const antCol = k === 'spirit_deer' ? '#ffd978' : dark;
    line(g, [73, 34, 68, 19, 60, 12], antCol, 2.1);
    line(g, [68, 20, 74, 11], antCol, 1.8);
    line(g, [65, 16, 61, 19], antCol, 1.5);
    for (const [sx, sy] of [[31, 54], [39, 51], [47, 55], [54, 52]]) {
      ellipse(g, sx, sy, 2.2, 1.7, k === 'spirit_deer' ? '#7ef5da' : light);
    }
    if (k === 'spirit_deer') {
      ellipse(g, 75, 40, 2.4, 2.0, '#ffd978');
    }
  }
  if (k === 'ox' || k === 'yak') {
    line(g, [71, 38, 64, 28, 62, 20], light, 3.0);
    line(g, [79, 37, 86, 27, 88, 20], light, 3.0);
  }
  eye(g, 79.2, 43.2, 1.7);
}

function animal(g: G, k: string) {
  if (k === 'carp_a' || k === 'carp_b' || k === 'jade_carp') return drawFish(g, k);
  if (k === 'crane_fly' || k === 'seagull' || k === 'spirit_crane' || k === 'luan_bird') return drawFlyBird(g, k);
  if (k === 'egret' || k === 'crane_idle' || k === 'duck' || k === 'chicken') return drawStandBird(g, k);
  return drawQuadruped(g, k);
}

/** 未知 key 保持 false，调用方仍可使用自己的回退绘制。 */
export function drawAmb(g: G, k: string, x: number, y: number, o: { flip?: boolean; s?: number; sx?: number; sy?: number; rot?: number; alpha?: number; ay?: number } = {}): boolean {
  if (!Object.prototype.hasOwnProperty.call(AMB_DIM, k)) return false;
  const D = AMB_DIM[k];
  let cv = cache.get(k);
  if (!cv) {
    try {
      cv = makeCanvas(D.w * 3, D.h * 3);
      const ctx = cv.getContext('2d');
      if (!ctx) return false;
      ctx.scale(cv.width / 100, cv.height / 100);
      animal(ctx, k);
      cache.set(k, cv);
    } catch { return false; }
  }
  const s = o.s ?? 1, w = D.w * s * (o.sx ?? 1), h = D.h * s * (o.sy ?? 1), ay = o.ay ?? 1;
  g.save(); g.translate(x, y); if (o.rot) g.rotate(o.rot); if (o.flip) g.scale(-1, 1);
  if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
  g.drawImage(cv, -w / 2, -h * ay, w, h); g.restore();
  return true;
}
