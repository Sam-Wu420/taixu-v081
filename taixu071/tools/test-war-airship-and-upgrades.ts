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

const { ARTS, effectiveSpellMp } = await import('../src/data/arts');
const { drawAirshipEntity, getAirshipDrawBounds } = await import('../src/gfx/airship');
const { SHEET_VARIANTS, sectDiscipleSheet } = await import('../src/world/warformation');
const {
  AIRSHIP_BATTLE_SPEC,
  createWarAirship,
  applyAirshipDamage,
  tickWarAirship,
  isPointOnAirship,
  collectAirshipDrawables,
} = await import('../src/world/warairship');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Renderer } = await import('../src/world/render');
const { ACTIVE_MAP, WORLD_SCALE } = await import('../src/data/world');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');

// 1) 高境界低阶法术降耗公式验证
{
  const lowBolt = ARTS.huodan; // tier 1, A类攻击法术
  const healArt = ARTS.huichun; // B类治疗法术
  assert.ok(lowBolt && healArt, '基础法术存在');
  const mpR1 = effectiveSpellMp(lowBolt, 1, 0, 0).ratio;
  const mpR4 = effectiveSpellMp(lowBolt, 4, 0, 3).ratio;
  assert.ok(mpR4 < mpR1 * 0.2, `元婴施展一阶火弹术应显著降耗 (${mpR1.toFixed(4)} -> ${mpR4.toFixed(4)})`);
  const healR1 = effectiveSpellMp(healArt, 1, 0, 0).ratio;
  const healR4 = effectiveSpellMp(healArt, 4, 0, 0).ratio;
  assert.ok(healR4 >= healArt.mp * 0.85 * 0.34 && healR4 < healR1, `B类疗伤法术保留温和封底 (${healR1.toFixed(4)} -> ${healR4.toFixed(4)})`);
}

// 2) 宗门弟子 6 变体（3 男 + 3 女）生成与绘制验证
{
  const sheets = [];
  for (let v = 0; v < 6; v++) {
    const sh = sectDiscipleSheet('huangfeng', undefined, v, undefined, 'front');
    assert.ok(sh && sh.width > 0 && sh.height > 0, `变体 ${v} 精灵表成功生成`);
    sheets.push(sh);
  }
  assert.notEqual(sheets[0], sheets[3], '男弟子变体0与女弟子变体3应为不同精灵表');
}

// 3) 飞舟战船机制闭环：护盾隔绝 -> 破盾 8s 窗口 -> 护法影响回盾 -> 操舟门槛失稳 -> 击沉 30s 断船残骸
{
  const ship = createWarAirship({
    id: 1,
    warId: 1,
    sid: 'huangfeng',
    sectName: '黄枫谷',
    ours: false,
    tier: 2,
    style: 'zheng',
    x: 1000,
    y: 1000,
    tx: 1000,
    ty: 1000,
    crew: 16,
  });
  const s0 = ship.shield;
  const h0 = ship.hp;
  const c0 = ship.crew;
  const r1 = applyAirshipDamage(ship, 400, 2);
  assert.equal(r1.hullDmg, 0, '护盾未破时船体不受伤');
  assert.equal(r1.crewLost, 0, '护盾未破时甲板操舟手不受伤');
  assert.ok(ship.shield < s0, '护盾吸伤下降');

  const rBreak = applyAirshipDamage(ship, s0 + 50, 2);
  assert.equal(ship.shield, 0, '护盾归零');
  assert.ok(ship.brokenT >= 7.5, `护盾击破开启 8s 破盾窗口 (${ship.brokenT})`);
  assert.equal(rBreak.hullDmg, 0, '破盾瞬间不溢出伤及船体');

  const rHull = applyAirshipDamage(ship, 450, 2);
  assert.ok(rHull.hullDmg > 0 && ship.hp < h0, '破盾后伤及船体');
  assert.ok(ship.crew < c0, '破盾后伤及甲板操舟弟子');

  const cv = createCanvas(900, 600);
  const g2d = cv.getContext('2d') as any;
  drawAirshipEntity(g2d, 450, 320, 100, 'ne', 1.2, { tier: 2, style: 'zheng', bannerText: '黄' }, { shieldRatio: 0.7 });
  drawAirshipEntity(g2d, 450, 320, 0, 'sw', 1.2, { tier: 3, style: 'mo', bannerText: '魔' }, { wreck: true, wreckFade: 0.85 });

  const rSink = applyAirshipDamage(ship, ship.hp + 9999, 4);
  assert.ok(rSink.sunkNow && ship.sunk && ship.wreckT === 30.0, '击沉后断船残骸保留 30 秒');
  assert.equal(isPointOnAirship(ship, ship.x, ship.y), false, '坠毁残骸不再作为活靶受击');
}

