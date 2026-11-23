// 无边海的海兽生态（收官 B2）：黑影按大陆坐标两张图一致；有气味才聚拢、近了才破水；破水不走刷怪路径、不触发模组 spawn 钩子、
// 不多取已有路径的 Math.random；杀五阶海兽后三十息内蛟来、飞远了甩掉；触须缠住人、斩断后挣脱；鲸背能落脚、站上去跟着动、
// 打坐回灵（核心区也回）、下潜前示警、下潜后落水；泅水越久聚得越多；海兽脱战潜回；贴图登记的每个状态不超过两帧。
// 用真实的 Game 无界面地跑：npx tsx tools/test-seabeast.ts
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const W = await import('../src/data/world');
const G = await import('../src/world/game');
const { shoreField } = await import('../src/world/jueyuField');
const { ENEMIES } = await import('../src/data/enemies');
const { BEAST_SPR } = await import('../src/gfx/beastTex');
const { BLOOD_T, BLOOD_LOSE } = await import('../src/world/seabeast');
assert.equal(W.ACTIVE_MAP, 'tiannan');
const g = await G.createGame(() => {});
g.reset();
shoreField.ensure();
const p = g.player, J = g.jueyu, S = g.seabeast, c = g.combat;
const log = (s: string) => console.log('  ' + s);
const setRealm = (r: number) => { g.hero.realm = r; g.hero.stage = 0; g.hero.exp = 0; g.hero.hp = 1; g.hero.mp = 1; };
/** 先回到南荒（骑着鲸、追着海兽可能飘过了中线，被换到沧溟海） */
const home = () => { if (W.ACTIVE_MAP !== 'tiannan') (g as any).crossSeam(W.MAP_SEAMS.luanxing!.find((s) => s.sea)!); };
const place = (x: number, y: number, fly = true) => { home(); g.teleport(x, y); p.flying = fly; p.z = p.zTarget = fly ? 56 : 0; c.reset(); J.reset(); if (g.modal) g.closeModal(true); };
/** 跑若干帧（每帧 0.1 秒）；each 返回 true 就停 */
const run = (frames: number, each?: (n: number) => boolean | void, keys: string[] = []) => {
  let n = 0;
  for (; n < frames; n++) {
    if (g.modal) g.closeModal(true); g.paused = false;
    g.input.keys.clear(); for (const k of keys) g.input.keys.add(k);
    g.update(0.1);
    if (each?.(n)) { n++; break; }
  }
  g.input.keys.clear();
  return n;
};
J.calm = true;   // 天象另有 test-jueyu 验；这里只看海兽
const CORE = { x: 668000, y: 150000 };   // 南荒这一侧（海峡中线在 675808，过了中线会自动换到沧溟海）

// ---------------------------------------------------------------- 1. 贴图登记：每个状态最多两帧，五种都有待机、攻击、受击、死亡
{
  for (const id of ['sb_guichi', 'sb_mochu', 'sb_liehai', 'sb_chuanling', 'sb_leiyao']) {
    assert.ok(ENEMIES[id]?.lair && ENEMIES[id].zone === 'sea', `${id} 是 lair 的海兽（不进普通刷怪池）`);
    const d = BEAST_SPR['e:' + id]; assert.ok(d?.anim, `${id} 登记了按状态切帧`);
    for (const st of ['idle', 'attack', 'hit', 'dead'] as const) {
      const fr = d.anim![st]; assert.ok(fr && fr.length >= 1 && fr.length <= 2, `${id} 的 ${st} 有一到两帧：${fr?.length}`);
      for (const k of fr) assert.ok(BEAST_SPR[k], `${id} 的帧 ${k} 登记了`);
    }
  }
  log('五种海兽：待机 / 攻击各两帧，受击 / 死亡各一帧（每状态不超过两帧）');
}

