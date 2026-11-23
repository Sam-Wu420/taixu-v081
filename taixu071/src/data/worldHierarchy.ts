// 世界、地域与地图分别使用稳定 ID：人界（小千世界）、灵界（中千世界）、仙界（大千世界）。
export type WorldId = 'human' | 'spirit' | 'immortal';
export type PlaneTag = 'mortal' | 'spirit' | 'immortal';
export type HumanRegionId = 'tiannan' | 'luanxing' | 'dajin';
export type HumanMapId = 'renjie';
export type LegacyHumanMapId = 'tiannan' | 'luanxing' | 'dajin';
export const LEGACY_HUMAN_MAP_IDS: readonly LegacyHumanMapId[] = ['tiannan', 'luanxing', 'dajin'];
export type SpiritMapId = 'lingjie';
export type ImmortalMapId = 'xianjie';
export type AnyMapId = HumanMapId | SpiritMapId | ImmortalMapId;

export interface WorldLocation {
  worldId: WorldId;
  regionId: string;
  mapId: string;
}

export interface WorldRealmCap {
  maxRealm: number;
  maxStage: number;
  label: string;
}

export interface CrossWorldReturnCost {
  lifeCost: number;
  mpRatio: number;
  cooldownDays: number;
  desc: string;
}

export interface WorldDef {
  id: WorldId;
  name: string;
  scale: string;
  plane: PlaneTag;
  playable: boolean;
  realmCap: WorldRealmCap;
  maps: readonly string[];
  ascendTo?: WorldId;
  returnTo?: WorldId;
  returnCost?: CrossWorldReturnCost;
}

export const HUMAN_WORLD = { id: 'human', name: '人界', scale: '小千世界' } as const;
export const HUMAN_REGIONS: Record<HumanRegionId, { id: HumanRegionId; name: string }> = {
  tiannan: { id: 'tiannan', name: '天南' },
  luanxing: { id: 'luanxing', name: '乱星海' },
  dajin: { id: 'dajin', name: '大晋' },
};
export const HUMAN_MAP_LOCATIONS: Record<HumanMapId, WorldLocation> = {
  renjie: { worldId: 'human', regionId: 'renjie', mapId: 'renjie' },
};

export const WORLD_IDS: readonly WorldId[] = ['human', 'spirit', 'immortal'];

export const WORLDS: Record<WorldId, WorldDef> = {
  human: {
    id: 'human',
    name: '人界',
    scale: '小千世界',
    plane: 'mortal',
    playable: true,
    realmCap: { maxRealm: 5, maxStage: 0, label: '化神初期' },
    maps: ['renjie'],
    ascendTo: 'spirit',
  },
  spirit: {
    id: 'spirit',
    name: '灵界',
    scale: '中千世界',
    plane: 'spirit',
    playable: true,
    realmCap: { maxRealm: 8, maxStage: 2, label: '大乘后期' },
    maps: ['lingjie'],
    ascendTo: 'immortal',
    returnTo: 'human',
    returnCost: {
      lifeCost: 0,
      mpRatio: 0.8,
      cooldownDays: 3600,
      desc: '强渡空间节点逆返下界：须耗八成法力并震荡空间节点（不损寿元），且在下界期间修为受天道法则压制',
    },
  },
  immortal: {
    id: 'immortal',
    name: '仙界',
    scale: '大千世界',
    plane: 'immortal',
    playable: true,
    realmCap: { maxRealm: 12, maxStage: 2, label: '大罗巅峰' },
    maps: ['xianjie'],
    returnTo: 'spirit',
    returnCost: {
      lifeCost: 0,
      mpRatio: 0.9,
      cooldownDays: 18000,
      desc: '跨界逆溯星海天堑：须耗九成仙元并震荡界壁（不损寿元），受下界天地法则重重压制',
    },
  },
};

export const PLAYABLE_WORLD_IDS: readonly WorldId[] = WORLD_IDS.filter((id) => WORLDS[id].playable);

export function isWorldId(v: unknown): v is WorldId {
  return v === 'human' || v === 'spirit' || v === 'immortal';
}

export function isPlayableWorld(v: unknown): v is WorldId {
  return isWorldId(v) && WORLDS[v].playable;
}

