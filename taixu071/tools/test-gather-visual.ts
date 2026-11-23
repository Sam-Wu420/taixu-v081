import './env';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { collectGatherVisuals,drawGatherVisual,gatherBeamTier,gatherDetailWeight,gatherBeamScale,GATHER_BEAM_COLORS } from '../src/world/gatherVisual';
import type { GatherNode } from '../src/world/nodes';
const nodes:GatherNode[]=[
 {key:'h',kind:'herb',item:'herb_huangjing',x:0,y:0,rare:false,seed:1},
 {key:'r',kind:'herb',item:'herb_jiuqu',x:400,y:100,rare:true,seed:2},
 {key:'ore',kind:'ore',item:'mat_xuanyu',x:500,y:0,rare:false,seed:3},
 {key:'outside',kind:'spring',item:'mat_lingquan',x:3000,y:0,rare:false,seed:4},
 {key:'depleted',kind:'herb',item:'herb_xuelian',x:300,y:0,rare:true,seed:5},
];
assert.equal(gatherBeamTier(nodes[0]),0);assert.equal(gatherBeamTier(nodes[1]),5);assert.equal(gatherBeamTier(nodes[2]),1);assert.equal(new Set(GATHER_BEAM_COLORS).size,6);
for(const x of [8,9,10,11,12,13,14,15,16]){assert.ok(gatherDetailWeight(x)>=0&&gatherDetailWeight(x)<=1);if(x>8)assert.ok(gatherDetailWeight(x)>=gatherDetailWeight(x-1));}
assert.equal(gatherDetailWeight(8),0);assert.equal(gatherDetailWeight(16),1);assert.equal(gatherBeamScale(.01),12);
function picture(n:GatherNode,z:number){const cv=createCanvas(400,320),g=cv.getContext('2d') as any;g.translate(200,220);g.scale(z,z);drawGatherVisual(g,{...n,x:0,y:0},0,1,false,z,z);const rgba=g.getImageData(0,0,400,320).data;let pixels=0,sum=0;for(let i=3;i<rgba.length;i+=4)if(rgba[i]){pixels++;sum+=rgba[i];}return {pixels,sum};}
for(const z of [.02,.05,.1,.18,.2199,.2201,.24,.3,.5,1]){const h=picture(nodes[0],z),r=picture(nodes[1],z);assert.ok(h.pixels>0&&r.pixels>0,`both levels remain visible at ${z}`);}
const before=picture(nodes[0],.2199),after=picture(nodes[0],.2201);assert.ok(Math.abs(before.sum-after.sum)/Math.max(before.sum,after.sum)<.05,'no 0.22 hard disappearance');
const remembered:string[]=[],bounds:number[][]=[];
const field={inRect:(...args:number[])=>{bounds.push(args);return nodes;},available:(n:GatherNode)=>n.key!=='depleted',rememberVisible:(n:GatherNode)=>remembered.push(n.key)};
for(const z of [.05,.2199,.2201,.5,1]){
 const out:any[]=[];const view={left:-1000,top:-1000,right:1000,bottom:1000};collectGatherVisuals(out,field,{x:0,y:0,radius:1000,day:1,view,time:0,zoom:z,deviceScale:z,target:null});
 assert.equal(out.length,3,`only available inner-circle nodes at ${z}`);const g=createCanvas(200,200).getContext('2d') as any;g.translate(100,100);g.scale(z,z);for(const d of out)d.draw(g);
}
assert.ok(!remembered.includes('outside')&&!remembered.includes('depleted'));assert.ok(bounds.every(b=>b[0]>=-1000&&b[2]<=1000));
const out:any[]=[];collectGatherVisuals(out,field,{x:0,y:0,radius:1000,day:1,view:{left:10000,top:10000,right:11000,bottom:11000},time:0,zoom:.5,deviceScale:.5,target:null});assert.equal(out.length,0);
console.log('gather visual: continuous zoom, tier colors, inner-circle/depletion/discovery boundaries, bounded query and actual Canvas beams passed');
const {collectCombat}=await import('../src/world/combatfx');
const combat:any={units:[],summons:[],loot:[{x:0,y:0,id:'herb_jiuqu',n:1,t:2},{x:2500,y:0,id:'mat_yaodan10',n:1,t:2}],acts:{collect(){}},ghosts:[],game:{cam:{zoom:.1},life:{sense:{x:0,y:0,R:1000}},senseBurstT:0}};
const lootQueue:any[]=[];collectCombat(combat,lootQueue,{left:-3000,top:-3000,right:3000,bottom:3000},1,.016);assert.equal(lootQueue.length,1,'loot outside detail sense is never revealed');
const lootCanvas=createCanvas(300,300),lootCtx=lootCanvas.getContext('2d') as any;lootCtx.translate(150,230);lootCtx.scale(.1,.1);let beamImages=0;
const tracked=new Proxy(lootCtx,{get(target,p){const v=target[p];if(p==='drawImage')return (...args:any[])=>{beamImages++;return v.apply(target,args);};return typeof v==='function'?v.bind(target):v;},set(target,p,v){target[p]=v;return true;}});
lootQueue[0].draw(tracked);assert.equal(beamImages,1,'real loot render uses cached tier beam');
console.log('combat loot: actual draw uses grade beam only for perceptible drops');
