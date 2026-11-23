// 秘境（石台群）在立体场景里的那一部分：台底倒悬的岩体、石桥的桥身、铁索、台下的云海（或深渊）、罩住整座秘境的篆文界壁。
// 台面本身画在地面贴图上（见 world/mijing.ts 的 drawIslesHD），台面以外的地面是透明的，所以从台沿望下去看得见这些。
// 定稿的概念图：重构v0.57\概念图\秘境（布局 A、首领台 C、界壁 E）。几何体都是代码现造的。
import {
  BufferGeometry, CanvasTexture, CatmullRomCurve3, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, LinearFilter, Mesh, PlaneGeometry,
  RepeatWrapping, Scene, ShaderMaterial, Texture, TubeGeometry, Vector3, Vector4,
} from 'three';

export interface RealmIsle { x: number; y: number; r: number; round: boolean; seed: number; /** 轮廓（world/isleshape.ts）：2 是自然浮岛，台沿挂瀑布 */ shape?: number }
export interface RealmLink { ax: number; ay: number; bx: number; by: number; w: number }
export interface RealmLook {
  /** 台下是什么：云海的亮色与暗色；深渊里透上来的光（没有就是 0） */
  seaLight: [number, number, number]; seaDark: [number, number, number]; glow: [number, number, number, number];
  /** 界壁与篆文的颜色 */
  wall: [number, number, number];
}

