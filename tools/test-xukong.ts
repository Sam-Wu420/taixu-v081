// 虚空：诸界的布局、破界条件、按住上升破界、虚空里的飞行与遁空、入界（同图 / 换图）、存读档。
// 用真实的 Game 无界面地跑（没有画面，只验规则）。
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;

const G = await import('../src/world/game');
const W = await import('../src/data/world');
const Z = await import('../src/data/zhujie');
const { XUKONG } = await import('../src/world/xukong');
const { ALT } = await import('../src/world/alt');
const { DUNKONG, DUNKONG_ITEM } = await import('../src/world/dunkong');

// ---------------------------------------------------------------- 0. 布局（纯数据）
{
  const { HOME, HOME_RECTS, mapToVoid, voidToMap, realmAt, realmsNear, starRegions, overRealm, REALM_TOTAL, VOID_SCALE } = Z;
  // 三张图互不重叠，中州与南荒之间正好隔着交界地带
  assert.equal(HOME_RECTS.dajin.y + HOME_RECTS.dajin.h, -W.SEAM_DEPTH, '中州南缘到南荒北缘隔着一片交界地带');
  assert.ok(HOME_RECTS.luanxing.x > HOME_RECTS.tiannan.x + HOME_RECTS.tiannan.w, '沧溟海在南荒以东，隔着海');
  // 图里的点 → 虚空 → 再落回来，是同一张图的同一点
  for (const map of W.MAP_IDS) {
    const r = HOME_RECTS[map];
    for (const [fx, fy] of [[0.5, 0.5], [0.1, 0.9], [0.93, 0.07], [0.3, 0.6]]) {
      const x = r.w * fx, y = r.h * fy, v = mapToVoid(map, x, y), back = voidToMap(v.x, v.y);
      assert.equal(back.map, map); assert.ok(Math.abs(back.x - x) < 1 && Math.abs(back.y - y) < 1, `${map} 往返：${x},${y} → ${back.x},${back.y}`);
      assert.ok(overRealm(HOME, v.x, v.y), `${map} 的点都在人界浮陆的正上方`);
    }
  }
  // 天穹草原：中线以南归南荒，以北归中州，换算出的坐标和飞越交界时的平移一致
  const south = mapToVoid('tiannan', 400000, -W.SEAM_DEPTH * 0.3), north = mapToVoid('tiannan', 400000, -W.SEAM_DEPTH * 0.7);
  assert.deepEqual(voidToMap(south.x, south.y).map, 'tiannan');
  const n = voidToMap(north.x, north.y);
  assert.equal(n.map, 'dajin'); assert.ok(Math.abs(n.y - (-W.SEAM_DEPTH * 0.7 + W.MAP_FRAME.dajin!.dy)) < 1, '草原北半按交界的平移换成中州坐标');
  // 海上：取最近的能落脚处
  const sea = mapToVoid('tiannan', HOME_RECTS.tiannan.w + 40000, 200000), s = voidToMap(sea.x, sea.y);
  assert.equal(s.map, 'tiannan'); assert.ok(Math.abs(s.x - (HOME_RECTS.tiannan.w + 40000)) < 1, '无边海的西半归南荒：就落在正下方');
  const far = mapToVoid('tiannan', HOME_RECTS.tiannan.w + W.SEA_DEPTH - 30000, 200000), f = voidToMap(far.x, far.y);
  assert.equal(f.map, 'luanxing'); assert.ok(Math.abs(f.x + 30000) < 1 && Math.abs(f.y - (200000 + W.MAP_FRAME.luanxing!.dy)) < 1, '东半归沧溟海，按交界的平移换成沧溟海坐标');
  // 三千界：数目对、各不相同的位置、穹顶都在飞行平面之下、同一星域里互不相叠
  const regions = starRegions();
  assert.equal(regions.reduce((a, g) => a + g.count, 0), REALM_TOTAL);
  assert.equal(regions[regions.length - 1].first + regions[regions.length - 1].count - 1, REALM_TOTAL);
  for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) {
    const a = regions[i], b = regions[j];
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.radius + b.radius + Z.STAR_REGION_GAP - 1, `${a.name} 与 ${b.name} 之间要隔开`);
  }
  const first = regions[0], list = Array.from({ length: first.count }, (_, k) => realmAt(first.first + k));
  for (const r of list) { assert.ok(r.depth - r.dome >= 400, `${r.name} 的穹顶在飞行平面之下`); assert.ok(!overRealm(r, HOME.x, HOME.y)); }
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > (a.rx + b.rx) * 1.2, `${a.name} 与 ${b.name} 不相叠`);
  }
  assert.deepEqual(realmAt(777), realmAt(777), '同一序号永远是同一界');
  const near = realmsNear(0, HOME.ry, 120000);
  assert.equal(near[0], HOME); assert.ok(near.length > 3, '人界南边不远就是第一片星域');
  const gap = Z.realmDistance(near[1], 0, HOME.ry);
  assert.ok(gap > 8000 && gap < 80000, `最近的别界离人界 ${Math.round(gap)}（虚空单位），御剑一分钟上下`);
  console.log(`  布局：人界浮陆 ${Math.round(HOME.rx * 2)} × ${Math.round(HOME.ry * 2)}（界内的 1/${VOID_SCALE}），${regions.length} 个星域共 ${REALM_TOTAL} 界，最近的别界离人界南缘 ${Math.round(gap)}`);
}

