import { XSECTS, pyramidOf, scaledSize, type SectPyramid } from '../data/sects';
// 第三十六步 / v0.72：宗门万人金字塔名册——
// · 第1层（数千~上万炼气）：拆为杂役池（servant，炼气1–5层，后勤不参战）与外门池（outer，炼气6–13层，百人战阵兵源），仅存数字池
// · 第2层（数百筑基）：内门 / 核心弟子（O(1) 分段种子池，支持分页查询，战时任阵眼队长）
// · 第3层（~10–18 高层）：执事 / 长老 / 掌门 / 太上长老（结丹以上核心，真实实名在册）
import type { Game } from './game';
import type { NpcData } from './npc';
import { makeName, SECT_ROBE_OF } from './npc';
import { LOC_BY_ID, WORLD_SCALE, ACTIVE_MAP } from '../data/world';
import { REALMS, pickNpcRoot, realmName } from '../data/realms';
import { mulberry32 } from '../core/rng';

export type Rank = '掌门' | '太上长老' | '长老' | '执事' | '核心弟子' | '内门弟子' | '外门弟子' | '杂役弟子';
export const RANKS: Rank[] = ['掌门', '太上长老', '长老', '执事', '核心弟子', '内门弟子', '外门弟子', '杂役弟子'];
export interface SectDef {
  id: string; name: string; n: number; top: number; demon?: boolean; robe?: string; motto?: string;
  baseN: number; pyr: SectPyramid;
}

/** top：太上 / 掌门的境界（3 结丹 · 4 元婴 · 5 化神） */
const RAW_SECTS: { id: string; name: string; n: number; top: number; demon?: boolean; robe?: string; motto?: string }[] = [
  // 梁国七派
  { id: 'huangfeng', name: '青霞谷', n: 96, top: 3 },
  { id: 'yanyue', name: '凝霜宗', n: 108, top: 4 },
  { id: 'lingshou', name: '驭兽山', n: 72, top: 3 },
  { id: 'qingxu', name: '清微门', n: 38, top: 3 },
  { id: 'huadao', name: '断刀坞', n: 40, top: 3 },
  { id: 'tianque', name: '天枢堡', n: 34, top: 3 },
  { id: 'jujian', name: '重岳剑门', n: 36, top: 3 },
  // 正一盟
  { id: 'luoyun', name: '栖云宗', n: 100, top: 4 },
  { id: 'gujian', name: '藏剑门', n: 84, top: 3 },
  { id: 'baiqiao', name: '天工院', n: 62, top: 3 },
  // 魔门六宗
  { id: 'guiling', name: '阴灵门', n: 98, top: 4, demon: true },
  { id: 'hehuan', name: '天欢宗', n: 110, top: 4, demon: true },
  { id: 'yuling', name: '役灵宗', n: 80, top: 4, demon: true },
  { id: 'qianhuan', name: '万幻宗', n: 70, top: 4, demon: true },
  { id: 'tiansha', name: '玄煞宗', n: 64, top: 4, demon: true },
  { id: 'yinluo', name: '幽罗宗', n: 118, top: 4, demon: true },
  // 列国盟 / 万竹教
  { id: 'huayi', name: '归意门', n: 80, top: 4 },
  { id: 'qianzhu', name: '万竹教', n: 52, top: 3 },
  // 朔漠
  { id: 'tianlan', name: '天穹圣殿', n: 90, top: 4 },
  { id: 'mulan', name: '朔漠法士', n: 72, top: 4 },
  // 中州
  { id: 'tianmo', name: '天魔宗', n: 120, top: 5, demon: true },
  { id: 'taiyi', name: '太一门', n: 112, top: 4 },
  { id: 'yejia', name: '叶家', n: 64, top: 4, robe: '#3e5a48' },
  // 沧溟海
  { id: 'tianxing', name: '星罗殿', n: 120, top: 4, robe: '#2c3c6a' },
  { id: 'leikong', name: '叛星盟', n: 100, top: 4, robe: '#5a3a2a' },
  { id: 'miaoyin', name: '清音门', n: 40, top: 3, robe: '#b8a0d0' },
  { id: 'jiyin', name: '玄阴岛', n: 64, top: 4, demon: true, robe: '#20262e' },
  // v0.60：新宗门
  ...XSECTS.map((s) => ({ id: s.id, name: s.name, n: s.n, top: s.top, demon: s.dao === 'mo' ? true : undefined, robe: s.robe, motto: s.motto })),
];

export const SECT_DEFS: SectDef[] = RAW_SECTS.map((s) => {
  const pyr = pyramidOf(s.id, s.n, s.top);
  const seg = segmentsFromPyr(pyr, s.top);
  return { ...s, baseN: s.n, pyr, n: seg.total };
});

