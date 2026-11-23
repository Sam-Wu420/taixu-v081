import { createCanvas } from './env.ts';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import { JSDOM } from 'jsdom';
const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true,url:'https://game.example'}),w=dom.window;
globalThis.window=w;globalThis.document=w.document;Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true,writable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const surfaces=new WeakMap();w.HTMLCanvasElement.prototype.getContext=function(){let cv=surfaces.get(this);if(!cv){cv=createCanvas(this.width||300,this.height||150);surfaces.set(this,cv);}const ctx=cv.getContext('2d');if(!ctx.__wrapped){const draw=ctx.drawImage.bind(ctx);ctx.drawImage=(img,...args)=>draw(img instanceof w.HTMLCanvasElement ? surfaces.get(img) : img,...args);ctx.__wrapped=true;}return ctx;};
let pending=new Map(),n=0;globalThis.requestAnimationFrame=w.requestAnimationFrame=fn=>{pending.set(++n,fn);return n};globalThis.cancelAnimationFrame=w.cancelAnimationFrame=id=>pending.delete(id);
let time=performance.now();function step(){time+=20;const callbacks=[...pending.values()];pending.clear();for(const cb of callbacks)cb(time);}
const React=await import('react'),{createRoot}=await import('react-dom/client');const {WardrobeStudio}=await import('../src/ui/Wardrobe.tsx');const {DEFAULT_WARDROBE}=await import('../src/gfx/character.ts');
const root=createRoot(document.getElementById('root'));await React.act(async()=>root.render(React.createElement(WardrobeStudio,{value:DEFAULT_WARDROBE.m,onChange:()=>{},mount:'art_shenfeng'})));
const hashes=[];
for(const name of ['凌空悬停','凌空飞行','御器悬停','御器飞行']){
 const button=[...document.querySelectorAll('.wd-left button')].find(b=>b.textContent===name);assert.ok(button,`missing ${name}`);await React.act(async()=>button.click());assert.ok(button.classList.contains('on'));for(let i=0;i<12;i++)step();const cv=document.querySelector('.wd-canvas'),data=surfaces.get(cv).getContext('2d').getImageData(0,0,cv.width,cv.height).data;assert.ok(data.some((v,i)=>i%4===3&&v>0),`${name} rendered`);hashes.push(createHash('sha256').update(data).digest('hex')); 
}
assert.notEqual(hashes[0],hashes[1]);assert.notEqual(hashes[1],hashes[3]);assert.notEqual(hashes[2],hashes[3]);
assert.match(document.querySelector('.wd-tip').textContent,/未装备时展示示例飞剑/);await React.act(async()=>root.unmount());assert.equal(pending.size,0);
console.log('wardrobe actual DOM and Canvas: flight buttons, active state, preview frames and cleanup passed');
