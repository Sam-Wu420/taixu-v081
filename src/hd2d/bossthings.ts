// 首领立板（r16 夜无赦）：照 hd2d/seathings.ts 的「单独贴图平面」做的陆地版。数据来自玩法那边的 view()，这里只管画。
//
// 为什么不进共享的立板图集：首领的贴图一张 640 上下、魔躯站起来有几个人高，进图集会被压糊，还会被 beastBox 的框裁掉。
// 所以照海兽的先例，在 HD 场景里单独挂 three 网格：
//   · 立板：一块竖着朝镜头的面片（uRight、uBoost 的写法照 scene.ts），没有水线裁剪、没有湿边；
//     挤压拉伸、左右翻转、绕腰（或任意高度）旋转、闪白、乘色 / 加色、外圈辉光都在 GPU 上做，每帧只改 uniform。
//   · 残影池：同一帧的贴图，透明度一层层递减、沿冲刺方向拉长、染成魔气的颜色，画在本体后面。
//     两种来源：ghost > 0 时按本体最近一段的轨迹自动排（冲刺、跃起、瞬移都有）；ghosts[] 由玩法直接给位置（瞬移连线、分身）。
//   · 脚下一块软影子：首领不进立板图集，也就不往阴影图里写，这里补一块椭圆的地影（离地越高越小越淡）。
//
// ───────────────────────────── 给玩法线的接口 ─────────────────────────────
// 每帧 render.ts 调 bossViewOf(game)：依次问 game.yewushe?.view() 和 game.bossPuppet?.view()（试玩页的木偶），
// 把各家的 sprites 合在一起交给 BossThings.update()。view() 返回 BossView：
//   {
//     sprites: [{
//       id,                 稳定的编号（自动残影按它记轨迹；同一个首领每帧给同一个数）
//       key,                帧名，如 'yws_h_idle'（对照表见 world/yewushe-anim.ts 的 YWS_FRAMES、src/assets/yewushe/说明.md）
//       x, y,               脚下那一点（本图坐标）
//       z,                  离地高度（跃起、浮空；世界单位，和 Enemy.lift 一样）
//       H,                  立板高度（世界单位，没乘 sy 之前；每帧的贴图高矮不一，按 yewushe-anim.ts 的 YWS_FRAME_META 乘过）
//       ax?,                脚在贴图横向的哪里（0–1，从图的左边量，默认 0.5；镰刀伸出去很远的帧脚不在正中）
//       face,               1 = 朝右，-1 = 朝左（原画都朝左画）
//       sx, sy,             挤压拉伸（1 = 原样；出手那一帧 sx 1.15 / sy 0.9 这种）
//       rot,                旋转（弧度，正 = 画面上顺时针朝前倒——已按 face 换算，玩法不用管左右）
//       pivot?,             旋转轴离脚多高（0–1，默认 0.45，约在腰）
//       alpha, flash,       透明度、受击闪白（0–1）
//       tint?, add?,        乘色、加色（[r,g,b]，调色：魔化发紫、蓄力发红）
//       glow, glowCol?,     外圈辉光的强度（0–1.5）和颜色（默认紫）
//       ghost?, ghostCol?,  自动残影的强度（0–1，0 = 不出）和颜色（默认暗紫）
//       ghosts?,            额外的残影：[{ x, y, z, alpha, key?, sx?, sy?, rot?, face? }]（不给 key 就用本体那一帧）
//       shadow?,            脚下软影子的浓度（默认 1，0 = 不画）
//     }]
//   }
// 玩法那边：首领的 Enemy 在 BossThings.ready（game.yewushe.hdReady，render.ts 每帧写回）为真时打上 e.bossHD = true——
// combatfx.ts 就不再把它塞进共享的立板图集，gl/foegl.ts 不给它套金色护体光圈和离地的小黑影。照海兽的 seaHD。
// ──────────────────────────────────────────────────────────────────────
import {
  BufferGeometry, DoubleSide, Float32BufferAttribute, LinearFilter, LinearMipmapLinearFilter, Mesh, PlaneGeometry, Scene, ShaderMaterial, Texture, CanvasTexture, Vector2, Vector3, Vector4,
} from 'three';
import { ywsPlaceholder } from '../gfx/ywsPlaceholder';
import { YWS_FRAMES, YWS_FX_FRAMES } from '../world/yewushe-anim';

