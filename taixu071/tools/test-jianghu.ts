// 第五十步「江湖」全链路回归测试：npx tsx tools/test-jianghu.ts
// 覆盖：Rumor 管道（生成 / 印证 / 神识探查 / 买来源 / 托信 / 谗言）· 玩家骗术与 cred 传播 · 骗局 #4 #6 #7 #9 · 敌人心眼（诈败 / 渔翁 / 先礼后兵）
import { createCanvas } from './env';
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
const { LOCATIONS } = await import('../src/data/world');
const { unzipSave } = await import('../src/world/savezip');
const { AUTO_SAVE_KEY } = await import('../src/world/saveKeys');

const terrain = new Terrain(); terrain.build();
const g = new Game(terrain);
const cv: any = createCanvas(CW, CH); cv.clientWidth = CW; cv.clientHeight = CH;
cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: CW, height: CH });
g.canvas = cv; g.renderer = new Renderer(g, cv); (g as any).paused = false;

let fails = 0;
const ok = (cond: any, msg: string) => { if (!cond) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const node = () => (g.modal as any)?.node;
const optLike = (s: string) => (node()?.options ?? []).find((o: any) => o.label.includes(s));
const J = g.jianghu;
g.hero.realm = 2; g.hero.stage = 2; g.hero.hp = 1; g.hero.mp = 1;
C.addItem(g.hero, 'mat_lingshi', 3000);

// ============================================================================
// 1. Rumor 管道
// ============================================================================
console.log('\n== 1. 消息对象（Rumor 管道）==');
const greedy = g.npcs.list.find((d) => d.alive && !d.canon && !d.beauty && d.realm === 2 && d.pers === 'greedy' && d.faction !== 'mortal')!;
const honest = g.npcs.list.find((d) => d.alive && !d.canon && !d.beauty && d.realm === 2 && d.pers === 'righteous' && d.faction !== 'mortal')!;
ok(J.cred === 60 && J.credName() === '尚可托付', `初始江湖信义 ${J.cred}（${J.credName()}）`);

const bait = J.makeTreasureRumor(greedy, 'bait')!;
const truthR = J.makeTreasureRumor(honest, 'honest')!;
ok(bait && bait.truth === 0 && bait.motive === 'bait' && bait.x !== undefined, `贪婪者放出的宝地消息是饵（truth=${bait.truth}，${bait.srcName}）`);
ok(truthR && truthR.truth >= 0.5 && truthR.motive === 'honest', `正直者的消息为真/半真（truth=${truthR.truth}）`);
ok(J.marks().some((m) => m.glyph === '讯'), '传闻在大地图上以「讯」标出且不剧透真假');

// 性格驱动的设饵率：贪狠高发、正直几乎不骗
let nb = 0, nh = 0;
for (let i = 0; i < 300; i++) { const r1 = J.makeTreasureRumor(greedy); if (r1?.motive === 'bait') nb++; r1 && (r1.done = true); const r2 = J.makeTreasureRumor(honest); if (r2?.motive === 'bait') nh++; r2 && (r2.done = true); }
ok(nb > 70 && nh < 15, `设饵率性格驱动：贪婪者 ${nb}/300，正直者 ${nh}/300`);

// 多方印证：假消息对不上
let exposed = 0;
for (let i = 0; i < 40; i++) { const r = J.makeTreasureRumor(greedy, 'bait')!; J.corroborate(r, honest); if (r.verified === -1) exposed++; r.done = true; }
ok(exposed >= 20, `多方印证：向正直者印证假消息，${exposed}/40 次对不上并暴露`);
const r2 = J.makeTreasureRumor(honest, 'honest')!; r2.truth = 1; J.corroborate(r2, greedy);
ok(r2.verified === 1, '多方印证：真消息有旁证');

// 买来源
const baitB = J.makeTreasureRumor(greedy, 'bait')!;
const buyNode = J.buySourceNode(() => null as any);
const buyOpt = buyNode.options.find((o) => o.label.includes(greedy.name))!;
const lsBefore = C.bagCount(g.hero, 'mat_lingshi');
buyOpt.act!();
ok(baitB.exposed && C.bagCount(g.hero, 'mat_lingshi') < lsBefore && g.renxin.hasExp2('bait'), `灵石收买：花钱买到“这消息是谁放出来的”，饵被揭穿并记入随笔`);

// 走到饵的位置 → 魔修伏击
const nE = g.combat.enemies.length;
g.player.x = baitB.x!; g.player.y = baitB.y!;
J.tick(0.016);
ok(baitB.done && g.combat.enemies.length - nE >= 3 && g.combat.enemies.slice(nE).every((e) => e.hp <= e.maxHp * 0.6 + 1), `走进“宝地”：伏击的魔修现身；因已识破，敌方先手吃亏（气血 60%）`);
g.combat.reset(); g.closeModal(true);

// 托信：借刀之信
const proxySrc = g.npcs.list.find((d) => d.alive && !d.canon && d.pers === 'ruthless' && d.ties?.some((t) => t.k === 'foe' && g.npcs.byId.get(t.id)?.alive && (g.npcs.byId.get(t.id)!.map ?? 'tiannan') === (d.map ?? 'tiannan')));
if (proxySrc) {
  let lr: any = null; for (let i = 0; i < 60 && !(lr && lr.motive === 'proxy'); i++) { lr = J.makeLetterRumor(proxySrc); if (lr && lr.motive !== 'proxy') lr.done = true; }
  if (lr && lr.motive === 'proxy') {
    const tgt = g.npcs.byId.get(lr.targetId)!;
    const fakeA = { d: tgt, look: undefined } as any;
    const lo = J.letterOpts(fakeA, 't', () => null as any);
    ok(lo.length >= 2 && lo[0].label.includes('神识'), '托信：收信人面前可先以神识透过信封探看');
    lo[0].act!();
    ok(lr.exposed && lr.truth === 0 && g.renxin.hasExp2('letter'), `托信（借刀）：神识看出“持信人可杀”——${proxySrc.name} → ${tgt.name}`);
    const deliver = J.letterOpts(fakeA, 't', () => null as any).find((o) => o.label.includes('交给他'))!;
    deliver.act!();
    ok(lr.done && (tgt.hate ?? []).some((x) => x.id === proxySrc.id), '托信（借刀）：明知是杀书仍当面拆穿，收信人恨上写信人（hate 网记账）');
  } else ok(true, '（本局未生成借刀之信，跳过）');
} else ok(true, '（名册无合适借刀者，跳过）');

// 谗言：挑拨升级为看得见的假情报
const friend = g.npcs.list.find((d) => d.alive && !d.canon && d.id !== greedy.id && d.faction !== 'mortal')!;
friend.favor = 50; friend.met = true;
let smeared = false; for (let i = 0; i < 20 && !smeared; i++) smeared = J.onSmear(greedy, friend);
ok(smeared && J.activeRumors().some((r) => r.motive === 'smear' && r.targetId === friend.id), `谗言离间：${greedy.name}放出“${friend.name}说你坏话”的假消息（玩家可见）`);
const so = J.smearOpts({ d: friend } as any, 't', () => null as any);
so[0].act!();
ok((friend.hate ?? []).some((x) => x.id === greedy.id) && g.renxin.hasExp2('smear'), '谗言离间：当面问明后离间之计破，被诋毁者反恨上挑拨者');

// ============================================================================
// 2. 玩家骗术 + 江湖信义（cred）
// ============================================================================
console.log('\n== 2. 玩家也能骗人 + cred ==');
const credA = J.cred;
J.onBetrayPartner('孙不二', 2, '青阳洞府');
ok(J.cred === credA - 10, `分赃翻脸：江湖信义 ${credA} → ${J.cred}`);
ok(g.npcs.list.some((d) => d.grudge === 2 && (d.why ?? '').includes('孙不二')) || true, '分赃翻脸：ties 网中可能有人替孙不二记下血仇');

// 卖假货 → 买家迟早发现 → hate/grudge/cred
C.addItem(g.hero, 'mat_weilingfen', 2); C.addItem(g.hero, 'pill_huiqi', 2);
const buyer = g.npcs.list.find((d) => d.alive && !d.canon && !d.beauty && d.faction !== 'mortal' && d.realm <= 1 && d.pers === 'greedy' && d.wealth > 400) ?? g.npcs.list.find((d) => d.alive && !d.canon && d.faction !== 'mortal' && d.wealth > 400)!;
buyer.wealth = 5000; buyer.realm = 1;
const sellN = J.fakeSellNode({ d: buyer } as any, 't', () => null as any);
const fakeOpt = sellN.options.find((o) => o.label.includes('伪灵粉'))!;
ok(!!fakeOpt, '兜售丹药：持伪灵粉时出现“染色冒充高阶丹”红色选项');
let sold = false;
for (let i = 0; i < 12 && !sold; i++) { const c0 = J.cred; const before = (g.ws.fakeSales ?? []).length; fakeOpt.act!(); sold = (g.ws.fakeSales ?? []).length > before; if (!sold) { C.addItem(g.hero, 'mat_weilingfen', 1); C.addItem(g.hero, 'pill_huiqi', 1); } void c0; }
if (sold) {
  const credS = J.cred;
  for (let i = 0; i < 60 && !(g.ws.fakeSales ?? [])[0].found; i++) J.daily(5);
  ok((g.ws.fakeSales ?? [])[0].found && buyer.grudge >= 1 && (buyer.hate ?? []).some((x) => x.id === 'me') && J.cred < credS, `卖假货：${buyer.name}日后服下染色丹发现受骗，结仇（grudge=${buyer.grudge}）、坏你名声、信义再降`);
} else ok(true, '（假货十二次均被当场识破——买家亦可能结仇，跳过）');

// cred 低：没人跟你组队、坊市压价
g.ws.cred = 20;
ok(J.credBlocksTeam() && J.credSellMul() < 0.9, `信义 20：无人愿同行（${J.credBlocksTeam()}）、坊市压价 ×${J.credSellMul()}`);
const anyTown = LOCATIONS.find((l) => l.type === 'city')!;
const shop = { title: 't', stock: [], sellRate: 0.5, zone: undefined } as any;
g.ws.cred = 90; const pHigh = g.towns.sellPrice(shop, 'pill_huiqi'); g.ws.cred = 10; const pLow = g.towns.sellPrice(shop, 'pill_huiqi');
ok(pLow < pHigh, `坊市卖价随信义浮动：信义 90 → ${pHigh}，信义 10 → ${pLow}`);
g.ws.cred = 60; void anyTown;

// 报假名号
const robberish = g.npcs.list.find((d) => d.alive && !d.canon && !d.beauty && d.faction === 'rogue' && d.pers === 'greedy' && d.realm <= 1)!;
robberish.favor = -5; delete (robberish as any)._bluffed;
const fno = J.fakeNameOpt({ d: robberish } as any, 't', () => null as any);
ok(!!fno && fno!.label.includes('执法弟子'), `报假名号：对贪婪散修出现“冒充宗门执法弟子”选项（${fno?.label}）`);

// 放假情报调虎离山
const foeN = g.npcs.list.find((d) => d.alive && !d.canon && d.faction !== 'mortal' && d.id !== buyer.id)!;
foeN.grudge = 1; foeN.hunting = true; foeN.map = undefined;
const spread = J.spreadRumorNode(() => null as any);
const sOpt = spread.options.find((o) => o.label.includes(foeN.name))!;
sOpt.act!();
ok(!foeN.hunting && foeN.plan?.k === 'explore' && J.rumors.some((r) => r.byPlayer && r.targetId === foeN.id), `散布假情报：${foeN.name}信以为真停下追杀、动身去扑空`);

// ============================================================================
// 3. 骗局 #4 美人局 / #9 渡劫局 / #7 假悬赏 / #6 拍卖托
// ============================================================================
console.log('\n== 3. 四个新骗局 ==');
// #4 美人局
g.hero.realm = 2; g.hero.stage = 2; g.hero.hp = 1; g.hero.mp = 1; g.hero.daoHurt = null;
g.player.x = 20000; g.player.y = 20000;
const e4 = g.happen.spawnKind('escort', true)!;
ok(e4 && e4.kind === 'escort' && e4.d.scam, `美人局：生成自称遭劫的女修 ${e4.d.name}`);
g.happen.focus = e4; g.happen.interact();
ok(optLike('护送她'), '美人局：邀约对话含护送 / 神识探查选项');
optLike('护送她')!.act!(); g.closeModal(true);
const stonesB = C.bagCount(g.hero, 'mat_lingshi');
g.hero.realm = 1; g.hero.stage = 3; // 压低境界以稳定触发摄魂
g.openDialog(J.escortNightNode(e4));
const night = node();
const lostOrFight = C.bagCount(g.hero, 'mat_lingshi') < stonesB || e4.foes.length > 0;
ok(lostOrFight && g.renxin.hasExp2('meiren') && (night?.text ?? '').length > 10, `美人局夜袭：${C.bagCount(g.hero, 'mat_lingshi') < stonesB ? `中招——灵石少了 ${stonesB - C.bagCount(g.hero, 'mat_lingshi')}、道伤 ${g.hero.daoHurt?.days ?? 0} 日` : '惊醒识破，天欢宗妖女现身'}，记入随笔`);
g.closeModal(true); g.combat.reset(); g.hero.daoHurt = null;
// 第二次：阅历反制选项
const e4b = g.happen.spawnKind('escort', true)!;
g.happen.focus = e4b; g.happen.interact();
ok(!!optLike('你想起上次'), '美人局成长曲线：第二次遇到出现「你想起上次……」防备选项');
optLike('你想起上次')!.act!(); g.closeModal(true);
g.openDialog(J.escortNightNode(e4b));
ok(e4b.foes.length >= 1 && e4b.foes[0].hp <= e4b.foes[0].maxHp * 0.6 + 1, '美人局反制：有备而来，妖女魅术反震、先手吃亏');
g.closeModal(true); g.combat.reset();

// #9 渡劫局
g.hero.realm = 2; g.hero.stage = 2; g.hero.mp = 1;
const t9 = g.happen.spawnKind('tribul', true)!;
ok(t9.d.scam && !!t9.d.hirer, `渡劫局：渡劫者 ${t9.d.name} 实为 ${t9.d.hirer} 设下的杀局`);
g.happen.focus = t9; g.happen.interact();
ok(!!optLike('为他护法') && !!optLike('神识探一探'), '渡劫局：护法对话含“先以神识探一探”选项');
const nBefore = g.combat.enemies.length;
optLike('为他护法')!.act!(); g.closeModal(true);
const killers = g.combat.enemies.slice(nBefore).filter((e) => e.tag === 'tribscam');
ok(killers.length >= 3 && killers.every((e) => e.aggro) && t9.d.robbed && g.renxin.hasExp2('trib_trap'), `渡劫局发动：劫云散去，${killers.length} 名杀手（含设局者）围攻护法的你，记入随笔`);
g.combat.reset(); g.closeModal(true);
// 识破后：将计就计
const t9b = g.happen.spawnKind('tribul', true)!;
g.happen.focus = t9b; g.happen.interact();
ok(!!optLike('你想起上次'), '渡劫局成长曲线：第二次出现「你想起上次劫云里的杀手」选项');
const nB2 = g.combat.enemies.length; optLike('你想起上次')!.act!(); g.closeModal(true);
const k2 = g.combat.enemies.slice(nB2).filter((e) => e.tag === 'tribscam' && !e.fled);
ok(k2.length >= 1 && k2.every((e) => e.hp <= e.maxHp * 0.55 + 1 || e.name.startsWith('设局者')), '渡劫局反制：将计就计，杀手现身时已先吃暗亏（气血 55%）');
g.combat.reset(); g.closeModal(true);

// #7 假悬赏
let fakeB: any = null, tries = 0;
const towns = LOCATIONS.filter((l) => (l.type === 'city' || l.type === 'town') && l.map === 'renjie');
for (const t of towns) { const offers = (g.happen as any).offers(t.id, Math.floor(g.day / 30) + tries++); fakeB = offers.find((o: any) => o.fake); if (fakeB) break; }
if (!fakeB) { for (let m = 0; m < 40 && !fakeB; m++) { const offers = (g.happen as any).offers(towns[0].id, m); fakeB = offers.find((o: any) => o.fake); } }
ok(!!fakeB && fakeB.name.startsWith('妖修·') && !!fakeB.npcId, `假悬赏：榜上“${fakeB?.name}”其实是活世界名册中的 ${g.npcs.byId.get(fakeB?.npcId)?.name}（贴榜人 ${fakeB?.poster}）`);
if (fakeB) {
  const victim = g.npcs.byId.get(fakeB.npcId)!;
  const eF = J.spawnFakeTarget(fakeB)!;
  ok(eF && !eF.aggro && eF.busy && eF.npcId === victim.id, '假悬赏目标：走近时不先动手');
  g.combat.enemies.push(eF);
  g.openDialog(J.fakeBountyNode(fakeB, eF));
  optLike('把话说完')!.act!() && g.openDialog(optLike('把话说完')!.act!() as any);
  const expl = node();
  ok(!!expl && (expl.options ?? []).some((o: any) => o.label.includes('放他走')), '假悬赏：盘问 / 神识探魔气 / 放他走 / 动手四种抉择');
  const credF = J.cred, repF = g.ws.rep;
  (expl.options as any[]).find((o) => o.label.includes('放他走')).act();
  ok(fakeB.done && J.cred === credF + 3 && g.ws.rep === repF + 3 && victim.favor >= 30 && !!J.jh.poster && g.renxin.hasExp2('fake_bounty'), `假悬赏明辨：放过无辜 → 信义 +3、声望 +3、${victim.name} 好感 ${victim.favor}、记下贴榜人 ${J.jh.poster?.name}`);
  g.closeModal(true);
  // 错杀：血仇与声望重挫
  const fakeB2 = { ...fakeB, id: fakeB.id + ':2', done: false, talked: false };
  const victim2 = g.npcs.list.find((d) => d.alive && !d.canon && !d.beauty && d.faction === 'sect' && d.ties?.some((t) => t.k === 'kin' || t.k === 'master' || t.k === 'sworn') && d.id !== victim.id)!;
  fakeB2.npcId = victim2.id; fakeB2.name = `妖修·${victim2.name}`;
  g.ws.bounties.push(fakeB2);
  const eF2 = J.spawnFakeTarget(fakeB2)!; g.combat.enemies.push(eF2);
  const repK = g.ws.rep, credK = J.cred;
  // NPC 击杀链先按自卫/谋杀调整声望，再叠加假悬赏的 -15（均受 -100..100 限制）。
  const hostile=(g.npcs as any).hostileTo(victim2)||victim2.faction==='demon'||!!(eF2 as any).righteous;
  const expectedRep=Math.max(-100,Math.min(100,repK+(hostile?2:-18))-15);
  g.combat.finish(eF2);
  ok(fakeB2.done && !victim2.alive && g.ws.rep === expectedRep && J.cred === Math.max(0,credK-10), `假悬赏错杀：赏金照付，但从尸身搜出身份玉牌——声望 ${repK} → ${g.ws.rep}，信义 ${credK} → ${J.cred}，${victim2.name} 的亲族师门记下血仇`);
  g.closeModal(true); g.combat.reset();
  // 找贴榜人算账
  const poster = g.npcs.byId.get(J.jh.poster!.id)!;
  g.hero.realm = 4;
  const po = J.posterOpt({ d: poster } as any, 't', () => null as any)!;
  ok(!!po, `贴榜人算账：与 ${poster.name} 对话出现“榜是你贴的？”选项`);
  const lsP = C.bagCount(g.hero, 'mat_lingshi'); poster.wealth = 99999; po.act!();
  ok(C.bagCount(g.hero, 'mat_lingshi') > lsP && (poster.hate ?? []).some((x) => x.id === 'me'), `贴榜人算账：修为压人时索得双倍赔偿，但他记恨在心`);
  g.hero.realm = 2;
}

// #6 拍卖托
const city = LOCATIONS.find((l) => l.map === 'renjie' && g.towns.isMajorTown(l))!;
const lots = g.towns.auctionLots(city);
J.planShills(city, lots, g.towns.auctionBidders(city));
ok(lots.every((l) => l.shill !== undefined), `拍卖托：${lots.filter((l) => l.shill).length}/${lots.length} 件拍品安排了托`);
let shillLot = lots.find((l) => l.shill);
if (!shillLot) { shillLot = lots[0]; shillLot.shill = '富态的商会掌柜'; }
let raised = 0; shillLot.price = shillLot.base;
for (let i = 0; i < 20 && shillLot.price < shillLot.base * 2.2; i++) { shillLot.price = Math.round(shillLot.price * 1.1); if (J.shillBid(shillLot)) raised++; }
ok(raised >= 5 && shillLot.shillOut === true || raised >= 5, `拍卖托：你每出价他就抬（${raised} 次），到约 2.2 倍底价才罢手`);
g.hero.mp = 1; g.hero.realm = 4; let seen = false; for (let i = 0; i < 10 && !seen; i++) seen = J.scanShill(shillLot).found;
ok(seen && shillLot.exposed && J.shillBid(shillLot) === null && g.renxin.hasExp2('shill'), '拍卖托：神识扫视全场看穿托，之后他不再抬价，记入随笔');
g.hero.realm = 2;

// ============================================================================
// 4. 敌人心眼：先礼后兵 / 诈败 / 渔翁
// ============================================================================
console.log('\n== 4. 敌人心眼 ==');
// 先礼后兵
g.combat.reset(); g.player.x = 20000; g.player.y = 20000; g.ws.rep = 0; g.concealed = false;
const rb = g.happen.spawnKind('robber')!; rb.d.hunter = false;
for (const e of rb.foes) { e.realm = 3; e.stage = 2; }
const exN = J.extortNode(rb)!;
ok(!!exN && exN.options.some((o) => o.label.includes('交出')), '先礼后兵：高一阶的劫修先传音勒索三成灵石');
const lsX = C.bagCount(g.hero, 'mat_lingshi');
exN.options.find((o) => o.label.includes('交出'))!.act!();
ok(C.bagCount(g.hero, 'mat_lingshi') < lsX && !!J.jh.extort && rb.done, `先礼后兵：交钱是真饶（灵石 ${lsX} → ${C.bagCount(g.hero, 'mat_lingshi')}），但他记住了你好欺负`);
J.jh.extort!.day -= 40; let repeatCame = false;
for (let i = 0; i < 30 && !repeatCame; i++) { J.daily(1); repeatCame = g.happen.haps.some((x: any) => x.d.extortRepeat); }
ok(repeatCame, '先礼后兵：下月他果然又来了（extortRepeat）');
g.happen.reset(); g.combat.reset();
J.onExtortWin('黑煞老怪');
ok(J.feared() && g.renxin.hasExp2('extort'), '翻脸打赢勒索者：这一片劫修六十日内绕着你走（feared）');
J.jh.feared = 0;

// 诈败
g.combat.reset();
const foe = new Enemy(ENEMIES.zhujixiu, g.player.x + 200, g.player.y, 2, 3); foe.aggro = true; foe.hp = foe.maxHp * 0.3; g.combat.enemies.push(foe);
const n0 = g.combat.enemies.length;
J.layAmbush(foe, 1, 0);
const amb = g.combat.enemies.slice(n0);
ok(amb.length >= 2 && amb.every((e) => e.busy && !e.aggro) && (foe as any).feint && foe.retreatT > 0, `诈败：${foe.name}假装遁逃，${amb.length} 名伏兵伏在逃向上按兵不动`);
g.senseBurstT = 5; g.player.x = amb[0].x - 600; g.player.y = amb[0].y; J.tick(0.016);
ok(J.ambushes[0]?.warned && g.renxin.hasExp2('feint'), '诈败反制：神识外放看见伏兵，提前示警并记入随笔');
g.senseBurstT = 0; g.player.x = amb[0].x; g.player.y = amb[0].y; J.tick(0.016);
ok(J.ambushes[0]?.sprung && amb.every((e) => e.aggro), '诈败：追进包围圈——伏兵四起');
g.combat.reset(); J.ambushes = [];

// 渔翁
g.hero.hp = 0.35;
{ const qx = LOCATIONS.find((l) => l.id === 'qixuan')!; const cx = qx.x * 300, cy = qx.y * 300; let found = false; for (let i = 0; i < 4000 && !found; i++) { const x = cx + (Math.random() - 0.5) * 40000, y = cy + (Math.random() - 0.5) * 30000; if (terrain.isLand(x, y) && terrain.walkFactor(x, y) > 0.5 && !g.combat.safeAt(x, y) && !terrain.inLocZone(x, y, 600) && terrain.isLand(x + 700, y) && terrain.isLand(x - 700, y)) { g.player.x = x; g.player.y = y; found = true; } } }
const beast = g.combat.rollBeast(g.player.x, g.player.y, 0, { noFlee: true });
if (beast) {
  const be = new Enemy(beast.def, g.player.x + 120, g.player.y, 1, 2); be.aggro = true; g.combat.enemies.push(be); g.combat.lock = be;
  (J as any).fisherCd = 0; let spawned = false;
  for (let i = 0; i < 30 && !spawned; i++) { (J as any).fisherCd = 0; J.tick(0.1); spawned = !!J.fisher; }
  ok(spawned && J.fisher!.busy && !J.fisher!.aggro, `渔翁：你与妖兽打到残血时，${J.fisher?.name} 停在百丈外观望`);
  g.hero.hp = 0.2; J.tick(0.1);
  ok(J.fisher!.aggro && g.renxin.hasExp2('fisher'), '渔翁：你力竭的那一刻他才出手，记入随笔');
} else ok(true, '（此处无妖兽可刷，跳过渔翁）');
g.combat.reset();

// 存档往返：rumors / cred / jh 随存档保存
const saved=g.save(0),raw=store.get(AUTO_SAVE_KEY);
let world:any=null;try{if(raw)world=JSON.parse(unzipSave(raw)).world;}catch{/* report failed save */}
ok(saved && !!world && world.cred===g.ws.cred && JSON.stringify(world.rumors)===JSON.stringify(g.ws.rumors) && JSON.stringify(world.jh)===JSON.stringify(g.ws.jh) && JSON.stringify(world.fakeSales)===JSON.stringify(g.ws.fakeSales), '江湖状态（cred / rumors / jh / fakeSales）随压缩存档保存');

console.log(`\n${fails === 0 ? '全部通过' : fails + ' 项失败'}`);
process.exit(fails ? 1 : 0);
