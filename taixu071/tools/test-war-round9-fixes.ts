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
const { ACTIVE_MAP, LOC_BY_ID, WORLD_SCALE } = await import('../src/data/world');
const { ENEMIES } = await import('../src/data/enemies');
const { Enemy } = await import('../src/world/combat');
const { facingFromVec, codeToFacing, tickFormation } = await import('../src/world/warformation');

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

// 1) 8方位角色朝向（无斜向漂移）
const dirs: [number, number, string, boolean, string][] = [
  [0, 1, 'front', false, '正南'],
  [1, 1, 'diagF', false, '东南'],
  [1, 0, 'side', false, '正东'],
  [1, -1, 'diagB', false, '东北'],
  [0, -1, 'back', false, '正北'],
  [-1, -1, 'diagB', true, '西北'],
  [-1, 0, 'side', true, '正西'],
  [-1, 1, 'diagF', true, '西南'],
];
for (const [vx, vy, expFace, expFlip, label] of dirs) {
  const r = facingFromVec(vx, vy);
  ok(r.facing === expFace && r.flip === expFlip, `8方位映射 ${label} -> ${r.facing}/${r.flip}`);
}

// 士兵行军位移朝向与速度严格一致
const dummyForm: any = {
  id: 9001, sid: 'huangfeng', ours: true, pattern: 'square', school: 'jian',
  soldiers: 24, soldiersMax: 24, deadCount: 0, injCount: 0, routedCount: 0,
  volleyCd: 99, collapsed: false, collapseT: 0, x: 10000, y: 10000,
  face: 1, faceY: -1, faceAng: -Math.PI * 0.5, targetFaceAng: -Math.PI * 0.5, moving: true, holdFire: true,
  deployTargetX: 10600, deployTargetY: 9400,
  anchorX: 10000, anchorY: 10000, prevLeaderX: 10000, prevLeaderY: 10000,
  leader: { x: 10000, y: 10000, dead: false, gone: false, realm: 2 },
};
tickFormation(dummyForm, g, 0.05, [dummyForm], 'charge');
for (let i = 0; i < 12; i++) tickFormation(dummyForm, g, 0.05, [dummyForm], 'charge');
const fCode = codeToFacing(dummyForm._sFace[0]);
ok(fCode === 'diagB' && dummyForm._sFlip[0] === 0, `士兵向东北移动时朝向自动切为 ${fCode}/flip=${dummyForm._sFlip[0]}（无漂移）`);

// 2) 同盟之间营帐聚拢（同战区正道/魔道同盟各派参战营帐彼此紧邻成片，而与敌营保持战线距离）
const w1 = SW.declare('huangfeng', 'hehuan', '同盟聚拢测试1');
const w2 = SW.declare('yanyue', 'moyan', '同盟聚拢测试2');
w2.tgt = w1.tgt; // 同战区正道同盟 vs 魔道同盟
SW.relocateCampsIfNeeded(w1);
SW.relocateCampsIfNeeded(w2);
const dAllyA = Math.hypot(w1.campA!.x - w2.campA!.x, w1.campA!.y - w2.campA!.y);
const dAllyB = Math.hypot(w1.campB!.x - w2.campB!.x, w1.campB!.y - w2.campB!.y);
ok(dAllyA <= 1650 && dAllyB <= 1650, `同盟之间营帐紧密聚拢：正道两营距=${Math.round(dAllyA)}px，魔道两营距=${Math.round(dAllyB)}px`);
const dOpp = Math.hypot(w1.campA!.x - w1.campB!.x, w1.campA!.y - w1.campB!.y);
ok(dOpp >= 7500, `敌我双方营帐保持安全战线距离（${Math.round(dOpp)}px）`);

// 3) 方案 A：取消前线静态设施（军仓/阵柱/哨塔），战前由大营/运兵粮队/巡哨/斗将驱动
g.day += 5;
SW.daily(5);
const fp = (SW as any).frontPos(w1);
const attr = SW.ensureAttrition(w1);
ok(attr.facilities.length === 0, '方案 A 已移除前线静态三类设施');

// 4) 对峙场面拉开双方距离 + 后方单排百人方阵队列 + 缩放连续 LOD + 无实景/远景虚线
// 贴合新规：平时/夜间/远距非参战战线收束入营，仅临近己方或大战会战前线在白昼展开宏大百人方阵
g.clock = 480 * 0.3;
w1.campaign = true;
g.player.x = fp.x;
g.player.y = fp.y;
const view = { left: fp.x - 4500, top: fp.y - 3500, right: fp.x + 4500, bottom: fp.y + 3500 };
const outMid: any[] = [];
const pushedAtlasKeys: string[] = [];
const mockRen = {
  pushAtlasSpr: (_b: any, _s: any, _x: any, _y: any, _sx: any, _sy: any, _fl: any, _a: any, key: string) => {
    pushedAtlasKeys.push(key);
    return true;
  },
};
SW.collectWorld(outMid, view, 1.5, 0.25, mockRen);
SW.collectFormations([], view, 1.5, { ren: mockRen, z: 0.25, dpr: 1 });
const zRound9 = [...((SW as any)._standoffZoneCache as Map<string, any>).values()][0];
const tArrive9 = 1.5 + (zRound9?.dur ?? 120) + 1.0;
SW.collectFormations(outMid, view, tArrive9, { ren: mockRen, z: 0.25, dpr: 1 });
const standoffDisciplesMidCount = outMid
  .filter((d) => d.k === 'D·战阵兵' || d.k === 'D·前线哨兵')
  .reduce((s, d) => s + (d.count ?? 1), 0);
