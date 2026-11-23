import assert from 'node:assert/strict';
import './env';
import { mulberry32 } from '../src/core/rng';
import type { Invite } from '../src/world/friends';
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
const { CANON_EVENTS } = await import('../src/world/events');
const { WARS } = await import('../src/world/war');
const { LOC_BY_ID, WORLD_SCALE, ACTIVE_MAP } = await import('../src/data/world');
const { bagCount } = await import('../src/world/cultivation');

const terrain = new Terrain(); terrain.build();
const game = new Game(terrain);
const event = CANON_EVENTS.find((e) => e.id === 'shengxian');
assert.ok(event);
const location = LOC_BY_ID.get(event.loc);
assert.ok(location);
game.day = game.events.startDay(event);
game.player.x = location.x * WORLD_SCALE; game.player.y = location.y * WORLD_SCALE;
game.events.update(0);
assert.equal(game.modal?.kind, 'dialog');
if (game.modal?.kind !== 'dialog') throw new Error('大事件应弹出参与对话');
game.modal.node.options[1].act();
game.closeModal(true);
assert.equal(game.events.active?.wave, 0);
assert.ok(game.events.active.foes.length > 0);
for (let wave = 0; wave < 2; wave++) {
  for (const foe of game.events.active.foes) foe.dead = true;
  game.events.update(0);
  assert.equal(game.events.active?.wave, wave + 1);
}
assert.equal(game.events.active.wave, 2);
assert.ok(game.events.active.foes.some((foe) => !foe.dead));
assert.equal(bagCount(game.hero, 'item_shengxian'), 0);
assert.equal(game.save(0), true);

const spawn = game.events as unknown as { spawnEnc(): void };
const nativeRandom = Math.random;
Math.random = mulberry32(270118);
for (let dx = -18000; dx <= 18000 && game.events.enc.length === 0; dx += 3000) for (let dy = -18000; dy <= 18000 && game.events.enc.length === 0; dy += 3000) {
  game.player.x = location.x * WORLD_SCALE + dx; game.player.y = location.y * WORLD_SCALE + dy;
  for (let i = 0; i < 4 && game.events.enc.length === 0; i++) spawn.spawnEnc();
}
Math.random = nativeRandom;
assert.ok(game.events.enc.length > 0, '真实奇遇生成应产生一个临时奇遇');
const encounter = game.events.enc[0];
game.events.focus = game.events.enc[0];
assert.equal(game.load('taixu_save_auto'), true);
assert.equal(game.events.active, null, '读档应清除不随存档保存的事件波次');
assert.equal(game.events.enc.length, 0, '读档应清除不随存档保存的奇遇');
assert.equal(game.events.focus, null, '读档应清除不随存档保存的奇遇焦点');
assert.equal(game.ws.events.shengxian.state, 'active', '读档须保留已保存的世界事件状态');
game.events.update(0);
assert.equal(bagCount(game.hero, 'item_shengxian'), 0, '未击败读档前波次，不能直接获得奖励');
assert.equal(game.ws.events.shengxian.state, 'active');
assert.equal(game.modal?.kind, 'dialog', '仍在事件地点时读档后可重新参与');

if (game.modal?.kind !== 'dialog') throw new Error('应能重新参与');
game.modal.node.options[1].act();
game.closeModal(true);
assert.ok(game.events.active);
game.events.enc.push(encounter);
game.events.focus = encounter;
game.reset();
assert.equal(game.events.active, null);
assert.equal(game.events.enc.length, 0);
assert.equal(game.events.focus, null);

const war = WARS.find((w) => w.map === ACTIVE_MAP);
assert.ok(war);
const warState = game.war.st(war.id);
warState.phase = 'battle'; warState.side = 0; warState.score = 7;
const front = war.front();
game.player.x = front.x; game.player.y = front.y;
const battle = game.war as unknown as {
  startBattle(w: typeof war, s: typeof warState): void;
  battle: { foes: { dead: boolean }[] } | null;
};
battle.startBattle(war, warState);
assert.ok(battle.battle && battle.battle.foes.length);
battle.battle.foes[0].dead = true;
const merit = game.war.merit;
assert.equal(game.save(0), true);
assert.equal(game.load('taixu_save_auto'), true);
assert.equal(battle.battle, null, '读档应清除不随存档保存的战场波次');
assert.equal(game.war.st(war.id).score, 7, '读档须保留已保存的战事进度');
game.war.update(1 / 60);
assert.equal(game.war.merit, merit, '旧战场中的死亡不能在新档重复结算战功');
assert.equal(game.war.st(war.id).score, 7);

battle.startBattle(war, game.war.st(war.id));
assert.ok(battle.battle);
game.reset();
assert.equal(battle.battle, null, '新局应清除旧战场');

game.closeModal(true);
const friend = game.npcs.list.find((d) => d.alive && d.realm > 0 && (d.map ?? 'tiannan') === ACTIVE_MAP);
assert.ok(friend);
let invite: Invite | null = null;
for (let attempt = 0; attempt < 10 && !invite; attempt++) {
  Math.random = mulberry32(900 + attempt);
  const candidate = game.friends.makeInvite('help', friend);
  if (candidate && game.canStand(candidate.x, candidate.y)) invite = candidate;
  else if (candidate) candidate.declined = true;
}
Math.random = nativeRandom;
assert.ok(invite, '真实邀约生成应找到合法会合地点');
game.friends.accept(invite);
game.player.x = invite.x; game.player.y = invite.y;
const friendScene = game.friends as unknown as { scene: { inv: Invite; foes: { dead: boolean }[] } | null };
Math.random = () => 0.1; game.friends.update(0); Math.random = nativeRandom;
assert.ok(friendScene.scene && friendScene.scene.foes.length > 0, '到场后应生成真实求援敌人');
assert.equal(invite.fired, true);
const completed = { ...invite, id: invite.id + 1000, done: true, fired: true };
game.friends.S.invites.push(completed);
const friendId = friend.id, favor = friend.favor;
assert.equal(game.save(0), true);
assert.equal(game.load('taixu_save_auto'), true);
const restored = game.friends.S.invites.find((i) => i.id === invite.id);
assert.ok(restored);
assert.equal(friendScene.scene, null, '读档应清除未保存的好友战斗');
assert.equal(restored.fired, false, '未结束的邀约读档后应允许重新触发');
assert.equal(restored.accepted, true);
assert.deepEqual(game.friends.S.invites.find((i) => i.id === completed.id), completed, '已完成的邀约不能重置');
assert.equal(game.npcs.byId.get(friendId)?.favor, favor);
Math.random = () => 0.1; game.friends.update(0); Math.random = nativeRandom;
assert.ok(friendScene.scene && friendScene.scene.foes.length > 0, '同实例读档后到场应重新开战');
assert.equal(game.npcs.byId.get(friendId)?.favor, favor, '未战胜敌人不能结算好感');

const resumed = new Game(terrain);
assert.equal(resumed.load('taixu_save_auto'), true);
assert.equal(resumed.friends.S.invites.find((i) => i.id === invite.id)?.fired, false);
Math.random = () => 0.1; resumed.friends.update(0); Math.random = nativeRandom;
assert.ok((resumed.friends as unknown as { scene: { foes: unknown[] } | null }).scene?.foes.length, '新实例读档也应重新开战');
game.reset();
assert.equal(friendScene.scene, null, '新局应清除好友战斗');
console.log('PASS 大事件、奇遇、战场与好友邀约跨读档/新局清除并重新触发');

