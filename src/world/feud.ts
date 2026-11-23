// 恩怨与江湖重做 · 第一批：受害者不再被追杀
//
// 玩家原话：「练气期被筑基金丹打劫就算了，为什么还一直寻仇，到哪里躲着都追杀……我是受害者呀」。
// 这里集中写恩怨的规则，别处只在关键几处调用：
//   · 谁先动手（NpcData.assail）：接近玩家转敌、劫修团伙围上来、仇人追杀、你对还没翻脸的人出手、谁先伤到谁，先到先记；
//     杀人时按先手分级（对方先动手 = 自卫：亲族只结旧怨、好友不结仇）。
//   · 热度（NpcData.heat 0–100，换算 1–6 枚血印）：结仇轻重、谁先手、有没有目击者决定起点；每天自然降（受害一方的仇降得快），
//     换了地图、远离出事的地方、躲进宗门、闭关都降得更快；每次追杀扑空降一档，连扑三次空就认栽（热度清零、血仇降为旧怨）。
//   · 搜捕：追杀者只朝「最后见到你的地方」（NpcData.seen）去，到了搜一阵，搜不到就走；守在城外等你也有时限。
//   · 目击者与认人：没人看见、你敛息或易容、换了衣着遁器，对方就认不出你；仇记在「无名凶手」头上，不会有人追杀你。
//   · 练气期保护：练气期不会被追杀（剧情与你先手的例外）；筑基以上劫练气期先「拦路索财」（交钱 / 逃 / 打）。
//   · 宗门：宗门附近被以大欺小，巡山弟子赶来；远处被追杀，宗门送警告帖；宗门地界是避难所。
//   · 看得见：顶上血印、人脉录「恩怨」页、出村预警、队伍框小血印、地图上的搜捕圈。
//
// 固定种子：本文件不取任何随机数（要随机的地方由调用方传入），也不碰 npcs.daySteps / living 的日结路径。
import type { Game } from './game';
import type { NpcData, Active } from './npc';
import { npcMap } from './npc';
import { ACTIVE_MAP, LOC_BY_ID, WORLD_SCALE, type MapId } from '../data/world';
import { realmName } from '../data/realms';
import { dirName } from './sites';
import * as C from './cultivation';
import type { DNode, DOpt } from './modal';
import { audio } from './audio';
import { TUNING } from '../data/tuning';
import robberUrl from '../assets/feud/robber.webp';   // 拦路索财对话的立绘底：拦路修士的剪影（our-codex-image 生成）

export type Side = 'npc' | 'hero';
/** 这段冲突谁先动的手；wit：当时有几个旁人（含你的队友）看见 */
export interface Assail { day: number; by: Side; wit?: number }
/** 最后一次看见你：时间、地点、地图，和你当时的样子（衣着 / 遁器 / 法宝） */
export interface Seen { day: number; x: number; y: number; map: MapId; look?: string }

/** 玩家在 hate 里的 id：统一用 'me'；旧档里的 'hero' 照样认 */
export const ME = 'me';
export const isMe = (id?: string) => id === 'me' || id === 'hero';
/** 血印门槛：热度 ≥ 这些值分别是 1–6 枚 */
export const HEAT_STEP = [8, 22, 38, 55, 72, 88];
/** 三枚血印以上才主动追杀；以下只在路上撞见时对峙 */
export const HUNT_MIN = 38;
/** 先手标记两日内算数 */
export const ASSAIL_FRESH = 2;
/** 连扑几次空就认栽 */
export const MISS_GIVEUP = 3;
/** 拦路索财交了钱 / 逃掉了（劫道失败）/ 被你饶过、给了买命钱：这么多天内不再劫你 */
export const ROB_CD_PAID = 60, ROB_CD_FAIL = 30, ROB_CD_SPARE = 90;
/** 追杀者丢了你以后在最后见到你的地方搜多久（日）；守在城外最多等几天 */
export const SEARCH_DAYS = 12, WAIT_DAYS = 20;

