import './env';
import assert from 'node:assert/strict';
(globalThis as any).window={addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
(globalThis as any).localStorage={getItem:()=>null,setItem(){}};
const { drawLingdunGL }=await import('../src/gl/lingdungl');
const { Lingdun }=await import('../src/world/lingdun');
const calls:{name:string,args:any[]}[]=[];
const fx:any=new Proxy({}, {get(_t,k){return (...args:any[])=>{calls.push({name:String(k),args})}}});
const hero:any={realm:5,stage:0,dead:false,mp:1};
const game:any={hero,player:{x:300,y:400,st:{lift:30}},trauma:0};
const combat:any={game,pStats:{hp:1000},combatT:0,inCombat:true,shield:null,texts:[]};
const ld=new Lingdun(combat);combat.lingdun=ld;ld.cap=100;ld.hp=[100,100,100,100,100];ld.shown=1;
const before=[...ld.hp];drawLingdunGL(fx,combat,1,1/60,30);
assert.deepEqual(ld.hp,before);assert.equal(calls.length,1);assert.equal(calls[0].name,'sprite');assert.equal(calls[0].args[1],300);assert.equal(calls[0].args[2],320);assert.ok(calls[0].args[7]<=0.05);
// 受击仍消耗护盾并产生逻辑事件；绘制不再产生高亮闪光、粒子或震屏。
const excess=ld.absorb(20,400,400);assert.equal(excess,0);assert.equal(ld.hp[4],80);assert.ok(ld.evq.length>0);
calls.length=0;drawLingdunGL(fx,combat,2,1/60,30);assert.equal(ld.evq.length,0);assert.equal(calls.length,1);assert.equal(calls[0].name,'sprite');assert.ok(calls[0].args[7]<=0.05);
ld.evq.push({k:'pop',i:4,delay:0,ang:0},{k:'gone',i:0,delay:0,ang:0});calls.length=0;drawLingdunGL(fx,combat,3,1/60,30);assert.equal(calls.length,1);
ld.hp=[];calls.length=0;drawLingdunGL(fx,combat,4,1/60,30);assert.equal(calls.length,0);
// 元婴及以下维持原来的多层外观；化神不改变防护层数或伤害算法。
hero.realm=4;ld.hp=[100,100,100,100];ld.shown=1;calls.length=0;drawLingdunGL(fx,combat,5,0,0);assert.ok(calls.filter(c=>c.name==='sprite').length>=8);
hero.realm=5;assert.equal(ld.want,5);hero.stage=2;assert.equal(ld.want,6);
console.log('lingdun visual: faint single huashen outline, no bright hit/pop visuals, correct lift, unchanged absorption and lower-tier effects passed');
