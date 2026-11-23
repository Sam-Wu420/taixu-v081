// P10 占山的宗门的无界面检查——三张图上每一座走新布局的宗门（大宗门占山、一般宗门 / 小门派小号）：
//   1. 每层台地是平的，高度 = 基准面 + 规划的抬高；平地上堆的小山不挖到原地面以下；
//   2. 从山脚的引道起头处沿石阶走得到每层台地（崖上观景台、湖、湖心亭只能御剑，不算）；台沿的陡坎挡步行；石阶逐段可走；
//      石阶上没有被建筑的碰撞块封死；
//   3. 殿阁等建筑都落在台面上：占地四角的地面与脚下一样高（不悬空、不埋进山）；
//   4. 宗门里的人：落脚点都在台面上、不在建筑里；步行网连得通；
//   5. 大宗门地界里没有别的地点、外面的路不穿山；陆上的宗门引道口接着山道；
//   6. 青霞谷：地面底图主线程与 Worker 画出来一样；新开局的出生点站得住、不在建筑里；铁索桥走得过去、贴地从桥下过不会被抬到桥面上。
//   npx tsx tools/test-grand-sect.ts
import './env';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

(globalThis as { __TAIXU_MOUNTAINS?: boolean }).__TAIXU_MOUNTAINS = true;
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };

const { Terrain, CHUNK } = await import('../src/world/terrain');
const { TerrainBaker } = await import('../src/world/terrain-baker');
const W = await import('../src/data/world');
const { getLayout, LOC_SCALE } = await import('../src/gfx/building');
const { grandSectPlan, onPlanStair, planReach, rectDist, isMajorSect, terraceOutline, planRise, planHit, knollCut } = await import('../src/data/sectPlan');
type LocDef = (typeof W.LOCATIONS)[number];

const lines: string[] = [];
let sects = 0;
for (const map of ['tiannan', 'luanxing', 'dajin'] as const) {
  W.setActiveMap(map);
  const t0 = performance.now();
  const terrain = new Terrain(); terrain.build();
  const buildMs = performance.now() - t0;
  for (const loc of W.LOCATIONS) {
    if (!grandSectPlan(loc)) continue;
    sects++;
    lines.push(checkSect(terrain, loc, map, buildMs));
  }
}
console.log(lines.join('\n'));
console.log(`PASS 占山的宗门：三张图共 ${sects} 座走新布局，各项检查通过`);

