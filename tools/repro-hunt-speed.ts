// 复现：元婴后期玩家只管跑（不飞），仇家/帮手（元婴初期、中期）是否追得上
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
await import('./env');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { ACTIVE_MAP } = await import('../src/data/world');
const { REALMS } = await import('../src/data/realms');

const terrain = new Terrain(); terrain.build();
const g: any = new Game(terrain); g.reset();
const h = g.hero, p = g.player;
h.realm = 4; h.stage = 3; h.hp = h.maxHp = 1e9; h.mp = 1e9;
p.x = 120000; p.y = 93000;
g.combat.spawnT = 1e9;
g.modal = null; g.modalStack = [];

const d = g.npcs.list.find((x: any) => x.alive && x.realm === 4 && x.stage <= 1 && !x.beauty && !x.canon && !x.bond && !x.stay && !x.sect)
  ?? g.npcs.list.find((x: any) => x.alive && !x.beauty && !x.canon && !x.bond && !x.stay && x.faction !== 'mortal');
if (!d) { console.log('找不到可用的在世 NPC'); process.exit(1); }
d.realm = 4; d.stage = 0; d.sect = undefined; d.title = '散修';
d.map = ACTIVE_MAP; d.home = d.home && g.npcs.byId ? d.home : d.home;
g.npcs.active.delete(d.id);   // 重置时可能已生成实体；清掉后按下面的坐标重新生成
d.x = p.x - 1600; d.y = p.y + 100; d.tx = p.x; d.ty = p.y; d.goal = 'travel'; d.hunting = false;
console.log(`追兵：${d.name} ${REALMS[d.realm].name}${REALMS[d.realm].stages[d.stage]}`);
// 先让其在神识内成为“活跃 NPC”；随后直接进入追杀状态（对应 startHunt 中「已在神识内」的分支）
for (let i = 0; i < 5; i++) { g.modal = null; g.update(1 / 30); }
const a0 = g.npcs.activeOf(d.id);
console.log('活跃:', !!a0);
// 走真实的 startHunt：该仇家已在神识内（活跃实体），应就地掉头追杀，而不是被挪走或原地发呆
g.rel.startHunt(d, true, true, undefined, true);
console.log('追杀开始:', `hunting=${d.hunting}`, `dist=${Math.hypot(d.x - p.x, d.y - p.y).toFixed(0)}`);

g.input.keys.clear(); g.input.keys.add('d'); g.input.keys.add('shift');
let minD = 1e9, caughtAt = -1, convertAt = -1;
for (let i = 0; i < 30 * 40; i++) {
  g.modal = null; g.modalStack = [];
  g.input.keys.add('d'); g.input.keys.add('shift');
  g.hero.hp = g.hero.maxHp; g.combat.invulnT = 5;
  g.update(1 / 30);
  const dist = Math.hypot(d.x - p.x, d.y - p.y);
  minD = Math.min(minD, dist);
  const a = g.npcs.activeOf(d.id);
  if (caughtAt < 0 && dist < 520) caughtAt = i / 30;
  if (convertAt < 0 && a?.enemy) { convertAt = i / 30; break; }
  if (i % 30 === 0) console.log(`t=${(i / 30).toFixed(0)}s 距=${dist.toFixed(0)} 玩家速=${Math.hypot(p.st?.vx ?? 0, p.st?.vy ?? 0).toFixed(0)} 追兵活跃=${!!a} act=${a?.act ?? '-'} 敌=${!!a?.enemy} 战斗=${g.combat.enemies.includes(a?.enemy ?? null)}`);
}
const a = g.npcs.activeOf(d.id);
console.log(`结果：最近距离 ${minD.toFixed(0)}，${caughtAt >= 0 ? `t=${caughtAt.toFixed(1)}s 追至 520 内` : '40 秒内始终追不上'}，转敌时间=${convertAt >= 0 ? convertAt.toFixed(1) + 's' : '未转敌'}，追杀状态=${d.hunting}，在场=${!!a}，入战=${!!a?.enemy && g.combat.enemies.includes(a.enemy)}`);
process.exit(convertAt >= 0 ? 0 : 1);
