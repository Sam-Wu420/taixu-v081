import './env';import assert from 'node:assert/strict';import {SegmentIndex} from '../src/world/segmentIndex';
let seed=1729;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
const rows:number[]=[];
for(let i=0;i<6000;i++){const x=(rnd()-.5)*300000,y=(rnd()-.5)*300000;rows.push(x,y,x+(rnd()-.5)*4000,y+(rnd()-.5)*4000,20+rnd()*200,i,0,0)}
rows.push(-1e7,-1e7,1e7,1e7,80,6000,0,0); // 超长线段保守查询
const data=new Float32Array(rows),idx=new SegmentIndex(data,820);assert.equal(idx.candidates(0,0,100,100),null);
let ticks=0;idx.step(64,1,()=>ticks++);assert.equal(idx.ready,false);assert.equal(idx.candidates(0,0,100,100),null);
while(!idx.ready)idx.step(64,100,()=>0);
assert.equal(idx.candidates(-1e9,-1e9,1e9,1e9),null);assert.equal(idx.candidates(1e30,1e30,1e30,1e30),null);
const localized=idx.candidates(-2000,-2000,2000,2000)!;assert.ok(localized.length < data.length/8/4); // 局部视野候选显著少于全表
const intersects=(q:number,x0:number,y0:number,x1:number,y1:number)=>{const m=data[q+4]+820;return Math.max(data[q],data[q+2])>=x0-m&&Math.min(data[q],data[q+2])<=x1+m&&Math.max(data[q+1],data[q+3])>=y0-m&&Math.min(data[q+1],data[q+3])<=y1+m};
for(let run=0;run<300;run++){
 const x=(rnd()-.5)*280000,y=(rnd()-.5)*280000,w=100+rnd()*10000,h=100+rnd()*10000;
 const result=idx.candidates(x-w,y-h,x+w,y+h);assert.ok(result);const matches=result.filter(q=>intersects(q,x-w,y-h,x+w,y+h));const brute:number[]=[];
 for(let q=0;q<data.length;q+=8)if(intersects(q,x-w,y-h,x+w,y+h))brute.push(q);
 assert.deepEqual(matches,brute);assert.deepEqual(matches.slice(0,256),brute.slice(0,256));
}
// 地表真实收集流程：相同数据有/无索引输出逐项一致，包含超过 GPU 单块 256 段的完整来源顺序。
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const {Renderer}=await import('../src/world/render');const {MAX_SEG,MAX_TOWN,MAX_ZONE}=await import('../src/gl/ground');
const dense=new Float32Array(Array.from({length:400},(_,i)=>[i,0,i+5,1,40,i,0,0]).flat());
const terrain:any={rivSegW:dense,roadSegW:data,fieldR:()=>[0,100]};
const r:any=Object.create(Renderer.prototype);Object.assign(r,{game:{terrain},gSeg:new Float32Array(MAX_SEG*16),gSegBuf:new Float32Array(MAX_SEG*16),gRivOff:[],gRoadOff:[],gTownTmp:[],gZoneTmp:[],gTown:new Float32Array(MAX_TOWN*4),gTownS:new Int32Array(MAX_TOWN*4),gZone:new Float32Array(MAX_ZONE*4),riverIndex:null,roadIndex:null});
const before=r.groundSegs(0,0,3000,3000);r.advanceSegmentIndices(terrain);while(!r.riverIndex.ready||!r.roadIndex.ready){r.riverIndex.step(1000,Infinity,()=>0);r.roadIndex.step(1000,Infinity,()=>0)}
const after=r.groundSegs(0,0,3000,3000);assert.equal(before.nRiv,400);assert.equal(before.stride,400);assert.equal(before.sourceTruncated,false);assert.deepEqual(after,before);
const old=r.riverIndex;terrain.rivSegW=new Float32Array(0);r.advanceSegmentIndices(terrain);assert.notEqual(r.riverIndex,old);assert.equal(r.riverIndex.ready,true);
console.log('segment index: incremental bounds, overflow, broad fallback, 300 randomized exact comparisons and renderer parity passed');
// 真正执行 Ground.drawAbs 的分块和上传控制流（模拟 GL，不代表真实 GPU 画质）。
const {Ground}=await import('../src/gl/ground');const uploads:Float32Array[]=[],counts:number[]=[];
const gl:any=new Proxy({pixelStorei(){},texSubImage2D(...args:any[]){uploads.push(new Float32Array(args[8]))},uniform1i(name:any,value:number){if(name==='uNRiv'||name==='uNRoad')counts.push(value)}},{get:(o:any,k:any)=>k in o?o[k]:(()=>{})});
const ground:any=Object.create(Ground.prototype);Object.assign(ground,{gl,prog:{p:{},u:(s:string)=>s},T:{W:100,H:100,scale:1},tileSeg:new Float32Array(MAX_SEG*16*96),segUploads:0,tilesThisFrame:0,texelsThisFrame:0,sourceTruncations:0,tileTruncations:0,matOk:false,matAvg:new Float32Array(45)});
const spread=new Float32Array(Array.from({length:400},(_,i)=>{const v=i<200?1000:9000;return [v,v,v+5,v+5,10,i,0,0]}).flat());
terrain.rivSegW=spread;terrain.roadSegW=new Float32Array(0);r.riverIndex=null;r.roadIndex=null;
const wide=r.groundSegs(5000,5000,6000,6000);assert.equal(wide.nRiv,400);assert.equal(wide.stride,400);
ground.drawAbs({fb:{},W:1000,H:1000},.1,0,wide,5000,5000,0,0,1000,1000,{});
assert.ok(counts.length>0);assert.ok(counts.every(n=>n<=MAX_SEG));assert.ok(uploads.some(a=>a.includes(399)));assert.ok(ground.tilesThisFrame>1);
// 超过来源上限必须显式标记并限制内存。
terrain.rivSegW=new Float32Array(Array.from({length:8200},(_,i)=>[0,0,1,1,2,i,0,0]).flat());const capped=r.groundSegs(0,0,10,10);assert.equal(capped.nRiv,8192);assert.equal(capped.sourceTruncated,true);
console.log('ground segments: >256 source preserved through real tile packing, GL calls simulated; bounded dense fallback passed');