// ------------------------------------------------------------ 游玩时间
// 游戏里一日只有两秒（TUNING.daysPerSec = 0.5），按日算的冷却实际只有一两分钟，玩家会觉得被同一个人反复劫。
// 所以凡是「劫不劫你、追不追你」的冷却与时限，都要「游戏天数」和「累计游玩时间」两个都到了才解除。
// 累计游玩秒数存在 ws.play（game.update 里随光阴一起走，暂停、读档、关窗口都不走），不用现实时钟。
// 只在玩家侧的判断里读它；npcs.daySteps、living.*、npcs.die、rel.onNpcKill 这些日结路径一概不读。
/** 累计游玩秒数 */
export const playOf = (g: Game) => g.ws.play ?? 0;
/** 冷却与时限（游玩秒数）：交钱了事 15 分、逃掉 / 劫道失败 8 分、饶命 / 买命钱 20 分；搜捕 3 分、城外守候 5 分 */
export const ROB_PLAY_PAID = 15 * 60, ROB_PLAY_FAIL = 8 * 60, ROB_PLAY_SPARE = 20 * 60;
export const SEARCH_PLAY = 3 * 60, WAIT_PLAY = 5 * 60;
/** 追杀者动身以后最多找你多久（游玩秒数；另要满四十日） */
export const HUNT_TIMEOUT_PLAY = 6 * 60;
/** 说书人放风调开仇家：另要过这么久游玩时间他才顾得上你 */
export const DIVERT_PLAY = 8 * 60;
/** 宗门来援的冷却（游玩秒数） */
export const RESCUE_PLAY = 90;
/** 热度降温：一分钟游玩折合几「热度日」（受害一方每热度日降 4 → 每分钟降 10；你先手的血仇每分钟降 2） */
export const HEAT_DAYS_PER_MIN = 2.5;
export type RobKind = 'paid' | 'fail' | 'spare';
/** 记劫道冷却：天数和游玩时间各记一个，两个都到了才解除；只会往后延，不会缩短 */
export function setRobCd(g: Game, d: NpcData, kind: RobKind) {
  const days = kind === 'paid' ? ROB_CD_PAID : kind === 'fail' ? ROB_CD_FAIL : ROB_CD_SPARE;
  const secs = kind === 'paid' ? ROB_PLAY_PAID : kind === 'fail' ? ROB_PLAY_FAIL : ROB_PLAY_SPARE;
  d.robCd = Math.max(d.robCd ?? 0, g.day + days);
  d.robP = Math.max(d.robP ?? 0, playOf(g) + secs);
}
/** 还在劫道冷却里（天数或游玩时间有一个没到） */
export function robGuard(g: Game, d: NpcData) { return (d.robCd !== undefined && d.robCd > g.day) || (d.robP !== undefined && d.robP > playOf(g)); }
/** 下一次追杀至少隔多久（游玩秒数）：热度越高越快，但最快也要四分钟 */
export function huntPlayGap(d: NpcData) { const h = heatOf(d); return h >= 72 ? 4 * 60 : h >= 55 ? 6 * 60 : 9 * 60; }
/** 记下一次追杀：天数和游玩时间都到了才来 */
export function setHuntAt(g: Game, d: NpcData, day: number) { d.huntAt = day; d.huntP = playOf(g) + huntPlayGap(d); }
/** 追杀的日子到了，游玩时间也到了 */
export function huntDue(g: Game, d: NpcData) { return d.huntAt !== undefined && g.day >= d.huntAt && (d.huntP ?? 0) <= playOf(g); }
/** 搜捕圈半径（世界坐标） */
export const SEARCH_R = 2400;
/** 易容丹药效（日） */
export const YIRONG_DAYS = 10;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export function marksOf(h: number) { let n = 0; for (const s of HEAT_STEP) if (h >= s) n++; return n; }
/** 热度：旧档没有这个字段时按仇的轻重估一个 */
export function heatOf(d: NpcData) { if (d.heat !== undefined) return d.heat; return (d.grudge ?? 0) >= 2 ? 60 : 0; }
/** 记先手：两日内已经有人先动了手，就不改 */
export function markAssail(d: NpcData, by: Side, day: number, wit?: number) {
  const a = d.assail;
  if (a && day - a.day <= ASSAIL_FRESH && day >= a.day) { if (wit && wit > (a.wit ?? 0)) a.wit = wit; return a; }
  d.assail = { day, by, wit: wit || undefined };
  return d.assail;
}
/** 这段冲突是对方先动的手（两日内） */
export function npcStarted(d: NpcData, day: number) { const a = d.assail; return !!a && a.by === 'npc' && day - a.day <= ASSAIL_FRESH && day >= a.day; }
export function heroStarted(d: NpcData, day: number) { const a = d.assail; return !!a && a.by === 'hero' && day - a.day <= ASSAIL_FRESH && day >= a.day; }
/** 结仇：仇只升不降（降由化解、认栽处理）；先手一旦是你，就一直记你 */
export function setFeud(d: NpcData, o: { grudge: number; heat: number; by: Side; day: number; why?: string; seen?: Seen }) {
  d.grudge = Math.max(d.grudge ?? 0, o.grudge);
  d.heat = clamp(Math.max(heatOf(d), o.heat), 0, 100);
  if (d.feudBy !== 'hero') d.feudBy = o.by;
  d.miss = 0;
  if (o.why) d.why = o.why;
  if (o.seen) d.seen = { ...o.seen };
}
/** 下一次追杀隔多久（日，未乘随机系数） */
export function huntGap(d: NpcData) { const h = heatOf(d); return h >= 72 ? 18 : h >= 55 ? 28 : 40; }

export interface FeudRow { d: NpcData; heat: number; marks: number; why: string; by: Side | undefined; know: boolean; quitIn: number | null; ways: string[]; hunting: boolean; warned: boolean }

export class FeudSys {
  private t = 0;
  private inZone: boolean | null = null;
  private lastMap: MapId | null = null;
  private hot: NpcData[] = [];
  private hotT = 0;
  private helpT = -1e9;
  constructor(private readonly g: Game) {}

