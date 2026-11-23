// 角色界面头像：直接使用人物绘制核心，静态重绘避免 HUD 常驻动画占帧。
import { useEffect, useRef } from 'react';
import { CharState, drawCharacter, type Look } from '../gfx/character';
export function CharacterPortrait({look,label='角色外貌'}:{look:Look;label?:string}) {
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const cv=ref.current;if(!cv)return;const dpr=Math.min(2,Math.max(1,window.devicePixelRatio||1));
  cv.width=Math.round(150*dpr);cv.height=Math.round(190*dpr);const g=cv.getContext('2d');if(!g)return;
  const S=5.2*dpr,st=new CharState(cv.width/2,cv.height*.3+86*S*look.height);st.yaw=st.targetYaw=0;st.t=0;st.setAction('idle');(st as any).blend=1;st.seed=3;
  // 小步预热衣饰，使静态图与人物引擎的自然垂落一致；状态不与场景人物共享。
  for(let i=0;i<30;i++){st.update(1/60);g.clearRect(0,0,cv.width,cv.height);g.save();drawCharacter(g,look,st,S,1/60,{portrait:true});g.restore()}
 },[look]);
 return <canvas ref={ref} className="character-portrait-canvas" aria-label={label} role="img" />;
}
