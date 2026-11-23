import assert from 'node:assert/strict';
import { createCanvas } from './env';

const CW = 1280, CH = 800;
(globalThis as any).window = {
  innerWidth: CW, innerHeight: CH, devicePixelRatio: 1,
  addEventListener() {}, removeEventListener() {},
  matchMedia: () => ({ matches: false }),
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
};
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Renderer } = await import('../src/world/render');
const { LOC_BY_ID } = await import('../src/data/world');
const { applyFormationDamage, ensureFormationShield } = await import('../src/world/warformation');

const ok = (c: any, m: string) => {
  if (!c) { console.error('FAIL', m); process.exit(1); }
  console.log('ok  ', m);
};

const terrain = new Terrain();
terrain.build();
const g = new Game(terrain);
const cv: any = createCanvas(CW, CH);
cv.clientWidth = CW; cv.clientHeight = CH;
cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: CW, height: CH });
g.canvas = cv;
g.renderer = new Renderer(g, cv);
g.day = 360 * 5 + 10;
const SW = g.sectwar;
SW.initHolds();
for (const k of Object.keys(SW.S.truce)) delete SW.S.truce[k];

// 1) 无固定截止日期：均势战事 25 日仍处于拉锯，实力悬殊约一月内蓄满开启阈值
const wBal = SW.declare('huangfeng', 'guiling', '均势拉锯测试');
g.day += 4; SW.daily(4);
assert.equal(wBal.phase, 'battle', '4日后筑营完毕进入长期拉锯对峙');
for (let d = 0; d < 25; d++) { g.day += 1; SW.daily(1); }
ok(SW.S.wars.includes(wBal) && !SW.isDecisiveReady(wBal),
  `均势战事 25 日未强行截止（势能 ${Math.round(wBal.attrition!.gaugeA)}/100）`);
SW.end(wBal, 0, '清理均势测试', true);
for (const k of Object.keys(SW.S.truce)) delete SW.S.truce[k];

const wDom = SW.declare('tianmo', 'qingwei', '悬殊碾压测试');
wDom.sideA = ['tianmo']; wDom.sideB = ['qingwei']; wDom.side = 0;
g.day += 4; SW.daily(4);
let domDays = 0;
for (let d = 0; d < 40 && !SW.isDecisiveReady(wDom) && wDom.wave === 0; d++) { g.day += 1; SW.daily(1); domDays = d + 1; }
ok(SW.isDecisiveReady(wDom) || wDom.wave >= 1,
  `实力悬殊战事约一月左右触发决战（用时 ${domDays + 4} 日，wave=${wDom.wave}，势能 ${Math.round(wDom.attrition!.gaugeA)}/100）`);
SW.end(wDom, 0, '清理悬殊测试', true);
for (const k of Object.keys(SW.S.truce)) delete SW.S.truce[k];

// 2) 设施破坏、截杀运兵、优势系数与阵前对峙态
g.hero.realm = 2; g.hero.stage = 1;
(g.ws as any).sect = { id: 'yanyue', rank: 0, contrib: 0, joined: 0, lastPay: 0, tasks: [], done: 0 };
const w = SW.declare('hehuan', 'yanyue', '拉锯斗将测试');
w.side = 1; // 玩家投效凝霜宗（side=1，外门弟子职阶 vanguard）
g.day += 5; SW.daily(5);
const fp = (SW as any).frontPos(w);
g.teleport(fp.x, fp.y + 180);
g.closeModal?.(true);
(SW as any).acc = 0;
SW.update(0.1);

ok(!(SW as any).battle && !!SW.standoffHud(), '未达开战阈值时抵近前线保持长期对峙态，不直接开火');
const roleLow = SW.playerWarRole(w);
const nodeLow = SW.standoffNode(w)!;
ok(roleLow.role === 'vanguard' && nodeLow.options.some((o) => o.label.includes('同阶试锋')),
  `外门职阶(${roleLow.title})阵前对峙菜单提供「同阶试锋」`);

