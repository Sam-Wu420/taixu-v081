import { planeSpaceLaw, type WorldId } from '../data/worldHierarchy';

/** 只压缩世界距离，不改变用于神识对抗、功法和存档的神识属性。 */
export const SENSE_SOFT_START = 1800;
export const SENSE_SOFT_SPAN = 1400;
export const SENSE_BURST_MULTIPLIER = 1.4;
export function compressSenseRadius(radius: number, worldId: WorldId = 'human'): number {
  if (Number.isNaN(radius) || radius <= 0) return 0;
  const law = planeSpaceLaw(worldId);
  const start = law.senseOuterStart;
  if (radius <= start) return radius;
  return start + law.senseOuterSpan * -Math.expm1(-(radius - start) / law.senseOuterSpan);
}
export function baseSenseRange(sense: number, multiplier = 1, zeroRange = 380, worldId: WorldId = 'human'): number {
  const s = Number.isNaN(sense) || sense <= 0 ? 0 : sense;
  const mul = Number.isFinite(multiplier) && multiplier >= 0 ? multiplier : 1;
  const spaceK = planeSpaceLaw(worldId).senseSpace;
  return compressSenseRadius((s === 0 ? zeroRange : 450 + 55 * Math.sqrt(s)) * mul * spaceK, worldId);
}
/** 精细实体范围独立于探察圈，按境界与外圈同步成长（仍严格小于外圈，保留内外两层神识）。仅视觉与精确锁定使用。 */
export function detailSenseRange(outer: number, realm = 0, worldId: WorldId = 'human'): number {
  if (!Number.isFinite(outer) || outer <= 0) return 0;
  const law = planeSpaceLaw(worldId);
  const r = Number.isFinite(realm) ? Math.max(0, Math.min(12, Math.floor(realm))) : 0;
  // 随境界提升内圈占比（0.68 → 0.86）与基础增幅，同时按界域与境界抬高软上限：
  // 人界化神封顶 2550px；灵界大乘可稳步大一圈至 3050px；仙界大罗至 3500px，同时严格保留 outer * 0.86 的外圈余量。
  const ratio = Math.min(0.86, 0.68 + r * 0.03);
  const realmBonus = r * 80;
  const capByRealm = worldId === 'immortal'
    ? 1550 + Math.min(12, r) * ((law.senseDetailCap - 1550) / 12)
    : worldId === 'spirit'
      ? 1550 + Math.min(8, r) * ((law.senseDetailCap - 1550) / 8)
      : 1550 + Math.min(5, r) * 200;
  const realmCap = Math.min(law.senseDetailCap, capByRealm);
  return Math.min(outer * 0.86, realmCap, outer * ratio + realmBonus);
}

/** 信息探察专用：人界 3200→6000，灵界 3600→7800，仙界 4200→9800；受界域空间灵压折减，不用于生成或解雾。 */
export function awarenessBaseRange(sense: number, multiplier = 1, worldId: WorldId = 'human'): number {
  const s = Number.isNaN(sense) || sense <= 0 ? 0 : sense;
  const mul = Number.isFinite(multiplier) && multiplier >= 0 ? multiplier : 1;
  const law = planeSpaceLaw(worldId);
  const raw = (s === 0 ? 380 : 450 + 55 * Math.sqrt(s)) * mul * law.senseSpace;
  return raw <= law.senseAwareStart
    ? raw
    : law.senseAwareStart + law.senseAwareSpan * -Math.expm1(-(raw - law.senseAwareStart) / law.senseAwareSpan);
}

/** 常态仅感知精细圈以外的一小部分潜力；外放才向四方铺开，确保外圈始终显著大于内圈（除非主动敛息）。 */
export function effectiveAwarenessRange(full: number, detail: number, burst: boolean, concealed: boolean): number {
  if (!Number.isFinite(full) || !Number.isFinite(detail) || full < 0 || detail < 0) return 0;
  if (concealed) return detail;
  if (burst) return Math.max(detail * 1.38, full * 1.15);
  const maximum = Math.max(detail * 1.22, full);
  return Math.max(detail * 1.1, detail + (maximum - detail) * 0.25);
}

/** 最远缩放时让完整神识外圈刚好落在短边内；阈值随视口尺寸与当前完整神识半径动态变化。 */
export function senseFitZoom(radius: number, width: number, height: number, minZoom = 0.02, maxZoom = 2.5, margin = 16, offsetX = 0, offsetY = 0): number {
  if (![radius, width, height, minZoom, maxZoom, margin, offsetX, offsetY].every(Number.isFinite) || radius <= 0 || width <= 0 || height <= 0) return minZoom;
  // 玩家不一定正好在画布中心（飞行 / 战斗自动运镜会偏镜头）；按更不利的一侧留足完整圆环空间。
  const fitX = (width / 2 - Math.max(0, margin)) / (radius + Math.abs(offsetX));
  const fitY = (height / 2 - Math.max(0, margin)) / (radius + Math.abs(offsetY));
  return Math.max(minZoom, Math.min(maxZoom, fitX, fitY));
}
