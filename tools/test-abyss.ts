// 收官 B3：万丈海渊——下潜上浮（泅水、贴海飞、船上）、水压与避水、闭气、遗迹按种子一致（两张图同一处）、守卫与首领与宝箱、
// 战斗线的 onSubmerge 接上（主角、敌人被砸进海里进水下层）、给战斗线的 jueyu.dive / underwater / isUnder、玄龟宝船整船下沉、
// 海渊的每帧逻辑不取 Math.random。用真实的 Game 无界面地跑：npx tsx tools/test-abyss.ts
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const W = await import('../src/data/world');
const G = await import('../src/world/game');
const C = await import('../src/world/cultivation');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const { shoreField } = await import('../src/world/jueyuField');
assert.equal(W.ACTIVE_MAP, 'tiannan');
const g = await G.createGame(() => {});
g.reset();
shoreField.ensure();
const p = g.player, J = g.jueyu, D = J.deep, S = g.seabeast, c = g.combat;
const log = (s: string) => console.log('  ' + s);
const setRealm = (r: number) => { g.hero.realm = r; g.hero.stage = 0; g.hero.exp = 0; g.hero.hp = 1; g.hero.mp = 1; };
/** 先回到南荒（追着遗迹、浮沉时可能飘过了中线，被换到沧溟海） */
const home = () => { if (W.ACTIVE_MAP !== 'tiannan') (g as any).crossSeam(W.MAP_SEAMS.luanxing!.find((s) => s.sea)!); };
const place = (x: number, y: number, fly = true) => { home(); g.teleport(x, y); p.flying = fly; p.z = p.zTarget = fly ? 56 : 0; c.reset(); J.reset(); if (g.modal) g.closeModal(true); };
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
J.calm = true; S.off = true;
const CORE = { x: 668000, y: 150000 };
const swimAt = (x: number, y: number) => { place(x, y, false); J.swimming = true; run(2); };

// ---------------------------------------------------------------- 1. 能不能潜：近岸不行，迷雾断层往里可以
{
  setRealm(4);
  let coast = 560000; for (let x = 520000; x <= W.WORLD_W; x += 250) if (g.terrain.isLand(x, 140000)) coast = x;
  assert.ok(!D.canDiveAt(coast + 600, 140000), '近岸潜不下去');
  assert.ok(D.canDiveAt(CORE.x, CORE.y), '核心海域能潜');
  assert.ok(D.canDiveAt(W.WORLD_W + 20000, 150000), '迷雾断层能潜');
  log('近岸不能潜；迷雾断层、核心海域能潜');
}

// ---------------------------------------------------------------- 2. 下潜、上浮（泅水时按住下降、上升）
{
  setRealm(4);
  swimAt(CORE.x, CORE.y);
  assert.ok(J.swimming && !D.active, '泅水');
  let inAt = -1; run(30, (n) => { if (D.active) { inAt = n; return true; } }, ['descend']);
  assert.ok(inAt >= 0, `按住下降：潜下去了（${(inAt / 10).toFixed(1)} 息）`);
  assert.ok(!J.swimming && !p.flying, '水下不是泅水、不是飞');
  run(30, undefined, ['descend']);
  const d1 = D.d;
  assert.ok(d1 > 400, `继续往下：${d1.toFixed(0)}`);
  assert.ok(D.k > 0.9, `画面过渡到水下：k=${D.k.toFixed(2)}`);
  assert.ok(J.sink > 30, '人浮在海底上方（立板抬高）');
  // 海底有底
  run(200, undefined, ['descend']);
  assert.ok(Math.abs(D.d - D.floor) < 5, `沉到海底就停：${D.d.toFixed(0)} / ${D.floor.toFixed(0)}`);
  assert.ok(D.floor > 1800 && D.floor < 3600, `核心海域的海底两三千：${D.floor}`);
  // 水下横着游：比泅水快、比走路慢
  const x0 = p.x; run(5, undefined, ['d']);   // 只量半息：新开局的剧情偶尔会把人挪走（和海渊无关）
  const v = (p.x - x0) / 0.5;
  assert.ok(v > 0 && v < g.speed, `水下移动变慢：${v.toFixed(0)} / ${g.speed.toFixed(0)}`);
  // 上浮
  g.hero.hp = 1; g.hero.mp = 1;
  let outAt = -1; run(200, (n) => { g.hero.hp = 1; g.hero.mp = 1; if (!D.active) { outAt = n; return true; } }, ['ascend']);
  assert.ok(outAt > 0 && J.swimming, `按住上升浮出水面，回到泅水（${(outAt / 10).toFixed(1)} 息）`);
  log(`泅水按住下降 ${(inAt / 10).toFixed(1)} 息入水；海底 ${D.floor.toFixed(0)}（${(D.floor * 3).toFixed(0)} 丈）；水下横游 ${v.toFixed(0)}/息；按住上升 ${(outAt / 10).toFixed(1)} 息浮出`);
}

