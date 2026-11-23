import { createCanvas } from './env.ts';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><div class="game-root"><div id="root"></div><div class="top-right"><div class="sense-list-host"></div></div></div>', { pretendToBeVisual:true, url:'https://game.example/' });
const { window } = dom;
globalThis.window=window;globalThis.document=window.document;Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});globalThis.localStorage=window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
Object.defineProperty(window.HTMLElement.prototype,'clientWidth',{get(){return 800;}});
Object.defineProperty(window.HTMLElement.prototype,'clientHeight',{get(){return 600;}});
window.HTMLCanvasElement.prototype.getContext=function(){return {font:'',measureText:text=>({width:text.length*12})};};
let callbacks=new Map(), next=0;
const raf=fn=>{const id=++next;callbacks.set(id,fn);return id;};
const cancel=id=>callbacks.delete(id);
globalThis.requestAnimationFrame=window.requestAnimationFrame=raf;globalThis.cancelAnimationFrame=window.cancelAnimationFrame=cancel;
const step=now=>{const jobs=[...callbacks.values()];callbacks.clear();for(const f of jobs)f(now);};
const React=await import('react');const {createRoot}=await import('react-dom/client');
const {SenseGuidance}=await import('../src/ui/SenseGuidance.tsx');
const alive=new Set([1200,1300,1400]);
const points=()=>[1200,1300,1400].filter(x=>alive.has(x)).map(x=>({x,y:0,kind:'机缘气息'}));
const game={inCave:false,mijing:{active:false},hero:{dead:false},tianxiang:{active:false},cinemaHideHud:false,
  player:{x:0,y:0},cam:{x:0,y:0,zoom:.2},detailSenseRadius:1000,awarenessRadius:3000,senseBurstT:0,day:1,ws:{},
  combat:{enemies:[{x:1500,y:250,blv:2,def:{kind:'beast'}},{x:1600,y:260,blv:5,def:{kind:'beast'}},{x:1700,y:260,blv:10,hideT:1,def:{kind:'beast'}}]},npcs:{active:new Map(),byId:new Map()},life:{vis:()=>1},
  sites:{knownSignals:points,isKnownSignal:x=>alive.has(x),signalMarkerHeight:()=>180},
  nodes:{knownSignals:()=>[]},events:{enc:[]},happen:{haps:[]}};
