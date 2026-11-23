// r16 噬魂魔尊 · 夜无赦的魔修特效（画面这一侧）。招式往 world/fx3d.ts 末尾那几个方法报（scythe / spike / gate / tendril / soul / wing），
// 这里在 HD2D 的 three.js 场景里画真 3D 的网格、着色器——和撼山客那一套（hd2d/hsfx3d.ts）并排，自己一组、自己一份队列（fx3d.yq），不改那边。
//
//   · 魂镰刀光（scythe）：一段立体的弧带（圆面任意朝向：竖劈、横扫、斜撩），紫黑的魔烟做身、血红的刃边、刃口一线白热；普通混合（压暗）+ HDR 的刃光（交给后期辉光）。
//     弧头扫过去、尾巴淡掉，内侧被噪声啃成一缕缕往外飘的魔烟。
//   · 冥狱石柱（spike）：七棱、带随机起伏的尖石柱，从地里一下子拔起来（先过冲一点再回落），石面暗紫黑、裂缝里透暗红的岩浆光，停一会儿沉回地里。
//   · 鬼门（gate）：一副从地里升起的石门（两根柱、一道横梁，刻纹里透紫光）+ 门洞里一面往里旋的紫黑旋涡。
//   · 魔触（tendril）：一条分节的立体肉带子（顶点着色器里沿二次贝塞尔曲线铺开、一节一节鼓起、带着波往前蠕动、朝着镜头展开），节缝里透血红；伸出去、停、缩回。
//   · 魂火（soul）：一圈魂火往中心螺旋吸进去（加色的小光团，拖一点尾巴）。
//   · 魔翼（wing）：背后一对巨大的立体翼面（五根翼骨撑开、骨间的翼膜后缘成扇贝形，翼膜透暗红、翼骨血红发亮），慢慢扇动；每帧报一次，不报了就收起。
// 规矩：画面这边的抖动用自己的小随机序列，不碰 Math.random；数量都有上限、用完回收；整组没东西时藏起来。
import {
  Group, Mesh, ShaderMaterial, Vector3, Vector4, Color, Scene, PlaneGeometry, CylinderGeometry, BoxGeometry, CircleGeometry, BufferGeometry, Float32BufferAttribute,
  InstancedBufferGeometry, InstancedBufferAttribute, DoubleSide, CustomBlending, AddEquation, OneFactor, ZeroFactor, OneMinusSrcAlphaFactor,
} from 'three';
import type { HdScene } from './scene';
import type { Fx3dState, YwsFxEv, RGB3 } from '../world/fx3d';

const TAU = Math.PI * 2;
let rs = 0x2b7e1516;
const r01 = () => { rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0; return rs / 4294967296; };
const rnd = (a: number, b: number) => a + r01() * (b - a);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const ADD = { blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor, transparent: true, depthWrite: false, depthTest: true } as const;
const OVER = { blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: OneFactor, blendDstAlpha: OneMinusSrcAlphaFactor, transparent: true, depthWrite: false, depthTest: true } as const;
const NOISE = `
float h13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ return vn(p) * 0.55 + vn(p * 2.03 + 7.1) * 0.3 + vn(p * 4.07 + 3.3) * 0.15; }`;

// ------------------------------------------------------------------ 魂镰刀光
const ARC_VS = `
uniform vec3 uE1; uniform vec3 uE2; uniform vec3 uN; uniform vec4 uArc;
varying vec2 vUv; varying vec3 vNn; varying vec3 vV;
void main(){ vUv = uv;
  float ang = uArc.x + uv.x * uArc.y;
  vec3 radial = cos(ang) * uE1 + sin(ang) * uE2;
  float w = (uv.y - 0.5) * uArc.w;
  // 刃口外凸一点（越往弧头越宽）：弯月形的刀光
  float bulge = sin(uv.x * 3.14159) * 0.22 * uArc.w;
  vec3 p = radial * (uArc.z + w + bulge * uv.y) + uN * (w * 0.08);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vNn = uN; vV = cameraPosition - wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp; }`;
const ARC_FS = `
uniform float uA; uniform float uT; uniform vec3 uC; uniform float uSeed; uniform float uHead; uniform float uTail;
varying vec2 vUv; varying vec3 vNn; varying vec3 vV;
${NOISE}
void main(){
  float u = vUv.x, v = vUv.y, d = uHead - u;
  if (d < 0.0) discard;
  float tail = exp(-d * uTail);
  float n = fbm(vec3(u * 12.0 - uT * 5.0, v * 3.0, uSeed)), n2 = fbm(vec3(u * 36.0 - uT * 9.0, v * 7.0, uSeed + 3.0));
  // 刃边在外沿（v → 1）；内侧是被噪声啃成一缕缕的魔烟
  float edge = smoothstep(0.78, 0.97, v + (n2 - 0.5) * 0.08);
  float line = smoothstep(0.93, 0.985, v) * (1.0 - smoothstep(0.985, 1.0, v));
  float smoke = smoothstep(0.0, 0.55, v + (n - 0.5) * 0.9) * smoothstep(0.15, 0.6, n + v * 0.4);
  float head = smoothstep(0.12, 0.0, d);
  float f = abs(dot(normalize(vNn), normalize(vV))); float side = 0.65 + 0.35 * pow(1.0 - f, 0.5);
  vec3 red = vec3(1.7, 0.07, 0.12) * uC;
  vec3 col = vec3(0.05, 0.0, 0.08) * smoke + red * edge * (1.0 + head * 0.8) * side + vec3(2.6, 1.3, 1.5) * line * tail;
  float a = clamp(smoke * 0.85 + edge, 0.0, 1.0) * tail * uA;
  gl_FragColor = vec4(col * tail * uA, a);
}`;

