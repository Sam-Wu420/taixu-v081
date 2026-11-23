// 野外破坏（world/wreck.ts）：cone / line / radial 范围里的树倒、石碎，范围外的不动；返回的受波及单位清单对（含方向、不含出手的人）；
// 树顺着冲击方向倒、有倒下的过程（不是一下子没了）、留树桩、过了时间长回来；数量上限、每帧预算生效（同一帧调几百次不抛错、不卡）；
// 草在坑里清掉、周围压伏；巨石碎成几大块；拔起、拿着、扔出去落地砸碎并触发一次 radial；分海在水上成立、陆上 / 别界流沙熔岩明确返回不支持；
// 大坑存读档还在、旧存档（没有 ws.wreck）照读、过了几个游戏日淡掉；这些路径上 Math.random 一次都不取。
// 固定时钟和种子：地形照常生成（真的森林、真的海岸），只关刷怪。
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;
await import('./fixed-clock');
let s0 = 11, mathRandomCalls = 0;
Math.random = () => { mathRandomCalls++; s0 = (Math.imul(s0, 1664525) + 1013904223) >>> 0; return s0 / 4294967296; };

const G = await import('../src/world/game');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const { WK, decoKey } = await import('../src/world/wreck');
const { createCanvas } = await import('./env');
const g = await G.createGame(() => {}); g.reset();
const c = g.combat as any, p = g.player, h = g.hero, T = g.terrain as any;
const W = c.wreck as InstanceType<typeof import('../src/world/wreck').WreckSys>;
const brk = c.brawl.brk;
h.realm = 3; h.stage = 1;
c.spawnT = 1e9; brk.manual = true;

/** 只数 wreck 自己的路径：调用前后 Math.random 被取了几次 */
let wreckRandom = 0;
const guard = <T,>(fn: () => T): T => { const n0 = mathRandomCalls; const r = fn(); wreckRandom += mathRandomCalls - n0; return r; };
const step = (sec: number, dt = 1 / 30) => { for (let t = 0; t < sec - 1e-9; t += dt) guard(() => W.update(dt)); };
const frame = () => guard(() => W.update(1 / 60));   // 新的一帧：每帧预算清零

// ---------------------------------------------------------------- 找一片林子（树多、离城镇远）、一段海岸
const CH = 1024;
const treesIn = (cx: number, cy: number) => (T.getDecos(cx, cy) as any[]).filter((d) => d.kind === 'tree');
let forest: { x: number; y: number; trees: any[] } | null = null;
{
  const pcx = Math.floor(p.x / CH), pcy = Math.floor(p.y / CH);
  outer: for (let r = 0; r <= 26; r++) for (let i = -r; i <= r; i++) for (const [cx, cy] of [[pcx + i, pcy - r], [pcx + i, pcy + r], [pcx - r, pcy + i], [pcx + r, pcy + i]]) {
    if (!T.hasChunk(cx, cy)) continue;
    const ts = treesIn(cx, cy);
    if (ts.length < 30) continue;
    const mx = ts.reduce((s, d) => s + d.x, 0) / ts.length, my = ts.reduce((s, d) => s + d.y, 0) / ts.length;
    if (T.inLocZone(mx, my, 1500)) continue;
    const near = ts.filter((d) => Math.hypot(d.x - mx, d.y - my) < 420);
    if (near.length < 10) continue;
    forest = { x: mx, y: my, trees: ts };
    break outer;
  }
}
assert.ok(forest, '找到一片林子');
const F = forest!;
p.x = F.x; p.y = F.y; p.flying = false;
// 林子周围的块也备好（倒树要看见相邻块里的树）
for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) T.getDecos(Math.floor(F.x / CH) + dx, Math.floor(F.y / CH) + dy);
frame();
const allTrees = () => { const out: any[] = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.push(...treesIn(Math.floor(F.x / CH) + dx, Math.floor(F.y / CH) + dy)); return out; };
const foe = (x: number, y: number) => { const e = new Enemy({ ...ENEMIES.yelang ?? ENEMIES.wolf, speed: 0 }, x, y, 2, 1); e.maxHp = e.hp = 1e7; c.enemies.push(e); return e; };
const fresh = () => { W.reset(); c.enemies.length = 0; brk.reset(); brk.manual = true; frame(); };