export function worldDef(worldId: WorldId = 'human'): WorldDef {
  return WORLDS[worldId] ?? WORLDS.human;
}

export function worldOfMap(mapId: string): WorldId {
  if ((LEGACY_HUMAN_MAP_IDS as readonly string[]).includes(mapId)) return 'human';
  for (const id of WORLD_IDS) if (WORLDS[id].maps.includes(mapId)) return id;
  return 'human';
}

export function defaultMapOfWorld(worldId: WorldId = 'human'): string {
  return worldDef(worldId).maps[0] ?? 'renjie';
}

export function worldRealmCap(worldId: WorldId = 'human'): WorldRealmCap {
  return worldDef(worldId).realmCap;
}

/** 按指定界域封顶边界夹紧境界序号（用于当地经济、悬赏、小费等本地规则，不修改真实修为）。 */
export function cappedRealmInWorld(realm: number, worldId: WorldId = 'human'): number {
  const maxR = worldRealmCap(worldId).maxRealm;
  if (!Number.isFinite(realm)) return 0;
  return Math.max(0, Math.min(maxR, Math.floor(realm)));
}

/** 界域本地灵石通胀倍率（3^(clamp(realm, maxRealm) - 1)），避免高界来客把下界物价/赏金拉爆。 */
export function worldStoneScale(realm: number, worldId: WorldId = 'human'): number {
  return Math.pow(3, Math.max(0, cappedRealmInWorld(realm, worldId) - 1));
}

export function isAtWorldRealmCap(realm: number, stage: number, worldId: WorldId = 'human'): boolean {
  const cap = worldRealmCap(worldId);
  if (realm > cap.maxRealm) return true;
  if (realm === cap.maxRealm) return stage >= cap.maxStage;
  return false;
}

export function canAdvanceInWorld(realm: number, stage: number, worldId: WorldId = 'human'): boolean {
  return !isAtWorldRealmCap(realm, stage, worldId);
}

/** 高维空间对显现修为、遁速、神识范围的固有法则压制（同境界在更高界域被迫收敛，防止数值膨胀）。 */
export interface PlaneSpaceLaw {
  stat: number;
  speed: number;
  senseSpace: number;
  senseOuterStart: number;
  senseOuterSpan: number;
  senseDetailCap: number;
  senseAwareStart: number;
  senseAwareSpan: number;
}

const PLANE_SPACE_LAWS: Record<WorldId, PlaneSpaceLaw> = {
  human: { stat: 1, speed: 1, senseSpace: 1, senseOuterStart: 1800, senseOuterSpan: 1400, senseDetailCap: 2550, senseAwareStart: 3200, senseAwareSpan: 2800 },
  spirit: { stat: 0.4, speed: 0.78, senseSpace: 0.72, senseOuterStart: 1800, senseOuterSpan: 1950, senseDetailCap: 3050, senseAwareStart: 3600, senseAwareSpan: 4200 },
  immortal: { stat: 0.16, speed: 0.58, senseSpace: 0.52, senseOuterStart: 1800, senseOuterSpan: 2500, senseDetailCap: 3500, senseAwareStart: 4200, senseAwareSpan: 5600 },
};

export function planeSpaceLaw(worldId: WorldId = 'human'): PlaneSpaceLaw {
  return PLANE_SPACE_LAWS[worldId] ?? PLANE_SPACE_LAWS.human;
}

export function nativeWorldOfRealm(realm: number): WorldId {
  if (!Number.isFinite(realm) || realm <= 5) return 'human';
  if (realm <= 8) return 'spirit';
  return 'immortal';
}

/** 高界修士逆返下界时的天地法则额外排斥倍率；未超当前界域上限时恒为 1。 */
export function worldLawSuppression(realm: number, worldId: WorldId = 'human'): number {
  const cap = worldRealmCap(worldId);
  if (!Number.isFinite(realm) || realm <= cap.maxRealm) return 1;
  return Math.max(0.15, Math.pow(0.72, realm - cap.maxRealm));
}