  // ------------------------------------------------------------ 认人
  /** 你此刻的样子：衣着、染色、遁器、本命法宝 */
  lookSig(): string {
    const h = this.g.hero as any, w = h.wardrobe;
    return `${w?.outfit ?? '-'}:${w?.dye ?? 0}:${h.equip?.flight ?? '-'}:${h.equip?.bond ?? '-'}`;
  }
  disguised() { return ((this.g.ws.flags as any).yirong ?? -1) > this.g.day; }
  /** d 认不认得出你：服了易容丹认不出；换了衣着 / 遁器 / 法宝也认不出 */
  recognizes(d: NpcData) {
    if (this.disguised()) return false;
    if ((this.g.ws.ey?.hideP ?? -1) > playOf(this.g)) return false;   // 第二批：躲在百姓屋里
    const s = d.seen; if (!s?.look) return true;
    return s.look === this.lookSig();
  }
  /** d 此刻看见了你 */
  see(d: NpcData) { const p = this.g.player; d.seen = { day: this.g.day, x: Math.round(p.x), y: Math.round(p.y), map: ACTIVE_MAP, look: this.lookSig() }; }

  // ------------------------------------------------------------ 目击者
  /** 在 (x, y) 一带看见这件事的人：围观的、神识范围内的活人。境界比你低两阶以上、离得又远的人看不清你。不算 skip 里的人和你的队友 */
  witnesses(x: number, y: number, skip: NpcData[] = []): NpcData[] {
    const g = this.g, N = g.npcs, out: NpcData[] = [], hr = g.hero.realm;
    for (const a of (N as any).active.values() as Iterable<Active>) {
      const d = a.d;
      if (!d.alive || a.enemy || a.act === 'follow' || skip.includes(d)) continue;
      const dd = Math.hypot(a.st.x - x, a.st.y - y), R = Math.max(900, N.senseOf(d));
      if (dd > R) continue;
      if (d.realm < hr - 1 && dd > 500 && a.life?.k !== 'watch') continue;
      out.push(d);
    }
    return out;
  }
  /** 你的队友（同行者、护法、结伴队友）：被劫时是你的证人 */
  mates(): NpcData[] { return this.g.npcs.followers().map((a) => a.d); }
  /** 你此刻能不能被认出来：敛息、易容都认不出 */
  hidden() { return this.g.concealed || this.disguised(); }

  // ------------------------------------------------------------ 结仇：杀人后的分级（relations.onPlayerKill 调用）
  /** 这次杀人谁先动手：显式先手标记 > 魔修 / 正道除魔（本就是恶人）> 默认算你先手 */
  selfDef(d: NpcData, righteous = false) {
    const day = this.g.day;
    if (npcStarted(d, day)) return true;
    if (this.g.ws.sect?.tasks.some((t) => t.kind === 'catch' && t.target === d.id)) return true;   // 宗门缉凶：奉命拿人
    if (heroStarted(d, day)) return false;
    return d.faction === 'demon' || righteous;
  }

  // ------------------------------------------------------------ 战斗里谁先动手（combat.hitEnemy / hitPlayer 调用）
  onHit(e: { npcId?: string }) {
    const g = this.g, d = e.npcId ? g.npcs.byId.get(e.npcId) : undefined; if (!d) return;
    const by = (g.combat as any).allyBy as string | undefined;
    (e as any).lastBy = by;
    markAssail(d, 'hero', g.day);
  }
  onHurt(e: { npcId?: string }) { const d = e.npcId ? this.g.npcs.byId.get(e.npcId) : undefined; if (d) markAssail(d, 'npc', this.g.day); }

  // ------------------------------------------------------------ 每帧（半秒一次）：出村预警、追近了转追杀、守城外等候、宗门救援
  frame(dt: number) {
    this.t -= dt; if (this.t > 0) return; this.t = 0.5;
    const g = this.g, p = g.player;
    if (g.offWorld || g.inCave) return;
    if (this.lastMap !== ACTIVE_MAP) { if (this.lastMap) this.onMapChange(); this.lastMap = ACTIVE_MAP; }
    this.hotT -= 0.5; if (this.hotT <= 0) { this.hotT = 2; this.hot = g.npcs.list.filter((d) => d.alive && (heatOf(d) > 0 || d.hunting || d.mateFoe)); }
    const inZone = !!g.terrain.inLocZone(p.x, p.y, 600);
    if (this.inZone === true && !inZone) this.onLeaveTown();
    this.inZone = inZone;
    const safe = g.combat.safeAt(p.x, p.y), day = g.day, play = playOf(g);
    for (const d of this.hot) {
      if (!d.alive || !d.hunting || npcMap(d) !== ACTIVE_MAP || d.chasing) continue;
      const dist = Math.hypot(d.x - p.x, d.y - p.y);
      // 守在城外等你：有时限
      if (safe && dist < 9000) { if (d.waitUntil === undefined) { d.waitUntil = day + WAIT_DAYS; d.waitP = play + WAIT_PLAY; } if (day > d.waitUntil && play >= (d.waitP ?? 0)) { d.waitUntil = undefined; d.waitP = undefined; this.miss(d, 'wait'); } continue; }
      // 搜捕：到了最后见到你的地方搜一阵（npc.huntStep 只管转圈，不读游玩时间）；天数和游玩时间都到了才走
      if (d.search !== undefined) { d.searchP ??= play + SEARCH_PLAY; if (day > d.search && play >= d.searchP) { this.miss(d, 'search'); continue; } }
      // 追近了、认得出你：筑基以上的驾遁光扑上来（练气期你不会被追杀，除非是你先动的手）
      if (dist < 6000 && d.realm >= 2 && !g.pursuit.active && !g.npcs.activeOf(d.id) && this.recognizes(d) && this.eligible(d) && g.pursuit.cd <= 0) {
        if (g.pursuit.start({ reason: d.why ?? '仇家寻仇', npc: d, why: d.why })) { markAssail(d, 'npc', day); d.hunting = false; d.huntStart = day; }
      }
    }
    this.sectRescue();
  }
  /** 你能不能被 d 追杀：练气期不会（你先手的、剧情的例外）；在自家宗门地界里不会 */
  eligible(d: NpcData) {
    const g = this.g;
    if (g.hero.realm < 2 && d.feudBy !== 'hero') return false;
    if (this.inOwnSect()) return false;
    return true;
  }
  /** 自家宗门地界（宗门所在地四周） */
  inOwnSect(x = this.g.player.x, y = this.g.player.y) {
    const s = this.g.ws.sect; if (!s) return false;
    const L = LOC_BY_ID.get(s.id); if (!L || L.map !== ACTIVE_MAP) return false;
    return Math.hypot(L.x * WORLD_SCALE - x, L.y * WORLD_SCALE - y) < 7000;
  }
  nearHome() {
    const h = this.g.ws.home, p = this.g.player; if (!h || h.map !== ACTIVE_MAP) return false;
    return Math.hypot(h.x - p.x, h.y - p.y) < 4000;
  }

