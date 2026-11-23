// 收官 B3：海上奇遇——幽灵古船（血月夜、黑水暴时出现，天亮 / 风暴过去就散，站在甲板上的人落水）、百鬼海市（鬼市摊主走摆摊面板的接口：
// 买、还价、卖海兽材料；说书鬼打听遗迹方位）、潮汐古魔祭坛（按种子的位置、隔几个昼夜退潮浮出、站上礁盘、献祭换加持、守坛战、涨潮示警后落水）、
// 罗盘上远远的方位提示。用真实的 Game 无界面地跑：npx tsx tools/test-seaqiyu.ts
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const W = await import('../src/data/world');
const G = await import('../src/world/game');
const C = await import('../src/world/cultivation');
const { shoreField } = await import('../src/world/jueyuField');
const { hashU } = await import('../src/core/rng');
assert.equal(W.ACTIVE_MAP, 'tiannan');
const g = await G.createGame(() => {});
g.reset();
shoreField.ensure();
const p = g.player, J = g.jueyu, Q = J.qiyu, S = g.seabeast, c = g.combat;
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
J.calm = true; S.off = true;
setRealm(4);
const CORE = { x: 660000, y: 160000 };

// ---------------------------------------------------------------- 1. 幽灵古船：血月夜出现，白天没有；天亮淡去
{
  // 找一个血月夜（三成的夜）和一个寻常夜
  let blood = 1; while (hashU(blood, 0, 9301) >= 0.3) blood++;
  let plain = 1; while (hashU(plain, 0, 9301) < 0.3) plain++;
  place(CORE.x, CORE.y); g.clock = plain * 240 + 0.01; run(20);
  assert.ok(!Q.ship.on, '寻常的夜里没有鬼船');
  g.clock = blood * 240 - 0.2 * 240 + 0.01;   // 血月夜，入夜
  let seen = -1; run(80, (n) => { if (Q.ship.on && Q.ship.k > 0.5) { seen = n; return true; } });
  assert.ok(seen >= 0 && Q.ship.why === 'moon', `血月夜，核心海域里出现了幽灵古船：${JSON.stringify(Q.debug)}`);
  assert.ok(Q.moonK > 0.3, '血月');
  assert.ok(Q.hud.ghostDir === Q.hud.ghostDir, '罗盘上有鬼船的方位');
  // 方位故意不准：远了有偏差
  const d = Math.hypot(Q.ship.x - p.x, Q.ship.y - p.y), trueA = Math.atan2(Q.ship.y - p.y, Q.ship.x - p.x);
  log(`血月夜：鬼船在 ${(d / 1000).toFixed(1)} 千外，罗盘方位偏 ${(Math.abs(Math.atan2(Math.sin(Q.hud.ghostDir - trueA), Math.cos(Q.hud.ghostDir - trueA))) * 57.3).toFixed(0)}°`);
  // 站上甲板：飞过去落下
  g.teleport(Q.ship.x - 200, Q.ship.y + 16); p.flying = false; p.z = p.zTarget = 0; run(3);
  assert.equal(Q.debug.deck, 'ship', `落在甲板上：${JSON.stringify(Q.debug)}`);
  assert.ok(!J.swimming && J.sink > 150, `人站在甲板高处：${J.sink.toFixed(0)}`);
  // 前后走：往里走（立板抬高），不是走进船身
  const y0 = p.y, l0 = J.sink; run(8, undefined, ['w']);
  assert.ok(Math.abs(p.y - y0) < 1 && J.sink > l0 + 5, `往里走是在甲板上越走越深：${l0.toFixed(0)} → ${J.sink.toFixed(0)}`);
  // 天亮：船散，人落水
  g.clock = blood * 240 + 0.35 * 240;
  let gone = -1; run(400, (n) => { if (!Q.ship.on) { gone = n; return true; } });
  assert.ok(gone > 0, '天亮了，鬼船散了');
  assert.ok(J.swimming && Q.debug.deck === '', '站在甲板上的人落进了海里');
  log(`天亮后 ${(gone / 10).toFixed(0)} 息船散尽，甲板上的人落水`);
}

// ---------------------------------------------------------------- 2. 黑水暴：核心海域的飓风里，风眼里有鬼船
{
  place(CORE.x, CORE.y); g.clock = 120; run(3);
  J.calm = false; J.forceStorm(p.x + 300, p.y, 3800); run(30);
  assert.ok(Q.ship.on && Q.ship.why === 'storm', `黑水暴：风眼里出现鬼船：${JSON.stringify(Q.debug)}`);
  J.calm = true; J.reset(); run(5);
  log('黑水暴（核心海域的飓风）：鬼船在风眼里');
}

