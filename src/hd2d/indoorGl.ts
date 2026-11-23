// 收官 P8（丁）：屋里的画法——地面、墙、陈设拼成一个网格（每间屋一个），主角走近那栋楼时才拼，走远了回收。
// 和屋顶淡出用同一个屏幕格点哈希：屋顶丢掉的那些像素正好由屋里补上（溶解是互补的，不会一下子闪出来）。
// 朝镜头的那面墙（按相机方位算，转视角也对）削到半人高的墙根，其余三面墙削到一人多高，像剖开的屋子。
// 夜里的灯：灯笼、烛台、丹炉（Plan.lamps）登记成画面线的点光源（lights()，hd2d/lights.ts 的 LightList），
// 真的照亮屋里的地面、墙和人；灯笼本身入夜亮过白（半浮点世界层里当自发光，会泛光）。
import {
  BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, RingGeometry, Shape, ShapeGeometry, ShaderMaterial, Vector2, Vector3, Vector4, AdditiveBlending,
} from 'three';
import type { Game } from '../world/game';
import type { HdScene } from './scene';
import { toWorld, WALL_T, type Room } from '../world/indoor';
import type { Plan, Prim } from '../world/indoorPlan';

const VS = `
attribute vec3 aux;
varying vec3 vC; varying vec3 vN; varying vec3 vW; varying vec3 vA;
void main(){ vC = color; vN = normal; vA = aux; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FS = `
uniform float uFade; uniform vec2 uCam; uniform float uNight; uniform float uFloorY;
varying vec3 vC; varying vec3 vN; varying vec3 vW; varying vec3 vA;
void main(){
  // 和建筑那边 roomOut() 同一个哈希：那边丢掉 n < 溶解程度 的像素，这边只留这些
  float n = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
  if (n > uFade) discard;
  // 墙段（aux.x = 1 南 2 东 3 北 4 西）：外侧朝着镜头的那面削掉上半截（同样抖动溶解，转视角时慢慢换）
  if (vA.x > 0.5) {
    vec2 o = vA.x < 1.5 ? vec2(0.0, 1.0) : vA.x < 2.5 ? vec2(1.0, 0.0) : vA.x < 3.5 ? vec2(0.0, -1.0) : vec2(-1.0, 0.0);
    float k = smoothstep(-0.2, -0.5, dot(o, uCam));
    if (fract(n * 7.31) < k) discard;
  }
  vec3 nn = normalize(vN);
  // 屋里：一盏柔和的主光从镜头左上方来，背光面不至于死黑；整体比外头略暗（屋檐下），入夜再暗一截，靠灯
  float key = 0.66 + 0.34 * max(dot(nn, normalize(vec3(-0.35, 0.85, 0.42))), 0.0);
  // 夜里整幅画面还要再乘一层偏蓝的暗色（render.ts 的昼夜那一层），屋里自己就不再压暗多少：灯下的屋子比街上亮
  vec3 c = vC * key * mix(0.95, 0.8, uNight);
  // 墙根、陈设底下略暗一点（接地）
  c *= mix(0.86, 1.0, smoothstep(0.0, 26.0, vW.y - uFloorY));
  // 灯笼、烛火、炉火：白天是本色，入夜透出暖光（夜里亮过 1：后期当自发光，不被昼夜压暗、会泛光）
  if (vA.y > 0.5) c = mix(c, vec3(1.0, 0.8, 0.48) * (1.2 + 0.9 * uNight), 0.2 + 0.8 * uNight);
  gl_FragColor = vec4(c, 1.0);
}`;

/** hex（按线性值读，和 arch.ts 一致）→ rgb */
const RGB = new Map<string, [number, number, number]>();
function rgb(hex: string): [number, number, number] {
  let v = RGB.get(hex);
  if (!v) { const n = parseInt(hex.slice(1), 16); v = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; RGB.set(hex, v); }
  return v;
}
const shade = (hex: string, k: number) => { const [r, g, b] = rgb(hex), f = (x: number) => Math.round(Math.max(0, Math.min(1, k >= 0 ? x + (1 - x) * k : x * (1 + k))) * 255); return '#' + [f(r), f(g), f(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); };

/** 世界坐标的网格拼接器：位置、法线、颜色、aux（墙段方向、是否发光） */
class MB {
  p: number[] = []; n: number[] = []; c: number[] = []; a: number[] = [];
  private v(x: number, y: number, z: number, nx: number, ny: number, nz: number, col: [number, number, number], side: number, glow: number) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2]); this.a.push(side, glow, 0);
  }
  /** 四边形 a→b→c→d（逆时针为正面），法线给定 */
  quad(A: number[], B: number[], C: number[], D: number[], nrm: number[], hex: string, side = 0, glow = 0) {
    const col = rgb(hex);
    for (const q of [A, B, C, A, C, D]) this.v(q[0], q[1], q[2], nrm[0], nrm[1], nrm[2], col, side, glow);
  }
  /** 轴对齐盒子（中心、尺寸都是世界坐标；不画底面） */
  box(cx: number, cy: number, cz: number, w: number, h: number, d: number, hex: string, side = 0, glow = 0) {
    if (w <= 0 || h <= 0 || d <= 0) return;
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const top = glow ? hex : shade(hex, 0.06);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], top, side, glow);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], hex, side, glow);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], hex, side, glow);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], shade(hex, -0.08), side, glow);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], shade(hex, -0.08), side, glow);
  }
  /** 竖直圆柱（底面中心、半径、高、边数；顶上一个盖） */
  cyl(x: number, y: number, z: number, r: number, h: number, hex: string, n = 8, top?: string, glow = 0) {
    const col = rgb(hex), tc = rgb(top ?? shade(hex, 0.08));
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, am = (a0 + a1) / 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const P = [[x + c1 * r, y, z + s1 * r], [x + c0 * r, y, z + s0 * r], [x + c0 * r, y + h, z + s0 * r], [x + c1 * r, y + h, z + s1 * r]];
      for (const q of [P[0], P[1], P[2], P[0], P[2], P[3]]) this.v(q[0], q[1], q[2], Math.cos(am), 0, Math.sin(am), col, 0, glow);
      for (const q of [[x, y + h, z], [x + c1 * r, y + h, z + s1 * r], [x + c0 * r, y + h, z + s0 * r]]) this.v(q[0], q[1], q[2], 0, 1, 0, tc, 0, glow);
    }
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.c, 3)); g.setAttribute('aux', new Float32BufferAttribute(this.a, 3));
    g.computeBoundingSphere();
    return g;
  }
  get count() { return this.p.length / 3; }
}

/** 本地方向的墙（1 南=门那面 2 东 3 北=后墙 4 西）→ 世界方向编号（1 南 2 东 3 北 4 西） */
function worldSide(r: Room, local: number): number {
  const v: [number, number] = local === 1 ? [0, 1] : local === 2 ? [1, 0] : local === 3 ? [0, -1] : [-1, 0];
  const [ax, ay] = toWorld(r, v[0], v[1]), [ox, oy] = toWorld(r, 0, 0), dx = Math.round(ax - ox), dy = Math.round(ay - oy);
  return dy > 0 ? 1 : dx > 0 ? 2 : dy < 0 ? 3 : 4;
}

const FLOOR: Record<Plan['floor'], string[]> = {
  wood: ['#8a6a48', '#84643f', '#906e4c', '#7e5e3e'],
  stone: ['#a8a296', '#9e988c', '#a4a094'],
  mat: ['#c8b884', '#c0b07c'],
  slab: ['#7e766a', '#766e62', '#82796c'],
};

/** 拼一间屋的网格（世界坐标） */
export function buildRoomMesh(r: Room, P: Plan, floorY: number): { geo: BufferGeometry; verts: number } {
  const B = new MB(), odd = r.rot % 2 === 1;
  /** 本地盒子 → 世界盒子（转 90° 的倍数：宽深互换） */
  const lbox = (x: number, y: number, z: number, w: number, h: number, d: number, hex: string, side = 0, glow = 0) => {
    const [wx, wz] = toWorld(r, x, z);
    B.box(wx, floorY + y, wz, odd ? d : w, h, odd ? w : d, hex, side, glow);
  };
  const W = P.W, D = P.D, W2 = W / 2, T = WALL_T;
  // —— 地面：木地板顺着进深一条条铺，石地砖 / 殿里的大方砖按格子错色；四周一圈略暗（墙根）
  const fy = 0.6, cols = FLOOR[P.floor];
  if (P.floor === 'wood') {
    const pw = 22, n = Math.ceil(W / pw);
    for (let i = 0; i < n; i++) { const x0 = -W2 + i * pw, x1 = Math.min(W2, x0 + pw - 1.2); lbox((x0 + x1) / 2, fy - 0.5, -D / 2, x1 - x0, 1, D, cols[(i * 7 + (r.seed & 3)) % cols.length]); }
    lbox(0, fy - 0.8, -D / 2, W, 1, D, '#3a2a1c');   // 板缝
  } else {
    const s = P.floor === 'slab' ? 80 : 44, nx = Math.ceil(W / s), nz = Math.ceil(D / s);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x0 = -W2 + i * s, z0 = -D + j * s, x1 = Math.min(W2, x0 + s - 1.6), z1 = Math.min(0, z0 + s - 1.6);
      lbox((x0 + x1) / 2, fy - 0.5, (z0 + z1) / 2, x1 - x0, 1, z1 - z0, cols[(i + j * 2 + i * j) % cols.length]);
    }
    lbox(0, fy - 0.8, -D / 2, W, 1, D, '#3a3630');
  }
  // 墙根一圈暗边（接地）
  for (const [x, z, w, d] of [[0, -D + T + 6, W - 2 * T, 12], [-W2 + T + 6, -D / 2, 12, D - 2 * T], [W2 - T - 6, -D / 2, 12, D - 2 * T]] as const) lbox(x, fy + 0.05, z, w, 0.4, d, P.floor === 'slab' ? '#4a4640' : '#5a4632');
  // —— 墙：下半截墙裙（木）、上半截粉墙、顶上一道木梁。墙根（sill 以下）不削；sill 以上标上墙段方向，朝镜头的那面削掉
  const hall = r.kind === 'hall';
  const plaster = hall ? '#c8b896' : '#e0d6c0', dado = hall ? '#7a2a20' : '#6a4630', beam = hall ? '#5a2a1e' : '#4a3020';
  const wall = (local: number, cx: number, cz: number, w: number, d: number, h0: number, h1: number) => {
    const side = worldSide(r, local), H = P.H, sill = P.sill, dh = Math.min(h1, hall ? 110 : 64);
    if (h0 < sill) lbox(cx, (h0 + Math.min(h1, sill)) / 2, cz, w, Math.min(h1, sill) - h0, d, dado);
    const a = Math.max(h0, sill);
    if (dh > a) lbox(cx, (a + dh) / 2, cz, w, dh - a, d, dado, side);
    const b = Math.max(a, dh);
    if (h1 > b) lbox(cx, (b + h1) / 2, cz, w, h1 - b, d, plaster, side);
    if (h1 >= H - 0.1) lbox(cx, H + 3, cz, w + 2, 6, d + 2, beam, side);
  };
  wall(3, 0, -D + T / 2, W, T, 0, P.H);
  wall(4, -W2 + T / 2, -D / 2, T, D, 0, P.H);
  wall(2, W2 - T / 2, -D / 2, T, D, 0, P.H);
  // 前墙：门洞两边各一截，门洞上一道门楣
  const dl = P.door.x - P.door.w / 2, dr = P.door.x + P.door.w / 2, doorH = hall ? 210 : 128;
  if (dl > -W2 + 1) wall(1, (-W2 + dl) / 2, -T / 2, dl + W2, T, 0, P.H);
  if (dr < W2 - 1) wall(1, (dr + W2) / 2, -T / 2, W2 - dr, T, 0, P.H);
  wall(1, P.door.x, -T / 2, P.door.w, T, doorH, P.H);
  for (const x of [dl, dr]) lbox(x, doorH / 2, -T / 2, 7, doorH, T + 3, hall ? '#7a2a20' : '#4a3020', worldSide(r, 1));
  lbox(P.door.x, 1.5, -T / 2, P.door.w, 3, T + 4, '#5a4030');   // 门槛
  // —— 陈设
  for (const q of P.prims) addPrim(B, r, q, floorY, odd);
  return { geo: B.geometry(), verts: B.count };
}
function addPrim(B: MB, r: Room, q: Prim, floorY: number, odd: boolean) {
  const [wx, wz] = toWorld(r, q.x, q.z), glow = q.glow ? 1 : 0;
  if (q.t === 'box') { B.box(wx, floorY + q.y, wz, odd ? q.d : q.w, q.h, odd ? q.w : q.d, q.c, 0, glow); return; }
  if (q.t === 'cyl') { B.cyl(wx, floorY + q.y, wz, q.r, q.h, q.c, q.n ?? 8, q.top, glow); return; }
  // 贴墙的平板：做成很薄的盒子（两面都看得见）
  const along = q.face === 's' || q.face === 'n';
  const w = along ? q.w : 1, d = along ? 1 : q.w;
  B.box(wx, floorY + q.y, wz, odd ? d : w, q.h, odd ? w : d, q.c, 0, glow);
}

interface Built { room: Room; mesh: Mesh; mat: ShaderMaterial; used: number }

export class IndoorGl {
  readonly group = new Group();
  private built = new Map<string, Built>();
  private frame = 0;
  private ring: Mesh; private arrow: Mesh;
  private camDir = new Vector3();
  /** 实测：每帧拼网格花了多少毫秒（最近一次）、累计拼了几间 */
  readonly stats = { buildMs: 0, builds: 0, verts: 0 };
  constructor(private hd: HdScene) {
    hd.scene.add(this.group);
    // 「走过去」的指引：门口一圈光（贴地、慢慢呼吸），主角脚下一枚箭头指过去
    const rm = new MeshBasicMaterial({ color: new Color(1.0, 0.82, 0.42), transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    this.ring = new Mesh(new RingGeometry(46, 60, 40), rm); this.ring.rotation.x = -Math.PI / 2; this.ring.visible = false; this.ring.renderOrder = 3;
    const sh = new Shape(); sh.moveTo(0, 34); sh.lineTo(22, 4); sh.lineTo(9, 4); sh.lineTo(9, -26); sh.lineTo(-9, -26); sh.lineTo(-9, 4); sh.lineTo(-22, 4); sh.closePath();
    this.arrow = new Mesh(new ShapeGeometry(sh), rm.clone()); this.arrow.visible = false; this.arrow.renderOrder = 3;
    this.group.add(this.ring, this.arrow);
  }

  update(game: Game, _dt: number): void {
    const ind = game.indoor, p = game.player, hd = this.hd;
    this.frame++;
    hd.cam.getWorldDirection(this.camDir);
    const cam = new Vector2(this.camDir.x, this.camDir.z); if (cam.lengthSq() > 1e-6) cam.normalize();
    const night = Math.max(0, Math.min(1, (game.night - 0.2) / 0.5));
    // 拼：主角 700 以内的屋、正在溶的那一间；一帧最多拼一间
    let builtThisFrame = false;
    for (const r of ind.near) {
      const d = Math.hypot(r.ax - p.x, r.ay - p.y);
      let b = this.built.get(r.id);
      if (!b && !builtThisFrame && (d < 700 || r === ind.fadeRoom)) { b = this.build(game, r); builtThisFrame = true; }
      if (b) b.used = this.frame;
    }
    // 回收：不在附近名单里、或离得远了（溶着的那间不收）
    for (const [id, b] of this.built) {
      if (b.room === ind.fadeRoom) { b.used = this.frame; continue; }
      if (this.frame - b.used > 30 || Math.hypot(b.room.ax - p.x, b.room.ay - p.y) > 1600) { this.group.remove(b.mesh); b.mesh.geometry.dispose(); b.mat.dispose(); this.built.delete(id); }
    }
    for (const b of this.built.values()) {
      const f = b.room === ind.fadeRoom ? ind.fade : 0, U = b.mat.uniforms;
      b.mesh.visible = f > 0.001;
      U.uFade.value = f; (U.uCam.value as Vector2).copy(cam); U.uNight.value = night;
    }
    // 建筑那边：这一栋的屋顶、门面溶掉
    const RF = hd.buildings.roomFade, r = ind.fadeRoom;
    if (r && ind.fade > 0) {
      const fy = ind.floorY(r);
      const a = boxW(r, r.fadeA); RF.uRoomA.value.set(a[0], a[1], a[2], a[3]);
      if (r.fadeB) { const q = boxW(r, r.fadeB); RF.uRoomB.value.set(q[0], q[1], q[2], q[3]); } else RF.uRoomB.value.set(0, 0, 0, 0);
      // 第六轮返工：门朝北的铺子，镜头那一侧的后宅（D 盒）从地面往上一并溶掉
      if (r.fadeC) { const q = boxW(r, r.fadeC); RF.uRoomD.value.set(q[0], q[1], q[2], q[3]); } else RF.uRoomD.value.set(0, 0, 0, 0);
      RF.uRoomC.value.set(fy + 0.5, fy + r.strip, ind.fade, fy - r.base + 2);
    } else RF.uRoomC.value.z = 0;
    // 指引
    const gr = ind.guideRoom;
    this.ring.visible = this.arrow.visible = false;
    if (gr) {
      const t = performance.now() / 1000, gy = hd.heightAt(gr.doorX, gr.doorY);
      this.ring.visible = true; this.ring.position.set(gr.doorX, gy + 3, gr.doorY);
      const s = 1 + 0.12 * Math.sin(t * 3.2); this.ring.scale.set(s, s, 1);
      (this.ring.material as MeshBasicMaterial).opacity = 0.55 + 0.25 * Math.sin(t * 3.2);
      const dx = gr.doorX - p.x, dy = gr.doorY - p.y, dist = Math.hypot(dx, dy);
      if (dist > 220) {
        const ux = dx / dist, uy = dy / dist, ax = p.x + ux * 90, ay = p.y + uy * 90;
        this.arrow.visible = true;
        this.arrow.position.set(ax, hd.heightAt(ax, ay) + 3, ay);
        // 平放在地上，尖朝目标：先躺平（本地 +y → 世界 -z），再绕竖轴转到目标方向
        this.arrow.rotation.set(-Math.PI / 2, 0, 0); this.arrow.rotateOnWorldAxis(new Vector3(0, 1, 0), Math.atan2(-ux, -uy));
        (this.arrow.material as MeshBasicMaterial).opacity = 0.6 + 0.2 * Math.sin(t * 4);
      }
    }
  }

  private build(game: Game, r: Room): Built {
    const t0 = performance.now();
    const ind = game.indoor, P = ind.plan(r), fy = ind.floorY(r);
    const { geo, verts } = buildRoomMesh(r, P, fy);
    const mat = new ShaderMaterial({ vertexShader: VS, fragmentShader: FS, vertexColors: true,
      uniforms: { uFade: { value: 0 }, uCam: { value: new Vector2(0, -1) }, uNight: { value: 0 }, uFloorY: { value: fy } } });
    const mesh = new Mesh(geo, mat); mesh.frustumCulled = true; mesh.visible = false;
    this.group.add(mesh);
    const b: Built = { room: r, mesh, mat, used: this.frame };
    this.built.set(r.id, b);
    this.stats.buildMs = performance.now() - t0; this.stats.builds++; this.stats.verts = verts;
    return b;
  }
  /**
   * 夜里屋里的灯火：每盏灯登记成一盏点光源（画面线的 LightList），照亮屋里的地坪、墙和人。
   * 只在这间屋正溶开（人在屋里）时亮，强度跟着溶解程度走——屋子合着的时候灯光不会透出屋顶。
   * add 的参数按 three 的约定：x、高度、z（= 世界 y）、半径、颜色、强度
   */
  lights(add: (x: number, h: number, z: number, r: number, cr: number, cg: number, cb: number, i: number) => void, game: Game, night: number): void {
    const ind = game.indoor, r = ind.fadeRoom;
    if (!r || ind.fade <= 0.01 || night <= 0.05) return;
    const P = ind.plan(r), fy = ind.floorY(r), k = night * ind.fade, t = performance.now() / 1000;
    P.lamps.forEach((L, i) => {
      const [x, y] = toWorld(r, L.x, L.z), fl = 0.9 + 0.1 * Math.sin(t * 6.3 + i * 1.9) * Math.sin(t * 2.7 + i);
      add(x, fy + L.y, y, L.r * 2.6, 1, 0.74, 0.44, 2 * k * fl);
    });
  }
  /** 测试 / 截图：拼好的屋有几间 */
  get count() { return this.built.size; }
}
function boxW(r: Room, b: { x0: number; z0: number; x1: number; z1: number }): [number, number, number, number] {
  const [ax, ay] = toWorld(r, b.x0, b.z0), [bx, by] = toWorld(r, b.x1, b.z1);
  return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
}
