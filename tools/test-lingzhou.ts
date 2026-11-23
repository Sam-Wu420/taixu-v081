// 收官 B3：灵舟——上下船、船上灵力流失降到四分之一、炼气乘船进迷雾断层、触须缠船（往下拖、挣扎 / 斩断脱身）、
// 耐久归零船碎落水、人在船上存读档还在船上（耐久随存档走）、船上打坐核心区也回一点、修补、灵舟键 / 快捷栏的用法、
// 驾船不取 Math.random。用真实的 Game 无界面地跑：npx tsx tools/test-lingzhou.ts
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
// 收官 B4 返工：固定时钟和随机数（同 test-gore）。原来不固定：开局的人、怪、天气按真随机数和真时间排，
// 偶尔有野怪、过路修士正好在测试点附近（放船落空、炼气的船被撞停），连跑八次挂一两次
await import('./fixed-clock');
let seed0 = 7; Math.random = () => { seed0 = (Math.imul(seed0, 1664525) + 1013904223) >>> 0; return seed0 / 4294967296; };

const W = await import('../src/data/world');
const G = await import('../src/world/game');
const C = await import('../src/world/cultivation');
const { shoreField } = await import('../src/world/jueyuField');
const { BOATS } = await import('../src/data/seabeasts');
const { actionOfKey, bindOf } = await import('../src/core/keymap');
assert.equal(W.ACTIVE_MAP, 'tiannan');
const g = await G.createGame(() => {});
g.reset();
shoreField.ensure();
const p = g.player, J = g.jueyu, B = J.boat, S = g.seabeast, c = g.combat;
const log = (s: string) => console.log('  ' + s);
const setRealm = (r: number) => { g.hero.realm = r; g.hero.stage = 0; g.hero.exp = 0; g.hero.hp = 1; g.hero.mp = 1; };
const place = (x: number, y: number, fly = true) => { g.teleport(x, y); p.flying = fly; p.z = p.zTarget = fly ? 56 : 0; c.reset(); J.reset(); if (g.modal) g.closeModal(true); };
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
J.calm = true; S.off = true;   // 天象、海兽另有测试；这里先只看船
const give = (id: string, n = 1) => C.addItem(g.hero, id, n);
const Y = 140000;
let coast = 560000; for (let x = 520000; x <= W.WORLD_W; x += 250) if (g.terrain.isLand(x, Y)) coast = x;

// ---------------------------------------------------------------- 0. 三个品阶、键位
{
  assert.deepEqual(Object.keys(BOATS), ['lz_wupeng', 'lz_polang', 'lz_xuangui']);
  const s = Object.values(BOATS);
  for (let i = 1; i < s.length; i++) { assert.ok(s[i].hp > s[i - 1].hp && s[i].drainK < s[i - 1].drainK && s[i].shield > s[i - 1].shield, `越好越耐打、越省灵力：${s[i].id}`); }
  assert.equal(BOATS.lz_wupeng.drainK, 0.25, '最次的船也把流失降到四分之一');
  const k = bindOf('boat'); assert.ok(k && actionOfKey(k) === 'boat', `灵舟键可改键：${k}`);
  assert.ok(!['7', '8', '9', '0', 'f2', 'f4', 'f6', 'f7', 'f8', 'f9', 'f10'].includes(k), '默认不占数字 7–0 和模组的功能键');
  log(`三阶灵舟：耐久 ${s.map((q) => q.hp).join(' / ')}，流失 ×${s.map((q) => q.drainK).join(' / ')}；灵舟键默认「${k}」`);
}

