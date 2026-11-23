import './env';
import assert from 'node:assert/strict';
import { farSummaryMode, farMarkerMode, markerRelation, enemyAtPointer } from '../src/world/farView';
import { drawCombatUI } from '../src/world/combatfx';
import {visibleLockedBoss} from '../src/world/senseSignals';
import { createCanvas } from './env';
assert.equal(farSummaryMode(false,0.044,true),true);
assert.equal(farSummaryMode(false,0.05,true),false);
assert.equal(farSummaryMode(true,0.05,true),true);
assert.equal(farSummaryMode(true,0.055,true),false);
assert.equal(farSummaryMode(true,0.02,false),false);
assert.equal(farSummaryMode(true,NaN,true),false);
// 缩放迟滞与关系标记不得根据未暴露身份猜测敌意。
assert.equal(farMarkerMode(undefined,.34),true);assert.equal(farMarkerMode(false,.33),false);assert.equal(farMarkerMode(false,.31),true);assert.equal(farMarkerMode(true,.37),true);assert.equal(farMarkerMode(true,.38),false);assert.equal(farMarkerMode(true,NaN),false);
assert.equal(markerRelation({ally:true,aggro:true}),'ally');assert.equal(markerRelation({aggro:true}),'hostile');assert.equal(markerRelation({}),'unknown');
// 真实 Canvas 路径：中远景(0.16<=z<0.34)分散目标各自独立标记，大缩放(z<0.16)仅保留锁定与BOSS标记；近景都显示姓名及境界。
const cv=createCanvas(800,600),ctx:any=cv.getContext('2d');
const texts:string[]=[],fonts:string[]=[],fills:string[]=[],arcs:any[]=[];const old=ctx.fillText.bind(ctx),oldFill=ctx.fillRect.bind(ctx),oldArc=ctx.arc.bind(ctx);
ctx.fillText=(s:string,...args:any[])=>{texts.push(s);fonts.push(ctx.font);return old(s,...args)};
ctx.fillRect=(...args:any[])=>{fills.push(ctx.fillStyle);return oldFill(...args)};
ctx.arc=(...args:any[])=>{arcs.push(args);return oldArc(...args)};
const enemy=(name:string,x:number,extra:any={})=>({x,y:0,name,rankText:'筑基',dead:false,boss:false,aggro:false,hp:60,maxHp:100,level:10,ally:false,def:{kind:'human'},anim:{flying:false},st:{},...extra});
const a=enemy('甲',0),b=enemy('乙',120,{aggro:true}),friend=enemy('丙',240,{ally:true}),hidden=enemy('隐匿',360,{hideT:1});
const c:any={game:{hero:{realm:1,stage:0},life:{sense:{x:0,y:0,R:1e6}},senseBurstT:0},units:[a,b,friend,hidden],lock:b,foe:{ultCharge:()=>0,ultFlash:0},texts:[]};
ctx.setTransform(.25,0,0,.25,400,300);
drawCombatUI(ctx,c,0,.25);assert.deepEqual(texts,['乙·筑基']);assert.ok(fonts[0].includes('48px'));assert.equal(arcs.length,3);assert.ok(fills.includes('#a82a22'));
// 中远景未锁定状态保留独立几何标记，但不显示任何名称或血条；不是组名 ×N。
texts.length=fills.length=arcs.length=0;c.lock=null;drawCombatUI(ctx,c,0,.25);assert.deepEqual(texts,[]);assert.ok(!fills.includes('#a82a22'));assert.equal(arcs.length,2);
// 大缩放远景(z<0.16)全缩放持续保留独立几何标记，按世界坐标邻域优先保留高威胁代表，同时仍仅锁定目标显示名牌与血条。
texts.length=fonts.length=fills.length=arcs.length=0;c.lock=b;ctx.setTransform(.02,0,0,.02,400,300);
drawCombatUI(ctx,c,0,.02);assert.deepEqual(texts,['乙·筑基']);assert.ok(fonts[0].includes('600px'));assert.equal(arcs.length,2);assert.ok(fills.includes('#a82a22'));
texts.length=fills.length=arcs.length=0;c.lock=null;drawCombatUI(ctx,c,0,.02);assert.deepEqual(texts,[]);assert.ok(!fills.includes('#a82a22'));assert.equal(arcs.length,0);
// 相距足够远（>12px 屏幕格）时，三个单位在 z=0.02 下各自独立绘出标记。
b.x=1000;friend.x=2000;arcs.length=0;drawCombatUI(ctx,c,0,.02);assert.equal(arcs.length,2);b.x=120;friend.x=240;
// 多个目标横跨旧网格边界时，无聚合文字和代表切换。
c.lock=b;for (let i=0;i<80;i++){a.x=i*15;b.x=10+i*10;friend.x=20+i*5;texts.length=0;drawCombatUI(ctx,c,i/60,.02);assert.deepEqual(texts,['乙·筑基']);}a.x=0;b.x=120;friend.x=240;
// 离开远景后所有可见对象显示姓名、境界，但只有锁定者出现血条。
texts.length=fills.length=arcs.length=0;c.lock=b;ctx.setTransform(.5,0,0,.5,400,300);drawCombatUI(ctx,c,0,.5);assert.deepEqual(texts,['甲·筑基','乙·筑基','丙·筑基']);assert.equal(fills.filter(v=>v==='#a82a22').length,1);
texts.length=fills.length=0;c.lock=null;drawCombatUI(ctx,c,0,.5);assert.equal(texts.length,3);assert.ok(!fills.includes('#a82a22'));
// 妖王屏幕血条也只能展示当前锁定、仍在场且精细可见的对象。
const boss:any=enemy('妖王',200,{blv:8,aggro:true}), otherBoss:any=enemy('妖王二',250,{blv:9,aggro:true});
const bg:any={player:{x:0,y:0},detailSenseRadius:800,senseBurstT:0,combat:{lock:null,enemies:[boss,otherBoss]}};
assert.equal(visibleLockedBoss(bg),null);bg.combat.lock=boss;assert.equal(visibleLockedBoss(bg),boss);boss.hideT=1;assert.equal(visibleLockedBoss(bg),null);boss.hideT=0;boss.x=1200;assert.equal(visibleLockedBoss(bg),null);boss.x=200;bg.combat.lock=otherBoss;assert.equal(visibleLockedBoss(bg),otherBoss);bg.combat.enemies=[boss];assert.equal(visibleLockedBoss(bg),null);
// 隐匿或离圈的锁定对象不可见，不泄露详情。
texts.length=0;c.lock=hidden;ctx.setTransform(.02,0,0,.02,400,300);drawCombatUI(ctx,c,0,.02);assert.deepEqual(texts,[]);
const near={x:100,y:100,def:{}}, closer={x:110,y:100,def:{}}, concealed={x:109,y:100,hideT:1,def:{}}, sneak={x:600,y:100,def:{hide:true}}, outside={x:1500,y:100,def:{}};
assert.equal(enemyAtPointer([near,closer,concealed],110,70,.02,0,0,1000,false),closer);
assert.equal(enemyAtPointer([sneak],600,70,.02,0,0,1000,false),null);assert.equal(enemyAtPointer([sneak],600,70,.02,0,0,1000,true),sneak);
assert.equal(enemyAtPointer([outside],1500,70,.02,0,0,1000,true),null);assert.equal(enemyAtPointer([near],100,70,NaN,0,0,1000,false),null);
const bossClick={x:100,y:100,boss:true,def:{}};assert.equal(enemyAtPointer([near,bossClick],100,70,.02,0,0,1000,false),bossClick);
assert.equal(enemyAtPointer([near,bossClick],100,70,.02,0,0,1000,false,near,true),bossClick);assert.equal(enemyAtPointer([near,bossClick],100,70,.02,0,0,1000,false,bossClick,true),near);
assert.equal(enemyAtPointer([near,concealed,outside],100,70,.02,0,0,1000,false,near,true),near);
console.log('far view: zoom hysteresis, independent relation markers, name/rank and locked-only details passed (Canvas2D)');
// 宏观摘要分帧处理，固定每条上限；无需访问装饰块。
const {FarGeometry}=await import('../src/world/farGeometry');
const realPath=(globalThis as any).Path2D;const made:any[]=[];
class FakePath {commands:any[]=[];constructor(){made.push(this)}moveTo(x:number,y:number){this.commands.push(['m',x,y])}lineTo(x:number,y:number){this.commands.push(['l',x,y])}}
(globalThis as any).Path2D=FakePath;
try {
 const long={pts:Array.from({length:10000},(_,i)=>[i,i] as [number,number])};
 const short={pts:[[0,0],[10,10]] as [number,number][]};
 const geo=new FarGeometry([long], [short], [short],2);assert.equal(geo.pending,true);geo.step(1);
 assert.equal(made[0].commands.length,64);assert.deepEqual(made[0].commands[0],['m',0,0]);assert.deepEqual(made[0].commands.at(-1),['l',19998,19998]);assert.equal(made[1].commands.length,0);assert.equal(geo.pending,true);
 geo.step(1);assert.equal(made[1].commands.length,2);assert.equal(geo.pending,true);geo.step(1);assert.equal(geo.pending,false);assert.equal(made[2].commands.length,2);geo.step();assert.equal(made[2].commands.length,2);
} finally {(globalThis as any).Path2D=realPath}
const v=createCanvas(120,120),vg:any=v.getContext('2d');const geo=new FarGeometry([], [{pts:[[10,50],[110,50]]}], [], 1);geo.step();geo.draw(vg,1);
assert.ok(vg.getImageData(60,50,1,1).data[3]>0);assert.equal(vg.getImageData(60,10,1,1).data[3],0);
vg.setTransform(0.05,0,0,0.05,0,0);const mountainGeo=new FarGeometry([{pts:[[10,20],[110,20]]}],[],[],1);mountainGeo.step();const oldStroke=vg.stroke.bind(vg),strokes:{width:number;alpha:number}[]=[];vg.stroke=(...args:any[])=>{strokes.push({width:vg.lineWidth,alpha:vg.globalAlpha});return oldStroke(...args)};
mountainGeo.draw(vg,0.05);const farWidth=strokes[0].width,farAlpha=strokes[0].alpha;mountainGeo.draw(vg,0.05);assert.equal(strokes[3].width,farWidth);assert.equal(strokes[3].alpha,farAlpha);assert.ok(Math.abs(farWidth*0.05-1.6)<1e-9);vg.stroke=oldStroke;
console.log('far geography: bounded incremental path sampling, endpoints, caching and actual Canvas line drawing passed');

