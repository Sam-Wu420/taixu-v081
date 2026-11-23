// WebGL2 合成舞台：
//   1. 把 Canvas2D 绘制的世界当作纹理上传；
//   2. 特效批次画进 HDR 帧缓冲（加色发光 + 墨色覆盖），并做多级泛光；
//   3. 一次全屏后期：冲击波扭曲、昼夜调色、神识圈外“记忆水墨”、云影/迷雾、天气、纸纹、暗角、受伤血晕。
// 旧版需要 8~10 次全屏 Canvas2D 合成，现在合为一次着色器，移动端也能流畅。
import { Batch, FLOATS } from './batch';
import { prof } from '../core/prof';
import { buildAtlas } from './atlas';
import { bakeFx, BAKE_PROGRAM } from './fxbake';
import { Ground, GROUND_PROGRAM, GLSL_COMMON, GLSL_WATER, type GroundView, type SegProvider, type GroundTerrain } from './ground';
import { startProgram, takeProgram, programsDone } from './precompile';
import { GLSL_SEA, setSeaUniforms, makeSeaMaskTex, type SeaPost } from './seaGlsl';   // 绝域的海面与视野（world/jueyu.ts）

const VS_SPRITE = `#version 300 es
layout(location=0) in vec2 aPos; layout(location=1) in vec2 aUv; layout(location=2) in vec4 aCol; layout(location=3) in float aDepth;
uniform vec2 uRes; out vec2 vUv; out vec4 vCol;
void main(){ vUv=aUv; vCol=aCol; vec2 c=aPos/uRes*2.0-1.0; gl_Position=vec4(c.x,-c.y,aDepth,1.0); }`;
const FS_SPRITE = `#version 300 es
precision mediump float; uniform sampler2D uTex; in vec2 vUv; in vec4 vCol; out vec4 o;
void main(){ vec4 t=texture(uTex,vUv); o=vec4(vCol.rgb*t.rgb, vCol.a*t.a); }`;
// 贴地贴花：屏幕包围矩形内逐像素读地表深度，还原世界坐标后取贴图。贴合任意起伏的地面，立板和建筑照常遮挡它。
const FS_DECAL = `#version 300 es
precision highp float; uniform sampler2D uTex; uniform highp sampler2D uGroundDepth; uniform highp sampler2D uWorldDepth; uniform mat4 uWorldInverse;
uniform vec2 uTarget; uniform vec4 uDecal; uniform vec4 uUv; uniform vec3 uProj; uniform vec2 uDecalK; in vec4 vCol; out vec4 o;
float viewD(float d){ return uProj.z>0.5 ? (2.0*uProj.x*uProj.y)/(uProj.y+uProj.x-(d*2.0-1.0)*(uProj.y-uProj.x)) : d*(uProj.y-uProj.x); }
void main(){
  vec2 uv=gl_FragCoord.xy/uTarget;
  float depth=texture(uGroundDepth,uv).r;
  if(depth>=1.0) discard;
  // 打击感遗留：原来靠深度测试让人和建筑挡住贴花，但妖兽脚下的光圈也贴着地面写了深度，会把血迹遮掉一角。
  // 改成自己比：场景深度比地面近出 4 个单位以上（站在上面的人、墙、树、草丛）才挡；贴地的光圈只抬起 1.5，不挡。
  // （原来给 14：草丛、小树立板脚下那 14 个单位高的一截挡不住血迹，血画到了立板前面，成一条条直边的红块）
  if(viewD(depth)-viewD(texture(uWorldDepth,uv).r)>uDecalK.x) discard;   // uDecalK = (遮挡容差, 竖面淡出开关)；对照图用 __decalLegacy 退回旧行为
  vec4 world=uWorldInverse*vec4(uv*2.0-1.0,depth*2.0-1.0,1.0);
  vec2 d=(world.xz/world.w-uDecal.xy)/uDecal.z;
  float c=cos(uDecal.w), s=sin(uDecal.w);
  vec2 q=vec2(c*d.x+s*d.y,-s*d.x+c*d.y)*0.5+0.5;
  if(q.x<0.0||q.y<0.0||q.x>1.0||q.y>1.0) discard;
  vec4 t=texture(uTex,mix(uUv.xy,uUv.zw,q));
  // 打击感遗留：贴花是竖直往下投到地面上的，落在台阶立面、墙根、陡坎上会顺着竖面拉成直边——按地面的朝向淡掉
  vec3 wp=world.xyz/world.w; vec3 gn=cross(dFdx(wp),dFdy(wp)); float up=length(gn)>1e-6?abs(normalize(gn).y):1.0;
  float k=mix(1.0,smoothstep(0.5,0.8,up),uDecalK.y);
  o=vec4(vCol.rgb*t.rgb*k, vCol.a*t.a*k);
  gl_FragDepth=max(0.0,depth-0.00003);
}`;
// 纯黑清屏（首帧世界层尚未上传时铺底，避免闪白）
const FS_BLACK = `#version 300 es
precision mediump float; out vec4 o;
void main(){ o=vec4(0.0,0.0,0.0,1.0); }`;
const VS_FULL = `#version 300 es
out vec2 vUv; void main(){ vec2 p=vec2((gl_VertexID<<1)&2, gl_VertexID&2); vUv=p; gl_Position=vec4(p*2.0-1.0,0.0,1.0); }`;
// 降采样：4 次双线性采样 = 4×4 盒式平均
const FS_DOWN = `#version 300 es
precision mediump float; uniform sampler2D uTex; uniform vec2 uTexel; in vec2 vUv; out vec4 o;
void main(){ vec2 d=uTexel; o=0.25*(texture(uTex,vUv+vec2(-d.x,-d.y))+texture(uTex,vUv+vec2(d.x,-d.y))+texture(uTex,vUv+vec2(-d.x,d.y))+texture(uTex,vUv+vec2(d.x,d.y))); }`;
// 9 抽头高斯（利用线性过滤只需 5 次采样）
const FS_BLUR = `#version 300 es
precision mediump float; uniform sampler2D uTex; uniform vec2 uDir; in vec2 vUv; out vec4 o;
void main(){ vec4 c=texture(uTex,vUv)*0.2270270270;
 c+=texture(uTex,vUv+uDir*1.3846153846)*0.3162162162; c+=texture(uTex,vUv-uDir*1.3846153846)*0.3162162162;
 c+=texture(uTex,vUv+uDir*3.2307692308)*0.0702702703; c+=texture(uTex,vUv-uDir*3.2307692308)*0.0702702703; o=c; }`;
// P2：泛光第一次降采样时，把世界层（半浮点）里超过阈值的那一截一起取进来——窗纸、灯笼、灵光这些「亮过白」的东西也泛光，
// 寻常的地面、墙、人物（不超过 1）一点都不进泛光，画面不会整片发雾。世界层与特效层同尺寸、同朝向（都是 GL 的左下原点）。
const FS_DOWN_EM = `#version 300 es
precision mediump float; uniform sampler2D uTex, uWorld; uniform vec2 uTexel; uniform float uThr; in vec2 vUv; out vec4 o;
vec4 tap(vec2 p){ vec4 f=texture(uTex,p); vec3 w=min(max(texture(uWorld,p).rgb-uThr,0.0),vec3(3.0)); return vec4(f.rgb+w*0.55,f.a); }
void main(){ vec2 d=uTexel; o=0.25*(tap(vUv+vec2(-d.x,-d.y))+tap(vUv+vec2(d.x,-d.y))+tap(vUv+vec2(-d.x,d.y))+tap(vUv+vec2(d.x,d.y))); }`;
// P2：点光源（灯笼、窗内灯火、法术弹道与爆点）。每盏画成屏幕上一块包住它照亮范围的方片（实例化，一次绘制），
// 片元里读场景深度还原出被照的那一点，按距离衰减、按朝向（由深度的屏幕导数求面的法线）打折，叠进半分辨率的光照图；
// 后期用「画面 × (昼夜压暗 + 光照)」——被照到的地面、墙、人真的亮起来，不是在上面盖一团光晕。
const VS_LIGHT = `#version 300 es
layout(location=0) in vec2 aCorner; layout(location=1) in vec4 aPos; layout(location=2) in vec4 aCol;
uniform mat4 uVP; uniform vec2 uPS; out vec4 vPos; out vec4 vCol;
void main(){ vPos=aPos; vCol=aCol; vec4 c=uVP*vec4(aPos.xyz,1.0); float r=aPos.w;
  // 镜头进了光球（或贴得很近）：整屏都可能被照到，方片铺满
  if(c.w-r<2.0){ gl_Position=vec4(aCorner,0.0,1.0); return; }
  vec2 e=uPS*r/(c.w-r)*1.12; gl_Position=vec4(c.xy/c.w+aCorner*e,0.0,1.0); }`;
const FS_LIGHT = `#version 300 es
precision highp float; uniform highp sampler2D uDepth; uniform mat4 uInv; uniform vec2 uSize; uniform vec3 uEye;
in vec4 vPos; in vec4 vCol; out vec4 o;
void main(){ vec2 uv=gl_FragCoord.xy/uSize; float d=texture(uDepth,uv).r; if(d>=0.99999) discard;
  vec4 w=uInv*vec4(uv*2.0-1.0,d*2.0-1.0,1.0); vec3 p=w.xyz/w.w;
  vec3 L=vPos.xyz-p; float dist=length(L), k=dist/vPos.w; if(k>=1.0) discard;
  // 面的法线：还原出的世界坐标在屏幕上的导数叉乘；翻到朝镜头那面。立板、地面、墙都适用；求不出时当正对着光
  vec3 n=cross(dFdx(p),dFdy(p)); float nl=1.0, nn=length(n);
  if(nn>1e-6){ n/=nn; if(dot(n,uEye-p)<0.0) n=-n; nl=mix(1.0,max(dot(n,L/max(dist,1.0)),0.0),0.6); }
  // 衰减：窗函数把边缘收到 0（方片外不会有硬边），中间再加一个近处更亮的芯
  float a=1.0-k*k; a*=a*a; a*=0.45+0.55/(1.0+k*k*10.0);
  o=vec4(vCol.rgb*(vCol.a*a*nl),1.0); }`;

