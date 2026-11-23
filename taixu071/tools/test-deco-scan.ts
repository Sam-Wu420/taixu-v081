import './env';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { takeDecoChunks, DecoListCache } from '../src/world/decoScan';
import { Terrain, CHUNK } from '../src/world/terrain';
import { LOC_BY_ID, WORLD_SCALE } from '../src/data/world';
const scan={x0:-1,x1:6,y0:0,y1:5,cursor:0},seen:string[]=[];let steps=0;
while(true){const b=takeDecoChunks(scan,4,(x,y)=>x>=0&&(x+y)%3!==0);assert.ok(b.chunks.length<=4);seen.push(...b.chunks.map(([x,y])=>`${x},${y}`));steps++;if(!b.pending)break;assert.ok(steps<50)}
const expected:string[]=[];for(let y=0;y<=5;y++)for(let x=-1;x<=6;x++)if(x>=0&&(x+y)%3!==0)expected.push(`${x},${y}`);
assert.deepEqual([...seen].sort(),expected.sort());assert.equal(new Set(seen).size,seen.length);assert.equal(scan.cursor,48);
const sparse={x0:0,x1:1000,y0:0,y1:1,cursor:0};const s=takeDecoChunks(sparse,3,()=>false);assert.equal(s.chunks.length,0);assert.equal(s.pending,true);assert.equal(sparse.cursor,48);
let turns=1;while(takeDecoChunks(sparse,3,()=>false).pending)turns++;assert.ok(turns>1);assert.equal(sparse.cursor,2002);
const reset={x0:0,x1:6,y0:0,y1:0,cursor:0};assert.deepEqual(takeDecoChunks(reset,3,()=>true).chunks,[[3,0],[4,0],[2,0]]);assert.equal(takeDecoChunks(reset,0,()=>true).pending,false);
console.log('decoration scan: bounded incremental traversal, culling, no duplicates, sparse budget and reset passed');

for (const w of [1,2,3,4,5,10]) for (const h of [1,2,3,4]) {
 const scan={x0:0,x1:w-1,y0:0,y1:h-1,cursor:0}, out=takeDecoChunks(scan,w*h,()=>true).chunks;
 assert.equal(out.length,w*h);assert.equal(new Set(out.map(([x,y])=>`${x},${y}`)).size,w*h);assert.ok(out.every(([x,y])=>x>=0&&x<w&&y>=0&&y<h));
}
console.log('center-first traversal covers even/odd grids without duplicates');

// 回归：模拟中间缩放移动时多帧分批扫描 + 视野键频繁变化，不能把林色底累积进缓存，也不能把已显示列表塌缩成第一批。
{
  type Item = { k: string; id?: string };
  const cache = new DecoListCache<Item, string, string>();
  const runBatch = (key: string, x0: number, x1: number, y0: number, y1: number, budget: number) => {
    const frameList: Item[] = [{ k: 'D·林色底' }];
    const scan = cache.begin(key, x0, x1, y0, y1);
    const batch = takeDecoChunks(scan, budget, () => true);
    for (const [cx, cy] of batch.chunks) cache.build.list.push({ k: 'D·树', id: `${key}:${cx},${cy}` });
    cache.build.counts[0] += batch.chunks.length;
    cache.finish(key, batch.pending);
    const shown = cache.display();
    for (const d of shown.list) frameList.push(d);
    return { frameList, pending: batch.pending, counts: shown.counts };
  };

  // 1) 首次扫描（43x27=1161 块，每帧预算 210 块，共 6 帧）：第 1 帧就渐进输出第一批，不空屏
  let r = runBatch('K1', 0, 42, 0, 26, 210);
  assert.equal(r.pending, true);
  assert.equal(r.frameList.filter((d) => d.k === 'D·林色底').length, 1);
  assert.equal(r.frameList.filter((d) => d.k === 'D·树').length, 210);
  while (r.pending) r = runBatch('K1', 0, 42, 0, 26, 210);
  assert.equal(cache.key, 'K1');
  assert.equal(r.counts[0], 1161);
  assert.equal(r.frameList.filter((d) => d.k === 'D·林色底').length, 1);
  assert.equal(cache.shown.list.filter((d) => d.k === 'D·林色底').length, 0);

  // 2) 移动导致视野键连续变化（K2 -> K3），在未扫完期间始终保留完整 K1，不能塌缩为 210 块，也不叠林色底
  for (const k of ['K2', 'K2', 'K3']) {
    r = runBatch(k, 1, 43, 0, 26, 210);
    assert.equal(r.pending, true);
    assert.equal(cache.key, 'K1');
    assert.equal(r.frameList.filter((d) => d.k === 'D·林色底').length, 1);
    assert.equal(r.frameList.filter((d) => d.k === 'D·树').length, 1161);
    assert.ok(r.frameList.some((d) => d.id?.startsWith('K1:')));
  }

  // 3) 视野退回已提交的 K1 时可取消半途扫描且完整列表不变
  cache.cancelScan();
  assert.equal(cache.key, 'K1');
  assert.equal(cache.display().list.length, 1161);

  // 4) 新视野 K4 完整扫完后整体替换，且 build/shown 引用隔离
  const prevShown = cache.shown;
  do { r = runBatch('K4', 2, 44, 0, 26, 210); } while (r.pending);
  assert.equal(cache.key, 'K4');
  assert.notStrictEqual(cache.shown, prevShown);
  assert.notStrictEqual(cache.build, cache.shown);
  assert.equal(r.frameList.filter((d) => d.k === 'D·林色底').length, 1);
  assert.equal(r.frameList.filter((d) => d.k === 'D·树').length, 1161);
  assert.ok(r.frameList.filter((d) => d.k === 'D·树').every((d) => d.id?.startsWith('K4:')));

  // 5) 已提交空列表后（荒芜区），新扫描未完成前仍显示已提交列表，不回退到半成品
  cache.reset();
  cache.begin('EMPTY', 0, 0, 0, 0);
  cache.finish('EMPTY', false);
  cache.begin('NEXT', 0, 1, 0, 0);
  cache.build.list.push({ k: 'D·树', id: 'partial' });
  assert.equal(cache.display().list.length, 0);
}

