import { enemyPerceptibility } from './senseSignals';
/** 极远景进入/退出使用不同阈值，避免缩放停在边界时反复创建装饰。仅在 GPU 地表可用时启用。 */
export function farSummaryMode(previous: boolean, zoom: number, groundReady: boolean): boolean {
  if (!groundReady || !Number.isFinite(zoom) || zoom <= 0) return false;
  return previous ? zoom < 0.055 : zoom < 0.045;
}

/** 缩放迟滞：避免在阈值附近反复切换名牌与标记。 */
export function farMarkerMode(previous: boolean | undefined, zoom: number): boolean {
  if (!Number.isFinite(zoom) || zoom <= 0) return false;
  return previous === undefined ? zoom < 0.35 : previous ? zoom < 0.38 : zoom < 0.32;
}
/** 只有明确产生敌意才标红；友方优先，未知关系不提前暴露。 */
export function markerRelation(unit: { ally?: boolean; aggro?: boolean }): 'ally' | 'hostile' | 'unknown' {
  return unit.ally ? 'ally' : unit.aggro ? 'hostile' : 'unknown';
}

/** 可见敌人的点击命中：低缩放时保留至少 14 CSS 像素半径，选择屏幕上最近者。 */
export function enemyAtPointer<T extends { x: number; y: number; dead?: boolean; boss?: boolean; hideT?: number; aggro?: boolean; def?: { hide?: boolean }; affix?: { yinOn?: boolean } }>(
  units: readonly T[], x: number, y: number, zoom: number, playerX: number, playerY: number, senseRadius: number, burst: boolean, locked: T | null = null, cycle = false,
): T | null {
  if (![x,y,zoom,playerX,playerY,senseRadius].every(Number.isFinite) || zoom <= 0 || senseRadius <= 0) return null;
  const hit = Math.max(70, 14 / zoom); let best: T | null = null, bestD = hit;
  const candidates: { unit: T; distance: number; order: number }[] = [];
  for (const u of units) {
    if (u.dead || (u.hideT ?? 0) > 0 || !Number.isFinite(u.x) || !Number.isFinite(u.y)) continue;
    if (enemyPerceptibility(u, playerX, playerY, senseRadius, burst) <= .05) continue;
    const d = Math.hypot(u.x-x,u.y-30-y);
    if (cycle && d < hit) candidates.push({ unit: u, distance: d, order: candidates.length });
    const priority = (v: T) => v === locked ? 0 : v.boss ? 1 : v.aggro ? 2 : 3;
    if (d < bestD || (best && d === bestD && priority(u) < priority(best))) { bestD = d; best = u; }
  }
  if (cycle && candidates.length > 1) {
    candidates.sort((a, b) => a.distance - b.distance || a.order - b.order);
    const i = candidates.findIndex((item) => item.unit === locked);
    if (i >= 0) return candidates[(i + 1) % candidates.length].unit;
  }
  return best;
}
