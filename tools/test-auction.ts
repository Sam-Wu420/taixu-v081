// P11d 拍卖会（world/auction.ts）：竞价的是价区里真实的 NPC；NPC 拍下从自己（代宗门的连同门）身上扣钱、东西进储物袋，
// 寄拍人拿九成、拍卖行抽成记出水口；你没去的那一季季末照样结算；托照旧能被神识看穿；你抢走别人急需的东西会结仇，出城后来截你的是他。
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;
let s0 = 11; Math.random = () => { s0 = (Math.imul(s0, 1664525) + 1013904223) >>> 0; return s0 / 4294967296; };

const G = await import('../src/world/game');
const W0 = await import('../src/data/world');
const E = await import('../src/world/econ');
const { wbZoneOf } = await import('../src/world/wanbao');
const { needOf, AuctionSys } = await import('../src/world/auction');
const C = await import('../src/world/cultivation');
const g = await G.createGame(() => {}); g.reset();
const A = g.auction;
E.ECON.on = true; E.ECON.f = {};
const ok = (c: unknown, m: string) => { assert.ok(c, m); console.log('  ✓', m); };

// 1. 入座的是梁京所在价区、同一张图上真实的修士
const day0 = Math.floor(g.day / 90) * 90;
g.day = day0 + 81; A.S.q = Math.floor(g.day / 90);
const yj = W0.LOC_BY_ID.get('yuejing')!;
const h = A.house(yj);
ok(h.seats.length >= 6 && h.seats.length <= 12, `梁京入座 ${h.seats.length} 位（6–12）`);
ok(h.seats.every((s) => { const d = g.npcs.byId.get(s.id); return d && d.alive && d.realm >= 1 && (d.map ?? 'tiannan') === yj.map && wbZoneOf(W0.LOC_BY_ID.get(d.home)) === wbZoneOf(yj); }), '每位都是价区里活着的修士（同图）');
ok(h.seats.some((s) => s.max.some((m) => m > 0)), '有人对拍品有心理价位');
ok(h.seats.every((s) => s.max.every((m, i) => m === 0 || m >= h.lots[i].base)), '心理价位要么不出，要么够得上底价');
ok(h.lots.every((l) => l.from && g.npcs.byId.get(l.from)), '每件拍品都有寄拍人（真实 NPC）');
ok(A.house(yj) === h, '同一季同一座城是同一场');
// 一季只去一处
const others = W0.ALL_LOCATIONS.filter((l) => g.towns.isMajorTown(l) && l.id !== 'yuejing' && l.map === 'tiannan').map((l) => A.house(l));
const seen = new Set(h.seats.map((s) => s.id));
ok(others.every((o) => o.seats.every((s) => !seen.has(s.id))), '同一季里一个人只去一处拍卖会');

// 2. 有急需的：卡在筑基瓶颈、没有降尘丹的，冲着降尘丹来，出价高过合用的人
{
  const L = W0.LOC_BY_ID.get('jiayuan')!;
  const q = Math.floor(g.day / 90) + 7;   // 一季没人碰过的
  const lots = g.towns.auctionLots(L, q);
  const d = g.npcs.list.find((x) => x.alive && x.realm === 2 && !x.canon && (x.map ?? 'tiannan') === 'tiannan' && wbZoneOf(W0.LOC_BY_ID.get(x.home)) === wbZoneOf(L) && !A.S.seated[x.id])!;
  g.living.ensure(d);
  d.stage = 99; d.stage = (await import('../src/data/realms')).REALMS[2].stages.length - 1; d.wealth = 60000; delete d.bag!.pill_jiangchen;
  lots[0] = { id: 'pill_jiangchen', base: 2000, price: 2000 };
  (g.towns as any).auctionLots = () => lots;
  const hj = A.house(L, q);
  (g.towns as any).auctionLots = Object.getPrototypeOf(g.towns).auctionLots;
  const s = hj.seats.find((x) => x.id === d.id);
  ok(s && s.why === '破境' && s.max[0] > 2000 * 1.8, `卡在瓶颈的${d.name}冲着降尘丹来（来意 ${s?.why}，心理价 ${s?.max[0]}）`);
  delete A.S.houses[hj.key];
}

