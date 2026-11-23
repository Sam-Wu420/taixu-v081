// v0.73 Phase 4「大一统阵线、地图行军、大营与掌门施政」验收测试：npx tsx tools/test-v073-phase4.ts
import { createCanvas } from './env';
const CW = 1280, CH = 800;
(globalThis as any).window = {
  innerWidth: CW, innerHeight: CH, devicePixelRatio: 1,
  addEventListener() {}, removeEventListener() {},
  matchMedia: () => ({ matches: false }),
};
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Renderer } = await import('../src/world/render');
const { LOC_BY_ID, WORLD_SCALE } = await import('../src/data/world');
const { MY_SECT_ID } = await import('../src/data/sects');
const { WARS } = await import('../src/world/war');
const C = await import('../src/world/cultivation');

const terrain = new Terrain();
terrain.build();
const g = new Game(terrain);
const cv: any = createCanvas(CW, CH);
cv.clientWidth = CW; cv.clientHeight = CH;
cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: CW, height: CH });
g.canvas = cv;
g.renderer = new Renderer(g, cv);
(g as any).paused = false;

let fails = 0;
const ok = (c: any, m: string) => {
  if (!c) { fails++; console.log('FAIL', m); }
  else console.log('ok  ', m);
};

const SW = g.sectwar;
const S = SW.S;
SW.initHolds();

// 1) 三步演进：宣战 -> prep 集结 -> 地图行军与运丹车队 -> 逐步筑营
const w1 = SW.declare('guiling', 'huangfeng', 'Phase4 测试战事');
ok(w1.phase === 'prep' && (w1.prepUntil ?? 0) > g.day, `宣战进入山门集结阶段（phase=${w1.phase}）`);
ok(!!w1.campA && !!w1.campB && w1.campA.build < 0.5, `边界大营初始筑营（build=${w1.campA?.build}）`);
const marches0 = SW.activeMarches().filter((m) => m.warId === w1.id);
ok(marches0.length >= 4 && marches0.some((m) => m.kind === 'army') && marches0.some((m) => m.kind === 'convoy'), `宣战同时派出军队纵队与运丹车队（共 ${marches0.length} 支）`);

// 实景绘制收集与 Canvas2D 执行（大营 + 行军纵队）
const p0 = SW.marchPos(marches0[0]);
const cp0 = SW.campPos(w1, 0)!;
const drawList: any[] = [];
const minX = Math.min(p0.x, cp0.x) - 1000, maxX = Math.max(p0.x, cp0.x) + 1000;
const minY = Math.min(p0.y, cp0.y) - 1000, maxY = Math.max(p0.y, cp0.y) + 1000;
SW.collectWorld(drawList, { left: minX, top: minY, right: maxX, bottom: maxY }, 1.2);
const ctx2d = cv.getContext('2d');
for (const d of drawList) d.draw(ctx2d);
ok(drawList.some((d) => d.k === 'D·宗门大营') && drawList.some((d) => d.k === 'D·地图行军'), '实景渲染层收集并绘制大营与地图行军纵队');

// 推进 4 日：完成筑营与集结转实战
g.day += 4;
SW.daily(4);
ok(w1.phase === 'battle' && (w1.campA?.build ?? 0) >= 0.95, `4 日后筑营成型且进入交战期（phase=${w1.phase}, build=${w1.campA?.build}）`);

// 2) 野外截杀敌方运丹车队 & 护送己方车队 -> 账本回写
const convoyFoe = SW.spawnMarch(w1, 0, 'convoy', { pills: 12, stones: 500 });
const pillsBefore = w1.campA!.pills;
const meritBefore = g.war.merit;
const raidRes = SW.raidMarch(convoyFoe.id);
ok(raidRes.ok && raidRes.pills > 0 && raidRes.stones > 0 && g.war.merit > meritBefore, `半路截杀敌方运丹车队成功：丹药 +${raidRes.pills}、灵石 +${raidRes.stones}、战功 +${raidRes.merit}`);
ok(w1.campA!.pills < pillsBefore, `敌方大营丹药随劫粮同步失血（${pillsBefore} -> ${w1.campA!.pills}）`);