export type RGB3 = [number, number, number];
export interface BossGhost { x: number; y: number; z: number; alpha: number; key?: string; sx?: number; sy?: number; rot?: number; face?: number; H?: number; ax?: number }
export interface BossSprite {
  id: number; key: string; x: number; y: number; z: number; H: number; face: number;
  sx: number; sy: number; rot: number; pivot?: number; ax?: number;
  alpha: number; flash: number; tint?: RGB3; add?: RGB3; glow: number; glowCol?: RGB3;
  ghost?: number; ghostCol?: RGB3; ghosts?: BossGhost[]; shadow?: number;
}
export interface BossView { sprites: BossSprite[] }
/** 能交出首领画面的东西（game.yewushe、试玩页的木偶） */
export interface BossSource { view(): BossView | null; hdReady?: boolean }

const EMPTY: BossView = { sprites: [] };
const MERGED: BossView = { sprites: [] };
/** 把各家首领的画面合成一份（多数时候只有一家，直接返回它的，不拷贝） */
export function bossViewOf(game: object): BossView {
  const g = game as { yewushe?: BossSource; bossPuppet?: BossSource };
  const a = g.yewushe?.view?.() ?? null, b = g.bossPuppet?.view?.() ?? null;
  if (!a?.sprites.length) return b ?? EMPTY;
  if (!b?.sprites.length) return a;
  MERGED.sprites.length = 0; MERGED.sprites.push(...a.sprites, ...b.sprites); return MERGED;
}
/** render.ts 每帧把「贴图好了没有」写回各家（玩法据此给 Enemy 打 bossHD） */
export function bossReadyTo(game: object, ready: boolean) {
  const g = game as { yewushe?: BossSource; bossPuppet?: BossSource };
  if (g.yewushe) g.yewushe.hdReady = ready; if (g.bossPuppet) g.bossPuppet.hdReady = ready;
}

const POOL = { sprite: 6, ghost: 36, shadow: 6 } as const;
/** 立板四周留白（贴图坐标的比例）：外圈辉光画在原图外面，面片要比图大一圈 */
const PAD = 0.07;

