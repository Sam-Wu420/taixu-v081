import './env';
import assert from 'node:assert/strict';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
import {safeHookDrops,updateWorldDrop,updateWorldDrops} from '../src/world/combatDropSafety';
import {hookNumber} from '../src/mod/safeNumber';
import {setModx} from '../src/mod/hooks';
import * as C from '../src/world/cultivation';
const {Combat}=await import('../src/world/combat');
const {ModHost}=await import('../src/mod/host');
const {audio}=await import('../src/world/audio');(audio.dir as any).hit=()=>{};
for(const bad of [NaN,Infinity,-Infinity,Symbol('bad'),{},null])assert.equal(hookNumber(bad),null);
assert.equal(hookNumber('12'),12);
const malicious:any=[{id:'__proto__',n:1},{id:'mat_lingshi',n:Infinity},{id:'mat_lingshi',n:Symbol('x')},{get id(){throw Error('bad')}},{id:'mat_lingshi',n:3},{id:'mat_lingshi',n:1000000}];
assert.deepEqual(safeHookDrops(malicious),[{id:'mat_lingshi',n:3},{id:'mat_lingshi',n:9999}]);assert.equal(safeHookDrops(Array.from({length:3000},()=>({id:'mat_lingshi',n:1}))).length,256);
const hero=C.newHero();hero.bag=[{id:'mat_lingshi',n:Number.MAX_SAFE_INTEGER}];const p={x:0,y:0};const drop={x:0,y:0,id:'mat_lingshi',n:3,t:1};let notices=0,blocked=0;const add=(id:string,n:number)=>C.addItem(hero,id,n),notice=()=>notices++;
assert.equal(updateWorldDrop(drop,p,false,1,add,notice,()=>blocked++),true);assert.equal(notices,0);assert.equal(blocked,1);assert.equal(updateWorldDrop(drop,p,false,1,add,notice,()=>blocked++),true);assert.equal(blocked,1);assert.equal(updateWorldDrop(drop,{x:1000,y:1000},false,200,add,notice),true,'failed pickup persists even after ordinary expiry');hero.bag=[];drop.x=drop.y=0;
let nested:any;const listener=()=>{nested=updateWorldDrop(drop,p,false,0,add,notice);};C.itemListeners.push(listener);try{assert.equal(updateWorldDrop(drop,p,false,0,add,notice),false)}finally{C.itemListeners.splice(C.itemListeners.indexOf(listener),1)}assert.equal(nested,true);assert.equal(C.bagCount(hero,'mat_lingshi'),3);assert.equal(notices,1);
// The notification itself can reenter, or throw after inventory has committed.
const callbackDrop={x:0,y:0,id:'mat_lingshi',n:2,t:1};let callbackNested:any;
assert.equal(updateWorldDrop(callbackDrop,p,false,0,add,()=>{callbackNested=updateWorldDrop(callbackDrop,p,false,0,add,notice)}),false);assert.equal(callbackNested,false);assert.equal(C.bagCount(hero,'mat_lingshi'),5);
const throwingDrop={x:0,y:0,id:'mat_lingshi',n:2,t:1};assert.throws(()=>updateWorldDrop(throwingDrop,p,false,0,add,()=>{throw Error('notification failed')}));assert.equal(updateWorldDrop(throwingDrop,p,false,0,add,notice),false);assert.equal(C.bagCount(hero,'mat_lingshi'),7);
const ordinary={x:0,y:0,id:'mat_lingshi',n:1,t:1};assert.equal(updateWorldDrop(ordinary,p,true,1,add,notice),true);assert.equal(C.bagCount(hero,'mat_lingshi'),7);
// Pickup callbacks may spawn new drops, recursively update the frame, or throw.
const first={x:0,y:0,id:'mat_lingshi',n:1,t:1}, second={x:0,y:0,id:'mat_lingshi',n:2,t:1}, spawned={x:500,y:500,id:'mat_lingshi',n:4,t:0};
const drops=[first,second];let pickupCount=0;
const step=(d:typeof first):boolean=>updateWorldDrop(d,p,false,0,add,()=>{pickupCount++;if(d===first){drops.push(spawned);updateWorldDrops(drops,step);}});
updateWorldDrops(drops,step);assert.equal(pickupCount,2);assert.deepEqual(drops,[spawned]);assert.equal(C.bagCount(hero,'mat_lingshi'),10);
const badNotice={x:0,y:0,id:'mat_lingshi',n:1,t:1},pending={x:0,y:0,id:'mat_lingshi',n:1,t:1};const queue=[badNotice,pending];
assert.throws(()=>updateWorldDrops(queue,d=>updateWorldDrop(d,p,false,0,add,()=>{throw Error('failed')})));assert.deepEqual(queue,[pending]);assert.equal(C.bagCount(hero,'mat_lingshi'),11);
const badAdd={x:0,y:0,id:'mat_lingshi',n:1,t:1};const retry=[badAdd];assert.throws(()=>updateWorldDrops(retry,d=>updateWorldDrop(d,p,false,0,()=>{throw Error('add failed')},notice)));assert.deepEqual(retry,[badAdd]);
const c:any={game:{terrain:{isLand:()=>true}},dangerCalc:()=>({d:1,k:1,zone:'',region:''}),beastRS:Combat.prototype.beastRS};
const rnd=Math.random;Math.random=()=>.5;
try{
 const base=Combat.prototype.rollBeast.call(c,0,0)!;assert(base);
 setModx({has:(k:string)=>k==='spawn',fire:(_k:string,ctx:any)=>({...ctx,enemyId:'__proto__',realm:NaN,stage:Symbol('bad')})} as any);
 const r=Combat.prototype.rollBeast.call(c,0,0)!;assert.equal(r.def.id,base.def.id);assert.equal(r.realm,base.realm);assert.equal(r.stage,base.stage);
 setModx({has:(k:string)=>k==='spawn',fire:(_k:string,ctx:any)=>({...ctx,enemyId:'boar',realm:3,stage:2})} as any);const changed=Combat.prototype.rollBeast.call(c,0,0)!;assert.equal(changed.def.id,'boar');assert.equal(changed.realm,3);assert.equal(changed.stage,2);
 const target:any={dead:false,hideT:0,hp:1000,maxHp:1000,dfn:10,realm:1,guardT:0,st:{},def:{id:'wolf',kind:'beast',hp:1},x:20,y:30,anim:{hit:0},kx:0,ky:0,hitFlash:0};
 const actor:any={game:{hero:{hp:1,realm:1,equip:{},dead:false},player:{x:0,y:0,st:{lift:0}},time:1,juice(){}},pStats:{hp:1000,def:10},acts:{list:[]},invulnT:0,dash:null,lingdun:{hp:[],layers:0},shield:null,pst:{},enemies:[],texts:[],fxq:[],vfx:[],sparks:[],hitY:()=>30,foe:{phase(){}}};
 setModx({has:(k:string)=>k==='damage',fire:(_k:string,c:any)=>({...c,amount:Symbol('bad')}),artHit(){}} as any);
 Combat.prototype.hitEnemy.call(actor,target,100,{realm:1,stCh:0},0,0);assert.equal(target.hp,1000);Combat.prototype.hitPlayer.call(actor,100,1,undefined,1,1);assert.equal(actor.game.hero.hp,1);
 setModx({has:(k:string)=>k==='exp',fire:(_k:string,c:any)=>({...c,amount:Symbol('bad')})} as any);const expHero=C.newHero(),before=expHero.exp;assert.equal(C.gainExp(expHero,100,[]),0);assert.equal(expHero.exp,before);
}finally{Math.random=rnd;setModx(null)}
const host:any=new ModHost(), m:any={b:{manifest:{id:'test'},files:{}}};let outcome=false,calls=0;host.game={travel:{go(){calls++;return outcome}}};const face=host.face(m);assert.equal(face.travel('dajin'),false);outcome=true;assert.equal(face.travel('dajin'),true);assert.equal(calls,2);
console.log('combat mod safety: invalid hooks, bounded drops, spawn fallback, failed pickup retry and reentrancy');
