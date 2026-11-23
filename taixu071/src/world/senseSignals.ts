/** 外圈只输出粗略气息，不输出姓名、血量或具体坐标。 */
export type EnemyLike = { x:number; y:number; dead?:boolean; gone?:boolean; ally?:boolean; hideT?:number; aggro?:boolean; def?:{kind?:string;hide?:boolean}; affix?:{yinOn?:boolean} };
/** 与实体绘制一致的隐匿及边缘淡出规则；可供地图、点击和探察共用。 */
export function enemyPerceptibility(e: EnemyLike, x:number, y:number, radius:number, burst:boolean, includeDead=false): number {
  if ((!includeDead && e.dead) || e.gone || (e.hideT ?? 0) > 0 || ![x,y,radius,e.x,e.y].every(Number.isFinite) || radius <= 0) return 0;
  const r=e.def?.hide&&!e.aggro&&!burst ? radius*.45 : radius;
  return Math.max(0,Math.min(1,(r-Math.hypot(e.x-x,e.y-y))/110)) * (e.affix?.yinOn ? .18 : 1);
}
/** 精细观察用于实体身份信息；与生成半径及外圈气息分离。 */
export function preciseActorVisible(game: {player:{x:number;y:number};detailSenseRadius:number;senseBurstT:number}, actor: EnemyLike, includeDead = false): boolean {
  return enemyPerceptibility(actor, game.player.x, game.player.y, game.detailSenseRadius, game.senseBurstT > 0, includeDead) > 0.05;
}
/** 妖王 HUD 只能展示当前锁定且仍可精细观察的妖王。 */
export function visibleLockedBoss<T extends EnemyLike & {blv?:number}>(game: {player:{x:number;y:number};detailSenseRadius:number;senseBurstT:number;combat:{lock:T | null;enemies:readonly T[]}}): T | null {
  const e = game.combat.lock;
  return e && (e.blv ?? 0) >= 8 && game.combat.enemies.includes(e) && preciseActorVisible(game, e) ? e : null;
}
type NpcLike = { enemy?:unknown; st:{x:number;y:number}; d:{alive?:boolean;hidden?:boolean}; act?:string };
export interface SenseSignal { kind: string; direction: string; count: number; distance: number; hostile: boolean }
export function senseSignals(enemies: readonly EnemyLike[], npcs: Iterable<NpcLike>, x:number, y:number, inner:number, outer:number, burst:boolean, limit=5, extras: readonly {x:number;y:number;kind:'灵物气息'|'机缘气息'|'奇遇气息'}[] = []): SenseSignal[] {
  if (![x,y,inner,outer].every(Number.isFinite) || inner < 0 || outer <= inner) return [];
  const dirs=['东','东南','南','西南','西','西北','北','东北'];
  const groups = new Map<string,SenseSignal>();
  const add=(kind:string,dx:number,dy:number,d:number,hostile:boolean)=>{
    const dir=dirs[(Math.round(Math.atan2(dy,dx)/(Math.PI/4))+8)%8], key=`${kind}|${dir}|${hostile?1:0}`;
    const g=groups.get(key); if(g){g.count++;g.distance=Math.min(g.distance,d)}else groups.set(key,{kind,direction:dir,count:1,distance:d,hostile});
  };
  for (const e of enemies) {
    if(e.dead||e.gone||e.ally||(e.hideT??0)>0||e.affix?.yinOn||(e.def?.hide&&!e.aggro&&!burst)||!Number.isFinite(e.x)||!Number.isFinite(e.y))continue;
    const dx=e.x-x,dy=e.y-y,d=Math.hypot(dx,dy);
    const vis=enemyPerceptibility(e,x,y,outer,burst);
    if(d<=inner||d>outer||vis<=.05)continue;
    add(e.def?.kind==='human'?'修士气息':'妖物气息',dx,dy,d,!!e.aggro);
  }
  for (const n of npcs) {
    if(n.enemy||!n.d.alive||n.d.hidden||n.act==='follow'||!Number.isFinite(n.st.x)||!Number.isFinite(n.st.y))continue;
    const dx=n.st.x-x,dy=n.st.y-y,d=Math.hypot(dx,dy);if(d<=inner||d>outer)continue;
    add('人影气息',dx,dy,d,false);
  }
  for (const e of extras) {
    if(!Number.isFinite(e.x)||!Number.isFinite(e.y))continue;
    const dx=e.x-x,dy=e.y-y,d=Math.hypot(dx,dy);if(d<=inner||d>outer)continue;
    add(e.kind,dx,dy,d,false);
  }
  return [...groups.values()].sort((a,b)=>Number(b.hostile)-Number(a.hostile)||a.distance-b.distance).slice(0,Math.max(0,Math.min(20,Math.floor(limit))));
}
