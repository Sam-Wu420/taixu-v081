import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { drawMapMarkLabel, mapMarkLabelBox } from '../src/gfx/mapMarkLabel';
for(const fs of [10,14,20,28])for(const name of ['府','脉','灵脉','山神庙']){
 const b=mapMarkLabelBox(100,90,40,fs);const calls:any[]=[];
 const ctx:any={textBaseline:'alphabetic',textAlign:'left',fillStyle:'',save(){calls.push(['save'])},restore(){calls.push(['restore'])},fillRect(...args:any[]){calls.push(['rect',...args])},fillText(...args:any[]){calls.push(['text',this.textBaseline,this.textAlign,...args])}};
 drawMapMarkLabel(ctx,name,100,90,40,fs,'black');const rect=calls.find(c=>c[0]==='rect'),text=calls.find(c=>c[0]==='text');
 assert.equal(text[1],'middle');assert.equal(text[2],'center');assert.equal(text[5],rect[2]+rect[4]/2);assert.equal(rect[2],b.y);
 const g=createCanvas(200,140).getContext('2d') as any;g.font=`${fs}px sans-serif`;drawMapMarkLabel(g,name,100,90,40,fs,'black');assert.ok(g.getImageData(100,90-fs+1,1,1).data[3]>0);
}
console.log('world-map labels: text centered in actual background at multiple sizes; canvas render passed');
