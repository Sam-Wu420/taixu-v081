import assert from 'node:assert/strict';
import { SpatialIndex } from '../src/world/spatial';
import './env';
import type { Enemy } from '../src/world/combat';

interface Point { id: number; x: number; y: number }

function random(seed: number): () => number {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
}

const rnd = random(418);
const grid = new SpatialIndex<Point>(256);
const points: Point[] = Array.from({ length: 60 }, (_, id) => ({ id, x: rnd() * 5000 - 2500, y: rnd() * 5000 - 2500 }));
points.push({ id: 60, x: -256, y: 0 }, { id: 61, x: 256, y: 0 }, { id: 62, x: 0, y: -256 }, { id: 63, x: 0, y: 256 });
grid.rebuild(points);

function checkQuery(x: number, y: number, r: number): void {
  const within = (p: Point) => Math.hypot(p.x - x, p.y - y) <= r;
  assert.deepEqual(grid.nearby(x, y, r).filter(within), points.filter(within));
}

for (const r of [0, 70, 256, 384, 1500]) {
  checkQuery(0, 0, r);
  for (let i = 0; i < 160; i++) checkQuery(rnd() * 5000 - 2500, rnd() * 5000 - 2500, r);
}
for (let i = 0; i < points.length; i += 3) {
  points[i].x = rnd() * 5000 - 2500;
  points[i].y = rnd() * 5000 - 2500;
  grid.moved(i);
  checkQuery(points[i].x, points[i].y, 70);
}
for (let i = 0; i < 80; i++) points.push({ id: points.length, x: rnd() * 5000 - 2500, y: rnd() * 5000 - 2500 });
for (let i = 0; i < 160; i++) checkQuery(rnd() * 5000 - 2500, rnd() * 5000 - 2500, i % 2 ? 70 : 384);

const crossing: Point[] = Array.from({ length: 63 }, (_, id) => ({ id, x: 2000 + id * 300, y: 1000 }));
const crossingGrid = new SpatialIndex<Point>(256);
crossingGrid.rebuild(crossing);
crossing.push({ id: 63, x: -257, y: 0 });
assert.ok(crossingGrid.nearby(-257, 0, 70).includes(crossing[63]));
crossing[0].x = -256; crossing[0].y = 0; crossingGrid.moved(0);
assert.deepEqual(crossingGrid.nearby(-256, 0, 70).filter((p) => Math.hypot(p.x + 256, p.y) <= 70), [crossing[0], crossing[63]]);
console.log('PASS 空间候选：边界、负坐标、顺序、跨格移动及运行中追加');

