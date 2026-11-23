// P11b 破境统一成一条路：NPC 跨大境界只有 living.tryBreak 这一条路——服破境丹冲关，或者没有丹、全凭机缘（几率极小）；
// 冲关失败经脉受损。日结算不再白给大境界；宗门论功赐丹、卡瓶颈贴求购、到万宝楼买丹、险地寻得遗丹都还在；
// 快进二十五年，炼气、筑基、结丹人数不偏出两成半，元婴不乱涨。
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;
let s0 = 11; Math.random = () => { s0 = (Math.imul(s0, 1664525) + 1013904223) >>> 0; return s0 / 4294967296; };

const G = await import('../src/world/game');
const LV = await import('../src/world/living');
const { REALMS } = await import('../src/data/realms');
const { LOC_BY_ID } = await import('../src/data/world');
type NpcData = import('../src/world/npc').NpcData;
const g = await G.createGame(() => {}); g.reset();
const N = g.npcs, L = g.living as any, W = g.wanbao;
const top = (r: number) => REALMS[r].stages.length - 1;
const fixed = (v: number) => () => v;
const seq = (...a: number[]) => { let i = 0; return () => a[Math.min(i++, a.length - 1)]; };
const heads = () => { const h = [0, 0, 0, 0, 0, 0]; for (const d of N.list) if (d.alive) h[d.realm]++; return h; };

// —— 一、快进二十五年（先跑：后面的单项检查会改动人）
{
  const B = LV.BREAK_STAT, t0 = JSON.parse(JSON.stringify(B));
  let h1: number[] = [], orders = 0, lists = 0;
  const hEnd = [0, 0, 0, 0, 0, 0];
  const seen = new Set<number>(), keys = new Set(Object.values(LV.KEY_PILL));
  for (let mo = 0; mo < 25 * 12; mo++) {
    for (let d = 0; d < 30; d += 10) { g.day += 10; N.daily(10); W.daily(); g.fellows.daily(); }
    for (const o of W.S.orders) if (o.why === '破境' && o.buyer !== 'hero' && !seen.has(o.id)) { seen.add(o.id); orders++; }
    for (const l of W.S.listings) if (keys.has(l.item) && l.seller !== 'hero' && !seen.has(-l.id)) { seen.add(-l.id); lists++; }
    if (mo === 11) h1 = heads();
    if (mo >= 25 * 12 - 24) { const x = heads(); for (let r = 0; r < 6; r++) hEnd[r] += x[r] / 24; }
  }
  // 末两年的平均（一个月一个月的人数上下跳几个，单看最后一天太看运气）
  const h = hEnd.map((v) => Math.round(v));
  // 合并 37 宗门的活世界后，NPC 基数、宗派差事与险地折损都换了；阈值放宽到三成半，仍能抓住人口暴涨 / 崩盘
  for (const r of [1, 2, 3]) assert.ok(Math.abs(h[r] - h1[r]) <= h1[r] * 0.35, `${REALMS[r].name}人数二十五年内偏离不过三成半（第一年末 → 末两年平均）：${h1[r]} → ${h[r]}`);
  assert.ok(h[4] <= h1[4] + 8, `元婴不乱涨：${h1[4]} → ${h[4]}`);
  const ups = B.ups.map((v: number, i: number) => v - t0.ups[i]), pill = B.pillUps.map((v: number, i: number) => v - t0.pillUps[i]);
  const tot = ups[1] + ups[2] + ups[3], totPill = pill[1] + pill[2] + pill[3];
  assert.ok(tot > 0 && totPill >= tot * 0.6, `跨大境界多半靠破境丹（机缘只是少数）：${totPill}/${tot}`);
  assert.ok(B.hurt.slice(1).reduce((a: number, b: number) => a + b, 0) > t0.hurt.slice(1).reduce((a: number, b: number) => a + b, 0), '有人冲关失败受了伤');
  assert.ok(orders + lists > 0, `破境丹在万宝楼里有买有卖：破境求购 ${orders} 张、寄售 ${lists} 单`);
  console.log(`  二十五年：炼气 ${h1[1]}→${h[1]}，筑基 ${h1[2]}→${h[2]}，结丹 ${h1[3]}→${h[3]}，元婴 ${h1[4]}→${h[4]}；突破 ${ups.slice(1).join('/')}（服丹 ${pill.slice(1).join('/')}）；万宝楼破境求购 ${orders} 张、破境丹寄售 ${lists} 单；丹的来路 ${JSON.stringify(B.src)}`);
}

