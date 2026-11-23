import './env';
import { outPng } from './outPng';
import assert from 'node:assert/strict';
import {createCanvas} from './env';
import {setCanvasFactory} from '../src/core/canvas';
import {caveInterior,CAVE_WIDTH,CAVE_HEIGHT,CAVE_SPOTS} from '../src/gfx/caveInterior';
import {readFileSync,writeFileSync} from 'node:fs';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
setCanvasFactory(()=>{throw Error('unavailable')});assert.equal(caveInterior(),null);setCanvasFactory((w,h)=>createCanvas(w,h) as any);const bg:any=caveInterior();assert.ok(bg);assert.equal(bg,caveInterior());assert.equal(bg.width,1600);assert.equal(bg.height,900);assert.equal(CAVE_WIDTH,1600);assert.equal(CAVE_HEIGHT,900);
assert.deepEqual(CAVE_SPOTS.map(s=>s.id),['exit','spring','seat','furnace','garden','bed']);for(const s of CAVE_SPOTS){assert.ok(s.x>=0&&s.x<CAVE_WIDTH&&s.y>=590&&s.y<=820);const p=bg.getContext('2d').getImageData(Math.max(0,s.x-15),s.y-200,30,30).data;assert.ok(p.some((v:number)=>v!==0),s.id)}
const ui=readFileSync('src/ui/CaveScene.tsx','utf8');assert.ok(ui.includes('CAVE_SPOTS'));assert.ok(ui.includes('const bg = caveInterior()'));assert.ok(!ui.includes('cave_interior.jpg'));for(const s of CAVE_SPOTS)assert.ok(ui.includes(`case '${s.id}':`),s.id);
const {default:React}=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');const {CaveScene}=await import('../src/ui/CaveScene');const game:any={ws:{home:{name:'洞府',plots:[]}},home:{placeMult:()=>1},hearts:{follower:()=>null},pets:{active:null}};const html=renderToStaticMarkup(React.createElement(CaveScene,{game,onClose(){}}));for(const label of ['药园','丹炉','蒲团','地图','洞府事务','出府'])assert.ok(html.includes(label),label);
outPng('cave-procedural-check.png', bg.toBuffer('image/png'));console.log('procedural cave: 1600×900, cache/retry, six shared spots, dispatch and SSR controls passed');
