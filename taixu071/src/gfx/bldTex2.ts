// 第二十二步：建筑画材运行时 —— 按需解码（一城只解它用到的几十张）、多级缩略防闪、调色变体（魔道压暗 / 粉紫）、
// 久不入画即释放；铺装及地饰使用独立的程序生成缓存。
// Node 测试环境没有 Image：一切函数返回 null / false，调用方退回程序绘制。
import { BLD2, BldDim } from './bld2Dims';
import { PROP2 } from './propDims';
import { townGroundMips } from './townGround';
import { townPropMips } from './townProps';
import { scenicPropMips } from './scenicProps';
import { townHouseMips } from './townHouses';
import { townWallMips } from './townWalls';
import { townGateMips } from './townGates';
import { townShopMips } from './townShops';
import { remainingBuildingMips } from './remainingBuildings';
Object.assign(BLD2, PROP2);   // 第二十三步：摆件 / 遗迹 / 名地构件与建筑共用一套加载与绘制

type G = CanvasRenderingContext2D;
interface Ent { im: HTMLImageElement | null; mips: (HTMLCanvasElement | HTMLImageElement)[]; w: number; h: number; last: number; ok: boolean; bad?: boolean }
let SRC: Record<string, string> | null = null;
let loadPromise: Promise<void> | null = null;
const ents = new Map<string, Ent>();
let budgetT = -1, budget = 0;
let clock = 0;

export function loadBld2(): Promise<void> {
  if (loadPromise) return loadPromise;
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    loadPromise = Promise.resolve();
    return loadPromise;
  }
  loadPromise = Promise.all([import('./bld2Data'), import('./propData')])
    .then(([m, p]) => { SRC = { ...m.BLD2_SRC, ...p.PROP_SRC }; })
    .catch((e) => { console.warn('建筑画材不可用', e); });
  return loadPromise;
}
export const bld2Ready = () => !!SRC;
export function bldDim(key: string): BldDim | undefined { return BLD2[key.split('|')[0]]; }

/** 调色变体：dark 魔道（压暗去彩偏赭）· rose 粉紫（凝霜、妙音）· snow 北地（冷灰） */
const VAR: Record<string, number[]> = {
  dark: [0.50, 0.06, 0.02, 0.04, 0.46, 0.03, 0.03, 0.05, 0.44],
  rose: [1.02, 0.02, 0.04, 0.00, 0.95, 0.03, 0.03, 0.02, 1.02],
  snow: [0.92, 0.06, 0.06, 0.05, 0.94, 0.07, 0.06, 0.08, 1.00],
};

function canvas(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function prep(key: string, src: string, now: number, pattern = false): Ent | null {
  let e = ents.get(key);
  if (e) { e.last = now; return e.ok ? e : null; }
  const [base, v] = key.split('|');
  const im = new Image();
  e = { im, mips: [], w: 0, h: 0, last: now, ok: false };
  ents.set(key, e);
  const E = e;
  im.onload = () => { E.w = im.width; E.h = im.height; E.mips = [im]; (E as any).v = v; (E as any).pat = pattern; (E as any).base = base; (E as any).pending = true; };
  im.onerror = () => { E.bad = true; };
  im.src = src;
  return null;
}

/** 解码完成后的加工（调色、缩略）——每帧最多两张，避免进城瞬间卡顿 */
function finish(e: Ent, t: number): boolean {
  if (!(e as any).pending) return e.ok;
  void t;
  if (budget <= 0) return false;
  budget--;
  (e as any).pending = false;
  const im = e.im!;
  let c0: HTMLCanvasElement | HTMLImageElement = im;
  const v = (e as any).v as string | undefined;
  if (v && VAR[v]) {
    const c = canvas(e.w, e.h), g = c.getContext('2d')!;
    g.drawImage(im, 0, 0);
    const id = g.getImageData(0, 0, e.w, e.h), d = id.data, M = VAR[v];
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      d[i] = M[0] * r + M[1] * gg + M[2] * b; d[i + 1] = M[3] * r + M[4] * gg + M[5] * b; d[i + 2] = M[6] * r + M[7] * gg + M[8] * b;
    }
    g.putImageData(id, 0, 0);
    c0 = c;
  }
  const mips: (HTMLCanvasElement | HTMLImageElement)[] = [c0];
  let prev = c0;
  for (let l = 1; l < 4; l++) {
    const w = Math.max(1, Math.round(prev.width / 2)), h = Math.max(1, Math.round(prev.height / 2));
    if (w < 24 || h < 24) break;
    const c = canvas(w, h), g = c.getContext('2d')!;
    g.imageSmoothingEnabled = true; (g as any).imageSmoothingQuality = 'high';
    g.drawImage(prev, 0, 0, w, h); mips.push(c); prev = c;
  }
  e.mips = mips; e.ok = true;
  return true;
}

