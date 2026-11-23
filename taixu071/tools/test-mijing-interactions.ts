import './env';
import assert from 'node:assert/strict';
import { MijingSys } from '../src/world/mijing';
import { loot } from '../src/world/sites';
import { itemListeners } from '../src/world/cultivation';
let dialog:any, puzzle:any; const messages:string[]=[];
const game:any={hero:{bag:[],dead:false,hp:1},player:{x:100,y:100},toast:(s:string)=>messages.push(s),openDialog:(d:any)=>dialog=d,zhenfa:{openPuzzle:(_n:any,_t:any,cb:any)=>puzzle=cb},combat:{impact:()=>{},randomScroll:()=>null},day:0,ws:{blessUntil:0},sites:{makeCache:()=>null}};
const sys:any=new MijingSys(game), door:any={kind:'door',x:100,y:100,cells:[1]}, herb:any={kind:'herb',x:100,y:100};
const f:any={objs:[door,herb],cells:new Uint8Array([0,2]),chunks:new Map()};const other:any={objs:[],cells:new Uint8Array([0,2]),chunks:new Map()};
const cur:any={spec:{name:'试炼',lv:1,tier:1},fi:0,floors:[f,other],got:[],back:{x:5000,y:6000}};sys.cur=cur;
const oldRandom=Math.random;Math.random=()=>0;
try {
 sys.focus=door;assert.equal(sys.interact(),true);const tal=dialog.options[1];tal.act();assert.equal(door.open,undefined);assert.equal(f.cells[1],2);assert.ok(messages.some(x=>x.includes('不足')));
 game.hero.bag=[{id:'tal_pojin',n:1}];sys.interact();const puzzleAct=dialog.options[0].act; puzzleAct();cur.fi=1;puzzle(true);assert.equal(door.open,undefined);assert.equal(other.cells[1],2);cur.fi=0;
 sys.interact();const stale=dialog.options[1].act;game.player.x=1000;stale();assert.equal(game.hero.bag[0].n,1);game.player.x=100;
 sys.interact();dialog.options[1].act();assert.equal(door.open,true);assert.equal(f.cells[1],1);assert.equal(game.hero.bag.length,0);assert.equal(sys.interact(),false);
 game.hero.dead=true;sys.focus=herb;assert.equal(sys.interact(),false);game.hero.dead=false;
 sys.focus=herb; game.hero.bag=[{id:'herb_lingzhi',n:Number.MAX_SAFE_INTEGER}];sys.interact();assert.equal(herb.used,undefined);assert.equal(cur.got.length,0);
 const herbPlan=sys.herbPlans.get(herb); Math.random=()=>0.99;game.hero.bag=[];sys.interact();assert.equal(game.hero.bag[0].id,herbPlan.id);assert.equal(game.hero.bag[0].n,herbPlan.cnt);assert.equal(herb.used,true);assert.equal(cur.got.length,1);assert.equal(sys.interact(),false);
 Math.random=()=>0;
 const chest:any={kind:'chest',x:100,y:100,tier:1};f.objs.push(chest);sys.focus=chest;game.hero.bag=[{id:'mat_lingshi',n:Number.MAX_SAFE_INTEGER}];let mapArgs:any=null;game.sites.makeCache=(...a:any[])=>{mapArgs=a;return {}};
 sys.interact();assert.equal(chest.used,undefined);assert.equal(game.hero.bag.length,1);assert.equal(mapArgs,null);const plan=sys.chestPlans.get(chest);const expected=plan.items.map((x:any)=>[x.id,x.n]);
 game.hero.bag=[];Math.random=()=>0.99;let reentered=0;const listener=()=>{reentered++;assert.equal(sys.interact(),false)};itemListeners.push(listener);try { sys.interact(); } finally {itemListeners.splice(itemListeners.indexOf(listener),1)}
 assert.equal(chest.used,true);assert.ok(reentered>0);assert.deepEqual(mapArgs,[plan.mapTier,5000,6000]);for(const [id,n] of expected)assert.ok(game.hero.bag.some((b:any)=>b.id===id&&b.n>=n));assert.equal(sys.interact(),false);
 Math.random=()=>0;
 const h:any={bag:[{id:'mat_lingshi',n:Number.MAX_SAFE_INTEGER}]};game.hero=h;const out=loot(game,1,1,{scroll:0,art:0,map:0});assert.ok(!out.some(x=>x.startsWith('灵石 ')));assert.equal(h.bag.find((x:any)=>x.id==='mat_lingshi').n,Number.MAX_SAFE_INTEGER);
} finally {Math.random=oldRandom;}
console.log('mijing interactions: stale floor/distance, duplicate door, talisman consumption, herb failure/retry atomic chest retry, listener reentry, map origin and truthful shared loot reporting passed');
