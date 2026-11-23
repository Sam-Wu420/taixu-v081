// 无边海的海兽在 HD 场景里的样子（收官 B2）：数据来自 world/seabeast.ts 的 view()，这里只管画。
//
// 为什么不进共享的立板图集：图集一格最大 2040×1600，而且每帧重画画布是性能瓶颈；海魔的头、蛟身、触须、鲸背都比人大十几倍。
// 所以照 hd2d/voidthings.ts 的先例，在 HD 场景里单独挂 three 网格：
//   · 立板（凶鱼、海魔的头、蛟头、船灵）：一块竖着朝镜头的面片，写法照 scene.ts 的立板（uRight、uBoost），水线以下在片元里裁掉；
//   · 带子（触须、蛟身）：沿 seabeast 给的那条曲线生成的带状网格，每帧只改顶点（不重建几何体），水下的部分同样裁掉；
//     身子用「一节」的图沿长度平铺，最后一截换成「尖」或「尾鳍」那张图；
//   · 平铺（鲸背、雷鳐）：一块贴在海面（或高空）上的平面，按朝向转；雷鳐的翅尖在顶点里上下扇。
// 都写深度：人物立板照常压在鲸背上、被蛟头挡住；后期的海面着色只认「露出的地面」，所以这些东西不会被染成海水。
import {
  AlwaysDepth, BufferAttribute, BufferGeometry, DoubleSide, LessEqualDepth, LinearFilter, LinearMipmapLinearFilter, Mesh, PlaneGeometry, RepeatWrapping, Scene, ShaderMaterial, Texture, Vector2, Vector3, Vector4, type WebGLRenderer,
} from 'three';
import type { SeaView, SeaRibbon } from '../world/seabeast';

// 收官 B3：立板加到 56 个——海渊的遗迹（石门、残柱、宝箱）、水下整条画出来的黑影、鬼船上的摊主都走这一池
const POOL = { sprite: 56, ribbon: 16, flat: 8 } as const;
const RIB_N = 28;

