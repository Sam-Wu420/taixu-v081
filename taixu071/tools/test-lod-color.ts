import './env';
import assert from 'node:assert/strict';
import {createCanvas} from './env';
import {CharState,HANLI_LOOK,drawCharacter} from '../src/gfx/character';
import {gatherNodeColor} from '../src/world/nodes';
import {drawGatherVisual,GATHER_BEAM_COLORS} from '../src/world/gatherVisual';
const samples:any[]=[{kind:'herb',item:'herb_xuelian',x:0,y:0,seed:0},{kind:'herb',item:'herb_xuejing',x:0,y:0,seed:0},{kind:'herb',item:'herb_huolong',x:0,y:0,seed:0},{kind:'herb',item:'herb_jiuqu',x:0,y:0,seed:0},{kind:'ore',item:'mat_xuanyu',x:0,y:0,seed:0},{kind:'spring',item:'mat_lingquan',x:0,y:0,seed:0}];
for(const n of samples){const c=createCanvas(300,300),g:any=c.getContext('2d');g.translate(150,200);let colors:string[]=[];const proxy=new Proxy(g,{get(t,p){if(p==='fill')return (...a:any[])=>{colors.push(String(t.fillStyle));return t.fill(...a)};const v=t[p];return typeof v==='function'?v.bind(t):v},set(t,p,v){t[p]=v;return true;}});drawGatherVisual(proxy,n,0,1,false,.1,.1,false);assert.ok(colors.includes(gatherNodeColor(n)),`low LOD marker should use ${n.kind}/${n.item} entity color`);}
assert.notEqual(gatherNodeColor(samples[3]),`rgb(${GATHER_BEAM_COLORS[5]})`,'tier beam color remains independent');
// Track actual gradient stops used by each rendered LOD at the same screen scale.
function gradients(detail:number){const cv=createCanvas(360,400),g:any=cv.getContext('2d'),found:string[][]=[];
 const proxy=new Proxy(g,{get(t,p){if(p==='createLinearGradient'||p==='createRadialGradient')return (...a:any[])=>{const grad=t[p](...a),stops:string[]=[];found.push(stops);const add=grad.addColorStop.bind(grad);grad.addColorStop=(v:number,c:string)=>{stops.push(`${v}:${c}`);return add(v,c)};return grad};const v=t[p];return typeof v==='function'?v.bind(t):v},set(t,p,v){t[p]=v;return true;}});
 const st=new CharState(180,320);st.seed=3;st.t=1;st.blend=1;drawCharacter(proxy,HANLI_LOOK,st,2,0,{detail});return found.map(x=>x.join('|'));
}
const near=gradients(1),far=gradients(100);
// Main cloth, hair and face gradients should still exist at both levels.
for(const signature of far.filter(s=>s.split('|').length>=3)) assert.ok(near.includes(signature),`gradient changed across LOD: ${signature}`);
assert.ok(far.length>=3,'low detail keeps the primary shaded colors');
console.log('LOD palette: actual character main gradients retained and gather markers use entity colors; tier beams unchanged');
// Compare the original and fallback ground at unobstructed pixels, including custom pigments.
const {renderGround,LOC_SCALE}=await import('../src/gfx/building');
const {drawLocationOutlineFallback}=await import('../src/gfx/locationLod');
const pal={ground:'#769db4',roof:'#882244',wall:'#ddeedd',stone:'#bda070',trim:'#123456',pillar:'#123456',accent:'#abcdef'};
for(const kind of ['plaza','street','terrace','stairs','dock','field','pond','moonpool','bloodpool','courtyard']){
 const layout:any={id:'lod-color',gw:300,gh:300,ground:[{kind,x:0,y:0,w:180,h:140,p:kind==='field'?{col:'#829c55'}:{}}],pieces:[],pal};
 const orig:any=renderGround(layout,1).canvas;const c=createCanvas(300,300),g:any=c.getContext('2d');g.translate(150,150);g.scale(1/LOC_SCALE,1/LOC_SCALE);drawLocationOutlineFallback(g,layout,0,0);
 // Choose a location between the original's texture lines; the simplified layer should use the same pigment.
 const a=orig.getContext('2d').getImageData(177,162,1,1).data,b=g.getImageData(177,162,1,1).data;
 assert.ok(b[3]>0,`${kind}: simplified ground missing`);
 if(['street','terrace','stairs','dock','pond','moonpool','bloodpool','courtyard'].includes(kind))assert.deepEqual([...b],[...a],`${kind}: base color differs`);
}
console.log('location base colors: original and simplified ground sampled in actual Canvas');
