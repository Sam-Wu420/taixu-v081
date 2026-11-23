// 收官 D（甲）：NPC 摆摊（world/stall.ts）——无头测试。
// 摆摊的人和座位按日子稳定、货都是他袋里真有的、买下后货和钱对得上（他少一件多了钱，你反过来）、还价一次、
// 卖给摊主不超过他的身家、掺假与掌眼、装备词条跟着走（摊位买卖、万宝楼寄售撤回领取）、摊位系统自己一个 Math.random 都不取。
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
const { itemDef } = await import('../src/data/items');
const { STALL_MARK } = await import('../src/world/stall');
const { wbZoneOf } = await import('../src/world/wanbao');
const g = await G.createGame(() => {});
g.reset();
const S = g.stall, h = g.hero;
const stones = () => C.bagCount(h, 'mat_lingshi');
let ok = 0; const pass = (s: string) => { ok++; console.log('  ✓ ' + s); };

// 摊位系统自己不取 Math.random：数一数
const rnd0 = Math.random; let calls = 0;
const counting = () => { calls++; return rnd0(); };
const noRandom = <T,>(f: () => T, what: string): T => { calls = 0; Math.random = counting; try { return f(); } finally { Math.random = rnd0; assert.equal(calls, 0, `${what}：不该取 Math.random（取了 ${calls} 次）`); } };

// 1. 摊位点：有集市的大城从 cityLayout.market 导出的 mkt* 锚点
const city = W0.locsOf(W0.ACTIVE_MAP).find((l) => l.type === 'city' && S.seatsOf(l).length >= 8)!;
assert.ok(city, '找得到一座有集市摊位点的大城');
const seats = S.seatsOf(city);
pass(`${city.name}有 ${seats.length} 个摊位点`);
for (const s of seats) assert.ok(Math.hypot(s.x - city.x * W0.WORLD_SCALE, s.y - city.y * W0.WORLD_SCALE) < 40000, '摊位点在城里');

// 2. 谁摆、坐哪：按日子稳定；不取随机数
const day = S.period();   // 集期（一月）
const k1 = noRandom(() => S.keepersAt(city, day), '选摊主'), k2 = noRandom(() => S.keepersAt(city, day), '选摊主');
assert.deepEqual([...k1.entries()], [...k2.entries()], '同一集期选出来的人和座位一样');
const k3 = S.keepersAt(city, day + 1);
pass(`这一集期 ${k1.size} 位摊主，下一集期 ${k3.size} 位（同一集期重算一致）`);
// 人不够就请几位（试玩入口也这么做），保证后面有人可测
for (const d of g.npcs.list) { if (S.keepersAt(city, day).size >= 6) break; if (d.alive && d.realm >= 1 && !d.canon && !d.beauty && d.faction !== 'mortal' && d.faction !== 'demon' && (d.map ?? 'tiannan') === W0.ACTIVE_MAP) S.invite(d, city); }
const keep = S.keepersAt(city, day);
assert.ok(keep.size >= 6, '请来几位后够六位');
for (const s of keep.values()) assert.ok(seats.includes(s), '坐的都是摊位点');
assert.equal(new Set(keep.values()).size, keep.size, '一人一个摊位');

// 3. 人到城里：tick 认出这座城、把不在眼前的摊主请到摊位上
g.teleport(city.x * W0.WORLD_SCALE, city.y * W0.WORLD_SCALE);
noRandom(() => S.tick(1), '每帧 tick');
assert.equal(S.loc?.id, city.id, '认出主角在这座城里');
assert.deepEqual(S.keepers().sort(), [...keep.keys()].sort(), '今天的摊主');
for (const id of S.keepers()) { const d = g.npcs.byId.get(id)!; const s = keep.get(id)!; if (!g.npcs.active.has(id)) assert.ok(Math.hypot(d.x - s.x, d.y - s.y) < 1, '不在眼前的摊主一早就坐到了摊上'); }
pass('主角进城后摊主都在摊位上');
// 摊主坐下（hold）
{
  const id = S.keepers()[0], d = g.npcs.byId.get(id)!;
  const { CharState } = await import('../src/gfx/character');
  const a: any = { d, st: new CharState(d.x, d.y), look: g.npcs.look(d), act: 'idle', t: 0, wait: 0, noticed: 0, hp: 1, bolts: [], allyCd: 1 };
  assert.equal(noRandom(() => S.hold(a, 0.1), '坐摊'), true);
  assert.equal(a.life?.k, 'stall'); assert.equal(a.life?.n, STALL_MARK); assert.equal(a.act, 'sit');
  pass('摊主坐在摊上（life = stall）');
}

