// v0.73 极远景「整片林子」色块层：npx tsx tools/test-canopy.ts
import './env';
import assert from 'node:assert/strict';
import { Terrain } from '../src/world/terrain';
import { WORLD_W, WORLD_H } from '../src/data/world';
import { CanopyLayer } from '../src/world/canopy';
import { coverColor } from '../src/gfx/tree';

const T = new Terrain();
T.build();

const view = (cx: number, cy: number, span: number) => {
  const half = span / 2;
  return { left: cx - half, top: cy - half * 0.62, right: cx + half, bottom: cy + half * 0.62 };
};

// 找一个确有林子的地方（forest 场高点 + 是陆地），找不到就直接失败：说明地形数据变了
let spot: [number, number] | null = null;
for (let i = 0; i < 8000 && !spot; i++) {
  const x = ((i * 7919) % 4099) / 4099 * WORLD_W, y = ((i * 104729) % 2053) / 2053 * WORLD_H;
  const s = T.sample(x, y);
  if (s.land > 0.62 && s.forest > 0.72 && s.elev < 0.45) spot = [x, y];
}
assert.ok(spot, '地形里应当存在成片的林地');
const [cx, cy] = spot!;

// —— 一、烘焙：远景一次烘好，之后每帧只贴一次
const layer = new CanopyLayer();
const v1 = view(cx, cy, 24000);
layer.ensure(T, 0, v1, 0.03);
assert.equal(layer.bakes, 1, '首次 ensure 触发一次烘焙');
assert.ok(!layer.ready, '烘焙是分帧的，不要在一帧里卡死');
let guard = 0;
while (layer.step(1e9) && guard++ < 1000) { /* 一次性烘完，模拟掉帧时的兜底 */ }
assert.ok(layer.ready, '给足时间后应当烘完');

const c: any = (layer as any).cv;
const g = c.getContext('2d');
const px = g.getImageData(0, 0, c.width, c.height).data;
let painted = 0;
const colors = new Set<string>();
for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 8) { painted++; if (px[i + 3] >= 64) colors.add(`${px[i]},${px[i + 1]},${px[i + 2]}`); }
const ratio = painted / (c.width * c.height);
assert.ok(ratio > 0.05, `林地里应当有成片色块（覆盖 ${(ratio * 100).toFixed(1)}%）`);
assert.ok(colors.size >= 2, `林色应当有层次（${colors.size} 种颜色），不是一块死板的单色`);
// 画布按 alpha 预乘存储，读回会有 ±1 的取整误差，所以按容差比对
const palette = ['pine', 'broad', 'willow', 'bamboo', 'snowpine', 'cypress', 'peach', 'maple', 'plum', 'apricot', 'ymaple']
  .map((sp: any) => coverColor(sp, 0)).map((h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
const near = (col: string) => {
  const v = col.split(',').map(Number);
  return palette.some((p) => p.every((n, i) => Math.abs(n - v[i]) <= 2));
};
for (const col of colors) assert.ok(near(col), `${col} 应当来自真树的配色（coverColor），否则放大时会跳色`);

// —— 二、缩放：只换重采样，不在某个缩放值上重烘
assert.equal(CanopyLayer.scaleFor(0.02), CanopyLayer.scaleFor(0.0204), '缩放小幅变化沿用同一张位图');
assert.ok(CanopyLayer.scaleFor(0.01) > CanopyLayer.scaleFor(0.08), '缩得越远，一个纹素盖住的世界越大');
// 极远时重烘阈值随视野面积 / 像素预算计算；小幅连续缩放不能逐帧重建大画布。
const zoomLayer = new CanopyLayer();
const spanAt = (z: number) => 2470 / z;
zoomLayer.ensure(T, 0, view(cx, cy, spanAt(0.02)), 0.02);
const zoomBakes = zoomLayer.bakes;
for (let i = 1; i <= 20; i++) {
  const z = 0.02 + i * 0.00001;
  zoomLayer.ensure(T, 0, view(cx, cy, spanAt(z)), z);
}
assert.ok(zoomLayer.bakes <= zoomBakes + 1, '极远连续缩放小步进至多跨一次量化档，不会逐帧重烘');
let sPrev = Infinity;
for (let z = 0.005; z <= 0.4; z *= 1.05) { const s = CanopyLayer.scaleFor(z); assert.ok(s <= sPrev, '纹素尺度随放大单调不变大'); sPrev = s; }

// —— 三、重烘时机：小幅移动不重烘，大幅移动才重烘（否则每帧都在烘，反而更卡）
const before = layer.bakes;
layer.ensure(T, 0, view(cx + 200, cy, 24000), 0.03);
assert.equal(layer.bakes, before, '镜头小幅移动只挪贴图，不重烘');
layer.ensure(T, 0, view(cx + 12000, cy, 24000), 0.03);
assert.equal(layer.bakes, before + 1, '镜头大幅移动才重烘');
assert.equal(layer.ready, false, '新图在后台分帧重烘');
const heldCtx = document.createElement('canvas').getContext('2d')!;
assert.equal(layer.draw(heldCtx, 0.5), true, '重烘期间继续显示上一张完整林色图，不闪空');
guard = 0;
while (layer.step(1e9) && guard++ < 1000) { /* bake */ }
assert.equal(layer.ready, true, '新林色图完成后再切换');
layer.ensure(T, 0, view(cx + 12000, cy, 24000), 1); // 换季
assert.equal(layer.bakes, before + 2, '换季要重烘（林色随季节变）');

// —— 四、海面不铺林色
let sea: [number, number] | null = null;
for (let i = 0; i < 4000 && !sea; i++) {
  const x = ((i * 6151) % 997) / 997 * WORLD_W, y = ((i * 4093) % 991) / 991 * WORLD_H;
  if (T.sample(x, y).land < 0.35) sea = [x, y];
}
assert.ok(sea, '应当能找到海面');
const seaLayer = new CanopyLayer();
seaLayer.ensure(T, 0, view(sea![0], sea![1], 20000), 0.03);
guard = 0;
while (seaLayer.step(1e9) && guard++ < 1000) { /* bake */ }
const sc: any = (seaLayer as any).cv;
const spx = sc.getContext('2d').getImageData(0, 0, sc.width, sc.height).data;
let seaPainted = 0;
for (let i = 3; i < spx.length; i += 4) if (spx[i] > 8) seaPainted++;
assert.ok(seaPainted / (sc.width * sc.height) < 0.05, '海面上不该铺林色（水由地形自己画）');

// —— 五、贴图接口：首张没烘完不贴；替换烘焙期间保留上一张完整图；权重为 0 零开销
const redo = new CanopyLayer();
redo.ensure(T, 0, v1, 0.03);
assert.equal(redo.draw(c.getContext('2d'), 0.5), false, '没烘完时不贴图（半成品会是一条条条纹）');
guard = 0;
while (redo.step(1e9) && guard++ < 1000) { /* bake */ }
const ctx = c.getContext('2d');
assert.equal(redo.draw(ctx, 0), false, '权重为 0 时不贴图');
assert.equal(redo.draw(ctx, 0.5), true, '烘好且有权重时贴图');

console.log(`canopy: 远景整片林色 ${layer.w}×${layer.h} 纹素、覆盖 ${(ratio * 100).toFixed(1)}%、${colors.size} 色，重烘策略与配色同源均通过`);
