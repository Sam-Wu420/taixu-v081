import './env';
import { outPng } from './outPng';
import assert from 'node:assert/strict';
import {createCanvas,Image} from '@napi-rs/canvas';
import {writeFileSync,readFileSync} from 'node:fs';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const {drawBeast}=await import('../src/gfx/beast');
const {ENEMY_LIST}=await import('../src/data/enemies');
const {PET_KINDS}=await import('../src/world/pets');
const tex=await import('../src/gfx/beastTex');
tex.loadBeastTex();
assert.ok(!readFileSync('src/gfx/beastTex.ts','utf8').includes("import('./beastTexData')"));
const A={move:.8,phase:2,atk:.3,hit:.2,t:2,flying:false};const cv=createCanvas(500,500),g:any=cv.getContext('2d');let count=0;
for(const d of ENEMY_LIST){if(!d.look||d.kind==='human')continue;for(const facing of [-1,1]){g.clearRect(0,0,500,500);const a={...A,flying:!!d.flying};g.globalAlpha=.7;drawBeast(g,d.look,250,350,facing,a,1);assert.ok(Math.abs(g.globalAlpha-.7)<.005,d.id);assert.ok(g.getImageData(0,0,500,500).data.some((v:number)=>v!==0),d.id);assert.equal(tex.hasBeastSprite('e:'+d.id),false,d.id);assert.equal(tex.drawBeastSprite(g,'e:'+d.id,250,350,facing,a),false,d.id);count++}}
for(const [id,p] of Object.entries(PET_KINDS)){if(!p.look)continue;g.clearRect(0,0,500,500);drawBeast(g,p.look,250,350,1,{...A,flying:!!p.flying});assert.ok(g.getImageData(0,0,500,500).data.some((v:number)=>v!==0),id)}
assert.equal(tex.beastSpriteTop('e:wolf',false),0);
const examples=['wolf','redwolf','spider','greensnake','hawk','snowwolf','firetiger','seaturtle','centipede','guijiang','huoying','molin'];const sheet=createCanvas(1200,600),sg:any=sheet.getContext('2d');sg.fillStyle='#d4cbb6';sg.fillRect(0,0,1200,600);for(const [i,id] of examples.entries()){const d=ENEMY_LIST.find(x=>x.id===id);if(!d?.look)continue;const x=i%6*200+100,y=Math.floor(i/6)*300+200;drawBeast(sg,d.look,x,y,1,{...A,flying:!!d.flying},.9);sg.fillStyle='#252525';sg.font='15px sans-serif';sg.fillText(id,x-50,y+40)}outPng('beasts-procedural-check.png', sheet.toBuffer('image/png'));
// 实际召唤物与随行灵宠的收集回调走程序绘制。
const {collectCombat}=await import('../src/world/combatfx');
const summons=['fox','puppet','tihun','demon','jiao'].map((kind,i)=>({kind,x:100+i*60,y:300,facing:1,t:4,age:2,phase:2}));
const queue:any[]=[];collectCombat({game:{},units:[],summons,loot:[],acts:{collect(){}},ghosts:[]} as any,queue,{left:0,top:0,right:500,bottom:500},1,.016);
assert.equal(queue.length,5);for(const q of queue){g.clearRect(0,0,500,500);q.draw(g);assert.ok(g.getImageData(0,0,500,500).data.some((v:number)=>v!==0))}
const {PetSys}=await import('../src/world/pets');const ps:any=new PetSys({ws:{pets:[{kind:'huli',lv:6}],petActive:0},player:{flying:false}} as any);ps.ent={x:250,y:350,facing:1,move:.5,phase:2,atk:0,t:1,alert:0};const pq:any[]=[];ps.collect(pq);assert.equal(pq.length,1);g.clearRect(0,0,500,500);pq[0].draw(g);assert.ok(g.getImageData(0,0,500,500).data.some((v:number)=>v!==0));
// 模组显式贴图仍可加载、替换、卸载后恢复程序路径。
(globalThis as any).Image=Image;const solid=(color:string)=>{const c=createCanvas(8,8),x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,8,8);return c.toDataURL()};const old=tex.BEAST_SPR['e:wolf'];
const register=(color:string)=>tex.registerModSprite('e:wolf',{frames:{idle:[solid(color)]},h:80,f:1,m:'walk'});
register('#ff0000');await new Promise(r=>setTimeout(r,50));assert.equal(tex.hasBeastSprite('e:wolf'),true);assert.equal(tex.beastSpriteTop('e:wolf',false),80);
const out=createCanvas(400,400),og:any=out.getContext('2d');assert.equal(tex.drawBeastSprite(og,'e:wolf',200,300,1,{...A,move:0,atk:0,hit:0}),true);let p=og.getImageData(200,260,1,1).data;assert.ok(p[0]>p[2]+80,'red mod');
register('#0000ff');await new Promise(r=>setTimeout(r,50));og.clearRect(0,0,400,400);assert.equal(tex.drawBeastSprite(og,'e:wolf',200,300,1,{...A,move:0,atk:0,hit:0,t:3}),true);p=og.getImageData(200,260,1,1).data;assert.ok(p[2]>p[0]+80,'updated mod');
tex.BEAST_SPR['e:wolf']=old;assert.equal(tex.hasBeastSprite('e:wolf'),false);assert.equal(tex.beastSpriteTop('e:wolf',false),0);assert.equal(tex.drawBeastSprite(og,'e:wolf',200,300,1,A),false);
console.log(`procedural beasts: ${count} enemy directional renders, pets and mod override/replacement/restore passed`);