const FS_POST = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uScene, uWorld, uFx, uB1, uB2, uAtmo, uNoise; uniform float uGroundOn, uWorldOn;
// 40000 单位深度范围会放大低精度采样误差，重建世界坐标必须用 highp。
uniform highp sampler2D uWorldDepth;
uniform highp sampler2D uGroundDepth;
uniform mat4 uWorldInverse; uniform vec2 uSenseWorld, uFocus; uniform float uWorldZoom; uniform vec3 uProj; uniform vec4 uHaze; uniform vec3 uHazeColor;
// 深度缓冲值 → 沿视线的距离（世界单位）。正交相机是线性的；透视相机要还原
float viewDepth(float d){ return uProj.z>0.5 ? (2.0*uProj.x*uProj.y)/(uProj.y+uProj.x-(d*2.0-1.0)*(uProj.y-uProj.x)) : d*uFocus.y; }
// 地表缓存：A=静态色+水面覆盖，B=水面参数；屏幕设备像素 → 世界：w = uGWo + q*uGWs；世界 → 缓存 uv：(w-uGC)*uGTpw/uGSize+0.5
uniform sampler2D uGA, uGB, uN; uniform vec2 uGWo; uniform float uGWs; uniform mat2 uGWm; uniform vec2 uGC; uniform float uGTpw; uniform vec2 uGSize; uniform float uWT;
uniform vec2 uRes; uniform float uDpr; uniform float uT;
uniform vec4 uShock[6]; uniform int uNShock;
// r7-fx3d：空间扭曲冲击波（world/fx3d.ts 的 warp）：uDist = (屏幕设备像素 x, y, 波前半径, 推多少像素)，uDistK = (几成, 亮边浓度, 环宽占半径的比例, 0)；中心往外鼓、波前一圈推挤、薄薄一道亮边
uniform vec4 uDist[4]; uniform vec4 uDistK[4]; uniform int uNDist;
uniform vec3 uMul; uniform float uWarm; uniform float uDusk;
uniform vec4 uSense; uniform vec3 uSenseInk; uniform vec3 uSenseGlow; uniform float uSenseHide; uniform float uAlarm;
uniform vec4 uAtmoRect; uniform float uAtmoOn;
uniform vec4 uFog; uniform float uFogBands; uniform vec4 uFlash; uniform vec4 uTint;
// 撼山客第三批（hsmoves3）：uMono = (天地变黑白几成, 黑白闪几成, 0, 0)；uMonoKeep 留着颜色的几个人（屏幕设备像素 x、y、半径、是否启用）
uniform vec4 uMono; uniform vec4 uMonoKeep[3];
// r9：留色按人形本身（不是椭圆）：uMonoKeepW = (他脚下的世界 x, 脚底的绝对高度, 世界 y, 一人高)——场景深度还原出的点落在他这一处、离地在一人高以内、又不是地面，才算「他身上」
uniform vec4 uMonoKeepW[3]; uniform vec2 uMonoUp;   // 地面上「画面往上」的方向（three 的 x、z）：人物立板是朝镜头的竖片，他身上的点离他脚下只在横向上有偏移，纵深上几乎没有
// r8-p2：uMono.w 压黑几成（只剩人和火）；uMonoC = (整屏染成的颜色, 几成)
uniform vec4 uMonoC;
// r19：uMonoFx > 0.5 时压暗、压黑只压场景那一份（特效、泛光原样叠在上面）——夜无赦的暗底光刃（原来按整体亮度留光，橙色的刃边亮不过 0.9 就跟着地面一起黑掉，亮过的又把底下的地面一起留亮，一片米黄）
uniform float uMonoFx;
uniform float uVig, uHurt, uFade, uAberr, uBloomK, uGrain, uSat, uInk;
// 遁空：uWarp = (疾行强度, 起步爆发, 蓄势进度, 这一趟的秒数)；uWarpAt = (人物在屏幕上的位置 xy, 航向在屏幕上的方向 xy)
uniform vec4 uWarp; uniform vec4 uWarpAt; uniform vec3 uWarpColor;
// P2 光影：uHdr 世界层是半浮点（超过 1 的那一截当自发光）；uTone 色调映射；uLightTex / uLightOn 点光源的光照图；
// uGradeLo / uGradeHi 暗部 / 亮部的色偏，uGradeK = (反差, 饱和, 反差的支点, 是否启用)；
// uFogH = (距离雾密度, 雾底海拔, 随高度变淡的尺度, 最浓处)，uFogN = (主角身边多远以内不起雾, 0)，uEye 镜头位置，uHero 主角的地面坐标
uniform float uHdr, uTone, uLightOn, uInkDark; uniform sampler2D uLightTex;
uniform vec3 uGradeLo, uGradeHi; uniform vec4 uGradeK;
uniform vec4 uFogH; uniform vec2 uFogN; uniform vec3 uFogHColor, uEye; uniform vec2 uHero;
in vec2 vUv; out vec4 o;
// 色调映射：0.86 以下原样（水墨淡彩的中间调、暗部一点不动），以上用指数肩部压进 1 以内；
// 亮得越过头（法术芯、雷光）越往白里收——高光「亮过白」，而不是被一刀切平成色块
vec3 toneMap(vec3 c){ float m=max(max(c.r,c.g),c.b); if(m<=0.86) return c;
  float s=0.86+0.14*(1.0-exp(-(m-0.86)/0.14)); vec3 q=c*(s/m);
  return mix(q,vec3(s),smoothstep(1.15,3.2,m)*0.75); }

${GLSL_COMMON}
${GLSL_WATER}
${GLSL_SEA}
// uGWm：屏幕设备像素 → 世界的线性部分（经典 2D 为 uGWs 的对角阵；HD2D 倾斜 / 旋转相机时为逆仿射）
vec2 gUv(vec2 qq){ return (uGWo+uGWm*qq-uGC)*uGTpw/uGSize+0.5; }
vec3 groundAt(vec2 qq){
  vec2 w=uGWo+uGWm*qq; vec2 g=(w-uGC)*uGTpw/uGSize+0.5;
  vec4 A=texture(uGA,g); vec3 c=A.rgb;
  if(A.a>0.004){ vec4 B=texelFetch(uGB, ivec2(mod(floor(g*uGSize), uGSize)), 0); c=mix(c, waterAnim(c,B,w,uGWs,uWT), A.a); }
  return c;
}
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
vec3 softLight(vec3 b, vec3 s){
  vec3 d = mix(((16.0*b-12.0)*b+4.0)*b, sqrt(b), step(0.25,b));
  return mix(b-(1.0-2.0*s)*b*(1.0-b), b+(2.0*s-1.0)*(d-b), step(0.5,s));
}
vec4 sceneAt(vec2 uv){
  vec4 overlay=texture(uScene,uv);
  if(uWorldOn<0.5) return overlay;
  vec2 worldUv=vec2(uv.x,1.0-uv.y);
  vec4 world=texture(uWorld,worldUv);
  float radius=clamp((abs(viewDepth(texture(uWorldDepth,worldUv).r)-viewDepth(uFocus.x))-200.0)*0.001,0.0,0.8)*uDpr;
  if(radius>0.05){
    vec2 dx=vec2(radius/uRes.x,0.0), dy=vec2(0.0,radius/uRes.y);
    world=world*0.5+(texture(uWorld,worldUv+dx)+texture(uWorld,worldUv-dx)+texture(uWorld,worldUv+dy)+texture(uWorld,worldUv-dy))*0.125;
  }
  return overlay+world*(1.0-overlay.a);
}
vec3 worldAt(vec2 pixel){
  vec2 uv=vec2(pixel.x/uRes.x,1.0-pixel.y/uRes.y);
  float depth=texture(uGroundDepth,uv).r;
  vec4 world=uWorldInverse*vec4(uv*2.0-1.0,depth*2.0-1.0,1.0);
  return world.xyz/world.w;
}
// —— 遁空 ——
// 画面以航向前方的一点为心向外拉成流光（越靠边拉得越长），人物周围一圈保持清晰；光罩边缘把后面的景物挤歪（空间扭曲）
vec3 warpScene(vec2 q){
  vec2 pb=q-uWarpAt.xy; float db=length(pb)/uDpr+1e-3;
  q+=pb/(db*uDpr)*exp(-pow((db-96.0)/26.0,2.0))*16.0*uDpr*uWarp.x;
  vec2 V=uWarpAt.xy+uWarpAt.zw*0.62*max(uRes.x,uRes.y);
  vec2 rel=q-V; float r=length(rel)+1e-3; vec2 away=rel/r;
  float bubble=smoothstep(80.0,240.0,db);
  float len=(uWarp.x*34.0+uWarp.y*120.0)*uDpr*bubble*(0.3+0.7*smoothstep(0.0,0.6*uRes.x,r));
  vec3 acc=vec3(0.0); float ws=0.0;
  for(int i=0;i<7;i++){ float f=float(i)/6.0, w=1.0-f*0.72;
    acc+=sceneAt((q-away*len*f)/uRes).rgb*w; ws+=w; }
  return acc/ws;
}
// 叠在画面上的光。疾行：自前方放射的两层彗尾状光丝、前方的一团光、梭首的弧光、梭尾的长光、起步的一记爆闪；
// 蓄势：一圈圈向人物收拢的断续阵纹（各自转动）、四方汇聚的灵光丝、越来越亮的核心
vec3 warpLight(vec2 px){
  vec3 L=vec3(0.0);
  vec2 dir=uWarpAt.zw, perp=vec2(-dir.y,dir.x);
  vec2 pp=(px-uWarpAt.xy)/uDpr; float a=dot(pp,dir), b=dot(pp,perp), d=length(pp);
  vec3 hot=uWarpColor*0.6+0.4;
  if(uWarp.x>0.003){
    vec2 rel=(px-(uWarpAt.xy+dir*0.62*max(uRes.x,uRes.y)))/uDpr; float r=length(rel), th=atan(rel.y,rel.x);
    float clear=smoothstep(70.0,230.0,d)*smoothstep(50.0,380.0,r);
    for(int j=0;j<2;j++){
      float n=j==0?300.0:640.0, lf=th/6.2831853*n, lane=floor(lf), w=1.0-abs(fract(lf)-0.5)*2.0;
      float r1=h21(vec2(lane,7.3+float(j)*3.0)), r2=h21(vec2(lane,19.1+float(j)*5.0));
      float dash=fract(log(r+40.0)*(1.1+r1*0.9)-uWarp.w*(1.0+r2*1.8)+r1*9.0);
      float head=smoothstep(0.35,1.0,dash); head=head*head*head;
      L+=mix(uWarpColor,hot,head)*head*pow(w,j==0?2.5:1.5)*step(j==0?0.6:0.72,r2)*clear*(j==0?0.95:0.4)*uWarp.x;
    }
    L+=hot*(exp(-r/120.0)*0.9+exp(-r/460.0)*0.3)*uWarp.x;
    float front=smoothstep(0.15,0.95,a/max(d,1.0));
    L+=hot*exp(-pow((d-96.0)/5.0,2.0))*(0.05+0.8*front*(0.8+0.2*sin(uWarp.w*37.0)))*uWarp.x;
    L+=uWarpColor*exp(-pow((d-96.0)/20.0,2.0))*0.18*front*uWarp.x;
    float back=max(-a,0.0);
    float tail=(exp(-pow(b/(5.0+back*0.03),2.0))*0.9+exp(-pow(b/(16.0+back*0.07),2.0))*0.35)*smoothstep(10.0,70.0,back)*exp(-back/620.0);
    L+=mix(uWarpColor,hot,exp(-back/200.0))*tail*uWarp.x;
    L+=hot*uWarp.y*uWarp.y*(exp(-d/260.0)*0.9+0.12);
  }
  if(uWarp.z>0.003){
    float th=atan(pp.y,pp.x), z=uWarp.z;
    for(int i=0;i<3;i++){ float ph=fract(uWarp.w*0.75+float(i)/3.0); float R=mix(360.0,50.0,ph*ph);
      float arcs=0.06+0.94*smoothstep(0.1,0.6,sin(th*(5.0+float(i)*2.0)+uWarp.w*(i==1?-2.4:1.8)+float(i)*2.1)*0.5+0.5);
      L+=hot*exp(-pow((d-R)/(2.5+7.0*(1.0-ph)),2.0))*arcs*ph*0.7*z; }
    float lf=th/6.2831853*140.0, lane=floor(lf), w=1.0-abs(fract(lf)-0.5)*2.0;
    float r1=h21(vec2(lane,3.1)), r2=h21(vec2(lane,11.7));
    float dash=fract(-log(d+30.0)*1.8-uWarp.w*(1.2+r1*1.6)+r1*5.0);
    float head=smoothstep(0.4,1.0,dash); head=head*head*head;
    L+=mix(uWarpColor,hot,head)*head*pow(w,2.5)*step(0.55,r2)*smoothstep(46.0,110.0,d)*(1.0-smoothstep(300.0,620.0,d))*0.8*z;
    L+=hot*(exp(-d/34.0)*0.45+exp(-d/150.0)*0.16)*z*z;
  }
  return L;
}
void main(){
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y); // 设备像素，左上为原点
  vec2 q = px;
  // 冲击波：沿径向推挤画面
  for(int i=0;i<6;i++){ if(i>=uNShock) break; vec4 s=uShock[i]; vec2 d=q-s.xy; float L=length(d)+1e-3;
    float w=s.z*0.18+18.0*uDpr; float k=exp(-pow((L-s.z)/w,2.0)); q-=d/L*k*s.w; }
  float distRim=0.0;
  for(int i=0;i<4;i++){ if(i>=uNDist) break; vec4 s=uDist[i]; vec4 K=uDistK[i]; vec2 d=q-s.xy; float L=length(d)+1e-3;
    float w=max(6.0*uDpr, s.z*K.z); float u=(L-s.z)/w; float ring=exp(-u*u);
    float lens=L<s.z ? (1.0-L/s.z)*(L/s.z) : 0.0;   // 球里：往中心收（看着是鼓起来的透镜），波前一圈推挤
    q-=d/L*(ring*s.w + lens*s.w*1.6)*K.x;
    distRim+=exp(-u*u*9.0)*K.y*K.x; }
  vec2 uv = q/uRes;
  vec3 c;
  if(uGroundOn>0.5){
    // GPU 地表在下，Canvas 世界层（预乘 alpha）叠在上面
    if(uAberr>0.001){ vec2 off=(uv-0.5)*uAberr*0.012; vec4 a=sceneAt(uv+off), b=sceneAt(uv), d=sceneAt(uv-off);
      vec2 offq=off*uRes; vec3 g0=texture(uGA,gUv(q+offq)).rgb, g1=groundAt(q), g2=texture(uGA,gUv(q-offq)).rgb;
      c=vec3(a.r+g0.r*(1.0-a.a), b.g+g1.g*(1.0-b.a), d.b+g2.b*(1.0-d.a)); }
    else { vec4 sc=sceneAt(uv); c=sc.rgb+(sc.a<0.996?groundAt(q):vec3(0.0))*(1.0-sc.a); }
  }
  else if(uWarp.x+uWarp.y>0.003 && uWorldOn>0.5) c=warpScene(q);
  else if(uAberr>0.001){ vec2 off=(uv-0.5)*uAberr*0.012; c=vec3(sceneAt(uv+off).r, sceneAt(uv).g, sceneAt(uv-off).b); }
  else c=sceneAt(uv).rgb;
  // —— 绝域：海面按深入程度重新上色（只给露出的地面），再叠飓风雨带与鬼雾（gl/seaGlsl.ts）
  // r10：这一段占了整个后期着色器九成多的编译时间（显卡驱动冷编译十五到三十秒），平时用不上：只在带 FX_SEA 的那一份里编，到了绝域才现编（见 GLStage.postFor）