  // ------------------------------------------------------------ 每日降温（relations.daily 调用；不取随机数）
  /** 上次日结时的游玩秒数（不存档：读档后从读档那一刻算起，不会一下子补降一大截） */
  private lastPlay: number | null = null;
  /**
   * 这段日结折合多少「热度日」：正常走着的光阴按游玩时间折（一分钟 = HEAT_DAYS_PER_MIN 日，一日只有两秒，按日降会一两分钟就散）；
   * 远行、闭关这类一下子跳过的日子照旧一日算一日（打坐的三倍光阴也算正常走着）。
   */
  heatDays(days: number) {
    const play = playOf(this.g), dp = this.lastPlay === null ? 0 : Math.max(0, play - this.lastPlay);
    this.lastPlay = play;
    const flow = dp * TUNING.daysPerSec * TUNING.meditateSpeed;   // 这段游玩时间里光阴最多能自然走多少日
    return (dp / 60) * HEAT_DAYS_PER_MIN + Math.max(0, days - flow);
  }
  daily(days: number) {
    const g = this.g, p = g.player, day = g.day, inSect = this.inOwnSect(), home = this.nearHome(), play = playOf(g);
    days = this.heatDays(days);
    for (const d of g.npcs.list) {
      if (!d.alive) continue;
      if (d.robCd !== undefined && d.robCd <= day) d.robCd = undefined;   // 天数到了；游玩时间那一半（robP）另记，到了才清
      if (d.robP !== undefined && d.robP <= play) d.robP = undefined;
      let h = d.heat;
      if (h === undefined) { if ((d.grudge ?? 0) < 2) continue; h = d.heat = heatOf(d); }
      if (h <= 0) continue;
      // 受害一方（对方先动手）的仇降得快；你先手的血仇降得慢
      let rate = d.feudBy === 'npc' ? 4 : d.feudBy === 'hero' ? 0.8 : 2;
      if (npcMap(d) !== ACTIVE_MAP) rate *= 2.5;   // 换了地图：仇人不跟着跨图，热度降得更快
      else if (d.seen && (d.seen.map !== ACTIVE_MAP || Math.hypot(d.seen.x - p.x, d.seen.y - p.y) > 15000)) rate *= 1.6;   // 离开出事的地方
      if (inSect) rate *= 3; else if (home) rate *= 1.5;   // 宗门里闭关降得最快，洞府附近也算半个安全区
      if (d.warned) rate *= 1.5;   // 收了宗门警告帖
      h = Math.max(0, h - rate * days);
      d.heat = h;
      if (h <= 0) {
        d.heat = 0; d.hunting = false; d.waitUntil = undefined;
        // 受害一方的事：热度散尽，血仇降回旧怨（天道档 grudge 2 = 补刀即真死，不能留着）
        if ((d.grudge ?? 0) >= 2 && d.feudBy === 'npc') d.grudge = 1;
      }
    }
  }
  /** 你换了地图：别图的仇家热度一下子降一截 */
  onMapChange() {
    for (const d of this.g.npcs.list) if (d.alive && (d.heat ?? 0) > 0 && npcMap(d) !== ACTIVE_MAP) { d.heat = Math.max(0, d.heat! * 0.6 - 5); d.hunting = false; d.waitUntil = undefined; }
  }

