import './env';
import assert from 'node:assert/strict';
import { MijingSys, REALM_OX, REALM_OY, CELL } from '../src/world/mijing';
import { THEMES } from '../src/data/mijing';
const sys:any = new MijingSys({} as any);let count=0, noBoss=0, disconnected=0,badSpawn=0, badObj=0;
for (const theme of Object.keys(THEMES)) for(let seed=1;seed<=100;seed++) for(const tier of [1,2,3]) for(const fi of [0,1]) {
 const spec:any={name:'test',theme,seed,tier,rooms:tier===1?5:tier===2?10:16,floors:2,lv:4};
 const f=sys.gen(spec,fi); count++;if(!f.rooms.some((r:any)=>r.kind==='boss'))noBoss++;
 const entry=f.rooms[0], spawn=(entry.cy+1)*f.gw+entry.cx;if(f.cells[spawn]!==1)badSpawn++;
 const visited=new Uint8Array(f.gw*f.gh),start=entry.cy*f.gw+entry.cx,q=[start];visited[start]=1;
 for(let i=0;i<q.length;i++){const p=q[i],x=p%f.gw,y=Math.floor(p/f.gw); for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){if(nx<0||ny<0||nx>=f.gw||ny>=f.gh)continue;const n=ny*f.gw+nx;if(!visited[n]&&(f.cells[n]===1||f.cells[n]===2)){visited[n]=1;q.push(n)}}}
 if(f.rooms.some((r:any)=>!visited[r.cy*f.gw+r.cx]))disconnected++;
 for(const o of f.objs.filter((o:any)=>['exit','stairs','chest','herb','stele'].includes(o.kind))){const x=Math.floor((o.x-REALM_OX)/CELL),y=Math.floor((o.y-REALM_OY)/CELL);if(x<0||y<0||x>=f.gw||y>=f.gh||f.cells[y*f.gw+x]!==1||!visited[y*f.gw+x])badObj++}
}
console.log({count,noBoss,disconnected,badSpawn,badObj});
assert.equal(noBoss,0);assert.equal(disconnected,0);assert.equal(badSpawn,0);assert.equal(badObj,0);

// 强制构造入口中心下方为墙的模板，验证落点退回可走的房间中心。
const f:any={gw:3,gh:3,cells:new Uint8Array([0,0,0,0,1,0,0,0,0]),rooms:[{cx:1,cy:1}],objs:[]};
const player:any={x:0,y:0,st:{x:0,y:0,strands:new Map(),springs:new Map()}};
const game:any={player,cam:{},npcs:{followers:()=>[]}};
const s:any=new MijingSys(game);s.cur={fi:0,floors:[f]};s.placeAtEntry();
assert.equal(player.x,REALM_OX+1.5*CELL);assert.equal(player.y,REALM_OY+1.5*CELL);assert.equal(s.walk(player.x,player.y),true);
console.log('mijing generation: 5400 floors, connectivity with openable barriers, interactable positions and entry fallback passed');
