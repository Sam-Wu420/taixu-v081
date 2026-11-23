import assert from 'node:assert/strict';
import { SaveNumberError, validateSaveNumbers } from '../src/world/saveGuard';
const valid = { day: 60, clock: 2, p: { x: 1, y: 2 }, hero: { age: 20, realm: 1, stage: 0, exp: 123, hp: 1, mp: 0.5, bag: [{ id: 'mat_lingshi', n: 20 }] } };
assert.doesNotThrow(() => validateSaveNumbers(valid));
for (const bad of [NaN, Infinity, -Infinity]) {
  assert.throws(() => validateSaveNumbers({ ...valid, hero: { ...valid.hero, exp: bad } }), SaveNumberError);
  assert.throws(() => validateSaveNumbers({ ...valid, p: { x: bad, y: 0 } }), SaveNumberError);
}
for (const bad of [NaN, Infinity, -1, 1.2, Number.MAX_SAFE_INTEGER + 1]) {
  assert.throws(() => validateSaveNumbers({ ...valid, hero: { ...valid.hero, bag: [{ id: 'mat_lingshi', n: bad }] } }), SaveNumberError);
}
// 在实际调用中校验位于 setItem 之前；此处用内存存储模拟旧档不被覆盖。
let slot = 'previous-save';
try { const bad = { ...valid, hero: { ...valid.hero, hp: NaN } }; validateSaveNumbers(bad); slot = JSON.stringify(bad); } catch (e) { assert.ok(e instanceof SaveNumberError); }
assert.equal(slot, 'previous-save');
console.log('save guard: finite core fields, safe item counts and no overwrite passed');
