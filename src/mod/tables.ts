// v0.57：模组的「数据表」——游戏里的内容表一律登记在这里，模组用同一套 api.data.get / patch / add / remove 读改加删。
// 每张表说明：怎么取到它（数组或对象）、主键、能不能新增 / 删除、改完要不要重建派生的查找表。
import { ARTS, ART_LIST, START_ARTS, PROF_DMG, PROF_RAD, PROF_CH, PROF_CD, SCHOOL_NAME, SCHOOL_COLOR, STATUS_NAME, STATUS_COLOR } from '../data/arts';
import { ITEMS, ITEM_LIST } from '../data/items';
import { ENEMIES, ENEMY_LIST, LAIRS } from '../data/enemies';
import { RECIPES } from '../data/recipes';
import { REALMS, ROOTS, MAJOR_BREAKS } from '../data/realms';
import { GONGFA, SKILLS, TALENTS } from '../data/skills';
import { BEAUTIES, BEAUTY_BY_ID } from '../data/beauties';
import { HEART_LINES, FESTIVALS } from '../data/heartlines';
import { LANDMARKS } from '../data/landmarks';
import { MIJING, MJ_BY_ID, THEMES } from '../data/mijing';
import { ROOMS } from '../data/mjrooms';
import { ZHEN, ZHEN_BY_ID, PANS } from '../data/zhenfa';
import { ALL_LOCATIONS, LOC_BY_ID, PORTALS } from '../data/world';
import { ART_LOOK } from '../data/artlooks';
import { SECT_DEFS, SECT_DEF } from '../world/roster';
import { SECT_RANKS } from '../world/worldstate';
import { SECT_LIB } from '../world/town';
import { CANON_EVENTS } from '../world/events';
import { PET_KINDS, EGG_TO_KIND } from '../world/pets';
import { AFFIX } from '../world/affix';
import { SCHOOLS } from '../world/schools';
import { HAP_SCAM_BASE } from '../world/scampool';
import { OUTFITS } from '../gfx/renwu/outfits';
import { BEAST_SPR } from '../gfx/beastTex';
import { TUNING } from '../data/tuning';

export interface TableSpec {
  name: string;
  desc: string;
  /** 表本体：数组（按主键或下标找）或对象（按键找） */
  ref: () => any[] | Record<string, any>;
  /** 数组的主键字段（缺省 'id'）；'index' 表示按下标 */
  key?: string;
  /** 能否新增（新增的主键须带「模组 id_」前缀，按下标的表除外） */
  add?: boolean;
  /** 删除：true 真删；'list' 只从「池子」（刷怪、坊市、掉落、卷轴）里撤下，按 id 仍查得到（存档里的旧物不会坏） */
  remove?: boolean | 'list';
  /** 改完重建派生的查找表 */
  sync?: () => void;
  /** 新增时必填的字段 */
  need?: string[];
}

const rebuild = <T>(obj: Record<string, T>, list: T[], k: (x: T) => string) => { for (const key of Object.keys(obj)) delete obj[key]; for (const x of list) obj[k(x)] = x; };

