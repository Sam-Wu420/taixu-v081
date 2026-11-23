// 秘境（B 版放大一倍的格子、开阔的石台）：能进、能在里面走和打、石墩的布局能算出来、能出来回到原处。无界面地跑真实的 Game。
import './env';
import assert from 'node:assert/strict';
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;
const G = await import('../src/world/game');
const MJ = await import('../src/world/mijing');
const g = await G.createGame(() => {});
g.reset(); g.hero.realm = 3;
const p = g.player, M = g.mijing;
const step = (n: number) => { for (let i = 0; i < n; i++) { if (g.modal) g.closeModal(true); g.paused = false; g.update(0.033); } };
step(5);
const back = { x: p.x, y: p.y };
assert.equal(MJ.CELL, 96, 'B 版的格子放大了一倍');
for (const theme of ['cave', 'tomb', 'ice', 'fire', 'forest', 'blood'] as const) {   // forest 是自然浮岛、tomb 和 blood 是剑冢的碎岩
  M.enter({ name: '试炼洞府', tier: 1, theme, seed: 1234, floors: 1, rooms: 7, lv: 3 } as any);
  assert.ok(M.active, `${theme} 应能进入`);
  const F = M.floor!;
  assert.ok(F.rooms.length >= 3 && M.walk(p.x, p.y), '落在入口的地面上');
  // 入口的古阵是云门（走进阵心就出秘境）：下面要在台上来回走，先挪到台心偏南
  { const c = M.roomC(F.rooms[0]); p.x = c.x; p.y = c.y + MJ.CELL * 3; (M as any).lastOk = { x: p.x, y: p.y }; (M as any).lastLand = { x: p.x, y: p.y }; step(1); assert.ok(M.walk(p.x, p.y)); }
  assert.ok(Math.abs(p.x - MJ.REALM_OX) < F.gw * MJ.CELL && Math.abs(p.y - MJ.REALM_OY) < F.gh * MJ.CELL);
  // 石墩：只有被地面围住的实心格子才立起来；外面的虚空没有墙
  const L = M.wallLayout('#aaa', '#ccc')!;
  let floor = 0; for (let i = 0; i < F.cells.length; i++) if (F.cells[i]) floor++;
  assert.ok(L.pieces.every((q) => q.kind === 'box') && L.pieces.length < floor / 4, `石墩数目合理：${L.pieces.length} / 地面 ${floor} 格`);
  // 在里面走一阵、过若干帧：不报错、不掉出地面、不被换图
  const x0 = p.x, y0 = p.y;
  g.input.keys.add('w'); step(40); g.input.keys.delete('w'); g.input.keys.add('s'); step(60); g.input.keys.delete('s');
  assert.ok(M.active && M.walk(p.x, p.y), '走动后仍在地面上');
  assert.ok(Math.hypot(p.x - x0, p.y - y0) > 20, '确实走动了');
  assert.equal(store['taixu.map'], undefined, '秘境里不会被当成飞进了无边海而换图');
  // 石台群：有主台、分台、祭坛和界壁；起飞后能越过台沿、落不到云海上、飞不出界壁、只在低空
  assert.ok(F.isles && F.isles.length === F.rooms.length && F.bridges!.length === F.rooms.length - 1 && F.bound, '主台到每座台各有一条石桥');
  assert.equal(F.rooms[0].kind, 'entry'); assert.equal(F.rooms[F.rooms.length - 1].kind, 'boss');
  assert.ok(F.isles![F.isles!.length - 1].r > F.isles![1].r * 1.3, '首领的祭坛比分台大');
  // 沿着石桥能从主台走到每一座台（格子连通）
  { const seen = new Uint8Array(F.gw * F.gh), st = [F.rooms[0].cy * F.gw + F.rooms[0].cx]; seen[st[0]] = 1;
    while (st.length) { const i = st.pop()!, x = i % F.gw, y = (i / F.gw) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const q = (y + dy) * F.gw + x + dx; if (F.cells[q] && !seen[q]) { seen[q] = 1; st.push(q); } } }
    for (const r of F.rooms) assert.ok(seen[(r.cy + 1) * F.gw + r.cx], `${r.kind} 台走得到`); }
  if (!p.flying) g.toggleFly(); step(3);
  assert.ok(p.flying, '秘境里能起飞');
  // 往主台外飞：找一个不在台上、也不在桥上的方向
  const hub = F.isles![0]; let dir = 0;
  // 只在四个正方向里挑（按的是方向键，斜向的 dir 会被按成正方向，飞到别的台上去）：台外 300 起一千以内都不是台、不是桥
  for (let k = 0; k < 16; k += 4) { const a = k / 16 * Math.PI * 2; if ([300, 600, 900, 1200].every((d) => !M.walk(hub.x + Math.cos(a) * (hub.r + d), hub.y + Math.sin(a) * (hub.r + d)))) { dir = a; break; } }
  p.x = hub.x + Math.cos(dir) * (hub.r - 150); p.y = hub.y + Math.sin(dir) * (hub.r - 150); (M as any).lastOk = { x: p.x, y: p.y }; step(2);
  const key = Math.abs(Math.cos(dir)) > Math.abs(Math.sin(dir)) ? (Math.cos(dir) > 0 ? 'd' : 'a') : (Math.sin(dir) > 0 ? 's' : 'w');
  g.input.keys.add(key); step(40); g.input.keys.delete(key);
  assert.ok(!M.walk(p.x, p.y) && M.inBound(p.x, p.y), `飞出了台沿、悬在云海上：${Math.round(Math.hypot(p.x - hub.x, p.y - hub.y))} / ${Math.round(hub.r)}`);
  g.toggleFly(); assert.ok(p.flying, '云海上落不下去');
  g.input.keys.add('ascend'); step(120); g.input.keys.delete('ascend');
  assert.ok(p.z <= 121, `只许低空：${p.z}`);
  g.input.keys.add(key); step(900); g.input.keys.delete(key);
  assert.ok(Math.hypot(p.x - F.bound!.x, p.y - F.bound!.y) < F.bound!.r, '飞不出界壁');
  M.leave('exit');
  assert.ok(!M.active && Math.abs(p.x - back.x) < 1 && Math.abs(p.y - back.y) < 1, '出来回到原处');
  step(10);
}
// 规模（2026-11-15：用户说副本太小）：小 2.5 倍、中 3.5 倍、大 5 倍；分台七座以上排成内外两圈；石桥放宽；每台的妖物成倍、分群
{
  const meas = (tier: number, rooms: number, size?: number) => {
    M.enter({ name: '量尺寸', tier, theme: 'cave', seed: 77, floors: 1, rooms, lv: 3, size } as any);
    const F = M.floor!, hub = F.isles![0], boss = F.isles![F.isles!.length - 1];
    // 沿桥能走到每一座台
    const seen = new Uint8Array(F.gw * F.gh), st = [F.rooms[0].cy * F.gw + F.rooms[0].cx]; seen[st[0]] = 1;
    while (st.length) { const i = st.pop()!, x = i % F.gw, y = (i / F.gw) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const q = (y + dy) * F.gw + x + dx; if (F.cells[q] && !seen[q]) { seen[q] = 1; st.push(q); } } }
    for (const r of F.rooms) assert.ok(seen[(r.cy + 1) * F.gw + r.cx], `规模 ${tier}：${r.kind} 台走得到`);
    // 台与台不重叠
    for (let i = 0; i < F.isles!.length; i++) for (let j = i + 1; j < F.isles!.length; j++) { const a = F.isles![i], b = F.isles![j]; assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > a.r + b.r, `规模 ${tier}：第 ${i}、${j} 座台不重叠`); }
    assert.equal(F.bridges!.length, F.rooms.length - 1, '每座台一条石桥');
    // 进一座分台：妖物的数目
    const hall = F.rooms.find((r) => r.kind === 'hall')!, c = M.roomC(hall);
    p.x = c.x; p.y = c.y; (M as any).lastOk = { x: p.x, y: p.y }; (M as any).lastLand = { x: p.x, y: p.y }; step(2);
    const foes = hall.foes.length;
    for (const e of hall.foes) assert.ok(M.walk(e.x, e.y), '妖物都站在台面上');
    const out = { hub: hub.r, boss: boss.r, span: F.bound!.r * 2, foes, isles: F.isles!.length, bridgeW: F.bridges![0].w };
    M.leave('exit'); step(3);
    return out;
  };
  const a = meas(1, 7, 1), s1 = meas(1, 7), s2 = meas(2, 10), s3 = meas(3, 12);
  assert.ok(s1.hub > a.hub * 2.3 && s1.hub < a.hub * 2.7, `小秘境主台是样板的 2.5 倍：${Math.round(a.hub)} → ${Math.round(s1.hub)}`);
  assert.ok(s2.hub > a.hub * 3.3 && s3.hub > a.hub * 4.7, '中、大秘境更大');
  assert.ok(s1.span > a.span * 2.2, `整座秘境跟着放大：${Math.round(a.span)} → ${Math.round(s1.span)}`);
  assert.ok(s1.bridgeW > a.bridgeW * 1.5, '石桥放宽');
  assert.ok(a.foes >= 3 && a.foes <= 5 && s1.foes >= 6 && s1.foes <= 14, `放大后每台的妖物成倍：${a.foes} → ${s1.foes}`);
  assert.ok(s2.isles === 10 && s3.isles === 12, '房间数对得上');
  console.log(`规模：样板主台 ${Math.round(a.hub)}、整座 ${Math.round(a.span)}；小 ${Math.round(s1.hub)} / ${Math.round(s1.span)}；中 ${Math.round(s2.hub)} / ${Math.round(s2.span)}；大 ${Math.round(s3.hub)} / ${Math.round(s3.span)}；每台妖物 ${a.foes} → ${s1.foes} / ${s2.foes} / ${s3.foes}`);
}
// 云门（无缝进出）：在大地图上开门、走进去入秘境；走进古阵的阵心出来，外面留着门；没打完的回去是同一座秘境
{
  const spec = { name: '云门试', tier: 1, theme: 'cave', seed: 4321, floors: 1, rooms: 5, lv: 3 } as any;
  if (p.flying) g.toggleFly(); step(3);
  M.openGate(spec);
  const G0 = M.gate!; assert.ok(G0 && !M.active, '开了门，人还在外面');
  const d0 = Math.hypot(p.x - G0.x, p.y - G0.y);
  // 自己走过去：云随距离变浓，到门心才换
  let veilTop = 0;   // 第五轮返工：过门全程整屏那层云的最大值（不能再有几乎全白的帧）
  const walkTo = (x: number, y: number, n = 400) => { for (let i = 0; i < n && Math.hypot(p.x - x, p.y - y) > 20; i++) { const a = Math.atan2(y - p.y, x - p.x), v = Math.min(9, Math.hypot(x - p.x, y - p.y)); p.x += Math.cos(a) * v; p.y += Math.sin(a) * v; if (M.active) (M as any).lastOk = { x: p.x, y: p.y }; step(1); veilTop = Math.max(veilTop, M.veil); if (!!M.active !== wasIn) return; } };
  let wasIn = false;
  step(4); const v1 = M.veil; walkTo((p.x + G0.x) / 2, (p.y + G0.y) / 2); const v2 = M.veil;
  assert.ok(!M.active && v2 > v1, `走近门，云变浓：${v1.toFixed(2)} → ${v2.toFixed(2)}（起步离门 ${Math.round(d0)}）`);
  walkTo(G0.x, G0.y); for (let i = 0; i < 60 && !M.active; i++) step(1);
  assert.ok(M.active && M.core > 0.9, `走到门心，入了秘境，这一刻门洞里那团云裹着人：${M.core.toFixed(2)}`);
  assert.ok(M.veil <= (M.constructor as any).VEIL_MAX + 1e-9 && veilTop <= (M.constructor as any).VEIL_MAX + 1e-9, `换场那一刻整屏的云不超过上限（看得见人影）：${M.veil.toFixed(2)}，全程最大 ${veilTop.toFixed(2)}`);
  assert.ok(M.spot && Math.hypot(M.spot.x - p.x, M.spot.y - p.y) < 60, '那团云就在落脚的门心');
  const F1 = M.floor!, arr = F1.objs.find((o) => o.kind === 'exit' && o.room === 0)!;
  assert.ok(Math.hypot(p.x - arr.x, p.y - arr.y) < 60, '落在入口古阵的阵心');
  step(30); assert.ok(M.active, '站在阵心不会被立刻送回去');
  g.updateUI(true); assert.equal((g as any).ui.region, '云门试', `第五轮返工：秘境里地区名用秘境名（不再落到无边海）：${(g as any).ui.region}`); assert.ok(!g.jueyu.hud.show, '秘境里不出绝域的罗盘、灵力流失');
  { const ch = g.chances().filter((c) => /方约/.test(c.d)); assert.equal(ch.length, 0, `秘境里眼下机缘不写外界的方位距离：${ch.map((c) => c.d).join(' / ')}`); }
  // 往外走：云散；再走回阵心：出秘境，外面的门还在
  wasIn = true; const hub = M.roomC(F1.rooms[0]);
  walkTo(hub.x, hub.y + 900); step(20);
  assert.ok(M.active && M.veil < 0.05, `走出云门，云散了：${M.veil.toFixed(2)}`);
  F1.rooms[1].entered = true;   // 记一笔进度
  walkTo(arr.x, arr.y); for (let i = 0; i < 60 && M.active; i++) step(1);
  assert.ok(!M.active && M.gate && M.gate.spec, '走进阵心出了秘境；首领未除，外面的门留着');
  assert.ok(veilTop <= (M.constructor as any).VEIL_MAX + 1e-9 && M.core > 0.9, `出来同样：门洞那团云裹着人、整屏不超过上限（最大 ${veilTop.toFixed(2)}）`);
  const G1 = M.gate!; assert.ok(Math.hypot(p.x - G1.x, p.y - G1.y) < 5 && Math.hypot(G1.x - G0.x, G1.y - G0.y) < 100, '出来落在外面的门心（就是进去时的那道门）');
  step(30); assert.ok(!M.active, '站在门心不会被立刻送回去');
  // 走出去再走回来：还是同一座秘境
  wasIn = false; walkTo(G1.x + 500, G1.y); step(10); walkTo(G1.x, G1.y); for (let i = 0; i < 60 && !M.active; i++) step(1);
  assert.ok(M.active && M.floor === F1 && M.floor!.rooms[1].entered, '回去是同一座秘境，进度还在');
  M.leave('force'); step(3);
  assert.ok(!M.active && !M.gate && M.veil === 0, '强行离开（传送、身死）不留门、不留云');
}
// 总审：放大后的首领台比「离主角 5000 以外的敌人清出战斗」那条线还大——惊醒首领再飞远，不能算伏诛；回来它还在
{
  M.enter({ name: '远遁', tier: 3, theme: 'tomb', seed: 4321, floors: 1, rooms: 12, lv: 3 } as any); step(3);
  const F = M.floor!, boss = F.rooms.find((r) => r.kind === 'boss')!, bc = M.roomC(boss), hub = M.roomC(F.rooms[0]);
  const put = (x: number, y: number) => { p.flying = true; p.x = x; p.y = y; p.st.x = x; p.st.y = y; (M as any).lastOk = { x, y }; (M as any).lastLand = { x, y }; };
  put(bc.x, bc.y); step(3);
  assert.ok(boss.entered && boss.foes.length > 0, '飞上首领台：首领醒了');
  const kills0 = (M as any).cur.kills, n0 = boss.foes.length;
  assert.ok(Math.hypot(hub.x - bc.x, hub.y - bc.y) > 5200, `主台离首领台够远：${Math.round(Math.hypot(hub.x - bc.x, hub.y - bc.y))}`);
  put(hub.x, hub.y); step(20);
  assert.ok(!boss.cleared && !F.bossDead, '飞远了：首领没被打，不算伏诛');
  assert.equal((M as any).cur.kills, kills0, '斩敌数没变');
  assert.ok(boss.foes.every((e) => !g.combat.enemies.includes(e)), '离得远的首领一伙确实被清出了战斗（睡在原地）');
  put(bc.x, bc.y); step(5);
  assert.equal(boss.foes.filter((e) => !e.dead && g.combat.enemies.includes(e)).length, n0, '回到首领台：它们都还在，重新回到战斗里');
  assert.ok(!boss.cleared, '首领台仍没清空');
  M.leave('force'); step(3);
}

