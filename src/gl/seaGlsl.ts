// 绝域的海面与视野（拼进后期着色器 FS_POST，见 gl/stage.ts）。
//
// 地面是烘焙好的（HD2D 下是三维地形网格贴着分块底图），海色不能靠重烘：这里在后期里按每个像素的世界坐标
// 把海面重新上一遍色——碧蓝 → 墨青 → 黑水，加涌浪、浪尖白沫、顺风的浪沫条纹和暗紫的裂隙光。
// 一屏只有两三千单位宽，分带却以万计，所以只传「屏幕中心的值 + 梯度」，逐像素线性外推就够了。
// 哪里是水：CPU 每隔一阵在人物四周 64×64 格问一次地形（world/jueyu.ts 的 mask），传成一张小纹理，线性过滤后岸边是软的。
// 只给「露出地面的像素」上色：立板（人物、妖兽、岛上的屋子）的深度比地面近，原样保留。
//
// 视野收拢（迷雾断层、鬼雾）：以人物为心，外圈压成一层流动的墨色雾，中间一圈保持清楚——不模糊、不发白。
// 飓风：两条螺旋雨带压暗画面、带细密的雨丝；风眼里反而亮一些、平静。鬼雾：灰青的雾墙，人物身边留一小圈。
import type { RGB } from './fx';

export interface SeaPost {
  /** 屏幕中心（人物）处的世界坐标，以及那里的墨化程度、浪高、裂隙光，和它们沿世界坐标的梯度（每单位） */
  cx: number; cy: number;
  dark: number; swell: number; rift: number;
  gDark: [number, number]; gSwell: [number, number]; gRift: [number, number];
  /** 风（世界方向的单位向量）与风力 0–1 */
  windX: number; windY: number; wind: number;
  /** 视野 1 正常 → 0 只剩身边一小圈；sx、sy 人物在屏幕上的位置（CSS 像素） */
  view: number; sx: number; sy: number;
  /** 闪电的白光 0–1 */
  flash: number;
  /** 飓风（最多 2 个）：世界坐标、半径、风眼半径、强度、旋向 */
  storms: { x: number; y: number; R: number; eye: number; k: number; spin: number }[];
  /** 鬼雾（最多 3 片）：中心、两个半轴、朝向、浓度 */
  fogs: { x: number; y: number; rx: number; ry: number; ang: number; k: number }[];
  /** 水的遮罩（1 = 水）：n×n 格，覆盖以 (x0, y0) 为左上角、边长 size 的一块 */
  mask: { data: Uint8Array; n: number; x0: number; y0: number; size: number; ver: number } | null;
  /** 绝域里罡风的强度 0–1（画面里刮起顺风的浪沫与水汽） */
  gale: number;
  /** 水色的三档（近海由底图自己画，这里给迷雾断层与核心的颜色，B4 别的险地换掉它们） */
  palette?: { mid: RGB; deep: RGB; glow: RGB; foam: RGB };
  /** 水下的黑影（最多 8 个，world/seabeast.ts 的 shadesFor）：x、y 世界坐标，len 长度，a 浓度，ang 朝向，ph 摆尾相位，kind 种类，rise 破水前的鼓包，n 鱼群几条 */
  shades?: { x: number; y: number; len: number; a: number; ang: number; ph: number; kind: number; rise: number; n: number }[];
  /**
   * 收官 B3：万丈海渊（world/haiyuan.ts 的 post）。k 水下的程度（入水、出水时渐变），depth 0（海面）–1（深渊），surf 刚入水时头顶还看得见的水面，
   * lights 最多八个光源（世界坐标、半径、强度、颜色）：自己身边一圈、发光的东西、遗迹的灵光——水下只有它们照得亮。
   */
  under?: { k: number; depth: number; surf: number; lights: { x: number; y: number; r: number; a: number; c: RGB }[] } | null;
  /** 收官 B3：血月（0–1）：夜色泛一层暗红 */
  moon?: number;
  /**
   * 收官 B4：介质（world/jueyuLooks.ts）。wave 波形（0 海浪 1 沙纹 2 浮冰 3 熔岩 4 冥河 5 瘴泽）、emit 自发光、flow 流速、haze 介质的「气」0–1；
   * mist 雾色（鬼雾、瘴、冥雾、冰雾都用它）；rain 天上下的东西的颜色、rainKind（0 雨 1 沙 2 雪 3 火雨 4 魂火 5 孢子）
   */
  medium?: { wave: number; emit: number; flow: number; haze: number; mist: RGB; rain: RGB; rainKind: number };
  /** 安全点与热浪口（最多 4 个）：type 1 引魂灯、2 林窗、3 热浪口——雾在灯下、林窗里散开，热浪口的熔岩翻得更亮 */
  spots?: { x: number; y: number; r: number; type: number }[];
  /** 浮冰：人处的疏密与它沿世界坐标的梯度（逐像素外推，同墨化） */
  floe?: { cov: number; g: [number, number] } | null;
  /** 冰裂开的窟窿（最多 2 个）：k 渐渐冻上 */
  holes?: { x: number; y: number; r: number; k: number }[];
}

