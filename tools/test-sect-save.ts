// P10 旧存档读进新宗门：存档里的位置落在新宗门的山体里时，读档挪到台面 / 山外。
//   · 主角站在挡墙 / 崖面上（走不动）、站在殿阁的碰撞块里 → 挪到最近的台面落脚点，站得住、不在建筑里；
//   · 主角本来就站在台面空地上 → 不动；
//   · NPC 落在殿阁里 → 挪到落脚点；
//   · 洞府落在宗门地界里 → 挪到地界（含过渡带）外的陆地上。
//   npx tsx tools/test-sect-save.ts
import './env';
import assert from 'node:assert/strict';
(globalThis as any).__TAIXU_MOUNTAINS = true;
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;
const W = await import('../src/data/world');
const G = await import('../src/world/game');
const { getLayout, LOC_SCALE } = await import('../src/gfx/building');
const { grandSectPlan, rectDist } = await import('../src/data/sectPlan');
const g = await G.createGame(() => {});
g.reset();
const p = g.player, T = g.terrain;
assert.ok(g.save(1));
const base = JSON.parse(store['taixu_save_1']);

const lines: string[] = [];
for (const id of ['huangfeng', 'luoyun', 'qixuan']) {
  const loc = W.LOC_BY_ID.get(id)!, P = grandSectPlan(loc)!, L = getLayout(loc);
  const ox = loc.x * W.WORLD_SCALE, oy = loc.y * W.WORLD_SCALE;
  const inBlock = (x: number, y: number) => L.blocks.some((b) => (x - ox) / LOC_SCALE > b.x && (x - ox) / LOC_SCALE < b.x + b.w && (y - oy) / LOC_SCALE > b.y && (y - oy) / LOC_SCALE < b.y + b.h);
  const onTerrace = (x: number, y: number) => P.terraces.some((t) => rectDist(t, x - ox, y - oy) < 0);
  const stand = (x: number, y: number) => T.walkFactor(x, y) > 0 && T.surface.sample(x, y).walkable;
  // 几个旧位置：殿阁正中（碰撞块里）、主台东沿外的陡坎上（山里的宗门）、台面上的空地（不该动）
  const main = P.terraces.find((t) => t.role === 'main')!;
  const big = [...L.blocks].sort((a, b) => b.w * b.h - a.w * a.h)[0];
  const inHall: [number, number] = [ox + (big.x + big.w / 2) * LOC_SCALE, oy + (big.y + big.h / 2) * LOC_SCALE];
  let cliff: [number, number] | null = null;
  if (P.mountain) for (let d = 20; d < 120 && !cliff; d += 10) { const x = ox + main.x + main.w / 2 + d, y = oy + main.y; if (!stand(x, y)) cliff = [x, y]; }
  const spot = L.spots![0], free: [number, number] = [ox + spot.x * LOC_SCALE, oy + spot.y * LOC_SCALE];
  const homeAt: [number, number] = [ox + main.x, oy + main.y];
  const cases: [string, [number, number], boolean][] = [['殿阁里', inHall, true], ['台面空地', free, false]];
  if (cliff) cases.push(['陡坎上', cliff, true]);
  for (const [what, [x, y], move] of cases) {
    const d = structuredClone(base);
    d.p.x = x / (W.WORLD_SCALE / d.ws); d.p.y = y / (W.WORLD_SCALE / d.ws); d.p.flying = false;
    // 第一个 NPC 也放进殿阁里
    const n0 = d.npcs.find((n: any) => (n.map ?? 'tiannan') === 'tiannan');
    n0.x = n0.tx = inHall[0] / (W.WORLD_SCALE / d.ws); n0.y = n0.ty = inHall[1] / (W.WORLD_SCALE / d.ws);
    d.world.home = { map: 'tiannan', x: homeAt[0], y: homeAt[1], key: 'old', name: '旧洞府', plots: [], array: 0, built: 0 };
    store['taixu_save_2'] = JSON.stringify(d);
    g.teleport(100000, 100000);
    assert.ok(g.load('taixu_save_2'), `${loc.name} ${what}：读档成功`);
    const moved = Math.hypot(p.x - x, p.y - y) > 1;
    assert.equal(moved, move, `${loc.name} ${what}：${move ? '应挪开' : '不该动'}（挪了 ${Math.round(Math.hypot(p.x - x, p.y - y))}）`);
    assert.ok(stand(p.x, p.y) && !inBlock(p.x, p.y), `${loc.name} ${what}：读档后应站得住、不在建筑里`);
    if (move) assert.ok(onTerrace(p.x, p.y), `${loc.name} ${what}：应挪到台面上`);
    const n1 = g.npcs.list.find((n) => n.id === n0.id)!;
    assert.ok(!inBlock(n1.x, n1.y) && !inBlock(n1.tx, n1.ty) && onTerrace(n1.x, n1.y), `${loc.name}：NPC 应挪出殿阁、落在台面上`);
    const h = (g.ws as any).home, m = T.surface.massifAt(h.x, h.y);
    assert.ok(!m && T.walkFactor(h.x, h.y) > 0, `${loc.name}：洞府应挪到宗门地界外的陆地上`);
    lines.push(`  ${loc.name} ${what}：${move ? `挪到台面 ${Math.round(Math.hypot(p.x - x, p.y - y))} 远` : '原地不动'}；NPC 挪出殿阁；洞府挪出地界 ${Math.round(Math.hypot(h.x - homeAt[0], h.y - homeAt[1]))} 远`);
  }
}
console.log(lines.join('\n'));
console.log('PASS 旧存档读进新宗门：落在殿阁里、陡坎上的人挪到台面，站在台面上的不动，洞府挪出地界');
