// 贴身斗法（world/brawl.ts）：欺身、连段、罡气打空才能轰飞、轰飞距离、撞墙的撞击伤害、缩地追击最多三次且越来越贵、
// 脱困扣灵力并震开、模组接管的单位（e.shell）不被击飞、每一下伤害都走 hitEnemy / hitPlayer（damage 钩子数得到）、
// 近战结束后镜头交还、连续缩地三次两人都在画面里、旧的击退路径不变、体修原型会把你打飞。
// 场地：把地形换成一片平地（可以在某条线后面立一堵「墙」），屋舍、安全区都关掉——距离、撞墙才算得准。
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;
await import('./fixed-clock');
let s0 = 7; Math.random = () => { s0 = (Math.imul(s0, 1664525) + 1013904223) >>> 0; return s0 / 4294967296; };

const G = await import('../src/world/game');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const { BX } = await import('../src/world/brawl');
const { ALT } = await import('../src/world/alt');
const { setModx } = await import('../src/mod/hooks');
const g = await G.createGame(() => {}); g.reset();
const c = g.combat as any, p = g.player, h = g.hero, B = c.brawl as InstanceType<typeof import('../src/world/brawl').BrawlSys>;
h.realm = 3; h.stage = 1;
const home0 = { x: p.x, y: p.y };   // 开局的位置（后面几段跑远了会碰上真地图里的东西，回到这里重来）

// 平地；wallX 以东是一堵墙（不可走）
let wallX: number | null = null;
const T = g.terrain as any;
T.walkFactor = (x: number) => ((wallX !== null && x > wallX) || (waterX !== null && x > waterX) ? 0 : 1);
T.canTraverse = (_ax: number, _ay: number, bx: number) => !(wallX !== null && bx > wallX);
// 这里的假地形随 wallX / waterX 随时变；远处 NPC 的粗模拟会把「下一步走不走得通」提前几帧算好（npc.ts 的 prestep，假定半秒内地形不变），
// 假地形一变它就用了过期的结果、随机数序列跟着错位（真实游戏里地形不会在半秒内变）。这份测试里关掉预算，一律现算。
(g.npcs as unknown as { prestep(dt: number): void }).prestep = () => {};
// waterX 以东是海（E2：砸海、犁水）
let waterX: number | null = null;
T.isLand = (x: number) => !(waterX !== null && x > waterX);
(g as any).space.blocked = () => false;
c.safeAt = () => false;
c.spawnT = 1e9;
B.brk.manual = true;   // 可破坏物只留测试自己摆的

const calm = () => { if (g.modal) g.closeModal(true); g.paused = false; };
const frame = (dt = 1 / 60) => { if (g.modal) g.closeModal(true); g.paused = false; c.spawnT = 1e9; g.update(dt); c.fxq.length = 0; };
const run = (sec: number, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) frame(dt); };
const fresh = () => { c.enemies.length = 0; B.reset(); c.cds.clear(); c.invulnT = 0; h.hp = 1; h.mp = 1; B.log = []; c.lock = null; c.manual = false; p.flying = false; p.z = 0; };
const foe = (dx: number, realm = 2, id = 'yelang') => { const e = new Enemy({ ...ENEMIES[id], speed: 0, melee: undefined, ranged: undefined }, p.x + dx, p.y, realm, 1); e.maxHp = e.hp = 1e7; e.aggro = true; e.kit = []; (e as any).noMind = true; c.enemies.push(e); return e; };   // 木桩：不施法、不凝护罩、不闪避（只测近战本身）
const waitHit = (n: number, max = 1) => { for (let t = 0; t < max && B.log!.length < n; t += 1 / 60) frame(); };
const kinds = () => B.log!.map((l) => l.k);

// 模组的 damage 钩子：数一数每一下近战伤害是不是都过了它；cancel = true 时全部取消
let hookN = 0, cancelAll = false;
setModx(new Proxy({ has: (n: string) => n === 'damage', fire: (_n: string, ctx: any) => { hookN++; if (cancelAll) ctx.cancel = true; return ctx; } } as any, { get: (t, k) => (k in t ? (t as any)[k] : () => null) }));

// 1. 化虹欺身：扑过去、命中、破防硬直、单位级顿帧、耗灵力
{
  fresh();
  const e = foe(1200); c.lock = e; c.manual = true;
  const mp0 = h.mp, hk0 = hookN;
  (calm(), B.rush());
  assert.ok(Math.abs(mp0 - h.mp - BX.rushMp) < 1e-6, `欺身耗灵力 ${BX.rushMp}`);
  let frames = 0; while (!kinds().includes('rush') && frames < 60) { frame(); frames++; }
  assert.ok(kinds().includes('rush'), '欺身命中');
  assert.ok(frames <= 40, `约 2600/秒扑过去：${frames} 帧`);
  assert.ok(Math.hypot(e.x - p.x, e.y - p.y) < 160, '扑到了跟前');
  const b = B.peek(e)!;
  assert.ok(b.staggerT > 0.3, `破防硬直约半息：${b.staggerT}`);
  assert.ok(b.freezeT > 0 && B.pb.freezeT > 0, '两个人都顿住');
  assert.equal(g.hitStop, 0, '欺身不用全局顿帧');
  assert.ok(hookN > hk0, '伤害过了 damage 钩子');
}

// 2. 轻击连段：四下，前三下只冻交手的两人，第四下收式；罡气没破时收式挑不起来
{
  fresh(); run(0.1);
  const e = foe(90, 3);
  e.skT = 1e9; (e as any).evadeN = 0; (e as any).evadeCd = 1e9;   // 木桩：不让它施法 / 闪避反击，免得「敌人打中我」的顿帧混进连段检查
  for (let i = 0; i < 4; i++) {
    (calm(), B.light()); waitHit(i + 1, 0.6);
    if (i < 3) { assert.equal(g.hitStop, 0, `第 ${i + 1} 拳不碰全局顿帧`); assert.ok(B.peek(e)!.freezeT > 0, `第 ${i + 1} 拳冻住对手`); }
    run(0.2);
  }
  assert.deepEqual(kinds(), ['light', 'light', 'light', 'finisher'], `连段：${kinds()}`);
  assert.ok(!B.isAir(e) || B.peek(e)!.breakT > 0, '罡气没破的不会被挑飞');
}

// 3. 罡气打空才能轰飞
{
  fresh(); run(0.1);
  const e = foe(90, 3);
  (calm(), B.heavy(false)); waitHit(1, 0.6); run(0.1);
  assert.ok(!B.isAir(e), '罡气还在：重击轰不飞');
  const b = B.peek(e)!;
  assert.ok(b.poise > 0 && b.poise < b.poiseMax, `罡气掉了一截：${b.poise}/${b.poiseMax}`);
  for (let i = 0; i < 12 && b.breakT <= 0; i++) { (calm(), B.light()); run(0.22); }
  assert.ok(b.breakT > 0, '连打几下破罡');
  run(0.7); c.cds.clear();
  const x0 = e.x;
  (calm(), B.heavy(false)); waitHit(B.log!.length + 1, 0.6);
  assert.ok(B.isAir(e), '破罡之后一记重击轰飞');
  assert.ok(g.hitStop > 0 || g.slowT > 0, '收尾一击才用全局顿帧 / 慢放');
  // 4. 轰飞距离：1500–3000
  let maxZ = 0; for (let t = 0; t < 6 && B.isAir(e); t += 1 / 60) { frame(); maxZ = Math.max(maxZ, e.lift); }
  const D = Math.hypot(e.x - x0, 0);
  assert.ok(!B.isAir(e), '落地停下');
  assert.ok(D >= BX.launchMin && D <= BX.launchMax, `轰飞距离 ${Math.round(D)}`);
  assert.ok(maxZ > 20, `离地飞：${Math.round(maxZ)}`);
}

// 5. 撞墙：撞上不可走的地形有撞击伤害、起坑，不穿墙
{
  fresh(); run(0.1);
  const e = foe(90, 3);
  wallX = p.x + 700;
  const b = B.body(e); b.poise = 0; b.breakT = 1.5;
  g.input.mouse.active = true; g.input.mouse.x = p.x + 1000; g.input.mouse.y = p.y; g.input.mouse.t = g.time;
  let crater = false;
  const push0 = c.fxq.push.bind(c.fxq); c.fxq.push = (...a: any[]) => { if (a.some((x) => x.k === 'crater' || x.k === 'slam')) crater = true; return push0(...a); };
  (calm(), B.heavy(false));
  for (let t = 0; t < 4; t += 1 / 60) frame();
  c.fxq.push = push0;
  assert.ok(kinds().includes('impact'), `撞墙有撞击伤害：${kinds()}`);
  assert.ok(B.log!.find((l) => l.k === 'impact')!.dmg > 0, '撞击伤害打进去了');
  assert.ok(crater, '撞墙起坑');
  assert.ok(e.x <= wallX + 1, `没穿墙：${Math.round(e.x - wallX)}`);
  wallX = null; g.input.mouse.active = false;
}

// 6. 缩地追击：对方倒飞途中再按，最多连三次，一次比一次贵；两人一直都在画面里（按镜头算屏幕坐标）
{
  fresh(); run(0.1);
  const e = foe(90, 3);
  const b = B.body(e); b.poise = 0; b.breakT = 1.5;
  (calm(), B.heavy(false)); waitHit(1, 0.5);
  assert.ok(B.isAir(e), '先轰飞');
  const costs: number[] = [];
  let off = 0, frames = 0;
  const onScreen = (x: number, y: number, z: number) => { const W = 1280, H = 800, zz = g.cam.zoom, sx = (x - g.cam.x) * zz + W / 2, sy = (y - z - g.cam.y) * zz + H / 2; return sx > 0 && sx < W && sy > 0 && sy < H; };
  for (let k = 0; k < 4; k++) {
    for (let t = 0; t < 0.25; t += 1 / 60) { frame(); frames++; if (process.env.DBG && k < 2) console.log('cam', k, t.toFixed(2), B.camOn, g.cam.zoom.toFixed(2), Math.round(e.x - p.x), B.isAir(e), (B as any).foe === e, B.engageT.toFixed(2)); if (!onScreen(p.x, p.y, p.z + B.playerLift + 60) || !onScreen(e.x, e.y, e.z + 60)) { off++; if (process.env.DBG) console.log('off', k, t.toFixed(2), Math.round((p.x - g.cam.x) * g.cam.zoom), Math.round((e.x - g.cam.x) * g.cam.zoom), Math.round((e.y - e.z - g.cam.y) * g.cam.zoom), g.cam.zoom.toFixed(2)); } }
    const mp0 = h.mp, n0 = B.log!.length;
    (calm(), B.pursue());
    if (k < 3) { assert.ok(B.log!.length > n0, `第 ${k + 1} 次追上并出手`); costs.push(mp0 - h.mp); assert.ok(B.isAir(e), `第 ${k + 1} 次截住又打飞`); }
    else assert.equal(h.mp, mp0, '第四次追不上（也不扣灵力）');
  }
  for (let t = 0; t < 1; t += 1 / 60) { frame(); frames++; if (!onScreen(p.x, p.y, p.z + B.playerLift + 60) || !onScreen(e.x, e.y, e.z + 60)) off++; }
  assert.ok(costs[0] < costs[1] && costs[1] < costs[2], `越来越贵：${costs.map((x) => x.toFixed(3))}`);
  assert.equal(off, 0, `连续缩地三次两人都在画面里（出画 ${off}/${frames} 帧）`);
  assert.ok(B.camOn, '交手期间镜头由近战接管');
  // 10. 近战结束后镜头交还：对方落地、不再交手，镜头回到跟着自己，一路平滑
  run(6);
  assert.ok(!B.camOn, '交还镜头');
  let jump = 0, lx = g.cam.x, ly = g.cam.y;
  for (let t = 0; t < 1.5; t += 1 / 60) { frame(); jump = Math.max(jump, Math.hypot(g.cam.x - lx, g.cam.y - ly)); lx = g.cam.x; ly = g.cam.y; }
  assert.ok(jump < 120, `交还时镜头不跳：一帧最多挪 ${Math.round(jump)}`);
  assert.ok(Math.hypot(g.cam.x - p.x, g.cam.y - p.y) < 60, '镜头回到自己身上');
}

