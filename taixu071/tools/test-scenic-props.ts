import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCanvas } from './env';
import { setCanvasFactory } from '../src/core/canvas';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
let alloc=0;setCanvasFactory((w,h)=>{alloc++;return createCanvas(w,h) as any});
const {SCENIC_PROP_KEYS,scenicPropMips}=await import('../src/gfx/scenicProps');
const {PROP2}=await import('../src/gfx/propDims');const {PROP_SRC}=await import('../src/gfx/propData');const {drawBld}=await import('../src/gfx/bldTex2');
const {SJ_TN,SJ_DJ}=await import('../src/data/shengjing');
assert.equal(SCENIC_PROP_KEYS.length,12);assert.equal(Object.keys(PROP_SRC).length,0);
assert.deepEqual(new Set(Object.keys(PROP2).filter(k=>k.startsWith('p_s_'))),new Set(SCENIC_PROP_KEYS));
for(const s of [...SJ_TN,...SJ_DJ])assert.ok(SCENIC_PROP_KEYS.includes(('p_'+s.tex) as any),s.tex);
const sig=new Set<string>();
for(const key of SCENIC_PROP_KEYS){
 const m=scenicPropMips(key)!;assert.ok(m.length>=2,key);assert.ok(m[0].width<=512&&m[0].height<=512);const n=alloc;assert.equal(scenicPropMips(key),m);assert.equal(alloc,n);
 const cv=createCanvas(600,600),g:any=cv.getContext('2d'),d=PROP2[key],sc=Math.min(450/d.w,400/d.h);
 g.globalAlpha=.8;const before=g.getTransform();assert.equal(drawBld(g,key,300,450,0,sc,true,.5),true);assert.equal(g.globalAlpha,.8);assert.deepEqual(g.getTransform(),before);
 const p=g.getImageData(0,0,600,600).data;let count=0,max=0;
 for(let y=0;y<600;y++)for(let x=0;x<600;x++){const a=p[4*(y*600+x)+3];if(a){count++;max=Math.max(max,a);assert.ok(x>=Math.floor(300-d.w*sc/2)-2&&x<=Math.ceil(300+d.w*sc/2)+2,key);assert.ok(y>=Math.floor(450-d.h*sc)-2&&y<=452,key)}}
 assert.ok(count>200,key);assert.ok(max<=110,key);sig.add(createHash('sha256').update(p).digest('hex'));
}
assert.equal(sig.size,12);assert.equal(scenicPropMips('unknown'),null);
function texture(key:string){const c=scenicPropMips(key)![0];return Buffer.from(c.getContext('2d')!.getImageData(0,0,c.width,c.height).data)}
for(const v of ['dark','snow','rose'])assert.notDeepEqual(texture('p_s_tower'),texture('p_s_tower|'+v),v);
const bridge=scenicPropMips('p_s_bridge')![0],bg=bridge.getContext('2d')!;const pixel=(x:number,y:number)=>bg.getImageData(Math.floor(bridge.width*x/100),Math.floor(bridge.height*y/100),1,1).data[3];
assert.ok(pixel(50,58)>0);for(let i=0;i<7;i++)assert.equal(pixel(12+i*12.6,78),0,`arch ${i}`);
const {LANDMARKS}=await import('../src/data/landmarks');const {LandmarkSys}=await import('../src/world/landmarks');
const stands=LANDMARKS.flatMap(l=>l.stands).filter(s=>s.tex?.startsWith('p_s_'));assert.ok(stands.length);
const lm=new LandmarkSys({cam:{zoom:1},ws:{flags:{}}} as any);
for(const stand of stands.slice(0,8)){
 const queue:any[]=[];lm.collect(queue,{left:stand.x-10,right:stand.x+10,top:stand.y-10,bottom:stand.y+10},0);
 const c=createCanvas(600,600),g:any=c.getContext('2d');g.translate(300,450);g.scale(.2,.2);g.translate(-stand.x,-stand.y);
 const seen:any[]=[],draw=g.drawImage.bind(g);g.drawImage=(im:any,...a:any[])=>{seen.push(im);return draw(im,...a)};
 for(const d of queue.filter(x=>x.y===stand.y))d.draw(g);
 assert.ok(seen.some(im=>scenicPropMips(stand.tex!)!.includes(im)),stand.tex);
}
// 原始桥梁贴合河道逻辑不依赖图片加载或程序画材像素尺寸。
const snap=stands.find(s=>s.snap);assert.ok(snap);const original={...snap};
try {const river=new LandmarkSys({terrain:{riverGeo:{edgeDist:(x:number)=>Math.abs(x-original.x)-310}},cam:{zoom:1},ws:{flags:{}}} as any);(river as any).snapBridges();assert.ok(Math.abs(snap.x-original.x)<30);assert.ok(snap.sc!>=.55&&snap.sc!<=1.8);assert.ok(Math.abs(snap.w-PROP2[snap.tex!].w*snap.sc!)<1e-8)}finally{Object.assign(snap,original)}
const doc=(globalThis as any).document;delete (globalThis as any).document;assert.equal(scenicPropMips('p_s_bridge'),null);(globalThis as any).document=doc;
setCanvasFactory(()=>{throw Error('no canvas')});assert.equal(scenicPropMips('p_s_bridge|snow'),null);assert.equal(drawBld(createCanvas(10,10).getContext('2d') as any,'p_s_bridge|snow',0,0,0),false);
console.log(`scenic props: ${SCENIC_PROP_KEYS.length} keys, two-region data, bridge arches, real landmark queue and failure handling passed`);