// ------------------------------------------------------------------ 石头（石柱、鬼门）：暗紫黑的石面，裂缝里透暗红 / 紫的光
const STONE_VS = `
varying vec3 vN; varying vec3 vL; varying vec3 vW;
void main(){ vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const STONE_FS = `
uniform vec3 uG; uniform float uGlow; uniform float uSeed; uniform float uT;
varying vec3 vN; varying vec3 vL; varying vec3 vW;
${NOISE}
void main(){
  vec3 n = normalize(vN), L = normalize(vec3(-0.45, 0.8, 0.35));
  float dif = 0.35 + 0.65 * max(0.0, dot(n, L));
  float g = fbm(vL * 3.2 + uSeed), g2 = fbm(vL * 9.0 + uSeed * 1.7);
  vec3 base = mix(vec3(0.07, 0.055, 0.08), vec3(0.17, 0.13, 0.16), g) * dif * (0.8 + 0.4 * g2);
  float crack = 1.0 - smoothstep(0.0, 0.045, abs(g - 0.5) - 0.01 * g2);
  float pulse = 0.75 + 0.25 * sin(uT * 6.0 + uSeed * 9.0 + vL.y * 3.0);
  vec3 V = normalize(cameraPosition - vW); float rim = pow(1.0 - abs(dot(n, V)), 3.0);
  gl_FragColor = vec4(base + uG * (crack * 1.8 * pulse + rim * 0.35) * uGlow, 1.0);
}`;
// r17 晶柱：紫黑的晶体本体，每个棱面按朝光不同明暗，掠射的棱面亮成亮紫（棱边），往上越来越亮、尖上发光；里面隐约一缕缕的光
const CRYSTAL_FS = `
uniform vec3 uG; uniform float uGlow; uniform float uSeed; uniform float uT;
varying vec3 vN; varying vec3 vL; varying vec3 vW;
${NOISE}
void main(){
  vec3 n = normalize(vN), L = normalize(vec3(-0.45, 0.8, 0.35)), V = normalize(cameraPosition - vW);
  float dif = 0.12 + 0.88 * max(0.0, dot(n, L));   // 棱面明暗拉开（一面亮一面暗，看得出是多面的晶体）
  float y = clamp(vL.y, 0.0, 1.0);
  vec3 body = mix(vec3(0.05, 0.0, 0.09), vec3(0.42, 0.12, 0.65), y) * dif;
  float rim = pow(1.0 - abs(dot(n, V)), 2.5);
  float spec = pow(max(0.0, dot(reflect(-L, n), V)), 24.0);
  float vein = smoothstep(0.55, 0.62, fbm(vL * vec3(3.0, 9.0, 3.0) + uSeed + vec3(0.0, -uT * 0.6, 0.0)));
  vec3 col = body + uG * (rim * 0.9 + vein * 0.5 * y + smoothstep(0.7, 1.0, y) * 1.4) * uGlow + vec3(1.0, 0.85, 1.2) * spec * 0.8;
  gl_FragColor = vec4(col, 1.0);
}`;
// 鬼门的旋涡：紫黑的芯、往里旋的亮臂（普通混合：压暗门洞）
const VORTEX_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`;
const VORTEX_FS = `
uniform float uT; uniform float uA; uniform vec3 uC;
varying vec2 vUv;
${NOISE}
void main(){
  vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
  float a = atan(p.y, p.x);
  float sw = a + 3.2 / (r + 0.25) + uT * 2.6;
  float arm = pow(0.5 + 0.5 * sin(sw * 3.0 + fbm(vec3(p * 3.0, uT)) * 3.0), 6.0);
  float edge = smoothstep(1.0, 0.8, r);
  vec3 col = vec3(0.02, 0.0, 0.04) + uC * arm * (0.4 + 1.6 * r) * edge + uC * 2.0 * smoothstep(0.85, 0.97, r) * edge;
  gl_FragColor = vec4(col * uA, edge * uA * (0.85 + 0.15 * arm));
}`;

