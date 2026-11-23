// 体积云：罩在一界大陆面上方的一层有厚度的云海。
//
// 做法是业界通行的体积云画法（《地平线》《星际公民》一路的思路，这里自己实现）：
//   密度场——云不是贴图也不是网格，是空间里每一点「有多浓」的一个函数：
//       大形：低频的 Perlin-Worley 噪声（平滑噪声被细胞噪声撑出一个个鼓包）；
//       云量：一张二维的「天气图」定哪里有云、有多少（和地面上的云影是同一个函数，对得上），再被一层中等大小的细胞打散成一朵朵；
//       云型：按高度的浓淡曲线——层积云矮而平、积云高而鼓，由天气图的另一个通道在两者之间过渡；
//       絮边：高频的 Worley 噪声侵蚀边缘——底部啃成丝絮，顶部啃成花椰菜似的小鼓包。
//   光照——沿视线一步步穿过云层累积；每一步再朝太阳走几步，看前面挡了多厚的云：
//       多重散射：光在云里反复弹跳，用「几档逐档衰减得更慢、方向性更弱的光」来近似，云的内部才是柔和发亮而不是死黑；
//       相位：前后两瓣（水滴既往前散也往回散）；
//       糖粉效应：朝光的薄边反而偏暗，鼓包之间的褶皱就显出来；
//       环境光：顶上映着天的青白，底下偏灰。
//   大气——离得越远，云越融进空气的颜色里。
//   远近——读场景的深度，视线撞到山就停，所以山峰会从云海里冒出来。
// 只画脚下那一界（从贴地到巡航高度全程）。按画面的六成多分辨率画，再放大合进画面；帧时间吃紧时自动降一档。
// 两张立体噪声（大形 64³、絮边 32³）现场算（分片，每片几毫秒），不占包体。
import {
  Scene, OrthographicCamera, Mesh, PlaneGeometry, ShaderMaterial, WebGLRenderTarget, Data3DTexture, Vector2, Vector3, Vector4, LinearFilter, RepeatWrapping,
  RGBAFormat, UnsignedByteType, CustomBlending, OneFactor, OneMinusSrcAlphaFactor, type Texture, type WebGLRenderer, type PerspectiveCamera,
} from 'three';

function mix32(v: number) { v = Math.imul(v ^ v >>> 16, 0x7feb352d); v = Math.imul(v ^ v >>> 15, 0x846ca68b); return (v ^ v >>> 16) >>> 0; }
const h3 = (x: number, y: number, z: number, s: number) => mix32(Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791) ^ s) / 4294967296;
/** 可平铺的细胞噪声（离最近的种子点越近越亮）：f 是一个周期里有几格 */
function worley(px: number, py: number, pz: number, f: number, seed: number): number {
  const x = px * f, y = py * f, z = pz * f, ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let best = 9;
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = ix + dx, cy = iy + dy, cz = iz + dz, wx = ((cx % f) + f) % f, wy = ((cy % f) + f) % f, wz = ((cz % f) + f) % f;
    const ex = cx + h3(wx, wy, wz, seed) - x, ey = cy + h3(wx, wy, wz, seed + 1) - y, ez = cz + h3(wx, wy, wz, seed + 2) - z;
    const d = ex * ex + ey * ey + ez * ez; if (d < best) best = d;
  }
  return 1 - Math.min(1, Math.sqrt(best));
}
/** 可平铺的平滑噪声 */
function vnoise(px: number, py: number, pz: number, f: number, seed: number): number {
  const x = px * f, y = py * f, z = pz * f, ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const s = (t: number) => t * t * (3 - 2 * t), fx = s(x - ix), fy = s(y - iy), fz = s(z - iz);
  const g = (a: number, b: number, c: number) => h3(((ix + a) % f + f) % f, ((iy + b) % f + f) % f, ((iz + c) % f + f) % f, seed);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(l(l(g(0, 0, 0), g(1, 0, 0), fx), l(g(0, 1, 0), g(1, 1, 0), fx), fy), l(l(g(0, 0, 1), g(1, 0, 1), fx), l(g(0, 1, 1), g(1, 1, 1), fx), fy), fz);
}
const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
/**
 * 分片算一张立体噪声，每 yield 一次算完一层。
 * shape（64³）：红＝Perlin-Worley（大形），绿蓝透＝三档由粗到细的细胞噪声（用来把大形撑鼓）；
 * detail（32³）：红绿蓝＝三档更细的细胞噪声（啃边缘）。
 */
