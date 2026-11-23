import './env';
import assert from 'node:assert/strict';
import {baseSenseRange,compressSenseRadius,detailSenseRange,senseFitZoom,SENSE_BURST_MULTIPLIER} from '../src/world/senseRange';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const {Game}=await import('../src/world/game');const {NpcWorld}=await import('../src/world/npc');
const base=Object.getOwnPropertyDescriptor(Game.prototype,'baseSenseRadius')!.get!, effective=Object.getOwnPropertyDescriptor(Game.prototype,'senseRadius')!.get!;
assert.equal(baseSenseRange(0),380);assert.equal(baseSenseRange(20),450+55*Math.sqrt(20));assert.equal(compressSenseRadius(1800),1800);
let prior=0;for(let s=0;s<=100000;s+=10){const r=baseSenseRange(s);assert.ok(r>=prior&&r<=3200);prior=r;}
assert.equal(baseSenseRange(Infinity),3200);assert.equal(baseSenseRange(NaN),380);
const hero:any={sense:4800,hero:{gongfa:''},senseBurstT:0,concealed:false,landmarks:{senseK:1}};Object.defineProperty(hero,'baseSenseRadius',{get:()=>base.call(hero)});
const r=base.call(hero);assert.ok(r>2900&&r<3000);assert.equal(effective.call(hero),r);
hero.senseBurstT=1;assert.equal(effective.call(hero),r*SENSE_BURST_MULTIPLIER);assert.ok(effective.call(hero)<4480);
hero.concealed=true;hero.landmarks.senseK=.5;assert.ok(Math.abs(effective.call(hero)-r*1.4*.6*.5)<1e-9);
hero.hero.gongfa='dayan';assert.ok(base.call(hero)>r&&base.call(hero)<3200);
const npc=(NpcWorld.prototype as any).senseOf;assert.equal(npc.call({}, {realm:5,stage:0}),r);assert.equal(npc.call({}, {realm:0,stage:0}),300);
console.log('sense ranges: monotonic soft cap, real player/NPC getters, multipliers, concealment and mist passed');
// 真实调用链：战斗射程与元婴约束使用独立于收敛的信息玩法基准。
const {Combat}=await import('../src/world/combat');const {YuanyingSys}=await import('../src/world/yuanying');
hero.senseBurstT=0;hero.concealed=false;hero.landmarks.senseK=1;hero.hero.gongfa='';Object.defineProperty(hero,'senseRadius',{get:()=>effective.call(hero)});Object.defineProperty(hero,'actionSenseRadius',{get:()=>Object.getOwnPropertyDescriptor(Game.prototype,'actionSenseRadius')!.get!.call(hero),configurable:true});
const reach=Object.getOwnPropertyDescriptor(Combat.prototype,'reach')!.get!,leash=Object.getOwnPropertyDescriptor(YuanyingSys.prototype,'leash')!.get!;
assert.equal(reach.call({game:hero}),detailSenseRange(r));assert.equal(leash.call({game:hero}),Math.max(900,r*1.05));hero.senseBurstT=1;assert.equal(reach.call({game:hero}),detailSenseRange(r*1.4));

