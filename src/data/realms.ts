// 境界体系（人界：凡人 → 炼气 → 筑基 → 结丹 → 元婴 → 化神）
import { TUNING } from './tuning';
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
  // 人界至高境界：化神初期封顶（此界天地元气稀薄，止步化神初期）
  { id: 5, name: '化神', stages: ['初期'], hp: [42000], mp: [18500], atk: [3200], def: [920], sense: [4800], life: 2000, speed: 850, fly: true, expDays: [380000], color: '#c0392b' },
];

export const EXP_PER_DAY = 10; // 基础修炼：每天 10 点修为

export function realmName(realm: number, stage: number) {
  const r = REALMS[realm];
  if (!r) return '???';
  if (realm === 0) return '凡人';
  if (realm >= 5) return '化神初期';
  return r.name + (r.stages[stage] ?? r.stages[r.stages.length - 1] ?? '');
}

export function expNeed(realm: number, stage: number) {
  const R = REALMS[Math.max(0, Math.min(REALMS.length - 1, realm))];
  return Math.round(R.expDays[Math.max(0, Math.min(R.expDays.length - 1, stage))] * TUNING.expPerDay);
}

// 全局等级（用于比较强弱）：炼气1-13，筑基14-16，结丹17-19，元婴20-22，化神初期23
export function levelOf(realm: number, stage: number) {
  if (realm === 0) return 0;
  if (realm === 1) return 1 + stage;
  if (realm >= 5) return 23;
  return 13 + (realm - 2) * 3 + stage + 1;
}

export function fromLevel(level: number): [number, number] {
  if (level <= 0) return [0, 0];
  if (level <= 13) return [1, level - 1];
  if (level >= 23) return [5, 0];
  const l = level - 14;
  return [Math.min(5, 2 + Math.floor(l / 3)), Math.min(2, l % 3)];
}

// 灵根
export interface RootDef { id: string; name: string; rate: number; desc: string; weight: number }
export const ROOTS: RootDef[] = [
  { id: 'heaven', name: '天灵根', rate: 2.0, desc: '单一属性灵根，修炼一日千里，万中无一', weight: 1 },
  { id: 'variant', name: '异灵根', rate: 1.6, desc: '风雷冰等变异灵根，修炼极快', weight: 2 },
  { id: 'true', name: '真灵根', rate: 1.2, desc: '双属性灵根，宗门争抢的好苗子', weight: 10 },
  { id: 'triple', name: '三灵根', rate: 0.85, desc: '资质平平', weight: 30 },
  { id: 'fake', name: '伪灵根', rate: 0.5, desc: '四五属性灵根，修炼极慢，几乎无缘大道', weight: 40 },
];

// 小境界突破瓶颈所需（不含大境界）
export interface Bottleneck { item: string; count: number }
export function smallBottleneck(realm: number, stage: number): Bottleneck | null {
  // 从 stage -> stage+1 所需
  if (realm === 1) {
    if (stage === 5) return { item: 'pill_juqi', count: 1 };
    if (stage === 9) return { item: 'pill_juqi', count: 2 };
    return null;
  }
  if (realm === 2) return { item: 'pill_juling', count: stage + 1 };
  if (realm === 3) return { item: 'pill_ningyuan', count: stage + 1 };
  if (realm === 4) return { item: 'pill_peiying', count: stage + 1 };
  if (realm >= 5) return null; // 化神初期已是人界至高封顶
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
};
