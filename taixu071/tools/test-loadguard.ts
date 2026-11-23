import assert from 'node:assert/strict';
import './env';
(globalThis as any).window = { innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const storage = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) };
const { Game, SLOT_KEYS } = await import('../src/world/game');
const { newHero } = await import('../src/world/cultivation');
const { zipSave, unzipSave } = await import('../src/world/savezip');
const { validateSaveForLoad } = await import('../src/world/saveGuard');
const maps = ['renjie', 'lingjie', 'xianjie'];
const valid: any = { v: 3, ws: 300, time: 100, map: 'renjie', p: { x: 12, y: 34 }, day: 60, clock: 1, hero: newHero(), nodes: [], npcs: [], world: {}, fogs: {} };
valid.hero.wardrobe = { sex: 'm', outfit: 'qingshan', dye: 0, showEquipment: true };
valid.hero.equip = { armor: 'art_huanglin', boots: 'art_tayun' };
validateSaveForLoad(valid, maps, 300);
validateSaveForLoad({ p: { x: 1, y: 2 } }, maps, 300); // 早期存档允许缺失可选字段
const bad = [
  null, {}, { ...valid, v: 4 }, { ...valid, v: 2.5 }, { ...valid, world: { flags: [] } },
  { ...valid, npcs: [{ id: 'n', name: 'npc', x: 1, y: 2, tx: 3, ty: null, realm: 1, stage: 0, age: 20, life: 100 }] },
  { ...valid, p: { x: null, y: 1 } }, { ...valid, ws: 0 },
  { ...valid, ws: 1e-320 }, { ...valid, map: 'unknown' }, { ...valid, zoom: 0 },
  { ...valid, hero: { ...valid.hero, hp: null } },
  ...[
    { talents: null }, { talents: [null] }, { talentLevels: [-1] }, { looted: [5] },
    { pendingTalent: [false] }, { arts: [null] }, { arts: [{ id: 'x', xp: -1 }] },
    { hotbar: Array(9).fill(4) }, { equip: [] }, { equip: { armor: 3 } },
    { bottle: null }, { bottle: { drops: 1, charge: '3' } },
    { bottle: { drops: -1, charge: 0 } }, { age: -1 }, { stats: { alchemy: 'bad' } },
  ].map(fields => ({ ...valid, hero: { ...valid.hero, ...fields } })),
  JSON.parse('{"p":{"x":1,"y":2},"world":{"flags":{"__proto__":{"poisoned":true}}}}'),
  ...[{realm:-1,stage:0},{realm:13,stage:0},{realm:1.5,stage:0},{realm:5,stage:3},{realm:1,stage:-1},{realm:1,stage:13},{realm:1,stage:0,exp:-1}].map(x=>({...valid,hero:{...valid.hero,...x}})),
  { p: { x: 1, y: 2, realm: 99, stage: 0 } },
  { ...valid, hero: { ...valid.hero, bag: [{ n: -1 }] } },
  { ...valid, nodes: [null] }, { ...valid, npcs: [null] }, { ...valid, fogs: { renjie: 1 } },
];
for (const d of bad) assert.throws(() => validateSaveForLoad(d, maps, 300));
for (const raw of ['z1:', 'z1:\0\0\0', 'z1:\xff\xff\xff\xff', 'z1:\0\0\0\x01\x80\0\0\0']) assert.throws(() => unzipSave(raw));
// JSON 数值指数溢出不需要 NaN 字面量；预检必须在切图、赋值之前拦截。
assert.throws(() => validateSaveForLoad(JSON.parse('{"p":{"x":1,"y":2},"world":{"flags":{"x":1e400}}}'), maps, 300));
// 可选旧字段缺省仍采用默认值，不要求完整现代 schema。
validateSaveForLoad({ p: { x: 1, y: 2 }, v: 2, hero: { realm: 1, stage: 0 } }, maps, 300);
assert.equal(({} as any).poisoned, undefined);
const original = zipSave(JSON.stringify(valid));
assert.equal(unzipSave(original), JSON.stringify(valid));
assert.throws(() => unzipSave(original.slice(0, -2)));
storage.set(SLOT_KEYS[0], 'z1:\0');
storage.set(SLOT_KEYS[1], original);
storage.set(SLOT_KEYS[2], JSON.stringify({ ...valid, time: 999, map: 'not-a-map' }));
assert.equal(Game.latestSlot(), SLOT_KEYS[1], 'skip damaged and invalid newer slots');
const fake: any = { player: { x: 777, y: 888, flying: false }, hero: { name: 'current' }, day: 123, switchMap() { throw Error('unexpected switch'); } };
const before = JSON.stringify(fake);
const warn = console.warn; console.warn = () => {};
try {
  for (const d of bad) {
    storage.set(SLOT_KEYS[3], JSON.stringify(d));
    assert.equal(Game.prototype.load.call(fake, SLOT_KEYS[3]), false);
    assert.equal(JSON.stringify(fake), before, 'invalid load changed game state');
  }
  storage.set(SLOT_KEYS[3], 'z1:\0');
  assert.equal(Game.prototype.load.call(fake, SLOT_KEYS[3]), false);
  assert.equal(JSON.stringify(fake), before);
} finally { console.warn = warn; }
// 执行真实 load 入口的成功路径，子系统用轻量桩，确认预检不会阻止正常读档。
{
  const reset = { reset() {} };
  const live: any = {
    player: { x: 0, y: 0 }, terrain: { walkFactor: () => 1 }, travel: { pending: null },
    explored: new Uint8Array(16), fogs: {}, cam: {}, nodes: { fromSave() {} },
    combat: { reset() {}, fade: 0 }, npcs: { fromSave() {}, dropBeauties() {} }, dailyQueue: [],
    daoxin: reset, pianju: reset, yuanying: reset, zhenfa: reset, zhongsheng: reset, shen: reset,
    hearts: { restore() {} }, story: { resume() {} }, emitModal() {}, updateUI() {},
  };
  assert.equal(Game.prototype.load.call(live, SLOT_KEYS[1]), true);
  assert.equal(live.player.x, 12); assert.equal(live.player.y, 34);
  assert.equal(live.hero.hp, valid.hero.hp); assert.equal(live.day, 60);
  const { equipmentAppearance } = await import('../src/gfx/equipmentAppearance');
  assert.equal(live.hero.wardrobe.showEquipment, true);
  assert.equal(equipmentAppearance(live.player.look, live.hero.equip, true).overColor, '#c0a040');
  const peak = { ...valid, hero: { ...valid.hero, realm: 5, stage: 0, exp: 12345 } };
  storage.set(SLOT_KEYS[1], zipSave(JSON.stringify(peak)));
  assert.equal(Game.prototype.load.call(live, SLOT_KEYS[1]), true);
  assert.equal(live.hero.exp, 12345, 'reading a peak-realm save must not silently refill cultivation');
  assert.equal(live.hero.realm, 5); assert.equal(live.hero.stage, 0);
  // 历史化神中/后期存档兼容：可正常校验并保留境界，不报错也不降级
  const legacyHuashen = { ...valid, hero: { ...valid.hero, realm: 5, stage: 2, exp: 999 } };
  validateSaveForLoad(legacyHuashen, maps, 300);
  storage.set(SLOT_KEYS[1], zipSave(JSON.stringify(legacyHuashen)));
  assert.equal(Game.prototype.load.call(live, SLOT_KEYS[1]), true);
  assert.equal(live.hero.realm, 5); assert.equal(live.hero.stage, 2);
  // 旧版人界三图（tiannan / luanxing / dajin）存档校验与自动坐标迁移至 renjie
  const { migrateHumanPoint } = await import('../src/data/world');
  for (const oldMap of ['tiannan', 'luanxing', 'dajin'] as const) {
    const legacySave = { ...valid, map: oldMap, p: { x: 60000, y: 45000 } };
    validateSaveForLoad(legacySave, maps, 300);
    storage.set(SLOT_KEYS[1], zipSave(JSON.stringify(legacySave)));
    assert.equal(Game.prototype.load.call(live, SLOT_KEYS[1]), true);
    const [mx, my] = migrateHumanPoint(oldMap, 60000 / 300, 45000 / 300);
    assert.ok(Math.abs(live.player.x - mx * 300) < 1e-6);
    assert.ok(Math.abs(live.player.y - my * 300) < 1e-6);
  }
}
console.log('load guard: valid and legacy fixtures, damaged payloads, latest slot selection, pre-mutation rejection and successful load passed');
