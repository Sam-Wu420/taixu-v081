// 遁空（催动遁空梭破空疾行）的规则：催动条件、蓄势 → 疾行 → 收势 → 冷却、法力消耗、航向与转向、
// 临近去处自动收势、各种被迫收势。位移本身在 Game 的移动代码里，这里用同样的算法推着人走。
import './env';
import assert from 'node:assert/strict';

const { Dunkong, DUNKONG, DUNKONG_ITEM } = await import('../src/world/dunkong');
const { ITEMS } = await import('../src/data/items');
const { artLook } = await import('../src/data/artlooks');

const BASE_SPEED = 1600;
function world() {
  const toasts: string[] = [];
  const g = {
    hero: { realm: 4, mp: 1, hp: 1, equip: { flight: DUNKONG_ITEM } as Record<string, string | undefined> },
    player: { x: 100000, y: 100000, flying: true, facing: 1 as 1 | -1, boosting: false },
    destination: null as { x: number; y: number } | null, travel: { dir: { x: 0, y: 0 } },
    combat: { vfx: [] as unknown[], inCombat: false, canMove: true },
    noFlyT: 0, gathering: null as unknown, aberrKick: 0, speed: BASE_SPEED, inCave: false,
    mijing: { active: false }, yuanying: { active: false }, nuoyi: { active: false },
    stand() {}, juice() {}, updateUI() {},
    toast(message: string) { toasts.push(message); },
  };
  return { g, toasts, dk: new Dunkong(g as never) };
}
type W = ReturnType<typeof world>;
/** 推进若干秒：阶段照常走，人按航向和倍率移动（世界宽 30 万，贴边就停） */
function run({ g, dk }: W, seconds: number, until?: () => boolean) {
  for (let t = 0; t < seconds; t += 0.02) {
    dk.update(0.02);
    if (dk.phase === 'cruising' || dk.phase === 'retracting') {
      g.player.x = Math.max(200, Math.min(299800, g.player.x + Math.cos(dk.heading) * BASE_SPEED * dk.speedMul * 0.02));
      g.player.y = Math.max(200, Math.min(209800, g.player.y + Math.sin(dk.heading) * BASE_SPEED * dk.speedMul * 0.02));
    }
    if (until?.()) return t;
  }
  return seconds;
}

// 0. 遁空梭是一件登记齐全的飞行法器
{
  const item = ITEMS[DUNKONG_ITEM];
  assert.ok(item && item.art?.kind === 'flight' && item.art.reqRealm === DUNKONG.realm && item.art.mapSpeed === 1.5);
  assert.equal(artLook(DUNKONG_ITEM).shape, 'boat');
}

// 1. 催动条件
{
  const cases: [string, (w: W) => void][] = [
    ['祭出遁空梭', (w) => { w.g.hero.equip.flight = 'art_shenfeng'; }],
    ['元婴', (w) => { w.g.hero.realm = 3; }],
    ['法力不足', (w) => { w.g.hero.mp = 0.05; }],
    ['激战', (w) => { w.g.combat.inCombat = true; }],
    ['禁空', (w) => { w.g.noFlyT = 3; }],
    ['施展不开', (w) => { w.g.mijing.active = true; }],
  ];
  for (const [word, setup] of cases) {
    const w = world(); setup(w);
    assert.equal(w.dk.start(), false, word); assert.equal(w.dk.phase, 'idle');
    assert.ok(w.toasts.some((s) => s.includes(word)), `应说明缘由「${word}」：${w.toasts.join(' / ')}`);
    assert.equal(w.g.hero.mp, word === '法力不足' ? 0.05 : 1, '没催动成就不扣法力');
  }
}

