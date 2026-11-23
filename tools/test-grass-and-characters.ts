import './env';
import assert from 'node:assert/strict';
import { OrthographicCamera, Raycaster, Vector2, Vector3 } from 'three';
import type { Drawable } from '../src/world/life';

Object.assign(globalThis, {
  window: { innerWidth: 1230, innerHeight: 864, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
});
const { Terrain, CHUNK } = await import('../src/world/terrain');
const { Renderer } = await import('../src/world/render');
const { Game } = await import('../src/world/game');
const { HdScene } = await import('../src/hd2d/scene');
const { HdStaticAtlas } = await import('../src/hd2d/staticAtlas');
const { charBox } = await import('../src/hd2d/boxes');
const { planTerrainChunks } = await import('../src/world/terrain-chunk-plan');
const { WORLD_W, WORLD_H } = await import('../src/data/world');
const { mulberry32 } = await import('../src/core/rng');

const atlas = new HdStaticAtlas(); atlas.begin();
assert.equal(atlas.bytes, 4096 * 4096 * 4);
for (let i = 0; i < 30; i++) {
  const image = document.createElement('canvas'); image.width = 208; image.height = 160;
  assert(atlas.get(image), '静态图集应容纳 30 张草图');
}
atlas.dispose();

const terrain = new Terrain(); terrain.build();
const game = new Game(terrain);
game.player.x = 251060; game.player.y = 139460;
game.hero.realm = 1; game.hero.stage = 4; game.cam.zoom = 1;
const W = 1230, H = 864, x = 250544.47, y = 139253.41;
const work = document.createElement('canvas'); work.width = 2048; work.height = 4096;
const hd = Object.assign(Object.create(HdScene.prototype) as HdScene, {
  W, H, zoom: 1, pitch: 45, yaw: 0, tx: x, ty: y, ray: new Raycaster(), ndc: new Vector2(), hit: new Vector3(), projected: new Vector3(),
  heightAt: (a: number, b: number) => terrain.surfaceHeight(a, b), decalW: 2048, decalH: 2048, atlasH: 2048,
  work, items: [], px: 0, py: 2048, rowH: 0, decal: { l: 0, t: 0, s: 1 }, bbMat: { uniforms: { uStatic: { value: null } } },
});
const height = terrain.surfaceHeight(x, y), distance = 20000 / Math.SQRT2;
const cam = new OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 1, 40000);
cam.position.set(x, height + distance, y + distance); cam.up.set(0, 1, 0); cam.lookAt(x, height, y); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
Object.assign(hd, { cam }); hd.computeAff();
const bounds = hd.groundBounds(320);
const chunks = planTerrainChunks({ left: bounds.l, top: bounds.t, right: bounds.r, bottom: bounds.b }, x, y, 0, 0, CHUNK, WORLD_W, WORLD_H);
terrain.setChunkView(chunks);
for (const q of chunks) if (q.visible && !terrain.getChunk(q.cx, q.cy, false)) terrain.previewChunk(q.cx, q.cy);
const renderer = Object.assign(Object.create(Renderer.prototype) as Renderer, {
  game, hd, stage: {}, ctx: work.getContext('2d')!, W, H, dpr: 1, Z: 1, ox: 0, oy: 0,
  groundOn: false, lowered: 0, sense: { dispR: 800 }, stats: {},
});
// P10 起新块的草每帧最多生成一块（飞越时不一帧生成好几块）：先空跑若干帧把视野里的块生成完，再量最后一帧
for (let f = 0; f < 64; f++) { hd.items.length = 0; (renderer as any).drawGrass(bounds.l, bounds.t, bounds.r, bounds.b, 3, 0, 1); }
hd.items.length = 0; hd.px = 0; hd.py = 2048; hd.rowH = 0;
(renderer as any).drawGrass(bounds.l, bounds.t, bounds.r, bounds.b, 3, 0, 1);
const grass = hd.items.length, staticGrass = hd.items.filter(item => item.static).length;
assert(grass >= 257, '视频对应相机位置的可见草必须全部保留');
assert.equal((renderer as any).stats.grass, grass);
assert.equal(staticGrass, grass, '草纹理应由共享静态图集承载');

const rng = mulberry32(71), painted = new Set<number>();
const people: Drawable[] = Array.from({ length: 1000 }, (_, id) => {
  const hx = x + (rng() - 0.5) * 360, hy = y + (rng() - 0.5) * 200;
  return { y: hy, hx, hy, hb: charBox(1.06, 0), draw: () => { painted.add(id); } };
});
(renderer as any).drawListHD(people, hd);
assert.equal(painted.size, 1000, '人物请求不能因草占用图集而消失');
assert.equal(hd.items.length, grass + 1000);
assert.equal(hd.items.filter(item => !item.static).length, 1000);
console.log(`PASS 同帧 ${grass} 株真实地形草（静态 ${staticGrass}）和 ${painted.size} 个人物立板`);
