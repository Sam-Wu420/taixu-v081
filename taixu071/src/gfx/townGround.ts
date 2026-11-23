// 城镇与宗门程序铺装：有限种类，按需生成并缓存多级缩略；不依赖外部视觉素材。
import { makeCanvas } from '../core/canvas';
type G = CanvasRenderingContext2D;
export const TOWN_GROUND_KEYS = ['flag','flag2','slab','jade','farm','road','road2','farm2','d_jade','d_taiji','d_array','d_field','d_flower','d_flower2','d_steps'] as const;
const keys = new Set<string>(TOWN_GROUND_KEYS), cache = new Map<string, HTMLCanvasElement[]>();
const P = Math.PI;
function rect(g:G,x:number,y:number,w:number,h:number,c:string){g.fillStyle=c;g.fillRect(x,y,w,h)}
function ellipse(g:G,x:number,y:number,rx:number,ry:number,c:string){g.fillStyle=c;g.beginPath();g.ellipse(x,y,rx,ry,0,0,P*2);g.fill()}
function stroke(g:G,c:string,w:number,draw:()=>void){g.strokeStyle=c;g.lineWidth=w;g.beginPath();draw();g.stroke()}
function rnd(x:number,y:number,k:number){let n=Math.imul(x+11,374761393)+Math.imul(y+7,668265263)+Math.imul(k,1442695041);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295}

function tile(g:G,k:string){
 const stone:Record<string,[string,string,string]>={flag:['#a9a596','#8e8b7d','#c6c1ad'],flag2:['#918f87','#74746e','#b4b0a2'],slab:['#a8a99e','#848981','#c0c0af'],jade:['#9ea99e','#76877e','#c8d2c0']};
 if(stone[k]) {
  const [base,edge,light]=stone[k];rect(g,0,0,256,256,edge);
  const rows=k==='slab'?4:8, cols=k==='slab'?4:8, w=256/cols,h=256/rows;
  for(let y=0;y<rows;y++)for(let x=-1;x<cols;x++){
   const off=y%2?w/2:0, xx=x*w+off, yy=y*h; rect(g,xx+1,yy+1,w-2,h-2,base);
   if(rnd(x+4,y,3)>.57)rect(g,xx+2,yy+2,w-4,h-4,light);
   stroke(g,'rgba(49,54,48,.15)',1,()=>{g.moveTo(xx+4,yy+h-5);g.lineTo(xx+w-5,yy+h-5)});
  }
  return;
 }
 if(k==='farm'||k==='farm2'){
  rect(g,0,0,256,256,k==='farm'?'#857252':'#756346');
  for(let y=0;y<256;y+=32){rect(g,0,y+5,256,14,'#9c8963');rect(g,0,y+20,256,4,'#64533d');
   for(let x=12;x<256;x+=32){const xx=x+(rnd(x,y,7)-.5)*8;linePlant(g,xx,y+13,k==='farm'?'#688057':'#8a965d')}}
  return;
 }
 // 道路：横向干笔与细碎砂点，边界天然可平铺。
 rect(g,0,0,256,256,k==='road2'?'#a79a7d':'#b5a689');
 for(let y=0;y<256;y+=8) for(let x=0;x<256;x+=16){const v=rnd(x,y,k==='road'?4:9);rect(g,x,y,8+v*7,1+v*2,v>.5?'rgba(90,75,53,.17)':'rgba(235,220,190,.24)')}
}
function linePlant(g:G,x:number,y:number,col:string){stroke(g,col,2,()=>{g.moveTo(x,y+5);g.lineTo(x,y-3);g.moveTo(x,y+1);g.lineTo(x-4,y-3);g.moveTo(x,y);g.lineTo(x+4,y-4)})}
function ring(g:G,r:number,col:string,w=2){stroke(g,col,w,()=>g.arc(128,128,r,0,P*2))}
function decal(g:G,k:string){
 if(k==='d_field'||k==='d_flower'||k==='d_flower2'){
  ellipse(g,128,128,113,83,'rgba(91,76,51,.72)');ellipse(g,128,123,103,72,'#968461');
  for(let y=65;y<=185;y+=23)for(let x=48;x<=208;x+=25){if(((x-128)/105)**2+((y-123)/73)**2>1)continue;
   linePlant(g,x,y,k==='d_field'?'#627e4b':'#718d5b');
   if(k!=='d_field') ellipse(g,x,y-5,3.2,3.2,k==='d_flower'?'#e8bc9d':'#d8b9d8');
  }return;
 }
 if(k==='d_steps'){
  for(let i=0;i<5;i++){rect(g,32+i*3,46+i*32,192-i*6,28,'#a39b89');rect(g,32+i*3,70+i*32,192-i*6,4,'#746e63')}return;
 }
 // 阵台 / 玉饰 / 太极：透明外沿，随世界宽高压成椭圆，保留原落点。
 ellipse(g,128,128,112,112,'#8d9386'); ellipse(g,128,128,102,102,'#c4c9ba');
 ring(g,99,'#66746a',4);ring(g,88,'#e2e6d7',3); ring(g,75,'#738077',2);
 if(k==='d_taiji'){
  ellipse(g,128,128,60,60,'#d8dbca');g.fillStyle='#424a46';g.beginPath();g.arc(128,128,60,-P/2,P/2);g.arc(128,158,30,P/2,-P/2,true);g.arc(128,98,30,P/2,-P/2,false);g.fill();
  ellipse(g,128,98,6,6,'#e5e7dc');ellipse(g,128,158,6,6,'#3d4641');
 } else if(k==='d_array'){
  ring(g,54,'#8aa295',3); ring(g,34,'#7a9386',2);
  stroke(g,'#7a8f7f',2,()=>{for(let i=0;i<8;i++){const a=i*P/4;g.moveTo(128+58*Math.cos(a),128+58*Math.sin(a));g.lineTo(128+82*Math.cos(a),128+82*Math.sin(a))}});
  stroke(g,'#6a8171',2,()=>{for(let i=0;i<5;i++){const a=-P/2+i*4*P/5,x=128+46*Math.cos(a),y=128+46*Math.sin(a);if(i===0)g.moveTo(x,y);else g.lineTo(x,y)}g.closePath()});
 } else { ring(g,45,'#84978a',5); ellipse(g,128,128,22,22,'#a5b6a6'); }
}
export function townGroundMips(key:string): HTMLCanvasElement[] | null {
 if(!keys.has(key) || typeof document==='undefined') return null;
 const found=cache.get(key);if(found)return found;
 try {
  const cv=makeCanvas(256,256),g=cv.getContext('2d');if(!g)return null;
  if(key.startsWith('d_'))decal(g,key);else tile(g,key);
  const mips=[cv]; let prev=cv;
  for(let i=0;i<3;i++){const next=makeCanvas(prev.width/2,prev.height/2),c=next.getContext('2d');if(!c)break;c.imageSmoothingEnabled=true;c.drawImage(prev,0,0,next.width,next.height);mips.push(next);prev=next;}
  cache.set(key,mips);return mips;
 } catch {return null}
}
