// P10 收尾：旧存档里「引用了被挪走小地点」的东西读档后跟着走。
// 新布局的城、占山的宗门把落在里面的小地点挪到外面（id、名字不变），但存档里有几样东西记的是当时的坐标：
//   · NPC 的打算（plan.to = 小地点 id，plan.x / y = 当时那处小地点的位置）——现在那个坐标落在城里、山体里；
//   · NPC 住处（home = 小地点 id）：常住的人（stay）身在旧位置、去处也是旧位置；
//   · 已接的悬赏（x / y）、残图所指的藏宝处（x / y）落在城墙圈里或宗门山体里。
// 读档后：打算的落点、常住者的去处挪到小地点的新位置一带；悬赏、藏宝处挪到城外 / 山外站得住的陆地上；
// 宗门巡查任务（target = 小地点 id）仍指向这处小地点。
//   TSX_DISABLE_CACHE=1 npx tsx tools/test-moved-refs.ts
import './env';
import assert from 'node:assert/strict';
(globalThis as any).__TAIXU_MOUNTAINS = true;
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;
const W = await import('../src/data/world');
const G = await import('../src/world/game');
const { usesNewCity } = await import('../src/gfx/citySize');
const { grandSectPlan } = await import('../src/data/sectPlan');
const g = await G.createGame(() => {});
g.reset();
const T = g.terrain, WS = W.WORLD_SCALE;
assert.ok(g.save(1));
const old = JSON.parse(store['taixu_save_1']);

const jy = W.LOC_BY_ID.get('jiayuan')!, hf = W.LOC_BY_ID.get('huangfeng')!, hp = grandSectPlan(hf)!;
assert.ok(usesNewCity(jy) && hp, '嘉禾城走新布局、青霞谷占山');
const zoneOf = (l: { id: string }) => T.locZones[W.LOCATIONS.findIndex((q) => q.id === l.id)];
// 城墙圈里、宗门山体里各取一处「旧坐标」
const inCity = { x: jy.x * WS + 1200, y: jy.y * WS - 900 };
const inSect = { x: hf.x * WS + hp.cx, y: hf.y * WS + hp.cy };
assert.ok(T.inLocZone(inCity.x, inCity.y, 0)?.id === 'jiayuan', '旧坐标确实在嘉禾城里');
assert.ok(T.surface.massifAt(inSect.x, inSect.y), '旧坐标确实在青霞谷山体里');
// 被挪出城、挪出山的小地点：取离城、离宗门最近的两处小地点当「原来就在里面」的那处
const minorNear = (l: typeof jy) => W.LOCATIONS.filter((q) => q.minor && q.map === 'tiannan').sort((a, b) => Math.hypot(a.x - l.x, a.y - l.y) - Math.hypot(b.x - l.x, b.y - l.y))[0];
const mc = minorNear(jy), ms = minorNear(hf);
assert.ok(mc && ms, '找得到小地点');

const npcs = old.npcs.filter((n: any) => (n.map ?? 'tiannan') === 'tiannan' && n.alive && !n.canon && !n.ros && !n.gz).slice(0, 4);
assert.equal(npcs.length, 4, '旧存档里有几个普通人物');
// 0、1：打算去挪走的小地点（落点是旧坐标）；2：住在挪走的小地点、常住、身在旧坐标；3：住在挪走的山里小地点
npcs[0].plan = { k: 'trade', to: mc.id, why: '去村里卖货', until: old.day + 30, t0: Math.floor(old.day), x: inCity.x, y: inCity.y }; npcs[0].tx = inCity.x; npcs[0].ty = inCity.y;
npcs[1].plan = { k: 'trade', to: ms.id, why: '去村里卖货', until: old.day + 30, t0: Math.floor(old.day), x: inSect.x, y: inSect.y }; npcs[1].tx = inSect.x; npcs[1].ty = inSect.y;
Object.assign(npcs[2], { home: mc.id, stay: true, x: inCity.x + 40, y: inCity.y, tx: inCity.x + 40, ty: inCity.y, plan: undefined });
Object.assign(npcs[3], { home: ms.id, stay: true, x: inSect.x + 30, y: inSect.y, tx: inSect.x + 30, ty: inSect.y, plan: undefined });
// 悬赏、藏宝处落在城里 / 山体里
old.world.bounties = [{ id: 'b_old1', town: 'jiayuan', map: 'tiannan', name: '旧悬赏妖修', def: (old.world.bounties?.[0]?.def) ?? 'wolf', realm: 1, stage: 3, x: inCity.x, y: inCity.y, reward: 50, until: old.day + 60 },
  { id: 'b_old2', town: 'jiayuan', map: 'tiannan', name: '旧悬赏妖兽', def: 'wolf', realm: 1, stage: 3, x: inSect.x, y: inSect.y, reward: 50, until: old.day + 60 }];
