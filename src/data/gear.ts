// 收官 C（甲）：整套装备——新物品类别 gear。用表生成：五个可穿的新槽位（发冠、腰带、护腕、戒指、玉佩）× 品阶 0–6，
// 外加两套套装「玄龟」（出海：避水、抗风、气血）与「崩山」（近战：罡气、近战伤害），集齐 2 / 4 件有加成。
// 第六个新槽位「本命法宝」不穿 gear，而是把一件攻击法宝拖上去绑定（BOND_MUL）。
// 每件到手时摇 1–3 条随机词条，记在那件 BagItem 自己身上（所以装备不堆叠）；摇词条只在 cultivation.addItem 给 gear 的分支里做。
//
// 属性数值的约定（都从 cultivation.mod(h, 名字) 读，和天赋同名项相加）：
//   hp / mp / atk / def / sense / speed / crit：比例，0.05 = +5%（和天赋一样）；
//   poise 罡气上限、melee 近战伤害：比例，0.1 = +10%；
//   waterward 避水、windward 抗风：抗性比例 0–1，0.3 = 水压 / 风力的影响减三成。
// 这四个新名字另两条线（近战、无边海）要读，名字别改。
import type { ItemDef } from './items';
import { WEAPON_TIERS, WEAPONS, weaponItemId, type WeaponKind } from './weapons';
import { mulberry32 } from '../core/rng';

/** 新增四个属性名（近战线、无边海线会读） */
export const STAT_POISE = 'poise' as const;
export const STAT_MELEE = 'melee' as const;
export const STAT_WATERWARD = 'waterward' as const;
export const STAT_WINDWARD = 'windward' as const;
export type NewStat = typeof STAT_POISE | typeof STAT_MELEE | typeof STAT_WATERWARD | typeof STAT_WINDWARD;
/** 装备能加的属性 */
export type GearStat = 'hp' | 'mp' | 'atk' | 'def' | 'sense' | 'speed' | 'crit' | NewStat;
export const STAT_NAME: Record<GearStat, string> = {
  hp: '气血', mp: '法力', atk: '攻击', def: '防御', sense: '神识', speed: '身法', crit: '会心',
  poise: '罡气上限', melee: '近战伤害', waterward: '避水', windward: '抗风',
};
/** 词条写成文字：+5% 气血 */
export function statText(k: GearStat, v: number) { return `${STAT_NAME[k]} +${(v * 100).toFixed(v * 100 < 10 ? 1 : 0).replace(/\.0$/, '')}%`; }

/** 新的五个可穿槽位（掉落、摊位按哈希挑槽位用的就是这张表——别往里加东西，兵器另走 WEAPON_ITEMS / weaponDrop） */
export type GearSlot = 'crown' | 'belt' | 'wrist' | 'ring' | 'pendant';
export const GEAR_SLOTS: GearSlot[] = ['crown', 'belt', 'wrist', 'ring', 'pendant'];
/** 兵器槽（近战兵器线）：穿脱和另外五个 gear 槽一样走 wearGear */
export const SLOT_WEAPON = 'weapon' as const;
/** 穿 gear 的槽：五件 + 兵器 */
export type WearSlot = GearSlot | typeof SLOT_WEAPON;
export const WORN_SLOTS: WearSlot[] = [...GEAR_SLOTS, SLOT_WEAPON];
/** 装备栏十一个槽：原有法衣、护盾、遁器、步履 + 新的五件 + 本命法宝 + 兵器 */
export type EquipSlot = 'armor' | 'shield' | 'flight' | 'boots' | GearSlot | 'bond' | typeof SLOT_WEAPON;
export const SLOT_NAME: Record<EquipSlot, string> = {
  crown: '发冠', armor: '法衣', belt: '腰带', boots: '步履', pendant: '玉佩',
  shield: '护盾', wrist: '护腕', ring: '戒指', flight: '遁器', bond: '本命法宝', weapon: '兵器',
};
/** 界面左右两列（DNF 式：左五右五）；兵器槽单独放在人物脚下正中（见 Inventory.tsx） */
export const SLOT_LEFT: EquipSlot[] = ['crown', 'armor', 'belt', 'boots', 'pendant'];
export const SLOT_RIGHT: EquipSlot[] = ['bond', 'shield', 'wrist', 'ring', 'flight'];
/** 本命法宝的伤害加成 */
export const BOND_MUL = 1.12;

export type GearSet = 'xuangui' | 'bengshan';
/** weapon：兵器槽的那几件写着是哪种兵器（剑 / 重兵 / 长枪） */
export interface GearSpec { slot: WearSlot; base: Partial<Record<GearStat, number>>; set?: GearSet; weapon?: WeaponKind }
export interface SetDef { id: GearSet; name: string; desc: string; pieces: string[]; bonus: { n: number; mods: Partial<Record<GearStat, number>>; text: string }[] }

