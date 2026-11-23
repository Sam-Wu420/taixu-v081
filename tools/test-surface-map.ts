import './env';
import assert from 'node:assert/strict';

const { Terrain } = await import('../src/world/terrain');
const { ACTIVE_MAP, LOCATIONS, WORLD_SCALE } = await import('../src/data/world');
const { MOUNTAINS } = await import('../src/world/surface');
const { grandSectPlan } = await import('../src/data/sectPlan');
const terrain = new Terrain();
terrain.build();
const segments = terrain.roadSegW;

interface Path { start: number; end: number }
const paths: Path[] = [];
// 按 terrain.roads 的顺序切：每条路的线段一直取到这条路的终点为止（roadSegW 按路的顺序首尾相接；
// 两条路可能在同一处山门牌坊首尾相接，不能只看「这一段的起点是不是上一段的终点」）
let start = 0;
for (const road of terrain.roads) {
  const last = road.pts[road.pts.length - 1], ex = Math.fround(last[0] * WORLD_SCALE), ey = Math.fround(last[1] * WORLD_SCALE);
  let i = start;
  while (i < segments.length && !(segments[i + 2] === ex && segments[i + 3] === ey)) i += 8;
  assert(i < segments.length, '道路线段应按道路顺序首尾相接');
  paths.push({ start, end: i + 8 });
  start = i + 8;
}
assert.equal(start, segments.length, '应覆盖每条实际道路');
for (let k = 0; k < paths.length; k++) for (let i = paths[k].start + 8; i < paths[k].end; i += 8) {
  assert(segments[i] === segments[i - 6] && segments[i + 1] === segments[i - 5], '同一条路的线段应首尾相接');
}

let maxRoadGrade = 0, roadSamples = 0, steepSamples = 0;
for (let i = 0; i < segments.length; i += 8) {
  const ax = segments[i], ay = segments[i + 1], bx = segments[i + 2], by = segments[i + 3];
  const length = Math.hypot(bx - ax, by - ay);
  assert(length > 0, `道路段 ${i / 8} 长度为零`);
  assert(terrain.canTraverse(ax, ay, bx, by), `道路段 ${i / 8} 不可通行`);
  const steps = Math.ceil(length / 25);
  let last = terrain.surfaceHeight(ax, ay);
  assert(Number.isFinite(last));
  for (let j = 1; j <= steps; j++) {
    const t = j / steps, height = terrain.surfaceHeight(ax + (bx - ax) * t, ay + (by - ay) * t);
    assert(Number.isFinite(height));
    const g = Math.abs(height - last) / (length / steps);
    maxRoadGrade = Math.max(maxRoadGrade, g);
    roadSamples++; if (g > 1) steepSamples++;
    last = height;
  }
}
// 平地模式：路面最大坡度 0.4。
// 高山模式（默认）：山道按 0.5 起坡，两头地点高低悬殊时整段放陡成石阶（src/world/surface.ts）。这里卡两条：
//   一、最陡处不超过 1.5——修之前通到山脚地点平台边上的路是几千高的峭壁（坡度 13，c1518 附近），
//       后来 v93、v834 两座镇子之间仍有 3.14（台面高差三千四、两块台面之间只剩一千来步）；第五轮地形线按路网距离挪了平台高度、
//       交叉的路补了连线（surface.ts relaxPlatforms），全图最陡约 1.04（毒蛟潭北两条路交叉处），坡度统计见 tools/check-steep-roads.ts；
//   二、陡过 1（两倍山道坡度）的路面采样不到 1%。
const steepShare = steepSamples / Math.max(1, roadSamples);
if (MOUNTAINS) {
  assert(maxRoadGrade <= 1.5, `实际道路最大坡度 ${maxRoadGrade} 超限（高山模式上限 1.5）`);
  assert(steepShare < 0.01, `陡过 1 的路面采样占 ${(steepShare * 100).toFixed(2)}%，应不到 1%`);
} else assert(maxRoadGrade <= 0.4, `实际道路最大坡度 ${maxRoadGrade} 超限`);

// 只有没占山的小宗门还是一整块平台；占山的大宗门（P10）是多层台地，台面、山门另有 test-sect-* 测
for (const loc of LOCATIONS.filter(l => l.type === 'sect' && !grandSectPlan(l))) {
  const zone = terrain.locZones.find(z => z.id === loc.id);
  assert(zone);
  const x = loc.x * WORLD_SCALE, y = loc.y * WORLD_SCALE, radius = Math.max(zone.rx, zone.ry);
  const plateau = terrain.surfaceHeight(x, y);
  for (let row = -5; row <= 5; row++) for (let col = -5; col <= 5; col++) {
    if (row * row + col * col > 25) continue;
    assert(Math.abs(terrain.surfaceHeight(x + radius * col / 5, y + radius * row / 5) - plateau) < 1e-6, `${loc.id} 平台不平`);
  }
}

