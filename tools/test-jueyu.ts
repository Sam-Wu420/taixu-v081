// 绝域（无边海，B1）：离岸距离场、分带参数、按境界的灵力流失与模拟横渡、绝域罡风、空间裂缝与落雷、力竭落水与泅水、
// 外圈海存读档、两张图对同一个大陆坐标给出同一个值、过中线那一帧参数不跳、绝域的每帧逻辑一个 Math.random 都不取。
// 用真实的 Game 无界面地跑。
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
// 第六轮返工：固定时钟和随机数（照 test-lingzhou）。原来按真时间开局：游戏时刻（潮汐祭坛的潮相、血月、天象）每次不同，
// 偶尔横渡的航线正好经过一座刚浮出来的祭坛（或鬼船），法力见底时落在礁盘上、只按东不往南跳海，三千息「既没到也没落水」
await import('./fixed-clock');
let seed0 = 13; Math.random = () => { seed0 = (Math.imul(seed0, 1664525) + 1013904223) >>> 0; return seed0 / 4294967296; };

const W = await import('../src/data/world');
const G = await import('../src/world/game');
const { shoreField } = await import('../src/world/jueyuField');
const { WUBIAN, curveAt } = await import('../src/world/jueyuProfile');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
assert.equal(W.ACTIVE_MAP, 'tiannan');
const g = await G.createGame(() => {});
g.reset();
const p = g.player, J = g.jueyu, LX = W.MAP_FRAME.luanxing!;
g.seabeast.off = true;   // 这一份只验 B1 的环境与规则；海兽生态（B2）在 tools/test-seabeast.ts 里单独验
const log = { push: (s: string) => console.log('  ' + s) };
const place = (x: number, y: number, fly = true) => { g.teleport(x, y); p.flying = fly; g.combat.reset(); J.reset(); if (g.modal) g.closeModal(true); };
/** 跑若干帧（每帧 0.1 秒）；keys 按住的键；each 每帧回调，返回 true 就停 */
const run = (frames: number, keys: string[] | ((n: number) => string[]) = [], each?: (n: number) => boolean | void) => {
  let n = 0;
  for (; n < frames; n++) {
    if (g.modal) g.closeModal(true); g.paused = false;
    g.input.keys.clear(); for (const k of typeof keys === 'function' ? keys(n) : keys) g.input.keys.add(k);
    g.update(0.1); g.combat.enemies.length = 0;
    if (each?.(n)) break;
  }
  g.input.keys.clear();
  return n;
};
const setRealm = (r: number) => { g.hero.realm = r; g.hero.stage = 0; g.hero.exp = 0; g.hero.hp = 1; g.hero.mp = 1; };   // 修为清零：免得路上自己突破、回满法力
/** 飞回南荒（从沧溟海一侧的海上向西飞过中线）：游戏里换图只有这一条无缝的路 */
const backToTiannan = () => {
  if (W.ACTIVE_MAP === 'tiannan') return;
  const calm = J.calm; J.calm = true; setRealm(5);
  place(-W.SEA_DEPTH / 2 + 2500, 120000 + LX.dy);
  run(3000, ['a'], () => { g.hero.mp = 1; return W.ACTIVE_MAP === 'tiannan'; });
  J.calm = calm;
  assert.equal(W.ACTIVE_MAP, 'tiannan', '飞回了南荒');
};

