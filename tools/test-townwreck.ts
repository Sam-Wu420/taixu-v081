// 城镇破坏与恢复（world/townwreck.ts）——无头测试，固定时钟和种子。
// 小件被波及会坏、范围外不动；房子三档按耐久走、不会消失；不可破坏的不坏（城墙只留焦痕）；半塌的店铺设施照常能用、室内不让进；
// 挡路前后不变（破坏前后对全城抽样 townspace.blocked）；按天数修好、离场也在修；加急；账只记玩家的、NPC 造成的不记；
// 讨债门槛和赔清销账；存读档、旧存档、上限；这些路径上 Math.random 一次都不取。
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;
await import('./fixed-clock');
let s0 = 23, mathRandomCalls = 0;
Math.random = () => { mathRandomCalls++; s0 = (Math.imul(s0, 1664525) + 1013904223) >>> 0; return s0 / 4294967296; };

const G = await import('../src/world/game');
const W0 = await import('../src/data/world');
const C = await import('../src/world/cultivation');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const { TW, PROT } = await import('../src/world/townwreck');
const g = await G.createGame(() => {});
g.reset();
const c = g.combat as any, W = c.wreck, TWS = W.town as InstanceType<typeof import('../src/world/townwreck').TownWreck>;
c.spawnT = 1e9; c.brawl.brk.manual = true;
g.hero.realm = 3; g.hero.stage = 1;
let ok = 0; const pass = (s: string) => { ok++; console.log('  ✓ ' + s); };

/** 只数城镇破坏自己的路径：调用前后 Math.random 被取了几次 */
let twRandom = 0;
const guard = <T,>(fn: () => T): T => { const n0 = mathRandomCalls; const r = fn(); twRandom += mathRandomCalls - n0; return r; };
const frame = () => guard(() => W.update(1 / 60));
const tick = () => { guard(() => { W.update(1 / 60); TWS.update(1.01); }); };

// ---------------------------------------------------------------- 梁京：主角站到集市里
const city = W0.LOC_BY_ID.get('yuejing')!;
assert.ok(city && city.type === 'city', '梁京');
const L0 = (await import('../src/gfx/building')).getLayout(city) as any;
const mk = Object.entries(L0.anchors ?? {}).find(([k]) => k.startsWith('mkt'))![1] as { x: number; y: number };
const ox = city.x * W0.WORLD_SCALE, oy = city.y * W0.WORLD_SCALE, LS = 1.5;
const mx = ox + mk.x * LS, my = oy + mk.y * LS;
g.teleport(mx, my); g.player.flying = false;
g.space.update(1, mx, my);
const M = TWS.modelOf(city)!;
assert.ok(M, '梁京的模型建好了');
const T = M.T;
const smalls = T.filter((t: any) => t.k === 'small'), houses = T.filter((t: any) => t.k === 'house'), prots = T.filter((t: any) => t.k === 'prot'), walls = T.filter((t: any) => t.k === 'wall');
pass(`梁京：小件 ${smalls.length}、房子 ${houses.length}、不可破坏 ${prots.length}、城墙 ${walls.length} 段、树 ${M.trees.length} 棵`);
assert.ok(smalls.length > 100 && houses.length > 300 && walls.length > 8, '数量像一座大城');
const fresh = () => { TWS.clear(city); W.reset(); g.ws.townwreck = undefined; c.enemies.length = 0; frame(); };
const stones = () => C.bagCount(g.hero, 'mat_lingshi');
const give = (n: number) => { const d = n - stones(); if (d > 0) C.addItem(g.hero, 'mat_lingshi', d); else if (d < 0) C.removeItem(g.hero, 'mat_lingshi', -d); };

// 挡路：破坏前全城抽样（之后每一节结束都再比一次）
const sample: [number, number, boolean][] = [];
for (let i = 0; i < 4000; i++) { const x = M.x0 + ((i * 7919) % 4000) / 4000 * (M.x1 - M.x0), y = M.y0 + ((i * 104729) % 4001) / 4001 * (M.y1 - M.y0); sample.push([x, y, g.space.blocked(x, y)]); }
const sameBlocks = (what: string) => { g.space.update(1, mx, my); let changed = 0; for (const [x, y, b] of sample) if (g.space.blocked(x, y) !== b) changed++; assert.equal(changed, 0, `${what}：挡路一处没变（抽样 ${sample.length} 点）`); };

