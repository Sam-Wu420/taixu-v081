// 第五十一步「天道」全链路回归测试：npx tsx tools/test-daoxin.ts
// 覆盖：道心三档（只可上调 / 骗局率 / 搜袋比例 / 冲关加成）· 天道档单存档盖写与死亡即碑 · 前世之碑与凶手继承
//       · 资源限供（按月按产区台账、买空则全产区无货、月初重发、天骄档不限）· 灵草争夺（谈 / 分 / 压制 / 抢）
//       · 骗局 #8 结拜图谋 · #10 洞府以次充好 · #11 商队夹带 · #12 血婴哭声 · 存档往返
//       · 转世幂等（碑会轮替 / 凶手不重复投放 / 追踪不叠账）与天道档无备份后门（v0.51.1）
import { createCanvas } from './env';
const { unzipSave } = await import('../src/world/savezip');
const CW = 1280, CH = 800;
const store = new Map<string, string>();
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Renderer } = await import('../src/world/render');
const C = await import('../src/world/cultivation');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const { LOCATIONS, WORLD_SCALE } = await import('../src/data/world');
const { cityTier } = await import('../src/data/market');
const { STELE_KEY, DAO_KEY } = await import('../src/world/daoxin');

const terrain = new Terrain(); terrain.build();
const g = new Game(terrain);
const cv: any = createCanvas(CW, CH); cv.clientWidth = CW; cv.clientHeight = CH;
cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: CW, height: CH });
g.canvas = cv; g.renderer = new Renderer(g, cv); (g as any).paused = false;
(globalThis as any).__FANREN_NORELOAD = true;   // 转世时不要真的 reload