// ---------------------------------------------------------------- 1. 上船、下船（在岸边祭出：船落在最近的水面；靠岸收舟：人上岸）
{
  setRealm(1);   // 炼气：不会御器
  give('lz_wupeng');
  place(coast - 120, Y, false); run(2);
  assert.ok(g.terrain.isLand(p.x, p.y) && !p.flying, '站在岸上');
  B.toggle(); run(2);
  assert.ok(B.on && B.aboard && B.id === 'lz_wupeng', `在岸边按灵舟键：祭出、人上了船：${JSON.stringify(B.debug)}`);
  assert.ok(!g.terrain.isLand(B.x, B.y), '船落在水面上');
  assert.ok(!J.swimming && !p.flying, '在船上：不是泅水、不是飞');
  assert.ok(J.sink > 20, `人的立板抬到甲板上：${J.sink.toFixed(1)}`);
  // 驾船往外开一段，再开回来靠岸
  const x0 = B.x; run(40, undefined, ['d']);
  assert.ok(B.x > x0 + 400 && B.aboard, `方向键驾船（有惯性地加速）：${(B.x - x0).toFixed(0)}`);
  const v0 = B.debug.v; run(5);
  assert.ok(B.debug.v > 20 && B.debug.v < v0, `松手后慢慢滑停（惯性）：${v0.toFixed(0)} → ${B.debug.v.toFixed(0)}`);
  // 四面是海：不会飞的人收不了船
  B.toggle(); run(1);
  assert.ok(B.aboard, '四面是海、又不会御器：不让收船');
  run(200, () => g.terrain.isLand(B.x - 260, B.y), ['a']);
  B.toggle(); run(2);
  assert.ok(!B.on && !B.aboard && g.terrain.isLand(p.x, p.y), `靠岸按灵舟键：收舟上岸：${JSON.stringify(B.debug)} land=${g.terrain.isLand(p.x, p.y)}`);
  log('岸边祭出（船落在最近的水面）、驾船有惯性、海中央不会飞的人收不了船、靠岸收舟上岸');
}

// ---------------------------------------------------------------- 2. 船上灵力流失降到四分之一；打坐核心区也回一点
{
  setRealm(4);
  // 隔离：这一段只验流失与打坐。核心海域的天象（裂缝、飓风）和海兽按开局时刻排，偶尔正好落在这一点——
  // 被触须拖下水（海渊里祭不出船）、被裂缝打断，「放船」就落空（连跑八次挂两次的原因）。关掉天象和海兽再验
  const calm0 = J.calm, off0 = g.seabeast.off; J.calm = true; g.seabeast.off = true;
  place(668000, 150000); run(20);
  assert.equal(J.band, 'core');
  const fly = J.drainRate;
  give('lz_polang');
  B.deploy('lz_wupeng'); run(5);
  assert.ok(B.aboard, `核心海域里飞着也能把船放出来歇脚：${JSON.stringify(B.debug)} 奇遇 ${JSON.stringify(J.qiyu.debug)} 袋里乌篷 ${C.bagCount(g.hero, 'lz_wupeng')} 落脚 ${J.footholdAt(p.x, p.y, true)} 时刻 ${g.time.toFixed(0)}/${g.clock.toFixed(0)}`);
  const boat = J.drainRate;
  assert.ok(fly > 0 && Math.abs(boat / fly - 0.25) < 0.01, `船上流失是飞着的四分之一：${(fly * 100).toFixed(3)} → ${(boat * 100).toFixed(3)}%/息`);
  // 打坐：核心区（不回气）也回上来一点
  g.hero.mp = 0.3; g.toggleSit(); run(30);
  assert.ok(p.sitting, '船上能打坐');
  const mpSit = g.hero.mp;
  assert.ok(mpSit > 0.3, `核心海域里在船上打坐也回灵：30% → ${(mpSit * 100).toFixed(1)}%`);
  g.stand();
  // 换好船：更省
  B.recall(true); B.deploy('lz_polang'); run(3);
  assert.ok(Math.abs(J.drainRate / fly - 0.2) < 0.01, '破浪灵舟只剩两成');
  // 收舟起飞（御剑键）
  g.hero.mp = 1; g.toggleFly(); run(3);
  assert.ok(p.flying && !B.on, `船上按御剑：收舟起飞：flying=${p.flying} on=${B.on}`);
  log(`核心海域：飞着流失 ${(fly * 100).toFixed(2)}%/息，乌篷灵舟上 ${(fly * 25).toFixed(2)}%/息；船上打坐三息回 ${((mpSit - 0.3) * 100).toFixed(1)}%；御剑键收舟起飞`);
  J.calm = calm0; g.seabeast.off = off0;
}

