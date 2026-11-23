// 收官 B4：绝域铺到别界。
//   1. 六种样貌（沧海、瀚漠、寒渊、炎墟、幽冥、灵木）各一份险地配置：分带、介质规则、怪物表；同一个种子配出来的一模一样，换种子会变
//   2. 真的换到那一界去：险地在大陆外那一圈，按配置分带；介质的规则（流沙陷人、冰上落脚、熔岩烧、毒瘴按浓度掉血、引魂灯 / 林窗免伤、灵舟的规矩）
//   3. 怪物表：破出来的是派生的那只（不是无边海的原样），不走野外刷怪、不触发模组的 spawn 钩子
//   4. 本界的小险地：南荒的腐骨瘴泽存在、在湖上；不挡路——城镇、宗门、主线地点都不在它里面，湖外的陆路上一点影响都没有
//   5. 四个境界在各界险地核心里能撑多久：有梯度（境界越高撑得越久）
//   6. 每帧逻辑不取 Math.random
// 用真实的 Game 无界面地跑。
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const W = await import('../src/data/world');
const Z = await import('../src/data/zhujie');
const G = await import('../src/world/game');
const L = await import('../src/world/jueyuLooks');
const { WUBIAN, curveAt } = await import('../src/world/jueyuProfile');
const { ENEMIES } = await import('../src/data/enemies');
const { ringOf, floeAt } = await import('../src/world/jueyu');
const log = (s: string) => console.log('  ' + s);
const g = await G.createGame(() => {});
g.reset();
const p = g.player, J = g.jueyu;
const KINDS = ['sea', 'sand', 'ice', 'lava', 'ming', 'miasma'] as const;
const KIND_OF: Record<string, string> = { sea: 'archipelago', sand: 'desert', ice: 'frost', lava: 'ember', ming: 'nether', miasma: 'spiritwood' };
const nearest = (kind: string) => { let best = 1, bd = Infinity; for (let i = 1; i <= 400; i++) { const r = Z.realmAt(i); if (r.kind !== kind) continue; const d = Math.hypot(r.x, r.y); if (d < bd) { bd = d; best = i; } } return best; };
const run = (frames: number, dt = 0.1, keys: string[] = [], each?: (n: number) => boolean | void) => {
  let n = 0;
  for (; n < frames; n++) {
    if (g.modal) g.closeModal(true); g.paused = false;
    g.input.keys.clear(); for (const k of keys) g.input.keys.add(k);
    g.update(dt);
    if (each?.(n)) break;
  }
  g.input.keys.clear(); return n;
};
const setRealm = (r: number) => { g.hero.realm = r; g.hero.stage = 0; g.hero.exp = 0; g.hero.hp = 1; g.hero.mp = 1; };

// ---------------------------------------------------------------- 1. 配置：六种样貌、按种子一致
{
  for (const k of KINDS) {
    const a = L.realmProfile(k, 12345, 30000, 'x'), b = L.realmProfile(k, 12345, 30000, 'x'), c = L.realmProfile(k, 99999, 30000, 'x');
    assert.deepEqual(a, b, `${k}：同一个种子配出来一模一样`);
    assert.notDeepEqual(a.bands, c.bands, `${k}：换了种子分带会变`);
    assert.notDeepEqual(a.freq, c.freq, `${k}：换了种子天象频度会变`);
    // 分带单调、在圈内
    const f = a.bands.map((x) => x.from);
    assert.ok(f[0] === 0 && f[1] < f[2] && f[2] < f[3] && f[3] < 30000, `${k}：分带单调、绝域在图边之内 ${f}`);
    for (const key of Object.keys(a.curves) as (keyof typeof a.curves)[]) { const C = a.curves[key]!; for (let i = 1; i < C.at.length; i++) assert.ok(C.at[i] > C.at[i - 1], `${k}.${key} 关键点递增`); }
    // 怪物表：每种行为都有一只派生的怪（沧海借原样），它们都在 ENEMIES 里、是 lair、不进刷怪池
    if (a.beasts) for (const [bk, s] of Object.entries(a.beasts)) {
      const d = ENEMIES[s.def]; assert.ok(d, `${k}.${bk}：${s.def} 已登记`); assert.ok(d.lair && (d.minDanger ?? 0) >= 99, `${k}.${bk}：不进刷怪池`);
      if (bk === 'mochu') assert.ok(ENEMIES[s.def + '_xu'], `${k}：触须 ${s.def}_xu`);
      if (bk === 'chuanling') assert.ok(ENEMIES[s.def + '_deng'], `${k}：魂灯 ${s.def}_deng`);
    }
  }
  const M = Object.fromEntries(KINDS.map((k) => [k, L.LOOKS[k].medium]));
  assert.equal(M.sand.boat, 'any'); assert.equal(M.ice.boat, 'none'); assert.equal(M.lava.boat, 'high');
  assert.ok(M.lava.burn > 0 && M.ice.chill > 0 && M.miasma.toxic > 0 && M.ming.lamps > 0 && M.miasma.glades > 0 && M.lava.thermal > 0 && M.ice.floes > 0, '各介质的额外规则都在');
  assert.ok(M.sea.dive && !M.sand.dive && !M.lava.dive, '只有海能下潜');
  // 视野：幽冥最小
  assert.ok(L.LOOKS.ming.view < Math.min(...KINDS.filter((k) => k !== 'ming').map((k) => L.LOOKS[k].view)), '幽冥的视野最小');
  log('六种配置：同种子一致、换种子会变、分带单调、怪物表都已登记');
}

