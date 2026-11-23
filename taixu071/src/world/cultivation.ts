// 第二步：修炼与角色 —— 属性、灵根、功法、寿元、修为、瓶颈、突破、逆天改命、背包、问道残卷、炼丹、闭关
import { modx } from '../mod/hooks';
import { hookNumber } from '../mod/safeNumber';
import { REALMS, ROOTS, expNeed, levelOf, realmDef, realmName, realmRule, smallBottleneck, MAJOR_BREAKS, rootBreakBonus, isAtRealmCap, realmCapDesc, talentLevels } from '../data/realms';
import { worldStatScale, worldRealmCap, type WorldId } from '../data/worldHierarchy';
import { ACTIVE_WORLD } from '../data/world';
import { GONGFA, TALENTS, talentById, TalentMod } from '../data/skills';
import { itemDef } from '../data/items';
import { RECIPES, Recipe, ageToCount } from '../data/recipes';
import { START_ARTS, START_HOTBAR } from '../data/arts';
import { bagTotals, validCount } from './inventoryNumbers';
import { higherStatMultipliers } from './higherPlane';

export interface BagItem {
  id: string; n: number; age?: number;
  /** 人心篇：伪劣丹药 / 残缺玉简（ident=true 后显露真容，不再误服） */
  fake?: 'dyed' | 'toxic' | 'broken';
  ident?: boolean;
  seller?: string;
  sellerName?: string;
}
export interface DaoHurt {
  days: number;                        // 剩余受损天数（7–60 日）
  why: string;                         // 受伤缘由（如“遭劫修重创，经脉受损”）
}
export interface Hero {
  /** 人物重做：衣橱（衣裳、染色、发式、容貌、身形） */
  wardrobe?: import('../gfx/renwu/outfits').Wardrobe;
  name: string; age: number; realm: number; stage: number; exp: number;
  root: string; gongfa: string; talents: string[]; talentLevels: number[];
  hp: number; mp: number;             // 当前比例 0–1
  lifeBonus: number; senseBonus: number; lifeLost: number;
  bag: BagItem[];
  bottle: { drops: number; charge: number; owned?: boolean };
  pendingTalent: string[] | null;
  dead: boolean;
  stats: { meditateDays: number; gathered: number; pills: number; breaks: number; failed: number; alchemy: number };
  // 第三步：法术与战斗
  arts: { id: string; xp: number }[];
  hotbar: (string | null)[];
  equip: { armor?: string; shield?: string; flight?: string; boots?: string };
  /** 独立御器外观栏：不占用或消耗背包法宝。 */
  flightMount?: string;
  looted: string[];
  kills: number;
  /** 第三十六步：本小境界已服修为/主丹丹毒数（耐药） */
  pillN?: number;
  /** 养魂/凝魄类神魂丹药终生已服次数与累计加成（不随破境清零） */
  sensePillN?: number;
  sensePillBonus?: number;
  /** 延寿/万寿类延寿丹药终生已服次数（不随破境清零） */
  lifePillN?: number;
  /** 战斗回气/疗伤丹药短时丹毒积郁（随闭关与时日缓慢消散） */
  healPillN?: number;
  /** 第四十五步「天道」：感悟池（占本小境界所需修为的比例）与上次结算的月份 */
  wuP?: number; wuM?: number;
  /** 第四十步：碧竹飞云剑的口数（每根金雷竹十二口，至七十二口）与是否已熔入庚精（大庚剑阵） */
  qzN?: number;
  qzGeng?: boolean;
  /** 人心篇：道伤（经脉受损：修炼速度 -40%、法力上限 -20%，需灵药+闭关调息方愈） */
  daoHurt?: DaoHurt | null;
  /** v0.53：观兽悟形（七形参悟进度） */
  hx?: { ins: Partial<Record<string, number>>; seen?: boolean };
  /** v0.53：阵道修为与已参透的阵图 */
  zd?: { xp: number; known: string[]; mast?: Record<string, number> };
  /** 防纯闭关：连续未历红尘的闭关修为占比（超阈值则道心枯寂、闭关受阻） */
  medStale?: number;
  /** 同阶及越阶实战斩敌计数（冲击元婴、化神硬性印证） */
  peerKills?: number;
  /** 亲身深入秘境 / 古修洞府破禁完成次数 */
  mijingDone?: number;
  /** 灵界与仙界高阶养成状态（天劫、玄天之宝、大道法则、三十六仙窍、斩三尸、天人五衰、天书原章） */
  higher?: import('./higherPlane').HeroHigherPlaneState;
}

/** 第三十六步：奇遇、切磋、任务所得修为的折算（修为主要靠岁月苦修） */
export const INSIGHT = 0.12;
/** 第四十五步「天道」：单颗丹药的药力上限（占本小境界所需修为的比例）——高阶丹药虚不受补，一颗顶不了几十年 */
export const PILL_CAP = 0.05;
/** 第四十五步「天道」：奇遇、斗法、切磋、任务所得修为都从「感悟池」支取：池子每月回 0.12%，最多存 4%（占本小境界所需） */
export const WU_RATE = 0.001, WU_MAX = 0.03;
export function wuTake(h: Hero, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0 || !validCultivation(h) || !Number.isFinite(h.age) || h.age < 0) return 0;
  const m = Math.floor(h.age * 12), nd = need(h);
  if (!Number.isSafeInteger(m) || !Number.isFinite(nd) || nd <= 0) return 0;
  if ((h.wuP !== undefined && (!Number.isFinite(h.wuP) || h.wuP < 0 || h.wuP > WU_MAX)) || (h.wuM !== undefined && !Number.isSafeInteger(h.wuM))) return 0;
  if (h.wuP === undefined || h.wuM === undefined) { h.wuP = WU_MAX; h.wuM = m; }
  if (m > h.wuM) { h.wuP = Math.min(WU_MAX, h.wuP + (m - h.wuM) * WU_RATE); h.wuM = m; }
  const k = Math.max(0, Math.min(amount, h.wuP * nd));
  h.wuP = Math.max(0, h.wuP - k / nd);
  return k;
}
/** 人界灵气稀薄：修炼倍率超过两倍的部分只算三成半，最多 3.2 倍 */
export function softRate(m: number) { return m <= 2 ? m : Math.min(3.2, 2 + (m - 2) * 0.35); }
/** 同一小境界内服丹越多，药力越弱（耐药）：第 n 颗只剩 0.55^n */
export const PILL_FATIGUE = 0.55;
/** 养魂/凝魄类丹药：终生耐药递减与总增益封顶（防止无限吞服导致神识失控膨胀） */
export const SENSE_PILL_FATIGUE = 0.68;
export const SENSE_PILL_CAP = 0.40;
export const SENSE_PILL_MIN_GAIN = 0.005;
/** 延寿/万寿类丹药：终生耐药递减与最多有效服用枚数 */
export const LIFE_PILL_FATIGUE = 0.65;
export const LIFE_PILL_MAX = 8;
/** 外部永久神识百分比加成的软上限起算点与渐近封顶（兼容并收束已膨胀老档） */
export const SENSE_BONUS_SOFT = 1.5;
export const SENSE_BONUS_MAX = 3.0;
export function effectiveSenseBonus(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  if (raw <= SENSE_BONUS_SOFT) return raw;
  const span = SENSE_BONUS_MAX - SENSE_BONUS_SOFT;
  return SENSE_BONUS_SOFT + span * (1 - Math.exp(-(raw - SENSE_BONUS_SOFT) / span));
}
export const TALENT_LEVELS = talentLevels();

/** 久居闭关上限（占当前小境界所需修为比例）：筑基起纯闭关不可一蹴而就，必须外出斗法探秘印证道心 */
export function medStaleCap(h: Hero): number {
  return realmRule(h.realm).medStaleCap;
}
export function isMedStale(h: Hero): boolean {
  return h.realm >= 2 && h.realm < 5 && (h.medStale ?? 0) >= medStaleCap(h);
}
/** 外出实战、探秘、任务、炼丹采集等红尘历练可涤荡闭关郁结 */
export function temperDao(h: Hero, amount = 0.25) {
  h.medStale = Math.max(0, (h.medStale ?? 0) - amount);
}

