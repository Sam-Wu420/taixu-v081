// 收官 P5：虚空甬道里追兵掷来的飞剑（画面）。规则在 world/nuoyi.ts（TUNNEL_BLADE）。
//   预警：落点亮一圈红金的光（一闪一闪、越来越急），从掷剑的追兵到落点拉一道细细的来向光；
//   出手：一柄剑光从追兵身上飞向落点——打中就钉在那里一闪即散，躲开就擦身而过、没入甬道深处。
// 都是叠加混合、不写深度的面片，挂在甬道自己的场景里；只有被追进甬道时才有东西可画。
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, Mesh, PlaneGeometry, Scene, ShaderMaterial, Vector3,
} from 'three';

/** 一柄飞剑这一帧的样子（甬道场景的坐标由这里换算） */
export interface TunnelBladeView {
  /** 掷剑的追兵（甬道横截面上的偏移、相对主角的前后，和 Rider 一样） */
  fx: number; fy: number; fz: number;
  /** 落点（-1..1 的偏移，sz：0＝原位，1＝蹿到最前） */
  sx: number; sy: number; sz: number;
  /** 预警进度 0..1（1＝出手）；飞行进度 0..1（0＝还没出手）；落定后过了几秒（没落定为 0）；打中了没有 */
  warn: number; fly: number; after: number; hit: boolean;
}