function* volumeSteps(kind: 'shape' | 'detail'): Generator<void, { data: Uint8Array; size: number }, void> {
  const S = kind === 'shape' ? 64 : 32, data = new Uint8Array(S * S * S * 4);
  for (let z = 0; z < S; z++) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S, v = (y + 0.5) / S, w = (z + 0.5) / S, i = ((z * S + y) * S + x) * 4;
      if (kind === 'shape') {
        const w3 = worley(u, v, w, 3, 11), w6 = worley(u, v, w, 6, 23), w12 = worley(u, v, w, 12, 37), w24 = worley(u, v, w, 24, 53);
        const f0 = w3 * 0.625 + w6 * 0.25 + w12 * 0.125, f1 = w6 * 0.625 + w12 * 0.25 + w24 * 0.125, f2 = w12 * 0.75 + w24 * 0.25;
        const pn = Math.max(0, Math.min(1, ((vnoise(u, v, w, 4, 71) * 0.5 + vnoise(u, v, w, 8, 83) * 0.3 + vnoise(u, v, w, 16, 97) * 0.2) - 0.22) / 0.56));
        data[i] = byte(f0 + pn * (1 - f0)); data[i + 1] = byte(f0); data[i + 2] = byte(f1); data[i + 3] = byte(f2);
      } else {
        const a = worley(u, v, w, 2, 131), b = worley(u, v, w, 4, 149), c = worley(u, v, w, 8, 163);
        data[i] = byte(a * 0.625 + b * 0.25 + c * 0.125); data[i + 1] = byte(b * 0.7 + c * 0.3); data[i + 2] = byte(c); data[i + 3] = 255;
      }
    }
    yield;
  }
  return { data, size: S };
}
function volumeTexture(v: { data: Uint8Array; size: number }): Data3DTexture {
  const tex = new Data3DTexture(v.data, v.size, v.size, v.size);
  tex.format = RGBAFormat; tex.type = UnsignedByteType; tex.minFilter = tex.magFilter = LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = RepeatWrapping; tex.unpackAlignment = 1; tex.needsUpdate = true;
  return tex;
}

