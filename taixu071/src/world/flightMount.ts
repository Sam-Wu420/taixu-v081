import { itemDef } from '../data/items';
import { itemArtLook } from '../data/itemArtLook';
import { bagCount, type Hero } from './cultivation';

/** 仅允许真正可御器/御剑/乘舟/展翼飞行的法器进入独立御器栏，避免盾牌、甲胄、大鼎、山印等被踩在脚下飞。 */
export function isFlightMountItem(id: string): boolean {
  const art = itemDef(id).art;
  if (!art) return false;
  if (art.kind === 'flight' || art.kind === 'wings' || art.kind === 'sword') return true;
  return itemArtLook(id).shape === 'cloak';
}

/** Independent visual mount. Possession is checked each time so a sold/lost artifact cannot persist as a phantom. */
export function flightMount(hero: Hero): string | undefined {
  const id = hero.flightMount;
  return typeof id === 'string' && isFlightMountItem(id) && bagCount(hero, id) > 0 ? id : undefined;
}

/** 实际渲染/展示用的飞行外观：优先取独立御器栏，未单设时自动沿用法器页祭出的飞行法器（equip.flight）。 */
export function effectiveFlightMount(hero: Hero): string | undefined {
  const visual = flightMount(hero);
  if (visual) return visual;
  const eq = hero.equip?.flight;
  return typeof eq === 'string' && isFlightMountItem(eq) && bagCount(hero, eq) > 0 ? eq : undefined;
}

/** Mount stays in the bag; combat casting/equipment is not modified. */
export function setFlightMount(hero: Hero, id: string | null): boolean {
  if (id === null) { hero.flightMount = undefined; return true; }
  if (!id || !isFlightMountItem(id) || bagCount(hero, id) <= 0) return false;
  hero.flightMount = id;
  return true;
}
