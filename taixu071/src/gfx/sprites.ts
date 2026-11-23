// 程序化位图缓存：LRU（按像素预算）+ 每帧限时生成 + 分辨率分档 + 低清回退
/** canvas 可能是 ImageBitmap（Worker 生成），只能用于 drawImage / 纹理上传 */
export interface Spr { canvas: HTMLCanvasElement; w: number; h: number; ax: number; ay: number }
import { spriteJobs } from './spriteJobs';
import type { SpriteDone } from './sprite.worker';
type Req = Parameters<ReturnType<typeof spriteJobs>['post']>[1];
interface Entry { s: Spr; px: number; used: number; base: string; res: number }

const RES_STEPS = [0.2, 0.35, 0.5, 0.75, 1, 1.4, 2];
export function resBucket(want: number, max = 2) {
  const w = Math.min(want, max);
  for (const r of RES_STEPS) if (r >= w * 0.92) return Math.min(r, max);
  return Math.min(RES_STEPS[RES_STEPS.length - 1], max);
}

export class SpriteCache {
  private map = new Map<string, Entry>();
  private byBase = new Map<string, Set<string>>();
  private pixels = 0;
  private lastEvictFrame = -1;
  frame = 0;
  budgetPx: number;
  private frameStart = 0; private builtThisFrame = 0;
  frameMs = 7;
  unlimited = false;
  pending = 0;
  /** 连续缩放动画期：已有同对象旧分辨图时先缩放复用，停稳后再升档重烘，避免跨档那一帧集中卡顿 */
  zoomActive = false;

  constructor(budgetPx = 64e6) { this.budgetPx = budgetPx; }
  /** 依据显存/内存与画质档调预算：位图缓存越多，山、树、建筑就不用反复重建 */
  setBudget(px: number) { if (Number.isFinite(px)) this.budgetPx = Math.max(16e6, Math.min(160e6, px)); }   // 26MP→160MP 之间，按档位给

  beginFrame() {
    this.frame++; this.frameStart = performance.now(); this.builtThisFrame = 0; this.pending = 0;
    // 上一帧超预算而所有条目都在使用时，后续帧继续尝试回收。
    this.evictIfNeeded();
  }
  private evictIfNeeded() {
    if (this.pixels <= this.budgetPx * 1.15 || this.lastEvictFrame === this.frame) return;
    this.lastEvictFrame = this.frame; this.evict();
  }
  private unlink(base: string, key: string) {
    const set = this.byBase.get(base); if (!set) return;
    set.delete(key); if (!set.size) this.byBase.delete(base);
  }

  canBuild() {
    const elapsed = performance.now() - this.frameStart;
    if (this.builtThisFrame === 0) return this.map.size === 0 || elapsed < this.frameMs * 1.5;
    return elapsed < this.frameMs;
  }

  /**
   * 后台生成版：命中缓存直接返回；否则把请求投给 Worker，先返回同对象其他分辨率（若有）或 null，
   * 生成好后自动入缓存（onReady 可附带元数据）。Worker 不可用时退回同步 get()。
   */
  getAsync(base: string, res: number, req: (res: number) => Req, make: (res: number) => Spr, onReady?: (r: SpriteDone) => void): Spr | null {
    const J = spriteJobs();
    if (!J.ok) return this.get(base, res, make);
    const key = base + '@' + res;
    const e = this.map.get(key);
    if (e) { e.used = this.frame; return e.s; }
    // 缩小视野时优先复用 2.2× 内的高清图，避免重复生成小图并把高清缓存挤出 LRU
    const up = this.findReusable(base, res);
    if (up) { up.used = this.frame; return up.s; }
    // 连续缩放期：若已有旧分辨率图，暂缓投递新 Worker 任务，待停稳后再补高清
    if (this.zoomActive) {
      const fb = this.fallback(base, res);
      if (fb) { this.pending++; return fb; }
    }
    if (!J.busy(key)) {
      J.post(key, req(res), (r) => {
        if (r.err || !r.bmp) { if (r.err) console.warn('精灵生成失败', key, r.err); return; }
        onReady?.(r);
        this.put(key, base, res, { canvas: r.bmp as unknown as HTMLCanvasElement, w: r.w, h: r.h, ax: r.ax, ay: r.ay });
      });
    }
    this.pending++;
    return this.fallback(base, res);
  }
  private findReusable(base: string, res: number): Entry | null {
    const set = this.byBase.get(base);
    if (!set) return null;
    let best: Entry | null = null;
    // 图集本身自带 3 级 Mipmap，缩小时允许复用至 4× 内已缓存图，避免缩放停稳瞬间集中重烘整屏低清副本
    const maxRes = res * 4.0;
    for (const k of set) {
      const o = this.map.get(k);
      if (o && o.res >= res && o.res <= maxRes && (!best || o.res < best.res)) best = o;
    }
    return best;
  }
  private put(key: string, base: string, res: number, s: Spr) {
    const old = this.map.get(key); if (old) { this.pixels -= old.px; }
    const px = s.canvas.width * s.canvas.height;
    this.map.set(key, { s, px, used: this.frame, base, res });
    let set = this.byBase.get(base); if (!set) { set = new Set(); this.byBase.set(base, set); }
    set.add(key);
    this.pixels += px;
    // 性能：以前每 put 一次就整表排序淘汰（几百上千项时每次都是 O(n log n)，一帧建几十张就卡成幻灯片）。
    // 现在攒到 1.15 倍预算才收一次，每帧最多收一次，避免同帧重复排序。
    this.evictIfNeeded();
  }
  private fallback(base: string, res: number): Spr | null {
    const set = this.byBase.get(base);
    if (!set) return null;
    let best: Entry | null = null;
    for (const k of set) { const o = this.map.get(k); if (o && (!best || Math.abs(o.res - res) < Math.abs(best.res - res))) best = o; }
    if (best) { best.used = this.frame; return best.s; }
    return null;
  }