/** 原著掌门 / 老祖 / 结丹长老占名册的高层席位（[序号, 原著人物 id]）——绝不重复计入宗门体量 */
export const CANON_SEAT: Record<string, [number, string][]> = {
  huangfeng: [[0, 'zhonglingdao'], [1, 'linghu'], [2, 'lihuayuan'], [3, 'leiwanhe'], [4, 'hongfu']],
  yanyue: [[0, 'nichang'], [2, 'qionglaoguai']],
  qingxu: [[2, 'fuyunzi']],
  huadao: [[2, 'hantianya']],
  jujian: [[2, 'wuchi']],
  yanling: [[0, 'yanlaozu']],
  jiyin: [[0, 'jiyin']],
  guiling: [[0, 'wangtiangu'], [2, 'wangtiansheng'], [3, 'suihun']],
  hehuan: [[0, 'hehuanlaomo'], [1, 'yunlu']],
  yuling: [[0, 'dongmentu']],
  tiansha: [[0, 'tianshazhenjun'], [2, 'weizhanglao']],
  qianhuan: [[2, 'luzhanglao']],
  luoyun: [[1, 'chengtiankun'], [2, 'lvluo']],
  gujian: [[2, 'jiangyun']],
  baiqiao: [[2, 'changzheng']],
  yinluo: [[0, 'fangzongzhu']],
  tianlan: [[0, 'tianlan_saint']],
  mulan: [[0, 'mulan_shi']],
};

export const SECT_DEF = new Map(SECT_DEFS.map((s) => [s.id, s]));
export const sectTitle = (id?: string) => (id ? SECT_DEF.get(id)?.name ?? LOC_BY_ID.get(id)?.name ?? id : '');