// ---------------------------------------------------------------- 3. 贴着海面飞，按住下降一头扎进去；水下御不了器
{
  setRealm(4);
  place(CORE.x, CORE.y, true); run(10);
  let inAt = -1; run(60, (n) => { if (D.active) { inAt = n; return true; } }, ['descend']);
  assert.ok(inAt > 0 && !p.flying, `飞着按住下降，降到最低再按着就扎进海里（${(inAt / 10).toFixed(1)} 息）`);
  g.toggleFly(); run(1);
  assert.ok(!p.flying && D.active, '水下按御剑键：不让飞');
  log(`贴海飞按住下降 ${(inAt / 10).toFixed(1)} 息扎进海里；水下不能御器`);
}

// ---------------------------------------------------------------- 4. 水压与避水、闭气
{
  setRealm(4);
  const hpAt = (ward: string[], depth: number, secs: number) => {
    swimAt(CORE.x, CORE.y);
    for (const id of ['hy_bishuizhu', 'hy_dinghaizhu']) while (C.bagCount(g.hero, id) > 0) C.removeItem(g.hero, id, 1);
    for (const id of ward) C.addItem(g.hero, id, 1);
    D.debugDive(depth); g.hero.hp = 1; g.hero.mp = 1; c.invulnT = 0;
    run(secs * 10, () => { g.hero.mp = Math.max(g.hero.mp, 0.5); });
    return 1 - g.hero.hp;
  };
  const shallow = hpAt([], 250, 6), deepNo = hpAt([], 2000, 6), deepWard = hpAt(['hy_dinghaizhu'], 2000, 6);
  assert.ok(shallow < 0.005, `三百以内没有水压：${shallow.toFixed(3)}`);
  assert.ok(deepNo > 0.05, `没有避水，两千深按水压掉血：六息 −${(deepNo * 100).toFixed(1)}%`);
  assert.ok(deepWard < 0.005, `揣着定海珠（避水 60%）不受水压：${deepWard.toFixed(3)}`);
  assert.ok(D.needAt(2900) > 0.55 && D.needAt(1000) < 0.2, '越深要的避水越多');
  // 避水丹
  swimAt(CORE.x, CORE.y); C.addItem(g.hero, 'hy_bishuidan', 1);
  const w0 = D.ward(); assert.ok(g.usePill('hy_bishuidan')); assert.ok(Math.abs(D.ward() - w0 - 0.45) < 1e-6, '避水丹 +45%');
  // 闭气：灵力一直掉，见底就掉血
  swimAt(CORE.x, CORE.y); D.debugDive(1500); g.hero.mp = 0.3; g.hero.hp = 1;
  run(30); const mp1 = g.hero.mp;
  assert.ok(mp1 < 0.3, `水下闭气耗灵力：30% → ${(mp1 * 100).toFixed(1)}%`);
  g.hero.mp = 0; C.addItem(g.hero, 'hy_dinghaizhu', 1); g.hero.hp = 1; run(30, () => { g.hero.mp = 0; });
  assert.ok(g.hero.hp < 0.97, `灵力见底闭不住气，掉血：${(g.hero.hp * 100).toFixed(1)}%`);
  log(`水压：三百以内 −${(shallow * 100).toFixed(1)}%，两千深无避水六息 −${(deepNo * 100).toFixed(1)}%，揣定海珠 −${(deepWard * 100).toFixed(1)}%；闭气三息耗灵力 ${((0.3 - mp1) * 100).toFixed(1)}%，见底掉血`);
}

