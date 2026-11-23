// 人界集镇常用摆件：数据驱动的程序造型，尺寸与锚点仍来自 PROP2。
import { makeCanvas } from '../core/canvas';
import { capCanvasCache } from './canvasBudget';
import { PROP2 } from './propDims';
type G = CanvasRenderingContext2D;
type Kind = 'well'|'cart'|'fire'|'lantern'|'sign'|'barrel'|'crate'|'wood'|'hay'|'rack'|'target'|'dummy'|'table'|'stall'|'pot'|'plant'|'fence'|'banner'|'chest'|'stele'|'crystal'|'lion'|'boat'|'nest'|'pillar'|'ore'|'arch'|'altar'|'portal'|'seal'|'swordstone'|'bones'|'coffin'|'cairn'|'boundary'|'coral'|'ice'|'ancientPillar'|'caveFurniture'|'herbPlot'|'insectRoom'|'spring'|'spiritTree'|'firemouth'|'mine'|'spiritFire'|'lotus'|'vortex'|'icegap'|'ancientAltar'|'ancientStele'|'sealChain'|'ritualPlatform'|'gatePillars'|'ancientPortal'|'stoneBridge'|'iceFire'|'ancientHall'|'ancientTower'|'swordPavilion'|'ritualAltar'|'ruinShip';
export const TOWN_PROP_TYPES: Record<string, Kind> = {
 p_well:'well',p_cart:'cart',p_barrow:'cart',p_oxcart:'cart',p_brazier:'fire',p_censer:'fire',p_lamppost:'lantern',p_slantern:'lantern',
 p_signpost:'sign',p_notice:'sign',p_barrels:'barrel',p_crates:'crate',p_firewood:'wood',p_haystack:'hay',p_weaponrack:'rack',p_target:'target',p_dummy:'dummy',
 p_teatable:'table',p_stall_herb:'stall',p_stall_weapon:'stall',p_stall_tal:'stall',p_cauldron:'pot',p_cauldron_dark:'pot',p_herbpot:'plant',p_scarecrow:'dummy',p_trough:'pot',
 p_fence_wood:'fence',p_fence_stone:'fence',p_fence_jade:'fence',p_banner_sect:'banner',p_banner_demon:'banner',p_banner_steppe:'banner',p_chest:'chest',
 p_lion_l:'lion',p_lion_r:'lion',p_boat_s:'boat',p_flyboat:'boat',p_nest:'nest',p_pillar_broken:'pillar',p_pillar_fallen:'pillar',p_ore:'ore',p_arch_ruin:'arch',p_altar:'altar',p_altar_blood:'altar',p_tp_on:'portal',p_tp_off:'portal',p_sealstone:'seal',p_swordstone:'swordstone',p_skeleton:'bones',p_bones:'bones',p_coffin:'coffin',p_cairn:'cairn',p_boundary:'boundary',p_flagpillar:'boundary',p_coral:'coral',p_icepillar:'ice',
 p_e_platform:'ritualPlatform',p_e_hanli_platform:'ritualPlatform',p_e_gatepillar:'gatePillars',p_e_tp_ancient:'ancientPortal',p_e_tp_broken:'ancientPortal',p_e_xt_bridge:'stoneBridge',p_e_xt_icefire:'iceFire',p_e_xt_hall:'ancientHall',p_e_tower:'ancientTower',p_e_swordpav:'swordPavilion',p_e_seal_altar:'ritualAltar',p_e_unknown_altar:'ritualAltar',p_e_ship_s:'ruinShip',p_e_ship_l:'ruinShip',
 p_e_pillar_a:'ancientPillar',p_e_pillar_b:'ancientPillar',p_e_pillar_c:'ancientPillar',p_e_cave_bed:'caveFurniture',p_e_cave_table:'caveFurniture',p_e_herb_plot:'herbPlot',p_e_insect_room:'insectRoom',p_e_eye_spring:'spring',p_e_lingquan:'spring',p_e_eye_tree:'spiritTree',p_e_firemouth:'firemouth',p_e_mine:'mine',p_e_biling_mine:'mine',p_e_holyfire:'spiritFire',p_e_heilian:'lotus',p_e_vortex:'vortex',p_e_icegap:'icegap',p_e_altar_broken:'ancientAltar',p_e_valley_stele:'ancientStele',p_e_kunwu_stele:'ancientStele',p_e_sealchain:'sealChain',
 p_stele_a:'stele',p_stele_b:'stele',p_stele_c:'stele',p_crystal_s:'crystal',p_crystal_l:'crystal',p_crystal_blood:'crystal',
};
const cache = new Map<string, HTMLCanvasElement[]>();
const TAU = Math.PI * 2;
function rect(g:G,x:number,y:number,w:number,h:number,c:string){g.fillStyle=c;g.fillRect(x,y,w,h)}
function poly(g:G,pts:number[],fill:string,edge='#433b32',width=1.5){g.beginPath();g.moveTo(pts[0],pts[1]);for(let i=2;i<pts.length;i+=2)g.lineTo(pts[i],pts[i+1]);g.closePath();g.fillStyle=fill;g.fill();if(width){g.strokeStyle=edge;g.lineWidth=width;g.stroke()}}
function line(g:G,pts:number[],c:string,w=2){g.strokeStyle=c;g.lineWidth=w;g.lineCap='round';g.lineJoin='round';g.beginPath();g.moveTo(pts[0],pts[1]);for(let i=2;i<pts.length;i+=2)g.lineTo(pts[i],pts[i+1]);g.stroke()}
function oval(g:G,x:number,y:number,rx:number,ry:number,c:string){g.fillStyle=c;g.beginPath();g.ellipse(x,y,rx,ry,0,0,TAU);g.fill()}
function draw(g:G,key:string,kind:Kind,variant:string){
 const dark=variant==='dark', snow=variant==='snow', rose=variant==='rose';
 const wood=dark?'#5e4942':snow?'#857a6a':'#8e694a', shade=dark?'#3b3332':'#554538', light=snow?'#c8c7ba':'#c2a584', stone=dark?'#706968':snow?'#b4c4c8':'#a6a294';
 const red=dark?'#873c36':rose?'#b66b7c':'#ad5145', metal=dark?'#55504a':'#81765f';
 switch(kind){
 case 'ritualPlatform':
  poly(g,[5,77,21,59,79,59,95,77,90,89,10,89],shade);poly(g,[10,73,23,58,77,58,90,73,77,81,23,81],stone);
  oval(g,50,69,26,8,light);oval(g,50,69,19,5,key==='p_e_hanli_platform'?'#739d92':'#8da6a0');
  line(g,[33,69,50,63,67,69,50,75,33,69],shade,1.2);for(const x of [18,82]){rect(g,x-3,48,6,20,stone);poly(g,[x-4,48,x,39,x+4,48],light)}
  if(key==='p_e_hanli_platform'){poly(g,[44,64,46,39,50,29,54,39,56,64], '#a1c6bd');line(g,[42,44,58,44],shade,1.5)}break;
 case 'gatePillars':
  for(const x of [22,78]){poly(g,[x-9,83,x-7,24,x-3,17,x+5,17,x+8,24,x+10,83],stone);rect(g,x-12,81,24,8,shade);rect(g,x-9,25,18,4,light);line(g,[x-3,36,x+3,36,x-3,51,x+3,51,x-3,65,x+3,65],shade,1)}
  poly(g,[13,21,20,13,80,13,87,21,82,25,18,25],wood);rect(g,35,18,30,8,shade);line(g,[40,21,60,21],light,1);break;
 case 'ancientPortal': {
  const broken=key==='p_e_tp_broken';oval(g,50,82,43,10,shade);oval(g,50,79,38,8,stone);oval(g,50,77,27,5,broken?'#6b716d':'#89c4ba');
  poly(g,[15,77,19,39,28,23,34,28,28,46,27,77],stone);poly(g,broken?[73,77,73,49,80,45,85,77]:[73,77,72,46,66,28,72,23,81,39,85,77],stone);
  if(!broken){g.strokeStyle='#a9e4d9';g.lineWidth=2.5;g.beginPath();g.ellipse(50,50,20,26,0,0,TAU);g.stroke();line(g,[38,50,50,38,62,50,50,62,38,50], '#c7ede0',1.5)}
  else {poly(g,[65,27,70,21,79,25,83,34,75,36],light);line(g,[32,76,67,76],shade,1)}break;
 }
 case 'stoneBridge':
  poly(g,[3,67,17,54,83,54,97,67,97,82,3,82],stone);poly(g,[7,68,22,62,78,62,93,68,93,75,7,75],light);line(g,[5,54,25,46,75,46,95,54],shade,2);
  for(let x=12;x<=88;x+=19)line(g,[x,51,x,67],stone,3);line(g,[11,77,89,77],shade,1);break;
 case 'iceFire':
  poly(g,[4,78,17,62,83,62,96,78,96,85,4,85],stone);poly(g,[8,75,20,61,80,61,92,75],light);line(g,[50,62,50,83],shade,2);
  for(let i=0;i<3;i++){let x=20+i*10;poly(g,[x-6,65,x-2,44,x+1,50,x+6,36,x+7,65], '#b0dbe2','#709aa7',1)}
  for(let i=0;i<3;i++){let x=60+i*10;poly(g,[x-6,65,x-2,44,x+1,50,x+6,36,x+7,65], '#e99a50','#ae5f44',1)}break;
 case 'ancientHall':
  poly(g,[12,77,12,42,24,30,76,30,88,42,88,77],stone);poly(g,[5,42,25,24,42,24,47,18,55,24,75,24,95,42],shade);poly(g,[15,39,27,29,73,29,85,39],wood);
  rect(g,17,77,66,9,shade);for(const x of [24,38,62,76])rect(g,x-2,41,4,36,wood);rect(g,43,48,14,29,shade);line(g,[17,70,83,70],light,1);poly(g,[71,24,78,23,87,34,78,31],stone);break;
 case 'ancientTower':
  rect(g,31,68,38,20,shade);for(let i=0;i<4;i++){let y=68-i*15,w=34-i*4;rect(g,50-w/2,y-10,w,10,stone);poly(g,[50-w/2-5,y-10,50,y-18,50+w/2+5,y-10],shade);rect(g,48,y-7,4,6,wood)}line(g,[50,5,50,13],metal,2);break;
 case 'swordPavilion':
  poly(g,[8,81,20,72,80,72,92,81,92,88,8,88],stone);for(const x of [24,76])line(g,[x,75,x,42],wood,4);poly(g,[10,42,26,26,74,26,90,42,79,40,21,40],shade);poly(g,[22,37,30,30,70,30,78,37],wood);
  poly(g,[46,70,46,46,50,34,54,46,54,70], '#c9d5cc');line(g,[41,57,59,57],metal,2);break;
 case 'ritualAltar':
  poly(g,[6,82,19,71,81,71,94,82,94,89,6,89],shade);poly(g,[13,71,27,57,73,57,87,71],stone);poly(g,[24,57,34,45,66,45,76,57],light);oval(g,50,45,16,5,key==='p_e_seal_altar'?'#b47a69':'#82ada5');
  if(key==='p_e_seal_altar'){for(const x of [23,77]){rect(g,x-3,51,6,19,shade);poly(g,[x-5,51,x,42,x+5,51],red)}line(g,[40,45,50,39,60,45,50,50,40,45], '#f1d6bc',1)}
  else {line(g,[43,46,50,35,57,46,50,52,43,46],shade,1.5)}break;
 case 'ruinShip':
  poly(g,[4,67,95,67,81,83,22,83],wood);line(g,[9,69,89,69],light,2);line(g,[49,67,49,16],shade,3);
  poly(g,[52,21,78,56,52,56],light);poly(g,[45,28,25,54,45,54], '#a29c8a');
  if(key==='p_e_ship_l'){line(g,[72,65,72,27],shade,2);poly(g,[74,30,89,57,74,57], '#c2b49a');rect(g,26,61,40,5,shade);}
  else {line(g,[22,63,33,58,44,62],shade,2);poly(g,[54,31,60,36,55,40],shade)}break;
 case 'ancientPillar':
  if(key==='p_e_pillar_c') {poly(g,[5,58,72,38,94,51,26,74],stone);line(g,[17,57,28,70,78,51],light,2);line(g,[35,50,46,65],shade,1.5);}
  else {poly(g,[23,86,27,19,36,14,65,14,73,19,77,86],stone);rect(g,17,83,66,8,shade);rect(g,20,18,60,6,shade);line(g,[36,29,36,77],light,2);line(g,[64,29,64,77],shade,2);if(key==='p_e_pillar_b')poly(g,[26,19,36,14,44,21,53,13,64,21,72,19,72,27,26,27],stone);else {line(g,[45,35,56,35,45,47,56,47,45,59,56,59],shade,1.5)}}break;
 case 'caveFurniture':
  if(key==='p_e_cave_bed'){poly(g,[10,68,27,48,78,48,91,68],stone);rect(g,10,68,81,16,shade);poly(g,[20,64,31,53,74,53,82,64],light);oval(g,31,58,8,3,'#ded7c3')}
  else {poly(g,[13,53,27,41,74,41,87,53],stone);rect(g,13,53,74,8,shade);rect(g,20,61,8,22,stone);rect(g,72,61,8,22,stone);oval(g,50,45,9,3,light)}break;
 case 'herbPlot':
  poly(g,[8,75,23,48,80,48,93,75],shade);poly(g,[13,73,26,53,77,53,87,73], '#776c4a');
  for(const [x,y] of [[29,60],[48,59],[67,60],[39,69],[60,69],[78,69]]){line(g,[x,y+2,x,y-10], '#648258',1.5);oval(g,x-3,y-7,4,2.5,'#83a76b');oval(g,x+3,y-9,4,2.5,'#a0b77b')}break;
 case 'insectRoom':
  poly(g,[17,83,21,32,50,15,79,32,83,83],wood);poly(g,[15,34,50,12,85,34],shade);rect(g,28,40,44,40,'#c9bda0');
  for(let y=44;y<79;y+=9)line(g,[30,y,70,y],wood,1);for(let x=36;x<70;x+=10)line(g,[x,42,x,79],wood,1);oval(g,47,58,3,2,shade);oval(g,59,68,2,3,shade);break;
 case 'spring':
  oval(g,50,79,43,13,shade);oval(g,50,75,39,10,stone);oval(g,50,73,32,7,key==='p_e_eye_spring'?'#8ccdc1':'#75aca8');
  g.strokeStyle='#d5f0db';g.lineWidth=1.5;g.beginPath();g.ellipse(50,72,16,3,0,0,TAU);g.stroke();if(key==='p_e_eye_spring'){line(g,[50,69,46,57,51,46,48,34], '#c1e7df',2);oval(g,48,30,3,3,'#bce7da')}break;
 case 'spiritTree':
  line(g,[50,86,51,49,43,22],wood,9);line(g,[49,57,28,40,21,22],wood,5);line(g,[51,52,69,35,76,18],wood,5);
  for(const [x,y,rx,ry] of [[23,22,16,12],[39,18,19,14],[62,18,20,13],[77,29,15,12],[26,36,14,10],[56,35,22,12]])oval(g,x,y,rx,ry,snow?'#b8d6d2':dark?'#68755d':'#799c71');oval(g,50,84,13,5, '#89cbb8');break;
 case 'firemouth':
  poly(g,[6,84,19,60,32,49,39,35,62,35,70,49,83,59,94,84],stone);oval(g,50,37,13,5,shade);oval(g,50,36,9,3,'#ed8b42');poly(g,[43,36,46,21,51,27,58,11,58,35], '#e77a3e',red,1);line(g,[22,78,35,65,42,71],shade,2);break;
 case 'mine':
  poly(g,[5,86,12,48,31,22,65,16,87,42,95,86],stone);poly(g,[27,85,27,62,36,48,64,48,73,62,73,85],shade);line(g,[24,84,24,58,35,45,65,45,76,58,76,84],wood,4);
  if(key==='p_e_biling_mine'){poly(g,[8,84,16,62,22,84], '#8ac1b4');poly(g,[76,84,85,56,93,84], '#a5d9c8')}else {line(g,[35,83,41,66,59,66,65,83],light,2)}break;
 case 'spiritFire':
  oval(g,50,82,35,8,shade);poly(g,[17,76,29,61,71,61,83,76],stone);poly(g,[30,63,34,41,42,50,50,13,56,39,64,30,70,63],snow?'#a6e4ed':'#83cdbf','#628e86',1);poly(g,[43,64,48,40,52,49,58,35,59,64], '#d7f6df','#a4d9c6',1);break;
 case 'lotus':
  oval(g,50,81,38,8,shade);for(const [x,y] of [[25,61],[36,50],[50,44],[64,50],[75,61]])poly(g,[50,78,x-9,y+8,x,y-10,x+9,y+8],dark?'#604d69':'#766681','#4d4456',1);oval(g,50,70,10,5,'#b09a77');break;
 case 'vortex':
  oval(g,50,80,38,9,shade);oval(g,50,53,34,34, '#698d91');oval(g,50,53,26,26,'#91b7b0');oval(g,50,53,17,17,'#5b8182');oval(g,50,53,8,8,'#d4e9d9');
  g.strokeStyle='#e0f1dd';g.lineWidth=2;g.beginPath();g.arc(50,53,23,0.4,4.5);g.stroke();break;
 case 'icegap':
  poly(g,[5,78,11,45,26,53,36,23,49,45,61,17,70,48,86,37,96,78], '#aecfd4','#769da4',2);poly(g,[22,80,32,67,47,74,59,62,78,78], '#405d69');line(g,[31,56,40,70,49,60,57,73,70,57], '#e2f3ef',2);break;
 case 'ancientAltar':
  poly(g,[9,81,21,66,80,66,92,81,92,88,9,88],stone);poly(g,[20,66,30,51,71,51,80,66],light);line(g,[30,51,37,39,44,45,51,36,61,46,70,51],stone,6);line(g,[32,75,68,75],shade,2);break;
 case 'ancientStele':
  poly(g,[23,84,26,23,38,12,64,14,74,23,77,84],stone);rect(g,17,82,66,9,shade);line(g,[36,29,64,29,50,40,62,48,38,48,50,59,38,69,63,69],key==='p_e_kunwu_stele'?red:shade,2);break;
 case 'sealChain':
  poly(g,[27,81,30,24,39,16,62,16,70,24,73,81],stone);rect(g,21,81,58,8,shade);line(g,[39,32,60,32,42,50,61,50,42,67,61,67],red,2);
  g.strokeStyle=metal;g.lineWidth=3;for(let i=0;i<5;i++){g.beginPath();g.ellipse(22+i*7,37+i*6,6,3,0.7,0,TAU);g.stroke();g.beginPath();g.ellipse(78-i*7,37+i*6,6,3,-0.7,0,TAU);g.stroke()}break;
 case 'lion': {
  if(key==='p_lion_r'){g.translate(100,0);g.scale(-1,1)}
  rect(g,13,81,74,9,shade);rect(g,19,72,62,9,stone);oval(g,51,59,26,17,stone);rect(g,30,58,12,16,stone);rect(g,63,58,12,16,stone);
  oval(g,30,42,17,17,shade);oval(g,29,39,13,12,stone);oval(g,20,41,5,4,light);oval(g,24,35,2,2,shade);line(g,[65,48,80,38,83,28],shade,4);break;
 }
 case 'boat':
  poly(g,[5,63,95,63,81,82,20,82],wood);line(g,[11,67,87,67],light,2);line(g,[50,63,50,13],shade,3);
  if(key==='p_flyboat'){poly(g,[52,14,78,41,52,53],snow?'#c5d9dc':'#e0d1ad');poly(g,[47,21,24,46,47,52],light);line(g,[19,83,82,83], '#8ab6b2',3)}
  else {poly(g,[52,18,75,52,52,52], '#ded2b6');line(g,[7,88,35,88,45,85,76,85,92,88], '#8ab6b2',1.5)}break;
 case 'nest':
  oval(g,50,76,42,14,shade);for(let i=0;i<5;i++)line(g,[12+i*4,70+i*3,40+i*7,87-i*2,88-i*3,69+i*3],wood,3);
  for(const [x,y] of [[37,66],[51,62],[64,68]])oval(g,x,y,8,11,light);break;
 case 'pillar':
  if(key==='p_pillar_fallen'){poly(g,[9,62,65,37,89,49,31,77],stone);line(g,[20,58,34,72,72,49],light,2)}
  else {poly(g,[28,78,30,22,38,27,44,18,54,24,62,17,70,30,72,78],stone);rect(g,20,78,60,9,shade);line(g,[39,32,37,73],light,2);line(g,[59,30,61,72],shade,2)}break;
 case 'ore': {
  const cMid = snow ? '#83c3cd' : dark ? '#5f8f8e' : '#63b4a8';
  const cHi = snow ? '#c4edf2' : dark ? '#8ec0b8' : '#a9ebe0';
  const cDeep = snow ? '#49737c' : dark ? '#344f52' : '#3d6e69';
  // 基座岩床与阴面岩层
  poly(g, [8, 84, 15, 58, 30, 42, 48, 38, 69, 44, 85, 58, 92, 84], shade);
  poly(g, [11, 82, 18, 57, 34, 43, 55, 42, 74, 51, 88, 82], stone);
  poly(g, [16, 78, 28, 59, 51, 56, 74, 61, 83, 80], light, shade, 0.8);
  // 岩隙灵脉荧光纹理
  line(g, [18, 76, 33, 66, 51, 69, 68, 63, 81, 74], cHi, 2);
  line(g, [24, 81, 46, 77, 73, 80], cMid, 1.5);
  // 五枚棱面灵晶簇（主晶、副晶与侧晶 + 亮暗折面）
  poly(g, [21, 68, 25, 40, 32, 29, 39, 43, 36, 68], cMid, cDeep, 1.2);
  poly(g, [32, 29, 25, 40, 29, 66, 33, 66], cHi, '', 0);
  poly(g, [40, 70, 43, 28, 52, 14, 61, 29, 58, 70], cMid, cDeep, 1.3);
  poly(g, [52, 14, 43, 28, 48, 68, 53, 68], cHi, '', 0);
  line(g, [52, 17, 51, 66], '#e6fff9', 1.4);
  poly(g, [60, 71, 66, 40, 74, 28, 80, 44, 76, 71], cMid, cDeep, 1.2);
  poly(g, [74, 28, 66, 40, 68, 69, 73, 69], cHi, '', 0);
  poly(g, [14, 75, 16, 56, 22, 49, 26, 59, 24, 75], cDeep, shade, 1);
  poly(g, [76, 76, 80, 54, 86, 48, 90, 61, 86, 76], cDeep, shade, 1);
  // 晶簇苔藓与矿底稳固边线
  oval(g, 29, 75, 8, 3, dark ? '#4d6157' : '#658563');
  oval(g, 69, 76, 9, 3, dark ? '#4d6157' : '#658563');
  line(g, [14, 83, 86, 83], shade, 2);
  break;
 }
 case 'arch':
  poly(g,[8,88,12,29,24,17,36,22,38,39,30,41,28,88],stone);poly(g,[71,88,69,40,60,38,60,22,73,15,88,30,92,88],stone);
  poly(g,[24,20,38,13,59,14,76,19,71,33,59,27,40,28,31,35],stone);line(g,[14,55,30,55],shade,1);line(g,[70,60,88,60],shade,1);break;
 case 'altar':
  poly(g,[12,79,27,65,73,65,88,79,88,88,12,88],stone);poly(g,[20,65,34,48,66,48,80,65],light);rect(g,34,40,32,9,shade);oval(g,50,39,17,5,key==='p_altar_blood'?'#9d403c':'#8cb4a4');line(g,[38,76,62,76],key==='p_altar_blood'?red:shade,2);break;
 case 'portal':
  oval(g,50,80,43,12,shade);oval(g,50,77,39,10,stone);oval(g,50,74,29,7,key==='p_tp_on'?'#8ccdc5':'#666d66');
  line(g,[18,69,23,42,33,24],stone,6);line(g,[82,69,77,42,67,24],stone,6);if(key==='p_tp_on'){g.strokeStyle='#9cded6';g.lineWidth=3;g.beginPath();g.ellipse(50,45,21,27,0,0,TAU);g.stroke();line(g,[40,45,50,35,60,45,50,57,40,45], '#c1eee0',2)}break;
 case 'seal':
  poly(g,[18,81,25,30,43,14,72,25,83,81],stone);line(g,[36,36,64,36,50,47,62,61,37,61],dark?red:shade,3);rect(g,13,81,74,8,shade);break;
 case 'swordstone':
  poly(g,[14,84,23,55,44,50,57,53,78,48,89,84],stone);poly(g,[45,55,45,20,50,8,55,20,55,55], '#c8d2cb');line(g,[35,47,65,47],shade,4);line(g,[50,47,50,63],wood,3);break;
 case 'bones':
  if(key==='p_skeleton'){oval(g,50,23,13,13,light);rect(g,42,33,16,7,light);oval(g,46,21,2,3,shade);oval(g,54,21,2,3,shade);line(g,[50,40,50,70],light,5);for(let y=44;y<62;y+=6)line(g,[37,y,63,y],light,2);line(g,[48,68,32,85,22,85],light,4);line(g,[52,68,68,85,78,85],light,4);line(g,[40,45,25,65,18,68],light,3);line(g,[60,45,75,65,82,68],light,3)}
  else {for(const [x,y,a] of [[20,72,1],[39,78,-1],[61,70,1],[76,81,-1]]){line(g,[x-10,y-5*a,x+10,y+5*a],light,5);oval(g,x-10,y-5*a,4,4,light);oval(g,x+10,y+5*a,4,4,light)}}break;
 case 'coffin':
  poly(g,[23,28,36,18,64,18,77,28,72,78,62,88,38,88,28,78],wood);poly(g,[29,31,39,24,61,24,71,31,66,75,61,80,39,80,34,75],shade);line(g,[50,34,50,70],light,3);line(g,[40,44,60,44],light,3);break;
 case 'cairn':
  for(const [x,y,rx,ry] of [[50,81,33,9],[34,67,18,11],[65,69,19,10],[50,54,17,11],[50,38,12,9]])oval(g,x,y,rx,ry,stone);line(g,[23,82,76,82],shade,2);break;
 case 'boundary':
  poly(g,[24,87,29,24,50,12,71,24,76,87],stone);rect(g,18,85,64,7,shade);line(g,[43,34,57,34,43,48,57,48,43,62,57,62],key==='p_flagpillar'?red:shade,2);
  if(key==='p_flagpillar'){line(g,[74,83,74,10],wood,3);poly(g,[75,12,93,16,90,34,75,30],red)}break;
 case 'coral':
  line(g,[50,83,50,29,39,18],red,7);line(g,[49,67,28,52,24,35],red,6);line(g,[50,58,73,39,76,21],red,6);line(g,[29,53,17,45],red,5);line(g,[73,39,85,32],red,5);oval(g,50,84,24,6,stone);break;
 case 'ice':
  poly(g,[10,86,22,39,36,57,48,10,62,55,75,29,91,86], '#b0d6db','#718f96',2);poly(g,[48,12,48,80,60,56], '#dceced','#b0d6db',1);line(g,[22,41,35,82], '#e3f3f2',2);break;
 case 'well':
  oval(g,50,83,41,12,shade);rect(g,12,65,76,19,stone);oval(g,50,65,38,10,stone);oval(g,50,65,28,6,'#394c4b');line(g,[20,64,20,27,80,27,80,64],wood,4);poly(g,[12,28,50,13,88,28],wood,shade,1);line(g,[50,28,50,54],shade,2);rect(g,44,51,12,10,light);break;
 case 'cart':
  line(g,[12,63,88,63],shade,4);poly(g,[15,36,76,36,84,59,23,59],wood);line(g,[25,44,76,44],light,2);line(g,[28,53,79,53],light,2);line(g,[80,59,98,45],wood,3);
  for(const x of [31,70]){oval(g,x,74,14,14,shade);oval(g,x,74,10,10,light);line(g,[x-9,74,x+9,74],shade,2);line(g,[x,65,x,83],shade,2)}break;
 case 'fire':
  line(g,[33,66,26,91,35,91],shade,4);line(g,[67,66,74,91,65,91],shade,4);poly(g,[20,49,80,49,70,71,30,71],metal);oval(g,50,49,30,7,shade);poly(g,[35,48,42,23,50,35,60,16,66,48], '#e68b47',red,1);poly(g,[44,49,50,32,57,49],'#f7d383','#c47a43',1);break;
 case 'lantern':
  line(g,[28,91,28,17,72,17],shade,4);rect(g,18,88,22,6,stone);line(g,[65,17,65,27],shade,2);poly(g,[48,30,82,30,77,52,53,52],red);line(g,[50,29,65,25,80,29],wood,3);line(g,[54,38,76,38],light,1.5);line(g,[54,45,76,45],light,1.5);break;
 case 'sign':
  line(g,[50,91,50,18],wood,5);poly(g,[15,22,77,22,87,31,77,40,15,40],light,shade,2);line(g,[25,30,67,30],wood,2);if(key==='p_notice'){rect(g,18,43,64,35,wood);rect(g,24,47,52,26,'#dfd4b6');for(let y=52;y<72;y+=6)line(g,[30,y,72,y],stone,1)}break;
 case 'barrel':
  for(const [x,y] of [[30,47],[65,55]]){poly(g,[x-17,y,x+17,y,x+14,y+32,x-14,y+32],wood);oval(g,x,y,17,6,light);line(g,[x-15,y+12,x+15,y+12],shade,2);line(g,[x-14,y+24,x+14,y+24],shade,2)}break;
 case 'crate':
  for(const [x,y] of [[16,50],[48,39]]){rect(g,x,y,37,35,wood);line(g,[x,y,x+37,y,x+37,y+35,x,y+35,x,y],shade,2);line(g,[x+3,y+3,x+34,y+32,x+34,y+3,x+3,y+32],light,2)}break;
 case 'wood':
  for(let i=0;i<4;i++){line(g,[15+i*6,78-i*9,80+i*3,53-i*6],wood,7);oval(g,15+i*6,78-i*9,3.5,4,light)}break;
 case 'hay':
  poly(g,[13,82,18,57,30,43,39,21,55,16,72,26,83,45,88,82], '#bea371',shade,1);for(let i=0;i<6;i++)line(g,[23+i*10,76,29+i*8,42],light,1.5);break;
 case 'rack':
  line(g,[17,88,23,25,77,25,83,88],wood,4);line(g,[18,60,82,60],wood,4);for(let x=32;x<=68;x+=12){line(g,[x,52,x+3,17], '#c6c7bf',3);line(g,[x-4,54,x+5,54],shade,2)}break;
 case 'target':
  line(g,[50,70,50,92,30,92],wood,4);oval(g,50,43,30,30,wood);oval(g,50,43,25,25,'#d9c8a3');oval(g,50,43,17,17,red);oval(g,50,43,10,10,'#ded0b2');oval(g,50,43,4,4,shade);break;
 case 'dummy':
  line(g,[50,88,50,31],wood,5);line(g,[19,46,81,46],wood,5);oval(g,50,25,11,11,light);poly(g,[34,36,66,36,72,67,28,67],key==='p_scarecrow'?'#b49b70':wood);poly(g,[34,20,50,10,66,20],shade);break;
 case 'table':
  line(g,[24,59,20,88],shade,4);line(g,[76,59,80,88],shade,4);poly(g,[15,48,79,48,90,58,10,58],wood);oval(g,46,46,10,4,light);oval(g,66,44,6,3,stone);break;
 case 'stall':
  line(g,[18,87,18,26,82,26,82,87],wood,4);poly(g,[9,26,19,12,81,12,91,26],red);for(let x=18;x<82;x+=16)line(g,[x,14,x-4,25],light,1);rect(g,13,58,74,10,wood);for(let x=26;x<80;x+=18)oval(g,x,54,6,4,key==='p_stall_herb'?'#77865a':key==='p_stall_tal'?'#d8c69b':'#a6a9a0');break;
 case 'pot':
  line(g,[28,68,24,87],shade,4);line(g,[72,68,76,87],shade,4);poly(g,[18,45,82,45,76,67,64,77,36,77,24,67],metal);oval(g,50,45,32,8,shade);oval(g,50,43,24,5,'#a89a7a');line(g,[27,45,18,38,15,31],metal,4);line(g,[73,45,82,38,85,31],metal,4);break;
 case 'plant':
  poly(g,[29,59,71,59,64,84,36,84],wood);oval(g,50,59,21,5,shade);for(const [x,y] of [[34,35],[46,24],[58,31],[69,40]]){line(g,[50,59,x,y], '#526b46',2);oval(g,x,y,7,11,'#728a57')}break;
 case 'fence':
  rect(g,6,48,88,7,wood);rect(g,6,72,88,7,wood);for(let x=12;x<=88;x+=19){rect(g,x,30,7,58,key==='p_fence_wood'?wood:stone);poly(g,[x,30,x+3.5,21,x+7,30],key==='p_fence_wood'?wood:stone,shade,1)}break;
 case 'banner':
  line(g,[27,92,27,10,83,10],wood,4);poly(g,[30,14,81,14,81,65,65,75,49,65,30,68],key==='p_banner_demon'?'#883d38':key==='p_banner_steppe'?'#a88a53':red);line(g,[54,24,54,55],light,2);line(g,[42,39,68,39],light,2);break;
 case 'chest':
  poly(g,[16,49,84,49,84,84,16,84],wood);poly(g,[16,49,24,31,76,31,84,49],light);line(g,[18,61,82,61],shade,3);rect(g,45,55,10,12,metal);break;
 case 'stele':
  poly(g,[24,85,24,23,50,11,76,23,76,85],stone);rect(g,17,83,66,8,shade);for(let y=32;y<72;y+=10)line(g,[43,y,57,y],shade,2);break;
 case 'crystal': {
  const crystal=key==='p_crystal_blood'?'#c66c6a':snow?'#c3e6ee':'#87bbb5';
  poly(g,[13,85,27,40,42,59,52,12,65,54,78,30,91,85],crystal,'#577572',2);line(g,[52,14,51,83], '#e5f4eb',2);line(g,[27,41,38,83], '#d4e9df',2);break;
 }
 }
}
export function townPropMips(key:string): HTMLCanvasElement[] | null {
 const [base,variant=''] = key.split('|'); if(!Object.prototype.hasOwnProperty.call(TOWN_PROP_TYPES,base)||!PROP2[base]||typeof document==='undefined')return null;
 const v = variant==='dark'||variant==='snow'||variant==='rose'?variant:''; const cacheKey=base+'|'+v, existing=cache.get(cacheKey);if(existing)return existing;
 try {
  const d=PROP2[base], scale=Math.min(2,256/Math.max(d.w,d.h)), cv=makeCanvas(Math.max(32,Math.round(d.w*scale)),Math.max(32,Math.round(d.h*scale)));
  const g=cv.getContext('2d');if(!g)return null;g.scale(cv.width/100,cv.height/100);draw(g,base,TOWN_PROP_TYPES[base],v);
  const mips=[cv];let prev=cv;for(let i=0;i<3;i++){const w=Math.round(prev.width/2),h=Math.round(prev.height/2);if(w<16||h<16)break;const next=makeCanvas(w,h),c=next.getContext('2d');if(!c)break;c.drawImage(prev,0,0,w,h);mips.push(next);prev=next;}
  cache.set(cacheKey,mips);capCanvasCache(cache,cacheKey);return mips;
 }catch{return null}
}
