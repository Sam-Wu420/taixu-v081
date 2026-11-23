// 第四十九步「人心」全链路回归测试：npx tsx tools/test-renxin.ts
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
const { drawMindBubble } = await import('../src/world/alive');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');

const terrain = new Terrain(); terrain.build();
const g = new Game(terrain);
const cv: any = createCanvas(CW, CH); cv.clientWidth = CW; cv.clientHeight = CH;
cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: CW, height: CH });
g.canvas = cv; g.renderer = new Renderer(g, cv); (g as any).paused = false;

let fails = 0;
const ok = (cond: any, msg: string) => {
  if (!cond) { fails++; console.log('FAIL', msg); }
  else console.log('ok  ', msg);
};

// ============================================================================
// 1. 表里系统与心声泡读心博弈（2.1）
// ============================================================================
console.log('\n== 1. 表里系统与读心博弈 ==');
const greedyNpc = g.npcs.list.find((d) => d.alive && !d.canon && d.realm === 2 && d.pers === 'greedy')!;
const righteousNpc = g.npcs.list.find((d) => d.alive && !d.canon && d.realm === 2 && d.pers === 'righteous')!;
const oldMonster = g.npcs.list.find((d) => d.alive && d.realm >= 3 && d.pers === 'ruthless')!;

greedyNpc.favor = -18;
righteousNpc.favor = 10;
g.hero.realm = 1; g.hero.stage = 8;
C.addItem(g.hero, 'mat_lingshi', 500);

const shownGreedy = g.renxin.shownFavor(greedyNpc);
const shownRighteous = g.renxin.shownFavor(righteousNpc);
ok(shownGreedy >= 20 && shownGreedy - greedyNpc.favor >= 30, `贪婪者表里不一：真实好感 ${greedyNpc.favor}，表演好感 ${shownGreedy}`);
ok(Math.abs(shownRighteous - righteousNpc.favor) <= 3, `正人君子表里如一：真实 ${righteousNpc.favor}，表演 ${shownRighteous}`);

// 同阶/低阶看贪婪者：显示假心声，不描金
const lowRead = g.renxin.filterThought(greedyNpc, '这人的储物袋鼓鼓的……', 0)!;
ok(!lowRead.gold && lowRead.text !== '这人的储物袋鼓鼓的……', `低境界未压制时只见表演假心声：「${lowRead.text}」`);

// 受威压（sup=1）或高出 2 个大境界：看穿真心声且描金！
const supRead = g.renxin.filterThought(greedyNpc, '这人的储物袋鼓鼓的……', 1)!;
ok(supRead.gold && supRead.text === '这人的储物袋鼓鼓的……', '神识威压压制时看穿描金真心声');

g.hero.realm = 4; // 元婴看筑基（高 2 大境界）
const highRead = g.renxin.filterThought(greedyNpc, '这人的储物袋鼓鼓的……', 0)!;
ok(highRead.gold && highRead.text === '这人的储物袋鼓鼓的……', '高出 2 个大境界直接看穿描金真心声');

// 结丹+ ruthless 老怪物：即便被威压（sup=1），高不到 3 境且无天衍诀外放时心声仍是假的！
oldMonster.realm = 3;
g.hero.realm = 4; g.hero.gongfa = 'changchun'; g.senseBurstT = 0;
const elderRead = g.renxin.filterThought(oldMonster, '待此子松懈便出手夺宝。', 1)!;
ok(!elderRead.gold && elderRead.text !== '待此子松懈便出手夺宝。', `结丹+狠辣老怪物被压制时仍能伪造心声：「${elderRead.text}」`);

// 心声气泡三种样式绘制无异常
const ctx2d = cv.getContext('2d')!;
drawMindBubble(ctx2d, 200, 200, '寻常心声', 13, 1, false, false);
drawMindBubble(ctx2d, 200, 240, '描金真心声', 13, 1, true, false);
drawMindBubble(ctx2d, 200, 280, '露出破绽的假心声', 13, 1, false, true);
ok(true, '心声泡（普通 / 描金真意 / 破绽虚边）Canvas 绘制正常');

