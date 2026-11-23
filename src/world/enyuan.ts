// 恩怨与江湖重做 · 第二批：化解恩怨、宗门调停、宗门外交、队伍指令、报官反悬赏、各地口碑、江湖传音
//
// 第一批（world/feud.ts）解决了「受害者被追杀」，这一批给玩家更多「了结」和「借力」的办法：
//   · 化解（reconcileNode）：赔礼、退还夺来的东西、托共同的好友调停、请宗门长辈出面、立心魔誓、约生死斗。恩怨页、对峙、宗门里都能点。
//   · 宗门调停（sectMediate）：花宗门贡献请长老出面；贡献够、长老境界压得住对方，死仇降为旧怨。
//   · 宗门外交（dipTick）：同盟宗门的弟子路上帮你；敌对宗门的弟子挑衅、盘查，宗门开战时按你的身份动手（先手记在他们身上）。
//   · 队伍指令（squadPos / squadTarget）：掩护、包抄、护着我撤、别杀他；队友有底线，你杀得太狠他会劝你，再犯就离队。
//   · 报官（reportNode）：被劫后去坊市或宗门报案，劫匪上悬赏榜，执法弟子或赏金客去拿他；拿到了你收到消息和补偿。
//   · 口碑（kb*）：每座城一本账（存在 townwreck 的 TWCity.good 上），好口碑打招呼、打折、帮你躲追兵；坏口碑见你就躲、报官、守卫盘查；
//     随游玩时间淡去，顺着商路传到邻城。
//   · 江湖传音（news / feed）：一切「江湖上的消息」进 jianghu 的 Rumor（kind:'news'），你做的事会传开、被议论；求助、悬赏、组队从这里接；
//     原来零散的「神识中…」「江湖传闻…」小消息收进这里，屏幕上不再弹。
//
// 固定种子：这里的东西都在玩家侧（每帧、对话、game.update 里的日结），不进 npcs.daySteps、living.*、npcs.die、rel.onNpcKill。
// 冷却与时限一律「游戏天数 + 累计游玩时间」（feud.playOf）。
import type { Game } from './game';
import type { NpcData, Active, Pers } from './npc';
import { npcMap } from './npc';
import type { DNode, DOpt } from './modal';
import type { Rumor } from './worldstate';
import type { Enemy } from './combat';
import type { PartyOrder } from './party';
import type { Drawable } from './life';
import { LOC_BY_ID, LOCATIONS, ACTIVE_MAP, WORLD_SCALE, type LocDef } from '../data/world';
import { realmName } from '../data/realms';
import { cityTier } from '../data/market';
import { SECT_DEF, sectTitle } from './roster';
import { allyGroup } from './relations';
import { WARS } from './war';
import { dirName } from './sites';
import * as C from './cultivation';
import { audio } from './audio';
import { playOf, heatOf, marksOf, HEAT_STEP, HUNT_MIN, markAssail } from './feud';
import arenaUrl from '../assets/feud/arena.webp';   // 生死斗擂台的地面纹样（our-codex-image 生成）

// ============================================================ 存档
export interface EyRobbed { npcId: string; name: string; realm: number; stage: number; day: number; loss: number; town?: string; reported?: boolean }
export interface EyReport { id: number; npcId: string; name: string; realm: number; stage: number; where: string; whereName: string; at: 'town' | 'sect'; day: number; dueDay: number; dueP: number; tries: number; status: 'open' | 'caught' | 'fled' | 'dead'; by?: string; comp?: number; loss: number; reward: number;
  /** 第三批：NPC 之间的案子（苦主、罪名、谁报的案）；派去拿人的执法弟子 / 巡察使（world/zhifa.ts） */
  npc?: { victim: string; victimId?: string; crime: string; by: string }; law?: string; lawName?: string; lawRealm?: number }
export interface EyDuel { npcId: string; name: string; x: number; y: number; map: string; t0: number }
export interface EySave {
  v: 1; nseq: number; rseq: number;
  /** 最近被谁劫过（报案用） */
  robbed: EyRobbed[];
  /** 报过的案（悬赏榜上的通缉） */
  reports: EyReport[];
  /** 江湖传音：看到哪一条了 */
  feedRead: number;
  /** 正在打的生死斗 */
  duel?: EyDuel | null;
  /** 口碑顺着商路往邻城传：排着队的 */
  kbQ?: { to: string; v: number; day: number; p: number; from: string }[];
  /** 已经发过传音的玉符 */
  jadeSeen?: number;
  /** 下一条支线消息（求助 / 悬赏 / 组队）最早什么时候发：日、游玩秒 */
  hookDay?: number; hookP?: number; hookK?: number;
  /** 躲在百姓屋里到第几秒（游玩） */
  hideP?: number;
}

// ============================================================ 数值
/** 宗门调停：要多少贡献（按对方境界） */
export const mediateCost = (d: NpcData) => 60 + 60 * Math.max(1, d.realm);
/** 报案：执法弟子 / 赏金客多久去拿人（日 + 游玩秒，两个都到了才有结果） */
export const REPORT_DAYS = 15, REPORT_PLAY = 5 * 60;
/** 口碑门槛：打招呼、躲追兵、见你就躲、守卫盘查 */
export const KB = { good: 30, hide: 45, bad: -30, inspect: -45, fadePerMin: 1, spread: 0.4, spreadDays: 3, spreadPlay: 60, hideCd: 3 * 60, inspectCd: 4 * 60, hideFor: 40 };
/** 宗门外交冷却（游玩秒） */
export const DIP = { help: 90, inspect: 3 * 60, provoke: 45 };
/** 支线消息间隔（日 + 游玩秒） */
export const HOOK_DAYS = 20, HOOK_PLAY = 3 * 60;
/** 队友的底线：各种脾气能忍几回「太狠」 */
const LIMIT: Record<Pers, number> = { righteous: 2, kind: 2, cautious: 3, aloof: 3, greedy: 5, arrogant: 5, ruthless: 99 };

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** 议论、喊话、挑哪座城这类点缀用自己的小随机数，不动 Math.random（别的系统、固定种子的测试都按它的序列走） */
let lcgS = 0x2f6b5e;
const lcg = () => { lcgS = (Math.imul(lcgS, 1664525) + 1013904223) >>> 0; return lcgS / 4294967296; };
const pick = <T,>(a: readonly T[], r: () => number = lcg) => a[Math.floor(r() * a.length) % a.length];

/** 宗门对宗门：同盟 / 敌对 / 无涉 */
export type Stance = 'self' | 'ally' | 'foe' | 'none';
export function stanceOf(a?: string, b?: string): Stance {
  if (!a || !b) return 'none';
  if (a === b) return 'self';
  const ga = allyGroup(a), gb = allyGroup(b);
  if (ga && ga === gb) return 'ally';
  for (const w of WARS) {
    const sa = w.sides.findIndex((s) => s.sects.includes(a)), sb = w.sides.findIndex((s) => s.sects.includes(b));
    if (sa >= 0 && sb >= 0) return sa === sb ? 'ally' : 'foe';
  }
  const da = SECT_DEF.get(a), db = SECT_DEF.get(b);
  if (da && db && !!da.demon !== !!db.demon) return 'foe';   // 正魔不两立
  return 'none';
}

// ============================================================ 议论
const TALK: Record<'good' | 'bad' | 'mid', string[]> = {
  good: ['这等心性，难得。', '听说了么？倒是条汉子。', '往后在路上遇见，我请他喝酒。', '修仙界里，这样的人不多了。'],
  bad: ['啧，惹不起，绕着走罢。', '心狠手辣，迟早遭报应。', '这种人，离远些好。', '怕是又要结下一桩血仇。'],
  mid: ['是真是假，谁说得准。', '江湖上的事，听听就好。', '嘿，有意思。', '且看他下回如何。'],
};
const SRC = ['茶肆说书人', '过路散修', '坊市掌柜', '酒楼伙计', '行脚商人', '巡山弟子'];

export class Enyuan {
  constructor(private readonly g: Game) {}
  get S(): EySave { const ws = this.g.ws as { ey?: EySave }; return (ws.ey ??= { v: 1, nseq: 1, rseq: 1, robbed: [], reports: [], feedRead: 0 }); }
  private t = 0; private kbT = 0; private dipT = 0; private kbTownT = 0;
  private helpP = -1e9; private inspectP = -1e9; private hideAskP = -1e9; private greetP = -1e9; private kbInspP: Record<string, number> = {};
  private lastTown: string | null = null;
  /** 战斗中按「打坐」键：开 / 关队伍指令菜单（PartyFrames 订阅） */
  menuOpen = false; onMenu?: (open: boolean) => void;

  // ============================================================ 每帧（半秒）
  frame(dt: number) {
    const g = this.g;
    this.t -= dt; if (this.t > 0) return; this.t = 0.5;
    if (g.offWorld || g.inCave || g.hero.dead) return;
    const S = this.S, play = playOf(g);
    if (S.hideP !== undefined && play > S.hideP) { S.hideP = undefined; if (g.concealed) { g.concealed = false; g.toast('你从百姓屋里出来，外头已经没人找你了。', 'info', { lv: 'low' }); } }
    // 口碑随游玩时间淡去（一分钟一点）
    this.kbT += 0.5; if (this.kbT >= 10) { this.kbFade(this.kbT / 60); this.kbT = 0; }
    this.duelTick();
    this.dipT -= 0.5; if (this.dipT <= 0) { this.dipT = 1; this.dipTick(); }
    this.kbTownT -= 0.5; if (this.kbTownT <= 0) { this.kbTownT = 1; this.kbTownTick(); }
    this.jadeTick();
  }
  /** 每日（game.update 的日结里，玩家侧；可以用 Math.random） */
  daily(_days: number) {
    this.reportTick();
    this.kbSpreadTick();
    this.hookTick();
  }

