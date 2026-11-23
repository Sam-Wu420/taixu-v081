// 天工试场 1.3.3：浮空的「云上演武台」（立体画面）。
//
// 八角石台悬在高空：台面在 top 这个海拔，台身往下收成一块浮空的山石，插进台下的云海；云海以下才是原来的地形。
// 网格挂在立体画面的地面那一遍（hd.groundScene）里：和地形一起写深度，立板、特效、阴影都按它算；
// 只放在第 1 图层（主相机看、阴影相机不看），不往远在下面的地形上投一大片影子。
//
// three 的类不另外打包一份：从立体画面现成的对象上取构造函数（同一份 three，不会出「两份 three」的毛病）。
// 台面的着色：青石平铺 + 台心阵纹 + 台沿石栏，叠上地贴（人物脚下的影子、选中的光圈、法术的地面效果都在地贴里），
// 再按太阳阴影图受影；大招砸出的坑、地浪（fx3d 的 uDent / uRip）照样陷下去——人站在坑里，台面也跟着陷。

const OCT = Math.SQRT2;
const REPEAT = 1000, LINEAR = 1006, DOUBLE = 2;

// 与 src/hd2d/shadowGlsl.ts 的 SHADOW_FS 一致（阴影图取样）
const SHADOW_FS = `
uniform sampler2D uShadowMap; uniform vec4 uShadowParams; uniform vec3 uShadowTint;
float shadowAt(vec3 sc){
  if (uShadowParams.x <= 0.0 || sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 0.0;
  float t = uShadowParams.z * 1.25, z = sc.z - uShadowParams.y;
  float s = step(texture2D(uShadowMap, sc.xy).r, z) * 2.0;
  s += step(texture2D(uShadowMap, sc.xy + vec2(-t, -t)).r, z); s += step(texture2D(uShadowMap, sc.xy + vec2(t, -t)).r, z);
  s += step(texture2D(uShadowMap, sc.xy + vec2(-t, t)).r, z); s += step(texture2D(uShadowMap, sc.xy + vec2(t, t)).r, z);
  vec2 edge = min(sc.xy, 1.0 - sc.xy);
  return s / 6.0 * smoothstep(0.0, 0.04, min(edge.x, edge.y));
}
vec3 shadowMul(float s){ return mix(vec3(1.0), uShadowTint, s * uShadowParams.x); }`;
// 与 src/hd2d/scene.ts 的 DENT_GLSL 一致（大招砸出的坑、地浪）
const DENT_GLSL = `
uniform vec4 uDent0; uniform vec4 uDent1; uniform vec4 uRip; uniform float uRipR; uniform vec3 uSunTo;
float dentOne(vec2 p, vec4 d){ if (d.w <= 0.0) return 0.0; float q = length(p - d.xy) / d.z; if (q > 1.7) return 0.0; float b = q < 1.0 ? (1.0 - q * q) * (1.0 - q * q) : 0.0; float u = (q - 1.08) / 0.24; return (b - exp(-u * u) * 0.22) * d.w; }
float ripOne(vec2 p){ if (uRip.w <= 0.0) return 0.0; float L = length(p - uRip.xy), u = (L - uRip.z) / 260.0; if (abs(u) > 2.2 || L > uRipR) return 0.0; return -sin(u * 3.14159265) * exp(-u * u) * uRip.w * (1.0 - L / uRipR); }
float dentH(vec2 p){ return dentOne(p, uDent0) + dentOne(p, uDent1) + ripOne(p); }
float dentAt(vec2 p, out float shade){
  shade = 1.0;
  if (uDent0.w + uDent1.w + uRip.w <= 0.0) return 0.0;
  float h = dentH(p);
  float gx = (dentH(p + vec2(12.0, 0.0)) - dentH(p - vec2(12.0, 0.0))) / 24.0, gz = (dentH(p + vec2(0.0, 12.0)) - dentH(p - vec2(0.0, 12.0))) / 24.0;
  vec3 n = normalize(vec3(gx, 1.0, gz));
  shade = clamp(dot(n, uSunTo) / max(uSunTo.y, 0.25), 0.42, 1.45);
  return h;
}`;

