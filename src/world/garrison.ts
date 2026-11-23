// 第四十步：大城坐镇——玄京、观星城这样的天下名城，街上走着的元婴老怪不该只有一两个
//
// 与宗门名册（roster.ts）同理：每座大城有一份按种子确定的「坐镇名册」（元婴 / 结丹），平时只是一行数据；
// 你走近城池才现身为 NPC，走远且无交情便散去。死者记入 flags.gz，若干年后由继任者补上。
// 人数：玄京 8/16 · 观星城 6/14 · 镇天城 4/10 · 摇光岛、朔州城 3/8 · 其余大城 1/4~5。
import type { Game } from './game';
import type { NpcData, Pers, Faction } from './npc';
import { makeName } from './npc';
import { Roster, SECT_DEF } from './roster';
import { SCHOOLS } from './schools';
import { LOC_BY_ID, WORLD_SCALE, ACTIVE_MAP, ALL_LOCATIONS, type LocDef } from '../data/world';
import { getLayout, LOC_SCALE } from '../gfx/building';
import { REALMS } from '../data/realms';
import { mulberry32 } from '../core/rng';
import { cityTier } from '../data/market';

const hs = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** [元婴, 结丹] */
export const GARRISON: Record<string, [number, number]> = {
  jinjing: [8, 16], tianxing: [6, 14], tiantian: [4, 10], kuixing: [3, 8], shuozhou: [3, 8],
};
/** P10 收尾：按地点 id 记下结果（坐镇者每 1.5 秒把三张图的地点过一遍，原来每次都重算） */
const gzOf = new Map<string, [number, number] | null>();
export function garrisonOf(l: LocDef): [number, number] | null {
  let g = gzOf.get(l.id);
  if (g === undefined) { g = garrisonOf0(l); gzOf.set(l.id, g); }
  return g;
}
function garrisonOf0(l: LocDef): [number, number] | null {
  if (GARRISON[l.id]) return GARRISON[l.id];
  // 宗门所在（玄阴岛、清音门……）由宗门自己坐镇，不另设城主
  if (SECT_DEF.has(l.id) || SCHOOLS[l.id]) return null;
  // 南荒（梁国一带）是小地方，结丹已是一方老祖：大城只有结丹坐镇（镇天城除外）
  if (cityTier(l) === 3 && (l.type === 'city' || l.type === 'isle')) return l.map === 'tiannan' ? [0, 3] : [1, 4 + (hs(l.id) % 2)];
  // 别界的寻常城池 / 大岛：两三位结丹坐镇（城主、客卿）
  if (l.map.startsWith('realm-') && (l.hub === 'city' || l.hub === 'capital')) return [0, 2 + (hs(l.id) % 2)];
  return null;
}