const TIER_PRICE = [80, 420, 2200, 9000, 32000, 120000, 480000];
const NAMES: Record<GearSlot, string[]> = {
  crown: ['麻布发巾', '青木簪冠', '玄玉道冠', '紫金莲冠', '碧霞星冠', '九曜神冠', '太归墟冠'],
  belt: ['粗麻腰绳', '青藤束带', '玄鳞腰带', '紫绶锦带', '金蛟玉带', '九龙宝带', '太归墟带'],
  wrist: ['布缠护手', '铁皮护腕', '玄铁拳套', '紫铜虎爪', '赤金龙鳞腕', '九霄雷腕', '太归墟罡腕'],
  ring: ['黄铜指环', '青玉戒', '玄晶戒', '紫云戒', '金乌戒', '九幽冥戒', '太虚须弥戒'],
  pendant: ['桃木牌', '青玉佩', '温灵玉佩', '紫气玉佩', '金麟玉佩', '九转灵佩', '太归墟佩'],
};
const GLYPH: Record<GearSlot, string> = { crown: '冠', belt: '带', wrist: '腕', ring: '戒', pendant: '佩' };
/** 各槽位的基础属性（品阶 0 的值；往上每阶约翻 0.7 倍） */
const BASE: Record<GearSlot, Partial<Record<GearStat, number>>> = {
  crown: { sense: 0.03, mp: 0.02 },
  belt: { hp: 0.03, poise: 0.03 },
  wrist: { melee: 0.04, atk: 0.015 },
  ring: { atk: 0.02, crit: 0.01 },
  pendant: { def: 0.03, hp: 0.015 },
};
const DESC: Record<GearSlot, string> = {
  crown: '束发的冠饰，护住泥丸宫，神识更清明。',
  belt: '系在腰间的宝带，稳住下盘，气血绵长。',
  wrist: '缠在小臂上的护腕拳套，体修贴身肉搏的倚仗。',
  ring: '戴在指上的灵戒，引灵力流转更快，出手更狠。',
  pendant: '贴身的玉佩，温养经脉，挡下几分外力。',
};
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const scale = (t: number) => 1 + t * 0.7;

const LIST: ItemDef[] = [];
for (const slot of GEAR_SLOTS) for (let t = 0; t <= 6; t++) {
  const base: Partial<Record<GearStat, number>> = {};
  for (const [k, v] of Object.entries(BASE[slot]) as [GearStat, number][]) base[k] = r3(v * scale(t));
  LIST.push({ id: `gear_${slot}_${t}`, name: NAMES[slot][t], type: 'gear', tier: t, price: TIER_PRICE[t], desc: DESC[slot], glyph: GLYPH[slot], gear: { slot, base } });
}