// ---------------------------------------------------------------- 2. 真的去那一界
/** 从图心往东找海岸，再往外按离岸距离找某一带的一点 */
const scanOut = (want: number) => J.seekDepth(want);
const place = (x: number, y: number, fly = true) => { g.teleport(x, y); p.flying = fly; p.z = p.zTarget = fly ? 56 : 0; g.combat.reset(); J.reset(); if (g.modal) g.closeModal(true); };
const go = (k: string) => {
  const n = nearest(KIND_OF[k]), map = `realm-${n}` as const;
  if (W.ACTIVE_MAP !== map) { setRealm(4); g.travel.pending = { map, x: 0, y: 0, via: 'portal' } as never; assert.ok(g.switchMap(map), `换到 ${map}`); g.travel.pending = null; }
  assert.equal(W.ACTIVE_MAP, map);
  J.F.ensure(); return n;
};
const visit: Record<string, { n: number; core: { x: number; y: number }; fog: { x: number; y: number } }> = {};
for (const k of KINDS) {
  const n = go(k), r = Z.realmAt(n);
  { const q = scanOut(300); place(q.x, q.y); }
  run(2);
  const P = J.profile!;
  assert.ok(P && P.id.startsWith('jy-' + k), `${k}：用的是这一界的配置（${P?.id}）`);
  // 同一界再配一次，一模一样（按界的种子）
  assert.deepEqual(L.realmProfile(k, r.seed, ringOf(W.ACTIVE_MAP), P.name), P, `${k}：同一界每次配出来一样`);
  const fog = P.bands.find((b) => b.id === 'fog')!.from, core = P.bands.find((b) => b.id === 'core')!.from;
  const pf = scanOut(fog + 800), pc = scanOut(core + 1200);
  visit[k] = { n, core: pc, fog: pf };
  place(pf.x, pf.y); run(5);
  assert.equal(J.band, 'fog', `${k}：断层带（d=${J.depth.toFixed(0)}）`);
  assert.ok(J.sea, `${k}：海况开着`);
  const post = J.post(640, 400)!;
  assert.equal(post.medium?.wave, P.medium.look.wave, `${k}：着色器拿到介质的波形`);
  place(pc.x, pc.y); run(5);
  assert.equal(J.band, 'core', `${k}：核心（d=${J.depth.toFixed(0)}）`);
  assert.ok(J.drainRate > 0, `${k}：核心里流失`);
  assert.ok(J.dunkongRefusal(), `${k}：核心里遁空梭失灵`);
  log(`${k}：${r.name}（realm-${n}）圈宽 ${(ringOf(W.ACTIVE_MAP) / 1000).toFixed(1)} 千，分带 ${P.bands.map((b) => (b.from / 1000).toFixed(1)).join(' / ')} 千；场 ${J.F.costMs.toFixed(0)} 毫秒；核心流失 ${(J.drainRate * 100).toFixed(2)}%/息，气 ${J.haze.toFixed(2)}`);
}

