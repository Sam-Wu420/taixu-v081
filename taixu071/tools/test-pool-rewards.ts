import './env';
import assert from 'node:assert/strict';
import {SiteSys} from '../src/world/sites';
import * as C from '../src/world/cultivation';
const hero=C.newHero();hero.realm=2;hero.hp=1;hero.mp=.5;let eggs=0;
const g:any={hero,player:{x:1000,y:1000},ws:{sites:{},blessUntil:0},day:100,mijing:{active:false},pets:{onEgg(){eggs++}}};const sys:any=new SiteSys(g);
const s:any={kind:'pool',key:'0,0',x:1000,y:1000,tier:2,zone:'cold',seed:1,region:''};const v=sys.st(s);const rng=Math.random;
try{
 Math.random=()=>0;hero.bag=[{id:'egg_jiao',n:Number.MAX_SAFE_INTEGER}];const node=sys.poolNode(s),dive=node.options[1].act;assert.match(dive().text,/背包/);assert.equal(v.dive,undefined);assert.equal(eggs,0);const plan=sys.pendingPool.get(v);assert.equal(plan.egg,'egg_jiao');
 g.player.x+=1000;assert.match(dive().text,/变化/);g.player.x=s.x;hero.bag=[];Math.random=()=>.99;let nested:any;const listener=()=>nested=dive();C.itemListeners.push(listener);try{assert.match(dive().text,/蛟卵/)}finally{C.itemListeners.splice(C.itemListeners.indexOf(listener),1)}assert.match(nested.text,/变化/);assert.equal(v.dive,100);assert.equal(eggs,1);assert.equal(C.bagCount(hero,'egg_jiao'),1);dive();assert.equal(eggs,1);
 const drink=node.options[0].act;drink();const exp=hero.exp, hp=hero.hp,mp=hero.mp;drink();assert.equal(hero.exp,exp);assert.equal(hero.hp,hp);assert.equal(hero.mp,mp);assert.equal(v.drink,100);
 g.day=1000;Math.random=()=>.99;const fail=sys.poolNode(s).options[1].act;hero.hp=1;assert.match(fail().speaker,/失手/);assert.equal(v.dive,1000);assert(Math.abs(hero.hp-.7)<1e-9);fail();assert(Math.abs(hero.hp-.7)<1e-9);
 // Multi-item material outcome cannot partially grant, preserve quantity on retry (herbs no longer retain age).
 g.day=2000;hero.hp=1;hero.bag=[{id:'mat_lingshi',n:Number.MAX_SAFE_INTEGER}];let seq=[0,.8,.4,0,0],i=0;Math.random=()=>seq[i++]??.8;const dive2=sys.poolNode(s).options[1].act;assert.match(dive2().text,/背包/);const p2=sys.pendingPool.get(v);assert.equal(p2.items.length,2);assert.equal(v.dive,1000);assert.equal(hero.bag.length,1);hero.bag=[];Math.random=()=>.99;dive2();assert.equal(v.dive,2000);assert(p2.items.every((item:any)=>hero.bag.some(b=>b.id===item.id&&b.n>=item.n)));if(p2.items[0].id.startsWith('herb'))assert(hero.bag.some(b=>b.id===p2.items[0].id&&b.age===undefined));
}finally{Math.random=rng}
console.log('pool: atomic dive and cooldown, egg notification, fixed failure retries, stale and duplicate actions');