  // ============================================================ 1 + 4：化解恩怨
  /** 共同的好友：和他是亲友、又和你相熟的人 */
  commonFriend(d: NpcData): NpcData | null {
    const by = this.g.npcs.byId;
    let best: NpcData | null = null;
    for (const t of d.ties ?? []) {
      if (!(t.k === 'friend' || t.k === 'kin' || t.k === 'sworn' || t.k === 'master' || t.k === 'disciple')) continue;
      const o = by.get(t.id); if (!o || !o.alive || !o.met || o.favor < 40) continue;
      if (!best || o.favor > best.favor) best = o;
    }
    return best ?? this.g.rel.mediator(d);
  }
  /** 能请出面的宗门长辈：你的师父，或宗门里境界最高、能请得动的长老 */
  sectElder(): NpcData | null {
    const g = this.g, s = g.ws.sect;
    const master = g.npcs.list.find((d) => d.alive && d.bond === 'master');
    let best: NpcData | null = master ?? null;
    if (s) {
      const pool = g.roster.pick(s.id, 1, 3, 5, {});
      for (const d of pool) if (d.alive && (!best || d.realm > best.realm)) best = d;
      if (!best) for (const d of g.npcs.list) if (d.alive && d.sect === s.id && d.realm >= 2 && (!best || d.realm > best.realm)) best = d;
    }
    return best;
  }
  /** 宗门调停：贡献够、长老境界压得住，死仇降为旧怨（旧怨直接了结） */
  sectMediate(d: NpcData): { ok: boolean; why: string; elder?: NpcData } {
    const g = this.g, s = g.ws.sect;
    if (!s) return { ok: false, why: '你没有宗门可以倚仗' };
    const cost = mediateCost(d), el = this.sectElder();
    if (!el) return { ok: false, why: '宗门里请不到长辈出面' };
    if (s.contrib < cost) return { ok: false, why: `宗门贡献不足（需 ${cost}）`, elder: el };
    if (el.realm <= d.realm) return { ok: false, why: `${el.name}（${realmName(el.realm, el.stage)}）压不住对方（${realmName(d.realm, d.stage)}）`, elder: el };
    if (d.sect && d.sect === s.id) { /* 同门：长老一句话的事 */ }
    s.contrib -= cost;
    const g2 = (d.grudge ?? 0) >= 2;
    d.grudge = g2 ? 1 : 0; if (!d.grudge) d.why = undefined;
    d.heat = Math.min(heatOf(d), g2 ? 8 : 0); d.hunting = false; d.chasing = false; d.huntAt = undefined; d.huntP = undefined; d.search = undefined; d.waitUntil = undefined;
    d.warned = Math.floor(g.day);
    const sn = sectTitle(s.id);
    g.rel.log(`${sn}${el.name}出面调停，${d.name}${g2 ? '死仇降为旧怨' : '旧怨一笔勾销'}（耗贡献 ${cost}）。`, 'good');
    this.news(`${sn}${el.name}亲自出面，替门下弟子苏寒与${d.name}调停恩怨。${d.name}不敢不给这个面子。`, { tone: 'good' });
    return { ok: true, why: '', elder: el };
  }
  /** 化解的办法（恩怨页、对峙、宗门里共用）；rnd 由测试传入 */
  reconcileNode(d: NpcData, back?: () => DNode | null, rnd: () => number = Math.random): DNode {
    const g = this.g, h = g.hero, R = g.rel, day = g.day, play = playOf(g);
    const g2 = (d.grudge ?? 0) >= 2, title = `${realmName(d.realm, d.stage)} · ${g2 ? '血仇' : '旧怨'}`;
    const have = C.bagCount(h, 'mat_lingshi'), cost = R.parleyCost(d);
    const persK: Record<Pers, number> = { righteous: 0.8, kind: 0.9, cautious: 0.7, aloof: 0.6, greedy: 0.75, arrogant: 0.45, ruthless: 0.3 };
    const cool = (d.recP ?? 0) > play;
    const coolHint = cool ? `刚递过话，${Math.ceil(((d.recP ?? 0) - play) / 60)} 分钟后再试` : '';
    const done = (text: string, ok: boolean): DNode => ({ speaker: d.name, title, text, options: [{ label: ok ? '（了结）' : '（罢了）', tone: ok ? 'good' : undefined, act: () => (back ? back() : null) }], mood: ok ? 'normal' : 'danger' });
    const settle = (by: number, favorTo: number, why: string) => {
      d.grudge = Math.max(0, (d.grudge ?? 0) - by); if (!d.grudge) { d.why = undefined; d.heat = 0; }
      else d.heat = Math.min(heatOf(d), HEAT_STEP[1]);
      d.hunting = false; d.chasing = false; d.search = undefined; d.waitUntil = undefined;
      R.setFavor(d, Math.max(d.favor, favorTo));
      R.log(why, 'good');
    };
    const tried = () => { d.recP = play + 60; d.lastParley = day; };
    const opts: DOpt[] = [];
    // 赔礼
    opts.push({ label: `赔礼谢罪（灵石 ${cost}）`, disabled: have < cost || cool, hint: have < cost ? '灵石不足' : coolHint || (g2 ? '血仇难消：成算不高' : '旧怨：多半能成'), act: () => {
      tried();
      const p = persK[d.pers] * (g2 ? (d.pers === 'greedy' ? 0.55 : 0.3) : 1);
      if (rnd() < p) { C.removeItem(h, 'mat_lingshi', cost); d.wealth += cost; settle(1, g2 ? -40 : -5, `向${d.name}赔礼谢罪，${g2 ? '血仇稍解' : '前嫌尽释'}。`); this.news(`苏寒备了厚礼，登门向${d.name}赔罪。`, { tone: 'mid' }); return done(g2 ? '（对方盯着灵石看了许久，咬牙收下）……这笔账，暂且记下。' : '哼……看在你还算识相的份上，此事就此揭过。', true); }
      return done(g2 ? '灵石？你以为灵石能买回一条人命！' : '收起你的臭钱！', false);
    } });
    // 退还夺来的东西
    const lost = d.lost;
    if (lost) {
      const need = lost.stones ?? 0, it = lost.item, hasIt = !it || C.bagCount(h, it) > 0;
      opts.push({ label: `退还夺来的东西（灵石 ${need}${it ? ' 与原物' : ''}）`, tone: 'good', disabled: have < need || !hasIt || cool, hint: have < need ? '灵石不足' : !hasIt ? '原物已不在你身上' : coolHint || '物归原主，成算最大', act: () => {
        tried();
        C.removeItem(h, 'mat_lingshi', need); d.wealth += need; if (it) { C.removeItem(h, it, 1); }
        d.lost = undefined;
        if (rnd() < (g2 ? 0.7 : 0.95)) { settle(g2 ? 1 : 2, g2 ? -30 : 10, `把夺来的东西还给了${d.name}，${g2 ? '血仇降为旧怨' : '旧怨了结'}。`); this.news(`苏寒把夺来的东西原样还给了${d.name}。`, { tone: 'good' }); return done('（对方翻看了一遍，脸色缓和下来）……东西既然还回来了，这事我不追了。', true); }
        return done('（对方收下了东西，却冷冷看着你）东西是东西，账是账。', false);
      } });
    }
    // 托共同的好友调停
    const m = this.commonFriend(d);
    if (m) {
      const cd = R.S.mediateCd > day;
      opts.push({ label: `托${m.name}从中说和`, tone: 'good', disabled: cd || cool, hint: cd ? `刚请人说和过（${Math.ceil(R.S.mediateCd - day)} 日后）` : coolHint || `${m.name}与对方相熟，也信得过你`, act: () => {
        tried(); R.S.mediateCd = day + 40;
        if (rnd() < (g2 ? 0.55 : 0.85)) { settle(g2 ? 1 : 2, g2 ? -30 : 5, `${m.name}出面调停，你与${d.name}的恩怨${g2 ? '稍有缓和' : '一笔勾销'}。`); R.addFavor(m, -4); this.news(`${m.name}做东，替苏寒和${d.name}摆了一桌和头酒。`, { tone: 'good', src: m }); return done(`（${m.name}的传音符适时飞到）……既然${m.name}开口，这事就这么算了。`, true); }
        return done(`${m.name}的面子我给不起。`, false);
      } });
    }
    // 请宗门长辈出面
    if (g.ws.sect) {
      const el = this.sectElder(), c = mediateCost(d), s = g.ws.sect;
      const why = !el ? '宗门里请不到长辈' : s.contrib < c ? `贡献不足（${s.contrib}/${c}）` : el.realm <= d.realm ? `${el.name}压不住对方` : '';
      opts.push({ label: `请宗门长辈出面（贡献 ${c}${el ? `，${el.name}·${realmName(el.realm, el.stage)}` : ''}）`, tone: 'gold', disabled: !!why, hint: why || (g2 ? '死仇降为旧怨' : '旧怨直接了结'), act: () => {
        const r = this.sectMediate(d);
        return r.ok ? done(`（${r.elder!.name}的法旨送到，对方沉默良久）……既然${sectTitle(s.id)}的前辈开了口，这口气我咽下了。`, true) : done(r.why, false);
      } });
    }
    // 立心魔誓
    opts.push({ label: '以心魔立誓，永不与其为敌', disabled: cool, hint: coolHint || '立誓后再对他出手，心魔反噬', act: () => {
      tried();
      const p = persK[d.pers] * (g2 ? 0.55 : 1) * (d.pers === 'ruthless' ? 0.5 : 1);
      if (rnd() < p) { d.oath = true; settle(2, 0, `对${d.name}立下心魔大誓：此生不与其及其亲族为敌。`); this.news(`苏寒对${d.name}立下心魔大誓，此生不再为敌。`, { tone: 'mid' }); return done('（对方神识在你身上停了良久）……心魔誓不是儿戏。你若违誓，自有天收。', true); }
      return done('誓言？我不信你。', false);
    } });
    // 约生死斗
    const far = d.realm > h.realm + 1;
    const safeHere = g.combat.safeAt(g.player.x, g.player.y);
    opts.push({ label: '约一场生死斗：赢了恩怨两清', tone: 'bad', disabled: far || !!this.S.duel || cool || h.realm < 1 || safeHere, hint: h.realm < 1 ? '凡人之躯，斗不起' : far ? '境界差得太远，对方不屑与你斗' : this.S.duel ? '另有一场生死斗没打完' : safeHere ? '城镇、宗门地界里不许私斗，出了地界再约' : coolHint || '输了要赔三成灵石，他出了气，仇降为旧怨', act: () => { tried(); this.startDuel(d); return null; } });
    opts.push({ label: back ? '返回' : '罢了', act: () => (back ? back() : null) });
    const why = d.why ?? (g2 ? '血仇' : '旧怨');
    const hint = `${why}。\n\n（热度 ${marksOf(heatOf(d))} 级${d.feudBy === 'hero' ? '，是你先动的手' : d.feudBy === 'npc' ? '，是他那边先动的手' : ''}）`;
    return { speaker: d.name, title, text: `化解恩怨——${hint}`, options: opts, mood: 'danger' };
  }
  /** 对峙时多出的几条（relations.parleyNode 调）：退还 / 请宗门长辈 / 约生死斗 */
  parleyExtra(d: NpcData, onCalm: () => void): DOpt[] {
    const node = this.reconcileNode(d, () => { onCalm(); return null; });
    return node.options.filter((o) => /退还|宗门长辈|生死斗/.test(o.label)).map((o) => ({ ...o, act: () => { const r = o.act?.(); if (/生死斗/.test(o.label)) onCalm(); return r ?? null; } }));
  }

