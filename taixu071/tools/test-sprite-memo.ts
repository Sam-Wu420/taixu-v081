import './env';import assert from 'node:assert/strict';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const {Renderer}=await import('../src/world/render');const {sprites,SpriteCache}=await import('../src/gfx/sprites');
// 直接走真实 Renderer 的树/山 memo 路径，用受控缓存模拟异步低清→精确结果→淘汰。
const r:any=Object.create(Renderer.prototype);Object.assign(r,{game:{season:0,time:1},dpr:1,seasonCache:false,mtnMeta:new Map()});
const map=new Map<string,any>();let calls=0,fallback:any={canvas:{width:2,height:2},w:2,h:2,ax:1,ay:1},exact:any={canvas:{width:4,height:4},w:4,h:4,ax:2,ay:2};
const peek=sprites.peek, get=sprites.getAsync, has=sprites.has, best=sprites.best;
(sprites as any).peek=(base:string,res:number)=>map.get(base+'@'+res)??null;(sprites as any).getAsync=()=>{calls++;return fallback};(sprites as any).has=()=>true;(sprites as any).best=()=>null;
try {
 const tree:any={sp:'pine',v:2,s:1};assert.equal(r.treeSprite(tree,1),fallback);assert.equal(r.treeSprite(tree,1),fallback);assert.equal(calls,2);assert.equal(tree._tsp,undefined);
 const base='T:pine:0:2:d3',res=0.75;map.set(base+'@'+res,exact);assert.equal(r.treeSprite(tree,1),exact);assert.equal(tree._tsp.base,base);assert.equal(calls,2);
 map.delete(base+'@'+res);fallback=null;assert.equal(r.treeSprite(tree,1),null);assert.equal(calls,3);
 const m:any={id:'m1',w:200,h:100,spec:{}};fallback={canvas:{width:2,height:2}};assert.equal(r.mtnSprite(m,1),fallback);assert.equal(r.mtnSprite(m,1),fallback);assert.equal(m._msp,undefined);
 // 获取代码的实际 res/det 后模拟精确条目，随后移除，不能返回已释放图。
 const key='M:m1:d3@0.75';map.set(key,exact);assert.equal(r.mtnSprite(m,1),exact);
 // 缩放到 0.022（跨细节档到 d0）且 noBuild=true 时，只要旧图仍在缓存里就能复用，不会瞬间消失。
 assert.equal(r.mtnSprite(m,0.022,true),exact);
 map.delete(key);fallback=null;assert.equal(r.mtnSprite(m,0.022,true),null);assert.equal(r.mtnSprite(m,1),null);
}finally{(sprites as any).peek=peek;(sprites as any).getAsync=get;(sprites as any).has=has;(sprites as any).best=best}
// 命中会更新 LRU 时间；淘汰后精确查询不再返回关闭的画布。
const c:any=new SpriteCache(1000);let close=0;const make=()=>({canvas:{width:30,height:30,close(){close++}},w:1,h:1,ax:0,ay:0});c.beginFrame();c.get('a',1,make,true);c.get('b',1,make,true);c.beginFrame();c.peek('a',1);c.beginFrame();assert.ok(c.peek('a',1));assert.equal(c.peek('b',1),null);assert.equal(close,1);
console.log('renderer sprite memo: exact completion, fallback retry, evicted sprite invalidation and LRU touch passed');
const {Terrain}=await import('../src/world/terrain');const terrain:any=new Terrain();terrain.decoCache.set('1,1',{d:[],used:0});terrain.grassCache.set('1,1',{d:[],used:0});terrain.applyTreeDensity(3);assert.equal(terrain.decoRevision,1);assert.equal(terrain.decoCache.size,0);assert.equal(terrain.grassCache.size,0);terrain.applyTreeDensity(0);assert.equal(terrain.decoRevision,2);
console.log('tree density changes invalidate terrain decoration generation version');