const PASS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
// 天气图：这一界的大陆面上每一处有多少云（红）、离边缘多远（绿，靠边渐无）、是哪种云（蓝：小＝层积云，大＝积云）
const COVER_FS = `
uniform sampler2D uNoise; uniform vec4 uA; uniform vec4 uO; varying vec2 vUv;
vec4 soft(vec2 uv) { vec2 p = uv * 256.0 - 0.5, f = fract(p); f = f * f * (3.0 - 2.0 * f); return texture2D(uNoise, (floor(p) + f + 0.5) / 256.0); }
float cloudAt(vec2 p) { return soft(p).r * 0.5 + soft(p * 2.3 + 0.4).g * 0.28 + soft(p * 5.1 + 0.9).b * 0.14 + soft(p * 11.0 + 0.2).a * 0.08; }
void main() {
  vec2 l = vec2((vUv.x - 0.5) * 2.0 * uA.x, (0.5 - vUv.y) * 2.0 * uA.y);
  float th = atan(l.y / uA.y, l.x / uA.x);
  float s = uO.x > 0.5 ? pow(pow(abs(cos(th)), 6.0) + pow(abs(sin(th)), 6.0), -1.0 / 6.0) : 1.0 + 0.09 * sin(3.0 * th + uO.y) + 0.055 * sin(5.0 * th + uO.z) + 0.035 * sin(9.0 * th + uO.w);
  float q = length(l / uA.xy) / s;
  vec2 cu = l * uA.z + vec2(uA.w * 0.00022, uA.w * 0.00009);
  gl_FragColor = vec4(cloudAt(cu), 1.0 - smoothstep(0.84, 0.97, q), cloudAt(cu * 0.7 + 3.71), 1.0);
}`;
const MARCH_FS = `
precision highp sampler3D;
uniform sampler3D uVol; uniform sampler3D uDet; uniform sampler2D uCov; uniform sampler2D uDepth;
uniform vec3 uCamPos; uniform vec3 uCamF; uniform vec3 uCamR; uniform vec3 uCamU; uniform vec4 uProj;
uniform vec4 uRealm; uniform vec4 uSlab; uniform vec4 uAnim; uniform vec3 uTint; uniform vec4 uQ;
varying vec2 vUv;
uniform vec3 uLight; uniform vec4 uMisc;
float remap(float v, float a, float b, float c, float d) { return c + clamp((v - a) / (b - a), 0.0, 1.0) * (d - c); }
// 随高度的浓淡：层积云矮而平（kind 小），积云高而鼓（kind 大）
float profile(float h, float kind) {
  float low = smoothstep(0.0, 0.1, h) * (1.0 - smoothstep(0.28, 0.52, h));
  float tall = smoothstep(0.0, 0.12, h) * (1.0 - smoothstep(0.55, 0.98, h));
  return mix(low, tall, kind);
}
// 这一点的云有多浓（0..1）。fine＝再用细的噪声啃一遍边缘（算受光时用粗的就够）
float dens(vec3 p, bool fine) {
  float hf = (p.y - uSlab.x) / (uSlab.y - uSlab.x);
  if (hf <= 0.0 || hf >= 1.0) return 0.0;
  vec4 wx = texture2D(uCov, vec2(0.5 + (p.x - uRealm.x) / (2.0 * uRealm.z), 0.5 - (p.z - uRealm.y) / (2.0 * uRealm.w)));
  float cov = max(smoothstep(uSlab.z - 0.07, uSlab.z + 0.24, wx.r), uMisc.w) * wx.g * uMisc.x;
  if (cov <= 0.01) return 0.0;
  vec3 q = vec3(p.x - uRealm.x, p.y - uSlab.x, p.z - uRealm.y) * uAnim.y + vec3(uAnim.x * 0.0026, 0.0, uAnim.x * 0.0011);
  // 大形：Perlin-Worley 被三档细胞噪声撑鼓
  vec4 n = texture(uVol, q);
  float base = remap(n.r, n.g * 0.625 + n.b * 0.25 + n.a * 0.125 - 1.0, 1.0, 0.0, 1.0);
  // 一层中等大小的细胞：成片的云被它打散成一朵朵（朵与朵之间留出缝），每一朵拱多高也由它定——云海才有一座座高低错落的云塔
  float cell = smoothstep(0.25, 0.8, texture(uVol, vec3(q.xz * 0.21, 0.31)).g);
  base *= profile(hf / (0.4 + 0.72 * cell), smoothstep(0.34, 0.66, wx.b));
  cov = clamp(cov * (0.5 + 0.8 * cell), 0.0, 1.0);
  float d = remap(base, 1.0 - cov, 1.0, 0.0, 1.0) * cov;
  if (d <= 0.0) return 0.0;
  if (fine) {
    // 絮边：底部啃成丝絮，往上渐渐反过来、啃成一个个小鼓包
    vec3 dn = texture(uDet, q * 3.9 + vec3(0.0, uAnim.x * 0.002, 0.0)).rgb;
    float hi = dn.r * 0.625 + dn.g * 0.25 + dn.b * 0.125;
    d = remap(d, mix(hi, 1.0 - hi, clamp(hf * 4.0, 0.0, 1.0)) * 0.24 * uQ.z, 1.0, 0.0, 1.0);
  }
  return d;
}
float hg(float mu, float g) { float g2 = g * g; return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * mu, 1.5); }
void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 rd = normalize(uCamF + uCamR * ndc.x * uProj.x + uCamU * ndc.y * uProj.y);
  if (rd.y > -0.0005) { gl_FragColor = vec4(0.0); return; }
  float tin = max(0.0, (uSlab.y - uCamPos.y) / rd.y), tout = (uSlab.x - uCamPos.y) / rd.y;
  // 视线撞到山、底座就停：山峰从云里冒出来
  float z = texture2D(uDepth, vUv).x;
  float zv = uProj.z * uProj.w / (uProj.w - z * (uProj.w - uProj.z));
  tout = min(tout, zv / dot(rd, uCamF));
  if (tout <= tin) { gl_FragColor = vec4(0.0); return; }
  float thick = uSlab.y - uSlab.x, sigma = uSlab.w, steps = uQ.x, dt = (tout - tin) / steps;
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)) + uQ.y));
  float t = tin + dt * jitter, T = 1.0, mu = dot(rd, uLight), dim = 1.0 - uAnim.w * 0.66;
  vec3 col = vec3(0.0);
  // 日光偏暖，天光偏青：亮处是暖白、暗处是青灰，不是死黑
  vec3 sunC = mix(vec3(1.0, 0.93, 0.8), uTint, 0.06) * 0.98 * dim;
  vec3 ambHigh = mix(vec3(0.5, 0.62, 0.84), uTint, 0.05) * 0.5 * dim, ambLow = vec3(0.3, 0.36, 0.5) * 0.46 * dim;
  vec3 haze = vec3(0.6, 0.7, 0.86) * dim;
  for (int i = 0; i < 64; i++) {
    if (float(i) >= steps || T < 0.015) break;
    vec3 p = uCamPos + rd * t;
    float d = dens(p, true);
    if (d > 0.002) {
      // 朝太阳走几步（步子越迈越大）：前面挡了多厚的云
      float tau = 0.0, ls = thick * 0.04, at = 0.0;
      for (int j = 0; j < 4; j++) { float w = ls * (1.0 + float(j) * 1.15); at += w; tau += dens(p + uLight * (at - w * 0.5), false) * w; }
      tau *= sigma;
      // 多重散射：三档，逐档衰减得更慢、方向性更弱
      float sun = 0.0, ka = 1.0, kb = 1.0, kc = 1.0;
      for (int k = 0; k < 3; k++) { sun += kb * mix(hg(mu, 0.75 * kc), hg(mu, -0.3 * kc), 0.5) * exp(-tau * ka); ka *= 0.38; kb *= 0.55; kc *= 0.5; }
      // 糖粉：朝光的薄边偏暗，鼓包之间的褶皱显出来
      sun *= mix(1.0, (1.0 - exp(-(tau + d * 0.6) * 2.4)) * 1.7, 0.5 * smoothstep(-0.1, 0.7, mu));
      float hf = (p.y - uSlab.x) / thick;
      vec3 lit = sunC * sun + mix(ambLow, ambHigh, hf) * (0.4 + 0.6 * exp(-tau * 0.3));
      // 大气：越远越融进空气的颜色
      lit = mix(lit, haze, (1.0 - exp(-t / (thick * 26.0))) * 0.55 * uMisc.y);
      float a = 1.0 - exp(-d * dt * sigma * uMisc.z);
      col += T * a * lit; T *= 1.0 - a;
    }
    t += dt;
  }
  gl_FragColor = vec4(col, 1.0 - T) * uAnim.z;
}`;
// 放大合进画面：四个点取匀一下，把逐像素错开的步子留下的颗粒抹掉
const BLEND_FS = `uniform sampler2D uTex; uniform vec2 uPx; varying vec2 vUv;
void main() { gl_FragColor = (texture2D(uTex, vUv + uPx * vec2(0.5, 0.5)) + texture2D(uTex, vUv + uPx * vec2(-0.5, 0.5)) + texture2D(uTex, vUv + uPx * vec2(0.5, -0.5)) + texture2D(uTex, vUv + uPx * vec2(-0.5, -0.5))) * 0.25; }`;