// ---------------------------------------------------------------- 5. 遗迹按种子：同一格算两遍一样；两张图看到同一处；越深阶越高
{
  const a = D.ruinIn(28, 6), b = D.ruinIn(28, 6);
  assert.deepEqual(a, b, '同一格算两遍一样');
  let n = 0, tiers = [0, 0, 0, 0];
  for (let j = -2; j <= 25; j++) for (let i = 22; i <= 34; i++) { const r = D.ruinIn(i, j); if (r) { n++; tiers[r.tier]++; assert.ok(r.floor > 500 && r.floor < 3600); } }
  assert.ok(n >= 10, `无边海里散着一批遗迹：${n}`);
  assert.ok(tiers[1] > 0 && tiers[2] > 0, `有浅渊也有中渊：${tiers}`);
  // 两张图：在南荒侧和沧溟海侧找最近的遗迹，大陆坐标一致
  place(675000, 150000); run(3);
  const r1 = D.nearestRuin(p.x, p.y, 3)!;
  const seam = W.MAP_SEAMS.tiannan!.find((s) => s.sea)!;
  (g as any).crossSeam(seam);
  assert.equal(W.ACTIVE_MAP, 'luanxing');
  const r2 = D.nearestRuin(p.x, p.y, 3)!;
  assert.ok(r1 && r2 && r1.id === r2.id && Math.abs(r1.cx - r2.cx) < 1e-6, `两张图看到的是同一处遗迹：${r1?.id} / ${r2?.id}`);
  (g as any).crossSeam(W.MAP_SEAMS.luanxing!.find((s) => s.sea)!);
  assert.equal(W.ACTIVE_MAP, 'tiannan');
  log(`遗迹按大陆坐标的种子：这一片 ${n} 处（浅渊 ${tiers[1]}、中渊 ${tiers[2]}、深渊 ${tiers[3]}），两张图对得上`);
}

// ---------------------------------------------------------------- 6. 守卫、首领、宝箱、遗迹记作打完
{
  setRealm(5);
  place(CORE.x, CORE.y); run(3);
  const r = D.nearestRuin(p.x, p.y, 6)!;
  const [x, y] = D.local(r);
  g.teleport(x, y + 1200); p.flying = false; c.reset(); J.swimming = true; run(2);
  C.addItem(g.hero, 'hy_dinghaizhu', 1);
  D.debugDive(r.floor - 100);
  run(5, () => { g.hero.hp = 1; });
  assert.ok(D.debug.guards > 0, `沉到遗迹附近，守卫游过来了：${D.debug.guards}`);
  assert.ok(!D.debug.boss, '首领还守在门口');
  { const [x2, y2] = D.local(r); g.teleport(x2, y2 + 400); }   // 遗迹可能在中线那一边：换过图，本图坐标要现算
  run(5, () => { g.hero.hp = 1; });
  assert.ok(D.debug.boss, '靠近石门：镇渊古傀出来了');
  const boss = c.enemies.find((e) => e.def.id === 'sb_yiji_kui')!;
  assert.ok(boss && (boss as any).shell, '首领是真正的 Enemy（自己的 AI）');
  const loot0 = c.loot.length;
  c.hitEnemy(boss, boss.maxHp * 99, { realm: 9, stCh: 0 }, p.x, p.y);
  run(5, () => { g.hero.hp = 1; });
  assert.ok(D.cleared(r), '打碎首领：遗迹记作打完');
  assert.ok(c.loot.length - loot0 >= 4, `宝箱弹开，一地的东西：${c.loot.length - loot0} 样`);
  const ids = c.loot.slice(loot0).map((l) => l.id);
  assert.ok(ids.includes('mat_hy_gumo') && ids.includes('mat_lingshi'), `有古魔残晶和灵石：${ids}`);
  log(`守卫 ${D.debug.guards} 只、首领在门口；打碎首领宝箱掉出：${ids.join('、')}`);
}

