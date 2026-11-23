// 神识：按境界分级的水墨神识特效 + 法宝/功法修饰 + 圈外“记忆水墨”
// 设计要点：所有动画都由连续时间驱动（无跳变）；纹理预渲染后旋转/缩放绘制，保证丝滑。
import { mulberry32 } from '../core/rng';
import type { FxSys } from '../gl/fx';
import type { GLStage } from '../gl/stage';
import { C as CELL } from '../gl/atlas';

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const TEX = 1024, TR = 470; // 纹理尺寸与其中圆环半径

export type SenseMod = 'dayan' | 'wood' | 'thunder' | 'demon' | 'insect' | 'ice' | 'fire' | 'sword';
export const SENSE_MOD_NAME: Record<SenseMod, string> = {
  dayan: '天衍诀·神识八卦', wood: '养魂木·藤纹', thunder: '伏魔金雷·雷丝', demon: '魔功·血雾', insect: '蚀金蛊·金芒', ice: '玄冰·霜华', fire: '真火·焰纹', sword: '剑意·剑芒',
};

export interface TierStyle {
  name: string;
  ink: [number, number, number];      // 墨圈主色
  glow: [number, number, number];     // 光色
  ripples: number;                    // 同时存在的涟漪数
  period: number;                     // 涟漪周期
  runes: boolean; motes: number; yinyang: boolean; stars: boolean; lotus: boolean;
  celestial?: boolean;                // 灵界星轨天象环
  immortal?: boolean;                 // 仙界金莲日轮环
}
export const TIERS: TierStyle[] = [
  { name: '凡人', ink: [90, 100, 96], glow: [190, 210, 200], ripples: 1, period: 6, runes: false, motes: 0, yinyang: false, stars: false, lotus: false },
  { name: '炼气·水墨', ink: [52, 112, 100], glow: [150, 225, 205], ripples: 1, period: 5, runes: false, motes: 6, yinyang: false, stars: false, lotus: false },
  { name: '筑基·青纹', ink: [40, 104, 118], glow: [130, 220, 235], ripples: 2, period: 4.5, runes: false, motes: 10, yinyang: false, stars: false, lotus: true },
  { name: '结丹·金篆', ink: [138, 100, 38], glow: [255, 216, 120], ripples: 2, period: 4.1, runes: true, motes: 16, yinyang: false, stars: false, lotus: true },
  { name: '元婴·阴阳', ink: [104, 62, 148], glow: [222, 186, 255], ripples: 3, period: 3.8, runes: true, motes: 20, yinyang: true, stars: false, lotus: true },
  { name: '化神·星图', ink: [162, 48, 44], glow: [255, 198, 162], ripples: 3, period: 3.5, runes: true, motes: 22, yinyang: true, stars: true, lotus: true },
  { name: '炼虚·太虚', ink: [184, 112, 32], glow: [255, 210, 128], ripples: 3, period: 3.3, runes: true, motes: 26, yinyang: false, stars: true, lotus: true, celestial: true },
  { name: '合体·万象', ink: [34, 148, 136], glow: [135, 245, 222], ripples: 3, period: 3.1, runes: true, motes: 30, yinyang: true, stars: true, lotus: true, celestial: true },
  { name: '大乘·天劫', ink: [116, 74, 205], glow: [214, 185, 255], ripples: 3, period: 3.0, runes: true, motes: 34, yinyang: true, stars: true, lotus: true, celestial: true },
  { name: '真仙·仙澜', ink: [52, 126, 216], glow: [155, 224, 255], ripples: 3, period: 2.9, runes: true, motes: 38, yinyang: false, stars: true, lotus: true, celestial: true, immortal: true },
  { name: '玄仙·玄穹', ink: [22, 158, 176], glow: [148, 250, 248], ripples: 3, period: 2.8, runes: true, motes: 42, yinyang: true, stars: true, lotus: true, celestial: true, immortal: true },
  { name: '金仙·金轮', ink: [216, 156, 30], glow: [255, 228, 125], ripples: 3, period: 2.7, runes: true, motes: 46, yinyang: true, stars: true, lotus: true, celestial: true, immortal: true },
  { name: '大罗·混沌', ink: [232, 196, 92], glow: [255, 246, 196], ripples: 3, period: 2.5, runes: true, motes: 52, yinyang: true, stars: true, lotus: true, celestial: true, immortal: true },
];

const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;

function mk(w = TEX, h = TEX) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

/** Mipmap：缩小绘制时选用最接近屏幕尺寸的预缩小纹理，避免细线在旋转时闪烁、爬行（“不丝滑”的主因） */
const MIPS = new WeakMap<HTMLCanvasElement, HTMLCanvasElement[]>();
function mip(img: HTMLCanvasElement, screenPx: number): HTMLCanvasElement {
  let arr = MIPS.get(img);
  if (!arr) { arr = [img]; MIPS.set(img, arr); }
  let lv = 0;
  while (lv < 5 && arr[lv].width * 0.5 >= screenPx * 1.15) {
    if (!arr[lv + 1]) {
      const src = arr[lv];
      const c = mk(Math.max(8, src.width >> 1), Math.max(8, src.height >> 1));
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = true; (g as any).imageSmoothingQuality = 'high';
      g.drawImage(src, 0, 0, c.width, c.height);
      arr[lv + 1] = c;
    }
    lv++;
  }
  return arr[lv];
}
const DPR = () => (typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1);

/** 干笔水墨圆环：许多段不规则弧线叠加 */
function inkRing(col: [number, number, number], seed: number, rough = 1) {
  const c = mk(); const g = c.getContext('2d')!;
  const rnd = mulberry32(seed);
  const C = TEX / 2;
  g.lineCap = 'round';
  // 内侧晕染
  const gr = g.createRadialGradient(C, C, TR * 0.8, C, C, TR * 1.02);
  gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(0.75, rgba(col, 0.05)); gr.addColorStop(1, rgba(col, 0.16));
  g.fillStyle = gr; g.beginPath(); g.arc(C, C, TR * 1.02, 0, TAU); g.fill();
  // 主笔：粗细起伏的墨线
  for (let pass = 0; pass < 3; pass++) {
    let a = rnd() * TAU;
    const end = a + TAU * (0.9 + rnd() * 0.15);
    while (a < end) {
      const len = 0.25 + rnd() * 0.7;
      const r0 = TR + (rnd() - 0.5) * 7 * rough;
      const w = (pass === 0 ? 5.5 : 2.2) * (0.6 + rnd() * 0.8);
      g.strokeStyle = rgba(col, (pass === 0 ? 0.5 : 0.32) * (0.6 + rnd() * 0.5));
      g.lineWidth = w;
      g.beginPath();
      for (let k = 0; k <= 16; k++) {
        const t = a + len * k / 16;
        const taper = Math.sin((k / 16) * Math.PI);
        const r = r0 + Math.sin(t * 7 + pass) * 2.5 * rough + (rnd() - 0.5) * 1.2;
        const x = C + Math.cos(t) * r, y = C + Math.sin(t) * r;
        if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
        void taper;
      }
      g.stroke();
      a += len + rnd() * 0.25;
    }
  }
  // 飞白：细碎的干笔丝
  for (let i = 0; i < 260; i++) {
    const t = rnd() * TAU, r = TR + (rnd() - 0.5) * 14 * rough, l = 0.01 + rnd() * 0.05;
    g.strokeStyle = rgba(col, 0.12 + rnd() * 0.25); g.lineWidth = 0.6 + rnd() * 1.4;
    g.beginPath(); g.arc(C, C, r, t, t + l); g.stroke();
  }
  // 墨点
  for (let i = 0; i < 40; i++) {
    const t = rnd() * TAU, r = TR + (rnd() - 0.5) * 18;
    g.fillStyle = rgba(col, 0.15 + rnd() * 0.3);
    g.beginPath(); g.arc(C + Math.cos(t) * r, C + Math.sin(t) * r, 0.8 + rnd() * 2.6, 0, TAU); g.fill();
  }
  return c;
}