/** 综合属性倍率 = 高维空间法则压制 ×（超界逆返下界排斥）。 */
export function worldStatScale(realm: number, worldId: WorldId = 'human'): number {
  const cap = worldRealmCap(worldId);
  if (!Number.isFinite(realm) || realm <= cap.maxRealm) return planeSpaceLaw(worldId).stat;
  return planeSpaceLaw(nativeWorldOfRealm(realm)).stat * worldLawSuppression(realm, worldId);
}

/** 综合遁速倍率 = 高维界域空间密度阻力（人界空间薄弱为 1，灵/仙界空间稳固沉重）。 */
export function worldSpeedScale(_realm: number, worldId: WorldId = 'human'): number {
  return planeSpaceLaw(worldId).speed;
}

/** 返回副本，避免调用者改写注册表。 */
export function humanMapLocation(mapId: HumanMapId): WorldLocation {
  return { ...HUMAN_MAP_LOCATIONS[mapId] };
}

// ---------------------------------------------------------------- v0.73 三界战争兵阶跃升
export type WarTier = 'logistics' | 'soldier' | 'captain' | 'commander' | 'grand';

export interface WarTierBand {
  worldId: WorldId;
  logisticsMaxRealm: number;
  soldierMinRealm: number;
  soldierMaxRealm: number;
  soldierMinStage: number; // 仅当 realm === soldierMinRealm 时生效（如人界炼气 6 层起参战）
  captainMinRealm: number;
  captainMaxRealm: number;
  commanderMinRealm: number;
  commanderMaxRealm: number;
  grandMinRealm: number;
}

const WAR_BANDS: Record<WorldId, WarTierBand> = {
  // 人界：炼气1–5/凡人杂役 · 炼气6–13战兵 · 筑基阵眼 · 结丹统帅 · 元婴/化神老祖
  human: {
    worldId: 'human',
    logisticsMaxRealm: 1,
    soldierMinRealm: 1,
    soldierMaxRealm: 1,
    soldierMinStage: 5,
    captainMinRealm: 2,
    captainMaxRealm: 2,
    commanderMinRealm: 3,
    commanderMaxRealm: 3,
    grandMinRealm: 4,
  },
  // 灵界：筑基及以下皆杂役 · 结丹/元婴炮灰战兵 · 化神阵眼 · 炼虚/合体统帅 · 大乘老祖
  spirit: {
    worldId: 'spirit',
    logisticsMaxRealm: 2,
    soldierMinRealm: 3,
    soldierMaxRealm: 4,
    soldierMinStage: 0,
    captainMinRealm: 5,
    captainMaxRealm: 5,
    commanderMinRealm: 6,
    commanderMaxRealm: 7,
    grandMinRealm: 8,
  },
  // 仙界：合体及以下皆杂役 · 大乘炮灰战兵 · 真仙/玄仙阵眼 · 金仙/太乙统帅 · 大罗老祖
  immortal: {
    worldId: 'immortal',
    logisticsMaxRealm: 7,
    soldierMinRealm: 8,
    soldierMaxRealm: 8,
    soldierMinStage: 0,
    captainMinRealm: 9,
    captainMaxRealm: 10,
    commanderMinRealm: 11,
    commanderMaxRealm: 11,
    grandMinRealm: 12,
  },
};

export function warTierBand(worldId: WorldId = 'human'): WarTierBand {
  return WAR_BANDS[worldId] ?? WAR_BANDS.human;
}

/** 依界域把修士境界严格映射到战争编制阶层（灵界筑基老实做杂役、仙界大乘作炮灰）。 */
export function worldWarTier(worldId: WorldId = 'human', realm = 0, stage = 5): WarTier {
  const b = warTierBand(worldId);
  if (realm >= b.grandMinRealm) return 'grand';
  if (realm >= b.commanderMinRealm && realm <= b.commanderMaxRealm) return 'commander';
  if (realm >= b.captainMinRealm && realm <= b.captainMaxRealm) return 'captain';
  if (realm >= b.soldierMinRealm && realm <= b.soldierMaxRealm) {
    if (worldId === 'human' && realm === b.soldierMinRealm && stage < b.soldierMinStage) return 'logistics';
    return 'soldier';
  }
  return 'logistics';
}

