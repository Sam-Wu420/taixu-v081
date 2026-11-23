import './env';
import assert from 'node:assert/strict';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const {YuanyingSys}=await import('../src/world/yuanying');
const {HuaxingAct}=await import('../src/world/huaxing');
const game:any={hero:{realm:4,hp:1},combat:{pStats:{hp:100},texts:[]}};
const y:any=new YuanyingSys(game);y.active=true;y.body={shield:.5,hitT:0,x:1,y:2};let broken=0;y.back=()=>{broken++;y.active=false};
for(const raw of [NaN,Infinity,-1,0]){y.hitBody(raw,4);assert.equal(y.body.shield,.5);assert.equal(game.hero.hp,1);assert.equal(broken,0)}
for(const r of [NaN,Infinity,1.2]){y.hitBody(10,r);assert.equal(y.body.shield,.5)}
game.combat.pStats.hp=1;y.hitBody(Number.MAX_VALUE,4);assert.equal(y.body.shield,.5);game.combat.pStats.hp=100;
y.hitBody(10,4);assert.ok(Math.abs(y.body.shield-.4)<1e-12);assert.equal(game.hero.hp,1);
y.hitBody(50,4);assert.equal(broken,1);assert.ok(Math.abs(game.hero.hp-.85)<1e-12);
y.active=true;y.body={shield:NaN,hitT:0,x:1,y:2};
y.hitBody(10,4);assert.ok(Number.isNaN(y.body.shield));assert.equal(broken,1);
const u:any=Object.create(HuaxingAct.prototype);Object.assign(u,{f:{id:'gui'},s:{color:'0,0,0'},ph:0,hp:1,ying:false,reflect:0,c:{fxq:[]},x:0,y:0});
for(const n of [NaN,Infinity,-1]){const before=u.hp;const result=u.absorb(n);assert.equal(result,0);assert.equal(u.hp,before);assert.equal(u.c.fxq.length,0)}
u.hp=-Number.MAX_VALUE;assert.equal(u.absorb(Number.MAX_VALUE),0);assert.equal(u.hp,-Number.MAX_VALUE);u.hp=1;
assert.ok(Math.abs(u.absorb(.5)-.15)<1e-12);assert.ok(Math.abs(u.hp-(1-.35/1.1))<1e-12);assert.equal(u.c.fxq.length,1);
const {LandmarkSys}=await import('../src/world/landmarks');const {SiteSys}=await import('../src/world/sites');
for(const [cls,name] of [[YuanyingSys,'ying'],[HuaxingAct,'spirit'],[LandmarkSys,'landmarks'],[SiteSys,'sites']] as any[]){
 const fake=Object.create(cls.prototype); for(const dt of [NaN,Infinity,-1])assert.doesNotThrow(()=>fake.update(dt),`${name}/${dt}`);
}
console.log('spirit safety: invalid damage/time, shield arithmetic, normal damage and break passed');