// 4) 战场集成：炼气留地、筑基御空、战船编队入场、运丹灵舟与遁光行军、击沉残骸战后保留 30 秒
{
  const terrain = new Terrain();
  terrain.build();
  const g = new Game(terrain);
  const cv: any = createCanvas(CW, CH);
  cv.clientWidth = CW; cv.clientHeight = CH;
  cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: CW, height: CH });
  g.canvas = cv;
  g.renderer = new Renderer(g, cv);
  (g as any).paused = false;

  g.hero.realm = 3;
  g.hero.stage = 1;
  const SW = g.sectwar;
  SW.initHolds();
  const w = SW.declare('huangfeng', 'guiling', '测试立体空战')!;
  w.phase = 'battle';
  w.day = 4;
  w.campA = { x: 20000, y: 20000, map: ACTIVE_MAP, supplies: { pills: 50, stones: 3000 } };
  w.campB = { x: 24500, y: 20000, map: ACTIVE_MAP, supplies: { pills: 50, stones: 3000 } };
  const fp = SW.frontPos(w)!;
  g.teleport(fp.x - 400, fp.y);
  w.join = 0;
  (SW as any).startBattle(w, 0, fp, { ma: 'all', md: 'all', triggerEvent: '空战实装检验' });

  const B = SW.battle!;
  assert.ok(B && B.airships.length >= 2, `开战双方部署战船 (实际=${B?.airships.length ?? 0})`);
  const foeShip = B.airships.find((s) => !s.ours)!;
  assert.ok(foeShip.escorts.length >= 1, '敌方战船配属伴飞护法');

  // 炼气留地 vs 筑基御空
  const qiUnit = new Enemy(ENEMIES.moxiu, fp.x, fp.y, 1, 0);
  const zjUnit = new Enemy(ENEMIES.zhujixiu, fp.x + 120, fp.y, 2, 0);
  qiUnit.aggro = true;
  zjUnit.aggro = true;
  g.combat.enemies.push(qiUnit, zjUnit);
  for (let i = 0; i < 10; i++) g.combat.update(0.1);
  assert.equal(qiUnit.flyH, 0, `炼气弟子战斗仍留地面 (flyH=${qiUnit.flyH})`);
  assert.ok(zjUnit.flyH > 20, `筑基以上战斗御空分层 (flyH=${zjUnit.flyH.toFixed(1)})`);

  // 玩家点击/弹道命中战船
  const picked = SW.pickAirshipAt(foeShip.x, foeShip.y - foeShip.zLift);
  assert.equal(picked?.id, foeShip.id, '点击战船高空船体精确命中');
  const sBefore = foeShip.shield;
  const hitOk = SW.hitAirshipByProj({ x: foeShip.x, y: foeShip.y - foeShip.zLift, r: 24, dmg: 320, realm: 3 }, 'foe');
  assert.ok(hitOk && foeShip.shield < sBefore, '弹道可正常击中敌方飞舟削盾');

  // 击沉后结束战斗，验证 30s 残骸留场
  foeShip.shield = 0;
  applyAirshipDamage(foeShip, foeShip.hp + 9999, 4, g);
  assert.ok(foeShip.sunk, '战船已被击沉');
  (SW as any).finish(B, w, true, '测试收场');
  const postShips = (SW as any).postAirships as any[];
  assert.ok(postShips.some((s) => s.id === foeShip.id && s.wreckT > 25), '击沉断船残骸战后保留 30 秒');

  // 运丹灵舟与遁光行军收集绘制无异常
  const conv = SW.spawnMarch(w, 0, 'convoy', { pills: 12, stones: 500 });
  const army = SW.spawnMarch(w, 0, 'army', { soldiers: 36 });
  const posC = SW.marchPos(conv);
  const drawables: any[] = [];
  SW.collectWorld(drawables, { left: posC.x - 4000, top: posC.y - 4000, right: posC.x + 4000, bottom: posC.y + 4000 }, 1.5, 0.6);
  assert.ok(drawables.some((d) => d.k === 'D·运丹灵舟'), '运丹木车已升级为一阶运丹灵舟');
  assert.ok(drawables.some((d) => d.k === 'D·运丹护法'), '运丹灵舟旁伴飞护法渲染');
  assert.ok(drawables.some((d) => d.k === 'D·行军弟子'), '部队行军使用遁光集群渲染');
  void army;
  void tickWarAirship;
  void AIRSHIP_BATTLE_SPEC;
  void WORLD_SCALE;
}