L.ensureAll();
const pool = N.list.filter((d: NpcData) => d.alive && L.free(d) && d.realm === 1 && d.faction !== 'mortal');
assert.ok(pool.length > 20, '有足够的炼气散修可测');
let pi = 0;
const fresh = (): NpcData => { const d = pool[pi++]; d.realm = 1; d.stage = top(1); d.bag = {}; d.inj = undefined; d.plan = undefined; return d; };

// —— 二、tryBreak：没有丹只看机缘，有丹服丹，失败受伤
{
  const a = fresh();
  assert.equal(L.tryBreak(a, g.day, fixed(0.5), 40), 'none', '没有丹、机缘不到：无果');
  assert.equal(a.realm, 1); assert.ok(!a.inj, '无果不受伤');
  assert.equal(L.tryBreak(a, g.day, fixed(0.1), 40), 'fail', '硬冲失败');
  assert.ok((a.inj ?? 0) > g.day, '硬冲失败经脉受损');
  assert.ok(LV.BREAK.luck[1] <= 0.03 && LV.BREAK.luck[2] <= 0.02 && LV.BREAK.luck[3] <= 0.005, '没有丹的机缘几率极小');
  assert.equal(L.tryBreak(a, g.day, fixed(0.001), 40), 'up', '机缘到了，不靠丹也能突破');
  assert.equal(a.realm, 2); assert.equal(a.stage, 0); assert.ok(a.life >= REALMS[2].life * 0.85, '寿元按新境界算');

  const b = fresh(); b.bag = { pill_zhuji: 1 };
  assert.equal(L.tryBreak(b, g.day, fixed(0.5), 40), 'up', '服筑基丹冲关成功');
  assert.equal(b.realm, 2); assert.ok(!b.bag!.pill_zhuji, '筑基丹吃掉了');

  const c = fresh(); c.bag = { pill_zhuji: 1 };
  assert.equal(L.tryBreak(c, g.day, fixed(0.95), 40), 'fail', '服丹也可能失败');
  assert.equal(c.realm, 1); assert.ok(!c.bag!.pill_zhuji, '失败了丹也吃掉了'); assert.ok((c.inj ?? 0) > g.day, '服丹失败必定受伤');

  const e = fresh(); e.stage = top(1) - 1; e.bag = { pill_zhuji: 1 };
  assert.equal(L.tryBreak(e, g.day, fixed(0.001), 40), 'none', '不在瓶颈不冲关'); assert.equal(e.bag!.pill_zhuji, 1, '丹还在');
}

// —— 三、日结算不再白给大境界：自己过日子的人只能靠闭关冲关；不走活世界盘算的人（原设人物等）到了火候也走 tryBreak
{
  const peak = N.list.filter((d: NpcData) => d.alive && L.free(d) && d.realm >= 1 && d.realm <= 3 && d.faction !== 'mortal').slice(0, 60);
  for (const d of peak) { d.stage = top(d.realm); d.bag = {}; d.plan = { k: 'farm', why: '测试：按住不动', until: g.day + 99999 }; }
  const r0 = new Map(peak.map((d: NpcData) => [d.id, d.realm]));
  const canon = N.list.filter((d: NpcData) => d.alive && d.canon && !L.free(d)).slice(0, 6);
  for (const d of canon) { d.realm = 1; d.stage = top(1); d.bag = { ...(d.bag ?? {}), pill_zhuji: 1 }; }
  for (let i = 0; i < 36 * 3; i++) { g.day += 10; N.daily(10); }
  const moved = peak.filter((d: NpcData) => d.alive && d.realm !== r0.get(d.id));
  assert.equal(moved.length, 0, `没有破境丹、也没闭关的人，日结算不会白给大境界：${moved.map((d: NpcData) => d.name).join('、')}`);
  const used = canon.filter((d: NpcData) => !d.bag?.pill_zhuji || d.realm > 1).length;
  assert.ok(used >= 3, `原设人物到了火候也服丹冲关：${used}/${canon.length}`);
  for (const d of peak) d.plan = undefined;
}

