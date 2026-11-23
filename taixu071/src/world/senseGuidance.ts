import { enemyPerceptibility, type EnemyLike } from './senseSignals';

/** Internal references never become public identity information. */
export type GuidanceActor = { type:'enemy'; actor:EnemyLike } | { type:'npc'; actor:GuidanceNpc } | { type:'extra'; actor:GuidanceExtra };
export type GuidanceExtra = { key:string; scope:object; point:{x:number;y:number}; markerHeight?:number; valid:()=>boolean; kind:'灵物气息'|'机缘气息'|'奇遇气息' };
export type GuidanceNpc = { enemy?:unknown; st:{x:number;y:number}; d:{alive?:boolean;hidden?:boolean}; act?:string };
export type GuidanceCandidate = { ref:GuidanceActor; kind:string; hostile:boolean; x:number; y:number; distance:number };
/** One panel per actual direction. Every candidate remains a separate, readable row. */
export type GuidanceGroup = { sector:number; members:GuidanceCandidate[] };

/** Mirrors the world's existing discovery restrictions; does not create entities. */
export function guidanceCandidates(enemies:readonly EnemyLike[], npcs:Iterable<GuidanceNpc>, x:number, y:number, inner:number, outer:number, burst:boolean, extras:readonly GuidanceExtra[]=[]):GuidanceCandidate[] {
  if (![x,y,inner,outer].every(Number.isFinite) || inner < 0 || outer <= inner) return [];
  const result:GuidanceCandidate[]=[];
  for (const e of enemies) {
    if(e.dead||e.gone||e.ally||(e.hideT??0)>0||e.affix?.yinOn||(e.def?.hide&&!e.aggro&&!burst)||!Number.isFinite(e.x)||!Number.isFinite(e.y)) continue;
    const distance=Math.hypot(e.x-x,e.y-y);
    if(distance<=inner||distance>outer||enemyPerceptibility(e,x,y,outer,burst)<=.05) continue;
    result.push({ref:{type:'enemy',actor:e},kind:e.def?.kind==='human'?'修士气息':'妖物气息',hostile:!!e.aggro,x:e.x,y:e.y,distance});
  }
  for(const n of npcs) {
    if(n.enemy||!n.d.alive||n.d.hidden||n.act==='follow'||!Number.isFinite(n.st.x)||!Number.isFinite(n.st.y)) continue;
    const distance=Math.hypot(n.st.x-x,n.st.y-y);
    if(distance<=inner||distance>outer) continue;
    result.push({ref:{type:'npc',actor:n},kind:'人影气息',hostile:false,x:n.st.x,y:n.st.y,distance});
  }
  for(const extra of extras) {
    const {x:tx,y:ty}=extra.point;
    if(!Number.isFinite(tx)||!Number.isFinite(ty)||!extra.valid()) continue;
    const distance=Math.hypot(tx-x,ty-y);
    if(distance<=inner||distance>outer)continue;
    result.push({ref:{type:'extra',actor:extra},kind:extra.kind,hostile:false,x:tx,y:ty,distance});
  }
  return result;
}

/** Validate a retained reference every frame, including membership and current visibility. */
export function guidancePosition(ref:GuidanceActor, enemies:ReadonlySet<EnemyLike>, activeNpcs:ReadonlySet<object>, x:number,y:number,outer:number,burst:boolean):{x:number;y:number;distance:number}|null {
  if(![x,y,outer].every(Number.isFinite)||outer<=0) return null;
  let tx:number,ty:number;
  if(ref.type==='enemy') {
    const e=ref.actor;
    if(!enemies.has(e)||e.dead||e.gone||e.ally||(e.hideT??0)>0||e.affix?.yinOn||(e.def?.hide&&!e.aggro&&!burst)||enemyPerceptibility(e,x,y,outer,burst)<=.05) return null;
    tx=e.x;ty=e.y;
  } else if(ref.type==='npc') {
    const n=ref.actor;
    if(!activeNpcs.has(n)||!n.d.alive||n.d.hidden||n.enemy||n.act==='follow') return null;
    tx=n.st.x;ty=n.st.y;
  } else {
    if(!ref.actor.valid())return null;
    tx=ref.actor.point.x;ty=ref.actor.point.y;
  }
  if(!Number.isFinite(tx)||!Number.isFinite(ty))return null;
  const distance=Math.hypot(tx-x,ty-y);
  return distance<=outer?{x:tx,y:ty,distance}:null;
}

