// 图外的交界地带长什么样：按「大陆坐标」（南荒的坐标）算，所以从南荒、中州、沧溟海哪张图看过去都是同一片地。
//   南荒以北：天穹草原——整片陆地、平缓起伏、偏旱、几乎无林；东边有一道海岸，再往东是海。
//   南荒以东：无边海——茫茫海面，零星几座无名小岛、几处礁盘。
import { fbm } from '../core/rng';
import { SEA_ISLES, TN_K } from '../data/world';

export type OutlandField = 'land' | 'elev' | 'arid' | 'cold' | 'forest' | 'depth';

const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v;

/** 草原的成分（1＝草原腹地，0＝海）：只有南荒以北才有草原，东边到海岸为止 */
export function steppeAt(gx: number, gy: number): number {
  if (gy > 3000) return 0;
  // 东岸：大尺度的弯、中尺度的湾岬、细碎的岸——中尺度那一项是后加的：原先地峡那十二万深里岸线几乎是一条竖线，正好和两张图的东缘对齐
  const coast = 281000 * TN_K + (fbm(gy / 26000, 3.7, 3, 81) - 0.5) * 30000 + (fbm(gy / 9000, 5.3, 3, 83) - 0.5) * 42000 + (fbm(gy / 4200, 9.1, 2, 82) - 0.5) * 5000;
  return clamp01(0.5 + (coast - gx) / 2600) * clamp01((3000 - gy) / 3000);
}
/** 海里的小岛（0.5 以上露出水面）：稀疏的几处 */
export function isletAt(gx: number, gy: number): number {
  const n = fbm(gx / 5600, gy / 5600, 3, 77), m = fbm(gx / 30000, gy / 30000, 2, 78);
  // 大尺度的 m 决定哪一带有岛（成群），小尺度的 n 决定一座座的形状
  let v = clamp01(0.5 + (n - 0.715 + (m - 0.5) * 0.16) * 7);
  // 有名字的几座岛：照着表隆起，岸线用噪声揉一揉
  for (const s of SEA_ISLES) {
    const d = Math.hypot(gx - s.x, gy - s.y);
    if (d < s.r * 1.7) v = Math.max(v, clamp01(0.5 + (s.r * (0.62 + 0.8 * fbm(gx / 1500, gy / 1500, 3, 79)) - d) / 600));
  }
  return v;
}

export function outlandAt(which: OutlandField, gx: number, gy: number): number {
  const s = steppeAt(gx, gy);
  switch (which) {
    case 'land': return Math.max(s, s < 0.02 ? isletAt(gx, gy) : 0);
    case 'depth': return Math.max(s, s < 0.02 ? isletAt(gx, gy) * 0.9 : 0);
    case 'elev': return 0.05 + 0.1 * fbm(gx / 9000, gy / 9000, 3, 71);
    case 'arid': return 0.3 + s * (0.18 + 0.24 * fbm(gx / 14000, gy / 14000, 2, 72));
    case 'cold': return 0.06;
    case 'forest': return s > 0.5 ? Math.max(0, fbm(gx / 6000, gy / 6000, 3, 73) - 0.7) * 1.3 : 0.25 + 0.5 * fbm(gx / 3000, gy / 3000, 2, 74);
  }
}