// ---------------------------------------------------------------- 2. 黑影：按大陆坐标生成，两张图看到的是同一批
{
  setRealm(4);
  place(674500, CORE.y);   // 中线（675808）西边一点，仍在南荒
  run(8);
  const a = S.shadesHome().filter((s) => s.id >= 0).sort((u, v) => u.id - v.id);
  assert.ok(a.length >= 3, `核心海域四周有黑影：${a.length}`);
  const t0 = g.time;
  // 换到沧溟海那一侧（同一个大陆坐标，只是本图坐标差一个平移）
  const seam = W.MAP_SEAMS.tiannan!.find((s) => s.sea)!;
  (g as any).crossSeam(seam);
  assert.equal(W.ACTIVE_MAP, 'luanxing');
  // 不跑帧（在沧溟海这一侧、中线以西，一跑就会自动换回南荒）：直接按此刻的时间把黑影摆出来
  g.time = t0; S.reset();
  (S as any).populate();
  const b = S.shadesHome().filter((s) => s.id >= 0).sort((u, v) => u.id - v.id);
  const common = a.filter((s) => b.some((q) => q.id === s.id));
  assert.ok(common.length >= 3, `两张图生成同样的黑影：${common.length}/${a.length}`);
  for (const s of common) { const q = b.find((x) => x.id === s.id)!; assert.ok(Math.hypot(q.cx - s.cx, q.cy - s.cy) < 120, `黑影 ${s.id} 两图位置一致：${(Math.hypot(q.cx - s.cx, q.cy - s.cy)).toFixed(0)}`); assert.equal(q.sp, s.sp); }
  log(`黑影按大陆坐标：两图 ${common.length} 条逐一对上（种类、位置）`);
  // 回南荒
  const back = W.MAP_SEAMS.luanxing!.find((s) => s.sea)!;
  (g as any).crossSeam(back);
  assert.equal(W.ACTIVE_MAP, 'tiannan');
}

// ---------------------------------------------------------------- 3. 没有气味只打转不破水；有气味才聚拢、近了才破水；破水不走刷怪路径、不触发 spawn 钩子、不多取别处的 Math.random
{
  setRealm(4);
  place(CORE.x, CORE.y); run(5);
  S.shades.length = 0;
  const sh = S.debugShade('mochu', p.x + 2700, p.y + 200);   // 离得远一点：不会过来打转
  c.invulnT = 1e9;
  run(150);   // 15 息，没有气味
  assert.equal(S.debug.mobs, 0, `没有气味不破水：${JSON.stringify(S.debug.kinds)}`);
  // 一股血腥味（在人旁边杀一头普通海兽）
  let rolls = 0, ticks = 0; const rb = c.rollBeast.bind(c), st = (c as any).spawnTick.bind(c);
  c.rollBeast = (...a: Parameters<typeof rb>) => { rolls++; return rb(...a); };
  let tickRnd = 0; (c as any).spawnTick = () => { const r0 = Math.random; Math.random = () => { tickRnd++; return r0(); }; try { ticks++; return st(); } finally { Math.random = r0; } };
  const victim = c.debugSpawn('wohu', p.x + 200, p.y)!;
  c.hitEnemy(victim, victim.maxHp * 10, { realm: 9, stCh: 0 }, p.x, p.y);
  assert.ok(victim.dead && S.debug.scents === 0, '击杀');
  let breachAt = -1, seekAt = -1, riseAt = -1, dSeek = 0, dRise = 0;
  // 数 Math.random：只数海兽这一帧的逻辑
  const rnd = Math.random; let nr = 0, inside = false;
  Math.random = () => { if (inside) nr++; return rnd(); };
  const tk = S.tick.bind(S); S.tick = (dt: number) => { inside = true; try { tk(dt); } finally { inside = false; } };
  const vx = victim.x, vy = victim.y;
  run(260, (n) => {
    const d = Math.hypot(sh.cx - vx, sh.cy - vy);
    if (seekAt < 0 && sh.mood === 'seek') { seekAt = n; dSeek = d; }
    if (riseAt < 0 && sh.mood === 'rise') { riseAt = n; dRise = d; }
    if (breachAt < 0 && S.debug.mobs > 0) breachAt = n;
    return riseAt >= 0 && S.debug.kinds.includes('mochu');
  });
  S.tick = tk; Math.random = rnd;
  assert.ok(S.debug.scents >= 1 && seekAt >= 0, `血腥味引来黑影：seek@${seekAt}`);
  assert.ok(dSeek > 1500 && riseAt > seekAt && dRise < 1000, `聚到近处才破水：起追时离血迹 ${dSeek.toFixed(0)}，${(riseAt / 10).toFixed(1)} 息时游到 ${dRise.toFixed(0)} 才鼓包`);
  assert.ok(S.debug.kinds.includes('mochu'), `远处那条黑影（海魔）也破水了：${S.debug.kinds}`);
  assert.ok(S.debug.kinds.length > 0, `破水出来了：${S.debug.kinds}`);
  assert.equal(rolls, 0, '破水不走 rollBeast（模组的 spawn 钩子只在那里触发）');
  assert.equal(nr, 0, `海兽每帧的逻辑（含破水造 Enemy）0 次 Math.random：${nr}`);
  assert.ok(ticks > 0 && tickRnd === 0 && !c.enemies.some((e) => !e.def.id.startsWith('sb_') && e !== victim), `迷雾断层往里普通刷怪停掉：spawnTick 叫了 ${ticks} 次，都在取随机数前返回（取了 ${tickRnd} 次）`);
  c.rollBeast = rb; (c as any).spawnTick = st;
  const k0 = c.enemies.find((e) => e.def.id.startsWith('sb_'))!;
  assert.ok(k0 && (k0 as any).shell, '破水出来的是真正的 Enemy（交给海兽自己的 AI）');
  log(`有气味才聚拢（离血迹 ${dSeek.toFixed(0)} 处起追），游到 ${dRise.toFixed(0)} 才鼓包破水（${(riseAt / 10).toFixed(1)} 息；最先破水的在 ${(breachAt / 10).toFixed(1)} 息），没走刷怪路径、0 次 Math.random`);
}