const convoyAlly = SW.spawnMarch(w1, 1, 'convoy', { pills: 10, stones: 400 });
const bBefore = w1.campB!.pills;
const escRes = SW.escortMarch(convoyAlly.id);
ok(escRes.ok && !convoyAlly.done && !!convoyAlly.escorted, `护送已接取并进入随行护航状态，未点击即消失（done=${!!convoyAlly.done}）`);
for (let step = 0; step < 100 && !convoyAlly.done; step++) {
  const pos = SW.marchPos(convoyAlly);
  g.player.x = pos.x; g.player.y = pos.y;
  (SW as any).tickRealtimeMarches(4);
  for (const sk of (SW as any).skirmishes ?? []) {
    if (sk.kind === 'escort_ambush') {
      for (const e of sk.unitB) { e.hp = 0; e.dead = true; }
    }
  }
  (SW as any).tickSkirmishes(0.1);
}
ok(convoyAlly.done && w1.campB!.pills > bBefore, `护送己方运丹车队清伏并实际抵营：丹药增至 ${w1.campB!.pills}`);

// 3) 大营断丹对护盾再生的衰减因子
w1.campA!.pills = 0;
ok(SW.campPillFactor(w1, 0) < 0.5, `敌营断丹时护盾恢复系数下跌至 ${SW.campPillFactor(w1, 0)}`);
w1.campA!.pills = 20;
ok(SW.campPillFactor(w1, 0) >= 1, `敌营丹药充盈时护盾恢复系数恢复为 ${SW.campPillFactor(w1, 0)}`);

// 4) 统帅部军令写入「眼下机缘」与退宗清理
const ord = SW.issueWarOrder(w1, 'huangfeng', 'seize', '前线破阵令', '亲赴青霞谷前沿破开敌阵灵盾', 'huangfeng', 50, 20);
ok(g.chances().some((c) => c.t.includes('前线破阵令') && c.x !== undefined), '统帅部军令实时写入 game.chances() 眼下机缘与坐标');
SW.revokeSectOrders('huangfeng');
ok(!SW.activeWarOrders().some((o) => o.id === ord.id), '退宗时同步清理旧宗未履行的统帅部军令');

// 5) 战后休整保护 & 连片飞地断补溃散
SW.end(w1, 1, 'Phase4 测试收兵', true);
ok((S.recoverUntil?.['guiling'] ?? 0) > g.day && (S.recoverUntil?.['huangfeng'] ?? 0) > g.day, '非灭宗战后双方进入战后休整期（recoverUntil）');
ok(!(SW as any).canWar('guiling'), '休整期内不会再次立即互宣开战');

// 制造一处孤立飞地并推演 30 日断补溃散
const wEnclave = SW.declare('guiling', 'huangfeng', '飞地测试');
const remoteId = 'kuixing';
S.hold[remoteId] = { o: 'guiling', g: 12 };
SW.refreshContiguousHolds();
ok(S.hold[remoteId]?.isolated === true, '远离本宗连片疆域的据点被标为孤立飞地（isolated）');
g.day += 32;
SW.tickHoldLogistics(32);
ok(!S.hold[remoteId], '孤立飞地在战时断补 30 日后守军溃散弃守');
SW.end(wEnclave, 1, '清理飞地测试', true);

// 6) 大一统阵线：WarSys（朔漠之战 mulan）并入 sectwar + WarFormation 战斗 + 真 NPC 战功自我兑换
g.hero.realm = 2; g.hero.stage = 1;
const mulanDef = WARS.find((x) => x.id === 'mulan')!;
const mst = g.war.st('mulan');
mst.phase = 'battle'; mst.start = g.day - 20; mst.end = g.day + 60;
g.war.enlist(mulanDef, 0);
const syncedWar = S.wars.find((w) => w.campaign === 'mulan');
ok(!!syncedWar && (syncedWar.sideA?.length ?? 0) > 5, `朔漠之战并入统一阵线（联军 ${syncedWar?.sideA?.length} 宗）`);

// 集结营中 NPC 并结束战役验证真 NPC 战功自兑换成长
(g.war as any).muster(mulanDef, mst);
const warNpc = g.npcs.list.find((d) => d.alive && (d as any).war === 'mulan');
ok(!!warNpc, `联军大营从名册点齐同袍（如 ${warNpc?.name}）`);

