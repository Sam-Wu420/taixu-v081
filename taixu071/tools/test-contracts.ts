import assert from 'node:assert/strict';
import './env';

const {
  DAYS_PER_MONTH,
  DAYS_PER_YEAR,
  DESTINATION_ARRIVE_RADIUS,
  EN_ROUTE_MATCH_RADIUS,
  GUIDE_ARRIVE_RADIUS,
  INVITE_ARRIVE_RADIUS,
  PORTAL_INTERACT_RADIUS,
  SOS_ARRIVE_RADIUS,
  dayOfYearParts,
  isActiveWorldMap,
  isEnRouteTo,
  isSameWorldMap,
  normalizeWorldMapId,
  withinArrivalRadius,
  worldOfNormalizedMap,
  yearOfDay,
} = await import('../src/world/contracts');

// 1. 时间契约
assert.equal(DAYS_PER_MONTH, 30);
assert.equal(DAYS_PER_YEAR, 360);
assert.equal(yearOfDay(0), 1);
assert.equal(yearOfDay(359), 1);
assert.equal(yearOfDay(360), 2);
assert.deepEqual(dayOfYearParts(0), { y: 1, m: 1, d: 1 });
assert.deepEqual(dayOfYearParts(359), { y: 1, m: 12, d: 30 });
assert.deepEqual(dayOfYearParts(360), { y: 2, m: 1, d: 1 });

// 2. 界域归一契约
assert.equal(normalizeWorldMapId('tiannan'), 'renjie');
assert.equal(normalizeWorldMapId('luanxing'), 'renjie');
assert.equal(normalizeWorldMapId('dajin'), 'renjie');
assert.equal(normalizeWorldMapId('renjie'), 'renjie');
assert.equal(normalizeWorldMapId('lingjie'), 'lingjie');
assert.equal(normalizeWorldMapId('xianjie'), 'xianjie');
assert.equal(isSameWorldMap('tiannan', 'renjie'), true);
assert.equal(isSameWorldMap('lingjie', 'renjie'), false);
assert.equal(isActiveWorldMap('tiannan', 'renjie'), true);
assert.equal(isActiveWorldMap('lingjie', 'renjie'), false);
assert.equal(worldOfNormalizedMap('dajin'), 'human');
assert.equal(worldOfNormalizedMap('lingjie'), 'spirit');
assert.equal(worldOfNormalizedMap('xianjie'), 'immortal');

// 3. 到场半径与在途判定契约
assert.ok(DESTINATION_ARRIVE_RADIUS < EN_ROUTE_MATCH_RADIUS);
assert.ok(EN_ROUTE_MATCH_RADIUS < GUIDE_ARRIVE_RADIUS);
assert.ok(GUIDE_ARRIVE_RADIUS < INVITE_ARRIVE_RADIUS);
assert.ok(INVITE_ARRIVE_RADIUS < SOS_ARRIVE_RADIUS);
assert.equal(PORTAL_INTERACT_RADIUS, SOS_ARRIVE_RADIUS);
assert.equal(withinArrivalRadius(100, 100, 110, 110, 24), true);
assert.equal(withinArrivalRadius(100, 100, 130, 100, 24), false);
assert.equal(withinArrivalRadius(100, 100, NaN, 100, 24), false);

assert.equal(isEnRouteTo({ destination: { x: 1000, y: 2000 }, autoFlight: null }, 1050, 2050, 'tiannan'), true);
assert.equal(isEnRouteTo({ destination: null, autoFlight: { x: 1000, y: 2000 } }, 1050, 2050, 'renjie'), true);
assert.equal(isEnRouteTo({ destination: { x: 1000, y: 2000 }, autoFlight: null }, 1050, 2050, 'lingjie'), false);
assert.equal(isEnRouteTo({ destination: { x: 1000, y: 2000 }, autoFlight: null }, 1400, 2000, 'renjie'), false);

// 4. 运行时接入：sectwar 兼容旧地图入参 & combat.mySectAt & events 年份一致
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { LOC_BY_ID, WORLD_SCALE } = await import('../src/data/world');

const t = new Terrain();
t.build();
const g = new Game(t);
g.day = 360 * 2 + 15;
assert.equal(g.events.year, yearOfDay(g.day));

