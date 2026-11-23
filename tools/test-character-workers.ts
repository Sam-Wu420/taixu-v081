import './env';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createCanvas } from './env';
import { mulberry32 } from '../src/core/rng';
import { BitmapFrame } from '../src/gfx/bitmap-frame';
import { CharacterFrameCache } from '../src/gfx/character-cache';
import { CharState, randomLook, Strand, type Action } from '../src/gfx/character';
import { CharacterWorkerFrames, type CharacterWorkerPort } from '../src/gfx/character-worker-frames';
import { characterPhysicsBuffers, paintCharacter } from '../src/gfx/character-worker-paint';
import type { CharacterPaintBatchReply, CharacterPaintBatchRequest } from '../src/gfx/character-worker-protocol';

let closed = 0;
class PaintPort implements CharacterWorkerPort {
  onmessage: ((event: MessageEvent<CharacterPaintBatchReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  pending: CharacterPaintBatchRequest | null = null;
  terminated = false;
  batches: number[] = [];
  postMessage(request: CharacterPaintBatchRequest): void {
    assert.equal(this.pending, null);
    this.pending = structuredClone(request); this.batches.push(request.requests.length);
  }
  terminate(): void { this.terminated = true; }
  drain(): void {
    const batch = this.pending!; this.pending = null;
    const results = batch.requests.map(request => {
      const canvas = createCanvas(1, 1), ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
      const physics = paintCharacter(ctx, request);
      const image = Object.assign(canvas, { close: () => { closed++; } }) as unknown as ImageBitmap;
      const buffers = characterPhysicsBuffers(physics);
      const returned = structuredClone(physics, { transfer: buffers });
      assert(buffers.every(buffer => buffer.byteLength === 0), 'Worker 端布料缓冲区应转移所有权');
      return { image, physics: returned };
    });
    this.onmessage!({ data: { results } } as MessageEvent<CharacterPaintBatchReply>);
  }
}

const ports = [new PaintPort(), new PaintPort()];
const fallback = new CharacterFrameCache();
const frames = new CharacterWorkerFrames(fallback, async () => ports);
await Promise.resolve(); await Promise.resolve();
assert.equal(frames.stats.state, 'ready');
const random = mulberry32(20261113), actions: Action[] = ['idle', 'walk', 'run', 'cast', 'hit', 'fly', 'dodge', 'sit', 'gather'];
const cases = Array.from({ length: 260 }, (_, i) => {
  const look = randomLook(random, 'cultivator'), a = new CharState(1000 + i * 7, 2000 + i * 9), b = new CharState(a.x, a.y);
  a.t = b.t = 2; a.seed = b.seed = i + 17; a.action = b.action = actions[i % actions.length];
  a.yaw = b.yaw = i % 4 * Math.PI / 4; a.vx = b.vx = 80; a.windX = b.windX = 20;
  return { look, worker: a, baseline: b, cache: new CharacterFrameCache(), reference: null as HTMLCanvasElement | null };
});

frames.beginFrame();
for (const item of cases) {
  item.worker.update(1 / 60); item.baseline.update(1 / 60);
  const actual = frames.prepare(item.look, item.worker, 1.06, 1 / 60, .2, true, 0, 0);
  const expected = item.cache.prepare(item.look, item.baseline, 1.06, 1 / 60, .2, true, 0);
  assert.deepEqual((actual.image as unknown as { toBuffer(type: string): Buffer }).toBuffer('image/png'),
    (expected.image as unknown as { toBuffer(type: string): Buffer }).toBuffer('image/png'));
}
frames.endFrame();

frames.beginFrame();
for (const item of cases) {
  item.worker.update(1 / 60); item.baseline.update(1 / 60);
  item.worker.t += 0.1; item.baseline.t += 0.1;
  if (item.worker.action !== 'idle' && item.worker.action !== 'walk' && item.worker.action !== 'run' && item.worker.action !== 'fly') {
    item.worker.actionT += 0.1; item.baseline.actionT += 0.1;
  }
  frames.prepare(item.look, item.worker, 1.06, 1 / 60, .2, true, 120, 0);
  item.reference = item.cache.prepare(item.look, item.baseline, 1.06, 1 / 60, .2, true, 120).image;
}
frames.endFrame();
assert.deepEqual(ports.map(port => port.batches), [[128], [128]], '两个 Worker 应同时收到整批');
assert.equal(frames.stats.queued, 4);
ports[0].drain();
assert.deepEqual(ports[0].batches, [128, 4], '主线程不产生新帧时应接续提交队列');
ports[1].drain(); ports[0].drain();
assert.equal(frames.stats.completed, 260);

frames.beginFrame();
let exact = 0;
for (const item of cases) {
  const actual = frames.prepare(item.look, item.worker, 1.06, 0, .2, true, 120, 0);
  assert(actual.image instanceof BitmapFrame);
  const bitmap = actual.image.image as unknown as { toBuffer(type: string): Buffer };
  const expected = item.reference as unknown as { toBuffer(type: string): Buffer };
  const actualBytes = bitmap.toBuffer('image/png'), expectedBytes = expected.toBuffer('image/png');
  if (!actualBytes.equals(expectedBytes)) {
    writeFileSync('tools/out/character-worker-actual.png', actualBytes);
    writeFileSync('tools/out/character-worker-expected.png', expectedBytes);
    throw new Error(`实际人物同一姿态像素不同：第 ${exact} 个，动作 ${item.worker.action}`);
  }
  exact++;
  for (const strand of item.worker.strands.values()) assert(strand instanceof Strand, '返回主线程的衣发应恢复真实物理方法');
}
frames.endFrame();
assert.equal(frames.stats.inflight, 0, 'dt=0 且姿态未变时暂停绘制不得重新提交');
assert.equal(frames.stats.queued, 0);

const chosen = cases[0], initial = frames.prepare(chosen.look, chosen.worker, 1.06, 0, .2, true, 120, 0);
const held = initial.image as BitmapFrame; held.retain();
const before = closed; const pending = frames.release(chosen.worker);
assert.equal(pending, 0); assert.equal(closed, before, '图集仍持有时不能提前关闭');
held.release(); assert.equal(closed, before + 1, '最后一个持有方释放后关闭');

frames.beginFrame();
for (const item of cases.slice(1, 4)) {
  item.worker.update(1 / 60);
  frames.prepare(item.look, item.worker, 1.06, 1 / 60, .2, true, 140, 0);
}
frames.endFrame();
assert.deepEqual(ports.map(port => port.batches[port.batches.length - 1]), [2, 1], '小队列也应分配给两个空闲 Worker');
const pendingOnExit = cases[1].worker;
frames.dispose();
assert(ports.every(port => port.terminated));
while (ports.some(port => port.pending)) for (const port of ports) if (port.pending) port.drain();
const seen: number[] = [], originalStep = Strand.prototype.step;
Strand.prototype.step = function (...args) { seen.push(args[2]); return originalStep.apply(this, args); };
const canvas = createCanvas(300, 300), ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
try {
  fallback.draw(ctx, cases[1].look, pendingOnExit, 1.06, 1 / 60, false);
} finally { Strand.prototype.step = originalStep; }
assert(seen.some(dt => Math.abs(dt - 2 / 60) < 1e-9), '退出后下次绘制应补上未完成任务的衣发时间');
assert.equal(closed, 263, '260 张已收图及退出后的 3 张过期结果均应关闭');

let resolveFactory!: (ports: CharacterWorkerPort[]) => void;
const latePort = new PaintPort(), late = new CharacterWorkerFrames(new CharacterFrameCache(), () => new Promise(resolve => { resolveFactory = resolve; }));
late.dispose(); resolveFactory([latePort]); await Promise.resolve(); await Promise.resolve();
assert(latePort.terminated, '异步启动完成前退出应关闭 Worker');

const clearPorts = [new PaintPort(), new PaintPort()];
const clearing = new CharacterWorkerFrames(new CharacterFrameCache(), async () => clearPorts);
await Promise.resolve(); await Promise.resolve();
const cleared = cases.map((item, i) => ({ look: item.look, st: new CharState(i, 0) }));
clearing.beginFrame();
for (const item of cleared) clearing.prepare(item.look, item.st, 1.06, 1 / 60, .2, true, 0, 0);
clearing.endFrame();
clearing.beginFrame();
for (const item of cleared) {
  item.st.update(1 / 60);
  clearing.prepare(item.look, item.st, 1.06, 1 / 60, .2, true, 17, 0);
}
clearing.endFrame();
assert.equal(clearing.stats.queued, 4);
clearing.beginFrame(); clearing.endFrame();
clearPorts[0].drain(); clearPorts[1].drain();
assert.deepEqual(clearPorts.map(port => port.batches), [[128], [128]], '清场后不得派发不再可见的排队任务');
clearing.dispose();

console.log(`PASS 原人物 ${exact} 组像素、双 Worker 批次 128/128/4、暂停/清场、布料回传、共享位图释放与退出重入`);