export const GLSL_SEA = `
uniform vec4 uSeaA; uniform vec4 uSeaB; uniform vec4 uSeaC; uniform vec4 uSeaD; uniform vec4 uSeaG; uniform vec4 uSeaG2;
uniform vec4 uStorm[2]; uniform vec4 uStormB[2]; uniform vec4 uGFog[3]; uniform vec4 uGFogB[3];
uniform sampler2D uSeaMask; uniform vec4 uSeaMaskR; uniform vec3 uSeaMid, uSeaDeep, uSeaGlow, uSeaFoam;
uniform vec4 uShade[8]; uniform vec4 uShadeB[8];
// 收官 B3：海渊。uUA = (水下程度, 深浅 0–1, 头顶的水面, 血月)；uUL = 光源 (x, y, 半径, 强度)，uULc 光的颜色
uniform vec4 uUA; uniform vec4 uUL[8]; uniform vec3 uULc[8];
// 收官 B4：介质。uSeaM = (波形, 自发光, 流速, 气)；uSeaMist 雾色；uSeaRain = (颜色, 种类)；uSpot = (x, y, 半径, 种类)；uFloe = (疏密, 梯度 xy, 开)；uHole = (x, y, 半径, 程度)
uniform vec4 uSeaM; uniform vec3 uSeaMist; uniform vec4 uSeaRain; uniform vec4 uSpot[4]; uniform vec4 uFloe; uniform vec4 uHole[2];
// 和 core/rng.ts 的 hashU 一模一样的整数哈希（浮冰的位置 CPU、GPU 必须一致：脚下站得住的就是看得见的那块）
float hU(int x, int y, int s){ uint h=uint(x)*374761393u+uint(y)*668265263u+uint(s)*2246822519u; h=(h^(h>>13u))*1274126177u; h^=h>>16u; return float(h)/4294967296.0; }
// 浮冰（world/jueyu.ts 的 floeAt）：返回 (在冰上的程度, 离冰边多近)
vec2 floeAt(vec2 w, float cov){
  if(cov>0.97) return vec2(1.0,0.0);
  ivec2 c=ivec2(floor(w/560.0)); float best=0.0, edge=0.0;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    ivec2 q=c+ivec2(i,j); if(hU(q.x,q.y,462)>=cov) continue;
    vec2 ctr=(vec2(q)+0.2+0.6*vec2(hU(q.x,q.y,463),hU(q.x,q.y,464)))*560.0;
    float r=560.0*(0.36+0.3*hU(q.x,q.y,465));
    vec2 d=w-ctr; d.y*=1.2;
    // 冰缘不是正圆：叠一点噪声，碎得自然些（只往里收，不出 CPU 判定的圈）
    float e=length(d)+pnoise(w/70.0,41)*22.0;
    float k=1.0-smoothstep(r-22.0,r-8.0,e);
    if(k>best){ best=k; edge=1.0-smoothstep(0.0,40.0,r-8.0-e); }
  }
  return vec2(best,edge);
}
// 安全点、热浪口：返回 (雾散开的程度, 热浪口的亮)
vec2 seaSpots(vec2 w){
  float clear=0.0, hot=0.0;
  for(int i=0;i<4;i++){ vec4 S=uSpot[i]; if(S.z<1.0) continue; float d=length(w-S.xy)/S.z;
    if(S.w>2.5) hot=max(hot,1.0-smoothstep(0.2,1.0,d)); else clear=max(clear,1.0-smoothstep(0.55,1.0,d)); }
  return vec2(clear,hot);
}
// uSeaA = (中心 x, 中心 y, 开, 时间)；uSeaB = (墨化, 浪高, 裂隙光, 罡风)；uSeaC = (风向 x, 风向 y, 风力, 闪电)
// uSeaD = (视野, 人物屏幕 x, 人物屏幕 y, 0)（设备像素）；uSeaG = (墨化梯度 xy, 浪高梯度 xy)；uSeaG2 = (裂隙光梯度 xy, 遮罩开, 0)
float seaStormRain(vec2 w, out float eyeK){
  float rain=0.0; eyeK=0.0;
  for(int i=0;i<2;i++){
    vec4 S=uStorm[i]; if(S.w<0.01) continue;
    vec2 d=w-S.xy; float r=length(d); float R=S.z; if(r>R*1.25) continue;
    float eye=uStormB[i].x, spin=uStormB[i].y;
    float th=atan(d.y,d.x);
    // 两条对数螺旋雨带，随时间绕心转
    float arm=sin(2.0*th*spin+log(r+60.0)*5.2-uSeaA.w*0.9*spin+fbm2(w/1400.0)*2.4);
    float band=smoothstep(-0.15,0.85,arm)*smoothstep(eye*0.9,eye*1.7,r)*(1.0-smoothstep(R*0.8,R*1.25,r));
    float wall=exp(-pow((r-eye*1.9)/(eye*0.7+1.0),2.0));
    rain=max(rain,(band*0.8+wall*0.6)*S.w);
    eyeK=max(eyeK,(1.0-smoothstep(eye*0.6,eye*1.15,r))*S.w);
  }
  return clamp(rain,0.0,1.0);
}
float seaGhostFog(vec2 w){
  float f=0.0;
  for(int i=0;i<3;i++){
    vec4 G=uGFog[i]; if(G.w<1.0) continue;
    vec2 d=w-G.xy; float a=uGFogB[i].x, c=cos(a), s=sin(a);
    vec2 q=vec2((c*d.x+s*d.y)/G.z,(-s*d.x+c*d.y)/G.w);
    float e=length(q)*(1.0+(fbm2(w/1100.0+vec2(uSeaA.w*0.02,0.0))-0.5)*0.5);
    f=max(f,(1.0-smoothstep(0.55,1.05,e))*uGFogB[i].y);
  }
  return f;
}
// —— 水下的黑影（收官 B2，world/seabeast.ts）：隔着一层水看见的墨影。uShade = (x, y, 长度, 浓度)；uShadeB = (朝向, 摆尾相位, 种类 + 10×条数, 鼓包)
// 形状都在「以长度为 1」的局部坐标里画：x 朝头，y 朝侧面。鱼：前粗后细的身子、摆动的尾鳍、胸鳍；海魔：一团身子伸出六条扭动的触手；蛟：一条蛇行的长影
float shH(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float shFish(vec2 q, float ph, float tailK, float finK){
  float x=q.x, behind=clamp(0.12-x,0.0,0.62);
  float y=q.y-sin(ph-x*8.0)*0.36*behind*behind*tailK;
  float e=(x-0.06)/0.42;
  float hw=0.12*sqrt(max(0.0,1.0-e*e));
  hw+=finK*exp(-pow((x-0.1)/0.07,2.0))*(0.85+0.15*sin(ph*0.6));
  float tail=smoothstep(-0.28,-0.42,x)*(1.0-smoothstep(-0.52,-0.58,x));
  hw=max(hw, tail*(0.02+0.17*smoothstep(-0.34,-0.55,x)));
  return step(-0.58,x)*step(x,0.5)*(1.0-smoothstep(hw*0.7,hw+0.018,abs(y)));
}
float shKraken(vec2 q, float ph){
  float r=length(q), th=atan(q.y,q.x);
  float m=1.0-smoothstep(0.13,0.2,r);
  for(int i=0;i<6;i++){
    float a=float(i)*1.0472+0.35*sin(ph*0.3+float(i)*1.7);
    float d=th-a-sin(r*11.0-ph*1.2+float(i))*0.5*r; d=atan(sin(d),cos(d));
    float w=0.055*(1.0-smoothstep(0.08,0.52,r));
    m=max(m,(1.0-smoothstep(w*0.55,w+0.01,abs(d)*r))*step(r,0.52));
  }
  return m;
}
float shSerpent(vec2 q, float ph){
  float x=q.x, cy=sin(x*11.0+ph)*0.055*(0.5+0.5*(0.5-x));
  float hw=0.03+0.024*smoothstep(0.32,0.46,x)-0.02*smoothstep(-0.15,-0.5,x);
  return step(-0.5,x)*step(x,0.5)*(1.0-smoothstep(hw*0.65,hw+0.012,abs(q.y-cy)));
}
float shShape(vec2 q, float kind, float n, float ph){
  float m=0.0;
  if(kind<0.5) m=shFish(q,ph,1.0,0.03);
  else if(kind<1.5){ for(int j=0;j<8;j++){ if(float(j)>=n) break; float fj=float(j);
      vec2 o=vec2(shH(vec2(fj,3.1))-0.5, shH(vec2(fj,7.7))-0.5)*vec2(0.62,0.5)+vec2(sin(ph*0.3+fj)*0.03,cos(ph*0.27+fj*1.3)*0.03);
      m=max(m,shFish((q-o)/0.3,ph+fj*1.7,1.0,0.02)); } }
  else if(kind<2.5) m=shKraken(q,ph);
  else if(kind<3.5) m=shSerpent(q,ph);
  else m=shFish(q,ph,0.45,0.17);
  return m;
}
// 返回 (墨影浓度, 水面隆起, 鼓包的白沫, 轮廓外一圈被搅动的水)
vec4 seaShades(vec2 w){
  vec4 acc=vec4(0.0);
  for(int i=0;i<8;i++){
    vec4 S=uShade[i]; if(S.w<0.004) continue;
    vec2 d=w-S.xy; float L=S.z; if(dot(d,d)>L*L*0.42) continue;
    vec4 B=uShadeB[i]; float c=cos(B.x), s=sin(B.x);
    vec2 q=vec2(c*d.x+s*d.y,-s*d.x+c*d.y)/L;
    float r0=length(q);
    // 边缘被水纹扰动（隔着一层浪看下去，轮廓是晃的）
    q+=(vec2(pnoise(w/120.0+vec2(uSeaA.w*0.45,0.0),31),pnoise(w/120.0+vec2(0.0,uSeaA.w*0.4),33))-0.5)*0.05;
    float kind=mod(B.z,10.0), n=floor(B.z/10.0);
    float m=shShape(q,kind,n,B.y);
    // 轮廓外一圈：把形状放大一成半再算一次，差出来的那一圈就是被它搅动、托起来的水
    float halo=max(0.0, shShape(q*0.86,kind,n,B.y)-m);
    acc.x=max(acc.x,m*S.w); acc.w=max(acc.w,halo*S.w);
    // 大东西从下面经过，水面微微隆起；破水前一圈圈泛白
    acc.y=max(acc.y,S.w*step(800.0,L)*exp(-r0*r0*12.0)*0.6+B.w*exp(-r0*r0*30.0));
    if(B.w>0.01) acc.z=max(acc.z,B.w*smoothstep(0.55,0.95,sin(r0*48.0-uSeaA.w*9.0))*(1.0-smoothstep(0.08,0.32,r0)));
  }
  return acc;
}
// ———————————————— 收官 B4：别界的介质 ————————————————
// 浮冰：冰面（带雪的白、蓝灰的冰裂纹、背光一侧的冷影、冰缘一圈亮）压在冰水上；冰裂开的窟窿是黑水
vec3 seaIce(vec3 water, vec2 w, float lum, float T){
  if(uFloe.w<0.5) return water;
  float cov=clamp(uFloe.x+dot(w-uSeaA.xy,uFloe.yz),0.0,1.0);
  vec2 f=floeAt(w,cov);
  for(int i=0;i<2;i++){ vec4 Hh=uHole[i]; if(Hh.w<0.01) continue; float d=length(w-Hh.xy)/Hh.z; f.x*=mix(1.0,smoothstep(0.8,1.0,d+pnoise(w/50.0,47)*0.2),Hh.w); }
  if(f.x<0.003) return water;
  float n=pnoise(w/240.0,49), n2=pnoise(w/48.0,51);
  vec3 ice=uSeaFoam*(0.86+0.12*n)+vec3(0.02,0.03,0.05)*n2;
  float crack=1.0-smoothstep(0.0,0.012,abs(pnoise(w/180.0,53)-0.5));
  ice=mix(ice, vec3(0.45,0.6,0.72), crack*0.45);
  ice=mix(ice, ice*vec3(0.78,0.86,0.95), smoothstep(0.4,0.8,fbm2(w/900.0)));
  ice+=vec3(0.12,0.14,0.16)*f.y;
  return mix(water, ice, f.x);
}
// 流沙、熔岩：不是水，整片重画（近岸按墨化渐入，保留一点底图的纹理）
vec3 seaSolid(vec3 c, vec2 w, float dark, float rift, float rain){
  float T=uSeaA.w, lum=dot(c,vec3(0.3,0.59,0.11));
  vec2 wd=normalize(uSeaC.xy+vec2(1e-4,0.0)), pd=vec2(-wd.y,wd.x);
  vec2 sp=seaSpots(w);
  vec3 col;
  if(uSeaM.x<1.5){
    // 流沙：大沙丘（按起伏打光：迎光一面亮、背光一面暗），沙丘上一片片细沙纹（被扭弯、时有时无、顺流慢慢挪），
    // 一道道缓缓流动的沙河，沙涡（裂隙光处）往下陷
    vec2 fl=wd*T*22.0*uSeaM.z;
    float h0=fbm2(w/1900.0), hx=fbm2((w+vec2(90.0,0.0))/1900.0)-h0, hy=fbm2((w+vec2(0.0,90.0))/1900.0)-h0;
    float lit=clamp(0.5+(-hx*0.7-hy*0.9)*38.0,0.0,1.0);   // fbm2 起伏很缓（坡度小），光要放大才看得出沙丘
    float dn2=fbm2(w/640.0+3.1);
    float ripA=0.35+0.65*smoothstep(0.55,0.85,fbm2(w/1300.0+7.3));
    float rip=sin((dot(w-fl,wd)+dn2*420.0)/21.0), rip2=sin((dot(w-fl*0.7,wd*0.8+pd*0.6)+fbm2(w/380.0)*260.0)/13.0);
    col=mix(uSeaMid, uSeaFoam, lit*0.85+0.1*h0);
    col=mix(col, uSeaDeep, smoothstep(0.55,1.0,dark)*0.45*(1.0-lit*0.5));
    col*=1.0+ripA*(0.085*rip+0.04*rip2);
    col=mix(col, uSeaFoam*1.06, smoothstep(0.9,1.0,rip)*0.14*ripA*lit);
    // 沙河：顺流向的长条，颜色略深略润，花纹往前流
    float river=smoothstep(0.58,0.72,fbm2(vec2(dot(w,pd)/1100.0, dot(w,wd)/4200.0)+3.7));
    float rf=pnoise(vec2(dot(w-fl*2.5,wd)/90.0, dot(w,pd)/28.0),57);
    col=mix(col, uSeaMid*(0.82+0.18*rf), river*0.45);
    // 沙涡：一片片缓缓旋转的暗纹
    vec2 sw=w/1100.0; float sa=atan(fract(sw.y)-0.5,fract(sw.x)-0.5), sr=length(fract(sw)-0.5);
    float swirl=smoothstep(0.75,0.95,sin(sa*3.0+sr*30.0-T*1.2))*(1.0-smoothstep(0.1,0.42,sr))*smoothstep(0.6,0.85,pnoise(floor(sw)*0.37,55));
    col=mix(col, uSeaDeep*0.7, swirl*(0.25+0.4*rift));
    // 沙暴下：顺风的沙线
    float streak=smoothstep(0.55,0.9,N4(vec2(dot(w,wd)/220.0-T*1.6, dot(w,pd)/12.0)).g)*smoothstep(0.3,0.8,N4(w/170.0+T*0.04).b);
    col=mix(col, uSeaFoam*1.1, streak*clamp(uSeaC.z+rain-0.2,0.0,1.0)*0.5);
  } else {
    // 熔岩：焦黑的岩壳一块块浮着，壳缝里透出亮红，开阔处是翻涌的熔流；热浪口翻得更亮
    vec2 fl=vec2(T*0.022,T*0.014)*uSeaM.z*3.0;
    // 注意 fbm2 的均值约 0.67（第二个通道是常数），这里用两层哈希噪声，均值 0.5
    float n=pnoise(w/1100.0+fl,3)*0.62+pnoise(w/430.0-fl,5)*0.38, n3=pnoise(w/70.0+fl*2.0,15);
    // 岩壳的裂缝网：两层等值线，细而亮；缝边一圈透出的红
    float c1=pnoise(w/320.0-fl*1.5,13), c2=pnoise(w/150.0+fl,61);
    float crack=max(1.0-smoothstep(0.0,0.016,abs(c1-0.5)), (1.0-smoothstep(0.0,0.012,abs(c2-0.5)))*0.65);
    float halo=1.0-smoothstep(0.0,0.07,abs(c1-0.5));
    float open=smoothstep(0.66,0.8,n+sp.y*0.5);
    vec3 crust=uSeaDeep*(0.6+0.9*n3)+vec3(0.025,0.014,0.01)*pnoise(w/26.0,63);
    float pulse=0.8+0.2*sin(T*1.7+n*9.0);
    vec3 hot=mix(uSeaMid, uSeaFoam, clamp(smoothstep(0.74,0.9,n)*0.8+crack*0.35,0.0,1.0))*pulse;
    col=crust+uSeaMid*halo*0.22*pulse;
    col=mix(col, hot, max(open, crack));
    col+=uSeaGlow*0.05*smoothstep(0.45,0.7,n)*uSeaM.y;
    col+=uSeaFoam*sp.y*0.35*(0.7+0.3*sin(T*4.0+n3*6.0));
    // 熔岩裂（裂隙光）：一道道更亮的缝
    float q1=pnoise(w/700.0+fl,21); col+=uSeaGlow*(1.0-smoothstep(0.0,0.01,abs(q1-0.5)))*rift*0.9;
  }
  return col;
}
// 海面上色：c 底色，w 世界坐标，ground 这个像素是不是露出的地面
vec3 seaGround(vec3 c, vec2 w, float ground){
  float T=uSeaA.w;
  vec2 rel=w-uSeaA.xy;
  float dark=clamp(uSeaB.x+dot(rel,uSeaG.xy),0.0,1.0);
  float swell=clamp(uSeaB.y+dot(rel,uSeaG.zw),0.0,1.0);
  float rift=clamp(uSeaB.z+dot(rel,uSeaG2.xy),0.0,1.0);
  float eyeK; float rain=seaStormRain(w,eyeK);
  float water=1.0;
  if(uSeaG2.z>0.5){ vec2 mu=(w-uSeaMaskR.xy)/uSeaMaskR.zw; water=texture(uSeaMask,clamp(mu,0.0,1.0)).r; }
  water*=ground*(1.0-uUA.x);   // 收官 B3：人在水下时海面不再上色（底下由 seaUnder 画海底）
  vec3 col=c;
  if(water>0.003 && (uSeaM.x>0.5 && uSeaM.x<1.5 || uSeaM.x>2.5 && uSeaM.x<3.5)){ vec3 t2=seaSolid(c,w,dark,rift,rain); if(uShade[0].w>0.004){ vec4 sh=seaShades(w); float mk=clamp(sh.x,0.0,1.0); t2=mix(t2, t2*0.38, mk*0.72); t2+=uSeaFoam*0.2*sh.w; t2=mix(t2, uSeaFoam, clamp(sh.z,0.0,1.0)*0.6); } return mix(c,t2,water); }   // 收官 B4：流沙、熔岩不是水
  if(water>0.003){
    vec2 wd=normalize(uSeaC.xy+vec2(1e-4,0.0));
    float wind=clamp(uSeaC.z+rain*0.6,0.0,1.4);
    swell=clamp(swell+rain*0.35,0.0,1.0);
    float lum=dot(c,vec3(0.3,0.59,0.11));
    // 底色：墨青、黑水
    vec3 tgt=mix(c, uSeaMid*(0.8+0.5*lum), smoothstep(0.0,0.6,dark));
    tgt=mix(tgt, uSeaDeep*(0.85+0.4*lum), smoothstep(0.55,1.0,dark));
    // 涌浪：两列斜交的长浪（主浪垂直于风向），相位被大尺度噪声扭弯——浪脊断断续续、不成直线
    float lam=300.0+700.0*swell;
    vec2 wd2=vec2(wd.x*0.82-wd.y*0.57, wd.x*0.57+wd.y*0.82);
    float n=fbm2(w/1600.0+wd*T*0.012);
    float n2=fbm2(w/700.0-wd2*T*0.02+4.1);
    float ph1=dot(w,wd)/lam-T*(0.16+0.3*swell)+n*2.6;
    float ph2=dot(w,wd2)/(lam*0.63)-T*(0.22+0.35*swell)+n2*1.8;
    float hgt=sin(ph1*6.2831853)*0.6+sin(ph2*6.2831853)*0.4+(n2-0.5)*0.5;
    tgt*=1.0+hgt*(0.05+0.24*swell);
    tgt+=vec3(0.035,0.05,0.06)*max(hgt,0.0)*swell*dark;   // 黑水上浪脊的冷光
    // 浪尖白沫：两列浪叠起来的尖上才有，碎成细碎的一簇一簇（哈希值噪声，和分辨率无关）
    // 沿浪脊拉长的细沫：顺浪脊方向的尺度大、横向的尺度小，才是一道道碎开的白线而不是一团团
    vec2 pd=vec2(-wd.y,wd.x), fw=w+wd*T*40.0;
    float fl=pnoise(vec2(dot(fw,pd)/70.0, dot(fw,wd)/9.0),7)*0.65+pnoise(vec2(dot(fw,pd)/24.0, dot(fw,wd)/5.0),9)*0.35;
    // 收官 B4 / 打磨：浪尖的沫不再整片刷白——浪脊上是一张细细的沫网（两层等值线叠出来的网眼），浪越高网越密
    float crest=smoothstep(0.62,0.95,hgt)*smoothstep(0.45,0.8,fl);
    float lace=max(1.0-smoothstep(0.0,0.05,abs(pnoise(fw/34.0,77)-0.5)), (1.0-smoothstep(0.0,0.04,abs(pnoise(fw/19.0+3.3,79)-0.5)))*0.7);
    float foamK=crest*(0.35+0.65*lace)*(0.12+0.42*swell)*(0.45+0.55*max(dark,0.3));
    tgt=mix(tgt, uSeaFoam, foamK);
    tgt+=uSeaFoam*0.05*smoothstep(0.8,1.0,hgt)*swell;   // 浪脊一线微亮
    // 顺风的浪沫线（狂风里）：又细又长、断断续续，不再是一团一团的
    vec2 sw=vec2(dot(w,wd)/520.0-T*1.1, dot(w,vec2(-wd.y,wd.x))/6.0);
    float streak=(1.0-smoothstep(0.0,0.09,abs(N4(sw).g-0.5)))*smoothstep(0.5,0.85,N4(w/220.0+T*0.04).b);
    tgt=mix(tgt, uSeaFoam*0.9, streak*clamp(wind-0.25,0.0,1.0)*0.32);
    // 暗紫裂隙光：海面下透出的细裂纹，一明一灭
    // 用哈希值噪声取等值线：细、锐、一明一灭，只在一片一片的地方亮
    float q1=pnoise(w/900.0+vec2(T*0.01,-T*0.007),21)*0.7+pnoise(w/300.0,23)*0.3;
    float q2=pnoise(w/420.0+vec2(-T*0.015,T*0.01),25);
    float l1=1.0-smoothstep(0.0,0.009,abs(q1-0.5)), l2=1.0-smoothstep(0.0,0.007,abs(q2-0.52));
    float patchK=smoothstep(0.45,0.75,pnoise(w/2600.0,27));
    float fiss=(l1*0.9+l2*0.6)*patchK;
    float pulse=0.55+0.45*sin(T*2.1+n*11.0);
    tgt+=uSeaGlow*fiss*rift*pulse*1.3;
    tgt+=uSeaGlow*0.035*rift*patchK*(0.6+0.4*sin(T*0.7+n*5.0));
    // 飓风：雨带下的水面被打得发白起沫，风眼平静、透亮
    tgt=mix(tgt, uSeaFoam*0.55, rain*0.18*smoothstep(0.4,0.75,fl));
    tgt=mix(tgt, tgt*1.15+vec3(0.025,0.035,0.04), eyeK*0.6);
    // 收官 B4：冰海（浮冰）、冥河（魂火）、瘴泽（浮萍似的瘴苔、冒泡）——在水的底子上再画一层
    if(uSeaM.x>1.5 && uSeaM.x<2.5) tgt=seaIce(tgt,w,lum,T);
    else if(uSeaM.x>3.5 && uSeaM.x<4.5){
      // 冥河：水面下透出一缕缕惨绿的暗流，河面上浮着一点点魂火（带一圈晕，一明一灭）
      float s=pnoise(w/110.0+vec2(T*0.03,-T*0.02)*uSeaM.z,19), pk=smoothstep(0.3,0.7,pnoise(w/1300.0,29));
      float core=smoothstep(0.9,0.975,s)*pk, halo2=smoothstep(0.78,0.95,s)*pk;
      float tw=0.55+0.45*sin(T*2.0+w.x*0.013+w.y*0.007);
      tgt+=uSeaGlow*(core*1.2+halo2*0.22)*tw*uSeaM.y*1.6;
      float cur=1.0-smoothstep(0.0,0.06,abs(fbm2(w/900.0+vec2(T*0.012,0.0))-0.5));
      tgt+=uSeaGlow*0.05*cur*smoothstep(0.35,0.75,fbm2(w/2600.0));
    }
    else if(uSeaM.x>4.5){ float sc=smoothstep(0.52,0.72,fbm2(w/520.0+vec2(T*0.004,0.0))); tgt=mix(tgt, uSeaFoam*(0.75+0.3*pnoise(w/60.0,43)), sc*0.7); float bub=smoothstep(0.93,0.99,pnoise(w/45.0+vec2(0.0,T*0.3),45))*(0.5+0.5*sin(T*3.0+w.y*0.02)); tgt+=uSeaGlow*bub*0.18; }
    { vec2 sp=seaSpots(w); tgt=mix(tgt, tgt*1.25+vec3(0.06,0.06,0.04), sp.x*0.35); }
    // 水下的黑影（最后压上去：浪花、裂隙光都被它吞掉，轮廓才读得出来）：压成一片墨，
    // 轮廓边上一圈被搅动的浅色水纹，大东西经过的地方水面隆起、浪尖更亮，破水前一圈圈泛白
    // 黑水里墨影几乎看不出来：越深，轮廓外那一圈被托起来、泛着冷光的水越亮，靠它把形状勾出来
    if(uShade[0].w>0.004){ vec4 sh=seaShades(w);
      float mk=clamp(sh.x,0.0,1.0), rim=mk*(1.0-mk)*4.0;
      tgt=mix(tgt, vec3(0.012,0.017,0.028)+tgt*0.12, mk*0.9);
      tgt+=vec3(0.13,0.18,0.2)*(rim*0.45+sh.w*(0.25+0.95*dark))*(0.8+0.2*sin(T*2.0+w.x*0.01))+vec3(0.07,0.09,0.095)*sh.y*(0.5+0.5*max(hgt,0.0));
      tgt=mix(tgt, uSeaFoam, clamp(sh.z,0.0,1.0)*0.75); }
    col=mix(c,tgt,water);
  }
  return col;
}
// 整个画面（含立板）的天象：雨带的暗影与雨丝、鬼雾
vec3 seaSky(vec3 c, vec2 w, vec2 px){
  float T=uSeaA.w;
  if(uUA.x>0.98) return c;   // 收官 B3：水下没有雨、没有雾
  // 收官 B3：血月夜，天地泛一层暗红（只点缀，不压暗画面）
  if(uUA.w>0.01){ float lum=dot(c,vec3(0.3,0.59,0.11)); c=mix(c, c*vec3(1.12,0.78,0.74)+vec3(0.05,0.0,0.0)*lum, uUA.w*0.45); }
  float eyeK; float rain=seaStormRain(w,eyeK)*(1.0-uUA.x);
  if(rain>0.01){
    // 雨幕：一道道灰白的帘子（顺风斜着下），压住底下的颜色；风眼那一圈没有
    vec2 wd=normalize(uSeaC.xy+vec2(1e-4,0.0));
    vec2 sp=px/uDpr;
    float rs=texture(uNoise,vec2(sp.x*0.006-sp.y*0.0022*wd.x, sp.y*0.0011-T*1.9)).g;
    float rs2=texture(uNoise,vec2(sp.x*0.011-sp.y*0.004*wd.x+0.3, sp.y*0.002-T*2.6)).b;
    float sheet=0.55+0.45*smoothstep(0.35,0.75,fbm2(w/1800.0+vec2(T*0.05,0.0)));
    vec3 rc=uSeaRain.w<0.5 ? vec3(0.58,0.63,0.67) : uSeaRain.rgb*0.7;
    float rk=uSeaRain.w;
    if(rk<0.5){
      c=mix(c, rc, rain*0.3*sheet);
      // 收官 B4 / 打磨：雨帘只留细丝（原来两层宽条纹叠在一起，糊成一块块白）
      c=mix(c, vec3(0.82,0.88,0.92), rain*(smoothstep(0.78,0.95,rs)*0.22+smoothstep(0.82,0.96,rs2)*0.14));
    } else if(rk<1.5){
      // 沙暴：一层昏黄压住画面，顺风横扫的沙帘
      float ss=texture(uNoise,vec2(sp.x*0.0012-T*0.9*wd.x, sp.y*0.008+sp.x*0.001*wd.y)).g;
      c=mix(c, rc, rain*(0.32*sheet+smoothstep(0.6,0.9,ss)*0.22));
    } else {
      // 雪、火雨、魂火、孢子：只压一层淡淡的色（粒子在 CPU 那边画）
      c=mix(c, rk>2.5 && rk<3.5 ? c*vec3(1.1,0.85,0.75)+vec3(0.06,0.02,0.0) : rc, rain*0.18*sheet);
    }
  }
  // 收官 B4：介质的「气」——瘴、冥雾、寒雾、热浪的灰：低低地铺一层流动的薄雾（不超过四成五），人身边、引魂灯下、林窗里散开
  float hz=uSeaM.w;
  if(hz>0.01){
    float hd0=length(px-uSeaD.yz)/uDpr;
    float wisp0=texture(uNoise,w/3000.0+vec2(T*0.01,-T*0.004)).r*0.6+texture(uNoise,w/1100.0+vec2(-T*0.016,T*0.01)).g*0.4;
    // 只是低低的一缕一缕（浓处不过两成），不铺满、不在人身边围出一圈亮边
    float k0=hz*smoothstep(0.5,0.85,wisp0)*smoothstep(40.0,220.0,hd0)*(1.0-seaSpots(w).x);
    c=mix(c, uSeaMist, min(0.2,k0*0.32));
  }
  float g=seaGhostFog(w)*(1.0-seaSpots(w).x);
  if(g>0.003){
    float hd=length(px-uSeaD.yz)/uDpr;
    float keep=smoothstep(110.0,260.0,hd);   // 人物身边一小圈留清楚
    // 灰白的鬼雾：一缕一缕翻卷（两层噪声对流），远看是一堵雾墙；人身边一小圈留清楚
    float wisp=texture(uNoise,w/2600.0+vec2(T*0.012,-T*0.006)).r*0.6+texture(uNoise,w/900.0+vec2(-T*0.02,T*0.015)).g*0.4;
    vec3 mist=mix(uSeaMist*0.92, uSeaMist*1.25+vec3(0.04), smoothstep(0.3,0.75,wisp));   // 收官 B4：雾色按介质（无边海是灰青）
    c=mix(c, mist, g*keep*(0.3+0.45*smoothstep(0.25,0.8,wisp)));
  }
  return c;
}
// 视野收拢：外圈一层流动的墨雾，中间清楚
vec3 seaUnderLight(vec3 c, vec2 px);
vec3 seaShroud(vec3 c, vec2 px){
  c=seaUnderLight(c,px);   // 收官 B3：水下的暗与光（在神识圈外的记忆水墨、云影之后）
  float v=max(uSeaD.x,uUA.x); if(v>0.995) return c;   // 水下另有自己的暗，这层墨雾让开
  vec2 d=(px-uSeaD.yz)/uDpr; float r=length(d);
  float big=max(uRes.x,uRes.y)/uDpr;
  float R=mix(140.0,big*0.62,v);
  float ang=atan(d.y,d.x), T=uSeaA.w;
  float wob=0.08*sin(3.0*ang+T*0.3)+0.05*sin(7.0*ang-T*0.5+1.3)+0.03*sin(13.0*ang+T*0.8);
  float soft=R*0.55+50.0;
  float m=smoothstep(R*(1.0+wob), R*(1.0+wob)+soft, r);
  if(m<0.002) return c;
  float wisp=texture(uNoise, vec2(ang*0.9, r/big*1.4-T*0.03)).g*0.6+texture(uNoise, px/uDpr*0.0025+vec2(T*0.008,0.0)).b*0.4;
  vec3 ink=(uSeaM.x<0.5 ? vec3(0.035,0.05,0.06) : uSeaDeep*0.6+uSeaMist*0.06)+vec3(0.06,0.07,0.075)*wisp;
  return mix(c, ink, m*(0.78+0.14*wisp)*(1.0-v*0.4));
}
// ———————————————— 收官 B3：万丈海渊 ————————————————
// 水面透下来的焦散：两层扭曲的网格，慢慢流动
float uCaus(vec2 w, float T){
  vec2 p=w/260.0;
  vec2 q=p+vec2(sin(p.y*1.7+T*0.6),cos(p.x*1.3-T*0.5))*0.6;
  float c=pow(1.0-abs(sin(q.x*2.1+T*0.4)*sin(q.y*2.3-T*0.3)),6.0);
  vec2 q2=p*1.7+vec2(cos(p.y*1.1-T*0.4),sin(p.x*1.6+T*0.5))*0.8;
  float c2=pow(1.0-abs(sin(q2.x*1.7-T*0.2)*sin(q2.y*1.9+T*0.35)),7.0);
  return c*0.6+c2*0.5;
}
// 水下：露出的地面重画成海底（沙、礁石、海草的暗影、浅处的焦散）；整个画面只剩光源照得到的地方，其余沉进水色里；
// 从海面斜斜照下来的光柱（越深越淡）；刚入水时头顶的水面还在晃。ground：这个像素是不是露出的地面
// 海底这一步（在神识圈外的「记忆水墨」、云影之前）只重画海底的颜色；暗与光放到 seaShroud 那一步（在它们之后）再做——
// 否则神识圈外那层纸色会在水下透出一大圈发黄的椭圆。两步之间用全局变量把这个像素的世界坐标带过去。
vec2 gUW; float gUOn=0.0;
vec3 seaUnder(vec3 c, vec2 w, vec2 px, float ground){
  float k=uUA.x; gUW=w; gUOn=k; if(k<0.002) return c;
  float D=uUA.y, T=uSeaA.w;
  vec3 c0=c;
  if(ground>0.5){
    float n=fbm2(w/1100.0), n2=pnoise(w/260.0,5), n3=pnoise(w/90.0,7);
    vec3 sand=mix(vec3(0.30,0.33,0.28),vec3(0.44,0.45,0.36),n);
    vec3 rock=mix(vec3(0.11,0.14,0.15),vec3(0.2,0.22,0.22),n3);
    vec3 bed=mix(sand,rock,smoothstep(0.48,0.7,n2))*(0.85+0.3*n3);
    float weed=smoothstep(0.7,0.86,pnoise(w/160.0+vec2(sin(T*0.6+w.y*0.01)*0.15,0.0),11))*smoothstep(0.4,0.6,n);
    bed=mix(bed,vec3(0.05,0.14,0.1),weed*0.65);
    bed+=vec3(0.35,0.6,0.58)*uCaus(w,T)*pow(1.0-D,2.0)*0.55;
    c=mix(c,bed,k);
  }
  return c;
}
vec3 seaUnderLight(vec3 c, vec2 px){
  float k=gUOn; if(k<0.002) return c;
  float D=uUA.y, T=uSeaA.w; vec2 w=gUW;
  vec3 c0=c;
  // 环境光：浅处还有天光，四五成深往下就只剩一层幽蓝（主角身边、发光的东西靠下面的光源照亮）
  float amb=mix(0.5,0.035,smoothstep(0.0,0.5,D));
  vec3 L=vec3(amb)*mix(vec3(0.55,0.85,0.95),vec3(0.35,0.55,0.85),D);
  for(int i=0;i<8;i++){ vec4 S=uUL[i]; if(S.w<0.001) continue; vec2 d=w-S.xy; L+=uULc[i]*S.w*exp(-dot(d,d)/(S.z*S.z)); }
  L=min(L,vec3(1.15));   // 几盏光叠在一起也不过曝（原先叠成一团发白）
  vec3 water=mix(vec3(0.05,0.24,0.28),vec3(0.003,0.012,0.03),smoothstep(0.0,0.55,D));
  vec3 lit=c*L*1.08;
  float vis=clamp(max(max(L.r,L.g),L.b)*1.1,0.0,1.0);
  vec3 u=mix(water,lit,vis);
  vec2 sp=px/uDpr;
  float shaft=0.0;
  for(int j=0;j<3;j++){ float fj=float(j); float x=sp.x*0.0042+sp.y*0.0016*(1.0+fj*0.2)+T*(0.03+fj*0.012)+fj*1.7; shaft+=pow(max(0.0,sin(x*6.2831*(0.6+fj*0.35))),12.0+fj*6.0)*(0.6-fj*0.15); }
  shaft*=(1.0-smoothstep(0.0,0.75,D))*(0.55+0.45*(1.0-sp.y/(uRes.y/uDpr)));
  u+=vec3(0.45,0.8,0.85)*shaft*0.22;
  float sf=uUA.z; if(sf>0.01){ float ca=uCaus(w*0.6+vec2(0.0,T*30.0),T*1.6); u=mix(u,u*1.15+vec3(0.5,0.8,0.85)*ca*0.35,sf*0.6); }
  return mix(c0,u,k);
}
`;

