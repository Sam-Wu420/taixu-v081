// 新装备（发冠、腰带、护腕、戒指、玉佩；玄龟、崩山两套）的图标。our-codex-image 画的，tools/slice-sheet.mjs 切成 128px。
// 寻常的七阶共用一张（品阶靠格子的边色分），套装各有各的。
import g0 from '../assets/icons/gear_crown.webp?inline';
import g1 from '../assets/icons/gear_belt.webp?inline';
import g2 from '../assets/icons/gear_wrist.webp?inline';
import g3 from '../assets/icons/gear_ring.webp?inline';
import g4 from '../assets/icons/gear_pendant.webp?inline';
import g5 from '../assets/icons/gear_xg_crown.webp?inline';
import g6 from '../assets/icons/gear_xg_belt.webp?inline';
import g7 from '../assets/icons/gear_xg_ring.webp?inline';
import g8 from '../assets/icons/gear_xg_pendant.webp?inline';
import g9 from '../assets/icons/gear_bs_crown.webp?inline';
import g10 from '../assets/icons/gear_bs_belt.webp?inline';
import g11 from '../assets/icons/gear_bs_wrist.webp?inline';
import g12 from '../assets/icons/gear_bs_ring.webp?inline';
const BY: Record<string, string> = { crown: g0, belt: g1, wrist: g2, ring: g3, pendant: g4, xg_crown: g5, xg_belt: g6, xg_ring: g7, xg_pendant: g8, bs_crown: g9, bs_belt: g10, bs_wrist: g11, bs_ring: g12 };
/** 装备 id（gear_<槽位>_<品阶> 或 gear_<套装>_<槽位>）对应的图标；不是装备返回 null */
export function gearIcon(id: string): string | null {
  if (!id.startsWith('gear_')) return null;
  const k = id.slice(5);
  return BY[k] || BY[k.replace(/_[0-9]+$/, '')] || null;
}
