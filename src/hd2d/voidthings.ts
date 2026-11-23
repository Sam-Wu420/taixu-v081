// 虚空里的东西的样子：空间乱流（一团旋着的电光）、上古残殿（浮石上的断柱残垣）、巨兽遗骨、虚空兽。
// 都是代码现造的几何体，没有模型文件。位置一律以人物为原点（与 voidscene 的其余部分一致）。
import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, IcosahedronGeometry, Matrix4, Mesh, PlaneGeometry,
  Scene, ShaderMaterial, TorusGeometry, Vector3, Vector4, Euler, Quaternion,
} from 'three';
import type { VoidThing } from '../world/voidlife';

const POOL = { storm: 4, ruin: 4, bones: 3, beast: 6 } as const;

/** 把几块几何体（各带一个变换）并成一块，只留位置 */
function merge(parts: [BufferGeometry, Matrix4][]): BufferGeometry {
  const pos: number[] = [], v = new Vector3();
  for (const [g, m] of parts) {
    const n = g.index ? g.toNonIndexed() : g, p = n.attributes.position;
    for (let i = 0; i < p.count; i++) { v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(m); pos.push(v.x, v.y, v.z); }
    if (n !== g) n.dispose();
    g.dispose();
  }
  const out = new BufferGeometry(); out.setAttribute('position', new Float32BufferAttribute(pos, 3));
  return out;
}
const M = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(rx, ry, rz)), new Vector3(sx, sy, sz));
const hash = (s: number, k: number) => { let h = Math.imul(s ^ (k * 0x9e3779b1), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** 残殿：一块浮石，上面一层殿基、几根高矮不一的断柱、一截横梁、半堵墙 */
function ruinGeometry(): BufferGeometry {
  const parts: [BufferGeometry, Matrix4][] = [];
  parts.push([new IcosahedronGeometry(1, 1), M(0, -0.34, 0, 1.05, 0.34, 0.8)]);
  parts.push([new IcosahedronGeometry(1, 0), M(0.3, -0.62, 0.1, 0.5, 0.4, 0.4, 0.4, 0.7, 0)]);
  parts.push([new BoxGeometry(1.5, 0.08, 1.0), M(0, 0.02, 0)]);
  parts.push([new BoxGeometry(1.26, 0.06, 0.8), M(0, 0.09, 0)]);
  const cols: [number, number, number][] = [[-0.52, -0.28, 0.62], [-0.18, -0.28, 0.3], [0.18, -0.28, 0.7], [0.52, -0.28, 0.16], [-0.52, 0.28, 0.44], [0.52, 0.28, 0.66], [0.18, 0.28, 0.1]];
  for (const [x, z, h] of cols) { parts.push([new CylinderGeometry(0.05, 0.058, h, 8), M(x, 0.12 + h / 2, z)]); parts.push([new BoxGeometry(0.14, 0.04, 0.14), M(x, 0.13, z)]); }
  parts.push([new BoxGeometry(0.8, 0.07, 0.11), M(-0.17, 0.78, -0.28, 1, 1, 1, 0, 0, 0.06)]);
  parts.push([new BoxGeometry(0.5, 0.07, 0.11), M(0.3, 0.2, 0.05, 1, 1, 1, 0.2, 0.5, 0.5)]);   // 倒下的一截梁
  parts.push([new BoxGeometry(0.06, 0.42, 0.46), M(-0.6, 0.33, 0)]);
  parts.push([new BoxGeometry(0.3, 0.3, 0.05), M(0, 0.27, -0.36)]);                          // 半塌的门
  return merge(parts);
}
/** 遗骨：一条脊、十来对肋、一颗头、一截尾 */
function bonesGeometry(): BufferGeometry {
  const parts: [BufferGeometry, Matrix4][] = [];
  parts.push([new CylinderGeometry(0.03, 0.045, 1.9, 7), M(0, 0, 0, 1, 1, 1, 0, 0, Math.PI / 2)]);
  for (let i = 0; i < 11; i++) {
    const t = i / 10, x = 0.62 - t * 1.25, r = 0.16 + Math.sin(t * Math.PI) * 0.27;
    // 一对肋：半个圆环，开口朝下
    parts.push([new TorusGeometry(r, 0.018, 5, 14, Math.PI), M(x, -0.02, 0, 1, 1.1, 1, 0, Math.PI / 2, Math.PI)]);
  }
  parts.push([new IcosahedronGeometry(1, 1), M(0.98, 0.02, 0, 0.26, 0.16, 0.19)]);
  parts.push([new CylinderGeometry(0.0, 0.035, 0.3, 6), M(1.02, 0.2, 0.1, 1, 1, 1, 0, 0, -0.6)]);
  parts.push([new CylinderGeometry(0.0, 0.035, 0.3, 6), M(1.02, 0.2, -0.1, 1, 1, 1, 0, 0, -0.6)]);
  parts.push([new BoxGeometry(0.3, 0.03, 0.22), M(1.2, -0.06, 0, 1, 1, 1, 0, 0, -0.25)]);   // 下颌
  for (let i = 0; i < 6; i++) parts.push([new IcosahedronGeometry(1, 0), M(-1.0 - i * 0.12, -0.02 - i * 0.012, 0, 0.05 - i * 0.006, 0.04 - i * 0.005, 0.04 - i * 0.005)]);
  return merge(parts);
}
/** 虚空兽：像一头巨鳐——扁平的身子、一对宽翼、一条长尾。aEdge：0＝身子正中，1＝翼尖与边缘（发光） */
function beastGeometry(): BufferGeometry {
  const P: number[] = [], E: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => { for (const q of [a, b, c]) { P.push(q[0], q[1], q[2]); E.push(q[3]); } };
  const N = 10;
  // 身子轮廓：头朝 +x。沿身长取若干截面，每截面是「中脊 → 翼缘」
  const half = (t: number) => Math.pow(Math.sin(Math.min(1, t * 1.15) * Math.PI), 0.7) * (1 - t * 0.25);   // 翼展随身长的变化
  for (const s of [-1, 1]) for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N, x0 = 0.5 - t0, x1 = 0.5 - t1, w0 = half(t0), w1 = half(t1);
    const a = [x0, 0.05 * Math.sin(t0 * Math.PI), 0, 0], b = [x1, 0.05 * Math.sin(t1 * Math.PI), 0, 0];
    const c = [x0 - w0 * 0.18, 0, s * w0, 1], d = [x1 - w1 * 0.18, 0, s * w1, 1];
    tri(a, c, b); tri(b, c, d);
  }
  // 尾
  tri([-0.5, 0.01, 0.025, 0.3], [-0.5, 0.01, -0.025, 0.3], [-1.25, 0, 0, 1]);
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(P, 3)); g.setAttribute('aEdge', new Float32BufferAttribute(E, 1));
  return g;
}