ground.drawAbs({fb:{},W:1000,H:1000},1,0,capped,0,0,0,0,32,32,{});assert.ok(ground.sourceTruncations>0);assert.ok(ground.tileTruncations>0);assert.ok(counts.every(n=>n<=MAX_SEG));
console.log('ground dense overflow: truncation counted and upload bounded');
// 子块复用父候选与逐段全扫逐项一致（含线段跨界、重复、负坐标及半宽）；顺序不可改变。
const {groundTileCandidates}=await import('../src/gl/ground');const stride=data.length/8, packed=new Float32Array(stride*16),row=stride*4;
for(let i=0;i<stride;i++){const q=i*8,o=i*4;packed.set(data.subarray(q,q+4),o);packed[o+row]=data[q+4];packed[o+row+1]=i;packed.set(data.subarray(q,q+4),row*2+o);packed[row*3+o]=data[q+4];}
for(let i=0;i<300;i++){
 const x=(rnd()-.5)*200000,y=(rnd()-.5)*200000,w=2000+rnd()*20000,h=2000+rnd()*20000,pad=i%2?210:820,rw=i%2?2:0;
 const parent=groundTileCandidates(packed,stride,rw,stride,pad,x-w,x+w,y-h,y+h);
 const left=x-w+rnd()*w, right=x+rnd()*w, top=y-h+rnd()*h,bottom=y+rnd()*h;
 const sub=groundTileCandidates(packed,stride,rw,stride,pad,left,right,top,bottom,parent);
 const brute=groundTileCandidates(packed,stride,rw,stride,pad,left,right,top,bottom);
 assert.deepEqual(sub,brute);
}
console.log('ground hierarchical candidates: 300 child vs full-scan comparisons, both segment rows passed');