// ---------------------------------------------------------------- 真实的一局
const g = await G.createGame(() => {});
g.reset();
const p = g.player, xk = g.xukong, toasts: string[] = [];
{ const t0 = g.toast.bind(g); g.toast = ((m: string, ...a: unknown[]) => { toasts.push(m); return (t0 as any)(m, ...a); }) as typeof g.toast; }
const step = (seconds: number, each?: () => void) => { for (let t = 0; t < seconds - 1e-9; t += 0.025) { if (g.modal) g.closeModal(true); g.paused = false; each?.(); g.update(0.025); } };
const until = (cond: () => boolean, max = 30, each?: () => void) => { let t = 0; while (!cond() && t < max) { step(0.05, each); t += 0.05; } return t; };
const clear = () => { (g.combat as any).enemies.length = 0; g.pursuit.reset(); };
const said = (part: string) => toasts.some((m) => m.includes(part));
const hold = (k: string, fn: () => void) => { g.input.keys.add(k); try { fn(); } finally { g.input.keys.delete(k); } };
g.teleport(150000, 110000); clear();

// 1. 修为不够：升到顶再按也上不去，只得一句提示
g.hero.realm = 3; g.hero.stage = 0; g.hero.mp = 1;
g.toggleFly(); step(1);
hold('ascend', () => step(6, clear));
assert.equal(xk.phase, 'none'); assert.ok(Math.abs(p.z - ALT.max) < 3, '结丹能上到高空的顶');
assert.ok(said('元婴之前'), '提示了为何上不去');
assert.equal(xk.leave(), false);

// 2. 元婴：在顶上按住上升 → 继续往上（界内的画面，世界照常推进）→ 换手到界外 → 穿过界壁 → 巡航高度。全程是玩家按着键在升
g.hero.realm = XUKONG.realm; step(5, clear);
const at0 = { x: p.x, y: p.y };
g.input.keys.add('ascend');
const waited = until(() => xk.phase !== 'none', 4);
assert.equal(xk.phase, 'climb'); assert.ok(waited < XUKONG.pushSeconds + 0.3, `蓄势约 ${XUKONG.pushSeconds} 息：${waited.toFixed(2)}`);
assert.ok(!g.halted, '界内那一段，世界照常推进');
step(0.5); assert.ok(p.z > ALT.max + 100 && Math.abs(p.z - xk.h) < 1e-6, '人物的高度跟着升');
assert.ok(g.cam.zoom < 0.8 && xk.cloud >= 0, '镜头随高度拉远');
// 松手就悬停；按下降原路回去
g.input.keys.delete('ascend'); const hHover = xk.h; step(1); assert.ok(Math.abs(xk.h - hHover) < 1e-6 && xk.phase === 'climb', '松手悬停');
hold('descend', () => until(() => xk.phase === 'none', 6));
assert.equal(xk.phase, 'none'); assert.ok(Math.abs(p.z - ALT.max) < 40 && !g.halted, '按住下降回到高空的顶，交还寻常飞行');
// 再来：一路按住升到巡航高度
step(1.5);
// 升空这一段世界照常推进，随机刷出来的敌人打到人会把人挪开（全量里偶发过：换手时不在原地正上方 / 没到巡航高度）——这一节考的是升空换手，途中清掉敌人
g.input.keys.add('ascend');
until(() => xk.phase === 'void', 12, clear);
assert.equal(xk.phase, 'void'); assert.ok(g.halted, '出了界，界内停住');
const v0 = Z.pointToVoid(W.ACTIVE_MAP, at0.x, at0.y);
assert.ok(Math.hypot(xk.x - v0.x, xk.y - v0.y) < 2 && xk.over === Z.HOME, '换手时就在原地的正上方');
assert.ok(Math.abs(xk.h - xk.hSwap) < xk.hSwap * 0.07, '换手发生在换手高度');
const view0 = xk.view(800, Math.SQRT2);
{ const inWorld = 800 / 2 / XUKONG.zoomSwap / Math.tan(15 * Math.PI / 180); assert.ok(Math.abs(view0.D * Z.VOID_SCALE - inWorld) < inWorld * 0.07, `换手那一帧，界外镜头离地面的远近和界内的一样：${Math.round(view0.D * Z.VOID_SCALE)} / ${Math.round(inWorld)}`); }
let rippled = false;
until(() => { if (xk.ripple > 0.5) rippled = true; return xk.lift >= 0.999; }, 20, clear);
g.input.keys.delete('ascend');
assert.ok(rippled, '穿过界壁时荡开涟漪');
assert.ok(Math.abs(xk.alt - Z.HOME.depth) < 1 && xk.view(800, 1).heroY > -1, '到了巡航高度：人在飞行平面上');
assert.equal(g.ui.region, '虚空'); assert.ok(g.ui.xukong?.where.includes('人界') && g.ui.xukong.hint.includes('入界'));

