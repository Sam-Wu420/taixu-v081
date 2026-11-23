// P10 宗门「能玩」：用真实的 Game（无画面）在每种骨架挑一座宗门，从山脚引道口一路走到正殿前——
//   走法和玩家点地面一样（setDestination，按真的移动、限坡、建筑碰撞走），沿宗门里的步行网（各台汇点、石阶两头）一站站走；
//   每一站都要走到（不被殿阁、石栏、陡坎卡住）；石阶、长石桥上不被建筑封住；
//   走到正殿前「进入」面板出得来（附近地点是这座宗门、能进入）；山门广场上也出得来；
//   宗门里的 NPC 站在台面上、不在建筑里、不在崖上（站得住）。
//   npx tsx tools/test-sect-walk.ts [宗门id ...]
import './env';
import assert from 'node:assert/strict';
(globalThis as any).__TAIXU_MOUNTAINS = true;
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;

// 每种骨架一座（山里 / 平地各挑）：地图、宗门
const PICK: [string, string][] = [['tiannan', 'huangfeng'], ['tiannan', 'qianzhu'], ['tiannan', 'yinluo'], ['tiannan', 'yanyue'], ['tiannan', 'guiling'], ['tiannan', 'luoyun'],
  ['tiannan', 'gujian'], ['tiannan', 'qixuan'], ['luanxing', 'jiyin'], ['dajin', 'tianmo']];
const only = process.argv.slice(2);
const W = await import('../src/data/world');
const { grandSectPlan, rectDist } = await import('../src/data/sectPlan');
const { getLayout, LOC_SCALE } = await import('../src/gfx/building');
const lines: string[] = [];
for (const map of ['tiannan', 'luanxing', 'dajin']) {
  const ids = PICK.filter(([m, id]) => m === map && (!only.length || only.includes(id))).map(([, id]) => id);
  if (!ids.length) continue;
  store['taixu.map'] = map;
  W.setActiveMap(map as never);
  const G = await import('../src/world/game');
  const g = await G.createGame(() => {});
  g.reset();
  if (W.ACTIVE_MAP !== map) { g.switchMap(map as never); }
  assert.equal(W.ACTIVE_MAP, map);
  for (const id of ids) lines.push(walk(g, id));
}
console.log(lines.join('\n'));
console.log('PASS 宗门能玩：每种骨架从山脚引道口沿石阶走到正殿前，进入面板出得来，宗门里的人站在台面上');

