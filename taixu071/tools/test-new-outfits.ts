import './env';import assert from 'node:assert/strict';import {createCanvas} from './env';import {createHash} from 'node:crypto';import {writeFileSync} from 'node:fs';
import { outPng } from './outPng';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const {OUTFIT_BY_ID,DEFAULT_WARDROBE,HANLI_LOOK,dressLook,CharState,drawCharacter}=await import('../src/gfx/character');
const ids=['songhe','canghai','chensha','lingye','liulan','jinhong','qinglan','shuimo'];const sheet=createCanvas(1440,760),sg:any=sheet.getContext('2d');sg.fillStyle='#26312e';sg.fillRect(0,0,sheet.width,sheet.height);let count=0;const hashes=new Set<string>();
for(const [ix,id] of ids.entries()){
 const o=OUTFIT_BY_ID[id];assert.ok(o);assert.equal(o.dyes.length,3);const sex=o.sex==='u'?'m':o.sex;
 for(let dye=0;dye<3;dye++){
  const w={...DEFAULT_WARDROBE[sex],outfit:id,dye};const look=dressLook(HANLI_LOOK,JSON.parse(JSON.stringify(w)));assert.equal(look.outfit,id);assert.equal(look.dye,dye);
  for(const action of ['idle','run','cast','fly'] as const)for(let a=0;a<4;a++){
   const cv=createCanvas(180,220),g:any=cv.getContext('2d'),st=new CharState(90,195);st.seed=10;st.yaw=st.targetYaw=a*Math.PI/2;st.setAction(action);st.speed=action==='run'?200:action==='fly'?240:0;st.vx=st.speed*Math.sin(st.yaw);st.vy=st.speed*Math.cos(st.yaw);
   for(let i=0;i<4;i++){st.update(1/60);g.clearRect(0,0,180,220);drawCharacter(g,look,st,1.5,1/60)}
   const data=g.getImageData(0,0,180,220).data;let ink=0;for(let j=3;j<data.length;j+=4)if(data[j]>8)ink++;assert.ok(ink>100,`${id}/${dye}/${action}/${a}`);
   for(const stn of st.strands.values() as any)for(let j=0;j<stn.n;j++)assert.ok(Number.isFinite(stn.x[j])&&Number.isFinite(stn.y[j]));count++;
   if(action==='idle'&&a===0){hashes.add(createHash('sha256').update(data).digest('hex'));const x=(ix*3+dye)%8*180,y=Math.floor((ix*3+dye)/8)*250;sg.drawImage(cv,x,y);sg.fillStyle='#eee';sg.font='14px sans-serif';sg.fillText(id+' '+o.dyes[dye].name,x+5,y+238)}
  }
 }
}
assert.ok(hashes.size>=24);outPng('outfits-procedural-check.png', sheet.toBuffer('image/png'));console.log(`new outfits: 8 outfits, 24 dyes, ${count} renders across 4 actions and 4 orientations, finite cloth samples passed`);