/** 游走笔触：几道粗细渐变的长弧笔，反向旋转时形成“流动”的水墨感 */
function brushArcs(col: [number, number, number], seed: number, n = 5, rOff = 0) {
  const c = mk(); const g = c.getContext('2d')!;
  const rnd = mulberry32(seed); const C = TEX / 2;
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU + rnd() * 0.6, len = 0.5 + rnd() * 0.7;
    const r0 = TR + rOff + (rnd() - 0.5) * 10;
    const wMax = 4 + rnd() * 5;
    const SEG = 40;
    for (let k = 0; k < SEG; k++) {
      const u = k / SEG, t0 = a0 + len * u, t1 = a0 + len * (k + 1) / SEG;
      const taper = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 0.7) * (1 - u * 0.35);
      g.strokeStyle = rgba(col, 0.75 * taper + 0.05);
      g.lineWidth = Math.max(0.6, wMax * taper);
      const r = r0 + Math.sin(u * 5 + i) * 3;
      g.beginPath(); g.arc(C, C, r, t0, t1 + 0.004); g.stroke();
      // 飞白丝
      if (rnd() < 0.5) { g.strokeStyle = rgba(col, 0.25 * taper); g.lineWidth = 0.8; g.beginPath(); g.arc(C, C, r + (rnd() - 0.5) * wMax * 1.6, t0, t1); g.stroke(); }
    }
    // 收笔墨点
    g.fillStyle = rgba(col, 0.35);
    const te = a0 + len; g.beginPath(); g.arc(C + Math.cos(te) * r0, C + Math.sin(te) * r0, 1.5 + rnd() * 1.5, 0, TAU); g.fill();
  }
  // 外缘晕染
  const gr = g.createRadialGradient(C, C, TR * 0.99, C, C, TR * 1.07);
  gr.addColorStop(0, rgba(col, 0.1)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(C, C, TR * 1.07, 0, TAU); g.arc(C, C, TR * 0.99, 0, TAU, true); g.fill();
  return c;
}

const RUNE_CHARS = '乾坤震巽坎离艮兑天地玄黄宇宙洪荒日月星辰金木水火土风雷云雨元始太清上清玉清道法自然阴阳五行八卦九宫灵虚真一';
/** 篆文环 */
function runeRing(col: [number, number, number], seed: number, rr = TR * 0.93, count = 36) {
  const c = mk(); const g = c.getContext('2d')!;
  const rnd = mulberry32(seed);
  const C = TEX / 2;
  g.strokeStyle = rgba(col, 0.55); g.lineWidth = 1.4;
  g.beginPath(); g.arc(C, C, rr + 18, 0, TAU); g.stroke();
  g.beginPath(); g.arc(C, C, rr - 18, 0, TAU); g.stroke();
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    g.save(); g.translate(C + Math.cos(a) * rr, C + Math.sin(a) * rr); g.rotate(a + Math.PI / 2);
    g.strokeStyle = rgba(col, 0.75); g.lineWidth = 1.8;
    // 真实文字（浏览器有中文字体时为篆/楷意的符文）
    const ch = RUNE_CHARS[Math.floor(rnd() * RUNE_CHARS.length)];
    g.fillStyle = rgba(col, 0.85);
    g.font = '26px "STKaiti","KaiTi","Kaiti SC","楷体","Noto Serif SC","Songti SC",serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(ch, 0, 0);
    g.restore();
  }
  return c;
}

/** 祥云纹环（筑基青纹） */
function cloudRing(col: [number, number, number], rr = TR * 0.9, n = 16) {
  const c = mk(); const g = c.getContext('2d')!; const C = TEX / 2;
  g.strokeStyle = rgba(col, 0.7); g.lineWidth = 2.2; g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    g.save(); g.translate(C + Math.cos(a) * rr, C + Math.sin(a) * rr); g.rotate(a + Math.PI / 2);
    // 双卷云头 + 尾线
    for (const sgn of [-1, 1]) {
      g.beginPath();
      for (let k = 0; k <= 30; k++) { const u = k / 30, th = u * TAU * 1.15, r = 11 * (1 - u * 0.8); const x = sgn * (10 + Math.cos(th) * r * sgn), y = Math.sin(th) * r; if (k) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    }
    g.beginPath(); g.moveTo(-21, 0); g.quadraticCurveTo(-60, 8, -88, 0); g.stroke();
    g.restore();
  }
  g.strokeStyle = rgba(col, 0.35); g.lineWidth = 1;
  g.beginPath(); g.arc(C, C, rr + 20, 0, TAU); g.stroke();
  return c;
}

