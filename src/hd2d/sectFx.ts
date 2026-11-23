// P10：占山宗门的「活」东西——崖上挂下来的瀑布（流动的水幕 + 落水处翻起的水雾）、山间几层淡淡的云雾。
// 建筑的合并网格是一个不透明的受光材质，这些半透明、会动的另起几个小网格，各用自己的着色器。
// 场景每帧调 update：镜头附近有占山宗门就建（建一次缓存住），远了就藏起来；顺便把雪线抬到山顶以上（宗门的台地上不积雪）。
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, ShaderMaterial, Vector3, Vector4, type Texture } from 'three';
import { LOCATIONS, WORLD_SCALE } from '../data/world';
import { grandSectPlan, type GrandSectPlan } from '../data/sectPlan';

export const FALL_VS = `
attribute vec3 aFall; varying vec3 vF;
void main(){ vF = aFall; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`;
// aFall = (横向 0..1, 沿水流的距离（世界单位）, 0 水幕 / 1 水雾)
export const FALL_FS = `
uniform vec4 uT; uniform sampler2D uNoise; varying vec3 vF;
void main(){
  float t = uT.x, u = vF.x, d = vF.y;
  if (vF.z < 0.5) {
    // 水幕：一缕缕往下冲的白练，边上散开、变薄
    // 噪声图 256 格：横向十来格是十来缕水，纵向一格拉得很长（白练），按时间往下流
    float streak = texture2D(uNoise, vec2(u * 0.05, d / 6000.0 - t * 0.25)).r * 0.6 + texture2D(uNoise, vec2(u * 0.12 + 0.37, d / 2500.0 - t * 0.5)).g * 0.4;
    float edge = smoothstep(0.0, 0.22, u) * smoothstep(1.0, 0.78, u);
    float a = edge * (0.55 + 0.45 * smoothstep(0.3, 0.75, streak));
    vec3 c = mix(vec3(0.62, 0.72, 0.76), vec3(0.97, 0.98, 1.0), smoothstep(0.35, 0.8, streak));
    gl_FragColor = vec4(c * a * uT.y, a * uT.y);
  } else {
    // 水雾 / 云雾：一团团缓缓翻动的白
    vec2 q = vec2(u, d);
    float r = length(q - 0.5) * 2.0;
    float n = texture2D(uNoise, q * 0.035 + vec2(t * 0.0012, -t * 0.002)).b * 0.6 + texture2D(uNoise, q * 0.09 - vec2(t * 0.003, t * 0.0015)).r * 0.4;
    float a = smoothstep(1.0, 0.3, r) * smoothstep(0.42, 0.85, n) * uT.z;
    gl_FragColor = vec4(vec3(0.96, 0.97, 0.98) * a, a);
  }
}`;

/** 雾（谷底的淡雾、落水处的水雾）最浓也只到这个不透明度 */
const MIST_ALPHA = 0.15;

