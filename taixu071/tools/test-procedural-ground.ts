import assert from 'node:assert/strict';
import './env';
import { performance } from 'node:perf_hooks';
const G = await import('../src/gl/groundTex');
// 可预测时钟验证预算、上限、至少一行与完成后立即结束。
let tick=0,rows=0;const unfinished={step:(n:number)=>{rows+=n;tick+=0.6;return false}};
assert.equal(G.runGroundSlice(unfinished,()=>tick,2),false);assert.equal(rows,4);
rows=0;assert.equal(G.runGroundSlice({step:()=>{rows++;return false}},()=>0,2),false);assert.equal(rows,8);
rows=0;assert.equal(G.runGroundSlice({step:()=>{rows++;return true}},()=>0,2),true);assert.equal(rows,1);
assert.equal(G.GROUND_LAYERS,15); assert.equal(G.groundTile(-1),null); assert.equal(G.groundTile(1.2),null); assert.equal(G.groundTile(15),null);
const queue: (() => void)[] = [];
(globalThis as any).requestAnimationFrame = (f: () => void) => { queue.push(f); return queue.length; };
// 地表画材尚未生成且秘境刚进入时，真实绘制路径应立即给出可见的色块回退。
const { MijingSys, REALM_OX, REALM_OY, trimMijingChunks } = await import('../src/world/mijing');
const mj:any = new MijingSys({} as any); const floor:any={gw:16,gh:16,cells:new Uint8Array(256).fill(1),chunks:new Map()};
mj.cur={spec:{theme:'cave'},t:0,fi:0,floors:[floor]};const first=mj.chunk(floor,0,0);assert.ok(first);assert.equal(mj.floorPending.has(floor),true);assert.equal(floor.chunks.get(0),first);
const other:any={gw:16,gh:16,cells:new Uint8Array(256).fill(1),chunks:new Map()};mj.cur.floors.push(other);mj.cur.fi=1;const otherFirst=mj.chunk(other,0,0);assert.ok(otherFirst);assert.ok(mj.floorPending.has(other));mj.cur.fi=0;
// 缓存淘汰保持可见块；视野超过预算时允许暂时超额。
const marker:any={marker:true};floor.chunks.set(99,marker);assert.equal(mj.chunk(floor,0,0),first);assert.deepEqual([...floor.chunks.keys()],[99,0]);floor.chunks.delete(99);
const cached=new Map<number,any>([[1,{}],[2,{}],[3,{}],[4,{}]]);trimMijingChunks(cached,new Set([1,4]),2);assert.deepEqual([...cached.keys()],[1,4]);trimMijingChunks(cached,new Set([1,4]),1);assert.equal(cached.size,2);
G.loadGroundTex(); G.loadGroundTex(); assert.equal(queue.length,1); assert.equal(G.groundImages(),null);
// 第三张画材创建失败后重试：前两张画布保持身份，不重新计算或替换。
const {setCanvasFactory}=await import('../src/core/canvas');const {createCanvas}=await import('./env');let creations=0;
setCanvasFactory((w,h)=>{if(++creations===3)throw Error('simulated canvas failure');return createCanvas(w,h) as any});
const oldWarn=console.warn;console.warn=()=>{};try {while(queue.length) queue.shift()!()} finally {console.warn=oldWarn}
const saved0=G.groundTile(0),saved1=G.groundTile(1);assert.ok(saved0&&saved1);assert.equal(G.groundTile(2),null);assert.equal(G.groundImages(),null);
setCanvasFactory((w,h)=>createCanvas(w,h) as any);G.loadGroundTex();
let slices=0, max=0; const t0=performance.now();
while(queue.length) { const fn=queue.shift()!; const start=performance.now(); fn(); max=Math.max(max,performance.now()-start); slices++; assert.ok(slices <= 15*256); }
assert.ok(slices >= 13*32 && slices <= 13*256); assert.equal(G.groundImages()?.length,15);assert.equal(G.groundTile(0),saved0);assert.equal(G.groundTile(1),saved1);
const signatures = new Set<string>();
for (let i=0;i<G.GROUND_LAYERS;i++) {
 const tile=G.groundTile(i)!;
 assert.equal(tile.width,G.GROUND_TEX_SIZE); assert.equal(tile.height,G.GROUND_TEX_SIZE); assert.equal(G.groundTile(i),tile); assert.equal(G.groundImages()![i],tile);
 const data=tile.getContext('2d')!.getImageData(0,0,tile.width,tile.height).data; let min=255,maxPixel=0, sum=[0,0,0], edge=0;
 for(let y=0;y<tile.height;y++) for(let x=0;x<tile.width;x++) { const j=(y*tile.width+x)*4; assert.equal(data[j+3],255); min=Math.min(min,data[j]);maxPixel=Math.max(maxPixel,data[j]); for(let c=0;c<3;c++)sum[c]+=data[j+c]; }
 for(let y=0;y<tile.height;y++) { const p=y*tile.width*4; edge+=Math.abs(data[p]-data[p+(tile.width-1)*4]); }
 assert.ok(maxPixel-min>=10,`layer ${i} has no texture`); assert.ok(edge/tile.height < 6,`layer ${i} seam too harsh`);
 for(let c=0;c<3;c++) assert.ok(Math.abs(G.GROUND_AVG[i][c]-sum[c]/(tile.width*tile.height*255))<1e-8);
 signatures.add(`${sum[0]},${sum[1]},${sum[2]}`);
}
assert.equal(signatures.size,15);
// 经真实 Ground.uploadMat 控制流检查纹理层顺序和平均值；这是 WebGL 调用模拟，不是 GPU 渲染验证。
const { Ground } = await import('../src/gl/ground');
const uploaded: any[] = []; let storage: any[] = [];
const gl: any = { TEXTURE_2D_ARRAY:1, RGBA8:2, RGBA:3, UNSIGNED_BYTE:4, UNPACK_FLIP_Y_WEBGL:5, UNPACK_PREMULTIPLY_ALPHA_WEBGL:6,
 TEXTURE_MIN_FILTER:7, TEXTURE_MAG_FILTER:8, TEXTURE_WRAP_S:9, TEXTURE_WRAP_T:10, LINEAR_MIPMAP_LINEAR:11, LINEAR:12, REPEAT:13,
 createTexture:()=>({}), bindTexture(){}, texStorage3D:(...a:any[])=>storage=a, pixelStorei(){}, texSubImage3D:(...a:any[])=>uploaded.push(a), generateMipmap(){}, texParameteri(){}, getExtension:()=>null, deleteTexture(){}, deleteFramebuffer(){} };