function hs(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export interface SectSegments {
  zhangmen: [number, number];
  tai: [number, number];
  elders: [number, number];
  zhishi: [number, number];
  core: [number, number];
  inner: [number, number];
  outer: [number, number];
  servant: [number, number];
  coreEnd: number; // top + mid 边界（0 .. coreEnd - 1 属于高层 + 筑基中坚）
  total: number;
}

function segmentsFromPyr(pyr: SectPyramid, topRealm: number): SectSegments {
  const taiN = topRealm >= 5 ? 2 : topRealm >= 4 ? 1 : 0;
  const elN = Math.max(3, Math.round(pyr.top * 0.58));
  const zsN = Math.max(2, pyr.top - 1 - taiN - elN);
  const coreN = Math.round(pyr.mid * 0.3);
  const innerN = Math.max(0, pyr.mid - coreN);
  let k = 0;
  const zhangmen: [number, number] = [k, k + 1]; k += 1;
  const tai: [number, number] = [k, k + taiN]; k += taiN;
  const elders: [number, number] = [k, k + elN]; k += elN;
  const zhishi: [number, number] = [k, k + zsN]; k += zsN;
  const core: [number, number] = [k, k + coreN]; k += coreN;
  const inner: [number, number] = [k, k + innerN]; k += innerN;
  const coreEnd = k;
  const outer: [number, number] = [k, k + pyr.outer]; k += pyr.outer;
  const servant: [number, number] = [k, k + pyr.servant]; k += pyr.servant;
  return { zhangmen, tai, elders, zhishi, core, inner, outer, servant, coreEnd, total: k };
}

const SEG_CACHE = new WeakMap<SectDef, SectSegments>();
export function sectSegments(def: SectDef): SectSegments {
  let s = SEG_CACHE.get(def);
  if (!s) {
    const pyr = def.pyr ?? pyramidOf(def.id, def.baseN ?? def.n, def.top);
    s = segmentsFromPyr(pyr, def.top);
    SEG_CACHE.set(def, s);
  }
  return s;
}

export interface Member { sid: string; i: number; name: string; sex: 'm' | 'f'; rank: Rank; realm: number; stage: number; pers: NpcData['pers']; seed: number; root: string }

/** 第 i 号门人的品级（O(1) 区间判定） */
export function rankOf(def: SectDef, i: number): Rank {
  const seg = sectSegments(def);
  if (i < seg.zhangmen[1]) return '掌门';
  if (i < seg.tai[1]) return '太上长老';
  if (i < seg.elders[1]) return '长老';
  if (i < seg.zhishi[1]) return '执事';
  if (i < seg.core[1]) return '核心弟子';
  if (i < seg.inner[1]) return '内门弟子';
  if (i < seg.outer[1]) return '外门弟子';
  return '杂役弟子';
}

const stg = (realm: number, r: () => number, lo = 0, hi = 1) => {
  const L = REALMS[realm].stages.length;
  return Math.min(L - 1, Math.floor(L * (lo + (hi - lo) * r())));
};

function pickRoot(rank: Rank, r: () => number): string {
  const x = r();
  if (rank === '太上长老' || rank === '掌门' || rank === '长老') return x < 0.14 ? 'heaven' : x < 0.36 ? 'variant' : x < 0.85 ? 'true' : 'triple';
  if (rank === '执事' || rank === '核心弟子') return x < 0.04 ? 'heaven' : x < 0.16 ? 'variant' : x < 0.65 ? 'true' : 'triple';
  if (rank === '内门弟子') return x < 0.08 ? 'variant' : x < 0.42 ? 'true' : x < 0.88 ? 'triple' : 'fake';
  if (rank === '外门弟子') return x < 0.06 ? 'true' : x < 0.46 ? 'triple' : 'fake';
  return x < 0.25 ? 'triple' : 'fake';
}

export function member(def: SectDef, i: number, gen = 0): Member {
  const r = mulberry32((hs(def.id) ^ Math.imul(i + 1, 2654435761) ^ Math.imul(gen, 40503)) >>> 0);
  const rank = rankOf(def, i), T = def.top;
  const fem = def.id === 'yanyue' || def.id === 'miaoyin' || def.id === 'hehuan' ? 0.62 : 0.3;
  const sex: 'm' | 'f' = r() < fem ? 'f' : 'm';
  let realm = 1, stage = 0;
  switch (rank) {
    case '太上长老':
      if (T >= 9) { realm = i === 1 ? T : Math.max(9, T - 1); stage = stg(realm, r, 0.2, 0.9); }
      else if (T >= 6) { realm = i === 1 ? T : Math.max(6, T - 1); stage = stg(realm, r, 0.2, 0.85); }
      else if (T === 5) { realm = i === 1 ? 5 : 4; stage = i === 1 ? 0 : 2; }
      else { realm = T; stage = T >= 4 ? (r() < 0.15 ? 2 : r() < 0.55 ? 1 : 0) : stg(realm, r, 0.5, 1); }
      break;
    case '掌门':
      if (T >= 9) { realm = Math.max(9, T - 1); stage = stg(realm, r, 0.4, 1); }
      else if (T >= 6) { realm = Math.max(6, T - 1); stage = stg(realm, r, 0.4, 1); }
      else { realm = T >= 4 ? Math.max(3, T - 1) : T; stage = stg(realm, r, 0.55, 1); if (T === 4 && r() < 0.25) { realm = T; stage = 0; } }
      break;
    case '长老':
      if (T >= 9) { realm = r() < 0.3 ? Math.max(9, T - 1) : 9; stage = stg(realm, r, 0, 0.8); }
      else if (T >= 6) { realm = r() < 0.25 ? Math.max(6, T - 1) : 6; stage = stg(realm, r, 0, 0.8); }
      else if (T >= 4) {
        realm = Math.max(3, T - 1); stage = stg(realm, r, 0, 1);
        if (T >= 5 && r() < 0.12) { realm = 4; stage = 0; }
      } else if (T === 3) {
        // 小/中宗门（最高结丹）：仅大长老及少数资历长老（人数>=4时）达结丹初期，其余长老皆为筑基巅峰，杜绝全员结丹泛滥
        const seg = sectSegments(def);
        const elderIdx = i - seg.elders[0];
        const elderCount = seg.elders[1] - seg.elders[0];
        realm = (elderIdx === 0 || (elderCount >= 4 && r() < 0.22)) ? 3 : 2;
        stage = realm === 3 ? stg(3, r, 0, 0.45) : stg(2, r, 0.65, 1);
      } else {
        realm = Math.max(1, T); stage = stg(realm, r, 0.3, 1);
      }
      break;
    case '执事':
      if (T >= 9) { realm = r() < 0.35 ? 9 : 8; stage = stg(realm, r, 0, 0.85); }
      else if (T >= 6) { realm = r() < 0.4 ? 6 : 5; stage = stg(realm, r, 0, 0.85); }
      else if (T >= 4) { realm = r() < 0.45 ? 3 : 2; stage = realm === 3 ? stg(3, r, 0, 0.45) : stg(2, r, 0.65, 1); }
      else if (T === 3) { realm = 2; stage = stg(2, r, 0.4, 1); }
      else { realm = r() < 0.4 ? 2 : 1; stage = realm === 2 ? stg(2, r, 0, 0.4) : stg(1, r, 0.7, 1); }
      break;
    case '核心弟子':
      if (T >= 9) { realm = r() < 0.4 ? 8 : 7; stage = stg(realm, r, 0.2, 0.9); }
      else if (T >= 6) { realm = 5; stage = stg(5, r, 0.3, 1); }
      else { realm = 2; stage = stg(2, r, 0.45, 1); }
      break;
    case '内门弟子':
      if (T >= 9) { realm = r() < 0.35 ? 7 : 6; stage = stg(realm, r, 0, 0.85); }
      else if (T >= 6) { realm = 4; stage = stg(4, r, 0.2, 0.9); }
      else { realm = 2; stage = stg(2, r, 0, 0.65); }
      break;
    case '外门弟子':
      if (T >= 9) { realm = r() < 0.3 ? 6 : 5; stage = stg(realm, r, 0, 0.8); }
      else if (T >= 6) { realm = r() < 0.3 ? 4 : 3; stage = stg(realm, r, 0.2, 0.9); }
      else { realm = 1; stage = 5 + Math.floor(r() * (REALMS[1].stages.length - 5)); }
      break;
    case '杂役弟子':
      if (T >= 9) { realm = 4; stage = stg(4, r, 0, 0.7); }
      else if (T >= 6) { realm = 2; stage = stg(2, r, 0, 0.7); }
      else { realm = 1; stage = Math.floor(r() * 5); }
      break;
  }
  const P: NpcData['pers'][] = def.demon ? ['ruthless', 'greedy', 'arrogant', 'cautious', 'cautious'] : ['righteous', 'righteous', 'cautious', 'arrogant', 'kind', 'greedy'];
  return { sid: def.id, i, name: makeName(r, sex), sex, rank, realm, stage, pers: P[Math.floor(r() * P.length)], seed: Math.floor(r() * 1e9), root: pickRoot(rank, r) };
}

export interface RosPool { a: number; c: number }
export interface RosOuterPool { a: number; j: number; c: number }
export interface RosState {
  v?: number;
  /** 仅存第 2、3 层（核心 + 筑基中坚）的稀疏阵亡索引，最多百余个整数 */
  d?: number[];
  g?: Record<number, number>;
  /** 杂役池（炼气 1–5 层，后勤不参战） */
  sv?: RosPool;
  /** 外门池（炼气 6–13 层，a=可用战兵，j=重伤休养，c=满编容量） */
  ot?: RosOuterPool;
  /** 高阶死亡次数累计（战报/统计用） */
  okill?: number;
}
const RANK_W: Record<Rank, number> = { 掌门: 0, 太上长老: 1, 长老: 2, 执事: 3, 核心弟子: 4, 内门弟子: 5, 外门弟子: 6, 杂役弟子: 7 };

export class Roster {
  game: Game;
  private acc = 0;
  /** 已现身的门人 id */
  private present = new Set<string>();
  constructor(game: Game) { this.game = game; }

  private st(sid: string): RosState {
    const f = this.game.ws.flags as any; f.ros ??= {};
    const raw: RosState = (f.ros[sid] ??= {});
    const def = SECT_DEF.get(sid);
    if (def && raw.v !== 2) this.migrateState(def, raw);
    return raw;
  }

  /** 将旧版（120~400 人全下标数组）无损迁移至 v2 金字塔结构 */
  private migrateState(def: SectDef, s: RosState) {
    const seg = sectSegments(def);
    const oldDead = Array.isArray(s.d) ? s.d : [];
    const oldMaxIdx = oldDead.reduce((m, x) => Math.max(m, x), 0);
    const oldCap = Math.max(def.baseN, oldMaxIdx + 1, Math.min(400, Math.round(def.baseN * 2)));
    const ratio = oldDead.length ? Math.max(0.05, Math.min(1, 1 - oldDead.length / oldCap)) : 1;
    s.sv = { a: Math.round(def.pyr.servant * ratio), c: def.pyr.servant };
    s.ot = { a: Math.round(def.pyr.outer * ratio), j: 0, c: def.pyr.outer };
    // 保留高层合法死亡下标，筑基空缺按旧损比例缩入新中坚池
    const keepTop = oldDead.filter((i) => i >= 0 && i < seg.zhishi[1]);
    const wantMidDead = Math.min(def.pyr.mid, Math.round(def.pyr.mid * (1 - ratio)));
    for (let k = 0; k < wantMidDead; k++) keepTop.push(seg.core[0] + k);
    s.d = keepTop;
    if (s.g) {
      const ng: Record<number, number> = {};
      for (const [k, v] of Object.entries(s.g)) { const idx = Number(k); if (idx >= 0 && idx < seg.coreEnd) ng[idx] = v; }
      s.g = Object.keys(ng).length ? ng : undefined;
    }
    s.v = 2;
  }

  poolState(sid: string): { servant: RosPool; outer: RosOuterPool; midCap: number; topCap: number } | null {
    const def = SECT_DEF.get(sid); if (!def) return null;
    const s = this.st(sid);
    return {
      servant: s.sv ?? { a: def.pyr.servant, c: def.pyr.servant },
      outer: s.ot ?? { a: def.pyr.outer, j: 0, c: def.pyr.outer },
      midCap: def.pyr.mid,
      topCap: def.pyr.top,
    };
  }

  isDead(sid: string, i: number) {
    const def = SECT_DEF.get(sid); if (!def) return false;
    const seg = sectSegments(def), s = this.st(sid);
    if (i < seg.coreEnd) return !!s.d?.includes(i);
    if (i < seg.outer[1]) return (s.ot?.a ?? def.pyr.outer) <= 0;
    return (s.sv?.a ?? def.pyr.servant) <= 0;
  }
  gen(sid: string, i: number) { return this.st(sid).g?.[i] ?? 0; }
  canonAt(sid: string, i: number) { return CANON_SEAT[sid]?.find((s) => s[0] === i)?.[1]; }

  /** 快速统计非杂役/非在场/非原著占位的在世骨干人数（等价于 sectwar.units(sid).length，但不生成姓名外貌） */
  coreAliveCount(sid: string): number {
    const def = SECT_DEF.get(sid); if (!def) return 0;
    const seg = sectSegments(def), s = this.st(sid), deadSet = new Set(s.d ?? []);
    const byId = this.game.npcs.byId;
    let count = 0;
    for (let i = 0; i < seg.coreEnd; i++) {
      if (deadSet.has(i) || rankOf(def, i) === '杂役弟子' || this.canonAt(sid, i) || byId.has(this.idOf(sid, i))) continue;
      count++;
    }
    return count;
  }

  /** 获取第 2、3 层（高层 + 筑基中坚）门人；若传 includeAll 则含外门/杂役抽样前若干人（默认不铺开万人） */
  members(sid: string): (Member & { dead: boolean })[] {
    const def = SECT_DEF.get(sid); if (!def) return [];
    const seg = sectSegments(def), s = this.st(sid), deadSet = new Set(s.d ?? []);
    const out: (Member & { dead: boolean })[] = [];
    for (let i = 0; i < seg.coreEnd; i++) {
      const m = { ...member(def, i, s.g?.[i] ?? 0), dead: deadSet.has(i) };
      const c = this.canonAt(sid, i), cd = c ? this.game.npcs.byId.get(c) : undefined;
      if (cd) { m.name = cd.name; m.realm = cd.realm; m.stage = cd.stage; m.sex = cd.sex; m.dead = !cd.alive; }
      out.push(m);
    }
    return out;
  }

  /** 分页查询第 2 层（筑基核心/内门弟子），O(pageSize) */
  midPage(sid: string, page = 0, pageSize = 15): { total: number; alive: number; items: (Member & { dead: boolean })[] } {
    const def = SECT_DEF.get(sid); if (!def) return { total: 0, alive: 0, items: [] };
    const seg = sectSegments(def), s = this.st(sid), deadSet = new Set(s.d ?? []);
    const start = seg.core[0], total = seg.inner[1] - start;
    let deadMid = 0; for (const idx of deadSet) if (idx >= start && idx < seg.coreEnd) deadMid++;
    const p0 = Math.max(0, page) * pageSize, end = Math.min(total, p0 + pageSize);
    const items: (Member & { dead: boolean })[] = [];
    for (let offset = p0; offset < end; offset++) {
      const idx = start + offset;
      items.push({ ...member(def, idx, s.g?.[idx] ?? 0), dead: deadSet.has(idx) });
    }
    return { total, alive: Math.max(0, total - deadMid), items };
  }

  /** 外门/杂役随机点卯抽样，O(count) */
  qiSample(sid: string, count = 10, seed = 0, kind: 'outer' | 'servant' = 'outer'): Member[] {
    const def = SECT_DEF.get(sid); if (!def) return [];
    const seg = sectSegments(def), [lo, hi] = kind === 'outer' ? seg.outer : seg.servant;
    const span = hi - lo; if (span <= 0) return [];
    const r = mulberry32((hs(sid) ^ (seed * 2654435761)) >>> 0);
    const out: Member[] = [], used = new Set<number>();
    for (let t = 0; t < count * 3 && out.length < count; t++) {
      const idx = lo + Math.floor(r() * span);
      if (used.has(idx)) continue;
      used.add(idx);
      out.push(member(def, idx, 0));
    }
    return out;
  }

  /** O(1) 总在世人数（四层合计） */
  aliveCount(sid: string): number {
    const sm = this.summary(sid);
    let n = 0;
    for (const r of RANKS) n += sm[r].alive;
    return n;
  }

  /** O(1) 外门可战炼气人数 */
  outerAlive(sid: string): number { const def = SECT_DEF.get(sid); if (!def) return 0; return this.st(sid).ot?.a ?? def.pyr.outer; }
  /** O(1) 杂役人数 */
  servantAlive(sid: string): number { const def = SECT_DEF.get(sid); if (!def) return 0; return this.st(sid).sv?.a ?? def.pyr.servant; }

  /** 批量记录阵亡（兼容旧序号，并区分外门池与中高层序号） */
  kill(sid: string, refs: number[]) {
    if (!refs.length) return;
    const def = SECT_DEF.get(sid); if (!def) return;
    const seg = sectSegments(def), s = this.st(sid);
    s.d ??= []; s.ot ??= { a: def.pyr.outer, j: 0, c: def.pyr.outer };
    let outerDead = 0;
    for (const i of refs) {
      if (i < seg.coreEnd) {
        if (!s.d.includes(i)) s.d.push(i);
      } else if (i < seg.outer[1]) {
        outerDead++;
      }
      // 杂役序号不因普通战事扣除
    }
    if (outerDead > 0) this.damageOuter(sid, outerDead, 0);
  }

  /** 扣减外门战兵（dead=真死，injured=重伤退回山门休养） */
  damageOuter(sid: string, dead: number, injured = 0) {
    const def = SECT_DEF.get(sid); if (!def) return;
    const s = this.st(sid); s.ot ??= { a: def.pyr.outer, j: 0, c: def.pyr.outer };
    const takeDead = Math.min(s.ot.a, Math.max(0, Math.round(dead)));
    s.ot.a -= takeDead;
    const takeInj = Math.min(s.ot.a, Math.max(0, Math.round(injured)));
    s.ot.a -= takeInj;
    s.ot.j = Math.min(s.ot.c - s.ot.a, s.ot.j + takeInj);
    if (takeDead > 0) s.okill = (s.okill ?? 0) + takeDead;
  }

  /** 战后收编外门兵源 */
  mergeOuter(sid: string, add: number) {
    const def = SECT_DEF.get(sid); if (!def || add <= 0) return;
    const s = this.st(sid); s.ot ??= { a: def.pyr.outer, j: 0, c: def.pyr.outer };
    const room = Math.max(0, s.ot.c * 1.3 - s.ot.a - s.ot.j);
    s.ot.a += Math.min(Math.round(add), Math.round(room));
  }

  idOf(sid: string, i: number) { return `r_${sid}_${i}_${this.gen(sid, i)}`; }

  /** 让第 i 号门人现身为 NPC（已现身则直接返回） */
  materialize(sid: string, i: number, at?: { x: number; y: number }): NpcData | null {
    const def = SECT_DEF.get(sid), loc = LOC_BY_ID.get(sid); if (!def || !loc || this.isDead(sid, i)) return null;
    const c = this.canonAt(sid, i); if (c) { const cd = this.game.npcs.byId.get(c); return cd?.alive ? cd : null; }
    const id = this.idOf(sid, i), npcs = this.game.npcs;
    const ex = npcs.byId.get(id); if (ex) { if (ex.alive) this.present.add(id); return ex.alive ? ex : null; }
    const m = member(def, i, this.gen(sid, i));
    const p = at ?? npcs.homeAt(loc, Math.random, 1500, 1100);
    const R = REALMS[m.realm];
    const elder = m.rank === '掌门' || m.rank === '太上长老' || m.rank === '长老';
    const d: NpcData = {
      id, name: m.name, sex: m.sex, role: m.sex === 'f' ? 'female' : elder ? 'elder' : 'cultivator', realm: m.realm, stage: m.stage,
      faction: def.demon ? 'demon' : 'sect', sect: sid, home: sid, pers: m.pers, favor: 0, grudge: 0, met: false, alive: true,
      age: 18 + (m.realm - 1) * 30 + (m.seed % 40), life: R.life * 0.95, x: p.x, y: p.y, tx: p.x, ty: p.y, goal: 'stay', until: 0,
      wealth: Math.round(20 * Math.pow(4, m.realm)), seed: m.seed, root: pickNpcRoot(m.realm, m.seed), robe: def.robe ?? SECT_ROBE_OF(sid), map: loc.map,
      title: `${def.name}${m.rank}`, ros: sid, rosI: i,
    };
    if (d.age > d.life * 0.9) d.age = d.life * 0.6;
    npcs.list.push(d); npcs.byId.set(id, d); this.present.add(id);
    return d;
  }

  /** 值得存档的现身者（结过交情 / 有仇 / 正在追杀 / 同行） */
  static notable(d: NpcData) { return d.alive && (d.met || (d.grudge ?? 0) > 0 || !!d.bond || !!d.hunting || !!d.chasing || !!d.helpUntil || !!d.helpUntilDay || !!(d as any).war); }

  private vanish(d: NpcData) {
    const npcs = this.game.npcs; npcs.forget(d.id);
    const k = npcs.list.indexOf(d); if (k >= 0) npcs.list.splice(k, 1);
    npcs.byId.delete(d.id); this.present.delete(d.id);
  }

  /** 门人死去：记入名册 */
  private markDead(d: NpcData) {
    if (!d.ros || d.rosI === undefined) return;
    this.kill(d.ros, [d.rosI]);
  }

  /**
   * O(1)/O(n) 挑选门人：境界在 [lo, hi] 之间，默认绝不抽调「杂役弟子」参战。
   * 用于寻仇、围剿与出征阵眼。
   */
  pick(sid: string, n: number, lo: number, hi: number, opt: { minRank?: Rank; skipTop?: boolean; combat?: boolean } = {}): NpcData[] {
    const def = SECT_DEF.get(sid); if (!def) return [];
    const seg = sectSegments(def), s = this.st(sid), deadSet = new Set(s.d ?? []);
    const cand: Member[] = [];
    const seen = new Set<number>();
    const combatOnly = opt.combat !== false;

    const tryIdx = (i: number) => {
      if (seen.has(i) || i < 0 || i >= seg.outer[1]) return;
      if (combatOnly && i >= seg.outer[0] && (s.ot?.a ?? 0) <= 0) return;
      if (i < seg.coreEnd && deadSet.has(i)) return;
      if (this.canonAt(sid, i)) return;
      const m = member(def, i, s.g?.[i] ?? 0);
      if (opt.skipTop && (m.rank === '掌门' || m.rank === '太上长老')) return;
      if (opt.minRank && RANK_W[m.rank] > RANK_W[opt.minRank]) return;
      if (m.realm < lo || m.realm > hi) return;
      const ex = this.game.npcs.byId.get(this.idOf(sid, i));
      if (ex && (ex.hunting || ex.chasing || ex.bond || this.game.npcs.activeOf(ex.id))) return;
      seen.add(i);
      cand.push(m);
    };

    // 高阶与筑基中坚：随机探针抽样（不用遍历全表）
    if (hi >= 2) {
      const start = opt.skipTop ? seg.elders[0] : 0, span = seg.coreEnd - start;
      for (let t = 0; t < Math.min(span * 2, Math.max(48, n * 10)) && cand.length < n * 3; t++) {
        tryIdx(start + Math.floor(Math.random() * span));
      }
    }
    // 炼气外门（6–13 层）：仅从 outer 区间抽样，绝不抽杂役
    if (lo <= 1 && hi >= 1 && (s.ot?.a ?? def.pyr.outer) > 0 && cand.length < n * 2) {
      const [o0, o1] = seg.outer, span = o1 - o0;
      const wantOuter = Math.min(s.ot?.a ?? def.pyr.outer, n * 2);
      for (let t = 0; t < wantOuter * 3 && cand.length < n * 3; t++) {
        tryIdx(o0 + Math.floor(Math.random() * span));
      }
    }

    cand.sort((a, b) => b.realm * 13 + b.stage - (a.realm * 13 + a.stage) + (Math.random() - 0.5) * 6);
    const out: NpcData[] = [];
    for (const m of cand) { if (out.length >= n) break; const d = this.materialize(sid, m.i); if (d) out.push(d); }
    return out;
  }

  update(dt: number) {
    this.acc -= dt; if (this.acc > 0) return; this.acc = 1.5;
    const g = this.game, npcs = g.npcs, P = g.player;
    for (const id of [...this.present]) {
      const d = npcs.byId.get(id); if (!d) { this.present.delete(id); continue; }
      if (!d.alive) { this.markDead(d); this.vanish(d); continue; }
      if (Roster.notable(d)) continue;
      const loc = LOC_BY_ID.get(d.home);
      const far = !loc || loc.map !== ACTIVE_MAP || Math.hypot(loc.x * WORLD_SCALE - P.x, loc.y * WORLD_SCALE - P.y) > 9000;
      if (far && !npcs.activeOf(d.id)) this.vanish(d);
    }
    // 走近山门：按三层比例现身（筑基/外门/杂役巡山，太上闭关少出）
    for (const def of SECT_DEFS) {
      const loc = LOC_BY_ID.get(def.id); if (!loc || loc.map !== ACTIVE_MAP) continue;
      if (Math.hypot(loc.x * WORLD_SCALE - P.x, loc.y * WORLD_SCALE - P.y) > 5600) continue;
      const want = Math.max(10, Math.min(24, Math.round(def.pyr.mid * 0.08)));
      let have = 0; for (const id of this.present) if (npcs.byId.get(id)?.ros === def.id) have++;
      if (have >= want) continue;
      const seg = sectSegments(def), s = this.st(def.id);
      const month = Math.floor(g.day / 30), r = mulberry32((hs(def.id) + month * 977) >>> 0);
      for (let t = 0; t < 64 && have < want; t++) {
        // 40% 中坚执事、40% 外门弟子、20% 杂役/高层
        const roll = r();
        let i = 1;
        if (roll < 0.4) i = seg.zhishi[0] + Math.floor(r() * Math.max(1, seg.coreEnd - seg.zhishi[0]));
        else if (roll < 0.8 && (s.ot?.a ?? 0) > 0) i = seg.outer[0] + Math.floor(r() * (seg.outer[1] - seg.outer[0]));
        else if ((s.sv?.a ?? 0) > 0) i = seg.servant[0] + Math.floor(r() * (seg.servant[1] - seg.servant[0]));
        else i = 1 + Math.floor(r() * Math.max(1, seg.coreEnd - 1));
        const m = rankOf(def, i); if (m === '太上长老' && r() < 0.85) continue;
        if (this.isDead(def.id, i) || this.canonAt(def.id, i) || npcs.byId.has(this.idOf(def.id, i))) continue;
        if (this.materialize(def.id, i)) have++;
      }
    }
  }

  /** O(1) 闭式日结算（支持百年闭关大跳）：疗伤回流、杂役晋外门、招新补员、筑基突破、长老递补 */
  daily(days: number) {
    if (days <= 0) return;
    const goneMap = (this.game.ws.flags as any).sw?.gone ?? {};
    const yrs = days / 360;
    for (const def of SECT_DEFS) {
      if (goneMap[def.id]) continue;
      const s = this.st(def.id), seg = sectSegments(def);
      const sv = s.sv ?? (s.sv = { a: def.pyr.servant, c: def.pyr.servant });
      const ot = s.ot ?? (s.ot = { a: def.pyr.outer, j: 0, c: def.pyr.outer });
      // 1. 外门重伤康复回流（v0.73：战备疗伤丹药充足时半衰期 ~11 天；断丹后仅靠自身吐纳 ~65 天）
      if (ot.j > 0) {
        const sp = this.game.sectwar?.supplyOf?.(def.id);
        const hasPills = !sp || sp.pills > 0;
        const halfLife = hasPills ? 11 : 65;
        const want = Math.min(ot.j, Math.max(hasPills ? 1 : 0, Math.round(ot.j * (1 - Math.exp(-days / halfLife)))));
        let heal = want;
        if (want > 0 && sp && this.game.sectwar?.consumeHealingPills) {
          const used = this.game.sectwar.consumeHealingPills(def.id, want);
          if (used <= 0) {
            heal = Math.min(ot.j, Math.round(ot.j * (1 - Math.exp(-days / 65))));
          } else {
            const covered = Math.min(want, Math.max(1, Math.round(used * 2)));
            const rest = Math.max(0, want - covered);
            heal = covered + Math.round(rest * 0.25);
          }
        }
        if (heal > 0) { ot.j -= heal; ot.a += heal; }
      }
      // 2. 杂役修成炼气六层晋升外门（平时每年约 12% 杂役升格；战损缺编时急征升格提速至 18%）
      const otRoom = Math.max(0, ot.c - ot.a - ot.j);
      if (otRoom > 0 && sv.a > 0) {
        const promoRate = ot.a < ot.c * 0.7 ? 0.18 : 0.12;
        const promo = Math.min(otRoom, Math.floor(sv.a * (1 - Math.exp(-yrs * promoRate)) + Math.random()));
        if (promo > 0) { sv.a -= promo; ot.a += promo; }
      }
      // 3. 每年升仙大会招收新杂役（每年补充杂役容量的 ~16%）
      const svRoom = Math.max(0, sv.c - sv.a);
      if (svRoom > 0) {
        const recruit = Math.min(svRoom, Math.floor(sv.c * (1 - Math.exp(-yrs * 0.16)) + (Math.random() < yrs * 0.65 ? 1 : 0)));
        sv.a += recruit;
      }
      // 4. 筑基中坚空缺：只有外门有余力（>=20% 容量）时才能培养出新筑基补位
      if (s.d?.length && ot.a >= ot.c * 0.2) {
        const midDeadIdx: number[] = [];
        const topDeadIdx: number[] = [];
        for (let k = 0; k < s.d.length; k++) {
          const idx = s.d[k];
          if (idx >= seg.core[0] && idx < seg.coreEnd) midDeadIdx.push(idx);
          else if (idx === 0 || (idx >= seg.elders[0] && idx < seg.core[0])) topDeadIdx.push(idx); // 太上长老不自动补位
        }
        if (midDeadIdx.length) {
          const ch = 1 - Math.exp(-yrs * Math.max(1, def.pyr.mid * 0.04));
          const fill = Math.min(midDeadIdx.length, ot.a - Math.floor(ot.c * 0.15), Math.floor(midDeadIdx.length * ch + (Math.random() < ch ? 1 : 0)));
          for (let c = 0; c < fill; c++) {
            const idx = midDeadIdx[c];
            const pos = s.d.indexOf(idx);
            if (pos >= 0) { s.d.splice(pos, 1); (s.g ??= {})[idx] = (s.g[idx] ?? 0) + 1; ot.a = Math.max(0, ot.a - 1); }
          }
        }
        // 5. 掌门 / 结丹长老空缺：稀少且漫长（仅从筑基中坚破境递补；太上元婴绝不秒补）
        if (topDeadIdx.length && Math.random() < 1 - Math.exp(-yrs * 0.05)) {
          const idx = topDeadIdx[0];
          const pos = s.d.indexOf(idx);
          if (pos >= 0) { s.d.splice(pos, 1); (s.g ??= {})[idx] = (s.g[idx] ?? 0) + 1; }
        }
      }
    }
  }

  /** O(1) 名册概要：各品级总编制与当前在世人数 */
  summary(sid: string): Record<Rank, { n: number; alive: number }> {
    const out: Record<Rank, { n: number; alive: number }> = {} as any;
    for (const r of RANKS) out[r] = { n: 0, alive: 0 };
    const def = SECT_DEF.get(sid); if (!def) return out;
    const seg = sectSegments(def), s = this.st(sid), deadSet = new Set(s.d ?? []);
    const ranges: [Rank, [number, number]][] = [
      ['掌门', seg.zhangmen], ['太上长老', seg.tai], ['长老', seg.elders],
      ['执事', seg.zhishi], ['核心弟子', seg.core], ['内门弟子', seg.inner],
    ];
    for (const [rk, [a, b]] of ranges) {
      let alive = 0;
      for (let i = a; i < b; i++) {
        const c = this.canonAt(sid, i), cd = c ? this.game.npcs.byId.get(c) : undefined;
        if (cd) { if (cd.alive) alive++; }
        else if (!deadSet.has(i)) alive++;
      }
      out[rk] = { n: b - a, alive };
    }
    const ot = s.ot ?? { a: def.pyr.outer, j: 0, c: def.pyr.outer };
    const sv = s.sv ?? { a: def.pyr.servant, c: def.pyr.servant };
    out['外门弟子'] = { n: ot.c, alive: ot.a + ot.j };
    out['杂役弟子'] = { n: sv.c, alive: sv.a };
    return out;
  }

  leaders(sid: string) {
    const def = SECT_DEF.get(sid); if (!def) return [];
    const seg = sectSegments(def), s = this.st(sid), deadSet = new Set(s.d ?? []);
    const out: (Member & { dead: boolean; realmText: string })[] = [];
    for (let i = 0; i < seg.zhishi[0]; i++) {
      const m = { ...member(def, i, s.g?.[i] ?? 0), dead: deadSet.has(i) };
      const c = this.canonAt(sid, i), cd = c ? this.game.npcs.byId.get(c) : undefined;
      if (cd) { m.name = cd.name; m.realm = cd.realm; m.stage = cd.stage; m.sex = cd.sex; m.dead = !cd.alive; }
      out.push({ ...m, realmText: realmName(m.realm, m.stage) });
    }
    return out;
  }
}