// 7. 脱困：被体修打飞时按，扣灵力（被连得越久越便宜）、定住身形、震开追击者，有冷却
{
  fresh(); run(0.1);
  const t = B.spawnBrawler(p.x + 500, p.y, 3, 1); t.aggro = true; t.maxHp = t.hp = 1e7;
  B.pb.poise = 1; B.pb.poiseMax = B.playerPoiseMax; B.pb.idle = 0;   // 罡气见底：这一套三连的重击一定把你打飞
  let flew = false;
  for (let s = 0; s < 6 && !flew; s += 1 / 60) { frame(); if (B.pb.air) flew = true; }
  if (!flew) console.log(JSON.stringify(B.log), B.pb.breakT, B.pb.poise, h.hp, c.invulnT);
  assert.ok(flew, `体修原型：欺身、连击、把你轰飞（${kinds()}）`);
  assert.ok(kinds().includes('npc-heavy'), '挨的重击走了 hitPlayer');
  run(0.15);
  // 让它追到身边再脱困：把它挪过来
  t.x = p.x + 120; t.y = p.y;
  const mp0 = h.mp, cost = B.techCost;
  assert.ok(cost < BX.techMp + 1e-9 && cost >= BX.techMp * 0.4 - 1e-9, `脱困价：${cost}`);
  (calm(), B.pursue());   // 自己被打飞时，空格 / 缩地就是脱困
  assert.ok(!B.pb.air, '脱困：定住身形');
  assert.ok(Math.abs(mp0 - h.mp - cost) < 1e-6, `扣灵力 ${cost.toFixed(3)}`);
  const d0 = Math.hypot(t.x - p.x, t.y - p.y); run(0.5);
  assert.ok(Math.hypot(t.x - p.x, t.y - p.y) > d0 + 150, '追击者被震开');
  assert.ok(B.pb.techCd > 0, '有冷却');
  B.launchPlayer(1, 0, 1500, 300, null); const mp1 = h.mp; (calm(), B.tech());
  assert.ok(B.pb.air && h.mp === mp1, '冷却中脱不了困');
  run(3);
}

// 8. 模组接管的单位（e.shell）不被击飞；被模组清零 kx/ky 的会落下来
{
  fresh(); run(0.1);
  const e = foe(90, 3); (e as any).shell = true;
  const b = B.body(e); b.poise = 0; b.breakT = 1.5;
  (calm(), B.heavy(false)); run(0.3);
  assert.ok(!B.isAir(e), 'shell 单位不飞');
  (e as any).shell = false; c.cds.clear(); run(0.5); b.poise = 0; b.breakT = 1.5;
  (calm(), B.heavy(false)); waitHit(B.log!.length + 1, 0.5); run(0.12);   // 重击有前摇（E2），命中后两人还顿着一小会儿
  assert.ok(B.isAir(e), '放开后照常飞');
  e.kx = 0; e.ky = 0; frame();   // shahe 这类模组每帧把 kx / ky 清零
  assert.ok(!B.isAir(e), '被清零 kx/ky 的当作被定住');
  B.clear(e);
}

// 9. 伤害都走 hitEnemy：钩子取消时打不进去、也飞不起来
{
  fresh(); run(0.1);
  const e = foe(90, 3), hp0 = e.hp;
  const b = B.body(e); b.poise = 0; b.breakT = 1.5;
  cancelAll = true;
  (calm(), B.heavy(false)); run(0.3);
  cancelAll = false;
  assert.equal(e.hp, hp0, '钩子取消：没伤');
  assert.ok(!B.isAir(e), '钩子取消：不飞');
  assert.ok(B.log!.every((l) => l.dmg === 0), '记账：没打进去');
}

// 11. 旧的击退路径不变：寻常 hitEnemy 照旧推 kx；近战那一下（src.brawl）不推
{
  fresh();
  const e = foe(200, 1), e2 = foe(200, 1);
  c.hitEnemy(e, 50, { realm: 3, stCh: 0 }, p.x, p.y);
  c.hitEnemy(e2, 50, { realm: 3, stCh: 0, brawl: 'light' }, p.x, p.y);
  assert.ok(e.kx > 50, `旧路径照推：${e.kx}`);
  assert.equal(e2.kx, 0, '近战的一下不推旧的 kx');
}

// 12. 首领：罡气厚四倍，破罡后也只飞一小段
{
  fresh(); run(0.1);
  const e = foe(90, 3); e.boss = true;
  const b = B.body(e);
  assert.ok(b.poiseMax >= B.poiseMaxOf(foe(400, 3)) * 3.5, `首领罡气厚：${b.poiseMax}`);
  b.poise = 0; b.breakT = 1;
  const x0 = e.x;
  (calm(), B.heavy(false)); waitHit(1, 0.5);
  for (let t = 0; t < 4 && B.isAir(e); t += 1 / 60) frame();
  assert.ok(Math.abs(e.x - x0) < 900, `首领只飞一小段：${Math.round(Math.abs(e.x - x0))}`);
}

// 13. 境界门槛：炼气不会欺身、筑基不会缩地；进架势按境界领悟
{
  fresh(); h.realm = 1; h.arts = h.arts.filter((a: any) => !a.id.startsWith('bx_'));
  B.toggleStance();
  assert.ok(B.stance, '进架势');
  const ids = h.arts.map((a: any) => a.id).filter((id: string) => id.startsWith('bx_'));
  assert.deepEqual(ids.sort(), ['bx_bengshan', 'bx_lianquan'], `炼气领悟拳脚：${ids}`);
  const mp0 = h.mp; (calm(), B.rush()); assert.equal(h.mp, mp0, '炼气欺身不了');
  B.toggleStance(); h.realm = 3;
}

// 14. 会近战的 NPC 按境界自己脱困：元婴的体修被缩地追上一次就脱困，并把你震开
{
  fresh(); run(0.1); h.realm = 4;
  const t = B.spawnBrawler(p.x + 90, p.y, 4, 0); t.aggro = false; t.maxHp = t.hp = 1e9;
  const b = B.body(t); b.poise = 0; b.breakT = 1.5;
  (calm(), B.heavy(false)); waitHit(1, 0.5);
  assert.ok(B.isAir(t), '先轰飞');
  run(0.3); (calm(), B.pursue());
  let teched = false; for (let s = 0; s < 1.5 && !teched; s += 1 / 60) { frame(); if (!B.isAir(t) && B.peek(t)!.techCd > 0) teched = true; }
  assert.ok(teched, '元婴体修被追一次就脱困');
  h.realm = 3;
}

// ================================================================ E2
const fxSeen: string[] = [];
const watchFx = () => { fxSeen.length = 0; const push0 = c.fxq.push.bind(c.fxq); c.fxq.push = (...a: any[]) => { for (const x of a) fxSeen.push(x.k); return push0(...a); }; return () => { c.fxq.push = push0; }; };
const CL = B.clash;
const coolOff = () => { (CL as any).cool = new WeakMap(); };
const { cultivator, newTeam } = await import('../src/world/melee');
const { kitOf } = await import('../src/world/foeskills');

// 15. 拼招：攻克破、破克卸、卸克攻；输了的是你；平手转连按拼点；拼招时世界放慢到 0.2 倍；两边同时欺身就会撞上
{
  const cases: [string, string, 'win' | 'lose'][] = [['atk', 'brk', 'win'], ['brk', 'par', 'win'], ['par', 'atk', 'win'], ['atk', 'par', 'lose']];
  for (const [mine, theirs, want] of cases) {
    fresh(); coolOff(); run(0.05);
    const e = foe(160, 3); const b = B.body(e); const p0 = b.poise;
    assert.ok(CL.start(e, 'rush'), '开拼');
    assert.ok(Math.abs(CL.timeK() - 0.2) < 1e-9, '拼招时世界放到 0.2 倍');
    assert.ok(B.holdsPlayer, '拼招时你定在原地');
    CL.st!.ePick = theirs as any;
    CL.pick(mine as any);
    run(0.3);
    const L = CL.log[CL.log.length - 1];
    assert.equal(L.res, want, `${mine} 对 ${theirs}：${want}`);
    if (want === 'win') { assert.ok(b.poise < p0 * 0.6 || b.breakT > 0, `赢了：对方罡气削一大截（${Math.round(p0)} → ${Math.round(b.poise)}）`); assert.ok(b.staggerT > 0.3 || B.isAir(e), '赢了：对方被震出硬直'); assert.ok(kinds().includes('clash'), '赢家那一下走 hitEnemy'); }
    else { assert.ok(B.pb.staggerT > 0 || B.pb.air, '输了：你被震开'); assert.ok(kinds().includes('clash'), '输家挨的那一下走 hitPlayer'); }
    run(1.2);
    assert.ok(!CL.on, '结束后交还');
    assert.equal(CL.timeK(), 1, '世界恢复原速');
  }
  // 犹豫即败：0.8 息里不出手
  { fresh(); coolOff(); run(0.05); const e = foe(160, 3); CL.start(e, 'heavy'); run(1.0); assert.equal(CL.log[CL.log.length - 1].res, 'lose', '不出手就输'); run(1.2); }
  // 平手 → 连按拼点：你按得多就赢
  { fresh(); coolOff(); run(0.05); const e = foe(160, 3); CL.start(e, 'rush'); CL.st!.ePick = 'brk'; CL.pick('brk'); run(0.25);
    assert.equal(CL.st!.phase, 'mash', '平手转连按拼点');
    for (let i = 0; i < 40 && CL.st?.phase === 'mash'; i++) { CL.mash(); frame(); }
    run(1.2);
    const L = CL.log[CL.log.length - 1];
    assert.ok(L.tie && L.res === 'win' && L.pN > L.eN, `拼点：${L.pN} : ${L.eN}`); void e; }
  // 两边同时欺身：撞上就拼招
  { fresh(); coolOff(); run(0.05);
    const t = B.spawnBrawler(p.x + 700, p.y, 3, 0); t.maxHp = t.hp = 1e7; t.aggro = true; c.lock = t; c.manual = true;
    B.forceRush(t); (calm(), B.rush());
    let on = false; for (let i = 0; i < 40 && !on; i++) { frame(); on = CL.on; }
    assert.ok(on, '两边同时欺身 → 拼招');
    CL.pick('atk'); run(1.5); }
  // NPC 之间拼招：直接按境界、性情结算
  { fresh(); coolOff(); run(0.05);
    const a = foe(-400, 4), b2 = foe(-200, 2);
    const w = CL.npcClash(a, b2);
    const lose = w === a ? b2 : a;
    assert.ok(B.peek(lose)!.staggerT > 0.3, 'NPC 拼招：输的硬直'); }
}