// 1. 小件：radial 范围里的摊位碎、范围外不动；有倒下的过程（falls），留残骸（画面：pieces 里是 broken）
{
  fresh();
  const st0 = smalls.find((t: any) => t.sub === 'stall')!;
  const R = 260;
  const inR = smalls.filter((t: any) => Math.hypot(t.x - st0.x, t.y - st0.y) < R - 60);
  const outR = smalls.filter((t: any) => Math.hypot(t.x - st0.x, t.y - st0.y) > R + 200);
  const res = guard(() => W.radial(st0.x, st0.y, R, 3, 'p'));
  assert.ok(res.town && res.town.broken >= inR.length, `范围里的小件都碎了：${res.town?.broken} ≥ ${inR.length}`);
  const st = TWS.state(city.id)!;
  for (const t of inR) assert.equal(TWS.entry(st, t.id)?.t, 2, `${t.sub} 碎了`);
  for (const t of outR) assert.equal(TWS.entry(st, t.id), null, '范围外的不动');
  assert.ok(TWS.falls.length > 0, '有倒下的过程');
  const v1 = TWS.pieces(M).get(st0.pi)!; assert.equal(v1.items.get(st0.ii), 'fall', '正在倒');
  for (let i = 0; i < 60; i++) frame();
  const v2 = TWS.pieces(M).get(st0.pi)!; assert.equal(v2.items.get(st0.ii), 'broken', '倒完留残骸');
  assert.equal(TWS.falls.length, 0, '倒完了');
  pass(`radial 碎了 ${res.town!.broken} 件小件（范围里 ${inR.length}）、范围外 ${outR.length} 件不动；先倒后留残骸`);
  // 摊主：摊位点（stall.ts 的座位 = 摊子南边 82）认得出自己的摊子；刚砸是 panic（惊叫跑开），过几息是 broken（站在旁边接着卖）
  const seat = { x: st0.x, y: st0.y + 82 * 1.5 };
  const sa = TWS.stallAt(seat.x, seat.y);
  assert.ok(sa.t === st0 && sa.s === 'panic', `摊主座位认出自己的摊子、刚砸：${sa.s}`);
  const sc = TWS.scareAt(st0.x + 300, st0.y + 100);
  assert.ok(sc && sc.ux > 0, '街上的人：出事的地方往外跑');
  g.day += 5; assert.equal(TWS.stallAt(seat.x, seat.y).s, 'broken', '过几息：摊主回来站在旁边卖');
  const other = smalls.find((t: any) => t.sub === 'stall' && !TWS.entry(st, t.id))!;
  assert.equal(TWS.stallAt(other.x, other.y + 123).s, 'ok', '没砸的摊子照常');
  // cone、line 也转过来
  fresh();
  const s2 = smalls.find((t: any) => t.sub === 'stall' && t !== st0)!;
  const rc = guard(() => W.cone(s2.x - 300, s2.y, 0, 500, 0.4, 3, 'p'));
  assert.ok(rc.town && rc.town.broken >= 1, 'cone 碎了摊位');
  const rl = guard(() => W.line(s2.x - 600, s2.y + 30, s2.x + 600, s2.y + 30, 160, 3, 'p'));
  assert.ok(rl.town && rl.town.small >= 1, 'line 也波及');
  pass('cone、line 也转给城镇那一层');
  sameBlocks('小件碎了');
}

// 2. 房子三档：按耐久走、不会消失；同一下波及好几座各扣各的
{
  fresh();
  const h0 = houses.find((t: any) => t.sub === 'cshop' && !t.fn)!;
  const st = () => TWS.state(city.id)!;
  let tiers: number[] = [];
  for (let i = 0; i < 12; i++) { guard(() => TWS.impact(h0.x, h0.y + 200, -Math.PI / 2, 3, 'p')); tiers.push(TWS.entry(st(), h0.id)?.t ?? 0); }
  assert.ok(tiers.includes(1), '先到破损');
  assert.equal(tiers[tiers.length - 1], 2, '再到半塌');
  for (let i = 1; i < tiers.length; i++) assert.ok(tiers[i] >= tiers[i - 1], '档只升不降（没修之前）');
  assert.ok(TWS.entry(st(), h0.id)!.hp >= 0, '耐久不为负');
  for (let i = 0; i < 20; i++) guard(() => TWS.impact(h0.x, h0.y + 200, -Math.PI / 2, 5, 'p'));
  assert.equal(TWS.entry(st(), h0.id)!.t, 2, '最多半塌，不会消失');
  assert.ok(TWS.collapsed(city.id, h0.pi), 'collapsed 认得');
  pass(`铺子连砸：${tiers.join('→')}，再砸也停在半塌`);
  // 一下波及好几座
  fresh();
  const near = houses.filter((t: any) => Math.hypot(t.x - h0.x, t.y - h0.y) < 700);
  guard(() => W.radial(h0.x, h0.y, 800, 4.5, 'p'));
  const hit = near.filter((t: any) => TWS.entry(st(), t.id));
  assert.ok(hit.length >= 2, `好几座都挨了：${hit.length}`);
  const hps = new Set(hit.map((t: any) => Math.round(TWS.entry(st(), t.id)!.hp * 10)));
  assert.ok(hps.size >= 2, '各扣各的（远近、大小不同，剩的耐久不一样）');
  pass(`一下波及 ${hit.length} 座房子，各扣各的`);
  sameBlocks('房子掉档');
}

