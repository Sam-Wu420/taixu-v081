import './env';
import assert from 'node:assert/strict';
import {LandmarkSys} from '../src/world/landmarks';
import {LANDMARKS} from '../src/data/landmarks';
import * as C from '../src/world/cultivation';
const s=LANDMARKS.flatMap(l=>l.stands).find(v=>v.k==='remains')!;assert(s);const hero=C.newHero();hero.bag=[{id:'mat_lingshi',n:Number.MAX_SAFE_INTEGER}];hero.hp=1;
let cb:((ok:boolean)=>void)|undefined,dialogs:any[]=[],maps=0;const game:any={hero,player:{x:s.x,y:s.y},ws:{flags:{},blessUntil:0},day:100,mijing:{active:false},stats:{luck:0},combat:{randomScroll:()=>null,enemies:[]},zhenfa:{ruinScroll:()=>null,openPuzzle(_n:any,_l:any,f:any){cb=f;}},sites:{makeCache(){maps++;return null;}},openDialog(n:any){dialogs.push(n)},juice(){},toast(){}};
const sys:any=new LandmarkSys(game);const rng=Math.random;
try{
 Math.random=()=>0;const node=sys.remainsNode(s);node.options[0].act();const stale=cb!;game.player.x+=1000;stale(true);assert.equal(dialogs.length,0);game.player.x=s.x;
 node.options[0].act();const old=cb!;node.options[0].act();const solve=cb!;old(true);assert.equal(dialogs.length,0);solve(true);assert.match(dialogs[0].text,/背包/);assert.equal((game.ws.flags as any).lm.rem[s.id],undefined);const plan=sys.remainsPlans.get((game.ws.flags as any).lm).get(s.id);assert(plan);solve(true);assert.equal(dialogs.length,1);
 const retry=sys.remainsNode(s).options[0].act;hero.bag=[];Math.random=()=>.99;let nested:any;const listener=()=>nested=retry();C.itemListeners.push(listener);try{assert.match(retry().text,/获得/)}finally{C.itemListeners.splice(C.itemListeners.indexOf(listener),1)}assert.match(nested.text,/变化/);assert.equal((game.ws.flags as any).lm.rem[s.id],100);assert(plan.loot.items.every((i:any)=>hero.bag.some((b:any)=>b.id===i.id&&b.n>=i.n)));retry();assert.equal(maps,1);
 // New generation: reset invalidates an outstanding puzzle callback.
 game.day+=3651;const n2=sys.remainsNode(s);n2.options[0].act();const before=dialogs.length,cb2=cb!;sys.reset();cb2(true);assert.equal(dialogs.length,before);
 // Trap callback triggers once and does not grant loot.
 const n3=sys.remainsNode(s);n3.options[0].act();const trap=cb!;const hp=hero.hp;trap(false);assert.equal(game.combat.enemies.length,2);assert.equal(hero.hp,hp-.15);trap(false);assert.equal(game.combat.enemies.length,2);
}finally{Math.random=rng}
console.log('landmark remains: fixed atomic rewards, stale/one-shot puzzle, reset and trap');
