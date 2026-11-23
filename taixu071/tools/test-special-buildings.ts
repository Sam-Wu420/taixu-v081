import './env';
import { outPng } from './outPng';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas} from './env';
import {setCanvasFactory} from '../src/core/canvas';
import {writeFileSync} from 'node:fs';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const {SPECIAL_BUILDING_KEYS,townShopMips}=await import('../src/gfx/townShops');const {BLD2_SRC}=await import('../src/gfx/bld2Data');const {bldDim,drawBld}=await import('../src/gfx/bldTex2');
assert.equal(SPECIAL_BUILDING_KEYS.length,16);const hashes=new Set<string>();const sheet=createCanvas(1200,Math.ceil(16/6)*170),sg:any=sheet.getContext('2d');sg.fillStyle='#273333';sg.fillRect(0,0,sheet.width,sheet.height);
for(const [i,key] of SPECIAL_BUILDING_KEYS.entries()){
 assert.equal(BLD2_SRC[key],undefined,key);const d=bldDim(key)!,m=townShopMips(key)!;assert.ok(d&&m.length>=2,key);assert.equal(townShopMips(key),m);assert.ok(m[0].width<=512&&m[0].height<=512);
 const src:any=m[0],p=src.getContext('2d').getImageData(0,0,src.width,src.height).data;let vis=0,clear=0;for(let j=3;j<p.length;j+=4){if(p[j])vis++;else clear++}assert.ok(vis>100&&clear>100,key);hashes.add(createHash('sha256').update(p).digest('hex'));
 const cv=createCanvas(700,700),g:any=cv.getContext('2d');g.globalAlpha=.8;const transform=g.getTransform();assert.equal(drawBld(g,key,350,500,0,.55,true,.5),true,key);assert.ok(Math.abs(g.globalAlpha-.8)<.005);assert.deepEqual(g.getTransform(),transform);
 const scale=Math.min(180/src.width,130/src.height),w=src.width*scale,h=src.height*scale,x=i%6*200+(200-w)/2,y=Math.floor(i/6)*170;sg.drawImage(src,x,y,w,h);sg.font='13px sans-serif';sg.fillStyle='#fff';sg.fillText(key,i%6*200+4,y+150)
}
assert.equal(hashes.size,16);outPng('special-buildings-check.png', sheet.toBuffer('image/png'));
const buf=(k:string)=>{const c=townShopMips(k)![0];return Buffer.from(c.getContext('2d')!.getImageData(0,0,c.width,c.height).data)};for(const v of ['snow','dark','rose'])assert.notDeepEqual(buf('j07_hall'),buf('j07_hall|'+v));assert.notDeepEqual(buf('b10'),buf('b10b'));
const {ALL_LOCATIONS}=await import('../src/data/world');const {layoutLocation,CODE_DRAWN}=await import('../src/gfx/building');const {Renderer}=await import('../src/world/render');const maps=new Set<string>(),domains=new Set<string>(),used=new Set<string>();let placements=0;
for(const l of ALL_LOCATIONS){if(CODE_DRAWN(l))continue;const L=layoutLocation(l);const ps=L.pieces.filter((p:any)=>SPECIAL_BUILDING_KEYS.includes(p.p?.k?.split('|')[0]));if(!ps.length)continue;maps.add(l.map!);if(l.map==='renjie')domains.add(l.oy<=350?'dajin':l.ox>=700?'luanxing':'tiannan');placements+=ps.length;assert.ok(L.blocks.length,l.id);for(const p of ps)used.add(p.p.k.split('|')[0]);const p=ps[0],cv=createCanvas(1000,1000),g:any=cv.getContext('2d'),r:any=Object.create(Renderer.prototype);r.ctx=g;r.game={cam:{zoom:1}};r.dpr=1;r.xray=()=>.5;r.queuePlaqueWarm=()=>{};r.plaqueSprite=()=>createCanvas(10,10);const seen:any[]=[],orig=g.drawImage.bind(g);g.drawImage=(im:any,...args:any[])=>{seen.push(im);return orig(im,...args)};r.drawBldPieceFull(p,500,700,0);assert.ok(seen.some(im=>townShopMips(p.p.k)!.includes(im)),l.id)}
assert.deepEqual([...maps].sort(),['lingjie','renjie']);assert.deepEqual([...domains].sort(),['dajin','luanxing','tiannan']);for(const k of ['x08','j03_corner','t05','t04','b10','b10b','b12','b40','j18','j07_hall','t03','f5_blood_altar','j09a','j09b'])assert.ok(used.has(k),k);
// 扫描真实布局中剩余的旧建筑引用；未被当前布局使用不代表源文件已全部替换。
const unresolved=new Set<string>();for(const l of ALL_LOCATIONS){if(CODE_DRAWN(l))continue;for(const p of layoutLocation(l).pieces){const k=p.p?.k?.split('|')[0];if(k&&Object.hasOwn(BLD2_SRC,k))unresolved.add(k)}}assert.deepEqual([...unresolved],[]);
setCanvasFactory(()=>{throw Error('failed')});assert.equal(townShopMips('j09b|snow'),null);setCanvasFactory((w,h)=>createCanvas(w,h) as any);assert.ok(townShopMips('j09b|snow'));
console.log(`special buildings: 16 keys, ${placements} real placements across three regions, no legacy building keys in current layouts, retry passed`);