function getEnt(key: string, t: number): Ent | null {
  if (!SRC) return null;
  const base = key.split('|')[0];
  const s = SRC[base]; if (!s) return null;
  prep(key, s, clock);
  const e = ents.get(key)!;
  e.last = clock;
  if (e.bad || !e.im || !e.w) return null;
  return finish(e, t) ? e : null;
}

/** 预热：进入视野前先开始解码 */
export function warmBld(keys: Iterable<string>) {
  if (!SRC) return;
  for (const k of keys) { const s = SRC[k.split('|')[0]]; if (s) prep(k, s, clock); }
}

/** 每帧调用：推进时钟，释放 60 秒未用的画材 */
let gcT = 0;
export function tickBld2(dt: number) {
  clock += dt;
  budget = 2; budgetT = clock;   // 每帧加工预算（按帧而非游戏时间：暂停时也能继续加工）
  gcT -= dt;
  if (gcT > 0) return;
  gcT = 5;
  for (const [k, e] of ents) if (clock - e.last > 60) { if (e.im) e.im.src = ''; ents.delete(k); }
}

function pickProceduralMip(mips: HTMLCanvasElement[], width: number, g: G) {
  let scale = 1; try { const m = g.getTransform(); scale = Math.hypot(m.a, m.b) || 1; } catch { /* */ }
  let i = 0; while (i < mips.length - 1 && mips[i + 1].width >= width * scale * 1.05) i++;
  return mips[i];
}

function pickMip(e: Ent, wWorld: number, g: G) {
  let k = 1;
  try { const m = g.getTransform(); k = Math.hypot(m.a, m.b) || 1; } catch { /* */ }
  const px = wWorld * k;   // 屏幕上的像素宽
  let i = 0;
  while (i < e.mips.length - 1 && e.mips[i + 1].width >= px * 1.05) i++;
  return e.mips[i];
}

/**
 * 画一座建筑：锚点 (x, y) 为台基前沿中心（地面线）。
 * s 缩放，flip 水平翻转，alpha 透明（主角走到屋后时的透视）。
 */
export function drawBld(g: G, key: string, x: number, y: number, t: number, s = 1, flip = false, alpha = 1): boolean {
  const D = bldDim(key); if (!D) return false;
  const w = D.w * s, h = D.h * s, b = (D.b ?? 0) * s;
  const procedural = townPropMips(key) ?? scenicPropMips(key) ?? townHouseMips(key) ?? townWallMips(key) ?? townGateMips(key) ?? townShopMips(key) ?? remainingBuildingMips(key);
  let im: HTMLCanvasElement | HTMLImageElement;
  if (procedural) {
    im = pickProceduralMip(procedural, w, g);
  } else { const e = getEnt(key, t); if (!e) return false; im = pickMip(e, w, g); }
  if (alpha < 1) { g.save(); g.globalAlpha *= alpha; }
  if (flip) { g.save(); g.translate(x, 0); g.scale(-1, 1); g.drawImage(im, -w / 2, y + b - h, w, h); g.restore(); }
  else g.drawImage(im, x - w / 2, y + b - h, w, h);
  if (alpha < 1) g.restore();
  return true;
}

