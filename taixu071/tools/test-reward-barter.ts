import assert from 'node:assert/strict';
import './env';
(globalThis as any).window = { innerWidth:800, innerHeight:600, devicePixelRatio:1, addEventListener(){}, removeEventListener(){}, matchMedia:()=>({matches:false}) };
const store = new Map<string,string>();
(globalThis as any).localStorage = {getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v),removeItem:(k:string)=>store.delete(k)};
const C = await import('../src/world/cultivation');
const { Happen } = await import('../src/world/happen');
const { Relations } = await import('../src/world/relations');
const { JianghuSys } = await import('../src/world/jianghu');
const { Game, SLOT_KEYS } = await import('../src/world/game');
const h = C.newHero(); h.bag = [{id:'mat_lingshi',n:Number.MAX_SAFE_INTEGER}];
const bounty:any={id:'b1',name:'恶修',realm:1,stage:0,map:'tiannan',x:0,y:0,until:5,reward:50};
let effects = 0; const notes:string[]=[];
const game:any={hero:h,player:{x:0,y:0,flying:false},ws:{bounties:[bounty],rep:0},day:10,toast:(s:string)=>notes.push(s),news(){},jianghu:{onFakeBountyKill(){effects++}}};
const happen:any=new Happen(game); happen.offers=()=>[];
happen.bountyKill({tag:'bounty:b1'}); assert.equal(bounty.done,true); assert.equal(bounty.rewardPending,50); assert.equal(game.ws.rep,3); happen.bountyKill({tag:'bounty:b1'}); assert.equal(game.ws.rep,3);
assert.ok(happen.boardNode('x','城').options.some((o:any)=>o.label.includes('领取') && o.label.includes('50')));
// 待领奖随真实游戏存档与读取流程往返，而不是仅靠当前内存。
Object.assign(game,{travel:{pending:null},fogs:{},explored:new Uint8Array(10),clock:1,cam:{targetZoom:1},revealAll:false,nodes:{toSave:()=>[]},npcs:{toSave:()=>[]},ui:{region:''}});
assert.equal(Game.prototype.save.call(game,1),true);
const reset={reset(){}}; const live:any={player:{x:0,y:0},terrain:{walkFactor:()=>1},travel:{pending:null},explored:new Uint8Array(10),fogs:{},cam:{},nodes:{fromSave(){}},combat:{reset(){},fade:0},npcs:{fromSave(){},dropBeauties(){}},dailyQueue:[],daoxin:reset,pianju:reset,yuanying:reset,zhenfa:reset,zhongsheng:reset,shen:reset,hearts:{restore(){}},story:{resume(){}},emitModal(){},updateUI(){}};
assert.equal(Game.prototype.load.call(live,SLOT_KEYS[1]),true); assert.equal(live.ws.bounties[0].rewardPending,50);
live.toast = () => {}; live.hero.bag[0].n = 100; const restored:any = new Happen(live); restored.offers=()=>[];
const claim = restored.boardNode('x','城').options.find((o:any)=>o.label.includes('领取')); assert.ok(claim); claim.act(); assert.equal(C.bagCount(live.hero,'mat_lingshi'),150); assert.equal(live.ws.bounties[0].rewardPending,0);
h.bag[0].n=100; let nested=true; const f=(id:string)=>{if(id==='mat_lingshi') nested=happen.claimBounty(bounty)}; C.itemListeners.push(f);
try { assert.equal(happen.claimBounty(bounty),true); } finally { C.itemListeners.splice(C.itemListeners.indexOf(f),1); }
assert.equal(nested,false); assert.equal(C.bagCount(h,'mat_lingshi'),150); assert.equal(bounty.rewardPending,0); assert.equal(happen.claimBounty(bounty),false);
const fake:any={...bounty,id:'b2',done:false,fake:true,reward:5}; game.ws.bounties.push(fake); happen.bountyKill({tag:'bounty:b2'}); happen.bountyKill({tag:'bounty:b2'}); assert.equal(effects,1); assert.equal(C.bagCount(h,'mat_lingshi'),155);
// 真实以物易物对话：指定真品，不能误耗同 ID 假货；库存有限，重放旧选项无效。
h.bag=[{id:'pill_zhuji',n:1,fake:'toxic'}, {id:'pill_zhuji',n:1}];
const stock:any[]=[{id:'pill_huiqi',n:1,price:8,fake:'dyed',seller:'npc'}];
game.npcs={stock:()=>stock}; const rel:any=new Relations(game); rel.addFavor=(d:any,n:number)=>d.favor+=n;
const d:any={id:'n',name:'某人',pers:'kind',favor:0}; const a={d,look:{}}; const back=()=>null;
const node=rel.barterNode(a,'交易',back); const option=node.options.find((o:any)=>o.label.startsWith('以'));
// 仅选真品，验证无法把未鉴定假货替换成真品：构造只有真品在前的选项。
h.bag.reverse(); const node2=rel.barterNode(a,'交易',back); const trade=node2.options.find((o:any)=>o.label.startsWith('以'));
assert.ok(trade); trade.act(); assert.equal(stock.length,0); assert.equal(h.bag.find(x=>x.id==='pill_zhuji')?.fake,'toxic'); assert.equal(h.bag.find(x=>x.id==='pill_huiqi')?.fake,'dyed');
const after=structuredClone(h.bag); trade.act(); assert.deepEqual(h.bag,after); assert.equal(stock.length,0); assert.ok(option);
// 满背包不能丢失选中物或库存；失效格子也不能重复成交。
h.bag=[{id:'pill_zhuji',n:1},{id:'pill_huiqi',n:Number.MAX_SAFE_INTEGER}]; h.equip = { armor:'pill_huiqi' }; stock.push({id:'pill_huiqi',n:1,price:8});
const fail=rel.barterNode(a,'交易',back).options.find((o:any)=>o.label.startsWith('以')); const old=structuredClone(h.bag); fail.act(); assert.deepEqual(h.bag,old); assert.equal(stock[0].n,1);
// NPC 丹药的诚实出售，指定真药且结算钱货；溢出与重复点击无损。
{
 const j:any = new JianghuSys(game); game.ws.cred = 60;
 h.bag=[{id:'pill_juqi',n:1,fake:'toxic'}, {id:'pill_juqi',n:1}, {id:'mat_lingshi',n:Number.MAX_SAFE_INTEGER}];
 const buyer:any={id:'buyer',name:'买家',wealth:1000,pers:'kind',realm:1,favor:0,seed:1};
 const opts=j.fakeSellNode({d:buyer,look:{}},'交易',back).options;
 const sale=opts.find((o:any)=>o.label.startsWith('如实卖出')); const before=structuredClone(h.bag);
 sale.act(); assert.deepEqual(h.bag,before); assert.equal(buyer.wealth,1000); assert.equal(buyer.bag,undefined);
 h.bag[2].n=100; sale.act(); assert.equal(buyer.wealth,979); assert.equal(buyer.bag.pill_juqi,1); assert.equal(h.bag.find(x=>x.id==='pill_juqi')?.fake,'toxic'); assert.equal(C.bagCount(h,'mat_lingshi'),121);
 const after=structuredClone(h.bag); sale.act(); assert.deepEqual(h.bag,after); assert.equal(buyer.wealth,979); assert.equal(buyer.bag.pill_juqi,1);
}
console.log('reward/barter: pending bounty save-load, one-time claim, fake bounty, selected stack and stock limits passed');