// 3. 巡航：方向键；遁速是贴地时的一百倍（以界内单位计）；界内的位置和光阴都不动；松手悬停
const day0 = g.day, x0 = xk.x;
hold('d', () => step(2));
const want = g.speed / Z.VOID_SCALE * XUKONG.cruiseSpeed * 2;
assert.ok(Math.abs((xk.x - x0) - want) < want * 0.3, `向东飞了两息：${Math.round(xk.x - x0)} / ${Math.round(want)}`);
assert.ok(p.x === at0.x && p.y === at0.y && g.day === day0, '界内的位置与光阴不动');
g.toggleFly(); assert.ok(p.flying, '天外落不了地');
step(1.5); assert.ok(Math.hypot(xk.vx, xk.vy) < 250, '松手后滑行一小段就停');
// 遁空梭照常能用
(g.hero.equip ??= {} as typeof g.hero.equip).flight = DUNKONG_ITEM; g.hero.mp = 1;
g.travel.dir.x = 0; g.travel.dir.y = 1;
g.dunkong.toggle(); step(DUNKONG.chargeSeconds + 0.1); assert.equal(g.dunkong.phase, 'cruising');
const y1 = xk.y; step(2);
assert.ok(xk.y - y1 > want * DUNKONG.speed * 0.7, `遁空两息飞出 ${Math.round(xk.y - y1)}`);
g.dunkong.toggle(); step(DUNKONG.retractSeconds + 2);
assert.equal(xk.over, null, '已飞出人界上空');
// 脚下没有界：降不下去
toasts.length = 0; const hTop = xk.h;
hold('descend', () => step(2));
assert.ok(Math.abs(xk.h - hTop) < 1 && said('无底的虚空'));

