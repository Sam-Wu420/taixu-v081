// P11 万宝楼（world/wanbao.ts）：开张有货；你买、寄售、交货、贴求购、撤单、领取，灵石一笔笔对得上（成交抽一成）；
// NPC 的货卖掉才有钱；跑几个月 NPC 照常过日子，楼里一直有货、行情会动、没有谁的身家变成 NaN 或负数；随存档走。
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;

const G = await import('../src/world/game');
const C = await import('../src/world/cultivation');
const W0 = await import('../src/data/world');
const { WANBAO, wbZoneOf } = await import('../src/world/wanbao');
const g = await G.createGame(() => {});
g.reset();
const W = g.wanbao, h = g.hero, loc = W0.LOC_BY_ID.get('yuejing')!, z = wbZoneOf(loc);
const stones = () => C.bagCount(h, 'mat_lingshi');
assert.ok(W.has(loc), '梁京有万宝楼'); assert.equal(z, 'TN');
assert.ok(!W.has(W0.LOC_BY_ID.get('qingniu')!), '白石镇这种小镇没有');

// 1. 开张：各地 NPC 的货挂上来
W.daily();
const open = W.listingsIn(z);
assert.ok(open.length > 50, `开张就有货：${open.length}`);
assert.ok(open.every((l) => l.seller !== 'hero' && g.npcs.byId.get(l.seller)), '都是真实存在的 NPC 挂的');
assert.ok(W.listingsIn('LX').length > 10 && W.listingsIn('DJ').length > 10, '沧溟海、中州也各有一座楼的货');

// 2. 买：付挂单价，卖家拿九成，楼抽一成
C.addItem(h, 'mat_lingshi', 100000);
const L = open.slice().sort((a, b) => a.price - b.price)[0], seller = g.npcs.byId.get(L.seller)!;
const s0 = stones(), w0 = seller.wealth, have0 = C.bagCount(h, L.item), fee0 = W.S.ledger.fee;
assert.equal(W.buy(L.id, 1), null);
assert.equal(stones(), s0 - L.price, '付了挂单价');
assert.equal(C.bagCount(h, L.item), have0 + 1, '东西到手');
assert.equal(seller.wealth, w0 + L.price - Math.round(L.price * WANBAO.fee), '卖家拿九成');
assert.equal(W.S.ledger.fee, fee0 + Math.round(L.price * WANBAO.fee), '楼抽一成记账');
assert.ok(W.buy(L.id, 999) === null || L.n === 0, '买多了按剩下的算');

// 3. 寄售：东西离开袋子；有人买就记进待领；撤单把货退回待领；领取
C.addItem(h, 'herb_lingzhi', 5);
const ref = W.ref(z, 'herb_lingzhi');
assert.equal(W.consign('herb_lingzhi', 5, Math.round(ref * 0.5), undefined, 15, loc), null);
assert.equal(C.bagCount(h, 'herb_lingzhi'), 0, '五株都押进楼里');
const mine = W.mine()[0]; assert.ok(mine && mine.n === 5 && mine.seller === 'hero');
for (let i = 0; i < 40 && W.mine().length && W.mine()[0].n === 5; i++) { g.day += WANBAO.tick; W.match(); }
const sold = 5 - (W.mine()[0]?.n ?? 0);
assert.ok(sold > 0, '半价挂的灵草有人来买');
const expect = (() => { let v = 0; for (const x of W.S.log) { const m = x.text.match(/得 (\d+) 灵石/); if (m) v += Number(m[1]); } return v; })();
assert.equal(W.S.payout, expect, '待领的灵石与成交记录对得上');
if (W.mine()[0]) { const left = W.mine()[0].n; W.cancel(W.mine()[0].id); assert.ok(W.S.returned.some((r) => r.item === 'herb_lingzhi' && r.n === left), '撤单的货退回待领'); }
const s1 = stones(), pay = W.S.payout; const got = W.collect();
assert.equal(stones(), s1 + pay, '领到寄售所得'); assert.equal(got.stones, pay);
assert.equal(W.S.payout, 0); assert.equal(W.S.returned.length, 0);

// 4. 求购：NPC 贴的你能交货（得九成）；你贴的出价先押着，撤了退回
const npc = g.npcs.list.find((d) => d.alive && d.realm >= 1 && W0.LOC_BY_ID.get(d.home) && wbZoneOf(W0.LOC_BY_ID.get(d.home)!) === 'TN')!;
npc.wealth = 5000;
W.npcOrder(npc, 'pill_liaoshang', '疗伤', W0.LOC_BY_ID.get(npc.home)!, () => 0.5);
const O = W.ordersIn(z).find((o) => o.buyer === npc.id)!;
assert.ok(O, 'NPC 贴出了求购'); assert.ok(npc.wealth < 5000, '出价押在楼里');
C.addItem(h, 'pill_liaoshang', 1);
const s2 = stones(); assert.equal(W.fill(O.id, 1), null);
assert.equal(stones(), s2 + O.price - Math.round(O.price * WANBAO.fee), '交货得出价的九成');
assert.ok((npc.bag?.pill_liaoshang ?? 0) >= 1, '求购人收到了货');
const s3 = stones(); assert.equal(W.post('pill_zhuji', 1, 3000, 30, loc), null);
assert.equal(stones(), s3 - 3000, '你贴的求购押了出价');
W.unpost(W.myOrders()[0].id); W.collect(); assert.equal(stones(), s3, '撤了押金退回');

// 5. 跑四个月：NPC 照常过日子、挂货卖货；楼里一直有货；行情动了；身家都是正常的数
const day0 = g.day;
for (let d = 0; d < 120; d += 3) { g.day = day0 + d; g.npcs.daily(3); W.daily(); }
const after = W.listingsIn(z).length;
assert.ok(after > 20, `四个月后楼里仍有货（NPC 不断挂新货）：${after}`);
assert.ok(W.S.ledger.trades > 3, `有成交：${W.S.ledger.trades}`);
assert.ok(Object.keys(W.S.idx).length > 0, '行情动了');
for (const v of Object.values(W.S.idx)) assert.ok(v >= WANBAO.idxMin && v <= WANBAO.idxMax);
assert.ok(g.npcs.list.every((d) => Number.isFinite(d.wealth) && d.wealth >= 0), '没有谁的身家变成 NaN 或负数');
assert.ok(W.S.listings.length <= WANBAO.maxListings * 6 && W.S.orders.length <= WANBAO.maxOrders * 6, '挂单、求购有上限');

// 6. 随存档走
const n = W.S.listings.length, seq = W.S.seq;
assert.ok(g.save(1)); assert.ok(g.load('taixu_save_1'));
assert.equal(g.wanbao.S.listings.length, n); assert.equal(g.wanbao.S.seq, seq);
console.log(`PASS 万宝楼：开张南荒 ${open.length} 单；买、寄售（半价 ${sold} 株有人买）、撤单、领取、交货、贴求购、撤求购的灵石都对得上；四个月后仍有 ${after} 单、成交 ${W.S.ledger.trades} 笔、抽成 ${W.S.ledger.fee}、滞销收购 ${W.S.ledger.buyout}；随存档走`);
