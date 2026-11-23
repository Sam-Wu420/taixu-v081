// r7-fx3d：立体打击特效（画面这一侧）。招式往 world/fx3d.ts 报要什么，这里在 HD2D 的 three.js 场景里画真 3D 的网格、粒子、着色器——
// 从侧面、斜着看都是立体的（用户原话：「特效能不能不要那么平面，我们是 three.js，尽情发挥，要让人一眼就想玩」）。
//
//   · 音障锥（sonic）：车床旋出来的圆锥壳，尖朝前、口朝后（普朗特-格劳厄脱体那种水汽锥），菲涅尔边缘亮、中间透，壳上一道道往后流的水汽纹；
//     同时一圈垂直于冲刺方向的环状激波往外炸开（ring）。
//   · 模糊拖影（smear）：沿冲刺路径一段半透明的「身形管」（头浓尾淡、从尾巴往前散），外加一把绕着路径的立体速度线（相机朝向的细带）。
//     人形残影是近战原有的残影（brawl.ghosts，带拖影），不在这里。
//   · 空间扭曲（warp）：一层薄亮的膨胀球壳；屏幕空间的折射在后期（gl/stage.ts 的 uDist，postDist() 每帧把球心、半径投到屏幕上交过去）。
//   · 火（fire）：每个火源三层网格——头前一层燃烧的压缩空气壳（和音障锥同形）、外焰锥、内焰锥（沿速度方向，噪声往后流、边缘被噪声啃掉），
//     外加相机朝向的火粒子和烟——侧面看是一根立体的火柱，斜着看是一团往后拖的火。
//   · 碎石（debris）：实例化的低多边形石块（翻滚、落地弹一下、沉下去）；蓄力时浮起的碎石（levitate）也是它们。
//   · 尘浪（dust）：一圈往外推、顶部外翻的土墙（噪声啃边，一息内散掉）+ 几团立体的尘。
//   · 光柱（column）、背后的光环（halo）。
//   · 四层爆炸（blast）：白核（实心的白热球，两三帧）→ 火球（球面噪声火、往外胀）+ 往外喷的火粒子 → 暗红余烬火星（带重力、飘一会儿）→ 灰褐烟团（最后慢慢散）。
//   · 焦痕（scorch）：贴着地形（跟着坑陷）的一片焦黑碎裂，裂缝里透暗红余烬、一明一暗，几秒后熄。
//   · 命中星闪（star）：朝着镜头的白色星形闪光，长芒对准打击方向，两三帧；外加几条朝打击方向射出去的冲击线。
// 规矩：加色的光都短命、偏细；尘、水汽用普通混合；数量都有上限、用完回收；整组没东西时藏起来、update 不被调用（零开销）。
// 头一回编着色器会卡：warmStep() 在撼山客出现在附近时每帧编一种（见 render.ts）。
// 画面这边的抖动用自己的小随机序列，不碰 Math.random。
import {
  Float32BufferAttribute, Group, Mesh, InstancedMesh, ShaderMaterial, Vector3, Vector4, Quaternion, Matrix4, Color, Scene,
  ConeGeometry, CylinderGeometry, SphereGeometry, RingGeometry, PlaneGeometry, LatheGeometry, DodecahedronGeometry,
  InstancedBufferGeometry, InstancedBufferAttribute, BufferGeometry, Vector2,
  DoubleSide, CustomBlending, AddEquation, OneFactor, ZeroFactor, OneMinusSrcAlphaFactor,
} from 'three';
import type { HdScene } from './scene';
import type { Fx3dState, Fx3dEv, RGB3 } from '../world/fx3d';
import { dentK } from '../world/fx3d';

const TAU = Math.PI * 2;
let rs = 0x5eed3d;
const r01 = () => { rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0; return rs / 4294967296; };
const rnd = (a: number, b: number) => a + r01() * (b - a);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const easeOut = (u: number) => 1 - Math.pow(1 - clamp(u, 0, 1), 3);

// ------------------------------------------------------------------ 混合：加色（不动目标的透明度）、预乘的普通混合
const ADD = { blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor, transparent: true, depthWrite: false, depthTest: true } as const;
const OVER = { blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: OneFactor, blendDstAlpha: OneMinusSrcAlphaFactor, transparent: true, depthWrite: false, depthTest: true } as const;

const NOISE = `
float h13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ return vn(p) * 0.55 + vn(p * 2.03 + 7.1) * 0.3 + vn(p * 4.07 + 3.3) * 0.15; }`;

/** 网格表面：法线、视线（世界空间）、uv、离轴向的位置 */
const SURF_VS = `
varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vL;
void main(){ vUv = uv; vL = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w; }`;