// 3. NPC 之间竞价：赢家从自己身上扣钱，东西进储物袋；寄拍人拿九成；拍卖行抽成记出水口
{
  const i = h.lots.findIndex((l, k) => h.seats.some((s) => A.limit(s, k) >= l.base));
  ok(i >= 0, '梁京有件拍品有人出得起');
  // 先把前面的流掉
  while (h.cur < i) { h.live.lead = null; A.hammer(h); }
  const lot = h.lots[i];
  const before = new Map(h.seats.map((s) => [s.id, g.npcs.byId.get(s.id)!.wealth]));
  const from = g.npcs.byId.get(lot.from!)!, fromW = from.wealth;
  const f0 = E.ECON.f.auction ?? 0;
  let bids = 0;
  for (let t = 0; t < 200; t++) { const e = A.npcAct(h); if (e.k === 'bid') bids++; if (e.k === 'none') break; }
  ok(bids >= 1 && h.live.lead && h.live.lead !== 'me', `NPC 举了 ${bids} 次牌，${A.seat(h, h.live.lead)?.name}领先 ${h.live.price}`);
  const winner = A.seat(h, h.live.lead)!, wd = g.npcs.byId.get(winner.id)!, bag0 = wd.bag?.[lot.id] ?? 0, price = h.live.price;
  ok(price <= winner.max[i], '成交价不超过他的心理价位');
  const r = A.hammer(h);
  ok(r.k === 'npc' && lot.done === 'lost' && lot.whoId === winner.id, `落槌：${lot.id} 归 ${winner.name}，${r.price} 灵石`);
  ok((wd.bag?.[lot.id] ?? 0) === bag0 + 1, '东西进了他的储物袋');
  const paidBy = [...before].reduce((a, [id, w0]) => a + (w0 - g.npcs.byId.get(id)!.wealth), 0);
  if (!winner.pool) ok(before.get(winner.id)! - wd.wealth === r.price, '灵石从他自己身上扣（不多不少）');
  else ok(r.price > 0, `代宗门出价：同门凑了钱（本人掏 ${before.get(winner.id)! - wd.wealth}）`);
  // 赢家代宗门出价、寄拍人又恰是他同门时：寄拍人既凑了份子、又收到九成货款，净得比九成少一截（账是平的）
  const cut = Math.floor(r.price * (1 - AuctionSys.FEE)), gain = from.wealth - fromW, mate = !!winner.pool && !!from.sect && from.sect === wd.sect;
  ok(gain === cut || from.id === winner.id || (mate && gain > 0 && gain < cut), `寄拍人${from.name}拿到九成（${gain}${mate ? '，同门凑份子扣了 ' + (cut - gain) : ''}）`);
  const sink = (E.ECON.f.auction ?? 0) - f0;
  ok(sink < 0 && Math.abs(sink + r.price - Math.floor(r.price * (1 - AuctionSys.FEE))) <= 1, `总账记了拍卖行抽成（${sink}）`);
  void paidBy;
}

