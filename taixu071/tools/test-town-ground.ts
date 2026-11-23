import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCanvas } from './env';
import { setCanvasFactory } from '../src/core/canvas';
(globalThis as any).window = { innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false}) };
(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
let alloc=0;setCanvasFactory((w,h)=>{alloc++;return createCanvas(w,h) as any});
const { townGroundMips,TOWN_GROUND_KEYS }=await import('../src/gfx/townGround');
const { fillPatternTiled, drawDecal }=await import('../src/gfx/bldTex2');
const signatures=new Set<string>();
for(const key of TOWN_GROUND_KEYS){
 const mips=townGroundMips(key)!;assert.deepEqual(mips.map(c=>c.width),[256,128,64,32]);const n=alloc;assert.equal(townGroundMips(key),mips);assert.equal(alloc,n);
 const pixels=mips[0].getContext('2d')!.getImageData(0,0,256,256).data;let nOpaque=0,nTransparent=0;
 for(let i=3;i<pixels.length;i+=4){if(pixels[i])nOpaque++;else nTransparent++}
 assert.ok(nOpaque>1000,key);if(key.startsWith('d_'))assert.ok(nTransparent>100,key);else assert.equal(nTransparent,0,key);
 signatures.add(createHash('sha256').update(pixels).digest('hex'));
}
assert.equal(signatures.size,15);assert.equal(townGroundMips('unknown'),null);
const canvas=createCanvas(320,320),g:any=canvas.getContext('2d');g.globalAlpha=.7;const alpha=g.globalAlpha;
for(const key of ['flag','flag2','slab','jade','farm','farm2','road','road2']){
 g.clearRect(0,0,320,320);assert.equal(fillPatternTiled(g,key,96,0,40,50,200,160),true);assert.equal(g.globalAlpha,alpha);
 const p=g.getImageData(0,0,320,320).data;assert.equal(p[(20*320+20)*4+3],0);assert.ok(p[(80*320+80)*4+3]>0);
}
for(const key of ['d_jade','d_taiji','d_array','d_field','d_flower','d_flower2','d_steps']){g.clearRect(0,0,320,320);assert.equal(drawDecal(g,key,160,160,200,150,0,.5),true);assert.equal(g.globalAlpha,alpha);assert.ok(g.getImageData(160,160,1,1).data[3]>0,key)}
for(const tile of [0,-1,NaN,Infinity])assert.equal(fillPatternTiled(g,'road',tile,0,0,0,100,100),false);
assert.equal(fillPatternTiled(g,'road',1,0,1e16,0,10,10),false);assert.equal(fillPatternTiled(g,'unknown',20,0,0,0,10,10),false);
// 三地域真实城镇布局与 Renderer 地面绘制路径。
const { ALL_LOCATIONS }=await import('../src/data/world'); const {layoutLocation}=await import('../src/gfx/building'); const {Renderer}=await import('../src/world/render');
const keys=new Set<string>();let layouts=0;
const surf=createCanvas(1000,1000),ctx:any=surf.getContext('2d');ctx.translate(500,500);ctx.scale(.12,.12);
const renderer:any=Object.create(Renderer.prototype); renderer.ctx=ctx; renderer.sceneGroundRects=[];
const regionMatch: Record<string, (l: any) => boolean> = {
 tiannan: (l) => l.map === 'renjie' && l.ox < 700 && l.oy > 350,
 luanxing: (l) => l.map === 'renjie' && l.ox >= 700,
 dajin: (l) => l.map === 'renjie' && l.oy <= 350,
};
for(const map of ['tiannan','luanxing','dajin']){
 const loc=ALL_LOCATIONS.find((l:any)=>regionMatch[map](l) && (l.type==='town'||l.type==='isle') && layoutLocation(l).v2);assert.ok(loc,map);
 const layout=layoutLocation(loc!);assert.ok(layout.v2);layouts++;
 for(const piece of layout.ground)if(piece.kind==='pat'||piece.kind==='dec'){keys.add(piece.p!.tex);assert.ok(townGroundMips(piece.p!.tex),piece.p!.tex)}
 renderer.drawLocGround2(layout,0,0,0,-4000,-4000,4000,4000);
}
// 河道保留空洞，铺装不能覆盖水面；场景排序未改动。
const river=createCanvas(300,300), riverCtx:any=river.getContext('2d');const rr:any=Object.create(Renderer.prototype);rr.ctx=riverCtx;rr.sceneGroundRects=[];
rr.drawLocGround2({wet:[{x:80/1.5,y:80/1.5,w:60/1.5,h:60/1.5}],ground:[{kind:'pat',x:100/1.5,y:100/1.5,w:180/1.5,h:180/1.5,p:{tex:'slab',tile:80}}]},0,0,0,0,0,250,250);
assert.equal(riverCtx.getImageData(100,100,1,1).data[3],0);assert.ok(riverCtx.getImageData(35,35,1,1).data[3]>0);
const pixels=ctx.getImageData(0,0,1000,1000).data;let filled=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])filled++;assert.ok(filled>1000);
console.log(`town ground: 15 cached procedural materials, clipping/invalid inputs and ${layouts} real regional layouts passed (${[...keys].join(',')})`);