const ground:any=Object.create(Ground.prototype); ground.gl=gl; ground.mat={}; ground.front=null; ground.back=null; ground.matUpload=null; ground.matRetryFrames=0;
for(let i=0;i<15;i++){ ground.uploadMat(); assert.equal(uploaded.length,i+1); if(i<14) assert.notEqual(ground.matOn,true); }
assert.equal(storage[3],G.GROUND_TEX_SIZE); assert.equal(storage[5],15); assert.equal(uploaded.length,15);
for(let i=0;i<15;i++) { assert.equal(uploaded[i][4],i); assert.equal(uploaded[i][10],G.groundTile(i)); }
assert.equal(ground.matOk,true); assert.equal(ground.matOn,true); assert.ok(Math.abs(ground.matAvg[0]-G.GROUND_AVG[0][0])<1e-6);
// 中途上传失败：释放半成品但保留旧材质和缓存，冷却后从第一层重试。
const deleted:any[]=[];const old={old:true};let throwAt=3, attempt=0, invalidations=0;
const failed:any=Object.create(Ground.prototype);Object.assign(failed,{gl:{...gl,createTexture:()=>({new:true}),deleteTexture:(x:any)=>deleted.push(x),texSubImage3D:()=>{if(attempt++===throwAt)throw Error('simulated upload failure')}},mat:old,matUpload:null,matRetryFrames:0,matOn:false,matOk:false,invalidate:()=>invalidations++});
const warn=console.warn;console.warn=()=>{};try{for(let i=0;i<4;i++)failed.uploadMat()}finally{console.warn=warn}
assert.deepEqual(deleted,[{new:true}]);assert.equal(failed.mat,old);assert.equal(failed.matOn,false);assert.equal(invalidations,0);assert.equal(failed.matRetryFrames,120);
throwAt=-1;for(let i=0;i<120;i++)failed.uploadMat();assert.equal(failed.matUpload,null);for(let i=0;i<15;i++)failed.uploadMat();assert.equal(failed.matOn,true);assert.equal(invalidations,1);assert.equal(deleted[1],old);
// 秘境原画材不可用时可用相同的程序画材（秘境入口仍由原有开关控制）。
const c=G.groundTile(7)!.getContext('2d')!; assert.notEqual(typeof mj.floorPattern(c),'string');
const out=(await import('./env')).createCanvas(100,100).getContext('2d')!;mj.drawFloor(out as any,{left:REALM_OX,top:REALM_OY,right:REALM_OX+100,bottom:REALM_OY+100});assert.equal(mj.floorPending.has(floor),false);assert.ok(floor.chunks.get(0));assert.notEqual(floor.chunks.get(0),first);mj.cur.fi=1;mj.drawFloor(out as any,{left:REALM_OX,top:REALM_OY,right:REALM_OX+100,bottom:REALM_OY+100});assert.equal(mj.floorPending.has(other),false);assert.notEqual(other.chunks.get(0),otherFirst);

