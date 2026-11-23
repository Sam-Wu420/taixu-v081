import assert from 'node:assert/strict';
import './env';
(globalThis as any).window = { innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const C = await import('../src/world/cultivation');
const { Towns } = await import('../src/world/town');
const R = C.RECIPES;
function rng<T>(f: () => T, value: number) { const old = Math.random; Math.random = () => value; try { return f(); } finally { Math.random = old; } }
const h = C.newHero(); h.bag = []; let notices = 0;
const listener = () => { notices++; }; C.itemListeners.push(listener);
try {
 assert.ok(C.addItem(h, 'herb_huangjing', 2)); assert.ok(C.addItem(h, 'pill_juqi', Number.MAX_SAFE_INTEGER));
 notices = 0; const before = structuredClone(h); const r = R.find(x => x.id === 'r_juqi')!;
 const blocked = rng(() => C.brew(h, r), 0); assert.equal(blocked.ok, false); assert.equal(blocked.days, 0); assert.deepEqual(h, before); assert.equal(notices, 0);
 // 重复输入累计，不允许分别验证后少扣材料。
 const dup = { ...r, inputs: [{id:'herb_huangjing',n:2}, {id:'herb_huangjing',n:2}] };
 assert.equal(C.checkRecipe(h, dup).ok, false); assert.equal(rng(() => C.brew(h, dup), 0).days, 0); assert.deepEqual(h, before);
 const bad = { ...r, inputs: [{id:'herb_huangjing',n:NaN}] }; assert.equal(C.checkRecipe(h, bad).ok, false);
 // 同一种物品既是材料又是产物时按净变化检查容量。
 h.bag = [{ id:'pill_juqi', n:Number.MAX_SAFE_INTEGER }]; notices = 0;
 assert.ok(C.exchangeItems(h, [{id:'pill_juqi',n:2}], [{id:'pill_juqi',n:2}])); assert.equal(C.bagCount(h, 'pill_juqi'), Number.MAX_SAFE_INTEGER); assert.equal(notices, 1);
 const snap = structuredClone(h); notices = 0;
 assert.equal(C.exchangeItems(h, [{id:'pill_juqi',n:2}], [{id:'pill_juqi',n:3}]), false); assert.deepEqual(h, snap); assert.equal(notices, 0);
 // 炼丹成功/失败和特殊炼器主材保护。
 h.bag = [{id:'herb_huangjing',n:2}]; const oldStats = h.stats.alchemy;
 assert.equal(rng(() => C.brew(h,r), 0).ok, true); assert.equal(C.bagCount(h,'herb_huangjing'), 0); assert.equal(C.bagCount(h,'pill_juqi'), 2); assert.equal(h.stats.alchemy, oldStats+1);
 h.bag = [{id:'herb_huangjing',n:2}]; assert.equal(rng(() => C.brew(h,r), 0.99).ok, false); assert.equal(C.bagCount(h,'herb_huangjing'),0);
 const forge = R.find(x => x.id === 'f_qingzhu')!; h.realm = 3; h.stage = 0; h.bag = []; for (const i of forge.inputs) C.addItem(h,i.id,i.n);
 assert.equal(rng(() => C.brew(h,forge),0.99).ok,false); assert.equal(C.bagCount(h,'mat_jinleizhu'),1); assert.equal(C.bagCount(h,'mat_xuantie'),0);
 h.bag = []; for (const i of forge.inputs) C.addItem(h,i.id,i.n); assert.equal(rng(() => C.brew(h,forge),0).ok,true); assert.equal(h.qzN,12); assert.equal(C.bagCount(h,'art_qingzhu'),1);
 // 通知发出前材料、剑组及统计已经一并提交。
 h.qzN = undefined; h.bag = []; for (const i of forge.inputs) C.addItem(h,i.id,i.n);
 let observed = false; const check = (id: string) => { if (id === 'art_qingzhu') { observed = true; assert.equal(h.qzN, 12); assert.equal(C.bagCount(h, 'mat_jinleizhu'), 0); } };
 C.itemListeners.push(check); try { assert.equal(rng(() => C.brew(h, forge),0).ok,true); assert.ok(observed); } finally { C.itemListeners.splice(C.itemListeners.indexOf(check),1); }
 // 宗门俸禄不能丢失；重复交任务不能重复领奖。
 const t: any = {id:'a',kind:'gather',target:'herb_huangjing',need:2,have:0,reward:40,exp:0.02};
 const sect: any = {id:'huangfeng',rank:0,contrib:0,done:0,lastPay:0,tasks:[t,{id:'other'}]};
 const game: any = {hero:h, day:30, ws:{sect, kills:{}}, toast() {}}; const town = new Towns(game);
 h.bag = [{id:'mat_lingshi', n:Number.MAX_SAFE_INTEGER}]; assert.equal(town.pay(),0); assert.equal(sect.lastPay,0);
 h.bag = []; let nested = -1; const reenter = (id: string) => { if (id === 'mat_lingshi') nested = town.pay(); };
 C.itemListeners.push(reenter); try { assert.equal(town.pay(),6); } finally { C.itemListeners.splice(C.itemListeners.indexOf(reenter),1); }
 assert.equal(nested,0); assert.equal(sect.lastPay,30); assert.equal(C.bagCount(h,'mat_lingshi'),6);
 C.addItem(h,'herb_huangjing',2); sect.contrib = Number.MAX_SAFE_INTEGER;
 town.turnIn(t); assert.equal(C.bagCount(h,'herb_huangjing'),2); assert.equal(sect.tasks.includes(t),true);
 sect.contrib = 0; town.turnIn(t); assert.equal(C.bagCount(h,'herb_huangjing'),0); assert.equal(sect.contrib,40); assert.equal(sect.done,1);
 C.addItem(h,'herb_huangjing',2); town.turnIn(t); assert.equal(sect.contrib,40); assert.equal(C.bagCount(h,'herb_huangjing'),2);
} finally { C.itemListeners.splice(C.itemListeners.indexOf(listener), 1); }
console.log('inventory transactions: atomic exchange, alchemy, forging, sect salary and task rewards passed');