export interface BreakReqItem { label: string; cur: number; need: number; ok: boolean }
/** 大境界突破的「红尘历练 · 道基印证」硬门槛：杜绝只靠闭关不玩核心内容混上高境界 */
export function checkMajorGate(h: Hero, ws?: import('./worldstate').WorldState | null, exploredPct = 0): { ok: boolean; list: BreakReqItem[] } {
  const sitesObj = ws?.sites ?? {};
  let sitesCnt = h.mijingDone ?? 0;
  for (const k in sitesObj) {
    const v = sitesObj[k];
    if (v && (v.done || v.layer || v.read || v.drink || v.dive)) sitesCnt++;
  }
  const sectDone = ws?.sect?.done ?? 0;
  const bountiesDone = (ws?.bounties ?? []).filter((b) => b.done).length;
  const eventsDone = Object.values(ws?.events ?? {}).filter((e) => e.state === 'done').length;
  const tasksDone = sectDone + bountiesDone + eventsDone;
  const artsCnt = h.arts?.length ?? 0;
  const alch = h.stats?.alchemy ?? 0;
  const gath = h.stats?.gathered ?? 0;
  // 兼容旧存档：老档已有大量总击杀时按比例折算一部分同阶战绩，纯闭关零战斗档仍为 0
  const peer = Math.max(h.peerKills ?? 0, h.realm === 3 ? Math.floor(Math.max(0, (h.kills ?? 0) - 70) / 8) : h.realm >= 4 ? Math.floor(Math.max(0, (h.kills ?? 0) - 160) / 10) : 0);
  const mk = (label: string, cur: number, need: number): BreakReqItem => ({ label, cur: Math.min(cur, need), need, ok: cur >= need });
  const list: BreakReqItem[] = [];
  if (h.realm === 1) {
    list.push(
      mk('实战磨砺：斩杀妖兽或敌修', h.kills ?? 0, 10),
      mk('入世修行：采集灵物 / 奇遇 / 差事 / 炼丹合计', gath + sitesCnt + tasksDone + alch, 6),
    );
  } else if (h.realm === 2) {
    list.push(
      mk('百战凝煞：累计实战斩敌', h.kills ?? 0, 35),
      mk('寻幽探秘：探明古迹秘境或完成悬赏/宗门差事', sitesCnt + tasksDone, 6),
      mk('道法兼修：参悟法术门数与开炉丹器合计', artsCnt + alch, 6),
    );
  } else if (h.realm === 3) {
    list.push(
      mk('铁血问道：累计实战斩敌', h.kills ?? 0, 90),
      mk('同阶争锋：斩杀结丹期 / 六级以上强敌妖王', peer, 6),
      mk('秘境夺宝：亲身探明古修洞府 / 秘境 / 天地奇遇', sitesCnt, 8),
      mk('红尘历练：完成悬赏 / 宗门差事 / 天下大事', tasksDone, 8),
      mk('结婴圣药：备齐《九曲灵参丹》护持碎丹', bagCount(h, 'pill_jiuqu'), 1),
    );
  } else if (h.realm === 4) {
    list.push(
      mk('纵横人界：累计实战斩敌', h.kills ?? 0, 220),
      mk('绝巅论剑：斩杀元婴老怪 / 八级以上化形妖王', peer, 8),
      mk('踏遍遗迹：探明秘境 / 古修洞府 / 天地奇遇', sitesCnt, 18),
      mk('万里神游：大地图踏足探索度（%）', Math.floor(exploredPct * 100), 15),
      mk('万法归宗：习得法术神通门数', artsCnt, 8),
      mk('法则引子：集齐《天地元气晶》（至少 3 块）', bagCount(h, 'item_yuanqi'), 3),
    );
  } else if (h.realm === 5) {
    const asc = !!(ws?.ascendedWorlds?.includes('spirit') || ACTIVE_WORLD === 'spirit');
    list.push(
      mk('飞升灵界：身入中千灵界洗炼道胎', asc ? 1 : 0, 1),
      mk('灵界斩妖：累计实战斩敌', h.kills ?? 0, 280),
      mk('化虚破障：备齐《化虚灵丹》', bagCount(h, 'pill_huaxu'), 1),
    );
  } else if (h.realm === 6) {
    list.push(
      mk('同阶试剑：斩杀炼虚/大妖级强敌', peer, 6),
      mk('道痕印证：灵域探秘 / 洞府秘境', sitesCnt, 22),
      mk('凝相破关：备齐《凝相金丹》', bagCount(h, 'pill_ningxiang'), 1),
    );
  } else if (h.realm === 7) {
    const tribs = Math.max(h.higher?.tribulations ?? 0, ws?.worlds?.spirit?.tribulationCount ?? 0);
    list.push(
      mk('渡过天劫：经受三九/六九天劫洗礼', tribs, 1),
      mk('神通淬道：习得高阶法术神通', artsCnt, 10),
      mk('同阶试剑：斩杀合体级霸主', peer, 8),
      mk('大乘引子：备齐《破劫大乘丹》', bagCount(h, 'pill_pojie'), 1),
    );
  } else if (h.realm === 8) {
    const ascIm = !!(ws?.ascendedWorlds?.includes('immortal') || ACTIVE_WORLD === 'immortal');
    const tribs = Math.max(h.higher?.tribulations ?? 0, ws?.worlds?.spirit?.tribulationCount ?? 0);
    list.push(
      mk('飞升仙界：渡仙门踏入大千仙界', ascIm ? 1 : 0, 1),
      mk('九九天劫：累计渡过两次高阶天劫', tribs, 2),
      mk('化仙圣药：备齐《化仙玉液丹》', bagCount(h, 'pill_zhenxian'), 1),
    );
  } else if (h.realm === 9) {
    const ac = h.higher?.immortalAcupoints ?? 0;
    list.push(
      mk('贯通仙窍：开启周天仙窍（至少 12 窍）', ac, 12),
      mk('仙域历战：斩杀仙界同阶强敌', peer, 6),
      mk('玄仙圣药：备齐《开窍玄仙丹》', bagCount(h, 'pill_xuanxian'), 1),
    );
  } else if (h.realm === 10) {
    const ac = h.higher?.immortalAcupoints ?? 0;
    const maxLaw = Math.max(0, ...Object.values(h.higher?.laws ?? {}).map((v) => v ?? 0));
    list.push(
      mk('贯通仙窍：开启周天仙窍（至少 24 窍）', ac, 24),
      mk('法则成道：任意一条大道法则达三重', maxLaw, 3),
      mk('斩尸灵丹：备齐《太乙斩尸丹》', bagCount(h, 'pill_jinxian'), 1),
    );
  } else if (h.realm === 11) {
    const ac = h.higher?.immortalAcupoints ?? 0;
    const corpses = (h.higher?.threeCorpses ?? []).filter(Boolean).length;
    list.push(
      mk('周天圆满：三十六仙窍全数贯通', ac, 36),
      mk('太乙斩尸：斩去至少两具执念化身', corpses, 2),
      mk('大罗造化：备齐《大罗造化丹》', bagCount(h, 'pill_daluo'), 1),
    );
  }
  return { ok: list.every((x) => x.ok), list };
}

/** 结婴 / 化神等破境时储物袋中护魂奇珍提供的额外加成（由 REALM_RULES 表驱动） */
export function majorAuxBonus(h: Hero): { bonus: number; names: string[] } {
  const rule = realmRule(h.realm);
  if (!rule.auxItems?.length) return { bonus: 0, names: [] };
  const names: string[] = [];
  let bonus = 0;
  for (const it of rule.auxItems) {
    if (bagCount(h, it.id) > 0) { bonus += it.bonus; names.push(it.name); }
  }
  return { bonus: Math.min(rule.auxCap ?? 0.10, bonus), names };
}
export const BOTTLE_DAYS = 20;
export const BOTTLE_MAX = 3;
export const BOTTLE_YEARS = 100;   // v0.70 起不再使用（灵草不计年份），留给旧模组引用

