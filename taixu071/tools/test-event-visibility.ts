import './env';
import assert from 'node:assert/strict';
import {ACTIVE_MAP} from '../src/data/world';
import {Happen} from '../src/world/happen';
import {GreatHunt} from '../src/world/great';
import {FoeAI} from '../src/world/foeskills';
import {audio} from '../src/world/audio';
(audio as any).sfx=()=>{};
const messages:string[]=[],news:string[]=[],drops:any[]=[];
const game:any={player:{x:0,y:0},hero:{realm:2,stage:0},senseRadius:2200,detailSenseRadius:800,senseBurstT:0,time:1,day:1,ws:{flags:{heraldNext:1000,greatNext:1000}},combat:{enemies:[],texts:[],vfx:[],fxq:[],lock:null,dropLoot:(...v:any[])=>drops.push(v)},toast:(s:string)=>messages.push(s),news:(s:string)=>news.push(s),juice(){},cinema(){},slowmo(){}};
const taker=(tag:string,x:number)=>({id:1,x,y:0,name:'隐秘夺宝人',tag,dead:false,gone:false,def:{kind:'human'},aggro:true,cast:null});
const h:any=new Happen(game);
// 小夺宝：圈外和隐匿时仍推进争夺，但即时警告不泄露姓名；谣言通道维持原玩法。
const hd:any={map:ACTIVE_MAP,x:1500,y:0,day:1,tier:2,rival:'传闻',spawned:true};game.ws.flags.herald=hd;let e:any=taker('herald:rival',1500);game.combat.enemies=[e];h.heraldTick(.5);assert.equal(hd.seize,.5);assert.equal(messages.length,1);assert.ok(!messages[0].includes(e.name));assert.equal(game.combat.texts[0].source,e);
hd.seize=7.5;h.heraldTick(.5);assert.equal(hd.done,true);assert.equal(e.gone,true);assert.ok(!messages.at(-1)!.includes(e.name));assert.ok(news.at(-1)!.includes(e.name));
// 圈内但隐匿仍不透露；可见后新参与者可正常显示名称。
messages.length=0;game.player.x=1000;const hd2:any={map:ACTIVE_MAP,x:1500,y:0,day:1,tier:2,rival:'传闻',spawned:true};game.ws.flags.herald=hd2;e=taker('herald:rival',1500);e.hideT=1;game.combat.enemies=[e];h.heraldTick(.5);assert.ok(!messages.at(-1)!.includes(e.name));e.hideT=0;e.id=2;h.heraldTick(.5);assert.ok(messages.at(-1)!.includes(e.name));
// 大夺宝使用相同规则，并且争宝过程不因显示过滤停止。
messages.length=0;game.player.x=0;const gs:any={map:ACTIVE_MAP,x:1500,y:0,day:1,rivals:['某人']};game.ws.flags.great=gs;const gh:any=new GreatHunt(game);gh.spawned=true;e=taker('great:rival',1500);game.combat.enemies=[e];gh.tick(.5);assert.equal(gs.seize,.5);assert.ok(!messages.at(-1)!.includes(e.name));gs.seize=11.5;gh.tick(.5);assert.equal(gs.done,true);assert.equal(e.gone,true);assert.ok(!messages.at(-1)!.includes(e.name));
// 野外妖兽相争：未发现或外圈不弹详细战报，但战斗与掉落继续；近处不显示未锁定血量。
function duel(x:number,seen:boolean,lock=false){messages.length=0;drops.length=0;game.player.x=0;game.combat.texts=[];game.combat.vfx=[];const mk=(name:string,hp:number)=>({x,y:0,hp,maxHp:100,atk:1,realm:1,blv:1,busy:true,dead:false,def:{name,kind:'beast'},anim:{atk:0,hit:0,move:0,phase:0}});const a:any=mk('甲兽',50),b:any=mk('乙兽',1);game.combat.enemies=[a,b];game.combat.lock=lock?a:null;const event:any={kind:'beastfight',x,y:0,seen,done:false,foes:[a,b],d:{nt:0}};h.tick(event,.01,Math.abs(x));assert.equal(b.dead,true);assert.equal(drops.length,1);assert.equal(game.combat.vfx[0].source,b);return a;}
const rand=Math.random;Math.random=()=>0;try {duel(1200,true);assert.equal(messages.length,0);duel(200,false);assert.equal(messages.length,0);duel(200,true);assert.equal(messages.length,1);assert.ok(!messages[0].includes('气血'));duel(200,true,true);assert.ok(messages[0].includes('气血'));}finally{Math.random=rand}
// 首领阶段仍真实转变，圈外警告保留但不泄露姓名。
messages.length=0;game.player.x=0;game.combat.texts=[];game.combat.vfx=[];game.combat.fxq=[];const foe:any=new FoeAI(game.combat);game.combat.game=game;const boss:any={x:1200,y:0,name:'秘名妖王',boss:true,dead:false,hp:20,maxHp:100,rage:0,guardT:0,def:{id:'fake',kind:'beast'},kit:[],skCd:{},skT:5};foe.phase(boss);assert.equal(boss.rage,2);assert.equal(boss.guardT,1);assert.equal(boss.skT,.8);assert.equal(messages.length,0);assert.equal(game.combat.texts[0].source,boss);assert.equal(game.combat.vfx[0].source,boss);assert.equal(game.combat.fxq.length,0);
boss.x=200;boss.rage=0;messages.length=0;foe.phase(boss);assert.ok(messages[0].includes(boss.name));
console.log('event visibility: actual treasure progression, beast fight and boss phase preserve mechanics without hidden names');
// 大招的真实起手仍创建预警区域，但圈外与隐匿不显示施法者和技能名。
const sk:any={id:'test_ult',name:'秘密绝招',k:'nova',el:'earth',cd:10,tele:1,pow:2,range:500,r:220,ult:true};
boss.anim={atk:0};boss.blv=0;boss.realm=2;boss.atk=10;boss.x=1200;messages.length=0;foe.start(boss,sk,0,0);assert.ok(foe.hz.length>0);assert.ok(messages[0].includes('小心闪避'));assert.ok(!messages[0].includes(boss.name));assert.ok(!messages[0].includes(sk.name));
boss.x=200;boss.hideT=1;messages.length=0;foe.start(boss,sk,0,0);assert.ok(!messages[0].includes(boss.name));boss.hideT=0;messages.length=0;foe.start(boss,sk,0,0);assert.ok(messages[0].includes(boss.name));assert.ok(messages[0].includes(sk.name));
console.log('boss ultimate: real hazard creation retained while remote skill identity is withheld');