// ---------------------------------------------------------------- 1. 离岸距离场
shoreField.ensure();
log.push(`距离场 ${shoreField.nx}×${shoreField.ny} 格，算了 ${shoreField.costMs.toFixed(0)} 毫秒`);
{
  // 岸边为 0：沿几条纬线找南荒东岸，岸外一点离岸距离很小
  for (const y of [100000, 150000, 300000]) {
    let last = -1; for (let x = 520000; x <= 600000; x += 250) if (g.terrain.isLand(x, y)) last = x;
    assert.ok(last > 0, `y=${y} 找得到东岸`);
    const d = shoreField.depthAt(last + 400, y);
    assert.ok(d < 2600, `岸边离岸距离应接近 0：y=${y} x=${last + 400} → ${d.toFixed(0)}`);
    // 往海里单调增（出了图边到海峡中线；图内近岸那一段有零星小岛，也算岸）
    for (let x = last + 400; x < 600000; x += 1000) assert.ok(shoreField.depthAt(x, y) <= 2001, `图内的海封顶：x=${x}`);
    let prev = -1;
    for (let x = 600000; x < 675000; x += 1000) { const v = shoreField.depthAt(x, y); assert.ok(v >= prev - 60, `y=${y} 往海里应单调增：x=${x} ${v.toFixed(0)} < ${prev.toFixed(0)}`); prev = v; }
    assert.ok(prev > 50000, `海峡中线离岸应超过五万：y=${y} → ${prev.toFixed(0)}`);
  }
  // 有名的海岛算岸
  for (const s of W.SEA_ISLES) assert.ok(shoreField.depthAt(s.x, s.y) < 500, `${s.name} 应算作岸`);
  // 外圈海：离图边越远越深，没有对岸
  assert.ok(shoreField.depthAt(-50000, 200000) > shoreField.depthAt(-20000, 200000) + 20000);
  // 图边内外连续：沿南荒东缘、南缘、西缘各取一串点，跨过图边前后差得很少
  for (const [x, y, dx, dy] of [[600000, 150000, 1, 0], [300000, 420000, 0, 1], [0, 200000, -1, 0], [751616, 200000, -1, 0]] as const) {
    const a = shoreField.depthAt(x - dx * 10, y - dy * 10), b = shoreField.depthAt(x + dx * 10, y + dy * 10);
    assert.ok(Math.abs(a - b) < 80, `图边内外连续：(${x},${y}) ${a.toFixed(0)} / ${b.toFixed(0)}`);
  }
}

// ---------------------------------------------------------------- 2. 各带的规则符合配置
J.calm = true;
{
  setRealm(4);
  const at = (x: number, y: number) => { place(x, y); run(40); return { d: J.depth, ceil: g.altCeiling, regen: J.k.regen, drain: J.drainRate, band: J.band, dk: J.dunkongRefusal() }; };
  const near = at(600000, 120000), fog = at(622000, 120000), core = at(675000, 120000);
  log.push(`近海 d=${near.d.toFixed(0)} 高 ${near.ceil.toFixed(0)}；迷雾 d=${fog.d.toFixed(0)} 高 ${fog.ceil.toFixed(0)} 回复×${fog.regen.toFixed(2)}；核心 d=${core.d.toFixed(0)} 高 ${core.ceil.toFixed(0)} 流失 ${(core.drain * 100).toFixed(2)}%/息`);
  assert.equal(near.band, 'near'); assert.equal(fog.band, 'fog'); assert.equal(core.band, 'core');
  assert.ok(Math.abs(near.ceil - 420) < 1 && near.regen > 0.99 && near.drain === 0 && !near.dk, '近海一切正常');
  assert.ok(Math.abs(fog.ceil - curveAt(WUBIAN.curves.ceiling, fog.d)) < 3 && fog.ceil < 420 && fog.ceil > 120, `迷雾断层高度上限渐降：${fog.ceil}`);
  assert.ok(Math.abs(fog.regen - 0.5) < 0.02 && fog.drain === 0, '迷雾断层回复减半、不流失');
  assert.ok(Math.abs(core.ceil - 60) < 1, '核心高度压到贴海 60');
  assert.ok(core.regen < 0.01 && Math.abs(core.drain - WUBIAN.drainByRealm[4]) < 1e-4, '核心不回气、按境界流失');
  assert.ok(core.dk, '核心里遁空梭失灵');
  // 高度真被压住：在核心按住上升也上不去
  place(675000, 120000); p.z = 300; p.zTarget = 300; run(60, ['ascend']);
  assert.ok(p.z <= 61, `核心里飞不高：z=${p.z.toFixed(1)}`);
  // 回复减半：迷雾断层里静止 10 息，回上来的法力约是近海的一半
  const regenOver = (x: number) => { place(x, 120000); run(20); g.hero.mp = 0.3; const m0 = g.hero.mp; run(50); return g.hero.mp - m0; };
  const rn = regenOver(600000), rf = regenOver(622000);
  assert.ok(rf > rn * 0.4 && rf < rn * 0.6, `迷雾断层回复约减半：近海 ${rn.toFixed(3)} / 迷雾 ${rf.toFixed(3)}`);
  // 小地图锁死、罗盘乱转
  place(640000, 120000); run(30);
  assert.ok(J.hud.show && J.hud.lock && J.hud.spin > 0.3, '迷雾断层往里：罗盘出现、小地图锁死、指针乱转');
  place(598000, 120000); run(30);
  assert.ok(!J.hud.lock, '近海小地图不锁');
}

