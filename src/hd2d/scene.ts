// HD2D 场景（three.js）：倾斜可旋转的正交相机 + 地面平面 + 立板。
// 坐标：three 的 X = 世界 x，Z = 世界 y（向南为正），Y = 高度。游戏逻辑仍是 2D 世界坐标，这里只负责摆成立体来呈现。
//
// 画面来源仍是原有的 2D 绘制代码：每帧把要「立起来」的东西（人物、树、山、建筑……）逐个画进一张图集的格子里，
// 再用面向相机的立板摆到它脚下的位置；贴地的东西（草、地面花纹、影子……）画进一张「地贴」纹理，铺在地面上。
// 这样原有美术、模组换图都不用改。three 渲染出的画面交回 GLStage，照旧走调色、神识圈、云雾、特效与泛光。
import {
  WebGLRenderer, Scene, OrthographicCamera, PerspectiveCamera, Vector3, Mesh, PlaneGeometry, MeshBasicMaterial, CanvasTexture,
  InstancedMesh, InstancedBufferAttribute, ShaderMaterial, LinearFilter, LinearSRGBColorSpace, Color, Raycaster, Vector2, DoubleSide, WebGLRenderTarget, Float32BufferAttribute, Matrix4, Texture, RepeatWrapping,
  DepthTexture, Vector4, NearestFilter, UnsignedIntType, DataTexture, RGBAFormat, LinearMipmapLinearFilter,
  CylinderGeometry, CircleGeometry, BackSide, AdditiveBlending, Object3D, CustomBlending, AddEquation, OneFactor, OneMinusSrcColorFactor, ZeroFactor,
} from 'three';
import { HdBuildings } from './buildings';
import { HdStaticAtlas, type StaticSprite } from './staticAtlas';
import { BitmapFrame } from '../gfx/bitmap-frame';
import { prof } from '../core/prof';
import type { WorldTarget } from '../gl/stage';
import { hdShadows } from './ui';
import { SHADOW_FS } from './shadowGlsl';
import { MOUNTAINS, SURFACE_MAX_HEIGHT } from '../world/surface';
import { VoidScene, type VoidView } from './voidscene';
import { HdRealm } from './realm';
import { SectFx } from './sectFx';
import { VoidClouds, type CloudDeck } from './voidclouds';
import { ZhenWalls } from './zhenwall';
import { TerrainFalls } from './terrainFalls';
import { ROOM_FADE_FS } from './roomFade';
import { TunnelBladesFx, PASSAGE_HERO_Y, type TunnelBladeView } from './tunnelblades';

interface SharedRenderer extends WebGLRenderer {
  setRenderTargetFramebuffer(target: WebGLRenderTarget, framebuffer: WebGLFramebuffer): void;
}

export interface HdItem { x: number; y: number; l: number; r: number; t: number; b: number; u0: number; v0: number; u1: number; v1: number; a: number; air: boolean; seq: number; k: number; static: boolean; bitmap?: boolean; scenery?: boolean;
  /** r11：叠加合成的光（模组 blend: 'add'）：另一组实例里画，不写深度、不投影 */
  add?: boolean }
export interface HdAllocRequest {
  x: number; y: number; l: number; r: number; t: number; b: number;
  scale: number; air: boolean; alpha: number; k: number; seq: number; priority: number;
  /** r11：这一格是叠加的光（见 HdItem.add） */
  add?: boolean;
}
export interface HdAllocCell { Z: number; ox: number; oy: number; clip: readonly [number, number, number, number] }