// 1. radial：范围里的树倒（顺着离心的方向）、范围外的不动；单位清单（不含出手的人，方向朝外，力度按远近衰减）
{
  fresh();
  const R = 520;
  const eIn = foe(F.x + 200, F.y + 40), eOut = foe(F.x + 1400, F.y), eSrc = foe(F.x - 50, F.y);
  const res = guard(() => W.radial(F.x, F.y, R, 3, eSrc));
  assert.ok(res.trees >= 5, `倒了好几棵：${res.trees}`);
  assert.equal(res.trees, [...W.down.values()].length, '倒的都记下了');
  const ids = new Set(res.units.map((u: any) => u.e));
  assert.ok(ids.has(eIn), '范围里的敌人在清单上');
  assert.ok(!ids.has(eOut), '范围外的不在');
  assert.ok(!ids.has(eSrc), '出手的人不在');
  assert.ok(res.units.some((u: any) => u.player), '主角站在中间：也在清单上（调用方决定打不打）');
  const hi = res.units.find((u: any) => u.e === eIn)!;
  assert.ok(hi.ux > 0.9, `往外推：${hi.ux.toFixed(2)}`);
  assert.ok(hi.k > 0 && hi.k < 1 && Math.abs(hi.power - 3 * hi.k) < 1e-9, '力度按远近衰减');
  assert.equal(c.enemies.filter((e: any) => e.hp < e.maxHp).length, 0, '这里不伤人（伤害由调用方走 hitEnemy / hitPlayer）');
  // 范围外的树没动
  for (const d of allTrees()) { const dd = Math.hypot(d.x - F.x, d.y - F.y); if (dd > R + 100) assert.ok(!W.down.has(decoKey(d)), `范围外的树没动（${dd | 0}）`); }
  // 有倒下的过程：刚倒的时候还立着（等冲击波到 / 刚开始转），过一息多才躺下
  const st = [...W.down.values()];
  assert.ok(st.every((s) => s.ph === 'wait' || (s.ph === 'fall' && s.th < 0.2)), '不是一下子倒平');
  step(0.4);
  assert.ok(st.some((s) => s.ph === 'fall' && s.th > 0.1 && s.th < Math.PI / 2), '倒的过程中');
  step(2.6);
  assert.ok(st.every((s) => s.ph === 'lie' || s.ph === 'rot'), `三息内都躺下了：${st.map((s) => s.ph).join(',')}`);
  assert.ok(st.filter((s) => s.ph === 'lie').length <= WK.maxLying, `同时躺着的最多 ${WK.maxLying} 棵（多的最早倒的先烂掉）`);
  for (const s of st) { const ax = s.x - F.x, ay = s.y - F.y, L = Math.hypot(ax, ay); if (L > 60) assert.ok((s.lx * ax + s.ly * ay) / L > 0.75, '顺着冲击方向（往外）倒'); }
  assert.ok(res.mark && res.mark.k === 'pit', '砸出一个坑');
  // 草：坑里清掉、坑边压伏、远处照旧
  assert.ok(W.grassPrep(F.x - 2000, F.y - 2000, F.x + 2000, F.y + 2000), '画面里有要处理的草');
  assert.equal(W.grassAt(F.x, F.y), 2, '坑里的草清掉');
  const fr = W.grassAt(F.x + res.mark!.r * 1.3, F.y); assert.ok(fr > 0 && fr < 2, `坑边压伏：${fr}`);
  assert.equal(W.grassAt(F.x + 3000, F.y), 0, '远处的草照旧');
  // 树桩、长回来
  step(WK.lieT + WK.rotT + 0.5);
  assert.ok(st.every((s) => s.ph === 'stump'), '树干烂掉以后留树桩');
  assert.ok(W.stumpAlpha(st[0]) === 1 && W.treeAt({ x: st[0].x, y: st[0].y, _wk: st[0].key } as any), '树桩画着、原来的树不画');
  step(WK.regrow - WK.lieT - WK.rotT + 1, 0.25);
  assert.ok(st.every((s) => s.ph === 'grow' || !W.down.has(s.key)), '过了一个昼夜长回来');
  step(WK.growT + 0.2);
  assert.equal(W.down.size, 0, '长回来以后照原样画');
}

