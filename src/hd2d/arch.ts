// 程序化中式建筑构件：全部由代码生成几何（不用模型文件），一处地点的所有建筑合并成一个网格。
// 坐标：x 向东，y 向上，z 向南（建筑正面朝 +z，也就是朝默认镜头）。
// 每个顶点带颜色和「瓦面坐标」：屋面上瓦垄、瓦行的明暗由着色器按瓦面坐标画出来，墙和台基的瓦面坐标为 0。
import { BufferGeometry, Color, Float32BufferAttribute, LinearSRGBColorSpace } from 'three';

export interface ArchPalette { roof: string; wall: string; pillar: string; trim: string; stone: string; accent: string }
export interface RoofOptions {
  /** 0 = 庑殿（四面坡），1 = 歇山 / 硬山（两端陡起，正脊拉长） */
  gable?: number;
  /** 翼角起翘的高度 */
  lift?: number;
  color: string; trim: string;
  /** 瓦垄间距（世界单位） */
  tile?: number;
  /** 攒尖顶（亭、塔）：没有正脊，收成一个尖 */
  pointed?: boolean;
}

const shadeOf = (hex: string, k: number): string => {
  const c = new Color().setStyle(hex, LinearSRGBColorSpace);
  if (k >= 0) c.lerp(new Color(1, 1, 1), k); else c.multiplyScalar(1 + k);
  return '#' + c.getHexString(LinearSRGBColorSpace);
};

/**
 * P10：顶点直接写进可增长的 Float32Array（不再用普通数组一个个 push）。
 * 普通数组在拼一整块城的时候要活好几帧，新生代垃圾回收每次都得把它们整个搬一遍，飞越时一帧卡几十毫秒；
 * 类型化数组的数据在堆外，回收时不搬。用完的大缓冲放回池里，下一块接着用。
 */
const EMPTY = new Float32Array(0);
class FBuf {
  private static pool: Float32Array[] = [];
  a: Float32Array = EMPTY; n = 0;
  private static take(cap: number): Float32Array {
    const P = FBuf.pool;
    let best = -1;
    for (let i = 0; i < P.length; i++) if (P[i].length >= cap && (best < 0 || P[i].length < P[best].length)) best = i;
    if (best >= 0) { const a = P[best]; P[best] = P[P.length - 1]; P.pop(); return a; }
    return new Float32Array(cap);
  }
  static give(a: Float32Array) {
    if (a.length < 4096) return;
    const P = FBuf.pool; P.push(a);
    if (P.length > 32) { P.sort((x, y) => y.length - x.length); P.length = 24; }   // 池里只留大的二十来块
  }
  grow(k: number) {
    if (this.n + k <= this.a.length) return;
    const b = FBuf.take(Math.max((this.n + k) * 2, 4096)); b.set(this.a.subarray(0, this.n)); FBuf.give(this.a); this.a = b;
  }
  /** 正好 n 长的一份拷贝 */
  copy(): Float32Array { return this.a.slice(0, this.n); }
  /** 大缓冲放回池里、清空 */
  release() { FBuf.give(this.a); this.a = EMPTY; this.n = 0; }
  clear() { this.n = 0; }
}
/** 颜色串 → 线性 RGB（同一种颜色只解析一次） */
const COLOR_CACHE = new Map<string, [number, number, number]>();
const colorRGB = (hex: string): [number, number, number] => {
  let v = COLOR_CACHE.get(hex);
  if (!v) { const c = new Color().setStyle(hex, LinearSRGBColorSpace); v = [c.r, c.g, c.b]; if (COLOR_CACHE.size > 20000) COLOR_CACHE.clear(); COLOR_CACHE.set(hex, v); }
  return v;
};

export class ArchBuilder {
  private pos = new FBuf(); private nor = new FBuf(); private col = new FBuf(); private tile = new FBuf();
  private cr = 1; private cg = 1; private cb = 1;
  get vertexCount() { return this.pos.n / 3; }
  /** P10：曲面屋顶的细分倍数（1 = 原样）。成片的城里殿宇多，城的构件用 0.5，顶点少一大半、拼得快 */
  roofDetail = 1;