const DIRECTIONS=['东','东南','南','西南','西','西北','北','东北'] as const;
const ARROWS=['→','↘','↓','↙','←','↖','↑','↗'] as const;
export function guidanceSector(x:number,y:number):number {
  return (Math.round(Math.atan2(y,x)/(Math.PI/4))+8)%8;
}
export function guidanceBearing(targetX:number,targetY:number,playerX:number,playerY:number):{sector:number;direction:string;arrow:string} {
  const sector=guidanceSector(targetX-playerX,targetY-playerY);
  return {sector,direction:DIRECTIONS[sector],arrow:ARROWS[sector]};
}
export function guidanceDistance(distance:number):string {
  return Number.isFinite(distance)&&distance>=0?`约 ${Math.max(1,Math.round(distance/30))} 丈`:'距离未知';
}

/** No count-only aggregation and no arbitrary eight-group/twenty-group truncation. */
export function groupGuidance(candidates:readonly GuidanceCandidate[], x:number, y:number):GuidanceGroup[] {
  const groups=new Map<number,GuidanceGroup>();
  for(const c of candidates) {
    const sector=guidanceSector(c.x-x,c.y-y);
    let group=groups.get(sector);
    if(!group) { group={sector,members:[]}; groups.set(sector,group); }
    group.members.push(c);
  }
  // The nearest real target owns the direction pin until a row is hovered/focused.
  for(const group of groups.values()) group.members.sort((a,b)=>a.distance-b.distance||Number(b.hostile)-Number(a.hostile));
  return [...groups.values()].sort((a,b)=>a.sector-b.sector);
}