const MAX = 4;
/** 人物立板上「胸口」离立板中心多高（立板里人物在中间偏下） */
const CHEST = -118;
/** 第五轮：甬道里主角立板的中心高度（原来 62，头正好顶在甬道尽头的出口光上，像一颗白光球盖住了人；压低到出口光下面） */
export const PASSAGE_HERO_Y = 40;
const RING_FS = `uniform float uA; uniform float uT; varying vec2 vUv;
void main(){
  float d = length(vUv - 0.5) * 2.0;
  float ring = exp(-pow((d - 0.74) * 10.0, 2.0)), inner = exp(-pow((d - 0.42) * 14.0, 2.0)) * 0.45;
  // 四道朝里收的刻痕：像准星
  float ang = atan(vUv.y - 0.5, vUv.x - 0.5), ticks = pow(abs(cos(ang * 2.0)), 40.0) * step(0.5, d) * step(d, 0.95);
  float core = pow(max(0.0, 1.0 - d), 3.0) * 0.18;
  float a = (ring + inner + ticks * 0.8 + core) * uA;
  gl_FragColor = vec4(vec3(1.0, 0.42, 0.26) * a + vec3(1.0, 0.85, 0.6) * ring * uA * 0.35, 1.0);   // 叠加：颜色里已乘好，透明度给 1
}`;
const STREAK_FS = `varying vec2 vUv; varying vec2 vA;
void main(){
  float across = 1.0 - abs(vUv.y - 0.5) * 2.0;
  // vA.y：0＝来向光（两头淡），1＝剑光（剑尖最亮、往后拖成尾）
  float line = pow(across, 2.0) * sin(vUv.x * 3.14159);
  float blade = pow(across, 1.4 + (1.0 - vUv.x) * 4.0) * pow(vUv.x, 0.6);
  float k = mix(line, blade, vA.y);
  vec3 c = mix(vec3(1.0, 0.45, 0.3), mix(vec3(1.0, 0.55, 0.35), vec3(1.0, 0.95, 0.85), pow(vUv.x, 3.0)), vA.y);
  float a = k * vA.x;
  gl_FragColor = vec4(c * a, 1.0);
}`;
const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const STREAK_VS = `attribute vec2 aA; varying vec2 vUv; varying vec2 vA; void main(){ vUv = uv; vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export class TunnelBladesFx {
  private rings: { mesh: Mesh; mat: ShaderMaterial }[] = [];
  private streak: Mesh; private pos: Float32Array; private uv: Float32Array; private aA: Float32Array; private geo: BufferGeometry;
  private d = new Vector3(); private s = new Vector3(); private m = new Vector3();

  constructor(scene: Scene) {
    for (let i = 0; i < MAX; i++) {
      const mat = new ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: AdditiveBlending, uniforms: { uA: { value: 0 }, uT: { value: 0 } }, vertexShader: VS, fragmentShader: RING_FS });
      const mesh = new Mesh(new PlaneGeometry(1, 1), mat); mesh.renderOrder = 3.6; mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh);
      this.rings.push({ mesh, mat });
    }
    const quads = MAX * 2;
    this.pos = new Float32Array(quads * 4 * 3); this.uv = new Float32Array(quads * 4 * 2); this.aA = new Float32Array(quads * 4 * 2);
    const idx: number[] = [];
    for (let q = 0; q < quads; q++) { const o = q * 4; idx.push(o, o + 1, o + 2, o, o + 2, o + 3); this.uv.set([0, 0, 0, 1, 1, 1, 1, 0], q * 8); }
    this.geo = new BufferGeometry();
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3)); this.geo.setAttribute('uv', new BufferAttribute(this.uv, 2)); this.geo.setAttribute('aA', new BufferAttribute(this.aA, 2));
    this.geo.setIndex(idx);
    const mat = new ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, side: DoubleSide, blending: AdditiveBlending, vertexShader: STREAK_VS, fragmentShader: STREAK_FS });
    this.streak = new Mesh(this.geo, mat); this.streak.renderOrder = 3.7; this.streak.frustumCulled = false; this.streak.visible = false; scene.add(this.streak);
  }

  /** 每帧：baseZ 是主角这一刻在甬道里的进深（不算往前蹿），surgeDepth 是蹿到最前多深，fade 是甬道整体显几成 */
  update(list: readonly TunnelBladeView[], baseZ: number, surgeDepth: number, time: number, fade: number): void {
    for (const r of this.rings) r.mesh.visible = false;
    this.aA.fill(0);
    let q = 0;
    const quad = (p0: Vector3, p1: Vector3, w: number, alpha: number, kind: number) => {
      if (q >= MAX * 2 || alpha <= 0.002) return;
      // 面片躺在「过这条线、正对镜头」的平面里：宽度方向＝线的方向 × 视线
      this.d.subVectors(p1, p0); this.m.addVectors(p0, p1).multiplyScalar(0.5);
      this.s.crossVectors(this.d, this.m).normalize().multiplyScalar(w);
      const o = q * 12;
      this.pos[o] = p0.x - this.s.x; this.pos[o + 1] = p0.y - this.s.y; this.pos[o + 2] = p0.z - this.s.z;
      this.pos[o + 3] = p0.x + this.s.x; this.pos[o + 4] = p0.y + this.s.y; this.pos[o + 5] = p0.z + this.s.z;
      this.pos[o + 6] = p1.x + this.s.x; this.pos[o + 7] = p1.y + this.s.y; this.pos[o + 8] = p1.z + this.s.z;
      this.pos[o + 9] = p1.x - this.s.x; this.pos[o + 10] = p1.y - this.s.y; this.pos[o + 11] = p1.z - this.s.z;
      for (let v = 0; v < 4; v++) { this.aA[q * 8 + v * 2] = alpha; this.aA[q * 8 + v * 2 + 1] = kind; }
      q++;
    };
    const from = new Vector3(), to = new Vector3(), head = new Vector3(), tail = new Vector3();
    list.slice(0, MAX).forEach((v, i) => {
      // 出手的地方：追兵身侧举剑处（往外、往上、往镜头这边各让开一段，剑光飞过来的路才看得清）
      from.set(v.fx + Math.sign(v.fx || 1) * 120, 62 + v.fy + CHEST + 150, Math.min(-60, baseZ + v.fz + 90));
      to.set(v.sx * 80, PASSAGE_HERO_Y + v.sy * 50 + CHEST, baseZ - v.sz * surgeDepth);
      // —— 落点：预警时一圈光由大收小、越闪越急；打中那一下猛亮后散去
      const R = this.rings[i];
      let ra = 0, size = 150;
      if (v.fly <= 0) { const pulse = 0.72 + 0.28 * Math.sin(time * (14 + v.warn * 26)); ra = Math.min(1, v.warn * 3) * pulse; size = 130 - v.warn * 50; }
      else if (v.after <= 0) { ra = 0.9; size = 80; }
      else if (v.hit) { ra = Math.max(0, 1 - v.after / 0.35) * 1.4; size = 80 + v.after * 300; }
      if (ra > 0.002) {
        R.mesh.visible = true; R.mesh.position.copy(to); R.mesh.scale.set(size, size, 1);
        R.mat.uniforms.uA.value = ra * fade; R.mat.uniforms.uT.value = time;
      }
      // —— 来向：从追兵到落点的一道细光（预警时）
      if (v.fly <= 0) quad(from, to, 6, 0.7 * Math.min(1, v.warn * 2.5) * fade, 0);
      // —— 剑光：出手后飞向落点；躲开就继续往深处飞走，打中就停在落点散掉
      if (v.fly > 0) {
        this.d.subVectors(to, from).normalize();
        if (v.after <= 0) head.lerpVectors(from, to, Math.min(1, v.fly));
        else if (v.hit) head.copy(to);
        else head.copy(to).addScaledVector(this.d, v.after * 2600);
        const fadeOut = v.after <= 0 ? 1 : v.hit ? Math.max(0, 1 - v.after / 0.2) : Math.max(0, 1 - v.after / 0.45);
        tail.copy(head).addScaledVector(this.d, -110);
        quad(tail, head, 10, fadeOut * fade, 1);
        tail.copy(head).addScaledVector(this.d, -360);
        quad(tail, head, 5, 0.5 * fadeOut * fade, 0);
      }
    });
    this.streak.visible = q > 0;
    if (q > 0) { (this.geo.attributes.position as BufferAttribute).needsUpdate = true; (this.geo.attributes.aA as BufferAttribute).needsUpdate = true; }
  }

  dispose(): void { this.geo.dispose(); (this.streak.material as ShaderMaterial).dispose(); for (const r of this.rings) { r.mesh.geometry.dispose(); r.mat.dispose(); } }
}