// 16. 可破坏物：被轰飞的人撞上巨石——巨石碎、结算二次撞击伤害、人减速但继续飞；法术的范围技也打得碎；摆放不碰 Math.random
{
  fresh(); run(0.1);
  const e = foe(90, 3);
  const rk = B.brk.place('boulder', p.x + 700, p.y, 0.6);
  const b = B.body(e); b.poise = 0; b.breakT = 1.5;
  g.input.mouse.active = true; g.input.mouse.x = p.x + 1000; g.input.mouse.y = p.y; g.input.mouse.t = g.time;
  const unwatch = watchFx();
  (calm(), B.heavy(false));
  let vBefore = 0;
  for (let t = 0; t < 3 && !rk.dead; t += 1 / 60) { frame(); if (!rk.dead) vBefore = Math.hypot(b.vx, b.vy); }
  const vAfter = Math.hypot(b.vx, b.vy);
  for (let t = 0; t < 0.3; t += 1 / 60) frame();
  unwatch();
  assert.ok(rk.dead && B.brk.smashed >= 1, '撞上巨石就碎');
  assert.ok(fxSeen.includes('rubble'), '碎石特效');
  assert.ok(B.log!.some((l) => l.k === 'impact' && l.dmg > 0), `二次撞击伤害打进去了：${kinds()}`);
  assert.ok(vAfter < vBefore && vAfter > 0, `减速但继续飞：${Math.round(vBefore)} → ${Math.round(vAfter)}`);
  assert.ok(e.x > rk.x, `穿过去了：${Math.round(e.x - rk.x)}`);
  g.input.mouse.active = false;
  // 法术的大范围技（combat.aoe）
  const r2 = B.brk.place('reef', p.x - 400, p.y, 0.4);
  for (let i = 0; i < 3 && !r2.dead; i++) (c as any).aoe(r2.x, r2.y, 180, c.pStats.atk * 2, { realm: 3, stCh: 0 }, 0);
  assert.ok(r2.dead, '大范围技打碎礁石');
  // 自动摆放：按分块取种子，用自己的随机序列（一个 Math.random 都不取）
  const r0 = Math.random; let n = 0; Math.random = () => { n++; return r0(); };
  B.brk.manual = false; for (let i = 0; i < 8; i++) { (B.brk as any).scanT = 0; (B.brk as any).scanX = NaN; B.brk.update(1 / 60); }
  Math.random = r0; B.brk.manual = true;
  assert.equal(n, 0, `摆放不取 Math.random（取了 ${n} 次）`);
  B.brk.reset();
}

// 17. 砸海与犁水：往下砸进海里——冲天水柱，人沉入水中（打不到、不动），1.5 息后破水而出；贴着水面平着轰飞犁出水沟；主角被砸进水里沉 1 息再浮起
{
  fresh(); run(0.1);
  waterX = p.x + 40;
  p.flying = true; p.z = p.zTarget = 120;
  const e = foe(90, 3); e.flyH = 120;
  const b = B.body(e); b.poise = 0; b.breakT = 1.5;
  let subs = 0; B.onSubmerge = () => { subs++; };
  const unwatch = watchFx();
  (calm(), B.heavy(true));
  let sank = false; for (let t = 0; t < 2 && !sank; t += 1 / 60) { frame(); p.z = p.zTarget = 120; if (b.subT > 0) sank = true; }
  assert.ok(sank, '砸进海里沉下去了');
  assert.ok(fxSeen.includes('pillar'), '冲天水柱');
  assert.ok(e.hideT > 0, '沉在水下：看不见、打不到');
  assert.equal(subs, 1, '海渊入口（onSubmerge）调了一次');
  const hp0 = e.hp; c.hitEnemy(e, 1000, { realm: 3, stCh: 0 }, p.x, p.y); assert.equal(e.hp, hp0, '沉在水里打不到');
  const x0 = e.x; run(0.6); p.z = p.zTarget = 120; assert.equal(e.x, x0, '沉在水里不动');
  let up = false; for (let t = 0; t < 1.5 && !up; t += 1 / 60) { frame(); p.z = p.zTarget = 120; if (b.subT <= 0 && e.hideT <= 0) up = true; }
  assert.ok(up, '破水而出');
  assert.ok(fxSeen.includes('breach'), '破水的水花');
  assert.ok(e.flyH > 0, '会御器的破水后腾空');
  // 犁水：贴着水面平着轰飞
  fxSeen.length = 0;
  run(1); c.cds.clear(); e.x = p.x + 90; e.y = p.y; e.flyH = 56; p.z = p.zTarget = 56; b.poise = 0; b.breakT = 1.5; b.staggerT = 0;
  g.input.mouse.active = true; g.input.mouse.x = p.x + 1000; g.input.mouse.y = p.y; g.input.mouse.t = g.time;
  (calm(), B.heavy(false)); for (let t = 0; t < 1.2; t += 1 / 60) { frame(); p.z = p.zTarget = 56; if (process.env.DBG) console.log(t.toFixed(2), B.isAir(e), Math.round(b.z), Math.round(Math.hypot(b.vx, b.vy)), Math.round(e.x - waterX!), b.subT.toFixed(2), e.hideT.toFixed(2), kinds().slice(-2).join()); }
  g.input.mouse.active = false;
  const wakes = fxSeen.filter((k) => k === 'wake').length;
  assert.ok(wakes >= 5, `犁出一道水沟：${wakes} 记浪`);
  unwatch();
  // 主角被砸进水里：沉 1 息、动不了，浮起来
  fresh(); run(0.05); waterX = p.x - 400; p.flying = true; p.z = p.zTarget = 200;
  B.launchPlayer(1, 0, 200, -2400, null, true);
  let psank = false; for (let t = 0; t < 1.5 && !psank; t += 1 / 60) { frame(); if (B.pSubT > 0) psank = true; }
  assert.ok(psank && B.playerLift < -40 && B.holdsPlayer && !p.flying, '主角被砸进水里：遁光散了，沉下去、动不了');
  run(1.0); assert.ok(B.pSubT <= 0, '1 息后浮起');
  run(0.4); assert.ok(!B.holdsPlayer, '浮起后能动');
  waterX = null; p.flying = false; p.z = 0; B.onSubmerge = null;
}

// 18. 敌人和 NPC 也会近战：体修欺身连击、各派配了近战、走兽连咬带甩、变招（抓投 / 佯攻）、你脱困后追一手；派系混战里体修打 NPC
{
  fresh(); run(0.1);
  const t = cultivator(p.x + 600, p.y, 3, 1, 'tixiu', '铁臂散修'); t.aggro = true; t.maxHp = t.hp = 1e7; c.enemies.push(t);
  assert.ok(kitOf(t).some((s) => s.k === 'brawl'), '体修流派配了「贴身连击」');
  for (let s = 0; s < 10 && !kinds().some((k) => k.startsWith('npc-')); s += 1 / 60) { frame(); h.hp = 1; }
  assert.ok(kinds().some((k) => k === 'npc-light' || k === 'npc-heavy' || k === 'npc-grab'), `体修扑上来贴身打：${kinds()}`);
  for (const sch of ['qixuan', 'huadao', 'jujian', 'tiansha']) { const x = cultivator(p.x + 2000, p.y, 3, 1, sch, sch); assert.ok(kitOf(x).some((s) => s.k === 'brawl'), `${sch} 配了近战`); }
  // 五阶以上走兽：连咬带甩
  fresh(); run(0.1);
  const w = new Enemy(ENEMIES.xuehou, p.x + 500, p.y, 3, 1); w.blv = Math.max(5, w.blv); w.aggro = true; w.maxHp = w.hp = 1e7; c.enemies.push(w);
  assert.ok(kitOf(w).some((s) => s.k === 'brawl'), '五阶走兽配了扑咬连甩');
  let tossed = false;
  for (let s = 0; s < 16 && !tossed; s += 1 / 60) { frame(); h.hp = 1; if (B.pb.air && kinds().includes('npc-toss')) tossed = true; }
  assert.ok(kinds().includes('npc-bite'), `走兽扑咬：${kinds()}`);
  assert.ok(tossed, '被甩飞一小段');
  // 变招：几套下来有抓投、有佯攻
  const pats = new Set<string>(); const ai0 = { sets: 0, beast: false, proto: false } as any;
  for (let i = 0; i < 40; i++) pats.add((B.foes as any).pattern(t, ai0));
  assert.ok([...pats].some((s) => s.includes('g')) && [...pats].some((s) => s.startsWith('f')), `变招：${[...pats]}`);
  // 你脱困后追一手
  fresh(); run(0.1);
  const q = B.spawnBrawler(p.x + 500, p.y, 3, 0); q.aggro = true; q.maxHp = q.hp = 1e7; B.peek(q)!.ai!.cd = 99;
  B.launchPlayer(-1, 0, 300, 300, q); run(0.2); B.pb.techCd = 0; (calm(), B.tech());
  let chased = false; for (let i = 0; i < 20 && !chased; i++) { frame(); if (B.peek(q)!.ai!.st === 'rush') chased = true; }
  assert.ok(chased, '你脱困后它追一手');
  // 派系混战：体修对 NPC 近战（npcHit、对方挨打）
  fresh(); run(0.1);
  const A = newTeam('甲'), Bt = newTeam('乙');
  const m1 = cultivator(p.x - 600, p.y + 1200, 3, 1, 'tixiu', '甲体修'); m1.team = A; m1.aggro = true; m1.maxHp = m1.hp = 1e6;
  const m2 = cultivator(p.x + 600, p.y + 1200, 3, 1, 'huangfeng', '乙剑修'); m2.team = Bt; m2.aggro = true; m2.maxHp = m2.hp = 1e6;
  c.enemies.push(m1, m2);
  const npcHit0 = c.npcHit.bind(c); let brawlOnNpc = 0;
  c.npcHit = (src: any, tg: any, ...a: any[]) => { if (src === m1 && B.peek(m1)?.ai?.tg === tg) brawlOnNpc++; return npcHit0(src, tg, ...a); };
  for (let s = 0; s < 20 && brawlOnNpc < 2; s += 1 / 60) { frame(); h.hp = 1; }
  c.npcHit = npcHit0;
  assert.ok(brawlOnNpc >= 2, `派系混战里体修真的近战（对 NPC 出手 ${brawlOnNpc} 下）`);
}