// 2. 蓄势两息 → 疾行（0.35 秒冲到八倍）→ 收势 0.6 息 → 冷却二十息；法力：启动一成，疾行每息 1%
{
  const w = world(), { g, dk } = w;
  g.player.flying = false; g.travel.dir.x = 0; g.travel.dir.y = -1;
  assert.equal(dk.start(), true);
  assert.equal(dk.phase, 'charging'); assert.equal(g.player.flying, true, '在地上催动会先腾空');
  assert.ok(Math.abs(g.hero.mp - 0.9) < 1e-9);
  assert.ok(Math.abs(dk.heading + Math.PI / 2) < 1e-9, '航向取刚才行进的方向');
  const x0 = g.player.x, y0 = g.player.y;
  run(w, 1.9); assert.equal(dk.phase, 'charging'); assert.equal(dk.speedMul, 1); assert.ok(dk.spool > 0.9);
  assert.equal(g.player.y, y0, '蓄势时悬停不动');
  run(w, 0.2); assert.equal(dk.phase, 'cruising'); assert.ok(dk.burst > 0.5);
  run(w, 0.5); assert.ok(Math.abs(dk.speedMul - DUNKONG.speed) < 1e-9);
  const mp1 = g.hero.mp, y1 = g.player.y;
  run(w, 3);
  assert.ok(Math.abs((mp1 - g.hero.mp) - 0.03) < 0.002, `疾行三息耗法力 ${mp1 - g.hero.mp}`);
  assert.ok(Math.abs((y1 - g.player.y) - BASE_SPEED * 8 * 3) < BASE_SPEED * 8 * 0.05, '三息飞出八倍遁速的路程');
  assert.equal(g.player.x, x0);
  assert.ok(dk.k > 0.95);
  dk.toggle(); assert.equal(dk.phase, 'retracting');
  run(w, 0.3); assert.ok(dk.speedMul > 1 && dk.speedMul < DUNKONG.speed);
  run(w, 0.4); assert.equal(dk.phase, 'idle'); assert.ok(dk.cooldown > 19 && dk.cooldown <= 20);
  assert.equal(dk.start(), false); assert.ok(w.toasts.some((s) => s.includes('灵光未复')));
  run(w, 20.5); assert.equal(dk.cooldown, 0); assert.ok(dk.k < 0.01);
  assert.equal(dk.start(), true);
}

// 3. 转向：蓄势时转得快；疾行时没有去处只能缓缓带（每息约 1.1 弧度）
{
  const w = world(), { dk } = w;
  dk.start(); assert.equal(dk.heading, 0);
  for (let i = 0; i < 25; i++) dk.steer(0, 1, 0.02);            // 蓄势半息，想转向正南
  assert.ok(Math.abs(dk.heading - Math.PI / 2) < 1e-6, '蓄势时半息内转到位');
  run(w, 2.6);
  for (let i = 0; i < 50; i++) dk.steer(-1, 0, 0.02);           // 疾行一息，想掉头向西
  assert.ok(Math.abs(dk.heading - (Math.PI / 2 + 1.1)) < 0.02, `疾行一息只转 1.1 弧度：${dk.heading}`);
  dk.steer(0, 0, 1); assert.ok(Math.abs(dk.heading - (Math.PI / 2 + 1.1)) < 0.02, '不按方向就保持航向');
}

// 4. 点过去处：朝那儿飞，临近自动收势，收势后离去处还有一段、没有冲过头
{
  const w = world(), { g, dk } = w;
  g.destination = { x: 190000, y: 160000 };
  dk.start();
  assert.ok(Math.abs(dk.heading - Math.atan2(60000, 90000)) < 1e-9);
  run(w, 30, () => dk.phase === 'idle');
  assert.ok(w.toasts.some((s) => s.includes('已近去处')));
  const left = Math.hypot(g.destination.x - g.player.x, g.destination.y - g.player.y);
  const along = (g.player.x - 100000) * Math.cos(dk.heading) + (g.player.y - 100000) * Math.sin(dk.heading);
  assert.ok(along < Math.hypot(90000, 60000), '没有冲过去处');
  assert.ok(left > 500 && left < 5000, `收势后离去处 ${Math.round(left)}`);
}

// 5. 被迫收势
{
  const cases: [string, (w: W) => void][] = [
    ['受创', (w) => { w.g.hero.hp -= 0.05; }],
    ['压落', (w) => { w.g.player.flying = false; }],
    ['敌袭', (w) => { w.g.combat.inCombat = true; }],
    ['离了身', (w) => { w.g.hero.equip.flight = undefined; }],
    ['法力枯竭', (w) => { w.g.hero.mp = 0.001; }],
    ['身形受制', (w) => { w.g.combat.canMove = false; }],
  ];
  for (const phase of ['charging', 'cruising'] as const) for (const [word, hit] of cases) {
    if (phase === 'charging' && word === '法力枯竭') continue;   // 蓄势不再耗法力
    if (phase === 'cruising' && word === '敌袭') continue;       // 疾行时只是掠过敌人不算，见下
    const w = world(); w.dk.start(); run(w, phase === 'charging' ? 1 : 3);
    assert.equal(w.dk.phase, phase);
    hit(w); run(w, 0.1);
    assert.equal(w.dk.phase, 'retracting', `${phase} 时${word}应收势`);
    assert.ok(w.toasts.some((s) => s.includes(word)), `${word}：${w.toasts.join(' / ')}`);
    run(w, 1); assert.equal(w.dk.phase, 'idle'); assert.equal(Math.ceil(w.dk.cooldown), 20);
  }
  // 疾行时掠过敌人：不收势
  { const w = world(); w.dk.start(); run(w, 3); w.g.combat.inCombat = true; run(w, 0.5); assert.equal(w.dk.phase, 'cruising', '疾行时掠过敌人不该收势'); }
  // 撞到天地尽头
  const w = world(); w.g.player.x = 280000; w.dk.start();
  run(w, 12, () => w.dk.phase === 'idle');
  assert.ok(w.toasts.some((s) => s.includes('天地尽头'))); assert.equal(w.g.player.x, 299800);
}