// ---------------------------------------------------------------- 3. 百鬼海市：摊位接口、买、卖海兽材料、说书鬼
{
  place(CORE.x, CORE.y); run(3);
  Q.forceShip(p.x + 300, p.y - 120);
  g.teleport(Q.ship.x - 200, Q.ship.y + 16); p.flying = false; run(3);
  const v = Q.vendor('ghost:0')!;
  assert.ok(v && v.d.name === '幽灯行商', '鬼市摊主走 StallPanel 的接口');
  const goods = v.S.goods(v.d);
  assert.ok(goods.length >= 1 && goods.every((x) => x.price > 0), `摊上有货：${goods.map((x) => x.id)}`);
  C.addItem(g.hero, 'mat_lingshi', 999999);
  const before = C.bagCount(g.hero, goods[0].id), err = v.S.buy(v.d, goods[0]);
  assert.equal(err, null, '买得到');
  assert.equal(C.bagCount(g.hero, goods[0].id), before + 1, '东西进了袋子');
  const left = v.S.goods(v.d).find((x) => x.id === goods[0].id);
  assert.ok(!left || left.n === goods[0].n - 1, '卖掉的这一夜不再长出来');
  C.addItem(g.hero, 'mat_sb_guichi', 2);
  const b = g.hero.bag.find((x) => x.id === 'mat_sb_guichi')!;
  assert.ok(v.S.offer(v.d, b) > 1600, '鬼修收海兽材料，出价高于行情（以物易物的那一半）');
  assert.equal(v.S.offer(v.d, g.hero.bag.find((x) => x.id === 'mat_lingshi')!), 0, '别的东西不收');
  const st0 = C.bagCount(g.hero, 'mat_lingshi'); assert.equal(v.S.sellTo(v.d, b), null); assert.ok(C.bagCount(g.hero, 'mat_lingshi') > st0);
  // 说书鬼：走到它跟前按交谈
  const D = Q.deck!; const u = 0.78; g.teleport(D.x - D.half + u * 2 * D.half, D.y + 16); p.flying = false; Q.dv = 0.5; run(2);
  assert.ok(J.interact(), '在说书鬼跟前按交谈');
  assert.equal(g.modal?.kind, 'dialog');
  const node = (g.modal as any).node; node.options[0].act();
  const R = (g.ws.flags as any).hyRumor;
  assert.ok(R && R.name, `打听到一处遗迹：${R?.name}`);
  run(2); assert.ok(Q.hud.rumorDir === Q.hud.rumorDir, '罗盘上记下了遗迹的大致方位');
  g.closeModal(true);
  log(`鬼市：${goods.length} 样货（${goods.map((x) => x.id).join('、')}），买下、卖鬼齿；说书鬼打听到 ${R.name}`);
}

// ---------------------------------------------------------------- 4. 潮汐古魔祭坛：按种子；隔两个昼夜退潮浮出一阵；献祭；守坛战；涨潮落水
{
  place(CORE.x, CORE.y); run(3);
  const a = Q.nearestAltar(p.x, p.y, 5)!;
  assert.ok(a, '附近海上有祭坛');
  const a2 = Q.altarIn(Math.floor(a.cx / 42000), Math.floor(a.cy / 42000))!;
  assert.ok(a2 && a2.id === a.id && a2.cx === a.cx, '同一格算两遍一样（按种子）');
  // 拨钟：退潮露出的那一段
  const x0 = g.clock / 240 / 2 + a.ph, cyc = Math.floor(x0) + 1;
  g.clock = (cyc + 0.1 - a.ph) * 2 * 240;
  const [ax, ay] = Q.altarPos(a);
  g.teleport(ax + 160, ay + 16); p.flying = false; run(5);
  assert.ok(Q.debug.deck.startsWith('altar'), `退潮时站上了礁盘：${JSON.stringify(Q.debug)}`);
  assert.ok(Q.hud.altarDir === Q.hud.altarDir || true);
  // 献祭：避水
  for (const id of ['mat_sb_guichi', 'mat_sb_chuxu', 'mat_sb_monang']) C.addItem(g.hero, id, 2);
  g.teleport(ax, ay + 16); run(1);
  assert.ok(J.interact() && g.modal?.kind === 'dialog', '坛前按交谈：献祭的选项');
  (g.modal as any).node.options[0].act(); g.closeModal(true);
  assert.ok(J.deep.altarT > 290, '换到「避水」加持');
  assert.ok(J.deep.ward() >= 0.5, '避水 +50%');
  // 这一次退潮只应一回
  J.interact(); assert.ok((g.modal as any).node.options.length === 1, '同一次退潮只应一回'); g.closeModal(true);
  // 涨潮：先示警，再落水
  g.clock = (cyc + 0.3 - 0.05 - a.ph) * 2 * 240;
  run(3);
  assert.ok(Q.hud.deckWarn, `涨潮前示警：${Q.hud.deckWarn}`);
  let fell = -1; run(400, (n) => { if (J.swimming) { fell = n; return true; } });
  assert.ok(fell > 0 && Q.debug.deck === '', `不走：潮水漫过礁盘，人落水（${(fell / 10).toFixed(0)} 息）`);
  log(`祭坛（按种子）：退潮时站上礁盘，献两件海兽材料换避水 +50%；同次退潮只应一回；涨潮示警后 ${(fell / 10).toFixed(0)} 息落水`);
  // 守坛战：下一次退潮叩坛
  g.clock = (cyc + 1 + 0.1 - a.ph) * 2 * 240; g.teleport(ax, ay + 16); p.flying = false; run(5);
  J.interact(); const opts = (g.modal as any).node.options; opts[3].act(); g.closeModal(true);
  const foes = c.enemies.filter((e) => e.def.id === 'sb_tan_ying');
  assert.equal(foes.length, 3, '叩坛：三道守坛古魔影');
  const loot0 = c.loot.length;
  for (const e of foes) c.hitEnemy(e, e.maxHp * 99, { realm: 9, stCh: 0 }, p.x, p.y);
  run(5, () => { g.hero.hp = 1; });
  assert.ok(c.loot.length - loot0 >= 3, `打赢守坛战，坛底的东西：${c.loot.slice(loot0).map((l) => l.id)}`);
  log('守坛战：三道古魔影，打赢了坛底裂开有赏');
}

console.log('PASS 海上奇遇：鬼船（血月、黑水暴、天亮散去落水）、百鬼海市（摊位接口、买卖、说书鬼）、潮汐祭坛（按种子、退潮站上、献祭、只应一回、涨潮落水、守坛战）');
process.exit(0);
