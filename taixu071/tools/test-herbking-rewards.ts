import './env';
import assert from 'node:assert/strict';
import { SiteSys } from '../src/world/sites';
import { ACTIVE_MAP } from '../src/data/world';
import * as C from '../src/world/cultivation';
const hero=C.newHero();hero.bag=[];hero.realm=2;
const game:any={hero,player:{x:1000,y:1000},ws:{sites:{},blessUntil:0},day:10,night:0,concealed:true,combat:{enemies:[]},news(){},pursuit:{maybe(){}},juice(){},toast(){}};
const sys:any=new SiteSys(game);const site:any={kind:'herbking',key:'0,0',x:1000,y:1000,tier:2,seed:4,zone:'',region:''};
const id=sys.herbOf(site),stateKey=ACTIVE_MAP+'|'+site.key;
const original=Math.random;
try {
 Math.random=()=>0;
 hero.bag=[{id:'item_yuanqi',n:Number.MAX_SAFE_INTEGER}];
 const action=sys.herbNode(site).options[0].act;
 let result=action();assert.match(result.text,/背包/);const state=game.ws.sites[stateKey];assert.equal(state.done,undefined);assert.equal(hero.stats.gathered,0);assert.equal(C.bagCount(hero,id),0);
 const plan=sys.pendingHerb.get(state);assert.equal(plan.items.length,3);
 game.player.x=2000;assert.match(action().text,/不可采集/);game.player.x=1000;
 const prior=game.hero;game.hero=C.newHero();assert.match(action().text,/不可采集/);game.hero=prior;
 const guard:any={name:'守兽',realm:2,stage:0,sleep:true,dead:false};game.combat.enemies.push(guard);sys.guards.set(site.key,[guard]);assert.match(action().text,/不可采集/);sys.guards.clear();game.combat.enemies=[];
 hero.bag=[];Math.random=()=>0.99;let nested:any,notifications=0;const listener=()=>{notifications++;nested=action();};C.itemListeners.push(listener);
 try{result=action();}finally{C.itemListeners.splice(C.itemListeners.indexOf(listener),1);}
 assert.match(result.text,/获得/);assert.match(nested.text,/不可采集/);assert.equal(state.gen,1);assert.equal(hero.stats.gathered,plan.count);assert.equal(C.bagCount(hero,id),plan.items.filter((x:any)=>x.id===id).reduce((a:number,x:any)=>a+x.n,0));assert.equal(C.bagCount(hero,'item_yuanqi'),1);assert.equal(notifications,3);
 const before=structuredClone(hero);action();assert.deepEqual(hero,before);
 // A stale dialog cannot collect the next generation after it respawns.
 game.day=state.done;action();assert.deepEqual(hero,before);
 // Guarded attempt must still be concealed and the same live sleeping guard.
 const site2={...site,key:'1,0'};game.combat.enemies=[guard];sys.guards.set(site2.key,[guard]);game.concealed=true;
 const sneak=sys.herbNode(site2).options[0].act;game.concealed=false;assert.match(sneak().text,/无法安全/);assert.equal(guard.sleep,true);
 game.concealed=true;guard.sleep=false;assert.match(sneak().text,/无法安全/);guard.sleep=true;
 hero.bag=[{id:'item_yuanqi',n:Number.MAX_SAFE_INTEGER}];Math.random=()=>0;assert.match(sneak().text,/背包/);const state2=game.ws.sites[ACTIVE_MAP+'|1,0'],plan2=sys.pendingHerb.get(state2);assert.ok(plan2);
 hero.bag=[];Math.random=()=>0.99;assert.match(sneak().text,/获得/);assert.equal(guard.sleep,true,'retry does not reroll failed stealth');assert.equal(state2.gen,1);
 // Overflowing the statistic must not commit any portion of the reward.
 const site3={...site,key:'2,0'};sys.guards.clear();hero.stats.gathered=Number.MAX_SAFE_INTEGER;hero.bag=[];Math.random=()=>0;
 const overflow=sys.herbNode(site3).options[0].act;assert.match(overflow().text,/统计异常/);assert.deepEqual(hero.bag,[]);assert.equal(game.ws.sites[ACTIVE_MAP+'|2,0'].done,undefined);
} finally {Math.random=original;}
console.log('herb king: atomic multi-item rewards, retry plan, stealth, generation, stale/reentrant actions and statistic overflow passed');
