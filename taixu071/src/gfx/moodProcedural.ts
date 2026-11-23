// 氛围画材：固定种子按需生成与缓存，不依赖外部图像。
import {makeCanvas} from '../core/canvas';
export const MOOD_KEYS=['sky_cloud_band','sky_dawn_mist','sky_dusk_glow','sky_starriver','moon_full','moon_crescent','rain_veil','mist_band','mist_puff_1','mist_puff_2','wild_geese','lone_sail','fishing_light','cooking_smoke','reed_marsh','lotus_withered','plum_branch','paper_grain','ink_vignette'] as const;
export type MoodImg=typeof MOOD_KEYS[number];
const known=new Set<string>(MOOD_KEYS),cache=new Map<string,HTMLCanvasElement>();
function rand(seed:number){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
function cloud(g:CanvasRenderingContext2D,w:number,h:number,color:string,seed:number,n:number){const r=rand(seed);for(let i=0;i<n;i++){const x=r()*w,y=h*(.27+r()*.45),rx=w*(.06+r()*.14),ry=h*(.22+r()*.26);for(const xx of [x-w,x,x+w]){g.save();g.translate(xx,y);g.scale(rx,ry);const gr=g.createRadialGradient(0,0,0,0,0,1);gr.addColorStop(0,color+'66');gr.addColorStop(.5,color+'33');gr.addColorStop(1,color+'00');g.fillStyle=gr;g.beginPath();g.arc(0,0,1,0,Math.PI*2);g.fill();g.restore()}}}
function draw(g:CanvasRenderingContext2D,k:MoodImg,w:number,h:number){const r=rand([...k].reduce((a,c)=>a*31+c.charCodeAt(0),7));g.lineCap='round';g.lineJoin='round';
 if(k.startsWith('sky_')&&k!=='sky_starriver'||k.startsWith('mist_')||k==='cooking_smoke'){
  const color=k==='sky_dusk_glow'?'#f2b18b':k==='sky_dawn_mist'?'#d9e9e1':k==='cooking_smoke'?'#c9c4b9':'#dce8e8';cloud(g,w,h,color,[...k].reduce((a,c)=>Math.imul(a,31)+c.charCodeAt(0),17),k.startsWith('mist_puff')?10:18);return;
 }
 if(k==='sky_starriver'){for(let i=0;i<150;i++){const x=r()*w,y=r()*h,rad=.35+r()*1.2;g.fillStyle=`rgba(220,231,255,${.2+r()*.7})`;g.beginPath();g.arc(x,y,rad,0,Math.PI*2);g.fill()}return}
 if(k==='moon_full'||k==='moon_crescent'){
  g.fillStyle='#f3efd5';g.beginPath();g.arc(w/2,h/2,h*.36,0,Math.PI*2);g.fill();
  if(k==='moon_crescent'){g.globalCompositeOperation='destination-out';g.beginPath();g.arc(w*.63,h*.38,h*.33,0,Math.PI*2);g.fill();g.globalCompositeOperation='source-over'}else{g.save();g.beginPath();g.arc(w/2,h/2,h*.36,0,Math.PI*2);g.clip();for(let i=0;i<18;i++){g.fillStyle='rgba(120,125,121,.1)';g.beginPath();g.arc(w*.23+r()*w*.54,h*.23+r()*h*.54,2+r()*5,0,Math.PI*2);g.fill()}g.restore()}return;
 }
 if(k==='rain_veil'){g.strokeStyle='rgba(204,222,235,.35)';g.lineWidth=1;for(let i=0;i<100;i++){const x=r()*w,y=r()*h;g.beginPath();g.moveTo(x,y);g.lineTo(x-5,y+13+r()*16);g.stroke()}return}
 if(k==='paper_grain'){for(let i=0;i<3000;i++){const x=r()*w,y=r()*h;g.fillStyle=r()<.5?'rgba(50,38,24,.12)':'rgba(255,247,222,.22)';g.fillRect(x,y,1+r()*2,1+r()*3)}return}
 if(k==='ink_vignette'){const gr=g.createRadialGradient(w/2,h/2,h*.32,w/2,h/2,w*.7);gr.addColorStop(0,'rgba(25,20,17,0)');gr.addColorStop(.65,'rgba(25,20,17,.02)');gr.addColorStop(1,'rgba(25,20,17,.5)');g.fillStyle=gr;g.fillRect(0,0,w,h);return}
 if(k==='wild_geese'){g.strokeStyle='#3d4c50';g.lineWidth=3;for(let i=0;i<9;i++){const x=40+i*47,y=35+Math.abs(4-i)*13;g.beginPath();g.moveTo(x-11,y-4);g.quadraticCurveTo(x-5,y-3,x,y+2);g.quadraticCurveTo(x+5,y-3,x+11,y-4);g.stroke()}return}
 if(k==='lone_sail'){g.fillStyle='#534d45';g.beginPath();g.moveTo(40,90);g.lineTo(215,90);g.lineTo(186,110);g.lineTo(65,110);g.fill();g.strokeStyle='#605347';g.lineWidth=4;g.beginPath();g.moveTo(126,92);g.lineTo(126,16);g.stroke();g.fillStyle='#e3d5b3';g.beginPath();g.moveTo(130,20);g.lineTo(192,80);g.lineTo(130,80);g.fill();return}
 if(k==='fishing_light'){const gr=g.createRadialGradient(w/2,h/2,1,w/2,h/2,h*.47);gr.addColorStop(0,'#fff3c0dd');gr.addColorStop(.2,'#ffbe6977');gr.addColorStop(1,'#ff9c3c00');g.fillStyle=gr;g.fillRect(0,0,w,h);return}
 // 花枝与芦苇：简单线条，可直接作为世界层叠加。
 g.strokeStyle=k==='plum_branch'?'#59433b':'#718170';g.lineWidth=3;
 for(let i=0;i<10;i++){const x=15+i*w/11,y=h*(.25+r()*.4);g.beginPath();g.moveTo(x,h);g.quadraticCurveTo(x-10,y+25,x+(r()-.5)*30,y);g.stroke();g.fillStyle=k==='plum_branch'?'#e3a2a6':k==='lotus_withered'?'#a9997b':'#8d9e88';g.beginPath();g.ellipse(x,y,5,9,r(),0,Math.PI*2);g.fill()}
}
export function moodImage(k:string):HTMLCanvasElement|null{
 if(!known.has(k))return null;const key=k as MoodImg,old=cache.get(key);if(old)return old;
 const dims:Record<string,[number,number]>={sky_cloud_band:[512,128],sky_dawn_mist:[512,128],sky_dusk_glow:[512,128],sky_starriver:[512,128],mist_band:[512,128],rain_veil:[256,256],paper_grain:[256,256],wild_geese:[512,128],lone_sail:[256,128],cooking_smoke:[128,256],ink_vignette:[512,512]};const [w,h]=dims[key]??[256,256];
 try{const c=makeCanvas(w,h),g=c.getContext('2d');if(!g)return null;draw(g,key,w,h);cache.set(key,c);return c}catch{return null}
}
