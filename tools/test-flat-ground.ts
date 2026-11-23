import './env';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { OrthographicCamera, Raycaster, Vector2, Vector3 } from 'three';
import { mulberry32 } from '../src/core/rng';
import { Batch, FLOATS } from '../src/gl/batch';
import type { Enemy } from '../src/world/combat';

const storage = { getItem: () => null, setItem() {}, removeItem() {} };
Object.assign(globalThis, { window: Object.assign(new EventTarget(), { innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1, matchMedia: () => ({ matches: false }) }),
  localStorage: storage, sessionStorage: storage, location: { href: 'http://127.0.0.1:5202/?hd2d=1', search: '?hd2d=1' }, __TAIXU_NORELOAD: true });
Math.random = mulberry32(20261113);
const { ModHost } = await import('../src/mod/host');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { HdScene } = await import('../src/hd2d/scene');
const worldData = await import('../src/data/world');
const host = new ModHost(), status = await host.load(JSON.parse(readFileSync(`dist-mods/shahe-${JSON.parse(readFileSync('mods/shahe/manifest.json', 'utf8')).version}.fmod`, 'utf8')));
assert.equal(status.state, 'loaded', status.error);
Object.assign(globalThis, { __modHost: host });
const sandbox = (globalThis as typeof globalThis & { __shahe: { S: { origin: { x: number; y: number }; arena: boolean }; enter(o: { who: string; realm: number; stage: number; place: string; fresh: boolean }): boolean } }).__shahe;
const terrain = new Terrain(); terrain.build();
const game = new Game(terrain); game.hero.realm = 2; game.hero.stage = 1; game.story['openT'] = -1; game.closeModal(true); game.paused = false;
game.canvas = Object.assign(new EventTarget(), { style: { cursor: '' }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080 }) }) as unknown as HTMLCanvasElement;
// 真实的山坡：原来写死的 (251520, 137300) 在南荒放大一倍、高山模式之后落到了平地上（四边形不再拆）。
// 现在从青霞谷往外按固定顺序找第一处站得住、坡度 0.3～0.8、且有明显弯曲（不是一个平面）的陆地。
// 要在进沙盒擂台之前找：擂台模组会改写 isLand / walkFactor
const hill = (() => {
  const { LOC_BY_ID, WORLD_SCALE } = worldData, hf = LOC_BY_ID.get('huangfeng')!, h = (x: number, y: number) => terrain.surfaceHeight(x, y);
  for (let r = 12000; r < 60000; r += 700) for (let a = 0; a < 36; a++) {
    const x = Math.round(hf.x * WORLD_SCALE + Math.cos(a / 36 * Math.PI * 2) * r), y = Math.round(hf.y * WORLD_SCALE + Math.sin(a / 36 * Math.PI * 2) * r);
    const s = terrain.surface.sample(x, y);
    if (!terrain.isLand(x, y) || !s.walkable || s.slope < 0.3 || s.slope > 0.8) continue;
    if (Math.abs(h(x + 65, y) + h(x - 65, y) - 2 * h(x, y)) + Math.abs(h(x, y + 65) + h(x, y - 65) - 2 * h(x, y)) > 10) return { x, y };
  }
  throw new Error('找不到真实山坡');
})();
host.attach(game); host.start();
assert(sandbox.enter({ who: 'test', realm: 2, stage: 1, place: 'arena', fresh: true })); assert(sandbox.S.arena);
const arena = sandbox.S.origin, W = 1920, H = 1080;

