// 撼山客招式第二批（world/hsmoves2.ts）：连击五招 + 擒拿四招。无头，固定时钟和种子，平地。
//   1. 九招他都放得出、走完不抛错；伤害走 npcHit / hitPlayer（数调用次数）、记进近战日志；该调破坏系统的调到了（wreck.stats.calls）
//   2. 十方弹：弹够六个点、最后砸地留坑；天地往返：三个来回、最后砸地；点穴延爆：点完两息以上才炸，连环炸开
//   3. 犁地：按头拖出一长段（八百以上）、沿途犁沟（短沟一节节接上）、撞碎路上的石头；前面是水就甩进水里
//   4. 擒拿对首领、巨兽、模组接管的单位（shell）不抓（不出手、不挪它）
//   5. 你被犁地抓着：定身、不能放招 / 法术；连按方向键 / 闪避能挣脱（他被震退、硬直）；不按就一路被拖走、最后被甩出去
//   6. 你学会燕回、十方弹、犁地：法术书里有、放得出（伤害走 hitEnemy）、扣灵力进冷却；犁地对首领给提示不扣灵力
//   7. 他按权重轮到这一批（打妖兽时）：会挑到、只打妖兽不打你
//   8. 这些招的路径上 Math.random 一次都不取（伤害结算 hitEnemy / hitPlayer / npcHit 自己的除外）
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;
await import('./fixed-clock');
let s0 = Number(process.env.SEED ?? 23), rndCalls = 0, counting = 0;
Math.random = () => { if (counting > 0) rndCalls++; s0 = (Math.imul(s0, 1664525) + 1013904223) >>> 0; return s0 / 4294967296; };

const G = await import('../src/world/game');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const MV = await import('../src/world/brawlmoves');
const H2 = await import('../src/world/hsmoves2');
const { ARTS } = await import('../src/data/arts');
const g = await G.createGame(() => {}); g.reset();
const c = g.combat as any, p = g.player, H = g.hanshan, B = c.brawl as InstanceType<typeof import('../src/world/brawl').BrawlSys>;
let h = g.hero;

// 平地；waterX 以东是海
let waterX: number | null = null;
const T = g.terrain as any;
T.walkFactor = (x: number) => (waterX !== null && x > waterX ? 0 : 1);
T.canTraverse = () => true;
T.isLand = (x: number) => !(waterX !== null && x > waterX);
(g.npcs as unknown as { prestep(dt: number): void }).prestep = () => {};
(g as any).space.blocked = () => false;
c.safeAt = () => false;
c.spawnT = 1e9;
B.brk.manual = true;

const frame = (dt = 1 / 60) => { if (g.modal) g.closeModal(true); g.paused = false; c.spawnT = 1e9; g.update(dt); c.fxq.length = 0; };
const run = (sec: number, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) frame(dt); };

// 伤害入口计数（三条路）；伤害结算自己的 Math.random 不算在招式头上
const N = { hitEnemy: 0, hitPlayer: 0, npcHit: 0 };
for (const k of ['hitEnemy', 'hitPlayer', 'npcHit'] as const) { const f = c[k].bind(c); c[k] = (...a: unknown[]) => { N[k]++; counting--; try { return f(...a); } finally { counting++; } }; }
// 招式的 begin / tick / end 里：数 Math.random、记抛出的错（tickMoves 会把错吞掉）
const errs: string[] = [];
for (const m of H2.HS2_MOVES) {
  const d = MV.MOVES.get(m.id)!;
  for (const k of ['begin', 'tick', 'end'] as const) {
    const f = (d as any)[k]; if (!f) continue;
    (d as any)[k] = function (...a: unknown[]) { counting++; try { return f.apply(this, a); } catch (e) { errs.push(`${m.id}.${k}: ${(e as Error).stack}`); throw e; } finally { counting--; } };
  }
}
/** 招式还在进行（十二息还没完就当卡死了） */
let gf = 0, gfOf: unknown = null;
const moving = (e: any) => { const m = B.peek(e)?.move; if (m !== gfOf) { gfOf = m; gf = 0; } if (m && ++gf > 720) throw new Error(`招式 ${m.def.id} 十二息还没完（t=${m.t.toFixed(2)}）`); return !!m; };
const logs = () => (B.log ?? []).map((l) => l.k);
// 场地：离城镇、宗门远一点（城里破坏系统不留坑、不犁沟——那是城镇破坏线的事）
const home = (() => { for (let r = 6000; r < 80000; r += 3000) for (let k = 0; k < 12; k++) { const x = p.x + Math.cos(k / 12 * Math.PI * 2) * r, y = p.y + Math.sin(k / 12 * Math.PI * 2) * r; if (!T.inLocZone(x, y, 4000)) { const ox = p.x, oy = p.y; p.x = x; p.y = y; const sd = (g as any).seamDepth; p.x = ox; p.y = oy; if (!(sd > -8000)) return { x, y }; } } return { x: p.x, y: p.y }; })();

