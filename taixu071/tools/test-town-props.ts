import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCanvas } from './env';
import { setCanvasFactory } from '../src/core/canvas';
(globalThis as any).window = { innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false}) };
(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
let alloc=0;setCanvasFactory((w,h)=>{alloc++;return createCanvas(w,h) as any});
const { TOWN_PROP_TYPES,townPropMips }=await import('../src/gfx/townProps');
const { drawBld,bldDim }=await import('../src/gfx/bldTex2');
const keys=Object.keys(TOWN_PROP_TYPES);assert.equal(keys.length,97);const signatures=new Set<string>();
for(const key of keys){
 const m=townPropMips(key)!;assert.ok(m.length>=2,key);assert.ok(m[0].width<=256 && m[0].height<=256); const n=alloc;assert.equal(townPropMips(key),m);assert.equal(alloc,n);
 const D=bldDim(key)!;assert.ok(D.w>0&&D.h>0);
 const cv=createCanvas(600,600),g:any=cv.getContext('2d');g.globalAlpha=.8;const a=g.globalAlpha;const tr=g.getTransform();
 const scale=Math.min(1,500/D.w,400/D.h);assert.equal(drawBld(g,key,300,450,0,scale,true,.5),true,key);assert.equal(g.globalAlpha,a);assert.deepEqual(g.getTransform(),tr);
 const p=g.getImageData(0,0,600,600).data;let count=0,maxAlpha=0;
 for(let y=0;y<600;y++)for(let x=0;x<600;x++){const v=p[(y*600+x)*4+3];if(v){count++;maxAlpha=Math.max(maxAlpha,v);assert.ok(x>=Math.floor(300-D.w*scale/2)-2&&x<=Math.ceil(300+D.w*scale/2)+2);assert.ok(y>=Math.floor(450-D.h*scale)-2&&y<=452)}}
 assert.ok(count>30,key);assert.ok(maxAlpha<=110,key);signatures.add(createHash('sha256').update(p).digest('hex'));
}
assert.ok(signatures.size>=85,`distinct props ${signatures.size}`);
assert.equal(townPropMips('p_missing'),null);assert.equal(drawBld(createCanvas(50,50).getContext('2d') as any,'p_missing',0,0,0),false);
for(const v of ['dark','snow','rose']){ const norm=townPropMips('p_stall_tal')![0].getContext('2d')!.getImageData(0,0,100,100).data, mod=townPropMips('p_stall_tal|'+v)![0].getContext('2d')!.getImageData(0,0,100,100).data; assert.notDeepEqual(norm,mod,v); }
// 传送阵状态、遗迹组合与真实秘境主题均能使用新的绘制路径。
function pixels(key:string){const cv=createCanvas(500,500),g:any=cv.getContext('2d');assert.equal(drawBld(g,key,250,450,0,.8),true,key);return Buffer.from(g.getImageData(0,0,500,500).data)}
assert.notDeepEqual(pixels('p_tp_on'),pixels('p_tp_off'));
assert.notDeepEqual(pixels('p_e_tp_ancient'),pixels('p_e_tp_broken'));
assert.notDeepEqual(pixels('p_e_ship_s'),pixels('p_e_ship_l'));
const {PROP2}=await import('../src/gfx/propDims');const {PROP_SRC}=await import('../src/gfx/propData');
const special=Object.keys(PROP2).filter(k=>k.startsWith('p_e_'));assert.equal(special.length,35);
for(const key of special){assert.ok(Object.hasOwn(TOWN_PROP_TYPES,key),key);assert.ok(!Object.hasOwn(PROP_SRC,key),key)}
assert.notDeepEqual(pixels('p_lion_l'),pixels('p_lion_r'));
const {THEMES}=await import('../src/data/mijing');
for(const theme of Object.values(THEMES)){
 const matching=[...theme.props,...theme.deco,...theme.lights].filter(k=>Object.prototype.hasOwnProperty.call(TOWN_PROP_TYPES,k));
 for(const key of matching) { const image=pixels(key+(theme.variant?'|'+theme.variant:'')); assert.ok(image.some(Boolean),key); }
}
// 家园和名地实际收集队列随后调用 drawBld，验证不依赖旧贴图加载。
const {HomeSys}=await import('../src/world/home');const {ACTIVE_MAP}=await import('../src/data/world');
const home=new HomeSys({ws:{home:{map:ACTIVE_MAP,x:500,y:500}},life:{vis:()=>1}} as any);const homeList:any[]=[];
home.collect(homeList,{left:0,top:0,right:1000,bottom:1000},0);assert.equal(homeList.length,3);
const hcv=createCanvas(1000,1000),hg:any=hcv.getContext('2d'),seen:any[]=[];const nativeDraw=hg.drawImage.bind(hg);hg.drawImage=(im:any,...args:any[])=>{seen.push(im);return nativeDraw(im,...args)};homeList[2].draw(hg);
assert.ok(seen.some(im=>townPropMips('p_e_cave_table')!.includes(im)));assert.ok(seen.some(im=>townPropMips('p_censer')!.includes(im)));
const {LANDMARKS}=await import('../src/data/landmarks');const {LandmarkSys}=await import('../src/world/landmarks');
const stand=LANDMARKS.flatMap(l=>l.stands).find(s=>s.tex==='p_e_pillar_b');assert.ok(stand);
const lm=new LandmarkSys({cam:{zoom:1},ws:{flags:{}}} as any);const queue:any[]=[];lm.collect(queue,{left:stand.x-10,right:stand.x+10,top:stand.y-10,bottom:stand.y+10},0);
const lcv=createCanvas(1000,1000),lg:any=lcv.getContext('2d');lg.translate(500-stand.x,700-stand.y);const observed:any[]=[];const ld=lg.drawImage.bind(lg);lg.drawImage=(im:any,...args:any[])=>{observed.push(im);return ld(im,...args)};
for(const d of queue.filter(x=>x.y===stand.y))d.draw(lg);assert.ok(observed.some(im=>townPropMips('p_e_pillar_b')!.includes(im)));
// 无文档或画布创建失败时返回失败，不声称存在旧图片回退。
const doc=(globalThis as any).document;delete (globalThis as any).document;assert.equal(townPropMips('p_ore'),null);(globalThis as any).document=doc;
setCanvasFactory(()=>{throw new Error('canvas unavailable')});assert.equal(townPropMips('p_ore|rose'),null);assert.equal(drawBld(createCanvas(20,20).getContext('2d') as any,'p_ore|rose',0,0,0),false);
setCanvasFactory((w,h)=>{alloc++;return createCanvas(w,h) as any});assert.ok(townPropMips('p_ore|rose'));
// 使用真实布局和绘制器，验证 y 锚点与淡出参数保持原流程。
const { ALL_LOCATIONS }=await import('../src/data/world');const { layoutLocation }=await import('../src/gfx/building');const { Renderer }=await import('../src/world/render');
const regionMatch: Record<string, (l: any) => boolean> = {
 tiannan: (l) => l.map === 'renjie' && l.ox < 700 && l.oy > 350,
 luanxing: (l) => l.map === 'renjie' && l.ox >= 700,
 dajin: (l) => l.map === 'renjie' && l.oy <= 350,
};
for(const map of ['tiannan','luanxing','dajin']){
 const loc=ALL_LOCATIONS.find((l:any)=>regionMatch[map](l) && (l.type==='town'||l.type==='isle') && layoutLocation(l).pieces.some((p:any)=>TOWN_PROP_TYPES[p.p?.k?.split('|')[0]]));assert.ok(loc,map);
 const props=layoutLocation(loc!).pieces.filter((p:any)=>TOWN_PROP_TYPES[p.p?.k?.split('|')[0]]);assert.ok(props.length);
 const cv=createCanvas(1000,1000),g:any=cv.getContext('2d');const renderer:any=Object.create(Renderer.prototype);renderer.ctx=g;renderer.game={cam:{zoom:1}};renderer.dpr=1;renderer.xray=()=>0.42;
 let rendered=0;for(const p of props.slice(0,12)){if(p.p.name)continue;renderer.drawBldPieceFull(p,500,700,0);rendered++}assert.ok(rendered);
 let count=0;const pixels=g.getImageData(0,0,1000,1000).data;for(let i=3;i<pixels.length;i+=4)if(pixels[i])count++;assert.ok(count>50,map);
}
console.log(`town props: ${keys.length} procedural keys, variants, anchors, opacity, caching and three regional layouts passed`);