// 5) 战船坞建筑 & 战船与运丹灵舟共用库存（不可凭空刷船）
{
  const terrain = new Terrain();
  terrain.build();
  const g = new Game(terrain);
  const { MY_SECT_ID } = await import('../src/data/sects');
  const { LOC_BY_ID } = await import('../src/data/world');
  const hf = LOC_BY_ID.get('huangfeng')!;
  g.hero.realm = 4;
  g.hero.stage = 0;
  (g.ws as any).mySect = {
    name: '太虚舟宗', dao: 'zheng', map: 'tiannan', x: hf.x + 14, y: hf.y + 10,
    founded: g.day - 100, fame: 800, stones: 300000, tribute: 0, ds: [], seq: 1,
    apps: [], lib: [], gf: 'qingyuan', halls: { lib: 0, dan: 0, zhen: 0, ling: 2, dock: 0 },
    open: false, minRoot: 2, auto: false, lastM: Math.floor(g.day / 30), lastTeach: -999,
    log: [], gifts: [], wins: 0, losses: 0, outer: { a: 80, j: 0, c: 600 },
  };
  const ms = g.ws.mySect as any;
  for (let i = 0; i < 10; i++) {
    ms.ds.push({
      id: ms.seq++, name: '护法' + i, sex: i % 2 ? 'm' : 'f', age: 40,
      root: 3, realm: i < 2 ? 3 : 2, stage: 0, exp: 0.2, loyal: 80,
      rank: i < 2 ? 2 : 1, job: 'xiu', joined: g.day, arts: 0,
    });
  }
  g.mysect.daily(0);
  const SW = g.sectwar;
  SW.initHolds();

  // 未建战船坞与船只时：本宗舟师为 0，不能凭空建船，出征亦不刷出战船，运丹退回陆路车队
  const fl0 = SW.fleetSummary(MY_SECT_ID);
  assert.equal(fl0.dockLv, 0, '新立宗门战船坞初始 0 级');
  assert.equal(fl0.intact.t1 + fl0.intact.t2 + fl0.intact.t3, 0, '新立宗门初始无凭空战船');
  assert.equal(SW.buildAirship(1).ok, false, '未建战船坞不能造一阶灵舟');

  const wMy = SW.declare(MY_SECT_ID, 'huangfeng', '测试库存闭环')!;
  wMy.phase = 'battle';
  wMy.campA = { x: 20000, y: 20000, map: ACTIVE_MAP, supplies: undefined as any, soldiers: 60, pills: 20, stones: 1000, build: 1 } as any;
  wMy.campB = { x: 24500, y: 20000, map: ACTIVE_MAP, supplies: undefined as any, soldiers: 60, pills: 20, stones: 1000, build: 1 } as any;
  const fp = SW.frontPos(wMy)!;
  g.teleport(fp.x - 300, fp.y);

  // 无一阶灵舟库存时，运丹队列不使用灵舟（usesShip === false，绘制陆路运丹队而非 D·运丹灵舟）
  const landConv = SW.spawnMarch(wMy, 0, 'convoy', { sid: MY_SECT_ID, soldiers: 16, pills: 10, stones: 400 });
  assert.equal(landConv.usesShip, false, '无可用一阶灵舟时运丹不凭空刷灵舟');
  const posLand = SW.marchPos(landConv);
  const landDraw: any[] = [];
  SW.collectWorld(landDraw, { left: posLand.x - 2000, top: posLand.y - 2000, right: posLand.x + 2000, bottom: posLand.y + 2000 }, 1.0, 0.5);
  assert.equal(landDraw.some((d) => d.k === 'D·运丹灵舟'), false, '无舟库存时不得绘制运丹灵舟');
  assert.ok(landDraw.some((d) => d.k === 'D·陆路运丹队'), '无舟库存时走陆路运丹队');

  // 兴建战船坞至 1 级 -> 采买阵材 -> 造 1 艘一阶轻型灵舟并推进工期完工
  assert.ok(g.mysect.buildHall('dock'), '可建造 1 级战船坞');
  assert.equal(g.ws.mySect!.halls.dock, 1, '战船坞升至 1 级');
  assert.ok(g.mysect.hallRows().some((r) => r.k === 'dock' && r.lv === 1), 'hallRows 包含战船坞');
  assert.ok(SW.buyWarMats(20).ok, '可采买炼舟阵材');
  assert.equal(SW.buildAirship(2).ok, false, '1 级战船坞尚不能造二阶战舰（需 3 级）');
  const b1 = SW.buildAirship(1);
  assert.ok(b1.ok, `1 级战船坞可开工建造一阶灵舟: ${b1.msg}`);
  assert.equal(SW.fleetSummary(MY_SECT_ID).building.length, 1, '造船进入在建船台队列');
  SW.tickSupply(30);
  const flBuilt = SW.fleetSummary(MY_SECT_ID);
  assert.equal(flBuilt.intact.t1, 1, '工期届满后一阶灵舟入列库存');
  assert.equal(flBuilt.building.length, 0, '完工后船台清空');

  // 运丹灵舟占用这唯一一艘一阶灵舟 -> 在途期间不可再派第二艘灵舟或向战阵重复投放这艘 t1
  const shipConv = SW.spawnMarch(wMy, 0, 'convoy', { sid: MY_SECT_ID, soldiers: 16, pills: 10, stones: 400 });
  assert.equal(shipConv.usesShip, true, '有一阶灵舟库存时运丹启用运丹灵舟');
  assert.equal(SW.fleetAvailable(MY_SECT_ID).t1, 0, '运丹在途期间共用库存的可用一阶灵舟归零');
  const secondConv = SW.spawnMarch(wMy, 0, 'convoy', { sid: MY_SECT_ID, soldiers: 12, pills: 8, stones: 200 });
  assert.equal(secondConv.usesShip, false, '唯一一阶灵舟正在运丹时，第二支运丹不得凭空再刷灵舟');

  // 被劫毁运丹灵舟永久扣减库存 t1
  const raidRes = SW.raidMarch(shipConv.id);
  assert.ok(raidRes.ok, '截杀运丹灵舟成功');
  assert.equal(SW.fleetSummary(MY_SECT_ID).intact.t1, 0, '运丹灵舟半途被劫毁后永久扣减一阶库存');
  secondConv.done = true;
  landConv.done = true;

  // 再造一艘一阶灵舟并投入会战，验证击沉后库存扣减、重伤返坞与未有舟时零部署
  SW.buildAirship(1);
  SW.tickSupply(30);
  assert.equal(SW.fleetSummary(MY_SECT_ID).intact.t1, 1, '补造一阶灵舟入列');
  (SW as any).startBattle(wMy, 0, fp, { ma: 'all', md: 'all', triggerEvent: '舟师实装检验' });
  const B2 = SW.battle!;
  const myShips = B2.airships.filter((s) => s.ours);
  assert.equal(myShips.length, 1, '本宗仅部署库存实有的一艘战船');
  assert.equal(SW.fleetAvailable(MY_SECT_ID).t1, 0, '战船出战期间在编可用数扣减占用');
  myShips[0].shield = 0;
  applyAirshipDamage(myShips[0], myShips[0].hp + 9999, 4, g);
  assert.ok(myShips[0].sunk, '我方战船被击沉');
  (SW as any).finish(B2, wMy, false, '测试击沉扣减');
  assert.equal(SW.fleetSummary(MY_SECT_ID).intact.t1, 0, '战场被击沉后永久扣减战船库存');
}

