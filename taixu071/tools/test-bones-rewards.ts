import './env';
import assert from 'node:assert/strict';
import {SiteSys} from '../src/world/sites';
import * as C from '../src/world/cultivation';
const hero=C.newHero();hero.bag=[{id:'mat_lingshi',n:Number.MAX_SAFE_INTEGER}];let maps=0;
const game:any={hero,player:{x:1000,y:1000},ws:{sites:{},blessUntil:0},day:10,mijing:{active:false},combat:{randomScroll:()=>null,enemies:[]}};
const sys:any=new SiteSys(game);game.sites=sys;sys.makeCache=()=>{maps++;return null};
const s:any={kind:'bones',key:'0,0',x:1000,y:1000,tier:2,seed:11,zone:'',region:''},state=sys.st(s);const rng=Math.random;
try{Math.random=()=>0;const take=sys.bonesNode(s).options[0].act;assert.match(take().text,/背包/);assert.equal(state.done,undefined);assert.equal(state.gen,undefined);assert.equal(maps,0);const plan=sys.pendingBones.get(state);assert(plan.loot.items.some((v:any)=>v.id==='mat_yaodan4'));assert(plan.loot.items.some((v:any)=>v.id==='mat_gubaocan'));
 game.player.x=3000;assert.match(take().text,/不可/);game.player.x=1000;sys.guardOf=()=>({});assert.match(take().text,/不可/);sys.guardOf=()=>null;
 hero.bag=[];Math.random=()=>.99;let nested:any;const listener=()=>nested=take();C.itemListeners.push(listener);try{take()}finally{C.itemListeners.splice(C.itemListeners.indexOf(listener),1)}
 assert.match(nested.text,/不可/);assert.equal(state.done,1450);assert.equal(state.gen,1);assert.equal(maps,1);assert(plan.loot.items.every((i:any)=>hero.bag.some((b:any)=>b.id===i.id&&b.n>=i.n)));take();assert.equal(state.gen,1);
}finally{Math.random=rng;}
console.log('bones: atomic rewards and cooldown, fixed retry, returning guard, distance and reentrancy');
