// 收官 P8（丁）：画中洞天的画法（逻辑在 world/huajuan.ts）。
// · 画里的景：一张 512² 的离屏画布，约 10 Hz 重画——远山几层淡墨、雾带横飘，近处是画中秘境真正的石台（MijingSys.preview 生成的同一份），
//   石桥、松、首领的祭坛；台上几个墨点似的妖物在走，一只鹤飞过，题款与朱印。只在画在视野里、离得不远（或人刚进画里、画还盖着屏幕）时重画。
// · 卷轴：立在地上的画架（两根立柱、横梁）、绫子装裱、上下两根轴，画心贴着这张离屏画；画前地上一道淡墨线。
// · 走进去：一层全屏的画，从画框在屏幕上的位置一点点铺满屏幕（人往里走多少，就铺多少）；进去以后这层画像墨迹洇开一样散去。
import {
  BoxGeometry, CanvasTexture, CylinderGeometry, DoubleSide, Group, LinearFilter, Mesh, MeshBasicMaterial, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector4,
} from 'three';
import type { Game } from '../world/game';
import type { HdScene } from './scene';
import { LINE, type Scroll } from '../world/huajuan';
import type { MjFloor } from '../world/mijing';

const PX = 512;
/** 画心在离屏画上取的那一竖条（画是竖幅；铺满屏幕时取整张） */
const CROP = [0.13, 0, 0.87, 1] as const;

const OVERLAY_FS = `
uniform sampler2D uTex; uniform vec4 uRect; uniform vec4 uUV; uniform vec4 uP; uniform vec2 uRes;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  vec2 q = (ndc - uRect.xy) / (uRect.zw - uRect.xy);
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) discard;
  vec3 c = texture2D(uTex, mix(uUV.xy, uUV.zw, q)).rgb;
  // uP = (整体不透明度, 洇开的程度：1 = 整幅都在、0 = 散尽, 时间, 0)。散的时候按几层噪声从边角往里一块块化开，边上一圈淡墨晕
  float n = vn(q * 5.0 + uP.z * 0.05) * 0.55 + vn(q * 13.0) * 0.3 + vn(q * 31.0) * 0.15;
  float edge = length(q - 0.5) * 0.6;
  float m = uP.y >= 0.999 ? 1.0 : smoothstep(n + edge - 0.06, n + edge + 0.06, uP.y * 1.35);
  float rim = uP.y >= 0.999 ? 0.0 : (1.0 - smoothstep(0.0, 0.08, abs(uP.y * 1.35 - n - edge))) * 0.35;
  c = mix(c, c * 0.55, rim);
  float a = uP.x * m;
  if (a <= 0.003) discard;
  gl_FragColor = vec4(c * a, a);
}`;

