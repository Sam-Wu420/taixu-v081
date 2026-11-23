import assert from 'node:assert/strict';
import {guidanceCandidates,groupGuidance,guidanceAnchor,guidancePosition,guidanceBearing,guidanceDistance,layoutGuidancePanels,guidanceCircleOverlap} from '../src/world/senseGuidance';
const a:any={x:1300,y:300,aggro:true,def:{kind:'human'}}, b:any={x:1500,y:320,aggro:true,def:{kind:'human'}}, hidden:any={x:1400,y:0,hideT:1}, yin:any={x:1300,y:0,affix:{yinOn:true}}, npc:any={st:{x:-1300,y:20},d:{alive:true}};
let c=guidanceCandidates([a,b,hidden,yin], [npc],0,0,1000,2000,false);
assert.equal(c.length,3); assert.equal(c[0].ref.actor,a);
let groups=groupGuidance(c,0,0);assert.equal(groups.length,2);assert.equal(groups[0].members.length,2);assert.equal(groups[0].members[0].ref.actor,a);
a.x=900;assert.equal(guidanceCandidates([a],[npc],0,0,1000,2000,false).length,1);
assert.equal(guidanceCandidates([a],[],0,0,2000,2000,false).length,0);
const anchor=guidanceAnchor(0,0,1300,300,100,0,0,1,800,600)!;
assert.ok(Math.abs(Math.hypot(anchor.x-400,anchor.y-300)-100)<1e-8);
assert.ok(Math.abs((anchor.y-300)/(anchor.x-400)-300/1300)<1e-8);assert.equal(anchor.clipped,false);
const edge=guidanceAnchor(0,0,1300,300,1000,0,0,1,800,600)!;assert.equal(edge.clipped,true);assert.ok(Math.abs(edge.x-776)<1e-8);assert.ok(Math.abs((edge.y-300)/(edge.x-400)-300/1300)<1e-8);
assert.equal(guidanceAnchor(0,0,0,0,100,0,0,1,800,600),null);
assert.equal(guidanceAnchor(0,0,1,0,100,2000,0,1,800,600),null);

// A retained target is never redirected to a replacement and disappears as soon as it becomes imperceptible.
a.x=1300; const ref={type:'enemy' as const,actor:a};
assert.equal(guidancePosition(ref,new Set([a,b]),new Set(),0,0,2000,false)?.x,1300);
a.hideT=1; assert.equal(guidancePosition(ref,new Set([a,b]),new Set(),0,0,2000,false),null); delete a.hideT;
assert.equal(guidancePosition(ref,new Set([b]),new Set(),0,0,2000,false),null);
a.x=900; assert.equal(guidancePosition(ref,new Set([a]),new Set(),0,0,2000,false)?.distance,Math.hypot(900,300));
const nr={type:'npc' as const,actor:npc}; const active=new Set<object>([npc]);
assert.ok(guidancePosition(nr,new Set(),active,0,0,2000,false));npc.d.hidden=true;
assert.equal(guidancePosition(nr,new Set(),active,0,0,2000,false),null);
assert.equal(guidanceCandidates([], [npc],0,0,1000,2000,false).length,0);
npc.d.hidden=false;assert.equal(guidancePosition(nr,new Set(),new Set(),0,0,2000,false),null);

// Every perceptible object survives directional grouping; there is no visible-count limit.
const many=Array.from({length:97},(_,i)=>{
  const angle=i*Math.PI*2/97,distance=1100+(i%9)*20;
  return {ref:{type:'extra' as const,actor:{key:String(i),scope:{},point:{x:0,y:0},valid:()=>true,kind:'灵物气息' as const}},kind:i%3===0?'灵物气息':i%3===1?'人影气息':'修士气息',hostile:i%11===0,x:Math.cos(angle)*distance,y:Math.sin(angle)*distance,distance};
});
const allGroups=groupGuidance(many,0,0);
assert.equal(allGroups.reduce((n,g)=>n+g.members.length,0),97);
assert.equal(new Set(allGroups.flatMap(g=>g.members)).size,97);
assert.ok(allGroups.length<=8);assert.equal(new Set(allGroups.map(g=>g.sector)).size,allGroups.length);
assert.deepEqual(guidanceBearing(100,-100,0,0),{sector:7,direction:'东北',arrow:'↗'});
assert.equal(guidanceDistance(1500),'约 50 丈');assert.equal(guidanceDistance(0),'约 1 丈');