// 音障锥 / 燃烧的压缩空气壳：uA 透明度、uT 0‥1、uC 颜色、uM 0 = 水汽（白，普通混合）/ 1 = 火（加色，见 FIRE_FS 的头壳）
const SONIC_FS = `
uniform float uA; uniform float uT; uniform vec3 uC; uniform float uSeed;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
${NOISE}
void main(){
  // r8-p2：改亮（原来是普通混合的半透明灰壳，压暗时成了一块灰板）——加色：锥尖一点白热、壳面一道道往后撕开的白色气流纹、边缘冷色发光
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float s = vUv.y;   // 0 = 锥尖（前）→ 1 = 锥口（后）
  float n = fbm(vec3(vUv.x * 22.0, s * 3.2 - uT * 6.5, uSeed));
  float stri = 0.3 + 1.0 * smoothstep(0.45, 0.8, n);
  float edge = pow(f, 2.4);
  float shape = smoothstep(0.0, 0.07, s) * (1.0 - smoothstep(0.42, 1.0, s + uT * 0.45));
  float tip = smoothstep(0.16, 0.02, s) * (1.0 - uT);
  float a = ((edge * 1.7 + 0.08) * stri * shape + tip * 1.4) * uA;
  vec3 cold = vec3(0.5, 0.76, 1.3);
  vec3 c = mix(vec3(1.35, 1.32, 1.28), cold * 1.5, smoothstep(0.35, 0.95, f)) * uC;
  gl_FragColor = vec4(c * a, 1.0);
}`;
// 激波环：环面上从里到外一道亮带（外缘最亮），噪声打碎；uM 1 = 尘环（普通混合的土色）
const RING_VS = `
varying float vR; varying float vAng;
void main(){ vR = length(position.xy); vAng = atan(position.y, position.x);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RING_FS = `
uniform float uA; uniform float uT; uniform vec3 uC; uniform float uM; uniform float uSeed;
varying float vR; varying float vAng;
${NOISE}
void main(){
  float u = (vR - 0.55) / 0.45;
  float band = smoothstep(0.0, 0.8, u) * (1.0 - smoothstep(0.86, 1.0, u));
  float n = vn(vec3(vAng * 6.0, uT * 3.0, uSeed));
  float a = band * (0.55 + 0.45 * n) * uA;
  if (uM > 0.5) { gl_FragColor = vec4(uC * a, a); return; }
  gl_FragColor = vec4(uC * a * (1.0 + 1.6 * pow(u, 4.0)), a * 0.12);   // r8-p2：亮一截（外缘过曝成白）
}`;
// r8-p2：火球闪 / 太阳 / 星芒（朝镜头的方片）：uM 0 = 爆炸的火球闪（白芯、橙黄、红边、几根朝外的光刺），1 = 太阳（圆、光刺转着、外圈火焰），2 = 只有星芒
const FLARE_FS = `
uniform float uA; uniform float uT; uniform vec3 uC; uniform float uSeed; uniform float uM;
varying vec2 vUv;
${NOISE}
void main(){
  vec2 p = vUv * 2.0 - 1.0; float r = length(p), ang = atan(p.y, p.x);
  float n = fbm(vec3(p * 2.6, uT * 1.8 + uSeed));
  float sun = step(0.5, uM) * step(uM, 1.5);
  if (sun > 0.5) {
    // r9：真正的圆日（照视频 135.25s）：一个实心的圆盘——正中白黄、往外橙黄、边上橙红、边缘略暗，盘面上一层翻动的光斑；
    // 盘外一圈放射的日冕（一缕缕往外喷的橙红火焰光刺，长短不一、慢慢转）。用普通混合画（不透明的盘），不会和画面加在一起过曝成一片白
    float wob = (fbm(vec3(ang * 3.0, uT * 1.5, uSeed)) - 0.5) * 0.035;
    float R0 = 0.5 + wob;
    float disk = 1.0 - smoothstep(R0 - 0.012, R0 + 0.008, r);
    float u = clamp(r / R0, 0.0, 1.0);
    float gran = fbm(vec3(p * 9.0, uT * 2.2 + uSeed));
    vec3 dc = mix(vec3(1.35, 1.25, 0.95), vec3(1.3, 0.85, 0.22), smoothstep(0.0, 0.55, u));
    dc = mix(dc, vec3(1.15, 0.42, 0.06), smoothstep(0.55, 1.0, u));
    dc *= 0.88 + 0.22 * gran;
    float rays = fbm(vec3(ang * 9.0 + uT * 0.25, (r - R0) * 4.0 - uT * 3.5, uSeed + 5.0));
    float rl = R0 + 0.06 + 0.42 * pow(rays, 1.6);
    float cor = (1.0 - disk) * smoothstep(rl, R0 - 0.02, r) * smoothstep(R0 - 0.04, R0 + 0.02, r);
    float halo = (1.0 - disk) * exp(-max(r - R0, 0.0) * 9.0) * 0.6;
    vec3 cc = mix(vec3(1.4, 0.75, 0.15), vec3(1.0, 0.18, 0.04), smoothstep(R0, rl, r));
    float a = clamp(disk + cor * 0.9 + halo * 0.5, 0.0, 1.0) * uA;
    vec3 col = (dc * disk + cc * (cor * 0.9 + halo * 0.5)) * uA;
    gl_FragColor = vec4(col * uC, a); return;
  }
  float n2 = fbm(vec3(ang * 4.0, r * 6.0 - uT * 4.0, uSeed + 3.0));
  float body = uM > 1.5 ? 0.0 : smoothstep(0.62 - 0.08 * sun, 0.0, r + (n - 0.5) * (0.5 - 0.25 * sun) + (n2 - 0.5) * 0.25 * (1.0 - sun));
  float core = exp(-r * r * (sun > 0.5 ? 9.0 : 28.0));
  float sp = 0.0;
  for (int i = 0; i < 3; i++) { float fi = float(i); sp += pow(max(0.0, cos(ang * (3.0 + fi * 2.0) + uSeed * (1.3 + fi) + uT * sun * 0.6)), 34.0 + fi * 24.0) * (1.0 - fi * 0.28); }
  sp *= smoothstep(1.0, 0.1, r) * smoothstep(0.02, 0.18, r);
  // 太阳外圈：一圈往外蹿的火焰
  float corona = sun * smoothstep(0.9, 0.55, r + (fbm(vec3(ang * 3.0, r * 4.0 - uT * 3.0, uSeed)) - 0.5) * 0.5) * smoothstep(0.35, 0.6, r);
  // r9：再压一档白——加色的大火球 / 太阳叠在亮的画面上，原来整块过曝成白盘（逐日那一下整屏只剩一片白）：盘是橙、橙黄，白只在很小的正中
  vec3 col = mix(vec3(1.0, 0.1, 0.02), vec3(1.5, 0.45, 0.06), smoothstep(0.0, 0.45, body));
  col = mix(col, vec3(1.6, 0.8, 0.2), smoothstep(0.6, 0.92, body));
  col = mix(col, vec3(2.0, 1.5, 0.8), smoothstep(0.93, 1.0, body) * sun * 0.5);
  col *= 1.0 - 0.35 * sun;   // 太阳的盘暗一截（加色叠在亮画面上照样过曝成白：要看得出橙黄的圆盘和外圈火焰）
  vec3 c = (col * body * (0.7 + 0.35 * n2) + vec3(2.6, 2.3, 1.8) * core * (sun > 0.5 ? 0.35 : 1.0) + vec3(1.8, 1.3, 0.7) * sp * 1.2 + vec3(1.5, 0.45, 0.08) * corona) * uA;
  gl_FragColor = vec4(c * uC, 1.0);
}`;
// r8-p2：弧带（火焰弧、风刃、绕身的火环、横着的飓风环、凤翼）——一段圆弧上的带子，uArc = (起始角, 扫过的角, 半径, 带宽)，uE1 / uE2 圆所在的平面，uN 法线；
// uTall 0 = 平带（宽度沿半径：贴地的火环、甩出去的火弧）、1 = 立带（宽度沿法线：像一圈墙——飓风环）；uHead 头扫到哪（0‥1），尾巴从头往后淡（uTail 越大尾巴越短）
const ARC_VS = `
uniform vec3 uE1; uniform vec3 uE2; uniform vec3 uN; uniform vec4 uArc; uniform float uTall;
varying vec2 vUv; varying vec3 vNn; varying vec3 vV;
void main(){ vUv = uv;
  float ang = uArc.x + uv.x * uArc.y;
  vec3 radial = cos(ang) * uE1 + sin(ang) * uE2;
  float w = (uv.y - 0.5) * uArc.w;
  vec3 p = radial * (uArc.z + w * (1.0 - uTall)) + uN * (w * uTall);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vNn = uTall > 0.5 ? radial : uN; vV = cameraPosition - wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp; }`;
const ARC_FS = `
uniform float uA; uniform float uT; uniform vec3 uC; uniform float uSeed; uniform float uM; uniform float uHead; uniform float uTail;
varying vec2 vUv; varying vec3 vNn; varying vec3 vV;
${NOISE}
void main(){
  float u = vUv.x, v = vUv.y, d = uHead - u;
  if (d < 0.0) discard;
  float tail = exp(-d * uTail);
  float across = 1.0 - abs(v * 2.0 - 1.0);
  float n = fbm(vec3(u * 16.0 - uT * 7.0, v * 3.0, uSeed)), n2 = fbm(vec3(u * 40.0 - uT * 11.0, v * 6.0, uSeed + 7.0));
  float body = smoothstep(0.05, 0.7, across + (n - 0.5) * 0.7) * tail;
  float core = pow(across, 4.0) * tail * (0.6 + 0.6 * n2);
  float f = abs(dot(normalize(vNn), normalize(vV)));
  float side = 0.55 + 0.45 * pow(1.0 - f, 0.5);
  vec3 c;
  if (uM < 0.5) {        // 火：粉白的芯、橙红的身、暗红的边
    c = mix(vec3(1.2, 0.18, 0.08), vec3(1.6, 0.6, 0.25), smoothstep(0.1, 0.6, body)) * body + vec3(2.6, 1.9, 2.0) * core;
  } else if (uM < 1.5) { // 风：白芯、青蓝、外沿深蓝的细丝
    float st = smoothstep(0.45, 0.85, n2);
    c = vec3(0.25, 0.75, 1.5) * body * (0.5 + 0.8 * st) + vec3(2.2, 2.5, 2.8) * core;
  } else {               // 紫：紫白的芯、紫红的身
    c = mix(vec3(0.7, 0.12, 0.8), vec3(1.4, 0.5, 1.6), smoothstep(0.1, 0.6, body)) * body + vec3(2.4, 2.0, 2.8) * core;
  }
  gl_FragColor = vec4(c * uC * uA * side, 1.0);
}`;
// r8-p2：燃身的亮边——人身后一团竖着的、边上亮中间淡的光（朝镜头），一明一暗
const RIM_FS = `
uniform float uA; uniform float uT; uniform vec3 uC; uniform float uSeed;
varying vec2 vUv;
${NOISE}
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float n = fbm(vec3(p * 3.0 + vec2(0.0, -uT * 2.0), uSeed));
  float r = length(p) + (n - 0.5) * 0.25;
  float rim = exp(-pow((r - 0.62) / 0.12, 2.0)) * 0.9 + exp(-r * r * 5.0) * 0.18;
  float a = rim * smoothstep(1.0, 0.8, r) * uA;
  gl_FragColor = vec4(uC * a, 1.0);
}`;
// 扭曲球壳：只有薄薄一圈边（加色、淡）——折射在后期
const SHELL_FS = `
uniform float uA; uniform vec3 uC;
varying vec3 vN; varying vec3 vV;
void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); float a = pow(f, 6.0) * uA; gl_FragColor = vec4(uC * a, 1.0); }`;
// 拖影管：头浓尾淡、中间实边上虚，噪声成一道道往后拉的丝；随时间从尾巴往前散
const SMEAR_FS = `
uniform float uA; uniform float uT; uniform vec3 uC; uniform float uSeed;
varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vL;
${NOISE}
void main(){
  float f = abs(dot(normalize(vN), normalize(vV)));
  float y = vL.y;   // 0 = 尾 → 1 = 头
  float n = fbm(vec3(vUv.x * 5.0, y * 9.0 - uT * 4.0, uSeed));
  float a = pow(f, 1.4) * pow(y, 1.3) * (0.45 + 0.55 * smoothstep(0.3, 0.7, n)) * smoothstep(uT * 1.3 - 0.25, uT * 1.3, y) * uA;
  gl_FragColor = vec4(uC * a * 0.9, 1.0);   // r9：加色的一道光（原来普通混合，在 GPU 地表上合成出来是一块深灰的板子）
}`;
// 光柱：中间亮、边上虚，噪声往上流，顶上渐隐
const COLUMN_FS = `
uniform float uA; uniform float uT; uniform vec3 uC; uniform float uSeed;
varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vL;
${NOISE}
void main(){
  float f = abs(dot(normalize(vN), normalize(vV)));
  float y = vL.y;
  float n = fbm(vec3(vUv.x * 8.0, y * 6.0 - uT * 3.0, uSeed));
  float a = (pow(f, 3.0) * 1.2 + pow(f, 0.8) * 0.18) * pow(1.0 - y, 0.7) * smoothstep(0.0, 0.03, y) * (0.6 + 0.6 * n) * uA;
  gl_FragColor = vec4(uC * a, 1.0);
}`;
// 尘墙：一圈往外推、顶部外翻的土墙
const DUST_VS = `
uniform vec4 uP; varying vec2 vUv; varying float vY;
void main(){ vUv = uv; vY = position.y;
  vec3 p = position; float lean = 1.0 + uP.z * p.y * p.y; p.xz *= uP.x * lean; p.y *= uP.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`;
const DUST_FS = `
uniform float uA; uniform float uT; uniform vec3 uC; uniform float uSeed;
varying vec2 vUv; varying float vY;
${NOISE}
void main(){
  float n = fbm(vec3(vUv.x * 34.0, vY * 2.6 - uT * 1.6, uSeed));
  float a = pow(1.0 - vY, 1.25) * smoothstep(0.0, 0.07, vY) * smoothstep(0.32, 0.72, n + (1.0 - vY) * 0.3 - uT * 0.25) * uA;
  vec3 c = uC * (0.62 + 0.55 * vY + 0.25 * n);
  gl_FragColor = vec4(c * a, a);
}`;
// 背后的光环：一圈细亮环、往外的光芒、中间淡淡的光（朝着镜头的方片）
const HALO_FS = `
uniform float uA; uniform float uT; uniform vec3 uC;
varying vec2 vUv;
void main(){
  vec2 p = vUv * 2.0 - 1.0; float r = length(p), ang = atan(p.y, p.x);
  float ring = exp(-pow((r - 0.62) / 0.035, 2.0)) * 1.5 + exp(-pow((r - 0.62) / 0.12, 2.0)) * 0.35;
  float rays = pow(max(0.0, sin(ang * 14.0 + uT * 1.5)), 10.0) * smoothstep(1.0, 0.55, r) * smoothstep(0.2, 0.6, r) * 0.7;
  float glow = exp(-r * r * 4.0) * 0.25;
  float a = (ring + rays + glow) * uA * smoothstep(1.0, 0.92, r);
  gl_FragColor = vec4(uC * a, 1.0);
}`;
// 火：uV 0 头壳 / 1 外焰 / 2 内焰
const FIRE_FS = `
uniform float uA; uniform float uT; uniform float uV; uniform float uSeed; uniform vec3 uC;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
${NOISE}
vec3 ramp(float h){
  vec3 c = mix(vec3(0.35, 0.04, 0.01), vec3(0.95, 0.32, 0.06), smoothstep(0.05, 0.35, h));
  c = mix(c, vec3(1.0, 0.68, 0.22), smoothstep(0.3, 0.6, h));
  return mix(c, vec3(1.0, 0.96, 0.82), smoothstep(0.62, 0.95, h));
}
void main(){
  float f = abs(dot(normalize(vN), normalize(vV)));
  float s = vUv.y;
  if (uV < 0.5) {
    // 头前那层被压缩到燃烧的空气：边上亮、往后流
    float n = fbm(vec3(vUv.x * 14.0, s * 4.0 - uT * 7.0, uSeed));
    float e = pow(1.0 - f, 2.0);
    float a = e * smoothstep(0.0, 0.15, s) * (1.0 - smoothstep(0.45, 0.95, s)) * (0.5 + 0.7 * n) * uA;
    gl_FragColor = vec4(ramp(0.45 + 0.5 * e) * uC * a * 1.6, 1.0); return;
  }
  if (uV > 2.5) {
    // 火球（四层爆炸的第二层）：球面上的噪声火，越胀越被啃空、越来越暗红；uT 0‥1
    float n = fbm(vec3(vUv * vec2(18.0, 10.0), uT * 3.0 + uSeed)) * 0.7 + fbm(vec3(vUv * vec2(42.0, 22.0), uSeed + uT * 5.0)) * 0.3;
    float d = pow(f, 0.6) * smoothstep(uT * 0.9 + 0.05, uT * 0.9 + 0.4, n);
    float h = clamp(d * (1.35 - uT * 1.1), 0.0, 1.0);
    float a = smoothstep(0.03, 0.25, d) * uA;
    gl_FragColor = vec4(ramp(h) * uC * a * (0.8 + 1.8 * h), 1.0); return;
  }
  // 锥上的焰：s 0 = 头（人身上）→ 1 = 尾；中间（正对镜头的那一面）浓、边上虚；噪声往尾巴流、边被啃掉
  float n = fbm(vec3(vUv.x * 6.0 + uSeed, s * 4.5 - uT * 6.5, uT * 0.9 + uSeed));
  float d = pow(1.0 - s, uV > 1.5 ? 1.8 : 1.0) * pow(f, 0.9);
  d *= smoothstep(s * 0.8 - 0.05, s * 0.8 + 0.3, n);
  float h = clamp(d * (uV > 1.5 ? 1.7 : 1.15), 0.0, 1.0);
  float a = smoothstep(0.02, 0.22, d) * uA;
  gl_FragColor = vec4(ramp(h) * uC * a * (0.7 + 1.5 * h), 1.0);
}`;
// 白核：实心的白热球（中间最亮）
const CORE_FS = `
uniform float uA; uniform vec3 uC;
varying vec3 vN; varying vec3 vV;
void main(){ float f = abs(dot(normalize(vN), normalize(vV))); float a = pow(f, 1.8) * 2.6 * uA; gl_FragColor = vec4(uC * a, 1.0); }`;   // r8-p2：边上软下去（原来一个硬边的白圆盘）
// 命中星闪：朝镜头的方片上画一颗星——两道长芒（沿打击方向）、两道短芒、斜着四道细芒、中间一团白
const STAR_FS = `
uniform float uA; uniform vec3 uC;
varying vec2 vUv;
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float l1 = exp(-abs(p.y) * 38.0) * pow(max(0.0, 1.0 - abs(p.x)), 1.5);
  float l2 = exp(-abs(p.x) * 30.0) * pow(max(0.0, 1.0 - abs(p.y) * 1.7), 1.5);
  vec2 q = vec2(p.x + p.y, p.x - p.y) * 0.7071;
  float l3 = (exp(-abs(q.y) * 45.0) * max(0.0, 1.0 - abs(q.x) * 2.4) + exp(-abs(q.x) * 45.0) * max(0.0, 1.0 - abs(q.y) * 2.4)) * 0.6;
  float core = exp(-dot(p, p) * 30.0) * 1.6;
  float a = (l1 * 1.6 + l2 + l3 + core) * uA;
  gl_FragColor = vec4(uC * a, 1.0);
}`;
// 焦痕：贴地的一片焦黑碎裂，裂缝里透暗红余烬（预乘：焦黑按透明度盖上去，余烬的光直接加上）
const SCORCH_FS = `
uniform float uA; uniform float uT; uniform float uSeed; uniform float uE;
varying vec2 vUv;
${NOISE}
void main(){
  vec2 p = vUv; float r = length(p);
  float n = fbm(vec3(p * 2.6, uSeed));
  float ch = smoothstep(1.0, 0.35, r + (n - 0.5) * 0.55);
  float c1 = abs(fbm(vec3(p * 6.5, uSeed + 3.0)) - 0.5), c2 = abs(fbm(vec3(p * 13.0, uSeed + 9.0)) - 0.5);
  float crack = (smoothstep(0.05, 0.0, c1) + smoothstep(0.035, 0.0, c2) * 0.6) * smoothstep(0.95, 0.15, r);
  float flick = 0.65 + 0.35 * sin(uT * 4.0 + n * 18.0);
  vec3 glow = mix(vec3(0.75, 0.12, 0.02), vec3(1.0, 0.45, 0.08), smoothstep(0.4, 1.0, crack * flick)) * crack * flick * uE * 1.7;
  float a = ch * 0.86 * uA;
  vec3 col = vec3(0.055, 0.045, 0.04) * (0.75 + 0.5 * n);
  gl_FragColor = vec4(col * a + glow * ch, a);
}`;
const SCORCH_VS = `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// 相机朝向的粒子（火粒子、尘团）：iP 位置，iD = (大小, 转角, 透明度, 热度 / 种子)，iC 颜色
// r9：iV = 速度 × 拉长系数（世界方向）：给了就把方片的纵轴对准它在画面上的方向、按速度拉长（火舌往上卷、火星拖一道尾、往外喷的火一缕缕），没给照旧按转角
const SPRITE_VS = `
attribute vec3 iP; attribute vec4 iD; attribute vec3 iC; attribute vec3 iV;
varying vec2 vUv; varying vec4 vD; varying vec3 vC; varying float vS;
void main(){ vUv = uv; vD = iD; vC = iC;
  vec4 mv = viewMatrix * vec4(iP, 1.0);
  vec2 d = (mat3(viewMatrix) * iV).xy; float L = length(d);
  vec2 ax, ay; float s = 1.0;
  if (L > 1.0) { ay = d / L; ax = vec2(ay.y, -ay.x); s = 1.0 + min(L * 0.0028, 3.2); }
  else { float c = cos(iD.y), sn = sin(iD.y); ax = vec2(c, sn); ay = vec2(-sn, c); }
  vS = s;
  mv.xy += (ax * position.x + ay * position.y * s) * iD.x;
  gl_Position = projectionMatrix * mv; }`;
// r9：火舌——底宽头尖（头朝运动方向：往上蹿的火舌尖朝上），边被往前流的噪声啃成一缕缕；颜色按热度从暗红、橙、橙黄到白黄（白只在最热的芯），
// 饱和、不发灰（原来的圆团叠多了就成一片白雾，「这个火焰效果怎么这么平面」）。HDR：亮的地方超过 1，交给后期辉光
const FLAME_FS = `
uniform float uT;
varying vec2 vUv; varying vec4 vD; varying vec3 vC; varying float vS;
${NOISE}
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float sd = vD.y * 7.3;
  float n = vn(vec3(p.x * 2.4 + sd, p.y * 1.7 * vS - uT * 6.0, sd + uT * 0.7));
  float n2 = vn(vec3(p.x * 6.0 - sd, p.y * 4.0 * vS - uT * 11.0, sd * 1.3));
  float yy = p.y + (n2 - 0.5) * 0.45;
  float taper = mix(0.95, 0.22, smoothstep(-0.8, 1.0, yy));
  // r9：圆底、尖头的火舌（原来上下各一刀平切，叠多了是一块块方的）
  vec2 q = vec2((p.x + (n - 0.5) * 0.6 * (p.y + 1.0) * 0.5) / taper, yy * 0.92 + 0.08);
  float body = smoothstep(1.0, 0.22, length(q));
  float a = body * vD.z;
  float h = clamp(vD.w * (0.6 + 0.55 * body) - (p.y + 1.0) * 0.1, 0.0, 1.0);
  // 加色画在亮草地上容易洗成一片白：颜色压在红、橙上（绿、蓝很少），叠多了才到橙黄，白只给最热的那一点
  vec3 c = mix(vec3(0.55, 0.04, 0.0), vec3(1.0, 0.24, 0.02), smoothstep(0.08, 0.45, h));
  c = mix(c, vec3(1.0, 0.55, 0.08), smoothstep(0.5, 0.8, h));
  c = mix(c, vec3(1.0, 0.88, 0.6), smoothstep(0.9, 1.0, h));
  gl_FragColor = vec4(c * vC * a * (0.4 + 1.1 * h), 1.0);
}`;
const PUFF_FS = `
varying vec2 vUv; varying vec4 vD; varying vec3 vC; varying float vS;
${NOISE}
void main(){
  vec2 p = vUv * 2.0 - 1.0; float r = length(p);
  float n = fbm(vec3(vUv * 3.0, vD.w * 17.0));
  float a = smoothstep(1.0, 0.25, r + (n - 0.5) * 0.8) * vD.z;
  vec3 c = vC * (0.82 + 0.35 * n - 0.2 * p.y);
  gl_FragColor = vec4(c * a, a);
}`;
// 速度线：iA 起点、iB 方向 × 长，iD = (宽, 透明度, 0, 0)；相机朝向的细带
const LINE_VS = `
attribute vec3 iA; attribute vec3 iB; attribute vec4 iD; attribute vec3 iC;
varying vec2 vUv; varying float vA; varying vec3 vC;
void main(){ vUv = uv; vA = iD.y; vC = iC;
  vec3 mid = iA + iB * (position.y + 0.5);
  vec3 side = normalize(cross(iB, cameraPosition - mid) + vec3(1e-4, 0.0, 0.0));
  gl_Position = projectionMatrix * viewMatrix * vec4(mid + side * position.x * iD.x, 1.0); }`;
