// P3：贴合地形的瀑布。原来野外的瀑布是一张画好的「崖壁 + 水」立板，高山模式下立在真实山体前面，和山形对不上（崖是画的、山是真的）。
// 立体画面里改成：在瀑布的位置找真实地形最陡的那一面坡，从坡顶顺着坡面挂一道流动的水幕下来，落到坡缓处翻起水雾——
// 水幕贴着真实的山体走（往外让开一点不穿模）。水幕、水雾的着色器和占山宗门的瀑布共用（sectFx.ts）。
// 找不到够陡的坡（瀑布落在平地上）就不画，宁缺毋滥。
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, ShaderMaterial, Vector4, type Texture } from 'three';
import { FALL_VS, FALL_FS } from './sectFx';

interface FallIn { id: string; x: number; y: number; w: number; h: number }
interface Built { mesh: Mesh | null; used: number }

export class TerrainFalls {
  readonly group = new Group();
  private readonly mat: ShaderMaterial;
  private built = new Map<string, Built>();
  private frame = 0;
  /** 这一帧要画的瀑布（渲染器在收集景物时登记，render 前 sync） */
  private want: FallIn[] = [];
  constructor(noise: Texture | null) {
    this.mat = new ShaderMaterial({ vertexShader: FALL_VS, fragmentShader: FALL_FS, transparent: true, premultipliedAlpha: true, depthWrite: false, side: DoubleSide,
      uniforms: { uT: { value: new Vector4(0, 1, 0.15, 0) }, uNoise: { value: noise } } });
  }
  add(f: FallIn): void { this.want.push(f); }

  /** 每帧：建新露出来的（一帧最多一道）、藏起这帧没登记的、太久没用的扔掉 */
  sync(heightAt: (x: number, y: number) => number, time: number, night: number): void {
    this.frame++;
    let budget = 1;
    for (const f of this.want) {
      let b = this.built.get(f.id);
      if (!b) { if (budget-- <= 0) continue; b = { mesh: this.build(f, heightAt), used: 0 }; this.built.set(f.id, b); if (b.mesh) this.group.add(b.mesh); }
      b.used = this.frame;
    }
    this.want.length = 0;
    for (const [id, b] of this.built) {
      if (b.mesh) b.mesh.visible = b.used === this.frame;
      if (this.frame - b.used > 600) { if (b.mesh) { this.group.remove(b.mesh); b.mesh.geometry.dispose(); } this.built.delete(id); }
    }
    const u = this.mat.uniforms.uT.value as Vector4;
    u.x = time; u.y = 1 - night * 0.45; u.z = 0.15 * (1 - night * 0.5);
  }

  private build(f: FallIn, H: (x: number, y: number) => number): Mesh | null {
    // 在瀑布脚下周围找「往哪边上去最陡」：16 个方向、几种距离，取高差 / 距离最大的那一个方向
    const h0 = H(f.x, f.y);
    let best = { dx: 0, dy: -1, rise: 0, grade: 0 }, down = { dx: 0, dy: 1, rise: 0, grade: 0 };
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
      for (const d of [200, 400, 700, 1000]) {
        const rise = H(f.x + dx * d, f.y + dy * d) - h0, g = rise / d;
        if (g > best.grade) best = { dx, dy, rise, grade: g };
        if (-g > down.grade) down = { dx, dy, rise: -rise, grade: -g };
      }
    }
    // 瀑布点在坡脚：往上找崖口；在崖顶 / 山脊上（四面都往下）：就从这里往最陡的那面倾泻下去。坡度不到 0.9、高差不到 300 的缓坡不挂（归墟殿那种缓坡上挂出来是一块平平的蓝板）
    let top = 0;
    if (best.grade >= 0.9 && best.rise >= 300) {
      let last = h0;
      for (let d = 40; d < 2400; d += 40) {
        const h = H(f.x + best.dx * d, f.y + best.dy * d);
        if (h - last < 40 * 0.3 && d > 160) break;
        last = h; top = d;
      }
    } else if (down.grade >= 0.9 && down.rise >= 300) best = { dx: -down.dx, dy: -down.dy, rise: down.rise, grade: down.grade };
    else return null;   // 平地上不挂瀑布
    const px = -best.dy, py = best.dx, w = Math.max(60, Math.min(260, f.w * 0.35));
    // 从崖口往下（沿 -dir）取剖面：水幕贴着坡面、往外让开一点；比上一点高的地方（坡上的鼓包）按上一点走，水不往上流
    const prof: [number, number, number][] = [];
    let prev = Infinity;
    for (let d = top; d >= -2400; d -= 30) {
      const x = f.x + best.dx * d, y = f.y + best.dy * d, h = H(x, y) + 16;
      const hh = Math.min(prev, h); prof.push([x, y, hh]); prev = hh;
      if (d < 0 && prof.length > 2 && prof[prof.length - 2][2] - hh < 30 * 0.2) break;   // 落到坡缓处
    }
    if (prof.length < 3) return null;
    const pos: number[] = [], fall: number[] = [];
    const v = (x: number, y: number, z: number, u: number, d: number, kind: number) => { pos.push(x, y, z); fall.push(u, d, kind); };
    const quad = (a: number[], b: number[], c: number[], d: number[]) => { for (const q of [a, b, c, a, c, d]) v(q[0], q[1], q[2], q[3], q[4], q[5]); };
    let run = 0;
    for (let i = 0; i + 1 < prof.length; i++) {
      const [x0, y0, h0b] = prof[i], [x1, y1, h1] = prof[i + 1], seg = Math.hypot(x1 - x0, y1 - y0, h1 - h0b);
      const w0 = w * (0.7 + 0.3 * i / prof.length), w1 = w * (0.7 + 0.3 * (i + 1) / prof.length);
      // 往外让开一点：沿下坡方向（镜头一侧）挪 18，免得和地形网格打架
      const ox = -best.dx * 18, oy = -best.dy * 18;
      quad([x0 + ox - px * w0 / 2, h0b, y0 + oy - py * w0 / 2, 0, run, 0], [x0 + ox + px * w0 / 2, h0b, y0 + oy + py * w0 / 2, 1, run, 0],
        [x1 + ox + px * w1 / 2, h1, y1 + oy + py * w1 / 2, 1, run + seg, 0], [x1 + ox - px * w1 / 2, h1, y1 + oy - py * w1 / 2, 0, run + seg, 0]);
      run += seg;
    }
    // 落水处：几片交叉的竖片水雾
    const [ex, ey, eh] = prof[prof.length - 1], R = w * 1.3;
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * Math.PI, cx = Math.cos(a) * R, cy = Math.sin(a) * R;
      quad([ex - cx, eh - 20, ey - cy, 0, 0, 1], [ex + cx, eh - 20, ey + cy, 1, 0, 1], [ex + cx, eh + R, ey + cy, 1, 1, 1], [ex - cx, eh + R, ey - cy, 0, 1, 1]);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('aFall', new Float32BufferAttribute(fall, 3));
    geo.computeBoundingSphere();
    const mesh = new Mesh(geo, this.mat); mesh.renderOrder = 4;
    return mesh;
  }

  dispose(): void { for (const b of this.built.values()) b.mesh?.geometry.dispose(); this.mat.dispose(); }
}