// Direction panels are laid out independently of their true pins, stay in the safe area, and scroll rather than drop rows.
const panelInputs=Array.from({length:8},(_,sector)=>({sector,x:400+Math.cos(sector*Math.PI/4)*140,y:300+Math.sin(sector*Math.PI/4)*140,rows:sector===0?12:2}));
const panels=layoutGuidancePanels(panelInputs,800,600,{top:70,bottom:80,left:12,right:12,rowHeight:34,maxRows:5,panelWidth:178});
assert.equal(panels.length,8);assert.equal(panels.find(p=>p.sector===0)?.scroll,true);
for(const panel of panels){assert.ok(panel.x>=12&&panel.x+panel.width<=788);assert.ok(panel.y>=70&&panel.y+panel.height<=520);}
for(let i=0;i<panels.length;i++)for(let j=i+1;j<panels.length;j++){
  const a=panels[i],b=panels[j];assert.ok(!(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y),`panels ${a.sector}/${b.sector} overlap`);
}
const dense=layoutGuidancePanels(Array.from({length:8},(_,sector)=>({sector,x:400,y:300,rows:30})),800,600,{top:70,bottom:80,left:12,right:12,maxRows:5});
assert.equal(dense.length,8);assert.ok(dense.every(p=>p.scroll));
assert.deepEqual(layoutGuidancePanels(panelInputs,0,600),[]);
const avoided=layoutGuidancePanels([{sector:7,x:610,y:110,rows:3}],800,600,{top:12,bottom:12,left:12,right:12,panelWidth:178,obstacles:[{x:600,y:12,width:188,height:220}]});
assert.equal(avoided.length,1);const obstacle={x:600,y:12,width:188,height:220},card=avoided[0];
assert.ok(!(card.x<obstacle.x+obstacle.width&&card.x+card.width>obstacle.x&&card.y<obstacle.y+obstacle.height&&card.y+card.height>obstacle.y));

console.log('sense guidance: complete default rows, distance, safe panel layout, retained targets and clipped rays passed');
// Important cards receive layout space before ordinary cards at the same anchor.
const prioritized=layoutGuidancePanels([{sector:1,x:400,y:300,rows:1,priority:5},{sector:101,x:400,y:300,rows:1,priority:1}],800,600,{top:0,bottom:0});
assert.equal(prioritized[0].sector,101);
const sizes=layoutGuidancePanels([{sector:1,x:300,y:250,rows:1,width:90,height:26},{sector:2,x:300,y:250,rows:1,width:210,height:42}],800,600,{top:0,bottom:0});
assert.equal(sizes.find(x=>x.sector===1)?.width,90);assert.equal(sizes.find(x=>x.sector===2)?.height,42);
assert.ok(!(sizes[0].x<sizes[1].x+sizes[1].width&&sizes[0].x+sizes[0].width>sizes[1].x&&sizes[0].y<sizes[1].y+sizes[1].height&&sizes[0].y+sizes[0].height>sizes[1].y));
// Dense labels still retain every entry and respect per-label sizes, including important first.
const denseLabels=Array.from({length:80},(_,i)=>({sector:1000+i,x:640+250*Math.cos(i*Math.PI/40),y:360+250*Math.sin(i*Math.PI/40),rows:1,width:88+(i%4)*32,height:i%5===0?42:26,priority:i<10?1:5}));
const denseLabelsOut=layoutGuidancePanels(denseLabels,1280,720,{top:12,bottom:12,left:12,right:12});
assert.equal(denseLabelsOut.length,denseLabels.length);assert.equal(new Set(denseLabelsOut.map(p=>p.sector)).size,80);
assert.ok(denseLabelsOut.slice(0,10).every(p=>p.sector<1010));
assert.ok(denseLabelsOut.every(p=>p.x>=12&&p.y>=12&&p.x+p.width<=1268&&p.y+p.height<=708));
// Crowd the south-east edge; text must favour overlap with other labels over the inner circle.
const circle={x:400,y:300,radius:180};
const circular=layoutGuidancePanels(Array.from({length:12},(_,i)=>({sector:i,x:400+180/Math.sqrt(2),y:300+180/Math.sqrt(2),rows:1,width:150,height:26})),800,600,{top:12,bottom:12,left:12,right:12,circle});
assert.equal(circular.length,12);
for(const b of circular)assert.equal(guidanceCircleOverlap(b,circle),0,'circle-exterior space exists even if labels overlap');
const clipped=layoutGuidancePanels([{sector:1,x:760,y:300,rows:1,width:170,height:26}],800,600,{circle:{x:400,y:300,radius:1200}});assert.equal(clipped.length,1,'when no exterior space exists retain a best-effort label');
