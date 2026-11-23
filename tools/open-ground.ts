// 测试用：在某地点附近找一片空旷平地（不在任何城镇 / 宗门的安全区里，往东 span 都是能走的缓坡）。
// P10 起宗门是一座小山、城是一两万见方的街坊，安全区（妖兽不进、NPC 不在里面打）大了很多；
// 原来不少测试写死「青玄门中心 +1400, +900」当野外，现在那里落在青玄门的山上、安全区里。
import type { Game } from '../src/world/game';
import { LOC_BY_ID, WORLD_SCALE } from '../src/data/world';
export function openGround(g: Game, locId: string, span = 2600, from = 1500): { x: number; y: number } {
  const l = LOC_BY_ID.get(locId)!, T = g.terrain, cx = l.x * WORLD_SCALE, cy = l.y * WORLD_SCALE;
  const flat = (x: number, y: number) => {
    for (let d = -span; d <= span; d += 100) for (const [qx, qy] of [[x + d, y], [x, y + d * 0.5]]) {
      const q = T.surface.sample(qx, qy);
      if (!q.walkable || q.slope > 0.25 || T.walkFactor(qx, qy) <= 0 || g.combat.safeAt(qx, qy) || T.nearRiver(qx, qy)) return false;
    }
    return true;
  };
  for (let r = from; r < 30000; r += 400) for (let a = 0; a < 24; a++) {
    const x = cx + Math.cos(a / 24 * Math.PI * 2) * r, y = cy + Math.sin(a / 24 * Math.PI * 2) * r;
    if (flat(x, y)) return { x, y };
  }
  throw new Error(`${l.name}附近找不到空旷平地`);
}
