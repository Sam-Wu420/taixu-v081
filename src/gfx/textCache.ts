// 文字位图缓存：名牌、伤害数字这类每帧重复的短文字，按「文字+字体+颜色+描边+屏幕像素比例」栅格化一次，之后只 drawImage。
// 浏览器实测赶路 / 人多时 measureText + strokeText 占主线程约一成；位图按当前变换的实际像素比例生成，画面与直接写字一致。
import { makeCanvas } from '../core/canvas';

type Entry = { cv: HTMLCanvasElement; w: number; h: number; ox: number; oy: number; adv: number; used: number; s: number };
const MAX = 700;
const cache = new Map<string, Entry>();
const widths = new Map<string, number>();
let mctx: CanvasRenderingContext2D | null = null;
let frame = 0;
/** 关掉即退回直接写字（对比画面 / 排查用）：localStorage 'taixu.textcache' = '0' */
export let textCacheOn = true;
try { textCacheOn = localStorage.getItem('taixu.textcache') !== '0'; } catch { /* */ }

/** 每帧调一次（render 开头），给 LRU 计时 */
export function textCacheTick() { frame++; }

/** 文字宽度（逻辑单位，等同 ctx.measureText(text).width），同字体同文字只量一次。调用前不必设 ctx.font */
export function measureCached(ctx: CanvasRenderingContext2D, text: string, font: string) {
  // 字宽与字号成正比：统一按 100px 量一次再按比例换算，镜头缩放（字号 = 常数 / zoom）时也命中
  const fm = /^(.*?)(\d+(?:\.\d+)?)px(.*)$/.exec(font);
  const size = fm ? parseFloat(fm[2]) : 100, base = fm ? `${fm[1]}100px${fm[3]}` : font;
  const k = base + '\u0001' + text;
  let w = widths.get(k);
  if (w === undefined) {
    if (widths.size > 4000) widths.clear();
    const f = ctx.font; ctx.font = base; w = ctx.measureText(text).width; ctx.font = f;
    widths.set(k, w);
  }
  return w * size / 100;
}

/** 同一字号、颜色和屏幕缩放的预备布局。 */
export interface PreparedText {
  font: string; fill: string; stroke: string | null; lineWidth: number;
  align: 'center' | 'left'; baseline: 'alphabetic' | 'middle'; scale: number;
  prefix: string | null; bitmapFont: string; px: number; lw: number;
}

/** 同一字号、颜色和屏幕缩放在一帧内复用布局参数。 */
export function prepareCachedText(font: string, fill: string, stroke: string | null, lineWidth: number,
  align: 'center' | 'left', baseline: 'alphabetic' | 'middle', scale: number): PreparedText {
  const fm = /^(.*?)(\d+(?:\.\d+)?)px(.*)$/.exec(font);
  if (!fm) return { font, fill, stroke, lineWidth, align, baseline, scale, prefix: null, bitmapFont: font, px: 0, lw: 0 };
  const px = Math.max(1, Math.round(parseFloat(fm[2]) * scale * 2) / 2), lw = Math.round(lineWidth * scale * 2) / 2;
  const prefix = `${fm[1]}${px}${fm[3]}\u0001${fill}\u0001${stroke ?? ''}\u0001${lw}\u0001${baseline}\u0001`;
  return { font, fill, stroke, lineWidth, align, baseline, scale, prefix, bitmapFont: `${fm[1]}${px}px${fm[3]}`, px, lw };
}

export function drawPreparedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, style: PreparedText) {
  if (!text) return;
  const { font, fill, stroke, lineWidth, align, baseline, scale, prefix, bitmapFont, px, lw } = style;
  if (!textCacheOn || prefix === null) {
    ctx.font = font; ctx.textAlign = align; ctx.textBaseline = baseline;
    if (stroke && lineWidth > 0) { ctx.lineWidth = lineWidth; ctx.strokeStyle = stroke; ctx.strokeText(text, x, y); }
    ctx.fillStyle = fill; ctx.fillText(text, x, y);
    return;
  }
  const key = prefix + text;
  let e = cache.get(key);
  if (!e) {
    if (!mctx) mctx = makeCanvas(1, 1).getContext('2d')!;
    mctx.font = bitmapFont; mctx.textBaseline = baseline;
    const tm = mctx.measureText(text);
    const pad = lw / 2 + 2;
    const asc = Math.max(tm.actualBoundingBoxAscent || 0, px * 0.9), desc = Math.max(tm.actualBoundingBoxDescent || 0, px * 0.3);
    const left = Math.max(tm.actualBoundingBoxLeft || 0, 0), right = Math.max(tm.actualBoundingBoxRight || 0, tm.width);
    const w = Math.ceil(left + right + pad * 2), h = Math.ceil(asc + desc + pad * 2);
    const cv = makeCanvas(w, h);
    const c = cv.getContext('2d')!;
    c.font = bitmapFont; c.textAlign = 'left'; c.textBaseline = baseline;
    const ox = pad + left, oy = pad + asc;
    if (stroke && lw > 0) { c.lineWidth = lw; c.strokeStyle = stroke; c.strokeText(text, ox, oy); }
    c.fillStyle = fill; c.fillText(text, ox, oy);
    e = { cv, w, h, ox, oy, adv: tm.width, used: frame, s: px };
    if (cache.size >= MAX) evict();
    cache.set(key, e);
  }
  e.used = frame;
  const k = 1 / scale;
  const x0 = align === 'center' ? x - e.adv * k / 2 : x;
  ctx.drawImage(e.cv, x0 - e.ox * k, y - e.oy * k, e.w * k, e.h * k);
}

/** 文字位图按屏幕字号缓存，保留当前透明度。 */
export function drawTextCached(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, fill: string,
  stroke: string | null = null, lineWidth = 0, align: 'center' | 'left' = 'center', baseline: 'alphabetic' | 'middle' = 'alphabetic') {
  if (!text) return;
  if (!textCacheOn) {
    ctx.font = font; ctx.textAlign = align; ctx.textBaseline = baseline;
    if (stroke && lineWidth > 0) { ctx.lineWidth = lineWidth; ctx.strokeStyle = stroke; ctx.strokeText(text, x, y); }
    ctx.fillStyle = fill; ctx.fillText(text, x, y);
    return;
  }
  const m = ctx.getTransform(), scale = Math.max(0.0625, Math.hypot(m.a, m.b));
  drawPreparedText(ctx, text, x, y, prepareCachedText(font, fill, stroke, lineWidth, align, baseline, scale));
}

function evict() {
  // 丢掉最久没用的一半（按帧号），避免逐个删除时反复抖动
  const arr = [...cache].sort((a, b) => a[1].used - b[1].used);
  for (let i = 0; i < arr.length / 2; i++) cache.delete(arr[i][0]);
}

export function textCacheStats() { return { n: cache.size, widths: widths.size, on: textCacheOn }; }