  // ------------------------------------------------------------ 扑空 / 认栽
  /** 追杀（遁光追杀没追上、循迹而来扑空、城外等不到）扑空一次：热度降一档；连三次就认栽 */
  miss(d: NpcData, kind: 'pursuit' | 'search' | 'wait' = 'search') {
    const g = this.g, day = g.day;
    d.hunting = false; d.waitUntil = undefined; d.search = undefined; d.waitP = d.searchP = d.huntS = undefined;
    if (d.mateFoe) { d.mateFoe = undefined; return; }   // 找队友寻仇的人没找着：作罢
    d.miss = (d.miss ?? 0) + 1;
    const h = heatOf(d), m = marksOf(h);
    d.heat = m > 0 ? Math.min(h, HEAT_STEP[m - 1] - 1) : 0;   // 降一档
    if (d.miss >= MISS_GIVEUP) { this.giveUp(d); return; }
    setHuntAt(g, d, day + huntGap(d));
    if (kind === 'wait') g.rel.log(`${d.name}在城外守了几天，没等到你，悻悻离去。`, 'info');
    else if (kind === 'search') g.rel.log(`${d.name}循迹搜了一阵，扑了个空。`, 'info');
  }
  /** 认栽：热度清零，血仇降回旧怨，不再主动找你 */
  giveUp(d: NpcData) {
    const g = this.g;
    d.heat = 0; d.hunting = false; d.huntAt = d.huntP = undefined; d.waitUntil = d.waitP = undefined; d.search = d.searchP = d.huntS = undefined; d.miss = 0;
    if ((d.grudge ?? 0) >= 2) d.grudge = 1;
    d.gaveUp = Math.floor(g.day);
    g.rel.log(`${d.name}几番扑空，认栽了——血仇降为旧怨，不再追着你不放。`, 'good');
    g.toast(`${d.name}几番追你不着，认栽了。`, 'good', { lv: 'low' });
  }

  // ------------------------------------------------------------ 出村预警
  /** 刚出城：有热度的仇家在附近守着时，发一条预警 */
  onLeaveTown() {
    const g = this.g, p = g.player, day = g.day;
    if (((g.ws.flags as any).feudWarnDay ?? -99) > day - 5) return;   // 进进出出不要一直报
    let best: NpcData | null = null, bh = 0, bd = 0;
    for (const d of this.hot) {
      if (!d.alive || npcMap(d) !== ACTIVE_MAP || g.npcs.activeOf(d.id)?.act === 'follow') continue;
      const h = heatOf(d); if (h < HEAT_STEP[0]) continue;
      const dd = Math.hypot(d.x - p.x, d.y - p.y); if (dd > 30000) continue;
      if (!(d.hunting || d.waitUntil !== undefined || h >= HUNT_MIN)) continue;
      if (h > bh) { best = d; bh = h; bd = dd; }
    }
    if (!best) return;
    (g.ws.flags as any).feudWarnDay = day;
    const li = Math.max(1, Math.round(bd / 5400)), dir = dirName(best.x - p.x, best.y - p.y);
    const named = !!g.rel.S.story.liusanniang?.warn;
    const who = named ? `${best.name}（${realmName(best.realm, best.stage)}）` : '有人';
    const text = named ? `柳三娘的密信：${dir}${cn(li)}里外，${who}在等你。` : `${dir}${cn(li)}里外有人在等你。`;
    const lastWarn = { day, id: best.id, dir, li, heat: bh, named };
    (g.ws.flags as any).feudWarn = lastWarn;
    if (marksOf(bh) >= 4) g.toast(text, 'warn'); else g.toast(text, 'info', { lv: 'low' });
    g.rel.log(text, 'bad');
  }