export function newHero(): Hero {
  return {
    name: '苏寒', age: 17, realm: 1, stage: 4, exp: 0, root: 'fake', gongfa: 'changchun', talents: [], talentLevels: [],
    hp: 1, mp: 1, lifeBonus: 0, senseBonus: 0, lifeLost: 0,
    // 初入青霞谷：问道残卷（已凝一滴墨露）、邹大夫遗下的符箓与丹药、几块灵石
    bag: [{ id: 'item_bottle', n: 1 }, { id: 'herb_huangjing', n: 3, age: 12 }, { id: 'pill_juqi', n: 2 }, { id: 'pill_huiqi', n: 3 }, { id: 'pill_liaoshang', n: 3 },
      { id: 'tal_fire', n: 6 }, { id: 'tal_jingang', n: 3 }, { id: 'tal_ice', n: 2 }, { id: 'tal_escape', n: 1 }, { id: 'mat_lingshi', n: 120 }, { id: 'art_qingfeng', n: 1 }],
    bottle: { drops: 1, charge: 0, owned: true }, pendingTalent: null, dead: false,
    stats: { meditateDays: 0, gathered: 0, pills: 0, breaks: 0, failed: 0, alchemy: 0 },
    arts: START_ARTS.map((id) => ({ id, xp: 0 })), hotbar: [...START_HOTBAR], equip: {}, looted: [], kills: 0,
  };
}

export function mod(h: Hero, m: TalentMod) { let v = 0; for (const id of h.talents) v += talentById(id)?.mods[m] ?? 0; return v; }
export function rootDef(h: Hero) { return ROOTS.find((r) => r.id === h.root) ?? ROOTS[ROOTS.length - 1]; }
export function gongfaDef(h: Hero) { return GONGFA[h.gongfa] ?? GONGFA.generic; }

export function maxLife(h: Hero) { return Math.round(realmDef(h.realm).life * (1 + mod(h, 'life')) + h.lifeBonus - h.lifeLost); }

export function hasDaoHurt(h: Hero): boolean { return !!(h.daoHurt && h.daoHurt.days > 0.05); }
export function inflictDaoHurt(h: Hero, days: number, why: string) {
  const d = Math.max(1, Math.min(60, Math.round(days)));
  if (h.daoHurt && h.daoHurt.days > 0) {
    h.daoHurt.days = Math.min(60, Math.max(h.daoHurt.days, d) + Math.round(Math.min(h.daoHurt.days, d) * 0.35));
    h.daoHurt.why = why;
  } else {
    h.daoHurt = { days: d, why };
  }
}
export function healDaoHurt(h: Hero, days: number): boolean {
  if (!h.daoHurt || h.daoHurt.days <= 0) return false;
  h.daoHurt.days -= days;
  if (h.daoHurt.days <= 0.1) { h.daoHurt = null; return true; }
  return false;
}

export function heroStats(h: Hero, worldId: WorldId = ACTIVE_WORLD) {
  const R = realmDef(h.realm);
  const s = Math.max(0, Math.min(R.hp.length - 1, h.stage));
  const gf = gongfaDef(h);
  const hurtMp = hasDaoHurt(h) ? 0.8 : 1;   // 道伤·经脉受损：法力上限 -20%
  const law = worldStatScale(h.realm, worldId); // 高维空间法则压制 ×（超界逆返下界排斥）
  const hm = higherStatMultipliers(h);
  return {
    hp: Math.round(R.hp[s] * (1 + (gf.hp ?? 0) + mod(h, 'hp')) * hm.hp * law),
    mp: Math.max(1, Math.round(R.mp[s] * (1 + (gf.mp ?? 0) + mod(h, 'mp')) * hurtMp * hm.mp * law)),
    atk: Math.round(R.atk[s] * (1 + (gf.atk ?? 0) + mod(h, 'atk')) * hm.atk * law),
    def: Math.round(R.def[s] * (1 + (gf.def ?? 0) + mod(h, 'def')) * hm.def * law),
    sense: Math.round(R.sense[s] * (1 + mod(h, 'sense') + effectiveSenseBonus(h.senseBonus)) * hm.sense * law),
    speed: 1 + mod(h, 'speed') + hm.speed,
    luck: mod(h, 'luck'),
  };
}

/** 每日修为 */
export function expPerDay(h: Hero, place = 1, worldId: WorldId = ACTIVE_WORLD) {
  const gf = gongfaDef(h);
  const over = h.realm > gf.maxRealm ? 0.5 : 1;
  const hurtExp = hasDaoHurt(h) ? 0.6 : 1;  // 道伤·经脉受损：修炼速度 -40%
  const staleMul = isMedStale(h) ? 0.12 : 1; // 久居闭关不历红尘：打坐收益骤减
  const rawMul = rootDef(h).rate * gf.rate * over * (1 + mod(h, 'exp')) * place;
  const worldAura = worldId === 'immortal'
    ? Math.min(10, (rawMul <= 2 ? rawMul : 2 + (rawMul - 2) * 0.5) * 3.0)
    : worldId === 'spirit'
      ? Math.min(6, (rawMul <= 2 ? rawMul : 2 + (rawMul - 2) * 0.45) * 1.75)
      : softRate(rawMul);
  return 10 * worldAura * hurtExp * staleMul;
}

/** 当前人界修炼入口的最小结构约束；不会自动修复已损坏角色。 */
export function validCultivation(h: Hero): boolean {
  return Number.isInteger(h.realm) && h.realm >= 0 && h.realm < REALMS.length &&
    Number.isInteger(h.stage) && h.stage >= 0 && h.stage < REALMS[h.realm].stages.length &&
    Number.isFinite(h.exp) && h.exp >= 0;
}
export function need(h: Hero) { return expNeed(h.realm, h.stage); }
export function isLastStage(h: Hero, worldId: WorldId = ACTIVE_WORLD) {
  const cap = worldRealmCap(worldId), r = REALMS[h.realm];
  return h.realm >= cap.maxRealm || !r || h.stage >= r.stages.length - 1;
}
/** 当前是否卡在瓶颈（修为已满但需手动突破；若已达当前界域法则上限则不再突破） */
export function bottleneck(h: Hero, worldId: WorldId = ACTIVE_WORLD): 'none' | 'small' | 'major' {
  if (isAtRealmCap(h.realm, h.stage, worldId)) return 'none';
  if (h.exp < need(h)) return 'none';
  if (isLastStage(h, worldId)) return 'major';
  return smallBottleneck(h.realm, h.stage, worldId) ? 'small' : 'none';
}

