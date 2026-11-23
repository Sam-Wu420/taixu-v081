// 虚空挪移的过程与规则：开阵 → 穿行 → 出阵；公用的阵里有同行的过客；
// 追兵跟进甬道、出阵后在身边破空而出；结丹以上的追兵逼近时把甬道截断在半途；跨图的一趟飞够时间才切图。
import './env';
import assert from 'node:assert/strict';
// 固定随机源（同行过客的人数、甬道里飞剑落点的偏移都由开阵那一刻的一个随机数定）与时钟：默认种子 1，SEED=n 换一个
{ let s = (Number(process.env.SEED ?? 1) * 2654435761) >>> 0; Math.random = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
await import('./fixed-clock');

const { Nuoyi, OPEN } = await import('../src/world/nuoyi');
const { CharState } = await import('../src/gfx/character');

function world() {
  const toasts: string[] = [];
  const player = { x: 1000, y: 1000, flying: false, st: new CharState(1000, 1000) };
  const hits: { raw: number; src: unknown }[] = [];
  const combat = { vfx: [] as unknown[], fxq: [] as unknown[], texts: [] as unknown[], enemies: [] as unknown[], safeAt: (_x: number, _y: number) => false, mind: { canStand: () => true },
    hitPlayer(raw: number, _realm: number, _st: unknown, _fx: number, _fy: number, src?: unknown) { hits.push({ raw, src }); } };
  const g = {
    renderer: { hd: {}, streaming: false, sense: { alarm: 0 } }, mijing: { active: false }, player, combat, destination: null as unknown, hero: { dead: false, hp: 1 }, hits,
    input: { keys: new Set<string>(), joy: { x: 0, y: 0 }, run: false }, pursuit: { cur: null as unknown }, time: 100, hurtFlash: 0,
    terrain: { walkFactor: () => 1 },
    teleport(x: number, y: number) { player.x = x; player.y = y; },
    toast(message: string) { toasts.push(message); }, juice() {},
  };
  return { g, toasts, player, combat };
}
function pursuer(g: ReturnType<typeof world>['g'], realm: number, dist: number) {
  const e = { def: {}, atk: 50, realm, x: g.player.x + dist, y: g.player.y, dead: false, st: {}, kx: 0, ky: 0, hx: 0, hy: 0, aggro: false, trailReset: false };
  const P = { e, name: '追兵', realm, lockR: 3400, lost: false, wings: [] as unknown[], faction: { robe: '#3a0a14', color: '230,40,50' }, outT: 5, searching: true, lastX: 0, lastY: 0, v: 0, chase: 400 };
  g.pursuit.cur = P;
  return P;
}
/** 一直推进到挪移结束（或到时间上限），返回经过的阶段 */
function run(n: InstanceType<typeof Nuoyi>, g: ReturnType<typeof world>['g'], seconds = 12) {
  const phases: string[] = [n.phase];
  for (let t = 0; t < seconds && n.active; t += 0.05) { g.time += 0.05; n.update(0.05); if (phases[phases.length - 1] !== n.phase) phases.push(n.phase); }
  return phases;
}
const settle = (n: InstanceType<typeof Nuoyi>, g: ReturnType<typeof world>['g'], seconds: number) => { for (let t = 0; t < seconds; t += 0.05) { g.time += 0.05; n.update(0.05); } };
const to = { x: 21000, y: 1000 };

// 1. 没有立体画面：立刻位移，不走过程
{
  const { g, player } = world(); (g.renderer as { hd: unknown }).hd = null;
  const n = new Nuoyi(g as never);
  assert.equal(n.start({ kind: 'array', to, arrive: () => g.teleport(to.x, to.y) }), false);
  assert.equal(player.x, to.x); assert.equal(n.active, false);
}

// 2. 回府符（私人的挪移）：开阵 → 穿行 → 出阵，位移在进甬道时执行一次，甬道里没有别人
{
  const { g, player } = world(); const n = new Nuoyi(g as never);
  let arrived = 0;
  assert.equal(n.start({ kind: 'talisman', to, arrive: () => { arrived++; g.teleport(to.x, to.y); } }), true);
  assert.equal(n.riders.length, 0);
  n.update(0.05); assert.equal(arrived, 0, '开阵时还没动'); assert.equal(player.x, 1000);
  const phases = run(n, g);
  assert.deepEqual(phases, ['open', 'passage', 'exit', 'idle']);
  assert.equal(arrived, 1); assert.equal(player.x, to.x); assert.equal(player.st.action, 'idle');
}

// 3. 公用的阵：零到三位过客，都在前方、都不是敌人
{
  let most = 0;
  for (let i = 0; i < 40; i++) {
    const { g } = world(); const n = new Nuoyi(g as never);
    n.start({ kind: 'array', to, arrive: () => g.teleport(to.x, to.y) });
    assert.ok(n.riders.length <= 3); most = Math.max(most, n.riders.length);
    for (const r of n.riders) { assert.equal(r.hostile, false); assert.ok(r.z < 0); assert.equal(r.st.action, 'fly'); }
    run(n, g); assert.equal(n.riders.length, 0, '出阵后清空');
  }
  assert.ok(most >= 2, '四十趟里总该遇到过两位以上的同行');
}

// 4. 追入：筑基追兵锁着你，跟进公用的阵；你照常抵达，片刻后追兵在身边破空而出，重新咬住
{
  const { g, player, combat, toasts } = world(); const n = new Nuoyi(g as never), P = pursuer(g, 2, 800);
  let arrived = 0;
  n.start({ kind: 'array', to, arrive: () => { arrived++; g.teleport(to.x, to.y); } });
  assert.ok(n.chased); assert.equal(n.riders.filter((r) => r.hostile).length, 1);
  assert.ok(n.riders.find((r) => r.hostile)!.z > 0, '追兵在身后');
  run(n, g);
  assert.equal(arrived, 1); assert.equal(player.x, to.x); assert.equal(n.cut, 0);
  assert.ok(Math.hypot(P.e.x - player.x, P.e.y - player.y) > 10000, '刚出阵时追兵还没到');
  settle(n, g, 1.5);
  const d = Math.hypot(P.e.x - player.x, P.e.y - player.y);
  assert.ok(d > 300 && d < 3200, `追兵落在身边：${d}`);
  assert.equal(P.outT, 0); assert.equal(P.e.aggro, true); assert.ok(combat.enemies.includes(P.e));
  assert.ok(toasts.some((s) => s.includes('闯进了传送阵')) && toasts.some((s) => s.includes('追了出来')));
}

// 5. 截断：结丹追兵逼到 1000 以内，甬道被截断——不算抵达，落在途中三成到六成处，追兵杀到；45 秒内不会再截第二次
{
  const { g, player, toasts } = world(); const n = new Nuoyi(g as never), P = pursuer(g, 3, 800);
  let arrived = 0;
  n.start({ kind: 'array', to, arrive: () => { arrived++; g.teleport(to.x, to.y); } });
  const phases = run(n, g);
  assert.deepEqual(phases, ['open', 'passage', 'exit', 'idle']);
  assert.equal(arrived, 0, '被截断的一趟不算抵达');
  const f = (player.x - 1000) / (to.x - 1000);
  assert.ok(f > 0.28 && f < 0.63, `落在途中：${f}`);
  assert.ok(toasts.some((s) => s.includes('截断')));
  settle(n, g, 1);
  assert.ok(Math.hypot(P.e.x - player.x, P.e.y - player.y) < 3000);
  // 紧接着再传一次：追兵跟进来，但截不了
  P.e.x = player.x + 800; P.e.y = player.y;
  n.start({ kind: 'array', to, arrive: () => { arrived++; g.teleport(to.x, to.y); } });
  assert.ok(n.chased); run(n, g);
  assert.equal(arrived, 1); assert.equal(player.x, to.x);
  // 过了间隔又能截
  settle(n, g, 46); P.e.x = player.x + 800; P.e.y = player.y;
  n.start({ kind: 'array', to: { x: 1000, y: 1000 }, arrive: () => { arrived++; g.teleport(1000, 1000); } });
  run(n, g); assert.equal(arrived, 1, '间隔过后再次被截断');
}

// 6. 私人的挪移只有结丹以上、1200 以内的追兵追得上；不给目的地就只会被追入、不会被截断；被定住的追兵截不了
{
  const cases: [number, number, boolean][] = [[2, 800, false], [3, 1500, false], [3, 1100, true]];
  for (const [realm, dist, follows] of cases) {
    const { g } = world(); const n = new Nuoyi(g as never); pursuer(g, realm, dist);
    n.start({ kind: 'talisman', to, arrive: () => g.teleport(to.x, to.y) });
    assert.equal(n.chased, follows, `回府符：境界 ${realm} 距离 ${dist}`);
  }
  for (const stuck of [false, true]) {
    const { g, player } = world(); const n = new Nuoyi(g as never), P = pursuer(g, 4, 600);
    if (stuck) (P.e.st as { stun?: number }).stun = 2;
    let arrived = 0;
    n.start({ kind: 'array', to: stuck ? to : undefined, arrive: () => { arrived++; g.teleport(to.x, to.y); } });
    run(n, g);
    assert.equal(arrived, 1); assert.equal(player.x, to.x);
  }
  // 追兵已经跟丢：不会跟进来
  const { g } = world(); const n = new Nuoyi(g as never), P = pursuer(g, 4, 600); P.lost = true;
  n.start({ kind: 'array', to, arrive: () => g.teleport(to.x, to.y) });
  assert.equal(n.chased, false);
}

// 7. 跨图：甬道里飞够 1.7 秒才执行切图，之后停在甬道里等页面重新载入
{
  const { g } = world(); const n = new Nuoyi(g as never);
  let at = -1, clock = 0;
  n.start({ kind: 'ancient', leaves: true, arrive: () => { at = clock; } });
  for (; clock < 5; clock += 0.05) n.update(0.05);
  assert.ok(at >= OPEN + 1.7 - 0.06 && at < OPEN + 1.7 + 0.2, `切图时刻 ${at}`);   // 第五轮：开阵时长改成常量 OPEN（1.5 秒）
  assert.equal(n.phase, 'passage'); assert.equal(n.fade, 1);
}
console.log('PASS 虚空挪移：过程三段、同行过客、追入甬道、截断甬道（结丹以上 / 1000 以内 / 间隔 45 秒）、私人挪移的追踪条件、跨图延时切换');

// 8. 甬道里躲追兵的飞剑（收官 P5）
{
  const { TUNNEL_BLADE: B } = await import('../src/world/nuoyi');
  /** 推进到出阵，每一步先让 steer 摆一下按键；返回甬道里飞了多久、见过的飞剑 */
  const fly = (n: InstanceType<typeof Nuoyi>, g: ReturnType<typeof world>['g'], steer?: () => void) => {
    let passage = 0; const seen = new Set<unknown>(); let warnFirst: { sx: number; sy: number; sway: [number, number] } | null = null;
    for (let t = 0; t < 14 && n.active; t += 0.05) {
      steer?.(); g.time += 0.05; n.update(0.05);
      if (n.phase === 'passage') passage += 0.05;
      for (const b of n.blades) if (!seen.has(b)) { seen.add(b); if (!warnFirst) { assert.equal(b.state, 'warn', '先亮落点'); warnFirst = { sx: b.sx, sy: b.sy, sway: [n.swayX, n.swayY] }; } }
    }
    return { passage, count: seen.size, warnFirst };
  };
  // 没被追杀：甬道里什么都不多出来，过程和原来一样短
  for (const kind of ['array', 'talisman'] as const) {
    const { g } = world(); const n = new Nuoyi(g as never);
    n.start({ kind, to, arrive: () => g.teleport(to.x, to.y) });
    const r = fly(n, g);
    assert.equal(r.count, 0, `${kind}：没被追杀时没有飞剑`); assert.equal(g.hits.length, 0); assert.ok(r.passage < 1.5, `${kind}：甬道照旧短：${r.passage}`);
  }
  // 被截断的一趟（结丹逼到 1000 以内）：没有飞剑，照旧截断
  { const { g } = world(); const n = new Nuoyi(g as never); pursuer(g, 3, 800); n.start({ kind: 'array', to, arrive: () => g.teleport(to.x, to.y) }); assert.equal(fly(n, g).count, 0, '截断的一趟没有飞剑'); }

  // 被追进甬道、站着不动：先亮落点（就在你所在的位置），再飞到——挨打（走 hitPlayer、来源是追兵），被拖慢、追兵逼近、这一趟多飞一阵
  {
    const { g, player } = world(); const n = new Nuoyi(g as never), P = pursuer(g, 2, 800);
    const calls = { n: 0 }, rnd0 = Math.random; let arrived = 0;
    n.start({ kind: 'array', to, arrive: () => { arrived++; g.teleport(to.x, to.y); } });
    Math.random = () => { calls.n++; return rnd0(); };
    let dragSeen = false, zBefore = 0, zAfter = 0;
    const r = fly(n, g, () => {
      const hostile = n.riders.find((q) => q.hostile);
      if (hostile && !dragSeen && n.blades.some((b) => b.state === 'fly')) zBefore = hostile.z;
      if (n.drag > 0) { dragSeen = true; if (hostile && !zAfter) zAfter = hostile.z; }
    });
    Math.random = rnd0;
    assert.equal(calls.n, 0, '甬道里的飞剑不取 Math.random');
    assert.ok(r.count >= 2, `站着不动也该掷来两柄以上：${r.count}`);
    assert.ok(r.warnFirst && Math.hypot(r.warnFirst.sx - r.warnFirst.sway[0], r.warnFirst.sy - r.warnFirst.sway[1]) < 0.2, '落点就在亮出那一刻人所在的位置');
    assert.equal(g.hits.length, r.count, '躲都不躲，柄柄打中');
    assert.ok(g.hits.every((h) => h.src === P.e && h.raw > 0), '伤害走 hitPlayer、来源是追兵');
    assert.ok(n.bladeHits === r.count && dragSeen, '挨打后被拖慢');
    assert.ok(zAfter > 0 && zAfter < zBefore, `追兵趁机逼近：${zBefore} → ${zAfter}`);
    assert.ok(r.passage >= B.passage + r.count * B.extra - 0.06, `挨一下多飞一阵：${r.passage}`);
    assert.equal(arrived, 1); assert.equal(player.x, to.x, '照常抵达');
    assert.equal(n.blades.length, 0, '出阵后清空');
  }
  // 看见落点就往另一边挪：一柄都打不中
  {
    const { g } = world(); const n = new Nuoyi(g as never); pursuer(g, 2, 800);
    n.start({ kind: 'array', to, arrive: () => g.teleport(to.x, to.y) });
    const r = fly(n, g, () => {
      const k = g.input.keys; k.clear();
      const b = n.blades.find((q) => q.state === 'warn' || q.state === 'fly');
      if (b) k.add(b.sx > 0 ? 'a' : 'd');
    });
    assert.ok(r.count >= 2, `掷了 ${r.count} 柄`); assert.equal(g.hits.length, 0, '左右挪开就躲过'); assert.equal(n.bladeHits, 0);
    assert.ok(r.passage < B.passage + 0.5, '没挨打就不多飞');
  }
  // 加减速：落点亮起时按住疾行往前蹿，也躲得开
  {
    const { g } = world(); const n = new Nuoyi(g as never); pursuer(g, 2, 800);
    n.start({ kind: 'array', to, arrive: () => g.teleport(to.x, to.y) });
    const r = fly(n, g, () => { const b = n.blades.find((q) => q.state === 'warn' || q.state === 'fly'); g.input.run = !!b && b.sz < 0.5; });
    assert.ok(r.count >= 2); assert.equal(g.hits.length, 0, '往前蹿开就躲过');
  }
}
// 9. 音效（收官 P5）：开阵、进甬道、出甬道各有一声；被追进甬道时飞剑有预警的剑鸣、出手声、打中 / 擦身而过
{
  const { audio } = await import('../src/world/audio');
  const heard: string[] = [], sfx0 = audio.sfx;
  (audio as { sfx: (k: string) => void }).sfx = (k: string) => { heard.push(k); };
  try {
    { const { g } = world(); const n = new Nuoyi(g as never); n.start({ kind: 'talisman', to, arrive: () => g.teleport(to.x, to.y) }); run(n, g);
      assert.deepEqual(heard, ['zhenopen', 'warpin', 'warpout'], `开阵 → 进甬道 → 出甬道：${heard.join(' ')}`); }
    heard.length = 0;
    { const { g } = world(); const n = new Nuoyi(g as never); n.start({ kind: 'ancient', to, arrive: () => g.teleport(to.x, to.y) }); assert.deepEqual(heard, ['zhenopen', 'thunder'], '上古传送阵另有一声雷'); run(n, g); }
    heard.length = 0;
    { const { g } = world(); const n = new Nuoyi(g as never); pursuer(g, 2, 800); n.start({ kind: 'array', to, arrive: () => g.teleport(to.x, to.y) }); run(n, g);
      for (const k of ['bladewarn', 'sword', 'bladehit']) assert.ok(heard.includes(k), `被追进甬道、站着挨打：有 ${k}（${heard.join(' ')}）`);
      assert.ok(heard.indexOf('bladewarn') < heard.indexOf('sword') && heard.indexOf('sword') < heard.indexOf('bladehit'), '预警在先、出手、打中'); }
  } finally { (audio as { sfx: unknown }).sfx = sfx0; }
}
// 10. 开阵的画面（收官 P5）：脚下的阵纹由里往外逐圈点亮（三圈地上的篆文圈，挪移途中世界停着，由挪移自己推进）、光柱在起点升起；出阵后光柱在落点亮一阵再散
{
  const { g, player, combat } = world(); const n = new Nuoyi(g as never);
  assert.equal(n.pillar, null, '没挪移时没有光柱');
  n.start({ kind: 'array', to, arrive: () => g.teleport(to.x, to.y) });
  const all = combat.vfx as { kind: string; fx?: string; t: number; r: number; x: number }[], rings = all.filter((v) => v.kind === 'warn');
  assert.equal(rings.length, 3); assert.ok(rings.every((v) => v.x === 1000), '三圈阵纹（描边 + 篆文）');
  assert.ok(rings[0].t === 0 && rings[1].t < 0 && rings[2].t < rings[1].t && rings[0].r < rings[1].r && rings[1].r < rings[2].r, '由里往外逐圈点亮');
  // 第五轮：开阵放长到 OPEN（1.5 秒），光柱在前七成时间里升满，三圈相隔 0.35 秒
  const k: number[] = [], N = Math.ceil(OPEN * 0.7 / 0.05) + 1;
  for (let i = 0; i < N; i++) { n.update(0.05); k.push(n.pillar!.k); assert.equal(n.pillar!.x, 1000, '光柱在起点'); }
  assert.ok(k.every((v, i) => i === 0 || v >= k[i - 1]) && k[N - 1] > 0.99 && k[0] < 0.1, `光柱随开阵升起：${k.map((v) => v.toFixed(2)).join(' ')}`);
  assert.ok(Math.abs(rings[0].t - N * 0.05) < 1e-6 && Math.abs(rings[2].t - (N * 0.05 - 0.7)) < 1e-6, '阵纹圈跟着开阵走（世界停着也在亮）');
  assert.equal(n.phase, 'open', '光柱升满、三圈都亮了，甬道还没盖上来');
  run(n, g);
  assert.equal(n.phase, 'idle');
  const land = n.pillar; assert.ok(land && land.x === player.x && land.x === to.x && land.k > 0, '出阵后落点的光柱还亮着');
  assert.ok(all.some((v) => v.r === 220 && v.fx === 'array'), '落点也亮一圈阵纹');
  settle(n, g, 1); assert.equal(n.pillar, null, '一会儿就散了');
}
console.log('PASS 甬道里的飞剑：没被追杀时没有、截断的一趟没有、落点先亮、站着不动柄柄挨打（走 hitPlayer、被拖慢、追兵逼近、多飞一阵）、左右挪开或往前蹿都躲得开、不取 Math.random');