const LINE_FS = `
uniform vec3 uC; varying vec2 vUv; varying float vA; varying vec3 vC;
void main(){ float a = (1.0 - abs(vUv.x * 2.0 - 1.0)) * smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.6, vUv.y) * vA; gl_FragColor = vec4(uC * vC * a, 1.0); }`;
// 碎石：实例化低多边形，平面明暗（屏幕导数求法线）
const ROCK_VS = `
varying vec3 vW; varying vec3 vC;
void main(){ vec4 p = vec4(position, 1.0);
#ifdef USE_INSTANCING
  p = instanceMatrix * p;
#endif
  vec4 w = modelMatrix * p; vW = w.xyz;
#ifdef USE_INSTANCING_COLOR
  vC = instanceColor;
#else
  vC = vec3(0.42, 0.37, 0.32);
#endif
  gl_Position = projectionMatrix * viewMatrix * w; }`;
const ROCK_FS = `
varying vec3 vW; varying vec3 vC;
void main(){
  vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
  if (dot(n, cameraPosition - vW) < 0.0) n = -n;
  float d = max(dot(n, normalize(vec3(0.35, 0.85, -0.42))), 0.0);
  float rim = pow(1.0 - max(dot(n, normalize(cameraPosition - vW)), 0.0), 3.0) * 0.18;
  gl_FragColor = vec4(min(vC * (0.38 + 0.8 * d) + rim, vec3(1.0)), 1.0);
}`;

const DUST_COL: RGB3 = [0.46, 0.39, 0.31];
/** 四层爆炸的配色：白核、火（乘在焰色上）、余烬（乘）、烟 */
const PAL: Record<string, { core: RGB3; fire: RGB3; ember: RGB3; smoke: RGB3 }> = {
  fire: { core: [1, 0.97, 0.9], fire: [1, 1, 1], ember: [1, 0.8, 0.7], smoke: [0.3, 0.26, 0.22] },
  gold: { core: [1, 0.98, 0.9], fire: [1, 0.92, 0.62], ember: [1, 0.9, 0.6], smoke: [0.38, 0.33, 0.26] },
  ink: { core: [1, 1, 1], fire: [0.62, 0.62, 0.66], ember: [0.9, 0.9, 0.95], smoke: [0.07, 0.065, 0.07] },
  frost: { core: [0.92, 0.97, 1], fire: [0.5, 0.8, 1.2], ember: [0.7, 0.9, 1.2], smoke: [0.72, 0.8, 0.86] },
  void: { core: [0.96, 0.92, 1], fire: [0.8, 0.55, 1.2], ember: [0.85, 0.6, 1.2], smoke: [0.2, 0.16, 0.26] },
};
const VAPOR: RGB3 = [0.93, 0.96, 1.0];

// ------------------------------------------------------------------ 网格件（音障锥、环、球壳、拖影、光柱、尘墙、光环）
type PieceKind = 'sonic' | 'ring' | 'shell' | 'smear' | 'column' | 'dust' | 'halo' | 'core' | 'ball' | 'star' | 'scorch' | 'flare' | 'arc' | 'rim';
interface Piece { kind: PieceKind; mesh: Mesh; mat: ShaderMaterial; t: number; dur: number; live: boolean; ev: Fx3dEv | null;
  /** r8-p2 弧带：扫过的时长、自转、起始角 */
  arc?: { sweepT: number; spin: number; a0: number };
  /** three 坐标里的位置、朝向、速度；R 尺寸；p 力度 */
  pos: Vector3; dir: Vector3; vel: Vector3; R: number; p: number; len: number }
const PIECE_MAX: Record<PieceKind, number> = { sonic: 6, ring: 10, shell: 4, smear: 8, column: 3, dust: 6, halo: 2, core: 4, ball: 4, star: 4, scorch: 3, flare: 6, arc: 12, rim: 2 };

// ------------------------------------------------------------------ 火
interface FireVis { key: string; seen: number; stale: number; k: number; s: number; bow: Piece; outer: Mesh; inner: Mesh; om: ShaderMaterial; im: ShaderMaterial; pos: Vector3; vel: Vector3; acc: number; sacc: number; seed: number }
const FIRE_MAX = 4;

/** r8-p2 燃身的画面（一个人一份） */
interface AuraVis { key: string; k: number; want: number; seen: number; stale: number; cones: Mesh[]; mats: ShaderMaterial[]; rim: Piece | null; pos: Vector3; acc: number; t: number }

// ------------------------------------------------------------------ 粒子池
const FLAME_MAX = 1100, PUFF_MAX = 240, LINE_MAX = 160, ROCK_MAX = 260;   // r9：火粒子 380 → 1100（燃身的火舌、满屏的火团）

export interface Fx3dPostDist { x: number; y: number; r: number; amp: number; k: number; rim: number; w: number }

export class HsFx3D {
  readonly group = new Group();
  private pieces: Piece[] = [];
  private fires = new Map<string, FireVis>();
  private firePool: FireVis[] = [];
  private pending: Fx3dEv[] = [];
  private time = 0;
  // 几何（共用）
  private gLathe: LatheGeometry; private gRing: RingGeometry; private gSphere: SphereGeometry; private gTube: CylinderGeometry;
  private gCone: ConeGeometry; private gWall: CylinderGeometry; private gQuad: PlaneGeometry; private gArc: PlaneGeometry | null = null;
  // 粒子
  private flames: SpritePool; private puffs: SpritePool; private lines: LinePool; private rocks: RockPool;
  private warmList: { obj: Mesh; done: boolean }[] = [];
  private tmpQ = new Quaternion(); private up = new Vector3(0, 1, 0); private v3 = new Vector3();

  constructor(private readonly hd: HdScene) {
    this.group.name = 'hsfx3d';
    // 音障锥的车床剖面：尖在 y = 0.25（前），往后张开到 y = -1
    const prof: Vector2[] = [];
    for (let i = 0; i <= 14; i++) { const s = i / 14; prof.push(new Vector2(0.015 + 0.9 * Math.pow(s, 0.62), 0.25 - 1.25 * s)); }
    this.gLathe = new LatheGeometry(prof, 40);
    this.gRing = new RingGeometry(0.55, 1, 72, 1);
    this.gSphere = new SphereGeometry(1, 36, 18);
    this.gTube = new CylinderGeometry(1, 1, 1, 18, 6, true); this.gTube.translate(0, 0.5, 0);
    this.gCone = new ConeGeometry(1, 1, 24, 10, true); this.gCone.translate(0, 0.5, 0);
    this.gWall = new CylinderGeometry(1, 1, 1, 80, 3, true); this.gWall.translate(0, 0.5, 0);
    this.gQuad = new PlaneGeometry(1, 1);
    this.flames = new SpritePool(FLAME_MAX, FLAME_FS, true, this.gQuad); this.group.add(this.flames.mesh);
    this.puffs = new SpritePool(PUFF_MAX, PUFF_FS, false, this.gQuad); this.group.add(this.puffs.mesh);
    this.lines = new LinePool(LINE_MAX, this.gQuad); this.group.add(this.lines.mesh);
    this.rocks = new RockPool(ROCK_MAX); this.group.add(this.rocks.mesh);
    // 每种网格件先建一件（预热要它们；之后按需再建）
    for (const k of Object.keys(PIECE_MAX) as PieceKind[]) if (k !== 'ball') this.newPiece(k);   // ball（球面火）眼下没用上，不建不编
    this.newFire();
    for (const m of [this.flames.mesh, this.puffs.mesh, this.lines.mesh, this.rocks.mesh as unknown as Mesh]) this.warmList.push({ obj: m, done: false });
    for (const p of this.pieces) this.warmList.push({ obj: p.mesh, done: false });
    const f0 = this.firePool[0]; this.warmList.push({ obj: f0.outer, done: false });
    this.group.visible = false;
  }

  // ================================================================ 预热：每次编一种（头一回放大招不卡）
  private warmScene = new Scene();
  get warmed(): boolean { return this.warmList.every((w) => w.done); }
  warmStep(): boolean {
    const w = this.warmList.find((q) => !q.done); if (!w) return true;
    const o = w.obj, parent = o.parent, vis = o.visible, gv = this.group.visible;
    try {
      o.visible = true; this.warmScene.add(o);
      const im = o as unknown as { count?: number; geometry: { instanceCount?: number } };
      const c0 = im.count, ic0 = im.geometry.instanceCount;
      if (c0 === 0) im.count = 1; if (ic0 === 0) im.geometry.instanceCount = 1;
      this.hd.warmRender(this.warmScene, this.hd.cam);
      if (c0 === 0) im.count = 0; if (ic0 === 0) im.geometry.instanceCount = 0;
    } catch { /* 预热失败不要紧：真用到时再编 */ }
    this.warmScene.remove(o); if (parent) parent.add(o); o.visible = vis; this.group.visible = gv;
    w.done = true;
    return this.warmed;
  }

  // ================================================================ 坐标
  /** 世界 (x, y, 离地 z) → three */
  private P(x: number, y: number, z: number, out = new Vector3()): Vector3 { return out.set(x, this.hd.heightAt(x, y) + z * this.hd.boost, y); }
  /** 世界方向 → three 方向（单位） */
  private D(dx: number, dy: number, dz: number, out = new Vector3()): Vector3 { out.set(dx, dz * this.hd.boost, dy); const l = out.length(); return l > 1e-6 ? out.multiplyScalar(1 / l) : out.set(0, 1, 0); }

  // ================================================================ 每帧
  get busy(): boolean { return this.fields.length > 0 || this.pieces.some((p) => p.live) || this.fires.size > 0 || this.auraVis.size > 0 || this.pending.length > 0 || this.flames.n + this.puffs.n + this.lines.n + this.rocks.n > 0; }

  /** 有坑 / 地浪在动（焦痕要跟着地形重贴） */
  private dentLive = false; private frame = 0;
  update(S: Fx3dState | undefined, dt: number): void {
    dt = Math.min(0.05, Math.max(0, dt));
    this.time += dt; this.frame++;
    this.dentLive = !!S && (S.dents.length > 0 || S.ripples.length > 0);
    if (S) {
      for (const ev of S.q) { if (ev.delay > 0) this.pending.push(ev); else this.spawn(ev); }
      S.q.length = 0;
      this.syncFires(S, dt);
      this.syncFloats(S);
      this.syncAuras(S);
    }
    for (const a of this.auraVis.values()) this.tickAura(a, dt);
    for (let i = this.pending.length - 1; i >= 0; i--) { const ev = this.pending[i]; ev.delay -= dt; if (ev.delay <= 0) { this.pending.splice(i, 1); this.spawn(ev); } }
    for (const p of this.pieces) if (p.live) this.tickPiece(p, dt);
    if (this.fields.length) this.tickFields(dt);
    for (const f of this.fires.values()) this.tickFire(f, dt);
    this.flames.tick(dt); this.puffs.tick(dt); this.lines.tick(dt);
    this.rocks.tick(dt, (x, y) => this.hd.heightAt(x, y), (x, y, z, n) => this.dustPuffs(x, y, z, n, 0.5));
    this.flames.flush(this.time); this.puffs.flush(this.time); this.lines.flush(); this.rocks.flush();
    this.group.visible = this.busy;
  }

