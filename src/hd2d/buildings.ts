// HD2D 的建筑：按地点布局里的每一件建筑，用程序化中式构件（arch.ts）拼出立体网格。
// P10：一处地点按 2400 见方分块，每块一个网格、共用一个受光材质；块按离画面远近排队、每帧限时分批拼（成片街坊的城上千座院落，
// 一帧拼完要卡一大下），画面外的块先不拼。宗门按等级放大主殿、加重檐；有护山大阵的宗门再罩一层光罩。
import {
  BufferGeometry, type BufferAttribute, Color, DataTexture, DoubleSide, Float32BufferAttribute, Group, LinearSRGBColorSpace, Mesh, NearestFilter, RGBAFormat, ShaderMaterial, SphereGeometry, UnsignedByteType, Vector3, Vector4, type Texture,
} from 'three';
import { LOC_SCALE, type LocLayout, type Pal, type Piece } from '../gfx/building';
import { BLD2 } from '../gfx/bld2Dims';
import { ArchBuilder, shadeOf, type ArchPalette } from './arch';
import { SHADOW_FS } from './shadowGlsl';
import { ROOM_FADE_FS, makeRoomFadeUniforms } from './roomFade';   // 收官 P8（丁）：进屋时这一栋的屋顶淡出
import { PIECE_KINDS } from './pieceKinds';
import { textAtlas, textSlot, type Plaque } from './cityText';
import './cityPieces';
import './sectPieces';

/** tier：宗门等级。3 = 大宗门（主殿放大、重檐、高台基），2 = 一般宗门，1 = 小门派，0 = 不是宗门（城镇、村落） */
type Location = { id: string; layout: LocLayout; x: number; y: number; tier?: number };
type Props = {
  w?: number; d?: number; h?: number; ph?: number; len?: number; t?: number; hh?: number;
  z?: number; s?: number; tiers?: number; gate?: boolean; prop?: boolean; gable?: boolean;
  k?: string; roof?: string; wall?: string; pillar?: string; col?: string; pal?: Partial<Pal>;
};
type BuildingSize = { w: number; d: number; h: number; base: number; roofH: number; opening: number };
type Dome = { mesh: Mesh; material: ShaderMaterial; x: number; y: number; radius: number; tier: number };
/** 一块：块内的构件、拼到第几件、拼好的网格。x0..z1 是世界坐标的外包框（构件锚点外扩 700） */
/** ids：每件构件在 layout.pieces 里的序号；rng：正在拼的这个网格里每件从第几个顶点起（顶点起点, 构件标记, …）；hid：块里有藏起来的构件（城镇破坏） */
type Chunk = { x0: number; z0: number; x1: number; z1: number; pieces: Piece[]; ids: number[]; rng: number[]; hid: boolean; i: number; builder: ArchBuilder | null; mesh: Mesh | null; done: boolean; meshes: Mesh[]; verts: number };
/** slot：这处地点的编号（顶点上的构件标记 = slot × PSTRIDE + 构件序号 + 1） */
type CachedLocation = { group: Group; domes: Dome[]; layout: LocLayout; x: number; y: number; tier: number; used: number; chunks: Chunk[]; slot: number };
/** 视野（地面外接矩形，世界坐标） */
export type ViewRect = { l: number; t: number; r: number; b: number };
const CHUNK = 2400;
/** 每帧拼网格的时间预算（毫秒）：至少拼一件 */
const BUDGET_MS = 4;
/** 建筑网格顶点总数的上限（约 2.4M 顶点 ≈ 100MB）：超了放掉离画面最远的块 */
const VERT_CAP = 2_400_000;
const NO_ARRAY = new Float32Array(0);
/**
 * 城镇破坏（world/townwreck.ts、hd2d/townwreckGl.ts）：每个顶点记着自己是哪处地点的哪一件构件（aPiece），
 * 坏了的那几件由顶点着色器整个甩出画面（不用 discard，不重烘整块），替身另画。只有含着藏起来的构件的块换带 WRECK 的材质，
 * 没东西坏的时候和原来一模一样。地点编号 ≤ 500、一处地点的构件 < PSTRIDE：标记 < 2^24，浮点数存得准。
 */
const PSTRIDE = 32768;
let SLOT_SEQ = 0;
const WRECK_VS = `
#ifdef WRECK
attribute float aPiece; uniform sampler2D uHide; uniform vec4 uHideP;
bool wreckHidden(){
  if (aPiece < 0.5 || uHideP.y < 0.5) return false;
  float s = floor((aPiece - 0.5) / ${PSTRIDE}.0);
  if (abs(s - uHideP.x) > 0.5) return false;
  float i = aPiece - 1.0 - s * ${PSTRIDE}.0;
  vec2 uv = (vec2(mod(i, uHideP.y), floor(i / uHideP.y)) + 0.5) / uHideP.yz;
  return texture2D(uHide, uv).r > 0.5;
}
#endif`;
const WRECK_CULL = `
#ifdef WRECK
  if (wreckHidden()) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
#endif
`;
function dropArray(this: BufferAttribute) { (this as { array: ArrayLike<number> }).array = NO_ARRAY; }
type Uniforms = Record<string, { value: unknown }>;

export function canModelPiece(piece: Piece): boolean {
  return ['house', 'hut', 'hall', 'wallH', 'wallV', 'tower', 'W', 'WV', 'yurt', 'pagoda', 'paifang', 'pavilion', 'dome', 'box'].includes(piece.kind)
    || (piece.kind === 'B' && !piece.p.prop) || PIECE_KINDS.has(piece.kind);
}

