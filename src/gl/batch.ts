// 顶点批次：所有特效都化为带 UV 与预乘颜色的三角形，一次绘制调用画完。
// 颜色约定：add=1 为纯加色（发光），add=0 为普通覆盖（墨、烟）；介于之间可混合。
import { cellUV } from './atlas';

export const FLOATS = 9; // x y u v r g b a clipDepth

/** 贴地贴花的投影参数：圆心、半径（世界单位）、旋转，以及贴图在图集里的范围 */
export interface GroundDecal { x: number; y: number; r: number; rot: number; u0: number; v0: number; u1: number; v1: number }
export interface Seg { tex: WebGLTexture | null; start: number; count: number; decal?: GroundDecal }
export interface GroundAnchor { readonly x: number; readonly y: number; readonly offsetY?: number }
export interface HdProjection {
  readonly affine: readonly number[];
  readonly heightAt: (x: number, y: number) => number;
  readonly heightScale: number;
  readonly heightBoost: number;
  readonly depthAt: (x: number, y: number, absoluteHeight: number) => number;
  readonly groundBounds: (pad?: number) => { l: number; t: number; r: number; b: number };
  /** 世界点（x，绝对高度，y）→ 屏幕，结果在 sx / sy / sd / ss */
  projectPoint(x: number, height: number, y: number): void;
  readonly sx: number; readonly sy: number; readonly sd: number; readonly ss: number;
  /** 屏幕右方在地面上的方向 */
  readonly rx: number; readonly ry: number;
}

/** 旧式仿射投影：只有 affine / heightScale / depthAt，没有矩阵接口（早期测试和旧代码这样造投影对象） */
export type LegacyProjection = Pick<HdProjection, 'affine' | 'heightAt' | 'heightScale' | 'heightBoost' | 'depthAt' | 'groundBounds'>;
/** 给旧式仿射投影补上 projectPoint 等接口，行为与原来按仿射计算完全一致（只适用于正交相机） */
export function legacyProjection(base: LegacyProjection): HdProjection {
  const A = base.affine, zoom = Math.hypot(A[0], A[1]) || 1;
  const out = {
    ...base, sx: 0, sy: 0, sd: 0, ss: zoom, rx: A[0] / zoom, ry: A[1] / zoom,
    projectPoint(x: number, height: number, y: number) {
      out.sx = A[0] * x + A[1] * y + A[2];
      out.sy = A[3] * x + A[4] * y + A[5] - height * base.heightScale;
      out.sd = base.depthAt(x, y, height);
    },
  };
  return out;
}

interface GroundVertex { x: number; y: number; depth: number; u: number; v: number }

function clipGround(vertices: GroundVertex[], axis: 'u' | 'v', edge: number, lower: boolean): GroundVertex[] {
  const out: GroundVertex[] = [];
  let prev = vertices[vertices.length - 1], insidePrev = lower ? prev[axis] >= edge : prev[axis] <= edge;
  for (const cur of vertices) {
    const insideCur = lower ? cur[axis] >= edge : cur[axis] <= edge;
    if (insidePrev !== insideCur) {
      const f = (edge - prev[axis]) / (cur[axis] - prev[axis]);
      out.push({ x: prev.x + (cur.x - prev.x) * f, y: prev.y + (cur.y - prev.y) * f,
        depth: prev.depth + (cur.depth - prev.depth) * f, u: prev.u + (cur.u - prev.u) * f, v: prev.v + (cur.v - prev.v) * f });
    }
    if (insideCur) out.push(cur);
    prev = cur; insidePrev = insideCur;
  }
  return out;
}

export class Batch {
  data = new Float32Array(FLOATS * 6 * 4096);
  n = 0; // 顶点数
  segs: Seg[] = [];
  private cur: WebGLTexture | null = null;
  private groundVertices = new Float64Array(20);
  private groundView: { l: number; t: number; r: number; b: number } | null = null;
  // 屏幕变换：世界 -> CSS 像素
  cx = 0; cy = 0; z = 1; hw = 0; hh = 0;