// 19. 流派克制：欺身路上撞上敌方的火墙被拦下（冲刺中断、吃伤害、短硬直）；NPC 体修扑过来撞上你的持续范围技也一样；剑修被盯上后撤布阵
{
  fresh(); run(0.1);
  const e = foe(1000, 3); c.lock = e; c.manual = true;
  const src = foe(-800, 3);
  c.foe.hz.push({ k: 'circle', x: p.x + 450, y: p.y, r: 150, ang: 0, spread: 0, len: 0, w: 0, t: 1, tele: 0.5, dur: 0, el: 'fire', dmg: 300, realm: 3, src, fired: true, tick: 9, pool: 3, pooling: true } as any);
  const x0 = p.x;
  (calm(), B.rush());
  for (let i = 0; i < 40 && !kinds().includes('blocked'); i++) frame();
  assert.ok(kinds().includes('blocked'), `欺身撞上火墙被拦下：${kinds()}`);
  assert.ok(!kinds().includes('rush'), '没扑到对手');
  assert.ok(B.pb.staggerT > 0, '短硬直');
  assert.ok(p.x - x0 < 500, `停在火墙边上：${Math.round(p.x - x0)}`);
  c.foe.hz.length = 0;
  // NPC 体修扑过来撞上你的持续范围技
  fresh(); run(0.1);
  const t = B.spawnBrawler(p.x + 900, p.y, 3, 0); t.aggro = true; t.maxHp = t.hp = 1e7;
  c.fields.push({ x: p.x + 450, y: p.y, r: 160, t: 0, dur: 6, fx: 'flame', color: '255,120,40', dmg: 400, tick: 9, stCh: 0, lv: 0, realm: 3, school: '火' } as any);
  const hp0 = t.hp; B.forceRush(t);
  for (let i = 0; i < 60 && t.hp === hp0; i++) frame();
  assert.ok(t.hp < hp0 && B.peek(t)!.staggerT > 0 && Math.abs(t.x - (p.x + 450)) < 260, `NPC 体修撞上你的火墙被拦下（${Math.round(t.x - p.x)}）`);
  c.fields.length = 0;
  // 剑修 / 法修被体修盯上：后撤，在来路上放一片留在地上的范围技
  fresh(); run(0.1); if (!B.stance) B.toggleStance();
  const sw = cultivator(p.x + 500, p.y, 3, 1, 'huangfeng', '青霞谷剑修'); sw.aggro = true; sw.maxHp = sw.hp = 1e7; c.enemies.push(sw);
  let laid = false; for (let i = 0; i < 40 && !laid; i++) { frame(); if (c.foe.hz.some((z: any) => z.src === sw && z.pool > 0)) laid = true; }
  assert.ok(laid && sw.retreatT > 0, '剑修后撤布阵');
  B.toggleStance(); c.foe.hz.length = 0;
}

// 20. P6 跃击：御器在空中对下方的目标按重击——俯冲到它头顶再砸，落差越大伤害越大
{
  const dive = (z: number) => {
    fresh(); run(0.05); p.flying = true; p.z = p.zTarget = z;
    const e = foe(300, 3); const b = B.body(e); b.poise = 1e9; b.poiseMax = 1e9;
    (calm(), B.heavy(false));
    for (let i = 0; i < 40 && !kinds().includes('dive'); i++) frame();
    const d = B.log!.find((l) => l.k === 'dive');
    return { d: d?.dmg ?? 0, z: p.z };
  };
  const r0 = Math.random; Math.random = () => 0.5;   // 不出会心（会心 ×1.6 会把落差的差别盖掉）
  const wc0 = c.wreck?.stats.calls ?? 0;
  const lo = dive(140), hi = dive(400);
  assert.ok(!c.wreck || c.wreck.stats.calls > wc0, `俯冲砸击顺带调了破坏系统（树倒、留坑）：${c.wreck?.stats.calls} 次`);
  Math.random = r0;
  assert.ok(lo.d > 0 && hi.d > 0, '俯冲砸击打中了');
  assert.ok(hi.d > lo.d * 1.3, `落差越大伤害越大：${Math.round(lo.d)} → ${Math.round(hi.d)}`);
  assert.ok(hi.z < 200, `人俯冲下来了：${Math.round(hi.z)}`);
  p.flying = false; p.z = 0;
}

// 21. 真实首领：罡气厚，破罡窗口里一记重击只轰飞一小段
{
  fresh(); run(0.1);
  const def = Object.values(ENEMIES).find((d) => d.lair && !d.flying && d.kind === 'beast')!;
  const e = new Enemy(def, p.x + 110, p.y, 3, 1); e.maxHp = e.hp = 1e8; e.aggro = true; e.kit = []; c.enemies.push(e);
  const b = B.body(e);
  assert.ok(b.poiseMax > B.poiseMaxOf(foe(-900, 3)) * 2, `${def.name}罡气厚：${b.poiseMax}`);
  b.poise = 0; b.breakT = 0.9;
  const x0 = e.x; (calm(), B.heavy(false)); waitHit(1, 0.5);
  let maxD = 0; for (let t = 0; t < 3; t += 1 / 60) { frame(); maxD = Math.max(maxD, Math.abs(e.x - x0)); }
  assert.ok(maxD > 60 && maxD < 900, `${def.name}破罡后只飞一小段：${Math.round(maxD)}`);
}

// ================================================================ r7 重击定向
// 主循环那样走一帧：先问近战这一帧世界放慢到几倍，再按缩过的 dt 更新（拼招、定向都按真实时间计时）
const loop = (rdt = 1 / 60) => { const k = B.worldK(); frame(rdt * k); return k; };
const loopFor = (sec: number) => { for (let t = 0; t < sec; t += 1 / 60) loop(); };
const broken = (e: InstanceType<typeof Enemy>) => { const b = B.body(e); b.poise = 0; b.breakT = 3; b.staggerT = 0; return b; };
const stanceOn = () => { if (!B.stance) B.toggleStance(); };
const mouseAt = (x: number, y: number) => { const M = g.input.mouse as any; M.active = true; M.x = x; M.y = y; M.t = g.time; M.sx = NaN; M.sy = NaN; };

// 22. 轻点右键：立刻出手（松开就打，不放慢）；方向按「从对手指向鼠标落点」算——鼠标放在礁石上，他就撞礁石
{
  fresh(); run(0.1); stanceOn();
  const e = foe(0, 3); e.y = p.y + 80; const b = broken(e); c.lock = e;
  const rk = B.brk.place('boulder', e.x + 700, e.y, 0.6);
  mouseAt(rk.x, rk.y);   // 从对手看正东；从你看偏下（东偏南约 6°）
  const av = B.aimView();
  assert.ok(av && !av.full && av.ok, '平时：锁定 / 身边破了罡的对手有一根淡箭头');
  assert.ok(Math.abs(av!.uy) < 1e-6 && av!.ux > 0.99, `淡箭头指向从对手到鼠标：${av!.ux.toFixed(3)}, ${av!.uy.toFixed(3)}`);
  calm(); assert.ok(B.mouse(2), '架势里右键归近战');
  assert.ok(B.aiming, '按下：先进定向（还没放慢）');
  loop(); assert.ok(B.mouseUp(2), '松开右键');
  assert.ok(!B.aiming, '轻点：松开就出手');
  let minK = 1; for (let t = 0; t < 0.5 && !B.isAir(e); t += 1 / 60) minK = Math.min(minK, loop());
  assert.ok(B.isAir(e), '轻点右键一记崩山轰飞');
  assert.ok(minK > 0.99, `轻点不放慢：${minK}`);
  assert.ok(Math.abs(b.vy) < Math.abs(b.vx) * 0.02, `朝从对手到鼠标的方向飞（不是从你到鼠标）：vx ${Math.round(b.vx)} vy ${Math.round(b.vy)}`);
  for (let t = 0; t < 2 && !rk.dead; t += 1 / 60) frame();
  assert.ok(rk.dead, '鼠标指着的巨石被撞碎');
  run(2); g.input.mouse.active = false; B.brk.reset();
}

// 23. 按住右键：放慢到约 0.3 倍；对手身上出箭头、沿途要撞上的东西和落点都算好；松开出手、时间恢复；不松手撑到 1 秒左右自动出手
{
  fresh(); run(0.1); stanceOn();
  const e = foe(90, 3); broken(e); c.lock = e;
  const rk = B.brk.place('reef', e.x + 600, e.y, 0.5);
  const o = foe(1200, 2); o.y = e.y;   // 礁石后面还站着一个
  mouseAt(e.x + 1500, e.y);
  calm(); B.mouse(2);
  const k0 = loop(); assert.ok(k0 > 0.99, `刚按下不放慢（还可能是轻点）：${k0}`);
  loopFor(0.3);
  const k1 = B.worldK();
  assert.ok(B.aimSlow && Math.abs(k1 - BX.aimSlowK) < 1e-6, `按住：世界放慢到 ${k1}`);
  const ex0 = e.x; for (let i = 0; i < 6; i++) loop();
  const av = B.aimView()!;
  assert.ok(av && av.full && av.ok && av.e === e, '按住：完整的预演');
  assert.ok(av.pts.length > 4 && av.land, `飞行路径 ${av.pts.length} 点、有落点`);
  assert.ok(av.hits.some((h) => h.k === 'rock' && Math.abs(h.x - rk.x) < 1), `沿途的礁石高亮：${JSON.stringify(av.hits)}`);
  assert.ok(av.hits.some((h) => h.k === 'unit' && Math.abs(h.x - o.x) < 1), '沿途的人高亮');
  assert.ok(av.left < 1 && av.left > 0, `倒计时：${av.left.toFixed(2)}`);
  assert.ok(Math.abs(e.x - ex0) < 1, '还没出手');
  // 预演不取 Math.random（纯画面的东西不碰游戏的随机数）
  { const r0 = Math.random; let n = 0; Math.random = () => { n++; return r0(); }; (B as any).aimCache.f = -1; B.aimView(); (B as any).aimBuild(); Math.random = r0; assert.equal(n, 0, `预演不取 Math.random（取了 ${n} 次）`); }
  B.mouseUp(2);
  assert.ok(!B.aiming, '松开右键出手');
  let flew = false; for (let t = 0; t < 0.6 && !flew; t += 1 / 60) { loop(); flew = B.isAir(e); }
  assert.ok(flew, '松开：轰飞');
  loopFor(0.3);
  assert.equal(B.worldK(), 1, '松开后时间恢复正常');
  run(3); B.brk.reset();
  // 不松手：撑到头自动出手
  fresh(); run(0.1); stanceOn();
  const e2 = foe(90, 3); broken(e2); c.lock = e2;
  calm(); B.mouse(2);
  let real = 0; while (B.aiming && real < 3) { loop(); real += 1 / 60; }
  assert.ok(!B.aiming && real > BX.aimHold + BX.aimMax - 0.05 && real < BX.aimHold + BX.aimMax + 0.1, `按住不放 ${real.toFixed(2)} 秒自动出手`);
  let flew2 = false; for (let t = 0; t < 0.8 && !flew2; t += 1 / 60) { loop(); flew2 = B.isAir(e2); }
  assert.ok(flew2, '自动出手也轰飞');
  B.mouseUp(2);   // 之后才松开：什么都不做
  loopFor(0.4); assert.equal(B.worldK(), 1, '自动出手后时间恢复');
  run(3);
}