export const TABLES: TableSpec[] = [
  // ---------------- 内容
  { name: 'arts', desc: '法术（字段见 content.md「法术」）', ref: () => ARTS, add: false, remove: 'list' },
  { name: 'items', desc: '物品', ref: () => ITEMS, add: false, remove: 'list' },
  { name: 'enemies', desc: '妖兽、修士', ref: () => ENEMIES, add: false, remove: 'list' },
  { name: 'recipes', desc: '丹方、器方', ref: () => RECIPES, add: false, remove: true },
  { name: 'lairs', desc: '首领巢穴（地图坐标、坐镇的敌人 id）', ref: () => LAIRS, add: true, remove: true, need: ['id', 'enemy', 'x', 'y', 'name', 'desc'] },
  { name: 'affixes', desc: '精英词缀（名字、颜色、说明；效果在游戏代码里）', ref: () => AFFIX as any, add: false, remove: false },
  { name: 'schools', desc: '修士流派（门派出招套路）', ref: () => SCHOOLS, add: true, remove: false },
  { name: 'startArts', desc: '开局就会的法术 id（按下标）', ref: () => START_ARTS, key: 'index', add: true, remove: true },
  { name: 'profDamage', desc: '熟练度伤害倍率 [入门, 小成, 大成, 圆满]', ref: () => PROF_DMG, key: 'index', add: false, remove: false },
  { name: 'profRadius', desc: '熟练度范围倍率', ref: () => PROF_RAD, key: 'index', add: false, remove: false },
  { name: 'profChance', desc: '熟练度控制几率倍率', ref: () => PROF_CH, key: 'index', add: false, remove: false },
  { name: 'profCooldown', desc: '熟练度冷却倍率', ref: () => PROF_CD, key: 'index', add: false, remove: false },
  { name: 'schoolNames', desc: '法术系别名（火、冰、雷……）', ref: () => SCHOOL_NAME as any, add: true, remove: false },
  { name: 'schoolColors', desc: '法术系别颜色', ref: () => SCHOOL_COLOR as any, add: true, remove: false },
  { name: 'statusNames', desc: '异常状态名', ref: () => STATUS_NAME as any, add: false, remove: false },
  { name: 'statusColors', desc: '异常状态颜色', ref: () => STATUS_COLOR as any, add: false, remove: false },
  // ---------------- 修炼
  { name: 'realms', desc: '境界（按下标 0 凡人 … 5 化神）：名字、各层所需天数、寿元、攻防血……', ref: () => REALMS, key: 'index', add: false, remove: false },
  { name: 'majorBreaks', desc: '大境界瓶颈（按境界）：冲关丹、上限、基础成功率、说明', ref: () => MAJOR_BREAKS as any, add: false, remove: false },
  { name: 'roots', desc: '灵根：修炼速度 rate、出现权重 weight', ref: () => ROOTS, add: true, remove: true, need: ['id', 'name', 'rate', 'desc', 'weight'] },
  { name: 'gongfa', desc: '主修功法', ref: () => GONGFA, add: true, remove: false },
  { name: 'skills', desc: '技艺（炼丹、阵法……）', ref: () => SKILLS, add: true, remove: false },
  { name: 'talents', desc: '天赋：mods 是属性加成（atk hp mp def sense speed exp alchemy luck crit lifesteal reduce life herb …）', ref: () => TALENTS, add: true, remove: true, need: ['id', 'name', 'desc', 'tier', 'mods'] },
  { name: 'tuning', desc: '节奏：daysPerSec（每秒过几日）、meditateSpeed（打坐光阴倍速）、expPerDay（一日修为基数）', ref: () => TUNING as any, add: false, remove: false },
  // ---------------- 世界
  { name: 'locations', desc: '地点（三张图）：名字、说明、危险度、大小……（新增请用 content.locations）', ref: () => ALL_LOCATIONS, add: false, remove: false, sync: () => { LOC_BY_ID.clear(); for (const l of ALL_LOCATIONS) LOC_BY_ID.set(l.id, l); } },
  { name: 'portals', desc: '跨图传送通道', ref: () => PORTALS as any, add: false, remove: false },
  { name: 'landmarks', desc: '传说名地（地图上的大景观）', ref: () => LANDMARKS, add: false, remove: true },
  { name: 'canonEvents', desc: '人界大事（问仙大会、赤霄禁地……）：年月、地点、境界门槛', ref: () => CANON_EVENTS, add: true, remove: true },
  { name: 'scamRates', desc: '各类奇遇里藏着骗局的几率（0–1）', ref: () => HAP_SCAM_BASE as any, add: false, remove: false },
  { name: 'sects', desc: '宗门名册：人数、掌门境界、魔道、袍色、门训', ref: () => SECT_DEFS, add: true, remove: false, need: ['id', 'name', 'n', 'top'], sync: () => { SECT_DEF.clear(); for (const s of SECT_DEFS) SECT_DEF.set(s.id, s); } },
  { name: 'sectRanks', desc: '宗门职位（按下标）', ref: () => SECT_RANKS, key: 'index', add: false, remove: false },
  { name: 'sectLibrary', desc: '宗门藏经阁（宗门 id → 卷轴 id 列表）', ref: () => SECT_LIB, add: true, remove: false },
  // ---------------- 人物
  { name: 'beauties', desc: '知交（人设、住处、性情……）', ref: () => BEAUTIES, add: false, remove: false, sync: () => rebuild(BEAUTY_BY_ID, BEAUTIES, (b) => b.id) },
  { name: 'heartLines', desc: '知交台词（知交 id → 各种场合的话）', ref: () => HEART_LINES, add: false, remove: false },
  { name: 'festivals', desc: '节日（月、日、名字、说明）', ref: () => FESTIVALS, key: 'index', add: true, remove: true },
  { name: 'pets', desc: '灵宠种类（灵卵、外观、成长）', ref: () => PET_KINDS, add: true, remove: false, sync: () => { for (const k of Object.keys(EGG_TO_KIND)) delete EGG_TO_KIND[k]; for (const [k, v] of Object.entries(PET_KINDS)) EGG_TO_KIND[(v as any).egg] = k; } },
  // ---------------- 阵法、秘境
  { name: 'zhen', desc: '阵法', ref: () => ZHEN, add: true, remove: false, sync: () => rebuild(ZHEN_BY_ID, ZHEN, (z) => z.id) },
  { name: 'pans', desc: '阵盘', ref: () => PANS, add: true, remove: false },
  { name: 'mijing', desc: '秘境', ref: () => MIJING, add: true, remove: false, sync: () => rebuild(MJ_BY_ID, MIJING, (m) => m.id) },
  { name: 'mijingThemes', desc: '秘境主题', ref: () => THEMES as any, add: false, remove: false },
  { name: 'mijingRooms', desc: '秘境房间模板', ref: () => ROOMS, add: true, remove: true },
  // ---------------- 外观
  { name: 'outfits', desc: '衣橱里的衣裳', ref: () => OUTFITS, add: true, remove: false },
  { name: 'artLooks', desc: '法宝外观', ref: () => ART_LOOK as any, add: true, remove: false },
  { name: 'beastSprites', desc: '妖兽贴图登记（高度、动态……；换图请用 gfx.sprite）', ref: () => BEAST_SPR, add: false, remove: false },
];
export const TABLE_BY_NAME = new Map(TABLES.map((t) => [t.name, t]));