// Real combat Canvas rendering observes the UI's per-game category without changing units.
const {setGuidanceFilter,clearGuidanceFilter}=await import('../src/world/guidanceFilter');
const beast=enemy('妖兽',40,{def:{kind:'beast'}});c.units=[a,beast];c.lock=null;
const selected=(type:string,actor:object)=>type==='enemy'&&actor===a;
for(const [category,expected] of [['全部',['甲·筑基','妖兽·筑基']],['修士',['甲·筑基']],['妖兽',['甲·筑基','妖兽·筑基']],['机缘',['甲·筑基']],['灵物',['甲·筑基']]] as const){
 setGuidanceFilter(c.game,category,selected);texts.length=0;drawCombatUI(ctx,c,0,.5);assert.deepEqual(texts,expected);assert.equal(c.units.length,2);
}
setGuidanceFilter(c.game,'机缘',()=>false);c.lock=beast;texts.length=0;drawCombatUI(ctx,c,0,.5);assert.deepEqual(texts,['妖兽·筑基']);
clearGuidanceFilter(c.game,selected); // different selection owner cannot clear current state
texts.length=0;c.lock=null;drawCombatUI(ctx,c,0,.5);assert.deepEqual(texts,[]);
console.log('inner category: actual combat Canvas labels, selection and lock exceptions, units retained passed');

// 神识内圈 16 个不同单位近景（z=0.5）均需完整显示头顶文字（不再在 10 个处截断）
setGuidanceFilter(c.game,'全部',()=>false);
c.units=Array.from({length:16},(_,i)=>enemy(`兽${i}`,i*30,{def:{kind:i%2?'beast':'human'}}));
c.lock=null;texts.length=0;ctx.setTransform(.5,0,0,.5,400,300);drawCombatUI(ctx,c,0,.5);
assert.equal(texts.length,16);
console.log('inner sense ring: all 16 units overhead labels drawn passed');