// 24. 上挑：按住上升键（御剑时就是空格）出手——打上天（不超过飞行上限），在空中滞留一会儿再落下；
//     接着按追击：瞬移到他头顶，这一下默认往下砸（打上天再砸下来）
{
  fresh(); run(0.1); stanceOn();
  const e = foe(90, 3); const b = broken(e); c.lock = e;
  g.input.keys.add('ascend');
  calm(); B.mouse(2); assert.equal(B.aimView()?.v, 1, '按着上升键：箭头是上挑');
  loopFor(0.3); const av = B.aimView()!;
  const topZ = Math.max(...av.pts.map((q) => q[2]));
  assert.ok(topZ > 250 && topZ <= ALT.max - BX.upRoom + 1, `上挑的预演打到高处：${Math.round(topZ)}`);
  B.mouseUp(2); g.input.keys.delete('ascend');
  let maxZ = 0, high = 0;
  for (let t = 0; t < 1.6; t += 1 / 60) { loop(); maxZ = Math.max(maxZ, e.z); if (e.z > maxZ - 40 && maxZ > 200) high += 1 / 60; }
  assert.ok(b.up || !B.isAir(e), '上挑打上去的');
  assert.ok(maxZ > 250 && maxZ <= ALT.max - BX.upRoom + 1, `打到高处、不过飞行上限：${Math.round(maxZ)}`);
  assert.ok(high > 0.45, `在空中滞留了一会儿：${high.toFixed(2)} 秒`);
  let landed = false; for (let t = 0; t < 3 && !landed; t += 1 / 60) { loop(); landed = !B.isAir(e) && e.z < 1; }
  assert.ok(landed, '滞空完了会落下');
  run(1);
  // 上挑 → 追击（瞬移到头顶）→ 下砸
  fresh(); run(0.1); stanceOn(); h.mp = 1;
  const f = foe(90, 3); broken(f); c.lock = f;
  g.input.keys.add('ascend'); calm(); B.heavy(false, true); g.input.keys.delete('ascend');
  let up = false; for (let t = 0; t < 1 && !(up && f.z > 220); t += 1 / 60) { loop(); up = B.isAir(f) && !!B.peek(f)!.up; }
  assert.ok(up && f.z > 220, `先上挑：${Math.round(f.z)}`);
  const n0 = B.log!.length;
  calm(); assert.ok(B.key('dodge', false), '空格：追击');
  const meZ = p.z + B.playerLift;
  assert.ok(meZ > f.z + 20 || B.peek(f)!.meteor === 1, `瞬移到他头顶：你 ${Math.round(meZ)}，他 ${Math.round(f.z)}`);
  assert.ok(Math.hypot(p.x - f.x, p.y - f.y) < 120, '贴在他头顶');
  assert.ok(B.log!.slice(n0).some((l) => l.k === 'slam'), `默认往下砸：${kinds().slice(n0)}`);
  assert.ok(B.peek(f)!.meteor === 1, '被砸成流星直坠下去');
  let down = false; for (let t = 0; t < 2 && !down; t += 1 / 60) { loop(); down = !B.isAir(f) && f.z < 1; }
  assert.ok(down, '砸到地上');
  for (let t = 0; t < 2 && B.playerLift > 0; t += 1 / 60) loop();
  assert.ok(B.playerLift === 0 && !B.holdsPlayer, '你也落回地上（轻轻落地、不伤自己）');
  run(1);
  // 首领：只在破罡窗口里挑得起来，也只挑起一小段
  fresh(); run(0.1);
  const bs = foe(90, 3); bs.boss = true; c.lock = bs;
  calm(); B.heavy(false, true); waitHit(1, 0.6); run(0.1);
  assert.ok(!B.isAir(bs), '首领罡气没破：挑不起来');
  broken(bs); c.cds.clear(); let bz = 0;
  calm(); B.heavy(false, true); for (let t = 0; t < 2; t += 1 / 60) { frame(); bz = Math.max(bz, bs.z); }
  assert.ok(bz > 20 && bz < 200, `首领破罡后只挑起一小段：${Math.round(bz)}`);
  run(2);
}

// 25. 往下砸也认 C（下降键）；架势里的空格：右键按着时不追击（是选上挑）；御剑、手上没有可追的人时放行成上升
{
  fresh(); run(0.1); stanceOn();
  const e = foe(90, 3); broken(e); c.lock = e;
  g.input.keys.add('descend'); assert.equal(B.aimView()?.v, -1, '按着下降键：淡箭头是下砸'); g.input.keys.delete('descend');
  calm(); B.mouse(2);
  assert.equal(B.key('dodge', false), false, '右键按着：空格不归追击（game 把它记成上挑）');
  B.mouseUp(2); run(1.5);
  fresh(); run(0.1); stanceOn(); p.flying = true; p.z = p.zTarget = 120;
  assert.equal(B.key('dodge', false), false, '御剑、没有可追的：空格放行成上升');
  const f = foe(90, 3); f.flyH = 120; broken(f); c.lock = f; c.cds.clear();
  calm(); B.heavy(false); waitHit(B.log!.length + 1, 0.5); run(0.05);
  assert.ok(B.isAir(f), '轰飞');
  assert.ok(B.key('dodge', false), '对方倒飞中：空格是缩地追击');
  p.flying = false; p.z = 0; run(3);
}

// 26. 手机：长按「崩」变成小摇杆，往哪拖对手就往哪飞；按着时点「降」是往下砸；技能栏的崩山击同轻点右键、认上升键
{
  fresh(); run(0.1); stanceOn();
  const e = foe(90, 3); const b = broken(e); c.lock = e;
  assert.ok(B.aimStart('touch'), '长按：进定向');
  B.aimDrag(0, -1);   // 往屏幕上方拖
  loopFor(0.3); assert.ok(B.aimSlow, '同样放慢');
  const av = B.aimView()!; assert.ok(av.uy < -0.99, `箭头跟着拖的方向：${av.uy.toFixed(2)}`);
  B.aimRelease();
  for (let t = 0; t < 0.6 && !B.isAir(e); t += 1 / 60) loop();
  assert.ok(B.isAir(e) && b.vy < 0 && Math.abs(b.vx) < Math.abs(b.vy) * 0.05, `往拖的方向飞：vx ${Math.round(b.vx)} vy ${Math.round(b.vy)}`);
  run(3);
  fresh(); run(0.1); stanceOn();
  const e2 = foe(90, 3); broken(e2); c.lock = e2;
  B.aimStart('touch'); B.aimVert(-1); assert.equal(B.aimView()?.v, -1, '点「降」：下砸'); B.aimVert(-1); assert.equal(B.aimView()?.v, 0, '再点一下取消');
  B.aimVert(1); B.aimRelease();
  let up = false; for (let t = 0; t < 0.6 && !up; t += 1 / 60) { loop(); up = !!B.peek(e2)?.up; }
  assert.ok(up, '点「升」松手：上挑');
  run(3);
  // 技能栏崩山击：不进架势也能放，同轻点右键（朝鼠标落点）；按住上升键是上挑
  fresh(); run(0.1); if (B.stance) B.toggleStance();
  const e3 = foe(90, 3); broken(e3); c.lock = e3;
  g.input.keys.add('ascend'); calm(); B.castArt('bx_bengshan'); g.input.keys.delete('ascend');
  let up3 = false; for (let t = 0; t < 0.6 && !up3; t += 1 / 60) { loop(); up3 = !!B.peek(e3)?.up; }
  assert.ok(up3, '技能栏崩山击 + 上升键：上挑');
  run(3);
}

// 27. 锁定目标时对齐高度：御剑时对手比你高 / 低，欺身、缩地追击都打得到，人也到了他那个高度
{
  fresh(); run(0.1); p.x = home0.x; p.y = home0.y; p.flying = true; p.z = p.zTarget = 56;
  const e = foe(900, 3); e.flyH = 340; e.aggro = false; c.lock = e; c.manual = true;   // 不让它后撤布阵（那是另一回事：撞阵被拦）
  (calm(), B.rush());
  let fr = 0; while (!kinds().includes('rush') && fr < 90) { frame(); fr++; }
  assert.ok(kinds().includes('rush'), `欺身扑到比你高 ${340 - 56} 的对手：${kinds()}`);
  assert.ok(Math.abs(p.z - e.z) < 100, `连高度一起扑过去：你 ${Math.round(p.z)}，他 ${Math.round(e.z)}`);
  // 轻击：对手比你低很多（又不在俯冲范围里）也会垫步连高度一起扑过去
  run(1.2); p.z = p.zTarget = 400; e.x = p.x + 90; e.y = p.y; e.flyH = 120; B.body(e).staggerT = 0;
  const n0 = B.log!.length; (calm(), B.light()); waitHit(n0 + 1, 0.8);
  assert.ok(B.log!.length > n0 && B.log![n0].dmg > 0, '轻击打得到低处的对手');
  assert.ok(Math.abs(p.z - e.z) < 100, `垫步到他的高度：你 ${Math.round(p.z)}，他 ${Math.round(e.z)}`);
  // 重击：对手比你高（不在俯冲范围里），垫步连高度一起扑过去再打
  run(1); c.cds.clear(); p.z = p.zTarget = 56; e.x = p.x + 90; e.y = p.y; e.flyH = 330; B.body(e).staggerT = 0;
  { const n = B.log!.length; (calm(), B.heavy(false)); waitHit(n + 1, 1); assert.ok(B.log!.slice(n).some((l) => l.k === 'heavy' && l.dmg > 0), `重击打得到高处的对手：${kinds().slice(n)}`); assert.ok(Math.abs(p.z - e.z) < 100, `垫步到他的高度：你 ${Math.round(p.z)}，他 ${Math.round(e.z)}`); }
  run(2);
  // 缩地追击：平着轰出去的人比你高，追上去也到他的高度
  run(1); c.cds.clear(); p.z = p.zTarget = 120; e.x = p.x + 90; e.y = p.y; e.flyH = 300; broken(e);
  (calm(), B.heavy(false)); waitHit(B.log!.length + 1, 0.8); run(0.1);
  assert.ok(B.isAir(e), '轰飞高处的对手');
  const n1 = B.log!.length; (calm(), B.pursue());
  assert.ok(B.log!.slice(n1).some((l) => l.k === 'pursuit'), '缩地追上去打到了');
  assert.ok(Math.abs(p.z - e.z) < 100, `追到他的高度：你 ${Math.round(p.z)}，他 ${Math.round(e.z)}`);
  p.flying = false; p.z = 0; run(3);
}

// ================================================================ 兵器接进近战（r7-forge）
// 以上各段卡着拳脚的逐位行为（固定时钟、固定随机序列），一个字没改；下面是每种兵器自己的断言（都在后面，不影响上面取的随机数）。
const CU = await import('../src/world/cultivation');
const W = await import('../src/data/weapons');
const CH = await import('../src/gfx/character');
const MV = await import('../src/world/brawlmoves');
const ARM = await import('../src/world/arms');
const equip = (kind: 'fist' | 'sword' | 'heavy' | 'spear', tier = 3) => {
  const ls = CU.itemListeners.splice(0);
  if (h.bag.some((x: any) => x.worn === 'weapon')) CU.unwearGear(h, 'weapon');
  if (kind !== 'fist') { const id = W.weaponItemId(kind, tier); CU.addItem(h, id, 1); const b = h.bag.filter((x: any) => x.id === id && !x.worn).pop(); CU.wearGear(h, b!); }
  CU.itemListeners.push(...ls);
  B.syncWeapon();
};
const tough = (e: InstanceType<typeof Enemy>) => { const b = B.body(e); b.poise = b.poiseMax = 1e9; return b; };
const home = () => { p.x = home0.x; p.y = home0.y; p.flying = false; p.z = p.zTarget = 0; c.pst = {}; };   // 状态（定身、眩晕）也清掉：前面几段的对手可能留了一身
const noCrit = <T,>(f: () => T): T => { const r0 = Math.random; Math.random = () => 0.999; try { return f(); } finally { Math.random = r0; } };
const hitsOn = (e: InstanceType<typeof Enemy>, ks = ['light', 'finisher', 'heavy']) => B.log!.filter((l) => l.who === e.name && ks.includes(l.k) && l.dmg > 0).length;
let uid = 0; const named = (e: InstanceType<typeof Enemy>) => { e.name = `靶${++uid}`; return e; };