// 仙鹤：几只绕主峰盘旋，翅膀一扇一扇。每只鹤的几何在自己的坐标里（x 朝前、y 朝上、z 朝左右），顶点着色器按时间转到盘旋的位置上
const CRANE_VS = `
attribute vec3 aLocal; attribute vec4 aCrane; attribute float aWing; attribute vec3 color;
uniform float uTime; uniform vec3 uCenter; varying vec3 vC;
void main(){
  float ang = aCrane.z + uTime * aCrane.w;
  vec3 p = aLocal;
  // 扇翅：翼尖上下摆，翼根不动
  p.y += sin(uTime * 3.2 + aCrane.z * 7.0) * aWing * abs(p.z) * 0.55;
  // 头朝着盘旋的切线方向
  float c = cos(ang), s = sin(ang), dir = sign(aCrane.w);
  vec3 fwd = vec3(-s, 0.0, c) * dir, side = vec3(c, 0.0, s);
  vec3 o = uCenter + vec3(c * aCrane.x, aCrane.y + sin(uTime * 0.4 + aCrane.z) * 80.0, s * aCrane.x * 0.8);
  // 镜头拉近时鹤离镜头比离地面还近，会大得糊满一屏：按「鹤到镜头 / 镜头离地」的比例缩没（拉远了照常盘旋）
  float near = smoothstep(0.5, 0.8, length(cameraPosition - o) / max(1.0, (cameraPosition.y - uCenter.y) * 1.4));
  vec3 w = o + (fwd * p.x + side * p.z + vec3(0.0, p.y, 0.0)) * near;
  vC = color;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
const CRANE_FS = `varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.0); }`;

interface Built { id: string; group: Group; x: number; y: number; reach: number; base: number }

export class SectFx {
  readonly group = new Group();
  private readonly mat: ShaderMaterial;
  private readonly built = new Map<string, Built>();
  private locsRef: unknown = null; private grand: { id: string; x: number; y: number; plan: GrandSectPlan }[] = [];
  private snowDefault = -1;
  /** (x, y) 这一点离最近的占山宗门多近：0 在地界外远处，1 在地界里（场景按它把宗门上空的云海挖开） */
  cloudFree(x: number, y: number): number {
    let k = 0;
    for (const g of this.grand) { const P = g.plan; if (P.look.variant === 'small') continue; const e = Math.hypot((x - g.x - P.cx) / (P.rx + P.apron), (y - g.y - P.cy) / (P.ry + P.apron)); k = Math.max(k, 1 - Math.max(0, Math.min(1, (e - 0.8) / 0.6))); }
    return k;
  }

  constructor(noise: Texture | null) {
    this.mat = new ShaderMaterial({ vertexShader: FALL_VS, fragmentShader: FALL_FS, transparent: true, premultipliedAlpha: true, depthWrite: false, side: DoubleSide,
      uniforms: { uT: { value: new Vector4(0, 1, 0.8, 0) }, uNoise: { value: noise } } });
  }

  /** 每帧：(tx, ty) 是镜头焦点，light 是场景共用的 uLight（y 分量是雪线） */
  update(tx: number, ty: number, time: number, heightAt: (x: number, y: number) => number, light: Vector4, night: number, snowHole?: Vector4): void {
    if (this.locsRef !== LOCATIONS) {
      this.locsRef = LOCATIONS;
      this.grand = [];
      for (const l of LOCATIONS) { const plan = grandSectPlan(l); if (plan) this.grand.push({ id: l.id, x: l.x * WORLD_SCALE, y: l.y * WORLD_SCALE, plan }); }
      for (const b of this.built.values()) this.drop(b);
      this.built.clear();
    }
    if (this.snowDefault < 0) this.snowDefault = light.y;
    let hole: [number, number, number, number] = [0, 0, 1, 0], holeD = Infinity;
    for (const g of this.grand) {
      const P = g.plan, reach = Math.max(P.rx, P.ry) + P.apron;
      const d = Math.hypot(tx - g.x - P.cx, ty - g.y - P.cy);
      let b = this.built.get(g.id);
      if (d < reach + 14000) {
        if (!b) { b = this.build(g, heightAt); this.built.set(g.id, b); }
        b.group.visible = true;
        // 宗门山体里不积雪：只在这座山的地界里把雪线抬到山顶以上（地形着色器按位置算，附近的天然雪峰照旧）
        const raise = b.base + 3800 - this.snowDefault;
        if (raise > 0 && d < holeD) { holeD = d; hole = [g.x + P.cx, g.y + P.cy, Math.max(P.rx, P.ry) + 300, raise]; }
      } else if (b) {
        if (d > reach + 30000) { this.drop(b); this.built.delete(g.id); } else b.group.visible = false;
      }
    }
    snowHole?.set(...hole);
    const u = this.mat.uniforms.uT.value as Vector4;
    for (const m of this.craneMeshes) (m.material as ShaderMaterial).uniforms.uTime.value = time;
    u.x = time; u.y = 1 - night * 0.45; u.z = MIST_ALPHA * (1 - night * 0.5);
  }

  private drop(b: Built) {
    this.group.remove(b.group);
    this.craneMeshes = this.craneMeshes.filter((m) => { if (m.parent !== b.group) return true; (m.material as ShaderMaterial).dispose(); return false; });
    for (const c of b.group.children) (c as Mesh).geometry.dispose();
  }

  private build(g: { id: string; x: number; y: number; plan: GrandSectPlan }, heightAt: (x: number, y: number) => number): Built {
    const P = g.plan, group = new Group();
    const pos: number[] = [], fall: number[] = [];
    const v = (x: number, y: number, z: number, u: number, d: number, kind: number) => { pos.push(x, y, z); fall.push(u, d, kind); };
    const quad = (a: number[], b: number[], c: number[], d: number[]) => { for (const q of [a, b, c, a, c, d]) v(q[0], q[1], q[2], q[3], q[4], q[5]); };
    const H = (lx: number, ly: number) => heightAt(g.x + lx, g.y + ly);
    const base = H(P.spawn.x, P.spawn.y);
    // —— 瀑布：从崖口顺着崖面挂下来，贴着地面往外让开一点；落到坡缓下来的地方为止，那里翻起水雾
    for (const f of P.falls) {
      const top = H(f.x - f.dx * 40, f.y - f.dy * 40), px = -f.dy, py = f.dx;
      const prof: [number, number][] = [];
      let last = top, d = 0;
      prof.push([0, top + 6]);
      for (d = 30; d < 2400; d += 30) {
        const h = H(f.x + f.dx * d, f.y + f.dy * d);
        prof.push([d, Math.min(last, h + 14)]);
        if (last - h < 30 * 0.35 && d > 200) break;   // 坡缓下来了
        last = h;
      }
      let run = 0;
      for (let i = 0; i < prof.length - 1; i++) {
        const [d0, h0] = prof[i], [d1, h1] = prof[i + 1];
        const seg = Math.hypot(d1 - d0, h1 - h0);
        const x0 = f.x + f.dx * (d0 + 22), y0 = f.y + f.dy * (d0 + 22), x1 = f.x + f.dx * (d1 + 22), y1 = f.y + f.dy * (d1 + 22);
        const w0 = f.w * (1 + d0 / 3000), w1 = f.w * (1 + d1 / 3000);
        quad([g.x + x0 - px * w0 / 2, h0, g.y + y0 - py * w0 / 2, 0, run, 0], [g.x + x0 + px * w0 / 2, h0, g.y + y0 + py * w0 / 2, 1, run, 0],
          [g.x + x1 + px * w1 / 2, h1, g.y + y1 + py * w1 / 2, 1, run + seg, 0], [g.x + x1 - px * w1 / 2, h1, g.y + y1 - py * w1 / 2, 0, run + seg, 0]);
        run += seg;
      }
      // 落水处的水雾：几片交叉的竖片
      const [dEnd, hEnd] = prof[prof.length - 1], mx = f.x + f.dx * (dEnd + 60), my = f.y + f.dy * (dEnd + 60), R = f.w * 0.8;
      for (let k = 0; k < 3; k++) {
        const a = k / 3 * Math.PI, cx = Math.cos(a) * R, cy = Math.sin(a) * R;
        quad([g.x + mx - cx, hEnd - 20, g.y + my - cy, 0, 0, 1], [g.x + mx + cx, hEnd - 20, g.y + my + cy, 1, 0, 1],
          [g.x + mx + cx, hEnd + R * 1.1, g.y + my + cy, 1, 1, 1], [g.x + mx - cx, hEnd + R * 1.1, g.y + my - cy, 0, 1, 1]);
      }
    }
    // —— 山间云雾：只留最低处崖脚 / 谷底的一两片（比山门广场还低），台面、殿阁、石阶上方一律不放，宁可没有也不挡视线
    for (const { x, y, rx, ry, rise } of P.mists.filter((m) => m.rise <= -250).slice(0, 2)) {
      const h = base + rise;
      quad([g.x + x - rx, h, g.y + y - ry, 0, 0, 1], [g.x + x + rx, h, g.y + y - ry, 1, 0, 1], [g.x + x + rx, h, g.y + y + ry, 1, 1, 1], [g.x + x - rx, h, g.y + y + ry, 0, 1, 1]);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('aFall', new Float32BufferAttribute(fall, 3));
    geo.computeBoundingSphere();
    const mesh = new Mesh(geo, this.mat); mesh.renderOrder = 4;
    group.add(mesh);
    // 仙鹤：只在占山的大宗门（魔道不放），绕主殿与悬空峰盘旋
    if (P.look.variant !== 'small' && !P.look.demon) {
      const main = P.terraces.find((t) => t.role === 'main') ?? P.terraces[0], top = Math.max(...P.terraces.map((t) => t.rise));
      group.add(this.cranes(g.x + main.x, base + main.rise, g.y + main.y - 300, top - main.rise, Math.max(1200, Math.min(P.rx, P.ry) * 0.45)));
    }
    this.group.add(group);
    return { id: g.id, group, x: g.x, y: g.y, reach: Math.max(P.rx, P.ry), base };
  }

  private craneMat: ShaderMaterial | null = null;
  /** 七只鹤：白身、黑翼尖、红顶，绕 (cx, cz) 盘旋，高出基准面三四千 */
  private cranes(cx: number, base: number, cz: number, lift: number, orbit: number): Mesh {
    const L: number[] = [], C: number[] = [], K: number[] = [], Wg: number[] = [], P: number[] = [];
    const tri = (a: number[], b: number[], c: number[], col: number[], wing: number, crane: number[]) => {
      for (const q of [a, b, c]) { L.push(q[0], q[1], q[2]); C.push(col[0], col[1], col[2]); K.push(...crane); Wg.push(wing); P.push(0, 0, 0); }
    };
    const white = [0.95, 0.95, 0.92], black = [0.12, 0.12, 0.13], red = [0.8, 0.15, 0.1];
    for (let i = 0; i < 7; i++) {
      // 盘旋半径、离主殿台面多高、起始角、角速度：贴着主殿上方几百、在悬空峰之间穿过
      const k = [orbit * (0.7 + (i % 3) * 0.3), lift * 0.4 + 380 + (i % 4) * 140, i * 0.9, (i % 2 ? 1 : -1) * (0.07 + (i % 3) * 0.02)];
      const S = 1.4;   // 翼展三百多
      // 身子（菱形，上下两面）、长颈、头
      tri([60 * S, 0, 0], [-50 * S, 0, 12 * S], [-50 * S, 0, -12 * S], white, 0, k);
      tri([60 * S, 0, 0], [-50 * S, 0, -12 * S], [-50 * S, 0, 12 * S], white, 0, k);
      tri([60 * S, 0, 0], [110 * S, 4 * S, 3 * S], [110 * S, 4 * S, -3 * S], white, 0, k);
      tri([110 * S, 4 * S, 0], [125 * S, 5 * S, 4 * S], [125 * S, 5 * S, -4 * S], red, 0, k);
      tri([-50 * S, 0, 0], [-95 * S, -2 * S, 6 * S], [-95 * S, -2 * S, -6 * S], black, 0, k);
      for (const sd of [-1, 1]) {
        // 翅膀：内半白、外半（翼尖）黑；两面都画
        const a = [20 * S, 0, 6 * sd * S], b = [-30 * S, 0, 6 * sd * S], m1 = [10 * S, 0, 70 * sd * S], m2 = [-35 * S, 0, 70 * sd * S], tip = [-20 * S, 0, 120 * sd * S];
        for (const f of [0, 1]) {
          const o = (x: number[], y: number[], z: number[], col: number[]) => f ? tri(x, z, y, col, 1, k) : tri(x, y, z, col, 1, k);
          o(a, m1, b, white); o(b, m1, m2, white); o(m1, tip, m2, black);
        }
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(P, 3));
    geo.setAttribute('aLocal', new Float32BufferAttribute(L, 3));
    geo.setAttribute('color', new Float32BufferAttribute(C, 3));
    geo.setAttribute('aCrane', new Float32BufferAttribute(K, 4));
    geo.setAttribute('aWing', new Float32BufferAttribute(Wg, 1));
    this.craneMat ??= new ShaderMaterial({ vertexShader: CRANE_VS, fragmentShader: CRANE_FS, side: DoubleSide, uniforms: { uTime: { value: 0 }, uCenter: { value: new Vector3() } } });
    const mat = this.craneMat.clone();
    (mat.uniforms.uCenter.value as Vector3).set(cx, base, cz);
    const mesh = new Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 4;
    this.craneMeshes.push(mesh);
    return mesh;
  }
  private craneMeshes: Mesh[] = [];

  dispose(): void { for (const b of this.built.values()) this.drop(b); this.built.clear(); this.mat.dispose(); }
}
