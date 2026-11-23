import assert from 'node:assert/strict';
import fs from 'node:fs';
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
const { formationOffsets, formationBounds } = await import('../src/world/warformation');
const { MY_SECT_ID } = await import('../src/data/sects');
const { LOC_BY_ID } = await import('../src/data/world');

const terrain = new Terrain();
terrain.build();
const g = new Game(terrain);
const cv: any = createCanvas(CW, CH);
cv.clientWidth = CW; cv.clientHeight = CH;
cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: CW, height: CH });
g.canvas = cv;
g.renderer = new Renderer(g, cv);
(g as any).paused = false;

g.hero.realm = 4;
g.hero.stage = 0;
g.day = 4000;
const hf = LOC_BY_ID.get('huangfeng')!;
(g.ws as any).mySect = {
  name: '太虚测试宗', dao: 'zheng', map: 'renjie', x: hf.x + 14, y: hf.y + 10,
  founded: g.day - 3000, fame: 900, stones: 200000, tribute: 0, ds: [], seq: 1,
  apps: [], lib: [], gf: 'qingyuan', halls: { lib: 0, dan: 2, zhen: 2, ling: 5 },
  open: false, minRoot: 2, auto: false, lastM: Math.floor(g.day / 30), lastTeach: -999,
  log: [], gifts: [], wins: 0, losses: 0,
};
const ms = g.ws.mySect as any;
for (let i = 0; i < 160; i++) {
  const realm = i < 4 ? 4 : i < 20 ? 3 : i < 70 ? 2 : 1;
  ms.ds.push({
    id: ms.seq++, name: '弟子' + i, sex: i % 2 ? 'm' : 'f', age: 30,
    root: 1 + (i % 5), realm, stage: i % 3, exp: 0.95, loyal: 70,
    rank: realm >= 3 ? 3 : realm >= 2 ? 1 : 0, job: i % 4 === 0 ? 'ye' : 'xiu',
    joined: g.day, arts: 0,
  });
}
g.mysect.sync();
g.sectwar.initHolds();

const SW = g.sectwar;
const w = SW.declare(MY_SECT_ID, 'huangfeng', '测试战事');
assert(w.campA && w.campB, '宣战后立即生成双方前线大营');

// 1) 开战不默认瞬移而是赶路
const startX = g.player.x;
const startY = g.player.y;
const node = SW.myWarNode(w);
const dispatchOpt = node.options.find((o) => o.label.includes('遣') && o.label.includes('攻打'));
assert(dispatchOpt, `存在遣兵入口 (${node.options.map((o) => o.label).join(' | ')})`);
const sendNode = dispatchOpt!.act()!;
const marchOpt = sendNode.options.find((o) => o.label.includes('亲征'));
assert(marchOpt, '存在宗主亲征入口');
marchOpt!.act();
assert.equal(Math.hypot(g.player.x - startX, g.player.y - startY) < 10, true, '点击宗主亲征不得瞬移玩家位置');
assert.equal(SW.hud(), null, '未抵达前线时不直接开启战斗');
assert.ok(g.destination || g.guide, '设置前线目标与虚线导航路线');

// 移动玩家抵达前线附近，应自动接战
const fl = SW.frontLines().find((x) => x.warId === w.id)!;
assert.ok(fl, 'M 地图返回战线数据');
g.teleport(fl.fx + 400, fl.fy);
for (let i = 0; i < 6; i++) g.update(0.25);
assert.ok(SW.hud(), '赶赴抵近前线后自动列阵开战');

// 2) 弟子方阵不挤在一起（阵内间距 + 阵间椭圆防重叠）
for (const pat of ['square', 'crane', 'circle', 'arrow'] as const) {
  const pts = formationOffsets(pat, 120);
  let minD = Infinity;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      if (d < minD) minD = d;
    }
  }
  assert.ok(minD >= 42, `${pat} 阵内士兵最小间距 (${minD.toFixed(1)}px) 必须 >= 42px`);
}

