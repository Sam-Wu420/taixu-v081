import './env';
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { mulberry32 } = await import('../src/core/rng');
const terrain = new Terrain(); terrain.build();
const game = new Game(terrain);
const prewarm = process.argv[2] === 'warm';
if (prewarm) game.living.ensureAll();
game.day = 61;
const start = performance.now();
if (process.argv[3] === 'sliced') {
  const job = game.npcs['dayJobs']; job.enqueue(1, 61, 11);
  const durations: number[] = [];
  while (job.pending) { const t = performance.now(); job.pump(2); durations.push(performance.now() - t); }
  durations.sort((a, b) => a - b);
  console.log(JSON.stringify({ prewarm, sliced: true, population: game.npcs.list.length, count: durations.length, durationMs: +(performance.now() - start).toFixed(2), p95Ms: +durations[Math.floor((durations.length - 1) * 0.95)].toFixed(2), maxMs: +durations[durations.length - 1].toFixed(2) }));
} else {
  game.npcs.daily(1, mulberry32(11));
  console.log(JSON.stringify({ prewarm, sliced: false, population: game.npcs.list.length, durationMs: +(performance.now() - start).toFixed(2) }));
}