// 实景启动一次联军 WarFormation 战斗
const fr = mulanDef.front();
g.teleport(fr.x, fr.y);
const launched = SW.launchCampaignBattle(syncedWar!, 0, fr);
const liveBattle = (SW as any).battle;
ok(launched && !!liveBattle && liveBattle.formations.length >= 1, `联军会战以 WarFormation 百人战阵开打（场上战阵 ${liveBattle?.formations?.length} 支）`);
for (const e of [...liveBattle.foes]) g.combat.finish(e);
for (const f of liveBattle.formations) if (!f.ours) { f.soldiers = 0; f.collapsed = true; }
(SW as any).battle = null;
g.combat.dismissAllies((e: any) => e.tag === 'war:ally');

// 结束联军大战，检查真 NPC 战功自我兑换丹药与修为增长
const npcPill0 = warNpc?.bag?.['pill_juling'] ?? 0;
(g.war as any).finish(mulanDef, mst);
ok((warNpc?.bag?.['pill_juling'] ?? 0) > npcPill0 && ((warNpc as any).warExp ?? 0) > 0, '战役结束后真 NPC 战功自动兑换聚灵丹并增长修为');
ok(!S.wars.some((w) => w.campaign === 'mulan'), '战役落幕同步关闭对应统一阵线条目');

// 7) 托管御剑赶路（自动起飞、遇敌自动停驻、低蓝自动停驻）
g.hero.realm = 2; g.hero.mp = 0.8;
const hy = LOC_BY_ID.get('huayi')!;
const afOk = g.startAutoFlight(hy.x * WORLD_SCALE, hy.y * WORLD_SCALE, '归意门');
ok(afOk && g.player.flying && !!g.autoFlight, '托管御剑开启并自动凌空飞行');
g.hero.mp = 0.04;
g.update(0.05);
ok(!g.autoFlight, '灵力低微时托管御剑自动停驻');

// 8) 自建宗门「太上退居 · 委任掌门施政」
const hf = LOC_BY_ID.get('huangfeng')!;
(g.ws as any).mySect = {
  name: '太虚道宗', dao: 'zheng', map: 'renjie', x: hf.x + 12, y: hf.y + 8,
  founded: g.day - 2000, fame: 700, stones: 50000, tribute: 0,
  ds: [], seq: 1, apps: [], lib: [], gf: 'qingyuan',
  halls: { lib: 1, dan: 1, zhen: 1, ling: 2 }, open: true, minRoot: 2, auto: false,
  lastM: Math.floor(g.day / 30), lastTeach: -999, log: [], gifts: [], wins: 0, losses: 0,
  outer: { a: 40, j: 0, c: 120 }, servant: { a: 20, c: 80 },
};
g.mysect.sync();
const ms = g.ws.mySect!;
const dLow = { id: ms.seq++, name: '低忠弟子', sex: 'm' as const, age: 25, root: 3, realm: 2, stage: 1, exp: 0, loyal: 45, rank: 2, job: 'xiu' as const, joined: g.day, arts: 0 };
const dElder = { id: ms.seq++, name: '玄真长老', sex: 'm' as const, age: 120, root: 4, realm: 3, stage: 1, exp: 0, loyal: 88, rank: 3, job: 'xiu' as const, joined: g.day, arts: 1 };
const dWorker = { id: ms.seq++, name: '李清河', sex: 'f' as const, age: 28, root: 4, realm: 2, stage: 0, exp: 0, loyal: 75, rank: 1, job: 'li' as const, joined: g.day, arts: 0 };
ms.ds.push(dLow, dElder, dWorker);

ok(!g.mysect.appointMaster(dLow).ok, '忠诚不足 70 不得委任为掌门');
ok(g.mysect.appointMaster(dElder).ok && g.mysect.masterDisciple()?.id === dElder.id, '成功委任高忠诚结丹长老为现任掌门');

