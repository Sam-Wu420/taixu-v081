import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas} from './env';
import {setCanvasFactory} from '../src/core/canvas';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
let alloc=0;setCanvasFactory((w,h)=>{alloc++;return createCanvas(w,h) as any});
const {VFX_KEYS,proceduralVfx}=await import('../src/gfx/vfxProcedural');const {vfxImg,vfxProj,vfxBurst,vfxRing,vfxColumn,projSet,burstKey,shieldKey}=await import('../src/gfx/vfxTex');
// 首次画布失败不缓存错误，恢复工厂后同一键可生成。
setCanvasFactory(()=>{throw Error('canvas unavailable')});assert.equal(vfxImg('fire_bird_head'),null);assert.equal(vfxProj(createCanvas(20,20).getContext('2d') as any,'fire_bird',10,10,0,5,0),false);
setCanvasFactory((w,h)=>{alloc++;return createCanvas(w,h) as any});assert.ok(vfxImg('fire_bird_head'));
assert.equal(VFX_KEYS.length,64);assert.equal(new Set(VFX_KEYS).size,64);const sig=new Set<string>();
for(const k of VFX_KEYS){const c=proceduralVfx(k);assert.ok(c,k);assert.equal(c.width,128);assert.equal(c.height,128);const n=alloc;assert.equal(vfxImg(k),c);assert.equal(alloc,n);const p=c.getContext('2d')!.getImageData(0,0,128,128).data;let visible=0,transparent=0;for(let i=3;i<p.length;i+=4){if(p[i])visible++;else transparent++}assert.ok(visible>100,k);assert.ok(transparent>100,k);sig.add(createHash('sha256').update(p).digest('hex'))}
assert.ok(sig.size>=40,`only ${sig.size} distinct`);assert.equal(vfxImg('not_a_vfx'),null);assert.equal(vfxImg('fire_bird_ring'),null);
assert.equal(projSet('fireball','255,100,20'),'fireball');assert.equal(projSet('sword','255,0,0'),'sword_qi_red');assert.equal(burstKey('lightning','160,180,255'),'thunder_blue_burst');assert.equal(shieldKey('frost','50,150,255'),'shield_blue_ring');
const c=createCanvas(600,600),g:any=c.getContext('2d');g.globalAlpha=.6;g.globalCompositeOperation='lighter';g.translate(2,3);const tr=g.getTransform();
for(const run of [()=>vfxProj(g,'fireball',300,300,0.4,80,160,.5,1),()=>vfxBurst(g,'ice_cone_burst',300,300,70,.3,.2,.6,.5),()=>vfxRing(g,'shield_blue_ring',300,300,70,.6,.3,.8),()=>vfxColumn(g,'thunder_blue_head',300,400,220,.7,true)]){assert.equal(run(),true);assert.equal(g.globalAlpha,.6);assert.equal(g.globalCompositeOperation,'lighter');assert.deepEqual(g.getTransform(),tr)}
assert.ok(g.getImageData(0,0,600,600).data.some((v:number)=>v!==0));
for(const bad of [NaN,Infinity,-Infinity]){assert.equal(vfxProj(g,'fireball',0,0,0,bad,10),false);assert.equal(vfxBurst(g,'fireball_burst',0,0,20,bad),false);assert.equal(vfxRing(g,'shield_blue_ring',0,0,bad,1),false);assert.equal(vfxColumn(g,'thunder_blue_head',0,0,bad,1),false)}
assert.equal(vfxProj(g,'fireball',0,0,0,Number.MAX_VALUE,10),false);assert.equal(vfxRing(g,'shield_blue_ring',0,0,Number.MAX_VALUE,1),false);assert.equal(vfxBurst(g,'fireball_burst',0,0,Number.MAX_VALUE,.5),false);
assert.equal(vfxBurst(g,'fireball_burst',0,0,20,2),true);assert.equal(vfxBurst(g,'missing',0,0,20,.5),false);
// 真实 combatfx 入口：Canvas2D 效果与 WebGL 模式的透明画布叠加都使用生成画材（不模拟 GPU）。
const {drawCombatFx,drawCombatSprites}=await import('../src/world/combatfx');const source:any={game:{player:{x:300,y:350,st:{lift:0}}},fields:[],foe:{hz:[]},units:[],summons:[],buffs:{atk:0,def:0,speed:0},sparks:[],shield:null,heal:null,orbit:null,
 vfx:[{kind:'flash',fx:'fireball',color:'255,120,50',x:260,y:260,r:60,t:.3,dur:1},{kind:'strike',fx:'lightning',color:'130,170,255',x:400,y:350,r:60,t:.3,dur:1}],
 projs:[{fx:'fireball',color:'255,120,50',x:320,y:300,vx:1,vy:0,life:1,size:1,fac:'p',trail:[[220,300],[280,300]]}]};
for(const draw of [drawCombatFx,drawCombatSprites]){const cv=createCanvas(700,700),ctx:any=cv.getContext('2d'),seen:any[]=[],orig=ctx.drawImage.bind(ctx);ctx.drawImage=(im:any,...args:any[])=>{seen.push(im);return orig(im,...args)};draw(ctx,source,1);for(const k of ['fireball_head','fireball_trail','fireball_burst','thunder_blue_head'])assert.ok(seen.includes(vfxImg(k)),`${draw.name}: ${k}`);assert.ok(ctx.getImageData(0,0,700,700).data.some((v:number)=>v!==0))}
const doc=(globalThis as any).document;delete (globalThis as any).document;assert.equal(vfxImg('fireball_head'),null);(globalThis as any).document=doc;
// 无 document 时调用方收到失败，可以走代码绘制。
delete (globalThis as any).document;assert.equal(vfxProj(c.getContext('2d') as any,'fireball',0,0,0,10,0),false);(globalThis as any).document=doc;
console.log(`procedural VFX: ${VFX_KEYS.length} keys, ${sig.size} distinct textures, transformations, invalid input and Canvas/WebGL-overlay entry points passed`);
