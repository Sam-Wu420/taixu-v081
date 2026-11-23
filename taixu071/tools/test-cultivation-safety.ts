import assert from 'node:assert/strict';
import './env';
const C = await import('../src/world/cultivation');
const hooks = await import('../src/mod/hooks');
const h = C.newHero(); const msgs: C.Msg[] = [];
for (const n of [NaN, Infinity, -1, 0]) {
  const before = structuredClone(h);
  assert.equal(C.gainExp(h, n, msgs), 0); assert.deepEqual(h, before);
}
h.wuP = C.WU_MAX; h.wuM = Math.floor(h.age * 12);
h.exp = C.need(h) - 1;
assert.equal(C.bottleneck(h), 'none');
// 初始境界的当前阶段可自动进阶，故单独用有小瓶颈的阶段。
const { smallBottleneck, REALMS } = await import('../src/data/realms');
const stage = REALMS[1].stages.findIndex((_, i) => !!smallBottleneck(1, i));
assert.ok(stage >= 0); h.stage = stage; h.exp = C.need(h) - 1;
const pool = h.wuP; assert.equal(C.gainExp(h, 1000, msgs), 1);
assert.ok(Math.abs(h.wuP! - (pool! - 1 / C.need(h))) < 1e-12);
const full = structuredClone(h); assert.equal(C.gainExp(h, 100, msgs), 0); assert.deepEqual(h, full);
h.exp = 0; h.wuP = NaN; const old = h.exp; assert.equal(C.gainExp(h, 10, msgs), 0); assert.equal(h.exp, old);
h.wuP = C.WU_MAX;
hooks.setModx({ has: (s: string) => s === 'exp', fire: (_: string, c: any) => ({ ...c, amount: Infinity }) } as any);
assert.equal(C.gainExp(h, 100, msgs), 0); assert.equal(h.exp, 0); hooks.setModx(null);
for (const n of [NaN, Infinity, -1, 1.5]) { const before = structuredClone(h); assert.equal(C.tryBreak(h, n).ok, false); assert.deepEqual(h, before); }
for (const n of [NaN, Infinity, -1]) { const before = structuredClone(h); C.passDays(h, n, true, 1, msgs); assert.deepEqual(h, before); }
const med = C.newHero(); med.stage = stage; med.exp = C.need(med) - 1;
C.passDays(med, 1, true, 1, [], 3); assert.equal(med.exp, C.need(med));
const b = C.newHero(); b.bag = [{ id: 'herb_huangjing', n: Number.MAX_SAFE_INTEGER }]; const drops = b.bottle.drops;
assert.equal(C.useBottle(b, b.bag[0]).kind, 'warn'); assert.equal(b.bottle.drops, drops);
b.bag = [{ id: 'pill_huiqi', n: 1, fake: 'toxic', ident: true }]; const hp = b.hp;
assert.equal(C.usePill(b, 'pill_huiqi', []), false); assert.equal(b.hp, hp); assert.equal(b.bag[0].n, 1);

