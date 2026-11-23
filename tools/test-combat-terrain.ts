import assert from 'node:assert/strict';
import './env';
import type { FoeSkill } from '../src/world/foeskills';

// 这里用人造的高程（一道直坡）造地面来测「战斗里的位移不能穿过站不住的陡坡」。高山模式（默认）下高程超过 0.2 就叠上
// 山脊噪声，造不出一道干净的直坡，平台上也是乱峰（原来的 x+400 落点站不住，测试一开头就断言失败）。
// 这些规则与地形模式无关（只看 sample().walkable / canTraverse），所以本测试退回平缓地形；高山模式下的陡坡行走见 test-terrain-movement
(globalThis as { __TAIXU_MOUNTAINS?: boolean }).__TAIXU_MOUNTAINS = false;
const { TerrainSurface } = await import('../src/world/surface');

Object.assign(globalThis, {
  window: { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
});
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const { blinkTo } = await import('../src/world/foemind');

const terrain = new Terrain(); terrain.build();
const game = new Game(terrain), combat = game.combat;
let origin: { x: number; y: number } | undefined;
for (let dx = -6000; dx <= 6000 && !origin; dx += 300) for (let dy = -6000; dy <= 6000; dy += 300) {
  const x = game.player.x + dx, y = game.player.y + dy;
  if ([0, 140, 400, 600, 640, 700].every((offset) => terrain.walkFactor(x + offset, y) > 0 && !combat.safeAt(x + offset, y))) { origin = { x, y }; break; }
}
assert.ok(origin, '测试需找到一段真实可行走的地面');
const { x, y } = origin;
terrain.surface = new TerrainSurface({ elevationAt: (wx) => Math.max(0, Math.min(1, (wx - x - 100) / 150)), roads: [], sites: [] });
assert.equal(terrain.canTraverse(x, y, x + 400, y), false);
assert.equal(terrain.surface.sample(x + 140, y).walkable, false);
assert.equal(terrain.surface.sample(x + 400, y).walkable, true);
game.player.x = x - 100; game.player.y = y;

const access = combat as unknown as { updateEnemies(dt: number, stealth: boolean): void };
const walk = (flying: boolean): number => {
  const e = new Enemy({ ...ENEMIES.wolf, flying }, x, y, 1, 3);
  e.kx = 4000; e.wanderT = 100; e.wx = 0; e.wy = 0;
  Object.assign(e, { terrT: 100 });
  combat.enemies = [e]; combat.allies = [];
  access.updateEnemies(0.1, true);
  return e.x - x;
};
assert.equal(walk(false), 0, '地面敌人不能穿过陡坡');
assert.equal(walk(true), 400, '飞行敌人可穿过陡坡');

const charge: FoeSkill = { id: 'test-charge', name: '冲撞', k: 'charge', el: 'phys', cd: 2, tele: 0.1, pow: 1, range: 400, len: 400, w: 30 };
const chargeMove = (flying: boolean): number => {
  const e = new Enemy({ ...ENEMIES.wolf, flying }, x, y, 1, 3);
  e.kit = [charge];
  e.cast = { sk: charge, t: 0, x0: x, y0: y, x1: x + 400, y1: y, ang: 0, hit: true, wave: 0 };
  combat.foe.tick(e, 0.3, x + 400, y, 400);
  return e.x - x;
};
assert.equal(chargeMove(false), 0, '地面冲撞不能穿过陡坡');
assert.equal(chargeMove(true), 400, '飞行冲撞保留飞行豁免');

const leap: FoeSkill = { id: 'test-leap', name: '跃击', k: 'leap', el: 'phys', cd: 2, tele: 0.3, pow: 1, range: 400, r: 50 };
const start = combat.foe as unknown as { start(e: InstanceType<typeof Enemy>, sk: FoeSkill, tx: number, ty: number): void };
const jumper = new Enemy(ENEMIES.wolf, x, y, 1, 3); jumper.kit = [leap];
start.start(jumper, leap, x + 140, y);
assert.ok(terrain.surface.sample(jumper.cast.x1, jumper.cast.y1).walkable, '跃击应避开陡坡落点');
start.start(jumper, leap, x + 400, y);
assert.equal(jumper.cast.x1, x + 400, '跃击可跨过陡坡落到平地');
combat.foe.tick(jumper, 0.3, x + 400, y, 400);
assert.equal(jumper.x, x + 400);

const teleporter = new Enemy(ENEMIES.wolf, x, y, 1, 3);
blinkTo(combat, teleporter, x + 140, y, 'earth');
assert.equal(teleporter.x, x, '遁术不能落到陡坡');
blinkTo(combat, teleporter, x + 400, y, 'earth');
assert.equal(teleporter.x, x + 400, '遁术可跨坡落到平地');

const flyingTeleporter = new Enemy({ ...ENEMIES.wolf, flying: true }, x, y, 1, 3);
blinkTo(combat, flyingTeleporter, x + 140, y, 'earth');
assert.equal(flyingTeleporter.x, x + 140, '飞行遁术可越过陡坡');

const blink: FoeSkill = { id: 'test-blink', name: '闪现', k: 'blink', el: 'phys', cd: 2, tele: 0.1, pow: 1, range: 400 };
const nativeRandom = Math.random;
Math.random = () => 0;
game.player.x = x + 30; game.player.y = y;
const blinker = new Enemy(ENEMIES.wolf, x, y, 1, 3); blinker.kit = [blink];
blinker.cast = { sk: blink, t: 0, x0: x, y0: y, x1: x + 30, y1: y, ang: 0, hit: false, wave: 0 };
combat.foe.tick(blinker, 0.2, x + 30, y, 30);
assert.equal(blinker.x, x, '敌人闪现不能落到陡坡');
Math.random = nativeRandom;

const surface = terrain.surface;
terrain.surface = new TerrainSurface({ elevationAt: (wx) => Math.max(0, Math.min(1, (wx - x - 100) / 800)), roads: [], sites: [] });
assert.equal(terrain.surface.sample(x + 640, y).walkable, false);
game.player.x = x - 100; game.player.y = y;
const burrower = new Enemy(ENEMIES.tujia, x, y, 3, 1);
burrower.hp = burrower.maxHp * 0.5; burrower.wanderT = 100; burrower.wx = 0; burrower.wy = 0;
combat.enemies = [burrower]; combat.allies = [];
Math.random = () => 0.5;
access.updateEnemies(0.1, true);
Math.random = nativeRandom;
assert.ok(burrower.burrowed);
assert.equal(burrower.x, x, '土遁不能落到陡坡');

game.player.x = x; game.player.y = y; game.player.flying = false;
game.player.st.vx = 100; game.player.st.vy = 0;
game.hero.realm = 1; game.hero.mp = 1;
if (!game.hero.arts.some((art) => art.id === 'tudun')) game.hero.arts.push({ id: 'tudun', xp: 0 });
combat.enemies = []; combat.cds.clear();
combat.cast('tudun');
assert.equal(game.player.x, x, '没有合法落点时玩家遁术应留在原处');

const threat = new Enemy(ENEMIES.wolf, x - 100, y, 1, 3); threat.aggro = true;
combat.enemies = [threat]; combat.cds.clear();
game.hero.bag.push({ id: 'tal_escape', n: 2 });
combat.castTalisman('tal_escape');
assert.ok(game.player.x > x && game.player.x < x + 700, '遁地符应缩短到可站立落点');
assert.ok(terrain.surface.sample(game.player.x, game.player.y).walkable);

game.player.x = x; game.player.y = y; game.player.flying = true; threat.aggro = true;
combat.cds.clear(); combat.castTalisman('tal_escape');
assert.equal(game.player.x, x + 700, '飞行时遁地符维持飞行豁免');
terrain.surface = surface;

game.player.x = x; game.player.y = y; game.player.flying = false; game.hero.mp = 1;
combat.enemies = []; combat.cds.clear(); combat.cast('tudun');
assert.equal(game.player.x, x + 600, '玩家遁术可跨坡落到平地');

game.player.x = x; game.player.y = y; game.player.flying = false;
combat.enemies = [];
combat.dash = { t: 0, dur: 1, vx: 4000, vy: 0, dmg: 0, hit: new Set(), invuln: true, color: '255,255,255', sparkAcc: 0 };
combat.update(0.1);
assert.equal(game.player.x, x, '玩家贴地闪避不能穿过陡坡');
game.player.flying = true;
combat.update(0.1);
assert.equal(game.player.x, x + 400, '飞行中的闪避保留飞行豁免');

console.log('PASS 地面行走、冲撞、飞行、跃击、闪现、土遁、玩家遁术/符箓与闪避');
