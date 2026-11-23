import './env';
import { outPng } from './outPng';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createCanvas } from './env';
import { setCanvasFactory } from '../src/core/canvas';
import { FORMATION_KEYS, formationImage, isFormationImage } from '../src/gfx/formationProcedural';
const { v53 } = await import('../src/gfx/v053Tex');
assert.equal(FORMATION_KEYS.length,25);assert.equal(new Set(FORMATION_KEYS).size,25);
setCanvasFactory(()=>{throw Error('unavailable')});assert.equal(formationImage('zf_hushan'),null);
setCanvasFactory((w,h)=>createCanvas(w,h) as any);assert.ok(formationImage('zf_hushan'));
const hashes=new Set<string>();
const grid=createCanvas(1200, Math.ceil(FORMATION_KEYS.length/6)*180),g:any=grid.getContext('2d');g.fillStyle='#172025';g.fillRect(0,0,grid.width,grid.height);
for(const [i,k] of FORMATION_KEYS.entries()){
 const c:any=formationImage(k);assert.ok(c);assert.equal(v53(k),c);assert.equal(formationImage(k),c);assert.equal(c.width,256);assert.equal(c.height,256);
 const pixels=c.getContext('2d').getImageData(0,0,256,256).data;let visible=0,transparent=0;for(let j=3;j<pixels.length;j+=4){if(pixels[j]) visible++;else transparent++}assert.ok(visible>500&&transparent>1000,k);
 hashes.add(createHash('sha256').update(pixels).digest('hex'));
 const x=i%6*200,y=Math.floor(i/6)*180;g.drawImage(c,x+35,y+2,128,128);g.font='14px sans-serif';g.fillStyle='#eee';g.fillText(k,x+15,y+151);
}
assert.equal(hashes.size,25);assert.equal(isFormationImage('zf_unknown'),false);assert.equal(formationImage('zf_unknown'),null);
const source=readFileSync('src/gfx/v053Data.ts','utf8');for(const key of FORMATION_KEYS)assert.ok(!source.includes('/'+key+'.webp'),key);
outPng('formation-check.png', grid.toBuffer('image/png'));
console.log('formation: 25 distinct images, alpha, cache, failure retry, v53 entry and removed image imports passed');
