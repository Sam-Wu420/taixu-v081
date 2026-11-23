// 境界体系（人界：凡人 → 炼气 → 筑基 → 结丹 → 元婴 → 化神；后续灵界/仙界由 worldHierarchy.worldRealmCap 放开上限）
import { TUNING } from './tuning';
import { worldDef, worldRealmCap, isAtWorldRealmCap, canAdvanceInWorld, worldSpeedScale, type WorldId } from './worldHierarchy';
export interface RealmDef {
  id: number;
  name: string;
  stages: string[];
  hp: number[]; mp: number[]; atk: number[]; def: number[]; sense: number[];
  life: number;          // 寿元（年）
  speed: number;         // 大地图基础速度
  fly: boolean;          // 能否御器飞行（跨海、无视地形）
  expDays: number[];     // 每个小境界所需修为（以“基础速度修炼天数”计）
  color: string;
}

const L13 = ['一层', '二层', '三层', '四层', '五层', '六层', '七层', '八层', '九层', '十层', '十一层', '十二层', '十三层'];
const ST3 = ['初期', '中期', '后期'];
const ST_JINXIAN = ['初期', '中期', '太乙圆满'];
const ST_DALUO = ['初期', '中期', '巅峰'];

export const REALMS: RealmDef[] = [
  { id: 0, name: '凡人', stages: [''], hp: [60], mp: [10], atk: [6], def: [1], sense: [0], life: 70, speed: 130, fly: false, expDays: [30], color: '#8a8070' },
  {
    id: 1, name: '炼气', stages: L13,
    hp: L13.map((_, s) => 100 + 16 * s), mp: L13.map((_, s) => 60 + 12 * s), atk: L13.map((_, s) => 10 + 2.2 * s),
    def: L13.map((_, s) => 3 + 0.7 * s), sense: L13.map((_, s) => 20 + 3 * s), life: 120, speed: 175, fly: false,
    expDays: L13.map((_, s) => Math.round((36 + 11 * s) * 4.3)), color: '#6f8f6a',
  },
  { id: 2, name: '筑基', stages: ST3, hp: [520, 680, 880], mp: [280, 350, 440], atk: [46, 60, 78], def: [15, 19, 24], sense: [80, 120, 170], life: 220, speed: 300, fly: true, expDays: [10400, 14800, 20400], color: '#4f7f8f' },
  { id: 3, name: '结丹', stages: ST3, hp: [2300, 3000, 3900], mp: [1050, 1350, 1750], atk: [185, 235, 305], def: [55, 70, 90], sense: [300, 450, 650], life: 500, speed: 440, fly: true, expDays: [29000, 41000, 57000], color: '#b08a3a' },
  { id: 4, name: '元婴', stages: ST3, hp: [9200, 12200, 16200], mp: [4100, 5400, 7100], atk: [720, 920, 1220], def: [200, 260, 340], sense: [1100, 1600, 2300], life: 1000, speed: 610, fly: true, expDays: [88000, 126000, 176000], color: '#8a4fa0' },
  // 化神（人界止步化神初期；灵界化灵洗髓后开放中期/后期及更高境界）
  { id: 5, name: '化神', stages: ST3, hp: [42000, 56000, 74000], mp: [18500, 24500, 32500], atk: [3200, 4200, 5600], def: [920, 1200, 1600], sense: [4800, 6800, 9600], life: 2000, speed: 850, fly: true, expDays: [380000, 520000, 720000], color: '#c0392b' },
  // 灵界三阶：炼虚 / 合体 / 大乘
  { id: 6, name: '炼虚', stages: ST3, hp: [145000, 190000, 250000], mp: [62000, 80000, 105000], atk: [10800, 14000, 18200], def: [3100, 4000, 5200], sense: [14000, 18000, 23000], life: 5000, speed: 1150, fly: true, expDays: [1100000, 1500000, 2000000], color: '#d48a28' },
  { id: 7, name: '合体', stages: ST3, hp: [400000, 520000, 680000], mp: [165000, 215000, 280000], atk: [29000, 37500, 48500], def: [8200, 10600, 13800], sense: [32000, 40000, 50000], life: 12000, speed: 1480, fly: true, expDays: [2800000, 3700000, 4900000], color: '#2b9e8f' },
  { id: 8, name: '大乘', stages: ST3, hp: [1050000, 1380000, 1800000], mp: [420000, 550000, 720000], atk: [74000, 96000, 124000], def: [21000, 27000, 35000], sense: [72000, 92000, 115000], life: 30000, speed: 1880, fly: true, expDays: [6600000, 8600000, 11200000], color: '#7a52d4' },
  // 仙界四阶：真仙 / 玄仙 / 金仙（太乙） / 大罗
  { id: 9, name: '真仙', stages: ST3, hp: [2200000, 2900000, 3800000], mp: [880000, 1150000, 1500000], atk: [152000, 198000, 256000], def: [44000, 57000, 74000], sense: [150000, 195000, 250000], life: 100000, speed: 2400, fly: true, expDays: [15000000, 19500000, 25000000], color: '#3b82d6' },
  { id: 10, name: '玄仙', stages: ST3, hp: [4500000, 5800000, 7500000], mp: [1800000, 2320000, 3000000], atk: [305000, 395000, 510000], def: [88000, 114000, 148000], sense: [320000, 410000, 520000], life: 300000, speed: 3000, fly: true, expDays: [32000000, 42000000, 54000000], color: '#00a8b5' },
  { id: 11, name: '金仙', stages: ST_JINXIAN, hp: [9000000, 11500000, 14800000], mp: [3600000, 4600000, 5900000], atk: [610000, 780000, 1000000], def: [176000, 226000, 290000], sense: [650000, 820000, 1050000], life: 1000000, speed: 3700, fly: true, expDays: [70000000, 90000000, 118000000], color: '#e5a922' },
  { id: 12, name: '大罗', stages: ST_DALUO, hp: [18000000, 23000000, 30000000], mp: [7200000, 9200000, 12000000], atk: [1200000, 1550000, 2000000], def: [350000, 450000, 580000], sense: [1350000, 1750000, 2250000], life: 5000000, speed: 4600, fly: true, expDays: [150000000, 195000000, 260000000], color: '#f4d06f' },
];