// ---------------------------------------------------------------- 4. 触须：有血量、能锁定；缠住人（定身），斩断 / 打掉一截就挣脱
{
  S.reset(); c.reset(); run(2);
  S.debugBreach('mochu', p.x + 380, p.y + 120);
  run(20, () => { g.hero.hp = 1; });
  const k = c.enemies.find((e) => e.def.id === 'sb_mochu')!;
  const arms = S.armsOf(k);
  assert.ok(arms.length >= 4 && arms.length <= 6, `四到六条触须：${arms.length}`);
  assert.ok(arms.every((a) => c.enemies.includes(a.e) && a.e.maxHp > 0), '每条触须都是有血量的子单位（在敌人名单里，能锁定、能打）');
  assert.ok(arms.every((a) => (a.e as any).sbArm) && !(k as any).sbArm, '第五轮返工：触须都标了 sbArm（drawCombatUI 不给它们出名牌，只在锁定的那条上画血条），本体照常一个名牌');
  c.invulnT = 0; g.hero.hp = 1;
  p.flying = true; p.z = p.zTarget = 56;
  // 让一条去缠
  const a = arms[0] as any; for (const o of arms as any[]) o.cd = 99;
  run(15);
  a.st = 'grab'; a.t = 0; a.cd = 0;
  let held = -1; run(60, (n) => { g.hero.hp = 1; if (S.hud.held) { held = n; return true; } });
  assert.ok(held >= 0, `触须缠住了人：${a.st}`);
  run(5, () => { g.hero.hp = 1; });
  assert.ok(c.pst.root && !c.canMove, '被缠住：定身');
  { p.z = p.zTarget = 300; c.lock = a.e; const z0 = p.z; run(10, () => { g.hero.hp = 1; }); assert.ok(p.z < z0 - 60 || !p.flying, `第五轮返工：缠住了真往下拖（原来被悬停高度、锁定跟高拉回去）：${z0} → ${Math.round(p.z)}`); c.lock = null; }
  // 斩它一截：挣脱
  c.hitEnemy(a.e, a.e.maxHp * 0.3, { realm: a.e.realm, stCh: 0 }, p.x, p.y);
  assert.ok(!a.e.dead, '只打掉一截（没斩断）');
  run(3, () => { g.hero.hp = 1; });
  assert.ok(!S.hud.held && a.st !== 'hold', `打掉一截就挣脱：${a.st}`);
  // 再缠一次，这回挣扎（按方向键）
  run(30, () => { g.hero.hp = 1; });
  a.st = 'grab'; a.t = 0;
  run(60, () => { g.hero.hp = 1; return !!S.hud.held; });
  assert.ok(S.hud.held, '又缠住了');
  run(40, () => { g.hero.hp = 1; return !S.hud.held; }, ['a']);
  assert.ok(!S.hud.held, '拼命挣扎（方向键）也能挣脱');
  // 斩掉大半：本体露出弱点（护体撤掉）
  assert.ok(k.guardT > 0, '触须都在：本体有护体');
  for (const o of arms.slice(0, Math.ceil(arms.length / 2) + 0)) c.hitEnemy(o.e, o.e.maxHp * 50, { realm: 9, stCh: 0 }, p.x, p.y);
  run(5, () => { g.hero.hp = 1; });
  assert.ok(k.guardT <= 0 && S.mobOf(k)?.exposed, `斩掉大半露出弱点：guard=${k.guardT}`);
  log(`触须 ${arms.length} 条：缠住定身、斩一截挣脱、挣扎挣脱；斩掉大半后本体露出弱点`);
}

