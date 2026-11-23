import type { GuidanceActor, GuidanceCandidate } from './senseGuidance';
export type TrackedPosition = {x:number;y:number;distance:number};
export function sameGuidanceActor(a:GuidanceActor,b:GuidanceActor):boolean {
  return a.type===b.type&&(a.type==='extra'&&b.type==='extra'?a.actor.scope===b.actor.scope&&a.actor.key===b.actor.key:a.actor===b.actor);
}
/** Snapshot the clicked discovered-object group, not later unrelated signals in that sector. */
export function snapshotGuidanceExtras(members:readonly GuidanceCandidate[],position:(r:GuidanceActor)=>TrackedPosition|null,inner:number):GuidanceActor[] {
  const refs:GuidanceActor[]=[],seen=new Map<object,Set<string>>();
  for(const c of members) {
    if(c.ref.type!=='extra')continue;
    const {scope,key}=c.ref.actor;let keys=seen.get(scope);if(keys?.has(key))continue;
    const p=position(c.ref);if(p&&p.distance>inner){refs.push(c.ref);if(!keys){keys=new Set();seen.set(scope,keys);}keys.add(key);}
  }
  return refs;
}
/** Snapshot ordinary grouped actors; important people remain independent in presentation. */
export function snapshotGuidanceActors(members:readonly GuidanceCandidate[],position:(r:GuidanceActor)=>TrackedPosition|null,inner:number):GuidanceActor[] {
  const refs:GuidanceActor[]=[],seen=new Set<object>();
  for(const c of members){if(c.ref.type==='extra'||seen.has(c.ref.actor))continue;const p=position(c.ref);if(p&&p.distance>inner){refs.push(c.ref);seen.add(c.ref.actor);}}
  return refs;
}
export function guidanceExtraIndex(refs:readonly GuidanceActor[]):Map<object,Set<string>> {
  const index=new Map<object,Set<string>>();
  for(const ref of refs)if(ref.type==='extra'){let keys=index.get(ref.actor.scope);if(!keys){keys=new Set();index.set(ref.actor.scope,keys);}keys.add(ref.actor.key);}
  return index;
}
/** Drops invalid/out-of-sense references immediately; never silently follows a replacement. */
export function validGuidanceTargets(refs:readonly GuidanceActor[],position:(r:GuidanceActor)=>TrackedPosition|null):{ref:GuidanceActor;position:TrackedPosition}[] {
  const out:{ref:GuidanceActor;position:TrackedPosition}[]=[];
  for(const ref of refs){const p=position(ref);if(p)out.push({ref,position:p});}
  return out;
}
export function guidanceExtraHeight(ref:GuidanceActor):number {
  if(ref.type!=='extra')return 0;
  if(Number.isFinite(ref.actor.markerHeight)&&ref.actor.markerHeight!>=0)return ref.actor.markerHeight!;
  return ref.actor.kind==='灵物气息'?75:ref.actor.kind==='机缘气息'?180:110;
}