const SPRITE_VS = `
uniform vec3 uFoot; uniform vec4 uBox; uniform vec3 uRight; uniform float uBoost; uniform vec2 uScale; uniform vec2 uBack;
varying vec2 vUv; varying float vY0; varying vec4 vC0;
void main(){
  vec2 k = position.xy + 0.5;
  float fx = (k.x - 0.5) * 2.0 * uBox.x * uScale.x, fy = k.y * uBox.y * uScale.y;
  float c = cos(uBox.w), s = sin(uBox.w);
  float rx = fx * c - fy * s, ry = fx * s + fy * c;
  vec3 w = uFoot + uRight * rx + vec3(0.0, (ry + uBox.z) * uBoost, 0.0);
  vY0 = (ry + uBox.z) * uBoost;
  vUv = k;
  // 收官返工：往后挪过的大立板（船身）——没挪之前这一点在哪（拿它和海面的深度比，见片元）
  vC0 = projectionMatrix * viewMatrix * vec4(w + vec3(0.0, uBack.y * uBoost, uBack.x), 1.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
// uA = (透明度, 受击闪白, 辉光, 整个画出来不裁水线)；uTint 乘在贴图上（收官 B3：借现成的图调色）
const SPRITE_FS = `
uniform sampler2D uMap; uniform vec4 uA; uniform vec3 uGlow; uniform vec3 uTint; uniform float uClip; varying vec2 vUv; varying float vY0;
uniform sampler2D uGround; uniform vec3 uGr; varying vec4 vC0;
void main(){
  float vY = vY0 + uClip;   // 收官 B4：往后挪过的大立板，水线按挪之前的位置算
  if (vY < 0.0 && uA.w < 0.5) discard;   // 水线以下裁掉（下半截在水里）；水下的东西整个画出来
  // 收官返工：船身往后挪了 80（站在甲板上的人才不会被判到船身后面），挪过之后水线以上那一截（约两成船高）落到了海面以下、被前面的海面挡掉——
  // 船头底下那一截整个没了，船头的灯和船身之间看上去是一道竖直的缺口。这块立板不再按自己挪过的位置和海面比深度，改按没挪之前的位置和地面（海面）的深度比
  if (uGr.z > 0.5) { float gd = texture2D(uGround, gl_FragCoord.xy / uGr.xy).r; if (gd < vC0.z / vC0.w * 0.5 + 0.5 - 0.00002) discard; }
  vec4 c = texture2D(uMap, vUv);
  float a = c.a * uA.x; if (a < 0.05) discard;
  vec3 col = c.rgb * uTint;
  // 水线上一圈湿亮、带一点水色：像刚从水里探出来（水下的东西没有水线）
  float wl = (1.0 - smoothstep(0.0, 10.0, vY)) * (1.0 - uA.w);
  col = mix(col, col * 0.8 + vec3(0.06, 0.1, 0.12), wl * 0.45) + vec3(0.12, 0.16, 0.17) * wl * wl * 0.35;
  col += uGlow * uA.z * c.a * 0.35;
  col = mix(col, vec3(1.0, 0.97, 0.9), uA.y * 0.6);
  gl_FragColor = vec4(col * a, a);
}`;
// 带子：顶点直接给世界坐标；aZ 是离水面的高度（负的在水下）、aS 沿长度 0–1、aU 平铺坐标、aV 横向 0–1
const RIB_VS = `
attribute float aZ; attribute float aS; attribute float aU; attribute float aV;
varying float vZ; varying float vS; varying float vU; varying float vV;
void main(){ vZ = aZ; vS = aS; vU = aU; vV = aV; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`;
// uP = (尖 / 尾从沿长度的哪里开始, 透明度, 受击闪白, 上下翻转：1 = 贴图的上沿朝天)
const RIB_FS = `
uniform sampler2D uBody; uniform sampler2D uTip; uniform vec4 uP; uniform vec3 uTint; varying float vZ; varying float vS; varying float vU; varying float vV;
void main(){
  if (vZ < 0.0) discard;
  float v = uP.w > 0.5 ? 1.0 - vV : vV;
  // 身子那一节沿长度平铺：取图时两头各让一点（图边上有一线透明），导数按没折回的坐标算，接缝处不出黑线
  vec2 g = vec2(vU * 0.97, v);
  vec4 c = vS >= uP.x ? texture2D(uTip, vec2((vS - uP.x) / (1.0 - uP.x), v)) : textureGrad(uBody, vec2(0.015 + fract(vU) * 0.97, v), dFdx(g), dFdy(g));
  float a = c.a * uP.y; if (a < 0.08) discard;
  vec3 col = c.rgb * uTint;   // 收官 B4：别界的怪借同一张图调色（沙虫、巨藤……）
  float wl = 1.0 - smoothstep(0.0, 14.0, vZ);
  col = mix(col, col * 0.8 + vec3(0.06, 0.1, 0.12), wl * 0.45) + vec3(0.14, 0.18, 0.19) * wl * wl * 0.4;
  col = mix(col, vec3(1.0, 0.95, 0.9), uP.z * 0.5);
  gl_FragColor = vec4(col * a, a);
}`;
// 平铺：uC = (中心 x, 海面高度, 中心 y, 朝向)；uS = (长, 宽, 离水面高度×立板补偿, 扇翅幅度)；uA = (透明度, 海水漫上来, 时间, 震颤)
const FLAT_VS = `
uniform vec4 uC; uniform vec4 uS; uniform vec4 uA; uniform float uE;
varying vec2 vUv; varying vec2 vL;
void main(){
  vec2 k = position.xy + 0.5; vL = position.xy;
  float lx = position.x * uS.x, ly = position.y * uS.y;
  float c = cos(uC.w), s = sin(uC.w);
  float jx = uA.w * sin(uA.z * 53.0) * 6.0, jy = uA.w * cos(uA.z * 47.0) * 4.0;
  float h = uC.y + uS.z;
  // 第五轮返工：海面网格并不平（鲸背底下一圈高低差十几），四周高出来的海面原来把尾鳍、胸鳍盖掉一截（笔直的斜切边）——外圈往上抬过四周最高的海面，背上不动
  h += uE * smoothstep(0.22, 0.42, max(abs(position.x), abs(position.y)));
  // 雷鳐扇翅：翅尖（横向两端）上下摆
  h += uS.w * sin(uA.z * 6.5) * pow(abs(position.y) * 2.0, 2.0) * uS.y * 0.32;
  vec3 w = vec3(uC.x + lx * c - ly * s + jx, h, uC.z + lx * s + ly * c + jy);
  vUv = vec2(1.0 - k.x, k.y);   // 原画头朝左：贴图的左边接在「前方」
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
const FLAT_FS = `
uniform sampler2D uMap; uniform vec4 uA; uniform vec4 uS; uniform vec3 uTint; varying vec2 vUv; varying vec2 vL;
void main(){
  vec4 c = texture2D(uMap, vUv);
  float a = c.a * uA.x;
  // 下潜前海水从四周漫上来：离中心越远越先被淹（淹了的地方化成海色、渐渐透掉）
  float r = length(vL * vec2(1.0, 1.5)) * 2.0;
  float flood = smoothstep(1.15 - uA.y * 1.4, 1.3 - uA.y * 1.4, r + sin(vL.x * 31.0 + uA.z * 2.0) * 0.03);
  vec3 col = c.rgb * 0.95 * uTint;
  col = mix(col, vec3(0.05, 0.1, 0.12), flood * 0.85);
  a *= 1.0 - flood * smoothstep(0.6, 1.0, uA.y);
  // 湿漉漉的边：浮着的鲸背靠水的一圈偏暗、带一点水光
  float rim = smoothstep(0.75, 1.0, r);
  col = mix(col, col * 0.75 + vec3(0.05, 0.09, 0.1), rim * 0.4 * step(uS.w, 0.001));
  if (a < 0.4) discard;
  gl_FragColor = vec4(col, 1.0);
}`;

const ONE3: [number, number, number] = [1, 1, 1], GLOW0: [number, number, number] = [0.5, 0.7, 1];
/** 贴图：按名字懒加载（data URL 来自 gfx/seaTexData.ts） */
class SeaTex {
  private src: Record<string, string> | null = null; private started = false;
  private tex = new Map<string, Texture | null>();
  get ready() { return !!this.src; }
  start() {
    if (this.started || typeof Image === 'undefined') return;
    this.started = true;
    import('../gfx/seaTexData').then((m) => { this.src = m.SEA_SRC; }).catch((e) => console.warn('海兽贴图不可用', e));
  }
  get(key: string, repeat = false): Texture | null {
    const have = this.tex.get(key); if (have !== undefined) return have;
    if (!this.src?.[key]) return null;
    this.tex.set(key, null);
    const im = new Image();
    im.onload = () => {
      const t = new Texture(im); t.minFilter = LinearMipmapLinearFilter; t.magFilter = LinearFilter; t.generateMipmaps = true; t.anisotropy = 4;
      if (repeat) { t.wrapS = RepeatWrapping; }
      t.needsUpdate = true; this.tex.set(key, t);
    };
    im.src = this.src[key];
    return null;
  }
  /** 预热：一组名字都先开始加载 */
  warm(keys: string[]) { for (const k of keys) this.get(k, k.endsWith('arm_0') || k.endsWith('body_0')); }
}

interface Rib { mesh: Mesh; geo: BufferGeometry; mat: ShaderMaterial; pos: Float32Array; z: Float32Array; s: Float32Array; u: Float32Array }

export class SeaThings {
  private tex = new SeaTex();
  private sprites: { mesh: Mesh; mat: ShaderMaterial; own: boolean }[] = [];
  private ribs: Rib[] = [];
  private flats: { mesh: Mesh; mat: ShaderMaterial }[] = [];
  private warmed = false;
  /** 上一帧画了几样（性能读数） */
  stats = { sprites: 0, ribbons: 0, flats: 0, verts: 0, ms: 0 };

  constructor(scene: Scene) {
    this.tex.start();
    const plane = new PlaneGeometry(1, 1);
    for (let i = 0; i < POOL.sprite; i++) {
      const mat = new ShaderMaterial({ vertexShader: SPRITE_VS, fragmentShader: SPRITE_FS, transparent: true, premultipliedAlpha: true, depthWrite: true, depthTest: true, side: DoubleSide,
        uniforms: { uMap: { value: null }, uFoot: { value: new Vector3() }, uBox: { value: new Vector4() }, uRight: { value: new Vector3(1, 0, 0) }, uBoost: { value: 1 }, uScale: { value: new Vector2(1, 1) }, uA: { value: new Vector4(1, 0, 0, 0) }, uGlow: { value: new Vector3(0.5, 0.7, 1) }, uTint: { value: new Vector3(1, 1, 1) }, uClip: { value: 0 },
          uBack: { value: new Vector2() }, uGround: { value: null }, uGr: { value: new Vector3(1, 1, 0) } } });
      const mesh = new Mesh(plane, mat); mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 2.1; scene.add(mesh);
      const S = { mesh, mat, own: false }; this.sprites.push(S);
      mesh.onBeforeRender = (_r, _s, cam) => { const on = S.own && !(cam as { isOrthographicCamera?: boolean }).isOrthographicCamera; (mat.uniforms.uGr.value as Vector3).z = on ? 1 : 0; mat.depthFunc = on ? AlwaysDepth : LessEqualDepth; };
    }
    // 带子：顶点数固定（RIB_N 个截面 × 2），每帧只改数组
    const idx: number[] = [];
    for (let i = 0; i < RIB_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    for (let i = 0; i < POOL.ribbon; i++) {
      const geo = new BufferGeometry(), n = RIB_N * 2;
      const pos = new Float32Array(n * 3), z = new Float32Array(n), s = new Float32Array(n), u = new Float32Array(n), v = new Float32Array(n);
      for (let j = 0; j < n; j++) v[j] = j % 2;
      geo.setAttribute('position', new BufferAttribute(pos, 3)); geo.setAttribute('aZ', new BufferAttribute(z, 1)); geo.setAttribute('aS', new BufferAttribute(s, 1)); geo.setAttribute('aU', new BufferAttribute(u, 1)); geo.setAttribute('aV', new BufferAttribute(v, 1));
      geo.setIndex(idx);
      const mat = new ShaderMaterial({ vertexShader: RIB_VS, fragmentShader: RIB_FS, transparent: true, premultipliedAlpha: true, depthWrite: true, depthTest: true, side: DoubleSide,
        uniforms: { uBody: { value: null }, uTip: { value: null }, uP: { value: new Vector4(0.75, 1, 0, 0) }, uTint: { value: new Vector3(1, 1, 1) } } });
      const mesh = new Mesh(geo, mat); mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 2.05; scene.add(mesh);
      this.ribs.push({ mesh, geo, mat, pos, z, s, u });
    }
    const grid = new PlaneGeometry(1, 1, 16, 8);
    for (let i = 0; i < POOL.flat; i++) {
      const mat = new ShaderMaterial({ vertexShader: FLAT_VS, fragmentShader: FLAT_FS, depthWrite: true, depthTest: true, side: DoubleSide,
        uniforms: { uMap: { value: null }, uC: { value: new Vector4() }, uS: { value: new Vector4() }, uA: { value: new Vector4() }, uTint: { value: new Vector3(1, 1, 1) }, uE: { value: 0 } } });
      const mesh = new Mesh(grid, mat); mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 1.9; scene.add(mesh); this.flats.push({ mesh, mat });
    }
  }

  /** 贴图是不是都能用了（还没好时 seabeast 让海兽照旧走立板图集） */
  get ready() { return this.tex.ready; }

  /**
   * 每帧（hd.render 之前）：把 view 里的东西摆进池子。
   * hd：右方向、立板高度补偿、地面高度、相机位置（带子朝镜头展开要用）
   */
  /** 收官返工：地面（海面）那一遍的深度图（GLStage 的原生纹理，包成 three 的纹理给着色器取） */
  private groundTex: Texture | null = null;
  update(V: SeaView, hd: { rightDir: { x: number; y: number }; boost: number; heightAt: (x: number, y: number) => number; cam: { position: { x: number; y: number; z: number } } },
    ground?: { tex: WebGLTexture; w: number; h: number; gl: WebGLRenderer } | null): void {
    let gt: Texture | null = null;
    if (ground) {
      gt = this.groundTex ??= new Texture();
      const props = ground.gl.properties.get(gt) as { __webglTexture?: WebGLTexture; __webglInit?: boolean };
      props.__webglTexture = ground.tex; props.__webglInit = true;
    }
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    for (const s of this.sprites) s.mesh.visible = false; for (const r of this.ribs) r.mesh.visible = false; for (const f of this.flats) f.mesh.visible = false;
    if (!this.tex.ready) return;
    if (!this.warmed) {
      this.warmed = true;
      const keys: string[] = [];
      for (const b of ['guichi', 'mochu', 'liehai', 'chuanling', 'leiyao']) for (let i = 0; i < 6; i++) keys.push(`sb_${b}_${i}`);
      keys.push('sb_mochu_arm_0', 'sb_mochu_arm_1', 'sb_liehai_body_0', 'sb_liehai_body_1', 'sb_fuhai');
      this.tex.warm(keys);
    }
    const R = hd.rightDir, B = hd.boost;
    let ns = 0, nr = 0, nf = 0, verts = 0;
    // —— 立板
    for (const q of V.sprites) {
      const S = this.sprites[ns]; if (!S) break;
      const tx = this.tex.get(q.key); if (!tx) continue;
      ns++;
      const im = tx.image as { width: number; height: number }, aspect = im.width / im.height;
      const u = S.mat.uniforms;
      u.uMap.value = tx;
      // 收官 B4 / 打磨：船身、祭坛这类「能站上去」的大立板往后挪 80（再按俯角把抬高减回去，画面上位置不变）——
      // 人站在甲板上时立板和船身原来只差十几个单位，深度一抖人就被判到船身后面、只剩一个淡影
      // 只能挪八十：挪多了船身下半截沉到海面以下（被海面挡住）。人的立板朝镜头仰着，抬到甲板那么高时上半身仍会探到竖直的船身后面——这一处要改人物立板的画法（scene.ts），留给画面线
      const back = q.under ? 80 : 0, sinP = Math.sqrt(Math.max(0, 1 - 1 / (B * B)));
      u.uClip.value = back * sinP * B;
      (u.uBack.value as Vector2).set(back, back * sinP);
      // 挪过的船身按没挪之前的位置自己和海面比深度（见 SPRITE_FS），不走普通的深度测试；照样写深度（站在甲板上的人照常压在它前面）
      // （只在主镜头那一遍这样做；阴影那一遍用的是正交的太阳镜头，照常比深度——见构造里的 onBeforeRender）
      S.own = back > 0 && !!gt && !q.noClip;
      u.uGround.value = S.own ? gt : null; (u.uGr.value as Vector3).set(ground?.w ?? 1, ground?.h ?? 1, S.own ? 1 : 0);
      (u.uFoot.value as Vector3).set(q.x, hd.heightAt(q.x, q.y), q.y - back);
      (u.uBox.value as Vector4).set(q.H * aspect / 2, q.H, q.lift - back * sinP, q.rot);
      (u.uRight.value as Vector3).set(R.x, 0, R.y); u.uBoost.value = B;
      (u.uScale.value as Vector2).set(q.sx * -q.face, q.sy);
      (u.uA.value as Vector4).set(q.alpha, q.flash, q.glow, q.noClip ? 1 : 0);
      S.mesh.renderOrder = q.under ? 1.97 : 2.1;   // 收官 B4 / 打磨：原来是 2.02——比立板图集（人，2）还晚画，站在鬼船甲板上的人被后画的船身盖住、几乎看不见；船身要在人之前画   // 收官 B3：船身、鬼船、祭坛先画；站在上面的人（立板图集，2）和摊主在它前面只差十几个单位，深度精度不够时会被后画的船身盖住
      (u.uTint.value as Vector3).set(...(q.tint ?? ONE3)); (u.uGlow.value as Vector3).set(...(q.glowCol ?? GLOW0));
      S.mesh.visible = q.alpha > 0.01;
    }
    // —— 带子
    const cp = hd.cam.position;
    for (const q of V.ribbons) {
      const Rb = this.ribs[nr]; if (!Rb) break;
      const body = this.tex.get(q.kind === 'arm' ? 'sb_mochu_arm_0' : 'sb_liehai_body_0', true), tip = this.tex.get(q.kind === 'arm' ? 'sb_mochu_arm_1' : 'sb_liehai_body_1');
      if (!body || !tip) continue;
      nr++;
      verts += this.layRibbon(Rb, q, hd, B, cp);
      const u = Rb.mat.uniforms;
      u.uBody.value = body; u.uTip.value = tip;
      (u.uP.value as Vector4).set(q.kind === 'arm' ? 0.72 : 0.8, q.alpha, q.flash, q.kind === 'jiao' ? 1 : 0);
      (u.uTint.value as Vector3).set(...(q.tint ?? ONE3));   // 蛟身：背鳍朝天；触须：吸盘那一面朝镜头
      Rb.mesh.visible = q.alpha > 0.01;
    }
    // —— 平铺
    for (const q of V.flats) {
      const F = this.flats[nf]; if (!F) break;
      const tx = this.tex.get(q.key); if (!tx) continue;
      nf++;
      const u = F.mat.uniforms;
      u.uMap.value = tx;
      const hc = hd.heightAt(q.x, q.y);
      (u.uC.value as Vector4).set(q.x, hc, q.y, q.ang);
      // 外圈要抬多少：按整块平面上 5×5 个点的海面取最高，比中心高出多少就抬多少（再垫一点）；飞在高处的雷鳐用不着
      let hm = hc; if (q.z < 60) { const c = Math.cos(q.ang), s = Math.sin(q.ang); for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const lx = a / 4 * q.w, ly = b / 4 * q.h; hm = Math.max(hm, hd.heightAt(q.x + lx * c - ly * s, q.y + lx * s + ly * c)); } }
      u.uE.value = hm > hc ? hm - hc + 4 : 0;
      (u.uS.value as Vector4).set(q.w, q.h, q.z * B, q.flap);
      (u.uA.value as Vector4).set(q.alpha, q.wet, q.t, q.shake);
      (u.uTint.value as Vector3).set(...(q.tint ?? ONE3));
      F.mesh.visible = q.alpha > 0.01;
    }
    this.stats = { sprites: ns, ribbons: nr, flats: nf, verts, ms: typeof performance !== 'undefined' ? performance.now() - t0 : 0 };
  }

  /** 沿曲线铺一条带子：每个截面两个顶点，朝镜头展开（侧向 = 切线 × 指向镜头），只改顶点数组 */
  private layRibbon(Rb: Rib, q: SeaRibbon, hd: { heightAt: (x: number, y: number) => number }, B: number, cp: { x: number; y: number; z: number }): number {
    const n = Math.min(q.n, RIB_N), P = q.pts, W = q.w, pos = Rb.pos, Z = Rb.z, S = Rb.s, U = Rb.u;
    const tipFrom = q.kind === 'arm' ? 0.72 : 0.8, aspect = q.kind === 'arm' ? 520 / 118 : 520 / 278;
    const tile = Math.max(40, 2 * W[0] * aspect);
    // 先算总长与各点的世界坐标（高度 = 海面 + 离水高度 × 立板补偿）
    let L = 0; const cum = this.cum; cum[0] = 0;
    for (let i = 1; i < n; i++) { L += Math.hypot(P[i * 3] - P[i * 3 - 3], P[i * 3 + 1] - P[i * 3 - 2], (P[i * 3 + 2] - P[i * 3 - 1]) * B); cum[i] = L; }
    const sea = hd.heightAt(P[0], P[1]);
    let wTip = 0, px = 0, py = 1, pz = 0;
    for (let i = 0; i < n; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], wy = sea + z * B;
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let tx = P[b * 3] - P[a * 3], ty = (P[b * 3 + 2] - P[a * 3 + 2]) * B, tz = P[b * 3 + 1] - P[a * 3 + 1];
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      let vx = cp.x - x, vy = cp.y - wy, vz = cp.z - y; const vl = Math.hypot(vx, vy, vz) || 1; vx /= vl; vy /= vl; vz /= vl;
      // 侧向 = 切线 × 视线
      let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx; const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
      // 统一朝上：贴图的上沿（背鳍、触须的背）朝天；之后每一截都跟上一截同向，带子不会在中途翻面拧出折痕
      if (i === 0) { if (sy < 0) { sx = -sx; sy = -sy; sz = -sz; } }
      else if (sx * px + sy * py + sz * pz < 0) { sx = -sx; sy = -sy; sz = -sz; }
      px = sx; py = sy; pz = sz;
      const s = L > 0 ? cum[i] / L : i / (n - 1);
      let hw = W[i];
      if (s >= tipFrom) { if (!wTip) wTip = W[i]; hw = wTip * (q.kind === 'arm' ? 1.8 : 1.7); }
      const k = i * 2;
      pos[k * 3] = x - sx * hw; pos[k * 3 + 1] = wy - sy * hw; pos[k * 3 + 2] = y - sz * hw;
      pos[k * 3 + 3] = x + sx * hw; pos[k * 3 + 4] = wy + sy * hw; pos[k * 3 + 5] = y + sz * hw;
      Z[k] = z - sy * hw / B; Z[k + 1] = z + sy * hw / B;
      S[k] = S[k + 1] = s;
      U[k] = U[k + 1] = cum[i] / tile;
    }
    // 没用到的截面（点数少于 RIB_N）：收到最后一点，不出三角形
    for (let i = n; i < RIB_N; i++) { const k = i * 2; for (let j = 0; j < 6; j++) pos[k * 3 + j] = pos[(n * 2 - 1) * 3 + (j % 3)]; Z[k] = Z[k + 1] = -1; S[k] = S[k + 1] = 1; }
    const g = Rb.geo;
    (g.attributes.position as BufferAttribute).needsUpdate = true; (g.attributes.aZ as BufferAttribute).needsUpdate = true;
    (g.attributes.aS as BufferAttribute).needsUpdate = true; (g.attributes.aU as BufferAttribute).needsUpdate = true;
    return n * 2;
  }
  private cum = new Float32Array(RIB_N);

  dispose() {
    for (const s of this.sprites) { s.mesh.removeFromParent(); s.mat.dispose(); }
    for (const r of this.ribs) { r.mesh.removeFromParent(); r.geo.dispose(); r.mat.dispose(); }
    for (const f of this.flats) { f.mesh.removeFromParent(); f.mat.dispose(); }
  }
}