// ---------------------------------------------------------------- 5. 海兽脱战：人飞远了，潜回水下变回黑影
{
  const before = S.debug.mobs;
  assert.ok(before > 0);
  // 往西飞远（四千外）；不挨打、身边没有新的血腥味（只看「人走了，它们潜回去」）
  c.invulnT = 1e9; S.scents.length = 0;
  g.teleport(p.x - 4200, p.y); p.flying = true;
  run(120, () => { g.hero.hp = 1; S.scents.length = 0; return S.debug.mobs === 0; }, ['a']);
  assert.equal(S.debug.mobs, 0, `人离远了，海兽潜回水下：${S.debug.kinds}`);
  assert.ok(!c.enemies.some((e) => e.def.id.startsWith('sb_')), '名单里的海兽（连触须）都拿掉了');
  assert.ok(S.shadesHome().some((s) => s.sp === 'mochu'), '变回了黑影');
  log('人飞远，海魔连触须潜回水下，变回黑影');
}

// ---------------------------------------------------------------- 6. 血腥连锁：杀五阶海兽，三十息内蛟来；飞远了甩掉
{
  setRealm(5);
  place(CORE.x, CORE.y + 20000); run(5);
  c.invulnT = 1e9;
  const fish = S.debugBreach('guichi', p.x + 300, p.y)!;
  assert.ok(fish && fish.e.blv >= 5, '一群鬼齿凶鱼（五阶以上）');
  run(10);
  c.hitEnemy(fish.e, fish.e.maxHp * 50, { realm: 9, stCh: 0 }, p.x, p.y);
  run(2);
  assert.ok(S.debug.chain, '杀了五阶海兽：血腥连锁开始');
  assert.ok(S.hud.blood > 0.9, '界面上有逐渐收紧的警示');
  let jiaoAt = -1;
  run(BLOOD_T * 10 + 30, (n) => { g.hero.hp = 1; if (S.debug.kinds.includes('liehai')) { jiaoAt = n; return true; } });
  assert.ok(jiaoAt > 0 && jiaoAt <= BLOOD_T * 10 + 5, `三十息内裂海玄蛟破水：${(jiaoAt / 10).toFixed(1)} 息`);
  const jiao = c.enemies.find((e) => e.def.id === 'sb_liehai')!;
  assert.ok(jiao.realm === 4, '蛟是元婴战力（八阶）');
  // 甩掉：新起一波，往远处飞
  S.reset(); c.reset(); run(2);
  S.forceChain(BLOOD_T);
  g.teleport(p.x - BLOOD_LOSE - 800, p.y); p.flying = true;
  run(20);
  assert.ok(!S.debug.chain, '飞离血迹够远：甩掉了');
  run(BLOOD_T * 10, () => { g.hero.hp = 1; });
  assert.ok(!S.debug.kinds.includes('liehai'), '甩掉以后蛟没来');
  log(`杀鬼齿凶鱼 → ${(jiaoAt / 10).toFixed(1)} 息后裂海玄蛟破水；另一波飞出 ${BLOOD_LOSE + 800} 外甩掉`);
}