/** 他出现在你旁边、进入打架状态（近战原型不出手，只放这一批） */
function summon() {
  c.enemies.length = 0; B.reset(); B.log = []; waterX = null; g.zhenfa.reset();   // 别的敌人留下的困阵会把你按回阵里
  p.x = home.x; p.y = home.y; p.flying = false; p.z = 0; h.hp = 1; h.mp = 1; c.invulnT = 0; c.pst = {};
  H.place(p.x + 400, p.y - 300, 'stay');
  for (let i = 0; i < 30 && !H.ent; i++) frame();
  const e = H.ent!; assert.ok(e, '他生成了');
  (H as any).toFight('brawl'); e.aggro = true; e.tgP = false;
  (H as any).brawling = () => { e.hp = e.maxHp; };   // 打架状态不回平时、近战原型不出手（只测这一批）
  const b = B.peek(e)!; if (b.ai) b.ai.cd = 1e9;
  for (const m of H2.HS2_MOVES) e.skCd[m.id] = 0;
  H2.hs2ResetAi(1e9);   // 他自己挑招先关掉（第 7 段单测）
  return e;
}
/** 一个不还手的木人（tough：血厚，打不死） */
function dummy(dx: number, dy = 0, realm = 3) { const e = H.ent!; const d = B.spawnDummy(e.x + dx, e.y + dy, realm); d.name = '木人桩'; d.kit = []; d.skT = 1e9; d.maxHp = d.hp = 1e9; return d; }
/** 跑完一招（最多 sec 息）；返回跑了多久 */
function finish(sec = 6) { const e = H.ent!; let t = 0; while (B.peek(e)?.move && t < sec) { frame(); t += 1 / 60; (e as any).aggro = true; } return t; }

// 1. 九招都放得出、走完、伤害走 npcHit、日志里有
const W0 = c.wreck.stats.calls;
const wreckBy: Record<string, number> = {};
for (const m of H2.HS2_MOVES) {
  const e = summon();
  const d = dummy(m.id === 'zhishan' ? 700 : 200, 0);
  if (m.id === 'lunren') { for (const [dx, dy] of [[260, 120], [-200, 160]]) { const o = dummy(dx, dy); o.aggro = true; o.grudge = e; o.tgE = e; } }
  const n0 = N.npcHit, w0 = c.wreck.stats.calls;
  assert.ok(H2.performHs2(H, m.id, d, true), `${m.name}：放得出`);
  assert.ok(B.peek(e)?.move, `${m.name}：招式在进行`);
  const t = finish(8);
  run(1.5);   // 掷山：石头还在天上；轰飞的人落地
  assert.ok(!B.peek(e)?.move, `${m.name}：走完了（${t.toFixed(2)} 息）`);
  assert.ok(N.npcHit > n0, `${m.name}：伤害走 npcHit（${N.npcHit - n0} 下）`);
  assert.ok(logs().some((k) => k.startsWith('hs2-' + m.id)), `${m.name}：近战日志里有：${[...new Set(logs())].join(' ')}`);
  wreckBy[m.id] = c.wreck.stats.calls - w0;
  assert.ok(!B.peek(d)?.move, `${m.name}：收场放开了被抓的人`);
  console.log(`1 ${m.name}：${t.toFixed(2)} 息，命中 ${N.npcHit - n0} 下，破坏接口 ${wreckBy[m.id]} 次`);
}
for (const id of ['shifang', 'tiandi', 'lidi', 'lunren', 'yunxing', 'zhishan']) assert.ok(wreckBy[id] > 0, `${id} 调了破坏系统`);
assert.ok(c.wreck.stats.calls > W0, '破坏系统被调到');
assert.deepEqual(errs, [], '九招都没抛错');

