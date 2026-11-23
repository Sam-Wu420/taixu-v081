import './env';
import assert from 'node:assert/strict';
import {elecLine} from '../src/gl/bakefx';
const calls:any[]=[];const f:any={bk:(...x:any[])=>calls.push(x)};
elecLine(f,0,0,320,0,10,[1,1,1],1,0);assert.equal(calls.length,20);assert.ok(calls.every(c=>c.slice(1,6).every(Number.isFinite)));
calls.length=0;elecLine(f,0,0,1e8,0,0.00001,[1,1,1],1,0);assert.equal(calls.length,512);
calls.length=0;for(const [x,w,t] of [[10,0,0],[10,-1,0],[Infinity,1,0],[10,1,Infinity],[NaN,1,0]])elecLine(f,0,0,x,0,w,[1,1,1],1,t);assert.equal(calls.length,0);
console.log('GL effect budget: normal lightning geometry, capped extreme input, invalid values passed');