// 切换至「强战备扩军」方针并推演一月：全面覆盖招徒规矩、库房用度、建殿大阵、藏经心法、战策阵型、亲卫编组与育才安抚
ms.halls.zhen = 1;
ms.zhenE = 100;
ms.zhenMode = 'shou';
ms.stones = 80000;
ms.reserve = 0;
ms.auto = false;
ms.open = false;
ms.gf = 'tuna';
g.hero.gongfa = 'qingyuan';
g.mysect.setPolicy('war');
const outer0 = ms.outer!.a;
const pillSp0 = SW.supplyOf(MY_SECT_ID).pills;
const lowLoyal0 = dLow.loyal;
g.day += 31;
g.mysect.daily(31);
ok(ms.outer!.a > outer0 && ms.zhenAuto === true && SW.supplyOf(MY_SECT_ID).pills > pillSp0, `掌门依「强战备扩军」月结施政生效（外门 ${outer0}->${ms.outer!.a}，大阵自动充能=${ms.zhenAuto}）`);
ok(ms.open === true && ms.auto === true && ms.minRoot === 2, `掌门自动托管山门收徒规矩（open=${ms.open}, auto=${ms.auto}, minRoot=${ms.minRoot}）`);
ok(ms.reserve! >= 5000 && ms.btRate === 0.1 && ms.btRule === 1, `掌门自动托管库房用度（reserve=${ms.reserve}, btRate=${ms.btRate}, btRule=${ms.btRule}）`);
ok(ms.zhenMode === 'sha' && (ms.zhenE ?? 0) > 100, `掌门自动托管护宗大阵变阵与充能（mode=${ms.zhenMode}, zhenE=${ms.zhenE}）`);
ok(ms.gf === 'qingyuan', `掌门自动择优更新镇派心法（gf=${ms.gf}）`);
ok(SW.patternNow() === 'arrow' && SW.defNow() === 'wave', `掌门自动托管战阵阵型与守御之策（pattern=${SW.patternNow()}, def=${SW.defNow()}）`);
ok((ms.guard?.length ?? 0) >= 1 && ms.guard!.includes(dWorker.id), `掌门自动补齐亲卫编组（guard=${ms.guard?.length}）`);
ok(dLow.loyal > lowLoyal0, `掌门自动安抚低忠诚门人（loyal ${lowLoyal0}->${dLow.loyal}）`);

// 8b) 逐人点选亲卫与「掌门专属护卫」
const dGuardA = { id: ms.seq++, name: '剑卫甲', sex: 'm' as const, age: 40, root: 4, realm: 2, stage: 2, exp: 0, loyal: 86, rank: 2, job: 'shou' as const, joined: g.day, arts: 1 };
const dGuardB = { id: ms.seq++, name: '剑卫乙', sex: 'f' as const, age: 38, root: 3, realm: 2, stage: 1, exp: 0, loyal: 82, rank: 1, job: 'shou' as const, joined: g.day, arts: 0 };
ms.ds.push(dGuardA, dGuardB);
ok(!g.mysect.toggleGuardMember(dElder.id, 'master').ok, '掌门本人不可兼任护卫');
ok(g.mysect.toggleGuardMember(dGuardA.id, 'master').ok && (ms.masterGuard ?? []).includes(dGuardA.id), '可手动为掌门逐人指派专属护卫');
ok(g.mysect.toggleGuardMember(dGuardA.id, 'lord').ok && (ms.guard ?? []).includes(dGuardA.id) && !(ms.masterGuard ?? []).includes(dGuardA.id), '太上亲卫与掌门护卫逐人调防互不重叠');
g.mysect.guardSet(1);
g.day += 31;
g.mysect.daily(31);
ok((ms.masterGuard?.length ?? 0) >= 1 && !ms.masterGuard!.includes(dElder.id), `掌门每月自动补齐自己的掌门护卫（masterGuard=${ms.masterGuard?.length}）`);

// 8c) 战争统帅 AI：目标优选薄弱据点（避开重兵高工事据点）+ 大营缺丹优先调运丹车队
const wAi = SW.declare('guiling', 'huangfeng', '统帅测试');
for (const hid of SW.holdsOf('huangfeng')) delete S.hold[hid];
S.hold['v65'] = { o: 'huangfeng', g: 30, fortLv: 3 };
S.hold['v174'] = { o: 'huangfeng', g: 5, fortLv: 0 };
SW.refreshContiguousHolds();
const pickedTgt = (SW as any).nextTarget('guiling', 'huangfeng');
ok(pickedTgt === 'v174', `战争统帅 AI 绕开重兵高工事据点、优先攻打薄弱据点（target=${pickedTgt}）`);
S.marches = [];
SW.initCampsForWar(wAi);
wAi.campA!.pills = 3;
wAi.campB!.pills = 40;
wAi.campA!.soldiers = 120;
wAi.campB!.soldiers = 120;
(SW as any).marchSupplyAcc = 10;
SW.tickRealtimeMarches(0.1);
const aiConvoy = SW.activeMarches().find((m) => m.warId === wAi.id && m.side === 0);
ok(!!aiConvoy && aiConvoy.kind === 'convoy', `大营丹药告急时统帅 AI 自动优先调度运丹车队（kind=${aiConvoy?.kind}）`);
SW.end(wAi, 1, '统帅测试收兵', true);

