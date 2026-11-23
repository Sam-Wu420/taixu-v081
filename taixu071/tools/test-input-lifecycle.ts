import './env';
import assert from 'node:assert/strict';
class Target {
  listeners = new Map<string, Set<(e:any)=>void>>();
  addEventListener(type:string, fn:(e:any)=>void) { if (!this.listeners.has(type)) this.listeners.set(type,new Set()); this.listeners.get(type)!.add(fn); }
  removeEventListener(type:string, fn:(e:any)=>void) { this.listeners.get(type)?.delete(fn); }
  fire(type:string, e:any={}) { for (const fn of this.listeners.get(type) ?? []) fn(e); }
  setPointerCapture() {}
  getBoundingClientRect() { return {left:0,top:0,width:800,height:600}; }
}
const win:any=new Target();win.matchMedia=()=>({matches:false});win.innerWidth=800;win.innerHeight=600;win.devicePixelRatio=1;
(globalThis as any).window=win;(globalThis as any).localStorage={getItem:()=>null,setItem(){}};
const {Game}=await import('../src/world/game');const {audio}=await import('../src/world/audio');(audio as any).unlock=()=>{};
const canvas:any=new Target();let destinations=0,casts=0,dodges=0,zooms=0;
const game:any=Object.create(Game.prototype);
Object.assign(game,{canvas,input:{keys:new Set(),run:false,joy:{x:0,y:0},joyMag:0,mouse:{x:0,y:0,t:0,active:false}},cam:{zoom:1,targetZoom:1,x:0,y:0},player:{x:0,y:0},hero:{dead:false},modal:null,inCave:false,paused:false,time:0,runDown:-99,mijing:{active:false},combat:{enemies:[],inCombat:false,castSlot:()=>casts++,dodge:()=>dodges++},npcs:{talkTargetAt:()=>null},nodes:{nearest:()=>null},updateUI:()=>{},setZoom:()=>zooms++,setDestination:()=>destinations++});
Object.defineProperty(game,'baseSenseRadius',{value:1000,configurable:true});
game.bindInput();
const pt=(id:number,x=100,button=0)=>({pointerId:id,clientX:x,clientY:100,pointerType:'touch',button});
canvas.fire('pointerdown',pt(1));canvas.fire('pointercancel',pt(1));canvas.fire('pointerup',pt(1));assert.equal(destinations,0);assert.equal(casts,0);assert.equal(dodges,0);
canvas.fire('pointerdown',pt(1));canvas.fire('lostpointercapture',pt(1));canvas.fire('pointerup',pt(1));assert.equal(destinations,0);
canvas.fire('pointerdown',pt(1));canvas.fire('pointerdown',pt(2,200));canvas.fire('pointermove',pt(2,220));canvas.fire('pointerup',pt(2,220));canvas.fire('pointerup',pt(1));assert.ok(zooms>0);assert.equal(destinations,0);
canvas.fire('pointerdown',pt(1));canvas.fire('pointerup',pt(1));assert.equal(destinations,1);
canvas.fire('pointerdown',pt(1));game.input.keys.add('w');game.input.joy.x=1;game.input.joyMag=1;game.input.mouse.active=true;win.fire('blur');canvas.fire('pointerup',pt(1));assert.equal(destinations,1);assert.equal(game.input.keys.size,0);assert.equal(game.input.joy.x,0);assert.equal(game.input.joyMag,0);assert.equal(game.input.mouse.active,false);
game.input.keys.add('shift');game.input.run=true;game.runDown=0;game.time=1;win.fire('blur');assert.equal(game.input.run,false);
game.input.keys.add('shift');game.input.run=true;game.runDown=1;game.time=1.1;win.fire('blur');assert.equal(game.input.run,true);
// 远景触摸实际事件路径：可见单位扩大屏幕命中半径，隐身单位不能被盲点锁定。
Object.defineProperty(game,'senseRadius',{value:1000,configurable:true});game.cam.zoom=.02;game.screenToWorld=()=>({x:100,y:70});
const enemy:any={x:100,y:100,dead:false,def:{},hideT:0};game.combat.enemies=[enemy];game.combat.lock=null;
canvas.fire('pointerdown',pt(3));canvas.fire('pointerup',pt(3));assert.equal(game.combat.lock,enemy);assert.equal(game.combat.manual,true);
game.combat.lock=null;enemy.hideT=1;canvas.fire('pointerdown',pt(4));canvas.fire('pointerup',pt(4));assert.equal(game.combat.lock,null);
// 两个重叠目标的触屏实际路径：连续点选轮换；隐匿目标不参与轮换。
const e2:any={x:100,y:100,dead:false,def:{},hideT:0};enemy.hideT=0;game.combat.enemies=[enemy,e2];game.combat.lock=null;
const tap=(time:number)=>{const e={...pt(9),timeStamp:time};canvas.fire('pointerdown',e);canvas.fire('pointerup',e)};
tap(1000);assert.equal(game.combat.lock,enemy);tap(1100);assert.equal(game.combat.lock,e2);tap(1200);assert.equal(game.combat.lock,enemy);e2.hideT=1;tap(1300);assert.equal(game.combat.lock,enemy);
// 远处盲点不能以点击为理由生成未知的采集格子。
let nodeQueries=0;game.nodes.nearest=()=>{nodeQueries++;return null};game.combat.enemies=[];game.screenToWorld=()=>({x:10000,y:0});
canvas.fire('pointerdown',pt(5));canvas.fire('pointerup',pt(5));assert.equal(nodeQueries,0);
game.screenToWorld=()=>({x:100,y:0});canvas.fire('pointerdown',pt(6));canvas.fire('pointerup',pt(6));assert.equal(nodeQueries,1);
game.input.joyMag=1;game.unbind();assert.equal(game.input.joyMag,0);for(const set of win.listeners.values())assert.equal(set.size,0);for(const set of canvas.listeners.values())assert.equal(set.size,0);
console.log('input lifecycle: cancellation, capture loss, pinch, ordinary click, blur, held run and listener cleanup passed');
