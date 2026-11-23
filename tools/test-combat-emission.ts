import assert from 'node:assert/strict';
import './env';

Object.assign(globalThis, {
  window: { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
});
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const terrain = new Terrain(); terrain.build();
const game = new Game(terrain), combat = game.combat;
const access = combat as unknown as { updateProjs(dt: number): void };

function projectileSparks(fps: number): number {
  combat.reset();
  combat.projs.push({ fac: 'p', visual: { groundOffsetY: 0, elevation: 0 }, x: game.player.x, y: game.player.y, vx: 0, vy: 0, life: 0, max: 2, fx: 'fireball', color: '255,120,40', dmg: 0, realm: 1, stCh: 0, pierce: false, homing: false, hit: new Set(), r: 1, aoe: 0, size: 1, trail: [], lv: 0 });
  for (let i = 0; i < fps; i++) access.updateProjs(1 / fps);
  return combat.sparks.length;
}

function dashSparks(fps: number): number {
  combat.reset(); game.player.flying = true;
  combat.dash = { t: 0, dur: 0.2, vx: 0, vy: 0, dmg: 0, hit: new Set(), invuln: true, color: '255,255,255', sparkAcc: 0 };
  while (combat.dash) combat.update(1 / fps);
  return combat.sparks.length;
}

const projectile = [30, 60, 144].map(projectileSparks);
const dash = [30, 60, 144].map(dashSparks);
for (const count of projectile) assert.ok(Math.abs(count - 42) <= 1, `弹道每秒火花数量 ${count}`);
for (const count of dash) assert.equal(count, 10, `0.2 秒冲刺火花数量 ${count}`);
console.log(`PASS 30/60/144 FPS：弹道每秒 ${projectile.join('/')}，0.2 秒冲刺 ${dash.join('/')}`);
