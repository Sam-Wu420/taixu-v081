import './env';
import { outPng } from './outPng';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {buildAtlas,atlasExtReady,cellUV,AW,AH,CELL} from '../src/gl/atlas';
import {FxSys,smokeCell,fireCell,rayCell,burstCell} from '../src/gl/fx';
assert.equal(atlasExtReady(),false);const cv:any=buildAtlas();assert.equal(atlasExtReady(),true);assert.equal(cv.width,1024);assert.equal(cv.height,1024);
const g=cv.getContext('2d'),hashes=new Set<string>();
for(let i=0;i<64;i++){const x=i%8*CELL,y=Math.floor(i/8)*CELL,p=g.getImageData(x,y,CELL,CELL).data;let n=0;for(let j=3;j<p.length;j+=4)if(p[j]>3)n++;assert.ok(n>20,`empty ${i}`);hashes.add(createHash('sha256').update(p).digest('hex'));const [u0,v0,u1,v1]=cellUV(i);assert.ok(u0>=0&&v0>=0&&u1<=1&&v1<=1&&u1>u0&&v1>v0)}
assert.ok(hashes.size>=55,`only ${hashes.size} shapes`);assert.ok(!readFileSync('src/gl/atlas.ts','utf8').includes("import('./fxAtlasData')"));
for(let i=0;i<40;i++){assert.ok([32,33,34].includes(smokeCell()));assert.ok([5,37,38,39].includes(fireCell()));assert.ok([50,51,52].includes(rayCell()));assert.ok([42,43,44].includes(burstCell()))}
const fx=new FxSys({} as any);fx.smoke(100,100,20,[1,1,1],8);fx.rays(100,100,30,[1,1,1]);assert.ok(fx.count>0);fx.update(.1);assert.ok(fx.count>0);
outPng('atlas-procedural-check.png', cv.toBuffer('image/png'));console.log(`procedural atlas: ${AW}x${AH}, 64 nonempty cells, ${hashes.size} shapes, selectors and particle emission passed`);
