// 程序化画材的全局画布字节预算。
// 这些模块的缓存都是 `Map<key, HTMLCanvasElement | HTMLCanvasElement[]>`，键空间有限但很大：
// 实测一个区域变体全部生成就有 947 张画布 / 107 MB，四种区域变体并存会到四倍量级。
// 这里给所有模块共用一份字节预算，超出后按插入顺序逐出最旧的条目。
//
// 逐出只从 Map 里摘掉引用、不重置画布尺寸——本帧可能仍在绘制它，把 width 归零会让 drawImage 抛异常。
// 像素缓冲交给 GC 回收，代价是多活几帧，但绝不会画出半张图或抛错。
const DEFAULT_BUDGET = 128 * 1024 * 1024;
let budget = DEFAULT_BUDGET;

/** 调整预算（诊断面板与测试用）；返回旧值 */
export function setCanvasBudget(bytes: number) { const old = budget; budget = Math.max(0, bytes); return old; }

/** 每个缓存各自的 key → 字节账本 */
const books = new WeakMap<Map<string, unknown>, Map<string, number>>();
let total = 0;

function bytesOf(v: unknown): number {
  if (!v) return 0;
  if (Array.isArray(v)) { let s = 0; for (const c of v) s += bytesOf(c); return s; }
  const c = v as HTMLCanvasElement;
  const w = c.width | 0, h = c.height | 0;
  return w > 0 && h > 0 ? w * h * 4 : 0;
}

/** 每次写入缓存后调用：记账并在超预算时逐出最旧条目 */
export function capCanvasCache<T>(cache: Map<string, T>, key: string) {
  let book = books.get(cache as Map<string, unknown>);
  if (!book) { book = new Map(); books.set(cache as Map<string, unknown>, book); }
  const b = bytesOf(cache.get(key));
  total -= book.get(key) ?? 0;
  book.set(key, b);
  total += b;
  // 至少留一条，避免把刚写入、马上就要用的这条挤掉
  while (total > budget && cache.size > 1) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined || oldest === key) break;
    cache.delete(oldest);
    total -= book.get(oldest) ?? 0;
    book.delete(oldest);
  }
}

/** 缓存被整体清空时同步账本（例如切换地图/季节） */
export function resetCanvasBudget<T>(cache: Map<string, T>) {
  const book = books.get(cache as Map<string, unknown>);
  if (book) { for (const b of book.values()) total -= b; book.clear(); }
}

/** 当前累计画布字节数（F3 面板/测试用） */
export function canvasBudgetUsed() { return total; }
/** 默认预算；测试与诊断可读 */
export const CANVAS_BUDGET_BYTES = DEFAULT_BUDGET;
