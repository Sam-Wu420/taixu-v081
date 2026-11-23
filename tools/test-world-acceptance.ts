import './env';
import assert from 'node:assert/strict';

const storage = new Map<string, string>();
Object.assign(globalThis, {
  window: { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
});
const { Terrain } = await import('../src/world/terrain');
const { Game, SLOT_KEYS } = await import('../src/world/game');
const { ACTIVE_MAP } = await import('../src/data/world');
const { RouteRunner, sectRoute, townRoute } = await import('./world-acceptance-routes');

const terrain = new Terrain(); terrain.build();
const game = new Game(terrain);
const scenarios = ACTIVE_MAP === 'dajin' ? ['yejia'] as const : ['qixuan', 'huangfeng', 'jingzhou'] as const;
for (const id of scenarios) {
  game.reset(); game.story['openT'] = -1; game.closeModal(true); game.paused = false;
  game.hero.realm = 2; game.hero.stage = 1;
  assert(Object.values(game.stats).every(Number.isFinite), '测试角色属性必须是有限数');
  const route = id === 'qixuan' || id === 'huangfeng' ? sectRoute(game, id) : townRoute(game, id);
  game.teleport(route.points[0].x, route.points[0].y);
  game.space.update(1, game.player.x, game.player.y);
  const runner = new RouteRunner(game, route); runner.start();
  let loaded = false, frames = 0;
  while (runner.active && frames++ < 3000) {
    runner.step(1 / 30);
    game.update(1 / 30);
    assert(!game.player.flying, `${id} 路径必须按步行规则执行`);
    assert(!game.halted, `${id} 测试途中被游戏对话或暂停打断`);
    if (!loaded && runner.distance >= runner.length * 0.45) {
      const before = { x: game.player.x, y: game.player.y };
      assert(game.save(3)); assert(game.load(SLOT_KEYS[3])); runner.rebase(); loaded = true;
      assert(Math.hypot(game.player.x - before.x, game.player.y - before.y) < 1, `${id} 途中读档改变位置`);
      assert.equal(game.hero.realm, 2); assert.equal(game.hero.stage, 1);
    }
    assert(runner.stuckSeconds < 3, `${id} 在路点 ${runner.waypoint} 卡住`);
  }
  assert(runner.arrived && loaded, `${id} 未完成真实路径及途中存读档`);
  runner.reverse();
  for (let i = 0; i < 30; i++) { runner.step(1 / 30); game.update(1 / 30); }
  assert(runner.active && runner.direction === -1 && runner.stuckSeconds < 3, `${id} 反向行走失败`);
  runner.pause(); assert.equal(game.destination, null);
  console.log(`${route.name}: ${route.points.length} points, ${Math.round(runner.length)} units, ${frames} frames, save/load and reverse passed`);
}
