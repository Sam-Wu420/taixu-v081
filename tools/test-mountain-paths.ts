// 高山模式下的山道：每条路从头到尾都能走（石阶不受限坡约束）；路基是整平的；
// 大陆上的每个地点至少接着一条路；峭壁仍然挡路。全图连通性另见 tools/check-reachability.ts。
import './env';
import assert from 'node:assert/strict';

(globalThis as { __TAIXU_MOUNTAINS?: boolean }).__TAIXU_MOUNTAINS = true;
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (key: string) => store[key] ?? null, setItem: (key: string, value: string) => { store[key] = value; }, removeItem: (key: string) => { delete store[key]; } };

const { Terrain } = await import('../src/world/terrain');
const { LOCATIONS, WORLD_SCALE } = await import('../src/data/world');
const { MOUNTAINS, SURFACE_MAX_HEIGHT } = await import('../src/world/surface');
const { grandSectPlan } = await import('../src/data/sectPlan');
assert.equal(MOUNTAINS, true);
const terrain = new Terrain();
terrain.build();
const S = terrain.surface, R = terrain.roadSegW;

// 1. 每条路逐步可走；路中线上横向是平的（路基整平）
let steps = 0, steepSteps = 0, crossChecked = 0, worstCross = 0, highest = 0;
for (let i = 0; i < R.length; i += 8) {
  const x1 = R[i], y1 = R[i + 1], x2 = R[i + 2], y2 = R[i + 3], len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 1) continue;
  const n = Math.max(1, Math.ceil(len / 60)), nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
  for (let k = 0; k < n; k++) {
    const ax = x1 + (x2 - x1) * k / n, ay = y1 + (y2 - y1) * k / n, bx = x1 + (x2 - x1) * (k + 1) / n, by = y1 + (y2 - y1) * (k + 1) / n;
    if (!terrain.isLand(ax, ay) || !terrain.isLand(bx, by)) continue;
    steps++;
    assert.ok(S.canTraverse(ax, ay, bx, by), `山道应能走：(${Math.round(ax)}, ${Math.round(ay)})`);
    assert.ok(S.sample(ax, ay).walkable);
    const ha = S.heightAt(ax, ay), hb = S.heightAt(bx, by);
    highest = Math.max(highest, ha);
    if (Math.abs(hb - ha) / (len / n) > 0.8) steepSteps++;
    if (k % 5 === 0) {   // 路基：中线两侧 40 单位内高度基本一致
      const side = Math.max(Math.abs(S.heightAt(ax + nx * 40, ay + ny * 40) - ha), Math.abs(S.heightAt(ax - nx * 40, ay - ny * 40) - ha));
      worstCross = Math.max(worstCross, side); crossChecked++;
    }
  }
}
assert.ok(steps > 20000, `道路采样 ${steps}`);
// 路基横向高差：宗门山脚引道口曾经因为地界外的山坡压得太低冒到 402（石阶脚下一道坎），现在应回到 200 以内的老水平
assert.ok(worstCross < 220, `路基横向高差过大：${worstCross.toFixed(1)}`);
assert.ok(highest > 2000 && highest < SURFACE_MAX_HEIGHT, `应有修到高山上的路：最高 ${highest}`);

// 2. 大陆上的地点都接着路：地点范围内（或紧挨着）有路经过
let checked = 0, unlinked: string[] = [];
for (const l of LOCATIONS) {
  if (l.type === 'isle' || l.island) continue;
  const x = l.x * WORLD_SCALE, y = l.y * WORLD_SCALE;
  if (!terrain.isLand(x, y)) continue;
  if (terrain.inOutland(x, y)) continue;   // 图外草原上的驿站在商道边、营地在平地上，不走山道
  checked++;
  let near = false;
  // P10 占山的宗门：路接在山脚的引道口上（地点中心在山上），按引道口算
  const plan = grandSectPlan(l), px = plan ? x + plan.gateOut.x : x, py = plan ? y + plan.gateOut.y : y;
  for (let i = 0; i < R.length && !near; i += 8) {
    if (Math.hypot(R[i] - px, R[i + 1] - py) < 900 || Math.hypot(R[i + 2] - px, R[i + 3] - py) < 900) near = true;
  }
  if (!near) unlinked.push(l.name);
}
assert.ok(unlinked.length <= checked * 0.02, `没接上路的地点 ${unlinked.length}/${checked}：${unlinked.slice(0, 8).join('、')}`);

// 3. 峭壁仍然挡路：全图里确实存在走不了的陡坡，而且那里不是路
let cliffs = 0;
for (let y = 600; y < 420000 && cliffs < 50; y += 1500) for (let x = 600; x < 600000 && cliffs < 50; x += 1500) {
  if (!terrain.isLand(x, y)) continue;
  const s = S.sample(x, y);
  if (!s.walkable) {
    cliffs++;
    assert.ok(s.slope > 0.8 && !S.onRoadBed(x, y));
    // 顺着最陡的方向（正上坡）走不过去
    const gx = S.heightAt(x + 60, y) - S.heightAt(x - 60, y), gy = S.heightAt(x, y + 60) - S.heightAt(x, y - 60), g = Math.hypot(gx, gy);
    assert.ok(!S.canTraverse(x - gx / g * 60, y - gy / g * 60, x + gx / g * 60, y + gy / g * 60), '峭壁应挡住正上坡的路');
  }
}
assert.ok(cliffs >= 50, `应有峭壁：${cliffs}`);
console.log(`PASS 高山模式山道：${steps} 步全部可走（其中 ${steepSteps} 步超过限坡，靠石阶放行），路基横向高差最大 ${worstCross.toFixed(1)}（${crossChecked} 处），最高的路在海拔 ${Math.round(highest)}；${checked} 个地点里 ${unlinked.length} 个没接上路；峭壁仍挡路`);