type Post = { t: string; f: Faction; sect?: string; pers?: Pers[]; role?: 'guard' | 'merchant' };
/** 各城坐镇者的身份（前几位是元婴，后面是结丹） */
const POSTS: Record<string, { y: Post[]; j: Post[] }> = {
  jinjing: {
    y: [{ t: '皇族供奉', f: 'sect' }, { t: '叶家老祖', f: 'sect' }, { t: '天机阁主事', f: 'merchant', role: 'merchant' }, { t: '九霄殿供奉', f: 'sect' }, { t: '太一门驻京长老', f: 'sect', sect: 'taiyi' },
      { t: '天魔宗使者', f: 'demon', sect: 'tianmo' }, { t: '散修老怪', f: 'rogue', pers: ['aloof', 'greedy', 'arrogant'] }, { t: '世家老祖', f: 'sect' }, { t: '归意门长老', f: 'sect', sect: 'huayi' }],
    j: [{ t: '世家家老', f: 'sect' }, { t: '京城禁卫统领', f: 'sect', role: 'guard' }, { t: '天机阁执事', f: 'merchant', role: 'merchant' }, { t: '九霄殿执事', f: 'sect' }, { t: '皇族客卿', f: 'sect' }, { t: '散修', f: 'rogue' }],
  },
  tianxing: {
    y: [{ t: '星罗殿长老', f: 'sect', sect: 'xinggong' }, { t: '星罗殿执法长老', f: 'sect', sect: 'xinggong' }, { t: '星罗殿供奉', f: 'sect', sect: 'xinggong' }, { t: '散修老怪', f: 'rogue', pers: ['aloof', 'greedy', 'arrogant'] }, { t: '海外老怪', f: 'rogue', pers: ['aloof', 'ruthless'] }, { t: '叛星盟暗桩', f: 'sect', sect: 'nixing' }],
    j: [{ t: '星罗殿执事', f: 'sect', sect: 'xinggong' }, { t: '星罗殿护卫统领', f: 'sect', sect: 'xinggong', role: 'guard' }, { t: '猎妖团团长', f: 'rogue' }, { t: '商会供奉', f: 'merchant', role: 'merchant' }, { t: '散修', f: 'rogue' }],
  },
  tiantian: {
    y: [{ t: '正一盟长老', f: 'sect' }, { t: '列国盟太上长老', f: 'sect' }, { t: '栖云宗驻城长老', f: 'sect', sect: 'luoyun' }, { t: '散修老怪', f: 'rogue', pers: ['aloof', 'greedy'] }],
    j: [{ t: '列国盟执事', f: 'sect' }, { t: '城防统领', f: 'sect', role: 'guard' }, { t: '藏剑门剑修', f: 'sect', sect: 'gujian' }, { t: '散修', f: 'rogue' }],
  },
};
const GENERIC = (l: LocDef): { y: Post[]; j: Post[] } => ({
  y: [{ t: `${l.name}城主`, f: 'sect' }, { t: '客卿长老', f: 'sect' }, { t: '散修老怪', f: 'rogue', pers: ['aloof', 'greedy', 'arrogant'] }],
  j: [{ t: '城主府供奉', f: 'sect' }, { t: '城卫统领', f: 'sect', role: 'guard' }, { t: '商会供奉', f: 'merchant', role: 'merchant' }, { t: '散修', f: 'rogue' }],
});

export interface GzMember { loc: string; i: number; name: string; sex: 'm' | 'f'; realm: number; stage: number; post: Post; pers: Pers; seed: number }
export function gzMember(l: LocDef, i: number, gen = 0): GzMember | null {
  const G = garrisonOf(l); if (!G) return null;
  const [ny] = G;
  const r = mulberry32((hs(l.id) ^ Math.imul(i + 1, 2654435761) ^ Math.imul(gen, 40503)) >>> 0);
  const P = POSTS[l.id] ?? GENERIC(l);
  const yuan = i < ny;
  // 元婴：前期多、中期少、后期凤毛麟角；结丹：初中后期均有
  const realm = yuan ? 4 : 3;
  const stage = yuan ? (r() < 0.12 ? 2 : r() < 0.4 ? 1 : 0) : Math.floor(r() * 3);
  // 元婴的身份按顺序排（城主 / 星罗殿长老在前），结丹随机
  const post = yuan ? (i === 0 ? P.y[0] : P.y[1 + Math.floor(r() * (P.y.length - 1))]) : ny === 0 && i === 0 ? P.y[0] : P.j[Math.floor(r() * P.j.length)];
  const sex: 'm' | 'f' = r() < 0.28 ? 'f' : 'm';
  const pool: Pers[] = post.pers ?? (post.f === 'demon' ? ['ruthless', 'arrogant', 'cautious'] : post.f === 'merchant' ? ['greedy', 'cautious', 'kind'] : ['aloof', 'cautious', 'righteous', 'arrogant']);
  return { loc: l.id, i, name: makeName(r, sex), sex, realm, stage, post, pers: pool[Math.floor(r() * pool.length)], seed: Math.floor(r() * 1e9) };
}

interface GzState { d?: number[]; g?: Record<number, number> }