/** 八卦环（天衍诀） */
function baguaRing(col: [number, number, number]) {
  const c = mk(); const g = c.getContext('2d')!;
  const C = TEX / 2, r = TR * 0.8;
  const TRI = [[1, 1, 1], [0, 1, 1], [1, 0, 1], [0, 0, 1], [1, 1, 0], [0, 1, 0], [1, 0, 0], [0, 0, 0]];
  g.strokeStyle = rgba(col, 0.5); g.lineWidth = 2;
  g.beginPath(); for (let i = 0; i <= 8; i++) { const a = (i / 8) * TAU + Math.PI / 8; const x = C + Math.cos(a) * (r + 40), y = C + Math.sin(a) * (r + 40); if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke();
  g.beginPath(); for (let i = 0; i <= 8; i++) { const a = (i / 8) * TAU + Math.PI / 8; const x = C + Math.cos(a) * (r - 40), y = C + Math.sin(a) * (r - 40); if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke();
  g.fillStyle = rgba(col, 0.7);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    g.save(); g.translate(C + Math.cos(a) * r, C + Math.sin(a) * r); g.rotate(a + Math.PI / 2);
    TRI[i].forEach((yang, k) => {
      const y = -14 + k * 14;
      if (yang) g.fillRect(-26, y - 3.5, 52, 7);
      else { g.fillRect(-26, y - 3.5, 22, 7); g.fillRect(4, y - 3.5, 22, 7); }
    });
    g.restore();
  }
  return c;
}

/** 藤纹（养魂木） */
function vineRing(seed: number) {
  const c = mk(); const g = c.getContext('2d')!;
  const rnd = mulberry32(seed); const C = TEX / 2;
  g.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    g.strokeStyle = pass ? 'rgba(150,210,120,0.55)' : 'rgba(60,110,60,0.6)'; g.lineWidth = pass ? 1.6 : 3;
    g.beginPath();
    for (let k = 0; k <= 360; k++) { const t = (k / 360) * TAU; const r = TR - 10 + Math.sin(t * 22 + pass) * 9; const x = C + Math.cos(t) * r, y = C + Math.sin(t) * r; if (k) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
  }
  for (let i = 0; i < 70; i++) {
    const t = rnd() * TAU, r = TR - 10 + Math.sin(t * 22) * 9;
    const x = C + Math.cos(t) * r, y = C + Math.sin(t) * r;
    g.save(); g.translate(x, y); g.rotate(t + (rnd() - 0.5) * 2);
    g.fillStyle = `rgba(${90 + rnd() * 60 | 0},${160 + rnd() * 60 | 0},${80 + rnd() * 40 | 0},0.7)`;
    g.beginPath(); g.ellipse(7, 0, 7, 3, 0, 0, TAU); g.fill();
    g.restore();
  }
  return c;
}

/** 阴阳鱼水印 */
function yinyang(col: [number, number, number]) {
  const c = mk(512, 512); const g = c.getContext('2d')!;
  const C = 256, r = 230;
  g.fillStyle = rgba(col, 0.9);
  g.beginPath(); g.arc(C, C, r, -Math.PI / 2, Math.PI / 2); g.arc(C, C + r / 2, r / 2, Math.PI / 2, -Math.PI / 2, true); g.arc(C, C - r / 2, r / 2, Math.PI / 2, -Math.PI / 2); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(C, C - r / 2, r / 7, 0, TAU); g.fill();
  g.fillStyle = rgba(col, 0.9); g.beginPath(); g.arc(C, C + r / 2, r / 7, 0, TAU); g.fill();
  g.strokeStyle = rgba(col, 0.9); g.lineWidth = 6; g.beginPath(); g.arc(C, C, r, 0, TAU); g.stroke();
  return c;
}

/** 星图（化神）：只保留两圈极淡的同心圆，不再撒星点——缩远时星点会被插值成一团团糊掉的光斑 */
function starMap(seed: number) {
  const c = mk(); const g = c.getContext('2d')!;
  const rnd = mulberry32(seed); const C = TEX / 2;
  void rnd;
  g.strokeStyle = 'rgba(255,220,190,0.25)'; g.lineWidth = 1;
  for (const k of [0.33, 0.66]) { g.beginPath(); g.arc(C, C, TR * k, 0, TAU); g.stroke(); }
  return c;
}

/** 莲纹（脚下法印） */
function lotus(col: [number, number, number]) {
  const c = mk(512, 512); const g = c.getContext('2d')!;
  const C = 256;
  g.strokeStyle = rgba(col, 0.8); g.lineWidth = 3;
  for (let layer = 0; layer < 2; layer++) {
    const n = layer ? 8 : 12, R = layer ? 150 : 220, w = layer ? 0.36 : 0.26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + layer * 0.2;
      g.beginPath(); g.moveTo(C, C);
      g.quadraticCurveTo(C + Math.cos(a - w) * R * 0.75, C + Math.sin(a - w) * R * 0.75, C + Math.cos(a) * R, C + Math.sin(a) * R);
      g.quadraticCurveTo(C + Math.cos(a + w) * R * 0.75, C + Math.sin(a + w) * R * 0.75, C, C);
      g.stroke();
    }
  }
  g.beginPath(); g.arc(C, C, 236, 0, TAU); g.stroke();
  g.beginPath(); g.arc(C, C, 60, 0, TAU); g.stroke();
  return c;
}

/** 灵界星轨天象环（炼虚 / 合体 / 大乘） */
function celestialRing(col: [number, number, number], seed: number) {
  const c = mk(); const g = c.getContext('2d')!;
  const rnd = mulberry32(seed); const C = TEX / 2;
  const r1 = TR * 0.985, r2 = TR * 0.875, r3 = TR * 0.77;
  g.strokeStyle = rgba(col, 0.55); g.lineWidth = 1.6;
  g.beginPath(); g.arc(C, C, r1, 0, TAU); g.stroke();
  g.strokeStyle = rgba(col, 0.36); g.lineWidth = 1.1;
  g.beginPath(); g.arc(C, C, r2, 0, TAU); g.stroke();
  g.beginPath(); g.arc(C, C, r3, 0, TAU); g.stroke();
  // 十二星宿弦线与星点
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * TAU, a1 = ((i + 5) / 12) * TAU;
    const x0 = C + Math.cos(a0) * r2, y0 = C + Math.sin(a0) * r2;
    const x1 = C + Math.cos(a1) * r2, y1 = C + Math.sin(a1) * r2;
    g.strokeStyle = rgba(col, 0.22); g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    // 四芒星节点
    const sx = C + Math.cos(a0) * r1, sy = C + Math.sin(a0) * r1;
    const sr = i % 3 === 0 ? 11 : 6.5;
    g.fillStyle = rgba(col, i % 3 === 0 ? 0.92 : 0.65);
    g.beginPath();
    g.moveTo(sx, sy - sr); g.lineTo(sx + sr * 0.28, sy - sr * 0.28);
    g.lineTo(sx + sr, sy); g.lineTo(sx + sr * 0.28, sy + sr * 0.28);
    g.lineTo(sx, sy + sr); g.lineTo(sx - sr * 0.28, sy + sr * 0.28);
    g.lineTo(sx - sr, sy); g.lineTo(sx - sr * 0.28, sy - sr * 0.28);
    g.closePath(); g.fill();
  }
  // 弦月弧饰
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + rnd() * 0.12;
    g.strokeStyle = rgba(col, 0.45); g.lineWidth = 2.0;
    g.beginPath(); g.arc(C, C, (r1 + r2) * 0.5, a - 0.12, a + 0.12); g.stroke();
  }
  return c;
}

