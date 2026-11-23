// 兼容旧布局中的剩余建筑键。沿用原有 BLD2 尺寸及锚线；立面复用程序组件，
// 遗址、特殊构件保留独立轮廓。缓存只在生成成功后写入，失败可重试。
import { makeCanvas } from '../core/canvas';
import { capCanvasCache } from './canvasBudget';
import { BLD2 } from './bld2Dims';
import { townShopMips } from './townShops';
import { townHouseMips } from './townHouses';
import { townGateMips } from './townGates';
import { townWallMips } from './townWalls';
import { townPropMips } from './townProps';
const aliases:Record<string,string>={
 b05:'b36_strip',b13:'f3_hall',b21:'b20',b22:'f4_waterside',b31:'b02',b33:'b04',b34:'f3_hall',b35:'b11a',b36:'b20',b39:'f8_hall',b45:'p_e_xt_bridge',
 f3_bagua_altar:'f3_hall',f6_drill_ground:'f6_hall',f7_beast_pen:'f7_hall',f8_walkway:'f8_hall',f9_wall:'f9_wall_strip',
 j01:'f2_hall',j02:'f9_keep',j03_wall:'f9_wall_strip',j08:'j07_gate',j13:'f8_stilt_house',j14:'f5_gate',j15:'f3_hall',j16:'f3_hall',
 t01:'t02',t06:'f3_hall',x01:'f1_hall_b',x02:'b07',x03_wall:'x03_wall_strip',x07:'f4_waterside',x13:'f3_hall',x14:'x14_strip',
};
export const REMAINING_BUILDING_KEYS=[...Object.keys(aliases),'b31_wheel','f1_sword_monument'];
const known=new Set(REMAINING_BUILDING_KEYS),cache=new Map<string,HTMLCanvasElement[]>();
function source(key:string){return townShopMips(key)??townHouseMips(key)??townGateMips(key)??townWallMips(key)??townPropMips(key)}
export function remainingBuildingMips(key:string):HTMLCanvasElement[]|null {
 const [base,variant='']=key.split('|');if(!known.has(base))return null;
 const cacheKey=base+'|'+variant,old=cache.get(cacheKey);if(old)return old;
 try {
  const d=BLD2[base];if(!d)return null;
  const ratio=Math.min(1,512/Math.max(d.w,d.h));const w=Math.max(1,Math.round(d.w*ratio)),h=Math.max(1,Math.round(d.h*ratio));
  const c=makeCanvas(w,h),g=c.getContext('2d');if(!g)return null;
  g.scale(w/100,h/100);
  if(base==='b31_wheel'){
   g.strokeStyle='#534437';g.lineWidth=3;g.beginPath();g.arc(50,50,43,0,Math.PI*2);g.stroke();g.lineWidth=1.8;g.beginPath();g.arc(50,50,35,0,Math.PI*2);g.stroke();
   for(let i=0;i<16;i++){const a=i*Math.PI/8;g.beginPath();g.moveTo(50,50);g.lineTo(50+Math.cos(a)*43,50+Math.sin(a)*43);g.stroke();g.fillStyle='#a58b69';g.fillRect(50+Math.cos(a)*42-2,50+Math.sin(a)*42-2,4,4)}g.fillStyle='#746046';g.beginPath();g.arc(50,50,5,0,Math.PI*2);g.fill();
  }else if(base==='f1_sword_monument'){
   g.fillStyle='#797d77';g.fillRect(11,91,78,6);g.fillStyle='#9ba19a';g.fillRect(23,85,54,6);g.fillStyle='#626b69';g.fillRect(39,74,22,11);
   g.fillStyle='#c2c8bb';g.beginPath();g.moveTo(50,3);g.lineTo(56,12);g.lineTo(54,71);g.lineTo(46,71);g.lineTo(44,12);g.closePath();g.fill();g.strokeStyle='#596460';g.lineWidth=1;g.stroke();g.beginPath();g.moveTo(50,7);g.lineTo(50,70);g.stroke();g.fillStyle='#7a6e58';g.fillRect(35,70,30,4);
  }else{
   const m=source(aliases[base]+(variant?'|'+variant:''));if(!m)return null;
   g.drawImage(m[0],0,0,100,100);
   if(base==='f3_bagua_altar'){
    g.fillStyle='#b5b4a1';g.beginPath();g.ellipse(50,90,30,7,0,0,Math.PI*2);g.fill();g.strokeStyle='#605e53';g.lineWidth=.6;g.beginPath();g.ellipse(50,90,23,5,0,0,Math.PI*2);g.stroke();g.beginPath();g.moveTo(39,90);g.lineTo(50,85);g.lineTo(61,90);g.lineTo(50,95);g.closePath();g.stroke();
   }
  }
  const mips=[c];let prev=c;
  for(let i=1;i<4;i++){const mw=Math.max(1,Math.round(prev.width/2)),mh=Math.max(1,Math.round(prev.height/2));if(mw<24||mh<24)break;const next=makeCanvas(mw,mh),ctx=next.getContext('2d');if(!ctx)return null;ctx.drawImage(prev,0,0,mw,mh);mips.push(next);prev=next}
  cache.set(cacheKey,mips);capCanvasCache(cache,cacheKey);return mips;
 } catch { return null; }
}
