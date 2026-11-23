import { prof } from '../core/prof';
import { BitmapFrame } from './bitmap-frame';
import { CharacterFrameCache, type CharacterFrame } from './character-cache';
import { advanceCharacterPose, restoreCharacterPhysics, type CharState, type Look, type Pose } from './character';
import { resBucket } from './sprites';
import { resTier } from './resTier';
import type { CharacterPaintBatchReply, CharacterPaintBatchRequest, CharacterPaintRequest, CharacterPaintState } from './character-worker-protocol';

export interface CharacterWorkerPort {
  onmessage: ((event: MessageEvent<CharacterPaintBatchReply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(request: CharacterPaintBatchRequest): void;
  terminate(): void;
}

type WorkerFactory = () => Promise<readonly CharacterWorkerPort[] | null>;
type State = 'starting' | 'ready' | 'fallback';
type ImageSource = HTMLCanvasElement | BitmapFrame;

export interface WorkerCharacterFrame extends Omit<CharacterFrame, 'image'> {
  key: CharState;
  image: ImageSource;
}

interface FrameKey {
  res: number; scale: number; look: string; action: CharState['action']; castN: number; yaw: number; bucket: number; armed: boolean;
}
interface Desired { look: Look; pose: Pose; dt: number; key: FrameKey; now: number }
interface Entry {
  st: CharState; image: ImageSource; revision: number; painted: FrameKey; sampledAt: number;
  desired: Desired; pending: number; queued: boolean; active: boolean; inflight: number | null;
  presented: boolean; seen: number;
}
interface Slot { worker: CharacterWorkerPort; entries: Entry[]; requests: Desired[] }
const BATCH_SIZE = 128;

async function createWorkers(): Promise<readonly CharacterWorkerPort[] | null> {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || !OffscreenCanvas.prototype.transferToImageBitmap) return null;
  const module = await import('./character-paint.worker?worker&inline');
  // 线程数跟着 CPU 走：留一半给主线程、地形烘焙和浏览器自己，最少 2 个，最多 6 个。
  // 千人战里 2 个线程画不过来（实测人物画面平均滞后 0.77 秒）。
  const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
  const count = Math.max(2, Math.min(6, Math.floor(cores / 2) - 1));
  return Array.from({ length: count }, () => new module.default());
}

/** poseRate：动作取样频率（Hz）；maxRes：位图清晰度上限（texel / 世界单位） */
function keyFor(look: Look, st: CharState, scale: number, pixelScale: number, poseRate = 10, maxRes = 1): FrameKey {
  const clock = st.action === 'idle' || st.action === 'walk' || st.action === 'run' || st.action === 'fly' ? st.t : st.actionT;
  return { res: resBucket(resTier.k * pixelScale, maxRes), scale, look: JSON.stringify(look), action: st.action, castN: st.castN,
    yaw: Math.round(st.yaw / (Math.PI / 8)), bucket: Math.floor(clock * poseRate) + poseRate * 1e6, armed: st.armed };
}

function sameKey(a: FrameKey, b: FrameKey): boolean {
  return a.res === b.res && a.scale === b.scale && a.look === b.look && a.action === b.action && a.castN === b.castN && a.yaw === b.yaw && a.bucket === b.bucket && a.armed === b.armed;
}

function paintState(st: CharState): CharacterPaintState {
  return { x: st.x, y: st.y, yaw: st.yaw, action: st.action, actionT: st.actionT, phase: st.phase, speed: st.speed,
    vx: st.vx, vy: st.vy, lift: st.lift, t: st.t, seed: st.seed, windX: st.windX, windY: st.windY, castN: st.castN, hands: st.hands };
}

/** 首帧同步，其后在两个 Worker 中绘制；每帧位置和动作仍由主线程推进。 */
export class CharacterWorkerFrames {
  private readonly entries = new Map<CharState, Entry>();
  private readonly queue: Entry[] = [];
  private head = 0;
  private slots: Slot[] = [];
  private state: State = 'starting';
  private frame = 0;
  private disposed = false;
  private completed = 0;

  constructor(private readonly fallback: CharacterFrameCache, factory: WorkerFactory = createWorkers) {
    void factory().then(workers => {
      if (this.disposed) { workers?.forEach(worker => worker.terminate()); return; }
      if (!workers?.length) { this.state = 'fallback'; return; }
      this.slots = workers.map(worker => ({ worker, entries: [], requests: [] }));
      for (const slot of this.slots) {
        slot.worker.onmessage = event => this.receive(slot, event.data);
        slot.worker.onerror = event => { console.warn('人物后台绘制失败，回退主线程', event.message); this.fail(); };
      }
      this.state = 'ready'; this.pump();
    }).catch(error => { if (!this.disposed) { console.warn('人物后台绘制不可用，回退主线程', error); this.fail(); } });
  }

  beginFrame(): void { this.frame++; }

  endFrame(): void {
    for (const [st, entry] of this.entries) {
      if (entry.seen !== this.frame) entry.queued = false;
      if (this.frame - entry.seen > 120) {
        const pending = this.release(st);
        if (pending) this.fallback.deferPhysics(st, pending);
      }
    }
    this.pump();
  }

