// 战斗特效的固定种子程序画材。一次生成后缓存，动画参数仍由 combatfx 管理。
import { makeCanvas } from '../core/canvas';
type G=CanvasRenderingContext2D;
export const VFX_KEYS = ['array_activate_burst','array_activate_ring','blood_burst_burst','blood_burst_head','breakthrough_burst','breakthrough_ring','earth_spike_burst','earth_spike_head','fire_bird_burst','fire_bird_head','fire_bird_trail','fireball_burst','fireball_head','fireball_trail','gold_arc_burst','gold_arc_head','gold_arc_trail','heal_green_burst','heal_green_ring','hit_spark_burst','hit_spark_head','ice_cone_burst','ice_cone_head','ice_cone_trail','ice_freeze_burst','ice_freeze_head','poison_arrow_burst','poison_arrow_head','poison_arrow_trail','poison_cloud_burst','poison_cloud_ring','shield_black_burst','shield_black_ring','shield_blue_burst','shield_blue_ring','shield_five_burst','shield_five_ring','shield_gold_burst','shield_gold_ring','soul_wisp_burst','soul_wisp_head','soul_wisp_trail','sword_qi_gold_burst','sword_qi_gold_head','sword_qi_gold_trail','sword_qi_green_burst','sword_qi_green_head','sword_qi_green_trail','sword_qi_red_burst','sword_qi_red_head','sword_qi_red_trail','sword_rain_burst','sword_rain_head','teleport_flash_burst','teleport_flash_ring','thunder_blue_burst','thunder_blue_head','thunder_gold_burst','thunder_gold_head','wind_blade_burst','wind_blade_head','wind_blade_trail','wood_vines_burst','wood_vines_ring'] as const;
const known=new Set<string>(VFX_KEYS),cache=new Map<string,HTMLCanvasElement>();
const PALETTE:Record<string,[string,string,string]>={
 array_activate:['#65cfc0','#baf5dd','#367e7c'],blood_burst:['#d75a58','#ffd0a0','#803749'],breakthrough:['#e3bb64','#fff4c7','#ac7141'],earth_spike:['#bd9b67','#f4deb1','#806f5a'],
 fire_bird:['#ee7850','#fff0ad','#b84635'],fireball:['#f37a40','#fff3b4','#c14832'],gold_arc:['#e8bf65','#fff5c5','#b88840'],heal_green:['#79c88a','#e9ffe0','#4f9a74'],hit_spark:['#e6d59c','#fff8dc','#aa9d80'],
 ice_cone:['#87cde6','#efffff','#568dac'],ice_freeze:['#9bd9e8','#efffff','#638da9'],poison_arrow:['#8ec66b','#e3f8b1','#5e904d'],poison_cloud:['#8fc479','#e1f4bb','#668e65'],
 shield_black:['#a5789e','#f0c6dc','#675172'],shield_blue:['#7cb9d7','#d9f5fa','#4e799d'],shield_five:['#8ac2a0','#ecf5d0','#b69e63'],shield_gold:['#d7b668','#fff0c7','#a6824e'],
 soul_wisp:['#9d8cc9','#eee3ff','#6a699b'],sword_qi_gold:['#e8c779','#fff6d2','#a88755'],sword_qi_green:['#76c5a9','#e2fff0','#4d8c85'],sword_qi_red:['#e27d6a','#ffe0bd','#a64d4d'],
 sword_rain:['#b9d3d1','#f1ffff','#6f9e9e'],teleport_flash:['#a9b9e5','#f2f0ff','#7781b6'],thunder_blue:['#91b7f0','#f4f4ff','#687bbd'],thunder_gold:['#e6c573','#fff9cb','#a88d5a'],
 wind_blade:['#85c9b4','#ecfff1','#5e9c91'],wood_vines:['#84bd76','#e9f7c3','#5e9065'],
};
function fill(g:G,p:number[],c:string){g.beginPath();g.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)g.lineTo(p[i],p[i+1]);g.closePath();g.fillStyle=c;g.fill()}
function line(g:G,p:number[],c:string,w:number){g.beginPath();g.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)g.lineTo(p[i],p[i+1]);g.strokeStyle=c;g.lineWidth=w;g.lineCap='round';g.lineJoin='round';g.stroke()}
function glow(g:G,x:number,y:number,r:number,col:string){const grad=g.createRadialGradient(x,y,0,x,y,r);grad.addColorStop(0,'rgba(255,255,240,.82)');grad.addColorStop(.25,col);grad.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=grad;g.fillRect(x-r,y-r,r*2,r*2)}
function burst(g:G,base:string,c:[string,string,string]){
 glow(g,64,64,58,c[0]);g.save();g.translate(64,64);
 for(let i=0;i<12;i++){g.save();g.rotate(i*Math.PI/6);const len=i%3===0?54:36+(i%2)*8;fill(g,[2,-4,len,0,2,4,10,0],i%2?c[0]:c[1]);g.restore()}
 if(base.includes('ice'))for(let i=0;i<6;i++){g.save();g.rotate(i*Math.PI/3);line(g,[0,0,0,43,-6,34,0,40,6,34],c[1],2);g.restore()}
 if(base.includes('wood'))for(let i=0;i<6;i++){g.save();g.rotate(i*Math.PI/3);fill(g,[8,0,24,-8,38,0,24,8],c[0]);g.restore()}
 g.restore();glow(g,64,64,19,c[1]);
}
function ring(g:G,base:string,c:[string,string,string]){
 const grad=g.createRadialGradient(64,64,30,64,64,61);grad.addColorStop(0,'rgba(0,0,0,0)');grad.addColorStop(.65,c[2]);grad.addColorStop(.8,c[0]);grad.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=grad;g.beginPath();g.arc(64,64,61,0,Math.PI*2);g.fill();
 g.strokeStyle=c[1];g.lineWidth=2;g.beginPath();g.arc(64,64,47,0,Math.PI*2);g.stroke();g.strokeStyle=c[0];g.lineWidth=1.2;g.beginPath();g.arc(64,64,37,0,Math.PI*2);g.stroke();
 for(let i=0;i<8;i++){const a=i*Math.PI/4,x=64+Math.cos(a)*46,y=64+Math.sin(a)*46;g.save();g.translate(x,y);g.rotate(a);fill(g,[-4,0,0,-6,4,0,0,6],c[1]);g.restore()}
 if(base.includes('array')||base.includes('breakthrough')||base.includes('shield_five')){for(const rot of [0,Math.PI/3]){g.save();g.translate(64,64);g.rotate(rot);g.strokeStyle=c[0];g.lineWidth=1.2;g.beginPath();for(let i=0;i<3;i++){const a=i*Math.PI*2/3-Math.PI/2,x=Math.cos(a)*34,y=Math.sin(a)*34;i?g.lineTo(x,y):g.moveTo(x,y)}g.closePath();g.stroke();g.restore()}}
}
function trail(g:G,c:[string,string,string]){
 const grad=g.createLinearGradient(4,0,124,0);grad.addColorStop(0,'rgba(0,0,0,0)');grad.addColorStop(.6,c[2]);grad.addColorStop(1,c[1]);g.fillStyle=grad;g.beginPath();g.moveTo(2,64);g.quadraticCurveTo(65,25,124,46);g.lineTo(124,82);g.quadraticCurveTo(65,103,2,64);g.fill();
 line(g,[14,64,118,64],c[1],3);line(g,[35,53,112,55],c[0],2);line(g,[28,76,112,74],c[0],2);
}
function head(g:G,base:string,c:[string,string,string]){
 glow(g,64,64,58,c[0]);
 if(base.startsWith('sword_qi')||base==='sword_rain'||base==='poison_arrow'){
  fill(g,[18,60,92,49,119,64,92,79,18,68],c[0]);fill(g,[24,62,95,57,112,64,95,71,24,66],c[1]);line(g,[18,64,108,64],c[1],2);
 }else if(base.startsWith('thunder')){
  fill(g,[72,8,41,60,59,59,48,119,91,52,73,53,88,8],c[0]);line(g,[75,13,51,56,68,54,57,103],c[1],4);
 }else if(base==='ice_cone'){
  fill(g,[13,55,86,42,117,64,86,86,13,73],c[0]);fill(g,[24,61,86,53,108,64,86,75,24,67],c[1]);line(g,[19,64,107,64],c[1],2);
 }else if(base==='ice_freeze'||base==='earth_spike'){
  for(let i=0;i<5;i++){const x=25+i*18;fill(g,[x-12,101,x,18+(i%2)*15,x+12,101],i%2?c[0]:c[1])}line(g,[20,103,110,103],c[2],4);
 }else if(base==='wind_blade'){
  g.strokeStyle=c[1];g.lineWidth=7;g.beginPath();g.arc(50,64,38,-1.1,1.1);g.stroke();g.strokeStyle=c[0];g.lineWidth=4;g.beginPath();g.arc(43,64,26,-.9,.9);g.stroke();
 }else if(base==='fire_bird'){
  fill(g,[20,65,45,47,36,23,63,43,80,27,81,49,110,61,80,66,63,87,51,75],c[0]);fill(g,[41,62,69,49,90,61,68,69],c[1]);
 }else if(base==='fireball'||base==='soul_wisp'||base==='blood_burst'){
  fill(g,[18,64,50,50,40,28,66,38,78,14,90,40,110,49,118,64,110,79,89,86,78,111,65,91,39,99,49,78],c[0]);glow(g,72,64,32,c[1]);
 }else{burst(g,base,c)}
}
/** 未知键、无法创建画布或无文档时返回 null，调用方可走原代码特效。 */
export function proceduralVfx(key:string):HTMLCanvasElement|null{
 if(!known.has(key)||typeof document==='undefined')return null;const hit=cache.get(key);if(hit)return hit;
 const match=key.match(/^(.*)_(head|trail|burst|ring)$/);if(!match)return null;const [,base,part]=match,c=PALETTE[base];if(!c)return null;
 try{const cv=makeCanvas(128,128),g=cv.getContext('2d');if(!g)return null;
  if(part==='trail')trail(g,c);else if(part==='burst')burst(g,base,c);else if(part==='ring')ring(g,base,c);else head(g,base,c);
  cache.set(key,cv);return cv;
 }catch{return null}
}