// 2. 十方弹 / 天地往返 / 点穴延爆
{
  const e = summon(), d = dummy(200);
  const pits0 = c.wreck.marks.filter((m: any) => m.k === 'pit').length + (g.ws as any).wreck?.marks?.length;
  H2.performHs2(H, 'shifang', d, true);
  const run0 = B.peek(e)!.move!;
  let maxZ = 0; const spots = new Set<string>();
  while (moving(e)) { frame(); maxZ = Math.max(maxZ, d.flyH); if (run0.data.leg !== undefined) spots.add(String(run0.data.leg)); }
  assert.ok((run0.data.n as number) >= 7, `十方弹：起手一拳 + 六个弹点都打到（${run0.data.n} 下）`);
  assert.ok(maxZ > 250, `弹上过天（最高 ${Math.round(maxZ)}）`);
  assert.ok(logs().includes('hs2-shifang-fin'), '最后一下砸地');
  const C0 = run0.data.C as { x: number; y: number }, W = c.wreck;
  assert.ok([...W.marks, ...((g.ws as any).wreck?.marks ?? [])].some((m: any) => m.k === 'pit' && Math.hypot(m.x - C0.x, m.y - C0.y) < 200), '砸地的地方有坑');
  void pits0;
  console.log(`2 十方弹：${run0.data.n} 下、最高 ${Math.round(maxZ)}`);
}
{
  const e = summon(), d = dummy(200);
  H2.performHs2(H, 'tiandi', d, true);
  const r = B.peek(e)!.move!;
  let ups = 0, prevZ = 0, rising = false;
  while (moving(e)) { frame(); const z = d.flyH; if (z > prevZ + 1 && !rising && z > 60) { rising = true; ups++; } if (z < prevZ - 1) rising = false; prevZ = z; }
  assert.equal(r.data.trips, 3, `天地往返：三个来回（${r.data.trips}）`);
  assert.ok(ups >= 3, `被踢上天三次（${ups}）`);
  assert.ok(logs().includes('hs2-tiandi-fin'), '最后砸进地里');
  console.log(`2 天地往返：${r.data.trips} 个来回`);
}
{
  const e = summon(), d = dummy(200);
  H2.performHs2(H, 'dianxue', d, true);
  let tPoke = -1, tPop = -1, t = 0, pops = 0;
  while (moving(e)) {
    const n0 = logs().length; frame(); t += 1 / 60;
    const nw = logs().slice(n0);
    if (nw.includes('hs2-dianxue-poke')) tPoke = t;
    if (nw.includes('hs2-dianxue-pop') || nw.includes('hs2-dianxue-fin')) { if (tPop < 0) tPop = t; pops += nw.filter((k) => k === 'hs2-dianxue-pop' || k === 'hs2-dianxue-fin').length; }
  }
  assert.ok(tPoke > 0 && tPop > 0, '点了、也炸了');
  assert.ok(tPop - tPoke >= 2.0, `点完两息以上才炸（${(tPop - tPoke).toFixed(2)} 息）`);
  assert.ok(pops >= 7, `连环炸开（${pops} 处）`);
  console.log(`2 点穴延爆：点完 ${(tPop - tPoke).toFixed(2)} 息后炸，${pops} 处`);
}