export class HuajuanGl {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  readonly tex: CanvasTexture;
  private group = new Group();
  /**
   * 第六轮返工：附近的每一幅都立起来（原来只立离人最近的那一幅——洞府门前挂两三幅，只看得见一幅）。
   * 最近那一幅的画心贴活的离屏画；别的贴各自静画一次的小画布（不随时间动，省得每幅都 10 Hz 重画）
   */
  private frames = new Map<string, { g: Group; heart: MeshBasicMaterial; still: CanvasTexture | null }>();
  private lastPaint = -1;
  private paintedFor = '';
  private oScene = new Scene(); private oCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1); private oMat: ShaderMaterial;
  private fiber: HTMLCanvasElement | null = null;
  /** 实测：重画了几次、上一次重画花了多少毫秒、这一帧画了没有 */
  readonly stats = { paints: 0, paintMs: 0, painted: false };
  constructor(private hd: HdScene) {
    this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = PX;
    this.ctx = this.canvas.getContext('2d')!;
    // 颜色按原值用（和建筑一样不做色彩空间换算）：世界里的画心和全屏那层画是同一个颜色
    this.tex = new CanvasTexture(this.canvas); this.tex.minFilter = LinearFilter; this.tex.generateMipmaps = false;
    hd.scene.add(this.group); this.group.visible = false;
    this.oMat = new ShaderMaterial({ vertexShader: `void main(){ gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }`, fragmentShader: OVERLAY_FS,
      transparent: true, depthTest: false, depthWrite: false, premultipliedAlpha: true,
      uniforms: { uTex: { value: this.tex }, uRect: { value: new Vector4() }, uUV: { value: new Vector4(0, 0, 1, 1) }, uP: { value: new Vector4() }, uRes: { value: [1, 1] } } });
    const quad = new Mesh(new PlaneGeometry(1, 1), this.oMat); quad.frustumCulled = false; this.oScene.add(quad);
  }

  /** 世界里的卷轴（只在世界里画；秘境里藏起来） */
  update(game: Game): void {
    const near = game.huajuan.near, hd = this.hd, p = game.player;
    if (!near || game.offWorld) { this.group.visible = false; return; }
    const want = game.huajuan.scrolls().filter((q) => q.id === near.id || Math.hypot(q.x - p.x, q.y - p.y) < 4000);
    for (const [id, f] of this.frames) if (!want.some((q) => q.id === id)) this.drop(id, f);
    for (const q of want) {
      let f = this.frames.get(q.id);
      if (f && (Math.abs(f.g.userData.x - q.x) > 1 || Math.abs(f.g.userData.y - q.y) > 1)) { this.drop(q.id, f); f = undefined; }   // 洞府门前的画找到了空地、挪了位置
      if (!f) f = this.build(game, q, hd.heightAt(q.x, q.y));
      const map = q.id === near.id ? this.tex : f.still;
      if (f.heart.map !== map) { f.heart.map = map; f.heart.needsUpdate = true; }
    }
    this.group.visible = true;
    // 收官返工：走进画那层全屏画的着色器，原来到人开始往里走、头一回画它时才编（那一帧多等三四十毫秒）——人一走近画就先画一遍
    if (!this.oWarm) { this.oWarm = true; (this.oMat.uniforms.uP.value as Vector4).set(0, 1, 0, 0); hd.warmRender(this.oScene, this.oCam); }
  }
  private oWarm = false;
  private drop(id: string, f: { g: Group; heart: MeshBasicMaterial; still: CanvasTexture | null }) {
    this.group.remove(f.g);
    f.g.traverse((c) => { const m = c as Mesh; m.geometry?.dispose(); });
    f.still?.dispose(); this.frames.delete(id);
  }
  private build(game: Game, s: Scroll, ground: number) {
    const grp = new Group(); grp.userData = { x: s.x, y: s.y }; this.group.add(grp);
    // 静画一张（不是最近那一幅时贴它）：和活画同一个画法，时刻取 0
    const sc = document.createElement('canvas'); sc.width = sc.height = 256;
    const big = document.createElement('canvas'); big.width = big.height = PX;
    drawPainting(big.getContext('2d')!, s, game.huajuan.preview(s), 0, this.fiber ??= makeFiber());
    sc.getContext('2d')!.drawImage(big, 0, 0, 256, 256);
    const still = new CanvasTexture(sc); still.minFilter = LinearFilter; still.generateMipmaps = false;
    const heart = new MeshBasicMaterial({ map: still });
    const f = { g: grp, heart, still };
    this.frames.set(s.id, f);
    const wood = new MeshBasicMaterial({ color: 0x3a2a20 }), silk = new MeshBasicMaterial({ color: 0xd2c39c }), gold = new MeshBasicMaterial({ color: 0xb8923a });
    const add = (m: Mesh, x: number, y: number, z: number) => { m.position.set(s.x + x, ground + y, s.y + z); grp.add(m); return m; };
    const W = s.w, H = s.h, base = 46, top = base + H + 64;
    // 画架：两根立柱、底座、横梁
    for (const k of [-1, 1]) { add(new Mesh(new BoxGeometry(9, top + 14, 9), wood), k * (W / 2 + 26), (top + 14) / 2, -4); add(new Mesh(new BoxGeometry(22, 8, 46), wood), k * (W / 2 + 26), 4, -4); }
    add(new Mesh(new BoxGeometry(W + 76, 8, 8), wood), 0, top + 6, -4);
    // 装裱：绫子底、上下轴（两头鎏金）
    add(new Mesh(new PlaneGeometry(W + 30, H + 74), silk), 0, base + H / 2 + 6, -1.5);
    for (const y of [base - 28, base + H + 40]) {
      const r = add(new Mesh(new CylinderGeometry(4.5, 4.5, W + 46, 10), wood), 0, y, 0); r.rotation.z = Math.PI / 2;
      for (const k of [-1, 1]) add(new Mesh(new CylinderGeometry(5.5, 5.5, 6, 10), gold), k * (W / 2 + 25), y, 0).rotation.z = Math.PI / 2;
    }
    // 画心：贴着离屏画（竖幅取中间一条）
    const g = new PlaneGeometry(W, H), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, CROP[0] + uv.getX(i) * (CROP[2] - CROP[0]), uv.getY(i));
    add(new Mesh(g, heart), 0, base + H / 2, 0);
    // 画前地上一道淡墨线（界线）
    const lc = document.createElement('canvas'); lc.width = 256; lc.height = 16; const x = lc.getContext('2d')!;
    for (let i = 0; i < 90; i++) { const px = i / 90 * 256, w = 3 + ((i * 37) % 7); x.fillStyle = `rgba(28,26,22,${0.18 + ((i * 53) % 10) / 40})`; x.fillRect(px, 5 + ((i * 29) % 5) - 2, w, 5 + ((i * 17) % 4)); }
    const lt = new CanvasTexture(lc);
    const line = new Mesh(new PlaneGeometry(W + 70, 9), new MeshBasicMaterial({ map: lt, transparent: true, opacity: 0.6, depthWrite: false, side: DoubleSide }));
    line.rotation.x = -Math.PI / 2; add(line, 0, 1.6, LINE).renderOrder = 2;
    return f;
  }

  /** 画里的景（离屏画布）：要画的时候约 10 Hz 重画一次 */
  private paint(game: Game, s: Scroll) {
    const t = game.time;
    this.stats.painted = false;
    if (this.paintedFor === s.id && t - this.lastPaint < 0.1 && t >= this.lastPaint) return;
    const t0 = performance.now();
    this.lastPaint = t; this.paintedFor = s.id;
    drawPainting(this.ctx, s, game.huajuan.preview(s), t, this.fiber ??= makeFiber());
    this.tex.needsUpdate = true;
    this.stats.paints++; this.stats.paintMs = performance.now() - t0; this.stats.painted = true;
  }

  /** 每帧（世界里、画中都调）：按需重画离屏画；走进去 / 刚进去时盖一层全屏的画 */
  overlay(game: Game): void {
    const H = game.huajuan, s = H.cur ?? H.near, hd = this.hd;
    if (!s) return;
    if (H.paintWanted(s) && this.onScreen(game, s)) this.paint(game, s);
    const k = H.cover;
    if (k <= 0.003) return;
    const W = hd.W, Hh = hd.H, pw = hd.canvas.width, ph = hd.canvas.height;
    const U = this.oMat.uniforms;
    const full = Math.max(W, Hh) * 1.04, fx = full / W, fy = full / Hh;
    if (H.cur) {
      // 已经在画里：整幅盖着，往外走洇开散去
      (U.uRect.value as Vector4).set(-fx, -fy, fx, fy); (U.uUV.value as Vector4).set(0, 0, 1, 1);
      (U.uP.value as Vector4).set(1, k, game.time, 0);
    } else {
      // 走进去：从画框在屏幕上的位置铺向整屏（缓入缓出）；画心的取景从竖条放到整张
      const g0 = hd.heightAt(s.x, s.y), y0 = g0 + 46, y1 = y0 + s.h;
      const pts = [hd.projectAbsolute(s.x - s.w / 2, s.y, y0), hd.projectAbsolute(s.x + s.w / 2, s.y, y0), hd.projectAbsolute(s.x - s.w / 2, s.y, y1), hd.projectAbsolute(s.x + s.w / 2, s.y, y1)];
      const toN = (p: { x: number; y: number }) => [p.x / W * 2 - 1, 1 - p.y / Hh * 2];
      const n = pts.map(toN), x0 = Math.min(...n.map((q) => q[0])), x1 = Math.max(...n.map((q) => q[0])), ya = Math.min(...n.map((q) => q[1])), yb = Math.max(...n.map((q) => q[1]));
      const e = k * k * (3 - 2 * k);
      (U.uRect.value as Vector4).set(x0 + (-fx - x0) * e, ya + (-fy - ya) * e, x1 + (fx - x1) * e, yb + (fy - yb) * e);
      (U.uUV.value as Vector4).set(CROP[0] * (1 - e), 0, CROP[2] + (1 - CROP[2]) * e, 1);
      (U.uP.value as Vector4).set(Math.min(1, k / 0.12), 1, game.time, 0);
    }
    U.uRes.value = [pw, ph];
    const gl = hd.gl;
    gl.resetState(); gl.setRenderTarget(null); gl.setViewport(0, 0, pw, ph);
    gl.autoClear = false; gl.render(this.oScene, this.oCam); gl.autoClear = true;
    gl.resetState();
  }
  /** 画在屏幕上看得到吗（画框四角投影后和屏幕有交集；人在画里时恒为真） */
  private onScreen(game: Game, s: Scroll): boolean {
    if (game.huajuan.cur) return true;
    const hd = this.hd, g0 = hd.heightAt(s.x, s.y), a = hd.projectAbsolute(s.x, s.y, g0 + 46 + s.h / 2);
    return a.x > -hd.W * 0.3 && a.x < hd.W * 1.3 && a.y > -hd.H * 0.4 && a.y < hd.H * 1.3;
  }
  /** 测试 / 截图 */
  get painting(): HTMLCanvasElement { return this.canvas; }
}

