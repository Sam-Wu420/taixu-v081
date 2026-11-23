import './env';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const W=await import('../src/data/world');const {Terrain}=await import('../src/world/terrain');const {Game}=await import('../src/world/game');const {Travel}=await import('../src/world/travel');
const t=new Terrain();t.build();const find=(x:number,y:number)=>Game.prototype.findLand.call({terrain:t} as any,x,y);const generated:any[]=[];
const game:any={hero:{dead:false},player:{x:0,y:0},pursuit:{active:false},toast(){}};const tr:any=new Travel(game);tr.go=(map:string,x:number,y:number,days:number,via:string)=>{generated.push({map,x,y,days,via})};
for(const exit of W.MAP_EXITS[W.ACTIVE_MAP]) {
 for(let i=0;i<=20;i++) {
  game.player.x=400+(W.WORLD_W-800)*i/20;game.player.y=exit.edge==='n'?200:W.WORLD_H-200;
  const before=generated.length;tr.crossEdge(exit.to,exit.days);assert.equal(generated.length,before+1);const x=generated.at(-1);assert.equal(x.map,exit.to);assert.equal(x.days,exit.days);assert.equal(x.via,'edge');
  const size=W.mapSize(exit.to);assert.ok(x.x>=0&&x.x<=size.W*W.WORLD_SCALE&&x.y>=0&&x.y<=size.H*W.WORLD_SCALE);
 }
 const count=generated.length;game.pursuit.active=true;tr.crossEdge(exit.to,exit.days);assert.equal(generated.length,count);game.pursuit.active=false;
 game.player.y=W.WORLD_H/2;tr.crossEdge(exit.to,exit.days);assert.equal(generated.length,count);
}
for(const p of W.PORTALS) for(const id of [p.a,p.b]) {
 const loc=W.LOC_BY_ID.get(id)!;if(loc.map!==W.ACTIVE_MAP)continue;
 game.player.x=loc.x*W.WORLD_SCALE;game.player.y=loc.y*W.WORLD_SCALE;
 const found=tr.nearPortal();assert.ok(found);assert.equal(found.here.id,id);assert.notEqual(found.there.id,id);
 const q=find(game.player.x,game.player.y);assert.ok(t.walkFactor(q.x,q.y)>0,`portal ${id} sea`);
 game.player.x+=2000;assert.equal(tr.nearPortal(),null);
}
// 栅格采样验证：人界整图天南（青玄门/梁京）与大晋（朔州/晋京）由同一连续大陆直连，无需过界切图。
if (W.ACTIVE_MAP==='renjie') {
 const from=W.LOC_BY_ID.get('qixuan')!, to=W.LOC_BY_ID.get('shuozhou')!;assert.ok(from&&to);
 const step=1200, gw=Math.ceil(W.WORLD_W/step),gh=Math.ceil(W.WORLD_H/step), pass=new Uint8Array(gw*gh);
 for(let y=0;y<gh;y++)for(let x=0;x<gw;x++)pass[y*gw+x]=t.walkFactor((x+.5)*step,(y+.5)*step)>0?1:0;
 const sx=Math.min(gw-1,Math.floor(from.x*W.WORLD_SCALE/step)),sy=Math.min(gh-1,Math.floor(from.y*W.WORLD_SCALE/step));
 const tx=Math.min(gw-1,Math.floor(to.x*W.WORLD_SCALE/step)),ty=Math.min(gh-1,Math.floor(to.y*W.WORLD_SCALE/step));
 const start=sy*gw+sx, goal=ty*gw+tx;assert.equal(pass[start],1,'qixuan not on coarse land');assert.equal(pass[goal],1,'shuozhou not on coarse land');
 const seen=new Uint8Array(gw*gh),queue=[start];seen[start]=1;
 for(let k=0;k<queue.length;k++){const i=queue[k],x=i%gw,y=Math.floor(i/gw);for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){if(nx<0||ny<0||nx>=gw||ny>=gh)continue;const j=ny*gw+nx;if(pass[j]&&!seen[j]){seen[j]=1;queue.push(j)}}}
 assert.ok(seen[goal],'renjie: no continuous walking route from Tiannan to Dajin');
}
const incoming=JSON.parse(readFileSync(0,'utf8')||'[]');let fallback=0;
for(const p of incoming){assert.equal(p.map,W.ACTIVE_MAP);const q=find(p.x,p.y);assert.ok(t.walkFactor(q.x,q.y)>0,`${W.ACTIVE_MAP}: ${p.x},${p.y} => ${q.x},${q.y}`);assert.ok(q.x>=400&&q.x<=W.WORLD_W-400&&q.y>=400&&q.y<=W.WORLD_H-400);if(Math.hypot(q.x-p.x,q.y-p.y)>12000)fallback++}
console.log(JSON.stringify({map:W.ACTIVE_MAP,generated,incoming:incoming.length,fallback}));
