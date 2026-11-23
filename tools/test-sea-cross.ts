// 飞越无边海（南荒东缘 ⇄ 沧溟海西缘）：东边放开、过中线悄悄换图（横纵坐标各差一个固定的平移）、回程换回南荒；
// 顺带检查边地的内容：草原上的驿站与营地、大路中段的茶寮驿站、海上的岛。用真实的 Game 无界面地跑。
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const W = await import('../src/data/world');
const G = await import('../src/world/game');
assert.equal(W.ACTIVE_MAP, 'tiannan');
const D = W.SEA_DEPTH, F = W.MAP_FRAME.luanxing!;
const g = await G.createGame(() => {});
g.reset();
g.hero.realm = 4; g.hero.stage = 0;
const p = g.player;
const place = (x: number, y: number) => { g.teleport(x, y); p.flying = true; g.combat.reset(); if (g.modal) g.closeModal(true); };
const fly = (key: string, frames: number, until?: () => boolean) => {
  g.input.keys.clear(); g.input.keys.add(key);
  let n = 0;
  for (; n < frames; n++) { if (g.modal) g.closeModal(true); g.paused = false; g.input.keys.add(key); g.update(0.1); g.combat.enemies.length = 0; p.flying = true; if (until?.()) break; }
  g.input.keys.clear();
  return n;
};

// 0. 边地的内容
{
  const locs = W.LOCATIONS, out = locs.filter((l) => l.y < 0), camps = out.filter((l) => l.look === 'camp'), posts = out.filter((l) => l.look === 'post');
  assert.ok(camps.length >= 6 && posts.length >= 3, `南荒一侧的草原上应有营地和驿站：${camps.length} / ${posts.length}`);
  assert.ok(out.every((l) => l.y * W.WORLD_SCALE > -W.SEAM_DEPTH / 2 + 11000 && l.y * W.WORLD_SCALE < -6000), '图外的地点离图边和中线都留出一段');
  assert.ok(locs.filter((l) => l.type === 'inn' && l.y > 0).length >= 8, '图内大路中段有茶寮驿站');
  assert.ok(locs.filter((l) => l.look === 'camp' && l.y > 0).length >= 4, '图内的朔漠草原上有部落营地');
  const isles = locs.filter((l) => l.x > W.MACRO_W);
  assert.equal(isles.length, 2, '南荒一侧的无边海上有两座岛');
  for (const l of [...out, ...isles]) assert.ok(g.terrain.isLand(l.x * W.WORLD_SCALE, l.y * W.WORLD_SCALE), `${l.name} 应当在陆地上`);
  // 商道：草原上顺着它走是「在路上」
  const [rx, ry] = W.SEAM_ROAD[3];
  assert.ok(g.terrain.seamRoadDist(rx - Math.sin(ry / 2100) * 260, ry) < 30 && g.terrain.onRoad(rx - Math.sin(ry / 2100) * 260, ry), '商道上算在路上');
  assert.ok(!g.terrain.onRoad(rx + 4000, ry), '离开商道就不在路上');
}

// 1. 东边放开（只在两张图都有的那一段纬度），其余照旧
const [lo, hi] = W.seamSpan('tiannan', W.seamsOf('tiannan').find((s) => s.side === 'e')!);
assert.deepEqual([lo, hi], [83968, 83968 + 252000]);
place(W.WORLD_W - 1500, 200000);
fly('d', 1500, () => p.x > W.WORLD_W + 800);
assert.ok(p.x > W.WORLD_W + 500, `应当飞出了南荒东缘：x=${p.x}`);
assert.ok(g.seamDepth > 500 && g.seam?.name === '无边海' && g.terrain.inOutland(p.x, p.y));
assert.equal(g.isExplored(p.x, p.y), true, '图外不设迷雾');
// 绝域（B1）之后不设空气墙：沧溟海够不着的那截东缘外是外圈海，照样飞得出去，只是不换图（外圈深处由罡风吹回来，见 test-jueyu）
place(W.WORLD_W - 1500, hi + 6000); fly('d', 300); assert.ok(p.x > W.WORLD_W + 5000 && p.x < W.WORLD_W + 57001 && g.mapEpoch === 0 && W.ACTIVE_MAP === 'tiannan', `外圈海放开但不换图：x=${p.x}`);

// 2. 过中线换图
const day0 = g.day;
place(W.WORLD_W + D / 2 - 6000, 200000);
const probe: [number, number] = [W.WORLD_W + D / 2 + 2000, 200000];
const before = { x: p.x, y: p.y, sample: g.terrain.sample(...probe), land: g.terrain.isLand(...probe) };
let prev = p.x, moved = 0, jump = 0;
const frames = fly('d', 20000, () => { const dx = p.x - prev; if (g.mapEpoch === 0) moved += dx; else if (!jump) jump = dx; prev = p.x; return g.mapEpoch > 0; });
assert.equal(g.mapEpoch, 1, `飞了 ${frames} 帧应当已经换图`);
assert.equal(W.ACTIVE_MAP, 'luanxing'); assert.equal(store['taixu.map'], 'luanxing');
assert.ok(Math.abs(jump - F.dx) < 600, `换图那一帧横坐标平移一个固定量：${jump} vs ${F.dx}`);
assert.ok(Math.abs(p.y - (before.y + F.dy)) < 5, `纵坐标也平移一个固定量：${p.y}`);
assert.ok(p.x < 0 && g.seamDepth > D * 0.3 && g.seam?.side === 'w', `换图后在沧溟海一侧的海上：纵深 ${g.seamDepth}`);
const s2 = g.terrain.sample(probe[0] + F.dx, probe[1] + F.dy);
for (const k of ['land', 'elev', 'arid', 'cold', 'forest'] as const) assert.ok(Math.abs(s2[k] - before.sample[k]) < 1e-6, `地貌 ${k} 应一致`);
assert.equal(g.terrain.isLand(probe[0] + F.dx, probe[1] + F.dy), before.land);
assert.ok(!g.halted && p.flying, '换图不打断飞行');

// 3. 接着向东飞进沧溟海
fly('d', 40000, () => g.seamDepth < -2000);
assert.ok(g.seamDepth < -2000 && p.x > 0, `应当已进入沧溟海：纵深 ${g.seamDepth}`);
const days = g.day - day0;
assert.ok(days > 60 && days < 260, `横渡折算的天数（测试里是瞬移到中线附近再飞，会多算前半程）：${days}`);
assert.equal(W.LOCATIONS.filter((l) => l.x < 0).length, 2, '沧溟海一侧的无边海上有两座岛');

// 4. 海上存档读档
place(-20000, 120000);
assert.ok(g.save(1)); place(60000, 60000); assert.ok(g.load('taixu_save_1'));
assert.ok(Math.abs(p.x + 20000) < 400 && g.seamDepth > 19000, `读档后仍在海上：x=${p.x}`);

// 5. 回程
place(-(D / 2 - 6000), 120000);
fly('a', 20000, () => g.mapEpoch > 1);
assert.equal(W.ACTIVE_MAP, 'tiannan');
assert.ok(p.x > W.WORLD_W && g.seamDepth > D * 0.3, `换回南荒一侧的海上：x=${p.x}`);
fly('a', 40000, () => g.seamDepth < -2000);
assert.ok(g.seamDepth < -2000 && p.x < W.WORLD_W, '回到南荒');
console.log(`PASS 飞越无边海：东缘放开（只在两图都有的纬度）；过中线悄悄换图（横 ${F.dx}、纵 ${F.dy}，两边地貌一致）；海上可存读档；回程换回南荒；边地有驿站、营地、茶寮和岛`);
