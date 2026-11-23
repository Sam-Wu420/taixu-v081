// r8-p2 撼山客第二阶段（world/hsp2.ts）：赤阳罡、五招火焰腿法、两个觉醒大招、玩家学的三样。无头，固定时钟和种子。
//   1. 新招（他打木人桩）：七招都放得出、走完不抛错、收得了场；伤害走 npcHit；立体特效报了；觉醒大招整屏压黑 / 变色 / 大字，收场后干净恢复
//   2. 赤阳罡的触发：切磋里他气血掉到一半 → 放解放（演出）→ 进燃身；撑过 25 息后他喝完一口酒也会触发；燃身时连招表换成第二阶段的招
//   3. 觉醒大招只在第二阶段出、和无极一击 / 一拳破界合用「两分钟两次」的名额
//   4. 切磋里逼出第二阶段、收场后多教三样（赤焰回旋腿、炎阳炮拳、赤阳罡）；玩家学会能放（伤害走 hitEnemy），赤阳罡开燃身、耗灵力
//   5. 姿势：关键帧表能插值、卡帧（每段前四成切到下一个姿势）
//   6. 招式路径上 Math.random 一次都不取
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;
await import('./fixed-clock');
let s0 = 29; const seeded = () => { s0 = (Math.imul(s0, 1664525) + 1013904223) >>> 0; return s0 / 4294967296; };
Math.random = seeded;

const G = await import('../src/world/game');
const M3 = await import('../src/world/hsmoves3');
const P2 = await import('../src/world/hsp2');
const FX = await import('../src/world/fx3d');
const CH = await import('../src/gfx/character');
const { moveArtId } = await import('../src/world/brawlmoves');
const { ARTS } = await import('../src/data/arts');
const g = await G.createGame(() => {}); g.reset();
const H = g.hanshan, c = g.combat as any, p = g.player, B = g.combat.brawl;
const S3 = M3.hs3Of(g), S = P2.hsp2Of(g);
let h = g.hero;
c.spawnT = 1e9;
const closeAll = () => { for (let i = 0; i < 6 && g.modal; i++) g.closeModal(true); };
const step = (sec: number, each?: () => void, dt = 1 / 40) => { for (let t = 0; t < sec - 1e-9; t += dt) { g.paused = false; closeAll(); c.spawnT = 1e9; each?.(); g.update(dt); c.fxq.length = 0; } };
const until = (cond: () => boolean, max = 20, each?: () => void) => { for (let t = 0; t < max && !cond(); t += 0.05) step(0.05, each); return cond(); };

// ---- 伤害数钩子
const n = { he: 0, hp: 0, nh: 0 };
for (const [k, key] of [['hitEnemy', 'he'], ['hitPlayer', 'hp'], ['npcHit', 'nh']] as const) { const f = c[k].bind(c); c[k] = (...a: any[]) => { n[key]++; return f(...a); }; }
// ---- Math.random：招式代码（begin / tick / end / can）和第二阶段每帧那一份里一次都不取（伤害结算本身不算）
let inMove = 0, rnd2 = 0;
const R0 = Math.random; Math.random = () => { if (inMove > 0) rnd2++; return R0(); };
for (const m of Object.values(P2.MOVES_P2)) for (const k of ['begin', 'tick', 'end', 'can'] as const) { const f = (m as any)[k]; if (f) (m as any)[k] = (...a: any[]) => { inMove++; try { return f.apply(m, a); } finally { inMove--; } }; }
for (const k of ['hitEnemy', 'hitPlayer', 'npcHit']) { const f = c[k]; c[k] = (...a: any[]) => { const s = inMove; inMove = 0; try { return f(...a); } finally { inMove = s; } }; }
{ const f = S.tick.bind(S); S.tick = (dt: number) => { inMove++; try { return f(dt); } finally { inMove--; } }; }

