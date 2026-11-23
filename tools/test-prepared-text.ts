import './env';
import assert from 'node:assert/strict';
import { createCanvas } from './env';
Object.assign(globalThis, { localStorage: { getItem: () => process.argv.includes('--disabled') ? '0' : null } });
const { drawTextCached, prepareCachedText, drawPreparedText, textCacheOn } = await import('../src/gfx/textCache');
let cases = 0;
for (const scale of [.45, .55, 1, 1.5, 2]) for (const size of [12, 16, 21.6])
  for (const color of ['#fff4e0', '#ffd040']) for (const align of ['center', 'left'] as const)
    for (const baseline of ['middle', 'alphabetic'] as const) for (const stroke of [null, 'rgba(30,20,14,0.8)']) {
  const a = createCanvas(480, 260), b = createCanvas(480, 260), ga = a.getContext('2d') as unknown as CanvasRenderingContext2D, gb = b.getContext('2d') as unknown as CanvasRenderingContext2D;
  const font = `bold ${size}px "Noto Serif SC","Songti SC",serif`, lw = stroke ? 3 : 0;
  for (const g of [ga, gb]) { g.setTransform(scale, 0, 0, scale, 100, 80); g.globalAlpha = .73; }
  drawTextCached(ga, '1638', 50, 60, font, color, stroke, lw, align, baseline);
  const matrix = gb.getTransform(), actualScale = Math.max(0.0625, Math.hypot(matrix.a, matrix.b));
  drawPreparedText(gb, '1638', 50, 60, prepareCachedText(font, color, stroke, lw, align, baseline, actualScale));
  assert.deepEqual(a.getContext('2d').getImageData(0, 0, a.width, a.height).data, b.getContext('2d').getImageData(0, 0, b.width, b.height).data);
  cases++;
}
console.log(`PASS 原绘制与预备样式像素完全一致：${cases} 组缩放/字号/颜色/对齐/基线/描边，缓存${textCacheOn ? '开' : '关'}`);
