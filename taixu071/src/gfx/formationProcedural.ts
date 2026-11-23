// 阵纹与破禁盘：固定尺寸、按需生成并缓存，透明背景可叠于世界和界面。
import { makeCanvas } from '../core/canvas';
const colors: Record<string,string> = {
  kun:'#d5b681', mizong:'#a7b9dc', wuxing:'#e4c87c', gengjin:'#f6e5a6', wulei:'#91baff', dihuo:'#ff8c51', xuanwu:'#73c1dc', liangyi:'#d6b8ed', juling:'#84d6bd', huichun:'#9fdb98', lianxi:'#a7d7ce', gujin:'#ca8cf4', hushan:'#e6bd6f',
  jin:'#e9c668', mu:'#7fca80', shui:'#74bde3', huo:'#ec8060', tu:'#c6a275', mo:'#bb76cd', trap:'#e15b51', broken:'#8b949a',
};
const circles=['kun','mizong','wuxing','gengjin','wulei','dihuo','xuanwu','liangyi','juling','huichun','lianxi','gujin','hushan'];
export const FORMATION_KEYS = [...circles.map(x=>'zf_'+x), 'zf_layer_band', 'zf_layer_outer', 'zf_layer_bagua', 'zf_layer_core', 'ui_board', ...['jin','mu','shui','huo','tu','trap','broken'].map(x=>'ui_node_'+x)];
const keys=new Set(FORMATION_KEYS), cache=new Map<string,HTMLCanvasElement>();
const tau=Math.PI*2;
function ring(g:CanvasRenderingContext2D,r:number){g.beginPath();g.arc(128,128,r,0,tau);g.stroke()}
function shape(g:CanvasRenderingContext2D,n:number,r:number,step=1,offset=-Math.PI/2){g.beginPath();for(let j=0;j<=n;j++){const a=offset+j*step*tau/n,x=128+Math.cos(a)*r,y=128+Math.sin(a)*r;j?g.lineTo(x,y):g.moveTo(x,y)}g.stroke()}
function glyph(g:CanvasRenderingContext2D,x:number,y:number,angle:number,i:number){g.save();g.translate(x,y);g.rotate(angle);g.beginPath();g.moveTo(-5,-5);g.lineTo(5,-5);g.moveTo(-5,0);g.lineTo(5,0);g.moveTo(-5,5);g.lineTo(5,5);if(i%2){g.moveTo(0,-7);g.lineTo(0,7)}g.stroke();g.restore()}
function draw(g:CanvasRenderingContext2D,key:string){
  const id=key.replace(/^(zf_|ui_node_)/,''), idx=id==='layer_outer'?1:id==='layer_bagua'?2:id==='layer_core'?3:Math.max(0,circles.indexOf(id));
  const col=colors[id] || '#e4c785';g.lineJoin='round';g.lineCap='round';g.strokeStyle=col;g.fillStyle=col;
  if(key.startsWith('ui_node_')){
    const gr=g.createRadialGradient(128,110,4,128,128,116);gr.addColorStop(0,col);gr.addColorStop(.45,col+'bb');gr.addColorStop(1,col+'00');g.fillStyle=gr;g.beginPath();g.arc(128,128,116,0,tau);g.fill();
    g.strokeStyle=col;g.lineWidth=6;ring(g,79);g.lineWidth=3;shape(g,id==='trap'?3:6,60);ring(g,43);
    g.beginPath();if(id==='broken'){g.moveTo(100,92);g.lineTo(136,120);g.lineTo(116,140);g.lineTo(154,169)}else if(id==='trap'){g.moveTo(128,84);g.lineTo(128,139);g.moveTo(128,158);g.lineTo(128,162)}else{g.moveTo(128,92);g.lineTo(148,128);g.lineTo(128,164);g.lineTo(108,128);g.closePath()}g.lineWidth=7;g.stroke();return;
  }
  const board=key==='ui_board',band=key==='zf_layer_band';
  if(board){g.fillStyle='rgba(30,25,20,0.88)';g.beginPath();g.arc(128,128,120,0,tau);g.fill()}
  g.strokeStyle=col;g.lineWidth=board?5:3;ring(g,116);ring(g,106);g.lineWidth=1.5;ring(g,86);
  const n=band?24:board?16:8+(idx%5)*2;
  for(let i=0;i<n;i++){const a=i*tau/n;glyph(g,128+Math.cos(a)*96,128+Math.sin(a)*96,a+Math.PI/2,i+idx)}
  if(!band){g.lineWidth=2;shape(g,5+idx%4,78,1);shape(g,5+idx%4,78,2);ring(g,55);ring(g,45);g.lineWidth=1.5;shape(g,4+idx%3,40,1);for(let i=0;i<8;i++){const a=i*tau/8;g.beginPath();g.arc(128+Math.cos(a)*68,128+Math.sin(a)*68,3,0,tau);g.fill()}}
}
export function formationImage(key:string):HTMLCanvasElement|null {
  if(!keys.has(key)) return null;const old=cache.get(key);if(old)return old;
  try {const c=makeCanvas(256,256),g=c.getContext('2d');if(!g)return null;draw(g,key);cache.set(key,c);return c}catch{return null}
}
export function isFormationImage(key:string){return keys.has(key)}