// ---------------------------------------------------------------- 3. 四个境界各横渡一次（不嗑药、不绕路、没有天象）
const NAMES = ['凡人', '炼气', '筑基', '结丹', '元婴', '化神'];
interface Trip { arrived: boolean; fell: boolean; mpLeft: number; coreUse: number; secs: number; fellAt: number; minMp: number }
const cross = (realm: number, y: number, opts: { detour?: number; pill?: number } = {}): Trip => {
  backToTiannan();
  setRealm(realm);
  let x0 = 560000; for (let x = 520000; x <= 600000; x += 250) if (g.terrain.isLand(x, y)) x0 = x;
  place(x0 + 600, y);
  let coreIn = -1, coreOut = -1, fell = false, fellAt = 0, pillUsed = false, t = 0, zig = 0, minMp = 1;
  const epoch = g.mapEpoch;
  // 隔离：这一段只验流失。鬼船、潮汐祭坛的甲板（按游戏时刻浮出来）另有 test-seaqiyu 验；横渡时把它们当不存在，
  // 免得力竭时落在礁盘上（只按东键不会从礁盘前沿跳进海里，就既没到也没落水）
  const deckAt = J.qiyu.deckAt; J.qiyu.deckAt = () => null;
  const keys = () => (opts.detour && J.depth > 12000 ? ['d', Math.floor((zig += 0.1) / 3) % 2 ? 'w' : 's'] : ['d']);
  run(30000, keys, () => {
    t += 0.1;
    minMp = Math.min(minMp, g.hero.mp);
    if (J.band === 'core' && coreIn < 0) coreIn = g.hero.mp;
    if (coreIn >= 0 && coreOut < 0 && J.band !== 'core' && J.depth < 30000) coreOut = g.hero.mp;
    if (opts.pill && !pillUsed && coreIn >= 0 && g.hero.mp < opts.pill) { g.hero.mp = Math.min(1, g.hero.mp + 0.5); pillUsed = true; }
    if (J.swimming) { fell = true; fellAt = J.depth; return true; }
    return g.mapEpoch > epoch && g.seamDepth < -1500;
  });
  J.qiyu.deckAt = deckAt;
  return { arrived: g.mapEpoch > epoch && g.seamDepth < -1500 && !fell, fell, mpLeft: g.hero.mp, coreUse: coreIn >= 0 ? coreIn - (coreOut >= 0 ? coreOut : g.hero.mp) : 0, secs: t, fellAt, minMp };
};
{
  const trips: Record<number, Trip> = {};
  for (const r of [2, 3, 4, 5]) {
    trips[r] = cross(r, 120000);
    const T = trips[r];
    // 偶发过一次「筑基 3000 息没到、也没落水」（2026-11-16 全量，重跑三次都过）：再出现时把卡住的现场打出来
    if (!T.arrived && !T.fell) log.push(`  ↑ 卡住现场：x=${Math.round(p.x)} y=${Math.round(p.y)} z=${Math.round(p.z ?? 0)} flying=${p.flying} sitting=${p.sitting} canMove=${g.combat.canMove} halted=${g.halted} paused=${g.paused} modal=${g.modal?.kind ?? '-'} band=${J.band} depth=${Math.round(J.depth)} mp=${g.hero.mp.toFixed(2)} sea=${J.sea} map=${g.ws.map ?? '-'} dunkong=${g.dunkong.active} tx=${g.tianxiang.active}`);
    log.push(`${NAMES[r]}横渡：${T.arrived ? `到了（最低剩 ${(T.minMp * 100).toFixed(0)}% 法力）` : T.fell ? `离岸 ${(T.fellAt / 1000).toFixed(1)} 千处力竭落水` : '没到'}；核心里耗 ${(T.coreUse * 100).toFixed(0)}%；${T.secs.toFixed(0)} 息`);
  }
  assert.ok(trips[2].fell && trips[2].fellAt > 34000, '筑基在核心里力竭落水');
  assert.ok(trips[3].fell && trips[3].fellAt > 34000, '结丹在核心里力竭落水');
  assert.ok(trips[4].arrived && trips[4].minMp <= 0.2 && trips[4].minMp > 0.04, `元婴平飞勉强过得去、一路耗掉八成多：最低剩 ${trips[4].minMp.toFixed(2)}`);
  assert.ok(trips[5].arrived && trips[5].minMp > 0.5, '化神有余量');
  // 元婴绕一点路（躲飓风）就过不去；嗑一枚回气丹就过得去
  const det = cross(4, 120000, { detour: 1 });
  log.push(`元婴绕路：${det.arrived ? '到了' : det.fell ? `离岸 ${(det.fellAt / 1000).toFixed(1)} 千处落水` : '没到'}`);
  assert.ok(det.fell, '元婴绕路（躲飓风）不嗑药过不去');
  const pill = cross(4, 120000, { detour: 1, pill: 0.25 });
  log.push(`元婴绕路但嗑了一枚丹：${pill.arrived ? `到了（最低剩 ${(pill.minMp * 100).toFixed(0)}%）` : '没到'}`);
  assert.ok(pill.arrived, '元婴嗑药能过');
}