const SWAY = `
// P4：随风摆。uSway = (时间, 风向 x, 风向 z, 风力)；k 是这一点的摆幅权重。相位按世界坐标缓变（同一面幡上各点几乎同相，不会撕开）
vec3 swayed(vec3 w, float k, float lantern){
  if (k <= 0.0) return w;
  float ph = uSway.x * (lantern > 0.5 ? 1.7 : 2.3) + dot(w.xz, vec2(0.0013, 0.0017)) * 6.2831853;
  float s = sin(ph) * 0.65 + sin(ph * 2.37 + 1.3) * 0.35;
  vec2 wd = uSway.yz, pd = vec2(-wd.y, wd.x);
  float amp = (lantern > 0.5 ? 3.0 : 13.0) * uSway.w * k;
  w.xz += (wd * (0.55 + 0.45 * s) + pd * s * 0.45) * amp;
  w.y += abs(s) * amp * 0.12;
  return w;
}`;
// 镂空：主角走到房子、城墙背后时，挡在镜头和主角之间的那一片建筑按屏幕上离主角的远近挖成筛子眼，露出人来。
// uPlayer = (主角胸口的世界坐标, 镂空半径；半径 0 = 不镂空)。在视空间里比：这一点和主角在视线方向上的夹角偏差、谁离镜头更近。
const CUT_VS = `
uniform vec4 uPlayer;
varying vec3 vView; varying vec3 vPV; varying vec3 vWP;
void cutSetup(vec4 world){ vView = (viewMatrix * world).xyz; vPV = (viewMatrix * vec4(uPlayer.xyz, 1.0)).xyz; vWP = world.xyz; }`;
// 片元里一有 discard，显卡就不能先做深度测试再着色（每层被挡住的屋面也全算一遍光照和阴影）。
// 所以只有主角附近那几块网格用带镂空的材质（cutMat），其余用定义了 NO_CUT 的同一份着色器（solidMat）
const CUT_FS = `
uniform vec4 uPlayer;
varying vec3 vView; varying vec3 vPV; varying vec3 vWP;
#ifdef NO_CUT
void cutOut(){}
#else
${ROOM_FADE_FS}
void cutOut(){
  roomOut();
  if (uPlayer.w <= 0.0 || vPV.z > -1.0) return;
  vec2 a = vView.xy / -vView.z, b = vPV.xy / -vPV.z;
  float r = length(a - b) / (uPlayer.w / -vPV.z);
  // 返工：人站在城墙顶、台上时，脚下那片地面也比胸口离镜头近，原来会被一起挖成 2×2 一格的麻点（主角身边一片方块噪点）。
  // 只挖高过脚面、又真在主角跟镜头之间（比主角近出 150 以上）的墙和屋顶——身后的女墙不挖（夜里一打光会露出一条筛子眼）；筛子眼改成逐像素的交错梯度噪声，颗粒细得多、不成块
  if (r < 1.0 && -vView.z < -vPV.z - 150.0 && vWP.y > uPlayer.y - 40.0) {
    float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    // 中间整块挖空、只在外沿一圈渐变（原来整片按八成概率挖，挖出的洞里全是筛子眼，夜里一打光就是一片麻点）
    if (n < smoothstep(1.0, 0.72, r)) discard;
  }
}
#endif`;
const BUILDING_VS = `
attribute vec2 aTile; uniform mat4 uShadowMatrix; uniform vec4 uSway;${SWAY}
varying vec3 vColor; varying vec3 vN; varying vec2 vTile; varying vec3 vShadow;
${CUT_VS}${WRECK_VS}
void main(){${WRECK_CULL}
  vColor = color; vN = normal; vTile = aTile;
  vec4 world = modelMatrix * vec4(position, 1.0);
  if (aTile.y < -2.5) world.xyz = swayed(world.xyz, aTile.x, aTile.y > -3.5 ? 1.0 : 0.0);   // P4：幡、旗、灯笼
  vShadow = (uShadowMatrix * world).xyz * 0.5 + 0.5;
  cutSetup(world);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
// 匾额、招牌、幌子上的字（cityText.ts 的图集）：受日光明暗，夜里略亮
const PLAQUE_VS = `
attribute float aSway; uniform vec4 uSway; varying vec2 vUv; ${CUT_VS}${SWAY}${WRECK_VS}
void main(){${WRECK_CULL} vUv = uv; vec4 world = modelMatrix * vec4(position, 1.0); world.xyz = swayed(world.xyz, aSway, 0.0); cutSetup(world); gl_Position = projectionMatrix * viewMatrix * world; }`;
const PLAQUE_FS = `
uniform sampler2D uMap; uniform vec4 uLight; uniform float uNight;
varying vec2 vUv; ${CUT_FS}
void main(){ cutOut(); vec4 t = texture2D(uMap, vUv); gl_FragColor = vec4(t.rgb * mix(0.82, 1.05, uLight.x) + t.rgb * uNight * 0.25, 1.0); }`;
// 受光：环境光 + 太阳直射（朝阳的屋面亮、背阳的墙暗），再乘别的东西投下来的影子；夜里只剩均匀的环境光。
// 屋面按瓦面坐标画瓦垄（垄背亮、垄沟暗）和一行行瓦的接缝。
const BUILDING_FS = `
uniform vec3 uSunTo; uniform vec4 uLight; uniform float uNight; uniform float uEmis;
varying vec3 vColor; varying vec3 vN; varying vec2 vTile; varying vec3 vShadow;
${SHADOW_FS}
${CUT_FS}
void main(){
  cutOut();
  vec3 n = normalize(vN), c = vColor;
  if (vTile.y < -1.5 && vTile.y > -3.5) {
    // 窗纸、灯笼：白天照常受光，入夜透出暖光
    float nl0 = max(dot(n, uSunTo), 0.0);
    vec3 day = c * mix(0.86, 0.6 + 0.58 * nl0, uLight.x);
    // 夜里整幅画面要再乘一层偏蓝的暗色（render.ts 的昼夜 multiply），所以这里给足亮度、偏暖黄，乘完仍是一点暖光
    vec3 glow = vec3(1.0, 0.93, 0.6) * (0.85 + 0.25 * c.r);
    // P2：世界层是半浮点时（uEmis > 0）窗光亮过白：后期把超过 1 的那一截当自发光，不跟着入夜压暗，还会泛光
    gl_FragColor = vec4(mix(day, glow * (1.0 + uEmis * uNight), uNight), 1.0);
    return;
  }
  if (vTile.y > 0.5) {
    float ridge = abs(fract(vTile.x) - 0.5) * 2.0;
    c *= 0.78 + 0.28 * smoothstep(0.1, 0.8, ridge);
    c *= 0.9 + 0.1 * smoothstep(0.0, 0.18, fract(vTile.y));
    // P10 返工：城的最远景是成片一样的灰瓦（瓦垄细到一个像素以下，平均成同一个灰）。
    // 离镜头越远，按 520 见方一格给屋面一点冷暖、深浅的变化，再略提反差——远看是一片片人家，不是一张灰毯
    float far = smoothstep(3500.0, 11000.0, -vView.z);
    if (far > 0.0) {
      float h = fract(sin(dot(floor(vWP.xz / 520.0), vec2(12.9898, 78.233))) * 43758.5453);
      vec3 tint = h < 0.3 ? vec3(0.86, 0.92, 1.04) : h < 0.6 ? vec3(1.07, 0.98, 0.88) : h < 0.85 ? vec3(0.8, 0.82, 0.84) : vec3(1.0, 1.02, 0.98);
      c *= mix(vec3(1.0), tint, far);
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 1.0 + 0.3 * far) * (1.0 - 0.06 * far);
    }
  }
  float nl = max(dot(n, uSunTo), 0.0);
  float lit = mix(0.86, 0.6 + 0.58 * nl, uLight.x);
  float sh = shadowAt(vShadow) * smoothstep(0.02, 0.3, nl);
  gl_FragColor = vec4(min(c * lit * shadowMul(sh), vec3(1.0)), 1.0);   // P2：封顶 1（超过 1 的会被当成自发光）
}`;

const DOME_VS = `
varying vec3 vP; varying vec3 vWorld; varying vec3 vWN;
void main(){
  vP = position; vec4 world = modelMatrix * vec4(position, 1.0); vWorld = world.xyz;
  vWN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
// 护山大阵：半球光罩。边缘（掠射角）最亮，罩面上是缓缓转动的经纬阵纹和流动的符光，贴地一圈光环。
// uDome = (时间, 强度, 等级, 夜色 0..1)。光是加上去的，不遮挡里面的建筑。
// 罩面上一圈圈大篆咒文绕着大阵流转（用户：光罩上要有咒语流动，不然看不出来）：按纬度分圈，各圈流速、方向不同，
// 有的圈空着；字用正常混合叠上去（亮底子上加色显不出来），白天是罩色的深字，夜里是亮字。uGlyphP = (一圈的字数, 圈数, 浓度, 字高)。
const DOME_FS = `
uniform vec3 uColor; uniform vec4 uDome; uniform sampler2D uNoise; uniform sampler2D uGlyphs; uniform vec4 uGlyphP;
float h1(float n){ return fract(sin(n * 127.1) * 43758.5453); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
varying vec3 vP; varying vec3 vWorld; varying vec3 vWN;
void main(){
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - abs(dot(normalize(vWN), V)), 2.4);
  float ang = atan(vP.z, vP.x), h = clamp(vP.y, 0.0, 1.0);
  float lon = smoothstep(0.94, 1.0, abs(sin(ang * (8.0 + uDome.z * 2.0) + uDome.x * 0.12)));
  float lat = smoothstep(0.93, 1.0, abs(sin(h * 3.14159 * (3.0 + uDome.z) - uDome.x * 0.35)));
  float flow = texture2D(uNoise, vec2(ang * 0.5 + uDome.x * 0.015, h * 1.1 - uDome.x * 0.04)).r;
  float ring = smoothstep(0.09, 0.0, h);
  float glow = 0.04 + 0.34 * fres + 0.2 * (lon + lat) * (0.35 + 0.65 * flow) + 0.3 * ring + 0.06 * flow;
  float a = glow * uDome.y * (0.86 + 0.14 * sin(uDome.x * 1.2));
  // —— 咒文
  float ga = 0.0;
  if (uGlyphP.z > 0.0) {
    float phi = asin(h) / 1.5708, rv = phi * uGlyphP.y, row = floor(rv), fv = fract(rv);
    // 贴地的两圈总有字，往上隔几圈一圈；越靠天顶一圈的字越少，字的大小不变
    float keep = row < 1.5 ? 1.0 : step(0.76, h1(row * 3.7 + 1.3));
    float cols = max(6.0, floor(uGlyphP.x * cos((row + 0.5) / uGlyphP.y * 1.5708)));
    float dir = mod(row, 2.0) < 0.5 ? 1.0 : -1.0;
    float cu = (ang / 6.2832 + 0.5) * cols + dir * uDome.x * (0.1 + 0.12 * h1(row + 7.0));
    float col = mod(floor(cu), cols), fu = fract(cu);
    float id = floor(h2(vec2(col, row)) * 64.0);
    vec2 cell = vec2(mod(id, 8.0), floor(id / 8.0));
    vec2 q = vec2((fu - 0.5) * 1.45 + 0.5, (0.5 - fv) * 1.3 + 0.5);
    float ink = 0.0;
    if (q.x > 0.02 && q.x < 0.98 && q.y > 0.02 && q.y < 0.98) { vec4 g = texture2D(uGlyphs, (cell + q) / 8.0); ink = smoothstep(0.3, 0.62, max(g.r, max(g.g, g.b)) * g.a); }
    float gap = step(0.16, h2(vec2(col * 1.3 + 5.0, row * 2.1)));
    float pulse = 0.78 + 0.22 * sin(uDome.x * 1.1 + cu * 0.35 + row * 1.7);
    // 字只成圈成行地出现（多数圈空着），不铺满罩面：看得出是大阵，又不挡里面的殿阁
    ga = clamp(ink * keep * gap * pulse, 0.0, 1.0) * uGlyphP.z * smoothstep(1.0, 0.94, phi)
      // 贴着镜头的那一截罩面上字会大得糊成一团：离镜头近的淡出；镜头在罩外往里看时字压在殿阁上，再淡一档
      * smoothstep(uGlyphP.w * 5.0, uGlyphP.w * 12.0, length(cameraPosition - vWorld)) * (gl_FrontFacing ? 0.5 : 1.0);
  }
  // 白天地面亮：字用罩色里更深更浓的一档压上去；夜里地面暗：字用亮色，近乎只添光
  vec3 gc = uColor / max(max(uColor.r, uColor.g), max(uColor.b, 0.001));
  vec3 gcol = mix(gc * gc * gc * 0.62, mix(gc, vec3(1.0), 0.25), uDome.w);
  gl_FragColor = vec4(uColor * a + gcol * ga, ga * mix(0.95, 0.45, uDome.w));
}`;

/** 光罩上咒文的格子：半径 → (一圈的字数, 圈数, 浓度, 0) */
function glyphGrid(radius: number): Vector4 {
  const tall = Math.max(120, Math.min(430, radius * 0.085));
  return new Vector4(Math.round(Math.PI * 2 * radius / (tall * 0.82)), Math.max(6, Math.round(Math.PI / 2 * radius / tall)), 1, tall);
}

export class HdBuildings {
  /** 咒文字图（场景建好后给进来；没有就不画字） */
  glyphs: Texture | null = null;
  /** 实体建筑：参与受光和投影 */
  readonly group = new Group();
  /** 护山大阵等发光体：不投影，由场景在阴影那一遍里隐藏 */
  readonly fx = new Group();
  private material: ShaderMaterial | null = null;
  private lighting: Uniforms | null = null;
  private domeGeometry: SphereGeometry | null = null;
  private readonly locations = new Map<string, CachedLocation>();
  private frame = 0;
  private night = 0;
  /** 调试 / 测量：本帧拼了多少毫秒、还剩几块没拼 */
  readonly stats = { buildMs: 0, pending: 0, chunks: 0, verts: 0 };

  /** 收官 P8（丁）：进屋时溶掉的那一栋（世界坐标的盒子与溶解程度，hd2d/indoorGl.ts 每帧填） */
  readonly roomFade = makeRoomFadeUniforms();
  /** P4：幡、旗、灯笼的摆动参数 (时间, 风向 x, 风向 z, 风力)，渲染器每帧 setSway */
  readonly sway = { value: new Vector4(0, 1, 0, 0.6) };
  setSway(time: number, dirX: number, dirZ: number, strength: number): void { this.sway.value.set(time % 10000, dirX, dirZ, strength); }
  /** 夜色 0..1：窗纸、灯笼入夜发光 */
  setNight(n: number): void { this.night = n; if (this.material) this.material.uniforms.uNight.value = n; }
  /** P2：窗纸、灯笼入夜亮过白的程度（世界层是半浮点时由渲染器给 1.6 左右；8 位世界层给 0，和以前一样） */
  emis = 0;
  setEmission(k: number): void { this.emis = k; if (this.material) this.material.uniforms.uEmis.value = k; }

  /** 由场景传入共用的光照与阴影参数（太阳方向、阴影图等） */
  setLighting(uniforms: Uniforms): void { this.lighting = uniforms; }

  /**
   * view：画面覆盖的地面范围。给了就按远近分帧拼（每帧限时），画面外的块先不拼；不给（秘境）就一次拼完。
   */
  sync(locs: readonly Location[], heightAt: (x: number, y: number) => number, view?: ViewRect): void {
    this.lastHeight = view ? heightAt : null;   // 秘境（不给视野）不镂空
    this.frame++;
    for (const entry of this.locations.values()) { entry.group.visible = false; for (const d of entry.domes) d.mesh.visible = false; }
    for (const loc of locs) {
      const tier = loc.tier ?? 0;
      let entry = this.locations.get(loc.id);
      if (entry && (entry.layout !== loc.layout || entry.x !== loc.x || entry.y !== loc.y || entry.tier !== tier)) {
        this.release(entry);
        this.locations.delete(loc.id);
        entry = undefined;
      }
      if (!entry) {
        entry = this.buildLocation(loc, tier, heightAt);
        this.locations.set(loc.id, entry);
      }
      entry.used = this.frame;
      entry.group.visible = true;
      for (const d of entry.domes) d.mesh.visible = true;
    }
    this.pump(heightAt, view);
    if (this.locations.size > 32) {
      const old = [...this.locations.entries()].filter(([, entry]) => !entry.group.visible).sort((a, b) => a[1].used - b[1].used);
      for (const [id, entry] of old) {
        if (this.locations.size <= 32) break;
        this.release(entry);
        this.locations.delete(id);
      }
    }
  }

  /** 每帧推进护山大阵：time 秒；玩家走近时光罩变亮 */
  update(time: number, px: number, py: number): void {
    // 镂空跟着主角（胸口高约 60）
    if (this.lastHeight) this.player.set(px, this.lastHeight(px, py) + 60, py, 120); else this.player.w = 0;
    this.assignCut(px, py);
    for (const entry of this.locations.values()) for (const d of entry.domes) {
      if (!d.mesh.visible) continue;
      const near = Math.max(0, Math.min(1, 1.7 - Math.hypot(px - d.x, py - d.y) / d.radius));
      const u = d.material.uniforms.uDome.value as Vector4;
      // 罩子越大越淡：占一整座山的大阵若照小光罩的亮度画，人在罩里看出去整屏蒙一层白（光是加上去的，镜头的视线还要穿过罩面两次）
      const big = Math.max(0.22, Math.min(1, 2400 / d.radius));
      u.x = time; u.y = (d.tier >= 3 ? 0.62 : d.tier === 2 ? 0.46 : 0.34) * (0.7 + 0.5 * near) * big;
      // 夜里（没有日光）咒文改用亮色
      u.w = 1 - Math.min(1, ((this.lighting?.uLight?.value as Vector4 | undefined)?.x ?? 1));
    }
  }

  clearLocations(): void {
    for (const entry of this.locations.values()) this.release(entry);
    this.locations.clear();
  }

  dispose(): void {
    this.clearLocations();
    this.material?.dispose(); this.material = null; this.solidMat?.dispose(); this.solidMat = null;
    this.domeGeometry?.dispose(); this.domeGeometry = null;
  }

  private lit(): ShaderMaterial {
    if (!this.material) {
      // 没接上场景的光照参数时（单独测试）给一组默认值
      const lighting = this.lighting ?? {
        uShadowMap: { value: null }, uShadowMatrix: { value: null }, uShadowParams: { value: new Vector4(0, 0, 0, 0) },
        uShadowTint: { value: new Color(0.6, 0.65, 0.8) }, uSunTo: { value: new Vector3(0.3, 0.8, -0.5).normalize() }, uLight: { value: new Vector4(1, 0, 0, 0) },
      };
      this.material = new ShaderMaterial({ vertexShader: BUILDING_VS, fragmentShader: BUILDING_FS, vertexColors: true, uniforms: { ...lighting, uNight: { value: this.night }, uEmis: { value: this.emis }, uSway: this.sway, uPlayer: { value: this.player }, ...this.roomFade, ...this.wreckU } });
      this.solidMat = new ShaderMaterial({ vertexShader: BUILDING_VS, fragmentShader: BUILDING_FS, vertexColors: true, defines: { NO_CUT: 1 }, uniforms: this.material.uniforms });
    }
    return this.solidMat!;
  }
  /** 不镂空的材质（同一份 uniforms）：远离主角的网格都用它 */
  private solidMat: ShaderMaterial | null = null;
  /** 主角所在、紧挨着的块换成带镂空的材质，其余换回不镂空的 */
  private assignCut(px: number, py: number): void {
    const cut = this.material, solid = this.solidMat;
    if (!cut || !solid) return;
    const on = this.player.w > 0;
    // 正在溶屋顶的那一栋所在的块也得用带 discard 的材质（一般就是主角所在的块）
    const rf = this.roomFade.uRoomC.value.z > 0, A = this.roomFade.uRoomA.value, Dq = this.roomFade.uRoomD.value;   // 第六轮返工：D 盒（门朝北铺子的后宅）所在的块也要用带 discard 的材质
    for (const e of this.locations.values()) {
      if (!e.group.visible) continue;
      for (const c of e.chunks) {
        const near = (on && px > c.x0 - 200 && px < c.x1 + 200 && py > c.z0 - 200 && py < c.z1 + 600) || (rf && A.z > c.x0 && A.x < c.x1 && A.w > c.z0 && A.y < c.z1) || (rf && Dq.z > Dq.x && Dq.z > c.x0 && Dq.x < c.x1 && Dq.w > c.z0 && Dq.y < c.z1);
        const w = c.hid && e.slot === this.hideSlot && !!this.wCut;
        const m = near ? (w ? this.wCut! : cut) : (w ? this.wSolid! : solid);
        for (const mesh of c.meshes) {
          const mm = mesh.material;
          if (mm === cut || mm === solid || mm === this.wCut || mm === this.wSolid) { if (mm !== m) mesh.material = m; }
          else if (this.plaqueW && (mm === this.plaqueMat || mm === this.plaqueW)) { const pm = w ? this.plaqueW : this.plaqueMat!; if (mm !== pm) mesh.material = pm; }
        }
      }
    }
  }
  /** 主角胸口的位置、镂空半径（buildings.update 每帧更新） */
  private readonly player = new Vector4(0, 0, 0, 0);
  private lastHeight: ((x: number, y: number) => number) | null = null;
  private plaqueMat: ShaderMaterial | null = null;
  private plaqueMaterial(): ShaderMaterial {
    this.plaqueMat ??= new ShaderMaterial({ vertexShader: PLAQUE_VS, fragmentShader: PLAQUE_FS,
      uniforms: { uMap: { value: textAtlas() }, uLight: this.lighting?.uLight ?? { value: new Vector4(1, 0, 0, 0) }, uNight: this.material?.uniforms.uNight ?? { value: 0 }, uSway: this.sway, uPlayer: { value: this.player }, ...this.roomFade, ...this.wreckU } });
    return this.plaqueMat;
  }
  /** 一块网格上的匾：四边面贴字（图集满了的字不画） */
  private plaqueMesh(list: Plaque[]): Mesh | null {
    const pos: number[] = [], uv: number[] = [], sw: number[] = [], pv: number[] = [];
    for (const q of list) {
      const t = textSlot(q.text, q.kind, q.color); if (!t) continue;
      const [u0, v0, u1, v1] = t, P = q.p;
      const c = [[P[0], P[1], P[2], u0, v0], [P[3], P[4], P[5], u1, v0], [P[6], P[7], P[8], u1, v1], [P[9], P[10], P[11], u0, v1]];
      for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(c[i][0], c[i][1], c[i][2]); uv.push(c[i][3], c[i][4]); sw.push(q.sw?.[i] ?? 0); pv.push(q.pv ?? 0); }
    }
    if (!pos.length) return null;
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new Float32BufferAttribute(uv, 2)); g.setAttribute('aSway', new Float32BufferAttribute(sw, 1));
    if (pv.some((v) => v > 0)) g.setAttribute('aPiece', new Float32BufferAttribute(pv, 1));
    g.computeBoundingSphere();
    return new Mesh(g, this.plaqueMaterial());
  }

  private buildLocation(loc: Location, tier: number, heightAt: (x: number, y: number) => number): CachedLocation {
    const group = new Group();
    group.position.set(loc.x, 0, loc.y);
    // 按构件锚点分块（世界坐标的格子）；网格顶点是相对地点中心的本地坐标
    const byKey = new Map<string, Chunk>();
    loc.layout.pieces.forEach((piece, idx) => {
      if (!canModelPiece(piece)) return;
      const x = piece.x * LOC_SCALE, z = piece.y * LOC_SCALE, i = Math.floor(x / CHUNK), j = Math.floor(z / CHUNK), key = i + ',' + j;
      let ch = byKey.get(key);
      if (!ch) byKey.set(key, ch = { x0: loc.x + i * CHUNK - 700, z0: loc.y + j * CHUNK - 700, x1: loc.x + (i + 1) * CHUNK + 700, z1: loc.y + (j + 1) * CHUNK + 700, pieces: [], ids: [], rng: [], hid: false, i: 0, builder: null, mesh: null, done: false, meshes: [], verts: 0 });
      ch.pieces.push(piece); ch.ids.push(idx);
    });
    this.group.add(group);
    const domes: Dome[] = [];
    const barrier = loc.layout.barrier;
    if (barrier && tier > 0) {
      // 光罩罩住整座宗门：大宗门罩得更高
      const cx = loc.x + barrier.x * LOC_SCALE, cy = loc.y + barrier.y * LOC_SCALE, rx = barrier.rx * LOC_SCALE, rz = barrier.ry * LOC_SCALE;
      this.domeGeometry ??= new SphereGeometry(1, 64, 20, 0, Math.PI * 2, 0, Math.PI / 2);
      const material = new ShaderMaterial({ vertexShader: DOME_VS, fragmentShader: DOME_FS, transparent: true, premultipliedAlpha: true, depthWrite: false, side: DoubleSide,
        uniforms: { uColor: { value: new Color().setStyle(barrier.color, LinearSRGBColorSpace) }, uDome: { value: new Vector4(0, 0, tier, 0) },
          uNoise: { value: (this.lighting?.uNoise?.value as Texture | undefined) ?? null },
          // 字的大小：小光罩里一个字约一人多高，占山的大阵里约四人高（镜头拉到最远也认得出是字）
          uGlyphs: { value: this.glyphs }, uGlyphP: { value: this.glyphs ? glyphGrid(Math.max(rx, rz)) : new Vector4(0, 1, 0, 100) } } });
      const mesh = new Mesh(this.domeGeometry, material);
      const radius = Math.max(rx, rz);
      let base = heightAt(cx, cy) - radius * 0.04, high = Math.min(rx, rz) * (tier >= 3 ? 0.95 : 0.8);
      if (loc.layout.final) {
        // 占山的宗门：罩子从山脚罩起（取罩沿一圈最低的地面），顶要高过最高的那层台地和悬空峰
        let top = heightAt(cx, cy);
        for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; base = Math.min(base, heightAt(cx + Math.cos(a) * rx * 0.97, cy + Math.sin(a) * rz * 0.97) - 60); }
        for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) top = Math.max(top, heightAt(cx + i / 4 * rx, cy + j / 4 * rz));
        high = Math.max(high, (top - base) * 1.3 + 600);
      }
      mesh.position.set(cx, base, cy);
      mesh.scale.set(rx, high, rz);
      mesh.renderOrder = 5;
      this.fx.add(mesh);
      domes.push({ mesh, material, x: cx, y: cy, radius, tier });
    }
    SLOT_SEQ = SLOT_SEQ % 500 + 1;
    const entry: CachedLocation = { group, domes, layout: loc.layout, x: loc.x, y: loc.y, tier, used: this.frame, chunks: [...byKey.values()], slot: SLOT_SEQ };
    if (this.hideLoc === loc.id) this.markHidden(entry);
    return entry;
  }

  /** 拼一件构件进这一块的网格 */
  private buildOne(entry: CachedLocation, builder: ArchBuilder, piece: Piece, heightAt: (x: number, y: number) => number): void {
    const x = piece.x * LOC_SCALE, z = piece.y * LOC_SCALE, L = entry.layout;
    const custom = PIECE_KINDS.get(piece.kind);
    if (custom) {
      const lp = L.pal, pp = { ...lp, ...(piece.p.pal as Partial<Pal> | undefined) };
      custom({ builder, piece, layout: L, tier: entry.tier, x, y: heightAt(entry.x + x, entry.y + z), z,
        pal: { roof: pp.roof, wall: pp.wall, pillar: pp.pillar, trim: pp.trim, stone: pp.stone, accent: pp.accent },
        groundAt: (lx, lz) => heightAt(entry.x + lx, entry.y + lz) });
      return;
    }
    this.buildPiece(builder, piece, L, entry.tier, x, heightAt(entry.x + x, entry.y + z), z);
  }

  /** 按离画面中心由近到远拼还没拼好的块；有视野时每帧限时，没有视野时一次拼完 */
  private pump(heightAt: (x: number, y: number) => number, view?: ViewRect): void {
    const t0 = performance.now();
    const todo: { e: CachedLocation; c: Chunk; d: number }[] = [];
    let pending = 0, total = 0;
    const cx = view ? (view.l + view.r) / 2 : 0, cy = view ? (view.t + view.b) / 2 : 0, pad = view ? Math.max(1500, (view.r - view.l) * 0.25) : 0;
    for (const e of this.locations.values()) {
      if (!e.group.visible) continue;
      for (const c of e.chunks) {
        total++;
        if (c.done) continue;
        pending++;
        if (view && (c.x1 < view.l - pad || c.x0 > view.r + pad || c.z1 < view.t - pad || c.z0 > view.b + pad)) continue;
        const d = view ? Math.hypot((c.x0 + c.x1) / 2 - cx, (c.z0 + c.z1) / 2 - cy) : 0;
        todo.push({ e, c, d });
      }
    }
    todo.sort((a, b) => a.d - b.d);
    let any = false;
    for (const { e, c } of todo) {
      if (view && any && performance.now() - t0 > BUDGET_MS) break;
      c.builder ??= new ArchBuilder();
      const flush = () => {
        if (!c.builder?.vertexCount) { c.rng = []; return; }
        const nv = c.builder.vertexCount;
        const geo = c.builder.build();
        if (c.rng.length) {
          // 每个顶点是哪一件构件（城镇破坏按件藏起来用）
          const a = new Float32Array(nv);
          for (let k = 0; k < c.rng.length; k += 2) a.fill(c.rng[k + 1], c.rng[k], k + 2 < c.rng.length ? c.rng[k + 2] : nv);
          geo.setAttribute('aPiece', new Float32BufferAttribute(a, 1));
          c.rng = [];
        }
        // 顶点传上显卡以后，内存里那份就不留了（城里两百万顶点约 90MB）；包围球已经算好，不做射线拾取
        for (const k in geo.attributes) (geo.attributes[k] as BufferAttribute).onUpload(dropArray);
        const mesh = new Mesh(geo, this.lit());
        mesh.frustumCulled = true;
        e.group.add(mesh); c.mesh = mesh; c.meshes.push(mesh); c.verts += c.builder.vertexCount;
        const pl = (c.builder as ArchBuilder & { plaques?: Plaque[] }).plaques;
        if (pl?.length) { const m = this.plaqueMesh(pl); if (m) { e.group.add(m); c.meshes.push(m); } }
        c.builder.release();   // 拼的大缓冲还回池里，下一块接着用
        c.builder = new ArchBuilder();
      };
      while (c.i < c.pieces.length) {
        const B0 = c.builder!, v0 = B0.vertexCount, pl0 = (B0 as ArchBuilder & { plaques?: Plaque[] }).plaques?.length ?? 0, pv = e.slot * PSTRIDE + c.ids[c.i] + 1;
        this.buildOne(e, B0, c.pieces[c.i++], heightAt);
        if (B0.vertexCount > v0) c.rng.push(v0, pv);
        const pl = (B0 as ArchBuilder & { plaques?: Plaque[] }).plaques; if (pl) for (let k = pl0; k < pl.length; k++) pl[k].pv = pv;
        any = true;
        // 一块太大（宫城那几块）就先交一个网格，免得最后一下拷贝几十万个顶点
        if (c.builder!.vertexCount > 48000) flush();
        if (view && performance.now() - t0 > BUDGET_MS) break;
      }
      if (c.i >= c.pieces.length) { flush(); c.builder?.release(); c.builder = null; c.done = true; pending--; }
    }
    // 网格总量有上限：超了就把离画面最远的块放掉（以后回来再拼）——几座大城挨着时显存、内存不会一直涨
    if (view) {
      let verts = 0;
      const far: { e: CachedLocation; c: Chunk; d: number }[] = [];
      for (const e of this.locations.values()) for (const c of e.chunks) {
        verts += c.verts;
        if (!c.done || !c.verts) continue;
        const d = Math.hypot((c.x0 + c.x1) / 2 - cx, (c.z0 + c.z1) / 2 - cy);
        if (!e.group.visible || d > Math.max(9000, (view.r - view.l) * 1.5)) far.push({ e, c, d });
      }
      if (verts > VERT_CAP) {
        far.sort((a, b) => b.d - a.d);
        for (const { e, c } of far) {
          if (verts <= VERT_CAP * 0.85) break;
          for (const m of c.meshes) { e.group.remove(m); m.geometry.dispose(); }
          verts -= c.verts; c.meshes = []; c.mesh = null; c.verts = 0; c.i = 0; c.done = false; c.builder = null; c.rng = [];
        }
      }
      this.stats.verts = verts;
    }
    this.stats.buildMs = performance.now() - t0; this.stats.pending = pending; this.stats.chunks = total;
  }

  private release(entry: CachedLocation): void {
    this.group.remove(entry.group);
    for (const child of entry.group.children) (child as Mesh).geometry.dispose();
    entry.group.clear();
    for (const d of entry.domes) { this.fx.remove(d.mesh); d.material.dispose(); }
    entry.domes.length = 0;
  }

  // ---------------------------------------------------------------- 城镇破坏（hd2d/townwreckGl.ts）
  /** 藏起来的构件：哪处地点（同一时刻只有一处）、哪几件 */
  private hideLoc: string | null = null;
  private hideSet = new Set<number>();
  private hideSlot = -1;
  private readonly wreckU = { uHide: { value: null as DataTexture | null }, uHideP: { value: new Vector4(0, 0, 1, 0) } };
  private wCut: ShaderMaterial | null = null; private wSolid: ShaderMaterial | null = null; private plaqueW: ShaderMaterial | null = null; private wShadow: ShaderMaterial | null = null;
  /** 这处地点的这些构件（layout.pieces 的序号）不画——替身由 townwreckGl 画；null / 空 = 都照常画 */
  setHidden(locId: string | null, ids: Iterable<number> | null): void {
    const set = new Set(ids ?? []);
    if (!locId || !set.size) {
      if (this.hideLoc) { const e = this.locations.get(this.hideLoc); if (e) for (const c of e.chunks) c.hid = false; }
      this.hideLoc = null; this.hideSet.clear(); this.hideSlot = -1; this.wreckU.uHideP.value.y = 0; return;
    }
    if (this.hideLoc && this.hideLoc !== locId) { const e = this.locations.get(this.hideLoc); if (e) for (const c of e.chunks) c.hid = false; }
    this.hideLoc = locId; this.hideSet = set;
    const e = this.locations.get(locId);
    if (e) this.markHidden(e); else { this.hideSlot = -1; this.wreckU.uHideP.value.y = 0; }
  }
  private markHidden(e: CachedLocation) {
    const n = Math.max(1, e.layout.pieces.length), W = 128, H = Math.ceil(n / W);
    let tex = this.wreckU.uHide.value;
    if (!tex || tex.image.width !== W || tex.image.height !== H) {
      tex?.dispose();
      tex = new DataTexture(new Uint8Array(W * H * 4), W, H, RGBAFormat, UnsignedByteType);
      tex.minFilter = tex.magFilter = NearestFilter; tex.generateMipmaps = false; tex.flipY = false;
      this.wreckU.uHide.value = tex;
    }
    const d = tex.image.data as Uint8Array; d.fill(0);
    for (const i of this.hideSet) if (i >= 0 && i < n) d[i * 4] = 255;
    tex.needsUpdate = true;
    this.wreckU.uHideP.value.set(e.slot, W, H, 1);
    this.hideSlot = e.slot;
    for (const c of e.chunks) c.hid = c.ids.some((i) => this.hideSet.has(i));
    if (!this.wCut) {
      this.lit();
      const base = this.material!;
      this.wCut = new ShaderMaterial({ vertexShader: BUILDING_VS, fragmentShader: BUILDING_FS, vertexColors: true, defines: { WRECK: 1 }, uniforms: base.uniforms });
      this.wSolid = new ShaderMaterial({ vertexShader: BUILDING_VS, fragmentShader: BUILDING_FS, vertexColors: true, defines: { WRECK: 1, NO_CUT: 1 }, uniforms: base.uniforms });
      const pm = this.plaqueMaterial();
      this.plaqueW = new ShaderMaterial({ vertexShader: PLAQUE_VS, fragmentShader: PLAQUE_FS, defines: { WRECK: 1 }, uniforms: pm.uniforms });
    }
  }
  /** 阴影那一遍：有构件藏起来时换这份（藏起来的不投影；同时带着进屋溶顶的 roomOut）；没有返回 null */
  wreckShadow(): ShaderMaterial | null {
    if (this.hideSlot < 0) return null;
    this.wShadow ??= new ShaderMaterial({ colorWrite: false, defines: { WRECK: 1 }, uniforms: { ...this.roomFade, ...this.wreckU },
      vertexShader: `varying vec3 vWP;${WRECK_VS}
void main(){${WRECK_CULL}
  vec4 p = vec4(position, 1.0);
#ifdef USE_INSTANCING
  p = instanceMatrix * p;
#endif
  vec4 w = modelMatrix * p; vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `varying vec3 vWP;
${ROOM_FADE_FS}
void main(){ roomOut(); gl_FragColor = vec4(1.0); }` });
    return this.wShadow;
  }
  /** 这处地点拼过没有（画面里有）、原点在哪 */
  origin(locId: string): { x: number; y: number; layout: LocLayout } | null { const e = this.locations.get(locId); return e && e.group.visible ? { x: e.x, y: e.y, layout: e.layout } : null; }
  /** 按原样把第 idx 件构件拼进 B（同一条路、同一份随机数；坐标是这处地点的本地坐标，y 是绝对高度）。地点没建过返回 false */
  buildPieceInto(locId: string, idx: number, B: ArchBuilder, heightAt: (x: number, y: number) => number): boolean {
    const e = this.locations.get(locId), piece = e?.layout.pieces[idx];
    if (!e || !piece || !canModelPiece(piece)) return false;
    this.buildOne(e, B, piece, heightAt);
    return true;
  }
  /** 替身用的材质：主角附近的用带镂空的（和原来的块一致），其余用不镂空的 */
  matFor(near: boolean): ShaderMaterial { const s = this.lit(); return near && this.material ? this.material : s; }
  /** 替身上的字（店招、幡上的字） */
  plaquesMesh(list: Plaque[]): Mesh | null { return this.plaqueMesh(list); }

  private buildPiece(builder: ArchBuilder, piece: Piece, layout: LocLayout, tier: number, x: number, y: number, z: number): void {
    const p = piece.p as Props;
    if (piece.kind === 'box') {
      // 一整块石体（秘境的墙）：尺寸直接是世界单位，中心在 (x, z)；顶上压一层颜色不同的盖
      // y0：离地多高起（一截截摞起来的东西用：盘龙柱上的龙、巨剑的剑格与剑柄）
      const q = p as { w: number; d: number; h: number; col: string; cap?: string; y0?: number }, y0 = y + (q.y0 ?? 0);
      builder.box(x, y0 + q.h / 2, z, q.w, q.h, q.d, q.col);
      if (q.cap) builder.box(x, y0 + q.h + 3, z, q.w + 4, 6, q.d + 4, q.cap);
      return;
    }
    const pal = { ...layout.pal, ...p.pal };
    const v2 = piece.kind === 'B' || piece.kind === 'W' || piece.kind === 'WV';
    const scale = v2 ? 1 : LOC_SCALE * (p.z ?? 1);
    if (piece.kind === 'wallH' || piece.kind === 'wallV' || piece.kind === 'W' || piece.kind === 'WV') {
      this.wall(builder, piece.kind, p, pal, x, y, z, scale);
      return;
    }
    const colors: ArchPalette = {
      roof: p.roof ?? (piece.kind === 'hut' ? '#b89a5a' : pal.roof), wall: p.wall ?? (piece.kind === 'hut' ? '#c8ae86' : pal.wall),
      pillar: p.pillar ?? pal.pillar, trim: pal.trim, stone: pal.stone, accent: pal.accent,
    };
    if (piece.kind === 'yurt') {
      // 毡帐：一圈矮墙、一条彩带、一个圆顶；金顶大帐的顶是金的
      const r = (p.w ?? 70) * scale * 0.5, gold = !!(p as { gold?: boolean }).gold;
      builder.yurt(x, y, z - r * 0.62, r, r * (gold ? 1.5 : 1.3), '#ece6d6', gold ? '#d8b040' : '#f4f0e6', (p as { band?: string }).band ?? '#a8352a', '#6a3a22');
      return;
    }
    if (piece.kind === 'pagoda') {
      const q = p as { levels?: number; lh?: number }, w = (p.w ?? 60) * scale, lv = q.levels ?? 7;
      builder.pagoda(x, y, z - w * 0.5, w, lv * (q.lh ?? 22) * 1.5 * scale, Math.max(3, Math.min(9, lv)), colors);
      return;
    }
    if (piece.kind === 'paifang') { builder.paifang(x, y, z, (p.w ?? 120) * scale, (p.h ?? 70) * scale * 1.35, (p as { stoneGate?: boolean }).stoneGate ? { ...colors, pillar: colors.stone, roof: shadeOf(colors.stone, -0.3) } : colors); return; }
    if (piece.kind === 'pavilion') { const w = (p.w ?? 56) * scale; builder.pavilion(x, y, z - w * 0.5, w, w * 1.5, colors); return; }
    if (piece.kind === 'dome') { const r = (p.w ?? 160) * scale * 0.5; builder.yurt(x, y, z - r * 0.6, r, r * 1.5, colors.wall, colors.roof, colors.accent, shadeOf(colors.pillar, -0.3)); return; }
    if (piece.kind === 'tower') {
      // 箭楼 / 望楼：两层小楼
      const h = ((p.h ?? 46) + 30) * scale * Math.SQRT2;
      builder.pagoda(x, y, z - 18 * scale, 40 * scale, h, 2, { ...colors, wall: p.col ?? '#8e8a7e' });
      return;
    }
    const size = piece.kind === 'B' ? this.v2Size(piece, layout) : this.legacySize(piece.kind, p, scale);
    const key = piece.kind === 'B' ? (p.k ?? '').split('|')[0] : piece.kind;
    const total = size.base + size.h + size.roofH;
    if (/tower|pagoda/.test(key)) {
      const w = Math.min(size.w, size.d * 1.4) * 0.8, tiers = Math.max(2, Math.min(7, Math.round(total * 1.15 / (w * 0.8))));
      builder.pagoda(x, y, z - size.d / 2, w, total * (tier >= 3 ? 1.3 : 1.15), tiers + (tier >= 3 ? 1 : 0), colors);
      return;
    }
    if (/pavilion|waterside/.test(key)) {
      builder.pavilion(x, y, z - size.d / 2, Math.min(size.w, size.d * 1.3) * 0.8, total, colors);
      return;
    }
    if (/altar|drill_ground|monument|beast_pen/.test(key)) {
      // 祭坛、演武场、碑：一座两层的石台，四角立柱
      const h = Math.max(10, total * 0.16), cz = z - size.d / 2;
      builder.box(x, y + h / 2, cz, size.w, h, size.d, colors.stone);
      builder.box(x, y + h * 1.25, cz, size.w * 0.78, h * 0.5, size.d * 0.78, shadeOf(colors.stone, 0.12));
      builder.box(x, y + h * 1.55, cz, size.w * 0.7, h * 0.1, size.d * 0.7, colors.accent);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) builder.box(x + sx * size.w * 0.45, y + h * 1.6, cz + sz * size.d * 0.45, h * 0.35, h * 3.2, h * 0.35, colors.pillar);
      if (/monument/.test(key)) builder.box(x, y + h * 1.5 + total * 0.35, cz, size.w * 0.12, total * 0.7, size.w * 0.06, shadeOf(colors.stone, -0.25));
      return;
    }
    // 殿堂类：正殿按宗门等级放大。大宗门的正殿是重檐、高台基；小门派的收小一号
    const main = piece.kind === 'hall' || /hall|palace/.test(key) || (piece.kind === 'B' && size.w > 460);
    const gate = /gate/.test(key);
    const k = main ? (tier >= 3 ? 1.32 : tier === 1 ? 0.88 : tier === 2 ? 1.08 : 1) : 1;
    const w = size.w * k, d = size.d * (main ? Math.min(k, 1.15) : 1);
    const bodyH = (size.h * 0.66 + (main ? size.h * 0.06 : 0)) * k;
    const roofH = Math.max(size.roofH * 1.5, d * (main ? 0.38 : 0.32)) * (main ? k : 1);
    builder.hall(x, y, z, w, d, bodyH, roofH, colors, {
      tiers: main && tier >= 3 ? 2 : (p.tiers ?? 1) > 1 ? 2 : 1,
      base: piece.kind === 'hut' ? 0.01 : main ? bodyH * (tier >= 3 ? 0.34 : 0.2) : Math.max(size.base, bodyH * 0.1),
      opening: size.opening, gable: p.gable || piece.kind === 'house' || piece.kind === 'hut' ? 1 : gate ? 0.75 : main ? 0.5 : 0.85,
      steps: piece.kind !== 'hut',
    });
  }

  private wall(builder: ArchBuilder, kind: string, p: Props, pal: Pal, x: number, y: number, z: number, s: number): void {
    const vertical = kind === 'wallV' || kind === 'WV';
    const v2 = kind === 'W' || kind === 'WV';
    const len = p.len! * s, h = (p.hh ?? p.h ?? 46) * s * Math.SQRT2;
    const thick = (p.t ?? (v2 ? 56 : 26)) * s;
    const color = p.col ?? '#8e8a7e';
    if (!vertical && p.gate) {
      // 墙上开门：两段墙夹一座小门楼
      const opening = 34 * s, side = (len - opening) / 2;
      builder.wall(x - (opening + side) / 2, y, z - thick / 2, side, h, thick, 'x', color, pal.roof);
      builder.wall(x + (opening + side) / 2, y, z - thick / 2, side, h, thick, 'x', color, pal.roof);
      builder.hall(x, y, z + 6 * s, opening + 36 * s, thick + 12 * s, h * 1.05, h * 0.5, pal, { opening, base: 0.01, gable: 0.8, steps: false });
      return;
    }
    if (vertical) builder.wall(x, y, z - len / 2, len, h, thick, 'z', color, pal.roof);
    else builder.wall(x, y, z - thick / 2, len, h, thick, 'x', color, pal.roof);
  }

  private legacySize(kind: string, p: Props, s: number): BuildingSize {
    const w = (p.w ?? (kind === 'hut' ? 54 : 70)) * s;
    const d = (p.d ?? (kind === 'hut' ? 34 : kind === 'house' ? 40 : w / s * 0.5)) * s;
    const h = (p.h ?? (kind === 'hall' ? 40 : kind === 'hut' ? 18 : 24)) * s * Math.SQRT2;
    const base = (kind === 'hut' ? 0 : kind === 'house' ? 4 : p.ph ?? 10) * s * Math.SQRT2;
    const roofRise = kind === 'hall' ? 10 : kind === 'hut' ? 8 : 6;
    const roofH = Math.max(6 * s, (d * 0.55 * 0.75 + roofRise * s) * Math.SQRT2 - d / 2);
    return { w, d, h, base, roofH, opening: 0 };
  }

  /** 贴图建筑的占地与高度：宽取贴图宽，进深取它的碰撞块，高由贴图高度折算；正面有能走人的门洞时留出来 */
  private v2Size(piece: Piece, layout: LocLayout): BuildingSize {
    const p = piece.p as Props;
    // 整座地点放大过的话（layout.zoom），碰撞块和下面这些固定的像素数都是按放大后的尺寸存的
    const Z = layout.zoom ?? 1, f = p.prop ? Math.sqrt(Z) : Z;
    const w = p.w!, h = p.h!, x = piece.x * LOC_SCALE, y = piece.y * LOC_SCALE;
    const dim = BLD2[p.k!.split('|')[0]];
    const half = w / f * 0.44 * Z;
    const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
    const atFront = (block: LocLayout['blocks'][number]) => near((block.y + block.h) * LOC_SCALE, y - 6 * Z);
    const solid = layout.blocks.find(block => atFront(block) && near(block.x * LOC_SCALE, x - half) && near(block.w * LOC_SCALE, half * 2));
    let opening = 0, depth = solid ? solid.h * LOC_SCALE + 6 * Z : Math.min(h * 0.38, w * 0.42, 330 * Z);
    if (dim?.door) {
      const gap = Math.max(96, dim.door * (p.s ?? 1) / f) * Z;
      const side = half - gap / 2;
      const left = layout.blocks.find(block => atFront(block) && near(block.x * LOC_SCALE, x - half) && near(block.w * LOC_SCALE, side));
      const right = layout.blocks.find(block => atFront(block) && near(block.x * LOC_SCALE, x + gap / 2)
        && near(block.w * LOC_SCALE, side) && left && near(block.y, left.y) && near(block.h, left.h));
      if (left && right) { opening = gap; depth = left.h * LOC_SCALE + 6 * Z; }
    }
    const height = Math.max(40, h * Math.SQRT2 - depth / 2);
    const base = Math.min(16, height * 0.035);
    return { w: w * 0.88, d: depth, h: (height - base) * 0.78, base, roofH: (height - base) * 0.22, opening };
  }
}