// 核心弟子（rank=3）为 officer，不误标为长老/老祖
(g.ws as any).sect.rank = 3;
const roleMid = SW.playerWarRole(w);
ok(roleMid.role === 'officer' && roleMid.title.includes('核心弟子'), `核心弟子(${roleMid.title})不再误判为长老`);

// 升为宗门长老 / 宗主职阶（rank=5，leader）检查差异化点将交互
(g.ws as any).sect.rank = 5;
const roleHigh = SW.playerWarRole(w);
const nodeHigh = SW.standoffNode(w)!;
ok(roleHigh.role === 'leader' && nodeHigh.options.some((o) => o.label.includes('点将派遣')),
  `长老职阶(${roleHigh.title})阵前对峙菜单提供「点将派遣」与赌胜`);

// 截杀敌方运兵车队并检验优势系数 & 势能增长（方案 A：无静态设施，由大营/运兵粮队/巡哨/斗将驱动）
const attr = w.attrition!;
ok(attr.facilities.length === 0, '方案 A 已取消前线三类静态设施');
const foeMarch = SW.spawnMarch(w, 0, 'convoy', { soldiers: 36 })!;
const g0 = attr.gaugeB;
const adv0 = SW.advantageOf(w, 1);
const raidRes = SW.raidMarch(foeMarch.id);
ok(raidRes.ok && raidRes.pills > 0 && raidRes.stones > 0, '可半路截杀敌方运丹车队并缴获丹药灵石');
ok(attr.gaugeB > g0 + 18 && SW.advantageOf(w, 1) > adv0,
  `截杀车队提升开战势能(${Math.round(g0)}→${Math.round(attr.gaugeB)})与优势系数(${adv0.toFixed(2)}→${SW.advantageOf(w, 1).toFixed(2)})`);

// 3) 阵前斗将：派遣弟子观战 + 偷袭破约触发全面大战
const duelRes = SW.startFrontDuel(w, 'champion');
ok(duelRes.ok && !!(SW as any).activeDuel, '成功发起「点将派遣」阵前斗将');
const dObj = (SW as any).activeDuel;
ok((dObj.foe as any).noP === true && !!dObj.ally, '旁观斗将期间敌将不主动围攻玩家');
const meddled = SW.onPlayerMeddleDuel(dObj.foe);
ok(meddled && !!(SW as any).battle, '观战期间暗算敌将破约，立即触发事件驱动全面大战');

// 4) 三段开战流程（muster → march → standoff 5.5s 叫阵对峙 → clash）与结丹/Boss 严格分层
const B1 = (SW as any).battle;
ok(B1.stage === 'muster' && B1.formations.every((f: any) => f.holdFire === true && (f.musterT ?? 0) > 0),
  '开战第一段 muster：战兵自后阵纵队集结成阵，全阵停火');

const pBeforeMuster = g.combat.projs.length;
for (let i = 0; i < 25; i++) SW.update(0.1); // 2.5s → march
ok(B1.stage === 'march' && B1.formations.every((f: any) => f.holdFire === true),
  '开战第二段 march：百人战阵齐步推进至阵线，仍保持停火');

for (let i = 0; i < 24; i++) SW.update(0.1); // +2.4s → standoff (5.5s parley)
ok(B1.stage === 'standoff' && B1.standoffT > 0.5 && B1.formations.every((f: any) => f.holdFire === true),
  `开战第三段 standoff：阵前叫阵对峙（剩余 ${B1.standoffT.toFixed(1)}s），方阵尚未放箭`);
ok(g.combat.projs.length === pBeforeMuster, '集结/推进/叫阵期间方阵绝不提前齐射');

// 确认非灭宗大战绝不生成 boss=true 的压轴 Boss，且结丹统帅开局按兵不动
const isExt1 = (B1.ma === 'all' && B1.md === 'all') || B1.gate;
ok(!isExt1 && B1.bossRf.length === 0 && !B1.foes.some((e: any) => e.boss),
  '非灭宗常规战不额外刷出压轴 Boss');