  // ============================================================ 生死斗
  /** 约下生死斗：他三息内到，就地画一座擂台 */
  startDuel(d: NpcData) {
    const g = this.g, p = g.player;
    if (g.combat.safeAt(p.x, p.y)) { g.toast('城镇、宗门地界里不许私斗——出了地界再约。', 'warn'); return false; }
    const a0 = g.npcs.summon(d.id);
    if (!a0) return false;
    const a = a0 as Active;
    a.act = 'idle'; a.st.x = d.x = p.x + 280; a.st.y = d.y = p.y; a.bubble = { text: '生死各安天命！', t: 3 };
    const e = g.npcs.toEnemy(a, true, true);
    e.tag = 'eyduel:' + d.id; (e as Enemy & { noFlee?: boolean }).noFlee = true;
    this.S.duel = { npcId: d.id, name: d.name, x: Math.round(p.x + 140), y: Math.round(p.y), map: ACTIVE_MAP, t0: playOf(g) };
    g.rel.log(`与${d.name}约下生死斗。`, 'info');
    g.toast(`生死斗：与${d.name}（${realmName(d.realm, d.stage)}）——赢了恩怨两清。`, 'warn');
    audio.sfx('thunder');
    return true;
  }
  private duelTick() {
    const g = this.g, du = this.S.duel; if (!du) return;
    const e = g.combat.enemies.find((x) => x.tag === 'eyduel:' + du.npcId);
    if (!e) { const d = g.npcs.byId.get(du.npcId); if (!d?.alive || playOf(g) - du.t0 > 5) this.S.duel = null; }
  }
  /** combat.onSparEnd：生死斗打完了（game.hookCombat 里先问这里） */
  onSpar(e: Enemy, won: boolean): boolean {
    if (!e.tag?.startsWith('eyduel:')) return false;
    const g = this.g, id = e.tag.slice(7), d = g.npcs.byId.get(id); this.S.duel = null;
    if (!d) return true;
    const a = g.npcs.activeOf(d.id);
    if (won) {
      d.grudge = 0; d.why = undefined; d.heat = 0; d.hunting = false; d.chasing = false; d.huntAt = undefined; d.huntP = undefined; d.lost = undefined; d.duelDone = Math.floor(g.day);
      g.rel.setFavor(d, Math.max(d.favor, 0));
      if (a) a.bubble = { text: '……我输了。恩怨两清。', t: 3 };
      g.rel.log(`生死斗胜了${d.name}，恩怨两清。`, 'good');
      g.toast(`生死斗得胜！${d.name}认输——恩怨两清。`, 'good', { lv: 'high' });
      this.news(`苏寒与${d.name}约下生死斗，当众胜之。${d.name}认输，两人恩怨两清。`, { tone: 'good' });
    } else {
      const h = g.hero, fee = Math.round(C.bagCount(h, 'mat_lingshi') * 0.3);
      if (fee > 0) { C.removeItem(h, 'mat_lingshi', fee); d.wealth += fee; }
      d.grudge = Math.min(d.grudge ?? 0, 1); d.heat = 0; d.hunting = false; d.chasing = false; d.duelDone = Math.floor(g.day);
      if (a) a.bubble = { text: '服了么？这口气，我出了。', t: 3 };
      g.rel.log(`生死斗败给${d.name}，赔了 ${fee} 灵石；他出了气，仇降为旧怨。`, 'bad');
      g.toast(`生死斗落败：赔了 ${fee} 灵石。${d.name}出了这口气，不再追着你。`, 'warn');
      this.news(`苏寒在生死斗里败给了${d.name}，赔了灵石。${d.name}说这口气出了。`, { tone: 'mid' });
    }
    if (a) { a.act = 'idle'; a.wait = 3; }
    return true;
  }
  /** 擂台地面：生死斗进行时画在地上 */
  private arena?: HTMLImageElement | null;
  collect(out: Drawable[]) {
    const du = this.S.duel; if (!du || du.map !== ACTIVE_MAP) return;
    if (this.arena === undefined) { if (typeof Image === 'undefined') { this.arena = null; return; } const im = new Image(); im.src = arenaUrl; this.arena = im; }
    const im = this.arena; if (!im || !im.complete || !im.naturalWidth) return;
    const R = 520;
    out.push({ y: du.y - 1e5, k: 'eyduel', draw: (c) => { c.save(); c.globalAlpha = 0.92; c.drawImage(im, du.x - R, du.y - R * 0.8, R * 2, R * 1.6); c.restore(); } });
  }

