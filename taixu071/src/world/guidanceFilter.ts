import type { GuidanceCategory } from '../ui/guidanceSettings';

type Selection=(type:'enemy'|'npc'|'node',actor:object)=>boolean;
type Filter={category:GuidanceCategory;selected:Selection};
const filters=new WeakMap<object,Filter>();
/** UI state is scoped to its actual game instance, not shared across games or saves. */
export function setGuidanceFilter(game:object,category:GuidanceCategory,selected:Selection) {filters.set(game,{category,selected});}
export function clearGuidanceFilter(game:object,selected:Selection) {if(filters.get(game)?.selected===selected)filters.delete(game);}
export function guidanceInfoVisible(game:object,category:Exclude<GuidanceCategory,'全部'>,type?:'enemy'|'npc'|'node',actor?:object):boolean {
  const scene=game as {inCave?:boolean;mijing?:{active?:boolean}};
  if(scene.inCave||scene.mijing?.active)return true;
  const filter=filters.get(game);
  return !filter||filter.category==='全部'||filter.category===category||!!(type&&actor&&filter.selected(type,actor));
}