export const SETS: Record<GearSet, SetDef> = {
  xuangui: {
    id: 'xuangui', name: '玄龟', desc: '取深海玄龟的背甲与筋膜炼成，出海远行的修士求之不得。',
    pieces: ['gear_xg_crown', 'gear_xg_belt', 'gear_xg_ring', 'gear_xg_pendant'],
    bonus: [
      { n: 2, mods: { waterward: 0.25, hp: 0.06 }, text: '避水 +25%，气血 +6%' },
      { n: 4, mods: { waterward: 0.25, windward: 0.35, hp: 0.06 }, text: '再加避水 +25%、抗风 +35%、气血 +6%' },
    ],
  },
  bengshan: {
    id: 'bengshan', name: '崩山', desc: '体修一脉的祖传行头，一拳崩山、一靠裂石。',
    pieces: ['gear_bs_crown', 'gear_bs_belt', 'gear_bs_wrist', 'gear_bs_ring'],
    bonus: [
      { n: 2, mods: { poise: 0.2, melee: 0.1 }, text: '罡气上限 +20%，近战伤害 +10%' },
      { n: 4, mods: { poise: 0.3, melee: 0.2, atk: 0.05 }, text: '再加罡气上限 +30%、近战伤害 +20%、攻击 +5%' },
    ],
  },
};
const SET_ITEMS: [string, string, GearSlot, GearSet, number, Partial<Record<GearStat, number>>, string][] = [
  ['gear_xg_crown', '玄龟冠', 'crown', 'xuangui', 3, { sense: 0.05, waterward: 0.06 }, '龟甲磨成的发冠，潜入深水也不觉气闷。'],
  ['gear_xg_belt', '玄龟束甲带', 'belt', 'xuangui', 3, { hp: 0.07, windward: 0.06 }, '缀着龟甲片的宽腰带，海上狂风吹不动。'],
  ['gear_xg_ring', '玄龟避水戒', 'ring', 'xuangui', 3, { atk: 0.03, waterward: 0.1 }, '戒面嵌一片避水的龟甲，入水三尺不湿衣。'],
  ['gear_xg_pendant', '玄龟镇海佩', 'pendant', 'xuangui', 3, { def: 0.06, windward: 0.08 }, '龟形玉佩，传说能镇住海眼。'],
  ['gear_bs_crown', '崩山抹额', 'crown', 'bengshan', 4, { hp: 0.05, poise: 0.08 }, '额上一道铁箍，挨了重拳也不晕。'],
  ['gear_bs_belt', '崩山铁腰', 'belt', 'bengshan', 4, { hp: 0.08, poise: 0.12 }, '玄铁打的宽腰，扎紧了一口气撞穿山门。'],
  ['gear_bs_wrist', '崩山拳套', 'wrist', 'bengshan', 4, { melee: 0.14, atk: 0.04 }, '指节嵌着陨铁的拳套，一拳下去石崩土裂。'],
  ['gear_bs_ring', '崩山扳指', 'ring', 'bengshan', 4, { atk: 0.05, melee: 0.06 }, '兽骨扳指，握拳时咯咯作响。'],
];
for (const [id, name, slot, set, tier, base, desc] of SET_ITEMS) LIST.push({ id, name, type: 'gear', tier, price: TIER_PRICE[tier] * 1.6, desc: `【${SETS[set].name}】${desc}`, glyph: GLYPH[slot], gear: { slot, base, set } });

export const GEAR_ITEMS: ItemDef[] = LIST;

// ---------------- 近战兵器：剑、重兵（刀 / 锤）、长枪（枪 / 棍）各七阶 ----------------
// 基础属性以近战伤害为主：剑多给会心（锋利），重兵多给罡气上限（沉重压身），长枪多给身法（手长脚快、进退灵便）。
// 不进 GEAR_ITEMS（那张表的件数、顺序是老存档和测试认的），单独一张 WEAPON_ITEMS，items.ts 另行登记。
const W_BASE: Record<Exclude<WeaponKind, 'fist'>, Partial<Record<GearStat, number>>> = {
  sword: { melee: 0.06, crit: 0.015 },
  heavy: { melee: 0.075, poise: 0.04 },
  spear: { melee: 0.055, speed: 0.015, def: 0.01 },
  scythe: { melee: 0.07, crit: 0.01, poise: 0.02 },   // r16 魂镰：近战伤害介于剑和重兵之间，带一点会心和罡气
};
const W_GLYPH: Record<string, string> = { jian: '剑', dao: '刀', hammer: '锤', qiang: '枪', gun: '棍', lian: '镰' };
const W_DESC: Record<string, string> = {
  jian: '单手剑，剑走轻灵，五式连环。',
  dao: '厚背大刀，双手抡开，一刀劈下去罡气崩散。',
  hammer: '长柄重锤，双手抡砸，挨上一下筋骨俱震。',
  qiang: '长枪比人还高，扎得远、挑得起、扫得开。',
  gun: '齐眉长棍，双手舞开，扫、挑、戳都使得。',
  lian: '长杆弯刃，双手抡开一道大弧；回旋一圈，身周的人都挨一下。',
};
const WLIST: ItemDef[] = [];
for (const kind of ['sword', 'heavy', 'spear'] as const) for (let t = 0; t <= 6; t++) {
  const tr = WEAPON_TIERS[kind][t], base: Partial<Record<GearStat, number>> = {};
  for (const [k, v] of Object.entries(W_BASE[kind]) as [GearStat, number][]) base[k] = r3(v * scale(t));
  WLIST.push({ id: weaponItemId(kind, t), name: tr.name, type: 'gear', tier: t, price: Math.round(TIER_PRICE[t] * 1.25), desc: `【${WEAPONS[kind].name}】${W_DESC[tr.form]}`, glyph: W_GLYPH[tr.form], gear: { slot: SLOT_WEAPON, base, weapon: kind } });
}
/** 二十一件兵器（三种 × 七阶） */
export const WEAPON_ITEMS: ItemDef[] = WLIST;
/**
 * r16 魂镰七阶（wpn_scythe_0..6）：只有噬魂魔尊夜无赦会掉（world/yewushe.ts 打赢以后给），不进 WEAPON_ITEMS（那张表的件数、
 * 按下标挑的铺子是老存档和测试认的）、不进 weaponDrop 的随机掉落、不上铺子。第七阶「噬魂本命魂镰」是他的本命兵器。
 */
