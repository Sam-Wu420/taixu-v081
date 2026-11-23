// 量建地形（含全部地点布局）的耗时：npx tsx tools/bench-city-terrain.ts
import './env';
(globalThis as { __TAIXU_CITY?: string }).__TAIXU_CITY = process.env.TAIXU_CITY ?? '';
const { Terrain } = await import('../src/world/terrain');
const { LOCATIONS } = await import('../src/data/world');
const { getLayout } = await import('../src/gfx/building');
const runs: number[] = [];
for (let k = 0; k < 2; k++) {
  const t0 = performance.now();
  const t = new Terrain();
  for (const _ of t.buildSteps()) void _;
  runs.push(performance.now() - t0);
}
const cities = LOCATIONS.filter((l) => l.type === 'city');
const t1 = performance.now();
for (const l of cities) getLayout(l);
console.log('建地形（两次）', runs.map((v) => v.toFixed(0) + 'ms').join(' / '), '城', cities.length, '座，布局已缓存，取一遍', (performance.now() - t1).toFixed(1), 'ms');
