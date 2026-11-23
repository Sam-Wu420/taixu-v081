// 第三十七步：修仙界的人口金字塔——敌人的境界由“在哪、是什么人”决定，不再跟着主角的境界走
//
// 原著：炼气满地走，筑基已算一方人物；结丹是宗门长老、一地之主；元婴只在大宗大派坐镇（外加极少数散修老怪）；
// 人界几乎没有化神。沧溟海结丹多、元婴少（幽渊岛碧云门二十多位结丹，只一位元婴初期）；中州灵气浓、高阶修士多些。
// · foeRealm      —— 按当地金字塔掷一个境界（劫修 / 魔修 / 头目 / 首领）
// · threatRealm   —— 冲着你来的人（追杀、寻仇、赏金猎人）：只有自认打得过你的才会来；你境界越高，敢来的越少
// · canAdvance    —— NPC 突破的名额：散修元婴每张图寥寥数人，化神不由 NPC 修成；化神者止步初期
import type { Game } from './game';
import { ACTIVE_MAP, ACTIVE_WORLD, type MapId } from '../data/world';
import { REALMS } from '../data/realms';
import { worldOfMap, worldRealmCap, type WorldId } from '../data/worldHierarchy';
import type { NpcData } from './npc';

export type FoeKind = 'rogue' | 'evil' | 'leader' | 'boss' | 'minion';
export interface RS { realm: number; stage: number }

/** 各图修士的境界占比 [凡, 炼气, 筑基, 结丹, 元婴, 化神, 炼虚, 合体, 大乘] */
const DEFAULT_BASE = [0, 0.46, 0.38, 0.14, 0.02];
const BASE: Record<string, number[]> = {
  renjie: [0, 0.54, 0.34, 0.11, 0.01],
  tiannan: [0, 0.66, 0.29, 0.047, 0.003],
  luanxing: [0, 0.5, 0.37, 0.12, 0.01],
  dajin: [0, 0.46, 0.38, 0.14, 0.02],
  // 灵界原著金字塔：结丹/元婴为广大底层灵民，化神为一方小人物，炼虚为地区大佬，合体乃一方大能（大乘不出散修）
  lingjie: [0, 0, 0.08, 0.28, 0.42, 0.17, 0.044, 0.006, 0],
  xianjie: [0, 0, 0, 0, 0, 0.05, 0.15, 0.25, 0.12, 0.28, 0.12, 0.03],
};
/** 散修中元婴的名额（每张图同时在世） */
export const ROGUE_YY_CAP: Record<string, number> = { renjie: 6, tiannan: 1, luanxing: 2, dajin: 3 };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** 某处的境界分布：越凶险的地方高阶修士越多 */
export function pyramid(map: MapId, k: number, evil = false): number[] {
  const w = (BASE[map] ?? DEFAULT_BASE).slice();
  const wId = worldOfMap(map);
  if (wId === 'spirit') {
    const s = clamp((k - 8.4) / 5.5, 0, 1);
    w[5] = (w[5] ?? 0.17) * (1 + s * 0.9);
    w[6] = (w[6] ?? 0.044) * (1 + s * 2.2);
    w[7] = (w[7] ?? 0.006) * (1 + s * 3.0);
    if (evil) { w[5] *= 1.15; w[6] *= 1.25; }
    return w;
  }
  const s = clamp((k - 2) / 6, 0, 1);
  w[2] *= 1 + s; w[3] *= 1 + 2.5 * s; w[4] *= 1 + 3 * s;
  if (evil) { w[2] *= 1.15; w[3] *= 1.2; }
  return w;
}
function pickW(w: number[], lo: number, hi: number, rnd: () => number): number {
  let tot = 0; for (let r = lo; r <= hi; r++) tot += w[r] ?? 0;
  if (tot <= 0) return lo;
  let x = rnd() * tot;
  for (let r = lo; r <= hi; r++) { x -= w[r] ?? 0; if (x <= 0) return r; }
  return hi;
}
/** 小层：炼气多在前中期；头目、首领偏后期 */
export function stageFor(realm: number, kind: FoeKind, rnd: () => number = Math.random): number {
  const L = REALMS[realm]?.stages.length ?? 1;
  if (L <= 1) return 0;
  const hiK = kind === 'leader' || kind === 'boss';
  const u = hiK ? 0.45 + 0.55 * rnd() : Math.pow(rnd(), 1.35);
  return clamp(Math.floor(u * L), 0, L - 1);
}
function kOf(g: Game, x: number, y: number) {
  try { return g.combat.dangerCalc(x, y).k; }
  catch { return ACTIVE_WORLD === 'immortal' ? 11.5 : ACTIVE_WORLD === 'spirit' ? 9.5 : 2; }
}
function evilZone(g: Game, x: number, y: number) { try { return g.combat.dangerCalc(x, y).region === 'modao'; } catch { return false; } }

