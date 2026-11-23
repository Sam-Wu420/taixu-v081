import './env';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { Game } from '../src/world/game';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (key: string) => store[key] ?? null, setItem: (key: string, value: string) => { store[key] = value; }, removeItem: (key: string) => { delete store[key]; } };
const { Terrain } = await import('../src/world/terrain');
const { Game: GameClass } = await import('../src/world/game');
const { mulberry32 } = await import('../src/core/rng');
const { ACTIVE_MAP } = await import('../src/data/world');
const terrain = new Terrain(); terrain.build();
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function fixture() {
  const game = new GameClass(terrain);
  game.day = 61; game.hero.realm = 1;
  const free = game.npcs.list.filter(n => (n.map ?? 'tiannan') === ACTIVE_MAP && game.living.free(n));
  const trader = free[0], victim = free[1], kin = free[2];
  assert(trader && victim && kin);
  trader.bag = { herb_huangjing: 3 }; trader.goal = 'stay';
  trader.plan = { k: 'trade', to: 'qingniu', why: '交易', until: 0 };
  game.ws.stolenBags = [{ id: 1, culpritId: trader.id, culpritName: trader.name, day: 59, map: ACTIVE_MAP, stones: 30, items: [{ id: 'herb_huangjing', n: 3 }] }];
  victim.age = victim.life - 0.001; victim.goal = 'stay';
  victim.ties = [{ id: kin.id, k: 'kin', r: '子' }];
  kin.ties = [{ id: victim.id, k: 'kin', r: '父' }];
  return { game, trader, victim, kin };
}

const synchronous = fixture(), sliced = fixture();
synchronous.game.npcs.daily(1, mulberry32(42));
const jobs = sliced.game.npcs['dayJobs'];
jobs.enqueue(1, 61, 42);
let slices = 0;
while (jobs.pending) { Math.random(); Math.random(); jobs.pump(0); slices++; }
assert.equal(hash(sliced.game.npcs.list), hash(synchronous.game.npcs.list), '分帧与同步结算的真实 NPC 状态不一致');
assert.equal(hash(sliced.game.ws.flags.live), hash(synchronous.game.ws.flags.live), '分帧与同步的活世界结果不一致');
assert.deepEqual(sliced.game.ws.stolenBags, synchronous.game.ws.stolenBags);
assert.deepEqual(sliced.game.ws.news, synchronous.game.ws.news);
assert(!sliced.victim.alive && !synchronous.victim.alive);
assert(sliced.kin.grief && synchronous.kin.grief, '亲人自然死亡应产生守丧');
assert(sliced.game.ws.stolenBags?.[0].soldItems?.length, '夺袋赃物交易须经过真实交易结算');

function datedFixture() {
  const f = fixture();
  f.victim.met = true; f.victim.favor = 50; f.victim.bond = 'companion';
  const free = f.game.npcs.list.filter(n => (n.map ?? 'tiannan') === ACTIVE_MAP && f.game.living.free(n));
  const requester = free[3], foe = free[4]; assert(requester && foe);
  requester.met = true; requester.favor = 50; requester.age = foe.age = 20; requester.life = foe.life = 1000;
  f.game.living.S.pend.push({ from: requester.id, foe: foe.id, why: '旧怨', items: [], stones: 5, at: '山道', day: 59, kind: 'rob' });
  return f;
}
const datedSync = datedFixture(), datedSliced = datedFixture();
datedSync.game.npcs.daily(1, mulberry32(42));
datedSliced.game.npcs['dayJobs'].enqueue(1, 61, 42);
datedSliced.game.day = 62.5;
datedSliced.game.npcs['dayJobs'].flush();
const synchronousDeath = datedSync.game.ws.news.find(item => item.text.includes(datedSync.victim.name));
const delayedDeath = datedSliced.game.ws.news.find(item => item.text.includes(datedSliced.victim.name));
assert(synchronousDeath && delayedDeath, '真实日结须产生已认识 NPC 的死亡消息');
assert.equal(delayedDeath.day, synchronousDeath.day, '日结延迟到下一天时死亡消息应保留任务日期');
assert.deepEqual(datedSliced.game.ws.news, datedSync.game.ws.news, '分帧日结期间生成的传闻应与同步日期一致');
assert.deepEqual(datedSliced.game.rel.S.log, datedSync.game.rel.S.log, '同伴死亡的人脉记录应保留任务日期');
const synchronousJade = datedSync.game.war.inbox.find(item => item.kind === '求助');
const delayedJade = datedSliced.game.war.inbox.find(item => item.kind === '求助');
assert(synchronousJade && delayedJade, '真实日结须发送求助玉符');
assert.equal(delayedJade.day, synchronousJade.day, '求助玉符应保留任务日期');
assert.equal(delayedJade.text, synchronousJade.text, '求助文案应按任务日期计算');

