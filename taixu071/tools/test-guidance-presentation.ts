import assert from 'node:assert/strict';
import {guidanceCandidates} from '../src/world/senseGuidance';
import {presentGuidance,guidanceText} from '../src/world/guidancePresentation';
const a:any={d:{alive:true,id:'a',canon:true,met:true,name:'熟识'},st:{x:1200,y:0}};
const b:any={d:{alive:true,id:'b',canon:true,met:false,name:'不可泄露'},st:{x:1300,y:0}};
const p:any={x:1400,y:0,pursuer:true,npcId:'p',def:{kind:'human'}};
const enemies:any[]=[p];for(let i=0;i<30;i++)enemies.push({x:1200+i*10,y:1500+i*40,def:{kind:'beast'}});
const c=guidanceCandidates(enemies,[a,b],0,0,100,5000,false);
const groups=presentGuidance(c,0,0,new Map([['p',{id:'p',met:false,name:'隐名'}]]));
assert.equal(groups[0].priority,1);assert.equal(groups.filter(g=>g.important).length,3);
assert.ok(groups.some(g=>g.label==='熟识'));assert.ok(!JSON.stringify(groups.map(g=>g.label)).includes('不可泄露'));assert.ok(!JSON.stringify(groups.map(g=>g.label)).includes('隐名'));
assert.equal(groups.reduce((n,g)=>n+g.members.length,0),c.length);
const normal=groups.find(g=>g.members.length>1)!;assert.match(guidanceText(normal,normal.members.map(x=>x.distance)),/道 · .*丈/);
const g2=presentGuidance(c,0,0,new Map([['p',{id:'p'}]]));assert.equal(groups.find(g=>g.label==='熟识')?.key,g2.find(g=>g.label==='熟识')?.key);
console.log('guidance presentation: all candidates retained, important independent, priority and known identities passed');
const {placeGuidanceBox}=await import('../src/world/guidancePresentation');
const first=placeGuidanceBox(300,300,150,24,800,600,[])!;
const second=placeGuidanceBox(300,300,150,24,800,600,[first])!;
assert.notEqual(first.y,second.y);
assert.ok(placeGuidanceBox(3,3,150,24,800,600,[])!.x>=4);

const crowded:any[]=[];
for(let sector=0;sector<8;sector++) for(let kind=0;kind<3;kind++) {
  const angle=sector*Math.PI/4, r=2000+kind*10;
  crowded.push({ref:{type:'extra',actor:{key:`${sector}:${kind}`,scope:{},point:{x:r*Math.cos(angle),y:r*Math.sin(angle)},valid:()=>true,kind:['灵物气息','机缘气息','奇遇气息'][kind]}},kind:['灵物气息','机缘气息','奇遇气息'][kind],hostile:false,x:r*Math.cos(angle),y:r*Math.sin(angle),distance:r});
}
const full=presentGuidance(crowded,0,0,new Map());assert.equal(full.length,24);assert.equal(full.flatMap(g=>g.members).length,24);
const {rankGuidance,guidanceMetadata}=await import('../src/world/guidancePresentation');
const ranked=rankGuidance(c,new Map([['p',{id:'p',met:false,name:'隐名'}]]));
assert.equal(ranked[0].ref.actor,p);
assert.equal(guidanceMetadata(ranked[0],new Map([['p',{id:'p',met:false,name:'隐名'}]])).label,'重要人物气息');
// A recognized task target must remain a separate important label even when other kinds share its direction.
const taskEnemy:any={x:1600,y:0,name:'已识别目标',def:{kind:'human'}};
const taskCandidate:any={ref:{type:'enemy',actor:taskEnemy},kind:'修士气息',hostile:false,x:1600,y:0,distance:1600};
const tg=presentGuidance([...c,taskCandidate],0,0,new Map(),new Set([taskEnemy]));
const taskGroup=tg.find(g=>g.members.some(m=>m.ref.actor===taskEnemy));
assert.equal(taskGroup?.priority,2);assert.equal(taskGroup?.label,'已识别目标');assert.equal(taskGroup?.members.length,1);
const {guidanceLabelMetrics}=await import('../src/world/guidancePresentation');
const wideLabel=guidanceLabelMetrics(180,800);assert.ok(wideLabel.width>=200);assert.equal(wideLabel.height,26);
const narrowLabel=guidanceLabelMetrics(180,150);assert.ok(narrowLabel.width<=126);assert.ok(narrowLabel.height>=42);
assert.deepEqual(guidanceLabelMetrics(NaN,800),{width:0,height:0});

const {guidanceDisplayLabel}=await import('../src/world/guidancePresentation');
for(const [internal,visible] of [['修士气息','修士'],['妖物气息','妖物'],['人影气息','修士'],['灵物气息','灵物'],['机缘气息','机缘'],['重要人物气息','重要人物']]) assert.equal(guidanceDisplayLabel(internal),visible);