// ---------------------------------------------------------------- 7. 战斗线：被砸进海里（onSubmerge）进水下层；jueyu.dive / underwater / isUnder
{
  setRealm(4);
  place(CORE.x, CORE.y); run(3);
  assert.ok(typeof c.brawl.onSubmerge === 'function', '海渊接上了 combat.brawl.onSubmerge');
  c.brawl.onSubmerge!(null, p.x, p.y);
  assert.ok(D.active && J.underwater && D.d > 100, `主角被砸进深水：进了水下层（${D.d.toFixed(0)}）`);
  const e = new Enemy(ENEMIES.redwolf, p.x + 200, p.y, 4, 0, true); e.aggro = true; c.enemies.push(e);
  c.brawl.onSubmerge!(e, e.x, e.y);
  assert.ok(J.isUnder(e) && !(e.hideT > 0), '人在水下时被砸进海里的敌人就在水下接着打');
  // 水面上的敌人：人在水下时够不着
  const e2 = new Enemy(ENEMIES.redwolf, p.x - 300, p.y, 4, 0, false); e2.aggro = true; c.enemies.push(e2);
  run(2, () => { g.hero.hp = 1; });
  assert.ok(e2.hideT > 0 && !J.isUnder(e2), '水面上的敌人够不着水下的人');
  // 浮上去：跟下来的敌人照近战的规矩破水而出
  run(200, () => { g.hero.hp = 1; g.hero.mp = 1; return !D.active; }, ['ascend']);
  assert.ok(!D.active);
  // 近岸：dive 返回 false
  let coast = 560000; for (let x = 520000; x <= W.WORLD_W; x += 250) if (g.terrain.isLand(x, 140000)) coast = x;
  place(coast + 500, 140000); run(2);
  assert.equal(J.dive(null), false, '近岸 jueyu.dive 返回 false（调用方照旧处理）');
  place(CORE.x, CORE.y); run(2);
  assert.equal(J.dive(null), true, '深水处 jueyu.dive(null) 把主角带进水下');
  assert.ok(J.underwater);
  log('onSubmerge：主角、敌人被砸进深水都进了水下层；水面上的敌人够不着；jueyu.dive 在近岸返回 false');
}

// ---------------------------------------------------------------- 8. 玄龟宝船整船下沉：不受水压，改耗船的耐久
{
  setRealm(3);
  place(CORE.x, CORE.y); run(3);
  C.addItem(g.hero, 'lz_xuangui', 1);
  for (const id of ['hy_bishuizhu', 'hy_dinghaizhu']) while (C.bagCount(g.hero, id) > 0) C.removeItem(g.hero, id, 1);
  J.boat.deploy('lz_xuangui'); run(2);
  let inAt = -1; run(40, (n) => { if (D.active) { inAt = n; return true; } }, ['descend']);
  assert.ok(inAt > 0 && J.boat.under && J.boat.aboard, '玄龟宝船上按住下降：整船沉下去，人还在船上');
  const hp0 = J.boat.hpOf('lz_xuangui');
  g.hero.hp = 1; run(120, () => { g.hero.mp = 1; }, ['descend']);
  assert.ok(D.d > 1500, `一路沉下去：${D.d.toFixed(0)}`);
  assert.ok(g.hero.hp > 0.99, `船护着，人不受水压：${g.hero.hp}`);
  assert.ok(J.boat.hpOf('lz_xuangui') < hp0, `改耗船的耐久：${hp0} → ${J.boat.hpOf('lz_xuangui').toFixed(3)}`);
  run(300, () => { g.hero.mp = 1; return !D.active; }, ['ascend']);
  assert.ok(!D.active && J.boat.aboard && !J.boat.under, '浮上来还在船上');
  log(`玄龟宝船整船下沉到 ${(D.floor).toFixed(0)}，人不受水压，船耐久 ${Math.round(hp0 * 100)}% → ${Math.round(J.boat.hpOf('lz_xuangui') * 100)}%；浮上来还在船上`);
}

