import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas} from './env';
import {setCanvasFactory} from '../src/core/canvas';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
let alloc=0;setCanvasFactory((w,h)=>{alloc++;return createCanvas(w,h) as any});
const {TOWN_GATE_KEYS,townGateMips}=await import('../src/gfx/townGates');const {BLD2_SRC}=await import('../src/gfx/bld2Data');const {bldDim,drawBld}=await import('../src/gfx/bldTex2');
assert.equal(TOWN_GATE_KEYS.length,20);const hashes=new Set<string>();
for(const key of TOWN_GATE_KEYS){
 assert.equal(BLD2_SRC[key],undefined,key);const d=bldDim(key)!;assert.ok(d.door&&d.w&&d.h,key);const m=townGateMips(key)!;assert.ok(m.length>=2,key);assert.ok(m[0].width<=512&&m[0].height<=512);
 const n=alloc;assert.equal(townGateMips(key),m);assert.equal(alloc,n);const raw=m[0].getContext('2d')!,im=m[0];
 const px=(x:number,y:number)=>raw.getImageData(Math.floor(im.width*x/100),Math.floor(im.height*y/100),1,1).data;
 const openW=Math.min(36,Math.max(96,d.door!)/d.w*100);
 for(const x of [50-openW*.35,50,50+openW*.35])assert.equal(px(x,85)[3],0,`${key} door ${x}`);
 assert.ok(px(10,92)[3]>0||px(20,92)[3]>0,`${key} foundation`);
 const c=createCanvas(600,600),g:any=c.getContext('2d'),scale=Math.min(1,450/d.w,370/d.h);g.globalAlpha=.8;const tr=g.getTransform();assert.equal(drawBld(g,key,300,450,0,scale,true,.5),true);assert.equal(g.globalAlpha,.8);assert.deepEqual(g.getTransform(),tr);
 const p=g.getImageData(0,0,600,600).data;let count=0,max=0;for(let y=0;y<600;y++)for(let x=0;x<600;x++){const a=p[4*(y*600+x)+3];if(a){count++;max=Math.max(a,max);assert.ok(x>=Math.floor(300-d.w*scale/2)-2&&x<=Math.ceil(300+d.w*scale/2)+2,key);assert.ok(y>=Math.floor(450+((d.b??0)-d.h)*scale)-2&&y<=Math.ceil(450+(d.b??0)*scale)+2,key)}}assert.ok(count>100,key);assert.ok(max<=110,key);hashes.add(createHash('sha256').update(p).digest('hex'));
}
assert.ok(hashes.size>=18,`${hashes.size} distinct`);
function texture(k:string){const c=townGateMips(k)![0];return Buffer.from(c.getContext('2d')!.getImageData(0,0,c.width,c.height).data)}
for(const v of ['dark','snow','rose'])assert.notDeepEqual(texture('b20'),texture('b20|'+v),v);
assert.equal(townGateMips('unknown'),null);
// 真实游戏入口使用的镇牌坊及岛门，通过布局和 Renderer 入口绘制。
const {ALL_LOCATIONS}=await import('../src/data/world');const {layoutLocation}=await import('../src/gfx/building');const {Renderer}=await import('../src/world/render');
const regionMatch: Record<string, (l: any) => boolean> = {
 tiannan: (l) => l.map === 'renjie' && l.ox < 700 && l.oy > 350,
 luanxing: (l) => l.map === 'renjie' && l.ox >= 700,
 dajin: (l) => l.map === 'renjie' && l.oy <= 350,
};
for(const [map,key] of [['tiannan','b29'],['dajin','b29'],['luanxing','x10']]){
 const loc=ALL_LOCATIONS.find((l:any)=>regionMatch[map](l)&&layoutLocation(l).pieces.some((p:any)=>p.kind==='B'&&p.p.k.split('|')[0]===key));assert.ok(loc,`${map} ${key}`);
 const L=layoutLocation(loc!),p=L.pieces.find((p:any)=>p.kind==='B'&&p.p.k.split('|')[0]===key)!;assert.ok(L.blocks.length);
 const dim=bldDim(key)!,s=p.p.s??1,dw=Math.max(96,dim.door!*s)/1.5,depth=Math.min(p.p.h*.38,p.p.w*.42,330)/1.5;
 const near=(a:number,b:number)=>Math.abs(a-b)<1e-7;
 assert.ok(L.blocks.some(b=>near(b.y,p.y-depth)&&near(b.x+b.w,p.x-dw/2)),`${map} left collision`);
 assert.ok(L.blocks.some(b=>near(b.y,p.y-depth)&&near(b.x,p.x+dw/2)),`${map} right collision`);
 const c=createCanvas(800,800),g:any=c.getContext('2d'),r:any=Object.create(Renderer.prototype);r.ctx=g;r.game={cam:{zoom:1}};r.dpr=1;r.xray=()=>.42;r.queuePlaqueWarm=()=>{};r.plaqueSprite=()=>createCanvas(10,10);
 const seen:any[]=[],draw=g.drawImage.bind(g);g.drawImage=(im:any,...a:any[])=>{seen.push(im);return draw(im,...a)};r.drawBldPieceFull(p,400,620,0);
 assert.ok(seen.some(im=>townGateMips(p.p.k)!.includes(im)),`${map} ${key}`);
}
const old=(globalThis as any).document;delete (globalThis as any).document;assert.equal(townGateMips('b20'),null);(globalThis as any).document=old;
setCanvasFactory(()=>{throw Error('canvas unavailable')});assert.equal(townGateMips('f1_gate_b|snow'),null);assert.equal(drawBld(createCanvas(10,10).getContext('2d') as any,'f1_gate_b|snow',0,0,0),false);
console.log('town gates: 20 keys, transparent openings, collision geometry, cached variants, real town/isle render paths and failure handling passed');