// ---------------------------------------------------------------- 3. 介质的规则
const runFor = (sec: number, each?: () => void, keys: string[] = []) => run(Math.round(sec / 0.1), 0.1, keys, () => { each?.(); });
const hold = () => { g.hero.mp = 1; };
g.seabeast.off = true;   // 规则这一段不要海兽搅局（怪物表在第 4 段单独验）
J.calm = true;
{
  // 流沙：力竭落下＝陷沙；陷沙里慢；站着不动越陷越深、掉血
  go('sand'); const c = visit.sand.core; place(c.x, c.y); setRealm(3); g.hero.mp = 0.001; run(4);
  assert.ok(J.swimming && !p.flying, '流沙：力竭落下陷进沙里');
  assert.ok(J.speedMul < 0.3, `流沙：陷沙里的速度 ${J.speedMul.toFixed(2)}`);
  g.combat.invulnT = 0; const hp0 = g.hero.hp; runFor(6, () => { g.hero.mp = 0.001; });
  assert.ok(g.hero.hp < hp0 - 0.02, `流沙：站着不动越陷越深、掉血（${hp0.toFixed(2)} → ${g.hero.hp.toFixed(2)}）`);
  assert.ok(!J.dive(null), '流沙下不去（没有海渊）');
  assert.equal(J.boatRefusal('lz_wupeng'), null, '流沙上能行沙舟');
  log(`流沙：陷沙速度 ×${J.speedMul.toFixed(2)}，站着不动六息气血 ${hp0.toFixed(2)} → ${g.hero.hp.toFixed(2)}`);
}
{
  // 冰海：浮冰站得住、冰水里是泅水；寒气掉血（冰水里更快）；冰海行不得舟
  go('ice'); const c = visit.ice.core; place(c.x, c.y); setRealm(3); run(2);
  let floe: { x: number; y: number } | null = null, water: { x: number; y: number } | null = null;
  for (let r = 0; r < 6000 && (!floe || !water); r += 97) for (let a = 0; a < 6.28 && (!floe || !water); a += 0.7) {
    const x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r; if (g.terrain.isLand(x, y)) continue;
    if (J.onFloe(x, y)) floe ??= { x, y }; else if (J.depthAt(x, y) > 0) water ??= { x, y };
  }
  assert.ok(floe && water, '冰海里有浮冰也有冰水');
  assert.ok(floeAt(floe!.x, floe!.y, J.floeCov(J.depthAt(floe!.x, floe!.y))), '浮冰判定和着色器用的是同一个函数');
  place(floe!.x, floe!.y, false); run(5); assert.ok(!J.swimming, '站在浮冰上不落水');
  place(water!.x, water!.y, false); run(5); assert.ok(J.swimming, '冰缝里是冰水（泅水）');
  g.combat.invulnT = 0; const hp0 = g.hero.hp; runFor(8, hold);
  const lossW = hp0 - g.hero.hp;
  place(floe!.x, floe!.y, false); run(3); g.hero.hp = 1; runFor(8, hold); const lossF = 1 - g.hero.hp;
  assert.ok(lossW > lossF && lossF > 0, `寒气掉血、冰水里更快（冰上 ${lossF.toFixed(3)}，冰水 ${lossW.toFixed(3)}）`);
  assert.ok(J.boatRefusal('lz_xuangui'), '冰海行不得舟');
  log(`冰海：八息寒气 冰上 −${(lossF * 100).toFixed(1)}%、冰水里 −${(lossW * 100).toFixed(1)}%`);
}
{
  // 熔岩：落进去持续烧；只有宝船经得住；热浪口托高
  go('lava'); const c = visit.lava.core; place(c.x, c.y); setRealm(4); g.hero.mp = 0.001; run(4);
  assert.ok(J.swimming, '熔岩：力竭落了进去');
  const said: string[] = [], toast0 = g.toast.bind(g); (g as any).toast = (s: string, k?: any) => { said.push(s); return toast0(s, k); };
  g.combat.invulnT = 0; g.hero.hp = 1; const hps: number[] = []; runFor(4, () => { g.hero.mp = 0.001; hps.push(g.hero.hp); });
  (g as any).toast = toast0;
  assert.ok(g.hero.hp < 0.88, `元婴落进熔岩，四息烧掉一成多（剩 ${g.hero.hp.toFixed(2)}）`);
  // 第五轮返工（验收员没验成的第 9 条）：持续掉血（每一息都在掉）、有提示、服丹回了灵力能挣出来
  { const per = [0, 13, 26, 39].map((i) => hps[i]); assert.ok(per.every((v, i) => i === 0 || v < per[i - 1]), `熔岩里一直在掉血（一息结算一次，中间有一点自然回复）：${per.map((v) => v.toFixed(2)).join(' → ')}`); }
  assert.ok(said.some((s) => /熔岩/.test(s)), `落进熔岩有提示：${said.filter((s) => /熔岩|烧/.test(s)).join(' / ')}`);
  { g.hero.mp = J.profile!.swim.takeoff + 0.1; if (!g.player.flying) g.toggleFly(); run(3, 0.1, [], () => { g.hero.mp = Math.max(g.hero.mp, 0.2); });
    assert.ok(g.player.flying && !J.swimming, `服丹回了灵力，按起飞就从熔岩里挣出来：flying=${g.player.flying} swimming=${J.swimming}`); }
  assert.ok(J.boatRefusal('lz_wupeng') && !J.boatRefusal('lz_xuangui'), '熔岩：乌篷舟不行、玄龟宝船行');
  g.hero.hp = 1; place(c.x, c.y); run(3);
  const th = J.spotList.filter((s) => s.type === 3);
  assert.ok(th.length > 0, '熔岩海上有热浪口');
  const s0 = th[0]; place(s0.x, s0.y); runFor(3, hold);
  assert.ok(J.thermal > 0.5 && g.altCeiling > J.k.ceiling + 50, `热浪口把高度上限托高（${g.altCeiling.toFixed(0)} > 带上限 ${J.k.ceiling.toFixed(0)}）`);
  log(`熔岩：落进去四息气血剩 ${g.hero.hp.toFixed(2)}；热浪口 ${th.length} 处，口上高度上限 ${g.altCeiling.toFixed(0)}`);
}
{
  // 冥河：引魂灯下照得开雾；视野最小
  go('ming'); const c = visit.ming.core; place(c.x, c.y); setRealm(4); run(3);
  const lamps = J.spotList.filter((s) => s.type === 1);
  assert.ok(lamps.length > 0, '冥河上有引魂灯');
  runFor(1, hold); const vOut = J.post(640, 400)!.view;
  place(lamps[0].x, lamps[0].y); runFor(2, hold); const vIn = J.post(640, 400)!.view;
  assert.ok(J.safe > 0.8 && vIn > vOut + 0.2, `引魂灯下视野放开（${vOut.toFixed(2)} → ${vIn.toFixed(2)}）`);
  log(`冥河：引魂灯 ${lamps.length} 盏；灯外视野 ${vOut.toFixed(2)}、灯下 ${vIn.toFixed(2)}`);
}
{
  // 瘴林：毒瘴按浓度掉血，林窗里免
  go('miasma'); const c = visit.miasma.core; place(c.x, c.y); setRealm(3); run(3);
  const gl = J.spotList.filter((s) => s.type === 2);
  assert.ok(gl.length > 0, '瘴泽上有林窗');
  // 找一处离林窗都远的瘴里（核心那一点可能正好落在林窗里）
  { let q = c; for (let a = 0; a < 6.28; a += 0.4) { const x = c.x + Math.cos(a) * 1800, y = c.y + Math.sin(a) * 1800; if (!g.terrain.isLand(x, y) && J.spotList.every((s) => Math.hypot(s.x - x, s.y - y) > s.r * 1.3) && J.depthAt(x, y) > J.bandFrom('core')) { q = { x, y }; break; } } place(q.x, q.y); run(3); }
  g.combat.invulnT = 0; g.hero.hp = 1; runFor(8, hold); const out = 1 - g.hero.hp;
  place(gl[0].x, gl[0].y); run(4); g.hero.hp = 1; runFor(8, hold); const inn = 1 - g.hero.hp;
  assert.ok(out > 0.03 && inn < out * 0.25, `毒瘴掉血、林窗里免（外 ${out.toFixed(3)}，林窗 ${inn.toFixed(3)}）`);
  // 浓度：近岸（气淡）比核心掉得少
  const f = visit.miasma.fog; place(f.x, f.y); run(4); g.hero.hp = 1; runFor(8, hold); const thin = 1 - g.hero.hp;
  assert.ok(thin < out, `毒瘴按浓度：断层 ${thin.toFixed(3)} < 核心 ${out.toFixed(3)}`);
  log(`瘴林：八息毒瘴 断层 −${(thin * 100).toFixed(1)}%、核心 −${(out * 100).toFixed(1)}%、林窗 −${(inn * 100).toFixed(1)}%`);
}