// 4. 货：都是他袋里真有的
const keepers = S.keepers().map((id) => g.npcs.byId.get(id)!);
let total = 0;
for (const d of keepers) {
  const gs = S.goods(d);
  for (const x of gs) { if (x.fake) continue; assert.ok((d.bag?.[x.id] ?? 0) >= x.n, `${d.name}摊上的${itemDef(x.id).name}他袋里真有`); assert.ok(x.price > 0 && x.ref > 0); total++; }
  const inf = S.info(d); assert.ok(inf.name.length >= 2 && inf.shout.length >= 3, '有摊名、有吆喝');
}
assert.ok(total > 0, '摊上有货');
pass(`摊上共 ${total} 格真货；摊名例：${keepers.slice(0, 3).map((d) => S.info(d).name).join('、')}`);
// 吆喝换着说、不千篇一律
const shouts = new Set<string>(); for (const d of keepers) for (let t = 0; t < 200; t += 9) shouts.add(S.shout(d, undefined, t));
assert.ok(shouts.size >= 12, `吆喝花样够多（${shouts.size} 种）`);
pass(`吆喝 ${shouts.size} 种`);

// 5. 买：他少一件、多了钱；你反过来
C.addItem(h, 'mat_lingshi', 2_000_000);
const d0 = keepers.find((d) => S.goods(d).some((x) => !x.fake && itemDef(x.id).type !== 'gear'))!;
const gd = S.goods(d0).find((x) => !x.fake && itemDef(x.id).type !== 'gear')!;
const bag0 = d0.bag![gd.id], w0 = d0.wealth, s0 = stones(), have0 = C.bagCount(h, gd.id);
assert.equal(noRandom(() => S.buy(d0, gd), '买'), null);
assert.equal(d0.bag?.[gd.id] ?? 0, bag0 - 1, '摊主袋里少一件');
assert.equal(d0.wealth, w0 + gd.price, '灵石进了摊主的身家');
assert.equal(stones(), s0 - gd.price, '你付了开价');
assert.equal(C.bagCount(h, gd.id), have0 + 1, '东西到了你袋里');
pass(`买下 ${itemDef(gd.id).name}：${gd.price} 灵石，账对得上`);
// 价钱：行情 × 性情系数（贪的比温和的贵）
{
  const ref = 1000, saved = d0.pers;
  d0.pers = 'greedy'; const pg = S.priceOf(d0, ref, 'x'); d0.pers = 'kind'; const pk = S.priceOf(d0, ref, 'x'); d0.pers = saved;
  assert.ok(pg > pk, `贪的开价高（${pg} > ${pk}）`);
  pass(`同一件行情 1000 的货：贪婪开 ${pg}，温和开 ${pk}`);
}

// 6. 还价：一件只许一次；成了便宜一截，砸了不卖
{
  let okOnce = false, failOnce = false;
  for (const d of keepers) for (const x of S.goods(d)) {
    if (x.fake || x.hag) continue;
    const p0 = x.price, f0 = d.favor;
    const r = noRandom(() => S.haggle(d, x), '还价')!;
    assert.ok(r, '能还价');
    assert.equal(S.haggle(d, x), null, '同一件不能还第二次');
    const after = S.goods(d).find((y) => y.key === x.key)!;
    if (r.ok) { assert.ok(after.price < p0, '还价成了便宜一截'); assert.equal(after.hag, 'ok'); okOnce = true; }
    else { assert.equal(after.hag, 'fail'); assert.ok(d.favor <= f0, '砸了他不高兴'); assert.ok(S.buy(d, after)!.includes('不卖'), '砸了这件不卖你'); failOnce = true; }
    if (okOnce && failOnce) break;
  }
  assert.ok(okOnce && failOnce, '成、败两种都见到了');
  pass('还价：成了让利、砸了不卖，每件一次');
}

// 7. 卖给摊主：上限是他的身家
{
  const d = keepers[0];
  C.addItem(h, 'herb_lingzhi', 3);
  const b = h.bag.find((x) => x.id === 'herb_lingzhi')!;
  assert.ok(S.offer(d, b) > 0, '他肯收灵芝');
  d.wealth = 0; const offer0 = S.offer(d, b); d.wealth = offer0 - 1;
  assert.ok(S.sellTo(d, b)!.includes('收不起'), '他身上的灵石不够就收不起');
  d.wealth = offer0 + 500; const offer = S.offer(d, b);
  const s1 = stones(), n1 = d.bag?.herb_lingzhi ?? 0, hn = C.bagCount(h, 'herb_lingzhi');
  assert.equal(noRandom(() => S.sellTo(d, b), '卖给摊主'), null);
  assert.equal(d.wealth, offer0 + 500 - offer, '他付了出价'); assert.equal(stones(), s1 + offer, '你收到灵石');
  assert.equal(d.bag?.herb_lingzhi, n1 + 1, '东西进了他的袋子'); assert.equal(C.bagCount(h, 'herb_lingzhi'), hn - 1);
  pass(`卖一株灵芝给${d.name}：${offer} 灵石，收不起时拒收`);
}