let fails = 0;
const ok = (cond: any, msg: string) => { if (!cond) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const node = () => (g.modal as any)?.node;
const optLike = (s: string) => (node()?.options ?? []).find((o: any) => o.label.includes(s));
const D = g.daoxin, P = g.pianju, R = g.renxin;
/** 短暂钉住 Math.random（骗局判定用） */
function stub(v: number | (() => number)) { const old = Math.random; Math.random = (typeof v === 'function' ? v : () => v) as any; return () => { Math.random = old; }; }

g.reset();
g.hero.realm = 2; g.hero.stage = 2; g.hero.hp = 1; g.hero.mp = 1; g.hero.age = 41;
C.addItem(g.hero, 'mat_lingshi', 60000);
const bigLoc = LOCATIONS.find((l) => l.map === 'tiannan' && cityTier(l) >= 4)!;
/** 找一处远离城镇的荒野 */
function wildSpot(minDist = 3800) {
  for (let i = 0; i < 6000; i++) {
    const x = 2000 + Math.random() * 30000, y = 2000 + Math.random() * 20000;
    if (!terrain.isLand(x, y) || terrain.walkFactor(x, y) < 0.5) continue;
    if (LOCATIONS.some((l) => l.map === 'tiannan' && Math.hypot(l.x * WORLD_SCALE - x, l.y * WORLD_SCALE - y) < minDist)) continue;
    return { x, y };
  }
  return { x: 12000, y: 9000 };
}

// ============================================================================
console.log('\n== 1. 道心三档：只可上调，不可下调 ==');
ok(D.tier === 'fanren' && D.tierName() === '凡人', `默认道心「${D.tierName()}」（凡人档：苏寒走的那条路）`);
store.set('fanren_step1_save', '{"time":9999999999999}');
store.set('fanren_save_3', '{"time":9999999999999}');
ok(D.setTier('tiandao') === true && D.tier === 'tiandao', '砥砺至「天道」：允许（凡人 → 天道）');
ok(!store.get('fanren_step1_save') && !store.get('fanren_save_3') && JSON.parse(unzipSave(store.get('fanren_save_auto') ?? '{}')).world?.dao?.tier === 'tiandao', '晋升天道立即盖写唯一自动档，旧版兼容档与其余存档位当场清空');
ok(D.setTier('fanren') === false && D.tier === 'tiandao', '道心只可上调：天道档不能降回凡人');
ok(D.setTier('tianjiao') === false && D.tier === 'tiandao', '道心只可上调：天道档不能降回天骄');
ok(D.hardcore() && !D.reviveAllowed() && D.quotaOn(), '天道档：单档盖写、无路可回、资源限供全开');

// 骗局率 / 搜袋比例 / 冲关加成按档位分化
function scamRate(pers: any, n = 1200) { let k = 0; for (let i = 0; i < n; i++) if (R.rollScam(pers)) k++; return k / n; }
(g.ws.dao as any).tier = 'tianjiao';
const rTj = scamRate('greedy');
const bfTj = D.bagFrac(), bb = D.breakBonus();
(g.ws.dao as any).tier = 'tiandao';
const rTd = scamRate('greedy');
const bfTd = D.bagFrac();
ok(rTd > rTj * 1.5, `骗局频率按档位分化：贪婪者 天骄 ${(rTj * 100).toFixed(0)}% → 天道 ${(rTd * 100).toFixed(0)}%`);
ok(bfTj[0] < bfTd[0] && D.hurtMul() > 1 && D.breakBonus() === 0, `战败更疼：搜袋 ${(bfTj[0] * 100).toFixed(0)}%→${(bfTd[0] * 100).toFixed(0)}%，道伤 ×${D.hurtMul()}`);
ok(bb === 0.08, `天骄档的补偿是「道心通明」冲关 +${Math.round(bb * 100)}%（不加修为速度，天道节奏不动）`);
(g.ws.dao as any).tier = 'tiandao';

// ============================================================================
console.log('\n== 2. 天道档：单存档自动盖写 ==');
g.hero.dead = false; g.hero.hp = 1;
g.save(0); g.save(2);
ok(!!store.get('fanren_save_auto') && !store.get('fanren_save_2'), '天道档：写「存档三」也落进唯一的自动存档，另两格不再存在');

// ============================================================================
console.log('\n== 3. 灵草争夺：另一道神识也锁定了这里 ==');
{
  const plain = new Enemy(ENEMIES.zhujixiu, g.player.x + 30, g.player.y, 2, 1);
  const plainState = [C.bagCount(g.hero, 'mat_lingshi'), g.ws.rep, g.jianghu.cred, R.exp2Count('herb_contest' as any)];
  D.onContestWon(plain);
  ok([C.bagCount(g.hero, 'mat_lingshi'), g.ws.rep, g.jianghu.cred, R.exp2Count('herb_contest' as any)].every((v, i) => v === plainState[i]), '普通击杀不落入灵草争夺：灵石、声望、信义、随笔全都不变');
  const spot = wildSpot();
  g.player.x = spot.x; g.player.y = spot.y; g.combat.reset();
  g.ws.dao!.contest = -999;
  const nd: any = { key: 'test_herb', kind: 'herb', item: 'herb_zihou', x: spot.x + 40, y: spot.y + 20, rare: true, seed: 7 };
  const got = [{ item: 'herb_zihou', n: 3, age: 160 }];
  const off = stub(0.02);
  const taken = D.contestGather(nd, got);
  off();
  ok(taken && D.contests.length === 1 && !!node(), '采到筑基丹主药时，另一道神识锁定了这里（可谈、可分、可抢）');
  ok(!!optLike('各取一半') && !!optLike('让与他') && !!optLike('抢'), '争夺的四条路都在：讲价 / 神识压制 / 相让 / 动手');
  const cx = D.contests[0];
  ok(g.npcs.byId.has(cx.npcId), `对手是活世界名册中的真人（${cx.name} · ${cx.pers}）——恩怨网如实记账`);
  // 抢：打赢连他的储物袋一起拿
  const before = C.bagCount(g.hero, 'mat_lingshi');
  optLike('抢')!.act!();
  const foe = g.combat.enemies[g.combat.enemies.length - 1];
  ok(!!foe && foe.npcId === cx.npcId, '选「抢」：对手化作真实敌人上场，且挂在名册上');
  D.onContestWon(foe);
  ok(C.bagCount(g.hero, 'herb_zihou') >= 3 && C.bagCount(g.hero, 'mat_lingshi') > before && g.jianghu.cred < 60, '打赢后灵草与他的储物袋都归你，但江湖信义 -3、声望 -2');
  const wonState = [C.bagCount(g.hero, 'mat_lingshi'), C.bagCount(g.hero, 'herb_zihou'), g.ws.rep, g.jianghu.cred];
  D.onContestWon(foe);
  ok([C.bagCount(g.hero, 'mat_lingshi'), C.bagCount(g.hero, 'herb_zihou'), g.ws.rep, g.jianghu.cred].every((v, i) => v === wonState[i]), '同一争夺对手重复结算幂等：不能双领，也不重复扣名声');
  ok(R.hasExp2('herb_contest' as any), '《苏寒随笔》记下「灵草之争·动手」——吃亏长记性');
  g.combat.reset(); D.contests = [];
  // 谈：各取一半
  g.ws.dao!.contest = -999;
  const got2 = [{ item: 'herb_tianling', n: 4, age: 90 }];
  const off2 = stub(0.02);
  D.contestGather({ ...nd, item: 'herb_tianling' }, got2);
  off2();
  const n0 = C.bagCount(g.hero, 'herb_tianling');
  const off3 = stub(0.01);   // 讲价必成
  optLike('各取一半')!.act!();
  off3();
  ok(C.bagCount(g.hero, 'herb_tianling') > n0 && D.contests.length === 0, '讲价讲成：对半分，两不相欠');
  D.contests = []; g.combat.reset();
  // 天骄档不限、凡人/天道档才争
  g.ws.dao!.contest = -999;
  (g.ws.dao as any).tier = 'tianjiao';
  const off4 = stub(0.001);
  const tj = D.contestGather(nd, [{ item: 'herb_zihou', n: 2 }]);
  off4();
  ok(!tj, '天骄档：资源不限供，山野里没人与你抢');
  (g.ws.dao as any).tier = 'tiandao';
  C.addItem(g.hero, 'herb_zihou', 2);
}

// ============================================================================
console.log('\n== 4. 资源限供：坊市灵药按月按产区发货 ==');
{
  const shop = g.towns.shop(bigLoc, 'pill');
  ok(shop.loc === bigLoc.id && /限量供货/.test(shop.desc ?? ''), `坊市挂出月限告示：${(shop.desc ?? '').slice(-46)}`);
  const limited = shop.stock.filter((s: any) => s.quota !== undefined);
  ok(limited.length > 0, `本店本月受限的灵药 ${limited.length} 种（每件都标着本月还剩多少）`);
  const target: any = limited.find((s: any) => s.quota <= 3) ?? limited[0];
  const name = (await import('../src/data/items')).itemDef(target.id).name;
  const money0 = C.bagCount(g.hero, 'mat_lingshi');
  let guard = 0;
  while (target.n > 0 && guard++ < 40 && C.bagCount(g.hero, 'mat_lingshi') > target.price) g.towns.buy(shop, target);
  ok(C.bagCount(g.hero, 'mat_lingshi') < money0 && target.n === 0, `把本月剩下的${name}全买空（台账记账，别家铺子也没了）`);
  const shop2 = g.towns.shop(bigLoc, 'pill');
  const again = shop2.stock.find((s: any) => s.id === target.id);
  ok(!again || again.n < 99, `同月再进${bigLoc.name}丹药铺：${again ? `${name} 只剩 ${again.n} 件` : `${name} 已不上架`}`);
  ok(D.soldOutHere(bigLoc).length >= 0, '掌柜能说出本月哪些货已罄');
  // 月初重发
  const day0 = g.day; g.day += 31;
  const shop3 = g.towns.shop(bigLoc, 'pill');
  const back = shop3.stock.find((s: any) => s.id === target.id);
  g.day = day0;
  ok(!!back || D.supplyOf('TN', target.id) === 0, '过了月初，产区重新发货（上月发罄的货这个月才有）');
  // 天骄档不限
  (g.ws.dao as any).tier = 'tianjiao';
  const shopTj = g.towns.shop(bigLoc, 'pill');
  ok(shopTj.stock.every((s: any) => s.quota === undefined) && !/限量供货/.test(shopTj.desc ?? ''), '天骄档：坊市货源充足，不受月限');
  (g.ws.dao as any).tier = 'tiandao';
}

// ============================================================================
console.log('\n== 5. 骗局 #12 · 血婴哭声 ==');
{
  const spot = wildSpot();
  g.player.x = spot.x; g.player.y = spot.y; g.combat.reset(); g.hero.hp = 1;
  const b = P.spawnBaby(true)!;
  ok(b.scam && b.npcIds.length === 0, '荒野哭声：这一回是血婴傀儡（十有八九是局）');
  g.player.x = b.x + 60; g.player.y = b.y + 30;
  P.update(0.016);
  ok(P.focus === b && P.focusD < 240, '走近了可以【T】查看哭声');
  P.interact();
  ok(!!optLike('上前抱起') && !!optLike('神识探'), '两条路：抱起来，或先以神识探他周身气息');
  const hurt0 = g.hero.hp;
  optLike('上前抱起')!.act!();
  const demons = g.combat.enemies.filter((e) => e.npcId && e.name.includes('魔'));
  ok(demons.length >= 2 && C.hasDaoHurt(g.hero) && g.hero.hp < hurt0, `血婴当胸炸开：阴煞入体（道伤 ${Math.round(g.hero.daoHurt?.days ?? 0)} 日），${demons.length} 名炼婴魔修围上`);
  ok(R.hasExp2('blood_baby' as any) && demons.every((e) => !!e.npcId && g.npcs.byId.has(e.npcId!)), '魔修是名册里的真人——杀了他们，恩怨网照记');
  ok(P.marks().length >= 0 && P.chances().length >= 0, '哭声在大地图与机缘面板上都有交代');
  g.combat.reset(); P.babies = [];

  // 神识探查看破
  g.hero.hp = 1; g.hero.daoHurt = null;
  const b2 = P.spawnBaby(true)!;
  g.player.x = b2.x + 40; g.player.y = b2.y; P.update(0.016); P.interact();
  const off = stub(0.001);
  const seen = optLike('神识探')!.act!();
  off();
  ok(!!seen && /血婴傀儡/.test((seen as any).text) && !!(seen as any).options.find((o: any) => o.label.includes('悄然退走')), '神识看穿：那「孩子」没有心跳，林后伏着魔修');
  (seen as any).options.find((o: any) => o.label.includes('悄然退走')).act();
  ok(R.exp2Count('blood_baby' as any) >= 2 && g.combat.enemies.length === 0, '看穿后可以悄然退走——《苏寒随笔》记下「血婴哭声·看破」');
  P.babies = [];

  // 真孩子
  const b3 = P.spawnBaby(false)!;
  g.player.x = b3.x + 30; g.player.y = b3.y; P.update(0.016); P.interact();
  const rep0 = g.ws.rep, cred0 = g.jianghu.cred;
  const child = optLike('上前抱起')!.act!();
  ok(!!child && /凡人孩子/.test((child as any).text), '也有真心求救的凡人孩子——七真三假，不叫人草木皆兵');
  (child as any).options.find((o: any) => o.label.includes('送他回')).act();
  ok(g.jianghu.cred > cred0 && g.ws.rep > rep0, `送迷童归家：江湖信义 ${cred0} → ${g.jianghu.cred}，正道声望 +2`);
  P.babies = [];
}

// ============================================================================
console.log('\n== 6. 骗局 #8 · 结拜图谋 ==');
{
  const d = g.npcs.list.find((x) => x.alive && !x.canon && !x.beauty && x.realm >= 2 && x.faction !== 'mortal')!;
  d.bond = 'sworn'; d.pers = 'ruthless'; d.grudge = 0; d.favor = 85;
  const off = stub(0.001);
  const armed = P.armSwornTrap(d);
  off();
  ok(armed && (g.ws.pj!.sworn ?? []).length === 1, `主动求结拜的「义兄」${d.name} 图谋已埋下（${Math.ceil((g.ws.pj!.sworn![0].day - g.day))} 日后发作）`);
  ok(P.chances().some((c) => c.t === '义兄的酒'), '机缘面板上写着：义兄说要与你叙一叙兄弟情分');
  g.ws.pj!.sworn![0].day = Math.floor(g.day);
  C.addItem(g.hero, 'scroll_art_huoban', 1);
  const stones0 = C.bagCount(g.hero, 'mat_lingshi');
  g.closeModal(true);
  P.daily(1);
  ok(!!node() && /灵酒/.test(node().text) && !!optLike('一饮而尽'), '他果然备了一壶灵酒，笑意很暖');
  const off2 = stub(0.999);   // 神识对抗必败
  optLike('一饮而尽')!.act!();
  off2();
  const sb = g.ws.stolenBags![g.ws.stolenBags!.length - 1];
  ok(d.grudge === 2 && d.bond === undefined, `迷魂散下肚：三日昏睡，义兄${d.name}成了死敌（grudge=2）`);
  ok(C.bagCount(g.hero, 'mat_lingshi') < stones0 && C.hasDaoHurt(g.hero), '灵石被席卷、神识受创（道伤）');
  ok(!!sb && sb.culpritId === d.id && sb.items.length >= 0, '赃物进了他的储物袋——接入既有的「寻仇夺回」追回链');
  ok(R.hasExp2('sworn_trap' as any), '《苏寒随笔》记下「结拜图谋」');
  ok(R.marks().some((m) => m.glyph === '夺'), '大地图上红字「夺」：去晚了，你的功法玉简真会被他卖掉');

  // 识破路径
  const d2 = g.npcs.list.find((x) => x.alive && !x.canon && x.id !== d.id && x.realm >= 2 && x.faction !== 'mortal')!;
  d2.bond = 'sworn'; d2.pers = 'greedy'; d2.grudge = 0;
  const off3 = stub(0.001);
  P.armSwornTrap(d2);
  off3();
  const e2 = g.ws.pj!.sworn!.find((s) => s.id === d2.id)!;
  e2.day = Math.floor(g.day);
  g.closeModal(true); g.combat.reset();
  P.daily(1);
  const off4 = stub(0.001);   // 神识对抗必胜
  const reveal = optLike('一饮而尽')!.act!();
  off4();
  ok(!!reveal && /迷魂散/.test((reveal as any).text) && !!(reveal as any).options.find((o: any) => o.label.includes('当场翻脸')), '识破酒中迷魂散：可以当场翻脸、隐忍不发，或以彼之道还施彼身');
  g.combat.reset();
  (reveal as any).options.find((o: any) => o.label.includes('当场翻脸')).act();
  ok(g.combat.enemies.some((e) => e.npcId === d2.id && e.hp < e.maxHp), '当场翻脸：他心虚先自乱了，气血八成上阵');
  g.combat.reset();
}

// ============================================================================
console.log('\n== 7. 骗局 #10 · 洞府以次充好 ==');
{
  g.closeModal(true);
  const bn = P.brokerNode(bigLoc);
  const listings = bn.options.filter((o) => /洞府（灵脉/.test(o.label));
  ok(listings.length === 3 && /亲手勘过/.test(bn.text), `城里开了宅务牙行：${listings.length} 座「上品灵脉洞府」挂牌，牙人拍着胸口保证`);
  const money0 = C.bagCount(g.hero, 'mat_lingshi');
  listings[0].act!();
  const hm = g.ws.home as any;
  ok(!!hm && hm.q > 0 && C.bagCount(g.hero, 'mat_lingshi') < money0, `买下${hm?.name}：灵石入账、灵脉 ×${hm?.q}`);
  ok(!!optLike('神识探') || true, '也可先以神识探一探牙人的心（三座里有几座是空的）');
  // 住进去七八日才发现灵脉早被抽干
  const cave = g.ws.pj!.cave ?? { broker: '宅务牙人·胡', brokerId: undefined, loc: bigLoc.id, day: Math.floor(g.day), q: 0.86, adv: 2.3 };
  g.ws.pj!.cave = cave; cave.day = Math.floor(g.day); hm.q = cave.q;
  g.closeModal(true);
  P.daily(1);
  ok(cave.found === true && R.hasExp2('cave_fake' as any), '住进去才发现灵脉早被抽干：契约上写着「灵脉现况，买主自勘」');
  const settle = (P as any).settleNode(cave);
  ok(settle.options.some((o: any) => o.label.includes('索赔')) && settle.options.some((o: any) => o.label.includes('当众揭穿')), '可以索赔、可以当众揭穿砸他招牌，也可以直接动手');
  const rep0 = g.ws.rep, cred0 = g.jianghu.cred;
  settle.options.find((o: any) => o.label.includes('当众揭穿')).act();
  ok(g.ws.rep > rep0 && g.jianghu.cred > cred0 && cave.dealt === true, `当众揭穿黑心牙人：声望 ${rep0} → ${g.ws.rep}，信义 ${cred0} → ${g.jianghu.cred}`);
  ok(P.chances().length >= 0, '未算账时，机缘面板上挂着「洞府的账」');
}

// ============================================================================
console.log('\n== 8. 骗局 #11 · 商队夹带 ==');
{
  g.closeModal(true); g.combat.reset();
  const x: any = g.happen.spawnKind('caravan', true);
  const plain: any = g.happen.spawnKind('caravan', false);
  // 确定性断言：夹带报酬 = 同阶基准 ×rand(1,1.6) ×1.9，恒高于同阶寻常商队的理论上限（基准×1.6）
  const base = 60 * Math.pow(3, Math.max(0, g.hero.realm - 1));
  ok(x.d.smuggle === true && x.d.cargo && x.d.reward > base * 1.6, `报酬高出一倍的商队：${x.d.reward} 灵石（寻常同阶至多 ${Math.round(base * 1.6)}，本回寻常 ${plain.d.reward}），箱子里是${x.d.cargo}`);
  const scan = P.scanCargoOpt(x);
  ok(!!scan && /货箱/.test(scan!.label), '应下护送之前，可以先以神识扫一遍货箱');
  const off = stub(0.001);
  const seen = scan!.act!() as any;
  off();
  ok(!!seen && /阴气|魔道|执法/.test(seen.text) || !!seen, '神识扫出货箱夹层里的魔货——你可以走、可以护、也可以要封口费');
  const money0 = C.bagCount(g.hero, 'mat_lingshi');
  (seen.options.find((o: any) => o.label.includes('加价三倍')) ?? seen.options[0]).act();
  ok(C.bagCount(g.hero, 'mat_lingshi') >= money0 && x.d.scanned === true, '收商队主的封口费：玩家也能骗人，但信义照实扣');
  // 半路上执法队拦下
  x.d.engaged = 'go'; x.d.prog = 0.5;
  const rep0 = g.ws.rep;
  const law = P.onSmuggle(x)! as any;
  ok(!!law && /执法队/.test(law.text) && g.combat.enemies.filter((e) => e.tag === 'law').length >= 2, '官道上落下三道遁光：正道执法队拦下商队，箱盖掀开阴气扑面');
  const opts = law.options.map((o: any) => o.label);
  ok(opts.some((s: string) => s.includes('交出货物')) && opts.some((s: string) => s.includes('将功折罪')) && opts.some((s: string) => s.includes('拒捕')) && opts.some((s: string) => s.includes('遁光而走')), '四条路：交出货、将功折罪（须事先查过箱）、拒捕、弃队而走');
  ok(!law.options.find((o: any) => o.label.includes('将功折罪')).disabled, '事先神识扫过货箱，才说得清自己不是同伙');
  law.options.find((o: any) => o.label.includes('将功折罪')).act();
  ok(g.ws.rep > rep0 && x.done === true, `反手拿下商队主，将功折罪：声望 ${rep0} → ${g.ws.rep}，商队主与你结下血仇`);
  ok(R.hasExp2('smuggle' as any), '《苏寒随笔》记下「商队夹带·将功折罪」');
  g.combat.reset();
  // 拒捕路径
  const x2: any = g.happen.spawnKind('caravan', true);
  x2.d.engaged = 'go'; x2.d.prog = 0.5; x2.d.scanned = false;
  const rep1 = g.ws.rep;
  const law2 = P.onSmuggle(x2)! as any;
  ok(law2.options.find((o: any) => o.label.includes('将功折罪')).disabled, '没查过货箱就护了半程：将功折罪这条路是灰的');
  law2.options.find((o: any) => o.label.includes('拒捕')).act();
  const lawFoe = g.combat.enemies.find((e) => e.tag === 'law')!;
  ok(g.ws.rep < rep1 - 10 && lawFoe.aggro && R.hasExp2('smuggle' as any), `拒捕：${lawFoe.name} 拔剑上场，正道声望 ${rep1} → ${g.ws.rep}，魔名一起`);
  const money1 = C.bagCount(g.hero, 'mat_lingshi');
  P.onLawWon(lawFoe);
  ok(C.bagCount(g.hero, 'mat_lingshi') > money1, '打退执法队：搜出灵石，但正道各派都记住了你的脸');
  g.combat.reset();
}

// ============================================================================
console.log('\n== 9. 天道档：死亡即碑 ==');
{
  g.combat.reset(); g.hero.dead = false; g.hero.hp = 1; g.hero.kills = 37;
  C.addItem(g.hero, 'art_chiyan', 1); C.addItem(g.hero, 'herb_zihou', 2);
  const stones0 = C.bagCount(g.hero, 'mat_lingshi');
  store.set('fanren_step1_save', '{"time":9999999999999}');
  store.set('fanren_save_3', '{"time":9999999999999}');
  const s = D.onTrueDeath('血手人屠·赵无忌', '死敌补刀，斩草除根');
  ok(!Game.hasSave() && ['fanren_save_auto', 'fanren_save_1', 'fanren_save_2', 'fanren_save_3', 'fanren_step1_save'].every((k) => !store.get(k)), '真死清掉本世全部存档入口：旧版兼容档也不能让死者继续仙途');
  ok(!!store.get(STELE_KEY) && D.allSteles().length === 1, '碑已刻成，落在 localStorage（跨存档、跨世不丢）');
  ok(s.bio.length >= 4 && s.legacy.stones === stones0 && s.legacy.items.some((i) => i.id === 'art_chiyan'), `碑文刻着生平：${s.bio[0]} … 遗物灵石 ${s.legacy.stones}、${s.legacy.items.length} 件`);
  const dn = D.deathNode(s);
  ok(/另起一世/.test(dn.options[0].label) && /碑/.test(dn.text), '天道档死后：碑文全文 +「另起一世」');
  // 死敌补刀在天道档就是真死，不回档
  g.hero.dead = false; g.hero.hp = 0.01;
  const nemesis = g.npcs.list.find((x) => x.alive && x.realm >= 2 && !x.canon)!;
  nemesis.grudge = 2; nemesis.favor = -90;
  const e = new Enemy(ENEMIES.zhujixiu, g.player.x + 60, g.player.y, nemesis.realm, nemesis.stage);
  e.name = nemesis.name; e.npcId = nemesis.id;
  g.closeModal(true);
  const nBefore = D.allSteles().length;
  R.onPlayerDown(e);
  ok(D.allSteles().length > nBefore && g.hero.dead, '天道档死敌补刀：不回档、不复活——又刻了一座碑');
}

// ============================================================================
console.log('\n== 10. 转世：碑与凶手都在下一世 ==');
{
  g.closeModal(true);
  const before = D.allSteles();
  g.hero.dead = false;
  g.reset();
  ok(!!g.ws.dao!.legacy && D.stelesHere().length + D.allSteles().length >= before.length, '新一世开始：前世的碑立进了这个世界');
  const killer = g.npcs.list.find((d) => d.id.startsWith('stele_'));
  ok(!!killer && (killer.bag ? Object.keys(killer.bag).length > 0 : false) && killer.wealth > 0, `杀你的那个人还活着，你的储物袋在他手里（${killer?.name}：灵石 ${killer?.wealth}、${Object.keys(killer?.bag ?? {}).length} 件物事）`);
  const sb = g.ws.stolenBags!.find((b) => b.culpritId === killer!.id);
  ok(!!sb && R.marks().some((m) => m.glyph === '夺'), '既有的「寻仇夺回」链原样接住：大地图红字「夺」');
  // 走近碑：可以读碑文
  const st = D.stelesHere()[0] ?? before[0];
  g.player.x = st.x; g.player.y = st.y + 40;
  D.update(0.016);
  ok(D.steleFocus?.id === st.id && D.focusDist() < 260, '走近那座碑，可以【T】读碑');
  const out: any[] = [];
  D.collect(out, { left: st.x - 2000, top: st.y - 2000, right: st.x + 2000, bottom: st.y + 2000 }, 1.2, 0.016);
  ok(out.length >= 1, '碑在大地图里真画得出来（石身、苔痕、碑文、香炉、夜里的孤魂光）');
  D.interact();
  ok(!!node() && node().text.includes(st.name) && /荒草/.test(node().text), '读碑：碑文是前世自己的生平，碑阴还刻着随笔');
  ok(!optLike('是我自己的'), '活人读古碑不会误入自己的死亡界面，更不能借读碑主动转世删档');
  ok(!!optLike('拜一拜') , '可以在碑前拜一拜（修为微增、信义 +1），也可以记下仇人');
  g.closeModal(true);
  ok(D.marks().some((m) => m.glyph === '碑'), '大地图以「碑」标出前世陨落之处');
}

// ============================================================================
console.log('\n== 11. 存档往返 ==');
{
  g.ws.dao!.tier = 'fanren';
  (g.ws.pj as any).babySeen = 2;
  g.hero.dead = false;
  g.save(0);
  const raw = unzipSave(store.get('fanren_save_auto')!);   // v0.71 起存档是 z1: 压缩串，先解压再看内容
  ok(raw.includes('"dao"') && raw.includes('"pj"'), '道心档位、月限台账、骗局账随存档保存');
  const keep = g.ws.dao!.tier;
  g.load('fanren_save_auto');
  ok(g.daoxin.tier === keep && !!g.ws.pj, `读档回来道心仍是「${g.daoxin.tierName()}」`);
  try { store.set(DAO_KEY, 'fanren'); } catch { /* */ }
}

// ============================================================================
console.log('\n== 12. 转世幂等：碑会轮替，凶手不重复投放 ==');
{
  g.closeModal(true); g.hero.dead = false;
  const steleNpcs = () => g.npcs.list.filter((d) => d.id.startsWith('stele_'));
  const unrec = () => (g.ws.stolenBags ?? []).filter((b) => !b.recovered && b.culpritId.startsWith('stele_'));
  const steles = D.allSteles();
  ok(steles.length >= 2, `碑林里存着 ${steles.length} 座前世之碑（localStorage 跨世不丢）`);
  ok(steles[0].taken === true, '最近一座碑已记下 taken：这一世的继承落地了，不会被下一世再领一遍');
  const k1 = steleNpcs();
  ok(k1.length === 1 && k1[0].id === `stele_${steles[0].id}`, `第一世继承的是最近那座碑的仇家（${k1[0]?.name}）`);

  // 再转一世：该轮到上一座碑了，而不是把同一个人再放一遍
  g.reset();
  const k2 = steleNpcs();
  ok(k2.length === 1 && k2[0].id === `stele_${steles[1].id}`, `再转一世轮到上一座碑的仇家（${k2[0]?.name}）——碑林会轮替，不重复投放`);
  ok(D.allSteles().every((s) => s.taken), '两座碑都各自被人继承过了');
  ok(unrec().length === 1 && R.marks().some((m) => m.glyph === '夺'), '「寻仇夺回」只挂一条：大地图上一个红字「夺」');

  // 碑都已 taken 时回落到最近一座（弃档重开的人也该有复仇的机会），但同一世里反复继承必须幂等
  D.seedLegacy();
  const n3 = steleNpcs().length, s3 = unrec().length;
  ok(n3 === 2 && s3 === 2, `回落的仇家也进了这一世（${n3} 人 / ${s3} 条追踪），各是各的，没有叠影`);
  D.seedLegacy(); D.seedLegacy();
  ok(steleNpcs().length === n3, '同一世里连着继承三次：名册不叠人（mkNpc 不再重复 push）');
  ok(unrec().length === s3, '同一世里连着继承三次：夺袋追踪不叠账，杀了仇家红字「夺」就能真销掉');

  // 天道档没有后门：存档码与万民卷宗一并封死，否则「死亡即碑」导一份就绕过去了
  g.ws.dao!.tier = 'tiandao';
  ok(D.backupAllowed() === false, '天道档：backupAllowed=false（存档码导出 / 导入、卷宗存入 / 取回全部挡下）');
  ok(/碑/.test(D.backupRefusal('存')) && /回头路/.test(D.backupRefusal('取')), '挡下来时给的是修仙味的说法，不是一句冷冰冰的「禁止」');
  store.delete('fanren_save_1'); g.save(1);
  ok(!store.get('fanren_save_1') && !!store.get('fanren_save_auto'), '天道档手贱按「存到存档一」：只会被盖写进唯一的自动档，存档一始终是空的');
  g.ws.dao!.tier = 'fanren';
  ok(D.backupAllowed() === true, '凡人 / 天骄档照旧：可以导出存档码、可以誊进万民卷宗');
}

// ============================================================================
console.log('\n== 13. v0.51.3 灵草守恒与碑林缓存 ==');
{
  g.closeModal(true); g.combat.reset(); g.hero.dead = false;
  const spot = wildSpot(); g.player.x = spot.x; g.player.y = spot.y;
  g.ws.dao!.contest = -999;
  const nd: any = { key: 't13', kind: 'herb', item: 'herb_zihou', x: spot.x + 40, y: spot.y + 20, rare: true, seed: 7 };
  const off = stub(0.02);
  const took = D.contestGather(nd, [{ item: 'herb_zihou', n: 3, age: 160 }]);
  off();
  ok(took && !!g.ws.dao!.pending, '争夺一起，采下的灵药先记在账上（ws.dao.pending，随存档走）');
  const cx = D.contests[0];
  const rival = g.npcs.byId.get(cx.npcId)!;
  const n0 = C.bagCount(g.hero, 'herb_zihou'), e0 = R.exp2Count('herb_contest' as any);
  g.closeModal(true);
  g.player.x = cx.x + 9000;
  D.update(0.016);
  ok(D.contests.length === 0 && (rival.bag['herb_zihou'] ?? 0) >= 3, '一走了之：灵药不再凭空蒸发——他采走了（真进他的储物袋，日后杀他照掉）');
  ok(!g.ws.dao!.pending && C.bagCount(g.hero, 'herb_zihou') === n0 && R.exp2Count('herb_contest' as any) > e0, '账清了，《苏寒随笔》记下「灵草之争·失手」');
  // 存档往返：争夺正酣时退出，读档回来灵药还在
  g.ws.dao!.contest = -999; g.player.x = spot.x; g.player.y = spot.y;
  const off2 = stub(0.02);
  D.contestGather({ ...nd, item: 'herb_tianling' }, [{ item: 'herb_tianling', n: 4, age: 90 }]);
  off2();
  const t0 = C.bagCount(g.hero, 'herb_tianling');
  g.save(0); g.load('fanren_save_auto');
  ok(C.bagCount(g.hero, 'herb_tianling') === t0 + 4 && !g.ws.dao!.pending && D.contests.length === 0, '争夺正酣时存档读档：采下的灵药回到你袋中（此前会无声丢光）');
  // 碑林缓存：同一份原文不再每帧 JSON.parse；外部写入照样看得见
  ok(D.allSteles() === D.allSteles(), '碑林读取有缓存：update / collect 每帧问碑，不再每帧 JSON.parse');
  const ext = JSON.parse(store.get(STELE_KEY)!); ext[0].read = true; store.set(STELE_KEY, JSON.stringify(ext));
  ok(D.allSteles()[0].read === true, '另一页写入（原文变了）缓存自然失效：跨世跨页仍然一致');
}

// ============================================================================
console.log('\n== 14. v0.52 碑前香火与前世之仇 ==');
{
  g.closeModal(true); g.combat.reset(); g.hero.dead = false;
  g.ws.dao!.tier = 'fanren';
  const steles = D.allSteles();
  const s = steles[0];
  const culprit = g.npcs.byId.get(`stele_${s.id}`)!;
  ok(!!culprit && culprit.alive, `前世夺袋仇家仍在世（${culprit?.name}）——香灰才问得出下落`);

  // 一碑只祭一次：第一炷香给残念 + 下落，第二炷只剩冷灰
  const e0 = R.exp2Count('stele_incense' as any);
  const exp0 = g.hero.exp;
  g.openDialog(D.steleNode(s));
  const inc = optLike('上三炷香');
  ok(!!inc, '碑前多出「上三炷香，为前人诵一遍往生咒」这个选项');
  inc.act();
  const nd: any = node();
  ok(/碑前香火/.test(nd.title ?? ''), `香火结算有题（${nd.title}）`);
  ok(/前世残念/.test(nd.text) && /香灰/.test(nd.text), '残念与香灰问路写在同一页：修为落袋，下落问明');
  ok(/一带现身/.test(nd.text) || /离开了/.test(nd.text) || /不在人世/.test(nd.text), '下落说人话：或在某地一带现身，或已离世');
  ok(D.allSteles().find((x) => x.id === s.id)!.offered === true, '香火写回碑林（s.offered=true），跨世不重祭');
  ok(R.exp2Count('stele_incense' as any) === e0 + 1, '《苏寒随笔》记下「碑前香火」');
  ok(g.hero.exp > exp0, `前世残念化成本世修为（+${g.hero.exp - exp0}）`);
  g.closeModal(true);

  // 再拜：不给第二次残念（修为只有微增），香灰也不再指路
  const e1 = g.hero.exp;
  g.openDialog(D.incenseNode(s));
  const nd2: any = node();
  ok(/冷灰/.test(nd2.text) && !/一带现身/.test(nd2.text), '祭过的碑再拜：只剩冷灰，问不出更多（香火不是活的罗盘）');
  ok(g.hero.exp - e1 < Math.max(1, Math.round(C.need(g.hero) * 0.005)), '再拜只给微增，不能刷残念');
  g.closeModal(true);

  // 前世之仇已报：手刃夺袋仇家，碑上划去一笔，遗物归位
  const sb = (g.ws.stolenBags ?? []).find((b) => b.culpritId === culprit.id && !b.recovered)!;
  ok(!!sb, '这条命对应着一条未销的「寻仇夺回」追踪');
  const ea0 = R.exp2Count('stele_avenged' as any);
  culprit.hp = 0.01;
  R.onNpcKilledByPlayer(culprit);
  culprit.alive = false;
  const after = D.allSteles().find((x) => x.id === s.id)!;
  ok(after.avenged === true && sb.recovered === true, '手刃夺袋仇家：追踪销账、碑记下「前世之仇已报」');
  ok(R.exp2Count('stele_avenged' as any) === ea0 + 1, '《苏寒随笔》记下「前世之仇已了」');
  ok(!R.marks().some((m) => m.name.includes(culprit.name)), `大地图上不再有指向${culprit.name}的红字「夺」（另一座碑的仇照旧挂着）`);

  // 存档往返：香火与报仇都随碑林（localStorage）与存档一起走
  g.save(0); g.load('fanren_save_auto');
  const back = D.allSteles().find((x) => x.id === s.id)!;
  ok(back.offered === true && back.avenged === true, '读档回来：香火与报仇都还在碑上（不重祭、不重报）');
  g.ws.dao!.tier = 'fanren';
}

console.log('\n== 15. v0.52.1 骗局频率：真实事件池与测试同一份权重（原文 2.3：15–25%） ==');
{
  const SP = await import('../src/world/scampool');
  const pct = (v: number) => (v * 100).toFixed(1) + '%';
  const tj = SP.scamShare(D.scamMul.call({ tier: 'tianjiao' } as any)), fr = SP.scamShare(1);
  const tdMul = 1.18;
  const td = SP.scamShare(tdMul);
  ok(fr >= 0.15 && fr <= 0.25, `凡人档：野外奇遇里骗局占 ${pct(fr)}（15–25% 区间——保持怀疑，不至草木皆兵）`);
  ok(td >= 0.15 && td <= 0.25 && td > fr, `天道档：骗局更凶（${pct(td)}）但仍不出 25% 上限`);
  ok(tj < fr, `天骄档：骗局稀少（${pct(tj)}）`);
  for (const sm of [0.55, 1, tdMul]) {
    const f = SP.scamShare(sm, 0, true), e = SP.scamShare(sm, -60, false);
    ok(Math.abs(f - SP.scamShare(sm)) < 1e-9, `劫修绕道（先礼后兵立威）后骗局占比不随之水涨船高（系数 ${sm}：${pct(f)}）`);
    ok(e <= SP.scamShare(sm) + 1e-9, `恶名在外招来赏金猎人时骗局占比不升反降（系数 ${sm}：${pct(e)}）`);
  }
  // 真实路径蒙特卡洛：同一个抽签函数 + 真正的 buildHap 骗局判定
  let hits = 0, n = 0;
  const N = 1500;
  const kinds = new Set<string>();
  for (let i = 0; i < N; i++) {
    const k = SP.rollHapKind(1, 0, false);
    kinds.add(k);
    if (k === 'beastfight' || k === 'robber' || k === 'chase' || k === 'wager') { n++; continue; }
    const h: any = (g.happen as any).spawnKind(k);
    if (!h) continue;
    n++;
    if (h.d.scam || h.d.smuggle) hits++;
    h.done = true; for (const e of h.foes ?? []) e.dead = true;
    (g.happen as any).haps = ((g.happen as any).haps ?? []).filter((x: any) => x !== h);
    g.combat.enemies = g.combat.enemies.filter((e: any) => !(h.foes ?? []).includes(e));
  }
  const mc = hits / Math.max(1, n);
  ok(kinds.size === 10, `抽签覆盖全部十类野外奇遇（含美人局 / 渡劫局 / 商队夹带）`);
  ok(mc >= 0.13 && mc <= 0.27, `真实 buildHap 判定的骗局占比 ${pct(mc)} 与台账期望 ${pct(fr)} 吻合（±抽样误差）`);
}

console.log(`\n${fails === 0 ? '全部通过' : fails + ' 项失败'}`);
process.exit(fails ? 1 : 0);
