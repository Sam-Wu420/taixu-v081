import assert from 'node:assert/strict';
import { createCanvas } from './env';
import type { Drawable } from '../src/world/life';

Object.assign(globalThis, {
  window: { innerWidth: 640, innerHeight: 480, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
});
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const { collectCombat } = await import('../src/world/combatfx');
const terrain = new Terrain(); terrain.build();
const game = new Game(terrain), combat = game.combat;
const e = new Enemy(ENEMIES.wolf, 200, 300, 1, 3);
e.anim.t = 0; e.anim.phase = 0; combat.enemies = [e];
game.life.sense.x = 200; game.life.sense.y = 300; game.life.sense.R = 10000;
const view = { left: 0, top: 0, right: 640, bottom: 480 };
const canvas = createCanvas(640, 480), ctx = canvas.getContext('2d');

const first: Drawable[] = [];
collectCombat(combat, first, view, 0, 0);
assert.equal(first.length, 1);
first[0].draw(ctx as unknown as CanvasRenderingContext2D);
const initial = ctx.getImageData(0, 0, 640, 480).data;
assert.ok(initial.some((v) => v !== 0), '真实战斗单位应绘制出像素');

first[0].k = '上一帧标签';
e.x += 20; e.y += 10;
const second: Drawable[] = [];
collectCombat(combat, second, view, 0, 0);
assert.equal(second[0], first[0], '同一敌人应复用绘制对象');
assert.equal(second[0].hx, e.x); assert.equal(second[0].hy, e.y);
assert.equal(second[0].y, e.y); assert.equal(second[0].k, undefined);
ctx.clearRect(0, 0, 640, 480);
second[0].draw(ctx as unknown as CanvasRenderingContext2D);
const moved = ctx.getImageData(0, 0, 640, 480).data;
for (let py = 0; py < 470; py++) for (let px = 0; px < 620; px++) {
  const a = (py * 640 + px) * 4, b = ((py + 10) * 640 + px + 20) * 4;
  for (let channel = 0; channel < 4; channel++) assert.equal(moved[b + channel], initial[a + channel], `绘制坐标 (${px}, ${py})`);
}
e.dead = true; e.deathT = 0.4;
const third: Drawable[] = [];
collectCombat(combat, third, view, 1, 0);
assert.equal(third[0], first[0], '死亡后仍复用同一对象');
ctx.clearRect(0, 0, 640, 480); third[0].draw(ctx as unknown as CanvasRenderingContext2D);
assert.ok(ctx.getImageData(0, 0, 640, 480).data.some((v) => v !== 0), '复用对象应绘制当前死亡状态');
console.log('PASS 战斗绘制对象复用、位置/标签更新、真实像素与死亡状态');