// 8. 掺假与掌眼：贪的散修掺假，神识看破后不让买
{
  const d = keepers.find((x) => x.faction === 'rogue' || x.faction === 'merchant')!;
  delete (S.F.fk as any)[d.id];
  const savedPers = d.pers; d.pers = 'greedy';
  Math.random = () => 0.001; const gs = S.goods(d); Math.random = rnd0; d.pers = savedPers;
  const fk = gs.find((x) => x.fake);
  assert.ok(fk, '摊上掺了一件假货');
  h.mp = 1; Math.random = () => 0.001; const r = S.probe(d, fk!); Math.random = rnd0;
  assert.ok(r.spottedFake, '掌眼看破');
  const fk2 = S.goods(d).find((x) => x.key === fk!.key)!;
  assert.ok(fk2.ident, '看破记住了');
  assert.ok(S.buy(d, fk2)!.includes('假货'), '看破的假货不让买');
  // 没看破就买下：进袋的是假货，钱进摊主口袋
  delete (S.F.fk as any)[d.id]; d.pers = 'greedy';
  Math.random = () => 0.001; const fk3 = S.goods(d).find((x) => x.fake)!; Math.random = rnd0; d.pers = savedPers;
  const w = d.wealth; assert.equal(S.buy(d, fk3), null);
  assert.ok(h.bag.some((b) => b.id === fk3.id && b.fake && b.seller === d.id), '买到的是挂着卖家名字的假货');
  assert.equal(d.wealth, w + fk3.price);
  pass('掺假、掌眼看破、买到假货都照旧');
}

// 9. 装备词条跟着走：卖给他 → 他摊上那件词条一样 → 买回来词条还一样
{
  const d = keepers[1] ?? keepers[0];
  C.addItem(h, 'gear_ring_1', 1);
  const mine = h.bag.filter((b) => b.id === 'gear_ring_1').pop()!;
  const aff = JSON.stringify(mine.affix);
  d.wealth += 100000;
  assert.equal(S.sellTo(d, mine), null);
  assert.ok(!h.bag.includes(mine), '那件离开了你的袋子');
  const onStall = S.goods(d).filter((x) => x.id === 'gear_ring_1');
  const hit = onStall.find((x) => JSON.stringify(x.affix) === aff);
  assert.ok(hit, '摊上那件的词条和你卖的一样');
  assert.equal(noRandom(() => S.buy(d, hit!), '买装备'), null);
  const back = h.bag.filter((b) => b.id === 'gear_ring_1').pop()!;
  assert.equal(JSON.stringify(back.affix), aff, '买回来词条还是那几条');
  pass(`装备词条跟着走：${aff}`);
  // 摊主自己袋里的装备：有的人有，摊上每件各带一份词条
  for (const x of g.npcs.list.filter((x) => x.alive && x.realm >= 1 && x.faction !== 'mortal').slice(0, 40)) noRandom(() => (S as any).stock(x), '给摊主袋里放装备');
  const withGear = g.npcs.list.filter((x) => x.alive && (S as any).F.stocked[x.id] && Object.keys(x.bag ?? {}).some((id) => itemDef(id).type === 'gear'));
  for (const x of withGear) for (const gg of S.goods(x).filter((y) => itemDef(y.id).type === 'gear')) assert.ok(gg.affix && gg.affix.length >= 1, '摊上的装备都带词条');
  assert.ok(withGear.length >= 3, '四十人里总有几位袋里有低阶装备');
  pass(`四十位里 ${withGear.length} 位摊主袋里有低阶装备，每件都带词条`);
  // 近战兵器：行商、散修的摊上偶尔有一件兵器（哈希定、不取随机数），带词条，四品以下
  const more = g.npcs.list.filter((x) => x.alive && x.realm >= 1 && (x.faction === 'merchant' || x.faction === 'rogue')).slice(0, 160);
  for (const x of more) noRandom(() => (S as any).stock(x), '给摊主袋里放兵器');
  const armed = more.filter((x) => Object.keys(x.bag ?? {}).some((id) => id.startsWith('wpn_')));
  for (const x of armed) for (const gg of S.goods(x).filter((y) => y.id.startsWith('wpn_'))) { assert.ok(gg.affix && gg.affix.length >= 1, '摊上的兵器带词条'); assert.ok(itemDef(gg.id).tier <= 3, '摊上的兵器不超过三品'); }
  assert.ok(armed.length >= 5, `一百六十位行商散修里总有几位摊上有兵器（${armed.length}）`);
  const { ruleOf } = await import('../src/data/market');
  assert.ok(ruleOf(itemDef('wpn_heavy_2')).g === 2 && ruleOf(itemDef('wpn_sword_6')).g === 5, '上架规则认得兵器');
  pass(`${armed.length} 位行商散修的摊上有兵器，各带词条`);
}