/** v0.70：灵草不计年份——minAge 参数保留（旧调用 / 模组不报错）但不再生效 */
export function bagCount(h: Hero, id: string, _minAge = 0) {
  let n = 0;
  for (const b of h.bag) if (b.id === id && !(b.fake && b.ident)) {
    if (!validCount(b.n) || !Number.isSafeInteger(n + b.n)) return 0;
    n += b.n;
  }
  return n;
}
/** 灵草入袋一律不记年份（同种灵草合成一格） */
const noAge = (id: string, age?: number) => (age === undefined || itemDef(id)?.type === 'herb' ? undefined : Math.round(age));
/** v0.70：旧存档里分年份的灵草合并成一格 */
export function mergeHerbs(h: Hero) {
  const out: BagItem[] = [];
  for (const b of h.bag) {
    if (itemDef(b.id)?.type === 'herb') b.age = undefined;
    const ex = b.age === undefined ? out.find((o) => o.id === b.id && o.age === undefined && !o.fake && !b.fake) : undefined;
    if (ex) ex.n += b.n; else out.push(b);
  }
  h.bag = out;
}
/** 物品入袋监听（界面用：获宝提示） */
export const itemListeners: ((id: string, n: number) => void)[] = [];
/** 入袋前检查同一物品所有堆叠的总量，以免数量或合计超出安全整数。 */
export function canAddItem(h: Hero, id: string, n: number, age?: number): boolean {
  if (typeof id !== 'string' || !id || !validCount(n) || (age !== undefined && !Number.isFinite(age))) return false;
  let total = n;
  for (const b of h.bag) if (b.id === id) { if (!validCount(b.n) || !Number.isSafeInteger(total + b.n)) return false; total += b.n; }
  return true;
}
function notifyItem(id: string, n: number) {
  for (const f of itemListeners) try { f(id, n); } catch (e) { console.warn('[inventory] item listener failed', e); }
}
function addItemSilent(h: Hero, id: string, n: number, age?: number): boolean {
  if (!canAddItem(h, id, n, age)) return false;
  if (n === 0) return true;
  const a = noAge(id, age);
  const ex = h.bag.find((b) => b.id === id && b.age === a && !b.fake);
  if (ex) ex.n += n; else h.bag.push({ id, n, age: a });
  sortBag(h); return true;
}
export function addItem(h: Hero, id: string, n: number, age?: number): boolean {
  if (!addItemSilent(h, id, n, age)) return false;
  if (n > 0) notifyItem(id, n);
  return true;
}
/** 人心篇：购入伪劣丹药 / 残缺玉简（未鉴定时单独成格但外观不露馅） */
function addFakeSilent(h: Hero, id: string, n: number, fake: 'dyed' | 'toxic' | 'broken', seller?: string, sellerName?: string, age?: number): boolean {
  if (!canAddItem(h, id, n, age)) return false;
  if (n === 0) return true;
  const a = noAge(id, age);
  const ex = h.bag.find((b) => b.id === id && b.age === a && b.fake === fake && !b.ident && b.seller === seller);
  if (ex) ex.n += n; else h.bag.push({ id, n, age: a, fake, ident: false, seller, sellerName });
  sortBag(h); return true;
}
export function addFakeItem(h: Hero, id: string, n: number, fake: 'dyed' | 'toxic' | 'broken', seller?: string, sellerName?: string, age?: number): boolean {
  if (!addFakeSilent(h, id, n, fake, seller, sellerName, age)) return false;
  if (n > 0) notifyItem(id, n);
  return true;
}
/** 最近一次误服/误用假货的记录（供 Game 层记入《苏寒随笔》与仇怨） */
export let lastFakeConsumed: { id: string; fake: 'dyed' | 'toxic' | 'broken'; seller?: string; sellerName?: string } | null = null;
export function takeLastFake() { const v = lastFakeConsumed; lastFakeConsumed = null; return v; }

/** 若已装备的法宝/护具/飞行器因消耗/交出/丢弃而彻底离开背包，自动同步清掉空装备位，避免幻影装备状态 */
export function syncEquipWithBag(h: Hero) {
  if (!h.equip) return;
  for (const k of ['armor', 'shield', 'flight', 'boots'] as const) {
    const id = h.equip[k];
    if (id && bagCount(h, id) <= 0) h.equip[k] = undefined;
  }
}

/** 批量移除物品，返回实际数量；保留不足时尽量消耗的旧规则。已鉴定假货不消耗。 */
export function removeItem(h: Hero, id: string, n: number, _minAge = 0): number {
  if (!validCount(n) || n === 0 || typeof id !== 'string' || !id) return 0;
  const stacks = h.bag.filter((b) => b.id === id && !(b.fake && b.ident)).sort((a, b) => (a.age ?? 0) - (b.age ?? 0));
  if (stacks.some(s => !validCount(s.n))) return 0;
  let left = n;
  for (const s of stacks) {
    const k = Math.min(left, s.n); s.n -= k; left -= k;
    if (k > 0 && s.fake) lastFakeConsumed = { id: s.id, fake: s.fake, seller: s.seller, sellerName: s.sellerName };
    if (left <= 0) break;
  }
  h.bag = h.bag.filter((b) => b.n > 0);
  syncEquipWithBag(h);
  return n - left;
}
/** 背包变更先在副本上验证并整体提交；通知只在成功提交后发送。
 * 假货消耗遵循 removeItem 的既有规则，失败不改变最近假货记录。 */
export interface InventoryOutput { id: string; n: number; age?: number; fake?: BagItem['fake']; ident?: boolean; seller?: string; sellerName?: string }
export function exchangeItems(h: Hero, remove: readonly { id: string; n: number }[], add: readonly InventoryOutput[]): boolean {
  return exchangeItemsWithCommit(h, remove, add);
}
export function exchangeItemsWithCommit(h: Hero, remove: readonly { id: string; n: number }[], add: readonly InventoryOutput[], onCommit?: () => void, selected?: BagItem, selectedCount = 1): boolean {
  if (!Array.isArray(h.bag) || !bagTotals(h.bag)) return false;
  const selectedIdx = selected ? h.bag.indexOf(selected) : -1;
  if (selected && (selectedIdx < 0 || !validCount(selected.n) || !validCount(selectedCount) || selectedCount < 1 || selected.n < selectedCount || (selected.fake && selected.ident))) return false;
  const copy = { ...h, bag: h.bag.map(b => ({ ...b })), equip: h.equip ? { ...h.equip } : {} };
  const previous = lastFakeConsumed;
  let resultingFake = previous;
  try {
    if (selected) {
      const take = copy.bag[selectedIdx]; take.n -= selectedCount;
      if (take.n === 0) copy.bag.splice(selectedIdx, 1);
      lastFakeConsumed = selected.fake ? { id: selected.id, fake: selected.fake, seller: selected.seller, sellerName: selected.sellerName } : null;
    }
    for (const x of remove) {
      if (!x || typeof x.id !== 'string' || !x.id || !validCount(x.n)) return false;
      if (x.n > 0 && removeItem(copy, x.id, x.n) !== x.n) return false;
    }
    for (const x of add) {
      if (!x || (x.fake && (x.ident || !['dyed', 'toxic', 'broken'].includes(x.fake)))) return false;
      if (!(x.fake ? addFakeSilent(copy, x.id, x.n, x.fake, x.seller, x.sellerName, x.age) : addItemSilent(copy, x.id, x.n, x.age))) return false;
    }
    resultingFake = lastFakeConsumed;
  } finally { lastFakeConsumed = previous; }
  h.bag = copy.bag;
  h.equip = copy.equip;
  syncEquipWithBag(h);
  lastFakeConsumed = resultingFake;
  onCommit?.();
  for (const x of add) if (x.n > 0) notifyItem(x.id, x.n);
  return true;
}
/** 指定格子交易：不会把同 ID 的另一堆（例如未鉴定假货）误当成所选物品。 */
export function exchangeSelectedItem(h: Hero, selected: BagItem, output: InventoryOutput, costs: readonly { id: string; n: number }[] = [], selectedCount = 1): boolean {
  if (!selected) return false;
  return exchangeItemsWithCommit(h, costs, [output], undefined, selected, selectedCount);
}
const TYPE_ORDER: Record<string, number> = { pill: 0, herb: 1, material: 2, talisman: 3, scroll: 4, artifact: 5, misc: 6 };
export function sortBag(h: Hero) {
  h.bag.sort((a, b) => {
    const da = itemDef(a.id), db = itemDef(b.id);
    return (TYPE_ORDER[da.type] - TYPE_ORDER[db.type]) || (db.tier - da.tier) || a.id.localeCompare(b.id) || (b.age ?? 0) - (a.age ?? 0);
  });
}

export interface Msg { text: string; kind?: 'info' | 'warn' | 'good' }