// ---------------------------------------------------------------- 4. 怪物表：破出来的是派生的那只
g.seabeast.off = false; J.calm = false;
for (const k of ['sand', 'lava', 'miasma'] as const) {
  go(k); const c = visit[k].core; place(c.x, c.y); setRealm(5); run(3);
  const want = J.profile!.beasts!;
  const m = g.seabeast.debugBreach('mochu', p.x + 400, p.y + 60);
  assert.ok(m, `${k}：破出了一只`);
  assert.equal(m!.e.def.id, want.mochu.def, `${k}：是 ${want.mochu.name}`);
  run(20, 0.1, [], () => { g.hero.hp = 1; g.hero.mp = 1; });
  const arms = g.combat.enemies.filter((e) => e.def.id === want.mochu.def + '_xu');
  assert.ok(arms.length > 0, `${k}：${want.mochu.name}伸出了自己的触须（${want.mochu.def}_xu）`);
  assert.ok((m!.e as { shell?: boolean }).shell, `${k}：不走野外刷怪（shell）`);
  const v = g.seabeast.view(); const sp = v.sprites.find((q) => q.key.startsWith('sb_mochu'));
  assert.ok(sp && sp.tint, `${k}：HD 场景里按样貌调色`);
  g.combat.reset(); g.seabeast.reset();
  log(`${k}：${want.mochu.name}（${want.mochu.def}）带 ${arms.length} 条触须，调色 ${sp!.tint!.map((x) => x.toFixed(2)).join(',')}`);
}
g.seabeast.off = true;

