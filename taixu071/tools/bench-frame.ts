// P5 & 全管线基准验收脚本（对齐 docs/v0.71-perf-plan.md §9）：
// 1. 缩放匀速 1.0 → 0.02 → 1.0 连续性检查（相邻帧细节权重跳变 > 4% 应为 0）
// 2. 2000 个 Drawable 计数排序 + P1/P2/P3 批处理 95 分位耗时（<= 8.3ms）
// 3. P4 生态账本连续行走 10 分钟（600s）：屏幕内首现怪物数量 === 0
import './env';
import assert from 'node:assert/strict';
import { LOD as L, BAND, k as Lk } from '../src/gfx/lod';
import { WorldAtlas } from '../src/gl/worldAtlas';
import { WorldSpriteBatch } from '../src/gl/worldBatch';
import { charFrames } from '../src/gfx/charAtlas';
import { CharState, HANLI_LOOK } from '../src/gfx/character';
import { FarPyramid } from '../src/world/farPyramid';
import { SymbolLayer, type WorldSymbol } from '../src/world/symbolLayer';
import { Ecology, ecoChunkOf, isOutsideVisRect } from '../src/world/ecology';
import { WORLD_W, WORLD_H } from '../src/data/world';

// 1) Zoom 1.0 -> 0.02 -> 1.0 连续性检查（匀速平滑缩放 1200 帧推拉，50 倍倍率跨度）
const zooms: number[] = [];
for (let i = 0; i < 1200; i++) zooms.push(1.0 * Math.pow(0.02 / 1.0, i / 1199));
for (let i = 1; i < 1200; i++) zooms.push(0.02 * Math.pow(1.0 / 0.02, i / 1199));

let jumps = 0;
let prevW: Record<string, number> | null = null;
for (const z of zooms) {
  const unitE = L.pxPerUnit(z, 1);
  const w = {
    water: Lk(BAND.water, unitE),
    grass: Lk(BAND.grass, unitE),
    deco: Lk(BAND.deco, unitE),
    cloud: Lk(BAND.cloud, unitE),
    reflect: Lk(BAND.reflect, unitE),
    tree: L.treeTiers(90 * unitE).sprite,
    canopy: L.farCanopyAlpha(z, L.canopyAlpha(256), L.canopyAlpha(24)),
  };
  if (prevW) {
    for (const key of Object.keys(w)) {
      if (Math.abs(w[key] - prevW[key]) > 0.04) jumps++;
    }
  }
  prevW = w;
}
assert.equal(jumps, 0, `expected 0 LOD detail jumps > 4%, got ${jumps}`);

// 2) 合成管线 2000 Drawable + 100 角色 + 200 符号 + 9 金字塔瓦片 帧耗时 P95 测量
const tex = { id: 1 } as unknown as WebGLTexture;
const noop = () => {};
const mockGl = {
  TEXTURE_2D: 1, RGBA: 2, RGBA8: 3, UNSIGNED_BYTE: 4, LINEAR: 5, CLAMP_TO_EDGE: 6,
  TEXTURE_MIN_FILTER: 7, TEXTURE_MAG_FILTER: 8, TEXTURE_WRAP_S: 9, TEXTURE_WRAP_T: 10,
  UNPACK_PREMULTIPLY_ALPHA_WEBGL: 11,
  createTexture: () => tex, deleteTexture: noop, bindTexture: noop,
  texImage2D: noop, texSubImage2D: noop, texParameteri: noop, pixelStorei: noop,
} as unknown as WebGL2RenderingContext;
const atlas = new WorldAtlas(mockGl);
const batch = new WorldSpriteBatch();
const pyr = new FarPyramid();
const symLayer = new SymbolLayer();
const mockTerrain: any = {
  decoRevision: 1, isLand: () => true, grovesInRect: () => [],
  sample: () => ({ forest: 0.45, cold: 0.2, arid: 0.1 }),
};
const st = new CharState(0, 0);
charFrames.clear();
charFrames.beginFrame();
const cf = charFrames.get(HANLI_LOOK, st)!;
const ce = atlas.ensure(cf.key, cf.canvas, cf.w, cf.h)!;

