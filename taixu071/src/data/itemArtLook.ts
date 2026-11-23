import { artLook } from './artlooks';
import { itemDef } from './items';

/** 从物品数据解析统一法器外观；用于图标、法器动作、护盾与遁具。 */
export function itemArtLook(id: string) {
  const d = itemDef(id);
  return artLook(id, d.art?.kind, d.art?.color, d.art?.look);
}