/** 宣纸的纤维（画一次，复用） */
function makeFiber(): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = c.height = PX; const x = c.getContext('2d')!;
  let s = 7; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(${120 + r() * 60},${110 + r() * 50},${90 + r() * 40},${0.04 + r() * 0.05})`; x.fillRect(r() * PX, r() * PX, 1 + r() * 9, 0.6 + r() * 0.8); }
  return c;
}

/** 按种子算的平滑起伏（远山的山脊线） */
function ridge(seed: number, x: number): number {
  let v = 0;
  for (let i = 1; i <= 4; i++) v += Math.sin(x * 0.011 * i * (1 + (seed % 7) * 0.07) + seed * 1.3 * i) / i;
  return v;
}

/** 画一幅：远山、雾、画中秘境的石台与桥、松、走动的妖物、飞鹤、题款与印 */
export function drawPainting(c: CanvasRenderingContext2D, s: Scroll, F: MjFloor, t: number, fiber: HTMLCanvasElement) {
  const seed = s.spec.seed;
  c.setTransform(1, 0, 0, 1, 0, 0);
  // 纸
  const bg = c.createLinearGradient(0, 0, 0, PX); bg.addColorStop(0, '#efe7d2'); bg.addColorStop(1, '#e6dcc2');
  c.fillStyle = bg; c.fillRect(0, 0, PX, PX);
  c.drawImage(fiber, 0, 0);
  // 远山三层：越远越淡，山脚化进雾里
  for (let L = 0; L < 3; L++) {
    const base = 150 + L * 56, amp = 46 - L * 8, ink = 0.13 + L * 0.09;
    c.beginPath(); c.moveTo(0, PX);
    for (let x = 0; x <= PX; x += 6) c.lineTo(x, base - Math.max(0, ridge(seed + L * 17, x) * amp + amp * 0.6) - (L === 0 ? Math.max(0, 80 - Math.abs(x - 330) * 0.6) : 0));
    c.lineTo(PX, PX); c.closePath();
    const gr = c.createLinearGradient(0, base - amp * 2 - 60, 0, base + 60);
    gr.addColorStop(0, `rgba(36,40,40,${ink})`); gr.addColorStop(0.55, `rgba(40,44,44,${ink * 0.7})`); gr.addColorStop(1, 'rgba(40,44,44,0)');
    c.fillStyle = gr; c.fill();
    // 山脊一道浓一点的墨线
    c.beginPath();
    for (let x = 0; x <= PX; x += 6) { const y = base - Math.max(0, ridge(seed + L * 17, x) * amp + amp * 0.6) - (L === 0 ? Math.max(0, 80 - Math.abs(x - 330) * 0.6) : 0); if (x === 0) c.moveTo(x, y); else c.lineTo(x, y); }
    c.strokeStyle = `rgba(24,24,22,${ink * 0.9})`; c.lineWidth = 1.2; c.stroke();
    // 雾带：横着慢慢飘
    for (let i = 0; i < 2; i++) {
      const fx = ((t * (6 + L * 3) + i * 260 + L * 90) % (PX + 300)) - 150, fy = base + 8 + i * 14;
      const mg = c.createRadialGradient(fx, fy, 4, fx, fy, 150); mg.addColorStop(0, 'rgba(242,238,226,0.7)'); mg.addColorStop(1, 'rgba(242,238,226,0)');
      c.save(); c.translate(fx, fy); c.scale(1, 0.22); c.translate(-fx, -fy); c.fillStyle = mg; c.fillRect(fx - 150, fy - 150, 300, 300); c.restore();
    }
  }
  // 画中秘境：石台按真实布局缩进画面下半（斜看：纵向压扁），从远到近画
  const isles = F.isles ?? [], bridges = F.bridges ?? [];
  if (isles.length) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of isles) { x0 = Math.min(x0, q.x - q.r); x1 = Math.max(x1, q.x + q.r); y0 = Math.min(y0, q.y - q.r); y1 = Math.max(y1, q.y + q.r); }
    const k = Math.min(420 / (x1 - x0), 250 / ((y1 - y0) * 0.5)), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const P = (x: number, y: number) => [256 + (x - cx) * k, 352 + (y - cy) * k * 0.5] as const;
    // 桥：两道细墨线
    c.strokeStyle = 'rgba(30,30,28,0.55)'; c.lineWidth = 1;
    for (const b of bridges) { const [ax, ay] = P(b.ax, b.ay), [bx, by] = P(b.bx, b.by), nx = -(by - ay), ny = bx - ax, l = Math.hypot(nx, ny) || 1, o = Math.max(1.5, b.w * k * 0.25); for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(ax + nx / l * o * sg, ay + ny / l * o * sg); c.lineTo(bx + nx / l * o * sg, by + ny / l * o * sg); c.stroke(); } }
    const order = isles.map((q, i) => ({ q, i })).sort((a, b) => a.q.y - b.q.y);
    for (const { q, i } of order) {
      const [x, y] = P(q.x, q.y), rx = q.r * k, ry = rx * 0.5;
      // 台底倒悬的岩：一抹往下收的浓墨
      const rg = c.createLinearGradient(0, y, 0, y + rx * 1.1); rg.addColorStop(0, 'rgba(28,28,26,0.72)'); rg.addColorStop(1, 'rgba(28,28,26,0)');
      c.beginPath(); c.moveTo(x - rx, y); c.quadraticCurveTo(x - rx * 0.5, y + rx * 0.7, x + rx * 0.05, y + rx * 1.05); c.quadraticCurveTo(x + rx * 0.5, y + rx * 0.6, x + rx, y); c.closePath(); c.fillStyle = rg; c.fill();
      // 台面：淡石色、浓墨的边
      c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = '#ddd5bf'; c.fill();
      c.strokeStyle = 'rgba(22,22,20,0.8)'; c.lineWidth = 1.4; c.stroke();
      // 松：大台上两三株
      const nP = q.kind === 'boss' ? 0 : 1 + ((q.seed >>> 2) % 3);
      for (let j = 0; j < nP; j++) {
        const a = (q.seed % 97) / 97 * 6.28 + j * 2.1, px = x + Math.cos(a) * rx * 0.55, py = y + Math.sin(a) * ry * 0.5, h = Math.max(8, rx * 0.5);
        c.strokeStyle = 'rgba(34,30,24,0.85)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(px, py); c.lineTo(px + 1, py - h); c.stroke();
        c.fillStyle = 'rgba(30,38,30,0.78)';
        for (let m = 0; m < 3; m++) { c.beginPath(); c.ellipse(px + (m % 2 ? 3 : -3), py - h * (0.5 + m * 0.22), h * (0.42 - m * 0.08), h * 0.12, 0, 0, Math.PI * 2); c.fill(); }
      }
      // 首领的祭坛：四根柱
      if (q.kind === 'boss') for (let j = 0; j < 4; j++) { const a = j / 4 * 6.28 + 0.78, px = x + Math.cos(a) * rx * 0.7, py = y + Math.sin(a) * ry * 0.7; c.fillStyle = 'rgba(30,26,22,0.9)'; c.fillRect(px - 1.5, py - rx * 0.6, 3, rx * 0.6); }
      // 走动的妖物：几个墨点似的身影绕着台心慢慢走（首领台上一个大的）
      if (q.kind !== 'entry') {
        const n = q.kind === 'boss' ? 1 : 2 + (i % 2);
        for (let j = 0; j < n; j++) {
          const sp = 0.25 + ((q.seed >> (j + 1)) % 5) * 0.06, a = t * sp * (j % 2 ? -1 : 1) + j * 2.4 + i, px = x + Math.cos(a) * rx * 0.42, py = y + Math.sin(a) * ry * 0.42;
          const sz = q.kind === 'boss' ? 6 : 3.4, bob = Math.abs(Math.sin(t * 4 + j * 1.7 + i)) * 1.2;
          c.fillStyle = q.kind === 'boss' ? 'rgba(90,20,16,0.9)' : 'rgba(20,20,18,0.88)';
          c.beginPath(); c.ellipse(px, py - sz - bob, sz * 1.1, sz * 0.75, 0, 0, Math.PI * 2); c.fill();
          c.beginPath(); c.arc(px + sz * 0.9 * (Math.cos(a) > 0 ? -1 : 1), py - sz * 1.6 - bob, sz * 0.45, 0, Math.PI * 2); c.fill();
        }
      }
    }
  }
  // 近处飘过的云
  for (let i = 0; i < 3; i++) {
    const fx = ((t * (9 + i * 4) + i * 210 + seed % 200) % (PX + 260)) - 130, fy = 300 + i * 48;
    const mg = c.createRadialGradient(fx, fy, 2, fx, fy, 90); mg.addColorStop(0, 'rgba(246,243,234,0.6)'); mg.addColorStop(1, 'rgba(246,243,234,0)');
    c.save(); c.translate(fx, fy); c.scale(1, 0.3); c.translate(-fx, -fy); c.fillStyle = mg; c.fillRect(fx - 90, fy - 90, 180, 180); c.restore();
  }
  // 一只鹤：从左往右飞过，翅膀一扇一扇
  {
    const fx = ((t * 18 + seed % 300) % (PX + 120)) - 60, fy = 96 + Math.sin(t * 0.6) * 10, w = 9 * (0.6 + 0.4 * Math.abs(Math.sin(t * 5)));
    c.strokeStyle = 'rgba(24,24,22,0.85)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(fx - 10, fy - w); c.quadraticCurveTo(fx - 4, fy - 2, fx, fy); c.quadraticCurveTo(fx + 4, fy - 2, fx + 10, fy - w); c.stroke();
    c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx + 9, fy + 1); c.stroke();
  }
  // 题款与朱印（右上，竖排）
  c.fillStyle = 'rgba(26,24,20,0.86)'; c.font = '20px "Noto Serif SC","Songti SC",serif'; c.textAlign = 'center'; c.textBaseline = 'top';
  [...s.name].slice(0, 6).forEach((ch, i) => c.fillText(ch, 418, 40 + i * 23));
  const sy2 = 44 + Math.min(6, s.name.length) * 23;
  c.fillStyle = 'rgba(176,52,40,0.9)'; c.fillRect(408, sy2, 20, 20); c.fillStyle = '#f2e6d0'; c.font = '13px "Noto Serif SC",serif'; c.fillText('洞', 418, sy2 + 3);
}
