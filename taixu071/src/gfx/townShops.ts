// 商铺与宗门殿阁程序立面：功能与门位仍由既有布局定义，外观数据仅负责绘制。
import { makeCanvas } from '../core/canvas';
import { capCanvasCache } from './canvasBudget';
import { BLD2 } from './bld2Dims';
type G=CanvasRenderingContext2D;
type Goods='herb'|'tea'|'wine'|'sword'|'scroll'|'auction'|'food'|'fish'|'none';
interface ShopSpec { floors:1|2|3|4; goods:Goods; roof:'grey'|'jade'|'gold'; wings?:boolean; shrine?:boolean; stilts?:boolean; cave?:boolean; fortress?:boolean; lighthouse?:boolean; tent?:boolean; pavilion?:boolean; altar?:boolean; drum?:boolean; bell?:boolean; flags?:boolean }
const SPECS:Record<string,ShopSpec>={
 b16:{floors:1,goods:'herb',roof:'grey'},b17:{floors:2,goods:'tea',roof:'grey'},b18:{floors:4,goods:'wine',roof:'grey'},
 b37a:{floors:1,goods:'sword',roof:'jade'},b37b:{floors:1,goods:'scroll',roof:'grey'},b38:{floors:2,goods:'auction',roof:'gold'},
 j10:{floors:1,goods:'tea',roof:'grey',wings:true},b23a:{floors:1,goods:'herb',roof:'grey'},b23b:{floors:1,goods:'food',roof:'grey'},b23c:{floors:1,goods:'scroll',roof:'grey'},x09b:{floors:1,goods:'fish',roof:'grey'},
 b27:{floors:1,goods:'none',roof:'grey',wings:true},b28:{floors:1,goods:'none',roof:'grey',shrine:true},b32:{floors:1,goods:'none',roof:'grey'},x11:{floors:1,goods:'none',roof:'jade'},
};
export const TOWN_SHOP_KEYS=Object.keys(SPECS);
// 宗门殿阁与公共建筑保留原布局、门位与交互；按族系定义外观。
const SECTS:Record<string,ShopSpec>={
 b01:{floors:1,goods:'none',roof:'jade',wings:true},b06:{floors:1,goods:'none',roof:'grey',wings:true},b07:{floors:4,goods:'none',roof:'grey'},b08:{floors:1,goods:'herb',roof:'grey'},b09:{floors:1,goods:'none',roof:'grey',wings:true},b42:{floors:1,goods:'none',roof:'grey',cave:true},b43:{floors:2,goods:'none',roof:'grey',wings:true},b44:{floors:1,goods:'scroll',roof:'grey'},
 f10_hall:{floors:1,goods:'none',roof:'grey',wings:true},f10_workshop:{floors:1,goods:'sword',roof:'grey',wings:true},f11_bamboo_tower:{floors:4,goods:'none',roof:'jade'},f11_hall:{floors:1,goods:'none',roof:'gold',wings:true},
 f1_hall_b:{floors:2,goods:'none',roof:'jade',wings:true},f1_luoyun_hall:{floors:2,goods:'none',roof:'jade',wings:true},f1_peak_pavilion:{floors:1,goods:'none',roof:'jade',shrine:true},f2_hall:{floors:2,goods:'none',roof:'gold',wings:true},f2_tower:{floors:4,goods:'none',roof:'gold'},f3_hall:{floors:1,goods:'none',roof:'grey',wings:true},
 f4_hall:{floors:1,goods:'none',roof:'grey',wings:true},f4_moon_tower:{floors:4,goods:'none',roof:'grey'},f4_music_pavilion:{floors:1,goods:'none',roof:'grey',shrine:true},f4_waterside:{floors:1,goods:'none',roof:'grey',wings:true,stilts:true},
 f5_bone_tower:{floors:4,goods:'none',roof:'grey'},f5_hall:{floors:1,goods:'none',roof:'grey',wings:true},f5_hall_b:{floors:1,goods:'wine',roof:'grey',wings:true},f5_hall_c:{floors:1,goods:'none',roof:'jade',wings:true},f6_hall:{floors:1,goods:'none',roof:'grey',wings:true},f6_watchtower:{floors:2,goods:'none',roof:'grey',stilts:true},f7_hall:{floors:1,goods:'none',roof:'gold',wings:true},f8_hall:{floors:2,goods:'none',roof:'grey',stilts:true},f8_stilt_house:{floors:2,goods:'none',roof:'grey',stilts:true},f9_keep:{floors:2,goods:'none',roof:'grey',fortress:true},f9_tower:{floors:2,goods:'none',roof:'grey',fortress:true},
};
export const SECT_BUILDING_KEYS=Object.keys(SECTS);
// 当前镇、岛、集市仍使用的其余公共建筑与特种立面。
const SPECIAL:Record<string,ShopSpec>={
 x08:{floors:1,goods:'none',roof:'gold',lighthouse:true},j03_corner:{floors:2,goods:'none',roof:'grey',fortress:true},
 t05:{floors:1,goods:'none',roof:'gold',tent:true},t04:{floors:1,goods:'none',roof:'grey',wings:true,flags:true},t03:{floors:2,goods:'none',roof:'gold',lighthouse:true},
 b10:{floors:2,goods:'none',roof:'grey',bell:true},b10b:{floors:2,goods:'none',roof:'grey',drum:true},b12:{floors:4,goods:'none',roof:'gold'},
 b11a:{floors:1,goods:'none',roof:'jade',pavilion:true},b11b:{floors:1,goods:'none',roof:'grey',pavilion:true},b40:{floors:1,goods:'none',roof:'grey',wings:true},
 j18:{floors:1,goods:'none',roof:'grey',shrine:true},j07_hall:{floors:2,goods:'none',roof:'grey',wings:true},j09a:{floors:3,goods:'none',roof:'grey',wings:true},j09b:{floors:2,goods:'none',roof:'grey',wings:true},f5_blood_altar:{floors:1,goods:'none',roof:'grey',altar:true},
};
export const SPECIAL_BUILDING_KEYS=Object.keys(SPECIAL);
Object.assign(SPECS,SECTS,SPECIAL);
const cache=new Map<string,HTMLCanvasElement[]>();
function rect(g:G,x:number,y:number,w:number,h:number,c:string){g.fillStyle=c;g.fillRect(x,y,w,h)}
function line(g:G,p:number[],c:string,w=.5){g.beginPath();g.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)g.lineTo(p[i],p[i+1]);g.strokeStyle=c;g.lineWidth=w;g.lineCap='round';g.lineJoin='round';g.stroke()}
function poly(g:G,p:number[],fill:string,stroke:string,w=.7){g.beginPath();g.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)g.lineTo(p[i],p[i+1]);g.closePath();g.fillStyle=fill;g.fill();if(w){g.strokeStyle=stroke;g.lineWidth=w;g.stroke()}}
function oval(g:G,x:number,y:number,rx:number,ry:number,c:string){g.beginPath();g.ellipse(x,y,rx,ry,0,0,Math.PI*2);g.fillStyle=c;g.fill()}
function draw(g:G,key:string,spec:ShopSpec,v:string){
 const dim=BLD2[key],dark=v==='dark'||(!v&&key.startsWith('f5_')),snow=v==='snow',rose=v==='rose'||key.startsWith('f4_');
 const ink=dark?'#3e3735':'#55483e',wood=dark?'#614c46':'#86634d',wall=snow?'#d2d9d1':dark?'#96897e':'#d1c4aa',stone=snow?'#afbeba':'#aba594';
 const roof=snow?'#cad5d1':dark?'#555258':rose?'#918184':spec.roof==='jade'?'#6e9388':spec.roof==='gold'?'#a09268':'#6b7975';
 const floorTop=spec.floors===1?37:spec.floors===2?44:64,doorX=50+(dim.dx??0)/dim.w*100,doorW=Math.max(7,Math.min(22,(dim.door??dim.w*.15)/dim.w*100));
 function eave(y:number,width:number,height:number){
  poly(g,[50-width/2,y+height,50-width*.4,y+height*.78,50-width*.31,y+height*.14,50-width*.25,y,50+width*.25,y,50+width*.31,y+height*.14,50+width*.4,y+height*.78,50+width/2,y+height,50+width*.33,y+height*.9,50-width*.33,y+height*.9],roof,ink,.7);
  for(let i=0;i<19;i++){const x=50-width*.3+i*width*.6/18;line(g,[50+(x-50)*.82,y+height*.1,x,y+height*.78], '#a8b1a3',.3)}line(g,[50-width*.34,y+height*.8,50+width*.34,y+height*.8],ink,.6);
 }
 function window(x:number,y:number,w:number,h:number){rect(g,x-w/2-1,y-1,w+2,h+2,wood);rect(g,x-w/2,y,w,h, '#c9bda0');line(g,[x,y,x,y+h],wood,.5);line(g,[x-w/2,y+h/2,x+w/2,y+h/2],wood,.5)}
 function goods(x:number,y:number,type:Goods){
  if(type==='herb'){rect(g,x-3,y-2,6,4, '#a7825e');line(g,[x,y-2,x,y-8], '#718962',1);line(g,[x,y-5,x-4,y-7], '#7e9968',1);line(g,[x,y-6,x+4,y-9], '#8ba76f',1)}
  if(type==='tea'||type==='wine'){for(const dx of [-4,3]){poly(g,[x+dx-2,y-4,x+dx+2,y-4,x+dx+1.5,y+1,x+dx-1.5,y+1], '#a78b69',ink,.4);line(g,[x+dx-2,y-4,x+dx+2,y-4],ink,.45)}}
  if(type==='sword'){line(g,[x-4,y+2,x+1,y-10], '#cad0c4',1.4);line(g,[x-4,y-1,x,y+1],wood,.8);line(g,[x+2,y+2,x+7,y-8], '#cad0c4',1.2)}
  if(type==='scroll'){for(const dx of [-4,0,4]){rect(g,x+dx-1,y-8,2,9, '#d8c596');line(g,[x+dx-1,y-4,x+dx+1,y-4], '#a07158',.4)}}
  if(type==='food'){for(const dx of [-5,0,5])oval(g,x+dx,y-2,2.2,2, '#bb8e64')}
  if(type==='fish'){for(const dx of [-4,3]){oval(g,x+dx,y-3,3,1.5,'#a4b4ad');poly(g,[x+dx+2,y-3,x+dx+4,y-5,x+dx+4,y-1], '#a4b4ad',ink,.2)}}
  if(type==='auction'){oval(g,x,y-4,3,4, '#bb9d6e');line(g,[x-2,y,x+2,y],ink,.6)}
 }
 // 海岛灯塔与西域佛塔采用竖向塔身，保留原有门心和比例。
 if(spec.lighthouse){
  poly(g,[28,91,34,28,39,19,61,19,66,28,72,91],snow?'#d5dddb':'#c9c5b5',ink,.7);
  rect(g,20,90,60,6,stone);rect(g,24,88,52,3,ink);for(let y=35;y<76;y+=13){rect(g,47,y,6,6,wood);line(g,[47,y+3,53,y+3],ink,.4)}
  rect(g,doorX-doorW/2,79,doorW,12,ink);rect(g,doorX-doorW*.38,80,doorW*.76,11,wood);
  if(key==='x08'){rect(g,38,12,24,10,wood);rect(g,41,13,18,7,'#e7d9a4');eave(5,35,9)}else{poly(g,[39,19,44,8,50,3,56,8,61,19],'#d3c8a1',ink,.6);oval(g,50,4,3,2,'#c8a860');eave(70,58,8)}return;
 }
 if(spec.tent){
  poly(g,[7,90,11,52,30,34,50,8,70,34,89,52,93,90],snow?'#dedbd0':'#d6c6a5',ink,.8);
  poly(g,[28,38,50,9,72,38], '#bca886',ink,.6);for(let i=0;i<5;i++)line(g,[32+i*9,38,50,12], '#ede4ca',.5);
  rect(g,14,52,72,38,wall);rect(g,doorX-doorW/2,60,doorW,30,ink);rect(g,doorX-doorW*.4,62,doorW*.8,28,wood);for(const x of [21,79])window(x,58,13,14);poly(g,[8,89,92,89,96,95,4,95],stone,ink,.5);return;
 }
 if(spec.altar){
  poly(g,[5,92,23,74,77,74,95,92],stone,ink,.8);poly(g,[12,87,26,75,74,75,88,87], '#713b3a',ink,.6);
  rect(g,24,39,52,36,wall);for(const x of [28,40,60,72])rect(g,x-1.5,39,3,35,wood);rect(g,42,47,16,27,ink);eave(20,72,20);
  for(let i=0;i<3;i++)line(g,[15+i*4,91-i*5,85-i*4,91-i*5],'#d6c3a8',.5);return;
 }
 // 洞府：岩壁中的洞门；按门心元数据布置，不以民居立面代替。
 if(spec.cave){
  poly(g,[3,94,8,36,20,21,35,14,67,14,83,25,94,45,98,94],snow?'#a7b3ac':'#8e8a79',ink,.9);
  for(let i=0;i<8;i++)line(g,[10+i*11,89,13+i*11,58-(i%3)*9,9+i*11,45-(i%2)*12], '#6d6d61',.5);
  rect(g,doorX-doorW*.65,50,doorW*1.3,43,ink);rect(g,doorX-doorW*.48,52,doorW*.96,41,'#777d70');rect(g,doorX-doorW*.34,55,doorW*.68,37,'#9c9d87');line(g,[doorX,55,doorX,92],ink,.6);poly(g,[doorX-doorW,93,doorX+doorW,93,doorX+doorW*1.1,97,doorX-doorW*1.1,97],stone,ink,.5);return;
 }
 // 高架建筑主体抬起，立柱落在原锚线上，主体仍保持原有宽高与门心。
 if(spec.stilts){g.save();g.translate(0,-14)}
 // 台基与主体，保留原图元数据的地脚位置。
 poly(g,[4,90,96,90,98,95,2,95],stone,ink,.6);line(g,[3,92,97,92],ink,.4);
 const houseL=spec.wings?20:9,houseR=100-houseL;
 if(spec.wings){rect(g,3,66,94,23,stone);line(g,[3,66,97,66],ink,1.2)}
 rect(g,houseL,floorTop,houseR-houseL,90-floorTop,wall);
 for(const x of [houseL,houseR,houseL+(houseR-houseL)*.22,houseR-(houseR-houseL)*.22])rect(g,x-.9,floorTop,1.8,90-floorTop,wood);
 const floorH=(floorTop-14)/Math.max(1,spec.floors-1);
 if(spec.floors>1){
  for(let i=spec.floors-1;i>=1;i--){const y=floorTop-floorH*i,width=Math.max(46,82-i*6);rect(g,50-width/2,y+5,width,floorH-4,wall);for(const x of [50-width*.35,50-width*.12,50+width*.12,50+width*.35])window(x,y+floorH*.32,Math.max(4,width*.12),Math.max(4,floorH*.4));eave(y,width+10,6)}
  eave(7,Math.max(51,90-(spec.floors-1)*7),8);
 }else eave(15,spec.wings?70:96,24);
 for(const x of [houseL+12,houseR-12])window(x,floorTop+9,14,14);
 // 店面两侧陈列，仅画在窗下，中央仍留给门与交互牌匾。
 if(spec.goods!=='none'){rect(g,houseL+3,78,17,3,wood);rect(g,houseR-20,78,17,3,wood);goods(houseL+11.5,78,spec.goods);goods(houseR-11.5,78,spec.goods)}
 if(!spec.fortress){rect(g,doorX-doorW/2-1,61,doorW+2,29,ink);rect(g,doorX-doorW/2,62,doorW,28,wood);line(g,[doorX,62,doorX,90],ink,.65);}
 if(spec.shrine)rect(g,doorX-doorW*.36,65,doorW*.72,25, '#403b36');
 if(spec.goods!=='none'){rect(g,doorX-10,55,20,5,wood);rect(g,doorX-8.5,56,17,3, '#d2c2a1');line(g,[doorX-5,57.5,doorX+5,57.5],ink,.5)}
 if(spec.goods==='wine'||spec.goods==='auction'){for(const x of [houseL+5,houseR-5]){line(g,[x,48,x,53],wood,.5);oval(g,x,56,2.4,3.5,rose?'#bd8082':'#b76350')}}
 poly(g,[doorX-doorW*.6,90,doorX+doorW*.6,90,doorX+doorW*.83,96,doorX-doorW*.83,96],stone,ink,.4);for(let y=91;y<96;y+=1.4)line(g,[doorX-doorW*.62,y,doorX+doorW*.62,y],ink,.25);
 if(spec.pavilion){
  rect(g,houseL+4,55,houseR-houseL-8,31,'#514c44');for(const x of [houseL+6,houseL+20,houseR-20,houseR-6])rect(g,x-1,49,2,41,wood);
  rect(g,doorX-doorW/2,61,doorW,29,'#353c39');for(let x=houseL+5;x<houseR-4;x+=5)line(g,[x,82,x,89],stone,.5);line(g,[houseL+4,82,houseR-4,82],stone,1);
 }
 if(spec.bell||spec.drum){
  if(spec.bell){poly(g,[42,36,44,26,56,26,58,36], '#b8a476',ink,.5);oval(g,50,37,8,2,ink);line(g,[50,22,50,26],ink,.7)}
  else {oval(g,50,31,9,8,'#a54e42');oval(g,50,31,7,6,'#c36d55');line(g,[41,39,59,39],wood,1)}
 }
 if(spec.flags){for(let i=0;i<9;i++)rect(g,10+i*9,48,8,4,['#cc9b55','#a8b7ac','#bc7054','#779d9a'][i%4])}
 if(spec.fortress){
  poly(g,[7,70,93,70,98,93,2,93],stone,ink,.8);for(let y=75;y<92;y+=5){line(g,[5,y,95,y],ink,.3);for(let x=14+(y%2)*3;x<94;x+=15)line(g,[x,y,x,y+5],ink,.25)}
  rect(g,doorX-doorW*.55,74,doorW*1.1,19,ink);rect(g,doorX-doorW*.43,76,doorW*.86,17,wood);line(g,[doorX,76,doorX,93],ink,.6);
 }
 if(spec.stilts){g.restore();for(const x of [15,28,72,85]){rect(g,x-1.1,76,2.2,20,wood);line(g,[x-1,94,x+8,78],wood,.6)}line(g,[12,89,88,89],wood,1)}
}
export function townShopMips(key:string):HTMLCanvasElement[]|null{
 const [base,variant='']=key.split('|');if(!Object.prototype.hasOwnProperty.call(SPECS,base)||!BLD2[base]||typeof document==='undefined')return null;
 const v=variant==='dark'||variant==='snow'||variant==='rose'?variant:'',id=base+'|'+v,hit=cache.get(id);if(hit)return hit;
 try{const d=BLD2[base],scale=Math.min(1,512/Math.max(d.w,d.h)),cv=makeCanvas(Math.max(32,Math.round(d.w*scale)),Math.max(32,Math.round(d.h*scale))),g=cv.getContext('2d');if(!g)return null;g.scale(cv.width/100,cv.height/100);draw(g,base,SPECS[base],v);const m=[cv];let prev=cv;for(let i=0;i<4;i++){const w=Math.round(prev.width/2),h=Math.round(prev.height/2);if(w<16||h<16)break;const next=makeCanvas(w,h),ctx=next.getContext('2d');if(!ctx)break;ctx.drawImage(prev,0,0,w,h);m.push(next);prev=next}cache.set(id,m);capCanvasCache(cache,id);return m}catch{return null}
}