  // ------------------------------------------------------------ 宗门护短
  /** 宗门附近被高出一个大境界的人追打：巡山弟子 / 长老赶来（照义兄、师父救援的写法） */
  sectRescue() {
    const g = this.g, s = g.ws.sect, h = g.hero; if (!s || h.dead) return;
    if (playOf(g) < this.helpT) return;   // 按游玩时间冷却（一日只有两息，按日算会接连来好几位）
    const foes: NpcData[] = [];
    const P = g.pursuit.cur; if (P?.npc && P.npc.realm >= h.realm + 1) foes.push(P.npc);
    for (const e of g.combat.enemies) if (!e.dead && e.aggro && e.npcId && e.realm >= h.realm + 1 && Math.hypot(e.x - g.player.x, e.y - g.player.y) < 1800) { const d = g.npcs.byId.get(e.npcId); if (d && !foes.includes(d)) foes.push(d); }
    if (!foes.length) return;
    const L = LOC_BY_ID.get(s.id); if (!L || L.map !== ACTIVE_MAP) return;
    if (Math.hypot(L.x * WORLD_SCALE - g.player.x, L.y * WORLD_SCALE - g.player.y) > 14000) return;
    const top = foes.reduce((m, d) => Math.max(m, d.realm), 0);
    const pool = g.roster.pick(s.id, 1, Math.min(top, 5), Math.min(top + 1, 5), { skipTop: true });
    const r = pool[0] ?? g.npcs.list.find((d) => d.alive && d.sect === s.id && d.realm >= top && !d.bond && !d.beauty && !d.stay && !g.npcs.activeOf(d.id) && !(d.grudge > 0));
    if (!r) { this.helpT = playOf(g) + 5; return; }
    this.helpT = playOf(g) + RESCUE_PLAY;
    r.helpUntil = g.time + 60; r.met = true; r.favor = Math.max(r.favor, 20);
    g.npcs.summon(r.id);
    const a = g.npcs.activeOf(r.id); if (a) a.bubble = { text: `何方狂徒，敢在${L.name}地界欺我门下弟子！`, t: 3.5 };
    for (const f of foes) { this.coolBy(f, 25); f.warned = Math.floor(g.day); }
    const rank = /长老|掌门/.test(r.title ?? '') || r.realm >= 3 ? '长老' : '巡山弟子';
    if (a) g.combat.texts.push({ x: a.st.x, y: a.st.y - 170, s: `${L.name}${rank}来援！`, color: '#ffe08a', t: 0, vy: -14, big: true } as any);   // 消息多时 toast 会被挤掉：人头上再飘一行字
    g.toast(`${L.name}${rank}${r.name}（${realmName(r.realm, r.stage)}）闻讯赶来护你！`, 'good', { lv: 'urgent' });   // 救命的消息：静音档也要弹
    g.rel.log(`${foes[0].name}在${L.name}附近以大欺小，${rank}${r.name}出手相护。`, 'good');
    audio.sfx('chime');
  }
  /** 远处被以大欺小的人追杀之后：宗门执法堂送去警告帖；不听警告的，列为宗门仇敌，同盟诸派一体视之 */
  sectWarn(d: NpcData) {
    const g = this.g, s = g.ws.sect, h = g.hero; if (!s || !d.alive || d.realm < h.realm + 1 || d.sect === s.id) return false;
    const name = LOC_BY_ID.get(s.id)?.name ?? '本门';
    if (d.warned && g.day - d.warned < 120) {
      const S = g.rel.S as any; (S.sectFoe ??= {})[d.id] = s.id;
      d.heat = Math.min(heatOf(d), 30);
      g.rel.log(`${d.name}不听${name}的警告帖，仍来追杀你——${name}执法堂将其列为宗门仇敌，同盟诸派见之必究。`, 'good');
      g.toast(`${name}执法堂把${d.name}列为宗门仇敌。`, 'good');
      return true;
    }
    d.warned = Math.floor(g.day);
    this.coolBy(d, 40);
    g.rel.log(`${name}执法堂给${d.name}送去一封警告帖：「再敢以大欺小，追杀我门下弟子，本门必究。」`, 'good');
    g.toast(`${name}给${d.name}送去警告帖，对方收敛了许多。`, 'good');
    return true;
  }
  /** 宗门仇敌：d 被哪个宗门列为仇敌（用于宗门弟子路上见了他就动手） */
  sectFoeOf(d: NpcData): string | undefined { return ((this.g.rel.S as any).sectFoe ?? {})[d.id]; }
  coolBy(d: NpcData, v: number) { d.heat = Math.max(0, heatOf(d) - v); if (d.heat < HUNT_MIN) d.hunting = false; }

  // ------------------------------------------------------------ 拦路索财（筑基以上劫练气期）
  /** 交出三成灵石 / 逃 / 打 */
  shakedown(a: Active, onFight: () => void, rnd: () => number): DNode {
    const g = this.g, d = a.d, h = g.hero, day = g.day;
    const have = C.bagCount(h, 'mat_lingshi'), fee = Math.max(have > 0 ? 1 : 0, Math.round(have * 0.3));
    const mates = this.mates().length;
    const flee = clamp(0.35 + (g.player.flying ? 0.15 : 0) + (C.bagCount(h, 'tal_escape') > 0 ? 0.2 : 0) + mates * 0.08 - (d.realm - h.realm) * 0.08, 0.1, 0.8);
    const title = `${realmName(d.realm, d.stage)} · 拦路`;
    const bye = (text: string): DNode => ({ speaker: d.name, title, look: a.look, text, options: [{ label: '（走）', act: () => null }], mood: 'normal' });
    const calm = () => { a.act = 'idle'; a.wait = 2; a.parley = false; d.hunting = false; };
    const opts: DOpt[] = [
      { label: fee > 0 ? `交出三成灵石（${fee}）` : '摊开空空的储物袋', tone: 'good', act: () => {
        if (fee > 0) { C.removeItem(h, 'mat_lingshi', fee); d.wealth += fee; }
        setRobCd(g, d, 'paid'); d.assail = undefined; calm();
        a.bubble = { text: fee > 0 ? '识相。走吧。' : '……穷鬼一个，滚吧。', t: 2.5 };
        g.rel.log(`被${d.name}拦路索财，交了 ${fee} 灵石了事。`, 'info');
        if (fee > 0) g.enyuan?.onRobbed(d, fee);   // 第二批：回城可报官
        return bye(fee > 0 ? `（${d.name}掂了掂灵石，咧嘴一笑）识时务者为俊杰。今日之事就此作罢，往后路上见了，各走各的。\n\n（交出灵石 ${fee}。${ROB_CD_PAID} 日内、${ROB_PLAY_PAID / 60} 分钟游玩内此人不会再劫你，也不结仇）` : `（${d.name}扫了一眼你的储物袋，啐了一口）晦气！滚吧。`);
      } },
      { label: `转身就逃（约 ${Math.round(flee * 100)}% 脱身）`, act: () => {
        if (rnd() < flee) {
          setRobCd(g, d, 'fail'); d.assail = undefined; calm(); a.act = 'idle';
          audio.sfx('whoosh');
          g.rel.log(`被${d.name}拦路，趁其不备脱身。`, 'info');
          return bye(`（你猛地捏碎一张符，借着烟尘遁出数十丈。${d.name}骂了一声，没有追来）\n\n（逃掉了，不结仇；${ROB_CD_FAIL} 日内、${ROB_PLAY_FAIL / 60} 分钟游玩内他不会再拦你）`);
        }
        markAssail(d, 'npc', day, this.witnessesFor(a)); a.parley = false; onFight();
        a.bubble = { text: '想跑？晚了！', t: 2.5 };
        return null;
      } },
      { label: '拔剑（他先动的手，打死算自卫）', tone: 'bad', act: () => { markAssail(d, 'npc', day, this.witnessesFor(a)); a.parley = false; onFight(); return null; } },
    ];
    const wit = this.witnessesFor(a);
    const line = `（${d.name}落在你面前，${d.realm >= 3 ? '一身金丹威压' : '筑基修士的灵压'}沉沉压下来）\n小兄弟，这条路是我的。留下三成灵石，你走你的，我不为难你。${wit ? `\n\n（旁边有 ${wit} 人看着——真动起手来，是他理亏）` : ''}`;
    return { speaker: d.name, title, portrait: robberUrl, look: a.look, text: line, options: opts, mood: 'danger' };
  }
  /** 一场冲突的证人数：旁人 + 你的队友 */
  witnessesFor(a: Active) { return this.witnesses(a.st.x, a.st.y, [a.d]).length + this.mates().length; }