// 4. 你出价、托跟价、神识看穿；你拍下后谁记着你
{
  // 找一件你出得起、场上有人真心想要的
  while (!h.settled && !h.seats.some((s) => s.max[h.cur] > 0)) { h.live.lead = null; A.hammer(h); }
  if (!h.settled) {
    const i = h.cur, lot = h.lots[i];
    C.addItem(g.hero, 'mat_lingshi', 500000);
    // 托：安排在这件上
    const shill = h.seats.find((s) => s.max[i] === 0) ?? h.seats[h.seats.length - 1];
    lot.shill = shill.name; lot.shillId = shill.id; lot.shillOut = false; lot.exposed = false;
    const fan = h.seats.find((s) => s.id !== shill.id && s.max[i] > 0)!;
    fan.why = '破境'; const fd = g.npcs.byId.get(fan.id)!; fd.pers = 'arrogant'; fd.grudge = 0; fd.favor = 0;
    g.hero.realm = fd.realm; g.hero.stage = fd.stage;
    ok(A.playerBid(h, lot.base - 10) !== null, '低于眼下最少要出的价，不让举牌');
    ok(A.playerBid(h, needOf(lot, h.live)) === null && h.live.lead === 'me', '你举牌，领先');
    let shillBids = 0;
    for (let t = 0; t < 60; t++) {
      const e = A.npcAct(h);
      if (e.k === 'bid' && e.shill) shillBids++;
      if (h.live.lead !== 'me') { const p = needOf(lot, h.live); A.playerBid(h, p); }
      // 托每一轮有一成的可能愣一下不跟（jianghu.shillBid），那一轮没人出价不等于他收手了：等他真收手（抬到 2.2 倍底价）或多等几轮
      if (e.k === 'none' && h.live.lead === 'me' && (lot.shillOut || t >= 12)) break;
    }
    ok(shillBids >= 1, `托跟着你抬价（${shillBids} 次）`);
    g.hero.mp = 1; g.hero.realm = Math.max(g.hero.realm, 4);
    let found = false; for (let t = 0; t < 12 && !found; t++) { g.hero.mp = 1; found = g.jianghu.scanShill(lot).found; }
    ok(found && lot.exposed, '神识扫视全场看穿托');
    ok(g.jianghu.shillBid(lot) === null, '看穿后托不再抬价');
    g.hero.realm = fd.realm; g.hero.stage = fd.stage;   // 境界相近的仇家才会追出城
    fan.bid[i] = true; fan.max[i] = Math.max(fan.max[i], lot.base * 3);
    if (h.live.lead !== 'me') A.playerBid(h, needOf(lot, h.live));
    const money0 = C.bagCount(g.hero, 'mat_lingshi'), price = h.live.price;
    delete g.ws.flags.auctionMark; delete g.ws.flags.auctionLoser;
    const r = A.hammer(h);
    ok(r.k === 'me' && lot.done === 'won' && money0 - C.bagCount(g.hero, 'mat_lingshi') === price && C.bagCount(g.hero, lot.id) >= 1, `你以 ${price} 灵石拍下`);
    ok(fd.favor < 0 && (fd.grudge ?? 0) > 0 && /拍卖会/.test(fd.why ?? ''), `${fd.name}（傲慢、急需）好感降到 ${fd.favor}，结了仇：${fd.why}`);
    ok(g.ws.flags.auctionMark === g.day && g.ws.flags.auctionLoser === fd.id, '「被盯上」记下了，来截你的是他');
    // 出城后：来截你的就是他
    let hunted: string | undefined;
    const start0 = g.rel.startHunt.bind(g.rel);
    (g.rel as any).startHunt = (d: any) => { hunted = d.id; return true; };
    fd.map = W0.ACTIVE_MAP; fd.vow = false; fd.bond = undefined; fd.chasing = false; fd.stay = false;
    const t = A.tailLoser();
    (g.rel as any).startHunt = start0;
    ok(t && hunted === fd.id, `出城后尾随而来的是拍卖会上输给你的${fd.name}`);
  } else console.log('  （梁京这一季没有能测出价的拍品，跳过）');
}

// 5. 你没去的那一季：季末一并结算，NPC 照样买走东西、总账看得到
{
  E.ECON.f = {};
  const q = Math.floor(g.day / 90);
  for (const k of Object.keys(A.S.houses)) delete A.S.houses[k];
  A.S.seated = {};
  g.day = (q + 1) * 90 + 3;
  A.daily();
  ok(A.S.q === q + 1 && Object.keys(A.S.houses).length === 0, '过了一季：上一季结算完、清掉');
  ok((E.ECON.f.auction ?? 0) < 0, `季末结算记了出水口（${E.ECON.f.auction}）`);
  // 再看一遍：结算出来的都有着落
  const h2 = A.house(yj, q + 9), rs = A.settleAll(h2);
  ok(h2.settled && h2.lots.every((l) => l.done === 'lost' || l.done === 'pass'), `整场按 NPC 之间结算：${rs.map((r) => r.k).join(' ')}`);
  ok(rs.filter((r) => r.k === 'npc').every((r) => { const d = g.npcs.byId.get(r.lot.whoId!); return !!d && (d.bag?.[r.lot.id] ?? 0) > 0; }), 'NPC 拍下的东西都在他们袋里');
}

// 6. 存档：拍卖会的状态跟着世界状态走
ok(JSON.parse(JSON.stringify(g.ws)).auction?.q === A.S.q, '拍卖会状态在 ws 里，随存档');
console.log('拍卖会：全部通过');