// 4. 降进别界：飞到它上方，按住下降——穿过界壁、进云层、落到它自己的那张图上，再降到高空的顶
const other = Z.realmsNear(xk.x, xk.y, 400000).find((r) => r !== Z.HOME)!;
xk.x = other.x + other.rx * 0.1; xk.y = other.y - other.ry * 0.1; step(4);
assert.equal(xk.over, other); assert.equal(xk.ref, other); assert.ok(Math.abs(xk.alt - other.depth) < 30, '巡航时飞到另一界上空：脚下的地面换成它的');
assert.ok(g.ui.xukong?.where.includes(other.name) && g.ui.xukong.hint.includes('入界'));
// 收官 B4 返工（P9 遗留）：同行的人、灵宠跟着降到别界——降之前叫一个人同行、放出灵宠
const fid = ([...(g.npcs as any).byId.values()] as any[]).find((d) => d.alive && !d.hidden && !d.beauty && (d.map ?? 'tiannan') === W.ACTIVE_MAP)!.id as string;
assert.ok(g.npcs.summon(fid), '叫一个人同行');
g.ws.pets = [{ kind: 'wolf', name: '小灰', lv: 3, xp: 0, bond: 50, born: 0 }] as never; g.ws.petActive = 0;
const epoch = g.mapEpoch; rippled = false;
g.input.keys.add('descend');
until(() => { if (xk.ripple > 0.5 && xk.rippleDir < 0) rippled = true; return xk.phase === 'none'; }, 40);
g.input.keys.delete('descend');
assert.ok(rippled, '往里穿过界壁');
assert.equal(xk.phase, 'none', `降到了高空的顶（${xk.phase}，h=${Math.round(xk.h)}）`);
assert.equal(W.ACTIVE_MAP, `realm-${other.index}`, '落在它自己的那张图上'); assert.equal(g.mapEpoch, epoch + 1);
assert.ok(p.flying && Math.abs(p.z - ALT.max) < 40 && !g.halted);
{ step(1); const fa = g.npcs.followers().find((a) => a.d.id === fid); assert.ok(fa, '同行的人跟着降到了别界'); assert.equal((fa!.d as any).map, W.ACTIVE_MAP, '同行的人的所在地图改成了这一界'); assert.ok(Math.hypot(fa!.d.x - p.x, fa!.d.y - p.y) < 3000, `同行的人在落点身边（${Math.round(Math.hypot(fa!.d.x - p.x, fa!.d.y - p.y))}）`); assert.ok(g.pets.ent && Math.hypot(g.pets.ent.x - p.x, g.pets.ent.y - p.y) < 3000, '灵宠也在身边'); console.log('  出界再降到别界：同行的人、灵宠跟到落点身边'); }
const land = Z.landing(other, other.x + other.rx * 0.1, other.y - other.ry * 0.1)!;
assert.ok(Math.hypot(p.x - land.x, p.y - land.y) < 3000, `落在正下方：${Math.round(p.x)},${Math.round(p.y)} / ${Math.round(land.x)},${Math.round(land.y)}`);
assert.ok(W.WORLD_W > 150000 && g.terrain.sample(p.x, p.y) !== undefined, '别界有自己的地形');
// 在别界里照常过日子：落地、走几步、飞起来、存读档
step(3);
assert.ok(g.save(1)); const saved = JSON.parse(store['taixu_save_1']); assert.equal(saved.map, `realm-${other.index}`);
assert.ok(g.load('taixu_save_1')); assert.equal(W.ACTIVE_MAP, `realm-${other.index}`);
step(1);

// 5. 从别界再升出去，回人界：落到中州（在游戏里换图）
clear(); if (!p.flying) g.toggleFly(); step(1);
assert.equal(xk.leave(), true);
g.input.keys.add('ascend'); until(() => xk.phase === 'void' && xk.lift >= 0.999, 40); g.input.keys.delete('ascend');
assert.equal(xk.ref, other, '从别界出来，脚下是它');
const dj = Z.mapToVoid('dajin', 200000, 150000); xk.x = dj.x; xk.y = dj.y; step(3);
assert.equal(xk.over, Z.HOME); assert.equal(xk.ref, Z.HOME);
g.input.keys.add('descend'); until(() => xk.phase === 'none', 40); g.input.keys.delete('descend');
assert.equal(W.ACTIVE_MAP, 'dajin', '落到了中州'); assert.equal(xk.phase, 'none');
assert.ok(Math.hypot(p.x - 200000, p.y - 150000) < 3000 && p.flying, `中州里的落点：${Math.round(p.x)},${Math.round(p.y)}`);
assert.equal(g.travel.pending, null);

// 6. 激战中也走得了；出了界，追兵跟丢
{
  const real = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(g.combat), 'inCombat');
  Object.defineProperty(g.combat, 'inCombat', { get: () => true, configurable: true });
  assert.equal(xk.refusal(), null, '激战中不拦');
  if (real) Object.defineProperty(g.combat, 'inCombat', real); else delete (g.combat as any).inCombat;
}

// 7. 身在界外时存档：存的是出界的那一点；读档后回到界内
clear(); step(1); xk.leave();
g.input.keys.add('ascend'); until(() => xk.phase === 'void' && xk.lift > 0.5, 30); g.input.keys.delete('ascend');
assert.ok(g.save(1)); assert.equal(JSON.parse(store['taixu_save_1']).map, 'dajin');
assert.ok(g.load('taixu_save_1')); assert.equal(xk.phase, 'none'); assert.ok(!g.halted);

console.log(`PASS 虚空：诸界布局；元婴在高空的顶上按住上升，连续升出界外（松手悬停、按下降原路回去）；巡航与遁空；降进别界（${other.name}，落在它自己的地图上）、存读档；再升出去回人界（换图到中州）；激战中不拦`);
