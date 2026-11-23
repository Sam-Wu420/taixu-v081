// 虚空的画面：星渊、诸界、界壁。
//
// 定调（2026-11-13，用户按概念图选的）：
//   世界的形态——一块平坦的大陆坐在倒悬的岩石底座上，上面罩一层穹顶界壁，像黑暗里的一盏灯；
//   色调——靛紫的虚空，金与青的光；星河斜贯天际；
//   视角——和界内一样的俯视斜角：人在一张平面上飞，各界悬在脚下不同的深处，近的看得清山河，远的只是一团光。
//
// 全部现场生成：背景是一个全屏着色器（星、星云、星河）；每一界是三张网格（大陆面、岩石底座、穹顶）加一团衬光；
// 人界的大陆面贴的是三张图的全图缩略拼成的俯瞰图（由调用方给），别界的按种子现场画一张小图。
// 坐标：X = 虚空 x，Z = 虚空 y（向南为正），Y = 高度（飞行平面是 0，各界在下方）。一律以人物为原点摆放，远处也不抖。
import {
  Scene, PerspectiveCamera, OrthographicCamera, Mesh, PlaneGeometry, ShaderMaterial, BufferGeometry, Float32BufferAttribute, CanvasTexture, Texture,
  Vector2, Vector3, Vector4, AdditiveBlending, LinearFilter, MeshBasicMaterial, InstancedMesh, InstancedBufferAttribute, IcosahedronGeometry, Object3D, Points, Group,
  WebGLRenderTarget, DoubleSide, NormalBlending, HalfFloatType, UnsignedByteType, DepthTexture, type WebGLRenderer,
} from 'three';
import { realmOutline, realmSketch, VOID_SCALE, type Realm, type RealmKind, type RealmSketch } from '../data/zhujie';
import { VoidClouds, LOW_CLOUD, type CloudDeck } from './voidclouds';
import { VoidThings } from './voidthings';
import type { VoidThing } from '../world/voidlife';

export interface VoidPatch { canvas: HTMLCanvasElement; rev: number; u0: number; v0: number; u1: number; v1: number }
export interface VoidView {
  /** 这一趟离开地面以来的秒数、这一帧的时长 */
  time: number; dt: number;
  /** 人在虚空里的位置（虚空坐标）、离飞行平面的高度（负数＝在平面之下） */
  x: number; y: number; heroY: number;
  /** 镜头：盯着的那一点（虚空坐标 + 高度）、离它多远、朝向（弧度）与俯角（度）——和界内镜头同一种摆法 */
  cam: { tx: number; ty: number; ground: number; D: number; yaw: number; pitch: number };
  /** 飞行的速度（虚空单位 / 秒）；遁空的强度 0..1、蓄势 0..1 */
  vx: number; vy: number; streak: number; spool: number;
  /** 云气的浓度 0..1（穿云层时）；离地面多高的比例 0..1（贴地时关掉大陆面上画的云和远观的调色）；夜色 0..1 */
  cloud: number; high: number; night: number;
  /** 贴地的那层低云显几成（界内带出来的，升高后渐无）、低云的云量随天气乘几成 */
  lowCloud: number; cover: number;
  /** 云气流过的量（随高度的对数走：界内那一段和这里用同一个数，换手时云不跳） */
  flow: number;
  /** 要画的各界 */
  realms: readonly Realm[];
  /** 飞行平面那一层的东西（乱流、遗迹、遗骨、虚空兽）和它们显几成 */
  things?: readonly VoidThing[]; thingsFade?: number;
  /** 人界的俯瞰图，rev 变了就重新上传 */
  homeMap: HTMLCanvasElement | null; homeRev: number;
  /** 脚下那一界的细节：真实的全图缩略（别界才需要）和近地面的两块局部细节图 */
  detail: { realmId: string; map: HTMLCanvasElement | null; rev: number; patches: (VoidPatch | null)[] } | null;
  /** 人物立板的宽（虚空单位）、脚底离画布顶边多远；heroW 为 0 时不画人物 */
  heroW: number; heroFoot: number;
  /**
   * 别的立板（交手中的对手、追进虚空的追兵）：位置是虚空坐标、站在人物的那一层；w 是立板的宽（虚空单位），
   * foot 是脚底离画布顶边多远（虚空单位），cw / ch 是它那张画布的像素大小，paint 往画布上画（和界内同一套画法）
   */
  figures?: readonly VoidFigure[];
  /** 交手时镜头拉近的程度 0..1：飞行平面下的浮石、过路的遁光在拉近途中渐渐隐去（近看会糊满一屏） */
  fight?: number;
}
/** h：立板脚底的高度（虚空单位，飞行平面为 0）；不给就站在人物那一层（收官 E3：坠向下界的流星要一路往下画） */
export interface VoidFigure { key: string; x: number; y: number; w: number; foot: number; cw: number; ch: number; paint: (canvas: HTMLCanvasElement) => void; h?: number; /** 收官 P9：显几成（交手那一刻从网格交接过来时淡入），不给是 1 */ alpha?: number }

const SOFT = `
vec4 soft(vec2 uv) { vec2 p = uv * 256.0 - 0.5, f = fract(p); f = f * f * (3.0 - 2.0 * f); return texture2D(uNoise, (floor(p) + f + 0.5) / 256.0); }
float fbm(vec2 p) { return soft(p).r * 0.5 + soft(p * 2.03 + 0.37).g * 0.27 + soft(p * 4.1 + 0.71).b * 0.15 + soft(p * 8.3 + 0.13).a * 0.08; }`;

/** 光从哪儿来（各界、浮石共用）：左前上方 */
const LIGHT = `const vec3 LIGHT = vec3(-0.42, 0.66, 0.62);`;
const CLOUDFN = `float cloudAt(vec2 p) { return soft(p).r * 0.5 + soft(p * 2.3 + 0.4).g * 0.28 + soft(p * 5.1 + 0.9).b * 0.14 + soft(p * 11.0 + 0.2).a * 0.08; }`;

const BG_FS = `
uniform sampler2D uNoise; uniform vec4 uV; uniform vec4 uW; varying vec2 vUv;
${SOFT}
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
// 一层星：按格子撒点，冷暖各异；最亮的几颗带十字星芒。遁空时把取样坐标沿航向压扁，星点就被拉成一道道流光
vec3 stars(vec2 uv, float density, float streak, float seed, float spikes) {
  vec2 d = uW.xy, q = vec2(dot(uv, d), dot(uv, vec2(-d.y, d.x)));
  q.x /= 1.0 + streak; q *= density;
  vec2 g = floor(q), f = fract(q) - 0.5;
  float h = hash(g + seed);
  vec2 e = f - (vec2(hash(g + seed + 7.1), hash(g + seed + 3.7)) - 0.5) * 0.7;
  float size = 0.03 + 0.1 * h * h * h, tw = 0.75 + 0.25 * sin(uV.z * (1.0 + h * 3.0) + h * 40.0);
  float big = step(0.93, h) * spikes;
  float ray = (exp(-abs(e.x) * 60.0) * exp(-abs(e.y) * 7.0) + exp(-abs(e.y) * 60.0) * exp(-abs(e.x) * 7.0)) * big * 0.7;
  vec3 tint = mix(vec3(1.0, 0.8, 0.6), vec3(0.68, 0.83, 1.0), fract(h * 7.3));
  return tint * (smoothstep(size, 0.0, length(e)) * (1.0 + big * 1.8) + ray) * step(0.55, h) * tw / (1.0 + streak * 0.2);
}
void main() {
  vec2 uv = (vUv - 0.5) * vec2(uV.w, 1.0), off = uV.xy;
  float k = uW.z, t = uV.z;
  // 星云：先用一层噪声把取样位置推歪，云团就有卷曲的丝缕；紫为体、青为辅，云团深处透出绛色
  vec2 p = uv * 0.02 + off * 0.00000016;
  vec2 w = vec2(fbm(p * 0.9 + vec2(t * 0.00005, 0.0)), fbm(p * 0.9 + 0.43)) - 0.5;
  float n1 = fbm(p + w * 0.009), n2 = fbm(p * 1.8 + w * 0.014 + 0.31), n3 = fbm(p * 0.55 + 0.77 - w * 0.006);
  float body = smoothstep(0.4, 0.74, n1);
  vec3 col = vec3(0.01, 0.012, 0.04);
  col += vec3(0.16, 0.07, 0.34) * body;
  col += vec3(0.02, 0.17, 0.25) * smoothstep(0.5, 0.76, n2) * 0.7;
  col += vec3(0.42, 0.14, 0.4) * pow(smoothstep(0.52, 0.85, n1 * 0.6 + n2 * 0.4), 2.0) * 0.8;
  // 光脉：云气里一道道青白的丝，缓缓明灭
  float ridge = pow(1.0 - abs(fbm(p * 1.5 + w * 0.02 + 0.17) * 2.0 - 1.0), 10.0);
  col += vec3(0.36, 0.78, 1.0) * ridge * body * smoothstep(0.5, 0.7, n2) * (0.3 + 0.18 * sin(t * 0.5 + n3 * 25.0));
  // 尘带：几道暗的，压出层次
  col *= 1.0 - smoothstep(0.5, 0.78, n3) * 0.55;
  // 星河：斜贯画面的一道光带，边缘被云气推得参差
  vec2 rp = uv + off * 0.0000035;
  float band = dot(rp, normalize(vec2(0.42, 1.0))) - 0.1 + (fbm(rp * 0.03 + 0.9) - 0.5) * 0.6;
  float river = exp(-band * band * 13.0), rn = fbm(rp * 0.11 + 0.5);
  col += (vec3(1.0, 0.82, 0.55) * 0.32 + vec3(0.6, 0.5, 1.0) * 0.16) * river * (0.3 + rn * 0.95);
  // 三层星，近的移动得快；星河里的更密更亮
  vec3 s = stars(uv + off * 0.000004, 46.0, k * 2.0, 1.0, 0.0) * 0.5
         + stars(uv + off * 0.00001, 24.0, k * 5.0, 17.0, 0.0) * 0.8
         + stars(uv + off * 0.000026, 11.0, k * 12.0, 43.0, 1.0) * 1.15;
  col += s * (1.0 + river * 1.6);
  // 极远处的别界：一粒粒带颜色的光
  vec2 q = (uv + off * 0.0000065) * 6.0, g = floor(q), f = fract(q) - 0.5;
  float h = hash(g + 91.0);
  float d = length(f - (vec2(hash(g + 5.0), hash(g + 9.0)) - 0.5) * 0.6);
  vec3 tint = 0.55 + 0.45 * cos(6.2831 * (h * 7.0 + vec3(0.0, 0.33, 0.67)));
  col += tint * (smoothstep(0.045, 0.0, d) * 1.3 + exp(-d * 18.0) * 0.26) * step(0.86, h);
  // 遁空：前方泛起一片青白的光
  col += vec3(0.5, 0.85, 0.9) * k * 0.1 * exp(-length(uv - uW.xy * 0.28) * 2.2);
  col *= 1.0 - 0.34 * dot(uv, uv);
  gl_FragColor = vec4(col, 1.0);
}`;

