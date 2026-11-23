import './env';
import { mulberry32 } from '../src/core/rng';
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { ACTIVE_MAP } = await import('../src/data/world');
const terrain = new Terrain(); terrain.build();
const surface = terrain.surface, interpolated = surface.heightAt, raw = surface['rawHeight'];
const rng = mulberry32(71), points = Array.from({ length: 4096 }, () => ({ x: 16750 + (rng() - .5) * 5000, y: 151250 + (rng() - .5) * 5000 }));
function heightBench(fn: (x: number, y: number) => number) {
  let sum = 0;
  for (let n = 0; n < 10000; n++) { const p = points[n % points.length]; sum += fn.call(surface, p.x, p.y); }
  const start = performance.now();
  for (let n = 0; n < 200000; n++) { const p = points[n % points.length]; sum += fn.call(surface, p.x, p.y); }
  return { ms: +(performance.now() - start).toFixed(2), sum: Math.round(sum) };
}
function npcBench(useRaw: boolean) {
  const oldRandom = Math.random; Math.random = mulberry32(123);
  surface.heightAt = useRaw ? raw : interpolated;
  try {
    const game = new Game(terrain); game.player.x = 17050; game.player.y = 151250;
    game.npcs.active.clear();
    const crowd = game.npcs.list.filter(n => (n.map ?? 'tiannan') === ACTIVE_MAP && n.realm === 0 && n.alive).slice(0, 40);
    const actors = crowd.map((n, i) => {
      const a = game.npcs.summon(n.id)!;
      n.faction = 'mortal'; n.hunting = false; n.stay = false; n.tx = 17350; n.ty = 151250 + i * 3;
      a.st.x = n.x = 16750; a.st.y = n.y = 151250 + i * 3; a.act = 'walk'; a.wait = 0;
      return a;
    });
    for (let i = 0; i < 30; i++) game.npcs.update(1 / 30);
    const times: number[] = [];
    for (let i = 0; i < 300; i++) { const start = performance.now(); game.npcs.update(1 / 30); times.push(performance.now() - start); }
    times.sort((a, b) => a - b);
    return { actors: actors.length, moved: actors.filter(a => Math.hypot(a.st.x - 16750, a.st.y - 151250) > 30).length,
      p50Ms: +times[150].toFixed(3), p95Ms: +times[285].toFixed(3), maxMs: +times[299].toFixed(3) };
  } finally { Math.random = oldRandom; surface.heightAt = interpolated; }
}
console.log(JSON.stringify({ raw200k: heightBench(raw), interpolated200k: heightBench(interpolated), npcRaw: npcBench(true), npcInterpolated: npcBench(false) }));