// ---------------------------------------------------------------- 4. 两张图对同一个大陆坐标给出同一个值；过中线那一帧参数不跳
{
  backToTiannan();
  const pts: [number, number][] = []; for (let i = 0; i < 40; i++) pts.push([610000 + i * 3500, 90000 + (i * 7919 % 240000)]);
  const tn = pts.map(([x, y]) => J.depthAt(x, y));
  setRealm(5);
  place(W.WORLD_W + W.SEA_DEPTH / 2 - 3000, 200000); run(60, [], () => { g.hero.mp = 1; });   // 先悬停，让平滑过的参数落定
  const epoch = g.mapEpoch; let jumpK = 0, jumpCeil = 0, jumpD = 0, prev = { ...J.k }, prevD = J.depth, at = 0;
  run(4000, ['d'], (n) => {
    g.hero.mp = 1;
    const dk = Math.abs(J.k.drain - prev.drain) + Math.abs(J.k.regen - prev.regen) + Math.abs(J.k.view - prev.view) + Math.abs(J.k.dark - prev.dark);
    if (g.mapEpoch > epoch && !at) at = n;
    if (g.mapEpoch > epoch && n <= at + 3) { jumpK = Math.max(jumpK, dk); jumpCeil = Math.max(jumpCeil, Math.abs(J.k.ceiling - prev.ceiling)); jumpD = Math.max(jumpD, Math.abs(J.depth - prevD)); }
    prev = { ...J.k }; prevD = J.depth;
    return at > 0 && n > at + 5;
  });
  assert.equal(W.ACTIVE_MAP, 'luanxing', '飞过中线换到沧溟海');
  assert.ok(jumpK < 0.02 && jumpCeil < 2 && jumpD < 400, `过中线那几帧分带参数不跳：${jumpK.toFixed(4)} / ${jumpCeil.toFixed(2)} / 离岸 ${jumpD.toFixed(0)}`);
  const lx = pts.map(([x, y]) => J.depthAt(x + LX.dx, y + LX.dy));
  for (let i = 0; i < pts.length; i++) assert.ok(Math.abs(tn[i] - lx[i]) < 1e-6, `同一个大陆坐标两图一致：${pts[i]} ${tn[i]} / ${lx[i]}`);
  log.push(`两图 40 个大陆坐标点逐一相等；过中线时参数每帧最大变化 ${jumpK.toFixed(4)}`);
  backToTiannan();
}