/** 平铺墙段：从 x0 到 x1，画材按高 hh 缩放，逐块交替镜像以消接缝 */
export function drawWallRun(g: G, key: string, x0: number, x1: number, y: number, hh: number, t: number, alpha = 1): boolean {
  const D = bldDim(key); if (!D || ![x0, x1, y, hh].every(Number.isFinite) || hh <= 0 || x1 <= x0) return false;
  const s = hh / D.h, tw = D.w * s, b = (D.b ?? 0) * s;
  if (!Number.isFinite(tw) || tw <= 0 || !Number.isFinite(b) || !Number.isFinite(y + b - hh)) return false;
  const n = Math.max(1, Math.round((x1 - x0) / tw)), w = (x1 - x0) / n;
  // 损坏布局或极端坐标不能让渲染帧陷入无界平铺。
  if (!Number.isSafeInteger(n) || n > 8192 || !Number.isFinite(w) || w <= 0 || x0 + w === x0) return false;
  const procedural = townWallMips(key) ?? remainingBuildingMips(key);
  let im: HTMLCanvasElement | HTMLImageElement;
  if (procedural) im = pickProceduralMip(procedural, tw, g);
  else { const e = getEnt(key, t); if (!e) return false; im = pickMip(e, tw, g); }
  if (alpha < 1) { g.save(); g.globalAlpha *= alpha; }
  for (let i = 0; i < n; i++) {
    const xa = x0 + i * w;
    if (i & 1) { g.save(); g.translate(xa + w, 0); g.scale(-1, 1); g.drawImage(im, 0, y + b - hh, w + 0.6, hh); g.restore(); }
    else g.drawImage(im, xa, y + b - hh, w + 0.6, hh);
  }
  if (alpha < 1) g.restore();
  return true;
}

// ---------------------------------------------------------------- 程序铺装
function groundMip(key: string, width: number, g: G): HTMLCanvasElement | null {
  const mips = townGroundMips(key); if (!mips) return null;
  let scale = 1; try { const m = g.getTransform(); scale = Math.hypot(m.a, m.b) || 1; } catch { /* */ }
  const px = width * scale; let i = 0;
  while (i < mips.length - 1 && mips[i + 1].width >= px * 1.05) i++;
  return mips[i];
}
/** 以世界尺寸平铺的程序图样。 */
export function pavePattern(g: G, key: string, tile: number, _t: number): CanvasPattern | null {
  if (!Number.isFinite(tile) || tile <= 0) return null;
  const im = groundMip(key, tile, g); if (!im) return null;
  const p = g.createPattern(im, 'repeat'); if (!p) return null;
  try { p.setTransform(new DOMMatrix().scale(tile / im.width)); } catch { /* */ }
  return p;
}
/** 使用缓存贴片逐格 blit，继续保留裁剪及世界坐标相位。 */
export function fillPatternTiled(g: G, key: string, tile: number, _t: number, x: number, y: number, w: number, h: number): boolean {
  if (![tile,x,y,w,h].every(Number.isFinite) || tile <= 0 || w <= 0 || h <= 0) return false;
  const im = groundMip(key, tile, g); if (!im) return false;
  const cw = tile, ch = tile * im.height / im.width;
  const x0 = Math.floor(x / cw) * cw, y0 = Math.floor(y / ch) * ch, x1 = x + w, y1 = y + h;
  if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1) || x0 + cw === x0 || y0 + ch === y0 || Math.ceil(w / cw + 1) * Math.ceil(h / ch + 1) > 100000) return false;
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  for (let gy = y0; gy < y1; gy += ch) for (let gx = x0; gx < x1; gx += cw) g.drawImage(im, gx, gy, cw + 0.6, ch + 0.6);
  g.restore(); return true;
}
/** 圆形 / 单幅程序地饰（太极广场、传送阵、灵田等）。 */
export function drawDecal(g: G, key: string, x: number, y: number, w: number, h: number, _t: number, alpha = 1): boolean {
  if (![x,y,w,h,alpha].every(Number.isFinite) || w <= 0 || h <= 0 || alpha < 0) return false;
  const im = groundMip(key, w, g); if (!im) return false;
  g.save(); g.globalAlpha *= Math.min(1, alpha); g.drawImage(im, x - w / 2, y - h / 2, w, h); g.restore(); return true;
}
export function bldStats() { let n = 0, px = 0; for (const e of ents.values()) if (e.ok) { n++; for (const m of e.mips) px += m.width * m.height; } return { n, mpx: px / 1e6 }; }
/** 调试：各画材状态 */
export function bldDebug() { const o: Record<string, string> = {}; for (const [k, e] of ents) o[k] = e.bad ? 'bad' : e.ok ? 'ok' : (e as any).pending ? 'pending' : e.w ? 'loaded' : 'loading'; return o; }
if (typeof window !== 'undefined') (window as any).__bldDebug = bldDebug;