assert.equal(detailSenseRange(380), 380 * 0.68);assert.equal(detailSenseRange(1000), 680);assert.equal(detailSenseRange(3000), 1550);assert.equal(detailSenseRange(NaN), 0);
assert.ok(detailSenseRange(1835, 3) > detailSenseRange(1835, 1), '高境界精细神识内圈应显著大于低境界');
assert.ok(detailSenseRange(3000, 5) > 2200 && detailSenseRange(3000, 5) < 3000, '化神期精细神识内圈突破旧 1600 限制并仍保留外圈余量');
// 收敛只收缩信息外圈；精细圈及战斗射程保持，实际生成/迷雾的旧半径仍隔离。
const action=Object.getOwnPropertyDescriptor(Game.prototype,'actionSenseRadius')!.get!;
const detail=Object.getOwnPropertyDescriptor(Game.prototype,'detailSenseRadius')!.get!;
const awareness=Object.getOwnPropertyDescriptor(Game.prototype,'awarenessRadius')!.get!;
const fullAwareness=Object.getOwnPropertyDescriptor(Game.prototype,'fullAwarenessRadius')!.get!;
Object.defineProperties(hero,{actionSenseRadius:{get:()=>action.call(hero),configurable:true},detailSenseRadius:{get:()=>detail.call(hero)},fullAwarenessRadius:{get:()=>fullAwareness.call(hero)},awarenessRadius:{get:()=>awareness.call(hero)}});
hero.senseBurstT=0;hero.landmarks.senseK=1;hero.concealed=false;const normalDetail=hero.detailSenseRadius,normalReach=reach.call({game:hero}),normalLeash=leash.call({game:hero}),normalInfo=hero.awarenessRadius,normalLegacy=hero.senseRadius;
assert.ok(normalInfo>=normalDetail && normalInfo<normalLegacy);hero.concealed=true;assert.equal(hero.detailSenseRadius,normalDetail);assert.equal(hero.awarenessRadius,normalDetail);assert.equal(reach.call({game:hero}),normalReach);assert.equal(leash.call({game:hero}),normalLeash);assert.equal(hero.senseRadius,normalLegacy*.6);
hero.senseBurstT=1;hero.landmarks.senseK=.5;const suppressedDetail=hero.detailSenseRadius;assert.equal(hero.awarenessRadius,suppressedDetail);hero.concealed=false;assert.equal(hero.detailSenseRadius,suppressedDetail);assert.ok(hero.awarenessRadius>=suppressedDetail);
const {awarenessBaseRange,effectiveAwarenessRange}=await import('../src/world/senseRange');assert.equal(awarenessBaseRange(0),380);assert.equal(awarenessBaseRange(Infinity),6000);assert.ok(awarenessBaseRange(100000)>5500);assert.ok(awarenessBaseRange(4800)>baseSenseRange(4800));
assert.equal(awarenessBaseRange(Infinity,'1' as any in {} ? 1 : 1,'spirit'),7800);assert.equal(awarenessBaseRange(Infinity,1,'immortal'),9800);
let prev=0;for(let v=0;v<1000000;v+=250){const n=awarenessBaseRange(v);assert.ok(n>=prev&&n<=6000);prev=n;}
console.log('awareness separation: actual getters, concealment, burst, mist and bounded growth passed');
// 最远缩放动态贴合完整神识外圈：随视口短边、像素留白和当前完整半径线性变化。
const fitLarge=senseFitZoom(6000,2470,1428),fitSmall=senseFitZoom(6000,800,600);
assert.ok(Math.abs(fitLarge-(1428-32)/(12000))<1e-12);assert.ok(Math.abs(fitSmall-(600-32)/(12000))<1e-12);
assert.ok(senseFitZoom(4000,800,600)>fitSmall,'神识半径变小，最远缩放的合适阈值相应变大');
const fitOffset=senseFitZoom(6000,2470,1428,0.02,1.6,16,400,800);
assert.ok(fitOffset<fitLarge,'相机偏离玩家时仍要把完整神识圈留在画面内');
assert.equal(fitOffset,(1428/2-16)/(6000+800));
assert.equal(senseFitZoom(12000,800,600,0.1,1.6),0.1,'绝对最小缩放下限仍生效');
const zoomGame:any=Object.create(Game.prototype);
Object.assign(zoomGame,{hero:{gongfa:''},landmarks:{senseK:1},renderer:{W:2470,H:1428},player:{x:0,y:0,st:{lift:0}},debugCamDX:0,camLeanX:0,camLeanY:0,cam:{x:0,y:0,targetZoom:0.02},senseBurstT:0,concealed:false,updateUI(){}});
Object.defineProperty(zoomGame,'sense',{get:()=>Infinity});
assert.equal(zoomGame.minZoom,fitLarge);zoomGame.setZoom(0.02);assert.equal(zoomGame.cam.targetZoom,fitLarge);
zoomGame.setZoom(10);assert.equal(zoomGame.cam.targetZoom,Game.ZOOM_MAX);assert.equal(Game.ZOOM_MAX,2.5);
console.log('sense-fit zoom: viewport-bound dynamic minimum and real setZoom clamp passed');
// 实际开关、法力耗尽与敛息路径；满外圈不会用于旧的玩法作用半径。
const {audio}=await import('../src/world/audio');(audio as any).sfx=()=>{};
const character:any=Object.create(Game.prototype);Object.defineProperty(character,'sense',{value:4800,configurable:true});
Object.assign(character,{hero:{gongfa:'',mp:1,realm:3,arts:[]},senseBurstT:0,senseBurstCd:0,concealed:false,landmarks:{senseK:1},renderer:null,senseWaveT:0,senseAlarm:0,scanTimer:100,toast:()=>{},updateUI:()=>{},revealAround:()=>{}});
const full=awarenessBaseRange(character.sense);const idle=character.awarenessRadius;const inner=character.detailSenseRadius;
assert.equal(idle,inner+(full-inner)*.25);assert.ok(idle<full);const gameplay=character.senseRadius;
character.senseBurst();assert.equal(character.hero.mp,.9);assert.equal(character.awarenessRadius,effectiveAwarenessRange(full,character.detailSenseRadius,true,false));assert.ok(character.awarenessRadius>character.detailSenseRadius*1.3);assert.equal(character.senseRadius,gameplay*1.4);
character.endSenseBurst('');assert.equal(character.awarenessRadius,idle);character.senseBurstCd=0;character.toggleConceal();assert.equal(character.awarenessRadius,inner);assert.equal(character.detailSenseRadius,inner);character.toggleConceal();assert.equal(character.awarenessRadius,idle);
character.senseBurst();character.hero.mp=.031;character.updateSense(1);assert.equal(character.senseBurstT,0);assert.equal(character.awarenessRadius,idle);
character.senseBurstCd=0;character.hero.mp=.1;character.senseBurst();assert.equal(character.senseBurstT,0);assert.equal(character.awarenessRadius,idle);
for(const s of [0,20,500,4800,100000,1e8])for(const k of [1,.5]){character.senseBurstT=0;Object.defineProperty(character,'sense',{value:s,configurable:true});character.landmarks.senseK=k;const a=character.awarenessRadius,d=character.detailSenseRadius;assert.ok(a>d,'常态外圈必须严格大于内圈');character.senseBurstT=1;const b=character.awarenessRadius,bd=character.detailSenseRadius;assert.ok(b>bd*1.3 && b>a,'神识外放外圈必须显著大于外放后的内圈与常态外圈');character.concealed=true;assert.equal(character.awarenessRadius,character.detailSenseRadius);character.concealed=false;}
// 三界全境界均保证外放不与内圈重合
for (const w of ['human','spirit','immortal'] as const) {
  for (let r = 0; r <= 12; r++) {
    const s = r === 0 ? 0 : Math.pow(4, r) * 15;
    const base = baseSenseRange(s, 1, 380, w);
    const inN = detailSenseRange(base, r, w);
    const outFull = awarenessBaseRange(s, 1, w);
    const outN = effectiveAwarenessRange(outFull, inN, false, false);
    const inB = detailSenseRange(base * SENSE_BURST_MULTIPLIER, r, w);
    const outB = effectiveAwarenessRange(outFull, inB, true, false);
    assert.ok(outN > inN, `${w} r=${r} 常态外圈应大于内圈 (${outN.toFixed(0)} > ${inN.toFixed(0)})`);
    assert.ok(outB > inB * 1.3, `${w} r=${r} 外放外圈应显著大于内圈 (${outB.toFixed(0)} > ${inB.toFixed(0)})`);
  }
}
console.log('passive vs full awareness: real activation, mana exhaustion, concealment and realm-scale monotonicity passed');
// 元婴实际更新：收敛切换不应把合法位置突然拉回；超出玩法半径仍会被限制。
const yg:any=Object.create(Game.prototype);Object.defineProperty(yg,'sense',{value:4800});Object.assign(yg,{hero:{gongfa:'',mp:1,dead:false},player:{x:2500,y:0,st:{lift:0}},senseBurstT:0,concealed:false,landmarks:{senseK:1},time:0,toast:()=>{}});
const ying:any=new YuanyingSys(yg);ying.active=true;ying.t=10;ying.body={x:0,y:0,hitT:0,st:{setAction(){},update(){}}};const actualLeash=ying.leash;assert.ok(actualLeash>2500);ying.update(.01);assert.equal(yg.player.x,2500);yg.concealed=true;ying.update(.01);assert.equal(yg.player.x,2500);assert.equal(ying.leash,actualLeash);yg.player.x=actualLeash+100;ying.update(.01);assert.equal(yg.player.x,actualLeash);
console.log('yuanying update: concealment does not yank the player; actual leash still enforced');
