import './env';
import assert from 'node:assert/strict';
import type { NpcData } from '../src/world/npc';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (key: string) => store[key] ?? null, setItem: (key: string, value: string) => { store[key] = value; }, removeItem: (key: string) => { delete store[key]; } };

const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { ACTIVE_MAP, LOC_BY_ID, WORLD_SCALE } = await import('../src/data/world');
const terrain = new Terrain();
terrain.build();
const game = new Game(terrain);
// 陡坡点：原来写死的 (16750, 151250) 在南荒放大一倍、高山模式之后已经在海上。现在在青霞谷外的山里按固定顺序找第一处
// 「站不住、往东一步走不过去、但四周有路可绕」的陡坡（不在安全区里，东边 300 处还是陆地）
const steep = (() => {
  const hf = LOC_BY_ID.get('huangfeng')!, anchor = { x: hf.x * WORLD_SCALE, y: hf.y * WORLD_SCALE };
  const T = terrain, ok = (x: number, y: number) => T.isLand(x, y) && !game.combat.safeAt(x, y);
  for (let r = 12000; r < 60000; r += 700) for (let a = 0; a < 36; a++) {
    const x = Math.round(anchor.x + Math.cos(a / 36 * Math.PI * 2) * r), y = Math.round(anchor.y + Math.sin(a / 36 * Math.PI * 2) * r);
    if (!ok(x, y) || !ok(x + 300, y) || !ok(x + 600, y) || T.surface.sample(x, y).walkable || T.canTraverse(x, y, x + 15, y)) continue;
    let ways = 0;
    for (let k = 0; k < 16; k++) if (T.canTraverse(x, y, x + Math.cos(k / 8 * Math.PI) * 30, y + Math.sin(k / 8 * Math.PI) * 30)) ways++;
    if (ways >= 3) return { x, y };
  }
  throw new Error('找不到合适的陡坡点');
})();
console.log(`steep point ${steep.x}, ${steep.y}`);
assert(terrain.isLand(steep.x, steep.y));
assert(!terrain.surface.sample(steep.x, steep.y).walkable);
assert(!terrain.canTraverse(steep.x, steep.y, steep.x + 15, steep.y));

const setPlayer = (x: number, y: number, flying: boolean) => {
  game.player.x = game.player.st.x = x;
  game.player.y = game.player.st.y = y;
  game.player.flying = flying;
  game.input.keys.clear();
  game.input.joy.x = game.input.joy.y = 0;
};
setPlayer(steep.x, steep.y, false);
game.input.keys.add('d');
game.update(0.1);
assert.equal(game.player.x, steep.x, '地面角色不能直接穿越陡坡');
assert(!game.player.moving, '受阻时应停止行走动作');
setPlayer(steep.x, steep.y, true);
game.input.keys.add('d');
game.update(0.1);
assert(game.player.x > steep.x, '飞行可以越过陡坡');
setPlayer(steep.x, steep.y, true);
game.toggleFly();
assert(game.player.flying, '飞行不能落在陡坡');
game.toggleSit();
assert(game.player.flying && !game.player.sitting, '不能在陡坡自动落地打坐');
game.tryGather();
assert(game.player.flying, '不能在陡坡自动落地采集');

const roadIndex = 40 * 8;
const ax = terrain.roadSegW[roadIndex], ay = terrain.roadSegW[roadIndex + 1];
const dx = terrain.roadSegW[roadIndex + 2] - ax, dy = terrain.roadSegW[roadIndex + 3] - ay, length = Math.hypot(dx, dy);
setPlayer(ax, ay, false);
game.input.joy.x = dx / length; game.input.joy.y = dy / length;
game.update(0.1);
assert(Math.hypot(game.player.x - ax, game.player.y - ay) > 1, '玩家应能沿实际山路行走');
assert(terrain.canTraverse(ax, ay, game.player.x, game.player.y));

