import './env';
import assert from 'node:assert/strict';
import {SiteSys,SITE_CELL} from '../src/world/sites';
import {ACTIVE_MAP,WORLD_W,WORLD_H} from '../src/data/world';
const ws:any={sites:{}};for(let y=0;y<12;y++)for(let x=0;x<12;x++)ws.sites[`${ACTIVE_MAP}|${x},${y}`]={seen:1};
ws.sites[`${ACTIVE_MAP}|0,0`]={};ws.sites[`other|0,0`]={seen:1};
const game:any={ws,day:0,player:{x:0,y:0},awarenessRadius:10000,detailSenseRadius:1000,senseRadius:1000};
const sys:any=new SiteSys(game);const called:string[]=[];
sys.gen=(x:number,y:number)=>{const key=`${x},${y}`;called.push(key);return {key,x:(x+.5)*SITE_CELL,y:(y+.5)*SITE_CELL,kind:'corpse'};};
const saved=JSON.stringify(ws);let frames=0;
while(frames++<100 && (!sys.restore || sys.restore.index < sys.restore.width*sys.restore.height)) {
  const before=called.length, old=sys.restore?.index ?? 0;
  sys.restoreKnownStep(5000,5000,10000);
  assert.ok(called.length-before<=2);assert.ok(sys.restore.index-old<=16);
}
assert.ok(frames<100);assert.equal(JSON.stringify(ws),saved);assert.ok(!called.includes('0,0'));assert.ok(called.length>2);
assert.equal(new Set(called).size,called.length);const prev=called.length;sys.restoreKnownStep(5000,5000,10000);assert.equal(called.length,prev);
assert.ok(sys.knownSignals(5000,5000,10000).length>0);
ws.sites[`${ACTIVE_MAP}|1,0`].seen=0;assert.ok(!sys.knownSignals(5000,5000,10000).some((s:any)=>s.x===1.5*SITE_CELL && s.y===.5*SITE_CELL));
const oldJob=sys.restore;sys.restoreKnownStep(5000+SITE_CELL,5000,10000);assert.notEqual(sys.restore,oldJob);
const newWs:any={sites:{[`${ACTIVE_MAP}|0,0`]:{seen:1}}};game.ws=newWs;sys.reset();sys.restoreKnownStep(0,0,5000);assert.ok(called.includes('0,0'));
sys.restoreKnownStep(0,0,Infinity);assert.equal(sys.restore,null);sys.restoreKnownStep(WORLD_W+50000,WORLD_H+50000,1000);assert.equal(sys.restore,null);
console.log('site awareness restoration: bounded incremental work, seen-only, cache/read-only and reset/movement/save boundaries passed');
