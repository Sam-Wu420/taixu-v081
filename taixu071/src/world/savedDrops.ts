import type { WorldDrop } from './combatDropSafety';
import { LEGACY_HUMAN_MAP_IDS } from '../data/worldHierarchy';

export interface SavedDrop { x:number; y:number; id:string; n:number }
export type SavedDrops = Record<string, SavedDrop[]>;
/** Only durable, uncollected recovery drops are stored. Inventory callbacks may save
 * during pickup, after the bag was committed but before updateWorldDrop returns. */
export function protectedDrops(drops: readonly WorldDrop[], at?: {x:number;y:number}): SavedDrop[] {
  return drops.filter(d=>d.blocked&&!d.collected&&!d.collecting)
    .map(d=>({x:at?.x??d.x,y:at?.y??d.y,id:d.id,n:d.n}));
}
export function validateSavedDrops(value: unknown, maps: readonly string[], scale: number): asserts value is SavedDrops {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('invalid saved drops');
  const okMap = (m: string) => maps.includes(m) || (maps.includes('renjie') && (LEGACY_HUMAN_MAP_IDS as readonly string[]).includes(m));
  for (const [map, list] of Object.entries(value)) {
    if (!okMap(map) || !Array.isArray(list)) throw Error('invalid saved drop map');
    for (const d of list) {
      if (!d || typeof d !== 'object' || Array.isArray(d) || typeof d.id !== 'string' || !d.id ||
        typeof d.x !== 'number' || typeof d.y !== 'number' || !Number.isFinite(d.x * scale) || !Number.isFinite(d.y * scale) ||
        !Number.isSafeInteger(d.n) || d.n <= 0) throw Error('invalid saved drop');
    }
  }
}
export function restoreSavedDrops(list: readonly SavedDrop[], scale: number): WorldDrop[] {
  return list.map(d=>({x:d.x*scale,y:d.y*scale,id:d.id,n:d.n,t:0,blocked:true}));
}