// 到下一道瓶颈为止可接纳的修为；防止瓶颈前奖励白白消耗感悟池。
function progressRoom(h: Hero, worldId: WorldId = ACTIVE_WORLD): number {
  if (isAtRealmCap(h.realm, h.stage, worldId)) return 0;
  const r = REALMS[h.realm], cap = worldRealmCap(worldId);
  if (!r) return 0;
  let total = 0;
  const maxStage = h.realm === cap.maxRealm ? Math.min(cap.maxStage, r.stages.length - 1) : r.stages.length - 1;
  for (let stage = h.stage; stage <= maxStage; stage++) {
    const nd = expNeed(h.realm, stage);
    if (!Number.isFinite(nd) || nd <= 0) return 0;
    total += Math.max(0, nd - (stage === h.stage ? h.exp : 0));
    if (!Number.isFinite(total)) return 0;
    if (stage === maxStage || smallBottleneck(h.realm, stage, worldId)) break;
  }
  return total;
}
/** 增加修为并返回实际获得量；不超过瓶颈，自动晋升无瓶颈的小境界。 */
export function gainExp(h: Hero, amount: number, out: Msg[], src: 'insight' | 'med' | 'pill' = 'insight', worldId: WorldId = ACTIVE_WORLD): number {
  if (!validCultivation(h) || !Number.isFinite(amount) || amount <= 0) return 0;
  if (isAtRealmCap(h.realm, h.stage, worldId)) {
    // 已触及或超越当前界域法则上限：只阻断在当前界域继续增长修为，绝不倒扣高境界修士的小境界。
    h.exp = Math.min(need(h), h.exp);
    return 0;
  }
  if (modx?.has('exp')) { const c = modx.fire('exp', { amount, source: src }); if (c.cancel) return 0; amount = hookNumber(c.amount) ?? 0; }
  if (!Number.isFinite(amount) || amount <= 0 || (src !== 'pill' && h.medStale !== undefined && (!Number.isFinite(h.medStale) || h.medStale < 0))) return 0;
  const room = progressRoom(h, worldId); if (room <= 0) return 0;
  let left = src === 'insight' ? wuTake(h, Math.min(amount, room)) : Math.min(amount, room);
  if (src === 'insight' && left > 0) temperDao(h, 0.08);
  let guard = 0, gained = 0;
  while (left > 0 && guard++ < 40) {
    const nd = need(h);
    const available = nd - h.exp;
    if (available <= 0) {
      if (bottleneck(h, worldId) === 'none' && !isLastStage(h, worldId)) { stageUp(h, out); continue; }
      break;
    }
    const k = Math.min(available, left);
    h.exp += k; left -= k; gained += k;
    if (src === 'med' && h.realm >= 2) h.medStale = (h.medStale ?? 0) + k / Math.max(1, nd);
    if (h.exp >= nd && bottleneck(h, worldId) === 'none' && !isLastStage(h, worldId)) stageUp(h, out);
  }
  return gained;
}

function stageUp(h: Hero, out: Msg[]) {
  h.exp = 0; h.stage++; h.stats.breaks++; h.pillN = 0; h.medStale = 0;
  out.push({ text: `修为精进，晋入${realmName(h.realm, h.stage)}！`, kind: 'good' });
  checkTalent(h);
}

function checkTalent(h: Hero) {
  const lv = levelOf(h.realm, h.stage);
  if (talentLevels().includes(lv) && !h.talentLevels.includes(lv)) {
    h.talentLevels.push(lv);
    const pool = TALENTS.filter((t) => !h.talents.includes(t.id));
    const pick: string[] = [];
    while (pick.length < 3 && pool.length) { const i = Math.floor(Math.random() * pool.length); pick.push(pool.splice(i, 1)[0].id); }
    h.pendingTalent = pick;
  }
}

export function chooseTalent(h: Hero, id: string) { if (h.pendingTalent?.includes(id)) { h.talents.push(id); h.pendingTalent = null; } }

/** 小瓶颈冲关概率（由 REALM_RULES 表驱动） */
export function smallChance(h: Hero, pills: number, worldId: WorldId = ACTIVE_WORLD) {
  const b = smallBottleneck(h.realm, h.stage, worldId);
  const req = b?.count ?? 0;
  const sc = realmRule(h.realm).smallChance;
  const base = sc.base + mod(h, 'luck') / 350;
  const per = sc.per / Math.max(1, req);
  return Math.min(sc.cap, base + per * pills * Math.max(1, req));
}
/** v0.70：冲击化神的成功率上限 */
export const HUASHEN_CAP = 0.10;
export function majorChance(h: Hero, pills: number, bonus = 0, worldId: WorldId = ACTIVE_WORLD) {
  const mb = MAJOR_BREAKS[h.realm];
  if (!mb || h.realm >= worldRealmCap(worldId).maxRealm) return 0;
  if (mb.minItems && pills < mb.minItems) return 0;
  const rootBonus = rootBreakBonus(h.root, h.realm);
  const aux = majorAuxBonus(h).bonus;
  const cap = realmRule(h.realm).majorCap;
  return Math.max(0.01, Math.min(cap, mb.base + mb.per * pills + rootBonus + mod(h, 'luck') / 500 + aux + bonus));
}

// 冲关前在背包副本上预演扣除，供钩子查看含假药惩罚的成功率；不触碰真实物品。
function previewBreakItems(h: Hero, id: string | undefined, n: number, major: boolean) {
  const copy = { ...h, bag: h.bag.map(b => ({ ...b })) };
  const previous = lastFakeConsumed;
  let fake: typeof lastFakeConsumed = null;
  let auxId: string | undefined;
  try {
    lastFakeConsumed = null;
    if (id && n > 0) removeItem(copy, id, n);
    fake = lastFakeConsumed;
    if (major) auxId = realmRule(h.realm).auxItems?.find((it) => it.consume && bagCount(copy, it.id) > 0)?.id;
    if (auxId) removeItem(copy, auxId, 1);
  } finally { lastFakeConsumed = previous; }
  return { copy, fake, auxId };
}

