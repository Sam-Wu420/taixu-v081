// P3 回归测试：远景金字塔缓存（256² × LRU 64、<=2ms预算、植被+河道/官道/山脊烘培）与符号层（优先级<=200、AABB防重叠）
import './env';
import assert from 'node:assert/strict';
import { FarPyramid, PYRAMID_LRU_MAX, PYRAMID_TILE_PX } from '../src/world/farPyramid';
import { SymbolLayer, SYMBOL_MAX, type WorldSymbol } from '../src/world/symbolLayer';

// 1) 金字塔分级与世界尺度映射
assert.equal(FarPyramid.levelFor(0.02), 5);
assert.equal(FarPyramid.levelFor(0.05), 4);
assert.equal(FarPyramid.levelFor(1.0), 0);
assert.equal(FarPyramid.worldSizeFor(5), PYRAMID_TILE_PX * 64);

// 2) 真实 Canvas 烘焙 + 植被/河流/山脉像素产出 + LRU 上限与预算
const mockTerrain: any = {
  decoRevision: 1,
  isLand: () => true,
  grovesInRect: () => [{ x: 4000, y: 4000, r: 2500, sp: 'broad' }],
  sample: () => ({ forest: 0.65, cold: 0.2, arid: 0.1 }),
};
const pyr = new FarPyramid();
const rivers = [{ pts: [[0, 400], [800, 400]] as [number, number][] }];
const roads = [{ pts: [[100, 0], [100, 800]] as [number, number][] }];
const ranges = [{ pts: [[0, 100], [800, 100]] as [number, number][] }];

const res1 = pyr.prepare(mockTerrain, 0, { left: 0, top: 0, right: 14000, bottom: 14000 }, 0.03, ranges, rivers, roads, 10, 50);
assert.equal(res1.complete, true);
assert.ok(res1.tiles.length >= 1 && res1.tiles.length <= 4);
assert.equal(res1.tiles[0].canvas.width, PYRAMID_TILE_PX);
const ctx0 = res1.tiles[0].canvas.getContext('2d')!;
const img = ctx0.getImageData(64, 64, 1, 1).data;
assert.ok(img[3] > 0, 'pyramid tile bakes visible forest/geography pixels');

// 第二次同视角应全缓存命中
const bakesBefore = pyr.bakes;
const res2 = pyr.prepare(mockTerrain, 0, { left: 0, top: 0, right: 14000, bottom: 14000 }, 0.03, ranges, rivers, roads, 10, 2);
assert.equal(res2.complete, true);
assert.equal(pyr.bakes, bakesBefore);
assert.ok(pyr.hits >= res1.tiles.length);

// 季节切换应自动失效重建
pyr.prepare(mockTerrain, 1, { left: 0, top: 0, right: 8000, bottom: 8000 }, 0.03, ranges, rivers, roads, 10, 50);
assert.ok(pyr.bakes > bakesBefore);

// 超出 64 块触发 LRU 淘汰
const big = new FarPyramid();
for (let i = 0; i < 80; i++) {
  big.prepare(mockTerrain, 0, { left: i * 16384, top: 0, right: i * 16384 + 1000, bottom: 1000 }, 0.03, [], [], [], 10, 50);
}
assert.ok(big.size <= PYRAMID_LRU_MAX, `LRU capped at ${PYRAMID_LRU_MAX}, got ${big.size}`);

// 单帧视口需求超过 LRU 容量时默认跳过烘焙，避免每帧空烘与 LRU 抖动；
// 启用 includeMacro=true 时自动切至持久化 L=7 全图根瓦片兜底（不占普通 LRU 名额）
const huge = new FarPyramid();
const hugeRes = huge.prepare(mockTerrain, 0, { left: 0, top: 0, right: 300000, bottom: 210000 }, 0.03, [], [], [], 10, 50);
assert.equal(hugeRes.complete, false);
assert.equal(hugeRes.tiles.length, 0);
assert.equal(huge.bakes, 0);

const hugeMacroRes = huge.prepare(mockTerrain, 0, { left: 0, top: 0, right: 300000, bottom: 210000 }, 0.015, ranges, rivers, roads, 10, 50, true);
assert.equal(hugeMacroRes.complete, true);
assert.ok(hugeMacroRes.tiles.length >= 1 && huge.macroSize >= 1);
assert.equal(huge.size, 0, 'macro root tiles must not pollute 64-tile LRU');