function checkSect(terrain: InstanceType<typeof Terrain>, loc: LocDef, map: string, buildMs: number): string {
  const S = terrain.surface, name = `${loc.name}（${map}）`;
  const ox = loc.x * W.WORLD_SCALE, oy = loc.y * W.WORLD_SCALE;
  const M = S.massifAt(ox + grandSectPlan(loc)!.spawn.x, oy + grandSectPlan(loc)!.spawn.y)!;
  assert.ok(M, `${name} 应整出山体`);
  const P = M.plan, base = M.base, major = isMajorSect(P);
  const H = (x: number, y: number) => S.heightAt(ox + x, oy + y);
  const T = (id: string) => P.terraces.find((t) => t.id === id)!;
  const L = getLayout(loc);
  assert.ok(L.final, `${name} 应是新布局`);
  const inBlock = (x: number, y: number, pad = 0) => L.blocks.some((b) => x / LOC_SCALE > b.x - pad && x / LOC_SCALE < b.x + b.w + pad && y / LOC_SCALE > b.y - pad && y / LOC_SCALE < b.y + b.h + pad);

  // 1. 台地平
  let worst = 0, worstAt = '';
  for (const t of P.terraces) {
    if (t.role === 'lake') continue;
    const ix = Math.max(60, t.w / 2 - 90), iy = Math.max(60, t.h / 2 - 90);
    for (let y = t.y - iy; y <= t.y + iy; y += Math.max(40, iy / 6)) for (let x = t.x - ix; x <= t.x + ix; x += Math.max(40, ix / 8)) {
      if (rectDist(t, x, y) > -90 || [[0, 0], [90, 0], [-90, 0], [0, 90], [0, -90]].some(([dx, dy]) => onPlanStair(P, x + dx, y + dy, 90))) continue;
      if (P.terraces.some((o) => o !== t && o.rise > t.rise && rectDist(o, x, y) < 90)) continue;   // 湖心长堤、湖心亭压在湖上
      const e = Math.abs(H(x, y) - (base + t.rise)); if (e > worst) { worst = e; worstAt = `${t.id}(${Math.round(x)},${Math.round(y)})`; }
    }
  }
  assert.ok(worst < 1, `${name} 台地应当是平的：最大偏差 ${worst.toFixed(2)} 在 ${worstAt}`);
  if (!P.mountain) {   // 平地上堆的小山：地界里的山坡不低于原地面减一点（山门外的原地面本来就有起伏）
    let pit = 0;
    // 地界里的山坡（不在台面、石阶上）：不比原地面低（原地面本身往外低下去的不算坑）
    const natural = (x: number, y: number) => (S as unknown as { shaped(x: number, y: number): number }).shaped(ox + x, oy + y);
    for (let a = 0; a < 48; a++) for (const f of [0.5, 0.7, 0.85]) {
      const x = P.cx + Math.cos(a / 48 * 6.283) * P.rx * f, y = P.cy + Math.sin(a / 48 * 6.283) * P.ry * f;
      if (P.terraces.some((t) => rectDist(t, x, y) < 100) || onPlanStair(P, x, y, 100)) continue;
      planRise(P, x, y);   // 取 planHit：比台面高得多的原地形按削坡切（knollCut），切到这一层不算坑
      pit = Math.max(pit, Math.min(natural(x, y), base + knollCut(planHit.nearRise, planHit.near)) - 60 - S.terrainHeightAt(ox + x, oy + y));   // 削坡按 64 一格的网格插值，比解析式低一点
    }
    assert.ok(pit < 1, `${name} 堆起的山不应挖到原地面以下：${pit.toFixed(0)}`);
  }

  // 2. 步行可达：在地界（含山脚引道）里按 60 一格连通，建筑的碰撞块也挡路
  const cell = 60, R = planReach(P, 400), x0 = P.cx - R.rx, y0 = P.cy - R.ry, nx = Math.ceil(2 * R.rx / cell), ny = Math.ceil((Math.max(P.cy + R.ry, P.gateOut.y + 400) - y0) / cell);
  const id = (i: number, j: number) => j * nx + i;
  const at = (i: number, j: number) => [ox + x0 + (i + 0.5) * cell, oy + y0 + (j + 0.5) * cell] as const;
  const ok = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const [x, y] = at(i, j); ok[id(i, j)] = terrain.walkFactor(x, y) > 0 && S.sample(x, y).walkable && !inBlock(x - ox, y - oy) ? 1 : 0; }
  const seen = new Uint8Array(nx * ny);
  const cellOf = (x: number, y: number) => id(Math.floor((x - x0) / cell), Math.floor((y - y0) / cell));
  const start = cellOf(P.gateOut.x, P.gateOut.y - 30);
  assert.ok(ok[start], `${name} 山脚的引道口应当站得住`);
  const queue = [start]; seen[start] = 1;
  while (queue.length) {
    const c = queue.pop()!, i = c % nx, j = (c - i) / nx, [ax, ay] = at(i, j);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
      const n = id(a, b); if (seen[n] || !ok[n]) continue;
      const [bx, by] = at(a, b);
      if (!S.canTraverse(ax, ay, bx, by)) continue;
      seen[n] = 1; queue.push(n);
    }
  }
  const reach = (what: string, x: number, y: number) => {
    // 台面上找一格不在建筑里的
    for (let r = 0; r < 600; r += 60) for (let a = 0; a < 8; a++) { const qx = x + Math.cos(a * 0.785) * r, qy = y + Math.sin(a * 0.785) * r; const c = cellOf(qx, qy); if (seen[c]) return; }
    assert.fail(`${name} 应能从山脚走到${what}（${Math.round(x)}, ${Math.round(y)}）`);
  };
  for (const t of P.terraces) if (t.role !== 'perch' && t.role !== 'lake') reach(t.name, t.x, t.y + (t.causeway ? 0 : t.h * 0.3));
  for (const s of P.isles) reach('悬空峰 ' + s.id, s.x, s.y);
  let walkCells = 0; for (let k = 0; k < seen.length; k++) if (seen[k]) walkCells++;
  for (const s of P.stairs) {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1), n = Math.ceil(len / 40);
    for (let k = 0; k < n; k++) {
      const a = k / n, b = (k + 1) / n, xa = s.x1 + (s.x2 - s.x1) * a, ya = s.y1 + (s.y2 - s.y1) * a;
      assert.ok(S.canTraverse(ox + xa, oy + ya, ox + s.x1 + (s.x2 - s.x1) * b, oy + s.y1 + (s.y2 - s.y1) * b), `${name} 石阶应能走：(${s.x1}, ${s.y1}) → (${s.x2}, ${s.y2})`);
      assert.ok(!inBlock(xa, ya), `${name} 石阶不应被建筑封住：(${Math.round(xa)}, ${Math.round(ya)})`);
    }
  }
  // 陡坎：主台（或第一层台）外沿直接往外走不下去
  const edgeT = P.terraces.find((t) => t.role === 'main') ?? P.terraces[0];
  if (major && P.mountain) { const ex = edgeT.x + edgeT.w / 2, ey = edgeT.y - edgeT.h * 0.2; if (!onPlanStair(P, ex + 100, ey, 100) && !P.terraces.some((o) => o !== edgeT && rectDist(o, ex + 120, ey) < 0)) assert.ok(!S.canTraverse(ox + ex - 60, oy + ey, ox + ex + 200, oy + ey), `${name} 台沿应是陡坎`); }
  // 平地堆的小山：外圈是能长树的缓坡（不是一圈断崖），台沿只在局部是墙（前沿的挡墙、半悬楼阁下的崖）
  let knoll = '';
  if (!P.mountain) {
    let gentle = 0, ring = 0, wall = 0, rim = 0;
    for (let a = 0; a < 72; a++) for (const f of [0.6, 0.72, 0.84, 0.94]) {
      const x = P.cx + Math.cos(a / 72 * 6.283) * P.rx * f, y = P.cy + Math.sin(a / 72 * 6.283) * P.ry * f;
      if (P.terraces.some((t) => rectDist(t, x, y) < 150) || onPlanStair(P, x, y, 150) || !terrain.isLand(ox + x, oy + y)) continue;
      // 原地形本来就比堆的山高的地方（岛上的山、坡地）按原地形，不算
      if ((S as unknown as { shaped(x: number, y: number): number }).shaped(ox + x, oy + y) > S.terrainHeightAt(ox + x, oy + y) - 5) continue;
      ring++; if (S.sample(ox + x, oy + y).slope < 0.6) gentle++;
    }
    for (const t of P.terraces) {
      if (t.role === 'lake' || t.causeway || t.role === 'perch') continue;
      for (const [x, y, nx, ny] of terraceOutline(t, 150)) {
        if (onPlanStair(P, x + nx * 80, y + ny * 80, 60) || P.terraces.some((o) => o !== t && rectDist(o, x + nx * 90, y + ny * 90) < 0)) continue;
        rim++; if (H(x - nx * 40, y - ny * 40) - H(x + nx * 90, y + ny * 90) > 40) wall++;   // 往下的墙 / 崖（后沿切进原来山坡的护坡不算）
      }
    }
    assert.ok(gentle / ring > 0.8, `${name} 堆起的小山外圈应是缓坡：缓坡只占 ${(gentle / ring * 100).toFixed(0)}%`);
    assert.ok(wall / rim < 0.6, `${name} 台沿往下的墙应只在局部：${(wall / rim * 100).toFixed(0)}% 的台沿是墙`);
    knoll = `，外圈缓坡 ${(gentle / ring * 100).toFixed(0)}%、台沿是墙 ${(wall / rim * 100).toFixed(0)}%`;
  }

  // 3. 建筑落在台面上
  let checked = 0, bad: string[] = [];
  for (const pc of L.pieces) {
    if (!['sHall', 'sPagoda', 'sPavilion', 'sYard', 'sCenser', 'sLamp', 'sStele', 'sCave', 'sForbid', 'sField', 'sPool', 'sSlab', 'sWell'].includes(pc.kind) || pc.p.on || pc.p.round) continue;
    const k = pc.p.s ?? 1, size: Record<string, number> = { sLamp: 36 * k, sStele: 80 * k, sCenser: 120 * k, sForbid: (pc.p.r ?? 260) * 2.2, sWell: 60 };
    const x = pc.x * LOC_SCALE, y = pc.y * LOC_SCALE;
    const w = (size[pc.kind] ?? (pc.kind === 'sPavilion' ? pc.p.w * 1.25 : pc.p.w ?? 120)) / 2, d = size[pc.kind] ?? (pc.kind === 'sPavilion' ? pc.p.w * 1.25 : pc.p.d ?? pc.p.w ?? 120);
    const h0 = H(x, y);
    const back = pc.kind === 'sHall' ? -d : pc.kind === 'sCave' ? -0.75 * (pc.p.w ?? 260) : pc.kind === 'sPagoda' ? -pc.p.w * 1.15 : pc.kind === 'sPavilion' ? -pc.p.w * 1.125 : -d / 2;
    const front = pc.kind === 'sHall' || pc.kind === 'sCave' ? 0 : pc.kind === 'sPagoda' ? pc.p.w * 0.15 : pc.kind === 'sPavilion' ? pc.p.w * 0.125 : d / 2;
    for (const [cx, cy] of [[x - w, y + back], [x + w, y + back], [x - w, y + front], [x + w, y + front]]) {
      checked++;
      if (Math.abs(H(cx, cy) - h0) > 2 && bad.length < 6) bad.push(`${pc.kind}(${Math.round(x)},${Math.round(y)}) 角(${Math.round(cx)},${Math.round(cy)}) 差 ${Math.round(H(cx, cy) - h0)}`);
    }
  }
  assert.equal(bad.length, 0, `${name} 建筑占地应在同一层台面上：${bad.join('；')}`);

  // 3b. 正殿、祖师殿都在（琉璃顶的殿或圆顶大殿）：摆不下就不摆的殿阁里，这两座不能被挤掉
  for (const role of ['main', 'top'] as const) {
    const t = P.terraces.find((q) => q.role === role); if (!t) continue;
    const has = L.pieces.some((pc) => (pc.kind === 'sDome' || (pc.kind === 'sHall' && pc.p.glaze)) && rectDist(t, pc.x * LOC_SCALE, pc.y * LOC_SCALE) < 0);
    assert.ok(has, `${name} 「${t.name}」台上应有${role === 'main' ? '正殿' : '祖师殿'}`);
  }
  // 4. 宗门里的人：落脚点在台面上、不在建筑里；步行网连通
  assert.ok((L.spots?.length ?? 0) > 3, `${name} 应有落脚点`);
  for (const s of L.spots!) { const x = s.x * LOC_SCALE, y = s.y * LOC_SCALE; assert.ok(P.terraces.some((t) => rectDist(t, x, y) < 0) && !inBlock(x, y), `${name} 落脚点应在台面上、不在建筑里`); }
  { const adj = L.nav!.adj, seenN = new Uint8Array(adj.length), q = [0]; seenN[0] = 1; while (q.length) for (const nb of adj[q.pop()!]) if (!seenN[nb]) { seenN[nb] = 1; q.push(nb); } assert.ok(seenN.every((v) => v), `${name} 步行网应连通`); }

  // 5. 地界里没有别的地点、路不穿山；引道口接山道
  if (major) {
    const inside = W.LOCATIONS.filter((l) => l !== loc && Math.hypot((l.x * W.WORLD_SCALE - ox - P.cx) / P.rx, (l.y * W.WORLD_SCALE - oy - P.cy) / P.ry) < 1).map((l) => l.name);
    assert.equal(inside.length, 0, `${name} 地界里不应有别的地点：${inside.join('、')}`);
  }
  let roadIn = 0, roadNear = Infinity;
  for (let i = 0; i < terrain.roadSegW.length; i += 8) {
    const x = terrain.roadSegW[i] - ox, y = terrain.roadSegW[i + 1] - oy;
    if (Math.hypot((x - P.cx) / P.rx, (y - P.cy) / P.ry) < 0.9) roadIn++;
    roadNear = Math.min(roadNear, Math.hypot(x - P.gateOut.x, y - P.gateOut.y));
  }
  assert.equal(roadIn, 0, `${name} 道路不应穿进山体：${roadIn} 段`);
  // 有路通到这座宗门的，路要接在引道口上（原本就没有路连着的地点——比如图边的栖云宗——不查）
  const roadEnds = terrain.roads.filter((r) => [r.pts[0], r.pts[r.pts.length - 1]].some((q) => Math.hypot(q[0] * W.WORLD_SCALE - ox - P.gateOut.x, q[1] * W.WORLD_SCALE - oy - P.gateOut.y) < 50)).length;
  if (loc.type === 'sect' && roadEnds) assert.ok(roadNear < 600, `${name} 引道口应接着山道：最近的路 ${Math.round(roadNear)}`);

  let extra = '';
  if (loc.id === 'huangfeng') extra = huangfengExtra(terrain, loc, P, L, ox, oy, T);
  const kinds = new Map<string, number>(); for (const pc of L.pieces) kinds.set(pc.kind, (kinds.get(pc.kind) ?? 0) + 1);
  return `  ${name}：${P.look.variant}${P.look.feature ? '·' + P.look.feature : ''}，${P.mountain ? '山里' : '平地堆山'}，基准面 ${Math.round(base)}，${P.terraces.length} 层台地（最高 +${Math.max(...P.terraces.map((t) => t.rise))}），`
    + `地界 ${Math.round(P.rx * 2)}×${Math.round(P.ry * 2)}，台面偏差 ${worst.toFixed(2)}，可走 ${walkCells} 格，${P.stairs.length} 道石阶，建筑落地 ${checked} 角，构件 ${L.pieces.length} 件（院落 ${kinds.get('sYard') ?? 0}），落脚点 ${L.spots!.length}，接路 ${roadEnds} 条${knoll}${extra}；建地形 ${Math.round(buildMs)} ms`;
}

