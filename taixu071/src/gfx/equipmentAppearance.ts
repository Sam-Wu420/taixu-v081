// 把已装备物品的可穿戴外观合成到人物上；不修改衣橱/装备数据或游戏属性。
import { ITEMS } from '../data/items';
import { itemArtLook } from '../data/itemArtLook';
import type { Look } from './renwu/types';

export type VisibleEquipment = { armor?: string; boots?: string };
const memo = new WeakMap<Look, { key: string; look: Look }>();
const rgb = (s: unknown): s is string => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
export function equipmentAppearance(base: Look, equipment: VisibleEquipment | undefined, enabled: boolean): Look {
  if (!enabled || !equipment) return base;
  const armor = typeof equipment.armor === 'string' && Object.prototype.hasOwnProperty.call(ITEMS, equipment.armor) ? ITEMS[equipment.armor] : undefined;
  const boots = typeof equipment.boots === 'string' && Object.prototype.hasOwnProperty.call(ITEMS, equipment.boots) ? ITEMS[equipment.boots] : undefined;
  const armorArt = armor?.type === 'artifact' && armor.art?.kind === 'armor' && armor.art.wear?.visible !== false ? armor.art : undefined;
  const bootsArt = boots?.type === 'artifact' && boots.art?.kind === 'boots' && boots.art.wear?.visible !== false ? boots.art : undefined;
  const armorLook = armorArt ? itemArtLook(armor!.id) : undefined;
  const bootsLook = bootsArt ? itemArtLook(boots!.id) : undefined;
  const over = armorLook ? (armorLook.shape === 'cloak' ? 'cape' : 'armor') : undefined;
  const armorColor = armorArt && rgb(armorArt.wear?.color) ? armorArt.wear.color : armorLook?.c1;
  const bootsColor = bootsArt && rgb(bootsArt.wear?.color) ? bootsArt.wear.color : bootsLook?.c1;
  if (!over && !bootsColor) return base;
  const key = JSON.stringify([over, armorColor, bootsColor]);
  const previous = memo.get(base); if (previous?.key === key) return previous.look;
  const look: Look = { ...base, ...(over && armorColor ? { over, overColor: armorColor } : {}), ...(bootsColor ? { boots: bootsColor } : {}) };
  memo.set(base, { key, look }); return look;
}
