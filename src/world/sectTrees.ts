// P10：占山宗门的山林——台地之间的坡、台沿下、石阶两侧成片种树（青霞谷以青霞为主，夹松、柏、竹）。
// 走的是野外树木那一套（地面装饰里的立板树，同一批变体共用贴图，远看是静态立板），几千棵不费事；
// 野外的树林在宗门地界里本来就不长（inLocZone），这里只管地界里的山坡，两边不重叠。
// 落点：按全图坐标的抖动网格取点（哪块地面来问都一样，块与块接得上），再看规划：台面、石阶、桥、悬空峰上不种，真正陡的崖面不种，陡坡只挂松柏。
import { planRise, rectDist, onPlanStair, type GrandSectPlan } from '../data/sectPlan';
import type { Species } from '../gfx/tree';
import type { GrandSectGround } from './sectGround';

/** 各宗门山上的树种（权重按重复次数）；陡坡上换成松柏 */
const MIX: Record<string, Species[]> = {
  huangfeng: ['ymaple', 'ymaple', 'ymaple', 'ymaple', 'ymaple', 'pine', 'pine', 'cypress', 'broad', 'maple'],
};
const STEEP: Species[] = ['pine', 'pine', 'cypress'];

function hash(a: number, b: number, k: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(k, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vn(x: number, y: number, k: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, k), b = hash(ix + 1, iy, k), c = hash(ix, iy + 1, k), d = hash(ix + 1, iy + 1, k);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

export interface SectTree { x: number; y: number; sp: Species; s: number; hv: number; hf: number; hp: number }

/** 一块地面（世界坐标 ox, oy 起、边长 size）里该种的树 */
export function sectChunkTrees(sects: readonly GrandSectGround[], ox: number, oy: number, size: number): SectTree[] {
  const out: SectTree[] = [];
  for (const g of sects) {
    const P = g.plan, R = Math.max(P.rx, P.ry);
    if (g.x + P.cx + R < ox || g.x + P.cx - R > ox + size || g.y + P.cy + R < oy || g.y + P.cy - R > oy + size) continue;
    const mix = (P.look?.trees as Species[] | undefined) ?? MIX[P.id] ?? ['pine', 'pine', 'cypress', 'broad'];
    const C = 78;   // 抖动网格的格子：树与树大致隔开这么远
    for (let gy = Math.floor(oy / C); gy < Math.ceil((oy + size) / C); gy++) for (let gx = Math.floor(ox / C); gx < Math.ceil((ox + size) / C); gx++) {
      const x = (gx + 0.15 + hash(gx, gy, 1) * 0.7) * C, y = (gy + 0.15 + hash(gx, gy, 2) * 0.7) * C;
      if (x < ox || x >= ox + size || y < oy || y >= oy + size) continue;
      const lx = x - g.x, ly = y - g.y;
      if (Math.hypot((lx - P.cx) / P.rx, (ly - P.cy) / P.ry) > 0.99) continue;
      // 疏密：大片的林子里留几块林间空地
      const dens = vn(lx / 900, ly / 900, 7);
      if (hash(gx, gy, 3) > 0.35 + dens * 0.75) continue;
      let near = Infinity;
      for (const t of P.terraces) { near = Math.min(near, rectDist(t, lx, ly)); if (near < 75) break; }
      if (near < 75) continue;                              // 台面、台沿的墙
      if (onPlanStair(P, lx, ly, 110)) continue;             // 石阶两侧留出走道
      let blocked = false;
      for (const b of P.bridges) { const dx = b.x2 - b.x1, dy = b.y2 - b.y1, L2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((lx - b.x1) * dx + (ly - b.y1) * dy) / L2)); if (Math.hypot(lx - b.x1 - dx * t, ly - b.y1 - dy * t) < b.w / 2 + 90) { blocked = true; break; } }
      if (!blocked) for (const s of P.isles) if (Math.hypot(lx - s.x, ly - s.y) < s.r + 60) { blocked = true; break; }
      if (!blocked) for (const f of P.falls) { const px = lx - f.x, py = ly - f.y, along = px * f.dx + py * f.dy, side = Math.abs(px * f.dy - py * f.dx); if (along > -50 && along < 1600 && side < f.w * 0.8) { blocked = true; break; } }
      if (blocked) continue;
      // 坡度：真正陡的崖面不长树，陡坡只挂得住松柏
      const h = planRise(P, lx, ly), sx = planRise(P, lx + 40, ly) - h, sy = planRise(P, lx, ly + 40) - h, slope = Math.hypot(sx, sy) / 40;
      if (slope > 1.9) continue;
      const hsp = hash(gx, gy, 4), steep = slope > 1.15;
      if (steep && hsp > 0.6) continue;
      // 竹子成丛：低处的缓坡上有几片竹林
      const bamboo = !steep && vn(lx / 650 + 40, ly / 650, 9) > 0.72 && h < 1400;
      const sp: Species = bamboo ? 'bamboo' : steep ? STEEP[Math.floor(hsp * STEEP.length) % STEEP.length] : mix[Math.floor(hsp * mix.length) % mix.length];
      // 台沿下一圈的树小一点，免得挡住台上的殿
      const s = (0.8 + hash(gx, gy, 5) * 0.45) * (near < 200 ? 0.8 : 1);
      out.push({ x, y, sp, s, hv: hash(gx, gy, 6), hf: hash(gx, gy, 7), hp: hash(gx, gy, 8) });
    }
  }
  return out;
}
export type { GrandSectPlan };