// 6. 身死 / 读档：归零
{
  const w = world(); w.dk.start(); run(w, 3); w.dk.reset();
  assert.equal(w.dk.phase, 'idle'); assert.equal(w.dk.cooldown, 0); assert.equal(w.dk.k, 0); assert.equal(w.dk.speedMul, 1);
}
// 7. 收官 P5：疾行途中被拦截——境界高过你、正锁着你的追兵抢到航线前方截住；先有一息左右的预警，转向绕开就过去，硬闯挨一击被迫收势
{
  const { DUNKONG_AMBUSH: A } = await import('../src/world/dunkong');
  /** 给假世界挂上追杀：追兵在身后 dist 处；hits 记 hitPlayer */
  const chased = (w: W, realm: number, dist = 1500, extra: Record<string, unknown> = {}) => {
    const g = w.g as typeof w.g & Record<string, any>;
    const e = { id: 0.37, x: g.player.x - dist, y: g.player.y, hx: 0, hy: 0, kx: 0, ky: 0, dead: false, realm, atk: 80, aggro: false, trailReset: false, st: {} as Record<string, number> };
    const P = { e, name: '截道者', realm, lockR: 5200, lost: false, blinkCd: 0, lastX: 0, lastY: 0, ...extra };
    g.pursuit = { cur: P };
    const hits: { raw: number; src: unknown }[] = [];
    Object.assign(g.combat, { fxq: [] as unknown[], texts: [] as unknown[], enemies: [] as unknown[], hitPlayer(raw: number, _r: number, _s: unknown, _x: number, _y: number, src?: unknown) { hits.push({ raw, src }); } });
    return { P, e, hits };
  };
  /** 催动并疾行，每一步记一下拦截的状态；steer：拦截亮着时怎么打方向 */
  const cruise = (w: W, seconds: number, steer?: (a: NonNullable<typeof w.dk.ambush>) => [number, number]) => {
    let warnAt = -1, endAt = -1, t = 0;
    w.dk.start(); run(w, 2.05);
    for (; t < seconds; t += 0.02) {
      const a = w.dk.ambush;
      if (a && warnAt < 0) warnAt = t;
      if (a && steer) { const [x, y] = steer(a); w.dk.steer(x, y, 0.02); }
      if (!a && warnAt >= 0 && endAt < 0) endAt = t;
      run(w, 0.02);
    }
    return { warnAt, endAt };
  };
  // 没有追兵：不触发
  { const w = world(); const r = cruise(w, 4); assert.equal(r.warnAt, -1, '没有追兵不拦截'); assert.equal(w.dk.phase, 'cruising'); }
  // 追兵不比你高 / 已跟丢 / 出了锁定范围 / 被定住：不触发
  for (const [why, setup] of [['同境界', (w: W) => chased(w, 4)], ['跟丢了', (w: W) => chased(w, 5, 1500, { lost: true })], ['够不着', (w: W) => chased(w, 5, 6000)], ['被定住', (w: W) => { chased(w, 5).e.st.stun = 2; }]] as const) {
    const w = world(); setup(w); const r = cruise(w, 4);
    assert.equal(r.warnAt, -1, `${why}：不拦截`); assert.equal(w.dk.phase, 'cruising');
  }
  // 硬闯：亮出拦截点（在航线正前方）→ 一息左右后撞上 → 挨一击（hitPlayer、来源是追兵）、被迫收势，他就在身边
  {
    const w = world(); const { e, hits } = chased(w, 5);
    let calls = 0; const rnd0 = Math.random; Math.random = () => { calls++; return rnd0(); };
    w.dk.start(); run(w, 2.05);
    let warnAt = -1, hitAt = -1, ahead = 0;
    for (let t = 0; t < 5 && hitAt < 0; t += 0.02) {
      const a = w.dk.ambush;
      if (a && warnAt < 0) { warnAt = t; const dx = a.x - w.g.player.x, dy = a.y - w.g.player.y; ahead = dx * Math.cos(w.dk.heading) + dy * Math.sin(w.dk.heading); assert.ok(Math.abs(dx * Math.sin(w.dk.heading) - dy * Math.cos(w.dk.heading)) < 1, '拦截点在航线上'); }
      run(w, 0.02);
      if (hits.length && hitAt < 0) hitAt = t;
    }
    Math.random = rnd0;
    assert.equal(calls, 0, '拦截不取 Math.random');
    assert.ok(warnAt >= A.at - 0.03 && warnAt <= A.at + A.jitter + 0.03, `疾行后片刻拦截：${warnAt}`);
    assert.ok(ahead > 8000, `拦截点在前方一息多的路程处：${Math.round(ahead)}`);
    assert.ok(w.toasts.some((s) => s.includes('截住去路')), '有提示');
    assert.ok((w.g.combat as any).vfx.some((v: any) => v.kind === 'warn'), '前方亮起预警圈');
    assert.ok((w.g.combat as any).fxq.some((v: any) => v.k === 'xueying'), '拦截的遁光');
    assert.ok(hitAt - warnAt >= 0.9 && hitAt - warnAt <= 1.4, `预警约一息：${(hitAt - warnAt).toFixed(2)}`);
    assert.equal(hits.length, 1); assert.equal(hits[0].src, e, '伤害走 hitPlayer、来源是追兵');
    assert.equal(w.dk.phase, 'retracting', '被迫收势'); assert.ok(w.toasts.some((s) => s.includes('迎面截住')));
    assert.ok(Math.hypot(e.x - w.g.player.x, e.y - w.g.player.y) < 600, '追兵就在身边');
    run(w, 1); assert.equal(w.dk.phase, 'idle'); assert.equal(Math.ceil(w.dk.cooldown), 20);
  }
  // 绕开：一亮出拦截点就往旁边打方向——掠过去不挨打，接着疾行，这一趟不再拦第二次
  {
    const w = world(); const { hits } = chased(w, 5);
    const r = cruise(w, 6, () => [-Math.sin(w.dk.heading), Math.cos(w.dk.heading)]);
    assert.ok(r.warnAt >= 0 && r.endAt > r.warnAt, '亮过拦截、又过去了');
    assert.equal(hits.length, 0, '绕开不挨打'); assert.equal(w.dk.phase, 'cruising', '接着疾行');
    assert.ok(w.toasts.some((s) => s.includes('绕开了')));
    assert.equal(w.dk.ambush, null, '一趟只拦一次');
  }
  // 七种被迫收势照旧（见第 5 段）；拦截之外不多出收势
}

