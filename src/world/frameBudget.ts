// 帧预算调度器（移植自 taixu071）：把低优先级装饰控制在预算内，避免慢帧雪崩
//
// 核心理念：没有"能不能画"，只有"这一帧还剩多少预算给你画"。
// 高优先级（主角、目标、地标）始终放行；低优先级（炊烟、飘物、倒影）按预算决定。

export const enum RenderPriority {
  PLAYER = 100,
  TARGET = 95,
  LANDMARK = 80,
  ENEMY = 70,
  RARE = 50,
  NORMAL = 20,
  DECO = 5,
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
