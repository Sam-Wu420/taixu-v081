import './env';
import assert from 'node:assert/strict';
import { SiteSys } from '../src/world/sites';
import { ACTIVE_MAP } from '../src/data/world';
import * as C from '../src/world/cultivation';
let dialog:any, maps=0, eggs=0; const notes:string[]=[];
const hero:any={bag:[{id:'mat_lingshi',n:Number.MAX_SAFE_INTEGER}],dead:false,realm:1};
const cache:any={id:1,map:ACTIVE_MAP,x:1000,y:1000,tier:1,ox:1000,oy:1000};
const game:any={hero,player:{x:1000,y:1000},ws:{caches:[cache],sites:{},rep:0,blessUntil:0},day:10,combat:{randomScroll:()=>null,enemies:[]},openDialog:(d:any)=>dialog=d,toast:(x:string)=>notes.push(x),news(){},pets:{onEgg(){eggs++}}};
const sys:any=new SiteSys(game);game.sites=sys;sys.makeCache=()=>{maps++;return null};sys.shrineLook=()=>({look:{}});
const orig=Math.random;Math.random=()=>0;
try {
 sys.interactCache(cache);const dig=dialog.options[0].act;
 let r=dig();assert.match(r.text,/背包/);assert.equal(cache.done,undefined);assert.equal(maps,0);assert.equal(eggs,0);const plan=sys.pendingLoot.get(cache);assert.ok(plan.items.some((i:any)=>i.id.startsWith('egg_')));
 game.player.x=2000;dig();assert.equal(cache.done,undefined);game.player.x=1000;game.ws.caches=[];dig();assert.equal(cache.done,undefined);game.ws.caches=[cache];game.hero={...hero,bag:[]};dig();assert.equal(cache.done,undefined);game.hero=hero;
 hero.bag=[];Math.random=()=>0.99;let nested:any;const listener=()=>{nested=dig()};C.itemListeners.push(listener);try {dig()} finally {C.itemListeners.splice(C.itemListeners.indexOf(listener),1)}
 assert.equal(cache.done,true);assert.match(nested.text,/不可用/);assert.equal(eggs,1);assert.equal(maps,1);assert.ok(plan.items.every((i:any)=>hero.bag.some((x:any)=>x.id===i.id&&x.n>=i.n)));const copy=structuredClone(hero.bag);dig();assert.deepEqual(hero.bag,copy);assert.equal(eggs,1);
 const shrine:any={kind:'shrine',key:'0,0',x:1000,y:1000,tier:1,seed:1,zone:'',region:''};const state:any={quest:2};game.ws.sites[ACTIVE_MAP+'|0,0']=state;hero.bag=[{id:'mat_lingshi',n:Number.MAX_SAFE_INTEGER}];Math.random=()=>0;
 const node=sys.shrineNode(shrine),claim=node.options.find((x:any)=>x.label.includes('谢礼')).act;assert.match(claim().text,/背包/);assert.equal(state.quest,2);assert.equal(game.ws.rep,0);const plan2=sys.pendingLoot.get(state);hero.bag=[];Math.random=()=>0.99;
 const listener2=()=>claim();C.itemListeners.push(listener2);try{claim()}finally{C.itemListeners.splice(C.itemListeners.indexOf(listener2),1)}assert.equal(state.quest,3);assert.equal(game.ws.rep,5);assert.ok(plan2.items.every((i:any)=>hero.bag.some((x:any)=>x.id===i.id&&x.n>=i.n)));claim();assert.equal(game.ws.rep,5);
 // 过期上香选项不可在钱不够时部分扣款或重复施加祝福。
 hero.bag=[{id:'mat_lingshi',n:5}];game.ws.blessUntil=0;const prayer=sys.shrineNode(shrine).options.find((x:any)=>x.label.includes('上香')).act;prayer();assert.equal(hero.bag[0].n,5);assert.equal(game.ws.blessUntil,0);
 hero.bag[0].n=20;prayer();assert.equal(hero.bag[0].n,10);assert.equal(game.ws.blessUntil,40);prayer();assert.equal(hero.bag[0].n,10);
} finally {Math.random=orig}
console.log('site rewards: atomic cache and shrine, fixed retry plan, stale/reentrant actions, egg and shrine payment passed');