export const EXP_PER_DAY = 10; // 基础修炼：每天 10 点修为

// 等级由境界表的阶段数累计得到；凡人占等级 0。当前人界仍以化神初期封顶。
// 数据表扩充时转换函数随之扩充，不意味着已经实现或开放后续世界。
function indexIn(value: number, max: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0;
}
/** 安全读取境界定义（表外境界回落到当前表最高阶，避免裸索引崩溃）。 */
export function realmDef(realm: number): RealmDef {
  return REALMS[indexIn(realm, REALMS.length - 1)];
}
/** 地面慢行（未疾行）统一速度上限：动态锚定首个修行境界（炼气期）的基础步速。 */
export function slowWalkCap(): number {
  return (REALMS.find((r) => r.id > 0) ?? REALMS[0]).speed;
}
/** 御剑慢行（未催动遁光）的动态巡航上限：按当前境界、飞行法器及所在界域空间法则做亚线性压缩。 */
export function flyCruiseCap(realm: number, flightMul = 1, worldId: WorldId = 'human'): number {
  const flyAnchor = REALMS.find((r) => r.fly) ?? REALMS[REALMS.length - 1];
  const anchorCruise = flyAnchor.speed * TUNING.move.flyMul;
  const realmRatio = Math.max(0.5, realmDef(realm).speed / Math.max(1, flyAnchor.speed));
  const gearRatio = Math.max(1, flightMul);
  return anchorCruise
    * Math.pow(realmRatio, TUNING.move.cruiseRealmExp)
    * Math.pow(gearRatio, TUNING.move.cruiseGearExp)
    * worldSpeedScale(realm, worldId);
}
export function realmName(realm: number, stage: number) {
  if (!Number.isInteger(realm) || !REALMS[realm]) return '???';
  const r = REALMS[realm];
  if (realm === 0) return r.name;
  return r.name + (r.stages[indexIn(stage, r.stages.length - 1)] ?? '');
}

export function expNeed(realm: number, stage: number) {
  const R = REALMS[indexIn(realm, REALMS.length - 1)];
  return Math.round(R.expDays[indexIn(stage, R.expDays.length - 1)] * TUNING.expPerDay);
}

export function levelOf(realm: number, stage: number) {
  const r = indexIn(realm, REALMS.length - 1);
  if (r === 0) return 0;
  let level = 1;
  for (let i = 1; i < r; i++) level += REALMS[i].stages.length;
  return level + indexIn(stage, REALMS[r].stages.length - 1);
}

