import './env';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { Session } from 'node:inspector';
import { mulberry32 } from '../src/core/rng';
import type { Enemy } from '../src/world/combat';
import type { SpatialIndex } from '../src/world/spatial';

const local = new Map<string, string>(), session = new Map<string, string>();
const storage = (map: Map<string, string>) => ({
  getItem: (key: string) => map.get(key) ?? null,
  setItem: (key: string, value: string) => { map.set(key, String(value)); },
  removeItem: (key: string) => { map.delete(key); },
});
const browserWindow = Object.assign(new EventTarget(), {
  innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, matchMedia: () => ({ matches: false }),
});
Object.assign(globalThis, { window: browserWindow, localStorage: storage(local), sessionStorage: storage(session),
  location: { href: 'http://127.0.0.1:5202/?hd2d=1', search: '?hd2d=1' }, __TAIXU_NORELOAD: true });
Math.random = mulberry32(20261113);

const { ModHost } = await import('../src/mod/host');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const host = new ModHost();
const bundle = JSON.parse(readFileSync('dist-mods/shahe-1.3.7.fmod', 'utf8'));
const status = await host.load(bundle);
assert.equal(status.state, 'loaded', status.error);
Object.assign(globalThis, { __modHost: host });

type SpawnOptions = { count: number; realm: number; stage: number; team: 'foe' | 'ally'; noP: boolean; stats: { hp: number; maxHp: number } };
interface Sandbox {
  S: { active: boolean; arena: boolean; god: boolean; hud: boolean; origin: { x: number; y: number }; objs: Map<string, { e: Enemy }> };
  enter(options: { who: string; realm: number; stage: number; place: string; fresh: boolean }): boolean;
  spawn(id: string, x: number, y: number, options: SpawnOptions, quiet: boolean): string[];
  toggle(): void;
}
const sandbox = (globalThis as typeof globalThis & { __shahe: Sandbox }).__shahe;
const terrain = new Terrain(); terrain.build();
const game = new Game(terrain);
game.hero.realm = 2; game.hero.stage = 1;
game.story['openT'] = -1;
game.closeModal(true); game.paused = false;
const canvas = Object.assign(new EventTarget(), { style: { cursor: '' }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }) });
game.canvas = canvas as unknown as HTMLCanvasElement;
host.attach(game); host.start();
assert(sandbox.enter({ who: 'test', realm: 2, stage: 1, place: 'arena', fresh: true }));
assert(sandbox.S.active && sandbox.S.arena);
sandbox.S.god = true;
if (sandbox.S.hud) sandbox.toggle();
game.cam.zoom = game.cam.targetZoom = 0.55;
game.camYaw = game.camYawTarget = Math.PI / 4;
const { x, y } = sandbox.S.origin;
const options: SpawnOptions = { count: 500, realm: 2, stage: 1, team: 'ally', noP: false, stats: { hp: 10000000, maxHp: 10000000 } };
const allies = sandbox.spawn('bandit', x - 330, y, options, true);
const foes = sandbox.spawn('bandit', x + 330, y, { ...options, team: 'foe' }, true);
assert.equal(allies.length, 500); assert.equal(foes.length, 500);
assert.equal(game.combat.allies.length, 500); assert.equal(game.combat.enemies.length, 500);

const label = process.argv[2] ?? 'baseline';
const warmFrames = Number(process.argv[3] ?? 30), frames = Number(process.argv[4] ?? 150);
const mode = process.argv[5] ?? 'indexed', trace = process.argv[6] === 'trace';
if (mode === 'scan') {
  const access = game.combat as unknown as { U: Enemy[]; unitGrid: SpatialIndex<Enemy>; updateProjs(dt: number): void };
  const updateProjs = access.updateProjs, nearby = access.unitGrid.nearby;
  access.updateProjs = function (dt) {
    access.unitGrid.nearby = () => access.U;
    updateProjs.call(this, dt);
    access.unitGrid.nearby = nearby;
  };
}
const stats = (times: number[]) => {
  const sorted = [...times].sort((a, b) => a - b);
  return { p50: sorted[Math.floor(sorted.length * .5)], p95: sorted[Math.floor(sorted.length * .95)],
    max: sorted[sorted.length - 1], mean: times.reduce((a, b) => a + b, 0) / times.length };
};
const cpu = new Session(); cpu.connect();
const post = (method: string, params: Record<string, number> = {}) => new Promise<Record<string, unknown>>((resolve, reject) => {
  cpu.post(method, params, (error: Error | null, result: unknown) => error ? reject(error) : resolve(result as Record<string, unknown>));
});
let hits = 0;
const hit = game.combat.npcHit;
game.combat.npcHit = function (...args: Parameters<typeof hit>) { hits++; return hit.apply(this, args); };
for (let i = 0; i < warmFrames; i++) game.update(1 / 60);
const before = { enemies: game.combat.enemies.length, allies: game.combat.allies.length };
hits = 0;
await post('Profiler.enable'); await post('Profiler.setSamplingInterval', { interval: 500 }); await post('Profiler.start');
const times: number[] = [];
const digest = createHash('sha256');
let casts = 0, hazards = 0, projectiles = 0, damage = 0;
for (let i = 0; i < frames; i++) {
  const start = performance.now(); game.update(1 / 60); times.push(performance.now() - start);
  for (const e of game.combat.units) { if (e.cast) casts++; if (e.hp < e.maxHp) damage++; }
  hazards += game.combat.foe.hz.length; projectiles += game.combat.projs.length;
  if (trace) {
    digest.update(JSON.stringify({
      units: game.combat.units.map(e => [e.id, e.x, e.y, e.hp, e.dead, e.gone, e.aggro, e.kx, e.ky,
        e.tgE?.id, e.tankRef instanceof Object ? e.tankRef.id : e.tankRef, e.skT, e.cast?.sk.id, e.cast?.t, e.st]),
      projectiles: game.combat.projs.map(p => [p.src?.id, p.tk instanceof Object ? p.tk.id : p.tk, p.x, p.y, p.vx, p.vy, p.life, [...p.hit]]),
      hazards: game.combat.foe.hz.map(h => [h.src?.id, h.k, h.x, h.y, h.t, h.fired, h.dmg]),
      hits,
    }));
  }
}
const result = await post('Profiler.stop'); cpu.disconnect();
const profile = result.profile as { nodes: { id: number; hitCount?: number; callFrame: { functionName: string; url: string; lineNumber: number } }[]; samples: number[] };
const byId = new Map(profile.nodes.map(node => [node.id, node]));
const counts = new Map<number, number>();
for (const id of profile.samples) counts.set(id, (counts.get(id) ?? 0) + 1);
const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([id, hits]) => {
  const frame = byId.get(id)!.callFrame;
  return { function: frame.functionName, url: frame.url.startsWith('data:') ? 'shahe bundled module' : frame.url, line: frame.lineNumber + 1, samples: hits };
});
const report = { label, mode, note: 'Node CPU only; real bundled sandbox spawn and Game.update, no renderer', seed: 20261113,
  warmFrames, frames, dt: 1 / 60, before, after: { enemies: game.combat.enemies.length, allies: game.combat.allies.length },
  activeCastsAcrossFrames: casts, hazardSamples: hazards, projectileSamples: projectiles, damageEvents: hits, damagedUnitSamples: damage,
  stateDigest: trace ? digest.digest('hex') : null,
  updateMs: stats(times), samples: profile.samples.length, top };
writeFileSync(`tools/out/arena1000-${label}.cpuprofile`, JSON.stringify(profile));
writeFileSync(`tools/out/arena1000-${label}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
