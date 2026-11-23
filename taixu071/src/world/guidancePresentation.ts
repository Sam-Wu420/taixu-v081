import type { GuidanceCandidate } from './senseGuidance';
import { REALMS } from '../data/realms';

export type GuidancePerson = { id?:string; name?:string; met?:boolean; canon?:boolean; beauty?:string; bond?:unknown; hunting?:boolean; chasing?:boolean };
export type PresentedGroup = {key:string; kind:string; hostile:boolean; priority:number; important:boolean; label:string; members:GuidanceCandidate[]};
const ids=new WeakMap<object,number>(); let next=0;
const NO_TASKS:ReadonlySet<object>=new Set();
function objectId(o:object) { let id=ids.get(o); if(!id){id=++next;ids.set(o,id);}return id; }
/** Classification never reveals the name of an unmet character. */
export function guidanceMetadata(c:GuidanceCandidate, people:ReadonlyMap<string,GuidancePerson>,taskTargets:ReadonlySet<object>=NO_TASKS):{important:boolean;priority:number;label:string} {
  let person:GuidancePerson|undefined, pursuer=false;
  if(c.ref.type==='npc') person=c.ref.actor.d as GuidancePerson;
  else if(c.ref.type==='enemy') {
    const enemy=c.ref.actor as typeof c.ref.actor & {npcId?:string;pursuer?:boolean;wing?:boolean;hunt?:boolean};
    person=enemy.npcId?people.get(enemy.npcId):undefined;
    pursuer=!!(enemy.pursuer||enemy.wing||enemy.hunt);
  }
  const task=taskTargets.has(c.ref.actor);
  const important=!!(task||pursuer||person?.canon||person?.beauty||person?.bond||person?.hunting||person?.chasing);
  const priority=pursuer||person?.hunting||person?.chasing?1:task?2:important?3:c.hostile?4:5;
  const knownTaskName=task&&c.ref.type==='enemy'?(c.ref.actor as typeof c.ref.actor & {name?:string}).name:undefined;
  return {important,priority,label:important?(person?.met&&person.name?person.name:knownTaskName||'重要人物气息'):c.kind};
}

/** Stable priority then approximate distance; no NPC identity is used as a tie-breaker. */
export function rankGuidance(candidates:readonly GuidanceCandidate[],people:ReadonlyMap<string,GuidancePerson>,taskTargets:ReadonlySet<object>=NO_TASKS):GuidanceCandidate[] {
  return [...candidates].sort((a,b)=>guidanceMetadata(a,people,taskTargets).priority-guidanceMetadata(b,people,taskTargets).priority||Math.floor(a.distance/100)-Math.floor(b.distance/100)||objectId(a.ref.actor)-objectId(b.ref.actor));
}

