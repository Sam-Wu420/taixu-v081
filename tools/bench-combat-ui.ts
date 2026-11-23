import './env';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { OrthographicCamera, Raycaster, Vector2, Vector3 } from 'three';
import { createCanvas } from './env';
import { mulberry32 } from '../src/core/rng';
import type { Enemy } from '../src/world/combat';

const local = new Map<string, string>();
const storage = { getItem: (k: string) => local.get(k) ?? null, setItem: (k: string, v: string) => local.set(k, v), removeItem: (k: string) => local.delete(k) };
Object.assign(globalThis, { window: Object.assign(new EventTarget(), { innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1, matchMedia: () => ({ matches: false }) }),
  localStorage: storage, sessionStorage: storage, location: { href: 'http://127.0.0.1:5202/?hd2d=1', search: '?hd2d=1' }, __TAIXU_NORELOAD: true });
Math.random = mulberry32(20261113);
const { ModHost } = await import('../src/mod/host');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { HdScene } = await import('../src/hd2d/scene');
const { hdUi } = await import('../src/hd2d/ui');
const { drawCombatUI } = await import('../src/world/combatfx');
const host = new ModHost(), status = await host.load(JSON.parse(readFileSync('dist-mods/shahe-1.3.7.fmod', 'utf8'))); assert.equal(status.state, 'loaded', status.error);
Object.assign(globalThis, { __modHost: host });
type SpawnOptions = { count: number; realm: number; stage: number; team: 'ally' | 'foe'; noP: boolean; stats: { hp: number; maxHp: number } };
const sandbox = (globalThis as typeof globalThis & { __shahe: { S: { origin: { x: number; y: number }; arena: boolean; god: boolean }; enter(o: { who: string; realm: number; stage: number; place: string; fresh: boolean }): boolean; spawn(id: string, x: number, y: number, options: SpawnOptions, quiet: boolean): string[] } }).__shahe;
const terrain = new Terrain(); terrain.build(); const game = new Game(terrain);
game.hero.realm = 2; game.hero.stage = 1; game.story['openT'] = -1; game.closeModal(true); game.paused = false;
game.canvas = Object.assign(new EventTarget(), { style: { cursor: '' }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080 }) }) as unknown as HTMLCanvasElement;
host.attach(game); host.start(); assert(sandbox.enter({ who: 'test', realm: 2, stage: 1, place: 'arena', fresh: true })); assert(sandbox.S.arena); sandbox.S.god = true;
const { x, y } = sandbox.S.origin, opts: SpawnOptions = { count: 500, realm: 2, stage: 1, team: 'ally', noP: false, stats: { hp: 10000000, maxHp: 10000000 } };
assert.equal(sandbox.spawn('bandit', x - 330, y, opts, true).length, 500); assert.equal(sandbox.spawn('bandit', x + 330, y, { ...opts, team: 'foe' }, true).length, 500);
let hits = 0; const hit = game.combat.npcHit; game.combat.npcHit = function (...args: Parameters<typeof hit>) { hits++; return hit.apply(this, args); };
for (let i = 0; i < 180; i++) game.update(1 / 60);
// 飘字有上限（256 条），同目标的数字会合并
assert(hits > 1000); assert(game.combat.texts.length > 100 && game.combat.texts.length <= 320, String(game.combat.texts.length));
const W = 1920, H = 1080, z = .55, yaw = Math.PI / 4, up = { x: Math.sin(yaw), y: -Math.cos(yaw) }, h = terrain.surfaceHeight(x, y), dist = 20000 / Math.SQRT2;
const camera = new OrthographicCamera(-W / 2 / z, W / 2 / z, H / 2 / z, -H / 2 / z, 1, 40000);
camera.position.set(x - up.x * dist, h + dist, y - up.y * dist); camera.up.set(0, 1, 0); camera.lookAt(x, h, y); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
const hd = Object.create(HdScene.prototype) as InstanceType<typeof HdScene>;
Object.assign(hd, { W, H, zoom: z, yaw, pitch: 45, tx: x, ty: y, cam: camera, ray: new Raycaster(), ndc: new Vector2(), hit: new Vector3(), projected: new Vector3(), heightAt: (a: number, b: number) => terrain.surfaceHeight(a, b) });
(hd as unknown as { computeAff(): void }).computeAff();
const canvas = createCanvas(W, H), g = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
hdUi.at = (ctx, ax, ay) => { const q = hd.ground(ax, ay); ctx.setTransform(z, 0, 0, z, q.x - ax * z, q.y - ay * z); };
g.setTransform(z, 0, 0, z, W / 2 - x * z, H / 2 - y * z);
const samples: number[] = [];
for (let i = 0; i < 22; i++) {
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); g.restore();
  const start = performance.now(); drawCombatUI(g, game.combat, game.time, z); if (i >= 2) samples.push(performance.now() - start);
}
const bytes = canvas.toBuffer('image/png'), label = process.argv[2] ?? 'before';
writeFileSync(`tools/out/edge-flicker/combat-ui-${label}.png`, bytes);
samples.sort((a, b) => a - b);
const texts = game.combat.texts, report = { label, note: 'real bundled sandbox 500v500 combat and actual Canvas drawCombatUI; Node CPU not browser FPS', hits, count: texts.length,
  dynamicPop: texts.filter(q => q.t < .1).length, uniqueTextColor: new Set(texts.map(q => q.s + '|' + q.color + '|' + !!q.big)).size,
  pngSha256: createHash('sha256').update(bytes).digest('hex'), ms: { p50: samples[10], p95: samples[19], mean: samples.reduce((a, b) => a + b, 0) / samples.length } };
writeFileSync(`tools/out/edge-flicker/combat-ui-${label}.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
