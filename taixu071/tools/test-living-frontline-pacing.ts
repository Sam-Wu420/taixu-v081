// 专项验收：战线休整对峙节奏 + 具名 NPC 活化与宗门任务-资源-修炼闭环
import assert from 'node:assert/strict';
import { createCanvas } from './env';

const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Renderer } = await import('../src/world/render');
const { thoughtOf } = await import('../src/world/alive');

const terrain = new Terrain(); terrain.build();
const g = new Game(terrain);
const cv: any = createCanvas(CW, CH);
cv.clientWidth = CW; cv.clientHeight = CH;
cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: CW, height: CH });
g.canvas = cv; g.renderer = new Renderer(g, cv); (g as any).paused = false;
g.hero.realm = 2; g.hero.stage = 0;

// ------------------------------------------------------------ 1. 战线节奏化（交锋 → 撤营 → 对峙休整 → 夜防对峙 → 复战）
const sw = g.sectwar;
const w = sw.declare('huangfeng', 'guiling', true)!;
assert(w && w.tgt, '战事创建成功');
g.day += 4;
sw.daily(4);
w.phase = 'battle';
w.build = 1;
w.lullUntil = 0;
g.clock = 480 * 0.3; // 上午时段
const fp = sw.frontPos(w)!;
g.player.x = fp.x + g.detailSenseRadius + 500;
g.player.y = fp.y + 150;
sw.skirmishCd.set(`war:${w.id}`, 0);

sw.tickSkirmishes(0.5);
assert(sw.skirmishes.length >= 1, '非休整期白天可触发前线巡哨交火');
const sk = sw.skirmishes[0];
assert.equal(sk.kind, 'front');

for (const e of sk.unitB) { e.hp = 0; e.dead = true; }
if (sk.formB) { sk.formB.soldiers = 0; sk.formB.collapsed = true; }
for (let i = 0; i < 6; i++) sw.tickSkirmishes(0.8);
assert.equal(sk.resolved, true, '分出胜负后进入结算');
for (let i = 0; i < 6; i++) sw.tickSkirmishes(0.8);
assert.equal(sw.skirmishes.length, 0, '结算完毕后移除活跃 skirmish');

assert((w.lullUntil ?? 0) > g.day, '战后进入休兵对峙期 lullUntil');
assert((sw.skirmishCd.get(`war:${w.id}`) ?? 0) >= 60, '战后冷却拉长');
assert.equal(sw.isFrontlineStandoff(w), true, '处于前线对峙休整态');

const fl = sw.frontLines().find((l) => l.warId === w.id)!;
assert(fl && fl.stageLabel.includes('对峙休整'), `frontLines 展示对峙休整: ${fl?.stageLabel}`);

const survivingA = sk.unitA.filter((e) => !e.dead);
assert(survivingA.length > 0 && survivingA.every((e: any) => e.departing && e.flee && e.noP), '未亡巡哨弟子有序撤回己方大营');

sw.skirmishCd.set(`war:${w.id}`, 0);
sw.tickSkirmishes(1);
assert.equal(sw.skirmishes.length, 0, 'lullUntil 对峙休整期内不重复刷出交火');

const out: any[] = [];
sw.collectWorld(out, { left: fp.x - 2400, top: fp.y - 1800, right: fp.x + 2400, bottom: fp.y + 1800 }, 1, 1);
assert(out.some((o) => o.k === 'D·前线哨位'), '对峙休整期 collectWorld 正常生成哨营巡防绘制图元');

g.day = (w.lullUntil ?? g.day) + 0.5;
g.clock = 0; // 子夜
sw.tickSkirmishes(0.5);
assert(sw.skirmishes.length === 0 && sw.isFrontlineStandoff(w), '深夜非破山门期自动进入夜防对峙');

g.clock = 480 * 0.3;
sw.skirmishCd.set(`war:${w.id}`, 0);
sw.tickSkirmishes(0.5);
assert(sw.skirmishes.length >= 1, '休整到期且回到白天后恢复巡哨交锋');
console.log('ok   战线节奏化（交锋/撤营/休整对峙/夜防对峙/复战）');

