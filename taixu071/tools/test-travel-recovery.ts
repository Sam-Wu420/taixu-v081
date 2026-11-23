import './env';import assert from 'node:assert/strict';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
const storage=new Map<string,string>();let failWrite=false;(globalThis as any).localStorage={getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>{if(failWrite)throw Error('denied');storage.set(k,v)},removeItem:(k:string)=>storage.delete(k)};
const {Game,SLOT_KEYS}=await import('../src/world/game');const {Travel}=await import('../src/world/travel');const {NpcWorld}=await import('../src/world/npc');const {newHero}=await import('../src/world/cultivation');const {newWorldState}=await import('../src/world/worldstate');const {unzipSave}=await import('../src/world/savezip');
const npc=new NpcWorld({} as any);npc.newWorld();const h=newHero();const ws=newWorldState();const alerts:string[]=[];
const g:any={hero:h,ws,day:60,clock:1,player:{x:100,y:200,flying:false},fogs:{},explored:new Uint8Array(10),cam:{targetZoom:1},nodes:{toSave:()=>[]},npcs:npc,ui:{region:'天南'},combat:{reset(){}},pursuit:{reset(){}},toast:(s:string)=>alerts.push(s),news(text:string){this.ws.news.push({text,kind:'personal',day:this.day})},saveFailText(){return '模拟存储错误'}};
const tr=new Travel(g);g.travel=tr;let count=0;g.save=(slot:number)=>{count++;return count===1?Game.prototype.save.call(g,slot):false};
const {ACTIVE_MAP}=await import('../src/data/world');
const otherMap=['renjie','lingjie','xianjie'].find(m=>m!==ACTIVE_MAP)!;
npc.daily=()=>{npc.list[0].age+=5;g.ws.flags.travelChanged=true};
assert.equal(tr.go(otherMap,1000,2000,4,'edge'),false);assert.equal(tr.recoveryRequired,true);assert.equal(g.paused,true);assert.equal(g.ws.flags.travelChanged,true);
const checkpoint=storage.get(SLOT_KEYS[0])!;const parsed=JSON.parse(unzipSave(checkpoint));assert.equal(parsed.day,60);assert.equal(parsed.world.flags.travelChanged,undefined);assert.equal(parsed.npcs.length,npc.toSave().length);assert.notEqual(parsed.npcs[0].age,npc.list[0].age);
assert.equal(Game.prototype.save.call(g,0),false);assert.equal(storage.get(SLOT_KEYS[0]),checkpoint);
// 实际读档路径恢复检查点并解锁自动存档；子系统重置用桩，NPC 反序列化使用真实实现。
const reset={reset(){}};g.terrain={walkFactor:()=>1};g.nodes.fromSave=()=>{};g.combat={reset(){},fade:0};g.dailyQueue=[];g.daoxin=reset;g.pianju=reset;g.yuanying=reset;g.zhenfa=reset;g.zhongsheng=reset;g.shen=reset;g.hearts={restore(){}};g.story={resume(){}};g.emitModal=()=>{};g.updateUI=()=>{};
assert.equal(Game.prototype.load.call(g,SLOT_KEYS[0]),true);assert.equal(g.day,60);assert.equal(g.ws.flags.travelChanged,undefined);assert.equal(g.npcs.list[0].age,parsed.npcs[0].age);assert.equal(tr.recoveryRequired,false);assert.equal(g.paused,false);
// 目标档写入成功，实际切图失败：回写内存里的出发前检查点并通过真实读档恢复。
g.save=(slot:number)=>Game.prototype.save.call(g,slot);g.load=(key:string)=>Game.prototype.load.call(g,key);g.onTravel=()=>{};g.npcs.daily=()=>{g.npcs.list[0].age+=5;g.ws.flags.travelChanged=true};
assert.equal(tr.go(otherMap,1000,2000,4,'edge'),true);assert.equal(JSON.parse(unzipSave(storage.get(SLOT_KEYS[0])!)).map,otherMap);
tr.cancelFailedSwitch();assert.equal(tr.recoveryRequired,false);assert.equal(g.day,60);assert.equal(g.ws.flags.travelChanged,undefined);assert.equal(g.npcs.list[0].age,parsed.npcs[0].age);assert.equal(JSON.parse(unzipSave(storage.get(SLOT_KEYS[0])!)).map,parsed.map);
// 存储拒绝写回时保留内存备份、阻止模拟和自动档覆盖；解除故障后重试恢复。
assert.equal(tr.go(otherMap,1000,2000,4,'edge'),true);failWrite=true;const warn=console.warn;console.warn=()=>{};try{tr.cancelFailedSwitch()}finally{console.warn=warn}
assert.equal(tr.recoveryRequired,true);assert.equal(g.paused,true);assert.equal((Object.getOwnPropertyDescriptor(Game.prototype,'halted')!.get!).call({...g,paused:false,modal:null}),true);
assert.equal(JSON.parse(tr.recoveryBackup()!).day,60);assert.equal(Game.prototype.save.call(g,0),false);failWrite=false;assert.equal(tr.recoverCheckpoint(),true);assert.equal(g.day,60);assert.equal(g.ws.flags.travelChanged,undefined);assert.equal(tr.recoveryRequired,false);
console.log(`travel recovery: write failure, switch failure, backup/retry and real ${parsed.npcs.length}-NPC checkpoint restored`);
// 传送费用与切图失败保护：真实保存/读档、模拟换图；到达侧在独立地图进程实际执行 load。
const {spawnSync}=await import('node:child_process');
const {worldCurrencyId}=await import('../src/data/worldHierarchy');
const {ACTIVE_WORLD}=await import('../src/data/world');
const curId=worldCurrencyId(ACTIVE_WORLD);
g.hero.realm=2;g.hero.stage=0;g.hero.bag=[{id:'token',n:1},{id:curId,n:30}];
const portal=(map:string)=>({def:{token:'token',cost:10,minRealm:2},here:{id:'source',name:'入口'},there:{map,name:'出口',desc:'测试',x:5,y:5}});
const originalMap=ACTIVE_MAP;
const targetMaps=['renjie','lingjie','xianjie'].filter(map=>map!==originalMap);
for(const map of targetMaps) {
 const pt=portal(map);(tr as any).nearPortal=()=>pt;const node=(tr as any).portalNode(pt);node.options[0].act();assert.equal(tr.pending?.map,map);
 const raw=storage.get(SLOT_KEYS[0])!, saved=JSON.parse(unzipSave(raw));assert.equal(saved.map,map);assert.equal(saved.hero.bag.find((b:any)=>b.id===curId).n,20);
 const child=spawnSync(process.execPath,['--import','tsx','tools/test-travel-arrival.ts'],{cwd:process.cwd(),input:raw,encoding:'utf8',env:{...process.env,FANREN_MAP:map}});assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/arrival/);
 tr.cancelFailedSwitch();assert.equal(g.hero.bag.find((b:any)=>b.id===curId).n,30);assert.equal(JSON.parse(unzipSave(storage.get(SLOT_KEYS[0])!)).map,originalMap);assert.equal(tr.recoveryRequired,false);
}
// 切图失败时如存储暂不可写，仍能导出付款前备份，重试恢复后灵石不丢。
const last=portal(targetMaps[0]);(tr as any).nearPortal=()=>last;(tr as any).portalNode(last).options[0].act();failWrite=true;console.warn=()=>{};try{tr.cancelFailedSwitch()}finally{console.warn=warn}
assert.equal(tr.recoveryRequired,true);assert.equal(JSON.parse(tr.recoveryBackup()!).hero.bag.find((b:any)=>b.id===curId).n,30);failWrite=false;assert.equal(tr.recoverCheckpoint(),true);assert.equal(g.hero.bag.find((b:any)=>b.id===curId).n,30);
console.log('portal recovery: fees protected on switch/storage failure; simulated arrivals in two separate target-map processes passed');
