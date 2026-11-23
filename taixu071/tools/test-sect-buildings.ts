import './env';
import { outPng } from './outPng';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas} from './env';
import {setCanvasFactory} from '../src/core/canvas';
import {writeFileSync} from 'node:fs';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const {SECT_BUILDING_KEYS,townShopMips}=await import('../src/gfx/townShops');const {BLD2_SRC}=await import('../src/gfx/bld2Data');const {bldDim,drawBld}=await import('../src/gfx/bldTex2');
assert.equal(SECT_BUILDING_KEYS.length,33);assert.equal(new Set(SECT_BUILDING_KEYS).size,33);const hashes=new Set<string>();const sheet=createCanvas(1200,Math.ceil(33/6)*170),sg:any=sheet.getContext('2d');sg.fillStyle='#273333';sg.fillRect(0,0,sheet.width,sheet.height);
for(const [i,key] of SECT_BUILDING_KEYS.entries()){
 assert.equal(BLD2_SRC[key],undefined,key);const d=bldDim(key)!,m=townShopMips(key)!;assert.ok(d&&m?.length>=2,key);assert.equal(m,townShopMips(key));assert.ok(m[0].width<=512&&m[0].height<=512);
 const src:any=m[0],p=src.getContext('2d').getImageData(0,0,src.width,src.height).data;let v=0,clear=0;for(let j=3;j<p.length;j+=4){if(p[j])v++;else clear++}assert.ok(v>100&&clear>100,key);hashes.add(createHash('sha256').update(p).digest('hex'));
 const out=createCanvas(600,600),g:any=out.getContext('2d'),scale=Math.min(.7,450/d.w,370/d.h);g.globalAlpha=.8;assert.equal(drawBld(g,key,300,450,0,scale,true,.5),true,key);assert.ok(Math.abs(g.globalAlpha-.8)<.005);
 let w=180,h=130;const ratio=Math.min(w/src.width,h/src.height);w=src.width*ratio;h=src.height*ratio;const x=i%6*200+(200-w)/2,y=Math.floor(i/6)*170;sg.drawImage(src,x,y,w,h);sg.fillStyle='#fff';sg.font='13px sans-serif';sg.fillText(key,i%6*200+4,y+150)
}
assert.ok(hashes.size>=27,`only ${hashes.size} distinct`);outPng('sect-procedural-check.png', sheet.toBuffer('image/png'));
const pixels=(k:string)=>{const c=townShopMips(k)![0];return Buffer.from(c.getContext('2d')!.getImageData(0,0,c.width,c.height).data)};
for(const v of ['dark','snow','rose'])assert.notDeepEqual(pixels('f1_hall_b'),pixels('f1_hall_b|'+v),v);assert.notDeepEqual(pixels('f5_hall_b|rose'),pixels('f5_hall_b|dark'));
// 现用布局中宗门与城市采用另一套代码绘制，测试直接覆盖真正使用这些画材的镇与岛。
const {ALL_LOCATIONS}=await import('../src/data/world');const {layoutLocation,CODE_DRAWN}=await import('../src/gfx/building');const {Renderer}=await import('../src/world/render');let total=0;
for(const id of ['yanling','jiyin','miaoyin']){
 const loc=ALL_LOCATIONS.find((l:any)=>l.id===id)!;assert.ok(loc&&!CODE_DRAWN(loc),id);const L=layoutLocation(loc),ps=L.pieces.filter((p:any)=>SECT_BUILDING_KEYS.includes(p.p?.k?.split('|')[0]));assert.ok(ps.length,id);total+=ps.length;assert.ok(L.blocks.length,id);
 const named=ps.find((p:any)=>p.p.fn&&p.p.name);if(named)assert.ok(L.doors?.some(d=>d.fn===named.p.fn&&d.name===named.p.name),id);
 const p=ps[0],cv=createCanvas(900,900),g:any=cv.getContext('2d'),r:any=Object.create(Renderer.prototype);r.ctx=g;r.game={cam:{zoom:1}};r.dpr=1;r.xray=()=>.42;r.queuePlaqueWarm=()=>{};r.plaqueSprite=()=>createCanvas(10,10);const seen:any[]=[],draw=g.drawImage.bind(g);g.drawImage=(im:any,...a:any[])=>{seen.push(im);return draw(im,...a)};r.drawBldPieceFull(p,450,650,0);assert.ok(seen.some(im=>townShopMips(p.p.k)!.includes(im)),id);
}
assert.ok(ALL_LOCATIONS.filter((l:any)=>l.type==='sect').every((l:any)=>CODE_DRAWN(l)), '宗门当前仍走独立代码布局');
setCanvasFactory(()=>{throw Error('failed')});assert.equal(townShopMips('f9_keep|snow'),null);setCanvasFactory((w,h)=>createCanvas(w,h) as any);assert.ok(townShopMips('f9_keep|snow'));
console.log(`sect buildings: 33 keys, ${hashes.size} textures, variants, fallback retry and ${total} actual town/isle placements passed`);
