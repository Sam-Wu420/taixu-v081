import './env';import assert from 'node:assert/strict';
import {guidanceTaskTargets} from '../src/world/guidanceTasks';import {guidanceMetadata} from '../src/world/guidancePresentation';import {Happen} from '../src/world/happen';import {ACTIVE_MAP} from '../src/data/world';import {ENEMIES} from '../src/data/enemies';
const b:any={id:'b',name:'妖兽',def:'beast',realm:1,stage:0,x:1000,y:0,map:ACTIVE_MAP,until:100};
let roll=0, messages:string[]=[];const game:any={player:{x:0,y:0},day:1,senseRadius:2000,detailSenseRadius:650,senseBurstT:0,ws:{bounties:[b]},combat:{enemies:[],rollBeast:()=>++roll===1?null:{def:ENEMIES.wolf}},toast:(s:string)=>messages.push(s),jianghu:{},modal:null};
const h:any=Object.create(Happen.prototype);Object.assign(h,{game,bountyNotified:new WeakSet()});
h.bountyTick(.1);assert.ok(!b.spawned);assert.equal(game.combat.enemies.length,0);
h.bountyTick(.1);assert.equal(b.spawned,true);assert.equal(game.combat.enemies.length,1);assert.equal(messages.length,0);
game.happen=h;const foe=game.combat.enemies[0];assert.equal(guidanceTaskTargets(game).size,0);assert.equal(foe.tag,'bounty:b');game.player.x=500;foe.hideT=2;h.bountyTick(.1);assert.equal(messages.length,0);foe.hideT=0;h.bountyTick(.1);assert.equal(messages.length,1);const recognized=guidanceTaskTargets(game);assert.ok(recognized.has(foe));const candidate:any={ref:{type:'enemy',actor:foe},kind:'妖物气息',hostile:false};const meta=guidanceMetadata(candidate,new Map(),recognized);assert.equal(meta.priority,2);assert.equal(meta.label,b.name);b.done=true;assert.equal(guidanceTaskTargets(game).size,0);b.done=false;h.bountyTick(.1);assert.equal(messages.length,1);
// 读档后的 combat 已清空；未完成悬赏可重建，已完成的状态不被改动。
const done:any={...b,id:'done',done:true,spawned:true};game.ws.bounties.push(done);game.combat.enemies=[];h.restoreBountySpawns();assert.equal(b.spawned,false);assert.equal(done.spawned,true);h.bountyTick(.1);assert.equal(game.combat.enemies.length,1);assert.equal(b.spawned,true);
// 假悬赏生成失败不得永久标记 spawned；成功且在精细圈才通知。
const f:any={...b,id:'fake',name:'假榜',fake:true,spawned:false,x:1200};game.ws.bounties=[f];game.player.x=0;game.combat.enemies=[];let fail=true;
game.jianghu.spawnFakeTarget=()=>fail?null:{x:1200,y:0,dead:false,gone:false,hideT:0,def:{},tag:'bounty:fake'};
h.bountyTick(.1);assert.ok(!f.spawned);fail=false;h.bountyTick(.1);assert.equal(f.spawned,true);const n=messages.length;assert.equal(game.combat.enemies.length,1);game.player.x=700;h.bountyTick(.1);assert.equal(messages.length,n+1);
console.log('bounty spawn: retry, read-load reactivation, precise visibility notification, fake target and no duplicate passed');