const hf = LOC_BY_ID.get('huangfeng')!;
(g.ws as any).mySect = {
  name: '契约宗', dao: 'zheng', map: 'tiannan', x: hf.x + 12, y: hf.y + 8,
  founded: 0, fame: 100, stones: 1000, tribute: 0, ds: [], seq: 1, apps: [], lib: [], gf: 'qingyuan',
  halls: { lib: 0, dan: 0, zhen: 0, ling: 0 }, open: false, minRoot: 1, auto: false, lastM: 0, lastTeach: 0,
  log: [], gifts: [], wins: 0, losses: 0,
};
assert.equal(g.combat.mySectAt((hf.x + 12) * WORLD_SCALE, (hf.y + 8) * WORLD_SCALE), true);
assert.ok(g.sectwar.sects('tiannan').length > 0);
assert.ok(g.sectwar.sectTerritories('tiannan').length > 0);

// 6. 界域上限闭关、自动导航不因遇敌停驻、打坐不因杀气中断、友人相约时限延长
{
  const { Enemy } = await import('../src/world/combat');
  const { ENEMIES } = await import('../src/data/enemies');
  const { BEAUTY_BY_ID } = await import('../src/data/beauties');

  // 6a) 到达当前界域上限后仍可按日数闭关（修为无收益，但年龄/时间/疗伤推进）；仅「直到瓶颈(0)」提示已无瓶颈
  g.hero.realm = 5; g.hero.stage = 2; g.hero.exp = 0;
  const age0 = g.hero.age;
  const repCapZero = g.seclude(0);
  assert.equal(repCapZero.days, 0);
  const repCapDays = g.seclude(15);
  assert.equal(repCapDays.days, 15);
  assert.equal(repCapDays.expGain, 0);
  assert.ok(g.hero.age > age0);

  // 6b) 自动导航赶路遇敌不中断
  g.hero.mp = 0.8;
  g.combat.reset();
  const enemyDef = ENEMIES.bandit ?? Object.values(ENEMIES)[0];
  const foe = new Enemy(enemyDef, g.player.x + 100, g.player.y + 60, 1, 0);
  foe.aggro = true;
  g.combat.enemies.push(foe);
  (g.pursuit as any).cur = { e: foe, wings: [], kind: 'hunt', t: 0, x0: foe.x, y0: foe.y };
  assert.equal(g.combat.inCombat, true);
  const afStarted = g.startAutoFlight(g.player.x + 20000, g.player.y + 12000, '测试目的地');
  assert.equal(afStarted, true);
  g.update(0.05);
  assert.ok(!!g.autoFlight && !!g.destination, '自动导航遇敌/追兵时不应自动停下');
  g.stopAutoFlight('cleanup');

  // 6c) 打坐时附近有杀气/追兵不强行中断
  g.teleport(g.player.x, g.player.y);
  foe.x = g.player.x + 120; foe.y = g.player.y + 40;
  if (!g.combat.enemies.includes(foe)) g.combat.enemies.push(foe);
  g.player.flying = false;
  g.toggleSit();
  assert.equal(g.player.sitting, true);
  g.update(0.05);
  assert.equal(g.player.sitting, true, '打坐时附近有敌人杀气不应强行中断');
  g.stand();
  (g.pursuit as any).cur = null;
  g.combat.reset();

  // 6d) 友人相约 / 红颜求援时限延长
  const fr = g.npcs.list.find((n) => n.alive && !n.beauty) ?? g.npcs.list[0];
  if (fr) {
    fr.alive = true; fr.hidden = false; fr.realm = Math.max(1, fr.realm); fr.map = 'renjie' as any;
    const invHelp = g.friends.makeInvite('help', fr);
    const invExplore = g.friends.makeInvite('explore', fr);
    if (invHelp) assert.ok(invHelp.until - invHelp.day >= 60, `求援时限应>=60日，实际 ${invHelp.until - invHelp.day}`);
    if (invExplore) assert.ok(invExplore.until - invExplore.day >= 120, `相约探秘时限应>=120日，实际 ${invExplore.until - invExplore.day}`);
  }
  const bDef = Object.values(BEAUTY_BY_ID)[0];
  if (bDef) {
    (g.hearts as any).st(bDef.id).met = true;
    (g.heartx as any).startSos(bDef);
    const sos = (g.ws.flags as any).sos;
    if (sos) assert.ok(sos.until - g.day >= 45, `红颜求援时限应>=45日，实际 ${sos.until - g.day}`);
    (g.heartx as any).startReq(bDef);
    const req = (g.hearts as any).st(bDef.id).flags.req;
    if (req) assert.ok(req.until - g.day >= 90, `红颜托付时限应>=90日，实际 ${req.until - g.day}`);
  }
}

