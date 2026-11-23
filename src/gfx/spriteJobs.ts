// 后台精灵生成调度：主线程把"山 / 树"的生成请求投给 Worker 池，结果到了再塞进 SpriteCache。
// Worker 不可用（Node 测试、老浏览器、file:// 限制等）时 ok=false，调用方走同步生成。
//
// 优化 v2：多 Worker 池（按 CPU 核心数开 2–3 个），轮询分配，吞吐量翻倍。
import type { SpriteJob, SpriteDone } from './sprite.worker';

export type SpriteReq = SpriteJob extends infer J ? (J extends SpriteJob ? Omit<J, 'id'> : never) : never;
type Req = SpriteReq;

interface Slot {
  w: Worker;
  inflight: Map<number, { key: string; done: (r: SpriteDone) => void; t0: number }>;
  load: number;   // 当前排队数（用于最空闲分配）
  alive: boolean;
}

class SpriteJobs {
  private slots: Slot[] = [];
  private seq = 1;
  private keys = new Set<string>();          // 所有正在生成中的 key（跨 Worker 去重）
  ok = false;
  /** 统计：完成数、平均耗时（ms，含排队） */
  done = 0; avgMs = 0;
  /** 每个 Worker 最多同时跑几个任务（保留弹性：Worker 自身是串行的，但 postMessage 可以预投 2 个减少来回） */
  private perSlotCap = 2;

  constructor() {
    try {
      if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return;
      const oc = new OffscreenCanvas(1, 1);
      if (!oc.getContext('2d') || typeof (oc as OffscreenCanvas).transferToImageBitmap !== 'function') return;
      // 按 CPU 核心数决定 Worker 数：
      //   1 核 → 1 个（不抢主线程）
      //   2 核 → 1 个（留一个给主线程）
      //   4 核 → 2 个
      //   8+ 核 → 3 个（再多收益递减、内存开销上涨）
      const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 2) : 2;
      const n = Math.max(1, Math.min(3, Math.floor(cores / 2)));
      // 动态导入：Node 测试环境里根本不会走到这里（没有 Worker）
      import('./sprite.worker?worker&inline').then((m) => {
        for (let i = 0; i < n; i++) {
          const w = new m.default();
          const slot: Slot = { w, inflight: new Map(), load: 0, alive: true };
          w.onmessage = (e: MessageEvent<SpriteDone>) => this.onDone(slot, e.data);
          w.onerror = (e) => {
            console.warn(`精灵 Worker#${i} 出错，移除`, e.message);
            this.failSlot(slot, i);
          };
          this.slots.push(slot);
        }
        this.ok = this.slots.length > 0;
      }).catch((e) => console.warn('精灵 Worker 不可用，回退主线程生成', e));
    } catch (e) { console.warn('精灵 Worker 不可用，回退主线程生成', e); this.ok = false; }
  }

  private failSlot(slot: Slot, _idx: number) {
    slot.alive = false;
    try { slot.w.terminate(); } catch { /* */ }
    // 把该 Worker 上排队的任务清掉（key 释放，下次可重投到其他 Worker）
    for (const [, cb] of slot.inflight) {
      this.keys.delete(cb.key);
      cb.done({ id: 0, w: 0, h: 0, ax: 0, ay: 0, err: 'worker failed' });
    }
    slot.inflight.clear(); slot.load = 0;
    // 所有 Worker 都挂了 → 标记不可用
    if (this.slots.every((s) => !s.alive)) {
      this.ok = false;
    }
  }

  private onDone(slot: Slot, r: SpriteDone) {
    const c = slot.inflight.get(r.id); if (!c) return;
    slot.inflight.delete(r.id); slot.load--;
    this.keys.delete(c.key);
    const ms = performance.now() - c.t0; this.done++; this.avgMs += (ms - this.avgMs) * 0.1;
    c.done(r);
  }

  busy(key: string) { return this.keys.has(key); }
  get queued() { return this.keys.size; }
  get workerCount() { return this.slots.filter((s) => s.alive).length; }

  /** 投递；所有 Worker 都满或 key 已在生成中返回 false */
  post(key: string, req: Req, done: (r: SpriteDone) => void): boolean {
    if (!this.ok || this.keys.has(key)) return false;
    // 找最空闲的活 Worker
    let best: Slot | null = null;
    for (const s of this.slots) {
      if (!s.alive) continue;
      if (s.load < this.perSlotCap && (!best || s.load < best.load)) best = s;
    }
    if (!best) return false;   // 全满
    const id = this.seq++;
    best.inflight.set(id, { key, done, t0: performance.now() });
    best.load++;
    this.keys.add(key);
    best.w.postMessage({ id, ...req } as SpriteJob);
    return true;
  }
}

let inst: SpriteJobs | null = null;
export function spriteJobs(): SpriteJobs { return inst ??= new SpriteJobs(); }