// 大陆面（山体随 aH 隆起，uK.w 是「远观的成分」：贴近地面时山体放平、调色退掉，露出和界内一样的底色）；悬在上方的云层共用这个顶点着色器
const TOP_VS = `attribute float aEdge; attribute float aH; uniform vec4 uK; varying vec2 vUv; varying float vEdge; varying vec3 vL; varying vec3 vN; varying float vH;
void main() {
  vUv = uv; vEdge = aEdge; vH = aH * uK.w;
  vec3 p = position; p.y += vH; vL = p;
  vN = normalize(vec3(normal.x * uK.w, normal.y, normal.z * uK.w));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const TOP_FS = `
uniform sampler2D uMap; uniform sampler2D uNoise; uniform sampler2D uDetail; uniform sampler2D uPA; uniform sampler2D uPB; uniform vec4 uRA; uniform vec4 uRB; uniform vec4 uK;
uniform vec3 uTint; uniform vec3 uPeak; uniform vec4 uP; uniform vec2 uSize; varying vec2 vUv; varying float vEdge; varying vec3 vL; varying vec3 vN; varying float vH;
${SOFT}
${LIGHT}
${CLOUDFN}
float inRect(vec2 q) { return smoothstep(0.0, 0.1, min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y))); }
void main() {
  vec3 c = texture2D(uMap, vUv).rgb;
  // 走近了：换成这一界真实的全图，再叠上脚下的两块局部细节（uK = 全图、近、远三者各用几成）
  c = mix(c, texture2D(uDetail, vUv).rgb, uK.x);
  vec2 qb = (vUv - uRB.xy) / (uRB.zw - uRB.xy), qa = (vUv - uRA.xy) / (uRA.zw - uRA.xy);
  c = mix(c, texture2D(uPB, qb).rgb, uK.z * inRect(qb));
  c = mix(c, texture2D(uPA, qa).rgb, uK.y * inRect(qa));
  vec3 raw = c;
  // 山体：朝光的一面亮、背光的一面暗；高处露出岩雪的颜色
  c *= clamp(1.0 + (dot(normalize(vN), LIGHT) - LIGHT.y) * 2.1, 0.38, 1.6);
  c = mix(c, uPeak, smoothstep(0.5, 1.0, vH / uSize.y) * 0.6);
  // 远观的调色：略压暗、罩一层大气的青蓝
  c = pow(c, vec3(1.2)) * vec3(0.9, 0.97, 0.93);
  c = mix(c, vec3(0.3, 0.46, 0.62), 0.14);
  // 云影：悬在上方的云层顺着光投下来的影子
  vec2 cu = (vL.xz + LIGHT.xz / LIGHT.y * uSize.x) * uP.w + vec2(uP.x * 0.00022, uP.x * 0.00009);
  c *= 1.0 - smoothstep(uP.y, uP.y + 0.16, cloudAt(cu)) * 0.4;
  // 靠近边缘染上界壁的光
  c = mix(c, uTint * 0.9 + 0.08, pow(vEdge, 5.0) * 0.5) * uP.z;
  gl_FragColor = vec4(mix(raw, c, uK.w), 1.0);
}`;
// 云层：悬在大陆面上方的一层，和地面之间有视差；朝光的一缘亮、背光的一缘暗
const CLOUD_FS = `
uniform sampler2D uNoise; uniform vec3 uTint; uniform vec4 uP; uniform vec4 uK; uniform float uFade; varying float vEdge; varying vec3 vL;
${SOFT}
${LIGHT}
${CLOUDFN}
void main() {
  vec2 cu = vL.xz * uP.w + vec2(uP.x * 0.00022, uP.x * 0.00009);
  float d = cloudAt(cu), a = smoothstep(uP.y, uP.y + 0.16, d);
  float toward = cloudAt(cu + LIGHT.xz * 0.0011);
  vec3 c = vec3(0.98, 0.975, 0.96) * clamp(0.82 + (d - toward) * 3.4, 0.58, 1.2);
  c = mix(c, uTint, 0.05);
  a *= (1.0 - smoothstep(0.88, 1.0, vEdge)) * uK.w * 0.93 * uFade;
  gl_FragColor = vec4(c * uP.z, a);
}`;
const BASE_VS = `attribute float aF; varying vec3 vN; varying vec3 vL; varying float vF;
void main() { vN = normal; vL = position; vF = aF; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BASE_FS = `
uniform sampler2D uNoise; uniform vec3 uTint; uniform vec4 uP; varying vec3 vN; varying vec3 vL; varying float vF;
${SOFT}
${LIGHT}
void main() {
  vec3 n = normalize(vN);
  float key = max(0.0, dot(n, normalize(vec3(LIGHT.x, 0.35, LIGHT.z + 0.2))));
  // 岩层：一道道横向的层理，被噪声推得起伏；再加竖向的裂隙
  float a = atan(vL.z, vL.x);
  float wob = soft(vec2(a * 0.02, vL.y / uP.y * 0.03)).r;
  float strata = 0.5 + 0.5 * sin(vL.y / uP.y * 46.0 + wob * 15.0);
  float crack = smoothstep(0.62, 0.8, soft(vec2(a * 0.11, vL.y / uP.y * 0.012 + 0.4)).g);
  float grit = soft(vec2(a * 0.2, vL.y / uP.y * 0.4)).b;
  vec3 rock = mix(vec3(0.07, 0.062, 0.085), vec3(0.32, 0.27, 0.24), strata * 0.42 + grit * 0.4 + wob * 0.2);
  rock *= 1.0 - crack * 0.55;
  vec3 c = rock * (0.26 + key * 1.25);
  c *= 1.0 - vF * 0.5;                                   // 越往下越暗
  c += uTint * 0.42 * pow(1.0 - vF, 5.0);                // 顶沿被界壁的光照着
  c += vec3(0.1, 0.06, 0.2) * vF * vF * 0.35;            // 底下映着虚空的紫
  // 裂隙深处透出这一界的灵光
  c += uTint * crack * smoothstep(0.15, 0.6, vF) * (0.35 + 0.25 * sin(uP.x * 0.9 + a * 9.0)) * 0.55;
  // 瀑布：有水的界，水从边缘一道道泻下去，落到半途散成雾
  float ang = a * 9.0, id = floor(ang), fx = fract(ang) - 0.5;
  float hh = fract(sin(id * 91.7) * 43758.5);
  float fall = exp(-fx * fx * (70.0 + hh * 160.0)) * step(0.45, hh) * uP.w;
  float flow = 0.62 + 0.38 * sin(vF * 70.0 - uP.x * 5.0 + hh * 20.0);
  float span = smoothstep(0.0, 0.02, vF) * (1.0 - smoothstep(0.2 + hh * 0.25, 0.5 + hh * 0.35, vF));
  c += vec3(0.78, 0.92, 1.0) * fall * flow * span * 1.15;
  c += vec3(0.6, 0.75, 0.9) * exp(-fx * fx * 9.0) * step(0.45, hh) * uP.w * smoothstep(0.25, 0.5, vF) * (1.0 - smoothstep(0.5, 0.8, vF)) * 0.22;
  gl_FragColor = vec4(c * uP.z, 1.0);
}`;
const DOME_VS = `varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - w.xyz; vUv = uv; gl_Position = projectionMatrix * viewMatrix * w; }`;
// 穹顶界壁：一层发光的琉璃——边缘亮（越贴着视线越亮，亮到晕开）、带一道天光的高光、根部一圈流转的符文和贴着地平线的辉光
const DOME_FS = `
uniform sampler2D uNoise; uniform sampler2D uGlyph; uniform vec3 uTint; uniform vec4 uP; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
${SOFT}
${LIGHT}
void main() {
  float time = uP.x, cols = uP.y;
  vec3 n = normalize(vN), v = normalize(vV);
  if (!gl_FrontFacing) n = -n;
  float fr = pow(1.0 - abs(dot(n, v)), 2.0), face = gl_FrontFacing ? 0.8 : 0.4;
  // 界壁根部的一圈符文：缓缓流转，明灭不定
  float cx = (vUv.x + time * 0.0016) * cols, col = floor(cx);
  float by = (vUv.y - 0.035) / 0.1;
  vec4 h = textureLod(uNoise, vec2((mod(col, 256.0) + 0.5) / 256.0, 0.5 / 256.0), 0.0);
  float idx = floor(h.b * 63.999);
  float inside = step(0.0, by) * step(by, 1.0) * step(0.12, h.g);
  vec2 cont = vec2(cx, by) / 8.0;
  float g = textureGrad(uGlyph, (vec2(mod(idx, 8.0), floor(idx / 8.0)) + clamp(vec2(fract(cx), 1.0 - by), 0.03, 0.97)) / 8.0, dFdx(cont), dFdy(cont)).r * inside;
  float pulse = 0.65 + 0.35 * sin(time * 1.3 + col * 1.7);
  float veil = exp(-pow((by - 0.5) / 0.9, 2.0)) * 0.05;
  // 界壁上流动的波光、落在罩子上的一道天光、贴着地平线的一圈辉光
  float shimmer = fbm(vUv * vec2(0.09, 0.03) + vec2(time * 0.0004, -time * 0.0003));
  float spec = pow(max(0.0, dot(reflect(-LIGHT, n), v)), 42.0);
  float horizon = pow(1.0 - vUv.y, 7.0);
  float a = (min(0.34, pow(fr, 1.7) * 0.7) + fr * 0.09 + 0.02 + veil + smoothstep(0.46, 0.7, shimmer) * 0.06 + 0.012 + horizon * 0.07 + spec * 0.45) * face + g * 0.9 * pulse;
  gl_FragColor = vec4(uTint * (1.0 + fr * fr * 1.6) + g * 0.5 + spec * 0.7, a * uP.z);
}`;
const GLOW_FS = `uniform vec3 uTint; uniform vec4 uP; varying vec2 vUv;
void main() { float d = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 2.0) * uP.z; gl_FragColor = vec4(uTint, a); }`;
const UV_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// ---------------------------------------------------------------- 别界的大陆面：照山河略图现场画一张小图
function mix32(v: number) { v = Math.imul(v ^ v >>> 16, 0x7feb352d); v = Math.imul(v ^ v >>> 15, 0x846ca68b); return (v ^ v >>> 16) >>> 0; }
function valueNoise(seed: number) {
  const h = (x: number, y: number) => mix32(Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed) / 4294967296;
  const one = (x: number, y: number) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = h(x0, y0), b = h(x0 + 1, y0), c = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  return (x: number, y: number, oct: number) => { let v = 0, amp = 0.5, f = 1, sum = 0; for (let i = 0; i < oct; i++) { v += one(x * f, y * f) * amp; sum += amp; amp *= 0.5; f *= 2.03; } return v / sum; };
}
type RGB = [number, number, number];
const lerp3 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const PALETTE: Record<Exclude<RealmKind, 'human'>, { sea: RGB; shore: RGB; low: RGB; high: RGB; peak: RGB; level: number; vein?: RGB }> = {
  archipelago: { sea: [18, 62, 110], shore: [70, 150, 170], low: [86, 142, 84], high: [58, 104, 66], peak: [200, 196, 170], level: 0.58 },
  desert: { sea: [70, 110, 120], shore: [214, 186, 128], low: [205, 168, 104], high: [168, 118, 70], peak: [232, 214, 176], level: 0.2 },
  frost: { sea: [96, 142, 178], shore: [190, 218, 232], low: [226, 236, 242], high: [176, 200, 222], peak: [250, 252, 255], level: 0.36 },
  spiritwood: { sea: [28, 84, 104], shore: [96, 168, 120], low: [58, 134, 74], high: [26, 86, 58], peak: [150, 220, 190], level: 0.3, vein: [120, 255, 210] },
  ember: { sea: [26, 14, 16], shore: [72, 40, 34], low: [64, 46, 44], high: [38, 28, 30], peak: [110, 80, 70], level: 0.3, vein: [255, 130, 40] },
  nether: { sea: [10, 8, 20], shore: [58, 46, 78], low: [70, 62, 92], high: [42, 36, 62], peak: [150, 140, 176], level: 0.4, vein: [170, 120, 255] },
};
/**
 * 别界的大陆面：照它的山河略图画一张小图（海岸、山脉、河、湖都和进去以后是同一份数据），颜色按样貌的色板。
 * 走近后会化成它真实的全图缩略。
 */
export function paintRealm(r: Realm, sk: RealmSketch): HTMLCanvasElement {
  const N = 256, mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; return c; };
  const P = PALETTE[r.kind as Exclude<RealmKind, 'human'>] ?? PALETTE.archipelago, noise = valueNoise(r.seed);
  const path = (g: CanvasRenderingContext2D, pts: readonly (readonly number[])[]) => { g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q[0] * N, q[1] * N) : g.moveTo(q[0] * N, q[1] * N))); };
  // 陆地的范围
  const land = mk(), lg = land.getContext('2d')!;
  lg.fillStyle = '#000'; lg.fillRect(0, 0, N, N); lg.fillStyle = '#fff';
  if (sk.mainland.length) { path(lg, sk.mainland); lg.closePath(); lg.fill(); }
  if (sk.islands) {
    let seed = r.seed || 1; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 170; i++) {
      const th = rnd() * Math.PI * 2, k = Math.sqrt(rnd()) * realmOutline(r, th) * 0.76, rad = (0.005 + rnd() * rnd() * 0.032) * N;
      lg.beginPath(); lg.ellipse((0.5 + Math.cos(th) * 0.5 * k) * N, (0.5 + Math.sin(th) * 0.5 * k) * N, rad * (0.7 + rnd() * 0.6), rad * (0.7 + rnd() * 0.6), rnd() * 3, 0, Math.PI * 2); lg.fill();
    }
  }
  lg.fillStyle = '#000';
  for (const l of sk.lakes) { lg.beginPath(); lg.arc(l.c[0] * N, l.c[1] * N, l.r * N, 0, Math.PI * 2); lg.fill(); }
  // 糊一圈当浅滩；山脉描成一道道亮带当高度
  const shore = mk(), sg = shore.getContext('2d')!; sg.filter = 'blur(5px)'; sg.drawImage(land, 0, 0);
  const hill = mk(), hg = hill.getContext('2d')!;
  hg.fillStyle = '#000'; hg.fillRect(0, 0, N, N); hg.lineCap = hg.lineJoin = 'round'; hg.filter = 'blur(3px)';
  for (const g of sk.ranges) { hg.strokeStyle = `rgba(255,255,255,${Math.min(1, 0.4 + g.h * 0.55)})`; hg.lineWidth = Math.max(2, g.w * N * 1.25); path(hg, g.pts); hg.stroke(); }
  const L = lg.getImageData(0, 0, N, N).data, S = sg.getImageData(0, 0, N, N).data, Hh = hg.getImageData(0, 0, N, N).data;
  const c = mk(), g = c.getContext('2d')!, img = g.createImageData(N, N), d = img.data;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4, n = noise(x / N * 10 + 11, y / N * 10 + 7, 4), e = Hh[i] / 255;
    let col: RGB;
    if (L[i] > 127) {
      const t = Math.max(0, Math.min(1, e * 0.85 + (n - 0.4) * 0.5));
      col = t < 0.45 ? lerp3(P.low, P.high, t / 0.45) : lerp3(P.high, P.peak, (t - 0.45) / 0.55);
      const slope = (Hh[(y * N + Math.min(N - 1, x + 1)) * 4] - Hh[(Math.max(0, y - 1) * N + x) * 4]) / 255 * 1.6 + (n - 0.5) * 0.16, l = 1 + slope;
      col = [col[0] * l, col[1] * l, col[2] * l];
    } else col = lerp3(P.sea, P.shore, Math.pow(S[i] / 255, 1.4) * 0.9 + (n - 0.5) * 0.12);
    d[i] = Math.max(0, Math.min(255, col[0])); d[i + 1] = Math.max(0, Math.min(255, col[1])); d[i + 2] = Math.max(0, Math.min(255, col[2])); d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // 河（炎墟是熔岩、灵木与幽冥是灵脉）画在最上面
  const vein = P.vein, water = vein ?? lerp3(P.sea, P.shore, 0.75);
  g.lineCap = g.lineJoin = 'round'; g.strokeStyle = `rgb(${water.map(Math.round).join(',')})`;
  if (vein) { g.shadowColor = g.strokeStyle; g.shadowBlur = 5; }
  for (const v of sk.rivers) { g.lineWidth = Math.max(1.2, v.w * N * 1.3); path(g, v.pts); g.stroke(); }
  return c;
}

