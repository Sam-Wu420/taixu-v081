import './env';import assert from 'node:assert/strict';import {createCanvas} from './env';import {writeFileSync,readFileSync} from 'node:fs';import {setCanvasFactory} from '../src/core/canvas';
import { outPng } from './outPng';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const {REMAINING_BUILDING_KEYS,remainingBuildingMips}=await import('../src/gfx/remainingBuildings');const {drawBld,drawWallRun,bldDim}=await import('../src/gfx/bldTex2');const {BLD2_SRC}=await import('../src/gfx/bld2Data');
assert.equal(REMAINING_BUILDING_KEYS.length,34);assert.equal(new Set(REMAINING_BUILDING_KEYS).size,34);assert.equal(Object.keys(BLD2_SRC).length,0);
const sheet=createCanvas(1200,Math.ceil(34/6)*160),sg:any=sheet.getContext('2d');sg.fillStyle='#273333';sg.fillRect(0,0,sheet.width,sheet.height);
for(const [i,key] of REMAINING_BUILDING_KEYS.entries()){
 const d=bldDim(key)!;const m:any=remainingBuildingMips(key);assert.ok(d&&m?.length,key);assert.equal(m,remainingBuildingMips(key));const c=m[0],p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let j=3;j<p.length;j+=4)if(p[j]>8)n++;assert.ok(n>50,`${key} blank`);
 assert.ok(Math.abs(c.width/c.height-d.w/d.h)<.03,key);const cv=createCanvas(600,600),g:any=cv.getContext('2d');assert.equal(drawBld(g,key,300,480,0,Math.min(.6,400/d.w,400/d.h),true,.5),true,key);
 const k=Math.min(180/c.width,120/c.height);sg.drawImage(c,i%6*200+(200-c.width*k)/2,Math.floor(i/6)*160,c.width*k,c.height*k);sg.fillStyle='white';sg.font='13px sans-serif';sg.fillText(key,i%6*200+4,Math.floor(i/6)*160+145);
}
outPng('remaining-buildings-check.png', sheet.toBuffer('image/png'));
const cv=createCanvas(800,400),g:any=cv.getContext('2d');assert.equal(drawWallRun(g,'b05',0,700,300,150,0),true);assert.equal(remainingBuildingMips('missing'),null);
setCanvasFactory(()=>{throw Error('no canvas')});assert.equal(remainingBuildingMips('j01|snow'),null);setCanvasFactory((w,h)=>createCanvas(w,h) as any);assert.ok(remainingBuildingMips('j01|snow'));
assert.ok(!readFileSync('src/gfx/bld2Data.ts','utf8').includes('../assets/'));console.log('remaining buildings: 34 procedural keys, dimensions, cache, draw paths, variants and retry passed');