// ------------------------------------------------------------ 2. 具名 NPC 活化 + 宗门任务-资源-修炼闭环 + 低耗时
const named = g.npcs.list.filter((d) => d.alive && (d.canon || d.orig || d.beauty) && d.sect && (d.map ?? 'renjie') === 'renjie');
assert(named.length >= 10, `宗门具名 NPC 数量充足: ${named.length}`);
const initPos = new Map(named.map((d) => [d.id, { x: d.x, y: d.y, stage: d.stage, realm: d.realm }]));

const t0 = performance.now();
for (let i = 0; i < 360; i++) {
  g.day += 1;
  g.living.daily(1);
  (g.npcs as any).coarse(24);
}
const elapsed = performance.now() - t0;
const perDay = elapsed / 360;
console.log(`360日 living+coarse 耗时: ${elapsed.toFixed(1)} ms (日均 ${perDay.toFixed(2)} ms)`);
assert(perDay < 15, `单日 living+coarse 均值 < 15ms (实际 ${perDay.toFixed(2)}ms)`);

let withPlan = 0, movedNamed = 0, didTask = 0, boostedRate = 0;
for (const d of named) {
  if (d.plan) withPlan++;
  const p0 = initPos.get(d.id)!;
  if (Math.hypot(d.x - p0.x, d.y - p0.y) > 80) movedNamed++;
  if ((d.taskDone ?? 0) > 0) didTask++;
  if ((d.cultRate ?? g.living.calcCultRate(d)) > 1.05) boostedRate++;
}
assert.equal(withPlan, named.length, '全部具名 NPC 都拥有真实生活打算');
assert(movedNamed >= 5, `非驻守具名 NPC 真正离开原地外出活动 (moved=${movedNamed})`);
assert(didTask >= 10, `宗门具名 NPC 真实接取并完成了宗门任务 (didTask=${didTask})`);
assert(boostedRate >= 10, `获得宗门俸禄/任务资源后修炼倍率提升 (boosted=${boostedRate})`);

const sectNpc = g.npcs.byId.get('o_luqingya')!;
sectNpc.resScore = 10;
sectNpc.plan = { k: 'duty', to: sectNpc.home, why: '领宗门差事', until: g.day, t0: g.day - 15, task: { kind: 'kill', title: '清剿妖兽', stones: 50, ctb: 80, item: 'pill_juqi' } };
const ctb0 = sectNpc.ctb ?? 0, w0 = sectNpc.wealth, td0 = sectNpc.taskDone ?? 0, rs0 = sectNpc.resScore ?? 0;
(g.living as any).resolve(sectNpc, g.day, Math.random, 1);
assert((sectNpc.ctb ?? 0) > ctb0 && sectNpc.wealth > w0 && (sectNpc.taskDone ?? 0) === td0 + 1 && (sectNpc.resScore ?? 0) > rs0, 'doDuty 结算灵石、贡献、资源分与完成次数');
assert((sectNpc.cultRate ?? 1) >= 1.25, `完成后修炼速率提升到 >=1.25x: ${sectNpc.cultRate}`);

// 确定性验证：资源加成下 doCult 确实加速推进层数（stage）
sectNpc.realm = 1; sectNpc.stage = 0; sectNpc.resScore = 240; sectNpc.bag = { pill_juqi: 1 };
sectNpc.plan = { k: 'cult', to: sectNpc.home, why: '闭关修炼', until: g.day + 60, t0: g.day };
(g.living as any).doCult(sectNpc, g.day + 60, () => 0.15, 60);
assert(sectNpc.stage >= 1, `高资源倍率下闭关推进修为层数 (stage=${sectNpc.stage})`);

const prof = g.living.profileText(sectNpc);
assert(prof.includes('进境 ×') && prof.includes('已成差事'), '察其根底面板展现任务与进境倍率');

sectNpc.plan = { k: 'duty', to: sectNpc.home, why: '领了宗门「清剿妖兽」任务', until: g.day + 10, task: { kind: 'kill', title: '清剿妖兽', stones: 50, ctb: 80 } };
const th = thoughtOf(g, { d: sectNpc, st: {} as any, act: 'walk', wait: 0, bolts: [] } as any);
assert(!!th && th.length > 0, '心声系统联动宗门任务文案');

console.log('ok   具名 NPC 活化、宗门任务-资源-修炼闭环与性能验收全部通过');