#ifdef FX_SEA
  if(uSeaA.z>0.5){ vec2 sw; float sg; float ov=texture(uScene,uv).a;
    if(uWorldOn>0.5){ vec2 wuv=vec2(uv.x,1.0-uv.y); float gd=texture(uGroundDepth,wuv).r; sw=worldAt(q).xz; sg=step(abs(texture(uWorldDepth,wuv).r-gd),1e-5)*step(gd,0.99999); }
    else { sw=uGWo+uGWm*q; sg=uGroundOn>0.5?1.0:0.0; }
    c=seaGround(c,sw,sg*(1.0-ov)); c=seaUnder(c,sw,q,sg*(1.0-ov)); c=seaSky(c,sw,q); }   // 收官 B3：海渊（水下的暗与光，gl/seaGlsl.ts）
#endif
  // —— 远山雾：沿视线越远越融进雾色；视距之外没有加载地面的地方整片是雾。uHaze = (起始距离, 全雾距离, 浓度, 0)
  if(uHaze.z>0.001 && uWorldOn>0.5){
    float hazeDepth=texture(uWorldDepth,vec2(uv.x,1.0-uv.y)).r;
    float hazeK=hazeDepth>=0.99999?1.0:smoothstep(uHaze.x,uHaze.y,viewDepth(hazeDepth));
    c=mix(c,uHazeColor,hazeK*uHaze.z);
  }
  vec2 fuv0=gl_FragCoord.xy/uRes;
  // —— P2：世界层里超过 1 的那一截是自发光（窗纸、灯笼的光），不跟着入夜压暗，压完再单独加回去
  vec3 emis=vec3(0.0);
  if(uHdr>0.5){ emis=min(max(c-1.0,0.0),vec3(4.0)); c=min(c,vec3(1.0)); }
  // —— P2：高度雾与距离雾。按场景深度还原出这一点的世界坐标：离镜头越远越浓，越低越浓（山谷、清晨的地面雾），
  // 用两层缓缓漂移的噪声打散成一缕一缕；主角身边一圈不起雾——只做点缀，不糊住近处和可玩的地方
  if(uFogH.w>0.001 && uWorldOn>0.5){
    vec2 wuv=vec2(uv.x,1.0-uv.y); float fdp=texture(uWorldDepth,wuv).r;
    if(fdp<0.99999){
      vec4 wp=uWorldInverse*vec4(wuv*2.0-1.0,fdp*2.0-1.0,1.0); vec3 fp=wp.xyz/wp.w;
      float fd=1.0-exp(-max(length(fp-uEye)-uFogN.x,0.0)*uFogH.x);
      float fh=exp(-max(fp.y-uFogH.y,0.0)/uFogH.z);
      float fn=texture(uNoise,fp.xz/5200.0+vec2(uT*0.004,uT*0.0025)).g*0.9+texture(uNoise,fp.xz/1700.0-uT*0.006).b*0.6;
      float clearK=smoothstep(uFogN.x*0.3,uFogN.x*0.85,length(fp.xz-uHero));
      c=mix(c,uFogHColor,clamp(fd*fh*(0.3+fn),0.0,1.0)*uFogH.w*clearK);
    }
  }
  // —— 昼夜调色（P2：再乘上点光源的光照——夜里灯照到的地方按原本的颜色亮起来）
  // 返工：几盏光叠在一起会把半屏烧成一片黄白——叠加后的总光照软封顶（小时近似原值，越多越收，最多约 1.5）
  if(uLightOn>0.5){ vec3 Lt=texture(uLightTex,fuv0).rgb; c *= uMul+Lt*1.25/(1.0+Lt*0.8); }
  else c *= uMul;
  if(uWarm>0.001) c = mix(c, softLight(c, vec3(1.0,0.925,0.77)), uWarm);
  if(uDusk>0.001){ float g=clamp((uv.x+uv.y*0.6)/1.6,0.0,1.0);
    vec3 dc = mix(vec3(1.0,0.667,0.314), vec3(1.0,0.47,0.35), g); float da=mix(0.75,0.2,g)*uDusk;
    c = mix(c, softLight(c, dc), da);
    float sd = length((uv-vec2(0.1,-0.1))*vec2(uRes.x/max(uRes.x,uRes.y),uRes.y/max(uRes.x,uRes.y)))/1.1;
    vec3 sc = vec3(1.0,0.667,0.353)*0.3*uDusk*clamp(1.0-sd,0.0,1.0); c = 1.0-(1.0-c)*(1.0-sc); }
  // —— P2：时辰的层次（分色调）：暗部、亮部各偏一个色——清晨亮部金、暗部微冷；正午清透；黄昏亮部橙、暗部偏紫；
  // 夜里暗部蓝黑、亮部带月光的银青。亮度按压暗之前的算，夜里也分得出明暗两头；再按时辰略加反差、调饱和
  if(uGradeK.w>0.5){
    float gl0=dot(c,vec3(0.299,0.587,0.114))/max(dot(uMul,vec3(0.333)),0.2);
    c*=mix(uGradeLo,uGradeHi,smoothstep(0.06,0.85,gl0));
    c=max(vec3(0.0),(c-uGradeK.z)*uGradeK.x+uGradeK.z);
    float gl1=dot(c,vec3(0.299,0.587,0.114)); c=max(vec3(0.0),mix(vec3(gl1),c,uGradeK.y));
  }
  c+=emis;
  // —— 神识圈外：记忆水墨（灰、淡、留白，边缘晕染流动）
  if(uSense.w>0.5){
    vec2 dp=uWorldOn>0.5?(worldAt(px).xz-uSenseWorld)*uWorldZoom: px-uSense.xy; float dist=length(dp); float R=max(uSense.z,1.0);
    float ang=atan(dp.y,dp.x);
    // 边缘起伏只与角度有关：整数倍频的正弦叠加，首尾无缝且极省
    float n=0.5*sin(3.0*ang+uT*0.21)+0.3*sin(7.0*ang-uT*0.33+1.7)+0.2*sin(13.0*ang+uT*0.47+0.6)+0.12*sin(23.0*ang-uT*0.61);
    float edge=R*(1.0+n*0.028);
    float soft=R*0.055+6.0*uDpr;
    float m=smoothstep(edge-soft*0.5, edge+soft, dist);
    if(m>0.001){
      // 夜里：画面已按昼夜压暗（c *= uMul），记忆水墨的纸色和墨色也跟着压暗，明暗按压暗之前的亮度取——
      // 否则神识圈外蒙一层白纸色，夜景整片发灰、看不清
      vec3 dim=max(uMul,vec3(0.05));
      float lum=clamp(dot(c/dim,vec3(0.299,0.587,0.114)),0.0,1.0);
      vec3 paper=vec3(0.925,0.895,0.82)*uMul;
      // P2：新光影下夜里圈外的纸色再压一截（入夜越深压得越多）——不然圈外一片灰白，夜景发闷（P10 遗留的「夜里圈外蒙一层灰白」）
      if(uInkDark>0.5) paper*=mix(1.0,dot(uMul,vec3(0.333)),0.6);
      float ink=pow(1.0-lum,1.25);
      vec3 mem=mix(paper, vec3(0.20,0.20,0.19)*uMul, ink*0.78);
      float fib=texture(uNoise, px/uDpr*vec2(0.004,0.016)).r;
      mem-=fib*0.035*dot(uMul,vec3(0.333));
      c=mix(c, mem, m*(1.0-uSat));
    }
    float bd=abs(dist-edge);
    if(bd<soft*3.0){
      // 晕染墨丝：紧贴边缘外侧缓缓流动
      float band=exp(-pow((dist-edge-soft*0.35)/(soft*0.55),2.0));
      float fil=texture(uNoise, vec2(ang*1.43, dist/R*1.2-uT*0.04)).g;
      float inkA=band*smoothstep(0.45,0.8,fil)*0.42*(1.0-uSenseHide*0.6);
      c=mix(c, uSenseInk*0.55, inkA);
      // 圈内边缘一抹灵光（随时间呼吸）
      float inner=exp(-pow((dist-edge+soft*0.9)/(soft*1.2),2.0))*(1.0-m);
      c+=uSenseGlow*inner*(0.07+0.03*sin(uT*1.3))*(1.0-uSenseHide*0.7);
      if(uAlarm>0.001){ float ab=exp(-pow((dist-edge)/(soft*1.6),2.0)); c=mix(c, vec3(0.75,0.12,0.08), ab*uAlarm*(0.5+0.5*sin(uT*12.0))*0.6); }
    }
  }
  // —— 云影 / 未探索迷雾（低分辨率层）
  if(uAtmoOn>0.5){ vec2 at=uWorldOn>0.5?worldAt(px).xz:px; vec2 au=(at-uAtmoRect.xy)/uAtmoRect.zw; vec4 a=texture(uAtmo,au); c=c*(1.0-a.a)+a.rgb; }
  // —— 天气
  if(uFogBands>0.001){ float b=0.0; for(int i=0;i<4;i++){ float y=0.2+float(i)*0.22+sin(uT*0.1+float(i))*0.02; b+=exp(-pow((uv.y-y)/0.12,2.0)); }
    float nn=texture(uNoise, vec2(uv.x*0.6+uT*0.006, uv.y*1.2)).b; c=mix(c, vec3(0.925,0.925,0.9), clamp(b*0.32*uFogBands*(0.6+nn*0.8),0.0,1.0)); }
  c=mix(c, uFog.rgb, uFog.a);
  c=mix(c, uTint.rgb, uTint.a);
  // 遁空：蓄势时天地渐暗，疾行时压成一片暗青，光才衬得出来
  { float wk=max(uWarp.x,uWarp.z*0.8); if(wk>0.003){ float lum=dot(c,vec3(0.3,0.59,0.11)); c=mix(c, mix(vec3(lum),c,0.55)*vec3(0.34,0.46,0.62), wk*0.85); } }
  // —— 绝域：视野收拢（外圈墨雾，中间清楚）、落雷的白光；在特效之前，裂缝和雷光照样看得见
  if(uSeaA.z>0.5){ c=seaShroud(c,px); c=mix(c,vec3(0.86,0.9,1.0),uSeaC.w*0.4); }
  // —— 特效与泛光（不受夜色压暗）
  vec3 cS=c;   // r19：叠特效之前的场景色（uMonoFx 用）
  vec2 fuv=gl_FragCoord.xy/uRes;
  vec4 fx=texture(uFx,fuv);
  // 柔和压高光：保留色相，避免叠加发白成团
  float mx=max(max(fx.r,fx.g),fx.b);
  // 有色调映射时压得轻一些：法术的芯可以亮过白，最后交给 toneMap 往白里收
  vec3 fr=fx.rgb/(1.0+max(mx-0.75,0.0)*(uTone>0.5?0.4:0.9));
  c=c*(1.0-clamp(fx.a,0.0,1.0))+fr;
  vec3 bl=texture(uB1,fuv).rgb*0.6+texture(uB2,fuv).rgb*0.7;
  c+=bl*uBloomK;
  if(uWarp.x+uWarp.z>0.003) c+=warpLight(px);
  c=mix(c, uFlash.rgb, uFlash.a);
  // —— 撼山客「无极一击」蓄力：天地变黑白，只有他和对手留着颜色；重击那一两帧的黑白闪（IMPACT：第一批的共用效果，合并时换）
  if(uMono.x+uMono.y+uMono.z+uMono.w+uMonoC.a>0.001){
    float lum=dot(c,vec3(0.299,0.587,0.114)), keep=0.0;
    if(uWorldOn>0.5){
      // r9：人形遮罩——这一像素的场景深度（含人物立板）还原成世界坐标；不是地面、离他脚下水平不远、高度在他身上那一截，就是他
      vec2 kuv=vec2(px.x/uRes.x,1.0-px.y/uRes.y); float kd=texture(uWorldDepth,kuv).r, kg=texture(uGroundDepth,kuv).r;
      float fig=step(2e-5,abs(kd-kg))*step(kd,0.99999);
      if(fig>0.5){ vec4 kw4=uWorldInverse*vec4(kuv*2.0-1.0,kd*2.0-1.0,1.0); vec3 kw=kw4.xyz/kw4.w;
        for(int i=0;i<3;i++){ vec4 K=uMonoKeep[i], Q=uMonoKeepW[i]; if(K.w>0.5){ vec2 dd=kw.xz-Q.xz; float dz=abs(dot(dd,uMonoUp)), dx=abs(dot(dd,vec2(-uMonoUp.y,uMonoUp.x))), hh=kw.y-Q.y; keep=max(keep,(1.0-smoothstep(Q.w*0.45,Q.w*0.65,dx))*(1.0-smoothstep(Q.w*0.18,Q.w*0.3,dz))*step(-Q.w*0.12,hh)*(1.0-smoothstep(Q.w*1.15,Q.w*1.35,hh))); } } }
    } else {
      for(int i=0;i<3;i++){ vec4 K=uMonoKeep[i]; if(K.w>0.5){ vec2 d=(px-K.xy)/vec2(K.z,K.z*1.5); keep=max(keep,1.0-smoothstep(0.55,1.0,length(d))); } }
    }
    c=mix(c, vec3(pow(lum,1.1))*vec3(1.03,1.0,0.94), uMono.x*(1.0-keep));
    if(uMono.y>0.001){ float l2=clamp((lum-0.42)*2.2+0.5,0.0,1.0); c=mix(c, mix(vec3(0.07,0.06,0.055),vec3(0.96,0.94,0.89),l2*l2*(3.0-2.0*l2)), uMono.y*0.85); }   // 黑白闪：去色、拉开反差（不是整屏翻黑翻白）
    // r8-p2：整屏压暗（蓄力最后那一下、终结技命中、千钧坠高空顿住）——背景暗下去、偏一点冷色；留着的人、发光的特效（亮过 1 的）不压、还亮一截。不再是整屏一片灰
    float glow=smoothstep(0.9,1.6,lum), bg=(1.0-keep)*(1.0-glow);
    if(uMonoFx>0.5){   // r19：只压场景那一份
      vec3 sp=cS*(1.0-clamp(fx.a,0.0,1.0)), fp=max(c-sp,vec3(0.0)); float bgS=1.0-keep;
      if(uMono.z>0.001){ float vg=0.75+0.25*smoothstep(0.15,0.95,length((px/uRes-0.5)*vec2(1.0,0.75))*1.6); sp=mix(sp, sp*vec3(0.2,0.21,0.28), uMono.z*0.88*bgS*vg); sp*=1.0+0.22*uMono.z*keep; }
      if(uMono.w>0.001) sp=mix(sp, sp*vec3(0.03,0.025,0.035), uMono.w*bgS);
      c=sp+fp; bg=0.0;
    }
    if(uMono.z>0.001&&uMonoFx<0.5){ float vg=0.75+0.25*smoothstep(0.15,0.95,length((px/uRes-0.5)*vec2(1.0,0.75))*1.6); c=mix(c, c*vec3(0.2,0.21,0.28), uMono.z*0.88*bg*vg); c*=1.0+0.22*uMono.z*keep; }
    // r8-p2：压黑（逐日：画面整个黑下去，只剩人和火）
    float bg2=uMonoFx>0.5?0.0:(1.0-keep)*(1.0-glow);   // r9：留色只在人形上（遮罩贴着人），人身上不压   // 压黑 / 变色：人身边也压一半（只留人和火亮着——留色的椭圆整个不压会露出一圈原来的地面）
    if(uMono.w>0.001) c=mix(c, c*vec3(0.03,0.025,0.035), uMono.w*bg2);
    // r8-p2：整屏变色（霸皇蹴整屏变红、逐日每一下一个颜色）：按亮度染成这一色，亮处往白里走
    if(uMonoC.a>0.001){ float l3=dot(c,vec3(0.299,0.587,0.114)); vec3 w=uMonoC.rgb*(0.18+1.5*l3)+vec3(max(0.0,l3-0.75)*1.4); c=mix(c, w, uMonoC.a*(1.0-0.75*keep)); }
  }
  c+=vec3(1.0,0.97,0.9)*distRim;   // r7-fx3d：扭曲冲击波的一道薄亮边
  if(uTone>0.5) c=toneMap(c);
  // —— 纸纹、暗角、血晕、黑场
  float gr=h21(floor(px/uDpr*0.7));
  c*=1.0-uGrain*(gr*gr)*0.12;
  vec2 vv=(uv-0.5)*vec2(1.0, uRes.y/uRes.x)*1.0; float vd=length((uv-0.5)*1.25);
  float vig=smoothstep(0.42,0.95,vd);
  c=mix(c, vec3(0.157,0.118,0.078), vig*0.30*uVig);
  if(uHurt>0.001) c=mix(c, vec3(0.47,0.04,0.04), smoothstep(0.3,0.95,vd)*uHurt);
  c*=1.0-0.45*max(uWarp.x,uWarp.z*0.6)*smoothstep(0.3,0.95,vd);
  c=mix(c, vec3(0.04,0.031,0.024), uFade);
  // r7 黑白闪（重击命中那一两帧）：亮处成墨、暗处成纸——整屏黑白反相，是画面风格不是遮幕
  if(uInk>0.001){ float il=dot(c,vec3(0.299,0.587,0.114)); float iv=1.0-smoothstep(0.34,0.47,il);   // r8-p2：阈值收窄（原来中间调一大片成了灰）
  c=mix(c, mix(vec3(0.06,0.05,0.045), vec3(0.97,0.94,0.87), iv), uInk); }
  c+=(h21(px+vec2(17.0,41.0))-0.5)/255.0;   // r15-touchctl：逐像素 ±半级灰阶的抖动（看不出颗粒），设置里关了「画面颗粒」（uGrain=0）后暗角、雾的渐变也不出色带
  o=vec4(c,1.0);
}`;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const mk = (t: number, s: string) => { const sh = gl.createShader(t)!; gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader'); return sh; };
  // r10：加载画面里已经在后台编好的，直接认领
  let p = takeProgram(gl, vs, fs);
  if (!p) {
    p = gl.createProgram()!;
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  }
  const U = new Map<string, WebGLUniformLocation | null>();
  return { p, u: (n: string) => { if (!U.has(n)) U.set(n, gl.getUniformLocation(p, n)); return U.get(n)!; } };
}
type Prog = ReturnType<typeof compile>;
const GL_ATTRS: WebGLContextAttributes = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
/** r10：带绝域海面那一段的后期着色器（只在到了绝域时才编） */
const FS_POST_SEA = FS_POST.replace('#version 300 es\n', '#version 300 es\n#define FX_SEA\n');
/** r10：init() 里要编的全部程序（加载画面里提前并行编；源码要和 init 里的一模一样才认领得上） */
export const STAGE_PROGRAMS: [string, string][] = [[VS_SPRITE, FS_SPRITE], [VS_SPRITE, FS_DECAL], [VS_FULL, FS_POST], [VS_FULL, FS_DOWN], [VS_FULL, FS_BLUR], [VS_FULL, FS_BLACK], [VS_FULL, FS_DOWN_EM], [VS_LIGHT, FS_LIGHT]];

interface Target { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number }
export interface WorldTarget extends Target { depth: WebGLTexture; groundDepth: WebGLTexture; groundFb: WebGLFramebuffer }

export interface PostParams {
  t: number;
  mul: [number, number, number]; warm: number; dusk: number;
  sense: { x: number; y: number; R: number; on: boolean; ink: [number, number, number]; glow: [number, number, number]; hide: number; alarm: number };
  atmo: { canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number } | null;
  fog: [number, number, number, number]; fogBands: number; flash: [number, number, number, number]; tint: [number, number, number, number];
  vig: number; hurt: number; fade: number; aberr: number; bloom: number; grain: number;
  shocks: { x: number; y: number; r: number; amp: number }[];
  sat: number; // 1 = 圈外也不褪色（调试全图）
  /** r7 黑白闪（0 / 1，world/impactfx.ts 的 inkK）：整屏黑白反相 */
  ink?: number;
  /** 远山雾：从 start 起渐浓，到 end 全是雾色（距离按沿视线的世界单位） */
  haze?: { start: number; end: number; strength: number; color: readonly [number, number, number] };
  /** 遁空：k 疾行强度、burst 起步爆发、spool 蓄势进度（都是 0..1）；t 这一趟的秒数；x、y 人物的屏幕位置；dx、dy 航向在屏幕上的方向 */
  warp?: { k: number; burst: number; spool: number; t: number; x: number; y: number; dx: number; dy: number; color: readonly [number, number, number] };
  /** 撼山客第三批：天地变黑白（k）、黑白闪（flash）、天色压暗（dim，r7-fx3d）、留着颜色的人（屏幕 CSS 像素 x、y、半径） */
  mono?: { k: number; flash: number; dim?: number; black?: number; wash?: [number, number, number, number]; keep: [number, number, number][]; keepW?: [number, number, number, number][]; up?: [number, number]; fxKeep?: number } | null;
  /** r7-fx3d：空间扭曲冲击波（屏幕 CSS 像素：x、y、波前半径 r、推多少像素 amp；k 几成、rim 亮边浓度、w 环宽占半径的比例） */
  dist?: { x: number; y: number; r: number; amp: number; k: number; rim: number; w: number }[] | null;
  /** 绝域的海况（world/jueyu.ts 的 post）：没在险地里是 null */
  sea?: SeaPost | null;
  ground?: { view: GroundView; provider: SegProvider } | null;
  world?: WorldTarget | null;
  worldCamera?: { inverse: Float32Array; x: number; y: number; zoom: number; focusDepth: number; depthRange: number; near?: number; far?: number; perspective?: boolean;
    /** P2：视图投影矩阵（列主序）、投影矩阵的 [0][0] 与 [1][1]、镜头位置（three 坐标），点光源和高度雾用 */
    viewProj?: Float32Array; projScale?: readonly [number, number]; eye?: readonly [number, number, number] };
  /** P2：世界层里超过 1 的算自发光、最后做色调映射（世界层是半浮点时才开） */
  hdr?: boolean;
  /** P2：夜里神识圈外的纸色要不要再压一截（绝域里关：那里神识常常受扰，圈外一压，鬼船、海面全黑了） */
  inkDark?: boolean;
  /** P2：这一帧的点光源（hd2d/lights.ts 的 LightList：每盏 8 个数） */
  lights?: { data: Float32Array; n: number } | null;
  /** P2：时辰的分色调 —— 暗部 / 亮部的色偏、反差、饱和 */
  grade?: { lo: readonly [number, number, number]; hi: readonly [number, number, number]; contrast: number; sat: number; pivot: number } | null;
  /** P2：高度雾与距离雾（只做点缀）：density 距离雾密度、base 雾底海拔、falloff 随高度变淡的尺度、max 最浓处、near 主角身边多远以内不起雾 */
  heightFog?: { density: number; base: number; falloff: number; max: number; near: number; color: readonly [number, number, number] } | null;
}

export class GLStage {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  batch = new Batch();
  atlas!: WebGLTexture;
  private sprite!: Prog; private decal!: Prog; private post!: Prog; private down!: Prog; private blur!: Prog; private black!: Prog;
  /** P2：带世界层自发光的降采样、点光源 */
  private downEm!: Prog; private light!: Prog;
  private lightVao: WebGLVertexArrayObject | null = null; private lightBuf: WebGLBuffer | null = null;
  /** P2：半分辨率的光照图（只在支持半浮点渲染目标时建） */
  private lt: Target | null = null;
  /** P2：世界层要不要用半浮点（设备不支持时自动退回 8 位，画法和以前一样）；渲染器按画质档设 */
  hdrWorld = true;
  /** 当前世界层是不是真的半浮点（后期据此决定开不开自发光与色调映射） */
  get worldIsHdr() { return !!this.world && this.worldHdr; }
  private worldHdr = false;
  private vbo!: WebGLBuffer; private vao!: WebGLVertexArrayObject; private emptyVao!: WebGLVertexArrayObject;
  private noiseTex!: WebGLTexture;
  private seaMaskTex: WebGLTexture | null = null;
  private sceneTex!: WebGLTexture; private atmoTex!: WebGLTexture;
  /** 世界层是否为预乘 alpha（GPU 地表开启时是） */
  private groundLoTex = false;
  private sceneW = 0; private sceneH = 0; private atmoW = 0; private atmoH = 0;
  /** 世界层 / 氛围层是否已经有内容（首帧不能沿用「空纹理」，否则画面全黑或全白） */
  private sceneUp = false; private atmoUp = false;
  private sceneMipDirty = false;
  private fx: Target | null = null; private h1: Target | null = null; private q1: Target | null = null; private q2: Target | null = null; private e1: Target | null = null; private e2: Target | null = null;
  private half = false;
  private world: WorldTarget | null = null;
  W = 0; H = 0; // 设备像素
  lost = false;
  bloomOn = true;
  /** 泛光层数：3 = 1/2→1/4→1/8（三次降采样 + 四次模糊）；2 = 去掉 1/8 那级（少 3 个全屏 pass） */
  bloomLevels = 3;
  private texCache = new WeakMap<HTMLCanvasElement, WebGLTexture>();
  ground: Ground | null = null; private maxTex = 4096; private groundData: GroundTerrain | null = null;
  drawCalls = 0;
  private vboSize = 0;
  /** GPU 计时（仅 F3 面板打开时）：EXT_disjoint_timer_query_webgl2，分段（地表 / 世界层上传 / 特效泛光 / 后期），结果延迟几帧可读 */
  gpuTiming = false; gpuMs = 0;
  gpuSec: Record<string, number> = {};
  /** 地表纹素数（每帧平均，供 F3 报告） */
  groundTexels = 0;
  private tq: { ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null; pend: { q: WebGLQuery; k: string }[][]; cur: { q: WebGLQuery; k: string }[] | null; tried: boolean } = { ext: null, pend: [], cur: null, tried: false };
  private gpuBegin() {
    if (!this.gpuTiming) return false;
    const gl = this.gl, T = this.tq;
    if (!T.tried) { T.tried = true; T.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as typeof T.ext; }
    if (!T.ext) return false;
    // 读取已完成的整帧查询组
    while (T.pend.length && T.pend[0].every((x) => gl.getQueryParameter(x.q, gl.QUERY_RESULT_AVAILABLE))) {
      const set = T.pend.shift()!;
      const ok = !gl.getParameter(T.ext.GPU_DISJOINT_EXT);
      let tot = 0;
      for (const x of set) {
        const ms = (gl.getQueryParameter(x.q, gl.QUERY_RESULT) as number) / 1e6; gl.deleteQuery(x.q);
        if (!ok) continue;
        tot += ms; this.gpuSec[x.k] = (this.gpuSec[x.k] ?? ms) + (ms - (this.gpuSec[x.k] ?? ms)) * 0.2;
      }
      if (ok) this.gpuMs += (tot - this.gpuMs) * 0.2;
    }
    if (T.pend.length > 4) return false;
    T.cur = [];
    return true;
  }
  private gpuMark(k: string) {
    const T = this.tq; if (!T.cur || !T.ext) return;
    const gl = this.gl;
    if (T.cur.length) gl.endQuery(T.ext.TIME_ELAPSED_EXT);
    const q = gl.createQuery()!; gl.beginQuery(T.ext.TIME_ELAPSED_EXT, q); T.cur.push({ q, k });
  }
  private gpuEnd() {
    const T = this.tq; if (!T.cur || !T.ext) return;
    if (T.cur.length) { this.gl.endQuery(T.ext.TIME_ELAPSED_EXT); T.pend.push(T.cur); }
    T.cur = null;
  }

  static create(): GLStage | null {
    try {
      // r10：加载画面里已经建好上下文、编好着色器的，直接用
      const pre = GLStage.pre; GLStage.pre = null; GLStage.preparing = null; GLStage.gen++;   // 还没编完的那一份作废（编完时自己释放）
      if (pre && !pre.gl.isContextLost()) return new GLStage(pre.cv, pre.gl);
      const cv = document.createElement('canvas');
      const gl = cv.getContext('webgl2', GL_ATTRS);
      if (!gl) return null;
      return new GLStage(cv, gl);
    } catch (e) { console.warn('WebGL2 不可用，回退 Canvas2D', e); return null; }
  }
  private static pre: { cv: HTMLCanvasElement; gl: WebGL2RenderingContext } | null = null;
  private static preparing: Promise<boolean> | null = null;
  private static gen = 0;
  /** 提前编译的进度：编好几个 / 一共几个（加载画面的进度条用） */
  static prepProgress = { done: 0, total: 0 };
  private static prepListeners = new Set<(done: number, total: number) => void>();
  /** r10：在加载画面里提前建上下文、把全部着色器发出去并行编译，每 50 毫秒问一次编好没有（不阻塞主线程，加载动画照常走）。
   *  onWait：每问一次回调「编好几个、一共几个」。返回 true = 编好了；false = 浏览器不支持并行编译 / 没有 WebGL2（进游戏时照旧同步编） */
  static prepare(onWait?: (done: number, total: number) => void): Promise<boolean> {
    if (onWait) GLStage.prepListeners.add(onWait);
    if (GLStage.preparing) return GLStage.preparing.finally(() => { if (onWait) GLStage.prepListeners.delete(onWait); });
    const gen = GLStage.gen;
    GLStage.preparing = (async () => {
      let cv: HTMLCanvasElement, gl: WebGL2RenderingContext | null;
      try { cv = document.createElement('canvas'); gl = cv.getContext('webgl2', GL_ATTRS); } catch { return false; }
      if (!gl) return false;
      const keep = () => { if (gen === GLStage.gen) GLStage.pre = { cv, gl: gl! }; else gl!.getExtension('WEBGL_lose_context')?.loseContext(); };
      if (!gl.getExtension('KHR_parallel_shader_compile')) { keep(); return false; }
      // 一个编完再发下一个（一齐发出去时显卡进程里几个编译抢在一起，合成器跟着顿，加载动画会停一两秒）
      const srcs = [...STAGE_PROGRAMS, GROUND_PROGRAM, BAKE_PROGRAM];
      const P = GLStage.prepProgress; P.total = srcs.length; P.done = 0;
      const tell = () => GLStage.prepListeners.forEach((f) => f(P.done, P.total));
      tell();
      for (const [vs, fs] of srcs) {
        const job = startProgram(gl, vs, fs); gl.flush();
        while (programsDone(gl, [job]) < 1 && !gl.isContextLost() && gen === GLStage.gen) await new Promise((r) => setTimeout(r, 30));
        if (gl.isContextLost() || gen !== GLStage.gen) break;
        P.done++; tell();
      }
      keep();
      return gen === GLStage.gen && !gl.isContextLost();
    })().catch(() => false);
    const mine = GLStage.preparing;
    return mine.finally(() => { if (onWait) GLStage.prepListeners.delete(onWait); });
  }

  /** 显卡名（F3 面板显示）：一眼看出到底用没用到独显，还是退成了软件渲染 */
  gpuName = '';
  /** 是否软件光栅化（SwiftShader / llvmpipe / Basic Render）——这种状态下怎么调画质都卡 */
  softGPU = false;

  constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.canvas = canvas; this.gl = gl;
    try {
      const e = gl.getExtension('WEBGL_debug_renderer_info');
      this.gpuName = String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : (gl.getParameter(gl.RENDERER) || ''));
      this.softGPU = /swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(this.gpuName);
    } catch { /* 隐私模式下拿不到 */ }
    this.half = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    this.init();
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    // 上下文恢复：旧缓冲随旧上下文作废（不能再 delete），置空后按当前尺寸重建后期缓冲——否则 fx 一直为空，世界层永远黑屏
    canvas.addEventListener('webglcontextrestored', () => {
      this.texCache = new WeakMap(); this.fx = this.h1 = this.q1 = this.q2 = this.e1 = this.e2 = this.lt = null; this.world = null; this.sceneW = 0; this.atmoW = 0;
      this.init(); this.resize(this.W || canvas.width, this.H || canvas.height); this.lost = false;
    });
  }

  private postSea: Prog | null = null;
  private seaJob: ReturnType<typeof startProgram> | null = null;
  /** r10：后期合成用哪一份：平时用不带绝域海面那段的（编得快）；要海面时用带的那份——还没编好就发出去后台并行编，
   *  这几帧照常用不带的（海色晚一会儿才出来，画面不卡）；浏览器不支持并行编译就当场同步编（和以前一样） */
  private postFor(sea: boolean): Prog {
    // 连着要海面满 0.8 秒才算数：开局头几帧绝域会按初始值误报「在海里」（以前无所谓，现在会白白开编一份冷编要十几二十秒、
    // 编的时候连加载动画都卡的着色器）。真到了绝域，海色晚这一下出来看不出
    if (!sea) { this.seaSince = 0; return this.post; }
    if (this.postSea) return this.postSea;
    const now = performance.now(); if (!this.seaSince) this.seaSince = now;
    if (now - this.seaSince < 800) return this.post;
    const gl = this.gl;
    try {
      if (!gl.getExtension('KHR_parallel_shader_compile')) return (this.postSea = compile(gl, VS_FULL, FS_POST_SEA));
      this.seaJob ??= startProgram(gl, VS_FULL, FS_POST_SEA);
      if (programsDone(gl, [this.seaJob]) < 1) return this.post;
      this.seaJob = null;
      return (this.postSea = compile(gl, VS_FULL, FS_POST_SEA));
    } catch (e) { console.warn('绝域海面着色器编不了，海面不重新上色', e); this.seaJob = null; return (this.postSea = this.post); }
  }
  private seaSince = 0;
  /** 眼下要海面、那一份还在后台编（加载画面据此多盖一会儿） */
  get busy() { return !!this.seaJob && this.seaSince > 0; }

  private init() {
    const gl = this.gl;
    this.postSea = null; this.seaJob = null;
    this.sprite = compile(gl, VS_SPRITE, FS_SPRITE);
    this.decal = compile(gl, VS_SPRITE, FS_DECAL);
    this.post = compile(gl, VS_FULL, FS_POST);
    this.down = compile(gl, VS_FULL, FS_DOWN);
    this.blur = compile(gl, VS_FULL, FS_BLUR);
    this.black = compile(gl, VS_FULL, FS_BLACK);
    this.downEm = compile(gl, VS_FULL, FS_DOWN_EM);
    this.light = compile(gl, VS_LIGHT, FS_LIGHT);
    // 点光源：一个方片（两个三角形）× 每盏一份实例数据（位置、半径、颜色、强度）
    this.lightVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.lightVao);
    const corner = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, corner);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    this.lightBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lightBuf);
    gl.bufferData(gl.ARRAY_BUFFER, 192 * 32, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
    this.vbo = gl.createBuffer()!;
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.batch.data.byteLength, gl.DYNAMIC_DRAW);
    this.vboSize = this.batch.data.byteLength;
    const st = FLOATS * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, st, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, st, 16);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, st, 32);
    this.emptyVao = gl.createVertexArray()!;
    gl.bindVertexArray(null);
    // 世界层纹理不带 mipmap：后期是 1:1 全屏采样（uv 由设备像素直接算出），mipmap 一次都用不上，
    // 而每帧 generateMipmap 一张几千万像素的纹理要重新生成整条 mip 链，是白白烧掉的一整块 GPU 时间。
    this.sceneTex = this.newTex(gl.LINEAR, false);
    this.atmoTex = this.newTex(gl.LINEAR);
    const acv = buildAtlas((cv) => this.reuploadAtlas(cv));
    this.atlas = this.uploadStatic(acv, true);
    bakeFx(gl);   // 第三十五步：程序特效贴图
    this.noiseTex = this.makeNoise();
    this.seaMaskTex = null;   // 绝域的水遮罩：新上下文里重建
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    try { this.ground = new Ground(gl); if (this.groundData) this.ground.setTerrain(this.groundData); }
    catch (e) { console.warn('GPU 地表不可用，回退分块底图', e); this.ground = null; }
  }
  /** 交给 GPU 地表的宏观地形（只需一次） */
  setTerrain(T: GroundTerrain) { this.groundData = T; this.ground?.setTerrain(T); }
  get groundReady() { return !!this.ground && this.ground.ready && !this.lost; }

  /** 可平铺的值噪声（三通道不同频率），供纸纹、墨丝、雾使用 */
  private makeNoise() {
    const gl = this.gl, N = 256;
    const d = new Uint8Array(N * N * 4);
    const oct = (seed: number, base: number) => {
      const grid = (g: number) => { const a = new Float32Array(g * g); let s = seed; for (let i = 0; i < a.length; i++) { s = (s * 16807) % 2147483647; a[i] = s / 2147483647; } return a; };
      const layers = [base, base * 2, base * 4, base * 8].map((g) => ({ g, v: grid(g) }));
      return (x: number, y: number) => {
        let sum = 0, amp = 0.5, tot = 0;
        for (const L of layers) {
          const fx = x / N * L.g, fy = y / N * L.g, ix = Math.floor(fx), iy = Math.floor(fy);
          const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
          const at = (i: number, j: number) => L.v[((j % L.g) + L.g) % L.g * L.g + ((i % L.g) + L.g) % L.g];
          const v = (at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy;
          sum += v * amp; tot += amp; amp *= 0.5;
        }
        return sum / tot;
      };
    };
    const r = oct(11, 8), g = oct(23, 6), b = oct(37, 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      d[i] = r(x, y) * 255; d[i + 1] = g(x, y) * 255; d[i + 2] = b(x, y) * 255; d[i + 3] = 255;
    }
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return t;
  }

  private newTex(filter: number, mip = false) {
    const gl = this.gl, t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  /** 上传静态位图（带 mipmap，旋转缩放都平滑），按画布对象缓存 */
  /** 第三十四步：CC0 贴图行载入后重新上传图集 */
  private reuploadAtlas(cv: HTMLCanvasElement) {
    if (this.lost) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
  uploadStatic(cv: HTMLCanvasElement, mip = true): WebGLTexture {
    const hit = this.texCache.get(cv); if (hit) return hit;
    const gl = this.gl;
    const t = this.newTex(mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    const an = gl.getExtension('EXT_texture_filter_anisotropic');
    if (an && mip) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, 4);
    this.texCache.set(cv, t);
    return t;
  }

  private target(w: number, h: number, hdr: boolean): Target {
    const gl = this.gl;
    const tex = this.newTex(gl.LINEAR);
    if (hdr && this.half) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE && hdr && this.half) {
      this.half = false; gl.deleteFramebuffer(fb); gl.deleteTexture(tex); return this.target(w, h, false);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex, w, h };
  }
  private free(t: Target | null) { if (!t) return; this.gl.deleteFramebuffer(t.fb); this.gl.deleteTexture(t.tex); }

  worldTarget(w: number, h: number): WorldTarget {
    // P2：画质档改了要不要半浮点时也重建
    const hdr = this.hdrWorld && this.half;
    if (this.world?.w === w && this.world.h === h && this.worldHdr === hdr) return this.world;
    const gl = this.gl;
    if (this.world) {
      gl.deleteTexture(this.world.depth); gl.deleteTexture(this.world.groundDepth);
      gl.deleteFramebuffer(this.world.groundFb); this.free(this.world);
    }
    // P2：世界层用半浮点，法术、灯火这类自发光的东西才能「亮过白」，后期再做色调映射；不支持时 target() 自己退回 8 位
    const target = this.target(w, h, hdr), depth = this.newTex(gl.NEAREST);
    this.worldHdr = hdr && this.half;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
    const groundDepth = this.newTex(gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    const groundFb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, groundFb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, groundDepth, 0);
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.world = { ...target, depth, groundDepth, groundFb };
    return this.world;
  }

  resize(w: number, h: number) {
    w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    if (this.fx && this.fx.w === w && this.fx.h === h) return;
    this.W = w; this.H = h;
    for (const t of [this.fx, this.h1, this.q1, this.q2, this.e1, this.e2, this.lt]) this.free(t);
    this.fx = this.target(w, h, true);
    this.h1 = this.target(Math.ceil(w / 2), Math.ceil(h / 2), true);
    this.q1 = this.target(Math.ceil(w / 4), Math.ceil(h / 4), true);
    this.q2 = this.target(Math.ceil(w / 4), Math.ceil(h / 4), true);
    this.e1 = this.target(Math.ceil(w / 8), Math.ceil(h / 8), true);
    this.e2 = this.target(Math.ceil(w / 8), Math.ceil(h / 8), true);
    // P2：光照图半分辨率就够（灯光本来就是软的）；没有半浮点就不建，点光源整个不开
    this.lt = this.half ? this.target(Math.ceil(w / 2), Math.ceil(h / 2), true) : null;
  }

  private upload(tex: WebGLTexture, cv: HTMLCanvasElement, premult: boolean, isScene: boolean) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premult);
    const w = cv.width, h = cv.height;
    const same = isScene ? (w === this.sceneW && h === this.sceneH) : (w === this.atmoW && h === this.atmoH);
    if (same) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
      if (isScene) { this.sceneW = w; this.sceneH = h; this.sceneUp = false; } else { this.atmoW = w; this.atmoH = h; this.atmoUp = false; }
    }
    if (isScene) this.sceneUp = true; else this.atmoUp = true;

    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  /** 首帧：世界层纹理还没有内容时，先铺一层黑（避免沿用空纹理导致闪白） */
  private clearSceneBlack() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.W, this.H);
    gl.useProgram(this.black.p);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    // 同时把纹理也填成透明黑，第一帧就能正常混合
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(64));
    this.sceneUp = true; this.sceneW = 0; this.sceneH = 0;
  }

  private pass(t: Target | null, prog: Prog) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fb : null);
    gl.viewport(0, 0, t ? t.w : this.W, t ? t.h : this.H);
    gl.useProgram(prog.p);
    this.drawCalls++;
  }
  private bindTex(unit: number, tex: WebGLTexture) { const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); }
  private full() { const gl = this.gl; gl.bindVertexArray(this.emptyVao); gl.drawArrays(gl.TRIANGLES, 0, 3); }

  /** P2：把这一帧的点光源叠进半分辨率光照图；返回后期要不要用它 */
  /** 上一帧画了几盏点光源（验收用：流畅档应为 0） */
  lightsDrawn = 0;
  private drawLights(P: PostParams): boolean {
    this.lightsDrawn = 0;
    const L = P.lights, cam = P.worldCamera, gl = this.gl;
    if (!L || L.n <= 0 || !P.world || !cam?.viewProj || !cam.projScale || !cam.eye || !this.lt || !this.lightVao || !this.half) return false;
    const n = Math.min(L.n, 192), lp = this.light, t = this.lt;
    this.lightsDrawn = n;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.viewport(0, 0, t.w, t.h);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(lp.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lightBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, L.data, 0, n * 8);
    gl.uniformMatrix4fv(lp.u('uVP'), false, cam.viewProj);
    gl.uniform2f(lp.u('uPS'), cam.projScale[0], cam.projScale[1]);
    gl.uniformMatrix4fv(lp.u('uInv'), false, cam.inverse);
    gl.uniform2f(lp.u('uSize'), t.w, t.h);
    gl.uniform3f(lp.u('uEye'), cam.eye[0], cam.eye[1], cam.eye[2]);
    this.bindTex(0, P.world.depth); gl.uniform1i(lp.u('uDepth'), 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindVertexArray(this.lightVao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    this.drawCalls++;
    return true;
  }

  /** 一帧：scene 为世界画布；批次已由调用方填好（CSS 像素坐标），cssW/cssH 为 CSS 尺寸 */
  frame(scene: HTMLCanvasElement, cssW: number, cssH: number, dpr: number, P: PostParams, uploadScene = true) {
    if (this.lost || !this.fx) return;
    const gl = this.gl;
    this.drawCalls = 0;
    const timing = this.gpuBegin();
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true, true, true, true);
    if (timing) this.gpuMark('地表');
    let _q = prof.t();
    const groundOn = !!P.ground && this.groundReady && this.ground!.update(P.ground!.view, P.ground!.provider, this.emptyVao, this.maxTex);
    if (groundOn) { this.drawCalls += this.ground!.tilesThisFrame; this.groundTexels += (this.ground!.texelsThisFrame - this.groundTexels) * 0.05; }
    prof.add('R·GL┊地表更新(含于合成)', _q); _q = prof.t();
    if (timing) this.gpuMark('世界层上传');
    // 性能：用 texSubImage2D 原地更新同一张纹理（尺寸不变时）。以前尺寸相等其实会走 texImage2D 重建纹理对象，
    // 每帧销毁再新建一张全屏纹理，驱动要重新分配显存、旧纹理还要等 GPU 读完才能释放——这就是「越好的显卡越卡」的典型症状。
    // 世界层未变时沿用纹理，省去 Canvas 上传及浏览器可能产生的同步/拷贝。
    if (!this.sceneUp) { this.clearSceneBlack(); uploadScene = true; }
    this.groundLoTex = groundOn;
    if (uploadScene) this.upload(this.sceneTex, scene, groundOn || !!P.world, true);
    if (P.atmo) this.upload(this.atmoTex, P.atmo.canvas, true, false);
    prof.add(uploadScene ? 'R·GL┊世界层上传' : 'R·GL┊世界层(沿用)', _q); _q = prof.t();

    // 1) 特效批次 -> fx 帧缓冲
    if (timing) this.gpuMark('特效泛光');
    const B = this.batch;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fx.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, P.world?.depth ?? null, 0);
    if (P.world) { gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); }
    gl.viewport(0, 0, this.fx.w, this.fx.h);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (B.n > 0) {
      gl.useProgram(this.sprite.p);
      gl.uniform2f(this.sprite.u('uRes'), cssW, cssH);
      gl.uniform1i(this.sprite.u('uTex'), 0);
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      const bytes = B.n * FLOATS * 4;
      // 孤立旧缓冲（orphan）避免与上一帧 GPU 读取冲突
      if (bytes > this.vboSize) { this.vboSize = B.data.byteLength; }
      gl.bufferData(gl.ARRAY_BUFFER, this.vboSize, gl.DYNAMIC_DRAW);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, B.data, 0, B.n * FLOATS);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.activeTexture(gl.TEXTURE0);
      // 总审·性能：贴花（血迹、地面光圈）一场混战里几十上百张，原来每张都把深度纹理从帧缓冲上摘下来、画完再挂回去（挂 / 摘要重新校验帧缓冲，
      // 「40 敌连续施法」里每秒 9 毫秒）。连着的贴花只在这一串开头摘一次、结尾挂回一次；每串不变的参数也只设一次
      let decalRun = false;
      const endDecals = () => { if (!decalRun) return; decalRun = false; gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, P.world!.depth, 0); gl.enable(gl.DEPTH_TEST); gl.activeTexture(gl.TEXTURE0); gl.useProgram(this.sprite.p); };
      for (const s of B.segs) {
        if (!s.count) continue;
        if (s.decal) {
          if (!P.world || !P.worldCamera) continue;
          const d = s.decal, dp = this.decal;
          // 贴花自己比深度（见 FS_DECAL）：要读场景深度，就得先把它从当前帧缓冲上摘下来（同一张纹理又写又读是反馈环，WebGL 直接报错）
          if (!decalRun) {
          decalRun = true;
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, null, 0); gl.disable(gl.DEPTH_TEST);
          gl.useProgram(dp.p);
          this.bindTex(12, P.world.depth); gl.uniform1i(dp.u('uWorldDepth'), 12);
          { const lg = (globalThis as { __decalLegacy?: boolean }).__decalLegacy; gl.uniform2f(dp.u('uDecalK'), lg ? 0.4 : 4, lg ? 0 : 1); }   // 调试对照：旧行为（贴地的光圈也挡、竖面不淡）
          gl.uniform3f(dp.u('uProj'), P.worldCamera.near ?? 1, P.worldCamera.far ?? 2, P.worldCamera.perspective ? 1 : 0);
          gl.uniform2f(dp.u('uRes'), cssW, cssH); gl.uniform2f(dp.u('uTarget'), this.fx.w, this.fx.h);
          gl.uniformMatrix4fv(dp.u('uWorldInverse'), false, P.worldCamera.inverse);
          this.bindTex(11, P.world.groundDepth); gl.uniform1i(dp.u('uGroundDepth'), 11);
          }
          gl.uniform4f(dp.u('uDecal'), d.x, d.y, d.r, d.rot); gl.uniform4f(dp.u('uUv'), d.u0, d.v0, d.u1, d.v1);
          this.bindTex(0, s.tex ?? this.atlas!); gl.uniform1i(dp.u('uTex'), 0);
          gl.drawArrays(gl.TRIANGLES, s.start, s.count);
          this.drawCalls++;
          continue;
        }
        endDecals();
        gl.bindTexture(gl.TEXTURE_2D, s.tex ?? this.atlas);
        gl.drawArrays(gl.TRIANGLES, s.start, s.count);
        this.drawCalls++;
      }
      endDecals();
      gl.disable(gl.BLEND);
    }
    gl.disable(gl.DEPTH_TEST);
    // 2) 泛光：1/2 -> 1/4 -> 模糊 -> 1/8 -> 模糊
    // P2：世界层是半浮点时，世界里亮过白的东西（窗纸、灯笼）也进泛光，所以没有特效的帧也要做
    const hdr = !!P.hdr && !!P.world && this.worldHdr;
    const doBloom = this.bloomOn && (B.n > 0 || hdr);
    if (doBloom) {
      const down = (src: Target, dst: Target) => { this.pass(dst, this.down); this.bindTex(0, src.tex); gl.uniform1i(this.down.u('uTex'), 0); gl.uniform2f(this.down.u('uTexel'), 1 / src.w, 1 / src.h); this.full(); };
      const blur = (src: Target, dst: Target, dx: number, dy: number) => { this.pass(dst, this.blur); this.bindTex(0, src.tex); gl.uniform1i(this.blur.u('uTex'), 0); gl.uniform2f(this.blur.u('uDir'), dx / src.w, dy / src.h); this.full(); };
      if (hdr && P.world!.w === this.fx.w && P.world!.h === this.fx.h) {
        const de = this.downEm; this.pass(this.h1!, de);
        this.bindTex(0, this.fx.tex); gl.uniform1i(de.u('uTex'), 0); this.bindTex(1, P.world!.tex); gl.uniform1i(de.u('uWorld'), 1);
        gl.uniform2f(de.u('uTexel'), 1 / this.fx.w, 1 / this.fx.h); gl.uniform1f(de.u('uThr'), 1.0); this.full();
      } else down(this.fx, this.h1!);
      down(this.h1!, this.q1!);
      blur(this.q1!, this.q2!, 1, 0); blur(this.q2!, this.q1!, 0, 1);
      if (this.bloomLevels >= 3) {
        down(this.q1!, this.e1!);
        blur(this.e1!, this.e2!, 1, 0); blur(this.e2!, this.e1!, 0, 1);
      }
    }
    // 2.5) P2：点光源叠进光照图
    if (timing) this.gpuMark('点光源');
    const lightsOn = this.drawLights(P);
    // 3) 后期合成到屏幕
    if (timing) this.gpuMark('后期');
    const pp = this.postFor(!!P.sea);
    this.pass(null, pp);
    this.bindTex(0, this.sceneTex); gl.uniform1i(pp.u('uScene'), 0);
    this.bindTex(1, this.fx.tex); gl.uniform1i(pp.u('uFx'), 1);
    this.bindTex(2, this.q1!.tex); gl.uniform1i(pp.u('uB1'), 2);
    this.bindTex(3, (this.bloomLevels >= 3 ? this.e1! : this.q1!).tex); gl.uniform1i(pp.u('uB2'), 3);
    this.bindTex(4, this.atmoTex); gl.uniform1i(pp.u('uAtmo'), 4);
    this.bindTex(5, this.noiseTex); gl.uniform1i(pp.u('uNoise'), 5);
    this.bindTex(9, P.world ? P.world.tex : this.sceneTex); gl.uniform1i(pp.u('uWorld'), 9);
    gl.uniform1f(pp.u('uWorldOn'), P.world ? 1 : 0);
    this.bindTex(10, P.world ? P.world.depth : this.noiseTex); gl.uniform1i(pp.u('uWorldDepth'), 10);
    this.bindTex(11, P.world ? P.world.groundDepth : this.noiseTex); gl.uniform1i(pp.u('uGroundDepth'), 11);
    gl.uniform2f(pp.u('uFocus'), P.worldCamera?.focusDepth ?? 0, P.worldCamera?.depthRange ?? 0);
    gl.uniform3f(pp.u('uProj'), P.worldCamera?.near ?? 1, P.worldCamera?.far ?? 2, P.worldCamera?.perspective ? 1 : 0);
    if (P.worldCamera) {
      gl.uniformMatrix4fv(pp.u('uWorldInverse'), false, P.worldCamera.inverse);
      gl.uniform2f(pp.u('uSenseWorld'), P.worldCamera.x, P.worldCamera.y);
      gl.uniform1f(pp.u('uWorldZoom'), P.worldCamera.zoom * dpr);
    }
    gl.uniform1f(pp.u('uGroundOn'), groundOn ? 1 : 0);
    if (groundOn) {
      const G = this.ground!, g = G.front!, v = P.ground!.view;
      this.bindTex(6, g.a); gl.uniform1i(pp.u('uGA'), 6);
      this.bindTex(7, g.b); gl.uniform1i(pp.u('uGB'), 7);
      this.bindTex(8, G.noise); gl.uniform1i(pp.u('uN'), 8);
      const k = this.W / v.cssW;
      if (v.inv) {
        // HD2D：w = M·(q / k) + o（q 为设备像素，k 为设备像素 / CSS 像素）
        const M = v.inv, kk = this.W / v.screenW!;
        gl.uniform2f(pp.u('uGWo'), M[4], M[5]);
        gl.uniformMatrix2fv(pp.u('uGWm'), false, [M[0] / kk, M[2] / kk, M[1] / kk, M[3] / kk]);
        gl.uniform1f(pp.u('uGWs'), Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2])) / kk);
      } else {
        gl.uniform2f(pp.u('uGWo'), v.camX - v.cssW / 2 / v.zoom, v.camY - v.cssH / 2 / v.zoom);
        gl.uniform1f(pp.u('uGWs'), 1 / (k * v.zoom));
        gl.uniformMatrix2fv(pp.u('uGWm'), false, [1 / (k * v.zoom), 0, 0, 1 / (k * v.zoom)]);
      }
      const gc = G.sampleOrigin(g); gl.uniform2f(pp.u('uGC'), gc[0], gc[1]); gl.uniform1f(pp.u('uGTpw'), g.tpw); gl.uniform2f(pp.u('uGSize'), g.W, g.H);
      gl.uniform1f(pp.u('uWT'), P.t % 3600);
    } else {
      this.bindTex(6, this.noiseTex); gl.uniform1i(pp.u('uGA'), 6);
      this.bindTex(7, this.noiseTex); gl.uniform1i(pp.u('uGB'), 7);
      this.bindTex(8, this.noiseTex); gl.uniform1i(pp.u('uN'), 8);
    }
    gl.uniform2f(pp.u('uRes'), this.W, this.H);
    gl.uniform1f(pp.u('uDpr'), dpr);
    gl.uniform1f(pp.u('uT'), P.t % 10000);
    const sh = new Float32Array(24); const ns = Math.min(6, P.shocks.length);
    for (let i = 0; i < ns; i++) { const s = P.shocks[i]; sh.set([s.x * dpr, s.y * dpr, s.r * dpr, s.amp * dpr], i * 4); }
    gl.uniform4fv(pp.u('uShock[0]'), sh); gl.uniform1i(pp.u('uNShock'), ns);
    gl.uniform3fv(pp.u('uMul'), P.mul); gl.uniform1f(pp.u('uWarm'), P.warm); gl.uniform1f(pp.u('uDusk'), P.dusk);
    const S = P.sense;
    gl.uniform4f(pp.u('uSense'), S.x * dpr, S.y * dpr, S.R * dpr, S.on ? 1 : 0);
    gl.uniform3fv(pp.u('uSenseInk'), S.ink); gl.uniform3fv(pp.u('uSenseGlow'), S.glow);
    gl.uniform1f(pp.u('uSenseHide'), S.hide); gl.uniform1f(pp.u('uAlarm'), S.alarm);
    if (P.atmo) { const k = P.world ? 1 : dpr; gl.uniform4f(pp.u('uAtmoRect'), P.atmo.x * k, P.atmo.y * k, P.atmo.w * k, P.atmo.h * k); gl.uniform1f(pp.u('uAtmoOn'), 1); }
    else gl.uniform1f(pp.u('uAtmoOn'), 0);
    gl.uniform4fv(pp.u('uFog'), P.fog); gl.uniform1f(pp.u('uFogBands'), P.fogBands);
    gl.uniform4fv(pp.u('uFlash'), P.flash); gl.uniform4fv(pp.u('uTint'), P.tint);
    gl.uniform1f(pp.u('uVig'), P.vig); gl.uniform1f(pp.u('uHurt'), P.hurt); gl.uniform1f(pp.u('uFade'), P.fade);
    gl.uniform1f(pp.u('uAberr'), P.aberr); gl.uniform1f(pp.u('uBloomK'), doBloom ? P.bloom : 0); gl.uniform1f(pp.u('uGrain'), P.grain);
    gl.uniform1f(pp.u('uSat'), P.sat); gl.uniform1f(pp.u('uInk'), P.ink ?? 0);
    { const M = P.mono, mk = new Float32Array(12); if (M) for (let i = 0; i < Math.min(3, M.keep.length); i++) mk.set([M.keep[i][0] * dpr, M.keep[i][1] * dpr, M.keep[i][2] * dpr, 1], i * 4);   // 撼山客第三批：天地变黑白
      gl.uniform4f(pp.u('uMono'), M?.k ?? 0, M?.flash ?? 0, M?.dim ?? 0, M?.black ?? 0); gl.uniform4fv(pp.u('uMonoKeep[0]'), mk);
      { const kw = new Float32Array(12); if (M?.keepW) for (let i = 0; i < Math.min(3, M.keepW.length); i++) kw.set(M.keepW[i], i * 4); gl.uniform4fv(pp.u('uMonoKeepW[0]'), kw); const up = M?.up ?? [0, -1]; gl.uniform2f(pp.u('uMonoUp'), up[0], up[1]); }
      gl.uniform1f(pp.u('uMonoFx'), M?.fxKeep ?? 0);
      const wc = M?.wash; gl.uniform4f(pp.u('uMonoC'), wc?.[0] ?? 0, wc?.[1] ?? 0, wc?.[2] ?? 0, wc?.[3] ?? 0); }
    { const D = P.dist, nd = Math.min(4, D?.length ?? 0);   // r7-fx3d：空间扭曲冲击波
      if (nd) { const a = new Float32Array(16), b = new Float32Array(16); for (let i = 0; i < nd; i++) { const q = D![i]; a.set([q.x * dpr, q.y * dpr, q.r * dpr, q.amp * dpr], i * 4); b.set([q.k, q.rim, q.w, 0], i * 4); }
        gl.uniform4fv(pp.u('uDist[0]'), a); gl.uniform4fv(pp.u('uDistK[0]'), b); }
      gl.uniform1i(pp.u('uNDist'), nd); }
    gl.uniform4f(pp.u('uHaze'), P.haze?.start ?? 0, P.haze?.end ?? 1, P.haze?.strength ?? 0, 0);
    const wp = P.warp;
    gl.uniform4f(pp.u('uWarp'), wp?.k ?? 0, wp?.burst ?? 0, wp?.spool ?? 0, wp?.t ?? 0);
    gl.uniform4f(pp.u('uWarpAt'), (wp?.x ?? 0) * dpr, (wp?.y ?? 0) * dpr, wp?.dx ?? 1, wp?.dy ?? 0);
    gl.uniform3f(pp.u('uWarpColor'), wp?.color[0] ?? 1, wp?.color[1] ?? 1, wp?.color[2] ?? 1);
    gl.uniform3f(pp.u('uHazeColor'), P.haze?.color[0] ?? 1, P.haze?.color[1] ?? 1, P.haze?.color[2] ?? 1);
    setSeaUniforms(gl, pp.u, P.sea, dpr, P.t, () => (this.seaMaskTex ??= makeSeaMaskTex(gl)), 12);   // 绝域
    // P2：自发光与色调映射、点光源、分色调、高度雾
    gl.uniform1f(pp.u('uHdr'), hdr ? 1 : 0); gl.uniform1f(pp.u('uTone'), hdr ? 1 : 0);
    gl.uniform1f(pp.u('uLightOn'), lightsOn ? 1 : 0); gl.uniform1f(pp.u('uInkDark'), hdr && P.inkDark !== false ? 1 : 0);
    this.bindTex(13, lightsOn ? this.lt!.tex : this.noiseTex); gl.uniform1i(pp.u('uLightTex'), 13);
    const G = P.grade;
    gl.uniform3f(pp.u('uGradeLo'), G?.lo[0] ?? 1, G?.lo[1] ?? 1, G?.lo[2] ?? 1); gl.uniform3f(pp.u('uGradeHi'), G?.hi[0] ?? 1, G?.hi[1] ?? 1, G?.hi[2] ?? 1);
    gl.uniform4f(pp.u('uGradeK'), G?.contrast ?? 1, G?.sat ?? 1, G?.pivot ?? 0.4, G ? 1 : 0);
    const HF = P.worldCamera?.eye ? P.heightFog : null, eye = P.worldCamera?.eye;
    gl.uniform4f(pp.u('uFogH'), HF?.density ?? 0, HF?.base ?? 0, HF?.falloff ?? 1, HF?.max ?? 0); gl.uniform2f(pp.u('uFogN'), HF?.near ?? 0, 0);
    gl.uniform3f(pp.u('uFogHColor'), HF?.color[0] ?? 1, HF?.color[1] ?? 1, HF?.color[2] ?? 1);
    gl.uniform3f(pp.u('uEye'), eye?.[0] ?? 0, eye?.[1] ?? 0, eye?.[2] ?? 0);
    gl.uniform2f(pp.u('uHero'), P.worldCamera?.x ?? 0, P.worldCamera?.y ?? 0);
    this.full();
    gl.bindVertexArray(null);
    if (timing) this.gpuEnd();
    prof.add('R·GL┊特效+后期提交(含于合成)', _q);
  }
}