// 3. 不可破坏：传送阵、城墙（只留焦痕）、衙署、有名的府第、悬赏榜
{
  fresh();
  const tp = prots.find((t: any) => t.sub === 'cteleport')!;
  assert.ok(tp, '传送阵在不可破坏表里');
  for (let i = 0; i < 6; i++) guard(() => W.radial(tp.x, tp.y, 400, 5, 'p'));
  assert.equal(TWS.entry(TWS.state(city.id)!, tp.id), null, '传送阵不坏');
  const wl = walls[0];
  const r = guard(() => TWS.impact((wl.x0 + wl.x1) / 2 + 300 * (wl.sub === 'y' ? 1 : 0), (wl.y0 + wl.y1) / 2 + 300 * (wl.sub === 'x' ? 1 : 0), wl.sub === 'x' ? -Math.PI / 2 : Math.PI, 3, 'p'));
  assert.ok(r && r.k === 'wall', '撞上城墙');
  const st = TWS.state(city.id)!;
  assert.equal(st.w.length, 1, '城墙留了一处焦痕掉砖');
  assert.equal(TWS.entry(st, wl.id), null, '城墙本身不掉档');
  for (const k of ['cteleport', 'cgate', 'cwall', 'chall', 'ccourt_named', 'notice', 'sect', 'story']) assert.ok(PROT[k], `判定表有「${k}」：${PROT[k]}`);
  const kinds = new Set(prots.map((t: any) => t.sub));
  for (const k of ['cteleport', 'cgate', 'chall']) assert.ok(kinds.has(k), `梁京的${k}标成不可破坏`);
  pass(`不可破坏：${[...kinds].join('、')}；城墙只留焦痕（${st.w.length} 处）`);
  sameBlocks('城墙挨打');
}

// 4. 记账：只记玩家的；NPC 打坏的不记；玩家和 NPC 对打时谁轰的算谁的
{
  fresh();
  const foe = new Enemy({ ...ENEMIES.yelang, speed: 0 }, mx, my, 2, 1); c.enemies.push(foe);
  const a = smalls.filter((t: any) => t.sub === 'stall')[3];
  guard(() => W.radial(a.x, a.y, 200, 3, foe));
  const st = TWS.state(city.id)!;
  assert.ok(TWS.entry(st, a.id)?.t === 2 && TWS.entry(st, a.id)!.by === 0, 'NPC 砸的：坏了，但不算玩家');
  assert.equal(st.bill, 0, 'NPC 砸的不记账');
  const b = smalls.filter((t: any) => t.sub === 'stall')[9];
  guard(() => W.radial(b.x, b.y, 120, 3, 'p'));
  assert.ok(st.bill >= TW.small.stall.val, `玩家砸的记账：${st.bill}`);
  const good0 = st.good; assert.ok(good0 < 0, '民望掉了');
  // 近战：被轰飞的人身上记着出手的人（brawl 的 body.by）——对方把玩家轰进房子算对方的
  const bill1 = st.bill;
  const h1 = houses.find((t: any) => t.sub === 'cshop' && !t.fn && Math.hypot(t.x - mx, t.y - my) > 2000)!;
  guard(() => { for (let i = 0; i < 6; i++) TWS.impact(h1.x, h1.y + 200, -Math.PI / 2, 3, foe); });
  assert.ok(TWS.entry(st, h1.id)!.t >= 1 && st.bill === bill1, '对方把玩家轰进房子：房子坏了，不记玩家的账');
  const h2 = houses.find((t: any) => t.sub === 'cshop' && !t.fn && t !== h1 && Math.hypot(t.x - mx, t.y - my) > 2000)!;
  guard(() => { for (let i = 0; i < 3; i++) TWS.impact(h2.x, h2.y + 200, -Math.PI / 2, 3, 'p'); });
  assert.ok(st.bill > bill1, '玩家把人轰进房子：算玩家的');
  pass(`账只记玩家的：NPC 砸的 0，玩家砸的 ${Math.round(st.bill)} 块灵石；民望 ${Math.round(st.good)}`);
  c.enemies.length = 0;
}

