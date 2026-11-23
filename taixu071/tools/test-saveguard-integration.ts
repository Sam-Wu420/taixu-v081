import assert from 'node:assert/strict';
import './env';
(globalThis as any).window = { innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const storage = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v); }, removeItem: (k: string) => storage.delete(k) };
const { Game, SLOT_KEYS } = await import('../src/world/game');
const { newHero } = await import('../src/world/cultivation');
const fake: any = {
  hero: newHero(), player: { x: 100, y: 200, flying: false }, travel: { pending: null },
  fogs: {}, explored: new Uint8Array(10), day: 60, clock: 1, cam: { targetZoom: 1 }, revealAll: false,
  nodes: { toSave: () => [] }, npcs: { toSave: () => [] }, ws: {}, ui: { region: '天南' },
};
const save = (slot: number) => Game.prototype.save.call(fake, slot);
assert.equal(save(1), true);
const previous = storage.get(SLOT_KEYS[1]); assert.ok(previous);
fake.hero.exp = NaN;
const warn = console.warn; console.warn = () => {};
try { assert.equal(save(1), false); } finally { console.warn = warn; }
assert.equal(fake.saveLastError, 'invalidNumber');
assert.equal(storage.get(SLOT_KEYS[1]), previous);
fake.hero.exp = 42;
// 深层 NPC / 世界状态的异常不能被 JSON 静默写成 null，更不能覆盖旧档。
fake.ws = { flags: { nested: { value: Infinity } } };
console.warn = () => {}; try { assert.equal(save(1), false); } finally { console.warn = warn; }
assert.equal(fake.saveLastError, 'invalidNumber'); assert.equal(storage.get(SLOT_KEYS[1]), previous);
// toJSON 产生的非法结构也必须在持久化前按读档规则检查。
fake.ws = { toJSON: () => ({ flags: [] }) };
console.warn = () => {}; try { assert.equal(save(1), false); } finally { console.warn = warn; }
assert.equal(storage.get(SLOT_KEYS[1]), previous); fake.ws = {};

fake.hero.wardrobe = { sex: 'm', outfit: 'qingshan', dye: 0, showEquipment: true };
fake.hero.equip = { armor: 'art_huanglin', boots: 'art_tayun' };
assert.equal(save(1), true);
assert.notEqual(storage.get(SLOT_KEYS[1]), previous);
const reset = { reset() {} };
const live: any = { player: { x: 0, y: 0 }, terrain: { walkFactor: () => 1 }, travel: { pending: null }, explored: new Uint8Array(10), fogs: {}, cam: {}, nodes: { fromSave() {} }, combat: { reset() {}, fade: 0 }, npcs: { fromSave() {}, dropBeauties() {} }, dailyQueue: [], daoxin: reset, pianju: reset, yuanying: reset, zhenfa: reset, zhongsheng: reset, shen: reset, hearts: { restore() {} }, story: { resume() {} }, emitModal() {}, updateUI() {} };
assert.equal(Game.prototype.load.call(live, SLOT_KEYS[1]), true);
assert.equal(live.hero.wardrobe.showEquipment, true); assert.equal(live.hero.equip.armor, 'art_huanglin');
const { equipmentAppearance } = await import('../src/gfx/equipmentAppearance');
assert.equal(equipmentAppearance(live.player.look, live.hero.equip, true).overColor, '#c0a040');
console.log('save guard integration: normal save, rejection, previous slot preserved, recovery and equipment appearance reload passed');