// 第六轮返工：打到哪儿随存档走——人在秘境里存档（存的是门外那一点），读回来再从同一处门进去，清过的石台、开过的宝匣、
// 死了的首领都还是那样；读回来在外头先存一次（自动存档），那份进度照「刚出来留着」算，不丢；打通出来就作废
{
  const spec = { name: '存档试炼', tier: 2, theme: 'cave', seed: 9876, floors: 1, rooms: 7, lv: 3 } as any;
  const bx = p.x, by = p.y;
  M.enter(spec); step(3);
  const F = M.floor!;
  const r1 = F.rooms.find((r) => r.i > 0 && r.kind !== 'boss')!, boss = F.rooms.find((r) => r.kind === 'boss')!;
  r1.entered = true; r1.cleared = true;
  const ci = F.objs.findIndex((o) => o.kind === 'chest' && !o.hidden); if (ci >= 0) F.objs[ci].used = true;
  const want = F.rooms.map((r) => (r.cleared ? 1 : 0)).join(''), used = F.objs.map((o) => (o.used ? 1 : 0)).join('');
  assert.ok(g.save(1), '在秘境里存档');
  M.leave('force'); step(2);
  assert.ok(g.load('taixu_save_1'), '读档'); step(2);
  assert.ok(!M.active && Math.hypot(p.x - bx, p.y - by) < 5, '读回来在门外');
  assert.ok(g.save(1), '读回来在外头先存一次（自动存档）');
  assert.ok((g.ws.flags as any).mjProg && !(g.ws.flags as any).mjProg.inside, '那份进度改记成「留着」，没丢');
  M.enter(spec); step(3);
  assert.equal(M.floor!.rooms.map((r) => (r.cleared ? 1 : 0)).join(''), want, `再进去：清过的石台还是清过的 ${want}`);
  assert.equal(M.floor!.objs.map((o) => (o.used ? 1 : 0)).join(''), used, '开过的宝匣还是开过的');
  assert.ok(!boss.cleared && !M.floor!.bossDead, '首领还没打');
  // 首领死了也记得：存、读、再进去，首领台空着、宝匣亮着
  const B2 = M.floor!.rooms[boss.i]; B2.entered = true; B2.cleared = true; M.floor!.bossDead = true;
  assert.ok(g.save(1)); M.leave('force'); step(2); assert.ok(g.load('taixu_save_1')); step(2);
  M.enter(spec); step(3);
  assert.ok(M.floor!.bossDead && M.floor!.rooms[boss.i].cleared, '首领死了，读档回来还是死的');
  assert.ok(M.floor!.objs.filter((o) => o.room === boss.i).every((o) => !o.hidden), '首领台上藏着的宝匣亮着');
  // 打通出来：存档里的进度作废，下回再进是新的一份
  M.leave('exit'); step(2);
  assert.equal((g.ws.flags as any).mjProg, undefined, '打通出来，进度作废');
  M.enter(spec); step(3);
  assert.ok(!M.floor!.bossDead, '再进是新的一份'); M.leave('force'); step(2);
}

console.log('PASS 秘境：四种主题都能进出；石台群（主台、分台、首领祭坛、石桥相连）；能走到每座台；起飞后越得过台沿、落不到云海、飞不出界壁、只在低空；云门进出无缝、没打完可回去；不误换图；打到哪儿随存档走');