console.log(`procedural ground: 15 cached, distinct, seamless layers; ${slices} slices, total ${(performance.now()-t0).toFixed(0)}ms, longest ${max.toFixed(1)}ms on test host`);
// 宏观地形双纹理切换：中途失败保留旧资源，释放新资源；成功才替换并失效底图。
const trans:any=Object.create(Ground.prototype);const oldA={id:'oldA'},oldB={id:'oldB'},oldT={old:true},newT={W:2,H:2,a:new Float32Array(16),b:new Float32Array(16)};let created:any[]=[],deletedT:any[]=[],fail='second',inv=0;
trans.gl={TEXTURE_2D:1,RGBA16F:2,RGBA:3,FLOAT:4,TEXTURE_MIN_FILTER:5,TEXTURE_MAG_FILTER:6,LINEAR:7,TEXTURE_WRAP_S:8,TEXTURE_WRAP_T:9,CLAMP_TO_EDGE:10,createTexture(){const t={id:created.length};created.push(t);return t},bindTexture(){},texImage2D(){if(fail==='second'&&created.length===2)throw Error('upload')},texParameteri(){},deleteTexture:(t:any)=>deletedT.push(t)};Object.assign(trans,{T:oldT,ta:oldA,tb:oldB,invalidate:()=>inv++});
assert.throws(()=>trans.setTerrain(newT));assert.equal(trans.T,oldT);assert.equal(trans.ta,oldA);assert.equal(trans.tb,oldB);assert.deepEqual(deletedT,created);assert.equal(inv,0);assert.equal(trans.ready,true);
fail='none';created=[];deletedT=[];trans.setTerrain(newT);assert.equal(trans.T,newT);assert.equal(trans.ta,created[0]);assert.equal(trans.tb,created[1]);assert.deepEqual(deletedT,[oldA,oldB]);assert.equal(inv,1);trans.setTerrain(newT);assert.equal(created.length,2);
trans.tb=null;assert.equal(trans.ready,false);
console.log('terrain texture replacement: rollback, cleanup, commit and readiness passed (mock GL)');