const SLIST: ItemDef[] = [];
for (let t = 0; t <= 6; t++) {
  const tr = WEAPON_TIERS.scythe[t], base: Partial<Record<GearStat, number>> = {};
  for (const [k, v] of Object.entries(W_BASE.scythe) as [GearStat, number][]) base[k] = r3(v * scale(t) * (t === 6 ? 1.15 : 1));
  SLIST.push({ id: weaponItemId('scythe', t), name: tr.name, type: 'gear', tier: t, price: Math.round(TIER_PRICE[t] * 1.6), desc: `【${WEAPONS.scythe.name}】${t === 6 ? '噬魂魔尊夜无赦的本命魂镰，镰刃上还缠着没散尽的魔魂。' : ''}${W_DESC[tr.form]}`, glyph: W_GLYPH[tr.form], gear: { slot: SLOT_WEAPON, base, weapon: 'scythe' } });
}
/** 魂镰七件（只从夜无赦身上来） */
export const SCYTHE_ITEMS: ItemDef[] = SLIST;
/** 是不是兵器（老的随机物品池用它把兵器排除在外） */
export function isWeaponItem(it: Pick<ItemDef, 'gear'>): boolean { return it.gear?.slot === SLOT_WEAPON; }

/** 随机词条池：每条 [属性, 品阶 0 时的下限, 上限]，往上按品阶放大 */
const AFFIX: [GearStat, number, number][] = [
  ['hp', 0.01, 0.03], ['mp', 0.01, 0.03], ['atk', 0.008, 0.02], ['def', 0.01, 0.03], ['sense', 0.01, 0.03],
  ['speed', 0.01, 0.025], ['crit', 0.005, 0.015], ['poise', 0.02, 0.05], ['melee', 0.015, 0.04], ['waterward', 0.03, 0.08], ['windward', 0.03, 0.08],
];
export interface Affix { k: GearStat; v: number }
/** 摇 1–3 条词条（rnd 由调用方给：只在给 gear 的分支里取随机数） */
export function rollAffixes(tier: number, rnd: () => number): Affix[] {
  const n = 1 + Math.floor(rnd() * 3);
  const pool = AFFIX.slice(), out: Affix[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    const [k, lo, hi] = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    out.push({ k, v: r3((lo + rnd() * (hi - lo)) * scale(tier)) });
  }
  return out;
}
/** 某个套装集齐几件时的总加成 */
export function setBonus(set: GearSet, have: number): Partial<Record<GearStat, number>> {
  const out: Partial<Record<GearStat, number>> = {};
  for (const b of SETS[set].bonus) if (have >= b.n) for (const [k, v] of Object.entries(b.mods) as [GearStat, number][]) out[k] = (out[k] ?? 0) + v;
  return out;
}

/** 掉落用：按种子定一件装备（不取 Math.random，固定种子的测试不受影响）。四分之一的机会是套装件 */
export function gearDropId(seed: number, tier: number): string {
  let x = (seed | 0) ^ 0x9e3779b9; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); x = (x ^ (x >>> 16)) >>> 0;
  const t = Math.max(0, Math.min(6, Math.round(tier)));
  if (x % 4 === 0) { const s = (x >>> 3) % 2 ? SETS.bengshan : SETS.xuangui; return s.pieces[(x >>> 5) % s.pieces.length]; }
  return `gear_${GEAR_SLOTS[(x >>> 2) % GEAR_SLOTS.length]}_${t}`;
}

/**
 * 兵器掉落：和 gearDropId 不共用一个随机数——自己另混一遍哈希（换了常数），所以加了兵器以后原来那五槽的掉落逐位不变。
 * chance 是这次掉不掉兵器的机会；掉的话词条也用自己的种子摇（不取 Math.random，固定种子的测试不受影响）。
 */
export function weaponDrop(seed: number, tier: number, chance = 0.35): { id: string; affix: Affix[] } | null {
  let x = (seed | 0) ^ 0x2545f491; x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d); x = Math.imul(x ^ (x >>> 12), 0x297a2d39); x = (x ^ (x >>> 15)) >>> 0;
  if ((x % 10007) / 10007 >= chance) return null;
  const kinds = ['sword', 'heavy', 'spear'] as const;
  const id = weaponItemId(kinds[(x >>> 7) % 3], Math.max(0, Math.min(6, Math.round(tier))));
  const rnd = mulberry32(x ^ 0x77e1);
  return { id, affix: rollAffixes(Math.max(0, Math.min(6, Math.round(tier))), rnd) };
}