// 全类丹药丹毒与抗药限制：养魂丹/凝魄丹不再无限吃，延寿丹有次数与衰减上限，回气/疗伤连服也会受丹毒折损
{
  // (a) 养魂丹递减、累计丹毒且终生封顶于 SENSE_PILL_CAP，破境后亦不可重刷
  const sh = C.newHero();
  sh.realm = 5; sh.stage = 2;
  sh.bag = [{ id: 'pill_yanghun', n: 50 }, { id: 'pill_ningpo', n: 20 }];
  const s0 = C.heroStats(sh, 'human').sense;
  assert.equal(C.usePill(sh, 'pill_yanghun', []), true);
  const s1 = C.heroStats(sh, 'human').sense;
  assert.ok((sh.pillN ?? 0) >= 1, '服用养魂丹应累积丹毒');
  assert.ok(s1 > s0);
  // 连服直至触发抗性封顶：之后再点服用必须拒绝且不白耗丹药
  let count = 1;
  while (C.usePill(sh, 'pill_yanghun', []) && count < 40) count++;
  assert.ok(count < 25, `养魂丹应在合理次数内达到耐药上限，实际=${count}`);
  const bagLeft = C.bagCount(sh, 'pill_yanghun');
  const maxSenseBeforeRefuse = sh.senseBonus;
  const msgsRefuse: C.Msg[] = [];
  assert.equal(C.usePill(sh, 'pill_yanghun', msgsRefuse), false);
  assert.equal(C.bagCount(sh, 'pill_yanghun'), bagLeft, '达到养魂上限后不再白白消耗丹药');
  assert.equal(sh.senseBonus, maxSenseBeforeRefuse);
  assert.ok(msgsRefuse.some((m) => m.kind === 'warn'));
  // 高一阶的凝魄丹在养魂丹饱和后最多也仅能再勉强挤出极少量提升，很快同样触顶
  let ningpoCount = 0;
  while (C.usePill(sh, 'pill_ningpo', []) && ningpoCount < 10) ningpoCount++;
  assert.ok(ningpoCount <= 5, `凝魄丹在养魂耐药后也应迅速触顶，实际=${ningpoCount}`);
  assert.equal(C.usePill(sh, 'pill_ningpo', []), false);
  assert.ok(C.heroStats(sh, 'human').sense < 20000, `化神后期吃满养魂/凝魄丹神识仍受封顶 (${C.heroStats(sh, 'human').sense})`);
  // 模拟破境清零 pillN 后，终生养魂耐药仍使养魂丹无法重刷
  sh.pillN = 0;
  assert.equal(C.usePill(sh, 'pill_yanghun', []), false);

  // (b) 老档兼容：若旧档 senseBonus 已异常膨胀至 12（>10万神识），无法再吃养魂丹，且面板神识被软上限约束
  const legacy = C.newHero();
  legacy.realm = 5; legacy.stage = 2;
  legacy.senseBonus = 12;
  legacy.bag = [{ id: 'pill_yanghun', n: 5 }];
  assert.equal(C.usePill(legacy, 'pill_yanghun', []), false);
  assert.equal(C.bagCount(legacy, 'pill_yanghun'), 5);
  assert.ok(C.heroStats(legacy, 'human').sense < 40000, '老档超高 senseBonus 在面板上受渐近软上限收敛');

  // (c) 延寿丹/万寿丹：递减生效并在 LIFE_PILL_MAX 后拒绝继续服用
  const lh = C.newHero();
  lh.realm = 4; lh.stage = 0;
  lh.bag = [{ id: 'pill_yanshou', n: 20 }];
  let lifeUsed = 0;
  while (C.usePill(lh, 'pill_yanshou', []) && lifeUsed < 20) lifeUsed++;
  assert.equal(lifeUsed, C.LIFE_PILL_MAX);
  assert.ok(lh.lifeBonus > 20 && lh.lifeBonus < 20 * C.LIFE_PILL_MAX, '延寿丹应随服用次数递减');
  const lifeAtCap = lh.lifeBonus;
  const leftYanshou = C.bagCount(lh, 'pill_yanshou');
  assert.equal(C.usePill(lh, 'pill_yanshou', []), false);
  assert.equal(lh.lifeBonus, lifeAtCap);
  assert.equal(C.bagCount(lh, 'pill_yanshou'), leftYanshou);

  // (d) 战斗回气/疗伤丹：连续猛灌也受短时丹毒折减，调息/流逝日后可缓解
  const hh = C.newHero();
  hh.hp = 0.05;
  hh.bag = [{ id: 'pill_liaoshang', n: 15 }];
  for (let i = 0; i < 8; i++) { hh.hp = 0.05; C.usePill(hh, 'pill_liaoshang', []); }
  const fatiguedHeal = hh.hp - 0.05;
  assert.ok(fatiguedHeal < 0.25, `连吞 8 颗疗伤丹后单颗回血应明显衰减，实际=${fatiguedHeal.toFixed(3)}`);
  C.passDays(hh, 60, true, 1, []);
  hh.hp = 0.05;
  C.usePill(hh, 'pill_liaoshang', []);
  assert.ok(hh.hp - 0.05 > fatiguedHeal, '闭关调息后短时丹毒消退，疗伤药效恢复');
}

console.log('cultivation: invalid values, insight pool, bottleneck, mod hook, time, bottle and pills passed');