  // ------------------------------------------------------------ 队友的仇
  /** 队友的仇家找来：帮他打 / 调停 / 袖手旁观 */
  mateFoeNode(a: Active, mate: Active, onFight: () => void): DNode {
    const g = this.g, d = a.d, m = mate.d, h = g.hero, cost = Math.round(40 * Math.pow(3, d.realm));
    const title = `${realmName(d.realm, d.stage)} · 寻${m.name}的仇`;
    const why = g.living?.topHate(d)?.why ?? '旧怨';
    const done = (text: string): DNode => ({ speaker: d.name, title, look: a.look, text, options: [{ label: '（走）', act: () => null }] });
    const end = () => { d.mateFoe = undefined; d.hunting = false; a.act = 'idle'; a.wait = 2; a.parley = false; };
    return {
      speaker: d.name, title, look: a.look, mood: 'danger',
      text: `（${d.name}拦在路上，看都不看你一眼，只盯着${m.name}）${m.name}！${why}——今日把账算清。\n\n这是${m.name}自己的仇。你怎么做，${m.name}都看在眼里。`,
      options: [
        { label: `与${m.name}并肩迎敌`, tone: 'bad', act: () => { end(); markAssail(d, 'npc', g.day, 1); g.rel.addFavor(m, 8); onFight(); return null; } },
        { label: `出面调停（灵石 ${cost}）`, tone: 'good', disabled: C.bagCount(h, 'mat_lingshi') < cost, hint: C.bagCount(h, 'mat_lingshi') < cost ? '灵石不足' : '', act: () => {
          C.removeItem(h, 'mat_lingshi', cost); end();
          const hh = d.hate?.find((x) => x.id === m.id); if (hh) { hh.v = Math.min(hh.v, 20); hh.blood = undefined; }
          if (d.vend === m.id) d.vend = undefined;
          g.rel.addFavor(m, 5); g.rel.log(`替${m.name}出面，赔了 ${cost} 灵石，${d.name}与${m.name}的旧账暂且揭过。`, 'good');
          return done(`（你把灵石推过去，替${m.name}赔了个不是。${d.name}沉默良久，收下了）……看在你的面子上。${m.name}，好自为之。`);
        } },
        { label: '袖手旁观', act: () => {
          end(); g.rel.addFavor(m, -12);
          a.duel = { foe: mate, hp: 1, cd: 0.6, t: 0 }; mate.duel = { foe: a, hp: 1, cd: 1.1, t: 0 }; a.act = mate.act = 'duel';
          g.rel.log(`${d.name}来找${m.name}寻仇，你袖手旁观。${m.name}心里记下了。`, 'bad');
          return null;
        } },
      ],
    };
  }

  // ------------------------------------------------------------ 道具：易容丹、传讯符
  useItem(id: string): boolean | null {
    const g = this.g, h = g.hero;
    if (id === 'pill_yirong') {
      if (C.bagCount(h, id) <= 0) return false;
      C.removeItem(h, id, 1);
      (g.ws.flags as any).yirong = g.day + YIRONG_DAYS;
      g.toast(`服下易容丹，骨相微变——${YIRONG_DAYS} 日之内，仇家神识扫过你也认不出来。`, 'good');
      audio.sfx('chime');
      return true;
    }
    if (id === 'tal_chuanxun') {
      if (C.bagCount(h, id) <= 0) return false;
      C.removeItem(h, id, 1);
      const rows = this.rows().filter((r) => r.marks > 0).slice(0, 4);
      const p = g.player;
      const text = rows.length ? rows.map((r) => `· ${r.d.name}（${realmName(r.d.realm, r.d.stage)}）${npcMap(r.d) === ACTIVE_MAP ? `在你${dirName(r.d.x - p.x, r.d.y - p.y)}${cn(Math.max(1, Math.round(Math.hypot(r.d.x - p.x, r.d.y - p.y) / 5400)))}里外` : '不在此地'}，${r.hunting ? '正在找你' : '暂未动身'}（血印 ${r.marks}）`).join('\n') : '眼下没人在找你。';
      g.openDialog({ speaker: '传讯符', title: '江湖耳目', text: `（符纸燃尽，一缕传音在耳边响起）\n\n${text}`, options: [{ label: '知道了', act: () => null }] });
      return true;
    }
    return null;
  }