// 2. cone：锥里的树倒、背后的不动；单位按锥判断
{
  fresh();
  const dir = 0, L = 700, half = 0.5;
  const eIn = foe(F.x + 400, F.y + 60), eBehind = foe(F.x - 300, F.y);
  const res = guard(() => W.cone(F.x, F.y, dir, L, half, 3));
  const ids = new Set(res.units.map((u: any) => u.e));
  assert.ok(ids.has(eIn) && !ids.has(eBehind), '锥里的敌人在清单上，背后的不在');
  assert.ok(!res.units.some((u: any) => u.player && u.d > 30), '主角在锥尖上');
  for (const s of W.down.values()) {
    const a = Math.atan2(s.y - F.y, s.x - F.x), d = Math.hypot(s.x - F.x, s.y - F.y);
    assert.ok(d < L + 40 && Math.abs(a) < half + 0.3, `锥外的没倒（${d | 0}, ${a.toFixed(2)}）`);
    assert.ok(Math.cos(s.dir) > 0.4, '顺着锥往前倒');
  }
  assert.ok(res.trees >= 1, `锥里倒了树：${res.trees}`);
}

// 3. line：沿线犁沟（长沟留得久）、树往两边倒
{
  fresh();
  const x0 = F.x - 500, y0 = F.y, x1 = F.x + 500, y1 = F.y;
  const res = guard(() => W.line(x0, y0, x1, y1, 260, 3));
  assert.ok(res.mark?.k === 'furrow' && res.mark.keep, '一千长的沟：留得久');
  assert.ok(g.ws.wreck?.marks.includes(res.mark!), '记进存档那一份');
  for (const s of W.down.values()) { const side = Math.sign(s.y - F.y) || 1; assert.ok(Math.sin(s.dir) * side > 0.3, `往两边倒（${s.y - F.y | 0}, ${Math.sin(s.dir).toFixed(2)}）`); }
  assert.ok(res.trees >= 1, `沿线倒了树：${res.trees}`);
  assert.ok(W.grassPrep(F.x - 1, F.y - 1, F.x + 1, F.y + 1)); assert.equal(W.grassAt(F.x, F.y + 1), 2, '沟里没有草');
}

// 4. 数量上限、每帧预算：一次最多 maxTrees 棵；同一帧调三百次不抛错、不卡，超出预算的只返回单位
{
  fresh();
  const r1 = guard(() => W.radial(F.x, F.y, 1500, 5, null, { maxTrees: 6 }));
  assert.ok(r1.trees <= 6 && r1.capped, `一次最多 6 棵：${r1.trees}`);
  fresh();
  const e = foe(F.x + 100, F.y);
  const t0 = performance.now();
  let units = 0, capped = 0;
  for (let i = 0; i < 300; i++) { const r = guard(() => (i % 3 === 0 ? W.radial(F.x + (i % 7) * 40, F.y, 600, 4) : i % 3 === 1 ? W.cone(F.x, F.y, i * 0.3, 800, 0.6, 4) : W.line(F.x - 600, F.y + i, F.x + 600, F.y - i, 200, 4))); if (i % 3 !== 1 && r.units.some((u: any) => u.e === e)) units++; if (r.capped) capped++; }
  const ms = performance.now() - t0;
  assert.equal(units, 200, '超出预算也照样返回受波及的单位');
  assert.ok(capped >= 300 - WK.frame.calls, `超出预算的被截掉：${capped}`);
  assert.ok(W.down.size <= WK.frame.trees, `一帧最多倒 ${WK.frame.trees} 棵：${W.down.size}`);
  assert.ok(W.fx.length <= WK.frame.fx, `一帧最多 ${WK.frame.fx} 个特效事件：${W.fx.length}`);
  assert.ok(ms < 1500, `三百次一帧之内：${ms.toFixed(0)} 毫秒`);
  step(3);
  assert.ok(W.marks.length <= WK.maxMarks && (g.ws.wreck?.marks.length ?? 0) <= WK.maxKeep, '痕迹有上限');
  // 记着的倒树有上限：满了最旧的先长回去
  for (let i = 0; i < 40; i++) { frame(); guard(() => W.radial(F.x + ((i * 97) % 1800) - 900, F.y + ((i * 61) % 1800) - 900, 900, 5)); }
  assert.ok(W.down.size <= WK.maxDown, `最多记 ${WK.maxDown} 棵：${W.down.size}`);
}

// 5. 石头：巨石被狠狠砸中碎成几大块，轻的只裂不碎；碎块过几息沉掉
{
  fresh();
  const b1 = brk.place('boulder', F.x + 120, F.y, 0.7, 0), b2 = brk.place('boulder', F.x + 2000, F.y, 0.7, 1);
  const weak = guard(() => W.radial(F.x, F.y, 400, 0.8));
  assert.ok(!b1.dead && b1.hp < b1.maxHp && weak.rocks === 1, '轻的一下：裂（掉血）不碎');
  const res = guard(() => W.radial(F.x, F.y, 400, 4));
  assert.ok(b1.dead && res.smashed === 1, '重的一下：碎');
  assert.ok(!b2.dead, '远处的那块没事');
  assert.ok(W.chunks.length >= 3, `碎成几大块：${W.chunks.length}`);
  step(1.5); assert.ok(W.chunks.every((k: any) => k.z < 1), '大块落地');
  step(WK.chunkLife); assert.equal(W.chunks.length, 0, '过几息沉掉');
}

