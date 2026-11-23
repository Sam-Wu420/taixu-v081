import './env';
import assert from 'node:assert/strict';
import {createCanvas} from './env';
import {drawFarTreeSprites} from '../src/world/decoOutline';
const sprite:any=createCanvas(12,15);const sg:any=sprite.getContext('2d');sg.fillStyle='#349051';sg.fillRect(1,1,4,8);sg.fillStyle='#423019';sg.fillRect(4,8,2,5);
const spr:any={canvas:sprite,ax:6,ay:13,w:12,h:15};
const trees:any[]=[{x:20,y:30,s:1,flip:false},{x:70,y:55,s:2,flip:true}];
const a:any=createCanvas(120,100),b:any=createCanvas(120,100);const ag:any=a.getContext('2d'),bg:any=b.getContext('2d');
assert.equal(drawFarTreeSprites(ag,[trees],()=>spr,1),2);
for(const d of trees){bg.save();bg.translate(d.x,d.y);bg.scale((d.flip?-1:1)*d.s,d.s);bg.drawImage(sprite,-spr.ax,-spr.ay,spr.w,spr.h);bg.restore();}
assert.deepEqual(Buffer.from(ag.getImageData(0,0,120,100).data),Buffer.from(bg.getImageData(0,0,120,100).data));
assert.equal(drawFarTreeSprites(ag,[trees],()=>spr,1,1),1);
console.log('extreme distant trees: same low-detail sprite and anchor for flipped/unflipped trees, bounded draw');