const root=createRoot(document.getElementById('root'));
await React.act(async()=>root.render(React.createElement(SenseGuidance,{game})));
step(1000);
const layer=document.querySelector('.sense-guidance');
assert.match(document.querySelector('.sense-list-mode').textContent,/^全部$/,'desktop defaults to all');
const label=[...layer.querySelectorAll('.sense-guidance-tag')].find(e=>e.textContent.includes('机缘'));
assert.ok(label);assert.match(label.textContent,/3道/);
const beast=[...layer.querySelectorAll('.sense-guidance-tag')].find(e=>e.textContent.includes('妖物'));
assert.ok(beast);assert.match(beast.textContent,/2道 · 2—5级/);assert.ok(!beast.textContent.includes('10级'),'hidden rank excluded');
label.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));step(1020);
assert.match(layer.querySelector('.sense-guidance-mark.selected .sense-guidance-label').textContent,/3道/);
assert.equal(layer.querySelectorAll('.sense-guidance-member').length,2,'other two outer targets each retain a circle-edge direction');
assert.doesNotMatch(layer.querySelector('.sense-guidance-mark.selected .sense-guidance-label').textContent,/已关注|境界/);
assert.equal(layer.querySelectorAll('.sense-guidance-arrived').length,0);
game.player.x=300;game.cam.x=300;step(1200);
assert.equal(layer.querySelectorAll('.sense-guidance-arrived').length,2,'first two enter while one remains in outer circle');
let siteArrow=[...layer.querySelectorAll('.sense-guidance-arrived')].find(el=>parseFloat(el.style.left)===400+(1200-game.cam.x)*game.cam.zoom);
assert.ok(siteArrow,'site arrow immediately uses current camera projection');
assert.notEqual(layer.querySelector('.sense-guidance-mark.selected').style.display,'none');
game.player.x=500;game.cam.x=500;step(2000);
assert.equal(layer.querySelectorAll('.sense-guidance-arrived').length,3,'all selected sites have persistent arrows');
siteArrow=[...layer.querySelectorAll('.sense-guidance-arrived')].find(el=>parseFloat(el.style.left)===400+(1200-game.cam.x)*game.cam.zoom);assert.ok(siteArrow,'site arrow stays attached when camera moves');
assert.equal(layer.querySelector('.sense-guidance-mark.selected').style.display,'none');
step(5000);assert.equal(layer.querySelectorAll('.sense-guidance-arrived').length,3,'arrows do not time out');
game.life.vis=()=>0;step(5010);assert.equal(layer.querySelectorAll('.sense-guidance-arrived').length,0,'imperceptible sites are not shown');
game.life.vis=()=>1;step(5015);assert.equal(layer.querySelectorAll('.sense-guidance-arrived').length,3,'temporarily unseen tracked sites reappear');
alive.delete(1200);step(5020);assert.equal(layer.querySelectorAll('.sense-guidance-arrived').length,2,'completed/depleted target removed independently');
layer.querySelector('.sense-guidance-arrived').dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
assert.equal(layer.querySelectorAll('.sense-guidance-arrived').length,0,'cancel clears entire selection');
assert.equal(layer.querySelectorAll('.sense-guidance-mark.selected').length,0);
game.player.x=0;game.cam.x=0;step(6000);
const again=[...layer.querySelectorAll('.sense-guidance-tag')].find(e=>e.textContent.includes('机缘'));
assert.ok(again);again.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));step(6020);
assert.ok(layer.querySelector('.sense-guidance-mark.selected'));
game.awarenessRadius=100;step(6040);
assert.equal(layer.querySelectorAll('.sense-guidance-mark.selected,.sense-guidance-arrived').length,0,'lost awareness drops group');
// A normal beast remains selected on entry and tracks its live position, not only important NPCs.
game.awarenessRadius=3000;step(6600);
const beastTag=[...layer.querySelectorAll('.sense-guidance-tag')].find(e=>e.textContent.includes('妖物'));
assert.ok(beastTag);beastTag.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));step(6620);
assert.equal(layer.querySelectorAll('.sense-guidance-member').length,1,'every grouped beast has its own outer-circle marker');assert(!layer.textContent.includes('气息'),'visible labels omit 气息');
game.player.x=600;game.cam.x=600;step(6700);
let focus=layer.querySelector('.sense-guidance-arrived');assert.ok(focus);assert.equal(focus.textContent,'▼');
assert.equal(parseFloat(focus.style.left),400+(1500-game.cam.x)*game.cam.zoom);
game.combat.enemies[0].x=1520;game.cam.x=620;step(7500);
focus=layer.querySelector('.sense-guidance-arrived');assert.ok(focus);assert.equal(parseFloat(focus.style.left),400+(1520-game.cam.x)*game.cam.zoom,'moving creature remains anchored');
game.player.x=800;game.cam.x=800;step(7510);assert.equal(layer.querySelectorAll('.sense-guidance-arrived').length,2,'all selected beasts get arrows');
game.combat.enemies[0].dead=true;step(7520);assert.equal(layer.querySelectorAll('.sense-guidance-arrived').length,1,'dead target clears independently');
layer.querySelector('.sense-guidance-arrived').dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
// Non-important NPCs also retain a clickable head marker until explicitly cancelled.
game.player.x=0;game.cam.x=0;const person={id:'n',alive:true,hidden:false,realm:2},person2={id:'n2',alive:true,hidden:false,realm:1};const npc={st:{x:-1400,y:0,lift:0},d:person},npc2={st:{x:-1500,y:0,lift:0},d:person2};game.npcs.byId.set('n',person);game.npcs.byId.set('n2',person2);game.npcs.active.set('n',npc);game.npcs.active.set('n2',npc2);step(8100);
const npcTag=[...layer.querySelectorAll('.sense-guidance-tag')].find(e=>e.textContent.includes('修士'));
assert.ok(npcTag);npcTag.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));step(8120);game.player.x=-600;game.cam.x=-600;step(8200);
assert.equal(layer.querySelectorAll('.sense-guidance-arrived').length,2,'all selected NPCs get head arrows');
const shell={x:-1400,y:0,npcId:'n',realm:2,aggro:true,def:{kind:'human'},anim:{flying:false}};npc.enemy=shell;game.combat.enemies.push(shell);step(8300);
assert.equal(layer.querySelectorAll('.sense-guidance-arrived').length,2,'proven NPC-to-combat transition retains tracking');
step(10000);assert.equal(layer.querySelectorAll('.sense-guidance-arrived').length,2,'NPCs remain tracked after arrival');layer.querySelector('.sense-guidance-arrived').dispatchEvent(new window.MouseEvent('click',{bubbles:true}));assert.equal(layer.querySelectorAll('.sense-guidance-arrived').length,0);
await React.act(async()=>root.unmount());assert.equal(callbacks.size,0,'raf cleaned up');
// Actual frame loop moves labels progressively while arrows keep immediate projection.
game.player.x=0;game.player.y=0;game.cam.x=0;game.cam.y=0;game.combat.enemies=[{x:1500,y:250,blv:2,def:{kind:'beast'}}];game.npcs.active.clear();game.npcs.byId.clear();
const root2=createRoot(document.getElementById('root'));await React.act(async()=>root2.render(React.createElement(SenseGuidance,{game})));step(11000);
const layer2=document.querySelector('.sense-guidance'),moving=[...layer2.querySelectorAll('.sense-guidance-tag')].find(el=>el.textContent.includes('妖物'));
const coords=()=>moving.style.transform.match(/translate3d\(([-.\d]+)px,([-.\d]+)px/).slice(1).map(Number);
const initial=coords();game.player.y=180;step(11300);const middle=coords();step(11316);const later=coords();
assert.notDeepEqual(middle,initial,'layout begins to move');assert.notDeepEqual(later,middle,'layout continues smoothly over subsequent frames');
const arrow2=layer2.querySelector('.sense-guidance-mark.direction');assert.notEqual(arrow2.style.display,'none');
// The same beast crossing a direction sector reuses the existing label rather than blinking.
game.combat.enemies[0].y=1500;step(11840);assert.ok(moving.isConnected,'same actor retains its label across sector change');
game.combat.enemies[0].hideT=1;step(11856);assert.equal(moving.style.display,'none','hidden target is concealed immediately, not faded');
await React.act(async()=>root2.unmount());assert.equal(callbacks.size,0);
// Mobile defaults to the low-clutter mode; list filters and selection share the same targeting.
window.localStorage.clear();document.querySelector('.game-root').classList.add('touch');game.combat.enemies=[{x:1500,y:250,blv:2,def:{kind:'beast'}},{x:1600,y:260,blv:5,def:{kind:'beast'}}];game.player.y=0;game.cam.y=0;
const root3=createRoot(document.getElementById('root'));await React.act(async()=>root3.render(React.createElement(SenseGuidance,{game})));step(13000);
const panel=document.querySelector('.sense-list'),mode=panel.querySelector('.sense-list-mode');assert.match(mode.textContent,/仅高亮/);
assert.ok([...document.querySelectorAll('.sense-guidance-mark.direction')].every(e=>e.style.display==='none'),'mobile hides unselected pins');
const tabs=[...panel.querySelectorAll('.sense-list-tabs button')];tabs.find(e=>e.textContent==='妖兽').click();step(13020);
let listRows=[...panel.querySelectorAll('.sense-list-row')];assert.equal(listRows.length,1);assert.match(listRows[0].textContent,/妖物/);
mode.click();step(13025);let visibleTags=[...document.querySelectorAll('.sense-guidance-tag')].filter(e=>e.style.display!=='none');assert.ok(visibleTags.length>0&&visibleTags.every(e=>e.textContent.includes('妖物')),'beast filter applies to circle labels');mode.click();step(13030);
listRows[0].click();step(13040);
assert.ok(document.querySelector('.sense-guidance-mark.selected'),'list selection creates true direction marker');assert.ok(!panel.querySelector('.sense-list-pinned').hidden);assert.match(panel.querySelector('.sense-list-pinned').textContent,/妖物/);
game.player.x=800;game.cam.x=800;step(13050);assert.equal(document.querySelectorAll('.sense-guidance-arrived').length,2);assert.ok(!panel.querySelector('.sense-list-pinned').hidden,'selection stays pinned inside inner circle');
tabs.find(e=>e.textContent==='机缘').click();step(13055);assert.ok(!panel.querySelector('.sense-list-pinned').hidden,'pinned item survives category change');
game.player.x=0;game.cam.x=0;tabs.find(e=>e.textContent==='妖兽').click();step(13058);
mode.click();step(13060);assert.match(mode.textContent,/全部/);assert.ok([...document.querySelectorAll('.sense-guidance-mark.direction')].every(e=>e.style.display==='none'),'beast tab excludes other unselected circle markers');
assert.ok(document.querySelector('.sense-guidance-mark.selected'),'focused beast remains visible irrespective of category');
tabs.find(e=>e.textContent==='机缘').click();step(13064);
assert.ok([...document.querySelectorAll('.sense-guidance-tag')].filter(e=>e.style.display!=='none').every(e=>e.textContent.includes('机缘')),'only opportunity labels appear on ring');
assert.ok([...document.querySelectorAll('.sense-guidance-tag')].some(e=>e.style.display!=='none'&&e.textContent.includes('机缘')),'opportunity category has visible markers');
assert.ok(document.querySelector('.sense-guidance-mark.selected'),'selected beast remains highlighted across tabs');
// The same real selected group also preserves inner Canvas labels across categories.
const {drawCombatUI:drawSelectedCombat}=await import('../src/world/combatfx.ts');
const selectedCanvas=createCanvas(800,600),selectedCtx=selectedCanvas.getContext('2d'),selectedTexts=[],selectedFill=selectedCtx.fillText.bind(selectedCtx);
selectedCtx.fillText=(text,...args)=>{selectedTexts.push(text);return selectedFill(text,...args);};selectedCtx.setTransform(.2,0,0,.2,0,300);
Object.assign(game.hero,{realm:1,stage:0});game.life.sense={x:0,y:0,R:10000};
game.combat.enemies.forEach((e,i)=>Object.assign(e,{name:`兽${i}`,rankText:'炼气',hp:1,maxHp:1,anim:{},st:{}}));
Object.assign(game.combat,{game,units:game.combat.enemies,lock:null,foe:{ultCharge:()=>0,ultFlash:0},texts:[]});
drawSelectedCombat(selectedCtx,game.combat,0,.5);assert.deepEqual(selectedTexts,['兽0·炼气','兽1·炼气'],'selected beasts retain Canvas labels in another tab');
game.combat.enemies[0].hideT=1;selectedTexts.length=0;drawSelectedCombat(selectedCtx,game.combat,0,.5);assert.deepEqual(selectedTexts,['兽1·炼气'],'selection never exposes hidden beast');game.combat.enemies[0].hideT=0;
tabs.find(e=>e.textContent==='全部').click();step(13070);assert.ok([...document.querySelectorAll('.sense-guidance-mark.direction')].some(e=>e.style.display!=='none'),'all category restores unselected markers');
mode.click();step(13080);assert.ok([...document.querySelectorAll('.sense-guidance-mark.direction')].every(e=>e.style.display==='none'));
const toggle=panel.querySelector('.sense-list-toggle');toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(panel.querySelector('.sense-list-content').hidden,true);toggle.click();
game.combat.enemies[0].hideT=1;step(13096);assert.doesNotMatch(panel.querySelector('.sense-list-pinned').textContent,/2—5级/,'hidden member rank not retained');step(13112);assert.doesNotMatch(panel.textContent,/2—5级/);
tabs.find(e=>e.textContent==='机缘').click();toggle.click(); // Persist category, mode and folded state.
await React.act(async()=>root3.unmount());assert.equal(document.querySelector('.sense-list'),null,'list cleaned on unmount');
const root4=createRoot(document.getElementById('root'));await React.act(async()=>root4.render(React.createElement(SenseGuidance,{game})));step(14000);
const restored=document.querySelector('.sense-list');assert.match(restored.querySelector('.sense-list-mode').textContent,/仅高亮/);assert.equal(restored.querySelector('.sense-list-toggle').getAttribute('aria-expanded'),'false');assert.equal([...restored.querySelectorAll('.sense-list-tabs button')].find(e=>e.textContent==='机缘').getAttribute('aria-pressed'),'true');
// Switch real UI tabs and draw the real combat UI into Canvas using the same game instance.
const {drawCombatUI}=await import('../src/world/combatfx.ts');
const canvas=createCanvas(800,600),ctx=canvas.getContext('2d'),labels=[],fill=ctx.fillText.bind(ctx);
ctx.fillText=(text,...args)=>{labels.push(text);return fill(text,...args);};ctx.setTransform(.5,0,0,.5,400,300);
const human={x:30,y:0,name:'修士甲',rankText:'筑基',def:{kind:'human'},hp:1,maxHp:1,anim:{},st:{}};
const monster={x:40,y:0,name:'妖兽乙',rankText:'炼气',def:{kind:'beast'},hp:1,maxHp:1,anim:{},st:{}};
Object.assign(game.hero,{realm:1,stage:0});game.life.sense={x:0,y:0,R:10000};
Object.assign(game.combat,{game,units:[human,monster],lock:null,foe:{ultCharge:()=>0,ultFlash:0},texts:[]});
const restoredTabs=[...restored.querySelectorAll('.sense-list-tabs button')];
labels.length=0;drawCombatUI(ctx,game.combat,0,.5);assert.deepEqual(labels,[],'restored opportunity filter is active before clicking a tab');
for(const [category,expected] of [['机缘',[]],['灵物',[]],['妖兽',['妖兽乙·炼气']],['修士',['修士甲·筑基']],['全部',['修士甲·筑基','妖兽乙·炼气']]]){
 restoredTabs.find(e=>e.textContent===category).click();labels.length=0;drawCombatUI(ctx,game.combat,0,.5);assert.deepEqual(labels,expected,`actual Canvas after UI tab ${category}`);assert.equal(game.combat.units.length,2);
}
restoredTabs.find(e=>e.textContent==='机缘').click();game.combat.lock=monster;labels.length=0;drawCombatUI(ctx,game.combat,0,.5);assert.deepEqual(labels,['妖兽乙·炼气'],'locked target retained across categories');
await React.act(async()=>root4.unmount());
labels.length=0;game.combat.lock=null;drawCombatUI(ctx,game.combat,0,.5);assert.deepEqual(labels,['修士甲·筑基','妖兽乙·炼气'],'unmount clears game filter');
console.log('guidance DOM: grouped selection, simultaneous inner/outer, persistent per-site arrows, depletion, cancellation and cleanup passed');
// Five real creatures selected as one group: no per-category or visibility regressions.
window.localStorage.clear();document.querySelector('.game-root').classList.remove('touch');
game.player.x=game.player.y=game.cam.x=game.cam.y=0;game.cam.zoom=.2;game.detailSenseRadius=1000;game.awarenessRadius=3000;
game.combat.enemies=Array.from({length:5},(_,i)=>({x:1400+i*50,y:100+i*10,blv:2,def:{kind:'beast'}}));
const root5=createRoot(document.getElementById('root'));await React.act(async()=>root5.render(React.createElement(SenseGuidance,{game})));step(15000);
const bigGroup=[...document.querySelectorAll('.sense-guidance-tag')].find(el=>/妖物 5道/.test(el.textContent));assert(bigGroup);assert(!bigGroup.textContent.includes('气息'));bigGroup.click();step(15020);
assert.equal(document.querySelectorAll('.sense-guidance-member').length,4,'main arrow plus four members cover five outer creatures');
game.player.x=800;game.cam.x=800;step(15040);assert.equal(document.querySelectorAll('.sense-guidance-arrived').length,5,'all five acquire individual head markers on entry');
game.combat.enemies[3].hideT=1;step(15060);assert.equal(document.querySelectorAll('.sense-guidance-arrived').length,4,'hidden member immediately loses its marker');
await React.act(async()=>root5.unmount());assert.equal(callbacks.size,0);
// Post-render sync: when game.running is true, markers stay locked to renderer.renderCam immediately after render with 0 RAF lag.
const frameListeners=new Set();
game.running=true;game.onAfterFrame=fn=>{frameListeners.add(fn);return ()=>frameListeners.delete(fn);};
game.renderer={renderCam:{x:0,y:0,zoom:.2},resetStill(){}};
game.player.x=0;game.player.y=0;game.cam.x=0;game.cam.y=0;game.cam.zoom=.2;
const root6=createRoot(document.getElementById('root'));await React.act(async()=>root6.render(React.createElement(SenseGuidance,{game})));
for(const fn of frameListeners)fn(16000);
const bTag=[...document.querySelectorAll('.sense-guidance-tag')].find(el=>/妖物/.test(el.textContent));
assert.ok(bTag);bTag.click();for(const fn of frameListeners)fn(16020);
game.player.x=920;game.cam.x=920;game.renderer.renderCam.x=920;
// A stray pre-render RAF tick while game.running=true must NOT update markers early; onAfterFrame updates them immediately post-render.
step(16030);
for(const fn of frameListeners)fn(16040);
const arrived=[...document.querySelectorAll('.sense-guidance-arrived')];
assert.ok(arrived.length>=1);
const expectedLeft=400+(game.combat.enemies[0].x-920)*0.2;
assert.ok(arrived.some(el=>Math.abs(parseFloat(el.style.left)-expectedLeft)<1e-6),`marker lefts [${arrived.map(el=>el.style.left).join(',')}] must include renderCam ${expectedLeft}`);
await React.act(async()=>root6.unmount());assert.equal(frameListeners.size,0);assert.equal(callbacks.size,0);