/** 仙界金莲日轮环（真仙 / 玄仙 / 金仙 / 大罗） */
function immortalRing(col: [number, number, number], seed: number) {
  const c = mk(); const g = c.getContext('2d')!;
  const rnd = mulberry32(seed); const C = TEX / 2;
  const rOut = TR * 1.03, rIn = TR * 0.945;
  // 24瓣外沿仙莲光羽
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    const major = i % 2 === 0;
    const tipR = major ? rOut + 18 : rOut + 6;
    const w = major ? 0.08 : 0.055;
    g.strokeStyle = rgba(col, major ? 0.78 : 0.46);
    g.lineWidth = major ? 2.0 : 1.3;
    g.beginPath();
    g.moveTo(C + Math.cos(a - w) * rIn, C + Math.sin(a - w) * rIn);
    g.quadraticCurveTo(C + Math.cos(a) * (tipR + 6), C + Math.sin(a) * (tipR + 6), C + Math.cos(a + w) * rIn, C + Math.sin(a + w) * rIn);
    g.stroke();
    if (major) {
      g.fillStyle = rgba(col, 0.88);
      g.beginPath(); g.arc(C + Math.cos(a) * tipR, C + Math.sin(a) * tipR, 3.2 + rnd() * 1.2, 0, TAU); g.fill();
    }
  }
  // 仙环双辉
  g.strokeStyle = rgba(col, 0.65); g.lineWidth = 2.2;
  g.beginPath(); g.arc(C, C, rOut, 0, TAU); g.stroke();
  g.strokeStyle = rgba(col, 0.35); g.lineWidth = 1.2;
  g.beginPath(); g.arc(C, C, rIn, 0, TAU); g.stroke();
  return c;
}

interface Tex { ring: HTMLCanvasElement; ring2: HTMLCanvasElement; cloud?: HTMLCanvasElement; rune?: HTMLCanvasElement; rune2?: HTMLCanvasElement; yy?: HTMLCanvasElement; stars?: HTMLCanvasElement; lotus?: HTMLCanvasElement; celestial?: HTMLCanvasElement; immortal?: HTMLCanvasElement }

function shrink(src: HTMLCanvasElement, w: number): HTMLCanvasElement {
  const k = Math.min(1, w / Math.max(1, src.width));
  if (k >= 1) return src;
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(src.width * k)); c.height = Math.max(2, Math.round(src.height * k));
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = true; (g as any).imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

export class SenseFx {
  private cache = new Map<string, Tex>();
  private modTex = new Map<string, HTMLCanvasElement>();
  dispR = 0;
  dispInnerR = 0;
  alarm = 0;           // 被更强神识扫到（0–1，随时间衰减）
  burst = 0;           // 神识外放（0–1）
  hidden = 0;          // 敛息（0–1）
  private arcs: { a: number; t: number; seed: number }[] = [];
  private lastT = 0;
  private bugs: { a: number; r: number; s: number; ph: number }[] = [];

  private tex(tier: number): Tex {
    const key = 't' + tier;
    let t = this.cache.get(key);
    if (!t) {
      const S = TIERS[tier];
      t = { ring: inkRing(S.ink, 1000 + tier), ring2: brushArcs(S.ink.map((v) => v * 0.7) as [number, number, number], 2000 + tier, 4 + Math.min(8, tier), 12) };
      if (tier === 2) t.cloud = cloudRing(S.glow);
      if (S.runes) { t.rune = runeRing(S.glow, 3000 + tier); t.rune2 = runeRing(S.ink, 3100 + tier, TR * 0.72, 24); }
      if (S.yinyang) t.yy = yinyang(S.ink);
      if (S.stars) t.stars = starMap(4000 + tier);
      if (S.lotus) t.lotus = lotus(S.glow);
      if (S.celestial) t.celestial = celestialRing(S.glow, 5000 + tier);
      if (S.immortal) t.immortal = immortalRing(S.glow, 6000 + tier);
      this.cache.set(key, t);
    }
    return t;
  }
  /** 神识圈外围饰贴图；detailed=false 时生成低分辨率版本（圈外只是氛围，省显存与上传） */
  private mod(m: string, tier: number, detailed = true) {
    const key = detailed ? m : m + ':lo';
    let c = this.modTex.get(key);
    if (!c) {
      const S = TIERS[tier];
      if (m === 'dayan') c = baguaRing([200, 180, 110]);
      else if (m === 'wood') c = vineRing(77);
      else if (m === 'demon') c = inkRing([150, 30, 36], 88, 2.2);
      else if (m === 'ice') c = runeRing([180, 220, 255], 99, TR * 1.04, 48);
      else if (m === 'fire') c = inkRing([220, 90, 40], 66, 1.8);
      else if (m === 'sword') c = runeRing([200, 240, 230], 55, TR * 0.86, 18);
      else c = inkRing(S.ink, 11);
      if (!detailed) c = shrink(c, 320);
      this.modTex.set(key, c);
    }
    return c;
  }

