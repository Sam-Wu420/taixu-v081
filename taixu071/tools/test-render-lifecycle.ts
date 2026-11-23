import './env';import assert from 'node:assert/strict';import {createCanvas} from './env';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const {Renderer}=await import('../src/world/render');const {GLStage}=await import('../src/gl/stage');
const renderer:any=Object.create(Renderer.prototype);
// 桶内非常接近的 y 也必须按真实 y 排序；同 y 保持原顺序。
for(let run=0;run<15;run++){
 let seed=run+1;const rnd=()=>{seed=Math.imul(seed,1664525)+1013904223|0;return (seed>>>0)/4294967296};
 const list=Array.from({length:500},(_,i)=>({y:i%11===0?4:Math.round(rnd()*10000)/10000,i}));const expected=[...list].sort((a,b)=>a.y-b.y);renderer.sortByY(list);assert.deepEqual(list,expected);
}
const specific=Array.from({length:100},(_,i)=>({y:i===0?0:i===99?100:10+(99-i)*1e-6,i}));const expected=[...specific].sort((a,b)=>a.y-b.y);renderer.sortByY(specific);assert.deepEqual(specific,expected);
// 用真实离屏/可见画布验证回退呈现，不依赖 GPU。
const off=createCanvas(40,30),display=createCanvas(80,60),og:any=off.getContext('2d'),vg:any=display.getContext('2d');og.fillStyle='#ff0000';og.fillRect(0,0,40,30);let draws=0;
renderer.canvas=off;renderer.domCanvas=display;renderer.uiCtx=vg;renderer.stage={lost:true};renderer.renderFrame=()=>{draws++};renderer.render(1/60);assert.equal(draws,1);assert.deepEqual([...vg.getImageData(40,30,1,1).data],[255,0,0,255]);
vg.clearRect(0,0,80,60);renderer.stage.lost=false;renderer.render(1/60);assert.equal(vg.getImageData(40,30,1,1).data[3],0);
// 模拟上下文恢复调用，检查状态、旧查询和强制重传标志；不模拟 GPU 驱动。
const stage:any=Object.create(GLStage.prototype);stage.gl={getExtension:()=>null};stage.canvas={width:200,height:100};stage.W=200;stage.H=100;stage.lost=true;stage.sceneUp=true;stage.atmoUp=true;stage.sceneW=200;stage.sceneH=100;stage.atmoW=10;stage.atmoH=10;stage.groundLoTex=true;stage.sceneMipDirty=true;stage.tq={ext:{},pend:[[{}]],cur:[],tried:true};let init=0,resized=0,notified=0;stage.init=()=>{init++};stage.resize=(w:number,h:number)=>{assert.equal(w,200);assert.equal(h,100);assert.equal(stage.lost,false);resized++};stage.onContextChange=()=>notified++;stage.restoreContext();assert.equal(init,1);assert.equal(resized,1);assert.equal(notified,1);assert.equal(stage.sceneUp,false);assert.equal(stage.atmoUp,false);assert.equal(stage.groundLoTex,false);assert.equal(stage.sceneW,0);assert.equal(stage.tq.tried,false);assert.equal(stage.tq.pend.length,0);
const warn=console.warn;console.warn=()=>{};stage.lost=true;stage.init=()=>{throw Error('restore failed')};try{stage.restoreContext()}finally{console.warn=warn}assert.equal(stage.lost,true);assert.equal(notified,2);
const lost:any=Object.create(GLStage.prototype);lost.gl={};lost.canvas={width:1,height:1};lost.lost=true;lost.resize(300,150);assert.equal(lost.W,300);assert.equal(lost.H,150);assert.equal(lost.canvas.width,300);
console.log('render lifecycle: exact stable y sorting, Canvas2D presentation, restore state/failure and lost resize passed (mock GL)');
// 氛围层版本号与尺寸决定是否上传；无版本号保留旧调用方逐帧上传。
const aStage:any=Object.create(GLStage.prototype);aStage.atmoTex={};aStage.atmoUp=false;aStage.atmoW=0;aStage.atmoH=0;aStage.atmoCanvas=null;aStage.atmoRevision=undefined;let uploads=0;
aStage.upload=(_tex:any,cv:any)=>{uploads++;aStage.atmoUp=true;aStage.atmoW=cv.width;aStage.atmoH=cv.height};
const a:any={canvas:{width:100,height:50},revision:1,x:0,y:0,w:100,h:50};
aStage.uploadAtmosphere(a);aStage.uploadAtmosphere(a);assert.equal(uploads,1);a.x=5;aStage.uploadAtmosphere(a);assert.equal(uploads,1);a.revision++;aStage.uploadAtmosphere(a);assert.equal(uploads,2);a.canvas.width=101;aStage.uploadAtmosphere(a);assert.equal(uploads,3);a.canvas={width:101,height:50};aStage.uploadAtmosphere(a);assert.equal(uploads,4);aStage.atmoUp=false;aStage.uploadAtmosphere(a);assert.equal(uploads,5);delete a.revision;aStage.uploadAtmosphere(a);aStage.uploadAtmosphere(a);assert.equal(uploads,7);
// 相同尺寸重新配置不擦除画布；尺寸发生变化时下一帧不能跳画。
const r:any=Object.create(Renderer.prototype);const scene:any={width:800,height:600};const dom:any={width:800,height:600,clientWidth:800,clientHeight:600};const atmosphere:any={width:202,height:152};let requests=0;
Object.assign(r,{game:{requestFrame(){requests++}},canvas:scene,domCanvas:dom,stage:{resize(){},bloomOn:true},atmo:atmosphere,W:800,H:600,maxDpr:1,worldDprCap:0,pxBudget:4e6,lowered:0,stillFrames:8,stillCam:{x:1,y:2},atmoReady:true,atmoRevision:5});
r.resize();assert.equal(r.atmoReady,true);assert.equal(r.atmoRevision,5);assert.equal(r.stillFrames,8);dom.clientWidth=900;r.resize();assert.equal(r.atmoReady,false);assert.equal(r.atmoRevision,6);assert.equal(r.stillFrames,0);assert.ok(Number.isNaN(r.stillCam.x));assert.equal(requests,2);
console.log('atmosphere uploads: revision/identity/size/invalidation and resize tests passed (mock GL)');
// 分别统计世界和氛围画布的理论上传字节，不把其他 GPU 流量算入。
const meters:any=Object.create(GLStage.prototype);let image=0,sub=0;
meters.gl={TEXTURE_2D:1,UNPACK_PREMULTIPLY_ALPHA_WEBGL:2,RGBA:3,UNSIGNED_BYTE:4,bindTexture(){},pixelStorei(){},texImage2D(){image++},texSubImage2D(){sub++}};Object.assign(meters,{sceneW:0,sceneH:0,atmoW:0,atmoH:0,uploadMB:0,atmoUploadMB:0});
meters.upload({}, {width:1024,height:512},true,true);meters.upload({}, {width:256,height:128},true,false);assert.equal(meters.uploadMB,2);assert.equal(meters.atmoUploadMB,0.125);meters.upload({}, {width:256,height:128},true,false);assert.equal(image,2);assert.equal(sub,1);
console.log('render upload meters: scene and atmosphere nominal bytes, image/subimage paths passed (mock GL)');
// 关闭 GPU 计时时释放尚未完成的查询，并清除旧统计（不等待驱动查询结果）。
const timer:any=Object.create(GLStage.prototype);const deleted:any[]=[];Object.assign(timer,{gpuTiming:false,gl:{deleteQuery:(q:any)=>deleted.push(q)},tq:{ext:{},pend:[[{q:1,k:'a'},{q:2,k:'b'}],[{q:3,k:'c'}]],cur:null,tried:true},gpuMs:4,gpuSec:{a:2},gpuHasResults:true});assert.equal(timer.gpuBegin(),false);assert.deepEqual(deleted,[1,2,3]);assert.equal(timer.tq.pend.length,0);assert.equal(timer.gpuMs,0);assert.deepEqual(timer.gpuSec,{});timer.gpuBegin();assert.equal(deleted.length,3);
console.log('GPU timing cleanup after profiler disable passed (mock GL)');
// 泛光第三级按画质分配/释放；同尺寸重配不能反复创建资源。
const bloom:any=Object.create(GLStage.prototype);const alloc:any[]=[],free:any[]=[];Object.assign(bloom,{canvas:{width:1,height:1},gl:{},lost:false,W:0,H:0,fx:null,h1:null,q1:null,q2:null,e1:null,e2:null,bloomLevels:2});bloom.target=(w:number,h:number)=>{const t={w,h,id:alloc.length};alloc.push(t);return t};bloom.free=(t:any)=>{if(t)free.push(t)};
bloom.resize(801,601);assert.equal(alloc.length,4);assert.equal(bloom.e1,null);assert.equal(bloom.e2,null);bloom.resize(801,601);assert.equal(alloc.length,4);
bloom.bloomLevels=3;bloom.resize(801,601);assert.equal(alloc.length,6);assert.equal(bloom.e1.w,101);assert.equal(bloom.e1.h,76);const e1=bloom.e1,e2=bloom.e2;
bloom.bloomLevels=2;bloom.resize(801,601);assert.equal(bloom.e1,null);assert.equal(bloom.e2,null);assert.ok(free.includes(e1)&&free.includes(e2));bloom.resize(803,603);assert.equal(alloc.length,10);assert.equal(bloom.fx.w,803);assert.equal(bloom.e1,null);
console.log('bloom resources: low/high/low, odd sizes and resize allocation reuse passed (mock GL)');
// 真正执行 frame 控制流：动态切换两/三级泛光时绑定有效纹理，并复用冲击波数组。
const fr:any=Object.create(GLStage.prototype);const binds:any={};let shockArray:any=null;
let clearCalls=0;const uniforms:any={};const fakeGl:any=new Proxy({clear:()=>{clearCalls++},uniform1f:(name:string,val:number)=>{uniforms[name]=val},uniform4fv:(name:string,val:any)=>{if(name==='uShock[0]')shockArray=val}}, {get:(o:any,k:any)=>k in o?o[k]:(()=>{})});
const program={p:{},u:(n:string)=>n};let ids=0;const ftarget=(w:number,h:number)=>({w,h,tex:{id:++ids},fb:{}});
Object.assign(fr,{gl:fakeGl,canvas:{width:200,height:100},W:200,H:100,lost:false,fx:ftarget(200,100),h1:ftarget(100,50),q1:ftarget(50,25),q2:ftarget(50,25),e1:null,e2:null,bloomLevels:2,bloomOn:true,sceneUp:true,sceneTex:{},noiseTex:{},atmoTex:{},batch:{n:0,data:new Float32Array(8),segs:[]},gpuTiming:false,tq:{pend:[],cur:null,tried:false,ext:null},gpuMs:0,gpuSec:{},gpuHasResults:false,shockUniform:new Float32Array(24),post:program,down:program,blur:program,sprite:program,emptyVao:{},vboSize:32});
fr.target=ftarget;fr.free=()=>{};fr.bindTex=(i:number,tex:any)=>{binds[i]=tex};fr.full=()=>{};
const P:any={ground:null,atmo:null,t:1,shocks:[{x:2,y:3,r:4,amp:5}],mul:[1,1,1],warm:0,dusk:0,sense:{x:0,y:0,R:1,on:true,ink:[0,0,0],glow:[1,1,1],hide:0,alarm:0},fog:[0,0,0,0],fogBands:0,flash:[0,0,0,0],tint:[0,0,0,0],vig:0,hurt:0,fade:0,aberr:0,bloom:1,grain:0,sat:1};
fr.frame({} as any,200,100,2,P,false);assert.equal(uniforms.uFxOn,0);assert.equal(uniforms.uBloomK,0);assert.equal(clearCalls,0);assert.strictEqual(binds[3],fr.q1.tex);assert.deepEqual([...shockArray.slice(0,4)],[4,6,8,10]);const shockRef=shockArray;
fr.bloomLevels=3;fr.batch.n=1;fr.frame({} as any,200,100,1,P,false);assert.ok(fr.e1&&fr.e2);assert.equal(uniforms.uFxOn,1);assert.equal(uniforms.uBloomK,1);assert.equal(clearCalls,1);assert.strictEqual(binds[3],fr.e1.tex);assert.strictEqual(shockArray,shockRef);
fr.bloomLevels=2;fr.frame({} as any,200,100,1,P,false);assert.equal(fr.e1,null);assert.strictEqual(binds[3],fr.q1.tex);assert.equal(clearCalls,2);fr.batch.n=0;fr.frame({} as any,200,100,1,P,false);assert.equal(uniforms.uFxOn,0);assert.equal(uniforms.uBloomK,0);assert.equal(clearCalls,2);
console.log('GL frame: bloom-level switching, valid sampler selection and shock buffer reuse passed (mock GL)');
// 运行 postGL 的真实参数组装：氛围尚未绘制或秘境已清空时不传空矩形。
const postR:any=Object.create(Renderer.prototype);let postP:any;
Object.assign(postR,{game:{player:{x:0,y:0},weather:{k:0,kind:'clear',flash:0},day:0,dayPhase:0,night:0,time:1,hero:{realm:0,hp:1,dead:false},story:{mind:0},revealAll:false,debugSeeAll:false,hurtFlash:0,modFlash:{a:0,c:[1,1,1]},tianxiang:{flash:0,flashCol:[1,1,1]},combat:{fade:0},trauma:0,aberrKick:0},stage:{W:200,frame:(_cv:any,_w:any,_h:any,_d:any,p:any)=>postP=p},fx:{shocks:[]},sense:{hidden:0,alarm:0},canvas:{},atmo:{width:20,height:20},atmoRect:{x:0,y:0,w:0,h:0},atmoReady:false,atmoRevision:1,groundOn:false});
postR.postGL(0,0,1,200,100,0,0,0,1,[255,255,255],100,true);assert.equal(postP.atmo,null);
postR.atmoReady=true;postR.atmoRect={x:0,y:0,w:200,h:100};postR.postGL(0,0,1,200,100,0,0,0,1,[255,255,255],100,true);assert.equal(postP.atmo.revision,1);assert.equal(postP.atmo.w,200);assert.equal(postP.atmo.h,100);
console.log('postGL: unready atmosphere omitted and ready layer retained (mock GL)');
// JS 侧画布上传异常必须恢复解包状态，失效缓存并允许下一次完整上传。
const uf:any=Object.create(GLStage.prototype);let mode='failSub', pixelStates:boolean[]=[], fullUploads=0;
uf.gl={TEXTURE_2D:1,UNPACK_PREMULTIPLY_ALPHA_WEBGL:2,RGBA:3,UNSIGNED_BYTE:4,bindTexture(){},pixelStorei:(_p:any,v:boolean)=>pixelStates.push(v),texImage2D(){fullUploads++;if(mode==='failImage')throw Error('image')},texSubImage2D(){if(mode==='failSub')throw Error('sub')}};
Object.assign(uf,{sceneW:20,sceneH:10,sceneUp:true,atmoW:20,atmoH:10,atmoUp:true});const small={width:20,height:10};
assert.throws(()=>uf.upload({},small,true,true));assert.equal(uf.sceneUp,false);assert.equal(uf.sceneW,0);assert.deepEqual(pixelStates,[true,false]);mode='ok';uf.upload({},small,true,true);assert.equal(uf.sceneUp,true);assert.equal(fullUploads,1);
mode='failImage';assert.throws(()=>uf.upload({},{width:21,height:10},true,false));assert.equal(uf.atmoUp,false);assert.equal(uf.atmoW,0);assert.deepEqual(pixelStates.slice(-2),[true,false]);mode='ok';uf.upload({},small,true,false);assert.equal(uf.atmoUp,true);
console.log('canvas upload exceptions: unpack state restored and texture invalidated for retry (mock GL)');
// 新地形设置失败时，上下文恢复仍指向上一次成功的数据。
const sw:any=Object.create(GLStage.prototype), previous={id:'previous'}, next={id:'next'};sw.groundData=previous;sw.ground={setTerrain:()=>{throw Error('terrain')}};assert.throws(()=>sw.setTerrain(next));assert.equal(sw.groundData,previous);sw.ground={setTerrain:(x:any)=>assert.equal(x,next)};sw.setTerrain(next);assert.equal(sw.groundData,next);sw.ground=null;sw.setTerrain(previous);assert.equal(sw.groundData,previous);