// 28. 兵器谱：拳脚那一页和原来写死的常数一样；三种兵器的数各不相同；出手时刻都落在动作的出手时段（ACTION_HIT）里
{
  const F = W.WEAPONS.fist.feel;
  assert.ok(F.reach === 105 && F.lunge === 380 && F.light.length === 4 && F.light[3].fin && F.light[3].at === 0.09 && F.heavy.at === 0.14 && F.heavy.cd === 0.55 && F.rush.speed === 2600 && F.rush.max === 1800 && BX.rushMp === F.rush.mp, '拳脚那一页');
  for (const k of ['sword', 'heavy', 'spear'] as const) {
    const f = W.WEAPONS[k].feel, M = CH.WEAPON_MOVES[k];
    assert.equal(f.light.length, M.light.length, `${k}：连段下数和动作表一致`);
    f.light.forEach((s, i) => { const [h0, h1] = CH.ACTION_HIT[M.light[i] as keyof typeof CH.ACTION_HIT]; assert.ok(s.at >= h0 && s.at <= h1, `${k} 第 ${i + 1} 下的出手 ${s.at} 落在 ${h0}–${h1}`); });
    const [h0, h1] = CH.ACTION_HIT[M.heavy[0] as keyof typeof CH.ACTION_HIT]; assert.ok(f.heavy.at >= h0 && f.heavy.at <= h1, `${k} 重击的出手落在动作里`);
    assert.equal(f.hit, 'blade', `${k} 按刃轨迹判`);
  }
  assert.deepEqual([W.WEAPONS.sword.feel.light.length, W.WEAPONS.heavy.feel.light.length, W.WEAPONS.spear.feel.light.length], [5, 3, 4], '剑五下、重兵三下、枪四下');
  assert.ok(W.WEAPONS.spear.feel.reach > W.WEAPONS.sword.feel.reach && W.WEAPONS.sword.feel.reach > F.reach, '枪最长、剑中等、拳最短');
  assert.ok(W.WEAPONS.sword.feel.light[0].dmg > F.light[0].dmg && W.WEAPONS.sword.feel.light[0].poise < F.light[0].poise, '剑：伤血多、削罡气少');
  assert.ok(W.WEAPONS.heavy.feel.heavy.poise > W.WEAPONS.sword.feel.heavy.poise && W.WEAPONS.heavy.feel.launchK > W.WEAPONS.spear.feel.launchK && W.WEAPONS.heavy.feel.armor, '重兵：削罡最狠、轰得最远、有霸体');
  assert.ok(W.WEAPONS.spear.feel.rush.max > Math.max(W.WEAPONS.sword.feel.rush.max, W.WEAPONS.heavy.feel.rush.max, F.rush.max), '枪的突刺最远');
}

// 29. 连段下数和节奏：一直按着轻击，剑五下一套最快、枪四下、重兵三下最慢；最后一下都是收式
{
  const rhythm: Record<string, number> = {};
  for (const k of ['fist', 'sword', 'spear', 'heavy'] as const) {
    fresh(); home(); run(0.05); equip(k);
    const e = named(foe(90, 3)); tough(e);
    const times: number[] = [];
    for (let t = 0; t < 4 && times.length < 6; t += 1 / 60) { (calm(), B.light()); const n0 = B.log!.length; frame(); if (B.log!.slice(n0).some((l) => l.who === e.name && (l.k === 'light' || l.k === 'finisher'))) times.push(g.time); }
    const ks = B.log!.filter((l) => l.who === e.name && (l.k === 'light' || l.k === 'finisher')).map((l) => l.k);
    const n = W.WEAPONS[k].feel.light.length;
    assert.deepEqual(ks.slice(0, n), [...Array(n - 1).fill('light'), 'finisher'], `${k}：${n} 下一套，最后一下收式（${ks.slice(0, n)}）`);
    rhythm[k] = (times[n - 1] - times[0]) / (n - 1);
    run(1);
  }
  assert.ok(rhythm.sword < rhythm.spear && rhythm.spear < rhythm.heavy && rhythm.fist < rhythm.heavy, `节奏（每下间隔）：拳 ${rhythm.fist.toFixed(3)} 剑 ${rhythm.sword.toFixed(3)} 枪 ${rhythm.spear.toFixed(3)} 重兵 ${rhythm.heavy.toFixed(3)}`);
  equip('fist');
}

// 30. 伤血和削罡气：同一个人挨第一下——剑伤得比拳重、削罡比拳轻；重兵削罡最狠
{
  const one = (k: 'fist' | 'sword' | 'heavy' | 'spear') => {
    fresh(); home(); run(0.05); equip(k);
    const e = named(foe(90, 3)); const b = B.body(e), p0 = b.poise;
    noCrit(() => { (calm(), B.light()); for (let i = 0; i < 40 && !B.log!.some((l) => l.who === e.name && l.k === 'light'); i++) frame(); });
    const d = B.log!.find((l) => l.who === e.name && l.k === 'light')?.dmg ?? 0;
    run(0.6); return { d, poise: p0 - b.poise };
  };
  const f = one('fist'), s = one('sword'), hv = one('heavy');
  assert.ok(s.d > f.d && s.poise < f.poise, `剑：伤血 ${Math.round(s.d)} > 拳 ${Math.round(f.d)}，削罡 ${s.poise.toFixed(1)} < 拳 ${f.poise.toFixed(1)}`);
  assert.ok(hv.poise > f.poise && hv.poise > s.poise, `重兵削罡最狠：${hv.poise.toFixed(1)}`);
  equip('fist');
}

// 31. 重兵横扫：一下打到弧里所有人（拳只打一个）
{
  const sweep = (k: 'fist' | 'heavy') => {
    fresh(); home(); run(0.05); equip(k); p.st.yaw = p.st.targetYaw = Math.PI / 2;   // 朝正东
    const es = [-0.6, 0, 0.6].map((a) => { const e = named(foe(Math.cos(a) * 100, 3)); e.y = p.y + Math.sin(a) * 100; tough(e); return e; });
    c.lock = es[1];
    (calm(), B.light()); for (let i = 0; i < 40; i++) frame();
    const n = es.filter((e) => hitsOn(e) > 0).length; run(0.8); return n;
  };
  const nf = sweep('fist'), nh = sweep('heavy');
  assert.equal(nf, 1, `拳只打一个：${nf}`);
  assert.equal(nh, 3, `重兵一下横扫三个：${nh}`);
  equip('fist');
}

// 32. 枪的直刺穿人：一条线上的都中，线外的不中
{
  fresh(); home(); run(0.05); equip('spear');
  const line = [110, 250, 380].map((dx) => { const e = named(foe(dx, 3)); tough(e); return e; });
  const off = named(foe(150, 3)); off.y = p.y + 220; tough(off);
  c.lock = line[0];
  (calm(), B.light()); for (let i = 0; i < 40; i++) frame();
  assert.ok(line.every((e) => hitsOn(e) > 0), `一枪扎穿一条线：${line.map((e) => hitsOn(e))}`);
  assert.equal(hitsOn(off), 0, '线外的不中');
  run(0.8); equip('fist');
}

// 33. 剑的重击：斩出一道剑气，几步外的人也挨得到（比斩本身轻）
{
  fresh(); home(); run(0.05); equip('sword');
  const near = named(foe(100, 3)), far = named(foe(560, 3)); tough(near); tough(far); c.lock = near;
  noCrit(() => { (calm(), B.heavy(false)); for (let t = 0; t < 1.2; t += 1 / 60) frame(); });
  const qi = B.log!.find((l) => l.who === far.name && l.k === 'qi'), hv = B.log!.find((l) => l.who === near.name && l.k === 'heavy');
  assert.ok(qi && qi.dmg > 0, `剑气打到 560 外的人：${kinds()}`);
  assert.ok(hv && hv.dmg > qi!.dmg, `剑气（${Math.round(qi!.dmg)}）比斩本身（${Math.round(hv!.dmg)}）轻`);
  assert.ok(!B.log!.some((l) => l.who === near.name && l.k === 'qi'), '斩中的人剑气不再打第二下');
  assert.equal(B.waves.length, 0, '剑气飞到头就没了');
  run(0.5); equip('fist');
}

// 34. 重兵霸体：出手到命中之间挨了轻击不被打断（照样吃伤害）；剑没有霸体，一挨就断
{
  const tryIt = (k: 'sword' | 'heavy') => {
    fresh(); home(); run(0.05); equip(k);
    const e = named(foe(90, 3)); tough(e); c.lock = e;
    const t = B.spawnBrawler(p.x - 90, p.y, 3, 0); t.maxHp = t.hp = 1e7; t.aggro = false;
    (calm(), B.light()); frame();
    const hp0 = h.hp;
    (B.foes as any).strike(t, B.body(t), { ...B.peek(t)!.ai!, tg: null }, 'j', 1, 0);   // 体修一记轻拳打在你身上（走 hitPlayer）
    for (let i = 0; i < 40; i++) frame();
    return { hit: hitsOn(e), hurt: h.hp < hp0 };
  };
  const hv = tryIt('heavy'), sw = tryIt('sword');
  assert.ok(hv.hurt && hv.hit > 0, `重兵：挨了一拳照样砍中（砍中 ${hv.hit}、掉血 ${hv.hurt}）`);
  assert.ok(sw.hurt && sw.hit === 0, `剑：一挨就被打断（砍中 ${sw.hit}）`);
  run(0.5); equip('fist');
}

// 35. 枪的重击自带上挑：不按上升键也挑起一截，按了更高；拳不按就是平着轰
{
  const lift = (k: 'fist' | 'spear', up: boolean) => {
    fresh(); home(); run(0.05); equip(k);
    const e = named(foe(90, 3)); broken(e); c.lock = e;
    if (up) g.input.keys.add('ascend');
    (calm(), B.heavy(false, up)); g.input.keys.delete('ascend');
    let z = 0; for (let t = 0; t < 1.5; t += 1 / 60) { frame(); z = Math.max(z, e.z); }
    const wasUp = !!B.peek(e)?.up || z > 150; run(2.5); return { z, wasUp };
  };
  const f0 = lift('fist', false), s0 = lift('spear', false), s1 = lift('spear', true);
  assert.ok(f0.z < 150, `拳不按上升键：平着轰（最高 ${Math.round(f0.z)}）`);
  assert.ok(s0.z > 170, `枪不按上升键也挑起来：${Math.round(s0.z)}`);
  assert.ok(s1.z > s0.z + 40, `按了上升键挑得更高：${Math.round(s1.z)} > ${Math.round(s0.z)}`);
  equip('fist');
}

