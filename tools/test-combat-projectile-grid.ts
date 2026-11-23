import './env';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/core/rng';
import type { SpatialIndex } from '../src/world/spatial';
import type { Enemy, Proj } from '../src/world/combat';

Object.assign(globalThis, {
  window: { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
});
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Enemy: Unit } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const terrain = new Terrain(); terrain.build();
type Access = { U: Enemy[]; unitGrid: SpatialIndex<Enemy>; updateEnemies(dt: number, stealth: boolean): void; updateProjs(dt: number): void };
type Target = { dx: number; dy: number; flying: boolean };

function collide(targets: Target[], indexed: boolean, selectedTarget = false) {
  Math.random = mulberry32(7331);
  const game = new Game(terrain), combat = game.combat, access = combat as unknown as Access;
  const x = Math.floor((game.player.x + 5000) / 256) * 256, y = Math.floor((game.player.y + 5000) / 256) * 256;
  const made = targets.map(({ dx, dy, flying }) => {
    const e = new Unit(flying ? ENEMIES.hawk : ENEMIES.bandit, x + dx, y + dy, 2, 1);
    e.team = 'foe'; e.aggro = true; Object.assign(e, { shell: true }); combat.enemies.push(e); return e;
  });
  for (let i = 0; i < 72; i++) {
    const e = new Unit(ENEMIES.bandit, x + 1400 + i * 5, y + 1400, 2, 1);
    e.team = 'foe'; e.aggro = true; Object.assign(e, { shell: true }); combat.enemies.push(e);
  }
  const source = new Unit(ENEMIES.bandit, x + 1000, y + 1000, 2, 1);
  source.ally = true; source.aggro = true; Object.assign(source, { shell: true }); combat.allies.push(source);
  access.updateEnemies(0, true);
  if (!indexed) access.unitGrid.nearby = () => access.U;
  const projectile: Proj = { fac: 'e', x, y, vx: 0, vy: 0, life: 0, max: 3, fx: 'sword', color: '255,255,255', dmg: 80,
    realm: 2, stCh: 0, pierce: false, homing: false, hit: new Set(), r: 26, aoe: 0, size: 1, trail: [], lv: 0,
    visual: { groundOffsetY: 30, elevation: 0 }, src: source, ally: true, tk: selectedTarget ? made[1] : undefined };
  combat.projs.push(projectile);
  const before = made.map(e => e.hp), order: number[] = [];
  const hit = combat.npcHit;
  combat.npcHit = function (...args) { order.push(made.indexOf(args[1])); hit.apply(this, args); };
  access.updateProjs(0);
  return { hit: order, health: made.map((e, i) => before[i] - e.hp), remaining: combat.projs.length };
}

const cases: { name: string; targets: Target[]; hit: number[]; selected?: boolean }[] = [
  { name: '地面投射物命中范围边缘', targets: [{ dx: 0, dy: 30 + 51.99, flying: false }], hit: [0] },
  { name: '飞行目标上侧边缘', targets: [{ dx: 0, dy: 70 - 51.99, flying: true }], hit: [0] },
  { name: '飞行目标下侧边缘', targets: [{ dx: 0, dy: 70 + 51.99, flying: true }], hit: [0] },
  { name: '范围外不命中', targets: [{ dx: 0, dy: 70 + 52.01, flying: true }], hit: [] },
  { name: '跨网格同距目标按原数组顺序命中', targets: [{ dx: 51, dy: 30, flying: false }, { dx: -51, dy: 30, flying: false }], hit: [0] },
  { name: '指定目标先于沿途目标', targets: [{ dx: 40, dy: 30, flying: false }, { dx: -40, dy: 30, flying: false }], hit: [1], selected: true },
];
for (const item of cases) {
  const scan = collide(item.targets, false, item.selected), grid = collide(item.targets, true, item.selected);
  assert.deepEqual(grid, scan, item.name);
  assert.deepEqual(grid.hit, item.hit, item.name);
  console.log(`PASS ${item.name}`);
}