// 防回归：确认 render.ts 中林色底不会进入 dlCache.build，且仅在扫描完成后才替换显示列表
{
  const renderSrc = readFileSync(new URL('../src/world/render.ts', import.meta.url), 'utf8');
  assert.ok(!/build\.list\.push\([^)]*林色底/.test(renderSrc), 'canopy base must never be pushed into dlCache.build.list');
  const finishIdx = renderSrc.indexOf('this.dlCache.finish(');
  const displayIdx = renderSrc.indexOf('this.dlCache.display(');
  assert.ok(finishIdx > 0 && displayIdx > finishIdx, 'render.ts must finish scan before reading dlCache.display()');
  // 极远摘要必须用 getMountains 按当前视口扫描，不能退回只补 r<=4 且把山峰限制在 4096 块
  assert.ok(/T\.getMountains\(\s*cx\s*,\s*cy\s*\)/.test(renderSrc), 'farSummary must scan mountains across viewport with T.getMountains');
  assert.ok(renderSrc.includes('FAR_MTN_CHUNKS_MAX = 16384'), 'farMountainChunks capacity must exceed a single 0.022 viewport');
}
console.log('decoration list cache: atomic swap, no canopy stacking, no collapse during camera move passed');

// 回归：Terrain.getMountains 与 getDecos 山峰结果完全一致；在 zoom=0.022 视口内超出 r<=4（神识外圈及更远处）的山峰可完整扫齐
{
  const T = new Terrain();
  T.build();
  // 在人界林山并茂处（苍岳山脉 / 青玄门一带）找一个有充足树条带与山峰的区块作为基准视口中心
  const qx = LOC_BY_ID.get('taiyue')!;
  let px = qx.x * WORLD_SCALE, py = qx.y * WORLD_SCALE;
  let fcx = Math.floor(px / CHUNK), fcy = Math.floor(py / CHUNK);
  outer: for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
    const cx = fcx + dx, cy = fcy + dy;
    if (cx < 60 || cy < 40) continue;
    const tr = T.getTrees(cx, cy);
    if (tr.length >= 24) { fcx = cx; fcy = cy; px = (cx + 0.5) * CHUNK; py = (cy + 0.5) * CHUNK; break outer; }
  }
  // 对比未命中 decoCache 与已命中 decoCache 两种路径，确保山峰生成 100% 一致
  for (let dy = -6; dy <= 6; dy += 2) for (let dx = -6; dx <= 6; dx += 2) {
    const cx = fcx + dx, cy = fcy + dy;
    const direct = T.getMountains(cx, cy);
    const full = T.getDecos(cx, cy).filter((d) => d.kind === 'mtn');
    assert.deepEqual(direct, full, `getMountains(${cx},${cy}) must match getDecos mountain entries`);
    assert.deepEqual(T.getMountains(cx, cy), full, `cached getMountains(${cx},${cy}) must match getDecos`);
  }
  // 模拟 zoom=0.022（2470x1428 屏幕约 112000x65000 世界范围）：中心 r<=4 以外必须能扫出大量山峰
  const farScan = { x0: fcx - 54, x1: fcx + 54, y0: fcy - 32, y1: fcy + 32, cursor: 0 };
  const farMap = new Map<number, ReturnType<typeof T.getMountains>>();
  let frames = 0, outerMtns = 0;
  while (true) {
    const b = takeDecoChunks(farScan, 640, (cx, cy) => cx >= 0 && cy >= 0 && !farMap.has(cx * 4096 + cy));
    for (const [cx, cy] of b.chunks) {
      const mtns = T.getMountains(cx, cy);
      farMap.set(cx * 4096 + cy, mtns);
      if (Math.max(Math.abs(cx - fcx), Math.abs(cy - fcy)) > 4) outerMtns += mtns.length;
    }
    frames++;
    if (!b.pending) break;
    assert.ok(frames < 30, 'zoom=0.022 mountain scan must finish within bounded frames');
  }
  assert.ok(farMap.size > 4096, `0.022 viewport (${farMap.size} chunks) exceeds old 4096 cap`);
  assert.ok(outerMtns > 150, `expected >150 mountains beyond r<=4 in 0.022 viewport, got ${outerMtns}`);
  console.log(`far mountain scan (0.022 viewport): ${farMap.size} chunks, ${outerMtns} outer mountains in ${frames} frames passed`);

  // 回归：中间缩放（0.14 / 0.06）飞行时 decoCache 不得因 260 上限颠簸重算，
  // 且 Renderer.chunkEntryCache + emitChunkEntry 能跨 dkey 平移复用内部块、单帧扫完（dlPending=false）。
  const { Renderer, effectiveTreeCap } = await import('../src/world/render');
  const { LOD: L } = await import('../src/gfx/lod');
  const { createCanvas } = await import('./env');
  const origGetDecos = T.getDecos.bind(T);
  let buildDecosMisses = 0;
  T.getDecos = ((cx: number, cy: number) => {
    const key = cx + ',' + cy;
    if (!T.decoCache.has(key)) buildDecosMisses++;
    return origGetDecos(cx, cy);
  }) as typeof T.getDecos;
  // 模拟 zoom=0.06 一屏约 1161 块后平移 1 列，旧区块必须全部保留在 decoCache 中不重算
  T.decoCache.clear();
  buildDecosMisses = 0;
  for (let cy = fcy - 13; cy <= fcy + 13; cy++) for (let cx = fcx - 21; cx <= fcx + 21; cx++) T.getDecos(cx, cy);
  assert.equal(buildDecosMisses, 27 * 43);
  assert.equal(T.decoCache.size, 27 * 43, 'decoCache must retain >1161 chunks for intermediate zoom');
  buildDecosMisses = 0;
  for (let cy = fcy - 13; cy <= fcy + 13; cy++) for (let cx = fcx - 20; cx <= fcx + 22; cx++) T.getDecos(cx, cy);
  assert.equal(buildDecosMisses, 27, `expected only 27 new edge chunks on 1-column pan, got ${buildDecosMisses}`);

  // 校验 Renderer.chunkEntryCache + emitChunkEntry 内部快路径与边缘裁剪
  const r: any = Object.create(Renderer.prototype);
  const cv = createCanvas(2470, 1428);
  Object.assign(r, {
    ctx: cv.getContext('2d'),
    Z: 0.14, dlT: 1, dlZ: 0.14, lowered: 0, _occA: 1,
    farTreeChunks: new Map(), farMountainChunks: new Map(), farChunkEpoch: 0,
    chunkEntryCache: new Map(), chunkEntryStateKey: '',
    game: { terrain: T, season: 0, cam: { zoom: 0.14 }, weather: { wind: 0 } },
  });
  const dlLeft = (fcx - 4) * CHUNK + 128, dlRight = (fcx + 5) * CHUNK - 128;
  const dlTop = (fcy - 3) * CHUNK + 128, dlBottom = (fcy + 4) * CHUNK - 128;
  const build = { list: [] as any[], reflect: [] as any[], prefetch: [] as any[], counts: [0, 0, 0] as [number, number, number] };
  for (let cy = fcy - 4; cy <= fcy + 4; cy++) for (let cx = fcx - 5; cx <= fcx + 5; cx++) {
    const ck = cx * 4096 + cy;
    const entry = r.buildChunkEntry(T, cx, cy, ck, 0, 224, 0, 1, true);
    r.chunkEntryCache.set(ck, entry);
    r.emitChunkEntry(entry, dlLeft, dlRight, dlTop, dlBottom, 224, 0.14, build);
  }
  assert.ok(r.chunkEntryCache.size === 99 && build.list.length > 0, 'chunkEntryCache builds and emits drawables');
  assert.equal(r.farChunkEpoch, 99, 'buildChunkEntry must bump farChunkEpoch when populating farTree/farMountain chunks');
  // 模拟视口平移一格，验证已缓存块全部命中（misses=0）且输出一致
  const build2 = { list: [] as any[], reflect: [] as any[], prefetch: [] as any[], counts: [0, 0, 0] as [number, number, number] };
  let cacheMisses = 0;
  for (let cy = fcy - 4; cy <= fcy + 4; cy++) for (let cx = fcx - 4; cx <= fcx + 4; cx++) {
    const ck = cx * 4096 + cy;
    const entry = r.chunkEntryCache.get(ck);
    if (!entry) cacheMisses++;
    else r.emitChunkEntry(entry, dlLeft + 256, dlRight + 256, dlTop, dlBottom, 224, 0.14, build2);
  }
  assert.equal(cacheMisses, 0, 'cached interior chunks must be reused across dkey pan');
  assert.ok(build2.list.length > 0, 'reused chunk entries must emit drawables');
  // 同一批缓存条目在缩放变小（cap=2）时可直接动态截断发树，无需清空 chunkEntryCache
  const buildCapped = { list: [] as any[], reflect: [] as any[], prefetch: [] as any[], counts: [0, 0, 0] as [number, number, number] };
  for (let cy = fcy - 4; cy <= fcy + 4; cy++) for (let cx = fcx - 4; cx <= fcx + 4; cx++) {
    const entry = r.chunkEntryCache.get(cx * 4096 + cy);
    r.emitChunkEntry(entry, dlLeft, dlRight, dlTop, dlBottom, 2, 0.06, buildCapped);
  }
  assert.ok(buildCapped.counts[0] < build.counts[0] && buildCapped.counts[0] <= 99 * 2, `emitChunkEntry must honor dynamic perChunkTreeCap=2 (got ${buildCapped.counts[0]} vs ${build.counts[0]})`);

  // 回归：grovesInRect 与按 1000px 步长调 grovesNear 收集到的花林集合完全一致
  const rx0 = fcx * CHUNK - 20000, ry0 = fcy * CHUNK - 12000, rx1 = fcx * CHUNK + 20000, ry1 = fcy * CHUNK + 12000;
  const seenOld = new Set<any>();
  for (let y = ry0; y <= ry1; y += 1000) for (let x = rx0; x <= rx1; x += 1000) {
    for (const gv of T.grovesNear(x, y, 1000)) {
      if (gv.x + gv.r >= rx0 && gv.x - gv.r <= rx1 && gv.y + gv.r >= ry0 && gv.y - gv.r <= ry1) seenOld.add(gv);
    }
  }
  const fastGroves = new Set(T.grovesInRect(rx0, ry0, rx1, ry1));
  assert.equal(fastGroves.size, seenOld.size, 'grovesInRect must match grid grovesNear set size');
  for (const gv of seenOld) assert.ok(fastGroves.has(gv), 'grovesInRect must include every grove found by grovesNear');

  // 回归：TreePatchCache 分级真树片、精确世界包围盒（无偏移）、零砍树、空条带扫描预算保护及 T.getTrees 一致性。
  const { TreePatchCache, stripTreesFromChunk, PATCH_MIN_TREES_L0, PATCH_RES_L0 } = await import('../src/world/treePatch');
  const { makeTree } = await import('../src/gfx/tree');
  const { TREE_K, SP_INDEX, TREE_DET_LEVELS } = await import('../src/world/render');

  // 1) T.getTrees(cx, cy) 与 T.getDecos(cx, cy) 过滤结果一致，且未命中时不挤占 decoCache
  const sampleTrees = T.getTrees(fcx, fcy);
  const decoTrees = T.getDecos(fcx, fcy).filter((d) => d.kind === 'tree');
  assert.equal(sampleTrees.length, decoTrees.length, 'T.getTrees must return exact same count as getDecos filtered trees');
  for (let i = 0; i < sampleTrees.length; i++) {
    assert.equal(sampleTrees[i].x, decoTrees[i].x);
    assert.equal(sampleTrees[i].y, decoTrees[i].y);
    assert.equal(sampleTrees[i].sp, decoTrees[i].sp);
  }

  // 2) L0 条带烘焙：片内包围盒与每棵单树世界坐标一致，且不漏树
  const tp = new TreePatchCache();
  tp.beginFrame(T, 0, T.decoRevision);
  const strips = stripTreesFromChunk(sampleTrees, fcy);
  const richStripIdx = strips.findIndex((s) => s.length >= PATCH_MIN_TREES_L0);
  assert.ok(richStripIdx >= 0, 'test chunk should have at least one populated tree strip');
  const stripTrees = strips[richStripIdx];
  const tplCache = new Map<string, any>();
  const getTpl = (d: any) => {
    const k = `${d.sp}:${d.v}`;
    let spr = tplCache.get(k);
    if (!spr) {
      const seed = (SP_INDEX[d.sp] ?? 0) * 1000 + d.v * 37 + 11;
      spr = makeTree(d.sp, 0, seed, PATCH_RES_L0, TREE_DET_LEVELS[0]);
      tplCache.set(k, spr);
    }
    return spr;
  };
  const budget0 = { t0: performance.now(), budgetMs: 50, bakes: 0, scans: 0, pending: false };
  const l0 = tp.getL0Strip(T.decoRevision, 0, fcx, fcy, richStripIdx, stripTrees, budget0, getTpl);
  assert.ok(l0 && !l0.empty && l0.spr, 'L0 strip patch should bake synchronously within budget');
  assert.equal(l0.treeCount, stripTrees.length, 'L0 strip patch must preserve all trees without culling');
  for (const d of stripTrees) {
    const sp = getTpl(d);
    const sc = d.s * TREE_K;
    const x0 = d.x - (d.flip ? sp.w - sp.ax : sp.ax) * sc;
    const y0 = d.y - sp.ay * sc;
    assert.ok(x0 >= l0.wx - 1e-6 && x0 + sp.w * sc <= l0.wx + l0.ww + 1e-6, 'tree X bounds inside L0 patch world box');
    assert.ok(y0 >= l0.wy - 1e-6 && y0 + sp.h * sc <= l0.wy + l0.wh + 1e-6, 'tree Y bounds inside L0 patch world box');
  }

  // 2b) 像素级回归：未翻转树木（flip=false）烘焙尺寸必须乘 sc，绝不可超出片画布产生矩形直角裁切
  {
    const { createCanvas } = await import('./env');
    const solid = createCanvas(80, 120);
    const sg = solid.getContext('2d')!;
    sg.fillStyle = '#2d5a27';
    sg.fillRect(0, 0, 80, 120);
    const solidSpr: any = { canvas: solid, w: 80, h: 120, ax: 40, ay: 120 };
    const synthTrees: any[] = [
      { kind: 'tree', sp: 'pine', x: 1000, y: 1100, w: 80, h: 120, s: 0.9, v: 0, ph: 0, flip: false },
      { kind: 'tree', sp: 'pine', x: 1200, y: 1120, w: 80, h: 120, s: 0.9, v: 1, ph: 0, flip: true },
      { kind: 'tree', sp: 'pine', x: 1100, y: 1150, w: 80, h: 120, s: 0.75, v: 2, ph: 0, flip: false },
    ];
    const budget2b = { t0: performance.now(), budgetMs: 500, bakes: 0, scans: 0, pending: false };
    const synthPatch = tp.getL0Strip(999, 0, 5, 5, 0, synthTrees, budget2b, () => solidSpr)!;
    assert.ok(synthPatch && !synthPatch.empty && synthPatch.spr, 'synthetic patch must bake');
    const scv = synthPatch.spr.canvas as any;
    const sw = scv.width, sh = scv.height;
    const px = scv.getContext('2d')!.getImageData(0, 0, sw, sh).data;
    // 最外圈 1px 保护边必须全透明：若未乘 sc 导致树图溢出，右下边界将被实色像素填满并直角裁切
    for (let x = 0; x < sw; x++) {
      assert.equal(px[x * 4 + 3], 0, `top edge x=${x} must remain transparent`);
      assert.equal(px[((sh - 1) * sw + x) * 4 + 3], 0, `bottom edge x=${x} must remain transparent (no rect clip)`);
    }
    for (let y = 0; y < sh; y++) {
      assert.equal(px[y * sw * 4 + 3], 0, `left edge y=${y} must remain transparent`);
      assert.equal(px[(y * sw + (sw - 1)) * 4 + 3], 0, `right edge y=${y} must remain transparent (no rect clip)`);
    }
    // 抽检内部：左右两棵同规模树的绘制宽度应当对称一致（约 80 * 0.9 * 0.76 * 0.35 ≈ 19px）
    const expectedWorldW = 80 * 0.9 * TREE_K;
    const leftEndX = 1000 - 40 * 0.9 * TREE_K + expectedWorldW;
    const pxOutside = Math.round((leftEndX + 4 - synthPatch.wx) * (sw / synthPatch.ww));
    const pyMid = Math.round((1100 - 60 * 0.9 * TREE_K - synthPatch.wy) * (sh / synthPatch.wh));
    assert.equal(px[(pyMid * sw + pxOutside) * 4 + 3], 0, 'unflipped tree must not overshoot its scaled width');
  }

  // 3) L1/L2 宏片烘焙与预算耗尽时的子级缓存兜底
  const gx1 = Math.floor(fcx / 2), gy1 = Math.floor(fcy / 2);
  const l1Strip = Math.floor(richStripIdx / 2);
  const budget3 = { t0: performance.now(), budgetMs: 500, bakes: 0, scans: 0, pending: false };
  const l1 = tp.getMacroStrip(T, 1, T.decoRevision, 0, gx1, gy1, l1Strip, budget3, getTpl);
  assert.ok(l1 && !l1.empty && l1.spr, 'L1 macro strip should bake cleanly');
  assert.ok(l1.treeCount >= l0.treeCount, 'L1 macro strip includes covered L0 trees');
  const budgetExhausted = { t0: performance.now() - 100, budgetMs: 1, bakes: 1, scans: 0, pending: false };
  const gx2 = Math.floor(fcx / 4), gy2 = Math.floor(fcy / 4);
  const l2 = tp.getMacroStrip(T, 2, T.decoRevision, 0, gx2, gy2, Math.floor(l1Strip / 2) >= 0 ? (Math.floor((fcy % 4) / 2)) : 0, budgetExhausted, getTpl);
  assert.equal(l2, null, 'L2 macro strip defers when budget is exhausted');
  assert.equal(budgetExhausted.pending, true, 'deferred L2 bake marks budget.pending');
  const fbs: any[] = [];
  tp.collectCachedFallbackPatches(2, T.decoRevision, 0, gx2, gy2, Math.floor((fcy % 4) / 2), fbs);
  assert.ok(fbs.length >= 1, 'deferred L2 falls back to already-cached L1/L0 patches');

  // 4) 空块扫描预算上限保护（budget.scans >= 16 触发 pending）
  const emptyTerrain: any = { decoRevision: 0, getTrees: () => [] };
  const scanBudget = { t0: performance.now() - 10, budgetMs: 5, bakes: 0, scans: 15, pending: false };
  const emp1 = tp.getMacroStrip(emptyTerrain, 2, 0, 0, 99, 99, 0, scanBudget, getTpl);
  assert.ok(emp1 && emp1.empty, '16th empty scan still caches current empty patch');
  const emp2 = tp.getMacroStrip(emptyTerrain, 2, 0, 0, 100, 99, 0, scanBudget, getTpl);
  assert.equal(emp2, null, 'exceeding 16 scans defers remaining empty macro strips');
  assert.equal(scanBudget.pending, true, 'exceeding 16 scans marks pending');

  // 5) 源码级不变量：去掉 FarPyramid 绿滤镜铺底，且 dkey/entryStateKey 随缩放保持不变
  const renderSrc2 = readFileSync(new URL('../src/world/render.ts', import.meta.url), 'utf8');
  assert.ok(/const dkey = chunkKey;/.test(renderSrc2), 'dkey must stay zoom-invariant (no perChunkTreeCap rebuilds)');
  assert.ok(/const entryStateKey = `\$\{ACTIVE_MAP\}\|\$\{season\}\|\$\{T\.decoRevision\}`/.test(renderSrc2), 'entryStateKey must stay zoom-invariant so zoom does not clear chunkEntryCache');
  assert.ok(/treePatches = new TreePatchCache\(\)/.test(renderSrc2), 'Renderer must instantiate TreePatchCache');
  assert.ok(!renderSrc2.includes('pyrBaseAlpha'), 'FarPyramid green ground tint overlay must be removed');
  assert.ok(renderSrc2.includes("dk === 'D·树片'"), 'worldUnder/worldOver batch must include D·树片');
  console.log('tree patch cache, zero-cull macro baking, and zoom-invariant chunk cache passed');
}