/** 把一帧的海况交给后期着色器（只在绝域里有值；没有时只关掉开关） */
export function setSeaUniforms(gl: WebGL2RenderingContext, u: (n: string) => WebGLUniformLocation | null, S: SeaPost | null | undefined, dpr: number, t: number, maskTex: () => WebGLTexture, unit: number) {
  if (!S) { gl.uniform4f(u('uSeaM'), 0, 0, 1, 0); gl.uniform4f(u('uUA'), 0, 0, 0, 0); gl.uniform4f(u('uShade[0]'), 0, 0, 0, 0); gl.uniform4f(u('uSeaA'), 0, 0, 0, 0); gl.uniform4f(u('uSeaD'), 1, 0, 0, 0); for (let i = 0; i < 2; i++) gl.uniform4f(u(`uStorm[${i}]`), 0, 0, 0, 0); for (let i = 0; i < 3; i++) gl.uniform4f(u(`uGFog[${i}]`), 0, 0, 0, 0); return; }
  gl.uniform4f(u('uSeaA'), S.cx, S.cy, 1, t % 3600);
  gl.uniform4f(u('uSeaB'), S.dark, S.swell, S.rift, S.gale);
  gl.uniform4f(u('uSeaC'), S.windX, S.windY, S.wind, S.flash);
  gl.uniform4f(u('uSeaD'), S.view, S.sx * dpr, S.sy * dpr, 0);
  gl.uniform4f(u('uSeaG'), S.gDark[0], S.gDark[1], S.gSwell[0], S.gSwell[1]);
  gl.uniform4f(u('uSeaG2'), S.gRift[0], S.gRift[1], S.mask ? 1 : 0, 0);
  for (let i = 0; i < 2; i++) {
    const s = S.storms[i];
    gl.uniform4f(u(`uStorm[${i}]`), s?.x ?? 0, s?.y ?? 0, s?.R ?? 0, s?.k ?? 0);
    gl.uniform4f(u(`uStormB[${i}]`), s?.eye ?? 1, s?.spin ?? 1, 0, 0);
  }
  for (let i = 0; i < 3; i++) {
    const f = S.fogs[i];
    gl.uniform4f(u(`uGFog[${i}]`), f?.x ?? 0, f?.y ?? 0, f?.rx ?? 0, f?.ry ?? 0);
    gl.uniform4f(u(`uGFogB[${i}]`), f?.ang ?? 0, f?.k ?? 0, 0, 0);
  }
  // 水下的黑影：按远近排好的最多八个；没有的那几格浓度写 0（着色器里第一格是 0 就整段跳过）
  const SH = S.shades ?? [];
  for (let i = 0; i < 8; i++) {
    const q = SH[i];
    gl.uniform4f(u(`uShade[${i}]`), q?.x ?? 0, q?.y ?? 0, q?.len ?? 1, q ? q.a : 0);
    gl.uniform4f(u(`uShadeB[${i}]`), q?.ang ?? 0, q ? q.ph % 1000 : 0, q ? q.kind + 10 * Math.min(8, q.n) : 0, q?.rise ?? 0);
  }
  // 收官 B3：海渊、血月
  const U = S.under;
  gl.uniform4f(u('uUA'), U?.k ?? 0, U?.depth ?? 0, U?.surf ?? 0, S.moon ?? 0);
  for (let i = 0; i < 8; i++) { const l = U?.lights[i]; gl.uniform4f(u(`uUL[${i}]`), l?.x ?? 0, l?.y ?? 0, l?.r ?? 1, l ? l.a : 0); gl.uniform3f(u(`uULc[${i}]`), l?.c[0] ?? 0, l?.c[1] ?? 0, l?.c[2] ?? 0); }
  // 收官 B4：介质
  const Md = S.medium;
  gl.uniform4f(u('uSeaM'), Md?.wave ?? 0, Md?.emit ?? 0, Md?.flow ?? 1, Md?.haze ?? 0);
  gl.uniform3f(u('uSeaMist'), ...(Md?.mist ?? [0.62, 0.68, 0.66] as RGB));
  gl.uniform4f(u('uSeaRain'), ...(Md?.rain ?? [0.78, 0.85, 0.92] as RGB), Md?.rainKind ?? 0);
  for (let i = 0; i < 4; i++) { const q = S.spots?.[i]; gl.uniform4f(u(`uSpot[${i}]`), q?.x ?? 0, q?.y ?? 0, q?.r ?? 0, q?.type ?? 0); }
  gl.uniform4f(u('uFloe'), S.floe?.cov ?? 0, S.floe?.g[0] ?? 0, S.floe?.g[1] ?? 0, S.floe ? 1 : 0);
  for (let i = 0; i < 2; i++) { const q = S.holes?.[i]; gl.uniform4f(u(`uHole[${i}]`), q?.x ?? 0, q?.y ?? 0, q?.r ?? 1, q?.k ?? 0); }
  const P = S.palette ?? SEA_PALETTE;
  gl.uniform3f(u('uSeaMid'), ...P.mid); gl.uniform3f(u('uSeaDeep'), ...P.deep); gl.uniform3f(u('uSeaGlow'), ...P.glow); gl.uniform3f(u('uSeaFoam'), ...P.foam);
  const tex = maskTex();
  gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex);
  const M = S.mask;
  if (M) {
    const st = maskState.get(gl);
    if (!st || st.ver !== M.ver || st.tex !== tex) {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, M.n, M.n, 0, gl.RED, gl.UNSIGNED_BYTE, M.data);
      maskState.set(gl, { ver: M.ver, tex });
    }
    gl.uniform4f(u('uSeaMaskR'), M.x0, M.y0, M.size, M.size);
  }
  gl.uniform1i(u('uSeaMask'), unit);
}
const maskState = new WeakMap<WebGL2RenderingContext, { ver: number; tex: WebGLTexture }>();
/** 无边海的水色：墨青、黑水、暗紫的裂隙光、白沫 */
export const SEA_PALETTE: { mid: RGB; deep: RGB; glow: RGB; foam: RGB } = { mid: [0.09, 0.2, 0.22], deep: [0.025, 0.035, 0.05], glow: [0.5, 0.16, 0.72], foam: [0.86, 0.9, 0.9] };
/** 新建水遮罩纹理（线性过滤、夹边） */
export function makeSeaMaskTex(gl: WebGL2RenderingContext): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([255]));
  return t;
}