// ------------------------------------------------------------------ r19 魔光柱（末劫天倾）：紫黑的烟柱、血红的边。普通混合（压暗），边是 HDR 的血红（交给后期辉光、压黑时留着）
const PIL_VS = `
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const PIL_FS = `
uniform float uT; uniform float uA; uniform float uSeed; uniform vec3 uC;
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
${NOISE}
void main(){
  vec3 n = normalize(vN), v = normalize(vV);
  float f = abs(dot(n, v)), rim = pow(1.0 - f, 4.0), y = vUv.y;
  float sw = fbm(vec3(vUv.x * 7.0 + y * 2.5, y * 6.0 - uT * 3.5, uSeed));
  float streak = smoothstep(0.58, 0.86, sw);
  float fade = (1.0 - smoothstep(0.5, 1.0, y)) * smoothstep(0.0, 0.03, y) * uA;
  float a = fade * (0.82 + 0.15 * f) * (0.8 + 0.2 * sw);
  vec3 body = vec3(0.025, 0.0, 0.045) + vec3(0.5, 0.1, 1.0) * streak * 0.55;
  gl_FragColor = vec4(body * a + uC * rim * (0.9 + 0.6 * streak) * fade, a);
}`;

// ------------------------------------------------------------------ 魔触
const TEN_VS = `
uniform vec3 uP0; uniform vec3 uP1; uniform vec3 uK; uniform float uExt; uniform float uW; uniform float uT; uniform float uSeed; uniform float uWave; uniform float uSeg;
varying vec2 vUv; varying float vS; varying float vSeg;
void main(){
  float s = (position.y + 0.5) * uExt;
  float q = 1.0 - s;
  vec3 a = q * q * uP0 + 2.0 * q * s * uK + s * s * uP1;
  vec3 tg = normalize(2.0 * q * (uK - uP0) + 2.0 * s * (uP1 - uK) + vec3(1e-4, 0.0, 0.0));
  vec3 sd = normalize(cross(tg, vec3(0.0, 1.0, 0.0)) + vec3(0.0, 0.0, 1e-4));
  vec3 nm = cross(sd, tg);
  float env = sin(clamp(s / max(uExt, 0.01), 0.0, 1.0) * 3.14159) * uWave;
  a += sd * sin(s * 11.0 - uT * 7.0 + uSeed) * 38.0 * env + nm * cos(s * 8.0 - uT * 5.0 + uSeed) * 26.0 * env;
  vec3 V = normalize(cameraPosition - a);
  vec3 bn = normalize(cross(tg, V));
  float seg = 0.72 + 0.28 * abs(sin(s * uSeg * 3.14159));
  float taper = mix(1.0, 0.18, s);
  a += bn * position.x * uW * seg * taper;
  vUv = vec2(position.x + 0.5, s); vS = s; vSeg = seg;
  gl_Position = projectionMatrix * viewMatrix * vec4(a, 1.0); }`;
const TEN_FS = `
uniform float uA; uniform vec3 uC; uniform float uSeg; uniform float uT;
varying vec2 vUv; varying float vS; varying float vSeg;
void main(){
  float x = vUv.x * 2.0 - 1.0, sh = sqrt(max(0.0, 1.0 - x * x));
  float seam = 1.0 - smoothstep(0.0, 0.12, abs(sin(vS * uSeg * 3.14159)));
  vec3 flesh = mix(vec3(0.05, 0.01, 0.06), vec3(0.24, 0.05, 0.2), sh) * (0.6 + 0.6 * sh);
  vec3 col = flesh + uC * seam * 1.6 * sh + uC * pow(1.0 - sh, 3.0) * 0.5;
  float a = smoothstep(0.0, 0.25, sh) * uA;
  gl_FragColor = vec4(col * a, a);
}`;

// ------------------------------------------------------------------ 魔翼
const WING_VS = `
uniform float uFlap; uniform float uOpen;
attribute float aAcross;
varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vAc;
void main(){ vUv = uv; vAc = aAcross;
  vec3 p = position;
  // 展开：翼面绕根部（局部 z 轴）往上抬；扇动：外段多扇
  float ang = (uOpen - 1.0) * 1.1 + uFlap * (0.3 + 0.7 * uv.y);
  float c = cos(ang), s = sin(ang);
  p.xy = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  p.z -= uv.y * uv.y * 0.25 * (1.0 + uFlap);
  vec4 w = modelMatrix * vec4(p, 1.0);
  vN = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0)); vV = cameraPosition - w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w; }`;
// r17：羽状翼——每扇七片长羽（翼骨），根部紫黑、往外渐亮成暗紫，羽缘一线血红辉光、羽尖发亮；中间一道亮的羽轴
const WING_FS = `
uniform float uA; uniform vec3 uC; uniform float uT;
varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vAc;
${NOISE}
void main(){
  float v = vUv.y, x = abs(vAc * 2.0 - 1.0);
  float n = fbm(vec3(vUv * vec2(9.0, 14.0), vUv.x * 7.0));
  vec3 body = mix(vec3(0.025, 0.0, 0.05), vec3(0.26, 0.05, 0.42), smoothstep(0.0, 1.0, v) * (0.7 + 0.5 * n));
  float shaft = 1.0 - smoothstep(0.0, 0.12, x);
  float edge = smoothstep(0.55, 0.95, x);
  float f = abs(dot(normalize(vN), normalize(vV)));
  vec3 col = body * (0.75 + 0.35 * (1.0 - f)) + vec3(0.55, 0.2, 0.9) * shaft * (0.3 + 0.7 * v) + uC * edge * (0.5 + 1.1 * v) * (0.8 + 0.2 * sin(uT * 4.0 + v * 9.0)) + uC * 1.6 * smoothstep(0.85, 1.0, v);
  float a = (1.0 - smoothstep(0.92, 1.0, x)) * uA;
  gl_FragColor = vec4(col * a, a);
}`;

// ------------------------------------------------------------------ 魂火（小光团）
const SOUL_VS = `
attribute vec3 iP; attribute vec4 iD; attribute vec3 iC;
varying vec2 vUv; varying vec4 vD; varying vec3 vC;
void main(){ vUv = uv; vD = iD; vC = iC;
  vec4 mv = viewMatrix * vec4(iP, 1.0);
  float c = cos(iD.y), s = sin(iD.y);
  mv.xy += (vec2(c, s) * position.x * 1.0 + vec2(-s, c) * position.y * 2.2) * iD.x;
  gl_Position = projectionMatrix * mv; }`;
const SOUL_FS = `
varying vec2 vUv; varying vec4 vD; varying vec3 vC;
void main(){ vec2 p = vUv * 2.0 - 1.0; p.y = p.y * 0.8 + 0.2; float r = length(p); float a = smoothstep(1.0, 0.0, r); a *= a;
  gl_FragColor = vec4(vC * a * vD.z * (0.6 + 1.4 * smoothstep(0.45, 0.0, r)), 1.0); }`;

interface ArcP { mesh: Mesh; mat: ShaderMaterial; live: boolean; t: number; dur: number; sweepT: number }
interface SpikeP { mesh: Mesh; mat: ShaderMaterial; live: boolean; t: number; dur: number; h: number; x: number; y: number; delay: number }
interface GateP { g: Group; vortex: Mesh; stone: ShaderMaterial; vmat: ShaderMaterial; live: boolean; t: number; dur: number; R: number; x: number; y: number }
interface TenP { mesh: Mesh; mat: ShaderMaterial; live: boolean; t: number; dur: number }
interface PilP { mesh: Mesh; mat: ShaderMaterial; live: boolean; t: number; dur: number; R: number; H: number }
interface WingV { g: Group; l: Mesh; r: Mesh; mat: ShaderMaterial; k: number }
interface Soul { cx: number; cy: number; cz: number; R: number; a0: number; h: number; t: number; dur: number; s: number; c: RGB3 }

const ARC_MAX = 16, SPIKE_MAX = 28, GATE_MAX = 3, TEN_MAX = 16, SOUL_MAX = 260, PIL_MAX = 6;

export class YwsFx3D {
  readonly group = new Group();
  private arcs: ArcP[] = []; private spikes: SpikeP[] = []; private gates: GateP[] = []; private tens: TenP[] = [];
  private wings = new Map<string, WingV>();
  private pils: PilP[] = []; private gPil = (() => { const g = new CylinderGeometry(1, 1, 1, 28, 12, true); g.translate(0, 0.5, 0); return g; })();
  private souls: Soul[] = [];
  private pending: YwsFxEv[] = [];
  private time = 0;
  private gArc = new PlaneGeometry(1, 1, 64, 6);
  private gSpike: BufferGeometry; private gTen = new PlaneGeometry(1, 1, 1, 48); private gWing: BufferGeometry;
  private gBox = new BoxGeometry(1, 1, 1); private gDisk = new CircleGeometry(1, 48);
  private soulGeo: InstancedBufferGeometry; private soulMat: ShaderMaterial; private soulMesh: Mesh;
  private aP: InstancedBufferAttribute; private aD: InstancedBufferAttribute; private aC: InstancedBufferAttribute;
  private warmList: { obj: Mesh | Group; done: boolean }[] = [];
  private warmScene = new Scene();
  constructor(private readonly hd: HdScene) {
    this.group.name = 'ywsfx3d';
    // 石柱：七棱尖锥，顶点按自己的序列起伏（岩石的样子），底在 y = 0、尖在 y = 1
    // r17：冥狱晶柱——六棱尖晶（棱面分开算法线：每一面一种明暗），腰上鼓一点、尖略偏
    const cyl = new CylinderGeometry(0.0, 1, 1, 6, 2, false); cyl.translate(0, 0.5, 0);
    const pos = cyl.getAttribute('position');
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y > 0.4 && y < 0.6) { pos.setX(i, pos.getX(i) * 0.72); pos.setZ(i, pos.getZ(i) * 0.72); } if (y > 0.99) pos.setX(i, pos.getX(i) + 0.06); }
    const flat = cyl.toNonIndexed(); flat.computeVertexNormals(); cyl.dispose(); this.gSpike = flat;
    this.gWing = wingGeo();
    // 魂火：实例化的小光团
    const q = new PlaneGeometry(1, 1);
    const g = this.soulGeo = new InstancedBufferGeometry();
    g.index = q.index; g.setAttribute('position', q.getAttribute('position')); g.setAttribute('uv', q.getAttribute('uv'));
    this.aP = new InstancedBufferAttribute(new Float32Array(SOUL_MAX * 3), 3); this.aD = new InstancedBufferAttribute(new Float32Array(SOUL_MAX * 4), 4); this.aC = new InstancedBufferAttribute(new Float32Array(SOUL_MAX * 3), 3);
    g.setAttribute('iP', this.aP); g.setAttribute('iD', this.aD); g.setAttribute('iC', this.aC); g.instanceCount = 0;
    this.soulMat = new ShaderMaterial({ vertexShader: SOUL_VS, fragmentShader: SOUL_FS, side: DoubleSide, ...ADD });
    this.soulMesh = new Mesh(g, this.soulMat); this.soulMesh.frustumCulled = false; this.soulMesh.renderOrder = 9; this.group.add(this.soulMesh);
    // 每种先建一件（预热要它们）
    this.warmList.push({ obj: this.soulMesh, done: false });
    this.warmList.push({ obj: this.newArc().mesh, done: false }, { obj: this.newSpike().mesh, done: false }, { obj: this.newGate().g, done: false }, { obj: this.newTen().mesh, done: false }, { obj: this.newPil().mesh, done: false });
    { const W = this.makeWing(); W.g.visible = false; this.spare.push(W); this.warmList.push({ obj: W.g, done: false }); }   // 魔翼也预热（头一回张开不卡）
    this.group.visible = false;
  }
  get warmed(): boolean { return this.warmList.every((w) => w.done); }
  /** 每次编一种（头一回放招不卡） */
  warmStep(): boolean {
    const w = this.warmList.find((q) => !q.done); if (!w) return true;
    const o = w.obj, parent = o.parent, vis = o.visible;
    try {
      o.visible = true; this.warmScene.add(o);
      const im = o as unknown as { geometry?: { instanceCount?: number } }, ic0 = im.geometry?.instanceCount;
      if (ic0 === 0 && im.geometry) im.geometry.instanceCount = 1;
      (this.hd as unknown as { warmRender(s: Scene, c: unknown): void }).warmRender(this.warmScene, this.hd.cam);
      if (ic0 === 0 && im.geometry) im.geometry.instanceCount = 0;
    } catch { /* 预热失败不要紧：真用到时再编 */ }
    this.warmScene.remove(o); if (parent) parent.add(o); o.visible = vis;
    w.done = true;
    return this.warmed;
  }

  private P(x: number, y: number, z: number, out = new Vector3()): Vector3 { return out.set(x, this.hd.heightAt(x, y) + z * this.hd.boost, y); }
  private D(dx: number, dy: number, dz: number, out = new Vector3()): Vector3 { out.set(dx, dz * this.hd.boost, dy); const l = out.length(); return l > 1e-6 ? out.multiplyScalar(1 / l) : out.set(0, 1, 0); }

  private makeWing(): WingV {
    const mat = new ShaderMaterial({ vertexShader: WING_VS, fragmentShader: WING_FS, side: DoubleSide, ...OVER, uniforms: { uFlap: { value: 0 }, uOpen: { value: 0 }, uA: { value: 0 }, uC: { value: new Color(1.6, 0.1, 0.14) }, uT: { value: 0 } } });
    const g = new Group(), l = new Mesh(this.gWing, mat), r = new Mesh(this.gWing, mat);
    r.scale.x = -1; l.frustumCulled = r.frustumCulled = false; l.renderOrder = r.renderOrder = 6;
    g.add(l, r); this.group.add(g);
    return { g, l, r, mat, k: 0 };
  }
  private spare: WingV[] = [];
  private spareWing(): WingV | undefined { return this.spare.pop(); }
  get busy(): boolean { return this.pending.length > 0 || this.souls.length > 0 || this.wings.size > 0 || this.arcs.some((a) => a.live) || this.spikes.some((a) => a.live) || this.gates.some((a) => a.live) || this.tens.some((a) => a.live) || this.pils.some((a) => a.live); }

  update(S: Fx3dState | undefined, dt: number) {
    dt = Math.min(0.05, Math.max(0, dt)); this.time += dt;
    if (S?.yq?.length) { for (const ev of S.yq) { if (ev.delay > 0) this.pending.push(ev); else this.spawn(ev); } S.yq.length = 0; }
    for (let i = this.pending.length - 1; i >= 0; i--) { const ev = this.pending[i]; ev.delay -= dt; if (ev.delay <= 0) { this.pending.splice(i, 1); this.spawn(ev); } }
    for (const a of this.arcs) if (a.live) this.tickArc(a, dt);
    for (const s of this.spikes) if (s.live) this.tickSpike(s, dt);
    for (const gt of this.gates) if (gt.live) this.tickGate(gt, dt);
    for (const t of this.tens) if (t.live) this.tickTen(t, dt);
    for (const p of this.pils) if (p.live) this.tickPil(p, dt);
    this.syncWings(S, dt);
    this.tickSouls(dt);
    this.group.visible = this.busy;
  }

  private spawn(ev: YwsFxEv) {
    switch (ev.k) {
      case 'scythe': return this.arcSpawn(ev);
      case 'spike': return this.spikeSpawn(ev);
      case 'gate': return this.gateSpawn(ev);
      case 'tendril': return this.tenSpawn(ev);
      case 'soul': return this.soulSpawn(ev);
      case 'pillar': return this.pilSpawn(ev);
    }
  }

  // ---------------------------------------------------------------- 魂镰刀光
  private newArc(): ArcP {
    const mat = new ShaderMaterial({ vertexShader: ARC_VS, fragmentShader: ARC_FS, side: DoubleSide, ...OVER,
      uniforms: { uE1: { value: new Vector3(1, 0, 0) }, uE2: { value: new Vector3(0, 0, 1) }, uN: { value: new Vector3(0, 1, 0) }, uArc: { value: new Vector4() }, uA: { value: 0 }, uT: { value: 0 }, uC: { value: new Color(1, 1, 1) }, uSeed: { value: 0 }, uHead: { value: 0 }, uTail: { value: 3 } } });
    const mesh = new Mesh(this.gArc, mat); mesh.frustumCulled = false; mesh.renderOrder = 7; mesh.visible = false;
    const p: ArcP = { mesh, mat, live: false, t: 0, dur: 0.4, sweepT: 0.15 };
    this.arcs.push(p); this.group.add(mesh);
    return p;
  }
  private arcSpawn(ev: YwsFxEv) {
    let p = this.arcs.find((a) => !a.live); if (!p) p = this.arcs.length < ARC_MAX ? this.newArc() : this.arcs.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    const n = this.D(ev.nx, ev.ny, ev.nz);
    let e1 = new Vector3(ev.e1[0], ev.e1[2] * this.hd.boost, ev.e1[1]);
    e1.addScaledVector(n, -e1.dot(n));
    if (e1.lengthSq() < 1e-6) { e1 = Math.abs(n.y) < 0.9 ? new Vector3(0, 1, 0).cross(n).normalize() : new Vector3(1, 0, 0); } else e1.normalize();
    const e2 = new Vector3().crossVectors(n, e1).normalize();
    const U = p.mat.uniforms;
    (U.uE1.value as Vector3).copy(e1); (U.uE2.value as Vector3).copy(e2); (U.uN.value as Vector3).copy(n);
    (U.uArc.value as Vector4).set(ev.a0, ev.sweep, ev.r, ev.w);
    U.uSeed.value = r01() * 10; U.uTail.value = 2.2 / Math.max(0.4, ev.p);
    const c = ev.col ?? [1, 1, 1]; (U.uC.value as Color).setRGB(c[0], c[1], c[2]);
    p.live = true; p.t = 0; p.dur = ev.dur; p.sweepT = Math.max(0.02, ev.dur * 0.32);
    this.P(ev.x, ev.y, ev.z, p.mesh.position); p.mesh.visible = true;
  }
  private tickArc(p: ArcP, dt: number) {
    p.t += dt; const u = p.t / p.dur;
    if (u >= 1) { p.live = false; p.mesh.visible = false; return; }
    const U = p.mat.uniforms;
    U.uHead.value = p.t / p.sweepT; U.uT.value = p.t;
    U.uA.value = Math.min(1, p.t / 0.03) * Math.pow(1 - u, 1.15);
  }

  // ---------------------------------------------------------------- 冥狱石柱
  private newSpike(): SpikeP {
    const mat = new ShaderMaterial({ vertexShader: STONE_VS, fragmentShader: CRYSTAL_FS, uniforms: { uG: { value: new Color(1.1, 0.35, 1.8) }, uGlow: { value: 1 }, uSeed: { value: 0 }, uT: { value: 0 } } });
    const mesh = new Mesh(this.gSpike, mat); mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 2;
    const p: SpikeP = { mesh, mat, live: false, t: 0, dur: 1.5, h: 300, x: 0, y: 0, delay: 0 };
    this.spikes.push(p); this.group.add(mesh);
    return p;
  }
  private spikeSpawn(ev: YwsFxEv) {
    let p = this.spikes.find((a) => !a.live); if (!p) p = this.spikes.length < SPIKE_MAX ? this.newSpike() : this.spikes.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    p.live = true; p.t = 0; p.dur = ev.dur; p.h = ev.h; p.x = ev.x; p.y = ev.y;
    const m = p.mesh;
    this.P(ev.x, ev.y, 0, m.position);
    m.rotation.set(0, 0, 0);
    // 斜着拔起：朝 dir 方向倾 tilt（弧度）
    m.quaternion.setFromAxisAngle(new Vector3(Math.sin(ev.dir), 0, -Math.cos(ev.dir)), ev.tilt);   // 绕 (sin, 0, -cos) 转 +tilt：尖朝 (cos dir, sin dir) 那边倒
    m.rotateY(r01() * TAU);
    p.mat.uniforms.uSeed.value = r01() * 20;
    const c = ev.col ?? [1.1, 0.35, 1.8]; (p.mat.uniforms.uG.value as Color).setRGB(c[0], c[1], c[2]);
    m.scale.set(ev.r, 0.01, ev.r); m.visible = true;
  }
  private tickSpike(p: SpikeP, dt: number) {
    p.t += dt; const t = p.t;
    if (t >= p.dur) { p.live = false; p.mesh.visible = false; return; }
    // 0–0.1 拔起（过冲到 1.12 再回落到 1）；最后 0.35 息沉回去
    const up = t < 0.1 ? (t / 0.1) * 1.12 : t < 0.18 ? 1.12 - (t - 0.1) / 0.08 * 0.12 : 1;
    const down = clamp((p.dur - t) / 0.35, 0, 1);
    const k = up * down, m = p.mesh, r = m.scale.x;
    m.scale.set(r, Math.max(0.01, p.h * this.hd.boost * k), r);
    m.position.y = this.hd.heightAt(p.x, p.y) - (1 - down) * 40;
    p.mat.uniforms.uT.value = this.time; p.mat.uniforms.uGlow.value = 0.6 + 0.6 * clamp(1 - t / 0.5, 0, 1) + 0.4;
  }

  // ---------------------------------------------------------------- r19 魔光柱
  private newPil(): PilP {
    const mat = new ShaderMaterial({ vertexShader: PIL_VS, fragmentShader: PIL_FS, side: DoubleSide, ...OVER, uniforms: { uT: { value: 0 }, uA: { value: 0 }, uSeed: { value: 0 }, uC: { value: new Color(1.7, 0.08, 0.1) } } });
    const mesh = new Mesh(this.gPil, mat); mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 7;
    const p: PilP = { mesh, mat, live: false, t: 0, dur: 0.6, R: 110, H: 3000 };
    this.pils.push(p); this.group.add(mesh);
    return p;
  }
  private pilSpawn(ev: YwsFxEv) {
    let p = this.pils.find((a) => !a.live); if (!p) p = this.pils.length < PIL_MAX ? this.newPil() : this.pils.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    p.live = true; p.t = 0; p.dur = ev.dur; p.R = ev.r; p.H = ev.h;
    const c = ev.col ?? [1.7, 0.08, 0.1]; (p.mat.uniforms.uC.value as Color).setRGB(c[0], c[1], c[2]); p.mat.uniforms.uSeed.value = rnd(0, 50);
    this.P(ev.x, ev.y, 0, p.mesh.position); p.mesh.visible = true;
    this.tickPil(p, 0);
  }
  private tickPil(p: PilP, dt: number) {
    p.t += dt; const t = p.t;
    if (t >= p.dur) { p.live = false; p.mesh.visible = false; return; }
    // 一下子从地里冲上天（0.08 息），腰身先胀后收，后四成淡掉
    const up = clamp(t / 0.08, 0, 1), w = p.R * (0.75 + 0.35 * Math.sin(Math.min(1, t / p.dur) * Math.PI)), fade = clamp((p.dur - t) / (p.dur * 0.4), 0, 1);
    p.mesh.scale.set(w, Math.max(1, p.H * this.hd.boost * (1 - (1 - up) * (1 - up))), w);
    p.mat.uniforms.uT.value = this.time; p.mat.uniforms.uA.value = fade;
  }

  // ---------------------------------------------------------------- 鬼门
  private newGate(): GateP {
    const stone = new ShaderMaterial({ vertexShader: STONE_VS, fragmentShader: STONE_FS, uniforms: { uG: { value: new Color(0.9, 0.3, 1.5) }, uGlow: { value: 1 }, uSeed: { value: 3 }, uT: { value: 0 } } });
    const vmat = new ShaderMaterial({ vertexShader: VORTEX_VS, fragmentShader: VORTEX_FS, side: DoubleSide, ...OVER, uniforms: { uT: { value: 0 }, uA: { value: 0 }, uC: { value: new Color(0.8, 0.3, 1.4) } } });
    const g = new Group(); g.visible = false;
    const pl = new Mesh(this.gBox, stone), pr = new Mesh(this.gBox, stone), top = new Mesh(this.gBox, stone), top2 = new Mesh(this.gBox, stone);
    pl.position.set(-0.62, 0.5, 0); pl.scale.set(0.2, 1, 0.22);
    pr.position.set(0.62, 0.5, 0); pr.scale.set(0.2, 1, 0.22);
    top.position.set(0, 1.04, 0); top.scale.set(1.62, 0.13, 0.3);
    top2.position.set(0, 1.16, 0); top2.scale.set(1.9, 0.08, 0.36);
    const vortex = new Mesh(this.gDisk, vmat); vortex.position.set(0, 0.5, 0); vortex.scale.set(0.52, 0.5, 1); vortex.renderOrder = 7;
    g.add(pl, pr, top, top2, vortex);
    for (const m of g.children) m.frustumCulled = false;
    const p: GateP = { g, vortex, stone, vmat, live: false, t: 0, dur: 1.5, R: 160, x: 0, y: 0 };
    this.gates.push(p); this.group.add(g);
    return p;
  }
  private gateSpawn(ev: YwsFxEv) {
    let p = this.gates.find((a) => !a.live); if (!p) p = this.gates.length < GATE_MAX ? this.newGate() : this.gates.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    p.live = true; p.t = 0; p.dur = ev.dur; p.R = ev.r; p.x = ev.x; p.y = ev.y;
    const c = ev.col ?? [0.8, 0.3, 1.4]; (p.vmat.uniforms.uC.value as Color).setRGB(c[0], c[1], c[2]);
    // 门面朝 dir（世界方向角 atan2(dy, dx)）：three 里绕竖轴转，让门的法线（局部 z）对着 (cos, sin)
    p.g.visible = true;
    this.P(ev.x, ev.y, ev.z, p.g.position);
    // 门面朝镜头（对照图里按出手方向摆时，斜俯的侧视里只看得见门的侧面——一块黑石板）；朝出手方向只偏一点
    { const cp = (this.hd as unknown as { cam: { position: Vector3 } }).cam.position, yc = Math.atan2(cp.x - p.g.position.x, cp.z - p.g.position.z), yd = Math.atan2(Math.cos(ev.dir), Math.sin(ev.dir)); let dd = yd - yc; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); p.g.rotation.set(0, yc + clamp(dd, -0.35, 0.35), 0); }
    p.g.scale.set(ev.r * 2.6, ev.r * 1.6 * this.hd.boost, ev.r * 2.6);   // 矮宽一点：原来细高，镜头里只看得见一根柱子
  }
  private tickGate(p: GateP, dt: number) {
    p.t += dt; const t = p.t;
    if (t >= p.dur) { p.live = false; p.g.visible = false; return; }
    const up = clamp(t / 0.25, 0, 1), down = clamp((p.dur - t) / 0.3, 0, 1), k = up * down;
    const H = p.R * 1.6 * this.hd.boost;
    p.g.position.y = this.hd.heightAt(p.x, p.y) - H * (1 - (1 - (1 - up) * (1 - up))) - H * (1 - down);
    p.vmat.uniforms.uT.value = this.time; p.vmat.uniforms.uA.value = k;
    p.vortex.rotation.z = -this.time * 1.5;
    p.stone.uniforms.uT.value = this.time;
  }

  // ---------------------------------------------------------------- 魔触
  private newTen(): TenP {
    const mat = new ShaderMaterial({ vertexShader: TEN_VS, fragmentShader: TEN_FS, side: DoubleSide, ...OVER,
      uniforms: { uP0: { value: new Vector3() }, uP1: { value: new Vector3() }, uK: { value: new Vector3() }, uExt: { value: 0 }, uW: { value: 30 }, uT: { value: 0 }, uSeed: { value: 0 }, uWave: { value: 1 }, uSeg: { value: 14 }, uA: { value: 1 }, uC: { value: new Color(1.5, 0.1, 0.15) } } });
    const mesh = new Mesh(this.gTen, mat); mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 7;
    const p: TenP = { mesh, mat, live: false, t: 0, dur: 0.8 };
    this.tens.push(p); this.group.add(mesh);
    return p;
  }
  private tenSpawn(ev: YwsFxEv) {
    let p = this.tens.find((a) => !a.live); if (!p) p = this.tens.length < TEN_MAX ? this.newTen() : this.tens.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    const U = p.mat.uniforms, a = this.P(ev.x, ev.y, ev.z), b = this.P(ev.x2, ev.y2, ev.z2);
    (U.uP0.value as Vector3).copy(a); (U.uP1.value as Vector3).copy(b);
    const L = a.distanceTo(b);
    (U.uK.value as Vector3).copy(a).lerp(b, 0.45).add(new Vector3(0, L * 0.45 + 60, 0));
    U.uW.value = ev.w; U.uSeed.value = r01() * 10; U.uWave.value = ev.wave; U.uSeg.value = ev.n;
    const c = ev.col ?? [1.5, 0.1, 0.15]; (U.uC.value as Color).setRGB(c[0], c[1], c[2]);
    p.live = true; p.t = 0; p.dur = ev.dur; p.mesh.visible = true;
  }
  private tickTen(p: TenP, dt: number) {
    p.t += dt; const u = p.t / p.dur;
    if (u >= 1) { p.live = false; p.mesh.visible = false; return; }
    const U = p.mat.uniforms;
    U.uExt.value = u < 0.3 ? 1 - Math.pow(1 - u / 0.3, 3) : u > 0.75 ? 1 - (u - 0.75) / 0.25 : 1;
    U.uT.value = this.time; U.uA.value = Math.min(1, u * 10) * (u > 0.85 ? (1 - u) / 0.15 : 1);
  }

  // ---------------------------------------------------------------- 魂火
  private soulSpawn(ev: YwsFxEv) {
    const n = Math.min(ev.n, 60), c = ev.col ?? [0.55, 0.9, 1.3];
    for (let i = 0; i < n; i++) {
      if (this.souls.length >= SOUL_MAX) this.souls.shift();
      const purple = r01() < 0.4;
      this.souls.push({ cx: ev.x, cy: ev.y, cz: ev.z, R: ev.r * rnd(0.55, 1), a0: r01() * TAU, h: rnd(-60, 220), t: -rnd(0, ev.dur * 0.35), dur: ev.dur * rnd(0.6, 1), s: rnd(14, 30), c: purple ? [0.9, 0.35, 1.3] : c });
    }
  }
  private tickSouls(dt: number) {
    const L = this.souls; if (!L.length) { this.soulGeo.instanceCount = 0; this.soulMesh.visible = false; return; }
    const P = this.aP.array as Float32Array, D = this.aD.array as Float32Array, C = this.aC.array as Float32Array, v = new Vector3();
    let n = 0;
    for (let i = L.length - 1; i >= 0; i--) {
      const s = L[i]; s.t += dt;
      if (s.t >= s.dur) { L.splice(i, 1); continue; }
      if (s.t < 0) continue;
      const u = s.t / s.dur, r = s.R * Math.pow(1 - u, 1.3), a = s.a0 + u * 3.2;
      this.P(s.cx + Math.cos(a) * r, s.cy + Math.sin(a) * r * 0.8, s.cz + s.h * (1 - u), v);
      P[n * 3] = v.x; P[n * 3 + 1] = v.y; P[n * 3 + 2] = v.z;
      D[n * 4] = s.s * (0.6 + 0.6 * (1 - u)); D[n * 4 + 1] = a + Math.PI * 0.5; D[n * 4 + 2] = Math.min(1, u * 6) * (1 - u * 0.6); D[n * 4 + 3] = 0;
      C[n * 3] = s.c[0]; C[n * 3 + 1] = s.c[1]; C[n * 3 + 2] = s.c[2];
      n++;
    }
    this.soulGeo.instanceCount = n;
    for (const A of [this.aP, this.aD, this.aC]) { A.needsUpdate = true; A.clearUpdateRanges(); A.addUpdateRange(0, Math.max(1, n) * A.itemSize); }
    this.soulMesh.visible = n > 0;
  }

  // ---------------------------------------------------------------- 魔翼
  private syncWings(S: Fx3dState | undefined, dt: number) {
    const src = S?.ywings;
    if (src) for (const w of src.values()) {
      let V = this.wings.get(w.key) ?? this.spareWing();
      if (V) { this.wings.set(w.key, V); V.g.visible = true; }
      if (!V) { V = this.makeWing(); this.wings.set(w.key, V); }
      V.k += (w.k - V.k) * Math.min(1, dt * 6);
      this.P(w.x, w.y, w.z, V.g.position);
      // 朝向：人物 yaw（世界前方 = (sin, cos)）；翼长在局部 x（左右）、y（上），往局部 -z（身后）掠
      V.g.rotation.set(0, 0, 0);   // HD-2D 是斜俯的侧视：翼总往画面左右张开（按人物朝向转的话，常常一只翼正对镜头、一只藏到身后，只剩一片大黑影）；w.ang 留给立板以后用
      const sp = w.span;
      V.g.scale.set(sp, sp * this.hd.boost, sp);
      V.g.position.z -= 30;   // 贴在背后（往画面里一点）
      const U = V.mat.uniforms;
      U.uOpen.value = clamp(V.k, 0, 1.3); U.uFlap.value = Math.sin(this.time * 2.2) * 0.22 * (0.4 + V.k); U.uA.value = clamp(V.k * 1.5, 0, 1); U.uT.value = this.time;
    }
    // 收起的翼不扔：材质留着下次用（原来每次 dispose、再张开时重建，灭世魔翼每放一次都要重编一回着色器，卡 100 毫秒）
    for (const [k, V] of this.wings) if (!src || !src.has(k)) { V.g.visible = false; V.k = 0; this.wings.delete(k); this.spare.push(V); }
  }

  dispose() {
    for (const g of [this.gArc, this.gSpike, this.gTen, this.gWing, this.gBox, this.gDisk, this.soulGeo]) g.dispose();
    this.soulMat.dispose();
    for (const a of this.arcs) a.mat.dispose(); for (const s of this.spikes) s.mat.dispose(); for (const t of this.tens) t.mat.dispose();
    for (const gt of this.gates) { gt.stone.dispose(); gt.vmat.dispose(); }
    for (const p of this.pils) p.mat.dispose(); this.gPil.dispose();
    for (const w of this.wings.values()) w.mat.dispose(); for (const w of this.spare) w.mat.dispose();
    this.group.removeFromParent();
  }
}


/** 一扇翼面：五根翼骨从根部扇形撑开（局部 x 往外、y 往上），骨间的翼膜后缘成扇贝形。uv.x = 第几根骨（0‥1，四段），uv.y = 沿骨从根到梢 */
function wingGeo(): BufferGeometry {
  // r17：七片羽状翼骨从根部扇形撑开（层层叠着，越外越长），每片是一条尖叶形的带子：x 往外、y 往上，羽面略往后掠
  const pos: number[] = [], uv: number[] = [], ac: number[] = [], idx: number[] = [], N = 7, SEG = 10;
  for (let k = 0; k < N; k++) {
    const a = 0.08 + k * 0.24, L = 1.0 - Math.abs(k - 2.2) * 0.1, W = 0.2 - k * 0.012, base = pos.length / 3;
    const cx = Math.cos(a), cy = Math.sin(a), px = -cy, py = cx;
    for (let j = 0; j <= SEG; j++) {
      const t = j / SEG, w = W * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95)) * (1 - t * 0.55) + 0.004, bend = 0.06 * Math.sin(t * Math.PI);
      for (const sd of [-1, 1]) { pos.push(cx * L * t + px * (w * sd + bend), cy * L * t + py * (w * sd + bend), -0.03 * k - 0.1 * t); uv.push(k / (N - 1), t); ac.push(sd < 0 ? 0 : 1); }
    }
    for (let j = 0; j < SEG; j++) { const a0 = base + j * 2; idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2); }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new Float32BufferAttribute(uv, 2)); g.setAttribute('aAcross', new Float32BufferAttribute(ac, 1)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** 旧的扇贝翼面（留着备查，不再用） */
export function wingGeoOld(): BufferGeometry {
  const COLS = 4 * 5 + 1, ROWS = 9, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const bone = (b: number) => { const a = 0.12 + b * 0.36, L = 1 - b * 0.13; return { a, L }; };   // 翼骨的仰角、长
  for (let i = 0; i < COLS; i++) {
    const u = i / (COLS - 1), bf = u * 4, b0 = Math.floor(Math.min(3.999, bf)), fr = bf - b0;
    const A = bone(b0), B = bone(b0 + 1), a = A.a + (B.a - A.a) * fr, L0 = A.L + (B.L - A.L) * fr;
    const scallop = 1 - Math.sin(fr * Math.PI) * 0.28;
    for (let j = 0; j < ROWS; j++) {
      const v = j / (ROWS - 1), L = L0 * v * scallop;
      pos.push(Math.cos(a) * L, Math.sin(a) * L, -0.08 * v);
      uv.push(u, v * scallop);
    }
  }
  for (let i = 0; i < COLS - 1; i++) for (let j = 0; j < ROWS - 1; j++) { const a = i * ROWS + j, b = (i + 1) * ROWS + j; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