// ---------------------------------------------------------------- 一界的三张网格
const SEG = 72;
function hashF(seed: number, a: number, b: number) { return mix32(seed + Math.imul(a, 73856093) + Math.imul(b, 19349663)) / 4294967296; }
/** 点到折线的距离（u、v 归一坐标；aspect 把 v 方向折成和 u 一样的尺度） */
function distPoly(u: number, v: number, pts: readonly (readonly number[])[], aspect: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const ax = pts[i][0], ay = pts[i][1] * aspect, bx = pts[i + 1][0], by = pts[i + 1][1] * aspect, px = u, py = v * aspect;
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(px - ax - dx * t, py - ay - dy * t));
  }
  return best;
}
/**
 * 大陆面：从中心到轮廓的一圈圈环。uv 按外接矩形铺开（人界的俯瞰图、别界的全图都照这个矩形画）。
 * 给了山河略图就做成密的网格、山脉处隆起（aH 是隆起的高度，由着色器按「远观的成分」放出来）；没给就是一张平的粗网格（远处的界、云层用）。
 */
function topGeometry(r: Realm, sketch: RealmSketch | null, reliefMax: number): BufferGeometry {
  const RINGS = sketch ? 44 : 6, S = sketch ? 132 : SEG, aspect = r.ry / r.rx, noise = sketch ? valueNoise(r.seed + 17) : null;
  const pos: number[] = [], uv: number[] = [], edge: number[] = [], hs: number[] = [], idx: number[] = [];
  for (let i = 0; i <= RINGS; i++) for (let j = 0; j <= S; j++) {
    const th = (j % S) / S * Math.PI * 2, f = i / RINGS, s = realmOutline(r, th) * f, x = Math.cos(th) * r.rx * s, z = Math.sin(th) * r.ry * s;
    const u = 0.5 + x / (2 * r.rx), v = 0.5 + z / (2 * r.ry);
    let h = 0;
    if (sketch && f < 0.97) {
      for (const g of sketch.ranges) { const d = distPoly(u, v, g.pts, aspect) / (g.w * 1.25); if (d < 1) { const k = 1 - d; h = Math.max(h, g.h * k * k * (3 - 2 * k)); } }
      h *= 0.55 + 0.9 * noise!(u * 16, v * 16, 3);
    }
    pos.push(x, h * reliefMax, z); uv.push(u, 1 - v); edge.push(f); hs.push(h * reliefMax);
  }
  for (let i = 0; i < RINGS; i++) for (let j = 0; j < S; j++) { const a = i * (S + 1) + j, b = a + S + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('aEdge', new Float32BufferAttribute(edge, 1)); g.setAttribute('aH', new Float32BufferAttribute(hs, 1));
  g.setIndex(idx); g.computeVertexNormals();
  // 法线是按隆起后的形状算的；位置放平存着，隆起多少交给着色器
  const P = g.attributes.position; for (let i = 0; i < P.count; i++) P.setY(i, 0);
  return g;
}/**
 * 岩石底座：上半截是近乎直立的崖壁，下半截收成参差的尖，像倒悬的山。
 * 崖壁必须够陡：镜头是从上往下 45° 看的，底座若一开始就往里收，侧面全被大陆面挡住，等于没画。
 */
function baseGeometry(r: Realm, depth: number): BufferGeometry {
  const RINGS = 14, pos: number[] = [], fs: number[] = [], idx: number[] = [];
  for (let i = 0; i <= RINGS; i++) for (let j = 0; j <= SEG; j++) {
    const jj = j % SEG, th = jj / SEG * Math.PI * 2, f = i / RINGS;
    const rough = i === 0 ? 0 : (hashF(r.seed, jj, i) - 0.5) * 0.34 + (hashF(r.seed, jj >> 2, i + 40) - 0.5) * 0.3;
    const s = realmOutline(r, th) * (1 - Math.pow(f, 2.6)) * (1 + 0.05 * Math.sin(Math.PI * Math.min(1, f * 1.6))) * (1 + rough * (0.12 + f * 0.9));
    // 往下的进深：有几处拖出长长的石笋
    const spire = Math.pow(hashF(r.seed, jj >> 1, 777), 5) * 0.85 * f * f;
    const drop = (i === RINGS ? 1.12 : f) * depth * (1 + (i === 0 ? 0 : (hashF(r.seed, jj >> 1, i + 90) - 0.5) * 0.3 * f + spire));
    pos.push(Math.cos(th) * r.rx * s, -drop, Math.sin(th) * r.ry * s); fs.push(f);
  }
  // 朝外的一面是正面：从上往下看，环是逆着方位角绕的
  for (let i = 0; i < RINGS; i++) for (let j = 0; j < SEG; j++) { const a = i * (SEG + 1) + j, b = a + SEG + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setAttribute('aF', new Float32BufferAttribute(fs, 1));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** 穹顶界壁：沿轮廓立起来的半个壳 */
function domeGeometry(r: Realm): BufferGeometry {
  const RINGS = 12, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= RINGS; i++) for (let j = 0; j <= SEG; j++) {
    const th = (j % SEG) / SEG * Math.PI * 2, ph = i / RINGS * Math.PI / 2, s = realmOutline(r, th) * Math.cos(ph) * 1.025;
    pos.push(Math.cos(th) * r.rx * s, Math.sin(ph) * r.dome, Math.sin(th) * r.ry * s); uv.push(j / SEG, i / RINGS);
  }
  for (let i = 0; i < RINGS; i++) for (let j = 0; j < SEG; j++) { const a = i * (SEG + 1) + j, b = a + SEG + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

interface RealmMesh { group: Group; cloud: ShaderMaterial; mats: ShaderMaterial[]; geos: BufferGeometry[]; map: CanvasTexture | null; top: ShaderMaterial; seen: number; detailed: boolean; far: Mesh[]; topMesh: Mesh; relief: boolean; reliefMax: number }
const STREAKS = 6, ROCKS = 150, DUST = 520;

export class VoidScene {
  private readonly scene = new Scene();
  readonly cam = new PerspectiveCamera(30, 1, 10, 100000);
  private readonly bgScene = new Scene();
  private readonly flat = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly bg: ShaderMaterial;
  private readonly copy: ShaderMaterial;
  private readonly copyScene = new Scene();
  /** 人物单独一层：体积云合进画面之后再画，人始终看得见 */
  private readonly heroScene = new Scene();
  private readonly clouds: VoidClouds;
  /** 贴近地面的那层低云（和界内画的是同一层）：只在离地很近时画 */
  private readonly cloudsLow: VoidClouds;
  private readonly blur: ShaderMaterial; private readonly blurScene = new Scene();
  private glowA: WebGLRenderTarget | null = null; private glowB: WebGLRenderTarget | null = null;
  private target: WebGLRenderTarget | null = null;
  private readonly glyph: CanvasTexture;
  private readonly blank: CanvasTexture;
  /** 还没现画细图的界先用的底色图：每类一张 */
  private readonly plain = new Map<string, CanvasTexture>();
  private readonly realms = new Map<string, RealmMesh>();
  private frame = 0;
  private things: VoidThings | null = null;
  private readonly hero: Mesh; private readonly heroCanvas: HTMLCanvasElement; private readonly heroTex: CanvasTexture; private readonly heroMat: MeshBasicMaterial;
  private readonly aura: ShaderMaterial; private readonly mark: Mesh;
  private figs: { key: string; mesh: Mesh; canvas: HTMLCanvasElement; tex: CanvasTexture; mat: MeshBasicMaterial; seen: number }[] = [];
  private readonly rocks: InstancedMesh; private rockCell = ''; private readonly rockMat: ShaderMaterial;
  private readonly dust: Points; private readonly dustMat: ShaderMaterial;
  private readonly streaks: InstancedMesh; private readonly streakState: { x: number; y: number; h: number; a: number; v: number; life: number; tint: number }[] = [];
  private readonly dummy = new Object3D();
  private homeRev = -1; private homeTex: CanvasTexture | null = null;
  private W = 1; private H = 1;
  /** 这一帧最多再现画几张别界的小图（一张约几毫秒） */
  private paintBudget = 0;

  constructor(private readonly gl: WebGLRenderer, private readonly noise: Texture, glyph: HTMLCanvasElement) {
    this.glyph = new CanvasTexture(glyph);
    this.clouds = new VoidClouds(gl, noise); this.cloudsLow = new VoidClouds(gl, noise);
    const one = document.createElement('canvas'); one.width = one.height = 4;
    const og = one.getContext('2d')!; og.fillStyle = '#3c4654'; og.fillRect(0, 0, 4, 4);
    this.blank = new CanvasTexture(one);
    const quad = new PlaneGeometry(2, 2), pass = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
    this.bg = new ShaderMaterial({ depthTest: false, depthWrite: false, vertexShader: pass, fragmentShader: BG_FS,
      uniforms: { uNoise: { value: noise }, uV: { value: new Vector4() }, uW: { value: new Vector4(1, 0, 0, 1) } } });
    this.bgScene.add(Object.assign(new Mesh(quad, this.bg), { frustumCulled: false }));
    // 合成：画面 + 泛光（亮处向外晕开）+ 穿云层时盖上来的云气
    this.copy = new ShaderMaterial({ depthTest: false, depthWrite: false, vertexShader: pass, transparent: true, blending: NormalBlending,
      uniforms: { uTex: { value: null }, uBloom: { value: null }, uNoise: { value: noise }, uC: { value: new Vector4() }, uB: { value: new Vector4(1, 0.9, 0, 1) }, uS: { value: new Vector4() } },
      fragmentShader: `uniform sampler2D uTex; uniform sampler2D uBloom; uniform sampler2D uNoise; uniform vec4 uC; uniform vec4 uB; uniform vec4 uS; varying vec2 vUv;
${SOFT}
void main() {
  vec3 c = vec3(0.0); float a = 0.0;
  if (uB.x > 0.5) {
    c = texture2D(uTex, vUv).rgb + texture2D(uBloom, vUv).rgb * uB.y; a = 1.0;
    // 高光柔和地收住：0.82 以下原样（近地面的底色要和界内一模一样），以上渐渐压向 1
    vec3 hi = max(c - 0.82, 0.0); c = min(c, vec3(0.82)) + 0.18 * (1.0 - exp(-hi / 0.18));
  }
  // 云气：两层，一层大团一层碎絮，顺着升降的方向流过；uC = 浓度、时间、流过的量、夜色
  if (uC.x > 0.002) {
    vec2 uv = (vUv - 0.5) * vec2(uB.w, 1.0);
    float n1 = fbm(uv * 0.012 + vec2(uC.y * 0.0012, uC.z * 0.02)), n2 = fbm(uv * 0.03 + vec2(-uC.y * 0.002, uC.z * 0.045) + 0.4);
    // 一层匀净的薄雾，只带一点大块的浓淡（云底下的水汽；真正成团的云在上面，是立体的）
    float k = clamp(uC.x * (0.8 + 0.5 * (n1 * 0.65 + n2 * 0.35 - 0.5)), 0.0, uS.z > 0.0 ? 0.55 : 0.93);
    vec3 cl = mix(vec3(0.78, 0.82, 0.89), vec3(0.95, 0.96, 0.97), smoothstep(0.3, 0.75, n2)) * (1.0 - uC.w * 0.62);
    c = mix(c, cl, k); a = max(a, k);
  }
  // 云门（第五轮返工）：门洞里那一团云，只贴着门心一带；uS = 门心的屏幕位置（0–1）、半径（按屏高）、浓度。整屏那层上限 0.55
  if (uS.z > 0.0 && uS.w > 0.002) {
    vec2 d = (vUv - uS.xy) * vec2(uB.w, 1.15);
    vec2 q = d / uS.z;
    float n3 = fbm(q * 1.7 + vec2(uC.y * 0.05, -uC.y * 0.08)), n4 = fbm(q * 4.1 + vec2(-uC.y * 0.11, uC.y * 0.07) + 0.6);
    // 边缘按两层噪声起伏（一团团的云头，不是一个圆）；中心够浓，人走到门心就被裹住
    float r = length(q) + (n3 * 0.6 + n4 * 0.4 - 0.5) * 0.95;
    float m = (1.0 - smoothstep(0.35, 1.05, r)) * uS.w * 0.97;
    vec3 cl2 = mix(vec3(0.82, 0.85, 0.9), vec3(0.97, 0.97, 0.98), smoothstep(0.3, 0.8, n4)) * (1.0 - uC.w * 0.62);
    c = mix(c, cl2, m); a = max(a, m);
  }
  gl_FragColor = vec4(c, a);
}` });
    this.blur = new ShaderMaterial({ depthTest: false, depthWrite: false, vertexShader: pass, uniforms: { uTex: { value: null }, uD: { value: new Vector4() } },
      fragmentShader: `uniform sampler2D uTex; uniform vec4 uD; varying vec2 vUv;
void main() {
  vec3 s = vec3(0.0); float w[5]; w[0] = 0.227; w[1] = 0.194; w[2] = 0.122; w[3] = 0.054; w[4] = 0.016;
  for (int i = -4; i <= 4; i++) { vec3 t = texture2D(uTex, vUv + uD.xy * float(i) * 1.6).rgb; if (uD.z > 0.5) t = max(vec3(0.0), t - uD.w) * 1.4; s += t * w[i < 0 ? -i : i]; }
  gl_FragColor = vec4(s, 1.0);
}` });
    this.blurScene.add(Object.assign(new Mesh(quad, this.blur), { frustumCulled: false }));
    this.copyScene.add(Object.assign(new Mesh(quad, this.copy), { frustumCulled: false }));

    // 人物立板：正对镜头；身后一团光；镜头拉得很远时，人小得看不见，换成一粒大小不变的光点
    this.heroCanvas = document.createElement('canvas'); this.heroCanvas.width = 384; this.heroCanvas.height = 448;
    this.heroTex = new CanvasTexture(this.heroCanvas); this.heroTex.minFilter = LinearFilter; this.heroTex.generateMipmaps = false;
    this.heroMat = new MeshBasicMaterial({ map: this.heroTex, transparent: true, depthWrite: false, toneMapped: false });
    this.hero = new Mesh(new PlaneGeometry(1, 1), this.heroMat); this.hero.renderOrder = 20; this.hero.frustumCulled = false;
    this.aura = new ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending, vertexShader: UV_VS,
      uniforms: { uTint: { value: new Vector3(0.75, 0.9, 1) }, uP: { value: new Vector4(0, 0, 0.3, 0) } }, fragmentShader: GLOW_FS });
    const auraMesh = Object.assign(new Mesh(new PlaneGeometry(1, 1), this.aura), { renderOrder: 19, frustumCulled: false });
    auraMesh.scale.set(0.8, 0.5, 1); auraMesh.position.set(0, -0.22, -1); this.hero.add(auraMesh);
    this.heroScene.add(this.hero);
    const markMat = new ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending, vertexShader: UV_VS,
      uniforms: { uTint: { value: new Vector3(1, 0.95, 0.8) }, uP: { value: new Vector4(0, 0, 1, 0) } },
      fragmentShader: `uniform vec3 uTint; uniform vec4 uP; varying vec2 vUv;
void main() { vec2 q = abs(vUv - 0.5) * 2.0; float d = length(q); float a = (pow(max(0.0, 1.0 - d), 3.0) + exp(-q.x * 26.0) * (1.0 - q.y) * 0.6 + exp(-q.y * 26.0) * (1.0 - q.x) * 0.6) * uP.z; gl_FragColor = vec4(uTint, a); }` });
    this.mark = Object.assign(new Mesh(new PlaneGeometry(1, 1), markMat), { renderOrder: 21, frustumCulled: false }); this.heroScene.add(this.mark);

    // 浮石：人身边那一层的碎石，飞起来才看得出快慢
    const rockGeo = new IcosahedronGeometry(1, 1), rp = rockGeo.attributes.position;
    for (let i = 0; i < rp.count; i++) { const k = 0.72 + hashF(77, Math.round(rp.getX(i) * 50), Math.round(rp.getY(i) * 50 + rp.getZ(i) * 91)) * 0.6; rp.setXYZ(i, rp.getX(i) * k, rp.getY(i) * k * 0.8, rp.getZ(i) * k); }
    const rockMat = this.rockMat = new ShaderMaterial({ uniforms: { uFade: { value: 1 } },
      vertexShader: `varying vec3 vP; void main() { vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uFade; varying vec3 vP;
void main() {
  // 渐隐：按屏幕像素撒点镂空（不用半透明，免得和别的东西排序打架）
  if (uFade < 0.999 && fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) > uFade) discard;
  vec3 n = normalize(cross(dFdx(vP), dFdy(vP)));
  float key = max(0.0, dot(n, normalize(vec3(-0.45, 0.6, 0.66))));
  vec3 c = vec3(0.08, 0.074, 0.095) * (0.45 + key * 2.3) + vec3(0.1, 0.07, 0.2) * pow(1.0 - abs(n.z), 2.0) * 0.4 + vec3(0.5, 0.42, 0.26) * pow(key, 6.0) * 0.4;
  gl_FragColor = vec4(c, 1.0);
}` });
    this.rocks = new InstancedMesh(rockGeo, rockMat, ROCKS); this.rocks.frustumCulled = false; this.rocks.count = 0; this.scene.add(this.rocks);

    // 灵尘：围着人的一箱光点，人往前飞，它们往后掠（位置在着色器里按人的位置取模，不用每帧上传）
    const dg = new BufferGeometry(), dp = new Float32Array(DUST * 3);
    for (let i = 0; i < dp.length; i++) dp[i] = hashF(1234, i, 7);
    dg.setAttribute('position', new Float32BufferAttribute(dp, 3));
    this.dustMat = new ShaderMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: { uOff: { value: new Vector3() }, uBox: { value: new Vector3(5200, 1900, 5200) }, uP: { value: new Vector4(1, 1, 0, 0) } },
      vertexShader: `uniform vec3 uOff; uniform vec3 uBox; uniform vec4 uP; varying float vA;
void main() {
  vec3 p = (fract(position - uOff / uBox) - 0.5) * uBox; p.y -= 420.0;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float fade = 1.0 - smoothstep(0.38, 0.5, max(abs(p.x) / uBox.x, abs(p.z) / uBox.z));
  vA = fade * uP.y * (0.35 + 0.65 * fract(position.x * 91.7 + position.z * 13.3));
  gl_PointSize = uP.x * (10.0 + 26.0 * fract(position.y * 57.3)) / max(1.0, -mv.z);
}`,
      fragmentShader: `varying float vA; void main() { float d = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(0.75, 0.86, 1.0, pow(max(0.0, 1.0 - d), 2.0) * vA); }` });
    this.dust = new Points(dg, this.dustMat); this.dust.frustumCulled = false; this.scene.add(this.dust);

    // 过路的遁光：别的修士从身边掠过，只看得见一道光
    const sg = new PlaneGeometry(1, 1); sg.rotateX(-Math.PI / 2);
    sg.setAttribute('aTint', new InstancedBufferAttribute(new Float32Array(STREAKS * 4), 4));
    const streakMat = new ShaderMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending,
      vertexShader: `attribute vec4 aTint; varying vec2 vUv; varying vec4 vT; void main() { vUv = uv; vT = aTint; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec2 vUv; varying vec4 vT;
void main() { float across = pow(max(0.0, 1.0 - abs(vUv.y - 0.5) * 2.0), 1.6); float a = (pow(vUv.x, 2.6) * across + exp(-length((vUv - vec2(0.97, 0.5)) * vec2(26.0, 3.0)) * 2.0) * 1.4) * vT.a; gl_FragColor = vec4(vT.rgb + a * 0.4, a); }` });
    this.streaks = new InstancedMesh(sg, streakMat, STREAKS); this.streaks.frustumCulled = false; this.streaks.renderOrder = 18; this.scene.add(this.streaks);
    for (let i = 0; i < STREAKS; i++) this.streakState.push({ x: 0, y: 0, h: 0, a: 0, v: 0, life: 99, tint: i });
  }

  /** 把虚空里的一点（高度 h，飞行平面为 0）换成屏幕位置（CSS 像素）。用的是最近一次 render 的镜头 */
  toScreen(x: number, y: number, h: number, at: { x: number; y: number }): { x: number; y: number; front: boolean } {
    const v = this.tmp.set(x - at.x, h, y - at.y).project(this.cam);
    return { x: (v.x * 0.5 + 0.5) * this.W, y: (0.5 - v.y * 0.5) * this.H, front: v.z < 1 };
  }
  private readonly tmp = new Vector3();

  private plainMap(kind: RealmKind): CanvasTexture {
    let t = this.plain.get(kind);
    if (!t) {
      const P = PALETTE[kind as Exclude<RealmKind, 'human'>] ?? PALETTE.archipelago, c = document.createElement('canvas'); c.width = c.height = 4;
      const g = c.getContext('2d')!, col = P.level > 0.5 ? lerp3(P.sea, P.shore, 0.4) : lerp3(P.low, P.high, 0.4);
      g.fillStyle = `rgb(${col.map(Math.round).join(',')})`; g.fillRect(0, 0, 4, 4);
      this.plain.set(kind, t = new CanvasTexture(c));
    }
    return t;
  }
  private realmMesh(r: Realm, time: number): RealmMesh {
    let M = this.realms.get(r.id);
    if (M) return M;
    const home = r.kind === 'human', baseDepth = home ? r.ry * 0.5 : Math.min(r.rx, r.ry) * (0.6 + hashF(r.seed, 3, 9) * 0.5);
    // 山体最高隆起多少、云层悬在多高（虚空单位）
    const reliefMax = home ? r.rx * 0.036 : r.rx * 0.08, cloudH = reliefMax * 1.15 + r.rx * 0.014;
    const tint = new Vector3(r.color[0], r.color[1], r.color[2]);
    const pal = home ? null : PALETTE[r.kind as Exclude<RealmKind, 'human'>];
    const peak = pal ? new Vector3(pal.peak[0] / 255, pal.peak[1] / 255, pal.peak[2] / 255) : new Vector3(0.9, 0.91, 0.9);
    const watery = home || r.kind === 'archipelago' || r.kind === 'spiritwood' || r.kind === 'frost';
    const geos = [topGeometry(r, null, 0), baseGeometry(r, baseDepth), domeGeometry(r), new PlaneGeometry(1, 1), topGeometry(r, null, 0)];
    const K = { value: new Vector4(0, 0, 0, 1) };   // 大陆面和云层共用：贴近地面时云层一起淡掉
    const P4 = () => new Vector4(time, home ? 0.47 : 0.53, home ? 0.95 : 1, home ? 0.0000042 : 0.0000075);
    const top = new ShaderMaterial({ vertexShader: TOP_VS, fragmentShader: TOP_FS,
      uniforms: { uMap: { value: home ? this.blank : this.plainMap(r.kind) }, uNoise: { value: this.noise }, uDetail: { value: this.blank }, uPA: { value: this.blank }, uPB: { value: this.blank },
        uRA: { value: new Vector4(0, 0, 1, 1) }, uRB: { value: new Vector4(0, 0, 1, 1) }, uK: K, uTint: { value: tint }, uPeak: { value: peak }, uP: { value: P4() }, uSize: { value: new Vector2(cloudH, Math.max(1, reliefMax)) } } });
    const cloud = new ShaderMaterial({ vertexShader: TOP_VS, fragmentShader: CLOUD_FS, transparent: true, depthWrite: false,
      uniforms: { uNoise: { value: this.noise }, uK: K, uTint: { value: tint }, uP: { value: P4() }, uFade: { value: 1 } } });
    const base = new ShaderMaterial({ vertexShader: BASE_VS, fragmentShader: BASE_FS,
      uniforms: { uNoise: { value: this.noise }, uTint: { value: tint }, uP: { value: new Vector4(time, baseDepth, 1, watery ? 1 : 0) } } });
    const cols = Math.max(24, Math.min(240, Math.round(2 * Math.PI * (r.rx + r.ry) / 2 / (r.dome * 1.57 * 0.1))));
    const dome = new ShaderMaterial({ vertexShader: DOME_VS, fragmentShader: DOME_FS, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
      uniforms: { uNoise: { value: this.noise }, uGlyph: { value: this.glyph }, uTint: { value: tint }, uP: { value: new Vector4(time, cols, 1, 0) } } });
    const glow = new ShaderMaterial({ vertexShader: UV_VS, fragmentShader: GLOW_FS, transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: { uTint: { value: tint }, uP: { value: new Vector4(0, 0, 0.42, 0) } } });
    const group = new Group();
    const glowMesh = new Mesh(geos[3], glow); glowMesh.rotation.x = -Math.PI / 2; glowMesh.scale.set(r.rx * 3.8, r.ry * 3.8, 1); glowMesh.position.y = -baseDepth * 0.3; glowMesh.renderOrder = 1;
    const topMesh = new Mesh(geos[0], top), baseMesh = new Mesh(geos[1], base), domeMesh = new Mesh(geos[2], dome), cloudMesh = new Mesh(geos[4], cloud);
    topMesh.renderOrder = 2; baseMesh.renderOrder = 2; cloudMesh.renderOrder = 4; cloudMesh.position.y = cloudH; domeMesh.renderOrder = 6;
    for (const m of [glowMesh, baseMesh, topMesh, cloudMesh, domeMesh]) { m.frustumCulled = false; group.add(m); }
    this.scene.add(group);
    M = { group, cloud, mats: [top, base, dome, glow, cloud], geos, map: null, top, seen: this.frame, detailed: false, far: [glowMesh, baseMesh, cloudMesh], topMesh, relief: false, reliefMax };
    this.realms.set(r.id, M);
    return M;
  }

  /** 只把云气盖到屏幕上（界内那一段升降用：底下是界内的画面） */
  veil(cloud: number, time: number, flow: number, night: number, W: number, H: number, pw: number, ph: number, spot?: { x: number; y: number; r: number; k: number } | null): void {
    const gl = this.gl;
    (this.copy.uniforms.uC.value as Vector4).set(cloud, time, flow, night);
    // 第五轮返工：云门那一团（屏幕坐标、CSS 像素）；没有就只盖整屏那一层（往天外升降仍是这样）
    (this.copy.uniforms.uS.value as Vector4).set(spot ? spot.x / W : 0, spot ? 1 - spot.y / H : 0, spot ? spot.r / H : 0, spot ? spot.k : 0);
    (this.copy.uniforms.uB.value as Vector4).set(0, 0, 0, W / H);
    gl.resetState(); gl.setRenderTarget(null); gl.setViewport(0, 0, pw, ph);
    gl.autoClear = false; gl.render(this.copyScene, this.flat); gl.autoClear = true;
    gl.resetState();
  }

  /** 先把着色器编好、人界的网格建好（升到云层之前做，换手那一帧就不卡） */
  /** 体积云用的立体噪声算好了没有（没好就接着算几毫秒） */
  cloudsReady(): boolean { return this.clouds.ready(4); }
  warm(home: Realm): void { if (this.warmed) return; this.warmed = true; this.clouds.compile(); this.gl.compile(this.heroScene, this.cam); this.realmMesh(home, 0); this.gl.compile(this.scene, this.cam); this.gl.compile(this.bgScene, this.flat); this.gl.compile(this.copyScene, this.flat); this.gl.compile(this.blurScene, this.flat); }
  private warmed = false;
  private patchTex: (CanvasTexture | null)[] = [null, null]; private patchRev = [-1, -1];
  private detailTex: CanvasTexture | null = null; private detailRev = -1; private detailId = ''; private detailMix = 0;

  /**
   * 画一帧虚空，直接画到屏幕上。W、H 是画面的 CSS 尺寸，pw、ph 是画布的像素尺寸。
   * paintHero 把主角画进一张小画布（和界内同一套画法）。
   */
  /** out：画到这张图上（斗法场拿它垫底）；不给就画到屏幕上 */
  render(v: VoidView, W: number, H: number, pw: number, ph: number, paintHero: (canvas: HTMLCanvasElement) => void, out: WebGLRenderTarget | null = null): void {
    this.W = W; this.H = H; this.frame++;
    const gl = this.gl, t = v.time;
    if (!this.target || this.target.width !== pw || this.target.height !== ph) {
      this.target?.depthTexture?.dispose(); this.target?.dispose(); this.glowA?.dispose(); this.glowB?.dispose();
      const type = gl.capabilities.isWebGL2 && gl.extensions.has('EXT_color_buffer_float') ? HalfFloatType : UnsignedByteType;
      this.target = new WebGLRenderTarget(pw, ph, { depthBuffer: true, samples: 4, generateMipmaps: false, type, depthTexture: new DepthTexture(pw, ph) });
      this.target.texture.minFilter = this.target.texture.magFilter = LinearFilter;
      const gw = Math.max(2, pw >> 2), gh = Math.max(2, ph >> 2);
      this.glowA = new WebGLRenderTarget(gw, gh, { depthBuffer: false, generateMipmaps: false, type }); this.glowB = new WebGLRenderTarget(gw, gh, { depthBuffer: false, generateMipmaps: false, type });
      for (const g of [this.glowA, this.glowB]) g.texture.minFilter = g.texture.magFilter = LinearFilter;
    }
    // —— 镜头：和界内同一种摆法——盯着一块「地面」，离它 D，俯角与朝向照搬。一律以人物所在处为原点
    const C = v.cam, D = C.D * (1 + v.streak * 0.3), P = C.pitch * Math.PI / 180, ux = Math.sin(C.yaw), uy = -Math.cos(C.yaw), cam = this.cam;
    const tx = C.tx - v.x, tz = C.ty - v.y;
    cam.aspect = W / H; cam.near = Math.max(1.5, D * 0.04); cam.far = D * 14 + 60000;
    cam.position.set(tx - ux * Math.cos(P) * D, C.ground + Math.sin(P) * D, tz - uy * Math.cos(P) * D); cam.up.set(0, 1, 0); cam.lookAt(tx, C.ground, tz);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const pxPerUnit = H / (2 * D * Math.tan(15 * Math.PI / 180));
    // —— 背景
    const sp = Math.hypot(v.vx, v.vy), dx = sp > 1 ? v.vx / sp : 1, dy = sp > 1 ? v.vy / sp : 0;
    const sx = dx * Math.cos(C.yaw) + dy * Math.sin(C.yaw), sy = (-dx * Math.sin(C.yaw) + dy * Math.cos(C.yaw)) * Math.SQRT1_2, dl = Math.hypot(sx, sy) || 1;
    (this.bg.uniforms.uV.value as Vector4).set(v.x, -v.y, t, W / H);
    (this.bg.uniforms.uW.value as Vector4).set(sx / dl, -sy / dl, v.streak, 1);
    // —— 各界
    this.paintBudget = 2;
    let deck: CloudDeck | null = null, deckLow: CloudDeck | null = null;
    const det = v.detail;
    if (det && det.realmId !== this.detailId) { this.detailId = det.realmId; this.detailMix = 0; this.detailRev = -1; this.patchRev = [-1, -1]; }
    for (const r of v.realms) {
      const M = this.realmMesh(r, t); M.seen = this.frame;
      M.group.visible = true; M.group.position.set(r.x - v.x, -r.depth, r.y - v.y);
      for (const m of M.mats) (m.uniforms.uP.value as Vector4).x = t;
      const dist = Math.hypot(r.x - v.x, r.y - v.y) - Math.max(r.rx, r.ry);
      const small = r.rx * pxPerUnit < 22;   // 在画面上的半径不到二十来个像素
      for (const m of M.far) m.visible = !small;
      const K = M.top.uniforms.uK.value as Vector4;
      if (!M.relief && dist < 52000 && this.paintBudget > 0) {
        this.paintBudget--; M.relief = true;
        const g = topGeometry(r, realmSketch(r), M.reliefMax); M.topMesh.geometry.dispose(); M.topMesh.geometry = g; M.geos[0] = g;
      }
      if (r.kind === 'human') {
        if (v.homeMap && this.homeRev !== v.homeRev) {
          this.homeRev = v.homeRev;
          if (!this.homeTex) { this.homeTex = new CanvasTexture(v.homeMap); this.homeTex.anisotropy = 8; } else { this.homeTex.image = v.homeMap; this.homeTex.needsUpdate = true; }
          M.top.uniforms.uMap.value = this.homeTex;
        }
      } else if (!M.detailed && dist < 52000 && this.paintBudget > 0) {
        this.paintBudget--; M.detailed = true;
        M.map = new CanvasTexture(paintRealm(r, realmSketch(r))); M.map.anisotropy = 4; M.top.uniforms.uMap.value = M.map;
      }
      // 脚下这一界：真实的全图（别界）与近地面的细节图
      M.cloud.uniforms.uFade.value = 1;
      if (det && det.realmId === r.id) {
        // 体积云：脚下这一界从贴地到巡航高度全程用它（平面的那层云只留给别的界）
        const vol = 1, P = M.cloud.uniforms.uP.value as Vector4, base = r.rx * 0.03;
        M.cloud.uniforms.uFade.value = 1 - vol;
        deck = { x: r.x - v.x, z: r.y - v.y, rx: r.rx, ry: r.ry, ground: -r.depth, base, top: base + r.rx * 0.03, threshold: P.y, scale: P.w,
          outline: [r.kind === 'human' ? 1 : 0, (r.seed & 255) / 255 * 6.283, ((r.seed >>> 8) & 255) / 255 * 6.283, ((r.seed >>> 16) & 255) / 255 * 6.283],
          tint: r.color, time: t, fade: vol, night: v.night };
        if (v.lowCloud > 0.004) deckLow = { ...deck, base: LOW_CLOUD.base / VOID_SCALE, top: LOW_CLOUD.top / VOID_SCALE, tile: LOW_CLOUD.tile / VOID_SCALE, fade: v.lowCloud, cover: v.cover, haze: 0, dense: LOW_CLOUD.dense, floor: LOW_CLOUD.floor };
        if (det.map && this.detailRev !== det.rev) {
          this.detailRev = det.rev; this.detailTex?.dispose();
          this.detailTex = new CanvasTexture(det.map); this.detailTex.anisotropy = 8;
        }
        if (this.detailTex && det.map) { M.top.uniforms.uDetail.value = this.detailTex; this.detailMix = Math.min(1, this.detailMix + v.dt / 1.6); }
        K.x = det.map ? this.detailMix : 0;
        det.patches.forEach((q, i) => {
          const U = M.top.uniforms[i ? 'uPB' : 'uPA'], R = M.top.uniforms[i ? 'uRB' : 'uRA'].value as Vector4;
          if (!q) { if (i) K.z = 0; else K.y = 0; return; }
          if (this.patchRev[i] !== q.rev) { this.patchRev[i] = q.rev; this.patchTex[i]?.dispose(); const tex = this.patchTex[i] = new CanvasTexture(q.canvas); tex.anisotropy = 8; }
          U.value = this.patchTex[i]; R.set(q.u0, q.v0, q.u1, q.v1);
          // 近的那块只在贴地时用，远的那块用到更高处
          const k = i ? 1 - Math.max(0, Math.min(1, (v.high - 0.14) / 0.16)) : 1 - Math.max(0, Math.min(1, (v.high - 0.03) / 0.05));
          if (i) K.z = k; else K.y = k;
        });
        K.w = Math.max(0, Math.min(1, (v.high - 0.02) / 0.07));   // 山体的隆起、远观的调色、云影：离地一点就渐渐显出来（云层何时显由体积云与 uFade 管）
      } else { K.x = K.y = K.z = 0; K.w = 1; }
    }
    // 走远了的界：隐藏；隔得久了就把网格和贴图放掉
    for (const [id, M] of this.realms) {
      if (M.seen === this.frame) continue;
      M.group.visible = false;
      if (this.frame - M.seen > 600) { this.scene.remove(M.group); for (const g of M.geos) g.dispose(); for (const m of M.mats) m.dispose(); M.map?.dispose(); this.realms.delete(id); }
    }
    // —— 人物：正对镜头，脚踩在自己的高度上
    this.hero.visible = v.heroW > 0;
    if (this.hero.visible) { paintHero(this.heroCanvas); this.heroTex.needsUpdate = true; }
    const hw = Math.max(1e-3, v.heroW), hh = hw * this.heroCanvas.height / this.heroCanvas.width;
    this.hero.quaternion.copy(cam.quaternion);
    this.hero.scale.set(hw, hh, 1);
    this.hero.position.set(0, v.heroY, 0).addScaledVector(this.tmp.set(0, 1, 0).applyQuaternion(cam.quaternion), v.heroFoot - hh / 2);
    this.heroMat.opacity = 1;
    (this.aura.uniforms.uP.value as Vector4).z = (0.1 + v.high * 0.14 + v.streak * 0.5 + v.spool * 0.35);
    this.mark.visible = false;
    this.placeFigures(v.figures ?? [], v, cam);
    const zoom = pxPerUnit / 1.36 * 1080 / H;   // 折成原先「镜头远近」的那个数，浮石、灵尘按它决定显不显示
    // —— 浮石：按人所在的格子重新摆（换了格子才重摆）
    const CELL = 3600, cx = Math.floor(v.x / CELL), cy = Math.floor(v.y / CELL), key = cx + ',' + cy + ':' + v.realms.length + (v.realms[0]?.id ?? '');
    const fk = Math.min(1, (v.fight ?? 0) * 2.4), fade = 1 - fk * fk * (3 - 2 * fk);
    this.rockMat.uniforms.uFade.value = fade;
    this.rocks.visible = zoom > 0.05 && zoom < 3 && fade > 0.01;
    if (this.rocks.visible) {
      if (key !== this.rockCell) {
        this.rockCell = key;
        let n = 0; const d = this.dummy;
        for (let j = -4; j <= 4 && n < ROCKS; j++) for (let i = -5; i <= 5 && n < ROCKS; i++) {
          const gx = cx + i, gy = cy + j, seed = mix32(Math.imul(gx, 92837111) ^ Math.imul(gy, 689287499));
          const count = seed % 7 < 3 ? 0 : seed % 7 < 6 ? 1 : 2;
          for (let k = 0; k < count && n < ROCKS; k++) {
            const s = mix32(seed + k * 7919), f = (b: number) => ((s >>> b) & 255) / 255, big = f(2) > 0.88, size = (40 + f(0) * f(0) * 250) * (big ? 5.5 : 1);
            const rx = (gx + f(8)) * CELL, ry = (gy + f(24)) * CELL;
            if (v.realms.some((q) => Math.hypot((rx - q.x) / (q.rx * 1.12), (ry - q.y) / (q.ry * 1.12)) < 1)) continue;
            d.position.set((i + f(8)) * CELL, -180 - size - f(16) * 1300 - (big ? 1600 + f(10) * 3600 : 0), (j + f(24)) * CELL);
            d.rotation.set(f(4) * 6.28, f(12) * 6.28, f(20) * 6.28); d.scale.set(size * (0.8 + f(6) * 0.9), size * (0.6 + f(14) * 0.5), size * (0.8 + f(22) * 0.9)); d.updateMatrix();
            this.rocks.setMatrixAt(n++, d.matrix);
          }
        }
        this.rocks.count = n; this.rocks.instanceMatrix.needsUpdate = true;
      }
      this.rocks.position.set(cx * CELL - v.x, 0, cy * CELL - v.y);
    }
    // —— 灵尘
    this.dust.visible = zoom > 0.1 && zoom < 2;
    (this.dustMat.uniforms.uOff.value as Vector3).set(v.x, 0, v.y);
    (this.dustMat.uniforms.uP.value as Vector4).set(ph * 0.9, Math.min(1, (zoom - 0.1) / 0.15) * 0.6, 0, 0);
    // —— 过路的遁光
    this.streaks.visible = zoom > 0.08 && fade > 0.5;
    if (this.streaks.visible) {
      const d = this.dummy, tints = this.streaks.geometry.attributes.aTint as InstancedBufferAttribute, COLORS = [[0.6, 0.95, 1], [1, 0.85, 0.55], [0.8, 0.65, 1], [0.55, 1, 0.75]];
      this.streakState.forEach((s, i) => {
        s.life += v.dt;
        const far = Math.hypot(s.x - v.x, s.y - v.y);
        if (s.life > 16 || far > 15000) {
          // 从视野外的一侧进来，斜着掠过
          const seed = mix32(this.frame * 31 + i * 977 + Math.floor(t * 13)), f = (b: number) => ((seed >>> b) & 255) / 255;
          s.a = f(0) * Math.PI * 2; s.v = 1500 + f(8) * 2200; s.h = -520 + f(16) * 640; s.life = -f(24) * 9 - i * 1.7; s.tint = seed % COLORS.length;
          const side = (f(4) - 0.5) * 5200, back = 6200 + f(12) * 1500;
          s.x = v.x - Math.cos(s.a) * back - Math.sin(s.a) * side; s.y = v.y - Math.sin(s.a) * back + Math.cos(s.a) * side;
        }
        if (s.life > 0) { s.x += Math.cos(s.a) * s.v * v.dt; s.y += Math.sin(s.a) * s.v * v.dt; }
        const len = s.v * 0.3, alpha = s.life > 0 ? Math.min(1, s.life * 2) * Math.max(0, Math.min(1, (13000 - far) / 4000)) : 0, c = COLORS[s.tint];
        d.position.set(s.x - v.x - Math.cos(s.a) * len / 2, s.h + v.heroY, s.y - v.y - Math.sin(s.a) * len / 2);
        d.rotation.set(0, -s.a, 0); d.scale.set(len, 1, 20); d.updateMatrix();
        this.streaks.setMatrixAt(i, d.matrix); tints.setXYZW(i, c[0], c[1], c[2], alpha * 0.85);
      });
      this.streaks.instanceMatrix.needsUpdate = true; tints.needsUpdate = true;
    }
    (this.things ??= new VoidThings(this.scene)).update(v.things ?? [], v.x, v.y, t, v.thingsFade ?? 0);
    // 浮石、灵尘、遁光都在飞行平面那一层：人还在界壁之内时不画
    const outside = v.heroY > -200;
    if (!outside) { this.rocks.visible = false; this.dust.visible = false; this.streaks.visible = false; }
    // —— 画：背景 → 场景 → 取亮处晕开 → 合到屏幕上（带云气）
    gl.resetState();
    gl.setRenderTarget(this.target);
    gl.autoClear = false; gl.clear(true, true, false);
    gl.render(this.bgScene, this.flat);
    gl.render(this.scene, cam);
    // 体积云：读刚画好的深度，画进一张小图，再合回来；然后才画人物
    if (deckLow && this.cloudsLow.render(deckLow, cam, this.target.depthTexture!, pw, ph, v.dt)) { gl.setRenderTarget(this.target); this.cloudsLow.composite(); }
    if (deck && this.clouds.render(deck, cam, this.target.depthTexture!, pw, ph, v.dt)) { gl.setRenderTarget(this.target); this.clouds.composite(); }
    gl.setRenderTarget(this.target); gl.render(this.heroScene, cam);
    const D4 = this.blur.uniforms.uD.value as Vector4;
    this.blur.uniforms.uTex.value = this.target.texture; D4.set(1 / this.glowA!.width, 0, 1, 0.86);
    gl.setRenderTarget(this.glowA); gl.render(this.blurScene, this.flat);
    this.blur.uniforms.uTex.value = this.glowA!.texture; D4.set(0, 1 / this.glowA!.height, 0, 0);
    gl.setRenderTarget(this.glowB); gl.render(this.blurScene, this.flat);
    this.blur.uniforms.uTex.value = this.glowB!.texture; D4.set(2.2 / this.glowA!.width, 0, 0, 0);
    gl.setRenderTarget(this.glowA); gl.render(this.blurScene, this.flat);
    this.blur.uniforms.uTex.value = this.glowA!.texture; D4.set(0, 2.2 / this.glowA!.height, 0, 0);
    gl.setRenderTarget(this.glowB); gl.render(this.blurScene, this.flat);
    gl.setRenderTarget(out); if (!out) gl.setViewport(0, 0, pw, ph);
    this.copy.uniforms.uTex.value = this.target.texture; this.copy.uniforms.uBloom.value = this.glowB!.texture;
    (this.copy.uniforms.uC.value as Vector4).set(v.cloud, t, v.flow, v.night); (this.copy.uniforms.uS.value as Vector4).set(0, 0, 0, 0);
    (this.copy.uniforms.uB.value as Vector4).set(1, 0.95, 0, W / H);
    gl.render(this.copyScene, this.flat);
    gl.autoClear = true;
    gl.resetState();
  }

  /** 对手、追兵的立板：和人物一样正对镜头、脚踩在人物那一层；用到几个建几个，没用到的藏起来，久不用就放掉 */
  private placeFigures(list: readonly VoidFigure[], v: VoidView, cam: PerspectiveCamera): void {
    for (const f of this.figs) f.mesh.visible = false;
    const up = this.tmp.set(0, 1, 0).applyQuaternion(cam.quaternion).clone();
    for (const F of list) {
      let f = this.figs.find((q) => q.key === F.key) ?? this.figs.find((q) => q.seen < this.frame - 1 && !q.mesh.visible && q.canvas.width === F.cw && q.canvas.height === F.ch);
      if (!f) {
        const canvas = document.createElement('canvas'); canvas.width = F.cw; canvas.height = F.ch;
        const tex = new CanvasTexture(canvas); tex.minFilter = LinearFilter; tex.generateMipmaps = false;
        const mat = new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
        const mesh = new Mesh(new PlaneGeometry(1, 1), mat); mesh.renderOrder = 19; mesh.frustumCulled = false; this.heroScene.add(mesh);
        f = { key: F.key, mesh, canvas, tex, mat, seen: this.frame }; this.figs.push(f);
      }
      f.key = F.key; f.seen = this.frame;
      F.paint(f.canvas); f.tex.needsUpdate = true;
      const hh = F.w * F.ch / F.cw;
      f.mesh.visible = true; f.mesh.quaternion.copy(cam.quaternion); f.mesh.scale.set(F.w, hh, 1); f.mat.opacity = F.alpha ?? 1;
      f.mesh.position.set(F.x - v.x, F.h ?? v.heroY, F.y - v.y).addScaledVector(up, F.foot - hh / 2);
    }
    for (let i = this.figs.length - 1; i >= 0; i--) {
      const f = this.figs[i];
      if (this.frame - f.seen > 900) { this.heroScene.remove(f.mesh); f.mesh.geometry.dispose(); f.mat.dispose(); f.tex.dispose(); this.figs.splice(i, 1); }
    }
  }

  dispose(): void {
    for (const f of this.figs) { f.mesh.geometry.dispose(); f.mat.dispose(); f.tex.dispose(); }
    for (const M of this.realms.values()) { for (const g of M.geos) g.dispose(); for (const m of M.mats) m.dispose(); M.map?.dispose(); }
    for (const t of this.plain.values()) t.dispose();
    this.realms.clear(); this.clouds.dispose(); this.cloudsLow.dispose(); this.target?.depthTexture?.dispose(); this.target?.dispose(); this.glowA?.dispose(); this.glowB?.dispose(); this.detailTex?.dispose(); for (const q of this.patchTex) q?.dispose(); this.homeTex?.dispose(); this.glyph.dispose(); this.blank.dispose(); this.heroTex.dispose();
  }
}
