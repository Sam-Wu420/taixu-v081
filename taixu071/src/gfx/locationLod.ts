import { makeCanvas, shade, rgba } from '../core/canvas';
import { K, LOC_SCALE, renderPiece, type LocLayout, type Piece } from './building';
import { BLD2 } from './bld2Dims';
import { drawBld, drawWallRun, fillPatternTiled, drawDecal } from './bldTex2';
import { TREE_SIZE, type Species, type Season } from './tree';

/** 低缩放先淡去真实细节，再保留基于原布局的地面、屋檐、墙和塔的概括轮廓。 */
export function locationDetailWeight(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return 0;
  const t = Math.max(0, Math.min(1, (zoom - 0.10) / 0.10));
  return t * t * (3 - 2 * t);
}
export interface LocationOutline { canvas: HTMLCanvasElement; w: number; h: number; ax: number; ay: number; refined?: HTMLCanvasElement; readyFrame?: number }
const PAD = 380, MAX_PX = 256;
const SOLID = new Set(['hall','house','hut','yurt','dome','pagoda','paifang','tower','pavilion','corridor','rock','wallH','wallV','B','W','WV']);

/** 返回构件在布局坐标中的真实视觉总高度（含屋脊/塔刹/多檐），与 building.ts / bldTex2.ts 对齐。 */
export function locationPieceVisualHeight(pc: Piece): number {
  const p = pc.p, q = pc.kind === 'B' || pc.kind === 'W' || pc.kind === 'WV' ? 1 / LOC_SCALE : 1;
  switch (pc.kind) {
    case 'house': {
      const h = p.h ?? 24, d = p.d ?? 40;
      return h + 5 + d * K * 0.75 + 6;
    }
    case 'hall': {
      const h = p.h ?? 40, d = p.d ?? (p.w ?? 120) * 0.5, ph = p.ph ?? 10;
      const depth1 = d * K * 0.75 + 10;
      let top = ph + 8 + h + depth1;
      if ((p.tiers ?? 1) >= 2) {
        const b2 = ph + 8 + h + depth1 * 0.45;
        top = b2 + h * 0.45 + 1 + d * 0.7 * K * 0.75 + 10;
      }
      return top;
    }
    case 'hut': return (p.h ?? 18) + 1 + (p.d ?? 34) * K * 0.75 + 8;
    case 'yurt': { const w = p.w ?? 70; return w * 0.32 + w * 0.25; }
    case 'dome': { const w = p.w ?? 160; return 16 + w * 0.3 + w * 0.44; }
    case 'pavilion': {
      const w = p.w ?? 64, h = p.h ?? 34, ph = p.ph ?? 8;
      let top = ph + 6 + h + w * 0.85 * K * 0.75 + 10;
      if ((p.tiers ?? 1) >= 2) top += 7 + w * 0.62 * 0.8 * K * 0.75 + 8;
      return top + 4;
    }
    case 'tower': return (p.h ?? 46) + 29 + 30 * K * 0.75 + 6;
    case 'pagoda': {
      const n = p.levels ?? 7, lh = p.lh ?? 22;
      let tw = p.w ?? 60, yTop = 12;
      for (let i = 0; i < n; i++) {
        const th = lh * (1 - i * 0.04);
        const depth = tw * 0.8 * K * 0.75 + 2;
        yTop += th + 1 + depth - 6;
        tw *= 0.86;
      }
      return yTop + 39;
    }
    case 'paifang': return (p.h ?? 70) + 3;
    case 'corridor': return (p.dir ?? 'h') === 'v' ? (p.len ?? 120) + (p.h ?? 22) : (p.h ?? 22) + 20;
    case 'wallH': return (p.h ?? 46) + (p.t ?? 26) * K + (p.gate ? 92 : 6);
    case 'W': return (p.hh ?? p.h ?? 50) * q;
    case 'WV': return ((p.len ?? 100) + (p.h ?? 0)) * q;
    case 'B': return Math.max(25, (p.h ?? 70) * q);
    default: return (p.h ?? 120);
  }
}