  // ---------------------------------------------------------------- 一次性事件
  private spawn(ev: Fx3dEv) {
    switch (ev.k) {
      case 'sonic': return this.sonic(ev);
      case 'ring': { const p = this.take('ring'); if (!p) return; this.P(ev.x, ev.y, ev.z, p.pos); this.D(ev.x2, ev.y2, ev.z2, p.dir); p.R = ev.r; p.p = ev.p; p.dur = ev.dur || 0.38; this.color(p, ev.col ?? [1, 0.98, 0.94]); p.mat.uniforms.uM.value = ev.col && Math.max(ev.col[0], ev.col[1], ev.col[2]) < 0.75 && ev.col[2] <= ev.col[0] ? 1 : 0; this.orient(p.mesh, p.dir, 'z'); return; }
      case 'smear': return this.smear(ev);
      case 'warp': { const p = this.take('shell'); if (!p) return; this.P(ev.x, ev.y, ev.z, p.pos); p.R = ev.r; p.p = ev.p; p.dur = ev.dur || 0.55; this.color(p, [0.95, 0.97, 1]); return; }
      case 'debris': return this.debris(ev);
      case 'dust': return this.dust(ev);
      case 'column': { const p = this.take('column'); if (!p) return; this.P(ev.x, ev.y, ev.z, p.pos); p.R = ev.r; p.len = ev.z2 * this.hd.boost; p.dur = ev.dur; this.color(p, ev.col ?? [1, 0.82, 0.5]); return; }
      case 'halo': { const p = this.take('halo'); if (!p) return; this.P(ev.x, ev.y, ev.z, p.pos); p.R = ev.r; p.dur = ev.dur; this.color(p, ev.col ?? [1, 0.82, 0.45]); return; }
      case 'blast': return this.blast(ev);
      case 'scorch': { const p = this.take('scorch'); if (!p) return; this.P(ev.x, ev.y, 0, p.pos); p.vel.set(ev.x, 0, ev.y); p.R = ev.r; p.dur = ev.dur; this.fitScorch(p); return; }
      case 'star': return this.star(ev);
      case 'puff': return this.dustPuffs(ev.x, ev.y, 0, 2, 0.7 * ev.p);
      case 'jet': return this.jet(ev);
      case 'flare': { const p = this.take('flare'); if (!p) return; this.P(ev.x, ev.y, ev.z, p.pos); p.R = ev.r; p.dur = ev.dur || 0.42; p.p = ev.n; p.mat.uniforms.uM.value = ev.n; this.color(p, ev.col ?? [1, 1, 1]); this.flareBlend(p, ev.n === 1); return; }
      case 'arc': return this.arcSpawn(ev);
      case 'inferno': { this.fields.push({ x: ev.x, y: ev.y, z: ev.z, R: ev.r, t: 0, dur: ev.dur || 0.8, p: ev.p, acc: 0, eacc: 0, up: ev.up }); if (this.fields.length > 12) this.fields.shift(); return; }
    }
  }
  /** r8-p2 弧带：圆所在的平面（three 坐标）、扫的角度、半径带宽交给着色器 */
  private arcSpawn(ev: Fx3dEv) {
    const A = ev.arc; if (!A) return;
    const p = this.take('arc'); if (!p) return;
    this.P(ev.x, ev.y, ev.z, p.pos);
    const n = this.D(ev.x2, ev.y2, ev.z2, new Vector3());
    let e1 = new Vector3(A.e1[0], A.e1[2] * this.hd.boost, A.e1[1]);
    e1.addScaledVector(n, -e1.dot(n));
    if (e1.lengthSq() < 1e-6) e1 = this.perp(n, 0); else e1.normalize();
    const e2 = new Vector3().crossVectors(n, e1).normalize();
    const U = p.mat.uniforms;
    (U.uE1.value as Vector3).copy(e1); (U.uE2.value as Vector3).copy(e2); (U.uN.value as Vector3).copy(n);
    (U.uArc.value as Vector4).set(A.a0, A.sweep, ev.r, A.w);
    U.uTall.value = A.tall ? 1 : 0; U.uM.value = A.mode === 'wind' ? 1 : A.mode === 'purple' ? 2 : 0; U.uTail.value = A.tail;
    p.dur = ev.dur || 0.5; p.p = ev.p; p.arc = { sweepT: Math.max(0.01, A.sweepT), spin: A.spin, a0: A.a0 };
    this.color(p, ev.col ?? [1, 1, 1]);
    p.mesh.position.copy(p.pos); p.mesh.quaternion.identity(); p.mesh.scale.set(1, 1, 1);
  }
  /** 四层爆炸 */
  private blast(ev: Fx3dEv) {
    const pal = PAL[ev.pal ?? 'fire'] ?? PAL.fire, R = ev.r, p = ev.p, c = this.P(ev.x, ev.y, ev.z);
    c.y += R * 0.25;
    // 1. 白核：两三帧
    const relay = ev.n < 0;   // 火龙的接力：只喷火
    // r8-p2：终结技那一档（力度 ≥ 2.4）——参考视频命中那一下是半屏大的白黄火球：白芯过曝、橙黄、红边，带往外放射的光刺
    const big = !relay && p >= 2.4 && ev.pal !== 'ink';
    const k = relay ? null : this.take('core'); if (k) { k.pos.copy(c); k.R = R * (big ? 0.6 : 0.34); k.dur = 0.07 + 0.015 * p; this.color(k, big ? [2.2, 2, 1.6] : pal.core); }   // r9：小火爆的白核收小（推近的镜头里一个白球把被打的人罩住）
    if (big) {
      const f = this.take('flare');
      if (f) { f.pos.copy(c); f.R = R * 1.15; f.dur = 0.4; f.p = 0; f.mat.uniforms.uM.value = 0; this.flareBlend(f, false); this.color(f, pal === PAL.fire ? [0.95, 0.72, 0.5] : pal.fire); }   // r9：火球闪压成橙黄（原来一整块白盘）
      // 光刺：十几道又亮又细的长芒往外射（偏水平——视频里是朝两侧和上方炸开的）
      for (let i = 0; i < 16; i++) {
        const a = rnd(0, TAU), e = rnd(-0.25, 0.9), d = new Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
        this.lines.add(c.x, c.y, c.z, d.x, d.y, d.z, rnd(1.2, 2.6) * R, rnd(10, 22), 2.6, rnd(0.12, 0.22), r01() < 0.5 ? [1.3, 1.2, 1] : [1.4, 0.9, 0.45], rnd(1800, 3200));
      }
    }
    // 2. 火球 + 往外喷的火粒子
    // （球面火 ball 试过：看着像一个个带条纹的橙色球，不像火——改成一团团重叠的火粒子堆出火球的体积）
    const nf = Math.round((big ? 70 : 40) + 22 * Math.min(p, 4));
    for (let i = 0; i < nf; i++) {
      const a = rnd(0, TAU), e = rnd(-0.3, 1.1), v = rnd(0.5, 2.6) * R, ce = Math.cos(e), core = i < nf * 0.35;
      if (big) this.flames.add(c.x + rnd(-0.25, 0.25) * R, c.y + rnd(-0.1, 0.35) * R, c.z + rnd(-0.25, 0.25) * R, Math.cos(a) * ce * v * 0.8, Math.sin(e) * v * 0.8 + R * 0.6, Math.sin(a) * ce * v * 0.8,
        rnd(0.5, 0.9) * R * (core ? 1.25 : 1), rnd(0.8, 1.35) * R, rnd(0.32, 0.7), pal.fire, core ? 1.0 : 0.95, 3.0, core ? rnd(0.72, 0.95) : rnd(0.28, 0.72), 0, 0.6);   // 芯白热、外头橙红（不要整团糊成白）
      else this.flames.add(c.x + rnd(-0.2, 0.2) * R, c.y + rnd(-0.1, 0.3) * R, c.z + rnd(-0.2, 0.2) * R, Math.cos(a) * ce * v, Math.sin(e) * v + R * 0.7, Math.sin(a) * ce * v,
        rnd(0.45, 0.85) * R * (core ? 1.3 : 1), rnd(0.15, 0.35) * R, rnd(0.25, 0.55), pal.fire, 0.6, 3.4, core ? rnd(0.62, 0.85) : rnd(0.3, 0.72), 0, 0.6);   // r9：小火爆不再一团发白（芯橙黄、外头橙红）
    }
    // 3. 余烬火星：小、亮、带重力，飘一会儿
    const ne = Math.round(18 + 12 * p);
    for (let i = 0; i < ne; i++) {
      const a = rnd(0, TAU), e = rnd(0.1, 1.2), v = rnd(1.2, 3.2) * R;
      this.flames.add(c.x, c.y, c.z, Math.cos(a) * Math.cos(e) * v, Math.sin(e) * v, Math.sin(a) * Math.cos(e) * v, rnd(7, 13), rnd(3, 6), rnd(0.8, 1.6), pal.ember, 1, 1.1, rnd(0.25, 0.5), 900, 0.5);
    }
    // 4. 烟：最后慢慢散（普通混合，往上飘、胀开）。r8-p2：火龙的接力火球不冒烟（原来一条火龙拖出一大片灰烟、一息半散不掉）
    const ns = relay ? 0 : Math.round(8 + 5 * Math.min(p, 3));
    for (let i = 0; i < ns; i++) {
      const a = rnd(0, TAU), v = rnd(0.3, 0.9) * R;
      this.puffs.add(c.x + Math.cos(a) * R * 0.3, c.y + rnd(0, R * 0.4), c.z + Math.sin(a) * R * 0.3, Math.cos(a) * v, rnd(0.25, 0.6) * R, Math.sin(a) * v, R * rnd(0.7, 1), R * rnd(1.7, 2.4), rnd(1.0, 1.6), pal.smoke, 0.45, 1.3, 0);
    }
  }
  /** 往前喷的火龙（spread ≥ π：绕身一圈甩出去的火）：一股火粒子沿方向喷出去，沿途几团接力的火球 */
  private jet(ev: Fx3dEv) {
    const pal = PAL[ev.pal ?? 'fire'] ?? PAL.fire, c = this.P(ev.x, ev.y, ev.z), d = this.D(ev.x2, ev.y2, ev.z2), L = ev.r, p = ev.p;
    const round = ev.spread >= 3, hot = p >= 2;   // r8-p2：力度 ≥ 2 的火龙（终结技）更长更亮：白热的芯、粗、过曝
    const n = Math.round((round ? 46 : hot ? 110 : 70) * Math.min(2, p));
    for (let i = 0; i < n; i++) {
      let dir: Vector3;
      if (round) { const a = rnd(0, TAU); dir = new Vector3(Math.cos(a), rnd(-0.05, 0.25), Math.sin(a)).normalize(); }
      else dir = this.perp(d, rnd(0, TAU)).multiplyScalar(rnd(0, ev.spread) * (hot && i % 3 === 0 ? 0.35 : 1)).add(d).normalize();
      const v = L * rnd(1.6, 3.4), s0 = rnd(50, 110) * (0.7 + 0.3 * p) * (hot ? 1.25 : 1), core = hot && i % 3 === 0;
      this.flames.add(c.x + dir.x * rnd(0, 40), c.y + dir.y * rnd(0, 40), c.z + dir.z * rnd(0, 40), dir.x * v, dir.y * v + rnd(0, 120), dir.z * v, s0, s0 * rnd(1.4, 2.2), rnd(0.28, 0.5) * (hot ? 1.3 : 1), pal.fire, hot ? (core ? 1.15 : 1.0) : 0.85, 3.4, core ? rnd(0.75, 0.95) : hot ? rnd(0.3, 0.8) : rnd(0.5, 1), 0, 0.45);
    }
    if (!round) {
      // 沿途接力的火球：一团比一团远、一团比一团晚，像一条往前窜的火龙
      for (let i = 1; i <= 3; i++) {
        const u = i / 3.4;
        this.pending.push({ ...ev, k: 'blast', n: -1, x: ev.x + ev.x2 * L * u, y: ev.y + ev.y2 * L * u, z: ev.z + ev.z2 * L * u, r: 130 * (0.7 + 0.3 * p) * (1 + u * 0.6), p: p * (1 - u * 0.4), delay: u * 0.16 });
      }
      for (let i = 0; i < 10; i++) { const sp = this.perp(d, rnd(0, TAU)).multiplyScalar(rnd(0, 0.15)).add(d).normalize(); this.lines.add(c.x, c.y, c.z, sp.x, sp.y, sp.z, rnd(300, 700), rnd(6, 12), 1, rnd(0.1, 0.18), [1, 0.85, 0.6], rnd(3000, 5000)); }
    }
  }
  /** 命中星闪 + 冲击线 */
  private star(ev: Fx3dEv) {
    const p = this.take('star'); if (!p) return;
    this.P(ev.x, ev.y, ev.z, p.pos); this.D(ev.x2, ev.y2, ev.z2, p.dir); p.R = ev.r; p.p = ev.p; p.dur = 0.075;
    this.color(p, [1, 0.99, 0.95]);
    for (let i = 0; i < 9; i++) {
      const sp = this.perp(p.dir, rnd(0, TAU)).multiplyScalar(rnd(0, 0.35)).add(p.dir).normalize();
      this.lines.add(p.pos.x, p.pos.y, p.pos.z, sp.x, sp.y, sp.z, rnd(260, 560) * (0.7 + 0.3 * ev.p), rnd(5, 10), 1, rnd(0.09, 0.15), [1, 1, 1], rnd(2600, 4200));
    }
  }
  /** 焦痕的网格贴着地形（坑陷下去时跟着陷） */
  private fitScorch(p: Piece) {
    const pos = p.mesh.geometry.getAttribute('position') as Float32BufferAttribute, uv = p.mesh.geometry.getAttribute('uv') as Float32BufferAttribute;
    const cx = p.vel.x, cy = p.vel.z, R = p.R, g0 = this.hd.heightAt(cx, cy);
    for (let i = 0; i < pos.count; i++) { const x = cx + uv.getX(i) * R, y = cy + uv.getY(i) * R; pos.setXYZ(i, uv.getX(i) * R, this.hd.heightAt(x, y) - g0 + 3, uv.getY(i) * R); }
    pos.needsUpdate = true;
    p.mesh.position.set(cx, g0, cy);
  }
  private sonic(ev: Fx3dEv) {
    const p = this.take('sonic'); if (!p) return;
    this.P(ev.x, ev.y, ev.z, p.pos); this.D(ev.x2, ev.y2, ev.z2, p.dir);
    p.vel.set(ev.vx, ev.vz * this.hd.boost, ev.vy).multiplyScalar(0.15); p.p = ev.p; p.R = 72 * (0.7 + 0.3 * ev.p); p.dur = 0.36;
    const fire = !!ev.col && ev.col[1] < 0.8;
    this.color(p, ev.col ?? VAPOR);
    this.orient(p.mesh, p.dir, 'y');
    // 环状激波：垂直于冲刺方向、比锥口大一圈，往外炸开
    const r = this.take('ring');
    if (r) { r.pos.copy(p.pos).addScaledVector(p.dir, -20); r.dir.copy(p.dir); r.R = 210 * (0.7 + 0.3 * ev.p); r.p = ev.p; r.dur = 0.34; this.color(r, fire ? [1, 0.75, 0.45] : [1, 1, 1]); r.mat.uniforms.uM.value = 0; this.orient(r.mesh, r.dir, 'z'); }
    // 往后飞散的水汽丝（速度线）
    for (let i = 0; i < 10; i++) {
      const a = rnd(0, TAU), rr = rnd(30, 90) * (0.7 + 0.3 * ev.p), side = this.perp(p.dir, a);
      this.lines.add(p.pos.x + side.x * rr, p.pos.y + side.y * rr, p.pos.z + side.z * rr, -p.dir.x, -p.dir.y, -p.dir.z, rnd(140, 320), rnd(2, 4), 0.7, rnd(0.14, 0.24), fire ? [1, 0.7, 0.4] : [1, 1, 1], 700);
    }
  }
  private smear(ev: Fx3dEv) {
    const p = this.take('smear'); if (!p) return;
    const a = this.P(ev.x, ev.y, ev.z), b = this.P(ev.x2, ev.y2, ev.z2);
    const d = b.clone().sub(a), L = d.length(); if (L < 10) { p.live = false; return; }
    p.pos.copy(a); p.dir.copy(d).multiplyScalar(1 / L); p.len = L; p.R = ev.r; p.dur = ev.dur || 0.32;
    { const top = ev.p === 2; p.mat.depthTest = !top; p.mesh.renderOrder = top ? 30 : 7; }   // r19：smear({ top }) 画在最上面
    this.color(p, ev.col ?? [0.9, 0.88, 0.84]);
    this.orient(p.mesh, p.dir, 'y');
    // 绕着路径一把立体速度线
    const n = Math.min(18, 6 + Math.round(L / 90));
    for (let i = 0; i < n; i++) {
      const ang = rnd(0, TAU), rr = rnd(ev.r * 0.6, ev.r * 2.6), side = this.perp(p.dir, ang), u = rnd(0, 0.85);
      const x = a.x + d.x * u + side.x * rr, y = a.y + d.y * u + side.y * rr + rnd(-20, 60), z = a.z + d.z * u + side.z * rr;
      this.lines.add(x, y, z, p.dir.x, p.dir.y, p.dir.z, rnd(0.2, 0.45) * L, rnd(2, 3.5), 0.7, rnd(0.14, 0.26), ev.col && ev.col[0] < 0.4 ? [0.85, 0.85, 0.9] : [1, 1, 1], 0);
    }
  }
  private debris(ev: Fx3dEv) {
    const n = Math.min(80, Math.max(1, Math.round(ev.n)));
    const base = ev.z, size = ev.dur || 1;
    for (let i = 0; i < n; i++) {
      const a = ev.dir + rnd(-ev.spread, ev.spread), rr = rnd(0, ev.r) * Math.sqrt(r01());
      const x = ev.x + Math.cos(a) * rr * 0.6, y = ev.y + Math.sin(a) * rr * 0.6;
      const sp = rnd(250, 900) * ev.p, up = rnd(600, 1500) * ev.up * (0.6 + 0.4 * ev.p);
      const s = rnd(7, 22) * size * (0.8 + 0.2 * ev.p) * (r01() < 0.12 ? 1.9 : 1);
      this.rocks.add(x, this.hd.heightAt(x, y) + base * this.hd.boost + rnd(2, 20), y, Math.cos(a) * sp, up, Math.sin(a) * sp, s, rnd(1.6, 3.2), 0, '', 0, !!ev.col);
    }
    // 碎石飞起处一团尘
    this.dustPuffs(ev.x, ev.y, base, Math.min(10, 3 + n / 5), ev.r / 160);
  }
  private dust(ev: Fx3dEv) {
    const p = this.take('dust'); if (!p) return;
    this.P(ev.x, ev.y, 0, p.pos); p.pos.y -= 6; p.R = ev.r; p.p = ev.p; p.dur = 0.9 + 0.25 * Math.min(2, ev.p);
    this.color(p, ev.col ?? DUST_COL);
    // 尘墙外侧一圈立体的尘团，跟着往外推
    const n = Math.round(10 + 6 * Math.min(3, ev.p));
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + rnd(-0.15, 0.15), r0 = ev.r * 0.25, x = ev.x + Math.cos(a) * r0, y = ev.y + Math.sin(a) * r0, v = ev.r * rnd(0.9, 1.3);
      this.puffs.add(x, this.hd.heightAt(x, y) + rnd(20, 70), y, Math.cos(a) * v, rnd(60, 160), Math.sin(a) * v, rnd(70, 110) * (0.6 + 0.2 * ev.p), rnd(180, 260) * (0.6 + 0.2 * ev.p), rnd(0.7, 1.1), ev.col ?? DUST_COL, 0.55, 2.4, 0);
    }
  }
  /** 地上冒几团尘（碎石落地、起跳） */
  private dustPuffs(x: number, y: number, z: number, n: number, k: number) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), v = rnd(60, 220) * Math.max(0.5, k);
      this.puffs.add(x + Math.cos(a) * 20, this.hd.heightAt(x, y) + z * this.hd.boost + rnd(10, 40), y + Math.sin(a) * 20, Math.cos(a) * v, rnd(40, 140), Math.sin(a) * v, rnd(30, 60) * Math.max(0.6, k), rnd(90, 160) * Math.max(0.6, k), rnd(0.5, 0.9), DUST_COL, 0.45, 2, 0);
    }
  }

  // ---------------------------------------------------------------- 网格件
  private newPiece(kind: PieceKind): Piece {
    const u = { uA: { value: 0 }, uT: { value: 0 }, uC: { value: new Color(1, 1, 1) }, uM: { value: 0 }, uSeed: { value: r01() * 100 }, uP: { value: new Vector4() }, uV: { value: 0 } };
    let mat: ShaderMaterial, geo: BufferGeometry;
    switch (kind) {
      case 'sonic': mat = new ShaderMaterial({ vertexShader: SURF_VS, fragmentShader: SONIC_FS, uniforms: u, side: DoubleSide, ...ADD }); geo = this.gLathe; break;   // r8-p2：加色（亮的气流，不再是灰板）
      case 'ring': mat = new ShaderMaterial({ vertexShader: RING_VS, fragmentShader: RING_FS, uniforms: u, side: DoubleSide, ...OVER }); geo = this.gRing; break;
      case 'shell': mat = new ShaderMaterial({ vertexShader: SURF_VS, fragmentShader: SHELL_FS, uniforms: u, ...ADD }); geo = this.gSphere; break;
      case 'smear': mat = new ShaderMaterial({ vertexShader: SURF_VS, fragmentShader: SMEAR_FS, uniforms: u, side: DoubleSide, ...ADD }); geo = this.gTube; break;
      case 'column': mat = new ShaderMaterial({ vertexShader: SURF_VS, fragmentShader: COLUMN_FS, uniforms: u, side: DoubleSide, ...ADD }); geo = this.gTube; break;
      case 'dust': mat = new ShaderMaterial({ vertexShader: DUST_VS, fragmentShader: DUST_FS, uniforms: u, side: DoubleSide, ...OVER }); geo = this.gWall; break;
      case 'halo': mat = new ShaderMaterial({ vertexShader: SURF_VS, fragmentShader: HALO_FS, uniforms: u, side: DoubleSide, ...ADD }); geo = this.gQuad; break;
      case 'core': mat = new ShaderMaterial({ vertexShader: SURF_VS, fragmentShader: CORE_FS, uniforms: u, ...ADD }); geo = this.gSphere; break;
      case 'ball': mat = new ShaderMaterial({ vertexShader: SURF_VS, fragmentShader: FIRE_FS, uniforms: { ...u, uV: { value: 3 } }, side: DoubleSide, ...ADD }); geo = this.gSphere; break;
      case 'star': mat = new ShaderMaterial({ vertexShader: SURF_VS, fragmentShader: STAR_FS, uniforms: u, side: DoubleSide, ...ADD }); geo = this.gQuad; break;
      case 'scorch': mat = new ShaderMaterial({ vertexShader: SCORCH_VS, fragmentShader: SCORCH_FS, uniforms: { ...u, uE: { value: 1 } }, ...OVER, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }); geo = scorchGeo(); break;
      case 'flare': mat = new ShaderMaterial({ vertexShader: SURF_VS, fragmentShader: FLARE_FS, uniforms: u, side: DoubleSide, ...ADD, depthTest: false }); geo = this.gQuad; break;
      case 'rim': mat = new ShaderMaterial({ vertexShader: SURF_VS, fragmentShader: RIM_FS, uniforms: u, side: DoubleSide, ...ADD }); geo = this.gQuad; break;
      case 'arc': mat = new ShaderMaterial({ vertexShader: ARC_VS, fragmentShader: ARC_FS, side: DoubleSide, ...ADD,
        uniforms: { ...u, uE1: { value: new Vector3(1, 0, 0) }, uE2: { value: new Vector3(0, 0, 1) }, uN: { value: new Vector3(0, 1, 0) }, uArc: { value: new Vector4(0, 1, 100, 30) }, uTall: { value: 0 }, uHead: { value: 0 }, uTail: { value: 3 } } });
        geo = (this.gArc ??= new PlaneGeometry(1, 1, 96, 3)); break;
    }
    const mesh = new Mesh(geo, mat); mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = kind === 'scorch' ? 3 : kind === 'dust' ? 5 : kind === 'flare' ? 10 : 7;
    this.group.add(mesh);
    const p: Piece = { kind, mesh, mat, t: 0, dur: 1, live: false, ev: null, pos: new Vector3(), dir: new Vector3(0, 1, 0), vel: new Vector3(), R: 1, p: 1, len: 1 };
    this.pieces.push(p);
    return p;
  }
  private take(kind: PieceKind): Piece | null {
    let p = this.pieces.find((q) => q.kind === kind && !q.live);
    if (!p) {
      const n = this.pieces.filter((q) => q.kind === kind).length;
      if (n < PIECE_MAX[kind]) p = this.newPiece(kind);
      else { p = this.pieces.filter((q) => q.kind === kind).sort((a, b) => b.t / b.dur - a.t / a.dur)[0]; }   // 满了：最老的那件让出来
    }
    p.live = true; p.t = 0; p.mesh.visible = true; p.vel.set(0, 0, 0); p.mat.uniforms.uSeed.value = r01() * 100;
    return p;
  }
  /** r9：太阳用普通混合（不透明的圆盘），火球闪 / 星芒照旧加色 */
  private flareBlend(p: Piece, sun: boolean) {
    const m = p.mat;
    m.blendDst = sun ? OneMinusSrcAlphaFactor : OneFactor; m.blendSrcAlpha = OneFactor; m.blendDstAlpha = sun ? OneMinusSrcAlphaFactor : OneFactor;
    if (!sun) m.blendSrcAlpha = ZeroFactor;
  }
  private color(p: Piece, c: RGB3) { (p.mat.uniforms.uC.value as Color).setRGB(c[0], c[1], c[2]); }
  /** 让网格的 axis 轴对准方向 d */
  private orient(m: Mesh, d: Vector3, axis: 'y' | 'z') { m.quaternion.setFromUnitVectors(axis === 'y' ? this.up : this.v3.set(0, 0, 1), d); }
  /** 和 d 垂直的一个方向（绕 d 转 a） */
  private perp(d: Vector3, a: number): Vector3 {
    const t = Math.abs(d.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
    const u = new Vector3().crossVectors(d, t).normalize(), v = new Vector3().crossVectors(d, u);
    return u.multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
  }
  private tickPiece(p: Piece, dt: number) {
    p.t += dt;
    const u = p.t / p.dur, U = p.mat.uniforms, m = p.mesh;
    if (u >= 1) { p.live = false; m.visible = false; return; }
    U.uT.value = u;
    switch (p.kind) {
      case 'sonic': {
        // 跟着冲出去一小段（速度很快衰减），锥壳越张越大、淡掉
        p.pos.addScaledVector(p.vel, dt * Math.exp(-p.t * 9));
        const s = p.R * (0.75 + 0.7 * easeOut(u * 1.3));
        m.position.copy(p.pos); m.scale.set(s, s * 1.15, s);
        U.uA.value = Math.min(1, p.t / 0.035) * Math.pow(1 - u, 1.4) * (0.75 + 0.25 * p.p);
        break;
      }
      case 'ring': {
        const s = p.R * (0.12 + 0.88 * easeOut(u));
        m.position.copy(p.pos); m.scale.set(s, s, s);
        U.uA.value = Math.min(1, p.t / 0.03) * Math.pow(1 - u, 1.6) * Math.min(1.2, 0.6 + 0.3 * p.p);
        break;
      }
      case 'shell': {
        const s = p.R * easeOut(u * 1.1);
        m.position.copy(p.pos); m.scale.set(s, s, s);
        U.uA.value = Math.min(1, p.t / 0.04) * Math.pow(1 - u, 2) * 0.3 * Math.min(1.5, p.p);   // r8-p2：0.55 → 0.3（推近的镜头里成了一个个玻璃圆圈）
        break;
      }
      case 'smear': {
        m.position.copy(p.pos); m.scale.set(p.R, p.len, p.R);
        U.uA.value = Math.pow(1 - u, 1.2) * 0.85;
        break;
      }
      case 'column': {
        const w = p.R * (0.6 + 0.6 * easeOut(u * 2));
        m.position.copy(p.pos); m.scale.set(w, p.len, w);
        U.uA.value = Math.min(1, p.t / 0.06) * Math.pow(1 - u, 1.3) * 0.26;
        // r9：火柱（暖色的）里一路往上翻的火舌——光柱只是芯，外面裹一层立体的火
        const C0 = U.uC.value as Color;
        if (C0.r > C0.b * 1.4 && u < 0.6) {
          let acc = (this.arcAcc.get(p) ?? 0) + dt * 260 * Math.min(2, p.len / 1500);
          while (acc >= 1) { acc -= 1; const h = Math.pow(r01(), 1.6) * p.len * 0.55, a = rnd(0, TAU), rr = w * rnd(0.3, 1.1), s0 = w * rnd(1.4, 2.6); this.flames.add(p.pos.x + Math.cos(a) * rr, p.pos.y + h, p.pos.z + Math.sin(a) * rr, Math.cos(a) * 60, rnd(700, 1300), Math.sin(a) * 60, s0, s0 * 0.4, rnd(0.25, 0.45), [1, 0.85, 0.7], 0.7, 1.4, rnd(0.55, 1), 0, 1); }
          this.arcAcc.set(p, acc);
        }
        break;
      }
      case 'dust': {
        const R = p.R * (0.22 + 0.78 * easeOut(u * 1.15)), H = p.R * 0.3 * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, u * 1.25)));
        m.position.copy(p.pos); m.scale.set(1, 1, 1);
        (U.uP.value as Vector4).set(R, Math.max(10, H), 0.55, u);
        U.uA.value = Math.min(1, p.t / 0.05) * Math.pow(1 - u, 1.1) * Math.min(1, 0.55 + 0.25 * p.p);
        break;
      }
      case 'core': {
        const s = p.R * (0.45 + 0.55 * easeOut(u * 1.5));
        m.position.copy(p.pos); m.scale.set(s, s, s);
        U.uA.value = 1 - u * 0.5;
        break;
      }
      case 'ball': {
        const s = p.R * (0.35 + 0.85 * easeOut(u * 1.2));
        m.position.copy(p.pos); m.position.y += p.R * 0.3 * u; m.scale.set(s, s * 0.9, s);
        U.uA.value = Math.min(1, p.t / 0.03) * (1 - u * u) * Math.min(1.3, 0.8 + 0.2 * p.p);
        break;
      }
      case 'star': {
        const cam = this.hd.cam, hd = this.hd;
        // 长芒对准打击方向（投到屏幕上算角度）
        const a = hd.projectAbsolute(p.pos.x, p.pos.z, p.pos.y), b = hd.projectAbsolute(p.pos.x + p.dir.x * 100, p.pos.z + p.dir.z * 100, p.pos.y + p.dir.y * 100);
        const ang = Math.atan2(-(b.y - a.y), b.x - a.x);
        m.position.copy(p.pos); m.quaternion.copy(cam.quaternion); m.rotateZ(ang);
        // r9：收小（原来长芒拉到人的五六倍宽、一闪把被打的人整个盖成白）——照视频是一块比人小的星闪，被打的人还看得见
        const s = p.R * (0.55 + 0.55 * easeOut(u * 1.4)); m.scale.set(s * 2.0, s, 1);
        U.uA.value = (u < 0.5 ? 1 : 1 - (u - 0.5) * 1.6) * 0.8;
        break;
      }
      case 'scorch': {
        if ((this.dentLive || p.t < 0.2) && (this.frame & 1) === 0) this.fitScorch(p);
        U.uA.value = Math.min(1, p.t / 0.15) * (u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1);
        U.uE.value = Math.max(0, 1 - u / 0.65) * Math.min(1, p.t / 0.1);
        U.uT.value = p.t;
        break;
      }
      case 'flare': {
        // 火球闪一下子胀开（头一成时间到头）再慢慢缩、退；太阳一直在、慢慢胀；星芒一闪
        const cam = this.hd.cam, sun = p.p === 1, star = p.p === 2;
        const s = p.R * (sun ? 0.7 + 0.35 * easeOut(u * 1.5) : star ? 0.4 + 0.8 * easeOut(u * 4) : 0.45 + 0.75 * easeOut(u * 5) - 0.25 * u);
        m.position.copy(p.pos); m.quaternion.copy(cam.quaternion); m.scale.set(s * 2, s * 2, 1);
        U.uA.value = Math.min(1, p.t / 0.03) * (sun ? (u > 0.75 ? 1 - (u - 0.75) / 0.25 : 1) : star ? 1 - u : Math.pow(1 - u, 1.5));
        U.uT.value = p.t;
        break;
      }
      case 'arc': {
        const A = p.arc!;
        (U.uArc.value as Vector4).x = A.a0 + A.spin * p.t;
        U.uHead.value = p.t / A.sweepT;
        // r9：火 / 紫的弧带不只是一条光带——弧头扫过的地方一路甩出火舌（沿切线甩出去、往上卷），给弧带一层立体的火
        if (U.uM.value !== 1 && u < 0.7) this.arcFlames(p, dt);
        U.uA.value = Math.min(1, p.t / 0.03) * Math.pow(1 - u, 1.1) * Math.min(1.6, 0.6 + 0.4 * p.p);
        U.uT.value = p.t;
        m.position.copy(p.pos);
        break;
      }
      case 'halo': {
        const cam = this.hd.cam, s = p.R * (0.85 + 0.25 * easeOut(u * 2));
        // 放在人身后（离镜头远一点），朝着镜头
        const back = this.v3.copy(p.pos).sub(cam.position).normalize().multiplyScalar(60);
        m.position.copy(p.pos).add(back); m.quaternion.copy(cam.quaternion); m.scale.set(s * 2, s * 2, 1);
        U.uA.value = Math.min(1, p.t / 0.08) * (u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1);
        break;
      }
    }
  }

  // ---------------------------------------------------------------- 火
  private newFire(): FireVis {
    const tint = () => ({ value: new Color(1, 1, 1) });
    const bowMat = new ShaderMaterial({ vertexShader: SURF_VS, fragmentShader: FIRE_FS, uniforms: { uA: { value: 0 }, uT: { value: 0 }, uV: { value: 0 }, uSeed: { value: r01() * 50 }, uC: tint() }, side: DoubleSide, ...ADD });
    const bow: Piece = { kind: 'sonic', mesh: new Mesh(this.gLathe, bowMat), mat: bowMat, t: 0, dur: 1, live: false, ev: null, pos: new Vector3(), dir: new Vector3(), vel: new Vector3(), R: 1, p: 1, len: 1 };
    const om = new ShaderMaterial({ vertexShader: SURF_VS, fragmentShader: FIRE_FS, uniforms: { uA: { value: 0 }, uT: { value: 0 }, uV: { value: 1 }, uSeed: { value: r01() * 50 }, uC: tint() }, side: DoubleSide, ...ADD });
    const im = new ShaderMaterial({ vertexShader: SURF_VS, fragmentShader: FIRE_FS, uniforms: { uA: { value: 0 }, uT: { value: 0 }, uV: { value: 2 }, uSeed: { value: r01() * 50 }, uC: tint() }, side: DoubleSide, ...ADD });
    const outer = new Mesh(this.gCone, om), inner = new Mesh(this.gCone, im);
    for (const m of [bow.mesh, outer, inner]) { m.frustumCulled = false; m.visible = false; m.renderOrder = 8; this.group.add(m); }
    const f: FireVis = { key: '', seen: -1, stale: 0, k: 0, s: 1, bow, outer, inner, om, im, pos: new Vector3(), vel: new Vector3(), acc: 0, sacc: 0, seed: r01() * 50 };
    this.firePool.push(f);
    return f;
  }
  private syncFires(S: Fx3dState, dt: number) {
    for (const [key, src] of S.fires) {
      let f = this.fires.get(key);
      if (!f) {
        f = this.firePool.find((q) => !this.fires.has(q.key) || q.key === '') ?? (this.firePool.length < FIRE_MAX ? this.newFire() : null) ?? null;
        if (!f) continue;
        for (const [k2, v] of this.fires) if (v === f) this.fires.delete(k2);
        f.key = key; f.k = 0; f.seen = -1; f.stale = 0; this.fires.set(key, f);
      }
      if (src.seen !== f.seen) { f.seen = src.seen; f.stale = 0; } else f.stale += dt;
      this.P(src.x, src.y, src.z + 60, f.pos);
      f.vel.set(src.vx, src.vz * this.hd.boost, src.vy); f.s = src.s;
      (f as FireVis & { want: number }).want = f.stale > 0.12 ? 0 : clamp(src.k, 0, 2);
    }
    for (const [key, f] of this.fires) if (!S.fires.has(key)) (f as FireVis & { want: number }).want = 0;
  }
  private tickFire(f: FireVis, dt: number) {
    const want = (f as FireVis & { want?: number }).want ?? 0;
    f.k += (want - f.k) * Math.min(1, dt * (want > f.k ? 14 : 5));
    const meshes = [f.bow.mesh, f.outer, f.inner];
    if (f.k < 0.02 && want === 0) { for (const m of meshes) m.visible = false; this.fires.delete(f.key); f.key = ''; return; }
    for (const m of meshes) m.visible = true;
    const sp = f.vel.length(), dir = sp > 1 ? this.v3.copy(f.vel).multiplyScalar(1 / sp) : this.v3.set(0, 1, 0);
    const back = dir.clone().negate();
    const L = clamp(sp * 0.2, 220, 1100) * (0.6 + 0.4 * Math.min(1.5, f.k)) * f.s, R = 58 * (0.7 + 0.3 * Math.min(1.5, f.k)) * Math.sqrt(f.s);
    // 头壳：尖朝前，裹住人
    f.bow.mesh.position.copy(f.pos).addScaledVector(dir, 30); f.bow.mesh.quaternion.setFromUnitVectors(this.up, dir); f.bow.mesh.scale.set(R * 1.7, R * 1.6, R * 1.7);
    f.outer.position.copy(f.pos).addScaledVector(dir, -10); f.outer.quaternion.setFromUnitVectors(this.up, back); f.outer.scale.set(R * 1.25, L, R * 1.25);
    f.inner.position.copy(f.pos).addScaledVector(dir, -5); f.inner.quaternion.setFromUnitVectors(this.up, back); f.inner.scale.set(R * 0.6, L * 0.55, R * 0.6);
    const tt = this.time;
    f.bow.mat.uniforms.uT.value = tt; f.om.uniforms.uT.value = tt; f.im.uniforms.uT.value = tt;
    // 头前那层燃烧的压缩空气只在跑得快时才有（慢的火——拳头上、身上的——没有它，不然像扣着一个碗）
    const fast = clamp((sp - 900) / 1800, 0, 1);
    f.bow.mesh.visible = fast > 0.01;
    // r9：小的火（拳脚上的火尾，s < 0.6）不画头壳和整根火锥（推近的镜头里是一个个淡黄的灯罩），只靠一缕缕火舌
    const small = clamp((0.65 - f.s) / 0.25, 0, 1);
    // 大的火（被轰飞、砸下来的火尾）锥也淡一半：整根锥是一块平的，火的体积交给更多的火舌
    f.bow.mat.uniforms.uA.value = Math.min(1, f.k) * 0.7 * fast * (1 - small); f.om.uniforms.uA.value = Math.min(1.2, f.k) * 0.5 * (1 - 0.8 * small); f.im.uniforms.uA.value = Math.min(1.2, f.k) * 0.6 * (1 - 0.6 * small);
    f.bow.mesh.visible = f.bow.mesh.visible && small < 0.99;
    // 火粒子：沿火尾往后散；烟：从尾巴冒出来（普通混合，暗）
    f.acc += dt * 160 * Math.min(1.5, f.k) * Math.sqrt(f.s) * (1 + 1.6 * small);
    while (f.acc >= 1) {
      f.acc -= 1;
      const u = rnd(0, 0.6), side = this.perp(back, rnd(0, TAU)), rr = rnd(0, R * 0.9);
      const x = f.pos.x + back.x * L * u + side.x * rr, y = f.pos.y + back.y * L * u + side.y * rr, z = f.pos.z + back.z * L * u + side.z * rr;
      const v = rnd(0.05, 0.22) * sp;
      this.flames.add(x, y, z, back.x * v + side.x * 60, back.y * v + side.y * 60 + 40, back.z * v + side.z * 60, rnd(40, 80) * Math.sqrt(f.s), rnd(8, 20) * Math.sqrt(f.s), rnd(0.18, 0.4), [1, 1, 1], 0.9, 1.5, clamp(1 - u * 1.2 + rnd(-0.1, 0.1), 0.05, 1), 0, 0.7);
    }
    f.sacc += dt * 16 * Math.min(1.5, f.k) * f.s;
    while (f.sacc >= 1) {
      f.sacc -= 1;
      const x = f.pos.x + back.x * L * 0.75, y = f.pos.y + back.y * L * 0.75, z = f.pos.z + back.z * L * 0.75;
      this.puffs.add(x + rnd(-40, 40), y + rnd(-40, 40), z + rnd(-40, 40), back.x * sp * 0.05 + rnd(-40, 40), back.y * sp * 0.05 + rnd(20, 70), back.z * sp * 0.05 + rnd(-40, 40), rnd(60, 90), rnd(160, 240), rnd(0.7, 1.1), [0.16, 0.12, 0.1], 0.38, 1.4, 0);
    }
  }

  // ---------------------------------------------------------------- r8-p2 燃身：脚下、身侧立体的火一直往上蹿（三根往上的火锥 + 往上飘的火粒子），身后一圈亮边一明一暗
  private auraVis = new Map<string, AuraVis>();
  private auraPool: AuraVis[] = [];
  private newAura(): AuraVis {
    const cones: Mesh[] = [], mats: ShaderMaterial[] = [];
    for (let i = 0; i < 3; i++) {
      const m = new ShaderMaterial({ vertexShader: SURF_VS, fragmentShader: FIRE_FS, uniforms: { uA: { value: 0 }, uT: { value: 0 }, uV: { value: 1 }, uSeed: { value: r01() * 50 }, uC: { value: new Color(1, 0.62, 0.42) } }, side: DoubleSide, ...ADD });
      const c = new Mesh(this.gCone, m); c.frustumCulled = false; c.visible = false; c.renderOrder = 8; this.group.add(c);
      cones.push(c); mats.push(m);
    }
    const a: AuraVis = { key: '', k: 0, want: 0, seen: -1, stale: 0, cones, mats, rim: null, pos: new Vector3(), acc: 0, t: 0 };
    this.auraPool.push(a);
    return a;
  }
  private syncAuras(S: Fx3dState) {
    for (const [key, src] of S.auras) {
      let a = this.auraVis.get(key);
      if (!a) {
        a = this.auraPool.find((q) => q.key === '') ?? (this.auraPool.length < 2 ? this.newAura() : null) ?? undefined;
        if (!a) continue;
        a.key = key; a.k = 0; a.seen = -1; a.stale = 0; a.t = 0; this.auraVis.set(key, a);
      }
      if (src.seen !== a.seen) { a.seen = src.seen; a.stale = 0; }
      this.P(src.x, src.y, src.z, a.pos);
      a.want = clamp(src.k, 0, 2);
    }
    for (const [key, a] of this.auraVis) if (!S.auras.has(key)) a.want = 0;
  }
  private tickAura(a: AuraVis, dt: number) {
    a.stale += dt; a.t += dt;
    const want = a.stale > 0.15 ? 0 : a.want;
    a.k += (want - a.k) * Math.min(1, dt * (want > a.k ? 10 : 4));
    if (a.k < 0.02 && want === 0) {
      for (const c of a.cones) c.visible = false;
      if (a.rim) { a.rim.live = false; a.rim.mesh.visible = false; a.rim = null; }
      this.auraVis.delete(a.key); a.key = ''; return;
    }
    const cam = this.hd.cam, right = this.v3.set(1, 0, 0).applyQuaternion(cam.quaternion), b = this.hd.boost, k = Math.min(1.6, a.k);
    const rx = right.x, rz = right.z;
    for (const c of a.cones) c.visible = false;
    if (a.rim) { a.rim.live = false; a.rim.mesh.visible = false; a.rim = null; }
    // 离镜头远的方向（地面上）：火舌大多放在身后这一侧
    const bx0 = a.pos.x - cam.position.x, bz0 = a.pos.z - cam.position.z, bl = Math.hypot(bx0, bz0) || 1, bkx = bx0 / bl, bkz = bz0 / bl;
    a.acc += dt * 330 * k;
    while (a.acc >= 1) {
      a.acc -= 1;
      const r = r01();
      if (r < 0.22) {
        // 脚下一圈：贴地往上蹿的火
        const ang = rnd(0, TAU), rr = rnd(10, 46), x = a.pos.x + Math.cos(ang) * rr, z = a.pos.z + Math.sin(ang) * rr * 0.7 + bkz * 6;
        const s0 = rnd(36, 62) * (0.8 + 0.25 * k);
        this.flames.add(x, a.pos.y + rnd(0, 18) * b, z, Math.cos(ang) * 40, rnd(260, 440) * b, Math.sin(ang) * 40, s0, s0 * 0.4, rnd(0.22, 0.38), [1, 0.86, 0.72], 0.8, 1.8, rnd(0.75, 1), 0, 1);
      } else if (r < 0.32) {
        // 身后一层大而淡的火（给火一点体积：人身后一团暖光在翻）
        const lat = rnd(-30, 30), dep = rnd(28, 46), h = rnd(20, 150);
        const s0 = rnd(70, 110) * (0.8 + 0.2 * k);
        this.flames.add(a.pos.x + rx * lat + bkx * dep, a.pos.y + h * b, a.pos.z + rz * lat + bkz * dep, rnd(-20, 20), rnd(120, 220) * b, rnd(-20, 20), s0, s0 * 0.6, rnd(0.35, 0.55), [1, 0.7, 0.5], 0.32, 1.5, rnd(0.45, 0.7), 0, 1);
      } else if (r < 0.92) {
        // 身侧、身后：沿人形轮廓（腿细、躯干宽、头窄）往上卷的火舌
        const h = Math.pow(r01(), 0.85) * 178, wid = h < 85 ? 19 : h < 145 ? 31 : 17, side = r01() < 0.5 ? -1 : 1, lat = side * wid * rnd(0.55, 1.3), dep = rnd(6, 30);
        const x = a.pos.x + rx * lat + bkx * dep, z = a.pos.z + rz * lat + bkz * dep, y = a.pos.y + h * b;
        const s0 = rnd(32, 56) * (0.8 + 0.25 * k) * (h > 150 ? 0.8 : 1);
        this.flames.add(x, y, z, rx * lat * 0.9 + rnd(-25, 25), rnd(170, 330) * b, rz * lat * 0.9 + rnd(-25, 25), s0, s0 * 0.35, rnd(0.28, 0.5), [1, 0.84, 0.72], 0.8, 1.6, clamp(0.95 - h / 300 + rnd(-0.12, 0.08), 0.25, 1), 0, 1);
      } else {
        // 火星：小、亮、往上飘高，左右晃
        const lat = rnd(-40, 40), x = a.pos.x + rx * lat + bkx * 10, z = a.pos.z + rz * lat + bkz * 10;
        this.flames.add(x, a.pos.y + rnd(40, 170) * b, z, rnd(-90, 90), rnd(320, 640) * b, rnd(-90, 90), rnd(5, 8), rnd(2, 4), rnd(0.7, 1.3), [1, 0.78, 0.5], 1, 0.8, rnd(0.55, 0.85), -60, 0.5);
      }
    }
  }
  private tmpV = new Vector3();
  private arcAcc = new WeakMap<Piece, number>();
  /** r9：弧带头上甩出的火舌（每帧按弧头扫过的弧长补几颗） */
  private arcFlames(p: Piece, dt: number) {
    const U = p.mat.uniforms, A = p.arc!, arc = U.uArc.value as Vector4, e1 = U.uE1.value as Vector3, e2 = U.uE2.value as Vector3, n = U.uN.value as Vector3;
    const head = Math.min(1, p.t / A.sweepT), ang = arc.x + arc.y * head, R = arc.z, W = arc.w, tall = U.uTall.value > 0.5;
    const swept = Math.abs(arc.y) * R * Math.min(1, dt / A.sweepT) + Math.abs(A.spin) * R * dt * 0.25;
    let acc = (this.arcAcc.get(p) ?? 0) + swept / Math.max(10, W * 0.35) * Math.min(1.6, p.p);
    const col = U.uC.value as Color, purple = U.uM.value > 1.5, c: RGB3 = purple ? [col.r * 0.8, col.g * 0.5, col.b] : [Math.min(1.2, col.r * 0.8), Math.min(1, col.g * 0.9), Math.min(1, col.b * 0.8)];
    while (acc >= 1) {
      acc -= 1;
      const a = ang - Math.sign(arc.y || 1) * rnd(0, 0.35), ca = Math.cos(a), sa = Math.sin(a), w = rnd(-0.5, 0.5) * W;
      const rx = ca * e1.x + sa * e2.x, ry = ca * e1.y + sa * e2.y, rz = ca * e1.z + sa * e2.z;
      const tx = -sa * e1.x + ca * e2.x, ty = -sa * e1.y + ca * e2.y, tz = -sa * e1.z + ca * e2.z, sg = Math.sign(arc.y || 1);
      const rr = R + (tall ? 0 : w), h = tall ? w : 0;
      const x = p.pos.x + rx * rr + n.x * h, y = p.pos.y + ry * rr + n.y * h, z = p.pos.z + rz * rr + n.z * h;
      const v = rnd(250, 520), s0 = W * rnd(0.55, 0.95);
      this.flames.add(x, y, z, tx * sg * v + rx * 80, ty * sg * v + 160 + ry * 80, tz * sg * v + rz * 80, s0, s0 * 0.4, rnd(0.22, 0.4), c, 0.75, 2.2, rnd(0.55, 0.95), 0, 1);
    }
    this.arcAcc.set(p, acc);
  }

  // ---------------------------------------------------------------- r9 满屏的火：一大片地方翻滚的火团（大火舌一层层往上卷）+ 满天火星
  private fields: { x: number; y: number; z: number; R: number; t: number; dur: number; p: number; acc: number; eacc: number; up: number }[] = [];
  private tickFields(dt: number) {
    const b = this.hd.boost;
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const F = this.fields[i]; F.t += dt;
      if (F.t >= F.dur) { this.fields.splice(i, 1); continue; }
      const u = F.t / F.dur, env = Math.min(1, F.t / 0.08) * (u > 0.65 ? 1 - (u - 0.65) / 0.35 : 1);
      F.acc += dt * 170 * F.p * env;   // r9：逐日量到 70–120 毫秒的帧，脚本只占 10 毫秒——是满屏大火团的填充率（加色的大方片层层叠），收密度和个头
      while (F.acc >= 1) {
        F.acc -= 1;
        const ang = rnd(0, TAU), rr = F.R * Math.sqrt(r01()), x = F.x + Math.cos(ang) * rr, y = F.y + Math.sin(ang) * rr, g = this.hd.heightAt(x, y);
        const s0 = rnd(55, 120) * (0.7 + 0.3 * Math.min(2, F.p));
        this.flames.add(x, g + (F.z + rnd(0, F.R * 0.35 * F.up)) * b, y, Math.cos(ang) * rnd(60, 220), rnd(300, 760) * b, Math.sin(ang) * rnd(60, 220), s0, s0 * 0.45, rnd(0.45, 0.85), [1, 0.8, 0.6], 0.42, 1.1, rnd(0.3, 0.8), 0, 1);
      }
      F.eacc += dt * 160 * F.p * env;
      while (F.eacc >= 1) {
        F.eacc -= 1;
        const ang = rnd(0, TAU), rr = F.R * 1.3 * Math.sqrt(r01()), x = F.x + Math.cos(ang) * rr, y = F.y + Math.sin(ang) * rr, g = this.hd.heightAt(x, y);
        this.flames.add(x, g + (F.z + rnd(0, F.R * 0.6)) * b, y, rnd(-160, 160), rnd(200, 700) * b, rnd(-160, 160), rnd(6, 11), rnd(3, 5), rnd(0.8, 1.6), [1, 0.75, 0.45], 1, 0.6, rnd(0.5, 0.85), -40, 0.6);
      }
    }
  }

  // ---------------------------------------------------------------- 浮石
  private floatSeen = new Map<string, number>();
  private syncFloats(S: Fx3dState) {
    for (const [key, f] of S.floats) {
      if (f.blast) { this.rocks.blast(key, f.blast.dir, f.blast.p); continue; }
      const have = this.rocks.count(key), want = Math.min(24, Math.round(f.n * clamp(f.k, 0, 1)));
      for (let i = have; i < want; i++) {
        const a = rnd(0, TAU), rr = rnd(f.r * 0.25, f.r), x = f.x + Math.cos(a) * rr, y = f.y + Math.sin(a) * rr, g = this.hd.heightAt(x, y);
        this.rocks.add(x, g + 2, y, 0, 0, 0, rnd(6, 16), rnd(0.4, 1.2), 1, key, g + rnd(40, 170) * this.hd.boost * (0.6 + 0.4 * f.k));
      }
      this.floatSeen.set(key, f.seen);
    }
    for (const key of [...this.floatSeen.keys()]) if (!S.floats.has(key)) { this.rocks.drop(key); this.floatSeen.delete(key); }
  }

  // ================================================================ 后期：空间扭曲（屏幕 CSS 像素）
  postDist(): Fx3dPostDist[] | null {
    let out: Fx3dPostDist[] | null = null;
    const hd = this.hd, r = hd.rightDir;
    for (const p of this.pieces) {
      if (!p.live || p.kind !== 'shell') continue;
      const u = p.t / p.dur, R = p.R * easeOut(u * 1.1);
      const c = hd.projectAbsolute(p.pos.x, p.pos.z, p.pos.y), e = hd.projectAbsolute(p.pos.x + r.x * R, p.pos.z + r.y * R, p.pos.y);
      const rs = Math.hypot(e.x - c.x, e.y - c.y);
      if (!(rs > 2) || !isFinite(c.x)) continue;
      (out ??= []).push({ x: c.x, y: c.y, r: rs, amp: 30 * Math.min(1.6, p.p) * Math.pow(1 - u, 1.3), k: 1, rim: 0.22 * Math.min(1.4, p.p) * Math.pow(1 - u, 2), w: 0.16 });
      if (out.length >= 4) break;
    }
    return out;
  }

  /** 坑和地浪交给地形着色器（render.ts 每帧调） */
  static dentUniforms(S: Fx3dState | undefined): { d: [number, number, number, number][]; rip: [number, number, number, number, number] | null } {
    const d: [number, number, number, number][] = [];
    if (S) for (const q of S.dents) { const k = dentK(q); if (k > 0.002) d.push([q.x, q.y, q.r, q.depth * k]); }
    const R = S?.ripples[S.ripples.length - 1];
    const rip: [number, number, number, number, number] | null = R ? [R.x, R.y, R.t * R.speed, R.amp * Math.min(1, R.t / 0.05), R.reach] : null;
    return { d: d.slice(-2), rip };
  }

  dispose() {
    for (const p of this.pieces) p.mat.dispose();
    for (const f of this.firePool) { f.bow.mat.dispose(); f.om.dispose(); f.im.dispose(); }
    for (const a of this.auraPool) for (const m of a.mats) m.dispose();
    for (const g of [this.gLathe, this.gRing, this.gSphere, this.gTube, this.gCone, this.gWall, this.gQuad, this.gArc]) g?.dispose();
    this.flames.dispose(); this.puffs.dispose(); this.lines.dispose(); this.rocks.dispose();
    this.group.removeFromParent();
  }
}