/** 拷一份给模组看（函数去掉，循环引用截断） */
export function plain<T>(v: T, depth = 0): T {
  if (v === null || typeof v !== 'object') return (typeof v === 'function' ? undefined : v) as T;
  if (depth > 12) return undefined as T;
  if (Array.isArray(v)) return v.map((x) => plain(x, depth + 1)) as T;
  if (v instanceof Map) return Object.fromEntries([...v].map(([k, x]) => [k, plain(x, depth + 1)])) as T;
  const o: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) { if (typeof x !== 'function') o[k] = plain(x, depth + 1); }
  return o as T;
}

/** 删除「池子」里的条目：法术（连同卷轴）、物品（连同各妖兽掉落）、敌人——按 id 仍能查到，只是不再出现。返回撤销函数 */
export function removeFromPools(table: string, id: string): () => void {
  const undo: (() => void)[] = [];
  const pull = <T>(arr: T[], x: T | undefined) => { if (!x) return; const i = arr.indexOf(x); if (i >= 0) { arr.splice(i, 1); undo.push(() => arr.splice(i, 0, x)); } };
  if (table === 'arts') { pull(ART_LIST, ARTS[id]); pull(ITEM_LIST, ITEMS['scroll_art_' + id]); }
  if (table === 'enemies') pull(ENEMY_LIST, ENEMIES[id]);
  if (table === 'items') {
    pull(ITEM_LIST, ITEMS[id]);
    for (const e of ENEMY_LIST) { const i = e.drops.findIndex((d) => d.id === id); if (i >= 0) { const d = e.drops[i]; e.drops.splice(i, 1); undo.push(() => e.drops.splice(i, 0, d)); } }
  }
  return () => { for (const u of undo.reverse()) u(); };
}
