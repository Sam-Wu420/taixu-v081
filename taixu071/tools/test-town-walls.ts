import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCanvas } from './env';
import { setCanvasFactory } from '../src/core/canvas';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
let alloc=0;setCanvasFactory((w,h)=>{alloc++;return createCanvas(w,h) as any});
const {TOWN_WALL_KEYS,townWallMips}=await import('../src/gfx/townWalls');const {drawWallRun,drawBld,bldDim}=await import('../src/gfx/bldTex2');const {BLD2_SRC}=await import('../src/gfx/bld2Data');
assert.equal(TOWN_WALL_KEYS.length,7);const hashes=new Set<string>();
for(const key of TOWN_WALL_KEYS){
 assert.equal(BLD2_SRC[key],undefined,key);const m=townWallMips(key)!;assert.ok(m.length>=2,key);const n=alloc;assert.equal(townWallMips(key),m);assert.equal(alloc,n);
 const image=m[0].getContext('2d')!.getImageData(0,0,m[0].width,m[0].height).data;hashes.add(createHash('sha256').update(image).digest('hex'));
 const c=createCanvas(720,320),g:any=c.getContext('2d');g.globalAlpha=.8;const before=g.getTransform();
 assert.equal(drawWallRun(g,key,50,650,250,160,0,.5),true,key);assert.equal(g.globalAlpha,.8);assert.deepEqual(g.getTransform(),before);
 const pix=g.getImageData(0,0,720,320).data;for(let x=51;x<649;x++)assert.ok(pix[(180*720+x)*4+3]>0,`${key}: gap ${x}`);
 assert.equal(pix[(180*720+20)*4+3],0);assert.equal(pix[(270*720+100)*4+3],0);
 let count=0;for(let i=3;i<pix.length;i+=4){if(pix[i])count++;assert.ok(pix[i]<=170,key)}assert.ok(count>10000,key);
 const d=bldDim(key)!;assert.ok(d.w>0&&d.h>0);assert.equal(drawBld(g,key,360,250,0,.5,true,.5),true);
}
assert.equal(hashes.size,7);assert.equal(townWallMips('not_a_wall'),null);
function texture(k:string){const c=townWallMips(k)![0];return Buffer.from(c.getContext('2d')!.getImageData(0,0,c.width,c.height).data)}
for(const v of ['dark','snow','rose'])assert.notDeepEqual(texture('b13_strip'),texture('b13_strip|'+v),v);
const c=createCanvas(100,100),g:any=c.getContext('2d');for(const [x0,x1,y,h] of [[0,100,0,0],[0,100,0,-1],[NaN,100,0,1],[0,Infinity,0,1],[20,10,0,1],[0,1e12,0,1],[1e16,1e16+100,0,.001]])assert.equal(drawWallRun(g,'b13_strip',x0,x1,y,h,0),false);
// 走天南、大晋真实布局产出的墙段，使用与 Renderer 同样的世界坐标和绘制参数；乱星海所有墙材键在上面直接覆盖。
const {ALL_LOCATIONS}=await import('../src/data/world');const {layoutLocation}=await import('../src/gfx/building');let rendered=0;
const regionMatch: Record<string, (l: any) => boolean> = {
 tiannan: (l) => l.map === 'renjie' && l.ox < 700 && l.oy > 350,
 dajin: (l) => l.map === 'renjie' && l.oy <= 350,
};
for(const map of ['tiannan','dajin']){
 const layouts=ALL_LOCATIONS.filter((l:any)=>regionMatch[map](l)).map((l:any)=>layoutLocation(l));
 const piece=layouts.flatMap((l:any)=>l.pieces).find((p:any)=>p.kind==='W'&&TOWN_WALL_KEYS.includes(p.p.k.split('|')[0]));assert.ok(piece,map);
 const p=piece.p,cv=createCanvas(900,400),ctx:any=cv.getContext('2d');ctx.translate(450,350);ctx.scale(.2,.2);
 assert.equal(drawWallRun(ctx,p.k,-p.len/2,p.len/2,0,p.hh,0,.42),true,map);assert.ok(ctx.getImageData(0,0,900,400).data.some((v:number)=>v!==0),map);rendered++;
}
const doc=(globalThis as any).document;delete (globalThis as any).document;assert.equal(townWallMips('b13_strip'),null);(globalThis as any).document=doc;
setCanvasFactory(()=>{throw Error('no canvas')});assert.equal(townWallMips('b36_strip|rose'),null);assert.equal(drawWallRun(c.getContext('2d') as any,'b36_strip|rose',0,50,70,40,0),false);
console.log(`town walls: ${TOWN_WALL_KEYS.length} strips, tiling, bounds, variants and ${rendered} actual regional layouts passed`);
