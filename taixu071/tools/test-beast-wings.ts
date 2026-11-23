import './env';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { drawBeast } from '../src/gfx/beast';
import { ENEMIES } from '../src/data/enemies';
import { hasBeastSprite } from '../src/gfx/beastTex';
function render(id:string,t:number,facing:number,flipFar=true){
 const cv=createCanvas(700,600),ctx=cv.getContext('2d') as any;let far=0;
 const g=new Proxy(ctx,{get(target,p){const v=target[p];if(p==='scale')return (x:number,y:number)=>{if((x===-.82&&y===.85)||(x===-.85&&y===.9)){far++;return v.call(target,flipFar?x:-x,y);}return v.call(target,x,y)};return typeof v==='function'?v.bind(target):v;},set(target,p,v){target[p]=v;return true;}});
 drawBeast(g,ENEMIES[id].look!,350,440,facing,{move:.7,phase:t*6,atk:0,hit:0,t,flying:true},.9);
 return {pixels:ctx.getImageData(0,0,700,600).data,far,alpha:ctx.globalAlpha};
}
for(const [id,count] of [['hawk',1],['bloodbat',1],['shiqin',1],['yinchi',1],['shuanggong',3]] as const){
 assert.equal(hasBeastSprite('e:'+id),false,'built-ins use actual procedural drawing, mod overrides are separate');let changed=0;
 for(const facing of [-1,1])for(let frame=0;frame<8;frame++){
  const time=frame*.13,a=render(id,time,facing),b=render(id,time,facing,false);assert.equal(a.far,count,`${id} must project each far wing`);assert.equal(a.alpha,1,'state restored');
  let diff=0;for(let i=0;i<a.pixels.length;i+=4)if(a.pixels[i]!==b.pixels[i]||a.pixels[i+1]!==b.pixels[i+1]||a.pixels[i+2]!==b.pixels[i+2]||a.pixels[i+3]!==b.pixels[i+3])diff++;
  if(diff>20)changed++;
 }
 assert.ok(changed>=12,`${id}: far wings need visible distinct projection in multiple animation phases, got ${changed}`);
}
console.log('beast wings: actual procedural hawk/bat/winged quadruped/yaksha/six-wing centipede, mirrored facing, 8 flap phases and far-wing pixel contribution passed');
