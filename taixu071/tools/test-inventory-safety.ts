import assert from 'node:assert/strict';
import './env';
(globalThis as any).window = { innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const C = await import('../src/world/cultivation');
const { Towns } = await import('../src/world/town');
const { validateSaveForLoad, validateSaveNumbers } = await import('../src/world/saveGuard');
const h = C.newHero(); h.bag = [];
let notices = 0; const f = () => notices++; C.itemListeners.push(f);
try {
  for (const bad of [NaN, Infinity, -1, 1.2, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(C.addItem(h, 'mat_lingshi', bad), false);
    assert.equal(C.addFakeItem(h, 'pill_huiqi', bad, 'toxic'), false);
    assert.equal(C.removeItem(h, 'mat_lingshi', bad), 0);
  }
  assert.equal(notices, 0); assert.deepEqual(h.bag, []);
  assert.ok(C.addItem(h, 'mat_lingshi', Number.MAX_SAFE_INTEGER));
  assert.equal(C.addItem(h, 'mat_lingshi', 1), false);
  assert.equal(C.bagCount(h, 'mat_lingshi'), Number.MAX_SAFE_INTEGER);
  // 巨量消耗不逐个物品创建数组，且精确返回实际移除数。
  assert.equal(C.removeItem(h, 'mat_lingshi', Number.MAX_SAFE_INTEGER - 100), Number.MAX_SAFE_INTEGER - 100);
  assert.equal(C.bagCount(h, 'mat_lingshi'), 100);
  assert.ok(C.addItem(h, 'herb_huangjing', 2, 500)); assert.ok(C.addItem(h, 'herb_huangjing', 3, 20));
  assert.equal(C.bagCount(h, 'herb_huangjing'), 5); assert.equal(h.bag.find(x => x.id === 'herb_huangjing')?.age, undefined);
  assert.ok(C.addFakeItem(h, 'pill_huiqi', 2, 'toxic', 'seller'));
  assert.equal(C.removeItem(h, 'pill_huiqi', 1), 1); assert.equal(C.takeLastFake()?.fake, 'toxic');
  h.bag.push({ id: 'pill_huiqi', n: 2, fake: 'toxic', ident: true });
  assert.equal(C.removeItem(h, 'pill_huiqi', 3), 1); assert.equal(h.bag.find(x => x.ident)?.n, 2);
  assert.equal(C.canAddItem(h, 'pill_huiqi', Number.MAX_SAFE_INTEGER), false);
  const base: any = { day: 1, clock: 1, p: { x: 1, y: 1 }, hero: { ...h, bag: [{ id: 'mat_lingshi', n: Number.MAX_SAFE_INTEGER }, { id: 'mat_lingshi', n: 1 }] } };
  assert.throws(() => validateSaveNumbers(base)); assert.throws(() => validateSaveForLoad(base, ['tiannan'], 300));
  const warnings: string[] = []; const game: any = { hero: h, ws: {}, toast: (s: string) => warnings.push(s), jianghu: { credSellMul: () => 1 } };
  const town = new Towns(game), stock: any = { id: 'pill_huiqi', n: 1, price: 10 }, shop: any = { stock: [stock], sellRate: 0.5, zone: 'TN' };
  assert.equal(town.buy(shop, stock), true); assert.equal(C.bagCount(h, 'mat_lingshi'), 90); assert.equal(C.bagCount(h, 'pill_huiqi'), 1);
  assert.equal(town.buy(shop, stock), false); assert.equal(C.bagCount(h, 'mat_lingshi'), 90);
  const free: any = { id: 'pill_huiqi', n: 1, price: -10 }; shop.stock.push(free);
  assert.equal(town.buy(shop, free), false); assert.equal(C.bagCount(h, 'mat_lingshi'), 90);
  h.bag = [{ id: 'pill_huiqi', n: 1, fake: 'toxic', ident: true }, { id: 'mat_lingshi', n: 90 }];
  assert.equal(town.sell(shop, 'pill_huiqi'), false); assert.equal(C.bagCount(h, 'mat_lingshi'), 90);
  h.bag = [{ id: 'pill_huiqi', n: 1 }, { id: 'mat_lingshi', n: Number.MAX_SAFE_INTEGER }];
  assert.equal(town.sell(shop, 'pill_huiqi'), false); assert.equal(C.bagCount(h, 'pill_huiqi'), 1);
  h.bag[1].n = 100; assert.equal(town.sell(shop, 'pill_huiqi'), true); assert.equal(C.bagCount(h, 'pill_huiqi'), 0); assert.ok(C.bagCount(h, 'mat_lingshi') > 100);
} finally { C.itemListeners.splice(C.itemListeners.indexOf(f), 1); }
console.log('inventory: safe counts, huge bulk removal, fake items, load/write limits and real shop buy/sell regression passed');