// ---------------------------------------------------------------- 3. 炼气乘船进迷雾断层（一路往东开）
{
  setRealm(1);
  place(coast - 120, Y, false); run(2);
  B.toggle(); run(2);
  assert.ok(B.aboard);
  const d0 = J.depth;
  let reached = -1, maxD = 0;
  run(1400, (n) => { maxD = Math.max(maxD, J.depth); if (J.band === 'fog') { reached = n; return true; } }, ['d']);
  assert.ok(reached > 0, `炼气乘船进了迷雾断层：离岸最远 ${maxD.toFixed(0)}`);
  assert.ok(B.aboard && !J.swimming, '一路都在船上');
  log(`炼气乘乌篷灵舟：${(reached / 10).toFixed(0)} 息从离岸 ${d0.toFixed(0)} 开到 ${J.depth.toFixed(0)}（迷雾断层）`);
}

// ---------------------------------------------------------------- 4. 触须缠船：往下拖、掉耐久；划桨挣扎 / 斩断脱身
{
  setRealm(4); S.off = false;
  place(668000, 150000); run(5);
  for (const id of Object.keys(BOATS)) (g.ws.flags as any).lz.hp[id] = 1;
  B.deploy('lz_polang'); run(3);
  const m = S.debugBreach('mochu', p.x + 420, p.y - 120)!;
  run(20, () => { g.hero.hp = 1; });
  const arms = S.armsOf(m.e) as any[];
  for (const a of arms) a.cd = 99;
  const a = arms[0]; a.st = 'grab'; a.t = 0;
  let held = -1; run(40, (n) => { g.hero.hp = 1; if (a.st === 'hold') { held = n; return true; } });
  assert.ok(held >= 0 && a.grab?.kind === 'boat', `人在船上：触须缠的是船：${a.st} ${a.grab?.kind}`);
  const hp0 = B.hpOf('lz_polang');
  run(20, () => { g.hero.hp = 1; });
  assert.ok(B.debug.sink > 0.1, `船被往海里拖：${B.debug.sink.toFixed(2)}`);
  assert.ok(B.hpOf('lz_polang') < hp0, `勒船掉耐久：${hp0.toFixed(3)} → ${B.hpOf('lz_polang').toFixed(3)}`);
  assert.ok(B.hud.held && B.hud.warn, '界面上有「触须缠住了船」的警示');
  // 划桨挣扎
  run(40, () => { g.hero.hp = 1; return a.st !== 'hold'; }, ['a']);
  assert.ok(a.st !== 'hold', '拼命划桨（方向键）挣脱');
  run(30, () => { g.hero.hp = 1; });
  assert.ok(B.debug.sink < 0.3, `挣脱后船慢慢浮回来：${B.debug.sink.toFixed(2)}`);
  // 再缠一次，砍断
  a.st = 'grab'; a.t = 0; a.cd = 0;
  run(40, () => { g.hero.hp = 1; return a.st === 'hold'; });
  c.hitEnemy(a.e, a.e.maxHp * 50, { realm: 9, stCh: 0 }, p.x, p.y);
  run(3, () => { g.hero.hp = 1; });
  assert.ok(a.st !== 'hold', '斩断这条触须：船脱身');
  // 一直不管：拖到底船碎、人连船被拖进海里
  const b = arms[1]; b.st = 'grab'; b.t = 0; b.cd = 0;
  run(40, () => { g.hero.hp = 1; return b.st === 'hold'; });
  let sunk = -1; run(200, (n) => { g.hero.hp = 1; if (!B.on) { sunk = n; return true; } });
  assert.ok(sunk > 0 && B.hpOf('lz_polang') === 0, `不管它：船被拖沉（${(sunk / 10).toFixed(1)} 息），耐久归零`);
  assert.ok(J.deep.active || J.swimming, `人落了水（被拖进海里）：deep=${J.deep.active} swim=${J.swimming}`);
  S.reset(); c.reset(); S.off = true;
  log(`触须缠船：缠的是船、往下拖、掉耐久；划桨挣脱、斩断脱身；不管它 ${(sunk / 10).toFixed(1)} 息船被拖沉`);
}