// 6. 拔起、拿着、扔出去：落地砸碎，触发一次 radial（结果给回调）
{
  fresh();
  const b = brk.place('boulder', F.x + 80, F.y, 0.8, 2);
  const cr = guard(() => W.uproot(F.x, F.y, 300, 'rock'))!;
  assert.ok(cr && cr.kind === 'rock' && b.dead && !brk.rocks.includes(b), '拔起来了，可破坏物里没了它');
  step(0.6); assert.ok(cr.z > 20 && cr.st === 'held', `升起来拿在手里：${cr.z.toFixed(0)}`);
  guard(() => W.hold(cr, F.x + 10, F.y, 160));
  const target = foe(F.x + 900, F.y + 50);
  let landed: any = null;
  assert.ok(guard(() => W.hurl(cr, F.x, F.y, F.x + 900, F.y, { power: 3, onLand: (r) => { landed = r; } })), '扔出去');
  step(0.3); assert.ok(cr.st === 'fly' && cr.x > F.x + 50 && cr.x < F.x + 900, '在飞');
  step(1.5);
  assert.ok(cr.st === 'done' && landed && cr.result === landed, '落地');
  assert.ok(landed.units.some((u: any) => u.e === target), '落地的 radial 波及落点的人');
  assert.ok(W.chunks.length >= 3, '扔出去的石头落地碎成几大块');
  // 拔树：原地只剩坑（没有树桩），飞出去落地躺着
  const ct = guard(() => W.uproot(F.x, F.y, 500, 'tree'))!;
  assert.ok(ct && ct.kind === 'tree' && ct.deco, '拔起一棵树');
  const s = W.down.get(decoKey(ct.deco!))!;
  assert.ok(s && s.uproot && W.stumpAlpha(s) === 0, '原地不留树桩');
  guard(() => W.hurl(ct, ct.x, ct.y, ct.x - 700, ct.y));
  step(1.5);
  assert.ok(W.props.length === 1 && W.props[0].ph === 'lie', '落地躺着');
  assert.equal(guard(() => W.uproot(F.x + 8000, F.y + 8000, 100)), null, '附近没东西：null');
}

// 7. 分海：陆上不行；海上劈开、合拢；别界的流沙 / 熔岩明确不支持
{
  fresh();
  const land = guard(() => W.split(F.x - 400, F.y, F.x + 400, F.y));
  assert.ok(!land.ok && /水/.test(land.reason), `陆上：${!land.ok && land.reason}`);
  // 找一段海
  let sea: { x: number; y: number } | null = null;
  for (let r = 2000; r < 90000 && !sea; r += 1500) for (let k = 0; k < 24 && !sea; k++) { const a = k / 24 * Math.PI * 2, x = F.x + Math.cos(a) * r, y = F.y + Math.sin(a) * r; let ok = true; for (let i = -3; i <= 3; i++) if (T.isLand(x + i * 200, y)) ok = false; if (ok) sea = { x, y }; }
  assert.ok(sea, '找到一片海');
  p.x = sea!.x; p.y = sea!.y; p.flying = true; frame();
  const sp = guard(() => W.split(sea!.x - 600, sea!.y, sea!.x + 600, sea!.y, 260, { dur: 1.5 }));
  assert.ok(sp.ok, `海上能劈开：${!sp.ok && sp.reason}`);
  step(0.5); assert.ok(W.splitAt(sea!.x, sea!.y) > 0.9, '劈开了');
  assert.equal(W.splitAt(sea!.x, sea!.y + 600), 0, '沟外不算');
  step(2); assert.equal(W.splits.length, 0, '合拢了');
  const jy = g.jueyu as any;
  for (const kind of ['sand', 'lava', 'ice']) {
    Object.defineProperty(jy, 'alienMedium', { get: () => kind, configurable: true });
    const r = guard(() => W.split(sea!.x - 600, sea!.y, sea!.x + 600, sea!.y));
    assert.ok(!r.ok && r.reason.includes(kind), `${kind}：明确不支持`);
  }
  Object.defineProperty(jy, 'alienMedium', { get: () => 'ming', configurable: true });
  assert.ok(guard(() => W.split(sea!.x - 600, sea!.y, sea!.x + 600, sea!.y)).ok, '冥河（水一样的）能劈开');
  delete jy.alienMedium;
  p.x = F.x; p.y = F.y; p.flying = false; frame();
}

