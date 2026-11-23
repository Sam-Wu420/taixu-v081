import './env';
import assert from 'node:assert/strict';
import {createCanvas} from './env';
import {CharState,HANLI_LOOK,DEFAULT_WARDROBE,dressLook,drawCharacter} from '../src/gfx/character';
const look=dressLook(HANLI_LOOK,{...DEFAULT_WARDROBE.m,clothingStyle:{skirt:'split',robeLen:'long'},idle:'stand'});
function frame(yaw:number){const cv=createCanvas(400,500),g:any=cv.getContext('2d'),s=new CharState(200,430);s.seed=3;s.t=1;s.yaw=s.targetYaw=yaw;s.blend=1;for(let i=0;i<45;i++){s.update(1/60);g.clearRect(0,0,400,500);drawCharacter(g,look,s,3.6,1/60);}return g.getImageData(135,265,130,175).data;}
for(const side of [-1,1]){
 const a=frame(side*Math.PI/2-0.002),b=frame(side*Math.PI/2+0.002);let diff=0;for(let i=0;i<a.length;i++)diff+=Math.abs(a[i]-b[i]);
 assert.ok(diff/a.length<3,`near-side robe jumping: ${diff/a.length}`);
}
console.log('split robe: real Canvas adjacent side angles preserve continuous panel placement');
