// v0.61「宗门争锋」：宗门之间的战争
//   · 宗门分三等：大宗门（门人上限 400）· 中宗门（200）· 小宗门（120）——见 data/sects.ts 的 SECT_SCALE
//   · 关系：正魔不两立、佛魔相克、世仇、地盘相邻……每一对宗门有一条「紧张度」，日积月累，满了就开战
//   · 据点：各派在山门之外派弟子镇守附近的城镇（大 4 处 / 中 3 处 / 小 2 处），你走近能看见镇守弟子
//   · 开战：攻方一处处拔据点，拔光了打山门。两种打法——
//       「分波遣将」一波一波派弟子上去（折损小、进展慢）；
//       「倾巢而出」全宗召集、全面对轰（一战定胜负，输了元气大伤）
//     守方同理：「逐波增援」/「全宗回援」/「只凭镇守」
//   · 宗法：每派的镇派心法折成一套战阵（攻 / 守加成），正魔相争时同盟各派会派援军
//   · 伤亡都落在真名册上（roster.ts）：打一仗少一批人，战后再慢慢补
//   · 你：身为门人会收到召集玉符；散修可择一方投效；自立宗门后可派弟子镇守、宣战、调兵、亲征
// v0.62「灭宗大战」：
//   · 百人会战：一次遣 30 / 50 / 80 / 120 人乃至全宗出战，守方照着来敌的人数迎战；亲征时敌我后备源源上场（同屏三十余人），屏幕上方有兵力条
//   · 一方倾巢而出，另一方也只能尽出迎战——这就是灭宗大战：野战得胜则对方据点尽失、兵临山门
//   · 护宗大阵：打到山门须先破阵（宗主亲自轰击 / 遣弟子强攻 / 亲征破阵）；阵破之后才是山门之内的灭宗大战
//   · 发落：山门告破 / 对方乞和之后，由你决定——灭其道统 · 收编残部 · 纳为附庸 · 赔款罢兵
// 状态在 ws.flags.sw（随存档）；界面走通用对话面板。
import type { Game } from './game';
import type { DNode, DOpt } from './modal';
import type { Jade } from './war';
import type { NpcData } from './npc';
import { ZHEN_MODE, type MySect, type ZhenMode } from './mysect';
import { Enemy } from './combat';
import { ENEMIES } from '../data/enemies';
import { LOC_BY_ID, ALL_LOCATIONS, WORLD_SCALE, ACTIVE_MAP, MAP_NAME, type LocDef } from '../data/world';
import { REALMS, realmName } from '../data/realms';
import { GONGFA } from '../data/skills';
import { ARTS } from '../data/arts';
import { ITEMS } from '../data/items';
import { sealFx } from './beastfx';
import * as C from './cultivation';
import { randomLook } from '../gfx/character';
import { mulberry32 } from '../core/rng';
import { SECT_DEF, SECT_DEFS, member, rankOf, sectTitle } from './roster';
import { SCHOOLS } from './schools';
import { SECT_LIB } from './town';
import { GARRISON } from './garrison';
import { sectDao, sectGongfa, DAO_NAME, MY_SECT_ID, X_BY_ID, scaleOf, SCALE_NAME, SCALE_CAP, type Dao, type Scale } from '../data/sects';
import { dirName } from './sites';

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const YEAR = 360;
/** 开局的太平年月（此前各派只有摩擦，不会自行开战） */
export const GRACE = 3 * YEAR;
const MY = MY_SECT_ID;
/** 一名修士的战力（按大境界；小境界每层 +15%） */
const PW = [0.3, 1, 5, 25, 120, 500, 2000];
const pwOf = (u: { realm: number; stage: number }) => (PW[u.realm] ?? 1) * (1 + 0.15 * u.stage);

export type Mode = 'wave' | 'all' | 'hold';
const ATK_NAME: Record<Mode, string> = { wave: '分波遣将', all: '倾巢而出', hold: '小股试探' };
const DEF_NAME: Record<Mode, string> = { wave: '逐波增援', all: '全宗回援', hold: '只凭镇守' };
/** 每处据点的镇守人数 / 各等宗门的据点数 */
export const GAR: Record<Scale, number> = { da: 30, zhong: 18, xiao: 10 };
export const HOLDS: Record<Scale, number> = { da: 4, zhong: 3, xiao: 2 };
const SCALE_W: Record<Scale, number> = { da: 0, zhong: 1, xiao: 2 };
/** v0.62：附庸月供（径入宗主供奉）/ 分舵月入 / 灭宗搜刮 / 赔款 */
const VASSAL: Record<Scale, number> = { da: 3000, zhong: 1200, xiao: 500 };
const BRANCH: Record<Scale, number> = { da: 4000, zhong: 1800, xiao: 800 };
const MIE_LOOT: Record<Scale, number> = { da: 300000, zhong: 120000, xiao: 40000 };
const END_LOOT: Record<Scale, number> = { da: 60000, zhong: 24000, xiao: 9000 };
/** 亲征时同屏的人数上限（敌 / 我）——后备打完一批补一批 */
const FIELD_F = 20, FIELD_M = 16;

// ---------------------------------------------------------------- 联盟 / 世仇
const OLD_ALLY: Record<string, string> = {};
for (const [k, ids] of Object.entries({
  梁国七派: ['huangfeng', 'yanyue', 'lingshou', 'qingxu', 'huadao', 'tianque', 'jujian'], 正一盟: ['luoyun', 'gujian', 'baiqiao'],
  魔门六宗: ['guiling', 'hehuan', 'yuling', 'qianhuan', 'tiansha', 'yinluo'], 列国盟: ['huayi', 'qianzhu'], 朔漠: ['tianlan', 'mulan'],
  中州魔道: ['tianmo'], 中州正道: ['taiyi', 'yejia'], 星罗殿: ['tianxing', 'miaoyin'], 叛星盟: ['leikong', 'jiyin'],
})) for (const id of ids) OLD_ALLY[id] = k;
export const allyOf = (id: string): string => X_BY_ID[id]?.ally ?? OLD_ALLY[id] ?? '';
const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
/** 世仇（[甲, 乙, 缘由]）——同盟之内也可能有过节 */
const FEUD_LIST: [string, string, string][] = [
  ['huangfeng', 'guiling', '阴灵门当年血洗青霞谷外围坊市的旧账'], ['yanyue', 'hehuan', '天欢宗屡屡掳掠凝霜宗女弟子'], ['lingshou', 'yuling', '驭兽一道的正统之争'],
  ['luoyun', 'yinluo', '幽罗宗盗掘栖云宗药园'], ['gujian', 'tiansha', '玄煞宗截杀藏剑门试剑弟子'], ['baiqiao', 'qianzhu', '天衍诀傀儡术的归属之争'],
  ['huadao', 'jujian', '刀剑孰强的百年意气之争'], ['taizhen', 'moyan', '太真门长老死于青阳魔火'], ['haoran', 'xuesha', '血煞教屠戮浩然阁治下凡人城池'],
  ['wanfa', 'jiyin', '玄阴祖师暗算万法门长老'], ['liulian', 'leikong', '叛星盟强征六合殿的猎妖船队'], ['tianxing', 'leikong', '逆星之乱'],
  ['leiyin', 'motuo', '佛魔相克，雷音宗誓平魔陀山'], ['tianshi', 'dusheng', '毒圣门毒杀天师府嫡传'], ['taiyi', 'tianmo', '中州正魔两道魁首之争'],
  ['jiuxian', 'motuo', '魔陀山魔修觊觎九霄宫女修'], ['xiaoji', 'wanyao', '万妖谷妖修屡犯北寒雪原'], ['tianfu', 'tianxingzong', '符阵两道的生意之争'],
];
const FEUD = new Map(FEUD_LIST.map(([a, b, why]) => [key(a, b), why]));
function daoBase(a: Dao, b: Dao): number {
  const k = [a, b].sort().join('-');
  return ({ 'mo-zheng': 38, 'fo-mo': 42, 'yao-zheng': 18, 'mo-mo': 12, 'mo-yao': 12, 'fo-yao': 15, 'mo-zhong': 14 } as Record<string, number>)[k] ?? 4;
}
/** 名册上有、心法表里没有登记的旧派 */
const EXTRA_GF: Record<string, string> = { jiyin: 'xuanyin' };
const SCHOOL_ALIAS: Record<string, string> = { tianxing: 'xinggong', leikong: 'nixing', tianlan: 'mulan', yejia: 'taiyi' };
/** 心法主修的那一系 → 战阵 */
const ZHEN: Record<string, [string, 'atk' | 'def']> = {
  火: ['烈火燎原阵', 'atk'], 雷: ['九霄雷阵', 'atk'], 剑: ['万剑归宗阵', 'atk'], 魔: ['血煞魔阵', 'atk'], 冰: ['玄冰封天阵', 'atk'], 风: ['疾风游骑阵', 'atk'],
  阵: ['周天星斗大阵', 'def'], 土: ['厚土镇岳阵', 'def'], 体: ['金刚伏魔阵', 'def'], 符: ['万符护山阵', 'def'], 木: ['青木长生阵', 'def'], 御: ['万兽奔腾阵', 'atk'], 识: ['迷魂幻阵', 'def'], 身: ['游龙阵', 'atk'],
};
export interface Doctrine { gf: string; name: string; atk: number; def: number }

export interface Hold { o: string; g: number }
export interface SWar {
  id: number; a: string; b: string; why: string; start: number;
  /** 眼下谁在攻（0 = a，1 = b）；tgt 是守方的据点或山门（= 守方宗门 id） */
  ini: 0 | 1; tgt: string;
  score: number; wave: number; next: number; streak: number; la: number; lb: number; log: string[];
  /** 你投了哪一边（门人应召 / 散修投效）；自家宗门参战不用这个 */
  side?: 0 | 1; wins?: number; lastFight?: number; lastAct?: number; allA?: number; allB?: number; called?: boolean;
  /** v0.62：fall = 败者听候发落之日；big = 已打过几场灭宗大战；zt = 攻打护宗大阵的次数；hz = 宗主上次轰击大阵之日 */
  fall?: number; big?: number; zt?: number; hz?: number;
}
interface SWState { hold: Record<string, Hold>; wars: SWar[]; ten: Record<string, number>; truce: Record<string, number>; seq: number; init?: number; myDef?: Mode; myInc?: number;
  /** v0.62：各派护宗大阵的阵力 / 已除名的宗门 / 本宗附庸 / 本宗分舵 */
  zhen?: Record<string, { hp: number; m: number }>; gone?: Record<string, number>; vassal?: Record<string, number>; branch?: string[];
  /** v0.70 彩蛋：本宗亲手除名的宗门数；qun = 天下共讨已发动的日子 */
  mieN?: number; qun?: number }
interface Unit { ref: number; realm: number; stage: number; top: boolean }
interface Live {
  war: number; side: 0 | 1; wave: number; foes: Enemy[]; allies: Enemy[]; t: number; x: number; y: number;
  /** v0.62 大会战：rm / rf = 我方 / 敌方尚未上场的后备（名册真人）；m0 / f0 = 双方出战总数；km / kf = 已折损；rt / st / ft = 增援、两翼、助威的计时 */
  rm: Unit[]; rf: Unit[]; m0: number; f0: number; km: number; kf: number; rt: number; st: number; ft: number;
  ma: Mode; md: Mode; gate: boolean; zhen: boolean; ea: number;
}

export class SectWarSys {
  game: Game;
  private acc = 0; private pacc = 0; private dacc = 0;
  private battle: Live | null = null;
  private posted = new Map<string, string[]>(); private adopted = false;
  constructor(game: Game) { this.game = game; }
  get S(): SWState { const f = this.game.ws.flags as any; return (f.sw ??= { hold: {}, wars: [], ten: {}, truce: {}, seq: 0 }); }
  private get my(): MySect | undefined { return this.game.ws.mySect; }

  // ---------------------------------------------------------------- 宗门概况
  name(id: string) { return id === MY ? this.my?.name ?? '本宗' : sectTitle(id); }
  dao(id: string): Dao { return id === MY ? this.my?.dao ?? 'zhong' : sectDao(id) ?? (SECT_DEF.get(id)?.demon ? 'mo' : 'zhong'); }
  scale(id: string): Scale { return id === MY ? this.game.mysect.scale() : scaleOf(id, SECT_DEF.get(id)?.n); }
  cap(id: string) { return SCALE_CAP[this.scale(id)]; }
  size(id: string) { return id === MY ? this.my?.ds.length ?? 0 : SECT_DEF.get(id)?.n ?? 0; }
  alive(id: string) { return id === MY ? this.my?.ds.length ?? 0 : Math.max(0, this.size(id) - (((this.game.ws.flags as any).ros?.[id]?.d as number[] | undefined)?.length ?? 0)); }
  /** 参与天下争锋的宗门（地图上有山门的） */
  sects(map?: string): string[] {
    const out: string[] = [];
    const gone = this.S.gone ?? {};
    for (const d of SECT_DEFS) { const l = LOC_BY_ID.get(d.id); if (l && !gone[d.id] && (!map || l.map === map)) out.push(d.id); }
    const m = this.my; if (m && (!map || m.map === map) && LOC_BY_ID.get(MY)) out.push(MY);
    return out;
  }
  /** 能上阵的人（名册真人；已现身为 NPC 的、原设人物不算） */
  units(sid: string): Unit[] {
    const g = this.game;
    if (sid === MY) return (this.my?.ds ?? []).filter((d) => d.realm >= 1).map((d) => ({ ref: d.id, realm: d.realm, stage: d.stage, top: false }));
    const def = SECT_DEF.get(sid); if (!def) return [];
    const ro = g.roster, out: Unit[] = [];
    for (let i = 0; i < def.n; i++) {
      if (ro.isDead(sid, i) || ro.canonAt(sid, i) || g.npcs.byId.has(ro.idOf(sid, i))) continue;
      const m = member(def, i, ro.gen(sid, i));
      out.push({ ref: i, realm: m.realm, stage: m.stage, top: m.rank === '掌门' || m.rank === '太上长老' });
    }
    return out;
  }
  strength(sid: string) { let v = 0; for (const u of this.units(sid)) v += pwOf(u); return v; }
  private spent(sid: string) { return sid === MY ? this.units(MY).length < 4 : this.alive(sid) < this.size(sid) * 0.4; }
  /** 宗法：镇派心法折成的战阵 */
  doctrine(sid: string): Doctrine {
    const gid = sid === MY ? this.my?.gf : sectGongfa(sid) ?? EXTRA_GF[sid], g = gid ? GONGFA[gid] : undefined;
    if (!g) return { gf: '', name: '寻常战阵', atk: 1, def: 1 };
    const sch = Object.entries(g.school ?? {}).sort((x, y) => y[1] - x[1])[0];
    const z = sch ? ZHEN[sch[0]] : undefined, t = (g.tier ?? 1) * 0.02;
    const atk = 1 + (g.atk ?? 0) * 0.6 + (g.sword ?? 0) * 0.4 + (z?.[1] === 'atk' ? sch![1] * 0.35 : 0) + t;
    const def = 1 + (g.def ?? 0) * 0.6 + Math.max(0, g.hp ?? 0) * 0.4 + (g.mp ?? 0) * 0.2 + (z?.[1] === 'def' ? sch![1] * 0.35 : 0) + t;
    return { gf: g.name, name: z?.[0] ?? '两仪战阵', atk: Math.round(atk * 100) / 100, def: Math.round(def * 100) / 100 };
  }
  /** 本宗秘传（藏经阁里的招牌法术） */
  arts(sid: string): string[] {
    const ids = sid === MY ? (this.my?.lib ?? []) : (SECT_LIB[sid] ?? []).filter((s) => s.startsWith('scroll_art_')).map((s) => s.slice(11));
    return ids.map((a) => ARTS[a]?.name).filter(Boolean).slice(0, 4) as string[];
  }
  private docText(sid: string) { const d = this.doctrine(sid); return `${d.gf ? `《${d.gf}》· ` : ''}${d.name}（攻 ${d.atk >= 1 ? '+' : ''}${Math.round((d.atk - 1) * 100)}% · 守 ${d.def >= 1 ? '+' : ''}${Math.round((d.def - 1) * 100)}%）`; }

