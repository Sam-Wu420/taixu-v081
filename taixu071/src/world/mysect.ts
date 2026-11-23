// v0.60「开宗立派」：元婴之后自立山门
//   · 立派：元婴期、五千灵石，在脚下这片山水立下山门——地图上从此多一座你的宗门（真实地点，可进城、有坊市）
//   · 收徒：四方求仙者按宗门威望月月来投（灵根、年岁、带艺投师的散修……），可逐个过目，也可立下规矩自动收录
//   · 门人：各自修炼、突破、衰老、坐化；可指点、赐丹、晋升、分派差事（修炼 / 产业 / 守山 / 历练）
//   · 发布功法：把你会的法术发布到本宗藏经阁（门人修习、宗门威望上涨）；把主修心法定为镇派心法
//   · 自创功法：以大成的法术为根基、可融另一门之意，自创一门新法术；还能刊行天下，让它流入坊市与洞府
//   · 宗门建设：藏经阁 / 丹房 / 护山大阵 / 聚灵大阵；库房、供奉、外敌来犯、弟子历练所得
// v0.62「宗主不是奶妈」：
//   · 人人都有进项（产业最多，守山 / 修炼的也各出一份力）；宗主抽成可调（10%–50%），径入宗主供奉
//   · 冲关用度有章法：丹药钱大降、败一次添一分成算；每月的冲关花销不超过库房盈余（保底线之上）的一小截（默认 5%，可调）——拨下去的灵石细水长流
//   · 回报：宗门气运（门人修行反哺宗主修为）· 破境谢师礼 · 丹房献丹 · 亲卫随行护法
//   · 护宗大阵：阵力（灵石充能）· 三种阵型 · 自动充能；外敌攻山先得破阵（见 sectwar.ts）
// 状态都在 ws.mySect / ws.myArts（随存档）；一切交互走通用对话面板（DNode），不占新的界面。
import type { Game } from './game';
import type { DNode, DOpt } from './modal';
import * as C from './cultivation';
import { ARTS, ART_LIST, ArtSkill, SCHOOL_NAME, TIER_NAME, profLevel } from '../data/arts';
import { ITEMS, ITEM_LIST, scrollItemOf, itemDef } from '../data/items';
import { GONGFA } from '../data/skills';
import { REALMS, realmName } from '../data/realms';
import { ALL_LOCATIONS, LOC_BY_ID, LOCATIONS, locsOf, fromMap, migrateHumanPoint, ACTIVE_MAP, ACTIVE_WORLD, WORLD_SCALE, MAP_NAME, type LocDef, type MapId } from '../data/world';
import { LEGACY_HUMAN_MAP_IDS, worldOfMap, worldCurrencyId, worldCurrencyName, worldRealmCap, type LegacyHumanMapId, type WorldId } from '../data/worldHierarchy';
import { ensureWorldSlice } from './worldstate';
import { makeName, npcMap, type NpcData } from './npc';
import { mulberry32 } from '../core/rng';
import { MY_SECT_ID, DAO_NAME, SCALE_CAP, SCALE_NAME, type Scale } from '../data/sects';
import { sealFx } from './beastfx';
import { MY_SECT_UNIFORM_PRESETS, applySectUniform, type CustomSectUniform } from '../gfx/sectUniform';
import { DEFAULT_WARDROBE, normalizeWardrobe } from '../gfx/renwu/outfits';
import { AIRSHIP_BUILD_SPEC, AIRSHIP_MAT_STONE_PRICE } from './warairship';

export type Job = 'xiu' | 'ye' | 'shou' | 'li';
export interface Disciple {
  id: number; name: string; sex: 'm' | 'f'; age: number;
  root: number;                 // 资质 1–5：伪灵根 / 四灵根 / 三灵根 / 双灵根 / 天灵根
  realm: number; stage: number; exp: number;   // exp：本小境界进度 0–1
  loyal: number;                // 忠诚 0–100
  rank: number;                 // 0 外门 · 1 内门 · 2 真传 · 3 长老
  job: Job; joined: number;
  arts: number;                 // 已习得的藏经阁功法数
  t?: number;                   // 上次得宗主指点之日
  bt?: number;                  // 冲关失败的次数（每败一次，下回成算添几分）
  /** v0.71：忠诚流水（最近 5 条，改值前的值 + 变动量 + 缘由）——面板上写给宗主看 */
  loyalLog?: { d: number; b: number; v: number; w: string }[];
}
export interface Applicant { name: string; sex: 'm' | 'f'; age: number; root: number; realm: number; stage: number; until: number; note: string }
/** 自创功法：def 是完整的法术定义（随存档），pub 为刊行天下之日 */
export interface MyArt { def: ArtSkill; base: string; mix?: string; day: number; pub?: number }
export type SectPolicy = 'cultivate' | 'war' | 'economy' | 'diplomacy';
export const SECT_POLICY_INFO: Record<SectPolicy, { name: string; desc: string }> = {
  cultivate: { name: '重修行育才', desc: '双灵根以上调去闭关，优先拨款冲关、自动收好苗子' },
  war: { name: '强战备扩军', desc: '丹房加炼战备疗伤丹、扩编外门兵池、常充护宗大阵' },
  economy: { name: '稳发育攒家底', desc: '多数弟子打理产业、严控开支与保底线、外交求稳' },
  diplomacy: { name: '重外交联横', desc: '每月向同道宗门修好结缘、消弭摩擦、广结善缘' },
};

export interface MySect {
  name: string; dao: 'zheng' | 'mo' | 'zhong';
  map: MapId; x: number; y: number;      // 所在地图与宏观坐标
  founded: number;
  fame: number; stones: number; tribute: number;
  ds: Disciple[]; seq: number; apps: Applicant[];
  lib: string[];                          // 已发布到藏经阁的法术 id
  gf: string;                             // 镇派心法（GONGFA id）
  halls: { lib: number; dan: number; zhen: number; ling: number; dock?: number; chi?: number };
  chiMonth?: number; chiUsed?: number;    // 接引池当月已用名额
  open: boolean; minRoot: number; auto: boolean;
  lastM: number; lastTeach: number;
  log: { d: number; t: string }[];
  gifts: { id: string; n: number }[];     // 门人献上、尚未领取的东西
  wins: number; losses: number;
  // ---- v0.62（旧存档没有这些字段，fix() 里补上）
  cut?: number;                           // 宗主抽成：门人进项按此成数径入宗主供奉
  reserve?: number;                       // 库房保底线：门人冲关、大阵充能只动此线之上的灵石
  btRule?: number;                        // 冲关资格：0 人人可冲 · 1 三灵根或内门以上 · 2 双灵根或真传以上
  btRate?: number;                        // 冲关用度：每月的冲关花销至多占库房盈余的几成（默认 5%）
  btSpent?: number; btTries?: number; btWins?: number;   // 累计冲关花销 / 次数 / 成功次数
  qi?: number;                            // 宗门气运（门人修行反哺宗主）
  earned?: number;                        // 宗主累计所得供奉
  zhenE?: number; zhenMode?: ZhenMode; zhenAuto?: boolean;   // 护宗大阵：阵力 / 阵型 / 自动充能
  guard?: number[];                       // 太上宗主随行亲卫（门人 id）
  masterGuard?: number[];                 // 现任委任掌门贴身护卫（门人 id）
  // ---- v0.72：外门炼气池与杂役池（核心骨干在 ds[]，万人外门与杂役走数字池）
  servant?: { a: number; c: number };
  outer?: { a: number; j: number; c: number };
  // ---- v0.73：自建宗门制式服制 & 太上退居委任掌门
  uniform?: CustomSectUniform;
  masterId?: number;
  policy?: SectPolicy;
  masterAuto?: MasterAutoFlags;
}

export interface MasterAutoFlags {
  recruit: boolean;
  promote: boolean;
  build: boolean;
  lib: boolean;
  vault?: boolean;
  war: boolean;
  guard?: boolean;
}

export const DEFAULT_MASTER_AUTO: Required<MasterAutoFlags> = {
  recruit: true,
  promote: true,
  build: true,
  lib: true,
  vault: true,
  war: true,
  guard: true,
};

const CORE_CAP: Record<Scale, number> = { da: 400, zhong: 200, xiao: 120 };

export const FOUND_COST = 5000;
const ROOT_NAME = ['', '伪灵根', '四灵根', '三灵根', '双灵根', '天灵根'];
const ROOT_RATE = [0, 0.45, 0.7, 1, 1.5, 2.4];
const RANK_NAME = ['外门弟子', '内门弟子', '真传弟子', '长老'];
const JOB_NAME: Record<Job, string> = { xiu: '闭关修炼', ye: '打理产业', shou: '镇守山门', li: '外出历练' };
// v0.71：面板与对话树共用的显示表 / 档位表（规则仍只写在本文件里）
export const RANK_TEXT = RANK_NAME;
export const ROOT_TEXT = ROOT_NAME;
export const JOB_TEXT = JOB_NAME;
/** 抽成档位（10%–50%）：抽到五成，门人渐生怨言 */
const CUT_STEPS = [0.1, 0.2, 0.3, 0.4, 0.5];
/** 库房保底线档位：门人冲关、大阵充能只动此线之上的灵石 */
const RESERVE_STEPS = [0, 5000, 20000, 100000, 500000, 2000000];
/** 冲关用度档位：每月至多动用库房盈余的几成 */
const RATE_STEPS = [0, 0.02, 0.05, 0.1, 0.25, 1];
/** 拨 / 取灵石的常用档位 */
export const STONE_STEPS = [1000, 10000, 100000, 1000000];
const HALLS: { k: keyof MySect['halls']; name: string; desc: string }[] = [
  { k: 'lib', name: '藏经阁', desc: '每级多容八门功法，门人修习更快' },
  { k: 'dan', name: '丹房', desc: '门人冲关成算更高，产业进项 +20%' },
  { k: 'zhen', name: '护宗大阵', desc: '每级阵力上限大增（400 / 1200 / 3500 / 9000 / 24000）：外敌攻山先得破阵，劫修来犯由大阵先扛' },
  { k: 'ling', name: '聚灵大阵', desc: '门人修炼 +18%，可多容二十四人' },
  { k: 'dock', name: '战船坞', desc: '建造与大修浮空战船（1级造一阶灵舟 · 3级造二阶战舰 · 5级造三阶巨舟），兼增阵材产出与造船提速' },
  { k: 'chi', name: '接引飞升池', desc: '上界专属奇池：洗髓接引下界尚在人世的宗门弟子与亲友跨界飞升，每级每月增 2 个名额并放宽境界门槛' },
];
const HALL_COST = [3000, 12000, 40000, 120000, 360000];
/** 各境界一人的战力（0..12 境） */
const POWER = [1, 3, 16, 90, 480, 2400, 10000, 38000, 140000, 500000, 1800000, 6000000, 20000000];
/** 各境界门人打理产业的月进项、外出历练所得的基数；各身份的月例基数（再乘 1 + 境界） */
const INCOME = [4, 16, 90, 480, 2200, 6000, 14000, 32000, 72000, 160000, 360000, 800000, 1800000];
const LOOT = [1, 2, 8, 30, 100, 260, 600, 1400, 3000, 7000, 16000, 36000, 80000];
const UPKEEP = [1, 3, 8, 20];
// ------------------------------------------------------------------ v0.62「宗主不是奶妈」
/** 冲关的丹药钱（0..11 境→下一境，库房灵石账面） */
const BT_COST = [0, 800, 8000, 60000, 240000, 600000, 1400000, 3200000, 7200000, 16000000, 36000000, 80000000];
// 冲关资格：0 人人可冲 · 1 三灵根或内门以上 · 2 双灵根或真传（核心弟子）以上 · 3 天灵根或真传以上
const BT_RULE = ['人人可冲', '三灵根或内门以上', '双灵根或真传以上', '天灵根或核心弟子以上'];
export const BREAK_COST = BT_COST;
export const BT_RULE_TEXT = BT_RULE;
/** 宗门气运：各境界门人每月为宗主积下的气运；QI_NEED = 宗主各境界「一份」气运 */
const QI = [0, 0.02, 0.15, 1, 6, 24, 90, 320, 1100, 3800, 12000, 36000, 100000];
const QI_NEED = [30, 30, 60, 150, 500, 2000, 8000, 28000, 96000, 320000, 1000000, 3200000, 10000000];
/** 丹房按宗主境界献上的丹药（0..12 境） */
const PILL_OF = [
  'pill_juqi', 'pill_huanglong', 'pill_juling', 'pill_ningyuan', 'pill_peiying',
  'pill_yuanling', 'pill_ling_qingming', 'pill_ling_heqi', 'pill_ling_taiyi',
  'pill_zhenxian', 'pill_xuanxian', 'pill_jinxian', 'pill_daluo',
];
export type ZhenMode = 'shou' | 'sha' | 'huan';
/** 护宗大阵三种阵型：[阵名, 说明] */
export const ZHEN_MODE: Record<ZhenMode, [string, string]> = {
  shou: ['金光镇岳阵', '主守：大阵所受冲击减三成，最是耐打'],
  sha: ['诛邪万剑阵', '主杀：来犯之敌每冲一次阵，都要在阵前多丢下一倍的尸首'],
  huan: ['迷天幻雾阵', '主困：劫修多半连山门都寻不到；攻山之敌每冲一次阵要多耗一倍时日'],
};
/** 护宗大阵各级的阵力上限（0 级 = 尚未布阵）；充一点阵力要的灵石 */
export const ZHEN_MAX = [0, 400, 1200, 3500, 9000, 24000];
export const ZHEN_COST = 2;
/** 三灵根、无加成时，修满一个小境界约需的月数 */
const STAGE_MONTHS = [6, 9, 70, 260, 900, 2400, 5200, 10000, 18000, 32000, 54000, 85000, 120000];
const FAME_TITLE: [number, string][] = [
  [12000, '万界巨擘'], [6000, '仙域圣地'], [2500, '一方大宗'], [1000, '威震一域'],
  [400, '一方大派'], [150, '名动一方'], [50, '小有名气'], [0, '草创山门'],
];
const fameTitle = (f: number) => (FAME_TITLE.find(([n]) => f >= n) ?? FAME_TITLE[FAME_TITLE.length - 1])[1];
const SECT_A = ['太虚', '青云', '凌霄', '玄天', '紫霄', '天衍', '无极', '九霄', '乾元', '归元', '长生', '问道', '苍穹', '星河', '万剑', '落霞', '听涛', '韩'];
const SECT_A_MO = ['幽冥', '血河', '万魔', '噬魂', '九幽', '黑渊', '修罗', '玄阴', '白骨', '蚀日'];
const SECT_B = ['门', '宗', '阁', '宫', '山', '派', '殿', '谷'];
const ART_A: Record<string, string[]> = {
  火: ['焚天', '离火', '赤霄', '九阳'], 冰: ['玄冥', '寒渊', '霜天', '太阴'], 雷: ['紫霄', '九霄', '天罚', '惊蛰'], 风: ['巽风', '流云', '扶摇', '罡风'],
  土: ['镇岳', '坤元', '厚土', '裂地'], 木: ['青帝', '长生', '万木', '乙木'], 剑: ['太虚', '无极', '斩仙', '万剑'], 体: ['不灭', '金刚', '霸体', '龙象'],
  御: ['万灵', '驭天', '百兽', '通灵'], 魔: ['噬魂', '九幽', '血海', '修罗'], 识: ['天衍', '摄魂', '镇魂', '天机'], 阵: ['周天', '两仪', '八荒', '星罗'],
  身: ['缩地', '惊鸿', '无影', '凌虚'], 符: ['敕令', '太上', '玄箓', '天书'], 神: ['混元', '太初'],
};
const ART_B: Record<string, string[]> = {
  bolt: ['指', '神芒', '一击'], fan: ['连珠', '千芒', '飞星'], nova: ['震', '怒涛', '爆'], burst: ['印', '陨', '崩'], cone: ['掌', '手', '吐息'],
  beam: ['神光', '贯日', '一线'], strike: ['天劫', '诛', '陨落'], chain: ['连环', '锁链', '游龙'], field: ['领域', '大阵', '界'], orbit: ['轮', '环', '护身剑'],
  dash: ['步', '遁', '闪'], blink: ['遁', '瞬', '挪移'], buff: ['诀', '真身', '功'], shield: ['罩', '神盾', '壁'], heal: ['回春', '甘霖', '生息'], summon: ['召灵', '役使', '御使'],
};
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const sexName = (s: 'm' | 'f') => (s === 'f' ? '女' : '男');

// ------------------------------------------------------------------ 自创功法的登记
let REG: string[] = [];
/**
 * 把存档里的自创功法登记进法术表（读档后、任何用到主角法术的代码之前调用）。
 * 先撤掉上一份存档登记的，再登记这一份；已刊行天下的同时进入全局法术池与卷轴池（坊市、掉落、洞府里都会出现）。
 */
export function registerMyArts(ws: { myArts?: MyArt[] } | undefined | null) {
  for (const id of REG) {
    delete ARTS[id];
    const i = ART_LIST.findIndex((a) => a.id === id); if (i >= 0) ART_LIST.splice(i, 1);
    const sid = 'scroll_art_' + id; delete ITEMS[sid];
    const j = ITEM_LIST.findIndex((x) => x.id === sid); if (j >= 0) ITEM_LIST.splice(j, 1);
  }
  REG = [];
  for (const m of ws?.myArts ?? []) {
    const a = m?.def; if (!a?.id || ARTS[a.id]) continue;
    ARTS[a.id] = a;
    const sc = scrollItemOf(a); ITEMS[sc.id] = sc;
    REG.push(a.id);
    if (m.pub) { ART_LIST.push(a); ITEM_LIST.push(sc); }
  }
}