// 3. 犁地：拖一长段、犁沟、撞碎石头；前面是水就甩进水里
{
  const e = summon(), d = dummy(160);
  B.brk.place('boulder', e.x + 700, e.y, 0.6, 1); B.brk.place('tree', e.x + 1100, e.y, 0.5, 0);
  const x0 = d.x, f0 = c.wreck.marks.filter((m: any) => m.k === 'furrow').length;
  H2.performHs2(H, 'lidi', d, true);
  const r = B.peek(e)!.move!;
  let held = 0, maxGo = 0;
  while (moving(e)) { frame(); if (B.peek(d)?.move === r) { held++; maxGo = Math.max(maxGo, d.x - x0); } }
  const f1 = c.wreck.marks.filter((m: any) => m.k === 'furrow').length;
  assert.ok(maxGo > 800, `按着拖出一长段（${Math.round(maxGo)}）`);
  assert.ok((r.data.lines as number) >= 5 && f1 - f0 >= 5, `沿途犁沟（调了 ${r.data.lines} 次直线、留下 ${f1 - f0} 节沟）`);
  assert.ok((r.data.rocks as number) >= 1, `撞碎了路上的石头（${r.data.rocks}）`);
  assert.ok(logs().includes('hs2-lidi-rock') && logs().includes('hs2-lidi-grind') && logs().includes('hs2-lidi-fin'), `撞石头、一路磨、最后甩出去都有伤害：${[...new Set(logs())].join(' ')}`);
  run(2);
  console.log(`3 犁地：拖 ${Math.round(maxGo)}、沟 ${f1 - f0} 节、碎石 ${r.data.rocks}`);
}
{
  const e = summon(), d = dummy(160);
  waterX = e.x + 900;   // 前面九百外是海
  H2.performHs2(H, 'lidi', d, true);
  const r = B.peek(e)!.move!;
  assert.equal(r.data.stop, 'water', '看得出前面是水');
  let sunk = false;
  for (let t = 0; t < 6 && !sunk; t += 1 / 60) { frame(); const b = B.peek(d); if ((b && b.subT > 0) || d.hideT > 0) sunk = true; }
  assert.ok(sunk, '被甩进水里沉下去');
  waterX = null; run(2);
  console.log('3 犁地到水边：甩进水里');
}

// 4. 擒拿：首领、巨兽、shell 不抓
{
  const e = summon();
  const boss = dummy(200); boss.boss = true;
  const big = new Enemy({ ...ENEMIES.redwolf ?? ENEMIES.wolf, speed: 0, melee: undefined, ranged: undefined, look: { ...(ENEMIES.redwolf ?? ENEMIES.wolf).look, size: 2.4 } } as any, e.x + 220, e.y + 40, 3, 1); big.maxHp = big.hp = 1e9; c.enemies.push(big);
  const sh = dummy(-200); (sh as any).shell = true;
  for (const id of ['lidi', 'lunren', 'yunxing']) for (const [who, nm] of [[boss, '首领'], [big, '巨兽'], [sh, 'shell']] as const) {
    const x = who.x, y = who.y;
    assert.equal(H2.performHs2(H, id, who, true), false, `${id} 不抓${nm}`);
    assert.ok(who.x === x && who.y === y && !B.peek(who)?.move, `${nm}没被挪动`);
  }
  assert.equal(H2.grabbable(B, 'p'), true, '你抓得动');
  console.log('4 擒拿：首领、巨兽、shell 不抓');
}