// ---------------------------------------------------------------- 9. 海渊的每帧逻辑（含遗迹、守卫）不取 Math.random
{
  setRealm(5);
  place(CORE.x, CORE.y); run(3);
  const r = D.nearestRuin(p.x, p.y, 6)!, [x, y] = D.local(r);
  g.teleport(x, y + 600); p.flying = false; c.reset(); J.swimming = true; run(2);
  delete ((g.ws.flags as any).hyRuin ?? {})[r.id];   // 前面几段清过这座遗迹：这里要它重新有守卫（原来靠传送进无边海时折算的几十天让它复原，v0.8.1 起传送不折算天数）
  D.debugDive(r.floor - 100); C.addItem(g.hero, 'hy_dinghaizhu', 1); c.invulnT = 1e9;   // 挨打时战斗那边自己取的随机数（会心、飘字）不算海渊的
  const rnd = Math.random; let n = 0, inside = false;
  Math.random = () => { if (inside) n++; return rnd(); };
  const tk = D.tick.bind(D); D.tick = (dt: number) => { inside = true; try { tk(dt); } finally { inside = false; } };
  run(60, () => { g.hero.hp = 1; g.hero.mp = 1; });
  D.tick = tk; Math.random = rnd;
  assert.equal(n, 0, `海渊每帧（含造守卫、首领）0 次 Math.random：${n}`); assert.ok(D.debug.guards > 0, '这期间守卫、首领都造出来了');
  log('海渊每帧逻辑（含遗迹、造守卫和首领）一个 Math.random 都不取');
}

// 总审：人在水下时离了海（被打死救回岸上、被传送上岸）——立刻回到水面上，水下的暗色、水压、面板不再挂着
{
  const r = D.nearestRuin(p.x, p.y, 6)!, [x, y] = D.local(r);
  g.teleport(x, y + 600); p.flying = false; c.reset(); J.swimming = true; run(2);
  D.debugDive(800); c.invulnT = 1e9; run(5, () => { g.hero.hp = 1; g.hero.mp = 1; });
  assert.ok(D.active && D.d > 300, '先潜到水下');
  const home = [...W.LOC_BY_ID.values()].find((l) => (l.map ?? 'tiannan') === W.ACTIVE_MAP && g.terrain.isLand(l.x * W.WORLD_SCALE, l.y * W.WORLD_SCALE))!;   // 此刻这张图上随便一处陆地
  g.teleport(home.x * W.WORLD_SCALE, home.y * W.WORLD_SCALE); run(3, () => { g.hero.hp = 1; });
  assert.ok(!D.active && D.d === 0, `传送上岸后不在水下了（active=${D.active} d=${D.d}）`);
  assert.ok(!J.underwater && !D.hud.show, '上岸后没有「万丈海渊」面板、不算在水下');
  log('人在水下时离了海：立刻浮出，不留水下状态');
}

console.log('PASS 万丈海渊：能潜的地方、下潜上浮、贴海扎入、水压与避水、闭气、遗迹按种子、守卫首领宝箱、onSubmerge 与 jueyu.dive、玄龟宝船下沉');
process.exit(0);