  // ---------------------------------------------------------------- 关系
  /** 两派天生的敌意（-1 = 不同图 / 同盟，永不开战） */
  base(a: string, b: string): number {
    const la = LOC_BY_ID.get(a), lb = LOC_BY_ID.get(b); if (!la || !lb || la.map !== lb.map || a === b) return -1;
    if ((a === MY || b === MY) && this.S.vassal?.[a === MY ? b : a]) return -1;   // 附庸不叛
    const feud = FEUD.has(key(a, b)), al = allyOf(a);
    if (al && al === allyOf(b) && !feud) return -1;
    let v = daoBase(this.dao(a), this.dao(b)) + (feud ? 30 : 0);
    const d = Math.hypot(la.x - lb.x, la.y - lb.y); v += d < 60 ? 10 : d < 130 ? 5 : 0;
    if (a === MY || b === MY) { const o = a === MY ? b : a; v += clamp(-((this.game.rel.S.sect as Record<string, number>)[o] ?? 0), -20, 60) * 0.5; }
    return v;
  }
  /** 紧张度 0–120（满 100 开战） */
  tension(a: string, b: string): number { const b0 = this.base(a, b); return b0 < 0 ? 0 : this.S.ten[key(a, b)] ?? Math.min(90, b0); }
  private relWord(t: number) { return t >= 100 ? '不死不休' : t >= 80 ? '剑拔弩张' : t >= 55 ? '摩擦不断' : t >= 30 ? '互有提防' : '相安无事'; }
  warOf(sid: string): SWar | undefined { return this.S.wars.find((w) => w.a === sid || w.b === sid); }
  private between(a: string, b: string) { return this.S.wars.find((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a)); }
  private att(w: SWar) { return w.ini === 0 ? w.a : w.b; }
  private def(w: SWar) { return w.ini === 0 ? w.b : w.a; }
  private tgtName(w: SWar) { const D = this.def(w); return w.tgt === D ? `${this.name(D)}山门` : LOC_BY_ID.get(w.tgt)?.name ?? '据点'; }
  private isZM(w: SWar) { const x = this.dao(w.a), y = this.dao(w.b); return (x === 'mo') !== (y === 'mo') && [x, y].some((d) => d === 'zheng' || d === 'fo'); }
  private title(w: SWar) { return `${this.name(w.a)} ⚔ ${this.name(w.b)}${this.isZM(w) ? '（正魔之争）' : ''}`; }
  /** 你在这场战事里站哪边 */
  sideOf(w: SWar): 0 | 1 | undefined { return w.a === MY ? 0 : w.b === MY ? 1 : w.side; }

  // ---------------------------------------------------------------- 据点
  holdsOf(sid: string): string[] { const S = this.S; return Object.keys(S.hold).filter((id) => S.hold[id].o === sid && LOC_BY_ID.has(id)); }
  private holdable(l: LocDef) { return (l.type === 'town' || l.type === 'city' || l.type === 'isle') && !SECT_DEF.has(l.id) && l.id !== MY && !GARRISON[l.id]; }
  /** 开局分地盘：各派就近派弟子镇守（大派先挑） */
  initHolds() {
    const S = this.S; if (S.init) return; S.init = 1;
    const ids = this.sects().filter((s) => s !== MY).sort((a, b) => SCALE_W[this.scale(a)] - SCALE_W[this.scale(b)] || this.size(b) - this.size(a));
    for (const sid of ids) {
      const G = LOC_BY_ID.get(sid)!, sc = this.scale(sid);
      const cand = ALL_LOCATIONS.filter((l) => l.map === G.map && this.holdable(l) && !S.hold[l.id]).map((l) => ({ l, d: Math.hypot(l.x - G.x, l.y - G.y) })).filter((c) => c.d < 110).sort((x, y) => x.d - y.d);
      for (const c of cand.slice(0, HOLDS[sc])) S.hold[c.l.id] = { o: sid, g: GAR[sc] };
    }
  }
  private nextTarget(att: string, def: string): string {
    const G = LOC_BY_ID.get(att), hs = this.holdsOf(def);
    if (!hs.length || !G) return def;
    return hs.map((id) => ({ id, d: Math.hypot(LOC_BY_ID.get(id)!.x - G.x, LOC_BY_ID.get(id)!.y - G.y) })).sort((x, y) => x.d - y.d)[0].id;
  }
  private myGar() { let n = 0; for (const id of this.holdsOf(MY)) n += this.S.hold[id].g; return n; }
  myFree() { return Math.max(0, this.units(MY).length - this.myGar()); }
  private clampMyGar() { let over = this.myGar() - this.units(MY).length; const S = this.S; for (const id of this.holdsOf(MY).sort((x, y) => S.hold[y].g - S.hold[x].g)) { if (over <= 0) break; const cut = Math.min(over, S.hold[id].g); S.hold[id].g -= cut; over -= cut; } }
  private holdIncome(id: string) { const l = LOC_BY_ID.get(id), h = this.S.hold[id]; return l && h ? Math.round((l.type === 'city' ? 450 : l.minor ? 120 : 240) * (1 + Math.min(20, h.g) / 20)) : 0; }

