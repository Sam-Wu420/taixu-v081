// 城门、山门程序画材。碰撞由 townLayout 保持；中轴门洞与其通行口对齐。
import { makeCanvas } from '../core/canvas';
import { capCanvasCache } from './canvasBudget';
import { BLD2 } from './bld2Dims';
type G=CanvasRenderingContext2D;
type GateStyle='city'|'archway'|'temple'|'moon'|'palisade'|'dark'|'bamboo'|'sea'|'sun';
const STYLES:Record<string,GateStyle>={
 b04:'archway',b20:'city',b29:'archway',b41:'temple',f1_gate_b:'archway',f2_gate:'archway',f3_gate:'temple',f4_gate:'moon',f5_gate:'dark',f6_gate:'palisade',f7_gate:'temple',f8_gate:'sea',f9_gate:'city',f10_gate:'temple',f11_gate:'bamboo',j03:'city',j07_gate:'temple',t02:'sun',x03:'sea',x10:'sea',
};
export const TOWN_GATE_KEYS=Object.keys(STYLES);
const cache=new Map<string,HTMLCanvasElement[]>();
function rect(g:G,x:number,y:number,w:number,h:number,c:string){g.fillStyle=c;g.fillRect(x,y,w,h)}
function line(g:G,p:number[],c:string,w=.7){g.beginPath();g.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)g.lineTo(p[i],p[i+1]);g.strokeStyle=c;g.lineWidth=w;g.lineCap='round';g.lineJoin='round';g.stroke()}
function poly(g:G,p:number[],c:string,edge:string,w=.8){g.beginPath();g.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)g.lineTo(p[i],p[i+1]);g.closePath();g.fillStyle=c;g.fill();if(w){g.strokeStyle=edge;g.lineWidth=w;g.stroke()}}
function roof(g:G,x:number,y:number,w:number,h:number,tile:string,edge:string){
 poly(g,[x-w/2,y+h,x-w*.38,y+h*.72,x-w*.29,y+h*.12,x-w*.25,y,x+w*.25,y,x+w*.29,y+h*.12,x+w*.38,y+h*.72,x+w/2,y+h,x+w*.34,y+h*.88,x-w*.34,y+h*.88],tile,edge,.8);
 for(let i=0;i<15;i++){const px=x-w*.27+i*w*.54/14;line(g,[x+(px-x)*.82,y+h*.12,px,y+h*.73], '#a7ada0',.35)}
 line(g,[x-w*.34,y+h*.78,x+w*.34,y+h*.78],edge,.7);
}
function draw(g:G,key:string,style:GateStyle,variant:string){
 const d=BLD2[key],dark=variant==='dark'||style==='dark',snow=variant==='snow',rose=variant==='rose';
 const ink=dark?'#3d3635':'#59554c',stone=snow?'#c7d4d0':dark?'#817777':style==='sea'?'#d3d1c4':'#bbb4a4',mortar=dark?'#66605e':'#9b998d',wood=dark?'#584342':'#8c6853',tile=snow?'#b5c5c3':dark?'#4f4c50':rose?'#917d85':style==='bamboo'?'#a79770':'#657773';
 const openW=Math.min(36,Math.max(96,d.door??96)/d.w*100),a=50-openW/2,b=50+openW/2;
 const city=style==='city'||style==='sea', pillar=style==='archway';
 // 地基和主体分成左右两侧，以保持中轴门洞完全透明。
 const baseY=91,bodyTop=city?53:style==='moon'?40:45;
 if(city){
  poly(g,[2,baseY,9,bodyTop,91,bodyTop,98,baseY],stone,ink,.8);
  for(let y=bodyTop+6;y<baseY;y+=6){line(g,[4,y,96,y],mortar,.35);for(let x=(Math.floor(y/6)%2)*5;x<100;x+=12)line(g,[x,y-6,x,y],mortar,.3)}
  for(let x=10;x<91;x+=10)rect(g,x,bodyTop-5,6,5,stone);
  rect(g,19,34,62,19,stone);for(let x=23;x<=77;x+=12)rect(g,x-1,35,2,17,wood);rect(g,19,49,62,3,wood);
  roof(g,50,20,76,16,tile,ink);
  if(key==='j03'||key==='f9_gate'||key==='x03'){rect(g,29,21,42,10,stone);for(let x=32;x<=68;x+=9)rect(g,x-1,21,2,10,wood);roof(g,50,10,54,13,tile,ink)}
 }else if(pillar){
  for(const x of [12,30,70,88]){rect(g,x-2.5,39,5,52,stone);rect(g,x-4,87,8,5,ink);line(g,[x,42,x,85],mortar,.4)}
  rect(g,10,39,80,7,stone);rect(g,32,33,36,7,wood);roof(g,50,17,51,19,tile,ink);roof(g,18,26,30,16,tile,ink);roof(g,82,26,30,16,tile,ink);
 }else{
  rect(g,6,bodyTop,88,baseY-bodyTop,stone);
  if(style==='palisade'){rect(g,3,44,94,47,wood);for(let x=5;x<97;x+=4){line(g,[x,42,x,90], '#b69b7b',.55);poly(g,[x-1,44,x,39,x+1,44],wood,ink,.4)}}
  else {for(const x of [13,31,69,87]){rect(g,x-1.5,bodyTop,3,baseY-bodyTop,wood);line(g,[x,bodyTop+3,x,baseY-2], '#bda88e',.45)}
   for(let y=bodyTop+8;y<baseY;y+=10)line(g,[7,y,93,y],mortar,.35)}
  roof(g,50,18,96,bodyTop-16,tile,ink);
  if(style==='bamboo'){for(const x of [8,92]){line(g,[x,91,x+1,26], '#75916b',1.1);for(let y=36;y<82;y+=12)line(g,[x+1,y,x+(x<50?7:-7),y-6], '#79956e',.5)}}
  if(style==='dark'){for(const x of [14,86]){poly(g,[x-3,54,x,43,x+3,54], '#b49b8c',ink,.5);line(g,[x,56,x,77], '#c1a69c',.6)}}
  if(style==='sun'){for(const x of [18,82]){g.strokeStyle='#b49968';g.lineWidth=.7;g.beginPath();g.arc(x,64,6,0,Math.PI*2);g.stroke();for(let i=0;i<8;i++){let t=i*Math.PI/4;line(g,[x+Math.cos(t)*7,64+Math.sin(t)*7,x+Math.cos(t)*9,64+Math.sin(t)*9], '#b49968',.6)}}}
 }
 rect(g,2,91,96,5,stone);line(g,[2,91,98,91],ink,.7);
 // 把底部和墙身的中央挖空，按布局的实际可通行宽度绘制。
 g.save();g.globalCompositeOperation='destination-out';g.fillStyle='#000';
 g.beginPath();g.moveTo(a,98);g.lineTo(a,76);g.quadraticCurveTo(a,65,50,65);g.quadraticCurveTo(b,65,b,76);g.lineTo(b,98);g.closePath();g.fill();g.restore();
 // 门框在通行口之外；门楣不画在可穿行的下部。
 if(!pillar)line(g,[a-1.2,91,a-1.2,76,a+1,70,50,65,b-1,70,b+1.2,76,b+1.2,91],ink,.9);
 if(!city){rect(g,39,bodyTop+2,22,4,wood);rect(g,41,bodyTop+3,18,2, '#d4c2a1')}
}
export function townGateMips(key:string):HTMLCanvasElement[]|null{
 const [base,variant='']=key.split('|');if(!Object.prototype.hasOwnProperty.call(STYLES,base)||!BLD2[base]||typeof document==='undefined')return null;
 const v=variant==='dark'||variant==='snow'||variant==='rose'?variant:'',id=base+'|'+v,hit=cache.get(id);if(hit)return hit;
 try{const d=BLD2[base],scale=Math.min(1,512/Math.max(d.w,d.h)),cv=makeCanvas(Math.max(32,Math.round(d.w*scale)),Math.max(32,Math.round(d.h*scale))),g=cv.getContext('2d');if(!g)return null;g.scale(cv.width/100,cv.height/100);draw(g,base,STYLES[base],v);
  const m=[cv];let prev=cv;for(let i=0;i<4;i++){const w=Math.round(prev.width/2),h=Math.round(prev.height/2);if(w<16||h<16)break;const next=makeCanvas(w,h),ctx=next.getContext('2d');if(!ctx)break;ctx.drawImage(prev,0,0,w,h);m.push(next);prev=next}cache.set(id,m);capCanvasCache(cache,id);return m;
 }catch{return null}
}