export interface CloudDeck {
  /** 这一界相对人物的水平位置、东西 / 南北的半径、大陆面的高度 */
  x: number; z: number; rx: number; ry: number; ground: number;
  /** 云底、云顶离大陆面多高；云量的门槛、天气图的取样比例；这一界的轮廓（是否人界、三个相位） */
  base: number; top: number; threshold: number; scale: number; outline: [number, number, number, number];
  tint: readonly number[];
  /** 时间、整体的不透明度、夜色 */
  time: number; fade: number; night: number;
  /** 云量再乘几成（低云随天气增减）；噪声一个周期有多宽（不给＝云厚的 1.7 倍）；融进大气色的程度；太阳在哪个方向 */
  cover?: number; tile?: number; haze?: number; light?: readonly number[];
  /** 浓度再乘几倍（低云稀疏，每一朵要更实）；云量的保底（天气图上晴空的地方也留几朵） */
  dense?: number; floor?: number;
}

/** 贴近地面的那层低云（界内单位，离地的高度）：高空飞行时在脚下成云海；低飞、走路时不显示 */
export const LOW_CLOUD = { base: 60, top: 285, tile: 1500, showFrom: 150, showFull: 290, dense: 2.6, floor: 0.72 } as const;
/** 这一界的天气图参数：云量的门槛、取样比例（每个虚空单位）、轮廓——天外的云、界内的低云、地面的云影都用这一套 */
export function realmWeather(r: { kind: string; seed: number }): { threshold: number; scale: number; outline: [number, number, number, number] } {
  const home = r.kind === 'human';
  return { threshold: home ? 0.47 : 0.53, scale: home ? 0.0000042 : 0.0000075,
    outline: [home ? 1 : 0, (r.seed & 255) / 255 * 6.283, ((r.seed >>> 8) & 255) / 255 * 6.283, ((r.seed >>> 16) & 255) / 255 * 6.283] };
}
/** 两张立体噪声大家共用（天外的高云、低云、界内的低云），只算一次 */
const VOL: { shape: Data3DTexture | null; detail: Data3DTexture | null; jobs: (Generator<void, { data: Uint8Array; size: number }, void> | null)[] | null } = { shape: null, detail: null, jobs: null };