ok(!B1.cmdDeployedF && B1.cmdRf.length > 0,
  `结丹统帅/长老(${B1.cmdRf.length}人)在开局及前锋阶段保持观阵待命`);

// 提前抢攻或等叫阵结束进入 clash
const pPreempt = SW.onPlayerAggressiveAtFront(fp.x, fp.y);
ok(pPreempt && B1.stage === 'clash' && B1.formations.every((f: any) => f.holdFire === false),
  '阵前抢攻/叫阵结束进入 clash 全面交锋，战阵解锁齐射');

// 制造敌方危机（击溃过半敌阵）触发结丹统帅下场
const foeForms1 = B1.formations.filter((f: any) => !f.ours);
for (let i = 0; i < Math.ceil(foeForms1.length * 0.65); i++) {
  foeForms1[i].soldiers = 0;
  foeForms1[i].collapsed = true;
}
SW.update(0.1);
ok(B1.cmdDeployedF === true && !B1.foes.some((e: any) => e.boss),
  '前线危机触发结丹统帅亲自下场救阵（仍无存亡 Boss）');

// 5) 检验锋矢阵侧翼/背面机械弱点倍率（hitX/hitY）
const arrowForm = B1.formations.find((f: any) => !f.collapsed && f.pattern === 'arrow') ?? foeForms1.find((f: any) => !f.collapsed);
if (arrowForm) {
  arrowForm.pattern = 'arrow';
  const sh = ensureFormationShield(arrowForm);
  sh.shieldMax = 2000; sh.shield = 2000; arrowForm.shield = 2000;
  const fx = arrowForm.x, fy = arrowForm.y, ang = arrowForm.faceAng ?? 0;
  // 正前方命中 vs 侧翼命中
  applyFormationDamage(arrowForm, 100, 3, g, { school: '剑', hitX: fx + Math.cos(ang) * 180, hitY: fy + Math.sin(ang) * 180 });
  const dmgFront = 2000 - (arrowForm.shield ?? 0);
  sh.shield = 2000; arrowForm.shield = 2000;
  applyFormationDamage(arrowForm, 100, 3, g, { school: '剑', hitX: fx - Math.sin(ang) * 320, hitY: fy + Math.cos(ang) * 320 });
  const dmgFlank = 2000 - (arrowForm.shield ?? 0);
  ok(dmgFlank > dmgFront * 1.25, `锋矢阵侧翼受击触发机械弱点增伤（正面 ${Math.round(dmgFront)} vs 侧翼 ${Math.round(dmgFlank)}）`);
}

// 清理前一场战斗，测试灭宗/存亡大战才会压轴出 Boss
(SW as any).removeBattleForWar(w.id);
SW.end(w, 1, '清理测试1', true);
for (const k of Object.keys(SW.S.truce)) delete SW.S.truce[k];

const wExt = SW.declare('hehuan', 'yanyue', '灭宗存亡测试', 'yanyue');
wExt.side = 1;
(SW as any).zhenSet('yanyue', 0); // 护宗大阵已破，进入真正的山门存亡灭宗决战
g.day += 5; SW.daily(5);
const fpExt = (SW as any).frontPos(wExt);
g.teleport(fpExt.x, fpExt.y + 150);
(SW as any).startBattle(wExt, 1, fpExt, { ma: 'all', md: 'all', triggerEvent: '存亡死战', ambush: true });
const BExt2 = (SW as any).battle;
ok(BExt2.gate && !BExt2.zhen && BExt2.bossRf.length > 0, `灭宗存亡战正确预留压轴老祖/宗主底牌（${BExt2.bossRf.length}人）`);
for (let i = 0; i < 65; i++) SW.update(0.1);
ok(BExt2.stage === 'clash', '存亡大战进入全面交锋');
// 击溃先锋 + 触发结丹统帅后，清空剩余战阵至 <=1 阵，验证压轴 Boss 仅在最后关头下场
const fFormsExt = BExt2.formations.filter((f: any) => !f.ours);
for (const ff of fFormsExt) { ff.soldiers = 0; ff.collapsed = true; }
BExt2.rf.length = 0;
for (const e of [...BExt2.foes]) g.combat.finish(e);
SW.update(0.1);
ok(BExt2.cmdDeployedF === true && BExt2.bossDeployedF === true && BExt2.foes.some((e: any) => e.boss),
  '存亡大战最后关头成功派出压轴 Boss');