  /** 不指定时的清晰度上限（texel / 世界单位）。渲染器每帧按画面里的人数定：人少时放开到 2，拉近看不糊；人多时收回 1，免得图集装不下 */
  maxRes = 1;
  /** 这一帧取了多少个人物（渲染器据此估计画面里的人数） */
  uses = 0;
  prepare(look: Look, st: CharState, scale: number, dt: number, pixelScale: number, allowRefresh = true, timeMs?: number, minIntervalMs = 100,
    poseRate = 10, maxRes = this.maxRes): WorkerCharacterFrame {
    this.uses++;
    const now = timeMs ?? performance.now();
    if (this.state !== 'ready' || look.headTex) {
      const extra = this.release(st) ?? 0;
      return { key: st, ...this.fallback.prepare(look, st, scale, dt, pixelScale, allowRefresh, now, extra) };
    }
    let entry = this.entries.get(st);
    if (!entry) {
      const extra = this.fallback.release(st);
      const first = this.fallback.prepare(look, st, scale, dt, pixelScale, allowRefresh, now, extra);
      const key = keyFor(look, st, scale, pixelScale, poseRate, maxRes);
      entry = { st, image: first.image, revision: first.revision, painted: key, sampledAt: now,
        desired: { look, pose: st.last!, dt, key, now }, pending: this.fallback.release(st), queued: false, active: true,
        inflight: null, presented: false, seen: this.frame };
      this.entries.set(st, entry);
      return { key: st, ...first };
    }
    const pose = advanceCharacterPose(look, st, dt), key = keyFor(look, st, scale, pixelScale, poseRate, maxRes);
    entry.pending += dt; entry.desired = { look, pose, dt, key, now }; entry.seen = this.frame;
    const dirty = !sameKey(entry.painted, key) || (minIntervalMs === 0 && dt > 0);
    if (dirty && allowRefresh && now - entry.sampledAt >= minIntervalMs && !entry.queued && entry.inflight === null) {
      entry.queued = true; this.queue.push(entry);
    }
    if (prof.on) {
      prof.addMs('R·人物Worker帧龄累计ms', 0, Math.max(0, now - entry.sampledAt));
      prof.addMs('R·人物Worker帧龄样本', 0);
      if (entry.inflight !== null || entry.queued) prof.addMs('R·人物Worker忙时复用', 0);
    }
    const ratio = scale / entry.painted.scale, pad = ratio / entry.painted.res;
    const l = -170 * scale - pad, t = -330 * scale - st.lift - pad;
    const mode = entry.presented ? 'refreshed' : dirty ? 'deferred' : 'reused'; entry.presented = false;
    return { key: st, image: entry.image, revision: entry.revision, l, r: l + entry.image.width * pad,
      t, b: t + entry.image.height * pad, mode };
  }

  /** 返回离开后台绘制时尚未推进的衣发时间。 */
  release(st: CharState): number | undefined {
    const entry = this.entries.get(st);
    if (!entry) return undefined;
    entry.active = false; this.entries.delete(st);
    if (entry.image instanceof BitmapFrame) entry.image.release();
    return entry.pending + (entry.inflight ?? 0);
  }

  get stats(): { state: State; queued: number; inflight: number; completed: number } {
    return { state: this.state, queued: this.queue.length - this.head, inflight: this.slots.reduce((n, slot) => n + slot.entries.length, 0), completed: this.completed };
  }

  dispose(): void {
    this.disposed = true; this.state = 'fallback';
    for (const st of this.entries.keys()) {
      const pending = this.release(st);
      if (pending) this.fallback.deferPhysics(st, pending);
    }
    for (const slot of this.slots) slot.worker.terminate();
    this.slots = []; this.queue.length = this.head = 0;
  }

  private fail(): void {
    this.state = 'fallback';
    for (const slot of this.slots) slot.worker.terminate();
    this.slots = []; this.queue.length = this.head = 0;
  }

  private receive(slot: Slot, reply: CharacterPaintBatchReply): void {
    const start = prof.on ? performance.now() : 0;
    for (let i = 0; i < reply.results.length; i++) {
      const entry = slot.entries[i], request = slot.requests[i], result = reply.results[i];
      if (entry.active) {
        restoreCharacterPhysics(entry.st, result.physics);
        if (entry.image instanceof BitmapFrame) entry.image.release();
        entry.image = new BitmapFrame(result.image); entry.revision++; entry.painted = request.key;
        entry.sampledAt = request.now; entry.inflight = null; entry.presented = true; this.completed++;
      } else result.image.close();
    }
    slot.entries.length = 0; slot.requests.length = 0;
    if (prof.on) { prof.add('R·人物Worker接收', start, reply.results.length); prof.addMs('R·人物Worker完成', 0, reply.results.length); }
    this.pump();
  }

  private pump(): void {
    if (this.state !== 'ready') return;
    let available = this.slots.filter(slot => slot.entries.length === 0).length;
    for (const slot of this.slots) {
      if (slot.entries.length) continue;
      const start = prof.on ? performance.now() : 0;
      const batchSize = Math.min(BATCH_SIZE, Math.ceil((this.queue.length - this.head) / available));
      available--;
      const requests: CharacterPaintRequest[] = [];
      while (this.head < this.queue.length && requests.length < batchSize) {
        const entry = this.queue[this.head++];
        if (!entry.queued) continue;
        entry.queued = false;
        if (!entry.active || entry.inflight !== null) continue;
        const request = entry.desired, st = entry.st;
        const physicsDt = entry.pending; entry.pending = 0; entry.inflight = physicsDt;
        slot.entries.push(entry); slot.requests.push(request);
        requests.push({ state: paintState(st), physics: { strands: st.strands, springs: st.springs, hp: st.hp },
          look: request.look, pose: request.pose, scale: request.key.scale, res: request.key.res, dt: request.dt, physicsDt });
      }
      if (!requests.length) break;
      slot.worker.postMessage({ requests });
      if (prof.on) { prof.add('R·人物Worker提交', start, requests.length); prof.addMs('R·人物Worker请求', 0, requests.length); }
    }
    if (this.head === this.queue.length) { this.queue.length = 0; this.head = 0; }
    else if (this.head >= 256 || this.head * 2 >= this.queue.length) { this.queue.splice(0, this.head); this.head = 0; }
  }
}
