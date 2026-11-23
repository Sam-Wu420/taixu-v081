import assert from 'node:assert/strict';
import {Batch,FLOATS} from '../src/gl/batch';
const b=new Batch();b.reset(0,0,1,800,600,null);
// 单次条带超过初始缓冲区的两倍；此前只扩容一次却继续写顶点。
const n=10000,pts=new Float32Array(n*2);for(let i=0;i<n;i++){pts[2*i]=i;pts[2*i+1]=2*i}
b.strip(0,pts,n,()=>2,()=>0.5,0.8,0.6,0.4,0.25);
assert.equal(b.n,(n-1)*6);assert.ok(b.data.length>=b.n*FLOATS);assert.equal(b.segs[0].count,b.n);
assert.ok(Number.isFinite(b.data[b.n*FLOATS-1]));assert.ok(Math.abs(b.data[b.n*FLOATS-1]-0.375)<1e-6);
const first=b.data.slice(0,8);assert.ok(Math.abs(first[4]-0.4)<1e-6);assert.ok(Math.abs(first[5]-0.3)<1e-6);assert.ok(Math.abs(first[6]-0.2)<1e-6);
const before=b.n,capacity=b.data.length;b.strip(0,pts,n+1,()=>1,()=>1,1,1,1,0);b.strip(0,pts,1.5,()=>1,()=>1,1,1,1,0);assert.equal(b.n,before);assert.equal(b.data.length,capacity);
const giant=new Float32Array(65538*2);b.reset(0,0,1,800,600,null);b.strip(0,giant,65538,()=>1,()=>1,1,1,1,0);assert.equal(b.n,0);assert.equal(b.segs[0].count,0);
const empty=new Batch();empty.strip(0,new Float32Array(4),2,()=>1,()=>1,1,1,1,0);assert.equal(empty.n,0);
console.log('GL batch: large single strip capacity, hard limit, bounds, segment counts and premultiplied vertices passed');
