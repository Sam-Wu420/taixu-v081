// 阵旗、阵眼及阵法特效；局部坐标 0..256，锚点与输出尺寸由元数据统一约定。
import { makeCanvas } from '../core/canvas';
type Meta={w:number;h:number;ax?:number;ay?:number;ws?:number};
const meta:Record<string,Meta>={
 zf_dome:{w:256,h:192},zf_dome_crack:{w:256,h:192},zf_shatter:{w:256,h:256},zf_curtain:{w:256,h:256},zf_link:{w:256,h:32},zf_activate:{w:256,h:256},zf_break:{w:256,h:256},zf_pillar:{w:64,h:256},zf_eye:{w:256,h:256},zf_sword:{w:86,h:256},zf_fire:{w:170,h:256},zf_lightning:{w:64,h:256},zf_fog:{w:256,h:256},
 zf_flag_jin:{w:190,h:256,ax:.5,ay:.94},zf_flag_mu:{w:190,h:256,ax:.5,ay:.94},zf_flag_shui:{w:190,h:256,ax:.5,ay:.94},zf_flag_huo:{w:190,h:256,ax:.5,ay:.94},zf_flag_tu:{w:150,h:256,ax:.5,ay:.94},zf_flag_mo:{w:176,h:256,ax:.5,ay:.94},
 zf_eye_stone:{w:256,h:224,ax:.5,ay:.94},zf_eye_stone_ancient:{w:256,h:203,ax:.5,ay:.94},zf_stake:{w:205,h:256,ax:.5,ay:.94},zf_disc_ground:{w:253,h:256,ax:.5,ay:.94},
};
export const FORMATION_EFFECT_KEYS=Object.keys(meta);
const cache=new Map<string,HTMLCanvasElement>(), tau=Math.PI*2;
export function formationEffectMeta(k:string){return meta[k]}
function path(g:CanvasRenderingContext2D,pts:number[],fill:string,stroke?:string){g.beginPath();g.moveTo(pts[0],pts[1]);for(let i=2;i<pts.length;i+=2)g.lineTo(pts[i],pts[i+1]);g.closePath();g.fillStyle=fill;g.fill();if(stroke){g.strokeStyle=stroke;g.lineWidth=3;g.stroke()}}
function glow(g:CanvasRenderingContext2D,color:string){const gr=g.createRadialGradient(128,128,1,128,128,118);gr.addColorStop(0,color+'bb');gr.addColorStop(.45,color+'55');gr.addColorStop(1,color+'00');g.fillStyle=gr;g.fillRect(0,0,256,256)}
function draw(g:CanvasRenderingContext2D,k:string){
 g.lineCap='round';g.lineJoin='round';
 if(k.startsWith('zf_flag_')){
  const c:Record<string,string>={jin:'#dbba68',mu:'#6eae79',shui:'#639fbf',huo:'#c7654b',tu:'#b89564',mo:'#88629f'};const color=c[k.slice(8)];
  g.strokeStyle='#473a32';g.lineWidth=9;g.beginPath();g.moveTo(128,240);g.lineTo(128,21);g.stroke();g.fillStyle='#e4c680';g.beginPath();g.arc(128,21,7,0,tau);g.fill();
  path(g,[132,31,215,40,200,67,218,92,132,100],color,'#e0c597');g.strokeStyle='#f3dfac';g.lineWidth=3;g.beginPath();g.arc(165,66,17,0,tau);g.stroke();g.beginPath();g.moveTo(155,66);g.lineTo(175,66);g.moveTo(165,56);g.lineTo(165,76);g.stroke();return;
 }
 if(k==='zf_eye_stone'||k==='zf_eye_stone_ancient'||k==='zf_stake'||k==='zf_disc_ground'){
  const ancient=k.includes('ancient');path(g,[34,211,50,86,92,45,176,45,210,90,223,212,192,239,63,239],ancient?'#4f405c':'#5b6664','#2a3032');path(g,[63,209,75,91,103,62,166,62,187,96,197,209],ancient?'#82718b':'#899a93');
  if(k==='zf_stake'){g.fillStyle='#5d4635';g.fillRect(113,28,30,188)}
  if(k==='zf_disc_ground'){g.fillStyle='#b19b71';g.beginPath();g.ellipse(128,155,75,65,0,0,tau);g.fill()}
  g.strokeStyle=ancient?'#e3a6ef':'#a9efdf';g.lineWidth=5;g.beginPath();g.arc(128,132,33,0,tau);g.moveTo(108,132);g.lineTo(128,111);g.lineTo(148,132);g.lineTo(128,153);g.closePath();g.stroke();return;
 }
 const color=k==='zf_fire'?'#ff9b55':k==='zf_break'||k==='zf_shatter'?'#e7a2ff':'#8ddcff';
 if(k==='zf_fog'){glow(g,'#cbdce7');return}
 if(k==='zf_pillar'||k==='zf_link'||k==='zf_curtain'){
  const horizontal=k==='zf_link';const gr=horizontal?g.createLinearGradient(0,0,0,256):g.createLinearGradient(0,0,256,0);gr.addColorStop(0,color+'00');gr.addColorStop(.4,color+'77');gr.addColorStop(.5,'#efffffdd');gr.addColorStop(.6,color+'77');gr.addColorStop(1,color+'00');g.fillStyle=gr;g.fillRect(0,0,256,256);return;
 }
 if(k==='zf_dome'||k==='zf_dome_crack'){
  g.strokeStyle=color;g.lineWidth=k.endsWith('crack')?3:7;
  if(k.endsWith('crack')){for(let i=0;i<5;i++){g.beginPath();g.moveTo(45+i*40,180);g.lineTo(55+i*35,145);g.lineTo(45+i*38,125);g.lineTo(62+i*30,90);g.stroke()}}
  else{g.fillStyle='#7dd5ff22';g.beginPath();g.ellipse(128,200,113,172,0,Math.PI,tau);g.lineTo(241,200);g.closePath();g.fill();g.stroke();g.lineWidth=2;for(let i=0;i<4;i++){g.beginPath();g.ellipse(128,200,100-i*18,157,0,Math.PI,tau);g.stroke()}}return;
 }
 if(k==='zf_lightning'){glow(g,color);path(g,[138,4,70,121,112,119,86,247,190,91,145,102,177,4],'#d8f5ff',color);return}
 if(k==='zf_sword'){glow(g,color);path(g,[128,8,78,156,104,180,119,180,119,235,137,235,137,180,152,180,178,156],'#e7fbff',color);return}
 if(k==='zf_fire'){glow(g,color);path(g,[128,12,96,86,81,56,51,166,73,223,128,247,180,224,208,168,179,83,163,122],'#ff7b3f');path(g,[129,89,98,161,110,150,89,194,105,227,128,238,156,223,166,194,146,143],'#ffe3a2');return}
 glow(g,color);g.strokeStyle=color;g.lineWidth=5;g.beginPath();g.arc(128,128,86,0,tau);g.stroke();g.lineWidth=2;g.beginPath();g.arc(128,128,58,0,tau);g.stroke();
 for(let i=0;i<12;i++){let a=i*tau/12;g.beginPath();g.moveTo(128+Math.cos(a)*65,128+Math.sin(a)*65);g.lineTo(128+Math.cos(a)*(k==='zf_shatter'&&i%2?112:100),128+Math.sin(a)*(k==='zf_shatter'&&i%2?112:100));g.stroke()}
 if(k==='zf_break'){g.beginPath();g.moveTo(115,47);g.lineTo(142,105);g.lineTo(117,132);g.lineTo(145,181);g.lineTo(132,209);g.stroke()}
 if(k==='zf_eye'){g.beginPath();g.moveTo(67,128);g.quadraticCurveTo(128,70,189,128);g.quadraticCurveTo(128,186,67,128);g.stroke();g.beginPath();g.arc(128,128,18,0,tau);g.stroke()}
}
export function formationEffectImage(k:string):HTMLCanvasElement|null{
 const m=meta[k];if(!m)return null;const old=cache.get(k);if(old)return old;
 try{const c=makeCanvas(m.w,m.h),g=c.getContext('2d');if(!g)return null;g.scale(m.w/256,m.h/256);draw(g,k);cache.set(k,c);return c}catch{return null}
}