export function tryBreak(h: Hero, pills: number, bonus = 0, worldId: WorldId = ACTIVE_WORLD): { ok: boolean; msgs: Msg[] } {
  const msgs: Msg[] = [];
  if (!validCultivation(h) || !validCount(pills) || !Number.isFinite(bonus)) return { ok: false, msgs: [{ text: '冲关参数或修炼状态异常。', kind: 'warn' }] };
  const cap = worldRealmCap(worldId);
  if (isAtRealmCap(h.realm, h.stage, worldId)) return { ok: false, msgs: [{ text: `${realmCapDesc(worldId)}，无须再冲关。`, kind: 'warn' }] };
  const bt = bottleneck(h, worldId);
  if (bt === 'none') return { ok: false, msgs: [{ text: '修为未满，无须冲关。', kind: 'warn' }] };
  if (bt === 'small') {
    const b = smallBottleneck(h.realm, h.stage, worldId)!;
    const have = bagCount(h, b.item);
    pills = Math.min(pills, have, b.count * 2);
    const plan = previewBreakItems(h, b.item, pills, false), fk = plan.fake;
    const bagBefore = JSON.stringify(h.bag), realmBefore = h.realm, stageBefore = h.stage, expBefore = h.exp;
    let ch = Math.max(0.05, smallChance(h, pills, worldId) - (fk ? 0.25 : 0));
    if (modx?.has('breakthrough')) { const c = modx.fire('breakthrough', { realm: h.realm, stage: h.stage, major: false, chance: ch, pills }); if (c.cancel) return { ok: false, msgs: [{ text: (c as any).reason ?? '冥冥中似有阻碍，这一次没能冲关。', kind: 'warn' }] }; ch = Math.max(0, Math.min(1, hookNumber(c.chance) ?? 0)); }   // v0.57
    if (JSON.stringify(h.bag) !== bagBefore || h.realm !== realmBefore || h.stage !== stageBefore || h.exp !== expBefore) return { ok: false, msgs: [{ text: '冲关状态已变化，请重新选择丹药。', kind: 'warn' }] };
    lastFakeConsumed = null;
    if (pills > 0) removeItem(h, b.item, pills);
    if (fk) msgs.push({ text: `不好！所服${itemDef(b.item).name}竟是用凡丹染色的假药，药力半途溃散！`, kind: 'warn' });
    if (Math.random() < ch) { stageUp(h, msgs); msgs.unshift({ text: '灵力冲破瓶颈！', kind: 'good' }); return { ok: true, msgs }; }
    const loss = h.realm >= 3 ? 0.72 : 0.8;
    h.exp = Math.floor(h.exp * loss); h.stats.failed++;
    if (fk) inflictDaoHurt(h, 15, '误服假冲关丹，经脉逆冲');
    msgs.push({ text: `冲关失败，灵力反噬，修为倒退${h.realm >= 3 ? '近三成' : '两成'}${fk ? '，更添十五日道伤' : ''}。（成功率 ${(ch * 100).toFixed(0)}%）`, kind: 'warn' });
    return { ok: false, msgs };
  }
  // 大境界
  const mb = MAJOR_BREAKS[h.realm];
  if (!mb || h.realm >= cap.maxRealm || !REALMS[h.realm + 1]) {
    return { ok: false, msgs: [{ text: `${realmCapDesc(worldId)}，前路尚未开启。`, kind: 'warn' }] };
  }
  const have = mb.item ? bagCount(h, mb.item) : 0;
  if (mb.minItems && Math.min(pills, have) < mb.minItems) {
    return { ok: false, msgs: [{ text: `冲击${REALMS[h.realm + 1]?.name}凶险万分，至少须投入 ${mb.minItems} 份${itemDef(mb.item).name}（当前仅选/持有 ${Math.min(pills, have)} 份），强行空手冲关必死无疑！`, kind: 'warn' }] };
  }
  pills = Math.min(pills, have, mb.maxItems);
  const aux = majorAuxBonus(h);
  const plan = previewBreakItems(h, mb.item, pills, true), fk = plan.fake;
  const bagBefore = JSON.stringify(h.bag), realmBefore = h.realm, stageBefore = h.stage, expBefore = h.exp;
  // 维持原先按扣除后剩余护魂物计算的概率。
  let ch = Math.max(0.01, majorChance(plan.copy, pills, bonus - (fk ? 0.30 : 0) - aux.bonus, worldId) + aux.bonus);
  ch = Math.min(realmRule(h.realm).majorCap, ch);
  if (modx?.has('breakthrough')) { const c = modx.fire('breakthrough', { realm: h.realm, stage: h.stage, major: true, chance: ch, pills }); if (c.cancel) return { ok: false, msgs: [{ text: (c as any).reason ?? '冥冥中似有阻碍，这一次没能冲关。', kind: 'warn' }] }; ch = Math.max(0, Math.min(1, hookNumber(c.chance) ?? 0)); }
  if (JSON.stringify(h.bag) !== bagBefore || h.realm !== realmBefore || h.stage !== stageBefore || h.exp !== expBefore) return { ok: false, msgs: [{ text: '冲关状态已变化，请重新选择丹药。', kind: 'warn' }] };
  lastFakeConsumed = null;
  if (mb.item && pills > 0) removeItem(h, mb.item, pills);
  if (plan.auxId) removeItem(h, plan.auxId, 1);
  if (fk && mb.item) msgs.push({ text: `惊变！服下的${itemDef(mb.item).name}竟是淬体凡丹染色的伪丹——紧要关头药力全无，燥火倒灌经脉！`, kind: 'warn' });
  if (Math.random() < ch) {
    const fromR = h.realm;
    h.realm = Math.min(cap.maxRealm, h.realm + 1); h.stage = 0; h.exp = 0; h.stats.breaks++; h.pillN = 0;
    h.medStale = 0; h.peerKills = 0; h.mijingDone = 0;
    h.hp = 1; h.mp = 1; h.daoHurt = null;
    if (isAtRealmCap(h.realm, h.stage, worldId)) {
      h.exp = need(h);
      msgs.push({ text: `天道法则轰鸣，五色元神凌空凝就——你已踏足${realmCapDesc(worldId).replace('，最高止步', '之极境')}！寿元增至 ${maxLife(h)} 载！`, kind: 'good' });
    } else {
      const prefix = realmRule(fromR).breakSuccessPrefix ?? '';
      msgs.push({ text: `天地灵气倒灌，${prefix}${REALMS[h.realm].name}成矣！寿元增至 ${maxLife(h)} 载。`, kind: 'good' });
    }
    checkTalent(h);
    return { ok: true, msgs };
  }
  const fromR = h.realm;
  const fp = realmRule(fromR).failPenalty;
  const hurtDays = fp.hurtDays + (fk ? 16 : 0);
  h.exp = Math.floor(h.exp * fp.keepRatio);
  h.hp = fp.hp;
  h.lifeLost += fp.lifeCost; h.stats.failed++;
  inflictDaoHurt(h, hurtDays, fk ? '误服假丹冲击大境界，经脉寸断' : fp.hurtWhy);
  msgs.push({ text: `${MAJOR_BREAKS[fromR].desc.split('：')[0]}失败！天威反噬下经脉重创（道伤 ${h.daoHurt?.days ?? hurtDays} 日），修为倒退${Math.round((1 - fp.keepRatio) * 10)}成，折损 ${fp.lifeCost} 载寿元！（成功率 ${(ch * 100).toFixed(0)}%）`, kind: 'warn' });
  return { ok: false, msgs };
}

/** 时间流逝（天）：年龄、问道残卷、修炼 */
export function passDays(h: Hero, days: number, meditating: boolean, place: number, out: Msg[], expMultiplier = 1, worldId: WorldId = ACTIVE_WORLD) {
  if (h.dead) return;
  if (!validCultivation(h) || !Number.isFinite(days) || days < 0 || !Number.isFinite(place) || place < 0 || !Number.isFinite(expMultiplier) || expMultiplier < 0 || !Number.isFinite(h.age) || !Number.isFinite(h.age + days / 360) || !Number.isFinite(h.hp) || !Number.isFinite(h.mp) || !h.bottle || !Number.isFinite(h.bottle.charge) || !Number.isFinite(h.bottle.charge + days) || !validCount(h.bottle.drops) || (meditating && (!Number.isFinite(h.stats?.meditateDays) || !Number.isFinite(h.stats.meditateDays + days)))) return;
  h.age += days / 360;
  // 问道残卷聚露
  if (h.bottle.owned !== false && h.bottle.drops < BOTTLE_MAX) {
    h.bottle.charge += days;
    while (h.bottle.charge >= BOTTLE_DAYS && h.bottle.drops < BOTTLE_MAX) {
      h.bottle.charge -= BOTTLE_DAYS; h.bottle.drops++;
      out.push({ text: '问道残卷中凝出一滴墨露。', kind: 'good' });
    }
    if (h.bottle.drops >= BOTTLE_MAX) h.bottle.charge = 0;
  }
  // 气血法力缓慢恢复；闭关打坐可加速平复受损经脉（道伤）
  h.hp = Math.min(1, h.hp + days * (meditating ? 0.08 : 0.02));
  h.mp = Math.min(1, h.mp + days * (meditating ? 0.2 : 0.05));
  if (meditating) { gainExp(h, expPerDay(h, place, worldId) * days * expMultiplier, out, 'med', worldId); h.stats.meditateDays += days; }
  if (hasDaoHurt(h) && healDaoHurt(h, days * (meditating ? 1.8 : 1))) {
    out.push({ text: '受损的经脉终告平复，道伤尽去！', kind: 'good' });
  }
  if (h.healPillN && h.healPillN > 0) {
    const nextHeal = h.healPillN - days * (meditating ? 0.5 : 0.25);
    h.healPillN = nextHeal > 0.05 ? nextHeal : 0;
  }
  if (h.age >= maxLife(h)) { h.dead = true; out.push({ text: '寿元已尽……', kind: 'warn' }); }
}

/** 问道残卷 · 草木篇：一滴墨露让一株灵药一化为三（v0.70 起灵草不计年份） */
export const BOTTLE_GROW = 2;
export function useBottle(h: Hero, stack: BagItem): Msg {
  if (h.bottle.owned === false) return { text: '你还没有这样的宝物。', kind: 'warn' };
  if (h.bottle.drops <= 0) return { text: '残卷中尚无墨露。', kind: 'warn' };
  if (!h.bag.includes(stack) || !validCount(stack.n) || stack.n === 0 || (stack.fake && stack.ident) || itemDef(stack.id).type !== 'herb') return { text: '墨露只能滴在持有的灵药上。', kind: 'warn' };
  if (!validCount(h.bottle.drops) || !addItem(h, stack.id, BOTTLE_GROW)) return { text: '储物袋无法容纳更多灵药。', kind: 'warn' };
  h.bottle.drops--;
  return { text: `墨露渗进${itemDef(stack.id).name}的根须，药株一分为三——多得 ${BOTTLE_GROW} 株！`, kind: 'good' };
}