// 6) 普通大战统帅判断拉锯不利：可撤退并放弃战略目标
(SW as any).removeBattleForWar(wExt.id);
SW.end(wExt, 1, '清理灭宗测试', true);
for (const k of Object.keys(SW.S.truce)) delete SW.S.truce[k];

const wRet = SW.declare('hehuan', 'yanyue', '普通大战统帅撤退测试');
wRet.side = 1; // 玩家为凝霜宗长老（leader）守方，hehuan 为攻方
g.day += 5; SW.daily(5);
const oldTgtRet = wRet.tgt;
const nodeLeaderRet = SW.standoffNode(wRet)!;
ok(nodeLeaderRet.options.some((o) => o.label.includes('鸣金撤兵')), '非灭宗存亡战中，主帅/长老在阵前对峙台可选择「鸣金撤兵·放弃战略目标」');
SW.retreatFromStandoff(wRet, 1, 'yield');
ok(SW.S.hold[oldTgtRet]?.o === 'hehuan' && wRet.tgt !== oldTgtRet, `守方主动弃守战略目标「${oldTgtRet}」退保后线，敌方不战而得，新目标切为「${wRet.tgt}」`);

// 实景普通大战拉锯不利后，敌方统帅主动鸣金撤退放弃目标（不必等到全军覆没）
const fpRet = (SW as any).frontPos(wRet);
g.teleport(fpRet.x, fpRet.y + 160);
(SW as any).startBattle(wRet, 1, fpRet, { ma: 'wave', md: 'wave', triggerEvent: '普通会战', ambush: true });
const BRet = (SW as any).battle;
for (let i = 0; i < 65; i++) SW.update(0.1);
// 击溃所有敌军战阵且削减战兵，保留部分敌将领与残兵（>25% 未至溃散线，但在交锋拉锯 7 秒后已明显不利）
for (const ff of BRet.formations) if (!ff.ours) { ff.soldiers = 0; ff.collapsed = true; }
BRet.outerRf = 0;
BRet.rf.splice(0, Math.max(0, BRet.rf.length - 1));
BRet.kf = Math.max(BRet.kf, Math.ceil(BRet.f0 * 0.55));
BRet.cmdDeployedF = true;
for (let i = 0; i < 90 && (SW as any).battle; i++) SW.update(0.1);
ok(!(SW as any).battle && (wRet.wins ?? 0) >= 1, '普通大战交锋拉锯后敌方统帅见势不利主动撤退，未拖至全军覆没即收场');

// 测试 7：普通战 vs 灭宗战炼气死伤溃三分账差异 + 大营军令自选与改换
const mkForm = (extinction: boolean): any => ({
  id: 901, sid: 'qingyun', ours: true, leader: { dead: false, realm: 1 }, pattern: 'fangzhen', school: 'jian',
  soldiers: 100, soldiersMax: 100, deadCount: 0, injCount: 0, routedCount: 0,
  volleyCd: 1, collapsed: false, collapseT: 0, x: 0, y: 0, face: 1, doctrineAtk: 1, doctrineDef: 1,
  realm: 1, shield: 0, shieldMax: 200, shieldRegen: 0, extinction,
});
const fOrd = mkForm(false);
applyFormationDamage(fOrd, 1000, 1, 'jian', 10);
const fExt = mkForm(true);
applyFormationDamage(fExt, 1000, 1, 'jian', 10);
const ordDeadRate = fOrd.deadCount / Math.max(1, fOrd.deadCount + fOrd.injCount + fOrd.routedCount);
const extDeadRate = fExt.deadCount / Math.max(1, fExt.deadCount + fExt.injCount + fExt.routedCount);
ok(fOrd.deadCount > 0 && fOrd.injCount > fOrd.deadCount && ordDeadRate < 0.3, `普通会战破盾炼气以重伤/溃散为主而非大片阵亡（dead=${fOrd.deadCount}, inj=${fOrd.injCount}, rout=${fOrd.routedCount}）`);
ok(extDeadRate > 0.42 && extDeadRate > ordDeadRate, `灭宗死战炼气真死率显著高于普通战（ord=${ordDeadRate.toFixed(2)}, ext=${extDeadRate.toFixed(2)}）`);