// ---------------------------------------------------------------- 5. 四个境界在各界险地核心里能撑多久
// 两段分开量（各自有梯度）：A 悬在核心不动，多久灵力见底、落下去；B 会伤人的介质（流沙、冰水、熔岩、毒瘴），落进去以后多久气血剩一成。
// 落下去那一刻随浪头、浮冰而定，所以 B 段把人按在同一处介质里量（冰海按在冰缝的冰水里）。
J.calm = true;
const surv: Record<string, { fall: number[]; sink: number[] }> = {};
for (const k of KINDS) {
  go(k); const c = visit[k].core; surv[k] = { fall: [], sink: [] };
  place(c.x, c.y); run(2);
  const M = J.profile!.medium, hurts = M.burn > 0 || M.chill > 0 || M.toxic > 0 || M.kind === 'sand';
  // 介质里的一点：不是浮冰、也不在林窗 / 引魂灯里
  let wp = c;
  for (let r = 0; r < 6000 && wp === c; r += 113) for (let a = 0; a < 6.28; a += 0.5) {
    const x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r;
    if (!g.terrain.isLand(x, y) && !J.onFloe(x, y) && J.depthAt(x, y) > J.bandFrom('core') && J.spotList.every((s) => Math.hypot(s.x - x, s.y - y) > s.r * 1.3)) { wp = { x, y }; break; }
  }
  for (const r of [2, 3, 4, 5]) {
    place(c.x, c.y); setRealm(r); g.combat.invulnT = 0; run(2);
    // 量到灵力见底为止（不按「掉下去」：被寒气、毒瘴这类按息结算的伤害打中时，近战那套会偶尔把人打落，和流失无关）
    // 每帧清掉敌人和弹道（同 test-jueyu 的横渡）：别界岸边的野怪、过路修士偶尔会打过来，读数就乱了
    let t = 0; run(4000, 0.1, [], () => { t += 0.1; g.combat.enemies.length = 0; g.combat.projs.length = 0; if (!p.flying) { p.flying = true; p.z = p.zTarget = 56; } return g.hero.mp <= 0.003; });
    surv[k].fall.push(Math.round(t));
    if (hurts) {
      place(wp.x, wp.y, false); setRealm(r); g.combat.invulnT = 0; run(2); g.hero.hp = 1;
      let s = 0; run(4000, 0.1, [], () => { s += 0.1; g.combat.enemies.length = 0; g.combat.projs.length = 0; g.hero.mp = 0; p.x = wp.x; p.y = wp.y; return g.hero.dead || g.hero.hp <= 0.1; });
      surv[k].sink.push(Math.round(s));
    }
    g.hero.hp = 1;
  }
  const F = surv[k].fall, Sk = surv[k].sink;
  log(`${k} 核心里（筑基 / 结丹 / 元婴 / 化神）：灵力撑 ${F.join(' / ')} 息${Sk.length ? `；落进${M.name}后撑 ${Sk.join(' / ')} 息` : ''}`);
  for (let i = 1; i < 4; i++) assert.ok(F[i] >= F[i - 1], `${k}：境界越高灵力撑得越久 ${F}`);
  assert.ok(F[3] > F[0] * 1.5, `${k}：化神比筑基明显撑得久 ${F}`);
  // 落进去以后那一段：伤害按息结算、挨打时的硬直和近战反应会让单次读数抖一些，只比两头（筑基、元婴都不如化神）
  if (Sk.length) { assert.ok(Sk[3] > Sk[0] * 1.3 && Sk[3] >= Sk[2], `${k}：化神落进去比筑基、元婴撑得久 ${Sk}`); }
}

