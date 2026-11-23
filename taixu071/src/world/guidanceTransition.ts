import { guidancePosition, type GuidanceActor, type GuidanceNpc } from './senseGuidance';
import { enemyPerceptibility, type EnemyLike } from './senseSignals';

type Person={id?:string;alive?:boolean;hidden?:boolean};
type CombatActor=EnemyLike & {npcId?:string;spar?:boolean};
type LinkedNpc=GuidanceNpc & {d:Person;enemy?:CombatActor};
/** Only follow a proven live NPC-to-combat link, or the same NPC data after that combat actor is removed.
 * No migration on death, concealment, replacement save, unlinked matching IDs, or imperceptibility. */
export function guidanceTransition(ref:GuidanceActor, person:Person|null, activeById:ReadonlyMap<string,LinkedNpc>, enemies:ReadonlySet<EnemyLike>, x:number,y:number,outer:number,burst:boolean):GuidanceActor|null {
  if(!person?.id||!person.alive||person.hidden)return null;
  const active=activeById.get(person.id);
  if(!active || active.d!==person)return null;
  let next:GuidanceActor;
  if(ref.type==='npc') {
    if(ref.actor!==active || !active.enemy || active.enemy.npcId!==person.id || !enemies.has(active.enemy))return null;
    next={type:'enemy',actor:active.enemy};
  } else if(ref.type==='enemy') {
    const old=ref.actor as CombatActor;
    if(old.npcId!==person.id||enemies.has(old)||(old.dead&&!old.spar)||(old.gone&&!old.spar)||(old.hideT??0)>0||old.affix?.yinOn||active.enemy)return null;
    next={type:'npc',actor:active};
  } else return null;
  return guidancePosition(next,enemies,new Set([active]),x,y,outer,burst)?next:null;
}

/** Spar/release temporarily marks a living NPC's combat shell dead. Keep only an invisible, bounded handoff. */
export function guidancePendingReturn(ref:GuidanceActor,person:Person|null,activeById:ReadonlyMap<string,LinkedNpc>,x:number,y:number,outer:number,burst:boolean):boolean {
  if(ref.type!=='enemy'||!person?.id||!person.alive||person.hidden)return false;
  const e=ref.actor as CombatActor, active=activeById.get(person.id);
  if(!active||active.d!==person||active.enemy!==e||e.npcId!==person.id||!e.dead||!e.spar||(e.gone&&!e.spar)||(e.hideT??0)>0||e.affix?.yinOn||(e.def?.hide&&!e.aggro&&!burst))return false;
  return enemyPerceptibility({ ...e, gone: false },x,y,outer,burst,true)>.05;
}
