import './env';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas} from './env';
import {ALL_LOCATIONS} from '../src/data/world';
import {getLayout} from '../src/gfx/building';
import {locationDetailWeight,renderLocationOutline,drawLocationOutlineFallback,LocationOutlineCache} from '../src/gfx/locationLod';
assert.equal(locationDetailWeight(0.02),0);assert.equal(locationDetailWeight(.1),0);assert.equal(locationDetailWeight(.2),1);assert.equal(locationDetailWeight(NaN),0);
let previous=0;for(let z=.1;z<=.2;z+=.001){const w=locationDetailWeight(z);assert.ok(w>=previous);assert.ok(w>=0&&w<=1);previous=w;}
const domainMatch: Record<string, (v: any) => boolean> = {
 tiannan: (v) => v.map === 'renjie' && v.ox < 700 && v.oy > 350,
 luanxing: (v) => v.map === 'renjie' && v.ox >= 700,
 dajin: (v) => v.map === 'renjie' && v.oy <= 350,
};
const selected:any[]=[];for(const dom of ['tiannan','luanxing','dajin'])for(const type of ['sect','city','town']){const loc=ALL_LOCATIONS.find((v:any)=>domainMatch[dom](v)&&v.type===type);if(loc)selected.push(loc);}
assert.ok(selected.length>=6);const hashes=new Set<string>();const layouts:any[]=[];
for(const loc of selected){const L=getLayout(loc);layouts.push(L);const before=JSON.stringify(L);const o=renderLocationOutline(L);assert.equal(JSON.stringify(L),before);assert.ok(o.canvas.width<=256&&o.canvas.height<=256);assert.ok(o.w>L.gw&&o.h>L.gh);const c:any=o.canvas,g=c.getContext('2d'),p=g.getImageData(0,0,c.width,c.height).data;let alpha=0;for(let i=3;i<p.length;i+=4)if(p[i])alpha++;assert.ok(alpha>5,loc.id);hashes.add(createHash('sha256').update(p).digest('hex'));
 const v=createCanvas(400,400),vg:any=v.getContext('2d');vg.translate(200,200);vg.scale(.1,.1);const transform=vg.getTransform();drawLocationOutlineFallback(vg,L,0,0);assert.deepEqual(vg.getTransform(),transform);assert.ok(vg.getImageData(0,0,400,400).data.some((a:number)=>a));
}
assert.ok(hashes.size>=Math.min(selected.length,6));
const cache=new LocationOutlineCache(2),a=cache.build(layouts[0]);assert.equal(cache.get(layouts[0]),a);cache.build(layouts[1]);cache.get(layouts[0]);cache.build(layouts[2]);assert.equal(cache.size,2);assert.equal(cache.get(layouts[1]),undefined);assert.equal(cache.get(layouts[0]),a);cache.clear();assert.equal(cache.size,0);
// 真实建筑按每帧一件增量生成完整轮廓，完成后按帧交叉淡入。
const refine=new LocationOutlineCache(2), L=layouts[0], entry=refine.build(L);const job=(refine as any).jobs.get(L);const first=job.index;refine.step(L);assert.ok(job.index<=first+1);let steps=0;while(refine.pending && steps++<500)refine.step(L);assert.equal(refine.pending,0);assert.ok(entry.refined);assert.equal(refine.blend(entry),0);for(let i=0;i<20;i++)refine.step(null);assert.equal(refine.blend(entry),1);
assert.notDeepEqual(Buffer.from((entry.canvas as any).toBuffer('image/png')),Buffer.from((entry.refined as any).toBuffer('image/png')));
// 城镇河道不得被简化铺装盖住。
const synthetic:any={id:'wet',gw:800,gh:800,pal:{ground:'#d8ccaa',roof:'#445566',wall:'#ddd'},pieces:[],ground:[{kind:'pat',x:0,y:0,w:600,h:600}],wet:[{x:-60,y:-60,w:120,h:120}]};
const o:any=renderLocationOutline(synthetic),ctx=o.canvas.getContext('2d');const center=ctx.getImageData(Math.floor(o.canvas.width/2),Math.floor(o.canvas.height/2),1,1).data;assert.equal(center[3],0);
// 雷鸣仙港房屋、大殿、角楼的简化 LOD 轮廓必须与原图总高度一致（不能矮截一半）。
const {drawLocationPieceFallback: drawFallback, locationPieceVisualHeight} = await import('../src/gfx/locationLod');
const {renderPiece, LOC_SCALE} = await import('../src/gfx/building');
const harbor = ALL_LOCATIONS.find((v:any) => v.id === 'leihai_gang')!;
const harborL = getLayout(harbor);
const topPixel = (cv: any) => {
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] > 16) return y;
  return cv.height;
};
for (const kind of ['house', 'hall', 'tower'] as const) {
  const pc = harborL.pieces.find((p) => p.kind === kind)!;
  assert.ok(pc, `leihai_gang missing ${kind}`);
  const full = renderPiece(pc, harborL.pal, 1, 1);
  const fullTop = full.ay - topPixel(full.canvas);
  const fbCv: any = createCanvas(400, 400);
  const fg = fbCv.getContext('2d');
  drawFallback(fg, pc, harborL, 200, 350, 1);
  const fbTop = (350 - topPixel(fbCv)) / LOC_SCALE;
  assert.ok(Math.abs(fbTop - fullTop) <= Math.max(10, fullTop * 0.12), `${kind} LOD height mismatch: fallback=${fbTop.toFixed(1)} vs full=${fullTop.toFixed(1)}`);
  assert.ok(locationPieceVisualHeight(pc) >= fullTop * 0.85, `${kind} locationPieceVisualHeight=${locationPieceVisualHeight(pc)} too small vs full=${fullTop}`);
}
console.log('location LOD: smooth weights, actual regional sect/city/town layouts, bounds, water holes, fallback and LRU passed (Canvas2D)');