// 大营统帅部军令自选与改换
g.ws.sect = { id: wRet.a, rank: 0, contrib: 0, lastDay: 0, tasks: 0 };
g.hero.realm = 1; g.hero.stage = 7; // 炼气八层战兵身份
const campNodeSoldier = (SW as any).warCampNode(wRet, 0);
const pickBtn = campNodeSoldier.options.find((o: any) => o.label.includes('军令'));
ok(!!pickBtn, '炼气弟子入营可打开统帅部军令自选榜');
const orderMenu = pickBtn.act();
const orderChoices = orderMenu.options.filter((o: any) => !o.label.includes('返回大营'));
ok(orderChoices.length >= 3, `统帅部提供多条可选军令而非单条硬派（实际=${orderChoices.length}）`);
orderChoices[2].act(); // 选斥候哨探（raid）
ok((SW.S.warOrders ?? []).some((o) => o.warId === wRet.id && o.kind === 'raid'), '炼气弟子可自由接取「斥候哨探」军令');
const campAfter = (SW as any).warCampNode(wRet, 0);
const switchBtn = campAfter.options.find((o: any) => o.label.includes('改换军令'));
ok(!!switchBtn, '领令后仍可在大营改换其他军令');
const orderMenu2 = switchBtn.act();
orderMenu2.options[1].act();
ok((SW.S.warOrders ?? []).some((o) => o.warId === wRet.id && o.kind === 'seize'), '改换后军令成功切换为「守营协防」');

// 测试 8：军令完成闭环（护送/截杀自动触发 completeWarOrder 发放战功） + 大营军费采买消耗 + 开战冷却节奏
const orderMenu3 = (SW as any).warOrderPickNode(wRet, 0);
orderMenu3.options[0].act(); // 选 escort
const meritBeforeOrd = g.war.merit;
const allyConvoy = SW.spawnMarch(wRet, 0, 'convoy');
SW.escortMarch(allyConvoy.id);
ok(!allyConvoy.done && !!allyConvoy.escorted, '接取护送后纵队仍留在路上伴行，未直接消失判胜');
for (let step = 0; step < 360 && !allyConvoy.done; step++) {
  const pos = SW.marchPos(allyConvoy);
  g.player.x = pos.x; g.player.y = pos.y;
  (SW as any).tickRealtimeMarches(1);
  for (const sk of (SW as any).skirmishes ?? []) {
    if (sk.kind === 'escort_ambush') {
      for (const e of sk.unitB) { e.hp = 0; e.dead = true; }
    }
  }
  (SW as any).tickSkirmishes(0.1);
}
ok(allyConvoy.done && g.war.merit >= meritBeforeOrd + 22 + 34, `护送车队实际抵营后自动完成 escort 军令并发放全部承诺战功（${meritBeforeOrd} -> ${g.war.merit}）`);

const orderMenu4 = (SW as any).warOrderPickNode(wRet, 0);
orderMenu4.options[2].act(); // 选 raid
const meritBeforeRaid = g.war.merit;
const foeConvoy = SW.spawnMarch(wRet, 1, 'convoy');
SW.raidMarch(foeConvoy.id);
ok(g.war.merit >= meritBeforeRaid + 28 + 40, `截杀敌队自动完成 raid 军令并发放全部承诺战功（${meritBeforeRaid} -> ${g.war.merit}）`);

