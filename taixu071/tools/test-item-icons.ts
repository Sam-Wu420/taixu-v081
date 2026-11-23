import assert from 'node:assert/strict';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import './env';
(globalThis as any).window = { innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { ITEMS } = await import('../src/data/items');
const { proceduralItemIcon, itemIconShape, registerModItemIcon } = await import('../src/gfx/itemProcedural');
const { itemIconURL } = await import('../src/ui/ItemIcon');
const seen = new Map<string, string>();
for (const d of Object.values(ITEMS)) {
  const u = proceduralItemIcon(d);
  assert.ok(u.startsWith('data:image/svg+xml;charset=utf-8,'));
  assert.equal(u, proceduralItemIcon(d));
  const svg = decodeURIComponent(u.slice(u.indexOf(',') + 1));
  assert.ok(svg.includes('<svg') && !svg.includes('<script') && !svg.includes('href='));
  if (!seen.has(itemIconShape(d))) seen.set(itemIconShape(d), svg);
  assert.ok(itemIconURL(d.id), `${d.id} missing icon`);
}
// 栅格化各实际原型，确保不是空图或无效 SVG。
for (const [shape, svg] of seen) {
  const img = await loadImage(Buffer.from(svg)); const canvas = createCanvas(64, 64), ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, 64, 64); const p = ctx.getImageData(0, 0, 64, 64).data;
  let ink = 0; for (let i = 3; i < p.length; i += 4) if (p[i] > 20) ink++;
  assert.ok(ink > 100, `${shape} empty image`);
}
const base: any = { id: 'test', type: 'misc', tier: 2, glyph: '?', visual: { shape: 'flower', color: '#123456' } };
assert.equal(itemIconShape(base), 'flower');
assert.ok(decodeURIComponent(proceduralItemIcon(base)).includes('#123456'));
const poison = { ...base, visual: { shape: 'not-real', color: '#123456" onload="alert(1)' } };
assert.equal(itemIconShape(poison), 'misc'); assert.ok(!decodeURIComponent(proceduralItemIcon(poison)).includes('onload'));
const before = proceduralItemIcon(base); base.visual.color = '#abcdef'; assert.notEqual(proceduralItemIcon(base), before);
registerModItemIcon('test', 'data:image/png;base64,AA=='); assert.equal(itemIconURL('test'), 'data:image/png;base64,AA==');
console.log(`item icons: ${Object.keys(ITEMS).length} definitions, ${seen.size} rendered prototypes, overrides, cache changes and mod icon precedence passed`);
