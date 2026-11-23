/** 极远景宏观地理摘要：只读取既有山脉/河流/道路中心线，不触发地形装饰块生成。 */
type Point = readonly [number, number];
type Line = { pts: readonly Point[] };
type Kind = 'mountain' | 'river' | 'road';
type Item = { kind: Kind; line: Line };

export class FarGeometry {
  private paths: Record<Kind, Path2D> = { mountain: new Path2D(), river: new Path2D(), road: new Path2D() };
  private jobs: Item[] = [];
  private cursor = 0;
  /** 每条折线最多 64 个点，不依赖放大后的视野所含 chunk 数量。 */
  static readonly MAX_POINTS = 64;
  constructor(ranges: readonly Line[], rivers: readonly Line[], roads: readonly Line[], private readonly scale: number) {
    for (const line of ranges) this.jobs.push({ kind: 'mountain', line });
    for (const line of rivers) this.jobs.push({ kind: 'river', line });
    for (const line of roads) this.jobs.push({ kind: 'road', line });
  }
  get pending() { return this.cursor < this.jobs.length; }
  /** 每帧最多处理固定数量的折线，已处理路径可以立刻绘制。 */
  step(budget = 4) {
    const count = Number.isFinite(budget) ? Math.max(0, Math.floor(budget)) : 0;
    const end = Math.min(this.jobs.length, this.cursor + count);
    for (; this.cursor < end; this.cursor++) {
      const { kind, line } = this.jobs[this.cursor], path = this.paths[kind], n = line.pts.length;
      const steps = Math.min(n, FarGeometry.MAX_POINTS); let started = false;
      for (let j = 0; j < steps; j++) {
        const p = line.pts[steps === 1 ? 0 : Math.floor(j * (n - 1) / (steps - 1))];
        if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) { started = false; continue; }
        const x = p[0] * this.scale, y = p[1] * this.scale;
        if (started) path.lineTo(x, y); else { path.moveTo(x, y); started = true; }
      }
    }
  }
  /** 山脉始终保留为细窄的宏观脊线，不随缩放淡出，也不膨胀成粗长色块。 */
  draw(ctx: CanvasRenderingContext2D, zoom: number) {
    if (!(zoom > 0) || !Number.isFinite(zoom)) return;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(75,75,66,0.3)';
    // 以屏幕像素为单位定宽（约 1.6 CSS px），无论缩放如何都不会变成粗长色块。
    ctx.lineWidth = 1.6 / zoom; ctx.stroke(this.paths.mountain);
    ctx.restore();
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(99,144,155,0.7)'; ctx.lineWidth = 1.6 / zoom; ctx.stroke(this.paths.river);
    ctx.strokeStyle = 'rgba(113,84,54,0.55)'; ctx.lineWidth = 0.9 / zoom; ctx.stroke(this.paths.road);
    ctx.restore();
  }
}