for (const id of ACTIVE_MAP === 'tiannan' ? ['qixuan', 'huangfeng'] : []) {
  const loc = LOCATIONS.find(l => l.id === id);
  const zone = terrain.locZones.find(z => z.id === id);
  assert(loc && zone);
  const x = loc.x * WORLD_SCALE, y = loc.y * WORLD_SCALE, radius = Math.max(zone.rx, zone.ry);
  const plan = grandSectPlan(loc);
  // 占山的大宗门（P10）：路接到山脚的山门牌坊（从那里起是宗门自己的石阶），山门广场在基准面上；没占山时仍是一整块平台，从中心走到路口
  const gateX = plan ? x + plan.gate.x : x, gateY = plan ? y + plan.gate.y : y;
  const plateau = plan ? terrain.surface.massifBase.get(id)! : terrain.surfaceHeight(x, y);
  if (!plan) {
    assert(plateau >= (id === 'qixuan' ? 360 : 420));
    for (let row = -10; row <= 10; row++) for (let col = -10; col <= 10; col++) {
      if (row * row + col * col > 100) continue;
      const height = terrain.surfaceHeight(x + radius * col / 10, y + radius * row / 10);
      assert(Math.abs(height - plateau) < 1e-6, `${id} 平台不平：${height} vs ${plateau}`);
    }
  } else assert(Math.abs(terrain.surfaceHeight(gateX, gateY) - plateau) < 1, `${id} 山门广场应在基准面上：${terrain.surfaceHeight(gateX, gateY)} vs ${plateau}`);
  // 「通到这处宗门的路」：占山的大宗门看路的一头是不是山门牌坊（大宗门的山门牌坊可能在地界半径外），否则看是不是在地界里
  const hub = plan ? { x: x + plan.gateOut.x, y: y + plan.gateOut.y, r: 1 } : { x, y, r: radius };
  const routes = paths.filter(({ start, end }) => Math.min(
    Math.hypot(segments[start] - hub.x, segments[start + 1] - hub.y),
    Math.hypot(segments[end - 6] - hub.x, segments[end - 5] - hub.y),
  ) < hub.r);
  const sourceRoutes = terrain.roads.filter(road => {
    const first = road.pts[0], last = road.pts[road.pts.length - 1];
    return Math.min(Math.hypot(first[0] * WORLD_SCALE - hub.x, first[1] * WORLD_SCALE - hub.y), Math.hypot(last[0] * WORLD_SCALE - hub.x, last[1] * WORLD_SCALE - hub.y)) < hub.r;
  });
  assert(routes.length > 0 && routes.length === sourceRoutes.length, `${id} 连接道路不完整`);
  let sampleCount = 0;
  const checkWalk = (ax: number, ay: number, bx: number, by: number) => {
    assert(terrain.canTraverse(ax, ay, bx, by), `${id} 道路高差不可通行`);
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 30));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
      assert(terrain.isLand(px, py) && terrain.walkFactor(px, py) > 0, `${id} 道路在 (${px}, ${py}) 不可步行`);
      sampleCount++;
    }
  };
  for (const path of routes) {
    const firstX = segments[path.start], firstY = segments[path.start + 1];
    const lastX = segments[path.end - 6], lastY = segments[path.end - 5];
    const firstNear = Math.hypot(firstX - hub.x, firstY - hub.y) < Math.hypot(lastX - hub.x, lastY - hub.y);
    const innerX = firstNear ? firstX : lastX, innerY = firstNear ? firstY : lastY;
    const outerX = firstNear ? lastX : firstX, outerY = firstNear ? lastY : firstY;
    // 外端接到别的地点；那处若也是占山的大宗门，路停在它山脚的山门牌坊（routeAroundGrandSect 的 gateOut）
    const reaches = (l: typeof LOCATIONS[number]) => {
      const p = grandSectPlan(l);
      if (p && Math.hypot(l.x * WORLD_SCALE + p.gateOut.x - outerX, l.y * WORLD_SCALE + p.gateOut.y - outerY) < 1) return true;
      return Math.hypot(l.x * WORLD_SCALE - outerX, l.y * WORLD_SCALE - outerY) < WORLD_SCALE * 1.3;
    };
    assert(LOCATIONS.some(l => l.id !== id && reaches(l)), `${id} 道路没有接到外部地点`);
    if (plan) assert(Math.hypot(innerX - x - plan.gateOut.x, innerY - y - plan.gateOut.y) < 1, `${id} 道路应接到山脚的山门牌坊`);
    else checkWalk(x, y, innerX, innerY);
    for (let i = path.start; i < path.end; i += 8) checkWalk(segments[i], segments[i + 1], segments[i + 2], segments[i + 3]);
  }
  console.log(`${id}: ${routes.length} actual routes, ${sampleCount} land/walk samples, plateau ${plateau.toFixed(2)}`);
}

