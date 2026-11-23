// 数量与灵石暂以安全整数表示。超过上限时拒绝，不静默截断。
export function validCount(n: unknown): n is number { return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0; }
export function bagTotals(bag: readonly { id?: unknown; n?: unknown }[]): Map<string, number> | null {
  const totals = new Map<string, number>();
  for (const item of bag) {
    if (!item || typeof item.id !== 'string' || !item.id || !validCount(item.n)) return null;
    const total = (totals.get(item.id) ?? 0) + item.n;
    if (!Number.isSafeInteger(total)) return null;
    totals.set(item.id, total);
  }
  return totals;
}