export type GuidancePanelInput={sector:number;x:number;y:number;rows:number;priority?:number;width?:number;height?:number};
export type GuidancePanelPlacement={sector:number;x:number;y:number;width:number;height:number;scroll:boolean};
export type GuidanceLayoutObstacle={x:number;y:number;width:number;height:number};
export type GuidanceLayoutOptions={top?:number;right?:number;bottom?:number;left?:number;rowHeight?:number;maxRows?:number;panelWidth?:number;obstacles?:readonly GuidanceLayoutObstacle[];circle?:{x:number;y:number;radius:number}};
/** Depth of rectangle inside the detail circle; zero means fully outside or tangent. */
export function guidanceCircleOverlap(box:{x:number;y:number;width:number;height:number},circle:{x:number;y:number;radius:number}):number {
  if(![box.x,box.y,box.width,box.height,circle.x,circle.y,circle.radius].every(Number.isFinite)||circle.radius<=0)return 0;
  const x=Math.max(box.x,Math.min(box.x+box.width,circle.x));
  const y=Math.max(box.y,Math.min(box.y+box.height,circle.y));
  return Math.max(0,circle.radius-Math.hypot(x-circle.x,y-circle.y));
}
/** Keep at most eight direction panels inside a safe rectangle. Rows scroll; targets are never culled for space. */
export function layoutGuidancePanels(inputs:readonly GuidancePanelInput[],width:number,height:number,options:GuidanceLayoutOptions={}):GuidancePanelPlacement[] {
  if(![width,height].every(Number.isFinite)||width<=0||height<=0)return [];
  const left=Math.max(0,options.left??12),top=Math.max(0,options.top??64);
  const right=Math.max(left+1,width-Math.max(0,options.right??12)),bottom=Math.max(top+1,height-Math.max(0,options.bottom??72));
  const availableW=right-left,availableH=bottom-top;
  if(availableW<40||availableH<24)return [];
  const panelWidth=Math.min(options.panelWidth??178,availableW);
  const rowHeight=Math.max(28,Math.min(48,options.rowHeight??34));
  const maxRows=Math.max(1,Math.min(8,Math.floor(options.maxRows??5)));
  const placed:GuidancePanelPlacement[]=[];
  const obstacles=(options.obstacles??[]).filter(r=>[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0);
  const blockers:GuidanceLayoutObstacle[]=[...obstacles];
  for(const input of [...inputs].sort((a,b)=>(a.priority??5)-(b.priority??5)||a.sector-b.sector)) {
    const rows=Math.max(1,Number.isFinite(input.rows)?Math.floor(input.rows):1);
    const desiredHeight=Number.isFinite(input.height)&&input.height!>0?input.height!:Math.min(rows,maxRows)*rowHeight+8;
    const h=Math.max(20,Math.min(desiredHeight,availableH));
    const w=Number.isFinite(input.width)&&input.width!>0?Math.min(input.width!,availableW):panelWidth;
    const outward=input.x>=width/2?input.x+18:input.x-w-18;
    const inward=input.x>=width/2?input.x-w-18:input.x+18;
    const fits=(x:number)=>x>=left&&x+w<=right;
    const primary=Math.max(left,Math.min(right-w,fits(outward)?outward:inward));
    const alternate=Math.max(left,Math.min(right-w,fits(outward)?inward:outward));
    const desiredY=Math.max(top,Math.min(bottom-h,input.y-h/2));
    const xs=Math.abs(primary-alternate)<1?[primary]:[primary,alternate];
    let best={x:primary,y:desiredY,score:Infinity};
    const step=Math.max(10,rowHeight/2);
    const maxK=Math.ceil(availableH/step);
    search:for(let xi=0;xi<xs.length;xi++) {
      const bx=xs[xi];
      // 按列预筛 X 轴可能相交的障碍物，避免内层 Y 循环重复全量遍历
      const colBlockers:GuidanceLayoutObstacle[]=[];
      for(let bi=0;bi<blockers.length;bi++){const r=blockers[bi];if(bx<r.x+r.width+5&&bx+w+5>r.x)colBlockers.push(r);}
      for(let k=0;k<=maxK;k++) {
        for(const sign of k===0?[0]:[-1,1]) {
          const y=desiredY+sign*k*step;
          if(y<top-1e-6||y+h>bottom+1e-6)continue;
          let area=0;
          for(let bi=0;bi<colBlockers.length;bi++){
            const r=colBlockers[bi];
            if(y<r.y+r.height+5&&y+h+5>r.y){
              const ow=Math.min(bx+w,r.x+r.width)-Math.max(bx,r.x),oh=Math.min(y+h,r.y+r.height)-Math.max(y,r.y);
              area+=Math.max(0,ow)*Math.max(0,oh);
            }
          }
          const intrusion=options.circle?guidanceCircleOverlap({x:bx,y,width:w,height:h},options.circle):0;
          // Overlap other labels before pushing text into the detail circle. When the
          // entire viewport is inside it, minimise intrusion rather than hiding text.
          const score=(intrusion>0?1e12+intrusion*1e8:0)+area*10000+Math.abs(y-desiredY)+xi*24;
          if(score<best.score)best={x:bx,y,score};
          if(best.score===0)break search;
        }
      }
    }
    const placement={sector:input.sector,x:best.x,y:best.y,width:w,height:h,scroll:rows>maxRows||desiredHeight>h};
    placed.push(placement);blockers.push(placement);
  }
  return placed;
}

/** Player-to-target ray intersection with the detail circle, clipped along the SAME ray to the viewport safe rectangle. */
export function guidanceAnchor(playerX:number,playerY:number,targetX:number,targetY:number,radius:number,camX:number,camY:number,zoom:number,width:number,height:number,margin=24):{x:number;y:number;clipped:boolean}|null {
  if(![playerX,playerY,targetX,targetY,radius,camX,camY,zoom,width,height,margin].every(Number.isFinite)||radius<=0||zoom<=0||width<=0||height<=0) return null;
  const dx=targetX-playerX,dy=targetY-playerY,d=Math.hypot(dx,dy);
  if(d===0) return null;
  const px=width/2+(playerX-camX)*zoom,py=height/2+(playerY-camY)*zoom;
  const ux=dx/d,uy=dy/d, r=radius*zoom;
  const m=Math.max(0,Math.min(margin,width/2,height/2));
  // Slab intersection works even when camera movement puts the player off screen.
  let lo=0,hi=r;
  for(const [p,u,min,max] of [[px,ux,m,width-m],[py,uy,m,height-m]] as const) {
    if(Math.abs(u)<1e-12) { if(p<min||p>max) return null; continue; }
    const a=(min-p)/u,b=(max-p)/u;
    lo=Math.max(lo,Math.min(a,b)); hi=Math.min(hi,Math.max(a,b));
  }
  if(lo>hi||hi<0) return null;
  return {x:px+ux*hi,y:py+uy*hi,clipped:hi<r-1e-6};
}