export class VoidClouds {
  private readonly quad = new Scene(); private readonly flat = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly mesh: Mesh;
  private readonly cover: ShaderMaterial; private readonly march: ShaderMaterial; private readonly blend: ShaderMaterial;
  private readonly coverTarget: WebGLRenderTarget; private marchTarget: WebGLRenderTarget | null = null;
  private frame = 0; private slow = 0; private distant = false;
  /** 画多细：分辨率是画面的几成、沿视线走几步。帧时间吃紧时自动降一档 */
  private scale = 0.66; private steps = 48;

  /** quality：画多细（分辨率是画面的几成、沿视线走几步）；不给用最细的一档 */
  constructor(private readonly gl: WebGLRenderer, noise: Texture, quality?: { scale: number; steps: number }) {
    if (quality) { this.scale = quality.scale; this.steps = quality.steps; }
    this.cover = new ShaderMaterial({ depthTest: false, depthWrite: false, vertexShader: PASS, fragmentShader: COVER_FS,
      uniforms: { uNoise: { value: noise }, uA: { value: new Vector4() }, uO: { value: new Vector4() } } });
    this.march = new ShaderMaterial({ depthTest: false, depthWrite: false, vertexShader: PASS, fragmentShader: MARCH_FS,
      uniforms: { uVol: { value: null }, uDet: { value: null }, uCov: { value: null }, uDepth: { value: null }, uCamPos: { value: new Vector3() }, uCamF: { value: new Vector3() }, uCamR: { value: new Vector3() }, uCamU: { value: new Vector3() },
        uProj: { value: new Vector4() }, uRealm: { value: new Vector4() }, uSlab: { value: new Vector4() }, uAnim: { value: new Vector4() }, uTint: { value: new Vector3(1, 1, 1) }, uQ: { value: new Vector4(48, 0, 0, 0) }, uLight: { value: new Vector3(-0.42, 0.66, 0.62) }, uMisc: { value: new Vector4(1, 1, 0, 0) } } });
    // 合进画面：云的颜色已经乘过不透明度
    this.blend = new ShaderMaterial({ depthTest: false, depthWrite: false, vertexShader: PASS, fragmentShader: BLEND_FS, transparent: true,
      blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: OneFactor, blendDstAlpha: OneMinusSrcAlphaFactor,
      uniforms: { uTex: { value: null }, uPx: { value: new Vector2() } } });
    this.mesh = new Mesh(new PlaneGeometry(2, 2), this.cover); this.mesh.frustumCulled = false; this.quad.add(this.mesh);
    this.coverTarget = new WebGLRenderTarget(512, 512, { depthBuffer: false, generateMipmaps: false });
    this.coverTarget.texture.minFilter = this.coverTarget.texture.magFilter = LinearFilter;
  }