/** 简化地面仍使用原布局位置、尺寸与水面裁剪，不绘制逐块砖缝。 */
function ground(g: CanvasRenderingContext2D, L: LocLayout) {
  g.save();
  if (L.wet?.length) {
    g.beginPath(); g.rect(-L.gw/2-PAD, -L.gh/2-PAD, L.gw+2*PAD, L.gh+2*PAD);
    for (const w of L.wet) g.rect(w.x,w.y,w.w,w.h);
    g.clip('evenodd');
  }
  for (const it of L.ground) {
    if (![it.x,it.y,it.w,it.h].every(Number.isFinite) || it.w<=0 || it.h<=0) continue;
    const {x,y,w,h}=it;
    if (it.kind === 'path') {
      const pts = it.p?.pts as [number,number][] | undefined;
      if (!pts?.length) continue;
      g.beginPath(); pts.forEach(([px,py],i)=>i ? g.lineTo(px,py) : g.moveTo(px,py));
      g.strokeStyle='rgba(200,184,146,0.9)'; g.lineWidth=w; g.stroke(); continue;
    }
    // v2 铺装和贴花有自己的画材；不能把 farm / decal 当普通矩形铺地。
    if(it.kind==='pat') {
      const tex=it.p?.tex;
      let tile=(it.p?.tile??300)/LOC_SCALE;
      let tiles=typeof tex==='string'&&Number.isFinite(tile)&&tile>0?Math.ceil(w/tile+1)*Math.ceil(h/tile+1):Infinity;
      // 远景缩略图（≤256px）单块面积极小，过度细铺会产生上百次 drawImage；倍增步距保持均色与纹理感，上限 16 块
      while(tiles>16 && tile<Math.max(w,h)){tile*=2;tiles=Math.ceil(w/tile+1)*Math.ceil(h/tile+1);}
      const bounded=typeof tex==='string'&&Number.isFinite(tile)&&tile>0&&tiles<=25;
      g.save(); if(it.p?.edge===false)g.globalAlpha*=0.9;
      if(!bounded || !fillPatternTiled(g,tex,tile,0,x-w/2,y-h/2,w,h)) {
        g.fillStyle=typeof tex==='string'&&tex.startsWith('farm')?'#857252':typeof tex==='string'&&tex.startsWith('road')?'#b5a689':'#a9a596';g.fillRect(x-w/2,y-h/2,w,h);
      }
      g.restore();continue;
    }
    if(it.kind==='dec') {
      if(!drawDecal(g,it.p?.tex,x,y,w,h,0)) {g.fillStyle='rgba(200,196,180,0.8)';g.beginPath();g.ellipse(x,y,w/2,h/2,0,0,Math.PI*2);g.fill();}
      continue;
    }
    // Match the original ground's base pigment and alpha, dropping only small texture lines.
    if(it.kind==='array') {g.save();g.translate(x,y);g.scale(1,K);g.strokeStyle=rgba(it.p?.col??'#5a7ab0',0.8);g.lineWidth=3;g.beginPath();g.arc(0,0,w/2,0,Math.PI*2);g.stroke();g.restore();continue;}
    if(it.kind==='scorch') {const gr=g.createRadialGradient(x,y,0,x,y,w/2);gr.addColorStop(0,rgba(it.p?.col??'#3a2020',0.55));gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.save();g.translate(x,y);g.scale(1,h/w);g.beginPath();g.arc(0,0,w/2,0,Math.PI*2);g.restore();g.fill();continue;}
    const water = it.kind==='pond'||it.kind==='moonpool'||it.kind==='bloodpool';
    g.fillStyle = it.kind==='pond'?'rgba(120,160,165,0.95)' : it.kind==='moonpool'?'rgba(150,170,200,0.95)' : it.kind==='bloodpool'?'rgba(120,20,24,0.95)' :
      it.kind==='street'?'rgba(206,192,156,0.95)' : it.kind==='courtyard'?'rgba(222,212,182,0.9)' :
      it.kind==='field'?rgba(shade(it.p?.col??'#8ab060',-0.2),0.7) : it.kind==='dock'?'#8a6a48' :
      it.kind==='stairs'?shade(L.pal.stone,0.08) : (it.kind==='terrace'||it.kind==='cliff')?rgba(it.p?.topCol??L.pal.ground,0.95) : rgba(it.p?.col??L.pal.ground,0.92);
    g.strokeStyle='rgba(69,58,46,0.65)'; g.lineWidth=4;
    if (water) {g.beginPath();g.ellipse(x,y,w/2,h/2,0,0,Math.PI*2);g.fill();g.stroke();}
    else {g.fillRect(x-w/2,y-h/2,w,h);g.strokeRect(x-w/2,y-h/2,w,h);}
  }
  g.restore();
}
function hipRoof(g: CanvasRenderingContext2D, cx: number, eaveY: number, ridgeY: number, w: number, ox: number, rwRatio: number, roofCol: string) {
  const rw = rwRatio * w * 0.5, L = cx - w * 0.5 - ox, R = cx + w * 0.5 + ox;
  g.beginPath();
  g.moveTo(L, eaveY);
  g.lineTo(cx - rw, ridgeY);
  g.lineTo(cx + rw, ridgeY);
  g.lineTo(R, eaveY);
  g.lineTo(R - ox * 0.8, eaveY + 3);
  g.lineTo(L + ox * 0.8, eaveY + 3);
  g.closePath();
  g.fillStyle = roofCol; g.fill();
  g.strokeStyle = 'rgba(52,43,37,0.92)'; g.lineWidth = 3; g.stroke();
  g.beginPath(); g.moveTo(cx - rw, ridgeY); g.lineTo(cx + rw, ridgeY);
  g.strokeStyle = 'rgba(240,220,185,0.65)'; g.lineWidth = 2.5; g.stroke();
}

