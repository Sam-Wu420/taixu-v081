import assert from 'node:assert/strict';
import './env';
(globalThis as any).window = { innerWidth:800, innerHeight:600, devicePixelRatio:1, addEventListener(){}, removeEventListener(){}, matchMedia:()=>({matches:false}) };
(globalThis as any).localStorage = { getItem:()=>null, setItem(){}, removeItem(){} };
const C = await import('../src/world/cultivation');
const { Towns } = await import('../src/world/town');
const h = C.newHero(); h.bag = [{id:'mat_lingshi',n:100},{id:'pill_juqi',n:Number.MAX_SAFE_INTEGER}];
const towns = new Towns({hero:h} as any); const lot: any = {id:'pill_juqi',base:10,price:10};
for (const p of [NaN,Infinity,-1,1.5,Number.MAX_SAFE_INTEGER+1,101,10]) {
 const before = structuredClone(h), saved = {...lot}; assert.equal(towns.settleAuction(lot,p),false); assert.deepEqual(h,before); assert.deepEqual(lot,saved);
}
h.bag[1].n = 1;
let nested = true; const f = (id:string) => { if (id === 'pill_juqi') { assert.equal(lot.done,'won'); nested = towns.settleAuction(lot,10); } };
C.itemListeners.push(f); try { assert.equal(towns.settleAuction(lot,10),true); } finally { C.itemListeners.splice(C.itemListeners.indexOf(f),1); }
assert.equal(nested,false); assert.equal(C.bagCount(h,'mat_lingshi'),90); assert.equal(C.bagCount(h,'pill_juqi'),2); assert.equal(lot.done,'won'); assert.equal(towns.settleAuction(lot,10),false);
// 灵石拍品同 ID 扣款与产物按净变化处理。
const cashLot: any = {id:'mat_lingshi',base:2,price:2}; assert.equal(towns.settleAuction(cashLot,2),true); assert.equal(C.bagCount(h,'mat_lingshi'),89);
console.log('auction settlement: invalid prices, overflow, insufficient funds, atomic sale and reentrant listeners passed');