// ============================================================================
// 2. 骗局池触发率（15–25%）与四大骗局闭环（2.3 + 2.5）
// ============================================================================
console.log('\n== 2. 骗局触发率与四大骗局闭环 ==');
// 统计自然野外事件池中的骗局占比——v0.52.1 起直接用游戏里的同一份权重（world/scampool.ts），不再测试里另抄一份
const SP = await import('../src/world/scampool');
let scamHits = 0;
const N_TRIALS = 4000;
for (let i = 0; i < N_TRIALS; i++) {
  const k = SP.rollHapKind(1, 0, false);
  if (Math.random() < SP.hapScamP(k, 1)) scamHits++;
}
const scamRate = scamHits / N_TRIALS;
console.log(`野外动态事件骗局触发率 = ${(scamRate * 100).toFixed(1)}%（台账期望 ${(SP.scamShare(1) * 100).toFixed(1)}%）`);
ok(SP.scamShare(1) >= 0.15 && SP.scamShare(1) <= 0.25 && scamRate >= 0.14 && scamRate <= 0.26, `野外事件骗局占比处于 15%–25% 区间（实测 ${(scamRate * 100).toFixed(1)}%）`);

// 性格骗局率对比
let badScam = 0, goodScam = 0;
for (let i = 0; i < 500; i++) {
  if (g.renxin.rollScam('ruthless')) badScam++;
  if (g.renxin.rollScam('cautious')) goodScam++;
}
ok(badScam > 180 && goodScam < 45, `性格驱动骗局：狠辣者高发（${badScam}/500），谨慎者极低（${goodScam}/500）`);

// --- 骗局 #1：合作探宝，分赃翻脸 + 阅历反制 ---
g.hero.realm = 2; g.hero.stage = 1; g.hero.hp = 1;
const h1 = g.happen.spawnKind('coopruin', true)!;
g.happen.focus = h1; g.happen.interact(); // 接下邀约
const inviteOpt = (g.modal as any)?.node?.options?.[0];
inviteOpt?.act?.(); g.closeModal(true);
g.happen.focus = h1; g.happen.interact(); // 开石匣 → 遭背刺！
ok(g.hero.hp < 0.85 && g.renxin.hasExp2('ruin_betray'), `骗局 #1（合作探宝翻脸）：开箱遭背刺损血，自动记入《苏寒随笔》阅历`);
g.closeModal(true); g.combat.reset();

// 第二次遇到合作探宝：验证解锁「（你想起上次……）」反制选项！
const h1b = g.happen.spawnKind('coopruin', true)!;
g.happen.focus = h1b; g.happen.interact();
const opts1b = ((g.modal as any)?.node?.options ?? []).map((o: any) => o.label);
ok(opts1b.some((l: string) => l.includes('你想起上次')), `骗局 #1 成长曲线：第二次遇到合作探宝自动出现「你想起上次……」防备选项`);
g.closeModal(true);

// --- 骗局 #2：假丹药 / 假玉简 + 丹师掌眼鉴定 + 误服反噬 ---
const townLoc = g.npcs.list.find((d) => d.home === 'jiayuan') ? { id: 'jiayuan', name: '嘉禾城', type: 'city', x: 100, y: 100, ox: 100, oy: 100, map: 'tiannan', desc: '' } as any : null;
C.addFakeItem(g.hero, 'pill_zhuji', 1, 'dyed', greedyNpc.id, greedyNpc.name);
const fakeIdx = g.hero.bag.findIndex((b) => b.id === 'pill_zhuji' && b.fake);
ok(fakeIdx >= 0 && g.hero.bag[fakeIdx].ident === false, '骗局 #2：购入假筑基丹时未鉴定前与真品混同');
const appRes = g.renxin.appraiseBagSlot(fakeIdx, true, 0);
ok(appRes.isFake && g.hero.bag[fakeIdx].ident === true && C.bagCount(g.hero, 'pill_zhuji') === 0, '骗局 #2：坐堂老丹师 100% 鉴出染色假筑基丹，鉴明后不再计入可用真丹');
if (townLoc) {
  const ghost = g.renxin.ghostMarketShop(townLoc);
  ok(ghost.isStall && ghost.stock.length >= 3, `骗局 #2：城镇鬼市地摊正常生成（货品 ${ghost.stock.length} 件）`);
}
// 假玉简强行参悟反噬道伤
g.hero.daoHurt = null;
C.addFakeItem(g.hero, 'scroll_qingyuan', 1, 'broken', greedyNpc.id, greedyNpc.name);
const scIdx = g.hero.bag.findIndex((b) => b.id === 'scroll_qingyuan' && b.fake);
const learned = g.learnScroll('scroll_qingyuan', scIdx);
ok(!learned && C.hasDaoHurt(g.hero), `骗局 #2：未鉴定强练残缺假玉简触发经脉反噬与道伤（${g.hero.daoHurt?.days} 日）`);
g.closeModal(true); g.hero.daoHurt = null;

