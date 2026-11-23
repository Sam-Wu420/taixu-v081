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
import { ARTS, ART_LIST, ArtSkill, SCHOOL_NAME, TIER_NAME, PROF_NAME, profLevel } from '../data/arts';
import { ITEMS, ITEM_LIST, scrollItemOf, itemDef } from '../data/items';
import { GONGFA } from '../data/skills';
import { REALMS, realmName } from '../data/realms';
import { ALL_LOCATIONS, LOC_BY_ID, LOCATIONS, locsOf, fromMap, ACTIVE_MAP, WORLD_SCALE, MAP_NAME, type LocDef, type MapId } from '../data/world';
import { makeName } from './npc';
import { mulberry32 } from '../core/rng';
import { MY_SECT_ID, DAO_NAME, SCALE_CAP, SCALE_NAME, type Scale } from '../data/sects';
import { sealFx } from './beastfx';

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
}
export interface Applicant { name: string; sex: 'm' | 'f'; age: number; root: number; realm: number; stage: number; until: number; note: string }
/** 自创功法：def 是完整的法术定义（随存档），pub 为刊行天下之日 */
export interface MyArt { def: ArtSkill; base: string; mix?: string; day: number; pub?: number }
export interface MySect {
  name: string; dao: 'zheng' | 'mo' | 'zhong';
  map: MapId; x: number; y: number;      // 所在地图与宏观坐标
  founded: number;
  fame: number; stones: number; tribute: number;
  ds: Disciple[]; seq: number; apps: Applicant[];
  lib: string[];                          // 已发布到藏经阁的法术 id
  gf: string;                             // 镇派心法（GONGFA id）
  halls: { lib: number; dan: number; zhen: number; ling: number };
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
  guard?: number[];                       // 随行亲卫（门人 id）
}

export const FOUND_COST = 5000;
const ROOT_NAME = ['', '伪灵根', '四灵根', '三灵根', '双灵根', '天灵根'];
const ROOT_RATE = [0, 0.45, 0.7, 1, 1.5, 2.4];
const RANK_NAME = ['外门弟子', '内门弟子', '真传弟子', '长老'];
const JOB_NAME: Record<Job, string> = { xiu: '闭关修炼', ye: '打理产业', shou: '镇守山门', li: '外出历练' };
const HALLS: { k: keyof MySect['halls']; name: string; desc: string }[] = [
  { k: 'lib', name: '藏经阁', desc: '每级多容八门功法，门人修习更快' },
  { k: 'dan', name: '丹房', desc: '门人冲关成算更高，产业进项 +20%' },
  { k: 'zhen', name: '护宗大阵', desc: '每级阵力上限大增（400 / 1200 / 3500 / 9000 / 24000）：外敌攻山先得破阵，劫修来犯由大阵先扛' },
  { k: 'ling', name: '聚灵大阵', desc: '门人修炼 +18%，可多容二十四人' },
];
const HALL_COST = [3000, 12000, 40000, 120000, 360000];
/** 各境界一人的战力 */
const POWER = [1, 3, 16, 90, 480, 2400];
/** 各境界门人打理产业的月进项、外出历练所得的基数；各身份的月例基数（再乘 1 + 境界） */
const INCOME = [4, 16, 90, 480, 2200, 6000];
const LOOT = [1, 2, 8, 30, 100, 300];
const UPKEEP = [1, 3, 8, 20];
// ------------------------------------------------------------------ v0.62「宗主不是奶妈」
/** 冲关的丹药钱（筑基 / 结丹 / 结婴）——比旧制便宜一大截，且败一次添一分成算 */
const BT_COST = [0, 800, 8000, 60000];
const BT_RULE = ['人人可冲', '三灵根或内门以上', '双灵根或真传以上'];
/** 宗门气运：各境界门人每月为宗主积下的气运；QI_NEED = 宗主各境界「一份」气运（一份 ≈ 本层修为的一成二，最多攒三份） */
const QI = [0, 0.02, 0.15, 1, 6, 30];
const QI_NEED = [30, 30, 60, 150, 500, 2000, 8000];
/** 丹房按宗主境界献上的丹药 */
const PILL_OF = ['pill_juqi', 'pill_huanglong', 'pill_juling', 'pill_ningyuan', 'pill_peiying', 'pill_yuanling', 'pill_yuanling'];
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
const STAGE_MONTHS = [6, 9, 70, 260, 900, 3000];
const FAME_TITLE: [number, string][] = [[2500, '人界大宗'], [1000, '威震一域'], [400, '一方大派'], [150, '名动一方'], [50, '小有名气'], [0, '草创山门']];
const fameTitle = (f: number) => (FAME_TITLE.find(([n]) => f >= n) ?? FAME_TITLE[FAME_TITLE.length - 1])[1];
const SECT_A = ['太虚', '青云', '凌霄', '玄天', '紫霄', '天衍', '无极', '九霄', '乾元', '归元', '长生', '问道', '苍穹', '星河', '万剑', '落霞', '听涛', '寒'];
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

export class MySectSys {
  game: Game;
  /** 本月卡在大瓶颈上的门人，各自轮得上冲关的几率（= 本月用度 / 总需求；宗主亲自指点时为 1） */
  private btP = 1;
  constructor(game: Game) { this.game = game; try { registerMyArts(game.ws); } catch { /* */ } }
  /** 旧存档 / 新立的宗门：补上 v0.62 的字段 */
  private fix() {
    const s = this.s; if (!s || s.cut !== undefined) return;
    s.cut = 0.3; s.reserve ??= 0; s.btRule ??= 1; s.btRate ??= 0.05; s.qi ??= 0; s.earned ??= 0; s.guard ??= [];
    s.zhenMode ??= 'shou'; s.zhenAuto ??= true; s.zhenE ??= ZHEN_MAX[s.halls.zhen] ?? 0;
  }
  /** 宗主亲自指点 / 赐丹 / 讲法时冲关：不受每月用度之限，只守保底线 */
  private openBudget() { this.btP = 1; }
  private btOk(d: Disciple) { const k = this.s!.btRule ?? 1; return k === 0 || (k === 1 ? d.root >= 3 || d.rank >= 1 : d.root >= 4 || d.rank >= 2); }
  /** 护宗大阵的阵力上限 */
  zhenMax() { const s = this.s; return s ? ZHEN_MAX[s.halls.zhen] ?? 0 : 0; }
  qiCap() { return QI_NEED[clamp(this.game.hero.realm, 0, QI_NEED.length - 1)] * 3; }
  /** 眼下攒了几份气运（0–3） */
  private qiRatio() { const s = this.s!; return Math.min(3, (s.qi ?? 0) / QI_NEED[clamp(this.game.hero.realm, 0, QI_NEED.length - 1)]); }
  private monthTrib() { const s = this.s!; let inc = 0; for (const d of s.ds) inc += this.incomeOf(d); return Math.round(inc * (s.cut ?? 0.3)); }
  /** 亲卫人数上限（随宗门规模） */
  guardCap() { return { xiao: 4, zhong: 6, da: 8 }[this.scale()]; }
  get s(): MySect | undefined { return this.game.ws.mySect; }

