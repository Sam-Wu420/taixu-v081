import './env';import assert from 'node:assert/strict';import {senseSignals} from '../src/world/senseSignals';import {detailSenseRange} from '../src/world/senseRange';
const enemies:any[]=[{x:1200,y:0,aggro:true,def:{kind:'human'}},{x:1400,y:0,aggro:true,def:{kind:'human'}},{x:0,y:1300,def:{kind:'beast'}},{x:0,y:-1200,hideT:1,def:{}},{x:0,y:-1300,def:{hide:true}},{x:2300,y:0,def:{}},{x:200,y:0,def:{}},{x:1300,y:100,ally:true,def:{}}];
const npcs:any[]=[{d:{alive:true},st:{x:-1250,y:0}},{d:{alive:false},st:{x:-1300,y:0}},{d:{alive:true},st:{x:1250,y:0},enemy:{}},{d:{alive:true},st:{x:1250,y:0},act:'follow'}];
let signals=senseSignals(enemies,npcs,0,0,1000,2000,false);assert.equal(signals.length,3);assert.deepEqual(signals[0],{kind:'修士气息',direction:'东',count:2,distance:1200,hostile:true});assert.ok(signals.some(x=>x.kind==='妖物气息'&&x.direction==='南'));assert.ok(signals.some(x=>x.kind==='人影气息'&&x.direction==='西'));assert.ok(!JSON.stringify(signals).includes('name'));
signals=senseSignals(enemies,npcs,0,0,1000,2000,true);assert.ok(signals.some(x=>x.direction==='北'));assert.equal(senseSignals(enemies,npcs,0,0,2000,2000,true).length,0);assert.equal(senseSignals(enemies,npcs,NaN,0,100,2000,true).length,0);assert.equal(senseSignals(enemies,npcs,0,0,1000,2000,true,1).length,1);
// 战斗真实选目标/锁定调用：外圈只作为气息，进入内圈才可锁定。
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const {Combat}=await import('../src/world/combat');const c:any=Object.create(Combat.prototype);const outer=3000,inner=detailSenseRange(outer);
Object.assign(c,{game:{player:{x:0,y:0},senseRadius:outer,senseBurstT:0},enemies:[{x:inner+100,y:0,aggro:true,dead:false},{x:inner-10,y:0,aggro:true,dead:false}],lock:null,manual:false});
assert.equal(c.pickTarget(),c.enemies[1]);c.lock=c.enemies[0];c.manual=true;assert.equal(c.pickTarget(),c.enemies[1]);c.cycleLock();assert.equal(c.lock,c.enemies[1]);
console.log('dual sense: outer-only grouped signals, hidden and dead exclusions, direction, and real combat targeting passed');
assert.deepEqual(senseSignals([], [], 0, 0, 100, 1000, false, 5, [{x:500,y:0,kind:'机缘气息'},{x:600,y:0,kind:'机缘气息'},{x:10,y:0,kind:'灵物气息'}]), [{kind:'机缘气息',direction:'东',count:2,distance:500,hostile:false}]);
assert.equal(senseSignals([{x:1200,y:0,def:{hide:true}},{x:1300,y:0,def:{},affix:{yinOn:true}}],[],0,0,1000,6000,false).length,0);
assert.equal(senseSignals([{x:1200,y:0,def:{hide:true}}],[],0,0,1000,6000,true).length,1);