// 10. 万宝楼寄售装备：挂上、撤下、领回，词条不变
{
  const loc = W0.LOC_BY_ID.get('yuejing')!, W = g.wanbao;
  C.addItem(h, 'gear_belt_2', 1);
  const b = h.bag.filter((x) => x.id === 'gear_belt_2').pop()!, aff = JSON.stringify(b.affix);
  assert.equal(W.consign('gear_belt_2', 1, 9999999, undefined, 15, loc, b), null);
  assert.ok(!h.bag.includes(b), '那件押进了楼里');
  const L = W.mine().find((l) => l.item === 'gear_belt_2')!;
  assert.equal(JSON.stringify(L.affix), aff, '挂单上记着词条');
  W.cancel(L.id); W.collect();
  const back = h.bag.filter((x) => x.id === 'gear_belt_2').pop()!;
  assert.equal(JSON.stringify(back.affix), aff, '撤回领取后词条不变');
  // 穿着的不能挂
  C.wearGear(h, back);
  assert.ok(W.consign('gear_belt_2', 1, 100, undefined, 15, loc, back)?.includes('穿在身上'), '穿着的不能挂');
  pass('万宝楼寄售装备：词条全程跟着走');
}

// 10b. 第六轮返工：NPC 的装备不经摊位离开袋子，词条也跟着走——被劫（living.transfer）、挂到万宝楼寄售、别人从楼里买走、
//      被你杀了储物袋落地再拾起（原来只在摊位上买才带词条，别的路都在新地方按种子重摇）
{
  const L = g.living, W = g.wanbao, loc = W0.LOC_BY_ID.get('yuejing')!, gid = 'gear_ring_1';
  const pool = g.npcs.list.filter((x) => x.alive && x.realm >= 1 && x.faction !== 'mortal' && x.faction !== 'demon' && !x.canon && !keepers.includes(x));
  const [a, b, c] = [pool[0], pool[1], pool[2]];
  for (const x of [a, b, c]) { L.ensure(x); x.wealth += 1e7; delete (x.bag ?? {})[gid]; }
  const listOf = (x: any) => JSON.stringify((S as any).gearList(x, gid));
  // 卖一件给 a（摊位那一路，已有）：记下词条
  C.addItem(h, gid, 1);
  const mine = h.bag.filter((q) => q.id === gid).pop()!, aff = JSON.stringify(mine.affix);
  assert.equal(S.sellTo(a, mine), null);
  assert.ok(listOf(a).includes(aff), 'a 袋里那件记着词条');
  // 被劫：b 劫了 a，东西整个到 b 袋里，词条一样
  const take = noRandom(() => L.transfer(a, b, 0, 99), '劫走（转手）');
  assert.ok(take.items.some(([id]) => id === gid) && (b.bag?.[gid] ?? 0) === 1 && !(a.bag?.[gid]), '那件到了劫道的人袋里');
  assert.ok(listOf(b).includes(aff), `被劫走的装备在新主人袋里词条不变：${listOf(b)}`);
  // 自己挂到万宝楼寄售：挂单上带着词条
  W.npcList(b, gid, 1, loc, () => 0.5);
  const li = W.listingsIn(wbZoneOf(loc)).find((q) => q.seller === b.id && q.item === gid)!;
  assert.ok(li && JSON.stringify(li.affix) === aff, `NPC 挂到楼里的装备挂单上记着词条：${JSON.stringify(li?.affix)}`);
  assert.ok(!(b.bag?.[gid]), '挂出去后袋里没了');
  // 别的 NPC 从楼里买走：进他袋里词条不变
  assert.ok(W.npcBuy(c, gid, 1e9, loc), 'c 从楼里买下');
  assert.ok(listOf(c).includes(aff), `楼里买来的装备在 c 袋里词条不变：${listOf(c)}`);
  // 你杀了 c：储物袋落地，拾起来词条不变
  const loot = L.lootOf(c);
  assert.ok(loot.items.some(([id]) => id === gid) && JSON.stringify(loot.affix[gid]?.[0]) === aff, '落地的储物袋里那件带着词条');
  const p = g.player; h.bag = h.bag.filter((q) => q.id !== gid);
  g.combat.dropLoot(p.x, p.y, gid, 1, loot.affix[gid]);
  for (let i = 0; i < 12 && !h.bag.some((q) => q.id === gid); i++) { if (g.modal) g.closeModal(true); g.paused = false; g.update(0.1); }
  const got = h.bag.find((q) => q.id === gid);
  assert.ok(got && JSON.stringify(got.affix) === aff, `拾起来的装备词条不变：${JSON.stringify(got?.affix)}`);
  pass(`NPC 的装备被劫、挂楼寄售、楼里转手、被杀落地，词条一路跟着走：${aff}`);
}

