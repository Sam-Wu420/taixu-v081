import './env';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { createCanvas } from '@napi-rs/canvas';
import type { TerrainWorkerReply, TerrainWorkerRequest } from '../src/world/terrain-bake-protocol';
import { releaseTerrainChunkJobs, TerrainChunkJobs, terrainChunkJobs, type TerrainWorkerPort } from '../src/world/terrain-chunk-jobs';
import { planTerrainChunks } from '../src/world/terrain-chunk-plan';

const { Terrain, CHUNK } = await import('../src/world/terrain');
const { ACTIVE_MAP, LOCATIONS, WORLD_SCALE } = await import('../src/data/world');
const terrain = new Terrain(); terrain.build();
const city = LOCATIONS.find(site => site.type === 'city') ?? LOCATIONS[0];
const cx = Math.floor(city.x * WORLD_SCALE / CHUNK), cy = Math.floor(city.y * WORLD_SCALE / CHUNK);
const pointsByKey = new Map<string, { cx: number; cy: number }>();
const add = (x: number, y: number) => { const point = { cx: Math.floor(x / CHUNK), cy: Math.floor(y / CHUNK) }; pointsByKey.set(point.cx + ',' + point.cy, point); };
add(city.x * WORLD_SCALE, city.y * WORLD_SCALE); add((cx + 1) * CHUNK, cy * CHUNK); add((cx - 1) * CHUNK, (cy + 1) * CHUNK); add(CHUNK, CHUNK);
for (const line of [terrain.roads[0], terrain.rivers[0]]) {
  if (line) { const point = line.pts[Math.floor(line.pts.length / 2)]; add(point[0] * WORLD_SCALE, point[1] * WORLD_SCALE); }
}
const points = [...pointsByKey.values()];

