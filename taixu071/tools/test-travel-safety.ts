import './env';
import assert from 'node:assert/strict';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
function store(){const data=new Map<string,string>();return {data,getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v)},removeItem:(k:string)=>{data.delete(k)}}}
const ls=store(),ss=store();(globalThis as any).localStorage=ls;(globalThis as any).sessionStorage=ss;
const {Travel}=await import('../src/world/travel');const {Game}=await import('../src/world/game');const C=await import('../src/world/cultivation');
let ok=false, switches=0,resets=0,teleports=0;const alerts:string[]=[];const h=C.newHero();h.realm=2;h.stage=0;h.bag=[{id:'token',n:1},{id:'mat_lingshi',n:30}];
const g:any={hero:h,day:60,ws:{flags:{},news:[],worlds:{}},player:{x:0,y:0},npcs:{list:[],daily(){},archiveAndSwitchWorldNpcs(){}},combat:{reset(){resets++}},pursuit:{active:true,reset(){resets++}},teleport(){teleports++},save(){if(ok)ls.setItem('fanren_save_auto','checkpoint');return ok},load(){tr.finishRecovery();return true},updateUI(){},saveFailText:()=>'',toast:(s:string)=>alerts.push(s),news(text:string){this.ws.news.push({text})},switchMap(){switches++;return false}};
const tr:any=new Travel(g);g.travel=tr;const pt:any={def:{token:'token',cost:10,minRealm:2},here:{id:'not-source',name:'入口'},there:{map:'lingjie',name:'出口',desc:'测试',x:5,y:5}};
tr.nearPortal=()=>pt;let node=tr.portalNode(pt);node.options[0].act();assert.equal(C.bagCount(h,'mat_lingshi'),30);assert.equal(tr.pending,null);assert.equal(switches,0);assert.equal(resets,0);assert.equal(g.ws.news.length,0);assert.match(alerts.at(-1)!,/未扣灵石/);
ok=true;g.onTravel=()=>{switches++};node=tr.portalNode(pt);
tr.nearPortal=()=>null;node.options[0].act();assert.equal(C.bagCount(h,'mat_lingshi'),30);assert.equal(switches,0);assert.match(alerts.at(-1)!,/条件已变化/);tr.nearPortal=()=>pt;
node.options[0].act();assert.equal(C.bagCount(h,'mat_lingshi'),20);assert.equal(tr.pending.map,'lingjie');assert.equal(resets,2);assert.equal(switches,1);
node.options[0].act();assert.equal(C.bagCount(h,'mat_lingshi'),20);assert.equal(switches,1);
tr.cancelFailedSwitch();assert.equal(C.bagCount(h,'mat_lingshi'),30);assert.equal(tr.pending,null);assert.equal(g.ws.news.length,0);assert.match(alerts.at(-1)!,/退回/);
node=tr.portalNode(pt);h.bag=[{id:'token',n:1}];node.options[0].act();assert.equal(tr.pending,null);assert.equal(C.bagCount(h,'mat_lingshi'),0);
h.bag=[{id:'mat_lingshi',n:30}];const pickup={...pt,here:{id:'chuansong',name:'入口'}};node=tr.portalNode(pickup);h.bag.push({id:'token',n:Number.MAX_SAFE_INTEGER});node.options[0].act();assert.equal(g.ws.flags.danuoyi,undefined);assert.equal(C.bagCount(h,'token'),Number.MAX_SAFE_INTEGER);
// 同图域内远程传送阵直接瞬移，不切图、不留 pending。
const localPt:any={def:{token:'token',cost:10,minRealm:2},here:{id:'chuansong',name:'入口'},there:{map:'renjie',name:'乱星海传送阵',desc:'测试',x:5,y:5}};
h.bag=[{id:'token',n:1},{id:'mat_lingshi',n:30}];tr.nearPortal=()=>localPt;node=tr.portalNode(localPt);node.options[0].act();assert.equal(C.bagCount(h,'mat_lingshi'),20);assert.equal(teleports,1);assert.equal(tr.pending,null);
// 边境行程保存失败不会换图；已执行的时间结算明确保留并提示。
const timeBefore=g.day;ok=false;assert.equal(tr.go('lingjie',300,300,2,'edge'),false);assert.equal(g.day,timeBefore);assert.equal(tr.pending,null);assert.match(alerts.at(-1)!,/未开始远行/);
// 检查点成功、目标写入失败时保护出发前存档，禁止自动覆盖，暂停并允许读档恢复。
let saves=0,npcDays=0;g.save=()=>{ if (++saves===1) { ls.setItem('fanren_save_auto','checkpoint'); return true; } return false; };g.npcs.daily=(days:number)=>npcDays+=days;
assert.equal(tr.go('lingjie',300,300,2,'edge'),false);assert.equal(g.day,timeBefore+2);assert.equal(npcDays,2);assert.equal(tr.recoveryRequired,true);assert.equal(g.paused,true);assert.match(alerts.at(-1)!,/出发前自动存档/);
const fake:any={hero:{dead:false},travel:tr};assert.equal(Game.prototype.save.call(fake,0),false);assert.equal(fake.saveLastError,'travelRecovery');
tr.recoveryRequired=false;g.paused=false;
// 中途异常也必须保留检查点，不尝试切图。
saves=0;g.npcs.daily=()=>{throw Error('mock daily')};const warn=console.warn;console.warn=()=>{};try{assert.equal(tr.go('lingjie',300,300,2,'edge'),false)}finally{console.warn=warn};assert.equal(tr.recoveryRequired,true);assert.equal(g.paused,true);assert.equal(tr.pending,null);
tr.recoveryRequired=false;g.paused=false;
// 寿元不足时在时间结算和存档之前拒绝长途。
h.age=100000;saves=0;assert.equal(tr.go('lingjie',300,300,2,'edge'),false);assert.equal(saves,0);assert.match(alerts.at(-1)!,/寿元不足/);h.age=17;
// 两份存储之间失败，不留下错误的地图恢复标记。
(globalThis as any).location={search:'',href:'https://example.test/',reload(){throw Error('blocked')}};
ls.setItem('fanren.map','renjie');ss.setItem('fanren.resume','old');assert.equal(Game.prototype.switchMap.call({},'lingjie'),false);assert.equal(ls.getItem('fanren.map'),'renjie');assert.equal(ss.getItem('fanren.resume'),'old');
(globalThis as any).location.reload=()=>{};assert.equal(Game.prototype.switchMap.call({},'lingjie','slot2'),true);assert.equal(ls.getItem('fanren.map'),'lingjie');assert.equal(ss.getItem('fanren.resume'),'slot2');
console.log('travel safety: failed save, portal refund, duplicate activation, stale payment, token grant failure and map marker rollback passed');