// ---------------------------------------------------------------- 7. 覆海玄鲸：能落脚、跟着动、打坐回灵（核心区也回）、下潜前示警、下潜后落水
{
  setRealm(3);
  S.reset(); c.reset();
  // 拨鲸的时钟：此刻刚浮起不久
  const ph = ((g.time + 37) % 300 + 300) % 300; S.whaleShift = 20 - ph;
  const q = S.whaleAt(g.time);
  assert.equal(q.st, 'up', '鲸浮着');
  place(q.cx, q.cy); run(2);
  assert.ok(J.depth > 34000, `鲸在核心海域巡游：离岸 ${J.depth.toFixed(0)}`);
  assert.ok(J.footholdAt(p.x, p.y), '鲸背能落脚');
  g.toggleFly(); run(3);
  assert.ok(!p.flying && !J.swimming, '落在鲸背上（不是泅水）');
  // 跟着动
  const w0 = S.whaleAt(g.time), rel0 = [p.x - (w0.cx), p.y - (w0.cy)];
  run(50);
  const w1 = S.whaleAt(g.time), moved = Math.hypot(w1.cx - w0.cx, w1.cy - w0.cy), rel1 = [p.x - w1.cx, p.y - w1.cy];
  assert.ok(moved > 300, `鲸在游：${moved.toFixed(0)}`);
  assert.ok(Math.hypot(rel1[0] - rel0[0], rel1[1] - rel0[1]) < 60, `站在背上跟着鲸一起动：偏了 ${Math.hypot(rel1[0] - rel0[0], rel1[1] - rel0[1]).toFixed(0)}`);
  assert.ok(!J.swimming && S.sanctuary, '一直站得住');
  // 在背上走两步
  const x0 = p.x - w1.cx; run(10, undefined, ['d']); const w2 = S.whaleAt(g.time);
  assert.ok(Math.abs((p.x - w2.cx) - x0) > 30 && !J.swimming, '能在背上走');
  // 打坐回灵：核心区也回
  g.hero.mp = 0.2; g.toggleSit(); run(30);
  assert.ok(p.sitting, '能打坐');
  assert.ok(g.hero.mp > 0.2 + 0.03, `鲸背上打坐回灵（核心区别处是流失）：${g.hero.mp.toFixed(3)}`);
  assert.ok(g.placeBonus().name === '鲸背灵脉', '地利：鲸背灵脉');
  const mpSit = g.hero.mp;
  g.stand();
  // 下潜：先示警，再落水
  const ph2 = ((g.time + S.whaleShift + 37) % 300 + 300) % 300; S.whaleShift += 198 - ph2;
  let warned = false, fell = -1;
  const toast0 = g.ui?.toasts?.length ?? 0;
  run(150, (n) => { g.hero.hp = 1; g.hero.mp = 0.05; if (S.hud.whaleWarn) warned = true; if (J.swimming) { fell = n; return true; } });
  assert.ok(warned, '下潜前示警');
  assert.ok(fell > 0, '下潜以后还在背上的人落了水');
  void toast0;
  log(`覆海玄鲸：站上去 5 息跟着游了 ${moved.toFixed(0)}；核心区打坐三息回灵 20% → ${(mpSit * 100).toFixed(0)}%；示警后下潜，人落水`);
}

// ---------------------------------------------------------------- 8. 泅水越久，聚来的越多
{
  setRealm(3);
  S.reset(); c.reset();
  place(CORE.x, CORE.y - 30000);
  run(3);
  g.hero.mp = 0.001; (S as any).mp0 = -1; run(5);   // 收官 B3：测试里一下把法力拨到零，会被当成「放大招的灵力波动」引来一大片——这里不算
  assert.ok(J.swimming, '落水');
  c.invulnT = 1e9;
  const seek = (): number => S.debug.seeking + S.debug.mobs;
  let early = 0, late = 0, breaches = 0, lastMobs = 0;
  run(400, (n) => {
    g.hero.mp = 0.001; g.hero.hp = 1;
    if (S.debug.mobs > lastMobs) breaches++;
    lastMobs = S.debug.mobs;
    if (n === 100) early = seek();
    if (n === 399 || (late === 0 && !J.swimming)) late = seek();   // 收官 B3：被触须拖进海渊就不再是泅水了，按那一刻算
  });
  assert.ok(late > early, `泅水越久聚得越多：10 息时 ${early}，之后 ${late}`);
  assert.ok(breaches >= 1, `落水的人引来了破水：${breaches}`);
  log(`结丹落水：10 息时 ${early} 条围过来，40 息时 ${late} 条；破水 ${breaches} 次`);
}