interface IndexedSegment { offset: number; path: number }
const cellSize = 1200;
const cells = new Map<string, IndexedSegment[]>();
const checkedPairs = new Set<string>();
let crossings = 0, maxJunctionGrade = 0, pathIndex = 0;
for (let i = 0; i < segments.length; i += 8) {
  if (i === paths[pathIndex].end) pathIndex++;
  const x1 = segments[i], y1 = segments[i + 1], x2 = segments[i + 2], y2 = segments[i + 3];
  for (let gx = Math.floor(Math.min(x1, x2) / cellSize); gx <= Math.floor(Math.max(x1, x2) / cellSize); gx++) {
    for (let gy = Math.floor(Math.min(y1, y2) / cellSize); gy <= Math.floor(Math.max(y1, y2) / cellSize); gy++) {
      const key = `${gx},${gy}`;
      let cell = cells.get(key);
      if (!cell) cells.set(key, cell = []);
      for (const other of cell) {
        if (other.path === pathIndex) continue;
        const j = other.offset, pair = `${i},${j}`;
        if (checkedPairs.has(pair)) continue;
        checkedPairs.add(pair);
        const dx = x2 - x1, dy = y2 - y1, ex = segments[j + 2] - segments[j], ey = segments[j + 3] - segments[j + 1];
        const denominator = dx * ey - dy * ex;
        if (Math.abs(denominator) < 1e-8) continue;
        const ox = segments[j] - x1, oy = segments[j + 1] - y1;
        const t = (ox * ey - oy * ex) / denominator, u = (ox * dy - oy * dx) / denominator;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        crossings++;
        const x = x1 + t * dx, y = y1 + t * dy, height = terrain.surfaceHeight(x, y);
        for (const [vx, vy] of [[dx, dy], [ex, ey]]) {
          const length = Math.hypot(vx, vy);
          for (const sign of [-1, 1]) for (const distance of [1, 5, 20, 40]) {
            const px = x + sign * vx / length * distance, py = y + sign * vy / length * distance;
            maxJunctionGrade = Math.max(maxJunctionGrade, Math.abs(terrain.surfaceHeight(px, py) - height) / distance);
            assert(terrain.canTraverse(x, y, px, py), `交叉口 (${x}, ${y}) 出现接缝`);
          }
        }
      }
      cell.push({ offset: i, path: pathIndex });
    }
  }
}
if (segments.length) assert(crossings > 0, '地图中未找到道路交叉口');
// 交叉口：平地模式 0.4；高山模式不陡过两倍山道坡度（1.0）。修路之前高山模式这里是 1.8
assert(maxJunctionGrade <= (MOUNTAINS ? 1.0 : 0.4), `交叉口最大坡度 ${maxJunctionGrade} 超限`);
console.log(`${ACTIVE_MAP}: ${segments.length / 8} segments, max grade ${maxRoadGrade.toFixed(3)}; ${crossings} crossings, max junction grade ${maxJunctionGrade.toFixed(3)}`);

const again = new Terrain();
again.build();
assert.deepEqual(again.roadSegW, terrain.roadSegW, '道路构建应确定');
for (const loc of LOCATIONS.filter(l => l.type === 'sect').slice(0, 2)) {
  const x = loc.x * WORLD_SCALE, y = loc.y * WORLD_SCALE;
  for (const [dx, dy] of [[0, 0], [700, 0], [1600, 300], [3200, 500]]) {
    assert.equal(again.surfaceHeight(x + dx, y + dy), terrain.surfaceHeight(x + dx, y + dy), '地形构建应确定');
  }
}
assert.equal(again.surfaceHeight(30000, 30000), terrain.surfaceHeight(30000, 30000), '地形构建应确定');
console.log('surface map tests passed');
