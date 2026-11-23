// 顶点批次：所有特效都化为带 UV 与预乘颜色的三角形，一次绘制调用画完。
// 颜色约定：add=1 为纯加色（发光），add=0 为普通覆盖（墨、烟）；介于之间可混合。
import { cellUV } from '../../src/gl/atlas';

export const FLOATS = 9; // x y u v r g b a clipDepth

export interface Seg { tex: WebGLTexture | null; start: number; count: number }
export interface GroundAnchor { readonly x: number; readonly y: number; readonly offsetY?: number }
export interface HdProjection {
  readonly affine: readonly number[];
  readonly heightAt: (x: number, y: number) => number;
  readonly heightScale: number;
  readonly heightBoost: number;
  readonly depthAt: (x: number, y: number, absoluteHeight: number) => number;
}

export class Batch {
  data = new Float32Array(FLOATS * 6 * 4096);
  n = 0; // 顶点数
  segs: Seg[] = [];
  private cur: WebGLTexture | null = null;
  private groundVertices = new Float32Array(12);
  // 屏幕变换：世界 -> CSS 像素
  cx = 0; cy = 0; z = 1; hw = 0; hh = 0;

  reset(camX: number, camY: number, z: number, W: number, H: number, atlas: WebGLTexture | null) {
    this.n = 0; this.segs.length = 0; this.cur = null;
    this.cx = camX; this.cy = camY; this.z = z; this.hw = W / 2; this.hh = H / 2;
    this.billboard = null;
    this.tex(atlas);
  }
  tex(t: WebGLTexture | null) {
    if (t === this.cur && this.segs.length) return;
    const last = this.segs[this.segs.length - 1];
    if (last && last.count === 0) { last.tex = t; this.cur = t; return; }
    this.segs.push({ tex: t, start: this.n, count: 0 });
    this.cur = t;
  }
  private grow(v: number) {
    const required = (this.n + v) * FLOATS, limit = FLOATS * 6 * 65536;
    if (required > limit) return false;
    if (required <= this.data.length) return true;
    let capacity = this.data.length;
    while (capacity < required) capacity = Math.min(capacity * 2, limit);
    const d = new Float32Array(capacity); d.set(this.data); this.data = d; return true;
  }
  sx(x: number) { return (x - this.cx) * this.z + this.hw; }
  sy(y: number) { return (y - this.cy) * this.z + this.hh; }
  hd: HdProjection | null = null;
  /** 非空时传入的 x/y 是相对于该地面锚点的立板坐标。 */
  billboard: GroundAnchor | null = null;
  ox = 0; oy = 0; od = -1;
  pt(x: number, y: number, verticalOffset = 0, groundBias = 0) {
    const hd = this.hd;
    if (!hd) { this.ox = (x - this.cx) * this.z + this.hw; this.oy = (y - this.cy + verticalOffset + (this.billboard?.offsetY ?? 0)) * this.z + this.hh; this.od = -1; return; }
    const anchor = this.billboard, gx = anchor ? anchor.x : x, gy = anchor ? anchor.y : y;
    const dx = anchor ? x - gx : 0, dy = (anchor ? y - gy + (anchor.offsetY ?? 0) : 0) + verticalOffset;
    const height = hd.heightAt(gx, gy) + groundBias, A = hd.affine;
    this.ox = A[0] * gx + A[1] * gy + A[2] + dx * this.z;
    this.oy = A[3] * gx + A[4] * gy + A[5] - height * hd.heightScale + dy * this.z;
    this.od = hd.depthAt(gx, gy, height - dy * hd.heightBoost);
  }

  direction(vx: number, vy: number): number {
    const hd = this.hd;
    if (!hd || this.billboard) return Math.atan2(vy, vx);
    const A = hd.affine;
    return Math.atan2(A[3] * vx + A[4] * vy, A[0] * vx + A[1] * vy);
  }

  private v(x: number, y: number, u: number, vv: number, r: number, g: number, b: number, a: number, depth: number) {
    const d = this.data, i = this.n * FLOATS;
    d[i] = x; d[i + 1] = y; d[i + 2] = u; d[i + 3] = vv; d[i + 4] = r; d[i + 5] = g; d[i + 6] = b; d[i + 7] = a;
    d[i + 8] = depth;
    this.n++;
  }