// ---- 场地：开阔平地
const T = g.terrain;
const openField = (from: { x: number; y: number }, R0 = 0) => {
  const okF = (cx: number, cy: number) => {
    if (T.inLocZone(cx, cy, 2600) || !H.okAt(cx, cy, 1500)) return false;
    for (let i = -4; i <= 4; i++) for (let j = -3; j <= 3; j++) { const x = cx + i * 400, y = cy + j * 300; if (T.walkFactor(x, y) <= 0 || !T.isLand(x, y) || (g as any).space.blocked(x, y) || c.safeAt(x, y)) return false; if (!T.canTraverse(cx, cy, x, y)) return false; }
    return true;
  };
  for (let r = R0; r <= R0 + 60000; r += 800) { const k = Math.max(1, Math.round(r / 500)); for (let i = 0; i < k; i++) { const a = i / k * Math.PI * 2, x = from.x + Math.cos(a) * r, y = from.y + Math.sin(a) * r; if (okF(x, y)) return { x, y }; } }
  throw new Error('找不到开阔地');
};
const stage = (x: number, y: number, realm: number) => {
  B.reset(); S3.reset(); S.reset(); c.enemies.length = 0;
  h = g.hero; h.realm = realm; h.stage = 1; h.hp = 1; h.mp = 1;
  g.teleport(x - 260, y + 260); p.flying = false; p.z = 0; p.zTarget = 0;
  const s = H.s; s.angryUntil = undefined; s.lastSpar = undefined;
  H.place(x, y, 'stay');
  step(0.3);
  assert.ok(H.ent, '他生成了');
  return H.ent!;
};
const dummy = (x: number, y: number) => { const e = B.spawnDummy(x, y, g.hero.realm); e.maxHp = e.hp = e.maxHp * 50; return e; };
const runOf = () => B.runs.find((r: any) => r.user === H.ent);
const field = openField(p, 2000);

// ================================================================ 1. 七招都放得出、走完、伤害走 npcHit、立体特效报了
{
  const e0 = stage(field.x, field.y, 3);
  H.autoMoves = false;
  const rows: string[] = [];
  for (const [id, dist] of [['p2xuan', 230], ['p2yan', 430], ['p2sui', 330], ['p2zhui', 280], ['p2pao', 460], ['p2bahuang', 380], ['p2zhuri', 280]] as const) {
    B.reset(); c.enemies = c.enemies.filter((x: any) => x === e0);
    e0.x = field.x; e0.y = field.y; e0.flyH = 0; e0.lift = 0; if (e0.cs) { e0.cs.x = e0.x; e0.cs.y = e0.y; }
    const d = dummy(e0.x + dist, e0.y + 20);
    S.force = true; S.ignite(); S3.big = [];
    const hp0 = d.hp, nh0 = n.nh, ev0 = FX.fx3dOf(g).stats.ev, ui0 = S.ui.length;
    assert.ok(H.perform(id, d), `${id} 出手`);
    assert.ok(runOf()?.def.id === id, `${id} 在出招`);
    let maxBlack = 0, maxWash = 0, maxDim = 0;
    const done = until(() => !runOf(), 12, () => { maxBlack = Math.max(maxBlack, S.vis.black); maxWash = Math.max(maxWash, S.vis.wash[3]); maxDim = Math.max(maxDim, S.vis.dim); });
    assert.ok(done, `${id} 走完收场`);
    assert.ok(n.nh > nh0 && d.hp < hp0, `${id} 伤害走 npcHit：${n.nh - nh0} 下`);
    assert.ok(FX.fx3dOf(g).stats.ev > ev0 + 5, `${id} 立体特效报了`);
    if (id === 'p2bahuang') { assert.ok(maxWash > 0.5 && S.ui.slice(ui0).some((u) => u.word === '爆') && S.ui.slice(ui0).some((u) => u.word === '碎') && S.ui.slice(ui0).some((u) => u.k === 'beam'), '霸皇蹴：整屏变红、「爆」「碎」砸屏、横贯光线'); }
    if (id === 'p2zhuri') assert.ok(maxBlack > 0.8 && maxWash > 0.5 && S.ui.slice(ui0).some((u) => u.k === 'lines'), '逐日：整屏压黑、一下一个颜色、速度线');
    step(1.2);
    assert.ok(S.vis.black < 0.01 && S.vis.wash[3] < 0.01 && S.vis.dim < 0.01, `${id} 收场后画面干净恢复`);
    rows.push(`${id} ${n.nh - nh0} 下 · 压黑 ${maxBlack.toFixed(2)} 变色 ${maxWash.toFixed(2)} 压暗 ${maxDim.toFixed(2)}`);
  }
  S.force = false;
  console.log('1 七招都放得出、走完：\n   ' + rows.join('\n   '));
}