// ==================================================================== 相机朝向的粒子池（火粒子：加色；尘 / 烟：普通混合）
class SpritePool {
  readonly mesh: Mesh; private geo: InstancedBufferGeometry; private mat: ShaderMaterial;
  private aP: InstancedBufferAttribute; private aD: InstancedBufferAttribute; private aC: InstancedBufferAttribute; private aV: InstancedBufferAttribute;
  n = 0;
  /** r9：每颗的拉长系数（0 = 不拉长，照转角转；1 = 按速度拉长、纵轴对准速度） */
  private st: Float32Array;
  // 每颗：位置、速度、大小（起、终）、寿命、年龄、转角、颜色、透明度、阻尼、热度
  private px: Float32Array; private py: Float32Array; private pz: Float32Array; private vx: Float32Array; private vy: Float32Array; private vz: Float32Array;
  private s0: Float32Array; private s1: Float32Array; private life: Float32Array; private age: Float32Array; private rot: Float32Array;
  private cr: Float32Array; private cg: Float32Array; private cb: Float32Array; private al: Float32Array; private drag: Float32Array; private heat: Float32Array; private seed: Float32Array; private grav: Float32Array;
  constructor(private max: number, fs: string, add: boolean, quad: PlaneGeometry) {
    const g = this.geo = new InstancedBufferGeometry();
    g.index = quad.index; g.setAttribute('position', quad.getAttribute('position')); g.setAttribute('uv', quad.getAttribute('uv'));
    this.aP = new InstancedBufferAttribute(new Float32Array(max * 3), 3); this.aD = new InstancedBufferAttribute(new Float32Array(max * 4), 4); this.aC = new InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.aV = new InstancedBufferAttribute(new Float32Array(max * 3), 3);
    g.setAttribute('iP', this.aP); g.setAttribute('iD', this.aD); g.setAttribute('iC', this.aC); g.setAttribute('iV', this.aV); g.instanceCount = 0;
    this.mat = new ShaderMaterial({ vertexShader: SPRITE_VS, fragmentShader: fs, uniforms: { uT: { value: 0 } }, side: DoubleSide, ...(add ? ADD : OVER) });
    this.mesh = new Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = add ? 9 : 6;
    const F = () => new Float32Array(max);
    this.px = F(); this.py = F(); this.pz = F(); this.vx = F(); this.vy = F(); this.vz = F(); this.s0 = F(); this.s1 = F(); this.life = F(); this.age = F(); this.rot = F();
    this.cr = F(); this.cg = F(); this.cb = F(); this.al = F(); this.drag = F(); this.heat = F(); this.seed = F(); this.grav = F(); this.st = F();
  }
  add(x: number, y: number, z: number, vx: number, vy: number, vz: number, s0: number, s1: number, life: number, c: RGB3, a: number, drag: number, heat: number, grav = 0, stretch = 0) {
    let i = this.n;
    if (i >= this.max) { i = (r01() * this.max) | 0; } else this.n++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz; this.s0[i] = s0; this.s1[i] = s1; this.life[i] = life; this.age[i] = 0;
    this.rot[i] = rnd(0, TAU); this.cr[i] = c[0]; this.cg[i] = c[1]; this.cb[i] = c[2]; this.al[i] = a; this.drag[i] = drag; this.heat[i] = heat || r01(); this.seed[i] = r01(); this.grav[i] = grav; this.st[i] = stretch;
  }
  tick(dt: number) {
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.kill(i); i--; continue; }
      const k = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= k; this.vy[i] = this.vy[i] * k - this.grav[i] * dt; this.vz[i] *= k;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
    }
  }
  private kill(i: number) {
    const j = --this.n; if (i === j) return;
    for (const A of [this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.s0, this.s1, this.life, this.age, this.rot, this.cr, this.cg, this.cb, this.al, this.drag, this.heat, this.seed, this.grav, this.st]) A[i] = A[j];
  }
  flush(t: number) {
    const P = this.aP.array as Float32Array, D = this.aD.array as Float32Array, C = this.aC.array as Float32Array, V = this.aV.array as Float32Array;
    for (let i = 0; i < this.n; i++) {
      const u = this.age[i] / this.life[i];
      P[i * 3] = this.px[i]; P[i * 3 + 1] = this.py[i]; P[i * 3 + 2] = this.pz[i];
      const sk = this.st[i]; V[i * 3] = this.vx[i] * sk; V[i * 3 + 1] = this.vy[i] * sk; V[i * 3 + 2] = this.vz[i] * sk;
      D[i * 4] = (this.s0[i] + (this.s1[i] - this.s0[i]) * u) * 0.5; D[i * 4 + 1] = this.rot[i] + u * 0.8; D[i * 4 + 2] = this.al[i] * Math.min(1, u * 8) * (1 - u) * (1 - u * 0.3);
      D[i * 4 + 3] = this.heat[i] > 0 ? this.heat[i] * (1 - u * 0.8) : this.seed[i];
      C[i * 3] = this.cr[i]; C[i * 3 + 1] = this.cg[i]; C[i * 3 + 2] = this.cb[i];
    }
    this.geo.instanceCount = this.n;
    if (this.n) { for (const A of [this.aP, this.aD, this.aC, this.aV]) { A.needsUpdate = true; A.clearUpdateRanges(); A.addUpdateRange(0, this.n * A.itemSize); } }
    this.mat.uniforms.uT.value = t;
    this.mesh.visible = this.n > 0;
  }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