g.mysect.setAllMasterAuto(false);
ok(Object.values(ms.masterAuto!).every((v) => v === false), 'setAllMasterAuto(false) 可一键交回全部宗务给太上亲理');
g.mysect.setAllMasterAuto(true);
ok(Object.values(ms.masterAuto!).every((v) => v === true), 'setAllMasterAuto(true) 可一键开启全宗全项托管');

// 收回大权亲政 & 逐出掌门自动清理
ok(g.mysect.reclaimPower() && !g.mysect.masterDisciple(), '太上长老可随时收回宗主大权亲政');
g.mysect.appointMaster(dElder);
g.mysect.expel(dElder);
ok(!g.mysect.masterDisciple(), '委任掌门被逐出后自动清空 masterId 提醒太上暂摄');

// 9) 存档迁移幂等性
SW.migrateWarState();
SW.migrateWarState();
ok(S.v73 === 1 && !!S.supply, 'migrateWarState 幂等且不破坏现有数据');

// 10) 全流程实景调度（集结立营、据点发兵、迁营行军、大营出阵与存活战船/弟子实景返航）
{
  const { LOC_BY_ID, WORLD_SCALE } = await import('../src/data/world');
  for (const k of Object.keys(S.truce)) delete S.truce[k];
  S.wars = S.wars.filter((x) => x.a !== 'luoyun' && x.b !== 'xuesha' && x.a !== 'xuesha' && x.b !== 'luoyun');
  const wReal = SW.declare('luoyun', 'xuesha', '实景全流程检验');
  ok(wReal.campA?.established === false && wReal.campA?.build === 0 && wReal.campA?.soldiers === 0, '开战瞬间仅定集结点，大营未提前生成');
  const realMarches = SW.activeMarches().filter((m) => m.warId === wReal.id);
  ok(realMarches.some((m) => !!m.fromHoldId), `已占连片据点同步发兵前往集结点（含据点编队 ${realMarches.filter((m) => !!m.fromHoldId).length} 支）`);
  ok(realMarches.some((m) => !!m.airshipTier || !!m.usesShip), '开战行军队列配有真实库存护航飞舟/灵舟');

  // 验证未立营前集结点可见，且护航战船随行军纵队一起渲染
  const mWithShip = realMarches.find((m) => !!m.airshipTier);
  if (mWithShip) {
    const mp = SW.marchPos(mWithShip);
    const md: any[] = [];
    SW.collectWorld(md, { left: mp.x - 1800, top: mp.y - 1800, right: mp.x + 1800, bottom: mp.y + 1800 }, 1.2, 0.8);
    ok(md.some((d) => d.k === 'D·行军战船') && md.some((d) => d.k === 'D·行军弟子'), '行军纵队同时绘制御剑弟子与护航战船');
  }

  // 推进 2 日：先遣抵达集结点后正式立营
  g.day += 2;
  SW.daily(2);
  ok(wReal.campA?.established === true && (wReal.campA?.soldiers ?? 0) > 0, `先遣抵临集结点后方正式立营（soldiers=${wReal.campA?.soldiers}）`);

  // 已立营大营换位：必须发出实景迁营编队（带护航战船），抵达后方切换大营坐标
  const oldCampX = wReal.campA!.x, oldCampY = wReal.campA!.y;
  const foeGate = LOC_BY_ID.get('xuesha')!;
  wReal.campA!.x = foeGate.x * WORLD_SCALE;
  wReal.campA!.y = foeGate.y * WORLD_SCALE;
  SW.relocateCampsIfNeeded(wReal, true);
  ok(!!wReal.campA!.relocating && wReal.campA!.x === foeGate.x * WORLD_SCALE, '已立营大营换址不瞬间跳变坐标，而是启动迁营状态');
  const relocMc = SW.activeMarches().find((m) => m.warId === wReal.id && m.isCampRelocate);
  ok(!!relocMc && relocMc.side === 0, '大营迁址在场景中真实派出迁营大队行军');
  const relocDraw: any[] = [];
  const rTo = wReal.campA!.relocating!;
  SW.collectWorld(relocDraw, { left: rTo.toX - 1800, top: rTo.toY - 1800, right: rTo.toX + 1800, bottom: rTo.toY + 1800 }, 1.2, 0.8);
  ok(relocDraw.some((d) => d.k === 'D·新营勘址'), '大营迁营期间于新址绘制新营勘址令旗');
  g.day += 5;
  SW.daily(5);
  ok(!wReal.campA!.relocating && Math.hypot(wReal.campA!.x - rTo.toX, wReal.campA!.y - rTo.toY) < 10, '迁营编队抵达新址后正式落成新营');
  void oldCampX; void oldCampY;

  // 对峙期战阵与战船自大营出阵走向对峙位（仅一次自真实大营门前出发，离开再重入战场绝不重走）
  wReal.phase = 'battle';
  const fpR = SW.frontPos(wReal)!;
  const cmpRealA = SW.campPos(wReal, 0)!;
  const cmpRealB = SW.campPos(wReal, 1)!;
  const viewR = { left: fpR.x - 6000, top: fpR.y - 6000, right: fpR.x + 6000, bottom: fpR.y + 6000 };
  const sFormsT0 = (SW as any).visibleStandoffFormations(viewR, 10.0) as any[];
  const sShipsT0 = (SW as any).visibleStandoffAirships(viewR) as any[];
  ok(sFormsT0.length >= 2 && sFormsT0.some((f) => f.moving === true), '对峙方阵初建时自大营方向列队开往对峙阵位（moving=true）');
  const nearRealCamp = sFormsT0.every((f) => {
    const sx = f._standoffSpawnX ?? f.x;
    const sy = f._standoffSpawnY ?? f.y;
    return Math.hypot(sx - cmpRealA.x, sy - cmpRealA.y) <= 720 || Math.hypot(sx - cmpRealB.x, sy - cmpRealB.y) <= 720;
  });
  ok(nearRealCamp, '对峙方阵真实自双方大营门前出发，而非从前线附近半路刷出');
  ok(sShipsT0.length >= 1, `对峙阵线上空同步出现库存护航战船（${sShipsT0.length} 艘）`);
  const zCacheR = [...((SW as any)._standoffZoneCache as Map<string, any>).values()].find((c) => c.warIds.includes(wReal.id));
  const farCampSide = Math.hypot(fpR.x - cmpRealB.x, fpR.y - cmpRealB.y) > 4500 ? cmpRealB : cmpRealA;
  const zoomedCampOnlyView = { left: farCampSide.x - 450, top: farCampSide.y - 350, right: farCampSide.x + 450, bottom: farCampSide.y + 350 };
  const sFormsZoomCamp = (SW as any).visibleStandoffFormations(zoomedCampOnlyView, 11.0) as any[];
  ok(sFormsZoomCamp.length >= 2, `放大视角仅看大营门口（前线在视口 4200px 外）时仍可见刚出营的对峙方阵（${sFormsZoomCamp.length} 阵）`);
  ok((zCacheR?.dur ?? 0) > 15, `对峙方阵按炼气弟子真实步速从远营开往对峙线（dur=${zCacheR?.dur?.toFixed(1)}s，不被 14s 压缩瞬移）`);
  const arriveT = 10.0 + (zCacheR?.dur ?? 30) + 1.0;
  const sFormsT1 = (SW as any).visibleStandoffFormations(viewR, arriveT) as any[];
  ok(sFormsT1.every((f) => f.moving === false), '行军抵达对峙线后对峙方阵稳立列阵（moving=false）');

  // 玩家离开战区再重新进入战场（含大营兵力小幅增减），对峙方阵绝不再重走一遍
  const farView = { left: fpR.x + 60000, top: fpR.y + 60000, right: fpR.x + 68000, bottom: fpR.y + 68000 };
  const sFormsFar = (SW as any).visibleStandoffFormations(farView, arriveT + 2.0) as any[];
  ok(sFormsFar.length === 0, '离开战区后当前视口无对峙阵');
  wReal.campA!.soldiers += 25;
  const sFormsReturn = (SW as any).visibleStandoffFormations(viewR, arriveT + 4.0) as any[];
  ok(sFormsReturn.length >= 2 && sFormsReturn.every((f) => f.moving === false), '重入战区后对峙方阵仍稳立原位，不再重复出营行军');

  // 直接开打大战：战阵与战船先在大营附近集结列阵，再开拔前往战场中心；战后存活战船不蒸发而是实景飞返
  g.teleport(fpR.x, fpR.y);
  (SW as any).startBattle(wReal, 0, fpR, { ma: 'wave', md: 'wave', triggerEvent: '实景出征检验' });
  const BReal = SW.battle!;
  ok(BReal.stage === 'muster' && BReal.airships.length >= 1, `直接开战进入营前集结 stage=muster（在场战船 ${BReal.airships.length} 艘）`);
  const fSample = BReal.formations[0];
  const camp0 = SW.campPos(wReal, 0)!;
  ok(Math.hypot(fSample.x - fpR.x, fSample.y - fpR.y) > 1300 && !!fSample.deployTargetX, '开战战阵先于大营方向集结成阵而非在战心凭空闪现');
  // 推进完成 muster -> march
  for (let i = 0; i < 20; i++) (SW as any).battleTick(BReal, 0.15);
  ok(BReal.stage === 'march', `集结完成后战阵与战船齐步开拔进入战场（stage=${BReal.stage}）`);

  const aliveShipsBefore = BReal.airships.filter((s: any) => !s.sunk).length;
  (SW as any).finish(BReal, wReal, false, '实景撤退检验');
  const postShips = ((SW as any).postAirships as any[]).filter((s) => !s.sunk);
  ok(postShips.length === aliveShipsBefore && aliveShipsBefore > 0, `战后所有存活战船进入实景返航队列而非瞬间蒸发（${postShips.length}/${aliveShipsBefore}）`);
  const sx0 = postShips[0].x, sy0 = postShips[0].y;
  SW.update(0.5);
  ok(Math.hypot(postShips[0].x - sx0, postShips[0].y - sy0) > 40, '战后存活战船真实沿着返航路线飞离战场');

  // 停战收兵：返航战船改道飞返宗门山门
  const lyLoc = LOC_BY_ID.get('luoyun')!;
  SW.end(wReal, 0, '实景停战检验', true);
  const lyShip = ((SW as any).postAirships as any[]).find((s) => s.warId === wReal.id && s.sid === 'luoyun');
  ok(!!lyShip && Math.hypot((lyShip.retreatTx ?? 0) - lyLoc.x * WORLD_SCALE, (lyShip.retreatTy ?? 0) - lyLoc.y * WORLD_SCALE) < 50, '停战后存活战船改道实景飞返本宗山门');

  // 11) 因果闭环与同宗互斥：无大营前绝不刷对峙大阵；立营后未对峙前由大营持续派出炼气散斗弟子；同盟内讧不重名；铭牌居中像素对齐
  for (const k of Object.keys(SW.S.truce)) delete SW.S.truce[k];
  const wFeud = SW.declare('jujian', 'huadao', '刀剑之争');
  const side0Feud = new Set(SW.sideSects(wFeud, 0));
  const side1Feud = new Set(SW.sideSects(wFeud, 1));
  const overlapFeud = [...side0Feud].filter((x) => side1Feud.has(x));
  ok(overlapFeud.length === 0 && side0Feud.size === 1 && side1Feud.size === 1,
    `同盟内部世仇开战（重岳剑门 vs 断刀坞）攻守双方绝不拉同一批盟宗自相残杀（交集=${overlapFeud.length}）`);

  // 旧存档残留重复同盟成员时，migrateWarState 自动清洗去重
  wFeud.sideA = ['jujian', 'huangfeng', 'yanyue', 'lingshou', 'qingxu'];
  wFeud.sideB = ['huadao', 'huangfeng', 'yanyue', 'lingshou', 'qingxu'];
  SW.migrateWarState();
  const s0Clean = new Set(SW.sideSects(wFeud, 0));
  const s1Clean = new Set(SW.sideSects(wFeud, 1));
  ok([...s0Clean].every((x) => !s1Clean.has(x)), 'migrateWarState 自动清洗攻守双方重复宗门');

  // 大营未立营前（即使手动推进时间或尝试显示对峙阵）绝不凭空刷出对峙方阵
  const fpFeud = (SW as any).frontPos(wFeud)!;
  const viewFeud = { left: fpFeud.x - 6000, top: fpFeud.y - 6000, right: fpFeud.x + 6000, bottom: fpFeud.y + 6000 };
  ok(((SW as any).visibleStandoffFormations(viewFeud, 1.0) as any[]).length === 0, '大营尚未建立前前线绝不凭空刷出对峙军队');

  // 先遣抵营立营但尚未正式列阵对峙（phase='prep'）时，从双方大营门前持续派出炼气期弟子奔赴交战地带铺开散斗
  g.day += 2;
  SW.daily(2);
  ok(wFeud.phase === 'prep' && !!wFeud.campA?.established && !!wFeud.campB?.established,
    `先遣抵达立营后仍处战前准备期（phase=${wFeud.phase}, est=${wFeud.campA?.established}/${wFeud.campB?.established}）`);
  g.combat.enemies.length = 0;
  g.teleport(fpFeud.x + g.detailSenseRadius + 500, fpFeud.y);
  (SW as any).skirmishCd.delete(`war:${wFeud.id}`);
  SW.update(0.2);
  const preSk = ((SW as any).skirmishes as any[]).find((sk) => sk.warId === wFeud.id && sk.kind === 'front');
  const cpAFeud = SW.campPos(wFeud, 0)!;
  const cpBFeud = SW.campPos(wFeud, 1)!;
  const allQi = !!preSk && [...preSk.unitA, ...preSk.unitB].length >= 4 && [...preSk.unitA, ...preSk.unitB].every((u: any) => u.realm === 1);
  const nearCampA = !!preSk && preSk.unitA.every((u: any) => Math.hypot(u.x - cpAFeud.x, u.y - cpAFeud.y) < Math.hypot(fpFeud.x - cpAFeud.x, fpFeud.y - cpAFeud.y) + 400);
  const nearCampB = !!preSk && preSk.unitB.every((u: any) => Math.hypot(u.x - cpBFeud.x, u.y - cpBFeud.y) < Math.hypot(fpFeud.x - cpBFeud.x, fpFeud.y - cpBFeud.y) + 400);
  ok(allQi && nearCampA && nearCampB, '未对峙前双方炼气期弟子真实自大营门口出发赶往交战地带散斗');
  SW.end(wFeud, 0, '清理因果测试', true);

  // 战阵远景铭牌 Canvas2D 绘制检查
  const { drawFormationOverlay, resetFormationOverlayFrame } = await import('../src/world/warformation');
  const textCalls: { text: string; x: number; y: number }[] = [];
  const rectCalls: { x: number; y: number; w: number; h: number }[] = [];
  const mockCtx: any = {
    save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    arc() {}, ellipse() {}, rect() {}, stroke() {}, fill() {}, translate() {}, scale() {}, rotate() {},
    font: '', textAlign: 'center', textBaseline: 'alphabetic', globalAlpha: 1,
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    measureText: (s: string) => ({ width: s.length * 10 }),
    getTransform: () => ({ a: 0.495, d: 0.495, e: 960, f: 540 }),
    fillRect: (x: number, y: number, w: number, h: number) => rectCalls.push({ x, y, w, h }),
    strokeRect: () => {},
    fillText: (text: string, x: number, y: number) => textCalls.push({ text, x, y }),
  };
  resetFormationOverlayFrame();
  drawFormationOverlay(mockCtx, {
    id: 99, sid: 'huangfeng', sectName: '青霞谷', sideLabel: '攻方', ours: true,
    leader: null as any, pattern: 'square', desiredPattern: 'square', school: 'huangfeng',
    soldiers: 80, soldiersMax: 80, deadCount: 0, injCount: 0, routedCount: 0,
    volleyCd: 1, collapsed: false, collapseT: 0, x: 500, y: 500, anchorX: 500, anchorY: 500,
    prevLeaderX: 500, prevLeaderY: 500, face: 1, faceY: 1, faceAng: 0, targetFaceAng: 0,
    doctrineAtk: 1, doctrineDef: 1, realm: 1, shield: 100, shieldMax: 100, mp: 100, mpMax: 100, brokenT: 0,
  }, 1.0, false, 0.33);
  ok(rectCalls.length >= 2 && textCalls.length >= 1 && textCalls[0].text.includes('青霞谷'),
    '远景战阵铭牌与护盾条正常绘制');
}

console.log(`\n=== Phase 4 验收完成：${fails === 0 ? '全部通过' : `失败 ${fails} 项`} ===`);
if (fails > 0) process.exit(1);
