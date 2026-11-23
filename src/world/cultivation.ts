// 第二步：修炼与角色 —— 属性、灵根、功法、寿元、修为、瓶颈、突破、逆天改命、背包、问道残卷、炼丹、闭关
import { modx } from '../mod/hooks';
import { REALMS, ROOTS, expNeed, levelOf, realmName, smallBottleneck, MAJOR_BREAKS } from '../data/realms';
import { GONGFA, TALENTS, talentById, TalentMod } from '../data/skills';
import { itemDef } from '../data/items';
import { RECIPES, Recipe, ageToCount } from '../data/recipes';
import { START_ARTS, START_HOTBAR } from '../data/arts';
import { rollAffixes, setBonus, SETS, WORN_SLOTS, type Affix, type EquipSlot, type WearSlot, type GearStat, type GearSet } from '../data/gear';
import type { WeaponKind } from '../data/weapons';
// 收官 C：四个新属性名（罡气上限、近战伤害、避水、抗风）从这里也能拿到
export { STAT_POISE, STAT_MELEE, STAT_WATERWARD, STAT_WINDWARD } from '../data/gear';
export type { EquipSlot, GearSlot, WearSlot, GearStat, Affix } from '../data/gear';
export type { WeaponKind } from '../data/weapons';

export interface BagItem {
  id: string; n: number; age?: number;
  /** 收官 C：在所属页签里的格子序号（新东西落到第一个空格；只有「整理」才重排） */
  pos?: number;
  /** 收官 C：已穿在哪个槽上（装备 gear 用；已穿的仍留在袋里，只是格子里不显示） */
  worn?: EquipSlot;
  /** 收官 C：装备的独件编号与随机词条（所以装备不堆叠） */
  uid?: number;
  affix?: Affix[];
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
  /** 装备栏：值是物品 id。法衣、护盾、遁器、步履走 combat.castArtifact；收官 C 新增发冠、腰带、护腕、戒指、玉佩（gear，见 wearGear）与本命法宝（bindBond） */
  equip: { armor?: string; shield?: string; flight?: string; boots?: string; crown?: string; belt?: string; wrist?: string; ring?: string; pendant?: string; bond?: string; /** 近战兵器槽（可选；旧存档没有这一项照读） */ weapon?: string };
  /** 收官 C：装备独件编号计数 */
  gearSeq?: number;
  looted: string[];
  kills: number;
  /** 第三十六步：本小境界已服修为丹药数（耐药） */
  pillN?: number;
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
}

