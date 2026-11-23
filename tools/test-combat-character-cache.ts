import './env';
import assert from 'node:assert/strict';
import { createCanvas } from './env';
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
const { prof } = await import('../src/core/prof');
const terrain = new Terrain(); terrain.build();
const game = new Game(terrain), combat = game.combat;
const originalPerformance = globalThis.performance;
let now = 0;
Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
game.player.x = 1000; game.player.y = 1000; game.cam.zoom = 0.55;
(game as any).renderer = { hd: {} };
game.life.sense.x = 1000; game.life.sense.y = 1000; game.life.sense.R = 10000;
combat.enemies = Array.from({ length: 120 }, (_, i) => {
  const e = new Enemy(ENEMIES.bandit, i === 1 ? 1100 : 1400 + i, 1000, 2, 1);
  e.cs!.t = 1.01; e.cs!.seed = 17;
  return e;
});
combat.lock = combat.enemies[0];
const canvas = createCanvas(800, 600), ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
ctx.setTransform(0.2, 0, 0, 0.2, 100, 100);
const view = { left: 0, top: 0, right: 3000, bottom: 2000 };
function collect(dt: number): Drawable[] {
  const list: Drawable[] = [];
  collectCombat(combat, list, view, 0, dt);
  return list;
}
function frame(list: Drawable[]) {
  prof.reset(); prof.on = true;
  for (const d of list) d.draw(ctx);
  prof.endFrame(16);
  const result = prof.report(100);
  prof.on = false;
  return (name: string) => result.find(entry => entry.k === name)?.n ?? 0;
}
let list = collect(0);
assert.equal(list.length, 120);
let count = frame(list);
assert.equal(count('R·人物缓存重绘'), 118, '拥挤小角色应建立缓存，锁定和附近角色保持实时');
assert.equal(count('R·人物缓存命中'), 0);
for (const e of combat.enemies) e.cs!.update(1 / 120);
now += 17;
list = collect(1 / 120);
count = frame(list);
assert.equal(count('R·人物缓存命中'), 118, '下一帧应复用完整人物位图');
assert.equal(count('R·战斗人物主体'), 120, '全部角色仍参与绘制');

ctx.setTransform(1, 0, 0, 1, -1100, -700);
ctx.clearRect(1100, 700, 800, 600);
list[2].draw(ctx);
const before = ctx.getImageData(0, 0, 800, 600).data;
combat.enemies[2].st.freeze = 1;
ctx.clearRect(1100, 700, 800, 600);
list[2].draw(ctx);
const after = ctx.getImageData(0, 0, 800, 600).data;
assert(after.some((v, i) => v !== before[i]), '缓存命中时受击状态层仍应单独更新');

ctx.setTransform(0.2, 0, 0, 0.2, 100, 100);
for (const e of combat.enemies) { e.cs!.setAction('cast'); e.cs!.yaw = Math.PI / 2; }
const visited = new Set<unknown>();
for (let i = 0; i < 4; i++) {
  now += 500;
  for (const e of combat.enemies) e.cs!.update(0.1);
  list = collect(0.1);
  const scheduled = list.filter(d => (d as any).refresh);
  assert.equal(scheduled.length, 30, '每帧只轮到四分之一远处角色');
  for (const d of scheduled) visited.add((d as any).enemy);
  count = frame(list);
  assert(count('R·人物缓存重绘') <= 30, '全员同时施法、转向也不能突破刷新预算');
  assert.equal(count('R·人物缓存重绘') + count('R·人物缓存命中'), 118);
  assert.equal(count('R·战斗人物主体'), 120, '预算不能省略任何人物');
}
assert.equal(visited.size, 118, '轮转四帧应覆盖所有候选人物');

game.cam.zoom = 1.2;
list = collect(1 / 120); count = frame(list);
assert.equal(count('R·人物缓存命中'), 0, '高缩放应恢复实时绘制');
game.cam.zoom = 0.55; combat.enemies = combat.enemies.slice(0, 119);
list = collect(1 / 120); count = frame(list);
assert.equal(count('R·人物缓存命中'), 0, '非拥挤场景应恢复实时绘制');
Object.defineProperty(globalThis, 'performance', { configurable: true, value: originalPerformance });
console.log('PASS 真实战斗收集、低帧刷新预算、公平轮转、锁定/近处优先与状态覆盖');