export function fromLevel(level: number): [number, number] {
  let left = Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0;
  if (left === 0) return [0, 0];
  for (let r = 1; r < REALMS.length; r++) {
    const n = REALMS[r].stages.length;
    if (left <= n) return [r, left - 1];
    left -= n;
  }
  const last = REALMS.length - 1;
  return [last, Math.max(0, REALMS[last].stages.length - 1)];
}

// 灵根
export interface RootDef { id: string; name: string; rate: number; desc: string; weight: number }
export const ROOTS: RootDef[] = [
  { id: 'heaven', name: '天灵根', rate: 2.4, desc: '单一属性灵根，修炼一日千里，无大瓶颈桎梏', weight: 1 },
  { id: 'variant', name: '异灵根', rate: 1.8, desc: '风雷冰等变异灵根，修炼极快，破境颇具优势', weight: 2 },
  { id: 'true', name: '真灵根', rate: 1.35, desc: '双属性灵根，宗门争抢的好苗子', weight: 10 },
  { id: 'triple', name: '三灵根', rate: 0.85, desc: '资质平平', weight: 30 },
  { id: 'fake', name: '伪灵根', rate: 0.45, desc: '四五属性灵根，修炼极慢，几乎无缘大道', weight: 40 },
];

const ROOT_BREAK_BONUS: Record<string, number[]> = {
  heaven: [0, 0.20, 0.30, 0.08, 0.02, 0.03, 0.03, 0.03, 0.03, 0.02, 0.02, 0.02],
  variant: [0, 0.12, 0.15, 0.05, 0.015, 0.02, 0.02, 0.02, 0.02, 0.015, 0.015, 0.015],
  true: [0, 0.06, 0.05, 0.02, 0.008, 0.01, 0.01, 0.01, 0.01, 0.008, 0.008, 0.008],
  triple: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  fake: [0, -0.05, -0.05, -0.02, 0, 0, 0, 0, 0, 0, 0, 0],
};

/** 灵根对冲击下一大境界的加成/减成（主角与 NPC 共用同一套资质口径） */
export function rootBreakBonus(rootId: string | undefined, realm: number): number {
  const row = ROOT_BREAK_BONUS[rootId ?? 'triple'] ?? ROOT_BREAK_BONUS.triple;
  return row[realm] ?? 0;
}

/** 按境界与确定性种子抽取 NPC 灵根（高阶修士资质整体更佳） */
export function pickNpcRoot(realm: number, seed: number): string {
  const x = (((seed ^ 0x9e3779b9) >>> 0) % 10000) / 10000;
  if (realm >= 4) return x < 0.22 ? 'heaven' : x < 0.45 ? 'variant' : x < 0.88 ? 'true' : 'triple';
  if (realm === 3) return x < 0.08 ? 'heaven' : x < 0.22 ? 'variant' : x < 0.68 ? 'true' : x < 0.94 ? 'triple' : 'fake';
  if (realm === 2) return x < 0.02 ? 'heaven' : x < 0.09 ? 'variant' : x < 0.45 ? 'true' : x < 0.85 ? 'triple' : 'fake';
  return x < 0.01 ? 'heaven' : x < 0.035 ? 'variant' : x < 0.18 ? 'true' : x < 0.54 ? 'triple' : 'fake';
}

export function isAtRealmCap(realm: number, stage: number, worldId: WorldId = 'human') {
  return isAtWorldRealmCap(realm, stage, worldId);
}
export function canBreakRealm(realm: number, stage: number, worldId: WorldId = 'human') {
  return canAdvanceInWorld(realm, stage, worldId);
}
export function realmCapLabel(worldId: WorldId = 'human') {
  return worldRealmCap(worldId).label;
}
export function realmCapDesc(worldId: WorldId = 'human') {
  const w = worldDef(worldId);
  return `${w.name}天地元气与法则所限，最高止步「${w.realmCap.label}」`;
}