  // ------------------------------------------------------------ 地点
  /** 存档里有宗门、地点表里还没有（读档 / 刚立派）——补上；宗门没了则撤下。每帧调用，平时只是两次查表 */
  sync() {
    const s = this.s, has = LOC_BY_ID.get(MY_SECT_ID);
    if (!s) { if (has) this.unlist(has); return; }
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

  // ------------------------------------------------------------ 立派
  foundReq(): { ok: boolean; why: string } {
    const g = this.game, h = g.hero;
    if (this.s) return { ok: false, why: '你已开宗立派' };
    if (h.realm < 4) return { ok: false, why: '须元婴期方可开宗立派' };
    if ((g as any).mijing?.cur) return { ok: false, why: '秘境之中无处立派' };
    if (C.bagCount(h, 'mat_lingshi') < FOUND_COST) return { ok: false, why: `需灵石 ${FOUND_COST}（买地、立山门、布护山阵）` };
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
    const text = [
      '元婴已成，寿元千载。放眼人界，元婴修士皆可开宗立派、称宗道祖。',
      `就在脚下这片山水立下山门，须灵石 ${FOUND_COST}。立派之后：四方求仙者会慕名来投；你可收徒传功、把所学法术发布到藏经阁、自创功法并刊行天下。`,
      `道统：${DAO_NAME[d]}${d === 'mo' ? '（魔道立派，正道侧目）' : d === 'zheng' ? '（正道立派，名声须清白）' : '（不偏不倚，两头都不得罪）'}`,
      old ? `你如今是${oldName}门人——自立门户便要辞别旧宗。${old.rank >= 3 ? '以你的身份，宗门会以礼相送。' : '以你如今的身份，这等同叛出宗门。'}` : '',
      req.ok ? '' : `【${req.why}】`,
    ].filter(Boolean).join('\n\n');
    const options: DOpt[] = ns.map((n) => ({ label: `立派：「${n}」`, disabled: !req.ok, hint: req.why, tone: 'gold' as const, act: () => { this.found(n, d); return this.s ? this.node() : null; } }));
    options.push({ label: '换一批名号', act: () => this.foundNode(undefined, d) });
    options.push({ label: `改换道统（现：${DAO_NAME[d]}）`, act: () => this.foundNode(undefined, d === 'zheng' ? 'zhong' : d === 'zhong' ? 'mo' : 'zheng') });
    options.push({ label: '再想想', act: () => null });
    return { speaker: '开宗立派', title: '元婴修士', text, options, mood: 'mystic' };
  }
  found(name: string, dao: MySect['dao']) {
    const g = this.game, h = g.hero, p = g.player;
    if (!this.foundReq().ok) return;
    C.removeItem(h, 'mat_lingshi', FOUND_COST);
    if (g.ws.sect) { if (g.ws.sect.rank >= 3) { g.news(`苏寒辞去${LOC_BY_ID.get(g.ws.sect.id)?.name ?? '宗门'}之职，自立门户。`, 'personal'); g.ws.sect = null; } else g.towns.leave(); }
    const r1 = (v: number) => Math.round(v * 10) / 10;
    g.ws.mySect = {
      name, dao, map: ACTIVE_MAP, x: r1(p.x / WORLD_SCALE), y: r1(p.y / WORLD_SCALE), founded: g.day,
      fame: 20 + Math.min(60, Math.abs(g.ws.rep) * 0.5) + (h.realm - 4) * 60 + h.stage * 15, stones: 1000, tribute: 0,
      ds: [], seq: 1, apps: [], lib: [], gf: h.gongfa,
      halls: { lib: 0, dan: 0, zhen: 0, ling: 0 }, open: true, minRoot: 2, auto: false,
      lastM: Math.floor(g.day / 30), lastTeach: -999, log: [], gifts: [], wins: 0, losses: 0,
    };
    this.sync();
    const s = this.s!;
    for (let i = 0; i < 4; i++) s.apps.push(this.genApplicant(0.25));   // 开山头一天：几个早就等在山下的
    this.log(`开宗立派，立「${name}」于${MAP_NAME[ACTIVE_MAP]}。`);
    g.news(`元婴修士苏寒开宗立派，立「${name}」，广收门徒。`, 'personal');
    g.toast(`「${name}」开山立派！山下已有人前来求拜。`, 'good');
    if (dao === 'mo') g.ws.rep = Math.min(g.ws.rep, -20);
    sealFx('holy', dao === 'mo' ? 'blood' : undefined, p.x, p.y + 10, 3, { dur: 2.4 });
    sealFx('rune', dao === 'mo' ? 'blood' : 'gold', p.x, p.y + 14, 3.2, { dur: 6, loop: true });
    g.updateUI(true);
  }

  // ------------------------------------------------------------ 门人
  /** v0.61：自家宗门的规模随威望晋级——小宗门（上限 120）→ 威望 600 中宗门（200）→ 威望 1800 大宗门（400） */
  scale(): Scale { const s = this.s; return !s ? 'xiao' : s.fame >= 1800 ? 'da' : s.fame >= 600 ? 'zhong' : 'xiao'; }
  cap() { const s = this.s!; return Math.min(SCALE_CAP[this.scale()], 24 + s.halls.ling * 24 + Math.floor(s.fame / 12)); }
  libCap() { return 8 + this.s!.halls.lib * 8; }
  power() {
    const s = this.s!; let v = Math.min(s.zhenE ?? 0, this.zhenMax()) * 0.5;   // 护宗大阵：阵力折半算作守山战力
    for (const d of s.ds) v += POWER[d.realm] * (1 + d.stage / REALMS[d.realm].stages.length) * (d.job === 'shou' ? 1.6 : d.job === 'li' ? 0.3 : 1) * (1 + Math.min(12, d.arts) * 0.03);
    return v;
  }
  private log(t: string, day?: number) { const s = this.s; if (!s) return; s.log.push({ d: Math.floor(day ?? this.game.day), t }); if (s.log.length > 60) s.log.splice(0, s.log.length - 60); }
  private genApplicant(bonus = 0): Applicant {
    const s = this.s!, g = this.game, r = Math.random;
    const sex: 'm' | 'f' = r() < 0.42 ? 'f' : 'm';
    const pubs = (g.ws.myArts ?? []).filter((m) => m.pub).length;
    const q = Math.min(0.6, s.fame / 2500 + s.halls.ling * 0.04 + s.lib.length * 0.006 + pubs * 0.03 + bonus);   // 名气越大，好苗子越多
    const x = r();
    const root = x < 0.012 + q * 0.06 ? 5 : x < 0.07 + q * 0.3 ? 4 : x < 0.32 + q * 0.5 ? 3 : x < 0.72 + q * 0.25 ? 2 : 1;
    let realm = 0, stage = 0, age = 8 + Math.floor(r() * 10), note = '山下凡人子弟，慕名前来求仙';
    const y = r();
    if (s.fame >= 700 && y < 0.005 + q * 0.03) { realm = 3; stage = Math.floor(r() * 2); age = 150 + Math.floor(r() * 200); note = '愿入门下为客卿长老的结丹修士'; }
    else if (s.fame >= 120 && y < 0.04 + q * 0.15) { realm = 2; stage = Math.floor(r() * (s.fame >= 600 ? 3 : 2)); age = 40 + Math.floor(r() * 90); note = '带艺投师的筑基散修'; }
    else if (y < 0.55) { realm = 1; stage = Math.floor(r() * 7); age = 14 + Math.floor(r() * 30); note = pick(['流落在外的炼气散修', '小家族送来的子弟', '别派除名的外门弟子', '坊市里长大的孤儿', '听了你的名头、千里来投']); }
    const name = makeName(mulberry32(Math.floor(r() * 1e9)), sex);
    return { name, sex, age, root, realm, stage, until: g.day + 60, note };
  }
  private accept(a: Applicant, quiet = false) {
    const s = this.s!; if (s.ds.length >= this.cap()) return false;
    s.apps = s.apps.filter((x) => x !== a);
    s.ds.push({ id: s.seq++, name: a.name, sex: a.sex, age: a.age, root: a.root, realm: a.realm, stage: a.stage, exp: Math.random() * 0.5, loyal: 55 + Math.random() * 25, rank: a.realm >= 3 ? 3 : a.realm >= 2 ? 1 : 0, job: 'xiu', joined: this.game.day, arts: 0 });
    if (!quiet || a.root >= 4 || a.realm >= 2) this.log(`${a.name}（${ROOT_NAME[a.root]} · ${realmName(a.realm, a.stage)}）拜入山门。`);
    return true;
  }
  /** 一个月的修炼进度 */
  private gain(d: Disciple) {
    const s = this.s!, gf = GONGFA[s.gf] ?? GONGFA.generic;
    const jobK = d.job === 'xiu' ? 1 : d.job === 'li' ? 0.8 : 0.45;
    return (1 / STAGE_MONTHS[d.realm]) * ROOT_RATE[d.root] * gf.rate * (1 + s.halls.ling * 0.18) * (1 + Math.min(20, s.lib.length) * 0.015) * jobK;
  }
  /** 修满一个小境界：晋一阶；到了大瓶颈则冲关（库房出丹药钱，丹房添成算） */
  private advance(d: Disciple, day: number) {
    const s = this.s!, r = Math.random, R = REALMS[d.realm];
    if (d.stage < R.stages.length - 1) { d.stage++; d.exp = 0; return; }
    if (d.realm >= 4) { d.exp = 1; return; }   // 门人最高修到元婴后期——化神要看天意
    const cost = BT_COST[d.realm], spare = s.stones - (s.reserve ?? 0);
    // v0.62：冲关用度有章法——只动保底线之上的灵石；每月的花销不超过盈余的一小截（btP：本月轮得上的几率，真传 / 双灵根以上加倍）；资格不够的先压着修为
    if (d.realm >= 1 && (!this.btOk(d) || spare < cost || r() >= this.btP * (d.rank >= 2 || d.root >= 4 ? 2 : 1))) { d.exp = 0.9; return; }
    s.stones -= cost; if (cost) { s.btSpent = (s.btSpent ?? 0) + cost; s.btTries = (s.btTries ?? 0) + 1; }
    // 成算：筑基约两成、结丹不到一成、结婴百中三四（灵根好、丹房高则多几分）；败一次，下回添几分——灵石不白花
    const tries = d.bt ?? 0;
    const ch = [0.9, 0.12, 0.05, 0.02][d.realm] + ROOT_RATE[d.root] * [0, 0.06, 0.03, 0.01][d.realm] + s.halls.dan * [0, 0.03, 0.015, 0.006][d.realm] + tries * [0, 0.05, 0.025, 0.01][d.realm];
    if (r() >= ch) { d.exp = 0.5; d.bt = tries + 1; return; }
    d.bt = 0; if (cost) s.btWins = (s.btWins ?? 0) + 1;
    d.realm++; d.stage = 0; d.exp = 0; d.loyal = Math.min(100, d.loyal + 10);
    { const li = [0, 0, 300, 4000, 40000][d.realm] ?? 0; if (li) { s.tribute += li; s.earned = (s.earned ?? 0) + li; } }   // 谢师礼：破境之后备一份礼谢宗主
    if (d.realm >= 2) {
      if (d.realm === 2 && d.rank < 1) d.rank = 1;
      if (d.realm >= 3 && d.rank < 3) d.rank = 3;
      s.fame += [0, 0, 3, 15, 80][d.realm];
      this.log(`${d.name}${['', '', '筑基功成', '结成金丹', '碎丹成婴'][d.realm]}${d.realm >= 3 ? '，晋为长老' : '，升入内门'}。`, day);
      if (d.realm >= 3) this.game.news(`${s.name}门下${d.name}${d.realm === 3 ? '结成金丹' : '凝结元婴'}，${s.name}声势更盛。`, 'personal');
    }
  }
  private gift(id: string, n: number) { const s = this.s!; const g0 = s.gifts.find((x) => x.id === id); if (g0) g0.n += n; else if (s.gifts.length < 40) s.gifts.push({ id, n }); }
  private adventure(d: Disciple, day: number) {
    const s = this.s!, r = Math.random, x = r();
    if (x < 0.05 + (d.realm === 0 ? 0.1 : 0)) {
      if (r() < 0.4) { s.ds = s.ds.filter((o) => o !== d); this.log(`${d.name}外出历练，一去不回，魂灯已灭。`, day); return; }
      d.exp = Math.max(0, d.exp - 0.3); this.log(`${d.name}历练中负伤而归。`, day); return;
    }
    if (x < 0.45) { const st = Math.round((10 + r() * 30) * LOOT[d.realm] * 3), tb = Math.round(st * (s.cut ?? 0.3)); s.stones += st - tb; s.tribute += tb; s.earned = (s.earned ?? 0) + tb; if (st >= 200) this.log(`${d.name}历练归来，上缴灵石 ${st}。`, day); }
    else if (x < 0.68) {
      const sc = this.game.combat.randomScroll(Math.min(4, d.realm + (r() < 0.3 ? 1 : 0)));
      if (sc && ITEMS[sc]) { this.gift(sc, 1); this.log(`${d.name}于古修洞府得${itemDef(sc).name}一卷，献与宗主。`, day); }
    } else if (x < 0.9) {
      const id = 'mat_yaodan' + clamp(d.realm * 2 - 1 + Math.floor(r() * 2), 1, 7);
      if (ITEMS[id]) { this.gift(id, 1); if (d.realm >= 2) this.log(`${d.name}猎得${itemDef(id).name}一枚，献与宗主。`, day); }
      else s.stones += 20 * LOOT[d.realm];
    } else { d.exp += 0.4; d.loyal = Math.min(100, d.loyal + 5); if (d.realm >= 2) this.log(`${d.name}历练中偶有所悟，修为大进。`, day); }
  }
  private raid(day: number) {
    const s = this.s!, g = this.game, r = Math.random;
    if (s.ds.length < 3 || day - s.founded < 180) return;
    const who = pick(s.dao === 'mo' ? ['几派联手的除魔修士', '一伙寻仇的散修', '想黑吃黑的魔修'] : ['一伙劫修', '魔道宗门的试探', '觊觎灵脉的散修联盟', '前来夺宝的邪修']);
    const atk = Math.max(30, (s.fame * 2.2 + s.stones / 400) * (0.5 + r() * 1.1));
    const zm = s.zhenMode ?? 'shou', ze = Math.min(s.zhenE ?? 0, this.zhenMax());
    if (ze > 0 && zm === 'huan' && r() < 0.5) { this.log(`${who}在「${ZHEN_MODE.huan[0]}」的迷雾里转了三日，连山门都没摸着，悻悻退去。`, day); return; }
    const home = this.atHome(), def = this.power() + (home ? POWER[g.hero.realm] * 1.5 : 0);
    if (ze > 0) s.zhenE = Math.max(0, ze - atk * 0.3 * (zm === 'shou' ? 0.7 : 1));   // 大阵先扛：耗去一截阵力
    if (def >= atk) {
      const loot = Math.round(atk * (0.5 + r()) * (ze > 0 && zm === 'sha' ? 1.6 : 1));
      s.stones += loot; s.fame += Math.min(10, 2 + atk / 300); s.wins++;
      for (const d of s.ds) d.loyal = Math.min(100, d.loyal + 3);
      this.log(`${who}来犯，${home ? '宗主亲自出手，' : '护宗大阵与门人合力，'}尽数击退，缴获灵石 ${loot}。`, day);
    } else {
      const lost = Math.round(s.stones * (0.15 + r() * 0.25));
      s.stones -= lost; s.fame = Math.max(0, s.fame - 8); s.losses++;
      let dead = 0; const fallen: string[] = [];
      s.ds = s.ds.filter((d) => { if (dead < 3 && (d.job === 'shou' || r() < 0.3) && r() < 0.12) { dead++; fallen.push(d.name); return false; } return true; });
      this.log(`${who}来犯，山门失守：库房被劫灵石 ${lost}${fallen.length ? `，${fallen.join('、')}战死` : ''}。`, day);
      g.toast(`${s.name}遭${who}袭击，库房被劫！（多派门人镇守山门、给护宗大阵充能）`, 'warn');
    }
  }
  private month(day: number) {
    const s = this.s!, g = this.game, r = Math.random;
    // 一、求拜者
    s.apps = s.apps.filter((a) => a.until > day);
    if (s.open && s.ds.length < this.cap()) {
      const pubs = (g.ws.myArts ?? []).filter((m) => m.pub).length;
      const lam = Math.min(3, 0.3 + s.fame / 400 + s.lib.length * 0.03 + pubs * 0.25);   // 草创时一年来四五人，名动一方后一年十来人，上限一年三十余人
      const n = Math.floor(lam) + (r() < lam - Math.floor(lam) ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const a = this.genApplicant(); a.until = day + 60;
        if (a.root < Math.max(1, s.minRoot - (a.realm >= 2 ? 1 : 0))) continue;   // 资质不够的，守山弟子直接劝回
        if (s.auto && s.ds.length < this.cap()) this.accept(a, true); else if (s.apps.length < 12) s.apps.push(a);
      }
    }
    // 二、修炼、产业、月例
    let income = 0, upkeep = 0, qi = 0;
    const cut = s.cut ?? 0.3, h = g.hero;
    // 本月冲关用度：只动保底线之上的灵石，且一个月的花销不超过其中一小截（默认 5%，可调）——拨下去的灵石细水长流，不会一月见底
    let demand = 0;
    for (const d of s.ds) if (d.realm >= 1 && d.realm <= 3 && d.stage >= REALMS[d.realm].stages.length - 1 && d.exp >= 0.85 && this.btOk(d)) demand += BT_COST[d.realm];
    this.btP = demand > 0 ? Math.min(1, (Math.max(0, s.stones - (s.reserve ?? 0)) * (s.btRate ?? 0.05)) / demand) : 1;
    // 冲关先尽着身份高、灵根好的
    for (const d of s.ds.slice().sort((a, b) => b.rank - a.rank || b.root - a.root)) {
      d.age += 1 / 12;
      d.exp += this.gain(d) * (0.8 + r() * 0.4);
      if (d.arts < s.lib.length && r() < 0.12 + s.halls.lib * 0.05) d.arts++;
      income += this.incomeOf(d); upkeep += this.upkeepOf(d);
      qi += QI[d.realm] * (0.5 + d.loyal / 200);
      if (d.exp >= 1) this.advance(d, day);
      d.loyal = clamp(d.loyal + (s.stones > 0 ? 0.4 : -3) + (d.rank > 0 ? 0.2 : 0) - (cut >= 0.5 ? 0.5 : 0), 0, 100);
    }
    const trib = Math.round(income * cut);
    s.tribute += trib; s.earned = (s.earned ?? 0) + trib; s.stones += Math.round(income - trib - upkeep);
    if (s.stones < 0) s.stones = 0;
    // 宗门气运：门人修行，反哺宗主
    s.qi = Math.min(this.qiCap(), (s.qi ?? 0) + qi);
    // 丹房：每月有几成机会炼出一炉合宗主境界的丹药，献与宗主
    if (s.halls.dan > 0 && r() < 0.08 + s.halls.dan * 0.05) {
      const top = s.ds.reduce((m0, d) => Math.max(m0, d.realm), 0), pid = PILL_OF[clamp(Math.min(h.realm, top + 1), 0, PILL_OF.length - 1)];
      if (ITEMS[pid]) { const n = 1 + (s.halls.dan >= 4 && r() < 0.5 ? 1 : 0); this.gift(pid, n); if (r() < 0.3) this.log(`丹房开炉，炼得${itemDef(pid).name} ${n} 枚，献与宗主。`, day); }
    }
    // 护宗大阵：自动充能（每月至多补一成，只动保底线之上的灵石）
    const zmax = this.zhenMax();
    if (zmax > 0 && s.zhenAuto !== false && (s.zhenE ?? 0) < zmax) {
      const add = Math.min(zmax - (s.zhenE ?? 0), Math.ceil(zmax * 0.1), Math.max(0, Math.floor((s.stones - (s.reserve ?? 0)) / ZHEN_COST)));
      if (add > 0) { s.zhenE = (s.zhenE ?? 0) + add; s.stones -= add * ZHEN_COST; }
    }
    // 三、坐化、离去
    s.ds = s.ds.filter((d) => {
      if (d.age > REALMS[d.realm].life * (0.9 + (d.id % 7) * 0.03)) { this.log(`${RANK_NAME[d.rank]}${d.name}寿元耗尽，于洞府中坐化。`, day); return false; }
      if (d.loyal < 12 && r() < 0.25) { this.log(`${d.name}不告而别，下山去了。`, day); return false; }
      return true;
    });
    // 四、历练、外敌
    for (const d of s.ds.slice()) if (d.job === 'li' && r() < 0.16) this.adventure(d, day);
    if (r() < 0.03 + Math.min(0.05, s.fame / 20000)) this.raid(day);   // 两三年一次；名头越响越招人惦记
    // 五、威望：向「实力该有的名声」靠拢——人多、有高人坐镇、藏经阁厚、功法传世，名声才立得住；一时的风头（发布功法、击退来犯）会慢慢淡去
    const target = this.fameTarget();
    s.fame += (target - s.fame) * (target > s.fame ? 0.02 : 0.004);
  }
  /** 以宗门眼下的实力，名声该有多大 */
  fameTarget() {
    const s = this.s!, h = this.game.hero;
    const top = s.ds.reduce((m, d) => Math.max(m, d.realm), 0), pubs = (this.game.ws.myArts ?? []).filter((m) => m.pub).length;
    const halls = s.halls.lib + s.halls.dan + s.halls.zhen + s.halls.ling;
    return 20 + Math.max(0, h.realm - 4) * 120 + h.stage * 30 + 20 * Math.sqrt(s.ds.length) + 40 * top * top + s.lib.length * 4 + pubs * 60 + halls * 15 + Math.min(100, s.wins * 4);
  }
  /** v0.62：人人都有进项——打理产业的拿全额，守山三成、修炼两成、历练一成（历练另有所得）；越忠心越肯出力 */
  private incomeOf(d: Disciple) { const k = d.job === 'ye' ? 1 : d.job === 'shou' ? 0.3 : d.job === 'xiu' ? 0.2 : 0.1; return INCOME[d.realm] * k * (1 + this.s!.halls.dan * 0.2) * (0.6 + d.loyal / 250); }
  private upkeepOf(d: Disciple) { return UPKEEP[d.rank] * (1 + d.realm); }
  /** 日结算入口（game.update 每半日调一次）：跨月则逐月推演；一次闭关几十年也只算到五十年为止 */
  daily(_days: number) {
    this.sync();
    const s = this.s; if (!s) return;
    this.fix();
    const m = Math.floor(this.game.day / 30), n = Math.min(m - s.lastM, 600);
    if (n <= 0) { if (m < s.lastM) s.lastM = m; return; }
    s.lastM = m;
    const before = s.ds.length, apps0 = s.apps.length;
    for (let i = n - 1; i >= 0; i--) this.month((m - i) * 30);
    if (s.apps.length > apps0 && !s.auto) this.game.toast(`${s.name}山门外有 ${s.apps.length} 人求拜。`, 'info');
    else if (n >= 12 && s.ds.length !== before) this.game.toast(`${s.name}：${Math.floor(n / 12)} 年间门人由 ${before} 人变为 ${s.ds.length} 人。`, 'info');
  }

  // ------------------------------------------------------------ 库房
  private canPay(n: number) { return Math.floor(this.s!.stones) + C.bagCount(this.game.hero, 'mat_lingshi') >= n; }
  /** 先动宗门库房，不够再掏宗主自己的储物袋 */
  private pay(n: number) {
    const s = this.s!; if (!this.canPay(n)) return false;
    const a = Math.min(Math.floor(s.stones), n); s.stones -= a;
    if (n - a > 0) C.removeItem(this.game.hero, 'mat_lingshi', n - a);
    return true;
  }

  // ------------------------------------------------------------ 对话面板
  /** 总入口：没有宗门 → 立派；有 → 宗主大殿 */
  node(): DNode {
    const s = this.s, g = this.game;
    if (!s) return this.foundNode();
    this.daily(0);
    const cnt = [0, 0, 0, 0]; for (const d of s.ds) cnt[d.rank]++;
    const lines = [
      `${SCALE_NAME[this.scale()]}（上限 ${SCALE_CAP[this.scale()]} 人）· ${DAO_NAME[s.dao]} · ${fameTitle(s.fame)}（威望 ${Math.floor(s.fame)}）　立派 ${Math.floor((g.day - s.founded) / 360)} 年　山门在${MAP_NAME[s.map]}`,
      `门人 ${s.ds.length}/${this.cap()}：长老 ${cnt[3]} · 真传 ${cnt[2]} · 内门 ${cnt[1]} · 外门 ${cnt[0]}　宗门战力 ${Math.round(this.power())}`,
      `库房灵石 ${Math.floor(s.stones)}　镇派心法《${GONGFA[s.gf]?.name ?? '基础吐纳术'}》　藏经阁 ${s.lib.length}/${this.libCap()} 门　自创功法 ${(g.ws.myArts ?? []).length} 门`,
      `护宗大阵：${this.zhenMax() ? `「${ZHEN_MODE[s.zhenMode ?? 'shou'][0]}」阵力 ${Math.floor(s.zhenE ?? 0)}/${this.zhenMax()}` : '尚未布阵'}　宗门气运 ${Math.floor(s.qi ?? 0)}/${this.qiCap()}${(s.guard ?? []).length ? `　亲卫 ${(s.guard ?? []).length} 人随行` : ''}`,
      `宗主收成：每月供奉约 ${this.monthTrib()} 灵石（抽成 ${Math.round((s.cut ?? 0.3) * 100)}%）· 累计已得 ${Math.floor(s.earned ?? 0)}`,
      s.tribute >= 1 || s.gifts.length ? `本宗供奉已积 ${Math.floor(s.tribute)} 灵石${s.gifts.length ? `，门人献上之物 ${s.gifts.reduce((a, b) => a + b.n, 0)} 件` : ''}，在库房领取。` : '',
      s.log.length ? '近事：\n' + s.log.slice(-3).map((l) => `· 第 ${Math.floor(l.d / 360) + 1} 年　${l.t}`).join('\n') : '',
    ].filter(Boolean);
    const o: DOpt[] = [];
    if (s.apps.length) o.push({ label: `山门求拜者（${s.apps.length} 人）`, tone: 'good', act: () => this.appsNode() });
    o.push({ label: `门人名册（${s.ds.length} 人）`, disabled: !s.ds.length, hint: '尚无门人', act: () => this.rosterNode(0) });
    o.push({ label: '分派差事', disabled: !s.ds.length, hint: '尚无门人', act: () => this.jobsNode() });
    o.push({ label: `亲卫随行（${(s.guard ?? []).length}/${this.guardCap()} 人）`, disabled: !s.ds.length, hint: '尚无门人', act: () => this.guardNode() });
    if (s.tribute >= 1 || s.gifts.length) o.push({ label: `收取供奉 ${Math.floor(s.tribute)} 灵石${s.gifts.length ? ` · 门人献礼 ${s.gifts.reduce((a, b) => a + b.n, 0)} 件` : ''}`, tone: 'gold', act: () => { this.collect(); return this.node(); } });
    const qr = this.qiRatio();
    o.push({ label: `汲取宗门气运（约本层修为 +${Math.round(qr * C.INSIGHT * 100)}%）`, tone: 'gold', disabled: qr < 0.1, hint: '气运尚薄：门人越多、境界越高、越忠心，积得越快', act: () => { this.claimQi(); return this.node(); } });
    o.push({ label: '藏经阁：发布功法', tone: 'gold', act: () => this.publishNode(0) });
    o.push({ label: '自创功法 / 刊行天下', tone: 'gold', act: () => this.myArtsNode() });
    const cd = Math.ceil(30 - (g.day - s.lastTeach));
    o.push({ label: '开坛讲法（三日）', disabled: !s.ds.length || cd > 0, hint: !s.ds.length ? '尚无门人' : `还须 ${cd} 日`, act: () => { this.teach(); return this.node(); } });
    if (g.sectwar) o.push({ label: '宗门战事：百人会战 · 破阵 · 灭宗', tone: 'bad', act: () => g.sectwar.myNode() });
    o.push({ label: `护宗大阵（阵力 ${Math.floor(s.zhenE ?? 0)}/${this.zhenMax()}）`, tone: 'gold', act: () => this.zhenNode() });
    o.push({ label: '宗门建设', act: () => this.buildNode() });
    o.push({ label: '库房 · 供奉 · 宗门用度', act: () => this.vaultNode() });
    o.push({ label: '收徒规矩', act: () => this.rulesNode() });
    o.push({ label: '宗门大事记', disabled: !s.log.length, act: () => this.logNode() });
    o.push({ label: '离开', act: () => null });
    return { speaker: s.name, title: '宗主', text: lines.join('\n'), options: o, mood: 'mystic' };
  }
  private appsNode(): DNode {
    const s = this.s!, full = s.ds.length >= this.cap();
    const o: DOpt[] = s.apps.slice(0, 8).map((a) => ({
      label: `收下 ${a.name}（${sexName(a.sex)} · ${Math.floor(a.age)} 岁 · ${ROOT_NAME[a.root]} · ${realmName(a.realm, a.stage)}）`,
      hint: full ? '门墙已满（修聚灵大阵或提升威望）' : a.note, disabled: full, tone: a.root >= 4 || a.realm >= 2 ? 'gold' as const : undefined,
      act: () => { this.accept(a); return s.apps.length ? this.appsNode() : this.node(); },
    }));
    o.push({ label: '尽数收下', disabled: full, act: () => { for (const a of s.apps.slice()) this.accept(a, true); return this.node(); } });
    o.push({ label: '只收三灵根以上', disabled: full, act: () => { for (const a of s.apps.slice()) if (a.root >= 3 || a.realm >= 2) this.accept(a, true); s.apps = s.apps.filter((a) => a.root >= 3 || a.realm >= 2); return this.node(); } });
    o.push({ label: '一概婉拒', tone: 'bad', act: () => { s.apps = []; return this.node(); } });
    o.push({ label: '返回', act: () => this.node() });
    return { speaker: `${s.name} · 山门`, title: '求拜者', text: `山门外候着 ${s.apps.length} 人（门人 ${s.ds.length}/${this.cap()}）。灵根越好修得越快：天灵根一日抵伪灵根五日；带艺投师的散修来了就能派上用场。\n\n${s.apps.slice(0, 8).map((a) => `· ${a.name}：${a.note}`).join('\n')}`, options: o };
  }
  private sorted() { return this.s!.ds.slice().sort((a, b) => b.rank - a.rank || b.realm - a.realm || b.stage - a.stage || b.root - a.root); }
  private rosterNode(page: number): DNode {
    const s = this.s!, all = this.sorted(), per = 7, pages = Math.max(1, Math.ceil(all.length / per)), p = clamp(page, 0, pages - 1);
    const o: DOpt[] = all.slice(p * per, p * per + per).map((d) => ({
      label: `${RANK_NAME[d.rank]} ${d.name} · ${realmName(d.realm, d.stage)} · ${ROOT_NAME[d.root]} · ${JOB_NAME[d.job]}`,
      tone: d.realm >= 3 ? 'gold' as const : undefined, act: () => this.discipleNode(d, p),
    }));
    if (p < pages - 1) o.push({ label: `下一页（${p + 2}/${pages}）`, act: () => this.rosterNode(p + 1) });
    if (p > 0) o.push({ label: `上一页（${p}/${pages}）`, act: () => this.rosterNode(p - 1) });
    o.push({ label: '返回', act: () => this.node() });
    const by = [0, 0, 0, 0, 0]; for (const d of s.ds) by[Math.min(4, d.realm)]++;
    return { speaker: `${s.name} · 名册`, title: `第 ${p + 1}/${pages} 页`, text: `门人 ${s.ds.length} 人：元婴 ${by[4]} · 结丹 ${by[3]} · 筑基 ${by[2]} · 炼气 ${by[1]} · 未入道 ${by[0]}。\n点名字可指点、赐丹、晋升、改派差事。`, options: o };
  }
  private discipleNode(d: Disciple, page: number): DNode {
    const s = this.s!, g = this.game;
    if (!s.ds.includes(d)) return this.rosterNode(page);
    const back = () => this.discipleNode(d, page);
    const pillCost = [50, 200, 2000, 15000, 80000][Math.min(4, d.realm)];
    const next = d.rank + 1, need = [0, 1, 2, 3][next] ?? 9;
    const canUp = next <= 3 && (next === 1 ? d.realm >= 2 || (d.realm === 1 && d.stage >= 6) : d.realm >= need);
    const taught = d.t !== undefined && g.day - d.t < 30;
    const text = [
      `${d.name}　${sexName(d.sex)} · ${Math.floor(d.age)} 岁（寿元约 ${REALMS[d.realm].life} 年）· ${ROOT_NAME[d.root]}`,
      `${RANK_NAME[d.rank]} · ${realmName(d.realm, d.stage)}（本层 ${Math.floor(clamp(d.exp, 0, 1) * 100)}%）· 入门 ${Math.floor((g.day - d.joined) / 360)} 年`,
      `差事：${JOB_NAME[d.job]}　忠诚 ${Math.round(d.loyal)}　已习藏经阁功法 ${d.arts}/${s.lib.length} 门`,
    ].join('\n');
    const o: DOpt[] = [
      { label: '亲自指点（一日）', disabled: taught, hint: taught ? '近一月已指点过' : '修为进一大截，忠诚 +8', tone: 'good', act: () => { g.passDays(1); d.t = g.day; d.exp += Math.max(0.12, this.gain(d) * 6); d.loyal = Math.min(100, d.loyal + 8); if (d.exp >= 1) { this.openBudget(); this.advance(d, g.day); } return back(); } },
      { label: `赐下丹药（${pillCost} 灵石）`, disabled: !this.canPay(pillCost), hint: '库房或你的储物袋出钱', act: () => { if (this.pay(pillCost)) { d.exp += 0.35; d.loyal = Math.min(100, d.loyal + 4); if (d.exp >= 1) { this.openBudget(); this.advance(d, g.day); } } return back(); } },
      { label: next <= 3 ? `晋为${RANK_NAME[next]}` : '已是长老', disabled: !canUp, hint: next > 3 ? '' : next === 1 ? '需炼气七层以上' : `需${REALMS[need].name}期`, act: () => { d.rank = next; d.loyal = Math.min(100, d.loyal + 12); this.log(`${d.name}晋为${RANK_NAME[next]}。`); return back(); } },
    ];
    for (const j of ['xiu', 'ye', 'shou', 'li'] as Job[]) if (j !== d.job) o.push({ label: `改派：${JOB_NAME[j]}`, act: () => { d.job = j; return back(); } });
    o.push({ label: '逐出山门', tone: 'bad', act: () => { s.ds = s.ds.filter((x) => x !== d); this.log(`${d.name}被逐出山门。`); return this.rosterNode(page); } });
    o.push({ label: '返回名册', act: () => this.rosterNode(page) });
    return { speaker: d.name, title: RANK_NAME[d.rank], text, options: o };
  }
  private jobsNode(): DNode {
    const s = this.s!, cnt: Record<Job, number> = { xiu: 0, ye: 0, shou: 0, li: 0 };
    for (const d of s.ds) cnt[d.job]++;
    const set = (f: (d: Disciple, i: number) => Job) => { this.sorted().forEach((d, i) => { d.job = f(d, i); }); return this.jobsNode(); };
    return {
      speaker: `${s.name} · 执事堂`, title: '分派差事',
      text: `闭关修炼 ${cnt.xiu} 人 · 打理产业 ${cnt.ye} 人 · 镇守山门 ${cnt.shou} 人 · 外出历练 ${cnt.li} 人\n\n修炼：进境最快。产业：进项最多（按抽成归宗主供奉），修炼减半；守山、修炼的也各有一份小进项。守山：外敌来犯时战力 ×1.6。历练：带回灵石、妖丹、功法卷轴，也可能回不来。`,
      options: [
        { label: '均衡安排（修炼六成 · 产业二成 · 守山一成 · 历练一成）', act: () => set((_d, i) => (i % 10 < 6 ? 'xiu' : i % 10 < 8 ? 'ye' : i % 10 < 9 ? 'shou' : 'li')) },
        { label: '全力修炼', act: () => set(() => 'xiu') },
        { label: '广开财路（外门尽数打理产业）', act: () => set((d) => (d.rank === 0 ? 'ye' : 'xiu')) },
        { label: '严守山门（筑基以上半数守山）', act: () => set((d, i) => (d.realm >= 2 && i % 2 === 0 ? 'shou' : d.rank === 0 ? 'ye' : 'xiu')) },
        { label: '遣筑基以上弟子下山历练', act: () => set((d) => (d.realm >= 2 && d.rank < 3 ? 'li' : d.job === 'li' ? 'xiu' : d.job)) },
        { label: '返回', act: () => this.node() },
      ],
    };
  }
  // ---------- 藏经阁：发布功法 ----------
  private publishable(): ArtSkill[] {
    const s = this.s!, h = this.game.hero;
    return h.arts.map((a) => ARTS[a.id]).filter((a) => a && !s.lib.includes(a.id) && a.cast !== 'sense' && a.cast !== 'custom' && a.school !== '神' && a.id !== 'qijin')
      .sort((a, b) => b.tier - a.tier || a.school.localeCompare(b.school));
  }
  private publishNode(page: number): DNode {
    const s = this.s!, h = this.game.hero, all = this.publishable(), per = 7, pages = Math.max(1, Math.ceil(all.length / per)), p = clamp(page, 0, pages - 1);
    const full = s.lib.length >= this.libCap();
    const o: DOpt[] = all.slice(p * per, p * per + per).map((a) => ({
      label: `发布《${a.name}》　${TIER_NAME[a.tier]} · ${SCHOOL_NAME[a.school]}`, disabled: full, hint: full ? '藏经阁已满（去宗门建设里扩建）' : `威望 +${[1, 2, 5, 12, 30][a.tier]}`,
      tone: a.tier >= 3 ? 'gold' as const : undefined,
      act: () => { s.lib.push(a.id); s.fame += [1, 2, 5, 12, 30][a.tier]; this.log(`宗主将《${a.name}》录入藏经阁，门人争相参悟。`); if (a.tier >= 3) this.game.toast(`《${a.name}》入藏经阁，${s.name}威望上涨。`, 'good'); return this.publishNode(p); },
    }));
    if (p < pages - 1) o.push({ label: `下一页（${p + 2}/${pages}）`, act: () => this.publishNode(p + 1) });
    if (p > 0) o.push({ label: `上一页（${p}/${pages}）`, act: () => this.publishNode(p - 1) });
    const gf = GONGFA[h.gongfa];
    if (gf && h.gongfa !== s.gf) o.push({ label: `立《${gf.name}》为镇派心法`, tone: 'gold', hint: `门人修炼速度 ×${gf.rate}`, act: () => { s.gf = h.gongfa; s.fame += 5 + (gf.tier ?? 1) * 4; this.log(`宗主传下《${gf.name}》，定为镇派心法。`); return this.publishNode(p); } });
    o.push({ label: '返回', act: () => this.node() });
    const names = s.lib.map((id) => ARTS[id]?.name).filter(Boolean);
    return {
      speaker: `${s.name} · 藏经阁`, title: `${s.lib.length}/${this.libCap()} 门`,
      text: `镇派心法：《${GONGFA[s.gf]?.name ?? '基础吐纳术'}》（门人修炼 ×${GONGFA[s.gf]?.rate ?? 0.8}）\n已发布：${names.length ? names.map((n) => `《${n}》`).join('') : '尚无'}\n\n把你会的法术发布出来，门人便可修习：每多一门，门人修炼 +1.5%、宗门战力更强、慕名来投的好苗子也更多；品阶越高威望涨得越多。${all.length ? '' : '\n\n（你会的法术都已发布）'}`,
      options: o,
    };
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
  private teach() {
    const s = this.s!, g = this.game, h = g.hero;
    g.passDays(3); s.lastTeach = g.day;
    for (const d of s.ds) { d.exp += Math.max(0.05, this.gain(d) * 4); d.loyal = Math.min(100, d.loyal + 6); if (d.exp >= 1) { this.openBudget(); this.advance(d, g.day); } }
    const msgs: C.Msg[] = []; C.gainExp(h, C.need(h) * C.INSIGHT * 0.2, msgs);
    s.fame += 1 + s.ds.length * 0.01;
    this.log('宗主开坛讲法三日，门人获益良多。');
    g.toast('开坛讲法三日：教学相长，自己也有所悟。', 'good');
    const p = g.player; sealFx('rune', s.dao === 'mo' ? 'blood' : 'gold', p.x, p.y + 10, 2.6, { dur: 3, loop: true });
    g.updateUI(true);
  }
  private buildNode(): DNode {
    const s = this.s!;
    const o: DOpt[] = HALLS.map((hd) => {
      const lv = s.halls[hd.k], cost = HALL_COST[lv];
      return lv >= 5 ? { label: `${hd.name} 五级（已至顶）`, disabled: true }
        : { label: `${hd.name} ${lv} → ${lv + 1} 级（${cost} 灵石）`, hint: hd.desc, disabled: !this.canPay(cost), act: () => { if (this.pay(cost)) { s.halls[hd.k]++; if (hd.k === 'zhen') s.zhenE = ZHEN_MAX[s.halls.zhen]; s.fame += 4 + lv * 4; this.log(`${hd.name}扩建至 ${lv + 1} 级。`); } return this.buildNode(); } };
    });
    o.push({ label: '返回', act: () => this.node() });
    return { speaker: `${s.name} · 营造`, title: '宗门建设', text: `库房灵石 ${Math.floor(s.stones)}（不够时从你的储物袋里补）。\n\n${HALLS.map((hd) => `${hd.name} ${s.halls[hd.k]} 级：${hd.desc}`).join('\n')}`, options: o };
  }
  /** 收下供奉与门人献礼 */
  private collect() {
    const s = this.s!, g = this.game, h = g.hero, n = Math.floor(s.tribute);
    if (n >= 1) { C.addItem(h, 'mat_lingshi', n); s.tribute -= n; }
    if (s.gifts.length) { for (const it of s.gifts) C.addItem(h, it.id, it.n); g.toast(`收下：${n >= 1 ? `供奉灵石 ${n}、` : ''}${s.gifts.map((it) => `${itemDef(it.id).name}×${it.n}`).join('、')}`, 'good'); s.gifts = []; }
    else if (n >= 1) g.toast(`收下供奉灵石 ${n}。`, 'good');
    g.updateUI(true);
  }
  /** 汲取宗门气运：门人修行反哺宗主 */
  private claimQi() {
    const s = this.s!, g = this.game, h = g.hero, k = this.qiRatio(); if (k < 0.1) return;
    const msgs: C.Msg[] = []; C.gainExp(h, C.need(h) * C.INSIGHT * k, msgs);
    s.qi = 0;
    this.log('宗主汲取宗门气运，修为精进。');
    g.toast(`万众归心，气运加身：修为精进（约本层 ${Math.round(k * C.INSIGHT * 100)}%）。`, 'good');
    const p = g.player; sealFx('mana', 'gold', p.x, p.y - 30, 2.6, { dur: 1 }); sealFx('holy', s.dao === 'mo' ? 'blood' : undefined, p.x, p.y + 10, 2.4, { dur: 2 });
    g.updateUI(true);
  }
  private vaultNode(): DNode {
    const s = this.s!, g = this.game, h = g.hero, mine = C.bagCount(h, 'mat_lingshi'), st = Math.floor(s.stones);
    const fmt = (n: number) => (n >= 10000 ? `${n / 10000} 万` : `${n}`);
    const cut = s.cut ?? 0.3, pct = Math.round(cut * 100), spare = Math.max(0, st - (s.reserve ?? 0)), rate = s.btRate ?? 0.05, rateTxt = rate >= 1 ? '全部（不限）' : `${Math.round(rate * 100)}%`;
    const o: DOpt[] = [];
    if (s.tribute >= 1 || s.gifts.length) o.push({ label: `收取供奉 ${Math.floor(s.tribute)} 灵石${s.gifts.length ? ` · 门人献礼 ${s.gifts.reduce((a, b) => a + b.n, 0)} 件` : ''}`, tone: 'gold', act: () => { this.collect(); return this.vaultNode(); } });
    o.push({ label: '拨灵石入库房（一千 / 一万 / 十万 / 百万 / 全部）', disabled: mine < 1, hint: '储物袋里没有灵石', act: () => this.moveNode(true) });
    o.push({ label: '从库房支取灵石', disabled: st < 1, hint: '库房是空的', act: () => this.moveNode(false) });
    o.push({ label: `宗主抽成：${pct}%（点击切换）`, hint: '门人产业、历练、据点、战利品的进项，按此成数径入宗主供奉；抽到五成，门人会渐生怨言', act: () => { const cs = [0.1, 0.2, 0.3, 0.4, 0.5]; s.cut = cs[(cs.indexOf(cut) + 1) % cs.length]; return this.vaultNode(); } });
    o.push({ label: `库房保底：${fmt(s.reserve ?? 0)} 灵石（点击切换）`, hint: '门人冲关、大阵自动充能都只动保底线之上的灵石', act: () => { const rs = [0, 5000, 20000, 100000, 500000, 2000000]; s.reserve = rs[(rs.indexOf(s.reserve ?? 0) + 1) % rs.length]; return this.vaultNode(); } });
    o.push({ label: `冲关用度：每月至多动用盈余的 ${rateTxt}（点击切换）`, hint: '盈余 = 库房灵石 − 保底线。越小越细水长流，越大门人破境越快', act: () => { const rs = [0.02, 0.05, 0.1, 0.25, 1]; s.btRate = rs[(rs.indexOf(rate) + 1) % rs.length]; return this.vaultNode(); } });
    o.push({ label: `冲关资格：${BT_RULE[s.btRule ?? 1]}（点击切换）`, hint: '库房出丹药钱，供哪些门人冲击大境界', act: () => { s.btRule = ((s.btRule ?? 1) + 1) % 3; return this.vaultNode(); } });
    o.push({ label: '返回', act: () => this.node() });
    let inc = 0, up = 0; for (const d of s.ds) { inc += this.incomeOf(d); up += this.upkeepOf(d); }
    const text = [
      `库房灵石 ${st}　你的储物袋 ${mine}　待领供奉 ${Math.floor(s.tribute)}　累计已得 ${Math.floor(s.earned ?? 0)}`,
      `每月：门人进项约 ${Math.round(inc)}（人人都出力：打理产业的最多，守山、修炼的也各有一份）· 其中 ${pct}% 即 ${Math.round(inc * cut)} 归宗主 · 门人月例 ${Math.round(up)} · 库房净入 ${Math.round(inc * (1 - cut) - up)}`,
      `冲关用度：筑基 ${BT_COST[1]} · 结丹 ${BT_COST[2]} · 结婴 ${BT_COST[3]}（败一次，下回成算添几分，灵石不白花）。每月的冲关花销不超过盈余的 ${rateTxt}（眼下约 ${Math.floor(spare * rate)}），先尽着身份高、灵根好的——拨下去的灵石不会一月见底。累计冲关 ${s.btTries ?? 0} 次、成 ${s.btWins ?? 0} 次，共花 ${s.btSpent ?? 0}。`,
      `回报：门人破境备谢师礼（筑基 300 · 结丹 4000 · 元婴 40000）径入供奉；丹房每月有机会献上一炉丹药；宗门气运可在大殿汲取，化作你的修为。`,
      s.gifts.length ? `门人献上：${s.gifts.map((it) => `${itemDef(it.id).name}×${it.n}`).join('、')}` : '',
    ].filter(Boolean).join('\n');
    return { speaker: `${s.name} · 库房`, title: '库房 · 供奉 · 用度', text, options: o };
  }
  private moveNode(put: boolean): DNode {
    const s = this.s!, g = this.game, h = g.hero, mine = C.bagCount(h, 'mat_lingshi'), st = Math.floor(s.stones), have = put ? mine : st, verb = put ? '拨' : '支取';
    const go = (v: number) => { const n = Math.min(Math.floor(v), have); if (n > 0) { if (put) { C.removeItem(h, 'mat_lingshi', n); s.stones += n; } else { s.stones -= n; C.addItem(h, 'mat_lingshi', n); } g.updateUI(true); } return this.vaultNode(); };
    const o: DOpt[] = [1000, 10000, 100000, 1000000].map((n): DOpt => ({ label: `${verb} ${n >= 10000 ? `${n / 10000} 万` : n} 灵石`, disabled: have < n, hint: put ? '储物袋灵石不足' : '库房灵石不足', act: () => go(n) }));
    o.push({ label: `${verb}一半（${Math.floor(have / 2)}）`, disabled: have < 2, act: () => go(have / 2) });
    o.push({ label: `${put ? '倾囊拨入' : '尽数支取'}（${have}）`, disabled: have < 1, tone: put ? 'gold' : 'bad', act: () => go(have) });
    o.push({ label: '返回', act: () => this.vaultNode() });
    return { speaker: `${s.name} · 库房`, title: put ? '拨灵石入库' : '支取灵石', text: `库房灵石 ${st}　你的储物袋 ${mine}\n\n${put ? '拨下去的灵石不会一月花光：门人冲关每月的花销不超过库房盈余的一小截（默认 5%，在库房里可调），而且先尽着身份高、灵根好的。' : '库房见底，月例发不出，门人会离心。'}`, options: o };
  }
  /** 护宗大阵：充能 / 变阵 / 自动充能 / 扩建 */
  zhenNode(): DNode {
    const s = this.s!, lv = s.halls.zhen, mx = this.zhenMax(), e = Math.floor(Math.min(s.zhenE ?? 0, mx)), mode = s.zhenMode ?? 'shou';
    const o: DOpt[] = [];
    if (!lv) o.push({ label: `布下护宗大阵（${HALL_COST[0]} 灵石）`, tone: 'gold', disabled: !this.canPay(HALL_COST[0]), hint: '灵石不足', act: () => { if (this.pay(HALL_COST[0])) { s.halls.zhen = 1; s.zhenE = ZHEN_MAX[1]; s.fame += 4; this.log('布下护宗大阵。'); } return this.zhenNode(); } });
    else {
      const need = mx - e, can = Math.min(need, Math.floor((Math.floor(s.stones) + C.bagCount(this.game.hero, 'mat_lingshi')) / ZHEN_COST));
      o.push({ label: need <= 0 ? '阵力已满' : `注入灵石充能（${can >= need ? `充满，需 ${need * ZHEN_COST}` : `只够充 ${can} 点，需 ${can * ZHEN_COST}`} 灵石）`, tone: 'gold', disabled: need <= 0 || can <= 0, hint: need <= 0 ? '' : '灵石不足', act: () => { if (this.pay(can * ZHEN_COST)) s.zhenE = e + can; return this.zhenNode(); } });
      for (const k of ['shou', 'sha', 'huan'] as ZhenMode[]) if (k !== mode) o.push({ label: `变阵：「${ZHEN_MODE[k][0]}」`, hint: ZHEN_MODE[k][1], act: () => { s.zhenMode = k; this.log(`护宗大阵变阵为「${ZHEN_MODE[k][0]}」。`); return this.zhenNode(); } });
      o.push({ label: `自动充能：${s.zhenAuto !== false ? '开' : '关'}（点击切换）`, hint: '每月自库房补一成阵力（只动保底线之上的灵石）', act: () => { s.zhenAuto = s.zhenAuto === false; return this.zhenNode(); } });
      if (lv < 5) { const c = HALL_COST[lv]; o.push({ label: `扩建大阵 ${lv} → ${lv + 1} 级（${c} 灵石 · 阵力上限 ${ZHEN_MAX[lv + 1]}）`, disabled: !this.canPay(c), hint: '灵石不足', act: () => { if (this.pay(c)) { s.halls.zhen++; s.zhenE = ZHEN_MAX[s.halls.zhen]; s.fame += 4 + lv * 4; this.log(`护宗大阵扩建至 ${lv + 1} 级。`); } return this.zhenNode(); } }); }
    }
    o.push({ label: '返回', act: () => this.node() });
    const text = lv
      ? `「${ZHEN_MODE[mode][0]}」${lv} 级　阵力 ${e}/${mx}　${ZHEN_MODE[mode][1]}\n\n· 外敌打到山门，须先攻破大阵：大阵未破，门人躲在阵后毫发无伤，来敌每冲一次都要丢下一批人；连冲五次不破，自会退兵。\n· 劫修来犯，由大阵先扛（阵力折半算作守山战力）。\n· 阵力靠灵石维持：一点阵力 ${ZHEN_COST} 灵石；开着自动充能，每月自库房补一成。\n· 大阵若被攻破，接下来便是山门之内的灭宗大战——全宗上下一个也躲不掉。`
      : '本宗尚未布下护宗大阵。没有大阵，敌人一到山门便是全宗尽出的灭宗大战。';
    return { speaker: `${s.name} · 阵枢`, title: '护宗大阵', text, options: o, mood: 'mystic' };
  }
  /** 亲卫：点几名门人随行护法——宗主走到哪，他们跟到哪、打到哪（战死便是真的死了） */
  private guardNode(): DNode {
    const s = this.s!, cap = this.guardCap(), ids = (s.guard ??= []), cur = s.ds.filter((d) => ids.includes(d.id)), any = s.ds.some((d) => d.realm >= 1);
    const pickTop = (n: number) => { s.guard = s.ds.filter((d) => d.realm >= 1).sort((a, b) => b.realm - a.realm || b.stage - a.stage || b.loyal - a.loyal).slice(0, n).map((d) => d.id); return this.guardNode(); };
    const o: DOpt[] = [
      { label: `点最强的 ${cap} 人随行`, tone: 'gold', disabled: !any, hint: '尚无入道的门人', act: () => pickTop(cap) },
      { label: `只带 ${Math.ceil(cap / 2)} 人`, disabled: !any, hint: '尚无入道的门人', act: () => pickTop(Math.ceil(cap / 2)) },
      { label: '遣散亲卫，各回洞府', disabled: !ids.length, act: () => { s.guard = []; return this.guardNode(); } },
      { label: '返回', act: () => this.node() },
    ];
    return { speaker: `${s.name} · 亲卫`, title: `随行 ${cur.length}/${cap} 人`, text: `养兵千日，用兵一时。点几名门人随行护法：你在野外走到哪，他们便跟到哪、打到哪（秘境、洞府里不跟）。\n亲卫是名册上的真人——战死了，名册上就少一个。${SCALE_NAME[this.scale()]}可带 ${cap} 人。\n\n${cur.length ? cur.map((d) => `· ${RANK_NAME[d.rank]} ${d.name}（${realmName(d.realm, d.stage)}）`).join('\n') : '眼下无人随行。'}`, options: o };
  }
  private rulesNode(): DNode {
    const s = this.s!;
    return {
      speaker: `${s.name} · 山门`, title: '收徒规矩',
      text: `山门：${s.open ? '大开，广纳门徒' : '紧闭，暂不收徒'}\n门槛：${ROOT_NAME[s.minRoot]}以上（带艺投师的散修放宽一档）\n收录：${s.auto ? '合乎门槛的由执事径直收录' : '须宗主亲自过目'}`,
      options: [
        { label: s.open ? '关闭山门，暂不收徒' : '大开山门，广纳门徒', act: () => { s.open = !s.open; return this.rulesNode(); } },
        { label: `门槛改为：${ROOT_NAME[s.minRoot % 4 + 1]}以上`, hint: '门槛越高来的人越少，但修得快', act: () => { s.minRoot = s.minRoot % 4 + 1; return this.rulesNode(); } },
        { label: s.auto ? '改为宗主亲自过目' : '合乎门槛的由执事径直收录', act: () => { s.auto = !s.auto; return this.rulesNode(); } },
        { label: '返回', act: () => this.node() },
      ],
    };
  }
  private logNode(): DNode {
    const s = this.s!;
    return { speaker: `${s.name} · 大事记`, title: `击退来犯 ${s.wins} 次 · 失守 ${s.losses} 次`, text: s.log.slice(-16).reverse().map((l) => `第 ${Math.floor(l.d / 360) + 1} 年　${l.t}`).join('\n'), options: [{ label: '返回', act: () => this.node() }] };
  }
}
