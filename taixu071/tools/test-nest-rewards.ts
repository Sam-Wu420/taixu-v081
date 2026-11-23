import './env';
import assert from 'node:assert/strict';
import { SiteSys } from '../src/world/sites';
import { ACTIVE_MAP } from '../src/data/world';
import * as C from '../src/world/cultivation';
const hero=C.newHero();hero.bag=[];hero.realm=2;let eggs=0;
const game:any={hero,player:{x:1000,y:1000},ws:{sites:{},incubate:null},day:10,concealed:true,combat:{enemies:[]},news(){},toast(){},pets:{onEgg(){eggs++;}}};
const sys:any=new SiteSys(game),site:any={kind:'nest',key:'0,0',x:1000,y:1000,tier:2,seed:4,zone:'',region:''};
const original=Math.random;
try{
 Math.random=()=>0;const state=sys.st(site);state.egg='insect';hero.bag=[{id:'egg_shijin',n:Number.MAX_SAFE_INTEGER}];
 const take=sys.nestNode(site).options[0].act;assert.match(take().text,/背包/);assert.equal(state.done,undefined);assert.equal(eggs,0);
 game.player.x=2000;assert.match(take().text,/不可/);game.player.x=1000;
 hero.bag=[];let nested:any;const listener=()=>{nested=take();};C.itemListeners.push(listener);try{assert.match(take().text,/蚀金/);}finally{C.itemListeners.splice(C.itemListeners.indexOf(listener),1);}
 assert.match(nested.text,/不可/);assert.equal(state.gen,1);assert.equal(C.bagCount(hero,'egg_shijin'),1);assert.equal(eggs,1);take();assert.equal(eggs,1);
 game.day=state.done;assert.match(take().text,/不可/);
 const site2={...site,key:'1,0',seed:5};const state2=sys.st(site2);state2.egg='insect';const yd='mat_yaodan3';hero.bag=[{id:yd,n:Number.MAX_SAFE_INTEGER}];Math.random=()=>0;
 const insect=sys.nestNode(site2).options[0].act;assert.match(insect().text,/背包/);const plan=sys.pendingNest.get(state2);assert.equal(plan.n,1);hero.bag=[];Math.random=()=>.99;insect();assert.equal(C.bagCount(hero,yd),1);assert.equal(state2.gen,1);
 const site3={...site,key:'2,0'};const state3=sys.st(site3);state3.egg='egg_wolf';const mom:any={name:'母兽',realm:2,stage:0,away:true,dead:false};game.combat.enemies=[mom];sys.guards.set(site3.key,[mom]);
 const away=sys.nestNode(site3).options[0].act;mom.away=false;assert.match(away().text,/回巢/);assert.equal(state3.done,undefined);
 const sneak=sys.nestNode(site3).options[0].act;game.concealed=false;assert.match(sneak().text,/无法/);game.concealed=true;hero.bag=[{id:'egg_wolf',n:Number.MAX_SAFE_INTEGER}];Math.random=()=>0;assert.match(sneak().text,/背包/);hero.bag=[];Math.random=()=>.99;assert.match(sneak().text,/获得/);assert.equal(mom.aggro,undefined);assert.equal(eggs,2);
}finally{Math.random=original;}
console.log('nest: atomic egg/insect rewards, fixed retry, reentrant/stale clicks, returning guard and stealth passed');