// 小境界突破瓶颈所需（不含大境界）
export interface Bottleneck { item: string; count: number }
export function smallBottleneck(realm: number, stage: number, worldId: WorldId = 'human'): Bottleneck | null {
  if (isAtWorldRealmCap(realm, stage, worldId)) return null;
  // 从 stage -> stage+1 所需
  if (realm === 1) {
    if (stage === 5) return { item: 'pill_juqi', count: 1 };
    if (stage === 9) return { item: 'pill_juqi', count: 2 };
    return null;
  }
  if (realm === 2) return { item: 'pill_juling', count: stage + 1 };
  if (realm === 3) return { item: 'pill_ningyuan', count: stage + 1 };
  if (realm === 4) return { item: 'pill_peiying', count: stage + 1 };
  if (realm === 5) return { item: 'pill_zifu', count: stage + 1 };
  if (realm === 6) return { item: 'pill_huaxu', count: stage + 1 };
  if (realm === 7) return { item: 'pill_ningxiang', count: stage + 1 };
  if (realm === 8) return { item: 'pill_pojie', count: stage + 1 };
  if (realm === 9) return { item: 'pill_zhenxian', count: stage + 1 };
  if (realm === 10) return { item: 'pill_xuanxian', count: stage + 1 };
  if (realm === 11) return { item: 'pill_jinxian', count: stage + 1 };
  if (realm === 12) return { item: 'pill_daluo', count: stage + 1 };
  return null;
}

// 大境界突破
export interface MajorBreak { item: string; base: number; per: number; maxItems: number; minItems?: number; desc: string }
export const MAJOR_BREAKS: Record<number, MajorBreak> = {
  0: { item: '', base: 1, per: 0, maxItems: 0, desc: '引气入体，踏上仙途' },
  1: { item: 'pill_zhuji', base: 0.06, per: 0.24, maxItems: 3, minItems: 0, desc: '筑基：凡人与真修的分水岭，须经实战与尘世历练，服筑基丹方可搏一线仙机' },
  2: { item: 'pill_jiangchen', base: 0.04, per: 0.20, maxItems: 3, minItems: 0, desc: '结丹：百战凝液成丹，须渡三重心魔与丹劫天雷，降尘丹可助一臂之力' },
  3: { item: 'pill_jiuqu', base: 0.01, per: 0.22, maxItems: 3, minItems: 1, desc: '结婴：碎丹成婴九死一生！须遍历生死斗法与秘境夺宝，且至少服下一枚九曲灵参丹护持心脉（备有养魂木/凝魄丹/万年灵乳可添胜算）' },
  4: { item: 'item_yuanqi', base: 0.01, per: 0.11, maxItems: 5, minItems: 3, desc: '化神：人界至高天堑！须纵横万里人界、集齐至少三块天地元气晶并勘破六重天道心魔，方有一线生机踏入「化神初期」' },
  5: { item: 'pill_huaxu', base: 0.14, per: 0.16, maxItems: 3, minItems: 1, desc: '炼虚：灵界真境之始！须解除界域灵压、参悟一系法则至入门，并炼化化虚灵丹、抗过心魔考' },
  6: { item: 'pill_ningxiang', base: 0.12, per: 0.15, maxItems: 3, minItems: 1, desc: '合体：元神合入天地法相！须在蛮荒或雷海凝成法相金身，渡过六九重劫方成合体' },
  7: { item: 'pill_pojie', base: 0.10, per: 0.15, maxItems: 3, minItems: 1, desc: '大乘：灵界极境、万物合一！须孕育出玄天之宝雏形并抗过九九灭世天劫' },
  8: { item: 'pill_zhenxian', base: 0.18, per: 0.16, maxItems: 3, minItems: 0, desc: '真仙：大乘圆满后渡过九重飞升仙劫，仙元化液、凝炼第一缕大道法则晶丝，证真仙位' },
  9: { item: 'pill_xuanxian', base: 0.14, per: 0.15, maxItems: 3, minItems: 1, desc: '玄仙：须开启三十六处周天仙窍并炼成本命仙器，方得玄仙大道根基' },
  10: { item: 'pill_jinxian', base: 0.12, per: 0.14, maxItems: 3, minItems: 1, desc: '金仙：须先后斩落善尸、恶尸、执念尸三大心魔化身，五气朝元登临太乙' },
  11: { item: 'pill_daluo', base: 0.10, per: 0.14, maxItems: 3, minItems: 1, desc: '大罗：三花聚顶、跳出因果！须将主修大道法则推至本源圆满，完成大罗问道试炼' },
};