/** 轮廓的锚点和尺寸来自实际构件；屋脊、飞檐、塔层和墙线不使用单一黑方块。 */
function piece(g: CanvasRenderingContext2D, pc: Piece, L: LocLayout, season: Season=1) {
  const p=pc.p, q=pc.kind==='B'||pc.kind==='W'||pc.kind==='WV' ? 1/LOC_SCALE : 1;
  const x=pc.x,y=pc.y;
  if(pc.kind==='tree') {
    const h=(TREE_SIZE[p.sp as Species]??190)*(p.s??0.55),w=h*.55;
    const conifer=p.sp==='pine'||p.sp==='cypress'||p.sp==='snowpine'||p.sp==='bamboo';
    // Main trunk and branches remain visible in winter; never replace a bare crown with an opaque oval.
    g.strokeStyle='#554436';g.lineCap='round';g.lineWidth=Math.max(2,h*.038);g.beginPath();g.moveTo(x,y);g.lineTo(x,y-h*.72);
    g.moveTo(x,y-h*.38);g.lineTo(x-w*.36,y-h*.66);g.lineTo(x-w*.43,y-h*.81);
    g.moveTo(x,y-h*.46);g.lineTo(x+w*.34,y-h*.71);g.lineTo(x+w*.42,y-h*.86);
    g.moveTo(x,y-h*.62);g.lineTo(x-w*.15,y-h*.91);g.moveTo(x,y-h*.64);g.lineTo(x+w*.17,y-h*.95);g.stroke();
    if(p.sp!=='dead'&&(season!==3||conifer)){
      const col=season===2?'#987d55':season===0&&(p.sp==='peach'||p.sp==='plum'||p.sp==='apricot')?'#b69a91':p.sp==='snowpine'?'#a7bcb0':'#718765';
      g.fillStyle=col;for(const [dx,dy,r] of [[-.35,-.72,.14],[-.17,-.86,.16],[.05,-.83,.17],[.27,-.78,.16],[.39,-.68,.12]]){g.beginPath();g.arc(x+dx*w,y+dy*h,r*h,0,Math.PI*2);g.fill();}
    }
    return;
  }
  if(pc.kind==='B' && p.prop) {
    const w=(p.w??100)*q,h=(p.h??100)*q;
    if(p.k==='p_scarecrow') {g.strokeStyle='#745d42';g.lineWidth=Math.max(2,w*.07);g.beginPath();g.moveTo(x,y);g.lineTo(x,y-h*.8);g.moveTo(x-w*.36,y-h*.6);g.lineTo(x+w*.36,y-h*.6);g.stroke();g.fillStyle='#b49b70';g.beginPath();g.ellipse(x,y-h*.82,w*.16,h*.12,0,0,Math.PI*2);g.fill();}
    else {g.fillStyle='#8a785e';g.beginPath();g.ellipse(x,y-h*.4,w*.42,h*.38,0,0,Math.PI*2);g.fill();}return;
  }
  if(!SOLID.has(pc.kind)) {
    const scale=p.z??1,w=(p.w??40)*scale,h=(p.h??45)*scale;
    g.fillStyle=p.col??'#827565';g.beginPath();g.ellipse(x,y-h*.35,Math.max(4,w*.4),Math.max(4,h*.35),0,0,Math.PI*2);g.fill();return;
  }
  if(pc.kind==='rock') {
    const w=p.w??60,h=p.h??40;g.beginPath();g.moveTo(x-w/2,y);g.lineTo(x-w*.36,y-h*.65);g.lineTo(x,y-h);g.lineTo(x+w*.34,y-h*.67);g.lineTo(x+w/2,y);g.closePath();
    g.fillStyle=p.col??'#9a9484';g.fill();g.strokeStyle='rgba(30,24,18,0.8)';g.lineWidth=2;g.stroke();
    if(p.cave){g.fillStyle='#1a1414';g.beginPath();g.ellipse(x,y-h*.25,w*.16,h*.3,0,Math.PI,0);g.lineTo(x+w*.16,y);g.lineTo(x-w*.16,y);g.closePath();g.fill();}return;
  }
  if (pc.kind==='W') { const w=(p.len??100)*q,h=(p.hh??p.h??50)*q; g.fillStyle=p.col??'#8e8a7e';g.strokeStyle='#514a41';g.lineWidth=4;g.fillRect(x-w/2,y-h,w,h);g.strokeRect(x-w/2,y-h,w,h);return; }
  if (pc.kind==='wallH') {
    const w=p.len??100, h=p.h??46, t=p.t??26, col=p.col??'#8e8a7e', roof=p.roof??L.pal.roof, wall=p.wall??L.pal.wall;
    g.fillStyle=col;g.strokeStyle='#514a41';g.lineWidth=4;
    g.fillRect(x-w/2,y-h-t*K,w,h+t*K);g.strokeRect(x-w/2,y-h-t*K,w,h+t*K);
    if (p.gate) {
      const gy=y-h-t*K*0.3, gw=110, gh=26, gd=46, b2=gy-2-gh-2, d1=gd*K*0.75+10;
      g.fillStyle=wall;g.strokeStyle='rgba(52,43,37,0.92)';g.lineWidth=3;
      g.fillRect(x-gw/2,b2,gw,gy-b2);g.strokeRect(x-gw/2,b2,gw,gy-b2);
      hipRoof(g,x,b2,b2-d1,gw,9,0.6,roof);
      const b3=b2-d1*0.5, w2=gw*0.66;
      g.fillStyle=wall;g.fillRect(x-w2/2,b3-14,w2,14);g.strokeRect(x-w2/2,b3-14,w2,14);
      hipRoof(g,x,b3-15,b3-15-(gd*0.7*K*0.75+10),w2,7,0.55,roof);
    }
    return;
  }
  if (pc.kind==='wallV'||pc.kind==='WV') {const len=(p.len??100)*q,w=(p.t??35)*q,h=(p.h??0)*q;g.fillStyle=p.col??'#8e8a7e';g.strokeStyle='#514a41';g.lineWidth=4;g.fillRect(x-w/2,y-len-h,w,len);g.strokeRect(x-w/2,y-len-h,w,len);return;}
  const roof=p.roof??L.pal.roof, wall=p.wall??L.pal.wall, pillar=p.pillar??L.pal.pillar??'#7a2a1e';
  if (pc.kind==='house') {
    const w=Math.max(20,p.w??70), d=Math.max(12,p.d??40), h=Math.max(12,p.h??24);
    const bodyTop=y-h-4, eaveY=bodyTop-1, ridge=eaveY-(d*K*0.75+6);
    g.fillStyle=wall;g.strokeStyle='rgba(52,43,37,0.92)';g.lineWidth=3;
    g.fillRect(x-w*0.5,bodyTop,w,y-bodyTop);g.strokeRect(x-w*0.5,bodyTop,w,y-bodyTop);
    g.fillStyle=pillar;g.fillRect(x-Math.max(4,w*0.09),bodyTop+h*0.25,Math.max(8,w*0.18),y-bodyTop-h*0.25);
    hipRoof(g,x,eaveY,ridge,w,7,p.gable?0.92:0.7,roof);
    return;
  }
  if (pc.kind==='hall') {
    const w=Math.max(24,p.w??120), d=Math.max(16,p.d??w*0.5), h=Math.max(16,p.h??40), ph=p.ph??10;
    const baseY=y-ph-6, bodyTop=baseY-h, eaveY=bodyTop-2, depth1=d*K*0.75+10;
    g.fillStyle=L.pal.stone;g.fillRect(x-(w+24)*0.5,y-ph-4,w+24,ph+4);
    g.fillStyle=wall;g.strokeStyle='rgba(52,43,37,0.92)';g.lineWidth=3.5;
    g.fillRect(x-w*0.5,bodyTop,w,baseY-bodyTop);g.strokeRect(x-w*0.5,bodyTop,w,baseY-bodyTop);
    g.fillStyle=pillar;g.fillRect(x-w*0.1,bodyTop+h*0.22,w*0.2,baseY-bodyTop-h*0.22);
    hipRoof(g,x,eaveY,eaveY-depth1,w,9,p.rw??0.6,roof);
    if ((p.tiers??1)>=2) {
      const w2=w*0.66, h2=h*0.45, b2=eaveY-depth1*0.45, e2=b2-h2-1, depth2=d*0.7*K*0.75+10;
      g.fillStyle=wall;g.fillRect(x-w2*0.5,b2-h2,w2,h2);g.strokeRect(x-w2*0.5,b2-h2,w2,h2);
      hipRoof(g,x,e2,e2-depth2,w2,8,0.55,roof);
    }
    return;
  }
  if (pc.kind==='hut') {
    const w=p.w??54, d=p.d??34, h=p.h??18, bodyTop=y-h, eaveY=bodyTop-1, ridge=eaveY-(d*K*0.75+8);
    g.fillStyle=p.wall??'#c8ae86';g.strokeStyle='rgba(52,43,37,0.9)';g.lineWidth=3;
    g.fillRect(x-w*0.5,bodyTop,w,h);g.strokeRect(x-w*0.5,bodyTop,w,h);
    hipRoof(g,x,eaveY,ridge,w,8,0.75,p.roof??'#b89a5a');
    return;
  }
  if (pc.kind==='yurt') {
    const w=p.w??70, h=w*0.32;
    g.fillStyle='#efe8d6';g.strokeStyle='rgba(52,43,37,0.9)';g.lineWidth=3;
    g.fillRect(x-w*0.48,y-h,w*0.96,h);g.strokeRect(x-w*0.48,y-h,w*0.96,h);
    g.beginPath();g.moveTo(x-w*0.52,y-h+1);g.quadraticCurveTo(x,y-h-w*0.5,x+w*0.52,y-h+1);g.closePath();
    g.fillStyle='#e6dfcc';g.fill();g.stroke();return;
  }
  if (pc.kind==='dome') {
    const w=p.w??160, h=w*0.3, bodyTop=y-16-h;
    g.fillStyle=L.pal.stone;g.fillRect(x-w*0.56,y-14,w*1.12,14);
    g.fillStyle=wall;g.strokeStyle='rgba(52,43,37,0.92)';g.lineWidth=4;
    g.fillRect(x-w*0.5,bodyTop,w,y-16-bodyTop);g.strokeRect(x-w*0.5,bodyTop,w,y-16-bodyTop);
    g.beginPath();g.moveTo(x-w*0.52,bodyTop);g.bezierCurveTo(x-w*0.5,bodyTop-w*0.55,x+w*0.5,bodyTop-w*0.55,x+w*0.52,bodyTop);g.closePath();
    g.fillStyle=roof;g.fill();g.stroke();return;
  }
  if (pc.kind==='pavilion') {
    const w=p.w??64, h=p.h??34, ph=p.ph??8, baseY=y-ph-5, bodyTop=baseY-h;
    g.fillStyle=L.pal.stone;g.fillRect(x-(w+16)*0.5,y-ph-4,w+16,ph+4);
    g.fillStyle=pillar;g.strokeStyle='rgba(52,43,37,0.9)';g.lineWidth=3;
    g.fillRect(x-w*0.36,bodyTop,w*0.72,baseY-bodyTop);g.strokeRect(x-w*0.36,bodyTop,w*0.72,baseY-bodyTop);
    let ry=bodyTop-1-(w*0.85*K*0.75+10);
    hipRoof(g,x,bodyTop-1,ry,w+8,12,0.14,roof);
    if ((p.tiers??1)>=2) { const w2=w*0.62, b2=ry+4, ry2=b2-11-(w2*0.8*K*0.75+8); hipRoof(g,x,b2-11,ry2,w2,9,0.12,roof); }
    return;
  }
  if (pc.kind==='tower') {
    const h=p.h??46, col=p.col??'#8e8a7e', baseTop=y-h-4, uBot=y-h-10, uTop=uBot-18, ridge=uTop-1-(30*K*0.75+6);
    g.fillStyle=col;g.strokeStyle='#514a41';g.lineWidth=3;
    g.fillRect(x-22,baseTop,44,y-baseTop);g.strokeRect(x-22,baseTop,44,y-baseTop);
    g.fillStyle=wall;g.fillRect(x-17,uTop,34,uBot-uTop);g.strokeRect(x-17,uTop,34,uBot-uTop);
    hipRoof(g,x,uTop-1,ridge,34,9,0.3,roof);
    return;
  }
  if (pc.kind==='pagoda') {
    const n=p.levels??7, lh=p.lh??22; let tw=p.w??60, yy=y-12;
    g.fillStyle=L.pal.stone;g.fillRect(x-(tw+20)*0.5,y-10,tw+20,10);
    g.strokeStyle='#453d38';g.lineWidth=3;
    for(let i=0;i<n;i++){
      const th=lh*(1-i*0.04), eaveY=yy-th-1, ridge=eaveY-(tw*0.8*K*0.75+2);
      g.fillStyle=wall;g.fillRect(x-tw*0.5,yy-th,tw,th);g.strokeRect(x-tw*0.5,yy-th,tw,th);
      hipRoof(g,x,eaveY,ridge,tw,8+tw*0.08,0.18,roof);
      yy=ridge+6; tw*=0.86;
    }
    g.strokeStyle=L.pal.accent;g.lineWidth=3;g.beginPath();g.moveTo(x,yy);g.lineTo(x,yy-33);g.stroke();
    return;
  }
  if (pc.kind==='paifang') {
    const w=p.w??120, h=p.h??70;
    g.fillStyle=p.stoneGate?L.pal.stone:pillar;g.fillRect(x-w*0.5,y-h*0.82,w,6);
    g.fillRect(x-w*0.18,y-h,w*0.36,8);
    g.strokeStyle='#453d38';g.lineWidth=4;
    for(const fx of [-0.5,-0.17,0.17,0.5]){const px=x+fx*w, hh=Math.abs(fx)<0.2?h:h*0.82;g.beginPath();g.moveTo(px,y);g.lineTo(px,y-hh);g.stroke();}
    hipRoof(g,x,y-h+8,y-h-3,w*0.36,6,0.7,roof);
    return;
  }
  if (pc.kind==='corridor') {
    const dir=p.dir??'h', len=p.len??120, h=p.h??22;
    if (dir==='v') {
      g.fillStyle=roof;g.strokeStyle='rgba(52,43,37,0.9)';g.lineWidth=3;
      g.fillRect(x-13,y-len-h,26,len+h);g.strokeRect(x-13,y-len-h,26,len+h);
    } else {
      g.fillStyle=wall;g.strokeStyle='rgba(52,43,37,0.9)';g.lineWidth=3;
      g.fillRect(x-len*0.5,y-5-h,len,h+5);g.strokeRect(x-len*0.5,y-5-h,len,h+5);
      hipRoof(g,x,y-5-h,y-5-h-14,len,6,0.92,roof);
    }
    return;
  }
  // pc.kind === 'B' (v2 贴图/程序建筑): 按真实画材宽高与台基偏移 b 对齐比例
  const w=Math.max(24,(p.w??100)*q), h=Math.max(25,(p.h??70)*q);
  const kBase=typeof p.k==='string'?p.k.split('|')[0]:'';
  const bOff=(BLD2[kBase]?.b??0)*(p.s??1)*q;
  const tall=h>w*0.75;
  const yb=y+bOff-h*0.05, bodyTop=y+bOff-h*(tall?0.68:0.60), ridge=y+bOff-h*(tall?0.92:0.85);
  g.fillStyle=wall;g.strokeStyle='rgba(52,43,37,0.92)';g.lineWidth=3.5;
  g.fillRect(x-w*0.41,bodyTop,w*0.82,yb-bodyTop);g.strokeRect(x-w*0.41,bodyTop,w*0.82,yb-bodyTop);
  g.fillStyle=pillar;g.fillRect(x-Math.max(4,w*0.08),bodyTop+(yb-bodyTop)*0.3,Math.max(8,w*0.16),(yb-bodyTop)*0.7);
  hipRoof(g,x,bodyTop,ridge,w*0.92,w*0.03,0.54,roof);
}
/** Small structural silhouettes gradually give way to the loaded sprite. */
export function locationStructureDetail(pixelHeight:number):number {
  const t=Math.max(0,Math.min(1,(pixelHeight-6)/4));
  return t*t*(3-2*t);
}
/** Tiny landmark structures must remain structures, never be replaced by generic dots. */
export function locationTinyPieceMode(pc:Piece, pixelHeight:number): 'full'|'outline'|'dot' {
  if (!(pixelHeight < 6) || pc.kind === 'tree') return 'full';
  return SOLID.has(pc.kind) && !(pc.kind==='B' && pc.p.prop) ? 'outline' : 'dot';
}