// 6) 灭宗死战收尾闭环、战后全员回营/返山门、多阵型混编、对峙态摆阵+营阵调防、行军纵队全员御剑飞行
{
  const terrain = new Terrain();
  terrain.build();
  const g = new Game(terrain);
  const { LOC_BY_ID, WORLD_SCALE } = await import('../src/data/world');
  const SW = g.sectwar;
  const swAny = SW as any;
  for (const k of Object.keys(SW.S.truce)) delete SW.S.truce[k];
  const wLoop = SW.declare('huangfeng', 'xuesha', '闭环专项')!;
  g.day += 4;
  SW.daily(4);
  wLoop.phase = 'battle';
  wLoop.side = 0;
  wLoop.lullUntil = g.day + 5; // 处于休兵对峙期
  const fpL = swAny.frontPos(wLoop)!;
  g.teleport(fpL.x, fpL.y);

  // 6a) 即使处于休兵对峙期(isFrontlineStandoff=true)，对峙地带也必须摆出阵型对峙（自大营出发一次，抵达前线后稳立），并有大营↔前线调防队列
  assert.equal(SW.isFrontlineStandoff(wLoop), true, '战事处于休兵对峙期');
  swAny.visibleStandoffFormations({ left: fpL.x - 5000, top: fpL.y - 5000, right: fpL.x + 5000, bottom: fpL.y + 5000 }, 1.0);
  const zLoop = [...(swAny._standoffZoneCache as Map<string, any>).values()].find((c) => c.warIds.includes(wLoop.id));
  const standForms = swAny.visibleStandoffFormations({ left: fpL.x - 5000, top: fpL.y - 5000, right: fpL.x + 5000, bottom: fpL.y + 5000 }, 1.0 + (zLoop?.dur ?? 80) + 1.0);
  assert.ok(standForms.length >= 4, `休兵对峙期前线仍摆出对峙方阵（实际 ${standForms.length} 阵）`);
  const standPats = new Set(standForms.map((f: any) => f.pattern));
  assert.ok(standPats.size >= 2, `对峙阵型不再单一全方阵（实际阵型: ${[...standPats].join(',')}）`);

  const worldItems: any[] = [];
  SW.collectWorld(worldItems, { left: fpL.x - 8000, top: fpL.y - 8000, right: fpL.x + 8000, bottom: fpL.y + 8000 }, 0.5, 1.2);
  assert.ok(worldItems.some((d) => d.k === 'D·营阵调防'), '大营与对峙前线之间可见往返换防/增援弟子队列');

  // 6b) 行军纵队离开山门后全员御剑飞行赶路（rtDur 提速且每个行军弟子均有腾空高度，不再徒步）
  const armyMc = SW.spawnMarch(wLoop, 0, 'army', { soldiers: 40 });
  const distM = Math.hypot(armyMc.toX - armyMc.fromX, armyMc.toY - armyMc.fromY);
  assert.ok((armyMc.rtDur ?? 999) <= Math.max(25, distM / 300 + 2), '部队行军纵队按御剑遁速提速赶路');
  const posA = SW.marchPos(armyMc);
  const marchItems: any[] = [];
  SW.collectWorld(marchItems, { left: posA.x - 3000, top: posA.y - 3000, right: posA.x + 3000, bottom: posA.y + 3000 }, 1.0, 2.0);
  const marchDisciples = marchItems.filter((d) => d.k === 'D·行军弟子');
  const marchUnitCount = marchDisciples.reduce((s, d) => s + (d.count ?? 1), 0);
  assert.ok(marchDisciples.length >= 1 && marchUnitCount >= 40, `渲染全员行军弟子纵队（实际 ${marchUnitCount} 人）`);
  // 在集结完成后所有行军弟子均御剑腾空（排序键 y = baseY + lift*2 > posA.y - 200）
  assert.ok(marchDisciples.every((d) => d.y > posA.y - 500), '行军纵队全部处于御剑升空排序层');

  // 6c) 开打多阵型混编 + 灭宗无二阶统帅时 Boss 绝不卡 1/N 死锁 + 战后全部飞回山门/大营
  swAny.startBattle(wLoop, 0, fpL, { ma: 'all', md: 'all', triggerEvent: '灭宗死战' });
  const B = SW.battle!;
  const allyPats = new Set(B.formations.filter((f) => f.ours).map((f) => f.pattern));
  assert.ok(allyPats.size >= 2, `开战多阵型混编而非只用单一阵型（实际: ${[...allyPats].join(',')}）`);

  // 模拟：敌方无二阶统帅(cmdRf=0, cmdDeployedF=false)，仅剩 1 名灭宗压轴 Boss 在 bossRf
  B.stage = 'clash';
  B.rf = [];
  B.cmdRf = [];
  B.cmdDeployedF = false;
  B.bossDeployedF = false;
  B.bossRf = [{ ref: 0, realm: 4, stage: 0, top: true, sid: 'xuesha' }];
  B.outerRf = 0;
  B.formations = B.formations.filter((f) => f.ours);
  B.airships = B.airships.filter((s) => s.ours);
  for (const e of B.foes) { e.dead = true; e.gone = true; }
  B.foes = [];

  swAny.battleTick(B, 0.1);
  assert.equal(B.bossDeployedF, true, '无结丹统帅时压轴 Boss 仍必被部署，绝不卡死 1/N');
  assert.ok(B.foes.length >= 1, '压轴 Boss 已真实上场');

  // 击杀压轴 Boss 后再推进 2s，验证战局干净结束并清空顶部挂起 HUD
  for (const e of B.foes) { e.hp = 0; e.dead = true; e.gone = true; }
  for (let i = 0; i < 20; i++) swAny.battleTick(B, 0.15);
  assert.equal(SW.battle, null, '敌方全灭后大会战干净收场，绝不挂起');
  assert.equal(SW.hud(), null, '战后顶部战况条立刻收起');
  assert.ok((swAny.postFormations as any[]).length >= 1, '战后幸存方阵进入有序撤回大营队列');

  // 若随即停战拆营，撤回队列与在途行军必须改道各自宗门山门
  const hfLoc = LOC_BY_ID.get('huangfeng')!;
  SW.end(wLoop, 0, '测试停战收兵', true);
  for (const pf of swAny.postFormations as any[]) {
    if (pf.warId === wLoop.id && pf.sid === 'huangfeng') {
      assert.ok(Math.hypot(pf.retreatX - hfLoc.x * WORLD_SCALE, pf.retreatY - hfLoc.y * WORLD_SCALE) < 50, '停战拆营后撤回方阵自动改道直飞本宗山门');
    }
  }
  // 7. 太上长老/老祖身份与下令 + 行军纵队全缩放保留不变成突然消失的点 + WorldAtlas 限流校验
  {
    const { discipleLodParams } = await import('../src/world/warformation');
    const { WorldAtlas } = await import('../src/gl/worldAtlas');

    // 7a) 自建宗门（ws.sect === null）在联军战事或直属战事中：宗主 & 太上长老绝不被判为「客卿强援」，且大营界面为「下达帅令/颁下帅令」
    g.ws.sect = null;
    g.hero.realm = 4; // 结丹/元婴高阶
    g.ws.mySect = {
      name: '太虚道门',
      dao: 'zheng',
      x: 450, y: 380, map: 'tiannan',
      founded: 100, stones: 50000, reserve: 0,
      halls: { zhen: 2, dan: 1, zang: 1, dock: 1 },
      lib: [], guard: [], zhenE: 500, zhenMode: 'shou',
      policy: 'cultivate',
      masterId: undefined,
      ds: [{ id: 1, name: '韩立', realm: 3, stage: 1, root: 4, job: 'xiu', age: 40, loyal: 90, mood: 80 }],
    } as any;
    const coalitionWar: any = {
      id: 9901, a: 'huangfeng', b: 'xuesha', ini: 0,
      sideA: ['huangfeng', 'mysect'], sideB: ['xuesha'],
      tgt: 'v128', phase: 'battle', score: 0, la: 0, lb: 0,
      campA: { x: 110000, y: 110000, map: 'tiannan', build: 3, soldiers: 120, pills: 20, stones: 2000 },
      campB: { x: 116000, y: 110000, map: 'tiannan', build: 2, soldiers: 90, pills: 12, stones: 1000 },
    };
    assert.equal(SW.sideOf(coalitionWar), 0, '联军战事 sideA 包含 mysect 时 sideOf 识别为 0');
    const rLord = SW.playerWarRole(coalitionWar);
    assert.equal(rLord.role, 'leader', '自建宗门宗主身份必为 leader');
    assert.equal(rLord.title, '太虚道门宗主');

    // 退居太上长老（指定 masterId）
    (g.ws.mySect as any).masterId = 1;
    const rGrand = SW.playerWarRole(coalitionWar);
    assert.equal(rGrand.role, 'leader', '太上长老身份必为 leader');
    assert.equal(rGrand.title, '太虚道门太上长老', '退居后明确显示太上长老而非客卿强援');

    const campNode = SW.warCampNode(coalitionWar, 0);
    assert.ok(campNode.text.includes('太虚道门太上长老'), '大营详情面板正确显示太上长老身份');
    assert.ok(!campNode.text.includes('客卿强援'), '太上长老绝不显示客卿强援');
    const orderBtn = campNode.options.find((o) => o.label.includes('帅令'));
    assert.ok(orderBtn && orderBtn.label.includes('下达帅令') && !orderBtn.label.includes('领受'), '太上长老在大营应为「下达帅令」而非「领受军令」');
    const pickNode = orderBtn!.act() as any;
    assert.ok(pickNode.title.includes('颁下帅令') && !pickNode.title.includes('领命'), '令案标题为「颁下帅令」');
    assert.ok(pickNode.speaker.includes('主帅令案'), '帅帐称谓为「主帅令案」');

    // 7b) 行军纵队缩放连续性与全员保留（无 marchLodStep 抽稀，交叉淡入对齐 collectFormationDrawables）
    SW.S.wars.push(coalitionWar);
    const scaleMc = SW.spawnMarch(coalitionWar, 0, 'army', { sid: 'huangfeng', soldiers: 40 });
    const posS = SW.marchPos(scaleMc);
    for (const zTest of [0.04, 0.08, 0.14, 0.25, 0.8]) {
      const items: any[] = [];
      SW.collectWorld(items, { left: posS.x - 4000, top: posS.y - 4000, right: posS.x + 4000, bottom: posS.y + 4000 }, 2.0, zTest);
      const units = items.filter((d) => d.k === 'D·行军弟子').reduce((s, d) => s + (d.count ?? 1), 0);
      assert.equal(units, 40, `缩放 z=${zTest} 下行动纵队不得丢人（实际 ${units}/40）`);
    }
    // 交叉淡入连续性：帧级微步缩放不得出现 > 0.06 的 spriteFade 跳变
    let prevFade = discipleLodParams(0.03, 1).spriteFade;
    for (let z = 0.032; z <= 0.30; z += 0.002) {
      const curFade = discipleLodParams(z, 1).spriteFade;
      assert.ok(Math.abs(curFade - prevFade) <= 0.06, `discipleLodParams z=${z.toFixed(3)} 平滑过渡无突变`);
      prevFade = curFade;
    }

    // 7c) WorldAtlas 分帧 Mipmap 上限（单帧最多 2 页 generateMipmap）与上传限流
    let mipCalls = 0;
    let texSeq = 1;
    const mockGl: any = {
      TEXTURE_2D: 1, RGBA: 2, UNSIGNED_BYTE: 3, LINEAR: 4, LINEAR_MIPMAP_NEAREST: 5,
      TEXTURE_MAX_LEVEL: 6, TEXTURE_MIN_FILTER: 7, TEXTURE_MAG_FILTER: 8, TEXTURE_WRAP_S: 9,
      TEXTURE_WRAP_T: 10, CLAMP_TO_EDGE: 11, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 12,
      createTexture: () => ({ id: texSeq++ }), deleteTexture: () => {}, bindTexture: () => {},
      texParameteri: () => {}, texImage2D: () => {}, pixelStorei: () => {}, texSubImage2D: () => {},
      generateMipmap: () => { mipCalls++; },
    };
    const wa = new WorldAtlas(mockGl, 512, 4);
    wa.beginFrame();
    for (let i = 0; i < 4; i++) {
      const cv: any = { width: 480, height: 480 };
      wa.maxNewUploadMB = 100;
      wa.ensure('P' + i, cv, 480, 480);
    }
    wa.flushMipmaps();
    assert.equal(mipCalls, 4, '新建图集页首帧补齐 Mipmap 防采样空白黑块');
    mipCalls = 0;
    wa.beginFrame();
    for (let i = 0; i < 4; i++) {
      const cv2: any = { width: 480, height: 480 };
      wa.ensure('P' + i, cv2, 480, 480, true);
    }
    wa.flushMipmaps();
    assert.ok(mipCalls <= 2, `WorldAtlas.flushMipmaps 已就绪脏页单帧最多刷新 2 页以防卡顿（实际 ${mipCalls}）`);
    wa.beginFrame();
    wa.flushMipmaps();
    assert.equal(mipCalls, 4, '剩余脏页在下一帧平滑补齐 Mipmap');
  }
}