export function foundBagCostForWorld(w: WorldId): number {
  const sc = w === 'spirit' ? 60 : w === 'immortal' ? 200 : 1;
  return sc <= 1 ? FOUND_COST : Math.max(25, Math.round(FOUND_COST / sc));
}

/** 宗主飞升或跨界离境前：若尚未委任代掌门，则自动推举最合适的高阶/忠诚弟子摄理山门 */
export function appointRegentOnAscend(s: MySect | null | undefined, day: number): string | null {
  if (!s || s.masterId !== undefined) return null;
  const ds = Array.isArray(s.ds) ? s.ds : [];
  if (!ds.length) {
    s.log ??= [];
    s.log.unshift({ d: day, t: '宗主破界远行，山门暂由护宗长老封山守望，待主归来。' });
    if (s.log.length > 40) s.log.length = 40;
    return null;
  }
  const cand = ds.slice().sort((a, b) =>
    (b.rank >= 2 || b.realm >= 3 ? 1 : 0) - (a.rank >= 2 || a.realm >= 3 ? 1 : 0)
    || b.realm - a.realm || b.stage - a.stage || b.rank - a.rank || b.loyal - a.loyal,
  )[0];
  if (!cand) return null;
  if (cand.rank < 3) cand.rank = 3;
  s.masterId = cand.id;
  s.policy ??= 'cultivate';
  s.masterAuto = { ...DEFAULT_MASTER_AUTO, ...s.masterAuto };
  s.log ??= [];
  s.log.unshift({ d: day, t: `宗主破界飞升，太上退居仙途，委任${cand.name}为代掌门全权统摄山门。` });
  if (s.log.length > 40) s.log.length = 40;
  return cand.name;
}

export class MySectSys {
  game: Game;
  /** 本月卡在大瓶颈上的门人，各自轮得上冲关的几率（= 本月用度 / 总需求；宗主亲自指点时为 1） */
  private btP = 1;
  constructor(game: Game) { this.game = game; try { registerMyArts(game.ws); } catch { /* */ } }
  /** 旧存档 / 新立的宗门：补上 v0.62 的字段 */
  private fixSect(s: MySect) {
    s.gifts ??= []; s.log ??= []; s.ds ??= []; s.apps ??= []; s.lib ??= [];
    s.halls ??= { lib: 0, dan: 0, zhen: 0, ling: 0, dock: 0, chi: 0 };
    s.halls.dock ??= 0; s.halls.chi ??= 0;
    if (s.cut === undefined) {
      s.cut = 0.3; s.reserve ??= 0; s.btRule ??= 1; s.btRate ??= 0.05; s.qi ??= 0; s.earned ??= 0; s.guard ??= []; s.masterGuard ??= [];
      s.zhenMode ??= 'shou'; s.zhenAuto ??= true; s.zhenE ??= ZHEN_MAX[s.halls.zhen] ?? 0;
    }
    s.guard = (s.guard ?? []).filter((id) => id !== s.masterId && s.ds.some((d) => d.id === id));
    s.masterGuard = (s.masterGuard ?? []).filter((id) => id !== s.masterId && !(s.guard ?? []).includes(id) && s.ds.some((d) => d.id === id));
    const sc = this.scaleOf(s), oc = this.outerCapOf(s, sc), svc = Math.round(oc * 1.8);
    if (!s.outer) {
      const initOuter = Math.max(20, Math.min(oc, Math.round(s.ds.length * 4 + s.fame * 0.25)));
      s.outer = { a: initOuter, j: 0, c: oc };
    } else s.outer.c = oc;
    if (!s.servant) {
      const initServ = Math.max(40, Math.min(svc, Math.round(s.outer.a * 1.4)));
      s.servant = { a: initServ, c: svc };
    } else s.servant.c = svc;
  }
  private fix() { if (this.s) this.fixSect(this.s); }
  private scaleOf(s: MySect): Scale { return s.fame >= 1800 ? 'da' : s.fame >= 600 ? 'zhong' : 'xiao'; }
  private capOf(s: MySect) { return Math.min(CORE_CAP[this.scaleOf(s)], 24 + s.halls.ling * 24 + Math.floor(s.fame / 12)); }
  private outerCapOf(s: MySect, sc?: Scale) { return ({ xiao: 4000, zhong: 11000, da: 26000 }[sc ?? this.scaleOf(s)]) + s.halls.ling * 800; }
  private zhenMaxOf(s: MySect) { return ZHEN_MAX[s.halls.zhen] ?? 0; }
  private sectWorldOf(s: MySect): WorldId { return worldOfMap(s.map); }
  private maxDiscipleRealm(s: MySect): number {
    const w = this.sectWorldOf(s);
    if (w === 'immortal') return 12;
    if (w === 'spirit') return 8;
    return 4;
  }
  /** 宗主亲自指点 / 赐丹 / 讲法时冲关：不受每月用度之限，只守保底线 */
  private openBudget() { this.btP = 1; }
  private btOkOf(s: MySect, d: Disciple) {
    const k = s.btRule ?? 1;
    if (k === 0) return true;
    if (k === 1) return d.root >= 3 || d.rank >= 1;
    if (k === 2) return d.root >= 4 || d.rank >= 2;
    return d.root >= 5 || d.rank >= 2;
  }
  private btOk(d: Disciple) { return this.btOkOf(this.s!, d); }
  /** 护宗大阵的阵力上限 */
  zhenMax() { const s = this.s; return s ? this.zhenMaxOf(s) : 0; }
  qiCap() { return QI_NEED[clamp(this.game.hero.realm, 0, QI_NEED.length - 1)] * 3; }
  /** 眼下攒了几份气运（0–3） */
  private qiRatio() { const s = this.s!; return Math.min(3, (s.qi ?? 0) / QI_NEED[clamp(this.game.hero.realm, 0, QI_NEED.length - 1)]); }
  private monthTrib() { const s = this.s!; let inc = 0; for (const d of s.ds) inc += this.incomeOf(d, s); return Math.round(inc * (s.cut ?? 0.3)); }
  /** 太上亲卫人数上限（随宗门规模） */
  guardCap() { return { xiao: 4, zhong: 6, da: 8 }[this.scale()]; }
  /** 现任掌门护卫人数上限（随宗门规模） */
  masterGuardCap() { return { xiao: 2, zhong: 4, da: 6 }[this.scale()]; }
  get s(): MySect | undefined { return this.game.ws.mySect; }

  // ------------------------------------------------------------ 地点
  /** 存档里有宗门、地点表里还没有（读档 / 刚立派）——补上；宗门没了则撤下。每帧调用，平时只是两次查表 */
  sync() {
    const s = this.s, has = LOC_BY_ID.get(MY_SECT_ID);
    if (!s) { if (has) this.unlist(has); return; }
    if ((LEGACY_HUMAN_MAP_IDS as readonly string[]).includes(s.map)) {
      const [rx, ry] = migrateHumanPoint(s.map as LegacyHumanMapId, s.x, s.y);
      s.map = 'renjie'; s.x = rx; s.y = ry;
    }
    if (has && has.name === s.name && has.map === s.map && has.x === s.x && has.y === s.y) return;
    if (has) this.unlist(has);
    const [ox, oy] = fromMap(s.map, s.x, s.y);
    const l: LocDef = {
      id: MY_SECT_ID, name: s.name, type: 'sect', map: s.map, x: s.x, y: s.y, ox, oy, major: true, scale: 0.9, danger: 0,
      desc: `苏寒于第 ${Math.floor(s.founded / 360) + 1} 年亲手开创的${DAO_NAME[s.dao]}宗门。山门虽新，护山大阵的灵光已隐隐可见。`,
    };
    const list = locsOf(s.map);
    // 山门脚下的野村、小险地让出位置（名字仍查得到，旧存档不受影响；与模组加地点同一做法）
    for (let i = list.length - 1; i >= 0; i--) { const o = list[i]; if (o.minor && Math.hypot(o.x - l.x, o.y - l.y) < 9) list.splice(i, 1); }
    list.push(l); ALL_LOCATIONS.push(l); LOC_BY_ID.set(l.id, l);
  }
  private unlist(l: LocDef) {
    for (const arr of [locsOf(l.map), ALL_LOCATIONS]) { const i = arr.indexOf(l); if (i >= 0) arr.splice(i, 1); }
    LOC_BY_ID.delete(MY_SECT_ID);
  }
  /** 宗主此刻是否就在山门左近（外敌来犯时亲自出手） */
  private atHome() {
    const s = this.s; if (!s || s.map !== ACTIVE_MAP) return false;
    const p = this.game.player; return Math.hypot(p.x / WORLD_SCALE - s.x, p.y / WORLD_SCALE - s.y) < 6;
  }

  private sectWorld() { return this.s ? worldOfMap(this.s.map) : ACTIVE_WORLD; }
  private curId() { return worldCurrencyId(this.sectWorld()); }
  private curName() { return worldCurrencyName(this.sectWorld()); }
  private curScale() { const w = this.sectWorld(); return w === 'spirit' ? 60 : w === 'immortal' ? 200 : 1; }
  foundBagCost() { return foundBagCostForWorld(ACTIVE_WORLD); }
  // ------------------------------------------------------------ 立派
  foundReq(): { ok: boolean; why: string } {
    const g = this.game, h = g.hero;
    if (this.s) return { ok: false, why: '你已开宗立派' };
    if (h.realm < 4) return { ok: false, why: '须元婴期方可开宗立派' };
    if ((g as any).mijing?.cur) return { ok: false, why: '秘境之中无处立派' };
    const cost = this.foundBagCost(), cId = worldCurrencyId(ACTIVE_WORLD), cName = worldCurrencyName(ACTIVE_WORLD);
    if (C.bagCount(h, cId) < cost) return { ok: false, why: `需${cName} ${cost}（买地、立山门、布护山阵）` };
    const p = g.player;
    if (g.terrain.walkFactor(p.x, p.y) <= 0) return { ok: false, why: '此处无立足之地，须在陆地上立山门' };
    const mx = p.x / WORLD_SCALE, my = p.y / WORLD_SCALE;
    for (const l of LOCATIONS) { if (!l.minor && Math.hypot(l.x - mx, l.y - my) < 14) return { ok: false, why: `此地离${l.name}太近，一山不容二虎，走远些再立` }; }
    return { ok: true, why: '' };
  }
  private nameIdeas(dao: MySect['dao']): string[] {
    const out: string[] = [], pool = dao === 'mo' ? SECT_A_MO.concat(SECT_A.slice(0, 4)) : SECT_A;
    for (let i = 0; i < 40 && out.length < 5; i++) { const n = pick(pool) + pick(SECT_B); if (!out.includes(n) && ![...LOC_BY_ID.values()].some((l) => l.name === n)) out.push(n); }
    return out;
  }
  foundNode(names?: string[], dao?: MySect['dao']): DNode {
    const g = this.game, req = this.foundReq();
    const d: MySect['dao'] = dao ?? (g.ws.rep <= -15 ? 'mo' : g.ws.rep >= 12 ? 'zheng' : 'zhong');
    const ns = names ?? this.nameIdeas(d);
    const old = g.ws.sect, oldName = old ? LOC_BY_ID.get(old.id)?.name ?? '旧宗门' : '';
    const cost = this.foundBagCost(), cName = worldCurrencyName(ACTIVE_WORLD);
    const text = [
      ACTIVE_WORLD === 'human'
        ? '元婴已成，寿元千载。放眼界域，元婴修士皆可开宗立派、称宗道祖。'
        : '修为已臻上界大能之境，正是开宗立派、广纳十方英才之时。',
      `就在脚下这片山水立下山门，须${cName} ${cost}。立派之后：四方求仙者会慕名来投；你可收徒传功、把所学法术发布到藏经阁、自创功法并刊行天下。`,
      `道统：${DAO_NAME[d]}${d === 'mo' ? '（魔道立派，正道侧目）' : d === 'zheng' ? '（正道立派，名声须清白）' : '（不偏不倚，两头都不得罪）'}`,
      old ? `你如今是${oldName}门人——自立门户便要辞别旧宗。${old.rank >= 3 ? '以你的身份，宗门会以礼相送。' : '以你如今的身份，这等同叛出宗门。'}` : '',
      req.ok ? '' : `【${req.why}】`,
    ].filter(Boolean).join('\n\n');
    const options: DOpt[] = ns.map((n) => ({ label: `立派：「${n}」`, disabled: !req.ok, hint: req.why, tone: 'gold' as const, act: () => { this.found(n, d); return this.s ? this.node() : null; } }));
    options.push({ label: '换一批名号', act: () => this.foundNode(undefined, d) });
    options.push({ label: `改换道统（现：${DAO_NAME[d]}）`, act: () => this.foundNode(undefined, d === 'zheng' ? 'zhong' : d === 'zhong' ? 'mo' : 'zheng') });
    options.push({ label: '再想想', act: () => null });
    return { speaker: '开宗立派', title: `${REALMS[Math.max(4, g.hero.realm)]?.name ?? '元婴'}修士`, text, options, mood: 'mystic' };
  }
  found(name: string, dao: MySect['dao']) {
    const g = this.game, h = g.hero, p = g.player;
    if (!this.foundReq().ok) return;
    C.removeItem(h, worldCurrencyId(ACTIVE_WORLD), this.foundBagCost());
    if (g.ws.sect) {
      const oldId = g.ws.sect.id;
      if (g.ws.sect.rank >= 3) {
        g.news(`苏寒辞去${LOC_BY_ID.get(oldId)?.name ?? '宗门'}之职，自立门户。`, 'personal');
        g.ws.sect = null;
        g.sectwar?.revokeSectOrders?.(oldId);
      } else g.towns.leave();
    }
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const defPreset = dao === 'mo' ? MY_SECT_UNIFORM_PRESETS[4] : MY_SECT_UNIFORM_PRESETS[0];
    g.ws.mySect = {
      name, dao, map: ACTIVE_MAP, x: r1(p.x / WORLD_SCALE), y: r1(p.y / WORLD_SCALE), founded: g.day,
      fame: 20 + Math.min(60, Math.abs(g.ws.rep) * 0.5) + (h.realm - 4) * 60 + h.stage * 15, stones: 1000, tribute: 0,
      ds: [], seq: 1, apps: [], lib: [], gf: h.gongfa,
      halls: { lib: 0, dan: 0, zhen: 0, ling: 0, dock: 0, chi: 0 }, open: true, minRoot: 2, auto: false,
      lastM: Math.floor(g.day / 30), lastTeach: -999, log: [], gifts: [], wins: 0, losses: 0,
      servant: { a: 160, c: 900 }, outer: { a: 80, j: 0, c: 600 },
      uniform: { cut: defPreset.cut, robe: defPreset.robe, trim: defPreset.trim, pattern: defPreset.pattern },
    };
    ensureWorldSlice(g.ws, ACTIVE_WORLD).mySect = g.ws.mySect;
    this.sync();
    const s = this.s!;
    for (let i = 0; i < 4; i++) s.apps.push(this.genApplicant(0.25, s));   // 开山头一天：几个早就等在山下的
    this.log(`开宗立派，立「${name}」于${MAP_NAME[ACTIVE_MAP]}。`);
    g.news(`${realmName(h.realm, h.stage)}修士苏寒开宗立派，立「${name}」，广收门徒。`, 'personal');
    g.toast(`「${name}」开山立派！山下已有人前来求拜。`, 'good');
    if (dao === 'mo') g.ws.rep = Math.min(g.ws.rep, -20);
    sealFx('holy', dao === 'mo' ? 'blood' : undefined, p.x, p.y + 10, 3, { dur: 2.4 });
    sealFx('rune', dao === 'mo' ? 'blood' : 'gold', p.x, p.y + 14, 3.2, { dur: 6, loop: true });
    g.updateUI(true);
  }

