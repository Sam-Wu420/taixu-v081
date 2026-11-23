import './env';import assert from 'node:assert/strict';
(globalThis as any).window={addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};(globalThis as any).localStorage={getItem:()=>null,setItem(){}};
const {Lingdun}=await import('../src/world/lingdun');
const h:any={realm:3,stage:0,dead:false,mp:1};const g:any={hero:h,player:{x:0,y:0,st:{lift:0}},trauma:0};const c:any={game:g,pStats:{hp:1000},combatT:9,inCombat:false,texts:[]};const s=new Lingdun(c);
const snapshot=()=>JSON.stringify({hp:s.hp,cap:s.cap,shown:s.shown,flash:s.flash,sinceHit:s.sinceHit,fillT:s.fillT,evq:s.evq,mp:h.mp});
for(const n of [NaN,Infinity,-1,Number.MAX_VALUE]){const before=snapshot();s.update(n);assert.equal(snapshot(),before)}
for(const n of [NaN,Infinity,-1,0]){const before=snapshot();assert.equal(s.absorb(n,1,1),0);assert.equal(snapshot(),before)}
s.update(1/60);assert.equal(s.hp.length,3);assert.equal(s.cap,120);assert.deepEqual(s.hp,[120,120,120]);
for(const [field,value] of [['mp',NaN],['realm',NaN],['stage',-1]] as const){const prev=h[field];h[field]=value;const before=snapshot();s.update(1);assert.equal(snapshot(),before);h[field]=prev}
for(const hp of [0,NaN,Infinity,-1]){c.pStats.hp=hp;const before=snapshot();s.update(1);assert.equal(snapshot(),before)}c.pStats.hp=1000;
for(const pos of [NaN,Infinity]){const before=snapshot();assert.equal(s.absorb(10,pos,1),10);assert.equal(snapshot(),before)}
s.hp[1]=NaN;const before=snapshot();assert.equal(s.absorb(10,1,1),10);assert.equal(snapshot(),before);s.update(1);assert.equal(snapshot(),before);s.hp[1]=120;
assert.equal(s.absorb(20,1,1),0);assert.equal(s.hp[2],100);assert.equal(s.evq.at(-1)?.k,'hit');
assert.equal(s.absorb(200,1,1),0);assert.equal(s.hp.length,2);assert.equal(s.hp[1],45);assert.equal(s.evq.at(-1)?.k,'pop');
// 持续受击重凝会等待 4 秒并消耗法力；离战恢复仍按原规则。
c.inCombat=true;c.combatT=0;s.evq=[];s.sinceHit=5;s.fillT=2.5;const mp=h.mp;s.update(.2);assert.equal(s.hp.length,3);assert.equal(h.mp,mp-.03);assert.equal(s.evq.at(-1)?.k,'up');
console.log('lingdun safety: invalid dt, state, overflow and coordinates; normal absorption, break and regeneration passed');
