// 人界名胜的程序画材。世界尺寸和地面锚点由 PROP2 提供，不改动玩法坐标。
import { makeCanvas } from '../core/canvas';
import { capCanvasCache } from './canvasBudget';
import { PROP2 } from './propDims';
type G = CanvasRenderingContext2D;
export const SCENIC_PROP_KEYS = ['p_s_tower','p_s_bridge','p_s_pagoda','p_s_buddha','p_s_temple','p_s_ruins','p_s_dock','p_s_pavilion','p_s_shuixie','p_s_zhulu','p_s_chapeng','p_s_shuiche'] as const;
const known = new Set<string>(SCENIC_PROP_KEYS);
const cache = new Map<string, HTMLCanvasElement[]>();
const PI = Math.PI;
function poly(g:G,p:number[],fill:string,edge='#55483c',w=0.8) {g.beginPath();g.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)g.lineTo(p[i],p[i+1]);g.closePath();g.fillStyle=fill;g.fill();if(w){g.strokeStyle=edge;g.lineWidth=w;g.stroke()}}
function rect(g:G,x:number,y:number,w:number,h:number,c:string){g.fillStyle=c;g.fillRect(x,y,w,h)}
function line(g:G,p:number[],color:string,w=0.7){g.beginPath();g.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)g.lineTo(p[i],p[i+1]);g.strokeStyle=color;g.lineWidth=w;g.lineCap='round';g.lineJoin='round';g.stroke()}
function oval(g:G,x:number,y:number,rx:number,ry:number,c:string){g.beginPath();g.ellipse(x,y,rx,ry,0,0,2*PI);g.fillStyle=c;g.fill()}
function roof(g:G,x:number,y:number,w:number,h:number,roofColor:string,edge:string){
 poly(g,[x-w/2,y+h,x-w*.36,y+h*.63,x-w*.17,y+h*.15,x,y,x+w*.17,y+h*.15,x+w*.36,y+h*.63,x+w/2,y+h,x+w*.34,y+h*.87,x-w*.34,y+h*.87],roofColor,edge,1);
 for(let i=-2;i<=2;i++){const k=i/7;line(g,[x+k*w*.45,y+h*.14,x+k*w*.8,y+h*.79],edge,.38)}
 line(g,[x-w*.35,y+h*.81,x+w*.35,y+h*.81], '#b1aa91',.45);
}
function platform(g:G,x:number,y:number,w:number,stone:string,edge:string){
 poly(g,[x-w/2,y,x-w*.4,y-5,x+w*.4,y-5,x+w/2,y,x+w/2,y+4,x-w/2,y+4],stone,edge,.8);
 line(g,[x-w*.48,y,x+w*.48,y],edge,.65);
}
function building(g:G,x:number,y:number,w:number,h:number,wall:string,wood:string,roofColor:string,edge:string,open=false){
 const left=x-w*.39,right=x+w*.39,top=y-h*.69,bottom=y;
 if(!open)rect(g,left,top,right-left,bottom-top,wall);
 for(let i=0;i<4;i++){const px=left+(right-left)*i/3;rect(g,px-1,top,2,bottom-top,wood)}
 line(g,[left,top+3,right,top+3],wood,1.3);line(g,[left,bottom-5,right,bottom-5],wood,1);
 if(!open){rect(g,x-w*.08,top+h*.28,w*.16,bottom-top-h*.28,edge);for(const px of [x-w*.25,x+w*.25]){rect(g,px-w*.055,top+h*.27,w*.11,h*.17,'#d1c7a9');line(g,[px-w*.05,top+h*.35,px+w*.05,top+h*.35],wood,.55);line(g,[px,top+h*.28,px,top+h*.44],wood,.55)}}
 else {line(g,[left,bottom-10,right,bottom-10],wood,1);for(let px=left+5;px<right;px+=6)line(g,[px,bottom-10,px,bottom-5],wood,.5);oval(g,x,bottom-6,w*.12,2,stoneColor(wall));}
 roof(g,x,top-h*.28,w*1.16,h*.34,roofColor,edge);
}
function stoneColor(c:string){return c==='#c1c8bf'?'#aab9b3':'#aaa18c'}
function scenic(g:G,key:string,variant:string){
 const dark=variant==='dark',snow=variant==='snow',rose=variant==='rose';
 const edge=dark?'#403b39':'#55483c',wood=dark?'#614b43':'#84614e',wall=snow?'#c1c8bf':dark?'#908579':'#d8c9aa',stone=snow?'#b6c5c3':'#b5ab97',roofColor=dark?'#50565a':rose?'#857579':'#657473';
 switch(key){
 case 'p_s_tower':
  platform(g,50,88,76,stone,edge);
  building(g,50,83,67,29,wall,wood,roofColor,edge);
  building(g,50,60,56,27,wall,wood,roofColor,edge);
  building(g,50,39,44,25,wall,wood,roofColor,edge);
  poly(g,[47,16,50,9,53,16], '#b5a17b',edge,.5);break;
 case 'p_s_bridge': {
  // 七孔均为透明孔洞，桥面仍按场景原尺寸与河宽对齐。
  poly(g,[2,61,10,53,28,47,50,44,72,47,90,53,98,61,98,82,2,82],stone,edge,.8);
  g.save();g.globalCompositeOperation='destination-out';
  for(let i=0;i<7;i++){const x=12+i*12.6,ry=8+(3-Math.abs(i-3))*1.3;g.beginPath();g.ellipse(x,82,5.2,ry,0,PI,2*PI);g.lineTo(x+5.2,84);g.lineTo(x-5.2,84);g.closePath();g.fill();}g.restore();
  line(g,[3,60,12,53,30,48,50,45,70,48,88,53,97,60],edge,1.2);
  line(g,[4,56,15,49,33,44,50,42,67,44,85,49,96,56],wood,1);
  for(let i=0;i<15;i++){const x=6+i*6.3,y=42+Math.abs(x-50)*.27;line(g,[x,y,x,y+5],stone,1.2)}
  for(let i=0;i<7;i++)line(g,[7+i*13,69,10+i*13,68],edge,.5);break;
 }
 case 'p_s_pagoda':
  platform(g,50,89,55,stone,edge);rect(g,44,17,12,68,wall);
  for(let i=0;i<9;i++){const y=79-i*7.2,w=45-i*3;rect(g,50-w*.36,y-4,w*.72,5,wall);rect(g,49,y-3,2,3,edge);poly(g,[50-w/2,y-4,50-w*.28,y-7,50+w*.28,y-7,50+w/2,y-4,50+w*.3,y-3,50-w*.3,y-3],roofColor,edge,.5)}
  line(g,[50,9,50,17],wood,1.4);oval(g,50,8,2,2,'#b8a074');break;
 case 'p_s_buddha':
  poly(g,[5,89,8,31,20,16,42,10,66,13,84,23,95,87], '#a58d79',edge,1);
  for(let x=12;x<=88;x+=9)for(let y=25;y<=70;y+=11){rect(g,x,y,4,6,'#7c6b60');oval(g,x+2,y+2,1,1.2,'#c9bba4')}
  oval(g,50,32,10,12,'#c6b59a');oval(g,50,22,7,5,edge);line(g,[44,32,47,33],edge,.5);line(g,[53,33,56,32],edge,.5);
  poly(g,[39,43,61,43,69,68,59,75,41,75,31,68], '#bbab90',edge,1);line(g,[39,48,34,63,46,69],edge,1);line(g,[61,48,66,63,54,69],edge,1);
  oval(g,50,78,26,8,stone);line(g,[26,80,74,80],edge,.7);break;
 case 'p_s_temple':
  platform(g,50,87,89,stone,edge);building(g,50,82,76,45,wall,wood,roofColor,edge);
  rect(g,44,51,12,31,edge);line(g,[50,52,50,82],wood,.8);poly(g,[10,57,20,48,29,48,29,80,10,80],wall,edge,.6);poly(g,[71,48,80,48,90,57,90,80,71,80],wall,edge,.6);
  for(const x of [22,78]){line(g,[x,62,x,79],wood,1);line(g,[x-4,67,x+4,67],wood,.6)}break;
 case 'p_s_ruins':
  poly(g,[5,87,14,72,25,77,35,65,51,75,67,67,81,73,95,88],stone,edge,1);
  for(const [x,h] of [[17,27],[29,36],[69,30],[82,23]]){poly(g,[x-4,78,x-3,78-h,x,82-h,x+3,76-h,x+4,78],wall,edge,.7)}
  line(g,[49,77,49,20], '#abb8b0',2.5);poly(g,[45,22,49,9,53,22], '#d0d5c7',edge,.5);line(g,[42,39,56,39],wood,1.7);break;
 case 'p_s_dock':
  poly(g,[6,78,13,68,64,68,78,77,78,83,6,83],wood,edge,.8);for(let x=14;x<69;x+=8)line(g,[x,69,x+3,80], '#b99972',.5);
  building(g,35,68,46,32,wall,wood,roofColor,edge,true);line(g,[17,84,17,90],wood,2);line(g,[63,82,63,89],wood,2);
  poly(g,[61,83,94,83,87,91,68,91],wood,edge,.7);poly(g,[71,82,74,75,84,75,87,82],edge);line(g,[67,88,88,88], '#c7ab80',.6);break;
 case 'p_s_pavilion':
  platform(g,50,88,70,stone,edge);building(g,50,83,56,51,wall,wood,roofColor,edge,true);poly(g,[47,26,50,20,53,26], '#beaa82',edge,.5);break;
 case 'p_s_shuixie':
  platform(g,50,84,88,stone,edge);building(g,50,79,67,39,wall,wood,roofColor,edge,true);
  for(const x of [18,35,65,82])line(g,[x,83,x,91],wood,1.8);line(g,[7,91,24,91,30,89,50,89,57,91,91,91], '#95b5ad',.8);break;
 case 'p_s_zhulu':
  platform(g,50,88,76,stone,edge);building(g,50,83,60,39,wall,wood,'#827b63',edge,true);
  for(const x of [10,17,83,90]){line(g,[x,88,x+2,23], '#7c906c',1.5);for(let y=30;y<80;y+=12){line(g,[x+1,y,x-5,y-6], '#7c906c',.6);line(g,[x+1,y+4,x+7,y-2], '#7c906c',.6)}}break;
 case 'p_s_chapeng':
  platform(g,50,88,78,stone,edge);building(g,50,83,68,36,wall,wood,'#a59773',edge,true);oval(g,49,75,10,2,stone);line(g,[42,75,41,83],wood,1);line(g,[56,75,57,83],wood,1);oval(g,49,73,3,1.5,wall);break;
 case 'p_s_shuiche':
  platform(g,44,87,67,stone,edge);building(g,37,82,53,37,wall,wood,roofColor,edge);
  line(g,[72,79,72,43],wood,2);g.strokeStyle=wood;g.lineWidth=2.7;g.beginPath();g.ellipse(74,64,18,21,0,0,2*PI);g.stroke();
  for(let i=0;i<8;i++){const a=i*PI/4;line(g,[74,64,74+Math.cos(a)*17,64+Math.sin(a)*20],wood,1.2);rect(g,73+Math.cos(a)*17,63+Math.sin(a)*20,3,3,wood)}oval(g,74,64,2.5,2.5,stone);line(g,[57,88,66,90,80,90,93,88], '#8cafa9',1);break;
 }
}
/** 按需生成并复用，未知键及无画布时返回 null。 */
export function scenicPropMips(key:string): HTMLCanvasElement[] | null {
 const [base,variant='']=key.split('|'); if(!known.has(base)||!PROP2[base]||typeof document==='undefined')return null;
 const v=variant==='dark'||variant==='snow'||variant==='rose'?variant:'',cacheKey=base+'|'+v,hit=cache.get(cacheKey);if(hit)return hit;
 try {
  const d=PROP2[base],scale=Math.min(1,512/Math.max(d.w,d.h)),cv=makeCanvas(Math.max(32,Math.round(d.w*scale)),Math.max(32,Math.round(d.h*scale)));
  const ctx=cv.getContext('2d');if(!ctx)return null;ctx.scale(cv.width/100,cv.height/100);scenic(ctx,base,v);
  const mips=[cv];let prev=cv;for(let i=0;i<4;i++){const w=Math.round(prev.width/2),h=Math.round(prev.height/2);if(w<16||h<16)break;const next=makeCanvas(w,h),c=next.getContext('2d');if(!c)break;c.drawImage(prev,0,0,w,h);mips.push(next);prev=next}
  cache.set(cacheKey,mips);capCanvasCache(cache,cacheKey);return mips;
 }catch{return null}
}