// ---------------------------------------------------------------- 5. 绝域：顶着风飞不出去（化神催动遁光也不行）
{
  assert.equal(W.ACTIVE_MAP, 'tiannan');
  setRealm(5); (g.hero.equip ??= {} as never).flight = 'art_fenglei';
  place(-20000, 200000);
  let minX = Infinity, maxWind = 0, sp = 0;
  run(900, ['a', 'shift'], () => { g.hero.mp = 1; minX = Math.min(minX, p.x); if (J.abyss > 0) { maxWind = Math.max(maxWind, Math.hypot(J.wind.x, J.wind.y)); sp = Math.max(sp, g.speed); } });
  log.push(`绝域：化神催动雷遁一路向西，最远到 x=${minX.toFixed(0)}（图边外 ${(-minX / 1000).toFixed(1)} 千，地形铺海到六万），罡风最大 ${maxWind.toFixed(0)}/息，遁速 ${sp.toFixed(0)}/息`);
  assert.ok(minX > -55000, `被罡风顶住，到不了地形尽头：${minX}`);
  const edge = J.windAt(-56000, 200000, { x: 0, y: 0, storm: 0, gale: 0 }), ew = Math.hypot(edge.x, edge.y);
  log.push(`地形尽头（图边外 5.6 万）的罡风 ${ew.toFixed(0)}/息`);
  assert.ok(maxWind >= sp * 0.95 && ew > sp * 1.5, `绝域的风顶得住、再往里超过任何遁速：${maxWind.toFixed(0)} / ${ew.toFixed(0)} vs ${sp.toFixed(0)}`);
  assert.ok(J.dunkongRefusal(), '绝域里遁空梭失灵');
  // 松手就被吹回来
  const x1 = p.x; run(60); assert.ok(p.x > x1 + 2000, `松手被吹回岸边方向：${x1.toFixed(0)} → ${p.x.toFixed(0)}`);
  // 外圈海存读档
  place(-30000, 210000); run(3);
  const sx = p.x, sy = p.y;
  assert.ok(g.save(1)); place(300000, 200000); assert.ok(g.load('taixu_save_1'));
  assert.equal(W.ACTIVE_MAP, 'tiannan'); assert.ok(Math.abs(p.x - sx) < 5 && Math.abs(p.y - sy) < 5, `外圈海读档位置不变：${p.x},${p.y}`);
  const B = g.bounds; assert.ok(p.x >= B.x0 && p.x <= B.x1 && p.y >= B.y0 && p.y <= B.y1, '读档后在可到范围内');
  run(30); assert.ok(!g.hero.dead && Number.isFinite(p.x + p.y), '外圈海里照常跑');
  assert.equal(g.isExplored(p.x, p.y), true, '外圈海不设迷雾');
}