// ================================================================ 2. 赤阳罡的触发、编排切换
{
  const e0 = stage(field.x, field.y, 3);
  H.autoMoves = true; S.douse();
  assert.ok(H.startSpar(), '切磋开始');
  const sp = H.spar!; sp.yieldHits = 3; sp.counterAt = g.time;
  step(0.5);
  assert.ok(!S.on, '还没到一半：第一阶段');
  // 连招表：第一阶段的
  const pick = (H as any).pickCombo.bind(H);
  const q1 = pick(300, null) as string[];
  assert.ok(!q1.some((id) => id.startsWith('p2')), `第一阶段的连招表没有第二阶段的招：${q1.join('、')}`);
  e0.hp = e0.maxHp * 0.49; sp.hpPrev = e0.hp;
  until(() => !!runOf() && runOf()!.def.id === 'p2jie', 1.5);
  assert.equal(runOf()?.def.id, 'p2jie', '气血掉到一半：放解放');
  let washMax = 0; until(() => !runOf(), 6, () => { washMax = Math.max(washMax, S.vis.wash[3]); });
  assert.ok(S.on && S.reached, '解放完进燃身（第二阶段）');
  assert.ok(washMax > 0.4, `解放：整屏压成暗紫红 ${washMax.toFixed(2)}`);
  assert.ok(FX.fx3dOf(g).auras.has('p2-hs'), '燃身：立体的火贴着他');
  const all = new Set<string>(); for (let i = 0; i < 30; i++) for (const id of pick(i % 2 ? 300 : 700, null) as string[]) all.add(id);
  assert.ok([...all].filter((id) => id.startsWith('p2')).length >= 5, `第二阶段的连招表换了：${[...all].join('、')}`);
  // 喝完一口酒也触发（撑过 25 息以后）
  stage(field.x, field.y, 3);
  H.autoMoves = false; S.douse();
  H.startSpar(); const sp2 = H.spar!; sp2.yieldHits = 3; sp2.counterAt = g.time - 10;
  const e1 = H.ent!;
  (e1 as any).shell = true; e1.cs!.setAction('drink'); step(0.2); e1.cs!.setAction('idle'); step(0.1); (e1 as any).shell = false;   // 喘口气喝酒时他由编排手动驱动（shell）
  assert.ok(!S.releasing && !S.on, '撑了不到 25 息：喝酒不触发');
  sp2.counterAt = g.time - 30;
  (e1 as any).shell = true; e1.cs!.setAction('drink'); step(0.2); e1.cs!.setAction('idle'); step(0.1); (e1 as any).shell = false;   // 喘口气喝酒时他由编排手动驱动（shell）
  assert.ok(S.releasing || runOf()?.def.id === 'p2jie', '撑过 25 息、喝完一口酒：放解放');
  until(() => !runOf(), 6);
  assert.ok(S.on, '进第二阶段');
  console.log(`2 赤阳罡：气血一半 / 撑过 25 息喝完酒 → 解放（整屏暗紫红 ${washMax.toFixed(2)}）→ 燃身，连招表换成第二阶段：${[...all].join('、')}`);
}

