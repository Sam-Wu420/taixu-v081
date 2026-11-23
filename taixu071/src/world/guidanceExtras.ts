import type { Game } from './game';
import type { GuidanceExtra } from './senseGuidance';

/** Existing discovered objects only. Captured scope prevents an old save or removed event becoming a different target. */
export function guidanceExtras(game:Game):GuidanceExtra[] {
  const p=game.player, r=game.awarenessRadius, ws=game.ws, nodes=game.nodes;
  const out:GuidanceExtra[]=[];
  for(const point of game.sites.knownSignals(p.x,p.y,r)) {
    out.push({key:`site:${point.x}:${point.y}`,scope:ws,point,kind:point.kind,markerHeight:game.sites.signalMarkerHeight(point.x,point.y),valid:()=>game.ws===ws && game.sites.isKnownSignal(point.x,point.y)});
  }
  for(const point of nodes.knownSignals(p.x,p.y,r,game.day)) {
    out.push({key:`node:${point.x}:${point.y}`,scope:nodes,point,kind:point.kind,valid:()=>game.ws===ws && game.nodes===nodes && nodes.isKnownSignal(point.x,point.y,game.day)});
  }
  for(const e of game.events.enc) if(e.seen&&!e.done) {
    out.push({key:`event:${e.id}`,scope:e,point:e,kind:'奇遇气息',valid:()=>game.ws===ws && e.seen&&!e.done&&game.events.enc.includes(e)});
  }
  for(const h of game.happen.haps) if(h.seen&&!h.done) {
    out.push({key:`happen:${h.id}`,scope:h,point:h,kind:'奇遇气息',valid:()=>game.ws===ws && h.seen&&!h.done&&game.happen.haps.includes(h)});
  }
  return out;
}