function feudFixture() {
  const game = new GameClass(terrain); game.day = 61;
  const people = game.npcs.list.filter(n => (n.map ?? 'tiannan') === ACTIVE_MAP && game.living.free(n));
  const killer = people[0], victim = people[1], kin = people[2]; assert(killer && victim && kin);
  killer.realm = 4; killer.stage = 2; killer.age = 50; killer.life = 1000; killer.goal = 'stay';
  victim.realm = 1; victim.stage = 0; victim.age = 20; victim.life = 1000; victim.goal = 'stay';
  kin.age = 20; kin.life = 1000; kin.met = true; kin.favor = 50;
  killer.hate = [{ id: victim.id, v: 95, why: '血仇', day: 59, blood: true }];
  killer.plan = { k: 'revenge', who: victim.id, why: '血仇', until: 0 };
  victim.ties = [{ id: kin.id, k: 'kin', r: '子' }]; kin.ties = [{ id: victim.id, k: 'kin', r: '父' }];
  return { game, victim, kin };
}
const feudSync = feudFixture(), feudSliced = feudFixture();
feudSync.game.npcs.daily(1, mulberry32(42));
feudSliced.game.npcs['dayJobs'].enqueue(1, 61, 42);
feudSliced.game.day = 62.5; feudSliced.game.npcs['dayJobs'].flush();
assert(!feudSync.victim.alive && !feudSliced.victim.alive, '应实际发生 NPC 寻仇');
const feudRecord = feudSync.game.rel.S.log.find(item => item.text.includes(feudSync.kin.name));
assert(feudRecord, 'NPC 仇杀应写入相识亲属的人脉记录');
assert.deepEqual(feudSliced.game.rel.S.log, feudSync.game.rel.S.log, 'NPC 仇杀的人脉记录应保留任务日期');

function canonical(game: Game) {
  const npc = game.npcs.list.find(n => n.canon && n.alive && n.age + 1 < n.life);
  assert(npc);
  return npc;
}
const updated = new GameClass(terrain), n = canonical(updated), age = n.age;
updated.day = 61;
updated.npcs.update(1 / 60);
while (updated.npcs['dayJobs'].pending) updated.npcs['dayJobs'].pump(2);
assert(Math.abs(n.age - age - 1 / 360) < 1e-10, '正常跨日应结算一次');
updated.npcs.update(1 / 60);
assert(Math.abs(n.age - age - 1 / 360) < 1e-10, '同一日期不得重复结算');

const saving = new GameClass(terrain), saveNpc = canonical(saving), saveAge = saveNpc.age;
saving.npcs['dayJobs'].enqueue(1, saving.day, 17);
saving.npcs['dayJobs'].pump(0);
assert(saving.npcs.pendingDays);
assert(saving.save(1));
assert(!saving.npcs.pendingDays);
assert(Math.abs(saveNpc.age - saveAge - 1 / 360) < 1e-10);
const saved = JSON.parse(store.taixu_save_1);
assert.equal(saved.v, 3);
assert.equal(saved.npcs.find((value: { id: string }) => value.id === saveNpc.id).age, +saveNpc.age.toFixed(2));
const loaded = new GameClass(terrain);
assert(loaded.load('taixu_save_1'));
assert(!loaded.npcs.pendingDays);
assert.equal(loaded.npcs.byId.get(saveNpc.id)?.age, +saveNpc.age.toFixed(2));
loaded.npcs['dayJobs'].enqueue(1, loaded.day, 20);
loaded.npcs['dayJobs'].pump(0);
assert(loaded.load('taixu_save_1'));
assert(!loaded.npcs.pendingDays, '读档应丢弃旧世界未完成的日结');
assert.equal(loaded.npcs.byId.get(saveNpc.id)?.age, +saveNpc.age.toFixed(2));
loaded.npcs['dayJobs'].enqueue(1, loaded.day, 21);
loaded.reset();
assert(!loaded.npcs.pendingDays, '新局不得继承旧世界未完成的日结');