// ================================================================ 3. 觉醒大招：只在第二阶段、和无极一击 / 破界合用名额
{
  const e0 = stage(field.x, field.y, 3);
  const d = dummy(e0.x + 380, e0.y);
  e0.tgP = false; e0.tgE = d; S3.big = []; S.force = false;
  S.douse();
  assert.ok(!P2.MOVES_P2.p2bahuang.can!(B, e0) && !P2.MOVES_P2.p2zhuri.can!(B, e0), '第一阶段：觉醒大招选不到');
  assert.ok(!H.perform('p2bahuang', d), '第一阶段：硬要出也不出');
  S.ignite();
  assert.ok(P2.MOVES_P2.p2bahuang.can!(B, e0), '第二阶段：选得到');
  S3.useBig(); g.time += M3.HS3.bigGap + 1; S3.useBig(); g.time += M3.HS3.bigGap + 1;
  assert.ok(!P2.MOVES_P2.p2bahuang.can!(B, e0) && !P2.MOVES_P2.p2zhuri.can!(B, e0) && !M3.MOVES_HS3.wuji.can!(B, e0), '名额用完（两分钟两次，和无极一击合用）');
  assert.ok(!H.perform('p2zhuri', d), '名额用完：出手也不出');
  g.time += M3.HS3.bigWin;
  assert.ok(H.perform('p2zhuri', d), '下一场又有');
  assert.equal(S3.big.length, 1, '放了就占一个名额');
  until(() => !runOf(), 10);
  const other = B.spawnBrawler(e0.x + 900, e0.y, 3, 1);
  for (const m of Object.values(P2.MOVES_P2)) if (m.who !== 'player') assert.ok(!m.can!(B, other), `${m.name}：只有他会`);
  console.log('3 觉醒大招：只在第二阶段、和无极一击合用两分钟两次；别人用不了');
}

// ================================================================ 4. 教招、玩家能放
{
  const e0 = stage(field.x, field.y, 3);
  H.autoMoves = false; S.douse();
  h.arts = h.arts.filter((a: any) => !String(a.id).startsWith('bxm_p2'));
  H.startSpar(); const sp = H.spar!; sp.yieldHits = 3; sp.counterAt = g.time;
  step(0.2); S.ignite(); step(0.2);
  assert.ok(S.reached, '切磋里逼出了第二阶段');
  H.endSpar('time'); step(0.2);
  for (const id of P2.P2_TEACH) assert.ok(h.arts.some((a: any) => a.id === moveArtId(id)), `收场后教会 ${id}`);
  assert.ok(!S.on, '收手了：熄火');
  assert.ok(ARTS[moveArtId('p2xuan')] && ARTS[moveArtId('p2pao')] && ARTS[moveArtId('p2gang')], '法术书里有');
  c.enemies.length = 0;
  h.realm = 3; h.hp = 1; h.mp = 1;
  const d = dummy(p.x + 220, p.y + 10); c.lock = d; c.manual = true;
  // 赤阳罡：开燃身、耗灵力
  c.cds.clear(); const mp0 = h.mp; B.castArt(moveArtId('p2gang'));
  assert.equal(B.pMove?.def.id, 'p2gang', '赤阳罡放出来了');
  until(() => !B.pMove, 2);
  assert.ok(S.playerBurnT > 10 && h.mp < mp0, `燃身 ${S.playerBurnT.toFixed(1)} 息、耗了灵力`);
  step(0.2); assert.ok(FX.fx3dOf(g).auras.has('p2-p'), '你身上燃着火');
  for (const id of ['p2xuan', 'p2pao']) {
    B.reset(); c.enemies = c.enemies.filter((x: any) => x === d); d.x = p.x + (id === 'p2pao' ? 420 : 220); d.y = p.y + 10; c.lock = d;
    c.cds.clear(); h.mp = 1; const he0 = n.he, hp0 = d.hp;
    B.castArt(moveArtId(id));
    assert.equal(B.pMove?.def.id, id, `${id}：你放出来了`);
    console.log('DBG hsp2 cast', id, { target: (B.pMove as any)?.target && ((B.pMove as any).target === 'p' ? 'p' : (B.pMove as any).target.name), lock: c.lock?.name, dist: Math.hypot(d.x - p.x, d.y - p.y), x: d.x - p.x, pMove: !!B.pMove, heroDead: h.dead, canAct: c.canAct, pz: p.z, pbAir: (B as any).pb.air, pSubT: (B as any).pSubT, ward: d.ward && d.ward.hp });
    assert.ok(until(() => !B.pMove, 6), `${id}：走完`);
    console.log('DBG hsp2 done', id, { he: n.he - he0, hp0, hp: d.hp, dead: d.dead, hideT: d.hideT, dmgLog: (B as any).log?.slice(-4), ward: d.ward && d.ward.hp, lock: c.lock?.name });
    assert.ok(n.he > he0 && d.hp < hp0, `${id}：伤害走 hitEnemy`);
  }
  step(P2.P2.burn); assert.ok(S.playerBurnT <= 0, '燃身到时熄了');
  console.log('4 切磋逼出第二阶段 → 收场教会三样；你放赤阳罡（燃身、耗灵力）、赤焰回旋腿、炎阳炮拳（伤害走 hitEnemy）');
}

