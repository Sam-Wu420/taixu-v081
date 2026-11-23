import './env';import assert from 'node:assert/strict';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const {Terrain}=await import('../src/world/terrain');const {Game}=await import('../src/world/game');const {Enemy}=await import('../src/world/combat');const {ENEMIES}=await import('../src/data/enemies');
const t=new Terrain();t.build();const g:any=new Game(t);g.reset();const c:any=g.combat;c.safeAt=()=>false;c.snub=()=>false;
Object.defineProperty(g,'detailSenseRadius',{value:800,configurable:true});Object.defineProperty(g,'awarenessRadius',{value:2200,configurable:true});g.player.x=100000;g.player.y=100000;g.hero.realm=1;g.concealed=false;
const def={...ENEMIES.bandit,aggro:1600,speed:0};const a=new Enemy(def,g.player.x+1200,g.player.y,1,0),b=new Enemy(def,g.player.x+1300,g.player.y,1,0);a.speed=b.speed=0;a.st.root=b.st.root=100;c.enemies=[a,b];
// 外圈里真实敌人仍能进入仇恨，不能刷出细节文字。
for(let i=0;i<120;i++){g.time=i/60;c.updateEnemies(1/60,false);}assert.equal(a.aggro,true);assert.equal(b.aggro,true);assert.equal(c.texts.length,0);
// 精细圈内重复被其他系统清仇恨时，独立敌人各自最多一次台词。
a.x=g.player.x+400;b.x=g.player.x+500;a.hx=a.x;b.hx=b.x;a.aggro=b.aggro=false;g.time=10;c.updateEnemies(1/60,false);assert.equal(c.texts.length,2);
for(let i=1;i<=180;i++){a.aggro=b.aggro=false;g.time=10+i/60;c.updateEnemies(1/60,false);}assert.equal(c.texts.filter((x:any)=>['留下储物袋！','小子，找死！','杀人夺宝！'].includes(x.s)).length,2);
a.aggro=b.aggro=false;g.time=14.1;c.updateEnemies(1/60,false);assert.equal(c.texts.filter((x:any)=>['留下储物袋！','小子，找死！','杀人夺宝！'].includes(x.s)).length,4);
// 出生点越界不允许即刻重获仇恨，敌人状态不会每帧反复切换。
c.texts=[];a.aggro=false;a.hx=a.x-3300;b.dead=true;g.time=20;
for(let i=0;i<120;i++){g.time+=1/60;c.updateEnemies(1/60,false);assert.equal(a.aggro,false);}assert.equal(c.texts.length,0);
a.hx=a.x;a.aggro=false;g.time=25;c.updateEnemies(1/60,false);assert.equal(a.aggro,true);assert.equal(c.texts.length,1);
console.log('enemy aggro: outer detail suppression, independent throttling, leash anti-churn and normal reacquisition passed');
// 经真实 UI 绘制方法：台词存续期间敌人进入外圈或隐匿，文字立即隐藏。
const {drawCombatUI}=await import('../src/world/combatfx');let textDraws=0;
const ctx:any=new Proxy({canvas:{width:800,height:600},getTransform:()=>({a:1,b:0,c:0,d:1,e:0,f:0}),fillText:()=>textDraws++},{get:(o:any,k:any)=>k in o?o[k]:(()=>{}),set:(o:any,k:any,v:any)=>{o[k]=v;return true}});
const scene:any={game:{hero:{},life:{sense:{x:0,y:0,R:800}},senseBurstT:0},foe:{ultCharge:()=>0,ultFlash:0},units:[],lock:null,texts:[{x:10,y:10,s:'杀人夺宝！',t:0,vy:0,color:'#fff',source:a}]};
a.x=1200;a.y=0;a.hideT=0;drawCombatUI(ctx,scene,0,1);assert.equal(textDraws,0);a.x=200;drawCombatUI(ctx,scene,0,1);assert.equal(textDraws,1);a.hideT=1;drawCombatUI(ctx,scene,0,1);assert.equal(textDraws,1);
console.log('threat text rendering: exits inner circle and hidden targets do not leak');
// 带来源的伤害/击杀文本在圈内仍可显示；无来源的玩家信息保持原样。
a.hideT=0;a.dead=true;a.x=200;scene.texts=[{x:200,y:10,s:'伤害 10',t:0,vy:0,color:'#fff',source:a},{x:0,y:0,s:'玩家受伤',t:0,vy:0,color:'#fff'}];drawCombatUI(ctx,scene,0,1);assert.equal(textDraws,3);
a.x=1200;drawCombatUI(ctx,scene,0,1);assert.equal(textDraws,4);a.x=200;a.hideT=1;drawCombatUI(ctx,scene,0,1);assert.equal(textDraws,5);
console.log('enemy hit/death text obeys visibility; player text remains visible');
// 跨模块真实生成的护体提示也必须经过同一绘制过滤；数值效果不受影响。
const {giveWard,blinkTo}=await import('../src/world/foemind');
a.dead=false;a.hideT=0;a.x=1200;a.y=0;c.texts=[];giveWard(c,a,0.3,'1,2,3');assert.equal(a.ward.hp,a.maxHp*0.3);assert.equal(c.texts[0].source,a);
scene.texts=c.texts;const before=textDraws;drawCombatUI(ctx,scene,0,1);assert.equal(textDraws,before);a.x=200;drawCombatUI(ctx,scene,0,1);assert.equal(textDraws,before+1);a.hideT=1;drawCombatUI(ctx,scene,0,1);assert.equal(textDraws,before+1);
a.hideT=0;a.sup=0;blinkTo(c,a,1200,0,'earth');assert.equal(c.texts.at(-1).source,a);scene.texts=[c.texts.at(-1)];drawCombatUI(ctx,scene,0,1);assert.equal(textDraws,before+1);
console.log('cross-module ward and blink text use actual enemy visibility without changing gameplay');
// 实际威压更新仍作用于圈外敌人，但关联该敌人的提示不可泄漏。
g.hero.realm=5;g.hero.dead=false;g.concealed=false;g.senseBurstT=5;a.realm=1;a.dead=false;a.gone=false;a.ally=false;a.hideT=0;a.sup=0;a.x=g.player.x+1000;a.y=g.player.y;c.enemies=[a];c.texts=[];c.sup.update(1);assert.equal(a.sup,2);const supText=c.texts.find((v:any)=>v.s==='镇压！');assert.ok(supText);assert.equal(supText.source,a);
scene.game.life.sense.x=g.player.x;scene.game.life.sense.y=g.player.y;scene.texts=[supText];const supBefore=textDraws;drawCombatUI(ctx,scene,0,1);assert.equal(textDraws,supBefore);a.x=g.player.x+200;drawCombatUI(ctx,scene,0,1);assert.equal(textDraws,supBefore+1);a.hideT=1;drawCombatUI(ctx,scene,0,1);assert.equal(textDraws,supBefore+1);
console.log('suppression update retains gameplay while enemy onset text respects visibility');
// 普通 NPC 的真实压制行为绑定动态来源，NPC 离场/隐身时残留文字不能泄露。
const world:any=g.npcs;const npc:any={d:{id:'visibility-test',alive:true,realm:1},st:{x:g.player.x+1000,y:g.player.y,speed:10,lift:0,setAction(){}},act:'approach',sup:0};world.active.set(npc.d.id,npc);c.texts=[];c.vfx=[];c.sparks=[];(c.sup as any).txtBudget=4;g.life.sense={x:g.player.x,y:g.player.y,R:800};world.suppress(npc,npc.st.x,npc.st.y,.1);assert.equal(npc.sup,2);assert.equal(npc.st.speed,0);assert.equal(c.texts.length,1);assert.equal(c.vfx[0].source,c.texts[0].source);assert.equal(c.sparks[0].source,c.texts[0].source);
scene.texts=c.texts;const npcBefore=textDraws;drawCombatUI(ctx,scene,0,1);assert.equal(textDraws,npcBefore);npc.st.x=g.player.x+200;drawCombatUI(ctx,scene,0,1);assert.equal(textDraws,npcBefore+1);npc.d.hidden=true;drawCombatUI(ctx,scene,0,1);assert.equal(textDraws,npcBefore+1);npc.d.hidden=false;world.active.delete(npc.d.id);drawCombatUI(ctx,scene,0,1);assert.equal(textDraws,npcBefore+1);
const {actorFxVisible,drawCombatFx}=await import('../src/world/combatfx');world.active.set(npc.d.id,npc);assert.equal(actorFxVisible(c,c.vfx[0].source),true);npc.st.x=g.player.x+1000;assert.equal(actorFxVisible(c,c.vfx[0].source),false);assert.equal(actorFxVisible(c,undefined),true);
// Canvas 实际路径：圈外被压制的环和火花不绘制；未绑定来源的玩家效果仍绘制。
let arcs=0,ellipses=0;const ctxFx:any=new Proxy({canvas:{width:800,height:600},arc(){arcs++},ellipse(){ellipses++},createRadialGradient(){return {addColorStop(){}}},createLinearGradient(){return {addColorStop(){}}}},{get:(o:any,k:any)=>k in o?o[k]:(()=>{}),set:(o:any,k:any,v:any)=>{o[k]=v;return true}});
c.enemies=[];const effects=c.vfx.slice(),sparks=c.sparks.slice();c.vfx=[];c.sparks=[];drawCombatFx(ctxFx,c,0);const base=[arcs,ellipses];arcs=ellipses=0;c.vfx=effects;c.sparks=sparks;drawCombatFx(ctxFx,c,0);assert.deepEqual([arcs,ellipses],base);arcs=ellipses=0;npc.st.x=g.player.x+200;drawCombatFx(ctxFx,c,0);assert.ok(arcs>base[0]||ellipses>base[1]);
console.log('NPC suppression: real state, dynamic source lifecycle and actual Canvas effect filtering passed');
// GL 入口以 mock FxSys 执行；只统计压制火花坐标，避开其他动态效果。
const {drawCombatGL}=await import('../src/gl/combatgl');let marked=0;
const noopBatch:any=new Proxy({},{get:()=>()=>{}});
const fakeFx:any=new Proxy({},{get:(_o,k)=>k==='batch'||k==='B'?noopBatch:(...args:any[])=>{if(k==='glow' && c.sparks.some((v:any)=>v.x===args[0] && v.y===args[1])) marked++;return 0}});
npc.st.x=g.player.x+1000;drawCombatGL(fakeFx,c,0,0);assert.equal(marked,0);npc.st.x=g.player.x+200;drawCombatGL(fakeFx,c,0,0);assert.equal(marked,c.sparks.length);marked=0;npc.d.hidden=true;drawCombatGL(fakeFx,c,0,0);assert.equal(marked,0);npc.d.hidden=false;
console.log('NPC suppression: mock WebGL submission filters invisible source effects');
