import { detailSenseRange } from './senseRange';
import { isActiveWorldMap } from './contracts';
import { safeHookDrops, updateWorldDrop, updateWorldDrops, type WorldDrop } from './combatDropSafety';
import { hookNumber } from '../mod/safeNumber';
import { enemyPerceptibility, preciseActorVisible } from './senseSignals';
import type { EnemyLike } from './senseSignals';
import { gongfaArtMul } from '../data/skills';
import { beastSpeed, beastRush, beastBuff } from './beastfx';
import { Lingdun } from './lingdun';
// 第三步：战斗系统 —— 法术施放、弹道、区域、召唤、异状与连携、敌人 AI、掉落、熟练度
import { modx } from '../mod/hooks';
import type { Game } from './game';
import { ARTS, ArtSkill, PROF_CD, PROF_CH, PROF_DMG, PROF_NAME, PROF_RAD, effectiveSpellMp, profLevel, StatusKind, StatusSpec, STATUS_NAME, Fx, School, ART_LIST } from '../data/arts';
import { beastSpriteTop } from '../gfx/beastTex';
import { foeRealm } from './demog';
import { canonOwned } from '../data/market';
import { ENEMY_LIST, ENEMIES, EnemyDef, dangerRealm, bandRealm, lvOf, lvRealm, lvName, lvWeight, LAIRS, HIGHER_LAIRS } from '../data/enemies';
import { REALMS, realmDef, realmName, expNeed } from '../data/realms';
import { LOCATIONS, WORLD_SCALE, WORLD_W, WORLD_H, regionAt, LocDef, legacyHere, ACTIVE_MAP, ACTIVE_WORLD, LOC_BY_ID, endlessSeaZoneAt, toLegacy } from '../data/world';
import { worldRealmCap, worldStatScale, worldSpeedScale, planeMeta, planeEnemyTag, planeDefaultEnemyId, planeEncounterRange, clampWorldRealm, type WorldId } from '../data/worldHierarchy';
import { addPlaneRejection, completeImmortalRankKill } from './higherPlane';
import { Ecology, ecoChunkOf, isOutsideVisRect, type EcoBeast, type EcoSeedSpec, type VisRect } from './ecology';
import { itemDef } from '../data/items';
import * as C from './cultivation';
import { clamp } from '../core/rng';
import { CharState, randomLook, Look } from '../gfx/character';
import { audio } from './audio';
/** 走“投放距离”的施法类型 */
const REACH_CASTS = new Set<string>(['bolt', 'fan', 'burst', 'strike', 'beam', 'chain', 'field']);
import type { FxEvent } from '../gl/combatgl';
import type { WarFormation } from './warformation';
import type { WarAirship } from './warairship';
import { ArtActs, lookOf } from './artacts';
import { FoeAI, FoeSkill, isBoss } from './foeskills';
import { FoeMind, absorbWard, Ward, DunKind } from './foemind';
import { rollAffix, affixTick, affixOnHurt, affixOnKill, affixOutDmg, affixDealt, AffixState } from './affix';
import { DagengAct } from './dageng';
import { spawnHeroAct } from './heroacts';
import { guardGui, HuaxingAct } from './huaxing';
import { Swarm } from './swarm';
import { Suppress, supSlow } from './suppress';

/** 各系命中光色 */
const SCHOOL_COL: Partial<Record<School, string>> = { 火: '255,140,60', 冰: '150,220,255', 雷: '170,190,255', 风: '200,255,230', 土: '220,180,110', 木: '150,230,110', 剑: '210,255,240', 体: '255,220,160', 御: '255,210,120', 魔: '230,60,80', 识: '210,170,255', 阵: '255,230,140', 身: '200,240,255', 符: '255,210,110' };
/**
 * 境界压制（v0.64 重定）
 * 以前每差一个大境界：打上去只剩 6%、挨打 ×3.2——炼气打筑基「怎么打都只掉一两滴血」，差距被定死了。
 * 现在境界的差距主要由气血、法力、攻防这些实打实的数值体现；这里只再添一道「门槛」，越往上门槛越高：
 *   门槛（较低一方）   凡→炼气  炼气→筑基  筑基→结丹  结丹→元婴  元婴→化神
 *   低打高：伤害保留    0.85      0.78       0.62       0.50       0.42
 *   高打低：伤害放大    1.10      1.18       1.35       1.50       1.65
 * 跨两境则两道门槛相乘（炼气打结丹 0.78 × 0.62 ≈ 0.48）。符箓借的是外力，门槛减半（取平方根）。
 * gap = 对方大境界 − 我方大境界；me = 我方（出手 / 承伤的一方）的大境界。
 */
export const GAP_DEAL = [0.85, 0.78, 0.62, 0.5, 0.42];
export const GAP_TAKE = [1.1, 1.18, 1.35, 1.5, 1.65];
// 只显式遍历有不同系数的门槛，两端的重复系数用幂运算。避免异常/未来的大境界差导致主线程长循环。
// 当前正常境界范围仍逐项相乘，保留现有平衡；非法输入或溢出返回 0（调用方仍可能有最低伤害）。
function gapMul(tab: number[], lo: number, n: number) {
  if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(n) || n < 0 || !Number.isSafeInteger(lo + n)) return 0;
  const end = lo + n, last = tab.length - 1;
  const left = Math.max(0, Math.min(end, 0) - lo);
  const right = Math.max(0, end - Math.max(lo, last));
  let k = Math.pow(tab[0], left);
  for (let i = Math.max(0, lo); i < Math.min(end, last); i++) k *= tab[i];
  k *= Math.pow(tab[last], right);
  return Number.isFinite(k) ? k : 0;
}
/** 我方（大境界 me）出手，对手高 gap 个大境界（负数 = 低）：伤害系数 */
export function realmDealK(gap: number, talisman = false, me = 2) {
  if (!Number.isSafeInteger(gap) || !Number.isSafeInteger(me)) return 0;
  if (gap > 0) { const k = gapMul(GAP_DEAL, me, gap); return talisman ? Math.sqrt(k) : k; }
  if (gap < 0) return gapMul(GAP_TAKE, me + gap, -gap);
  return 1;
}
/** 我方（大境界 me）挨打，出手者高 gap 个大境界（负数 = 低）：承伤系数 */
export function realmTakeK(gap: number, me = 2) {
  if (!Number.isSafeInteger(gap) || !Number.isSafeInteger(me)) return 0;
  if (gap > 0) return gapMul(GAP_TAKE, me, gap);
  if (gap < 0) return gapMul(GAP_DEAL, me + gap, -gap);
  return 1;
}

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const rint = (a: number, b: number) => Math.floor(rand(a, b + 1));

export interface StatusInst { t: number; dps: number; stacks?: number }
export type Statuses = Partial<Record<StatusKind, StatusInst>>;

/** 各级妖丹的灵光颜色 */
export const YAODAN_COL = ['', '200,220,190', '150,230,170', '120,220,220', '120,170,255', '190,140,255', '255,150,220', '255,120,90', '255,190,70', '255,230,120', '255,250,210'];

// 第三十六步：飞剑克制与五行生克
const ARMORED = new Set(['seaturtle', 'xuangui', 'tujia', 'jinbeiyao', 'tiejiaxie', 'ligui', 'bingjia', 'yinjiamang', 'shanhu', 'guimianxie', 'tiebiyuan', 'ironape', 'zhenhai', 'dujiao', 'jinjiaowang']);
function swordSrc(skill?: string) {
  if (!skill || !skill.startsWith('art:')) return false;
  const k = itemDef(skill.slice(4))?.art?.kind; return k === 'sword' || k === 'needle';
}
type FoeEl = 'ice' | 'fire' | 'water' | 'yin' | 'earth' | '';
function foeElem(e: Enemy): FoeEl {
  const d = e.def as any, fx = d.ranged?.fx ?? '';
  if (d.zone === 'cold' || fx === 'icicle' || fx === 'frost' || fx === 'icefire') return 'ice';
  if (fx === 'fireball' || fx === 'flame' || fx === 'firesnake' || /fire|huo|yan|chi/.test(d.id)) return 'fire';
  if (d.zone === 'sea' || fx === 'water') return 'water';
  if (d.kind === 'ghost' || d.evil) return 'yin';
  if (d.zone === 'arid' || fx === 'rock') return 'earth';
  return '';
}
function elemK(s: School, el: FoeEl) {
  switch (el) {
    case 'ice': return s === '火' ? 1.45 : s === '冰' ? 0.55 : 1;
    case 'fire': return s === '冰' ? 1.45 : s === '火' ? 0.55 : 1;
    case 'water': return s === '雷' ? 1.4 : s === '土' ? 1.2 : s === '火' ? 0.75 : 1;
    case 'yin': return s === '雷' || s === '火' ? 1.3 : s === '魔' ? 0.6 : 1;
    case 'earth': return s === '木' || s === '风' ? 1.3 : 1;
  }
  return 1;
}

/** v0.70+：修士按境界加强 [气血, 攻, 防, 身法]——覆盖凡人至大罗 */
export const HUMAN_BUFF: [number, number, number, number][] = [
  [1, 1, 1, 1], [1.06, 1.05, 1.03, 1], [1.12, 1.08, 1.06, 1.05], [1.4, 1.22, 1.18, 1.25], [1.8, 1.38, 1.3, 1.5], [2.1, 1.5, 1.4, 1.6],
  [2.25, 1.58, 1.46, 1.66], [2.4, 1.65, 1.52, 1.72], [2.55, 1.72, 1.58, 1.78], [2.75, 1.82, 1.66, 1.85], [2.95, 1.92, 1.74, 1.92], [3.15, 2.02, 1.82, 2.0], [3.4, 2.15, 1.92, 2.1],
];
export class Enemy {
  id = Math.random();
  def: EnemyDef; x: number; y: number; hx: number; hy: number;
  vx = 0; vy = 0; kx = 0; ky = 0;
  /** 第三十八步：平滑后的实际移动速度（弹道提前量用）；瞬移时清零 */
  mvx = 0; mvy = 0; lpx = NaN; lpy = NaN;
  /** 第四十一步：境界压制（0 无 · 1 举步维艰 · 2 镇压）/ 压制持续时间 / 是否来自玩家 */
  sup = 0; supOn = 0; supP = false;
  realm: number; stage: number; level: number;
  hp: number; maxHp: number; atk: number; dfn: number; speed: number;
  facing = 1; aggro = false; flee = false; dead = false; deathT = 0;
  /** 同一敌人的挑衅文字独立节流，不影响实际仇恨与战斗。 */
  threatTextTime = -Infinity;
  cdMelee = 0; cdRanged = 1 + Math.random() * 2; windup = 0; wanderT = 0; wx = 0; wy = 0;
  anim = { move: 0, phase: 0, atk: 0, hit: 0, t: Math.random() * 10, flying: false };
  st: Statuses = {};
  look?: Look; cs?: CharState;
  name: string;
  hitFlash = 0; lastHitBy = 0;
  sea: boolean;
  sectName?: string;   // 所属门派名称（统一显示为 门派·姓名·境界）
  shortName?: string;  // 纯净姓名（不含称号/门派前缀）
  warOrigin?: string;  // 战事/遭遇战来历出处（如「归意门前线大营巡哨」「天欢宗运丹车队护卫」）
  npcId?: string;      // 第四步：由人界 NPC 转化而来的敌人
  spar?: boolean;      // 切磋：不致死
  /** 第二十九步：血量跌破此比例时求饶（0 = 死战到底） */
  yieldAt?: number;
  /** 第二十九步：仇恨目标（玩家 / 替身 / 灵宠 / 傀儡 / 虫群 / 同伴） */
  tankRef?: any; tankT = 0;
  boss?: boolean;      // 事件首领
  /** 妖兽等阶 1–10（无等阶的鬼物 / 修士为 0） */
  blv = 0;
  lairId?: string;     // 妖王巢穴
  burrowed = false;    // 土甲龙：已土遁过一次
  called = false;      // 云翅鸟：已示警
  /** 第十八步：沉睡的守护兽（贴近或受击才醒）/ 正与同类相争的妖兽（不理会旁人）*/
  sleep?: boolean; busy?: boolean; tag?: string;
  /** 第二十七步：招式 */
  kit?: FoeSkill[]; skCd: Record<string, number> = {}; skT = 1.2 + Math.random() * 2; cast: any = null;
  /** 修士/敌人法力（灵力池）：施法与御使远程法诀耗蓝，灵力告罄须短暂调息回气 */
  mp = 0; maxMp = 0; mpRegen = 0; medT = 0;
  lift = 0; guardT = 0; rage = 0; used?: Record<string, boolean>; dodgeCd = 1 + Math.random() * 2; minion?: boolean;
  /** 第三十二步：护体灵光（打碎前先吃伤害）/ 重凝倒计时 */
  ward?: Ward; wardRe = 0; wardFrac = 0; wardCol?: string;
  /** 遁光（0‥1，驱动拖尾与御器离地）/ 遁法 / 御器离地高度 */
  dun = 0; dunKind?: DunKind; flyH = 0; trailReset?: boolean; hideT = 0;
  fieldT = 0; retreatT = 0; lowDone = false; blinkCd = 3 + Math.random() * 5; supCd = 4; role?: 'tank' | 'ranged' | 'support'; slotA?: number;
  /** 追杀者（由追杀系统驱动远距离移动）/ 追杀者的同伙 */
  pursuer?: boolean; wing?: boolean;
  /** 第三十七步：瞬移闪避（剩余次数 / 冷却 / 回气 / 判定间隔）；见高人而退 / 被惹急了 / 已遁走 */
  evadeN = -1; evadeCd = 0; evadeRe = 0; evRoll = 0; cowered = false; provoked = false; gone = false; fled = false;
  /** 第三十五步：精英词缀 / 门派（决定修士的功法套路） */
  affix?: AffixState; school?: string; lastSk?: string;
  /** 第三十九步·混战：ally = 与你同阵（你的法术伤不到，也不打你）；team = 敌人内部的派系，不同派系彼此厮杀（未设者同属「野」） */
  ally?: boolean; team?: string;
  /** 当前对手是否是你这一方 / 对手是某个 NPC / 记仇（最近打它的人）/ 死于 NPC 之手 */
  tgP = true; tgE?: Enemy; grudge?: Enemy; grudgeT = -99; npcKill?: boolean; killer?: Enemy;
  /** 同阵修士：到点且不在交战就自行离去 */
  leaveAt?: number;
  /** 专冲你来的（前线与你同阶的敌将等）：混战中仍优先找你 */
  hunt?: boolean;
  /** 斩仙榜挂名大敌 ID（击杀后正法除名并赐下玉皇仙庭奖赏） */
  immortalRankId?: string;
  /** P4 生态账本槽位编号（野外常规妖兽/劫修持久休眠与唤醒） */
  ecoId?: number;
  constructor(def: EnemyDef, x: number, y: number, realm: number, stage: number, sea = false, worldId: WorldId = ACTIVE_WORLD) {
    this.def = def; this.x = this.hx = x; this.y = this.hy = y;
    this.realm = realm; this.stage = stage; this.level = realm * 13 + stage;
    const R = REALMS[realm];
    const s = Math.min(stage, R.hp.length - 1);
    const law = worldStatScale(realm, worldId);
    const speedLaw = worldSpeedScale(realm, worldId);
    // 第三十五步：敌人整体加强（妖兽更皮实、更凶）；高维界域空间法则同幅收敛防数值膨胀
    const beast = def.kind !== 'human';
    this.maxHp = this.hp = Math.max(1, Math.round(R.hp[s] * def.hp * (beast ? 1.5 : 1.25) * (def.lair ? 1.6 : 1) * law));
    this.atk = R.atk[s] * def.atk * (beast ? 1.2 : 1.1) * law;
    this.dfn = R.def[s] * def.def * law;
    this.speed = def.speed * speedLaw;
    this.anim.flying = !!def.flying;
    this.sea = sea;
    this.name = def.name;
    if (def.lv) this.blv = Math.max(def.lv[0], Math.min(def.lv[1], lvOf(realm, stage)));
    // v0.60：四级以上妖兽身法大进（原先各级一律用固定移速，结丹、元婴级的妖兽追不上人）
    if (this.blv >= 4 && def.kind !== 'human') this.speed = beastSpeed(def.speed * speedLaw, this.blv, R.speed * speedLaw, !!def.flying);
    // v0.63：四级以上妖兽体魄再加强（气血 / 妖力 / 皮甲随级别递增）
    if (this.blv >= 4 && def.kind !== 'human') { const bb = beastBuff(this.blv); this.maxHp = this.hp = Math.max(1, Math.round(this.maxHp * bb.hp)); this.atk *= bb.atk; this.dfn *= bb.def; }
    if (def.kind === 'human') {
      // v0.70：修士按境界加强——炼气、筑基略强一点；结丹、元婴及灵仙高阶大幅加强
      const hb = HUMAN_BUFF[Math.min(HUMAN_BUFF.length - 1, realm)];
      this.maxHp = this.hp = Math.max(1, Math.round(this.maxHp * hb[0])); this.atk *= hb[1]; this.dfn *= hb[2]; this.speed *= hb[3];
      this.maxMp = this.mp = Math.max(1, Math.round(R.mp[s] * (0.85 + hb[0] * 0.28) * law));
      this.mpRegen = Math.max(2, this.maxMp * 0.032);
      let seed = Math.floor(Math.random() * 1e9);
      const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      this.look = randomLook(rnd, 'cultivator');
      if (def.robe) (this.look as any).robe = def.robe;
      this.cs = new CharState(x, y);
    } else {
      this.maxMp = this.mp = Math.max(1, Math.round(R.mp[s] * (beast ? 1.35 : 1.15) * law));
      this.mpRegen = Math.max(2, this.maxMp * 0.036);
    }
  }
  get rankText() {
    if (this.blv) return lvName(this.blv, this.stage) + (this.def.lair ? (this.def.title?.split('·')[0] ?? '妖王') : this.def.kind === 'ghost' ? '阴物' : '妖兽');
    if (this.def.kind === 'human' || this.def.kind === 'ghost') return realmName(this.realm, this.stage);
    const lv = this.realm === 1 ? (this.stage < 5 ? 1 : this.stage < 10 ? 2 : 3) : this.realm === 2 ? 3 + Math.min(1, this.stage) : this.realm === 3 ? 5 + Math.min(1, this.stage) : 7 + Math.min(1, this.stage);
    return ['', '一级', '二级', '三级', '四级', '五级', '六级', '七级', '八级'][lv] + '妖兽';
  }
}

interface Proj {
  fac: 'p' | 'e'; x: number; y: number; vx: number; vy: number; life: number; max: number;
  fx: Fx; color: string; dmg: number; realm: number; status?: StatusSpec; stCh: number;
  pierce: boolean; homing: boolean; hit: Set<number>; r: number; aoe: number; school?: School;
  evil?: number; size: number; trail: [number, number][]; tick?: number; lv: number; target?: Enemy | null; targetForm?: WarFormation | null; skill?: string; tk?: any;
  /** 第三十九步：发射者（敌我混战）/ 同阵修士所发，不伤你 */
  src?: Enemy; ally?: boolean;
}
interface Field { x: number; y: number; r: number; t: number; dur: number; fx: Fx; color: string; dmg: number; tick: number; status?: StatusSpec; stCh: number; school?: School; heal?: boolean; follow?: boolean; lv: number; realm: number; evil?: number }
interface Vfx { kind: 'ring' | 'beam' | 'chain' | 'strike' | 'cone' | 'flash' | 'warn' | 'slash' | 'aura' | 'blinkfx' | 'bigsword' | 'pillar'; x: number; y: number; x2?: number; y2?: number; r: number; t: number; dur: number; color: string; fx?: Fx; ang?: number; spread?: number; pts?: [number, number][]; seed?: number; w?: number; source?: EnemyLike }
interface Txt { x: number; y: number; s: string; color: string; t: number; big?: boolean; vy: number; source?: EnemyLike }
type Loot = WorldDrop;
interface Summon { hp?: number; cs?: CharState; lv?: number; age?: number; maxT?: number; atk?: number; ax?: number; ay?: number; slot?: number; big?: number; mv?: number; gone?: boolean; boomed?: boolean; kind: 'bugs' | 'puppet' | 'fox' | 'tihun' | 'demon' | 'jiao' | 'quhun'; x: number; y: number; t: number; dmg: number; cd: number; target: Enemy | null; phase: number; facing: number; n: number; evil?: number; status?: StatusSpec; dots?: { a: number; r: number; s: number }[] }
interface Strike { x: number; y: number; t: number; dmg: number; r: number; status?: StatusSpec; stCh: number; school?: School; fx: Fx; color: string; realm: number; evil?: number; lv: number }
interface Tank { k: 'p' | 'decoy' | 'summon' | 'swarm' | 'pet' | 'ally' | 'foe' | 'body' | 'gui' | 'abody'; x: number; y: number; w: number; ref?: any }
interface Spark { x: number; y: number; vx: number; vy: number; t: number; max: number; size: number; color: string; source?: EnemyLike }

const SUMMON_COLOR: Record<string, string> = { fox: '200,230,255', puppet: '220,190,140', tihun: '210,170,255', demon: '255,80,70', jiao: '120,240,180', quhun: '140,255,180', bugs: '255,215,90' };

/** 第三十九步：NPC 互斗的伤害系数（让混战打上半分钟到一分钟，而不是几息之间就倒一片） */
const NPC_DMG = 0.55;
/** v0.64：被高境界的敌人盯上时的迟滞——头一个大境界只沉一分（按你的境界：凡 8% · 炼气 10% · 筑基 15% · 结丹 18% · 元婴 20%），第二个再加两成 */
const PRESS_SLOW = [0.08, 0.1, 0.15, 0.18, 0.2];
/** v0.64：高出两个大境界的修士不屑对小辈出手时的一句话 */
const DISDAIN = ['哼，蝼蚁。', '区区小辈，不值得本座出手。', '滚远些，莫污了本座的眼。', '……（瞥了你一眼，懒得理会）'];

export class Combat {
  game: Game;
  enemies: Enemy[] = [];
  /** P4 生态账本：区块持久槽位、休眠/唤醒与视野外迁入 */
  eco = new Ecology();
  /** 第三十九步：与你同阵的修士（走同一套 AI，但不在 enemies 里——你的一切法术、法宝、灵宠都不会碰到他们） */
  allies: Enemy[] = [];
  /** 敌人 + 同阵（绘制与混战索敌用） */
  get units(): Enemy[] { return this.allies.length ? this.enemies.concat(this.allies) : this.enemies; }
  private U: Enemy[] = [];
  /** 此刻是否有混战（有同阵修士，或有编了派系的敌人） */
  melee = false;
  private tgCnt = new Map<any, number>();
  projs: Proj[] = [];
  fields: Field[] = [];
  vfx: Vfx[] = [];
  texts: Txt[] = [];
  loot: Loot[] = [];
  summons: Summon[] = [];
  strikes: Strike[] = [];
  sparks: Spark[] = [];
  cds = new Map<string, number>();
  cdMax = new Map<string, number>();
  // 玩家状态
  pst: Statuses = {};
  buffs: { atk: number; def: number; speed: number; regen: number; stealth: number; decoy: number; until: Record<string, number> } = { atk: 0, def: 0, speed: 0, regen: 0, stealth: 0, decoy: 0, until: {} };
  shield: { amt: number; max: number; t: number; reflect: number; status?: StatusSpec; fx: Fx; color: string; art?: string } | null = null;
  /** 盾形法器格挡闪光（0–1）与来袭方向 */
  blockT = 0; blockDir = 0; shieldCd = 0; shieldAng = 0;
  /** v0.63：灵力护盾（炼气即有，随境界叠层） */
  lingdun = new Lingdun(this);
  /** 法器盾的悬浮位置（玩家身前，挡格时转向来袭方向） */
  shieldPos() {
    const p = this.game.player, t = this.game.time;
    return { x: p.x + Math.cos(this.shieldAng) * 46, y: p.y + Math.sin(this.shieldAng) * 16, h: 62 + Math.sin(t * 2.4) * 4 - this.blockT * 6, front: Math.sin(this.shieldAng) > -0.2 };
  }
  orbit: { t: number; n: number; r: number; dmg: number; color: string; hitT: Map<number, number>; lv: number } | null = null;
  heal: { t: number; rate: number; mp: number } | null = null;
  dash: { t: number; dur: number; vx: number; vy: number; dmg: number; hit: Set<number>; invuln: boolean; color: string } | null = null;
  decoy: { x: number; y: number; t: number } | null = null;
  castT = 0; hitT = 0; combatT = 99; invulnT = 0;
  /** 施法序号：每真正起手一次 +1，画面用它判断是否要打断上一式、重播手势 */
  castSeq = 0;
  lock: Enemy | null = null;
  lockForm: WarFormation | null = null;
  lockAirship: WarAirship | null = null;
  private spawnT = 2;
  /** 第三十一步：兽潮剩余时间 / 冷却；当前所处的妖气档 */
  tideT = 0; private tideCd = 240; private kTier = -1;
  private dangerCache = { x: -1e9, y: -1e9, d: 0, k: 0, zone: '' as string, region: '' };
  fade = 0;
  /** 渲染特效事件队列（WebGL 层消费） */
  fxq: FxEvent[] = [];
  /** 第二十八步：地面焦痕 */
  /** 蚀金蛊群（功法）与灵宠虫群 */
  swarm: Swarm | null = null; petSwarm: Swarm | null = null;
  /** 云雷双翼展开（秒）；雷遁 / 血遁残影 */
  wing: { t: number; max: number; lv: number; flap: number } | null = null;
  ghosts: { x: number; y: number; t: number; dur: number; color: string; yaw: number }[] = [];
  private ghostT = 0;
  private hitJuiceT = -1;
  addGhosts(x0: number, y0: number, x1: number, y1: number, n: number, color: string, dur = 0.5) {
    const yaw = this.game.player.st.yaw;
    for (let i = 0; i < n; i++) { const k = i / Math.max(1, n - 1); this.ghosts.push({ x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, t: -k * 0.08, dur, color, yaw }); }
    if (this.ghosts.length > 40) this.ghosts.splice(0, this.ghosts.length - 40);
  }
  scorch: { x: number; y: number; r: number; t: number; dur: number; rot: number; color: string }[] = [];
  /** 统一打击感：1 小 / 2 中 / 3 大——分级震屏（带上限）、气浪、闪光、焦痕（不再强行慢放/顿帧拖慢连击节奏） */
  impact(x: number, y: number, tier: 1 | 2 | 3, color = '255,236,190') {
    const g = this.game, near = Math.hypot(x - g.player.x, y - g.player.y) < 1400;
    if (near) {
      if (tier === 1) g.juice(0, 0.08, 0.22);
      else if (tier === 2) { g.juice(0, 0.2, 0.34); g.aberrKick = Math.max(g.aberrKick, 0.2); }
      else { g.juice(0, 0.4, 0.46); g.aberrKick = Math.max(g.aberrKick, 0.45); }
    }
    if (tier >= 2 && this.scorch.length < 24) this.scorch.push({ x, y, r: tier === 3 ? 240 : 90, t: 0, dur: tier === 3 ? 10 : 6, rot: Math.random() * TAU, color });
    this.fxq.push({ k: 'impact', x, y, color, power: tier });
  }
  dodgeCd = 0;
  /** 威压：附近敌对高境界者带来的压制（0 无；1 = 高一大境界） */
  pressure = 0;
  private pressWarnT = 0;

  /** 第十三步：法器出手（实体 + 光效） */
  acts: ArtActs;
  /** 第二十七步：敌人招式与地面预警 */
  foe: FoeAI;
  mind: FoeMind;
  /** 第四十一步：境界压制 */
  sup: Suppress;
  constructor(game: Game) { this.game = game; this.acts = new ArtActs(this); this.foe = new FoeAI(this); this.mind = new FoeMind(this); this.sup = new Suppress(this); }
  /** 召唤来的援兵（略弱于施术者） */
  /** v0.64：高出你两个大境界的修士自重身份，不屑对小辈出手——首领 / 追兵 / 仇家 / 剧情人物 / 混战中人 / 被你先打了的不在此列 */
  disdains(e: Enemy): boolean {
    if (e.def.kind !== 'human' || e.realm < this.game.hero.realm + 2) return false;
    return !(e.provoked || e.boss || e.pursuer || e.wing || e.hunt || e.spar || e.tag || e.npcId || e.minion || e.ally || e.team || (e as any).warRos);
  }
  /** 走进他的眼皮底下：他只冷冷一瞥（每人只说一次），并不动手 */
  private snub(e: Enemy): boolean {
    if (!this.disdains(e)) return false;
    const E = e as any;
    if (!E.snubbed) {
      E.snubbed = true;
      this.texts.push({ x: e.x, y: e.y - 125, s: DISDAIN[Math.floor(Math.random() * DISDAIN.length)], color: '#cfc4f0', source: e, t: 0, vy: -18 });
      this.game.hint('disdain', '高出你两个大境界的修士自重身份，不屑对小辈出手——绕着走便是。你若先动手，他可不会客气。');
    }
    return true;
  }
  makeMinion(def: EnemyDef, x: number, y: number, src: Enemy): Enemy | null {
    const realm = def === src.def ? src.realm : Math.max(1, src.realm - (def.kind === 'ghost' ? 0 : 1));
    const stage = def === src.def ? Math.max(0, src.stage - 3) : Math.max(0, src.stage - 2);
    const m = new Enemy(def, x, y, realm, stage, src.sea);
    m.aggro = true; m.minion = true; m.hx = src.hx; m.hy = src.hy;
    m.maxHp = m.hp = Math.round(m.maxHp * 0.6);
    m.team = src.team;
    if (src.ally) { m.ally = true; this.allies.push(m); } else this.enemies.push(m);
    return m;
  }