export function canFightAsWarSoldier(worldId: WorldId, realm: number, stage = 5): boolean {
  return worldWarTier(worldId, realm, stage) !== 'logistics';
}

export function canLeadWarFormation(worldId: WorldId, realm: number): boolean {
  const t = worldWarTier(worldId, realm, 9);
  return t === 'captain' || t === 'commander' || t === 'grand';
}

const WAR_TIER_LABEL: Record<WarTier, string> = {
  logistics: '后勤杂役',
  soldier: '战兵',
  captain: '阵眼队长',
  commander: '战区统帅',
  grand: '镇派老祖',
};

export function warTierLabel(tier: WarTier): string {
  return WAR_TIER_LABEL[tier];
}

const WORLD_CURRENCY: Record<WorldId, { id: string; name: string }> = {
  human: { id: 'mat_lingshi', name: '灵石' },
  spirit: { id: 'mat_lingjing', name: '灵晶' },
  immortal: { id: 'mat_xianyuan', name: '仙元石' },
};

export interface PlaneMeta {
  worldId: WorldId;
  planeTag: PlaneTag;
  currencyId: string;
  currencyName: string;
  /** 1 枚本界通货约折合多少下界基础灵石（人界 1 / 灵界 60 / 仙界 200） */
  currencyExchange: number;
  /** 本界常规奇遇 / 敌修境界区间 */
  encounterRange: readonly [number, number];
  /** 本界高阶首领 / 试炼境界区间 */
  eliteRange: readonly [number, number];
  /** 本界通用人形 / 阴魂模板 ID（对应 enemies.ts） */
  defaultEnemies: {
    rogue: string;
    eliteRogue: string;
    evil: string;
    spirit: string;
  };
  /** 本界默认战备 / 回复丹药 ID（对应 items.ts） */
  defaultPills: {
    huiqi: string;
    liaoshang: string;
  };
  /** 本界随机坊市 / 城池名（用于悬赏、商队等动态事件） */
  townNames: readonly string[];
  /** 本界降临 / 重返枢纽地点 */
  hub: { map: string; locId: string };
  /** 危险度基准与城镇庇护衰减 */
  dangerLaw: { base: number; damp: number; stepDiv: number };
  /** 本界野生危险度区间 [minK, maxK] */
  dangerK: readonly [number, number];
  /** 本界主流正道宗门/势力 ID */
  factions: readonly string[];
}

export const PLANE_META: Record<WorldId, PlaneMeta> = {
  human: {
    worldId: 'human',
    planeTag: 'mortal',
    currencyId: 'mat_lingshi',
    currencyName: '灵石',
    currencyExchange: 1,
    encounterRange: [1, 4],
    eliteRange: [2, 5],
    defaultEnemies: {
      rogue: 'bandit',
      eliteRogue: 'zhujixiu',
      evil: 'moxiu',
      spirit: 'yinhun',
    },
    defaultPills: {
      huiqi: 'pill_huiqi',
      liaoshang: 'pill_liaoshang',
    },
    townNames: ['白石镇', '嘉禾城', '南屏谷', '观星城', '云梦山', '黑石镇'],
    hub: { map: 'renjie', locId: 'huangfeng' },
    dangerLaw: { base: 0, damp: 2.2, stepDiv: 1.5 },
    dangerK: [0, 9.6],
    factions: ['huangfeng', 'yanyue', 'qingxu', 'luoyun', 'taiyi', 'xinggong'],
  },
  spirit: {
    worldId: 'spirit',
    planeTag: 'spirit',
    currencyId: 'mat_lingjing',
    currencyName: '灵晶',
    currencyExchange: 60,
    encounterRange: [4, 7],
    eliteRange: [5, 8],
    defaultEnemies: {
      rogue: 'ling_sanxiu',
      eliteRogue: 'ling_sanxiu',
      evil: 'ling_moyuan',
      spirit: 'ling_moyuan_zu',
    },
    defaultPills: {
      huiqi: 'pill_lingjing_huiqi',
      liaoshang: 'pill_lingjing_liaoshang',
    },
    townNames: ['天渊城', '雷鸣仙港', '百族互市', '蛮荒外营'],
    hub: { map: 'lingjie', locId: 'tianyuan_feishengtai' },
    dangerLaw: { base: 8.0, damp: 1.5, stepDiv: 0.95 },
    dangerK: [8.0, 14.3],
    factions: ['taichu_sg', 'yaohuang_dian', 'leiyin_gs', 'tiangong_lg', 'leihai_dian'],
  },
  immortal: {
    worldId: 'immortal',
    planeTag: 'immortal',
    currencyId: 'mat_xianyuan',
    currencyName: '仙元石',
    currencyExchange: 200,
    encounterRange: [9, 11],
    eliteRange: [9, 12],
    defaultEnemies: {
      rogue: 'xian_sanxiu',
      eliteRogue: 'xian_xunxian_shizhe',
      evil: 'xian_huimo',
      spirit: 'xian_huijie_shixiu',
    },
    defaultPills: {
      huiqi: 'pill_xian_yunshen',
      liaoshang: 'pill_xian_yunshen',
    },
    townNames: ['北寒仙城', '太乙剑坊', '渊墟灰市'],
    hub: { map: 'xianjie', locId: 'beihan_xilianchi' },
    dangerLaw: { base: 10.0, damp: 1.0, stepDiv: 1.0 },
    dangerK: [17.6, 21.0],
    factions: ['guanghan_xg', 'yuhuang_xg', 'taiyi_jt', 'lunhui_gd'],
  },
};