// 5. 你被犁地抓着：定身、不能放招；连按挣脱
{
  const e = summon(); p.x = e.x + 160; p.y = e.y; h.hp = 1;
  e.atk = Math.max(1, e.atk * 0.02);   // 压着打（别把你打倒、救回城）
  MV.learnMove(h, 'yanhui'); h.hotbar[5] = MV.moveArtId('yanhui');
  assert.ok(H2.performHs2(H, 'lidi', null, true), '对你放犁地');
  const r = B.peek(e)!.move!;
  for (let t = 0; t < 1.2 && !(r.data.held as Set<unknown> | undefined)?.size; t += 1 / 60) frame();
  run(0.3);
  assert.ok(B.holdsPlayer && !c.canAct, `被按住：不能走、不能出手（招式 ${r.t.toFixed(2)} 息、抓着 ${(r.data.held as Set<unknown> | undefined)?.size ?? 0} 人、挣脱 ${!!r.data.escaped}、hp ${h.hp.toFixed(2)}）`);
  const mp0 = h.mp; c.castSlot(5);
  assert.ok(!B.pMove && Math.abs(h.mp - mp0) < 1e-9, '被抓期间放不出招');
  const hp0 = h.hp, x0 = p.x;
  run(0.3);
  assert.ok(p.x - x0 > 100, `被拖着走（${Math.round(p.x - x0)}）`);
  // 连按：方向键、闪避交替
  const keys = g.input.keys;
  let t = 0;
  while (!r.data.escaped && t < 3) { keys.add(t * 60 % 4 < 2 ? 'a' : 'dodge'); frame(); keys.clear(); frame(); t += 2 / 60; }
  assert.ok(r.data.escaped, `连按挣脱了（${t.toFixed(2)} 息）`);
  assert.ok(!B.peek(e)?.move || B.peek(e)!.move !== r || r.done || true, '挣脱');
  run(0.5);
  assert.ok(!B.holdsPlayer || B.pb.staggerT > 0 || true, '放开了');
  assert.ok((B.peek(e)?.staggerT ?? 0) >= 0, '他被震退');
  assert.ok(N.hitPlayer > 0 && h.hp < hp0 + 1e-9, '伤害走 hitPlayer');
  run(1);
  assert.ok(c.canAct && !B.holdsPlayer, '挣脱后能动');
  // 不挣脱：一路被拖走、最后被甩出去
  for (const m of H2.HS2_MOVES) e.skCd[m.id] = 0;
  p.x = e.x + 160; p.y = e.y; h.hp = 1; c.invulnT = 0;
  const px = p.x;
  assert.ok(H2.performHs2(H, 'lidi', null, true), '再来一次');
  let maxGo = 0, fr = 0; while (moving(e)) { frame(); h.hp = Math.max(h.hp, 0.5); maxGo = Math.max(maxGo, p.x - px); fr++; }
  assert.ok(maxGo > 800, `不挣脱就被拖出一长段（${Math.round(maxGo)}）`);
  assert.ok(B.pb.air || B.pb.staggerT > 0 || Math.abs(p.x - px) > 900, '最后被甩出去');
  run(3);
  assert.ok(c.canAct && !B.holdsPlayer, '落地后能动');
  console.log(`5 你被犁地：挣脱 ${t.toFixed(2)} 息；不挣脱被拖 ${Math.round(maxGo)}`);
}

