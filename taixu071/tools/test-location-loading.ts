import './env';
import assert from 'node:assert/strict';
import {createCanvas} from './env';
import {ALL_LOCATIONS} from '../src/data/world';
import {getLayout} from '../src/gfx/building';
import {drawMissingLocationPiece,drawLocationPieceFallback} from '../src/gfx/locationLod';
import {SpriteCache} from '../src/gfx/sprites';
const loc=ALL_LOCATIONS.find(l=>l.name==='定武城') ?? ALL_LOCATIONS.find(l=>l.type==='city')!;
const L=getLayout(loc);const houses=L.pieces.filter(p=>p.kind==='house');assert(houses.length>=4);
const c=createCanvas(500,180),ctx=c.getContext('2d');const cache=new SpriteCache();cache.canBuild=()=>false;cache.beginFrame();
for(let i=0;i<4;i++){
 const pc=houses[i], key='house:'+i;const missing=cache.get(key,.35,()=>{throw Error('budget exceeded')});assert.equal(missing,null);
 assert(drawMissingLocationPiece(ctx as any,pc,L,60+i*120,130,missing));
}
const alpha=(x:number)=>{const a=ctx.getImageData(x-35,30,70,100).data;let n=0;for(let i=3;i<a.length;i+=4)if(a[i]>0)n++;return n;};
for(let i=0;i<4;i++)assert(alpha(60+i*120)>30,`house ${i} must not disappear during budget exhaustion`);
const before=Buffer.from(ctx.getImageData(0,0,500,180).data);assert.equal(drawMissingLocationPiece(ctx as any,houses[0],L,60,130,{}),false);assert.deepEqual(Buffer.from(ctx.getImageData(0,0,500,180).data),before);
ctx.save();ctx.globalAlpha=.42;const transform=ctx.getTransform(), alphaBefore=ctx.globalAlpha;drawLocationPieceFallback(ctx as any,houses[0],L,60,130);assert.equal(ctx.globalAlpha,alphaBefore);assert.deepEqual(ctx.getTransform(),transform);ctx.restore();
console.log('location loading: actual city houses retain silhouettes under exhausted sprite budget; ready sprite not overwritten');
// A lower-resolution sprite is reused before falling back to a geometric silhouette.
const stored=createCanvas(32,32);cache.adopt('existing',.2,{canvas:stored as any,w:32,h:32,ax:16,ay:32});
const reusable=cache.get('existing',.5,()=>{throw Error('budget exceeded')});assert(reusable);assert.equal(reusable!.canvas,stored as any);assert.equal(drawMissingLocationPiece(ctx as any,houses[0],L,60,130,reusable),false);

// All of 定武城's actual houses, including those past the former 24-piece cutoff,
// remain structural silhouettes at tiny screen sizes rather than generic dots.
const {locationTinyPieceMode,locationStructureDetail,drawLocationOutlineFallback}=await import('../src/gfx/locationLod');
for(const house of houses)assert.equal(locationTinyPieceMode(house,4),'outline');
assert.equal(locationTinyPieceMode(houses[0],12),'full');
assert.equal(locationTinyPieceMode({kind:'stall',p:{},x:0,y:0,seed:0} as any,4),'dot');
assert.equal(locationStructureDetail(6),0);assert.equal(locationStructureDetail(10),1);let prev=0;for(let p=6;p<=10;p+=.1){const v=locationStructureDetail(p);assert(v>=prev&&v<=1);prev=v;}
const bare={...L,ground:[],wet:undefined};const actual:any=createCanvas(3600,2800),expected:any=createCanvas(3600,2800);const ga=actual.getContext('2d'),ge=expected.getContext('2d');
const tx=1800,ty=1400;drawLocationOutlineFallback(ga,bare,tx,ty);
const late=houses[houses.length-1];drawLocationPieceFallback(ge,late,bare,tx+late.x*1.5,ty+late.y*1.5);
const ad=ga.getImageData(0,0,3600,2800).data,ed=ge.getImageData(0,0,3600,2800).data;let covered=0;for(let i=3;i<ed.length;i+=4)if(ed[i]>32&&ad[i]>32)covered++;assert(covered>100,'last house still visible in whole-layout fallback');
console.log('定武城: structural fallback covers late houses, tiny houses never become dots and detail transition is continuous');

// Verify renderer actually wires the structure path and draws the ground before the cached outline.
const {readFileSync}=await import('node:fs');const source=readFileSync('src/world/render.ts','utf8');
const section=source.slice(source.indexOf('const detailWeight = locationDetailWeight(z)'),source.indexOf("prof.add('R·地点(含城镇地面)"));
assert(section.indexOf('this.drawLocGround(L, x, y, z)')<section.indexOf('this.locationOutlines.get(L,season)'));
assert.match(section,/tinyMode === 'outline'[\s\S]*?drawLocationPieceFallback/);
assert.match(section,/locationStructureDetail/);