export const MAX_BB = 4096;
/** 俯角（度）固定 45°：不改角度，遇到山时相机随人物升高 */
export const HD_PITCH = 45;
/** 透视相机的竖直视场（度）。取小视场：保留俯视的规整感，又有近大远小——站在高处看山脚会变小，飞高时大地向远处退去 */
export const HD_FOV = 35;
/** 高山模式的视距上限，按相机到人物距离的倍数计。平地上画面最远处约 1.41 倍；远山雾从 1.5 倍起、到 2.0 倍全白 */
export const HD_VIEW_LIMIT = 2.05;
/** 默认用透视相机；localStorage taixu.hdcam=ortho 退回正交相机 */
const HD_PERSPECTIVE = (() => { try { return typeof localStorage === 'undefined' || localStorage.getItem('taixu.hdcam') !== 'ortho'; } catch { return true; } })();
// ---- 阴影：一张跟随镜头的正交阴影图。立板、建筑往里写深度；地面、地贴和立板读它。
// uShadowParams = (浓度, 深度偏移, 1/阴影图边长, 立板受影比例)；uShadowTint 是影子里的颜色倍率（偏冷）。
const VS = `
attribute vec3 iFoot; attribute vec4 iBox; attribute vec4 iUv; attribute vec3 iA;
uniform vec3 uRight; uniform float uBoost; uniform mat4 uShadowMatrix; uniform vec4 uFold;
varying vec2 vUv; varying float vA; varying float vStatic; varying vec3 vShadow;
void main(){
  // 立板整体按脚下那一点受影（略抬高，避开自己影子的底边）
  vShadow = (uShadowMatrix * vec4(iFoot.x, iFoot.z + 8.0, iFoot.y, 1.0)).xyz * 0.5 + 0.5;
  vec2 k = position.xy + 0.5;                       // 0..1
  float fx = mix(iBox.x, iBox.y, k.x);              // 立板上的横向偏移（世界单位）
  // 2D 里的纵向偏移（向上为负）。网格竖向有三排顶点：下沿、脚底线、上沿——中间那排钉在脚底线上（立板不跨脚底线时并到最近的边）
  float fy = k.y < 0.25 ? iBox.w : k.y > 0.75 ? iBox.z : clamp(0.0, iBox.z, iBox.w);
  k.y = abs(iBox.z - iBox.w) > 1e-4 ? (fy - iBox.w) / (iBox.z - iBox.w) : k.y;   // 贴图坐标跟着实际的纵向位置走
  // 脚底线以上：竖着立起来。脚底线以下（脚下的法器、光圈、衣摆的影子）：若照样往下画就插进地里被地面挡掉了，
  // 改成贴着地面朝镜头那边铺开（uFold.xyz = 地面上指向镜头的方向 × 铺开的比例，画面上的位置不变），略抬一点免得和地面打架
  vec3 rise = fy <= 0.0 ? vec3(0.0, -fy * uBoost, 0.0) : uFold.xyz * fy + vec3(0.0, uFold.w, 0.0);
  vec3 w = vec3(iFoot.x, iFoot.z, iFoot.y) + (uRight * fx + rise) * iA.y;
  vUv = vec2(mix(iUv.x, iUv.z, k.x), mix(iUv.w, iUv.y, k.y));
  vA = iA.x;
  vStatic = iA.z;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
const FS = `
uniform sampler2D uMap; uniform sampler2D uStatic; uniform sampler2D uScenery; varying vec2 vUv; varying float vA; varying float vStatic; varying vec3 vShadow;
${SHADOW_FS}
// vStatic：0 = 每帧重画的工作图集；1 / 2 = 人物图集里的画布 / 位图；3 / 4 = 景物图集里的画布 / 位图（位图已预乘透明度）
void main(){ vec4 c = vStatic > 2.5 ? texture2D(uScenery, vUv) : vStatic > 0.5 ? texture2D(uStatic, vUv) : texture2D(uMap, vUv); float a = c.a * vA; if (a < 0.04) discard;
  vec3 lit = shadowMul(shadowAt(vShadow) * uShadowParams.w);
  float premultiplied = step(1.5, vStatic) * (1.0 - step(2.5, vStatic)) + step(3.5, vStatic);
  gl_FragColor = vec4(c.rgb * lit * mix(a, vA, premultiplied), a); }`;
/**
 * r11：叠加的光（模组绘制项 blend: 'add'，例如 KLK 的光晕、闪光、光环）。格子里是模组用 lighter 叠出来的光：预乘后的颜色就是要加上去的量，
 * 透明度只是一路累加、往往到 1——按普通板合成会把后面的人和地面整块盖成实色。这里只输出预乘后的颜色，由材质按滤色混合（见 bbAdd）加到底下。
 * 光不受影子压暗。
 */
const FS_ADD = `
uniform sampler2D uMap; varying vec2 vUv; varying float vA;
void main(){ vec4 c = texture2D(uMap, vUv); float a = c.a * vA; if (a < 0.003) discard;
  gl_FragColor = vec4(c.rgb * a, 0.0); }`;
// 云海：固定海拔上的两层薄片，噪声随风漂移；uCloud = (时间, 整体浓度, 层内相位, 0)
const CLOUD_VS = `
varying vec3 vWorld;
void main(){ vec4 world = modelMatrix * vec4(position, 1.0); vWorld = world.xyz; gl_Position = projectionMatrix * viewMatrix * world; }`;
const CLOUD_FS = `
uniform sampler2D uNoise; uniform vec4 uCloud; uniform vec3 uSunTo; varying vec3 vWorld;
void main(){
  vec2 p = mod(vWorld.xz, 16384.0) + vec2(uCloud.x * 18.0, uCloud.x * 7.0) + uCloud.z * 3111.0;
  vec2 warp = (texture2D(uNoise, p / 16384.0 + 0.13).ba - 0.5) * 2600.0;
  float n = texture2D(uNoise, (p + warp) / 16384.0).r * 0.5 + texture2D(uNoise, (p - warp * 0.5) / 4096.0 + 0.37).g * 0.32 + texture2D(uNoise, p / 1024.0 - uCloud.x * 0.004).b * 0.18;
  // 最底下一层（uCloud.w = 1）是铺满的云底：把云层以下的山谷整个盖住，上面两层再叠出起伏
  // 上面两层只留零星几朵（用户：屏幕上的云太多、看不清）：阈值抬高，成片的云变成疏疏的几团
  float a = (uCloud.w > 0.5 ? 1.0 : smoothstep(0.5, 0.74, n)) * uCloud.y;
  if (a < 0.01) discard;
  // 厚的地方更白，薄的边缘偏灰蓝
  vec3 c = mix(vec3(0.74, 0.79, 0.85), vec3(0.98, 0.98, 0.97), smoothstep(0.4, 0.78, n)) * (0.82 + 0.18 * uSunTo.y);
  if (uCloud.w > 0.5) c = mix(vec3(0.66, 0.72, 0.80), vec3(0.86, 0.89, 0.92), smoothstep(0.3, 0.7, n)) * (0.82 + 0.18 * uSunTo.y);
  gl_FragColor = vec4(c * a, a);
}`;
// 投影用的立板：面朝太阳方位摆（uRight 换成与光线垂直的水平方向），按真实高度（不做 2D 比例补偿），只写深度
const SHADOW_BB_FS = `
uniform sampler2D uMap; uniform sampler2D uStatic; uniform sampler2D uScenery; varying vec2 vUv; varying float vA; varying float vStatic;
void main(){ vec4 c = vStatic > 2.5 ? texture2D(uScenery, vUv) : vStatic > 0.5 ? texture2D(uStatic, vUv) : texture2D(uMap, vUv); if (c.a * vA < 0.45) discard; gl_FragColor = vec4(1.0); }`;
// r7-fx3d：大招砸出的坑（地面真的往下陷、坑沿翻起）和往外推的地浪——剖面和 world/fx3d.ts 的 dentProfile / rippleAt 一模一样
// （立板、特效按 CPU 那一份取高，人站在坑里不浮空）。uDent0 / uDent1 = (中心 x, 中心 z, 半径, 深度)，uRip = (中心 x, 中心 z, 波前半径, 幅度)，uRipR = 推多远。
// 都是 0 时整段跳过；坡面的明暗按坑的斜率另算（网格的法线是烘好的，不跟着陷），交给片元乘上 vDent。
const DENT_GLSL = `
uniform vec4 uDent0; uniform vec4 uDent1; uniform vec4 uRip; uniform float uRipR; uniform vec3 uSunTo;
float dentOne(vec2 p, vec4 d){ if (d.w <= 0.0) return 0.0; float q = length(p - d.xy) / d.z; if (q > 1.7) return 0.0; float b = q < 1.0 ? (1.0 - q * q) * (1.0 - q * q) : 0.0; float u = (q - 1.08) / 0.24; return (b - exp(-u * u) * 0.22) * d.w; }
float ripOne(vec2 p){ if (uRip.w <= 0.0) return 0.0; float L = length(p - uRip.xy), u = (L - uRip.z) / 260.0; if (abs(u) > 2.2 || L > uRipR) return 0.0; return -sin(u * 3.14159265) * exp(-u * u) * uRip.w * (1.0 - L / uRipR); }
float dentH(vec2 p){ return dentOne(p, uDent0) + dentOne(p, uDent1) + ripOne(p); }
/** 往下陷多少；shade 是坑坡的明暗（没有坑时 1） */
float dentAt(vec2 p, out float shade){
  shade = 1.0;
  if (uDent0.w + uDent1.w + uRip.w <= 0.0) return 0.0;
  float h = dentH(p);
  float gx = (dentH(p + vec2(12.0, 0.0)) - dentH(p - vec2(12.0, 0.0))) / 24.0, gz = (dentH(p + vec2(0.0, 12.0)) - dentH(p - vec2(0.0, 12.0))) / 24.0;
  vec3 n = normalize(vec3(gx, 1.0, gz));
  shade = clamp(dot(n, uSunTo) / max(uSunTo.y, 0.25), 0.42, 1.45);
  return h;
}`;
// 地形块：贴图 × 顶点明暗 × 阴影
const TERRAIN_VS = `
uniform mat4 uShadowMatrix; uniform vec4 uSnowHole; uniform vec4 uNotch; varying vec2 vUv; varying vec3 vNormal; varying vec3 vShadow; varying vec3 vRock; varying float vAltitude; varying float vDent;
${DENT_GLSL}
void main(){
  vUv = uv; vNormal = normal;
  vec4 world = modelMatrix * vec4(position, 1.0);
  world.y -= uNotch.w * (1.0 - smoothstep(uNotch.z * 0.45, uNotch.z, length(world.xz - uNotch.xy)));   // 撼山客「无极一击」：远山缺一块（uNotch = 中心 x, 中心 z, 半径, 挖多深）
  world.y -= dentAt(world.xz, vDent);   // r7-fx3d：大招砸出的坑、地浪
  // 宗门山体里不积雪：uSnowHole = (中心 x, 中心 z, 半径, 雪线抬高多少)，只在这一圈里把海拔当作低一截（按位置，别处的雪峰照旧）
  float hole = uSnowHole.w * (1.0 - smoothstep(uSnowHole.z, uSnowHole.z * 1.35, length(world.xz - uSnowHole.xy)));
  vShadow = (uShadowMatrix * world).xyz * 0.5 + 0.5;
  // 岩石纹理用的坐标：世界坐标对 8192 取模（噪声按这个周期平铺），避免几十万的大数进片元着色器丢精度
  vRock = mod(world.xyz, 8192.0); vAltitude = world.y - hole;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
// 地形块：平地用原来的手绘地面；陡坡按坡度换成程序生成的岩壁（三向投影，不拉伸）；雪线以上积雪；
// 朝阳面亮、背阳面暗（平地恰好保持原亮度），再乘投影。uLight = (起伏明暗强度, 雪线海拔, 是否高山模式, 0)。
const TERRAIN_FS = `
uniform sampler2D uMap; uniform sampler2D uNoise; uniform vec3 uSunTo; uniform vec4 uLight;
varying vec2 vUv; varying vec3 vNormal; varying vec3 vShadow; varying vec3 vRock; varying float vAltitude; varying float vDent;
${SHADOW_FS}
// 三层噪声都从一张运行时生成的 256 像素随机图里取（双线性过滤后就是平滑噪声，带多级渐远，远处不闪）；
// 三层的铺设周期 8192 / 2048 / 512 都整除 8192，与 vRock 的取模周期对得上
float rockNoise(vec2 p){ return texture2D(uNoise, p / 8192.0).r * 0.5 + texture2D(uNoise, p / 2048.0).g * 0.33 + texture2D(uNoise, p / 512.0).b * 0.17; }
void main(){
  vec3 n = normalize(vNormal);
  vec4 texel = texture2D(uMap, vUv);
  if (texel.a < 0.5) discard;   // 贴图透明的地方没有地面（秘境里石台以外是虚空，看得见台下）
  vec3 base = texel.rgb;
  float slope = 1.0 - n.y;
  // 平缓又在雪线以下的地方就是手绘地面，直接跳过岩壁和积雪的计算
  if (uLight.z > 0.5 && (slope > 0.06 || vAltitude > uLight.y - 1100.0)) {
    // 顶面投影的权重压低一些：坡稍陡就让侧面投影接管，纹理不会顺着坡向被拉成细丝
    vec3 w = pow(abs(n), vec3(3.0)); w.y *= 0.45; w /= (w.x + w.y + w.z);
    float t = rockNoise(vRock.zy) * w.x + rockNoise(vRock.xz) * w.y + rockNoise(vRock.xy) * w.z;
    // 岩色：灰褐为主，带横向岩层和裂隙的明暗
    // 岩色：暗处是裂隙、亮处是受风化的岩面；横向岩层随高度起伏；缓一些的坡上带一点苔绿
    vec3 rock = mix(vec3(0.30, 0.29, 0.275), vec3(0.72, 0.69, 0.63), smoothstep(0.28, 0.74, t));
    float strata = sin(vRock.y * 0.028 + t * 7.0 + texture2D(uNoise, vRock.xz / 2048.0).a * 3.0);
    rock *= 0.86 + 0.14 * smoothstep(-0.2, 0.6, strata);
    rock = mix(rock, vec3(0.36, 0.43, 0.30) * (0.7 + 0.5 * t), smoothstep(0.34, 0.14, slope) * 0.45);
    float rockAmt = smoothstep(0.10, 0.27, slope + (t - 0.5) * 0.08);
    base = mix(base, rock, rockAmt);
    float snowEdge = vAltitude + (texture2D(uNoise, vRock.xz / 8192.0).a - 0.5) * 900.0;
    float snow = smoothstep(uLight.y - 260.0, uLight.y + 260.0, snowEdge) * smoothstep(0.62, 0.22, slope);
    base = mix(base, vec3(0.93, 0.95, 0.97) * (0.92 + 0.08 * t), snow);
  }
  float flat0 = max(uSunTo.y, 0.08);
  float relief = clamp(0.36 + 0.64 * max(dot(n, uSunTo), 0.0) / flat0, 0.34, 1.34);
  float lit = mix(1.0, relief, uLight.x);
  // 背阳的陡坡本来就暗，投影在那里减弱，免得黑成一片
  float sh = shadowAt(vShadow) * smoothstep(0.36, 0.66, relief);
  gl_FragColor = vec4(min(base * lit * shadowMul(sh) * vDent, vec3(1.0)), 1.0);   // P2：封顶 1——世界层是半浮点，超过 1 的那一截会被后期当成自发光；vDent：坑坡的明暗
}`;

const DECAL_VS = `
uniform vec2 uOrigin; uniform vec2 uScale; uniform vec2 uBackdropOrigin; uniform mat4 uShadowMatrix; uniform vec4 uNotch;
varying vec2 vDecal; varying highp vec2 vBackdrop; varying vec3 vShadow; varying float vDent;
${DENT_GLSL}
void main(){
  vec4 world = modelMatrix * vec4(position, 1.0);
  float notch = uNotch.w * (1.0 - smoothstep(uNotch.z * 0.45, uNotch.z, length(world.xz - uNotch.xy)));   // 撼山客「无极一击」：远山缺一块（和地形一起往下挖）
  notch += dentAt(world.xz, vDent);   // r7-fx3d：大招砸出的坑、地浪（贴地层跟着一起陷）
  world.y -= notch;
  vShadow = (uShadowMatrix * world).xyz * 0.5 + 0.5;
  vDecal = (world.xz - uOrigin) * uScale;
  vBackdrop = world.xz - uBackdropOrigin;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.x, position.y - notch, position.z, 1.0);
}`;
const DECAL_FS = `
uniform sampler2D uMap; uniform float uFraction;
uniform sampler2D uBackdrop; uniform sampler2D uCloud; uniform float uBackdropOn; uniform float uCloudOn;
uniform vec2 uBackdropSize; uniform vec2 uCloudSize; uniform vec2 uCloudPhase;
varying vec2 vDecal; varying highp vec2 vBackdrop; varying vec3 vShadow; varying float vDent;
${SHADOW_FS}
void main(){
  if (vDecal.x < 0.0 || vDecal.y < 0.0 || vDecal.x > 1.0 || vDecal.y > 1.0) discard;
  vec4 c = texture2D(uMap, vec2(vDecal.x, 1.0 - vDecal.y * uFraction));
  c.rgb *= shadowMul(shadowAt(vShadow)) * vDent;
  if (uBackdropOn > 0.5) {
    vec3 base = vec3(201.0, 205.0, 200.0) / 255.0;
    if (uCloudOn > 0.5) {
      vec2 uv = vBackdrop / uCloudSize + uCloudPhase;
      vec4 cloud = texture2D(uCloud, vec2(uv.x, 1.0 - uv.y));
      base = mix(base, cloud.rgb, cloud.a);
    }
    vec2 uv = vBackdrop / uBackdropSize;
    if (uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0) {
      vec4 platform = texture2D(uBackdrop, vec2(uv.x, 1.0 - uv.y));
      base = mix(base, platform.rgb, platform.a);
    }
    gl_FragColor = vec4(mix(base, c.rgb, c.a), 1.0);
  } else gl_FragColor = vec4(c.rgb * c.a, c.a);
}`;

export interface GroundBackdrop {
  canvas: HTMLCanvasElement; version: number; left: number; top: number; width: number; height: number;
  cloud: HTMLImageElement | null; cloudWidth: number; cloudHeight: number; cloudX: number; cloudY: number;
}

type GroundChunk = { mesh: Mesh; tex: CanvasTexture; canvas: HTMLCanvasElement; used: number };

/** 地形与贴地层共用每块的三角网格和高度，贴图只上传一次。 */
/** 阴影参数：各材质引用同一组对象，每帧改一次全部生效 */
export type ShadowUniforms = { uShadowMap: { value: Texture | null }; uShadowMatrix: { value: Matrix4 }; uShadowParams: { value: Vector4 }; uShadowTint: { value: Color };
  /** 指向光源的方向；uLight = (起伏明暗强度, 雪线海拔, 是否高山模式, 0) */
  uSunTo: { value: Vector3 }; uLight: { value: Vector4 }; uNoise: { value: Texture };
  /** 宗门山体里抬高雪线：(中心 x, 中心 z, 半径, 抬高多少)，见 sectFx.ts */
  uSnowHole: { value: Vector4 };
  /** 撼山客「无极一击」：远山缺一块——(中心 x, 中心 z, 半径, 挖多深)，深度 0 时不挖（world/hsmoves3.ts） */
  uNotch: { value: Vector4 };
  /** r7-fx3d：大招砸出的坑、地浪（见 DENT_GLSL；world/fx3d.ts） */
  uDent0: { value: Vector4 }; uDent1: { value: Vector4 }; uRip: { value: Vector4 }; uRipR: { value: number } };
export function makeShadowUniforms(): ShadowUniforms {
  return { uShadowMap: { value: null }, uShadowMatrix: { value: new Matrix4() }, uShadowParams: { value: new Vector4(0, 0, 0, 0) }, uShadowTint: { value: new Color(0.62, 0.66, 0.8) },
    uSunTo: { value: new Vector3(0.3, 0.8, -0.5).normalize() }, uLight: { value: new Vector4(0, 4300, MOUNTAINS ? 1 : 0, 0) }, uSnowHole: { value: new Vector4(0, 0, 1, 0) }, uNotch: { value: new Vector4(0, 0, 1, 0) }, uNoise: { value: noiseTexture() },
    uDent0: { value: new Vector4(0, 0, 1, 0) }, uDent1: { value: new Vector4(0, 0, 1, 0) }, uRip: { value: new Vector4(0, 0, 0, 0) }, uRipR: { value: 1 } };
}
let sharedNoise: DataTexture | null = null;
/** 甬道里游离的咒文：几十个发光的字绕着甬道中轴盘旋 */
const MOTE_COUNT = 22;
/**
 * 咒文字图：8×8 共 64 个篆体笔意的符文，白线带一圈柔光，现场画出来（不加图片、不带字库）。
 * 画法取篆书的特点：线条等粗、转折圆、左右对称、字形偏长；每个字由两三层部件上下叠成
 * （横、圆角框、杯、拱、枝、根、云纹对卷、三竖、日、曲、双环……），再随机穿一道中竖——像道符上的云篆，不求能认。
 * 甬道壁上一圈圈流转的咒文、甬道里游离的字，都从这张图里取，再染成符光的颜色。
 */
export function glyphAtlas(): HTMLCanvasElement {
  const cell = 128, c = document.createElement('canvas'); c.width = c.height = cell * 8;
  const x = c.getContext('2d')!, TAU = Math.PI * 2;
  let seed = 0x51ed270b;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const line = (p: Path2D, x1: number, y1: number, x2: number, y2: number) => { p.moveTo(x1, y1); p.lineTo(x2, y2); };
  const dot = (p: Path2D, cx: number, cy: number) => { p.moveTo(cx + 0.06, cy); p.arc(cx, cy, 0.06, 0, TAU); };
  // 部件都画在 x ∈ [-1, 1]、y ∈ [y, y + h] 的一层里
  const parts: ((p: Path2D, y: number, h: number) => void)[] = [
    (p, y, h) => { const m = y + h * 0.55; line(p, -0.9, m, 0.9, m); if (rnd() < 0.55) line(p, -0.55, m - h * 0.34, 0.55, m - h * 0.34); },
    (p, y, h) => {
      const w = 0.5 + rnd() * 0.32, top = y + h * 0.12, hh = h * 0.76; p.roundRect(-w, top, w * 2, hh, Math.min(w, hh / 2) * 0.72);
      const k = rnd(), m = top + hh / 2;
      if (k < 0.3) line(p, -w, m, w, m); else if (k < 0.55) { line(p, -w, m, w, m); line(p, 0, top, 0, top + hh); } else if (k < 0.8) dot(p, 0, m);
    },
    (p, y, h) => { p.moveTo(-0.85, y + h * 0.1); p.bezierCurveTo(-0.85, y + h * 1.05, 0.85, y + h * 1.05, 0.85, y + h * 0.1); if (rnd() < 0.4) dot(p, 0, y + h * 0.35); },
    (p, y, h) => { p.moveTo(-0.85, y + h * 0.92); p.bezierCurveTo(-0.85, y - h * 0.08, 0.85, y - h * 0.08, 0.85, y + h * 0.92); if (rnd() < 0.5) line(p, 0, y + h * 0.36, 0, y + h * 0.92); },
    (p, y, h) => { p.moveTo(-0.8, y + h * 0.1); p.quadraticCurveTo(-0.8, y + h * 0.88, 0, y + h * 0.88); p.quadraticCurveTo(0.8, y + h * 0.88, 0.8, y + h * 0.1); line(p, 0, y + h * 0.04, 0, y + h * 0.96); },
    (p, y, h) => { p.moveTo(-0.85, y + h * 0.95); p.quadraticCurveTo(-0.72, y + h * 0.14, 0, y + h * 0.1); p.quadraticCurveTo(0.72, y + h * 0.14, 0.85, y + h * 0.95); },
    (p, y, h) => {
      const m = y + h * 0.5, r = Math.min(0.42, h * 0.42);
      for (const d of [-1, 1]) {
        p.moveTo(0, m + r); p.bezierCurveTo(d * 0.25, m + r, d * 0.92, m + r * 1.1, d * 0.92, m);
        p.bezierCurveTo(d * 0.92, m - r * 1.25, d * 0.28, m - r * 1.15, d * 0.3, m - r * 0.1);
        p.bezierCurveTo(d * 0.32, m + r * 0.45, d * 0.64, m + r * 0.35, d * 0.62, m - r * 0.15);
      }
    },
    (p, y, h) => { for (const d of [-0.75, 0, 0.75]) line(p, d, y + (d ? h * 0.32 : h * 0.08), d, y + h * 0.9); if (rnd() < 0.55) line(p, -0.75, y + h * 0.9, 0.75, y + h * 0.9); },
    (p, y, h) => { const r = Math.min(0.62, h * 0.42), m = y + h * 0.5; p.moveTo(r, m); p.ellipse(0, m, r, r, 0, 0, TAU); if (rnd() < 0.5) line(p, -r * 0.45, m, r * 0.45, m); else dot(p, 0, m); },
    (p, y, h) => { p.moveTo(0.5, y + h * 0.08); p.bezierCurveTo(-1.05, y + h * 0.3, 1.05, y + h * 0.7, -0.5, y + h * 0.92); dot(p, -0.72, y + h * 0.28); dot(p, 0.72, y + h * 0.72); },
    (p, y, h) => { const r = h * 0.21; for (const k of [0.27, 0.73]) { p.moveTo(r * 1.35, y + h * k); p.ellipse(0, y + h * k, r * 1.35, r, 0, 0, TAU); } },
    (p, y, h) => { for (const d of [-1, 1]) { p.moveTo(d * 0.9, y + h * 0.12); p.quadraticCurveTo(d * 0.9, y + h * 0.9, d * 0.18, y + h * 0.9); } line(p, -0.5, y + h * 0.38, 0.5, y + h * 0.38); },
  ];
  x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
  x.lineCap = x.lineJoin = 'round'; x.strokeStyle = '#fff';
  for (let i = 0; i < 64; i++) {
    const ox = (i % 8) * cell, oy = Math.floor(i / 8) * cell, path = new Path2D();
    const tiers = rnd() < 0.62 ? 3 : 2, weight: number[] = [];
    let total = 0, last = -1;
    for (let k = 0; k < tiers; k++) { weight.push(0.75 + rnd() * 0.6); total += weight[k]; }
    let y = -1.75;
    for (let k = 0; k < tiers; k++) {
      let pick = Math.floor(rnd() * parts.length); if (pick === last) pick = (pick + 1 + Math.floor(rnd() * (parts.length - 1))) % parts.length;
      last = pick;
      const h = 3.5 * weight[k] / total; parts[pick](path, y, h); y += h;
    }
    if (rnd() < 0.22) line(path, 0, -1.75, 0, 1.75);
    x.save(); x.beginPath(); x.rect(ox + 2, oy + 2, cell - 4, cell - 4); x.clip();   // 柔光不串到邻格
    x.translate(ox + cell / 2, oy + cell / 2); x.scale(29, 29); x.lineWidth = 0.2;
    x.shadowColor = '#fff'; x.shadowBlur = 16; x.globalAlpha = 0.55; x.stroke(path);
    x.shadowBlur = 4; x.globalAlpha = 1; x.stroke(path);
    x.restore();
  }
  return c;
}
/** 岩壁和雪线用的随机图：256×256，四个通道各一份随机数，运行时生成（不占包体），可平铺 */
function noiseTexture(): DataTexture {
  if (sharedNoise) return sharedNoise;
  const size = 256, data = new Uint8Array(size * size * 4);
  let seed = 0x9e3779b9;
  for (let i = 0; i < data.length; i++) { seed = Math.imul(seed ^ (seed >>> 15), 2246822519) + 0x6d2b79f5 | 0; data[i] = (seed ^ (seed >>> 13)) & 255; }
  const tex = new DataTexture(data, size, size, RGBAFormat);
  tex.wrapS = tex.wrapT = RepeatWrapping; tex.magFilter = LinearFilter; tex.minFilter = LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.needsUpdate = true;
  return sharedNoise = tex;
}
/** 阴影图边长；localStorage taixu.shadows=0 关闭投影；画质降档时自动缩小 */
const SHADOW_SIZE_DEFAULT = 2048;
const SHADOWS_ON = (() => { try { return typeof localStorage === 'undefined' || localStorage.getItem('taixu.shadows') !== '0'; } catch { return true; } })();

export class HdGround {
  private chunks = new Map<string, GroundChunk>();
  private readonly decalMat: ShaderMaterial;
  private backdropTexture: CanvasTexture | null = null;
  private backdropCanvas: HTMLCanvasElement | null = null;
  private backdropVersion = -1;
  private cloudTexture: Texture | null = null;
  private cloudImage: HTMLImageElement | null = null;
  private frame = 0;

  constructor(private readonly scene: Scene, private readonly heightAt: (x: number, y: number) => number,
    texture: CanvasTexture, private readonly decalW: number, private readonly decalH: number, textureH: number,
    private readonly shadow: ShadowUniforms = makeShadowUniforms()) {
    this.decalMat = new ShaderMaterial({ vertexShader: DECAL_VS, fragmentShader: DECAL_FS,
      transparent: true, premultipliedAlpha: true, depthWrite: false, depthTest: true,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { uMap: { value: texture }, uOrigin: { value: new Vector2() }, uScale: { value: new Vector2() }, uFraction: { value: decalH / textureH },
        uBackdrop: { value: null }, uBackdropOn: { value: 0 }, uBackdropOrigin: { value: new Vector2() }, uBackdropSize: { value: new Vector2(1, 1) },
        uCloud: { value: null }, uCloudOn: { value: 0 }, uCloudSize: { value: new Vector2(1, 1) }, uCloudPhase: { value: new Vector2() }, ...shadow } });
  }

  begin(l: number, t: number, s: number): void {
    this.frame++;
    (this.decalMat.uniforms.uOrigin.value as Vector2).set(l, t);
    (this.decalMat.uniforms.uScale.value as Vector2).set(s / this.decalW, s / this.decalH);
  }

  setBackdrop(backdrop: GroundBackdrop | null): void {
    const u = this.decalMat.uniforms;
    if (!backdrop) {
      this.backdropTexture?.dispose(); this.cloudTexture?.dispose();
      this.backdropTexture = null; this.backdropCanvas = null; this.backdropVersion = -1;
      this.cloudTexture = null; this.cloudImage = null;
      u.uBackdrop.value = null; u.uCloud.value = null; u.uBackdropOn.value = 0; u.uCloudOn.value = 0;
      return;
    }
    if (this.backdropCanvas !== backdrop.canvas || this.backdropVersion !== backdrop.version) {
      this.backdropTexture?.dispose();
      this.backdropTexture = new CanvasTexture(backdrop.canvas);
      this.backdropTexture.minFilter = LinearFilter; this.backdropTexture.generateMipmaps = false;
      this.backdropCanvas = backdrop.canvas; this.backdropVersion = backdrop.version;
      u.uBackdrop.value = this.backdropTexture;
    }
    if (this.cloudImage !== backdrop.cloud) {
      this.cloudTexture?.dispose(); this.cloudImage = backdrop.cloud;
      this.cloudTexture = backdrop.cloud ? new Texture(backdrop.cloud) : null;
      if (this.cloudTexture) {
        this.cloudTexture.wrapS = this.cloudTexture.wrapT = RepeatWrapping;
        this.cloudTexture.minFilter = LinearFilter; this.cloudTexture.generateMipmaps = false; this.cloudTexture.needsUpdate = true;
      }
      u.uCloud.value = this.cloudTexture;
    }
    (u.uBackdropOrigin.value as Vector2).set(backdrop.left, backdrop.top);
    (u.uBackdropSize.value as Vector2).set(backdrop.width, backdrop.height);
    (u.uCloudSize.value as Vector2).set(backdrop.cloudWidth, backdrop.cloudHeight);
    (u.uCloudPhase.value as Vector2).set((backdrop.left - backdrop.cloudX) / backdrop.cloudWidth % 1, (backdrop.top - backdrop.cloudY) / backdrop.cloudHeight % 1);
    u.uBackdropOn.value = 1; u.uCloudOn.value = this.cloudTexture ? 1 : 0;
  }

  sync(chunks: { cx: number; cy: number; canvas: HTMLCanvasElement }[], size: number): void {
    // 新地块的网格分帧建：一帧最多几块，镜头拉远一下子露出上百块时不会卡成一长帧（晚到的几块下一帧补上）
    let budget = MOUNTAINS ? 6 : 1e9;
    for (const ch of chunks) {
      const k = ch.cx + ',' + ch.cy;
      let e = this.chunks.get(k);
      if (!e && budget-- <= 0) continue;
      if (e && e.canvas !== ch.canvas) {
        // 预览画布换成正式画布：高度没变，只换贴图，网格、法线、材质都留着
        e.tex.dispose();
        const tex = new CanvasTexture(ch.canvas); tex.anisotropy = 4;
        (e.mesh.material as ShaderMaterial).uniforms.uMap.value = tex; e.tex = tex; e.canvas = ch.canvas;
        if (prof.on) prof.num('N·上传字节', ch.canvas.width * ch.canvas.height * 4);
      } else if (!e) {
        const pre = this.pre.get(ch.canvas); if (pre) this.pre.delete(ch.canvas);   // 第五轮返工：进秘境之前已上传好的贴图
        const tex = pre ?? new CanvasTexture(ch.canvas); tex.anisotropy = 4;
        if (prof.on) { prof.num('N·上传字节', ch.canvas.width * ch.canvas.height * 4); prof.num('N·地块网格构建', 1); }
        const divisions = Math.ceil(size / 64);
        // 邻块共用边界顶点；避免重叠的半透明地贴在接缝处叠画。
        const geo = new PlaneGeometry(size, size, divisions, divisions); geo.rotateX(-Math.PI / 2);
        const positions = geo.getAttribute('position');
        for (let i = 0; i < positions.count; i++) positions.setY(i, this.heightAt(ch.cx * size + size / 2 + positions.getX(i), ch.cy * size + size / 2 + positions.getZ(i)));
        // 法线直接由高度差分算（跨块取邻点），块与块之间明暗连续，不再各算各的出接缝
        const normals = geo.getAttribute('normal'), step = size / divisions, ox = ch.cx * size + size / 2, oz = ch.cy * size + size / 2;
        for (let i = 0; i < positions.count; i++) {
          const wx = ox + positions.getX(i), wz = oz + positions.getZ(i);
          const dx = this.heightAt(wx + step, wz) - this.heightAt(wx - step, wz), dz = this.heightAt(wx, wz + step) - this.heightAt(wx, wz - step);
          const inv = 1 / Math.hypot(dx, 2 * step, dz);
          normals.setXYZ(i, -dx * inv, 2 * step * inv, -dz * inv);
        }
        geo.computeBoundingSphere();
        // 每块一份材质（各自的贴图），着色器程序和阴影参数全图共用
        const mesh = new Mesh(geo, new ShaderMaterial({ vertexShader: TERRAIN_VS, fragmentShader: TERRAIN_FS,
          uniforms: { uMap: { value: tex }, ...this.shadow } }));
        mesh.position.set(ch.cx * size + size / 2, 0, ch.cy * size + size / 2); mesh.renderOrder = 0;
        // 地贴放在第 1 图层：主相机两层都看，阴影相机只看第 0 层（地形投影时不必把同一份网格画两遍）
        const decal = new Mesh(geo, this.decalMat); decal.renderOrder = 1; decal.layers.set(1);
        mesh.add(decal);
        this.scene.add(mesh);
        e = { mesh, tex, canvas: ch.canvas, used: this.frame }; this.chunks.set(k, e);
      }
      e.used = this.frame;
    }
    if (this.chunks.size > (MOUNTAINS ? 300 : 80)) for (const [k, e] of this.chunks) if (this.frame - e.used > 120) { this.release(e); this.chunks.delete(k); }
    for (const e of this.chunks.values()) e.mesh.visible = e.used === this.frame;
  }

  /** 换到相邻的图（两边地面相同，只差平移）：网格连同贴图原样留用，挪到新位置、改行号 */
  shiftRows(cols: number, rows: number, size: number): void {
    const moved = new Map<string, GroundChunk>();
    for (const [key, e] of this.chunks) {
      const [cx, cy] = key.split(',').map(Number);
      e.mesh.position.x += cols * size; e.mesh.position.z += rows * size; e.mesh.updateMatrixWorld(true);
      moved.set((cx + cols) + ',' + (cy + rows), e);
    }
    this.chunks = moved;
  }
  clear(): void {
    for (const e of this.chunks.values()) this.release(e);
    this.chunks.clear();
  }
  /** 第五轮返工：先把一张地块画布传上显卡（进秘境之前，人走向门的那几帧里一帧传一两张）；sync 建这一块时直接接过去 */
  private pre = new Map<HTMLCanvasElement, CanvasTexture>();
  preload(canvas: HTMLCanvasElement, gl: WebGLRenderer): void {
    if (this.pre.has(canvas)) return;
    const tex = new CanvasTexture(canvas); tex.anisotropy = 4; gl.initTexture(tex); this.pre.set(canvas, tex);
  }
  /** 备好的贴图不要了（换了要进的秘境、或没进去就走开） */
  dropPreload(): void { for (const t of this.pre.values()) t.dispose(); this.pre.clear(); }
  /**
   * 收官返工：地块网格的着色器（地块本身、叠在上面的地贴）先编好。界外用的是 GPU 地表，这两个着色器只有秘境、画中洞天
   * 这类 Canvas 地块的地方才用——原来到换场那一帧头一回画地块时才编，等着色器链接卡了 150 毫秒上下（R·HD地表提交）。
   * 进秘境之前（人走向门的那几帧里）拿一块一格的小网格编一遍，换场那一帧就不用再等。
   */
  warm(gl: WebGLRenderer, cam: OrthographicCamera | PerspectiveCamera): void {
    if (this.warmMat) return;
    const geo = new PlaneGeometry(1, 1, 1, 1); geo.rotateX(-Math.PI / 2);
    // 这份材质一直留着：three 的着色器程序按使用者计数，材质一释放、没有别的使用者时程序也跟着删了
    const mat = this.warmMat = new ShaderMaterial({ vertexShader: TERRAIN_VS, fragmentShader: TERRAIN_FS, uniforms: { uMap: { value: null }, ...this.shadow } });
    const mesh = this.warmGeo = new Mesh(geo, mat), decal = new Mesh(geo, this.decalMat); decal.layers.set(1); mesh.add(decal);
    mesh.frustumCulled = false; decal.frustumCulled = false;
    const tmp = new Scene(); tmp.add(mesh);
    gl.compile(tmp, cam, this.scene);
    tmp.remove(mesh);
  }
  /** warm 用的那一小块网格（HdScene.warmDraw 拿它实际画一遍） */
  warmMesh(): Mesh | null { return this.warmGeo; }
  private warmMat: ShaderMaterial | null = null; private warmGeo: Mesh | null = null;

  dispose(): void { this.clear(); this.setBackdrop(null); this.decalMat.dispose(); this.warmMat?.dispose(); this.warmGeo?.geometry.dispose(); }

  private release(e: GroundChunk): void {
    this.scene.remove(e.mesh);
    e.tex.dispose(); e.mesh.geometry.dispose(); (e.mesh.material as ShaderMaterial).dispose();
  }
}

export class HdScene {
  readonly canvas: HTMLCanvasElement;
  readonly gl: SharedRenderer;
  readonly scene = new Scene();
  private readonly groundScene = new Scene();
  readonly buildings = new HdBuildings();
  private target = new WebGLRenderTarget(1, 1, { depthBuffer: true });
  private pixelW = 1; private pixelH = 1;
  readonly cam: OrthographicCamera | PerspectiveCamera = HD_PERSPECTIVE ? new PerspectiveCamera(HD_FOV, 1, 10, 60000) : new OrthographicCamera(-1, 1, 1, -1, 1, 40000);
  /** P2：视图投影矩阵的单精度副本、投影矩阵的 [0][0] 与 [1][1]、镜头位置（three 坐标），交给后期的点光源和高度雾 */
  viewProj = new Float32Array(16); projScale: [number, number] = [1, 1]; eye: [number, number, number] = [0, 0, 0];
  /** 视图投影矩阵（列主序），每帧相机就位后更新；所有「世界 → 屏幕」都走它，正交、透视通用 */
  private vp!: Float64Array; private vpMatrix!: Matrix4;
  /** 是否透视相机、相机到焦点的距离 */
  persp = false; private camD = 20000;
  /** projectPoint 的结果：屏幕 x / y（CSS 像素）、NDC 深度、该点处 1 世界单位对应的像素数 */
  sx = 0; sy = 0; sd = 0; ss = 1;
  /** 屏幕右方在地面上的方向（单位向量），每帧更新 */
  rx = 1; ry = 0;
  private inverseMatrix = new Matrix4();
  readonly inverseViewProjection = new Float32Array(16);
  /** 相机方位角（弧度，0 = 正对北方）；俯角固定 */
  yaw = 0;
  /** 俯角（度）。平时是 HD_PITCH；高山模式下镜头到人物之间被山挡住时自动抬高，挡不住了再慢慢落回 */
  pitch = HD_PITCH;
  /** 相机到焦点的距离（世界单位） */
  get viewDistance() { return this.camD; }
  W = 1; H = 1; zoom = 1; tx = 0; ty = 0;
  /** 2D 绘制用的工作画布：上半是地贴，下半是立板图集 */
  readonly work: HTMLCanvasElement; readonly wctx: CanvasRenderingContext2D;
  private workTex: CanvasTexture;
  /** 立板区实际用到的底部 y（begin 时 = decalH，alloc 后可能更高） */
  private workUsedH = 0;
  /** 首帧需要整图上传以分配 GPU 存储 */
  private workTexFirst = true;
  readonly decalW = 2048; readonly decalH = 2048; atlasH = 2048;
  /** 地贴覆盖的世界矩形与比例（像素 / 世界单位） */
  decal = { l: 0, t: 0, s: 1, w: 1, h: 1 };
  private groundLayer: HdGround;
  private staticAtlas: HdStaticAtlas | null = null;
  /** 景物（树、草、城中小件）单独一张图集：种类多、尺寸杂，和人物的后台位图放一起会把人物挤出去 */
  private sceneryAtlas: HdStaticAtlas | null = null;
  private readonly restoreStaticAtlas = () => { this.staticAtlas?.invalidate(); this.sceneryAtlas?.invalidate(); this.workTexFirst = true; };
  private bb: InstancedMesh; private bbMat: ShaderMaterial;
  /** r11：叠加的光那一组立板（模组 blend: 'add'）：在普通立板之后画，深度只比不写 */
  private bbAdd: InstancedMesh | null = null;
  private addFoot: InstancedBufferAttribute | null = null; private addBox: InstancedBufferAttribute | null = null; private addUv: InstancedBufferAttribute | null = null; private addA: InstancedBufferAttribute | null = null;
  // 阴影：参数对象、阴影图、太阳方向的正交相机、投影用材质
  private readonly shadowU = makeShadowUniforms();
  private realmFx: HdRealm | null = null;
  private readonly sectFx: SectFx; private nightK = 0;
  /** P2：阵法 / 结界的光墙，渲染器每帧 sync */
  readonly zhenWalls: ZhenWalls;
  /** P3：贴合地形的瀑布（高山模式下替掉画好的崖壁瀑布立板）；渲染器收集景物时 add，render 时 sync */
  readonly terrainFalls: TerrainFalls;
  /** 秘境（石台群）的台底岩体、云海、界壁 */
  realm(): HdRealm { return this.realmFx ??= new HdRealm(this.scene, glyphAtlas(), this.shadowU.uNoise.value as Texture | null); }
  hideRealm(): void { if (this.realmFx) this.realmFx.group.visible = false; }
  private shadowTarget: WebGLRenderTarget | null = null;
  private readonly shadowCam = new OrthographicCamera(-1, 1, 1, -1, 1, 1000);
  private shadowBbMat: ShaderMaterial | null = null;
  private readonly shadowDepthMat = new MeshBasicMaterial({ colorWrite: false });
  /**
   * 返工：进屋时溶掉的屋顶和墙不该再投影（原来阴影那一遍用不带 discard 的覆盖材质，溶掉的屋顶照样在屋里投下大片影子、把人物立板压暗）。
   * 有屋子正在溶开时，阴影深度那一遍换成这份：和建筑同一套 roomOut()（同一组 roomFade 参数），溶掉的像素不写深度
   */
  private shadowRoomMat: ShaderMaterial | null = null;
  /** 高山模式下地形也投影（山影落进山谷）：带多边形偏移，减轻山体自身的条纹 */
  private readonly shadowTerrainMat = new MeshBasicMaterial({ colorWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: 2.5, polygonOffsetUnits: 6 });
  /** 光线方向（指向地面，three 坐标）与影子浓度；浓度为 0 时不做阴影那一遍 */
  private readonly sunDir = new Vector3(0.4, -0.8, 0.45).normalize(); private sunStrength = 0;
  private shadowRadius = 0;
  /** 画质太低时由渲染器关掉 */
  shadowsEnabled = true;
  /** 阴影图边长（画质降档时自动缩小：0档=2048, 1档=1024, 2档=512, 3档=512） */
  shadowSize = SHADOW_SIZE_DEFAULT;
  /** 云海（高山模式）：玩家登上云层以上才渐渐显出来，脚下的山谷被云盖住 */
  private clouds: { mesh: Mesh; mat: ShaderMaterial }[] = [];
  /** 计算可见范围时视线最低探到的海拔 */
  private boundsFloor = -64;
  /** 云层所在海拔 */
  static readonly CLOUD_Y = 3300;
  /** 每帧由渲染器调用：time 秒，altitude 是玩家所在处的海拔（地面高度加离地高度） */
  setClouds(time: number, altitude: number) {
    if (!MOUNTAINS) return;
    if (!this.clouds.length) {
      const geo = new PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
      for (let i = 0; i < 3; i++) {
        const mat = new ShaderMaterial({ vertexShader: CLOUD_VS, fragmentShader: CLOUD_FS, transparent: true, premultipliedAlpha: true, depthWrite: false, depthTest: true,
          uniforms: { uNoise: this.shadowU.uNoise, uSunTo: this.shadowU.uSunTo, uCloud: { value: new Vector4(0, 0, i, i === 0 ? 1 : 0) } } });
        const mesh = new Mesh(geo, mat); mesh.renderOrder = 3 + i; mesh.frustumCulled = false; mesh.scale.set(90000, 1, 90000);
        this.scene.add(mesh); this.clouds.push({ mesh, mat });
      }
    }
    // 玩家在云层以下时不画（镜头在高处俯视，画了会把人盖住）；越过云层后渐显
    // 占山的宗门上空把云海挖开：山体里的台地（有的在云层以下）不被云盖住
    const t = Math.max(0, Math.min(1, (altitude - (HdScene.CLOUD_Y - 150)) / 600)), fade = t * t * (3 - 2 * t) * (1 - this.sectFx.cloudFree(this.tx, this.ty));
    this.clouds.forEach(({ mesh, mat }, i) => {
      mesh.visible = fade > 0.01;
      mesh.position.set(this.tx, HdScene.CLOUD_Y - 260 + i * 200, this.ty);
      const u = mat.uniforms.uCloud.value as Vector4; u.x = time; u.y = fade * (i === 0 ? 1 : i === 1 ? 0.42 : 0.22);
      // 云底铺满后写入深度：远处的云按距离融进远山雾；渐显途中不写，免得把云下的东西一刀切掉
      if (i === 0) mat.depthWrite = fade > 0.98;
    });
    // 云底铺满以后，云层以下的地面看不见了：可见范围算到云底为止，不必再去加载山谷里的地块
    this.boundsFloor = fade > 0.98 ? HdScene.CLOUD_Y - 320 : -64;
  }
  private aFoot: InstancedBufferAttribute; private aBox: InstancedBufferAttribute; private aUv: InstancedBufferAttribute; private aA: InstancedBufferAttribute;
  /** 图集打包游标 */
  private px = 0; private py = 0; private rowH = 0;
  items: HdItem[] = [];

  /** meshHeightAt：地形网格用的高度（不含悬空的桥面、峰顶）；不给就和 heightAt 一样 */
  constructor(canvas: HTMLCanvasElement, context: WebGL2RenderingContext, readonly heightAt: (x: number, y: number) => number, meshHeightAt?: (x: number, y: number) => number) {
    this.canvas = canvas;
    this.gl = new WebGLRenderer({ canvas, context, premultipliedAlpha: true }) as SharedRenderer;
    canvas.addEventListener('webglcontextrestored', this.restoreStaticAtlas);
    // 画布上的像素已是最终颜色：贴图不做解码、输出不做转换，颜色与 2D 版一致
    this.gl.outputColorSpace = LinearSRGBColorSpace;
    this.gl.setClearColor(new Color().setRGB(0xe9 / 255, 0xdf / 255, 0xc6 / 255, LinearSRGBColorSpace));
    this.work = document.createElement('canvas');
    this.work.width = this.decalW; this.work.height = this.decalH + this.atlasH;
    this.wctx = this.work.getContext('2d', { alpha: true })!;
    this.workTex = new CanvasTexture(this.work);
    this.workTex.minFilter = LinearFilter; this.workTex.generateMipmaps = false;
    // 地贴和立板共享一次纹理上传，地贴从画布上半部分采样。
    this.groundLayer = new HdGround(this.groundScene, meshHeightAt ?? this.heightAt, this.workTex, this.decalW, this.decalH, this.work.height, this.shadowU);
    // 立板：一次实例化绘制
    const g = new PlaneGeometry(1, 1, 1, 2);   // 竖向三排顶点：中间一排钉在脚底线上（见顶点着色器）
    this.aFoot = new InstancedBufferAttribute(new Float32Array(MAX_BB * 3), 3);
    this.aBox = new InstancedBufferAttribute(new Float32Array(MAX_BB * 4), 4);
    this.aUv = new InstancedBufferAttribute(new Float32Array(MAX_BB * 4), 4);
    this.aA = new InstancedBufferAttribute(new Float32Array(MAX_BB * 3), 3);
    g.setAttribute('iFoot', this.aFoot); g.setAttribute('iBox', this.aBox); g.setAttribute('iUv', this.aUv); g.setAttribute('iA', this.aA);
    this.bbMat = new ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, premultipliedAlpha: true, depthTest: true, depthWrite: true, side: DoubleSide,
      uniforms: { uMap: { value: this.workTex }, uStatic: { value: this.workTex }, uScenery: { value: this.workTex }, uRight: { value: new Vector3(1, 0, 0) }, uBoost: { value: 1 }, uFold: { value: new Vector4(0, 0, 0, 0) }, ...this.shadowU } });
    this.bb = new InstancedMesh(g, this.bbMat, MAX_BB);
    this.bb.frustumCulled = false; this.bb.renderOrder = 2; this.bb.count = 0;
    this.scene.add(this.bb);
    // r11：叠加的光另起一组实例（同一套顶点着色器和参数；不写深度：一大片几乎看不见的光晕不该挡住后面画的立体特效）
    {
      const ga = new PlaneGeometry(1, 1, 1, 2);
      this.addFoot = new InstancedBufferAttribute(new Float32Array(MAX_BB * 3), 3);
      this.addBox = new InstancedBufferAttribute(new Float32Array(MAX_BB * 4), 4);
      this.addUv = new InstancedBufferAttribute(new Float32Array(MAX_BB * 4), 4);
      this.addA = new InstancedBufferAttribute(new Float32Array(MAX_BB * 3), 3);
      ga.setAttribute('iFoot', this.addFoot); ga.setAttribute('iBox', this.addBox); ga.setAttribute('iUv', this.addUv); ga.setAttribute('iA', this.addA);
      // 滤色（screen）：结果 = 光 + 底 ×（1 − 光），亮处不会冲过 1——直接相加在半浮点世界层里会超过 1，被后期泛光成一整片白（用户要画面清楚）
      const addMat = new ShaderMaterial({ vertexShader: VS, fragmentShader: FS_ADD, transparent: true, depthTest: true, depthWrite: false, side: DoubleSide,
        blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneMinusSrcColorFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor,
        uniforms: this.bbMat.uniforms });
      this.bbAdd = new InstancedMesh(ga, addMat, MAX_BB);
      this.bbAdd.frustumCulled = false; this.bbAdd.renderOrder = 3; this.bbAdd.count = 0;
      this.scene.add(this.bbAdd);
    }
    this.scene.add(this.buildings.group);
    this.buildings.setLighting(this.shadowU);
    this.scene.add(this.buildings.fx);
    // P10：占山宗门的瀑布、云雾（半透明、会动；挂在发光体那一组里，阴影那一遍一起藏起来）
    this.sectFx = new SectFx(this.shadowU.uNoise.value as Texture | null);
    this.buildings.fx.add(this.sectFx.group);
    this.buildings.glyphs = new CanvasTexture(glyphAtlas());
    // P2：阵法 / 结界的光墙（发光体那一组：不投影）
    this.zhenWalls = new ZhenWalls(this.buildings.glyphs);
    this.buildings.fx.add(this.zhenWalls.group);
    this.terrainFalls = new TerrainFalls(this.shadowU.uNoise.value as Texture | null);
    this.buildings.fx.add(this.terrainFalls.group);
    this.cam.layers.enable(1);
  }

  resize(W: number, H: number, dpr: number) {
    this.W = W; this.H = H;
    this.pixelW = Math.round(W * dpr); this.pixelH = Math.round(H * dpr);
    this.target.setSize(this.pixelW, this.pixelH);
  }

  /** 屏幕上方在地面上对应的方向（单位向量）、屏幕右方 */
  get upDir() { return { x: Math.sin(this.yaw), y: -Math.cos(this.yaw) }; }
  get rightDir() { return { x: Math.cos(this.yaw), y: Math.sin(this.yaw) }; }
  /** 立板高度补偿：正交倾斜相机下竖直长度显示为 cos(俯角)，拉回原 2D 比例 */
  get boost() { return 1 / Math.cos(this.pitch * Math.PI / 180); }
  /** 地面纵深压缩系数 */
  get foreshorten() { return Math.sin(this.pitch * Math.PI / 180); }

  /** 御剑巡航基准（绝对高度）与权重：每帧 begin 之前由 render.ts 填；权重 0 = 镜头照旧盯脚下地面 */
  cruiseBase = 0; cruiseW = 0;
  /** 每帧开头：相机就位，算地贴覆盖范围，清工作画布 */
  begin(tx: number, ty: number, zoom: number, dpr: number) {
    this.staticAtlas?.begin(); this.sceneryAtlas?.begin();
    this.tx = tx; this.ty = ty; this.zoom = zoom;
    // 俯角固定 45°，不改角度。遇到山时相机已随人物升高（ground 取 heightAt）。
    const P = this.pitch * Math.PI / 180, u = this.upDir;
    const c = this.cam;
    let D = 20000;
    if (c instanceof PerspectiveCamera) {
      // 相机距离由缩放决定：焦点处 1 世界单位 = zoom 个 CSS 像素，所以缩放的手感和正交时一样
      D = (this.H / 2 / zoom) / Math.tan(HD_FOV * Math.PI / 360);
      c.fov = HD_FOV; c.aspect = this.W / this.H; c.near = Math.max(4, D * 0.15); c.far = D * 5 + 6000 + (MOUNTAINS ? 16000 : 0);
    } else {
      c.left = -this.W / 2 / zoom; c.right = this.W / 2 / zoom; c.top = this.H / 2 / zoom; c.bottom = -this.H / 2 / zoom;
    }
    this.camD = D;
    // 御剑巡航：镜头注视高度向巡航基准靠（权重 cruiseW），不跟着脚下的丘陵沟壑上下颠（见 game.ts cruiseTick）
    const ground = this.cruiseW > 0 ? this.heightAt(tx, ty) + (this.cruiseBase - this.heightAt(tx, ty)) * this.cruiseW : this.heightAt(tx, ty);
    c.position.set(tx - u.x * Math.cos(P) * D, ground + Math.sin(P) * D, ty - u.y * Math.cos(P) * D);
    c.up.set(0, 1, 0); c.lookAt(tx, ground, ty);
    this.syncCamera();
    this.inverseMatrix.multiplyMatrices(c.matrixWorld, c.projectionMatrixInverse).toArray(this.inverseViewProjection);
    const r = this.rightDir;
    (this.bbMat.uniforms.uRight.value as Vector3).set(r.x, 0, r.y);
    // 朝镜头的地面方向 = 屏幕「向上」方向的反向；地面上铺开 g 在画面上占 g·sin(俯角)，所以铺开比例是 1 / sin(俯角)
    { const up = this.upDir, fold = 1 / Math.sin(this.pitch * Math.PI / 180); (this.bbMat.uniforms.uFold.value as Vector4).set(-up.x * fold, 0, -up.y * fold, 1.5); }
    this.bbMat.uniforms.uBoost.value = this.boost;
    this.computeAff();
    // 地贴：覆盖地面可见范围（四角反投影的外接矩形，再外扩），分辨率不超过工作画布
    this.gbValid = false;   // 每帧重算一次地面外接矩形（见 groundBounds 的缓存）
    const b = this.groundBounds(400);
    const s = Math.min(zoom * dpr, this.decalW / (b.r - b.l), this.decalH / (b.b - b.t));
    this.decal = { l: b.l, t: b.t, s, w: (b.r - b.l), h: (b.b - b.t) };
    this.groundLayer.begin(b.l, b.t, s);
    const g = this.wctx;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, this.work.width, this.work.height);
    this.px = 0; this.py = this.decalH; this.rowH = 0;
    this.items.length = 0;
  }

  /**
   * 地面 → 屏幕（CSS 像素）的仿射系数 [a, b, c, d, e, f]：sx = a·x + b·y + c，sy = d·x + e·y + f。
   * 只在正交相机下精确；透视相机下它是焦点附近的近似，留给方向换算和旧模组用。精确位置一律走 projectPoint。
   */
  aff = [1, 0, 0, 0, 1, 0];
  get affine(): readonly number[] { return this.aff; }
  get heightScale(): number { return this.foreshorten * this.zoom; }
  get heightBoost(): number { return this.boost; }
  depthAt(x: number, y: number, absoluteHeight: number): number { return this.projectDepth(x, y, absoluteHeight); }
  // clearPitch 已移除：俯角固定 45°，不再动态调整。相机高度随人物升高。
  /** 相机参数改动后调用：刷新矩阵、视图投影和屏幕右方向 */
  private syncCamera() {
    const c = this.cam;
    c.updateProjectionMatrix(); c.updateMatrixWorld();
    this.vpMatrix ??= new Matrix4(); this.vp ??= new Float64Array(16);
    this.vpMatrix.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse).toArray(this.vp);
    // P2：点光源、高度雾在后期里要用到（单精度一份，直接交给 GLStage）
    // ??=：测试里用 Object.create 拼的场景没跑字段初始化
    (this.viewProj ??= new Float32Array(16)).set(this.vp); const pe = c.projectionMatrix.elements; const ps = (this.projScale ??= [1, 1]); ps[0] = pe[0]; ps[1] = pe[5];
    const ey = (this.eye ??= [0, 0, 0]); ey[0] = c.position.x; ey[1] = c.position.y; ey[2] = c.position.z;
    this.persp = (c as PerspectiveCamera).isPerspectiveCamera === true;
    this.rx = Math.cos(this.yaw); this.ry = Math.sin(this.yaw);
  }
  /**
   * 世界点（x，绝对高度，y）→ 屏幕。结果写进 sx / sy / sd / ss，不分配对象（特效每帧要投几万个点）。
   * ss 是该点处的局部缩放：正交相机恒等于 zoom；透视相机近处大、远处小。
   */
  projectPoint(x: number, height: number, y: number): void {
    const m = this.vp;
    const cw = m[3] * x + m[7] * height + m[11] * y + m[15];
    if (!(cw > 1e-6)) { this.sx = this.sy = -1e6; this.sd = 2; this.ss = 0; return; }   // 在相机背后
    this.sx = ((m[0] * x + m[4] * height + m[8] * y + m[12]) / cw + 1) / 2 * this.W;
    this.sy = (1 - (m[1] * x + m[5] * height + m[9] * y + m[13]) / cw) / 2 * this.H;
    this.sd = (m[2] * x + m[6] * height + m[10] * y + m[14]) / cw;
    this.ss = this.persp ? this.zoom * this.camD / cw : this.zoom;
  }
  /** 地面点处的局部仿射 [a, b, c, d, e, f]（屏幕 = 仿射 · 世界），贴地的 2D 画法（阵法圈）用；按该点高度的水平面近似 */
  groundAffineAt(x: number, y: number): number[] {
    const h = this.heightAt(x, y), K = 200;
    this.projectPoint(x, h, y); const cx = this.sx, cy = this.sy;
    this.projectPoint(x + K, h, y); const a = (this.sx - cx) / K, d = (this.sy - cy) / K;
    this.projectPoint(x, h, y + K); const b = (this.sx - cx) / K, e = (this.sy - cy) / K;
    return [a, b, cx - a * x - b * y, d, e, cy - d * x - e * y];
  }
  private computeAff() {
    this.syncCamera();
    // 用大偏移求差分再缩回，避免世界坐标几十万时的浮点抵消
    const K = 1000, px = this.projectAbsolute(this.tx + K, this.ty, 0), py = this.projectAbsolute(this.tx, this.ty + K, 0), pc = this.projectAbsolute(this.tx, this.ty, 0);
    const a = (px.x - pc.x) / K, d = (px.y - pc.y) / K, b = (py.x - pc.x) / K, e = (py.y - pc.y) / K;
    this.aff = [a, b, pc.x - a * this.tx - b * this.ty, d, e, pc.y - d * this.tx - e * this.ty];
  }
  /** 屏幕（CSS 像素）→ 地面的逆仿射 [m00, m01, m10, m11, ox, oy]：w = M·s + o */
  inverse() {
    const [a, b, c, d, e, f] = this.aff, det = a * e - b * d;
    const m00 = e / det, m01 = -b / det, m10 = -d / det, m11 = a / det;
    return [m00, m01, m10, m11, -(m00 * c + m01 * f), -(m10 * c + m11 * f)];
  }
  /** 地面由 GPU 地表（GLStage 后期里采样）垫在底下时，three 画面背景透明；否则用纸色底 + Canvas 地形块 */
  setGpuGround(on: boolean) { this.gl.setClearAlpha(on ? 0 : 1); }
  /** 地面点 → 屏幕（CSS 像素）；s 是该点处的局部缩放（像素 / 世界单位） */
  ground(x: number, y: number) { this.projectPoint(x, this.heightAt(x, y), y); return { x: this.sx, y: this.sy, s: this.ss }; }
  /** 同 ground，但结果只留在 sx / sy / ss 上，不造对象（每帧几千个立板逐个投影时用） */
  groundAt(x: number, y: number): void { this.projectPoint(x, this.heightAt(x, y), y); }
  /** P10 收尾：立板项对象池——items 里第 i 项总是 itemPool[i]，每帧重填字段，不再每帧几千个新对象 */
  private itemPool: HdItem[] = [];
  private pushItem(x: number, y: number, l: number, r: number, t: number, b: number, u0: number, v0: number, u1: number, v1: number, a: number, air: boolean, seq: number, k: number, isStatic: boolean, bitmap?: boolean, scenery?: boolean, add?: boolean): void {
    const i = this.items.length, pool = (this.itemPool ??= []);   // ??=：测试里用 Object.create 拼的场景没跑字段初始化
    let it = pool[i];
    if (!it) it = pool[i] = { x, y, l, r, t, b, u0, v0, u1, v1, a, air, seq, k, static: isStatic };
    else { it.x = x; it.y = y; it.l = l; it.r = r; it.t = t; it.b = b; it.u0 = u0; it.v0 = v0; it.u1 = u1; it.v1 = v1; it.a = a; it.air = air; it.seq = seq; it.k = k; it.static = isStatic; }
    it.bitmap = bitmap; it.scenery = scenery; it.add = add;
    this.items.push(it);
  }

  /** 第五轮返工：离地 h 高的立板比贴地的大多少倍（透视镜头下高处离镜头近；手机横屏镜头拉得近，飞在两百高的海鸥要放大到近三倍） */
  altScale(x: number, y: number, h: number): number {
    const a = this.project(x, y, h), b = this.project(x, y, h + 40), c = this.project(x, y, 0), d = this.project(x, y, 40);
    const up = Math.hypot(b.x - a.x, b.y - a.y), lo = Math.hypot(d.x - c.x, d.y - c.y);
    return lo > 0.5 && up > 0.5 ? Math.max(1, Math.min(6, up / lo)) : 1;
  }
  /** 世界 → 屏幕（CSS 像素）。h = 离地高度（世界单位，2D 里的「向上」偏移量） */
  project(x: number, y: number, h = 0) {
    return this.projectAbsolute(x, y, this.heightAt(x, y) + h * this.boost);
  }
  private projected = new Vector3();
  projectDepth(x: number, y: number, absoluteHeight: number): number {
    this.projectPoint(x, absoluteHeight, y); return this.sd;
  }
  projectAbsolute(x: number, y: number, height: number) {
    this.projectPoint(x, height, y); return { x: this.sx, y: this.sy };
  }
  private ray = new Raycaster(); private ndc = new Vector2(); private hit = new Vector3();
  /** 屏幕（CSS 像素）→ 地面上的世界坐标 */
  unproject(sx: number, sy: number, floor = -64, maxDistance = Infinity) {
    this.ndc.set(sx / this.W * 2 - 1, 1 - sy / this.H * 2);
    this.ray.setFromCamera(this.ndc, this.cam);
    const ray = this.ray.ray;
    // 先沿视线一段段往前探，找到第一次落到地面以下的那一段，再在段内二分。
    // 只二分的话，视线先越过近处山脊、再落到远处山谷时会找错位置。
    let near = Math.max(0, (SURFACE_MAX_HEIGHT - ray.origin.y) / ray.direction.y);
    let far = (floor - ray.origin.y) / ray.direction.y;
    if (far > maxDistance) far = maxDistance;
    if (!(far > near)) far = near + 1;
    const steps = MOUNTAINS ? 56 : 8, span = (far - near) / steps;
    for (let i = 1; i <= steps; i++) {
      const distance = near + span * i;
      ray.at(distance, this.hit);
      if (this.hit.y <= this.heightAt(this.hit.x, this.hit.z)) { far = distance; near = distance - span; break; }
    }
    for (let i = 0; i < 20; i++) {
      const distance = (near + far) / 2;
      ray.at(distance, this.hit);
      if (this.hit.y > this.heightAt(this.hit.x, this.hit.z)) near = distance;
      else far = distance;
    }
    ray.at((near + far) / 2, this.hit);
    return { x: this.hit.x, y: this.hit.z };
  }
  /** 屏幕四角在地面上的外接矩形（世界坐标），向外扩 pad */
  groundBounds(pad = 0) {
    // 四角之外，沿上边和两侧再取几个点：有高山时视野落在地面上的形状不是规整的四边形
    const W = this.W, H = this.H;
    const floor = this.boundsFloor ?? -64;
    // 视距上限：站在高处能望出去很远，超过这个距离的地面不再加载，交给远山雾盖住（见后期里的 uHaze）
    const limit = MOUNTAINS && this.persp ? this.camD * HD_VIEW_LIMIT : Infinity;
    // 第五轮性能：一帧里要问五六次（begin、阴影、视野、战斗界面、特效贴地……），每次 16 条视线 × 七十多次取高——
    // 镜头没动就沿用上一次的结果（同样的相机矩阵、画布、云底，算出来一模一样）；每帧 begin 时清掉，地形高度有变也跟得上
    const key = (this.gbKey ??= new Float64Array(36)), me = this.cam.matrixWorld.elements, pe = this.cam.projectionMatrix.elements;
    let same = this.gbValid && key[0] === W && key[1] === H && key[2] === floor && key[3] === limit;
    for (let i = 0; same && i < 16; i++) same = key[4 + i] === me[i] && key[20 + i] === pe[i];
    if (!same) {
      key[0] = W; key[1] = H; key[2] = floor; key[3] = limit;
      for (let i = 0; i < 16; i++) { key[4 + i] = me[i]; key[20 + i] = pe[i]; }
      const pts = [this.unproject(0, 0, floor, limit), this.unproject(W, 0, floor, limit), this.unproject(0, H, floor, limit), this.unproject(W, H, floor, limit)];
      if (MOUNTAINS) {
        for (const f of [0.2, 0.4, 0.6, 0.8]) pts.push(this.unproject(W * f, 0, floor, limit), this.unproject(W * f, H, floor, limit));
        for (const f of [0.33, 0.66]) pts.push(this.unproject(0, H * f, floor, limit), this.unproject(W, H * f, floor, limit));
      }
      let l = 1e9, t = 1e9, r = -1e9, b = -1e9;
      for (const p of pts) { l = Math.min(l, p.x); r = Math.max(r, p.x); t = Math.min(t, p.y); b = Math.max(b, p.y); }
      const B = (this.gbRaw ??= new Float64Array(4)); B[0] = l; B[1] = t; B[2] = r; B[3] = b; this.gbValid = true;
    }
    const B = this.gbRaw!;
    return { l: B[0] - pad, t: B[1] - pad, r: B[2] + pad, b: B[3] + pad };
  }
  /** groundBounds 的缓存：相机矩阵、画布、云底、视距（key）与未外扩的外接矩形（gbRaw） */
  private gbKey?: Float64Array; private gbRaw?: Float64Array; private gbValid = false;   // ??=：测试里用 Object.create 拼的场景没跑字段初始化
  /** r12：给模组的立体画面入口（api.unsafe.scene3d()）：场景、相机、地面高度、高度系数、不投影的渲染层。同一个画面每次返回同一个对象 */
  private modViewObj?: { readonly scene: Scene; readonly camera: OrthographicCamera | PerspectiveCamera; heightAt(x: number, y: number): number; readonly boost: number; readonly noShadowLayer: number };
  modView() {
    if (!this.modViewObj) {
      const self = this;
      this.modViewObj = Object.freeze({
        scene: this.scene, camera: this.cam,
        heightAt: (x: number, y: number) => self.heightAt(x, y),
        get boost() { return self.boost; },
        noShadowLayer: 1,
      });
    }
    return this.modViewObj;
  }
  /** 2D 世界变换 → 地贴区域（Z, ox, oy，与 Renderer.world() 同形） */
  decalXf() { const d = this.decal; return { Z: d.s, ox: -d.l * d.s, oy: -d.t * d.s }; }

  /**
   * 为一个立板在图集里分一格。box 为相对脚底的世界范围（t 向上为负）；返回该格的 2D 变换（与 Renderer.world() 同形）与裁剪框，
   * 图集满了返回 null。
   */
  alloc(x: number, y: number, l: number, r: number, t: number, b: number, scale: number, air = false, alpha = 1, k = 1, seq = this.items.length, add = false): HdAllocCell | null {
    if (this.items.length >= MAX_BB) return null;
    const s = Math.min(scale, 2040 / Math.max(1, r - l), 1600 / Math.max(1, b - t));
    const cw = Math.ceil((r - l) * s) + 2, ch = Math.ceil((b - t) * s) + 2;
    if (cw > this.decalW) return null;
    if (this.px + cw > this.decalW) { this.px = 0; this.py += this.rowH; this.rowH = 0; }
    if (this.py + ch > this.work.height) return null;
    const cx = this.px + 1, cy = this.py + 1;
    this.px += cw; this.rowH = Math.max(this.rowH, ch);
    const H = this.work.height, Wd = this.decalW;
    this.pushItem(x, y, l, r, t, b, cx / Wd, 1 - cy / H, (cx + (r - l) * s) / Wd, 1 - (cy + (b - t) * s) / H, alpha, air, seq, k, false, undefined, undefined, add);
    return { Z: s, ox: cx - (x + l) * s, oy: cy - (y + t) * s, clip: [cx, cy, (r - l) * s, (b - t) * s] as const };
  }

  // 优化：复用排序数组，避免每帧 new + map 产生大量短命对象
  private _batchOrder: { request: HdAllocRequest; index: number; h: number }[] = [];
  /** 先按高度排格位，再由调用方按原顺序绘制；空间不足时统一降低分辨率重试。 */
  allocBatch(requests: readonly HdAllocRequest[]): (HdAllocCell | null)[] {
    const slots: (HdAllocCell | null)[] = Array(requests.length).fill(null);
    const start = { px: this.px, py: this.py, rowH: this.rowH, count: this.items.length };
    const capacity = Math.max(0, MAX_BB - start.count);
    // 优化：复用数组，避免每帧 map 创建新对象
    const order = this._batchOrder;
    if (order.length < requests.length) order.length = requests.length;
    for (let i = 0; i < requests.length; i++) {
      const r = requests[i];
      if (order[i]) { order[i].request = r; order[i].index = i; order[i].h = (r.b - r.t) * r.scale; }
      else order[i] = { request: r, index: i, h: (r.b - r.t) * r.scale };
    }
    order.length = requests.length;
    if (order.length > capacity) {
      // 优化：单次排序（合并优先级 + 高度），截断后不再二次排序
      order.sort((a, b) => b.request.priority - a.request.priority || b.h - a.h || a.request.seq - b.request.seq);
      order.length = capacity;
    } else {
      // 只需按高度排
      order.sort((a, b) => b.h - a.h);
    }
    let largest = 1;
    for (let i = 0; i < order.length; i++) {
      const r = order[i].request;
      const d = Math.max(r.r - r.l, r.b - r.t) * r.scale;
      if (d > largest) largest = d;
    }
    const minFactor = 1 / largest;
    // 优化：按面积比估算初始因子，减少重试次数（原来从 1 开始逐次 ×0.8 试到装得下）
    let totalArea = 0;
    for (let i = 0; i < order.length; i++) {
      const r = order[i].request;
      totalArea += ((r.r - r.l) * r.scale + 2) * ((r.b - r.t) * r.scale + 2);
    }
    const availW = this.decalW, availH = this.work.height - start.py;
    const availArea = Math.max(1, availW * availH - (start.rowH > 0 ? start.px * start.rowH : 0));
    let factor = totalArea > availArea ? Math.sqrt(availArea / totalArea) * 0.92 : 1;
    factor = Math.max(minFactor, factor);
    for (;;) {
      this.px = start.px; this.py = start.py; this.rowH = start.rowH; this.items.length = start.count;
      let failed = false;
      for (let i = 0; i < order.length; i++) {
        const { request: r, index } = order[i];
        const f = r.priority > 0 && factor > 0.3 ? 1 : factor;
        const cell = this.alloc(r.x, r.y, r.l, r.r, r.t, r.b, r.scale * f, r.air, r.alpha, r.k, r.seq, !!r.add);
        slots[index] = cell;
        if (!cell) failed = true;
      }
      if (!failed || factor === minFactor) return slots;
      factor = Math.max(minFactor, factor * 0.8);
    }
  }

  allocStatic(x: number, y: number, l: number, r: number, t: number, b: number,
    sprite: StaticSprite, air: boolean, alpha: number, k: number, seq = this.items.length, scenery = false): boolean {
    const left = Math.max(l, sprite.l), right = Math.min(r, sprite.r);
    const top = Math.max(t, sprite.t), bottom = Math.min(b, sprite.b);
    if (left >= right || top >= bottom) return true;
    if (this.items.length >= MAX_BB) return false;
    if (scenery && !this.bbMat.uniforms.uScenery) scenery = false;   // 没有景物图集参数的材质（测试里拼的场景）：共用一张
    let atlas = scenery ? this.sceneryAtlas : this.staticAtlas;
    if (!atlas) {
      atlas = new HdStaticAtlas(); atlas.begin();
      if (scenery) { this.sceneryAtlas = atlas; this.bbMat.uniforms.uScenery.value = atlas.texture; }
      else { this.staticAtlas = atlas; this.bbMat.uniforms.uStatic.value = atlas.texture; }
    }
    const cell = atlas.get(sprite.image, sprite.revision, sprite.key);
    if (!cell) return false;
    const fx0 = (left - sprite.l) / (sprite.r - sprite.l), fx1 = (right - sprite.l) / (sprite.r - sprite.l);
    const fy0 = (top - sprite.t) / (sprite.b - sprite.t), fy1 = (bottom - sprite.t) / (sprite.b - sprite.t);
    const u0 = cell.u0 + (cell.u1 - cell.u0) * (sprite.flip ? 1 - fx0 : fx0);
    const u1 = cell.u0 + (cell.u1 - cell.u0) * (sprite.flip ? 1 - fx1 : fx1);
    const v0 = cell.v0 + (cell.v1 - cell.v0) * fy0, v1 = cell.v0 + (cell.v1 - cell.v0) * fy1;
    this.pushItem(x, y, left, right, top, bottom, u0, v0, u1, v1, alpha * (sprite.alpha ?? 1), air, seq, k, true, sprite.image instanceof BitmapFrame, scenery);
    return true;
  }

  /** 图集还剩多少像素面积（按当前行之后的整行算） */
  atlasFree() { return this.decalW * Math.max(0, this.work.height - this.py - this.rowH); }
  /** 图集已用到的比例（草等小件用来自限，别把人物的位置占掉） */
  atlasUsed() { return (this.py + this.rowH - this.decalH) / this.atlasH; }

  /** 部分上传工作画布纹理：只传用到的行（地贴 + 立板区），省掉未用行的带宽 */
  private flushWorkTex(): void {
    const usedH = Math.min(this.work.height, this.workUsedH);
    // 首帧或用量达到整图：走 three 的整图上传（分配 GPU 存储）
    if (this.workTexFirst || usedH >= this.work.height) {
      this.workTex.needsUpdate = true;
      this.workTexFirst = false;
      return;
    }
    this.gl.initTexture(this.workTex);
    const handle = (this.gl.properties?.get(this.workTex) as { __webglTexture?: WebGLTexture } | undefined)?.__webglTexture;
    if (!handle) { this.workTex.needsUpdate = true; return; }
    const gl = this.gl.getContext() as WebGL2RenderingContext;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, handle);
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.work.width, usedH, gl.RGBA, gl.UNSIGNED_BYTE, this.work);
    this.gl.resetState();
  }

  releaseCharacterFrames(): void { this.staticAtlas?.clearBitmaps(); }

  /** 地面分块（用地形的 Canvas 分块，GPU 地表的 3D 版留待后续） */
  /** 飞过交界中线换图：地面网格原样平移过去（dy 世界单位，size 分块边长） */
  shiftTerrain(dx: number, dy: number, size: number) { this.buildings.clearLocations(); this.groundLayer.shiftRows(dx / size, dy / size, size); }
  invalidateTerrain() {
    this.buildings.clearLocations();
    this.groundLayer.clear();
  }

  syncGround(chunks: { cx: number; cy: number; canvas: HTMLCanvasElement }[], size: number) {
    this.groundLayer.sync(chunks, size);
  }
  /** 第五轮返工：进秘境之前先上传它的地块贴图（见 HdGround.preload） */
  preloadGround(canvas: HTMLCanvasElement | null): void { if (canvas) this.groundLayer.preload(canvas, this.gl); else this.groundLayer.dropPreload(); }
  /** 收官返工：地块网格的着色器先编好（见 HdGround.warm） */
  warmGround(): void { this.groundLayer.warm(this.gl, this.cam); }
  private warmRT: WebGLRenderTarget | null = null;
  /**
   * 收官返工：把秘境要用、界外还没真正画过的着色器在一张 16×16 的小图上实际画一遍——只编不画不够：
   * 显卡那边（ANGLE）在头一回画的时候才生成真正的着色器，换场那一帧照样要等。stage：0 地块网格，1 台底岩体、铁索、云海、界壁，2 它们投影那一遍
   */
  warmDraw(stage: number): void {
    const gl = this.gl, rt = this.warmRT ??= new WebGLRenderTarget(16, 16, { depthBuffer: true });
    gl.resetState(); gl.setRenderTarget(rt); gl.clear();
    if (stage === 0) {
      const m = this.groundLayer.warmMesh();
      if (m) { this.groundScene.add(m); gl.render(this.groundScene, this.cam); this.groundScene.remove(m); }
    } else if (this.realmFx) {
      const R = this.realmFx.group, vis = R.visible, tmp = new Scene();
      R.visible = true; const parent = R.parent, at = parent ? parent.children.indexOf(R) : -1; tmp.add(R);
      if (stage === 2) tmp.overrideMaterial = this.shadowDepthMat;
      gl.render(tmp, stage === 2 ? this.shadowCam : this.cam);
      tmp.overrideMaterial = null; tmp.remove(R); R.visible = vis;
      if (parent) { R.parent = parent; parent.children.splice(at, 0, R); }   // 放回原处（原来的位置）
    }
    gl.setRenderTarget(null); gl.resetState();
  }
  /** 收官返工：把一个场景在那张 16×16 的小图上实际画一遍（头一回画时要编、要链接的着色器提前做掉，见 warmDraw） */
  warmRender(scene: Scene, cam: OrthographicCamera | PerspectiveCamera): void {
    const gl = this.gl, rt = this.warmRT ??= new WebGLRenderTarget(16, 16, { depthBuffer: true });
    gl.resetState(); gl.setRenderTarget(rt); gl.clear(); gl.render(scene, cam); gl.setRenderTarget(null); gl.resetState();
  }

  setGroundBackdrop(backdrop: GroundBackdrop | null) { this.groundLayer.setBackdrop(backdrop); }
  /** 撼山客「无极一击」：远山缺一块（地形和地贴往下挖，depth = 0 收起） */
  setNotch(x: number, y: number, r: number, depth: number) { this.shadowU.uNotch.value.set(x, y, Math.max(1, r), Math.max(0, depth)); }
  /** r7-fx3d：大招砸出的坑（最多两个：x, y, 半径, 此刻的深度）和一圈地浪（x, y, 波前半径, 幅度, 推多远）；都给空就收平。剖面见 DENT_GLSL */
  setDents(d: readonly (readonly [number, number, number, number])[], rip: readonly [number, number, number, number, number] | null) {
    const U = this.shadowU; if (!U?.uDent0) return;   // 测试里按原型拼出来的场景没有这组参数
    for (let i = 0; i < 2; i++) { const q = d[i], v = (i ? U.uDent1 : U.uDent0).value; if (q && q[3] > 0.01) v.set(q[0], q[1], Math.max(1, q[2]), q[3]); else v.set(0, 0, 1, 0); }
    if (rip && rip[3] > 0.01) { U.uRip.value.set(rip[0], rip[1], rip[2], rip[3]); U.uRipR.value = Math.max(1, rip[4]); } else U.uRip.value.set(0, 0, 0, 0);
  }

  /**
   * 设定光源。phase 是一天里的相位（0 = 子夜，0.5 = 正午），night 0..1，dim 是阴天等造成的削弱（0..1）。
   * 白天用太阳：清晨在东、正午在北、傍晚在西，仰角压在 24°～66° 之间（太低影子会拖到天边）；
   * 入夜后影子先淡出，再换成月光方向淡淡地回来。
   */
  setSun(phase: number, night: number, dim: number) {
    const sunK = Math.max(0, Math.min(1, 1 - night * 1.6)), moonK = Math.max(0, Math.min(1, (night - 0.72) / 0.28));
    const p = sunK > 0 ? phase : (phase + 0.5) % 1;
    const az = Math.PI * 2 * (p - 0.25), day = Math.max(0, Math.sin(az));
    const el = (24 + 42 * day) * Math.PI / 180;
    // 光从哪边来：清晨在东（+x），正午在北（-z），傍晚在西。正午放在北边是有意的——镜头默认朝北看，
    // 太阳若在南边，影子全落到物体背后被自己挡住；放在北边，影子朝镜头这一侧铺开，看得见、也好判断高低。
    this.sunDir.set(-Math.cos(el) * Math.cos(az), -Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
    this.sunStrength = (sunK * 0.46 + moonK * 0.2) * (1 - Math.max(0, Math.min(1, dim)) * 0.8);
    this.nightK = night;
    this.shadowU.uSunTo.value.copy(this.sunDir).multiplyScalar(-1);
    this.shadowU.uLight.value.x = Math.min(1, this.sunStrength / 0.46);
    this.buildings.setNight(Math.max(0, Math.min(1, (night - 0.25) / 0.45)));   // P10：窗纸、灯笼入夜发光
    this.shadowU.uShadowTint.value.setRGB(sunK > 0 ? 0.6 : 0.7, sunK > 0 ? 0.65 : 0.72, sunK > 0 ? 0.8 : 0.84);
  }

  /** 阴影那一遍：从太阳方向用正交相机看可见地面，把立板和建筑的深度写进阴影图 */
  private renderShadows() {
    const U = this.shadowU;
    if (!U) return;   // 测试里按原型拼出来的场景没有阴影资源
    const on = SHADOWS_ON && this.shadowsEnabled && this.sunStrength > 0.01;
    hdShadows.active = on;
    if (!on) { U.uShadowParams.value.x = 0; return; }
    if (!this.shadowTarget) {
      const sz = this.shadowSize;
      const depth = new DepthTexture(sz, sz, UnsignedIntType);
      depth.minFilter = depth.magFilter = NearestFilter;
      this.shadowTarget = new WebGLRenderTarget(sz, sz, { depthBuffer: true, depthTexture: depth, generateMipmaps: false });
      this.shadowBbMat = new ShaderMaterial({ vertexShader: VS, fragmentShader: SHADOW_BB_FS, side: DoubleSide,
        uniforms: { uMap: this.bbMat.uniforms.uMap, uStatic: this.bbMat.uniforms.uStatic, uScenery: this.bbMat.uniforms.uScenery, uRight: { value: new Vector3(1, 0, 0) }, uBoost: { value: 1 }, uFold: { value: new Vector4(0, -1, 0, 0) }, uShadowMatrix: U.uShadowMatrix } });
    }
    // 覆盖范围：可见地面外接矩形的半对角线，再留出高处物体的影子余量；按 1.25 的级数取整，缩放时每格大小不乱跳
    const b = this.groundBounds(0), want = Math.hypot(b.r - b.l, b.b - b.t) / 2 + 500;
    const R = Math.min(9000, Math.pow(1.25, Math.ceil(Math.log(want) / Math.log(1.25))));
    this.shadowRadius = R;
    const cam = this.shadowCam, L = this.sunDir, cx = (b.l + b.r) / 2, cz = (b.t + b.b) / 2, cy = this.heightAt(cx, cz);
    const reach = MOUNTAINS ? 14000 : 2000;   // 高山模式下高处的山体也要落在阴影相机的范围里
    cam.left = -R; cam.right = R; cam.top = R; cam.bottom = -R; cam.near = 1; cam.far = R * 4 + reach * 2;
    cam.up.set(0, 1, 0);
    cam.position.set(cx - L.x * (R * 2 + reach), cy - L.y * (R * 2 + reach), cz - L.z * (R * 2 + reach));
    cam.lookAt(cx, cy, cz); cam.updateMatrixWorld();
    // 对齐到阴影图的像素格：镜头平移时影子边缘不闪
    const texel = 2 * R / this.shadowSize, view = cam.matrixWorldInverse, e = view.elements;
    const lx = e[0] * cx + e[4] * cy + e[8] * cz + e[12], ly = e[1] * cx + e[5] * cy + e[9] * cz + e[13];
    const dx = Math.round(lx / texel) * texel - lx, dy = Math.round(ly / texel) * texel - ly, w = cam.matrixWorld.elements;
    cam.position.x -= w[0] * dx + w[4] * dy; cam.position.y -= w[1] * dx + w[5] * dy; cam.position.z -= w[2] * dx + w[6] * dy;
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    U.uShadowMatrix.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    U.uShadowMap.value = null;   // 写阴影图期间不能同时读它
    // 投影立板面朝太阳方位：横向取与光线水平分量垂直的方向
    const h = Math.hypot(L.x, L.z) || 1;
    (this.shadowBbMat!.uniforms.uRight.value as Vector3).set(-L.z / h, 0, L.x / h);
    const gl = this.gl;
    gl.setRenderTarget(this.shadowTarget); gl.clear();
    if (MOUNTAINS) {
      this.groundScene.overrideMaterial = this.shadowTerrainMat;
      gl.autoClear = false; gl.render(this.groundScene, cam); gl.autoClear = true;
      this.groundScene.overrideMaterial = null;
    }
    const drawMat = this.bb.material;
    const addOn = this.bbAdd?.visible ?? false; if (this.bbAdd) this.bbAdd.visible = false;   // r11：光不投影
    this.buildings.fx.visible = false;   // 护山大阵是光，不投影
    this.buildings.group.visible = false; this.bb.material = this.shadowBbMat!;
    gl.autoClear = false; gl.render(this.scene, cam); gl.autoClear = true;
    this.bb.material = drawMat; this.buildings.group.visible = true;
    const rf = this.buildings.roomFade;
    if (rf.uRoomC.value.z > 0) this.shadowRoomMat ??= new ShaderMaterial({ colorWrite: false, uniforms: { ...rf },
      vertexShader: `varying vec3 vWP;
void main(){ vec4 p = vec4(position, 1.0);
#ifdef USE_INSTANCING
  p = instanceMatrix * p;
#endif
  vec4 w = modelMatrix * p; vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `varying vec3 vWP;
${ROOM_FADE_FS}
void main(){ roomOut(); gl_FragColor = vec4(1.0); }` });
    this.bb.visible = false; this.scene.overrideMaterial = this.buildings.wreckShadow() ?? (rf.uRoomC.value.z > 0 ? this.shadowRoomMat! : this.shadowDepthMat);   // 城镇破坏：坏了的构件藏起来时它也不投影
    const cloudsOn = this.clouds.map(c => c.mesh.visible); for (const c of this.clouds) c.mesh.visible = false;
    gl.autoClear = false; gl.render(this.scene, cam); gl.autoClear = true;
    this.scene.overrideMaterial = null; this.bb.visible = true;
    this.clouds.forEach((c, i) => { c.mesh.visible = cloudsOn[i]; });
    this.buildings.fx.visible = true;
    if (this.bbAdd) this.bbAdd.visible = addOn;
    gl.setRenderTarget(null);
    U.uShadowMap.value = this.shadowTarget.depthTexture;
    // 深度偏移折合约 14 个世界单位；立板只按六成受影（脚下一点定整块，太实会显脏）
    U.uShadowParams.value.set(this.sunStrength, 14 / (cam.far - cam.near), 1 / this.shadowSize, 0.6);
  }

  /** 立板按视线方向从远到近排序（飞行的始终在上层），写入实例并渲染 */
  render(target: WorldTarget) {
    const timing = prof.on;
    let start = timing ? performance.now() : 0;
    if (MOUNTAINS) this.terrainFalls?.sync(this.heightAt, performance.now() / 1000, this.nightK);
    if (MOUNTAINS) this.sectFx.update(this.tx, this.ty, performance.now() / 1000, this.heightAt, this.shadowU.uLight.value, this.nightK, this.shadowU.uSnowHole.value);
    const u = this.upDir;
    const n = this.items.length;
    // 远 = 沿屏幕上方更远（点积更大），先画；保留 2D 时的同深度顺序（稳定排序）
    // 2D 的 y 排序在正北视角下就是远近；转了方位后按「沿屏幕上方的距离」排。飞行的始终压在上层；同深度保留原绘制顺序
    this.items.sort((a, b) => (b.x - a.x) * u.x + (b.y - a.y) * u.y || a.seq - b.seq);
    // r11：叠加的光（it.add）写进另一组实例，其余照旧；两组各自保持从远到近的顺序
    const add = this.bbAdd && this.addFoot && this.addBox && this.addUv && this.addA ? this.bbAdd : null;
    let nb = 0, na = 0;
    for (let i = 0; i < n; i++) {
      const it = this.items[i];
      const toAdd = !!(it.add && add);
      const F = (toAdd ? this.addFoot! : this.aFoot).array as Float32Array, B = (toAdd ? this.addBox! : this.aBox).array as Float32Array,
        U = (toAdd ? this.addUv! : this.aUv).array as Float32Array, A = (toAdd ? this.addA! : this.aA).array as Float32Array;
      const j = toAdd ? na++ : nb++;
      F[j * 3] = it.x; F[j * 3 + 1] = it.y; F[j * 3 + 2] = this.heightAt(it.x, it.y);
      B[j * 4] = it.l; B[j * 4 + 1] = it.r; B[j * 4 + 2] = it.t; B[j * 4 + 3] = it.b;
      U[j * 4] = it.u0; U[j * 4 + 1] = it.v0; U[j * 4 + 2] = it.u1; U[j * 4 + 3] = it.v1;
      A[j * 3] = it.a; A[j * 3 + 1] = it.k; A[j * 3 + 2] = it.static ? (it.bitmap ? 2 : 1) + (it.scenery ? 2 : 0) : 0;
    }
    this.aFoot.needsUpdate = this.aBox.needsUpdate = this.aUv.needsUpdate = this.aA.needsUpdate = true;
    this.bb.count = nb;
    if (add) { if (na) this.addFoot!.needsUpdate = this.addBox!.needsUpdate = this.addUv!.needsUpdate = this.addA!.needsUpdate = true; add.count = na; }
    if (timing) { prof.add('R·HD实例填充', start); start = performance.now(); }
    // 部分上传：只传地贴 + 实际用到的立板行，省掉空行的 GPU 带宽
    this.workUsedH = this.py + this.rowH;
    this.flushWorkTex();
    if (timing) prof.num('N·上传字节', this.work.width * this.workUsedH * 4);
    this.gl.resetState();
    this.staticAtlas?.flush(this.gl); this.sceneryAtlas?.flush(this.gl);
    if (timing) { prof.add('R·HD目标与静态上传', start); start = performance.now(); }
    this.renderShadows();
    if (timing) { prof.add('R·HD阴影图', start); start = performance.now(); }
    this.gl.setRenderTargetFramebuffer(this.target, target.fb);
    this.gl.setRenderTarget(this.target);
    if (timing) { prof.add('R·HD目标与静态上传', start); start = performance.now(); }
    if (this.backdropOn && this.bdScene && this.bdCam) {
      this.gl.clear(); this.gl.autoClear = false;
      this.gl.render(this.bdScene, this.bdCam); this.gl.render(this.groundScene, this.cam);
      this.gl.autoClear = true;
    } else this.gl.render(this.groundScene, this.cam);
    if (timing) { prof.num('N·绘制调用', this.gl.info.render.calls); prof.add('R·HD地表提交', start); start = performance.now(); }
    const gl = this.gl.getContext() as WebGL2RenderingContext;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target.groundFb);
    gl.blitFramebuffer(0, 0, target.w, target.h, 0, 0, target.w, target.h, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    if (timing) { prof.add('R·HD地表深度复制', start); start = performance.now(); }
    this.gl.autoClear = false;
    this.gl.render(this.scene, this.cam);
    if (timing) { prof.num('N·绘制调用', this.gl.info.render.calls); prof.num('N·立板数', n); prof.add('R·HD立板与纹理提交', start); start = performance.now(); }
    this.renderWorldClouds(target);
    if (timing) { prof.add('R·HD体积云', start); start = performance.now(); }
    this.gl.autoClear = true;
    this.gl.setRenderTarget(null);
    this.gl.resetState();
    if (timing) prof.add('R·HD目标收尾', start);
  }


  // ---------------------------------------------------------------- 虚空甬道
  private passage: {
    scene: Scene; cam: PerspectiveCamera; tube: ShaderMaterial; hero: Mesh; heroCanvas: HTMLCanvasElement; heroTex: CanvasTexture;
    heroMat: MeshBasicMaterial; aura: ShaderMaterial; end: ShaderMaterial; endMesh: Mesh; flash: MeshBasicMaterial;
    /** 游离的咒文分两批画：比人物远的先画（[0]），比人物近的后画（[1]） */
    charms: [InstancedMesh, InstancedMesh]; charmSeed: Float32Array; dummy: Object3D;
    /** 甬道里其他人的立板（同行的修士、追进来的追兵），用到几个建几个 */
    figs: { mesh: Mesh; canvas: HTMLCanvasElement; tex: CanvasTexture; mat: MeshBasicMaterial; fresh: boolean }[]; frame: number;
    /** 收官返工：进出甬道的洞口——世界画面拷一份、甬道画进一张离屏图，再由一道全屏的合成把两者按洞口拼起来（只在进出那半秒里用） */
    iris?: { world: WebGLRenderTarget; tube: WebGLRenderTarget; scene: Scene; cam: OrthographicCamera; mat: ShaderMaterial };
  } | null = null;
  private readonly irisClear = new Color();
  private tunnelBlades: TunnelBladesFx | null = null;
  /**
   * 虚空挪移的甬道：盖在已经合成好的世界画面之上，直接画到屏幕。
   * 一段弯曲的管道，内壁是向镜头流过来的螺旋云气，壁上贴着一圈圈流转的发光咒文；玩家的人物立板在管道中间往里飞，镜头跟在身后；
   * 另有几十个游离的咒文字绕着甬道中轴盘旋；figures 是甬道里的其他人（前方的同行修士、身后追进来的追兵），画法和主角一样；
   * 尽头是出口的亮光。paintHero 把主角画进一张小画布（用游戏里同一套人物画法，所以换装、模组换图都跟着变）。
   * 收官返工：iris 是进出甬道的洞口（见 Nuoyi.iris）；x / y 是进阵时洞口的中心（主角脚下，CSS 像素），出阵时洞口在甬道尽头、这里自己算。
   * flash 不再用（进出不闪白）；cut（截断、挨飞剑）是一记压暗的血红，不提亮画面。
   */
  renderPassage(v: { time: number; fade: number; flash: number; exiting: number; swayX: number; swayY: number; wall: readonly number[]; light: readonly number[]; cut?: number; surge?: number; surgeDepth?: number;
      iris?: { out: boolean; k: number; x: number; y: number } },
    paintHero: (canvas: HTMLCanvasElement) => void,
    figures: { paint: (canvas: HTMLCanvasElement) => void; x: number; y: number; z: number; hostile: boolean }[] = [],
    blades: readonly TunnelBladeView[] = []): void {
    let P = this.passage;
    if (!P) {
      const scene = new Scene(), cam = new PerspectiveCamera(62, 1, 1, 12000);
      const tubeGeo = new CylinderGeometry(260, 260, 5600, 48, 56, true); tubeGeo.rotateX(Math.PI / 2); tubeGeo.translate(0, 0, -2800);
      const glyphTex = new CanvasTexture(glyphAtlas());
      const uniforms = { uNoise: this.shadowU.uNoise, uGlyph: { value: glyphTex }, uP: { value: new Vector4() }, uWall: { value: new Vector3() }, uLight: { value: new Vector3() } };
      const tube = new ShaderMaterial({ side: BackSide, transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false, uniforms,
        vertexShader: `
uniform vec4 uP; varying vec2 vUv; varying float vDepth;
void main(){
  vec3 p = position; vDepth = clamp(-p.z / 5600.0, 0.0, 1.0); vUv = uv;
  // 管道越远弯得越厉害，近处贴着镜头的一段是直的
  float k = smoothstep(0.03, 0.5, vDepth);
  p.x += sin(p.z * 0.0011 + uP.x * 0.55) * 150.0 * k; p.y += cos(p.z * 0.0009 + uP.x * 0.4) * 95.0 * k;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`,
        fragmentShader: `
uniform sampler2D uNoise; uniform sampler2D uGlyph; uniform vec4 uP; uniform vec3 uWall; uniform vec3 uLight; varying vec2 vUv; varying float vDepth;
// 噪声图放得很大时，普通的线性取样会露出菱形格子；先把小数部分过一遍平滑曲线再取样，云团边缘就是圆润的
// （只在放大时这样做：远处一个像素跨好几个纹素，照常取样，交给多级贴图去糊，否则会出台阶）
vec4 soft(vec2 uv) {
  vec2 p = uv * 256.0 - 0.5, f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float far = clamp(length(fwidth(uv)) * 256.0 * 1.5 - 0.25, 0.0, 1.0);
  return texture2D(uNoise, mix((floor(p) + f + 0.5) / 256.0, uv, far));
}
void main(){
  float time = uP.x, around = vUv.x;
  // 进深取对数：洞壁离镜头越近，在画面上被拉得越长；按对数走，花纹在画面上就是匀称的，
  // 不会在画面边缘拉成一条条生硬的放射光带。L 以「绕洞一圈」为 1 个单位
  float L = log(max(vDepth * 5600.0, 40.0)) / 6.2831853;
  // —— 云气：顺着螺旋流过来；三层噪声，先用一层把取样位置推歪，云丝就有卷曲，不是整块的明暗
  float Lc = L + time * 0.16;
  float ang = (around + Lc * 0.5) * 6.2831853;
  vec2 base = vec2(cos(ang), sin(ang)) * 0.016 + vec2(0.085, 0.052) * Lc;
  vec2 warp = (soft(base * 0.6 + vec2(0.13, time * 0.004)).rg - 0.5) * 0.028;
  float n = soft(base + warp).r * 0.5 + soft(base * 2.1 + warp * 1.6 + 0.37).g * 0.32 + soft(base * 4.3 - warp + 0.71).b * 0.18;
  float cloud = smoothstep(0.34, 0.68, n);
  // —— 咒文：一圈圈贴在洞壁上的发光的字。每一圈有自己的字数、转向和转速，圈本身略微起伏，不是死板的正圆
  // 字和云气写在同一面「水」上：用推歪云丝的那层噪声，把取字的位置也推歪，字就跟着洞壁的流动一起扭、一起漾
  vec2 ripple = warp * 0.55 + (soft(base * 1.3 + vec2(0.61, 0.23) - time * 0.006).ba - 0.5) * 0.012;
  float Lg = L + time * 0.085 + ripple.y, pitch = 1.0 / 12.0;
  float aroundG = around + ripple.x;
  float rc = Lg / pitch + 0.22 * sin(around * 6.2831853 + Lg * 9.0 + time * 0.5);
  float row = floor(rc), fy = fract(rc);
  vec4 hr = textureLod(uNoise, vec2((mod(row, 256.0) + 0.5) / 256.0, 0.5 / 256.0), 0.0);
  float on = step(0.42, hr.r);
  float cols = 18.0 + floor(hr.a * 2.999) * 6.0;                      // 一圈 18 / 24 / 30 个字
  float cc = (aroundG + time * (hr.g - 0.5) * 0.07) * cols;
  float col = mod(floor(cc), cols), fx = fract(cc);
  vec4 hc = textureLod(uNoise, vec2((col + 0.5) / 256.0, (mod(row, 255.0) + 1.5) / 256.0), 0.0);
  float tall = 1.0 / (cols * pitch);                                   // 字高占一圈间距的几成（字在画面上是方的）
  vec2 inCell = vec2(fx, (fy - 0.5) / tall + 0.5);
  float inside = step(0.0, inCell.y) * step(inCell.y, 1.0) * on * step(0.1, hc.g);   // 偶尔空一格，像断句
  float idx = floor(hc.b * 63.999);
  vec2 cont = vec2(cc, rc / tall) / 8.0;
  float glyph = textureGrad(uGlyph, (vec2(mod(idx, 8.0), floor(idx / 8.0)) + clamp(inCell, 0.02, 0.98)) / 8.0, dFdx(cont), dFdy(cont)).r * inside;
  float pulse = 0.7 + 0.3 * sin(time * 2.2 + row * 1.7 + around * 12.566);
  float veil = on * exp(-pow((fy - 0.5) / (tall * 0.75), 2.0)) * 0.07;  // 字后面一层淡淡的光带
  float show = smoothstep(0.035, 0.07, vDepth) * (1.0 - smoothstep(0.4, 0.62, vDepth));
  vec3 col3 = mix(uWall * 0.24, uWall * 1.2 + uLight * 0.08, cloud);
  col3 += (uLight * 1.2 + 0.18) * (glyph * 1.35 + veil) * pulse * show;
  col3 = mix(col3, uLight * 1.3 + 0.25, smoothstep(0.5, 1.0, vDepth));      // 远处收成一片光
  col3 *= 0.55 + 0.45 * smoothstep(0.03, 0.1, vDepth);                      // 贴着镜头的一圈压暗
  gl_FragColor = vec4(col3 * uP.y, uP.y);
}` });
      scene.add(Object.assign(new Mesh(tubeGeo, tube), { renderOrder: 0, frustumCulled: false }));
      const glow = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
      const end = new ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: AdditiveBlending, uniforms: { uLight: uniforms.uLight, uP: uniforms.uP }, vertexShader: glow,
        fragmentShader: `uniform vec3 uLight; uniform vec4 uP; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 1.6) * (0.45 + uP.z * 2.5) * uP.y; gl_FragColor = vec4((uLight + 0.35) * a, a); }` });
      const endMesh = Object.assign(new Mesh(new PlaneGeometry(1, 1), end), { renderOrder: 1, frustumCulled: false }); scene.add(endMesh);
      // 第五轮：甬道尽头是开口的，从开口里看得见底下的世界画面（一圈亮光里嵌着一小块地面，像个白光球）——用一片和洞底同色的光把口封上
      const capMat = new ShaderMaterial({ transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false, uniforms: { uLight: uniforms.uLight, uP: uniforms.uP }, vertexShader: glow,
        fragmentShader: `uniform vec3 uLight; uniform vec4 uP; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0, a = (1.0 - smoothstep(0.55, 1.0, d)) * uP.y; gl_FragColor = vec4((uLight * 0.95 + 0.12) * a, a); }` });   // 不是一块刺眼的白：比洞壁尽头略暗、边缘柔开
      const cap = Object.assign(new Mesh(new CircleGeometry(330, 40), capMat), { renderOrder: 0.5, frustumCulled: false, name: 'tunnelCap' }); scene.add(cap);
      const aura = new ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: AdditiveBlending, uniforms: { uLight: uniforms.uLight, uP: uniforms.uP }, vertexShader: glow,
        fragmentShader: `uniform vec3 uLight; uniform vec4 uP; varying vec2 vUv; void main(){ vec2 q = (vUv - 0.5) * vec2(2.0, 1.25); float a = pow(max(0.0, 1.0 - length(q)), 2.2) * 0.55 * uP.y; gl_FragColor = vec4(uLight * a, a); }` });
      const heroCanvas = document.createElement('canvas'); heroCanvas.width = 384; heroCanvas.height = 448;
      const heroTex = new CanvasTexture(heroCanvas); heroTex.minFilter = LinearFilter; heroTex.generateMipmaps = false;
      const heroMat = new MeshBasicMaterial({ map: heroTex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
      const hero = new Mesh(new PlaneGeometry(1, 1), heroMat); hero.renderOrder = 3; hero.frustumCulled = false;
      const auraMesh = Object.assign(new Mesh(new PlaneGeometry(1, 1), aura), { renderOrder: 2, frustumCulled: false });
      hero.add(auraMesh); auraMesh.scale.set(0.9, 0.62, 1); auraMesh.position.set(0, -0.2, -1);
      scene.add(hero);
      const flash = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
      const flashMesh = Object.assign(new Mesh(new PlaneGeometry(40, 40), flash), { renderOrder: 9, frustumCulled: false });
      flashMesh.position.set(0, 0, -4); scene.add(flashMesh);
      // 游离的咒文：两个实例化网格共用一份材质，每帧按远近分到两批里（比人物远的先画、近的后画）
      const moteMat = new ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: AdditiveBlending,
        uniforms: { uGlyph: uniforms.uGlyph, uLight: uniforms.uLight, uP: uniforms.uP },
        vertexShader: `attribute vec2 aVA; varying vec2 vUv; varying vec2 vVA;
void main(){ vUv = uv; vVA = aVA; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform sampler2D uGlyph; uniform vec3 uLight; uniform vec4 uP; varying vec2 vUv; varying vec2 vVA;
void main(){
  float idx = floor(vVA.x + 0.5);
  float g = texture2D(uGlyph, (vec2(mod(idx, 8.0), floor(idx / 8.0)) + clamp(vUv, 0.02, 0.98)) / 8.0).r;
  float halo = pow(max(0.0, 1.0 - length(vUv - 0.5) * 2.0), 2.0) * 0.22;
  float a = (g * 1.25 + halo) * vVA.y * uP.y;
  gl_FragColor = vec4(uLight * 1.15 + 0.2, a);
}` });
      const charms = [2.5, 4].map((order) => {
        const geo = new PlaneGeometry(1, 1); geo.setAttribute('aVA', new InstancedBufferAttribute(new Float32Array(MOTE_COUNT * 2), 2));
        const mesh = new InstancedMesh(geo, moteMat, MOTE_COUNT); mesh.renderOrder = order; mesh.frustumCulled = false; mesh.count = 0; scene.add(mesh);
        return mesh;
      }) as unknown as [InstancedMesh, InstancedMesh];
      const charmSeed = new Float32Array(MOTE_COUNT * 4);
      let seed = 0x2545f491;
      for (let i = 0; i < charmSeed.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; charmSeed[i] = seed / 4294967296; }
      P = this.passage = { scene, cam, tube, hero, heroCanvas, heroTex, heroMat, aura, end, endMesh, flash, charms, charmSeed, dummy: new Object3D(), figs: [], frame: 0 };
    }
    paintHero(P.heroCanvas); P.heroTex.needsUpdate = true;
    // 收官返工：出口的光只在「目的地备好了」时略亮一点（0.15），出阵时不再越冲越亮（原来冲到满屏白）——出阵时是洞口张开露出目的地
    (P.tube.uniforms.uP.value as Vector4).set(v.time, v.fade, Math.min(0.15, v.exiting), 0);
    (P.tube.uniforms.uWall.value as Vector3).fromArray(v.wall as number[]);
    (P.tube.uniforms.uLight.value as Vector3).fromArray(v.light as number[]);
    // 人物：在镜头前方、略低于中线；左右上下可被方向键带着挪，自身轻轻浮动、随横移侧倾；出阵时冲向出口
    const t = v.time, rush = v.exiting * v.exiting;
    // 人物画布留了很大的余量（人只占中间偏下的一小块），所以立板本身要大：人物约占画面高度的三成
    // 收官 P5：按住疾行往前蹿（surge），身后的人不跟着蹿——他们按「没蹿时」的进深摆
    const baseZ = -340 - rush * 900;
    P.hero.position.set(v.swayX * 80 + Math.sin(t * 1.3) * 12, PASSAGE_HERO_Y + v.swayY * 50 + Math.sin(t * 1.9) * 8, baseZ - (v.surge ?? 0) * (v.surgeDepth ?? 0));
    P.hero.scale.set(480, 560, 1);
    P.hero.rotation.z = -v.swayX * 0.16 + Math.sin(t * 1.1) * 0.035;
    P.heroMat.opacity = v.fade * (1 - rush * 0.6);
    // 出口的光：平时在尽头，出阵时迎面放大
    const far = 5200 - rush * 4300, bendK = far / 5600 > 0.03 ? Math.min(1, (far / 5600 - 0.03) / 0.47) : 0;
    P.endMesh.position.set(Math.sin(-far * 0.0011 + t * 0.55) * 150 * bendK, Math.cos(-far * 0.0009 + t * 0.4) * 95 * bendK, -far);
    { const cap = P.scene.getObjectByName('tunnelCap'); if (cap) cap.position.set(Math.sin(-5590 * 0.0011 + t * 0.55) * 150, Math.cos(-5590 * 0.0009 + t * 0.4) * 95, -5590); }   // 跟着管子尽头那一圈弯
    // 第五轮：出口的光平时收小（原来 900 宽，正好落在主角头顶，像一颗白光球盖住了人）。
    // 收官返工：出阵时不再迎面放大成满屏的白（洞口张开露出目的地，光跟着往前冲、大小不变）
    P.endMesh.scale.setScalar(560);
    // 甬道被截断的那一下、挨飞剑那一下：一记压暗的血红（不提亮画面），镜头猛震
    const cut = v.cut ?? 0;
    P.flash.opacity = Math.max(0, Math.min(1, cut * 0.62));
    P.flash.color.setRGB(0.78, 0.1, 0.08);
    P.cam.position.set(Math.sin(t * 61) * cut * 14, Math.cos(t * 47) * cut * 10, 0);
    // —— 甬道里的其他人：前方的先画（被主角挡住），身后的后画；远处的跟着甬道一起弯、渐渐没入尽头的光里
    P.frame++;
    for (let i = 0; i < Math.max(figures.length, P.figs.length); i++) {
      const f = figures[i];
      let F = P.figs[i];
      if (!f) { if (F) { F.mesh.visible = false; F.fresh = true; } continue; }
      if (!F) {
        const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 448;
        const tex = new CanvasTexture(canvas); tex.minFilter = LinearFilter; tex.generateMipmaps = false;
        const mat = new MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
        const mesh = new Mesh(new PlaneGeometry(1, 1), mat); mesh.frustumCulled = false; P.scene.add(mesh);
        F = P.figs[i] = { mesh, canvas, tex, mat, fresh: true };
      }
      // 每人每三帧重画一次（错开），御空的姿势变化慢，看不出来
      if (F.fresh || (P.frame + i) % 3 === 0) { f.paint(F.canvas); F.tex.needsUpdate = true; F.fresh = false; }
      const behind = f.z > 0, z = baseZ + f.z, depth = -z / 5600;
      const k = Math.max(0, Math.min(1, (depth - 0.03) / 0.47)), bend = k * k * (3 - 2 * k);
      F.mesh.visible = true;
      F.mesh.position.set(f.x + Math.sin(z * 0.0011 + t * 0.55) * 150 * bend + Math.sin(t * 1.1 + i * 2.3) * 10,
        62 + f.y + Math.cos(z * 0.0009 + t * 0.4) * 95 * bend + Math.sin(t * 1.7 + i * 1.3) * 7, z);
      // 第五轮：身后的追兵离镜头比主角近，同样大的立板会放大到压住右下大半屏、挡住主角和飞剑预警——
      // 按纵深缩到和主角相称（看上去约七成大），像远远缀在身后（位置不动：飞剑从他手里掷出）
      const ks = behind ? Math.max(0.3, Math.min(0.9, (-z / -baseZ) * 0.72)) : 1;
      F.mesh.scale.set(480 * ks, 560 * ks, 1); F.mesh.rotation.z = Math.sin(t * 0.9 + i) * 0.04;
      F.mesh.renderOrder = behind ? 3.5 : 2.2;
      F.mat.opacity = v.fade * (behind ? 1 - rush * 0.6 : (1 - rush) * Math.max(0, Math.min(1, (3000 + z) / 1200)));
      F.mat.color.setRGB(1, f.hostile ? 0.7 : 1, f.hostile ? 0.7 : 1);
    }
    // —— 游离的咒文：从深处迎面过来，一边绕着甬道中轴盘旋，跟着甬道一起弯；始终正对镜头
    {
      const bz = P.hero.position.z, D = P.dummy, counts = [0, 0], TAU = Math.PI * 2, meshes = P.charms, S = P.charmSeed;
      for (let j = 0; j < MOTE_COUNT; j++) {
        const s0 = S[j * 4], s1 = S[j * 4 + 1], s2 = S[j * 4 + 2], s3 = S[j * 4 + 3];
        const z = -3400 + (s0 * 3600 + t * (420 + s1 * 380)) % 3600, depth = -z / 5600;
        const k = Math.max(0, Math.min(1, (depth - 0.03) / 0.47)), bend = k * k * (3 - 2 * k);
        const a = s2 * TAU + t * (0.5 + s1 * 0.6) * (s3 > 0.5 ? 1 : -1), r = 125 + s3 * 95;
        const alpha = Math.max(0, Math.min(1, (3100 + z) / 900)) * Math.max(0, Math.min(1, (140 - z) / 240)) * (0.55 + 0.45 * Math.sin(t * 2.4 + j * 1.9));
        if (alpha <= 0.01) continue;
        const batch = z > bz ? 1 : 0, mesh = meshes[batch], i = counts[batch]++, size = 34 + s2 * 22;
        D.position.set(Math.cos(a) * r + Math.sin(z * 0.0011 + t * 0.55) * 150 * bend, Math.sin(a) * r + Math.cos(z * 0.0009 + t * 0.4) * 95 * bend, z);
        D.rotation.set(0, 0, Math.sin(t * 0.7 + j * 2.3) * 0.25); D.scale.set(size, size, 1); D.updateMatrix();
        mesh.setMatrixAt(i, D.matrix);
        (mesh.geometry.attributes.aVA as InstancedBufferAttribute).setXY(i, Math.floor(s1 * 63.999), alpha);
      }
      for (let b = 0; b < 2; b++) {
        const mesh = meshes[b]; mesh.count = counts[b];
        mesh.instanceMatrix.needsUpdate = true; (mesh.geometry.attributes.aVA as InstancedBufferAttribute).needsUpdate = true;
      }
    }
    // 收官 P5：追兵掷来的飞剑（落点预警、来向、剑光）；没被追杀时是空的，什么都不画
    if (blades.length || this.tunnelBlades) (this.tunnelBlades ??= new TunnelBladesFx(P.scene)).update(blades, baseZ, v.surgeDepth ?? 0, t, v.fade);
    P.cam.aspect = this.W / this.H; P.cam.rotation.z = Math.sin(t * 0.5) * 0.05 + v.swayX * 0.03; P.cam.updateProjectionMatrix();
    const gl = this.gl;
    gl.resetState();
    const ir = v.iris && v.iris.k > 0 && v.iris.k < 1 ? v.iris : null;
    if (!ir) {
      if (v.iris && v.iris.k <= 0 && !v.iris.out) { gl.resetState(); return; }   // 洞口还没张开：什么都不画
      gl.setRenderTarget(null);
      gl.setViewport(0, 0, this.canvas.width, this.canvas.height);
      gl.autoClear = false; gl.render(P.scene, P.cam); gl.autoClear = true;
      gl.resetState();
      return;
    }
    this.renderIris(P, ir, v.light);
  }

  /**
   * 收官返工：进出甬道的洞口。先把已经合成好的世界画面拷进一张图、把甬道画进另一张图，再用一道全屏合成拼起来：
   *   进阵（out=false）：洞口从主角脚下张开，洞里是甬道；洞外的世界画面绕着洞口打旋、往洞里收——像被卷进甬道壁；
   *   出阵（out=true）：洞口在甬道尽头张开，洞里是目的地（由旋着往外舒展到摆正）；洞外的甬道壁跟着往外甩开。
   * 洞口的边是几道螺旋的旋臂，边上一圈淡墨压暗、一丝极淡的符光；全程不提亮画面（不闪白）。
   */
  private renderIris(P: NonNullable<HdScene['passage']>, ir: { out: boolean; k: number; x: number; y: number }, light: readonly number[]) {
    const gl = this.gl, cw = this.canvas.width, ch = this.canvas.height;
    let I = P.iris;
    if (!I) {
      const rt = () => new WebGLRenderTarget(cw, ch, { depthBuffer: false, generateMipmaps: false, minFilter: LinearFilter, magFilter: LinearFilter });
      const mat = new ShaderMaterial({ depthTest: false, depthWrite: false, transparent: false,
        uniforms: { uWorld: { value: null }, uTube: { value: null }, uRes: { value: new Vector2() }, uI: { value: new Vector4() }, uJ: { value: new Vector4() }, uLight: { value: new Vector3() } },
        vertexShader: `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: `
uniform sampler2D uWorld; uniform sampler2D uTube; uniform vec2 uRes; uniform vec4 uI; uniform vec4 uJ; uniform vec3 uLight;
vec2 rot(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
vec2 at(vec2 p){ return clamp(p / uRes, vec2(0.5) / uRes, vec2(1.0) - vec2(0.5) / uRes); }
void main(){
  vec2 C = uI.xy, d = gl_FragCoord.xy - C; float R = uI.z, out_ = uI.w, k = uJ.x, time = uJ.y;
  float r = length(d), ang = atan(d.y, d.x);
  // 洞口的边：五道旋臂随时间转，边缘不是死板的正圆
  float arm = 0.5 + 0.5 * sin(ang * 5.0 - log(r / max(R, 1.0) + 0.06) * 4.0 + time * 4.0);
  float edge = R * (0.92 + 0.1 * arm), feather = 3.0 + R * 0.07;
  float inner = 1.0 - smoothstep(edge - feather, edge + feather, r);   // 1 = 在洞里
  // 离洞口的边越近卷得越厉害；卷动从无到有、再到收住（进阵 k 越大卷得越紧，出阵 k 越大越舒展）
  float L = R * 0.5 + uRes.y * 0.07, near = exp(-abs(r - edge) / L);
  float amt = out_ < 0.5 ? smoothstep(0.0, 0.25, k) * (0.4 + 0.6 * k) : smoothstep(0.0, 0.12, k) * (1.0 - k);
  float tw = 1.7 * amt * near;
  vec3 col;
  if (out_ < 0.5) {
    // 进阵：洞外的世界绕洞口旋、往里收（取更外面的像素放到这里 = 画面往洞里走）；洞里是甬道
    vec2 q = C + rot(d, -tw) * (1.0 + 0.45 * amt * near);
    vec3 w = texture2D(uWorld, at(q)).rgb * (1.0 - 0.28 * amt * near);
    vec4 tb = texture2D(uTube, at(C + rot(d, tw * 0.5)));
    vec3 tube = tb.rgb + w * (1.0 - tb.a);
    col = mix(w, tube, inner);
  } else {
    // 出阵：洞里是目的地，由旋着往外舒展到摆正（取更里面的像素放到这里 = 画面往外铺开）；洞外的甬道壁跟着往外甩
    vec3 w = texture2D(uWorld, at(C + rot(d, tw) * (1.0 - 0.3 * amt * near))).rgb;
    vec4 tb = texture2D(uTube, at(C + rot(d, -tw * 0.6) * (1.0 - 0.25 * amt * near)));
    vec3 tube = (tb.rgb + w * (1.0 - tb.a)) * (1.0 - 0.25 * amt * near);
    col = mix(tube, w, inner);
  }
  // 洞口一圈：淡墨压暗，掺一丝极淡的符光（加的远比压掉的少：整体只会更暗，不会闪白）
  float rim = exp(-pow((r - edge) / (feather * 2.2 + 2.0), 2.0));
  col = col * (1.0 - 0.38 * rim) + uLight * (0.1 * rim * (0.4 + 0.6 * arm));
  gl_FragColor = vec4(col, 1.0);
}` });
      const scene = new Scene(), quad = new Mesh(new PlaneGeometry(2, 2), mat); quad.frustumCulled = false; scene.add(quad);
      I = P.iris = { world: rt(), tube: rt(), scene, cam: new OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };
    }
    if (I.world.width !== cw || I.world.height !== ch) { I.world.setSize(cw, ch); I.tube.setSize(cw, ch); }
    // 1) 世界画面（GLStage 刚合成到屏幕上的那一帧）拷一份
    gl.setRenderTarget(I.world);
    const ctx = gl.getContext() as WebGL2RenderingContext, fb = (gl.properties.get(I.world) as { __webglFramebuffer?: WebGLFramebuffer }).__webglFramebuffer ?? null;
    ctx.bindFramebuffer(ctx.READ_FRAMEBUFFER, null); ctx.bindFramebuffer(ctx.DRAW_FRAMEBUFFER, fb);
    ctx.blitFramebuffer(0, 0, cw, ch, 0, 0, cw, ch, ctx.COLOR_BUFFER_BIT, ctx.NEAREST);
    gl.resetState();
    // 2) 甬道画进离屏图（透明底）
    gl.getClearColor(this.irisClear); const ca = gl.getClearAlpha();
    gl.setClearColor(0x000000, 0); gl.setRenderTarget(I.tube); gl.clear(); gl.render(P.scene, P.cam);
    gl.setClearColor(this.irisClear, ca);
    // 3) 洞口：进阵在主角脚下；出阵在甬道尽头（尽头那圈光投到屏幕上的位置）
    let cx: number, cy: number;
    if (ir.out) { P.cam.updateMatrixWorld(); const e = P.endMesh.position.clone().project(P.cam); cx = (e.x * 0.5 + 0.5) * cw; cy = (e.y * 0.5 + 0.5) * ch; }
    else { cx = ir.x * cw / this.W; cy = ch - ir.y * ch / this.H; }
    // 盖满全屏要多大：到最远一角的距离，再留出旋臂的起伏和羽化
    const far = Math.max(Math.hypot(cx, cy), Math.hypot(cw - cx, cy), Math.hypot(cx, ch - cy), Math.hypot(cw - cx, ch - cy)) * 1.22 + 24;
    const R0 = ir.out ? ch * 0.05 : 0, e = Math.pow(ir.k, 1.7), R = R0 + (far - R0) * e;
    const U = I.mat.uniforms;
    U.uWorld.value = I.world.texture; U.uTube.value = I.tube.texture;
    (U.uRes.value as Vector2).set(cw, ch); (U.uI.value as Vector4).set(cx, cy, R, ir.out ? 1 : 0);
    (U.uJ.value as Vector4).set(ir.k, (P.tube.uniforms.uP.value as Vector4).x, 0, 0); (U.uLight.value as Vector3).fromArray(light as number[]);
    gl.setRenderTarget(null);
    gl.setViewport(0, 0, cw, ch);
    gl.autoClear = false; gl.render(I.scene, I.cam); gl.autoClear = true;
    gl.resetState();
  }

  // ---------------------------------------------------------------- 界内的体积云
  private worldClouds: VoidClouds | null = null; private worldDeck: CloudDeck | null = null; private worldDt = 0.016;
  private depthTex: Texture | null = null;
  /** 这一帧界内要画的那层低云（不画就给 null）。太阳的方向由这里补上 */
  setCloudDeck(deck: CloudDeck | null, dt: number) {
    this.worldDeck = deck; this.worldDt = dt;
    if (deck) { const s = this.shadowU.uSunTo.value; deck.light = [s.x, Math.max(0.3, s.y), s.z]; }
  }
  /** 立板和建筑画完之后：读整个场景的深度，把云画进一张小图再合回来——云下的树和房被云盖住，云上的人照常看得见 */
  private renderWorldClouds(target: WorldTarget) {
    const deck = this.worldDeck, cam = this.cam;
    if (!deck || !(cam instanceof PerspectiveCamera)) return;
    const clouds = this.worldClouds ??= new VoidClouds(this.gl, this.shadowU.uNoise.value, { scale: 0.5, steps: 34 });   // 界内的画面本身就不轻：云用省一档的画法
    // 深度图是 GLStage 那边建的原生纹理：包成 three 的纹理好让着色器取
    const tex = this.depthTex ??= new Texture();
    const props = this.gl.properties.get(tex) as { __webglTexture?: WebGLTexture; __webglInit?: boolean };
    props.__webglTexture = target.depth; props.__webglInit = true;
    if (!clouds.render(deck, cam, tex, target.w, target.h, this.worldDt)) return;
    this.gl.setRenderTarget(this.target);
    clouds.composite();
  }

  // ---------------------------------------------------------------- 虚空
  private voidScene: VoidScene | null = null;
  /** 画一帧虚空（星渊与诸界），直接画到屏幕上；返回场景，调用方用它把各界的位置换成屏幕坐标来标名字 */
  private voidOf(): VoidScene { return this.voidScene ??= new VoidScene(this.gl, this.shadowU.uNoise.value, glyphAtlas()); }
  /** 升到云层之前先把虚空那边的着色器编好 */
  warmVoid(home: Parameters<VoidScene['warm']>[0]): boolean { const s = this.voidOf(); s.warm(home); return s.cloudsReady(); }
  /** 只盖一层云气到屏幕上（往天外升降的界内那一段） */
  veilVoid(cloud: number, time: number, flow: number, night: number, spot?: { x: number; y: number; r: number; k: number } | null): void { this.voidOf().veil(cloud, time, flow, night, this.W, this.H, this.canvas.width, this.canvas.height, spot); }
  /** 第五轮返工：云门那一团云在屏幕上的位置和大小（门心世界坐标、离地高度、世界半径 → CSS 像素） */
  gateSpot(x: number, y: number, h: number, r: number, k: number): { x: number; y: number; r: number; k: number } {
    const a = this.project(x, y, h), b = this.project(x + r, y, h), c = this.project(x, y, h + r);
    return { x: a.x, y: a.y, r: Math.max(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(c.x - a.x, c.y - a.y)), k };
  }
  renderVoid(v: VoidView, paintHero: (canvas: HTMLCanvasElement) => void): VoidScene {
    const s = this.voidScene ??= new VoidScene(this.gl, this.shadowU.uNoise.value, glyphAtlas());
    s.render(v, this.W, this.H, this.canvas.width, this.canvas.height, paintHero);
    return s;
  }

  // ---------------------------------------------------------------- 虚空斗法的背景
  private bdTarget: WebGLRenderTarget | null = null;
  private bdScene: Scene | null = null; private bdMat: ShaderMaterial | null = null; private bdCam: OrthographicCamera | null = null;
  private backdropOn = false;
  /**
   * 虚空里斗法：先把星渊与诸界（同一套虚空画面，人物不画）画进一张图，这一帧的立体场景画之前把它铺满底下。
   * 斗法场没有地面，所以台面以外看到的就是它——和交手前、交手后看到的是同一个画面。
   */
  renderVoidBackdrop(v: VoidView): VoidScene {
    const pw = this.canvas.width, ph = this.canvas.height;
    if (!this.bdTarget || this.bdTarget.width !== pw || this.bdTarget.height !== ph) {
      this.bdTarget?.dispose();
      this.bdTarget = new WebGLRenderTarget(pw, ph, { depthBuffer: false, generateMipmaps: false });
      this.bdTarget.texture.minFilter = this.bdTarget.texture.magFilter = LinearFilter;
    }
    if (!this.bdScene) {
      this.bdMat = new ShaderMaterial({ depthTest: false, depthWrite: false, uniforms: { uTex: { value: null } },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }`,
        fragmentShader: `uniform sampler2D uTex; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(uTex, vUv).rgb, 1.0); }` });
      this.bdScene = new Scene(); this.bdCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.bdScene.add(Object.assign(new Mesh(new PlaneGeometry(1, 1), this.bdMat), { frustumCulled: false }));
    }
    const s = this.voidScene ??= new VoidScene(this.gl, this.shadowU.uNoise.value, glyphAtlas());
    s.render(v, this.W, this.H, pw, ph, () => { /* 人物在立体场景里画 */ }, this.bdTarget);
    this.bdMat!.uniforms.uTex.value = this.bdTarget.texture;
    this.backdropOn = true;
    return s;
  }
  /** 这一帧不垫虚空的背景（每帧开头由调用方决定） */
  clearBackdrop(): void { this.backdropOn = false; }

  dispose() {
    this.voidScene?.dispose(); this.worldClouds?.dispose(); this.bdTarget?.dispose(); this.bdMat?.dispose();
    this.canvas.removeEventListener('webglcontextrestored', this.restoreStaticAtlas);
    this.buildings.dispose(); this.sectFx.dispose(); this.zhenWalls.dispose(); this.terrainFalls?.dispose(); this.tunnelBlades?.dispose();
    { const I = this.passage?.iris; if (I) { I.world.dispose(); I.tube.dispose(); I.mat.dispose(); } }   // 收官返工：甬道洞口的两张离屏图
    this.warmRT?.dispose();
    this.target.dispose();
    this.shadowTarget?.depthTexture?.dispose(); this.shadowTarget?.dispose(); this.shadowBbMat?.dispose(); this.shadowDepthMat.dispose(); this.shadowRoomMat?.dispose(); this.shadowTerrainMat.dispose();
    this.workTex.dispose();
    this.staticAtlas?.dispose(); this.sceneryAtlas?.dispose();
    this.bb.geometry.dispose(); this.bbMat.dispose(); if (this.bbAdd) { this.bbAdd.geometry.dispose(); (this.bbAdd.material as ShaderMaterial).dispose(); }
    this.invalidateTerrain();
    this.groundLayer.dispose();
    this.gl.dispose();
  }
}
