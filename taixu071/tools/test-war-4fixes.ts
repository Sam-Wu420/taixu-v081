// 宗门战事 4 项修复专项验收测试：npx tsx tools/test-war-4fixes.ts
import assert from 'node:assert/strict';
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
const { MY_SECT_ID } = await import('../src/data/sects');
const { LOC_BY_ID, WORLD_SCALE } = await import('../src/data/world');

const terrain = new Terrain();
terrain.build();
const g = new Game(terrain);
const cv: any = createCanvas(CW, CH);
cv.clientWidth = CW; cv.clientHeight = CH;
cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: CW, height: CH });
g.canvas = cv;
g.renderer = new Renderer(g, cv);
(g as any).paused = false;

const SW = g.sectwar;
SW.initHolds();

// 1) 建立自建宗门：刻意令内门仅有极少炼气弟子 + 1 名结丹、而外门战兵 260 人，攻打敌宗山门验证不再只有 1 队出战
g.hero.realm = 3; g.hero.stage = 0;
(g.ws as any).sect = null;
const hf = LOC_BY_ID.get('huangfeng')!;
(g.ws as any).mySect = {
  name: '青云剑宗', dao: 'zheng', map: 'tiannan', x: hf.x + 14, y: hf.y + 10,
  founded: g.day - 3000, fame: 700, stones: 5000, tribute: 0,
  ds: [
    { id: 1, name: '大师兄', sex: 'm', age: 30, root: 3, realm: 3, stage: 0, exp: 0, loyal: 90, rank: 2, job: 'hall', joined: 0, arts: 2 },
    { id: 2, name: '外门师弟甲', sex: 'm', age: 18, root: 2, realm: 1, stage: 5, exp: 0, loyal: 80, rank: 0, job: 'xiu', joined: 0, arts: 1 },
    { id: 3, name: '外门师弟乙', sex: 'f', age: 19, root: 2, realm: 1, stage: 4, exp: 0, loyal: 80, rank: 0, job: 'xiu', joined: 0, arts: 1 },
  ],
  seq: 4, apps: [], lib: [], gf: 'qingyuan', halls: { lib: 0, dan: 0, zhen: 1, ling: 3 },
  open: true, minRoot: 2, auto: false, lastM: Math.floor(g.day / 30), lastTeach: -999,
  log: [], gifts: [], wins: 0, losses: 0, outerTotal: 260, outerAlive: 260,
};
g.mysect.sync();
const my = g.ws.mySect!;

const foeId = 'huangfeng';
// 令敌方无据点，直接兵临敌宗山门且阵已破，测试灭宗攻打山门
for (const lid of SW.holdsOf(foeId)) delete SW.S.hold[lid];
(SW.S.zhen ??= {})[foeId] = 0;

const wGate = SW.declare(MY_SECT_ID, foeId, '攻山门多阵测试', foeId);

// 2) 验证宣战后山门集结 -> 出发 -> 筑营阶段（非直接满建筑瞬成）
assert.ok(wGate.campA && wGate.campA.build < 0.25 && wGate.campA.soldiers <= 30, `宣战初立仅勘址立桩待建（build=${wGate.campA?.build}, soldiers=${wGate.campA?.soldiers}）`);
const myMarches = SW.activeMarches().filter((m) => m.warId === wGate.id && m.sid === MY_SECT_ID);
assert.ok(myMarches.some((m) => SW.marchPos(m).mustering), '宣战后我方主力纵队先在宗门山门集结（mustering=true）');
const gateX = my.x * WORLD_SCALE, gateY = my.y * WORLD_SCALE;
const musterMarch = myMarches.find((m) => SW.marchPos(m).mustering)!;
const pos0 = SW.marchPos(musterMarch);
assert.ok(Math.hypot(pos0.x - gateX, pos0.y - gateY) < 50, '集结纵队位于自建宗门山门坐标出发点');

// 实景绘制山门集结纵队与施工 stage 0 营地
const c2d = cv.getContext('2d');
const dl0: any[] = [];
SW.collectWorld(dl0, { left: gateX - 1500, top: gateY - 1500, right: gateX + 1500, bottom: gateY + 1500 }, 0.5);
assert.ok(dl0.some((d) => d.k === 'D·地图行军'), 'collectWorld 在山门处绘制集结纵队');
for (const d of dl0) d.draw(c2d);

// 推过集结秒数，纵队拔营离开山门朝大营行进
for (let i = 0; i < 6; i++) (SW as any).tickRealtimeMarches(1.0);
assert.ok(!SW.marchPos(musterMarch).mustering && SW.marchPos(musterMarch).progress > 0, '集结时间过后纵队拔营出发并向前行军');

// 3) 验证 myWarNode / sendNode / warCampNode 均有显式「对峙」入口，且抵近对峙不直接开打
const nodeGate = SW.myWarNode(wGate);
assert.ok(nodeGate.options.some((o) => o.label.includes('对峙')), '攻打山门节点包含明确「对峙」入口');
assert.ok(nodeGate.options.some((o) => o.label.includes('亲征')), '攻打山门节点保留「亲征」直攻入口');