// ---------------------------------------------------------------- 9. 船灵只在鬼雾里、雷鳐跟着飓风
{
  S.reset(); c.reset();
  place(CORE.x, CORE.y + 40000); run(3);
  c.invulnT = 1e9;
  run(30);
  assert.ok(!S.debug.kinds.includes('chuanling') && !S.debug.kinds.includes('leiyao'), '平常没有船灵、雷鳐');
  J.calm = false; J.forceFog(p.x, p.y, 5000, 2600);
  run(40);
  assert.ok(S.debug.kinds.includes('chuanling'), `鬼雾里出了船灵：${S.debug.kinds}`);
  const w = c.enemies.find((e) => e.def.id === 'sb_chuanling')!;
  const lamp = c.enemies.find((e) => e.def.id === 'sb_chuanling_deng')!;
  assert.ok(w && lamp, '船灵手里提着魂灯（灯是能打的子单位）');
  // 灯还亮着把它打散：会在雾的另一头重聚
  c.hitEnemy(w, w.maxHp * 50, { realm: 9, stCh: 0 }, p.x, p.y);
  const live = () => c.enemies.some((e) => e.def.id === 'sb_chuanling' && !e.dead);
  run(10); assert.ok(!live(), '打散了');
  let back = -1; run(200, (n) => { if (live()) { back = n; return true; } });
  assert.ok(back > 0, '灯没灭：打散了又重聚');
  const w2 = c.enemies.find((e) => e.def.id === 'sb_chuanling' && !e.dead)!;
  assert.ok(w2 && Math.hypot(w2.x - p.x, w2.y - p.y) > 1000, '在雾的另一处');
  S.reset(); c.reset(); J.reset(); J.calm = false;
  J.forceStorm(p.x + 1500, p.y, 3800);
  run(40);
  assert.ok(S.debug.kinds.includes('leiyao'), `飓风的雨带里来了雷鳐：${S.debug.kinds}`);
  // 第五轮返工（第 11 条）：雷鳐引雷俯冲——先在人脚下亮预警圈、再俯冲下来引雷砸到圈上
  { let marked = false, dived = 0, hit = false; const z0 = new Set<unknown>();
    run(160, () => { g.hero.mp = 1; c.invulnT = 0; const ray = (S as any).mobs.find((m: any) => m.kind === 'leiyao' && m.st === 'mark'); if (ray) { marked = true; dived = Math.max(dived, 230 - ray.e.flyH); }
      for (const z of (S as any).zaps) if (z.kind === 'ray') z0.add(z); if (g.hero.hp < 1 - 1e-6) hit = true; g.hero.hp = 1; return marked && hit && dived > 60; });
    assert.ok(marked && z0.size > 0, `雷鳐引雷：脚下亮了预警圈（${z0.size} 个）`);
    assert.ok(dived > 60, `雷鳐俯冲下来：飞行高度往下压了 ${Math.round(dived)}`);
    log(`雷鳐引雷俯冲：预警圈 ${z0.size} 个，俯冲压低 ${Math.round(dived)}${hit ? '，人挨了雷' : ''}`); }
  J.calm = true; J.reset();
  log(`鬼雾里出船灵（灯不灭，打散 ${((back + 10) / 10).toFixed(0)} 息后在雾的另一处重聚），飓风雨带里来雷鳐`);
}

// ---------------------------------------------------------------- 第五轮返工（验收员没验成的第 12 条）：空间裂缝对海兽同样扣血
{
  S.reset(); c.reset(); home();
  setRealm(4); J.calm = true;
  place(660000, 150000); run(5);
  S.debugBreach('guichi', p.x + 420, p.y);
  run(20, () => { g.hero.hp = 1; });
  const m = (S as any).mobs.find((q: any) => q.kind === 'guichi' && !q.e.dead); assert.ok(m, '破水出了一群鬼齿凶鱼');
  const e = m.e; e.hp = e.maxHp; const ex = p.x + 420, ey = p.y;
  J.forceRift(ex, ey, Math.PI / 2, 600, 0, 0.45);
  const h0 = e.hp;
  for (let i = 0; i < 18; i++) { g.hero.hp = 1; m.leap = undefined; m.st = 'swim'; e.x = ex; e.y = ey; e.lift = 0; g.update(0.1); }
  const lost = (h0 - e.hp) / e.maxHp;
  assert.ok(lost > 0.25 || e.dead, `裂缝撕过鬼齿凶鱼：${Math.round(h0)} → ${Math.round(e.hp)}（${(lost * 100).toFixed(0)}%）`);
  log(`空间裂缝对海兽同样扣血：鬼齿凶鱼气血 ${Math.round(h0)} → ${Math.round(Math.max(0, e.hp))}（扣了 ${(Math.min(1, lost) * 100).toFixed(0)}%${e.dead ? '，撕死了' : ''}）`);
}