  // ------------------------------------------------------------ 显示
  /** 顶上血印：此刻找你找得最凶的人有几级热度（0 = 没人找你） */
  topMarks() { let m = 0; for (const d of this.hot) if (d.alive && npcMap(d) === ACTIVE_MAP && (d.grudge ?? 0) > 0) m = Math.max(m, marksOf(heatOf(d))); return m; }
  /** 谁在盯着某个队友（小血印 0–3） */
  private mm = new Map<string, number>(); private mmT = -1;
  mateMarks(id: string) {
    if (Math.abs(this.g.time - this.mmT) > 2) { this.mm.clear(); this.mmT = this.g.time; }   // 两秒算一次（队伍框每次刷新都要问）
    const c = this.mm.get(id); if (c !== undefined) return c;
    const n = this.mateMarks0(id); this.mm.set(id, n); return n;
  }
  private mateMarks0(id: string) {
    let v = 0;
    for (const d of this.hot) if (d.alive && d.mateFoe === id) v = Math.max(v, 70);
    for (const d of this.g.npcs.list) { if (!d.alive || !d.hate) continue; for (const x of d.hate) if (x.id === id && (x.blood || x.v >= 60)) v = Math.max(v, x.v); }
    return v >= 85 ? 3 : v >= 70 ? 2 : v >= 60 ? 1 : 0;
  }
  /** 恩怨页：谁在找你、为什么、谁先动的手、热度、多久后放弃、认不认得你、能怎么化解 */
  rows(): FeudRow[] {
    const g = this.g, day = g.day, out: FeudRow[] = [];
    for (const d of g.npcs.list) {
      if (!d.alive || !((d.grudge ?? 0) > 0 || d.hunting)) continue;
      const heat = heatOf(d), marks = marksOf(heat);
      let rate = d.feudBy === 'npc' ? 4 : d.feudBy === 'hero' ? 0.8 : 2; if (npcMap(d) !== ACTIVE_MAP) rate *= 2.5;
      const quitIn = heat > 0 ? Math.ceil((heat - (HEAT_STEP[2] - 1)) / (rate * HEAT_DAYS_PER_MIN)) : null;   // 还要几分钟游玩才降到三枚血印以下
      const ways: string[] = [];
      if ((d.grudge ?? 0) > 0) ways.push('赔礼 / 立心魔誓 / 生死斗');
      if (d.lost) ways.push('退还夺来的东西');
      { const m = g.enyuan?.commonFriend(d); if (m) ways.push(`托${m.name}说和`); }
      if (g.ws.sect) ways.push('请宗门长辈出面');
      ways.push('换图避风头');
      if (!this.disguised()) ways.push('易容 / 换装');
      if (g.ws.sect) ways.push('回宗门闭关');
      if (marks >= 3 && (d.miss ?? 0) < MISS_GIVEUP) ways.push(`让他再扑空 ${MISS_GIVEUP - (d.miss ?? 0)} 次`);
      out.push({ d, heat, marks, why: d.why ?? '旧怨', by: d.feudBy, know: this.recognizes(d), quitIn: quitIn !== null && quitIn > 0 && marks >= 3 ? quitIn : null, ways, hunting: !!d.hunting || !!d.chasing, warned: !!d.warned });
      void day;
    }
    return out.sort((a, b) => b.heat - a.heat || (b.d.grudge ?? 0) - (a.d.grudge ?? 0));
  }
  /** 地图：搜捕范围 */
  marks(): { x: number; y: number; glyph: string; color: string; ring?: number; name: string }[] {
    const out: { x: number; y: number; glyph: string; color: string; ring?: number; name: string }[] = [];
    for (const d of this.hot) {
      if (!d.alive || !d.hunting || !d.seen || d.seen.map !== ACTIVE_MAP || npcMap(d) !== ACTIVE_MAP) continue;
      out.push({ x: d.seen.x, y: d.seen.y, glyph: '搜', color: '#ff5a4a', ring: SEARCH_R, name: `${d.name}在此一带搜捕你` });
    }
    return out;
  }
  /** 存档读档：旧档里玩家在 hate 里的 'hero' 统一成 'me' */
  normalize() { for (const d of this.g.npcs.list) if (d.hate) for (const x of d.hate) if (x.id === 'hero') x.id = ME; }
}

const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
export function cn(n: number) { n = Math.max(1, Math.round(n)); return n <= 10 ? CN[n] : n < 20 ? '十' + CN[n - 10] : n < 100 ? CN[Math.floor(n / 10)] + '十' + (n % 10 ? CN[n % 10] : '') : String(n); }
