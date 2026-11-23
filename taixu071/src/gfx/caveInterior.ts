// 洞府静态场景，所有功能位置共用同一套逻辑坐标，首次使用时程序生成并缓存。
import {makeCanvas} from '../core/canvas';
export const CAVE_WIDTH=1600,CAVE_HEIGHT=900;
export const CAVE_SPOTS=[
 {id:'exit',x:70,y:660,r:150,name:'洞门',hint:'出洞府'},
 {id:'spring',x:330,y:660,r:150,name:'灵泉',hint:'泉边打坐（灵气加成）'},
 {id:'seat',x:620,y:680,r:130,name:'蒲团',hint:'入定 / 闭关'},
 {id:'furnace',x:880,y:680,r:130,name:'丹炉',hint:'炼丹 / 炼器'},
 {id:'garden',x:1180,y:680,r:160,name:'药园',hint:'打理药园'},
 {id:'bed',x:1450,y:680,r:150,name:'石榻',hint:'洞府事务'},
];
type G=CanvasRenderingContext2D;
function path(g:G,p:number[],fill:string,stroke?:string){g.beginPath();g.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)g.lineTo(p[i],p[i+1]);g.closePath();g.fillStyle=fill;g.fill();if(stroke){g.strokeStyle=stroke;g.lineWidth=4;g.stroke()}}
function ellipse(g:G,x:number,y:number,rx:number,ry:number,fill:string){g.fillStyle=fill;g.beginPath();g.ellipse(x,y,rx,ry,0,0,Math.PI*2);g.fill()}
function draw(g:G){
 const w=CAVE_WIDTH,h=CAVE_HEIGHT,wall=g.createLinearGradient(0,0,0,650);wall.addColorStop(0,'#252a2b');wall.addColorStop(.65,'#4b4840');wall.addColorStop(1,'#645a49');g.fillStyle=wall;g.fillRect(0,0,w,h);
 // 岩顶与石壁，后景使用低对比纹理，留出角色轮廓。
 path(g,[0,0,1600,0,1600,150,1480,100,1360,144,1200,80,1050,130,900,70,730,125,550,82,380,135,220,91,0,160],'#1d2324');
 g.strokeStyle='rgba(20,25,24,.34)';g.lineWidth=5;for(let i=0;i<13;i++){const x=(i*137+35)%1600,y=145+(i%3)*100;g.beginPath();g.moveTo(x,y);g.lineTo(x+24,y+33);g.lineTo(x+5,y+62);g.stroke()}
 const floor=g.createLinearGradient(0,550,0,900);floor.addColorStop(0,'#4c4b42');floor.addColorStop(1,'#262d2b');g.fillStyle=floor;g.fillRect(0,560,w,340);
 g.strokeStyle='rgba(190,180,150,.11)';g.lineWidth=2;for(let j=0;j<6;j++){let y=590+j*58;g.beginPath();g.moveTo(0,y);g.quadraticCurveTo(800,y-15,1600,y);g.stroke();for(let i=0;i<9;i++){let x=i*210+(j%2)*98;g.beginPath();g.moveTo(x,y);g.lineTo(x-30,y+52);g.stroke()}}
 // 洞口：石框与外界微光。
 g.fillStyle='#1b2928';g.beginPath();g.moveTo(0,560);g.lineTo(0,245);g.quadraticCurveTo(80,190,137,278);g.lineTo(155,560);g.fill();g.strokeStyle='#827a67';g.lineWidth=16;g.beginPath();g.moveTo(0,252);g.quadraticCurveTo(80,190,137,278);g.lineTo(155,560);g.stroke();
 const door=g.createLinearGradient(0,260,110,560);door.addColorStop(0,'#638d80');door.addColorStop(1,'#263c37');g.fillStyle=door;g.fillRect(0,330,82,227);
 // 泉池
 ellipse(g,330,566,150,50,'#3f524d');ellipse(g,330,554,132,36,'#397e79');ellipse(g,330,548,102,23,'#5ca59b');g.strokeStyle='rgba(201,244,225,.55)';g.lineWidth=3;for(let i=0;i<3;i++){g.beginPath();g.ellipse(300+i*32,551,20+i*4,5,0,0,Math.PI*2);g.stroke()}
 // 蒲团和一方石案
 ellipse(g,620,595,72,22,'#262924');ellipse(g,620,586,68,22,'#8a7850');ellipse(g,620,580,60,18,'#bba672');g.strokeStyle='#e0c995';g.lineWidth=2;for(let i=-2;i<=2;i++){g.beginPath();g.moveTo(575,580+i*5);g.quadraticCurveTo(620,588+i*5,665,580+i*5);g.stroke()}
 // 丹炉：炉足、主体、盖与火光
 const glow=g.createRadialGradient(880,470,5,880,470,160);glow.addColorStop(0,'rgba(237,146,67,.35)');glow.addColorStop(1,'rgba(237,146,67,0)');g.fillStyle=glow;g.fillRect(700,300,360,320);
 path(g,[817,572,833,555,840,605,822,611],'#574237');path(g,[922,555,940,570,936,611,920,605],'#574237');ellipse(g,880,551,76,50,'#5e4935');ellipse(g,880,534,74,49,'#8b6545');ellipse(g,880,516,61,15,'#b49460');ellipse(g,880,505,47,12,'#67503b');path(g,[860,498,878,474,901,498],'#c0a273');g.strokeStyle='#ddbc7d';g.lineWidth=3;g.beginPath();g.arc(880,538,20,0,Math.PI*2);g.stroke();
 // 药园：石砌花圃与不同形态药草
 path(g,[1050,548,1300,548,1332,590,1020,590],'#766c51','#3d3e32');path(g,[1056,550,1294,550,1311,577,1038,577],'#4b4430');
 for(let i=0;i<9;i++){const x=1060+i*28,y=564+(i%2)*5;g.strokeStyle='#82ad77';g.lineWidth=3;g.beginPath();g.moveTo(x,y);g.quadraticCurveTo(x-5,y-22,x+4,y-40-(i%3)*4);g.stroke();ellipse(g,x-5,y-23,9,4,'#6b9a66');ellipse(g,x+8,y-31,9,4,'#9dbb7d');ellipse(g,x+4,y-43-(i%3)*4,4,5,i%3?'#d8c782':'#d8a5b6')}
 // 石榻与靠枕
 path(g,[1340,540,1552,540,1580,585,1325,585],'#756e5b','#373a33');path(g,[1325,585,1580,585,1580,610,1325,610],'#494d43');path(g,[1362,539,1535,539,1547,558,1350,558],'#65756b');path(g,[1370,525,1425,525,1435,540,1360,540],'#a9b9a2');
 // 壁灯
 for(const x of [170,1010,1540]){g.fillStyle='#3c3025';g.fillRect(x-4,350,8,60);ellipse(g,x,350,13,6,'#8e6e44');path(g,[x-7,347,x,325,x+7,347],'#edb86c');}
}
let cached:HTMLCanvasElement|null=null;
export function caveInterior():HTMLCanvasElement|null{if(cached)return cached;try{const c=makeCanvas(CAVE_WIDTH,CAVE_HEIGHT),g=c.getContext('2d');if(!g)return null;draw(g);cached=c;return c}catch{return null}}