// 天南扩图（4800×2600 -> 1440000×780000）：L=5 默认跳过、includeMacro=true 可渐进兜底且不污染普通 LRU
const tnHuge = new FarPyramid();
const tnSkip = tnHuge.prepare(mockTerrain, 0, { left: 0, top: 0, right: 1440000, bottom: 780000 }, 0.03, [], [], [], 10, 50);
assert.equal(tnSkip.complete, false);
assert.equal(tnSkip.tiles.length, 0);
let tnMacro = tnHuge.prepare(mockTerrain, 0, { left: 0, top: 0, right: 1440000, bottom: 780000 }, 0.015, ranges, rivers, roads, 10, 500, true);
for (let step = 0; !tnMacro.complete && step < 10; step++) {
  tnMacro = tnHuge.prepare(mockTerrain, 0, { left: 0, top: 0, right: 1440000, bottom: 780000 }, 0.015, ranges, rivers, roads, 10, 500, true);
}
assert.equal(tnMacro.complete, true);
assert.equal(tnHuge.size, 0, 'Tiannan 4800×2600 macro root tiles must not pollute 64-tile LRU');

// 3) 远景符号层：高优先级优先保留、AABB 防重叠、上限 200
const syms = new SymbolLayer();
const raw: WorldSymbol[] = [];
// 同一点放两个重叠地点，优先级高的应胜出
raw.push({ id: 'low', kind: 'town', label: '低优村镇', wx: 50000, wy: 16000, priority: 4, explored: true });
raw.push({ id: 'high', kind: 'sect', label: '黄枫谷', wx: 50005, wy: 16005, priority: 1, explored: true });
// 再散布 400 个互不重叠符号，检验 SYMBOL_MAX=200 上限
for (let i = 0; i < 400; i++) {
  const gx = (i % 25) * 4000;
  const gy = Math.floor(i / 25) * 2000;
  raw.push({ id: `s${i}`, kind: i % 3 === 0 ? 'city' : 'vein', label: `灵地${i}`, wx: gx, wy: gy, priority: 3, explored: true });
}
const laid = syms.layout(raw, 50000, 16000, 0.04, 1920, 1080, 1);
assert.ok(laid.length <= SYMBOL_MAX, `symbol cap <= ${SYMBOL_MAX}, got ${laid.length}`);
const ids = new Set(laid.map(x => x.sym.id));
assert.equal(ids.has('high'), true, 'higher-priority sect kept');
assert.equal(ids.has('low'), false, 'overlapping lower-priority town culled');

// 确认所有输出的屏幕框两两不相交
for (let i = 0; i < laid.length; i++) {
  const a = laid[i];
  const ax0 = a.sx - a.plaque.w * 0.5, ay0 = a.sy - a.plaque.h * 0.5;
  const ax1 = ax0 + a.plaque.w, ay1 = ay0 + a.plaque.h;
  for (let j = i + 1; j < laid.length; j++) {
    const b = laid[j];
    const bx0 = b.sx - b.plaque.w * 0.5, by0 = b.sy - b.plaque.h * 0.5;
    const bx1 = bx0 + b.plaque.w, by1 = by0 + b.plaque.h;
    const overlap = ax0 < bx1 && ax1 > bx0 && ay0 < by1 && ay1 > by0;
    assert.equal(overlap, false, `symbols ${a.sym.id} and ${b.sym.id} must not overlap`);
  }
}

// 4) 远景防拥挤间距（padPx=14）应显著减少同屏稠密标签数，且 render.ts 远景仅保留主要地点名称，不铺野外点位/地标/妖王名牌
const spaced = syms.layout(raw, 50000, 16000, 0.04, 1920, 1080, 1, 28, 14);
assert.ok(spaced.length <= 28, `spaced cap <= 28, got ${spaced.length}`);
const { readFileSync } = await import('node:fs');
const renderSrc = readFileSync(new URL('../src/world/render.ts', import.meta.url), 'utf8');
assert.ok(renderSrc.includes("if (!l.major && l.type !== 'sect'"), 'far view skips non-major unexplored minor locations');
const farSlice = renderSrc.slice(renderSrc.indexOf('if (this.farSummary || z < 0.22)'), renderSrc.indexOf('prof.add(\'R·名牌\''));
assert.ok(!farSlice.includes('sites?.marks') && !farSlice.includes('landmarks?.marks'), 'far view omits field sites and landmarks');

console.log(`P3 far pyramid & symbol layer passed (LRU=${big.size}, symbols=${laid.length}/${SYMBOL_MAX}, spaced=${spaced.length}, 0 overlaps)`);
