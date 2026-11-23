// 七种化形灵体及灵力尾迹：由现有程序妖兽骨架生成，按姿态缓存。
import {makeCanvas} from '../core/canvas';
import {drawBeast, type BeastLook} from './beast';
type Spirit={look:BeastLook; scale:number; color:string};
const defs:Record<string,Spirit>={
 long:{look:{body:'jiao',color:[53,145,121],belly:[145,231,198],accent:[221,250,204],size:1,horn:true,spikes:true},scale:1.45,color:'#65eed1'},
 feng:{look:{body:'eagle',color:[200,74,36],belly:[255,176,72],accent:[255,219,127],size:1,tail:'streamer',crest:[255,140,50]},scale:1.7,color:'#ff9a40'},
 hu:{look:{body:'tiger',color:[210,224,235],belly:[255,255,255],accent:[103,149,170],size:1,stripes:true},scale:2.1,color:'#cce9ff'},
 gui:{look:{body:'turtle',color:[67,103,144],belly:[143,190,200],accent:[110,203,233],size:1,spikes:true},scale:2.1,color:'#79c9ff'},
 peng:{look:{body:'eagle',color:[109,92,165],belly:[189,179,232],accent:[215,210,255],size:1,tail:'fan'},scale:1.7,color:'#c1a5ff'},
 qilin:{look:{body:'deer',color:[193,145,76],belly:[248,223,164],accent:[255,229,151],size:1,horn:true,mane:true,spikes:true},scale:2.2,color:'#ffdb83'},
 yuan:{look:{body:'ape',color:[131,60,51],belly:[213,147,111],accent:[255,171,96],size:1,mane:true},scale:2.2,color:'#ff986e'},
};
export const SPIRIT_KEYS=[...Object.keys(defs).flatMap(id=>['hx_'+id+'_idle','hx_'+id+'_attack']),'hx_gather','hx_dissolve','hx_trail','hx_aura'];
const known=new Set(SPIRIT_KEYS),cache=new Map<string,HTMLCanvasElement>();
export function spiritMeta(k:string): {w:number;h:number;ax?:number;ay?:number;ws?:number}|undefined {return known.has(k)?(k==='hx_trail'?{w:512,h:128}:{w:512,h:320}):undefined}
function draw(g:CanvasRenderingContext2D,k:string){
 const parts=/^hx_(long|feng|hu|gui|peng|qilin|yuan)_(idle|attack)$/.exec(k);
 if(parts){
  const d=defs[parts[1]],attack=parts[2]==='attack';
  const glow=g.createRadialGradient(256,152,4,256,152,200);glow.addColorStop(0,d.color+'66');glow.addColorStop(.55,d.color+'22');glow.addColorStop(1,d.color+'00');g.fillStyle=glow;g.fillRect(30,0,452,320);
  // 动态躯体姿态由骨架驱动，灵体整体起伏、方向和空中位置仍由 drawSpirit 控制。
  drawBeast(g,d.look,parts[1]==='long'?280:256,parts[1]==='feng'||parts[1]==='peng'?205:240,1,{move:attack?1:0,phase:attack?1.1:0,atk:attack?.55:0,hit:0,t:attack?1.7:.4},d.scale);
  return;
 }
 if(k==='hx_trail'){
  const gr=g.createLinearGradient(0,0,512,0);gr.addColorStop(0,'#b6eaff00');gr.addColorStop(.7,'#9de8ff55');gr.addColorStop(1,'#e9ffffbb');g.fillStyle=gr;g.beginPath();g.moveTo(0,64);g.quadraticCurveTo(260,40,500,24);g.lineTo(500,104);g.quadraticCurveTo(260,88,0,64);g.fill();return;
 }
 const c=k==='hx_dissolve'?'#f2bcff':k==='hx_aura'?'#90c9ff':'#a7fff0';
 const grad=g.createRadialGradient(256,160,2,256,160,150);grad.addColorStop(0,c+'cc');grad.addColorStop(.4,c+'55');grad.addColorStop(1,c+'00');g.fillStyle=grad;g.fillRect(106,10,300,300);
 g.strokeStyle=c;g.lineWidth=3;for(let i=0;i<16;i++){const a=i*Math.PI/8,r=k==='hx_dissolve'?125:105;g.beginPath();g.moveTo(256+Math.cos(a)*32,160+Math.sin(a)*32);g.lineTo(256+Math.cos(a)*r,160+Math.sin(a)*r);g.stroke()}
 g.beginPath();g.arc(256,160,k==='hx_aura'?100:68,0,Math.PI*2);g.stroke();
}
export function spiritImage(k:string):HTMLCanvasElement|null{
 const m=spiritMeta(k);if(!m)return null;const old=cache.get(k);if(old)return old;
 try{const c=makeCanvas(m.w,m.h),g=c.getContext('2d');if(!g)return null;draw(g,k);cache.set(k,c);return c}catch{return null}
}