  // ------------------------------------------------------------ 门人
  /** v0.61 / v0.72：自家宗门的规模随威望晋级——核心骨干上限 120 / 200 / 400；外门与杂役炼气池随威望与聚灵殿扩容至数千上万 */
  scale(): Scale { const s = this.s; return !s ? 'xiao' : this.scaleOf(s); }
  cap() { return this.capOf(this.s!); }
  outerCap() { const s = this.s; return s ? this.outerCapOf(s) : 0; }
  servantCap() { return Math.round(this.outerCap() * 1.8); }
  outerAlive() { this.fix(); return this.s?.outer?.a ?? 0; }
  outerInjured() { this.fix(); return this.s?.outer?.j ?? 0; }
  servantAlive() { this.fix(); return this.s?.servant?.a ?? 0; }
  totalAlive() { this.fix(); const s = this.s; return s ? s.ds.length + (s.outer?.a ?? 0) + (s.outer?.j ?? 0) + (s.servant?.a ?? 0) : 0; }
  damageOuter(dead: number, injured = 0) {
    this.fix(); const s = this.s; if (!s?.outer) return;
    const d = Math.min(s.outer.a, Math.max(0, Math.round(dead)));
    s.outer.a -= d;
    const j = Math.min(s.outer.a, Math.max(0, Math.round(injured)));
    s.outer.a -= j;
    s.outer.j = Math.min(Math.max(0, s.outer.c - s.outer.a), s.outer.j + j);
  }
  mergeOuter(add: number) {
    this.fix(); const s = this.s; if (!s?.outer || add <= 0) return;
    s.outer.a = Math.min(Math.round(s.outer.c * 1.25), s.outer.a + Math.round(add));
  }
  libCap() { return 8 + this.s!.halls.lib * 8; }
  power(target: MySect | undefined = this.s) {
    const s = target; if (!s) return 0;
    let v = Math.min(s.zhenE ?? 0, this.zhenMaxOf(s)) * 0.5;   // 护宗大阵：阵力折半算作守山战力
    for (const d of s.ds) {
      const pwr = POWER[clamp(d.realm, 0, POWER.length - 1)];
      const stg = REALMS[d.realm]?.stages.length ?? 3;
      v += pwr * (1 + d.stage / stg) * (d.job === 'shou' ? 1.6 : d.job === 'li' ? 0.3 : 1) * (1 + Math.min(12, d.arts) * 0.03);
    }
    return v;
  }
  private log(t: string, day?: number, target: MySect | undefined = this.s) {
    const s = target; if (!s) return;
    s.log.push({ d: Math.floor(day ?? this.game.day), t });
    if (s.log.length > 60) s.log.splice(0, s.log.length - 60);
  }
  private genApplicant(bonus = 0, target: MySect = this.s!): Applicant {
    const s = target, g = this.game, r = Math.random, w = this.sectWorldOf(s);
    const sex: 'm' | 'f' = r() < 0.42 ? 'f' : 'm';
    const pubs = (g.ws.myArts ?? []).filter((m) => m.pub).length;
    const q = Math.min(0.6, s.fame / 2500 + s.halls.ling * 0.04 + s.lib.length * 0.006 + pubs * 0.03 + bonus);
    const x = r();
    const root = w === 'immortal'
      ? (x < 0.08 + q * 0.12 ? 5 : x < 0.35 + q * 0.3 ? 4 : x < 0.78 ? 3 : 2)
      : w === 'spirit'
        ? (x < 0.04 + q * 0.08 ? 5 : x < 0.22 + q * 0.3 ? 4 : x < 0.62 ? 3 : 2)
        : (x < 0.012 + q * 0.06 ? 5 : x < 0.07 + q * 0.3 ? 4 : x < 0.32 + q * 0.5 ? 3 : x < 0.72 + q * 0.25 ? 2 : 1);
    let realm = 0, stage = 0, age = 8 + Math.floor(r() * 10), note = '山下凡人子弟，慕名前来求仙';
    const y = r();
    if (w === 'immortal') {
      if (s.fame >= 1200 && y < 0.08 + q * 0.12) { realm = 10; stage = Math.floor(r() * 2); age = 6000 + Math.floor(r() * 12000); note = '愿入上宗听宣的玄仙散仙'; }
      else if (y < 0.52) { realm = 9; stage = Math.floor(r() * 3); age = 1500 + Math.floor(r() * 5000); note = pick(['四海游历的真仙散修', '飞升池边新晋的飞升真仙', '古仙族落魄子弟']); }
      else { realm = 8; stage = 2; age = 900 + Math.floor(r() * 1500); note = '大乘圆满、待凝仙躯的准仙修士'; }
    } else if (w === 'spirit') {
      if (s.fame >= 900 && y < 0.05 + q * 0.1) { realm = 6; stage = Math.floor(r() * 2); age = 900 + Math.floor(r() * 1800); note = '愿作护法客卿的炼虚散修'; }
      else if (y < 0.55) { realm = 5; stage = Math.floor(r() * 3); age = 320 + Math.floor(r() * 900); note = pick(['初入灵界的飞升化神', '灵域小族出身的化神修士', '闻风来投的化神散修']); }
      else { realm = 4; stage = 2; age = 180 + Math.floor(r() * 260); note = '灵界本土成长的元婴后期俊才'; }
    } else {
      if (s.fame >= 700 && y < 0.005 + q * 0.03) { realm = 3; stage = Math.floor(r() * 2); age = 150 + Math.floor(r() * 200); note = '愿入门下为客卿长老的结丹修士'; }
      else if (s.fame >= 120 && y < 0.04 + q * 0.15) { realm = 2; stage = Math.floor(r() * (s.fame >= 600 ? 3 : 2)); age = 40 + Math.floor(r() * 90); note = '带艺投师的筑基散修'; }
      else if (y < 0.55) { realm = 1; stage = Math.floor(r() * 7); age = 14 + Math.floor(r() * 30); note = pick(['流落在外的炼气散修', '小家族送来的子弟', '别派除名的外门弟子', '坊市里长大的孤儿', '听了你的名头、千里来投']); }
    }
    const name = makeName(mulberry32(Math.floor(r() * 1e9)), sex);
    return { name, sex, age, root, realm, stage, until: g.day + 60, note };
  }
  private accept(a: Applicant, quiet = false, target: MySect = this.s!) {
    const s = target; if (s.ds.length >= this.capOf(s)) return false;
    s.apps = s.apps.filter((x) => x !== a);
    const rank = a.realm >= 5 ? 2 : a.realm >= 3 ? 3 : a.realm >= 2 ? 1 : 0;
    s.ds.push({ id: s.seq++, name: a.name, sex: a.sex, age: a.age, root: a.root, realm: a.realm, stage: a.stage, exp: Math.random() * 0.5, loyal: 55 + Math.random() * 25, rank, job: 'xiu', joined: this.game.day, arts: 0 });
    if (!quiet || a.root >= 4 || a.realm >= 2) this.log(`${a.name}（${ROOT_NAME[a.root]} · ${realmName(a.realm, a.stage)}）拜入山门。`, undefined, s);
    return true;
  }
  /** v0.71：忠诚变动的统一入口——改值 + 记流水（记「变动前 → 变动后」）；|v|<1 的月例零头不记 */
  private addLoyal(d: Disciple, v: number, w: string, day?: number) {
    const before = d.loyal;
    d.loyal = clamp(before + v, 0, 100);
    if (Math.abs(v) < 1) return;
    const log = d.loyalLog ?? (d.loyalLog = []);
    log.unshift({ d: Math.floor(day ?? this.game.day), b: before, v, w });
    if (log.length > 5) log.length = 5;
  }
  /** 一个月的修炼进度 */
  private gain(d: Disciple, target: MySect = this.s!) {
    const s = target, gf = GONGFA[s.gf] ?? GONGFA.generic;
    const jobK = d.job === 'xiu' ? 1 : d.job === 'li' ? 0.8 : 0.45;
    const sm = STAGE_MONTHS[clamp(d.realm, 0, STAGE_MONTHS.length - 1)];
    return (1 / sm) * ROOT_RATE[d.root] * gf.rate * (1 + s.halls.ling * 0.18) * (1 + Math.min(20, s.lib.length) * 0.015) * jobK;
  }
  /** 修满一个小境界：晋一阶；到了大瓶颈则冲关（库房出丹药钱，丹房添成算） */
  private advance(d: Disciple, day: number, target: MySect = this.s!, notify = true) {
    const s = target, r = Math.random, R = REALMS[d.realm];
    if (!R) { d.exp = 1; return; }
    if (d.stage < R.stages.length - 1) { d.stage++; d.exp = 0; return; }
    if (d.realm >= this.maxDiscipleRealm(s)) { d.exp = 1; return; }
    const cost = BT_COST[clamp(d.realm, 0, BT_COST.length - 1)] ?? 0, spare = s.stones - (s.reserve ?? 0);
    if (d.realm >= 1 && (!this.btOkOf(s, d) || spare < cost || r() >= this.btP * (d.rank >= 2 || d.root >= 4 ? 2 : 1))) { d.exp = 0.9; return; }
    s.stones -= cost; if (cost) { s.btSpent = (s.btSpent ?? 0) + cost; s.btTries = (s.btTries ?? 0) + 1; }
    const tries = d.bt ?? 0;
    const baseCh = d.realm === 0 ? 0.9 : Math.max(0.012, 0.14 * Math.pow(0.55, d.realm - 1));
    const rootBonus = ROOT_RATE[d.root] * (d.realm === 0 ? 0 : Math.max(0.006, 0.06 * Math.pow(0.55, d.realm - 1)));
    const danBonus = s.halls.dan * (d.realm === 0 ? 0 : Math.max(0.004, 0.03 * Math.pow(0.55, d.realm - 1)));
    const tryBonus = tries * (d.realm === 0 ? 0 : Math.max(0.006, 0.05 * Math.pow(0.55, d.realm - 1)));
    const ch = baseCh + rootBonus + danBonus + tryBonus;
    if (r() >= ch) { d.exp = 0.5; d.bt = tries + 1; return; }
    d.bt = 0; if (cost) s.btWins = (s.btWins ?? 0) + 1;
    d.realm++; d.stage = 0; d.exp = 0; this.addLoyal(d, 10, '冲关成功', day);
    const li = [0, 0, 300, 4000, 40000, 120000, 320000, 800000, 2000000, 5000000, 12000000, 28000000, 60000000][d.realm] ?? 0;
    if (li) { s.tribute += li; s.earned = (s.earned ?? 0) + li; }
    if (d.realm >= 2) {
      if (d.realm === 2 && d.rank < 1) d.rank = 1;
      if (d.realm >= 3 && d.rank < 3) d.rank = 3;
      s.fame += [0, 0, 3, 15, 80, 180, 320, 520, 850, 1400, 2200, 3500, 5500][d.realm] ?? 80;
      const msg = d.realm <= 4
        ? `${d.name}${['', '', '筑基功成', '结成金丹', '碎丹成婴'][d.realm]}${d.realm >= 3 ? '，晋为长老' : '，升入内门'}。`
        : `${d.name}破关功成，证道${REALMS[d.realm].name}境！`;
      this.log(msg, day, s);
      if (notify && d.realm >= 3) this.game.news(`${s.name}门下${d.name}晋入${REALMS[d.realm].name}境，${s.name}声势更盛。`, 'personal');
    }
  }
  private gift(id: string, n: number, target: MySect = this.s!) { const s = target; const g0 = s.gifts.find((x) => x.id === id); if (g0) g0.n += n; else if (s.gifts.length < 40) s.gifts.push({ id, n }); }
  private adventure(d: Disciple, day: number, target: MySect = this.s!) {
    const s = target, r = Math.random, x = r(), w = this.sectWorldOf(s);
    const sc = w === 'immortal' ? 200 : w === 'spirit' ? 60 : 1;
    const cName = worldCurrencyName(w);
    const lootVal = LOOT[clamp(d.realm, 0, LOOT.length - 1)];
    if (x < 0.05 + (d.realm === 0 ? 0.1 : 0)) {
      if (r() < 0.4) { s.ds = s.ds.filter((o) => o !== d); this.log(`${d.name}外出历练，一去不回，魂灯已灭。`, day, s); return; }
      d.exp = Math.max(0, d.exp - 0.3); this.log(`${d.name}历练中负伤而归。`, day, s); return;
    }
    if (x < 0.45) {
      const st = Math.round((10 + r() * 30) * lootVal * 3), tb = Math.round(st * (s.cut ?? 0.3));
      s.stones += st - tb; s.tribute += tb; s.earned = (s.earned ?? 0) + tb;
      const disp = sc <= 1 ? st : Math.max(1, Math.round(st / sc));
      if (st >= 200) this.log(`${d.name}历练归来，上缴${cName} ${disp}。`, day, s);
    } else if (x < 0.68) {
      const maxTier = w === 'immortal' ? 6 : w === 'spirit' ? 5 : 4;
      const scId = this.game.combat.randomScroll(Math.min(maxTier, d.realm + (r() < 0.3 ? 1 : 0)));
      if (scId && ITEMS[scId]) { this.gift(scId, 1, s); this.log(`${d.name}于古修洞府得${itemDef(scId).name}一卷，献与宗主。`, day, s); }
    } else if (x < 0.9) {
      const id = w === 'immortal' ? 'mat_xianyuan' : w === 'spirit' ? 'mat_lingjing' : ('mat_yaodan' + clamp(d.realm * 2 - 1 + Math.floor(r() * 2), 1, 7));
      if (ITEMS[id]) { this.gift(id, 1, s); if (d.realm >= 2) this.log(`${d.name}历练所得${itemDef(id).name}一枚，献与宗主。`, day, s); }
      else s.stones += 20 * lootVal;
    } else { d.exp += 0.4; this.addLoyal(d, 5, '历练有悟', day); if (d.realm >= 2) this.log(`${d.name}历练中偶有所悟，修为大进。`, day, s); }
  }
  private raid(day: number, target: MySect = this.s!, notify = true) {
    const s = target, g = this.game, r = Math.random, w = this.sectWorldOf(s);
    const sc = w === 'immortal' ? 200 : w === 'spirit' ? 60 : 1, cName = worldCurrencyName(w);
    if (s.ds.length < 3 || day - s.founded < 180) return;
    const who = pick(s.dao === 'mo' ? ['几派联手的除魔修士', '一伙寻仇的散修', '想黑吃黑的魔修'] : ['一伙劫修', '敌对宗门的试探', '觊觎灵脉的散修联盟', '前来夺宝的邪修']);
    const atk = Math.max(30, (s.fame * 2.2 + s.stones / 400) * (0.5 + r() * 1.1));
    const zm = s.zhenMode ?? 'shou', ze = Math.min(s.zhenE ?? 0, this.zhenMaxOf(s));
    if (ze > 0 && zm === 'huan' && r() < 0.5) { this.log(`${who}在「${ZHEN_MODE.huan[0]}」的迷雾里转了三日，连山门都没摸着，悻悻退去。`, day, s); return; }
    const home = notify && this.atHome();
    const def = this.power(s) + (home ? (POWER[clamp(g.hero.realm, 0, POWER.length - 1)] ?? 2400) * 1.5 : 0);
    if (ze > 0) s.zhenE = Math.max(0, ze - atk * 0.3 * (zm === 'shou' ? 0.7 : 1));
    if (def >= atk) {
      const loot = Math.round(atk * (0.5 + r()) * (ze > 0 && zm === 'sha' ? 1.6 : 1));
      s.stones += loot; s.fame += Math.min(10, 2 + atk / 300); s.wins++;
      for (const d of s.ds) this.addLoyal(d, 3, '击退来犯', day);
      const disp = sc <= 1 ? loot : Math.max(1, Math.round(loot / sc));
      this.log(`${who}来犯，${home ? '宗主亲自出手，' : '护宗大阵与门人合力，'}尽数击退，缴获${cName} ${disp}。`, day, s);
    } else {
      const lost = Math.round(s.stones * (0.15 + r() * 0.25));
      s.stones -= lost; s.fame = Math.max(0, s.fame - 8); s.losses++;
      let dead = 0; const fallen: string[] = [];
      s.ds = s.ds.filter((d) => { if (dead < 3 && (d.job === 'shou' || r() < 0.3) && r() < 0.12) { dead++; fallen.push(d.name); return false; } return true; });
      const disp = sc <= 1 ? lost : Math.max(1, Math.round(lost / sc));
      this.log(`${who}来犯，山门失守：库房被劫${cName} ${disp}${fallen.length ? `，${fallen.join('、')}战死` : ''}。`, day, s);
      if (notify) g.toast(`${s.name}遭${who}袭击，库房被劫！（多派门人镇守山门、给护宗大阵充能）`, 'warn');
    }
  }
  private monthSect(s: MySect, day: number, isActive: boolean) {
    const g = this.game, r = Math.random, maxDRealm = this.maxDiscipleRealm(s);
    // 一、求拜者与外门/杂役数字池新陈代谢
    s.apps = s.apps.filter((a) => a.until > day);
    if (s.outer && s.servant) {
      if (s.outer.j > 0) {
        const heal = Math.min(s.outer.j, Math.max(1, Math.round(s.outer.j * 0.45)));
        s.outer.j -= heal; s.outer.a += heal;
      }
      const otRoom = Math.max(0, s.outer.c - s.outer.a - s.outer.j);
      if (otRoom > 0 && s.servant.a > 0) {
        const promo = Math.min(otRoom, Math.max(2, Math.floor(s.servant.a * 0.015)));
        s.servant.a -= promo; s.outer.a += promo;
      }
      if (s.open) {
        const pubs = (g.ws.myArts ?? []).filter((m) => m.pub).length;
        const addBase = Math.max(4, Math.round(8 + s.fame / 60 + s.halls.ling * 8 + pubs * 4));
        const svRoom = Math.max(0, s.servant.c - s.servant.a);
        const otR = Math.max(0, s.outer.c - s.outer.a - s.outer.j);
        s.servant.a += Math.min(svRoom, addBase);
        s.outer.a += Math.min(otR, Math.max(4, Math.round(otR * 0.025 + addBase * 0.7)));
      }
    }
    const cap = this.capOf(s);
    if (s.open && s.ds.length < cap) {
      const pubs = (g.ws.myArts ?? []).filter((m) => m.pub).length;
      const lam = Math.min(3, 0.3 + s.fame / 400 + s.lib.length * 0.03 + pubs * 0.25);
      const n = Math.floor(lam) + (r() < lam - Math.floor(lam) ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const a = this.genApplicant(0, s); a.until = day + 60;
        if (a.root < Math.max(1, s.minRoot - (a.realm >= 2 ? 1 : 0))) continue;
        if (s.auto && s.ds.length < cap) this.accept(a, true, s); else if (s.apps.length < 12) s.apps.push(a);
      }
    }
    // 二、修炼、产业、月例
    let income = 0, upkeep = 0, qi = 0;
    const cut = s.cut ?? 0.3, h = g.hero;
    let demand = 0;
    for (const d of s.ds) {
      const R = REALMS[d.realm]; if (!R) continue;
      if (d.realm >= 1 && d.realm < maxDRealm && d.stage >= R.stages.length - 1 && d.exp >= 0.85 && this.btOkOf(s, d)) {
        demand += BT_COST[clamp(d.realm, 0, BT_COST.length - 1)] ?? 0;
      }
    }
    this.btP = demand > 0 ? Math.min(1, (Math.max(0, s.stones - (s.reserve ?? 0)) * (s.btRate ?? 0.05)) / demand) : 1;
    for (const d of s.ds.slice().sort((a, b) => b.rank - a.rank || b.root - a.root)) {
      d.age += 1 / 12;
      d.exp += this.gain(d, s) * (0.8 + r() * 0.4);
      if (d.arts < s.lib.length && r() < 0.12 + s.halls.lib * 0.05) d.arts++;
      income += this.incomeOf(d, s); upkeep += this.upkeepOf(d);
      qi += (QI[clamp(d.realm, 0, QI.length - 1)] ?? 0) * (0.5 + d.loyal / 200);
      if (d.exp >= 1) this.advance(d, day, s, isActive);
      this.addLoyal(d, (s.stones > 0 ? 0.4 : -3) + (d.rank > 0 ? 0.2 : 0) - (cut >= 0.5 ? 0.5 : 0),
        s.stones <= 0 ? '月例无着' : cut >= 0.5 ? '抽成过重' : '月例', day);
    }
    const trib = Math.round(income * cut);
    s.tribute += trib; s.earned = (s.earned ?? 0) + trib; s.stones += Math.round(income - trib - upkeep);
    if (s.stones < 0) s.stones = 0;
    if (isActive) {
      s.qi = Math.min(this.qiCap(), (s.qi ?? 0) + qi);
    } else {
      const wCap = QI_NEED[clamp(h.realm, 0, QI_NEED.length - 1)] * 3;
      s.qi = Math.min(wCap, (s.qi ?? 0) + qi);
    }
    if (s.halls.dan > 0 && r() < 0.08 + s.halls.dan * 0.05) {
      const top = s.ds.reduce((m0, d) => Math.max(m0, d.realm), 0);
      const pid = PILL_OF[clamp(Math.min(h.realm, top + 1), 0, PILL_OF.length - 1)];
      if (ITEMS[pid]) { const n = 1 + (s.halls.dan >= 4 && r() < 0.5 ? 1 : 0); this.gift(pid, n, s); if (r() < 0.3) this.log(`丹房开炉，炼得${itemDef(pid).name} ${n} 枚，献与宗主。`, day, s); }
    }
    const zmax = this.zhenMaxOf(s);
    if (zmax > 0 && s.zhenAuto !== false && (s.zhenE ?? 0) < zmax) {
      const add = Math.min(zmax - (s.zhenE ?? 0), Math.ceil(zmax * 0.1), Math.max(0, Math.floor((s.stones - (s.reserve ?? 0)) / ZHEN_COST)));
      if (add > 0) { s.zhenE = (s.zhenE ?? 0) + add; s.stones -= add * ZHEN_COST; }
    }
    // 三、正常岁月寿元耗尽坐化、离去（绝不冻结）
    s.ds = s.ds.filter((d) => {
      const life = REALMS[d.realm]?.life ?? 120;
      if (d.age > life * (0.9 + (d.id % 7) * 0.03)) {
        this.log(`${RANK_NAME[d.rank]}${d.name}寿元耗尽，于洞府中坐化。`, day, s);
        if (s.masterId === d.id) {
          s.masterId = undefined;
          s.masterGuard = [];
          this.log('现任掌门坐化，太上长老暂摄宗政。', day, s);
          if (isActive) g.toast(`${s.name}掌门${d.name}坐化，太上暂摄宗政！`, 'warn');
        }
        s.guard = (s.guard ?? []).filter((id) => id !== d.id);
        s.masterGuard = (s.masterGuard ?? []).filter((id) => id !== d.id);
        return false;
      }
      if (d.loyal < 12 && r() < 0.25) {
        this.log(`${d.name}不告而别，下山去了。`, day, s);
        if (s.masterId === d.id) { s.masterId = undefined; s.masterGuard = []; this.log('现任掌门离去，太上长老暂摄宗政。', day, s); }
        s.guard = (s.guard ?? []).filter((id) => id !== d.id);
        s.masterGuard = (s.masterGuard ?? []).filter((id) => id !== d.id);
        return false;
      }
      return true;
    });
    // 下界留守宗门若因代掌门坐化/离去而无主，自动从余下高阶弟子中推举接班人
    if (!isActive && s.masterId === undefined && s.ds.length > 0) {
      appointRegentOnAscend(s, day);
    }
    // 三之二、委任掌门自动施政
    if (isActive) this.administerByMaster(day);
    // 四、历练、外敌
    for (const d of s.ds.slice()) if (d.job === 'li' && r() < 0.16) this.adventure(d, day, s);
    if (r() < 0.03 + Math.min(0.05, s.fame / 20000)) this.raid(day, s, isActive);
    // 五、威望
    const target = this.fameTarget(s);
    s.fame += (target - s.fame) * (target > s.fame ? 0.02 : 0.004);
  }
  /** 以宗门眼下的实力，名声该有多大 */
  fameTarget(target: MySect | undefined = this.s) {
    const s = target!, h = this.game.hero;
    const top = s.ds.reduce((m, d) => Math.max(m, d.realm), 0), pubs = (this.game.ws.myArts ?? []).filter((m) => m.pub).length;
    const halls = s.halls.lib + s.halls.dan + s.halls.zhen + s.halls.ling + (s.halls.dock ?? 0) + (s.halls.chi ?? 0);
    return 20 + Math.max(0, h.realm - 4) * 120 + h.stage * 30 + 20 * Math.sqrt(s.ds.length) + 40 * top * top + s.lib.length * 4 + pubs * 60 + halls * 15 + Math.min(100, s.wins * 4);
  }
  /** v0.62：人人都有进项——打理产业的拿全额，守山三成、修炼两成、历练一成（历练另有所得）；越忠心越肯出力 */
  private incomeOf(d: Disciple, target: MySect = this.s!) {
    const k = d.job === 'ye' ? 1 : d.job === 'shou' ? 0.3 : d.job === 'xiu' ? 0.2 : 0.1;
    return (INCOME[clamp(d.realm, 0, INCOME.length - 1)] ?? 4) * k * (1 + target.halls.dan * 0.2) * (0.6 + d.loyal / 250);
  }
  private upkeepOf(d: Disciple) { return UPKEEP[d.rank] * (1 + d.realm); }
  /** 日结算入口（game.update 每半日调一次）：跨月则逐月推演（含下界留守宗门正常岁月推演） */
  daily(_days: number) {
    this.sync();
    const m = Math.floor(this.game.day / 30);
    const s = this.s;
    if (s) {
      this.fixSect(s);
      const n = Math.min(m - s.lastM, 600);
      if (n > 0) {
        s.lastM = m;
        const before = s.ds.length, apps0 = s.apps.length;
        for (let i = n - 1; i >= 0; i--) this.monthSect(s, (m - i) * 30, true);
        if (s.apps.length > apps0 && !s.auto) this.game.toast(`${s.name}山门外有 ${s.apps.length} 人求拜。`, 'info');
        else if (n >= 12 && s.ds.length !== before) this.game.toast(`${s.name}：${Math.floor(n / 12)} 年间门人由 ${before} 人变为 ${s.ds.length} 人。`, 'info');
      } else if (m < s.lastM) {
        s.lastM = m;
      }
    }
    // 跨界下界/他界自建宗门同步按正常年月流逝推演，不冻结时光
    const worlds = this.game.ws.worlds;
    if (worlds) {
      for (const w of ['human', 'spirit', 'immortal'] as WorldId[]) {
        const os = worlds[w]?.mySect;
        if (!os || os === s) continue;
        this.fixSect(os);
        const on = Math.min(m - os.lastM, 600);
        if (on > 0) {
          os.lastM = m;
          for (let i = on - 1; i >= 0; i--) this.monthSect(os, (m - i) * 30, false);
        } else if (m < os.lastM) {
          os.lastM = m;
        }
      }
    }
  }