  /** 两张立体噪声算好了没有：没好就接着算几毫秒 */
  ready(budgetMs = 5): boolean {
    if (VOL.shape && VOL.detail) return true;
    const jobs = VOL.jobs ??= [volumeSteps('detail'), volumeSteps('shape')], t0 = performance.now();
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      while (job && jobs[i] && performance.now() - t0 < budgetMs) {
        const r = job.next();
        if (r.done) { const tex = volumeTexture(r.value); if (r.value.size === 64) VOL.shape = tex; else VOL.detail = tex; jobs[i] = null; }
      }
    }
    return !!VOL.shape && !!VOL.detail;
  }
  compile(): void { for (const m of [this.cover, this.march, this.blend]) { this.mesh.material = m; this.gl.compile(this.quad, this.flat); } }

  /**
   * 把云画进一张小图（颜色已乘不透明度）。depth 是场景的深度图，cam 是场景的镜头，pw / ph 是画布的像素尺寸。
   * 画完后用 composite() 合进当前的画布。没准备好或不必画时返回 false。
   */
  render(d: CloudDeck, cam: PerspectiveCamera, depth: Texture, pw: number, ph: number, dt: number): boolean {
    if (d.fade <= 0.004 || !this.ready(3)) return false;
    const gl = this.gl;
    this.frame++;
    // 帧时间吃紧（连着半秒多都超过三十毫秒）就降一档
    if (dt > 0.03) { if (++this.slow > 36 && this.scale > 0.4) { this.scale = 0.4; this.steps = 28; } } else this.slow = Math.max(0, this.slow - 2);
    // 离得远了（升到高处），云在画面上很小：分辨率和步数都降一档（带一点回差，免得在临界处来回换）
    const tan = Math.tan(cam.fov * Math.PI / 360), thick = d.top - d.base;
    const dist = Math.max(1, (cam.position.y - (d.ground + d.top)) * Math.SQRT2), size = ph / (2 * dist * tan) * thick;   // 云层的厚度在画面上占多少像素
    if (this.distant ? size > 34 : size < 26) this.distant = !this.distant;
    const scale = this.distant ? Math.min(this.scale, 0.45) : this.scale, steps = this.distant ? Math.min(this.steps, 30) : this.steps;
    const w = Math.max(2, Math.round(pw * scale)), h = Math.max(2, Math.round(ph * scale));
    if (!this.marchTarget || this.marchTarget.width !== w || this.marchTarget.height !== h) {
      this.marchTarget?.dispose();
      this.marchTarget = new WebGLRenderTarget(w, h, { depthBuffer: false, generateMipmaps: false });
      this.marchTarget.texture.minFilter = this.marchTarget.texture.magFilter = LinearFilter;
    }
    // 天气图
    (this.cover.uniforms.uA.value as Vector4).set(d.rx, d.ry, d.scale, d.time);
    (this.cover.uniforms.uO.value as Vector4).fromArray(d.outline);
    this.mesh.material = this.cover; gl.setRenderTarget(this.coverTarget); gl.render(this.quad, this.flat);
    // 沿视线走
    const U = this.march.uniforms, e = cam.matrixWorld.elements;
    U.uVol.value = VOL.shape; U.uDet.value = VOL.detail; U.uCov.value = this.coverTarget.texture; U.uDepth.value = depth;
    (U.uCamPos.value as Vector3).copy(cam.position);
    (U.uCamR.value as Vector3).set(e[0], e[1], e[2]); (U.uCamU.value as Vector3).set(e[4], e[5], e[6]); (U.uCamF.value as Vector3).set(-e[8], -e[9], -e[10]);
    (U.uProj.value as Vector4).set(tan * cam.aspect, tan, cam.near, cam.far);
    (U.uRealm.value as Vector4).set(d.x, d.z, d.rx, d.ry);
    (U.uSlab.value as Vector4).set(d.ground + d.base, d.ground + d.top, d.threshold, 44 / thick);
    (U.uAnim.value as Vector4).set(d.time, 1 / (d.tile ?? thick * 1.7), d.fade, d.night);
    (U.uMisc.value as Vector4).set(d.cover ?? 1, d.haze ?? 1, d.dense ?? 1, d.floor ?? 0);
    if (d.light) (U.uLight.value as Vector3).fromArray(d.light as number[]).normalize(); else (U.uLight.value as Vector3).set(-0.42, 0.66, 0.62);
    (U.uTint.value as Vector3).fromArray(d.tint as number[]);
    // 离得远了，絮边的细节比一个像素还小，再取只会闪——按它在画面上有多大渐渐收掉
    const fine = Math.max(0, Math.min(1, size * 0.03 / 2.5));
    (U.uQ.value as Vector4).set(steps, (this.frame % 8) / 8, fine, 0);
    this.mesh.material = this.march; gl.setRenderTarget(this.marchTarget); gl.render(this.quad, this.flat);
    return true;
  }
  /** 把刚画好的云合进当前绑定的画布 */
  composite(): void {
    if (!this.marchTarget) return;
    this.blend.uniforms.uTex.value = this.marchTarget.texture;
    (this.blend.uniforms.uPx.value as Vector2).set(1 / this.marchTarget.width, 1 / this.marchTarget.height);
    this.mesh.material = this.blend; this.gl.render(this.quad, this.flat);
  }
  dispose(): void { this.coverTarget.dispose(); this.marchTarget?.dispose(); this.cover.dispose(); this.march.dispose(); this.blend.dispose(); }
}
