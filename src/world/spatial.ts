interface Point {
  x: number;
  y: number;
}

/** 按数组顺序返回范围所在格中的候选项；精确距离由调用方判断。 */
export class SpatialIndex<T extends Point> {
  private items: T[] = [];
  private cells = new Map<number, Map<number, number[]>>();
  private xs: number[] = [];
  private ys: number[] = [];
  private buckets: number[][] = [];
  private indexed = 0;
  private enabled = false;

  constructor(private readonly cellSize: number, private readonly minSize = 64) {}

  rebuild(items: T[]): void {
    this.items = items;
    this.cells.clear();
    this.xs.length = 0;
    this.ys.length = 0;
    this.buckets.length = 0;
    this.indexed = 0;
    this.enabled = items.length >= this.minSize;
    if (this.enabled) this.addAppended();
  }

  nearby(x: number, y: number, radius: number): readonly T[] {
    if (!this.enabled) {
      if (this.items.length < this.minSize) return this.items;
      this.enabled = true;
    }
    this.addAppended();
    const minX = Math.floor((x - radius) / this.cellSize), maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize), maxY = Math.floor((y + radius) / this.cellSize);
    if ((maxX - minX + 1) * (maxY - minY + 1) >= this.items.length / 2) return this.items;
    const indices: number[] = [];
    for (let cx = minX; cx <= maxX; cx++) {
      const column = this.cells.get(cx);
      if (!column) continue;
      for (let cy = minY; cy <= maxY; cy++) {
        const cell = column.get(cy);
        if (cell) indices.push(...cell);
      }
    }
    indices.sort((a, b) => a - b);
    return indices.map((i) => this.items[i]);
  }

  moved(index: number): void {
    if (!this.enabled) return;
    this.addAppended();
    const item = this.items[index];
    const x = Math.floor(item.x / this.cellSize), y = Math.floor(item.y / this.cellSize);
    const oldX = this.xs[index], oldY = this.ys[index];
    if (x === oldX && y === oldY) return;
    const oldCell = this.buckets[index];
    oldCell.splice(oldCell.indexOf(index), 1);
    this.xs[index] = x;
    this.ys[index] = y;
    const cell = this.cell(x, y);
    cell.push(index);
    this.buckets[index] = cell;
  }

  private addAppended(): void {
    while (this.indexed < this.items.length) {
      const index = this.indexed++, item = this.items[index];
      const x = Math.floor(item.x / this.cellSize), y = Math.floor(item.y / this.cellSize);
      this.xs.push(x);
      this.ys.push(y);
      const cell = this.cell(x, y);
      cell.push(index);
      this.buckets.push(cell);
    }
  }

  private cell(x: number, y: number): number[] {
    let column = this.cells.get(x);
    if (!column) { column = new Map(); this.cells.set(x, column); }
    let cell = column.get(y);
    if (!cell) { cell = []; column.set(y, cell); }
    return cell;
  }
}