// 11. 存档：当天的状态在 ws.flags.stall 里，换一天清掉当天的还价、假货
{
  const F = S.F; assert.ok(Object.keys(F.hag).length > 0);
  const json = JSON.parse(JSON.stringify(g.ws.flags.stall)); assert.equal(json.day, day);
  g.day += 30; const F2 = S.F;
  assert.equal(Object.keys(F2.hag).length, 0, '换一个集期还价记录清掉'); assert.ok(Object.keys(F2.stocked).length > 0, '袋里放过装备的记号留着');
  pass('当天状态随存档走，换一天重来');
}
// 12. 第五轮：招牌避让——竖屏 390×844 上界面几乎铺满（人物牌、任务列、地点卡、法诀盘、摇杆），招牌只躲接点击的块，压住了就挪位，
//     找得到空地就一定画（以前压到任何一块界面就整块不画，竖屏一个都画不出来）；只显示的块（消息）压着也行
{
  const { placeSign } = await import('../src/world/stall');
  type Rc = [number, number, number, number];
  const hard: Rc[] = [[8, 8, 180, 80], [250, 8, 382, 120], [8, 130, 238, 190], [16, 400, 374, 520], [140, 530, 250, 570], [8, 700, 132, 836], [170, 600, 382, 836]];
  const soft: Rc[] = [[20, 90, 370, 128]];
  const ov = (a: Rc, q: Rc) => a[0] < q[2] && a[2] > q[0] && a[1] < q[3] && a[3] > q[1];
  // 摊主头顶正好在任务列底下：挪开、不压任何接点击的块、在画面里
  for (const [sx, sy] of [[120, 175], [200, 470], [300, 300], [60, 650], [330, 720]] as [number, number][]) {
    const q = placeSign(sx, sy, 120, 45, 390, 844, hard, soft, []);
    assert.ok(q, `(${sx},${sy}) 找得到地方`);
    assert.ok(!hard.some((h) => ov(q!.r, h)), `(${sx},${sy}) 不压接点击的界面：${q!.r.map(Math.round)}`);
    assert.ok(q!.r[0] >= 4 && q!.r[1] >= 4 && q!.r[2] <= 386 && q!.r[3] <= 840, '在画面里');
  }
  // 原位就空着：不挪
  const q0 = placeSign(300, 320, 100, 40, 390, 844, hard, soft, [])!; assert.equal(q0.moved, false); assert.deepEqual(q0.r.map(Math.round), [250, 280, 350, 320]);
  // 两块招牌互相不压
  const a = placeSign(300, 320, 100, 40, 390, 844, hard, soft, [])!, b = placeSign(305, 322, 100, 40, 390, 844, hard, soft, [a.r]); assert.ok(b && !ov(a.r, b.r), '第二块让开第一块');
  // 只压着消息（soft）也能放：整屏除了消息都被接点击的块占满
  const full: Rc[] = [[0, 0, 390, 300], [0, 360, 390, 844]];
  const q2 = placeSign(195, 340, 120, 40, 390, 844, full, [[0, 300, 390, 360]], []); assert.ok(q2 && !full.some((h) => ov(q2.r, h)), '压着只显示的块也画');
  // 真没地方：不画（返回 null）
  assert.equal(placeSign(195, 340, 120, 40, 390, 844, [[0, 0, 390, 844]], [], []), null);
  pass('招牌避让：只躲接点击的界面、挪位找空地、互不压');
}
console.log(`PASS 摆摊：${ok} 项`);
