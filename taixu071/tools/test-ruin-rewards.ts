import './env';
import assert from 'node:assert/strict';
import {SiteSys} from '../src/world/sites';
import * as C from '../src/world/cultivation';
const hero=C.newHero();hero.realm=2;hero.mp=1;hero.bag=[];
let cb:((ok:boolean)=>void)|undefined, dialogs:any[]=[],eggs=0;
const game:any={hero,player:{x:1000,y:1000},ws:{sites:{}},day:10,baseSenseRadius:1200,senseBurstT:0,combat:{enemies:[],randomScroll:()=>null,rollBeast:()=>null},zhenfa:{lv:0,ruinScroll:()=>null,openPuzzle(_name:any,_tier:any,fn:any){cb=fn;}},pets:{onEgg(){eggs++;}},mijing:{active:false,enterSite(){}},openDialog(n:any){dialogs.push(n);},juice(){},news(){},pursuit:{maybe(){}},toast(){}};
const sys:any=new SiteSys(game);const s:any={kind:'ruin',key:'0,0',x:1000,y:1000,tier:2,seed:11,zone:'',region:''};const state=sys.st(s);state.partner=0;
const opt=(node:any,word:string)=>{const o=node.options.find((x:any)=>x.label.includes(word));assert(o,word);return o.act;};
const rng=Math.random;
try{
 Math.random=()=>0;hero.bag=[{id:'mat_lingshi',n:Number.MAX_SAFE_INTEGER}];
 const strong=opt(sys.ruinNode(s),'强行破禁');assert.match(strong().text,/背包/);assert.equal(state.layer,undefined);assert.equal(hero.mp,1);const plan=sys.pendingRuin.get(state);assert(plan.items.length>1);const captured=JSON.stringify(plan);
 const sense=opt(sys.ruinNode(s),'神识寻隙');assert.match(sense().text,/原方式/);assert.equal(JSON.stringify(sys.pendingRuin.get(state)),captured);
 game.player.x=2000;assert.match(strong().text,/无法接近/);game.player.x=1000;hero.bag=[];Math.random=()=>.99;
 let nested:any;const listener=()=>{nested=strong();};C.itemListeners.push(listener);try{const r=strong();assert.match(r.title,/禁制已破/);}finally{C.itemListeners.splice(C.itemListeners.indexOf(listener),1);}
 assert.match(nested.text,/变化|接近/);assert.equal(state.layer,1);assert(Math.abs(hero.mp-.7)<1e-9);assert.equal(C.bagCount(hero,'mat_lingshi'),plan.items.find((i:any)=>i.id==='mat_lingshi').n);assert.match(strong().text,/变化|接近/);
 // Invalid old talisman actions never consume anything; failure still consumes once.
 hero.bag=[{id:'tal_pojin',n:1}];const tal=opt(sys.ruinNode(s),'以破禁符破之');hero.bag=[];assert.match(tal().text,/破禁符不足/);assert.equal(state.layer,1);
 hero.bag=[{id:'tal_pojin',n:1}];Math.random=()=>.99;tal();assert.equal(C.bagCount(hero,'tal_pojin'),0);assert.equal(state.layer,1);
 // A puzzle callback is one-shot and is invalidated by another attempt or moving away.
 Math.random=()=>0;const puzzle=opt(sys.ruinNode(s),'阵道推演');puzzle();const staleCb=cb!;game.player.x=2000;staleCb(true);assert.equal(state.layer,1);assert.equal(dialogs.length,0);game.player.x=1000;
 puzzle();const old=cb!;const trySense=opt(sys.ruinNode(s),'神识寻隙');trySense();assert.equal(state.layer,2);old(true);assert.equal(state.layer,2);assert.equal(dialogs.length,0);assert.equal(eggs,1,'egg notification once');
 const finalPuzzle=opt(sys.ruinNode(s),'阵道推演');finalPuzzle();const finish=cb!;finish(true);assert.equal(state.layer,3);assert.equal(dialogs.length,1);finish(true);assert.equal(dialogs.length,1);
 // Talisman cost and all loot commit together, with the success and loot fixed on retry.
 const s3={...s,key:'2,0'},v3=sys.st(s3);v3.partner=0;hero.bag=[{id:'mat_lingshi',n:Number.MAX_SAFE_INTEGER},{id:'tal_pojin',n:1}];Math.random=()=>0;
 const useTal=opt(sys.ruinNode(s3),'以破禁符破之');assert.match(useTal().text,/背包/);assert.equal(C.bagCount(hero,'tal_pojin'),1);assert.equal(v3.layer,undefined);const pending=JSON.stringify(sys.pendingRuin.get(v3));
 hero.bag=[{id:'tal_pojin',n:1}];Math.random=()=>.99;assert.match(useTal().title,/禁制已破/);assert.equal(C.bagCount(hero,'tal_pojin'),0);assert.equal(v3.layer,1);assert(pending.includes('mat_lingshi'));
 Math.random=()=>0;
 // Fair companion split requires the promised amount and is one-shot.
 const s2={...s,key:'1,0'},v2=sys.st(s2);v2.layer=3;v2.partner=2;v2.pn='同伴';v2.pr=1;game.ws.rep=0;hero.bag=[{id:'mat_lingshi',n:10}];
 const split=sys.partnerSplit(s2,{id:'honest',fair:1},['灵石 30']);const give=opt(split,'灵石归他');assert.match(give().text,/不足/);assert.equal(game.ws.rep,0);assert.equal(C.bagCount(hero,'mat_lingshi'),10);
 hero.bag=[{id:'mat_lingshi',n:30}];assert.match(give().text,/正道声望/);assert.equal(game.ws.rep,2);assert.equal(C.bagCount(hero,'mat_lingshi'),0);assert.match(give().text,/失效/);assert.equal(game.ws.rep,2);
}finally{Math.random=rng;}
console.log('ruin: atomic rewards and costs, stable retries, stale dialogs, one-shot puzzle and single egg notification');
