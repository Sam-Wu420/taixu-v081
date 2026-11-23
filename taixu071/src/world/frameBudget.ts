// P0 帧预算调度与脏矩形辅助：把低优先级装饰控制在预算内，避免慢帧雪崩

export const enum RenderPriority {
  PLAYER = 100,
  TARGET = 95,
  LANDMARK = 80,
  ENEMY = 70,
  RARE = 50,
  NORMAL = 20,
  DECO = 5,
}

export interface DirtyRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function unionDirty(a: DirtyRect | null, b: DirtyRect | null): DirtyRect | null {
  if (!a || a.w <= 0 || a.h <= 0) return b && b.w > 0 && b.h > 0 ? { ...b } : null;
  if (!b || b.w <= 0 || b.h <= 0) return { ...a };
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.w, b.x + b.w);
  const y1 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function clampDirty(r: DirtyRect | null, maxW: number, maxH: number): DirtyRect | null {
  if (!r || maxW <= 0 || maxH <= 0) return null;
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(maxW, Math.ceil(r.x + r.w));
  const y1 = Math.min(maxH, Math.ceil(r.y + r.h));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export class FrameBudget {
  spentMs = 0;
  budgetMs = 8.3;
  skipped = 0;
  private startMs = 0;

  constructor(public targetMs = 8.3) {
    this.budgetMs = targetMs;
  }

  /** 每帧重置；按近期平滑帧耗（emaMs）收紧或放宽非关键装饰预算 */
  begin(emaMs: number): number {
    this.spentMs = 0;
    this.skipped = 0;
    this.startMs = typeof performance !== 'undefined' ? performance.now() : 0;
    if (!(emaMs > 0) || !Number.isFinite(emaMs)) {
      this.budgetMs = this.targetMs;
      return this.budgetMs;
    }
    if (emaMs > 15.4) {
      // 低于 ~65fps 时主动收紧可选装饰预算，保留主视角与战斗开销余量
      const over = Math.min(1, (emaMs - 15.4) / 10);
      this.budgetMs = Math.max(3.2, this.targetMs * (1 - 0.55 * over));
    } else {
      this.budgetMs = this.targetMs;
    }
    return this.budgetMs;
  }

  remaining(): number {
    return Math.max(0, this.budgetMs - this.spentMs);
  }

  /** 提交一项绘制前询问是否仍在预算内；高优先级始终放行 */
  allow(priority: number, costMs = 0.02): boolean {
    const cost = Math.max(0, costMs);
    if (priority >= RenderPriority.LANDMARK) {
      this.spentMs += cost;
      return true;
    }
    if (priority >= RenderPriority.ENEMY) {
      if (this.spentMs + cost <= this.budgetMs * 1.35) {
        this.spentMs += cost;
        return true;
      }
      this.skipped++;
      return false;
    }
    if (this.spentMs + cost <= this.budgetMs) {
      this.spentMs += cost;
      return true;
    }
    this.skipped++;
    return false;
  }

  /** 按当前实耗同步已花费时间（避免估算偏离真实 CPU 耗时） */
  syncElapsed(): void {
    if (!this.startMs || typeof performance === 'undefined') return;
    const elapsed = performance.now() - this.startMs;
    if (elapsed > this.spentMs) this.spentMs = elapsed;
  }
}