const SPRITE_VS = `
uniform vec3 uFoot; uniform vec4 uBox; uniform vec3 uRight; uniform float uBoost; uniform vec2 uScale; uniform float uPivot; uniform float uAx;
varying vec2 vUv;
void main(){
  vec2 k = (position.xy + 0.5) * (1.0 + 2.0 * ${PAD.toFixed(3)}) - ${PAD.toFixed(3)};
  // uBox = (半宽, 高, 离地, 旋转)；先缩放，再绕轴（离脚 uPivot 那么高）转
  float fx = (k.x - uAx) * 2.0 * uBox.x * uScale.x, fy = k.y * uBox.y * uScale.y - uPivot;
  float c = cos(uBox.w), s = sin(uBox.w);
  float rx = fx * c + fy * s, ry = -fx * s + fy * c + uPivot;
  vec3 w = uFoot + uRight * rx + vec3(0.0, (ry + uBox.z) * uBoost, 0.0);
  vUv = k;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
// uA = (透明度, 闪白, 辉光强度, 残影：0 = 本体 / >0 = 残影染色的比例)；uTint 乘色、uAdd 加色、uGlow 辉光色、uG.xy = 辉光半径（贴图坐标）
const SPRITE_FS = `
uniform sampler2D uMap; uniform vec4 uA; uniform vec3 uGlow; uniform vec3 uTint; uniform vec3 uAdd; uniform vec2 uG; varying vec2 vUv;
float al(vec2 p){ return (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) ? 0.0 : texture2D(uMap, p).a; }
void main(){
  bool inside = vUv.x >= 0.0 && vUv.y >= 0.0 && vUv.x <= 1.0 && vUv.y <= 1.0;
  vec4 c = inside ? texture2D(uMap, vUv) : vec4(0.0);
  float a = c.a;
  vec3 col = c.rgb * uTint + uAdd * a;
  // 外圈辉光：八个方向取透明度，取最大的那个减掉本身——原图外面一圈光晕；魔气、蓄力都靠它
  float halo = 0.0;
  if (uA.z > 0.01) {
    float m = 0.0;
    for (int i = 0; i < 8; i++) { float an = float(i) * 0.7853982; vec2 d = vec2(cos(an), sin(an)) * uG; m = max(m, al(vUv + d)); m = max(m, al(vUv + d * 0.5) * 0.9); }
    halo = clamp(m - a, 0.0, 1.0) * uA.z;
    col += uGlow * uA.z * a * 0.1;   // 本体也透一点光（多了整个人糊成一团纯色，看不出贴图）
  }
  col = mix(col, vec3(1.0, 0.96, 1.0), uA.y * 0.75);
  // 残影：整张染成魔气的颜色（留一点原图的明暗，看得出是同一个姿势）
  if (uA.w > 0.0) col = mix(col, uGlow * (0.55 + 0.6 * dot(c.rgb, vec3(0.33))), uA.w);
  float outA = max(a, halo * 0.85) * uA.x;
  if (outA < 0.03) discard;
  vec3 outC = col * a + uGlow * halo * 0.85 * (1.0 - a);
  gl_FragColor = vec4(outC * uA.x, outA);
}`;
// 地影：贴在地面上的一块椭圆（uC = 中心 x, 地面高, 中心 y, 半径；uD = 浓度, 右方向 x, 右方向 z, 0）
const SHADOW_VS = `
uniform vec4 uC; uniform vec4 uD; varying vec2 vL;
void main(){
  vL = position.xy * 2.0;
  vec2 r = vec2(uD.y, uD.z), f = vec2(-r.y, r.x);
  vec2 p = uC.xz + (r * position.x + f * position.y * 0.55) * uC.w * 2.0;
  gl_Position = projectionMatrix * viewMatrix * vec4(p.x, uC.y + 6.0, p.y, 1.0);
}`;
const SHADOW_FS = `
uniform vec4 uD; varying vec2 vL;
void main(){ float d = length(vL); float a = (1.0 - smoothstep(0.35, 1.0, d)) * uD.x; if (a < 0.01) discard; gl_FragColor = vec4(0.0, 0.0, 0.0, a * 0.55); }`;

const ONE3: RGB3 = [1, 1, 1], ZERO3: RGB3 = [0, 0, 0], GLOW0: RGB3 = [0.62, 0.3, 1], GHOST0: RGB3 = [0.42, 0.16, 0.7];

/** 贴图：按帧名懒加载。生成的贴图（gfx/ywsTexData.ts 的 data URL）优先，没有的帧先用占位剪影（gfx/ywsPlaceholder.ts） */
class BossTex {
  private src: Record<string, string> | null = null; private started = false; private failed = false;
  private tex = new Map<string, Texture | null>();
  get ready() { return !!this.src || this.failed; }
  start() {
    if (this.started || typeof Image === 'undefined') return;
    this.started = true;
    import('../gfx/ywsTexData').then((m) => { this.src = m.YWS_SRC; }).catch((e) => { this.failed = true; console.warn('夜无赦贴图不可用，用占位剪影', e); });
  }
  get(key: string): Texture | null {
    const have = this.tex.get(key); if (have !== undefined) return have;
    if (!this.ready) return null;
    const url = this.src?.[key];
    if (!url) {
      // 还没画出来的帧：占位剪影（同步画好）
      const cv = ywsPlaceholder(key);
      const t = cv ? new CanvasTexture(cv as HTMLCanvasElement) : null;
      if (t) { t.minFilter = LinearMipmapLinearFilter; t.magFilter = LinearFilter; t.generateMipmaps = true; t.premultiplyAlpha = false; t.needsUpdate = true; }
      this.tex.set(key, t); return t;
    }
    this.tex.set(key, null);
    const im = new Image();
    im.onload = () => {
      const t = new Texture(im); t.minFilter = LinearMipmapLinearFilter; t.magFilter = LinearFilter; t.generateMipmaps = true; t.anisotropy = 4;
      t.needsUpdate = true; this.tex.set(key, t);
    };
    im.src = url;
    return null;
  }
  /** 预热：一组帧都先开始加载（出招时第一次切到某帧不会空一下） */
  warm(keys: readonly string[]) { for (const k of keys) this.get(k); }
  /** 这一帧还没加载好时退而求其次：同一形态的待机帧 */
  getOr(key: string): Texture | null { return this.get(key) ?? this.get(key.replace(/^(yws_[hbm])_.*$/, '$1_idle')); }
  dispose() { for (const t of this.tex.values()) t?.dispose(); this.tex.clear(); }
}

interface Spr { mesh: Mesh; mat: ShaderMaterial }
interface Trail { t: number; x: number; y: number; z: number; key: string; sx: number; sy: number; rot: number; face: number; H: number; pivot: number; ax: number }

export class BossThings {
  private tex = new BossTex();
  private sprites: Spr[] = [];
  private ghosts: Spr[] = [];
  private shadows: { mesh: Mesh; mat: ShaderMaterial }[] = [];
  /** 每个首领最近 0.4 秒的轨迹（自动残影用） */
  private trails = new Map<number, Trail[]>();
  private clock = 0; private last = -1;
  private warmKeys: readonly string[] = [];
  /** 已经预热过的形态前缀（yws_h_ / yws_b_ / yws_m_） */
  private warmed = new Set<string>();
  stats = { sprites: 0, ghosts: 0, ms: 0 };

  constructor(scene: Scene) {
    this.tex.start();
    const plane = new PlaneGeometry(1, 1);
    const mk = (ghost: boolean): Spr => {
      const mat = new ShaderMaterial({ vertexShader: SPRITE_VS, fragmentShader: SPRITE_FS, transparent: true, premultipliedAlpha: true, depthWrite: !ghost, depthTest: true, side: DoubleSide,
        uniforms: { uMap: { value: null }, uFoot: { value: new Vector3() }, uBox: { value: new Vector4() }, uRight: { value: new Vector3(1, 0, 0) }, uBoost: { value: 1 }, uScale: { value: new Vector2(1, 1) }, uPivot: { value: 0 }, uAx: { value: 0.5 },
          uA: { value: new Vector4(1, 0, 0, 0) }, uGlow: { value: new Vector3(...GLOW0) }, uTint: { value: new Vector3(1, 1, 1) }, uAdd: { value: new Vector3() }, uG: { value: new Vector2(0.02, 0.015) } } });
      const mesh = new Mesh(plane, mat); mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = ghost ? 2.08 : 2.1; scene.add(mesh);
      return { mesh, mat };
    };
    for (let i = 0; i < POOL.sprite; i++) this.sprites.push(mk(false));
    for (let i = 0; i < POOL.ghost; i++) this.ghosts.push(mk(true));
    const sg = new BufferGeometry(); sg.setAttribute('position', new Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3)); sg.setIndex([0, 1, 2, 0, 2, 3]);
    for (let i = 0; i < POOL.shadow; i++) {
      // 地面有起伏：影子片按脚下一点的高度平放，坡上会有一截埋进地里（截出一道硬边）——往镜头方向偏一点深度
      const mat = new ShaderMaterial({ vertexShader: SHADOW_VS, fragmentShader: SHADOW_FS, transparent: true, depthWrite: false, depthTest: true, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -64,
        uniforms: { uC: { value: new Vector4() }, uD: { value: new Vector4() } } });
      const mesh = new Mesh(sg, mat); mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 1.95; scene.add(mesh); this.shadows.push({ mesh, mat });
    }
  }

  /** 贴图（或占位剪影）能用了没有 */
  get ready() { return this.tex.ready; }
  /** 出招前先把会用到的帧加载上（可选：update 里每个形态第一次露面时会自己预热那个形态的整套帧） */
  warm(keys: readonly string[]) { this.warmKeys = keys; if (this.tex.ready) this.tex.warm(keys); }

  /** 每帧（hd.render 之前）：把 view 里的首领摆进池子 */
  update(V: BossView, hd: { rightDir: { x: number; y: number }; boost: number; heightAt: (x: number, y: number) => number }): void {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const now = t0 / 1000; const dt = this.last < 0 ? 0 : Math.min(0.1, now - this.last); this.last = now; this.clock += dt;
    for (const s of this.sprites) s.mesh.visible = false; for (const s of this.ghosts) s.mesh.visible = false; for (const s of this.shadows) s.mesh.visible = false;
    if (!this.tex.ready) return;
    if (this.warmKeys.length) { this.tex.warm(this.warmKeys); this.warmKeys = []; }
    const R = hd.rightDir, B = hd.boost;
    let ns = 0, ng = 0, nsh = 0;
    const seen = new Set<number>();
    for (const q of V.sprites) {
      seen.add(q.id);
      // 某个形态第一次露面：这个形态的整套帧（半魔连带人身的，它借人身帧）和特效贴图都开始加载，出招时第一次切到某帧不会空一下
      const pre = q.key.slice(0, 6);
      if (!this.warmed.has(pre)) {
        this.warmed.add(pre);
        const pres = pre === 'yws_b_' ? ['yws_b_', 'yws_h_'] : [pre];
        this.tex.warm([...YWS_FRAMES.filter((k) => pres.some((p) => k.startsWith(p))), ...YWS_FX_FRAMES]);
      }
      // —— 轨迹：记下这一帧（自动残影从这里取）
      let tr = this.trails.get(q.id); if (!tr) { tr = []; this.trails.set(q.id, tr); }
      const pivot = q.pivot ?? 0.45;
      tr.push({ t: this.clock, x: q.x, y: q.y, z: q.z, key: q.key, sx: q.sx, sy: q.sy, rot: q.rot, face: q.face, H: q.H, pivot, ax: q.ax ?? 0.5 });
      while (tr.length > 2 && this.clock - tr[0].t > 0.4) tr.shift();
      const tx = this.tex.getOr(q.key); if (!tx) continue;
      const S = this.sprites[ns]; if (!S) break; ns++;
      this.place(S, tx, q.x, q.y, q.z, q.H, q.face, q.sx, q.sy, q.rot, pivot, q.ax ?? 0.5, hd, R, B);
      const u = S.mat.uniforms;
      (u.uA.value as Vector4).set(q.alpha, q.flash, q.glow, 0);
      (u.uTint.value as Vector3).set(...(q.tint ?? ONE3)); (u.uAdd.value as Vector3).set(...(q.add ?? ZERO3)); (u.uGlow.value as Vector3).set(...(q.glowCol ?? GLOW0));
      S.mesh.visible = q.alpha > 0.01;
      // —— 地影
      const sh = (q.shadow ?? 1) * q.alpha;
      if (sh > 0.01 && nsh < this.shadows.length) {
        const D = this.shadows[nsh++], k = Math.max(0.25, 1 - q.z / (q.H * 2.5));
        (D.mat.uniforms.uC.value as Vector4).set(q.x, hd.heightAt(q.x, q.y), q.y, q.H * 0.32 * Math.max(1, q.sx) * k);
        (D.mat.uniforms.uD.value as Vector4).set(sh * k, R.x, R.y, 0); D.mesh.visible = true;
      }
      // —— 残影：自动（按轨迹往回取几个时刻）
      const gc = q.ghostCol ?? GHOST0;
      if ((q.ghost ?? 0) > 0.01 && tr.length > 1) {
        const N = 5, step = 0.045;
        for (let i = 1; i <= N && ng < this.ghosts.length; i++) {
          const at = this.clock - i * step, P = this.sample(tr, at); if (!P) break;
          // 离本体太近的不画（站着不动时不出残影）
          const dx = q.x - P.x, dy = q.y - P.y, dz = q.z - P.z, d = Math.hypot(dx, dy, dz);
          if (d < 14 * i) continue;
          const gt = this.tex.getOr(P.key); if (!gt) continue;
          // 沿运动方向拉长：横向的速度拉宽，竖直的速度拉高
          const along = Math.abs(dx * R.x + dy * R.y), up = Math.abs(dz);
          const st = Math.min(0.7, d / (P.H * 0.9));
          const G = this.ghosts[ng++];
          this.place(G, gt, P.x, P.y, P.z, P.H, P.face, P.sx * (1 + st * along / (d || 1)), P.sy * (1 + st * 0.6 * up / (d || 1)), P.rot, P.pivot, P.ax, hd, R, B);
          (G.mat.uniforms.uA.value as Vector4).set(q.alpha * q.ghost! * (0.62 - i * 0.1), 0, 0.6, 0.85);
          (G.mat.uniforms.uGlow.value as Vector3).set(...gc); (G.mat.uniforms.uTint.value as Vector3).set(1, 1, 1); (G.mat.uniforms.uAdd.value as Vector3).set(0, 0, 0);
          G.mesh.visible = true;
        }
      }
      // —— 残影：玩法直接给的
      if (q.ghosts) for (const g of q.ghosts) {
        if (ng >= this.ghosts.length) break;
        const gt = this.tex.getOr(g.key ?? q.key); if (!gt) continue;
        const G = this.ghosts[ng++];
        this.place(G, gt, g.x, g.y, g.z, g.H ?? q.H, g.face ?? q.face, g.sx ?? q.sx, g.sy ?? q.sy, g.rot ?? q.rot, pivot, g.ax ?? q.ax ?? 0.5, hd, R, B);
        (G.mat.uniforms.uA.value as Vector4).set(g.alpha, 0, 0.6, 0.85);
        (G.mat.uniforms.uGlow.value as Vector3).set(...gc); (G.mat.uniforms.uTint.value as Vector3).set(1, 1, 1); (G.mat.uniforms.uAdd.value as Vector3).set(0, 0, 0);
        G.mesh.visible = g.alpha > 0.01;
      }
    }
    for (const id of this.trails.keys()) if (!seen.has(id)) this.trails.delete(id);
    this.stats = { sprites: ns, ghosts: ng, ms: typeof performance !== 'undefined' ? performance.now() - t0 : 0 };
  }

  private place(S: Spr, tx: Texture, x: number, y: number, z: number, H: number, face: number, sx: number, sy: number, rot: number, pivot: number, ax: number,
    hd: { heightAt: (x: number, y: number) => number }, R: { x: number; y: number }, B: number) {
    const u = S.mat.uniforms, im = tx.image as { width: number; height: number }, aspect = im.width / im.height;
    u.uMap.value = tx;
    (u.uFoot.value as Vector3).set(x, hd.heightAt(x, y), y);
    // rot 按「朝前倒」给：朝右时画面上顺时针，朝左时逆时针
    (u.uBox.value as Vector4).set(H * aspect / 2, H, z, rot * (face >= 0 ? 1 : -1));
    (u.uRight.value as Vector3).set(R.x, 0, R.y); u.uBoost.value = B;
    (u.uScale.value as Vector2).set(sx * -(face >= 0 ? 1 : -1), sy);
    u.uPivot.value = pivot * H * sy; u.uAx.value = ax;
    // 辉光半径：约 12 个世界单位（换成贴图坐标）
    (u.uG.value as Vector2).set(12 / (H * aspect), 12 / H);
  }

  /** 轨迹上某一时刻的样子（取最近的一帧，不插值——残影就是那一帧的定格） */
  private sample(tr: Trail[], at: number): Trail | null {
    if (at < tr[0].t) return null;
    for (let i = tr.length - 1; i >= 0; i--) if (tr[i].t <= at) return tr[i];
    return null;
  }

  dispose() {
    for (const s of [...this.sprites, ...this.ghosts]) { s.mesh.removeFromParent(); s.mat.dispose(); }
    for (const s of this.shadows) { s.mesh.removeFromParent(); s.mat.dispose(); s.mesh.geometry.dispose(); }
    this.tex.dispose(); this.trails.clear();
  }
}