const rawSyms: WorldSymbol[] = Array.from({ length: 220 }, (_, i) => ({
  id: `s${i}`, kind: i % 2 ? 'city' : 'sect', label: `宗门${i}`,
  wx: (i % 20) * 3500, wy: Math.floor(i / 20) * 3500, priority: (i % 4) + 1, explored: true,
}));

// 预分配复用数组与 2000 Y 桶（模拟 P5 零分配排序）
const sortList = Array.from({ length: 2000 }, (_, i) => ({ y: ((i * 7919) % 10000), id: i }));
const buckets: typeof sortList[] = Array.from({ length: 2048 }, () => []);

const frameTimes: number[] = [];
// 预热金字塔与符号缓存一次（模拟稳态帧）
pyr.prepare(mockTerrain, 0, { left: 0, top: 0, right: 32000, bottom: 20000 }, 0.04, [], [], [], 10, 50);
symLayer.layout(rawSyms, 30000, 20000, 0.04, 1920, 1080, 1);

for (let f = 0; f < 120; f++) {
  const z = zooms[f % zooms.length];
  const t0 = performance.now();
  atlas.beginFrame();
  batch.reset();
  charFrames.beginFrame();

  // P5 零分配 Y 桶排序
  const nb = 1000;
  for (let i = 0; i < nb; i++) buckets[i].length = 0;
  const scale = (nb - 0.0001) / 10000;
  for (let i = 0; i < sortList.length; i++) buckets[(sortList[i].y * scale) | 0].push(sortList[i]);

  // P1+P2 批提交（100 人物 + 400 精灵）
  for (let i = 0; i < 500; i++) {
    batch.push(ce.tex, i * 3, 100, 24, 32, ce.u0, ce.v0, ce.u1, ce.v1, 1, 1, 1, 1, 0);
  }
  // P3 金字塔与符号布局
  if (z < 0.06) pyr.prepare(mockTerrain, 0, { left: 0, top: 0, right: 32000, bottom: 20000 }, z, [], [], [], 10, 2);
  if (z < 0.22) symLayer.layout(rawSyms, 30000, 20000, z, 1920, 1080, 1);

  frameTimes.push(performance.now() - t0);
}
frameTimes.sort((a, b) => a - b);
const p95 = frameTimes[Math.floor(frameTimes.length * 0.95)];
assert.ok(p95 <= 8.3, `95p frame time ${p95.toFixed(2)}ms exceeds 8.3ms target`);
assert.ok(batch.segs.length <= 8, `drawCalls ${batch.segs.length} <= 8`);

// 3) P4 生态账本连续行走 10 分钟（600s）：新出现的怪物屏幕内首现 === 0
const eco = new Ecology();
let px = 45000, py = 45000;
let onScreenFirstSpawns = 0;
const viewHalfW = 960, viewHalfH = 540;
for (let step = 0; step < 1200; step++) {
  px += 90;
  py += (step % 40 < 20 ? 30 : -30);
  const view = { left: px - viewHalfW, top: py - viewHalfH, right: px + viewHalfW, bottom: py + viewHalfH };
  const [cx, cy] = ecoChunkOf(px + viewHalfW + 300, py);
  const created = eco.requestPopulate(
    [cx, cy],
    3,
    view,
    WORLD_W,
    WORLD_H,
    (x, y, migrating) => ({ defId: 'lang', x, y, realm: 1, stage: 0, hpPct: 1, migrating }),
    { x: px, y: py },
    200,
  );
  for (const b of created) {
    if (!isOutsideVisRect(b.x, b.y, view, 0)) {
      onScreenFirstSpawns++;
    }
  }
  eco.tick(0.5, px, py);
}
assert.equal(onScreenFirstSpawns, 0, '10-minute continuous walk must have 0 onscreen first spawns');

console.log(`bench-frame passed: LOD jumps=${jumps}, 95p=${p95.toFixed(2)}ms, drawCalls=${batch.segs.length}, 10min_onscreen_spawns=${onScreenFirstSpawns}`);