type NodeReply = { kind: 'ready' } | { kind: 'done'; cx: number; cy: number; season: number; pixels: Uint8ClampedArray; ms: number };
class NodeTerrainWorker implements TerrainWorkerPort {
  onmessage: ((event: MessageEvent<TerrainWorkerReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  private readonly worker = new Worker(new URL('./terrain-bake-thread-loader.mjs', import.meta.url))   // Node 的 worker 不继承 tsx 的 ESM 加载器，经 .mjs 垫片先注册再进 .ts 入口;
  readonly requests: TerrainWorkerRequest[] = [];
  initPostMs = 0;
  terminated = false;

  constructor() {
    this.worker.on('message', (reply: NodeReply) => {
      if (reply.kind === 'ready') { this.onmessage?.({ data: reply } as MessageEvent<TerrainWorkerReply>); return; }
      const canvas = createCanvas(384, 384), ctx = canvas.getContext('2d'), image = ctx.createImageData(384, 384);
      image.data.set(reply.pixels); ctx.putImageData(image, 0, 0);
      const bitmap = Object.assign(canvas, { close() {} }) as unknown as ImageBitmap;
      const data: TerrainWorkerReply = { kind: 'done', cx: reply.cx, cy: reply.cy, season: reply.season, bitmap, ms: reply.ms };
      this.onmessage?.({ data } as MessageEvent<TerrainWorkerReply>);
    });
    this.worker.on('error', error => { console.error(error); this.onerror?.({ message: error.message } as ErrorEvent); });
  }
  postMessage(request: TerrainWorkerRequest): void {
    this.requests.push(request);
    const start = performance.now(); this.worker.postMessage(request);
    if (request.kind === 'init') this.initPostMs = performance.now() - start;
  }
  terminate(): void { this.terminated = true; void this.worker.terminate(); }
}

function hash(canvas: HTMLCanvasElement): string {
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  return createHash('sha256').update(pixels).digest('hex');
}
async function waitUntil(done: () => boolean): Promise<void> {
  const end = performance.now() + 30000;
  while (!done()) {
    if (performance.now() > end) throw new Error('地形后台任务超时');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

const view = { left: 3000, top: 3000, right: 5000, bottom: 5000 };
const still = planTerrainChunks(view, 4000, 4000, 0, 0, CHUNK, 300000, 300000);
const east = planTerrainChunks(view, 4000, 4000, 1000, 0, CHUNK, 300000, 300000);
const west = planTerrainChunks(view, 4000, 4000, -1000, 0, CHUNK, 300000, 300000);
assert(east.findIndex(item => !item.visible) >= east.filter(item => item.visible).length, '视野内必须优先');
assert(Math.max(...east.map(item => item.cx)) > Math.max(...still.map(item => item.cx)), '向东应提前请求东侧');
assert(Math.min(...west.map(item => item.cx)) < Math.min(...still.map(item => item.cx)), '反向时应提前请求西侧');

const port = new NodeTerrainWorker();
const jobs = new TerrainChunkJobs(terrain, async () => port);
const preview = terrain.previewChunk(points[0].cx, points[0].cy);
assert(preview.preview && terrain.getChunk(points[0].cx, points[0].cy, false) === preview, '缺失的可见块应先出现低成本占位');
let lastCompleted = 0;
for (let season = 0; season < 4; season++) {
  terrain.season = season;
  jobs.request(points);
  await waitUntil(() => jobs.stats.completed === lastCompleted + points.length);
  lastCompleted = jobs.stats.completed;
  for (const point of points) {
    const actual = terrain.getChunk(point.cx, point.cy, false);
    assert(actual && !actual.preview && actual.season === season);
    const expected = terrain.buildChunk(point.cx, point.cy);
    assert.equal(hash(actual.canvas), hash(expected.canvas), `后台和真实同步底图不同：${ACTIVE_MAP} ${season} ${point.cx},${point.cy}`);
  }
}

terrain.season = 0; jobs.request(points);
assert(jobs.stats.inflight, '必须先启动旧季节任务');
terrain.season = 1; jobs.request([points[2], points[1], points[0]]);
await waitUntil(() => jobs.stats.discarded > 0 && jobs.stats.completed === lastCompleted + 3);
const sent = port.requests.filter((request): request is Extract<TerrainWorkerRequest, { kind: 'bake' }> => request.kind === 'bake');
assert.deepEqual(sent.slice(-3).map(({ cx, cy }) => ({ cx, cy })), [points[2], points[1], points[0]], '更新视野后按新优先级烘焙');

terrain.chunks.clear();
for (let i = 0; i < 160; i++) { terrain.frame++; terrain.previewChunk(i, 1); }
assert(terrain.chunks.size <= 130, '底图缓存必须保持现有预算');
terrain.chunks.clear();
const wide = planTerrainChunks({ left: 100000, top: 100000, right: 111720, bottom: 111720 }, 105860, 105860, 0, 0, CHUNK, 300000, 300000);
const visible = wide.filter(item => item.visible);
assert(visible.length > 130 && visible.length <= 176, '应覆盖 1080p 低缩放旋转时超过 130 块的视野');
terrain.setChunkView(wide);
for (const item of wide) { terrain.frame++; terrain.previewChunk(item.cx, item.cy); }
assert(terrain.chunks.size <= 192, '低缩放缓存不得超过硬上限');
assert(visible.every(item => terrain.chunks.has(item.cx + ',' + item.cy)), '不能优先淘汰屏幕内地块');
terrain.setChunkView([]);
assert(terrain.chunks.size <= 130, '缩回普通视野后应回到原预算');
jobs.dispose();
console.log(JSON.stringify({ map: ACTIVE_MAP, fourSeasonsAndAreas: points.length * 4, workerMap: 'tiannan', initializedCopyMs: +port.initPostMs.toFixed(2), discardedOldSeason: jobs.stats.discarded, wideVisible: visible.length, cachedAfterNarrow: terrain.chunks.size }));

if (ACTIVE_MAP === 'tiannan') {
  (globalThis as any).window = { innerWidth: 640, innerHeight: 360, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
  (globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const { Game } = await import('../src/world/game');
  const { Renderer } = await import('../src/world/render');
  terrain.chunks.clear();
  const renderPort = new NodeTerrainWorker(), renderJobs = terrainChunkJobs(terrain, async () => renderPort);
  const game = new Game(terrain), canvas = createCanvas(640, 360) as any;
  canvas.clientWidth = 640; canvas.clientHeight = 360;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 360 });
  game.canvas = canvas; game.renderer = new Renderer(game, canvas);
  game.story['skipAll'](); game.story['openT'] = -1;
  game.teleport(city.x * WORLD_SCALE, city.y * WORLD_SCALE);
  game.input.keys.add('d');
  let mainBakes = 0;
  const original = terrain.buildChunk;
  terrain.buildChunk = function (x, y) { mainBakes++; return original.call(this, x, y); };
  const startX = game.player.x;
  for (let i = 0; i < 20; i++) {
    game.update(1 / 30); game.renderer.render(1 / 30);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert(game.player.x > startX && !game.hero.dead, '合法新局角色应能正常移动');
  assert(renderJobs.stats.completed > 0, '真实渲染流程应采用后台地块');
  assert.equal(mainBakes, 0, '后台可用时渲染不得同步烘焙完整地块');
  assert([...terrain.chunks.values()].some(chunk => !chunk.preview), '已完成地块应进入真实缓存');
  console.log(JSON.stringify({ realCanvasRenderFrames: 20, mainThreadFullBakes: mainBakes, workerCompleted: renderJobs.stats.completed, walked: +(game.player.x - startX).toFixed(1) }));
  game.renderer.dispose();
  assert(renderPort.terminated, '退出游戏时必须终止地形 Worker');
  let resolveFactory!: (worker: TerrainWorkerPort | null) => void;
  const delayed = new Promise<TerrainWorkerPort | null>(resolve => { resolveFactory = resolve; });
  const pending = terrainChunkJobs(terrain, () => delayed);
  pending.request(points); releaseTerrainChunkJobs(terrain);
  const delayedPort = new NodeTerrainWorker(); resolveFactory(delayedPort);
  await waitUntil(() => delayedPort.terminated);
  assert.equal(delayedPort.requests.length, 0, '退出后迟到的 Worker 不能重新初始化');
  const resumedPort = new NodeTerrainWorker(), resumed = terrainChunkJobs(terrain, async () => resumedPort);
  assert.notEqual(resumed, pending, '重新进入游戏必须重建 Worker');
  await waitUntil(() => resumed.stats.state === 'ready');
  releaseTerrainChunkJobs(terrain);
  assert(resumedPort.terminated);
  const fallback = new TerrainChunkJobs(terrain);
  await waitUntil(() => fallback.stats.state === 'fallback');
  assert.equal(fallback.request(points), false, '不支持 Worker 的环境应使用同步回退');
  terrain.previewChunk(points[0].cx, points[0].cy);
  assert(!terrain.getChunk(points[0].cx, points[0].cy, true)?.preview, '回退应生成完整底图');
  fallback.dispose();
}
console.log('terrain background bake tests passed');