export interface AuxBreakItem { id: string; name: string; bonus: number; consume: boolean }
export interface RealmRule {
  medStaleCap: number;
  smallChance: { base: number; per: number; cap: number };
  majorCap: number;
  failPenalty: { keepRatio: number; hurtDays: number; lifeCost: number; hp: number; hurtWhy: string };
  auxCap?: number;
  auxItems?: AuxBreakItem[];
  breakSuccessPrefix?: string;
}

const DEFAULT_REALM_RULE: RealmRule = {
  medStaleCap: 0.24,
  smallChance: { base: 0.18, per: 0.24, cap: 0.88 },
  majorCap: 0.65,
  failPenalty: { keepRatio: 0.50, hurtDays: 60, lifeCost: 40, hp: 0.10, hurtWhy: '冲击高阶大道失败，元神受创' },
};

/** 境界突破/闭关规则总表（扩充灵界/仙界大境界时优先在此增补，无需改动 cultivation.ts 分支）。 */
export const REALM_RULES: Record<number, RealmRule> = {
  0: {
    medStaleCap: 999,
    smallChance: { base: 0.38, per: 0.28, cap: 0.94 },
    majorCap: 1.0,
    failPenalty: { keepRatio: 0.70, hurtDays: 20, lifeCost: 3, hp: 0.30, hurtWhy: '引气入体失败，经脉受创' },
  },
  1: {
    medStaleCap: 999,
    smallChance: { base: 0.38, per: 0.28, cap: 0.94 },
    majorCap: 0.90,
    failPenalty: { keepRatio: 0.70, hurtDays: 20, lifeCost: 3, hp: 0.30, hurtWhy: '冲击大境界失败，经脉受创' },
  },
  2: {
    medStaleCap: 0.50,
    smallChance: { base: 0.30, per: 0.28, cap: 0.94 },
    majorCap: 0.85,
    failPenalty: { keepRatio: 0.65, hurtDays: 28, lifeCost: 6, hp: 0.30, hurtWhy: '冲击大境界失败，经脉受创' },
  },
  3: {
    medStaleCap: 0.34,
    smallChance: { base: 0.24, per: 0.28, cap: 0.94 },
    majorCap: 0.76,
    failPenalty: { keepRatio: 0.55, hurtDays: 42, lifeCost: 12, hp: 0.18, hurtWhy: '碎丹成婴功败垂成，金丹裂损' },
    auxCap: 0.10,
    auxItems: [
      { id: 'pill_ningpo', name: '凝魄丹', bonus: 0.04, consume: true },
      { id: 'herb_yangshen', name: '万年灵乳', bonus: 0.03, consume: true },
      { id: 'mat_yanghunmu', name: '养魂木', bonus: 0.04, consume: false },
    ],
    breakSuccessPrefix: '金丹寸碎、元婴破壳而出——',
  },
  4: {
    medStaleCap: 0.24,
    smallChance: { base: 0.18, per: 0.24, cap: 0.88 },
    majorCap: 0.10,
    failPenalty: { keepRatio: 0.50, hurtDays: 60, lifeCost: 30, hp: 0.10, hurtWhy: '强冲化神遭天道法则反噬，元婴重创' },
    auxCap: 0.10,
    auxItems: [
      { id: 'pill_zifu', name: '紫府玄元丹', bonus: 0.04, consume: true },
      { id: 'pill_ningpo', name: '凝魄丹', bonus: 0.03, consume: true },
      { id: 'mat_yanghunmu', name: '养魂木', bonus: 0.03, consume: false },
    ],
  },
  5: {
    medStaleCap: 0.28,
    smallChance: { base: 0.22, per: 0.24, cap: 0.90 },
    majorCap: 0.72,
    failPenalty: { keepRatio: 0.55, hurtDays: 50, lifeCost: 45, hp: 0.12, hurtWhy: '冲击炼虚失败，元神震荡' },
    auxCap: 0.12,
    auxItems: [
      { id: 'mat_taiyin_sui', name: '太阴寒髓', bonus: 0.06, consume: true },
      { id: 'pill_zifu', name: '紫府玄元丹', bonus: 0.04, consume: true },
    ],
    breakSuccessPrefix: '虚实相生、神魂化虚——',
  },
  6: {
    medStaleCap: 0.26,
    smallChance: { base: 0.20, per: 0.24, cap: 0.88 },
    majorCap: 0.68,
    failPenalty: { keepRatio: 0.52, hurtDays: 55, lifeCost: 80, hp: 0.12, hurtWhy: '法相溃散，神魂受创' },
    auxCap: 0.12,
    auxItems: [
      { id: 'mat_leihai_jin', name: '雷海精金', bonus: 0.06, consume: true },
      { id: 'mat_taiyin_sui', name: '太阴寒髓', bonus: 0.04, consume: true },
    ],
    breakSuccessPrefix: '法相金身归位、神魂合一——',
  },
  7: {
    medStaleCap: 0.24,
    smallChance: { base: 0.18, per: 0.24, cap: 0.88 },
    majorCap: 0.66,
    failPenalty: { keepRatio: 0.50, hurtDays: 60, lifeCost: 150, hp: 0.10, hurtWhy: '大乘天劫反噬，法相受损' },
    auxCap: 0.12,
    auxItems: [
      { id: 'mat_xuantian_pei', name: '玄天混沌残胚', bonus: 0.06, consume: false },
      { id: 'mat_leihai_jin', name: '雷海精金', bonus: 0.05, consume: true },
    ],
    breakSuccessPrefix: '九九重劫散尽、万物归真——',
  },
  8: {
    medStaleCap: 0.24,
    smallChance: { base: 0.18, per: 0.24, cap: 0.88 },
    majorCap: 0.72,
    failPenalty: { keepRatio: 0.55, hurtDays: 60, lifeCost: 200, hp: 0.10, hurtWhy: '飞升仙劫受挫，道躯裂损' },
    breakSuccessPrefix: '仙门洞开、凡躯蜕尽——',
  },
  9: {
    medStaleCap: 0.24,
    smallChance: { base: 0.18, per: 0.22, cap: 0.86 },
    majorCap: 0.66,
    failPenalty: { keepRatio: 0.55, hurtDays: 60, lifeCost: 400, hp: 0.10, hurtWhy: '仙窍震裂，仙元溃散' },
    auxCap: 0.12,
    auxItems: [{ id: 'mat_faze_jingsi', name: '大道法则晶丝', bonus: 0.06, consume: true }],
    breakSuccessPrefix: '三十六仙窍周天齐鸣——',
  },
  10: {
    medStaleCap: 0.22,
    smallChance: { base: 0.16, per: 0.22, cap: 0.86 },
    majorCap: 0.65,
    failPenalty: { keepRatio: 0.52, hurtDays: 60, lifeCost: 800, hp: 0.10, hurtWhy: '斩尸反噬，道心摇曳' },
    auxCap: 0.12,
    auxItems: [
      { id: 'mat_faze_jingsi', name: '大道法则晶丝', bonus: 0.06, consume: true },
      { id: 'mat_hundun_jingyuan', name: '混沌净源', bonus: 0.06, consume: true },
    ],
    breakSuccessPrefix: '三尸俱斩、五气朝元——',
  },
  11: {
    medStaleCap: 0.20,
    smallChance: { base: 0.16, per: 0.22, cap: 0.86 },
    majorCap: 0.64,
    failPenalty: { keepRatio: 0.50, hurtDays: 60, lifeCost: 1200, hp: 0.10, hurtWhy: '三花未聚，道果动摇' },
    auxCap: 0.12,
    auxItems: [{ id: 'mat_hundun_jingyuan', name: '混沌净源', bonus: 0.08, consume: true }],
    breakSuccessPrefix: '三花聚顶、跳出因果之外——',
  },
  12: {
    medStaleCap: 0.20,
    smallChance: { base: 0.16, per: 0.22, cap: 0.86 },
    majorCap: 0.64,
    failPenalty: { keepRatio: 0.50, hurtDays: 60, lifeCost: 1500, hp: 0.10, hurtWhy: '大道反噬，元神受创' },
  },
};

export function realmRule(realm: number): RealmRule {
  return REALM_RULES[realm] ?? DEFAULT_REALM_RULE;
}

export function maxRealmLevel(): number {
  const last = REALMS.length - 1;
  return levelOf(last, Math.max(0, REALMS[last].stages.length - 1));
}

/** 依 REALMS 表自动生成逆天改命等级序列（人界 0..5 固定为 [4,7,10,13,14..23]，未来扩表自动延伸）。 */
export function talentLevels(): number[] {
  const base = [4, 7, 10, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
  const top = maxRealmLevel();
  const out = base.filter((lv) => lv <= top);
  for (let lv = 24; lv <= top; lv++) out.push(lv);
  return out;
}