  // ============================================================ 2：宗门外交
  /** 你的身份：宗门；宗门开战时散修按投效的一方 */
  private mySide(): { sect?: string; war?: { w: typeof WARS[number]; side: 0 | 1 } } {
    const g = this.g, sect = g.ws.sect?.id;
    for (const w of WARS) {
      if (w.map !== ACTIVE_MAP) continue;
      const s = g.war.st(w.id); if (s.phase !== 'battle' && s.phase !== 'call') continue;
      const side = g.war.sideOf(w) ?? s.side;
      if (side !== undefined) return { sect, war: { w, side } };
    }
    return { sect };
  }
  /** d 对你是什么立场、闹到哪一级：0 无涉、1 挑衅、2 盘查、3 动手（开战且你在对面） */
  dipLevel(d: NpcData): { st: Stance; lv: number; war?: string } {
    const g = this.g, me = this.mySide();
    if (!d.sect) return { st: 'none', lv: 0 };
    if (me.war) {
      const ws = me.war.w.sides.findIndex((s) => s.sects.includes(d.sect!));
      if (ws >= 0) return ws === me.war.side ? { st: 'ally', lv: 0, war: me.war.w.name } : { st: 'foe', lv: g.war.st(me.war.w.id).phase === 'battle' && g.hero.realm >= 1 ? 3 : 2, war: me.war.w.name };
    }
    const st = stanceOf(me.sect, d.sect);
    if (st !== 'foe') return { st, lv: 0 };
    return { st, lv: g.hero.realm >= 1 && d.realm >= g.hero.realm - 1 ? 2 : 1 };
  }
  private dipTick() {
    const g = this.g, p = g.player, h = g.hero, play = playOf(g);
    if (g.modal || this.S.duel) return;
    const safe = g.combat.safeAt(p.x, p.y), fight = g.combat.inCombat;
    for (const a of (g.npcs as unknown as { active: Map<string, Active> }).active.values()) {
      const d = a.d;
      if (!d.alive || !d.sect || a.enemy || a.duel || a.parley || a.act === 'follow' || a.act === 'flee' || d.bond || d.beauty || d.stay || d.realm < 1 || (d.grudge ?? 0) > 0 || d.helpUntil) continue;
      const dd = Math.hypot(a.st.x - p.x, a.st.y - p.y); if (dd > 1400) continue;
      const L = this.dipLevel(d);
      if (L.st === 'ally' || L.st === 'self') {
        // 同盟 / 同门：你在打，他来帮
        if (fight && play >= this.helpP && dd < 1200) {
          this.helpP = play + DIP.help;
          d.helpUntil = g.time + 40; d.met = true; g.rel.setFavor(d, Math.max(d.favor, 15));
          const b = g.npcs.summon(d.id); if (b) b.bubble = { text: L.st === 'self' ? '师兄弟莫慌，我来！' : `${sectTitle(d.sect)}与贵派同气连枝——道友，我来助你！`, t: 3 };
          g.toast(`${sectTitle(d.sect)}的${d.name}（${realmName(d.realm, d.stage)}）路过，出手相助！`, 'good', { lv: 'high' });
          this.news(`${sectTitle(d.sect)}的${d.name}路见苏寒遇险，出手相助。`, { tone: 'good', src: d });
          return;
        }
        if (!fight && play >= this.greetP && dd < 700 && L.st === 'ally') { this.greetP = play + 40; a.bubble = { text: pick(['道友请了。', '同盟一脉，路上小心。', '贵派近来可好？']), t: 2.4 }; }
        continue;
      }
      if (L.st !== 'foe' || safe || fight || (d.dipP ?? 0) > play) continue;
      d.dipP = play + DIP.provoke;
      if (L.lv >= 3) {
        // 开战了：你在对面，他直接动手（先手记在他身上）
        markAssail(d, 'npc', g.day);
        a.bubble = { text: `${L.war}正打着——${sectTitle(g.ws.sect?.id) || '敌营'}的人，拿命来！`, t: 3 };
        g.npcs.toEnemy(a, true);
        g.toast(`${sectTitle(d.sect)}的${d.name}认出了你的身份，扑了上来！（${L.war}）`, 'warn');
        this.news(`${L.war}战火蔓延：${sectTitle(d.sect)}的${d.name}在路上截杀苏寒。`, { tone: 'bad', src: d });
        return;
      }
      if (L.lv === 2 && play >= this.inspectP && !g.pursuit.active) {
        this.inspectP = play + DIP.inspect;
        a.act = 'idle'; a.parley = true; a.st.faceToward(p.x - a.st.x, p.y - a.st.y);
        g.openDialog(this.dipInspectNode(a));
        return;
      }
      a.bubble = { text: pick([`哼，${sectTitle(g.ws.sect?.id) || '无名'}的人，也敢在此招摇？`, '看什么看？', '这条路，不是给你们走的。']), t: 2.6 };
      this.news(`${sectTitle(d.sect)}的${d.name}在路上冲苏寒冷嘲热讽。`, { tone: 'mid', src: d, quiet: true });
    }
  }
  /** 敌对宗门弟子盘查你：亮身份 / 交过路钱 / 不理会 / 动手 */
  dipInspectNode(a: Active, rnd: () => number = Math.random): DNode {
    const g = this.g, d = a.d, h = g.hero, s = g.ws.sect, sn = sectTitle(d.sect);
    const fee = Math.max(5, Math.round(20 * Math.pow(2.4, Math.max(0, d.realm - 1))));
    const title = `${sn} · 盘查`;
    const end = (text: string): DNode => { a.parley = false; a.act = 'idle'; a.wait = 2; return { speaker: d.name, title, text, options: [{ label: '（走）', act: () => null }] }; };
    const rank = s?.rank ?? 0, high = !!s && (rank >= 2 || h.realm > d.realm);
    return {
      speaker: d.name, title, mood: 'danger',
      text: `（${d.name}横身拦住去路，上下打量你）${s ? `${sectTitle(s.id)}的人？` : '哪来的散修？'}报上名来，身上带了什么，一样样摊开！`,
      options: [
        ...(s ? [{ label: `亮出${sectTitle(s.id)}的身份牌${high ? '' : '（他未必买账）'}`, tone: 'gold' as const, act: () => {
          if (high || rnd() < 0.4) { g.rel.log(`${sn}的${d.name}盘查你，见了你的身份牌，悻悻放行。`, 'info'); return end('（对方看清了牌子上的字，脸色一变）……算你走运，走吧。'); }
          markAssail(d, 'npc', g.day); a.parley = false; g.npcs.toEnemy(a, true); a.bubble = { text: '身份牌？在这里不好使！', t: 2.4 };
          this.news(`${sn}的${d.name}盘查苏寒不成，当街动手。`, { tone: 'bad', src: d }); return null;
        } }] : []),
        { label: `交过路钱（灵石 ${fee}）`, disabled: C.bagCount(h, 'mat_lingshi') < fee, hint: C.bagCount(h, 'mat_lingshi') < fee ? '灵石不足' : '', act: () => { C.removeItem(h, 'mat_lingshi', fee); d.wealth += fee; return end('（对方掂了掂灵石）识相。滚吧。'); } },
        { label: '不理他，径直走开', act: () => {
          if (rnd() < 0.5) return end('（对方骂了一句，到底没敢动手）');
          markAssail(d, 'npc', g.day); a.parley = false; g.npcs.toEnemy(a, true); a.bubble = { text: '站住！', t: 2 }; return null;
        } },
        { label: '动手（你先动的手）', tone: 'bad', act: () => { markAssail(d, 'hero', g.day); a.parley = false; g.npcs.toEnemy(a, true); return null; } },
      ],
    };
  }

