import { ACTIVE_MAP } from '../data/world';
import type { Game } from './game';
/** Only an accepted, unexpired bounty already recognized in the detail circle becomes a task target. */
export function guidanceTaskTargets(game:Game):Set<object> {
  const ids=new Set((game.ws.bounties??[]).filter(b=>!b.done&&b.spawned&&b.map===ACTIVE_MAP&&b.until>=game.day).map(b=>b.id));
  const result=new Set<object>();
  for(const e of game.combat.enemies) if(e.tag?.startsWith('bounty:') && ids.has(e.tag.slice(7)) && game.happen.isBountyRecognized(e))result.add(e);
  return result;
}