// ---------------------------------------------------------------- 5. 耐久归零：船碎人落水；破船祭不出来；岸上修补
{
  setRealm(3);
  place(668000, 150000); run(5);
  (g.ws.flags as any).lz.hp.lz_wupeng = 1;
  B.deploy('lz_wupeng'); run(3);
  assert.ok(B.aboard);
  // 海兽一下下撞船：人挨打，护罩分担一部分、船掉耐久
  const h0 = g.hero.hp, b0 = B.hpOf('lz_wupeng');
  { const ps = (c as any).pStats; c.invulnT = 0; c.hitPlayer(ps.hp * 0.35 + ps.def, g.hero.realm, undefined, p.x, p.y); } run(2);
  const lostHp = h0 - g.hero.hp;
  assert.ok(B.hpOf('lz_wupeng') < b0, `人挨打，船也掉耐久：${b0} → ${B.hpOf('lz_wupeng').toFixed(3)}`);
  B.damage(9999, '海兽撞碎'); run(3);
  assert.ok(!B.on && !B.aboard && J.swimming, `耐久归零：船碎、人落水泅水：${JSON.stringify(B.debug)} swim=${J.swimming}`);
  assert.ok(B.hpOf('lz_wupeng') < 0.02, '耐久归零（收着的船按天慢慢回，这几帧只回了一丝）');
  assert.ok(C.bagCount(g.hero, 'lz_wupeng') === 1, '破船还在袋里（要修）');
  g.hero.mp = 1; B.toggle(); run(1);
  assert.ok(!B.on, '破船祭不出来');
  // 岸上修补：用沉船古木
  place(coast - 300, Y, false); run(2);
  give('mat_hy_chenmu', 2);
  assert.ok(g.usePill('lz_wupeng'), '岸上「使用」破船＝修补');
  assert.ok(Math.abs(B.hpOf('lz_wupeng') - 0.5) < 0.03 && C.bagCount(g.hero, 'mat_hy_chenmu') === 1, `一份沉船古木补五成：${B.hpOf('lz_wupeng')}`);
  // 收着慢慢自己回
  const d0 = g.day; g.day += 5; run(1);
  assert.ok(B.hpOf('lz_wupeng') > 0.6, `收着五日自己回了一截：${B.hpOf('lz_wupeng').toFixed(2)}`);
  void d0;
  log(`人挨一下重的（气血 −${(lostHp * 100).toFixed(0)}%），护罩分担、船掉耐久；耐久归零船碎落水；破船祭不出；岸上一份沉船古木补五成，收着按天回`);
}

// ---------------------------------------------------------------- 第五轮返工（验收员没验成的第 10 条）：飓风打船
// 第六轮返工：原来雨带强度 1.0 时三十息把破浪灵舟从十成打到一成，偏狠。现在按船总耐久的比例打：普通灵舟在雨带里撑九十息上下、
// 风眼里不掉、玄龟宝船撑得久得多。各量三十息，按掉的比例推算能撑多久
{
  /** 船在飓风里待 secs 息（人不掉血、不被浪冲走：每帧把船拉回原处），返回掉了几成耐久、此刻的雨带强度、挨了几道雷 */
  const soak = (id: string, dx: number, secs = 30) => {
    setRealm(4);
    place(668000, 150000); run(5);
    ((g.ws.flags as any).lz.hp as Record<string, number>)[id] = 1;
    if (!C.bagCount(g.hero, id)) give(id);
    B.deploy(id); run(3);
    assert.ok(B.aboard && B.id === id, `上了${BOATS[id].name}`);
    J.forceStorm(p.x - dx, p.y, 3600, 900); run(2);
    const sx = B.x, sy = B.y, st = J.stormNear(p.x, p.y), band = st?.band ?? 0;
    const b0 = B.hpOf(id);
    let bolts = 0;
    run(secs * 10, () => { g.hero.hp = 1; g.hero.mp = 1; c.invulnT = 999; B.x = sx; B.y = sy; if (J.debug.strikes > 0) bolts++; if (!B.aboard) return true; });
    const drop = b0 - B.hpOf(id);
    if (B.aboard) B.toggle(); run(2);
    return { drop, band, eye: !!st?.eye, bolts };
  };
  const pl = soak('lz_polang', 1600), lastPl = 30 / Math.max(1e-6, pl.drop);
  assert.ok(pl.band > 0.5, `人在飓风的雨带里：${pl.band.toFixed(2)}`);
  assert.ok(pl.drop > 0.05, `飓风雨带里巨浪一下下打船：三十息掉 ${(pl.drop * 100).toFixed(0)}%`);
  assert.ok(lastPl > 65 && lastPl < 140, `破浪灵舟在雨带里撑九十息上下（不再三十息就散）：推算 ${lastPl.toFixed(0)} 息`);
  const wp = soak('lz_wupeng', 1600), lastWp = 30 / Math.max(1e-6, wp.drop);
  assert.ok(lastWp > 60 && lastWp < 120, `乌篷灵舟（最次的）在雨带里也撑一分多钟：推算 ${lastWp.toFixed(0)} 息`);
  const xg = soak('lz_xuangui', 1600), lastXg = 30 / Math.max(1e-6, xg.drop);
  assert.ok(lastXg > lastPl * 1.4, `玄龟宝船撑得更久：推算 ${lastXg.toFixed(0)} 息（破浪 ${lastPl.toFixed(0)}）`);
  const eye = soak('lz_polang', 0);
  assert.ok(eye.eye && eye.drop < 0.01, `风眼里不掉耐久：${(eye.drop * 100).toFixed(1)}%`);
  log(`飓风打船（雨带强度 ${pl.band.toFixed(2)}）：三十息破浪掉 ${Math.round(pl.drop * 100)}%（推算撑 ${lastPl.toFixed(0)} 息）、乌篷 ${Math.round(wp.drop * 100)}%（${lastWp.toFixed(0)} 息）、玄龟 ${Math.round(xg.drop * 100)}%（${lastXg.toFixed(0)} 息）；风眼里 ${(eye.drop * 100).toFixed(1)}%`);
}

