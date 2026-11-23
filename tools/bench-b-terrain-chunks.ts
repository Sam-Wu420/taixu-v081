import './env';
import { performance } from 'node:perf_hooks';
const { Terrain, CHUNK } = await import('../src/world/terrain');
const { LOC_BY_ID, WORLD_SCALE, ACTIVE_MAP } = await import('../src/data/world');
const terrain = new Terrain(); terrain.build();
const site = LOC_BY_ID.get(ACTIVE_MAP === 'tiannan' ? 'yuejing' : ACTIVE_MAP === 'dajin' ? 'taiyi' : 'tianxing')!;
const cx = Math.floor(site.x * WORLD_SCALE / CHUNK), cy = Math.floor(site.y * WORLD_SCALE / CHUNK);
const times: number[] = [];
for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 2; dx++) {
  const start = performance.now(); terrain.getChunk(cx + dx, cy + dy, true); times.push(performance.now() - start);
}
times.sort((a, b) => a - b);
console.log(JSON.stringify({ map: ACTIVE_MAP, n: times.length, medianMs: times[Math.floor(times.length / 2)], maxMs: times[times.length - 1], totalMs: times.reduce((a, b) => a + b, 0) }));
