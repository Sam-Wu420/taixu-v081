import './env';
import assert from 'node:assert/strict';
import { Matrix4, OrthographicCamera, Raycaster, ShaderMaterial, Vector2, Vector3, Vector4 } from 'three';
import type { Drawable } from '../src/world/life';

Object.assign(globalThis, {
  window: { innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
});
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const { collectCombat } = await import('../src/world/combatfx');
const { HdScene } = await import('../src/hd2d/scene');
const { HdStaticAtlas } = await import('../src/hd2d/staticAtlas');
const { Renderer } = await import('../src/world/render');
const { prof } = await import('../src/core/prof');
const terrain = new Terrain(); terrain.build();
const game = new Game(terrain), combat = game.combat;
game.player.x = 1000; game.player.y = 1000; game.cam.zoom = 0.55;
game.life.sense.x = 1000; game.life.sense.y = 1000; game.life.sense.R = 10000;
(game as any).renderer = { hd: {} };
combat.enemies = Array.from({ length: 120 }, (_, i) => {
  const e = new Enemy(ENEMIES.bandit, 1400 + i, 1000, 2, 1);
  e.cs!.t = 1.01; e.cs!.seed = 17; e.cs!.blend = 1;
  return e;
});
const enemy = combat.enemies[2];
const work = document.createElement('canvas'); work.width = 2048; work.height = 4096;
const hd = Object.assign(Object.create(HdScene.prototype) as HdScene, {
  work, wctx: work.getContext('2d')!, decalW: 2048, decalH: 2048, atlasH: 2048, staticAtlas: null,
  groundLayer: { begin() {} }, items: [], px: 0, py: 2048, rowH: 0,
  cam: new OrthographicCamera(-1, 1, 1, -1, 1, 40000), W: 800, H: 600,
  inverseMatrix: new Matrix4(), inverseViewProjection: new Float32Array(16), projected: new Vector3(),
  ray: new Raycaster(), ndc: new Vector2(), hit: new Vector3(), yaw: 0, pitch: 45,
  heightAt: () => 0, bbMat: new ShaderMaterial({ uniforms: { uStatic: { value: null }, uRight: { value: new Vector3() }, uFold: { value: new Vector4() }, uBoost: { value: 1 } } }),   // uFold：HdScene.begin 每帧写的立板折角
});
const renderer = Object.assign(Object.create(Renderer.prototype) as Renderer, { ctx: work.getContext('2d')!, game, dpr: 1, W: 800, H: 600 });
const view = { left: 0, top: 0, right: 3000, bottom: 2000 };
function draw(cached: boolean, time = 0) {
  hd.begin(1000, 1000, 0.55, 1);
  const list: Drawable[] = [];
  collectCombat(combat, list, view, time, 0);
  const item = list.find(d => (d as any).enemy === enemy)!;
  const staticLayers = item.staticLayers;
  if (!cached) item.staticLayers = undefined;
  const priorRandom = Math.random;
  Math.random = () => 0.1;
  combat.sparks.length = 0;
  prof.reset(); prof.on = true;
  try { (renderer as any).drawListHD([item], hd); } finally { Math.random = priorRandom; item.staticLayers = staticLayers; }
  prof.endFrame(16);
  const counts = prof.report(100); prof.on = false;
  const output = document.createElement('canvas'); output.width = 800; output.height = 600;
  const g = output.getContext('2d')!; g.fillStyle = '#e9dfc6'; g.fillRect(0, 0, 800, 600);
  const atlas = (hd as any).staticAtlas as InstanceType<typeof HdStaticAtlas> | null;
  atlas?.snapshot();
  const direction = hd.upDir;
  const ordered = [...hd.items].sort((a, b) => (b.x - a.x) * direction.x + (b.y - a.y) * direction.y || a.seq - b.seq);
  for (const it of ordered) {
    const source = it.static ? atlas!.canvas : work, anchor = hd.ground(it.x, it.y);
    const sx = Math.min(it.u0, it.u1) * source.width, sy = (1 - it.v0) * source.height;
    const sw = Math.abs(it.u1 - it.u0) * source.width, sh = (it.v0 - it.v1) * source.height;
    g.globalAlpha = it.a;
    g.drawImage(source, sx, sy, sw, sh, anchor.x + it.l * 0.55, anchor.y + it.t * 0.55,
      (it.r - it.l) * 0.55, (it.b - it.t) * 0.55);
  }
  return { pixels: g.getImageData(0, 0, 800, 600).data, items: [...hd.items], sparks: combat.sparks.map(s => ({ ...s })), counts };
}
function compare(label: string, dynamic = 0, time = 0) {
  const old = draw(false, time), updated = draw(true, time);
  assert.equal(updated.items.filter(i => !i.static).length, dynamic, `${label} 应使用稳定槽及必要的动态状态层`);
  assert.deepEqual(updated.sparks, old.sparks, `${label} 的燃烧/中毒粒子应保持逐帧逻辑`);
  let sum = 0, changed = 0, n = 0;
  for (let y = 180; y < 380; y++) for (let x = 500; x < 760; x++) for (let c = 0; c < 3; c++) {
    const i = (y * 800 + x) * 4 + c, diff = Math.abs(old.pixels[i] - updated.pixels[i]);
    sum += diff; if (diff > 8) changed++; n++;
  }
  assert(sum / n < 0.4, `${label} 画面偏差过大：${sum / n}`);
  assert(changed / n < 0.015, `${label} 画面变化范围过大：${changed / n}`);
  return { label, mean: sum / n, changed: changed / n, staticLayers: updated.items.length };
}
const comparisons = [compare('普通')];
enemy.windup = 0.2; enemy.st.freeze = 1; enemy.st.burn = 1; enemy.st.poison = 1;
comparisons.push(compare('蓄力、冻结、燃烧、中毒'));
enemy.x += 35; enemy.y += 12; enemy.cs!.x = enemy.x; enemy.cs!.y = enemy.y; enemy.cs!.lift = 26;
comparisons.push(compare('位移和飞行高度'));
enemy.st.root = 1; enemy.st.shock = 1;
comparisons.push(compare('动态束缚和震荡', 1, 0.5));

const smallAtlas = new HdStaticAtlas(32);
(hd as any).staticAtlas = smallAtlas;
const state = enemy.cs!;
let last = state.last, poseUpdates = 0;
Object.defineProperty(state, 'last', { configurable: true, get: () => last, set: (p) => { last = p; poseUpdates++; } });
const fallback = draw(true);
assert.equal(fallback.items.filter(i => !i.static).length, 1, '静态槽不够时必须回退原动态图集');
assert.equal(poseUpdates, 1, '回退不得重复推进姿态');
assert.equal(fallback.sparks.length, 2, '回退不得重复触发状态粒子');
assert(fallback.counts.some(row => row.k === 'R·人物静态立板回退' && row.n === 1));
smallAtlas.dispose();
(hd as any).staticAtlas = null;
hd.begin(1000, 1000, 0.55, 1);
const crowded: Drawable[] = [];
collectCombat(combat, crowded, view, 0.5, 0);
prof.reset(); prof.on = true;
(renderer as any).drawListHD(crowded, hd);
prof.endFrame(16);
const crowdedCounts = prof.report(100); prof.on = false;
assert.equal(crowdedCounts.find(row => row.k === 'R·人物静态立板成功')?.n, 120, '120 名候选人物应全部进入稳定槽');
assert.equal(crowdedCounts.find(row => row.k === 'R·动态立板未分配')?.n, 0);
const targetLayers = hd.items.filter(item => item.x === enemy.x && item.y === enemy.y).sort((a, b) => a.seq - b.seq);
assert.deepEqual(targetLayers.map(item => item.static), [true, true, true, true, false], '警示、阴影、主体、冻结和动态状态必须保持先后顺序');
console.log('PASS 真实战斗稳定槽、状态效果、位移和容量回退', JSON.stringify(comparisons));