// 5. 讨债：小额不讨；够了门槛城卫执事上来（赔 / 欠着 / 动手）；赔清销账；欠着拒之门外
{
  fresh();
  g.modal = null;
  const one = smalls.find((t: any) => t.sub === 'stall')!;
  guard(() => W.radial(one.x, one.y, 60, 2, 'p'));
  const st = TWS.state(city.id)!;
  assert.ok(st.bill > 0 && st.bill < TW.bill.demand, '擦坏一个摊位：只是小额');
  tick();
  assert.ok(!g.modal, '小额不引来城卫');
  st.bill = TW.bill.demand + 1;
  tick();
  assert.ok(g.modal && (g.modal as any).node?.speaker === '城卫执事', '够了门槛：城卫执事上来讨赔');
  const node = (g.modal as any).node;
  assert.deepEqual(node.options.map((o: any) => o.label.slice(0, 2)), ['赔（', '先欠', '动手'], '赔 / 欠着 / 动手');
  g.modal = null;
  // 欠着：设施拒之门外（传送阵除外）；当场能还清
  give(0);
  node.options[1].act();
  assert.ok(st.owe > TW.bill.demand && st.bill === 0, '欠着：账转成欠款');
  assert.ok(TWS.refuses(city, 'pill') && !TWS.refuses(city, 'teleport'), '欠着：丹药铺不做生意，传送阵照常');
  let opened = 0;
  const refusal = TWS.beforeOpen(city, 'pill', () => { opened++; })!;
  assert.ok(refusal && refusal.options[0].disabled, '没钱还不了');
  give(9999);
  const r2 = TWS.beforeOpen(city, 'pill', () => { opened++; })!;
  r2.options[0].act!();
  assert.equal(opened, 1, '当场还清后照常开张');
  assert.ok(st.owe === 0 && st.bill === 0, '赔清了账就销');
  assert.ok(!TWS.refuses(city, 'pill'), '还清了照常做生意');
  // 赔
  st.bill = TW.bill.demand + 5; st.ask = -1e9; g.modal = null; tick();
  const n2 = (g.modal as any).node; g.modal = null;
  const s0n = stones(); n2.options[0].act();
  assert.equal(s0n - stones(), Math.ceil(TW.bill.demand + 5), '赔了多少扣多少');
  assert.equal(st.bill, 0, '赔清销账');
  pass('小额不讨；够了门槛讨赔；欠着拒之门外（传送阵照常）、当场还清；赔清销账');
}

