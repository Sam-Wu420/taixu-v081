import './env';
import assert from 'node:assert/strict';
import { createCanvas } from './env';
import { flightMount, setFlightMount, effectiveFlightMount, isFlightMountItem } from '../src/world/flightMount';
import { itemArtLook } from '../src/data/itemArtLook';
import { CharState, HANLI_LOOK, drawCharacter, drawArtifactUnderFeet } from '../src/gfx/character';
import type { Hero } from '../src/world/cultivation';
import { createHash } from 'node:crypto';
const hero={bag:[{id:'art_shenfeng',n:1},{id:'art_qingzhu',n:1},{id:'art_xuantie',n:1},{id:'herb_huangjing',n:1}],equip:{armor:'art_foo',flight:'art_shenfeng'}} as Hero;
assert.equal(flightMount(hero),undefined);
assert.equal(effectiveFlightMount(hero),'art_shenfeng');
assert.equal(isFlightMountItem('art_xuantie'),false);
assert.equal(isFlightMountItem('art_shenfeng'),true);
assert.equal(isFlightMountItem('art_qingzhu'),true);
assert.equal(setFlightMount(hero,'herb_huangjing'),false);assert.equal(setFlightMount(hero,'art_fenglei'),false);assert.equal(setFlightMount(hero,'art_xuantie'),false);
assert.ok(setFlightMount(hero,'art_qingzhu'));assert.equal(flightMount(hero),'art_qingzhu');assert.equal(effectiveFlightMount(hero),'art_qingzhu');assert.deepEqual(hero.equip,{armor:'art_foo',flight:'art_shenfeng'});
const restored=JSON.parse(JSON.stringify(hero)) as Hero;assert.equal(flightMount(restored),'art_qingzhu');
restored.bag=[];assert.equal(flightMount(restored),undefined);assert.equal(setFlightMount(hero,null),true);assert.equal(flightMount(hero),undefined);assert.equal(effectiveFlightMount(hero),'art_shenfeng');
assert.equal(itemArtLook('art_shenfeng').shape,'boat');assert.notEqual(itemArtLook('art_qingzhu').shape,'boat');
const cv=createCanvas(360,360),ctx=cv.getContext('2d') as any;
function render(mount?:string,free=false,yaw=0){const st=new CharState(180,265);st.t=1;st.seed=42;st.yaw=st.targetYaw=yaw;st.speed=180;st.lift=15;st.freeFlight=free;st.setAction('fly');
 for(let i=0;i<20;i++){st.update(1/60);ctx.clearRect(0,0,360,360);drawCharacter(ctx,HANLI_LOOK,st,1.5,1/60,{mount,noDefaultMount:true});}
 return createHash('sha256').update(cv.toBuffer('image/png')).digest('hex');}
for(let i=0;i<8;i++) {const a=render(undefined,true,i*Math.PI/4),b=render('art_qingzhu',false,i*Math.PI/4),c=render('art_shenfeng',false,i*Math.PI/4);assert.notEqual(a,b);assert.notEqual(b,c);}
// Same pose and state, only mount policy differs: unmounted player must not draw NPC's default sword.
function bare(noDefaultMount:boolean){const st=new CharState(180,265);st.t=1;st.seed=42;st.setAction('fly');ctx.clearRect(0,0,360,360);drawCharacter(ctx,HANLI_LOOK,st,1.5,0,{noDefaultMount});return createHash('sha256').update(cv.toBuffer('image/png')).digest('hex');}
assert.notEqual(bare(true),bare(false));
ctx.clearRect(0,0,360,360);drawArtifactUnderFeet(ctx,180,180,Math.PI/2,1,'art_qingzhu');assert.ok(ctx.getImageData(180,180,1,1).data[3]>0);
console.log('independent flight slot: ownership, saves, no phantom equipment, free flight and eight-angle actual Canvas mounts passed');