// 36. 品阶倍率：空手 1，凡铁到通天逐阶上升；同一下剑，通天比凡铁重约三成六；高阶也不打穿（同境界妖兽仍要十几下）
{
  assert.equal(W.weaponTierMul('fist', 6), 1, '空手 1');
  for (let t = 1; t < 7; t++) assert.ok(W.weaponTierMul('sword', t) > W.weaponTierMul('sword', t - 1), `第 ${t} 阶比上一阶高`);
  // 兵器物品自己带的近战属性（melee）也随品阶涨，在 meleeMul 里；两样相乘才是实际倍率
  let k0 = 0, k6 = 0;
  const dmgAt = (tier: number) => { fresh(); home(); run(0.05); equip('sword', tier); const k = B.patk; if (tier === 0) k0 = k; else k6 = k; const e = named(foe(90, 3)); tough(e); e.dfn = 0; /* 防御是减法，不清零的话高的那一下看着更重 */ noCrit(() => { (calm(), B.light()); for (let i = 0; i < 30; i++) frame(); }); run(0.5); return B.log!.find((l) => l.who === e.name && l.k === 'light')!.dmg; };
  const d0 = dmgAt(0), d6 = dmgAt(6);
  assert.ok(Math.abs(B.tierMul - 1) < 1e-9 || B.wk !== 'fist', '空手不乘');
  assert.ok(Math.abs(d6 / d0 - k6 / k0) < 0.06 && d6 / d0 > 1.3 && d6 / d0 < 1.7, `通天 / 凡铁 = ${(d6 / d0).toFixed(3)}（攻力 × 近战加成 × 品阶倍率 = ${(k6 / k0).toFixed(3)}）`);
  // 同境界妖兽（结丹初期的妖兽）要几下：按轻击一下的伤害算
  const beastDef = Object.values(ENEMIES).find((d) => d.kind === 'beast' && !d.lair && !d.flying)!;
  const per = (k: 'fist' | 'sword' | 'heavy' | 'spear', tier: number) => { fresh(); home(); run(0.05); equip(k, tier); const e = new Enemy(beastDef, p.x + 90, p.y, h.realm, 0); e.aggro = true; e.speed = 0; e.kit = []; e.name = `兽${++uid}`; const hp0 = e.maxHp; e.maxHp = e.hp = 1e9; c.enemies.push(e); tough(e); noCrit(() => { (calm(), B.light()); for (let i = 0; i < 30; i++) frame(); }); run(0.5); return hp0 / B.log!.find((l) => l.who === e.name && l.k === 'light')!.dmg; };
  const nFist = per('fist', 0), nSword6 = per('sword', 6), nHeavy6 = per('heavy', 6);
  console.log('  同境界妖兽（结丹）要几下轻击：拳', nFist.toFixed(1), '| 三阶：剑', per('sword', 3).toFixed(1), '重兵', per('heavy', 3).toFixed(1), '枪', per('spear', 3).toFixed(1), '| 通天：剑', nSword6.toFixed(1), '重兵', nHeavy6.toFixed(1), '枪', per('spear', 6).toFixed(1));
  assert.ok(nSword6 > 6 && nHeavy6 > 5, `通天兵器也不把同境界妖兽一两下打死（剑 ${nSword6.toFixed(1)} 下、重兵 ${nHeavy6.toFixed(1)} 下）`);
  equip('fist');
}

// 37. 换兵器即时生效（不用重进架势）；本命飞剑握在手里当剑使
{
  fresh(); home(); run(0.05); stanceOn(); equip('sword');
  const e = named(foe(90, 3)); tough(e); c.lock = e;
  (calm(), B.light()); frame();
  assert.ok(String(p.st.action).startsWith('sword'), `拿剑：播剑的动作（${p.st.action}）`);
  run(1);
  equip('spear');   // 背包里换成枪：不收势
  (calm(), B.light()); frame();
  assert.ok(String(p.st.action).startsWith('spear') && B.wk === 'spear', `换成枪，下一下就是枪（${p.st.action}）`);
  assert.ok(B.stance, '没重进架势');
  run(1); equip('fist');
  CU.addItem(h, 'art_qingzhu', 1); CU.bindBond(h, 'art_qingzhu'); B.syncWeapon();
  assert.ok(B.wk === 'sword' && B.wFrom === 'bond', `槽空着、本命结了碧竹飞云剑：当剑使（${B.wk} / ${B.wFrom}）`);
  frame(); assert.ok(p.look.weapon?.kind === 'sword' && !!p.look.weapon.color, '人物手里画的是那口本命剑（带它的光色）');
  (calm(), B.light()); frame();
  assert.ok(String(p.st.action).startsWith('sword'), `本命飞剑出的是剑招（${p.st.action}）`);
  run(1); CU.bindBond(h, 'art_qingzhu'); B.syncWeapon(); assert.equal(B.wk, 'fist', '解了本命就回到拳脚');
  B.toggleStance(); run(0.2);
}

// 38. 兵器拿出 / 收回：进架势拿在手里（从上一帧的姿势过渡过去），收势收回；不进架势用技能栏放也拿出来打，过一会儿收回
{
  fresh(); home(); run(0.05); equip('heavy'); if (B.stance) B.toggleStance(); frame();
  assert.equal(p.st.armed, false, '不在架势里：收在背上');
  B.toggleStance(); frame();
  assert.ok(p.st.armed && p.st.blend < 1, `进架势：拿在手里（过渡中 blend ${p.st.blend.toFixed(2)}）`);
  B.toggleStance(); frame(); assert.equal(p.st.armed, false, '收势：收回去');
  const e = named(foe(90, 3)); tough(e); c.lock = e;
  (calm(), B.castArt('bx_lianquan')); frame();
  assert.ok(p.st.armed && String(p.st.action).startsWith('heavy'), `技能栏直接放：拿出兵器打（${p.st.action}）`);
  run(3.5); assert.equal(p.st.armed, false, '打完过几息收回背上');
  equip('fist');
}

// 39. 技能栏四式跟着兵器变（id 不变）：名字、图标字、说明
{
  equip('sword'); frame();
  assert.equal(W.HELD_NOW.kind, 'sword', '界面读的「手里的兵器」跟着变');
  const v = W.meleeArtView('bx_lianquan', W.HELD_NOW.kind)!;
  assert.ok(v.name === '连斩' && v.glyph === '斩', `剑：连拳 → ${v.name}（${v.glyph}）`);
  assert.equal(W.meleeArtView('bx_bengshan', 'heavy')!.name, '撼地', '重兵：崩山击 → 撼地');
  assert.equal(W.meleeArtView('bx_qishen', 'spear')!.name, '白虹贯日', '枪：化虹欺身 → 白虹贯日');
  assert.equal(W.meleeArtView('bx_lianquan', 'fist'), null, '空手照原样（连拳）');
  for (const k of ['sword', 'heavy', 'spear'] as const) for (const id of ['bx_lianquan', 'bx_bengshan', 'bx_qishen', 'bx_suodi']) assert.ok(W.meleeArtView(id, k)?.desc, `${k} ${id} 有说明`);
  equip('fist'); frame(); assert.equal(W.HELD_NOW.kind, 'fist', '卸下回到拳脚');
}

// 40. 定向、上挑、追击到头顶下砸：每种兵器都成立；拼招换了兵器照常
{
  for (const k of ['sword', 'heavy', 'spear'] as const) {
    fresh(); home(); run(0.1); stanceOn(); h.mp = 1; equip(k);
    const f = named(foe(90, 3)); broken(f); c.lock = f;
    const av = B.aimView(); assert.ok(av && av.ok, `${k}：破了罡的对手脚下有淡箭头`);
    g.input.keys.add('ascend'); calm(); B.heavy(false, true); g.input.keys.delete('ascend');
    let up = false; for (let t = 0; t < 1.2 && !(up && f.z > 200); t += 1 / 60) { loop(); up = B.isAir(f) && !!B.peek(f)!.up; }
    assert.ok(up && f.z > 200, `${k}：上挑打上天（${Math.round(f.z)}）`);
    calm(); assert.ok(B.key('dodge', false), `${k}：空格追击`);
    assert.ok(B.peek(f)!.meteor === 1, `${k}：追到头顶往下砸成流星`);
    for (let t = 0; t < 3 && (B.isAir(f) || B.playerLift > 0); t += 1 / 60) loop();
    run(1);
    // 拼招
    fresh(); coolOff(); run(0.05);
    const e = foe(160, 3); assert.ok(CL.start(e, 'heavy'), `${k}：拼招照常开`);
    assert.ok(String(B.action()).startsWith(k), `${k}：拼招时兵器对兵器顶着（${B.action()}）`);
    CL.st!.ePick = 'brk'; CL.pick('atk'); run(0.4);
    assert.equal(CL.log[CL.log.length - 1].res, 'win', `${k}：拼招照常结算`);
    run(1.5);
  }
  equip('fist'); if (B.stance) B.toggleStance();
}

// 41. 敌人用兵器：照那种兵器的谱出招、播兵器动作、重兵前摇有霸体和地上的预警圈、枪的突刺先亮一条预警线；随机生成的人形敌人按外观哈希配兵器（不取 Math.random）
{
  const armed = (kind: 'sword' | 'heavy' | 'spear') => { fresh(); home(); run(0.05); const t = B.spawnBrawler(p.x + 500, p.y, 3, 0); t.aggro = true; t.maxHp = t.hp = 1e7; t.look = ARM.lookWithWeapon(t.look!, { kind, tier: 3 }); return t; };
  // 剑：连段走 npc-wlight，播剑的动作
  { const t = armed('sword'); let act = ''; for (let s = 0; s < 6 && !kinds().some((k) => k.startsWith('npc-w')); s += 1 / 60) { frame(); h.hp = 1; if (t.cs && CH.isWeaponAction(t.cs.action)) act = t.cs.action; }
    assert.ok(kinds().some((k) => k === 'npc-wlight' || k === 'npc-wheavy'), `持剑的体修照剑的谱出招：${kinds()}`);
    assert.ok(act.startsWith('sword'), `播剑的动作：${act}`); run(1); }
  // 重兵：重击前摇里有霸体、地上一圈预警
  { const t = armed('heavy'); let armor = false, warn = false;
    for (let s = 0; s < 8 && !kinds().includes('npc-wheavy'); s += 1 / 60) { frame(); h.hp = 1; const ai = B.peek(t)?.ai; if (ai?.st === 'wind' && ai.windK === 'h') { if (B.peek(t)!.armorT > 0) armor = true; if (c.foe.hz.some((z: any) => z.src === t && z.k === 'circle' && z.dmg === 0)) warn = true; } }
    assert.ok(kinds().includes('npc-wheavy'), `重兵的重击：${kinds()}`);
    assert.ok(armor && warn, `重兵前摇：霸体 ${armor}、地上预警圈 ${warn}`); run(1); c.foe.hz.length = 0; }
  // 枪：突刺前地上一条预警线，再沿线扎过来
  { const t = armed('spear'); B.peek(t)!.ai!.cd = 0; let line = false;
    for (let s = 0; s < 8 && !kinds().includes('npc-thrust'); s += 1 / 60) { frame(); h.hp = 1; if (c.foe.hz.some((z: any) => z.src === t && z.k === 'line' && z.dmg === 0)) line = true; }
    assert.ok(line, '枪的突刺：先亮一条预警线');
    assert.ok(kinds().includes('npc-thrust'), `沿线扎中：${kinds()}`); run(1); c.foe.hz.length = 0; }
  // 随机生成的人形敌人：按外观哈希配兵器，一个 Math.random 都不多取；体修空手
  fresh(); home();
  const many = Array.from({ length: 40 }, (_, i) => cultivator(p.x + 3000 + i * 50, p.y + 3000, 3, 1, i % 5 === 0 ? 'tixiu' : i % 3 ? 'huangfeng' : 'moxiu', `修士${i}`));
  c.enemies.push(...many);
  const r0 = Math.random; let nR = 0; Math.random = () => { nR++; return r0(); };
  B.update(0.2);
  Math.random = r0;
  const withW = many.filter((e) => e.look?.weapon), tix = many.filter((e) => e.school === 'tixiu');
  assert.equal(nR, 0, `配兵器不取 Math.random（取了 ${nR} 次）`);
  assert.ok(withW.length >= 8 && withW.length < many.length, `四十人里 ${withW.length} 个带兵器`);
  assert.ok(tix.every((e) => !e.look?.weapon), '体修一律空手');
  const again = ARM.foeWeapon({ ...many[1], look: { ...many[1].look!, weapon: undefined } } as any);
  assert.deepEqual(again, many[1].look?.weapon ?? null, '同一副外观配到同一把兵器（哈希，不是随机）');
  // 进入战斗 / 被锁定时拿出来，脱战收回去
  const a = withW[0]; a.aggro = false; frame(); frame(); for (let i = 0; i < 8; i++) frame();
  assert.equal(a.cs!.armed, false, '没进战斗：兵器收着');
  a.x = a.hx = p.x + 700; a.y = a.hy = p.y; c.lock = a; c.manual = true; for (let i = 0; i < 8; i++) { a.aggro = false; frame(); } assert.ok(a.cs!.armed, '被锁定：拿出来');
  c.lock = null; c.manual = false; for (let i = 0; i < 8; i++) { a.aggro = false; frame(); } assert.equal(a.cs!.armed, false, '脱战：收回去');
  a.aggro = true; for (let i = 0; i < 8; i++) frame(); assert.ok(a.cs!.armed, '进战斗：拿出来');
  c.enemies.length = 0;
}