// 验证 sendNode 含「对峙」入口
const anyHold = Object.keys(SW.S.hold).find((id) => LOC_BY_ID.get(id)?.map === 'tiannan');
if (anyHold) {
  wGate.tgt = anyHold;
  const sendOpt = (SW as any).sendNode(wGate, 'wave', 120);
  assert.ok(sendOpt.options.some((o: any) => o.label.includes('对峙')), '常规出兵面板 sendNode 含「对峙」入口');
  wGate.tgt = foeId;
}

const campNode = SW.warCampNode(wGate, 0);
assert.ok(campNode.options.some((o) => o.label.includes('对峙')), '前线大营帅帐 warCampNode 含「对峙」入口');

// 推进先遣立营后再执行「赴阵前对峙」并将玩家移至前线：必须保持在阵前对峙态，绝不跳过对峙直接开打
g.day += 4;
SW.daily(4);
SW.dispatchToStandoff(wGate, { ma: 'all' });
const fpGate = SW.frontPos(wGate)!;
g.player.x = fpGate.x + 360;
g.player.y = fpGate.y;
for (let i = 0; i < 4; i++) SW.update(0.35);
assert.equal(SW.hud(), null, '选择「对峙」赴前线后不会跳过对峙直接开战');
assert.ok(SW.standoffHud() !== null, '抵达前线后正常进入阵前对峙 HUD 态');

// 随后通过「鸣鼓总攻」或 triggerDecisiveClash 开战，验证我方展开多支百人战阵（>1 队）
SW.triggerDecisiveClash(wGate, '测试总攻破山门');
const hudNow = SW.hud();
assert.ok(hudNow !== null, '鸣鼓总攻后正式进入山门会战');
assert.ok((hudNow?.mForms ?? 0) >= 2, `攻打山门我方成功展开多队战阵（当前=${hudNow?.mForms}队，外门在阵=${hudNow?.mOuterField}兵）`);
assert.ok((hudNow?.mOuterField ?? 0) >= 120, `攻打山门我方投入足够兵力（当前外门在阵=${hudNow?.mOuterField}兵）`);

// 结束本场山门战以测第 4 项护送闭环
SW.end(wGate, 0, '测试结束', true);

// 4) 验证护送点击不消失、途经遇伏、清剿后继续行军、实际抵达大营再判成功
const w2 = SW.declare('guiling', 'huangfeng', '护送闭环测试');
g.day += 4;
SW.daily(4);
const escortConvoy = SW.spawnMarch(w2, 0, 'convoy', { pills: 12, stones: 400 });
const campBeforePills = w2.campA!.pills;
const meritBeforeEscort = g.war.merit;
const ord = SW.issueWarOrder(w2, 'guiling', 'escort', '护送补给车队', '护送丹药至大营', 'guiling', 35, 30);

const encNode = SW.marchEncounterNode(escortConvoy, w2);
const escOpt = encNode.options.find((o) => o.label.includes('护送'))!;
assert.ok(!!escOpt, '野外遭遇己方车队提供护送选项');
escOpt.act();
assert.ok(!escortConvoy.done && escortConvoy.escorted, '点击护送后车队不会立即消失或直接判成功');
assert.ok(SW.escortHud() !== null, '护送期间提供实时护送进度 HUD');

let sawAmbush = false;
for (let step = 0; step < 360 && !escortConvoy.done; step++) {
  const pos = SW.marchPos(escortConvoy);
  g.player.x = pos.x; g.player.y = pos.y;
  (SW as any).tickRealtimeMarches(1.0);
  const amb = ((SW as any).skirmishes ?? []).find((sk: any) => sk.kind === 'escort_ambush' && sk.marchId === escortConvoy.id);
  if (amb) {
    sawAmbush = true;
    assert.ok(escortConvoy.inRaid, '遭遇敌方伏击时车队停步御敌（inRaid=true）');
    for (const e of amb.unitB) { e.hp = 0; e.dead = true; }
    (SW as any).tickSkirmishes(0.1);
    assert.ok(!escortConvoy.inRaid, '肃清伏兵后车队恢复前进（inRaid=false）');
  }
}
assert.ok(sawAmbush, '护送途经必触发一次敌方伏击拦截实战');
assert.ok(escortConvoy.done && !escortConvoy.escorted, '护送车队实际抵达大营后圆满结案');
assert.ok(w2.campA!.pills > campBeforePills, '抵达大营后补给丹药真正入库');
assert.ok(g.war.merit >= meritBeforeEscort + 22 + 35, '抵达大营后统一结算护送战功与 escort 军令');
assert.ok(ord.done, 'escort 军令在抵达大营后自动标记完成');

console.log('ALL_4_SECTWAR_FIXES_PASSED');
process.exit(0);
