import './env';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {createCanvas} from './env';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const {portraitFor}=await import('../src/data/portraits');
assert.equal(portraitFor({speaker:'某人',portrait:'./art/npc/old.webp'} as any),undefined);
assert.equal(portraitFor({speaker:'某人',portrait:'data:image/png;base64,AA=='} as any),'data:image/png;base64,AA==');
assert.equal(portraitFor({speaker:'无名散修'} as any),undefined);
const {CharacterPortrait}=await import('../src/ui/CharacterPortrait');const {HANLI_LOOK,CharState,drawCharacter,dressLook,DEFAULT_WARDROBE}=await import('../src/gfx/character');
assert.ok(renderToStaticMarkup(<CharacterPortrait look={HANLI_LOOK}/>).includes('<canvas'));
for(const look of [HANLI_LOOK,dressLook(HANLI_LOOK,{...DEFAULT_WARDROBE.f,outfit:'guangxiu',hairStyle:'long'})]){
 const cv=createCanvas(150,190),g:any=cv.getContext('2d'),S=5.2,st=new CharState(75,190*.3+86*S*look.height);st.yaw=st.targetYaw=Math.PI/4;st.setAction('idle');(st as any).blend=1;st.seed=3;
 for(let i=0;i<30;i++){st.update(1/60);g.clearRect(0,0,150,190);g.save();drawCharacter(g,look,st,S,1/60);g.restore()}
 const p=g.getImageData(0,0,150,190).data;let ink=0;for(let i=3;i<p.length;i+=4)if(p[i]>8)ink++;assert.ok(ink>100,'blank portrait');
}
for(const f of ['src/ui/Title.tsx','src/ui/CultPanels.tsx','src/ui/GameView.tsx'])assert.ok(!readFileSync(f,'utf8').includes('./art/'),f);
assert.ok(readFileSync('src/ui/Title.tsx','utf8').includes('title-landscape'));
console.log('procedural interface: mod portrait priority, no original portrait URLs, SSR and two character bust renders passed');
