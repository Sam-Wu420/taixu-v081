import './env';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { drawNode } from '../src/world/nodes';
function render(kind:'herb'|'ore',rare:boolean){
 const ctx=createCanvas(180,180).getContext('2d') as any;const calls:any[]=[];
 const proxy=new Proxy(ctx,{get(target,p){const value=target[p];if(p==='scale')return (...args:any[])=>{calls.push(['scale',...args]);return value.apply(target,args)};if(p==='createRadialGradient')return (...args:any[])=>{calls.push(['gradient',...args]);return value.apply(target,args)};return typeof value==='function'?value.bind(target):value;},set(target,p,value){target[p]=value;return true;}});
 drawNode(proxy,{key:'a',kind,item:kind==='herb'?'herb_huangjing':'mat_tiejing',x:90,y:90,rare,seed:1},1,.6,false);
 const pixels=ctx.getImageData(0,0,180,180).data;let ink=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])ink++;
 return {calls,ink,alpha:ctx.globalAlpha};
}
const herb=render('herb',false),rare=render('herb',true),ore=render('ore',false);
assert.ok(herb.calls.some(x=>x[0]==='scale'&&x[1]===1.38&&x[2]===1.38));assert.ok(!ore.calls.some(x=>x[0]==='scale'));assert.equal(herb.calls.filter(x=>x[0]==='gradient').length,1);assert.equal(ore.calls.filter(x=>x[0]==='gradient').length,1);assert.ok(herb.ink>2000&&rare.ink>2000);assert.equal(herb.alpha,1,'canvas state restored');
console.log('herb rendering: real canvas, ground-anchored scale, one glow, rare/ordinary and unchanged ore path passed');
