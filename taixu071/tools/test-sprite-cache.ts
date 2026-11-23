import './env';import assert from 'node:assert/strict';
import {SpriteCache} from '../src/gfx/sprites';import {SpriteJobs} from '../src/gfx/spriteJobs';
const cache:any=new SpriteCache(1000);let sorts=0;const evict=cache.evict.bind(cache);cache.evict=()=>{sorts++;evict()};let closed=0;
const make=()=>({canvas:{width:30,height:30,close(){closed++}},w:30,h:30,ax:0,ay:0});
cache.beginFrame();cache.get('a',1,make,true);cache.get('b',1,make,true);cache.get('c',1,make,true);cache.get('d',1,make,true);assert.equal(sorts,1);assert.equal(cache.stats.n,4);assert.equal(closed,0);
cache.beginFrame();assert.equal(sorts,2);assert.equal(cache.stats.n,4);cache.peek('d',1);cache.beginFrame();assert.equal(sorts,3);assert.equal(closed,3);assert.equal(cache.stats.n,1);assert.equal(cache.has('a'),false);assert.equal(cache.byBase.has('a'),false);assert.equal(cache.has('d'),true);
cache.clearBase('d');assert.equal(cache.stats.n,0);assert.equal(cache.byBase.size,0);const budget=cache.budgetPx;cache.setBudget(NaN);assert.equal(cache.budgetPx,budget);
// Worker 已取消 / 未识别的返回结果必须释放 ImageBitmap。
const j:any=Object.create(SpriteJobs.prototype);j.cbs=new Map();j.inflight=new Set();let orphan=0;j.onDone({id:100,bmp:{close(){orphan++}}});assert.equal(orphan,1);
// postMessage 抛错时清理所有挂起任务并启用同步回退。
let terminated=0,errors=0;Object.assign(j,{w:{postMessage(){throw Error('clone failed')},terminate(){terminated++}},ok:true,seq:1,maxInflight:3,done:0,avgMs:0});const warn=console.warn;console.warn=()=>{};try{assert.equal(j.post('x',{} as any,(r:any)=>{if(r.err)errors++}),false)}finally{console.warn=warn}
assert.equal(j.ok,false);assert.equal(j.queued,0);assert.equal(j.cbs.size,0);assert.equal(terminated,1);assert.equal(errors,1);
// 缩小复用高清图（2.2× 内不重建）+ zoomActive 期间已有低清图时暂缓重烘
{
  const zc = new SpriteCache(1e6);
  let built = 0;
  const mk = (r: number) => { built++; return { canvas: { width: Math.round(100 * r), height: Math.round(100 * r), close() {} } as any, w: 100, h: 100, ax: 50, ay: 100 }; };
  zc.beginFrame();
  const hi = zc.get('tree1', 1.0, mk, true);
  assert.equal(built, 1);
  // 缩小到 0.5：1.0 在 2.2× 内，直接复用 hi，不新烘
  const down = zc.get('tree1', 0.5, mk);
  assert.equal(down, hi);
  assert.equal(built, 1);
  // 缩到 0.25（>2.2×）时会正常生成 0.25；随后在 zoomActive=true 放大回 0.5 时先复用 0.25 暂缓升档
  const lo = zc.get('tree2', 0.35, mk);
  assert.equal(built, 2);
  zc.zoomActive = true;
  const held = zc.get('tree2', 0.75, mk);
  assert.equal(held, lo);
  assert.equal(built, 2);
  // 缩放停稳后允许正常升档
  zc.zoomActive = false;
  const up = zc.get('tree2', 0.75, mk);
  assert.notEqual(up, lo);
  assert.equal(built, 3);
}
console.log('sprite cache: once-per-frame eviction, deferred LRU, index cleanup, orphan bitmap and worker posting fallback passed');