const SOLID_VS = `varying vec3 vP; varying vec3 vL; void main() { vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const SOLID_FS = `uniform vec3 uBase; uniform vec4 uGlow; varying vec3 vP; varying vec3 vL;
void main() {
  vec3 n = normalize(cross(dFdx(vP), dFdy(vP)));
  float key = max(0.0, dot(n, normalize(vec3(-0.45, 0.6, 0.66))));
  vec3 c = uBase * (0.3 + key * 1.5) + vec3(0.1, 0.07, 0.2) * pow(1.0 - abs(n.z), 2.0) * 0.35 + uBase * pow(key, 6.0) * 0.6;
  // 残留的灵光：贴着底部往上游走的一圈
  c += uGlow.rgb * uGlow.a * (0.25 + 0.75 * pow(max(0.0, sin(vL.y * 9.0 + vL.x * 4.0 - uGlow.a * 3.0)), 6.0));
  gl_FragColor = vec4(c, 1.0);
}`;

export class VoidThings {
  private storms: Mesh[] = []; private ruins: Mesh[] = []; private bones: Mesh[] = []; private beasts: Mesh[] = [];
  private marks: Mesh[] = [];
  constructor(scene: Scene) {
    const flat = new PlaneGeometry(1, 1); flat.rotateX(-Math.PI / 2);
    for (let i = 0; i < POOL.storm; i++) {
      const m = new Mesh(flat, new ShaderMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, uniforms: { uP: { value: new Vector4(0, i * 1.7, 1, 0) } },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform vec4 uP; varying vec2 vUv;
void main() {
  vec2 q = vUv * 2.0 - 1.0; float d = length(q); if (d > 1.0) discard;
  float a = atan(q.y, q.x);
  float arms = pow(sin(a * 3.0 + d * 10.0 - uP.x * 0.8 + uP.y) * 0.5 + 0.5, 2.4);
  float fine = pow(sin(a * 11.0 - d * 23.0 + uP.x * 1.7 + uP.y * 3.0) * 0.5 + 0.5, 5.0);
  float core = exp(-d * d * 10.0), edge = smoothstep(1.0, 0.5, d);
  float flick = step(0.975, fract(sin(floor(uP.x * 8.0) * 12.9898 + uP.y) * 43758.5453));
  vec3 col = mix(vec3(0.3, 0.14, 0.62), vec3(0.5, 0.78, 1.0), arms * 0.65 + fine * 0.3);
  float al = (arms * 0.42 + fine * 0.25 + core * 1.1 + 0.07) * edge * uP.z * (1.0 + flick * 1.6);
  gl_FragColor = vec4(col * al, al);
}` }));
      m.frustumCulled = false; m.visible = false; m.renderOrder = 16; scene.add(m); this.storms.push(m);
    }
    const rg = ruinGeometry(), bg = bonesGeometry(), eg = beastGeometry();
    const solid = (base: [number, number, number], glow: [number, number, number]) => new ShaderMaterial({ vertexShader: SOLID_VS, fragmentShader: SOLID_FS, uniforms: { uBase: { value: new Vector3(...base) }, uGlow: { value: new Vector4(glow[0], glow[1], glow[2], 0) } } });
    for (let i = 0; i < POOL.ruin; i++) { const m = new Mesh(rg, solid([0.2, 0.19, 0.24], [1.0, 0.82, 0.42])); m.frustumCulled = false; m.visible = false; scene.add(m); this.ruins.push(m); }
    for (let i = 0; i < POOL.bones; i++) { const m = new Mesh(bg, solid([0.46, 0.44, 0.38], [0.45, 0.95, 0.9])); m.frustumCulled = false; m.visible = false; scene.add(m); this.bones.push(m); }
    for (let i = 0; i < POOL.beast; i++) {
      // 收官 P9：uF 是显几成（交手那一刻淡出、交给立板）；淡出时不写深度，免得挡住淡入的立板
      const m = new Mesh(eg, new ShaderMaterial({ side: DoubleSide, transparent: true, uniforms: { uP: { value: new Vector4(0, i, 0, 0) }, uF: { value: 1 } },
        vertexShader: `attribute float aEdge; uniform vec4 uP; varying float vE; varying vec3 vP;
void main() { vE = aEdge; vec3 p = position; p.y += sin(uP.x * 2.2 + uP.y + abs(p.z) * 5.0) * abs(p.z) * 0.22 + sin(uP.x * 1.3 + p.x * 4.0) * 0.03 * step(p.x, -0.4) * (-p.x - 0.4) * 6.0;
  vec4 w = modelMatrix * vec4(p, 1.0); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `uniform vec4 uP; uniform float uF; varying float vE; varying vec3 vP;
void main() {
  vec3 glow = mix(vec3(0.42, 0.3, 1.0), vec3(1.0, 0.28, 0.16), uP.z);
  float rim = pow(vE, 3.0 - uP.w * 1.8), pulse = 0.75 + 0.25 * sin(uP.x * 3.0 + uP.y);
  vec3 c = vec3(0.035, 0.03, 0.07) * (1.0 - rim) + glow * rim * (1.9 + uP.w * 1.6) * pulse + glow * (0.06 + uP.w * 0.3);   // uP.w：交手那一刻亮起
  gl_FragColor = vec4(c, uF);
}` }));
      m.frustumCulled = false; m.visible = false; scene.add(m); this.beasts.push(m);
    }
    // 可以探查的标记：遗迹上方一点柔光
    for (let i = 0; i < POOL.ruin + POOL.bones; i++) {
      const m = new Mesh(flat, new ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending, side: DoubleSide, uniforms: { uP: { value: new Vector4(0, i, 1, 0) } },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform vec4 uP; varying vec2 vUv; void main() { float d = length(vUv * 2.0 - 1.0); float ring = exp(-pow((d - 0.78 - 0.04 * sin(uP.x * 2.0 + uP.y)) * 16.0, 2.0)); float a = (ring * 0.8 + pow(max(0.0, 1.0 - d), 3.0) * 0.25) * uP.z; gl_FragColor = vec4(vec3(1.0, 0.85, 0.5) * a, a); }` }));
      m.frustumCulled = false; m.visible = false; m.renderOrder = 17; scene.add(m); this.marks.push(m);
    }
  }

  /** 每帧：把这一帧身边的东西摆进各自的池子。fade：整体显几成（人还在界壁里时淡掉） */
  update(things: readonly VoidThing[], x: number, y: number, time: number, fade: number): void {
    const n = { storm: 0, ruin: 0, bones: 0, beast: 0 }; let marks = 0;
    for (const m of this.storms) m.visible = false; for (const m of this.ruins) m.visible = false;
    for (const m of this.bones) m.visible = false; for (const m of this.beasts) m.visible = false; for (const m of this.marks) m.visible = false;
    if (fade <= 0.01) return;
    for (const t of things) {
      const dx = t.x - x, dz = t.y - y;
      if (t.kind === 'storm') {
        const m = this.storms[n.storm++]; if (!m) continue;
        m.visible = true; m.position.set(dx, -260, dz); m.scale.set(t.r * 2.3, 1, t.r * 2.3); m.rotation.y = t.a;
        (m.material as ShaderMaterial).uniforms.uP.value.set(time, (t.seed % 1000) * 0.01, fade, 0);
      } else if (t.kind === 'ruin' || t.kind === 'bones') {
        const m = (t.kind === 'ruin' ? this.ruins[n.ruin++] : this.bones[n.bones++]); if (!m) continue;
        const bob = Math.sin(time * 0.35 + hash(t.seed, 3) * 6.28) * t.r * 0.03;
        m.visible = true; m.position.set(dx, -t.r * (t.kind === 'ruin' ? 0.35 : 0.3) - 140 + bob, dz); m.scale.setScalar(t.r); m.rotation.set(t.kind === 'bones' ? 0.12 : 0, -t.a, t.kind === 'bones' ? 0.08 : 0);
        const u = (m.material as ShaderMaterial).uniforms.uGlow.value as Vector4; u.w = t.done ? 0 : 0.5 + 0.2 * Math.sin(time * 1.3 + t.seed);
        if (!t.done) { const k = this.marks[marks++]; if (k) { k.visible = true; k.position.set(dx, -90, dz); k.scale.set(t.r * 2.6, 1, t.r * 2.6); (k.material as ShaderMaterial).uniforms.uP.value.set(time, hash(t.seed, 9) * 6.28, fade * 0.8, 0); } }
      } else {
        const m = this.beasts[n.beast++]; if (!m) continue;
        // 收官 P9：交手那一刻往立板那一层靠（liftK）、边缘亮起（flare，记在 uP.w）
        const y0 = -110 + Math.sin(time * 0.9 + t.seed) * 26, lk = t.liftK ?? 0;
        m.visible = true; m.position.set(dx, y0 + ((t.lift ?? y0) - y0) * lk, dz); m.scale.setScalar(t.r * 2); m.rotation.set(0, -t.a, 0);
        const mat = m.material as ShaderMaterial, u = mat.uniforms.uP.value as Vector4; u.x = time; u.y = hash(t.seed, 5) * 6.28; u.z += ((t.hot ? 1 : 0) - u.z) * 0.08; u.w = t.flare ?? 0;
        const f = t.fade ?? 1; mat.uniforms.uF.value = f; mat.depthWrite = f > 0.999;
      }
    }
  }
}
