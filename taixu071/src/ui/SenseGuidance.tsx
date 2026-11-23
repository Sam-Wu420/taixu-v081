import { setGuidanceFilter, clearGuidanceFilter } from '../world/guidanceFilter';
import { GUIDANCE_CATEGORIES, loadGuidanceSettings, saveGuidanceSettings, type GuidanceCategory } from './guidanceSettings';
import { useEffect, useRef } from 'react';
import type { Game } from '../world/game';
import { enemyGuidanceY } from '../world/combatfx';
import type { Enemy } from '../world/combat';
import type { Active } from '../world/npc';
import { guidanceMetadata, guidanceText, guidanceRealmSummary, guidanceLabelMetrics, guidanceDisplayLabel, presentGuidance, type PresentedGroup } from '../world/guidancePresentation';
import { guidancePendingReturn, guidanceTransition } from '../world/guidanceTransition';
import { guidanceTaskTargets } from '../world/guidanceTasks';
import { guidanceExtras } from '../world/guidanceExtras';
import { sameGuidanceActor, snapshotGuidanceExtras, snapshotGuidanceActors, guidanceExtraHeight, guidanceExtraIndex } from '../world/guidanceTracking';
import { enemyPerceptibility } from '../world/senseSignals';
import { guidanceAnchor, guidanceBearing, guidanceCandidates, guidanceDistance, guidancePosition, layoutGuidancePanels, guidanceCircleOverlap, type GuidanceActor, type GuidanceCandidate, type GuidanceLayoutObstacle } from '../world/senseGuidance';

const SVG_NS='http://www.w3.org/2000/svg';
function createArrowSvg(deg:number):SVGSVGElement {
  const icon=document.createElementNS(SVG_NS,'svg');
  icon.setAttribute('viewBox','0 0 16 16');icon.setAttribute('aria-hidden','true');
  icon.classList.add('sense-guidance-arrow-svg');icon.style.transform=`rotate(${deg.toFixed(1)}deg)`;
  const path=document.createElementNS(SVG_NS,'path');
  path.setAttribute('d','M3 8h9.5M8.5 4l4 4-4 4');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');
  path.setAttribute('stroke-width','1.9');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');
  icon.appendChild(path);return icon;
}
function setArrowIcon(host:HTMLElement,deg:number) {
  let icon=host.firstElementChild as SVGSVGElement|null;
  if(!icon||icon.tagName.toLowerCase()!=='svg'||!icon.classList.contains('sense-guidance-arrow-svg')){host.textContent='';icon=createArrowSvg(deg);host.appendChild(icon);}
  else icon.style.transform=`rotate(${deg.toFixed(1)}deg)`;
}
function setInlineArrowText(host:HTMLElement,deg:number|null,text:string) {
  let arrow=host.firstElementChild as HTMLSpanElement|null;
  let label=arrow?.nextElementSibling as HTMLSpanElement|null;
  if(!arrow||!label||!arrow.classList.contains('sense-list-arrow')){
    host.textContent='';
    arrow=document.createElement('span');arrow.className='sense-list-arrow';arrow.setAttribute('aria-hidden','true');
    label=document.createElement('span');label.className='sense-list-text';
    host.append(arrow,label);
  }
  if(deg===null){arrow.style.display='none';arrow.textContent='';}
  else {arrow.style.display='';setArrowIcon(arrow,deg);}
  if(label.textContent!==text)label.textContent=text;
}