/** 第三十六步：奇遇、切磋、任务所得修为的折算（修为主要靠岁月苦修） */
export const INSIGHT = 0.12;
/** 第四十五步「天道」：单颗丹药的药力上限（占本小境界所需修为的比例）——高阶丹药虚不受补，一颗顶不了几十年 */
export const PILL_CAP = 0.05;
/** 第四十五步「天道」：奇遇、斗法、切磋、任务所得修为都从「感悟池」支取：池子每月回 0.12%，最多存 4%（占本小境界所需） */
export const WU_RATE = 0.001, WU_MAX = 0.03;
export function wuTake(h: Hero, amount: number) {
  const m = Math.floor(h.age * 12), nd = Math.max(1, need(h));
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
// 最高境界为化神初期（level 23），不再出现 24+ 等级
export const TALENT_LEVELS = [4, 7, 10, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

/** 久居闭关上限（占当前小境界所需修为比例）：筑基起纯闭关不可一蹴而就，必须外出斗法探秘印证道心 */
export function medStaleCap(h: Hero): number {
  if (h.realm <= 1) return 999;
  if (h.realm === 2) return 0.50;
  if (h.realm === 3) return 0.34;
  return 0.24;
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
  }
  return { ok: list.every((x) => x.ok), list };
}

/** 结婴 / 化神时储物袋中护魂奇珍提供的额外加成 */
export function majorAuxBonus(h: Hero): { bonus: number; names: string[] } {
  const names: string[] = [];
  let bonus = 0;
  if (h.realm === 3) {
    if (bagCount(h, 'mat_yanghunmu') > 0) { bonus += 0.04; names.push('养魂木'); }
    if (bagCount(h, 'pill_ningpo') > 0) { bonus += 0.04; names.push('凝魄丹'); }
    if (bagCount(h, 'herb_yangshen') > 0) { bonus += 0.03; names.push('万年灵乳'); }
  } else if (h.realm === 4) {
    if (bagCount(h, 'pill_zifu') > 0) { bonus += 0.04; names.push('紫府玄元丹'); }
    if (bagCount(h, 'mat_yanghunmu') > 0) { bonus += 0.03; names.push('养魂木'); }
    if (bagCount(h, 'pill_ningpo') > 0) { bonus += 0.03; names.push('凝魄丹'); }
  }
  return { bonus: Math.min(0.10, bonus), names };
}
export const BOTTLE_DAYS = 20;
export const BOTTLE_MAX = 3;
export const BOTTLE_YEARS = 100;   // v0.70 起不再使用（灵草不计年份），留给旧模组引用

export function newHero(): Hero {
  return {
    name: '苏寒', age: 17, realm: 1, stage: 4, exp: 0, root: 'fake', gongfa: 'changchun', talents: [], talentLevels: [],
    hp: 1, mp: 1, lifeBonus: 0, senseBonus: 0, lifeLost: 0,
    // 初入青霞谷：问道残卷（已凝一滴墨露）、邹大夫遗下的符箓与丹药、几块灵石
    bag: [{ id: 'item_bottle', n: 1 }, { id: 'herb_huangjing', n: 3 }, { id: 'pill_juqi', n: 2 }, { id: 'pill_huiqi', n: 3 }, { id: 'pill_liaoshang', n: 3 },
      { id: 'tal_fire', n: 6 }, { id: 'tal_jingang', n: 3 }, { id: 'tal_ice', n: 2 }, { id: 'tal_escape', n: 1 }, { id: 'mat_lingshi', n: 120 }, { id: 'art_qingfeng', n: 1 }],
    bottle: { drops: 1, charge: 0, owned: true }, pendingTalent: null, dead: false,
    stats: { meditateDays: 0, gathered: 0, pills: 0, breaks: 0, failed: 0, alchemy: 0 },
    arts: START_ARTS.map((id) => ({ id, xp: 0 })), hotbar: [...START_HOTBAR], equip: {}, looted: [], kills: 0,
  };
}

/** 属性加成：天赋 + 已穿装备（基础属性、词条、套装）。收官 C 起装备的加成也从这里进，另多了 poise / melee / waterward / windward 四项 */
export function mod(h: Hero, m: TalentMod | GearStat) { let v = 0; for (const id of h.talents) v += talentById(id)?.mods[m as TalentMod] ?? 0; return v + (gearMods(h)[m as GearStat] ?? 0); }

// ---------------- 收官 C：装备加成（缓存：穿脱时 gearRev 加一；袋子换了一份数组也重算） ----------------
let gearRev = 0;
const gearCache = new WeakMap<Hero, { rev: number; bag: BagItem[]; mods: Partial<Record<GearStat, number>> }>();
/** 已穿装备的全部加成（基础属性 + 词条 + 套装） */
export function gearMods(h: Hero): Partial<Record<GearStat, number>> {
  const c = gearCache.get(h);
  if (c && c.rev === gearRev && c.bag === h.bag) return c.mods;
  const mods: Partial<Record<GearStat, number>> = {};
  const add = (k: GearStat, v: number) => { mods[k] = Math.round(((mods[k] ?? 0) + v) * 10000) / 10000; };
  const sets: Partial<Record<GearSet, number>> = {};
  for (const b of h.bag ?? []) {
    if (!b.worn || b.worn === 'bond') continue;
    const g = itemDef(b.id).gear; if (!g) continue;
    for (const [k, v] of Object.entries(g.base) as [GearStat, number][]) add(k, v);
    for (const a of b.affix ?? []) add(a.k, a.v);
    if (g.set) sets[g.set] = (sets[g.set] ?? 0) + 1;
  }
  for (const [s, n] of Object.entries(sets) as [GearSet, number][]) for (const [k, v] of Object.entries(setBonus(s, n)) as [GearStat, number][]) add(k, v);
  gearCache.set(h, { rev: gearRev, bag: h.bag, mods });
  return mods;
}
/** 套装进度：{ 套装: 已穿件数 } */
export function setProgress(h: Hero): Partial<Record<GearSet, number>> {
  const out: Partial<Record<GearSet, number>> = {};
  for (const b of h.bag) if (b.worn && b.worn !== 'bond') { const s = itemDef(b.id).gear?.set; if (s) out[s] = (out[s] ?? 0) + 1; }
  return out;
}
export { SETS };

// ---------------- 收官 C：格子位置 ----------------
/** 储物袋的五个页签 */
export type BagTab = 'gear' | 'pill' | 'mat' | 'scroll' | 'misc';
export const BAG_TABS: BagTab[] = ['gear', 'pill', 'mat', 'scroll', 'misc'];
export function tabOf(id: string): BagTab {
  const t = itemDef(id).type;
  return t === 'gear' || t === 'artifact' ? 'gear' : t === 'pill' ? 'pill' : t === 'herb' || t === 'material' ? 'mat' : t === 'scroll' || t === 'talisman' ? 'scroll' : 'misc';
}
/** 法衣 / 护盾 / 遁器 / 步履 这类法宝是否穿着（值里存的是物品 id） */
function artWorn(h: Hero, id: string) { const q = h.equip ?? {}; return q.armor === id || q.shield === id || q.flight === id || q.boots === id; }
/** 格子里显示几件（已穿的不显示：gear 整件藏起；法衣之类按 id 穿着，扣掉一件） */
export function shownCount(h: Hero, b: BagItem) { if (b.worn) return 0; return artWorn(h, b.id) && h.bag.find((x) => x.id === b.id) === b ? b.n - 1 : b.n; }
/** 储物袋某一页签的格子（序号 → 那一堆）：界面照这个画，测试也照这个查（先 ensureBagPos 补好排位） */
export function bagCells(h: Hero, tab: BagTab): Map<number, BagItem> {
  const cells = new Map<number, BagItem>();
  for (const b of h.bag) if (shownCount(h, b) > 0 && tabOf(b.id) === tab && b.pos !== undefined) cells.set(b.pos, b);
  return cells;
}
/** 页签里第一个空格 */
export function freePos(h: Hero, tab: BagTab, skip?: BagItem) {
  const used = new Set<number>();
  for (const b of h.bag) if (b !== skip && b.pos !== undefined && shownCount(h, b) > 0 && tabOf(b.id) === tab) used.add(b.pos);
  let p = 0; while (used.has(p)) p++;
  return p;
}
/** 给没排位的（旧存档、模组直接 push 进来的）补排位；同一格撞了的，后来的挪到空格。按袋中原来的顺序补，旧存档看上去和原来一样 */
export function ensureBagPos(h: Hero) {
  const used: Record<string, Set<number>> = {};
  const need: BagItem[] = [];
  for (const b of h.bag) {
    if (shownCount(h, b) <= 0) continue;
    const t = tabOf(b.id), u = (used[t] ??= new Set());
    if (b.pos === undefined || b.pos < 0 || u.has(b.pos)) need.push(b); else u.add(b.pos);
  }
  for (const b of need) { const u = (used[tabOf(b.id)] ??= new Set()); let p = 0; while (u.has(p)) p++; b.pos = p; u.add(p); }
}

export function rootDef(h: Hero) { return ROOTS.find((r) => r.id === h.root) ?? ROOTS[ROOTS.length - 1]; }
export function gongfaDef(h: Hero) { return GONGFA[h.gongfa] ?? GONGFA.generic; }

export function maxLife(h: Hero) { return Math.round(REALMS[h.realm].life * (1 + mod(h, 'life')) + h.lifeBonus - h.lifeLost); }

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

export function heroStats(h: Hero) {
  // 小阶越界时取最近的有效小阶（各境界的小阶数不同：炼气十三层，筑基以上只有初中后三期）。
  // 否则下面全是「数组里没有的那一项」，血量、神识都成了无效数值，画面会整片洗白、敌人处出黑块
  const R = REALMS[h.realm], s = Math.max(0, Math.min(h.stage | 0, R.stages.length - 1)), gf = gongfaDef(h);
  const hurtMp = hasDaoHurt(h) ? 0.8 : 1;   // 道伤·经脉受损：法力上限 -20%
  return {
    hp: Math.round(R.hp[s] * (1 + (gf.hp ?? 0) + mod(h, 'hp'))),
    mp: Math.max(1, Math.round(R.mp[s] * (1 + (gf.mp ?? 0) + mod(h, 'mp')) * hurtMp)),
    atk: Math.round(R.atk[s] * (1 + (gf.atk ?? 0) + mod(h, 'atk'))),
    def: Math.round(R.def[s] * (1 + (gf.def ?? 0) + mod(h, 'def'))),
    sense: Math.round(R.sense[s] * (1 + mod(h, 'sense') + h.senseBonus)),
    speed: 1 + mod(h, 'speed'),
    luck: mod(h, 'luck'),
  };
}

/** 每日修为 */
export function expPerDay(h: Hero, place = 1) {
  const gf = gongfaDef(h);
  const over = h.realm > gf.maxRealm ? 0.5 : 1;
  const hurtExp = hasDaoHurt(h) ? 0.6 : 1;  // 道伤·经脉受损：修炼速度 -40%
  const staleMul = isMedStale(h) ? 0.12 : 1; // 久居闭关不历红尘：打坐收益骤减
  return 10 * softRate(rootDef(h).rate * gf.rate * over * (1 + mod(h, 'exp')) * place) * hurtExp * staleMul;
}

export function need(h: Hero) { return expNeed(h.realm, h.stage); }
export function isLastStage(h: Hero) { return h.realm >= 5 || h.stage >= REALMS[h.realm].stages.length - 1; }
/** 当前是否卡在瓶颈（修为已满但需手动突破；化神初期已臻人界极致） */
export function bottleneck(h: Hero): 'none' | 'small' | 'major' {
  if (h.realm >= 5) return 'none';
  if (h.exp < need(h)) return 'none';
  if (isLastStage(h)) return 'major';
  return smallBottleneck(h.realm, h.stage) ? 'small' : 'none';
}

/** v0.70：灵草不计年份——minAge 参数保留（旧调用 / 模组不报错）但不再生效 */
export function bagCount(h: Hero, id: string, _minAge = 0) {
  let n = 0;
  for (const b of h.bag) if (b.id === id && !(b.fake && b.ident)) n += b.n;
  return n;
}
/** 灵草入袋一律不记年份（同种灵草合成一格） */
const noAge = (id: string, age?: number) => (age === undefined || itemDef(id)?.type === 'herb' ? undefined : Math.round(age));
/** v0.70：旧存档里分年份的灵草合并成一格。
 *  装备（gear：兵器、发冠……）每件单独一格、各带独件编号 / 词条 / 穿戴记号，绝不能合：原先只看「同 id、无年份」，
 *  身上穿着一把、袋里还有一把同名的，读档就被并进身上那把（n=2、带着穿戴记号，格子里不显示）——袋里那把「拿到了却不见了」。
 *  已经被并过的旧存档：把 n > 1 的装备拆回一件一格（拆出来的没穿、词条照抄那一格的，不另摇随机数） */
export function mergeHerbs(h: Hero) {
  const out: BagItem[] = [];
  for (const b of h.bag) {
    const d = itemDef(b.id);
    if (d?.type === 'gear') {
      out.push(b);
      for (; b.n > 1; b.n--) { h.gearSeq = (h.gearSeq ?? 0) + 1; out.push({ id: b.id, n: 1, uid: h.gearSeq, affix: (b.affix ?? []).map((a) => ({ ...a })) }); }
      continue;
    }
    if (d?.type === 'herb') b.age = undefined;
    const ex = b.age === undefined ? out.find((o) => o.id === b.id && o.age === undefined && !o.fake && !b.fake) : undefined;
    if (ex) ex.n += b.n; else out.push(b);
  }
  h.bag = out;
}
/** 物品入袋监听（界面用：获宝提示） */
export const itemListeners: ((id: string, n: number) => void)[] = [];
/** 收官 C：装备词条用的随机数（测试可以换成固定序列）。只在给 gear 的分支里取，别的物品路径上一个随机数都不多取 */
export const gearRng = { next: () => Math.random() };
/** 入袋：同类堆叠；新的一堆落到所属页签的第一个空格（收官 C 起不再每次重排，「整理」才排）。给装备时自己摇词条、自己找格子，每件单独一格 */
export function addItem(h: Hero, id: string, n: number, age?: number) {
  for (const f of itemListeners) f(id, n);
  const d = itemDef(id);
  if (d.type === 'gear') {
    for (let i = 0; i < n; i++) {
      h.gearSeq = (h.gearSeq ?? 0) + 1;
      h.bag.push({ id, n: 1, uid: h.gearSeq, affix: rollAffixes(d.tier, gearRng.next), pos: freePos(h, 'gear') });
    }
    return;
  }
  const a = noAge(id, age);
  const ex = h.bag.find((b) => b.id === id && b.age === a && !b.fake);
  if (ex) ex.n += n; else h.bag.push({ id, n, age: a, pos: freePos(h, tabOf(id)) });
}
/** 收官 D：把一件带着词条的装备原样放进袋里（摊位买来、万宝楼领回的——词条跟着走，不重摇；不给词条才按 addItem 摇） */
export function addGearItem(h: Hero, id: string, affix?: Affix[]) {
  if (!affix) { addItem(h, id, 1); return; }
  for (const f of itemListeners) f(id, 1);
  h.gearSeq = (h.gearSeq ?? 0) + 1;
  h.bag.push({ id, n: 1, uid: h.gearSeq, affix: affix.map((a) => ({ ...a })), pos: freePos(h, 'gear') });
}
/** 人心篇：购入伪劣丹药 / 残缺玉简（未鉴定时单独成格但外观不露馅） */
export function addFakeItem(h: Hero, id: string, n: number, fake: 'dyed' | 'toxic' | 'broken', seller?: string, sellerName?: string, age?: number) {
  for (const f of itemListeners) f(id, n);
  const a = noAge(id, age);
  const ex = h.bag.find((b) => b.id === id && b.age === a && b.fake === fake && !b.ident && b.seller === seller);
  if (ex) ex.n += n; else h.bag.push({ id, n, age: a, fake, ident: false, seller, sellerName, pos: freePos(h, tabOf(id)) });
}
/** 最近一次误服/误用假货的记录（供 Game 层记入《苏寒随笔》与仇怨） */
export let lastFakeConsumed: { id: string; fake: 'dyed' | 'toxic' | 'broken'; seller?: string; sellerName?: string } | null = null;
export function takeLastFake() { const v = lastFakeConsumed; lastFakeConsumed = null; return v; }

/** 移除物品（优先消耗年份恰好够的；已鉴定的假货不会被正常消耗） */
export function removeItem(h: Hero, id: string, n: number, _minAge = 0) {
  // 收官 C：已穿的装备不会被当成材料、货物扣掉
  const stacks = h.bag.filter((b) => b.id === id && !b.worn && !(b.fake && b.ident)).sort((a, b) => (a.age ?? 0) - (b.age ?? 0));
  let left = n;
  const used: number[] = [];
  for (const s of stacks) {
    const k = Math.min(left, s.n); s.n -= k; left -= k;
    if (k > 0 && s.fake) lastFakeConsumed = { id: s.id, fake: s.fake, seller: s.seller, sellerName: s.sellerName };
    for (let i = 0; i < k; i++) used.push(s.age ?? 0);
    if (left <= 0) break;
  }
  h.bag = h.bag.filter((b) => b.n > 0);
  return used;
}
const TYPE_ORDER: Record<string, number> = { pill: 0, herb: 1, material: 2, talisman: 3, scroll: 4, gear: 5, artifact: 6, misc: 7 };
/** 整理：按类别、品阶、名字排好，并把每个页签的格子从头重新排位（收官 C 起只给「整理」按钮用） */
export function sortBag(h: Hero) {
  h.bag.sort((a, b) => {
    const da = itemDef(a.id), db = itemDef(b.id);
    return ((TYPE_ORDER[da.type] ?? 9) - (TYPE_ORDER[db.type] ?? 9)) || (db.tier - da.tier) || a.id.localeCompare(b.id) || (b.age ?? 0) - (a.age ?? 0) || (a.uid ?? 0) - (b.uid ?? 0);
  });
  const next: Record<string, number> = {};
  for (const b of h.bag) { if (shownCount(h, b) <= 0) continue; const t = tabOf(b.id); b.pos = next[t] ?? 0; next[t] = b.pos + 1; }
}
/** 把一格挪到同页签的另一格；那格有东西就互换 */
export function moveBagItem(h: Hero, b: BagItem, pos: number) {
  const t = tabOf(b.id);
  const other = h.bag.find((x) => x !== b && x.pos === pos && shownCount(h, x) > 0 && tabOf(x.id) === t);
  if (other) other.pos = b.pos ?? freePos(h, t, other);
  b.pos = pos;
}

// ---------------- 收官 C：穿脱 ----------------
/** 这件东西能放哪个槽（gear 看自己的槽位；法衣、护盾、遁器、步履按法宝种类；攻击法宝只能做本命） */
export function slotOf(id: string): EquipSlot | null {
  const d = itemDef(id);
  if (d.gear) return d.gear.slot;
  const k = d.art?.kind; if (!k) return null;
  return k === 'armor' ? 'armor' : k === 'shield' ? 'shield' : k === 'boots' ? 'boots' : k === 'flight' || k === 'wings' ? 'flight' : 'bond';
}
/** 这件东西能不能放进这个槽（储物袋拖拽认它；兵器只进兵器槽，护腕槽不收兵器） */
export function slotAccepts(slot: EquipSlot, id: string): boolean { return slotOf(id) === slot; }
/** 槽上那件（gear 按记号找；其余按 equip 里的 id 找第一堆） */
export function wornIn(h: Hero, slot: EquipSlot): BagItem | undefined {
  if ((WORN_SLOTS as string[]).includes(slot)) return h.bag.find((b) => b.worn === slot);
  const id = h.equip?.[slot]; return id ? h.bag.find((b) => b.id === id) : undefined;
}
/** 穿上一件装备（gear）：同槽原来那件卸回袋里的空格 */
export function wearGear(h: Hero, b: BagItem): { ok: boolean; msg: string } {
  const g = itemDef(b.id).gear;
  if (!g || !h.bag.includes(b)) return { ok: false, msg: '这件穿不上。' };
  if (b.worn === g.slot) return { ok: true, msg: '' };
  const old = h.bag.find((x) => x.worn === g.slot);
  const from = b.pos;
  b.worn = g.slot; b.pos = undefined;
  if (old) { old.worn = undefined; old.pos = from ?? freePos(h, 'gear'); }   // 换下来的那件放到新那件原来的格子
  (h.equip as Record<string, string | undefined>)[g.slot] = b.id;
  gearRev++;
  return { ok: true, msg: `穿上${itemDef(b.id).name}` };
}
/** 卸下某槽的装备（gear）；pos 给了就放到那一格（有东西就互换不了，改落空格） */
export function unwearGear(h: Hero, slot: WearSlot, pos?: number): BagItem | undefined {
  const b = h.bag.find((x) => x.worn === slot); if (!b) return undefined;
  b.worn = undefined;
  const taken = pos !== undefined && h.bag.some((x) => x !== b && x.pos === pos && shownCount(h, x) > 0 && tabOf(x.id) === 'gear');
  b.pos = pos !== undefined && !taken ? pos : freePos(h, 'gear', b);
  (h.equip as Record<string, string | undefined>)[slot] = undefined;
  gearRev++;
  return b;
}
/** 本命法宝：绑定一件攻击法宝（伤害加成见 data/gear 的 BOND_MUL）；再绑同一件是解绑 */
export function bindBond(h: Hero, id: string | undefined): boolean {
  if (id && (slotOf(id) !== 'bond' || bagCount(h, id) <= 0)) return false;
  h.equip.bond = id && h.equip.bond !== id ? id : undefined;
  gearRev++;
  return true;
}
/** 读档后：袋里的穿戴记号和 equip 对齐（gear 槽只认袋里打了记号的那件） */
export function syncWorn(h: Hero) {
  const q = h.equip as Record<string, string | undefined>;
  for (const s of WORN_SLOTS) { const b = h.bag.find((x) => x.worn === s); q[s] = b?.id; }
  for (const b of h.bag) if (b.worn && b.worn !== 'bond' && !(WORN_SLOTS as string[]).includes(b.worn)) b.worn = undefined;
  if (q.bond && bagCount(h, q.bond) <= 0) q.bond = undefined;
  gearRev++;
}

// ---------------- 近战兵器：此刻手里握的是什么 ----------------
/** heldWeapon 的结果：kind 兵器种类；item 物品 id（空手没有）；tier 品阶；from 从哪来（兵器槽 / 剑类本命法宝 / 空手） */
export interface HeldWeapon { kind: WeaponKind; item?: string; tier: number; from: 'slot' | 'bond' | 'none' }
/**
 * 给近战用：兵器槽里有就用它；槽空着、本命法宝是飞剑类（art.kind === 'sword'）就算握着这口剑（from: 'bond'）；都没有是空手。
 * 护腕（拳套）槽不受影响，它的近战属性对所有兵器都生效（照常从 mod(h, 'melee') 进）。
 */
export function heldWeapon(h: Hero): HeldWeapon {
  const b = h.bag?.find((x) => x.worn === 'weapon');
  const g = b ? itemDef(b.id).gear : undefined;
  if (b && g?.weapon && g.weapon !== 'fist') return { kind: g.weapon, item: b.id, tier: itemDef(b.id).tier, from: 'slot' };
  const bond = h.equip?.bond;
  if (bond && bagCount(h, bond) > 0) {
    const d = itemDef(bond);
    if (d.art?.kind === 'sword') return { kind: 'sword', item: bond, tier: d.tier, from: 'bond' };
  }
  return { kind: 'fist', tier: 0, from: 'none' };
}
/** 剑类本命法宝握在手里时的剑光色（法宝自己的颜色） */
export function bondSwordColor(id: string): string | undefined { const d = itemDef(id); return d.art?.kind === 'sword' ? d.art.color : undefined; }

export interface Msg { text: string; kind?: 'info' | 'warn' | 'good' }

/** 增加修为；不超过瓶颈。自动晋升无瓶颈的小境界。返回消息。 */
export function gainExp(h: Hero, amount: number, out: Msg[], src: 'insight' | 'med' | 'pill' = 'insight') {
  if (h.realm >= 5) { h.stage = 0; h.exp = Math.min(need(h), h.exp); return; } // 化神初期已是最高境界封顶
  if (modx?.has('exp')) { const c = modx.fire('exp', { amount, source: src }); if (c.cancel) return; amount = Math.max(0, +c.amount || 0); }   // v0.57
  if (src === 'insight' && amount > 0) temperDao(h, 0.08);
  let left = src === 'insight' ? wuTake(h, amount) : amount;
  let guard = 0;
  while (left > 0 && guard++ < 40) {
    const nd = need(h);
    const room = nd - h.exp;
    if (room <= 0) {
      if (bottleneck(h) === 'none' && !isLastStage(h)) { stageUp(h, out); continue; }
      break;
    }
    const k = Math.min(room, left);
    h.exp += k; left -= k;
    if (src === 'med' && h.realm >= 2) h.medStale = (h.medStale ?? 0) + k / Math.max(1, nd);
    if (h.exp >= nd && bottleneck(h) === 'none' && !isLastStage(h)) stageUp(h, out);
  }
}

function stageUp(h: Hero, out: Msg[]) {
  h.exp = 0; h.stage++; h.stats.breaks++; h.pillN = 0; h.medStale = 0;
  out.push({ text: `修为精进，晋入${realmName(h.realm, h.stage)}！`, kind: 'good' });
  checkTalent(h);
}

function checkTalent(h: Hero) {
  const lv = levelOf(h.realm, h.stage);
  if (TALENT_LEVELS.includes(lv) && !h.talentLevels.includes(lv)) {
    h.talentLevels.push(lv);
    const pool = TALENTS.filter((t) => !h.talents.includes(t.id));
    const pick: string[] = [];
    while (pick.length < 3 && pool.length) { const i = Math.floor(Math.random() * pool.length); pick.push(pool.splice(i, 1)[0].id); }
    h.pendingTalent = pick;
  }
}

export function chooseTalent(h: Hero, id: string) { if (h.pendingTalent?.includes(id)) { h.talents.push(id); h.pendingTalent = null; } }

/** 小瓶颈冲关概率（越往高阶小瓶颈亦更严苛） */
export function smallChance(h: Hero, pills: number) {
  const b = smallBottleneck(h.realm, h.stage);
  const req = b?.count ?? 0;
  const base = (h.realm >= 4 ? 0.18 : h.realm === 3 ? 0.24 : h.realm === 2 ? 0.30 : 0.38) + mod(h, 'luck') / 350;
  const per = (h.realm >= 4 ? 0.24 : 0.28) / Math.max(1, req);
  return Math.min(h.realm >= 4 ? 0.88 : 0.94, base + per * pills * Math.max(1, req));
}
/** v0.70：冲击化神的成功率上限 */
export const HUASHEN_CAP = 0.10;
export function majorChance(h: Hero, pills: number, bonus = 0) {
  const mb = MAJOR_BREAKS[h.realm];
  if (!mb || h.realm >= 5) return 0;
  if (mb.minItems && pills < mb.minItems) return 0;
  const rootBonus = rootDef(h).rate * (h.realm >= 4 ? 0.008 : h.realm === 3 ? 0.012 : 0.022);
  const aux = majorAuxBonus(h).bonus;
  // v0.70：冲击化神成功率最高一成（人界至高天堑）
  const cap = h.realm >= 4 ? HUASHEN_CAP : h.realm === 3 ? 0.76 : h.realm === 2 ? 0.85 : 0.90;
  return Math.max(0.01, Math.min(cap, mb.base + mb.per * pills + rootBonus + mod(h, 'luck') / 500 + aux + bonus));
}

export function tryBreak(h: Hero, pills: number, bonus = 0): { ok: boolean; msgs: Msg[] } {
  const msgs: Msg[] = [];
  if (h.realm >= 5) return { ok: false, msgs: [{ text: '已臻人界至高境界「化神初期」，此界法则所限，无须再冲关。', kind: 'warn' }] };
  const bt = bottleneck(h);
  if (bt === 'none') return { ok: false, msgs: [{ text: '修为未满，无须冲关。', kind: 'warn' }] };
  if (bt === 'small') {
    const b = smallBottleneck(h.realm, h.stage)!;
    const have = bagCount(h, b.item);
    pills = Math.min(pills, have, b.count * 2);
    lastFakeConsumed = null;
    removeItem(h, b.item, pills);
    const fk = lastFakeConsumed;
    let ch = Math.max(0.05, smallChance(h, pills) - (fk ? 0.25 : 0));
    if (modx?.has('breakthrough')) { const c = modx.fire('breakthrough', { realm: h.realm, stage: h.stage, major: false, chance: ch, pills }); if (c.cancel) return { ok: false, msgs: [{ text: (c as any).reason ?? '冥冥中似有阻碍，这一次没能冲关。', kind: 'warn' }] }; ch = Math.max(0, Math.min(1, +c.chance || 0)); }   // v0.57
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
  const have = mb.item ? bagCount(h, mb.item) : 0;
  if (mb.minItems && Math.min(pills, have) < mb.minItems) {
    return { ok: false, msgs: [{ text: `冲击${REALMS[h.realm + 1]?.name}凶险万分，至少须投入 ${mb.minItems} 份${itemDef(mb.item).name}（当前仅选/持有 ${Math.min(pills, have)} 份），强行空手冲关必死无疑！`, kind: 'warn' }] };
  }
  pills = Math.min(pills, have, mb.maxItems);
  const aux = majorAuxBonus(h);
  lastFakeConsumed = null;
  if (mb.item && pills > 0) removeItem(h, mb.item, pills);
  const fk = lastFakeConsumed;
  // 消耗一枚辅助护魂丹药（养魂木为随身奇木不消耗，丹药灵乳消耗 1 份）
  if (h.realm === 3) {
    if (bagCount(h, 'pill_ningpo') > 0) removeItem(h, 'pill_ningpo', 1);
    else if (bagCount(h, 'herb_yangshen') > 0) removeItem(h, 'herb_yangshen', 1);
  } else if (h.realm === 4) {
    if (bagCount(h, 'pill_zifu') > 0) removeItem(h, 'pill_zifu', 1);
    else if (bagCount(h, 'pill_ningpo') > 0) removeItem(h, 'pill_ningpo', 1);
  }
  let ch = Math.max(0.01, majorChance(h, pills, bonus - (fk ? 0.30 : 0) - aux.bonus) + aux.bonus);
  if (h.realm >= 4) ch = Math.min(HUASHEN_CAP, ch);   // 辅助丹药也越不过一成
  if (modx?.has('breakthrough')) { const c = modx.fire('breakthrough', { realm: h.realm, stage: h.stage, major: true, chance: ch, pills }); if (c.cancel) return { ok: false, msgs: [{ text: (c as any).reason ?? '冥冥中似有阻碍，这一次没能冲关。', kind: 'warn' }] }; ch = Math.max(0, Math.min(1, +c.chance || 0)); }   // v0.57
  if (fk && mb.item) msgs.push({ text: `惊变！服下的${itemDef(mb.item).name}竟是淬体凡丹染色的伪丹——紧要关头药力全无，燥火倒灌经脉！`, kind: 'warn' });
  if (Math.random() < ch) {
    const fromR = h.realm;
    h.realm = Math.min(5, h.realm + 1); h.stage = 0; h.exp = 0; h.stats.breaks++; h.pillN = 0;
    h.medStale = 0; h.peerKills = 0; h.mijingDone = 0;
    h.hp = 1; h.mp = 1; h.daoHurt = null;
    if (h.realm >= 5) {
      h.exp = need(h);
      msgs.push({ text: `天道法则轰鸣，五色元神凌空凝就——你已踏足人界至高之境「化神初期」！寿元增至 ${maxLife(h)} 载，俯瞰万里人界！`, kind: 'good' });
    } else {
      msgs.push({ text: `天地灵气倒灌，${fromR === 3 ? '金丹寸碎、元婴破壳而出——' : ''}${REALMS[h.realm].name}成矣！寿元增至 ${maxLife(h)} 载。`, kind: 'good' });
    }
    checkTalent(h);
    return { ok: true, msgs };
  }
  const fromR = h.realm;
  const keepRatio = fromR >= 4 ? 0.50 : fromR === 3 ? 0.55 : fromR === 2 ? 0.65 : 0.70;
  const hurtDays = (fromR >= 4 ? 60 : fromR === 3 ? 42 : fromR === 2 ? 28 : 20) + (fk ? 16 : 0);
  const lifeCost = fromR >= 4 ? 30 : fromR === 3 ? 12 : fromR === 2 ? 6 : 3;
  h.exp = Math.floor(h.exp * keepRatio);
  h.hp = fromR >= 4 ? 0.10 : fromR === 3 ? 0.18 : 0.30;
  h.lifeLost += lifeCost; h.stats.failed++;
  inflictDaoHurt(h, hurtDays, fk ? '误服假丹冲击大境界，经脉寸断' : fromR >= 4 ? '强冲化神遭天道法则反噬，元婴重创' : fromR === 3 ? '碎丹成婴功败垂成，金丹裂损' : '冲击大境界失败，经脉受创');
  msgs.push({ text: `${MAJOR_BREAKS[fromR].desc.split('：')[0]}失败！天威反噬下经脉重创（道伤 ${h.daoHurt?.days ?? hurtDays} 日），修为倒退${Math.round((1 - keepRatio) * 10)}成，折损 ${lifeCost} 载寿元！（成功率 ${(ch * 100).toFixed(0)}%）`, kind: 'warn' });
  return { ok: false, msgs };
}

/** 时间流逝（天）：年龄、问道残卷、修炼 */
export function passDays(h: Hero, days: number, meditating: boolean, place: number, out: Msg[]) {
  if (h.dead) return;
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
  if (meditating) { gainExp(h, expPerDay(h, place) * days, out, 'med'); h.stats.meditateDays += days; }
  if (hasDaoHurt(h) && healDaoHurt(h, days * (meditating ? 1.8 : 1))) {
    out.push({ text: '受损的经脉终告平复，道伤尽去！', kind: 'good' });
  }
  if (h.age >= maxLife(h)) { h.dead = true; out.push({ text: '寿元已尽……', kind: 'warn' }); }
}

/** 问道残卷 · 草木篇：一滴墨露让一株灵药一化为三（v0.70 起灵草不计年份） */
export const BOTTLE_GROW = 2;
export function useBottle(h: Hero, stack: BagItem): Msg {
  if (h.bottle.owned === false) return { text: '你还没有这样的宝物。', kind: 'warn' };
  if (h.bottle.drops <= 0) return { text: '残卷中尚无墨露。', kind: 'warn' };
  if (itemDef(stack.id).type !== 'herb') return { text: '墨露只能滴在灵药上。', kind: 'warn' };
  h.bottle.drops--;
  addItem(h, stack.id, BOTTLE_GROW);
  return { text: `墨露渗进${itemDef(stack.id).name}的根须，药株一分为三——多得 ${BOTTLE_GROW} 株！`, kind: 'good' };
}

/** 收官 C：按物品对象找（袋里的格子不再按下标稳定）；旧的下标写法照收 */
export function bagRef(h: Hero, ref?: number | BagItem): BagItem | undefined {
  if (ref === undefined || ref === null) return undefined;
  if (typeof ref === 'number') return h.bag[ref];
  return h.bag.includes(ref) ? ref : undefined;
}
/** 服用（可指定袋中那一堆：物品对象，旧调用方给下标也行；兼容假丹药反噬与疗伤灵药平复道伤） */
export function usePill(h: Hero, id: string, out: Msg[], ref?: number | BagItem) {
  const d = itemDef(id);
  const isLignru = id === 'herb_yangshen';
  const e = d.pill ?? (isLignru ? { hp: 1, mp: 1, life: 5 } : undefined);
  if (!e) { out.push({ text: '此物不可直接服用。', kind: 'warn' }); return false; }
  const slot = bagRef(h, ref);
  if (slot && slot.id === id) {
    if (slot.fake && slot.ident) { out.push({ text: '此丹已鉴明是伪劣假药，不可吞服！', kind: 'warn' }); return false; }
    slot.n -= 1;
    if (slot.fake) lastFakeConsumed = { id: slot.id, fake: slot.fake, seller: slot.seller, sellerName: slot.sellerName };
    else lastFakeConsumed = null;
    h.bag = h.bag.filter((b) => b.n > 0);
  } else {
    if (bagCount(h, id) <= 0) return false;
    lastFakeConsumed = null;
    removeItem(h, id, 1);
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
  if (e.exp) {
    const before = h.exp, bs = h.stage, br = h.realm;
    // 高阶丹药对低境界效果更强，低阶丹药对高境界衰减
    const tierFit = Math.pow(0.35, Math.max(0, h.realm - 1 - d.tier));
    const fat = Math.pow(PILL_FATIGUE, h.pillN ?? 0); h.pillN = (h.pillN ?? 0) + 1;
    const raw = e.exp * tierFit * (gongfaDef(h).id === 'changchun' ? 1.1 : 1), cap = need(h) * PILL_CAP;
    gainExp(h, Math.min(raw, cap) * fat, out, 'pill');
    if (raw > cap * 2.5) out.push({ text: '药力过猛，虚不受补——大半药力化作燥火散去了。', kind: 'warn' });
    if (fat < 0.3) out.push({ text: `丹毒积郁，药力已十不存${Math.max(1, Math.round(fat * 10))}——该静心苦修了。`, kind: 'warn' });
    if (h.stage === bs && h.realm === br && h.exp === before) out.push({ text: '修为已至瓶颈，药力白白流失。', kind: 'warn' });
    else out.push({ text: `药力化开，修为增长。`, kind: 'good' });
  }
  if (e.hp) { h.hp = Math.min(1, h.hp + e.hp); out.push({ text: '伤势好转。' }); }
  if (e.mp) { h.mp = Math.min(1, h.mp + e.mp); out.push({ text: '法力回复。' }); }
  if (e.life) { h.lifeBonus += e.life; out.push({ text: `寿元增加 ${e.life} 载。`, kind: 'good' }); }
  if (e.sense) { h.senseBonus += e.sense; out.push({ text: '神识更为凝练。', kind: 'good' }); }
  if (e.root) {
    const idx = ROOTS.findIndex((r) => r.id === h.root);
    if (idx > 0) { h.root = ROOTS[idx - 1].id; out.push({ text: `灵根脱胎换骨，化为${ROOTS[idx - 1].name}！`, kind: 'good' }); }
  }
  if (e.favor) out.push({ text: '容颜似乎更显年轻……这丹药还是留着送人更好。' });
  // 灵药平复道伤（经脉受损）
  if (hasDaoHurt(h)) {
    const cure = isLignru ? 999 : id === 'pill_ningpo' || id === 'pill_yanghun' ? 20 : id === 'pill_jinsui' ? 15 : id === 'pill_liaoshang' ? 6 : 0;
    if (cure > 0) {
      if (healDaoHurt(h, cure)) out.push({ text: `${d.name}药力滋养周天，受损经脉彻底痊愈！`, kind: 'good' });
      else out.push({ text: `${d.name}温养经脉，道伤减轻（尚余 ${Math.ceil(h.daoHurt!.days)} 日，配合闭关调息更快）。`, kind: 'good' });
    }
  }
  return true;
}

// ---------------- 炼丹 ----------------
export interface AlchemyCheck { ok: boolean; chance: number; missing: string[]; ages: number[] }
export function checkRecipe(h: Hero, r: Recipe, fire = true): AlchemyCheck {
  const missing: string[] = [];
  const forge = r.kind === 'forge';
  if (forge && h.realm < r.reqRealm) missing.push(`修为不足（需${['凡人', '炼气', '筑基', '结丹', '元婴'][r.reqRealm]}期方能驾驭此器）`);
  // 第四十步：碧竹飞云剑——首炼 / 续炼 / 庚精淬剑
  const hasQz = bagCount(h, 'art_qingzhu') > 0, qn = hasQz ? (h.qzN ?? 12) : 0;
  if (r.special === 'qz' && hasQz) missing.push('你已炼有碧竹飞云剑——请用“续炼”添剑');
  if (r.special === 'qz_add') { if (!hasQz) missing.push('需先炼成碧竹飞云剑'); else if (qn >= 72) missing.push('已足七十二口'); }
  if (r.special === 'qz_geng') { if (!hasQz || qn < 72) missing.push(`需七十二口碧竹飞云剑（现有 ${qn} 口）`); else if (h.qzGeng) missing.push('庚精已熔入剑身'); }
  let bonus = 0;
  for (const inp of r.inputs) {
    // v0.70：灵草只看数量（模组配方里的 minAge 折成株数）
    const need = inp.minAge ? ageToCount(inp.n, inp.minAge) : inp.n;
    const have = bagCount(h, inp.id);
    if (have < need) missing.push(`${itemDef(inp.id).name} ${have}/${need}`);
  }
  if (!forge && bagCount(h, 'mat_lingquan') > 0 && !r.inputs.some((i) => i.id === 'mat_lingquan')) bonus += 0.05;
  // 炼器：境界越高、控火越稳；野外无地火，只能以法力代火
  if (forge) bonus += Math.max(0, h.realm - r.reqRealm) * 0.1;
  const realmPen = h.realm < r.reqRealm ? 0.5 : 1;
  // 斗法版：成丹率按丹方而定——灵草既已不计年份，原先靠药龄补上去的成丹率折进丹方本身：
  //   丹方底子 = 0.42 + 原基础 × 0.72（聚气丹约八成五、筑基丹约五成六、降尘丹约六成）；
  //   境界高出丹方所需，每高一境 +6%；炼丹越多越熟，每炉 +0.4%（至多 +12%）。炼器不变。
  let rb = r.base;
  if (!forge) {
    rb = Math.min(0.92, 0.42 + r.base * 0.72);
    bonus += Math.max(0, h.realm - r.reqRealm) * 0.06;
    bonus += Math.min(0.12, (h.stats?.alchemy ?? 0) * 0.004);
  }
  const chance = Math.min(0.97, (rb + bonus + mod(h, 'alchemy')) * realmPen * (forge && !fire ? 0.6 : 1));
  return { ok: missing.length === 0, chance, missing, ages: [] };
}

export function brew(h: Hero, r: Recipe, fire = true): { ok: boolean; msgs: Msg[]; days: number } {
  const c = checkRecipe(h, r, fire);
  if (!c.ok) return { ok: false, msgs: [{ text: (r.kind === 'forge' ? '无法开炉：' : '药材不足：') + c.missing.join('，'), kind: 'warn' }], days: 0 };
  if (r.kind === 'forge') {
    // 第四十步：碧竹飞云剑的主材（金雷竹 / 庚精）失手时完好无损，只毁辅材
    const main = r.special ? (r.special === 'qz_geng' ? 'mat_gengjing' : 'mat_jinleizhu') : '';
    const win = Math.random() < c.chance;
    for (const inp of r.inputs) if (win || inp.id !== main) removeItem(h, inp.id, inp.minAge ? ageToCount(inp.n, inp.minAge) : inp.n);
    h.stats.alchemy++;
    if (win && r.special === 'qz') { addItem(h, r.out, 1); h.qzN = 12; return { ok: true, msgs: [{ text: '竹液化作十二道青光没入剑胚，剑鸣如蜂——十二口碧竹飞云剑炼成！剑身上金色电弧跳动，伏魔金雷自蕴其中。', kind: 'good' }], days: r.days }; }
    if (win && r.special === 'qz_add') { h.qzN = Math.min(72, (h.qzN ?? 12) + 12); return { ok: true, msgs: [{ text: `又是十二口飞剑出炉，与原有飞剑合为一套——碧竹飞云剑已有 ${h.qzN} 口。`, kind: 'good' }], days: r.days }; }
    if (win && r.special === 'qz_geng') { h.qzGeng = true; return { ok: true, msgs: [{ text: '庚精化作银色细流渗入七十二口飞剑，剑身锋芒内敛——大庚剑阵可布矣！', kind: 'good' }], days: r.days }; }
    if (r.special && !win) return { ok: false, msgs: [{ text: `火候一偏，辅材尽毁——好在${itemDef(main).name}完好无损。（成器率 ${(c.chance * 100).toFixed(0)}%）`, kind: 'warn' }], days: r.days };
    if (win) { addItem(h, r.out, 1); return { ok: true, msgs: [{ text: `炉中霞光冲起，器成！得${itemDef(r.out).name}。`, kind: 'good' }], days: r.days }; }
    return { ok: false, msgs: [{ text: `火候一偏，器胚崩裂，材料尽毁……（成器率 ${(c.chance * 100).toFixed(0)}%）`, kind: 'warn' }], days: r.days };
  }
  for (const inp of r.inputs) removeItem(h, inp.id, inp.minAge ? ageToCount(inp.n, inp.minAge) : inp.n);
  h.stats.alchemy++;
  if (Math.random() < c.chance) {
    const n = r.outN + (mod(h, 'alchemy') > 0 ? 1 : 0) + (Math.random() < 0.15 ? 1 : 0);
    addItem(h, r.out, n);
    return { ok: true, msgs: [{ text: `丹成！得${itemDef(r.out).name} ×${n}。`, kind: 'good' }], days: r.days };
  }
  return { ok: false, msgs: [{ text: `炉中一声闷响，药材化作焦灰……（成丹率 ${(c.chance * 100).toFixed(0)}%）`, kind: 'warn' }], days: r.days };
}

export { RECIPES };
