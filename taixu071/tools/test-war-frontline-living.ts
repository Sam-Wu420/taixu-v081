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
const { LOC_BY_ID, WORLD_SCALE, ACTIVE_MAP } = await import('../src/data/world');

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
g.day = 2000;
g.hero.realm = 4;
g.hero.stage = 0;

// 1) 营帐与战场位置：绝不与任何城镇/山门/村落或水域重叠，且不互撞
const pairs: [string, string][] = [
  ['guiling', 'huangfeng'],
  ['yanyue', 'hehuan'],
  ['lingshou', 'yuling'],
];
const wars = pairs.map(([a, b]) => SW.declare(a, b, '开阔地安营测试'));
for (const w of wars) {
  const fl = SW.frontLines().find((x) => x.warId === w.id)!;
  assert.ok(fl, '战线存在');
  for (const [label, cx, cy] of [
    ['campA', fl.campAX, fl.campAY],
    ['campB', fl.campBX, fl.campBY],
  ] as const) {
    assert.ok(terrain.walkFactor(cx, cy) > 0, `${w.a}×${w.b} ${label} 不在水域中`);
    for (const l of LOC_BY_ID.values()) {
      if (l.map !== ACTIVE_MAP) continue;
      const d = Math.hypot(cx - l.x * WORLD_SCALE, cy - l.y * WORLD_SCALE);
      assert.ok(d >= 2100, `${w.a}×${w.b} ${label} 距地点「${l.name}」=${Math.round(d)}px >= 2100px，未重叠`);
    }
  }
  const dCamp = Math.hypot(fl.campAX - fl.campBX, fl.campAY - fl.campBY);
  assert.ok(dCamp >= 1500, `敌我大营相距 ${Math.round(dCamp)}px >= 1500px`);
}

// 1b) 旧存档压进城池的大营在 migrateWarState 后自动迁避开阔地
const wTest = wars[0];
const hf = LOC_BY_ID.get('huangfeng')!;
wTest.campB!.x = hf.x * WORLD_SCALE;
wTest.campB!.y = hf.y * WORLD_SCALE;
SW.migrateWarState();
const distAfterMigrate = Math.hypot(wTest.campB!.x - hf.x * WORLD_SCALE, wTest.campB!.y - hf.y * WORLD_SCALE);
assert.ok(distAfterMigrate >= 2200, `migrateWarState 自动迁出压城的营帐（现距山门 ${Math.round(distAfterMigrate)}px）`);

// 2) 实时行军在不跳日的前提下平滑移动，且战线推进记入 frontTrail & holdBadges
const mc0 = SW.activeMarches()[0];
assert.ok(mc0, '开战存在在途行军');
const posStart = SW.marchPos(mc0);
for (let i = 0; i < 60; i++) g.update(1 / 20); // 仅 3 秒真实帧推进
const posLater = SW.marchPos(mc0);
const movedDist = Math.hypot(posLater.x - posStart.x, posLater.y - posStart.y);
assert.ok(posLater.progress > posStart.progress && movedDist > 40, `实时行军 3 秒内真实位移 ${Math.round(movedDist)}px（进度 ${(posStart.progress * 100).toFixed(1)}% -> ${(posLater.progress * 100).toFixed(1)}%）`);

const badges = SW.holdBadges(ACTIVE_MAP);
assert.ok(badges.length >= 10, `M 图 holdBadges 暴露全图所有宗门据点归属（共 ${badges.length} 处）`);

// 推进一步夺点，验证阵线推进轨迹 trail 写入
g.day += 5;
SW.daily(5);
assert.equal(wTest.phase, 'battle', '4 日后进入实战期');
const prevTgt = wTest.tgt;
(SW as any).after(wTest, true, false);
const flAfter = SW.frontLines().find((x) => x.warId === wTest.id)!;
assert.ok(flAfter.tgtId !== prevTgt && flAfter.trail.length >= 1, `攻克据点后阵线推进至 ${flAfter.tgtName}，历史战线 trail=${flAfter.trail.length}`);