// ---------------------------------------------------------------- 10. P7：飞过中线换图，灵宠、同行的人、同阵修士一起搬过去
{
  S.reset(); c.reset(); home();
  setRealm(4); J.calm = true;
  place(675500, 150000); run(3);
  g.ws.pets = [{ kind: 'wolf', name: '小灰', lv: 3, xp: 0, bond: 50, born: 0 }]; g.ws.petActive = 0;
  run(5);
  const pe = g.pets.ent!; assert.ok(pe, '灵宠跟在身边');
  const fid = ([...(g.npcs as any).byId.values()] as any[]).find((d) => d.alive && !d.hidden && !d.beauty)!.id as string;
  const fa = g.npcs.summon(fid)!; assert.ok(fa, '叫一个人同行');
  run(5);
  assert.ok(g.npcs.followers().some((a) => a.d.id === fid), `同行的人在身边：${JSON.stringify({ act: fa.act, alive: fa.d.alive, map: fa.d.map, hidden: (fa.d as any).hidden })}`);
  const relP = [pe.x - p.x, pe.y - p.y], relF = [fa.st.x - p.x, fa.st.y - p.y];
  // 往东飞过中线（675808）
  let crossed = false; run(60, () => { if (W.ACTIVE_MAP === 'luanxing') { crossed = true; return true; } }, ['d']);
  assert.ok(crossed, '飞过中线换到了沧溟海');
  const pe2 = g.pets.ent!, fa2 = g.npcs.followers().find((a) => a.d.id === fid), fd = (g.npcs as any).byId.get(fid), fact = (g.npcs as any).active.get(fid);
  if (!fa2) console.log('  同行的人：', JSON.stringify({ map: fd?.map, alive: fd?.alive, hidden: fd?.hidden, active: !!fact, act: fact?.act }));
  assert.ok(pe2 && Math.hypot(pe2.x - p.x - relP[0], pe2.y - p.y - relP[1]) < 400, `灵宠跟着过来了（没有被瞬移拽一下）：离人 ${Math.round(Math.hypot(pe2.x - p.x, pe2.y - p.y))}`);
  assert.ok(fa2 && Math.hypot(fa2.st.x - p.x, fa2.st.y - p.y) < 600, `同行的人跟着过来了：${fa2 ? Math.round(Math.hypot(fa2.st.x - p.x, fa2.st.y - p.y)) : '丢了'}`);
  run(10);
  assert.ok(g.npcs.followers().some((a) => a.d.id === fid), '换图后几帧还在身边（没有被当成别处的人删掉）');
  void relF;
  // 收官 B3：不再同行（遣散）：回原处——所在地图改回南荒，从沧溟海这边的活动名单里拿掉
  const fd0 = (g.npcs as any).byId.get(fid);
  assert.equal(fd0.map, 'luanxing', '同行时所在地图跟着改成了新图');
  g.npcs.dismiss(fid); run(25);
  assert.equal(fd0.map, 'tiannan', `遣散后回了原来的图：${fd0.map}`);
  assert.ok(!(g.npcs as any).active.has(fid), '从这边的活动名单里拿掉了（他回去了）');
  log('飞过中线换图：灵宠、同行的人一起搬过去，还在身边；遣散后同行的人回原来的图');
}

console.log('PASS 海兽生态：贴图帧数、两图一致的黑影、气味与破水、触须缠人与挣脱、脱战潜回、血腥连锁与甩脱、覆海玄鲸、泅水招来海兽、船灵与雷鳐；P7 宠物同伴跟着过交界');
process.exit(0);