/**
 * P10：坐镇者在城里的落脚处。成片街坊的新城有一两万见方，坐镇者若和行人一样撒在全城的街巷落脚点上，
 * 玩家进城（站在城心附近）多半一个也看不见。坐镇者只在城心一带（城主府、衙署、钟鼓楼、广场）的落脚点上走动：
 * 取离城心 2400 以内的街巷落脚点（只读城池布局的 spots，不改它）；城里没有落脚点（老布局、别的地点）返回 null，照旧按地点散布。
 */
const coreSpots = new Map<string, { x: number; y: number }[]>();
export function gzSpot(l: LocDef, rnd: () => number = Math.random): { x: number; y: number } | null {
  let pts = coreSpots.get(l.id);
  if (!pts) {
    const L = getLayout(l), all = (L.spots ?? []).map((s) => ({ x: s.x * LOC_SCALE, y: s.y * LOC_SCALE }));
    pts = all.filter((s) => Math.hypot(s.x, s.y) < 2400);
    // 城心一带没有落脚点：取离城心最近的二十个
    if (!pts.length && all.length) pts = all.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y)).slice(0, 20);
    coreSpots.set(l.id, pts);
  }
  if (!pts.length) return null;
  const s = pts[Math.floor(rnd() * pts.length)];
  return { x: l.x * WORLD_SCALE + s.x + (rnd() - 0.5) * 60, y: l.y * WORLD_SCALE + s.y + (rnd() - 0.5) * 40 };
}
/** 这座城有多大（城心到城边，世界单位）：现身 / 散去的距离按它放宽 */
function cityReach(g: Game, l: LocDef): number {
  // 按 id 查地界（原来 LOCATIONS.indexOf 在两千多个地点里线性找，每 1.5 秒对每座有坐镇的城各找一遍）
  const zs = g.terrain.locZones;
  if (zoneIdx.src !== zs) { zoneIdx.src = zs; zoneIdx.by = new Map((zs ?? []).map((z) => [z.id, z])); }
  const z = zoneIdx.by.get(l.id);
  return z ? Math.max(z.rx, z.ry) : 0;
}
const zoneIdx: { src: unknown; by: Map<string, { rx: number; ry: number }> } = { src: null, by: new Map() };