  // ---------------------------------------------------------------- 每日：紧张度、开战、战事推进
  daily(days: number) {
    const g = this.game, S = this.S; this.initHolds();
    this.dacc += days;
    if (this.dacc >= 5) { const dd = this.dacc; this.dacc = 0; this.drift(dd); }
    for (const w of [...S.wars]) this.tickWar(w);
    const m = this.my;
    if (m) {
      S.myInc ??= g.day;
      if (g.day - S.myInc >= 30) { const mo = Math.floor((g.day - S.myInc) / 30); S.myInc += mo * 30; let v = 0; for (const id of this.holdsOf(MY)) v += this.holdIncome(id);
        for (const id of S.branch ?? []) v += BRANCH[this.scale(id)];
        let vs = 0; for (const id of Object.keys(S.vassal ?? {})) vs += VASSAL[this.scale(id)];
        // v0.62：据点、分舵的进项按抽成归宗主；附庸的月供径入宗主供奉
        const tb = Math.round(v * (m.cut ?? 0.3)) * mo + vs * mo;
        m.stones += v * mo - (tb - vs * mo); m.tribute += tb; m.earned = (m.earned ?? 0) + tb; }
      this.clampMyGar();
    }
  }
  private canWar(sid: string) {
    if (this.warOf(sid)) return false;
    if (sid === MY) { const m = this.my!; return this.units(MY).length >= 12 && this.game.day - m.founded > 2 * YEAR; }
    return this.alive(sid) >= this.size(sid) * 0.6;
  }
  private drift(dd: number) {
    const g = this.game, S = this.S, maps = new Set(this.sects().map((s) => LOC_BY_ID.get(s)!.map as string));
    const grace = g.day < GRACE;   // 开局头三年天下太平：只有摩擦，不起大战
    for (const m of maps) {
      const ids = this.sects(m), hot: [string, string, number][] = [], warm: [string, string][] = [];
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i], b = ids[j], b0 = this.base(a, b); if (b0 < 20) continue;
        const k = key(a, b); if ((S.truce[k] ?? 0) > g.day || this.between(a, b)) continue;
        let cur = S.ten[k] ?? clamp(b0 + rand(0, 18), 0, 92);
        cur = Math.min(grace ? 99 : 120, cur + dd * (b0 / 30) * 0.025 * rand(0.3, 1.7)); S.ten[k] = cur;
        warm.push([a, b]); if (cur >= 100) hot.push([a, b, cur]);
      }
      // 边界摩擦：只说眼前这张图上的事
      if (m === ACTIVE_MAP && warm.length && Math.random() < 1 - Math.pow(1 - 1 / 50, dd)) {
        const [a, b] = pick(warm), k = key(a, b), hs = [...this.holdsOf(a), ...this.holdsOf(b)], at = hs.length ? LOC_BY_ID.get(pick(hs))!.name : '两派交界处';
        S.ten[k] = Math.min(grace ? 99 : 120, (S.ten[k] ?? 0) + rand(5, 12));
        g.news(`${this.name(a)}与${this.name(b)}的弟子在${at}${pick(['争夺一处灵石矿脉', '为一株灵药', '因口角', '为抢一头妖兽'])}大打出手，各有死伤。两派${this.relWord(S.ten[k])}。`, 'rumor');
      }
      hot.sort((x, y) => y[2] - x[2]);
      for (const [a, b] of hot) {
        if (S.wars.filter((w) => LOC_BY_ID.get(w.a)?.map === m).length >= 2) break;
        if (!this.canWar(a) || !this.canWar(b)) continue;
        // 强者先动手；玩家的宗门不会被代为宣战
        let A = this.strength(a) >= this.strength(b) ? a : b; if (Math.random() < 0.3) A = A === a ? b : a; if (A === MY) A = a === MY ? b : a;
        const D = A === a ? b : a;
        this.declare(A, D, FEUD.get(key(a, b)) ?? ((this.dao(a) === 'mo') !== (this.dao(b) === 'mo') ? '正魔不两立' : pick(['争夺灵脉矿藏', '地盘之争', '门人被杀的血仇'])));
      }
    }
  }
  /**
   * v0.70 彩蛋「天下共讨」：自立宗门后亲手除名两派以上，天下宗门人人自危——
   * 本图还在的各派（附庸除外）一齐向本宗宣战，只此一回。
   */
  maybeCoalition(): boolean {
    const g = this.game, S = this.S, m = this.my;
    if (!m || S.qun || (S.mieN ?? 0) < 2) return false;
    S.qun = g.day;
    const foes = this.sects(m.map).filter((s) => s !== MY && !S.vassal?.[s] && !this.between(s, MY));
    for (const s of foes) this.declare(s, MY, '天下共讨——此宗连灭两派，人人自危', MY);
    g.news(`天下震动！${m.name}连灭两派，${foes.length} 家宗门歃血为盟，共讨${m.name}。`, 'canon');
    g.openDialog({ speaker: '天下大势', title: '天下共讨', mood: 'danger',
      text: `${m.name}连灭两派的消息传遍${MAP_NAME[m.map]}——\n\n各派掌门连夜聚首，歃血为盟：「今日是他们，明日便是我们！」\n\n${foes.length} 家宗门同时向${m.name}宣战，兵锋齐指你的山门。\n\n（彩蛋「天下共讨」：守住山门、各个击破，或者……就此退隐？）`,
      options: [{ label: '来吧！', tone: 'bad', act: () => null }] });
    (g.mysect as any).log(`天下共讨：${foes.length} 家宗门同时宣战。`);
    return true;
  }
  /** 宣战 */
  declare(a: string, b: string, why: string, tgt?: string): SWar {
    const g = this.game, S = this.S; this.initHolds();
    const w: SWar = { id: ++S.seq, a, b, why, start: g.day, ini: 0, tgt: tgt ?? this.nextTarget(a, b), score: 0, wave: 0, next: g.day + rand(8, 14), streak: 0, la: 0, lb: 0, log: [] };
    S.wars.push(w); S.ten[key(a, b)] = 110;
    const zm = this.isZM(w);
    g.news(`${this.name(a)}向${this.name(b)}宣战——${why}。${zm ? '正魔两道各派纷纷站队，' : ''}${this.name(a)}（${SCALE_NAME[this.scale(a)]}）召集门下弟子，兵锋直指${this.tgtName(w)}。`, 'rumor');
    // 正魔开战，同道各派也跟着绷紧
    if (zm) for (const x of this.sects(LOC_BY_ID.get(a)?.map)) for (const y of [a, b]) { const k = key(x, y); if (x !== y && this.base(x, y) >= 30 && S.ten[k] !== undefined && !this.between(x, y)) S.ten[k] = Math.min(99, S.ten[k] + 4); }
    // 召集
    const mine = g.ws.sect?.id;
    if (mine && g.hero.realm >= 2) {
      const side: 0 | 1 | undefined = mine === a ? 0 : mine === b ? 1 : undefined;
      if (side !== undefined) {
        w.called = true; const sn = sectTitle(mine);
        g.war.send({ kind: '召集', from: `${sn}执法堂`, sw: w.id, side, text: `${why}。${this.name(a)}已向${this.name(b)}宣战，战场在${this.tgtName(w)}一带。\n\n${sn}门下弟子，凡筑基以上，速往前线听候调遣——斩敌记功，战功可换丹药法宝。临阵不至者，按门规论处。`, until: g.day + 90 });
      }
    }
    if (b === MY) { g.toast(`${this.name(a)}向${this.name(b)}宣战了！（宗门面板 → 宗门战事）`, 'warn'); (g.mysect as any).log(`${this.name(a)}以「${why}」为由，向本宗宣战。`); }
    if (a === MY) { w.lastAct = g.day; w.next = g.day; (g.mysect as any).log(`本宗向${this.name(b)}宣战。`); }
    return w;
  }
  private tickWar(w: SWar) {
    const g = this.game, S = this.S; let guard = 0;
    if (this.battle?.war === w.id) return;   // 正在亲身厮杀：等这一阵打完
    if (w.fall) { if (g.day - w.fall > 120) this.verdict(w, 'pei'); return; }   // 败者听候发落；久不发落，按赔款了结
    while (S.wars.includes(w) && g.day >= w.next && guard++ < 4) {
      const A = this.att(w), D = this.def(w);
      if (A === MY) {
        // 你是攻方：等你下令；久不出兵，对面反客为主
        if (g.day - (w.lastAct ?? w.start) > 45) { w.ini = (1 - w.ini) as 0 | 1; w.streak = 0; w.tgt = this.nextTarget(D, MY); w.next = g.day + rand(4, 8); this.note(w, `${this.name(MY)}久不出兵，${this.name(D)}反客为主，兵锋指向${this.tgtName(w)}。`, true); }
        break;
      }
      this.clash(w);
    }
    if (S.wars.includes(w) && g.day - w.start > 3 * YEAR) this.end(w, w.score >= 0 ? 0 : 1, '久战不决，两家各自罢兵', true);
  }
  private note(w: SWar, txt: string, loud = false) {
    const g = this.game; w.log.push(`第 ${Math.floor(g.day / YEAR) + 1} 年：${txt}`); if (w.log.length > 8) w.log.splice(0, w.log.length - 8);
    const mine = this.sideOf(w) !== undefined || w.a === g.ws.sect?.id || w.b === g.ws.sect?.id;
    if (mine) g.toast(txt, 'warn');
    if (loud && (mine || LOC_BY_ID.get(w.a)?.map === ACTIVE_MAP)) g.news(txt, 'rumor');
  }

  // ---------------------------------------------------------------- 接战（推演）
  private aiMode(w: SWar, sid: string, foe: string, attacking: boolean, gate: boolean): Mode {
    const g = this.game, last = (sid === w.a ? w.allA : w.allB) ?? -999;
    if (gate) return 'all';                                   // 山门决战：双方都是全宗压上
    if (g.day - last < 40) return 'wave';                     // 刚倾巢打过一场，还在休整
    const r = this.strength(sid) / Math.max(1, this.strength(foe));
    if (attacking && r > 1.6) return 'all';                   // 实力悬殊：一网打尽
    if (this.alive(sid) < this.size(sid) * 0.55 && Math.random() < 0.3) return 'all';   // 孤注一掷
    if (!attacking && r < 0.4 && Math.random() < 0.5) return 'hold';
    return Math.random() < 0.12 ? 'all' : 'wave';
  }
  /** 点兵：all = 全宗上下一个不留，连掌门太上一并压上；wave = 一波（want = 想派多少人；守方照着来敌的人数迎战）；hold = 只有镇守弟子 */
  private commit(sid: string, mode: Mode, attacking: boolean, gar: number, want?: number): Unit[] {
    const us = this.units(sid), n0 = us.length; if (!n0) return [];
    if (mode === 'all') return us.sort((a, b) => pwOf(b) - pwOf(a));
    const pool = shuffle(us.filter((u) => !u.top));
    let n: number;
    if (attacking) n = sid === MY ? Math.min(this.myFree(), want ?? Math.max(30, Math.round(this.myFree() * 0.4))) : want ?? clamp(Math.round(n0 * (mode === 'hold' ? 0.12 : 0.3)), 20, 120);
    else n = mode === 'hold' ? gar : Math.max(gar + Math.round(n0 * 0.1), Math.round((want ?? 0) * rand(0.85, 1.15)));
    if (!attacking && sid === MY) n = Math.min(n, this.myFree() + gar);
    return pool.slice(0, Math.max(1, Math.min(pool.length, Math.round(n))));
  }
  /** 名册上某人的称呼（战报用） */
  private uName(sid: string, u: Unit): string {
    if (sid === MY) { const d = this.my?.ds.find((x) => x.id === u.ref); return d ? `${d.name}（${realmName(d.realm, d.stage)}）` : '一名弟子'; }
    const def = SECT_DEF.get(sid); if (!def) return '一名修士';
    const m = member(def, u.ref, this.game.roster.gen(sid, u.ref)); return `${m.rank}${m.name}（${realmName(Math.min(m.realm, REALMS.length - 1), m.stage)}）`;
  }
  /** 折损：n = 人数，hi = 其中筑基以上，top = 折掉的人里最强的一个 */
  private casualties(sid: string, us: Unit[], frac: number): { n: number; hi: number; top: string } {
    const dead = us.filter((u) => Math.random() < frac * (u.realm >= 4 ? 0.2 : u.realm === 3 ? 0.45 : u.realm === 2 ? 0.8 : 1));
    const top = dead.length ? this.uName(sid, dead.reduce((x, y) => (pwOf(y) > pwOf(x) ? y : x))) : '';
    this.kill(sid, dead.map((u) => u.ref));
    return { n: dead.length, hi: dead.filter((u) => u.realm >= 2).length, top };
  }
  private kill(sid: string, refs: number[]) {
    if (!refs.length) return;
    const g = this.game;
    if (sid === MY) {
      const m = this.my; if (!m) return; const ids = new Set(refs), fallen = m.ds.filter((d) => ids.has(d.id));
      m.ds = m.ds.filter((d) => !ids.has(d.id)); this.clampMyGar();
      if (fallen.length && !this.battle) (g.mysect as any).log(`宗门战事：${fallen.slice(0, 4).map((d) => d.name).join('、')}${fallen.length > 4 ? `等 ${fallen.length} 人` : ''}战死。`);
      return;
    }
    const f = g.ws.flags as any; f.ros ??= {}; const st = (f.ros[sid] ??= {}); st.d ??= [];
    for (const i of refs) if (!st.d.includes(i)) st.d.push(i);
  }
  private allyMul(sid: string, w: SWar) {
    if (sid === MY) return 1 + 0.08 * Math.min(4, Object.keys(this.S.vassal ?? {}).length);   // 附庸出兵助阵
    if (!this.isZM(w)) return 1;
    const al = allyOf(sid), m = LOC_BY_ID.get(sid)?.map; if (!al) return 1;
    return 1 + 0.06 * Math.min(3, this.sects(m).filter((x) => x !== sid && allyOf(x) === al && !this.warOf(x)).length);
  }
  private zhen(sid: string) { return sid === MY ? (this.my?.halls.zhen ?? 0) * 0.15 : { da: 0.3, zhong: 0.15, xiao: 0 }[this.scale(sid)]; }
  // ---------------------------------------------------------------- v0.62 护宗大阵
  private zst(sid: string) {
    const S = this.S; S.zhen ??= {};
    let z = S.zhen[sid];
    if (!z) { const m = Math.round(Math.max(120, this.strength(sid)) * { da: 0.9, zhong: 0.6, xiao: 0.4 }[this.scale(sid)]); z = S.zhen[sid] = { hp: m, m }; }
    return z;
  }
  zhenCap(sid: string) { return sid === MY ? this.game.mysect.zhenMax() : this.zst(sid).m; }
  zhenHp(sid: string) { return sid === MY ? Math.min(this.my?.zhenE ?? 0, this.zhenCap(MY)) : this.zst(sid).hp; }
  private zhenSet(sid: string, v: number) { if (sid === MY) { if (this.my) this.my.zhenE = Math.max(0, v); } else this.zst(sid).hp = Math.max(0, v); }
  zhenMode(sid: string): ZhenMode { if (sid === MY) return this.my?.zhenMode ?? 'shou'; const d = this.doctrine(sid); return d.name.includes('幻') ? 'huan' : d.atk > d.def ? 'sha' : 'shou'; }
  zhenName(sid: string) { return sid === MY ? ZHEN_MODE[this.zhenMode(MY)][0] : this.doctrine(sid).name.replace(/战?大?阵$/, '') + '护宗大阵'; }

  /** 攻守双方的打法：一方倾巢而出，另一方也只能尽出迎战——这就是灭宗大战 */
  private modes(w: SWar, opt: { ma?: Mode; md?: Mode }, gate: boolean): [Mode, Mode] {
    const S = this.S, A = this.att(w), D = this.def(w);
    let ma: Mode = opt.ma ?? this.aiMode(w, A, D, true, gate);
    let md: Mode = opt.md ?? (D === MY ? (gate ? 'all' : S.myDef ?? 'wave') : this.aiMode(w, D, A, false, gate));
    if (gate) { md = 'all'; if (A !== MY) ma = 'all'; }                              // 打到山门：守方退无可退；别派攻山也必是倾巢
    else if (A === MY) md = ma === 'all' ? 'all' : md === 'all' ? 'wave' : md;       // 你遣一波人去，对面也只出一波；你倾巢，对面必倾巢
    else if (D === MY) { if (md === 'all') ma = 'all'; }                             // 你全宗回援，来敌也只能全宗压上
    else if (ma === 'all' || md === 'all') { ma = 'all'; md = 'all'; }
    return [ma, md];
  }
  /** 打一阵（推演）。返回战报。ma / md：攻守双方的打法；n：攻方想派多少人 */
  clash(w: SWar, opt: { ma?: Mode; md?: Mode; n?: number } = {}): string {
    const g = this.game, S = this.S, A = this.att(w), D = this.def(w);
    if (w.tgt !== D && S.hold[w.tgt]?.o !== D) w.tgt = this.nextTarget(A, D);
    const gate = w.tgt === D;
    if (gate && this.zhenHp(D) > 0) return this.siege(w, opt);
    const [ma, md] = this.modes(w, opt, gate), big = ma === 'all' && md === 'all';
    const gar = gate ? Math.round(this.alive(D) * 0.3) : S.hold[w.tgt]?.g ?? 0;
    const ua = this.commit(A, ma, true, 0, opt.n), ud = this.commit(D, md, false, gar, ua.length);
    const da = this.doctrine(A), dd = this.doctrine(D), sum = (us: Unit[]) => us.reduce((v, u) => v + pwOf(u), 0);
    let pa = sum(ua) * da.atk * this.allyMul(A, w) * (this.dao(A) === 'fo' && this.dao(D) === 'mo' ? 1.1 : 1) * (ma === 'all' ? 1.1 : 1) * rand(0.85, 1.15);
    let pd = sum(ud) * dd.def * this.allyMul(D, w) * (gate ? 1.3 : 1.2) * (md === 'all' ? 1.1 : 1) * rand(0.85, 1.15);
    // 宗主压阵
    if (A === MY && ma === 'all') pa += PW[g.hero.realm] * 2;
    if (D === MY && (md === 'all' || gate)) pd += PW[g.hero.realm] * 2;
    pa = Math.max(pa, 0.01); pd = Math.max(pd, 0.01);
    const win = pa > pd, r = Math.max(pa / pd, pd / pa), bk = big ? 1.5 : 1;
    // 败方折损两成起、悬殊则更惨；灭宗大战再加五成（败方至多折八成半）
    const lf = Math.min(big ? 0.85 : 0.55, (0.2 + 0.11 * Math.log2(r)) * bk), wf = Math.min(0.4, Math.max(0.03, 0.15 / r) * bk);
    const best = (sid: string, us: Unit[]) => (us.length ? this.uName(sid, us.reduce((x, y) => (pwOf(y) > pwOf(x) ? y : x))) : '');
    const ha = best(A, ua), hd = best(D, ud);
    const ca = this.casualties(A, ua, win ? wf : lf), cd = this.casualties(D, ud, win ? lf : wf);
    if (w.ini === 0) { w.la += ca.n; w.lb += cd.n; } else { w.lb += ca.n; w.la += cd.n; }
    if (ma === 'all') { if (A === w.a) w.allA = g.day; else w.allB = g.day; }
    if (md === 'all') { if (D === w.a) w.allA = g.day; else w.allB = g.day; }
    w.next = g.day + (big ? rand(20, 30) : rand(5, 10));
    const an = this.name(A), dn = this.name(D), tn = this.tgtName(w), head = big ? '灭宗大战' : `第 ${w.wave + 1} 阵`, res = win ? `${an}胜` : `${dn}守住了`;
    const lines = [
      `【${head} · ${tn}】`,
      `${an} ${ua.length} 人${ATK_NAME[ma]}${A === MY && ma === 'all' ? '，宗主亲自压阵' : ''}；${dn} ${ud.length} 人${DEF_NAME[md]}${D === MY && (md === 'all' || gate) ? '，宗主坐镇' : ''}。`,
      `${an}结「${da.name}」，${dn}布「${dd.name}」，两军${pick(['甫一照面便杀作一团', '法宝灵光遮天蔽日', '飞剑如蝗、符箓如雨', '自辰时杀到日暮'])}。`,
      win && cd.top ? `· ${an}${ha}阵斩${dn}${cd.top}` : !win && ca.top ? `· ${dn}${hd}阵斩${an}${ca.top}` : '',
      win && ca.top ? `· ${an}${ca.top}力战而亡` : !win && cd.top ? `· ${dn}${cd.top}力战而亡` : '',
      `战果：${res}。${an}折 ${ca.n} 人${ca.hi ? `（筑基以上 ${ca.hi}）` : ''}，${dn}折 ${cd.n} 人${cd.hi ? `（筑基以上 ${cd.hi}）` : ''}。`,
    ].filter(Boolean);
    this.note(w, `${head} · ${tn}：${an} ${ua.length} 人${ATK_NAME[ma]}，${dn} ${ud.length} 人${DEF_NAME[md]}——${res}。${an}折 ${ca.n} 人，${dn}折 ${cd.n} 人。`);
    this.after(w, win, big);
    return lines.join('\n');
  }
  /** 攻打护宗大阵（推演）：大阵未破，守方躲在阵后毫发无伤；攻方每冲一次都要丢下一批人。hero = 宗主亲自轰击 */
  siege(w: SWar, opt: { ma?: Mode; n?: number; hero?: boolean } = {}): string {
    const g = this.game, S = this.S, A = this.att(w), D = this.def(w), zm = this.zhenMode(D), hp0 = this.zhenHp(D), mx = Math.max(1, this.zhenCap(D)), zn = this.zhenName(D);
    let dmg = 0, ka = 0, n = 0;
    if (opt.hero) dmg = pwOf(g.hero) * 4 * rand(0.85, 1.2);
    else {
      const ma: Mode = opt.ma ?? (A === MY ? 'wave' : 'all'), ua = this.commit(A, ma, true, 0, opt.n); n = ua.length;
      dmg = ua.reduce((v, u) => v + pwOf(u), 0) * this.doctrine(A).atk * this.allyMul(A, w) * 0.5 * rand(0.85, 1.15);
      if (A === MY && ma === 'all') dmg += PW[g.hero.realm] * 2;
      ka = this.casualties(A, ua, zm === 'sha' ? 0.13 : 0.06).n;
      if (ma === 'all') { if (A === w.a) w.allA = g.day; else w.allB = g.day; }
    }
    if (zm === 'shou') dmg *= 0.7;
    const hp = Math.max(0, hp0 - dmg); this.zhenSet(D, hp);
    if (w.ini === 0) w.la += ka; else w.lb += ka;
    w.zt = (w.zt ?? 0) + 1; w.wave++;
    if (!opt.hero) w.next = g.day + (zm === 'huan' ? rand(14, 22) : rand(7, 11));
    const an = this.name(A), dn = this.name(D), who = opt.hero ? `${an}宗主亲自出手，` : `${an} ${n} 人`;
    const txt = hp <= 0
      ? `【破阵 · ${dn}山门】\n${who}猛攻护宗大阵「${zn}」——光幕寸寸碎裂，大阵告破！${ka ? `阵前折 ${ka} 人。` : ''}\n${dn}山门之内再无屏障，接下来便是双方尽出的灭宗大战。`
      : `【破阵 · ${dn}山门】\n${who}猛攻护宗大阵「${zn}」，光幕剧震，阵力尚余 ${Math.max(1, Math.round((hp / mx) * 100))}%。${ka ? `${dn}弟子躲在阵后以逸待劳，${an}阵前折 ${ka} 人。` : ''}`;
    this.note(w, txt.replace(/\n/g, ' '), hp <= 0);
    if (hp > 0 && A !== MY && w.zt >= 5) this.end(w, (1 - w.ini) as 0 | 1, `${an}久攻${dn}护宗大阵不下，锐气尽失，罢兵而去`, true);
    else this.settle(w);
    return txt;
  }
  /** 一阵打完：夺据点 / 破山门 / 攻守易势 / 力竭求和。big = 这一阵是灭宗大战 */
  private after(w: SWar, win: boolean, big = false) {
    const S = this.S; if (!S.wars.includes(w)) return;
    const A = this.att(w), D = this.def(w), gate = w.tgt === D, sgn = w.ini === 0 ? 1 : -1, L = LOC_BY_ID.get(w.tgt);
    w.wave++;
    if (big) w.big = (w.big ?? 0) + 1;
    if (win) {
      w.score = clamp(w.score + sgn * (gate ? 40 : big ? 35 : 15), -100, 100); w.streak = 0;
      if (gate) { this.gateFall(w); return; }
      if (big) {
        // 灭宗大战野战得胜：守方全线崩溃，所有据点一并易手，兵临山门
        const hs = this.holdsOf(D);
        for (const id of hs) S.hold[id] = { o: A, g: A === MY ? Math.min(12, this.myFree()) : GAR[this.scale(A)] };
        this.note(w, `灭宗大战，${this.name(D)}全线崩溃：${hs.map((id) => LOC_BY_ID.get(id)!.name).join('、') || '外围'}尽数易手，${this.name(A)}兵临${this.name(D)}山门！`, true);
        w.tgt = D; w.zt = 0;
      } else {
        S.hold[w.tgt] = { o: A, g: A === MY ? Math.min(20, this.myFree()) : GAR[this.scale(A)] };
        this.note(w, `${this.name(A)}夺下${L?.name ?? '据点'}，留弟子镇守。`, true);
        w.tgt = this.nextTarget(A, D); if (w.tgt === D) w.zt = 0;
      }
    } else {
      w.score = clamp(w.score - sgn * (big ? 30 : 10), -100, 100); w.streak++;
      if (big || w.streak >= 2) { w.ini = (1 - w.ini) as 0 | 1; w.streak = 0; w.zt = 0; w.tgt = this.nextTarget(D, A); this.note(w, `${this.name(A)}${big ? '倾巢而出却大败而归' : '连攻不克'}，${this.name(D)}趁势反攻，兵锋指向${this.tgtName(w)}。`, true); }
    }
    this.settle(w);
  }
  /** 力竭：哪一方元气大伤便乞和——败给你的，听凭你发落 */
  private settle(w: SWar) {
    const S = this.S;
    for (const k of [0, 1] as const) {
      const sid = k === 0 ? w.a : w.b; if (!S.wars.includes(w) || w.fall || !this.spent(sid)) continue;
      const W = k === 0 ? w.b : w.a;
      if (W === MY) this.pend(w, `${this.name(sid)}元气大伤，遣使乞和`); else this.end(w, (1 - k) as 0 | 1, `${this.name(sid)}元气大伤，遣使求和`);
    }
  }
  /** 山门告破 */
  private gateFall(w: SWar) {
    const A = this.att(w), D = this.def(w);
    if (A === MY) { this.pend(w, `${this.name(D)}山门告破`); return; }
    if (D === MY) this.myGateFall(A);
    this.end(w, w.ini, `${this.name(A)}攻破${this.name(D)}山门`);
  }
  /** 自家山门被破：宗主尚在，道统不绝——但阵基被毁、门人星散、据点尽失 */
  private myGateFall(A: string) {
    const g = this.game, S = this.S, m = this.my; if (!m) return;
    const n0 = m.ds.length;
    m.ds = m.ds.filter((d) => d.rank >= 2 || Math.random() > 0.35);
    if (m.halls.zhen > 0) m.halls.zhen--;
    m.zhenE = 0; m.fame *= 0.75;
    for (const id of this.holdsOf(MY)) S.hold[id] = { o: A, g: SECT_DEF.has(A) ? GAR[this.scale(A)] : 8 };
    (g.mysect as any).log(`山门被${this.name(A)}攻破：护宗大阵阵基被毁，门人星散 ${n0 - m.ds.length} 人，据点尽失。`);
    g.toast(`${m.name}山门告破！护宗大阵被毁，门人星散 ${n0 - m.ds.length} 人——宗主尚在，道统不绝。`, 'warn');
  }
  /** 败者听候发落 */
  private pend(w: SWar, how: string) {
    const g = this.game; w.fall = g.day; w.next = g.day + 1e6;
    this.note(w, `${how}——是和是灭，听凭${this.name(MY)}宗主发落。（宗门面板 → 宗门战事）`, true);
    try { if (!g.modal) g.openDialog(this.verdictNode(w)); } catch { /* */ }
  }
  /** 发落败者：赔款罢兵 / 纳为附庸 / 收编残部 / 灭其道统 */
  private verdict(w: SWar, kind: 'pei' | 'fu' | 'bian' | 'mie'): string {
    const g = this.game, S = this.S, m = this.my; if (!m || !S.wars.includes(w)) return '此战已了。';
    const mySide: 0 | 1 = w.a === MY ? 0 : 1, foe = mySide === 0 ? w.b : w.a, fn = this.name(foe), sc = this.scale(foe), cut = m.cut ?? 0.3;
    w.fall = undefined;
    if (kind === 'pei') { this.end(w, mySide, `${fn}纳款求和`); return `${fn}纳款求和，割地赔款。两家五年之内不再动兵。`; }
    if (kind === 'fu') {
      this.end(w, mySide, `${fn}俯首称臣，奉${m.name}为上宗`);
      (S.vassal ??= {})[foe] = g.day; (g.mysect as any).log(`${fn}俯首称臣，成为本宗附庸。`);
      return `${fn}自此奉${m.name}为上宗：每月上供灵石 ${VASSAL[sc]}（径入宗主供奉）；本宗再有战事，${fn}出兵助阵（每家附庸 +8% 战力）。两家永不相攻。`;
    }
    // 收编 / 灭宗：这一派就此除名
    const us = this.units(foe), hs = this.holdsOf(foe);
    let joined = 0;
    if (kind === 'bian') {
      const def = SECT_DEF.get(foe), room = Math.max(0, g.mysect.cap() - m.ds.length);
      if (def) for (const u of shuffle(us.slice()).slice(0, Math.min(room, Math.round(us.length * 0.5)))) {
        const mm = member(def, u.ref, g.roster.gen(foe, u.ref)), realm = clamp(mm.realm, 0, 4);
        m.ds.push({ id: m.seq++, name: mm.name, sex: mm.sex, age: [16, 24, 60, 180, 420][realm] * rand(0.8, 1.4), root: 2 + Math.floor(Math.random() * 3), realm, stage: Math.min(mm.stage, REALMS[realm].stages.length - 1), exp: Math.random() * 0.5, loyal: rand(30, 50), rank: realm >= 3 ? 3 : realm >= 2 ? 1 : 0, job: 'xiu', joined: g.day, arts: 0 });
        joined++;
      }
    }
    this.kill(foe, us.map((u) => u.ref));   // 名册清空：战死的、改换门庭的、星散的，都不再是这一派的人
    for (const id of hs) S.hold[id] = { o: MY, g: Math.min(10, this.myFree()) };
    (S.gone ??= {})[foe] = g.day; S.branch ??= []; if (!S.branch.includes(foe)) S.branch.push(foe);
    S.mieN = (S.mieN ?? 0) + 1;
    if (S.vassal) delete S.vassal[foe];
    if (S.zhen) delete S.zhen[foe];
    const loot = Math.round(MIE_LOOT[sc] * (kind === 'mie' ? 1 : 0.4)), tb = Math.round(loot * cut);
    m.stones += loot - tb; m.tribute += tb; m.earned = (m.earned ?? 0) + tb; m.wins++;
    m.fame += { da: 300, zhong: 150, xiao: 70 }[sc] * (kind === 'mie' ? 1 : 0.7);
    const got: string[] = [];
    if (kind === 'mie') {
      for (const id of shuffle((SECT_LIB[foe] ?? []).filter((x) => ITEMS[x])).slice(0, 4)) { (g.mysect as any).gift(id, 1); got.push(ITEMS[id].name); }
      const d = this.dao(foe), al = allyOf(foe);
      if (d === 'mo') g.ws.rep += 12; else g.ws.rep -= m.dao === 'zheng' ? 25 : m.dao === 'zhong' ? 12 : 6;
      // 天下震动：同盟、同道各派对本宗的敌意上涨
      for (const x of this.sects(LOC_BY_ID.get(MY)?.map)) { if (x === MY || this.base(MY, x) < 0) continue; const add = d === 'mo' ? (this.dao(x) === 'mo' ? 20 : 0) : al && allyOf(x) === al ? 30 : 10; if (add) S.ten[key(MY, x)] = Math.min(99, this.tension(MY, x) + add); }
    }
    // 收场
    const i = S.wars.indexOf(w); if (i >= 0) S.wars.splice(i, 1);
    for (const j of g.war.inbox) if (j.sw === w.id) j.done = true;
    if (this.battle?.war === w.id) { this.battle = null; g.combat.dismissAllies((e) => e.tag === 'war:ally'); }
    for (const o of S.wars.filter((x) => x.a === foe || x.b === foe)) this.end(o, o.a === foe ? 1 : 0, `${fn}已为${m.name}所灭`, true);
    const holds = hs.map((id) => LOC_BY_ID.get(id)!.name).join('、');
    if (kind === 'mie') {
      g.news(`${m.name}攻破${fn}山门，鸡犬不留——${fn}道统断绝，自此除名！天下各派为之震动。`, 'rumor');
      (g.mysect as any).log(`灭${fn}满门：搜刮库藏灵石 ${loot}${got.length ? `，得${got.join('、')}` : ''}；其山门改作本宗分舵。`);
      g.toast(`${fn}自此除名！得灵石 ${loot}（其中 ${tb} 归宗主）`, 'good');
      return `${fn}满门尽灭，道统断绝。\n\n· 搜刮库藏：灵石 ${loot}（按抽成 ${tb} 径入宗主供奉）${got.length ? `\n· 藏经阁秘卷：${got.join('、')}（在库房收取）` : ''}${holds ? `\n· 据点尽归本宗：${holds}` : ''}\n· ${fn}山门改作本宗分舵，月入 ${BRANCH[sc]} 灵石\n· 宗门威望大涨；${this.dao(foe) === 'mo' ? '诛灭魔宗，正道称快。' : '屠戮同道，天下侧目——各派对本宗的敌意上涨。'}`;
    }
    g.news(`${fn}山门告破，残部尽数改投${m.name}——${fn}就此除名。`, 'rumor');
    (g.mysect as any).log(`收编${fn}残部 ${joined} 人，得灵石 ${loot}；其山门改作本宗分舵。`);
    g.toast(`收编${fn}残部 ${joined} 人，${fn}就此除名。`, 'good');
    return `${fn}就此除名，残部 ${joined} 人改换门庭，拜入${m.name}（降卒忠诚不高，多讲法、多指点）。\n\n· 接收库藏：灵石 ${loot}（按抽成 ${tb} 径入宗主供奉）${holds ? `\n· 据点尽归本宗：${holds}` : ''}\n· ${fn}山门改作本宗分舵，月入 ${BRANCH[sc]} 灵石`;
  }
  /** 战事落幕。soft = 罢兵 / 求和（不割地） */
  end(w: SWar, winner: 0 | 1, how: string, soft = false) {
    const g = this.game, S = this.S, i = S.wars.indexOf(w); if (i < 0) return; S.wars.splice(i, 1);
    const W = winner === 0 ? w.a : w.b, L = winner === 0 ? w.b : w.a, k = key(w.a, w.b), GW = LOC_BY_ID.get(W);
    S.ten[k] = 15; S.truce[k] = g.day + 5 * YEAR;
    w.fall = undefined; if (S.zhen) { delete S.zhen[w.a]; delete S.zhen[w.b]; }   // 战后各派重整护宗大阵
    const lost = this.holdsOf(L).map((id) => ({ id, d: GW ? Math.hypot(LOC_BY_ID.get(id)!.x - GW.x, LOC_BY_ID.get(id)!.y - GW.y) : 0 })).sort((x, y) => x.d - y.d);
    const cede = soft ? [] : lost.slice(0, Math.ceil(lost.length / 2));
    for (const c of cede) S.hold[c.id] = { o: W, g: W === MY ? Math.min(6, this.myFree()) : GAR[this.scale(W)] };
    g.news(`${this.name(w.a)}与${this.name(w.b)}之战落幕：${how}。${this.name(W)}胜${cede.length ? `，${this.name(L)}割让${cede.map((c) => LOC_BY_ID.get(c.id)!.name).join('、')}` : ''}。此役${this.name(w.a)}折损 ${w.la} 人，${this.name(w.b)}折损 ${w.lb} 人。`, 'rumor');
    const m = this.my;
    if (m && W === MY) {
      const sc = this.scale(L), loot = Math.round(END_LOOT[sc] * (soft ? 0.3 : 1)), tb = Math.round(loot * (m.cut ?? 0.3));
      m.stones += loot - tb; m.tribute += tb; m.earned = (m.earned ?? 0) + tb; m.fame += { da: 120, zhong: 60, xiao: 30 }[sc] * (soft ? 0.4 : 1); m.wins++;
      (g.mysect as any).log(`与${this.name(L)}一战得胜（${how}），得赔款灵石 ${loot}，宗门威望大涨。`); g.toast(`${m.name}战胜${this.name(L)}！得赔款 ${loot} 灵石，威望大涨`, 'good');
    } else if (m && L === MY) {
      const lose = Math.round(m.stones * (soft ? 0.2 : 0.45)); m.stones -= lose; m.fame = Math.max(0, m.fame * 0.85); m.losses++;
      (g.mysect as any).log(`与${this.name(W)}一战失利（${how}），赔出灵石 ${lose}。`); g.toast(`${m.name}败于${this.name(W)}：赔出 ${lose} 灵石，威望受损`, 'warn');
    }
    if (w.side !== undefined) {
      const won = w.side === winner, bonus = won ? 60 + 30 * (w.wins ?? 0) : 10 * (w.wins ?? 0), sid = w.side === 0 ? w.a : w.b;
      g.war.merit += bonus; g.rel.addSect(sid, won ? 8 : 3);
      g.toast(`${this.name(w.a)}与${this.name(w.b)}之战结束——你所在的一方${won ? '胜了' : '败了'}。战功 +${bonus}`, won ? 'good' : 'warn');
    } else if (w.called && g.ws.sect && (g.ws.sect.id === w.a || g.ws.sect.id === w.b)) {
      g.rel.addSect(g.ws.sect.id, -8); g.toast(`宗门大战已了——你身为门人却临阵不至，${sectTitle(g.ws.sect.id)}对你颇为不满。`, 'warn');
    }
    for (const j of g.war.inbox) if (j.sw === w.id) j.done = true;
    for (const sid of [w.a, w.b]) this.promote(sid);
    if (this.battle?.war === w.id) { this.battle = null; g.combat.dismissAllies((e) => e.tag === 'war:ally'); }
  }
  /** 战后提拔：空出来的长老 / 执事席位由后辈顶上（名册的日常补员只补弟子） */
  private promote(sid: string) {
    const def = SECT_DEF.get(sid); if (!def) return;
    const st = (this.game.ws.flags as any).ros?.[sid] as { d?: number[]; g?: Record<number, number> } | undefined; if (!st?.d?.length) return;
    for (const i of [...st.d]) {
      const rk = rankOf(def, i), ch = rk === '长老' || rk === '执事' ? 0.6 : rk === '掌门' || rk === '太上长老' ? 0.35 : 0;
      if (ch && !this.game.roster.canonAt(sid, i) && Math.random() < ch) { st.d.splice(st.d.indexOf(i), 1); (st.g ??= {})[i] = (st.g[i] ?? 0) + 1; }
    }
  }

  // ---------------------------------------------------------------- 每帧：亲身上阵、镇守弟子现身
  private frontPos(w: SWar) {
    const L = LOC_BY_ID.get(w.tgt), G = LOC_BY_ID.get(this.att(w)); if (!L) return null;
    const dx = (G?.x ?? L.x) - L.x, dy = (G?.y ?? L.y + 1) - L.y, d = Math.hypot(dx, dy) || 1;
    return { x: L.x * WORLD_SCALE + (dx / d) * 1500, y: L.y * WORLD_SCALE + (dy / d) * 1500, map: L.map as string };
  }
  update(dt: number) {
    if (!this.game.modal && (this.S.mieN ?? 0) >= 2 && !this.S.qun) this.maybeCoalition();   // v0.70 彩蛋「天下共讨」：等发落的对话收尾再发动
    this.battleTick(dt);
    this.acc -= dt; if (this.acc > 0) return; this.acc = 1;
    try { this.guardTick(); } catch { /* */ }
    const g = this.game, p = g.player;
    if (!this.battle && !g.pursuit.active && !(g.war as any).battle && !g.hero.dead) for (const w of this.S.wars) {
      const side = this.sideOf(w); if (side === undefined || w.fall) continue;
      const fp = this.frontPos(w); if (!fp || fp.map !== ACTIVE_MAP) continue;
      if (Math.hypot(fp.x - p.x, fp.y - p.y) < 1700 && (w.lastFight ?? -9) <= g.day - 3) { this.startBattle(w, side, fp); break; }
    }
    this.pacc -= 1; if (this.pacc <= 0) { this.pacc = 2; this.postTick(); }
  }
  /** 据点的镇守弟子：你走近才现身（名册真人），走远归队 */
  private postTick() {
    const g = this.game, P = g.player, S = this.S, npcs = g.npcs;
    if (!this.adopted) { this.adopted = true; for (const d of npcs.list) if ((d as any).war === 'sw' && d.alive) { const a = this.posted.get(d.home) ?? []; a.push(d.id); this.posted.set(d.home, a); } }
    for (const [lid, ids] of [...this.posted]) {
      const l = LOC_BY_ID.get(lid), h = S.hold[lid];
      const far = !l || l.map !== ACTIVE_MAP || Math.hypot(l.x * WORLD_SCALE - P.x, l.y * WORLD_SCALE - P.y) > 8000;
      if (far || !h || ids.some((id) => npcs.byId.get(id)?.sect !== h.o)) { for (const id of ids) { const d = npcs.byId.get(id); if (d) this.unpost(d); } this.posted.delete(lid); }
    }
    for (const lid of Object.keys(S.hold)) {
      const h = S.hold[lid]; if (this.posted.has(lid) || !SECT_DEF.has(h.o) || h.g <= 0) continue;
      const l = LOC_BY_ID.get(lid); if (!l || l.map !== ACTIVE_MAP || Math.hypot(l.x * WORLD_SCALE - P.x, l.y * WORLD_SCALE - P.y) > 5000) continue;
      const ds = [...g.roster.pick(h.o, 1, 2, 3, { skipTop: true }), ...g.roster.pick(h.o, 2, 1, 1, { skipTop: true })], ids: string[] = [];
      for (const d of ds) {
        (d as any).war = 'sw'; (d as any).t0 = d.title; d.title = `${sectTitle(h.o)}·镇守${l.name}`; d.home0 ??= d.home; d.home = lid; d.stay = true; d.map = l.map;
        if (!npcs.activeOf(d.id)) { const q = npcs.homeAt(l, Math.random, 900, 600); d.x = d.tx = q.x; d.y = d.ty = q.y; }
        ids.push(d.id);
      }
      this.posted.set(lid, ids);
    }
  }
  private unpost(d: NpcData) { (d as any).war = undefined; if ((d as any).t0) { d.title = (d as any).t0; (d as any).t0 = undefined; } d.stay = false; if (d.home0) { d.home = d.home0; d.home0 = undefined; } }

  private mkUnit(sid: string, x: number, y: number, realm: number | null, boss: boolean, ours: boolean, cap = 4): Enemy | null {
    const g = this.game, B = this.battle;
    let r = 1, stage = 0, nm = '', seed = Math.floor(Math.random() * 1e9), sex: 'm' | 'f' | undefined, robe: string | undefined, ros: [string, number] | undefined, dsId: number | undefined;
    if (sid === MY) {
      const m = this.my; if (!m) return null;
      const used = new Set((B?.allies ?? []).map((e) => (e as any).swDs));
      const c = m.ds.filter((d) => d.realm >= 1 && !used.has(d.id) && (realm === null ? d.realm <= cap : d.realm === realm));
      if (!c.length) return null; const d = pick(c);
      r = clamp(d.realm, 1, 5); stage = d.stage; nm = `${m.name}·${d.name}`; sex = d.sex; seed = d.id * 7919 + 13; dsId = d.id;
    } else {
      const def = SECT_DEF.get(sid); if (!def) return null;
      const ro = g.roster, inField = new Set([...(B?.foes ?? []), ...(B?.allies ?? [])].filter((e) => !e.dead).map((e) => ((e as any).warRos as [string, number] | undefined)?.join(':')));
      let i = -1;
      if (boss) { let br = -1; for (let k = 1; k < Math.min(def.n, 60); k++) { if (ro.isDead(sid, k) || ro.canonAt(sid, k)) continue; const m = member(def, k, ro.gen(sid, k)); if (m.rank === '太上长老' || m.realm > cap) continue; if (m.realm > br) { br = m.realm; i = k; } } }
      else for (let t = 0; t < 40 && i < 0; t++) {
        const k = 1 + Math.floor(Math.random() * (def.n - 1)); if (ro.isDead(sid, k) || ro.canonAt(sid, k) || inField.has(`${sid}:${k}`)) continue;
        const m = member(def, k, ro.gen(sid, k)); if (m.rank === '太上长老' || m.realm > cap || (realm !== null && m.realm !== realm)) continue;
        i = k;
      }
      if (i < 0) return null;
      const m = member(def, i, ro.gen(sid, i)); r = clamp(m.realm, 1, 5); stage = m.stage; nm = `${def.name}${m.rank}${m.name}`; sex = m.sex; seed = m.seed; robe = def.robe; ros = [sid, i];
    }
    stage = Math.min(stage, REALMS[r].hp.length - 1);
    const e = new Enemy(ENEMIES[r >= 3 ? 'jindan_mo' : r >= 2 ? 'zhujixiu' : 'moxiu'], x, y, r, stage);
    e.look = randomLook(mulberry32(seed), sex === 'f' ? 'female' : r >= 3 ? 'elder' : 'cultivator');
    if (robe) (e.look as any).robe = robe;
    if (sex) (e.look as any).sex = sex;
    e.name = nm; e.school = SCHOOLS[sid] ? sid : SCHOOL_ALIAS[sid] ?? 'sanxiu'; e.aggro = true;
    (e as any).warRos = ros; (e as any).swDs = dsId;
    if (boss) { e.boss = true; e.maxHp = e.hp = Math.round(e.hp * 2.4); e.atk *= 1.15; }
    if (ours) { e.tag = 'war:ally'; g.combat.addAlly(e); } else { e.team = `sw:${sid}`; g.combat.enemies.push(e); }
    return e;
  }
  // ---------------------------------------------------------------- v0.62 大会战（亲身上阵）
  /** 把名册上的某一个人放上战场（真人真名：倒下一个，名册上就少一个） */
  private spawn(sid: string, u: Unit, x: number, y: number, ours: boolean, boss = false): Enemy | null {
    const g = this.game;
    let r = 1, stage = 0, nm = '', seed = 1, sex: 'm' | 'f' | undefined, robe: string | undefined, ros: [string, number] | undefined, dsId: number | undefined;
    if (sid === MY) {
      const m = this.my, d = m?.ds.find((x0) => x0.id === u.ref); if (!m || !d) return null;
      r = clamp(d.realm, 1, 5); stage = d.stage; nm = `${m.name}·${d.name}`; sex = d.sex; seed = d.id * 7919 + 13; dsId = d.id;
    } else {
      const def = SECT_DEF.get(sid); if (!def || g.roster.isDead(sid, u.ref)) return null;
      const m = member(def, u.ref, g.roster.gen(sid, u.ref)); r = clamp(m.realm, 1, 5); stage = m.stage; nm = `${def.name}${m.rank}${m.name}`; sex = m.sex; seed = m.seed; robe = def.robe; ros = [sid, u.ref];
    }
    stage = Math.min(stage, REALMS[r].hp.length - 1);
    const e = new Enemy(ENEMIES[r >= 3 ? 'jindan_mo' : r >= 2 ? 'zhujixiu' : 'moxiu'], x, y, r, stage);
    e.look = randomLook(mulberry32(seed), sex === 'f' ? 'female' : r >= 3 ? 'elder' : 'cultivator');
    if (robe) (e.look as any).robe = robe;
    if (sex) (e.look as any).sex = sex;
    e.name = nm; e.school = SCHOOLS[sid] ? sid : SCHOOL_ALIAS[sid] ?? 'sanxiu'; e.aggro = true;
    (e as any).warRos = ros; (e as any).swDs = dsId;
    if (boss) { e.boss = true; e.maxHp = e.hp = Math.round(e.hp * 2.4); e.atk *= 1.15; }
    if (ours) { e.tag = 'war:ally'; g.combat.addAlly(e); } else { e.team = `sw:${sid}`; g.combat.enemies.push(e); }
    return e;
  }
  /** 开打：双方按打法点齐人马——小卒先上，压阵的最后出手；场上打完一批补一批 */
  private startBattle(w: SWar, side: 0 | 1, fp: { x: number; y: number }, opt: { ma?: Mode; md?: Mode; n?: number } = {}) {
    const g = this.game, S = this.S, A = this.att(w), D = this.def(w), mine = side === 0 ? w.a : w.b, foe = side === 0 ? w.b : w.a;
    if (w.tgt !== D && S.hold[w.tgt]?.o !== D) w.tgt = this.nextTarget(A, D);
    const gate = w.tgt === D, zhen = gate && this.zhenHp(D) > 0;
    if (A === MY && !opt.ma) opt = { ...opt, ma: 'wave', n: opt.n ?? Math.min(this.myFree(), 60) };   // 你路过前线：默认带一波人，不替你做倾巢的主
    let [ma, md] = this.modes(w, opt, gate);
    if (zhen) { if (ma === 'hold') ma = 'wave'; md = 'hold'; }   // 大阵未破：守方只留守阵弟子在阵前
    const gar = gate ? Math.round(this.alive(D) * 0.3) : S.hold[w.tgt]?.g ?? 0;
    const ua = this.commit(A, ma, true, 0, opt.n), ud = this.commit(D, md, false, gar, ua.length);
    const gset = new Set(this.my?.guard ?? []);
    const asc = (us: Unit[], sid: string) => us.filter((u) => sid !== MY || !gset.has(u.ref)).sort((x, y) => pwOf(x) - pwOf(y));
    const rm = asc(A === mine ? ua : ud, mine), rf = asc(A === mine ? ud : ua, foe);
    const L = LOC_BY_ID.get(w.tgt); let ea = L ? Math.atan2(L.y * WORLD_SCALE - fp.y, L.x * WORLD_SCALE - fp.x) : 0; if (A !== mine) ea += Math.PI;
    w.lastFight = g.day;
    this.battle = { war: w.id, side, wave: 0, foes: [], allies: [], t: 0, x: fp.x, y: fp.y, rm, rf, m0: rm.length, f0: rf.length, km: 0, kf: 0, rt: 1, st: 3, ft: 1, ma, md, gate, zhen, ea };
    this.reinforce(FIELD_F, FIELD_M);
    const big = ma === 'all' && md === 'all';
    g.toast(zhen ? `${this.name(D)}护宗大阵「${this.zhenName(D)}」之前——${A === mine ? '杀尽守阵弟子便可破阵' : '守住阵前，别让他们摸到阵眼'}！我 ${rm.length} 人 · 敌 ${rf.length} 人`
      : big ? `灭宗大战！${this.name(mine)} ${rm.length} 人尽出，${this.name(foe)} ${rf.length} 人尽出——不死不休！`
      : `${this.tgtName(w)}·接敌！${this.name(mine)} ${rm.length} 人对${this.name(foe)} ${rf.length} 人，后备源源上场！`, 'warn');
    g.juice?.(0.12, 0.6);
    const p = g.player; sealFx('rune', this.dao(foe) === 'mo' ? 'blood' : 'gold', p.x + Math.cos(ea) * 760, p.y + Math.sin(ea) * 600, zhen ? 6 : 3.6, { dur: 8, loop: true });
  }
  /** 增援：从后备里各补若干人上场（敌人自敌阵方向杀来，同门自你身后赶到） */
  private reinforce(nf: number, nm: number) {
    const B = this.battle, g = this.game, p = g.player; if (!B) return;
    const w = this.S.wars.find((x) => x.id === B.war); if (!w) return;
    const mine = B.side === 0 ? w.a : w.b, foe = B.side === 0 ? w.b : w.a;
    for (let k = 0; k < nf && B.rf.length; k++) {
      const u = B.rf.shift()!, a = B.ea + rand(-0.8, 0.8), R = rand(640, 920);
      const boss = !B.rf.length && B.f0 >= 12 && (u.top || u.realm >= 3);
      const e = this.spawn(foe, u, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R * 0.8, false, boss);
      if (e) { B.foes.push(e); if (boss || Math.random() < 0.25) e.hunt = true; g.combat.vfx.push({ kind: 'blinkfx', x: e.x, y: e.y, r: 60, t: 0, dur: 0.4, color: '255,190,170' }); if (boss) g.toast(`${e.name}亲自出手了！`, 'warn'); }
    }
    for (let k = 0; k < nm && B.rm.length; k++) {
      const u = B.rm.shift()!, a = B.ea + Math.PI + rand(-1, 1), R = rand(120, 380);
      const e = this.spawn(mine, u, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R * 0.8, true);
      if (e) { B.allies.push(e); g.combat.vfx.push({ kind: 'blinkfx', x: e.x, y: e.y, r: 60, t: 0, dur: 0.4, color: '200,230,255' }); }
    }
  }
  /** 两翼：没轮到上场的人也没闲着——后备对后备，按战力互有折损 */
  private wings(B: Live, w: SWar, mine: string, foe: string) {
    const sum = (us: Unit[]) => us.reduce((v, u) => v + pwOf(u), 0), atk = w.ini === B.side, dm = this.doctrine(mine), df = this.doctrine(foe);
    const pm = Math.max(0.01, sum(B.rm) * (atk ? dm.atk : dm.def)), pf = Math.max(0.01, sum(B.rf) * (atk ? df.def : df.atk));
    const base = Math.max(1, Math.round(Math.min(B.rm.length, B.rf.length) * 0.04)), k = Math.sqrt(clamp(pf / pm, 0.2, 5));
    const fell = (us: Unit[], sid: string, n: number) => {
      let c = 0;
      for (let i = 0; i < n && us.length; i++) {
        const j = Math.floor(Math.random() * us.length), u = us[j];
        if (u.realm >= 3 && Math.random() < 0.7) continue;   // 高手没那么容易折在乱军里
        us.splice(j, 1); this.kill(sid, [u.ref]); c++;
        if (sid === w.a) w.la++; else w.lb++;
      }
      return c;
    };
    B.km += fell(B.rm, mine, Math.round(base * k * rand(0.5, 1.4)));
    B.kf += fell(B.rf, foe, Math.round((base / k) * rand(0.5, 1.4)));
  }
  private battleTick(dt: number) {
    const B = this.battle; if (!B) return;
    const g = this.game, p = g.player, w = this.S.wars.find((x) => x.id === B.war);
    if (!w) { for (const e of B.foes) if (!e.dead) { e.dead = true; e.deathT = 0.9; } g.combat.dismissAllies((e) => e.tag === 'war:ally'); this.battle = null; return; }
    const mine = B.side === 0 ? w.a : w.b, foe = B.side === 0 ? w.b : w.a;
    // 阵亡清点：倒下一个，名册上划掉一个
    for (const e of [...B.foes, ...B.allies]) if (e.dead && !(e as any).warCounted) {
      (e as any).warCounted = true;
      const r = (e as any).warRos as [string, number] | undefined, isFoe = B.foes.includes(e);
      if (r) { this.kill(r[0], [r[1]]); if (r[0] === w.a) w.la++; else w.lb++; if (isFoe && !e.npcKill && B.kf < 20) g.rel.addSect(r[0], -1.5); }
      if ((e as any).swDs !== undefined) { this.kill(MY, [(e as any).swDs]); if (w.a === MY) w.la++; else w.lb++; }
      if (isFoe) B.kf++; else B.km++;
      if (isFoe && !e.spar && !e.npcKill) { const m = e.boss ? 30 : 6 + e.realm * 3; g.war.merit += m; g.combat.texts.push({ x: e.x, y: e.y - 90, s: `战功 +${m}`, color: '#ffd27a', t: 0, vy: -36 }); }
    }
    B.foes = B.foes.filter((e) => !e.dead && g.combat.enemies.includes(e));
    B.allies = B.allies.filter((e) => !e.dead && !e.gone);
    const nf = B.foes.length, nm = B.allies.length;
    // 身死 / 脱离：余下的人自己把这一仗打完
    if (g.hero.dead || Math.hypot(B.x - p.x, B.y - p.y) > 4200) { this.finish(B, w, false, g.hero.dead ? '你重伤败退' : '你脱离了战场'); return; }
    B.rt -= dt; if (B.rt <= 0) { B.rt = 1; this.reinforce(Math.min(5, FIELD_F - nf), Math.min(5, FIELD_M - nm)); }
    B.st -= dt; if (B.st <= 0) { B.st = 1.8; if (B.rm.length && B.rf.length) this.wings(B, w, mine, foe); }
    // 助威：喊杀声
    B.ft -= dt;
    if (B.ft <= 0) {
      B.ft = 1.4; const all = [...B.foes, ...B.allies];
      if (all.length) { const e = pick(all), ours = B.allies.includes(e); g.combat.texts.push({ x: e.x, y: e.y - 110, s: pick(ours ? ['杀！', '随宗主冲阵！', '护我山门！', '斩！'] : ['杀！', '踏平他们！', '休走！', '纳命来！']), color: ours ? '#bfe3ff' : '#ffb4a0', t: 0, vy: -30 }); }
    }
    // 胜负：灭宗大战、破阵之战打到最后一人；寻常会战折损过七成半，敌军溃退
    const big = B.ma === 'all' && B.md === 'all', fLeft = B.rf.length + nf;
    const rout = !big && !B.zhen && B.f0 >= 10 && fLeft <= B.f0 * 0.25;
    if (fLeft > 0 && !rout) { B.t = 0; return; }
    B.t += dt; if (B.t < 1.5) return;
    this.finish(B, w, true, rout ? `${this.name(foe)}溃不成军，残部四散而逃` : `${this.name(foe)}出战之人尽数伏诛`);
  }
  /** 一场大会战收场。live = 你亲手打赢的；否则由余下的人按战力自己打完 */
  private finish(B: Live, w: SWar, live: boolean, why: string) {
    const g = this.game, mine = B.side === 0 ? w.a : w.b, foe = B.side === 0 ? w.b : w.a, A = this.att(w), D = this.def(w), big = B.ma === 'all' && B.md === 'all';
    let won = live;
    if (!live) {
      const sum = (us: Unit[], es: Enemy[]) => us.reduce((v, u) => v + pwOf(u), 0) + es.reduce((v, e) => v + pwOf(e), 0);
      won = sum(B.rm, B.allies) * rand(0.8, 1.2) > sum(B.rf, B.foes) * rand(0.8, 1.2);
      const lose = (us: Unit[], sid: string, frac: number) => { for (const u of us.splice(0)) if (Math.random() < frac * (u.realm >= 3 ? 0.4 : 1)) { this.kill(sid, [u.ref]); if (sid === w.a) w.la++; else w.lb++; if (sid === mine) B.km++; else B.kf++; } };
      lose(B.rm, mine, won ? 0.12 : big ? 0.6 : 0.4); lose(B.rf, foe, won ? (big ? 0.6 : 0.4) : 0.12);
    }
    // 收场：场上的敌人退去，同门归队
    for (const e of B.foes) if (!e.dead) { (e as any).warCounted = true; e.dead = true; e.deathT = 0.9; }
    g.combat.dismissAllies((e) => e.tag === 'war:ally'); this.battle = null;
    w.lastFight = g.day; w.lastAct = g.day; w.next = Math.max(Math.min(w.next, g.day + 30), g.day + 5);
    const kind = B.zhen ? '破阵之战' : big ? '灭宗大战' : '会战', tally = `${this.name(mine)}出战 ${B.m0} 人、折 ${B.km} 人；${this.name(foe)}出战 ${B.f0} 人、折 ${B.kf} 人`;
    if (mine === MY) (g.mysect as any).log(`${this.tgtName(w)}${kind}${won ? '得胜' : '失利'}：出战 ${B.m0} 人，折 ${B.km} 人，斩敌 ${B.kf} 人。`);
    if (live) {
      w.wins = (w.wins ?? 0) + 1;
      const m = 40 + 20 * g.hero.realm + B.kf * 2; g.war.merit += m;
      const ling = Math.round(100 * Math.pow(2.6, g.hero.realm) * (1 + B.kf / 20)); C.addItem(g.hero, 'mat_lingshi', ling);
      if (mine !== MY) { g.rel.addSect(mine, 3); if (g.ws.sect?.id === mine) g.ws.sect.contrib += 30 + 20 * g.hero.realm; }
      g.toast(`${this.tgtName(w)}·${kind}大胜！${why}。战功 +${m}，战利品灵石 ${ling}`, 'good');
      g.rel.log(`你在${this.tgtName(w)}为${this.name(mine)}打赢了一场${kind}。`, 'good');
      this.note(w, `苏寒亲自上阵，${this.name(mine)}在${this.tgtName(w)}${kind}大胜。${tally}。`);
    } else {
      g.toast(`${why}——余下的人自己把仗打完：${this.name(mine)}${won ? '胜了' : '败了'}。`, won ? 'info' : 'warn');
      this.note(w, `${this.tgtName(w)}${kind}：${this.name(mine)}${won ? '胜' : '败'}。${tally}。`);
    }
    g.juice?.(0.1, 0.5);
    const atkWon = won === (w.ini === B.side);
    if (!B.zhen) { this.after(w, atkWon, big); return; }
    // 破阵之战：攻方得手则大阵受创 / 告破；守住了，攻方再冲几次不破便会退兵
    w.wave++; w.zt = (w.zt ?? 0) + 1;
    const zn = this.zhenName(D);
    if (atkWon) {
      if (live) { this.zhenSet(D, 0); this.note(w, `守阵弟子尽没，${this.name(A)}一举击碎「${zn}」阵眼——${this.name(D)}护宗大阵告破！接下来便是灭宗大战。`, true); }
      else { this.zhenSet(D, Math.max(0, this.zhenHp(D) - this.zhenCap(D) * 0.5)); this.note(w, `${this.name(A)}冲到阵前，「${zn}」光幕大损。`, true); }
    } else if (A !== MY && w.zt >= 5) this.end(w, (1 - w.ini) as 0 | 1, `${this.name(A)}久攻${this.name(D)}护宗大阵不下，锐气尽失，罢兵而去`, true);
    else this.note(w, `${this.name(A)}在「${zn}」前碰得头破血流。`);
    this.settle(w);
  }
  /** 大会战的战况（屏幕上方的兵力条） */
  hud(): { title: string; mn: string; fn: string; m: number; m0: number; f: number; f0: number; sub: string } | null {
    const B = this.battle; if (!B) return null;
    const w = this.S.wars.find((x) => x.id === B.war); if (!w) return null;
    const mine = B.side === 0 ? w.a : w.b, foe = B.side === 0 ? w.b : w.a, big = B.ma === 'all' && B.md === 'all', D = this.def(w);
    return {
      title: `${B.zhen ? '破阵之战' : big ? '灭宗大战' : '宗门会战'} · ${this.tgtName(w)}`, mn: this.name(mine), fn: this.name(foe),
      m: B.rm.length + B.allies.length, m0: B.m0, f: B.rf.length + B.foes.length, f0: B.f0,
      sub: `${B.zhen ? `「${this.zhenName(D)}」阵力 ${Math.round((this.zhenHp(D) / Math.max(1, this.zhenCap(D))) * 100)}%　` : ''}后备 我 ${B.rm.length} · 敌 ${B.rf.length}　已斩 ${B.kf} · 已折 ${B.km}`,
    };
  }
  /** 眼下能否御剑亲征（'' = 可以） */
  private marchWhy(w: SWar): string {
    const g = this.game, fp = this.frontPos(w);
    if (!fp) return '战场不明';
    if (fp.map !== ACTIVE_MAP) return `战场在${MAP_NAME[fp.map as keyof typeof MAP_NAME] ?? '别处'}，须先赶过去`;
    if (this.battle) return '正在厮杀';
    if (g.hero.dead) return '重伤未愈';
    if (g.pursuit.active || (g.war as any).battle) return '眼下脱不开身';
    if ((g as any).inCave) return '先出洞府';
    return '';
  }
  /** 宗主亲征：御剑直抵前线，立时开打 */
  private march(w: SWar, opt: { ma?: Mode; n?: number } = {}) {
    const g = this.game, fp = this.frontPos(w), side = this.sideOf(w), why = this.marchWhy(w);
    if (!fp || side === undefined || why) { g.toast(why || '去不了前线', 'warn'); return; }
    let x = fp.x, y = fp.y;   // 落脚点：前线左近找一处能站人的地方
    for (let i = 0; i < 24 && g.terrain.walkFactor(x, y) <= 0; i++) { const a = i * 0.9, R = 200 + i * 60; x = fp.x + Math.cos(a) * R; y = fp.y + Math.sin(a) * R; }
    g.teleport(x, y);
    w.lastAct = g.day;
    this.startBattle(w, side, { x, y }, opt);
  }
  // ---------------------------------------------------------------- v0.62 亲卫
  private guards: Enemy[] = [];
  /** 亲卫：宗主点的随行门人——在野外跟在身边（秘境 / 洞府里不跟），死了就是真的死了 */
  private guardTick() {
    const g = this.game, m = this.my, p = g.player;
    for (const e of this.guards) if (e.dead && !(e as any).warCounted) { (e as any).warCounted = true; this.kill(MY, [(e as any).swDs]); g.toast(`亲卫${e.name}战死。`, 'warn'); }
    this.guards = this.guards.filter((e) => !e.dead && !e.gone && g.combat.allies.includes(e));
    const ids = m?.guard ?? [];
    if (!m || !ids.length || g.hero.dead || (g as any).inCave || (g as any).mijing?.active || (g as any).yuanying?.active) {
      if (this.guards.length) { g.combat.dismissAllies((e) => e.tag === 'sect:guard'); this.guards = []; }
      return;
    }
    m.guard = ids.filter((id) => m.ds.some((d) => d.id === id));
    for (const e of this.guards) if (!m.guard.includes((e as any).swDs)) e.gone = true;
    const have = new Set(this.guards.map((e) => (e as any).swDs));
    for (const id of m.guard) {
      if (have.has(id)) continue;
      const d = m.ds.find((x) => x.id === id); if (!d || d.realm < 1) continue;
      const a = Math.random() * 6.28, e = this.spawn(MY, { ref: id, realm: d.realm, stage: d.stage, top: false }, p.x + Math.cos(a) * 150, p.y + Math.sin(a) * 110, true);
      if (e) { e.tag = 'sect:guard'; e.aggro = false; this.guards.push(e); g.combat.vfx.push({ kind: 'blinkfx', x: e.x, y: e.y, r: 70, t: 0, dur: 0.5, color: '200,230,255' }); }
    }
  }

  // ---------------------------------------------------------------- 地图标记 / 玉符
  marks(): { x: number; y: number; glyph: string; color: string; ring?: number; name: string }[] {
    const out: { x: number; y: number; glyph: string; color: string; ring?: number; name: string }[] = [], S = this.S;
    for (const w of S.wars) {
      const fp = this.frontPos(w); if (!fp || fp.map !== ACTIVE_MAP) continue;
      const mine = this.sideOf(w) !== undefined;
      out.push({ x: fp.x, y: fp.y, glyph: '攻', color: mine ? '#ff6a3a' : '#c8a080', ring: mine ? 1700 : undefined, name: `${this.title(w)}·${this.tgtName(w)}战场` });
    }
    for (const id of this.holdsOf(MY)) { const l = LOC_BY_ID.get(id)!; if (l.map === ACTIVE_MAP) out.push({ x: l.x * WORLD_SCALE, y: l.y * WORLD_SCALE + 260, glyph: '守', color: '#ffd27a', name: `${this.name(MY)}据点·${l.name}（镇守 ${S.hold[id].g} 人）` }); }
    for (const id of Object.keys(S.gone ?? {})) { const l = LOC_BY_ID.get(id), br = (S.branch ?? []).includes(id); if (l && l.map === ACTIVE_MAP) out.push({ x: l.x * WORLD_SCALE, y: l.y * WORLD_SCALE + 260, glyph: br ? '舵' : '墟', color: br ? '#ffd27a' : '#b8b0a0', name: `${sectTitle(id)}故地（${br ? `${this.name(MY)}分舵` : '道统已绝'}）` }); }
    return out;
  }
  private goFront(w: SWar) { const fp = this.frontPos(w), g = this.game; if (fp && fp.map === ACTIVE_MAP) { g.destination = { x: fp.x, y: fp.y }; g.toast(`前线在${this.tgtName(w)}一带（地图已标出「攻」）`, 'info'); } else g.toast(`战场在${MAP_NAME[(fp?.map ?? 'tiannan') as keyof typeof MAP_NAME] ?? '别处'}，须先赶过去。`, 'info'); }
  /** 传音玉符 · 宗门召集 */
  jadeOpts(j: Jade, back: () => DNode): DOpt[] {
    const g = this.game, w = this.S.wars.find((x) => x.id === j.sw);
    if (!w) { j.done = true; return []; }
    if (w.side !== undefined) return [{ label: `赶赴前线（${this.tgtName(w)}）`, tone: 'gold', act: () => { this.goFront(w); return null; } }];
    return [
      { label: `应召，赶赴${this.tgtName(w)}前线`, tone: 'gold', act: () => { w.side = j.side ?? 0; this.goFront(w); return null; } },
      { label: '置之不理', act: () => { j.done = true; w.called = false; if (g.ws.sect) g.rel.addSect(g.ws.sect.id, -6); return back(); } },
    ];
  }

  // ---------------------------------------------------------------- 面板：天下宗门
  private statText(sid: string) { return `${SCALE_NAME[this.scale(sid)]} · ${DAO_NAME[this.dao(sid)]} · 门人 ${this.alive(sid)}/${sid === MY ? this.game.mysect.cap() : this.size(sid)}（上限 ${this.cap(sid)}）`; }
  private warText(w: SWar) {
    const lean = w.score > 20 ? `${this.name(w.a)}占上风` : w.score < -20 ? `${this.name(w.b)}占上风` : '两家相持';
    return `${this.title(w)}\n起因：${w.why}　已打 ${w.wave} 阵，${lean}\n眼下${this.name(this.att(w))}主攻，兵锋指向${this.tgtName(w)}\n折损：${this.name(w.a)} ${w.la} 人 · ${this.name(w.b)} ${w.lb} 人`;
  }
  node(): DNode {
    this.initHolds();
    const S = this.S, ids = this.sects(ACTIVE_MAP), cnt = { da: 0, zhong: 0, xiao: 0 };
    for (const s of ids) cnt[this.scale(s)]++;
    const wars = S.wars.filter((w) => LOC_BY_ID.get(w.a)?.map === ACTIVE_MAP), far = S.wars.length - wars.length;
    const hot: [string, string, number][] = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const t = this.tension(ids[i], ids[j]); if (t >= 55 && !this.between(ids[i], ids[j])) hot.push([ids[i], ids[j], t]); }
    hot.sort((x, y) => y[2] - x[2]);
    const lines = [
      `天下宗门分三等：大宗门（门人上限 ${SCALE_CAP.da}）、中宗门（${SCALE_CAP.zhong}）、小宗门（${SCALE_CAP.xiao}）。各派在山门之外派弟子镇守城镇据点；一旦开战，或数十上百人分波冲阵、或倾巢而出——一方倾巢，另一方也只能尽出迎战，那便是灭宗大战。打到山门还有护宗大阵，须先破阵。`,
      `${MAP_NAME[ACTIVE_MAP]}现有：大宗门 ${cnt.da} · 中宗门 ${cnt.zhong} · 小宗门 ${cnt.xiao}`,
      wars.length ? '战事：\n' + wars.map((w) => `· ${this.title(w)}——争${this.tgtName(w)}，第 ${w.wave + 1} 阵`).join('\n') : '眼下此地各派尚无战事。',
      far ? `别处另有 ${far} 场宗门之战。` : '',
      Object.keys(S.gone ?? {}).length ? `已除名的宗门：${Object.keys(S.gone ?? {}).map((id) => sectTitle(id)).join('、')}` : '',
      hot.length ? '风声：\n' + hot.slice(0, 5).map(([a, b, t]) => `· ${this.name(a)}与${this.name(b)}${this.relWord(t)}`).join('\n') : '',
    ].filter(Boolean);
    const o: DOpt[] = wars.map((w): DOpt => ({ label: `战事：${this.title(w)}`, tone: 'bad', act: () => this.warNode(w) }));
    o.push({ label: `各派名录（规模 · 宗法战阵 · 据点）`, tone: 'gold', act: () => this.listNode(0) });
    if (this.my) o.push({ label: `${this.my.name}的战事（镇守 · 调兵 · 宣战）`, tone: 'good', act: () => this.myNode() });
    o.push({ label: '回传音玉符', act: () => this.game.war.inboxNode() }, { label: '收起', act: () => null });
    return { speaker: '天下大势', title: '宗门争锋', mood: 'danger', text: lines.join('\n\n'), options: o };
  }
  private listNode(page: number): DNode {
    const ids = this.sects(ACTIVE_MAP).sort((a, b) => SCALE_W[this.scale(a)] - SCALE_W[this.scale(b)] || this.alive(b) - this.alive(a)), per = 9, pages = Math.max(1, Math.ceil(ids.length / per));
    const o: DOpt[] = ids.slice(page * per, page * per + per).map((s): DOpt => ({ label: `【${SCALE_NAME[this.scale(s)][0]}】${this.name(s)}　${DAO_NAME[this.dao(s)]} · ${this.alive(s)} 人${this.warOf(s) ? ' · 战时' : ''}`, tone: this.warOf(s) ? 'bad' : undefined, act: () => this.sectNode(s, () => this.listNode(page)) }));
    if (pages > 1) o.push({ label: `下一页（${page + 1}/${pages}）`, act: () => this.listNode((page + 1) % pages) });
    o.push({ label: '返回', act: () => this.node() });
    return { speaker: '各派名录', title: MAP_NAME[ACTIVE_MAP], mood: 'normal', text: '【大】【中】【小】为宗门规模。点开可看一派的门人、宗法战阵、镇守的据点与恩怨。', options: o };
  }
  sectNode(sid: string, back: () => DNode): DNode {
    const S = this.S, hs = this.holdsOf(sid), arts = this.arts(sid), al = allyOf(sid);
    const rel = this.sects(LOC_BY_ID.get(sid)?.map).filter((x) => x !== sid).map((x) => [x, this.tension(sid, x)] as [string, number]).filter((x) => x[1] >= 40).sort((x, y) => y[1] - x[1]).slice(0, 4);
    const w = this.warOf(sid);
    const lines = [
      this.statText(sid) + (al ? `　联盟：${al}` : ''),
      `宗法：${this.docText(sid)}${arts.length ? `\n秘传：${arts.join('、')}` : ''}`,
      `据点：${hs.length ? hs.map((id) => `${LOC_BY_ID.get(id)!.name}（镇守 ${S.hold[id].g} 人）`).join('、') : '山门之外别无据点'}`,
      `护宗大阵：「${this.zhenName(sid)}」阵力 ${Math.round(this.zhenHp(sid))}/${Math.round(this.zhenCap(sid))}${S.vassal?.[sid] ? '　【本宗附庸】' : ''}`,
      rel.length ? `恩怨：${rel.map(([x, t]) => `${this.name(x)}（${FEUD.has(key(sid, x)) ? '世仇 · ' : ''}${this.relWord(t)}）`).join('、')}` : '',
      w ? `战时：${this.warText(w)}` : '',
    ].filter(Boolean);
    const o: DOpt[] = [];
    if (w) o.push({ label: '看这场战事', tone: 'bad', act: () => this.warNode(w) });
    o.push({ label: '返回', act: back });
    return { speaker: this.name(sid), title: SCALE_NAME[this.scale(sid)], mood: 'normal', text: lines.join('\n'), options: o };
  }
  warNode(w: SWar): DNode {
    const g = this.game, S = this.S;
    if (!S.wars.includes(w)) return this.node();
    if (w.a === MY || w.b === MY) return this.myWarNode(w);
    const o: DOpt[] = [], side = w.side, mine = g.ws.sect?.id;
    if (side !== undefined) o.push({ label: `赶赴前线（${this.tgtName(w)}）——你在${this.name(side === 0 ? w.a : w.b)}一方，已胜 ${w.wins ?? 0} 阵`, tone: 'gold', act: () => { this.goFront(w); return null; } });
    else for (const k of [0, 1] as const) {
      const sid = k === 0 ? w.a : w.b, foe = k === 0 ? w.b : w.a, own = mine === sid;
      o.push({ label: own ? `以门人身份参战（${this.name(sid)}）` : `以散修身份投效${this.name(sid)}`, tone: 'gold', disabled: g.hero.realm < 2 || mine === foe, hint: mine === foe ? '你是对面的门人' : '须筑基以上', act: () => { w.side = k; if (!own) g.rel.addSect(foe, -8); g.rel.addSect(sid, 4); this.goFront(w); return null; } });
    }
    o.push({ label: `${this.name(w.a)}的底细`, act: () => this.sectNode(w.a, () => this.warNode(w)) }, { label: `${this.name(w.b)}的底细`, act: () => this.sectNode(w.b, () => this.warNode(w)) }, { label: '返回', act: () => this.node() });
    return { speaker: '宗门之战', title: this.title(w), mood: 'danger', text: `${this.warText(w)}\n\n${w.log.length ? w.log.slice(-5).join('\n') : '两家还在调兵遣将，尚未接战。'}\n\n亲自到前线（地图上的「攻」）便会接战；你杀的每一个人，都从对面的名册上划掉。`, options: o };
  }

  // ---------------------------------------------------------------- 面板：自家宗门的战事
  myNode(): DNode {
    const g = this.game, m = this.my, S = this.S;
    if (!m) return this.node();
    this.initHolds(); this.clampMyGar();
    const hs = this.holdsOf(MY), sc = this.scale(MY), wars = S.wars.filter((w) => w.a === MY || w.b === MY);
    let inc = 0; for (const id of hs) inc += this.holdIncome(id);
    const lines = [
      this.statText(MY),
      `宗法：${this.docText(MY)}`,
      `据点 ${hs.length}/${HOLDS[sc]}：${hs.length ? hs.map((id) => `${LOC_BY_ID.get(id)!.name}（镇守 ${S.hold[id].g} 人）`).join('、') : '尚无'}${inc ? `　月入约 ${inc} 灵石` : ''}`,
      `可调之兵 ${this.myFree()} 人（在外镇守 ${this.myGar()} 人）　守御之策：${DEF_NAME[S.myDef ?? 'wave']}`,
      `护宗大阵：${this.zhenCap(MY) ? `「${this.zhenName(MY)}」阵力 ${Math.round(this.zhenHp(MY))}/${this.zhenCap(MY)}` : '尚未布阵——敌人一到山门便是灭宗大战'}`,
      ...(Object.keys(S.vassal ?? {}).length || (S.branch ?? []).length ? [`附庸：${Object.keys(S.vassal ?? {}).map((id) => sectTitle(id)).join('、') || '无'}　分舵：${(S.branch ?? []).map((id) => sectTitle(id) + '故地').join('、') || '无'}`] : []),
      wars.length ? wars.map((w) => `战事：${this.warText(w)}${w.fall ? '\n【败者听候发落】' : ''}`).join('\n') : '眼下本宗没有战事。',
    ];
    const o: DOpt[] = wars.map((w): DOpt => ({ label: `调兵：与${this.name(w.a === MY ? w.b : w.a)}之战`, tone: 'bad', act: () => this.myWarNode(w) }));
    o.push({ label: '派弟子镇守据点', tone: 'good', disabled: !this.units(MY).length, hint: '尚无可用门人', act: () => this.myHoldNode() });
    o.push({ label: '向他派宣战', tone: 'bad', disabled: this.units(MY).length < 12, hint: '门人不足十二（炼气以上）', act: () => this.myDeclareNode(0) });
    o.push({ label: `守御之策：${DEF_NAME[S.myDef ?? 'wave']}（点击切换）`, hint: '敌人来攻据点时：逐波增援 / 全宗回援 / 只凭镇守', act: () => { S.myDef = S.myDef === 'all' ? 'hold' : S.myDef === 'hold' ? 'wave' : 'all'; return this.myNode(); } });
    o.push({ label: '护宗大阵（充能 · 变阵 · 扩建）', tone: 'gold', act: () => g.mysect.zhenNode() });
    o.push({ label: '天下宗门大势', act: () => this.node() }, { label: '回宗门', act: () => g.mysect.node() });
    return { speaker: m.name, title: '宗门战事', mood: 'danger', text: lines.join('\n'), options: o };
  }
  private myHoldNode(): DNode {
    const m = this.my!, S = this.S, G = LOC_BY_ID.get(MY), sc = this.scale(MY), hs = this.holdsOf(MY);
    if (!G) return this.myNode();
    const cand = ALL_LOCATIONS.filter((l) => l.map === G.map && this.holdable(l)).map((l) => ({ l, d: Math.hypot(l.x - G.x, l.y - G.y) })).sort((x, y) => x.d - y.d).slice(0, 9);
    const o: DOpt[] = cand.map(({ l, d }): DOpt => {
      const h = S.hold[l.id], own = h?.o === MY;
      return { label: `${l.name}（${own ? `本宗镇守 ${h.g} 人` : h ? `${this.name(h.o)}镇守 ${h.g} 人` : '无主'} · ${dirName(l.x - G.x, l.y - G.y)}方 ${Math.max(1, Math.round((d * WORLD_SCALE) / 260))} 里）`, tone: own ? 'good' : h ? 'bad' : undefined, act: () => this.holdActNode(l) };
    });
    o.push({ label: '返回', act: () => this.myNode() });
    return { speaker: m.name, title: '镇守据点', mood: 'normal', text: `${SCALE_NAME[sc]}可镇守 ${HOLDS[sc]} 处据点（现 ${hs.length} 处）。据点按月有进项；镇守的弟子不能再调去别处。\n无主之地派人进驻即可；别派的据点只能强占——那就是开战。\n可调之兵 ${this.myFree()} 人。`, options: o };
  }
  private holdActNode(l: LocDef): DNode {
    const m = this.my!, S = this.S, h = S.hold[l.id], sc = this.scale(MY), full = this.holdsOf(MY).length >= HOLDS[sc], back = () => this.myHoldNode();
    const o: DOpt[] = [];
    if (h?.o === MY) {
      o.push({ label: '增派五人', disabled: this.myFree() < 5, hint: '可调之兵不足', act: () => { h.g += 5; return this.holdActNode(l); } });
      o.push({ label: '撤回五人', disabled: h.g <= 5, hint: '至少留五人', act: () => { h.g -= 5; return this.holdActNode(l); } });
      o.push({ label: '弃守此地', tone: 'bad', act: () => { delete S.hold[l.id]; return back(); } });
    } else if (!h) {
      for (const n of [6, 12, 20]) o.push({ label: `进驻：派 ${n} 人镇守`, tone: 'good', disabled: full || this.myFree() < n, hint: full ? '据点已满（宗门规模所限）' : '可调之兵不足', act: () => { S.hold[l.id] = { o: MY, g: n }; (this.game.mysect as any).log(`派 ${n} 名弟子进驻${l.name}。`); this.game.toast(`${m.name}弟子进驻${l.name}`, 'good'); return back(); } });
    } else {
      const foe = h.o, w = this.between(MY, foe), truce = (S.truce[key(MY, foe)] ?? 0) > this.game.day;
      o.push({ label: w ? `已与${this.name(foe)}交战——把兵锋转向此地` : `强占——向${this.name(foe)}宣战`, tone: 'bad', disabled: truce || this.units(MY).length < 12, hint: truce ? '停战之约未满' : '门人不足十二', act: () => {
        if (w) { w.ini = w.a === MY ? 0 : 1; w.tgt = l.id; w.streak = 0; w.lastAct = this.game.day; return this.myWarNode(w); }
        this.game.rel.addSect(foe, -30); return this.myWarNode(this.declare(MY, foe, `争夺${l.name}`, l.id));
      } });
      o.push({ label: `${this.name(foe)}的底细`, act: () => this.sectNode(foe, () => this.holdActNode(l)) });
    }
    o.push({ label: '返回', act: back });
    return { speaker: l.name, title: h ? `${this.name(h.o)}据点 · 镇守 ${h.g} 人` : '无主之地', mood: 'normal', text: `${l.desc}\n\n${h?.o === MY ? `月入约 ${this.holdIncome(l.id)} 灵石。` : ''}可调之兵 ${this.myFree()} 人。`, options: o };
  }
  private myDeclareNode(page: number): DNode {
    const g = this.game, m = this.my!, S = this.S, per = 8;
    const ids = this.sects(m.map).filter((s) => s !== MY && !this.between(MY, s)).sort((a, b) => this.tension(MY, b) - this.tension(MY, a)), pages = Math.max(1, Math.ceil(ids.length / per));
    const mineP = Math.round(this.strength(MY) + PW[g.hero.realm] * 2);
    const o: DOpt[] = ids.slice(page * per, page * per + per).map((s): DOpt => {
      const truce = (S.truce[key(MY, s)] ?? 0) > g.day;
      return { label: `【${SCALE_NAME[this.scale(s)][0]}】${this.name(s)}　${DAO_NAME[this.dao(s)]} · ${this.alive(s)} 人 · 战力约 ${Math.round(this.strength(s))}${truce ? ' · 停战中' : ''}`, tone: 'bad', disabled: truce, hint: '停战之约未满', act: () => ({
        speaker: m.name, title: `向${this.name(s)}宣战？`, mood: 'danger',
        text: `${this.statText(s)}\n宗法：${this.docText(s)}\n据点：${this.holdsOf(s).map((id) => LOC_BY_ID.get(id)!.name).join('、') || '只有山门'}\n\n本宗战力约 ${mineP}（含宗主压阵），对方约 ${Math.round(this.strength(s))}。\n一旦宣战，须一处处拔掉对方的据点，最后攻打山门。打到山门须先攻破对方的护宗大阵（宗主亲自轰击 / 遣弟子强攻 / 亲征破阵）；阵破之后便是双方尽出的灭宗大战——赢了，是和是灭由你发落。`,
        options: [{ label: '宣战！', tone: 'bad', act: () => { g.rel.addSect(s, -30); return this.myWarNode(this.declare(MY, s, `${m.name}宗主一声令下`)); } }, { label: `${this.name(s)}的底细`, act: () => this.sectNode(s, () => this.myDeclareNode(page)) }, { label: '再想想', act: () => this.myDeclareNode(page) }],
      }) };
    });
    if (pages > 1) o.push({ label: `下一页（${page + 1}/${pages}）`, act: () => this.myDeclareNode((page + 1) % pages) });
    o.push({ label: '返回', act: () => this.myNode() });
    return { speaker: m.name, title: '宣战', mood: 'danger', text: `${MAP_NAME[m.map]}各派（按与本宗的紧张程度排）。本宗战力约 ${mineP}。`, options: o };
  }
  private report(w: SWar, txt: string): DNode {
    const m = this.my!, S = this.S;
    return { speaker: m.name, title: '战报', mood: 'danger', text: `${txt}\n\n${S.wars.includes(w) ? this.warText(w) : '此战已了。'}`, options: [{ label: '继续', act: () => (S.wars.includes(w) ? this.myWarNode(w) : this.myNode()) }] };
  }
  /** 一波可以派多少人 */
  private sizes(free: number): number[] { const out = [30, 50, 80, 120].filter((n) => n <= free); if (!out.length && free >= 3) out.push(free); else if (free > 120) out.push(free); return out; }
  myWarNode(w: SWar): DNode {
    const g = this.game, m = this.my, S = this.S;
    if (!m || !S.wars.includes(w)) return this.myNode();
    if (w.fall) return this.verdictNode(w);
    const foe = w.a === MY ? w.b : w.a, mySide: 0 | 1 = w.a === MY ? 0 : 1, attacking = w.ini === mySide, D = this.def(w);
    if (w.tgt !== D && S.hold[w.tgt]?.o !== D) w.tgt = this.nextTarget(this.att(w), D);
    const wait = Math.ceil(w.next - g.day), free = this.myFree(), all = this.units(MY).length, fAll = this.units(foe).length;
    const gate = w.tgt === D, zhp = gate ? this.zhenHp(D) : 0, zcap = gate ? Math.max(1, this.zhenCap(D)) : 1, why = this.marchWhy(w), rest = `弟子休整中，还须 ${wait} 日`;
    const o: DOpt[] = [];
    if (attacking) {
      if (gate && zhp > 0) {
        const cd = Math.ceil(5 - (g.day - (w.hz ?? -99))), nb = Math.min(free, 80);
        o.push({ label: '宗主亲自轰击大阵（耗一日）', tone: 'gold', disabled: cd > 0, hint: `真元未复，还须 ${cd} 日`, act: () => { g.passDays(1); w.hz = g.day; w.lastAct = g.day; return this.report(w, this.siege(w, { hero: true })); } });
        o.push({ label: `亲征破阵（实战）：率 ${nb} 人直扑阵前，杀尽守阵弟子便破阵`, tone: 'good', disabled: !!why || free < 3, hint: why || '可调之兵不足三人', act: () => { this.march(w, { ma: 'wave', n: nb }); return null; } });
        for (const n of this.sizes(free)) o.push({ label: `遣 ${n} 人强攻大阵（推演）`, disabled: wait > 0, hint: rest, act: () => { w.lastAct = g.day; return this.report(w, this.clash(w, { ma: 'wave', n })); } });
        o.push({ label: `倾巢而出猛攻大阵（全宗 ${all} 人 · 推演）`, tone: 'bad', disabled: wait > 0, hint: rest, act: () => { w.lastAct = g.day; return this.report(w, this.clash(w, { ma: 'all' })); } });
      } else if (gate) {
        o.push({ label: `灭宗大战 · 宗主亲征（实战）：全宗 ${all} 人对${this.name(foe)} ${fAll} 人`, tone: 'good', disabled: !!why, hint: why, act: () => { this.march(w, { ma: 'all' }); return null; } });
        o.push({ label: `灭宗大战 · 坐镇推演：全宗 ${all} 人倾巢而出`, tone: 'bad', disabled: wait > 0, hint: rest, act: () => { w.lastAct = g.day; return this.report(w, this.clash(w, { ma: 'all' })); } });
      } else {
        for (const n of this.sizes(free)) o.push({ label: `遣 ${n} 人攻打${this.tgtName(w)}（对面也照此数迎战）`, tone: 'gold', act: () => this.sendNode(w, 'wave', n) });
        o.push({ label: `倾巢而出 · 灭宗大战（全宗 ${all} 人；对面 ${fAll} 人也必尽出）`, tone: 'bad', act: () => this.sendNode(w, 'all', all) });
      }
    } else {
      o.push({ label: `即刻驰援${this.tgtName(w)}（实战）`, tone: 'good', disabled: !!why, hint: why, act: () => { this.march(w); return null; } });
      o.push({ label: `主动出击，夺回先手（转攻${this.name(foe)}）`, tone: 'gold', act: () => { w.ini = mySide; w.streak = 0; w.zt = 0; w.tgt = this.nextTarget(MY, foe); w.lastAct = g.day; w.next = Math.min(w.next, g.day + 3); return this.myWarNode(w); } });
    }
    const pay = Math.round(Math.max(500, m.stones * 0.2));
    o.push({ label: `遣使求和（赔灵石 ${pay}）`, disabled: m.stones < pay, hint: '库房灵石不足', act: () => { m.stones -= pay; this.end(w, (1 - mySide) as 0 | 1, `${m.name}遣使求和`, true); return this.myNode(); } });
    o.push({ label: `${this.name(foe)}的底细`, act: () => this.sectNode(foe, () => this.myWarNode(w)) }, { label: '返回', act: () => this.myNode() });
    const tip = attacking
      ? gate && zhp > 0 ? `兵临${this.name(foe)}山门，护宗大阵「${this.zhenName(foe)}」尚余阵力 ${Math.round(zhp)}/${Math.round(zcap)}。大阵不破，${this.name(foe)}弟子躲在阵后毫发无伤，我方每冲一次都要丢下一批人——宗主亲自轰击不折一人，亲征破阵则一战可破。`
        : gate ? `${this.name(foe)}护宗大阵已破，山门洞开。接下来是灭宗大战：双方尽出，不死不休；胜了，是和是灭由你发落。`
        : `本宗主攻。一次可遣数十上百人，对面照人数迎战；倾巢而出则双方尽出，一战定存亡。亲征（实战）：御剑直抵前线，门人随你冲阵。久不出兵（45 日），对面会反客为主。`
      : `${this.name(foe)}主攻，约 ${Math.max(0, wait)} 日后在${this.tgtName(w)}接战。守御之策：${DEF_NAME[S.myDef ?? 'wave']}（在「宗门战事」里切换）。${gate ? `本宗护宗大阵阵力 ${Math.round(this.zhenHp(MY))}/${this.zhenCap(MY)}。` : ''}`;
    return { speaker: m.name, title: `与${this.name(foe)}之战`, mood: 'danger', text: `${this.warText(w)}\n可调之兵 ${free} 人（在外镇守 ${this.myGar()} 人）\n\n${tip}\n\n${w.log.slice(-4).join('\n')}`, options: o };
  }
  /** 出兵：亲征（实战）还是坐镇（推演） */
  private sendNode(w: SWar, mode: Mode, n: number): DNode {
    const g = this.game, m = this.my!, foe = w.a === MY ? w.b : w.a, why = this.marchWhy(w), wait = Math.ceil(w.next - g.day), big = mode === 'all';
    const text = big
      ? `全宗上下 ${n} 人倾巢而出，宗主压阵。${this.name(foe)}也只能尽起 ${this.units(foe).length} 人迎战——这是灭宗大战：\n· 胜：${this.name(foe)}全线崩溃，所有据点一并易手，兵临山门；\n· 败：本宗元气大伤，攻守易势。\n\n宗主亲征（实战）：御剑直抵前线，门人随你冲阵，敌我后备源源上场，杀一个少一个。\n坐镇山门（推演）：立见战报。`
      : `遣 ${n} 人攻打${this.tgtName(w)}，${this.name(foe)}会照着这个数迎战。\n\n宗主亲征（实战）：御剑直抵前线，门人随你冲阵，敌我后备源源上场；杀到对面折损七成半，敌军便溃。\n坐镇山门（推演）：立见战报。`;
    return {
      speaker: m.name, title: big ? '灭宗大战' : `遣 ${n} 人出战`, mood: 'danger', text,
      options: [
        { label: '宗主亲征（实战）', tone: 'good', disabled: !!why, hint: why, act: () => { this.march(w, { ma: mode, n }); return null; } },
        { label: '坐镇山门（推演）', tone: 'gold', disabled: wait > 0, hint: `弟子休整中，还须 ${wait} 日`, act: () => { w.lastAct = g.day; return this.report(w, this.clash(w, { ma: mode, n })); } },
        { label: '返回', act: () => this.myWarNode(w) },
      ],
    };
  }
  /** 发落败者 */
  private verdictNode(w: SWar): DNode {
    const g = this.game, m = this.my!, S = this.S;
    if (!S.wars.includes(w)) return this.myNode();
    const foe = w.a === MY ? w.b : w.a, fn = this.name(foe), sc = this.scale(foe), left = this.units(foe).length, nj = Math.min(Math.max(0, g.mysect.cap() - m.ds.length), Math.round(left * 0.5)), mo = this.dao(foe) === 'mo';
    const done = (txt: string): DNode => ({ speaker: m.name, title: '发落', mood: 'danger', text: txt, options: [{ label: '继续', act: () => this.myNode() }] });
    return {
      speaker: m.name, title: `发落${fn}`, mood: 'danger',
      text: `${fn}已是砧上鱼肉（残部 ${left} 人）。是和是灭，宗主一言而决：\n\n· 灭其道统：鸡犬不留，${fn}自此除名。搜刮库藏 ${MIE_LOOT[sc]} 灵石与藏经阁秘卷，据点尽归本宗，山门改作分舵（月入 ${BRANCH[sc]}）。${mo ? '诛灭魔宗，正道称快。' : '屠戮同道，天下侧目——各派对本宗的敌意都会上涨。'}\n· 收编残部：${fn}除名，残部约 ${nj} 人改换门庭（忠诚不高），得库藏 ${Math.round(MIE_LOOT[sc] * 0.4)} 灵石，据点、山门尽归本宗。\n· 纳为附庸：${fn}保全道统，每月上供 ${VASSAL[sc]} 灵石（径入宗主供奉），本宗有战事时出兵助阵。\n· 赔款罢兵：得赔款 ${END_LOOT[sc]} 灵石，割其半数据点，五年不战。\n\n（一百二十日不发落，按赔款了结。）`,
      options: [
        { label: `灭其道统——${fn}自此除名`, tone: 'bad', act: () => ({ speaker: m.name, title: '灭宗', mood: 'danger', text: `当真要将${fn}连根拔起？此事一做，再无回头。`, options: [{ label: '斩草除根！', tone: 'bad', act: () => done(this.verdict(w, 'mie')) }, { label: '再想想', act: () => this.verdictNode(w) }] }) },
        { label: `收编残部（约 ${nj} 人来投）`, tone: 'gold', act: () => done(this.verdict(w, 'bian')) },
        { label: `纳为附庸（月供 ${VASSAL[sc]} 灵石）`, tone: 'good', act: () => done(this.verdict(w, 'fu')) },
        { label: `赔款罢兵（${END_LOOT[sc]} 灵石）`, act: () => done(this.verdict(w, 'pei')) },
        { label: `${fn}的底细`, act: () => this.sectNode(foe, () => this.verdictNode(w)) },
      ],
    };
  }
}