function scene(x: number, y: number, zoom: number, yaw: number) {
  const up = { x: Math.sin(yaw), y: -Math.cos(yaw) }, ground = terrain.surfaceHeight(x, y), d = 20000 / Math.SQRT2;
  const camera = new OrthographicCamera(-W / 2 / zoom, W / 2 / zoom, H / 2 / zoom, -H / 2 / zoom, 1, 40000);
  camera.position.set(x - up.x * d, ground + d, y - up.y * d); camera.up.set(0, 1, 0); camera.lookAt(x, ground, y); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  const hd = Object.create(HdScene.prototype) as InstanceType<typeof HdScene>;
  Object.assign(hd, { W, H, zoom, yaw, pitch: 45, tx: x, ty: y, cam: camera, ray: new Raycaster(), ndc: new Vector2(), hit: new Vector3(), projected: new Vector3(), heightAt: (a: number, b: number) => terrain.surfaceHeight(a, b) });
  (hd as unknown as { computeAff(): void }).computeAff();
  return { hd, camera };
}
function checkSample(batch: Batch, sx: number, sy: number, u: number, v: number, depth: number) {
  const d = batch.data;
  for (let i = 0; i < batch.n; i += 3) {
    const a = i * FLOATS, b = a + FLOATS, c = b + FLOATS;
    const ax = d[a], ay = d[a + 1], bx = d[b], by = d[b + 1], cx = d[c], cy = d[c + 1];
    const denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(denom) < 1e-8) continue;
    const wa = ((by - cy) * (sx - cx) + (cx - bx) * (sy - cy)) / denom;
    const wb = ((cy - ay) * (sx - cx) + (ax - cx) * (sy - cy)) / denom, wc = 1 - wa - wb;
    if (Math.min(wa, wb, wc) < -0.00002) continue;
    const near = (got: number, want: number, eps: number, label: string) => assert.ok(Math.abs(got - want) <= eps, `${label}: ${got} != ${want}`);
    near(wa * d[a + 2] + wb * d[b + 2] + wc * d[c + 2], u, 0.00003, 'u');
    near(wa * d[a + 3] + wb * d[b + 3] + wc * d[c + 3], v, 0.00003, 'v');
    near(wa * d[a + 8] + wb * d[b + 8] + wc * d[c + 8], depth, 0.000002, 'depth');
    return;
  }
  assert.fail(`missing triangle at ${sx}, ${sy}`);
}
const vertexCounts: number[] = []; let samples = 0, slopeTriangles = 0;
for (const loc of [arena, hill]) for (const yaw of [0, Math.PI / 4, Math.PI / 2]) for (const zoom of [.55, 1]) for (const radius of [65, 160, 400]) {
  const { hd, camera } = scene(loc.x, loc.y, zoom, yaw), B = new Batch();
  B.reset(loc.x, loc.y, zoom, W, H, null); B.hd = hd;
  const angle = .37;
  B.groundQuad(-1, loc.x, loc.y, radius, angle, .8, .7, .6, .9, 0, 1, [0, 0, 1, 1]);
  if (loc === arena) { vertexCounts.push(B.n); if (process.argv.includes('--expect-fast')) assert.equal(B.n, 6, 'arena flat surface must use one quad'); }
  else { assert.ok(B.n > 6, 'real mountain remains split to follow terrain'); slopeTriangles += B.n / 3; }
  for (const u of [.13, .47, .84]) for (const v of [.16, .52, .87]) {
    const rx = 2 * u - 1, ry = 2 * v - 1;
    const x = loc.x + radius * (Math.cos(angle) * rx - Math.sin(angle) * ry);
    const y = loc.y + radius * (Math.sin(angle) * rx + Math.cos(angle) * ry);
    const height = terrain.surfaceHeight(x, y) + 0.7;
    const q = new Vector3(x, height, y).project(camera);
    checkSample(B, (q.x + 1) * W / 2, (1 - q.y) * H / 2, u, v, q.z); samples++;
  }
}
const { hd } = scene(arena.x, arena.y, .55, Math.PI / 4), B = new Batch(), times: number[] = [];
for (let i = 0; i < 1200; i++) {
  B.reset(arena.x, arena.y, .55, W, H, null); B.hd = hd;
  const start = performance.now(); B.groundQuad(-1, arena.x + i % 13, arena.y + i % 17, 160, 0, 1, 1, 1, 1, 0, 1, [0, 0, 1, 1]);
  if (i >= 200) times.push(performance.now() - start);
}
times.sort((a, b) => a - b);
const report = { model: process.argv.includes('--expect-fast') ? 'after' : 'before', note: 'real bundled sandbox arena surface and real mountain terrain; Batch/Three projection, CPU only', arena, hill, samples, flatVertexCounts: [...new Set(vertexCounts)], slopeTriangles, radius: 160,
  ms: { p50: times[Math.floor(times.length * .5)], p95: times[Math.floor(times.length * .95)], mean: times.reduce((a, b) => a + b, 0) / times.length } };
mkdirSync('tools/out/edge-flicker', { recursive: true });
writeFileSync(`tools/out/edge-flicker/flat-ground-${report.model}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