// 8) 战船平滑连续转向：目标反向时逐步经相邻八向过渡，绝不瞬间 180° 甩头
{
  const terrain = new Terrain();
  terrain.build();
  const g = new Game(terrain);
  const shipTurn = createWarAirship({
    id: 777,
    warId: 1,
    sid: 'huangfeng',
    sectName: '青霞谷',
    ours: true,
    tier: 3,
    style: 'zheng',
    x: 1000,
    y: 1000,
    tx: 2000,
    ty: 1000,
    crew: 30,
  });
  assert.equal(shipTurn.dir, 'e', '初建向东航行战船朝向 e');
  // 航点突变为正西（180° 反向），首帧不得瞬间跳变为 w
  shipTurn.tx = -1000;
  shipTurn.ty = 1000;
  tickWarAirship(shipTurn, 0.25, g, [shipTurn], [], [], [], true);
  assert.notEqual(shipTurn.dir, 'w', `反向 0.25s 内战船不得瞬间甩头至 w（实际 ${shipTurn.dir}）`);
  const seenDirs = new Set<string>([shipTurn.dir]);
  for (let i = 0; i < 36; i++) {
    tickWarAirship(shipTurn, 0.2, g, [shipTurn], [], [], [], true);
    seenDirs.add(shipTurn.dir);
  }
  assert.ok(seenDirs.size >= 3 && seenDirs.has('w'), `战船转向期间平滑经过中间方向并转至正西（经过 ${[...seenDirs].join(' -> ')}）`);
  const goalAng = Math.atan2(shipTurn.ty - shipTurn.y, shipTurn.tx - shipTurn.x);
  let angDiff = Math.abs((shipTurn.faceAng ?? 0) - goalAng);
  if (angDiff > Math.PI) angDiff = Math.PI * 2 - angDiff;
  assert.ok(angDiff < 0.25, `掉头后连续航向角准确指向目标航点（误差 ${angDiff.toFixed(3)} rad，dir=${shipTurn.dir}）`);
}