  reset() {
    this.enemies = []; this.allies = []; this.U = []; this.projs = []; this.fields = []; this.vfx = []; this.texts = []; this.loot = []; this.summons = []; this.laterQ = []; this.strikes = []; this.sparks = []; this.foe?.reset(); this.eco.clear(); this.scorch = []; this.swarm = null; this.petSwarm = null; this.wing = null; this.ghosts = [];
    this.cds.clear(); this.pst = {}; this.shield = null; this.orbit = null; this.heal = null; this.dash = null; this.decoy = null; this.lock = null; this.lockForm = null; this.lockAirship = null; this.acts?.reset();
    this.buffs = { atk: 0, def: 0, speed: 0, regen: 0, stealth: 0, decoy: 0, until: {} };
  }

  // ------------------------------------------------------------ 玩家数值
  get pStats() {
    const g = this.game, s = g.stats, h = g.hero;
    let def = s.def;
    const armor = h.equip.armor ? itemDef(h.equip.armor).art : undefined;
    if (armor?.def) def *= 1 + armor.def;
    def *= 1 + this.buffs.def;
    if (this.pst.break) def *= 0.5;
    return { hp: s.hp, mp: s.mp, atk: s.atk * (1 + this.buffs.atk) * (g.yuanying?.atkMul() ?? 1), def, realm: h.realm, sense: s.sense };
  }
  artLv(id: string) { const a = this.game.hero.arts.find((x) => x.id === id); const d = ARTS[id]; return a && d ? profLevel(d.tier, a.xp) : 0; }
  get canAct() { return !this.pst.stun && !this.pst.freeze && !this.pst.shock && !this.game.hero.dead; }
  get inCombat() {
    const p = this.game.player;
    return this.enemies.some((e) => !e.dead && e.aggro && !e.spar && Math.abs(e.x - p.x) < 1100 && Math.abs(e.y - p.y) < 1100)
      || !!this.game.sectwar?.nearestFoeFormation?.(p.x, p.y, 1100)
      || !!this.game.sectwar?.nearestFoeAirship?.(p.x, p.y, 1200);
  }
  get canMove() { return this.canAct && !this.pst.root && !this.dash; }
  get speedMul() { const pr = Math.min(2, this.pressure), k1 = PRESS_SLOW[Math.max(0, Math.min(PRESS_SLOW.length - 1, this.game.hero.realm))]; return (this.pst.slow ? 0.5 : 1) * (1 + this.buffs.speed) * (1 - k1 * Math.min(1, pr) - 0.2 * Math.max(0, pr - 1)); }