const hash = (s: number, k: number) => { let h = Math.imul(s ^ (k * 0x9e3779b1), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// 石台的轮廓在 world/isleshape.ts：逻辑、台面、台底岩体问的是同一个函数
import { isleEdge } from '../world/isleshape';
export { isleEdge };

const ROCK_VS = `varying vec3 vP; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const ROCK_FS = `uniform vec3 uMist; uniform vec4 uGlow; varying vec3 vP;
void main() {
  vec3 n = normalize(cross(dFdx(vP), dFdy(vP)));
  float key = max(0.0, dot(n, normalize(vec3(-0.4, 0.55, 0.72))));
  float d = clamp(-vP.y / 1500.0, 0.0, 1.0);
  // 岩层：横向的深浅带，越往下越暗
  float strata = sin(vP.y * 0.045 + sin(vP.x * 0.004 + vP.z * 0.003) * 2.0);
  vec3 c = mix(vec3(0.60, 0.61, 0.57), vec3(0.34, 0.36, 0.34), smoothstep(0.0, 0.7, d)) * (0.62 + 0.5 * key) * (0.9 + 0.1 * smoothstep(-0.2, 0.6, strata));
  c += uGlow.rgb * uGlow.a * smoothstep(0.25, 1.0, d) * (0.6 + 0.4 * max(0.0, -n.y));   // 深渊里映上来的光
  c = mix(c, uMist, smoothstep(0.45, 1.0, d) * 0.9);                                    // 沉进云里
  gl_FragColor = vec4(c, 1.0);
}`;

export class HdRealm {
  readonly group = new Group();
  private key = '';
  private rocks: Mesh | null = null; private iron: Mesh | null = null;
  /** 自然浮岛台沿的瀑布（落进云海） */
  private falls: Mesh | null = null; private fallMat: ShaderMaterial | null = null;
  private readonly sea: Mesh; private readonly wall: Mesh;
  private readonly rockMat: ShaderMaterial; private readonly ironMat: ShaderMaterial;

  constructor(scene: Scene, glyphs: HTMLCanvasElement, noise: Texture | null) {
    const flat = new PlaneGeometry(1, 1); flat.rotateX(-Math.PI / 2);
    // —— 台下的云海 / 深渊
    this.sea = new Mesh(flat, new ShaderMaterial({
      uniforms: { uNoise: { value: noise }, uP: { value: new Vector4(0, 0, 0, 1) }, uLight: { value: new Vector3(0.95, 0.94, 0.9) }, uDark: { value: new Vector3(0.7, 0.74, 0.78) }, uGlow: { value: new Vector4(0, 0, 0, 0) } },
      vertexShader: `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform sampler2D uNoise; uniform vec4 uP; uniform vec3 uLight; uniform vec3 uDark; uniform vec4 uGlow; varying vec3 vW;
float n2(vec2 p) { return texture2D(uNoise, p).r; }
void main() {
  vec2 p = vW.xz;
  float t = uP.x;
  // 一团团的云顶：大形缓缓流，小形叠在上面
  // 噪声图是 256 格的随机图：要一千来单位一团的云，一格就得铺到上千单位
  float big = n2(p / 420000.0 + vec2(t * 0.00006, 0.0)) * 0.6 + n2(p / 170000.0 - vec2(0.0, t * 0.0001)) * 0.4;
  float fine = n2(p / 52000.0 + vec2(t * 0.0003, t * 0.00012));
  float puff = smoothstep(0.32, 0.72, big + (fine - 0.5) * 0.35);
  vec3 c = mix(uDark, uLight, puff);
  // 云缝里：深处的颜色（深渊的光从缝里透上来）
  float gap = smoothstep(0.42, 0.18, big + (fine - 0.5) * 0.3);
  c = mix(c, uDark * 0.72, gap * 0.7);
  c += uGlow.rgb * uGlow.a * gap * (0.5 + 0.5 * n2(p / 30000.0 + t * 0.0006));
  // 淡墨勾的云边
  float edge = smoothstep(0.06, 0.0, abs(big + (fine - 0.5) * 0.35 - 0.5));
  c = mix(c, uDark * 0.8, edge * 0.25);
  gl_FragColor = vec4(c, 1.0);
}` }));
    this.sea.frustumCulled = false; this.sea.layers.set(1); this.group.add(this.sea);
    // —— 界壁：一圈垂下来的光幕，上面一行行篆文缓缓往上流（和虚空甬道壁上的符文是一路）
    const gtex = new CanvasTexture(glyphs); gtex.wrapS = gtex.wrapT = RepeatWrapping; gtex.minFilter = gtex.magFilter = LinearFilter; gtex.generateMipmaps = false;
    this.wall = new Mesh(new CylinderGeometry(1, 1, 1, 128, 1, true), new ShaderMaterial({
      transparent: true, depthWrite: false, side: DoubleSide,
      uniforms: { uGlyph: { value: gtex }, uP: { value: new Vector4(0, 60, 3000, 1) }, uTint: { value: new Vector3(1.0, 0.86, 0.5) } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D uGlyph; uniform vec4 uP; uniform vec3 uTint; varying vec2 vUv;
float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float t = uP.x, cols = uP.y, tall = uP.z;
  // 绸子似的竖褶
  float fold = sin(vUv.x * cols * 6.2832 * 0.5 + sin(vUv.y * 5.0 + t * 0.35) * 1.3);
  float veil = 0.27 + 0.11 * fold + 0.05 * sin(vUv.x * cols * 2.1 + t * 0.2);
  // 一列列篆文：每列有自己的流速与明暗
  float cx = vUv.x * cols, col = floor(cx), u = fract(cx);
  float speed = 0.05 + 0.05 * h1(col + 3.0);
  float v = vUv.y * tall / 190.0 - t * speed * 6.0 + h1(col) * 9.0, row = floor(v), fv = fract(v);
  float id = floor(h2(vec2(col, row)) * 64.0);
  vec2 cell = vec2(mod(id, 8.0), floor(id / 8.0));
  vec2 q = vec2((u - 0.5) * 1.5 + 0.5, (1.0 - fv - 0.5) * 1.18 + 0.5);
  float ink = 0.0;
  if (q.x > 0.02 && q.x < 0.98 && q.y > 0.02 && q.y < 0.98) { vec4 g = texture2D(uGlyph, (cell + q) / 8.0); ink = max(g.r, max(g.g, g.b)) * g.a; }
  float bright = 0.45 + 0.55 * h2(vec2(col * 1.7, row * 0.9)) + 0.25 * sin(t * 1.3 + h2(vec2(col, row)) * 6.28);
  float fade = smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.62, vUv.y);
  // 亮底子上叠加色显不出来：光幕是一层淡金的纱，篆文是纱上更深的金
  float face = gl_FrontFacing ? 0.3 : 1.0, g = clamp(ink * bright, 0.0, 1.0);
  // 纱的褶子：凸处亮、凹处偏琥珀色，看得出是一幅垂下来的幕
  vec3 silk = mix(uTint * vec3(0.92, 0.8, 0.6), mix(vec3(1.0), uTint, 0.5), fold * 0.5 + 0.5);
  vec3 rgb = mix(silk, uTint * vec3(0.74, 0.54, 0.24), g);
  gl_FragColor = vec4(rgb, clamp(veil + g * 0.8, 0.0, 0.95) * fade * uP.w * face);
}` }));
    this.wall.frustumCulled = false; this.wall.layers.set(1); this.wall.renderOrder = 6; this.group.add(this.wall);
    this.rockMat = new ShaderMaterial({ vertexShader: ROCK_VS, fragmentShader: ROCK_FS, uniforms: { uMist: { value: new Vector3(0.9, 0.9, 0.86) }, uGlow: { value: new Vector4(0, 0, 0, 0) } } });
    this.ironMat = new ShaderMaterial({ vertexShader: ROCK_VS, uniforms: {},
      fragmentShader: `varying vec3 vP; void main() { vec3 n = normalize(cross(dFdx(vP), dFdy(vP))); float key = max(0.0, dot(n, normalize(vec3(-0.4, 0.55, 0.72)))); gl_FragColor = vec4(vec3(0.20, 0.21, 0.2) * (0.6 + 0.9 * key), 1.0); }` });
    this.group.visible = false;
    scene.add(this.group);
  }

  /** 换了秘境 / 换了层才重建几何体 */
  sync(key: string, isles: readonly RealmIsle[], bridges: readonly RealmLink[], chains: readonly RealmLink[], bound: { x: number; y: number; r: number }, look: RealmLook): void {
    this.group.visible = true;
    if (key === this.key) return;
    this.key = key;
    if (this.rocks) { this.group.remove(this.rocks); this.rocks.geometry.dispose(); this.rocks = null; }
    if (this.iron) { this.group.remove(this.iron); this.iron.geometry.dispose(); this.iron = null; }
    // —— 台底的岩体：一圈圈往下收，收成倒悬的石锥；桥身是一条扁石梁
    const P: number[] = [], tri = (a: number[], b: number[], c: number[]) => { P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); };
    for (const s of isles) {
      // 台子放大后：边数跟着半径加（不然台沿发棱）；岩体往下收的深度有上限（不然几千高的石锥戳穿云海）
      const N = Math.max(32, Math.min(96, Math.round(s.r / 60))), deep = Math.min(s.r, 1500 + s.r * 0.12);
      const rings: [number, number][] = [[0, 1], [-0.07, 1.0], [-0.2, 0.9], [-0.5, 0.66], [-0.86, 0.36], [-1.12, 0.1]];
      const pt = (ri: number, i: number): number[] => {
        const a = (i % N) / N * Math.PI * 2, [dy, k0] = rings[ri];
        const jag = ri < 2 ? 0 : (hash(s.seed + ri * 17, i % N) - 0.5) * 0.22 + (hash(s.seed + 5, (i % N) >> 2) - 0.5) * 0.16;
        const rad = isleEdge(s.round, s.r, a, s.shape ?? (s.round ? 1 : 0), s.seed) * Math.max(0.03, k0 + jag * (ri === rings.length - 1 ? 0.5 : 1));
        const yy = dy * deep * (ri < 2 ? 1 : 0.92 + hash(s.seed + 9 + ri, i % N) * 0.2);
        return [s.x + Math.cos(a) * rad, yy - 2, s.y + Math.sin(a) * rad];
      };
      for (let ri = 0; ri < rings.length - 1; ri++) for (let i = 0; i < N; i++) { const a = pt(ri, i), b = pt(ri, i + 1), c = pt(ri + 1, i), d = pt(ri + 1, i + 1); tri(a, c, b); tri(b, c, d); }
      const tip = [s.x + (hash(s.seed, 77) - 0.5) * s.r * 0.2, -1.28 * deep, s.y + (hash(s.seed, 78) - 0.5) * s.r * 0.2];
      for (let i = 0; i < N; i++) tri(pt(rings.length - 1, i), tip, pt(rings.length - 1, i + 1));
    }
    for (const b of bridges) {
      const dx = b.bx - b.ax, dy = b.by - b.ay, len = Math.hypot(dx, dy) || 1, nx = -dy / len * b.w / 2, ny = dx / len * b.w / 2, T = 70;
      const q = (ex: number, ez: number, side: number, y: number) => [ex + nx * side * (y < -1 ? 0.8 : 1), y, ez + ny * side * (y < -1 ? 0.8 : 1)];
      const a0 = q(b.ax, b.ay, -1, -2), a1 = q(b.ax, b.ay, 1, -2), b0 = q(b.bx, b.by, -1, -2), b1 = q(b.bx, b.by, 1, -2);
      const c0 = q(b.ax, b.ay, -1, -T), c1 = q(b.ax, b.ay, 1, -T), d0 = q(b.bx, b.by, -1, -T), d1 = q(b.bx, b.by, 1, -T);
      tri(a0, c0, b0); tri(b0, c0, d0); tri(a1, b1, c1); tri(b1, d1, c1); tri(c0, c1, d0); tri(d0, c1, d1);
    }
    const rg = new BufferGeometry(); rg.setAttribute('position', new Float32BufferAttribute(P, 3));
    this.rocks = new Mesh(rg, this.rockMat); this.rocks.frustumCulled = false; this.group.add(this.rocks);
    // —— 铁索：两台之间垂下来的一道弧
    const C: number[] = [];
    for (const c of chains) {
      const len = Math.hypot(c.bx - c.ax, c.by - c.ay), pts: Vector3[] = [];
      for (let i = 0; i <= 10; i++) { const k = i / 10; pts.push(new Vector3(c.ax + (c.bx - c.ax) * k, -18 - Math.sin(k * Math.PI) * len * 0.16, c.ay + (c.by - c.ay) * k)); }
      const tube = new TubeGeometry(new CatmullRomCurve3(pts), 24, c.w, 5, false), g = tube.toNonIndexed(), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) C.push(p.getX(i), p.getY(i), p.getZ(i));
      tube.dispose(); g.dispose();
    }
    if (C.length) { const cg = new BufferGeometry(); cg.setAttribute('position', new Float32BufferAttribute(C, 3)); this.iron = new Mesh(cg, this.ironMat); this.iron.frustumCulled = false; this.group.add(this.iron); }
    // —— 瀑布：自然浮岛的台沿挂两三道，一条竖带从台沿落进云海，略向外倾
    if (this.falls) { this.group.remove(this.falls); this.falls.geometry.dispose(); this.falls = null; }
    const WF: number[] = [], UF: number[] = [];
    for (const s of isles) {
      if (s.shape !== 2) continue;
      const n = 2 + Math.floor(hash(s.seed, 61) * 2);
      for (let k = 0; k < n; k++) {
        const a = hash(s.seed, 70 + k) * Math.PI * 2, rad = isleEdge(false, s.r, a, 2, s.seed) * 0.985, w = s.r * (0.05 + hash(s.seed, 80 + k) * 0.05), H = 1500;
        const cx = s.x + Math.cos(a) * rad, cz = s.y + Math.sin(a) * rad, tx = -Math.sin(a) * w / 2, tz = Math.cos(a) * w / 2, ox = Math.cos(a) * 70, oz = Math.sin(a) * 70;
        const A = [cx - tx, 4, cz - tz], B = [cx + tx, 4, cz + tz], C = [cx - tx + ox, -H, cz - tz + oz], D = [cx + tx + ox, -H, cz + tz + oz];
        WF.push(...A, ...C, ...B, ...B, ...C, ...D); UF.push(0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1);
      }
    }
    if (WF.length) {
      this.fallMat ??= new ShaderMaterial({ transparent: true, depthWrite: false, side: DoubleSide, uniforms: { uT: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uT; varying vec2 vUv;
float h(float p) { return fract(sin(p * 127.1) * 43758.5453); }
void main() {
  float x = vUv.x, y = vUv.y, col = floor(x * 14.0);
  // 一股股水线：每股流速略有不同，往下滚；越往下越散成雾
  float flow = fract(y * 3.0 - uT * (0.7 + h(col) * 0.5) + h(col + 3.0));
  float foam = smoothstep(0.0, 0.2, flow) * smoothstep(1.0, 0.45, flow);
  float edge = smoothstep(0.0, 0.2, x) * smoothstep(1.0, 0.8, x), fade = smoothstep(1.0, 0.5, y) * (0.75 + 0.25 * smoothstep(0.0, 0.04, y));
  gl_FragColor = vec4(mix(vec3(0.74, 0.88, 0.94), vec3(1.0), foam * 0.85), edge * fade * (0.42 + 0.46 * foam));
}` });
      const fg = new BufferGeometry(); fg.setAttribute('position', new Float32BufferAttribute(WF, 3)); fg.setAttribute('uv', new Float32BufferAttribute(UF, 2));
      this.falls = new Mesh(fg, this.fallMat); this.falls.frustumCulled = false; this.falls.layers.set(1); this.falls.renderOrder = 5; this.group.add(this.falls);
    }
    // —— 云海与界壁的位置、颜色
    const size = bound.r * 2 + 16000;
    this.sea.position.set(bound.x, -1500, bound.y); this.sea.scale.set(size, 1, size);
    const su = (this.sea.material as ShaderMaterial).uniforms;
    (su.uLight.value as Vector3).set(...look.seaLight); (su.uDark.value as Vector3).set(...look.seaDark); (su.uGlow.value as Vector4).set(...look.glow);
    (this.rockMat.uniforms.uMist.value as Vector3).set(look.seaLight[0] * 0.97, look.seaLight[1] * 0.97, look.seaLight[2] * 0.97);
    (this.rockMat.uniforms.uGlow.value as Vector4).set(...look.glow);
    const tall = Math.max(3000, Math.min(7000, 3000 * Math.sqrt(bound.r / 5400)));   // 界壁跟着秘境的大小长高
    this.wall.position.set(bound.x, tall / 2 - 700, bound.y); this.wall.scale.set(bound.r, tall, bound.r);
    const wu = (this.wall.material as ShaderMaterial).uniforms;
    (wu.uP.value as Vector4).set(0, Math.max(24, Math.round(bound.r * 2 * Math.PI / 230)), tall, 1);
    (wu.uTint.value as Vector3).set(...look.wall);
  }

  update(time: number): void {
    ((this.sea.material as ShaderMaterial).uniforms.uP.value as Vector4).x = time;
    ((this.wall.material as ShaderMaterial).uniforms.uP.value as Vector4).x = time;
    if (this.fallMat) this.fallMat.uniforms.uT.value = time;
  }
}