/** 精灵还在分帧生成时，在同一世界锚点画本构件，不能留空洞。 */
export function drawLocationPieceFallback(g: CanvasRenderingContext2D, pc: Piece, L: LocLayout, x: number, y: number, season: Season=1) {
  g.save();g.translate(x,y);g.scale(LOC_SCALE,LOC_SCALE);
  piece(g,{...pc,x:0,y:0},L,season);
  g.restore();
}

/** Return true only when the budget/worker has not produced any usable sprite yet. */
export function drawMissingLocationPiece(g: CanvasRenderingContext2D, pc: Piece, L: LocLayout, x:number, y:number, sprite: unknown, season: Season=1): boolean {
  if (sprite) return false;
  drawLocationPieceFallback(g,pc,L,x,y,season);return true;
}

export function renderLocationOutline(L: LocLayout, season: Season=1): LocationOutline {
  const w=L.gw+PAD*2,h=L.gh+PAD*2, res=Math.min(MAX_PX/w,MAX_PX/h);
  const canvas=makeCanvas(Math.max(1,w*res),Math.max(1,h*res));const g=canvas.getContext('2d')!;
  g.scale(res,res);g.translate(w/2,h/2);g.lineJoin='round';g.lineCap='round';
  ground(g,L);
  for (const p of [...L.pieces].sort((a,b)=>a.y-b.y)) piece(g,p,L,season);
  return {canvas,w,h,ax:w/2,ay:h/2};
}
interface RefineJob { outline: LocationOutline; layout: LocLayout; canvas?: HTMLCanvasElement; ctx?: CanvasRenderingContext2D; pieces: Piece[]; index: number; season: Season }
/** 固定尺寸 LRU；真实建筑逐件分帧烘进远景图，减少同步生成尖峰。 */
export class LocationOutlineCache {
  private entries = new Map<LocLayout,LocationOutline>();
  private jobs = new Map<LocLayout,RefineJob>();
  private seasons = new Map<LocLayout,Season>();
  private frame = 0;
  constructor(readonly limit=128) {}
  get size(){return this.entries.size;}
  get pending(){return this.jobs.size;}
  isPending(L:LocLayout){return this.jobs.has(L);}
  get(L:LocLayout,season:Season=1){if(this.seasons.has(L)&&this.seasons.get(L)!==season){this.entries.delete(L);this.jobs.delete(L);this.seasons.delete(L);}const v=this.entries.get(L);if(v){this.entries.delete(L);this.entries.set(L,v);}return v;}
  build(L:LocLayout,season:Season=1){
    let v=this.get(L,season);if(v)return v;
    v=renderLocationOutline(L,season);this.entries.set(L,v);this.seasons.set(L,season);
    // 延迟精化画布和铺装的创建；极远镜头只需要初始轮廓。
    const pieces=L.pieces.slice().sort((a,b)=>a.y-b.y);
    this.jobs.set(L,{outline:v,layout:L,pieces,index:0,season});
    while(this.entries.size>Math.max(1,this.limit)){const key=this.entries.keys().next().value as LocLayout;this.entries.delete(key);this.jobs.delete(key);this.seasons.delete(key);}
    return v;
  }
  /** 默認每帧最多烘焙一件实际构件（budgetMs<=0）；传入 budgetMs>0 时按时间片批量精化。 */
  step(preferred?: LocLayout | null, budgetMs = 0) {
    this.frame++;
    const job = preferred === null ? undefined : preferred ? this.jobs.get(preferred) : this.jobs.values().next().value as RefineJob | undefined;
    if(!job)return;
    const t0 = budgetMs > 0 ? performance.now() : 0;
    if(!job.ctx) {
      const canvas=makeCanvas(job.outline.canvas.width,job.outline.canvas.height),ctx=canvas.getContext('2d')!;
      ctx.scale(canvas.width/job.outline.w,canvas.height/job.outline.h);ctx.translate(job.outline.ax,job.outline.ay);ctx.lineJoin='round';ctx.lineCap='round';ground(ctx,job.layout);
      job.canvas=canvas;job.ctx=ctx;
      if (budgetMs <= 0 || performance.now() - t0 >= budgetMs) return; // 铺装初始化已用尽时间片或无时间片时直接返回
    }
    let count = 0;
    while (job.index < job.pieces.length) {
      const p=job.pieces[job.index++];
      if(p) {
        try {
          const g=job.ctx!, P=p.p;
          if(p.kind==='B') {
            if(!drawBld(g,P.k,p.x,p.y,0,(P.s??1)/LOC_SCALE,!!P.f)) piece(g,p,job.layout,job.season);
          } else if(p.kind==='W') {
            const len=P.len/LOC_SCALE,hh=P.hh/LOC_SCALE;
            if(!drawWallRun(g,P.k,p.x-len/2,p.x+len/2,p.y,hh,0)) piece(g,p,job.layout,job.season);
          } else if(p.kind==='WV') piece(g,p,job.layout,job.season);
          else {
            const spr=renderPiece(p,job.layout.pal,0.2,job.season), scale=p.kind==='tree'?(P.s??0.55):(P.z??1);
            g.drawImage(spr.canvas,p.x-spr.ax*scale,p.y-spr.ay*scale,spr.w*scale,spr.h*scale);
          }
        } catch { piece(job.ctx!,p,job.layout,job.season); }
      }
      count++;
      if (budgetMs <= 0 || count >= 32 || (count >= 1 && performance.now() - t0 >= budgetMs)) break;
    }
    if(job.index>=job.pieces.length) { job.outline.refined=job.canvas!;job.outline.readyFrame=this.frame;this.jobs.delete(job.layout); }
  }
  blend(o:LocationOutline){return o.readyFrame===undefined ? 0 : Math.min(1,Math.max(0,(this.frame-o.readyFrame)/20));}
  clear(){this.entries.clear();this.jobs.clear();this.seasons.clear();}
}
/** 尚未烘焙时有界退化：保留主要地面及前几件结构，不等待缓存或生成完整细节。 */
export function drawLocationOutlineFallback(g: CanvasRenderingContext2D, L: LocLayout, x: number, y: number, season: Season=1) {
  g.save();g.translate(x,y);g.scale(LOC_SCALE,LOC_SCALE);g.lineJoin='round';
  // 地面通常少于 10 项，按真实布局绘制，不做砖缝。
  ground(g,L);
  // Preserve the actual row of houses and enclosing walls while a cache build is pending.
  // Secondary props stay bounded; major structures get a separate budget.
  let structural=0,other=0;
  for(const p of L.pieces){
    if(SOLID.has(p.kind) && !(p.kind==='B'&&p.p.prop)){if(structural++>=256)continue;}
    else if(other++>=24)continue;
    piece(g,p,L,season);
  }
  g.restore();
}