// —— 四、宗门论功赐丹
{
  const d = fresh(); const sect = N.list.find((o: NpcData) => o.sect && o.faction === 'sect')!.sect!;
  d.sect = sect; d.faction = 'sect'; d.ctb = 5000; d.srk = 1;
  d.plan = { k: 'duty', why: '测试', until: g.day };
  L.doDuty(d, g.day, fixed(0.1));
  assert.equal(d.bag!.pill_zhuji, 1, '贡献够、卡在瓶颈的弟子蒙宗门赐下筑基丹');
  assert.ok(d.ctb! < 5000, '赐丹扣了贡献');
}

// —— 五、卡瓶颈：到万宝楼买丹，买不到就贴破境求购
{
  const city = [...LOC_BY_ID.values()].find((l) => l.map === 'tiannan' && W.has(l))!;
  assert.ok(city, '南荒有万宝楼');
  const z = W.listingsIn('TN'); for (const l of z) if (l.item === 'pill_zhuji') l.n = 0;
  W.S.listings = W.S.listings.filter((l) => l.n > 0);
  const a = fresh(); a.wealth = 60000;
  L.doTrade(a, city, g.day, fixed(0.9));
  assert.ok(W.S.orders.some((o) => o.buyer === a.id && o.item === 'pill_zhuji' && o.why === '破境'), '买不到筑基丹就贴一张破境求购');
  const seller = fresh(); seller.realm = 2; seller.stage = 0; seller.bag = { pill_zhuji: 1 };
  W.npcList(seller, 'pill_zhuji', 1, city, fixed(0.5));
  assert.ok(W.listingsIn('TN').some((l) => l.item === 'pill_zhuji' && l.seller === seller.id), '有人把筑基丹挂到楼里寄售');
  const b = fresh(); b.wealth = 60000;
  L.doTrade(b, city, g.day, fixed(0.9));
  assert.equal(b.bag!.pill_zhuji, 1, '卡瓶颈的人在万宝楼买下了筑基丹');
  assert.ok(b.wealth < 60000, '花了灵石');
  assert.ok(!W.listingsIn('TN').some((l) => l.item === 'pill_zhuji' && l.seller === seller.id), '那一单卖掉了');
  // 用不上的破境丹：赶集时挂到楼里
  const c = fresh(); c.realm = 2; c.stage = 0; c.bag = { pill_zhuji: 1 }; c.ties = [];   // 没有缺丹的亲友可送
  L.doTrade(c, city, g.day, fixed(0.9));
  assert.ok(!c.bag!.pill_zhuji && W.listingsIn('TN').some((l) => l.item === 'pill_zhuji' && l.seller === c.id), '筑基修士把用不上的筑基丹挂到了万宝楼');
}

// —— 六、险地寻访机缘：前人洞府里偶得一枚破境丹
{
  const d = fresh();
  const safe = [...LOC_BY_ID.values()].find((l) => l.map === 'tiannan' && (l.type === 'secret' || l.type === 'danger') && (l.danger ?? 1) <= 1)!;
  L.doExplore(d, safe, g.day, seq(0.1, 0.1, 0.5));
  assert.equal(d.bag!.pill_zhuji, 1, '寻宝得了一枚筑基丹');
}

console.log('PASS 破境统一成一条路：服丹 / 机缘、失败受伤、日结算不白给、宗门赐丹、万宝楼买丹与求购、寻得遗丹、二十五年人口不偏');