function huangfengExtra(terrain: InstanceType<typeof Terrain>, loc: LocDef, P: ReturnType<typeof grandSectPlan> & object, L: ReturnType<typeof getLayout>, ox: number, oy: number, T: (id: string) => { x: number; y: number }): string {
  const S = terrain.surface;
  // 底图：主线程与 Worker（按烘焙数据重建、结构化克隆一遍）画出来一样
  const baker = new TerrainBaker(structuredClone(terrain.bakeData()) as never);
  let chunks = 0;
  for (const [tx, ty] of [[0, 0], [P.spawn.x, P.spawn.y], [T('main').x, T('main').y], [T('west').x, T('west').y]]) {
    const cx = Math.floor((ox + tx) / CHUNK), cy = Math.floor((oy + ty) / CHUNK);
    const hash = (c: { getContext(t: '2d'): CanvasRenderingContext2D; width: number; height: number }) => createHash('sha1').update(Buffer.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data)).digest('hex');
    assert.equal(hash(terrain.buildChunk(cx, cy).canvas as never), hash(baker.bake(cx, cy, terrain.season) as never), `底图主线程与 Worker 应一致：块 ${cx},${cy}`);
    chunks++;
  }
  // 出生点站得住、不在建筑里
  const sx = ox + P.spawn.x, sy = oy + P.spawn.y;
  assert.ok(terrain.walkFactor(sx, sy) > 0 && S.sample(sx, sy).walkable, '出生点应站得住');
  for (const b of L.blocks) assert.ok(!(P.spawn.x / LOC_SCALE > b.x && P.spawn.x / LOC_SCALE < b.x + b.w && P.spawn.y / LOC_SCALE > b.y && P.spawn.y / LOC_SCALE < b.y + b.h), '出生点不应在建筑里');
  // 铁索桥：桥中段悬在山谷上方；人在桥面高度附近才算在桥上（贴地从桥下过、高高飞过都按地面算）
  for (const b of P.bridges) if (b.kind === 'chain') {
    const mx = ox + (b.x1 + b.x2) / 2, my = oy + (b.y1 + b.y2) / 2;
    S.deckRef = NaN; const deck = S.heightAt(mx, my), ground = S.terrainHeightAt(mx, my);
    assert.ok(deck - ground > 300, '铁索桥中段应悬在山谷上方');
    S.deckRef = ground + 40; assert.equal(S.heightAt(mx, my), ground, '贴地从桥下过时脚下应是地面');
    S.deckRef = deck + 1000; assert.equal(S.heightAt(mx, my), ground, '高高飞过桥上空时脚下应是地面');
    S.deckRef = deck; assert.equal(S.heightAt(mx, my), deck, '走在桥上时脚下应是桥面');
    S.deckRef = NaN;
  }
  return `；底图一致 ${chunks} 块；桥下能过`;
}
