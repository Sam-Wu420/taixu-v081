// 收官 P7：飞过交界中线（南荒 ⇄ 中州、南荒 ⇄ 沧溟海）换图时，跟着自己的人和东西一起搬过去。
//
// 原来 game.crossSeam 只搬了敌人、弹道、特效、飘字、召唤物、小动物：
//   · 灵宠（pets.ent）的坐标还是旧图的——下一帧离人太远，被「瞬移回身边」拽一下；蚀金蛊群（petSwarm、swarm）整群留在原地；
//   · 同行的人（知交、结伴的友人）在 npc.ts 里按「所在地图」过滤，换了图就被当成别处的人从身边删掉——等于被扔在了海上；
//   · 同阵修士（combat.allies）没跟着平移。
// 这里一并平移，并把同行的人的「所在地图」改成新图（他们本来就跟着你走，到了对面就是对面的人了）。
// 收官 B3：同行的人第一次被带过交界时记下他原来在哪（图、位置、家）；不再同行时（遣散、各自回去）就回原处——
// 原先所在地图被永久改成了新图，遣散时还会在异乡就近找个城镇安家，从此再也回不去了。记录放在 ws.flags.seamHome，随存档走。
import type { Game } from './game';
import { ACTIVE_MAP, type MapId } from '../data/world';

interface SwarmLike { X: Float32Array; Y: Float32Array; head?: { x: number; y: number }; path?: number[]; corpse?: { x: number; y: number } | null; eats?: { x: number; y: number }[]; bites?: { x: number; y: number }[] }

function shiftSwarm(s: SwarmLike | null | undefined, dx: number, dy: number) {
  if (!s) return;
  for (let i = 0; i < s.X.length; i++) { s.X[i] += dx; s.Y[i] += dy; }
  if (s.head) { s.head.x += dx; s.head.y += dy; }
  if (s.path) for (let i = 0; i + 1 < s.path.length; i += 2) { s.path[i] += dx; s.path[i + 1] += dy; }
  if (s.corpse) { s.corpse.x += dx; s.corpse.y += dy; }
  for (const q of [...(s.eats ?? []), ...(s.bites ?? [])]) { q.x += dx; q.y += dy; }
}

/** shift：game.ts 里那个搬一批活物的函数（敌人列表同样的规则：x/y、hx/hy、cs/st/anchor……） */
export function carryAcrossSeam(g: Game, to: MapId, dx: number, dy: number, shift: (list: unknown[]) => void) {
  // 灵宠
  const pe = g.pets?.ent; if (pe) { pe.x += dx; pe.y += dy; }
  const c = g.combat as unknown as { allies: unknown[]; petSwarm: SwarmLike | null; swarm: SwarmLike | null; loot: unknown[] };
  shiftSwarm(c.petSwarm, dx, dy); shiftSwarm(c.swarm, dx, dy);
  // 同阵修士、地上的掉落
  shift(c.allies); shift(c.loot);
  // 同行的人：坐标、立板、所在地图都跟过来
  const homes = seamHomes(g);
  for (const a of g.npcs.followers()) {
    const d = a.d as { id: string; x: number; y: number; tx?: number; ty?: number; map?: MapId; home?: string; waitAt?: { x: number; y: number } };
    if (!homes[d.id]) homes[d.id] = { map: (d.map ?? 'tiannan') as MapId, x: d.x, y: d.y, home: d.home ?? '' };
    d.x += dx; d.y += dy; if (typeof d.tx === 'number') d.tx += dx; if (typeof d.ty === 'number') d.ty += dy;
    if (d.waitAt) { d.waitAt.x += dx; d.waitAt.y += dy; }
    d.map = to;
    a.st.x += dx; a.st.y += dy;
  }
}

interface SeamHome { map: MapId; x: number; y: number; home: string }
function seamHomes(g: Game): Record<string, SeamHome> { const f = g.ws.flags as Record<string, unknown>; return ((f.seamHome ??= {}) as Record<string, SeamHome>); }

/**
 * 收官 B3：被带过交界的人不再同行了，就回原处（jueyu.tick 隔两息问一次）：所在地图、位置、家都改回第一次过交界之前的样子；
 * 此刻不在他原来那张图上，就从身边的活动名单里拿掉（他回去了）。还跟着的、已经回到原图的，不动。
 */
export function returnCarried(g: Game) {
  const homes = seamHomes(g), ids = Object.keys(homes); if (!ids.length) return;
  const following = new Set(g.npcs.followers().map((a) => a.d.id));
  for (const id of ids) {
    if (following.has(id)) continue;
    const h = homes[id], d = g.npcs.byId.get(id) as unknown as { x: number; y: number; tx?: number; ty?: number; map?: MapId; home?: string; alive?: boolean } | undefined;
    delete homes[id];
    if (!d || !d.alive) continue;
    d.map = h.map; d.x = h.x; d.y = h.y; d.tx = h.x; d.ty = h.y; if (h.home) d.home = h.home;
    if (h.map !== ACTIVE_MAP) g.npcs.active.delete(id);
  }
}
