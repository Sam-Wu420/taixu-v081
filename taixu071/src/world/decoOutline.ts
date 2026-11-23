import type { TreeDeco } from './terrain';

/** Stable spatial selection of real trees; the selected trees keep their own position and sprite. */
export function representativeTrees(trees: readonly TreeDeco[], cx:number, cy:number, chunk:number, max:number, spatialSort = false): TreeDeco[] {
  if (!(chunk>0) || !Number.isFinite(chunk) || !Number.isFinite(max) || max < 1) return [];
  max=Math.floor(max);
  const valid=trees.filter(d=>[d.x,d.y,d.w,d.h,d.s].every(Number.isFinite));
  if(!spatialSort && valid.length<=max)return valid.slice();
  const lim = Math.min(max, valid.length);
  // Interleave 8×8 cells so dense groves keep their overall shape, not one large coloured oval.
  const cells:TreeDeco[][]=Array.from({length:64},()=>[]);
  for(const d of valid){const x=Math.max(0,Math.min(7,Math.floor((d.x-cx*chunk)*8/chunk))),y=Math.max(0,Math.min(7,Math.floor((d.y-cy*chunk)*8/chunk)));cells[y*8+x].push(d);}
  for(const c of cells)c.sort((a,b)=>a.y-b.y||a.x-b.x||a.v-b.v);
  const out:TreeDeco[]=[];
  for(let layer=0;out.length<lim;layer++) {let added=false;for(let i=0;i<64;i++){let j=0;for(let bit=0;bit<6;bit++)j=(j<<1)|((i>>bit)&1);const x=(j&1)|((j>>1)&2)|((j>>2)&4),y=((j>>1)&1)|((j>>2)&2)|((j>>3)&4);const cell=cells[y*8+x];if(cell[layer]){out.push(cell[layer]);added=true;if(out.length>=lim)break;}}if(!added)break;}
  return out;
}

/** Visit low-detail far tree sprites with the same per-chunk distribution and limit rules. */
export function forEachFarTreeSprite<T>(
  chunks: readonly (readonly TreeDeco[])[],
  spriteFor: (tree: TreeDeco) => T | null | undefined,
  limit: number,
  perChunk: number,
  visit: (tree: TreeDeco, sprite: T) => void,
): number {
  let count = 0;
  for (const trees of chunks) {
    let taken = 0;
    for (const d of trees) {
      if (count >= limit) return count;
      if (perChunk > 0 && taken >= perChunk) break;
      taken++; count++;
      const sprite = spriteFor(d);
      if (sprite) visit(d, sprite);
    }
  }
  return count;
}

/** Draw the same low-detail sprites at their real anchors without per-tree transforms for the common unflipped case. */
export function drawFarTreeSprites(g:CanvasRenderingContext2D, chunks:readonly (readonly TreeDeco[])[], spriteFor:(tree:TreeDeco)=>{canvas:HTMLCanvasElement;ax:number;ay:number;w:number;h:number}|null|undefined, treeScale:number, limit=2048, perChunk=0):number {
  let count=0;
  for(const trees of chunks) {
    let taken=0;
    for(const d of trees) {
      if(count>=limit)return count;
      // perChunk>0：每块最多取这么多棵，保证代表树均匀铺满视野，而不是全挤在最近的那几块里
      if(perChunk>0 && taken>=perChunk)break;
      taken++; count++;
      const sprite=spriteFor(d);if(!sprite)continue;
      const scale=d.s*treeScale;
      if(d.flip){g.save();g.translate(d.x,d.y);g.scale(-1,1);g.drawImage(sprite.canvas,-sprite.ax*scale,-sprite.ay*scale,sprite.w*scale,sprite.h*scale);g.restore();}
      else g.drawImage(sprite.canvas,d.x-sprite.ax*scale,d.y-sprite.ay*scale,sprite.w*scale,sprite.h*scale);
    }
  }
  return count;
}