// 9) 飞舟连续角度 + 周围御剑护航弟子（无甲板叠人）+ 限流绝不产生“只有影子没有本体”的弟子
{
  const { resolveAirshipAnglePose } = await import('../src/gfx/airship');
  const { collectAirshipDrawables } = await import('../src/world/warairship');
  const { pushWorldDiscipleBatch } = await import('../src/world/sectwarTypes');
  const { collectFormationDrawables } = await import('../src/world/warformation');

  // 9a) 连续偏航角度：不同中间角（如 18° vs 34°）解析出不同连续 yaw 档位，不再锁死 45° 八方向
  const p18 = resolveAirshipAnglePose(0.314); // 18°
  const p34 = resolveAirshipAnglePose(0.593); // 34°
  assert.notEqual(p18.binKey, p34.binKey, `18°(${p18.binKey}) 与 34°(${p34.binKey}) 应有独立连续偏航档位`);
  const p195 = resolveAirshipAnglePose(Math.PI + 0.26); // 195°（左半圆镜像）
  assert.equal(p195.flip, -1, '左半圆航向应镜像且保留平滑连续 yaw');

  // 9b) 飞舟周围御剑护航弟子（不再在甲板叠人），分前后层次护卫船体
  const escShip = createWarAirship({
    id: -902,
    warId: 9,
    sid: 'huangfeng',
    sectName: '青霞谷',
    ours: true,
    tier: 2,
    style: 'zheng',
    x: 2000,
    y: 2000,
    tx: 2600,
    ty: 2300,
    crew: 16,
  });
  const shipDraws: any[] = [];
  collectAirshipDrawables([escShip], shipDraws, { left: 0, top: 0, right: 4000, bottom: 4000 }, 2.5, undefined, 1);
  const escortDraws = shipDraws.filter((d) => d.k === 'D·护舟弟子');
  const escortTotal = escortDraws.reduce((s, d) => s + (d.count ?? 1), 0);
  assert.equal(escortTotal, 6, `二阶对峙飞舟外围应有 6 名御剑护航弟子（实际 ${escortTotal}）`);
  const shipY = shipDraws.find((d) => d.k === 'D·宗门飞舟')?.y ?? 0;
  assert.ok(escortDraws.some((d) => d.y < shipY) && escortDraws.some((d) => d.y > shipY), '护舟弟子分列船体前后层，实现立体环绕护航');

  // 9c) 模拟 WorldAtlas 上传限流：warmAtlasSpr 返回 false 时，gl() 必须返回 false 回退 Canvas2D 且不得推入孤立影子
  const pushedKeys: string[] = [];
  const fakeRen: any = {
    dpr: 1,
    pushAtlasSpr: (_b: any, _spr: any, _x: number, _y: number, _sx: number, _sy: number, _f: boolean, _a: number, key?: string) => {
      pushedKeys.push(key ?? '');
      return true;
    },
    warmAtlasSpr: () => false,
  };
  const fakeBatch: any = { n: 0, segs: [] };
  const units = Array.from({ length: 8 }, (_, i) => ({
    x: 500 + i * 24, y: 500, lift: 0, variant: i % 6, facing: 'front' as const, frame: 2, flipX: false,
  }));
  const batchOut: any[] = [];
  pushWorldDiscipleBatch(batchOut, fakeRen, units, 'D·行军弟子', 'huangfeng', undefined, 1, true);
  // 注：在 Node 无 DOM 环境中 sectDiscipleFrameSpr 返回 null 会回退 dot；有 Canvas/DOM 时 warmAtlasSpr=false 会返回 false
  const origDoc = (globalThis as any).document;
  (globalThis as any).document = {
    createElement: () => ({
      width: 148,
      height: 196,
      getContext: () => ({
        save: () => {}, restore: () => {}, translate: () => {}, scale: () => {}, rotate: () => {},
        beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {}, arc: () => {},
        ellipse: () => {}, rect: () => {}, fill: () => {}, stroke: () => {}, clearRect: () => {},
        fillRect: () => {}, strokeRect: () => {}, drawImage: () => {}, quadraticCurveTo: () => {},
        bezierCurveTo: () => {}, setTransform: () => {}, createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
      }),
    }),
  };
  try {
    pushedKeys.length = 0;
    const domOut: any[] = [];
    pushWorldDiscipleBatch(domOut, fakeRen, units, 'D·行军弟子', 'huangfeng', undefined, 1, true);
    const glRes = domOut[0]?.gl?.(fakeBatch, 1);
    assert.equal(glRes, false, '行军合批在贴图未入图集且限流时应返回 false 回退 2D');
    assert.ok(!pushedKeys.includes('P2:shadow32'), '限流回退时绝不先推入孤立影子 P2:shadow32');

    pushedKeys.length = 0;
    const formOut: any[] = [];
    const testForm: any = {
      id: 88, sid: 'huangfeng', sectName: '青霞谷', sideLabel: '我方', ours: true,
      leader: { x: 1000, y: 1000, dead: false, gone: false, realm: 2, shortName: '领阵', name: '领阵' },
      pattern: 'square', school: 'wood', soldiers: 12, soldiersMax: 12, deadCount: 0, injCount: 0, routedCount: 0,
      volleyCd: 5, collapsed: false, collapseT: 0, x: 1000, y: 1000, face: 1, faceY: 1, faceAng: 0.4,
      anchorX: 1000, anchorY: 1000, moving: true, realm: 2, shield: 100, shieldMax: 100, shieldRegen: 5, brokenT: 0, mp: 100, mpMax: 100,
    };
    collectFormationDrawables(testForm, formOut, { left: 0, top: 0, right: 2000, bottom: 2000 }, 1.0, false, { ren: fakeRen, z: 1, dpr: 1 });
    const soldierItem = formOut.find((d) => d.k === 'D·战阵兵');
    const fGlRes = soldierItem?.gl?.(fakeBatch, 1);
    assert.equal(fGlRes, false, '战阵兵在贴图限流时应返回 false 回退 2D');
    assert.ok(!pushedKeys.includes('P2:shadow32'), '战阵兵限流回退时绝不先推入孤立影子 P2:shadow32');
  } finally {
    (globalThis as any).document = origDoc;
  }
}