// 6. 按天修好、离场也在修；加急；修的最后一截搭脚手架
{
  fresh();
  const h0 = houses.find((t: any) => t.sub === 'cshop' && !t.fn)!;
  for (let i = 0; i < 12; i++) guard(() => TWS.impact(h0.x, h0.y + 200, -Math.PI / 2, 3, 'p'));
  const a = smalls.find((t: any) => t.sub === 'flag') ?? smalls[0];
  guard(() => W.radial(a.x, a.y, 80, 3, 'p'));
  const st = TWS.state(city.id)!;
  const eh = TWS.entry(st, h0.id)!, es = TWS.entry(st, a.id)!;
  const dh = (eh.f - eh.d) / TW.DAY, ds = (es.f - es.d) / TW.DAY;
  assert.ok(dh >= TW.fix.half[0] && dh <= TW.fix.half[1], `半塌 ${dh.toFixed(1)} 天修好`);
  assert.ok(ds >= TW.fix.small[0] && ds <= TW.fix.small[1], `小件 ${ds.toFixed(1)} 天修好`);
  assert.ok(!TWS.scaffolding(eh), '刚塌：还没搭脚手架');
  g.day = eh.f - (eh.f - eh.d) * TW.scaffoldK * 0.5; tick();
  assert.ok(TWS.scaffolding(TWS.entry(TWS.state(city.id)!, h0.id)!), '修到最后一截：搭着脚手架');
  assert.ok(TWS.pieces(M).get(h0.pi)!.scaffold, '画面里也有脚手架');
  // 离场：人走远（city 不在附近）也在修——按 g.day 算，回来已经好了
  g.teleport(ox + 60000, oy); g.space.update(1, ox + 60000, oy); tick();
  g.day = eh.f + 1;
  g.teleport(mx, my); g.space.update(1, mx, my); tick();
  assert.equal(TWS.entry(TWS.state(city.id) ?? st, h0.id), null, '离场也在修：回来已经修好');
  assert.equal(TWS.entry(TWS.state(city.id) ?? st, a.id), null, '小件也好了');
  pass(`半塌 ${dh.toFixed(1)} 天、小件 ${ds.toFixed(1)} 天修好；最后一截搭脚手架；离场也在修`);
  // 加急
  fresh();
  for (let i = 0; i < 12; i++) guard(() => TWS.impact(h0.x, h0.y + 200, -Math.PI / 2, 3, 'p'));
  const price = TWS.rushPrice(city);
  assert.ok(price >= TW.rush.min, `加急要价：${price}`);
  give(price - 1); assert.ok(!TWS.donate(city), '钱不够捐不了');
  give(price + 10);
  const good0 = TWS.state(city.id)!.good;
  assert.ok(guard(() => TWS.donate(city)), '捐资修缮');
  assert.equal(stones(), 10, '扣了要价');
  const e2 = TWS.entry(TWS.state(city.id)!, h0.id)!;
  assert.ok(TWS.scaffolding(e2), '当天搭架');
  assert.ok(e2.f - g.day <= TW.DAY * TW.rush.after + 1e-6, '次日修好');
  assert.ok(TWS.state(city.id)!.good > good0, '民望涨了');
  g.day += TW.DAY * TW.rush.after + 0.1; tick();
  assert.equal(TWS.entry(TWS.state(city.id)!, h0.id), null, '修好了');
  pass(`加急：${price} 块灵石，当天搭架、次日修好，民望涨`);
}

// 7. 半塌的店铺：设施照常（临时摊）、室内不让进
{
  fresh();
  const shop = houses.find((t: any) => t.fn === 'pill')!;
  assert.ok(shop && shop.room, '丹药铺能走进去');
  const room = g.indoor.roomFor(city, 'pill')!;
  assert.ok(room && room.id === `${city.id}#${shop.pi}`, '室内那间屋就是这件构件');
  const P = (g.indoor as any).plan(room), WT = (await import('../src/world/indoor')).WALL_T;
  const doorBlocked = () => g.indoor.blockedLocal(room, P.door.x, -WT + 1);
  assert.ok(!doorBlocked(), '没塌：门洞走得进去');
  for (let i = 0; i < 14; i++) guard(() => TWS.impact(shop.x, shop.y + 300, -Math.PI / 2, 3, 'p'));
  assert.ok(TWS.collapsed(city.id, shop.pi), '丹药铺半塌');
  assert.ok(g.indoor.collapsed(room) && doorBlocked(), '半塌：门洞不让进');
  const ws0 = (await import('../src/world/indoor')).toWorld(room, 0, -room.D / 2); const p0 = { x: g.player.x, y: g.player.y };
  g.player.x = ws0[0]; g.player.y = ws0[1];
  assert.ok(!doorBlocked(), '人已经在屋里：照样走得出来');
  g.player.x = p0.x; g.player.y = p0.y;
  let opened = 0;
  const n = TWS.beforeOpen(city, 'pill', () => { opened++; })!;
  assert.ok(n && n.speaker === '掌柜' && /临时|方桌|门口/.test(n.text), '掌柜在门口摆临时摊');
  n.options[0].act!();
  assert.equal(opened, 1, '照常办事：设施照常打开');
  // 真走 towns.open（门口按交谈键就是这条路）：先出临时摊的对话，选「照常办事」开出丹药铺
  g.modal = null; g.towns.open(city, 'pill');
  assert.equal((g.modal as any)?.node?.speaker, '掌柜', 'towns.open：半塌的铺子先到门口的临时摊');
  (g.modal as any).node.options[0].act(); assert.equal((g.modal as any)?.kind, 'town', '照常办事：开出铺子的面板');
  assert.equal((g.modal as any)?.fac, 'pill', '是丹药铺'); g.modal = null;
  const card = TWS.card(city)!; assert.ok(card && /待修/.test(card.desc), `城镇面板上有「捐资修缮」：${card?.desc}`);
  for (const fac of ['rest', 'tavern', 'pill', 'artifact', 'talisman', 'market', 'auction', 'teleport', 'board']) {
    let o2 = 0; const q = TWS.beforeOpen(city, fac, () => { o2++; });
    if (q) q.options[0].act!(); else o2++;
    assert.equal(o2, 1, `${fac}：照常能用`);
  }
  pass('半塌的丹药铺：掌柜在门口摆临时摊，九种设施一个不少');
}