ok(standoffDisciplesMidCount >= 160, `对峙态前线陈列宏大弟子方阵队列（可见战兵/哨兵=${standoffDisciplesMidCount}人）`);

// 缩小视角 z = 0.09（低于旧版 0.14 截断阈值）：大营、方阵战兵全数以点阵/简化 LOD 保留！
const outLow: any[] = [];
const lowAtlasKeys: string[] = [];
const mockLowRen = {
  pushAtlasSpr: (_b: any, _s: any, _x: any, _y: any, _sx: any, _sy: any, _fl: any, _a: any, key: string) => {
    lowAtlasKeys.push(key);
    return true;
  },
};
const campView = { left: w1.campA!.x - 16000, top: w1.campA!.y - 16000, right: w1.campA!.x + 16000, bottom: w1.campA!.y + 16000 };
SW.collectWorld(outLow, campView, 2.0, 0.09, mockLowRen);
SW.collectFormations(outLow, campView, 2.0, { ren: mockLowRen, z: 0.09, dpr: 1 });
const hasLowCamp = outLow.some((d) => d.k === 'D·宗门大营');
const hasLowFac = outLow.some((d) => d.k === 'D·后方设施');
const hasLowSoldier = outLow.some((d) => d.k === 'D·战阵兵' || d.k === 'D·营地弟子' || d.k === 'D·前线哨兵');
for (const d of outLow) if (d.gl) d.gl({}, 1);
ok(hasLowCamp && !hasLowFac && hasLowSoldier && lowAtlasKeys.includes('P2:dot8'),
  `缩小视角(z=0.09)保留大营与点阵人员 LOD 且不再绘制静态设施（camp=${hasLowCamp}, fac=${hasLowFac}, soldier=${hasLowSoldier}, dot8=${lowAtlasKeys.includes('P2:dot8')}）`);

const c2d = cv.getContext('2d') as any;
let farDashes = 0;
const origDash = c2d.setLineDash.bind(c2d);
c2d.setLineDash = (seg: number[]) => { if (seg && seg.length > 0) farDashes++; return origDash(seg); };
SW.collectFarWorld(c2d, { left: -20000, top: -20000, right: 60000, bottom: 60000 }, 0.04);
ok(farDashes === 0, `远景视图不绘制横贯场景的虚线进攻线（dashCount=${farDashes}）`);

// 5) 活跃战场与玩家自建宗门内部严禁刷新劫修/妖兽
const hf = LOC_BY_ID.get('huangfeng')!;
const mySectGridX = hf.x + 14;
const mySectGridY = hf.y + 10;
(g.ws as any).mySect = {
  name: '太虚道宗', dao: 'zheng', map: ACTIVE_MAP,
  x: mySectGridX, y: mySectGridY, rank: 4,
  halls: { zhen: 3 },
};
const mx = mySectGridX * WORLD_SCALE;
const my = mySectGridY * WORLD_SCALE;
ok(g.combat.safeAt(mx, my) && g.combat.mySectAt(mx, my), '玩家自建宗门领地已纳入 safeAt 安全区判定');
ok(g.combat.warZoneAt(fp.x, fp.y) && g.combat.warZoneAt(w1.campA!.x, w1.campA!.y), '活跃战场前线与大营已纳入 warZoneAt 禁刷区');

// 放入游荡野怪至自建宗门与战区中，运行 combat.update 验证：屏外战区立即清离，屏内宗门则转为退避离场（出屏后清离）
const stray1 = new Enemy(ENEMIES.lang ?? Object.values(ENEMIES)[0], mx + 120, my + 80, 1, 1);
const stray2 = new Enemy(ENEMIES.bandit ?? Object.values(ENEMIES)[0], fp.x + 90, fp.y - 60, 1, 2);
stray1.aggro = false;
stray2.aggro = false;
g.combat.enemies.push(stray1, stray2);
g.teleport(mx, my);
g.combat.update(0.1);
ok(!!(stray1 as any).departing && stray2.gone, '误入自建宗门内部（屏内退避离场）或活跃战场区域（屏外立即清离）的无主妖兽/劫修被驱散');

console.log('ALL_ROUND9_WAR_AND_SPAWN_FIXES_PASSED');
