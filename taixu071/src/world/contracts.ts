import { ACTIVE_MAP, type MapId } from '../data/world';
import { LEGACY_HUMAN_MAP_IDS, worldOfMap, type LegacyHumanMapId, type WorldId } from '../data/worldHierarchy';

// ============================================================================
// 1. 时间契约（全游戏统一历法：1 月 = 30 日，1 年 = 360 日）
// ============================================================================
export const DAYS_PER_MONTH = 30;
export const DAYS_PER_YEAR = 360;

export function yearOfDay(day: number): number {
  if (!Number.isFinite(day)) return 1;
  return Math.floor(day / DAYS_PER_YEAR) + 1;
}

export function dayOfYearParts(day: number): { y: number; m: number; d: number } {
  const safeDay = Number.isFinite(day) ? Math.max(0, Math.floor(day)) : 0;
  const doy = safeDay % DAYS_PER_YEAR;
  return {
    y: Math.floor(safeDay / DAYS_PER_YEAR) + 1,
    m: Math.floor(doy / DAYS_PER_MONTH) + 1,
    d: (doy % DAYS_PER_MONTH) + 1,
  };
}

// ============================================================================
// 2. 界域契约（人界旧三图 -> renjie 收敛 & 跨界归一）
// ============================================================================
export function isLegacyHumanMapId(map: unknown): map is LegacyHumanMapId {
  return typeof map === 'string' && (LEGACY_HUMAN_MAP_IDS as readonly string[]).includes(map);
}

export function normalizeWorldMapId(map?: string | null): MapId {
  if (!map) return ACTIVE_MAP;
  if (isLegacyHumanMapId(map)) return 'renjie';
  if (map === 'renjie' || map === 'lingjie' || map === 'xianjie') return map;
  return ACTIVE_MAP;
}

export function isSameWorldMap(a?: string | null, b?: string | null): boolean {
  return normalizeWorldMapId(a) === normalizeWorldMapId(b);
}

export function isActiveWorldMap(map?: string | null, activeMap: string = ACTIVE_MAP): boolean {
  if (!map) return true;
  return normalizeWorldMapId(map) === normalizeWorldMapId(activeMap);
}

export function worldOfNormalizedMap(map?: string | null): WorldId {
  return worldOfMap(normalizeWorldMapId(map));
}

// ============================================================================
// 3. 到场半径与在途契约（导航 / 传音求救 / 友人邀约 / 传送阵）
// ============================================================================
/** 自动寻路 / 御剑抵达目的地精确清除半径 */
export const DESTINATION_ARRIVE_RADIUS = 24;
/** 在途锁定半径（判定 destination / autoFlight 是否正指向该事件，防止途经过期撤场） */
export const EN_ROUTE_MATCH_RADIUS = 120;
/** 指路「指」标清除及洞府近距阈值 */
export const GUIDE_ARRIVE_RADIUS = 360;
/** 友人邀约 / 求援近身接战触发半径 */
export const INVITE_ARRIVE_RADIUS = 420;
/** 传音玉符求救 / 战书 / 红颜求援到场接敌半径 */
export const SOS_ARRIVE_RADIUS = 1500;
/** 上古 / 跨域传送阵交互触发半径 */
export const PORTAL_INTERACT_RADIUS = 1500;

export function withinArrivalRadius(px: number, py: number, tx: number, ty: number, radius: number): boolean {
  if (![px, py, tx, ty, radius].every(Number.isFinite) || radius < 0) return false;
  return Math.hypot(tx - px, ty - py) <= radius;
}

export interface RouteTargetLike {
  x: number;
  y: number;
}

export interface EnRouteGameLike {
  destination?: RouteTargetLike | null;
  autoFlight?: RouteTargetLike | null;
}

export function isEnRouteTo(
  game: EnRouteGameLike,
  x: number,
  y: number,
  map?: string | null,
  radius: number = EN_ROUTE_MATCH_RADIUS,
  activeMap: string = ACTIVE_MAP,
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (map && !isActiveWorldMap(map, activeMap)) return false;
  const d = game.destination;
  if (d && withinArrivalRadius(d.x, d.y, x, y, radius)) return true;
  const af = game.autoFlight;
  if (af && withinArrivalRadius(af.x, af.y, x, y, radius)) return true;
  return false;
}