// ---------------------------------------------------------------- 6. 空间裂缝：对主角、对敌人都结算；落雷有预警圈
{
  setRealm(4); J.calm = true;
  place(660000, 150000); run(20);
  const e = new Enemy(ENEMIES.redwolf, p.x + 120, p.y, 4, 0, true); e.aggro = false; g.combat.enemies.push(e);
  J.forceRift(p.x + 60, p.y, Math.PI / 2, 600, 0, 0.45);
  const hp0 = g.hero.hp, ehp0 = e.hp;
  for (let i = 0; i < 16; i++) { g.update(0.1); e.x = p.x + 120; e.y = p.y; }
  assert.ok(hp0 - g.hero.hp > 0.25, `裂缝撕过主角：气血 ${hp0.toFixed(2)} → ${g.hero.hp.toFixed(2)}`);
  assert.ok((ehp0 - e.hp) / e.maxHp > 0.3 || e.dead, `裂缝对敌人同样有效：${ehp0} → ${e.hp}`);
  // 预警的那 1.2 息里不伤人
  setRealm(4); place(660000, 150000); run(5);
  J.forceRift(p.x, p.y, 0.4, 600, 0, 0.45); const h1 = g.hero.hp;
  for (let i = 0; i < 10; i++) g.update(0.1);
  assert.equal(g.hero.hp >= h1 - 1e-9, true, '预警时还没撕开，不伤人');
  // 落雷：飓风的雨带里会追着人劈，有预警
  setRealm(4); J.calm = true; place(660000, 150000); run(5);
  J.forceStorm(p.x + 1500, p.y, 3600);
  let warned = false, hit = false;
  const hx = p.x, hy = p.y;
  for (let i = 0; i < 240 && !hit; i++) { const hpB = g.hero.hp; g.update(0.1); g.hero.mp = 1; p.x = hx; p.y = hy; if (J.debug.strikes > 0) warned = true; if (g.hero.hp < hpB - 0.05) hit = true; }
  assert.ok(warned && hit, `飓风雨带里有落雷（先有预警圈）：预警 ${warned} 中 ${hit}`);
  // 风推人：飓风眼墙附近被吹偏
  setRealm(4); place(660000, 150000); run(3); J.forceStorm(p.x, p.y - 900, 3600); run(2);
  const y0 = p.y, x0 = p.x; run(20);
  assert.ok(Math.hypot(p.x - x0, p.y - y0) > 600, `飓风把人吹走：${Math.hypot(p.x - x0, p.y - y0).toFixed(0)}`);
  // 风推弹道
  g.combat.projs.length = 0;
  log.push('裂缝伤主角与敌人、预警时不伤；雨带里的落雷有预警；飓风推人');
}

// ---------------------------------------------------------------- 7. 力竭落水、泅水、法力回来再起飞
{
  setRealm(3); J.calm = true;
  place(680000, 150000); run(10);
  g.hero.mp = 0.004; run(10);
  assert.ok(J.swimming && !p.flying, '法力见底：坠海进入泅水');
  assert.ok(J.hud.swimming && J.sink < -20, '泅水有状态提示、立板沉到水线');
  // 速度三成半
  const x0 = p.x; run(30, ['d']);
  const v = (p.x - x0) / 3, walk = g.hero.realm >= 0 ? 440 : 0;
  assert.ok(v > walk * 0.1 && v < walk * 0.6, `泅水速度约三成半（浪头会推一把、打出硬直）：${v.toFixed(0)}/息`);
  // 打坐不行
  g.toggleSit(); run(1); assert.ok(!p.sitting, '水里打坐不得');
  // 法力不够起不了飞
  g.hero.mp = 0.05; g.toggleFly(); assert.ok(!p.flying, '法力不足一成二起不了飞');
  // 大招放不出、小招式可以（用 refuseCast 判定）
  assert.ok(J.refuseCast({ tier: 3, name: '大招' }) && !J.refuseCast({ tier: 1, name: '小招' }), '泅水只能用小招式');
  // 嗑药：法力回上来就能再起飞
  g.hero.mp = 0.6; g.toggleFly(); run(2);
  assert.ok(p.flying && !J.swimming, '法力回来能再起飞');
  log.push(`结丹力竭落水 → 泅水 ${v.toFixed(0)}/息 → 嗑药再起飞`);
}

