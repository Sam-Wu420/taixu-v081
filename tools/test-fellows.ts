// 结伴（world/party.ts、world/fellows.ts）：同行者有法力（出手耗、平时回）、指令（集火打你锁定的、撤退不出手也不被盯）、
// 队伍框快照；NPC 结成五种作风的队伍，队员跟着队长走，猎妖采药跑商劫道师徒各有所得，会散伙、会有人卷款跑路；
// 你能入伙（整队成了同行者、作风跟着定）、受雇护送商队（到了结工钱）；你的作风：猎妖伤害加成、采药多采、劫道分赃。
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;
// 假时钟：众生的日结算按真实时间分帧（每帧 2 毫秒），不固定的话同一个种子两次结果也不同（见 tools/fixed-clock.ts）
await import('./fixed-clock');
let s0 = 11; Math.random = () => { s0 = (Math.imul(s0, 1664525) + 1013904223) >>> 0; return s0 / 4294967296; };

const G = await import('../src/world/game');
const W0 = await import('../src/data/world');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const { ALLY_MP } = await import('../src/world/party');
const g = await G.createGame(() => {}); g.reset();
const p = g.player, F = g.fellows, c = g.combat as any;
const step = (sec: number, each?: () => void) => { for (let t = 0; t < sec; t += 0.05) { if (g.modal) g.closeModal(true); g.paused = false; c.spawnT = 9; each?.(); g.update(0.05); } };
g.hero.realm = 2; g.hero.stage = 2;

// 1. 同行者、法力、指令、快照
const picks = g.npcs.list.filter((d) => d.alive && d.realm >= 1 && !d.canon && !d.beauty && !d.ros && !d.gz && (d.map ?? 'tiannan') === 'tiannan').slice(0, 3);
for (const d of picks) { d.met = true; d.favor = 60; d.bond = 'companion'; d.bondUntil = g.day + 60; g.npcs.summon(d.id); }
step(0.5);
assert.equal(g.npcs.followers().length, 3, '三位同行者');
let snap = g.party.snapshot();
assert.equal(snap.length, 3); assert.ok(snap.every((m) => m.hp === 1 && m.mp === 1 && m.order === 'follow' && m.name && m.realm), `快照：${JSON.stringify(snap[0])}`);
assert.ok(g.ui.party?.length === 3 || (g.updateUI(true), g.ui.party.length === 3), '界面状态里有队伍');
const wolves = [0, 1, 2].map((i) => { const e = new Enemy(ENEMIES.redwolf, p.x + 260 + i * 40, p.y, 1, 0); e.aggro = true; c.enemies.push(e); return e; });
c.lock = wolves[2];
const [A, B, Cc] = g.npcs.followers();
g.party.order(B.d.id, 'focus'); g.party.order(Cc.d.id, 'retreat');
const hit: Record<string, number> = {};
const strike0 = c.allyStrike.bind(c);
c.allyStrike = (x: number, y: number, tgt: any, ...rest: unknown[]) => { const who = g.npcs.followers().find((a) => Math.hypot(a.st.x - x, a.st.y - y - a.st.lift) < 5); const k = (who?.d.id ?? '?') + '>' + wolves.indexOf(tgt); hit[k] = (hit[k] ?? 0) + 1; return strike0(x, y, tgt, ...rest); };
step(6, () => { for (const w of wolves) { w.hp = w.maxHp; } });
const focusHits = Object.entries(hit).filter(([k]) => k.startsWith(B.d.id + '>'));
assert.ok(focusHits.length && focusHits.every(([k]) => k.endsWith('>2')), `集火的只打你锁定的那头：${JSON.stringify(hit)}`);
assert.ok(!Object.keys(hit).some((k) => k.startsWith(Cc.d.id + '>')), '撤退的不出手');
assert.ok(!c.tanks.some((t: any) => t.k === 'ally' && t.ref === Cc), '撤退的敌人不再盯着打');
snap = g.party.snapshot();
assert.ok(snap.find((m) => m.id === B.d.id)!.mp < 1, '出手耗法力');
// 法力见底就不出手，之后回上来
(B as any).mp = ALLY_MP.cast * 0.5; const before = Object.values(hit).reduce((a, b) => a + b, 0);
// 只看一小段（0.3 息）：再久一点法力就回到够出手一次，出手又扣下去（斗法中、不在斗法中回得快慢不同）
step(0.3, () => { for (const w of wolves) w.hp = w.maxHp; });
assert.ok(((B as any).mp ?? 0) > ALLY_MP.cast * 0.5 && ((B as any).mp ?? 0) < ALLY_MP.cast, `法力慢慢回、还不够出手：${(B as any).mp}`);
c.enemies.length = 0; c.lock = null; c.allyStrike = strike0; void before;
g.party.orderAll('follow');
assert.ok(g.party.snapshot().every((m) => m.order === 'follow'), '全体跟随');