// 2b) 远景缩略视角同时绘制大营、战线与在途行军
const c2d = cv.getContext('2d') as any;
let farStrokes = 0;
let farDashes = 0;
const origStroke = c2d.stroke.bind(c2d);
const origDash = c2d.setLineDash.bind(c2d);
c2d.stroke = (...a: any[]) => { farStrokes++; return origStroke(...a); };
c2d.setLineDash = (seg: number[]) => { if (seg && seg.length > 0) farDashes++; return origDash(seg); };
SW.collectFarWorld(c2d, { left: -20000, top: -20000, right: 900000, bottom: 900000 }, 0.04);
assert.ok(farStrokes >= 3 && farDashes === 0, `远景 collectFarWorld 绘制了营帐与前线徽记且不画虚线（stroke=${farStrokes}, dash=${farDashes}）`);

// 3) 局部打斗由真实 NPC 小队自大营出发赶往交战地带自由游斗交锋（不再列成死板小方阵，且不在神识内圈凭空刷新）
g.combat.enemies.length = 0;
g.teleport(flAfter.fx + g.detailSenseRadius + 600, flAfter.fy);
for (let i = 0; i < 6; i++) g.update(0.25);
const skA = g.combat.enemies.filter((e) => !e.dead && e.team?.endsWith(':a'));
const skB = g.combat.enemies.filter((e) => !e.dead && e.team?.endsWith(':b'));
const skSquad = ((SW as any).skirmishes ?? []).find((s: any) => s.kind === 'front');
assert.ok(skA.length >= 2 && skB.length >= 2 && !skSquad?.formA && !skSquad?.formB,
  `旁观/太上从外圈接近前线时刷出真实 NPC 自由游斗交锋（A ${skA.length} vs B ${skB.length}，无死板小方阵）`);
assert.ok(skA.every((e) => Math.hypot(e.x - g.player.x, e.y - g.player.y) >= g.detailSenseRadius - 120)
  && skB.every((e) => Math.hypot(e.x - g.player.x, e.y - g.player.y) >= g.detailSenseRadius - 120),
  '局部冲突游斗小队不会直接刷在玩家神识内圈之中');
const pool0 = [...skA, ...skB].reduce((s, e) => s + e.hp, 0);
let pool1 = pool0;
for (let i = 0; i < 1500 && pool1 >= pool0; i++) {
  g.update(0.1);
  pool1 = [...skA, ...skB].reduce((s, e) => s + Math.max(0, e.hp), 0);
}
assert.ok(pool1 < pool0, `两派自大营赶往交战地带的自由游斗小队真刀真枪互打掉血（总血量 ${Math.round(pool0)} -> ${Math.round(pool1)}）`);

// 4) 截杀敌方行军纵队触发护卫弟子实战，击败后自动完成劫粮
g.combat.enemies.length = 0;
const mcRaid = SW.spawnMarch(wTest, 0, 'convoy', { pills: 10, stones: 300 });
const mp = SW.marchPos(mcRaid);
g.teleport(mp.x + 120, mp.y);
const dlg = SW.marchEncounterNode(mcRaid, wTest);
const raidOpt = dlg.options.find((o) => o.label.includes('半路突袭截杀'));
assert.ok(raidOpt, '截杀选项存在');
raidOpt!.act();
const raidFoes = g.combat.enemies.filter((e) => !e.dead && e.team?.includes(':raid'));
assert.ok(raidFoes.length >= 4, `选择半路截杀后刷出 ${raidFoes.length} 名真实护卫弟子迎战`);
const merit0 = g.war.merit;
for (const e of raidFoes) e.hp = 0, e.dead = true;
g.update(0.1);
assert.ok(mcRaid.raided && mcRaid.done && g.war.merit > merit0, `击溃护卫弟子后自动完成截杀劫粮（战功 ${merit0} -> ${g.war.merit}）`);

console.log('ALL LIVING FRONTLINE & SKIRMISH CHECKS PASSED');
process.exit(0);