// ==================================================================== 速度线池
class LinePool {
  readonly mesh: Mesh; private geo: InstancedBufferGeometry; private mat: ShaderMaterial;
  private aA: InstancedBufferAttribute; private aB: InstancedBufferAttribute; private aD: InstancedBufferAttribute; private aC: InstancedBufferAttribute;
  n = 0;
  private d: Float32Array;   // 每条 14 个数：起点 3、方向 3、长、宽、透明度、寿命、年龄、速度、颜色 r、g（r8-p2：颜色的 b 在 cb 里）
  private cb: Float32Array;
  constructor(private max: number, quad: PlaneGeometry) {
    const g = this.geo = new InstancedBufferGeometry();
    g.index = quad.index; g.setAttribute('position', quad.getAttribute('position')); g.setAttribute('uv', quad.getAttribute('uv'));
    this.aA = new InstancedBufferAttribute(new Float32Array(max * 3), 3); this.aB = new InstancedBufferAttribute(new Float32Array(max * 3), 3); this.aD = new InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.aC = new InstancedBufferAttribute(new Float32Array(max * 3), 3); this.cb = new Float32Array(max);
    g.setAttribute('iA', this.aA); g.setAttribute('iB', this.aB); g.setAttribute('iD', this.aD); g.setAttribute('iC', this.aC); g.instanceCount = 0;
    this.mat = new ShaderMaterial({ vertexShader: LINE_VS, fragmentShader: LINE_FS, uniforms: { uC: { value: new Color(1, 0.98, 0.94) } }, side: DoubleSide, ...ADD });
    this.mesh = new Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 9;
    this.d = new Float32Array(max * 14);
  }
  add(x: number, y: number, z: number, dx: number, dy: number, dz: number, len: number, w: number, a: number, life: number, c: RGB3, speed: number) {
    let i = this.n; if (i >= this.max) i = (r01() * this.max) | 0; else this.n++;
    const o = i * 14, D = this.d;
    D[o] = x; D[o + 1] = y; D[o + 2] = z; D[o + 3] = dx; D[o + 4] = dy; D[o + 5] = dz; D[o + 6] = len; D[o + 7] = w; D[o + 8] = a; D[o + 9] = life; D[o + 10] = 0; D[o + 11] = speed;
    D[o + 12] = c[0]; D[o + 13] = c[1]; this.cb[i] = c[2];
  }
  tick(dt: number) {
    const D = this.d;
    for (let i = 0; i < this.n; i++) {
      const o = i * 14; D[o + 10] += dt;
      if (D[o + 10] >= D[o + 9]) { const j = --this.n; if (i !== j) { D.copyWithin(o, j * 14, j * 14 + 14); this.cb[i] = this.cb[j]; } i--; continue; }
      const s = D[o + 11] * dt; D[o] += D[o + 3] * s; D[o + 1] += D[o + 4] * s; D[o + 2] += D[o + 5] * s;
    }
  }
  flush() {
    const A = this.aA.array as Float32Array, B = this.aB.array as Float32Array, DD = this.aD.array as Float32Array, CC = this.aC.array as Float32Array, D = this.d;
    for (let i = 0; i < this.n; i++) {
      const o = i * 14, u = D[o + 10] / D[o + 9], L = D[o + 6] * (0.6 + 0.4 * u);
      A[i * 3] = D[o]; A[i * 3 + 1] = D[o + 1]; A[i * 3 + 2] = D[o + 2];
      B[i * 3] = D[o + 3] * L; B[i * 3 + 1] = D[o + 4] * L; B[i * 3 + 2] = D[o + 5] * L;
      DD[i * 4] = D[o + 7] * (1 - u * 0.5); DD[i * 4 + 1] = D[o + 8] * (1 - u) * Math.min(1, u * 10 + 0.2); DD[i * 4 + 2] = 0; DD[i * 4 + 3] = 0;
      CC[i * 3] = D[o + 12]; CC[i * 3 + 1] = D[o + 13]; CC[i * 3 + 2] = this.cb[i];
    }
    this.geo.instanceCount = this.n;
    if (this.n) { this.aA.needsUpdate = true; this.aB.needsUpdate = true; this.aD.needsUpdate = true; this.aC.needsUpdate = true; }
    this.mesh.visible = this.n > 0;
  }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

// ==================================================================== 碎石池（实例化低多边形；也管蓄力时浮起来的石头）
class RockPool {
  readonly mesh: InstancedMesh; private mat: ShaderMaterial; private geo: BufferGeometry;
  n = 0;
  private x: Float32Array; private y: Float32Array; private z: Float32Array; private vx: Float32Array; private vy: Float32Array; private vz: Float32Array;
  private ax: Float32Array; private ay: Float32Array; private az: Float32Array; private ang: Float32Array; private spin: Float32Array;
  private s: Float32Array; private life: Float32Array; private age: Float32Array; private mode: Uint8Array; private hover: Float32Array; private bounces: Uint8Array;
  private key: string[];
  private m4 = new Matrix4(); private q = new Quaternion(); private v = new Vector3(); private sc = new Vector3(); private ax3 = new Vector3(); private col = new Color();
  constructor(private max: number) {
    const g = new DodecahedronGeometry(1, 0).toNonIndexed();
    // 每个顶点抖一抖：石块不是正多面体（同一位置的顶点抖得一样，面不裂开）
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453, k = 0.72 + 0.5 * (h - Math.floor(h));
      pos.setXYZ(i, x * k, y * k * 0.8, z * k);
    }
    g.computeVertexNormals();
    this.geo = g;
    this.mat = new ShaderMaterial({ vertexShader: ROCK_VS, fragmentShader: ROCK_FS, depthWrite: true, depthTest: true });
    this.mesh = new InstancedMesh(g, this.mat, max); this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = 4;
    this.mesh.setColorAt(0, new Color(0.4, 0.35, 0.3));
    const F = () => new Float32Array(max);
    this.x = F(); this.y = F(); this.z = F(); this.vx = F(); this.vy = F(); this.vz = F(); this.ax = F(); this.ay = F(); this.az = F(); this.ang = F(); this.spin = F();
    this.s = F(); this.life = F(); this.age = F(); this.mode = new Uint8Array(max); this.hover = F(); this.bounces = new Uint8Array(max); this.key = new Array(max).fill('');
    this.cols = new Float32Array(max * 3);
  }
  private cols: Float32Array;
  /** mode 0 = 飞着（重力、落地弹一下）、1 = 浮着（升到 hover 高度上下晃） */
  add(x: number, y: number, z: number, vx: number, vy: number, vz: number, s: number, life: number, mode: number, key: string, hover = 0, hot = false) {
    let i = this.n; if (i >= this.max) i = (r01() * this.max) | 0; else this.n++;
    this.x[i] = x; this.y[i] = y; this.z[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    const a = rnd(0, TAU), b = rnd(-1, 1); this.ax[i] = Math.cos(a) * Math.sqrt(1 - b * b); this.ay[i] = b; this.az[i] = Math.sin(a) * Math.sqrt(1 - b * b);
    this.ang[i] = rnd(0, TAU); this.spin[i] = mode ? rnd(-2, 2) : rnd(-14, 14); this.s[i] = s; this.life[i] = mode ? 99 : life + rnd(0, 0.6); this.age[i] = 0; this.mode[i] = mode; this.hover[i] = hover; this.bounces[i] = 0; this.key[i] = key;
    const v = rnd(0.75, 1.15), w = r01() < 0.25 ? 0.82 : 1;
    if (hot) { this.cols[i * 3] = 0.72 * v; this.cols[i * 3 + 1] = 0.3 * v * w; this.cols[i * 3 + 2] = 0.16 * v * w; }   // r8-p2：火爆里崩出来的碎石：红褐色（视频里是烧红的土块）
    else { this.cols[i * 3] = 0.43 * v; this.cols[i * 3 + 1] = 0.37 * v * w; this.cols[i * 3 + 2] = 0.3 * v * w; }
  }
  count(key: string) { let c = 0; for (let i = 0; i < this.n; i++) if (this.mode[i] === 1 && this.key[i] === key) c++; return c; }
  /** 浮着的石头往 dir（世界方向角）崩出去 */
  blast(key: string, dir: number, p: number) {
    for (let i = 0; i < this.n; i++) if (this.mode[i] === 1 && this.key[i] === key) {
      const a = dir + rnd(-0.9, 0.9), v = rnd(700, 1600) * p;
      this.mode[i] = 0; this.key[i] = ''; this.vx[i] = Math.cos(a) * v; this.vz[i] = Math.sin(a) * v; this.vy[i] = rnd(200, 700); this.spin[i] = rnd(-16, 16); this.life[i] = rnd(1, 1.8); this.age[i] = 0;
    }
  }
  /** 不浮了：落回去 */
  drop(key: string) { for (let i = 0; i < this.n; i++) if (this.mode[i] === 1 && this.key[i] === key) { this.mode[i] = 0; this.key[i] = ''; this.vy[i] = 0; this.life[i] = rnd(0.8, 1.4); this.age[i] = 0; } }
  tick(dt: number, ground: (x: number, y: number) => number, onLand: (x: number, y: number, z: number, n: number) => void) {
    const G = 2600;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.kill(i); i--; continue; }
      this.ang[i] += this.spin[i] * dt;
      if (this.mode[i] === 1) {
        // 浮起：往 hover 高度靠、上下晃、绕一点
        const gy = ground(this.x[i], this.z[i]), target = this.hover[i] + Math.sin(this.age[i] * 3 + i) * 10;
        this.y[i] += (Math.max(gy, target) - this.y[i]) * Math.min(1, dt * 2.2);
        continue;
      }
      this.vy[i] -= G * dt;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt; this.z[i] += this.vz[i] * dt;
      const gy = ground(this.x[i], this.z[i]) + this.s[i] * 0.5;
      if (this.y[i] < gy) {
        this.y[i] = gy;
        if (this.vy[i] < -300 && this.bounces[i] < 2) {
          if (this.bounces[i] === 0 && this.s[i] > 14 && r01() < 0.35) onLand(this.x[i], this.z[i], 0, 1);
          this.vy[i] *= -0.32; this.vx[i] *= 0.55; this.vz[i] *= 0.55; this.spin[i] *= 0.6; this.bounces[i]++;
        } else { this.vy[i] = 0; this.vx[i] *= Math.exp(-dt * 8); this.vz[i] *= Math.exp(-dt * 8); this.spin[i] *= Math.exp(-dt * 6); }
      }
    }
  }
  private kill(i: number) {
    const j = --this.n; if (i === j) return;
    for (const A of [this.x, this.y, this.z, this.vx, this.vy, this.vz, this.ax, this.ay, this.az, this.ang, this.spin, this.s, this.life, this.age, this.hover]) A[i] = A[j];
    this.mode[i] = this.mode[j]; this.bounces[i] = this.bounces[j]; this.key[i] = this.key[j];
    this.cols[i * 3] = this.cols[j * 3]; this.cols[i * 3 + 1] = this.cols[j * 3 + 1]; this.cols[i * 3 + 2] = this.cols[j * 3 + 2];
  }
  flush() {
    for (let i = 0; i < this.n; i++) {
      const left = this.life[i] - this.age[i], k = this.mode[i] ? 1 : Math.min(1, left / 0.35);   // 最后一截缩下去（沉进土里）
      this.ax3.set(this.ax[i], this.ay[i], this.az[i]);
      this.q.setFromAxisAngle(this.ax3, this.ang[i]);
      this.v.set(this.x[i], this.y[i] - (1 - k) * this.s[i] * 0.4, this.z[i]); this.sc.setScalar(this.s[i] * Math.max(0.05, k));
      this.m4.compose(this.v, this.q, this.sc);
      this.mesh.setMatrixAt(i, this.m4);
      this.col.setRGB(this.cols[i * 3], this.cols[i * 3 + 1], this.cols[i * 3 + 2]); this.mesh.setColorAt(i, this.col);
    }
    this.mesh.count = this.n;
    if (this.n) { this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
    this.mesh.visible = this.n > 0;
  }
  dispose() { this.geo.dispose(); this.mat.dispose(); this.mesh.dispose(); }
}