// 构造两个同阵营满编方阵验证不会叠压
const bAny = (SW as any).battle;
assert.ok(bAny && bAny.formations.length >= 2, '战场存在多个百人战阵');
for (let i = 0; i < 40; i++) g.update(1 / 30);
const allyForms = bAny.formations.filter((f: any) => f.ours && !f.collapsed);
if (allyForms.length >= 2) {
  const f1 = allyForms[0], f2 = allyForms[1];
  const b1 = formationBounds(f1.pattern, f1.soldiers);
  const b2 = formationBounds(f2.pattern, f2.soldiers);
  const ellSep = Math.hypot((f1.x - f2.x) / (b1.rx + b2.rx), (f1.y - f2.y) / (b1.ry + b2.ry));
  assert.ok(ellSep >= 0.9, `友军战阵之间椭圆分离度 ${ellSep.toFixed(2)} >= 0.9，绝不叠成一团`);
}

// 3) 战后弟子不直接消失（转入归营/溃退队列继续在场行走渐隐）
const postFormsBefore = bAny.formations.length;
const postAlliesBefore = bAny.allies.filter((e: any) => !e.dead).length;
assert.ok(postFormsBefore > 0 && postAlliesBefore > 0, '战前场上有战阵与同门');
(SW as any).finish(bAny, w, true, '测试收兵');
assert.equal(SW.hud(), null, '战斗结算完毕');
const postList: any[] = [];
SW.collectFormations(postList, { left: fl.fx - 4000, top: fl.fy - 4000, right: fl.fx + 4000, bottom: fl.fy + 4000 }, 1.0);
assert.ok(postList.length > 0, '战后同门与战阵仍在场景内收兵撤离，不瞬间蒸发');
for (let i = 0; i < 20; i++) g.update(0.1);
const postList2: any[] = [];
SW.collectFormations(postList2, { left: fl.fx - 4000, top: fl.fy - 4000, right: fl.fx + 4000, bottom: fl.fy + 4000 }, 3.0);
assert.ok(postList2.length > 0, '战后数秒内仍持续保持撤离/归营表现');

// 4) 场景内绵连营帐 & 远景营帐 & 存档补营
delete (w as any).campA;
SW.migrateWarState();
assert.ok(w.campA, 'migrateWarState 自动补全缺失的大营');
const cp = SW.campPos(w, 0)!;
const campDraws: any[] = [];
SW.collectWorld(campDraws, { left: cp.x - 1000, top: cp.y - 1000, right: cp.x + 1000, bottom: cp.y + 1000 }, 1.0);
const campItem = campDraws.find((d) => d.k === 'D·宗门大营');
assert.ok(campItem, 'collectWorld 输出场景连营大帐');
const c2d = cv.getContext('2d') as any;
let polyOps = 0;
const origMoveTo = c2d.moveTo.bind(c2d);
c2d.moveTo = (...args: any[]) => { polyOps++; return origMoveTo(...args); };
campItem.draw(c2d);
assert.ok(polyOps >= 25, `连营大帐绘制足够丰富（包含木栅/望楼/连排军帐/帅旗，线段数=${polyOps}）`);
SW.collectFarWorld(c2d, { left: cp.x - 5000, top: cp.y - 5000, right: cp.x + 5000, bottom: cp.y + 5000 }, 0.04);

// 5) M 地图战线检查
const lines = SW.frontLines();
assert.ok(lines.length >= 1 && Number.isFinite(lines[0].ax) && Number.isFinite(lines[0].campAX) && Number.isFinite(lines[0].fx), 'M 地图战争阵线含山门/大营/交锋前线完整坐标');

// 6 & 7) 渲染云层/远景雾/地表着色器检查
for (const z of [1.0, 0.25, 0.04]) {
  g.cam.zoom = z;
  (g.renderer as any).render(1 / 60);
}
const renderSrc = fs.readFileSync('src/world/render.ts', 'utf8');
assert.ok(!renderSrc.includes('const flatFog = z < 0.16'), '已移除远景矩形白方块 flatFog');
assert.ok(renderSrc.includes('destination-in'), '神识圈外迷雾已裁剪飞行云岚');
const groundSrc = fs.readFileSync('src/gl/ground.ts', 'utf8');
assert.ok(groundSrc.includes('farTint') && groundSrc.includes('if(near<0.99)'), '地表着色器已补齐近景渐隐连续深青色值补偿');

console.log('ALL V0.74 WAR & VISUAL FIXES PASSED');
process.exit(0);