/** 按当地金字塔掷境界。lo / hi：额外夹定（例如原著事件里只许结丹以上） */
export function foeRealm(g: Game, x: number, y: number, kind: FoeKind = 'rogue', rnd: () => number = Math.random, lo = 1, hi?: number): RS {
  const w = pyramid(ACTIVE_MAP, kOf(g, x, y), kind === 'evil' || evilZone(g, x, y));
  const [encLo, encHi] = ACTIVE_WORLD === 'human' ? [1, 4] : ACTIVE_WORLD === 'spirit' ? [4, 7] : [9, 11];
  const rLo = Math.max(encLo, lo);
  const roleCap = ACTIVE_WORLD === 'human' ? (kind === 'boss' ? 4 : 3) : kind === 'boss' ? encHi : kind === 'leader' ? Math.max(rLo, encHi - 1) : Math.max(rLo, encHi - 2);
  let cap = Math.min(hi ?? worldRealmCap(ACTIVE_WORLD).maxRealm, roleCap);
  // 拦路的劫修 / 魔修至多高你一个大境界；剧情首领与显式高阶目标不受此限
  if (kind !== 'boss') cap = Math.max(rLo, Math.min(cap, (g.hero?.realm ?? encLo) + 1));
  const draws = kind === 'leader' ? 2 : kind === 'boss' ? 3 : 1;
  let realm = rLo;
  for (let i = 0; i < draws; i++) realm = Math.max(realm, pickW(w, rLo, Math.max(rLo, cap), rnd));
  return { realm, stage: stageFor(realm, kind, rnd) };
}

/** 冲着你来的人：只有自认打得过你（境界 ≥ 你）的才会来。
 *  bias：0 只求同阶，1 偏好高你一阶。返回 null = 这一带没有敢来的人 */
