import { makeCanvas } from '../core/canvas';
import { itemDef } from '../data/items';
import { drawNode, gatherNodeColor, type GatherNode } from './nodes';
import { getDotSprite } from '../gfx/charAtlas';
import type { Drawable } from './life';

/** Fixed, bounded palette: tier 0–5 = white, green, blue, violet, gold, red. */
export const GATHER_BEAM_COLORS=['218,230,221','125,230,158','125,188,245','194,148,242','245,205,111','244,132,113'] as const;
export function gatherBeamTier(n:Pick<GatherNode,'item'>):number {
  const tier=itemDef(n.item).tier;
  return Number.isFinite(tier)?Math.max(0,Math.min(5,Math.floor(tier))):0;
}
/** Smoothly replace the detailed sprite with a persistent small marker, never an abrupt cutoff. */
export function gatherDetailWeight(devicePx:number):number {
  if(!Number.isFinite(devicePx))return 0;
  const x=Math.max(0,Math.min(1,(devicePx-8)/8));return x*x*(3-2*x);
}
export function gatherBeamScale(zoom:number):number {
  return Number.isFinite(zoom)&&zoom>0?Math.max(1,Math.min(12,0.18/zoom)):1;
}
const beamCache=new Map<number,HTMLCanvasElement>();
function beamSprite(tier:number):HTMLCanvasElement {
  let image=beamCache.get(tier);if(image)return image;
  image=makeCanvas(64,256);const g=image.getContext('2d')!,col=GATHER_BEAM_COLORS[tier];
  const horizontal=g.createLinearGradient(0,0,64,0);horizontal.addColorStop(0,`rgba(${col},0)`);horizontal.addColorStop(.36,`rgba(${col},0.14)`);horizontal.addColorStop(.5,`rgba(${col},0.55)`);horizontal.addColorStop(.64,`rgba(${col},0.14)`);horizontal.addColorStop(1,`rgba(${col},0)`);
  g.fillStyle=horizontal;g.fillRect(0,0,64,256);
  g.globalCompositeOperation='destination-in';const fade=g.createLinearGradient(0,0,0,256);fade.addColorStop(0,'rgba(0,0,0,0)');fade.addColorStop(.25,'rgba(0,0,0,.5)');fade.addColorStop(.8,'rgba(0,0,0,1)');fade.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=fade;g.fillRect(0,0,64,256);g.globalCompositeOperation='source-over';
  beamCache.set(tier,image);return image;
}
/** Also used for actual combat drops; callers must apply their own visibility rules. */
export function drawItemTierBeam(g:CanvasRenderingContext2D,id:string,x:number,y:number,alpha:number,zoom:number) {
  if(!(alpha>0)||!(zoom>0))return;
  const tier=gatherBeamTier({item:id}),scale=gatherBeamScale(zoom),width=(30+tier*3)*scale,height=(110+tier*32)*scale;
  g.save();g.globalAlpha*=alpha;g.drawImage(beamSprite(tier),x-width/2,y-height,width,height);g.restore();
}
export function drawGatherVisual(g:CanvasRenderingContext2D,n:GatherNode,t:number,alpha:number,highlight:boolean,zoom:number,deviceScale:number,showBeam=true) {
  if(!(alpha>0)||!(zoom>0)||!(deviceScale>0))return;
  const detail=highlight?1:gatherDetailWeight(50*deviceScale);
  if(showBeam)drawItemTierBeam(g,n.item,n.x,n.y,alpha,zoom);
  if(detail<.999){
    g.save();g.globalAlpha=alpha*(1-detail);g.fillStyle=gatherNodeColor(n);
    g.beginPath();g.arc(n.x,n.y,Math.max(1.4,(n.kind==='herb'?2.6:2)/deviceScale),0,Math.PI*2);g.fill();g.restore();
  }
  if(detail>.001)drawNode(g,n,t,alpha*detail,highlight);
}

type GatherField={inRect:(x0:number,y0:number,x1:number,y1:number)=>GatherNode[];available:(n:GatherNode,day:number)=>boolean;rememberVisible:(n:GatherNode)=>void};
/** Query only the viewport/detail-sense intersection; neither the beam nor LOD discovers beyond it. */
function hexRgb01(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [0.55, 0.78, 0.55];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}
export function collectGatherVisuals(out:Drawable[],field:GatherField,opt:{x:number;y:number;radius:number;day:number;view:{left:number;top:number;right:number;bottom:number};time:number;zoom:number;deviceScale:number;target:GatherNode|null;showBeam?:(n:GatherNode)=>boolean;ren?:{pushAtlasSpr?:(...args:any[])=>boolean}}) {
  const {x,y,radius,day,view,time,zoom,deviceScale,target,ren}=opt;
  if(![x,y,radius,day,zoom,deviceScale].every(Number.isFinite)||radius<=0||zoom<=0||deviceScale<=0)return;
  // Include beams just above the viewport while bounding traversal to the inner-circle AABB.
  const pad=360*gatherBeamScale(zoom),x0=Math.max(x-radius,view.left-pad),x1=Math.min(x+radius,view.right+pad),y0=Math.max(y-radius,view.top-pad),y1=Math.min(y+radius,view.bottom+pad);
  if(x0>x1||y0>y1)return;
  for(const n of field.inRect(x0,y0,x1,y1)){
    if(!field.available(n,day))continue;
    const d=Math.hypot(n.x-x,n.y-y);if(d>radius)continue;
    const alpha=Math.max(0,Math.min(1,(radius-d)/120));if(alpha<=.001)continue;
    if(alpha>.05&&n.x>=view.left&&n.x<=view.right&&n.y>=view.top&&n.y<=view.bottom)field.rememberVisible(n);
    const highlight=target===n;
    const showBeam = highlight || opt.showBeam?.(n) !== false;
    const detail = highlight ? 1 : gatherDetailWeight(50 * deviceScale);
    let gl: Drawable['gl'];
    if (ren?.pushAtlasSpr && detail <= 0.001) {
      const [r, g, b] = hexRgb01(gatherNodeColor(n));
      const dotScale = Math.max(0.35, (n.kind === 'herb' ? 2.6 : 2) / Math.max(0.05, deviceScale) / 3);
      if (!showBeam) {
        gl = (batch, occA) => ren.pushAtlasSpr!(batch, getDotSprite(), n.x, n.y, dotScale, dotScale, false, alpha * occA, 'P2:dot8', r, g, b);
      } else {
        const tier = gatherBeamTier(n);
        const scale = gatherBeamScale(zoom);
        const bw = (30 + tier * 3) * scale, bh = (110 + tier * 32) * scale;
        const beamCv = beamSprite(tier);
        const beamSpr = { canvas: beamCv, w: 64, h: 256, ax: 32, ay: 256 };
        const beamKey = `GB:${tier}`;
        gl = (batch, occA) =>
          ren.pushAtlasSpr!(batch, beamSpr, n.x, n.y, bw / 64, bh / 256, false, alpha * occA, beamKey)
          && ren.pushAtlasSpr!(batch, getDotSprite(), n.x, n.y, dotScale, dotScale, false, alpha * occA, 'P2:dot8', r, g, b);
      }
    }
    out.push({y:n.y,k:'D·采集点',gl,draw:g=>drawGatherVisual(g,n,time,alpha,highlight,zoom,deviceScale,showBeam)});
  }
}
