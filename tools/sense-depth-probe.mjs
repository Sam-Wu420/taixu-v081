import './env.ts';
import assert from 'node:assert/strict';
import { CanvasTexture, OrthographicCamera, Raycaster, Scene, Vector2, Vector3 } from 'three';
Object.assign(globalThis, { window: { innerWidth: 1230, innerHeight: 864, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} } });
const { Terrain, CHUNK } = await import('../src/world/terrain.ts');
const { Game } = await import('../src/world/game.ts');
const { HdScene, HdGround } = await import('../src/hd2d/scene.ts');
const { planTerrainChunks } = await import('../src/world/terrain-chunk-plan.ts');
const { Batch, FLOATS } = await import('../src/gl/batch.ts');
const { SenseFx } = await import('../src/world/sense.ts');
const { WORLD_W, WORLD_H } = await import('../src/data/world.ts');

const T = new Terrain(); T.build(); const g = new Game(T);
g.hero.realm = 1; g.hero.stage = 4;
const W = 1230, H = 864, x = Number(process.argv[2] ?? 250820), y = Number(process.argv[3] ?? 139800);
const cx = Number(process.argv[4] ?? x), cy = Number(process.argv[5] ?? y), zoom = Number(process.argv[6] ?? .6), yaw = Number(process.argv[7] ?? 0), R = g.senseRadius;
const hd = Object.create(HdScene.prototype);
Object.assign(hd, { W, H, zoom, yaw, pitch: 45, tx: cx, ty: cy, ray: new Raycaster(), ndc: new Vector2(), hit: new Vector3(), projected: new Vector3(),
  heightAt: (a, b) => T.surfaceHeight(a, b) });
const h = T.surfaceHeight(cx, cy), D = 20000 / Math.SQRT2;
const camera = new OrthographicCamera(-W / 2 / zoom, W / 2 / zoom, H / 2 / zoom, -H / 2 / zoom, 1, 40000);
camera.position.set(cx - Math.sin(yaw) * D, h + D, cy + Math.cos(yaw) * D); camera.up.set(0, 1, 0); camera.lookAt(cx, h, cy); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
hd.cam = camera; hd.computeAff();
const bounds = hd.groundBounds(320), order = planTerrainChunks({ left: bounds.l, top: bounds.t, right: bounds.r, bottom: bounds.b }, cx, cy, 0, 0, CHUNK, WORLD_W, WORLD_H);
const scene = new Scene(), texture = new CanvasTexture(document.createElement('canvas'));
const ground = new HdGround(scene, (a, b) => T.surfaceHeight(a, b), texture, 2048, 2048, 4096);
ground.begin(bounds.l, bounds.t, 1); ground.sync(order.filter(q => q.visible).map(q => T.previewChunk(q.cx, q.cy)), CHUNK); scene.updateMatrixWorld(true);
const image = new SenseFx().tex(1).ring, pixels = image.getContext('2d').getImageData(0, 0, image.width, image.height).data;
const alpha = (u, v) => pixels[(Math.min(1023, Math.max(0, Math.floor(v * 1024))) * 1024 + Math.min(1023, Math.max(0, Math.floor(u * 1024)))) * 4 + 3];

function triangles(t) {
  const batch = new Batch(); batch.reset(cx, cy, zoom, W, H, null); batch.hd = hd;
  const radius = 1024 * R / 470 * (1 + Math.sin(t * .9) * .004) / 2;
  batch.groundQuad(-1, x, y, radius, t * .035, 1, 1, 1, 1, 0, 1, [0, 0, 1, 1]);
  const out = [];
  for (let i = 0; i < batch.n; i += 3) out.push([0, 1, 2].map(j => {
    const o = (i + j) * FLOATS, a = batch.data; return { x: a[o], y: a[o + 1], u: a[o + 2], v: a[o + 3], depth: a[o + 8] };
  }));
  return out;
}
function weights(a, b, c, x, y) {
  const den = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  const u = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / den;
  const v = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / den;
  return [u, v, 1 - u - v];
}
function sample(triangle, w) { const [a, b, c] = triangle; return { x: a.x*w[0]+b.x*w[1]+c.x*w[2], y: a.y*w[0]+b.y*w[1]+c.y*w[2],
  u: a.u*w[0]+b.u*w[1]+c.u*w[2], v: a.v*w[0]+b.v*w[1]+c.v*w[2], depth: a.depth*w[0]+b.depth*w[1]+c.depth*w[2] }; }
function at(list, x, y) {
  for (const tri of list) { const w = weights(...tri, x, y); if (Math.min(...w) >= -1e-6) return sample(tri, w); }
  return null;
}
const first = triangles(3), next = triangles(3 + 1 / 60), ray = new Raycaster();
const probes = [[1/3,1/3,1/3],[.6,.2,.2],[.2,.6,.2],[.2,.2,.6]];
let count = 0, occluded = 0, front = 0, flips = 0, noGround = 0, minDelta = Infinity, maxDelta = -Infinity;
const examples = [];
for (const tri of first) for (const w of probes) {
  const a = sample(tri, w);
  if (a.x < 0 || a.y < 0 || a.x >= W || a.y >= H || alpha(a.u, a.v) < 10) continue;
  const b = at(next, a.x, a.y); if (!b || alpha(b.u, b.v) < 10) continue;
  ray.setFromCamera(new Vector2(a.x / W * 2 - 1, 1 - a.y / H * 2), camera);
  const hit = ray.intersectObjects(scene.children, true)[0];
  if (!hit) { noGround++; continue; }
  const groundDepth = hit.point.clone().project(camera).z, delta = (a.depth - groundDepth) * (camera.far - camera.near) / 2;
  count++; minDelta = Math.min(minDelta, delta); maxDelta = Math.max(maxDelta, delta);
  if (delta > 0) occluded++; else front++;
  if ((a.depth > groundDepth) !== (b.depth > groundDepth)) {
    flips++;
    if (examples.length < 5) examples.push({ screen: [a.x, a.y], alpha: [alpha(a.u,a.v), alpha(b.u,b.v)],
      beforeDepthDifference: delta, afterDepthDifference: (b.depth - groundDepth) * (camera.far - camera.near) / 2 });
  }
}
console.log(JSON.stringify({ position:[x,y], camera:[cx,cy], zoom, yaw, radius:R, triangleCount:first.length, count, front, occluded, flips, noGround, minDelta, maxDelta, examples }, null, 2));
if (process.env.EXPECT_GROUND_FRONT === '1') { assert(count > 0); assert.equal(noGround, 0); assert.equal(occluded, 0); }
ground.dispose(); texture.dispose();
