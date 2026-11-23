import './env';
import assert from 'node:assert/strict';
import {createCanvas} from './env';
import {CharState,HANLI_LOOK,DEFAULT_WARDROBE,dressLook,drawCharacter} from '../src/gfx/character';
for(const sex of ['m','f'] as const)for(const yaw of [-Math.PI/2,Math.PI/2]){
 const cv=createCanvas(400,400),g:any=cv.getContext('2d'),st=new CharState(200,310);st.seed=3;st.t=1;st.yaw=st.targetYaw=yaw;st.setAction('sit');st.blend=1;
 const look=dressLook(HANLI_LOOK,DEFAULT_WARDROBE[sex]);
 for(let i=0;i<50;i++){st.update(1/60);g.clearRect(0,0,400,400);drawCharacter(g,look,st,3.2,1/60);}
 // On either side profile the area behind the pelvis must have cloth volume,
 // not merely the fine hanging sash that formerly masked the missing hip.
 const rear=yaw>0?188:212;const ink=g.getImageData(rear,286,1,1).data[3];assert.ok(ink>100,`${sex}/${yaw}: seated rear volume missing`);
}
for(const sex of ['m','f'] as const)for(let d=0;d<8;d++){
 const cv=createCanvas(320,320),g:any=cv.getContext('2d'),st=new CharState(160,250);st.seed=2;st.yaw=st.targetYaw=d*Math.PI/4;st.setAction('sit');st.blend=1;
 for(let i=0;i<10;i++){st.update(1/60);drawCharacter(g,dressLook(HANLI_LOOK,DEFAULT_WARDROBE[sex]),st,2,1/60);}
 assert.ok(g.getImageData(160,225,1,1).data[3]>0,`${sex}/${d}: seated silhouette missing`);
}
console.log('seated Canvas: visible rear hip volume in mirrored profiles, both bodies and eight directions passed');