// 8. 存读档、旧存档、上限
{
  fresh();
  const a = smalls.find((t: any) => t.sub === 'stall')!;
  const h0 = houses.find((t: any) => t.sub === 'cshop' && !t.fn)!;
  guard(() => { W.radial(a.x, a.y, 100, 3, 'p'); for (let i = 0; i < 6; i++) TWS.impact(h0.x, h0.y + 200, -Math.PI / 2, 3, 'p'); });
  const tierBefore = TWS.entry(TWS.state(city.id)!, h0.id)!.t;
  const billBefore = TWS.state(city.id)!.bill;
  assert.ok(g.save(0), '存档');
  const raw = JSON.parse(store[G.SLOT_KEYS[0]]);
  assert.equal(raw.v, 3, '存档版本不升');
  assert.ok(raw.world.townwreck.c[city.id].e.length >= 2, '存档里有');
  g.ws.townwreck = undefined;
  assert.ok(g.load(G.SLOT_KEYS[0]), '读档');
  g.space.update(1, g.player.x, g.player.y); tick();
  const st = TWS.state(city.id)!;
  assert.equal(TWS.entry(st, a.id)?.t, 2, '读档后摊位还是坏的');
  assert.equal(TWS.entry(st, h0.id)?.t, tierBefore, '读档后房子还是那一档');
  assert.equal(st.bill, billBefore, '账还在');
  delete raw.world.townwreck; store[G.SLOT_KEYS[1]] = JSON.stringify(raw);
  assert.ok(g.load(G.SLOT_KEYS[1]), '旧存档照读');
  g.space.update(1, g.player.x, g.player.y); tick();
  assert.equal(TWS.state(city.id), null, '旧存档没有城镇破坏');
  guard(() => W.radial(a.x, a.y, 100, 3, 'p'));
  assert.ok(TWS.entry(TWS.state(city.id)!, a.id), '旧存档读进来以后照样能坏');
  // 上限：一座城的条目
  fresh();
  for (const t of houses.slice(0, TW.cap.entries + 40)) guard(() => TWS.impact(t.x, t.y, 0, 0.3, null));
  assert.ok(TWS.state(city.id)!.e.length <= TW.cap.entries, `一座城最多 ${TW.cap.entries} 条`);
  // 上限：城的个数（修好、没账的先清）
  const S = g.ws.townwreck!;
  for (let i = 0; i < TW.cap.cities + 5; i++) S.c['fake' + i] = { v: 1, e: [], m: [], w: [], bill: 0, owe: 0, oweD: 0, good: 0, seen: g.day - 10 * TW.DAY, ask: 0 } as any;
  tick();
  assert.ok(Object.keys(S.c).length <= TW.cap.cities, `最多记 ${TW.cap.cities} 座城：${Object.keys(S.c).length}`);
  assert.ok(S.c[city.id], '眼前这座还在');
  pass('存读档还在、旧存档照读、条目与城数有上限');
}

// 9. 城里的树照 wreck 的办法倒；地面留浅坑 / 浅沟（比野外的浅），一两天修好
{
  fresh();
  const tr = M.trees[0];
  assert.ok(tr, '城里有树');
  guard(() => W.radial(tr.x, tr.y, 200, 3, null));
  assert.ok(W.treeAt(tr), '城里的树倒了');
  const st = TWS.state(city.id)!;
  assert.ok(st.m.length >= 1 && st.m[0].r <= 220, `地面留了浅坑：半径 ${Math.round(st.m[0]?.r ?? 0)}`);
  assert.equal(W.keep.length + W.marks.length, 0, '城里不留野外那种深坑');
  pass('城里的树倒了；地面是石板碎裂的浅坑，不留野外的深坑');
}

sameBlocks('全部测完');
assert.equal(twRandom, 0, `城镇破坏的路径上 Math.random 一次都没取：${twRandom}`);
console.log(`test-townwreck：全部通过（${ok} 项；调用 ${TWS.stats.calls}、碎 ${TWS.stats.broken}、掉档 ${TWS.stats.tiers}、修好 ${TWS.stats.fixed}）`);
process.exit(0);