old.world.caches = [{ id: 1, map: 'tiannan', x: inSect.x - 50, y: inSect.y, ox: 0, oy: 0, tier: 1 }];
// 宗门巡查任务指向挪走的小地点
old.world.sect = { id: 'huangfeng', rank: 0, contrib: 0, joined: old.day, lastPay: old.day, done: 0, tasks: [{ id: 't1', kind: 'patrol', text: `巡查「${mc.name}」`, target: mc.id, need: 1, have: 0, reward: 50, exp: 0.03, until: old.day + 90 }] };
store['taixu_save_2'] = JSON.stringify(old);

let threw: unknown = null;
try { assert.ok(g.load('taixu_save_2'), '读档'); } catch (e) { threw = e; }
assert.equal(threw, null, '读旧存档不报错');
const byId = (id: string) => g.npcs.byId.get(id)!;
const near = (x: number, y: number, l: typeof jy, r: number) => Math.hypot(x - l.x * WS, y - l.y * WS) < r;
const reach = (l: typeof jy) => { const z = zoneOf(l); return Math.max(z?.rx ?? 0, z?.ry ?? 0) + 2600; };
const n0 = byId(npcs[0].id), n1 = byId(npcs[1].id), n2 = byId(npcs[2].id), n3 = byId(npcs[3].id);
assert.ok(n0.plan && near(n0.plan.x!, n0.plan.y!, mc, reach(mc)), `打算去「${mc.name}」的落点跟着小地点走（现在离它 ${Math.round(Math.hypot(n0.plan!.x! - mc.x * WS, n0.plan!.y! - mc.y * WS))}）`);
assert.ok(n1.plan && near(n1.plan.x!, n1.plan.y!, ms, reach(ms)), `打算去「${ms.name}」的落点跟着小地点走`);
assert.ok(!T.surface.massifAt(n1.plan!.x!, n1.plan!.y!) || T.surface.massifAt(n1.plan!.x!, n1.plan!.y!)!.weight < 1, '落点不在宗门山体里');
assert.ok(near(n2.tx, n2.ty, mc, reach(mc)), `住在「${mc.name}」的常住者去处跟着住处走`);
assert.ok(near(n3.tx, n3.ty, ms, reach(ms)), `住在「${ms.name}」的常住者去处跟着住处走`);
const stand = (x: number, y: number) => T.walkFactor(x, y) > 0 && T.surface.sample(x, y).walkable;
for (const b of g.ws.bounties) {
  assert.ok(T.inLocZone(b.x, b.y, 0)?.id !== 'jiayuan', `悬赏「${b.name}」挪出了城`);
  assert.ok(!T.surface.massifAt(b.x, b.y) || T.surface.massifAt(b.x, b.y)!.weight < 1, `悬赏「${b.name}」挪出了宗门山体`);
  assert.ok(stand(b.x, b.y), `悬赏「${b.name}」落在站得住的陆地上`);
}
for (const c of g.ws.caches) assert.ok(!T.surface.massifAt(c.x, c.y) && stand(c.x, c.y), '藏宝处挪出了宗门地界，落在陆地上');
const task = g.ws.sect!.tasks[0];
assert.equal(W.LOC_BY_ID.get(task.target)?.id, mc.id, '巡查任务仍指向这处小地点');
// 再存再读：不再挪动
const keep = [n0.plan!.x, n0.plan!.y, g.ws.bounties[0].x, g.ws.bounties[0].y];
assert.ok(g.save(3)); assert.ok(g.load('taixu_save_3'));
const m0 = byId(npcs[0].id);
assert.deepEqual([m0.plan!.x, m0.plan!.y, g.ws.bounties[0].x, g.ws.bounties[0].y], keep, '新存档读回来不再挪');
console.log(`PASS 旧存档里指向挪走小地点的引用跟着走：打算落点（${mc.name}、${ms.name}）、常住者去处、悬赏 ${g.ws.bounties.length} 条、藏宝处挪出城和山体，巡查任务仍指向原小地点`);
process.exit(0);
