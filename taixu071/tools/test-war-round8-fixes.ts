import assert from 'node:assert/strict';
import './env';
import type { WarFormation } from '../src/world/warformation';

const { Game } = await import('../src/world/game');
const { Terrain } = await import('../src/world/terrain');
const { LOC_BY_ID } = await import('../src/data/world');
const { tickFormation, applyFormationDamage, collectFormationDrawables } = await import('../src/world/warformation');

function makeForm(opt: Partial<WarFormation> & { id: number; sid: string; ours: boolean; leader: any; x: number; y: number; face: number }): WarFormation {
  return {
    school: opt.ours ? 'fire' : 'blood',
    pattern: 'square',
    soldiers: 36,
    soldiersMax: 36,
    deadCount: 0,
    injCount: 0,
    routedCount: 0,
    volleyCd: 1,
    collapsed: false,
    collapseT: 0,
    doctrineAtk: 1,
    anchorX: opt.x,
    anchorY: opt.y,
    ...opt,
  };
}

async function main() {
  const tr = new Terrain(12345);
  tr.build();
  const game = new Game(tr);
  (game as any).terrain = tr;

  // 记录全部 toast 文案以验证战功与对峙线刷屏治理
  const toasts: string[] = [];
  const origToast = game.toast.bind(game);
  game.toast = ((msg: string, kind?: any) => {
    toasts.push(msg);
    return origToast(msg, kind);
  }) as any;

  const SW = game.sectwar!;
  const swAny = SW as any;

  // 1. 战功与对峙线 toast 节流验证
  const w1 = SW.declare('guiling', 'huangfeng', '正魔之争');
  const w2 = SW.declare('yanyue', 'huangfeng', '同目标侧翼施压', w1.tgt);
  w1.phase = 'battle';
  w2.phase = 'battle';
  w1.side = 0;
  w2.side = 0;
  const fp1 = swAny.frontPos(w1)!;
  game.player.x = fp1.x;
  game.player.y = fp1.y;
  game.time = 100;
  toasts.length = 0;
  SW.update(0.05);
  const standoffToasts = toasts.filter((s) => s.includes('对峙线'));
  assert.equal(standoffToasts.length, 1, `同目标两场战事不应同帧连弹多条对峙线 toast，实际=${standoffToasts.length}`);

  toasts.length = 0;
  const meritBefore = game.war.merit;
  const ord = SW.issueWarOrder(w1, 'guiling', 'seize', '夺取前哨', '测验军令', w1.tgt, 40, 30);
  SW.completeWarOrder(ord.id);
  assert.equal(game.war.merit, meritBefore + 40, '完成军令战功仍须足额入账');
  assert.equal(toasts.some((s) => s.includes('战功 +')), false, '完成军令不再弹战功刷屏 toast');

  // 2. 同盟大战（正魔之争）不会第一波直接结算整宗/整盟 + 天下共讨统一单盘总营
  SW.end(w2, 0, '清理辅助测试战事', true);
  assert.ok((w1.sideA?.length ?? 0) > 1 && (w1.sideB?.length ?? 0) > 1, '正魔之争应拉起多宗同盟阵营');
  w1.tgt = w1.b;
  w1.wave = 0;
  w1.score = 0;
  swAny.after(w1, true, false);
  assert.ok((SW as any).S.wars.includes(w1), '同盟大战第一波破前锋不应立即整场结算完结');
  assert.ok(w1.wave === 1, '同盟大战波次应推进');
  w1.score = 65;
  w1.wave = 4;
  w1.tgt = w1.b;
  swAny.after(w1, true, true);
  assert.ok(!(SW as any).S.wars.includes(w1), '同盟大战积累决定性胜势后应完成总决算');
  assert.ok(((SW as any).S.truce['guiling|huangfeng'] ?? 0) > game.day, '总决算后主战双方应建立五年停战');

  // 3. 天下共讨建立统一联军（总营帐 + 紧邻各参与门派营帐），不拆散成十余场孤战
  const hf = LOC_BY_ID.get('huangfeng')!;
  (game.ws as any).sect = null;
  (game.ws as any).mySect = { name: '太虚门', dao: 'zheng', map: 'tiannan', x: hf.x + 14, y: hf.y + 10, founded: game.day - 3000, fame: 700, stones: 5000, tribute: 0, ds: [], seq: 1, apps: [], lib: [], gf: 'qingyuan', halls: { lib: 0, dan: 0, zhen: 1, ling: 3 }, open: true, minRoot: 2, auto: false, lastM: Math.floor(game.day / 30), lastTeach: -999, log: [], gifts: [], wins: 0, losses: 0 };
  game.mysect.sync();
  (SW as any).S.mieN = 2;
  (SW as any).S.qun = 0;
  const coalOk = SW.maybeCoalition();
  assert.equal(coalOk, true, '天下共讨应触发成功');
  const activeCoalWars = (SW as any).S.wars.filter((x: any) => x.why.includes('天下共讨'));
  assert.equal(activeCoalWars.length, 1, '天下共讨应合并为单一联军战线而非拆成十余场独立战争');
  const cw = activeCoalWars[0];
  const layout0 = swAny.campLayout(cw, 0);
  assert.ok(layout0.subs.length >= 2, '联军总营应包含主营 + 多个参与门派分营');
  assert.equal(layout0.subs[0].ox, 0, '总营帐应居于 (0, 0) 中枢');
  for (let i = 1; i < layout0.subs.length; i++) {
    const dSub = Math.hypot(layout0.subs[i].ox, layout0.subs[i].oy);
    assert.ok(dSub <= 900, `分营帐(${layout0.subs[i].sid})应紧挨总营帐，实际距离=${dSub.toFixed(0)}`);
  }

  // 4. 远景收集：同战区多营不画蛛网乱线，只绘制 1 条主攻总矢并展示总营+参与门派名牌
  SW.end(cw, 0, '清理天下共讨测试战事', true);
  const wA = SW.declare('huangfeng', 'guiling', '同盟测验A');
  const wB = SW.declare('yanyue', 'guiling', '同盟测验B', wA.tgt);
  game.day += 2;
  SW.daily(2);
  const cpA1 = SW.campPos(wA, 0)!;
  const cpA2 = SW.campPos(wB, 0)!;
  const alliedCampDist = Math.hypot(cpA1.x - cpA2.x, cpA1.y - cpA2.y);
  assert.ok(alliedCampDist < 2800, `同盟邻近营地应紧挨聚拢而非分散各处，实际距离=${alliedCampDist.toFixed(0)}`);

  const drawnLines: { x1: number; y1: number; x2: number; y2: number; lw: number }[] = [];
  const drawnTexts: string[] = [];
  let curX = 0, curY = 0;
  const mockCtx = {
    strokeStyle: '', fillStyle: '', globalAlpha: 1, lineWidth: 1, font: '', textAlign: 'center',
    save() {}, restore() {}, translate() {}, rotate() {}, setLineDash() {}, beginPath() {}, closePath() {},
    stroke() {}, fill() {}, arc() {}, ellipse() {}, fillRect() {}, strokeRect() {},
    moveTo(x: number, y: number) { curX = x; curY = y; },
    lineTo(x: number, y: number) { drawnLines.push({ x1: curX, y1: curY, x2: x, y2: y, lw: this.lineWidth }); curX = x; curY = y; },
    fillText(txt: string) { drawnTexts.push(txt); },
  } as unknown as CanvasRenderingContext2D;

  const fpA = swAny.frontPos(wA)!;
  SW.collectFarWorld(mockCtx, { left: fpA.x - 30000, top: fpA.y - 30000, right: fpA.x + 30000, bottom: fpA.y + 30000 }, 0.08);
  const linesToFront = drawnLines.filter((l) => Math.hypot(l.x2 - fpA.x, l.y2 - fpA.y) < 5);
  assert.ok(linesToFront.length <= 2, `同一前线至多每方 1 条统一进攻/防线主矢（实际=${linesToFront.length}），绝不画成堆叠蛛网`);
  assert.ok(drawnTexts.some((t) => t.includes('总营')), '远景缩略图应标示「总营」');

  // 5. 方阵被灭后留存横尸残骸与折倒残旗（不原地蒸发）
  const dummyLeader: any = { x: 2000, y: 2000, hx: 2000, hy: 2000, dead: false, gone: false, realm: 2 };
  const foeLeader: any = { x: 2800, y: 2000, hx: 2800, hy: 2000, dead: false, gone: false, realm: 2 };
  const fMine = makeForm({ id: 901, sid: 'huangfeng', ours: true, leader: dummyLeader, x: 2000, y: 2000, face: 1 });
  const fFoe = makeForm({ id: 902, sid: 'guiling', ours: false, pattern: 'arrow', leader: foeLeader, x: 2800, y: 2000, face: -1 });
  for (let i = 0; i < 10; i++) tickFormation(fFoe, game, 0.016, [fMine, fFoe]);
  applyFormationDamage(fFoe, 999999, 5, game);
  assert.equal(fFoe.collapsed, true, '战阵兵力归零应进入溃灭态');
  assert.ok(fFoe.collapseT >= 15, `溃灭残骸留存时长应 >= 15s，实际=${fFoe.collapseT}`);
  assert.ok((fFoe._fallenSlots?.length ?? 0) >= 8, `应保留横尸残骸槽位，实际=${fFoe._fallenSlots?.length ?? 0}`);
  const collapsedDrawables: any[] = [];
  collectFormationDrawables(fFoe, collapsedDrawables, { left: 1000, top: 1000, right: 4000, bottom: 3000 }, 10, false, { z: 0.8 });
  assert.ok(collapsedDrawables.length >= 10, `灭阵后中近景仍应绘制横尸与残旗残阵，实际=${collapsedDrawables.length}`);

  // 6. 方阵对垒受微步推挤时朝向绝不抽搐翻转
  const fPeer = makeForm({ id: 903, sid: 'yanyue', ours: true, pattern: 'circle', leader: { ...dummyLeader, x: 2040, y: 2150 }, x: 2040, y: 2150, face: 1 });
  const fFoeLive = makeForm({ id: 904, sid: 'guiling', ours: false, leader: { ...foeLeader }, soldiers: 40, soldiersMax: 40, x: 2680, y: 2020, face: -1 });
  let signFlips = 0;
  let prevCos = Math.cos(fMine.faceAng ?? 0) >= 0 ? 1 : -1;
  for (let i = 0; i < 180; i++) {
    fPeer.x = 2040 + Math.sin(i * 0.25) * 18;
    fPeer.y = 2120 + Math.cos(i * 0.2) * 18;
    tickFormation(fMine, game, 0.016, [fMine, fPeer, fFoeLive], 'hold');
    const curCos = Math.cos(fMine.faceAng ?? 0) >= 0 ? 1 : -1;
    if (curCos !== prevCos) signFlips++;
    prevCos = curCos;
  }
  assert.equal(signFlips, 0, `对垒微步推挤期间方阵朝向不应来回翻转抽搐（实际翻转=${signFlips}次）`);

  // 7. 同盟大战推线灭宗规则 & 战败整盟保留各宗不逐宗弹出玩家发落 & 实景单排方阵/隐藏对峙假方阵
  for (const w of [...SW.S.wars]) SW.end(w, 0, '清理前置测试战事', true);
  for (const k of Object.keys(SW.S.truce)) delete SW.S.truce[k];
  SW.initHolds();
  const wRule = SW.declare('guiling', 'huangfeng', '同盟推线测试');
  const defSideR = (1 - wRule.ini) as 0 | 1;
  const coalHolds0 = (swAny.coalitionHoldsCount(wRule, defSideR) as number);
  assert.ok(coalHolds0 > 3, `同盟守方应含多宗据点(${coalHolds0})`);
  assert.notEqual(wRule.tgt, wRule.b, '同盟宣战初始目标必为敌盟据点，绝不直跳山门');
  // 即使人为触发倾巢而出，只要敌盟还有剩余据点，依然不得跳打山门
  const prevTgtR = wRule.tgt;
  swAny.after(wRule, true, true);
  assert.ok(SW.S.wars.includes(wRule) && wRule.tgt !== prevTgtR && wRule.tgt !== wRule.b,
    `同盟大胜仍先推其余敌盟据点(${prevTgtR} -> ${wRule.tgt})，不提前直扑山门`);
  // 同盟战败一次性整盟结算且成员宗门全部存活
  const foeSectsR = SW.sideSects(wRule, defSideR);
  wRule.tgt = wRule.b;
  wRule.wave = 5;
  wRule.score = 70;
  swAny.gateFall(wRule);
  assert.ok(!SW.S.wars.includes(wRule) && !wRule.fall, '同盟大战破山门后整盟一次性结算，不弹逐宗发落');
  for (const sid of foeSectsR) {
    assert.ok(!SW.S.gone?.[sid], `同盟战败后成员宗门 ${sid} 必须依然保留存在`);
  }

  // 验证实景单排方阵展开与开战后屏蔽对峙静态假方阵
  for (const k of Object.keys(SW.S.truce)) delete SW.S.truce[k];
  const wForm = SW.declare('guiling', 'huangfeng', '单排测试');
  game.day += 4;
  SW.daily(4);
  wForm.phase = 'battle';
  wForm.side = 0;
  const fpF = swAny.frontPos(wForm)!;
  game.teleport(fpF.x, fpF.y);
  const formView = { left: fpF.x - 5000, top: fpF.y - 5000, right: fpF.x + 5000, bottom: fpF.y + 5000 };
  swAny.visibleStandoffFormations(formView, 1.0);
  const standoffBefore = swAny.visibleStandoffFormations(formView, 80.0);
  const standoffDepths = new Set(standoffBefore.filter((f: any) => f.ours).map((f: any) => Math.round(f.slotLineDepth / 100)));
  assert.ok(standoffBefore.length >= 4 && standoffDepths.size <= 2, `对峙方阵单排横向展开（depth组=${standoffDepths.size}）`);
  swAny.startBattle(wForm, 0, fpF, { ma: 'wave', md: 'wave' });
  const BForm = swAny.battle;
  const allyDeps = BForm.formations.filter((f: any) => f.ours).map((f: any) => f.slotLineDepth ?? 0);
  const allyDepSpan = Math.max(...allyDeps) - Math.min(...allyDeps);
  assert.ok(allyDeps.length >= 2 && allyDepSpan <= 500, `实景开战我方方阵全部单排平铺前排（depth跨度=${Math.round(allyDepSpan)}）`);
  const standoffDuringBattle = swAny.visibleStandoffFormations({ left: fpF.x - 5000, top: fpF.y - 5000, right: fpF.x + 5000, bottom: fpF.y + 5000 }, 2.0);
  assert.equal(standoffDuringBattle.length, 0, '实景开战期间绝不再混画静态对峙假方阵');
  swAny.removeBattleForWar(wForm.id);
  SW.end(wForm, 0, '清理单排测试', true);

  console.log('ALL_ROUND8_WAR_AND_VISUAL_FIXES_PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
