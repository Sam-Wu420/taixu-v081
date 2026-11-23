import assert from 'node:assert/strict';
import './env';
import { performance } from 'node:perf_hooks';
import { mulberry32 } from '../src/core/rng';
import type { NpcData, NpcWorld } from '../src/world/npc';

Object.assign(globalThis, {
  window: { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
});
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const terrainA = new Terrain(); terrainA.build();
const terrainB = new Terrain(); terrainB.build();
const nativeRandom = Math.random;
Math.random = mulberry32(71332); const original = new Game(terrainA);
Math.random = mulberry32(71332); const staggered = new Game(terrainB);
type Access = { coarse(dt: number): void; refreshActive(): void };
const originalAccess = original.npcs as unknown as Access;
const staggeredAccess = staggered.npcs as unknown as Access;
Math.random = mulberry32(177); originalAccess.refreshActive();
Math.random = mulberry32(177); staggeredAccess.refreshActive();
const list = staggered.npcs.list, batchCount = 30;
const chunks: NpcData[][] = Array.from({ length: batchCount }, (_, i) => list.slice(Math.floor(i * list.length / batchCount), Math.floor((i + 1) * list.length / batchCount)));
const elapsedOriginal: number[] = [], elapsedBatch: number[] = [], elapsedCycle: number[] = [];
const state = (world: NpcWorld) => world.list.map(({ id, x, y, tx, ty, goal, until, alive, chasing }) => ({ id, x, y, tx, ty, goal, until, alive, chasing }));
assert.deepEqual(state(original.npcs), state(staggered.npcs));
for (let cycle = 0; cycle < 100; cycle++) {
  for (const mode of cycle % 2 === 0 ? ['single', 'batch'] : ['batch', 'single']) {
    Math.random = mulberry32(10000 + cycle);
    if (mode === 'single') {
      const start = performance.now(); originalAccess.coarse(0.5); elapsedOriginal.push(performance.now() - start);
    } else {
      let total = 0;
      for (const chunk of chunks) {
        staggered.npcs.list = chunk;
        const start = performance.now(); staggeredAccess.coarse(0.5);
        const elapsed = performance.now() - start; elapsedBatch.push(elapsed); total += elapsed;
      }
      staggered.npcs.list = list; elapsedCycle.push(total);
    }
  }
  assert.deepEqual(state(original.npcs), state(staggered.npcs));
  assert.equal(original.day, staggered.day);
}
Math.random = nativeRandom;
const stats = (samples: number[]) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.floor(sorted.length * 0.95)], maxMs: sorted[sorted.length - 1] };
};
console.log(JSON.stringify({ population: list.length, active: original.npcs.active.size, cycles: 100, batchCount, single: stats(elapsedOriginal), batch: stats(elapsedBatch), cycle: stats(elapsedCycle), intermediateWorldUpdates: false, advancedGameDays: false, saveLoadBetweenBatches: false }, null, 2));
console.log('PASS 每轮完整周期后的真实 coarse 状态一致；批次间未插入其他系统');