  reset(camX: number, camY: number, z: number, W: number, H: number, atlas: WebGLTexture | null) {
    this.n = 0; this.segs.length = 0; this.cur = null;
    this.cx = camX; this.cy = camY; this.z = z; this.hw = W / 2; this.hh = H / 2;
    this.billboard = null; this.groundView = null;
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
  private projection: HdProjection | null = null;
  get hd(): HdProjection | null { return this.projection; }
  /** 接受旧式仿射投影对象，自动补齐矩阵接口 */
  set hd(value: HdProjection | LegacyProjection | null) {
    this.projection = value && !('projectPoint' in value) ? legacyProjection(value) : value as HdProjection | null;
  }
  /**
   * 贴地贴花交给显卡投影：只发一个屏幕包围矩形，片元着色器读地表深度还原世界坐标再取贴图。
   * 以前在 CPU 上按 64 单位网格逐格切分（神识圈一帧上千格、2.5–8 ms），地形越陡越贵；现在与地形起伏无关。
   * 由渲染器在 HD 模式下打开；关掉则走原来的逐格切分。
   */
  gpuDecals = false;
  /**
   * 收官 B3：「活动落脚面」（鲸背、灵舟甲板、鬼船甲板、祭坛礁盘）上的贴地特效抬到落脚面的高度。
   * 屏幕空间贴花读的是地表深度，这些面浮在地表之上、自己写深度，贴花画在它们下面就被挡住了（神识圈、涟漪在鲸背上看不见）。
   * 返回离地多高（与立板的 lift 同单位；0 = 不在这些面上，照旧）。由 world/jueyu.ts 挂上。
   */
  deckAt: ((x: number, y: number, r: number) => number) | null = null;
  /** 非空时传入的 x/y 是相对于该地面锚点的立板坐标。 */
  billboard: GroundAnchor | null = null;
  ox = 0; oy = 0; od = -1;
  /** 上一次 pt() 那个点处的局部缩放（像素 / 世界单位）：2D 与正交相机下恒等于 z；透视相机下近大远小 */
  os = 1;
  pt(x: number, y: number, verticalOffset = 0, groundBias = 0) {
    const hd = this.hd;
    if (!hd) { this.ox = (x - this.cx) * this.z + this.hw; this.oy = (y - this.cy + verticalOffset + (this.billboard?.offsetY ?? 0)) * this.z + this.hh; this.od = -1; this.os = this.z; return; }
    const anchor = this.billboard, gx = anchor ? anchor.x : x, gy = anchor ? anchor.y : y;
    const dx = anchor ? x - gx : 0, dy = (anchor ? y - gy + (anchor.offsetY ?? 0) : 0) + verticalOffset;
    const height = hd.heightAt(gx, gy) + groundBias;
    // 立板平面内的偏移：横向沿屏幕右方（贴着地面），纵向是世界竖直方向（按 heightBoost 拉回 2D 比例）。
    // 和立板着色器摆顶点的方式完全一致，所以特效、钩绳端点与人物立板在任何相机下都对得上。
    hd.projectPoint(gx + hd.rx * dx, height - dy * hd.heightBoost, gy + hd.ry * dx);
    this.ox = hd.sx; this.oy = hd.sy; this.od = hd.sd; this.os = hd.ss;
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
  /** 收官 B3：落脚面上的贴地特效——一块抬到 lift 高度的水平四边形；整片取最近一角的深度再往前挪一点，免得被落脚面（或船的立板）切掉半边 */
  private deckQuad(cell: number, x: number, y: number, r: number, c: number, s: number, cr: number, cg: number, cb: number, a: number, add: number, lift: number, uv?: [number, number, number, number]) {
    const hd = this.hd!, h = hd.heightAt(x, y) + lift * hd.heightBoost;
    const P: [number, number, number][] = [];
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) { hd.projectPoint(x + r * (u * c - v * s), h, y + r * (u * s + v * c)); P.push([hd.sx, hd.sy, hd.sd]); }
    if (Math.max(...P.map((q) => q[0])) < -50 || Math.max(...P.map((q) => q[1])) < -50 || Math.min(...P.map((q) => q[0])) > this.hw * 2 + 50 || Math.min(...P.map((q) => q[1])) > this.hh * 2 + 50 || !this.grow(6)) return;
    const d = Math.min(P[0][2], P[1][2], P[2][2], P[3][2]) - 0.0004;
    const [u0, v0, u1, v1] = uv ?? cellUV(cell), pr = cr * a, pg = cg * a, pb = cb * a, pa = a * (1 - add);
    this.v(P[0][0], P[0][1], u0, v0, pr, pg, pb, pa, d); this.v(P[1][0], P[1][1], u1, v0, pr, pg, pb, pa, d); this.v(P[2][0], P[2][1], u1, v1, pr, pg, pb, pa, d);
    this.v(P[0][0], P[0][1], u0, v0, pr, pg, pb, pa, d); this.v(P[2][0], P[2][1], u1, v1, pr, pg, pb, pa, d); this.v(P[3][0], P[3][1], u0, v1, pr, pg, pb, pa, d);
    this.segs[this.segs.length - 1].count += 6;
  }
  /** 世界坐标四边形（尺寸亦为世界单位） */
  quad(cell: number, x: number, y: number, w: number, h: number, rot: number, r: number, g: number, b: number, a: number, add: number) {
    // 跟着某个人物的特效（护体灵光、受击闪光、状态光效）：人物立板是竖着的，上端离镜头更近；
    // 特效整片只有一个深度，若取中心的深度，上半截就会被人物立板挡住、下半截盖在人物上——切成两截。取上沿的深度，整片都在人物前面
    let depth = 0, top = false;
    if (this.hd && this.billboard) { this.pt(x, y - Math.max(w, h) * 0.5); depth = this.od; top = true; }
    this.pt(x, y); this.quadS(cell, this.ox, this.oy, w * this.os, h * this.os, rot, r, g, b, a, add, undefined, 1, top ? Math.min(depth, this.od) : this.od);
  }
  /** 地面贴花：贴图先在地面上旋转，再按透视压扁 */
  groundQuad(cell: number, x: number, y: number, r: number, rot: number, cr: number, cg: number, cb: number, a: number, add: number, squash: number, uv?: [number, number, number, number]) {
    const anchor = this.billboard;
    this.billboard = null;
    if (!this.hd) {
      this.pt(x, y); this.quadS(cell, this.ox, this.oy, r * 2 * this.z, r * 2 * this.z, rot, cr, cg, cb, a, add, uv, squash, this.od);
      this.billboard = anchor; return;
    }
    if (a <= 0.002 || r * this.z < 0.025) { this.billboard = anchor; return; }
    const hd = this.hd, c = Math.cos(rot), s = Math.sin(rot), extent = r * (Math.abs(c) + Math.abs(s));
    { const lift = this.deckAt?.(x, y, r) ?? 0; if (lift > 0) { this.deckQuad(cell, x, y, r, c, s, cr, cg, cb, a, add, lift, uv); this.billboard = anchor; return; } }   // 收官 B3
    if (this.gpuDecals) {
      const W = this.hw * 2, H = this.hh * 2;
      let minX = 0, minY = 0, maxX = W, maxY = H;
      if (r <= 2048) {
        // 包围矩形：四角按仿射投影定横向范围；纵向再按范围内的地面高低放宽（高度只让屏幕位置上下挪）
        const n = Math.max(2, Math.min(8, Math.ceil(extent * 2 / 300)));
        let lo = Infinity, hi = -Infinity;
        for (let iy = 0; iy <= n; iy++) for (let ix = 0; ix <= n; ix++) {
          const h = hd.heightAt(x - extent + extent * 2 * ix / n, y - extent + extent * 2 * iy / n);
          if (h < lo) lo = h; if (h > hi) hi = h;
        }
        const slack = (hi - lo) * 0.2 + 24; lo -= slack; hi += slack;
        minX = minY = Infinity; maxX = maxY = -Infinity;
        for (let i = 0; i < 8; i++) {
          hd.projectPoint(x + (i & 1 ? extent : -extent), i & 4 ? hi : lo, y + (i & 2 ? extent : -extent));
          const px = hd.sx, py = hd.sy;
          if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py;
        }
        minX = Math.max(0, minX - 2); minY = Math.max(0, minY - 2); maxX = Math.min(W, maxX + 2); maxY = Math.min(H, maxY + 2);
      }
      if (minX >= maxX || minY >= maxY || !this.grow(6)) { this.billboard = anchor; return; }
      const [u0, v0, u1, v1] = uv ?? cellUV(cell), pr = cr * a, pg = cg * a, pb = cb * a, pa = a * (1 - add);
      const tex = this.cur;
      this.segs.push({ tex, start: this.n, count: 6, decal: { x, y, r, rot, u0, v0, u1, v1 } });
      this.v(minX, minY, 0, 0, pr, pg, pb, pa, 0); this.v(maxX, minY, 1, 0, pr, pg, pb, pa, 0); this.v(maxX, maxY, 1, 1, pr, pg, pb, pa, 0);
      this.v(minX, minY, 0, 0, pr, pg, pb, pa, 0); this.v(maxX, maxY, 1, 1, pr, pg, pb, pa, 0); this.v(minX, maxY, 0, 1, pr, pg, pb, pa, 0);
      this.segs.push({ tex, start: this.n, count: 0 });
      this.billboard = anchor; return;
    }
    let left = x - extent, right = x + extent, top = y - extent, bottom = y + extent;
    if (r > 2048) {
      const view = this.groundView ?? (this.groundView = hd.groundBounds(400));
      left = Math.max(left, view.l); right = Math.min(right, view.r);
      top = Math.max(top, view.t); bottom = Math.min(bottom, view.b);
      if (left >= right || top >= bottom) { this.billboard = anchor; return; }
    }
    const step = 64, x0 = Math.floor(left / step), x1 = Math.ceil(right / step);
    const y0 = Math.floor(top / step), y1 = Math.ceil(bottom / step), nx = x1 - x0, ny = y1 - y0, side = nx + 1;
    // 超大贴图只检查视野内网格，不能把视野外未检查的地面当作平面。
    if (r <= 2048) {
      const flatHeight = hd.heightAt(x0 * step, y0 * step);
      let flat = true;
      flatScan: for (let iy = 0; iy <= ny; iy++) for (let ix = 0; ix <= nx; ix++) {
        if (hd.heightAt((x0 + ix) * step, (y0 + iy) * step) !== flatHeight) { flat = false; break flatScan; }
      }
      if (flat) {
        const h = flatHeight + 0.7;
        const project = (wx: number, wy: number) => { hd.projectPoint(wx, h, wy); return [hd.sx, hd.sy, hd.sd] as const; };
        const p0 = project(x + r * (-c + s), y + r * (-s - c));
        const p1 = project(x + r * (c + s), y + r * (s - c));
        const p3 = project(x + r * (-c - s), y + r * (-s + c));
        const p2 = project(x + r * (c - s), y + r * (s + c));
        if (Math.max(p0[0], p1[0], p3[0], p2[0]) < -50 || Math.max(p0[1], p1[1], p3[1], p2[1]) < -50 ||
            Math.min(p0[0], p1[0], p3[0], p2[0]) > this.hw * 2 + 50 || Math.min(p0[1], p1[1], p3[1], p2[1]) > this.hh * 2 + 50 || !this.grow(6)) { this.billboard = anchor; return; }
        const [u0, v0, u1, v1] = uv ?? cellUV(cell), pr = cr * a, pg = cg * a, pb = cb * a, pa = a * (1 - add);
        this.v(p0[0], p0[1], u0, v0, pr, pg, pb, pa, p0[2]); this.v(p1[0], p1[1], u1, v0, pr, pg, pb, pa, p1[2]); this.v(p2[0], p2[1], u1, v1, pr, pg, pb, pa, p2[2]);
        this.v(p0[0], p0[1], u0, v0, pr, pg, pb, pa, p0[2]); this.v(p2[0], p2[1], u1, v1, pr, pg, pb, pa, p2[2]); this.v(p3[0], p3[1], u0, v1, pr, pg, pb, pa, p3[2]);
        this.segs[this.segs.length - 1].count += 6;
        this.billboard = anchor; return;
      }
    }
    const needed = (nx + 1) * (ny + 1) * 5;
    if (this.groundVertices.length < needed) this.groundVertices = new Float64Array(needed);
    const vertices = this.groundVertices;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let iy = 0; iy <= ny; iy++) for (let ix = 0; ix <= nx; ix++) {
      const wx = (x0 + ix) * step, wy = (y0 + iy) * step, dx = (wx - x) / r, dy = (wy - y) / r;
      this.pt(wx, wy, 0, 0.7);
      const i = (iy * side + ix) * 5; vertices[i] = this.ox; vertices[i + 1] = this.oy; vertices[i + 2] = this.od;
      vertices[i + 3] = (c * dx + s * dy + 1) * 0.5; vertices[i + 4] = (-s * dx + c * dy + 1) * 0.5;
      minX = Math.min(minX, this.ox); minY = Math.min(minY, this.oy); maxX = Math.max(maxX, this.ox); maxY = Math.max(maxY, this.oy);
    }
    if (maxX < -50 || maxY < -50 || minX > this.hw * 2 + 50 || minY > this.hh * 2 + 50) { this.billboard = anchor; return; }
    const [u0, v0, u1, v1] = uv ?? cellUV(cell), pr = cr * a, pg = cg * a, pb = cb * a, pa = a * (1 - add);
    const start = this.n;
    const point = (i: number): GroundVertex => ({ x: vertices[i], y: vertices[i + 1], depth: vertices[i + 2], u: vertices[i + 3], v: vertices[i + 4] });
    const emitPoint = (p: GroundVertex) => this.v(p.x, p.y, u0 + (u1 - u0) * p.u, v0 + (v1 - v0) * p.v, pr, pg, pb, pa, p.depth);
    const triangle = (ia: number, ib: number, ic: number): boolean => {
      const au = vertices[ia + 3], bu = vertices[ib + 3], cu = vertices[ic + 3];
      const av = vertices[ia + 4], bv = vertices[ib + 4], cv = vertices[ic + 4];
      if (Math.max(au, bu, cu) < 0 || Math.min(au, bu, cu) > 1 || Math.max(av, bv, cv) < 0 || Math.min(av, bv, cv) > 1) return true;
      if (Math.min(au, bu, cu, av, bv, cv) >= 0 && Math.max(au, bu, cu, av, bv, cv) <= 1) {
        if (!this.grow(3)) return false;
        this.v(vertices[ia], vertices[ia + 1], u0 + (u1 - u0) * au, v0 + (v1 - v0) * av, pr, pg, pb, pa, vertices[ia + 2]);
        this.v(vertices[ib], vertices[ib + 1], u0 + (u1 - u0) * bu, v0 + (v1 - v0) * bv, pr, pg, pb, pa, vertices[ib + 2]);
        this.v(vertices[ic], vertices[ic + 1], u0 + (u1 - u0) * cu, v0 + (v1 - v0) * cv, pr, pg, pb, pa, vertices[ic + 2]);
        return true;
      }
      let polygon = [point(ia), point(ib), point(ic)];
      for (const [axis, edge, lower] of [['u', 0, true], ['u', 1, false], ['v', 0, true], ['v', 1, false]] as const) {
        if (!polygon.length) return true;
        polygon = clipGround(polygon, axis, edge, lower);
      }
      const n = (polygon.length - 2) * 3;
      if (n <= 0) return true;
      if (!this.grow(n)) return false;
      for (let i = 1; i < polygon.length - 1; i++) { emitPoint(polygon[0]); emitPoint(polygon[i]); emitPoint(polygon[i + 1]); }
      return true;
    };
    for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
      const i0 = (iy * side + ix) * 5, i1 = i0 + 5, i3 = i0 + side * 5, i2 = i3 + 5;
      if (!triangle(i0, i3, i1) || !triangle(i3, i2, i1)) { this.n = start; this.billboard = anchor; return; }
    }
    this.segs[this.segs.length - 1].count += this.n - start;
    this.billboard = anchor;
  }
  /** 整张纹理（神识圈等）世界坐标 */
  texQuad(x: number, y: number, size: number, rot: number, a: number, add: number, tint: [number, number, number] = [1, 1, 1], sy = 1) {
    this.pt(x, y); this.quadS(-1, this.ox, this.oy, size * this.os, size * this.os, rot, tint[0], tint[1], tint[2], a, add, [0, 0, 1, 1], sy, this.od);
  }

  /** 折线条带（世界坐标）。w(i) 返回世界宽度，al(i) 返回该点透明度 */
  strip(cell: number, pts: ArrayLike<number>, n: number, w: (i: number) => number, al: (i: number) => number, r: number, g: number, b: number, add: number, verticalOffset: number | ArrayLike<number> = 0) {
    if (n < 2 || !this.grow((n - 1) * 6)) return;
    const [u0, v0, u1, v1] = cellUV(cell);
    const um = (u0 + u1) / 2;
    // 第五轮性能：每个点只投影一次（原来每个点连同前后两个邻点各投一次，一条带子投三遍、每遍都要取地面高度），
    // 结果放在复用的暂存数组里；每段的两组颜色也不再新建数组和闭包。算出来的顶点与原来逐位相同
    if (!this.sX || this.sX.length < n) { const m = Math.max(n, (this.sX?.length ?? 0) * 2, 64); this.sX = new Float64Array(m); this.sY = new Float64Array(m); this.sD = new Float64Array(m); this.sS = new Float64Array(m); }
    const SX = this.sX, SY = this.sY, SD = this.sD, SS = this.sS;
    for (let i = 0; i < n; i++) {
      const offset = typeof verticalOffset === 'number' ? verticalOffset : verticalOffset[i];
      this.pt(pts[i * 2], pts[i * 2 + 1], offset, !this.billboard && offset === 0 ? 0.7 : 0);
      SX[i] = this.ox; SY[i] = this.oy; SD[i] = this.od; SS[i] = this.os;
    }
    const k1 = 1 - add;
    let pxL = 0, pyL = 0, pxR = 0, pyR = 0, pa = 0, pd = -1;
    let added = 0;
    for (let i = 0; i < n; i++) {
      const x = SX[i], y = SY[i], depth = SD[i];
      const j0 = Math.max(0, i - 1), j1 = Math.min(n - 1, i + 1);
      let dx = SX[j1] - SX[j0], dy = SY[j1] - SY[j0];
      const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      const hw = w(i) * SS[j0] * 0.5;   // 原来取的是最后一次投影（前一个邻点）处的局部缩放
      const lx = x - dy * hw, ly = y + dx * hw, rx = x + dy * hw, ry = y - dx * hw;
      const a = Math.max(0, al(i));
      if (i > 0) {
        const ar = r * pa, ag = g * pa, ab = b * pa, aa = pa * k1, br = r * a, bg = g * a, bb = b * a, ba = a * k1;
        this.v(pxL, pyL, um, v0, ar, ag, ab, aa, pd); this.v(pxR, pyR, um, v1, ar, ag, ab, aa, pd); this.v(rx, ry, um, v1, br, bg, bb, ba, depth);
        this.v(pxL, pyL, um, v0, ar, ag, ab, aa, pd); this.v(rx, ry, um, v1, br, bg, bb, ba, depth); this.v(lx, ly, um, v0, br, bg, bb, ba, depth);
        added += 6;
      }
      pxL = lx; pyL = ly; pxR = rx; pyR = ry; pa = a; pd = depth;
    }
    // 收尾时 pt 的状态和原来一样停在最后一次投影的那个点（最后一点的前一个邻点）上
    { const j = Math.max(0, n - 2); this.ox = SX[j]; this.oy = SY[j]; this.od = SD[j]; this.os = SS[j]; }
    this.segs[this.segs.length - 1].count += added;
  }
  /**
   * 两条边夹出来的带子（兵器的刀光：一边是刃根、一边是刃尖，沿出手时段排开）。A、Bp 是两条边上的点（x、y 成对，坐标约定同 strip），
   * aA(i) / aB(i) 是两条边上各点的透明度；贴图横向取格子正中、纵向从 A 边到 B 边（C.Beam 这种中间亮两边淡的格子就是一条发亮的弧）
   */
  ribbon(cell: number, A: ArrayLike<number>, Bp: ArrayLike<number>, n: number, aA: (i: number) => number, aB: (i: number) => number, r: number, g: number, b: number, add: number) {
    if (n < 2 || !this.grow((n - 1) * 6)) return;
    const [u0, v0, u1, v1] = cellUV(cell), um = (u0 + u1) / 2, k1 = 1 - add;
    // 先把两条边都投影一遍；整条带子取最近那一点的深度再往前挪一点（同 quad 的做法：刀光整片画在人物立板前面，不被身子切成两截）
    if (!this.sX || this.sX.length < n * 2) { const m = Math.max(n * 2, (this.sX?.length ?? 0) * 2, 64); this.sX = new Float64Array(m); this.sY = new Float64Array(m); this.sD = new Float64Array(m); this.sS = new Float64Array(m); }
    const SX = this.sX, SY = this.sY;
    let dm = Infinity;
    for (let i = 0; i < n; i++) {
      this.pt(A[i * 2], A[i * 2 + 1]); SX[i * 2] = this.ox; SY[i * 2] = this.oy; if (this.od < dm) dm = this.od;
      this.pt(Bp[i * 2], Bp[i * 2 + 1]); SX[i * 2 + 1] = this.ox; SY[i * 2 + 1] = this.oy; if (this.od < dm) dm = this.od;
    }
    const D = !(dm >= 0 && dm < Infinity) ? -1 : Math.max(0, dm - 0.0004);
    let ax = 0, ay = 0, ad = 0, bx = 0, by = 0, bd = 0, pa = 0, pb = 0, added = 0;
    for (let i = 0; i < n; i++) {
      const x0 = SX[i * 2], y0 = SY[i * 2], d0 = D, x1 = SX[i * 2 + 1], y1 = SY[i * 2 + 1], d1 = D;
      const qa = Math.max(0, aA(i)), qb = Math.max(0, aB(i));
      if (i > 0) {
        this.v(ax, ay, um, v0, r * pa, g * pa, b * pa, pa * k1, ad); this.v(bx, by, um, v1, r * pb, g * pb, b * pb, pb * k1, bd); this.v(x1, y1, um, v1, r * qb, g * qb, b * qb, qb * k1, d1);
        this.v(ax, ay, um, v0, r * pa, g * pa, b * pa, pa * k1, ad); this.v(x1, y1, um, v1, r * qb, g * qb, b * qb, qb * k1, d1); this.v(x0, y0, um, v0, r * qa, g * qa, b * qa, qa * k1, d0);
        added += 6;
      }
      ax = x0; ay = y0; ad = d0; bx = x1; by = y1; bd = d1; pa = qa; pb = qb;
    }
    this.segs[this.segs.length - 1].count += added;
  }
  /** strip 用的投影暂存（复用，不每帧新建） */
  private sX = new Float64Array(0); private sY = new Float64Array(0); private sD = new Float64Array(0); private sS = new Float64Array(0);
}
