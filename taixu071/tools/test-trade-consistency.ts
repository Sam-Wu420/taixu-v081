import assert from 'node:assert/strict';
import './env';
(globalThis as any).window = { innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false}) };
(globalThis as any).localStorage = {getItem:()=>null,setItem(){},removeItem(){}};
const C=await import('../src/world/cultivation');
const { Towns }=await import('../src/world/town');
const { JianghuSys }=await import('../src/world/jianghu');
function rng<T>(n:number, f:()=>T):T {const r=Math.random; Math.random=()=>n;try{return f()}finally{Math.random=r}}
const h=C.newHero(); h.bag=[{id:'mat_lingshi',n:100}];
const warnings:string[]=[];
const game:any={hero:h,day:10,ws:{cred:60,rep:0,shopCache:{}},toast:(s:string)=>warnings.push(s),jianghu:{credSellMul:()=>1}};
const town=new Towns(game);
const stock:any={id:'pill_juqi',price:10,n:1,fake:'toxic',seller:'a'};
const cached:any={...stock}; const shop:any={stock:[stock],zone:'TN',sellRate:0.5,cacheKey:'key'}; game.ws.shopCache.key=[cached];
let nested=true; const listen=(id:string)=>{if(id==='pill_juqi'){nested=town.buy(shop,stock);assert.equal(cached.n,0)}};
C.itemListeners.push(listen);try{assert.equal(town.buy(shop,stock),true)}finally{C.itemListeners.splice(C.itemListeners.indexOf(listen),1)}
assert.equal(nested,false);assert.equal(C.bagCount(h,'mat_lingshi'),90);assert.equal(h.bag.find(x=>x.id==='pill_juqi')?.fake,'toxic');assert.equal(shop.stock.length,0);assert.equal(game.ws.shopCache.key.length,0);
// 背包溢出时，贡献、独立缓存和库存都恢复。
h.bag=[{id:'pill_huiqi',n:Number.MAX_SAFE_INTEGER}];game.ws.sect={contrib:50};
const s2:any={id:'pill_huiqi',n:1,price:10}, c2={...s2}, sh2:any={stock:[s2],currency:'contrib',cacheKey:'key'};game.ws.shopCache.key=[c2];
assert.equal(town.buy(sh2,s2),false);assert.equal(s2.n,1);assert.equal(c2.n,1);assert.equal(game.ws.sect.contrib,50);assert.equal(C.bagCount(h,'pill_huiqi'),Number.MAX_SAFE_INTEGER);
// 同 ID 灵石净变化，以及出售时按选择年龄而不是最老一堆。
h.bag=[{id:'mat_lingshi',n:Number.MAX_SAFE_INTEGER}];const s3:any={id:'mat_lingshi',n:1,price:2};assert.equal(town.buy({stock:[s3]} as any,s3),true);assert.equal(C.bagCount(h,'mat_lingshi'),Number.MAX_SAFE_INTEGER-1);
h.bag=[{id:'pill_juqi',n:1,age:1,fake:'toxic'},{id:'pill_juqi',n:1,age:20},{id:'mat_lingshi',n:100}];
assert.equal(town.sell({zone:'TN',sellRate:0.5} as any,'pill_juqi',20),true);assert.equal(h.bag.find(x=>x.id==='pill_juqi')?.fake,'toxic');
// NPC 卖假：失败时粉被消耗但丹不损失，成功时粉和所选真丹一起扣，账目不可重放。
const j:any=new JianghuSys(game); game.ws.fakeSales=[]; game.ws.cred=60;
const buyer:any={id:'b',name:'买家',wealth:100000,seed:1,pers:'kind',realm:1,favor:0,grudge:0}; const a={d:buyer,look:{}}; const back=()=>null;
function option(){ return j.fakeSellNode(a,'交易',back).options.find((x:any)=>x.label.startsWith('以伪灵粉')); }
h.bag=[{id:'pill_juqi',n:1},{id:'mat_weilingfen',n:1},{id:'mat_lingshi',n:0}];let opt=option();assert.ok(opt);
const caught=rng(0,()=>opt.act());assert.equal(caught.mood,'danger');assert.equal(C.bagCount(h,'mat_weilingfen'),0);assert.equal(C.bagCount(h,'pill_juqi'),1);assert.equal(game.ws.fakeSales.length,0);
h.bag=[{id:'pill_juqi',n:1,fake:'toxic'},{id:'pill_juqi',n:1},{id:'mat_weilingfen',n:1},{id:'mat_lingshi',n:Number.MAX_SAFE_INTEGER}];opt=option();const snap=structuredClone(h.bag), wealth=buyer.wealth, cred=game.ws.cred;
rng(0.99,()=>opt.act());assert.deepEqual(h.bag,snap);assert.equal(buyer.wealth,wealth);assert.equal(game.ws.cred,cred);assert.equal(game.ws.fakeSales.length,0);
h.bag[3].n=100;opt=option();let seen=false;const spy=(id:string)=>{if(id==='mat_lingshi'){seen=true;assert.equal(game.ws.fakeSales.length,1);rng(0.99,()=>opt.act())}};
C.itemListeners.push(spy);try{rng(0.99,()=>opt.act())}finally{C.itemListeners.splice(C.itemListeners.indexOf(spy),1)}
assert.ok(seen);assert.equal(game.ws.fakeSales.length,1);assert.equal(h.bag.find(x=>x.id==='pill_juqi')?.fake,'toxic');assert.equal(C.bagCount(h,'mat_weilingfen'),0);const result=structuredClone(h.bag);rng(0.99,()=>opt.act());assert.deepEqual(h.bag,result);assert.equal(game.ws.fakeSales.length,1);
console.log('trade consistency: shop inventory/cache, fake goods, selected sale, caught fraud, atomic fraud and reentry passed');
