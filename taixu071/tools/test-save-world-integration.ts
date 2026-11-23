import './env';import assert from 'node:assert/strict';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
const storage=new Map<string,string>();(globalThis as any).localStorage={getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)};
const {Game,SLOT_KEYS}=await import('../src/world/game');const {NpcWorld}=await import('../src/world/npc');const {newHero}=await import('../src/world/cultivation');const {newWorldState}=await import('../src/world/worldstate');const {validateSaveForLoad}=await import('../src/world/saveGuard');const {unzipSave}=await import('../src/world/savezip');const {MAP_IDS,WORLD_SCALE,ACTIVE_MAP}=await import('../src/data/world');
const npc=new NpcWorld({} as any);npc.newWorld();const world=newWorldState();
const fake:any={hero:newHero(),player:{x:100,y:200,flying:false},travel:{pending:null},fogs:{},explored:new Uint8Array(10),day:60,clock:1,cam:{targetZoom:1},nodes:{toSave:()=>[]},npcs:npc,ws:world,ui:{region:'天南'}};
assert.ok(npc.list.length>1000);assert.equal(Game.prototype.save.call(fake,1),true);const raw=storage.get(SLOT_KEYS[1])!,parsed=JSON.parse(unzipSave(raw));assert.equal(parsed.map,ACTIVE_MAP);assert.ok(parsed.npcs.length>1000);validateSaveForLoad(parsed,MAP_IDS,WORLD_SCALE);
const old=raw;fake.ws.flags.example={nested:NaN};const warn=console.warn;console.warn=()=>{};try{assert.equal(Game.prototype.save.call(fake,1),false)}finally{console.warn=warn}assert.equal(storage.get(SLOT_KEYS[1]),old);
console.log(`real world save: ${parsed.npcs.length} generated NPCs, normal serialization, preflight and old slot preservation passed`);