/** Identity is shown only after the player has met the NPC; importance never makes an unknown name visible. */
export function presentGuidance(candidates:readonly GuidanceCandidate[], x:number,y:number, people:ReadonlyMap<string,GuidancePerson>,taskTargets:ReadonlySet<object>=NO_TASKS):PresentedGroup[] {
  const groups=new Map<string,PresentedGroup>();
  for(const c of candidates) {
    const {important,priority,label}=guidanceMetadata(c,people,taskTargets);
    const sector=(Math.round(Math.atan2(c.y-y,c.x-x)/(Math.PI/4))+8)%8;
    const key=important?`person:${objectId(c.ref.actor)}`:`group:${c.kind}|${sector}|${c.hostile?1:0}`;
    let group=groups.get(key);
    if(!group){group={key,kind:c.kind,hostile:c.hostile,priority,important,label,members:[]};groups.set(key,group);}
    group.members.push(c);
  }
  for(const g of groups.values()) g.members.sort((a,b)=>a.distance-b.distance);
  return [...groups.values()].sort((a,b)=>a.priority-b.priority||Math.floor(a.members[0].distance/100)-Math.floor(b.members[0].distance/100)||a.key.localeCompare(b.key));
}
/** Only summarize currently perceptible members; never invent a rank for an unknown one. */
export function guidanceRealmSummary(members:readonly GuidanceCandidate[]):string {
  if(!members.length||members.some(c=>c.ref.type==='extra'))return '';
  const beast=members.every(c=>c.ref.type==='enemy'&&c.kind==='妖物气息');
  const ranks:number[]=[];let unknown=false;
  for(const c of members){
    const actor=c.ref.actor as any;
    const value=beast?actor.blv:(c.ref.type==='npc'?actor.d?.realm:actor.realm);
    if(!Number.isInteger(value)||(beast?(value<1||value>10):!REALMS[value]))unknown=true;
    else ranks.push(value);
  }
  if(!ranks.length)return '未知';
  let min=Infinity,max=-Infinity;for(const rank of ranks){min=Math.min(min,rank);max=Math.max(max,rank);}
  const display=beast?(min===max?`${min}级`:`${min}—${max}级`):(min===max?REALMS[min].name:`${REALMS[min].name}—${REALMS[max].name}`);
  return `${display}${unknown?'及未知':''}`;
}
/** Strip the generic suffix only for presentation; internal category keys remain unchanged. */
export function guidanceDisplayLabel(label:string):string {
  return label==='人影气息'?'修士':label.endsWith('气息')?label.slice(0,-2):label;
}
export function guidanceText(g:PresentedGroup, distances:readonly number[],members:readonly GuidanceCandidate[]=g.members):string {
  if(!distances.length)return '';
  let lo=Infinity,hi=0;for(const d of distances){lo=Math.min(lo,d);hi=Math.max(hi,d);}
  const min=Math.max(1,Math.round(lo/30)),max=Math.max(1,Math.round(hi/30));
  const realm=guidanceRealmSummary(members);
  return `${guidanceDisplayLabel(g.label)}${distances.length>1?` ${distances.length}道`:''}${realm?` · ${realm}`:''} · ${min===max?`${min}`:`${min}—${max}`}丈${g.hostile?' · 敌意':''}`;
}

export type GuidanceBox={x:number;y:number;w:number;h:number};
/** Place text near its true anchor. The caller draws a connector whenever displaced. */
export function placeGuidanceBox(x:number,y:number,w:number,h:number,width:number,height:number,occupied:readonly GuidanceBox[],force=false):GuidanceBox|null {
  const offsets=[[0,0],[0,-30],[0,30],[0,-60],[0,60],[-95,0],[95,0],[-95,-30],[95,-30],[-95,30],[95,30],[0,-90],[0,90]];
  for(const [dx,dy] of offsets) {
    const bx=Math.max(4,Math.min(width-w-4,x-w/2+dx)), by=Math.max(4,Math.min(height-h-4,y-h/2+dy));
    const box={x:bx,y:by,w,h};
    if(!occupied.some(o=>box.x<o.x+o.w+4&&box.x+box.w+4>o.x&&box.y<o.y+o.h+4&&box.y+box.h+4>o.y))return box;
  }
  return force?{x:Math.max(4,Math.min(width-w-4,x-w/2)),y:Math.max(4,Math.min(height-h-4,y-h/2)),w,h}:null;
}

/** Bounded, quantized size for the small direction label; narrow displays wrap instead of truncating. */
export function guidanceLabelMetrics(measuredWidth:number,viewportWidth:number):{width:number;height:number} {
  if(!Number.isFinite(measuredWidth)||!Number.isFinite(viewportWidth)||viewportWidth<=0)return {width:0,height:0};
  const usable=Math.max(1,viewportWidth-24), maxWidth=Math.min(260,usable);
  const width=Math.min(maxWidth,Math.max(Math.min(88,maxWidth),Math.ceil((Math.max(0,measuredWidth)+20)/8)*8));
  const lines=Math.max(1,Math.ceil(Math.max(0,measuredWidth)/Math.max(1,width-20)));
  return {width,height:lines*16+10};
}
