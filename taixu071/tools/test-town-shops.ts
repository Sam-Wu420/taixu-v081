import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas} from './env';
import {setCanvasFactory} from '../src/core/canvas';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
let alloc=0;setCanvasFactory((w,h)=>{alloc++;return createCanvas(w,h) as any});
const {TOWN_SHOP_KEYS,townShopMips}=await import('../src/gfx/townShops');const {BLD2_SRC}=await import('../src/gfx/bld2Data');const {bldDim,drawBld}=await import('../src/gfx/bldTex2');
assert.equal(TOWN_SHOP_KEYS.length,15);const hashes=new Set<string>();
for(const key of TOWN_SHOP_KEYS){
 assert.equal(BLD2_SRC[key],undefined,key);const d=bldDim(key)!,m=townShopMips(key)!;assert.ok(m.length>=2,key);assert.ok(m[0].width<=512&&m[0].height<=512);const n=alloc;assert.equal(townShopMips(key),m);assert.equal(alloc,n);
 const c=createCanvas(600,600),g:any=c.getContext('2d'),scale=Math.min(1,450/d.w,370/d.h);g.globalAlpha=.8;const tr=g.getTransform();
 assert.equal(drawBld(g,key,300,450,0,scale,true,.5),true,key);assert.equal(g.globalAlpha,.8);assert.deepEqual(g.getTransform(),tr);
 const p=g.getImageData(0,0,600,600).data;let count=0,max=0;for(let y=0;y<600;y++)for(let x=0;x<600;x++){const a=p[4*(y*600+x)+3];if(a){count++;max=Math.max(a,max);assert.ok(x>=Math.floor(300-d.w*scale/2)-2&&x<=Math.ceil(300+d.w*scale/2)+2,key);assert.ok(y>=Math.floor(450+((d.b??0)-d.h)*scale)-2&&y<=Math.ceil(450+(d.b??0)*scale)+2,key)}}
 assert.ok(count>100,key);assert.ok(max<=110,key);hashes.add(createHash('sha256').update(p).digest('hex'));
}
assert.ok(hashes.size>=14,`${hashes.size} distinct`);
function texture(key:string){const c=townShopMips(key)![0];return Buffer.from(c.getContext('2d')!.getImageData(0,0,c.width,c.height).data)}
for(const v of ['dark','snow','rose'])assert.notDeepEqual(texture('b16'),texture('b16|'+v),v);
assert.notDeepEqual(texture('b23a'),texture('b23b'));assert.equal(townShopMips('unknown'),null);
// 真实布局功能设施保留原门、名称、碰撞、商铺配套物；Renderer 的门牌预热路径仍调用。
const {ALL_LOCATIONS}=await import('../src/data/world');const {layoutLocation}=await import('../src/gfx/building');const {Renderer}=await import('../src/world/render');
const regionMatch: Record<string, (l: any) => boolean> = {
 tiannan: (l) => l.map === 'renjie' && l.ox < 700 && l.oy > 350,
 luanxing: (l) => l.map === 'renjie' && l.ox >= 700,
 dajin: (l) => l.map === 'renjie' && l.oy <= 350,
};
for(const map of ['tiannan','luanxing','dajin']){
 const loc=ALL_LOCATIONS.find((l:any)=>regionMatch[map](l)&&layoutLocation(l).pieces.some((p:any)=>TOWN_SHOP_KEYS.includes(p.p?.k?.split('|')[0])&&p.p.fn&&p.p.name));assert.ok(loc,map);
 const L=layoutLocation(loc!),p=L.pieces.find((p:any)=>TOWN_SHOP_KEYS.includes(p.p?.k?.split('|')[0])&&p.p.fn&&p.p.name)!;
 assert.ok(L.blocks.length);assert.ok(L.doors?.some(d=>d.fn===p.p.fn&&d.name===p.p.name));
 const c=createCanvas(800,800),g:any=c.getContext('2d'),r:any=Object.create(Renderer.prototype);r.ctx=g;r.game={cam:{zoom:1}};r.dpr=1;r.xray=()=>.42;const warmed:string[]=[];r.queuePlaqueWarm=(s:string)=>warmed.push(s);r.plaqueSprite=()=>createCanvas(10,10);
 const seen:any[]=[],draw=g.drawImage.bind(g);g.drawImage=(im:any,...a:any[])=>{seen.push(im);return draw(im,...a)};r.drawBldPieceFull(p,400,620,0);
 assert.ok(warmed.includes(p.p.name));assert.ok(seen.some(im=>townShopMips(p.p.k)!.includes(im)),map);
}
const doc=(globalThis as any).document;delete (globalThis as any).document;assert.equal(townShopMips('b16'),null);(globalThis as any).document=doc;
setCanvasFactory(()=>{throw Error('no canvas')});assert.equal(townShopMips('b18|snow'),null);assert.equal(drawBld(createCanvas(10,10).getContext('2d') as any,'b18|snow',0,0,0),false);
console.log('town shops: 15 building keys, goods, cache, variants, facility doors and three-region render paths passed');