  // ------------------------------------------------------------ 库房
  canPay(n: number) { return !!this.s && Math.floor(this.s.stones) + C.bagCount(this.game.hero, this.curId()) * this.curScale() >= n; }
  /** 先动宗门库房，不够再掏宗主自己的储物袋 */
  pay(n: number) {
    const s = this.s; if (!s || !this.canPay(n)) return false;
    const a = Math.min(Math.floor(s.stones), n); s.stones -= a;
    const rem = n - a;
    if (rem > 0) {
      const sc = this.curScale(), take = Math.ceil(rem / sc);
      C.removeItem(this.game.hero, this.curId(), take);
      const change = take * sc - rem;
      if (change > 0) s.stones += change;
    }
    return true;
  }

  // ------------------------------------------------------------ v0.71 宗门面板：公开接口
  fameName() { return fameTitle(this.s?.fame ?? 0); }
  qiFill() { return this.s ? this.qiRatio() : 0; }
  monthly() {
    const s = this.s;
    if (!s) return { income: 0, trib: 0, upkeep: 0, net: 0 };
    let inc = 0, up = 0;
    for (const d of s.ds) { inc += this.incomeOf(d, s); up += this.upkeepOf(d); }
    const trib = Math.round(inc * (s.cut ?? 0.3));
    return { income: Math.round(inc), trib, upkeep: Math.round(up), net: Math.round(inc - trib - up) };
  }
  /** 灵石 / 灵晶 / 仙元石：库房与储物袋账面与原币数量 */
  balance() {
    const sc = this.curScale(), cName = this.curName();
    const vault = Math.floor(this.s?.stones ?? 0), bag = C.bagCount(this.game.hero, this.curId()) * sc;
    return {
      vault, bag, total: vault + bag,
      curScale: sc, curName: cName,
      vaultNative: sc <= 1 ? vault : Math.floor(vault / sc),
      bagNative: C.bagCount(this.game.hero, this.curId()),
    };
  }
  /** 殿宇的现状与下一级价钱（按当前界域定制接引池名与开放性） */
  hallRows(): { k: keyof MySect['halls']; name: string; desc: string; lv: number; max: boolean; cost: number; canPay: boolean; locked?: string }[] {
    const s = this.s!; const bal = this.balance().total; const w = this.sectWorld();
    return HALLS.map((hd) => {
      const lv = s.halls[hd.k] ?? 0, max = lv >= 5, cost = max ? 0 : HALL_COST[lv];
      if (hd.k === 'chi') {
        const name = w === 'immortal' ? '化仙飞升池' : w === 'spirit' ? '化灵接引池' : '接引飞升池（上界专属）';
        const desc = w === 'immortal'
          ? '凝先天仙元洗髓飞升：每月可接引下界灵界宗门弟子或尚在人世的亲友飞升入仙界（每级每月 2 名额，等级越高门槛越宽）'
          : w === 'spirit'
            ? '引天地灵脉洗髓聚灵：每月可接引下界人界宗门弟子或尚在人世的亲友飞升入灵界（每级每月 2 名额，等级越高门槛越宽）'
            : '须在灵界或仙界建宗后方可筑此奇池接引下界故人';
        const locked = w === 'human' ? '上界专属' : undefined;
        return { k: hd.k, name, desc, lv, max, cost, canPay: !locked && !max && bal >= cost, locked };
      }
      return { k: hd.k, name: hd.name, desc: hd.desc, lv, max, cost, canPay: !max && bal >= cost };
    });
  }
  /** 某人的瓶颈与冲关详情（名册里直接写在界面上，手机上也看得见） */
  breakInfo(d: Disciple) {
    const s = this.s!, last = (REALMS[d.realm]?.stages.length ?? 3) - 1, maxD = this.maxDiscipleRealm(s);
    const bottleneck = d.stage >= last && d.realm < maxD;
    const cost = BT_COST[clamp(d.realm, 0, BT_COST.length - 1)] ?? 0;
    const tries = d.bt ?? 0;
    const baseCh = d.realm === 0 ? 0.9 : Math.max(0.012, 0.14 * Math.pow(0.55, d.realm - 1));
    const rootBonus = ROOT_RATE[d.root] * (d.realm === 0 ? 0 : Math.max(0.006, 0.06 * Math.pow(0.55, d.realm - 1)));
    const danBonus = s.halls.dan * (d.realm === 0 ? 0 : Math.max(0.004, 0.03 * Math.pow(0.55, d.realm - 1)));
    const tryBonus = tries * (d.realm === 0 ? 0 : Math.max(0.006, 0.05 * Math.pow(0.55, d.realm - 1)));
    const ch = baseCh + rootBonus + danBonus + tryBonus;
    const spare = Math.max(0, Math.floor(s.stones) - (s.reserve ?? 0));
    return {
      bottleneck, capped: d.realm >= maxD, cost, tries, eligible: this.btOk(d), chance: clamp(ch, 0, 0.95),
      ready: clamp(d.exp, 0, 1) >= 0.9, spare, spareOk: spare >= cost, monthShare: Math.floor(spare * (s.btRate ?? 0.05)),
    };
  }
  /** 冲关开销的预计 */
  btForecast() {
    const s = this.s;
    if (!s) return { ready: 0, demand: 0, budget: 0, expect: 0, spare: 0 };
    const maxD = this.maxDiscipleRealm(s);
    let ready = 0, demand = 0;
    for (const d of s.ds) {
      if (d.realm < 1 || d.realm >= maxD) continue;
      const last = (REALMS[d.realm]?.stages.length ?? 3) - 1;
      if (d.stage < last || d.exp < 0.85 || !this.btOk(d)) continue;
      ready++; demand += BT_COST[clamp(d.realm, 0, BT_COST.length - 1)] ?? 0;
    }
    const spare = Math.max(0, Math.floor(s.stones) - (s.reserve ?? 0));
    const budget = Math.floor(spare * (s.btRate ?? 0.05));
    return { ready, demand, budget, expect: ready ? Math.min(demand, budget) : 0, spare };
  }
  /** 近一月是否已亲自指点过 */
  taughtRecently(d: Disciple) { return d.t !== undefined && this.game.day - d.t < 30; }
  /** 赐丹的价钱（宗主出钱：先库房，后储物袋） */
  pillCostOf(d: Disciple) { return [50, 200, 2000, 15000, 80000, 200000, 480000, 1000000, 2200000, 5000000, 12000000, 26000000, 56000000][clamp(d.realm, 0, 12)]; }
  /** 亲自指点一日：修为进一大截、忠诚 +8 */
  guide(d: Disciple): boolean {
    const g = this.game, s = this.s;
    if (!s?.ds.includes(d) || this.taughtRecently(d)) return false;
    g.passDays(1); d.t = g.day; d.exp += Math.max(0.12, this.gain(d) * 6); this.addLoyal(d, 8, '宗主亲自指点');
    if (d.exp >= 1) { this.openBudget(); this.advance(d, g.day); }
    g.updateUI(true); return true;
  }
  /** 赐下丹药：修为 +35%，忠诚 +4 */
  grantPill(d: Disciple): boolean {
    const g = this.game, s = this.s;
    if (!s?.ds.includes(d) || !this.pay(this.pillCostOf(d))) return false;
    d.exp += 0.35; this.addLoyal(d, 4, '宗主赐丹');
    if (d.exp >= 1) { this.openBudget(); this.advance(d, g.day); }
    g.updateUI(true); return true;
  }
  canPromote(d: Disciple) { const next = d.rank + 1, need = [0, 1, 2, 3][next] ?? 9; return next <= 3 && (next === 1 ? d.realm >= 2 || (d.realm === 1 && d.stage >= 6) : d.realm >= need); }
  promoteHint(d: Disciple) {
    const next = d.rank + 1;
    if (next > 3) return '已是长老，位极人臣';
    return next === 1 ? '须炼气七层以上（或已筑基）' : `须${REALMS[[0, 1, 2, 3][next]]?.name ?? ''}期`;
  }
  promote(d: Disciple): boolean {
    if (!this.canPromote(d)) return false;
    const next = d.rank + 1;
    d.rank = next; this.addLoyal(d, 12, `晋为${RANK_NAME[next]}`);
    this.log(`${d.name}晋为${RANK_NAME[next]}。`);
    return true;
  }
  /**
   * 宗主亲自主持冲关：提前替他办，成败与门人自行冲关同一套成算。
   * 不受「每月冲关用度」之限（openBudget），但仍守库房保底线。
   */
  breakthrough(d: Disciple): { ok: boolean; msg: string } {
    const g = this.game, s = this.s;
    if (!s?.ds.includes(d)) return { ok: false, msg: '此人已不在名册' };
    const info = this.breakInfo(d);
    if (!info.bottleneck) return { ok: false, msg: '尚未修到本境最后一层，不必冲关' };
    if (info.capped) return { ok: false, msg: `门人在本界至多修到${REALMS[this.maxDiscipleRealm(s)]?.name ?? '极境'}圆满` };
    if (!info.ready) return { ok: false, msg: `修为未至圆满（现 ${Math.floor(clamp(d.exp, 0, 1) * 100)}%），先赐丹蓄力` };
    if (!info.eligible) return { ok: false, msg: '冲关资格不够（见库房「冲关资格」一栏）' };
    if (!info.spareOk) return { ok: false, msg: `库房保底线之上还差 ${info.cost - info.spare} ${this.curName()}（折算）` };
    const before = d.realm;
    this.openBudget();
    this.advance(d, g.day);
    const ok = d.realm > before;
    this.log(ok ? `${d.name}于宗主护持下破境，晋为${realmName(d.realm, d.stage)}。` : `${d.name}冲关不成，修为回落（下回成算添几分）。`);
    g.updateUI(true);
    return { ok, msg: ok ? `${d.name}冲关成功，晋为${realmName(d.realm, d.stage)}` : `${d.name}冲关失败：修为回落、丹药钱已花，下回成算添几分` };
  }
  /** 改派差事 */
  assignJob(d: Disciple, j: Job) { if (this.s?.ds.includes(d)) d.job = j; }
  /** 逐出山门（亲卫与掌门护卫名单里也一并划掉；若为委任掌门或据点主将一并撤职） */
  expel(d: Disciple) {
    const s = this.s!; if (!s.ds.includes(d)) return;
    s.ds = s.ds.filter((x) => x !== d);
    s.guard = (s.guard ?? []).filter((id) => id !== d.id);
    s.masterGuard = (s.masterGuard ?? []).filter((id) => id !== d.id);
    if (s.masterId === d.id) { s.masterId = undefined; s.masterGuard = []; this.log(`逐出掌门${d.name}，太上长老收回宗政。`); }
    for (const h of Object.values(this.game.sectwar?.S.hold ?? {})) {
      if (h.commanderId === d.id) { delete h.commanderId; delete h.commanderName; }
    }
    this.log(`${d.name}被逐出山门。`);
  }
  /** v0.73：现任委任掌门 */
  masterDisciple(): Disciple | undefined {
    const s = this.s;
    if (!s || s.masterId === undefined) return undefined;
    const d = s.ds.find((x) => x.id === s.masterId);
    if (!d) { s.masterId = undefined; s.masterGuard = []; return undefined; }
    return d;
  }
  /** v0.73：退居太上长老，委任掌门打理日常宗政 */
  appointMaster(d: Disciple): { ok: boolean; msg: string } {
    const s = this.s;
    if (!s || !s.ds.includes(d)) return { ok: false, msg: '此人已不在名册' };
    if (d.loyal < 70) return { ok: false, msg: '此人忠诚尚浅（须忠诚 ≥ 70 方可托付宗政）' };
    if (d.rank < 2 && d.realm < 3) return { ok: false, msg: '须真传弟子或结丹以上高阶长老方能服众' };
    if (d.rank < 3) d.rank = 3;
    s.masterId = d.id;
    s.guard = (s.guard ?? []).filter((id) => id !== d.id);
    s.masterGuard = (s.masterGuard ?? []).filter((id) => id !== d.id && s.ds.some((x) => x.id === id));
    s.policy ??= 'cultivate';
    s.masterAuto = { ...DEFAULT_MASTER_AUTO, ...s.masterAuto };
    this.addLoyal(d, 15, '受任为本宗掌门');
    this.log(`太上长老退居幕后，委任${d.name}为现任掌门，依「${SECT_POLICY_INFO[s.policy].name}」方针全权代管宗门大小事务。`);
    this.game.toast(`已委任${d.name}为掌门，宗门开启全面自治（你仍可随时亲手干涉）！`, 'good');
    this.game.updateUI(true);
    return { ok: true, msg: `已委任${d.name}为现任掌门` };
  }
  /** v0.73：收回宗主大权亲政 */
  reclaimPower(): boolean {
    const s = this.s; if (!s || s.masterId === undefined) return false;
    const old = this.masterDisciple();
    s.masterId = undefined;
    s.masterGuard = [];
    this.log(`太上长老出关亲政${old ? `（${old.name}退回长老位）` : ''}。`);
    this.game.toast('太上长老收回宗主大权亲政。', 'info');
    this.game.updateUI(true);
    return true;
  }
  /** v0.73：设定宗门大政方针 */
  setPolicy(p: SectPolicy) {
    const s = this.s; if (!s || s.policy === p) return;
    s.policy = p;
    this.log(`宗门大政方针定为「${SECT_POLICY_INFO[p].name}」。`);
    this.game.updateUI(true);
  }
  /** 细粒度切换掌门托管项目（玩家随时接管或交回某项宗务） */
  setMasterAuto(k: keyof MasterAutoFlags, on: boolean) {
    const s = this.s; if (!s) return;
    s.masterAuto = { ...DEFAULT_MASTER_AUTO, ...s.masterAuto };
    s.masterAuto[k] = on;
    this.game.updateUI(true);
  }
  /** 一键开启或关闭掌门全托管 */
  setAllMasterAuto(on: boolean) {
    const s = this.s; if (!s) return;
    s.masterAuto = { recruit: on, promote: on, build: on, lib: on, vault: on, war: on, guard: on };
    this.game.updateUI(true);
  }
  /** v0.73：委任掌门按月全面自动施政（覆盖招徒、门人差事/晋升/育才、藏经心法、建殿/大阵/船坞/接引池、库房用度、据点战备外交与亲卫编组，保留玩家随时干涉权力） */
  private administerByMaster(day: number) {
    const s = this.s, g = this.game;
    if (!s || s.masterId === undefined) return;
    const master = s.ds.find((x) => x.id === s.masterId);
    if (!master) {
      s.masterId = undefined;
      this.log('委任掌门已不在名册，太上长老暂摄宗政。', day);
      g.toast(`${s.name}掌门出缺，太上长老暂摄宗政！`, 'warn');
      return;
    }
    const auto: Required<MasterAutoFlags> = (s.masterAuto = { ...DEFAULT_MASTER_AUTO, ...s.masterAuto });
    const pol: SectPolicy = s.policy ?? 'cultivate';
    const notes: string[] = [];
    const vaultSpare = () => Math.max(0, Math.floor(s.stones) - (s.reserve ?? 0));

    // 1) 库房与用度调度（抽成 / 保底线 / 冲关用度 / 冲关资格）
    if (auto.vault) {
      const m = this.monthly();
      if (m.income > 0 && m.net < 0 && (s.cut ?? 0.3) > 0.1) {
        s.cut = 0.1;
        notes.push('下调宗主抽成至 10% 稳住库房');
      } else {
        const wantCut = pol === 'economy' || pol === 'cultivate' ? 0.2 : 0.3;
        if (s.cut === undefined) s.cut = wantCut;
      }
      if (pol === 'economy') {
        if ((s.reserve ?? 0) < 100000 && s.stones > 300000) s.reserve = 100000;
        else if ((s.reserve ?? 0) < 20000 && s.stones > 60000) s.reserve = 20000;
      } else if ((s.reserve ?? 0) < 5000 && s.stones > 45000) {
        s.reserve = 5000;
      } else if ((s.reserve ?? 0) > s.stones * 0.85 && s.stones >= 5000) {
        const idx = RESERVE_STEPS.findIndex((v) => v >= (s.reserve ?? 0));
        if (idx > 0) s.reserve = RESERVE_STEPS[idx - 1];
      }
      const sp = vaultSpare();
      if (pol === 'cultivate') {
        s.btRule = s.ds.length >= this.cap() * 0.9 ? 1 : 0;
        s.btRate = sp > 120000 ? 0.25 : 0.1;
      } else if (pol === 'war') {
        if (s.btRule === undefined || s.btRule > 1) s.btRule = 1;
        s.btRate = 0.1;
      } else {
        if (s.btRule === undefined || s.btRule > 1) s.btRule = 1;
        s.btRate = 0.05;
      }
    }

    // 2) 方针专项基础政令（保底扩军 / 供需 / 外交）
    if (pol === 'war') {
      if (s.outer) {
        const bonus = Math.max(2, Math.round(4 + s.fame / 140));
        s.outer.a = Math.min(s.outer.c, s.outer.a + bonus);
      }
      if (g.sectwar) g.sectwar.addSupply(MY_SECT_ID, { pills: 3 + s.halls.dan * 2 });
    }

    // 3) 自动招徒与门墙规矩（山门开闭 / 灵根门槛 / 执事收录 / 外门与杂役池）
    if (auto.recruit) {
      const cap = this.cap();
      const full = s.ds.length >= cap;
      if (full && s.open) s.open = false;
      else if (!full && !s.open) s.open = true;
      if (!s.auto) s.auto = true;
      const wantMinRoot = s.ds.length >= cap * 0.85 ? 4 : pol === 'cultivate' ? 3 : 2;
      if (s.minRoot !== wantMinRoot) s.minRoot = wantMinRoot;
      if (s.apps.length) {
        const before = s.ds.length;
        this.takeAll(wantMinRoot >= 3 ? 'root3' : 'all');
        if (s.ds.length > before) notes.push(`收录新徒 ${s.ds.length - before} 名`);
        // 门墙已满或不合高阶门槛的滞留拜帖一并礼貌回绝，避免积压
        if (s.ds.length >= cap && s.apps.length) s.apps = [];
      }
      if (s.servant && s.servant.a < s.servant.c && vaultSpare() > 1500) {
        const stepS = pol === 'economy' ? 12 : 8;
        s.servant.a = Math.min(s.servant.c, s.servant.a + Math.min(stepS, s.servant.c - s.servant.a));
      }
      if (s.outer && s.outer.a < s.outer.c && pol !== 'war' && vaultSpare() > 2000) {
        const stepO = Math.max(1, Math.round(2 + s.fame / 240));
        s.outer.a = Math.min(s.outer.c, s.outer.a + stepO);
      }
    }

    // 4) 自动差事调度、论功晋升与育才培养（赐丹 / 助冲关 / 抚慰忠诚）
    if (auto.promote) {
      const nonMaster = s.ds.filter((d) => d.id !== master.id);
      if (pol === 'cultivate') {
        let shouCnt = 0;
        const minShou = Math.min(2, Math.floor(nonMaster.length / 5));
        for (const d of nonMaster) {
          if (d.root >= 4 || d.realm >= 2) d.job = 'xiu';
          else if (shouCnt < minShou && d.realm >= 1) { d.job = 'shou'; shouCnt++; }
          else if (d.job === 'li') d.job = 'ye';
        }
      } else if (pol === 'war') {
        for (const d of nonMaster) {
          if (d.realm >= 2 || d.rank >= 1) d.job = 'shou';
          else if (d.root <= 2 && d.job !== 'ye') d.job = 'ye';
        }
      } else if (pol === 'economy') {
        for (const d of nonMaster) {
          if (d.root <= 3 && d.realm < 3) d.job = 'ye';
          else if (d.root >= 4) d.job = 'xiu';
        }
      } else if (pol === 'diplomacy') {
        let liCnt = 0;
        const maxLi = Math.max(1, Math.floor(nonMaster.length / 6));
        for (const d of nonMaster) {
          if (d.root >= 4) d.job = 'xiu';
          else if (liCnt < maxLi && d.realm >= 2 && d.loyal >= 75) { d.job = 'li'; liCnt++; }
          else d.job = d.rank >= 1 ? 'shou' : 'ye';
        }
      }

      let promoted = 0;
      const sorted = [...s.ds].sort((a, b) => (b.realm * 100 + b.loyal) - (a.realm * 100 + a.loyal));
      for (const d of sorted) {
        if (d.id === master.id || d.rank >= 3) continue;
        if ((d.rank === 0 && (d.realm >= 2 || (d.realm === 1 && d.stage >= 6)) && d.loyal >= 55)
          || (d.rank === 1 && d.realm >= 2 && d.loyal >= 65)
          || (d.rank === 2 && d.realm >= 3 && d.loyal >= 75)) {
          if (this.promote(d)) promoted++;
        }
        if (promoted >= 3) break;
      }
      if (promoted > 0) notes.push(`晋升骨干 ${promoted} 人`);

      // 安抚低忠诚门人（避免核心门人流失）
      let calmed = 0;
      for (const d of sorted) {
        if (d.id === master.id) continue;
        if (d.loyal < 55) {
          this.addLoyal(d, 5, '掌门勉励慰问', day);
          if (++calmed >= 2) break;
        }
      }

      // 纯库房盈余充足时，优先对卡在瓶颈待蓄力的天/双灵根骨干赐丹、对已蓄满瓶颈者护法冲关
      let pilled = 0;
      for (const d of sorted) {
        if (d.root < 3 && d.rank < 1) continue;
        const bi = this.breakInfo(d);
        if (bi.bottleneck && !bi.ready && bi.eligible) {
          const pc = this.pillCostOf(d);
          if (vaultSpare() >= pc * 4 && Math.floor(s.stones) >= pc) {
            s.stones -= pc;
            d.exp += 0.35;
            this.addLoyal(d, 4, '掌门赐丹栽培', day);
            pilled++;
            if (pilled >= 2) break;
          }
        }
      }
      if (pilled > 0) notes.push(`赐丹栽培骨干 ${pilled} 人`);

      for (const d of sorted) {
        const bi = this.breakInfo(d);
        if (bi.bottleneck && bi.ready && bi.eligible && bi.cost > 0 && vaultSpare() >= bi.cost * 1.5) {
          const beforeR = d.realm;
          this.openBudget();
          this.advance(d, day);
          if (d.realm > beforeR) notes.push(`护持${d.name}破境入${realmName(d.realm, d.stage)}`);
          break;
        }
      }
    }

    // 5) 自动收录秘法入藏经阁、择优立镇派心法、刊行自创功法
    if (auto.lib) {
      if (s.lib.length < this.libCap()) {
        const pubs = this.publishable();
        if (pubs.length) {
          const best = [...pubs].sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0))[0];
          if (best && this.publishArt(best.id)) {
            notes.push(`录入《${best.name}》`);
          }
        }
      }
      const heroGf = GONGFA[g.hero.gongfa];
      const curGf = GONGFA[s.gf];
      if (heroGf && s.gf !== g.hero.gongfa && heroGf.rate > (curGf?.rate ?? 0)) {
        if (this.setGf(g.hero.gongfa)) notes.push(`改立《${heroGf.name}》为镇派心法`);
      }
      const unpub = (g.ws.myArts ?? []).find((m) => !m.pub);
      if (unpub) {
        const cost = [500, 800, 3000, 12000, 40000][unpub.def.tier] ?? 800;
        if (vaultSpare() >= cost * 2) {
          if (this.publishMyArt(unpub)) notes.push(`刊行自创《${unpub.def.name}》`);
        }
      }
    }

    // 6) 自动扩建宗门殿宇（含接引池）、护宗大阵充能与变阵、战船修造与采买、跨界接引
    if (auto.build) {
      const hasChi = this.sectWorld() !== 'human';
      const order: (keyof MySect['halls'])[] = pol === 'war'
        ? (hasChi ? ['zhen', 'dock', 'dan', 'ling', 'lib', 'chi'] : ['zhen', 'dock', 'dan', 'ling', 'lib'])
        : pol === 'economy'
          ? (hasChi ? ['dan', 'ling', 'lib', 'dock', 'zhen', 'chi'] : ['dan', 'ling', 'lib', 'dock', 'zhen'])
          : (hasChi ? ['ling', 'lib', 'dan', 'chi', 'dock', 'zhen'] : ['ling', 'lib', 'dan', 'dock', 'zhen']);
      for (const hk of order) {
        const lv = s.halls[hk] ?? 0;
        if (lv >= 5) continue;
        const cost = HALL_COST[lv];
        if (vaultSpare() >= cost + Math.max(4000, Math.round(cost * 0.25))) {
          if (this.buildHall(hk)) {
            const nm = hk === 'chi' ? (this.sectWorld() === 'immortal' ? '化仙飞升池' : '化灵接引池') : (HALLS.find((x) => x.k === hk)?.name ?? hk);
            notes.push(`扩建${nm}至 ${lv + 1} 级`);
            break;
          }
        }
      }
      if (s.halls.zhen > 0) {
        s.zhenAuto = true;
        const atWar = !!g.sectwar?.S.wars.some((w) => !w.fall && (w.a === MY_SECT_ID || w.b === MY_SECT_ID));
        const wantMode: ZhenMode = (pol === 'war' || atWar) ? 'sha' : pol === 'diplomacy' ? 'huan' : 'shou';
        if (s.zhenMode !== wantMode) {
          this.setZhenMode(wantMode);
          notes.push(`护宗大阵变阵为「${ZHEN_MODE[wantMode][0]}」`);
        }
        const zmax = ZHEN_MAX[s.halls.zhen] ?? 0;
        const ze = Math.floor(Math.min(s.zhenE ?? 0, zmax));
        const needZ = zmax - ze;
        if (needZ > 0) {
          const canZ = Math.min(needZ, Math.floor(vaultSpare() / ZHEN_COST));
          if (canZ > 0) {
            s.stones -= canZ * ZHEN_COST;
            s.zhenE = ze + canZ;
            notes.push(`护宗大阵充能 +${canZ}`);
          }
        }
      }
      if (g.sectwar && (s.halls.dock ?? 0) >= 1) {
        const sw = g.sectwar;
        const dockLv = s.halls.dock ?? 0;
        let fl = sw.fleetSummary(MY_SECT_ID);
        // 优先抢修受损战船
        for (const tier of [3, 2, 1] as const) {
          const tk = (`t${tier}`) as 't1' | 't2' | 't3';
          if ((fl.damaged[tk] ?? 0) > 0) {
            const sp = AIRSHIP_BUILD_SPEC[tier];
            if (fl.mats < sp.repairMats && vaultSpare() >= 10 * AIRSHIP_MAT_STONE_PRICE + sp.repairStones + 2000) {
              sw.buyWarMats(10);
              fl = sw.fleetSummary(MY_SECT_ID);
            }
            if (fl.mats >= sp.repairMats && vaultSpare() >= sp.repairStones + 1000) {
              const rep = sw.repairAirship(tier);
              if (rep.ok) { notes.push(`抢修${sp.name}`); fl = sw.fleetSummary(MY_SECT_ID); break; }
            }
          }
        }
        // 战船坞空闲船台按阶建造，缺少阵材时从盈余自动采买
        if (fl.building.length < fl.maxSlips) {
          const wantTier: 1 | 2 | 3 | null =
            fl.intact.t1 < (pol === 'war' ? 2 : 1) ? 1
              : dockLv >= 3 && fl.intact.t2 < 1 ? 2
                : dockLv >= 5 && fl.intact.t3 < 1 ? 3
                  : null;
          if (wantTier) {
            const spec = AIRSHIP_BUILD_SPEC[wantTier];
            if (fl.mats < spec.mats) {
              const buyQty = Math.max(10, Math.ceil(spec.mats - fl.mats));
              const buyCost = buyQty * AIRSHIP_MAT_STONE_PRICE;
              if (vaultSpare() >= buyCost + spec.stones + 4000) {
                const bought = sw.buyWarMats(buyQty);
                if (bought.ok) { notes.push(`采买阵材 ${buyQty} 份`); fl = sw.fleetSummary(MY_SECT_ID); }
              }
            }
            if (vaultSpare() >= spec.stones + 4000 && fl.mats >= spec.mats) {
              const res = sw.buildAirship(wantTier);
              if (res.ok) notes.push(`战船坞动工建造${spec.name}`);
            }
          }
        }
      }
      // 上界接引飞升池有空余名额且盈余充裕时，自动接引下界旧部中境界达标的一名骨干飞升
      const pool = this.ascendPoolInfo();
      if (pool.enabled && pool.lv > 0 && pool.rem > 0 && s.ds.length < this.cap()) {
        const cand = this.ascendPoolCandidates().disciples.find((x) => x.ok && vaultSpare() >= x.costNative * this.curScale() * 2);
        if (cand) {
          const r = this.ascendPullDisciple(cand.d.id);
          if (r.ok) notes.push(`灵池接引下界${cand.d.name}飞升`);
        }
      }
    }

    // 7) 自动据点拓展、守备补防/调防、战策阵型、主将委任、战时统筹与同道外交
    if (auto.war && g.sectwar) {
      const sw = g.sectwar;
      const sum = sw.myWarSummary();
      if (sum) {
        const wantDef = pol === 'war' ? 'wave' : pol === 'economy' || pol === 'diplomacy' ? 'hold' : (sum.wars.length ? 'wave' : 'hold');
        if (sw.defNow() !== wantDef) sw.setDefense(wantDef);
        const wantPat = pol === 'war' ? 'arrow' : pol === 'economy' ? 'square' : pol === 'diplomacy' ? 'circle' : 'bagua';
        if (sw.patternNow() !== wantPat) sw.setPattern(wantPat);

        // 为暂无主将的据点委任闲置筑基以上弟子
        const usedCmd = new Set(sum.holds.map((h) => h.commanderId).filter((id): id is number => id !== undefined));
        for (const h of sum.holds) {
          if (h.commanderId !== undefined) continue;
          const cand = s.ds.find((d) => d.id !== master.id && d.realm >= 2 && !usedCmd.has(d.id) && !(s.guard ?? []).includes(d.id));
          if (cand) {
            sw.assignHoldCommander(h.id, cand.id);
            usedCmd.add(cand.id);
            notes.push(`${cand.name}出任${h.name}主将`);
          }
        }
        // 据点尚未满额且可调兵力充裕时，就近派兵进驻周边无主城镇
        if (sum.holdCount < sum.holdMax && sum.free >= 18) {
          const G = LOC_BY_ID.get(MY_SECT_ID);
          if (G) {
            const freeLoc = ALL_LOCATIONS
              .filter((l) => l.map === s.map && (l.type === 'town' || l.type === 'city' || l.type === 'isle') && !sw.S.hold[l.id] && sw.myHoldReachable(l))
              .sort((a, b) => Math.hypot(a.x - G.x, a.y - G.y) - Math.hypot(b.x - G.x, b.y - G.y))[0];
            if (freeLoc && sw.holdPlant(freeLoc.id, Math.min(12, sum.free))) {
              notes.push(`派兵进驻${freeLoc.name}`);
            }
          }
        }
        // 跨据点调防（富裕据点调兵增援薄弱据点）
        const weakHold = sum.holds.find((h) => h.g < 12);
        const richHold = weakHold ? sum.holds.find((h) => h.id !== weakHold.id && h.g >= 24) : undefined;
        if (weakHold && richHold) {
          const tr = sw.transferHoldGarrison(richHold.id, weakHold.id, 5);
          if (tr.ok) notes.push(`从${richHold.name}调防 5 人赴${weakHold.name}`);
        }
        // 为守备偏薄的据点补防 & 在库房宽裕时修筑工事
        for (const h of sum.holds) {
          if (h.g < 15 && sw.myFree() >= 5) {
            if (sw.holdAdd(h.id, 5)) { notes.push(`增防${h.name} +5 人`); break; }
          }
          const fortCost = [450, 900, 1600][h.fortLv] ?? 1600;
          if (h.fortLv < 3 && this.canPay(fortCost) && s.stones > (s.reserve ?? 0) + fortCost) {
            const r = sw.upgradeHoldFort(h.id);
            if (r.ok) { notes.push(`加固${h.name}工事`); break; }
          }
        }
        // 战时若我方前线大营缺少运丹/援军且后方有余力，自动补派一支车队或偏师
        for (const w of sw.S.wars) {
          if (w.fall || (w.a !== MY_SECT_ID && w.b !== MY_SECT_ID)) continue;
          const mySide: 0 | 1 = w.a === MY_SECT_ID ? 0 : 1;
          const active = sw.activeMarches().filter((m) => m.warId === w.id && m.side === mySide);
          if (!active.length && sw.myFree() >= 24) {
            const cmp = mySide === 0 ? w.campA : w.campB;
            const needConvoy = !cmp || cmp.pills < 12;
            const sendN = needConvoy ? Math.min(20, sw.myFree()) : Math.min(Math.max(24, Math.round(sw.myFree() * 0.25)), sw.myFree());
            sw.spawnMarch(w, mySide, needConvoy ? 'convoy' : 'army', { sid: MY_SECT_ID, soldiers: sendN, musterSec: 2.0 });
            notes.push(needConvoy ? `调运补给车队赴前线` : `增派 ${sendN} 人援军赴大营`);
            break;
          }
        }
      }
      // 宗门外交修好（外交方针积极修好，非战时亦温和敦睦同道，降低无谓摩擦）
      if (g.rel && (pol === 'diplomacy' || pol === 'economy' || pol === 'cultivate')) {
        const delta = pol === 'diplomacy' ? 1.5 : 0.4;
        for (const sid of sw.sects(s.map)) {
          if (sid === MY_SECT_ID) continue;
          const sameDao = sw.dao(sid) === s.dao || s.dao === 'zhong';
          if (sameDao && !sw.warOf(sid)) g.rel.addSect(sid, delta);
        }
      }
    }

    // 8) 自动亲卫编组（忠心且已入道的骨干按规模补齐太上随行亲卫，同时掌门可为自己设定贴身护卫）
    if (auto.guard) {
      const gCap = this.guardCap();
      const mgCap = this.masterGuardCap();
      // 太上亲卫与掌门护卫统筹编配：先保底太上亲卫至少 1 人，再为掌门配齐贴身护卫保底名额，余下名额再补满太上亲卫与掌门护卫
      const holdCmds = new Set(
        Object.values(g.sectwar?.S.hold ?? {})
          .filter((h) => h.o === MY_SECT_ID && h.commanderId !== undefined)
          .map((h) => h.commanderId!),
      );
      s.guard ??= [];
      s.masterGuard ??= [];
      const masterSet = new Set(s.masterGuard.filter((id) => id !== master.id && s.ds.some((d) => d.id === id)));
      const curSet = new Set(s.guard.filter((id) => id !== master.id && !masterSet.has(id) && s.ds.some((d) => d.id === id)));
      const atWar = !!g.sectwar?.S.wars.some((w) => !w.fall && (w.a === MY_SECT_ID || w.b === MY_SECT_ID));
      const wantMg = (pol === 'war' || atWar) ? mgCap : Math.max(1, Math.ceil(mgCap * 0.5));
      const availCands = s.ds
        .filter((d) => d.id !== master.id && d.realm >= 1 && d.loyal >= 60 && !curSet.has(d.id) && !masterSet.has(d.id) && !holdCmds.has(d.id))
        .sort((a, b) => b.realm - a.realm || b.stage - a.stage || b.loyal - a.loyal);

      let added = 0;
      let mgAdded = 0;
      const pickNext = (minLoyal: number) => {
        const idx = availCands.findIndex((d) => d.loyal >= minLoyal);
        return idx >= 0 ? availCands.splice(idx, 1)[0] : undefined;
      };
      // 第一阶段：各保底 1 名（太上优先）
      if (curSet.size < 1 && curSet.size < gCap) {
        const d = pickNext(60);
        if (d) { curSet.add(d.id); added++; }
      }
      if (masterSet.size < 1 && masterSet.size < wantMg) {
        const d = pickNext(65);
        if (d) { masterSet.add(d.id); mgAdded++; }
      }
      // 第二阶段：补齐太上亲卫，再补齐掌门护卫
      while (curSet.size < gCap) {
        const d = pickNext(60);
        if (!d) break;
        curSet.add(d.id);
        added++;
      }
      while (masterSet.size < wantMg) {
        const d = pickNext(65);
        if (!d) break;
        masterSet.add(d.id);
        mgAdded++;
      }
      s.guard = [...curSet];
      s.masterGuard = [...masterSet];
      if (added > 0) notes.push(`补编太上亲卫 ${added} 名`);
      if (mgAdded > 0) notes.push(`编组掌门护卫 ${mgAdded} 名`);
    }

    if (notes.length) {
      this.log(`掌门${master.name}依「${SECT_POLICY_INFO[pol].name}」施政：${notes.join('、')}。`, day);
    }
  }
  /** 收下一位求拜者 */
  takeApplicant(a: Applicant, quiet = false) { return this.accept(a, quiet); }
  /** 批量收录：'all' 尽数收下 · 'root3' 只收三灵根以上（带艺投师的散修照收）；门墙满了的仍留在名单上 */
  takeAll(mode: 'all' | 'root3') {
    const s = this.s!, keep: Applicant[] = [];
    for (const a of s.apps.slice()) {
      if (mode === 'root3' && !(a.root >= 3 || a.realm >= 2)) { keep.push(a); continue; }
      if (!this.accept(a, true)) keep.push(a);
    }
    s.apps = keep;
    this.game.updateUI(true);
  }
  /** 一概婉拒 */
  rejectAll() { const s = this.s!; s.apps = []; this.game.updateUI(true); }
  /** 可发布到藏经阁的法术 */
  publishableArts() { return this.publishable(); }
  /** 发布一门法术到藏经阁 */
  publishArt(id: string): boolean {
    const s = this.s!;
    if (s.lib.includes(id) || s.lib.length >= this.libCap()) return false;
    const a = ARTS[id]; if (!a) return false;
    s.lib.push(id); s.fame += [1, 2, 5, 12, 30][a.tier] ?? 1;
    this.log(`宗主将《${a.name}》录入藏经阁，门人争相参悟。`);
    if (a.tier >= 3) this.game.toast(`《${a.name}》入藏经阁，${s.name}威望上涨。`, 'good');
    this.game.updateUI(true); return true;
  }
  /** 立镇派心法（门人修炼速度 ×gf.rate） */
  setGf(id: string): boolean {
    const s = this.s!, gf = GONGFA[id];
    if (!gf || s.gf === id) return false;
    s.gf = id; s.fame += 5 + (gf.tier ?? 1) * 4;
    this.log(`宗主传下《${gf.name}》，定为镇派心法。`);
    this.game.updateUI(true); return true;
  }
  /** 扩建一座殿宇 */
  buildHall(k: keyof MySect['halls']): boolean {
    const s = this.s!, lv = s.halls[k] ?? 0;
    if (k === 'chi' && this.sectWorld() === 'human') return false;
    if (lv >= 5) return false;
    const cost = HALL_COST[lv];
    if (!this.pay(cost)) return false;
    s.halls[k] = lv + 1;
    if (k === 'zhen') s.zhenE = ZHEN_MAX[s.halls.zhen];
    s.fame += 4 + lv * 4;
    const rowName = k === 'chi' ? (this.sectWorld() === 'immortal' ? '化仙飞升池' : '化灵接引池') : (HALLS.find((h) => h.k === k)?.name ?? '殿宇');
    this.log(`${rowName}扩建至 ${lv + 1} 级。`);
    this.game.updateUI(true); return true;
  }

  // ------------------------------------------------------------ 化灵接引池 / 化仙飞升池（跨界迁籍）
  ascendPoolInfo() {
    const s = this.s, w = this.sectWorld();
    const lowerWorld: WorldId | null = w === 'immortal' ? 'spirit' : w === 'spirit' ? 'human' : null;
    if (!s || !lowerWorld) {
      return { enabled: false, world: w, lowerWorld: null as WorldId | null, name: '接引飞升池', lv: 0, minRealm: 99, monthlyCap: 0, used: 0, rem: 0, targetRealm: 5 };
    }
    const lv = s.halls.chi ?? 0;
    const m = Math.floor(this.game.day / 30);
    const used = s.chiMonth === m ? (s.chiUsed ?? 0) : 0;
    const monthlyCap = lv * 2;
    const minRealm = lv <= 0 ? 99 : w === 'spirit' ? [99, 4, 3, 3, 2, 1][lv] : [99, 8, 7, 6, 5, 4][lv];
    return {
      enabled: true,
      world: w,
      lowerWorld,
      name: w === 'immortal' ? '化仙飞升池' : '化灵接引池',
      lv,
      minRealm,
      monthlyCap,
      used,
      rem: Math.max(0, monthlyCap - used),
      targetRealm: w === 'immortal' ? 9 : 5,
    };
  }

  private ascendPullCost(candRealm: number, poolLv: number, targetRealm: number): number {
    const gap = Math.max(0, targetRealm - candRealm);
    return Math.max(4, gap * 6 + Math.max(1, 6 - poolLv) * 3) * this.curScale();
  }

  ascendPoolCandidates() {
    const info = this.ascendPoolInfo();
    if (!info.enabled || !info.lowerWorld) {
      return { disciples: [] as { d: Disciple; ok: boolean; why: string; costNative: number }[], npcs: [] as { n: NpcData; ok: boolean; why: string; costNative: number }[], deadNpcs: [] as NpcData[] };
    }
    const g = this.game, lowerWorld = info.lowerWorld, sc = this.curScale(), bal = this.balance().total;
    const lowerSect = g.ws.worlds?.[lowerWorld]?.mySect;
    const disciples = (lowerSect?.ds ?? []).slice().sort((a, b) => b.realm - a.realm || b.root - a.root).map((d) => {
      const cost = this.ascendPullCost(d.realm, info.lv, info.targetRealm);
      const costNative = Math.max(1, Math.ceil(cost / sc));
      let why = '';
      if (info.lv <= 0) why = `尚未兴建${info.name}`;
      else if (info.rem <= 0) why = '本月接引名额已尽';
      else if (d.realm < info.minRealm) why = `境界不足（需${REALMS[info.minRealm]?.name ?? ''}）`;
      else if (this.s!.ds.length >= this.cap()) why = '本宗核心名册已满';
      else if (bal < cost) why = `${this.curName()}不足 ${costNative}`;
      return { d, ok: !why, why, costNative };
    });
    const relNpcs = g.npcs.list.filter((n) => worldOfMap(npcMap(n)) === lowerWorld && (n.met || n.bond || n.favor >= 20 || n.canon));
    const npcs = relNpcs.filter((n) => n.alive).sort((a, b) => (b.bond ? 1 : 0) - (a.bond ? 1 : 0) || b.realm - a.realm || b.favor - a.favor).map((n) => {
      const cost = this.ascendPullCost(n.realm, info.lv, info.targetRealm);
      const costNative = Math.max(1, Math.ceil(cost / sc));
      let why = '';
      if (info.lv <= 0) why = `尚未兴建${info.name}`;
      else if (info.rem <= 0) why = '本月接引名额已尽';
      else if (n.realm < info.minRealm) why = `境界不足（需${REALMS[info.minRealm]?.name ?? ''}）`;
      else if (bal < cost) why = `${this.curName()}不足 ${costNative}`;
      return { n, ok: !why, why, costNative };
    });
    const deadNpcs = relNpcs.filter((n) => !n.alive);
    return { disciples, npcs, deadNpcs };
  }

  ascendPullDisciple(discipleId: number): { ok: boolean; msg: string } {
    const info = this.ascendPoolInfo();
    if (!info.enabled || !info.lowerWorld || !this.s) return { ok: false, msg: '须在上界建宗并筑池后方可接引。' };
    const s = this.s, g = this.game, lowerSect = g.ws.worlds?.[info.lowerWorld]?.mySect;
    if (!lowerSect) return { ok: false, msg: '下界未有旧山门可引。' };
    const idx = lowerSect.ds.findIndex((x) => x.id === discipleId);
    if (idx < 0) return { ok: false, msg: '下界名册中已无此人（或已坐化）。' };
    const d = lowerSect.ds[idx];
    const cost = this.ascendPullCost(d.realm, info.lv, info.targetRealm);
    const costNative = Math.max(1, Math.ceil(cost / this.curScale()));
    if (info.lv <= 0) return { ok: false, msg: `请先在宗门建设中兴建${info.name}。` };
    if (info.rem <= 0) return { ok: false, msg: '本月接引名额已用尽，待下月灵池恢复再引。' };
    if (d.realm < info.minRealm) return { ok: false, msg: `${d.name}境界不足，当前灵池仅能接引${REALMS[info.minRealm]?.name ?? ''}以上修士。` };
    if (s.ds.length >= this.cap()) return { ok: false, msg: '本宗核心名册已满，请先扩建聚灵大阵。' };
    if (!this.pay(cost)) return { ok: false, msg: `${this.curName()}不足 ${costNative}。` };

    lowerSect.ds.splice(idx, 1);
    lowerSect.guard = (lowerSect.guard ?? []).filter((id) => id !== discipleId);
    lowerSect.masterGuard = (lowerSect.masterGuard ?? []).filter((id) => id !== discipleId);
    if (lowerSect.masterId === discipleId) {
      lowerSect.masterId = undefined;
      lowerSect.masterGuard = [];
      appointRegentOnAscend(lowerSect, g.day);
    }
    this.log(`${d.name}受${info.name}接引飞升上界，山门另委新主。`, g.day, lowerSect);

    const newRealm = Math.max(d.realm, info.targetRealm);
    const newLife = REALMS[newRealm]?.life ?? 2000;
    const migrated: Disciple = {
      ...d,
      id: s.seq++,
      realm: newRealm,
      stage: d.realm >= info.targetRealm ? d.stage : 0,
      exp: 0,
      age: Math.min(d.age, Math.round(newLife * 0.25)),
      loyal: Math.min(100, d.loyal + 12),
      rank: Math.max(d.rank, 2),
      job: 'xiu',
      bt: 0,
    };
    s.ds.push(migrated);
    const m = Math.floor(g.day / 30);
    s.chiMonth = m; s.chiUsed = (s.chiMonth === m ? (s.chiUsed ?? 0) : 0) + 1;
    s.fame += 30;
    this.log(`${info.name}灵光大放，将下界弟子${migrated.name}接引洗髓入本宗，证道${realmName(migrated.realm, migrated.stage)}！`);
    g.toast(`${migrated.name}经${info.name}接引飞升，已入${s.name}门墙！`, 'good');
    g.updateUI(true);
    return { ok: true, msg: `${migrated.name}已跨界飞升并洗髓晋入${realmName(migrated.realm, migrated.stage)}` };
  }

  ascendPullNpc(npcId: string): { ok: boolean; msg: string } {
    const info = this.ascendPoolInfo();
    if (!info.enabled || !info.lowerWorld || !this.s) return { ok: false, msg: '须在上界建宗并筑池后方可接引。' };
    const s = this.s, g = this.game, n = g.npcs.list.find((x) => x.id === npcId);
    if (!n) return { ok: false, msg: '未寻得此人气息。' };
    if (!n.alive) return { ok: false, msg: `${n.name}已然坐化辞世，灵池亦难逆转生死轮回。` };
    if (worldOfMap(npcMap(n)) !== info.lowerWorld) return { ok: false, msg: `${n.name}已不在此下界。` };
    const cost = this.ascendPullCost(n.realm, info.lv, info.targetRealm);
    const costNative = Math.max(1, Math.ceil(cost / this.curScale()));
    if (info.lv <= 0) return { ok: false, msg: `请先在宗门建设中兴建${info.name}。` };
    if (info.rem <= 0) return { ok: false, msg: '本月接引名额已用尽，待下月灵池恢复再引。' };
    if (n.realm < info.minRealm) return { ok: false, msg: `${n.name}境界不足，当前灵池仅能接引${REALMS[info.minRealm]?.name ?? ''}以上修士。` };
    if (!this.pay(cost)) return { ok: false, msg: `${this.curName()}不足 ${costNative}。` };

    n.map = s.map;
    n.home = MY_SECT_ID;
    n.x = s.x * WORLD_SCALE + (Math.random() - 0.5) * 400;
    n.y = s.y * WORLD_SCALE + (Math.random() - 0.5) * 400;
    n.originWorld ??= info.lowerWorld;
    n.realm = Math.max(n.realm, info.targetRealm);
    n.stage = n.realm > info.targetRealm ? n.stage : 0;
    n.life = REALMS[n.realm]?.life ?? 2000;
    n.age = Math.min(n.age, Math.round(n.life * 0.25));
    n.favor = Math.min(100, n.favor + 15);
    n.met = true;
    const m = Math.floor(g.day / 30);
    s.chiMonth = m; s.chiUsed = (s.chiMonth === m ? (s.chiUsed ?? 0) : 0) + 1;
    s.fame += 25;
    this.log(`${info.name}光柱贯界，将下界故人${n.name}接引洗髓至${s.name}山门，晋入${realmName(n.realm, n.stage)}！`);
    g.toast(`故人${n.name}跨界飞升成功，已安置于${s.name}！`, 'good');
    g.updateUI(true);
    return { ok: true, msg: `${n.name}已跨界飞升至${s.name}，洗髓晋入${realmName(n.realm, n.stage)}` };
  }
  /** 注入灵石充能护宗大阵，返回充上的阵力 */
  chargeZhen(): number {
    const s = this.s!, mx = this.zhenMax();
    if (mx <= 0) return 0;
    const e = Math.floor(Math.min(s.zhenE ?? 0, mx)), need = mx - e;
    if (need <= 0) return 0;
    const can = Math.min(need, Math.floor(this.balance().total / ZHEN_COST));
    if (can <= 0 || !this.pay(can * ZHEN_COST)) return 0;
    s.zhenE = e + can; this.game.updateUI(true);
    return can;
  }
  /** 变阵 */
  setZhenMode(m: ZhenMode) { const s = this.s!; if (s.zhenMode === m) return; s.zhenMode = m; this.log(`护宗大阵变阵为「${ZHEN_MODE[m][0]}」。`); this.game.updateUI(true); }
  /** 自动充能开关（每月自库房补一成阵力，只动保底线之上的灵石） */
  toggleZhenAuto() { const s = this.s!; s.zhenAuto = s.zhenAuto === false; this.game.updateUI(true); }
  /** 太上随行亲卫：点最强 n 人 · 'half' 只带一半 · 'clear' 尽数遣散 */
  guardSet(mode: number | 'half' | 'clear') {
    const s = this.s!;
    if (mode === 'clear') { s.guard = []; this.game.updateUI(true); return; }
    const cap = this.guardCap(), n = mode === 'half' ? Math.ceil(cap / 2) : Math.max(0, Math.floor(mode));
    const mg = new Set(s.masterGuard ?? []);
    s.guard = s.ds.filter((d) => d.realm >= 1 && d.id !== s.masterId && !mg.has(d.id))
      .sort((a, b) => b.realm - a.realm || b.stage - a.stage || b.loyal - a.loyal)
      .slice(0, Math.min(cap, n)).map((d) => d.id);
    this.game.updateUI(true);
  }
  /** 现任掌门护卫：点最强 n 人 · 'half' 只带一半 · 'clear' 尽数遣散 */
  masterGuardSet(mode: number | 'half' | 'clear') {
    const s = this.s!;
    if (mode === 'clear' || s.masterId === undefined) { s.masterGuard = []; this.game.updateUI(true); return; }
    const cap = this.masterGuardCap(), n = mode === 'half' ? Math.ceil(cap / 2) : Math.max(0, Math.floor(mode));
    const lg = new Set(s.guard ?? []);
    s.masterGuard = s.ds.filter((d) => d.realm >= 1 && d.id !== s.masterId && !lg.has(d.id))
      .sort((a, b) => b.realm - a.realm || b.stage - a.stage || b.loyal - a.loyal)
      .slice(0, Math.min(cap, n)).map((d) => d.id);
    this.game.updateUI(true);
  }
  /** 逐人点选 / 撤下太上亲卫或掌门护卫（两者互不重叠，掌门本人不可兼任护卫） */
  toggleGuardMember(discipleId: number, which: 'lord' | 'master'): { ok: boolean; msg: string } {
    const s = this.s;
    if (!s) return { ok: false, msg: '尚未开宗立派' };
    const d = s.ds.find((x) => x.id === discipleId);
    if (!d) return { ok: false, msg: '此人已不在名册' };
    if (d.realm < 1) return { ok: false, msg: `${d.name}尚未入道（须炼气以上方能充任护卫）` };
    if (d.id === s.masterId) return { ok: false, msg: `${d.name}贵为现任掌门，不便充任贴身护卫` };
    if (which === 'master' && s.masterId === undefined) return { ok: false, msg: '尚未委任掌门，暂无掌门护卫编制' };

    s.guard ??= [];
    s.masterGuard ??= [];
    const targetList = which === 'lord' ? s.guard : s.masterGuard;
    const otherList = which === 'lord' ? s.masterGuard : s.guard;
    const label = which === 'lord' ? '太上随行亲卫' : '掌门贴身护卫';
    const otherLabel = which === 'lord' ? '掌门护卫' : '太上亲卫';
    const cap = which === 'lord' ? this.guardCap() : this.masterGuardCap();

    if (targetList.includes(d.id)) {
      const next = targetList.filter((id) => id !== d.id);
      if (which === 'lord') s.guard = next; else s.masterGuard = next;
      this.game.updateUI(true);
      return { ok: true, msg: `已将${d.name}撤出${label}` };
    }
    if (targetList.length >= cap) {
      return { ok: false, msg: `${label}已达上限（${cap} 人），请先撤换一人` };
    }
    const moved = otherList.includes(d.id);
    if (moved) {
      const nextOther = otherList.filter((id) => id !== d.id);
      if (which === 'lord') s.masterGuard = nextOther; else s.guard = nextOther;
    }
    targetList.push(d.id);
    this.game.updateUI(true);
    return { ok: true, msg: `已指派${d.name}出任${label}${moved ? `（已从${otherLabel}转调）` : ''}` };
  }
  /** 拨灵石/灵晶入库房（参数为库房账面灵石额度） */
  deposit(n: number): number {
    const s = this.s!, h = this.game.hero, sc = this.curScale(), cId = this.curId();
    const want = sc <= 1 ? Math.floor(n) : Math.max(1, Math.round(n / sc));
    const v = Math.min(want, C.bagCount(h, cId));
    if (v <= 0) return 0;
    C.removeItem(h, cId, v); s.stones += v * sc; this.game.updateUI(true);
    return v * sc;
  }
  /** 从库房支取灵石/灵晶 */
  withdraw(n: number): number {
    const s = this.s!, h = this.game.hero, sc = this.curScale(), cId = this.curId();
    const units = Math.min(Math.floor(n / sc), Math.floor(s.stones / sc));
    if (units <= 0) return 0;
    s.stones -= units * sc; C.addItem(h, cId, units); this.game.updateUI(true);
    return units * sc;
  }
  /** 宗主抽成：10% → 20% → … → 50% → 10% */
  cycleCut() { const s = this.s!, c = s.cut ?? 0.3; s.cut = CUT_STEPS[(CUT_STEPS.indexOf(c) + 1) % CUT_STEPS.length]; this.game.updateUI(true); return s.cut; }
  /** 库房保底线：0 → 5 千 → 2 万 → 10 万 → 50 万 → 200 万 → 0 */
  cycleReserve() { const s = this.s!, r = s.reserve ?? 0; s.reserve = RESERVE_STEPS[(RESERVE_STEPS.indexOf(r) + 1) % RESERVE_STEPS.length]; this.game.updateUI(true); return s.reserve; }
  /** 冲关用度：每月至多动用库房盈余的几成 */
  cycleRate() { const s = this.s!, r = s.btRate ?? 0.05; s.btRate = RATE_STEPS[(RATE_STEPS.indexOf(r) + 1) % RATE_STEPS.length]; this.game.updateUI(true); return s.btRate; }
  /** 冲关资格：人人可冲 / 三灵根或内门以上 / 双灵根或真传以上 / 天灵根或核心弟子以上 */
  cycleRule() { const s = this.s!; s.btRule = ((s.btRule ?? 1) + 1) % BT_RULE.length; this.game.updateUI(true); return s.btRule; }
  /** 山门开闭 */
  toggleOpen() { const s = this.s!; s.open = !s.open; this.game.updateUI(true); }
  /** 收徒门槛：伪灵根 → 四灵根 → 三灵根 → 双灵根 → 伪灵根 */
  cycleMinRoot() { const s = this.s!; s.minRoot = s.minRoot % 4 + 1; this.game.updateUI(true); return s.minRoot; }
  /** 求拜者：执事径直收录 / 宗主亲自过目 */
  toggleAuto() { const s = this.s!; s.auto = !s.auto; this.game.updateUI(true); }
  /** 显式设定（面板上的分段按钮用） */
  setOpen(v: boolean) { const s = this.s!; s.open = v; this.game.updateUI(true); }
  setMinRoot(k: number) { const s = this.s!; s.minRoot = Math.max(1, Math.min(5, Math.round(k))); this.game.updateUI(true); }
  setAuto(v: boolean) { const s = this.s!; s.auto = v; this.game.updateUI(true); }
  /** 收徒速率：山门开着时每月大约来几人（与 month() 里同一套公式） */
  recruitRate() {
    const s = this.s;
    if (!s || !s.open) return { perMonth: 0, perYear: 0 };
    const pubs = (this.game.ws.myArts ?? []).filter((m) => m.pub).length;
    const lam = Math.min(3, 0.3 + s.fame / 400 + s.lib.length * 0.03 + pubs * 0.25);
    return { perMonth: lam, perYear: lam * 12 };
  }
  /** 自创功法的名录 */
  myArts(): MyArt[] { return this.game.ws.myArts ?? []; }
  /** 刊行一门自创功法于天下（刻印玉简、分送坊市，须花灵石） */
  publishMyArt(m: MyArt): boolean {
    const s = this.s;
    if (!s || m.pub) return false;
    const cost = [500, 800, 3000, 12000, 40000][m.def.tier] ?? 800;
    if (!this.pay(cost)) return false;
    this.publishWorld(m);
    this.game.updateUI(true);
    return true;
  }
  /** 打开「自创功法 / 刊行天下」（三步向导仍在对话树里，含闭关三十日的推演） */
  openArtsNode(): DNode | null { return this.s ? this.myArtsNode() : null; }

  // ------------------------------------------------------------ 对话面板
  // v0.71：原先那棵十二页的对话树（求拜 / 名册 / 差事 / 藏经阁 / 建设 / 库房 / 规矩 / 大事记 / 亲卫）
  // 已整体并入「宗主大殿」面板；对话只留面板装不下的入口，免得同一件事有两套界面。
  /** 总入口：没有宗门 → 立派；有 → 一句现状 + 打开宗主大殿 */
  node(): DNode {
    const s = this.s, g = this.game;
    if (!s) return this.foundNode();
    this.daily(0);
    const zmax = this.zhenMax();
    const lines = [
      `${s.name}：${SCALE_NAME[this.scale()]} · ${DAO_NAME[s.dao]} · ${fameTitle(s.fame)}（威望 ${Math.floor(s.fame)}）`,
      `门人 ${s.ds.length}/${this.cap()}　库房灵石 ${Math.floor(s.stones)}　待领供奉 ${Math.floor(s.tribute)}${s.apps.length ? `　山门求拜者 ${s.apps.length} 人` : ''}`,
      zmax ? `护宗大阵「${ZHEN_MODE[s.zhenMode ?? 'shou'][0]}」阵力 ${Math.floor(s.zhenE ?? 0)}/${zmax}` : '尚未布下护宗大阵',
      '门人、收徒、藏经阁、建设、库房、亲卫、规矩与大事记都在宗主大殿里，这里只留有事的几件。',
    ];
    const o: DOpt[] = [];
    const qr = this.qiRatio();
    if (qr >= 0.1) o.push({ label: `汲取宗门气运（约本层修为 +${Math.round(qr * C.INSIGHT * 100)}%）`, tone: 'gold', act: () => { this.claimQi(); return this.node(); } });
    if (s.tribute >= 1 || s.gifts.length) o.push({ label: `收取供奉 ${Math.floor(s.tribute)} 灵石${s.gifts.length ? ` · 门人献礼 ${s.gifts.reduce((a, b) => a + b.n, 0)} 件` : ''}`, tone: 'gold', act: () => { this.collect(); return this.node(); } });
    o.push({ label: '打开宗主大殿（宗门面板）', tone: 'good', act: () => { g.openModal({ kind: 'sect' }); return null; } });
    if (g.sectwar) o.push({ label: '宗门战事（调兵 · 宣战 · 求和）', tone: 'bad', act: () => g.sectwar.myNode() });
    o.push({ label: '护宗大阵（充能 · 变阵 · 扩建）', act: () => this.zhenNode() });
    o.push({ label: '宗门制式服制（定门袍 · 自换装）', act: () => this.uniformNode() });
    o.push({ label: '自创功法 / 刊行天下', act: () => this.myArtsNode() });
    o.push({ label: '离开', act: () => null });
    return { speaker: s.name, title: '宗主', text: lines.join('\n'), options: o, mood: 'mystic' };
  }
  // ---------- 藏经阁：发布功法 ----------
  private publishable(): ArtSkill[] {
    const s = this.s!, h = this.game.hero;
    return h.arts.map((a) => ARTS[a.id]).filter((a) => a && !s.lib.includes(a.id) && a.cast !== 'sense' && a.cast !== 'custom' && a.school !== '神' && a.id !== 'qijin')
      .sort((a, b) => b.tier - a.tier || a.school.localeCompare(b.school));
  }
  // ---------- 自创功法 ----------
  myArtCap() { const h = this.game.hero; return h.realm < 4 ? 0 : 1 + h.stage + (h.realm - 4) * 3; }
  private bases(): ArtSkill[] {
    const h = this.game.hero, mine = new Set((this.game.ws.myArts ?? []).map((m) => m.def.id));
    return h.arts.filter((a) => { const s = ARTS[a.id]; return s && !mine.has(s.id) && s.school !== '神' && s.cast !== 'sense' && s.cast !== 'custom' && !s.needs && profLevel(s.tier, a.xp) >= 2; })
      .map((a) => ARTS[a.id]).sort((a, b) => b.tier - a.tier);
  }
  private myArtsNode(): DNode {
    const s = this.s!, g = this.game, list = g.ws.myArts ?? [], cap = this.myArtCap();
    const o: DOpt[] = [];
    o.push({ label: `自创一门新功法（${list.length}/${cap}）`, tone: 'gold', disabled: list.length >= cap || !this.bases().length, hint: list.length >= cap ? '境界所限：元婴初期一门，每进一小阶多一门' : !this.bases().length ? '须先把一门法术练到「大成」' : '闭关三十日', act: () => this.createNode(0) });
    for (const m of list) {
      const a = m.def, cost = [500, 800, 3000, 12000, 40000][a.tier];
      if (m.pub) o.push({ label: `《${a.name}》已刊行天下（第 ${Math.floor(m.pub / 360) + 1} 年）`, disabled: true });
      else o.push({ label: `刊行《${a.name}》于天下（${cost} 灵石）`, disabled: !this.canPay(cost), hint: '刻印玉简、分送各大坊市：此后坊市、洞府、他人储物袋里都可能见到它', act: () => { if (this.pay(cost)) this.publishWorld(m); return this.myArtsNode(); } });
    }
    o.push({ label: '返回', act: () => this.node() });
    const text = list.length
      ? list.map((m) => `《${m.def.name}》${TIER_NAME[m.def.tier]} · ${SCHOOL_NAME[m.def.school]}　脱胎于《${ARTS[m.base]?.name ?? '？'}》${m.mix ? `，融《${ARTS[m.mix]?.name ?? '？'}》` : ''}${m.pub ? '　【已刊行天下】' : ''}`).join('\n')
      : '你尚未自创过功法。';
    return { speaker: `${s.name} · 传功殿`, title: '自创功法', text: `元婴修士于所学融会贯通，可自创功法、开一脉之先。\n以一门练到「大成」的法术为根基，可再融入另一门的意境（承其异状、染其灵光）：新术威力约高两成、运转快一成、品阶升一阶。\n刊行天下之后，这门功法便流入世间；你的名字随它传开，来投的好苗子更多。\n\n${text}`, options: o, mood: 'mystic' };
  }
  private createNode(page: number, base?: ArtSkill, mix?: ArtSkill | null, names?: string[]): DNode {
    const all = this.bases(), per = 7;
    const title = '自创功法';
    if (!base) {
      const pages = Math.max(1, Math.ceil(all.length / per)), p = clamp(page, 0, pages - 1);
      const o: DOpt[] = all.slice(p * per, p * per + per).map((a) => ({ label: `以《${a.name}》为根基　${TIER_NAME[a.tier]} · ${SCHOOL_NAME[a.school]}`, act: () => this.createNode(0, a) }));
      if (p < pages - 1) o.push({ label: `下一页（${p + 2}/${pages}）`, act: () => this.createNode(p + 1) });
      if (p > 0) o.push({ label: `上一页（${p}/${pages}）`, act: () => this.createNode(p - 1) });
      o.push({ label: '返回', act: () => this.myArtsNode() });
      return { speaker: '闭关静室', title, text: '第一步：选一门已练到「大成」以上的法术作根基。新功法的出手方式、形态都由它而来。', options: o };
    }
    if (mix === undefined) {
      const others = all.filter((a) => a.id !== base.id && a.school !== base.school), pages = Math.max(1, Math.ceil(others.length / per)), p = clamp(page, 0, pages - 1);
      const o: DOpt[] = [{ label: '不融他法，一脉单传', act: () => this.createNode(0, base, null) }];
      for (const a of others.slice(p * per, p * per + per)) o.push({ label: `融入《${a.name}》之意　${SCHOOL_NAME[a.school]}${a.status ? ' · 承其异状' : ''}`, act: () => this.createNode(0, base, a) });
      if (p < pages - 1) o.push({ label: `下一页（${p + 2}/${pages}）`, act: () => this.createNode(p + 1, base) });
      o.push({ label: '返回', act: () => this.createNode(0) });
      return { speaker: '闭关静室', title, text: `根基：《${base.name}》。\n\n第二步：可再融入另一系的一门大成法术——新术承它的异状（燃烧、冰冻、麻痹……）、灵光也染上它的颜色，威力再添几分。`, options: o };
    }
    const sectA = (this.s?.name ?? '').slice(0, 2);
    const ns = names ?? (() => { const out: string[] = []; for (let i = 0; i < 30 && out.length < 4; i++) { const n = (i % 3 === 0 && sectA ? sectA : pick(ART_A[base.school] ?? ['混元'])) + pick(ART_B[base.cast] ?? ['诀']); if (!out.includes(n) && !Object.values(ARTS).some((a) => a.name === n)) out.push(n); } return out; })();
    const o: DOpt[] = ns.map((n) => ({ label: `定名《${n}》，闭关三十日`, tone: 'gold' as const, act: () => { this.makeArt(base, mix, n); return this.myArtsNode(); } }));
    o.push({ label: '换一批名字', act: () => this.createNode(0, base, mix) });
    o.push({ label: '返回', act: () => this.createNode(0, base) });
    return { speaker: '闭关静室', title, text: `根基：《${base.name}》${mix ? `　融：《${mix.name}》` : ''}\n\n第三步：给它起个名字。功成之后你自然会用，也可录入藏经阁、刊行天下。`, options: o, mood: 'mystic' };
  }
  private makeArt(base: ArtSkill, mix: ArtSkill | null, name: string) {
    const g = this.game, h = g.hero, s = this.s!;
    const list = (g.ws.myArts ??= []);
    if (list.length >= this.myArtCap()) return;
    let n = 1; while (ARTS['my' + n] || list.some((m) => m.def.id === 'my' + n)) n++;
    const blend = (a: string, b: string) => { const x = a.split(',').map(Number), y = b.split(',').map(Number); return x.map((v, i) => Math.round(v * 0.6 + (y[i] ?? v) * 0.4)).join(','); };
    const st = mix?.status ?? base.status;
    const def: ArtSkill = {
      ...base, id: 'my' + n, name, tier: Math.min(4, base.tier + 1) as ArtSkill['tier'], realm: Math.min(base.realm, h.realm),
      power: base.power > 0 ? Math.round(base.power * (1.18 + (mix ? 0.07 : 0)) * 100) / 100 : 0, cd: Math.round(base.cd * 0.9 * 100) / 100,
      status: st ? { ...st, ch: Math.min(1, st.ch + 0.1) } : undefined, color: mix ? blend(base.color, mix.color) : base.color,
      desc: `苏寒自创。脱胎于《${base.name}》${mix ? `，融《${mix.name}》之意` : ''}：威力更胜原术，运转更快。`, evo: base.evo,
    };
    delete (def as any).needs;
    list.push({ def, base: base.id, mix: mix?.id, day: g.day });
    registerMyArts(g.ws);
    h.arts.push({ id: def.id, xp: 0 });
    const slot = h.hotbar.findIndex((x) => !x); if (slot >= 0) h.hotbar[slot] = def.id;
    g.passDays(30);
    s.fame += 15;
    this.log(`宗主闭关三十日，自创《${name}》。`);
    g.news(`${s.name}宗主苏寒自创功法《${name}》。`, 'personal');
    g.toast(`功成！自创《${name}》${slot >= 0 ? `（已放入快捷栏 ${slot + 1}）` : '（按 K 打开法术书放入快捷栏）'}`, 'good');
    const p = g.player; sealFx('mana', 'gold', p.x, p.y - 30, 2.6, { dur: 1 }); sealFx('rune', 'gold', p.x, p.y + 10, 2.2, { dur: 3, loop: true });
    g.updateUI(true);
  }
  private publishWorld(m: MyArt) {
    const g = this.game, s = this.s!;
    m.pub = g.day;
    registerMyArts(g.ws);
    s.fame += 40;
    this.log(`《${m.def.name}》刻印成简，刊行天下。`);
    g.news(`${s.name}宗主所创《${m.def.name}》刊行天下，各地坊市渐有玉简流传。`, 'personal');
    g.toast(`《${m.def.name}》刊行天下，${s.name}威望大涨。`, 'good');
  }
  // ---------- 讲法、建设、库房、规矩、大事记 ----------
  teach() {
    const s = this.s!, g = this.game, h = g.hero;
    g.passDays(3); s.lastTeach = g.day;
    for (const d of s.ds) { d.exp += Math.max(0.05, this.gain(d) * 4); this.addLoyal(d, 6, '开坛讲法', g.day); if (d.exp >= 1) { this.openBudget(); this.advance(d, g.day); } }
    const msgs: C.Msg[] = []; C.gainExp(h, C.need(h) * C.INSIGHT * 0.2, msgs);
    s.fame += 1 + s.ds.length * 0.01;
    this.log('宗主开坛讲法三日，门人获益良多。');
    g.toast('开坛讲法三日：教学相长，自己也有所悟。', 'good');
    const p = g.player; sealFx('rune', s.dao === 'mo' ? 'blood' : 'gold', p.x, p.y + 10, 2.6, { dur: 3, loop: true });
    g.updateUI(true);
  }
  /** 收下供奉与门人献礼（面板与对话树共用；返回收下的货币与礼物件数） */
  collect(): { stones: number; gifts: number } {
    const s = this.s!, g = this.game, h = g.hero;
    if (!s) return { stones: 0, gifts: 0 };
    s.gifts ??= [];
    const sc = this.curScale(), cId = this.curId(), cName = this.curName();
    const units = Math.floor(s.tribute / sc), gc = s.gifts.reduce((a, b) => a + b.n, 0);
    if (units >= 1) { C.addItem(h, cId, units); s.tribute -= units * sc; }
    if (s.gifts.length) { for (const it of s.gifts) C.addItem(h, it.id, it.n); g.toast(`收下：${units >= 1 ? `供奉${cName} ${units}、` : ''}${s.gifts.map((it) => `${itemDef(it.id).name}×${it.n}`).join('、')}`, 'good'); s.gifts = []; }
    else if (units >= 1) g.toast(`收下供奉${cName} ${units}。`, 'good');
    g.updateUI(true);
    return { stones: units, gifts: gc };
  }
  /** 汲取宗门气运：门人修行反哺宗主 */
  claimQi() {
    const s = this.s!, g = this.game, h = g.hero, k = this.qiRatio(); if (k < 0.1) return;
    const msgs: C.Msg[] = []; C.gainExp(h, C.need(h) * C.INSIGHT * k, msgs);
    s.qi = 0;
    this.log('宗主汲取宗门气运，修为精进。');
    g.toast(`万众归心，气运加身：修为精进（约本层 ${Math.round(k * C.INSIGHT * 100)}%）。`, 'good');
    const p = g.player; sealFx('mana', 'gold', p.x, p.y - 30, 2.6, { dur: 1 }); sealFx('holy', s.dao === 'mo' ? 'blood' : undefined, p.x, p.y + 10, 2.4, { dur: 2 });
    g.updateUI(true);
  }
  /** 护宗大阵：充能 / 变阵 / 自动充能 / 扩建 */
  zhenNode(): DNode {
    const s = this.s!, lv = s.halls.zhen, mx = this.zhenMax(), e = Math.floor(Math.min(s.zhenE ?? 0, mx)), mode = s.zhenMode ?? 'shou';
    const o: DOpt[] = [];
    if (!lv) o.push({ label: `布下护宗大阵（${HALL_COST[0]} 灵石）`, tone: 'gold', disabled: !this.canPay(HALL_COST[0]), hint: '灵石不足', act: () => { this.buildHall('zhen'); return this.zhenNode(); } });
    else {
      const need = mx - e, can = Math.min(need, Math.floor((Math.floor(s.stones) + C.bagCount(this.game.hero, this.curId()) * this.curScale()) / ZHEN_COST));
      o.push({ label: need <= 0 ? '阵力已满' : `注入灵石充能（${can >= need ? `充满，需 ${need * ZHEN_COST}` : `只够充 ${can} 点，需 ${can * ZHEN_COST}`} 灵石）`, tone: 'gold', disabled: need <= 0 || can <= 0, hint: need <= 0 ? '' : '灵石不足', act: () => { this.chargeZhen(); return this.zhenNode(); } });
      for (const k of ['shou', 'sha', 'huan'] as ZhenMode[]) if (k !== mode) o.push({ label: `变阵：「${ZHEN_MODE[k][0]}」`, hint: ZHEN_MODE[k][1], act: () => { this.setZhenMode(k); return this.zhenNode(); } });
      o.push({ label: `自动充能：${s.zhenAuto !== false ? '开' : '关'}（点击切换）`, hint: '每月自库房补一成阵力（只动保底线之上的灵石）', act: () => { this.toggleZhenAuto(); return this.zhenNode(); } });
      if (lv < 5) { const c = HALL_COST[lv]; o.push({ label: `扩建大阵 ${lv} → ${lv + 1} 级（${c} 灵石 · 阵力上限 ${ZHEN_MAX[lv + 1]}）`, disabled: !this.canPay(c), hint: '灵石不足', act: () => { this.buildHall('zhen'); return this.zhenNode(); } }); }
    }
    o.push({ label: '返回', act: () => this.node() });
    const text = lv
      ? `「${ZHEN_MODE[mode][0]}」${lv} 级　阵力 ${e}/${mx}　${ZHEN_MODE[mode][1]}\n\n· 外敌打到山门，须先攻破大阵：大阵未破，门人躲在阵后毫发无伤，来敌每冲一次都要丢下一批人；连冲五次不破，自会退兵。\n· 劫修来犯，由大阵先扛（阵力折半算作守山战力）。\n· 阵力靠灵石维持：一点阵力 ${ZHEN_COST} 灵石；开着自动充能，每月自库房补一成。\n· 大阵若被攻破，接下来便是山门之内的灭宗大战——全宗上下一个也躲不掉。`
      : '本宗尚未布下护宗大阵。没有大阵，敌人一到山门便是全宗尽出的灭宗大战。';
    return { speaker: `${s.name} · 阵枢`, title: '护宗大阵', text, options: o, mood: 'mystic' };
  }
  /** v0.73：设定自建宗门制式服制 */
  setUniform(presetId: string) {
    const s = this.s; if (!s) return;
    const p = MY_SECT_UNIFORM_PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    s.uniform = { cut: p.cut, robe: p.robe, trim: p.trim, pattern: p.pattern };
    this.log(`宗主颁下制式服制：「${p.name}」。`);
    this.game.toast(`全宗上下换穿「${p.name}」制式道袍！`, 'good');
    this.game.updateUI(true);
  }
  /** 宗主换穿自家宗门制式法袍 */
  wearUniform() {
    const s = this.s, g = this.game; if (!s) return;
    const base = normalizeWardrobe(g.hero.wardrobe ?? DEFAULT_WARDROBE.m, 'm');
    const u = applySectUniform(g.player.look, MY_SECT_ID, 2, undefined, s.uniform);
    g.setWardrobe({
      ...base,
      clothingStyle: { collar: u.collar, sleeve: u.sleeve, robeLen: u.robeLen, skirt: u.skirt, over: u.over, pattern: u.pattern },
      clothingColors: { robe: u.robe, inner: u.inner, trim: u.trim, belt: u.belt, pants: u.pants, boots: u.boots, overColor: u.overColor, skirtColor: u.skirtColor },
    });
    g.toast(`已换穿「${s.name}」掌门制式法袍。`, 'good');
  }
  uniformNode(): DNode {
    const s = this.s!;
    const cur = s.uniform;
    const curName = MY_SECT_UNIFORM_PRESETS.find((p) => p.cut === cur?.cut && p.robe === cur?.robe)?.name ?? '青冥云纹道袍';
    const o: DOpt[] = MY_SECT_UNIFORM_PRESETS.map((p) => ({
      label: `定为「${p.name}」${cur?.cut === p.cut && cur?.robe === p.robe ? '（当前）' : ''}`,
      tone: (cur?.cut === p.cut && cur?.robe === p.robe ? 'gold' : undefined) as DOpt['tone'],
      act: () => { this.setUniform(p.id); return this.uniformNode(); },
    }));
    o.push({ label: '我也换穿本宗掌门制式法袍', tone: 'good', act: () => { this.wearUniform(); return this.uniformNode(); } });
    o.push({ label: '返回', act: () => this.node() });
    return {
      speaker: `${s.name} · 制衣坊`,
      title: '宗门制式服制',
      text: `当前本宗制式：「${curName}」。\n\n外门、内门核心与长老按品阶同款异制；战阵出征的弟子亦统一着此制式服制，绝不再五颜六色混作一团。`,
      options: o,
      mood: 'mystic',
    };
  }
}
