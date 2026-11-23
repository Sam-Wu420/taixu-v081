// P4 生态账本回归测试：视野外刷怪、远景边缘迁入、离开休眠与回访唤醒、击杀冷却、存档往返
import './env';
import assert from 'node:assert/strict';
import { createCanvas } from './env';

const CW = 1280, CH = 800;
(globalThis as any).window = {
  innerWidth: CW,
  innerHeight: CH,
  devicePixelRatio: 1,
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false }),
};
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
};

const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const { LOC_BY_ID, WORLD_SCALE, WORLD_W, WORLD_H } = await import('../src/data/world');
const { Ecology, ECO_ACTIVE_MAX, ecoChunkOf, isOutsideVisRect } = await import('../src/world/ecology');

const terrain = new Terrain();
terrain.build();
const g = new Game(terrain);
(g as any).paused = false;

const qn = LOC_BY_ID.get('qingniu')!;
const wildX = qn.x * WORLD_SCALE + 3200;
const wildY = qn.y * WORLD_SCALE + 600;
g.player.x = g.cam.x = wildX;
g.player.y = g.cam.y = wildY;
g.cam.zoom = g.cam.targetZoom = 0.8;

// 1) 正常视角下连续刷怪：任何新刷出的敌人绝不得落在屏幕视野内部
g.combat.enemies = [];
g.combat.eco.clear();
const visNormal = g.combat.visRect();
for (let i = 0; i < 60; i++) {
  (g.combat as any).spawnTick();
}
assert.ok(g.combat.enemies.length > 0, 'wild spawnTick should populate ecological enemies');
for (const e of g.combat.enemies) {
  assert.ok(
    isOutsideVisRect(e.x, e.y, visNormal, 150),
    `enemy spawned inside visible viewport at (${Math.round(e.x)},${Math.round(e.y)}) vs vis ${JSON.stringify(visNormal)}`,
  );
  assert.ok(e.ecoId !== undefined, 'wild enemy must be registered in ecology ledger');
}

// 2) 离开后休眠保存血量与坐标，回访时原样唤醒（不再蒸发）
const target = g.combat.enemies[0];
const savedEcoId = target.ecoId!;
target.hp = Math.max(1, Math.round(target.maxHp * 0.42));
const savedName = target.name;
const savedX = target.x, savedY = target.y;
const expectedPct = target.hp / target.maxHp;

// 走出活跃圈 (> 5000px) 触发 update 清理休眠
g.player.x = g.cam.x = savedX + 7500;
g.player.y = g.cam.y = savedY + 7500;
g.combat.update(0.1);
assert.ok(!g.combat.enemies.some((e) => e.ecoId === savedEcoId), 'distant beast must hibernate out of active enemies');
const hibCount = [...g.combat.eco.slots.values()].flat().filter((b) => b.id === savedEcoId && b.state === 'hibernate').length;
assert.equal(hibCount, 1, 'hibernated beast must remain persisted in ecology slots');

// 回到其活跃半径内（但仍在镜头视野外，避免视野内突现），必须唤醒同一只且保留残血比例
g.player.x = g.cam.x = savedX + 1400;
g.player.y = g.cam.y = savedY;
(g.combat as any).spawnTick();
const woken = g.combat.enemies.find((e) => e.ecoId === savedEcoId);
assert.ok(woken, 'returning within active range must wake the persisted beast');
assert.equal(woken!.name, savedName);
assert.ok(Math.abs(woken!.hp / woken!.maxHp - expectedPct) < 0.03, 'woken beast must retain wounded hp percentage');

// 3) 极远视角（z = 0.04）：视野覆盖整个活跃环时，不再原地干等也不在屏内突现，而是从视野外缘迁入
g.combat.enemies = [];
g.combat.eco.clear();
g.player.x = g.cam.x = wildX;
g.player.y = g.cam.y = wildY;
g.cam.zoom = g.cam.targetZoom = 0.04;
const visFar = g.combat.visRect();
for (let i = 0; i < 40; i++) (g.combat as any).spawnTick();
assert.equal(g.combat.enemies.length, 0, 'far zoom must never pop new beasts inside visible viewport');
const farBeasts = [...g.combat.eco.slots.values()].flat();
assert.ok(farBeasts.length > 0, 'far zoom must still populate edge-migrating beasts in ecology ledger');
for (const b of farBeasts) {
  assert.ok(isOutsideVisRect(b.x, b.y, visFar, 190), 'far-zoom migrating beast must start strictly outside visRect');
  assert.ok(b.patrol && b.patrol.length > 0, 'far-zoom migrating beast must carry inward patrol destination');
}
// 推进低频生态 tick：休眠迁徙体应向目标缓慢移动
const b0 = farBeasts[0];
const d0 = Math.hypot(b0.patrol![0].x - b0.x, b0.patrol![0].y - b0.y);
for (let k = 0; k < 20; k++) {
  g.time += 0.5;
  g.combat.eco.tick(g.time, visFar);
}
const d1 = Math.hypot((b0.patrol?.[0].x ?? b0.hx) - b0.x, (b0.patrol?.[0].y ?? b0.hy) - b0.y);
assert.ok(d1 < d0, 'batched ecology tick must advance migrating beast along patrol');

// 4) 击杀后槽位进入 dead 冷却，ACTIVE_MAX 上限生效
const eco = new Ecology();
const vis = { left: 10000, right: 11280, top: 10000, bottom: 10800 };
const chunk = ecoChunkOf(10640, 10400);
for (let k = 0; k < ECO_ACTIVE_MAX + 20; k++) {
  eco.requestPopulate([chunk[0] + 2 + (k % 3), chunk[1]], 30, vis, WORLD_W, WORLD_H, (sx, sy) => ({
    defId: 'wolf', x: sx, y: sy, realm: 1, stage: 2, sea: false, maxHpMul: 1, atkMul: 1,
  }));
}
const wokeList: any[] = [];
eco.updateActors({ x: 10640, y: 10400 }, 9000, vis, 10, wokeList, (b) => {
  const e = new Enemy(ENEMIES[b.defId], b.x, b.y, b.realm, b.stage, b.sea);
  return e;
});
assert.ok(wokeList.length <= ECO_ACTIVE_MAX, `active ecological beasts (${wokeList.length}) must not exceed ${ECO_ACTIVE_MAX}`);
eco.markDead(wokeList[0].ecoId, 10, 120);
assert.equal([...eco.slots.values()].flat().find((b) => b.id === wokeList[0].ecoId)?.state, 'dead');
eco.tick(140);
assert.equal([...eco.slots.values()].flat().some((b) => b.id === wokeList[0].ecoId), false, 'expired dead slot clears after cooldown');

// 5) 存档 / 读档往返保留生态账本
g.cam.zoom = g.cam.targetZoom = 0.8;
g.player.x = g.cam.x = wildX;
g.player.y = g.cam.y = wildY;
g.combat.enemies = [];
g.combat.eco.clear();
for (let i = 0; i < 15; i++) (g.combat as any).spawnTick();
const countBeforeSave = g.combat.eco.size;
assert.ok(countBeforeSave > 0);
assert.equal(g.save(0), true);
g.combat.reset();
assert.equal(g.combat.eco.size, 0);
assert.equal(g.load(), true);
assert.equal(g.combat.eco.size, countBeforeSave, 'loading save must restore ecological beast ledger');

console.log('ecology ledger: out-of-view spawns, hibernation/wake persistence, far-zoom migration, active cap and save round-trip passed');