  /** 屏幕空间旋转四边形（CSS 像素）。col 为 0..1 RGB */
  quadS(cell: number, x: number, y: number, w: number, h: number, rot: number, r: number, g: number, b: number, a: number, add: number, uv?: [number, number, number, number], sq = 1, depth = -1) {
    if (a <= 0.002 || w < 0.05 || h < 0.05) return;
    if (x + w + h < -50 || y + w + h < -50 || x - w - h > this.hw * 2 + 50 || y - w - h > this.hh * 2 + 50) return;
    if (!this.grow(6)) return;
    const [u0, v0, u1, v1] = uv ?? cellUV(cell);
    const c = Math.cos(rot), s = Math.sin(rot), hw = w / 2, hh = h / 2;
    const ax = c * hw, ay = s * hw * sq, bx = -s * hh, by = c * hh * sq;   // sq：旋转后再纵向压扁（地面透视）
    const pr = r * a, pg = g * a, pb = b * a, pa = a * (1 - add);
    const x0 = x - ax - bx, y0 = y - ay - by; // 左上
    const x1 = x + ax - bx, y1 = y + ay - by; // 右上
    const x2 = x + ax + bx, y2 = y + ay + by; // 右下
    const x3 = x - ax + bx, y3 = y - ay + by; // 左下
    this.v(x0, y0, u0, v0, pr, pg, pb, pa, depth); this.v(x1, y1, u1, v0, pr, pg, pb, pa, depth); this.v(x2, y2, u1, v1, pr, pg, pb, pa, depth);
    this.v(x0, y0, u0, v0, pr, pg, pb, pa, depth); this.v(x2, y2, u1, v1, pr, pg, pb, pa, depth); this.v(x3, y3, u0, v1, pr, pg, pb, pa, depth);
    this.segs[this.segs.length - 1].count += 6;
  }
  /** 世界坐标四边形（尺寸亦为世界单位） */
  quad(cell: number, x: number, y: number, w: number, h: number, rot: number, r: number, g: number, b: number, a: number, add: number) {
    this.pt(x, y); this.quadS(cell, this.ox, this.oy, w * this.z, h * this.z, rot, r, g, b, a, add, undefined, 1, this.od);
  }
  /** 地面贴花：贴图先在地面上旋转，再按透视压扁 */
  groundQuad(cell: number, x: number, y: number, r: number, rot: number, cr: number, cg: number, cb: number, a: number, add: number, squash: number, uv?: [number, number, number, number]) {
    const anchor = this.billboard;
    this.billboard = null;
    if (!this.hd) {
      this.pt(x, y); this.quadS(cell, this.ox, this.oy, r * 2 * this.z, r * 2 * this.z, rot, cr, cg, cb, a, add, uv, squash, this.od);
      this.billboard = anchor; return;
    }
    const segments = Math.min(64, Math.max(1, Math.ceil(r * 2 / 128))), side = segments + 1;
    if (a <= 0.002 || r * this.z < 0.025 || !this.grow(segments * segments * 6)) { this.billboard = anchor; return; }
    const needed = side * side * 3;
    if (this.groundVertices.length < needed) this.groundVertices = new Float32Array(needed);
    const vertices = this.groundVertices, c = Math.cos(rot), s = Math.sin(rot);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let iy = 0; iy <= segments; iy++) for (let ix = 0; ix <= segments; ix++) {
      const u = ix / segments * 2 - 1, v = iy / segments * 2 - 1;
      this.pt(x + (c * u - s * v) * r, y + (s * u + c * v) * r, 0, 0.7);
      const i = (iy * side + ix) * 3; vertices[i] = this.ox; vertices[i + 1] = this.oy; vertices[i + 2] = this.od;
      minX = Math.min(minX, this.ox); minY = Math.min(minY, this.oy); maxX = Math.max(maxX, this.ox); maxY = Math.max(maxY, this.oy);
    }
    if (maxX < -50 || maxY < -50 || minX > this.hw * 2 + 50 || minY > this.hh * 2 + 50) { this.billboard = anchor; return; }
    const [u0, v0, u1, v1] = uv ?? cellUV(cell), pr = cr * a, pg = cg * a, pb = cb * a, pa = a * (1 - add);
    for (let iy = 0; iy < segments; iy++) for (let ix = 0; ix < segments; ix++) {
      const i0 = (iy * side + ix) * 3, i1 = i0 + 3, i3 = i0 + side * 3, i2 = i3 + 3;
      const l = u0 + (u1 - u0) * ix / segments, r = u0 + (u1 - u0) * (ix + 1) / segments;
      const t = v0 + (v1 - v0) * iy / segments, b = v0 + (v1 - v0) * (iy + 1) / segments;
      this.v(vertices[i0], vertices[i0 + 1], l, t, pr, pg, pb, pa, vertices[i0 + 2]); this.v(vertices[i1], vertices[i1 + 1], r, t, pr, pg, pb, pa, vertices[i1 + 2]); this.v(vertices[i2], vertices[i2 + 1], r, b, pr, pg, pb, pa, vertices[i2 + 2]);
      this.v(vertices[i0], vertices[i0 + 1], l, t, pr, pg, pb, pa, vertices[i0 + 2]); this.v(vertices[i2], vertices[i2 + 1], r, b, pr, pg, pb, pa, vertices[i2 + 2]); this.v(vertices[i3], vertices[i3 + 1], l, b, pr, pg, pb, pa, vertices[i3 + 2]);
    }
    this.segs[this.segs.length - 1].count += segments * segments * 6;
    this.billboard = anchor;
  }
  /** 整张纹理（神识圈等）世界坐标 */
  texQuad(x: number, y: number, size: number, rot: number, a: number, add: number, tint: [number, number, number] = [1, 1, 1], sy = 1) {
    this.pt(x, y); this.quadS(-1, this.ox, this.oy, size * this.z, size * this.z, rot, tint[0], tint[1], tint[2], a, add, [0, 0, 1, 1], sy, this.od);
  }

  /** 折线条带（世界坐标）。w(i) 返回世界宽度，al(i) 返回该点透明度 */
  strip(cell: number, pts: ArrayLike<number>, n: number, w: (i: number) => number, al: (i: number) => number, r: number, g: number, b: number, add: number, verticalOffset: number | ArrayLike<number> = 0) {
    if (n < 2 || !this.grow((n - 1) * 6)) return;
    const [u0, v0, u1, v1] = cellUV(cell);
    const um = (u0 + u1) / 2;
    let pxL = 0, pyL = 0, pxR = 0, pyR = 0, pa = 0, pd = -1;
    let added = 0;
    for (let i = 0; i < n; i++) {
      const offset = typeof verticalOffset === 'number' ? verticalOffset : verticalOffset[i];
      const bias = !this.billboard && offset === 0 ? 0.7 : 0;
      this.pt(pts[i * 2], pts[i * 2 + 1], offset, bias); const x = this.ox, y = this.oy, depth = this.od;
      const j0 = Math.max(0, i - 1), j1 = Math.min(n - 1, i + 1);
      const offset0 = typeof verticalOffset === 'number' ? verticalOffset : verticalOffset[j0];
      const offset1 = typeof verticalOffset === 'number' ? verticalOffset : verticalOffset[j1];
      this.pt(pts[j1 * 2], pts[j1 * 2 + 1], offset1, !this.billboard && offset1 === 0 ? 0.7 : 0); let dx = this.ox, dy = this.oy;
      this.pt(pts[j0 * 2], pts[j0 * 2 + 1], offset0, !this.billboard && offset0 === 0 ? 0.7 : 0); dx -= this.ox; dy -= this.oy;
      const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      const hw = w(i) * this.z * 0.5;
      const lx = x - dy * hw, ly = y + dx * hw, rx = x + dy * hw, ry = y - dx * hw;
      const a = Math.max(0, al(i));
      if (i > 0) {
        const ca = pa, cb = a;
        const P = (aa: number) => [r * aa, g * aa, b * aa, aa * (1 - add)] as const;
        const A = P(ca), B = P(cb);
        this.v(pxL, pyL, um, v0, A[0], A[1], A[2], A[3], pd); this.v(pxR, pyR, um, v1, A[0], A[1], A[2], A[3], pd); this.v(rx, ry, um, v1, B[0], B[1], B[2], B[3], depth);
        this.v(pxL, pyL, um, v0, A[0], A[1], A[2], A[3], pd); this.v(rx, ry, um, v1, B[0], B[1], B[2], B[3], depth); this.v(lx, ly, um, v0, B[0], B[1], B[2], B[3], depth);
        added += 6;
      }
      pxL = lx; pyL = ly; pxR = rx; pyR = ry; pa = a; pd = depth;
    }
    this.segs[this.segs.length - 1].count += added;
  }
}
