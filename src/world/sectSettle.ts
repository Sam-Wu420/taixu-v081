// P10：旧存档读进新宗门。宗门从平地上的院子改成了一整座山（台地、挡墙、崖、殿阁），旧存档里记着的位置可能落在
// 山体里不该站人的地方：挡墙 / 崖面上、殿阁的碰撞块里、台地之间够不着的坡上。读档时把这些位置挪一挪：
//   · 人（主角、NPC）：挪到这座宗门最近的落脚点（台面上、步行网连着山门的那些点，不在殿阁里）；
//   · 洞府（world.home）：宗门的地界里不该有私人洞府——沿径向挪到地界（含过渡带）外的陆地上。
// 本来就站得好好的（台面上、石阶上、平地堆的小山的缓坡上，不在建筑里）不动。
import { LOC_BY_ID, WORLD_SCALE } from '../data/world';
import { getLayout, LOC_SCALE } from '../gfx/building';
import { rectDist, onPlanStair, planReach } from '../data/sectPlan';
import type { Terrain } from './terrain';

/** 人站的位置：在占山的宗门里站得不对就给出挪到哪；不用挪返回 null */
export function settleInSect(T: Terrain, x: number, y: number): { x: number; y: number } | null {
  const m = T.surface.massifAt(x, y);
  if (!m) return null;
  const P = m.plan, loc = LOC_BY_ID.get(P.id);
  if (!loc) return null;
  const L = getLayout(loc), lx = m.lx, ly = m.ly;
  const inBlock = (qx: number, qy: number) => L.blocks.some((b) => qx / LOC_SCALE > b.x - 10 && qx / LOC_SCALE < b.x + b.w + 10 && qy / LOC_SCALE > b.y - 10 && qy / LOC_SCALE < b.y + b.h + 10);
  const onTerrace = P.terraces.some((t) => t.role !== 'lake' && !t.perch && t.role !== 'perch' && rectDist(t, lx, ly) < -60);
  const walk = T.walkFactor(x, y) > 0 && T.surface.sample(x, y).walkable;
  // 站得好：站得住、不在建筑里，并且在台面上 / 石阶上 / 平地堆的小山的缓坡上（四面都走得通）/ 地界外的过渡带上（原地形）
  if (walk && !inBlock(lx, ly) && (onTerrace || onPlanStair(P, lx, ly, 0) || !P.mountain || m.weight < 1)) return null;
  // 挪到最近的落脚点（布局里的落脚点都在台面上、和山门连着、不在建筑里）
  const ox = loc.x * WORLD_SCALE, oy = loc.y * WORLD_SCALE;
  let best: { x: number; y: number } | null = null, bd = Infinity;
  for (const s of L.spots ?? []) {
    const sx = ox + s.x * LOC_SCALE, sy = oy + s.y * LOC_SCALE, d = Math.hypot(sx - x, sy - y);
    if (d < bd) { bd = d; best = { x: sx, y: sy }; }
  }
  if (!best) best = { x: ox + P.spawn.x, y: oy + P.spawn.y };
  return best;
}

/** 洞府：落在哪座占山宗门的地界（含过渡带）里就沿径向挪到外面的陆地上；不用挪返回 null */
export function settleOutOfSect(T: Terrain, x: number, y: number): { x: number; y: number } | null {
  const m = T.surface.massifAt(x, y);
  if (!m) return null;
  const P = m.plan, ox = x - m.lx, oy = y - m.ly, R = planReach(P, 500);
  const dx = (m.lx - R.cx) / R.rx, dy = (m.ly - R.cy) / R.ry;
  if (Math.hypot(dx, dy) >= 1) return null;
  const a0 = Math.atan2(dy, dx);
  for (let k = 0; k < 48; k++) {
    const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.13;
    for (const f of [1.04, 1.12, 1.25]) {
      const nx = ox + R.cx + Math.cos(a) * R.rx * f, ny = oy + R.cy + Math.sin(a) * R.ry * f;
      if (T.walkFactor(nx, ny) > 0 && T.surface.sample(nx, ny).walkable && !T.surface.massifAt(nx, ny)) return { x: nx, y: ny };
    }
  }
  return { x: ox + R.cx + Math.cos(a0) * R.rx * 1.05, y: oy + R.cy + Math.sin(a0) * R.ry * 1.05 };
}
