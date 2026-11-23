/** 分帧构建地表河道/道路的均匀网格索引。索引只作为保守候选，最终仍由调用方精确裁剪。 */
export class SegmentIndex {
  private cells = new Map<string, number[]>();
  private oversized: number[] = [];
  private cursor = 0;
  private static readonly CELL = 4096;
  private static readonly MAX_SEG_CELLS = 64;
  private static readonly MAX_QUERY_CELLS = 256;
  private static readonly MAX_CANDIDATES = 4096;
  constructor(readonly source: Float32Array, readonly pad: number) {}
  get ready() { return this.cursor + 7 >= this.source.length; }
  /** 限制每帧处理段数和时间，单段最多 64 个格子；超长段单独检查。 */
  step(maxSegments = 64, budgetMs = 1, now: () => number = () => performance.now()) {
    const start = now(), C = SegmentIndex.CELL;
    for (let done = 0; done < maxSegments && !this.ready; done++) {
      const q = this.cursor; this.cursor += 8;
      const a = this.source, m = Math.max(0, a[q + 4] + this.pad);
      const x0 = Math.floor((Math.min(a[q], a[q + 2]) - m) / C), x1 = Math.floor((Math.max(a[q], a[q + 2]) + m) / C);
      const y0 = Math.floor((Math.min(a[q + 1], a[q + 3]) - m) / C), y1 = Math.floor((Math.max(a[q + 1], a[q + 3]) + m) / C);
      const n = (x1 - x0 + 1) * (y1 - y0 + 1);
      if (![x0,x1,y0,y1,n].every(Number.isSafeInteger) || n <= 0 || n > SegmentIndex.MAX_SEG_CELLS) this.oversized.push(q);
      else for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const key = `${x},${y}`; let list = this.cells.get(key); if (!list) this.cells.set(key, list = []); list.push(q);
      }
      if (now() - start >= budgetMs) break;
    }
  }
  /** 未就绪、视野太广或候选过多返回 null，调用方使用原始顺序全扫描。 */
  candidates(x0: number, y0: number, x1: number, y1: number): number[] | null {
    if (!this.ready || ![x0,y0,x1,y1].every(Number.isFinite) || x1 < x0 || y1 < y0) return null;
    const C = SegmentIndex.CELL, ax = Math.floor(x0 / C), bx = Math.floor(x1 / C), ay = Math.floor(y0 / C), by = Math.floor(y1 / C);
    const count = (bx - ax + 1) * (by - ay + 1);
    if (![ax,bx,ay,by,count].every(Number.isSafeInteger) || count > SegmentIndex.MAX_QUERY_CELLS || this.oversized.length > SegmentIndex.MAX_CANDIDATES) return null;
    const found = new Set<number>(this.oversized);
    for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
      const list = this.cells.get(`${x},${y}`); if (!list) continue;
      for (const q of list) { found.add(q); if (found.size > SegmentIndex.MAX_CANDIDATES) return null; }
    }
    return [...found].sort((a,b) => a-b);
  }
}