  // ------------------------------------------------------------ 瞄准
  /** 投放距离直接与清晰感知圈对齐，保证清晰内圈中看得见的敌人皆可触及。所有远程功法、法器、符箓共用 */
  get reach() { const g = this.game; return g.detailSenseRadius ?? detailSenseRange(g.senseRadius, g.hero?.realm ?? 0, ACTIVE_WORLD); }
  /** 把功法的射程换成投放距离（锥形吐息、自身周围的爆发、位移类不变）；弹道相应提速，免得远射慢吞吞 */
  reachSkill(s: ArtSkill): ArtSkill {
    if (!REACH_CASTS.has(s.cast) || !(s.range > 0) || s.id === 'juling') return s;
    const R = this.reach, o: ArtSkill = { ...s, range: R };
    if (s.cast === 'bolt' || s.cast === 'fan') o.speed = Math.max(s.speed ?? 700, R / (s.dur ?? 1.25));
    return o;
  }
  /** 手动锁定（点击敌人 / 点击敌方战阵 / Tab 轮换）：目标存活、可见、在精细感知圈内时一直有效 */
  manual = false;
  private lockT = 0;
  private formValid(f: WarFormation | null): f is WarFormation {
    if (!f || f.ours || f.collapsed || f.soldiers <= 0) return false;
    const sw = this.game.sectwar;
    if (!sw) return false;
    const list = sw.activeFoeFormations();
    if (!list.includes(f)) return false;
    const p = this.game.player, R = (this.game.detailSenseRadius ?? detailSenseRange(this.game.senseRadius, this.game.hero?.realm ?? 0));
    return sw.formationClosestPoint(f, p.x, p.y).dist <= R;
  }
  private shipValid(s: WarAirship | null): s is WarAirship {
    if (!s || s.ours || s.sunk) return false;
    const sw = this.game.sectwar;
    if (!sw) return false;
    if (!sw.activeFoeAirships().includes(s)) return false;
    const p = this.game.player, R = (this.game.detailSenseRadius ?? detailSenseRange(this.game.senseRadius, this.game.hero?.realm ?? 0));
    return Math.hypot(s.x - p.x, (s.y - s.zLift * 0.72) - p.y) <= R + 160;
  }
  /** 护盾未破的战阵成员受整阵护佑，不单独作为单体被锁定或受单体伤害 */
  private isShieldedFormUnit(e: Enemy | null | undefined): boolean {
    if (!e) return false;
    const wf = (e as any).warForm as WarFormation | undefined;
    return !!(wf && !wf.collapsed && wf.soldiers > 0 && (wf.shield ?? 0) > 0);
  }
  /** v0.54：不冲你来的人（猎妖散修、斗法双方、赶赴秘境的人群）不进自动锁定——手动点选照样能打 */
  private targetable(e: Enemy) { return !e.dead && !(e.hideT > 0) && !(e.spar && !e.aggro) && !((e as any).noP && this.lock !== e) && !this.isShieldedFormUnit(e); }
  /** 第三十八步：所有出手（功法 / 法器 / 符箓 / 飞剑 / 召唤）都锁最近的敌人、敌方战阵或敌方飞舟，绝不跟鼠标或朝向箭头。 */
  pickTarget(): Enemy | null {
    const g = this.game, p = g.player, reach = this.reach, R = (g.detailSenseRadius ?? detailSenseRange(g.senseRadius, g.hero?.realm ?? 0));
    if (this.manual && this.shipValid(this.lockAirship)) return null;
    if (this.lockAirship && !this.shipValid(this.lockAirship)) this.lockAirship = null;
    if (this.manual && this.formValid(this.lockForm)) return null;
    if (this.lockForm && !this.formValid(this.lockForm)) this.lockForm = null;
    const L = this.lock;
    if (this.manual && L && this.targetable(L) && Math.hypot(L.x - p.x, L.y - p.y) <= R) { this.lockForm = null; this.lockAirship = null; return L; }
    this.manual = false;
    let bA: Enemy | null = null, dA = reach, bN: Enemy | null = null, dN = reach, bF: Enemy | null = null, dF = R;
    for (const e of this.enemies) {
      if (!this.targetable(e)) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (e.aggro && d < dA) { dA = d; bA = e; }
      if (d < dN) { dN = d; bN = e; }
      if (e.aggro && d < dF) { dF = d; bF = e; }
    }
    const t = bA ?? bN ?? bF;
    const nearForm = g.sectwar?.nearestFoeFormation(p.x, p.y, reach) ?? null;
    const nearShip = g.sectwar?.nearestFoeAirship(p.x, p.y, reach + 140) ?? null;
    const eDist = t ? Math.hypot(t.x - p.x, t.y - p.y) : Infinity;
    const fDist = nearForm ? g.sectwar!.formationClosestPoint(nearForm, p.x, p.y).dist : Infinity;
    const sDist = nearShip ? Math.hypot(nearShip.x - p.x, (nearShip.y - nearShip.zLift * 0.72) - p.y) : Infinity;
    if (nearForm && fDist + 40 < eDist && fDist <= sDist + 40) {
      this.lock = null;
      this.lockForm = nearForm;
      this.lockAirship = null;
      return null;
    }
    if (nearShip && (!t || sDist + 60 < eDist)) {
      this.lock = null;
      this.lockForm = null;
      this.lockAirship = nearShip;
      return null;
    }
    this.lock = t;
    if (t) { this.lockForm = null; this.lockAirship = null; }
    return t;
  }
  /** Tab：在精细感知圈内的敌人、敌方战阵与敌方飞舟之间按远近轮换手动锁定 */
  cycleLock() {
    const p = this.game.player, R = (this.game.detailSenseRadius ?? detailSenseRange(this.game.senseRadius, this.game.hero?.realm ?? 0));
    const list = this.enemies.filter((e) => this.targetable(e) && Math.hypot(e.x - p.x, e.y - p.y) <= R).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    const forms = (this.game.sectwar?.activeFoeFormations() ?? []).filter((f) => this.game.sectwar!.formationClosestPoint(f, p.x, p.y).dist <= R);
    const ships = (this.game.sectwar?.activeFoeAirships() ?? []).filter((s) => Math.hypot(s.x - p.x, (s.y - s.zLift * 0.72) - p.y) <= R + 160);
    const items: ({ k: 'e'; e: Enemy } | { k: 'f'; f: WarFormation } | { k: 's'; s: WarAirship })[] = [
      ...list.map((e) => ({ k: 'e' as const, e })),
      ...forms.map((f) => ({ k: 'f' as const, f })),
      ...ships.map((s) => ({ k: 's' as const, s })),
    ];
    if (!items.length) { this.lock = null; this.lockForm = null; this.lockAirship = null; this.manual = false; return; }
    const idx = items.findIndex((it) => (it.k === 'e' ? it.e === this.lock : it.k === 'f' ? it.f === this.lockForm : it.s === this.lockAirship));
    const next = items[(idx + 1) % items.length];
    if (next.k === 'e') { this.lock = next.e; this.lockForm = null; this.lockAirship = null; }
    else if (next.k === 'f') { this.lockForm = next.f; this.lock = null; this.lockAirship = null; }
    else { this.lockAirship = next.s; this.lock = null; this.lockForm = null; }
    this.manual = true;
  }
  /** 锁定标记随时指向“下一招会打谁”：每 0.2 秒刷新 */
  refreshLock(dt: number) {
    this.lockT -= dt; if (this.lockT > 0) return; this.lockT = 0.2;
    const p = this.game.player;
    if (this.manual) {
      if (this.shipValid(this.lockAirship)) return;
      if (this.formValid(this.lockForm)) return;
      const L = this.lock;
      if (L && this.targetable(L) && Math.hypot(L.x - p.x, L.y - p.y) <= (this.game.detailSenseRadius ?? detailSenseRange(this.game.senseRadius, this.game.hero?.realm ?? 0))) return;
      this.manual = false; this.lock = null; this.lockForm = null; this.lockAirship = null;
    }
    let b: Enemy | null = null, bd = this.reach;
    for (const e of this.enemies) { if (!this.targetable(e) || !e.aggro) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; b = e; } }
    const nf = this.game.sectwar?.nearestFoeFormation(p.x, p.y, this.reach) ?? null;
    const ns = this.game.sectwar?.nearestFoeAirship(p.x, p.y, this.reach + 140) ?? null;
    const fd = nf ? this.game.sectwar!.formationClosestPoint(nf, p.x, p.y).dist : Infinity;
    const sd = ns ? Math.hypot(ns.x - p.x, (ns.y - ns.zLift * 0.72) - p.y) : Infinity;
    if (nf && fd + 40 < bd && fd <= sd + 40) {
      this.lock = null;
      this.lockForm = nf;
      this.lockAirship = null;
      return;
    }
    if (ns && (!b || sd + 60 < bd)) {
      this.lock = null;
      this.lockForm = null;
      this.lockAirship = ns;
      return;
    }
    this.lockForm = null;
    this.lockAirship = null;
    if (b || (this.lock && (!this.targetable(this.lock) || Math.hypot(this.lock.x - p.x, this.lock.y - p.y) > this.reach))) this.lock = b;
  }
  /** 瞄准：锁定目标（含敌方战阵与飞舟）；speed>0 时按弹速给移动目标留提前量。没有目标才用朝向 */
  aim(range: number, speed = 0): { x: number; y: number; dx: number; dy: number; target: Enemy | null } {
    const p = this.game.player;
    const target = this.pickTarget();
    if (target) {
      let tx = target.x, ty = target.y - (target.anim.flying ? 70 : 24);
      if (speed > 0) {
        const tt = Math.min(1.2, Math.hypot(tx - p.x, ty - p.y) / speed);
        tx += target.mvx * tt; ty += target.mvy * tt;
      }
      const d = Math.hypot(tx - p.x, ty - p.y) || 1;
      return { x: tx, y: ty, dx: (tx - p.x) / d, dy: (ty - p.y) / d, target };
    }
    if (this.shipValid(this.lockAirship)) {
      const s = this.lockAirship;
      const tx = s.x, ty = s.y - s.zLift * 0.72;
      const d = Math.hypot(tx - p.x, ty - p.y) || 1;
      return { x: tx, y: ty, dx: (tx - p.x) / d, dy: (ty - p.y) / d, target: null };
    }
    if (this.formValid(this.lockForm)) {
      const pt = this.game.sectwar!.formationClosestPoint(this.lockForm, p.x, p.y);
      const tx = pt.x, ty = pt.y - 24;
      const d = Math.hypot(tx - p.x, ty - p.y) || 1;
      return { x: tx, y: ty, dx: (tx - p.x) / d, dy: (ty - p.y) / d, target: null };
    }
    void range;
    const yaw = p.st.yaw;
    const dx = Math.sin(yaw), dy = Math.cos(yaw);
    return { x: p.x + dx * range * 0.7, y: p.y + dy * range * 0.7, dx, dy, target: null };
  }

  // ------------------------------------------------------------ 施放
  /** 施放快捷栏条目：法术 id 或 'art:物品id' */
  castSlot(i: number) {
    const id = this.game.hero.hotbar[i];
    if (!id) { this.game.toast(`快捷栏 ${i + 1} 尚未放置法术。按 K 打开法术书。`); return; }
    if (id.startsWith('art:')) this.castArtifact(id.slice(4));
    else if (id.startsWith('tal:')) this.castTalisman(id.slice(4));
    else if (id.startsWith('zf:')) this.game.zhenfa.deploy(id.slice(3));
    else this.cast(id);
  }

  cdLeft(id: string) { return Math.max(0, this.cds.get(id) ?? 0); }
  cdFrac(id: string) { const m = this.cdMax.get(id) ?? 1; return clamp(this.cdLeft(id) / m, 0, 1); }

  cast(id: string) {
    const g = this.game, h = g.hero, s = ARTS[id];
    if (!s) return;
    if (!h.arts.some((a) => a.id === id)) { g.toast(`尚未习得${s.name}。`, 'warn'); return; }
    if (!this.canAct) return;
    if (h.realm < s.realm) { g.toast(`${s.name}需${REALMS[s.realm].name}期方可施展。`, 'warn'); return; }
    if (s.needs && C.bagCount(h, s.needs) <= 0) { g.toast(`${s.name}需要${itemDef(s.needs).name}。`, 'warn'); return; }
    // v0.53：元婴出窍——出窍中再按即归窍（不耗法力、不记冷却）
    if (id === 'yuanying' && g.yingEsc) { g.toast('肉身已毁，无窍可归——先寻个清净处，等元婴重塑肉身。', 'warn'); return; }
    if (id === 'yuanying' && g.yuanying?.active) { g.yuanying.back('manual'); return; }
    if (this.cdLeft(id) > 0) return;
    if (s.cast === 'sense') {
      if (id === 'waifang') g.senseBurst(); else g.toggleConceal();
      this.setCd(id, s.cd); return;
    }
    const lv = this.artLv(id);
    const sMp = effectiveSpellMp(s, h.realm, h.stage ?? 0, lv).ratio;   // 高境界施展低阶法术按境界差与熟练度降耗
    if (h.mp < sMp - 1e-6) { g.toast('法力不足。', 'warn'); return; }
    if (s.hpCost && h.hp <= s.hpCost + 0.02) { g.toast('气血不足，强行施展恐有性命之忧。', 'warn'); return; }
    if (g.player.sitting) g.stand();
    if (g.isFlying && g.player.flying && !g.canFly) g.toggleFly();
    h.mp -= sMp; if (s.hpCost) h.hp -= s.hpCost;
    this.setCd(id, s.cd * PROF_CD[lv]);
    this.castT = 0.45; this.castSeq++; this.combatT = 0;
    if (g.concealed && s.power > 0) g.toggleConceal();
    this.buffs.until.stealth && (this.buffs.until.stealth = Math.min(this.buffs.until.stealth, g.time + (lv >= 3 && id === 'nifeng' ? 99 : 0)));
    let sr = this.reachSkill(s);
    // v0.53：元婴出窍时元婴瞬移更远、冷却减半
    if (id === 'yingshun' && g.yuanying?.active) { sr = { ...sr, range: sr.range * 1.8 }; this.setCd(id, s.cd * PROF_CD[lv] * 0.5); }
    const a = this.aim(sr.range || 400, sr.cast === 'bolt' || sr.cast === 'fan' ? (sr.speed ?? 700) : 0);
    g.player.st.faceToward(a.dx, a.dy, false);
    if (s.cast !== 'custom') this.exec(sr, lv, a, this.pStats.atk * (g.canjuan?.powMul(id) ?? 1), this.pStats.realm);   // v0.57：custom = 出手全由模组决定；v0.70：残卷功法按残篇 / 境界折算
    modx?.artCast(id, { x: g.player.x, y: g.player.y, tx: a.x, ty: a.y, target: a.target });
    this.gainXp(id, 1);
    audio.dir.cast(s, g.player.x, g.player.y);
  }

  private setCd(id: string, cd: number) { this.cds.set(id, cd); this.cdMax.set(id, cd); }

  gainXp(id: string, n: number) {
    const h = this.game.hero, a = h.arts.find((x) => x.id === id), s = ARTS[id];
    if (!a || !s) return;
    const before = profLevel(s.tier, a.xp);
    a.xp += n;
    const after = profLevel(s.tier, a.xp);
    if (after > before) {
      this.game.toast(`${s.name}熟练度提升至「${PROF_NAME[after]}」：${s.evo[after - 1]}`, 'good');
      audio.sfx('chime');
      this.vfx.push({ kind: 'ring', x: this.game.player.x, y: this.game.player.y, r: 160, t: 0, dur: 0.9, color: s.color });
    }
  }

  private exec(s: ArtSkill, lv: number, a: ReturnType<Combat['aim']>, atk: number, realm: number) {
    const p = this.game.player;
    const dmg = atk * s.power * PROF_DMG[lv] * gongfaArtMul(this.game.hero.gongfa, s.school);   // v0.60：主修心法对该系法术的加成
    const stCh = (s.status?.ch ?? 0) + (s.status ? PROF_CH[lv] : 0);
    const radius = (s.radius ?? 0) * PROF_RAD[lv];
    const count = s.count === undefined ? (s.lvCount ? s.lvCount[lv] : 1) : s.count + (s.lvCount ? s.lvCount[lv] - s.lvCount[0] : 0);
    const ox = p.x + a.dx * 26, oy = p.y - 46 + a.dy * 10;
    const base = { fac: 'p' as const, fx: s.fx, color: s.color, realm, status: s.status, stCh, school: s.school, evil: s.vsEvil, lv, skill: s.id };
    // 第三十步：剑影分光术 / 归墟鼎 / 洞漩金光 / 天衍神识冲击——专属特效接管
    if (spawnHeroAct(this, s, lv, dmg, base, a, radius, count)) return;
    switch (s.cast) {
      case 'bolt': case 'fan': {
        const n = Math.max(1, count);
        const spread = s.cast === 'fan' ? Math.min(1.2, 0.16 * n) : n > 1 ? 0.18 * (n - 1) : 0;
        const ang0 = Math.atan2(a.y - oy, a.x - ox);
        const tgtForm = !a.target && this.formValid(this.lockForm) ? this.lockForm : null;
        for (let i = 0; i < n; i++) {
          const ang = ang0 + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0);
          const sp = s.speed ?? 700;
          const life = s.dur ?? (s.range / sp);
          this.projs.push({ ...base, x: ox, y: oy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0, max: life, dmg: dmg / (s.cast === 'fan' ? 1 : Math.sqrt(n) * 0.85), pierce: !!s.pierce || (s.id === 'qijin' && lv >= 2) || (s.id === 'bingzhui' && lv >= 1), homing: !!s.homing, hit: new Set(), r: s.radius ? radius : 22 + lv * 3, aoe: (s.id === 'huodan' && lv >= 2) || (s.id === 'huoqiufu' && lv >= 2) ? 70 : 0, size: 1 + lv * 0.18, trail: [], target: a.target, targetForm: tgtForm, tick: 0 });
        }
        break;
      }
      case 'nova': {
        const r = radius;
        this.vfx.push({ kind: 'ring', x: p.x, y: p.y, r, t: 0, dur: 0.6, color: s.color, fx: s.fx });
        if (s.fx === 'lightning') for (let i = 0; i < 6 + lv * 2; i++) { const an = Math.random() * TAU; this.vfx.push({ kind: 'chain', x: p.x, y: p.y - 40, x2: p.x + Math.cos(an) * r, y2: p.y + Math.sin(an) * r * 0.7, r: 0, t: 0, dur: 0.25, color: s.color, seed: Math.random() * 1e6 }); }
        this.aoe(p.x, p.y, r, dmg, base);
        if (s.id === 'zhangxin' && lv >= 2) this.strikes.push({ x: p.x, y: p.y, t: 0.35, dmg: dmg * 0.6, r: r * 0.9, status: s.status, stCh, school: s.school, fx: 'none', color: s.color, realm, lv });
        break;
      }
      case 'burst': {
        const d = Math.min(s.range, Math.hypot(a.x - p.x, a.y - p.y));
        const bx = p.x + a.dx * d, by = p.y + a.dy * d + 30;
        this.vfx.push({ kind: 'warn', x: bx, y: by, r: radius, t: 0, dur: 0.3, color: s.color });
        this.strikes.push({ x: bx, y: by, t: 0.3, dmg, r: radius, status: s.status, stCh, school: s.school, fx: s.fx, color: s.color, realm, lv, evil: s.vsEvil });
        break;
      }
      case 'strike': {
        const d = Math.min(s.range, Math.hypot(a.x - p.x, a.y - p.y));
        const bx = p.x + a.dx * d, by = p.y + a.dy * d + 30;
        const n = Math.max(1, count);
        const rainBonus = s.school === '雷' && (this.game.weather.kind === 'rain' || this.game.weather.kind === 'storm') ? 1.3 : 1;
        for (let i = 0; i < n; i++) {
          const jx = i === 0 ? 0 : rand(-radius, radius), jy = i === 0 ? 0 : rand(-radius, radius) * 0.6;
          this.vfx.push({ kind: 'warn', x: bx + jx, y: by + jy, r: radius, t: -i * 0.22, dur: 0.35 + i * 0.22, color: s.color });
          this.strikes.push({ x: bx + jx, y: by + jy, t: 0.35 + i * 0.22, dmg: dmg * rainBonus, r: radius, status: s.status, stCh, school: s.school, fx: s.fx, color: s.color, realm, lv, evil: s.vsEvil });
        }
        break;
      }
      case 'cone': {
        const ang = Math.atan2(a.dy, a.dx), spread = (s.radius ?? 0.5) * PROF_RAD[lv], range = s.range * PROF_RAD[lv];
        this.vfx.push({ kind: 'cone', x: p.x, y: p.y - 30, r: range, t: 0, dur: 0.4, color: s.color, fx: s.fx, ang, spread });
        for (const e of this.enemies) {
          if (e.dead) continue;
          const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
          if (d > range + 30) continue;
          let da = Math.atan2(dy, dx) - ang; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
          if (Math.abs(da) < spread + 0.15) this.hitEnemy(e, dmg, base, p.x, p.y);
        }
        this.game.sectwar?.damageFormationArea(p.x + a.dx * (range * 0.55), p.y + a.dy * (range * 0.55), range * 0.55, dmg, 'foe', realm, s.school);
        this.game.sectwar?.damageAirshipArea(p.x + a.dx * (range * 0.55), p.y + a.dy * (range * 0.55), range * 0.55, dmg, 'foe', realm);
        break;
      }
      case 'beam': {
        const range = s.range * (1 + lv * 0.08);
        const ex = p.x + a.dx * range, ey = p.y + a.dy * range;
        const w = radius || 30;
        this.vfx.push({ kind: s.fx === 'bigsword' ? 'bigsword' : 'beam', x: p.x, y: p.y - 40, x2: ex, y2: ey - 30, r: w, t: 0, dur: s.fx === 'bigsword' ? 0.7 : 0.45, color: s.color, fx: s.fx, seed: Math.random() * 1e6 });
        for (const e of this.enemies) {
          if (e.dead) continue;
          const t = clamp(((e.x - p.x) * a.dx + (e.y - p.y) * a.dy) / range, 0, 1);
          const cx = p.x + a.dx * range * t, cy = p.y + a.dy * range * t;
          if (Math.hypot(e.x - cx, e.y - cy) < w + 30) this.hitEnemy(e, dmg, base, p.x, p.y);
        }
        this.game.sectwar?.damageFormationArea(p.x + a.dx * (range * 0.5), p.y + a.dy * (range * 0.5), Math.max(w + 60, range * 0.4), dmg, 'foe', realm, s.school);
        this.game.sectwar?.damageAirshipArea(p.x + a.dx * (range * 0.5), p.y + a.dy * (range * 0.5), Math.max(w + 60, range * 0.4), dmg, 'foe', realm);
        if (s.id === 'xuelian') { const h = this.game.hero; h.hp = Math.min(1, h.hp + 0.04 + lv * 0.02); }
        break;
      }
      case 'chain': {
        let from = { x: p.x, y: p.y - 46 };
        const hit = new Set<number>();
        const hitForms = new Set<number>();
        let cur = a.target ?? this.nearest(p.x, p.y, s.range, hit);
        let jumps = Math.max(1, count);
        let k = 1;
        while (cur && jumps-- > 0) {
          hit.add(cur.id);
          this.vfx.push({ kind: 'chain', x: from.x, y: from.y, x2: cur.x, y2: cur.y - 30, r: 0, t: 0, dur: s.fx === 'goldthunder' ? 0.55 : 0.35, color: s.color, fx: s.fx, seed: Math.random() * 1e6, w: s.id === 'bixie' ? 5 + lv * 1.5 : 2 + lv });
          if (s.id === 'bixie') this.vfx.push({ kind: 'chain', x: from.x, y: from.y, x2: cur.x, y2: cur.y - 30, r: 0, t: 0, dur: 0.4, color: '255,250,220', fx: s.fx, seed: Math.random() * 1e6, w: 2 + lv });
          if (s.fx === 'goldthunder') this.impact(cur.x, cur.y, s.id === 'bixie' ? (k > 0.9 || lv >= 2 ? 3 : 2) : k > 0.9 ? 2 : 1, s.color);
          this.hitEnemy(cur, dmg * k, base, from.x, from.y);
          k *= 0.85;
          from = { x: cur.x, y: cur.y - 30 };
          cur = this.nearest(cur.x, cur.y, s.id === 'bixie' ? 560 : 380, hit);
        }
        const hitShips = new Set<number>();
        while (jumps-- > 0 && this.game.sectwar) {
          const nf = this.game.sectwar.nearestFoeFormation(from.x, from.y, s.range, hitForms);
          if (nf) {
            hitForms.add(nf.id);
            const pt = this.game.sectwar.formationClosestPoint(nf, from.x, from.y);
            this.vfx.push({ kind: 'chain', x: from.x, y: from.y, x2: pt.x, y2: pt.y - 30, r: 0, t: 0, dur: s.fx === 'goldthunder' ? 0.55 : 0.35, color: s.color, fx: s.fx, seed: Math.random() * 1e6, w: s.id === 'bixie' ? 5 + lv * 1.5 : 2 + lv });
            this.game.sectwar.damageFormationArea(pt.x, pt.y, 120, dmg * k, 'foe', realm, s.school, new Set());
            k *= 0.85;
            from = { x: pt.x, y: pt.y - 30 };
            continue;
          }
          const ns = this.game.sectwar.nearestFoeAirship(from.x, from.y, s.range + 160, hitShips);
          if (!ns) break;
          hitShips.add(ns.id);
          const sy = ns.y - ns.zLift * 0.72;
          this.vfx.push({ kind: 'chain', x: from.x, y: from.y, x2: ns.x, y2: sy, r: 0, t: 0, dur: s.fx === 'goldthunder' ? 0.55 : 0.35, color: s.color, fx: s.fx, seed: Math.random() * 1e6, w: s.id === 'bixie' ? 5 + lv * 1.5 : 2 + lv });
          this.game.sectwar.damageAirshipArea(ns.x, sy, 140, dmg * k, 'foe', realm, new Set());
          k *= 0.85;
          from = { x: ns.x, y: sy };
        }
        if (hit.size === 0 && hitForms.size === 0 && hitShips.size === 0) this.vfx.push({ kind: 'chain', x: from.x, y: from.y, x2: a.x, y2: a.y, r: 0, t: 0, dur: 0.3, color: s.color, seed: Math.random() * 1e6, w: 2 });
        break;
      }
      case 'field': {
        if (s.id === 'dageng') {
          // 第二十八步：大庚剑阵（三段式，见 dageng.ts）
          const d = Math.min(s.range, Math.hypot(a.x - p.x, a.y - p.y));
          const art = itemDef('art_qingzhu').art!, L = lookOf('art_qingzhu');
          this.acts.list.push(new DagengAct(this, { itemId: 'art_qingzhu', art, L, cc: [1, 0.86, 0.45], dmg, src: base, pieces: 52 + lv * 18, ax: a.x, ay: a.y, target: a.target }, p.x + a.dx * d, p.y + a.dy * d + 20, radius * 2.35, lv));   // 第三十步：剑阵放大约 1.5 倍
          break;
        }
        const self = s.id === 'juling';
        const d = self ? 0 : Math.min(s.range, Math.hypot(a.x - p.x, a.y - p.y));
        const fx = p.x + a.dx * d, fy = p.y + (self ? 0 : a.dy * d + 30);
        const dur = (s.dur ?? 4) * (lv >= 3 ? 1.35 : 1);
        this.fields.push({ x: fx, y: fy, r: radius, t: 0, dur, fx: s.fx, color: s.color, dmg: self ? 0 : dmg, tick: 0, status: s.status, stCh, school: s.school, heal: self, follow: s.id === 'lieyan' && lv >= 2, lv, realm, evil: s.vsEvil });
        break;
      }
      case 'orbit': {
        this.orbit = { t: s.dur ?? 8, n: Math.max(1, count), r: radius, dmg: dmg * 0.6, color: s.color, hitT: new Map(), lv };
        break;
      }
      case 'dash': {
        const g = this.game, k = g.input.keys;
        let mx = 0, my = 0;
        if (k.has('w') || k.has('arrowup')) my -= 1; if (k.has('s') || k.has('arrowdown')) my += 1;
        if (k.has('a') || k.has('arrowleft')) mx -= 1; if (k.has('d') || k.has('arrowright')) mx += 1;
        mx += g.input.joy.x; my += g.input.joy.y;
        const len = Math.hypot(mx, my);
        const dx = len > 0.1 ? mx / len : a.dx, dy = len > 0.1 ? my / len : a.dy;
        const dist = s.range * (1 + lv * 0.1), dur = 0.2;
        this.dash = { t: 0, dur, vx: dx * dist / dur, vy: dy * dist / dur, dmg: s.power > 0 ? dmg : 0, hit: new Set(), invuln: lv >= 2 || s.id === 'luoyan', color: s.color };
        if (s.id === 'luoyan' && lv >= 1) this.fields.push({ x: p.x, y: p.y, r: 120, t: 0, dur: 2, fx: 'none', color: '220,220,230', dmg: 0, tick: 0, stCh: 0, lv, realm });
        this.vfx.push({ kind: 'blinkfx', x: p.x, y: p.y, r: 50, t: 0, dur: 0.4, color: s.color });
        break;
      }
      case 'blink': {
        const g = this.game, T = g.terrain;
        const escape = s.id === 'xuedun' || s.id === 'tudun' || s.id === 'xueyingdun';
        if (escape) {
          // 遁走类：朝移动方向；站定时背离追兵/最近的敌人；都没有则朝面向——绝不朝敌人身上撞
          const sv = Math.hypot(p.st.vx, p.st.vy);
          let ex = 0, ey = 0;
          if (sv > 20) { ex = p.st.vx / sv; ey = p.st.vy / sv; }
          else {
            let th: { x: number; y: number } | null = g.pursuit?.cur?.e ?? null, bd = 1e9;
            if (!th) for (const e of this.enemies) { if (e.dead || !isFinite(e.x + e.y)) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; th = e; } }
            if (th) { const d = Math.hypot(p.x - th.x, p.y - th.y) || 1; ex = (p.x - th.x) / d; ey = (p.y - th.y) / d; }
            else { ex = Math.sin(p.st.yaw); ey = Math.cos(p.st.yaw); }
          }
          if (!isFinite(ex + ey) || Math.hypot(ex, ey) < 0.5) { const yw = isFinite(p.st.yaw) ? p.st.yaw : 0; ex = Math.sin(yw); ey = Math.cos(yw); }
          a.dx = ex; a.dy = ey;
        }
        const dist = Math.min(s.range * (1 + lv * 0.1), escape ? s.range * (1 + lv * 0.1) : Math.hypot(a.x - p.x, a.y - p.y) + 40);
        let tx = p.x + a.dx * dist, ty = p.y + a.dy * dist;
        // 找可落脚点：先左右偏转，再逐步缩短（遁走类最少也遁出四成）
        const okAt = (x: number, y: number) => g.mijing?.active ? g.mijing.walk(x, y) : g.isFlying || T.walkFactor(x, y) > 0;
        if (!okAt(tx, ty)) {
          let found = false;
          for (let k = 1; k <= 10 && !found; k++) {
            const sh = 1 - k * (escape ? 0.06 : 0.1);
            for (const da of escape ? [0, 0.35, -0.35, 0.7, -0.7] : [0]) {
              const c = Math.cos(da), sn = Math.sin(da), dx = a.dx * c - a.dy * sn, dy = a.dx * sn + a.dy * c;
              const x = p.x + dx * dist * sh, y = p.y + dy * dist * sh;
              if (okAt(x, y)) { tx = x; ty = y; found = true; break; }
            }
          }
          if (!found) { tx = p.x; ty = p.y; }
        }
        this.vfx.push({ kind: 'blinkfx', x: p.x, y: p.y, r: 60, t: 0, dur: 0.5, color: s.color });
        if ((s.fx === 'lightning' || s.fx === 'blood') && s.id !== 'xueyingdun') this.vfx.push({ kind: s.fx === 'blood' ? 'beam' : 'chain', x: p.x, y: p.y - 40, x2: tx, y2: ty - 40, r: 10, t: 0, dur: 0.3, color: s.color, fx: s.fx, seed: Math.random() * 1e6, w: 3 });
        const ox = p.x, oy = p.y;
        p.x = tx; p.y = ty; g.cam.x += (tx - g.cam.x) * 0.5; g.cam.y += (ty - g.cam.y) * 0.5;
        this.vfx.push({ kind: 'blinkfx', x: tx, y: ty, r: 70, t: 0, dur: 0.5, color: s.color });
        if (radius > 0 && s.power > 0) { this.vfx.push({ kind: 'ring', x: tx, y: ty, r: radius, t: 0, dur: 0.45, color: s.color, fx: s.fx }); this.aoe(tx, ty, radius, dmg, base); }
        if (s.id === 'tudun' || s.id === 'xuedun' || s.id === 'xueyingdun') { this.buffs.until.stealth = g.time + (s.id === 'tudun' ? 3 : s.id === 'xueyingdun' ? 4 : 2) + lv; for (const e of this.enemies) e.aggro = false; }
        if (s.id === 'xueyingdun' || s.id === 'xuedun' || s.id === 'xueying') { this.fxq.push({ k: 'xueying', x: ox, y: oy, x2: p.x, y2: p.y, big: s.id === 'xueyingdun' }); this.game.juice(0.04, 0.35); audio.sfx('boom'); }
        // 第二十八步：雷遁——一路雷光残影，两端雷爆；血遁——血色残影
        if (s.id === 'leidun') {
          this.addGhosts(ox, oy, p.x, p.y, 10, '170,200,255', 0.6);
          for (let i = 0; i < 3; i++) this.vfx.push({ kind: 'chain', x: ox, y: oy - 50, x2: p.x, y2: p.y - 50, r: 0, t: 0, dur: 0.35, color: '200,215,255', seed: Math.random() * 1e6, w: 2 + i * 2 });
          this.impact(p.x, p.y, 3, '170,200,255');
          if (lv >= 1) this.impact(ox, oy, 2, '170,200,255');
          audio.sfx('thunder');
        } else if (s.id === 'xueyingdun' || s.id === 'xuedun' || s.id === 'xueying') {
          this.addGhosts(ox, oy, p.x, p.y, s.id === 'xueying' ? 4 : s.id === 'xueyingdun' ? 10 : 6, '230,40,55', 0.55);
          if (s.id === 'xueyingdun') { this.impact(ox, oy, 3, '220,40,50'); this.impact(p.x, p.y, 2, '220,40,50'); }
        }
        this.invulnT = 0.3;
        break;
      }
      case 'buff': {
        const g = this.game, b = s.buff ?? {}, dur = (s.dur ?? 8) * (1 + lv * 0.15);
        const until = g.time + dur;
        if (b.atk) { this.buffs.until.atk = until; this.buffs.atk = b.atk * (1 + lv * 0.25); }
        if (b.def) { this.buffs.until.def = until; this.buffs.def = b.def * (1 + lv * 0.2); }
        if (b.speed) { this.buffs.until.speed = until; this.buffs.speed = b.speed * (1 + lv * 0.2); }
        if (b.regen) { this.buffs.until.regen = until; this.buffs.regen = b.regen * (1 + lv * 0.3); }
        if (b.stealth) { this.buffs.until.stealth = until; for (const e of this.enemies) e.aggro = false; }
        if (b.decoy) { this.decoy = { x: p.x + a.dx * 40, y: p.y + a.dy * 40, t: dur }; }
        this.vfx.push({ kind: 'aura', x: p.x, y: p.y, r: 90, t: 0, dur: 0.9, color: s.color, fx: s.fx });
        this.game.toast(`${s.name}！`);
        if (s.id === 'fengleichi') {
          // 第二十八步：青紫雷翼展开——振翅一扇，雷光震退四周之敌
          this.wing = { t: dur, max: dur, lv, flap: 0.6 };
          for (const e of this.enemies) {
            if (e.dead) continue;
            const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
            if (d > 460 + lv * 40) continue;   // 第三十步：振翅震退范围扩大
            this.hitEnemy(e, atk * (0.8 + lv * 0.3), { ...base, status: { k: 'shock', dur: 0.8, ch: 0.7 }, stCh: 0.7 }, p.x, p.y - 60);
            e.kx += dx / d * 900; e.ky += dy / d * 560;
          }
          this.impact(p.x, p.y, 2, '255,220,130');
          this.fxq.push({ k: 'dunflash', x: p.x, y: p.y, x2: p.x, y2: p.y, kind: 'thunder', color: '255,225,140' });
          audio.sfx('thunder');
        }
        break;
      }
      case 'shield': {
        const amt = this.pStats.hp * s.power * PROF_DMG[lv];
        this.shield = { amt, max: amt, t: (s.dur ?? 8) * (1 + lv * 0.15), reflect: s.buff?.reflect ?? 0.2, status: s.status, fx: s.fx, color: s.color };
        this.vfx.push({ kind: 'aura', x: p.x, y: p.y, r: 80, t: 0, dur: 0.6, color: s.color, fx: s.fx });
        break;
      }
      case 'heal': {
        this.heal = { t: s.dur ?? 3, rate: s.power * PROF_DMG[lv] / (s.dur ?? 3), mp: lv >= 2 ? 0.02 : 0 };
        this.vfx.push({ kind: 'aura', x: p.x, y: p.y, r: 80, t: 0, dur: 1.2, color: s.color, fx: 'leaf' });
        break;
      }
      case 'summon': {
        const sm = s.summon!;
        if (sm.kind === 'bugs') {
          // 第二十八步：虫群——数量随熟练度，成长阶段随熟练度（银 → 金斑 → 三色 → 纯金）
          const n = 130 + lv * 70;   // 第三十步：虫群更大
          if (this.swarm) this.swarm.mode = 'recall';
          this.swarm = new Swarm(this, { n, max: Math.min(640, n * 2), stage: Math.min(3, lv), life: (s.dur ?? 16) * (1 + lv * 0.1), dmg: dmg * (1 + lv * 0.3), src: base }, () => this.game.player);
          this.impact(p.x, p.y, 1, '255,215,90');
          break;
        }
        // 第三十步：心魔合体——五魔合一，体形更大、出手更狠
        const merge = sm.kind === 'demon' && lv >= 3;
        const n = (sm.kind as string) === 'bugs' ? 1 : merge ? 1 : sm.n + (lv >= 3 && sm.n === 1 ? 1 : 0);
        const slot0 = this.summons.length;
        for (let i = 0; i < n; i++) {
          const an = (i / n) * TAU + Math.random() * 0.6;
          this.summons.push({ cs: sm.kind === 'quhun' ? new CharState(p.x + Math.cos(an) * 60, p.y + Math.sin(an) * 40) : undefined, kind: sm.kind, x: p.x + Math.cos(an) * 60, y: p.y + Math.sin(an) * 40, t: (s.dur ?? 20) * (1 + lv * 0.1), dmg: dmg * (sm.kind === 'demon' ? 0.5 : 1), cd: 0, target: null, phase: 0, facing: 1, n: (sm.kind as string) === 'bugs' ? sm.n + lv * 4 : 1, evil: s.vsEvil, status: s.status, dots: (sm.kind as string) === 'bugs' ? Array.from({ length: sm.n + lv * 4 }, () => ({ a: Math.random() * TAU, r: rand(8, 40), s: rand(3, 7) })) : undefined, lv, age: 0, atk: 0, slot: slot0 + i, big: merge ? 1.7 : 1 });
          const S = this.summons[this.summons.length - 1]; S.maxT = S.t;
          if (merge) { S.dmg *= 5 * 0.9; S.t *= 1.1; S.maxT = S.t; this.texts.push({ x: S.x, y: S.y - 170, s: '五魔合一', color: '#ff7a70', t: 0, vy: -30, big: true }); }
        }
        this.vfx.push({ kind: 'aura', x: p.x, y: p.y, r: 100, t: 0, dur: 0.8, color: s.color });
        // 第三十步：啸魂长啸——震慑全场（三重）
        if (sm.kind === 'tihun' && lv >= 3) {
          const S = this.summons[this.summons.length - 1];
          for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - S.x, e.y - S.y) < 520) { this.applyStatus(e.st, { k: 'stun', dur: isBoss(e) ? 0.6 : 1.6, ch: 1 }, 0, e, S.x, S.y); if (e.def.evil) this.hitEnemy(e, dmg * 0.6, { realm: this.game.hero.realm, stCh: 0, school: '御', evil: s.vsEvil }, S.x, S.y); }
          this.fxq.push({ k: 'roar', x: S.x, y: S.y });
          this.game.juice(0.06, 0.4);
        }
        break;
      }
    }
  }

  /** 符箓：一次性消耗（对高境界衰减较少） */
  castTalisman(itemId: string) {
    const g = this.game, h = g.hero, d = itemDef(itemId), tal = d.tal;
    if (!tal) return;
    if (C.bagCount(h, itemId) <= 0) { g.toast(`储物袋中已无${d.name}。`, 'warn'); return; }
    if (!this.canAct) return;
    const key = 'tal:' + itemId;
    if (this.cdLeft(key) > 0) return;
    const p = g.player, ps = this.pStats;
    const color = hexToRgb(tal.color);
    const fake: ArtSkill = { id: key, name: d.name, school: '符', tier: 0, realm: 0, cast: 'bolt', fx: 'talisman', mp: 0, cd: 1, power: tal.power, range: this.reach, speed: Math.max(820, this.reach / 1.1), color, desc: '', evo: ['', '', ''] };
    // 符箓威力不随自身攻击过多放大：取“符力”为主
    const atk = Math.max(ps.atk, realmDef(Math.max(1, h.realm)).atk[0]) * 0.9;
    switch (tal.kind) {
      case 'fire': fake.cast = 'fan'; fake.fx = 'fireball'; fake.count = 3; fake.status = { k: 'burn', dur: 3, ch: 0.5 }; break;
      case 'ice': fake.cast = 'fan'; fake.fx = 'icicle'; fake.count = 3; fake.speed = 900; fake.status = { k: 'freeze', dur: 1.4, ch: 0.45 }; break;
      case 'thunder': fake.cast = 'strike'; fake.fx = 'lightning'; fake.radius = 120; fake.count = 1; fake.status = { k: 'shock', dur: 1, ch: 0.6 }; fake.vsEvil = 2; break;
      case 'fubao': fake.cast = 'beam'; fake.fx = 'bigsword'; fake.radius = 64; fake.status = { k: 'knock', dur: 0.4, ch: 1 }; fake.school = '剑'; break;
      case 'shield': fake.cast = 'shield'; fake.fx = 'gold'; fake.power = tal.power; fake.dur = 12; break;
      case 'bomb': {
        C.removeItem(h, itemId, 1); this.setCd(key, 1); this.castT = 0.45; this.castSeq++; this.combatT = 0;
        if (g.player.sitting) g.stand();
        const a = this.aim(this.reach); p.st.faceToward(a.dx, a.dy, false);
        const L = lookOf(itemId);
        this.acts.bomb({ itemId, art: { kind: 'slam', reqRealm: 0, sense: 0, pieces: 1, power: tal.power, mp: 0, cd: 1, color: tal.color }, L, cc: hexToRgb01(L.glow), dmg: atk * tal.power,
          src: { realm: h.realm, status: { k: 'shock', dur: 1.2, ch: 0.7 }, stCh: 0.7, school: '符', evil: 2, skill: key }, pieces: 1, ax: a.x, ay: a.y, target: a.target });
        audio.sfx('whoosh');
        return;
      }
      case 'escape': {
        C.removeItem(h, itemId, 1); this.setCd(key, 2);
        let fx = 0, fy = 0; for (const e of this.enemies) if (!e.dead && (e.aggro || e === g.pursuit?.cur?.e)) { fx += p.x - e.x; fy += p.y - e.y; }
        const L = Math.hypot(fx, fy) || 1; let tx = p.x + fx / L * 700, ty = p.y + fy / L * 500;
        for (let k = 0; k < 12 && g.terrain.walkFactor(tx, ty) <= 0; k++) { tx = (tx + p.x) / 2; ty = (ty + p.y) / 2; }
        this.vfx.push({ kind: 'blinkfx', x: p.x, y: p.y, r: 70, t: 0, dur: 0.6, color });
        p.x = tx; p.y = ty; this.vfx.push({ kind: 'blinkfx', x: tx, y: ty, r: 70, t: 0, dur: 0.6, color });
        this.buffs.until.stealth = g.time + 4; for (const e of this.enemies) e.aggro = false; this.invulnT = 0.5;
        g.toast(`${d.name}一闪，你已遁出数十丈。`); this.fxq.push({ k: 'dodge', x: tx, y: ty });
        return;
      }
      default: return;
    }
    C.removeItem(h, itemId, 1);
    this.setCd(key, tal.kind === 'fubao' ? 3 : 1);
    this.castT = 0.45; this.castSeq++; this.combatT = 0;
    if (g.player.sitting) g.stand();
    const a = this.aim(fake.range);
    p.st.faceToward(a.dx, a.dy, false);
    this.vfx.push({ kind: 'flash', x: p.x + a.dx * 30, y: p.y - 50, r: 40, t: 0, dur: 0.3, color, fx: 'hit' as Fx, seed: Math.random() * 6 });
    this.exec(fake, 0, a, atk, h.realm);
    audio.sfx(tal.kind === 'thunder' ? 'thunder' : 'whoosh');
    if (tal.kind === 'fubao') { g.trauma = Math.min(1, g.trauma + 0.35); const left = C.bagCount(h, itemId); g.toast(left > 0 ? `符宝金芒斩落！符纸上的灵光又黯淡了几分（余 ${left} 次）。` : '符宝金芒斩落——符纸化作飞灰，灵力耗尽了。', left > 0 ? 'info' : 'warn'); }
  }

  /** 法宝 / 法器出手 */
  castArtifact(itemId: string) {
    const g = this.game, h = g.hero, d = itemDef(itemId), art = d.art;
    if (!art) return;
    if (C.bagCount(h, itemId) <= 0) { g.toast(`储物袋中已无${d.name}。`, 'warn'); return; }
    if (!this.canAct) return;
    if (art.kind === 'armor' || art.kind === 'shield' || art.kind === 'flight' || art.kind === 'wings' || art.kind === 'boots') {
      const slot = art.kind === 'armor' ? 'armor' : art.kind === 'shield' ? 'shield' : art.kind === 'boots' ? 'boots' : 'flight';
      const unequipping = (h.equip as any)[slot] === itemId;
      if (!unequipping && (art.kind === 'flight' || art.kind === 'wings') && h.realm < art.reqRealm) {
        g.toast(`${d.name}需${REALMS[art.reqRealm]?.name ?? '高阶'}期方可御使。`, 'warn');
        return;
      }
      if (unequipping && slot === 'flight' && g.player.flying && !g.canFlyNative) {
        if (g.terrain.walkFactor(g.player.x, g.player.y) <= 0) {
          g.toast('身下是大海，不可收起飞舟！', 'warn');
          return;
        }
        (h.equip as any)[slot] = undefined;
        g.stopAutoFlight?.();
        g.player.flying = false;
        g.toast(`收起${d.name}，落地步行。`);
        this.fxq.push({ k: 'cast', x: g.player.x, y: g.player.y - 30 - (g.player.st.lift || 0), color: lookOf(itemId).glow, power: 0.6 });
        audio.sfx('land');
        g.updateUI?.();
        return;
      }
      (h.equip as any)[slot] = unequipping ? undefined : itemId;
      g.toast((h.equip as any)[slot] ? `祭出${d.name}护身。` : `收起${d.name}。`);
      if (art.kind === 'shield' && (h.equip as any)[slot] && this.shieldCd <= 0) { const amt = this.pStats.hp * (art.absorb ?? 0.5); this.shield = { amt, max: amt, t: 9999, reflect: 0, fx: 'gold', color: lookOf(itemId).glow, art: itemId }; }
      if (art.kind === 'shield' && !(h.equip as any)[slot] && this.shield?.art === itemId) this.shield = null;
      this.fxq.push({ k: 'cast', x: g.player.x, y: g.player.y - 30 - (g.player.st.lift || 0), color: lookOf(itemId).glow, power: 0.6 });
      audio.sfx((h.equip as any)[slot] ? 'chime' : 'land');
      g.updateUI?.();
      return;
    }
    const key = 'art:' + itemId;
    if (this.cdLeft(key) > 0) return;
    const ps = this.pStats;
    const swk = art.kind === 'sword' || art.kind === 'needle';
    // 第三十六步：御器耗神——飞剑 / 飞针按法力比例耗费，件数越多越吃力
    const cost = Math.max(art.mp / Math.max(1, ps.mp), swk ? 0.03 + 0.008 * Math.sqrt(Math.max(1, art.pieces)) : 0.025);
    if (h.mp < cost) { g.toast('法力不足，驱使不动法器。', 'warn'); return; }
    if (art.hpCost) h.hp -= art.hpCost;
    h.mp -= cost;
    const weak = h.realm < art.reqRealm ? (h.realm < art.reqRealm - 1 ? 0.25 : 0.5) : 1;
    this.setCd(key, swk ? Math.max(1.6, art.cd * 1.5) : art.cd);
    this.castT = 0.45; this.castSeq++; this.combatT = 0;
    if (g.player.sitting) g.stand();
    const color = hexToRgb(art.color);
    const sch: School | undefined = art.element === 'fire' ? '火' : art.element === 'ice' ? '冰' : art.element === 'thunder' ? '雷' : art.element === 'wood' ? '木' : art.element === 'earth' ? '土' : art.element === 'blood' ? '魔' : '剑';
    const status: StatusSpec | undefined = art.element === 'fire' ? { k: 'burn', dur: 3, ch: 0.4 } : art.element === 'ice' ? { k: 'freeze', dur: 1.5, ch: 0.3 } : art.element === 'thunder' ? { k: 'shock', dur: 0.8, ch: 0.4 } : art.element === 'earth' ? { k: 'stun', dur: 0.8, ch: 0.4 } : undefined;
    const owned = itemId === 'art_qingzhu' ? (h.qzN ?? 12) : art.pieces;   // 第四十步：碧竹飞云剑按炼成的口数
    const pieces = Math.max(1, Math.min(owned, 1 + Math.floor(ps.sense / Math.max(1, art.sense * 2.5))));
    const fake: ArtSkill = {
      id: key, name: d.name, school: sch ?? '剑', tier: 0, realm: 0, cast: 'bolt', fx: 'sword', mp: 0, cd: art.cd, power: art.power * 1.3 * weak, range: this.reach, speed: Math.max(950, this.reach / 1.1), pierce: art.kind === 'sword', status, color, desc: '', evo: ['', '', ''], vsEvil: art.element === 'thunder' ? 2 : undefined,
    };
    switch (art.kind) {
      case 'sword': fake.count = pieces; fake.cast = pieces > 1 ? 'fan' : 'bolt'; fake.homing = pieces > 1; if (pieces > 1) fake.power /= Math.sqrt(pieces) * 0.8; break;
      case 'needle': fake.fx = 'needle'; fake.cast = 'fan'; fake.count = pieces; fake.speed = 1200; fake.homing = true; break;
      case 'ring': fake.fx = art.element === 'fire' ? 'fireball' : 'gold'; fake.pierce = true; fake.speed = 600; fake.radius = 40; break;
      case 'mirror': fake.cast = 'beam'; fake.fx = 'magnet'; fake.radius = 26; break;
      case 'slam': fake.cast = 'burst'; fake.fx = 'rock'; fake.radius = 120; break;
      case 'arrow': fake.fx = art.element === 'thunder' ? 'goldthunder' : 'needle'; fake.speed = 1300; fake.pierce = true; break;
      case 'bell': fake.cast = 'nova'; fake.fx = 'roar'; fake.radius = 200; fake.status = { k: 'stun', dur: 1, ch: 0.6 }; break;
      case 'bind': fake.fx = 'vine'; fake.status = { k: 'root', dur: 2.5, ch: 1 }; break;
      case 'flame': fake.cast = 'cone'; fake.fx = 'flame'; fake.radius = 0.6; fake.range = 300; break;
      case 'banner': fake.cast = 'summon'; fake.summon = { kind: 'jiao' as any, n: 1 }; fake.dur = 15; break;
      case 'cauldron': fake.cast = 'burst'; fake.fx = 'gold'; fake.radius = 180; break;
    }
    const a = this.aim(fake.range);
    g.player.st.faceToward(a.dx, a.dy, false);
    // 第十三步：法器以实体出手
    const L = lookOf(itemId);
    const handled = this.acts.spawn({
      itemId, art, L, cc: hexToRgb01(L.glow), dmg: ps.atk * art.power * (swk ? 0.85 : 1.3) * weak,
      src: { realm: h.realm, status, stCh: status?.ch ?? 0, school: sch, evil: fake.vsEvil, skill: key },
      pieces: art.kind === 'needle' || art.kind === 'sword' ? pieces : 1, ax: a.x, ay: a.y, target: a.target,
    }, fake.dur ?? 15);
    if (handled) { if (art.kind !== 'flame') this.fxq.push({ k: 'cast', x: g.player.x, y: g.player.y - 30 - (g.player.st.lift || 0), color: L.glow, power: 0.5 }); return; }
    this.exec(fake, 0, a, ps.atk, h.realm);
    audio.sfx('whoosh');
  }

  // ------------------------------------------------------------ 伤害
  private nearest(x: number, y: number, r: number, skip: Set<number>) {
    let best: Enemy | null = null, bd = r;
    for (const e of this.enemies) { if (!this.targetable(e) || skip.has(e.id)) continue; const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; best = e; } }
    return best;
  }
  private aoe(x: number, y: number, r: number, dmg: number, base: { realm: number; status?: StatusSpec; stCh: number; school?: School; evil?: number; skill?: string }) {
    for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - x, (e.y - y) * 1.3) < r + 20) this.hitEnemy(e, dmg, base, x, y);
    this.game.sectwar?.damageFormationArea(x, y, r, dmg, 'foe', base.realm, base.school);
    this.game.sectwar?.damageAirshipArea(x, y, r, dmg, 'foe', base.realm);
    this.game.sectwar?.onPlayerAggressiveAtFront?.(x, y);
  }

    /** 玩家方命中敌人：含连携判定 */
  /** 受击特效高度：贴图妖兽按画面高度取身躯中段 */
  hitY(e: Enemy) {
    if (e.def.kind === 'human') return 62;
    const top = beastSpriteTop('e:' + e.def.id, !!e.anim.flying);
    if (!top) return e.anim.flying ? 75 : 36;
    const alt = e.anim.flying ? 70 : 0;
    return alt + Math.min(150, (top - alt) * 0.45);
  }
  hitEnemy(e: Enemy, raw: number, src: { realm: number; status?: StatusSpec; stCh: number; school?: School; evil?: number; skill?: string }, fx: number, fy: number) {
    if (e.dead || e.hideT > 0 || this.isShieldedFormUnit?.(e)) return;
    if (!Number.isFinite(raw) || raw < 0 || !Number.isFinite(e.hp) || !Number.isFinite(e.maxHp) || e.maxHp <= 0 || !Number.isFinite(e.dfn) || !Number.isSafeInteger(e.realm) || !Number.isSafeInteger(src.realm)) return;
    if (modx) {   // v0.57：模组可改伤害、取消；法术命中回调
      if (modx.has('damage')) { const c = modx.fire('damage', { to: 'enemy', enemyId: e.def.id, npcId: e.npcId ?? null, ref: e.id, amount: raw, skill: src.skill ?? null }); if (c.cancel) return; const n=hookNumber(c.amount);if(n===null)return;raw=Math.max(0,n); }
      if (!Number.isFinite(raw)) return;
      if (src.skill) modx.artHit(src.skill, e, raw);
    }
    // 第三十七步：被你的法术打着了——见势不妙的要逃也来不及了；同阶以上的修士会抢先一步瞬移避开
    if (src.skill) {
      if ((e.cowered || (e as any).departing || e.flee) && !e.provoked && !((e as any).returnCamp && e.ally)) {
        e.retreatT = 0; e.flee = false; (e as any).departing = false; (e as any).noP = false; e.aggro = true;
        this.texts.push({ x: e.x, y: e.y - 130, s: '欺人太甚！', color: '#ffb090', source: e, t: 0, vy: -26 });
      }
      if (!((e as any).returnCamp && e.ally)) e.provoked = true;
      if (this.mind.evade(e, fx, fy, raw)) return;
    }
    // v0.54：你对不冲你来的人动了手——他和他的同伴都翻脸；观战时偷袭敌将则破约开战
    this.game.sectwar?.onPlayerMeddleDuel?.(e);
    this.game.sectwar?.onPlayerAggressiveAtFront?.(e.x, e.y);
    if ((e as any).warStandoff) (e as any).warStandoff = false;
    if ((e as any).noP) { for (const o of this.enemies) if (o === e || (e.team && o.team === e.team)) { (o as any).noP = false; o.aggro = true; } this.texts.push({ x: e.x, y: e.y - 130, s: '找死！', color: '#ffb090', source: e, t: 0, vy: -26 }); }
    let d = raw * (e.guardT > 0 ? 0.35 : 1) * (this.game.zhenfa?.vuln(e) ?? 1);
    // 第三十六步：飞剑不再无往不利——同阶修士以法器格开、甲壳妖兽剑气难入、飞禽闪避
    const sw = swordSrc(src.skill);
    if (sw) {
      const gapS = e.realm - src.realm;
      if (e.def.flying && Math.random() < 0.22) { if (Math.random() < 0.5) this.texts.push({ x: e.x, y: e.y - 110, s: '闪开', color: '#d8e8f0', source: e, t: 0, vy: -40 }); e.aggro = true; return; }
      if (e.def.kind === 'human' && gapS >= -1) {
        const pc = gapS < 0 ? 0.12 : Math.min(0.7, 0.34 + 0.07 * gapS + (e.boss ? 0.15 : 0) + (e.ward ? 0.08 : 0) + (e.affix ? 0.06 : 0));
        if (Math.random() < pc) {
          d *= e.realm <= 2 ? 0.3 : 0.15; e.aggro = true;   // v0.64：炼气、筑基的法器格不干净
          this.fxq.push({ k: 'block', x: e.x + (fx - e.x) * 0.25, y: e.y - 60, color: '220,230,255' });
          if (Math.random() < 0.6) this.texts.push({ x: e.x, y: e.y - 110, s: '法器格开', color: '#cfd8ff', source: e, t: 0, vy: -40 });
          audio.sfx('clang');
        }
      }
      if (ARMORED.has(e.def.id)) { d *= 0.4; if (Math.random() < 0.25) this.texts.push({ x: e.x, y: e.y - 110, s: '剑气难入', color: '#d8c8a0', source: e, t: 0, vy: -36 }); }
    } else if (src.school && src.school !== '剑') {
      // 五行生克：法术打在克制的妖物身上更痛
      const el = foeElem(e), k = elemK(src.school, el);
      if (k !== 1) { d *= k; if (k > 1 && Math.random() < 0.3) this.texts.push({ x: e.x, y: e.y - 130, s: '克制', color: '#ffd27a', source: e, t: 0, vy: -34 }); }
    }
    if (e.guardT > 0 && Math.random() < 0.3) this.texts.push({ x: e.x + rand(-14, 14), y: e.y - 100, s: '护体', color: '#f0d890', source: e, t: 0, vy: -36 });
    let combo = '';
    const st = e.st;
    if (st.freeze && src.school === '雷') { d *= 2.2; delete st.freeze; combo = '冰裂雷爆'; this.vfx.push({ kind: 'flash', x: e.x, y: e.y - 30, r: 120, t: 0, dur: 0.4, color: '200,230,255' }); this.burstShards(e.x, e.y - 30, '200,235,255'); }
    else if (st.root && src.school === '火') { combo = '藤燃燎原'; st.burn = { t: 5, dps: raw * 0.5 }; for (const o of this.enemies) if (o !== e && !o.dead && Math.hypot(o.x - e.x, o.y - e.y) < 160) o.st.burn = { t: 4, dps: raw * 0.3 }; this.vfx.push({ kind: 'ring', x: e.x, y: e.y, r: 160, t: 0, dur: 0.6, color: '255,120,40', fx: 'flame' }); }
    else if (st.burn && src.school === '风') { combo = '风助火势'; d *= 1.3; for (const o of this.enemies) if (o !== e && !o.dead && Math.hypot(o.x - e.x, o.y - e.y) < 180) o.st.burn = { t: 4, dps: st.burn.dps }; this.vfx.push({ kind: 'ring', x: e.x, y: e.y, r: 180, t: 0, dur: 0.6, color: '255,160,60', fx: 'flame' }); }
    else if (st.poison && src.school === '火') { combo = '毒焰爆'; d += st.poison.dps * st.poison.t * (st.poison.stacks ?? 1); delete st.poison; this.vfx.push({ kind: 'flash', x: e.x, y: e.y - 30, r: 100, t: 0, dur: 0.4, color: '160,220,60' }); }
    else if (st.shock && src.school === '冰') { combo = '寒雷相激'; d *= 1.5; }
    else if (st.freeze && !sw && src.school !== '冰') { d *= 1.6; delete st.freeze; combo = '碎冰'; this.burstShards(e.x, e.y - 30, '200,235,255'); }
    else if ((st.root || st.stun) && !sw && (src.school === '土' || src.school === '体' || src.school === '阵')) { d *= 1.35; combo = '定而后击'; }
    else if (st.shock && src.school === '雷' && !sw) { d *= 1.3; combo = '雷霆连击'; }
    // 破甲、麻痹易伤
    let def = e.dfn * (st.break ? 0.5 : 1);
    d = Math.max(d * 0.15, d - def * 0.8);
    if (st.shock) d *= 1.2;
    if (e.sleep) { d *= 2.5; combo = combo || '偷袭'; }
    const gap = e.realm - src.realm;
    d *= realmDealK(gap, src.school === '符', src.realm);
    if (src.evil && e.def.evil) d *= src.evil;
    const crit = Math.random() < 0.1;
    if (crit) d *= 1.6;
    if (!Number.isFinite(d) || d < 0 || !Number.isFinite(e.hp - d)) return;
    if (e.ward && (!Number.isFinite(e.ward.hp) || e.ward.hp < 0)) return;
    d = Math.max(1, Math.round(d));
    if (e.ward) {   // 第三十二步：护体灵光先吃伤害
      const left = absorbWard(this, e, d);
      if (left <= 0) { e.aggro = true; e.lastHitBy = this.game.time; e.sleep = false; e.busy = false; this.combatT = 0; e.anim.hit = 0.4; this.texts.push({ x: e.x + rand(-14, 14), y: e.y - 80, s: String(d), color: '#bcd8ff', source: e, t: 0, vy: -60 }); return; }
      d = Math.max(1, Math.round(left));
    }
    e.hp -= d; e.anim.hit = 1; e.aggro = true; e.lastHitBy = this.game.time; e.sleep = false; e.busy = false;
    this.combatT = 0;
    if (e.affix) affixOnHurt(this, e, d);
    // 打击感：白闪、击退、顿帧、震屏、粒子
    e.hitFlash = Math.max(e.hitFlash, 0.12);
    const kdx = e.x - fx, kdy = e.y - fy, kd = Math.hypot(kdx, kdy) || 1;
    const frac = d / e.maxHp;
    const kb = (gap > 0 ? 40 : 90 + Math.min(260, frac * 900)) * (e.def.hp >= 1.8 ? 0.35 : 1);
    e.kx += kdx / kd * kb; e.ky += kdy / kd * kb * 0.7;
    const power = Math.min(3, 0.6 + frac * 6 + (crit ? 0.8 : 0));
    this.fxq.push({ k: 'hit', x: e.x + rand(-8, 8), y: e.y - this.hitY(e), color: SCHOOL_COL[src.school as School] ?? '255,236,200', power, crit, dir: Math.atan2(kdy, kdx) });
    audio.dir.hit(e.x, e.y, src.school, power);
    // 打击震屏：按单次伤害占比缩放并设严格单次/连击上限；去掉命中顿帧，避免多段连击拖慢时间
    const singleShake = Math.min(0.16, 0.015 + Math.sqrt(Math.max(0, frac)) * 0.11 + (crit ? 0.04 : 0));
    const now = this.game.time;
    if (now - this.hitJuiceT >= 0.16) {
      this.hitJuiceT = now;
      this.game.juice(0, singleShake, 0.28);
    } else {
      this.game.juice(0, singleShake * 0.18, 0.28);
    }
    if (gap > 0 && Math.random() < 0.3) this.texts.push({ x: e.x, y: e.y - 140, s: '境界压制', color: '#c0a8ff', source: e, t: 0, vy: -30 });
    this.texts.push({ x: e.x + rand(-14, 14), y: e.y - 80, s: String(d), color: crit ? '#ffd040' : combo ? '#ff9a5a' : '#fff4e0', source: e, t: 0, big: crit || !!combo, vy: -70 });
    if (combo) this.texts.push({ x: e.x, y: e.y - 120, s: combo + '！', color: '#ffcf6a', source: e, t: 0, big: true, vy: -40 });
    // 异状
    if (src.status && Math.random() < src.stCh) this.applyStatus(e.st, src.status, d, e, fx, fy);
    if (e.spar && e.hp < e.maxHp * 0.15) { e.hp = e.maxHp * 0.15; e.dead = true; e.gone = true; e.deathT = 0.9; if (this.lock === e) this.lock = null; this.onSparEnd?.(e, true); return; }
    if (e.yieldAt && e.npcId && e.hp < e.maxHp * e.yieldAt && e.hp > -e.maxHp * 0.25 && this.onYield) { e.yieldAt = 0; e.hp = Math.max(1, e.maxHp * 0.06); e.cast = null; if (this.onYield(e)) return; }
    if (e.hp > 0) this.foe.phase(e);
    if (e.hp <= 0) this.kill(e);
  }
  /** 第四/五步：外部钩子 */
  onKill?: (e: Enemy) => void;
  onSparEnd?: (e: Enemy, playerWon: boolean) => void;
  /** 第二十九步：NPC 求饶（返回 true 表示已接管） */
  onYield?: (e: Enemy) => boolean;
  /** 求饶后被斩 */
  finish(e: Enemy) { if (!e.dead) { e.hp = 0; this.kill(e); } }
  /** v0.70/v0.80：元婴/元神/仙魂遁出——肉身照常倒下（储物袋、战功照常结算），元婴或元神带三成气血飞出 */
  yingEscape(e: Enemy) {
    const g = this.game;
    const soulName = e.realm >= 9 ? '仙魂' : e.realm >= 5 ? '元神' : '元婴';
    const def = { ...e.def, id: e.def.id + ':ying', drops: [], name: `${e.name}的${soulName}`, flying: true };
    const y = new Enemy(def, e.x, e.y - 30, e.realm, e.stage, e.sea);
    y.name = `${e.name}的${soulName}`; y.look = e.look; y.cs = new CharState(e.x, e.y - 30); y.school = e.school; y.team = e.team; y.aggro = true;
    y.maxHp = y.hp = Math.round(e.maxHp * 0.3); y.atk = e.atk * 0.85; y.dfn = e.dfn * 0.5; y.speed = e.speed * 2.2; y.anim.flying = true;
    (y as any).ying = { escape: true }; (y as any).yingEsc = true; (y as any).npcId = undefined;
    // 元婴只剩几门最拿手的法术（不再出窍、不再化形、不会服丹护体）
    y.kit = (e.kit ?? []).filter((s) => !['ying', 'heal', 'guard', 'summon'].includes(s.k) && !s.hx).slice(0, 5);
    this.enemies.push(y);
    // 六成亡命而逃，四成恼羞成怒拼死一搏
    if (Math.random() < 0.6) { y.fled = true; y.retreatT = 99; (y as any).dunK = 3; (y as any).fleeBlink = 0.3; y.dun = 1; }
    this.texts.push({ x: e.x, y: e.y - 160, s: y.fled ? `${soulName}遁出！` : `${soulName}出体，同你拼了！`, color: '#ffd890', source: e, t: 0, vy: -24, big: true });
    this.impact(e.x, e.y - 30, 2, '255,215,140');
    this.vfx.push({ kind: 'ring', x: e.x, y: e.y, r: 220, t: 0, dur: 0.8, color: '255,215,140' } as any);
    if (Math.hypot(e.x - g.player.x, e.y - g.player.y) < 2000) { const who = preciseActorVisible(g, e, true) ? e.name : '一名修士'; g.toast(`${who}肉身被毁，${soulName}破体而出${y.fled ? '，化作一道遁光逃走！' : '，拼死扑来！'}`, 'warn'); }
    audio.sfx('bell');
  }
  /** 求饶后被放走：不算击杀，原地化光遁走 */
  release(e: Enemy) { e.dead = true; e.gone = true; e.spar = true; e.deathT = 0.9; e.aggro = false; if (this.lock === e) this.lock = null; }
  /** 同伴 / 红颜出手：对敌人造成伤害（带简单特效） */
  allyStrike(fromX: number, fromY: number, e: Enemy, dmg: number, color: string, realm: number) {
    if (e.dead) return;
    this.vfx.push({ kind: 'beam', x: fromX, y: fromY - 40, x2: e.x, y2: e.y - 30, r: 6, t: 0, dur: 0.35, color, seed: Math.random() * 1e6 });
    this.hitEnemy(e, dmg, { realm, stCh: 0 }, fromX, fromY);
  }

  applyStatus(st: Statuses, sp: StatusSpec, dmg: number, e: Enemy | null, fx: number, fy: number) {
    if (!Number.isFinite(sp.dur) || sp.dur < 0 || !Number.isFinite(dmg) || dmg < 0) return;
    const k = sp.k;
    if (k === 'knock') {
      if (e) { const dx = e.x - fx, dy = e.y - fy, d = Math.hypot(dx, dy) || 1; e.kx = dx / d * 520; e.ky = dy / d * 360; }
      return;
    }
    const cur = st[k];
    if (k === 'burn') st.burn = { t: Math.max(cur?.t ?? 0, sp.dur), dps: Math.max(cur?.dps ?? 0, dmg * 0.25) };
    else if (k === 'poison') st.poison = { t: sp.dur, dps: Math.max(cur?.dps ?? 0, dmg * 0.18), stacks: Math.min(3, (cur?.stacks ?? 0) + 1) };
    else st[k] = { t: Math.max(cur?.t ?? 0, sp.dur * (e && e.realm > this.game.hero.realm ? 0.5 : 1)), dps: 0 };
    if (e && (k === 'freeze' || k === 'stun' || k === 'shock' || k === 'root')) this.texts.push({ x: e.x, y: e.y - 100, s: STATUS_NAME[k], color: '#cfe8ff', source: e, t: 0, vy: -30 });
  }

  private burstShards(x: number, y: number, color: string) {
    for (let i = 0; i < 14; i++) { const a = Math.random() * TAU, v = rand(120, 320); this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, t: 0, max: rand(0.4, 0.8), size: rand(2, 5), color }); }
  }

  private kill(e: Enemy) {
    const g = this.game, h = g.hero;
    e.dead = true; e.deathT = 0;
    this.eco.markDead(e.ecoId, g.time);
    // v0.70：元婴修士肉身被毁，元婴破体而出——或亡命而逃、或拼死再战；斩了元婴才算真死
    if (e.def.kind === 'human' && e.realm >= 4 && !(e as any).yingEsc && !(e as any).shell && !e.minion && !e.spar && !e.ally && !(e as any).ying && !e.immortalRankId) this.yingEscape(e);
    h.kills = (h.kills ?? 0) + 1;
    audio.dir.kill(e);
    this.onKill?.(e);
    if (e.immortalRankId) {
      const rr = completeImmortalRankKill(h, g.ws, e.immortalRankId);
      if (rr.ok) {
        g.toast(rr.msg, 'good');
        g.news?.(`苏寒于仙界斩杀斩仙榜名犯「${e.name}」，震动玉皇仙庭！`, 'personal');
      }
    }
    if (this.lock === e) this.lock = null;
    if (e.affix) affixOnKill(this, e);
    // 斩杀魔修：血气未散，偶尔引来其同门长老
    if (e.def.kind === 'human' && e.def.evil && !e.boss && !e.spar && Math.random() < 0.07) g.pursuit?.schedule({ reason: `斩了${e.name}，血气未散，引来了其同门`, gap: e.realm >= h.realm ? 1 : 0, faction: Math.random() < 0.5 ? 'guiling' : 'tiansha' });
    // 修为
    const pl = h.realm * 13 + h.stage;
    const gapK = e.level >= pl ? 1 + (e.level - pl) * 0.25 : Math.max(0.1, 1 - (pl - e.level) * 0.15);
    // 第四十五步「天道」：斗法只得少许感悟（按自身境界折算，越阶斩杀略多），且从「感悟池」支取
    const want = C.need(h) * 0.0004 * Math.min(3, e.def.hp) * Math.max(0.15, Math.min(1.8, gapK)) * (e.boss || e.def.lair ? 5 : 1);
    const msgs: C.Msg[] = [];
    const e0 = h.exp, r0 = h.realm * 100 + h.stage;
    C.gainExp(h, want, msgs);
    const exp = h.realm * 100 + h.stage === r0 ? h.exp - e0 : want;
    if (exp >= 1) this.texts.push({ x: e.x, y: e.y - 60, s: `修为 +${Math.round(exp)}`, color: '#9fe8c0', source: e, t: 0, vy: -40 });
    // 掉落
    let drops: { id: string; n: number }[] = [];
    for (const dr of e.def.drops) if (Math.random() < dr.ch) drops.push({ id: dr.id, n: dr.n ? rint(dr.n[0], dr.n[1]) * (e.blv ? 1 : e.realm) : 1 });
    if (modx?.has('loot')) { const c = modx.fire('loot', { enemyId: e.def.id, npcId: e.npcId ?? null, drops }); drops = c.cancel ? [] : safeHookDrops(c.drops); }   // v0.57
    for (const d of drops) this.dropLoot(e.x, e.y, d.id, Math.min(9999, Math.round(d.n)));
    // 妖丹：人界一级至十级妖兽掉妖丹；灵仙界高阶大妖凝落灵晶或仙元石
    if (e.blv && e.blv <= 10 && Math.random() < [0, 0.35, 0.5, 0.65, 0.8, 1, 1, 1, 1, 1, 1][e.blv]) {
      this.dropLoot(e.x, e.y, 'mat_yaodan' + e.blv, e.def.lair ? 2 : 1);
      this.fxq.push({ k: 'kill', x: e.x, y: e.y - 60, color: YAODAN_COL[e.blv] });
    } else if (e.blv && e.blv > 10) {
      const curId = e.def.plane === 'immortal' || e.blv >= 17 ? 'mat_xianyuan' : 'mat_lingjing';
      this.dropLoot(e.x, e.y, curId, e.def.lair ? 8 : Math.max(1, Math.floor((e.blv - 9) / 2)));
      this.fxq.push({ k: 'kill', x: e.x, y: e.y - 60, color: e.blv >= 17 ? '255,245,160' : '160,235,255' });
    }
    // 逆返下界：高界修士在下界动武杀戮会引动天道排斥
    const cap = worldRealmCap(ACTIVE_WORLD);
    if (h.realm > cap.maxRealm) {
      const rej = addPlaneRejection(h, 6 + Math.max(0, h.realm - cap.maxRealm) * 3);
      if (rej.warning) g.toast(rej.warning, 'warn');
      if (rej.forcedReturn) (g as any).forceReturnHigherPlane?.();
    }
    if (e.lairId) {
      const f = g.ws.flags as any; (f.lairs ??= {})[e.lairId] = g.day;
      g.news?.(`苏寒斩杀${lvName(e.blv)}${e.def.title?.split('·')[0] ?? '妖王'}「${e.name}」！`, 'personal');
      g.toast(`斩杀${e.name}！妖王陨落，妖丹与遗骸归你所有。`, 'good');
      g.juice(0, 0.45, 0.55);
    }
    const dz = this.dangerCache.d;
    if (Math.random() < 0.05 + dz * 0.025 + (e.def.kind === 'human' ? 0.08 : 0)) {
      const capT = ACTIVE_WORLD === 'immortal' ? 6 : ACTIVE_WORLD === 'spirit' ? 5 : 4;
      const sk = this.randomScroll(Math.min(capT, Math.floor(dz / 1.5) + (e.realm >= 6 ? 2 : e.realm >= 2 ? 1 : 0)));
      if (sk) this.dropLoot(e.x, e.y, sk, 1);
    }
    this.burstShards(e.x, e.y - 30, e.def.evil ? '160,120,220' : '255,240,200');
    this.fxq.push({ k: 'kill', x: e.x, y: e.y - 40, color: e.def.evil ? '200,80,200' : '255,226,170' });
    this.game.juice(0, 0.14, 0.3);
  }

  randomScroll(maxTier: number): string | null {
    const h = this.game.hero;
    const pool = ART_LIST.filter((s) => s.tier <= maxTier && !h.arts.some((a) => a.id === s.id) && s.realm <= h.realm + 1 && !s.needs && !canonOwned('scroll_art_' + s.id));   // 第三十七步：原著独门秘术不会随手捡到
    if (!pool.length) return null;
    // 低阶更常见
    const w = pool.map((s) => Math.pow(0.45, s.tier));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return 'scroll_art_' + pool[i].id; }
    return 'scroll_art_' + pool[0].id;
  }

  dropLoot(x: number, y: number, id: string, n: number, preserve = false) {
    if(!Number.isFinite(x)||!Number.isFinite(y)||typeof id!=='string'||!id||!Number.isFinite(n)||n<=0||!Number.isSafeInteger(Math.round(n)))return;
    this.loot.push({ x: x + rand(-40, 40), y: y + rand(-20, 20), id, n: Math.max(1, Math.round(n)), t: 0, blocked: preserve || undefined });
  }

  /** 敌人命中玩家 */
  hitPlayer(raw: number, srcRealm: number, status: StatusSpec | undefined, fx: number, fy: number, srcEnemy?: Enemy) {
    const g = this.game, h = g.hero;
    if (!Number.isFinite(raw) || raw < 0 || !Number.isFinite(h.hp) || !Number.isSafeInteger(h.realm) || !Number.isSafeInteger(srcRealm) ||
        !Number.isFinite(fx) || !Number.isFinite(fy) || !Number.isFinite(g.player.x) || !Number.isFinite(g.player.y) ||
        !Number.isFinite(fx - g.player.x) || !Number.isFinite(fy - g.player.y)) return;
    if (modx?.has('damage') && !h.dead) { const c = modx.fire('damage', { to: 'player', enemyId: srcEnemy?.def.id ?? null, npcId: srcEnemy?.npcId ?? null, ref: srcEnemy?.id ?? null, amount: raw, skill: null }); const n=hookNumber(c.amount);if(c.cancel||n===null||n<=0)return;raw=n; }   // v0.57：改成 0 等于免伤
    if (h.dead || this.invulnT > 0 || (this.dash && this.dash.invuln)) { this.texts.push({ x: g.player.x, y: g.player.y - 110, s: '闪', color: '#cfe', t: 0, vy: -40 }); this.fxq.push({ k: 'dodge', x: g.player.x, y: g.player.y }); return; }
    const ps = this.pStats;
    if (!Number.isFinite(raw) || !Number.isFinite(ps.hp) || ps.hp <= 0 || !Number.isFinite(ps.def)) return;
    if (this.shield && (!Number.isFinite(this.shield.amt) || this.shield.amt < 0)) return;
    if (this.lingdun.hp.some(v => !Number.isFinite(v) || v < 0)) return;
    if (srcEnemy?.affix) raw = affixOutDmg(srcEnemy, raw);
    if (!Number.isFinite(raw) || raw < 0) return;
    let d = Math.max(raw * 0.15, raw - ps.def * 0.8);
    d *= realmTakeK(srcRealm - h.realm, h.realm);
    if (this.orbit) d *= 0.8;
    if (h.equip.armor) d *= 0.95;
    // v0.53：元婴之身难伤；玄武护阵 / 两仪微尘阵；玄武化形替你挨打
    d *= (g.yuanying?.takeMul() ?? 1) * (g.zhenfa?.takeMul(g.player.x, g.player.y) ?? 1);
    if (!Number.isFinite(d) || d < 0 || !Number.isFinite(h.hp - d / ps.hp)) return;
    const gui = guardGui(this);
    if (gui) d = gui.absorb(d / Math.max(1, ps.hp), srcEnemy) * ps.hp;
    if (!Number.isFinite(d) || d < 0 || !Number.isFinite(h.hp - d / ps.hp)) return;
    g.zhenfa?.reflect(g.player.x, g.player.y, d, srcEnemy);
    d = Math.max(1, Math.round(d));
    if (!Number.isFinite(h.hp - d / ps.hp)) return;
    // v0.63：灵力护盾最先挡（最外一层先耗，耗尽即碎）；全挡住则这一击连同附带的异常一并化解
    if (this.lingdun.layers) { d = this.lingdun.absorb(d, fx, fy); this.combatT = 0; if (d <= 0) { this.texts.push({ x: g.player.x, y: g.player.y - 110 - (g.player.st.lift || 0), s: '抵', color: '#bde', t: 0, vy: -40 }); return; } d = Math.max(1, Math.round(d)); }
    if (this.shield) {
      const ab = Math.min(this.shield.amt, d);
      if (this.shield.art) { this.blockT = 1; this.blockDir = Math.atan2(fy - g.player.y, fx - g.player.x); this.fxq.push({ k: 'block', x: g.player.x + Math.cos(this.blockDir) * 44, y: g.player.y - 56 + Math.sin(this.blockDir) * 18, color: this.shield.color }); audio.sfx('clang'); }
      this.shield.amt -= ab; d -= ab;
      if (srcEnemy && this.shield.reflect && Math.hypot(srcEnemy.x - g.player.x, srcEnemy.y - g.player.y) < 140) {
        this.hitEnemy(srcEnemy, ab * this.shield.reflect + 1, { realm: h.realm, status: this.shield.status, stCh: this.shield.status?.ch ?? 0, school: '冰' }, g.player.x, g.player.y);
      }
      if (this.shield.amt <= 0) {
        const sid = this.shield.art;
        this.vfx.push({ kind: 'flash', x: g.player.x, y: g.player.y - 50 - (g.player.st.lift || 0), r: 90, t: 0, dur: 0.35, color: this.shield.color }); this.shield = null;
        if (sid) { this.shieldCd = 15; this.fxq.push({ k: 'kill', x: g.player.x + Math.cos(this.blockDir) * 44, y: g.player.y - 56, color: '200,200,210' }); g.toast(`${itemDef(sid).name}被击得灵光尽失，倒飞而回——需调息十五息方能再挡。`, 'warn'); }
        else g.toast('护盾破碎！', 'warn');
      }
      if (d <= 0) { this.texts.push({ x: g.player.x, y: g.player.y - 110 - (g.player.st.lift || 0), s: '抵', color: '#bde', t: 0, vy: -40 }); return; }
    }
    if (srcEnemy?.spar && h.hp - d / ps.hp < 0.15) { h.hp = Math.max(h.hp, 0.15); srcEnemy.dead = true; srcEnemy.deathT = 0.9; if (this.lock === srcEnemy) this.lock = null; this.onSparEnd?.(srcEnemy, false); return; }
    if (srcEnemy && !srcEnemy.spar && g.renxin) g.renxin.lastAttacker = srcEnemy;
    h.hp -= d / ps.hp;
    if (srcEnemy?.affix) affixDealt(this, srcEnemy, d);
    this.hitT = 0.25; this.combatT = 0;
    const big = d > ps.hp * 0.15;
    this.texts.push({ x: g.player.x + rand(-10, 10), y: g.player.y - 110 - (g.player.st.lift || 0), s: '-' + d, color: '#ff6a5a', t: 0, vy: -60, big });
    this.fxq.push({ k: 'phit', x: g.player.x, y: g.player.y - 60 - (g.player.st.lift || 0), big });
    g.juice(big ? 0.07 : 0.025, big ? 0.45 : 0.2);
    g.hurtFlash = Math.max(g.hurtFlash, big ? 1 : 0.5);
    if (status && Math.random() < status.ch) {
      if (status.k === 'knock') { const dx = g.player.x - fx, dy = g.player.y - fy, dd = Math.hypot(dx, dy) || 1; g.player.x += dx / dd * 50; g.player.y += dy / dd * 30; }
      else {
        this.applyStatus(this.pst, status, d, null, fx, fy);
        // 第三十五步：连招——定住你的那一刻，出手者与身边同伙立刻抢攻
        if (srcEnemy && (status.k === 'stun' || status.k === 'root' || status.k === 'freeze')) {
          srcEnemy.skT = Math.min(srcEnemy.skT, 0.2);
          for (const o of this.enemies) if (o !== srcEnemy && !o.dead && o.aggro && Math.hypot(o.x - g.player.x, o.y - g.player.y) < 900) o.skT = Math.min(o.skT, 0.5);
        }
      }
    }
    if (h.hp <= 0) this.playerDown();
  }

  private playerDown() {
    const g = this.game, h = g.hero;
    // 替身符
    const revive = h.bag.find((b) => itemDef(b.id).tal?.kind === 'revive');
    if (revive) {
      const tal = itemDef(revive.id).tal!;
      C.removeItem(h, revive.id, 1);
      h.hp = tal.power; this.invulnT = 2;
      g.toast(`${itemDef(revive.id).name}化作飞灰，替你挡下一劫！`, 'good');
      this.vfx.push({ kind: 'aura', x: g.player.x, y: g.player.y, r: 140, t: 0, dur: 1.2, color: '255,200,120' });
      return;
    }
    // v0.70：元婴修士肉身被毁，元婴遁出再战；元婴再被打散才是真死
    if (h.realm >= 4 && !g.yingEsc && g.startYingEscape()) return;
    if (g.yingEsc) g.endYingEscape('dead');
    // v0.73：宗门大会战中友军尚存时，由同门抢回大营救治，免去无谓死档
    if (g.sectwar?.tryBattleRescue?.()) return;
    g.onPlayerDown(g.renxin?.lastAttacker ?? undefined);
  }

  // ------------------------------------------------------------ 危险度与刷怪
  dangerAt(x: number, y: number) {
    const c = this.dangerCache;
    if (Math.hypot(c.x - x, c.y - y) < 300) return c;
    return this.dangerCalc(x, y, c);
  }
  /** 任意一点的危险度（不动玩家处的缓存）。
   *  第三十一步：k = 妖气等级（0‥8），以新手之地（南荒：青霞谷；沧溟海：观星城）为心一圈圈向外加深；
   *  险地 / 秘境附近 +1‥2，城镇宗门与官道附近压低。d = 旧刻度（0‥6），供旧逻辑使用。 */
  dangerCalc(x: number, y: number, c: { x: number; y: number; d: number; k: number; zone: string; region: string } = { x: 0, y: 0, d: 0, k: 0, zone: '', region: '' }) {
    const T = this.game.terrain;
    const land = T.isLand(x, y);
    const mx = x / WORLD_SCALE, my = y / WORLD_SCALE;
    const reg = regionAt(mx, my, land);
    const rid = reg?.id ?? '';
    let k = 0;
    let humanSea = false;
    if (ACTIVE_MAP === 'lingjie') {
      if (my < 1020) {
        // 北境：无尽雷海与广寒碎域，以雷鸣仙港(2040, 615)为心向外渐深
        k = 9.4 + Math.min(3.0, Math.hypot(mx - 2040, my - 615) / 480);
      } else if (mx < 1520) {
        // 西境：蛮荒古境与魔渊西麓，以百族互市(645, 1770)为心，魔渊/极荒渐险
        k = 9.8 + Math.min(3.2, Math.hypot(mx - 645, my - 1770) / 440);
      } else {
        // 东境：风元大陆/天渊圣域，以天渊城(2670, 1680)为心，城郊多为元婴/化神妖兽，魔渊前线渐入炼虚
        k = 8.6 + Math.min(3.1, Math.hypot(mx - 2670, my - 1680) / 520);
      }
      if (!land) k = Math.max(k, 10.0);
    } else if (ACTIVE_MAP === 'xianjie') {
      if (mx < 880 && my < 820) {
        k = 17.8 + Math.min(1.4, Math.hypot(mx - 440, my - 430) / 360);
      } else if (mx >= 1700) {
        k = 19.4 + Math.min(1.6, Math.hypot(mx - 1920, my - 900) / 340);
      } else {
        k = 18.6 + Math.min(1.5, Math.hypot(mx - 1260, my - 960) / 340);
      }
    } else {
      const [ox, oy] = toLegacy(mx, my);
      if (ox >= 630 && oy >= 290) {
        humanSea = true;
        const a = LOC_BY_ID.get('tianxing');
        const r = a ? Math.hypot(mx - a.x, my - a.y) : 300;
        // 沧溟内海一–四级；沧溟外海四–七级；无边海、北海深处七级以上
        k = r < 210 ? 1 + (r / 210) * 3.6 : 4.6 + ((r - 210) / 170) * 3.6;
        if (rid === 'wubian_deep' || rid === 'beihai') k = Math.max(k, 9);
      } else if (oy < 262) {
        k = 5 + Math.max(0, (262 - oy) / 262) * 2.6;   // 中州：南境五级左右，越往北寒雪原越凶
      } else {
        const a = LOC_BY_ID.get('huangfeng');
        const r = a ? Math.hypot(mx - a.x, (my - a.y) * 1.15) : 400;
        const ADJ: Record<string, number> = { zhuimo: 1.2, modao: 0.6, jixi: 1, tianlan: 0.4, mulan: 0.4, jiuguo: 0.2, tiandao: 0.3 };
        k = Math.min(7.2, r / 125) + (ADJ[rid] ?? 0);
        if (!land) {
          const seaZ = endlessSeaZoneAt(x, y);
          if (seaZ.zone === 'coastal') k = Math.max(k, 2.8);
          else if (seaZ.zone === 'mid' || rid === 'wubian' || rid === 'jixi_waihai' || rid === 'nanming_hai') k = Math.max(k, 6.2 + Math.min(2.4, seaZ.distM / 280));
          else if (seaZ.zone === 'deep' || rid === 'wubian_deep') k = Math.max(k, 8.8);
        }
      }
    }
    const ring = k;
    let boost = 0, damp = 0;
    for (const l of LOCATIONS) {
      const dl = l.danger ?? 0;
      const dx = l.x * WORLD_SCALE - x, dy = l.y * WORLD_SCALE - y;
      if (Math.abs(dx) > 9000 || Math.abs(dy) > 9000) continue;
      const dist = Math.hypot(dx, dy);
      if (l.type === 'danger' || l.type === 'secret') { const fall = 2500 + dl * 900; if (dist < fall) boost = Math.max(boost, (0.5 + dl * 0.45) * (1 - dist / fall)); }
      if ((l.type === 'city' || l.type === 'sect' || l.type === 'town' || l.type === 'isle') && dist < 3000) damp = Math.max(damp, 1 - dist / 3000);
    }
    const pMeta = planeMeta(ACTIVE_WORLD);
    k += boost * clamp(0.45 + ring / 3, 0.45, 1) - damp * (ACTIVE_WORLD === 'human' ? 2.2 : ACTIVE_WORLD === 'spirit' ? 1.5 : 1.0);
    if (land && T.onRoad(x, y)) k -= 0.8;
    const maxK = ACTIVE_WORLD === 'human'
      ? ((humanSea || rid === 'wubian' || rid === 'wubian_deep' || rid === 'nanming_hai' || rid === 'jixi_waihai' || rid === 'luanxing_outer') ? pMeta.dangerK[1] : 8)
      : pMeta.dangerK[1];
    k = clamp(k, pMeta.dangerK[0], maxK);
    const s = T.sample(x, y);
    const zone = !land ? 'sea' : T.demonNear(x, y) ? 'demon' : s.cold > 0.6 ? 'cold' : s.arid > 0.6 ? 'arid' : (rid === 'tianlan' || rid === 'mulan') ? 'grass' : s.forest > 0.4 ? 'forest' : '';
    const dVal = ACTIVE_WORLD === 'human' ? k * 0.75 : ACTIVE_WORLD === 'spirit' ? clamp((k - pMeta.dangerK[0]) * 0.95, 0, 6) : clamp(k - 10, 0, 6);
    Object.assign(c, { x, y, d: dVal, k, zone, region: rid });
    return c;
  }

  /** 玩家自建宗门山门及护宗大阵领地内安全判定 */
  mySectAt(x: number, y: number): boolean {
    const ms = this.game.ws?.mySect;
    if (!ms || !isActiveWorldMap(ms.map)) return false;
    const mx = ms.x * WORLD_SCALE, my = ms.y * WORLD_SCALE;
    const scaleR = (ms.halls?.zhen ?? 0) >= 3 ? 1650 : 1350;
    return Math.hypot(x - mx, y - my) <= scaleR;
  }

  /** 宗门大战前线 / 双方大营 / 交锋战区安全带（严禁在战区凭空刷出无关劫修与野生妖兽） */
  warZoneAt(x: number, y: number): boolean {
    return !!this.game.sectwar?.isWarZoneAt?.(x, y);
  }

  safeAt(x: number, y: number) {
    if (this.mySectAt(x, y)) return true;
    const z = this.game.terrain.inLocZone(x, y, 300);
    if (!z) return false;
    const l = LOCATIONS.find((q) => q.id === z.id);
    return !!l && (l.type === 'city' || l.type === 'town' || l.type === 'sect' || l.type === 'isle');
  }

  visRect(): VisRect {
    const g = this.game;
    const vw = (typeof window !== 'undefined' && window.innerWidth) || 1280;
    const vh = (typeof window !== 'undefined' && window.innerHeight) || 800;
    const vz = Math.max(0.02, g.cam.zoom || 1);
    const hw = vw / vz * 0.5, hh = vh / vz * 0.5;
    const cx = Number.isFinite(g.cam.x) ? g.cam.x : g.player.x;
    const cy = Number.isFinite(g.cam.y) ? g.cam.y : g.player.y;
    return { left: cx - hw, right: cx + hw, top: cy - hh, bottom: cy + hh };
  }

  private wakeEcoBeast(b: EcoBeast): Enemy | null {
    if (this.safeAt(b.x, b.y) || this.warZoneAt(b.x, b.y)) return null;
    const def = ENEMIES[b.defId];
    if (!def) return null;
    const ne = new Enemy(def, b.x, b.y, b.realm, b.stage, b.sea);
    ne.hx = b.hx; ne.hy = b.hy;
    ne.maxHp = Math.max(1, Math.round(ne.maxHp * (b.maxHpMul || 1)));
    ne.hp = Math.max(1, Math.round(ne.maxHp * clamp(b.hpPct, 0.05, 1)));
    ne.atk *= b.atkMul || 1;
    ne.affix = b.affix;
    ne.aggro = b.aggro || this.tideT > 0;
    ne.ecoId = b.id;
    return ne;
  }

  private spawnTick() {
    const g = this.game, p = g.player, T = g.terrain;
    if (g.paused || g.hero.dead) return;
    if (g.story?.fight) return;
    if (this.safeAt(p.x, p.y) || this.warZoneAt(p.x, p.y)) return;
    const vis = this.visRect();
    const minWakeDist = Math.max(g.detailSenseRadius + 240, g.awarenessRadius + 60);
    const activeR = Math.max(2800, g.senseRadius * 1.2, g.awarenessRadius + 360, g.detailSenseRadius + 640);
    this.eco.updateActors(p, activeR, vis, g.time, this.enemies, (b) => this.wakeEcoBeast(b), minWakeDist);
    const dz = this.dangerAt(p.x, p.y);
    const inHumanSea = ACTIVE_WORLD === 'human' && !T.isLand(p.x, p.y);
    // 第三十一步：只数身边的野兽（追兵、护宝兽、妖王不占名额）；妖气越重、夜里，妖兽越多（人界无边海适当控密，免得贴脸堆满海兽）
    let alive = 0;
    for (const e of this.enemies) if (!e.dead && !e.boss && e.def.kind !== 'human' && Math.abs(e.x - p.x) < 2800 && Math.abs(e.y - p.y) < 2800) alive++;
    const night = g.night > 0.5;
    const rawCap = 3 + Math.round(dz.k * 0.8) + (night ? 2 : 0) + (this.tideT > 0 ? 6 : 0);
    const cap = inHumanSea ? Math.min(rawCap, 6 + (night ? 1 : 0) + (this.tideT > 0 ? 4 : 0)) : rawCap;
    if (alive >= cap) return;
    const spawnChance = inHumanSea
      ? Math.min(0.62, 0.34 + dz.k * 0.03) + (this.tideT > 0 ? 0.32 : 0)
      : 0.42 + dz.k * 0.06 + (this.tideT > 0 ? 0.4 : 0);
    if (Math.random() > spawnChance) return;
    const curPlane = planeEnemyTag(ACTIVE_WORLD);
    const enemyFitsPlane = (e: EnemyDef) => {
      const pPlane = e.plane ?? 'mortal';
      if (pPlane !== curPlane) return false;
      if (e.maps && !e.maps.includes(ACTIVE_MAP)) return false;
      return true;
    };
    const makeSeedAt = (sx: number, sy: number): { def: EnemyDef; realm: number; stage: number; sea: boolean; dz: ReturnType<Combat['dangerAt']> } | null => {
      const sea = !T.isLand(sx, sy);
      if (this.safeAt(sx, sy) || this.warZoneAt(sx, sy)) return null;
      const dLoc = this.dangerCalc(sx, sy);
      const zone = sea ? 'sea' : dLoc.zone === 'sea' ? '' : dLoc.zone;
      const rk = bandRealm(dLoc.k + (night ? 0.35 : 0), Math.random, ACTIVE_WORLD);
      const band = lvOf(rk.realm, rk.stage);
      const place = (e: EnemyDef) => enemyFitsPlane(e) && !e.lair && !e.lm && (!e.regions || e.regions.includes(dLoc.region)) && (ACTIVE_WORLD !== 'human' || (sea ? e.zone === 'sea' || e.flying : e.zone !== 'sea')) && (!e.zone || e.zone === zone);
      const cands = ENEMY_LIST.filter((e) => place(e) && (e.lv ? lvWeight(e, band, false) > 0 : e.minDanger <= dLoc.d + 0.4 && dLoc.d <= e.maxDanger + 0.5));
      if (!cands.length) return null;
      const w = cands.map((e) => (e.zone && e.zone === zone ? 3 : 1) * (e.kind === 'human' ? 0.6 : 1) * (e.lv ? lvWeight(e, band, false) : 1) * (e.behave === 'flee' ? (e.lv && e.lv[0] >= 4 ? 0.12 : 0.35) : e.behave === 'call' ? 0.5 : 1));
      let r = Math.random() * w.reduce((a, b) => a + b, 0), def = cands[0];
      for (let i = 0; i < cands.length; i++) { r -= w[i]; if (r <= 0) { def = cands[i]; break; } }
      if (!sea && ACTIVE_WORLD === 'human' && Math.random() < 0.8) { const nat = g.landmarks?.pick(sx, sy, band); if (nat) def = nat; }
      const rs = this.beastRS(def, rk);
      return { def, realm: rs.realm, stage: rs.stage, sea, dz: dLoc };
    };
    // 生成环：必须同时落在清晰内圈、神识外圈与屏幕视野之外（去掉纵轴 0.8 压扁，防止南北方向刷进内圈边缘）
    const R = g.senseRadius;
    const vw = vis.right - vis.left, vh = vis.bottom - vis.top;
    const visR = Math.max(vw, vh) * 0.5 * 1.414;      // 屏幕对角线一半（世界单位）
    const safeMinRing = Math.max(g.detailSenseRadius + 460, g.awarenessRadius + 160, R * 1.16);
    const dist = Math.max(safeMinRing, visR * 1.12 + 240) + rand(0, 320);
    if (dist > 7000) {
      this.eco.requestPopulate(ecoChunkOf(p.x, p.y), Math.min(2, cap - alive), vis, WORLD_W, WORLD_H, (sx, sy): EcoSeedSpec | null => {
        const picked = makeSeedAt(sx, sy);
        if (!picked) return null;
        if (ACTIVE_WORLD === 'human' && !picked.def.flying && !picked.sea && T.walkFactor(sx, sy) <= 0) return null;
        const st = picked.realm === 1 ? clamp(picked.stage + rint(-1, 1), 0, REALMS[1].hp.length - 1) : picked.def.lv ? picked.stage : clamp(picked.stage + rint(-1, 1), 0, REALMS[picked.realm].hp.length - 1);
        return {
          defId: picked.def.id, x: sx, y: sy, realm: picked.realm, stage: st, sea: picked.sea,
          maxHpMul: 1 + Math.min(8, picked.dz.k) * 0.07, atkMul: 1 + Math.min(8, picked.dz.k) * 0.05,
        };
      }, p, Math.max(g.detailSenseRadius + 420, g.awarenessRadius + 120));
      return;
    }
    const hardMinR = Math.max(g.detailSenseRadius + 320, g.awarenessRadius + 60);
    for (let tries = 0; tries < 6; tries++) {
      const an = Math.random() * TAU;
      const x = p.x + Math.cos(an) * dist, y = p.y + Math.sin(an) * dist;
      if (!isOutsideVisRect(x, y, vis, 200)) continue;
      const sea = !T.isLand(x, y);
      if (this.safeAt(x, y) || this.warZoneAt(x, y)) continue;
      const zone = sea ? 'sea' : dz.zone === 'sea' ? '' : dz.zone;
      const rk = bandRealm(dz.k + (night ? 0.35 : 0), Math.random, ACTIVE_WORLD);
      const band = lvOf(rk.realm, rk.stage);
      const up = false;   // 越阶（高一级）已由 bandRealm 按妖气掷出，这里不再叠加
      const place = (e: EnemyDef) => enemyFitsPlane(e) && !e.lair && !e.lm && (!e.regions || e.regions.includes(dz.region)) && (ACTIVE_WORLD !== 'human' || (sea ? e.zone === 'sea' || e.flying : e.zone !== 'sea')) && (!e.zone || e.zone === zone);
      const cands = ENEMY_LIST.filter((e) => place(e) && (e.lv ? lvWeight(e, band, up) > 0 : e.minDanger <= dz.d + 0.4 && dz.d <= e.maxDanger + 0.5));
      if (!cands.length) continue;
      // 珍稀妖兽（见人即逃 / 擅隐匿）出现得少；路上劫修/野外散修也压低比重，免得满路劫修
      const w = cands.map((e) => (e.zone && e.zone === zone ? 3 : 1) * (e.kind === 'human' ? 0.22 : 1) * (e.lv ? lvWeight(e, band, up) : 1) * (e.behave === 'flee' ? (e.lv && e.lv[0] >= 4 ? 0.12 : 0.35) : e.behave === 'call' ? 0.5 : 1));
      let r = Math.random() * w.reduce((a, b) => a + b, 0), def = cands[0];
      for (let i = 0; i < cands.length; i++) { r -= w[i]; if (r <= 0) { def = cands[i]; break; } }
      // 第十九步：原著名地里多半是本地特有的妖物
      if (!sea && ACTIVE_WORLD === 'human' && Math.random() < 0.8) { const nat = g.landmarks?.pick(x, y, band); if (nat) def = nat; }
      const n = def.pack ? rint(def.pack[0], def.pack[1]) : 1;
      let hLead: number | undefined;
      let spawnedAny = false;
      for (let i = 0; i < n; i++) {
        const ex = x + rand(-90, 90), ey = y + rand(-60, 60);
        if (!isOutsideVisRect(ex, ey, vis, 160)) continue;
        if (Math.hypot(ex - p.x, ey - p.y) < hardMinR) continue;
        if (this.safeAt(ex, ey) || this.warZoneAt(ex, ey)) continue;
        if (ACTIVE_WORLD === 'human' && !def.flying && !sea && T.walkFactor(ex, ey) <= 0) continue;
        // 第三十七步：野外修士的境界按当地人口金字塔（与主角境界无关）：依所在界域区间生成
        let rs = this.beastRS(def, rk), d2 = def, st: number;
        if (def.kind === 'human') {
          const [rLo, rHi] = planeEncounterRange(ACTIVE_WORLD);
          const capHi = ACTIVE_WORLD === 'human' ? 3 : rHi;
          rs = foeRealm(g, ex, ey, i === 0 && n > 1 ? 'leader' : def.evil ? 'evil' : 'rogue', Math.random, rLo, hLead ?? capHi);
          if (i === 0) hLead = rs.realm;
          if (ACTIVE_WORLD === 'human') {
            d2 = rs.realm >= 3 ? ENEMIES.jindan_mo ?? def : rs.realm >= 2 && def.id === 'bandit' ? ENEMIES.zhujixiu ?? def : rs.realm < 2 && def.id === 'zhujixiu' ? ENEMIES.bandit ?? def : def;
          } else {
            d2 = def.evil ? (ENEMIES[planeDefaultEnemyId(ACTIVE_WORLD, 'evil')] ?? def) : (ENEMIES[planeDefaultEnemyId(ACTIVE_WORLD, 'rogue')] ?? def);
          }
          st = rs.stage;
        } else st = rs.realm === 1 ? clamp(rs.stage + rint(-1, 1), 0, REALMS[1].hp.length - 1) : def.lv ? rs.stage : clamp(rs.stage + rint(-1, 1), 0, REALMS[rs.realm].hp.length - 1);
        const ne = new Enemy(d2, ex, ey, rs.realm, st, sea);
        // 第三十五步：离新手村越远越凶（血 +7%/档、攻 +5%/档），并有机会成为精英
        const hpMul = 1 + Math.min(8, dz.k) * 0.07, atkMul = 1 + Math.min(8, dz.k) * 0.05;
        ne.maxHp = ne.hp = Math.round(ne.maxHp * hpMul); ne.atk *= atkMul;
        rollAffix(ne, Math.min(8, dz.k));
        if (this.tideT > 0) ne.aggro = true;   // 兽潮里的妖兽直扑而来
        this.eco.registerActive(ne, hpMul, atkMul);
        this.enemies.push(ne);
        spawnedAny = true;
      }
      if (spawnedAny) return;
    }
  }

  /** 第三十一步：妖气档提示 + 夜间兽潮 */
  private wildTick(dt: number) {
    const g = this.game, p = g.player, h = g.hero;
    if (g.paused || h.dead) return;
    if (ACTIVE_WORLD !== 'human') return;
    const dz = this.dangerAt(p.x, p.y);
    const tierOf = (k: number) => (k < 1.5 ? 0 : k < 2.6 ? 1 : k < 3.6 ? 2 : k < 4.6 ? 3 : k < 5.6 ? 4 : k < 6.6 ? 5 : k < 7.6 ? 6 : k < 8.6 ? 7 : 8);
    const TXT = ['一级下中阶', '一级上阶', '一至三级', '二至四级', '三至五级', '四至六级', '五至七级', '六至八级', '七至九级'];
    const safe = this.safeAt(p.x, p.y) || this.warZoneAt(p.x, p.y);
    if (this.kTier < 0) this.kTier = tierOf(dz.k);
    else if (!safe && !g.story?.fight) {
      const up = tierOf(dz.k - 0.25), dn = tierOf(dz.k + 0.25);
      if (up > this.kTier) {
        this.kTier = up;
        const hl = h.realm <= 1 ? 1 : h.realm === 2 ? 2 + Math.min(2, Math.floor(h.stage / 4)) : h.realm === 3 ? 5 + Math.min(2, Math.floor(h.stage / 4)) : 8;
        const top = [1, 1, 3, 4, 5, 6, 7, 8, 9][up];
        g.toast(`妖气渐浓——此地常有${TXT[up]}妖兽出没。${top > hl + 1 ? '远超你的修为，小心行事。' : ''}`, top > hl ? 'warn' : 'info');
      } else if (dn < this.kTier) { this.kTier = dn; g.toast(`妖气稍淡，此地多是${TXT[dn]}妖兽。`, 'info'); }
    }
    // 兽潮：妖气 ≥2.5 的荒野，入夜后偶发；四十息内妖兽成群扑来
    if (this.tideT > 0) { this.tideT -= dt; if (this.tideT <= 0) g.toast('兽吼声渐渐远去，兽潮退了。', 'info'); return; }
    this.tideCd -= dt;
    if (this.tideCd <= 0 && g.night > 0.6 && dz.k >= 2.5 && !safe && !g.story?.fight && Math.random() < 0.12) {
      this.tideCd = 420 + Math.random() * 300; this.tideT = 40;
      g.toast('四面八方兽吼连绵，大地隐隐震颤——兽潮来了！', 'warn');
      g.juice(0.05, 0.6); audio.sfx('thunder');
    }
  }

  /** 第十八步：按某处的危险度挑一头合适的妖兽（守护兽、巢穴之母、渡劫妖兽……）。dAdd：危险度加成 */
  rollBeast(x: number, y: number, dAdd = 0, opt: { flying?: boolean; noFlee?: boolean } = {}): { def: EnemyDef; realm: number; stage: number } | null {
    const dz = this.dangerCalc(x, y), T = this.game.terrain;
    const sea = !T.isLand(x, y);
    const zone = sea ? 'sea' : dz.zone === 'sea' ? '' : dz.zone;
    const d = clamp(dz.d + dAdd, 0, 6);
    const rk = bandRealm(ACTIVE_WORLD === 'human' ? Math.min(8, dz.k + dAdd * 1.33) : ACTIVE_WORLD === 'spirit' ? Math.min(14.3, dz.k + dAdd * 0.85) : dz.k + dAdd, Math.random, ACTIVE_WORLD);
    const band = lvOf(rk.realm, rk.stage);
    const curPlane = planeEnemyTag(ACTIVE_WORLD);
    const ok = (e: EnemyDef) => (e.plane ?? 'mortal') === curPlane && (!e.maps || e.maps.includes(ACTIVE_MAP)) && !e.lair && !e.lm && e.kind !== 'human' && e.kind !== 'ghost' && (!e.regions || e.regions.includes(dz.region)) && (ACTIVE_WORLD !== 'human' || (sea ? e.zone === 'sea' : e.zone !== 'sea')) && (!e.zone || e.zone === zone) && (!opt.noFlee || (e.behave !== 'flee' && e.behave !== 'shy')) && (opt.flying === undefined || !!e.flying === opt.flying);
    let cands = ENEMY_LIST.filter((e) => ok(e) && (e.lv ? lvWeight(e, band, true) > 0 : e.minDanger <= d + 0.6 && d <= e.maxDanger + 0.8));
    if (!cands.length) cands = ENEMY_LIST.filter((e) => ok(e) && !!e.lv);
    if (!cands.length) return null;
    let def = cands[Math.floor(Math.random() * cands.length)];
    const rs = this.beastRS(def, rk);
    if (modx?.has('spawn')) {   // v0.57：模组可换掉刷出的妖兽、改境界，或不让刷
      const c = modx.fire('spawn', { enemyId: def.id, realm: rs.realm, stage: rs.stage, x, y });
      if (c.cancel) return null;
      if(typeof c.enemyId==='string' && Object.prototype.hasOwnProperty.call(ENEMIES,c.enemyId))def=ENEMIES[c.enemyId];
      const realm=hookNumber(c.realm),stage=hookNumber(c.stage);
      if(realm!==null)rs.realm=clamp(Math.round(realm),1,12);
      if(stage!==null)rs.stage=clamp(Math.round(stage),0,3);
    }
    return { def, realm: rs.realm, stage: rs.stage };
  }
  /** 妖兽按自身等阶取境界：危险度给出的等阶被夹在该妖兽的等阶范围内 */
  beastRS(def: EnemyDef, rk: { realm: number; stage: number }) {
    if (!def.lv) return rk;
    const band = lvOf(rk.realm, rk.stage);
    const lv = clamp(band, def.lv[0], def.lv[1]);
    if (lv === band) return rk;
    return lvRealm(lv, band > lv ? 12 : 2);
  }

  /** 第三十六步：妖王巢穴标在地图上（妖气冲霄，修士皆知），斩杀后标记变灰 */
  lairMarks(): { x: number; y: number; glyph: string; color: string; ring?: number; name: string }[] {
    const g = this.game, f = g.ws.flags as any, out: { x: number; y: number; glyph: string; color: string; ring?: number; name: string }[] = [];
    for (const L of LAIRS) {
      const at = legacyHere(L.x, L.y); if (!at) continue;
      const def = ENEMIES[L.enemy]; if (!def?.lv) continue;
      const dead = f.lairs?.[L.id] && g.day - f.lairs[L.id] < 1080;
      out.push({ x: at[0] * WORLD_SCALE, y: at[1] * WORLD_SCALE, glyph: '妖', color: dead ? '#8a8478' : '#ff5a3c', ring: dead ? undefined : 3200, name: `${L.name}·${def.name}（${lvName(def.lv[0])}）${dead ? '·已除' : ''}` });
    }
    for (const L of HIGHER_LAIRS) {
      if (L.map !== ACTIVE_MAP) continue;
      const def = ENEMIES[L.enemy]; if (!def?.lv) continue;
      const dead = f.lairs?.[L.id] && g.day - f.lairs[L.id] < 1080;
      out.push({ x: L.x * WORLD_SCALE, y: L.y * WORLD_SCALE, glyph: ACTIVE_WORLD === 'immortal' ? '尊' : '凶', color: dead ? '#8a8478' : '#e05880', ring: dead ? undefined : 3400, name: `${L.name}·${def.name}（${lvName(def.lv[0])}）${dead ? '·已除' : ''}` });
    }
    return out;
  }
  /** 妖王巢穴：靠近时妖王现身；斩杀后三年内无妖王 */
  lairTick() {
    const g = this.game, p = g.player;
    const f = g.ws.flags as any;
    f.lairs ??= {}; f.lairSeen ??= {};
    const checkLair = (L: (typeof LAIRS)[number], lx: number, ly: number) => {
      const d = Math.hypot(lx - p.x, ly - p.y);
      if (d > 6000) return;
      if (!f.lairSeen[L.id]) { f.lairSeen[L.id] = 1; g.toast(`一股令人心悸的妖气自远处弥漫而来——此地是「${L.name}」。${L.desc}`, 'warn'); }
      if (d > 3200) return;
      if (f.lairs[L.id] && g.day - f.lairs[L.id] < 1080) return;
      if (this.enemies.some((e) => e.lairId === L.id && !e.dead)) return;
      const def = ENEMIES[L.enemy]; if (!def?.lv) return;
      const rs = lvRealm(def.lv[0]);
      const e = new Enemy(def, lx, ly, rs.realm, rs.stage, !g.terrain.isLand(lx, ly));
      e.boss = true; e.lairId = L.id; e.hx = lx; e.hy = ly;
      rollAffix(e, Math.min(8, this.dangerAt(lx, ly).k), Math.random() < 0.5 ? 2 : 1);
      this.enemies.push(e);
    };
    for (const L of LAIRS) {
      const at = legacyHere(L.x, L.y); if (!at) continue;
      checkLair(L, at[0] * WORLD_SCALE, at[1] * WORLD_SCALE);
    }
    for (const L of HIGHER_LAIRS) {
      if (L.map !== ACTIVE_MAP) continue;
      checkLair(L, L.x * WORLD_SCALE, L.y * WORLD_SCALE);
    }
  }

  /** 秘境 / 洞府守卫 */
  /** 调试 / 截图：在指定处放一只妖兽（不惊动、不移动） */
  debugSpawn(id: string, x: number, y: number) {
    const def = ENEMIES[id]; if (!def) return null;
    const lv = def.lv ? def.lv[0] : 1, rs = lvRealm(lv);
    const e = new Enemy(def, x, y, rs.realm, rs.stage, !this.game.terrain.isLand(x, y));
    this.enemies.push(e); return e;
  }
  spawnGuards(loc: LocDef) {
    const dz = loc.danger ?? 1;
    const curPlane = planeEnemyTag(ACTIVE_WORLD);
    const cands = ENEMY_LIST.filter((e) => (e.plane ?? 'mortal') === curPlane && (!e.maps || e.maps.includes(ACTIVE_MAP)) && e.minDanger <= dz && dz <= e.maxDanger && (ACTIVE_WORLD !== 'human' || e.zone !== 'sea') && !e.behave && !e.lair);
    if (!cands.length) return;
    const n = 1 + Math.floor(dz / 2);
    for (let i = 0; i < n; i++) {
      const def = cands[Math.floor(Math.random() * cands.length)];
      const rk = this.beastRS(def, ACTIVE_WORLD === 'human' ? dangerRealm(dz + 0.5, Math.random) : bandRealm(ACTIVE_WORLD === 'immortal' ? 18 + dz * 0.4 : 8.6 + dz * 0.85, Math.random, ACTIVE_WORLD));
      const e = new Enemy(def, loc.x * WORLD_SCALE + rand(-200, 200), loc.y * WORLD_SCALE + rand(-150, 150), rk.realm, rk.stage);
      e.name = def.name + '·守护'; e.maxHp = e.hp = Math.round(e.hp * 1.4); e.aggro = true;
      this.enemies.push(e);
    }
  }

  // ------------------------------------------------------------ 每帧更新
  update(dt: number) {
    const g = this.game, p = g.player, h = g.hero;
    const t = g.time;
    this.castT = Math.max(0, this.castT - dt); this.hitT = Math.max(0, this.hitT - dt); this.invulnT = Math.max(0, this.invulnT - dt);
    this.combatT += dt;
    this.fade = Math.max(0, this.fade - dt * 0.6);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    // 威压：附近已察觉你的高境界敌人
    let pr = 0;
    for (const e of this.enemies) if (!e.dead && e.aggro && e.realm > h.realm && !(e.pursuer && p.boosting) && Math.hypot(e.x - p.x, e.y - p.y) < 700) pr = Math.max(pr, e.realm - h.realm);   // 催动遁光时，追兵的威压压不住你
    this.pressure += (pr - this.pressure) * Math.min(1, dt * 3);
    this.pressWarnT -= dt;
    if (pr > 0 && this.pressWarnT <= 0) { this.pressWarnT = 25; g.toast(pr === 1 ? '一股沉凝的威压笼罩而来——对方高你一个大境界：气血、法力都压你一头，却并非不可一战。能战则战，不敌则走。' : `一股${pr >= 3 ? '令人窒息' : '如山岳般'}的威压笼罩而来——对方修为高出你两个大境界以上，硬拼必死，速逃！`, 'warn'); }
    for (const [k, v] of this.cds) if (v > 0) this.cds.set(k, v - dt);
    // 增益过期
    for (const k of ['atk', 'def', 'speed', 'regen'] as const) if (this.buffs.until[k] && t > this.buffs.until[k]) { this.buffs[k] = 0; delete this.buffs.until[k]; }
    const stealth = (this.buffs.until.stealth ?? 0) > t;
    // 刷怪与生态低频推进（休眠巡游体禁止在未唤醒前跨入神识内圈）
    if (!this.game.mijing?.active) this.eco.tick(t, this.visRect(), { x: p.x, y: p.y, r: Math.max(g.detailSenseRadius + 300, g.awarenessRadius + 80) });
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 2.5; if (!this.game.mijing?.active) { this.spawnTick(); this.lairTick(); this.wildTick(2.5); } }
    // 玩家异状
    this.tickStatuses(this.pst, dt, (dmg) => { const hpMax = this.pStats.hp, next = h.hp - dmg / hpMax; if (!Number.isFinite(h.hp) || !Number.isFinite(hpMax) || hpMax <= 0 || !Number.isFinite(next)) return; h.hp = next; if (Math.random() < dt * 3) this.texts.push({ x: p.x, y: p.y - 110, s: '-' + Math.round(dmg * 0.5), color: '#e09060', t: 0, vy: -40 }); if (h.hp <= 0) this.playerDown(); });
    // 回复
    const ooc = this.combatT > 6;
    const regen = (ooc ? 0.025 : 0.003) + this.buffs.regen;
    h.hp = Math.min(1, h.hp + regen * dt);
    if (!(g.senseBurstT > 0) && !p.boosting) h.mp = Math.min(1, h.mp + (ooc ? 0.035 : 0.008) * dt);   // 神识外放 / 催动遁光期间法力不回
    if (this.heal) { this.heal.t -= dt; h.hp = Math.min(1, h.hp + this.heal.rate * dt); h.mp = Math.min(1, h.mp + this.heal.mp * dt); if (Math.random() < dt * 8) this.sparks.push({ x: p.x + rand(-30, 30), y: p.y - rand(0, 80), vx: 0, vy: -40, t: 0, max: 1, size: 3, color: '150,230,120' }); if (this.heal.t <= 0) this.heal = null; }
    this.lingdun.update(dt);
    if (this.shield) { this.shield.t -= dt; if (this.shield.t <= 0) this.shield = null; }
    this.blockT = Math.max(0, this.blockT - dt * 3);
    if (this.shield?.art) {   // 法器盾：平时绕着人物转圈（不跟朝向），挨打时滑到来袭方向挡
      const t0 = this.game.time;
      if (this.blockT > 0.05) {
        // 受击：22/s 急转到来袭方向
        let d = this.blockDir - this.shieldAng; d = Math.atan2(Math.sin(d), Math.cos(d));
        this.shieldAng += d * Math.min(1, dt * 22);
      } else {
        // 平时：绕身匀速转圈（与人物朝向、移动无关），角速度轻微起伏，避免机械感
        this.shieldAng += dt * (1.15 + 0.5 * Math.sin(t0 * 0.87));
        if (this.shieldAng > 1e4 || this.shieldAng < -1e4) this.shieldAng %= TAU;
      }
    }
    // 盾形法器：脱战后灵光渐复
    if (this.shieldCd > 0) this.shieldCd -= dt;
    else if (h.equip.shield && !this.shield) { const sa = itemDef(h.equip.shield).art; if (sa) { const amt = this.pStats.hp * (sa.absorb ?? 0.5); this.shield = { amt, max: amt, t: 9999, reflect: 0, fx: 'gold', color: lookOf(h.equip.shield).glow, art: h.equip.shield }; } }
    if (this.shield?.art && this.combatT > 4) this.shield.amt = Math.min(this.shield.max, this.shield.amt + this.shield.max * 0.08 * dt);
    if (this.decoy) { this.decoy.t -= dt; if (this.decoy.t <= 0) this.decoy = null; }
    // 冲刺
    if (this.dash) {
      const d = this.dash;
      d.t += dt;
      const nx = p.x + d.vx * dt, ny = p.y + d.vy * dt;
      if (g.isFlying || g.terrain.walkFactor(nx, ny) > 0) { p.x = nx; p.y = ny; }
      if (Math.random() < 0.9) this.sparks.push({ x: p.x + rand(-10, 10), y: p.y - rand(10, 70), vx: -d.vx * 0.1, vy: -d.vy * 0.1, t: 0, max: 0.4, size: rand(3, 6), color: d.color });
      if (d.dmg > 0) {
        for (const e of this.enemies) if (!e.dead && !d.hit.has(e.id) && Math.hypot(e.x - p.x, e.y - p.y) < 70) { d.hit.add(e.id); this.hitEnemy(e, d.dmg, { realm: h.realm, stCh: 0, school: '风' }, p.x, p.y); }
        const dFormHit = ((d as any).hitForm ??= new Set<number>());
        this.game.sectwar?.damageFormationArea(p.x, p.y, 70, d.dmg, 'foe', h.realm, '风', dFormHit);
        const dShipHit = ((d as any).hitShip ??= new Set<number>());
        this.game.sectwar?.damageAirshipArea(p.x, p.y, 90, d.dmg, 'foe', h.realm, dShipHit);
      }
      if (d.t >= d.dur) this.dash = null;
    }
    // 环绕剑盾
    if (this.orbit) {
      const o = this.orbit; o.t -= dt;
      for (let i = 0; i < o.n; i++) {
        const an = t * 3.2 + (i / o.n) * TAU;
        const sx = p.x + Math.cos(an) * o.r, sy = p.y - 40 + Math.sin(an) * o.r * 0.5;
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (Math.hypot(e.x - sx, e.y - 30 - sy) < 50 && (o.hitT.get(e.id) ?? 0) < t) { o.hitT.set(e.id, t + 0.5); this.hitEnemy(e, o.dmg, { realm: h.realm, stCh: 0, school: '剑' }, p.x, p.y); }
        }
        const fHitAt = ((o as any).formHitT ?? 0);
        if (fHitAt < t && this.game.sectwar) {
          const hitSet = new Set<number>();
          this.game.sectwar.damageFormationArea(sx, sy + 30, 56, o.dmg, 'foe', h.realm, '剑', hitSet);
          if (hitSet.size > 0) (o as any).formHitT = t + 0.5;
        }
        const sHitAt = ((o as any).shipHitT ?? 0);
        if (sHitAt < t && this.game.sectwar) {
          const shipSet = new Set<number>();
          this.game.sectwar.damageAirshipArea(sx, sy + 30, 80, o.dmg, 'foe', h.realm, shipSet);
          if (shipSet.size > 0) (o as any).shipHitT = t + 0.5;
        }
      }
      if (o.t <= 0) this.orbit = null;
    }
    this.sup.update(dt);
    this.updateEnemies(dt, stealth);
    this.foe.update(dt);
    this.refreshLock(dt);
    this.updateProjs(dt);
    this.updateFields(dt);
    this.updateSummons(dt); this.runLater(dt);
    this.acts.update(dt);
    if (this.swarm) { this.swarm.update(dt); if (this.swarm.done) this.swarm = null; }
    // 云雷双翼：展翅期间移动留下雷遁残影
    if (this.wing) {
      const w = this.wing; w.t -= dt; w.flap = Math.max(0, w.flap - dt);
      if (w.t <= 0) this.wing = null;
      else if (Math.hypot(p.st.vx, p.st.vy) > 60) { this.ghostT -= dt; if (this.ghostT <= 0) { this.ghostT = 0.05; this.ghosts.push({ x: p.x, y: p.y, t: 0, dur: 0.32, color: '255,220,130', yaw: p.st.yaw }); } }
    }
    for (const gh of this.ghosts) gh.t += dt;
    this.ghosts = this.ghosts.filter((gh) => gh.t < gh.dur);
    if (this.petSwarm) this.petSwarm.update(dt);
    // 天降打击
    this.strikes = this.strikes.filter((s) => {
      s.t -= dt;
      if (s.t > 0) return true;
      this.vfx.push({ kind: 'strike', x: s.x, y: s.y, r: s.r, t: 0, dur: 0.5, color: s.color, fx: s.fx, seed: Math.random() * 1e6 });
      this.aoe(s.x, s.y, s.r, s.dmg, { realm: s.realm, status: s.status, stCh: s.stCh, school: s.school, evil: s.evil });
      if (s.fx === 'lightning' || s.fx === 'goldthunder') audio.sfx('thunder');
      return false;
    });
    // 掉落拾取
    updateWorldDrops(this.loot,l=>updateWorldDrop(l,p,h.dead,dt,(id,n)=>C.addItem(h,id,n),(id,n)=>{
      const it=itemDef(id);g.toast(`拾得 ${it.name}${n>1?' ×'+n:''}`,it.type==='scroll'||it.type==='artifact'?'good':'info');audio.sfx('gather');
    },()=>g.toast('背包无法收纳掉落物，物品仍留在地上。','warn')));
    // 文字 / 特效
    this.texts = this.texts.filter((x) => { x.t += dt; x.y += x.vy * dt; x.vy *= 0.94; return x.t < 1.1; });
    this.vfx = this.vfx.filter((v) => { v.t += dt; return v.t < v.dur; });
    this.sparks = this.sparks.filter((s) => { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 60 * dt; return s.t < s.max; });
    if (this.sparks.length > 500) this.sparks.splice(0, this.sparks.length - 500);
    // 清理：远离活跃圈的生态实体先休眠入账本，回访时按原样唤醒（宗门战场参战单位与从大营赶赴前线的散斗弟子由 sectwar 统管归建，严禁被生态圈提前吞掉）
    const keepR = Math.max(5000, g.senseRadius * 1.45, g.awarenessRadius * 1.35, g.detailSenseRadius + 1200);
    const isWarUnit = (e: Enemy) => (e as any).warRos !== undefined || (e as any).swDs !== undefined || (e as any).warSkirmish || (e as any).warForm || e.tag === 'war:ally' || e.tag === 'war:skirmish_ally';
    this.enemies = this.enemies.filter((e) => {
      if (e.dead) return (e.deathT += dt) < 0.8;
      if (e.gone) return false;
      if ((e as any).warSkirmish) {
        return true; // 由 sectwar.tickSkirmishes 统一按战场距离归建并回收，避免中途截断漏还兵额
      }
      const limit = isWarUnit(e) ? Math.max(keepR, 22000) : keepR;
      if (Math.hypot(e.x - p.x, e.y - p.y) >= limit) {
        if (!isWarUnit(e)) this.eco.hibernateActor(e, t);
        return false;
      }
      return true;
    });
    for (const e of this.allies) if (e.leaveAt !== undefined && this.game.time > e.leaveAt && !e.aggro && !e.dead && !e.gone) { e.gone = true; this.vfx.push({ kind: 'blinkfx', x: e.x, y: e.y, r: 70, t: 0, dur: 0.45, color: '200,230,255' }); this.texts.push({ x: e.x, y: e.y - 120, s: '告辞！', color: '#a8eec0', t: 0, vy: -24 }); }
    if (this.allies.length) this.allies = this.allies.filter((e) => (e.dead ? (e.deathT += dt) < 0.8 : !e.gone && Math.hypot(e.x - p.x, e.y - p.y) < ((e as any).warSkirmish ? Math.max(keepR, 36000) : isWarUnit(e) ? Math.max(keepR, 22000) : 5000)));
  }

  private tickStatuses(st: Statuses, dt: number, dot: (d: number) => void) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (const k in st) {
      const key = k as StatusKind, s = st[key]!;
      const damaging = k === 'burn' || k === 'poison';
      if (!s || !Number.isFinite(s.t) || (damaging && (!Number.isFinite(s.dps) || s.dps < 0 || !Number.isFinite(s.stacks ?? 1) || (s.stacks ?? 1) < 0))) { delete st[key]; continue; }
      // 只在状态仍有效的时间内结算，避免长帧/到期帧多扣血。
      const active = Math.max(0, Math.min(dt, s.t));
      s.t -= dt;
      if ((k === 'burn' || k === 'poison') && s.dps > 0) {
        const damage = s.dps * (s.stacks ?? 1) * active;
        if (Number.isFinite(damage) && damage > 0) dot(damage);
      }
      if (s.t <= 0) delete st[key];
    }
  }

  // ------------------------------------------------------------ 第二十九步：仇恨 / 嘲讽
  tanks: Tank[] = [];
  private buildTanks(dt: number) {
    const g = this.game, p = g.player, h = g.hero, L: Tank[] = [{ k: 'p', x: p.x, y: p.y, w: 1 }];
    if (this.decoy) L.push({ k: 'decoy', x: this.decoy.x, y: this.decoy.y, w: 99 });
    // v0.53：出窍时毫无还手之力的肉身最招人；玄武化形引敌
    const yb = g.yuanying?.active ? g.yuanying.body : null; if (yb) L.push({ k: 'body', x: yb.x, y: yb.y, w: 2.4 });
    const gui = guardGui(this); if (gui) L.push({ k: 'gui', x: gui.x, y: gui.y, w: 3, ref: gui });
    for (const sm of this.summons) {
      if (sm.kind === 'tihun') continue;
      sm.hp ??= 1;
      if (sm.hp > 0 && sm.t > 0) L.push({ k: 'summon', x: sm.x, y: sm.y, w: sm.kind === 'puppet' ? 2.2 : sm.kind === 'bugs' ? 1.2 : 1.5, ref: sm });
    }
    const sw = this.swarm; if (sw && !sw.done && sw.mode !== 'recall' && sw.n > 8) L.push({ k: 'swarm', x: sw.cx, y: sw.cy, w: sw.mode === 'cover' ? 2.4 : 1.3, ref: sw });
    const pe: any = g.pets?.ent;
    if (pe && g.pets.active) {
      pe.hp ??= 1; pe.down = Math.max(0, (pe.down ?? 0) - dt);
      if (!this.inCombat) pe.hp = Math.min(1, pe.hp + dt * 0.04);
      if (pe.down <= 0 && pe.hp > 0) L.push({ k: 'pet', x: pe.x, y: pe.y, w: g.pets.active.kind === 'shijin' ? 1.0 : 1.3, ref: pe });
    }
    for (const a of g.npcs.followers()) {
      const A: any = a; A.downT = Math.max(0, (A.downT ?? 0) - dt);
      if (!this.inCombat || A.downT > 0) a.hp = Math.min(1, a.hp + dt * 0.03);
      if (A.downT <= 0 && a.hp > 0) L.push({ k: 'ally', x: a.st.x, y: a.st.y, w: 1.5, ref: a });
    }
    // v0.54.2：友人元婴出窍，盘坐的肉身最招人
    for (const b of g.shen?.bodies() ?? []) L.push({ k: 'abody', x: b.x, y: b.y, w: 2.2, ref: b.a });
    void h; this.tanks = L;
    // 第三十九步：此刻各目标身上压着几个人（混战里用来分散火力）
    this.U = this.units; this.tgCnt.clear();
    this.melee = this.allies.length > 0 || this.U.some((e) => !e.dead && e.team !== undefined);
    for (const e of this.U) if (!e.dead && e.aggro && e.tankRef !== undefined) this.tgCnt.set(e.tankRef, (this.tgCnt.get(e.tankRef) ?? 0) + 1);
  }
  // ------------------------------------------------------------ 第三十九步：混战
  /** v0.54：没编派系的修士（劫修、追兵、散修）归「@rogue」，没编派系的妖兽鬼物归「@wild」——两拨人不再是一伙 */
  teamOf(e: Enemy) { return e.ally ? '@p' : e.team ?? (e.def.kind === 'human' ? '@rogue' : '@wild'); }
  /** a 会不会把 b 当成对手（同派系不打；没编派系的野怪只有自己杀红了眼才会被卷进来） */
  hostile(a: Enemy, b: Enemy) {
    if (a === b || b.dead || b.gone || b.hideT > 0 || b.spar || a.spar || b.sleep || (b.busy && !b.aggro)) return false;
    if ((a as any).departing || (b as any).departing) return false;
    const ta = this.teamOf(a), tb = this.teamOf(b);
    if (ta === tb) return false;
    // 不冲你来的人与你的同阵修士互不相犯
    if ((ta === '@p' && (b as any).noP) || (tb === '@p' && (a as any).noP)) return false;
    // 野兽没动凶性时谁也不惹；一旦动了凶性，见人就扑——劫修、追兵一样挨咬
    if (tb === '@wild' && !b.aggro) return false;
    if (ta === '@wild' && !a.aggro) return false;
    // 劫修 / 追兵只在杀心已起时才卷入别家的厮杀
    if (ta === '@rogue' && !a.aggro && tb !== '@wild') return false;
    if (tb === '@rogue' && !b.aggro && ta !== '@wild') return false;
    return true;
  }
  /** 一定范围内、与 e 敌对的单位（最近者） */
  rivalNear(e: Enemy, x: number, y: number, r: number): Enemy | null {
    let best: Enemy | null = null, bd = r;
    for (const o of this.U) { if (!this.hostile(e, o)) continue; const d = Math.hypot(o.x - x, o.y - y); if (d < bd) { bd = d; best = o; } }
    return best;
  }
  /** 同阵修士入场 */
  addAlly(e: Enemy) { e.ally = true; e.aggro = false; e.hx = e.x; e.hy = e.y; e.maxHp = e.hp = Math.round(e.maxHp * 1.3); this.allies.push(e); return e; }
  /** 收兵：同阵修士化光离去 */
  dismissAllies(pred?: (e: Enemy) => boolean) { for (const e of this.allies) if (!e.dead && !e.gone && (!pred || pred(e))) { e.gone = true; this.vfx.push({ kind: 'blinkfx', x: e.x, y: e.y, r: 70, t: 0, dur: 0.45, color: '200,230,255' }); } }
  onNpcKill?: (e: Enemy, by?: Enemy) => void;
  /** NPC 之间的伤害（不经你手：不涨熟练、不顿帧、不记你的杀孽） */
  npcHit(src: Enemy | undefined, t: Enemy, raw: number, realm: number, status: StatusSpec | undefined, fx: number, fy: number) {
    if (t.dead || t.hideT > 0 || t.gone || this.isShieldedFormUnit?.(t)) return;
    if (!Number.isFinite(raw) || raw < 0 || !Number.isFinite(t.hp) || !Number.isFinite(t.maxHp) || t.maxHp <= 0 || !Number.isFinite(t.dfn) || !Number.isSafeInteger(t.realm) || !Number.isSafeInteger(realm)) return;
    if (src?.affix) raw = affixOutDmg(src, raw);
    if (!Number.isFinite(raw) || raw < 0) return;
    let d = raw * (t.guardT > 0 ? 0.35 : 1);
    d = Math.max(d * 0.15, d - t.dfn * 0.8 * (t.st.break ? 0.5 : 1));
    d *= realmTakeK(clamp(realm - t.realm, -3, 3), t.realm) * NPC_DMG * (t.st.shock ? 1.2 : 1);
    d = Math.max(1, Math.round(d * rand(0.9, 1.1)));
    if (!Number.isFinite(d) || !Number.isFinite(t.hp - d)) return;
    if (t.ward && (!Number.isFinite(t.ward.hp) || t.ward.hp < 0)) return;
    const g = this.game, p = g.player, near = Math.abs(t.x - p.x) < 1600 && Math.abs(t.y - p.y) < 1200;
    if (src) { t.grudge = src; t.grudgeT = g.time; }
    if ((t as any).warStandoff) (t as any).warStandoff = false;
    t.aggro = true; t.sleep = false; t.busy = false;
    if (t.ward) { const left = absorbWard(this, t, d); if (left <= 0) { t.anim.hit = 0.4; return; } d = Math.max(1, Math.round(left)); }
    t.hp -= d; t.anim.hit = 1; t.hitFlash = Math.max(t.hitFlash, 0.1);
    const kdx = t.x - fx, kdy = t.y - fy, kd = Math.hypot(kdx, kdy) || 1, frac = d / t.maxHp;
    const kb = (40 + Math.min(180, frac * 700)) * (t.def.hp >= 1.8 ? 0.35 : 1);
    if (Number.isFinite(kd) && Number.isFinite(kb)) { t.kx += kdx / kd * kb; t.ky += kdy / kd * kb * 0.7; }
    if (near) {
      const power = Math.min(1.8, 0.5 + frac * 5);
      this.fxq.push({ k: 'hit', x: t.x + rand(-8, 8), y: t.y - this.hitY(t), color: t.ally ? '255,170,140' : '255,226,190', power, crit: false, dir: Math.atan2(kdy, kdx) });
      audio.dir.hit(t.x, t.y, undefined, power * 0.7);
      const dense = this.U.length >= 10;
      if (!dense || Math.random() < 0.28) {
        this.texts.push({ x: t.x + rand(-14, 14), y: t.y - 80, s: String(d), color: t.ally ? '#ff9a7a' : '#d8c8b0', source: t, t: 0, vy: -55 });
      }
    }
    if (status && Math.random() < status.ch) this.applyStatus(t.st, status, d, t, fx, fy);
    if (t.hp <= 0) this.npcKill(t, src);
  }
  private npcKill(t: Enemy, src?: Enemy) {
    const g = this.game, p = g.player;
    t.dead = true; t.deathT = 0; t.npcKill = true; t.killer = src;
    if (this.lock === t) this.lock = null;
    const near = Math.hypot(t.x - p.x, t.y - p.y) < 1800;
    audio.dir.kill(t);
    this.burstShards(t.x, t.y - 30, t.def.evil ? '160,120,220' : '255,240,200');
    this.fxq.push({ k: 'kill', x: t.x, y: t.y - 40, color: t.def.evil ? '200,80,200' : '255,226,170' });
    if (near && (t.def.kind === 'human' || t.boss)) this.texts.push({ x: t.x, y: t.y - 130, s: `${t.name}${t.def.kind === 'human' ? '陨落' : '伏诛'}`, color: t.ally ? '#ff9a7a' : '#e8d0a0', source: t, t: 0, vy: -24, big: !!t.boss });
    // 尸身上的东西还在——坐收渔利（掉落减半）
    if (!t.ally) {
      for (const dr of t.def.drops) if (Math.random() < dr.ch * 0.5) this.dropLoot(t.x, t.y, dr.id, dr.n ? rint(dr.n[0], dr.n[1]) * (t.blv ? 1 : t.realm) : 1);
      if (t.blv && Math.random() < [0, 0.35, 0.5, 0.65, 0.8, 1, 1, 1, 1, 1, 1][t.blv] * 0.7) this.dropLoot(t.x, t.y, 'mat_yaodan' + t.blv, 1);
    }
    this.onNpcKill?.(t, src);
  }
  private pickTank(e: Enemy, dt: number, pOff = false): Tank | null {
    const L = this.tanks, key = (t: Tank) => t.ref ?? t.k, tr = e.tankRef;
    let cur: Tank | undefined;
    if (tr instanceof Enemy) { if (this.hostile(e, tr)) cur = { k: 'foe', x: tr.x, y: tr.y, w: 1, ref: tr }; }
    else if (tr !== undefined && !e.ally && !pOff) cur = L.find((t) => key(t) === tr);
    e.tankT -= dt;
    if (!cur || e.tankT <= 0) {
      e.tankT = 0.8 + Math.random() * 0.4;
      let best: Tank | null = null, bs = -1, rivals = 0;
      const isWarChamp = ((e as any).warRos !== undefined || (e as any).swDs !== undefined) && !(e as any).warForm && e.realm >= 2;
      const searchR = (e as any).warSkirmish ? 3200 : 1500;
      // 第三十九步：混战——别的派系 / 敌对阵营的人，同样是对手（宗门战将对将：高阶修士优先锁定同等阶高手对峙交锋）
      for (const o of this.U) {
        if (!this.hostile(e, o)) continue;
        const d = Math.hypot(o.x - e.x, o.y - e.y); if (d > searchR) continue;
        rivals++;
        let w = 1.1 * (o.boss ? 1.15 : 1);
        if (isWarChamp) {
          if (!(o as any).warForm && o.realm >= 2) w *= Math.abs(o.realm - e.realm) <= 1 ? 2.1 : 1.5;
          else if (o.realm < 2) w *= 0.4;
        }
        const bit = o === e.grudge && this.game.time - e.grudgeT < 4;
        if (bit) w *= e.hunt ? 2.8 : 1.9;   // 谁打我，我打谁（专冲你来的也得先甩开咬住他的妖兽）
        if (e.hunt && !pOff && !bit) w *= 0.35;
        if (o === tr) w *= 1.35;
        const n = (this.tgCnt.get(o) ?? 0) - (o === tr ? 1 : 0); w /= 1 + 0.35 * Math.max(0, n);
        const sc = w / (d + 200);
        if (sc > bs) { bs = sc; best = { k: 'foe', x: o.x, y: o.y, w, ref: o }; }
      }
      if (!e.ally && !pOff && !(e as any).noP) for (const t of L) {
        let w = t.w;
        if (t.k === 'p' && this.game.time - e.lastHitBy < 3) w *= 1.6;
        if (isBoss(e) && t.k !== 'decoy' && t.k !== 'p') w *= 0.6;
        if (key(t) === tr) w *= 1.35;
        if (t.k === 'p' && e.hunt) w *= 2.4;
        // 混战里：已经有好几个人围着你打了，其余的人更愿意去找别的对手
        if (rivals && t.k !== 'decoy') { const n = (this.tgCnt.get(key(t)) ?? 0) - (key(t) === tr ? 1 : 0); w /= 1 + 0.5 * Math.max(0, n); }
        const sc = w / (Math.hypot(t.x - e.x, t.y - e.y) + 200);
        if (sc > bs) { bs = sc; best = t; }
      }
      if (!best) { e.tankRef = undefined; return null; }
      if (key(best) !== tr && best.k !== 'p' && best.k !== 'decoy' && e.aggro && Math.random() < 0.4) this.texts.push({ x: e.x, y: e.y - 120, s: '!', color: '#ffb070', source: e, t: 0, vy: -30 });
      cur = best; e.tankRef = key(best);
    }
    return cur;
  }
  /** 敌人的攻击落在仇恨目标上 */
  tankHit(t: Tank, raw: number, realm: number, status: StatusSpec | undefined, fx: number, fy: number, e?: Enemy) {
    if (!Number.isFinite(raw) || raw < 0 || !Number.isSafeInteger(realm)) return;
    const g = this.game, h = g.hero, ps = this.pStats;
    if (t.k === 'foe') { this.npcHit(e, t.ref, raw, realm, status, fx, fy); return; }
    if (t.k === 'p') { this.hitPlayer(raw, realm, status, fx, fy, e); return; }
    if (t.k === 'decoy') { if (this.decoy) this.decoy.t -= 0.6; return; }
    if (t.k === 'body') { g.yuanying?.hitBody(raw, realm, e); return; }
    if (t.k === 'gui') { const d = raw * realmTakeK(realm - h.realm, h.realm) / Math.max(1, ps.hp); if (Number.isFinite(d) && d >= 0) (t.ref as HuaxingAct).absorb(d, e); return; }
    if (t.k === 'abody') { const RR = REALMS[t.ref.d.realm]; if (!RR) return; const d = raw * realmTakeK(realm - t.ref.d.realm, t.ref.d.realm) / Math.max(1, RR.hp[Math.min(t.ref.d.stage, RR.hp.length - 1)] * 1.2); if (Number.isFinite(d) && d >= 0) g.shen?.hitAllyBody(t.ref, d); return; }
    const R = t.k === 'ally' ? t.ref.d.realm : h.realm;
    let base = ps.hp * (t.k === 'pet' ? 0.9 : t.k === 'summon' ? (t.ref.kind === 'puppet' ? 0.8 : 0.45) : 1);
    if (t.k === 'ally') { const RR = REALMS[t.ref.d.realm]; if (!RR) return; base = RR.hp[Math.min(t.ref.d.stage, RR.hp.length - 1)] * 1.2; }
    const frac = raw * realmTakeK(realm - R, R) / Math.max(1, base);
    if (!Number.isFinite(frac) || frac < 0 || !Number.isFinite(t.ref.hp ?? 1) || !Number.isFinite((t.ref.hp ?? 1) - frac)) return;
    this.sparks.push({ x: t.x + rand(-10, 10), y: t.y - 40, vx: rand(-80, 80), vy: rand(-120, -40), t: 0, max: 0.35, size: 5, color: '255,200,150' });
    if (t.k === 'swarm') {
      const sw = t.ref as Swarm, k = Math.max(1, Math.round(frac * 140));
      sw.n = Math.max(0, sw.n - k);
      this.texts.push({ x: t.x, y: t.y - 90, s: `虫 -${k}`, color: '#e8c070', t: 0, vy: -40 });
      if (sw.n <= 8) { sw.mode = 'recall'; g.toast('蚀金蛊群死伤惨重，飞回了灵兽袋。', 'warn'); }
      return;
    }
    const ref = t.ref; ref.hp = (ref.hp ?? 1) - frac;
    this.texts.push({ x: t.x + rand(-10, 10), y: t.y - 100, s: '-' + Math.max(1, Math.round(frac * 100)) + '%', color: '#ffb890', t: 0, vy: -50 });
    if (ref.hp > 0) return;
    if (t.k === 'summon') { ref.t = 0; this.texts.push({ x: t.x, y: t.y - 120, s: ref.kind === 'puppet' ? '傀儡碎裂' : '消散', color: '#d0c0a0', t: 0, vy: -30, big: true }); this.burstShards(t.x, t.y - 30, '200,190,170'); }
    else if (t.k === 'pet') { ref.hp = 0.4; ref.down = 18; g.toast(`${g.pets.active?.name ?? '灵宠'}受了重伤，退到你身后舔舐伤口。`, 'warn'); }
    else if (t.k === 'ally') { ref.hp = 0.25; ref.downT = 20; ref.bubble = { text: '我……先退下调息！', t: 2.5 }; g.toast(`${ref.d.name}身受重伤，暂退一旁调息。`, 'warn'); }
  }
  private updateEnemies(dt: number, stealth: boolean) {
    const g = this.game, p = g.player, T = g.terrain, h = g.hero;
    this.buildTanks(dt);
    const concealK = g.concealed ? 0.45 : 1;
    const playerSafe = this.safeAt(p.x, p.y);
    const vis = this.visRect();
    for (const e of this.U) {
      if (e.dead) continue;
      if (e.hideT > 0) continue;   // 土遁潜行（由追杀系统驱动）
      // 非宗门战编制的野生妖兽 / 无主劫修绝不在宗门领地或两军战区徘徊刷新
      const isWarActor = !!(e.tag?.startsWith('war:') || e.team?.startsWith('sw:') || e.team?.startsWith('sk:') || (e as any).warRos || (e as any).warForm || (e as any).warStandoff || (e as any).warSkirmish);
      if (!e.ally && !e.boss && !e.pursuer && !e.lairId && !e.npcId && !e.spar && !isWarActor && !e.aggro && !(e as any).departing) {
        if (this.mySectAt(e.x, e.y) || this.warZoneAt(e.x, e.y)) {
          if (isOutsideVisRect(e.x, e.y, vis, 160)) {
            if (e.ecoId !== undefined) this.eco.hibernateActor(e, g.time);
            e.gone = true;
            continue;
          }
          // 仍在视野内：转为退避离场，走/飞出屏外再休眠或退场，不凭空消失
          e.aggro = false; (e as any).departing = true; (e as any).noP = true; e.retreatT = 18;
          if (e.realm >= 2) e.dun = Math.max(e.dun, 0.8);
        }
      }
      if (dt > 0) {   // 第三十八步：实际移动速度（平滑），瞬移 / 遁走时清零
        if (e.lpx === e.lpx) { const vx = (e.x - e.lpx) / dt, vy = (e.y - e.lpy) / dt; if (Math.abs(vx) + Math.abs(vy) > 3000) { e.mvx = e.mvy = 0; } else { const k = Math.min(1, dt * 6); e.mvx += (vx - e.mvx) * k; e.mvy += (vy - e.mvy) * k; } }
        e.lpx = e.x; e.lpy = e.y;
      }
      e.anim.t += dt;
      e.anim.hit = Math.max(0, e.anim.hit - dt * 4);
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      this.tickStatuses(e.st, dt, (d) => { const next = e.hp - d; if (!Number.isFinite(e.hp) || !Number.isFinite(next)) return; e.hp = next; if (Math.random() < dt * 2) this.texts.push({ x: e.x + rand(-10, 10), y: e.y - 70, s: String(Math.max(1, Math.round(d * 0.5 / dt * 0.5))), color: e.st.poison ? '#9ad060' : '#ff9a50', source: e, t: 0, vy: -40 }); });
      if (e.hp <= 0) { if (e.ally || (e.grudge && e.grudgeT > e.lastHitBy)) this.npcKill(e, e.grudge); else this.kill(e); continue; }   // 第三十九步：烧死 / 毒死的算最后下手的人
      if ((e as any).shell) { e.anim.move = 0; continue; }   // v0.54.2：出窍后盘坐的肉身（由 npcshen 驱动）
      const frozen = !!(e.st.freeze || e.st.stun || e.st.shock);
      const rooted = frozen || !!e.st.root || e.sup >= 2;   // 第四十一步：被镇压者寸步难行
      const wf = (e as any).warForm;
      const inWf = !!(wf && !wf.collapsed && wf.soldiers > 0);
      if (inWf) { e.hx = wf.x; e.hy = wf.y; e.dun = 0; e.flee = false; (e as any).departing = false; }
      // 第三十九步：同阵修士只找敌人；带派系的敌人在你隐匿 / 入城时照样彼此厮杀
      let tg: Tank;
      if (e.ally) {
        const t = this.pickTank(e, dt);
        e.aggro = !!t;
        tg = t ?? ((e as any).warSkirmish ? { k: 'decoy', x: e.hx, y: e.hy, w: 1 } : this.tanks[0]);
      }
      else {
        const pt = e.aggro && !e.spar ? this.pickTank(e, dt, stealth || playerSafe) : null;
        // v0.54：不冲你来的人没了对手就收手，不会转头来打你（集结进军中的前线交锋弟子先向集结点推进）
        if (!pt && e.aggro && (e as any).noP && !(e as any).warSkirmish) e.aggro = false;
        tg = pt ?? ((e as any).warSkirmish ? { k: 'decoy', x: e.hx, y: e.hy, w: 1 } : e.aggro && !e.spar ? this.tanks[0] : this.decoy ? { k: 'decoy', x: this.decoy.x, y: this.decoy.y, w: 99 } : this.tanks[0]);
      }
      e.tgP = tg.k !== 'foe'; e.tgE = tg.k === 'foe' ? tg.ref : undefined;
      // 修士/妖兽法力自然回充与调息计数
      if (!frozen && e.maxMp > 0) {
        if (e.medT > 0) e.medT = Math.max(0, e.medT - dt);
        e.mp = Math.min(e.maxMp, e.mp + e.mpRegen * (e.medT > 0 ? 2.5 : 1) * dt);
      }
      const tx = tg.x, ty = tg.y;
      const dx = tx - e.x, dy = ty - e.y, dist = Math.hypot(dx, dy);
      // 第十八步：沉睡的守护兽 —— 贴得太近（敛息时近得多）才会惊醒；相争的妖兽眼里只有对手
      if (e.sleep) {
        if (!stealth && dist < 230 * concealK) { e.sleep = false; e.aggro = true; this.texts.push({ x: e.x, y: e.y - 120, s: '惊醒！', color: '#ffb080', source: e, t: 0, vy: -26, big: true }); }
        else { e.anim.move = 0; continue; }
      }
      if (e.busy && !e.aggro && !inWf) continue;
      if (e.ally) { /* 同阵修士：不走察觉 / 脱战那一套 */ }
      else {
      // 察觉
      const aggroR = (e.def.aggro ?? 480) * concealK * (e.realm > h.realm ? 1.3 : 1);
      const bh = e.def.behave;
      const wildFree = !e.ally && !e.provoked && !e.boss && !e.pursuer && !e.wing && !e.tag && !(e as any).warRos && !(e as any).warSkirmish && !e.spar && !(e as any).extort;
      const lowRealmNoAggro = !g.concealed && wildFree && e.realm < h.realm;
      // 常态与神识外放状态下分级反应：
      // · 仅在神识外放威压（senseBurstT > 0）或已交恶/敌对时，低两境及以上才会惊恐求饶逃命；
      // · 常态非敌对下最多礼貌退避，不无故喊「饶命」；低一境者亦不主动扑咬玩家。
      if (!g.concealed && wildFree && !e.busy && !(e as any).departing) {
        if (h.realm - e.realm >= 2 && !e.cowered && dist < Math.max(aggroR * 1.4, Math.min(g.senseRadius, 1200))) {
          const panicked = g.senseBurstT > 0 || e.aggro || e.provoked;
          if (panicked) e.cowered = true;
          e.flee = panicked; e.aggro = false; e.retreatT = panicked ? 30 : 20; (e as any).departing = true; (e as any).noP = true;
          if (e.realm >= 2) e.dun = 1;
          if (enemyPerceptibility(e, p.x, p.y, g.detailSenseRadius, g.senseBurstT > 0) > 0.05) {
            const line = panicked
              ? (e.def.kind === 'human' ? '前辈饶命！快逃！' : '呜……逃！')
              : (e.def.kind === 'human' ? '前辈法驾，晚辈先行退避。' : undefined);
            if (line) this.texts.push({ x: e.x, y: e.y - 125, s: line, color: '#ffe0b0', source: e, t: 0, vy: -22 });
          }
        } else if (e.realm < h.realm && e.aggro && e.tgP) {
          // 低境界修士/妖兽在察觉玩家更高境界后不主动继续扑咬玩家
          e.aggro = false;
        }
      }
      // 见人即逃：察觉后不交战，只顾逃窜（受伤亦然）
      if (bh === 'flee' && !e.flee && !stealth && (dist < aggroR * 1.15 || e.hp < e.maxHp)) { e.flee = true; e.aggro = true; this.texts.push({ x: e.x, y: e.y - 70, s: '逃！', color: '#e8d8a8', source: e, t: 0, vy: -30 }); }
      if (bh === 'flee' && e.flee && dist > 1400) { const seen = preciseActorVisible(g, e); e.flee = false; e.aggro = false; e.dead = true; e.deathT = 0.8; if (seen) g.toast(`${e.name}${e.def.id === 'tujia' ? '钻入地下' : '隐入草木'}，没了踪影。`, 'info'); continue; }
      // 土甲龙：重伤时土遁一次
      if (e.def.id === 'tujia' && !e.burrowed && e.hp < e.maxHp * 0.55) {
        e.burrowed = true; const a = Math.atan2(-dy, -dx) + rand(-0.6, 0.6), L = rand(520, 760);
        this.burstShards(e.x, e.y - 10, '190,160,110'); this.vfx.push({ kind: 'ring', x: e.x, y: e.y, r: 90, t: 0, dur: 0.6, color: '170,140,90' } as any);
        const nx = e.x + Math.cos(a) * L, ny = e.y + Math.sin(a) * L * 0.8;
        if (T.walkFactor(nx, ny) > 0) { e.x = nx; e.y = ny; this.burstShards(e.x, e.y - 10, '190,160,110'); this.texts.push({ x: e.x, y: e.y - 80, s: '土遁！', color: '#e0c890', source: e, t: 0, vy: -30 }); }
      }
      // v0.54：妖兽护领地——劫修、追兵、路过的修士闯进来照样扑上去（不再只盯着你）
      if (!e.aggro && e.def.kind !== 'human' && bh !== 'shy' && bh !== 'flee' && !e.minion && !(e as any).departing) {
        const E: any = e; E.terrT = (E.terrT ?? Math.random() * 0.5) - dt;
        if (E.terrT <= 0) {
          E.terrT = 0.5;
          const R2 = (e.def.aggro ?? 480) * 0.8;
          let tgt: Enemy | null = null, bd = R2;
          for (const o of this.U) { if (o === e || o.dead || o.spar || o.gone || (o as any).departing || o.def.kind !== 'human' || (o.hideT ?? 0) > 0) continue; const d = Math.hypot(o.x - e.x, o.y - e.y); if (d < bd) { bd = d; tgt = o; } }
          if (tgt) { e.aggro = true; e.grudge = tgt; e.grudgeT = this.game.time; e.tankRef = tgt; e.tankT = 0.8; this.texts.push({ x: e.x, y: e.y - 110, s: '吼！', color: '#ffb080', source: e, t: 0, vy: -26 }); }
        }
      }
      // 察觉与脱战使用同一硬边界，避免远离出生点时每帧“察觉→立即脱战”。
      const withinLeash = dist <= 2600 && Math.hypot(e.x - e.hx, e.y - e.hy) <= 3200;
      if (!e.aggro && !(e as any).departing && !lowRealmNoAggro && !stealth && !playerSafe && withinLeash && dist < aggroR && bh !== 'shy' && bh !== 'flee' && !(e as any).noP && !this.snub(e)) { e.aggro = true;
        if (bh === 'call' && !e.called) {
          e.called = true; e.flee = true;
          let n = 0; for (const o of this.enemies) if (o !== e && !o.dead && !o.aggro && o.def.kind !== 'human' && o.def.behave !== 'flee' && Math.hypot(o.x - e.x, o.y - e.y) < 1300) { o.aggro = true; n++; }
          this.texts.push({ x: e.x, y: e.y - 120, s: '啾——！', color: '#ffe080', source: e, t: 0, vy: -24, big: true });
          if (n) this.game.toast(`云翅鸟尖啸示警，附近 ${n} 头妖兽被惊动了！`, 'warn');
        }
        // 外圈只传递粗略气息；不可见时不生成精确的敌人台词。即使其他系统反复清仇恨也限频。
        if (e.def.kind === 'human' && g.time - e.threatTextTime >= 4 && enemyPerceptibility(e, p.x, p.y, g.detailSenseRadius, g.senseBurstT > 0) > 0.05) {
          e.threatTextTime = g.time;
          this.texts.push({ x: e.x, y: e.y - 110, s: ['留下储物袋！', '小子，找死！', '杀人夺宝！'][Math.floor(Math.random() * 3)], color: '#ffd0a0', t: 0, vy: -20, source: e });
        }
      }
      if (!inWf && !(e as any).warSkirmish && e.aggro && (((stealth || playerSafe) && e.tgP) || dist > 2600 || Math.hypot(e.x - e.hx, e.y - e.hy) > 3200)) e.aggro = false;
      }
      if (!inWf && !e.flee && e.def.kind === 'beast' && e.hp < e.maxHp * 0.15 && Math.random() < 0.01) e.flee = true;
      let mvx = 0, mvy = 0, sp = e.speed * (e.st.slow ? 0.5 : 1) * (e.sup === 1 ? ((e as any).supK ?? supSlow(e.realm)) : 1);
      if (e.blv >= 4 && e.aggro && !e.flee && e.def.kind !== 'human' && dist > 380) sp *= beastRush(e, dt);   // v0.60：高阶妖兽离得远时疾行
      // 高阶修士战前对峙期：稳住前线阵脚遥遥对峙，待兵阵接战后再入阵搏杀（被主动攻击则立刻破阵迎战）
      if ((e as any).warStandoff && !inWf) {
        mvx = 0; mvy = 0;
        e.windup = 0;
        const sf = ((e as any).warStandoffFace ?? (e.ally ? 1 : -1)) as number;
        e.facing = sf >= 0 ? 1 : -1;
        e.anim.atk = Math.max(0, e.anim.atk - dt * 3);
      } else if (frozen) { e.windup = 0; if (e.cast) this.foe.interrupt(e); }
      else if ((e as any).departing) {
        if ((e as any).returnCamp) {
          // 参战/巡哨归营弟子：径直飞/行回营门锚点 (hx, hy)，不因玩家在营地或远离而停下抽搐或提前消失
          const dhx = e.hx - e.x, dhy = e.hy - e.y, dh = Math.hypot(dhx, dhy);
          e.retreatT -= dt;
          if (dh <= 55 || e.retreatT <= -20) {
            if (dh <= 55 && Math.hypot(e.x - p.x, e.y - p.y) < 2600) {
              this.vfx.push({ kind: 'blinkfx', x: e.x, y: e.y, r: 42, t: 0, dur: 0.35, color: e.ally ? '170,225,255' : '220,210,190' });
            }
            e.gone = true;
            continue;
          }
          mvx = dhx / dh; mvy = dhy / dh;
          sp *= 1.25;
          if (e.realm >= 2) e.dun = Math.min(1, e.dun + dt * 3);
        } else {
          const dp = Math.hypot(e.x - p.x, e.y - p.y) || 1;
          mvx = (e.x - p.x) / dp; mvy = (e.y - p.y) / dp;
          sp *= e.retreatT <= 0 ? 1.45 : 1.18;
          if (e.realm >= 2) e.dun = Math.min(1, e.dun + dt * 3);
          e.retreatT -= dt;
          const offscreen = isOutsideVisRect(e.x, e.y, vis, 180);
          if ((offscreen && dp > Math.max(1450, g.senseRadius * 1.15)) || e.retreatT <= -25) {
            if (!offscreen) this.vfx.push({ kind: 'blinkfx', x: e.x, y: e.y, r: 54, t: 0, dur: 0.4, color: '200,230,255' });
            e.gone = true;
            continue;
          }
        }
      }
      else if ((e as any).warSkirmish && tg.k === 'decoy' && dist > 110) {
        // 局部交锋双方尚未照面前，统一步向集结点急行赶赴接战，不对空靶虚空放术
        mvx = dx / dist; mvy = dy / dist;
        if (dist > 1100) sp *= 1.65;
        if (e.realm < 2 || (e as any).noFly || e.sup > 0) e.dun = Math.max(0, e.dun - dt * 2);
        else e.dun = Math.min(1, e.dun + dt * 3);
      }
      else if (e.flee) { mvx = -dx / (dist || 1); mvy = -dy / (dist || 1); sp *= 1.2; if (dist > 1500) { e.flee = false; e.aggro = false; } }
      else if (e.aggro) {
        e.cdMelee -= dt; e.cdRanged -= dt;
        const m = e.def.melee, r = e.def.ranged;
        const rCost = r && e.def.kind === 'human' && e.maxMp > 0 ? Math.max(4, Math.round((4 + e.realm * 5) * (r.power ?? 1))) : 0;
        // 第三十二步：心智——走位 / 遁光 / 撤退 / 包抄（busy 时本帧只顾走位）
        this.mind.assignRole(e);
        if (e.affix) affixTick(this, e, dt, dist);
        const ov = this.mind.tick(e, dt, tx, ty, dist, rooted, tg.k === 'p');
        if (ov?.busy) { mvx = ov.mx; mvy = ov.my; sp *= ov.sp; }
        else {
        // 闪避：看见迎面飞来的法术，侧身一闪（妖兽二级以上 / 修士；方阵统帅守在将台不横跳出阵）
        e.dodgeCd -= dt;
        if (!inWf && e.dodgeCd <= 0 && !e.cast && !rooted && (e.blv >= 2 || e.def.kind === 'human' || e.realm >= 2)) {
          e.dodgeCd = 0.25;
          for (const pr of this.projs) {
            if (pr.fac !== 'p' || pr.homing || pr.hit.has(e.id)) continue;
            const rx = e.x - pr.x, ry = e.y - 30 - pr.y, rd = Math.hypot(rx, ry);
            if (rd > 280 || rd < 30) continue;
            const sp = Math.hypot(pr.vx, pr.vy) || 1;
            if ((rx * pr.vx + ry * pr.vy) / (rd * sp) < 0.92) continue;
            e.dodgeCd = rand(2.5, 4.5) / (1 + e.rage * 0.3);
            if (Math.random() < (isBoss(e) ? 0.45 : e.def.kind === 'human' ? 0.4 : 0.28)) {
              const side = Math.random() < 0.5 ? 1 : -1;
              e.kx += -pr.vy / sp * side * 620; e.ky += pr.vx / sp * side * 420;
              if (this.U.length < 10) this.texts.push({ x: e.x, y: e.y - 110, s: '闪', color: '#d8e8ff', source: e, t: 0, vy: -40 });
              this.sparks.push({ x: e.x, y: e.y - 40, vx: pr.vy / sp * side * 200, vy: -pr.vx / sp * side * 120, t: 0, max: 0.3, size: 6, color: '220,230,255' });
            }
            break;
          }
        }
        const effR = r ? (inWf ? Math.max(r.range, 1050) : r.range) : 0;
        if (tg.k === 'decoy' && (e as any).warSkirmish) {
          if (dist > 110) { mvx = dx / dist; mvy = dy / dist; }
        } else if (!e.flee && this.foe.tick(e, dt, tx, ty, dist)) { e.windup = 0; }
        else if (e.windup > 0) {
          e.windup -= dt; e.anim.atk = 1 - e.windup / 0.4;
          if (e.windup <= 0) {
            e.anim.atk = 0;
            if (m && dist < m.range + 40) this.tankHit(tg, e.atk * m.power, e.realm, m.status, e.x, e.y, e);
          }
        } else if (m && dist < m.range && e.cdMelee <= 0) { e.windup = 0.4; e.cdMelee = m.cd; }
        else if (r && dist < effR && dist > (m ? m.range * 1.2 : 0) && e.cdRanged <= 0 && e.medT <= 0 && (rCost === 0 || e.mp >= rCost)) {
          if (rCost > 0) e.mp = Math.max(0, e.mp - rCost);
          e.cdRanged = (e.def.kind === 'human' ? Math.max(r.cd, 2.0) : r.cd) * rand(0.95, 1.3);
          e.anim.atk = 0.5;
          const n = r.count ?? 1;
          // 第三十二步：提前量——二级以上妖兽与修士会算你的走位
          let ax = tx, ay = ty;
          if (tg.k === 'p' && (e.blv >= 2 || e.def.kind === 'human' || e.realm >= 2)) { const lt = Math.min(1.2, dist / (r.speed ?? 500)) * (0.6 + Math.random() * 0.35); ax += p.st.vx * lt; ay += p.st.vy * lt; }
          else if (e.tgE && (e.def.kind === 'human' || e.realm >= 2)) { const lt = Math.min(1.2, dist / (r.speed ?? 500)) * 0.7; ax += e.tgE.mvx * lt; ay += e.tgE.mvy * lt; }
          for (let i = 0; i < n; i++) {
            const ang = Math.atan2(ay - 40 - (e.y - 40), ax - e.x) + (n > 1 ? (i / (n - 1) - 0.5) * 0.5 : 0);
            const spd = r.speed ?? 500;
            this.projs.push({ fac: 'e', x: e.x, y: e.y - (e.anim.flying ? 70 : 40), vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 0, max: effR / spd + 0.2, fx: r.fx, color: r.color, dmg: e.atk * r.power, realm: e.realm, status: r.status, stCh: r.status?.ch ?? 0, pierce: false, homing: false, hit: new Set(), r: 26, aoe: r.radius ?? 0, size: 0.9, trail: [], lv: 0, tk: tg.k === 'p' || tg.k === 'decoy' ? undefined : (tg.ref ?? tg.k), src: e, ally: e.ally });
          }
        } else if (!inWf) {
          if (r && !m && rCost > 0 && e.mp < rCost && e.medT <= 0 && e.cdRanged <= 0) {
            e.medT = 2.0;
            this.texts.push({ x: e.x, y: e.y - 105, s: '调息回灵', color: '#9ed4ff', source: e, t: 0, vy: -22 });
          }
          // 追击 / 按职责分环扇区占位，免得所有人在一条线上堆成团
          e.slotA ??= (((e.id * 9301) % 1) + 1) % 1 * TAU;
          const roleRing = e.role === 'support' ? 370 : e.role === 'ranged' ? 290 : 95;
          const want = r && !m ? Math.min(r.range * 0.72, Math.max(220, roleRing)) : (m?.range ?? 60) * 0.85;
          if (e.def.kind === 'human' && this.U.length >= 4 && !e.boss) {
            const sx = tx + Math.cos(e.slotA) * want;
            const sy = ty + Math.sin(e.slotA) * want * 0.76;
            const sdx = sx - e.x, sdy = sy - e.y, sd = Math.hypot(sdx, sdy);
            if (sd > 48) { mvx = sdx / sd; mvy = sdy / sd; }
            else if (r && !m && dist < want * 0.55) { mvx = -dx / (dist || 1) * 0.65; mvy = -dy / (dist || 1) * 0.65; }
          } else {
            if (dist > want) {
              mvx = dx / dist; mvy = dy / dist;
              if (m && dist > want * 1.6 && dist < 700) { const off = ((e.id % 5) - 2) * 0.45 * Math.min(1, (dist - want) / 300), cs = Math.cos(off), sn = Math.sin(off); const ax = mvx * cs - mvy * sn; mvy = mvx * sn + mvy * cs; mvx = ax; }
            }
            else if (r && !m && dist < want * 0.6) { mvx = -dx / dist * 0.6; mvy = -dy / dist * 0.6; }
          }
          // 侧移（纯远程冷却期亦持续绕翼走位，不僵立当木桩）
          if (r && !m) {
            const side = Math.sin(e.anim.t * 1.15 + e.id * 10);
            const wSide = (e.cdRanged > 0 || e.medT > 0) ? 0.65 : 0.45;
            mvx += -dy / (dist || 1) * side * wSide;
            mvy += dx / (dist || 1) * side * wSide;
            const ml = Math.hypot(mvx, mvy);
            if (ml > 1) { mvx /= ml; mvy /= ml; }
          }
        }
        if (ov) { const w = ov.w; mvx = mvx * (1 - w) + ov.mx * w; mvy = mvy * (1 - w) + ov.my * w; sp *= ov.sp; }
        }
        if (e.windup <= 0 && !e.cast) e.anim.atk = Math.max(0, e.anim.atk - dt * 3);
      } else if (!inWf) {
        if (e.realm < 2 || (e as any).noFly || e.sup > 0) e.dun = Math.max(0, e.dun - dt * 2);
        else if (e.ally) e.dun = Math.min(1, e.dun + dt * 3);
        // 第三十九步：同阵亲卫/随行修士没仗可打时按各自扇区列在身侧，不挤在一点（营地交锋弟子不绕玩家转圈）
        if (e.ally && !(e as any).warSkirmish && !(e as any).returnCamp) {
          e.slotA ??= (((e.id * 9301) % 1) + 1) % 1 * TAU;
          const ax = p.x + Math.cos(e.slotA) * 260, ay = p.y + Math.sin(e.slotA) * 200;
          e.hx = ax; e.hy = ay;
          const fd = Math.hypot(ax - e.x, ay - e.y);
          if (fd > 145) { mvx = (ax - e.x) / fd; mvy = (ay - e.y) / fd; sp *= fd > 850 ? 2.6 : 1.25; if (e.def.kind === 'human' && fd > 850) e.dun = 1; }
        } else if (e.ally && ((e as any).warSkirmish || (e as any).returnCamp)) {
          const fd = Math.hypot(e.hx - e.x, e.hy - e.y);
          if (fd > 110) { mvx = (e.hx - e.x) / fd; mvy = (e.hy - e.y) / fd; }
        } else {
        // 游荡；正常状态未敛息时，低一境远远离开、同境低阶害怕绕道
        const dp = Math.hypot(e.x - p.x, e.y - p.y) || 1;
        const awareFree = !g.concealed && !e.provoked && !e.boss && !e.pursuer && !e.wing && !e.tag && !(e as any).warRos && !e.spar && e.def.behave !== 'shy';
        if (awareFree && h.realm - e.realm === 1 && dp < 950) {
          mvx = ((e.x - p.x) / dp) * 0.9;
          mvy = ((e.y - p.y) / dp) * 0.9;
        } else if (awareFree && h.realm === e.realm && h.stage > e.stage && dp < 440) {
          const ox = (e.x - p.x) / dp, oy = (e.y - p.y) / dp;
          const side = (e.id % 2 === 0 ? 1 : -1);
          mvx = -oy * side * 0.72 + ox * 0.35;
          mvy = ox * side * 0.72 + oy * 0.35;
        } else {
          e.wanderT -= dt;
          if (e.wanderT <= 0) { e.wanderT = rand(2, 5); const a = Math.random() * TAU; e.wx = Math.random() < 0.4 ? 0 : Math.cos(a); e.wy = Math.random() < 0.4 ? 0 : Math.sin(a); if (Math.hypot(e.x - e.hx, e.y - e.hy) > 500) { e.wx = (e.hx - e.x) / 500; e.wy = (e.hy - e.y) / 500; } }
          mvx = e.wx * 0.35; mvy = e.wy * 0.35;
        }
        }
      }
      // 宗门大战方阵统帅（阵眼）：与方阵步调完全同步（稳坐中军将台，随阵齐步/同转/齐射，消除来回抽搐）
      let wfDcd = 0;
      const wfAng = inWf ? (wf.faceAng !== undefined ? wf.faceAng : (wf.face < 0 ? Math.PI : 0)) : 0;
      const wfFx = Math.cos(wfAng), wfFy = Math.sin(wfAng);
      if (inWf) {
        e.kx *= 0.25; e.ky *= 0.25;
        if (!frozen && !rooted) {
          const cx = wf.x + wfFx * 8, cy = wf.y + wfFy * 6;
          const dcx = cx - e.x, dcy = cy - e.y;
          wfDcd = Math.hypot(dcx, dcy);
          if (wfDcd > 28) {
            mvx = dcx / wfDcd; mvy = dcy / wfDcd;
            const wantSp = Math.max(sp, Math.min(540, Math.max(200, wfDcd * 6)));
            sp = dt > 0 ? Math.min(wantSp, wfDcd / dt) : wantSp;
          } else {
            const blend = Math.min(1, dt * 10);
            e.x += dcx * blend;
            e.y += dcy * blend;
            mvx = 0; mvy = 0;
          }
        }
      }
      // 加权互相避让（115px 间距，重合时按确定性角度推散；施法读条者稳住，走位者绕行；方阵统帅与归营队列不被挤飞抽搐）
      const sepR = 115;
      const sepSelfW = (e.cast || e.windup > 0) ? 0.35 : 1.35;
      if (!inWf && !(e as any).returnCamp) for (const o of this.U) {
        if (o === e || o.dead) continue;
        const ox = e.x - o.x, oy = e.y - o.y;
        if (ox > sepR || ox < -sepR || oy > sepR || oy < -sepR) continue;
        const d = Math.hypot(ox, oy);
        if (d < sepR) {
          const k = (sepR - d) / sepR;
          if (d <= 0.5) {
            const ang = e.id * 97.3;
            mvx += Math.cos(ang) * sepSelfW * 1.4;
            mvy += Math.sin(ang) * sepSelfW * 1.4;
          } else {
            mvx += (ox / d) * k * sepSelfW * 1.35;
            mvy += (oy / d) * k * sepSelfW * 1.35;
          }
        }
      }
      // 不进城镇
      if (rooted) { mvx = 0; mvy = 0; }
      const nx = e.x + (mvx * sp + e.kx) * dt, ny = e.y + (mvy * sp + e.ky) * dt;
      e.kx *= Math.pow(0.02, dt); e.ky *= Math.pow(0.02, dt);
      const ok = e.def.flying || (e.sea ? !T.isLand(nx, ny) : T.walkFactor(nx, ny) > 0);
      if (inWf || (ok && !this.safeAt(nx, ny))) { e.x = nx; e.y = ny; }
      if (e.x !== e.x || e.y !== e.y) { e.x = e.hx; e.y = e.hy; e.kx = e.ky = 0; }   // 防御：坐标坏了就拉回原处，免得整帧绘制报错
      const wfMoving = inWf && (!!wf.moving || wfDcd > 28);
      const wfVolley = inWf && wf.lastVolleyT !== undefined && this.game.time - wf.lastVolleyT >= 0 && this.game.time - wf.lastVolleyT < 0.48;
      const mv = inWf ? (wfMoving ? 0.85 : 0) : Math.hypot(mvx, mvy);
      e.anim.move += ((mv > 0.05 ? Math.min(1, mv * 1.4) : 0) - e.anim.move) * Math.min(1, dt * 6);
      e.anim.phase += dt * sp / 18 * e.anim.move;
      if (inWf) {
        if (Math.abs(wfFx) > 0.16) e.facing = wfFx > 0 ? 1 : -1;
      } else if (Math.abs(mvx) > 0.1) e.facing = mvx > 0 ? 1 : -1;
      else if (e.aggro) e.facing = dx > 0 ? 1 : -1;
      const flyCapable = e.def.kind === 'human' && e.realm >= 2 && !(e as any).noFly;
      const flyRestricted = inWf || frozen || rooted || e.sup > 0 || !!(e as any).warStandoff || !!(e as any).noFly;
      const shouldFly = flyCapable && !flyRestricted && (mv > 0.05 || e.aggro || e.flee || !!(e as any).departing || e.dun > 0.3);
      if (shouldFly) e.dun = 1;
      if (e.def.kind === 'human') e.flyH += (((shouldFly || (e.dun > 0.3 && !flyRestricted)) ? 94 : 0) - e.flyH) * Math.min(1, dt * 6);
      if (e.cs) {
        e.cs.x = e.x; e.cs.y = e.y; e.cs.lift = e.flyH; e.cs.speed = mv * sp; e.cs.vx = mvx * sp; e.cs.vy = mvy * sp;
        if (inWf) {
          if (e.cast && e.aggro) e.cs.faceToward(dx, dy, false);
          else e.cs.faceToward(wfFx, wfFy, false);
        } else {
          if (mv > 0.05) e.cs.faceToward(mvx, mvy, false);
          else if (e.aggro) e.cs.faceToward(dx, dy, false);
        }
        const actionFly = shouldFly || e.flyH > 12;
        e.cs.setAction(frozen ? 'hit' : (e.anim.atk > 0.1 || wfVolley) ? 'cast' : actionFly ? 'fly' : mv > 0.05 ? (!inWf && e.aggro ? 'run' : 'walk') : 'idle');
        const farIdle = !e.aggro && !e.ally && !e.windup && e.flyH <= 0 && dist > 1500;
        if (farIdle) {
          const acc = ((e as any)._csAcc ?? 0) + dt;
          const cad = dist > 3000 ? 4 : 2;
          if (((Math.floor(this.game.time * 60) + (e.x | 0)) % cad) === 0) {
            (e as any)._csAcc = 0;
            e.cs.update(acc);
          } else {
            (e as any)._csAcc = acc;
          }
        } else {
          (e as any)._csAcc = 0;
          e.cs.update(dt);
        }
      }
    }
  }

  private updateProjs(dt: number) {
    const g = this.game, p = g.player;
    this.projs = this.projs.filter((pr) => {
      pr.life += dt;
      if (pr.life > pr.max) { if (pr.aoe && pr.fac === 'p') this.explode(pr); return false; }
      // 追踪
      if (pr.homing && pr.fac === 'p') {
        if (pr.target && (pr.target.dead || pr.target.hideT > 0 || this.isShieldedFormUnit(pr.target))) pr.target = null;
        if (!pr.target && (!pr.targetForm || !this.formValid(pr.targetForm))) {
          pr.target = this.nearest(pr.x, pr.y, 520, pr.hit);
          if (!pr.target) {
            if (this.shipValid(this.lockAirship)) (pr as any).targetShip = this.lockAirship;
            else {
              pr.targetForm = this.game.sectwar?.nearestFoeFormation(pr.x, pr.y, 520) ?? null;
              if (!pr.targetForm) (pr as any).targetShip = this.game.sectwar?.nearestFoeAirship(pr.x, pr.y, 640) ?? null;
            }
          }
        }
        let aimX: number | null = null, aimY: number | null = null;
        const tgtShip = (pr as any).targetShip;
        if (pr.target) { aimX = pr.target.x; aimY = pr.target.y - 30; }
        else if (this.shipValid(tgtShip)) { aimX = tgtShip.x; aimY = tgtShip.y - tgtShip.zLift * 0.72; }
        else if (pr.targetForm && this.formValid(pr.targetForm)) {
          const pt = this.game.sectwar!.formationClosestPoint(pr.targetForm, pr.x, pr.y);
          aimX = pt.x; aimY = pt.y - 24;
        }
        if (aimX !== null && aimY !== null) {
          const sp = Math.hypot(pr.vx, pr.vy);
          const want = Math.atan2(aimY - pr.y, aimX - pr.x), cur = Math.atan2(pr.vy, pr.vx);
          let da = want - cur; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
          const na = cur + clamp(da, -dt * 5, dt * 5);
          pr.vx = Math.cos(na) * sp; pr.vy = Math.sin(na) * sp;
        }
      }
      pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      const tMax = (pr as any).trailLen ?? 14;
      pr.trail.push([pr.x, pr.y]); if (pr.trail.length > tMax) pr.trail.shift(); { const tl = pr.trail; const lim = ((pr as any).fromForm ? 120 : 240) * pr.size; while (tl.length > 2 && Math.hypot(tl[0][0] - pr.x, tl[0][1] - pr.y) > lim) tl.shift(); }
      const fromForm = !!(pr as any).fromForm;
      if (!fromForm || (this.projs.length <= 24 && this.sparks.length < 140)) {
        if (pr.fx === 'fireball' || pr.fx === 'firesnake' || pr.fx === 'crow' || pr.fx === 'blood' || pr.fx === 'talisman') {
          if (this.sparks.length < 240 && Math.random() < (fromForm ? 0.25 : 0.7)) {
            this.sparks.push({ x: pr.x + rand(-6, 6), y: pr.y + rand(-6, 6), vx: rand(-20, 20), vy: rand(-50, -10), t: 0, max: rand(0.3, 0.6), size: rand(2, 5) * pr.size, color: pr.color });
          }
        }
      }
      if (pr.fac === 'p') {
        const hitShip = this.game.sectwar?.hitAirshipByProj?.(pr);
        if (hitShip) {
          this.game.sectwar?.onPlayerAggressiveAtFront?.(pr.x, pr.y);
          if (pr.aoe) { this.explode(pr); return false; }
          if (!pr.pierce) {
            this.vfx.push({ kind: 'flash', x: pr.x, y: pr.y, r: 42 * pr.size, t: 0, dur: 0.34, color: pr.color, fx: pr.fx, seed: Math.random() * 6 });
            return false;
          }
        }
        const hitF = this.game.sectwar?.hitFormationByProj?.(pr);
        if (hitF) {
          this.game.sectwar?.onPlayerAggressiveAtFront?.(pr.x, pr.y);
          if (pr.aoe) { this.explode(pr); return false; }
          if (!pr.pierce) {
            this.vfx.push({ kind: 'flash', x: pr.x, y: pr.y, r: 38 * pr.size, t: 0, dur: 0.34, color: pr.color, fx: pr.fx, seed: Math.random() * 6 });
            return false;
          }
        }
        for (const e of this.enemies) {
          if (e.dead || pr.hit.has(e.id) || this.isShieldedFormUnit(e)) continue;
          const ey = e.y - (e.anim.flying ? 70 : 30);
          if (Math.hypot(e.x - pr.x, ey - pr.y) < pr.r + 28) {
            pr.hit.add(e.id);
            this.hitEnemy(e, pr.dmg, pr, pr.x, pr.y);
            if (pr.aoe) { this.explode(pr); return false; }
            if (!pr.pierce) { this.vfx.push({ kind: 'flash', x: pr.x, y: pr.y, r: 40 * pr.size, t: 0, dur: 0.38, color: pr.color, fx: pr.fx, seed: Math.random() * 6 }); return false; }
          }
        }
        // 慢速持续弹道：周期性清除已命中记录
        if (pr.pierce && (pr.fx === 'tornado' || pr.fx === 'water' || pr.fx === 'dragon')) { pr.tick = (pr.tick ?? 0) + dt; if (pr.tick > 0.4) { pr.tick = 0; pr.hit.clear(); (pr as any).hitForm?.clear(); (pr as any).hitShip?.clear(); } }
      } else {
        if ((pr as any).fromForm || (pr as any).fromShip || pr.targetForm) {
          const hitS = this.game.sectwar?.hitAirshipByProj?.(pr, pr.ally ? 'foe' : 'ours');
          if (hitS && !pr.pierce) {
            this.vfx.push({ kind: 'flash', x: pr.x, y: pr.y, r: 34, t: 0, dur: 0.3, color: pr.color, fx: pr.fx, seed: Math.random() * 6 });
            return false;
          }
          const hitF = this.game.sectwar?.hitFormationByProj?.(pr, pr.ally ? 'foe' : 'ours');
          if (hitF && !pr.pierce) {
            this.vfx.push({ kind: 'flash', x: pr.x, y: pr.y, r: 30, t: 0, dur: 0.28, color: pr.color, fx: pr.fx, seed: Math.random() * 6 });
            return false;
          }
        }
        if (pr.tk instanceof Enemy) {   // 第三十九步：打向别的 NPC 的法术
          const o = pr.tk;
          if (!o.dead && !this.isShieldedFormUnit(o) && Math.hypot(o.x - pr.x, o.y - (o.anim.flying ? 70 : 30) - pr.y) < pr.r + 30) { this.npcHit(pr.src, o, pr.dmg, pr.realm, pr.status, pr.x, pr.y); this.vfx.push({ kind: 'flash', x: pr.x, y: pr.y, r: 30, t: 0, dur: 0.3, color: pr.color, fx: pr.fx, seed: Math.random() * 6 }); return false; }
        } else if (pr.tk !== undefined) {
          const t = this.tanks.find((x) => (x.ref ?? x.k) === pr.tk);
          if (t && Math.hypot(t.x - pr.x, t.y - 40 - pr.y) < pr.r + 30) { this.tankHit(t, pr.dmg, pr.realm, pr.status, pr.x, pr.y); this.vfx.push({ kind: 'flash', x: pr.x, y: pr.y, r: 30, t: 0, dur: 0.3, color: pr.color, fx: pr.fx, seed: Math.random() * 6 }); return false; }
        }
        // 混战：法术飞过别派的人也会打中他
        if (this.melee && pr.src) for (const o of this.U) {
          if (o === pr.src || o.dead || pr.hit.has(o.id) || this.isShieldedFormUnit(o) || !this.hostile(pr.src, o)) continue;
          if (Math.hypot(o.x - pr.x, o.y - (o.anim.flying ? 70 : 30) - pr.y) < pr.r + 26) { this.npcHit(pr.src, o, pr.dmg, pr.realm, pr.status, pr.x, pr.y); this.vfx.push({ kind: 'flash', x: pr.x, y: pr.y, r: 30, t: 0, dur: 0.3, color: pr.color, fx: pr.fx, seed: Math.random() * 6 }); return false; }
        }
        if (pr.ally || (pr.src as any)?.noP) return true;   // 同阵修士或旁观小阵试探的法术不伤你
        if (Math.hypot(p.x - pr.x, p.y - 46 - pr.y) < pr.r + 24) {
          if (pr.aoe) this.vfx.push({ kind: 'ring', x: pr.x, y: pr.y + 40, r: pr.aoe, t: 0, dur: 0.4, color: pr.color, fx: pr.fx });
          this.hitPlayer(pr.dmg, pr.realm, pr.status, pr.x, pr.y, pr.src);
          this.vfx.push({ kind: 'flash', x: pr.x, y: pr.y, r: 34, t: 0, dur: 0.36, color: pr.color, fx: pr.fx, seed: Math.random() * 6 });
          return false;
        }
        // 环绕剑盾格挡
        if (this.orbit && Math.hypot(p.x - pr.x, p.y - 40 - pr.y) < this.orbit.r + 10 && Math.random() < 0.5) { this.vfx.push({ kind: 'flash', x: pr.x, y: pr.y, r: 30, t: 0, dur: 0.2, color: this.orbit.color }); return false; }
      }
      return true;
    });
  }

  private explode(pr: Proj) {
    this.vfx.push({ kind: 'ring', x: pr.x, y: pr.y + 30, r: pr.aoe, t: 0, dur: 0.4, color: pr.color, fx: pr.fx });
    this.burstShards(pr.x, pr.y, pr.color);
    for (const e of this.enemies) if (!e.dead && !pr.hit.has(e.id) && !this.isShieldedFormUnit(e) && Math.hypot(e.x - pr.x, e.y - 30 - pr.y) < pr.aoe + 20) this.hitEnemy(e, pr.dmg * 0.6, pr, pr.x, pr.y);
    this.game.sectwar?.damageFormationArea(pr.x, pr.y, pr.aoe, pr.dmg * 0.85, 'foe', pr.realm, pr.school);
    this.game.sectwar?.damageAirshipArea(pr.x, pr.y, pr.aoe, pr.dmg * 0.9, 'foe', pr.realm);
  }

  private updateFields(dt: number) {
    const g = this.game, p = g.player, h = g.hero;
    this.fields = this.fields.filter((f) => {
      f.t += dt; f.tick -= dt;
      if (f.follow) { const e = this.nearest(f.x, f.y, 400, new Set()); if (e) { f.x += (e.x - f.x) * dt * 0.8; f.y += (e.y - f.y) * dt * 0.8; } }
      if (f.tick <= 0) {
        f.tick = 0.5;
        if (f.heal) { if (Math.hypot(p.x - f.x, p.y - f.y) < f.r) { h.hp = Math.min(1, h.hp + 0.02 * (1 + f.lv * 0.3)); h.mp = Math.min(1, h.mp + 0.03 * (1 + f.lv * 0.3)); } }
        else if (f.dmg > 0) this.aoe(f.x, f.y, f.r, f.dmg, { realm: f.realm, status: f.status, stCh: f.stCh, school: f.school, evil: f.evil });
      }
      return f.t < f.dur;
    });
  }

  private updateSummons(dt: number) {
    const g = this.game, p = g.player, h = g.hero;
    // 第三十步：召唤物——随行队形（排在苏寒身后左右两翼）、追敌、按种类出手；消散 / 自爆有收尾
    const fwdX = Math.sin(p.st?.yaw ?? 0), fwdY = Math.cos(p.st?.yaw ?? 0);
    let idx = 0;
    this.summons = this.summons.filter((s) => {
      s.t -= dt; s.cd -= dt; s.age = (s.age ?? 0) + dt; s.atk = Math.max(0, (s.atk ?? 0) - dt * 2.6);
      const lv = s.lv ?? 0, slot = s.kind === 'bugs' ? 0 : idx++;
      const ranged = s.kind === 'fox' && lv >= 2;
      if (!s.target || s.target.dead || Math.hypot(s.target.x - p.x, s.target.y - p.y) > 900 || (s.target as any).spar) s.target = this.nearestFoe(s.x, s.y, p.x, p.y);
      const rawForm = !s.target ? (g.sectwar?.nearestFoeFormation(s.x, s.y, 900) ?? null) : null;
      const tgtForm = rawForm && (this.lockForm === rawForm || this.inCombat) ? rawForm : null;
      const formPt = tgtForm ? g.sectwar!.formationClosestPoint(tgtForm, s.x, s.y) : null;
      let tx: number, ty: number, reach: number;
      if (s.target) {
        const e = s.target, ang = Math.atan2(s.y - e.y, s.x - e.x), keep = ranged ? 240 : 52 * (s.big ?? 1);
        tx = e.x + Math.cos(ang) * keep; ty = e.y + Math.sin(ang) * keep * 0.6; reach = 14;
      } else if (formPt) {
        const ang = Math.atan2(s.y - formPt.y, s.x - formPt.x), keep = ranged ? 200 : 46 * (s.big ?? 1);
        tx = formPt.x + Math.cos(ang) * keep; ty = formPt.y + Math.sin(ang) * keep * 0.6; reach = 18;
      } else {
        // 队形：身后一排，两翼错开；绕着各自的站位缓缓游走
        const side = slot % 2 ? 1 : -1, row = Math.floor(slot / 2);
        const back = 85 + row * 55, lat = (55 + row * 25) * side;
        tx = p.x - fwdX * back + fwdY * lat * 0.9 + Math.sin(g.time * 0.7 + slot) * 10;
        ty = p.y - fwdY * back * 0.7 - fwdX * lat * 0.6 + 18 + Math.cos(g.time * 0.6 + slot) * 6;
        reach = 18;
      }
      let dx = tx - s.x, dy = ty - s.y, d = Math.hypot(dx, dy);
      if (d > 1500) { s.x = tx; s.y = ty; dx = dy = 0; d = 0; this.fxq.push({ k: 'sumpop', x: s.x, y: s.y, color: SUMMON_COLOR[s.kind] }); }
      const base = s.kind === 'bugs' ? 340 : s.kind === 'puppet' || s.kind === 'quhun' ? 230 : 280;
      const sp = Math.min(d * 4, base * (d > 320 ? 2.2 : d > 160 ? 1.4 : 1) * (g.isFlying ? 1.8 : 1));
      const moving = d > reach;
      s.mv = (s.mv ?? 0) + ((moving ? Math.min(1, sp / 200) : 0) - (s.mv ?? 0)) * Math.min(1, dt * 8);
      if (moving) { s.x += dx / d * sp * dt; s.y += dy / d * sp * dt; if (Math.abs(dx) > 3) s.facing = dx > 0 ? 1 : -1; s.phase += dt * Math.min(12, 4 + sp / 40); }
      else if (s.target) s.facing = s.target.x > s.x ? 1 : -1;
      else if (formPt) s.facing = formPt.x > s.x ? 1 : -1;
      if (s.cs) { s.cs.x = s.x; s.cs.y = s.y; s.cs.speed = moving ? sp : 0; s.cs.vx = moving ? dx / d * sp : 0; s.cs.vy = moving ? dy / d * sp : 0; if (d > 1) s.cs.faceToward(dx, dy, false); else if (s.target) s.cs.faceToward(s.target.x - s.x, s.target.y - s.y, false); else if (formPt) s.cs.faceToward(formPt.x - s.x, formPt.y - s.y, false); s.cs.setAction((s.atk ?? 0) > 0.45 ? 'cast' : moving ? 'run' : 'idle'); s.cs.update(dt); }
      const e = s.target;
      if (e && s.cd <= 0 && s.kind !== 'bugs') {
        const de = Math.hypot(e.x - s.x, e.y - s.y), range = ranged ? 330 : 95 * (s.big ?? 1);
        if (de < range) {
          s.cd = (s.kind === 'demon' ? 0.9 : s.kind === 'puppet' ? 1.25 : 1.1) * rand(0.9, 1.1);
          s.atk = 1; s.ax = e.x; s.ay = e.y; s.facing = e.x > s.x ? 1 : -1;
          const status: StatusSpec | undefined = s.kind === 'fox' ? { k: 'burn', dur: 3, ch: 0.3 } : s.kind === 'tihun' ? { k: 'stun', dur: 1, ch: 0.5 } : s.kind === 'quhun' && lv >= 1 ? { k: 'knock', dur: 0.3, ch: 0.6 } : s.kind === 'puppet' ? { k: 'stun', dur: 0.5, ch: 0.25 } : undefined;
          const src = { realm: h.realm, stCh: 0.3, status, school: (s.kind === 'fox' ? '火' : '御') as School, evil: s.evil };
          if (ranged) this.fxq.push({ k: 'foxfire', x: s.x, y: s.y - 40, x2: e.x, y2: e.y - 30, color: '150,200,255' });
          else this.fxq.push({ k: 'sumhit', x: e.x, y: e.y, x2: s.x, y2: s.y, kind: s.kind, big: (s.big ?? 1) > 1.2 });
          const mul = s.kind === 'fox' && lv >= 1 ? 1.25 : 1;
          if (ranged) { const tgt = e, dd = s.dmg * mul; this.later(0.22, () => { if (!tgt.dead) { this.hitEnemy(tgt, dd, src, tgt.x - 1, tgt.y); this.fxq.push({ k: 'sumhit', kind: 'foxland', x: tgt.x, y: tgt.y }); } }); }
          else if (s.kind === 'puppet') { for (const f of this.enemies) if (!f.dead && Math.hypot(f.x - e.x, (f.y - e.y) * 1.3) < 90) this.hitEnemy(f, s.dmg * (f === e ? 1 : 0.5), src, s.x, s.y); }
          else this.hitEnemy(e, s.dmg * mul, src, s.x, s.y);
          if (s.kind === 'tihun') { if (e.def.evil) h.mp = Math.min(1, h.mp + (lv >= 2 ? 0.05 : 0.03)); else if (lv >= 2) h.mp = Math.min(1, h.mp + 0.012); }
        }
      } else if (e && s.kind === 'bugs' && d < 60 && s.cd <= 0) { s.cd = 0.4; this.hitEnemy(e, s.dmg * (s.n / 14), { realm: h.realm, status: s.status, stCh: s.status?.ch ?? 0, school: '御' }, s.x, s.y); }
      else if (!e && formPt && s.cd <= 0) {
        const de = Math.hypot(formPt.x - s.x, formPt.y - s.y);
        const range = s.kind === 'bugs' ? 75 : (ranged ? 330 : 105 * (s.big ?? 1));
        if (de < range) {
          s.cd = s.kind === 'bugs' ? 0.4 : (s.kind === 'demon' ? 0.9 : s.kind === 'puppet' ? 1.25 : 1.1) * rand(0.9, 1.1);
          s.atk = 1; s.ax = formPt.x; s.ay = formPt.y; s.facing = formPt.x > s.x ? 1 : -1;
          const school = (s.kind === 'fox' ? '火' : '御') as School;
          const mul = s.kind === 'bugs' ? s.n / 14 : (s.kind === 'fox' && lv >= 1 ? 1.25 : 1);
          if (ranged) {
            this.fxq.push({ k: 'foxfire', x: s.x, y: s.y - 40, x2: formPt.x, y2: formPt.y - 30, color: '150,200,255' });
            const fx = formPt.x, fy = formPt.y, dd = s.dmg * mul;
            this.later(0.22, () => { g.sectwar?.damageFormationArea(fx, fy, 80, dd, 'foe', h.realm, school, new Set()); this.fxq.push({ k: 'sumhit', kind: 'foxland', x: fx, y: fy }); });
          } else {
            if (s.kind !== 'bugs') this.fxq.push({ k: 'sumhit', x: formPt.x, y: formPt.y, x2: s.x, y2: s.y, kind: s.kind, big: (s.big ?? 1) > 1.2 });
            g.sectwar?.damageFormationArea(formPt.x, formPt.y, s.kind === 'puppet' ? 110 : 80, s.dmg * mul, 'foe', h.realm, school, new Set());
          }
        }
      }
      if (s.t > 0) return true;
      // —— 收尾：傀儡 / 心魔二重起自爆，其余化作烟墨散去
      if (!s.boomed && lv >= 2 && (s.kind === 'puppet' || s.kind === 'demon')) {
        s.boomed = true;
        const r = s.kind === 'puppet' ? 170 : 130 * (s.big ?? 1);
        this.aoe(s.x, s.y, r, s.dmg * (s.kind === 'puppet' ? 2.2 : 1.6), { realm: h.realm, stCh: 0.5, status: { k: s.kind === 'puppet' ? 'knock' : 'burn', dur: 2, ch: 0.6 }, school: '御', evil: s.evil });
        this.impact(s.x, s.y, 2, s.kind === 'puppet' ? '255,190,110' : '255,70,60');
        this.fxq.push({ k: 'sumboom', x: s.x, y: s.y, kind: s.kind, r });
      } else this.fxq.push({ k: 'sumgone', x: s.x, y: s.y, kind: s.kind, color: SUMMON_COLOR[s.kind] });
      return false;
    });
  }
  /** 召唤物找目标：只找已经与你交手（或被锁定）的敌人，离召唤物近的优先 */
  private nearestFoe(x: number, y: number, px: number, py: number): Enemy | null {
    let best: Enemy | null = null, bd = 1e9;
    for (const e of this.enemies) {
      if (e.dead || (e as any).spar || (!e.aggro && this.lock !== e) || ((e as any).noP && this.lock !== e) || this.isShieldedFormUnit(e)) continue;
      const dp = Math.hypot(e.x - px, e.y - py); if (dp > 700) continue;
      const d = Math.hypot(e.x - x, e.y - y) + dp * 0.5;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  private laterQ: { t: number; f: () => void }[] = [];
  later(t: number, f: () => void) { this.laterQ.push({ t, f }); }
  private runLater(dt: number) {
    if (!this.laterQ.length) return;
    const q = this.laterQ; this.laterQ = [];
    for (const it of q) { it.t -= dt; if (it.t <= 0) it.f(); else this.laterQ.push(it); }
  }

  /** 战斗中的动作覆盖 */
  /** 闪避（空格）：短距冲刺，带无敌帧 */
  dodge() {
    const g = this.game, p = g.player, h = g.hero;
    if (h.dead || this.dash || this.dodgeCd > 0 || g.isFlying) return false;
    let dx = 0, dy = 0;
    const k = g.input.keys;
    if (k.has('a') || k.has('arrowleft')) dx -= 1; if (k.has('d') || k.has('arrowright')) dx += 1;
    if (k.has('w') || k.has('arrowup')) dy -= 1; if (k.has('s') || k.has('arrowdown')) dy += 1;
    if (!dx && !dy && g.destination) { dx = g.destination.x - p.x; dy = g.destination.y - p.y; }
    if (!dx && !dy) { const e = this.lock && !this.lock.dead ? this.lock : this.nearest(p.x, p.y, 600, new Set()); if (e) { dx = p.x - e.x; dy = p.y - e.y; } else { dx = Math.sin(p.st.yaw); dy = Math.cos(p.st.yaw); } }
    const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const dur = 0.2, dist = 190;
    this.dash = { t: 0, dur, vx: dx * dist / dur, vy: dy * dist / dur * 0.8, dmg: 0, hit: new Set(), invuln: true, color: '200,235,255' };
    this.invulnT = Math.max(this.invulnT, 0.28);
    this.dodgeCd = 0.85;
    this.fxq.push({ k: 'dodge', x: p.x, y: p.y });
    audio.sfx('whoosh');
    return true;
  }

  actionOverride(): 'cast' | 'hit' | 'dodge' | null {
    if (this.dash) return 'dodge';
    if (this.pst.freeze || this.pst.stun) return 'hit';
    if (this.hitT > 0) return 'hit';
    if (this.castT > 0) return 'cast';
    return null;
  }
}

export function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
/** "r,g,b" → [0..1]³ */
export function hexToRgb01(s: string): [number, number, number] { const p = s.split(',').map(Number); return [p[0] / 255, p[1] / 255, p[2] / 255]; }
