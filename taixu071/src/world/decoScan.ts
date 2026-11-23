/** 按中心向外的固定顺序分帧扫描装饰块；光标属于一个确定的视野键，视野变化由调用方重置。 */
export interface DecoScan { x0: number; x1: number; y0: number; y1: number; cursor: number }
export function takeDecoChunks(scan: DecoScan, budget: number, keep: (x: number, y: number) => boolean): { chunks: [number, number][]; pending: boolean } {
  const width = scan.x1 - scan.x0 + 1, height = scan.y1 - scan.y0 + 1;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || !Number.isSafeInteger(width * height) || !Number.isSafeInteger(budget) || budget <= 0) return { chunks: [], pending: false };
  const total = width * height, chunks: [number, number][] = [];
  // 中心、右一格、左一格……先让玩家附近完成，即使镜头移动导致重启也不至于一直画远角。
  const centerOut = (i: number, size: number) => {
    const mid = Math.floor((size - 1) / 2);
    return i === 0 ? mid : (i % 2 ? mid + Math.ceil(i / 2) : mid - i / 2);
  };
  let examined = 0;
  // 抽稀比例很低时也限制每帧扫描候选数，避免远景一次遍历整个大地图。
  while (scan.cursor < total && chunks.length < budget && examined < budget * 16) {
    examined++;
    const i = scan.cursor++, x = scan.x0 + centerOut(i % width, width), y = scan.y0 + centerOut(Math.floor(i / width), height);
    if (keep(x, y)) chunks.push([x, y]);
  }
  return { chunks, pending: scan.cursor < total };
}

/** 一组并行维护的列表 + 计数（绘制列表 / 倒影 / 预热 / 树山景计数） */
export interface DecoLists<L, R, P> { list: L[]; reflect: R[]; prefetch: P[]; counts: [number, number, number] }
const emptyLists = <L, R, P>(): DecoLists<L, R, P> => ({ list: [], reflect: [], prefetch: [], counts: [0, 0, 0] });

/**
 * 装饰列表缓存：扫描中保留上一张完整列表，扫完才整体替换。
 * 以前视野键一变就把显示列表塌缩成第一批（树/山整片消失再补回），
 * 且每帧的林色底 drawable 被累积进缓存列表（1 层叠到 7 层）——
 * 移动时整片林子明暗闪烁。显示列表与累积区物理分开后，这两件事都不可能发生。
 */
export class DecoListCache<L, R, P> {
  /** 已提交（正在显示）的视野键 */
  key = '';
  /** 进行中的扫描所属视野键 */
  scanKey = '';
  scan: DecoScan | null = null;
  /** 上一张完整列表（显示用） */
  shown: DecoLists<L, R, P> = emptyLists();
  /** 扫描中累积的新列表（扫完才换成 shown） */
  build: DecoLists<L, R, P> = emptyLists();

  /** 视野键变化时开新扫描并清空累积区；键不变则继续用同一光标 */
  begin(key: string, x0: number, x1: number, y0: number, y1: number): DecoScan {
    if (key !== this.scanKey || !this.scan) {
      this.scan = { x0, x1, y0, y1, cursor: 0 };
      this.scanKey = key;
      this.build = emptyLists();
    }
    return this.scan;
  }
  /** 本帧应显示的列表：已有完整列表用它；首次扫描完成前先显示已攒的部分 */
  display(): DecoLists<L, R, P> {
    return this.key !== '' ? this.shown : this.build;
  }
  /** 一批扫完后调用：pending 时什么都不换，扫完才把累积区整体提交为显示列表 */
  finish(key: string, pending: boolean) {
    if (pending) return;
    this.key = key;
    this.shown = this.build;
    this.build = emptyLists();
    this.scan = null;
    this.scanKey = '';
  }
  /** 取消未完成的后台扫描（例如视野又退回已提交的 key） */
  cancelScan() {
    this.scanKey = '';
    this.scan = null;
    this.build = emptyLists();
  }
  reset() {
    this.key = ''; this.scanKey = ''; this.scan = null;
    this.shown = emptyLists(); this.build = emptyLists();
  }
}