  private vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u = 0, v = 0) {
    const P = this.pos, N = this.nor, C = this.col, T = this.tile;
    P.grow(3); N.grow(3); C.grow(3); T.grow(2);
    let i = P.n; P.a[i] = x; P.a[i + 1] = y; P.a[i + 2] = z; P.n = i + 3;
    i = N.n; N.a[i] = nx; N.a[i + 1] = ny; N.a[i + 2] = nz; N.n = i + 3;
    i = C.n; C.a[i] = this.cr; C.a[i + 1] = this.cg; C.a[i + 2] = this.cb; C.n = i + 3;
    i = T.n; T.a[i] = u; T.a[i + 1] = v; T.n = i + 2;
  }
  private setColor(hex: string) { const c = colorRGB(hex); this.cr = c[0]; this.cg = c[1]; this.cb = c[2]; }
  /** 城镇破坏（hd2d/townwreckGeo.ts 给替身做后处理）：直接读顶点（不拷贝；count 之后是缓冲的空余） */
  raw() { return { p: this.pos.a, n: this.nor.a, c: this.col.a, t: this.tile.a, count: this.vertexCount }; }
  /** 直接写一个顶点（颜色是线性 RGB，u v 是瓦面坐标） */
  rawVertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, r: number, g: number, b: number, u = 0, v = 0) { this.cr = r; this.cg = g; this.cb = b; this.vertex(x, y, z, nx, ny, nz, u, v); }

  /** 任意三角面（逆时针为正面），法线按面算。新构件拼不规则的形状（岩体、斜坡、桥拱）用 */
  tri(a: readonly number[], b: readonly number[], c: readonly number[], color: string) {
    this.setColor(color);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    this.vertex(a[0], a[1], a[2], nx, ny, nz); this.vertex(b[0], b[1], b[2], nx, ny, nz); this.vertex(c[0], c[1], c[2], nx, ny, nz);
  }
  /** 任意四边面（a→b→c→d 逆时针为正面）。tiled 为真时按瓦面画瓦垄（u 沿 a→b、v 沿 a→d，以 tile 个世界单位为一垄） */
  quad(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[], color: string, tiled = false, tile = 14) {
    if (!tiled) { this.tri(a, b, c, color); this.tri(a, c, d, color); return; }
    this.setColor(color);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const U = Math.hypot(ux, uy, uz) / tile, V = 1 + Math.hypot(vx, vy, vz) / tile;
    this.vertex(a[0], a[1], a[2], nx, ny, nz, 0, 1); this.vertex(b[0], b[1], b[2], nx, ny, nz, U, 1); this.vertex(c[0], c[1], c[2], nx, ny, nz, U, V);
    this.vertex(a[0], a[1], a[2], nx, ny, nz, 0, 1); this.vertex(c[0], c[1], c[2], nx, ny, nz, U, V); this.vertex(d[0], d[1], d[2], nx, ny, nz, 0, V);
  }
  /** 轴对齐的盒子（底面不画：永远看不到） */
  box(cx: number, cy: number, cz: number, w: number, h: number, d: number, color: string) {
    if (w <= 0 || h <= 0 || d <= 0) return;
    this.setColor(color);
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    // 四个角 a b c e（逆时针）拼两个三角，不新建数组
    const face = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, qx: number, qy: number, qz: number, ex: number, ey: number, ez: number, nx: number, ny: number, nz: number) => {
      this.vertex(ax, ay, az, nx, ny, nz); this.vertex(bx, by, bz, nx, ny, nz); this.vertex(qx, qy, qz, nx, ny, nz);
      this.vertex(ax, ay, az, nx, ny, nz); this.vertex(qx, qy, qz, nx, ny, nz); this.vertex(ex, ey, ez, nx, ny, nz);
    };
    face(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, 0, 1, 0);      // 顶
    face(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1);      // 正面
    face(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, 0, 0, -1);     // 背面
    face(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, 1, 0, 0);      // 东
    face(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, -1, 0, 0);     // 西
  }

  /**
   * 曲面屋顶。檐口是 2a × 2b 的矩形（已含出檐），从檐口到屋脊升高 H。
   * 屋面按「举折」做成下凹的曲线（檐口平缓、近脊处陡），四个翼角向上起翘；
   * 屋面细分成网格，法线由高度函数差分得到，所以受光是平滑的曲面而不是折面。
   */
  roof(cx: number, y: number, cz: number, a: number, b: number, H: number, o: RoofOptions) {
    const gable = o.gable ?? 0.6, lift = o.lift ?? Math.min(a, b) * 0.16, tile = o.tile ?? 14;
    const endK = 1 + 2.4 * gable;                    // 两端的坡更陡：正脊更长
    const span = o.pointed ? Math.min(a, b) : b;
    const height = (x: number, z: number) => {
      const ex = a - Math.abs(x), ez = b - Math.abs(z);
      const e = o.pointed ? Math.min(ex, ez) : Math.min(ex * endK, ez);
      const t = Math.max(0, Math.min(1, e / span));
      const corner = Math.pow(Math.abs(x) / a, 3) * Math.pow(Math.abs(z) / b, 3);
      return H * (0.16 * t + 0.84 * Math.pow(t, 1.75)) + lift * corner * (1 - t);
    };
    const D = this.roofDetail, nx = Math.max(Math.round(10 * D), Math.min(Math.round(28 * D), Math.round(a / 16 * D) * 2)), nz = Math.max(Math.round(8 * D), Math.min(Math.round(20 * D), Math.round(b / 16 * D) * 2));
    const eps = Math.min(a, b) * 0.02;
    const put = (x: number, z: number) => {
      const h = height(x, z);
      const dx = (height(x + eps, z) - height(x - eps, z)) / (2 * eps), dz = (height(x, z + eps) - height(x, z - eps)) / (2 * eps);
      const inv = 1 / Math.hypot(dx, 1, dz);
      // 瓦面坐标：u 沿檐口方向数瓦垄，v 从檐口到屋脊数瓦行
      const ex = (a - Math.abs(x)) * (o.pointed ? 1 : endK), ez = b - Math.abs(z);
      const u = (ez <= ex ? x : z) / tile, v = Math.min(ex, ez) / (tile * 0.9) + 1;
      this.vertex(cx + x, y + h, cz + z, -dx * inv, inv, -dz * inv, u, v);
    };
    this.setColor(o.color);
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const x0 = -a + 2 * a * ix / nx, x1 = -a + 2 * a * (ix + 1) / nx, z0 = -b + 2 * b * iz / nz, z1 = -b + 2 * b * (iz + 1) / nz;
      put(x0, z1); put(x1, z1); put(x1, z0); put(x0, z1); put(x1, z0); put(x0, z0);
    }
    // 檐口封边：沿四边往下挂一圈，遮住屋面的厚度
    const drop = Math.max(2.5, Math.min(a, b) * 0.045);
    this.setColor(o.trim);
    const skirt = (xA: number, zA: number, xB: number, zB: number, nxn: number, nzn: number) => {
      const hA = y + height(xA, zA), hB = y + height(xB, zB);
      const p = [[cx + xA, hA - drop, cz + zA], [cx + xB, hB - drop, cz + zB], [cx + xB, hB, cz + zB], [cx + xA, hA, cz + zA]];
      for (const q of [p[0], p[1], p[2], p[0], p[2], p[3]]) this.vertex(q[0], q[1], q[2], nxn, 0, nzn);
    };
    for (let i = 0; i < nx; i++) {
      const x0 = -a + 2 * a * i / nx, x1 = -a + 2 * a * (i + 1) / nx;
      skirt(x0, b, x1, b, 0, 1); skirt(x1, -b, x0, -b, 0, -1);
    }
    for (let i = 0; i < nz; i++) {
      const z0 = -b + 2 * b * i / nz, z1 = -b + 2 * b * (i + 1) / nz;
      skirt(a, z1, a, z0, 1, 0); skirt(-a, z0, -a, z1, -1, 0);
    }
    if (o.pointed) {
      // 宝顶：一根细柱加一个小方珠
      const s = Math.min(a, b);
      this.box(cx, y + H + s * 0.14, cz, s * 0.07, s * 0.28, s * 0.07, o.trim);
      this.box(cx, y + H + s * 0.32, cz, s * 0.13, s * 0.13, s * 0.13, shadeOf(o.trim, 0.35));
      return;
    }
    // 正脊和两端的鸱吻
    const ridge = Math.max(0, a - b / endK), rh = Math.max(3, H * 0.09), rt = Math.max(3, b * 0.07);
    this.box(cx, y + H + rh / 2, cz, ridge * 2 + rt, rh, rt, o.trim);
    for (const s of [-1, 1]) this.box(cx + s * (ridge + rt * 0.2), y + H + rh * 1.2, cz, rt * 1.1, rh * 2.2, rt * 1.2, shadeOf(o.trim, 0.2));
  }

  /** 一圈柱子：正面一排完整的柱廊，侧面只在转角 */
  private columns(cx: number, y: number, zFront: number, w: number, d: number, h: number, count: number, color: string) {
    const t = Math.max(2.5, Math.min(h * 0.09, w * 0.03));
    for (let i = 0; i < count; i++) {
      const x = cx - w / 2 + t / 2 + (w - t) * i / (count - 1);
      this.box(x, y + h / 2, zFront + t * 0.6, t, h, t, color);
    }
    for (const s of [-1, 1]) this.box(cx + s * (w / 2 - t / 2), y + h / 2, zFront - d + t / 2, t, h, t, color);
  }

  /**
   * 殿堂：台基（带正面踏步）→ 墙身与柱廊 → 额枋斗拱带 → 曲面屋顶；tiers = 2 时是重檐（上面再叠一层收小的殿身和屋顶）。
   * zFront 是正面墙的位置，建筑向 -z 方向延伸 d。opening > 0 时正面留出能走人的门洞。
   */
  hall(cx: number, ground: number, zFront: number, w: number, d: number, bodyH: number, roofH: number, pal: ArchPalette,
    o: { tiers?: number; base?: number; opening?: number; gable?: number; steps?: boolean } = {}) {
    const base = o.base ?? Math.max(4, bodyH * 0.14), cz = zFront - d / 2, tiers = o.tiers ?? 1, opening = o.opening ?? 0;
    // 台基：比殿身宽出一圈，正面三级踏步
    const bw = w * 1.14 + base * 2, bd = d * 1.16 + base * 2;
    this.box(cx, ground + base / 2, cz, bw, base, bd, pal.stone);
    this.box(cx, ground + base * 1.04, cz, bw * 0.985, base * 0.1, bd * 0.985, shadeOf(pal.stone, 0.18));
    if (o.steps !== false) {
      const sw = Math.max(w * 0.3, opening * 1.3), n = 3;
      for (let i = 0; i < n; i++) this.box(cx, ground + base * (n - i - 0.5) / n * 0.92, cz + bd / 2 + base * 0.5 * (i + 0.5), sw, base * 0.92 / n, base * 0.5, shadeOf(pal.stone, -0.06 * i));
    }
    const y0 = ground + base;
    // 墙身
    if (opening > 0) {
      const side = (w - opening) / 2, doorH = bodyH * 0.74;
      this.box(cx - (opening + side) / 2, y0 + bodyH / 2, cz, side, bodyH, d, pal.wall);
      this.box(cx + (opening + side) / 2, y0 + bodyH / 2, cz, side, bodyH, d, pal.wall);
      this.box(cx, y0 + (bodyH + doorH) / 2, cz, opening, bodyH - doorH, d, pal.wall);
    } else {
      this.box(cx, y0 + bodyH / 2, cz, w, bodyH, d, pal.wall);
      // 正门和两侧的槛窗
      const doorW = Math.min(w * 0.2, bodyH * 0.7);
      this.box(cx, y0 + bodyH * 0.39, zFront + 0.6, doorW, bodyH * 0.78, 1.2, shadeOf(pal.pillar, -0.45));
      const bays = Math.max(0, Math.min(3, Math.floor((w / 2 - doorW) / (bodyH * 0.7))));
      for (let i = 1; i <= bays; i++) for (const s of [-1, 1]) {
        this.box(cx + s * (doorW * 0.5 + (w / 2 - doorW * 0.5) * (i - 0.5) / (bays + 0.25)), y0 + bodyH * 0.56, zFront + 0.6, bodyH * 0.42, bodyH * 0.4, 1.2, shadeOf(pal.trim, -0.2));
      }
    }
    // 柱廊：按开间数排
    const columnCount = Math.max(2, Math.min(9, Math.round(w / (bodyH * 0.85)) + 1));
    this.columns(cx, y0, zFront, w, d, bodyH, columnCount, pal.pillar);
    // 额枋与斗拱带：檐下一圈深色，再压一道饰色
    const band = Math.max(3, bodyH * 0.13);
    this.box(cx, y0 + bodyH + band / 2, cz, w * 1.05, band, d * 1.07, pal.trim);
    this.box(cx, y0 + bodyH + band * 0.25, cz, w * 1.07, band * 0.3, d * 1.09, pal.accent);
    const eaveY = y0 + bodyH + band;
    const over = Math.max(8, bodyH * 0.42);
    this.roof(cx, eaveY, cz, w / 2 + over, d / 2 + over * 0.9, tiers > 1 ? roofH * 0.62 : roofH,
      { gable: o.gable ?? 0.55, color: pal.roof, trim: shadeOf(pal.roof, -0.35), lift: over * 0.55 });
    if (tiers > 1) {
      // 重檐：上层殿身收进去，屋顶更高更陡
      const w2 = w * 0.7, d2 = d * 0.66, h2 = bodyH * 0.42, y2 = eaveY + roofH * 0.3;
      this.box(cx, y2 + h2 / 2, cz, w2, h2, d2, pal.wall);
      this.columns(cx, y2, cz + d2 / 2, w2, d2, h2, Math.max(2, columnCount - 2), pal.pillar);
      this.box(cx, y2 + h2 + band * 0.4, cz, w2 * 1.06, band * 0.8, d2 * 1.08, pal.trim);
      this.box(cx, y2 + h2 + band * 0.2, cz, w2 * 1.08, band * 0.25, d2 * 1.1, pal.accent);
      this.roof(cx, y2 + h2 + band * 0.8, cz, w2 / 2 + over * 0.9, d2 / 2 + over * 0.8, roofH,
        { gable: 0.5, color: pal.roof, trim: shadeOf(pal.roof, -0.35), lift: over * 0.6 });
    }
  }

  /** 毡帐：圆的矮墙，腰上一条彩带，上面一个圆锥带弧度的顶，朝南开门 */
  yurt(cx: number, ground: number, cz: number, r: number, h: number, wall: string, roof: string, band: string, door: string) {
    const N = 18, wallH = h * 0.46, y1 = ground + wallH, top = ground + h;
    const at = (i: number, rad: number): [number, number] => { const a = i / N * Math.PI * 2; return [cx + Math.cos(a) * rad, cz + Math.sin(a) * rad]; };
    // 一圈侧面：从 (r0, ya) 到 (r1, yb)；法线朝外并按坡度抬起
    const shell = (r0: number, ya: number, r1: number, yb: number, color: string) => {
      this.setColor(color);
      const run = r0 - r1, rise = yb - ya, len = Math.hypot(run, rise) || 1, ny = run / len, nr = rise / len;
      for (let i = 0; i < N; i++) {
        const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
        const [x0, z0] = at(i, r0), [x1, z1] = at(i + 1, r0), [u0, w0] = at(i, r1), [u1, w1] = at(i + 1, r1);
        const n0 = [Math.cos(a0) * nr, ny, Math.sin(a0) * nr], n1 = [Math.cos(a1) * nr, ny, Math.sin(a1) * nr];
        this.vertex(x1, ya, z1, n1[0], n1[1], n1[2]); this.vertex(x0, ya, z0, n0[0], n0[1], n0[2]); this.vertex(u0, yb, w0, n0[0], n0[1], n0[2]);
        this.vertex(x1, ya, z1, n1[0], n1[1], n1[2]); this.vertex(u0, yb, w0, n0[0], n0[1], n0[2]); this.vertex(u1, yb, w1, n1[0], n1[1], n1[2]);
      }
    };
    shell(r, ground, r, y1, wall);
    shell(r * 1.015, y1 - wallH * 0.36, r * 1.015, y1 - wallH * 0.14, band);
    shell(r * 1.07, y1 - wallH * 0.04, r * 1.07, y1 + wallH * 0.05, shadeOf(band, -0.2));
    const mid = y1 + (top - y1) * 0.6;
    shell(r * 1.07, y1 + wallH * 0.05, r * 0.52, mid, roof);
    shell(r * 0.52, mid, r * 0.16, top - (top - y1) * 0.06, shadeOf(roof, -0.08));
    shell(r * 0.2, top - (top - y1) * 0.08, r * 0.2, top + r * 0.05, band);
    shell(r * 0.2, top + r * 0.05, 0.01, top + r * 0.12, shadeOf(band, 0.2));
    // 门：朝南
    this.box(cx, ground + wallH * 0.42, cz + r * 0.985, r * 0.46, wallH * 0.84, r * 0.1, door);
    this.box(cx, ground + wallH * 0.86, cz + r * 0.99, r * 0.56, wallH * 0.08, r * 0.12, band);
  }

  /** 楼阁 / 塔：一层层收小叠上去，每层一圈出檐，顶上攒尖 */
  pagoda(cx: number, ground: number, cz: number, w: number, totalH: number, tiers: number, pal: ArchPalette) {
    const base = Math.max(4, w * 0.1);
    this.box(cx, ground + base / 2, cz, w * 1.3, base, w * 1.3, pal.stone);
    let y = ground + base, size = w;
    const tierH = (totalH - base) / (tiers + 0.9);
    for (let i = 0; i < tiers; i++) {
      const bodyH = tierH * 0.62, last = i === tiers - 1;
      this.box(cx, y + bodyH / 2, cz, size, bodyH, size, pal.wall);
      this.columns(cx, y, cz + size / 2, size, size, bodyH, 3, pal.pillar);
      this.box(cx, y + bodyH * 0.45, cz + size / 2 + 0.6, size * 0.26, bodyH * 0.6, 1.2, shadeOf(pal.pillar, -0.45));
      this.box(cx, y + bodyH + tierH * 0.05, cz, size * 1.06, tierH * 0.1, size * 1.06, pal.trim);
      const over = size * 0.34;
      this.roof(cx, y + bodyH + tierH * 0.1, cz, size / 2 + over, size / 2 + over, last ? tierH * 0.95 : tierH * 0.3,
        { pointed: last, gable: 0, color: pal.roof, trim: shadeOf(pal.roof, -0.35), lift: over * 0.7, tile: 11 });
      if (!last) this.box(cx, y + bodyH + tierH * 0.34, cz, size * 0.86, tierH * 0.12, size * 0.86, pal.trim);
      y += tierH; size *= 0.84;
    }
  }

  /** 亭：四根柱子托一个攒尖顶，没有墙 */
  pavilion(cx: number, ground: number, cz: number, w: number, h: number, pal: ArchPalette) {
    const base = Math.max(3, w * 0.08), t = Math.max(2.5, w * 0.07), bodyH = h * 0.5;
    this.box(cx, ground + base / 2, cz, w * 1.25, base, w * 1.25, pal.stone);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(cx + sx * (w / 2 - t / 2), ground + base + bodyH / 2, cz + sz * (w / 2 - t / 2), t, bodyH, t, pal.pillar);
    this.box(cx, ground + base + bodyH + h * 0.03, cz, w * 1.04, h * 0.06, w * 1.04, pal.trim);
    this.roof(cx, ground + base + bodyH + h * 0.06, cz, w * 0.82, w * 0.82, h * 0.42,
      { pointed: true, color: pal.roof, trim: shadeOf(pal.roof, -0.35), lift: w * 0.2, tile: 10 });
  }

  /** 牌坊式山门：四柱三间，中间高两边低，各顶一条小屋檐 */
  paifang(cx: number, ground: number, cz: number, w: number, h: number, pal: ArchPalette) {
    const t = Math.max(4, w * 0.035), mid = w * 0.4, side = (w - mid) / 2;
    for (const x of [-w / 2, -mid / 2, mid / 2, w / 2]) {
      const tall = Math.abs(x) < mid / 2 + 1;
      this.box(cx + x, ground + (tall ? h : h * 0.78) / 2, cz, t, tall ? h : h * 0.78, t, pal.pillar);
      this.box(cx + x, ground + t * 0.6, cz, t * 1.9, t * 1.2, t * 1.9, pal.stone);
    }
    const beam = h * 0.07;
    this.box(cx, ground + h * 0.82, cz, mid, beam, t * 0.8, pal.trim);
    this.box(cx, ground + h * 0.9, cz, mid * 0.5, h * 0.09, t * 0.5, pal.accent);   // 匾额
    this.roof(cx, ground + h, cz, mid / 2 + t * 3, t * 2.6, h * 0.14, { gable: 0.9, color: pal.roof, trim: shadeOf(pal.roof, -0.35), lift: t * 1.6, tile: 9 });
    for (const s of [-1, 1]) {
      const x = cx + s * (mid / 2 + side / 2);
      this.box(x, ground + h * 0.62, cz, side, beam, t * 0.8, pal.trim);
      this.roof(x, ground + h * 0.78, cz, side / 2 + t * 2.4, t * 2.2, h * 0.11, { gable: 0.9, color: pal.roof, trim: shadeOf(pal.roof, -0.35), lift: t * 1.3, tile: 9 });
    }
  }

  /** 围墙：墙身加一条瓦顶；along = 'x' 沿东西向，'z' 沿南北向 */
  wall(cx: number, ground: number, cz: number, len: number, h: number, thick: number, along: 'x' | 'z', color: string, roofColor: string) {
    const w = along === 'x' ? len : thick, d = along === 'x' ? thick : len;
    this.box(cx, ground + h / 2, cz, w, h, d, color);
    const cap = Math.max(4, thick * 0.5);
    if (along === 'x') this.roof(cx, ground + h, cz, len / 2 + 2, thick / 2 + cap, cap * 0.9, { gable: 1, lift: 0, color: roofColor, trim: shadeOf(roofColor, -0.35), tile: 9 });
    else this.box(cx, ground + h + cap * 0.3, cz, thick + cap, cap * 0.6, len, roofColor);
  }

  /** P10：夜里会亮的四边面（窗、灯笼）：瓦面坐标记成 (0, -2)，着色器入夜把它点亮 */
  glowQuad(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[], color: string) {
    const n0 = this.tile.n;
    this.quad(a, b, c, d, color);
    const T = this.tile.a; for (let i = n0 + 1; i < this.tile.n; i += 2) T[i] = -2;
  }
  /**
   * P4：随风摆的四边面（幡、旗、灯笼）。w 是 a、b、c、d 四角的摆幅权重：0 = 系在杆上不动，1 = 摆得最开。
   * 瓦面坐标记成 (权重, -4)；glow 为真时记 (权重, -3)：既会摆、入夜也发光（灯笼）。摆动在顶点着色器里算，不每帧改几何。
   */
  swayQuad(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[], color: string, w: readonly [number, number, number, number], glow = false) {
    const n0 = this.tile.n;
    this.quad(a, b, c, d, color);
    const T = this.tile.a, W = [w[0], w[1], w[2], w[0], w[2], w[3]];   // 未分瓦的四边面按 (a, b, c)、(a, c, d) 两个三角形出顶点
    for (let k = 0; k < 6 && n0 + k * 2 + 1 < this.tile.n; k++) { T[n0 + k * 2] = W[k]; T[n0 + k * 2 + 1] = glow ? -3 : -4; }
  }
  /** P10：把另一个拼好的构件（本地坐标）绕竖轴转 rot×90°（0 面南、1 面东、2 面北、3 面西）、平移到 (x, y, z) 后并进来 */
  append(o: ArchBuilder, rot: number, x: number, y: number, z: number) {
    const r = ((rot % 4) + 4) % 4, n = o.pos.n;
    this.pos.grow(n); this.nor.grow(n); this.col.grow(o.col.n); this.tile.grow(o.tile.n);
    const P = o.pos.a, N = o.nor.a, Q = this.pos.a, M = this.nor.a; let j = this.pos.n;
    for (let i = 0; i < n; i += 3, j += 3) {
      const px = P[i], pz = P[i + 2], nx = N[i], nz = N[i + 2];
      // 本地 (x, z) → 世界：r=1 (z, -x)，r=2 (-x, -z)，r=3 (-z, x)；保持右手系，三角面朝向不变
      const wx = r === 0 ? px : r === 1 ? pz : r === 2 ? -px : -pz, wz = r === 0 ? pz : r === 1 ? -px : r === 2 ? -pz : px;
      const mx = r === 0 ? nx : r === 1 ? nz : r === 2 ? -nx : -nz, mz = r === 0 ? nz : r === 1 ? -nx : r === 2 ? -nz : nx;
      Q[j] = wx + x; Q[j + 1] = P[i + 1] + y; Q[j + 2] = wz + z; M[j] = mx; M[j + 1] = N[i + 1]; M[j + 2] = mz;
    }
    this.pos.n = j; this.nor.n = j;
    this.col.a.set(o.col.a.subarray(0, o.col.n), this.col.n); this.col.n += o.col.n;
    this.tile.a.set(o.tile.a.subarray(0, o.tile.n), this.tile.n); this.tile.n += o.tile.n;
  }
  /** P10：同 append，但绕竖轴转任意角 ang（弧度；本地 x 轴转到世界 (cos ang, sin ang)）。顺着岸线斜着走的城墙用 */
  appendAngle(o: ArchBuilder, ang: number, x: number, y: number, z: number) {
    const c = Math.cos(ang), s = Math.sin(ang), n = o.pos.n;
    this.pos.grow(n); this.nor.grow(n); this.col.grow(o.col.n); this.tile.grow(o.tile.n);
    const P = o.pos.a, N = o.nor.a, Q = this.pos.a, M = this.nor.a; let j = this.pos.n;
    for (let i = 0; i < n; i += 3, j += 3) {
      const px = P[i], pz = P[i + 2], nx = N[i], nz = N[i + 2];
      Q[j] = px * c - pz * s + x; Q[j + 1] = P[i + 1] + y; Q[j + 2] = px * s + pz * c + z;
      M[j] = nx * c - nz * s; M[j + 1] = N[i + 1]; M[j + 2] = nx * s + nz * c;
    }
    this.pos.n = j; this.nor.n = j;
    this.col.a.set(o.col.a.subarray(0, o.col.n), this.col.n); this.col.n += o.col.n;
    this.tile.a.set(o.tile.a.subarray(0, o.tile.n), this.tile.n); this.tile.n += o.tile.n;
  }
  /** P10：拼完不用了：缓冲还回池里（之后还能接着往里拼，从空的开始） */
  release() { this.pos.release(); this.nor.release(); this.col.release(); this.tile.release(); }
  /** P10：清空（临时拼构件用的那个反复用） */
  clear() { this.pos.clear(); this.nor.clear(); this.col.clear(); this.tile.clear(); }

  /**
   * 琉璃：给 from 起新拼的屋面（瓦面坐标 v > 0.5 的顶点）上釉——朝上、朝镜头一侧（+z）的坡面提亮一层高光，
   * 瓦行之间隔行深浅不一（釉色不匀）。只改顶点颜色，着色器不动。
   */
  glaze(from: number, k = 0.5) {
    const N = this.nor.a, C = this.col.a, T = this.tile.a;
    for (let i = from; i < this.pos.n / 3; i++) {
      const v = T[i * 2 + 1];
      if (v <= 0.5) continue;
      const ny = N[i * 3 + 1], nz = N[i * 3 + 2];
      // 釉色：琉璃瓦色正而亮——比素瓦饱和一截、亮一档（远看也认得出是琉璃顶）
      const r = C[i * 3], g = C[i * 3 + 1], b = C[i * 3 + 2], lum = (r + g + b) / 3;
      // 高光：朝镜头那一面的坡映着天光（坡越正对镜头越亮）；檐口一排滴水瓦一道亮边；瓦行隔行深浅（釉色不匀）
      const sheen = Math.pow(Math.max(0, ny * 0.55 + nz * 0.83), 4) * k;
      const eave = v < 1.9 ? 0.1 : 0, row = (Math.floor(v * 0.5) % 2) ? 0.08 : -0.05;
      const out = [r, g, b].map((x) => (lum + (x - lum) * 1.6) * 1.2 * (1 + row) + sheen * (0.75 + 0.25 * x / Math.max(r, g, b, 0.01)) + eave);
      for (let c = 0; c < 3; c++) C[i * 3 + c] = Math.max(0, Math.min(1, out[c]));
    }
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    // 交出正好长的拷贝（拼的缓冲还留着；不再用了请 release() 还回池里）
    geometry.setAttribute('position', new Float32BufferAttribute(this.pos.copy(), 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(this.nor.copy(), 3));
    geometry.setAttribute('color', new Float32BufferAttribute(this.col.copy(), 3));
    geometry.setAttribute('aTile', new Float32BufferAttribute(this.tile.copy(), 2));
    geometry.computeBoundingSphere();
    return geometry;
  }
}

export { shadeOf };