// ---------------------------------------------------------------- 8. 绝域的每帧逻辑不取 Math.random（固定种子的测试、日结算不受影响）
{
  setRealm(4); J.calm = false; place(670000, 150000); run(5);
  g.combat.invulnT = 1e9;
  const rnd = Math.random; let n = 0, inside = false;
  Math.random = () => { if (inside) n++; return rnd(); };
  const tick = J.tick.bind(J), mana = J.manaTick.bind(J);
  J.tick = (dt: number) => { inside = true; try { tick(dt); } finally { inside = false; } };
  J.manaTick = (dt: number) => { inside = true; try { mana(dt); } finally { inside = false; } };
  J.forceStorm(p.x + 1200, p.y, 3600); J.forceFog(p.x, p.y + 3000); J.forceTide(p.x, p.y);
  run(300, ['d'], () => { g.hero.mp = 1; });
  Math.random = rnd; J.tick = tick; J.manaTick = mana;
  assert.equal(n, 0, `绝域的每帧逻辑取了 ${n} 次 Math.random`);
  // 在陆上：绝域什么都不做
  backToTiannan(); place(300000, 200000, false); run(20);
  assert.ok(!J.sea && J.drainRate === 0 && !J.hud.show, `陆上不在险地：${JSON.stringify({ sea: !!J.sea, d: J.depth, sw: J.swimming, show: J.hud.show, x: p.x, y: p.y, land: g.terrain.isLand(p.x, p.y), map: W.ACTIVE_MAP })}`);
  log.push('绝域每帧逻辑（含飓风、鬼雾、裂隙潮）0 次 Math.random');
}

// ---------------------------------------------------------------- 9. 第六轮返工：鬼雾里的幻影在视野边上若隐若现，走近就散、再在偏开的方位冒出来
{
  setRealm(4); J.calm = true; place(640000, 150000); run(5);
  J.forceFog(p.x, p.y, 5200, 2300); run(10);
  const Rv = J.sightR(), YS = 0.8, ring = (q: { x: number; y: number }) => Math.hypot(q.x - p.x, (q.y - p.y) * YS);
  assert.ok(Rv > 200 && Rv < 1400, `鬼雾里视野塌下去：视野半径 ${Rv.toFixed(0)}`);
  const t0 = g.time + 100;
  J.phantomStep(t0, Rv);
  const vis = J.phantomStep(t0 + 2, Rv).filter((v) => !v.puff && v.a > 0.15);
  assert.ok(vis.length >= 3, `雾里看得见幻影：${vis.length} 个`);
  for (const v of vis) assert.ok(ring(v) > 0.7 * Rv && ring(v) < 1.3 * Rv, `幻影在视野边上（0.7–1.3 倍）：${(ring(v) / Rv).toFixed(2)}`);
  // 走近一个：散掉；六息后在偏开的方位重新冒出来
  const v0 = vis[0], b0 = Math.atan2(v0.y - p.y, v0.x - p.x);
  const px0 = p.x, py0 = p.y;
  p.x = v0.x - Math.cos(b0) * 0.3 * Rv; p.y = v0.y - Math.sin(b0) * 0.3 * Rv;
  const after = J.phantomStep(t0 + 2.1, Rv);
  assert.ok(after.some((v) => v.id === v0.id && v.puff), '走近的幻影散成一缕烟');
  assert.ok(!J.phantomStep(t0 + 4, Rv).some((v) => v.id === v0.id), '散了的幻影一时不再出');
  p.x = px0; p.y = py0;
  J.phantomStep(t0 + 9, Rv);
  const back = J.phantomStep(t0 + 11, Rv).find((v) => v.id === v0.id && !v.puff);
  assert.ok(back, '过一阵在视野边上又冒出来');
  const d = Math.abs(((Math.atan2(back.y - p.y, back.x - p.x) - b0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  assert.ok(d > 0.4, `再冒出来的方位偏开了（跟着走会被带偏）：偏 ${(d * 180 / Math.PI).toFixed(0)}°`);
  log.push(`鬼雾幻影：视野 ${Rv.toFixed(0)}，看得见 ${vis.length} 个，走近就散、再出来偏 ${(d * 180 / Math.PI).toFixed(0)}°`);
}

console.log('PASS 绝域（无边海）：离岸距离场、分带规则、四境界横渡、两图一致、绝域罡风、裂缝与落雷、力竭落水与泅水、外圈海存读档、不取 Math.random、鬼雾幻影');
process.exit(0);