// --- 骗局 #3：借刀杀人 → 误杀无辜触发 relations.ts 真实血仇网 ---
const h3 = g.happen.spawnKind('borrowknife', true)!;
g.happen.focus = h3; g.happen.interact();
((g.modal as any)?.node?.options?.[0])?.act?.(); g.closeModal(true);
const victimEnemy = h3.foes[0]!;
const victimData = g.npcs.byId.get(victimEnemy.npcId!)!;
const kinList = (victimData.ties ?? []).filter((t) => t.k === 'kin' || t.k === 'lover' || t.k === 'master' || t.k === 'disciple' || t.k === 'sworn');
g.combat.finish(victimEnemy); // 玩家不问青红皂白斩杀目标
const angryKin = kinList.some((t) => (g.npcs.byId.get(t.id)?.grudge ?? 0) >= 2);
ok(angryKin && g.renxin.hasExp2('borrow_knife'), `骗局 #3（借刀杀人）：误杀宿敌 ${victimData.name} 后，其亲族/同门真实结下死敌血仇（grudge=2）并记入随笔`);
g.closeModal(true);

// --- 骗局 #5：夺舍老魔 → 识海幻境战 / 神识反吞 ---
const senseBefore = g.hero.senseBonus;
g.hero.gongfa = 'dayan'; C.addItem(g.hero, 'mat_yanghunmu', 1); g.hero.realm = 3;
const dNode = g.renxin.duosheNode('玄骨老怪', 2, true, greedyNpc as any, { x: g.player.x, y: g.player.y }, () => {});
const touchOpt = dNode.options.find((o) => o.label.includes('渡入一口精纯灵力'))!;
const afterTouch = touchOpt.act!() as any;
ok(g.hero.senseBonus > senseBefore && afterTouch?.title?.includes('反吞'), `骗局 #5（夺舍老魔）：修天衍诀+养魂木时神识反吞老魔残魂，永久神识暴涨`);

// ============================================================================
// 3. 战败重做 + 道伤 + 掉袋追回销赃链 + 死敌补刀（3.1）
// ============================================================================
console.log('\n== 3. 战败重做、道伤与掉袋销赃追回链 ==');
g.hero.daoHurt = null;
const baseRate = C.expPerDay(g.hero, 1);
const baseMp = C.heroStats(g.hero).mp;
C.inflictDaoHurt(g.hero, 30, '测试经脉受损');
const hurtRate = C.expPerDay(g.hero, 1);
const hurtMp = C.heroStats(g.hero).mp;
ok(Math.abs(hurtRate / baseRate - 0.6) < 0.02, `道伤惩罚：修炼速度精确 -40%（${baseRate.toFixed(1)} → ${hurtRate.toFixed(1)}）`);
ok(Math.abs(hurtMp / baseMp - 0.8) < 0.03, `道伤惩罚：法力上限精确 -20%（${baseMp} → ${hurtMp}）`);

