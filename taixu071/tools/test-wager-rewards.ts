import './env';
import assert from 'node:assert/strict';
import {Happen} from '../src/world/happen';
import {Combat} from '../src/world/combat';
import {updateWorldDrop} from '../src/world/combatDropSafety';
import * as C from '../src/world/cultivation';
const hero=C.newHero();hero.bag=[{id:'mat_lingshi',n:100}];let dialog:any;const combat:any={enemies:[],loot:[],randomScroll:()=>null};combat.dropLoot=Combat.prototype.dropLoot.bind(combat);
const g:any={hero,player:{x:1000,y:1000},ws:{},mijing:{active:false},combat,openDialog:(d:any)=>dialog=d,toast(){}};const sys:any=new Happen(g);sys.human=()=>({});
const make=()=>{const x:any={id:1,kind:'wager',x:1000,y:1000,done:false,seen:true,foes:[],npc:{x:1000,y:1000,look:{}},d:{name:'道友',realm:1,stage:1,stake:20}};sys.haps=[x];return x;};
const rng=Math.random;try{Math.random=()=>.5;
 let x=make(),node=sys.wagerNode(x),start=node.options[0].act;
 hero.bag=[{id:'mat_lingshi',n:10}];assert.match(start().text,/变化/);assert.equal(C.bagCount(hero,'mat_lingshi'),10);assert.equal(combat.enemies.length,0);
 hero.bag=[{id:'mat_lingshi',n:100}];g.player.x+=1000;assert.match(start().text,/变化/);g.player.x-=1000;assert.equal(start(),null);assert.equal(C.bagCount(hero,'mat_lingshi'),80);assert.equal(x.foes.length,1);assert.equal(combat.enemies.length,1);assert.match(start().text,/变化/);assert.equal(C.bagCount(hero,'mat_lingshi'),80);
 const e=x.foes[0];let nested:any;const listener=()=>nested=sys.onSpar(e,true);C.itemListeners.push(listener);try{assert(sys.onSpar(e,true));}finally{C.itemListeners.splice(C.itemListeners.indexOf(listener),1)}assert.equal(nested,true);assert.equal(C.bagCount(hero,'mat_lingshi'),120);assert.match(dialog.text,/赢得/);sys.onSpar(e,true);assert.equal(C.bagCount(hero,'mat_lingshi'),120);
 // Overflow cannot discard either payout or scroll: both become persistent session ground drops.
 x=make();hero.bag=[{id:'mat_lingshi',n:100}];sys.wagerNode(x).options[0].act();hero.bag=[{id:'mat_lingshi',n:Number.MAX_SAFE_INTEGER}];combat.randomScroll=()=> 'pill_juqi';Math.random=()=>0;sys.onSpar(x.foes[0],true);assert.match(dialog.text,/落在脚边/);assert.equal(combat.loot.length,2);assert(combat.loot.every((d:any)=>d.blocked));assert.equal(C.bagCount(hero,'pill_juqi'),0);const drops=structuredClone(combat.loot);sys.onSpar(x.foes[0],true);assert.deepEqual(combat.loot,drops);
 hero.bag=[];for(const drop of combat.loot)assert.equal(updateWorldDrop(drop,g.player,false,1,(id,n)=>C.addItem(hero,id,n),()=>{}),false);assert.equal(C.bagCount(hero,'mat_lingshi'),40);assert.equal(C.bagCount(hero,'pill_juqi'),1);
 // World/character changes or declined encounter invalidate the old wager dialog.
 x=make();hero.bag=[{id:'mat_lingshi',n:100}];node=sys.wagerNode(x);g.ws={};assert.match(node.options[0].act().text,/变化/);node=sys.wagerNode(x);node.options[2].act();assert.match(node.options[0].act().text,/变化/);
}finally{Math.random=rng}
console.log('wager: exact stake, stale choices, one-shot payout, overflow ground recovery and reentrancy');