// 42. 特殊招式的挂载点：别的文件注册一招（这里是只在测试里用的假招），主角学会后放进技能栏能放，敌人 AI 也会挑它；
//     招式自己推进（接管位置、播动作、调框架的击飞 / 顿帧 / 镜头），伤害走 hitEnemy / hitPlayer
{
  const art = MV.registerMove({
    id: 'test_beng', name: '试·崩拳', glyph: '试', desc: '测试用：贴身一顿，打出去再挑上天。', realm: 1, mp: 0.05, cd: 2, ai: { weight: 1000, max: 900 },
    begin(cx) { if (!cx.target) return false; cx.act(null, 'smash'); cx.data.hit = 0; },
    tick(cx) {
      if (cx.t > 0.12 && !cx.data.hit) {
        cx.data.hit = 1;
        const tg = cx.target!, tx = tg === 'p' ? p.x : tg.x, ty = tg === 'p' ? p.y : tg.y;
        cx.place(null, tx - cx.dirX * 80, ty - cx.dirY * 80);   // 接管出招者的位置：一步贴到对手跟前
        cx.hit(tg, 1.5, cx.user ? 'test-move-npc' : 'test-move'); cx.freeze(0.08); cx.cam(0.6);
        if (tg !== 'p') { B.body(tg).breakT = 1; cx.up(tg, 0.8); }
      }
      return cx.t < 0.45;
    },
  });
  assert.ok(art === 'bxm_test_beng' && (await import('../src/data/arts')).ARTS[art]?.cast === 'melee', '注册后 ARTS 里多一门近战招式');
  fresh(); home(); run(0.05);
  MV.learnMove(h, 'test_beng'); h.hotbar[0] = art;
  const e = named(foe(400, 3)); c.lock = e;
  const hk0 = hookN, mp0 = h.mp;
  (calm(), c.castSlot(0));
  assert.ok(B.pMove && B.holdsPlayer, '放出来了：主角被招式接管（不能走动）');
  assert.ok(Math.abs(mp0 - h.mp - 0.05) < 1e-6 && (c.cds.get(art) ?? 0) > 0, '扣了灵力、进了冷却');
  for (let t = 0; t < 0.8; t += 1 / 60) frame();
  assert.ok(B.log!.some((l) => l.k === 'test-move' && l.who === e.name && l.dmg > 0), `打中了：${kinds()}`);
  assert.ok(hookN > hk0, '伤害过了 damage 钩子');
  assert.ok(Math.hypot(p.x - e.x, p.y - e.y) < 200 || B.isAir(e), '招式接管了出招者的位置（贴到对手跟前）');
  assert.ok(!B.pMove && !B.holdsPlayer, '收场后交还');
  run(2);
  // 敌人 AI 挑它
  fresh(); home(); run(0.05);
  const t = cultivator(p.x + 300, p.y, 3, 1, 'tixiu', '试招散修'); t.aggro = true; t.maxHp = t.hp = 1e7; c.enemies.push(t);
  for (let s = 0; s < 10 && !kinds().includes('test-move-npc'); s += 1 / 60) { frame(); h.hp = 1; }
  assert.ok(kinds().includes('test-move-npc'), `敌人 AI 也挑了这一招：${kinds()}`);
  MV.unregisterMove('test_beng'); h.hotbar[0] = null; h.arts = h.arts.filter((a: any) => a.id !== art);
  assert.ok(!MV.MOVES.has('test_beng'), '卸下');
  run(1);
}

// 43. r7 撼山客传的两招（world/hsmoves.ts）：学会后在法术书里、能放进技能栏；一寸崩贴身停半拍、一拳打飞、背后锥形掀翻后面一片；
//     震脚把周围的人震上半空。伤害按你的近战攻力、走 hitEnemy（damage 钩子数得到）、调了破坏系统；招式路径上 Math.random 0 次；
//     其余七招你用不了
{
  const HM = await import('../src/world/hsmoves');
  const { ARTS } = await import('../src/data/arts');
  fresh(); home(); run(0.05);
  h.realm = 3; h.stage = 1;
  for (const id of ['yicunbeng', 'zhenjiao']) { assert.ok(MV.learnMove(h, id), `学会 ${id}`); assert.ok(h.arts.some((a: any) => a.id === 'bxm_' + id) && ARTS['bxm_' + id], `${id} 在法术书里`); }
  h.hotbar[4] = 'bxm_yicunbeng'; h.hotbar[5] = 'bxm_zhenjiao';
  for (const id of HM.HS_BATCH1) if (id !== 'yicunbeng' && id !== 'zhenjiao') assert.equal(B.startMove(MV.MOVES.get(id)!, null), false, `${id}：你用不了`);
  // 一寸崩：对手在 300 外 → 一步欺到跟前、停半拍、一拳；身后 400 处站着的第二个人被背后炸开的冲击波掀飞
  let mvRand = 0; const NL = String.fromCharCode(10), r0 = Math.random;
  Math.random = () => { if (/hsmoves|impactfx|brawlmoverun/.test((new Error().stack ?? '').split(NL)[2] ?? '')) mvRand++; return r0(); };
  const a = named(foe(300, 3)), b2 = named(foe(700, 3));
  c.lock = a; const hk0 = hookN, w0 = c.wreck.stats.calls, mp0 = h.mp;
  (calm(), c.castSlot(4));
  assert.ok(B.pMove, '一寸崩放出来了');
  assert.ok(Math.abs(mp0 - h.mp - 0.1) < 1e-6 && (c.cds.get('bxm_yicunbeng') ?? 0) > 0, '扣了灵力、进了冷却');
  let stillSeen = false;
  for (let t = 0; t < 1.2 && B.pMove; t += 1 / 60) { frame(); const d = B.pMove?.data; if (d?.ph === 1) stillSeen = true; }
  assert.ok(stillSeen, '贴身后停了半拍');
  assert.ok(Math.hypot(p.x - (home0.x + 300), p.y - home0.y) < 260, `欺到了对手跟前：${Math.round(p.x - home0.x)}`);
  const hitA = B.log!.find((l) => l.k === 'hs-yicun' && l.who === a.name);
  assert.ok(hitA && hitA.dmg > 0, `一拳打中了：${kinds()}`);
  assert.ok(B.isAir(a) || Math.hypot(a.x - (home0.x + 300), a.y - home0.y) > 300, '对手被打飞');
  assert.ok(B.log!.some((l) => l.k === 'hs-yicun-blast' && l.who === b2.name && l.dmg > 0) && (B.isAir(b2) || Math.abs(b2.x - (home0.x + 700)) > 100), '身后那个人被背后炸开的冲击波掀飞');
  assert.ok(hookN > hk0, '伤害过了 damage 钩子（hitEnemy）');
  assert.ok(c.wreck.stats.calls > w0, '调了破坏系统（锥形）');
  // 伤害按你的近战攻力：攻力翻倍，同一拳的伤害约翻倍
  const dmgOf = () => { fresh(); home(); run(0.05); const t = named(foe(120, 3)); c.lock = t; c.cds.clear(); h.mp = 1; noCrit(() => { calm(); c.castSlot(4); for (let i = 0; i < 70 && B.pMove; i++) frame(); }); return B.log!.find((l) => l.k === 'hs-yicun')?.dmg ?? 0; };
  const d1 = dmgOf(); const pa = B.patk; Object.defineProperty(B, 'patk', { get: () => pa * 2, configurable: true }); const d2 = dmgOf(); delete (B as any).patk;
  assert.ok(d1 > 0 && d2 > d1 * 1.5, `伤害随你的攻力：${Math.round(d1)} → ${Math.round(d2)}`);
  // 震脚：周围三个人都被震上半空
  fresh(); home(); run(0.05);
  const ring = [named(foe(180, 3)), named(foe(-200, 3)), named(foe(60, 3))]; ring[2].y += 180;
  const hk1 = hookN, w1 = c.wreck.stats.calls;
  (calm(), c.castSlot(5));
  assert.ok(B.pMove, '震脚放出来了');
  let up = 0; for (let t = 0; t < 1.2; t += 1 / 60) { frame(); up = Math.max(up, ring.filter((e) => B.isAir(e) && B.body(e).z > 30).length); }
  assert.equal(up, 3, `周围的人都被震上半空：${up}/3`);
  assert.ok(ring.every((e) => B.log!.some((l) => l.k === 'hs-zhenjiao' && l.who === e.name && l.dmg > 0)), '每个人都挨了一下');
  assert.ok(hookN >= hk1 + 3 && c.wreck.stats.calls > w1, '伤害走 hitEnemy、调了破坏系统（放射、龟裂）');
  Math.random = r0;
  assert.equal(mvRand, 0, `招式路径上 Math.random ${mvRand} 次`);
  h.hotbar[4] = null; h.hotbar[5] = null; h.arts = h.arts.filter((x: any) => !String(x.id).startsWith('bxm_'));
  run(1);
  console.log(`43 撼山客传的两招：一寸崩 ${Math.round(d1)}（攻力翻倍 ${Math.round(d2)}）、震脚三人上天：通过`);
}

setModx(null);
console.log('test-brawl 全部通过', { hookN });
process.exit(0);
