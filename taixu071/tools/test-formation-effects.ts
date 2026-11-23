import './env';
import { outPng } from './outPng';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createCanvas} from './env';
import {setCanvasFactory} from '../src/core/canvas';
import {FORMATION_EFFECT_KEYS,formationEffectImage,formationEffectMeta} from '../src/gfx/formationEffects';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const {v53,meta53}=await import('../src/gfx/v053Tex');
assert.equal(FORMATION_EFFECT_KEYS.length,23);setCanvasFactory(()=>{throw Error('offline')});assert.equal(formationEffectImage('zf_flag_mo'),null);setCanvasFactory((w,h)=>createCanvas(w,h) as any);assert.ok(formationEffectImage('zf_flag_mo'));
const hashes=new Set<string>();const grid=createCanvas(1200,Math.ceil(FORMATION_EFFECT_KEYS.length/6)*200),g:any=grid.getContext('2d');g.fillStyle='#1b2529';g.fillRect(0,0,grid.width,grid.height);
for(const [i,k] of FORMATION_EFFECT_KEYS.entries()){
 const c:any=formationEffectImage(k),m=formationEffectMeta(k)!;assert.ok(c,k);assert.equal(v53(k),c);assert.equal(meta53(k),m);assert.equal(c.width,m.w);assert.equal(c.height,m.h);
 const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let visible=0,clear=0;for(let n=3;n<p.length;n+=4){if(p[n]>10)visible++;if(p[n]<8)clear++}assert.ok(visible>60,k);assert.ok(clear>10,k);hashes.add(createHash('sha256').update(p).digest('hex'));
 if(k.startsWith('zf_flag_')){const x=Math.round(m.ax!*m.w),y=Math.round(m.ay!*m.h)-3;assert.ok(c.getContext('2d').getImageData(x,y,1,1).data[3]>0,k+' pole anchor')}
 const x=i%6*200,y=Math.floor(i/6)*200;g.drawImage(c,x+32,y+10,130,150);g.font='14px sans-serif';g.fillStyle='#eee';g.fillText(k,x+12,y+180);
}
assert.equal(hashes.size,FORMATION_EFFECT_KEYS.length);assert.equal(formationEffectImage('zf_unknown'),null);const source=readFileSync('src/gfx/v053Data.ts','utf8');for(const k of FORMATION_EFFECT_KEYS)assert.ok(!source.includes('/'+k+'.webp'),k);
outPng('formation-effects-check.png', grid.toBuffer('image/png'));
// 实际阵法绘制函数，核验阵旗、阵眼、护罩、阵法动作均使用新画材及恢复状态。
const {ZhenfaSys}=await import('../src/world/zhenfa');const {ZHEN}=await import('../src/data/zhenfa');
const sys:any=new ZhenfaSys({player:{x:300,y:300}} as any);const def=ZHEN.find((z:any)=>z.id==='xuanwu')!;
const inst:any={def,owner:'p',x:300,y:300,r:100,t:2,left:10,flags:4,eye:{x:300,y:300,hp:30,max:100},hidden:false};
const cv=createCanvas(800,800),ctx:any=cv.getContext('2d'),seen:any[]=[],orig=ctx.drawImage.bind(ctx);ctx.drawImage=(im:any,...args:any[])=>{seen.push(im);return orig(im,...args)};ctx.globalAlpha=.8;
sys.drawCircle(ctx,inst,1);sys.drawFlag(ctx,'shui',300,300,inst,1,0);sys.drawEye(ctx,inst,1);sys.drawDome(ctx,inst,1);for(const k of ['activate','break','shatter','sword','bolt','fire'])sys.drawFx(ctx,{k,x:300,y:500,t:.4,dur:1,color:'120,180,255',r:100});
for(const k of ['zf_xuanwu','zf_flag_shui','zf_eye_stone','zf_dome','zf_dome_crack','zf_activate','zf_break','zf_shatter','zf_sword','zf_lightning','zf_fire'])assert.ok(seen.includes(v53(k)),k);assert.equal(ctx.globalAlpha,.8);
console.log('formation effects: 23 images, transparent art, cache, retry, metadata anchors and real formation rendering passed');
