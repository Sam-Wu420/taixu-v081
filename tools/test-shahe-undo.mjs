import assert from 'node:assert/strict';
import setup from '../mods/shahe/index.js';
class Enemy { constructor(def,x,y,realm,stage) { Object.assign(this,{def,x,y,realm,stage,hp:100,maxHp:100,atk:5,dfn:2,speed:1,dead:false,gone:false,id:Math.random()}); } }
const def={id:'test',name:'测试',flying:false};
const combat={enemies:[new Enemy(def,0,0,0,0)],allies:[],units:[],lock:null};
const game={combat,player:{x:0,y:0,st:{lift:0}},canvas:{getBoundingClientRect:()=>({left:0,top:0})},renderer:{},hero:{},teleport(){}};
const api={unsafe:{data:{ENEMIES:{test:def},ENEMY_LIST:[def],REALMS:[{name:'炼气',stages:['初']}]},game:()=>game,onDraw(){}},file:()=>'',on(){},hook(){},ui:{button(){},hotkey(){}},world:{locations:()=>[]},data:{},log(){}};
setup(api);
const x=globalThis.__shahe, opt={team:'foe',realm:0,stage:0,count:1};
const [id]=x.spawn('test',10,20,opt); const original=x.S.objs.get(id);
x.edit(id,'atk',42); x.bringHere(id); x.remove(id); x.undo();
assert.equal(x.S.objs.get(id),original); assert.equal(original.e.gone,false); assert.ok(combat.enemies.includes(original.e));
x.undo(); assert.equal(original.e.x,10); assert.equal(original.e.y,20); x.undo(); assert.equal(original.e.atk,5); x.undo(); assert.equal(x.S.objs.has(id),false);
const [id2]=x.spawn('test',10,20,opt); const ob=x.S.objs.get(id2); x.clearAll(); x.undo(); assert.equal(x.S.objs.get(id2),ob); x.undo(); assert.equal(x.S.objs.has(id2),false);
const [id3]=x.spawn('test',10,20,opt); const first=x.S.objs.get(id3); x.edit(id3,'stage',0); x.undo(); assert.equal(x.S.objs.get(id3),first); x.undo(); assert.equal(x.S.objs.has(id3),false);
console.log('Real sandbox spawn/edit/move/remove/clear/realm undo paths passed');

