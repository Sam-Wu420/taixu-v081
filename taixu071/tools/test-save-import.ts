import assert from 'node:assert/strict';
import './env';
(globalThis as any).window = { innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const data = new Map<string, string>();
let failWrite = false, failRead = false, failRemove = false;
const storage: any = { getItem(k: string) { if (failRead) throw Error('denied'); return data.get(k) ?? null; }, setItem(k: string, v: string) { if (failWrite) throw Error('quota'); data.set(k, v); }, removeItem(k: string) { if (failRemove) throw Error('denied'); data.delete(k); } };
(globalThis as any).localStorage = storage;
const { importRawSave } = await import('../src/world/saveImport');
const { unzipSave } = await import('../src/world/savezip');
const { Game, SLOT_KEYS } = await import('../src/world/game');
const { newHero } = await import('../src/world/cultivation');
const key = SLOT_KEYS[3], old = 'old save bytes';
const raw = JSON.stringify({ v: 3, ws: 300, map: 'renjie', p: { x: 12, y: 34 }, hero: newHero(), nodes: [], npcs: [], world: {}, time: 100 });
let count = 0; data.set(key, old);
for (const invalid of ['{', '{}', '{\"p\":{\"x\":1,\"y\":2},\"world\":{\"flags\":{\"x\":1e400}}}', '{\"p\":{\"x\":1,\"y\":2},\"world\":{\"__proto__\":{\"polluted\":true}}}', '{"p":{"x":null,"y":0}}', JSON.stringify({ p: { x: 1, y: 2 }, map: 'invalid' })]) {
  assert.equal(importRawSave(invalid, key, storage, () => { count++; return true; }), 'invalid');
  assert.equal(data.get(key), old); assert.equal(count, 0);
}
assert.equal(importRawSave(raw, key, storage, k => { assert.equal(unzipSave(data.get(k)!), raw); return false; }), 'load');
assert.equal(data.get(key), old);
assert.equal(importRawSave(raw, key, storage, () => { throw Error('load failed'); }), 'load'); assert.equal(data.get(key), old);
data.delete(key); assert.equal(importRawSave(raw, key, storage, () => false), 'load'); assert.equal(data.has(key), false);
data.set(key, old); failWrite = true; assert.equal(importRawSave(raw, key, storage, () => true), 'storage'); failWrite = false; assert.equal(data.get(key), old);
failRead = true; assert.equal(importRawSave(raw, key, storage, () => true), 'storage'); failRead = false;
assert.equal(importRawSave(raw, key, storage, () => { failWrite = true; return false; }), 'rollbackFailed'); failWrite = false;
data.delete(key); assert.equal(importRawSave(raw, key, storage, () => { failRemove = true; return false; }), 'rollbackFailed'); failRemove = false;
assert.equal(importRawSave(raw, key, storage, () => true), 'ok'); assert.equal(unzipSave(data.get(key)!), raw);
// 通过真实 Game.load 入口验证普通同地图导入。
const reset = { reset() {} };
const live: any = { player: { x: 0, y: 0 }, terrain: { walkFactor: () => 1 }, travel: { pending: null }, explored: new Uint8Array(10), fogs: {}, cam: {}, nodes: { fromSave() {} }, combat: { reset() {}, fade: 0 }, npcs: { fromSave() {}, dropBeauties() {} }, dailyQueue: [], daoxin: reset, pianju: reset, yuanying: reset, zhenfa: reset, zhongsheng: reset, shen: reset, hearts: { restore() {} }, story: { resume() {} }, emitModal() {}, updateUI() {} };
assert.equal(importRawSave(raw, key, storage, k => Game.prototype.load.call(live, k)), 'ok');
assert.equal(live.player.x, 12); assert.equal(live.player.y, 34);
// 跨图读档将目标档位传递给切图恢复逻辑，不能在回调成功后删除该档。
const other = JSON.stringify({ ...JSON.parse(raw), map: 'lingjie' });
let switched: any; live.switchMap = (map: string, resume: string) => { switched = [map, resume]; return true; };
assert.equal(importRawSave(other, key, storage, k => Game.prototype.load.call(live, k)), 'ok');
assert.deepEqual(switched, ['lingjie', key]); assert.equal(unzipSave(data.get(key)!), other);
// 损坏内容不能被误显示为空，存储拒绝时也不能冒充空档。
data.set(SLOT_KEYS[0], 'z1:\0'); data.set(SLOT_KEYS[1], raw); data.delete(SLOT_KEYS[2]);
const slots = Game.listSlots(); assert.equal(slots[0].invalid, true); assert.equal(slots[0].empty, false); assert.equal(slots[1].invalid, undefined); assert.equal(slots[2].empty, true);
failRead = true; assert.ok(Game.listSlots().every(s => s.unavailable && !s.empty)); failRead = false;
console.log('save import: invalid/preflight, success, failure rollback, storage errors, rollback failure and slot metadata passed');
