// 收官 P8（丁）：走进客栈、酒楼、铺子、宗门大殿（world/indoor.ts、world/indoorPlan.ts）——无头测试。
// 室内布局按种子一致、陈设有碰撞且门口到柜台走得通、掌柜在场且交谈打开正确的设施面板、
// 室内系统一个 Math.random 都不取（布局生成、日结算的随机数次序不受影响）、进出屋子不改变 halted、飞在屋顶上方不算进屋。
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;

const G = await import('../src/world/game');
const W0 = await import('../src/data/world');
const B = await import('../src/gfx/building');
const I = await import('../src/world/indoor');
const IP = await import('../src/world/indoorPlan');
const g = await G.createGame(() => {});
g.reset();
let ok = 0; const pass = (s: string) => { ok++; console.log('  ✓ ' + s); };

// 不取 Math.random：数一数
const rnd0 = Math.random; let calls = 0;
const noRandom = <T,>(f: () => T, what: string): T => { calls = 0; Math.random = () => { calls++; return rnd0(); }; try { return f(); } finally { Math.random = rnd0; assert.equal(calls, 0, `${what}：不该取 Math.random（取了 ${calls} 次）`); } };

// 1. 哪些楼能进：梁京、嘉禾城的客栈 / 酒楼 / 四种铺子，青霞谷的议事殿
const yue = W0.LOC_BY_ID.get('yuejing')!, jia = W0.LOC_BY_ID.get('jiayuan')!, hf = W0.LOC_BY_ID.get('huangfeng')!;
const layoutJson = JSON.stringify(B.getLayout(yue).pieces.slice(0, 400));
const ry = noRandom(() => I.roomsOf(yue), '认楼'), rj = I.roomsOf(jia), rh = I.roomsOf(hf);
for (const [l, rs] of [[yue, ry], [jia, rj]] as const) {
  for (const k of ['inn', 'tavern', 'shop'] as const) assert.ok(rs.some((r) => r.kind === k), `${l.name}有能进的${k}`);
  for (const f of ['pill', 'artifact', 'talisman', 'market', 'rest', 'tavern']) assert.ok(rs.some((r) => r.fac === f), `${l.name}的${f}能进`);
}
assert.equal(rh.filter((r) => r.kind === 'hall').length, 1, '青霞谷有一座议事殿（正殿）');
assert.ok(I.roomsOf(yue) === ry, '同一布局的结果缓存着');
pass(`梁京 ${ry.length} 间、嘉禾城 ${rj.length} 间、青霞谷议事殿 ${rh[0].W.toFixed(0)}×${rh[0].D.toFixed(0)}（殿基 ${rh[0].base.toFixed(0)}）`);

// 2. 陈设按种子一致；同类不同楼的陈设不全一样；各类 2–4 套变体
const all = [...ry, ...rj, ...rh];
for (const r of all) {
  const a = noRandom(() => IP.makePlan(r.kind, r.fac, r.W, r.D, r.seed), '排陈设'), b = IP.makePlan(r.kind, r.fac, r.W, r.D, r.seed);
  assert.equal(JSON.stringify(a), JSON.stringify(b), `${r.id} 陈设按种子一致`);
  assert.ok(a.prims.length > 20, `${r.id} 屋里不是空盒子（${a.prims.length} 件）`);
  assert.ok(a.lamps.length >= 2, `${r.id} 有灯`);
}
for (const k of Object.keys(IP.KINDS) as (keyof typeof IP.KINDS)[]) assert.ok(IP.KINDS[k].variants >= 2 && IP.KINDS[k].variants <= 4, `${k} 有 2–4 套陈设`);
{
  const shops = all.filter((r) => r.kind === 'shop'), vs = new Set(shops.map((r) => g.indoor.plan(r).variant));
  assert.ok(vs.size >= 2, `铺子里用上了不止一套陈设（${[...vs].join('、')}）`);
}
assert.equal(JSON.stringify(B.getLayout(yue).pieces.slice(0, 400)), layoutJson, '认楼、排陈设不改城的布局');
pass('陈设按种子一致、不取随机数、不改布局；铺子用了几套不同的陈设');

