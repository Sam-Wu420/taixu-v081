import './env';
import assert from 'node:assert/strict';
import {SiteSys} from '../src/world/sites';
import {ACTIVE_MAP} from '../src/data/world';
import * as C from '../src/world/cultivation';
const hero=C.newHero();hero.realm=2;hero.hp=1;
let days=0,maps=0;const game:any={hero,player:{x:1000,y:1000},ws:{sites:{},rep:0,blessUntil:0},day:10,mijing:{active:false},combat:{randomScroll:()=>null,rollBeast:()=>null,enemies:[]},passDays(n:number){days+=n;},toast(){},news(){}};
const sys:any=new SiteSys(game);game.sites=sys;sys.makeCache=()=>{maps++;return null};
const site:any={kind:'corpse',key:'0,0',x:1000,y:1000,tier:2,seed:1,zone:'',region:''};const state=sys.st(site);
const rng=Math.random;
try{
 Math.random=()=>0;hero.bag=[{id:'mat_lingshi',n:Number.MAX_SAFE_INTEGER}];
 const node=sys.corpseNode(site),search=node.options[0].act,bury=node.options[1].act;
 assert.match(search().text,/背包/);assert.equal(state.done,undefined);assert.equal(game.combat.enemies.length,0);assert.equal(hero.hp,1);assert.equal(maps,0);const plan=sys.pendingCorpse.get(state);assert.equal(plan.trap,'ghost');const snapshot=JSON.stringify(plan);
 assert.match(bury().text,/原方式/);assert.equal(JSON.stringify(sys.pendingCorpse.get(state)),snapshot);
 game.player.x=2000;assert.match(search().text,/不可/);game.player.x=1000;
 const oldWs=game.ws;game.ws={...oldWs,sites:{...oldWs.sites}};assert.match(search().text,/不可/);game.ws=oldWs;
 hero.bag=[];Math.random=()=>.99;let nested:any;const listener=()=>nested=search();C.itemListeners.push(listener);try{search()}finally{C.itemListeners.splice(C.itemListeners.indexOf(listener),1)}
 assert.match(nested.text,/不可/);assert.equal(state.done,1e9);assert.equal(game.combat.enemies.length,1);assert.equal(maps,1);assert.ok(plan.loot.items.every((i:any)=>hero.bag.some((b:any)=>b.id===i.id&&b.n>=i.n)));search();assert.equal(game.combat.enemies.length,1);
 const s2={...site,key:'1,0'},v2=sys.st(s2);hero.bag=[{id:'mat_lingshi',n:Number.MAX_SAFE_INTEGER}];Math.random=()=>.7;const bury2=sys.corpseNode(s2).options[1].act;
 assert.match(bury2().text,/背包/);assert.equal(v2.done,undefined);assert.equal(days,0);assert.equal(game.ws.rep,0);
 const p2=sys.pendingCorpse.get(v2);hero.bag=[];Math.random=()=>.99;bury2();assert.equal(v2.done,1e9);assert.equal(days,1);assert.equal(game.ws.rep,2);assert.ok(p2.loot.items.every((i:any)=>hero.bag.some((b:any)=>b.id===i.id&&b.n>=i.n)));bury2();assert.equal(days,1);assert.equal(game.ws.rep,2);
}finally{Math.random=rng}
console.log('corpse rewards: atomic loot and completion, stable retry, side effects once, stale and reentrant callbacks');