/** Direction arrows stay on the true ray; each adjacent label is directly actionable. */
export function SenseGuidance({game}:{game:Game}) {
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const layer=root.current!;
    type Entry={
      key:string;id:number;group:PresentedGroup;arrow:HTMLButtonElement;label:HTMLButtonElement;line:SVGLineElement;
      lx:number|null;ly:number|null;
      hidden:boolean;labelHidden:boolean;lineHidden:boolean;retiring:boolean;
      hostile:boolean|null;important:boolean|null;lineHostile:boolean|null;
      ax:number;ay:number;lastDeg:number|null;
      lastW:number;lastH:number;lastTx:number;lastTy:number;
      x1:number;y1:number;x2:number;y2:number;
      lastTextAt:number;cachedText:string;cachedAria:string;cachedWidth:number;cachedHeight:number;dirty:boolean;
    };
    type Focus={ref:GuidanceActor;kind:string;important:boolean;labelText:string;hostile:boolean;person:Active['d']|null;el:HTMLButtonElement;glyph:HTMLSpanElement;label:HTMLSpanElement;pendingSince:number|null;x:number;y:number;group:GuidanceActor[]|null;groupIndex:Map<object,Set<string>>|null;groupActors:Set<object>;groupPeople:Map<GuidanceActor,Active['d']>;groupPending:Map<GuidanceActor,number>;markers:Map<GuidanceActor,{el:HTMLButtonElement}>};
    let entries:Entry[]=[],retiring:{entry:Entry;until:number}[]=[],focused:Focus|null=null,raf=0,lastScan=-Infinity,lastLayout=-Infinity,lastText=-Infinity,lastPinned=-Infinity,lastPinnedN=-1,layoutKey='',lastVisKey='',nextId=1,viewW=0,viewH=0,lastFrame:number|null=null;
    const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const textMeasure=document.createElement('canvas').getContext('2d');
    if(textMeasure)textMeasure.font='12px sans-serif';
    const widthCache=new Map<string,number>();
    const textWidth=(text:string)=>{let width=widthCache.get(text);if(width===undefined){width=textMeasure?.measureText(text).width??text.length*12;if(widthCache.size>=512)widthCache.delete(widthCache.keys().next().value!);widthCache.set(text,width);}return width;};
    let activeNpcs=new Set<object>(),activeEnemies=new Set(game.combat.enemies),taskTargets=new Set<object>(),obstacles:GuidanceLayoutObstacle[]=[];
    let placements:ReturnType<typeof layoutGuidancePanels>=[];
    const ids=new Map<string,number>();
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('sense-guidance-lines');svg.setAttribute('aria-hidden','true');layer.appendChild(svg);
    const same=sameGuidanceActor;
    const isFocused=(ref:GuidanceActor)=>!!focused&&(focused.group?(ref.type==='extra'?!!focused.groupIndex?.get(ref.actor.scope)?.has(ref.actor.key):focused.groupActors.has(ref.actor)):same(focused.ref,ref));
    const position=(ref:GuidanceActor)=>{
      if(ref.type==='enemy'){const npcId=(ref.actor as Enemy).npcId;const person=npcId?game.npcs.byId.get(npcId):undefined;if(person&&(!person.alive||person.hidden))return null;}
      return guidancePosition(ref,activeEnemies,activeNpcs,game.player.x,game.player.y,game.awarenessRadius,game.senseBurstT>0);
    };
    const removeFocus=()=>{if(focused){focused.el.remove();for(const m of focused.markers.values())m.el.remove();}focused=null;lastPinnedN=-1;};
    const clearEntry=(e:Entry)=>{e.arrow.remove();e.label.remove();e.line.remove();};
    const clearEntries=()=>{entries.forEach(clearEntry);retiring.forEach(r=>clearEntry(r.entry));entries=[];retiring=[];ids.clear();};
    const draw=(el:HTMLElement,x:number,y:number)=>{el.style.left=`${x}px`;el.style.top=`${y}px`;el.style.display='';};
    const select=(c:GuidanceCandidate,source:PresentedGroup)=>{
      if(!position(c.ref))return;
      removeFocus();
      const el=document.createElement('button');el.type='button';el.className='sense-guidance-mark selected'+(c.hostile?' hostile':'');
      const glyph=document.createElement('span');glyph.className='sense-guidance-focus-glyph';glyph.setAttribute('aria-hidden','true');
      const label=document.createElement('span');label.className='sense-guidance-label';el.append(glyph,label);
      el.addEventListener('pointerdown',e=>e.stopPropagation());el.addEventListener('click',e=>{e.stopPropagation();removeFocus();lastScan=-Infinity;});layer.appendChild(el);
      const meta=guidanceMetadata(c,game.npcs.byId,taskTargets);
      const person=c.ref.type==='npc'?(c.ref.actor as Active).d:c.ref.type==='enemy'&&(c.ref.actor as Enemy).npcId?game.npcs.byId.get((c.ref.actor as Enemy).npcId!)??null:null;
      const group=c.ref.type==='extra'?snapshotGuidanceExtras(source.members,position,game.detailSenseRadius):!meta.important&&source.members.length>1?snapshotGuidanceActors(source.members,position,game.detailSenseRadius):null;
      const groupPeople=new Map<GuidanceActor,Active['d']>();
      for(const ref of group??[]){const p=ref.type==='npc'?(ref.actor as Active).d:ref.type==='enemy'&&(ref.actor as Enemy).npcId?game.npcs.byId.get((ref.actor as Enemy).npcId!):undefined;if(p)groupPeople.set(ref,p);}
      const realm=guidanceRealmSummary(group?source.members:[c]);
      focused={ref:c.ref,kind:c.kind,important:meta.important,labelText:guidanceDisplayLabel(meta.label)+(realm?` · ${realm}`:''),hostile:c.hostile,person:group?null:person,el,glyph,label,pendingSince:null,x:0,y:0,group,groupIndex:group?guidanceExtraIndex(group):null,groupActors:new Set(group?.filter(r=>r.type!=='extra').map(r=>r.actor)),groupPeople,groupPending:new Map(),markers:new Map()};
      lastScan=-Infinity;lastText=-Infinity;lastPinned=-Infinity;lastPinnedN=-1;
    };
    const makeEntry=(group:PresentedGroup):Entry=>{
      let id=ids.get(group.key);if(!id){id=nextId++;ids.set(group.key,id);}
      const arrow=document.createElement('button');arrow.type='button';arrow.className='sense-guidance-mark direction';
      const label=document.createElement('button');label.type='button';label.className='sense-guidance-tag';
      const line=document.createElementNS('http://www.w3.org/2000/svg','line');svg.appendChild(line);layer.append(arrow,label);
      const entry:Entry={
        key:group.key,id,group,arrow,label,line,lx:null,ly:null,
        hidden:false,labelHidden:false,lineHidden:false,retiring:false,
        hostile:null,important:null,lineHostile:null,
        ax:NaN,ay:NaN,lastDeg:null,
        lastW:-1,lastH:-1,lastTx:NaN,lastTy:NaN,
        x1:NaN,y1:NaN,x2:NaN,y2:NaN,
        lastTextAt:-Infinity,cachedText:'',cachedAria:'',cachedWidth:0,cachedHeight:0,dirty:true,
      };
      for(const el of [arrow,label]){
        el.addEventListener('pointerdown',e=>e.stopPropagation());
        el.addEventListener('click',e=>{e.stopPropagation();const candidate=entry.group.members.find(c=>{const q=position(c.ref);return !!q&&q.distance>game.detailSenseRadius&&!isFocused(c.ref);});if(candidate)select(candidate,entry.group);});
      }
      return entry;
    };
    const host=layer.closest('.game-root')?.querySelector<HTMLElement>('.sense-list-host');
    const settings=loadGuidanceSettings(!!layer.closest('.game-root')?.classList.contains('touch'));
    let allGroups:PresentedGroup[]=[],category:GuidanceCategory=settings.category,showAll=settings.showAll,collapsed=settings.collapsed;
    const saveSettings=()=>saveGuidanceSettings({category,showAll,collapsed});
    const selectedForWorld=(type:'enemy'|'npc'|'node',actor:object)=>{
      if(type==='node'){
        const n=actor as {x:number;y:number},key=`node:${n.x}:${n.y}`;
        return !!focused&&(focused.group?!!focused.groupIndex?.get(game.nodes)?.has(key):focused.ref.type==='extra'&&focused.ref.actor.scope===game.nodes&&focused.ref.actor.key===key);
      }
      return type==='enemy'?isFocused({type:'enemy',actor:actor as Enemy}):isFocused({type:'npc',actor:actor as Active});
    };
    setGuidanceFilter(game,category,selectedForWorld);
    const updateWorldFilter=()=>{setGuidanceFilter(game,category,selectedForWorld);game.renderer?.resetStill();};
    const rows=new Map<string,{el:HTMLButtonElement;group:PresentedGroup;staleAt:number|null;text:string}>();
    let panel:HTMLElement|null=null, list:HTMLElement|null=null, empty:HTMLElement|null=null, pinned:HTMLButtonElement|null=null, modeButton:HTMLButtonElement|null=null, toggle:HTMLButtonElement|null=null;
    const tabs=new Map<string,HTMLButtonElement>();
    const categoryOf=(g:PresentedGroup)=>g.kind==='妖物气息'?'妖兽':g.kind==='修士气息'||g.kind==='人影气息'?'修士':g.kind==='灵物气息'?'灵物':'机缘';
    if(host){
      panel=document.createElement('section');panel.className='sense-list';panel.setAttribute('aria-label','神识信息');
      const header=document.createElement('div');header.className='sense-list-head';
      toggle=document.createElement('button');toggle.type='button';toggle.className='sense-list-toggle';toggle.textContent=collapsed?'神识信息 ▸':'神识信息 ▾';toggle.setAttribute('aria-expanded',String(!collapsed));
      modeButton=document.createElement('button');modeButton.type='button';modeButton.className='sense-list-mode';
      const setMode=()=>{modeButton!.textContent=showAll?'全部':'仅高亮';modeButton!.setAttribute('aria-label',showAll?'圈边显示全部，点击切换为仅高亮':'圈边仅显示高亮，点击切换为全部');};setMode();
      modeButton.addEventListener('click',()=>{showAll=!showAll;setMode();saveSettings();retiring.forEach(r=>clearEntry(r.entry));retiring=[];lastLayout=-Infinity;});
      const content=document.createElement('div');content.className='sense-list-content';content.hidden=collapsed;
      toggle.addEventListener('click',()=>{collapsed=!collapsed;content.hidden=collapsed;toggle!.textContent=collapsed?'神识信息 ▸':'神识信息 ▾';toggle!.setAttribute('aria-expanded',String(!collapsed));saveSettings();});
      header.append(toggle,modeButton);const tabBar=document.createElement('div');tabBar.className='sense-list-tabs';tabBar.setAttribute('aria-label','信息分类');
      for(const name of GUIDANCE_CATEGORIES){const button=document.createElement('button');button.type='button';button.textContent=name;button.setAttribute('aria-pressed',String(name===category));button.addEventListener('click',()=>{category=name;rows.forEach(r=>r.el.remove());rows.clear();saveSettings();updateWorldFilter();for(const [key,tab] of tabs)tab.setAttribute('aria-pressed',String(key===category));retiring.forEach(r=>clearEntry(r.entry));retiring=[];lastScan=-Infinity;lastLayout=-Infinity;});tabs.set(name,button);tabBar.appendChild(button);}
      list=document.createElement('div');list.className='sense-list-rows';list.setAttribute('aria-label','可感知目标');
      pinned=document.createElement('button');pinned.type='button';pinned.className='sense-list-pinned';pinned.hidden=true;pinned.setAttribute('aria-label','取消当前关注');pinned.addEventListener('click',()=>{removeFocus();pinned!.hidden=true;lastScan=-Infinity;});
      empty=document.createElement('div');empty.className='sense-list-empty';empty.textContent='暂无可感知信息';
      content.append(pinned,tabBar,list,empty);panel.append(header,content);host.append(panel);
      panel.addEventListener('pointerdown',e=>e.stopPropagation());panel.addEventListener('click',e=>e.stopPropagation());
    }
    const refreshList=()=>{
      if(!list)return;
      const unselected=allGroups.flatMap(g=>g.members.filter(c=>!isFocused(c.ref)));
      const desired=presentGuidance(unselected,game.player.x,game.player.y,game.npcs.byId,taskTargets).filter(g=>category==='全部'||categoryOf(g)===category),keys=new Set(desired.map(g=>g.key));
      const now=performance.now(),lingerMs=1050;let index=0;
      // 飞遁时神识目标会很快掠过感知边缘：留一小段「余韵」淡出，避免右侧名单每半秒整块换血。
      for(const [key,row] of rows)if(!keys.has(key)){
        // 只是扇区 / 聚合键变了、成员仍在新组里时直接复用新组，不制造重复的「余韵」行。
        if(desired.some(g=>g.members.some(c=>row.group.members.some(old=>same(old.ref,c.ref))))){row.el.remove();rows.delete(key);continue;}
        if(row.group.members.some(c=>isFocused(c.ref))){row.el.remove();rows.delete(key);continue;}
        if(row.staleAt===null)row.staleAt=now;
        const age=now-row.staleAt;
        if(age>=lingerMs){row.el.remove();rows.delete(key);continue;}
        row.el.style.display='';row.el.disabled=true;row.el.classList.add('stale');setInlineArrowText(row.el,null,`${row.text} · 余韵`);
        row.el.style.opacity=String(Math.max(0,1-age/lingerMs));index++;
      }
      for(const group of desired){
        let row=rows.get(group.key);
        if(!row){const el=document.createElement('button');el.type='button';el.className='sense-list-row';el.style.transition='opacity .2s ease';row={el,group,staleAt:null,text:''};rows.set(group.key,row);const current=row;
          el.addEventListener('click',()=>{const c=current.group.members.find(c=>{const q=position(c.ref);return !!q&&q.distance>game.detailSenseRadius;});if(!c)return;if(isFocused(c.ref)){removeFocus();lastScan=-Infinity;}else select(c,current.group);});}
        row.group=group;
        const valid=group.members.map(c=>({c,q:position(c.ref)})).filter(v=>v.q&&v.q.distance>game.detailSenseRadius);
        if(!valid.length){
          if(!row.text){row.el.remove();rows.delete(group.key);continue;}
          if(row.staleAt===null)row.staleAt=now;
          const age=now-row.staleAt;
          if(age>=lingerMs){row.el.remove();rows.delete(group.key);continue;}
          row.el.style.display='';row.el.disabled=true;row.el.classList.add('stale');setInlineArrowText(row.el,null,`${row.text} · 余韵`);row.el.style.opacity=String(Math.max(0,1-age/lingerMs));
          index++;continue;
        }
        row.staleAt=null;row.el.disabled=false;row.el.classList.remove('stale');row.el.style.opacity='1';
        row.el.style.display='';const bearing=guidanceBearing(valid[0].q!.x,valid[0].q!.y,game.player.x,game.player.y);
        row.text=guidanceText(group,valid.map(v=>v.q!.distance),valid.map(v=>v.c));setInlineArrowText(row.el,bearing.sector*45,row.text);
        row.el.classList.toggle('selected',valid.some(v=>isFocused(v.c.ref)));row.el.setAttribute('aria-pressed',String(valid.some(v=>isFocused(v.c.ref))));
        const at=list.children.item(index++);if(at!==row.el)list.insertBefore(row.el,at);
      }
      if(empty)empty.hidden=index>0;
    };
    const readObstacles=()=>{
      const host=layer.closest('.game-root'),base=layer.getBoundingClientRect();obstacles=[];if(!host)return;
      for(const el of host.querySelectorAll<HTMLElement>('.char-card,.top-right,.quest-tracker,.sect-tracker,.tracker-col,.action-bar,.hotbar,.joystick,.touch-side,.loc-card,.boss-hud,.sect-battle-hud,.pursuit,.perf-hud,.realm-hud,.mod-hud')){
        const r=el.getBoundingClientRect();if(r.width>0&&r.height>0)obstacles.push({x:r.left-base.left-7,y:r.top-base.top-7,width:r.width+14,height:r.height+14});
      }
    };
    const scan=(now:number)=>{
      readObstacles();taskTargets=guidanceTaskTargets(game);const p=game.player;
      const candidates=guidanceCandidates(game.combat.enemies,game.npcs.active.values(),p.x,p.y,game.detailSenseRadius,game.awarenessRadius,game.senseBurstT>0,guidanceExtras(game)).filter(c=>!!position(c.ref));
      allGroups=presentGuidance(candidates,p.x,p.y,game.npcs.byId,taskTargets);refreshList();
      const groups=presentGuidance(candidates.filter(c=>!isFocused(c.ref)),p.x,p.y,game.npcs.byId,taskTargets),old=new Map(entries.map(e=>[e.key,e]));
      const currentKeys=new Set(groups.map(group=>group.key));
      entries=groups.map(group=>{
        let e=old.get(group.key);if(e)old.delete(group.key);
        // A sector boundary can change the grouping key although the target did not disappear.
        // Reuse that group's DOM/position when there is a real shared member, not just a similar label.
        if(!e){
          for(const [key,previous] of old){
            if(currentKeys.has(key))continue;
            if(previous.group.important!==group.important||previous.group.kind!==group.kind||previous.group.hostile!==group.hostile)continue;
            if(!group.members.some(c=>previous.group.members.some(p=>same(c.ref,p.ref))))continue;
            old.delete(key);ids.delete(key);ids.set(group.key,previous.id);previous.key=group.key;e=previous;break;
          }
        }
        if(!e)e=makeEntry(group);
        else e.dirty=true;
        e.group=group;return e;
      });
      for(const e of old.values()){
        // Only a still-perceptible target crossing into the inner circle may fade.
        // Lost/hidden targets and selected groups disappear immediately.
        const safe=e.group.members.some(c=>{const q=position(c.ref);return !!q&&q.distance<=game.detailSenseRadius&&!isFocused(c.ref);});
        if(safe){e.retiring=true;for(const el of [e.arrow,e.label,e.line]){el.classList.add('guidance-retiring');el.setAttribute('aria-hidden','true');}retiring.push({entry:e,until:now+180});}
        else clearEntry(e);
        ids.delete(e.key);
      }
    };
    const step=(now:number)=>{
      if(game.inCave||game.mijing.active||game.hero.dead||game.tianxiang.active||game.cinemaHideHud){clearEntries();removeFocus();if(panel)panel.style.display='none';if(pinned)pinned.hidden=true;allGroups=[];rows.forEach(r=>r.el.remove());rows.clear();lastScan=-Infinity;return;}
      if(panel)panel.style.display='';
      const dt=lastFrame===null?0:Math.max(0,Math.min(0.1,(now-lastFrame)/1000));lastFrame=now;
      const rc=game.renderer?.renderCam;
      const p=game.player,cam=rc&&rc.zoom>0?rc:game.cam,w=layer.clientWidth,h=layer.clientHeight;
      activeNpcs=new Set(game.npcs.active.values());activeEnemies=new Set(game.combat.enemies);
      let awaitingReturn=false;
      if(focused?.person){
        const f=focused;
        if(game.npcs.byId.get(f.person.id)!==f.person||!f.person.alive||f.person.hidden){removeFocus();lastScan=-Infinity;}
        else if(!position(f.ref)){
          const next=guidanceTransition(f.ref,f.person,game.npcs.active,activeEnemies,p.x,p.y,game.awarenessRadius,game.senseBurstT>0);
          if(next){f.ref=next;f.pendingSince=null;f.el.classList.remove('arriving');f.hostile=next.type==='enemy'&&!!next.actor.aggro;f.el.classList.toggle('hostile',f.hostile);lastScan=-Infinity;lastText=-Infinity;}
          else if(guidancePendingReturn(f.ref,f.person,game.npcs.active,p.x,p.y,game.awarenessRadius,game.senseBurstT>0)) {
            if(f.pendingSince===null||game.halted)f.pendingSince=now;
            awaitingReturn=now-f.pendingSince<2500;
          }
        }
      }
      const scanEvery=p.flying?(p.boosting?850:650):500;
      if(now-lastScan>=scanEvery){lastScan=now;scan(now);}
      for(const [key,row] of rows)if(row.staleAt!==null){const age=now-row.staleAt;if(age>=1050){row.el.remove();rows.delete(key);}else row.el.style.opacity=String(Math.max(0,1-age/1050));}
      if(empty&&rows.size===0)empty.hidden=false;
      retiring=retiring.filter(r=>{
        const safe=r.entry.group.members.some(c=>{const q=position(c.ref);return !!q&&q.distance<=game.detailSenseRadius&&!isFocused(c.ref);});
        if(now>=r.until||!safe||entries.some(e=>e.key===r.entry.key)){clearEntry(r.entry);return false;}return true;
      });
      if(viewW!==w||viewH!==h){viewW=w;viewH=h;svg.setAttribute('viewBox',`0 0 ${w} ${h}`);}
      const circle={x:w/2+(p.x-cam.x)*cam.zoom,y:h/2+(p.y-cam.y)*cam.zoom,radius:game.detailSenseRadius*cam.zoom+4};
      const positionFocusLabel=(f:Focus,a:{x:number;y:number})=>{
        const box=guidanceLabelMetrics(textWidth(f.label.textContent??''),w);
        const place=layoutGuidancePanels([{sector:0,x:a.x,y:a.y,rows:1,width:box.width,height:box.height}],w,h,{top:12,bottom:12,left:12,right:12,rowHeight:28,maxRows:1,obstacles,circle})[0];
        if(!place)return;
        f.label.style.left=`${place.x-a.x+14}px`;f.label.style.right='auto';f.label.style.top=`${place.y-a.y+14}px`;f.label.style.transform='none';f.label.style.width=`${Math.max(1,place.width-16)}px`;
      };
      const anchor=(q:{x:number;y:number})=>guidanceAnchor(p.x,p.y,q.x,q.y,game.detailSenseRadius,cam.x,cam.y,cam.zoom,w,h,26);
      const hideEntry=(entry:Entry)=>{
        if(!entry.hidden){entry.arrow.style.display='none';entry.hidden=true;entry.ax=NaN;entry.ay=NaN;}
        if(!entry.labelHidden){entry.label.style.display='none';entry.labelHidden=true;}
        if(!entry.lineHidden){entry.line.style.display='none';entry.lineHidden=true;}
      };
      const visible:{entry:Entry;anchor:{x:number;y:number};candidate:GuidanceCandidate;q:{x:number;y:number;distance:number};box:{width:number;height:number}}[]=[];
      for(const entry of entries){
        if(!showAll||(category!=='全部'&&categoryOf(entry.group)!==category)){hideEntry(entry);continue;}
        let first:GuidanceCandidate|null=null, firstQ:{x:number;y:number;distance:number}|null=null;
        let crossing=false;
        const members=entry.group.members;
        const needText=entry.dirty||now-entry.lastTextAt>=120;
        const validDistances:number[]=needText?[]:[];
        const validCandidates:GuidanceCandidate[]=needText?[]:[];
        for(let i=0;i<members.length;i++){
          const c=members[i];
          if(isFocused(c.ref))continue;
          const q=position(c.ref);
          if(!q)continue;
          if(q.distance<=game.detailSenseRadius){crossing=true;continue;}
          if(!first){first=c;firstQ=q;}
          if(needText){validDistances.push(q.distance);validCandidates.push(c);}
        }
        const a=firstQ&&anchor(firstQ);
        if(!first||!firstQ||!a){
          if(crossing){
            if(!entry.retiring){
              entry.retiring=true;
              for(const el of [entry.arrow,entry.label,entry.line]){el.classList.add('guidance-retiring');el.setAttribute('aria-hidden','true');}
            }
          } else hideEntry(entry);
          continue;
        }
        if(entry.retiring){
          entry.retiring=false;
          for(const el of [entry.arrow,entry.label,entry.line]){el.classList.remove('guidance-retiring');el.removeAttribute('aria-hidden');}
        }
        if(needText||entry.cachedWidth<=0){
          const text=guidanceText(entry.group,validDistances,validCandidates);
          const box=guidanceLabelMetrics(textWidth(text),w);
          entry.cachedText=text;entry.cachedWidth=box.width;entry.cachedHeight=box.height;
          entry.lastTextAt=now;entry.dirty=false;
          if(entry.label.textContent!==text)entry.label.textContent=text;
          const aria=`${text}，点击关注`;
          if(entry.cachedAria!==aria){entry.cachedAria=aria;entry.arrow.setAttribute('aria-label',aria);entry.label.setAttribute('aria-label',aria);}
        }
        const deg=Math.atan2(firstQ.y-p.y,firstQ.x-p.x)*180/Math.PI;
        if(entry.lastDeg===null||Math.abs(deg-entry.lastDeg)>=0.25){entry.lastDeg=deg;setArrowIcon(entry.arrow,deg);}
        if(entry.hostile!==entry.group.hostile){entry.hostile=entry.group.hostile;entry.arrow.classList.toggle('hostile',entry.group.hostile);entry.label.classList.toggle('hostile',entry.group.hostile);}
        if(entry.important!==entry.group.important){entry.important=entry.group.important;entry.label.classList.toggle('important',entry.group.important);}
        if(entry.hidden||Math.abs(a.x-entry.ax)>=0.25||Math.abs(a.y-entry.ay)>=0.25){entry.hidden=false;entry.ax=a.x;entry.ay=a.y;draw(entry.arrow,a.x,a.y);}
        visible.push({entry,anchor:a,candidate:first,q:firstQ,box:{width:entry.cachedWidth,height:entry.cachedHeight}});
      }
      const visKey=`${w}|${h}|${visible.map(v=>`${v.entry.id}:${v.entry.group.priority}:${v.box.width}:${v.box.height}`).join(',')}`;
      const nextKey=`${visKey}|${Math.round(circle.x/16)}|${Math.round(circle.y/16)}|${Math.round(circle.radius/16)}`;
      const byIdPrev=placements.length?new Map(placements.map(pl=>[pl.sector,pl])):null;
      const circleIntrudes=!!byIdPrev&&now-lastLayout>=60&&visible.some(v=>{
        const pl=byIdPrev.get(v.entry.id);
        return !!pl&&guidanceCircleOverlap({x:v.entry.lx??pl.x,y:v.entry.ly??pl.y,width:pl.width,height:pl.height},circle)>2;
      });
      if(visKey!==lastVisKey||circleIntrudes||(nextKey!==layoutKey&&now-lastLayout>=90)||now-lastLayout>=250){
        lastVisKey=visKey;layoutKey=nextKey;lastLayout=now;
        placements=layoutGuidancePanels(visible.map(v=>({sector:v.entry.id,x:v.anchor.x,y:v.anchor.y,rows:1,priority:v.entry.group.priority,width:v.box.width,height:v.box.height})),w,h,{top:12,bottom:12,left:12,right:12,rowHeight:28,maxRows:1,panelWidth:Math.max(130,Math.min(215,w*.5)),obstacles,circle});
      }
      const byId=new Map(placements.map(pl=>[pl.sector,pl]));
      for(const v of visible){const place=byId.get(v.entry.id);
        if(!place){
          if(!v.entry.labelHidden){v.entry.label.style.display='none';v.entry.labelHidden=true;}
          if(!v.entry.lineHidden){v.entry.line.style.display='none';v.entry.lineHidden=true;}
          continue;
        }
        const e=v.entry, blend=reducedMotion?.matches?1:1-Math.exp(-dt/0.13);
        // Smooth only the layout displacement; the direction arrow remains world-anchored.
        if(e.lx===null||e.ly===null){e.lx=place.x;e.ly=place.y;}
        else if(Math.abs(place.x-e.lx)<0.25&&Math.abs(place.y-e.ly)<0.25){e.lx=place.x;e.ly=place.y;}
        else {e.lx+=(place.x-e.lx)*blend;e.ly+=(place.y-e.ly)*blend;}
        if(guidanceCircleOverlap({x:e.lx,y:e.ly,width:place.width,height:place.height},circle)>0 && guidanceCircleOverlap(place,circle)===0){e.lx=place.x;e.ly=place.y;}
        if(e.lastW!==place.width){e.lastW=place.width;e.label.style.width=`${place.width}px`;}
        if(e.lastH!==place.height){e.lastH=place.height;e.label.style.height=`${place.height}px`;}
        const tx=Math.round(e.lx*4)/4,ty=Math.round(e.ly*4)/4;
        if(tx!==e.lastTx||ty!==e.lastTy){e.lastTx=tx;e.lastTy=ty;e.label.style.transform=`translate3d(${e.lx}px,${e.ly}px,0)`;}
        if(e.labelHidden){e.labelHidden=false;e.label.style.display='';}
        if(e.lineHidden){e.lineHidden=false;e.line.style.display='';}
        if(e.lineHostile!==v.candidate.hostile){e.lineHostile=v.candidate.hostile;e.line.classList.toggle('hostile',v.candidate.hostile);}
        const x1=Math.round(v.anchor.x*2)/2,y1=Math.round(v.anchor.y*2)/2;
        const x2=Math.round(Math.max(e.lx,Math.min(e.lx+place.width,v.anchor.x))*2)/2;
        const y2=Math.round(Math.max(e.ly,Math.min(e.ly+place.height,v.anchor.y))*2)/2;
        if(x1!==e.x1){e.x1=x1;e.line.setAttribute('x1',String(v.anchor.x));}
        if(y1!==e.y1){e.y1=y1;e.line.setAttribute('y1',String(v.anchor.y));}
        if(x2!==e.x2){e.x2=x2;e.line.setAttribute('x2',String(x2));}
        if(y2!==e.y2){e.y2=y2;e.line.setAttribute('y2',String(y2));}
      }
      if(focused?.group){
        const f=focused,valid:{ref:GuidanceActor;position:{x:number;y:number;distance:number}}[]=[],keep:GuidanceActor[]=[];
        for(const original of f.group){
          let ref=original,q=position(ref);const person=f.groupPeople.get(ref);
          if(person){
            if(game.npcs.byId.get(person.id)!==person||!person.alive||person.hidden)continue;
            if(!q){
              const next=guidanceTransition(ref,person,game.npcs.active,activeEnemies,p.x,p.y,game.awarenessRadius,game.senseBurstT>0);
              if(next){f.groupPeople.delete(ref);f.groupPending.delete(ref);ref=next;f.groupPeople.set(ref,person);q=position(ref);}
              else if(guidancePendingReturn(ref,person,game.npcs.active,p.x,p.y,game.awarenessRadius,game.senseBurstT>0)){
                let since=f.groupPending.get(ref);if(since===undefined||game.halted){since=now;f.groupPending.set(ref,since);}
                if(now-since<2500){keep.push(ref);continue;}
              }
            }
          }
          if(q){keep.push(ref);valid.push({ref,position:q});f.groupPending.delete(ref);}
        }
        const live=new Set(valid.map(v=>v.ref)),retained=new Set(keep);
        for(const ref of f.groupPeople.keys())if(!retained.has(ref))f.groupPeople.delete(ref);
        for(const ref of f.groupPending.keys())if(!retained.has(ref))f.groupPending.delete(ref);
        for(const [ref,marker] of f.markers)if(!live.has(ref)){marker.el.remove();f.markers.delete(ref);}
        if(keep.length!==f.group.length||keep.some((ref,i)=>ref!==f.group![i])){f.group=keep;f.groupIndex=guidanceExtraIndex(keep);f.groupActors=new Set(keep.filter(r=>r.type!=='extra').map(r=>r.actor));lastScan=-Infinity;}
        if(!keep.length){removeFocus();lastScan=-Infinity;}
        else if(!valid.length)f.el.style.display='none';
        else {
          const outside=valid.filter(v=>v.position.distance>game.detailSenseRadius).sort((a,b)=>a.position.distance-b.position.distance);
          if(outside.length){
            const target=outside[0],q=target.position,a=anchor(q),b=guidanceBearing(q.x,q.y,p.x,p.y);
            f.ref=target.ref;setArrowIcon(f.glyph,Math.atan2(q.y-p.y,q.x-p.x)*180/Math.PI);f.label.textContent=`${f.labelText}${valid.length>1?` ${valid.length}道`:''} · ${b.direction} · ${guidanceDistance(q.distance)}`;
            f.el.setAttribute('aria-label',`${f.label.textContent}，点击取消关注`);f.el.classList.remove('arriving');f.el.style.opacity='1';
            if(a){draw(f.el,a.x,a.y);f.x=a.x;f.y=a.y;f.el.classList.toggle('label-left',a.x>w/2);positionFocusLabel(f,a);}else f.el.style.display='none';
          }else f.el.style.display='none';
          for(const v of valid){
            const q=v.position,seen=v.ref.type==='enemy'?enemyPerceptibility(v.ref.actor,p.x,p.y,game.detailSenseRadius,game.senseBurstT>0)>.05:game.life.vis({x:q.x,y:q.y})>.01;
            const inside=q.distance<=game.detailSenseRadius&&seen;
            const outsideCircle=q.distance>game.detailSenseRadius;
            let marker=f.markers.get(v.ref);
            // The main selected marker represents the nearest outside member; each
            // other member gets its own direction on the circle, not its world position.
            if(!inside&&(!outsideCircle||v.ref===outside[0]?.ref)) {if(marker){marker.el.remove();f.markers.delete(v.ref);}continue;}
            if(!marker){
              const el=document.createElement('button');el.type='button';el.setAttribute('aria-label',`${f.labelText}，点击取消整组关注`);
              el.addEventListener('pointerdown',e=>e.stopPropagation());el.addEventListener('click',e=>{e.stopPropagation();removeFocus();lastScan=-Infinity;});layer.appendChild(el);
              marker={el};f.markers.set(v.ref,marker);
            }
            if(outsideCircle){
              const a=anchor(q);marker.el.className='sense-guidance-member';setArrowIcon(marker.el,Math.atan2(q.y-p.y,q.x-p.x)*180/Math.PI);
              if(a)draw(marker.el,a.x,a.y);else marker.el.style.display='none';
              continue;
            }
            marker.el.className='sense-guidance-arrived';marker.el.textContent='▼';
            const targetY=v.ref.type==='enemy'?enemyGuidanceY(game.combat,v.ref.actor as Enemy,cam.zoom):v.ref.type==='npc'?q.y-150*((v.ref.actor as Active).d.beauty?1.06:1)-((v.ref.actor as Active).st.lift||0):q.y-guidanceExtraHeight(v.ref);
            const tx=w/2+(q.x-cam.x)*cam.zoom,ty=h/2+(targetY-cam.y)*cam.zoom;
            if(tx < -30||tx>w+30||ty < -30||ty>h+30){marker.el.style.display='none';continue;}
            // Current camera projection keeps a moving actor's marker attached.
            draw(marker.el,tx,ty);
          }
        }
      }
      if(focused&&!focused.group){
        const f=focused,q=position(f.ref);
        if(!q){if(awaitingReturn)f.el.style.display='none';else {removeFocus();lastScan=-Infinity;}}
        else {
          f.pendingSince=null;
          if(now-lastText>=150){lastText=now;const b=guidanceBearing(q.x,q.y,p.x,p.y);if(q.distance>game.detailSenseRadius)setArrowIcon(f.glyph,Math.atan2(q.y-p.y,q.x-p.x)*180/Math.PI);f.label.textContent=`${f.labelText} · ${b.direction} · ${guidanceDistance(q.distance)}${f.hostile?' · 敌意':''}`;f.el.setAttribute('aria-label',`${f.label.textContent}，点击取消关注`);}
          if(q.distance>game.detailSenseRadius){f.el.classList.remove('arriving');f.el.style.opacity='1';const a=anchor(q);if(a){draw(f.el,a.x,a.y);f.x=a.x;f.y=a.y;f.el.classList.toggle('label-left',a.x>w/2);positionFocusLabel(f,a);}else f.el.style.display='none';}
          else {
            const seen=f.ref.type==='enemy'?enemyPerceptibility(f.ref.actor,p.x,p.y,game.detailSenseRadius,game.senseBurstT>0)>.05:game.life.vis({x:q.x,y:q.y})>.01;
            if(!seen){f.el.classList.remove('arriving');f.el.style.opacity='1';setArrowIcon(f.glyph,Math.atan2(q.y-p.y,q.x-p.x)*180/Math.PI);const a=anchor(q);if(a){draw(f.el,a.x,a.y);f.x=a.x;f.y=a.y;positionFocusLabel(f,a);}else f.el.style.display='none';}
            else {
              const targetY=f.ref.type==='enemy'?enemyGuidanceY(game.combat,f.ref.actor as Enemy,cam.zoom):f.ref.type==='npc'?q.y-150*((f.ref.actor as Active).d.beauty?1.06:1)-((f.ref.actor as Active).st.lift||0):q.y-guidanceExtraHeight(f.ref);
              const tx=w/2+(q.x-cam.x)*cam.zoom,ty=h/2+(targetY-cam.y)*cam.zoom;
              f.el.classList.add('arriving');f.glyph.textContent='▼';f.el.style.opacity='1';f.el.classList.toggle('important',f.important);
              if(tx < -30||tx>w+30||ty < -30||ty>h+30)f.el.style.display='none';else draw(f.el,tx,ty);
            }
          }
        }
      }
      if(pinned){
        if(!focused){pinned.hidden=true;lastPinnedN=-1;}
        else {
          const f=focused,refs=f.group??[f.ref];
          const visible=refs.map(ref=>({ref,q:position(ref)})).filter(v=>{
            if(!v.q)return false;
            if(v.q.distance>game.detailSenseRadius)return true;
            return v.ref.type==='enemy'?enemyPerceptibility(v.ref.actor,p.x,p.y,game.detailSenseRadius,game.senseBurstT>0)>.05:game.life.vis({x:v.q.x,y:v.q.y})>.01;
          });
          if(visible.length!==lastPinnedN||now-lastPinned>=350){
            lastPinned=now;lastPinnedN=visible.length;
            pinned.hidden=false;
            if(!visible.length)setInlineArrowText(pinned,null,'暂不可感知 · 点击取消');
            else {
              const nearest=visible.reduce((a,b)=>a.q!.distance<=b.q!.distance?a:b),q=nearest.q!;
              const realm=f.group?guidanceRealmSummary(visible.map(v=>({ref:v.ref,kind:f.kind,hostile:f.hostile,x:v.q!.x,y:v.q!.y,distance:v.q!.distance}))):'';
              const name=f.group?f.labelText.split(' · ')[0]+(realm?` · ${realm}`:''):f.labelText;
              const bearing=guidanceBearing(q.x,q.y,p.x,p.y);
              setInlineArrowText(pinned,bearing.sector*45,`${name}${visible.length>1?` ${visible.length}道`:''} · ${guidanceDistance(q.distance)}`);
            }
          }
        }
      }
    };
    const offFrame=typeof (game as any).onAfterFrame==='function'?(game as any).onAfterFrame(()=>step(performance.now())):null;
    const offUi=typeof (game as any).subscribe==='function'?(game as any).subscribe(()=>step(performance.now())):null;
    raf=requestAnimationFrame((now)=>{ step(now); });
    return ()=>{cancelAnimationFrame(raf);offFrame?.();offUi?.();clearEntries();removeFocus();clearGuidanceFilter(game,selectedForWorld);game.renderer?.resetStill();svg.remove();panel?.remove();};
  },[game]);
  return <div ref={root} className="sense-guidance" aria-label="神识方向与目标" />;
}
