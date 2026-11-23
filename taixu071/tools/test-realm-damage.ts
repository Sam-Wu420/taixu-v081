import assert from 'node:assert/strict';
import './env';
(globalThis as any).window = { innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { realmDealK, realmTakeK, GAP_DEAL, GAP_TAKE } = await import('../src/world/combat');
function old(tab: number[], lo: number, n: number) {
  let k = 1; for (let i = 0; i < n; i++) k *= tab[Math.max(0, Math.min(tab.length - 1, lo + i))]; return k;
}
for (let me = 0; me <= 5; me++) for (let gap = -me; gap <= 5 - me; gap++) {
  const deal = gap > 0 ? old(GAP_DEAL, me, gap) : gap < 0 ? old(GAP_TAKE, me + gap, -gap) : 1;
  const take = gap > 0 ? old(GAP_TAKE, me, gap) : gap < 0 ? old(GAP_DEAL, me + gap, -gap) : 1;
  assert.ok(Math.abs(realmDealK(gap, false, me) - deal) < 1e-12);
  assert.ok(Math.abs(realmTakeK(gap, me) - take) < 1e-12);
  assert.ok(Math.abs(realmDealK(gap, true, me) - (gap > 0 ? Math.sqrt(deal) : deal)) < 1e-12);
}
for (const invalid of [NaN, Infinity, -Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
  assert.equal(realmDealK(invalid), 0); assert.equal(realmTakeK(invalid), 0);
  assert.equal(realmDealK(0, false, invalid), 0); assert.equal(realmTakeK(0, invalid), 0);
}
// 不能按差距循环；极大差距也应及时返回有限值。
for (const gap of [1_000_000_000, -1_000_000_000]) {
  assert.ok(Number.isFinite(realmDealK(gap))); assert.ok(Number.isFinite(realmTakeK(gap)));
}
console.log('realm damage: original 0–5 realm balance, talismans, invalid and extreme gaps passed');