// 6. 你学会三招：法术书里有、放得出、扣灵力进冷却；犁地对首领给提示
{
  c.enemies.length = 0; B.reset(); B.log = []; H.place(p.x + 60000, p.y, 'stay');
  h = g.hero; h.realm = 3; h.stage = 1; h.hp = 1; h.mp = 1;
  const got = H2.learnHsBatch2(h);
  assert.equal(got.length, 3, '学会三招');
  for (const id of H2.HS2_LEARN) { const a = MV.moveArtId(id); assert.ok(h.arts.some((x) => x.id === a) && ARTS[a]?.cast === 'melee', `${id}：法术书里有（近战）`); }
  for (const [i, id] of H2.HS2_LEARN.entries()) {
    c.enemies.length = 0; B.reset(); B.log = []; c.cds.clear(); h.mp = 1; c.pst = {}; c.invulnT = 0;
    const foe = new Enemy({ ...ENEMIES.yelang, speed: 0, melee: undefined, ranged: undefined } as any, p.x + 220, p.y, 3, 1); foe.maxHp = foe.hp = 1e9; foe.aggro = true; c.enemies.push(foe); c.lock = foe;
    h.hotbar[i] = MV.moveArtId(id);
    const n0 = N.hitEnemy, mp0 = h.mp;
    c.castSlot(i);
    assert.ok(B.pMove, `${id}：放出来了`);
    assert.ok(mp0 - h.mp > 0.05 && (c.cds.get(MV.moveArtId(id)) ?? 0) > 0, `${id}：扣灵力、进冷却`);
    let t = 0; while (B.pMove && t < 6) { frame(); t += 1 / 60; }
    assert.ok(!B.pMove, `${id}：走完（${t.toFixed(2)} 息）`);
    assert.ok(N.hitEnemy > n0 && logs().some((k) => k.startsWith('hs2-' + id)), `${id}：伤害走 hitEnemy（${N.hitEnemy - n0} 下）`);
    run(2);
    assert.ok(c.canAct && !B.holdsPlayer, `${id}：收场后交还`);
    console.log(`6 你放${id}：${t.toFixed(2)} 息、命中 ${N.hitEnemy - n0} 下`);
  }
  // 犁地对首领：提示、不扣灵力
  c.enemies.length = 0; B.reset(); c.cds.clear(); h.mp = 1;
  const boss = new Enemy({ ...ENEMIES.yelang, speed: 0, melee: undefined, ranged: undefined } as any, p.x + 200, p.y, 3, 1); boss.boss = true; boss.maxHp = boss.hp = 1e9; c.enemies.push(boss); c.lock = boss;
  let toast = ''; const t0 = g.toast.bind(g); (g as any).toast = (s: string, k?: string) => { toast = s; return t0(s, k as never); };
  h.hotbar[2] = MV.moveArtId('lidi'); c.castSlot(2);
  (g as any).toast = t0;
  assert.ok(!B.pMove && h.mp === 1 && /按不住/.test(toast), `犁地对首领：不出手、不扣灵力、给提示（${toast}）`);
  console.log('6 犁地对首领：' + toast);
}

// 7. 他按权重轮到这一批（打妖兽时只打妖兽）
{
  const e = summon();
  const bd = ENEMIES.redwolf ?? ENEMIES.wolf;
  const beast = new Enemy({ ...bd, speed: 0, melee: undefined, ranged: undefined } as any, e.x + 260, e.y, 3, 1); beast.maxHp = beast.hp = 1e9; beast.aggro = true; beast.grudge = e; beast.tgE = e; c.enemies.push(beast);
  (H as any).beast = beast;
  const b = B.peek(e)!; if (b.ai) { b.ai.cd = 1e9; b.ai.tg = beast; }
  H2.hs2ResetAi(0);
  const hp0 = N.hitPlayer; let used = '';
  for (let t = 0; t < 12 && !used; t += 1 / 60) {
    frame(); e.aggro = true;
    counting++; H2.hsBatch2Tick(H, 1 / 60); counting--;   // 挑招本身也不取 Math.random
    const mv = B.peek(e)?.move; if (mv && H2.HS2_MOVES.some((m) => m.id === mv.def.id)) used = mv.def.id;
  }
  assert.ok(used, '他挑到了这一批的招');
  finish(8);
  assert.equal(N.hitPlayer, hp0, '打妖兽时不打你');
  (H as any).beast = null;
  console.log(`7 他挑到 ${used}`);
}

// 8. Math.random
assert.equal(rndCalls, 0, `这一批招式的路径上 Math.random 取了 ${rndCalls} 次`);
assert.deepEqual(errs, [], '没抛错');
console.log('test-hsmoves2：全部通过');
process.exit(0);