// 7. 时间系统全面一致性与 PC 左侧任务抽屉检查
{
  const fs = await import('node:fs');
  const { DAYS_PER_SEC, MEDITATE_SPEED, DAY_CYCLE } = await import('../src/world/game');
  const { TUNING } = await import('../src/data/tuning');
  const { Ecology } = await import('../src/world/ecology');

  // 7a) 常量统一
  assert.equal(DAYS_PER_SEC, TUNING.daysPerSec);
  assert.equal(MEDITATE_SPEED, TUNING.meditateSpeed);
  assert.equal(DAY_CYCLE, TUNING.dayCycle);

  // 7b) 暂停时 g.time / g.day / g.clock 一并冻结，不偷跑倒计时或飘移昼夜
  const t0 = g.time, d0 = g.day, c0 = g.clock;
  g.paused = true;
  g.update(1.5);
  assert.equal(g.time, t0, '暂停时 g.time 不得继续推进');
  assert.equal(g.day, d0, '暂停时 g.day 不得继续推进');
  assert.equal(g.clock, c0, '暂停时 g.clock 不得飘移');
  g.paused = false;

  // 7c) passDays 同步推进 day 与 clock，且更新 npcs.lastDay
  const cBefore = g.clock, dBefore = g.day;
  g.passDays(2.5);
  assert.equal(g.day, dBefore + 2.5);
  assert.ok(Math.abs(((g.clock - cBefore) % DAY_CYCLE + DAY_CYCLE) % DAY_CYCLE - (0.5 * DAY_CYCLE)) < 1e-6, 'passDays 同步推进 clock');

  // 7d) 生态账本 dead 槽位存档/读档使用相对剩余时间 respawnIn，不因重开后 g.time=0 卡死
  const eco = new Ecology();
  eco.requestPopulate([5, 5], 1, { left: 0, right: 100, top: 0, bottom: 100 }, 10000, 10000, (sx, sy) => ({
    defId: 'wolf', x: sx, y: sy, realm: 1, stage: 1, sea: false, maxHpMul: 1, atkMul: 1,
  }));
  const slot = [...eco.slots.values()].flat()[0];
  assert.ok(slot);
  slot.state = 'dead';
  slot.respawnAt = 3600 + 120;
  const savedEco = eco.toSave(320, 3600);
  assert.equal(savedEco[0].respawnIn, 120, '生态存档应记录相对剩余重生秒数');
  const eco2 = new Ecology();
  eco2.fromSave(savedEco);
  assert.equal(eco2.size, 1);
  eco2.tick(125);
  assert.equal(eco2.size, 0, '读档后 g.time 从 0 起算 125s 应正常清理到期 dead 槽位');

  // 7e) 读档回退天数时 npcs.fromSave 必须重置 lastDay，否则高天退回低天会长期跳过日结算
  g.day = 200;
  g.npcs.daily(1);
  assert.equal((g.npcs as any).lastDay, 200);
  g.day = 60;
  g.npcs.fromSave(g.npcs.toSave());
  assert.equal((g.npcs as any).lastDay, 60, 'npcs.fromSave 应同步重置 lastDay 到当前存档天数');

  // 7f) PC 端左侧任务抽屉 & 废弃「光阴 ×4」文案清理检查
  const gvSrc = fs.readFileSync('src/ui/GameView.tsx', 'utf8');
  const mlSrc = fs.readFileSync('src/ui/ModalLayer.tsx', 'utf8');
  const pnSrc = fs.readFileSync('src/ui/Panels.tsx', 'utf8');
  assert.ok(!gvSrc.includes('isTouch ? <QuestDrawer'), 'PC 端也应渲染左侧 QuestDrawer');
  assert.ok(gvSrc.includes('<QuestDrawer game={game} />'), 'QuestDrawer 已全端挂载');
  assert.ok(!gvSrc.includes('光阴 ×4') && !mlSrc.includes('光阴 ×4'), 'UI 文案已清理过期「光阴 ×4」');
  assert.ok(!pnSrc.includes('* 240'), '时辰滑块不再硬编码 * 240');
}

console.log('ALL CONTRACTS TESTS PASSED');
