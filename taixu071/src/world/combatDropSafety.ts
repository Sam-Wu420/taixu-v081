import { ITEMS } from '../data/items';
import { hookNumber } from '../mod/safeNumber';
/** Bound work and reject invalid/prototype item keys supplied by loot hooks. */
export function safeHookDrops(input:unknown):{id:string;n:number}[] {
  if(!Array.isArray(input))return [];
  const out:{id:string;n:number}[]=[];
  for(let i=0;i<Math.min(input.length,1024)&&out.length<256;i++){
    try {const d=input[i];if(!d||typeof d.id!=='string'||!Object.prototype.hasOwnProperty.call(ITEMS,d.id))continue;
      const n=hookNumber(d.n);if(n===null||n<=0)continue;
      out.push({id:d.id,n:Math.max(1,Math.min(9999,Math.round(n)))});
    } catch { /* a bad entry must not break combat */ }
  }
  return out;
}
export interface WorldDrop {x:number;y:number;id:string;n:number;t:number;blocked?:boolean;collecting?:boolean;collected?:boolean}
/** A rejected inventory addition stays on the ground for this session and can be retried. */
export function updateWorldDrop(drop:WorldDrop,player:{x:number;y:number},dead:boolean,dt:number,add:(id:string,n:number)=>boolean,onPickup:(id:string,n:number)=>void,onBlocked?:()=>void):boolean {
  if(drop.collected)return false;
  if(drop.collecting)return true;
  drop.t+=dt;let d=Math.hypot(drop.x-player.x,drop.y-player.y);
  if(drop.id.startsWith('mat_yaodan')&&drop.t>.7&&d<520&&!dead){const k=Math.min(1,dt*(3+(drop.t-.7)*6));drop.x+=(player.x-drop.x)*k;drop.y+=(player.y-40-drop.y)*k;d=Math.hypot(drop.x-player.x,drop.y-player.y);}
  if(!dead&&drop.t>.6&&d<130){
    let added=false;drop.collecting=true;
    try{added=add(drop.id,drop.n);}finally{drop.collecting=false;}
    if(added){drop.collected=true;onPickup(drop.id,drop.n);return false;}const first=!drop.blocked;drop.blocked=true;if(first)onBlocked?.();
  }
  return !!drop.blocked||drop.t<120;
}

/** One pass over the frame snapshot; nested updates wait until the next frame.
 * Compact the live array in place so callback-created drops are not discarded. */
const updatingDropLists = new WeakSet<WorldDrop[]>();
export function updateWorldDrops(drops: WorldDrop[], update: (drop: WorldDrop) => boolean): void {
  if (updatingDropLists.has(drops)) return;
  updatingDropLists.add(drops);
  const frame = drops.slice(), remove = new Set<WorldDrop>();
  try {
    for (const drop of frame) {
      try { if (!update(drop)) remove.add(drop); }
      catch (error) { if (drop.collected) remove.add(drop); throw error; }
    }
  } finally {
    let write = 0;
    for (const drop of drops) if (!remove.has(drop)) drops[write++] = drop;
    drops.length = write;
    updatingDropLists.delete(drops);
  }
}
