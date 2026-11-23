// v0.72 · 远景「林色」层
//
// 目的：缩放时**世界不许消失**。树小到只剩一两个像素，继续画精灵只是糊成噪点；
// 正确的做法是在同一个位置换成一团同色的小块——远看是一片林子，放大变成真树，
// 中间只看到「变实 / 变淡」，看不到切换。
//
// 两条约束（都由 gfx/lod.ts 的 treeTiers 保证）：
//   1. 精灵权重 + 林色权重 ≡ 1 —— 换挡时两端同时各出一半，总墨量不变；
//   2. 林色只跟着**树自己的位置和尺寸**走，不另算网格 —— 与精灵逐像素对齐，
//      不会出现「树在原地、色块在旁边」的错位。
//
// 颜色来自 gfx/tree.ts 的 coverColor（与真树同一套配色，四季同步）。
import { GONE, TREE_TIER, treeTiers, smooth } from '../gfx/lod';
import { coverColor, type Season } from '../gfx/tree';
import type { TreeDeco } from './terrain';

/** 树在屏上的高度（设备像素）→ 两段表示的权重；treePx ≤ TREE_TIER[0] 时全是林色 */
export const tiersFor = (treePx: number) => treeTiers(treePx);

/** 一块林色的不透明度：只由树的屏上高度决定，与缩放值本身无关 */
export const coverAlpha = (treePx: number) =>
  !Number.isFinite(treePx) || treePx <= 0 ? 1 : 1 - smooth(TREE_TIER[0], TREE_TIER[1], treePx);

/** 在树的原位画一团同色小块（世界坐标；调用方已把 ctx 变换成世界→屏幕） */
export function drawTreeCover(
  g: CanvasRenderingContext2D, d: TreeDeco, season: Season, alpha: number, treeScale = 1,
): boolean {
  if (!(alpha > GONE) || !d) return false;
  const rx = Math.max(0.6, d.w * d.s * treeScale * 0.34);
  const ry = Math.max(0.6, d.h * d.s * treeScale * 0.30);
  const a0 = g.globalAlpha;
  g.globalAlpha = a0 * Math.min(1, alpha);
  g.fillStyle = coverColor(d.sp, season);
  g.beginPath();
  // 中心略高于树根（树冠重心），与精灵的落点一致
  g.ellipse(d.x, d.y - ry * 0.9, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = a0;
  return true;
}

/** 一批树的林色（同一块地里的抽样树，位置即真实树位） */
export function drawTreeCovers(
  g: CanvasRenderingContext2D, trees: readonly TreeDeco[], season: Season, alpha: number,
  treeScale = 1, limit = 2048,
): number {
  let n = 0;
  for (const d of trees) {
    if (n >= limit) break;
    if (drawTreeCover(g, d, season, alpha, treeScale)) n++;
  }
  return n;
}
