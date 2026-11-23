// 可横向重复的城墙、院墙和廊墙。世界尺寸与墙高仍由 BLD2 和布局指定。
import { makeCanvas } from '../core/canvas';
import { BLD2 } from './bld2Dims';
type G=CanvasRenderingContext2D;
type Style='plaster'|'brick'|'rampart'|'corridor'|'stone'|'whiteRampart';
const WALL_STYLE:Record<string,Style>={b13_strip:'plaster',b34_strip:'brick',b36_strip:'rampart',b39_strip:'corridor',f9_wall_strip:'rampart',x03_wall_strip:'whiteRampart',x14_strip:'stone'};
export const TOWN_WALL_KEYS=Object.keys(WALL_STYLE);
const cache=new Map<string,HTMLCanvasElement[]>();
function rect(g:G,x:number,y:number,w:number,h:number,color:string){g.fillStyle=color;g.fillRect(x,y,w,h)}
function line(g:G,x0:number,y0:number,x1:number,y1:number,color:string,w=.8){g.strokeStyle=color;g.lineWidth=w;g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke()}
function draw(g:G,key:string,style:Style,v:string){
 const dark=v==='dark',snow=v==='snow',rose=v==='rose';
 const ink=dark?'#48423d':'#77766c',wall=snow?'#c8d1cb':dark?'#88837d':style==='whiteRampart'?'#dbd5c3':style==='plaster'?'#d9d5c8':style==='corridor'?'#c5b4a0':'#aaa9a0';
 const mortar=snow?'#a5b5b2':dark?'#6c6962':'#85877f',roof=dark?'#535454':rose?'#8b7a7c':'#6a7570',wood=dark?'#65514b':'#8c6552';
 const ramp=style==='rampart'||style==='whiteRampart',top=ramp?24:style==='stone'?8:20;
 rect(g,0,top,100,100-top,wall);
 if(ramp){for(const x of [0,32,68])rect(g,x,8,x===0?16:32,16,wall);rect(g,0,23,100,3,ink);line(g,0,30,100,30,ink,1)}
 else if(style==='plaster'||style==='brick'||style==='corridor'){
  rect(g,0,8,100,12,roof);rect(g,0,19,100,3,ink);
  for(let x=-8;x<108;x+=8){line(g,x,8,x+8,18,'#a4aba0',.7);line(g,x,16,x+7,16,ink,.45)}
 }
 if(style==='corridor'){
  rect(g,0,23,100,57,'#b6a494');for(const x of [0,48,96])rect(g,x,22,4,58,wood);
  for(const x of [7,55]){rect(g,x,29,38,35,wood);rect(g,x+3,32,32,29,'#c4c3b1');line(g,x+19,32,x+19,61,wood,.8);line(g,x+3,46,x+35,46,wood,.8)}
  rect(g,0,68,100,5,wood);rect(g,0,80,100,4,ink);
 }
 const brickStart=style==='plaster'?76:style==='corridor'?84:style==='brick'?24:style==='stone'?8:31;
 if(brickStart<100){
  for(let y=brickStart+8;y<100;y+=8){line(g,0,y,100,y,mortar,.55);const row=Math.round((y-brickStart)/8);for(let x=(row%2?12:0);x<100;x+=25)line(g,x,y-8,x,y,mortar,.45)}
 }
 if(style==='plaster')rect(g,0,75,100,2,ink);
 if(key==='f9_wall_strip'){rect(g,0,89,100,11,'#83847e');line(g,0,89,100,89,ink,1)}
 if(snow)rect(g,0,top-2,100,2,'#e0e8e2');
}
export function townWallMips(key:string):HTMLCanvasElement[]|null{
 const [base,variant='']=key.split('|');if(!Object.prototype.hasOwnProperty.call(WALL_STYLE,base)||!BLD2[base]||typeof document==='undefined')return null;
 const v=variant==='dark'||variant==='snow'||variant==='rose'?variant:'',id=base+'|'+v,hit=cache.get(id);if(hit)return hit;
 try{const d=BLD2[base],scale=Math.min(2,256/Math.max(d.w,d.h)),cv=makeCanvas(Math.max(32,Math.round(d.w*scale)),Math.max(32,Math.round(d.h*scale))),g=cv.getContext('2d');if(!g)return null;g.scale(cv.width/100,cv.height/100);draw(g,base,WALL_STYLE[base],v);
  const m=[cv];let prev=cv;for(let i=0;i<3;i++){const w=Math.round(prev.width/2),h=Math.round(prev.height/2);if(w<16||h<16)break;const next=makeCanvas(w,h),ctx=next.getContext('2d');if(!ctx)break;ctx.drawImage(prev,0,0,w,h);m.push(next);prev=next}cache.set(id,m);return m;
 }catch{return null}
}