// ---------------------------------------------------------------- 6. 存读档：人在船上存，读回来还在船上；耐久随存档走
{
  setRealm(4);
  place(660000, 160000); run(5);
  (g.ws.flags as any).lz.hp.lz_polang = 0.63;
  B.deploy('lz_polang'); run(10, undefined, ['d']); run(3);
  assert.ok(B.aboard);
  const sx = p.x, sy = p.y, hp = B.hpOf('lz_polang');
  assert.ok(g.save(1), '存档');
  place(300000, 200000, false); run(3);
  assert.ok(!B.on, '换了地方：船收了');
  assert.ok(g.load('taixu_save_1'), '读档');
  run(3);
  assert.ok(B.aboard && B.id === 'lz_polang', `读档后还在船上：${JSON.stringify(B.debug)}`);
  assert.ok(Math.abs(p.x - sx) < 60 && Math.abs(p.y - sy) < 60, `还在原处：${(p.x - sx).toFixed(0)}, ${(p.y - sy).toFixed(0)}`);
  assert.ok(!p.flying && !J.swimming, '不是飞着、不是泅水');
  assert.ok(Math.abs(B.hpOf('lz_polang') - hp) < 0.01, `耐久随存档走：${hp} → ${B.hpOf('lz_polang')}`);
  log(`人在船上存档 → 换地方 → 读档：还在船上、位置不变、耐久 ${Math.round(hp * 100)}% 不变`);
}

// ---------------------------------------------------------------- 7. 驾船、船上的每帧逻辑不取 Math.random
{
  setRealm(4); place(660000, 160000); run(3);
  B.deploy('lz_polang'); run(2);
  const rnd = Math.random; let n = 0, inside = false;
  Math.random = () => { if (inside) n++; return rnd(); };
  const tk = B.tick.bind(B); B.tick = (dt: number) => { inside = true; try { tk(dt); } finally { inside = false; } };
  run(60, () => { g.hero.hp = 1; }, ['d', 'w']);
  B.tick = tk; Math.random = rnd;
  assert.equal(n, 0, `驾船的每帧逻辑 0 次 Math.random：${n}`);
  log('驾船、浪、耐久的每帧逻辑一个 Math.random 都不取');
}

console.log('PASS 灵舟：三阶、上下船、流失四分之一、船上打坐、炼气乘船进断层、触须缠船、耐久归零落水与修补、存读档');
process.exit(0);