// ================================================================ 5. 姿势：关键帧表、卡帧（r9：和第一阶段同一套 defineKeyTrack）
{
  for (const a of ['p2Xuan', 'p2Yan', 'p2Sui', 'p2Zhui', 'p2Jie', 'p2Ba', 'p2Ri', 'p2Gang'] as const) {
    assert.ok(CH.isKeyTrack(a), `${a} 挂在关键帧动作上（同一套）`);
    const L = CH.keyLen(a); assert.ok(L > 0.5, `${a} 有关键帧`);
    for (let t = 0; t <= L; t += 0.05) { const q = CH.keySample(a, t); for (const v of Object.values(q)) assert.ok(Number.isFinite(v), `${a} @${t.toFixed(2)} 姿势是有限数`); }
  }
  // 卡帧：坠火踢 0.17 → 0.33 一字马——0.25 还定在上一帧（起跳），0.33 到位
  const a = CH.keySample('p2Zhui', 0.25), b = CH.keySample('p2Zhui', 0.33);
  assert.ok(a.rHip < 1, `卡帧：到点前定在上一帧（${a.rHip.toFixed(2)}）`);
  assert.ok(b.rHip > 2.9, '坠火踢 0.33：一字马（腿竖过头）');
  // 拉长手脚：赤焰回旋腿 2.72 单腿高抬那一脚腿拉长、0.07 息后弹回
  assert.ok(CH.keySample('p2Xuan', 2.73).rLegS > 1.25 && CH.keySample('p2Xuan', 2.8).rLegS < 1.15, '高踢那一下腿拉长、随即弹回');
  console.log('5 姿势：八个动作挂在同一套关键帧动作上，卡帧（到点切进去再定住）、踢腿拉长');
}

// ================================================================ 5b. r9 燃身时第一阶段的招：伤害 ×1.15（第二阶段自己的招、大招不叠），命中带火
{
  const e = H.ent ?? (() => { const q = openField(p); H.place(q.x, q.y, 'stay'); step(0.2); return H.ent!; })();
  assert.ok(B.moveHitK && B.burnOf, '燃身的钩子挂上了');
  const fake = (id: string) => ({ user: e, def: { id } }) as any;
  S.douse(); assert.equal(B.moveHitK!(fake('yicunbeng')), 1, '没燃身：一寸崩照常');
  S.ignite();
  assert.equal(B.moveHitK!(fake('yicunbeng')), P2.P2.fracK, '燃身：一寸崩 ×1.15');
  assert.equal(B.moveHitK!(fake('suodi')), P2.P2.fracK, '燃身：缩地 ×1.15');
  assert.equal(B.moveHitK!(fake('p2xuan')), 1, '第二阶段自己的招不叠（strike 里已经乘过）');
  assert.equal(B.moveHitK!(fake('wuji')), 1, '大招不叠');
  assert.ok(B.burnOf!(e) && !B.burnOf!(null), '燃身的是他');
  S.douse();
  console.log('5b 燃身时第一阶段的招：伤害 ×1.15，命中带火（p1fx 读 burnOf）');
}

// ================================================================ 6. Math.random
assert.equal(rnd2, 0, `第二阶段的招式路径上 Math.random 取了 ${rnd2} 次`);
console.log('6 Math.random：0 次');
console.log('test-hsp2 通过');
process.exit(0);