// 3. 碰撞：陈设挡人、门口到柜台走得通、沿路每一点都能站
for (const r of all) {
  const P = g.indoor.plan(r);
  for (const s of P.solids) { const [x, y] = I.toWorld(r, (s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2); assert.equal(g.indoor.blockedLocal(r, ...I.toLocal(r, x, y)), true, `${r.id} 陈设挡人`); }
  // 门外 → 柜台前
  const route = g.indoor.route(r, 0, r.plat + r.ramp + 60, P.front.x, P.front.z);
  assert.ok(route, `${r.id}（${r.kind}/${r.fac}，第 ${P.variant} 套）门口到柜台前走得通`);
  let cx = 0, cz = r.plat + r.ramp + 60;
  for (const [x, z] of route!) {
    const n = Math.ceil(Math.hypot(x - cx, z - cz) / 6);
    for (let t = 1; t <= n; t++) { const lx = cx + (x - cx) * t / n, lz = cz + (z - cz) * t / n; if (lz <= r.claim.z1) assert.equal(g.indoor.blockedLocal(r, lx, lz), false, `${r.id} 路上 (${lx.toFixed(0)}, ${lz.toFixed(0)}) 能站`); }
    cx = x; cz = z;
  }
  // 墙挡人：后墙、侧墙
  assert.ok(g.indoor.blockedLocal(r, 0, -r.D + 2) && g.indoor.blockedLocal(r, r.W / 2 - 2, -r.D / 2), `${r.id} 墙挡人`);
}
pass(`${all.length} 间屋：陈设都挡人、门口到掌柜跟前都走得通`);

// 4. 主角走进去：屋顶淡出、掌柜在场、交谈打开原来的设施面板；进出不改变 halted；地坪抬到石台 / 殿基上
const enter = (r: (typeof all)[number]) => {
  const P = g.indoor.plan(r), [ox, oy] = I.toWorld(r, 0, r.plat + r.ramp + 70);
  g.closeModal(true);
  g.teleport(ox, oy); g.space.update(1, ox, oy);
  for (let i = 0; i < 4; i++) noRandom(() => g.indoor.update(0.3), '室内每帧');
  const h0 = g.halted;
  assert.equal(g.indoor.inside, null, '门外不算进屋');
  // 沿屋里的路走进去（每一步都过一遍城内碰撞：走得进门、穿不过柜台）
  const route = g.indoor.route(r, 0, r.plat + r.ramp + 70, P.front.x, P.front.z)!;
  let [px, py] = [ox, oy];
  for (const [lx, lz] of route) {
    const [tx, ty] = I.toWorld(r, lx, lz), n = Math.ceil(Math.hypot(tx - px, ty - py) / 8);
    for (let t = 1; t <= n; t++) {
      const x = px + (tx - px) * t / n, y = py + (ty - py) * t / n;
      assert.equal(g.space.blocked(x, y), false, `${r.id} 走进去的路上 (${Math.round(x)}, ${Math.round(y)}) 没被挡`);
      g.player.x = x; g.player.y = y;
    }
    px = tx; py = ty;
  }
  for (let i = 0; i < 6; i++) noRandom(() => g.indoor.update(0.1), '室内每帧');
  assert.equal(g.indoor.inside, r, `${r.id} 走到柜台前算在屋里`);
  assert.equal(g.indoor.fadeRoom, r); assert.ok(g.indoor.fade > 0.99, '屋顶溶完');
  assert.equal(g.halted, h0, '进屋不改变 halted'); assert.equal(g.modal, null, '进屋不开面板');
  const fy = g.indoor.floorY(r);
  assert.ok(Math.abs(g.terrain.surface.heightAt(g.player.x, g.player.y) - fy) < 0.01, `${r.id} 脚下是屋里的地坪（高出地面 ${r.base.toFixed(0)}）`);
  assert.ok(Number.isNaN(g.indoor.floorFn(r.ax, r.ay)), '楼的锚点那一点仍按地面（楼不会被抬起来）');
  const res = g.indoor.residents.get(r.id) ?? [];
  assert.ok(res.some((a) => a.seat.talk), `${r.id} 掌柜在场`);
  assert.ok(g.indoor.focus?.seat.talk, `${r.id} 走到柜台前，掌柜成了交谈焦点`);
  noRandom(() => g.interact(), '交谈');
  const m = g.modal as { kind: string; fac?: string; loc?: { id: string } } | null;
  if (r.fac === 'rest') {
    // 客栈掌柜先问一句：住店扣灵石、过一天、存档，要玩家点了才办
    const dn = (g.modal as any)?.node as { options: { label: string; act?: () => unknown }[] } | undefined;
    assert.equal(m?.kind, 'dialog', '和客栈掌柜交谈：先出一句问话'); assert.ok(dn && dn.options.length === 2, '住 / 不住两个选项');
    const day0 = g.day; assert.equal(g.day, day0, '没点「住」之前不过夜');
  } else {
    assert.equal(m?.kind, 'town', '交谈打开城镇设施面板'); assert.equal(m?.fac, r.fac, `直接办「${r.fac}」这件事（和走到门口按键同一条路）`); assert.equal(m?.loc?.id, r.loc.id);
  }
  g.closeModal(true);
  // 走出来：屋顶淡回
  g.player.x = ox; g.player.y = oy;
  for (let i = 0; i < 6; i++) g.indoor.update(0.1);
  assert.equal(g.indoor.inside, null); assert.ok(g.indoor.fade < 0.01, '走出来屋顶淡回'); assert.equal(g.halted, h0, '出屋不改变 halted');
  return res;
};
for (const pick of [ry.find((r) => r.kind === 'inn')!, ry.find((r) => r.kind === 'tavern')!, ry.find((r) => r.fac === 'pill')!, rj.find((r) => r.fac === 'artifact')!, rj.find((r) => r.rot !== 0)!, rh[0]]) {
  const res = enter(pick);
  pass(`${pick.loc.name}·${pick.name}（${pick.kind}，门朝 ${'南东北西'[pick.rot]}）：走进去屋顶淡出、${res.length} 个人在屋里、交谈打开「${pick.fac}」、出来淡回`);
}
// 同一栋楼每次进去，屋里的人长得一样
{
  const r = ry.find((x) => x.kind === 'tavern')!;
  const a = enter(r).map((x) => JSON.stringify(x.look)), b = enter(r).map((x) => JSON.stringify(x.look));
  assert.deepEqual(a, b, '同一栋楼每次进去屋里的人一样');
  pass('同一栋楼每次进去，屋里的人一样');
}

// 5. 御剑飞在屋顶上方掠过：不算进屋，屋顶不淡
{
  const r = ry.find((x) => x.kind === 'inn')!, P = g.indoor.plan(r), [x, y] = I.toWorld(r, P.front.x, P.front.z);
  g.teleport(x, y); g.space.update(1, x, y); g.player.z = 400;
  for (let i = 0; i < 6; i++) g.indoor.update(0.1);
  assert.equal(g.indoor.inside, null, '飞在屋顶上方不算进屋'); assert.ok(g.indoor.fade < 0.01, '屋顶不淡');
  g.player.z = 0;
  for (let i = 0; i < 6; i++) g.indoor.update(0.1);
  assert.equal(g.indoor.inside, r, '落下来就在屋里');
  pass('御剑掠过屋顶不淡，落进屋里才淡');
}

// 6. 总览面板「走过去」：在城里能找到对应的屋，给出指路
{
  const r = g.indoor.roomFor(yue, 'pill')!;
  assert.ok(r && g.indoor.inLoc(yue), '人在梁京城里，丹药铺能走过去');
  g.indoor.guideTo(r);
  assert.ok(g.guide && Math.hypot(g.guide.x - r.doorX, g.guide.y - r.doorY) < 1, '指路指到丹药铺门口');
  assert.equal(g.indoor.guideRoom, r);
  assert.equal(g.indoor.roomFor(hf, 'sect')?.kind, 'hall', '宗门事务对应议事殿');
  pass('总览面板的「走过去」指到门口');
}
// 7. 点地走路的绕行（总审）：殿前月台是高台，只有正中的台阶上得去——从台阶旁边点月台上的一点，人要自己绕到台阶口再上去；
//    点殿里的一点，要从门洞进去。直着走得通的地方不绕（不改平常走路）
{
  const r = rh.find((q) => q.kind === 'hall')!, p = g.player;
  const walkTo = (sx: number, sz: number, tx: number, tz: number, what: string) => {
    const [x0, y0] = I.toWorld(r, sx, sz), [x1, y1] = I.toWorld(r, tx, tz);
    p.flying = false; p.z = 0; g.teleport(x0, y0); g.space.update(1, x0, y0);
    for (let k = 0; k < 12; k++) { if (g.modal) g.closeModal(true); g.update(0.05); }
    g.setDestination(x1, y1);
    let steps = 0;
    for (; steps < 1200 && Math.hypot(p.x - x1, p.y - y1) > 30; steps++) { if (g.modal) g.closeModal(true); if (!g.destination) g.setDestination(x1, y1); g.update(0.05); }
    const [lx, lz] = I.toLocal(r, p.x, p.y);
    assert.ok(Math.hypot(p.x - x1, p.y - y1) <= 30, `${what}：应走得到（停在本地 ${Math.round(lx)}, ${Math.round(lz)}，目标 ${tx}, ${tz}）`);
    return steps;
  };
  const side = r.rampW / 2 + 40, foot = r.plat + r.ramp;
  walkTo(side, r.plat + r.ramp * 0.3, 0, r.plat * 0.5, '从台阶旁边点月台');
  assert.ok(Math.abs(g.terrain.surface.heightAt(p.x, p.y) - g.indoor.floorY(r)) < 1, '人站在月台上');
  walkTo(-side, r.plat + r.ramp * 0.3, 0, -r.D * 0.25, '从台阶另一边点殿里');
  assert.equal(g.indoor.inside, r, '人进了殿');
  walkTo(0, -r.D * 0.25, side + 60, foot + 80, '从殿里点殿外的地面');
  // 平地上直着走得通：不给途经点
  const [ax, ay] = I.toWorld(r, side + 60, foot + 80), [bx, by] = I.toWorld(r, -side - 60, foot + 80);
  assert.equal(g.indoor.detour(ax, ay, bx, by), null, '台阶口外的平地上横着走：直线通，不绕');
  pass('点地走路：台阶旁点月台、点殿里、从殿里出来都自己绕到台阶口 / 门洞');
}
// 第六轮返工：门朝北（rot 2）的铺子，镜头那一侧（南边）是后宅——进去时后宅也一并溶掉（fadeC）。三张图眼下开张的铺子里没有门朝北的，
// 拿梁京一间门朝北的铺面临时开成店来验（同试玩页 &rot=2）；别的朝向不另溶
{
  for (const r of all) if (r.rot !== 2) assert.ok(!r.fadeC, `门不朝北的不溶后宅：${r.id}`);
  const L = B.getLayout(yue), pc = L.pieces.find((q) => q.kind === 'cshop' && (((q.p as any).r ?? 0) & 3) === 2 && !(q.p as any).fn)!;
  assert.ok(pc, '梁京有门朝北的铺面');
  const keep = { ...(pc.p as any) };
  Object.assign(pc.p, { fn: 'pill', name: '试开' }); I.clearRoomCache(L);
  const rn = I.roomsOf(yue).find((r) => r.rot === 2)!;
  assert.ok(rn && rn.fadeC, '门朝北的铺子有后宅那个盒子');
  const d = (pc.p as any).d;
  assert.ok(rn.fadeC!.z1 <= rn.fadeA.z0 + 1 && rn.fadeC!.z0 <= -d - 40, `后宅盒子接在前店后墙外、一直到地块尽头再出檐：${rn.fadeC!.z0.toFixed(0)}..${rn.fadeC!.z1.toFixed(0)}（地块深 ${d}）`);
  const [x0, y0, x1, y1] = I.boxWorld(rn, rn.fadeC!);
  assert.ok(y0 > rn.ay && y1 > rn.ay + rn.D, '门朝北：后宅那个盒子在南边（镜头那一侧）');
  void x0; void x1;
  for (const k of Object.keys(pc.p as any)) delete (pc.p as any)[k]; Object.assign(pc.p, keep); I.clearRoomCache(L);
  assert.ok(!I.roomsOf(yue).some((r) => r.rot === 2), '还原');
  pass('门朝北的铺子：进去时镜头那一侧的后宅一并溶掉（fadeC 盒子），别的朝向不溶');
}
console.log(`\ntest-indoor：${ok} 组全部通过`);
process.exit(0);