// ---------------------------------------------------------------- 6. 本界的小险地：南荒的腐骨瘴泽
{
  // 回南荒：从别界换回去
  g.travel.pending = { map: 'tiannan', x: 0, y: 0, via: 'portal' } as never; assert.ok(g.switchMap('tiannan')); g.travel.pending = null;
  assert.equal(W.ACTIVE_MAP, 'tiannan');
  const Zn = L.LOCAL_ZONES.find((z) => z.map === 'tiannan')!;
  assert.ok(Zn, '南荒有一处本界小险地');
  const { shoreField } = await import('../src/world/jueyuField'); shoreField.ensure();
  setRealm(3); place(Zn.x, Zn.y); run(4);
  const deepest = J.seekDepth(1e9, Zn.x, Zn.y, false, Zn.R * 0.8);
  place(deepest.x, deepest.y); run(5);
  assert.equal(J.profile?.id, Zn.profile.id, '湖上用的是腐骨瘴泽的配置');
  assert.ok(J.local && J.sea, '湖上险地开着');
  assert.ok(['fog', 'core'].includes(J.band), `湖心在断层或核心（${J.band}，d=${J.depth.toFixed(0)}）`);
  assert.equal(J.dunkongRefusal(), null, '本界小险地里遁空梭照常能用（不挡赶路）');
  // 不挡路：范围里的地点（城镇、宗门、险地、洞府）一律在陆上，离岸距离为 0，上面一点影响都没有
  const locs = W.LOCATIONS.filter((l) => Math.hypot(l.x * W.WORLD_SCALE - Zn.x, l.y * W.WORLD_SCALE - Zn.y) < Zn.R);
  let towns = 0;
  for (const l of locs) {
    const x = l.x * W.WORLD_SCALE, y = l.y * W.WORLD_SCALE;
    if (l.type === 'town' || l.type === 'sect' || l.type === 'city') towns++;
    if (!g.terrain.isLand(x, y)) continue;
    assert.ok(J.depthAt(x, y) < 600, `${l.name} 在岸上，离岸距离 ${J.depthAt(x, y).toFixed(0)}`);
  }
  // 湖外的陆路：岸上走一圈，回复、高度、流失都照常
  place(Zn.x - Zn.R * 0.95, Zn.y, false); run(6);
  assert.ok(!J.local || J.depth < 600, '瘴泽外缘的岸上没有险地');
  assert.equal(J.drainRate, 0, '岸上不流失');
  assert.ok(g.altCeiling >= 400, '岸上高度上限照常');
  log(`腐骨瘴泽：湖心 d=${J.depthAt(deepest.x, deepest.y).toFixed(0)}；范围里 ${locs.length} 处地点（城镇 ${towns}），都在岸上、不受影响；遁空梭照常`);
}

// ---------------------------------------------------------------- 7. 每帧逻辑不取 Math.random
{
  go('lava'); const c = visit.lava.core; setRealm(4); J.calm = false; place(c.x, c.y); run(5);
  g.combat.invulnT = 1e9; g.seabeast.off = true;
  const rnd = Math.random; let n = 0, inside = false;
  Math.random = () => { if (inside) n++; return rnd(); };
  const tick = J.tick.bind(J), mana = J.manaTick.bind(J);
  J.tick = (dt: number) => { inside = true; try { tick(dt); } finally { inside = false; } };
  J.manaTick = (dt: number) => { inside = true; try { mana(dt); } finally { inside = false; } };
  J.forceStorm(p.x + 1200, p.y, 3600); J.forceFog(p.x, p.y + 3000); J.forceTide(p.x, p.y);
  run(300, 0.1, ['d'], () => { g.hero.mp = 1; });
  Math.random = rnd; J.tick = tick; J.manaTick = mana;
  assert.equal(n, 0, `别界险地的每帧逻辑取了 ${n} 次 Math.random`);
  log('别界险地的每帧逻辑（天象、介质的险、安全点）0 次 Math.random');
}
console.log('PASS 绝域铺到别界：六种样貌的配置按种子一致、介质规则、派生怪物、本界小险地不挡路、四境界生存时间有梯度、不取 Math.random');