C.addItem(g.hero, 'pill_liaoshang', 2);
g.usePill('pill_liaoshang');
ok((g.hero.daoHurt?.days ?? 30) <= 24, `疗伤丹真实用途：服用后缩减道伤天数（余 ${g.hero.daoHurt?.days} 日）`);
g.hero.daoHurt = null;

// 劫修击倒玩家 → 搜走非装备栏物品 → 活世界坊市销赃消化 → 追杀夺回
g.hero.equip.armor = 'art_xuantie';
C.addItem(g.hero, 'art_xuantie', 1);     // 已装备在身上的护甲（不应被搜走）
C.addItem(g.hero, 'herb_zihou', 6);      // 袋中灵草（会被搜走并在坊市被卖掉！）
C.addItem(g.hero, 'art_yinhui', 1);      // 未装备法器（会被搜走）
C.addItem(g.hero, 'mat_lingshi', 1000);
const banditEnemy = new Enemy(ENEMIES.bandit, g.player.x + 40, g.player.y + 20, 2, 2);
banditEnemy.name = '劫修·赵黑虎';

g.onPlayerDown(banditEnemy);
g.closeModal(true);

const sb = g.ws.stolenBags?.[g.ws.stolenBags.length - 1]!;
const culprit = g.npcs.byId.get(sb?.culpritId)!;
ok(!!sb && !!culprit && C.hasDaoHurt(g.hero), `劫修战败：自动转正落户活世界（${culprit?.name}），生成夺袋追踪记录并附加道伤`);
ok(C.bagCount(g.hero, 'item_bottle') >= 1 && C.bagCount(g.hero, 'art_xuantie') >= 1, '保底规则：贴身问道残卷与已祭出装备栏法器未被搜走');
ok(sb.stones >= 700 && (culprit.bag?.['herb_zihou'] ?? 0) > 0, `搜袋入账：劫修真实拿走了灵石 ${sb.stones} 及紫猴花×${culprit.bag?.['herb_zihou']}`);
ok(g.mapMarks().some((m) => m.glyph === '夺'), '大地图实时显示红色「夺」字追踪夺袋仇家');

// 模拟玩家拖延 25 天不去追：劫修在 living.ts 坊市真把你的紫猴花卖掉、花你的钱！
for (let i = 0; i < 25; i++) { g.day += 1; g.npcs.daily(1); }
const digested = (sb.soldItems?.length ?? 0) > 0 || (sb.spentStones ?? 0) > 0;
ok(digested, `迟则生变（living.ts 消化赃物）：25 日后劫修已卖掉/花掉你的财物（变卖：${sb.soldItems?.join('、') || '无'}，挥霍灵石：${sb.spentStones ?? 0}）`);

// 追上去斩杀夺袋劫修 → 标记夺回！
const ce = new Enemy(ENEMIES.bandit, g.player.x, g.player.y, culprit.realm, culprit.stage);
ce.npcId = culprit.id; ce.name = culprit.name;
g.combat.enemies.push(ce);
g.combat.finish(ce);
ok(sb.recovered === true, '追杀夺回：斩杀夺袋劫修后追踪完结，剩余财物爆落归还');

// 死敌（grudge=2）击倒 → 直接补刀触发存档回溯
g.save(1); // 先存一个档
const nemesis = g.npcs.list.find((d) => d.alive && !d.canon && d.realm >= 2)!;
nemesis.grudge = 2; nemesis.why = '杀兄之仇';
const ne = new Enemy(ENEMIES.zhujixiu, g.player.x, g.player.y, nemesis.realm, nemesis.stage);
ne.npcId = nemesis.id; ne.name = nemesis.name;
g.onPlayerDown(ne);
const finishDlg = (g.modal as any)?.node;
ok(finishDlg?.title?.includes('斩草除根'), `死敌战败：grudge=2 死敌直接补刀，弹出回档复活界面`);
finishDlg?.options?.[0]?.act?.(); // 点击回档复活
g.closeModal(true);

if (fails > 0) {
  console.error(`\nFAILED: ${fails} assertions failed.`);
  process.exit(1);
}
console.log('\n== 人心（v0.49）全部测试通过！ ==');