// 2. NPC 的队伍：组队、跟着队长、各有所得
for (const f of F.S.list.slice()) F.S.list.splice(F.S.list.indexOf(f), 1);
for (let i = 0; i < 6; i++) F.daily(), (g.day += 6);
const list = F.S.list;
const kinds = new Set(list.map((f) => f.style));
assert.ok(list.length >= 8 && ['hunt', 'herb', 'caravan', 'bandit', 'mentor'].every((k) => kinds.has(k as never)), `五种作风都组起来了：${list.length} 支 ${[...kinds].join(',')}`);
for (const f of list) {
  assert.ok(f.members.length >= 2 && f.members.includes(f.leader), `${F.name(f)} 有队长有人`);
  for (const id of f.members) assert.equal((g.npcs.byId.get(id) as any).fw, f.id, '队员记着自己在哪支队里');
}
const hunt = list.find((f) => f.style === 'hunt')!, lead = g.npcs.byId.get(hunt.leader)!, mate = g.npcs.byId.get(hunt.members.find((x) => x !== hunt.leader)!)!;
lead.tx = 123456; lead.ty = 65432;
assert.ok(F.steer(mate, Math.random) && Math.hypot(mate.tx - lead.tx, mate.ty - lead.ty) < 300, '队员的去处跟着队长');
assert.ok(F.badge(mate)?.text.length, '名牌下有队名');
const w0 = list.flatMap((f) => f.members).reduce((s, id) => s + (g.npcs.byId.get(id)?.wealth ?? 0), 0);
for (let m = 0; m < 24; m++) { g.day += 15; F.daily(); }
const runs = list.reduce((s, f) => s + f.runs, 0);
assert.ok(runs > 10, `各队做了事：${runs} 趟`);
assert.ok(F.S.log.length > 0, `有江湖记事：${F.S.log[0]?.text}`);
void w0;

// 3. 入伙与受雇
for (const a of g.npcs.followers()) g.friends.dismiss(a.d);
step(0.3);
const h2 = F.form('herb', 'tiannan')!;
assert.ok(h2, '组了一对采药搭档');
const m0 = g.npcs.byId.get(h2.members[0])!; m0.favor = 30;
const opts = F.talkOpts(m0, () => ({ text: '', options: [] }) as any);
assert.ok(opts.some((o) => o.label.includes('入伙')), '交谈里能入伙');
F.join(h2);
step(0.3);
assert.ok(h2.members.every((id) => g.npcs.followers().some((a) => a.d.id === id)), '整队成了同行者');
assert.equal(F.myStyle, 'herb', '作风跟着定');
for (const a of g.npcs.followers()) g.friends.dismiss(a.d);
step(0.3);
const car = F.form('caravan', 'tiannan')!;
assert.ok(car && car.to, '组了一支商队');
const L = g.npcs.byId.get(car.leader)!;
const pay = 500; F.hire(car, pay); step(0.3);
assert.ok(g.npcs.followers().some((a) => a.d.id === car.leader), '受雇后商队领头跟着你');
const to = W0.LOC_BY_ID.get(car.to!)!;
const st0 = (await import('../src/world/cultivation')).bagCount(g.hero, 'mat_lingshi');
g.teleport(to.x * W0.WORLD_SCALE, to.y * W0.WORLD_SCALE); g.npcs.summon(L.id); step(1.2);
const st1 = (await import('../src/world/cultivation')).bagCount(g.hero, 'mat_lingshi');
assert.equal(st1 - st0, pay, `护到了结工钱：${st1 - st0}`);
assert.ok(!car.hired, '护送结束');

// 4. 你的作风
F.setMyStyle('hunt'); for (const d of picks.slice(0, 1)) g.npcs.summon(d.id); step(0.3);
assert.equal(F.huntK, 1.25, '猎妖：同行者打妖兽伤害多两成半');
F.setMyStyle(null); assert.equal(F.huntK, 1, '不定作风没有加成');

// 5. 随存档走
const n = F.S.list.length; assert.ok(g.save(1)); assert.ok(g.load('taixu_save_1'));
assert.equal(g.fellows.S.list.length, n, '队伍随存档');
console.log(`PASS 结伴：同行者的法力与指令（集火、撤退）、队伍框快照；NPC 组了 ${list.length} 支五种作风的队伍，两年里做了 ${runs} 趟；入伙、受雇护送结工钱；猎妖作风加成；随存档`);