/** 焦痕的网格：圆盘（7 圈 × 40 段），uv 是 -1‥1 的局部坐标；位置由 fitScorch 按地形填 */
function scorchGeo(): BufferGeometry {
  const RINGS = 7, SEG = 40, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  pos.push(0, 0, 0); uv.push(0, 0);
  for (let r = 1; r <= RINGS; r++) for (let s = 0; s < SEG; s++) { const a = s / SEG * TAU, q = r / RINGS; pos.push(Math.cos(a) * q, 0, Math.sin(a) * q); uv.push(Math.cos(a) * q, Math.sin(a) * q); }
  for (let s = 0; s < SEG; s++) idx.push(0, 1 + (s + 1) % SEG, 1 + s);
  for (let r = 1; r < RINGS; r++) for (let s = 0; s < SEG; s++) { const a = 1 + (r - 1) * SEG + s, b = 1 + (r - 1) * SEG + (s + 1) % SEG, c = a + SEG, d = b + SEG; idx.push(a, b, d, a, d, c); }
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------- r9-hitfeel 在文件末尾追加（不改上面的配色表）
/** 全游戏打击感（world/hitfeel.ts、gl/hitfeelgl.ts）往四层爆炸的配色表里登记新配色：木 / 毒的绿紫、雷的白紫、土、风。名字带 hf_ 前缀，不和原有的重名 */
export function addBlastPalette(name: string, p: { core: RGB3; fire: RGB3; ember: RGB3; smoke: RGB3 }): void { if (!PAL[name]) PAL[name] = p; }