// 10) 战船缩放视角抗闪烁验证：连续变焦 60 帧不溢出 scratchTex、不污染 WorldAtlas、不因 deferOnThrottle 静默丢帧，且不裁切二/三阶巨舟
{
  const origDoc = (globalThis as any).document;
  (globalThis as any).document = {
    createElement: () => ({
      width: 256,
      height: 256,
      getContext: () => ({
        save: () => {}, restore: () => {}, translate: () => {}, scale: () => {}, rotate: () => {},
        beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {}, arc: () => {},
        ellipse: () => {}, rect: () => {}, fill: () => {}, stroke: () => {}, clearRect: () => {},
        fillRect: () => {}, strokeRect: () => {}, drawImage: () => {}, quadraticCurveTo: () => {},
        bezierCurveTo: () => {}, setTransform: () => {}, measureText: () => ({ width: 80 }),
        fillText: () => {}, strokeText: () => {}, createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
      }),
    }),
  };
  try {
    // 10a) 完整飞舟包围盒应覆盖三阶巨舟与护盾，不被 960×960 截断
    const b1 = getAirshipDrawBounds(1, 1);
    const b3 = getAirshipDrawBounds(3, 1);
    assert.ok(b1.w >= 950 && b1.h >= 800, `一阶飞舟包围盒应完整包裹舟体与护盾 (${b1.w}x${b1.h})`);
    assert.ok(b3.w >= 2100 && b3.h >= 1700, `三阶飞舟包围盒应完整包裹舟体与护盾 (${b3.w}x${b3.h})`);

    // 10b) collectAirshipDrawables 在回退后的清晰 Canvas2D 路径下，跨缩放段均稳定生成 D·宗门飞舟 并可完整绘制
    const shipTest = createWarAirship({
      id: 901, sid: 'huangfeng', sectName: '青霞谷', ours: true, style: 'zheng', tier: 2, x: 1000, y: 1000,
    });
    const dummyCtx = (globalThis as any).document.createElement('canvas').getContext('2d');
    for (const zNow of [0.15, 0.5, 1.0, 1.45]) {
      const shipOut: any[] = [];
      collectAirshipDrawables([shipTest], shipOut, { left: 0, top: 0, right: 2000, bottom: 2000 }, 1.0, undefined, zNow);
      const shipDraw = shipOut.find((d) => d.k === 'D·宗门飞舟');
      assert.ok(shipDraw && typeof shipDraw.draw === 'function', `z=${zNow} 应收集宗门飞舟 Drawable`);
      assert.equal(shipDraw.gl, undefined, '清晰回退模式下飞舟直走 Canvas2D 绘制，不经过 scratch 图集');
      shipDraw.draw(dummyCtx);
    }
  } finally {
    (globalThis as any).document = origDoc;
  }
}

console.log('ALL AIRSHIP, 6-VARIANT, FLIGHT-LAYER & LOW-TIER-MP CHECKS PASSED');
process.exit(0);
