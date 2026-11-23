import './env';
import assert from 'node:assert/strict';
import { ALL_LOCATIONS } from '../src/data/world';
import { getLayout } from '../src/gfx/building';
import { renderLocationOutline, LocationOutlineCache } from '../src/gfx/locationLod';

const danger=ALL_LOCATIONS.find(l=>l.name==='金蜈岭南')!;
const L=getLayout(danger), o=renderLocationOutline(L);
const pix=(c:HTMLCanvasElement,x:number,y:number)=>Array.from(c.getContext('2d')!.getImageData(x,y,1,1).data);
for(const [x,y] of [[0,0],[o.canvas.width-1,0],[0,o.canvas.height-1],[o.canvas.width-1,o.canvas.height-1]]) assert.equal(pix(o.canvas,x,y)[3],0,'danger outline corner must stay transparent');
assert(L.pieces.some(p=>p.kind==='rock'&&p.p.cave));
const cache=new LocationOutlineCache();const v=cache.build(L);for(let i=0;i<50&&cache.isPending(L);i++)cache.step(L);
assert(v.refined);for(const [x,y] of [[0,0],[v.refined!.width-1,0],[0,v.refined!.height-1],[v.refined!.width-1,v.refined!.height-1]])assert.equal(pix(v.refined!,x,y)[3],0);
const village=ALL_LOCATIONS.find(l=>l.name==='柳溪村')!;const town=getLayout(village);const farm=town.ground.find(g=>g.p?.tex==='farm2')!;assert(farm);
// Isolate a real generated farm so buildings cannot mask its pigment.
const field={...town,ground:[farm],pieces:[],wet:undefined};const f=renderLocationOutline(field);const x=Math.round((farm.x+f.ax)*f.canvas.width/f.w),y=Math.round((farm.y+f.ay)*f.canvas.height/f.h);const color=pix(f.canvas,x,y);assert(color[3]>200);assert(color[0]>color[2]*1.15,`farm retains soil colour: ${color}`);
const decal={...field,ground:[{...farm,kind:'dec' as const,p:{tex:'d_field'}}]};const d=renderLocationOutline(decal);const dx=Math.round((farm.x+d.ax)*d.canvas.width/d.w),dy=Math.round((farm.y+d.ay)*d.canvas.height/d.h);assert(pix(d.canvas,dx,dy)[3]>100);
console.log('location LOD: real danger transparent corners and rocks; village farm and spirit-field pigments retained');

// Compare mean pigments, not a single texel: the near image keeps fine furrows,
// while the outline is prefiltered at a lower resolution.
import { createCanvas } from './env';
import { fillPatternTiled } from '../src/gfx/bldTex2';
import { LOC_SCALE } from '../src/gfx/building';
for(const tex of ['farm','farm2']) {
  const original={...farm,p:{...farm.p,tex}};const isolated={...town,ground:[original],pieces:[],wet:undefined};const out=renderLocationOutline(isolated);
  const near=createCanvas(600,400),g=near.getContext('2d');g.translate(300,200);
  assert(fillPatternTiled(g as any,tex,(original.p!.tile??300),0,-original.w*LOC_SCALE/2,-original.h*LOC_SCALE/2,original.w*LOC_SCALE,original.h*LOC_SCALE));
  const mean=(canvas:any,x0:number,y0:number,w:number,h:number)=>{const data=canvas.getContext('2d').getImageData(Math.round(x0),Math.round(y0),Math.max(1,Math.round(w)),Math.max(1,Math.round(h))).data;const a=[0,0,0];for(let i=0;i<data.length;i+=4)for(let k=0;k<3;k++)a[k]+=data[i+k];return a.map(v=>v/(data.length/4));};
  const ns=mean(near,300-original.w*LOC_SCALE*.3,200-original.h*LOC_SCALE*.3,original.w*LOC_SCALE*.6,original.h*LOC_SCALE*.6);
  const sx=out.canvas.width/out.w,sy=out.canvas.height/out.h;
  const fs=mean(out.canvas,(out.ax+original.x-original.w*.3)*sx,(out.ay+original.y-original.h*.3)*sy,original.w*.6*sx,original.h*.6*sy);
  assert(ns.every((v,i)=>Math.abs(v-fs[i])<25),`${tex} near/far mean mismatch ${ns} vs ${fs}`);
}
const scare=town.pieces.find(p=>p.p.k==='p_scarecrow');assert(scare,'actual village includes scarecrow');
const caveRock=L.pieces.find(p=>p.kind==='rock');assert(caveRock,'danger includes rock');
for (const pc of [scare!,caveRock!]) {
 const isolated={...L,ground:[],pieces:[pc],wet:undefined};const pic=renderLocationOutline(isolated);
 const data=pic.canvas.getContext('2d')!.getImageData(0,0,pic.canvas.width,pic.canvas.height).data;
 assert(data.some((v,i)=>i%4===3&&v>0),`${pc.kind} has a far silhouette`);
}
console.log('village farm/farm2 mean colours remain close; scarecrow and rocks retain outline');