/** 服用（支持指定背包格子 bagIdx；兼容假丹药反噬与疗伤灵药平复道伤；全类丹药皆有丹毒/耐药约束） */
export function usePill(h: Hero, id: string, out: Msg[], bagIdx?: number, worldId: WorldId = ACTIVE_WORLD) {
  const d = itemDef(id);
  const isLignru = id === 'herb_yangshen';
  const e = d.pill ?? (isLignru ? { hp: 1, mp: 1, life: 5 } : undefined);
  if (!e) { out.push({ text: '此物不可直接服用。', kind: 'warn' }); return false; }
  const slot = bagIdx !== undefined ? h.bag[bagIdx] : undefined;
  const legacySenseUsed = h.sensePillBonus === undefined ? Math.min(SENSE_PILL_CAP, Math.max(0, h.senseBonus)) : h.sensePillBonus;
  const isPureSensePill = !!(e.sense && !e.exp && !e.expPct && !e.hp && !e.mp && !e.life);
  const isPureLifePill = !!(e.life && !e.exp && !e.expPct && !e.hp && !e.mp && !e.sense);
  if (!(slot && slot.id === id && slot.fake)) {
    if (isPureSensePill) {
      const sn = h.sensePillN ?? 0;
      const baseSenseGain = e.sense! * Math.pow(SENSE_PILL_FATIGUE, sn);
      const generalTox = Math.max(0.25, Math.pow(0.85, Math.max(0, (h.pillN ?? 0) - 2)));
      if (legacySenseUsed >= SENSE_PILL_CAP - SENSE_PILL_MIN_GAIN || baseSenseGain < SENSE_PILL_MIN_GAIN) {
        out.push({ text: '识海已对养魂类灵丹生出耐药与丹毒抗性（已达上限），再服亦难增半分神识。', kind: 'warn' });
        return false;
      }
      if (baseSenseGain * generalTox < SENSE_PILL_MIN_GAIN) {
        out.push({ text: '本境丹毒积郁未散，此时强服养魂丹药力难化，宜待破境散去浮毒后再服。', kind: 'warn' });
        return false;
      }
    }
    if (isPureLifePill && (h.lifePillN ?? 0) >= LIFE_PILL_MAX) {
      out.push({ text: '体内延寿灵丹药气已饱、丹毒郁结，再服延寿丹药已无寸功。', kind: 'warn' });
      return false;
    }
  }
  if (slot && slot.id === id) {
    if (!validCount(slot.n) || slot.n === 0) return false;
    if (slot.fake && slot.ident) { out.push({ text: '此丹已鉴明是伪劣假药，不可吞服！', kind: 'warn' }); return false; }
    slot.n -= 1;
    if (slot.fake) lastFakeConsumed = { id: slot.id, fake: slot.fake, seller: slot.seller, sellerName: slot.sellerName };
    else lastFakeConsumed = null;
    h.bag = h.bag.filter((b) => b.n > 0);
  } else {
    if (bagCount(h, id) <= 0) return false;
    lastFakeConsumed = null;
    if (removeItem(h, id, 1) !== 1) return false;
  }
  h.stats.pills++;
  // 人心篇：误服未鉴定的假丹药！
  if (lastFakeConsumed) {
    const fk = lastFakeConsumed;
    if (fk.fake === 'toxic') {
      h.hp = Math.max(0.08, h.hp - 0.25);
      inflictDaoHurt(h, 10, `误服掺了毒散的假${d.name}，经脉灼伤`);
      out.push({ text: `丹药入腹如吞火炭！这哪里是${d.name}，分明是掺了邪毒散的伪丹——经脉受损（道伤 10 日）！`, kind: 'warn' });
    } else {
      h.hp = Math.max(0.15, h.hp - 0.1);
      h.pillN = (h.pillN ?? 0) + 2;
      out.push({ text: `一口咽下，满嘴酸涩药渣味——这枚“${d.name}”竟是用廉价淬体丸染色的假丹！非但毫无灵力，反令丹毒淤积、气血翻涌。`, kind: 'warn' });
    }
    return true;
  }
  if (e.exp || e.expPct) {
    const before = h.exp, bs = h.stage, br = h.realm;
    // 高阶丹药对低境界效果更强，低阶丹药对高境界衰减
    const tierFit = Math.pow(0.35, Math.max(0, h.realm - 1 - d.tier));
    const fat = Math.pow(PILL_FATIGUE, h.pillN ?? 0); h.pillN = (h.pillN ?? 0) + 1;
    const raw = e.expPct
      ? need(h) * e.expPct * (gongfaDef(h).id === 'changchun' ? 1.1 : 1)
      : (e.exp ?? 0) * tierFit * (gongfaDef(h).id === 'changchun' ? 1.1 : 1);
    const cap = e.expPct ? need(h) * Math.min(0.25, e.expPct) : need(h) * PILL_CAP;
    gainExp(h, Math.min(raw, cap) * fat, out, 'pill', worldId);
    if (!e.expPct && raw > cap * 2.5) out.push({ text: '药力过猛，虚不受补——大半药力化作燥火散去了。', kind: 'warn' });
    if (fat < 0.3) out.push({ text: `丹毒积郁，药力已十不存${Math.max(1, Math.round(fat * 10))}——该静心苦修了。`, kind: 'warn' });
    if (h.stage === bs && h.realm === br && h.exp === before) out.push({ text: '修为已至瓶颈，药力白白流失。', kind: 'warn' });
    else out.push({ text: `药力化开，修为增长。`, kind: 'good' });
  }
  if (e.hp || e.mp) {
    const hn = h.healPillN ?? 0;
    const healFat = Math.max(0.25, Math.pow(0.85, Math.max(0, hn - 2)));
    h.healPillN = hn + 1;
    if (e.hp) { h.hp = Math.min(1, h.hp + e.hp * healFat); out.push({ text: healFat < 0.65 ? '伤势好转（药毒渐积，药效有所衰减）。' : '伤势好转。' }); }
    if (e.mp) { h.mp = Math.min(1, h.mp + e.mp * healFat); out.push({ text: healFat < 0.65 ? '法力回复（药毒渐积，药效有所衰减）。' : '法力回复。' }); }
  }
  if (e.life) {
    const ln = h.lifePillN ?? 0;
    const generalTox = Math.max(0.25, Math.pow(0.85, Math.max(0, (h.pillN ?? 0) - 2)));
    const lFat = ln >= LIFE_PILL_MAX ? 0 : Math.pow(LIFE_PILL_FATIGUE, ln) * generalTox;
    h.pillN = (h.pillN ?? 0) + 1;
    h.lifePillN = Math.min(LIFE_PILL_MAX, ln + 1);
    const years = Math.max(0, Math.round(e.life * lFat));
    if (years > 0) {
      h.lifeBonus += years;
      out.push({ text: lFat < 0.6 ? `丹毒与耐药所限，寿元仅增 ${years} 载。` : `寿元增加 ${years} 载。`, kind: lFat < 0.6 ? 'warn' : 'good' });
    } else {
      out.push({ text: '延寿丹药抗性已深，此次未能添寿。', kind: 'warn' });
    }
  }
  if (e.sense) {
    const generalTox = Math.max(0.25, Math.pow(0.85, Math.max(0, (h.pillN ?? 0) - 2)));
    const sn = h.sensePillN ?? 0;
    const sFat = Math.pow(SENSE_PILL_FATIGUE, sn);
    const prevSB = h.sensePillBonus ?? legacySenseUsed;
    const room = Math.max(0, SENSE_PILL_CAP - prevSB);
    const gain = Math.min(room, e.sense * sFat * generalTox);
    h.pillN = (h.pillN ?? 0) + 1;
    h.sensePillN = sn + 1;
    h.sensePillBonus = prevSB + gain;
    if (gain > 0.002) {
      h.senseBonus += gain;
      const pct = (gain * 100).toFixed(1);
      const usedPct = Math.min(100, Math.round((h.sensePillBonus / SENSE_PILL_CAP) * 100));
      if (sFat * generalTox < 0.5) {
        out.push({ text: `丹毒渐积且神魂渐生耐性，药力衰减明显——神识微增 +${pct}%（养魂耐药 ${usedPct}%）。`, kind: 'warn' });
      } else {
        out.push({ text: `神识更为凝练（+${pct}%，养魂耐药 ${usedPct}%）。`, kind: 'good' });
      }
    } else {
      out.push({ text: '识海丹毒抗性已深，此丹药力几近于无。', kind: 'warn' });
    }
  }
  if (e.root) {
    const idx = ROOTS.findIndex((r) => r.id === h.root);
    if (idx > 0) { h.root = ROOTS[idx - 1].id; out.push({ text: `灵根脱胎换骨，化为${ROOTS[idx - 1].name}！`, kind: 'good' }); }
  }
  if (e.favor) out.push({ text: '容颜似乎更显年轻……这丹药还是留着送人更好。' });
  // 灵药平复道伤（经脉受损）
  if (hasDaoHurt(h)) {
    const cure = isLignru ? 999
      : id === 'pill_dingxian_zhenshuai' || id === 'pill_xian_yunshen' ? 40
      : id === 'pill_lingjing_liaoshang' ? 25
      : id === 'pill_ningpo' || id === 'pill_yanghun' ? 20
      : id === 'pill_jinsui' ? 15
      : id === 'pill_liaoshang' ? 6 : 0;
    if (cure > 0) {
      if (healDaoHurt(h, cure)) out.push({ text: `${d.name}药力滋养周天，受损经脉彻底痊愈！`, kind: 'good' });
      else out.push({ text: `${d.name}温养经脉，道伤减轻（尚余 ${Math.ceil(h.daoHurt!.days)} 日，配合闭关调息更快）。`, kind: 'good' });
    }
  }
  return true;
}

