import assert from 'node:assert/strict';
import { createCanvas } from './env';
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { Terrain } = await import('../src/world/terrain');
const { Game, DAY_CYCLE } = await import('../src/world/game');
const { Renderer } = await import('../src/world/render');
const { TUNING } = await import('../src/data/tuning');
const { worldWarTier, canFightAsWarSoldier, canLeadWarFormation } = await import('../src/data/worldHierarchy');

let ok = 0;
function check(cond: unknown, label: string) {
  assert(cond, `FAIL: ${label}`);
  ok++;
  console.log('ok  ', label);
}

const terrain = new Terrain(); terrain.build();
const g = new Game(terrain);
const cv: any = createCanvas(1280, 800); cv.clientWidth = 1280; cv.clientHeight = 800; cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 800 });
g.canvas = cv; g.renderer = new Renderer(g, cv); (g as any).paused = false;

// 1. 三界战力阶层
check(worldWarTier('human', 1, 2) === 'logistics', '人界炼气初期作后勤杂役');
check(worldWarTier('human', 1, 7) === 'soldier', '人界炼气后期作炮灰战兵');
check(worldWarTier('human', 2, 0) === 'captain', '人界筑基作百人阵眼');
check(worldWarTier('human', 3, 1) === 'commander', '人界结丹作中军统帅');
check(worldWarTier('human', 4, 0) === 'grand', '人界元婴以上作老祖');

check(worldWarTier('spirit', 2, 2) === 'logistics', '灵界筑基只能当后勤杂役');
check(worldWarTier('spirit', 3, 0) === 'soldier' && canFightAsWarSoldier('spirit', 3, 0), '灵界结丹作前线炮灰战兵');
check(worldWarTier('spirit', 5, 1) === 'captain' && canLeadWarFormation('spirit', 5, 1), '灵界化神作百人阵眼');
check(worldWarTier('spirit', 6, 0) === 'commander', '灵界炼虚合体作统帅');
check(worldWarTier('spirit', 8, 0) === 'grand', '灵界大乘作护宗老祖');

check(worldWarTier('immortal', 7, 2) === 'logistics', '仙界合体及以下皆作杂役');
check(worldWarTier('immortal', 8, 0) === 'soldier', '仙界大乘正是仙界战兵炮灰');
check(worldWarTier('immortal', 9, 0) === 'captain', '仙界真仙作阵眼');

// 2. 中小宗门战力收敛（无元婴老祖，最高结丹，长老含筑基且不超标）
for (const sid of ['gujian', 'baiqiao', 'qianzhu', 'xuesha', 'dusheng']) {
  const elders = g.roster.members(sid).filter((m) => m.rank === '长老');
  const maxR = Math.max(...g.roster.members(sid).map((m) => m.realm));
  const zhuji = elders.filter((m) => m.realm === 2).length;
  check(maxR <= 3 && zhuji >= 1 && zhuji >= Math.floor(elders.length / 3), `中小宗门 ${sid} 最高结丹(${maxR}) 且长老含筑基分层(${zhuji}/${elders.length})`);
}

// 3. 战备后勤账本 & 幂等迁移 & 丹药加速伤员恢复
g.sectwar.migrateWarState();
const sp0 = g.sectwar.supplyOf('huangfeng');
const pills0 = sp0.pills;
g.sectwar.migrateWarState();
check(g.sectwar.supplyOf('huangfeng').pills === pills0, 'migrateWarState 幂等不重复叠加');

const ot = g.roster.poolState('huangfeng')!.outer;
ot.j = 100; ot.a = Math.max(0, ot.c - 100);
g.sectwar.supplyOf('huangfeng').pills = 100;
g.roster.daily(10);
const healedWithPills = 100 - ot.j;
ot.j = 100; ot.a = Math.max(0, ot.c - 100);
g.sectwar.supplyOf('huangfeng').pills = 0;
g.roster.daily(10);
const healedWithoutPills = 100 - ot.j;
check(healedWithPills > healedWithoutPills * 2, `战备疗伤丹显著加快伤兵恢复（有丹 ${healedWithPills} vs 断丹 ${healedWithoutPills}）`);

// 4. 时间昼夜大一统 + 打坐防频闪 + 可中断闭关
check(Math.abs(TUNING.daysPerSec - 1 / 240) < 1e-9 && TUNING.meditateSpeed === 120 && DAY_CYCLE === 240, '昼夜 4 分钟/日 & 打坐 2 秒/日（120×）');
g.clock = DAY_CYCLE * 0.5;
check(g.night === 0 && g.timeName() === '午时', 'dayPhase=0.5 为正午午时且 night=0');
g.clock = 0;
check(g.night === 1 && g.timeName() === '子时', 'dayPhase=0 为子夜子时且 night=1');

const c0 = g.clock;
g.toggleSit();
const ph0 = g.dayPhase;
for (let i = 0; i < 60; i++) g.update(0.1);
const ph1 = g.dayPhase;
check(Math.abs(ph1 - ph0) < 0.05, `打坐 6s（过 3 游戏日）天色稳住不频闪（Δphase=${(ph1 - ph0).toFixed(4)}）`);
g.stand();
check(g.clock !== c0, '起身时同步真实时间推进昼夜时钟');

// 短闭关绕过 medStale，长闭关遇紧急召集玉符弹窗中断
g.hero.realm = 2; g.hero.stage = 0; (g.hero as any).medStale = 9999;
const rShort = g.seclude(7);
check(rShort.days === 7, '90 日内短闭关不受 medStale 阻断');
(g.hero as any).medStale = 0;
g.ws.sect = { id: 'yanyue', rank: 1, contrib: 100, joined: g.day, lastPay: g.day, tasks: [], done: 0, v8: true };
const wTest = g.sectwar.declare('hehuan', 'yanyue', '测试中断');
(g.war as any).inbox.length = 0;
const origDaily = g.sectwar.daily.bind(g.sectwar);
let injected = false;
g.sectwar.daily = (d: number) => {
  origDaily(d);
  if (!injected) {
    injected = true;
    g.war.send({ kind: '召集', from: '凝霜宗执法堂', text: '敌军兵临城下，速归！', sw: wTest.id, until: g.day + 10 });
  }
};
const rInt = g.seclude(30);
check(!!rInt.interrupted && rInt.days < 30 && rInt.interrupted.remainDays > 0, `闭关途中突发召集玉符正确中断并给出余下天数（已闭 ${rInt.days} / 余 ${rInt.interrupted?.remainDays}）`);
g.towns.leave();
check(g.ws.sect === null && g.war.pending.every((j) => j.sw !== wTest.id), '退宗后同步注销旧宗未履行的征召军令');

console.log(`\nv0.73 Phase 1 专项验收全部通过（${ok} 项）`);
