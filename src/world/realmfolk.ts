// 别界的人：有名有姓的修士与凡人。
//
// 别界的图第一次造出来时（data/world.ts 的 ensureMap），这里把那一界的宗门登进宗门名册（掌门、太上长老、长老、执事、门人，
// 和人界的宗门一个办法，见 roster.ts）；人第一次落到那一界时，按那一界的种子撒一批有名有姓的人——城里的散修、商贾、凡人，
// 坊市和每座城各有一位掌柜。大城的城主、客卿由坐镇者那一套出（garrison.ts）。同一界在谁的存档里都是同一批人。
import type { Game } from './game';
import { locsOf, setOnMapMade, ensureMap, type LocDef, type MapId } from '../data/world';
import { SECT_DEFS, SECT_DEF, type SectDef } from './roster';
import { realmKindOf } from '../gfx/citySize';
import { mulberry32 } from '../core/rng';
import type { NpcData } from './npc';

/** 每一界撒多少人 */
export const REALM_FOLK = 170;
const isRealm = (m: string) => m.startsWith('realm-');
const hs = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** 各种样貌的界，宗门的道袍颜色 */
const ROBE: Record<string, string[]> = {
  archipelago: ['#2c5a72', '#3f6f80'], desert: ['#8a6a3a', '#a07a40'], frost: ['#7c94ac', '#5e7690'],
  spiritwood: ['#3e6a44', '#56784a'], ember: ['#8a3a2a', '#9a5030'], nether: ['#2a2232', '#3a2a40'],
};

/** 别界的宗门登进宗门名册（图造出来时就登，免得坐镇者那边先把它当成城） */
function registerSects(map: MapId): void {
  const kind = realmKindOf(map) ?? '';
  for (const l of locsOf(map)) {
    if (l.hub !== 'sect' || SECT_DEF.has(l.id)) continue;
    const h = hs(l.id), robes = ROBE[kind] ?? ROBE.spiritwood;
    const def: SectDef = { id: l.id, name: l.name, n: l.major ? 90 + (h % 30) : 40 + (h % 30), top: l.major ? (h % 3 === 0 ? 5 : 4) : (h % 4 === 0 ? 4 : 3), demon: kind === 'nether' || undefined, robe: robes[h % robes.length] };
    SECT_DEFS.push(def); SECT_DEF.set(l.id, def);
  }
}
setOnMapMade((map) => { if (isRealm(map)) registerSects(map); });

/** 读档时：存档里有别界的人，先把那一界的图（和地点）造出来，他们的家才找得着 */
export function ensureRealmMapsOf(list: readonly { map?: string }[]): void {
  const seen = new Set<string>();
  for (const n of list) if (n.map && isRealm(n.map) && !seen.has(n.map)) { seen.add(n.map); ensureMap(n.map as MapId); }
}

/** 人落到一界：这一界还没人就按种子撒一批（已有就什么都不做） */
export function populateRealm(g: Game, map: MapId): number {
  if (!isRealm(map)) return 0;
  const N = g.npcs;
  if (N.list.some((n) => n.map === map && n.id.startsWith('rf'))) return 0;
  ensureMap(map); registerSects(map);
  const homes = locsOf(map).filter((l) => l.type !== 'danger' && l.type !== 'secret');
  if (!homes.length) return 0;
  const rnd = mulberry32(hs(map) ^ 0x5f3759df), pos = mulberry32(hs(map) ^ 0x2545f491);
  const wt = (l: LocDef) => (l.hub === 'capital' ? 14 : l.hub === 'city' ? 8 : l.hub === 'sect' ? 5 : l.hub === 'market' ? 6 : l.type === 'city' ? 6 : l.type === 'town' ? 3 : l.type === 'isle' ? 2.5 : 1) * (l.minor ? 0.35 : 1);
  const cum: number[] = []; let tot = 0; for (const l of homes) cum.push(tot += wt(l));
  const pick = () => { const r = rnd() * tot; let lo = 0, hi = cum.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; } return homes[lo]; };
  const tag = 'rf' + map.slice(6) + '_';
  const out: NpcData[] = [];
  // 每座城、坊市各一位掌柜（坐在铺子里不走）
  let k = 0;
  for (const l of homes) {
    if (l.hub !== 'capital' && l.hub !== 'city' && l.hub !== 'market') continue;
    const d = N.spawnAt(rnd, l, tag + k++, pos);
    d.faction = 'merchant'; d.role = d.sex === 'f' ? 'female' : 'merchant'; d.realm = Math.max(1, d.realm); d.stage = Math.min(d.stage, 2);
    d.title = `${l.name}·${l.hub === 'market' ? '坊主' : '掌柜'}`; d.stay = true; d.wealth = Math.max(d.wealth, 2000 * Math.pow(3, d.realm));
    out.push(d);
  }
  while (out.length < REALM_FOLK) out.push(N.spawnAt(rnd, pick(), tag + k++, pos));
  N.addPeople(out);
  return out.length;
}
