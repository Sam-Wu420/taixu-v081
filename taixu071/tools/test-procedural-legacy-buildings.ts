import './env';
import assert from 'node:assert/strict';
import {createCanvas} from './env';
import {readFileSync} from 'node:fs';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const {bldTex,loadBldTex}=await import('../src/gfx/bldTex');
const names=['hall_grey','hall_jade','hall_dark','hall_rose','pagoda','paifang','house_a','house_b','hut','yurt','stall','tower','citygate','wall','lion','ding','stele','well','lantern','boat'];
loadBldTex(()=>{throw Error('unexpected async callback')});
for(const name of names){const c:any=bldTex(name);assert.ok(c, name);assert.equal(c,bldTex(name));const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>8)n++;assert.ok(n>50,`${name} blank`)}
assert.equal(bldTex('unknown'),null);
const {renderLmStand}=await import('../src/gfx/landmark');
for(const k of ['ruinhall','gate','invtower'] as const){const sp:any=renderLmStand({k,w:180,h:180,seed:5,name:'山门'},1);assert.ok(sp?.canvas,k);const c:any=sp.canvas;const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>8)n++;assert.ok(n>100,k)}
const {headTexReady,headTex,loadHeadTex}=await import('../src/gfx/headTex');loadHeadTex();assert.equal(headTexReady('hanli'),false);assert.equal(headTex('hanli','front',80),null);
const {CharState,HANLI_LOOK,drawCharacter}=await import('../src/gfx/character');
for(let a=0;a<8;a++){const c=createCanvas(300,300),g:any=c.getContext('2d');const st=new CharState(150,220);st.yaw=st.targetYaw=a*Math.PI/4;st.setAction('walk');st.update(1/60);drawCharacter(g,{...HANLI_LOOK,headTex:'hanli'},st,1.3,1/60);const d=g.getImageData(0,0,300,300).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>8)n++;assert.ok(n>100,`head ${a}`)}
for(const f of ['src/gfx/bldTex.ts','src/gfx/headTex.ts'])assert.ok(!/import\(['"]\.\/(bldTexData|headTexData)/.test(readFileSync(f,'utf8')));
console.log('legacy buildings: 20 cached procedural keys, 3 landmark renderers, 8 character orientations and no legacy imports passed');
