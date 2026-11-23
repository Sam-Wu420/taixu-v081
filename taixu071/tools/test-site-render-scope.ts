import './env';import assert from 'node:assert/strict';import {SiteSys} from '../src/world/sites';
const sys:any=Object.create(SiteSys.prototype);let bounds:any[]=[];
Object.assign(sys,{game:{life:{sense:{x:10000,y:5000,R:1000},vis:()=>1},ws:{caches:[]}},guards:new Map(),inRect:(...a:any[])=>{bounds.push(a);return []}});
const huge={left:-100000,top:-100000,right:100000,bottom:100000};sys.collect([],huge,0,0);assert.deepEqual(bounds,[[9000,4000,11000,6000]]);
bounds=[];sys.collect([],{left:10500,top:4500,right:10700,bottom:4900},0,0);assert.deepEqual(bounds,[[10200,4200,11000,5300]]);
bounds=[];sys.collect([],{left:50000,top:50000,right:60000,bottom:60000},0,0);assert.deepEqual(bounds,[]);
console.log('site rendering: huge viewport limited to detailed sense, partial overlap and no-overlap paths passed');
import { ACTIVE_MAP } from '../src/data/world';
const known:any=Object.create(SiteSys.prototype);const site=(key:string,x:number)=>({key,x,y:100,kind:'corpse'});
known.known=new Map();known.cache=new Map([['0,0',site('0,0',100)],['1,0',site('1,0',2300)],['2,0',site('2,0',4400)]]);
known.game={day:1,ws:{sites:{[ACTIVE_MAP+'|0,0']:{seen:1},[ACTIVE_MAP+'|2,0']:{seen:1,done:10}}}};
const before=JSON.stringify(known.game.ws);assert.deepEqual(known.knownSignals(0,0,5000),[{x:100,y:100,kind:'机缘气息'}]);assert.equal(JSON.stringify(known.game.ws),before);assert.equal(known.cache.size,3);assert.deepEqual(known.knownSignals(0,0,Infinity),[]);
console.log('known site signals: discovered, available, cached only; no mutation');

known.rememberKnown(known.cache.get('0,0'));known.cache.clear();assert.deepEqual(known.knownSignals(0,0,5000),[{x:100,y:100,kind:'机缘气息'}]);
known.game.ws.sites[ACTIVE_MAP+'|0,0'].seen=0;assert.deepEqual(known.knownSignals(0,0,5000),[]);
for(let i=0;i<SiteSys.KNOWN_LIMIT+10;i++)known.rememberKnown({key:`${i},0`,x:i*2150,y:0,kind:'corpse'});
assert.equal(known.known.size,SiteSys.KNOWN_LIMIT);known.guards=new Map();known.reset();assert.equal(known.known.size,0);
console.log('site known memory survives generation cache eviction, remains bounded and rechecks save state');