export class Garrison {
  game: Game;
  private acc = 0;
  private present = new Set<string>();
  private gzMap = ''; private gzLen = -1; private gzLocs: LocDef[] = [];
  constructor(g: Game) { this.game = g; }
  private st(loc: string): GzState { const f = this.game.ws.flags as any; f.gz ??= {}; return (f.gz[loc] ??= {}); }
  isDead(loc: string, i: number) { return !!this.st(loc).d?.includes(i); }
  gen(loc: string, i: number) { return this.st(loc).g?.[i] ?? 0; }
  idOf(loc: string, i: number) { return `gz_${loc}_${i}_${this.gen(loc, i)}`; }
  size(l: LocDef) { const G = garrisonOf(l); return G ? G[0] + G[1] : 0; }
  /** 城中在世的元婴 / 结丹人数 */
  count(l: LocDef): [number, number] {
    const G = garrisonOf(l); if (!G) return [0, 0];
    let y = 0, j = 0;
    for (let i = 0; i < G[0] + G[1]; i++) if (!this.isDead(l.id, i)) { if (i < G[0]) y++; else j++; }
    return [y, j];
  }
  materialize(l: LocDef, i: number): NpcData | null {
    if (this.isDead(l.id, i)) return null;
    const npcs = this.game.npcs, id = this.idOf(l.id, i);
    const ex = npcs.byId.get(id); if (ex) { if (ex.alive) this.present.add(id); return ex.alive ? ex : null; }
    const m = gzMember(l, i, this.gen(l.id, i)); if (!m) return null;
    const p = gzSpot(l) ?? npcs.homeAt(l, Math.random, 1200, 900);
    const R = REALMS[m.realm];
    const d: NpcData = {
      id, name: m.name, sex: m.sex, role: m.sex === 'f' ? 'female' : m.post.role ?? (m.realm >= 4 ? 'elder' : 'cultivator'), realm: m.realm, stage: m.stage,
      faction: m.post.f, sect: m.post.sect, home: l.id, pers: m.pers, favor: 0, grudge: 0, met: false, alive: true,
      age: m.realm >= 4 ? 400 + (m.seed % 450) : 150 + (m.seed % 250), life: R.life * 0.95, x: p.x, y: p.y, tx: p.x, ty: p.y, goal: 'stay', until: 0,
      wealth: Math.round(30 * Math.pow(4, m.realm)), seed: m.seed, map: l.map, title: `${l.name}·${m.post.t}`, stay: true, gz: l.id, gzI: i,
    };
    if (d.age > d.life * 0.9) d.age = d.life * 0.6;
    npcs.list.push(d); npcs.byId.set(id, d); this.present.add(id);
    return d;
  }
  private vanish(d: NpcData) {
    const npcs = this.game.npcs; npcs.forget(d.id);
    const k = npcs.list.indexOf(d); if (k >= 0) npcs.list.splice(k, 1);
    npcs.byId.delete(d.id); this.present.delete(d.id);
  }
  update(dt: number) {
    this.acc -= dt; if (this.acc > 0) return; this.acc = 1.5;
    const g = this.game, npcs = g.npcs, P = g.player;
    for (const id of [...this.present]) {
      const d = npcs.byId.get(id); if (!d) { this.present.delete(id); continue; }
      const D = d;
      if (!d.alive) { if (D.gz && D.gzI !== undefined) { const s = this.st(D.gz); (s.d ??= []); if (!s.d.includes(D.gzI)) s.d.push(D.gzI); } this.vanish(d); continue; }
      if (Roster.notable(d)) continue;
      const loc = LOC_BY_ID.get(d.home);
      // 走远才散去：大城按城的大小放宽（在梁京城边上逛时，城心的坐镇者不该散掉）
      const far = !loc || loc.map !== ACTIVE_MAP || Math.hypot(loc.x * WORLD_SCALE - P.x, loc.y * WORLD_SCALE - P.y) > Math.max(9000, cityReach(g, loc) + 2500);
      if (far && !npcs.activeOf(d.id)) this.vanish(d);
    }
    // 有坐镇名册的城（一张图上就那么十来座）先挑出来记住，不再每次把三张图两千多个地点都过一遍
    if (this.gzMap !== ACTIVE_MAP || this.gzLen !== ALL_LOCATIONS.length) { this.gzMap = ACTIVE_MAP; this.gzLen = ALL_LOCATIONS.length; this.gzLocs = ALL_LOCATIONS.filter((l) => l.map === ACTIVE_MAP && this.size(l) > 0); }
    for (const l of this.gzLocs) {
      const n = this.size(l); if (!n) continue;
      if (Math.hypot(l.x * WORLD_SCALE - P.x, l.y * WORLD_SCALE - P.y) > Math.max(5600, cityReach(g, l) + 1500)) continue;
      for (let i = 0; i < n; i++) if (!this.isDead(l.id, i) && !npcs.byId.has(this.idOf(l.id, i))) this.materialize(l, i);
    }
  }
  /** 每日：死去的坐镇者，过上几年便有继任者（约每席每年三成） */
  daily(days: number) {
    const ch = 1 - Math.pow(1 - 0.3 / 365, days);
    const f = this.game.ws.flags as any; if (!f.gz) return;
    for (const loc of Object.keys(f.gz)) {
      const s = f.gz[loc] as GzState; if (!s.d?.length) continue;
      for (const i of [...s.d]) if (Math.random() < ch) { s.d.splice(s.d.indexOf(i), 1); (s.g ??= {})[i] = (s.g[i] ?? 0) + 1; }
    }
  }
}