  /** 取得 base@res 的位图；若本帧预算耗尽，返回同 base 的其他分辨率（若有），否则 null */
  get(base: string, res: number, make: (res: number) => Spr, urgent = false): Spr | null {
    const key = base + '@' + res;
    const e = this.map.get(key);
    if (e) { e.used = this.frame; return e.s; }
    const up = this.findReusable(base, res);
    if (up) { up.used = this.frame; return up.s; }
    if (!urgent && this.zoomActive) {
      const fb = this.fallback(base, res);
      if (fb) { this.pending++; return fb; }
    }
    if (urgent || this.canBuild()) {
      const t0 = performance.now();
      const s = make(res);
      this.builtThisFrame++;
      this.frameStart -= 0; void t0;
      const px = s.canvas.width * s.canvas.height;
      const ent: Entry = { s, px, used: this.frame, base, res };
      this.map.set(key, ent);
      let set = this.byBase.get(base); if (!set) { set = new Set(); this.byBase.set(base, set); }
      set.add(key);
      this.pixels += px;
      this.evictIfNeeded();
      return s;
    }
    this.pending++;
    // 回退：同一对象的其他分辨率
    const set = this.byBase.get(base);
    if (set) {
      let best: Entry | null = null;
      for (const k of set) { const o = this.map.get(k); if (o && (!best || Math.abs(o.res - res) < Math.abs(best.res - res))) best = o; }
      if (best) { best.used = this.frame; return best.s; }
    }
    return null;
  }

  has(base: string) { return !!this.byBase.get(base)?.size; }
  /** 第三十八步：只查不建——精确分辨率 */
  peek(base: string, res: number): Spr | null { const e = this.map.get(base + '@' + res); if (e) { e.used = this.frame; return e.s; } return null; }
  /** 同一对象最接近 res 的已有版本（含其分辨率） */
  best(base: string, res: number): { s: Spr; res: number } | null {
    const set = this.byBase.get(base); if (!set) return null;
    let b: Entry | null = null;
    for (const k of set) { const o = this.map.get(k); if (o && (!b || Math.abs(o.res - res) < Math.abs(b.res - res))) b = o; }
    if (!b) return null; b.used = this.frame; return { s: b.s, res: b.res };
  }
  /** 外部（分帧）建好的放进缓存 */
  adopt(base: string, res: number, s: Spr) { this.put(base + '@' + res, base, res, s); }

  private evict() {
    const arr = [...this.map.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [k, e] of arr) {
      if (this.pixels <= this.budgetPx * 0.8) break;
      if (e.used >= this.frame - 1) continue; // 正在使用
      this.map.delete(k);
      this.unlink(e.base, k);
      this.pixels -= e.px;
      // 释放 GPU/内存
      try { const c = e.s.canvas as unknown as { close?: () => void; width: number; height: number }; if (typeof c.close === 'function') c.close(); else { c.width = 0; c.height = 0; } } catch { /* */ }
    }
  }

  clearBase(prefix: string) {
    for (const [k, e] of [...this.map.entries()]) if (e.base.startsWith(prefix)) { this.map.delete(k); this.unlink(e.base, k); this.pixels -= e.px; }
  }
  get stats() { return { n: this.map.size, mpx: +(this.pixels / 1e6).toFixed(1) }; }
}

export const sprites = new SpriteCache();