const travel = new GameClass(terrain), traveler = canonical(travel), travelAge = traveler.age;
travel.onTravel = () => {};
travel.travel.go('dajin', 10000, 10000, 2, 'portal');
assert(Math.abs(traveler.age - travelAge - 2 / 360) < 1e-10, '跨图日结应同步完成');
assert(!travel.npcs.pendingDays);
travel.npcs.update(1 / 60);
assert(Math.abs(traveler.age - travelAge - 2 / 360) < 1e-10, '跨图后不得重复结算');

const edgeTravel = new GameClass(terrain), edgeNpc = canonical(edgeTravel), edgeAge = edgeNpc.age;
edgeTravel.day = 61.02;
let arrived = false;
edgeTravel.onTravel = (map, via) => { arrived = map === 'dajin' && via === 'edge'; };
edgeTravel.travel.crossEdge('dajin', 2);
assert(arrived, '应经过真实边境入口');
assert(Math.abs(edgeNpc.age - edgeAge - 3 / 360) < 1e-10, '边境旅行前未入队的上一日与旅行两日均需结算');
assert(!edgeTravel.npcs.pendingDays, '边境存档前须完成日结');
edgeTravel.npcs.update(1 / 60);
assert(Math.abs(edgeNpc.age - edgeAge - 3 / 360) < 1e-10, '边境旅行后不得重复结算');

const rest = new GameClass(terrain), restingNpc = canonical(rest), restAge = restingNpc.age;
rest.npcs['dayJobs'].enqueue(1, rest.day, 17);
const report = rest.seclude(30);
assert(!rest.npcs.pendingDays, '出关与保存前须结算完毕');
assert(Math.abs(restingNpc.age - restAge - (1 + Math.floor(rest.day) - 60) / 360) < 1e-10);
assert(report.days > 0);

const automatic = new GameClass(terrain);
automatic.running = true;
delete store.taixu_save_auto;
automatic.npcs['dayJobs'].enqueue(1, automatic.day, 99);
automatic.npcs['dayJobs'].pump(0);
automatic['autoSaveIdle']();
await new Promise(resolve => setTimeout(resolve, 40));
assert(!store.taixu_save_auto, '自动存档应等待分帧日结结束');
automatic.npcs['dayJobs'].flush();
await new Promise(resolve => setTimeout(resolve, 60));
assert(store.taixu_save_auto, '日结结束后应完成自动存档');
automatic.running = false;

const cold = new GameClass(terrain); cold.day = 61;
let begin = performance.now(); cold.npcs.daily(1, mulberry32(11)); const coldMs = performance.now() - begin;
const warm = new GameClass(terrain); warm.living.ensureAll(); warm.day = 61;
begin = performance.now(); warm.npcs.daily(1, mulberry32(11)); const warmMs = performance.now() - begin;
const batched = new GameClass(terrain); batched.living.ensureAll(); batched.day = 61;
batched.npcs['dayJobs'].enqueue(1, 61, 11);
const durations: number[] = [];
while (batched.npcs['dayJobs'].pending) { begin = performance.now(); batched.npcs['dayJobs'].pump(2); durations.push(performance.now() - begin); }
durations.sort((a, b) => a - b);
console.log(JSON.stringify({ population: cold.npcs.list.length, syncWithoutBagPrewarmMs: +coldMs.toFixed(2), syncBagPrewarmedMs: +warmMs.toFixed(2), batchCount: durations.length, batchP95Ms: +durations[Math.floor((durations.length - 1) * 0.95)].toFixed(2), batchMaxMs: +durations[durations.length - 1].toFixed(2), rngIsolationSlices: slices, seclusionDays: report.days }));
console.log('npc day integration tests passed');
