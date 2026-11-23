import './env';
import assert from 'node:assert/strict';
import {Happen} from '../src/world/happen';
import {Combat} from '../src/world/combat';
import {updateWorldDrop} from '../src/world/combatDropSafety';
import {audio} from '../src/world/audio';
import * as C from '../src/world/cultivation';
(audio as any).sfx=()=>{};
const hero=C.newHero();hero.realm=2;hero.bag=[{id:'mat_lingshi',n:Number.MAX_SAFE_INTEGER}];let dialog:any,dialogs=0,maps=0;
const combat:any={enemies:[],loot:[],vfx:[],randomScroll:()=>null};combat.dropLoot=Combat.prototype.dropLoot.bind(combat);
const g:any={hero,player:{x:1000,y:1000},time:100,day:1,ws:{rep:0,blessUntil:0},senseRadius:1000,combat,sites:{makeCache(){maps++;return null}},toast(){},news(){},juice(){},openDialog(d:any){dialog=d;dialogs++}};
const sys:any=new Happen(g);sys.walkNpc=()=>{};const st=()=>({update(){},faceToward(){},setAction(){},speed:0});const npc=()=>({x:1000,y:1000,st:st(),look:{}});
const rng=Math.random;
try{Math.random=()=>.99;
 const t:any={kind:'tribul',x:1000,y:1000,seen:true,done:false,npc:npc(),foes:[],d:{engaged:'guard',w2:true,end:100,nextBolt:101,pend:[],realm:2,name:'道友'}};
 sys.tribTick(t,0,[]);assert.equal(t.done,true);assert.equal(g.ws.rep,5);assert.match(dialog.text,/留在脚边/);assert(combat.loot.length>=2);assert(combat.loot.every((x:any)=>x.blocked));assert.equal(C.bagCount(hero,'mat_lingshi'),Number.MAX_SAFE_INTEGER);const drops=structuredClone(combat.loot);sys.tribTick(t,0,[]);assert.deepEqual(combat.loot,drops);assert.equal(dialogs,1);assert.equal(g.ws.rep,5);
 hero.bag=[];for(const d of combat.loot)assert.equal(updateWorldDrop(d,g.player,false,1,(id,n)=>C.addItem(hero,id,n),()=>{}),false);for(const d of drops)assert(C.bagCount(hero,d.id)>=d.n);combat.loot=[];
 // Preserve fixed caravan payment and randomized bonus as one batch when a stack is full.
 hero.bag=[{id:'mat_lingshi',n:Number.MAX_SAFE_INTEGER}];g.ws.rep=0;Math.random=()=>0;
 const x:any={kind:'caravan',x:1000,y:1000,done:false,npc:npc(),npc2:npc(),foes:[],d:{engaged:'go',dir:{x:1,y:0},len:100,sx:1000,sy:1000,prog:1,waves:2,hp:1,reward:100,town:'甲城'}};
 sys.caravanTick(x,0,[]);assert.equal(x.done,true);assert.equal(x.d.paid,true);assert.equal(g.ws.rep,3);assert.match(dialog.text,/留在脚边/);assert(combat.loot.length>=2);assert(combat.loot.every((d:any)=>d.blocked));assert.equal(maps,1);
 const b=structuredClone(combat.loot);sys.caravanTick(x,0,[]);assert.deepEqual(combat.loot,b);assert.equal(g.ws.rep,3);hero.bag=[];
 for(const d of combat.loot)updateWorldDrop(d,g.player,false,1,(id,n)=>C.addItem(hero,id,n),()=>{});
 const totals=new Map<string,number>();for(const d of b)totals.set(d.id,(totals.get(d.id)??0)+d.n);for(const [id,n] of totals)assert.equal(C.bagCount(hero,id),n);
 // Successful guard reward is also resistant to item-listener reentrancy.
 combat.loot=[];hero.bag=[];g.ws.rep=0;Math.random=()=>.99;
 const t2:any={...t,done:false,npc:npc(),d:{...t.d,over:false}};let tribReentry=0;const lt=()=>{tribReentry++;sys.tribTick(t2,0,[])};C.itemListeners.push(lt);try{sys.tribTick(t2,0,[])}finally{C.itemListeners.splice(C.itemListeners.indexOf(lt),1)}assert(tribReentry>0);assert.equal(g.ws.rep,5);assert.equal(combat.loot.length,0);assert.match(dialog.text,/获得/);
 // Success in normal inventory and item-listener reentrancy settles only once.
 combat.loot=[];hero.bag=[];g.ws.rep=0;Math.random=()=>.99;
 const y:any={...x,done:false,npc:npc(),npc2:npc(),d:{...x.d,paid:false,hp:.5}};let nested=0;const listener=()=>{nested++;sys.caravanTick(y,0,[])};C.itemListeners.push(listener);try{sys.caravanTick(y,0,[])}finally{C.itemListeners.splice(C.itemListeners.indexOf(listener),1)}assert.equal(nested,1);assert.equal(C.bagCount(hero,'mat_lingshi'),100);assert.equal(g.ws.rep,3);assert.equal(combat.loot.length,0);assert.match(dialog.text,/获得/);
}finally{Math.random=rng}
console.log('event rewards: tribulation and caravan atomic batch, ground recovery and single settlement');