Object.assign(globalThis, {
  window: { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
});
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const { applyAffix } = await import('../src/world/affix');

type CombatAccess = { U: Enemy[]; unitGrid: SpatialIndex<Enemy>; updateEnemies(dt: number, stealth: boolean): void };
const terrain = new Terrain(); terrain.build();
const nativeRandom = Math.random;

function runCombat(indexed: boolean, allies: boolean, count: number, frames: number, skills = false, trace = false): { state: unknown; ms: number; spawned: number; liveQuery: boolean } {
  Math.random = random(8675309);
  const g = new Game(terrain);
  const c = g.combat, access = c as unknown as CombatAccess;
  const px = g.player.x + 5000, py = g.player.y + 5000;
  g.player.x = px; g.player.y = py; g.hero.realm = 2; g.time = 20;
  const wolf = { ...ENEMIES.wolf, flying: true }, human = { ...ENEMIES.bandit, flying: true };
  for (let i = 0; i < count; i++) {
    const e = new Enemy(i % 3 ? human : wolf, px + (Math.random() - 0.5) * 4200, py + (Math.random() - 0.5) * 4200, 1, 3);
    e.team = i % 2 ? '东' : '西';
    e.aggro = i % 5 !== 0; if (!skills) e.kit = []; else e.skT = 0;
    e.wanderT = 2; e.wx = 0.5; e.wy = -0.5;
    e.tankT = 0; e.dodgeCd = 2;
    if (allies && i >= count - 24) c.addAlly(e); else c.enemies.push(e);
  }
  const leader = c.enemies[0];
  leader.x = leader.hx = px + 80; leader.y = leader.hy = py;
  leader.aggro = true; leader.kx = 12000;
  applyAffix(leader, ['zhao']);
  if (leader.affix) leader.affix.zhaoT = 0;
  if (!indexed) {
    access.unitGrid.rebuild = () => {};
    access.unitGrid.moved = () => {};
    access.unitGrid.nearby = () => access.U;
  }
  const snapshots: unknown[] = [];
  const snapshot = () => {
    const units = c.units;
    return units.map((e) => ({ x: e.x, y: e.y, hp: e.hp, aggro: e.aggro, dead: e.dead, gone: e.gone, tgP: e.tgP, target: e.tgE ? units.indexOf(e.tgE) : -1, tank: e.tankRef instanceof Enemy ? units.indexOf(e.tankRef) : e.tankRef, kx: e.kx, ky: e.ky, animMove: e.anim.move }));
  };
  const start = performance.now();
  for (let i = 0; i < frames; i++) {
    g.time += 0.05; access.updateEnemies(0.05, true);
    if (trace) snapshots.push(snapshot());
  }
  const ms = performance.now() - start;
  const state = trace ? snapshots : snapshot();
  const actor = c.enemies[0], target = c.enemies[1];
  actor.team = 'query-a'; actor.aggro = true; actor.spar = false;
  target.team = 'query-b'; target.aggro = true; target.dead = false; target.gone = false; target.hideT = 0; target.spar = false; target.sleep = false; target.busy = false;
  target.x = 100000000; target.y = 100000000;
  const liveQuery = c.rivalNear(actor, target.x, target.y, 70) === target;
  return { state, ms, spawned: c.enemies.length - (count - (allies ? 24 : 0)), liveQuery };
}

for (const allies of [false, true]) {
  const baseline = runCombat(false, allies, 400, 8, false, true);
  const indexed = runCombat(true, allies, 400, 8, false, true);
  assert.ok(baseline.spawned > 0, '召唤词缀应在敌人更新期间新增单位');
  assert.deepEqual(indexed.state, baseline.state);
  assert.ok(indexed.liveQuery, '更新阶段以外的索敌应读取单位当前坐标');
  console.log(`PASS 真实战斗逐帧对照：${allies ? '含同阵快照' : '敌人数组实时追加'}，召唤 ${baseline.spawned} 个`);
}

const skilledBaseline = runCombat(false, false, 120, 35, true, true);
const skilledIndexed = runCombat(true, false, 120, 35, true, true);
assert.deepEqual(skilledIndexed.state, skilledBaseline.state);
console.log('PASS 真实招式运行逐帧对照及阶段外位置查询');

function focusedCombat(kind: 'rival' | 'territory' | 'avoid', indexed: boolean): { first: boolean; x: number[] } {
  Math.random = random(1229);
  const g = new Game(terrain), c = g.combat, access = c as unknown as CombatAccess;
  const px = g.player.x + 5000, py = g.player.y + 5000;
  g.player.x = px; g.player.y = py; g.time = 20;
  const wolf = { ...ENEMIES.wolf, flying: true }, human = { ...ENEMIES.bandit, flying: true };
  for (let i = 0; i < 400; i++) {
    const def = kind === 'avoid' || (kind === 'territory' && i === 0) ? wolf : human;
    const x = px + (i === 0 ? 0 : i === 1 ? (kind === 'avoid' ? 430 : 300) : i === 2 && kind !== 'avoid' ? -300 : 3000 + i * 10);
    const e = new Enemy(def, x, py, 1, 3);
    e.team = i === 1 || i === 2 ? '乙' : '甲';
    e.aggro = kind === 'rival' || (kind === 'territory' && i > 0);
    e.kit = []; e.wanderT = 100; e.wx = 0; e.wy = 0; e.tankT = 0;
    Object.assign(e, { terrT: 100, shell: i >= (kind === 'avoid' ? 2 : 1) });
    c.enemies.push(e);
  }
  const actor = c.enemies[0], first = c.enemies[1];
  if (kind === 'territory') Object.assign(actor, { terrT: 0 });
  if (kind === 'avoid') actor.kx = 4000;
  if (!indexed) {
    access.unitGrid.rebuild = () => {};
    access.unitGrid.moved = () => {};
    access.unitGrid.nearby = () => access.U;
  }
  access.updateEnemies(0.1, true);
  return { first: kind === 'rival' ? actor.tgE === first : actor.grudge === first, x: [actor.x - px, first.x - px] };
}

for (const kind of ['rival', 'territory', 'avoid'] as const) {
  const baseline = focusedCombat(kind, false), indexed = focusedCombat(kind, true);
  assert.deepEqual(indexed, baseline);
  if (kind === 'avoid') assert.ok(indexed.x[0] > 390 && indexed.x[1] > 430, '前一个单位跨格移动后，后一个单位应避让');
  else assert.ok(indexed.first, '等距时应选择原数组中靠前的目标');
}
console.log('PASS 等距目标优先顺序及前一单位跨格后避让');

if (process.argv.includes('--bench')) {
  for (const count of [12, 80, 400, 800]) {
    runCombat(false, false, count, 3); runCombat(true, false, count, 3);
    const scanTimes: number[] = [], gridTimes: number[] = [];
    for (let i = 0; i < 3; i++) {
      const first = runCombat(i % 2 === 1, false, count, 18);
      const second = runCombat(i % 2 === 0, false, count, 18);
      const baseline = i % 2 === 0 ? first : second, indexed = i % 2 === 0 ? second : first;
      assert.deepEqual(indexed.state, baseline.state);
      scanTimes.push(baseline.ms); gridTimes.push(indexed.ms);
    }
    scanTimes.sort((a, b) => a - b); gridTimes.sort((a, b) => a - b);
    console.log(`CPU ${count} 单位 × 18 更新（3 次中位数）：原遍历 ${scanTimes[1].toFixed(2)} ms，网格 ${gridTimes[1].toFixed(2)} ms`);
  }
}
Math.random = nativeRandom;
