import './env';
import { outPng } from './outPng';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createCanvas} from './env';
import {setCanvasFactory} from '../src/core/canvas';
import {SPIRIT_KEYS,spiritImage,spiritMeta} from '../src/gfx/spiritProcedural';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const {v53,meta53}=await import('../src/gfx/v053Tex');const {FORMS,FORM_IDS,drawSpirit}=await import('../src/world/huaxing');
assert.equal(SPIRIT_KEYS.length,18);setCanvasFactory(()=>{throw Error('test failure')});assert.equal(spiritImage('hx_long_idle'),null);setCanvasFactory((w,h)=>createCanvas(w,h) as any);assert.ok(spiritImage('hx_long_idle'));
const hashes=new Set<string>(),source=readFileSync('src/gfx/v053Data.ts','utf8');const sheet=createCanvas(1400,800),sg:any=sheet.getContext('2d');sg.fillStyle='#1e282e';sg.fillRect(0,0,1400,800);
for(const [i,k] of SPIRIT_KEYS.entries()){
 const c:any=spiritImage(k),m=spiritMeta(k)!;assert.ok(c,k);assert.equal(v53(k),c);assert.equal(spiritImage(k),c);assert.deepEqual(meta53(k),m);assert.equal(c.width,m.w);assert.equal(c.height,m.h);assert.ok(!source.includes('/'+k+'.webp'),k);
 const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let vis=0,clear=0;for(let j=3;j<p.length;j+=4){if(p[j]>5)vis++;if(p[j]===0)clear++}assert.ok(vis>150,k);assert.ok(clear>100,k);hashes.add(createHash('sha256').update(p).digest('hex'));
 if(i<14){const x=i%7*200,y=Math.floor(i/7)*340;sg.drawImage(c,x+4,y+15,192,210);sg.fillStyle='#fff';sg.font='14px sans-serif';sg.fillText(k,x+8,y+250)}
}
assert.equal(hashes.size,18);assert.equal(spiritImage('hx_unknown_idle'),null);outPng('spirit-check.png', sheet.toBuffer('image/png'));
// 经真实 drawSpirit 入口，检查两姿态、正反方向、画布状态与图片选用。
for(const id of FORM_IDS)for(const pose of ['idle','attack'] as const)for(const face of [-1,1]){
 const canvas=createCanvas(700,700),g:any=canvas.getContext('2d'),seen:any[]=[],draw=g.drawImage.bind(g);g.drawImage=(im:any,...args:any[])=>{seen.push(im);return draw(im,...args)};g.globalAlpha=.7;drawSpirit(g,FORMS[id],pose,350,500,80,350,face,.8,1,.1,1);assert.ok(seen.includes(v53('hx_'+id+'_'+pose)),id+pose);assert.ok(Math.abs(g.globalAlpha-.7)<.005);assert.ok(g.getImageData(0,0,700,700).data.some((v:number)=>v!==0))
}
console.log('procedural spirits: 18 textures, 14 distinct poses, cache, retry, metadata and 28 real drawSpirit paths passed');