// 8. 大坑存读档：存进 ws.wreck；读档还在；旧存档（没有这个字段）照读；过了几个游戏日淡掉；短命的不进存档
{
  fresh();
  g.ws.wreck = undefined;
  const small = guard(() => W.radial(F.x + 2000, F.y, 200, 1))!.mark!;
  assert.ok(small && !small.keep && !g.ws.wreck, '小坑不进存档');
  const big = guard(() => W.radial(F.x, F.y, 900, 4))!.mark!;
  assert.ok(big.keep && big.r >= WK.bigPit && g.ws.wreck!.marks.length === 1, `大坑进存档（半径 ${big.r | 0}）`);
  assert.ok(g.save(0), '存档');
  const raw = JSON.parse(store[G.SLOT_KEYS[0]]);
  assert.equal(raw.world.wreck.marks.length, 1, '存档里有这个坑');
  assert.equal(raw.v, 3, '存档版本不升');
  g.ws.wreck!.marks.length = 0;
  assert.ok(g.load(G.SLOT_KEYS[0]), '读档');
  frame();
  assert.equal(W.keep.length, 1, '读档以后坑还在');
  assert.ok(Math.abs(W.keep[0].x - F.x) < 1e-6, '在原处');
  assert.equal(W.marks.length, 0, '短命的读档就没了');
  // 离开再回来：换片（进秘境的那个判断）再回来，大坑照旧
  // 旧存档
  delete raw.world.wreck; store[G.SLOT_KEYS[1]] = JSON.stringify(raw);
  assert.ok(g.load(G.SLOT_KEYS[1]), '旧存档照读');
  frame();
  assert.equal(W.keep.length, 0, '旧存档没有坑');
  const r = guard(() => W.radial(F.x, F.y, 900, 4));
  assert.ok(r.mark?.keep && g.ws.wreck?.marks.length === 1, '旧存档读进来以后照样能留大坑');
  // 过期
  g.day += WK.keepDays + 1; step(1.1);
  assert.equal(W.keep.length, 0, '过了几个游戏日淡掉');
  // 上限：最旧的先淘汰
  const made: any[] = [];
  for (let i = 0; i < WK.maxKeep + 30; i++) { const m = guard(() => W.pit(F.x + (i % 10) * 420 - 2000, F.y + Math.floor(i / 10) * 420 - 1200, 200)); if (m) made.push(m); }
  assert.ok(made.length > WK.maxKeep, `留下了不少：${made.length}`);
  assert.equal(W.keep.length, WK.maxKeep, `最多 ${WK.maxKeep} 处`);
  assert.ok(W.keep[0] === made[made.length - WK.maxKeep], '最旧的先淘汰');
}

// 9. 画法不抛错：坑、沟、龟裂画进一张画布；石头碎块、拿着的石头的绘制项
{
  fresh();
  guard(() => { W.radial(F.x, F.y, 600, 4); W.radial(F.x + 900, F.y, 600, 3, null, { mark: 'crack' }); W.line(F.x - 800, F.y + 500, F.x + 800, F.y + 300, 220, 3); });
  const cv = createCanvas(800, 600), ctx = cv.getContext('2d') as any;
  ctx.setTransform(0.3, 0, 0, 0.3, 400 - F.x * 0.3, 300 - F.y * 0.3);
  step(0.5);
  W.drawGround(ctx, F.x - 1500, F.y - 1000, F.x + 1500, F.y + 1000);
  const px = ctx.getImageData(400, 300, 1, 1).data;
  assert.ok(px[3] > 100, '坑画上了');
  brk.place('reef', F.x, F.y + 100, 0.7, 1); guard(() => W.radial(F.x, F.y, 300, 5));
  const out: any[] = []; W.collect(out, { left: F.x - 2000, top: F.y - 2000, right: F.x + 2000, bottom: F.y + 2000 });
  assert.ok(out.length >= 3, '碎块立成立板');
  for (const d of out) d.draw(ctx);
}

assert.equal(wreckRandom, 0, `破坏的路径上 Math.random 一次都没取：${wreckRandom}`);
console.log(`test-wreck：全部通过（倒树 ${W.stats.felled} 棵、碎石 ${W.stats.smashed} 块、调用 ${W.stats.calls} 次）`);
process.exit(0);