// 大营灵石消耗闭环（丹药告急时自动动用军费采买补丹）
wRet.campA!.pills = 2;
wRet.campA!.stones = 400;
SW.tickMarchesAndCamps(1);
ok(wRet.campA!.stones < 400 && wRet.campA!.pills > 2, `大营丹药告急时自动动用军费采买补丹（stones=${wRet.campA!.stones}, pills=${wRet.campA!.pills}）`);

// 验证炼气战兵（炼气八层）也能收到本宗召集玉符，且同图自动开战存在全局冷却（不会同天连爆）
g.ws.sect = { id: 'guiling', rank: 0, contrib: 0, lastDay: 0, tasks: 0 };
g.hero.realm = 1; g.hero.stage = 7;
const wCall = SW.declare('guiling', 'huadao', '试测炼气战兵召集');
ok(!!wCall.called && g.war.inbox.some((j) => j.sw === wCall.id && j.kind === '召集'), '炼气六层以上战兵也可收到本宗大战召集玉符');

// 验证同图刚刚宣战后，drift 不会在 150 天冷却期内马上再刷第二场自动大战
const countBefore = SW.S.wars.filter((x) => !x.campaign).length;
(SW as any).S.ten['huangfeng|xuesha'] = 120;
(SW as any).drift(10);
const countAfter = SW.S.wars.filter((x) => !x.campaign).length;
ok(countAfter === countBefore, `同图刚宣战后处于 150 日冷却期，不会几天内接连扎堆爆发新战（${countBefore} -> ${countAfter}）`);

// 测试 9：宗门接触距离限制（远隔非世仇门派不隔空互宣）+ 宗门势力范围版图数据
const ters = SW.sectTerritories('tiannan');
ok(ters.length >= 10 && ters.every((t) => t.nodes.length >= 1 && !!t.stroke && !!t.fillRgb), `大地图宗门势力范围数据完备（天南存续 ${ters.length} 派）`);
const qingyunTer = ters.find((t) => t.sid === 'huangfeng');
ok(!!qingyunTer && qingyunTer.nodes.some((n) => n.kind === 'gate') && qingyunTer.nodes.some((n) => n.kind === 'hold'), '宗门势力范围同时包含山门核区与麾下连片据点');
const farNonFeud = (() => {
  const ids = SW.sects('tiannan').filter((s) => s !== 'my_sect');
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    if (SW.sectContactDist(ids[i], ids[j]) > 145 && !SW.feudWhy(ids[i], ids[j]) && SW.base(ids[i], ids[j]) >= 0) {
      return [ids[i], ids[j], SW.base(ids[i], ids[j])] as const;
    }
  }
  return null;
})();
ok(!farNonFeud || farNonFeud[2] === 0, `隔山隔海不接壤的非世仇宗门不会隔空擦枪走火（base=${farNonFeud?.[2] ?? 0}）`);

// 验证长周期自然推演中，绝不会对隔山隔海超过邻近门限的远距离门派（含远距世仇）自发爆发超远前线
{
  const gSim = new Game(terrain);
  const swSim = gSim.sectwar;
  swSim.initHolds();
  for (let d = 0; d < 12; d++) { gSim.day += 180; (swSim as any).dacc = 0; (swSim as any).drift(180); }
  const tooFarAutoWar = swSim.S.wars.find((w) => {
    const m = LOC_BY_ID.get(w.a)?.map;
    const lim = m === 'luanxing' ? 210 : m === 'renjie' ? Math.round(155 * 1.25) : 155;
    return !w.campaign && swSim.sectContactDist(w.a, w.b) > lim;
  });
  ok(!tooFarAutoWar, `长周期自然推演未产生任何超距自发战线（${swSim.S.wars.map((w) => `${swSim.name(w.a)}-${swSim.name(w.b)}:${Math.round(swSim.sectContactDist(w.a, w.b))}`).join(', ')}）`);
}

console.log('ALL_CAMPAIGN_ATTRITION_AND_HIERARCHY_CHECKS_PASSED');
process.exit(0);
