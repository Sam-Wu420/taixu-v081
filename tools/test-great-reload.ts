import assert from 'node:assert/strict';
import './env';
import { ACTIVE_MAP } from '../src/data/world';
const entries = new Map<string, string>();
Object.assign(globalThis, {
  window: { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); },
  },
});
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const terrain = new Terrain(); terrain.build();
const game = new Game(terrain);
game.hero.realm = 4;
const { x, y } = game.player;
const great = { map: ACTIVE_MAP, x, y, day: game.day, rivals: ['甲真人', '乙真人', '丙真人'] };
game.ws.flags.great = great;
game.happen.great.tick(0);
assert.ok(game.combat.enemies.some((e) => e.tag === 'great:guard' && !e.dead), '真实大夺宝应生成镇宝妖王');
assert.equal(game.save(0), true);
assert.equal(game.load('taixu_save_auto'), true);
assert.deepEqual(game.ws.flags.great, great, '大夺宝的世界状态须保留');
game.happen.great.tick(0.6);
assert.ok(game.combat.enemies.some((e) => e.tag === 'great:guard' && !e.dead), '读档后镇宝妖王应重新出现');
assert.equal(game.happen.great.focus, false, '妖王未败不能直接取宝');
game.reset();
assert.equal(game.happen.great.focus, false);
assert.equal(game.happen.haps.length, 0);
console.log('PASS 大夺宝同实例读档重新生成守卫，新局清除临时事件');