// 8. 音效（收官 P5）：蓄势、疾行、收势各一声；被拦截有截道的警讯，硬闯打中有一声
{
  const { audio } = await import('../src/world/audio');
  const heard: string[] = [], sfx0 = audio.sfx;
  (audio as { sfx: (k: string) => void }).sfx = (k: string) => { heard.push(k); };
  try {
    const w = world(); w.dk.start(); assert.deepEqual(heard, ['spool'], '蓄势');
    run(w, 2.05); assert.deepEqual(heard, ['spool', 'thunder'], '疾行破空');
    w.dk.toggle(); assert.deepEqual(heard, ['spool', 'thunder', 'whoosh'], '收势');
    // 被拦截、硬闯
    heard.length = 0;
    const w2 = world(), g2 = w2.g as typeof w2.g & Record<string, any>;
    const e = { id: 0.5, x: g2.player.x - 1500, y: g2.player.y, hx: 0, hy: 0, kx: 0, ky: 0, dead: false, realm: 5, atk: 80, aggro: false, trailReset: false, st: {} };
    g2.pursuit = { cur: { e, name: '截道者', realm: 5, lockR: 5200, lost: false, blinkCd: 0, lastX: 0, lastY: 0 } };
    Object.assign(g2.combat, { fxq: [], texts: [], enemies: [], hitPlayer() {} });
    w2.dk.start(); run(w2, 5, () => w2.dk.phase === 'retracting');
    assert.ok(heard.indexOf('ambush') > heard.indexOf('thunder') && heard.indexOf('bladehit') > heard.indexOf('ambush'), `截道的警讯在先、硬闯打中：${heard.join(' ')}`);
  } finally { (audio as { sfx: unknown }).sfx = sfx0; }
}
console.log('PASS 遁空：催动条件、蓄势两息、八倍疾行、收势与二十息冷却、法力（启动一成 + 每息 1%）、转向限速、临近去处自动收势、七种被迫收势、归零、疾行途中被拦截（预警约一息、绕开或硬闯挨打收势、没有够得着的高阶追兵不触发、不取 Math.random）、蓄势 / 疾行 / 收势的音效');
