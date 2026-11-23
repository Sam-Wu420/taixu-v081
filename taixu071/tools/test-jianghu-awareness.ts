import './env';
import assert from 'node:assert/strict';
const {JianghuSys}=await import('../src/world/jianghu');
const messages:string[]=[], logs:string[]=[];
const g:any={player:{x:0,y:0},hero:{hp:1},time:1,senseBurstT:0,detailSenseRadius:800,awarenessRadius:2200,combat:{enemies:[],lock:null,texts:[]},toast:(s:string)=>messages.push(s),renxin:{recordExp2:(_a:any,_b:any,_c:any,s:string)=>logs.push(s)},juice(){}};
const j:any=new JianghuSys(g);
const leader:any={x:1300,y:0,name:'秘密首领',dead:false,gone:false,def:{kind:'human'}};
const foe:any={x:1500,y:0,dead:false,gone:false,hideT:1,def:{kind:'human'}};
const group:any={leader,foes:[foe],t0:0,sprung:false,warned:false};j.ambushes=[group];g.combat.enemies=[leader,foe];
j.ambushTick(.1);assert.equal(group.warned,false);g.senseBurstT=1;j.ambushTick(.1);assert.equal(group.warned,false);foe.hideT=0;foe.affix={yinOn:true};j.ambushTick(.1);assert.equal(group.warned,false);foe.affix.yinOn=false;foe.x=2400;j.ambushTick(.1);assert.equal(group.warned,false);foe.x=1500;j.ambushTick(.1);assert.equal(group.warned,true);assert.equal(messages.length,1);assert.match(messages[0],/1 道气息/);assert.ok(!messages[0].includes(leader.name));assert.ok(!logs[0].includes(leader.name));j.ambushTick(.1);assert.equal(messages.length,1);
// 进入伏击范围，保留真实触发与危险提示。
foe.x=200;j.ambushTick(.1);assert.equal(group.sprung,true);assert.equal(foe.aggro,true);assert.match(messages.at(-1)!,/伏兵四起/);
// 未预警时触发伏击，经历记录也不暴露圈外首领姓名。
messages.length=0;logs.length=0;foe.x=200;foe.aggro=false;g.senseBurstT=0;group.warned=false;group.sprung=false;j.ambushes=[group];g.combat.enemies=[leader,foe];j.ambushTick(.1);assert.equal(group.sprung,true);assert.ok(!logs[0].includes(leader.name));
// 渔翁攻击保留危险提示，但远处或隐匿时不泄露姓名；撤退也不泄露。
messages.length=0;logs.length=0;const f:any={x:1200,y:0,name:'隐藏渔翁',dead:false,gone:false,busy:true,def:{kind:'human'}};g.combat.enemies=[f];g.hero.hp=.2;j.fisher=f;j.fisherState='watch';j.fisherTick(.1);assert.equal(f.aggro,true);assert.equal(messages.length,1);assert.ok(!messages[0].includes(f.name));assert.ok(!logs[0].includes(f.name));
messages.length=0;g.hero.hp=.9;j.fisher=f;j.fisherState='watch';g.combat.enemies=[f];j.fisherTick(.1);assert.equal(messages.length,0);assert.equal(g.combat.enemies.includes(f),false);
messages.length=0;f.x=200;g.hero.hp=.2;j.fisher=f;j.fisherState='watch';g.combat.enemies=[f];j.fisherTick(.1);assert.ok(messages[0].includes(f.name));
console.log('jianghu awareness: hidden/outer ambushers, one-time warning, real trap and fisher visibility passed');