function walk(g: Awaited<ReturnType<(typeof import('../src/world/game'))['createGame']>>, id: string): string {
  const loc = W.LOC_BY_ID.get(id)!, P = grandSectPlan(loc)!, L = getLayout(loc), T = g.terrain, p = g.player;
  const ox = loc.x * W.WORLD_SCALE, oy = loc.y * W.WORLD_SCALE, name = `${loc.name}（${P.look.variant}${P.mountain ? '·山里' : '·平地'}）`;
  const toW = (i: number) => [ox + L.nav!.pts[i * 2] * LOC_SCALE, oy + L.nav!.pts[i * 2 + 1] * LOC_SCALE] as const;
  // 步行网：从离山门最近的点走到离正殿台汇点最近的点（广度优先）
  const main = P.terraces.find((t) => t.role === 'main') ?? P.terraces[0];
  const near = (x: number, y: number) => { let b = 0, bd = Infinity; for (let i = 0; i < L.nav!.pts.length / 2; i++) { const [px, py] = toW(i), d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; b = i; } } return b; };
  const a = near(ox + P.gate.x, oy + P.gate.y - 150), z = near(ox + main.x, oy + main.y + main.h * 0.3);
  const prev = new Int32Array(L.nav!.adj.length).fill(-2); prev[a] = -1; const q = [a];
  while (q.length) { const c = q.shift()!; for (const nb of L.nav!.adj[c]) if (prev[nb] === -2) { prev[nb] = c; q.push(nb); } }
  assert.ok(prev[z] !== -2, `${name} 步行网应能从山门走到正殿台`);
  const route: (readonly [number, number])[] = []; for (let c = z; c >= 0; c = prev[c]) route.unshift(toW(c));
  // 起点：山脚的引道口（岛上的宗门：码头）
  g.player.flying = false; g.teleport(ox + P.gateOut.x, oy + P.gateOut.y - 20);
  if (g.modal) g.closeModal(true);
  assert.ok(T.walkFactor(p.x, p.y) > 0 && T.surface.sample(p.x, p.y).walkable, `${name} 引道口应站得住`);
  const wps: (readonly [number, number])[] = [[ox + P.gate.x, oy + P.gate.y - 120], ...route];
  let walked = 0, secs = 0;
  for (const [wx, wy] of wps) {
    g.setDestination(wx, wy);
    let last = Infinity, stall = 0;
    for (let k = 0; k < 4000; k++) {
      if (g.modal) g.closeModal(true);
      const x0 = p.x, y0 = p.y;
      g.update(0.05); secs += 0.05;
      walked += Math.hypot(p.x - x0, p.y - y0);
      const d = Math.hypot(wx - p.x, wy - p.y);
      if (d < 40) break;
      if (!g.destination) g.setDestination(wx, wy);   // 战斗、对话打断了：接着走
      if (d > last - 0.5) stall++; else stall = 0;
      last = Math.min(last, d);
      assert.ok(stall < 120, `${name} 走不到下一站（${Math.round(wx - ox)}, ${Math.round(wy - oy)}）：卡在 (${Math.round(p.x - ox)}, ${Math.round(p.y - oy)})，还差 ${Math.round(d)}`);
    }
  }
  assert.ok(P.terraces.some((t) => t.id === main.id && rectDist(t, p.x - ox, p.y - oy) < 0), `${name} 应走到正殿台上`);
  // 进入面板：正殿前、山门广场上都出得来
  const card = () => { const l = g.nearbyLocation(); return !!l && l.id === id && g.towns.canEnter(l); };
  assert.ok(card(), `${name} 正殿前应出「进入」面板`);
  g.teleport(ox + P.spawn.x, oy + P.spawn.y); assert.ok(card(), `${name} 山门广场上应出「进入」面板`);
  // 宗门里的 NPC：落脚处（停下来的位置、要去的落脚点）都在台面上、站得住、不在建筑里。
  // 半路上的不算（御剑的从山坡上空飞过、神识外粗算的直线挪动，都是一路过去，不会停在那里）
  let npcs = 0, bad: string[] = [];
  const inBlock = (x: number, y: number) => L.blocks.some((b) => (x - ox) / LOC_SCALE > b.x && (x - ox) / LOC_SCALE < b.x + b.w && (y - oy) / LOC_SCALE > b.y && (y - oy) / LOC_SCALE < b.y + b.h);
  // 平地堆的小山：台地之间的缓坡、石阶四面都走得通，停在那里也算站得好（山里的宗门必须在台面上——台沿外是挡墙和崖）
  const good = (x: number, y: number) => !inBlock(x, y) && T.walkFactor(x, y) > 0 && T.surface.sample(x, y).walkable && (!P.mountain || P.terraces.some((t) => t.role !== 'lake' && rectDist(t, x - ox, y - oy) < 0));
  for (let sim = 0; sim < 2; sim++) {
    for (const n of g.npcs.list) {
      if ((n.map ?? 'tiannan') !== W.ACTIVE_MAP || !n.alive) continue;
      const m = T.surface.massifAt(n.tx, n.ty); if (!m || m.plan.id !== id || m.weight < 1) continue;
      npcs++;
      const at = Math.hypot(n.tx - n.x, n.ty - n.y) < 60;
      if ((!good(n.tx, n.ty) || (at && !good(n.x, n.y))) && bad.length < 4) bad.push(`${n.name}(${Math.round(n.tx - ox)},${Math.round(n.ty - oy)}${at ? '，已到' : ''}，${n.goal}/${(g.npcs.active.get(n.id) as any)?.life?.k ?? (g.npcs.active.get(n.id) as any)?.act ?? '神识外'}，人在 ${Math.round(n.x - ox)},${Math.round(n.y - oy)} 块${inBlock(n.x, n.y) ? '里' : '外'} 坡${T.surface.sample(n.x, n.y).slope.toFixed(2)})`);
    }
    for (let k = 0; k < 600; k++) { if (g.modal) g.closeModal(true); g.update(0.05); }   // 再过半刻钟，看他们换了落脚处之后
  }
  assert.equal(bad.length, 0, `${name} 宗门里的人应站在台面上、不在建筑里：${bad.join('、')}`);
  return `  ${name}：引道口 → 正殿 ${wps.length} 站，走了 ${Math.round(walked)}（${secs.toFixed(0)} 息），进入面板正常，地界里 ${npcs} 人次的 NPC 落脚处都在台面上`;
}
