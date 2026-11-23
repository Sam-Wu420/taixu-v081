// 人界民居与店铺：按建筑键选择结构和配色，尺寸、门中心与锚线沿用 BLD2。
import { makeCanvas } from '../core/canvas';
import { capCanvasCache } from './canvasBudget';
import { BLD2 } from './bld2Dims';
type G = CanvasRenderingContext2D;
type Style = 'plain'|'courtyard'|'shop'|'twoStorey'|'thatch'|'north'|'snow'|'stilt'|'tent';
const HOUSE_STYLE: Record<string,Style> = {
 b02:'plain',b02b:'plain',b03:'twoStorey',b03b:'shop',b14:'courtyard',b15:'twoStorey',b19:'courtyard',b25:'shop',b26:'twoStorey',b30:'thatch',
 j04a:'north',j04b:'north',j05:'courtyard',j06a:'north',j06b:'shop',j11:'tent',j12:'snow',j17:'tent',
 x04a:'plain',x04b:'thatch',x05:'stilt',x06:'shop',b24a:'tent',b24b:'tent',b24c:'tent',
};
export const TOWN_HOUSE_KEYS = Object.keys(HOUSE_STYLE);
const cache=new Map<string,HTMLCanvasElement[]>();
function rect(g:G,x:number,y:number,w:number,h:number,col:string){g.fillStyle=col;g.fillRect(x,y,w,h)}
function path(g:G,p:number[],fill:string,edge:string,w=.65){g.beginPath();g.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)g.lineTo(p[i],p[i+1]);g.closePath();g.fillStyle=fill;g.fill();if(w){g.strokeStyle=edge;g.lineWidth=w;g.stroke()}}
function line(g:G,p:number[],col:string,w=.5){g.beginPath();g.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)g.lineTo(p[i],p[i+1]);g.strokeStyle=col;g.lineWidth=w;g.lineJoin='round';g.lineCap='round';g.stroke()}
function draw(g:G,key:string,style:Style,variant:string){
 const dim=BLD2[key], dark=variant==='dark',snow=variant==='snow'||style==='snow'||key==='j11',rose=variant==='rose';
 const ink=dark?'#3d3633':'#55483e',wood=dark?'#5c4842':'#82614b',plaster=snow?'#d0d5cb':dark?'#91867a':key==='b30'?'#d1ae78':key.startsWith('j')?'#aaa79b':'#d5c9ac';
 const tile=snow?'#cbd5d3':dark?'#505354':rose?'#8b7c82':style==='thatch'?'#a8956b':'#6b7773';
 const stone=snow?'#a9bab8':'#aaa596';const doorX=50+(dim.dx??0)/dim.w*100,doorW=Math.max(7,Math.min(21,(dim.door??dim.w*.15)/dim.w*100));
 // 地基与门前小阶。b 是尺寸元数据中的台基下沿余量，不在这里二次平移。
 function base(y=91){path(g,[4,y,96,y,98,y+4,2,y+4],stone,ink,.7);line(g,[5,y+2,95,y+2],ink,.4);for(let x=10;x<95;x+=13)line(g,[x,y+2,x,y+4],ink,.3)}
 function door(x:number,y:number,w:number,h:number){rect(g,x-w/2-1,y-1,w+2,h+1,ink);rect(g,x-w/2,y,w,h,wood);line(g,[x,y,x,y+h],ink,.65);line(g,[x-w*.35,y+1,x-w*.35,y+h-1], '#b19a7f',.35);line(g,[x+w*.35,y+1,x+w*.35,y+h-1], '#b19a7f',.35);rect(g,x+w*.17,y+h*.52,1,1,'#d3bd87')}
 function window(x:number,y:number,w:number,h:number){rect(g,x-w/2-.8,y-.8,w+1.6,h+1.6,wood);rect(g,x-w/2,y,w,h,snow?'#d9d9c9':'#c6b999');for(let xx=x-w/2+w/3;xx<x+w/2;xx+=w/3)line(g,[xx,y,xx,y+h],wood,.45);line(g,[x-w/2,y+h/2,x+w/2,y+h/2],wood,.45)}
 function roof(x:number,y:number,w:number,h:number){
  path(g,[x-w/2,y+h,x-w*.41,y+h*.82,x-w*.33,y+h*.22,x-w*.27,y,x+w*.27,y,x+w*.33,y+h*.22,x+w*.41,y+h*.82,x+w/2,y+h,x+w*.34,y+h*.91,x-w*.34,y+h*.91],tile,ink,.8);
  if(style==='thatch'){for(let i=0;i<27;i++){const xx=x-w*.35+i*w*.7/26;line(g,[xx,y+h*.19,xx-1,y+h*.82], '#c1ad82',.35)}}
  else for(let i=0;i<23;i++){const xx=x-w*.32+i*w*.64/22;line(g,[x+(xx-x)*.83,y+h*.1,xx,y+h*.8],snow?'#a5b7b6':'#a4aaa0',.28)}
  line(g,[x-w*.34,y+h*.79,x+w*.34,y+h*.79],ink,.55);
 }
 if(style==='tent'){
  base();const canvas=snow?'#d3d4c7':dark?'#978a7b':key==='b24b'?'#c4a57c':'#d7cbb0';
  path(g,[11,90,13,52,21,43,79,43,87,52,89,90],canvas,ink,.8);
  path(g,[9,53,22,34,39,21,50,18,61,21,78,34,91,53],snow?'#e3e5dc':'#c5b597',ink,.9);
  for(let i=0;i<7;i++){const x=14+i*12;line(g,[50,20,x,52], '#a99b83',.45);line(g,[x,53,x,88], '#ad9d84',.4)}
  rect(g,12,54,76,3,key==='b24b'?'#af7658':'#9a9f93');for(let x=15;x<87;x+=7)line(g,[x,55,x+3,55], '#e1d0ae',.5);
  door(doorX,65,doorW,25);path(g,[doorX-doorW*.55,91,doorX+doorW*.55,91,doorX+doorW*.8,95,doorX-doorW*.8,95],stone,ink,.4);return;
 }
 if(style==='stilt'){
  for(let x=13;x<=87;x+=9)line(g,[x,72,x,93],wood,1.1);rect(g,7,69,86,5,wood);
  rect(g,12,40,76,29,plaster);for(let x=14;x<90;x+=11)line(g,[x,41,x,69],wood,.6);
  window(28,49,10,10);window(72,49,10,10);door(doorX,49,doorW,20);roof(50,18,94,24);line(g,[8,71,92,71],ink,.6);return;
 }
 base();const top=style==='twoStorey'?32:40,bodyBottom=91,left=10,right=90;
 rect(g,left,top,right-left,bodyBottom-top,plaster);
 if(style==='north'||style==='snow'){for(let y=top+6;y<bodyBottom;y+=5){line(g,[left,y,right,y],snow?'#aab6ae':'#8f9088',.3);for(let x=left+(Math.floor(y/5)%2)*5;x<right;x+=13)line(g,[x,y,x,y+5],snow?'#aab6ae':'#8f9088',.25)}}
 for(const x of [left,right])rect(g,x-1,top,2,bodyBottom-top,wood);
 if(style==='twoStorey'){
  line(g,[left,62,right,62],wood,2);for(const x of [23,37,63,77])window(x,43,9,12);
  for(const x of [18,34,66,82])line(g,[x,65,x,89],wood,1);roof(50,15,96,22);
  if(key==='b03')roof(50,54,96,12);
 } else roof(50,17,96,25);
 if(style==='courtyard'){
  path(g,[7,71,36,71,36,91,7,91],stone,ink,.5);path(g,[64,71,93,71,93,91,64,91],stone,ink,.5);
  line(g,[7,70,36,70],tile,1.6);line(g,[64,70,93,70],tile,1.6);roof(doorX,54,doorW+12,10);
 } else {for(const x of [25,75])window(x,style==='twoStorey'?70:58,12,13)}
 const dy=style==='twoStorey'?68:64;door(doorX,dy,doorW,91-dy);
 if(style==='shop'||key==='b03'||key==='b26'){
  rect(g,doorX-10,dy-8,20,5,wood);rect(g,doorX-8.5,dy-7,17,3, '#d5c4a1');line(g,[doorX-5,dy-5.5,doorX+5,dy-5.5],ink,.5);
  for(const x of [16,84]){line(g,[x,47,x,54],wood,.6);rect(g,x-2,54,4,5,rose?'#b87e83':'#a86551')}
 }
 path(g,[doorX-doorW*.58,91,doorX+doorW*.58,91,doorX+doorW*.8,96,doorX-doorW*.8,96],stone,ink,.45);
 for(let y=92;y<96;y+=1.4)line(g,[doorX-doorW*.6,y,doorX+doorW*.6,y],ink,.25);
}
/** 首次按键生成，变体缓存有限；失败返回 null。 */
export function townHouseMips(key:string):HTMLCanvasElement[]|null{
 const [base,variant='']=key.split('|');if(!Object.prototype.hasOwnProperty.call(HOUSE_STYLE,base)||!BLD2[base]||typeof document==='undefined')return null;
 const v=variant==='dark'||variant==='snow'||variant==='rose'?variant:'',id=base+'|'+v,hit=cache.get(id);if(hit)return hit;
 try{const d=BLD2[base],scale=Math.min(1,512/Math.max(d.w,d.h)),cv=makeCanvas(Math.max(32,Math.round(d.w*scale)),Math.max(32,Math.round(d.h*scale))),g=cv.getContext('2d');if(!g)return null;g.scale(cv.width/100,cv.height/100);draw(g,base,HOUSE_STYLE[base],v);
  const mips=[cv];let prev=cv;for(let i=0;i<4;i++){const w=Math.round(prev.width/2),h=Math.round(prev.height/2);if(w<16||h<16)break;const next=makeCanvas(w,h),ctx=next.getContext('2d');if(!ctx)break;ctx.drawImage(prev,0,0,w,h);mips.push(next);prev=next}cache.set(id,mips);capCanvasCache(cache,id);return mips;
 }catch{return null}
}