  private motes = new Map<number, HTMLCanvasElement>();
  private moteTex(tier: number) {
    let c = this.motes.get(tier);
    if (!c) {
      c = mk(64, 64); const g = c.getContext('2d')!; const col = TIERS[tier].glow;
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, rgba(col, 1)); gr.addColorStop(0.25, rgba(col, 0.55)); gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64); this.motes.set(tier, c);
    }
    return c;
  }
  /** 预热：首帧前把当前境界纹理都生成好，避免卡顿 */
  warm(tier: number, mods: string[]) { void mods; this.tex(Math.min(tier, TIERS.length - 1)); }

  // ---------------------------------------------------------------- 圈内合成缓存
  // v0.52.8 性能：神识圈原来是每帧 20 多张 1024 大图逐个旋转、按整体透明度混合地画在屏幕中央，
  // 在软件光栅下这一步能吃掉近一百毫秒（整帧的大头）。
  // 现在把「转得快的」和「转得慢的」拆成两组，各自预合成到一张贴图上，
  // 每帧只做两次贴图（合成层的像素只跟圈的大小有关，跟屏幕大小无关），视觉几乎无差别。
  private pooled: { fast: HTMLCanvasElement; slow: HTMLCanvasElement; kind: number } | null = null;
  private simpleDone = false;
  private simpleTier = -1;
  private simpleImg: HTMLCanvasElement | null = null;

  /** 简单版神识圈（低画质 / 软件渲染）：所有饰纹烤成一张图，每帧一次缩放贴图 */
  buildSimple(tierIn: number): HTMLCanvasElement {
    const tier = Math.max(0, Math.min(TIERS.length - 1, tierIn));
    const S = TIERS[tier], T = this.tex(tier);
    const cv = document.createElement('canvas');
    const size = Math.round(TEX * 600 / TR);
    cv.width = size; cv.height = size;
    const g = cv.getContext('2d')!;
    const c = size / 2, s = size / TEX;
    const put = (img: HTMLCanvasElement, alpha: number, comp: GlobalCompositeOperation = 'source-over') => {
      if (!img || alpha <= 0.003) return;
      g.save(); g.globalAlpha = alpha; g.globalCompositeOperation = comp;
      g.drawImage(img, c - TEX / 2 * s, c - TEX / 2 * s, TEX * s, TEX * s); g.restore();
    };
    const ig = g.createRadialGradient(c, c, TR * s * 0.55, c, c, TR * s);
    ig.addColorStop(0, rgba(S.glow, 0)); ig.addColorStop(1, rgba(S.glow, 0.07));
    g.fillStyle = ig; g.beginPath(); g.arc(c, c, TR * s, 0, TAU); g.arc(c, c, TR * s * 0.55, 0, TAU, true); g.fill();
    if (T.stars) put(T.stars, 0.24);
    if (T.yy) put(T.yy, 0.08);
    if (T.lotus) put(T.lotus, 0.24, 'lighter');
    put(T.ring, 0.85); put(T.ring2, 0.9);
    if (T.cloud) put(T.cloud, 0.6);
    if (T.celestial) put(T.celestial, 0.55, 'lighter');
    if (T.immortal) put(T.immortal, 0.65, 'lighter');
    if (T.rune) put(T.rune, 0.55);
    if (T.rune2) put(T.rune2, 0.22);
    this.simpleImg = cv;
    this.simpleTier = tier;
    return cv;
  }

  /** 复杂版：返回预合成的两层（fast / slow），都是透明底、圆心居中 */
  buildPooled(tierIn: number, mods: string[]): { fast: HTMLCanvasElement; slow: HTMLCanvasElement } {
    const tier = Math.max(0, Math.min(TIERS.length - 1, tierIn));
    const S = TIERS[tier], T = this.tex(tier);
    const size = 512;
    const c = size / 2, s = size / TEX;
    const fresh = () => { const cv = document.createElement('canvas'); cv.width = size; cv.height = size; return cv; };
    const fast = fresh(), slow = fresh();
    const fg = fast.getContext('2d')!, sg = slow.getContext('2d')!;
    const put = (g: CanvasRenderingContext2D, img: HTMLCanvasElement | undefined, alpha: number, comp: GlobalCompositeOperation = 'source-over') => {
      if (!img || alpha <= 0.003) return;
      g.save(); g.globalAlpha = alpha; g.globalCompositeOperation = comp;
      g.drawImage(img, c - TEX / 2 * s, c - TEX / 2 * s, TEX * s, TEX * s); g.restore();
    };
    // 慢层：圈内淡光 + 高阶底纹 + 修饰环（基本不动或转得很慢）
    const ig = fg.createRadialGradient(c, c, TR * s * 0.55, c, c, TR * s);
    ig.addColorStop(0, rgba(S.glow, 0)); ig.addColorStop(1, rgba(S.glow, 0.07));
    fg.fillStyle = ig; fg.beginPath(); fg.arc(c, c, TR * s, 0, TAU); fg.arc(c, c, TR * s * 0.55, 0, TAU, true); fg.fill();
    put(fg, T.stars, 0.24);
    put(fg, T.yy, 0.08);
    put(fg, T.lotus, 0.24, 'lighter');
    put(fg, T.rune2, 0.22);
    if (T.celestial) put(fg, T.celestial, 0.52, 'lighter');
    for (const m of mods) {
      if (m === 'thunder' || m === 'insect') continue;
      const mc = this.mod(m, tier, false);
      if (m === 'dayan') put(fg, mc, 0.42);
      else if (m === 'wood') put(fg, mc, 0.75);
      else if (m === 'demon') { put(fg, mc, 0.6); }
      else put(fg, mc, 0.5);
    }
    // 快层：两层反向转的水墨圆环 + 云环 + 篆文 + 仙莲环
    put(sg, T.ring, 0.85); put(sg, T.ring2, 0.9);
    if (T.cloud) put(sg, T.cloud, 0.6);
    if (T.immortal) put(sg, T.immortal, 0.65, 'lighter');
    if (T.rune) put(sg, T.rune, 0.55);
    this.pooled = { fast, slow, kind: tier * 100 + mods.length };
    return { fast, slow };
  }

  /** 画预合成后的神识圈（世界坐标，g 已是世界变换）。
   *  贴图里圆环半径是 TR*(512/TEX) 像素，而世界里的 R 对应 TR，所以整幅宽度 = 2R * TEX/TR。 */
  drawPooled(g: G, x: number, y: number, t: number) {
    const P = this.pooled; if (!P) return;
    const R = this.dispR, hideA = 1 - this.hidden * 0.6;
    const breath = 1 + Math.sin(t * 0.9) * 0.004;
    const half = R * (TEX / TR) * breath;
    g.save();
    g.globalAlpha *= hideA;
    g.translate(x, y);
    g.save(); g.rotate(t * 0.06); g.drawImage(P.fast, -half, -half, half * 2, half * 2); g.restore();
    g.save(); g.rotate(-t * 0.1 + 1.3); g.drawImage(P.slow, -half, -half, half * 2, half * 2); g.restore();
    g.restore();
  }
  /** 极简版（软件渲染 / 极低画质）：不贴任何大图，只用几道描边画出圈与光晕。
   *  贴图版每帧要混合一整张 2R×(2R) 的图（屏幕越大越贵），描边版只碰环带那一条，
   *  在 CPU 光栅下便宜一个数量级，远看几乎一样。 */
  drawCheap(g: G, x: number, y: number, t: number, tierIn = 1) {
    const R = this.dispR;
    if (R < 24) return;
    const S = TIERS[Math.max(0, Math.min(TIERS.length - 1, tierIn))];
    const hideA = 1 - this.hidden * 0.6;
    const spin = t * 0.05;
    g.save();
    g.globalAlpha *= hideA;
    // 外侧薄光：用一条宽描边 + 径向渐变当笔锋，只覆盖环带
    const glow = g.createRadialGradient(x, y, R * 0.88, x, y, R * 1.05);
    glow.addColorStop(0, rgba(S.glow, 0));
    glow.addColorStop(0.55, rgba(S.glow, 0.085));
    glow.addColorStop(1, rgba(S.glow, 0));
    g.strokeStyle = glow; g.lineWidth = R * 0.2;
    g.beginPath(); g.arc(x, y, R * 0.96, 0, TAU); g.stroke();
    // 两道墨线（错开成双层圈，随呼吸微胀）
    const br = 1 + Math.sin(t * 0.9) * 0.004;
    g.strokeStyle = rgba(S.ink, 0.34); g.lineWidth = Math.max(1, R * 0.009);
    g.beginPath(); g.arc(x, y, R * br, 0, TAU); g.stroke();
    g.strokeStyle = rgba(S.ink, 0.2); g.lineWidth = Math.max(0.8, R * 0.006);
    g.beginPath(); g.arc(x, y, R * 0.925 * br, 0, TAU); g.stroke();
    // 四道短刻痕：暗示篆文/刻度，转得很慢
    g.strokeStyle = rgba(S.ink, 0.28); g.lineWidth = Math.max(1, R * 0.012);
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = spin + (i / 4) * TAU, r0 = R * 0.96, r1 = R * 1.03;
      g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      g.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
    }
    g.stroke();
    g.restore();
  }

  /** 简单版：整圈一张图，每帧一次贴图 */
  drawSimple(g: G, x: number, y: number, t: number) {
    const img = this.simpleImg; if (!img) return;
    const R = this.dispR, hideA = 1 - this.hidden * 0.6;
    const breath = 1 + Math.sin(t * 0.9) * 0.004;
    const half = R * (TEX / TR) * breath;
    g.save();
    g.globalAlpha *= hideA;
    g.translate(x, y); g.rotate(t * 0.02);
    g.drawImage(img, -half, -half, half * 2, half * 2);
    g.restore();
  }
  get hasPooled() { return !!this.pooled; }
  get hasSimple() { return this.simpleDone; }
  markSimple(tier: number) {
    const t = Math.max(0, Math.min(TIERS.length - 1, tier));
    if (!this.simpleDone || this.simpleTier !== t) { this.buildSimple(t); this.simpleDone = true; }
  }

  update(dt: number, R: number, innerR = R * 0.72) {
    if (this.dispR <= 0) this.dispR = R;
    if (this.dispInnerR <= 0) this.dispInnerR = innerR;
    this.dispR += (R - this.dispR) * Math.min(1, dt * (R > this.dispR ? 3.2 : 2));
    this.dispInnerR += (innerR - this.dispInnerR) * Math.min(1, dt * (innerR > this.dispInnerR ? 3.8 : 2.5));
    this.alarm = Math.max(0, this.alarm - dt * 0.6);
    this.burst = Math.max(0, this.burst - dt * 0.35);
  }

  /** 圈外记忆水墨（屏幕空间） */
  drawMemory(g: G, sx: number, sy: number, Rs: number, W: number, H: number, cheap: boolean) {
    // v0.52.8 性能：原来是两次「整屏矩形 + 径向渐变」，其中一次还是 saturation 混合——
    // 在 Canvas2D 软件光栅下单项就能吃掉一百多毫秒（比画面上所有人和景加起来还贵十倍）。
    // 现在只在「圆环罩住的那一圈」开临时图层：环内整块矩形铺渐变，环外一个像素都不碰。
    // 视觉效果完全一样（环外本来就应该是全透明），开销跟屏幕大小无关，只跟神识圈直径有关。
    const r0 = Rs * 0.965, r1 = Rs * 1.07;
    const x0 = Math.max(0, Math.floor(sx - r1 * 1.05)), y0 = Math.max(0, Math.floor(sy - r1 * 1.05));
    const x1 = Math.min(W, Math.ceil(sx + r1 * 1.05)), y1 = Math.min(H, Math.ceil(sy + r1 * 1.05));
    if (x1 - x0 < 2 || y1 - y0 < 2) return;
    const bw = x1 - x0, bh = y1 - y0;
    if (!this.memCv) this.memCv = document.createElement('canvas');
    const cv = this.memCv;
    if (cv.width < bw || cv.height < bh) { cv.width = Math.max(cv.width, bw); cv.height = Math.max(cv.height, bh); }
    const m = this.memCtx ?? (this.memCtx = cv.getContext('2d')!);
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.globalCompositeOperation = 'source-over';
    m.clearRect(0, 0, bw, bh);
    m.translate(-x0, -y0);
    const gw = m.createRadialGradient(sx, sy, r0, sx, sy, r1 * 1.05);
    gw.addColorStop(0, 'rgba(236,229,210,0)'); gw.addColorStop(1, cheap ? 'rgba(232,226,208,0.62)' : 'rgba(236,229,210,0.44)');
    m.fillStyle = gw; m.fillRect(x0, y0, bw, bh);
    m.setTransform(1, 0, 0, 1, 0, 0);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(cv, 0, 0, bw, bh, x0, y0, bw, bh);
    g.restore();
  }
  private memCv: HTMLCanvasElement | null = null;
  private memCtx: CanvasRenderingContext2D | null = null;

  /** 神识圈（世界坐标） */
  draw(g: G, x: number, y: number, tierIn: number, mods: string[], t: number, z: number) {
    const tier = Math.max(0, Math.min(TIERS.length - 1, tierIn));
    const S = TIERS[tier], T = this.tex(tier);
    const R = this.dispR;
    const k = (R / TR);
    const breath = 1 + Math.sin(t * 0.9) * 0.004;
    const hideA = 1 - this.hidden * 0.6;
    const dpr = DPR();
    const dt = this.lastT ? Math.min(0.1, Math.max(0, t - this.lastT)) : 1 / 60; this.lastT = t;
    g.save();
    const drawTex = (img: HTMLCanvasElement, rot: number, scale: number, alpha: number, comp: GlobalCompositeOperation = 'source-over') => {
      if (alpha <= 0.003) return;
      g.save();
      g.globalAlpha = alpha * hideA; g.globalCompositeOperation = comp;
      g.translate(x, y); g.rotate(rot);
      const s = k * scale * breath;
      g.imageSmoothingEnabled = true; (g as any).imageSmoothingQuality = 'high';
      g.drawImage(mip(img, TEX * s * z * dpr), -TEX / 2 * s, -TEX / 2 * s, TEX * s, TEX * s);
      g.restore();
    };
    // 1. 圈内淡光（极淡，不遮景）
    const ig = g.createRadialGradient(x, y, R * 0.55, x, y, R);
    ig.addColorStop(0, rgba(S.glow, 0)); ig.addColorStop(1, rgba(S.glow, 0.07 + this.burst * 0.1));
    g.fillStyle = ig; g.beginPath(); g.arc(x, y, R, 0, TAU); g.arc(x, y, R * 0.55, 0, TAU, true); g.fill();
    // 2. 仅保留外缘星图底纹，绝不在人物脚下/场内铺八卦莲台挡视野
    if (T.stars) drawTex(T.stars, t * 0.01, 1, 0.18);
    // 3. 涟漪：平滑扩散的光带
    for (let i = 0; i < Math.min(3, S.ripples); i++) { // 涟漪最多 3 圈：每圈都是一次全屏径向渐变
      const ph = ((t + i * S.period / S.ripples) % S.period) / S.period;
      const e = 1 - Math.pow(1 - ph, 2.2);
      const rr = R * e, a = Math.pow(1 - ph, 1.6) * Math.min(1, ph * 6) * 0.32;
      if (rr < 8 || a < 0.005) continue;
      const band = 26 / Math.max(0.35, z) + R * 0.04;
      const gr = g.createRadialGradient(x, y, Math.max(0, rr - band), x, y, rr + band * 0.4);
      gr.addColorStop(0, rgba(S.glow, 0)); gr.addColorStop(0.75, rgba(S.glow, a)); gr.addColorStop(1, rgba(S.glow, 0));
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr + band * 0.4, 0, TAU); g.arc(x, y, Math.max(0, rr - band), 0, TAU, true); g.fill();
    }
    // 4. 水墨圆环（两层反向缓转，形成流动感）
    drawTex(T.ring, t * 0.035, 1, 0.85);
    drawTex(T.ring2, -t * 0.09 + 1.3, 1.0, 0.9);
    if (T.cloud) drawTex(T.cloud, -t * 0.04, 1, 0.55 + 0.12 * Math.sin(t * 1.1));
    if (T.celestial) drawTex(T.celestial, t * 0.028, 1, 0.62 + 0.08 * Math.sin(t * 1.2), 'lighter');
    if (T.immortal) drawTex(T.immortal, -t * 0.032, 1, 0.68 + 0.1 * Math.sin(t * 1.5), 'lighter');
    // 5. 篆文
    if (T.rune) drawTex(T.rune, -t * 0.05, 1, 0.55 + 0.1 * Math.sin(t * 1.3), 'source-over');
    if (T.rune2) drawTex(T.rune2, t * 0.07, 1, 0.22);
    // 6. 修饰
    for (const m of mods) {
      if (m === 'thunder') continue;
      if (m === 'insect') continue;
      const c = this.mod(m, tier, false);
      if (m === 'dayan') drawTex(c, t * 0.04, 1, 0.42);
      else if (m === 'wood') drawTex(c, -t * 0.012, 1.0, 0.75);
      else if (m === 'demon') { drawTex(c, t * 0.05, 1.02, 0.6); drawTex(c, -t * 0.03, 0.97, 0.3); }
      else drawTex(c, t * 0.03, 1, 0.5);
    }
    // 7. 光点（沿圈游走）
    if (S.motes) {
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < S.motes; i++) {
        const sp = 0.08 + (i % 5) * 0.025;
        const a = t * sp * (i % 2 ? 1 : -1) + i * 2.399;
        const rr = R * (0.94 + 0.05 * Math.sin(t * 0.7 + i * 1.3));
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        const fl = 0.5 + 0.5 * Math.sin(t * 2.3 + i * 1.7);
        const s = (3 + fl * 3) / Math.max(0.4, z);
        g.globalAlpha = 0.7 * fl * hideA;
        g.drawImage(this.moteTex(tier), px - s * 2.5, py - s * 2.5, s * 5, s * 5);
      }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    // 8. 蚀金蛊：金芒在圈内游走
    if (mods.includes('insect')) {
      if (this.bugs.length === 0) for (let i = 0; i < 26; i++) this.bugs.push({ a: Math.random() * TAU, r: 0.3 + Math.random() * 0.65, s: 0.2 + Math.random() * 0.5, ph: Math.random() * 10 });
      g.fillStyle = 'rgba(255,214,90,0.85)';
      for (const b of this.bugs) {
        const a = b.a + t * b.s, rr = R * (b.r + 0.06 * Math.sin(t * 1.3 + b.ph));
        g.beginPath(); g.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.92, 2.2 / Math.max(0.5, z), 0, TAU); g.fill();
      }
    }
    // 9. 雷丝：沿圈闪烁的细电弧
    if (mods.includes('thunder')) {
      if (Math.random() < dt * 3.6) this.arcs.push({ a: Math.random() * TAU, t: 0, seed: Math.random() * 1e6 });
      g.lineCap = 'round';
      this.arcs = this.arcs.filter((ar) => {
        ar.t += dt;
        if (ar.t > 0.22) return false;
        const rnd = mulberry32(ar.seed | 0);
        const al = (1 - ar.t / 0.22);
        g.strokeStyle = `rgba(255,236,150,${0.9 * al})`; g.lineWidth = 2 / Math.max(0.4, z);
        g.beginPath();
        for (let i = 0; i <= 10; i++) {
          const a = ar.a + i * 0.025, rr = R + (rnd() - 0.5) * 26;
          const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
          if (i) g.lineTo(px, py); else g.moveTo(px, py);
        }
        g.stroke();
        return true;
      });
    }
    // 10. 被窥探警示
    if (this.alarm > 0.01) {
      const a = this.alarm * (0.5 + 0.5 * Math.sin(t * 12));
      g.strokeStyle = `rgba(200,40,30,${0.55 * a})`; g.lineWidth = 6 / Math.max(0.4, z);
      g.beginPath(); g.arc(x, y, R * (1 + 0.01 * Math.sin(t * 30)), 0, TAU); g.stroke();
    }
    g.restore();
  }

  /** WebGL 版神识圈：纹理带 mipmap，由 GPU 旋转缩放，绝对丝滑；圈外记忆水墨在后期着色器里完成 */
  drawGL(F: FxSys, S: GLStage, x: number, y: number, tierIn: number, mods: string[], t: number, z: number) {
    const tier = Math.max(0, Math.min(TIERS.length - 1, tierIn));
    const St = TIERS[tier], T = this.tex(tier);
    const B = F.B;
    const R = this.dispR, k = R / TR;
    const breath = 1 + Math.sin(t * 0.9) * 0.004;
    const hideA = 1 - this.hidden * 0.6;
    const dt = this.lastT ? Math.min(0.1, Math.max(0, t - this.lastT)) : 1 / 60; this.lastT = t;
    const glow: [number, number, number] = [St.glow[0] / 255, St.glow[1] / 255, St.glow[2] / 255];
    const tex = (img: HTMLCanvasElement, rot: number, scale: number, alpha: number, add = 0) => {
      if (alpha <= 0.003) return;
      B.tex(S.uploadStatic(img));
      B.texQuad(x, y, TEX * k * scale * breath, rot, alpha * hideA, add);
    };
    // 仅在最外缘保留极简底纹，绝不在角色周围/内圈中心铺莲台或八卦挡视线
    if (T.stars) tex(T.stars, t * 0.01, 1, 0.18);
    // 4. 水墨圆环（两层反向缓转）
    tex(T.ring, t * 0.035, 1, 0.85);
    tex(T.ring2, -t * 0.09 + 1.3, 1.0, 0.9);
    if (T.cloud) tex(T.cloud, -t * 0.04, 1, 0.55 + 0.12 * Math.sin(t * 1.1));
    if (T.celestial) tex(T.celestial, t * 0.028, 1, 0.62 + 0.08 * Math.sin(t * 1.2), 0.75);
    if (T.immortal) tex(T.immortal, -t * 0.032, 1, 0.68 + 0.1 * Math.sin(t * 1.5), 0.85);
    if (T.rune) tex(T.rune, -t * 0.05, 1, 0.55 + 0.1 * Math.sin(t * 1.3), 0.4);
    if (T.rune2) tex(T.rune2, t * 0.07, 1, 0.22);
    for (const m of mods) {
      if (m === 'thunder' || m === 'insect') continue;
      const c = this.mod(m, tier, false);
      if (m === 'dayan') tex(c, t * 0.04, 1, 0.42, 0.3);
      else if (m === 'wood') tex(c, -t * 0.012, 1.0, 0.75);
      else if (m === 'demon') { tex(c, t * 0.05, 1.02, 0.6); tex(c, -t * 0.03, 0.97, 0.3); }
      else tex(c, t * 0.03, 1, 0.5, 0.5);
    }
    B.tex(S.atlas);
    // 涟漪：柔光环平滑扩散
    for (let i = 0; i < St.ripples; i++) {
      const ph = ((t + i * St.period / St.ripples) % St.period) / St.period;
      const e = 1 - Math.pow(1 - ph, 2.2);
      const rr = R * e, a = Math.pow(1 - ph, 1.6) * Math.min(1, ph * 6) * 0.42;
      if (rr < 8 || a < 0.005) continue;
      const band = 30 / Math.max(0.35, z) + R * 0.035;
      F.circle(x, y, rr, band, glow, a * 0.45 * hideA, 1, 96);
      F.circle(x, y, rr, band * 0.14, [1, 1, 1], a * 0.18 * hideA, 1, 96);
    }
    if (this.burst > 0.01) { const u = 1 - this.burst; const rr = R * (0.3 + u * 0.75); F.circle(x, y, rr, 60 / Math.max(0.35, z), glow, this.burst * 0.7, 1, 96); F.circle(x, y, rr, 8 / Math.max(0.35, z), [1, 1, 1], this.burst * 0.6, 1, 96); }
    // 光点沿圈游走
    for (let i = 0; i < St.motes; i++) {
      const sp = 0.08 + (i % 5) * 0.025;
      const a = t * sp * (i % 2 ? 1 : -1) + i * 2.399;
      const rr = R * (0.94 + 0.05 * Math.sin(t * 0.7 + i * 1.3));
      const fl = 0.5 + 0.5 * Math.sin(t * 2.3 + i * 1.7);
      const s = (3 + fl * 3) / Math.max(0.4, z);
      B.quad(CELL.Glow, x + Math.cos(a) * rr, y + Math.sin(a) * rr, s * 5, s * 5, 0, glow[0], glow[1], glow[2], 0.8 * fl * hideA, 1);
      B.quad(CELL.Dot, x + Math.cos(a) * rr, y + Math.sin(a) * rr, s * 1.2, s * 1.2, 0, 1, 1, 1, 0.9 * fl * hideA, 1);
    }
    // 蚀金蛊：金芒游走（带拖影）
    if (mods.includes('insect')) {
      if (this.bugs.length === 0) for (let i = 0; i < 26; i++) this.bugs.push({ a: Math.random() * TAU, r: 0.3 + Math.random() * 0.65, s: 0.2 + Math.random() * 0.5, ph: Math.random() * 10 });
      const zz = 1 / Math.max(0.5, z);
      for (const b of this.bugs) {
        const a = b.a + t * b.s, rr = R * (b.r + 0.06 * Math.sin(t * 1.3 + b.ph));
        const bx = x + Math.cos(a) * rr, by = y + Math.sin(a) * rr * 0.92;
        B.quad(CELL.Streak, bx, by, 16 * zz, 4 * zz, a + Math.PI / 2, 1, 0.85, 0.35, 0.6, 1);
        B.quad(CELL.Dot, bx, by, 6 * zz, 6 * zz, 0, 1, 0.9, 0.45, 1, 1);
      }
    }
    // 雷丝：沿圈闪烁的金色电弧
    if (mods.includes('thunder')) {
      if (Math.random() < dt * 3.6) this.arcs.push({ a: Math.random() * TAU, t: 0, seed: Math.random() * 1e6 });
      this.arcs = this.arcs.filter((ar) => {
        ar.t += dt;
        if (ar.t > 0.22) return false;
        const al = 1 - ar.t / 0.22;
        const a0 = ar.a, a1 = ar.a + 0.25;
        F.bolt(x + Math.cos(a0) * R, y + Math.sin(a0) * R, x + Math.cos(a1) * R, y + Math.sin(a1) * R, ar.seed + Math.floor(ar.t * 40), 22, 2.2 / Math.max(0.4, z), [1, 0.88, 0.5], 0.95 * al, 8, false);
        return true;
      });
    }
  }

  /** 清晰内圈（WebGL）：极细极淡的虚线边界，仅作范围提示，绝不在场内堆叠亮斑或干扰战斗视野 */
  drawInnerGL(F: FxSys, S: GLStage, x: number, y: number, tierIn: number, _t: number, z: number) {
    const R = this.dispInnerR;
    // 若外圈与内圈距离不大，或处于凡人极近距离，不额外画冗余内圈线
    if (R < 20 || this.dispR <= R * 1.03) return;
    const St = TIERS[Math.max(0, Math.min(TIERS.length - 1, tierIn))];
    const B = F.B;
    B.tex(S.atlas);
    const zz = 1 / Math.max(0.25, z);
    const hideK = 1 - this.hidden * 0.55;
    const colR = Math.min(1, St.glow[0] / 255 * 0.35 + 0.52);
    const colG = Math.min(1, St.glow[1] / 255 * 0.35 + 0.40);
    const colB = Math.min(1, St.glow[2] / 255 * 0.35 + 0.24);
    const segs = 36;
    const arcLen = (TAU * R / segs) * 0.42;
    const thick = Math.max(1.4, 1.7 * zz);
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * TAU;
      const px = x + Math.cos(a) * R, py = y + Math.sin(a) * R;
      B.quad(CELL.Streak, px, py, arcLen, thick, a + Math.PI / 2, colR, colG, colB, 0.28 * hideK, 0);
    }
  }

  /** 清晰内圈（Canvas2D 回退）：极细极淡虚线边界 */
  drawInner(g: G, x: number, y: number, tierIn: number, _t: number, z: number) {
    const R = this.dispInnerR;
    if (R < 20 || this.dispR <= R * 1.03) return;
    const St = TIERS[Math.max(0, Math.min(TIERS.length - 1, tierIn))];
    const zz = 1 / Math.max(0.25, z);
    const hideK = 1 - this.hidden * 0.55;
    g.save();
    g.strokeStyle = `rgba(${Math.round(St.glow[0] * 0.4 + 125)},${Math.round(St.glow[1] * 0.4 + 100)},${Math.round(St.glow[2] * 0.35 + 64)},${0.32 * hideK})`;
    g.lineWidth = Math.max(1.1, 1.4 * zz);
    g.setLineDash([12 * zz, 14 * zz]);
    g.beginPath();
    g.arc(x, y, R, 0, TAU);
    g.stroke();
    g.setLineDash([]);
    g.restore();
  }
}

/** 根据境界与法宝/功法得出神识修饰 */
export function senseMods(hero: { gongfa?: string; equip?: Record<string, string | undefined>; treasures?: string[]; flags?: Record<string, any> }): SenseMod[] {
  const out = new Set<SenseMod>();
  const owned = new Set<string>([...(hero.treasures ?? []), ...Object.values(hero.equip ?? {}).filter(Boolean) as string[]]);
  if (hero.gongfa === 'dayan' || hero.flags?.dayan) out.add('dayan');
  if (owned.has('yanghunmu')) out.add('wood');
  if (owned.has('qingzhu') || owned.has('bixie')) out.add('thunder');
  if (owned.has('shijin')) out.add('insect');
  if (owned.has('xuanbing') || owned.has('qianlan')) out.add('ice');
  if (hero.gongfa === 'xuesha' || hero.gongfa === 'yinluo') out.add('demon');
  if (owned.has('zhenhuo')) out.add('fire');
  if (hero.gongfa === 'qingyuan') out.add('sword');
  return [...out];
}