export function threatRealm(g: Game, x: number, y: number, min: number, bias = 0, rnd: () => number = Math.random, allowYY = false): RS | null {
  const w = pyramid(ACTIVE_MAP, kOf(g, x, y));
  if (ACTIVE_WORLD !== 'human') {
    const [encLo, encHi] = ACTIVE_WORLD === 'spirit' ? [4, 7] : [9, 11];
    const lo = clamp(min, encLo, encHi);
    const cap = Math.min(encHi, lo + 1);
    if (lo > cap) return null;
    if (ACTIVE_WORLD === 'spirit') {
      let mass = 0; for (let r = lo; r <= cap; r++) mass += w[r] ?? 0;
      if (rnd() > Math.min(1, mass / 0.14)) return null;
    }
    const ww = w.slice(); for (let r = lo + 1; r <= cap; r++) ww[r] = (ww[r] ?? 0) * (1 + 2.5 * bias);
    const realm = pickW(ww, lo, cap, rnd);
    return { realm, stage: stageFor(realm, realm > lo ? 'rogue' : 'leader', rnd) };
  }
  const lo = clamp(min, 1, 5);
  // v0.64：冲着你来的人至多高你一个大境界——筑基可以追杀炼气，结丹不屑为之，元婴更不会对小辈出手
  const cap = Math.min(allowYY ? 4 : 3, lo + 1);
  if (lo > cap) return null;
  let mass = 0; for (let r = lo; r <= cap; r++) mass += w[r];
  // 散修里够得上的人越少，越难凑出一个肯冒险的
  if (rnd() > Math.min(1, mass / 0.22)) return null;
  const ww = w.slice(); for (let r = lo + 1; r <= cap; r++) ww[r] *= 1 + 3 * bias;
  // v0.64：炼气前中期，盯上你的多是同阶——高一境的少见（一至四层 ×0.15，五至八层 ×0.5）；真来了，也多是初入筑基之辈
  const hs = g.hero?.stage ?? 0, green = lo === 1 && (g.hero?.realm ?? 1) <= 1;
  if (green && cap >= 2) ww[2] *= hs < 4 ? 0.15 : hs < 8 ? 0.5 : 1;
  const realm = pickW(ww, lo, cap, rnd);
  let stage = stageFor(realm, realm > lo ? 'rogue' : 'leader', rnd);
  if (green && realm > lo) stage = Math.min(stage, hs >= 10 ? 1 : 0);
  return { realm, stage };
}

/** NPC 的境界上限：随所在世界法则上限收束（人界止步化神初期） */
export function capRealm(d: { realm: number; stage: number; map?: string }, worldId: WorldId = d.map ? worldOfMap(d.map) : ACTIVE_WORLD) {
  const cap = worldRealmCap(worldId);
  if (d.realm > cap.maxRealm) d.realm = cap.maxRealm;
  if (d.realm >= cap.maxRealm) d.stage = Math.min(d.stage, cap.maxStage);
}
/** 某张图是否还有散修元婴名额 */
export function canHoldRogueYuanying(list: NpcData[], map: MapId): boolean {
  let n = 0;
  for (const o of list) if (o.alive && o.realm >= 4 && !o.canon && !o.ros && o.faction !== 'sect' && o.faction !== 'demon' && (o.map ?? 'renjie') === map) n++;
  return n < (ROGUE_YY_CAP[map] ?? 6);
}
/** NPC 能否突破到下一大境界（名额制；有羁绊、宗门长老或上界修士可逐阶突破至本界上限） */
export function canAdvance(list: NpcData[], d: NpcData): boolean {
  const to = d.realm + 1;
  const worldId = d.map ? worldOfMap(d.map) : ACTIVE_WORLD;
  const cap = worldRealmCap(worldId).maxRealm;
  if (to > cap) return false;
  if (to === cap) {
    // 本界极境（人界化神/灵界大乘/仙界大罗）仅极少数气运深厚或宗门/羁绊人物可成
    return !!(d.bond || d.ros || d.canon || worldId !== 'human' && (d.faction === 'sect' || d.faction === 'demon'));
  }
  if (to < 4) return true;
  if (d.canon || d.ros || d.bond || d.faction === 'sect' || d.faction === 'demon' || worldId !== 'human') return true;
  return canHoldRogueYuanying(list, d.map ?? 'renjie');
}

/** 新生散修 / 凡人的境界（按图或人界区域金字塔；灵界原著以元婴/化神小人物为主，炼虚大佬、合体大能渐稀） */
export function rogueRealmAt(map: MapId | 'tiannan' | 'luanxing' | 'dajin', rnd: () => number): number {
  const wId = worldOfMap(map);
  if (wId === 'spirit') {
    const r = rnd();
    return r < 0.36 ? 4 : r < 0.80 ? 5 : r < 0.97 ? 6 : 7;
  }
  if (wId === 'immortal') {
    const r = rnd();
    return r < 0.5 ? 9 : r < 0.85 ? 10 : 11;
  }
  const w = BASE[map] ?? DEFAULT_BASE;
  return pickW(w, 1, 3, rnd);
}