// ---------------------------------------------------------------- 台面
const TOP_VS = `
uniform mat4 uShadowMatrix; uniform vec2 uOrigin; uniform vec2 uScale;
varying vec2 vLocal; varying vec2 vDecal; varying vec3 vShadow; varying float vDent;
${DENT_GLSL}
void main(){
  vLocal = position.xz;
  vec4 world = modelMatrix * vec4(position, 1.0);
  world.y -= dentAt(world.xz, vDent);
  vShadow = (uShadowMatrix * world).xyz * 0.5 + 0.5;
  vDecal = (world.xz - uOrigin) * uScale;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
const TOP_FS = `
uniform sampler2D uStone; uniform sampler2D uArray; uniform sampler2D uMap; uniform float uFraction; uniform vec3 uOn; uniform float uR;
varying vec2 vLocal; varying vec2 vDecal; varying vec3 vShadow; varying float vDent;
${SHADOW_FS}
// 八角形的「半径」：|x|≤a、|y|≤a、|x|+|y|≤a√2 合起来就是 max(|x|, |y|, (|x|+|y|)/√2) ≤ a
float octR(vec2 p){ vec2 q = abs(p); return max(max(q.x, q.y), (q.x + q.y) * 0.70710678); }
float band(float d, float at, float w){ return 1.0 - smoothstep(w * 0.5, w * 0.5 + 2.0, abs(d - at)); }
void main(){
  float r = octR(vLocal);
  if (r > uR) discard;
  vec3 base = vec3(0.557, 0.573, 0.541);                                   // #8e928a
  if (uOn.x > 0.5) base = texture2D(uStone, vLocal / 360.0).rgb;            // 青石平铺（一块 360 见方）
  // 台心阵纹（乘法叠一层，浓度 0.28）
  vec2 au = vLocal / uR + 0.5;
  if (uOn.y > 0.5 && au.x >= 0.0 && au.y >= 0.0 && au.x <= 1.0 && au.y <= 1.0) {
    vec4 arr = texture2D(uArray, vec2(au.x, 1.0 - au.y));
    base *= mix(vec3(1.0), arr.rgb, 0.28 * arr.a);
  }
  // 台沿一圈石栏座（#6a6d64，宽 64）、内外描边、内圈界线
  float edge = uR - r;
  base = mix(base, vec3(0.416, 0.427, 0.392), step(edge, 64.0));
  base = mix(base, vec3(0.90, 0.886, 0.824), band(r, uR - 64.0, 6.0) * 0.35);
  base = mix(base, vec3(0.157, 0.165, 0.141), band(r, uR - 1.5, 4.0) * 0.55);
  base = mix(base, vec3(0.235, 0.243, 0.22), band(r, uR * 0.56, 6.0) * 0.35);
  // 地贴：人物脚下的影子、光圈、法术的地面效果
  if (vDecal.x >= 0.0 && vDecal.y >= 0.0 && vDecal.x <= 1.0 && vDecal.y <= 1.0) {
    vec4 c = texture2D(uMap, vec2(vDecal.x, 1.0 - vDecal.y * uFraction));
    base = mix(base, c.rgb, c.a);
  }
  gl_FragColor = vec4(min(base * shadowMul(shadowAt(vShadow)) * vDent, vec3(1.0)), 1.0);
}`;

// ---------------------------------------------------------------- 台身（侧壁 + 往下收的浮空山石）
const BODY_VS = `
varying vec3 vN; varying vec3 vLocal; varying float vDepth;
void main(){
  vN = normal; vLocal = position; vDepth = -position.y;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;
const BODY_FS = `
uniform sampler2D uNoise; uniform vec3 uSunTo; uniform float uWall;
varying vec3 vN; varying vec3 vLocal; varying float vDepth;
float rn(vec2 p){ return texture2D(uNoise, p / 2048.0).r * 0.55 + texture2D(uNoise, p / 512.0).g * 0.3 + texture2D(uNoise, p / 128.0).b * 0.15; }
void main(){
  vec3 n = normalize(vN);
  vec3 w = abs(n); w /= (w.x + w.y + w.z);
  float t = rn(vLocal.zy) * w.x + rn(vLocal.xz) * w.y + rn(vLocal.xy) * w.z;
  // 上沿一段是砌好的台身（青石砌块的横缝），往下是粗糙的山石，越往下越暗、越偏冷
  vec3 dressed = vec3(0.39, 0.40, 0.37) * (0.9 + 0.2 * t);
  float seam = smoothstep(0.85, 1.0, abs(sin(vLocal.y * 0.105)));
  dressed *= 1.0 - 0.18 * seam;
  vec3 rock = mix(vec3(0.24, 0.24, 0.23), vec3(0.55, 0.53, 0.49), smoothstep(0.3, 0.75, t));
  rock *= 0.86 + 0.14 * sin(vLocal.y * 0.03 + t * 6.0);
  vec3 c = mix(dressed, rock, smoothstep(uWall - 10.0, uWall + 30.0, vDepth));
  c = mix(c, vec3(0.62, 0.66, 0.70), smoothstep(400.0, 1300.0, vDepth) * 0.45);
  float lit = clamp(0.45 + 0.75 * max(dot(n, uSunTo), 0.0), 0.35, 1.15);
  gl_FragColor = vec4(min(c * lit, vec3(1.0)), 1.0);
}`;

// ---------------------------------------------------------------- 云海
const CLOUD_VS = `
varying vec2 vLocal; varying vec2 vWorld;
void main(){ vLocal = position.xz; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = mod(w.xz, 8192.0); gl_Position = projectionMatrix * viewMatrix * w; }`;
const CLOUD_FS = `
uniform sampler2D uCloud; uniform sampler2D uNoise; uniform vec4 uP; uniform vec3 uSunTo; uniform float uOn;
// uP = (云图平铺的边长, 漂移 x, 漂移 y, 层：0 = 铺满的云底，1 = 上面零星的云团)；uFade = (开始淡出的半径, 淡完的半径)
uniform vec2 uFade;
varying vec2 vLocal; varying vec2 vWorld;
void main(){
  float L = length(vLocal);
  float fade = 1.0 - smoothstep(uFade.x, uFade.y, L);
  if (fade <= 0.002) discard;
  vec2 p = vWorld + uP.yz;
  float n = texture2D(uNoise, p / 8192.0).r * 0.55 + texture2D(uNoise, p / 2048.0 + 0.31).g * 0.3 + texture2D(uNoise, p / 512.0 + 0.67).b * 0.15;   // 周期都整除 8192，和 vWorld 的取模对得上
  vec4 cl = uOn > 0.5 ? texture2D(uCloud, (vLocal + uP.yz) / uP.x) : vec4(1.0, 1.0, 1.0, n);
  float sun = 0.84 + 0.16 * uSunTo.y;
  if (uP.w < 0.5) {
    // 云底：整片铺满（把下面的山谷、树、城都盖住），云图的团块叠出起伏，厚处白、薄处灰蓝
    vec3 base = mix(vec3(0.70, 0.74, 0.78), vec3(0.86, 0.88, 0.89), smoothstep(0.32, 0.72, n));
    vec3 c = mix(base, mix(base, vec3(0.97, 0.97, 0.96), 0.85), cl.a * smoothstep(0.25, 0.65, n));
    gl_FragColor = vec4(c * sun * fade, fade);
  } else {
    // 上层：零星几团（不挡台面，只贴着台身底下飘）
    float a = smoothstep(0.52, 0.74, n) * cl.a * 0.75 * fade;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vec3(0.96, 0.96, 0.95) * sun * a, a);
  }
}`;

/** 浮空台身的网格：八角侧壁（高 wall）+ 往下收成一块山石（两圈收口 + 底尖，顶点按哈希错开，看着不是规整的锥） */
function bodyGeometry(BufferGeometry, Attr, a, wall, depth) {
  const pos = [], idx = [];
  const ring = (r, y, jitter, seed) => {
    const start = pos.length / 3;
    for (let i = 0; i < 16; i++) {
      // 八角形的 8 个角 + 8 条边的中点（让下面的山石边缘有起伏）
      const k = i / 2, j = Math.floor(k), f = k - j;
      const ang = (j + 0.5) / 8 * Math.PI * 2, ang2 = (j + 1.5) / 8 * Math.PI * 2;
      const R = r * OCT / Math.sqrt(2) / Math.cos(Math.PI / 8);
      let x = Math.cos(ang) * R * (1 - f) + Math.cos(ang2) * R * f, z = Math.sin(ang) * R * (1 - f) + Math.sin(ang2) * R * f;
      const h = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453, rnd = h - Math.floor(h);
      const s = 1 + (rnd - 0.5) * jitter; x *= s; z *= s;
      pos.push(x, y - rnd * jitter * 160, z);
    }
    return start;
  };
  const strip = (s0, s1) => { for (let i = 0; i < 16; i++) { const a0 = s0 + i, a1 = s0 + (i + 1) % 16, b0 = s1 + i, b1 = s1 + (i + 1) % 16; idx.push(a0, a1, b0, a1, b1, b0); } };   // 逆时针朝外
  // 台身：两圈同样大的八角（上沿、下沿），不错开
  const r0 = ring(a, 0, 0, 1), r1 = ring(a, -wall, 0, 2);
  const r2 = ring(a * 0.82, -wall - depth * 0.28, 0.16, 3), r3 = ring(a * 0.46, -wall - depth * 0.68, 0.3, 4);
  strip(r0, r1); strip(r1, r2); strip(r2, r3);
  const tip = pos.length / 3; pos.push(a * 0.06, -wall - depth, -a * 0.04);
  for (let i = 0; i < 16; i++) idx.push(r3 + i, r3 + (i + 1) % 16, tip);
  const g = new BufferGeometry();
  g.setAttribute('position', new Attr(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** 台面：外接方形里铺一张细网格（大招砸坑时要陷下去），片元里按八角形裁掉角上 */
function topGeometry(BufferGeometry, Attr, a, n) {
  const pos = [], idx = [], s = a * 2 / n;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) pos.push(-a + i * s, 0, -a + j * s);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const p = j * (n + 1) + i; idx.push(p, p + n + 1, p + 1, p + 1, p + n + 1, p + n + 2); }
  const g = new BufferGeometry(); g.setAttribute('position', new Attr(new Float32Array(pos), 3)); g.setIndex(idx); return g;
}
function planeGeometry(BufferGeometry, Attr, R) {
  const g = new BufferGeometry();
  g.setAttribute('position', new Attr(new Float32Array([-R, 0, -R, R, 0, -R, -R, 0, R, R, 0, R]), 3));
  g.setIndex([0, 2, 1, 1, 2, 3]); return g;
}

/**
 * 在立体画面里建浮空演武台。hd 是 renderer.hd；at = 台心；top = 台面海拔；cloudY = 云底海拔；a = 八角内切半径；far = 云海半径。
 * images = { stone, array, clouds }（Image，可能还没载完：每帧 update 时补上）。建不起来（立体画面的内部结构变了）返回 null。
 */
export function createSkyArena(hd, { x, y, top, cloudY, a, far, images }) {
  const ground = hd?.groundScene, U = hd?.shadowU, decal = hd?.groundLayer?.decalMat?.uniforms, bb = hd?.bb;
  if (!ground || !hd.scene || !U || !decal || !bb || !hd.bbMat || !hd.workTex) return null;
  const MeshC = Object.getPrototypeOf(bb.constructor.prototype).constructor;            // InstancedMesh → Mesh
  const GeoC = Object.getPrototypeOf(bb.geometry.constructor.prototype).constructor;    // PlaneGeometry → BufferGeometry
  const AttrC = bb.geometry.getAttribute('position').constructor;                         // Float32BufferAttribute
  const MatC = hd.bbMat.constructor, TexC = hd.workTex.constructor;                       // ShaderMaterial、CanvasTexture
  if (typeof MeshC !== 'function' || typeof GeoC !== 'function' || !GeoC.prototype.setAttribute) return null;
  const wall = 140, depth = Math.max(700, top - cloudY + 520);
  const made = [], texs = [];
  const tex = (im) => { const t = new TexC(im); t.wrapS = t.wrapT = REPEAT; t.minFilter = LINEAR; t.magFilter = LINEAR; t.generateMipmaps = false; t.needsUpdate = true; texs.push(t); return t; };
  const ready = (im) => im && im.complete && im.naturalWidth > 0;

  const topMat = new MatC({ vertexShader: TOP_VS, fragmentShader: TOP_FS,
    uniforms: { uShadowMatrix: U.uShadowMatrix, uShadowMap: U.uShadowMap, uShadowParams: U.uShadowParams, uShadowTint: U.uShadowTint,
      uDent0: U.uDent0, uDent1: U.uDent1, uRip: U.uRip, uRipR: U.uRipR, uSunTo: U.uSunTo,
      uOrigin: decal.uOrigin, uScale: decal.uScale, uMap: decal.uMap, uFraction: decal.uFraction,
      uStone: { value: null }, uArray: { value: null }, uOn: { value: [0, 0, 0] }, uR: { value: a } } });
  const bodyMat = new MatC({ vertexShader: BODY_VS, fragmentShader: BODY_FS, side: DOUBLE,
    uniforms: { uNoise: U.uNoise, uSunTo: U.uSunTo, uWall: { value: wall } } });
  const cloudMat = (layer) => new MatC({ vertexShader: CLOUD_VS, fragmentShader: CLOUD_FS, transparent: true, premultipliedAlpha: true, depthWrite: layer === 0, depthTest: true,
    uniforms: { uCloud: { value: null }, uNoise: U.uNoise, uSunTo: U.uSunTo, uOn: { value: 0 }, uP: { value: [1100, 0, 0, layer] }, uFade: { value: [far * 0.8, far] } } });
  const cloud0 = cloudMat(0), cloud1 = cloudMat(1);

  const scene = hd.scene;
  const add = (to, geo, mat, h, order) => {
    const m = new MeshC(geo, mat); m.position.set(x, h, y); m.renderOrder = order; m.frustumCulled = false;
    m.layers.set(1);   // 主相机看（第 0、1 层都开），阴影相机只看第 0 层
    m.updateMatrixWorld(true); to.add(m); made.push([to, m]); return m;
  };
  // 台面、台身算「地面」（进地面深度：后期的神识圈、点光源按台面算）
  add(ground, topGeometry(GeoC, AttrC, a, 96), topMat, top, 0);
  add(ground, bodyGeometry(GeoC, AttrC, a, wall, depth), bodyMat, top, 0);
  // 云海放在立板那一遍里、排在立板之前：写深度，云下的东西被挡住；不进地面深度——
  // 否则神识圈按云面（比台面低八百）去算，圈在云上歪出去一截
  add(scene, planeGeometry(GeoC, AttrC, far), cloud0, cloudY, 1);
  add(scene, planeGeometry(GeoC, AttrC, far * 0.7), cloud1, cloudY + 230, 1);

  return {
    top, cloudY,
    /** 每帧：补上载完的贴图、云海随时间漂 */
    update(t) {
      const tu = topMat.uniforms, on = tu.uOn.value;
      if (!on[0] && ready(images.stone)) { tu.uStone.value = tex(images.stone); on[0] = 1; }
      if (!on[1] && ready(images.array)) { tu.uArray.value = tex(images.array); on[1] = 1; }
      if (!cloud0.uniforms.uOn.value && ready(images.clouds)) { const c = tex(images.clouds); for (const m of [cloud0, cloud1]) { m.uniforms.uCloud.value = c; m.uniforms.uOn.value = 1; } }
      const p0 = cloud0.uniforms.uP.value, p1 = cloud1.uniforms.uP.value;
      p0[1] = -(t * 14) % 8192; p0[2] = -(t * 5) % 8192;
      p1[1] = -(t * 26) % 8192; p1[2] = -(t * 9) % 8192;
    },
    dispose() {
      for (const [to, m] of made) { to.remove(m); m.geometry.dispose(); }
      for (const mat of [topMat, bodyMat, cloud0, cloud1]) mat.dispose();
      for (const t of texs) t.dispose();
      made.length = 0; texs.length = 0;
    },
  };
}