setPlayer(steep.x, steep.y, false);
assert(game.save(1));
const saved: { v: number; p: { x: number; y: number; flying: boolean }; npcs: NpcData[] } = JSON.parse(store.taixu_save_1);
assert.equal(saved.v, 3);
assert.equal('height' in saved.p, false);
const savedNpc = saved.npcs.find(n => (n.map ?? 'tiannan') === ACTIVE_MAP && n.realm === 0 && n.alive);
assert(savedNpc);
savedNpc.x = savedNpc.tx = steep.x; savedNpc.y = savedNpc.ty = steep.y;
store.taixu_save_1 = JSON.stringify(saved);
const loaded = new Game(terrain);
assert(loaded.load('taixu_save_1'));
assert(!loaded.player.flying);
assert(Math.hypot(loaded.player.x - steep.x, loaded.player.y - steep.y) <= 12000);
assert(terrain.walkFactor(loaded.player.x, loaded.player.y) > 0 && terrain.surface.sample(loaded.player.x, loaded.player.y).walkable, '旧存档玩家应落在附近可站立陆地');
const restoredNpc = loaded.npcs.byId.get(savedNpc.id);
assert(restoredNpc && terrain.walkFactor(restoredNpc.x, restoredNpc.y) > 0 && terrain.surface.sample(restoredNpc.x, restoredNpc.y).walkable, '旧存档地面 NPC 应落在附近可站立陆地');
assert(Math.hypot(restoredNpc.x - steep.x, restoredNpc.y - steep.y) <= 12000);
assert.equal(restoredNpc.tx, restoredNpc.x);
assert.equal(restoredNpc.ty, restoredNpc.y);
saved.p.flying = true;
store.taixu_save_1 = JSON.stringify(saved);
const loadedFlying = new Game(terrain);
assert(loadedFlying.load('taixu_save_1'));
assert(loadedFlying.player.flying && loadedFlying.player.x === steep.x && loadedFlying.player.y === steep.y, '旧存档飞行位置应保留');

setPlayer(steep.x + 300, steep.y, false);
const npc = game.npcs.list.find(n => (n.map ?? 'tiannan') === ACTIVE_MAP && n.realm === 0 && n.alive);
assert(npc);
game.npcs.active.clear();
const actor = game.npcs.summon(npc.id);
assert(actor);
actor.st.x = npc.x = steep.x; actor.st.y = npc.y = steep.y;
npc.tx = steep.x + 600; npc.ty = steep.y; npc.hunting = false; npc.stay = false;
actor.act = 'walk'; actor.wait = 0;
game.npcs.update(1 / 30);
assert(Math.hypot(actor.st.x - steep.x, actor.st.y - steep.y) > 0, '普通 NPC 应尝试绕坡而非原地卡死');
assert(terrain.canTraverse(steep.x, steep.y, actor.st.x, actor.st.y), '普通 NPC 不能穿越陡坡');
assert(terrain.walkFactor(actor.st.x, actor.st.y) > 0);
assert.equal(npc.x, actor.st.x); assert.equal(npc.y, actor.st.y);

setPlayer(steep.x + 300 + 70 * Math.sin(game.player.st.yaw + 0.9), steep.y + 40 * Math.cos(game.player.st.yaw + 0.9), false);
actor.st.x = npc.x = steep.x; actor.st.y = npc.y = steep.y; actor.act = 'follow'; actor.wait = 0;
game.npcs.update(1 / 30);
assert(Math.hypot(actor.st.x - steep.x, actor.st.y - steep.y) > 0, '随行 NPC 应尝试绕坡');
assert(terrain.canTraverse(steep.x, steep.y, actor.st.x, actor.st.y));

setPlayer(steep.x + 300, steep.y, false);
game.npcs.active.clear();
const crowd = game.npcs.list.filter(n => (n.map ?? 'tiannan') === ACTIVE_MAP && n.realm === 0 && n.alive).slice(0, 20);
assert.equal(crowd.length, 20);
const actors = crowd.map(n => {
  const a = game.npcs.summon(n.id);
  assert(a);
  n.faction = 'mortal'; n.hunting = false; n.stay = false; n.tx = steep.x + 600; n.ty = steep.y;
  a.st.x = n.x = steep.x; a.st.y = n.y = steep.y; a.act = 'walk'; a.wait = 0;
  return a;
});
for (let frame = 0; frame < 90; frame++) {
  const before = actors.map(a => [a.st.x, a.st.y] as const);
  game.npcs.update(1 / 30);
  for (let i = 0; i < actors.length; i++) {
    assert(terrain.canTraverse(before[i][0], before[i][1], actors[i].st.x, actors[i].st.y), 'NPC 行走不得穿越陡坡');
  }
}
assert(actors.every(a => Math.hypot(a.st.x - steep.x, a.st.y - steep.y) > 80), 'NPC 群体应能绕坡前行');

const distantNpc = crowd[0];
game.npcs.active.delete(distantNpc.id);
setPlayer(242400, 161280, false);
distantNpc.x = steep.x; distantNpc.y = steep.y; distantNpc.tx = steep.x + 600; distantNpc.ty = steep.y;
game.npcs.update(0.51);
assert(Math.hypot(distantNpc.x - steep.x, distantNpc.y - steep.y) > 0, '当前图的远处 NPC 应继续绕坡');
assert(terrain.canTraverse(steep.x, steep.y, distantNpc.x, distantNpc.y));
console.log(`movement tests passed; loaded player moved ${Math.hypot(loaded.player.x - steep.x, loaded.player.y - steep.y).toFixed(0)} units to stable ground; 20 NPCs navigated the slope`);