export function planeMeta(worldId: WorldId = 'human'): PlaneMeta {
  return PLANE_META[worldId] ?? PLANE_META.human;
}

export function planeExchangeRate(worldId: WorldId = 'human'): number {
  return planeMeta(worldId).currencyExchange;
}

/** 将以人界灵石为基准计价的数额动态折算为目标界域的本地通货数额。 */
export function scaleFromMortalStones(mortalAmount: number, worldId: WorldId = 'human', min = 1): number {
  const rate = planeExchangeRate(worldId);
  if (rate <= 1) return Math.max(min, Math.round(mortalAmount));
  return Math.max(min, Math.round(mortalAmount / rate));
}

/** 将指定界域通货折算回等价人界基础灵石价值（用于跨界资产统计/战争补给折算）。 */
export function toMortalStones(localAmount: number, worldId: WorldId = 'human'): number {
  return Math.round(localAmount * planeExchangeRate(worldId));
}

export function planeEncounterRange(worldId: WorldId = 'human', includeCap = false): readonly [number, number] {
  const m = planeMeta(worldId);
  return includeCap ? m.eliteRange : m.encounterRange;
}

export function clampWorldRealm(realm: number, worldId: WorldId = 'human', includeCap = false): number {
  const [lo, hi] = planeEncounterRange(worldId, includeCap);
  if (!Number.isFinite(realm)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(realm)));
}

export function planeDefaultEnemyId(worldId: WorldId = 'human', role: keyof PlaneMeta['defaultEnemies'] = 'rogue'): string {
  return planeMeta(worldId).defaultEnemies[role];
}

export function planeDefaultPillId(worldId: WorldId = 'human', kind: keyof PlaneMeta['defaultPills'] = 'liaoshang'): string {
  return planeMeta(worldId).defaultPills[kind];
}

export function planeTownNames(worldId: WorldId = 'human'): readonly string[] {
  return planeMeta(worldId).townNames;
}

export function planeEnemyTag(worldId: WorldId = 'human'): PlaneTag {
  return planeMeta(worldId).planeTag;
}

export function planeFactions(worldId: WorldId = 'human'): readonly string[] {
  return planeMeta(worldId).factions;
}

export function worldCurrencyId(worldId: WorldId = 'human'): string {
  return planeMeta(worldId).currencyId;
}
export function worldCurrencyName(worldId: WorldId = 'human'): string {
  return planeMeta(worldId).currencyName;
}
export function worldPlaneOfRealm(realm: number): WorldId {
  if (realm >= 9) return 'immortal';
  if (realm >= 6) return 'spirit';
  return 'human';
}
export function worldPlaneOrder(worldId: WorldId = 'human'): number {
  return worldId === 'immortal' ? 2 : worldId === 'spirit' ? 1 : 0;
}