// ---------------- 炼丹 ----------------
export interface AlchemyCheck { ok: boolean; chance: number; missing: string[]; ages: number[] }
function recipeNeeds(r: Recipe): Map<string, number> | null {
  if (!r || !Array.isArray(r.inputs)) return null;
  const totals = new Map<string, number>();
  for (const inp of r.inputs) {
    if (!inp || typeof inp.id !== 'string' || !inp.id || !validCount(inp.n) || (inp.minAge !== undefined && (!Number.isFinite(inp.minAge) || inp.minAge < 0))) return null;
    const n = inp.minAge ? ageToCount(inp.n, inp.minAge) : inp.n;
    const total = (totals.get(inp.id) ?? 0) + n;
    if (!validCount(n) || !validCount(total)) return null;
    totals.set(inp.id, total);
  }
  return totals;
}
export function checkRecipe(h: Hero, r: Recipe, fire = true): AlchemyCheck {
  const missing: string[] = [];
  const forge = r.kind === 'forge';
  if (forge && h.realm < r.reqRealm) missing.push(`修为不足（需${REALMS[r.reqRealm]?.name ?? '高阶'}期方能驾驭此器）`);
  // 第四十步：碧竹飞云剑——首炼 / 续炼 / 庚精淬剑
  const hasQz = bagCount(h, 'art_qingzhu') > 0, qn = hasQz ? (h.qzN ?? 12) : 0;
  if (r.special === 'qz' && hasQz) missing.push('你已炼有碧竹飞云剑——请用“续炼”添剑');
  if (r.special === 'qz_add') { if (!hasQz) missing.push('需先炼成碧竹飞云剑'); else if (qn >= 72) missing.push('已足七十二口'); }
  if (r.special === 'qz_geng') { if (!hasQz || qn < 72) missing.push(`需七十二口碧竹飞云剑（现有 ${qn} 口）`); else if (h.qzGeng) missing.push('庚精已熔入剑身'); }
  let bonus = 0;
  const needs = recipeNeeds(r);
  if (!needs || (!validCount(r.outN) || r.outN === 0) || !r.out || !Number.isFinite(r.days) || r.days < 0 || !Number.isFinite(r.base) || !Number.isFinite(r.reqRealm)) missing.push('配方数据异常');
  for (const [id, need] of needs ?? []) {
    const have = bagCount(h, id);
    if (have < need) missing.push(`${itemDef(id).name} ${have}/${need}`);
  }
  if (!forge && bagCount(h, 'mat_lingquan') > 0 && !r.inputs?.some((i) => i.id === 'mat_lingquan')) bonus += 0.05;
  // 炼器：境界越高、控火越稳；野外无地火，只能以法力代火
  if (forge) bonus += Math.max(0, h.realm - r.reqRealm) * 0.1;
  const realmPen = h.realm < r.reqRealm ? 0.5 : 1;
  const chance = Math.min(0.97, (r.base + bonus + mod(h, 'alchemy')) * realmPen * (forge && !fire ? 0.6 : 1));
  return { ok: missing.length === 0, chance, missing, ages: [] };
}

export function brew(h: Hero, r: Recipe, fire = true): { ok: boolean; msgs: Msg[]; days: number } {
  const c = checkRecipe(h, r, fire);
  if (!c.ok || !Number.isFinite(c.chance) || !validCount(h.stats.alchemy) || !Number.isSafeInteger(h.stats.alchemy + 1)) return { ok: false, msgs: [{ text: (r.kind === 'forge' ? '无法开炉：' : '药材不足：') + (c.missing.join('，') || '炼制数据异常'), kind: 'warn' }], days: 0 };
  const forge = r.kind === 'forge';
  const main = forge && r.special ? (r.special === 'qz_geng' ? 'mat_gengjing' : 'mat_jinleizhu') : '';
  const win = Math.random() < c.chance;
  const needs = recipeNeeds(r)!;
  const inputs = [...needs].filter(([id]) => win || id !== main).map(([id, n]) => ({ id, n }));
  // 续炼与淬剑只更新既有剑组，不产生新背包物。
  const hasOutput = win && !(forge && (r.special === 'qz_add' || r.special === 'qz_geng'));
  const n = hasOutput ? (forge ? 1 : r.outN + (mod(h, 'alchemy') > 0 ? 1 : 0) + (Math.random() < 0.15 ? 1 : 0)) : 0;
  if (!validCount(n) || !exchangeItemsWithCommit(h, inputs, hasOutput ? [{ id: r.out, n }] : [], () => {
    h.stats.alchemy++;
    if (forge && win && r.special === 'qz') h.qzN = 12;
    if (forge && win && r.special === 'qz_add') h.qzN = Math.min(72, (h.qzN ?? 12) + 12);
    if (forge && win && r.special === 'qz_geng') h.qzGeng = true;
  })) return { ok: false, msgs: [{ text: '材料或产物数量异常，无法开炉。', kind: 'warn' }], days: 0 };
  if (forge) {
    if (win && r.special === 'qz') { return { ok: true, msgs: [{ text: '竹液化作十二道青光没入剑胚，剑鸣如蜂——十二口碧竹飞云剑炼成！剑身上金色电弧跳动，伏魔金雷自蕴其中。', kind: 'good' }], days: r.days }; }
    if (win && r.special === 'qz_add') { return { ok: true, msgs: [{ text: `又是十二口飞剑出炉，与原有飞剑合为一套——碧竹飞云剑已有 ${h.qzN} 口。`, kind: 'good' }], days: r.days }; }
    if (win && r.special === 'qz_geng') { return { ok: true, msgs: [{ text: '庚精化作银色细流渗入七十二口飞剑，剑身锋芒内敛——大庚剑阵可布矣！', kind: 'good' }], days: r.days }; }
    if (r.special && !win) return { ok: false, msgs: [{ text: `火候一偏，辅材尽毁——好在${itemDef(main).name}完好无损。（成器率 ${(c.chance * 100).toFixed(0)}%）`, kind: 'warn' }], days: r.days };
    if (win) return { ok: true, msgs: [{ text: `炉中霞光冲起，器成！得${itemDef(r.out).name}。`, kind: 'good' }], days: r.days };
    return { ok: false, msgs: [{ text: `火候一偏，器胚崩裂，材料尽毁……（成器率 ${(c.chance * 100).toFixed(0)}%）`, kind: 'warn' }], days: r.days };
  }
  if (win) return { ok: true, msgs: [{ text: `丹成！得${itemDef(r.out).name} ×${n}。`, kind: 'good' }], days: r.days };
  return { ok: false, msgs: [{ text: `炉中一声闷响，药材化作焦灰……（成丹率 ${(c.chance * 100).toFixed(0)}%）`, kind: 'warn' }], days: r.days };
}

export { RECIPES };
