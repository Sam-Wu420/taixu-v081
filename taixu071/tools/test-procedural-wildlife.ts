import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCanvas } from './env';
import { setCanvasFactory } from '../src/core/canvas';
const { drawAmb, ambDim }=await import('../src/gfx/ambTex');
const { AMB_DIM }=await import('../src/gfx/ambDims');
let made=0; setCanvasFactory((w,h)=>{made++;return createCanvas(w,h) as any});
const signatures=new Set<string>();
for(const k of Object.keys(AMB_DIM)) {
 const c=createCanvas(500,500),g:any=c.getContext('2d');
 const original=g.getTransform(); g.globalAlpha=0.7; const initialAlpha=g.globalAlpha;
 assert.equal(drawAmb(g,k,250,300),true, k); assert.equal(g.globalAlpha,initialAlpha); assert.deepEqual(g.getTransform(),original);
 const pixels=g.getImageData(0,0,500,500).data; let alpha=0,count=0;
 for(let i=3;i<pixels.length;i+=4) if(pixels[i]) {alpha+=pixels[i]; count++}
 assert.ok(count>25,`${k} must draw`); assert.ok(count<60000,`${k} must stay bounded`); assert.ok(alpha>1000);
 signatures.add(createHash('sha256').update(pixels).digest('hex'));
 const m=made; assert.equal(drawAmb(g,k,220,220,{flip:true,s:0.8,sx:0.9,sy:1.1,rot:0.1,alpha:0.4,ay:0.5}),true); assert.equal(made,m,`${k} should reuse cache`);
 assert.ok(ambDim(k).w>0 && ambDim(k).h>0);
}
assert.equal(signatures.size,Object.keys(AMB_DIM).length); assert.equal(made,Object.keys(AMB_DIM).length);
const g:any=createCanvas(100,100).getContext('2d');assert.equal(drawAmb(g,'nonexistent',20,20),false);assert.equal(ambDim('nonexistent'),undefined);
// 经真实世界实体走静止、移动、受惊起飞与天空飞鸟绘制路径。
const { Life }=await import('../src/world/life'); const life:any=new Life();
const critters=['deer','rabbit','snowfox','monkey','egret','crane','camel','yak','turtle','chicken','dog','ox','sheep','horse','duck'];
life.debugCritters(critters,500,500); assert.equal(life.ents.length,critters.length);
const surface=createCanvas(1400,1100), ctx:any=surface.getContext('2d');
const gm:any={player:{x:9999,y:9999},terrain:{isLand:()=>true}};
for (const ent of life.ents) { ent.drawGround(ctx,0); ent.vx=50; ent.wait=99; ent.update(0.1,gm); ent.drawGround(ctx,0.1); if(ent.kind==='egret'||ent.kind==='crane'){ent.alt=20;ent.drawGround(ctx,0.2)} }
let count=0;const px=ctx.getImageData(0,0,1400,1100).data;for(let i=3;i<px.length;i+=4)if(px[i])count++; assert.ok(count>1000);
life.debugCritters(['gull'],500,500); const gull=life.ents.find((e:any)=>e.kind==='gull'); assert.ok(gull); gull.drawSky(ctx,1);
life.summonCranes(500,500,1); const crane=life.ents.find((e:any)=>e.kind==='crane'); assert.ok(crane); crane.drawSky(ctx,1);
console.log(`procedural wildlife: ${signatures.size} species/poses drawn, transformed, state-safe and cached`);
