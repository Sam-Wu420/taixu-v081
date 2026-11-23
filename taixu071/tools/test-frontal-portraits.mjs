import { createCanvas } from './env.ts';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {createHash} from 'node:crypto';
const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true,url:'https://game.example'}),w=dom.window;
globalThis.window=w;globalThis.document=w.document;Object.defineProperty(globalThis,'localStorage',{value:w.localStorage,configurable:true});Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
const canvases=new WeakMap();w.HTMLCanvasElement.prototype.getContext=function(){let cv=canvases.get(this);if(!cv){cv=createCanvas(this.width||300,this.height||150);canvases.set(this,cv);}let ctx=cv.getContext('2d');if(!ctx._adapter){const raw=ctx.drawImage.bind(ctx);ctx.drawImage=(img,...args)=>raw(img instanceof w.HTMLCanvasElement?canvases.get(img):img,...args);ctx._adapter=true;}return ctx;};
let pending=new Map(),seq=0;globalThis.requestAnimationFrame=w.requestAnimationFrame=f=>{pending.set(++seq,f);return seq;};globalThis.cancelAnimationFrame=w.cancelAnimationFrame=id=>pending.delete(id);
const React=await import('react'),{createRoot}=await import('react-dom/client'),{CharacterPortrait}=await import('../src/ui/CharacterPortrait.tsx'),{Bust}=await import('../src/ui/ModalLayer.tsx'),{CharState,drawCharacter,HANLI_LOOK}=await import('../src/gfx/character.ts');
const root=createRoot(document.getElementById('root'));await React.act(async()=>root.render(React.createElement(React.Fragment,null,React.createElement(CharacterPortrait,{look:HANLI_LOOK}),React.createElement(Bust,{look:HANLI_LOOK}))));
const canv=[...document.querySelectorAll('canvas')],[portrait,bust]=canv;assert.ok(portrait&&bust);
const raw=canvases.get(portrait).getContext('2d').getImageData(0,0,150,190).data;
const ref=createCanvas(150,190),g=ref.getContext('2d'),st=new CharState(75,190*.3+86*5.2*HANLI_LOOK.height);st.yaw=st.targetYaw=0;st.t=0;st.setAction('idle');st.blend=1;st.seed=3;
for(let i=0;i<30;i++){st.update(1/60);g.clearRect(0,0,150,190);g.save();drawCharacter(g,HANLI_LOOK,st,5.2,1/60,{portrait:true});g.restore();}
const digest=data=>createHash('sha256').update(data).digest('hex');assert.equal(digest(raw),digest(g.getImageData(0,0,150,190).data),'player UI draws exact front-facing portrait');
const jobs=[...pending.values()];pending.clear();for(const f of jobs)f(performance.now()+17);const image=canvases.get(bust).getContext('2d').getImageData(0,0,150,190).data;assert.ok(image.some((v,i)=>i%4===3&&v>0),'NPC bust draws actual pixels');
// The portrait option must suppress the idle head turn without changing the normal character pose.
const state=new CharState(75,500);state.seed=3;state.t=3.5;state.yaw=state.targetYaw=0;state.blend=1;
drawCharacter(g,HANLI_LOOK,state,1,0);const normal=state.last.headYaw;assert.notEqual(normal,0);
drawCharacter(g,HANLI_LOOK,state,1,0,{portrait:true});assert.ok(Math.abs(state.last.headYaw)<1e-9);
await React.act(async()=>root.unmount());assert.equal(pending.size,0);
console.log('front portraits: real player/NPC React Canvas, idle head correction and animation cleanup passed');