  // ============================================================ 3：队伍指令
  static ORDERS: PartyOrder[] = ['cover', 'flank', 'escort', 'spare'];
  /** 战斗中按「打坐」键（打坐在战斗里用不上）：开 / 关队伍指令菜单；没有队友或不在战斗中返回 false（照常打坐） */
  squadKey(): boolean {
    const g = this.g;
    if (!g.npcs.followers().length) return false;
    if (!this.menuOpen && !g.combat.inCombat) return false;
    this.menuOpen = !this.menuOpen; this.onMenu?.(this.menuOpen);
    audio.sfx('click');
    return true;
  }
  /** 下战术指令时顺手记下「别杀他」的是谁 */
  onOrder(d: NpcData, o: PartyOrder) {
    const L = this.g.combat.lock;
    if (o === 'spare') d.spareId = L && !L.dead ? (L.npcId ?? String(L.id)) : undefined;
  }
  private threat(x: number, y: number, R = 1100): Enemy | null {
    let best: Enemy | null = null, bd = R;
    for (const e of this.g.combat.enemies) if (!e.dead && !e.spar && e.aggro) { const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; best = e; } }
    return best;
  }
  /** 队友该站哪（null = 照原来的站位） */
  squadPos(a: Active, ord: PartyOrder): { x: number; y: number } | null {
    const g = this.g, p = g.player;
    if (!g.combat.inCombat) return null;
    const t = this.threat(p.x, p.y); if (!t) return null;
    const dx = t.x - p.x, dy = t.y - p.y, dd = Math.hypot(dx, dy) || 1, ux = dx / dd, uy = dy / dd;
    if (ord === 'cover') return { x: p.x + ux * 150 - uy * 40, y: p.y + uy * 150 + ux * 40 };   // 挡在你和来敌之间
    if (ord === 'escort') return { x: p.x + ux * 220, y: p.y + uy * 220 };   // 断后：站在追兵来的方向
    if (ord === 'flank') {   // 包抄：绕到敌人背后
      const L = g.combat.lock && !g.combat.lock.dead ? g.combat.lock : t;
      const lx = L.x - p.x, ly = L.y - p.y, ld = Math.hypot(lx, ly) || 1;
      return { x: L.x + lx / ld * 260, y: L.y + ly / ld * 260 };
    }
    return null;
  }
  /** 队友打谁（undefined = 照原来的挑法；null = 这一下不出手） */
  squadTarget(a: Active, ord: PartyOrder, def: Enemy | null): Enemy | null | undefined {
    const g = this.g, p = g.player, sid = a.d.spareId;
    const spared = (e: Enemy | null) => !!e && !!sid && (e.npcId === sid || String(e.id) === sid);
    if (ord === 'cover' || ord === 'escort') { const t = this.threat(p.x, p.y, ord === 'escort' ? 600 : 900); return t ?? null; }
    if (ord === 'flank') { const L = g.combat.lock; return L && !L.dead && !L.spar ? L : def; }
    if (ord === 'spare') {
      if (!spared(def)) return def;
      // 只剩他一个：气血见底就停手
      for (const e of g.combat.enemies) if (!e.dead && !e.spar && e.aggro && !spared(e) && Math.hypot(e.x - a.st.x, e.y - a.st.y) < 900) return e;
      return def && def.hp > def.maxHp * 0.35 ? def : null;
    }
    return undefined;
  }
  /** 包抄从背后打，伤害高些 */
  squadDmg(ord: PartyOrder) { return ord === 'flank' ? 1.3 : 1; }
  /** 你杀了人（rel.onPlayerKill 调）：队友按自己的底线记一笔 */
  onHeroKill(d: NpcData, selfDef: boolean) {
    const g = this.g;
    let w = 0, why = '';
    if (d.realm === 0 && d.faction === 'mortal') { w = 2; why = `${d.name}只是个凡人`; }
    else if (d.yielded) { w = 2; why = `${d.name}已经求饶了`; }
    for (const a of g.npcs.followers()) {
      const m = a.d;
      let v = w, r = why;
      if (m.spareId && m.spareId === d.id) { v = Math.max(v, 3); r = `说好了别杀${d.name}`; }
      if (!selfDef && d.faction !== 'demon' && (m.pers === 'righteous' || m.pers === 'kind')) { v = Math.max(v, 1); r ||= `${d.name}没招惹你`; }
      if (v > 0) this.qualm(a, v, r);
    }
    this.reportOnDeath(d, true);
    this.kbOnKill(d, selfDef);
    g.laifang?.onHeroKill(d);   // 第三批：你替谁出了头（答应过的求助），他记着这份人情
    g.duobao?.onKill(d);
  }
  /** 斩草除根（求饶的人）：relations.yieldNode 调 */
  onRuthless(d: NpcData) { d.yielded = true; }
  /** 队友的底线：劝一次，再犯离队 */
  qualm(a: Active, v: number, why: string) {
    if (this.g.dazi?.qualm(a, v, why)) return;   // 第三批：固定搭档有自己的底线（劝你、离开你、反目成仇）
    const g = this.g, m = a.d, lim = LIMIT[m.pers] ?? 3;
    m.sqQ = (m.sqQ ?? 0) + v;
    if (m.sqQ < lim) return;
    if (!m.sqW) {
      m.sqW = 1; m.sqQ = Math.max(0, lim - 1);
      a.bubble = { text: `${why}……道友，收手吧。再这样，我不跟了。`, t: 4 };
      g.toast(`${m.name}劝你：${why}，下手太狠了。再犯，${m.sex === 'f' ? '她' : '他'}就离队。`, 'warn');
      g.rel.log(`${m.name}劝你收手（${why}）。`, 'bad');
      return;
    }
    // 再犯：离队
    a.bubble = { text: '道不同，不相为谋。告辞。', t: 4 };
    g.party.order(m.id, 'follow');
    m.bond = undefined; m.bondUntil = undefined; m.helpUntil = undefined; m.sqQ = 0; m.sqW = undefined; m.order = undefined; m.spareId = undefined;
    g.rel.addFavor(m, -25);
    g.npcs.dismiss(m.id);
    g.toast(`${m.name}看不下去，离队而去。`, 'warn', { lv: 'high' });
    g.rel.log(`${m.name}因你下手太狠（${why}），离队而去。`, 'bad');
    this.news(`${m.name}与苏寒分道扬镳，据说是看不惯他下手太狠。`, { tone: 'bad', src: m });
  }

  // ============================================================ 5：报官反悬赏
  /** 被劫了（拦路索财交了钱、储物袋被抢）：记下来，回城可报案 */
  onRobbed(d: NpcData, loss: number) {
    const g = this.g, S = this.S;
    S.robbed = S.robbed.filter((r) => r.npcId !== d.id && g.day - r.day < 120);
    S.robbed.push({ npcId: d.id, name: d.name, realm: d.realm, stage: d.stage, day: Math.floor(g.day), loss: Math.round(loss) });
    if (S.robbed.length > 6) S.robbed.shift();
    this.news(`有人看见${d.name}在路上拦劫苏寒，得手后扬长而去。`, { tone: 'mid', hook: { k: 'report' } });
  }
  /** 还能报的案 */
  reportable() { const g = this.g; return this.S.robbed.filter((r) => !r.reported && g.day - r.day < 120 && g.npcs.byId.get(r.npcId)?.alive); }
  /** 报案：劫匪上悬赏榜，执法弟子 / 赏金客去拿他 */
  report(r: EyRobbed, l: LocDef) {
    const g = this.g, S = this.S, d = g.npcs.byId.get(r.npcId); if (!d) return null;
    const at: 'town' | 'sect' = l.type === 'sect' ? 'sect' : 'town';
    r.reported = true;
    const rep: EyReport = { id: S.rseq++, npcId: d.id, name: d.name, realm: d.realm, stage: d.stage, where: l.id, whereName: l.name, at, day: Math.floor(g.day), dueDay: g.day + REPORT_DAYS, dueP: playOf(g) + REPORT_PLAY, tries: 0, status: 'open', loss: r.loss, reward: Math.round(80 * Math.pow(3, Math.max(0, d.realm - 1))) };
    S.reports.push(rep); if (S.reports.length > 12) S.reports.splice(0, S.reports.length - 12);
    d.wanted = rep.id;
    g.rel.log(`在${l.name}报案：${d.name}（${realmName(d.realm, d.stage)}）拦路劫掠。${at === 'sect' ? '执法堂' : '坊市'}已贴出通缉。`, 'info');
    this.news(`${l.name}贴出通缉：${d.name}（${realmName(d.realm, d.stage)}）拦路劫掠，赏 ${rep.reward} 灵石。`, { tone: 'mid', hook: { k: 'wanted' } });
    this.kbAdd(l.id, 3, '报案');
    this.g.zhifa?.dispatch(rep);   // 第三批：执法弟子 / 巡察使真的出发去抓人
    return rep;
  }
  /** 第三批：NPC 之间的劫案被人报了官（world/zhifa.ts 调）：上悬赏榜 */
  npcReport(d: NpcData, l: LocDef, o: { victim: string; victimId?: string; crime: string; loss: number; by: string }): EyReport | null {
    const g = this.g, S = this.S;
    if (d.wanted !== undefined) return null;
    const at: 'town' | 'sect' = l.type === 'sect' ? 'sect' : 'town';
    const rep: EyReport = { id: S.rseq++, npcId: d.id, name: d.name, realm: d.realm, stage: d.stage, where: l.id, whereName: l.name, at, day: Math.floor(g.day), dueDay: g.day + REPORT_DAYS, dueP: playOf(g) + REPORT_PLAY, tries: 0, status: 'open', loss: o.loss, reward: Math.round(60 * Math.pow(3, Math.max(0, d.realm - 1))), npc: { victim: o.victim, victimId: o.victimId, crime: o.crime, by: o.by } };
    S.reports.push(rep); if (S.reports.length > 12) S.reports.splice(0, S.reports.length - 12);
    d.wanted = rep.id;
    this.news(`${l.name}贴出通缉：${d.name}（${realmName(d.realm, d.stage)}）${o.crime}，${o.by === '苦主' ? `${o.victim}亲自去报的案` : o.by === '你' ? '你也看见了' : '有人看见了'}。赏 ${rep.reward} 灵石。`, { tone: 'bad', src: `${l.name}${at === 'sect' ? '执法堂' : '坊市'}`, hook: { k: 'wanted' } });
    return rep;
  }
  /** 拿人的那一方：宗门执法弟子（看宗门实力）/ 城里的赏金客（看城大小） */
  private catcher(r: EyReport): { name: string; realm: number } {
    const g = this.g;
    if (r.lawName) return { name: r.lawName, realm: r.lawRealm ?? Math.max(1, r.realm) };   // 第三批：派出去的那一位
    if (r.at === 'sect') { const top = g.roster.pick(r.where, 1, Math.max(2, r.realm), 5, {})[0]; return { name: top ? `${sectTitle(r.where)}执法弟子${top.name}` : `${sectTitle(r.where)}执法堂`, realm: top?.realm ?? Math.max(2, r.realm) }; }
    const L = LOC_BY_ID.get(r.where), t = L ? cityTier(L) : 1;
    return { name: pick(['赏金客铁手', '赏金客柳七', '赏金客冷面胡', '赏金客独眼常']), realm: clamp(1 + Math.floor(t * 0.7), 1, 4) };
  }
  private reportTick() {
    const g = this.g, play = playOf(g);
    for (const r of this.S.reports) {
      if (r.status !== 'open' || g.day < r.dueDay || play < r.dueP) continue;
      const d = g.npcs.byId.get(r.npcId);
      if (!d || !d.alive) { r.status = 'dead'; g.zhifa?.release(r.id); continue; }
      if (g.zhifa?.chasingNow(r)) continue;   // 第三批：执法弟子正当着你的面追他，交给路上的那一场
      const c = this.catcher(r), p = clamp(0.55 + (c.realm - d.realm) * 0.2, 0.15, 0.95);
      if ((r.npc ? lcg() : Math.random()) < p) this.caught(r, d, c.name);   // NPC 之间的案子用自己的小随机数（不动 Math.random 的序列）
      else if (++r.tries >= 2) this.fled(r);
      else { r.dueDay = g.day + REPORT_DAYS; r.dueP = play + REPORT_PLAY; }
    }
  }
  /** 通缉犯跑了：通缉落空 */
  fled(r: EyReport) {
    const g = this.g;
    r.status = 'fled'; g.zhifa?.release(r.id);
    const d = g.npcs.byId.get(r.npcId); if (d) d.wanted = undefined;
    this.news(`${r.name}听到风声，远遁他乡——${r.whereName}的通缉落了空。`, { tone: 'mid', hook: { k: 'wanted' } }); g.rel.log(`${r.name}跑了，${r.whereName}的通缉落了空。`, 'bad');
  }
  /** 拿到了：劫匪伏法，你收到消息和一点补偿（NPC 之间的案子：赃物追回给苦主）；onRoad：在路上当着你的面拿下的 */
  caught(r: EyReport, d: NpcData, by: string, onRoad = false) {
    const g = this.g;
    r.status = 'caught'; r.by = by; g.zhifa?.release(r.id);
    if (r.npc) {
      const v = r.npc.victimId ? g.npcs.byId.get(r.npc.victimId) : undefined;
      if (v?.alive) v.wealth += Math.round(r.loss * 0.6);
      d.wanted = undefined;
      g.npcs.die(d, `被${by}缉拿归案`);
      this.news(`${by}${onRoad ? '在路上追上了' : '在荒郊拿住了'}通缉犯${d.name}（${r.npc.crime}），押回${r.whereName}${r.at === 'sect' ? '执法堂' : ''}听候发落。${v?.alive ? `${v.name}的财物追回了大半。` : ''}`, { tone: 'good', hook: { k: 'wanted' } });
      this.kbAdd(r.where, 2, '缉凶了结', false);
      return;
    }
    const comp = Math.max(10, Math.round(r.loss * 0.6 + 15 * Math.pow(2, Math.max(0, d.realm - 1))));
    r.comp = comp; C.addItem(g.hero, 'mat_lingshi', comp);
    d.wanted = undefined;
    g.npcs.die(d, `被${by}缉拿伏法`);
    g.rel.log(`${by}拿下了劫匪${d.name}。${r.whereName}送来补偿 ${comp} 灵石。`, 'good');
    g.toast(`${r.whereName}传讯：劫匪${d.name}已被${by}缉拿伏法。补偿 ${comp} 灵石。`, 'good', { lv: 'high' });
    this.news(`${by}在荒郊拿住了劫匪${d.name}，${r.whereName}的通缉了结。`, { tone: 'good', hook: { k: 'wanted' } });
    this.kbAdd(r.where, 4, '缉凶了结');
  }
  /** 通缉犯死了（你亲手、或别人）：了结那张通缉 */
  reportOnDeath(d: NpcData, byHero: boolean) {
    const g = this.g;
    for (const r of this.S.reports) if (r.npcId === d.id && r.status === 'open') {
      r.status = byHero ? 'caught' : 'dead'; r.by = byHero ? '你' : undefined; g.zhifa?.release(r.id);
      if (byHero) { C.addItem(g.hero, 'mat_lingshi', r.reward); r.comp = r.reward; g.toast(`亲手拿下通缉犯${d.name}：${r.whereName}赏 ${r.reward} 灵石。`, 'good'); this.news(`苏寒亲手拿下了${r.whereName}通缉的劫匪${d.name}。`, { tone: 'good' }); this.kbAdd(r.where, 6, '缉凶'); }
    }
  }
  /** 悬赏榜上的通缉（happen.boardNode 里列出） */
  boardOpts(townId: string): DOpt[] {
    const g = this.g, out: DOpt[] = [];
    for (const r of this.S.reports) {
      if (r.status !== 'open') continue;
      const d = g.npcs.byId.get(r.npcId); if (!d?.alive) continue;
      const here = npcMap(d) === ACTIVE_MAP, p = g.player;
      out.push({ label: `【通缉】${r.name}（${realmName(r.realm, r.stage)}）· ${r.npc?.crime ?? '拦路劫掠'} · 赏 ${r.reward} 灵石${r.where === townId ? '' : `（${r.whereName}贴出）`}`, tone: 'bad', hint: here ? `${dirName(d.x - p.x, d.y - p.y)}方约 ${Math.max(1, Math.round(Math.hypot(d.x - p.x, d.y - p.y) / 260))} 里 · ${r.law && r.lawName ? `${r.lawName}正在追他` : '执法弟子与赏金客也在拿他'}` : '不在此地', act: () => { if (here) { g.setGuide(d.x, d.y, `通缉：${d.name}`); g.toast(`亲自缉拿${d.name}：地图上指了他的大致去向。`, 'info'); } return null; } });
    }
    return out;
  }
  /** 坊市 / 宗门里的「报案」对话 */
  reportNode(l: LocDef): DNode {
    const g = this.g, list = this.reportable();
    const who = l.type === 'sect' ? `${l.name}执法堂` : `${l.name}坊市执事`;
    const opts: DOpt[] = list.map((r) => ({ label: `报案：${r.name}（${realmName(r.realm, r.stage)}）· 第 ${Math.floor(r.day / 360) + 1} 年拦路劫你 · 损失 ${r.loss} 灵石`, tone: 'good' as const, act: () => {
      const rep = this.report(r, l);
      return { speaker: who, title: '报案', text: rep ? `（执事提笔记下，盖上朱印）\n\n「${r.name}，拦路劫掠——此等恶徒，${l.type === 'sect' ? '本门执法弟子' : '坊市自会请赏金客'}去拿。」\n\n通缉已贴上悬赏榜，赏 ${rep.reward} 灵石。约 ${REPORT_DAYS} 日、${REPORT_PLAY / 60} 分钟游玩之后见分晓；拿到了，你会收到传讯和一点补偿。` : '（人已不在了）', options: [{ label: '看看通缉榜', act: () => { this.openPanel('wanted'); return null; } }, { label: '告辞', act: () => null }] };
    } }));
    if (!list.length) opts.push({ label: '（眼下没有可报的案——被人劫过才有）', disabled: true, act: () => null });
    opts.push({ label: '看看通缉榜', act: () => { this.openPanel('wanted'); return null; } });
    opts.push({ label: '离开', act: () => null });
    return { speaker: who, title: '报案', text: '「被人劫了？说吧，是谁、在哪、劫走了什么。」\n\n（报案后劫匪上悬赏榜；执法弟子或赏金客会去拿他，你也可以亲自去）', options: opts };
  }
  /** 城镇面板里多出的事务卡（ModalLayer.TownPanel 调） */
  townFacs(l: LocDef): { seal: string; name: string; desc: string; act: () => void; cls?: string }[] {
    const g = this.g, out: { seal: string; name: string; desc: string; act: () => void; cls?: string }[] = [];
    const n = this.reportable().length, open = this.S.reports.filter((r) => r.status === 'open').length;
    const canReport = l.type !== 'sect' || g.ws.sect?.id === l.id;
    if (canReport) out.push({ seal: '案', name: l.type === 'sect' ? '执法堂报案' : '报官', desc: n ? `有 ${n} 桩劫案可报——劫匪上悬赏榜，执法弟子去拿人` : `被人劫了来这里报案（通缉中 ${open}）`, act: () => g.openDialog(this.reportNode(l)), cls: n ? 'gold' : '' });
    out.push({ seal: '缉', name: '通缉榜', desc: open ? `通缉中 ${open} 人` : '眼下没有通缉', act: () => this.openPanel('wanted') });
    if (g.ws.sect?.id === l.id) out.push({ seal: '调', name: '请长老调停', desc: '花宗门贡献请长老出面，化解死仇', act: () => g.openDialog(this.sectHallNode(l)), cls: 'gold' });
    return out;
  }
  /** 宗门里：请长老调停（列出你的仇家） */
  sectHallNode(l: LocDef): DNode {
    const g = this.g, s = g.ws.sect, el = this.sectElder();
    const rows = g.rel.feud.rows().slice(0, 6);
    const opts: DOpt[] = rows.map((r) => {
      const c = mediateCost(r.d), why = !s ? '' : s.contrib < c ? `贡献不足（${s.contrib}/${c}）` : !el ? '请不到长辈' : el.realm <= r.d.realm ? `${el.name}压不住${r.d.name}` : '';
      return { label: `${r.d.name}（${realmName(r.d.realm, r.d.stage)}）· ${(r.d.grudge ?? 0) >= 2 ? '血仇' : '旧怨'} · 贡献 ${c}`, disabled: !!why, hint: why || ((r.d.grudge ?? 0) >= 2 ? '死仇降为旧怨' : '旧怨了结'), act: () => { const x = this.sectMediate(r.d); g.toast(x.ok ? `${x.elder!.name}出面，${r.d.name}的恩怨化解了。` : x.why, x.ok ? 'good' : 'warn'); return this.sectHallNode(l); } };
    });
    if (!rows.length) opts.push({ label: '（眼下没人与你结仇）', disabled: true, act: () => null });
    opts.push({ label: '离开', act: () => null });
    return { speaker: `${l.name} · 长老院`, title: el ? `可请：${el.name}（${realmName(el.realm, el.stage)}）` : '长老闭关', text: `执事翻开簿子：「门下弟子与人结怨，可请长老出面调停——对方境界须在长老之下，长老的面子才压得住。要耗些宗门贡献。」\n\n你的贡献：${s?.contrib ?? 0}`, options: opts };
  }

  // ============================================================ 6：各地口碑
  /** 城镇的口碑（存在 townwreck 的 TWCity.good 上，-100–100） */
  kb(id: string) { return this.g.combat?.wreck?.town.state(id)?.good ?? 0; }
  kbAdd(id: string, v: number, why: string, spread = true) {
    const g = this.g, st = g.combat?.wreck?.town.state(id, true); if (!st) return;
    st.good = clamp(st.good + v, -100, 100); st.kbWhy = why; st.kbDay = Math.floor(g.day);
    if (spread && Math.abs(v) >= 2) for (const n of this.neighbors(id)) (this.S.kbQ ??= []).push({ to: n.id, v: v * KB.spread, day: g.day + KB.spreadDays, p: playOf(g) + KB.spreadPlay, from: id });
    if (this.S.kbQ && this.S.kbQ.length > 40) this.S.kbQ.splice(0, this.S.kbQ.length - 40);
  }
  /** 商路上的邻城：同一张图上最近的三座城镇 */
  neighbors(id: string): LocDef[] {
    const L = LOC_BY_ID.get(id); if (!L) return [];
    return LOCATIONS.filter((l) => l.id !== id && l.map === L.map && (l.type === 'city' || l.type === 'town')).map((l) => ({ l, d: Math.hypot(l.x - L.x, l.y - L.y) })).filter((x) => x.d < 900).sort((a, b) => a.d - b.d).slice(0, 3).map((x) => x.l);
  }
  private kbSpreadTick() {
    const g = this.g, Q = this.S.kbQ; if (!Q?.length) return;
    const play = playOf(g);
    for (let i = Q.length - 1; i >= 0; i--) {
      const q = Q[i]; if (g.day < q.day || play < q.p) continue;
      Q.splice(i, 1); this.kbAdd(q.to, q.v, `从${LOC_BY_ID.get(q.from)?.name ?? '邻城'}传来`, false);
    }
  }
  /** 淡去：每分钟游玩往 0 回一点 */
  kbFade(min: number) {
    const C0 = this.g.ws.townwreck?.c; if (!C0) return;
    for (const id in C0) { const st = C0[id]; if (!st.good) continue; const s = Math.sign(st.good); st.good = Math.abs(st.good) <= KB.fadePerMin * min ? 0 : st.good - s * KB.fadePerMin * min; }
  }
  kbTier(v: number) { return v >= 60 ? '有口皆碑' : v >= KB.good ? '口碑好' : v <= -60 ? '人人喊打' : v <= KB.bad ? '口碑坏' : '寻常'; }
  /** 地点卡、城镇面板上的一行 */
  kbLine(id: string): { v: number; tier: string; text: string; cls: string } {
    const v = Math.round(this.kb(id)), tier = this.kbTier(v);
    const text = v >= KB.hide ? '百姓见了你打招呼，铺子九折，被追杀时肯帮你躲' : v >= KB.good ? '百姓见了你打招呼，铺子九折' : v <= KB.inspect ? '百姓见你就躲，有人报官，守卫要盘查你' : v <= KB.bad ? '百姓见你就躲，铺子加价' : '没人特别留意你';
    return { v, tier, text, cls: v >= KB.good ? 'good' : v <= KB.bad ? 'bad' : '' };
  }
  /** 铺子价格倍数（town.shop 调） */
  priceMul(id: string) { const v = this.kb(id); return v >= 60 ? 0.85 : v >= KB.good ? 0.9 : v <= KB.bad ? 1.2 : 1; }
  /** 你在哪座城里（城镇地界） */
  townHere(): LocDef | null {
    const g = this.g, z = g.terrain.inLocZone(g.player.x, g.player.y, 0); if (!z) return null;
    const l = LOC_BY_ID.get(z.id); return l && (l.type === 'city' || l.type === 'town' || l.type === 'isle') ? l : null;
  }
  private kbOnKill(d: NpcData, selfDef: boolean) {
    const g = this.g, p = g.player;
    const z = g.terrain.inLocZone(p.x, p.y, 2400); if (!z) return;
    const l = LOC_BY_ID.get(z.id); if (!l || l.type === 'sect') return;
    if (selfDef && (d.faction === 'demon' || d.robCd !== undefined || d.wanted)) { this.kbAdd(l.id, 6, `替${l.name}除了一害`); this.news(`${l.name}一带都在传：苏寒在城外斩了恶徒${d.name}。`, { tone: 'good' }); }
    else if (!selfDef) { this.kbAdd(l.id, d.faction === 'mortal' ? -25 : -12, `在${l.name}行凶`); this.news(`${l.name}的百姓议论纷纷：苏寒在城边当众杀了${d.name}。`, { tone: 'bad' }); }
  }
  /** 城里：好口碑打招呼 / 帮你躲；坏口碑见你就躲 / 报官盘查 */
  private kbTownTick() {
    const g = this.g, l = this.townHere(), play = playOf(g);
    if (l?.id !== this.lastTown) { this.lastTown = l?.id ?? null; if (l) { const k = this.kbLine(l.id); if (k.cls) g.toast(`${l.name}口碑：${k.tier}（${k.v > 0 ? '+' : ''}${k.v}）——${k.text}`, k.cls === 'bad' ? 'warn' : 'good', { lv: 'low' }); } }
    if (!l || g.modal || this.S.duel) return;
    const v = this.kb(l.id), p = g.player;
    const act = (g.npcs as unknown as { active: Map<string, Active> }).active;
    if (v >= KB.hide && play >= this.hideAskP && this.inDanger()) {
      this.hideAskP = play + KB.hideCd;
      g.openDialog(this.hideNode(l));
      return;
    }
    if (v >= KB.good && play >= this.greetP) {
      for (const a of act.values()) if (!a.enemy && a.act !== 'follow' && !a.bubble && Math.hypot(a.st.x - p.x, a.st.y - p.y) < 420) { a.bubble = { text: pick(['仙师来了！', '苏仙师，里边请！', '仙师上回帮了大忙！', '这不是苏仙师么！']), t: 2.4 }; this.greetP = play + 25; break; }
    }
    if (v <= KB.bad) {
      for (const a of act.values()) if (!a.enemy && a.act !== 'follow' && a.d.realm === 0 && Math.hypot(a.st.x - p.x, a.st.y - p.y) < 380 && a.act !== 'flee') { a.act = 'flee'; a.bubble = { text: pick(['快躲开，是那个煞星！', '别看他……走、走。', '关门！关门！']), t: 2 }; break; }
      if (v <= KB.inspect && play >= (this.kbInspP[l.id] ?? -1e9) && !g.combat.inCombat) {
        this.kbInspP[l.id] = play + KB.inspectCd;
        g.toast(`有人去报了官——${l.name}的守卫朝你走来。`, 'warn');
        g.openDialog(this.guardNode(l));
      }
    }
  }
  /** 有人在追你：追杀中、有三枚血印以上的仇家在这张图上找你、或被人围着打 */
  inDanger() {
    const g = this.g;
    if (g.pursuit.active) return true;
    for (const d of g.npcs.list) if (d.alive && (d.hunting || d.chasing) && npcMap(d) === ACTIVE_MAP && heatOf(d) >= HUNT_MIN) return true;
    return g.combat.enemies.some((e) => !e.dead && e.aggro && !e.spar && !!e.npcId && Math.hypot(e.x - g.player.x, e.y - g.player.y) < 1100);
  }
  /** 「仙师进屋躲躲」 */
  hideNode(l: LocDef): DNode {
    const g = this.g;
    return {
      speaker: `${l.name}的百姓`, title: '进屋躲躲', mood: 'normal',
      text: `（街边一户人家的门开了一道缝，一个老汉压低声音朝你招手）\n仙师！快进屋躲躲！外头那些人，咱们替你挡着。\n\n（${l.name}口碑好：躲进去热度降一档，追兵丢了你的踪迹）`,
      options: [
        { label: '进屋躲躲', tone: 'good', act: () => { this.hide(l); return null; } },
        { label: '不必了，多谢', act: () => null },
      ],
    };
  }
  /** 躲进百姓屋里：热度降一档、追兵丢了目标 */
  hide(l: LocDef) {
    const g = this.g, S = this.S, F = g.rel.feud;
    S.hideP = playOf(g) + KB.hideFor;
    g.concealed = true;
    if (g.pursuit.active) g.pursuit.finish('escaped');
    let n = 0;
    for (const d of g.npcs.list) {
      if (!d.alive || npcMap(d) !== ACTIVE_MAP || !((d.heat ?? 0) > 0 || d.hunting || d.chasing)) continue;
      const h = heatOf(d), m = marksOf(h);
      d.heat = m > 0 ? Math.min(h, HEAT_STEP[m - 1] - 1) : 0;
      if (d.hunting || d.chasing) n++;
      d.hunting = false; d.chasing = false; d.search = undefined; d.searchP = undefined; d.waitUntil = undefined; d.waitP = undefined;
      if (d.seen) d.seen = { ...d.seen, x: d.seen.x + 9000, y: d.seen.y };   // 最后见到你的地方挪走了：他们只当你出了城
    }
    for (const e of g.combat.enemies) if (!e.dead && e.aggro && e.npcId && Math.hypot(e.x - g.player.x, e.y - g.player.y) < 1600) { e.aggro = false; (e as Enemy & { hx?: number }).hx = e.x; }
    void F;
    this.kbAdd(l.id, -2, '替你担了风险', false);
    g.toast(`你躲进了${l.name}百姓的屋里。追你的人${n ? `（${n} 个）` : ''}扑了个空——热度降了一档。`, 'good', { lv: 'high' });
    g.rel.log(`在${l.name}躲进百姓屋里，甩掉了追兵。`, 'good');
    this.news(`${l.name}的百姓把苏寒藏进屋里，追兵挨家搜了一遍，一无所获。`, { tone: 'good' });
    audio.sfx('chime');
  }
  /** 坏口碑：守卫盘查 */
  guardNode(l: LocDef): DNode {
    const g = this.g, h = g.hero, fine = Math.max(10, Math.round(30 * Math.pow(2, Math.max(0, h.realm - 1)))), have = C.bagCount(h, 'mat_lingshi');
    const s = g.ws.sect;
    return {
      speaker: `${l.name}城卫`, title: '盘查', mood: 'danger',
      text: `（两名城卫拦住你，长枪一横）有人报官，说你在${l.name}一带行凶。报上名来，跟我们走一趟！\n\n（${l.name}口碑：${this.kbLine(l.id).tier}）`,
      options: [
        { label: `认罚（罚银 ${fine} 灵石）`, disabled: have < fine, hint: have < fine ? '灵石不足' : '口碑回升一些', act: () => { C.removeItem(h, 'mat_lingshi', fine); this.kbAdd(l.id, 10, '认罚', false); return { speaker: `${l.name}城卫`, text: '（城卫收了罚银，在簿子上画了一笔）下不为例。', options: [{ label: '（走）', act: () => null }] }; } },
        ...(s && s.rank >= 1 ? [{ label: `亮出${sectTitle(s.id)}的身份`, act: () => ({ speaker: `${l.name}城卫`, text: `（城卫对视一眼，收了长枪）原来是${sectTitle(s.id)}的仙师……得罪。只是城里的人，都记着呢。`, options: [{ label: '（走）', act: () => null }] }) }] : []),
        { label: '硬闯（口碑更坏）', tone: 'bad', act: () => { this.kbAdd(l.id, -10, '拒捕硬闯'); g.toast('你推开城卫扬长而去。城里的人议论得更凶了。', 'warn'); return null; } },
      ],
    };
  }

  // ============================================================ 7：江湖传音
  /** 江湖传音的一条（jianghu 的 Rumor，kind:'news'） */
  news(text: string, o: { tone?: 'good' | 'bad' | 'mid'; src?: NpcData | string; hook?: Rumor['hook']; quiet?: boolean; ambient?: boolean } = {}): Rumor {
    const g = this.g, S = this.S, ws = g.ws;
    const src = typeof o.src === 'object' ? o.src : null;
    const srcName = src ? src.name : typeof o.src === 'string' ? o.src : pick(SRC);
    const talk: string[] = [];
    if (o.tone && !o.ambient) {
      const ppl = g.npcs.list.filter((d) => d.alive && d.met && d.realm >= 1 && npcMap(d) === ACTIVE_MAP && d !== src);
      const who = ppl.length ? pick(ppl) : null;
      talk.push(`${who ? who.name : pick(SRC)}：${pick(TALK[o.tone])}`);
    }
    const r: Rumor = { id: 1e9 + S.nseq++, day: Math.floor(g.day), text, truth: 1, src: src?.id ?? 'jh', srcName, motive: 'honest', kind: 'news', until: Math.floor(g.day) + 240, hook: o.hook, talk: talk.length ? talk : undefined, amb: o.ambient || undefined };
    const R = (ws.rumors ??= []);
    R.push(r);
    // 只裁传音自己（最多 80 条），不挤掉藏宝、书信这些有用的消息
    let n = 0; for (const x of R) if (x.kind === 'news') n++;
    for (let i = 0; n > 80 && i < R.length; ) { if (R[i].kind === 'news') { R.splice(i, 1); n--; } else i++; }
    this.bump();
    return r;
  }
  /** 屏幕上不再弹的「神识中…」「江湖传闻…」小消息（game.toast 转来） */
  ambient(text: string) { this.news(text, { ambient: true, src: /^江湖传闻|【传闻】|传闻/.test(text) ? '江湖传闻' : '神识' }); }
  /** 你做的事传开了（game.news 'personal' 转来） */
  deed(text: string) { this.news(text, { tone: /伏诛|反杀|救|相助|得胜|赠|除/.test(text) ? 'good' : /杀害|夺|劫|屠/.test(text) ? 'bad' : 'mid' }); }
  feed(): Rumor[] { return (this.g.ws.rumors ?? []).filter((r) => r.kind === 'news').slice().reverse(); }
  unread() { const f = this.S.feedRead; let n = 0; for (const r of this.g.ws.rumors ?? []) if (r.kind === 'news' && r.id > f) n++; return n; }
  readAll() { let m = this.S.feedRead; for (const r of this.g.ws.rumors ?? []) if (r.kind === 'news' && r.id > m) m = r.id; if (m !== this.S.feedRead) { this.S.feedRead = m; this.bump(); } }
  /** 面板：'feed' 江湖传音 / 'wanted' 通缉榜 */
  panel: 'feed' | 'wanted' | null = null;
  private subs = new Set<() => void>();
  sub(f: () => void) { this.subs.add(f); return () => { this.subs.delete(f); }; }
  bump() { this.subs.forEach((f) => f()); }
  openPanel(p: 'feed' | 'wanted' | null) { this.panel = p; if (p === 'feed') this.readAll(); this.bump(); }
  /** 传音里的支线：点了做什么 */
  hookAct(r: Rumor) {
    const g = this.g, k = r.hook; if (!k) return;
    if (k.k === 'jade') { const j = g.war.inbox.find((x) => x.id === k.ref); if (j) { this.openPanel(null); g.openDialog(g.war.jadeNode(j)); } return; }
    if (k.k === 'bounty') { const l = LOC_BY_ID.get(String(k.ref)); if (l) { this.openPanel(null); g.openDialog(g.happen.boardNode(l.id, l.name)); } return; }
    if (k.k === 'team') { const f = g.fellows.S.list.find((x) => x.id === k.ref); const L = f ? g.npcs.byId.get(f.leader) : undefined; if (L?.alive && npcMap(L) === ACTIVE_MAP) { g.setGuide(L.x, L.y, `${g.fellows.name(f!)}`); g.toast(`去找${L.name}：地图上指了路。走近与他交谈即可入伙。`, 'info'); } else g.toast('那支队伍已经走远了。', 'info'); return; }
    if (k.k === 'wanted') { this.openPanel('wanted'); return; }
    if (k.k === 'report') { const l = this.townHere(); if (l) g.openDialog(this.reportNode(l)); else g.toast('回到坊市或宗门就能报案（城镇面板里的「报官」）。', 'info'); }
    // 第三批：NPC 的留言、夺宝局、搭档的提议
    if (k.k === 'visit' || k.k === 'duobao' || k.k === 'dazi') {
      const node = k.k === 'visit' ? g.laifang.msgNode(Number(k.ref)) : k.k === 'duobao' ? g.duobao.hookNode(Number(k.ref)) : g.dazi.propNode();
      if (node) { this.openPanel(null); g.openDialog(node); } else g.toast(k.k === 'visit' ? '这条留言已经过时了。' : k.k === 'duobao' ? '这桩事已经了结了。' : '搭档眼下没什么提议。', 'info');
    }
  }
  /** 第三批：这条可接的事还算不算数（过时的留言、了结的夺宝局不再亮按钮） */
  hookLive(r: Rumor) {
    const k = r.hook?.k; if (!k) return false;
    if (k === 'visit') return this.g.laifang.msgLive(Number(r.hook!.ref));
    if (k === 'duobao') return this.g.duobao.hookLive(Number(r.hook!.ref));
    if (k === 'dazi') return this.g.dazi.propLive();
    return true;
  }
  hookLabel(r: Rumor) { const k = r.hook?.k; return k === 'jade' ? '看玉符' : k === 'bounty' ? '去接悬赏' : k === 'team' ? '前去结伴' : k === 'wanted' ? '看通缉榜' : k === 'report' ? '去报案' : k === 'visit' ? '看留言' : k === 'duobao' ? this.g.duobao.hookLabel(Number(r.hook!.ref)) : k === 'dazi' ? '听听提议' : ''; }
  /** 新到的求助 / 邀约玉符：在传音里也发一条 */
  private jadeTick() {
    const g = this.g, S = this.S, inbox = g.war.inbox; if (!inbox?.length) return;
    const seen = S.jadeSeen ?? 0; let m = seen;
    for (const j of inbox) if (j.id > seen) { m = Math.max(m, j.id); if (!j.done && (j.kind === '求助' || j.kind === '求救' || j.kind === '邀约')) this.news(`${j.from}传来玉符【${j.kind}】：${j.text.split('\n')[0].slice(0, 40)}……`, { src: j.from, hook: { k: 'jade', ref: j.id } }); }
    if (m !== seen) S.jadeSeen = m;
  }
  /** 隔一阵在传音里放一条支线：悬赏、组队 */
  private hookTick() {
    const g = this.g, S = this.S, play = playOf(g);
    if (g.day < (S.hookDay ?? 0) || play < (S.hookP ?? 0)) return;
    S.hookDay = g.day + HOOK_DAYS; S.hookP = play + HOOK_PLAY;
    const k = (S.hookK = ((S.hookK ?? 0) + 1) % 2);
    const p = g.player;
    const towns = LOCATIONS.filter((l) => l.map === ACTIVE_MAP && (l.type === 'city' || l.type === 'town')).map((l) => ({ l, d: Math.hypot(l.x * WORLD_SCALE - p.x, l.y * WORLD_SCALE - p.y) })).sort((a, b) => a.d - b.d);
    if (k === 0 && towns.length) { const t = towns[Math.min(towns.length - 1, Math.floor(lcg() * 3))].l; this.news(`${t.name}坊市新贴了几张悬赏：妖兽、凶徒，赏金由坊市担保。`, { src: `${t.name}坊市`, hook: { k: 'bounty', ref: t.id } }); return; }
    const f = g.fellows.S.list.find((x) => x.map === ACTIVE_MAP && x.style !== 'bandit' && !x.joined && !x.hired && x.members.length < 4);
    if (f) { const L = g.npcs.byId.get(f.leader); if (L?.alive) this.news(`${L.name}领着的${g.fellows.name(f)}在${dirName(L.x - p.x, L.y - p.y)}边一带，正缺人手。`, { src: L, hook: { k: 'team', ref: f.id } }); }
  }

  // ============================================================ 地图标记
  marks(): { x: number; y: number; glyph: string; color: string; ring?: number; name: string }[] {
    const g = this.g, out: { x: number; y: number; glyph: string; color: string; ring?: number; name: string }[] = [];
    for (const r of this.S.reports) { if (r.status !== 'open') continue; const d = g.npcs.byId.get(r.npcId); if (d?.alive && npcMap(d) === ACTIVE_MAP) out.push({ x: d.x, y: d.y, glyph: '缉', color: '#ff8a5a', ring: 900, name: `通缉：${d.name}（大致方位）` }); }
    const du = this.S.duel; if (du && du.map === ACTIVE_MAP) out.push({ x: du.x, y: du.y, glyph: '斗', color: '#ff4a3a', name: `生死斗：${du.name}` });
    out.push(...g.zhifa.marks(), ...g.duobao.marks());   // 第三批：执法弟子、夺宝局
    return out;
  }
}
