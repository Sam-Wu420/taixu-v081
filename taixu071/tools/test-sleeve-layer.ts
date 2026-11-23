import assert from 'node:assert/strict';
import './env';
import { createCanvas } from '@napi-rs/canvas';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const {CharState,HANLI_LOOK,drawCharacter,dressLook,DEFAULT_WARDROBE}=await import('../src/gfx/character');
const ctx=createCanvas(400,400).getContext('2d') as any;
let checked=0,wrongBefore=0,backArms=0,unchanged=0;
for(const sex of ['m','f'] as const)for(const sleeve of ['wide','narrow','cuffed'] as const)for(const action of ['walk','run','idle','cast'] as const)for(let direction=0;direction<8;direction++){
 const look=dressLook(HANLI_LOOK,{...DEFAULT_WARDROBE[sex],clothingStyle:{sleeve},idle:'stand'});
 const st=new CharState(200,300);st.t=0;st.seed=1;st.yaw=st.targetYaw=direction*Math.PI/4;st.action=action;st.speed=action==='run'?300:180;
 for(let i=0;i<30;i++){
  st.update(1/60);drawCharacter(ctx,look,st,1.5,1/60,{onArmLayer:a=>{
   const moving=action==='walk'||action==='run',protect=moving&&a.facing<-.65&&a.wristForward>.3;
   if(protect){checked++;if(a.originalDepth>a.torsoDepth)wrongBefore++;assert.ok(a.armDepth<a.torsoDepth,`${sex}/${sleeve}/${action}/${direction}/${i}: forward arm in front of back`);}
   else {unchanged++;assert.equal(a.armDepth,a.originalDepth,`${sex}/${sleeve}/${action}/${direction}/${i} unrelated layer changed`);if(moving&&a.facing<-.65&&a.wristForward<=.3)backArms++;}
  }});
 }
}
// Gait overlay on a cast/hit must use the same back-view protection.
for(const action of ['cast','hit'] as const){
 const st=new CharState(200,300);st.t=0;st.seed=2;st.yaw=st.targetYaw=Math.PI;st.action=action;st.gait='walk';st.speed=180;
 for(let i=0;i<30;i++){st.update(1/60);drawCharacter(ctx,HANLI_LOOK,st,1.5,1/60,{onArmLayer:a=>{if(a.facing<-.65&&a.wristForward>.3)assert.ok(a.armDepth<a.torsoDepth,'gait-overlay protection');}});}
}
assert.ok(checked>100 && wrongBefore>10,`regression must exercise bug: ${checked}/${wrongBefore}`);
assert.ok(unchanged>1000);assert.ok(backArms>0,'arms behind body retain original layering');
console.log(`sleeve depth: ${checked} forward back-view arm frames, ${wrongBefore} previously drawn over back; ${unchanged} other frames unchanged, ${backArms} rear arms preserved`);
