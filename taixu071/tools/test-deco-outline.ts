import './env';
import assert from 'node:assert/strict';
import {representativeTrees} from '../src/world/decoOutline';
const trees=Array.from({length:256},(_,i)=>({kind:'tree' as const,sp:(i%2?'broad':'peach') as 'broad'|'peach',v:i%24,x:(i%16)*63+10,y:Math.floor(i/16)*63+10,w:90,h:180,s:.7,flip:false,ph:0,lod:0}));
const rep=representativeTrees(trees,0,0,1024,24);assert.equal(rep.length,24);assert(rep.every(t=>trees.includes(t)),'must use real trees, not manufactured colour blobs');assert.equal(new Set(rep).size,24);assert(rep.some(t=>t.y<256)&&rep.some(t=>t.y>768));assert(rep.some(t=>t.x<256)&&rep.some(t=>t.x>768));
assert.deepEqual(representativeTrees(trees,0,0,1024,24),rep);assert.deepEqual(representativeTrees([],0,0,1024,24),[]);assert.deepEqual(representativeTrees(trees,0,0,0,24),[]);assert.deepEqual(representativeTrees(trees.slice(0,3),0,0,1024,24),trees.slice(0,3));
console.log('far vegetation: bounded stable spatial selection uses existing trees and original positions');
// An unavailable tree sprite must not leave the world transform rotated/scaled for later drawables.
import { Renderer } from '../src/world/render';
import {createCanvas} from './env';
const c=createCanvas(100,100),ctx=c.getContext('2d');ctx.setTransform(.4,0,0,.4,12,13);
const fake:any={game:{cam:{zoom:.2},weather:{wind:0}},Z:.4,ox:12,oy:13,flatTrees:true,_occA:1,ctx,treeSprite:()=>null,world(){this.ctx.setTransform(this.Z,0,0,this.Z,this.ox,this.oy);}};
(Renderer.prototype as any).drawTree.call(fake,trees[0],0,1,1);const m=ctx.getTransform();assert(Math.abs(m.a-.4)<1e-6);assert(Math.abs(m.d-.4)<1e-6);assert.equal(m.e,12);assert.equal(m.f,13);
