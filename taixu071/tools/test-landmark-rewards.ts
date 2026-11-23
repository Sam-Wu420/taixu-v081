import './env';
import assert from 'node:assert/strict';
import {LandmarkSys} from '../src/world/landmarks';
import {LANDMARKS} from '../src/data/landmarks';
import * as C from '../src/world/cultivation';
const stands=LANDMARKS.flatMap(l=>l.stands);const hero=C.newHero();hero.hp=1;let dialog:any,maps=0,juice=0;
const game:any={hero,player:{x:0,y:0},ws:{flags:{},blessUntil:0},day:10,mijing:{active:false},combat:{enemies:[],randomScroll:()=>null},sites:{makeCache(){maps++;return null}},openDialog(d:any){dialog=d},juice(){juice++},toast(){}};
const sys:any=new LandmarkSys(game),rng=Math.random;const open=(kind:string)=>{const s=stands.find(x=>x.k===kind) ?? (kind==='corpsepost'?{k:'corpsepost',x:2500,y:2500,w:60,h:210,seed:1,id:'test-corpsepost'} as any:null);assert(s,kind);sys.focus=s;game.player.x=s.x;game.player.y=s.y;sys.interact();return {s,option:dialog.options[0].act};};
try{
 // Overflow one output: neither output nor flag nor effect may change.
 let {s,option:take}=open('stoneplat');hero.bag=[{id:'mat_huochan',n:Number.MAX_SAFE_INTEGER}];assert.match(take().text,/背包/);assert.equal((game.ws.flags as any).lm.once[s.id],undefined);assert.equal(C.bagCount(hero,'mat_gubaocan'),0);assert.equal(juice,0);
 game.player.x+=1000;assert.match(take().text,/变化/);game.player.x=s.x;hero.bag=[];let nested:any;const onItem=()=>nested=take();C.itemListeners.push(onItem);try{take()}finally{C.itemListeners.splice(C.itemListeners.indexOf(onItem),1)}assert.match(nested.text,/变化/);assert.equal(C.bagCount(hero,'mat_gubaocan'),1);assert.equal(C.bagCount(hero,'mat_huochan'),2);assert.equal(juice,1);take();assert.equal(juice,1);
 // Random loot plan is fixed on failure and survives a reopened dialog.
 Math.random=()=>0;({s,option:take}=open('ruinhall'));hero.bag=[{id:'mat_lingshi',n:Number.MAX_SAFE_INTEGER}];assert.match(take().text,/背包/);const flags=(game.ws.flags as any).lm,plan=sys.landmarkPlans.get(flags).get(s.id);assert(plan);assert.equal(flags.once[s.id],undefined);assert.equal(maps,0);
 Math.random=()=>.99;sys.interact();const retry=dialog.options[0].act;hero.bag=[];const old=game.ws;game.ws={...old};assert.match(retry().text,/变化/);game.ws=old;const onItem2=()=>nested=retry();C.itemListeners.push(onItem2);try{retry()}finally{C.itemListeners.splice(C.itemListeners.indexOf(onItem2),1)}assert.match(nested.text,/变化/);assert.equal(flags.once[s.id],1);assert.equal(maps,1);assert(plan.items.every((i:any)=>hero.bag.some((x:any)=>x.id===i.id&&x.n>=i.n)));retry();assert.equal(maps,1);
 // Corpse post spawns its guardian only after the item can be committed.
 ({s,option:take}=open('corpsepost'));hero.bag=[{id:'mat_shisha',n:Number.MAX_SAFE_INTEGER}];assert.match(take().text,/背包/);assert.equal(game.combat.enemies.length,0);assert.equal(flags.once[s.id],undefined);hero.bag=[];take();assert.equal(C.bagCount(hero,'mat_shisha'),1);assert.equal(game.combat.enemies.length,1);take();assert.equal(game.combat.enemies.length,1);
 // Reset invalidates previous dialogs.
 const newS=stands.filter(x=>x.k==='ruinhall')[1];sys.focus=newS;game.player.x=newS.x;game.player.y=newS.y;sys.interact();const stale=dialog.options[0].act;sys.reset();assert.match(stale().text,/变化/);
}finally{Math.random=rng;}
console.log('landmark rewards: atomic stone platform, fixed ruin loot, corpse post spawn, stale/reset and reentrancy');
