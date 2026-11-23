import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas} from './env';
import {setCanvasFactory} from '../src/core/canvas';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
let alloc=0;setCanvasFactory((w,h)=>{alloc++;return createCanvas(w,h) as any});
const {TOWN_HOUSE_KEYS,townHouseMips}=await import('../src/gfx/townHouses');const {BLD2_SRC}=await import('../src/gfx/bld2Data');const {bldDim,drawBld}=await import('../src/gfx/bldTex2');
assert.equal(TOWN_HOUSE_KEYS.length,25);for(const key of TOWN_HOUSE_KEYS)assert.equal(BLD2_SRC[key],undefined,key);
assert.equal(BLD2_SRC['b36_strip'],undefined);assert.equal(BLD2_SRC['b20'],undefined);assert.equal(BLD2_SRC['b01'],undefined);
const hashes=new Set<string>();
for(const key of TOWN_HOUSE_KEYS){
 const m=townHouseMips(key)!;assert.ok(m.length>=2,key);assert.ok(m[0].width<=512&&m[0].height<=512);const n=alloc;assert.equal(townHouseMips(key),m);assert.equal(alloc,n);
 const d=bldDim(key)!,scale=Math.min(1,450/d.w,370/d.h);const cv=createCanvas(600,600),g:any=cv.getContext('2d');g.globalAlpha=.8;const before=g.getTransform();
 assert.equal(drawBld(g,key,300,450,0,scale,true,.5),true,key);assert.equal(g.globalAlpha,.8);assert.deepEqual(g.getTransform(),before);
 const p=g.getImageData(0,0,600,600).data;let count=0,maxAlpha=0;
 for(let y=0;y<600;y++)for(let x=0;x<600;x++){const a=p[4*(y*600+x)+3];if(a){count++;maxAlpha=Math.max(maxAlpha,a);assert.ok(x>=Math.floor(300-d.w*scale/2)-2&&x<=Math.ceil(300+d.w*scale/2)+2,key);assert.ok(y>=Math.floor(450+((d.b??0)-d.h)*scale)-2&&y<=Math.ceil(450+(d.b??0)*scale)+2,key)}}
 assert.ok(count>100,key);assert.ok(maxAlpha<=110,key);hashes.add(createHash('sha256').update(p).digest('hex'));
}
assert.ok(hashes.size>=23,`distinct ${hashes.size}`);
function texture(key:string){const c=townHouseMips(key)![0];return Buffer.from(c.getContext('2d')!.getImageData(0,0,c.width,c.height).data)}
for(const v of ['dark','snow','rose'])assert.notDeepEqual(texture('b02'),texture('b02|'+v),v);
assert.notDeepEqual(texture('j11'),texture('b24a'));assert.equal(townHouseMips('b_missing'),null);
// b02 门心按元数据 dx 偏移；门与两侧墙面可辨认。
const b02=townHouseMips('b02')![0],ctx=b02.getContext('2d')!,d02=bldDim('b02')!;
const at=(x:number,y:number)=>ctx.getImageData(Math.floor(b02.width*x/100),Math.floor(b02.height*y/100),1,1).data;
const door=at(50+(d02.dx??0)/d02.w*100,80),wall=at(20,80);assert.ok(door[3]>0&&wall[3]>0);assert.ok(door[0]+door[1]+door[2]<wall[0]+wall[1]+wall[2]);

// 三个地域真实布局：门与碰撞数据原样由布局生成，排序队列绘制经过真实 Renderer。
const {ALL_LOCATIONS}=await import('../src/data/world');const {layoutLocation}=await import('../src/gfx/building');const {Renderer}=await import('../src/world/render');
const regionMatch: Record<string, (l: any) => boolean> = {
 tiannan: (l) => l.map === 'renjie' && l.ox < 700 && l.oy > 350,
 luanxing: (l) => l.map === 'renjie' && l.ox >= 700,
 dajin: (l) => l.map === 'renjie' && l.oy <= 350,
};
for(const map of ['tiannan','luanxing','dajin']){
 const loc=ALL_LOCATIONS.find((l:any)=>regionMatch[map](l) && (l.type==='town'||l.type==='isle')&&layoutLocation(l).pieces.some((p:any)=>TOWN_HOUSE_KEYS.includes(p.p?.k?.split('|')[0])));assert.ok(loc,map);
 const layout=layoutLocation(loc!),pieces=layout.pieces.filter((p:any)=>TOWN_HOUSE_KEYS.includes(p.p?.k?.split('|')[0]));assert.ok(pieces.length,map);assert.ok(layout.blocks.length);
 const c=createCanvas(800,800),g:any=c.getContext('2d'),r:any=Object.create(Renderer.prototype);r.ctx=g;r.game={cam:{zoom:1}};r.dpr=1;r.xray=()=>.48;let count=0;
 r.queuePlaqueWarm=()=>{};r.plaqueSprite=()=>createCanvas(10,10);for(const p of pieces.slice(0,8)){r.drawBldPieceFull(p,400,620,0);count++}assert.ok(count,map);
 assert.ok(g.getImageData(0,0,800,800).data.some((v:number)=>v!==0),map);
}
const old=(globalThis as any).document;delete (globalThis as any).document;assert.equal(townHouseMips('b02'),null);(globalThis as any).document=old;
setCanvasFactory(()=>{throw Error('canvas unavailable')});assert.equal(townHouseMips('j17|dark'),null);assert.equal(drawBld(createCanvas(10,10).getContext('2d') as any,'j17|dark',0,0,0),false);
console.log('town houses: 25 keys, cache, doors, variants, anchors, region layouts and failure handling passed');
