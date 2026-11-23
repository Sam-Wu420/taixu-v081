// 大地图渲染：水墨底图 → 水波 → 倒影 → 地点地面 → (山/树/建筑/生灵/人物 Y 排序) → 护山大阵 → 天空生灵
//            → 昼夜 → 灯火 → 云雾/迷雾 → 名牌 → 神识 → 天气 → 季节纸纹
import { isGrandSect } from '../data/sectPlan';
import { modx } from '../mod/hooks';
import { prof } from '../core/prof';
import { FrameBudget, RenderPriority } from './frameBudget';
import { LOD } from '../gfx/lod';
import { TreePatchCache, PATCH_MACRO_STRIPS, PATCH_MIN_TREES_L0, type PatchBakeBudget, type PatchTemplateFn, type TreePatch } from './treePatch';
import { grassSprite, grassRes, grassFrame } from '../gfx/grass';
import type { Game } from './game';
import { FOG_CELL, FOG_W, FOG_H } from './game';
import { CHUNK, Deco, TreeDeco, MtnDeco, FallDeco, type Terrain } from './terrain';
import { releaseTerrainChunkJobs, terrainChunkJobs } from './terrain-chunk-jobs';
import { planTerrainChunks } from './terrain-chunk-plan';
import { makeFallCliff, fallGeometry, drawFallAnim, type FallMeta } from '../gfx/waterfall';
import { LOCATIONS, LocDef, WORLD_SCALE, WORLD_W, WORLD_H, BIG_LABELS, groundZones, zoneAt, ACTIVE_MAP } from '../data/world';
import { hash2, clamp } from '../core/rng';
import { IS_TOUCH } from '../core/touch';
import { bindOf, keyLabel } from '../core/keymap';
import { sprites, resBucket, Spr } from '../gfx/sprites';
import { resTier } from '../gfx/resTier';
/** 贴地贴花走显卡投影；localStorage taixu.gpudecal=0 可退回 CPU 逐格切分 */
const GPU_DECALS = (() => { try { return typeof localStorage === 'undefined' || localStorage.getItem('taixu.gpudecal') !== '0'; } catch { return true; } })();
import { makeTree, Season } from '../gfx/tree';
import { textCacheTick } from '../gfx/textCache';
import { HdScene, MAX_BB, type HdAllocRequest } from '../hd2d/scene';
import { SeaThings } from '../hd2d/seathings';
import { BossThings, bossViewOf, bossReadyTo } from '../hd2d/bossthings';   // r16 夜无赦：首领立板单独画
import { HsFx3D } from '../hd2d/hsfx3d';   // r7-fx3d：立体打击特效
import { YwsFx3D } from '../hd2d/ywsfx3d';   // r16：夜无赦的魔修特效（魂镰刀光、冥狱石柱、鬼门、魔触、魂火、魔翼）
import { fx3dPeek, fx3dOf } from './fx3d';
import { hfLevel } from './hitfeel';   // r9-hitfeel
import { LightList, MAX_FLASH_LIGHTS } from '../hd2d/lights';
import type { ZhenWall } from '../hd2d/zhenwall';   // 收官第四轮乙 P2：点光源
import { gradeFor, fogFor, gfxSetting, lootGlow } from '../hd2d/grade';   // 收官第四轮乙 P2：时辰分色调、高度雾   // 收官 B2：海兽、触须、蛟身、鲸背（HD 场景里单独的网格）
import { MOUNTAINS } from './surface';
import { NUOYI_STYLE, TUNNEL_BLADE, SURGE_DEPTH } from './nuoyi';
import { HomeMap, GroundDetail, drawXukongOverlay } from './xukongfx';
import { HOME, VOID_SCALE, realmOfMap, voidToPoint } from '../data/zhujie';
import { LOW_CLOUD, realmWeather, type CloudDeck } from '../hd2d/voidclouds';
import type { MapId } from '../data/world';
import { mapOverview, prebuildTerrain } from './game';
import { glyphAtlas } from '../hd2d/scene';
import { BitmapFrame } from '../gfx/bitmap-frame';
import type { StaticSprite } from '../hd2d/staticAtlas';
import type { WreckDown, WreckPose } from './wreck';
const treeFrames = new WeakMap<ImageBitmap, BitmapFrame>();
import { canModelPiece } from '../hd2d/buildings';
import { hdBox, charBox } from '../hd2d/boxes';
import { THEMES } from '../data/mijing';
import { flagstone, flagstoneVersion } from '../gfx/flagstone';
import { REALM_OX, REALM_OY, type MjSpec, type MjFloor } from './mijing';
import { hdUi } from '../hd2d/ui';
/** HD2D：挡住主角时要淡化的大件 */
/** HD2D：按地面纵深等比缩小的大布景 */
const BACKDROP = new Set(['D·山', 'D·山腰云', 'D·瀑布']);
const OCCLUDERS = new Set(['D·山', 'D·山腰云', 'D·树', 'D·瀑布', 'D·建筑', 'D·城墙', 'D·城中树', 'D·城中小件']);
/** r14：人物类立板（主角另算）：清晰度单独定，不再跟着满屏的树和房子一起被图集面积压糊 */
const ACTORS = new Set(['D·生灵(人兽)', 'D·战斗单位', 'D·NPC', 'D·事件剧情', 'D·召唤', 'D·元婴', 'D·化形', 'D·众修出窍', 'D·众修化形', 'D·p1人形', 'D·工匠', 'D·天上飞禽', 'D·元婴肉身', 'D·替身']);
/** r14：主角、人物各自最多占动态图集的几成 */
const HERO_ROOM = 0.25, ACTOR_ROOM = 0.35;
import { makeMountain } from '../gfx/mountain';
import { getLayout, renderPiece, renderGround, renderGroundGen, LOC_SCALE, LocLayout, Piece } from '../gfx/building';
import { drawCityGround } from './cityGround';
import { loadBld2, tickBld2, drawBld, drawWallRun, pavePattern, fillPatternTiled, drawDecal, warmBld } from '../gfx/bldTex2';
import { drawCharacter } from '../gfx/character';
import { CharacterWorkerFrames } from '../gfx/character-worker-frames';
import { YING_SCALE } from './yuanying';
import { artLook } from '../data/artlooks';
import type { Look } from '../gfx/renwu/types';
import { DUNKONG_COLOR } from './dunkong';
import { ALT } from './alt';
import type { CharState } from '../gfx/character';
import { drawNode } from './nodes';
import type { Drawable } from './life';
import { SenseFx, senseMods } from './sense';
import { characterFrames, collectCombat, drawCombatFx, drawCombatUI } from './combatfx';
import { REALMS } from '../data/realms';
import { GLStage, PostParams, type WorldTarget } from '../gl/stage';
import { loadBldTex } from '../gfx/bldTex';
import { loadHeadTex } from '../gfx/headTex';
import { loadBeastTex, hasBeastSprite, drawBeastSprite, charAnim } from '../gfx/beastTex';
import { drawBeast } from '../gfx/beast';
import type { VoidFigure, VoidView } from '../hd2d/voidscene';
import type { VoidThing } from './voidlife';   // 收官 P9：交手那一刻交接中的网格模型
import type { Enemy } from './combat';
import { MAX_SEG, MAX_TOWN, MAX_ZONE, type GroundSegs, type GroundView, type SegProvider } from '../gl/ground';
import { FxSys, smokeCell } from '../gl/fx';
import { drawCombatGL } from '../gl/combatgl';
import { brawlWarp } from '../gl/brawlgl';   // 近战的速度线
import { hs3Post } from '../gl/hsmoves3gl';   // 撼山客第三批
import { hs3Peek } from './hsmoves3';
import { VfxSprites } from '../gl/vfxsprites';
import { TIERS } from './sense';
import { mood } from './mood';
import { grainAmount } from '../core/grain';   // r15-touchctl：画面颗粒开关
import { moodMask } from './weather';
import { IndoorGl } from '../hd2d/indoorGl';   // 收官 P8（丁）
import { TownWreckGl } from '../hd2d/townwreckGl';   // 城镇破坏：坏了的构件的替身、倒下的过程、城墙焦痕
import { drawTownMarks, collectTownWorkers } from './townwreckDraw';   // 城镇破坏：城里地面的石板碎裂
import { HuajuanGl } from '../hd2d/huajuanGl';   // 收官 P8（丁）：画中洞天

const LOC_SEAL: Record<string, string> = { city: '城', town: '镇', sect: '宗', danger: '险', secret: '秘', isle: '岛' };
const LOC_SEAL_COLOR: Record<string, string> = { city: '#9a3b2c', town: '#8a6a3a', sect: '#2f6b5e', danger: '#5a1f2a', secret: '#3a5a8a', isle: '#2f6a80' };
export const PLAYER_SCALE = 1.12;
export const TREE_K = 0.76; // 野外树木整体比例
// ---------------------------------------------------------------- 遮挡淡出（集中判定）
// 设计：物件在 push 进 list 时挂一个 occ 字段，绘制循环里统一算一次 alpha；
// 判定（矩形 / 像素掩码）、平滑、阈值全部只在这一个地方。
// 新增一类「会挡住主角的物件」= push 时多写 occ 一行，不用碰这里，也不用改绘制函数。
const OCCL_A = new WeakMap<object, number>();
export interface OccInfo {
  /** 延迟取 sprite（可能还在异步烘焙）：返回 null 表示暂不可判定 */
  get: () => { canvas: HTMLCanvasElement; w: number; h: number; ax: number; ay: number } | null;
  x: number; y: number; flip?: boolean;
  /** 物件底边 y：主角 y 小于它（排在它后面）才可能被挡 */
  footY: number;
  /** mask = 查贴图不透明像素（山/崖/树）；rect = 用 box（实心方盒类） */
  mode?: 'mask' | 'rect';
  box?: [number, number, number, number];
  /** 被挡时淡到多少（默认 0.5） */
  k?: number;
  /** 平滑状态 key（默认用传入的对象本身） */
  ent?: object;
}
const MASK_N = 64;
const MASK_CACHE = new WeakMap<HTMLCanvasElement, Uint8Array>();
function spriteMask(cv: HTMLCanvasElement): Uint8Array {
  const hit = MASK_CACHE.get(cv); if (hit) return hit;
  let m: Uint8Array;
  try {
    const c = document.createElement('canvas'); c.width = c.height = MASK_N;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(cv, 0, 0, MASK_N, MASK_N);
    const px = g.getImageData(0, 0, MASK_N, MASK_N).data;
    m = new Uint8Array(MASK_N * MASK_N);
    for (let i = 0; i < m.length; i++) m[i] = px[i * 4 + 3] > 40 ? 1 : 0;
  } catch { m = new Uint8Array(MASK_N * MASK_N).fill(1); }
  MASK_CACHE.set(cv, m);
  return m;
}
/** 主角身体被这张贴图盖住的比例（0~1）：12 个采样点查掩码 */
function coveredRatio(spr: { canvas: HTMLCanvasElement; w: number; h: number; ax: number; ay: number },
                      o: { x: number; y: number; flip?: boolean }, pl: { x: number; y: number }): number {
  const m = spriteMask(spr.canvas);
  const fl = o.flip ? -1 : 1, N = MASK_N, du = spr.w || 1, dv = spr.h || 1;
  let hits = 0, n = 0;
  for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 3; sx++) {
    const wx = pl.x + (sx - 1) * 14, wy = pl.y + 6 - sy * 36;
    const u = (fl * (wx - o.x) + spr.ax) / du, v = (wy - o.y + spr.ay) / dv;
    n++;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
    const mx = Math.min(N - 1, u * N | 0), my = Math.min(N - 1, v * N | 0);
    if (m[my * N + mx]) hits++;
  }
  return n ? hits / n : 0;
}
const SP_INDEX: Record<string, number> = { pine: 1, broad: 2, willow: 3, bamboo: 4, maple: 5, ymaple: 6, plum: 7, peach: 8, cypress: 9, snowpine: 10, dead: 11, palm: 12, apricot: 13 };

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string }
interface MtnMeta { falls: { x: number; y: number; w: number; h: number }[]; seen: number; refl?: boolean }

export class Renderer {
  game: Game;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dpr = 1; W = 0; H = 0;
  cloud: HTMLCanvasElement;
  glow: HTMLCanvasElement;
  particles: Particle[] = [];
  /** GC 优化：粒子对象池，避免每帧 new Particle */
  private _particlePool: Particle[] = [];
  private _acquireParticle(): Particle {
    return this._particlePool.pop() ?? { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0, size: 0, color: '' };
  }
  /** GC 优化：复用 Drawable 列表数组，避免每帧 new Array */
  private _drawList: Drawable[] = [];
  private _drawReflect: (TreeDeco | MtnDeco)[] = [];
  private _drawPrefetch: MtnDeco[] = [];
  /** HD2D 打包阶段的 V 对象池：避免每帧 1000+ 个短命对象 */
  private _vPool: { d: Drawable; l: number; r: number; t: number; b: number; fy: number; air: boolean; a: number; k: number; slot: number; layered: boolean;
    overlay?: (g: CanvasRenderingContext2D) => void; underSlot?: number; underlay?: (g: CanvasRenderingContext2D) => void }[] = [];
  driftClouds: { x: number; y: number; s: number; v: number }[] = [];
  private pendingBuilds = 0;
  atmo: HTMLCanvasElement; atmoCtx: CanvasRenderingContext2D;
  static AS = 0.25;
  quality: ImageSmoothingQuality = 'medium';
  /** 世界层 DPR 上限（0 = 不限制）：世界层每帧整张上传 GL，压低它可直接省上传带宽；HUD 文字仍用 uiDpr */
  worldDprCap = 0;
  overlay: HTMLCanvasElement | null = null; overlayKey = '';
  cloudShadow: HTMLCanvasElement;
  layouts = new Map<string, LocLayout>();
  mtnMeta = new Map<string, MtnMeta>();
  private lastCam = { x: 0, y: 0 };
  private lastUpCam = { x: NaN, y: NaN };
  /** 「世界层静止」连续帧数（镜头没动、没有粒子/战斗/天象/角色移动），用于跳过世界层绘制 */
  private stillFrames = 0;
  private stillCam = { x: NaN, y: NaN };
  private skipSceneNow = false;
  private liveNow = false;   // v0.52.7：本帧视野内是否有活物（路人/灵宠/妖兽）
  private atmoSkipNow = false;   // v0.52.8：本帧跳过氛围层重画（沿用上一张）
  private atmoStep = 1;          // 氛围层每几帧重画一次（1 = 逐帧，2 = 半速）
  private atmoReady = false;     // 氛围层已经有内容（首帧必须先画一次）
  private lastStillZ = NaN;
  private _sceneW = 0; private _sceneH = 0;
  /** 四季缓存：提前烘好另外三季的树（移植版附加项；原版线上没有，默认关） */
  seasonCache = false;
  /** 树精灵分辨率基准：>0 固定（不随 zoom 重烘，换档不闪）；0 = 跟随缩放（原版行为，默认） */
  treeSpriteZoom = 0;
  /** 山峰贴图分辨率：0 = follow zoom (original, rebuilds at 3 low-zoom steps); >0 = fixed, never rebuilds */
  mtnSpriteZoom = 0;
  /** 树风摆关掉：走轴对齐快路径，密林更流畅，树不再轻摆（默认开＝原版） */
  flatTrees = false;
  // 风摆预计算（每帧算一次，所有树共用 sin/cos，避免每棵树调三角函数）
  private _wSinA = 0; private _wCosA = 0; private _wSinB = 0; private _wCosB = 0; private _wGlobal = 0;
  // 帧预算调度器（移植自 taixu071）：低优先级装饰按预算决定画不画
  readonly frameBudget = new FrameBudget();
  // 树片金字塔缓存（移植自 taixu071）：远景树按片合图，不再逐棵画
  readonly treePatches = new TreePatchCache();
  private treeWarmQ: { d: TreeDeco; season: Season; res: number }[] = [];
  private treeWarmSet = new Set<string>();
  private lastLight = { night: 0, dusk: 0, gloom: 0, dayK: 1, mul: [255, 255, 255] as number[] };
  /** 本帧世界层是否在「动」（决定要不要上传到 GPU 合成） */
  sceneMoving = true;
  private Z = 1; private ox = 0; private oy = 0;
  stats = { decos: 0, trees: 0, mtns: 0, ms: 0, grass: 0 };
  sense = new SenseFx();
  senseMods: string[] = [];
  private modsT = 0;

  /** WebGL 合成层（不可用时为 null，回退纯 Canvas2D） */
  stage: GLStage | null = null;
  /** B 版：HD2D 立体场景（three.js）。设置里打开（localStorage 'taixu.hd2d' = '1'），需要 WebGL 合成层 */
  hd: HdScene | null = null;
  characterWorkers: CharacterWorkerFrames | null = null;
  private hdTarget: WorldTarget | null = null;
  /** P2：这一帧的点光源；lightsReady 只在界内主画法里填好时为真（秘境、虚空等别的画法这一帧不用） */
  private lights = new LightList(); private lightsReady = false;
  /** P2 新光影要不要开：画质最低一档、设置里关掉（localStorage taixu.gfx=0）时退回原来的画法 */
  /**
   * 光影各项按画质档（lowered：自适应降档的级数；设置里「高」= 0、「中」= 2、「流畅优先」= 4）开关：
   *
   *   lowered | 半浮点与色调映射 | 时辰分色调 | 点光源 | 高度雾 / 距离雾
   *   --------+------------------+------------+--------+----------------
   *     0–1   |        开        |     开     |   开   |       开
   *      2    |        开        |     开     |   开   |       关
   *      3    |        开        |     开     |   关   |       关
   *      4    |        关        |     关     |   关   |       关     ← 整组退回原画法
   *
   * 设置里「光影」关掉（taixu.gfx=0）等同第 4 档那一行。雾最便宜但最容易洗画面，先关；点光源那一遍有填充开销，次之。
   */
  get gfxOn() { return gfxSetting.on && this.lowered < 4; }
  /** 本档开不开点光源（见上表） */
  get gfxLights() { return this.gfxOn && this.lowered < 3; }
  /** 本档开不开高度雾 / 距离雾（见上表） */
  get gfxFog() { return this.gfxOn && this.lowered < 2; }
  fx: FxSys | null = null;
  private vfxSprites: VfxSprites | null = null;
  /** 页面上的画布（GL 模式下作为透明 UI 层：名牌、血条、伤害数字） */
  domCanvas: HTMLCanvasElement;
  uiCtx: CanvasRenderingContext2D;
  /** 画质：2 高 / 1 中 / 0 低 */
  tier = 2;

  constructor(game: Game, canvas: HTMLCanvasElement) {
    this.game = game;
    this.domCanvas = canvas;
    // 建筑贴图就绪后，丢掉已缓存的程序绘制版本
    loadBldTex(() => sprites.clearBase('P:'));
    loadHeadTex();
    loadBeastTex();
    loadBld2();
    // 位图缓存预算：桌面（GL 路径 + 独显）给到 140MP，手机上 40MP——山树建筑不再反复重建
    try {
      const touchDev = IS_TOUCH;
      sprites.setBudget(touchDev ? 40e6 : 140e6);
      this.seasonCache = localStorage.getItem('taixu.seasonCache') === '1';
      this.worldDprCap = Number(localStorage.getItem('taixu.worldDpr') || 0) || 0;
      const ts = localStorage.getItem('taixu.treeSprite');
      // 默认「中 1.25×」：固定分辨率，缩放时不重烘（树不闪），数量也恒定
      this.treeSpriteZoom = ts === null ? 1.25 : Math.max(0, Math.min(1.7, Number(ts) || 0));
      const ms = localStorage.getItem('taixu.mtnSprite');
      this.mtnSpriteZoom = ms === null ? 0.75 : Math.max(0, Math.min(1.6, Number(ms) || 0));
      this.flatTrees = localStorage.getItem('taixu.treeSway') === '0';
    } catch { /* */ }
    const q = typeof location !== 'undefined' ? location.search : '';
    this.stage = GLStage.create();
    if (this.stage) {
      this.canvas = document.createElement('canvas');
      // 透明：底下是 GPU 地表（gl/ground.ts），Canvas 只画地表之上的东西
      this.ctx = this.canvas.getContext('2d', { alpha: true })!;
      this.groundWanted = !/[?&]ground=0/.test(q);
      this.uiCtx = canvas.getContext('2d')!;
      const gc = this.stage.canvas; gc.className = 'game-gl';
      canvas.parentElement?.insertBefore(gc, canvas);
      this.fx = new FxSys(this.stage.batch);
      this.vfxSprites = new VfxSprites(this.stage);
      this.hd = new HdScene(gc, this.stage.gl, (x, y) => this.game.offWorld ? 0 : this.game.terrain.surfaceHeight(x, y) - (this.dentOn ? fx3dOf(this.game).dentAt(x, y) : 0),   // 秘境是平地；虚空斗法场没有地面，高度按 0 算；r7-fx3d：大招砸出的坑（立体画面里人站在坑里）
        (x, y) => this.game.offWorld ? 0 : this.game.terrain.terrainHeight(x, y));   // 地形网格不跟着铁索桥面抬起来
    } else {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false })!;
      this.uiCtx = this.ctx;
    }
    this.cloud = this.makeCloud();
    this.cloudShadow = this.makeCloudShadow();
    this.glow = this.makeGlow();
    this.atmo = document.createElement('canvas');
    this.atmoCtx = this.atmo.getContext('2d')!;
    for (let i = 0; i < 14; i++) this.driftClouds.push({ x: Math.random() * 9000, y: Math.random() * 6000, s: 0.8 + Math.random() * 1.4, v: 18 + Math.random() * 25 });
    // 检测到软件渲染（显卡没被用上）时，直接把世界层预算压到 1.5MP：
    // 这种状态下 fill rate 全靠 CPU，分辨率每降一半、帧率就翻一倍，比任何特效开关都管用。
    if (this.stage?.softGPU) this.pxBudget = 1.5e6;
    this.resize();
    window.addEventListener('resize', this.onResize);
    // 每帧读 clientWidth/clientHeight 会强制同步布局（layout thrash），复杂 HUD 下能吃掉好几毫秒。
    // 改成只在尺寸真的变了时（ResizeObserver）才重算，帧内零布局查询。
    try {
      this.ro = new ResizeObserver(() => {
        if (this.domCanvas.clientWidth !== this.W || this.domCanvas.clientHeight !== this.H) this.resize();
      });
      this.ro.observe(this.domCanvas);
    } catch { /* 老浏览器没有也不影响 */ }
  }
  private readonly onResize = () => this.resize();
  private ro: ResizeObserver | null = null;

  dispose() {
    releaseTerrainChunkJobs(this.game.terrain);
    window.removeEventListener('resize', this.onResize);
    this.ro?.disconnect();
    this.ro = null;
    this.releaseCharacterWorkers();
    this.bossThings?.dispose(); this.bossThings = null;   // r16 夜无赦
    this.hd?.dispose();
    if (this.stage) { this.stage.canvas.remove(); this.stage.gl.getExtension('WEBGL_lose_context')?.loseContext(); this.stage = null; }
  }

  private releaseCharacterWorkers(): void {
    if (!this.characterWorkers) return;
    this.characterWorkers.dispose(); this.characterWorkers = null;
    this.hd?.releaseCharacterFrames();
  }

  resize() {
    const isMobile = Math.min(window.innerWidth, window.innerHeight) < 600;
    const el = this.domCanvas;
    this.W = el.clientWidth || window.innerWidth;
    this.H = el.clientHeight || window.innerHeight;
    // 世界层按「像素预算」定分辨率，而不是按 devicePixelRatio 死算。
    // 以前 4K 屏（或 150% 缩放的 2K 屏）会按 1.5 倍渲染，一帧世界层就是 3000×2000 上下、二十多兆，
    // 每帧都要从 Canvas 拷进 GPU 纹理，光这一项就能把任何显卡拖垮——画面简单却卡，根源在这里。
    // 现在给世界层一个总像素上限（桌面 2.2MP / 手机 1.2MP），超出就等比降采样；水墨画风放大后几乎看不出。
    // r14「人物糊」：手机以前一律封顶 1.25 倍——像素比 2.6 的横屏手机上整个立体画面放大两倍多再显示，人和字边都糊。
    // 现在按画质档给：最高档 2 倍（再高 WebView 输出画布也只到 2 倍），自适应降档时一级一级退回去，最低档比原来还省
    let want = Math.min(window.devicePixelRatio || 1, isMobile ? Renderer.MOBILE_DPR[Math.max(0, Math.min(Renderer.MOBILE_DPR.length - 1, this.lowered ?? 0))] : Math.min(2, this.maxDpr ?? 1.5));
    // 世界层 DPR 上限（设置面板）：只压世界层，HUD 仍用 uiDpr
    if (this.worldDprCap > 0) want = Math.min(want, this.worldDprCap);
    const area = Math.max(1, this.W * this.H);
    const budget = isMobile ? Math.min(this.pxBudget, 1.5e6) : this.pxBudget;
    if (area * want * want > budget) want = Math.sqrt(budget / area);
    this.dpr = Math.max(0.55, Math.min(want, 2));
    // HD2D 的这张画布只承载雨雪和空气层，半分辨率上传即可。
    const overlayDpr = this.hd ? Math.min(0.5, this.dpr) : this.dpr;
    this.canvas.width = Math.round(this.W * overlayDpr);
    this.canvas.height = Math.round(this.H * overlayDpr);
    if (this.stage) {
      // UI 层与 GL 输出用设备像素比（文字清晰），世界层可按画质降采样
      const ud = Math.min(window.devicePixelRatio || 1, 2);
      this.domCanvas.width = Math.round(this.W * ud); this.domCanvas.height = Math.round(this.H * ud);
      this.uiDpr = ud;
      // 后期输出与世界层同分辨率（高分屏上不再按 2× 跑整套后期）
      // 后期输出也跟着世界层走（略高 15%，保证世界层放大后不糊），4K 屏不再按满像素跑整套着色器
      const sd = Math.min(ud, Math.max(0.8, this.dpr * 1.15));
      this.stage.resize(this.W * sd, this.H * sd);
      this.hd?.resize(this.W, this.H, this.stage.W / this.W);
      this.stage.bloomOn = true;   // 第三十八步：泛光属于特效，任何降档都不关
      this.stage.bloomLevels = this.lowered >= 1 ? 2 : 3;   // 降过档就少跑一级泛光（省 3 个全屏 pass）
    }
    if (this.atmo) { this.atmo.width = Math.ceil(this.W * Renderer.AS) + 2; this.atmo.height = Math.ceil(this.H * Renderer.AS) + 2; }
    this.overlayKey = '';
  }

  /** 按 y 排序好的 list 统一绘制：遮挡淡出只在这里判一次 */
  private drawList(list: Drawable[], ctx: CanvasRenderingContext2D) {
    for (const d of list) {
      // 遮挡 alpha 挂在 this._occA，由各绘制函数乘进 globalAlpha（它们自己会写 globalAlpha，外层设会被覆盖）
      this._occA = d.occ ? this.occAlpha(d.occ) : 1;
      d.draw(ctx);
      this._occA = 1;
    }
  }
  /** 统一的遮挡判定：返回这一帧该用的 alpha（1 = 不淡） */
  /** 当前绘制物件要乘上的遮挡 alpha（1 = 不淡） */
  private _occA = 1;
  occAlpha(o: OccInfo): number {
    const pl = this.game.player;
    if (pl.flying) return 1;   // 飞行时不判定（空中视角，淡了反而怪）
    const ent = o.ent ?? o;
    const behind = pl.y < o.footY - 20;
    if (!behind) {
      const a0 = OCCL_A.get(ent);
      if (a0 !== undefined) {
        const a = a0 + (1 - a0) * 0.18;
        if (a > 0.995) OCCL_A.delete(ent); else OCCL_A.set(ent, a);
        return a > 0.995 ? 1 : a;
      }
      return 1;
    }
    let want = 0;
    if (o.mode === 'rect' && o.box) {
      const [x0, y0, x1, y1] = o.box;
      want = pl.x > x0 && pl.x < x1 && pl.y > y0 && pl.y < y1 ? 1 : 0;
    } else {
      const spr = o.get();
      want = spr && coveredRatio(spr, o, pl) > 0.25 ? 1 : 0;
    }
    const target = want ? (o.k ?? 0.5) : 1;
    const a0 = OCCL_A.get(ent) ?? 1;
    let a = Math.abs(a0 - target) < 0.02 ? target : a0 + (target - a0) * 0.18;
    if (a === 1) OCCL_A.delete(ent); else OCCL_A.set(ent, a);
    return a;
  }
  /** GC 优化：复用 viewRect 对象，避免每帧多次调用时重复创建 */
  private _viewRect = { left: 0, top: 0, right: 0, bottom: 0 };
  viewRect() {
    const vr = this._viewRect;
    if (this.hd) { const b = this.hd.groundBounds(0); vr.left = b.l; vr.top = b.t; vr.right = b.r; vr.bottom = b.b; return vr; }
    const z = this.game.cam.zoom, W = this.W || window.innerWidth, H = this.H || window.innerHeight;
    vr.left = this.game.cam.x - W / 2 / z; vr.top = this.game.cam.y - H / 2 / z;
    vr.right = this.game.cam.x + W / 2 / z; vr.bottom = this.game.cam.y + H / 2 / z;
    return vr;
  }

  burst(x: number, y: number, color: string, n = 26) {
    const c = color.startsWith('#') ? `${parseInt(color.slice(1, 3), 16)},${parseInt(color.slice(3, 5), 16)},${parseInt(color.slice(5, 7), 16)}` : color;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 90;
      { const pt = this._acquireParticle(); pt.x = x; pt.y = y; pt.vx = Math.cos(a) * v; pt.vy = Math.sin(a) * v * 0.6 - 40; pt.life = 0; pt.max = 0.7 + Math.random() * 0.8; pt.size = 2 + Math.random() * 4; pt.color = c; this.particles.push(pt); }
    }
  }

  // ---------------------------------------------------------------- 预制位图
  private makeGlow() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,214,140,0.95)'); gr.addColorStop(0.25, 'rgba(255,170,80,0.45)'); gr.addColorStop(1, 'rgba(255,140,60,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return c;
  }
  private makeCloudShadow() {
    // 性能：云影最终要贴到 1400~2000 CSS 像素宽。原来从 512 的云现缩到 128 再放大回上千像素，
    // 每个云影都要重采样一次（14 朵云 + 上天后的近云一共二三十次）。直接在缓存里做到 512，绘制时放大倍率 ≤3。
    const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(this.cloud, 0, 0, 512, 512);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = 'rgb(40,46,44)'; g.fillRect(0, 0, 512, 512);
    return c;
  }
  private buildOverlay(month: number) {
    const W = Math.ceil(this.W), H = Math.ceil(this.H);
    const c = this.overlay ?? document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    const tint = month < 3 ? 'rgba(180,220,170,0.05)' : month < 6 ? 'rgba(255,230,160,0.05)' : month < 9 ? 'rgba(230,150,80,0.07)' : 'rgba(200,215,240,0.12)';
    g.fillStyle = tint; g.fillRect(0, 0, W, H);
    const T = 192, tile = document.createElement('canvas'); tile.width = tile.height = T;
    const tg = tile.getContext('2d')!;
    const img = tg.createImageData(T, T);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random();
      img.data[i] = 70; img.data[i + 1] = 55; img.data[i + 2] = 35; img.data[i + 3] = v * v * 30;
    }
    tg.putImageData(img, 0, 0);
    tg.strokeStyle = 'rgba(110,90,60,0.10)';
    for (let i = 0; i < 40; i++) {
      tg.lineWidth = Math.random() * 0.8;
      tg.beginPath(); const x = Math.random() * T, y = Math.random() * T;
      tg.moveTo(x, y); tg.quadraticCurveTo(x + Math.random() * 20 - 10, y + Math.random() * 20 - 10, x + Math.random() * 30 - 15, y + Math.random() * 30 - 15); tg.stroke();
    }
    g.fillStyle = g.createPattern(tile, 'repeat')!; g.fillRect(0, 0, W, H);
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(40,30,20,0)'); vg.addColorStop(1, 'rgba(40,30,20,0.30)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    this.overlay = c;
  }
  private makeCloud() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const blobs = [[128, 128, 100], [80, 140, 70], [176, 136, 74], [120, 92, 66], [150, 170, 60], [96, 176, 52], [190, 100, 50]];
    for (const [x, y, r] of blobs) {
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(246,242,234,0.95)'); rg.addColorStop(0.6, 'rgba(240,236,228,0.7)'); rg.addColorStop(1, 'rgba(236,232,224,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = 'rgba(150,150,140,0.18)'; g.lineWidth = 2;
    g.beginPath(); g.arc(110, 150, 30, Math.PI * 0.9, Math.PI * 1.9); g.stroke();
    g.beginPath(); g.arc(160, 140, 24, Math.PI * 1.0, Math.PI * 2.0); g.stroke();
    return c;
  }

  uiDpr = 1;
  private perfT = 0; private perfN = 0; private perfAcc = 0; private lowered = 0;
  /** 卡顿统计（F3 面板显示）：超过 50ms 的帧数 */
  spikes = 0;
  /** 每级画质：世界层像素预算（不是像素比——像素比在小屏和大屏上的实际像素量天差地别）/ 地表缓存分辨率 / 特效档 */
  private static LEVELS = [
    { px: 3.6e6, ground: 1.25, tier: 2, fx: 1 },
    { px: 2.6e6, ground: 1.0, tier: 2, fx: 1 },
    { px: 1.8e6, ground: 0.85, tier: 1, fx: 1 },
    { px: 1.2e6, ground: 0.7, tier: 0, fx: 1 },   // 第三十八步：特效永不降档（只降分辨率 / 地表 / 环境层）
    // v0.52.8：极简档。软件渲染 / 核显机器上真正救命的一档——分辨率再砍三分之一，
    // 同时关掉倒影、山腰云、炊烟、护山大阵、神识贴图这些纯氛围开销（见各处 lowered>=3 判断）。
    { px: 0.78e6, ground: 0.55, tier: 0, fx: 1 },
  ];
  /** r14：手机（短边 < 600）每一档的世界层像素比上限（下标同 LEVELS）。原来所有档都是 1.25 */
  private static MOBILE_DPR = [2, 1.75, 1.5, 1.25, 1.1];
  private applyLevel(i: number) {
    const L = Renderer.LEVELS[Math.max(0, Math.min(Renderer.LEVELS.length - 1, i))];
    // 软件渲染时无论哪一档都不超过 1.5MP（自适应降档也不该又涨回去）
    this.pxBudget = this.stage?.softGPU ? Math.min(L.px, 1.5e6) : L.px;
    this.groundScale = L.ground; this.tier = L.tier;
    if (this.fx) this.fx.quality = L.fx;
    this.resize();
  }
  /** 世界层一帧最多多少像素（由画质档决定） */
  pxBudget = 3.6e6;
  /** 自适应画质：每 2.5 秒看一次平均帧时。
   *  低于 ~48 帧降一级；连着两次都稳在 58 帧以上再升一级（有回差，不会来回抖）。
   *  v0.52.8 之前只降不升——开局那一秒的加载卡顿会把人永久钉在最低档，画面白白变糊。 */
  private goodRun = 0;
  private adapt(dt: number) {
    if (dt > 0.05) this.spikes++;
    if (dt <= 0 || this.fixedQuality) return;
    if (dt > 0.25) return; // 切页、加载造成的单次长帧不计入
    // 缩放途中（含换档后的重烘）帧时不代表常态：清零重计，免得一次缩放把画质降下去、降档又引发二次卡顿
    if (resTier.busy) { this.perfT = 0; this.perfN = 0; this.perfAcc = 0; this.goodRun = 0; return; }
    // 优化：精灵 pending（树/山在后台生成）时，跳过这一帧的数据但不清零计时器——
    // 原来一有 pending 就全部清零，导致飞过密林时 sprites.pending 永远 >0，
    // 自适应画质永远不触发，用户 21fps 还在最高画质。现在只跳过、不停表，
    // 2.5 秒内只要有足够多的"稳态帧"就能正常降档。
    if (sprites.pending > 0) { this.perfT += dt; return; }
    this.perfT += dt; this.perfN++; this.perfAcc += dt;
    if (this.perfT <= 2.5) return;
    // 优化：至少要有 30 个稳态帧才做判断（避免 pending 太多时仅凭几帧就降档）
    if (this.perfN < 30) return;
    const avg = this.perfAcc / this.perfN;
    this.perfT = 0; this.perfN = 0; this.perfAcc = 0;
    const max = Renderer.LEVELS.length - 1;
    if (avg > 1 / 48 && this.lowered < max) {
      // 帧时已经烂到 25 帧以下时一次降两级：否则开局要连降四次、十来秒都在放幻灯片
      this.lowered = Math.min(max, this.lowered + (avg > 1 / 25 ? 2 : 1));
      this.applyLevel(this.lowered); this.goodRun = 0;
    } else if (avg < 1 / 58 && this.lowered > 0) {
      if (++this.goodRun >= 2) { this.lowered--; this.applyLevel(this.lowered); this.goodRun = 0; }
    } else this.goodRun = 0;
  }
  get qualityLevel() { return this.lowered; }
  fixedQuality = false;
  /** 手动画质：0 低 1 中 2 高 */
  setQuality(q: number) {
    this.fixedQuality = true;
    if (q >= 2) { this.lowered = 0; this.applyLevel(0); this.groundScale = 1.5; this.resize(); }
    else { this.lowered = q === 1 ? 2 : 4; this.applyLevel(this.lowered); }
    this.tier = q;
  }
  maxDpr = 1.5;

  /** 实时草丛：缓存位图 + 斜切摇摆（只有神识圈内会动，圈外是静止的记忆） */
  private grassBuilt = 0; private grassT0 = 0;
  /**
   * 第五轮：遁空疾行时拦截点在航线前方一息多的路程处，多半在画面外，地上的红圈根本看不见——
   * 拦截点出了画面（或贴着边）就在屏幕边上画一个朝它的红色箭头，标「截道」和还有几息撞上；在画面里时照旧只看地上的红圈
   */
  private drawAmbushPointer(hd: HdScene, W: number, H: number) {
    const a = this.game.dunkong.ambush; if (!a) return;
    const ctx = this.ctx, p = this.game.player, ud = this.uiDpr, t = this.game.time;
    const q = hd.project(a.x, a.y, 0), M = 64;
    let ang: number, x: number, y: number;
    if (Number.isFinite(q.x) && Number.isFinite(q.y)) {
      if (q.x > M && q.x < W - M && q.y > M && q.y < H - M) return;   // 在画面里：地上的红圈看得见
      const cx = W / 2, cy = H / 2, dx = q.x - cx, dy = q.y - cy;
      const k = Math.min((W / 2 - M) / Math.abs(dx || 1e-6), (H / 2 - M) / Math.abs(dy || 1e-6));
      ang = Math.atan2(dy, dx); x = cx + dx * k; y = cy + dy * k;
    } else {
      const s = hd.project(p.x, p.y, 0), e = hd.project(p.x + (a.x - p.x) * 0.05, p.y + (a.y - p.y) * 0.05, 0);
      ang = Math.atan2(e.y - s.y, e.x - s.x); x = W / 2 + Math.cos(ang) * (W / 2 - M); y = H / 2 + Math.sin(ang) * (H / 2 - M);
    }
    const v = Math.max(1, (this.game.speed ?? 1) * this.game.dunkong.speedMul), secs = Math.max(0, (Math.hypot(a.x - p.x, a.y - p.y) - a.r) / v);
    const pulse = 0.75 + 0.25 * Math.sin(t * 14);
    ctx.save(); ctx.setTransform(ud, 0, 0, ud, 0, 0);
    ctx.translate(x, y);
    ctx.save(); ctx.rotate(ang);
    ctx.globalAlpha = 0.9 * pulse;
    ctx.fillStyle = 'rgba(150,20,14,0.55)'; ctx.beginPath(); ctx.arc(-8, 0, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff5a46'; ctx.strokeStyle = '#ffe2c8'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(24, 0); ctx.lineTo(-12, -18); ctx.lineTo(-4, 0); ctx.lineTo(-12, 18); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.font = `bold 15px "STKaiti","KaiTi","Noto Serif SC",serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const ly = y < H / 2 ? 48 : -48, label = `截道 ${secs.toFixed(1)}息`;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(40,6,4,0.85)'; ctx.strokeText(label, 0, ly); ctx.fillStyle = '#ffd2c4'; ctx.fillText(label, 0, ly);
    ctx.restore();
  }
  /** drawGrass 交给 allocStatic 的那份立板描述（复用，草一帧几百丛） */
  private grassSpr: StaticSprite = { image: null as unknown as StaticSprite['image'], l: 0, r: 0, t: 0, b: 0 };
  private drawGrass(left: number, top: number, right: number, bottom: number, t: number, season: number, z: number) {
    const { ctx, game } = this;
    const T = game.terrain;
    const res = grassRes(resTier.k * z * this.dpr);
    const lod = z < 0.65 ? 0 : z < 0.85 ? 1 : 2;
    const wind = game.weather.wind, lean = game.weather.windLean;
    const px = game.player.x, py = game.player.y, R = this.sense.dispR || 600, R2 = R * R;
    const Z = this.Z;
    const thin = this.lowered >= 3 ? 4 : this.lowered >= 2 ? 2 : 1;
    const hd = this.stage && this.hd ? this.hd : null;
    let n = 0;
    this.grassBuilt = 0; this.grassT0 = performance.now();
    const WR = game.combat.wreck, gm = WR.grassPrep(left, top, right, bottom);   // 野外破坏：坑里沟里的草清掉、周围的压伏
    for (let cy = Math.floor((top - 10) / CHUNK); cy <= Math.floor((bottom + 60) / CHUNK); cy++) for (let cx = Math.floor((left - 40) / CHUNK); cx <= Math.floor((right + 40) / CHUNK); cx++) {
      if (!T.hasChunk(cx, cy)) continue;
      if (!this.groundOn && !T.getChunk(cx, cy, false)) continue;
      // 第三十步：魔道地界 / 阴地里的草是枯的（按块取一次地域）
      const zq = zoneAt((cx + 0.5) * CHUNK, (cy + 0.5) * CHUNK);
      const gs = zq.k > 0.45 ? (zq.t === 1 ? 2 : 3) : season;
      // P10：新块的草每帧最多生成一块（超过 2 毫秒就留到下一帧），飞越时不会一帧生成好几块
      let gl = T.peekGrass(cx, cy);
      if (!gl) { if (this.grassBuilt >= 1 || performance.now() - this.grassT0 > 2) continue; this.grassBuilt++; gl = T.getGrass(cx, cy); }
      for (const c of gl) {
        if (c.lod > lod) continue;
        // GPU 地表已有细密的手绘草丛：位图草只留较高、较显眼的几种，作为会摇、会分开的前景
        if (this.groundOn && (c.kind === 'sprig' || ((c.kind === 'tuft' || c.kind === 'clover') && c.ph > 1.6) || c.lod > 1)) continue;
        if (c.x < left - 40 || c.x > right + 40 || c.y < top - 5 || c.y > bottom + 60) continue;
        // v0.52.8 性能：低画质时按位置稀疏化草丛（按坐标散列抽稀，不会整片变秃）
        if (thin > 1 && ((c.x * 0.37 + c.y * 0.71 + c.v) % thin) >= 1) continue;
        let sq = 1;
        if (gm) { const f = WR.grassAt(c.x, c.y); if (f >= 2) continue; if (f > 0) sq = 1 - 0.72 * f; }
        const sp = grassSprite(c.kind, c.v, gs, res);
        const dx = c.x - px, dy = c.y - py;
        const d2 = dx * dx + dy * dy;
        let sk = wind * 0.12 * lean;
        if (d2 < R2) {
          // 全局风场：这一丛草此刻吃到的风力——阵风扫过时成片倒伏，过去了回正
          const gw = game.weather.gustAt(c.x, c.y, t);
          sk = gw * 0.2 * lean + (Math.sin(t * 1.7 + c.ph + c.x * 0.004) * 0.16 + Math.sin(t * 3.1 + c.ph * 2) * 0.05) * (0.3 + gw);
          // 人走过时草向两侧分开
          if (d2 < 3600) sk += (dx > 0 ? 1 : -1) * (1 - Math.sqrt(d2) / 60) * 0.5;
        }
        const s = c.s;
        if (hd) {
          // HD2D：草立成小立板（按屏幕位置剔除），摇摆量留在格子里
          const sw = Math.abs(sk) * s * sp.h * 0.5 + 2, l = -sp.ax * s - sw, r = -sp.ax * s + sp.w * s + sw, tt = -sp.ay * s - 2, bb = (sp.h - sp.ay) * s + 2;
          // 第五轮性能：草丛脚下的地面高度记在草丛上（地形不变，原来每帧每丛都现算一遍）；投影不另造对象
          const gc = c as typeof c & { _h?: number };
          if (gc._h === undefined) gc._h = hd.heightAt(c.x, c.y);
          hd.projectPoint(c.x, gc._h, c.y); const gx = hd.sx, gy = hd.sy;
          if (gx + r * z < -20 || gx + l * z > this.W + 20 || gy + tt * z > this.H + 20 || gy + bb * z < -20) continue;
          const imageLeft = -sp.ax * s - sk * s * sp.h * 0.5, imageTop = -sp.ay * s;
          const ss = this.grassSpr ??= { image: sp.canvas, l: 0, r: 0, t: 0, b: 0 }; ss.image = sp.canvas; ss.l = imageLeft; ss.r = imageLeft + sp.w * s; ss.t = imageTop; ss.b = imageTop + sp.h * s;   // allocStatic 只当场读这几项，不留着这个对象
          if (sq < 1) ss.t = ss.b - (ss.b - ss.t) * sq;   // 压伏：整丛压扁（脚下不动）
          if (hd.allocStatic(c.x, c.y, l, r, tt, bb, ss, false, 1, 1, undefined, true)) { n++; continue; }
          if (hd.atlasUsed() > 0.25) continue;   // 草最多占四分之一图集，人物、房屋优先
          const cell = hd.alloc(c.x, c.y, l, r, tt, bb, z * this.dpr);
          if (!cell) continue;
          ctx.setTransform(cell.Z, 0, 0, cell.Z, cell.ox, cell.oy);
          ctx.drawImage(sp.canvas, c.x - sp.ax * s - sk * s * sp.h * 0.5, c.y + (sp.h - sp.ay) * s - sp.h * s * sq, sp.w * s, sp.h * s * sq);
          n++;
          continue;
        }
        // 不再为每根草 setTransform（一帧三百多次状态切换，是显卡再好也会卡的元凶）：
        // 直接在已设好的世界变换里画，摇摆量折算成水平位移——草小，看不出与斜切的差别
        ctx.drawImage(
          sp.canvas,
          c.x - sp.ax * s - sk * s * sp.h * 0.5,
          c.y + (sp.h - sp.ay) * s - sp.h * s * sq,
          sp.w * s,
          sp.h * s * sq,
        );
        n++;
      }
    }
    this.stats.grass = n;
    if (hd) this.world();
    this.world();
  }

  private sfx: { x: number; y: number; vx: number; vy: number; r: number; vr: number; life: number; age: number; c: string; s: number; k: number }[] = [];
  private drawSeasonFx(dt: number, season: number, px: number, py: number, R: number) {
    const { ctx, game } = this;
    const wk = game.weather.kind as string;
    const ok = (wk === 'clear' || wk === 'cloudy') && season !== 3 && game.cam.zoom > 0.4;
    const wind = game.weather.wind;
    if (ok && dt > 0) {
      const rate = season === 2 ? 7 : season === 0 ? 6 : 2.5;
      let n = rate * dt;
      while (n > 0 && this.sfx.length < 70) {
        if (Math.random() > n) break; n -= 1;
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * R * 0.95;
        const C = season === 0 ? ['#f6c6d2', '#f9dde4', '#ffffff', '#efb0c2'] : season === 2 ? ['#d8902e', '#c0582a', '#e8b84a', '#a8402a'] : ['#fbfaf2'];
        this.sfx.push({ x: px + Math.cos(a) * d, y: py + Math.sin(a) * d - 120, vx: 20 + wind * 60, vy: season === 1 ? 6 : 26, r: Math.random() * 6, vr: (Math.random() - 0.5) * 4,
          life: 5 + Math.random() * 4, age: 0, c: C[(Math.random() * C.length) | 0], s: season === 2 ? 4 + Math.random() * 3 : 2.4 + Math.random() * 1.6, k: season });
      }
    }
    if (!this.sfx.length) return;
    const t = game.time;
    for (let i = this.sfx.length - 1; i >= 0; i--) {
      const f = this.sfx[i];
      f.age += dt;
      const sway = Math.sin(t * 1.8 + f.r * 3) * (f.k === 1 ? 14 : 26);
      f.x += (f.vx + sway) * dt; f.y += (f.vy + Math.cos(t * 2.3 + f.r) * 8) * dt; f.r += f.vr * dt;
      const dd = Math.hypot(f.x - px, f.y - py);
      if (f.age > f.life || dd > R * 1.05) { this.sfx.splice(i, 1); continue; }
      const a = Math.min(1, f.age * 2, (f.life - f.age) * 0.8, (R - dd) / 60);
      ctx.globalAlpha = Math.max(0, a) * 0.9;
      ctx.fillStyle = f.c;
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.r);
      const flip = Math.abs(Math.cos(t * 3 + f.r * 2));
      ctx.scale(1, 0.25 + flip * 0.75);
      ctx.beginPath();
      if (f.k === 2) { // 叶：两头尖
        ctx.moveTo(-f.s, 0); ctx.quadraticCurveTo(0, -f.s * 0.7, f.s, 0); ctx.quadraticCurveTo(0, f.s * 0.7, -f.s, 0);
      } else if (f.k === 0) { // 花瓣：一端圆一端尖
        ctx.moveTo(-f.s, 0); ctx.quadraticCurveTo(-f.s * 0.2, -f.s * 0.9, f.s, -f.s * 0.15); ctx.quadraticCurveTo(f.s * 0.6, f.s * 0.5, -f.s, 0);
      } else { // 柳絮：一团软毛
        ctx.arc(0, 0, f.s * 0.8, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * HD2D：按排好的顺序把每一项画进工作画布。有脚底位置与范围（hx / hb）的立成立板：分一个图集格，
   * 把 world() 的变换换成「世界 → 该格」，原绘制闭包一行不改直接画进去；其余画进地贴（贴在地面上）。
   */
  /** r9：取景期间挡人的大件此刻淡到几成（键：立板脚下的位置），渐隐 / 渐显；上一帧的时刻 */
  private occA = new Map<string, number>();
  private occAt = 0; private occDt = 0;
  /** r9：撼山客出招取景期间要「看穿」的人在画面上的框 [中心 x, 头顶 y, 脚底 y, 半宽, 纵深]；取景结束后还有没淡回来的也返回（空框，往回淡） */
  private occShot(hd: HdScene): [number, number, number, number, number][] | null {
    if (!this.occA) this.occA = new Map();   // 测试里用 Object.create 造的渲染器没走字段初始化
    const now = performance.now(); this.occDt = this.occAt ?Math.min(0.1, (now - this.occAt) / 1000) : 0.016; this.occAt = now;
    const who = this.game.combat?.brawl?.shotWho, out: [number, number, number, number, number][] = [];
    if (who) {
      const u = hd.upDir, p = this.game.player;
      for (const w of who) {
        const x = w === 'p' ? p.x : w.x, y = w === 'p' ? p.y : w.y, z = w === 'p' ? p.z + this.game.combat.brawl.playerLift : w.z;
        try { const q0 = hd.project(x, y, z), q1 = hd.project(x, y, z + 165), hgt = Math.abs(q0.y - q1.y); out.push([q0.x, q1.y, q0.y, hgt * 0.42, x * u.x + y * u.y]); } catch { /* 镜头还没好 */ }
      }
    }
    return who || this.occA.size ? out : null;
  }
  /** r9：这一件大件此刻的透明度（挡着取景里的人：渐隐到两成多；不挡了：渐显回来） */
  private occFadeOf(hx: number, fy: number, depth: number, x0: number, x1: number, y0: number, y1: number, boxes: [number, number, number, number, number][]): number {
    let want = 1;
    for (const [cx, top, bot, half, d] of boxes) {
      if (depth >= d - 20) continue;
      const ox = Math.min(x1, cx + half) - Math.max(x0, cx - half), oy = Math.min(y1, bot) - Math.max(y0, top);
      if (ox > 0 && oy > 0 && ox * oy > 0.22 * (2 * half) * (bot - top)) { want = 0.4; break; }   // r9：真挡住两成以上才淡、淡到四成（淡到两成时树没了、影子还在地上，看着是一根根飘着的黑棍）
    }
    const key = `${Math.round(hx)},${Math.round(fy)}`, cur = this.occA.get(key) ?? 1, dt = this.occDt;
    const next = want < cur ? Math.max(want, cur - dt * 5) : Math.min(want, cur + dt * 2.5);
    if (next >= 0.999) this.occA.delete(key); else this.occA.set(key, next);
    return next;
  }
  private drawListHD(list: Drawable[], hd: HdScene) {
    this.characterWorkers ??= new CharacterWorkerFrames(characterFrames);
    // 人物贴图的清晰度上限：画面里人少就给足（拉近、高分屏上不糊），人多就收着（人物图集只有那么大）
    // （人数取上一帧实际画出来的人物数——只算画面里的，不算远处没进镜头的）
    { const people = Math.max(this.characterWorkers.uses, characterFrames.uses), cap = people <= 10 ? 2 : people <= 26 ? 1.4 : 1;
      this.characterWorkers.maxRes = cap; characterFrames.maxRes = cap; this.characterWorkers.uses = 0; characterFrames.uses = 0; }
    this.characterWorkers.beginFrame();
    const packStart = prof.t();
    const ctx = this.ctx, dx = hd.decalXf(), z = this.game.cam.zoom, W = this.W, H = this.H, M = 40;
    // 立板面向相机：板上的局部偏移 (fx, fy) 到屏幕就是 脚底投影 + (fx, fy)·z。据此只把落在屏幕里的那一截画进图集，
    // 按屏幕像素的清晰度画——拉近时整座大山也只占一屏的图集面积，不必为了装下它把所有东西都降成糊的。
    // 挡在主角前面的大件（山、树、房、墙）淡成半透明，和经典 2D 里房屋的透视一样。
    const p = this.game.player, ps = hd.ground(p.x, p.y), u = hd.upDir, pd = p.x * u.x + p.y * u.y;
    const pcx = ps.x, pcy = ps.y - 70 * ps.s;
    type V = { d: Drawable; l: number; r: number; t: number; b: number; fy: number; air: boolean; a: number; k: number; slot: number; layered: boolean; overlay?: (g: CanvasRenderingContext2D) => void;
      underSlot?: number; underlay?: (g: CanvasRenderingContext2D) => void };
    // 山、瀑布这类大布景按俯视斜角画成，竖向跨度本来对应地面距离：整体按地面纵深压缩比等比缩小，
    // 与 2D 构图一致（不会盖住原本不盖的地方），长宽一起缩，画不变形
    const fs = hd.foreshorten;
    const vis: (V | Drawable)[] = [];
    let area = 0, heroArea = 0, actorArea = 0;
    // r9：撼山客出招取景期间（brawl.shotWho），挡在镜头和他俩之间的树、房、墙渐隐成半透明（只在取景期间；不再靠出招前放倒一片树）
    const shot = this.occShot(hd);
    let vIdx = 0;
    for (const d of list) {
      if (d.hx === undefined || !d.hb) { vis.push(d); continue; }
      // zk：该立板脚下的局部缩放（透视相机下近大远小），屏幕裁剪按它算
      // groundAt 把结果留在 hd.sx / sy / ss 上（不另造对象：一屏几千个立板，每帧几千个小对象）
      const fy = d.hy ?? d.y; hd.groundAt(d.hx, fy);
      const sx = hd.sx, sy = hd.sy, k = BACKDROP.has(d.k ?? '') ? fs : 1, zk = hd.ss * k;
      const l = Math.max(d.hb[0], (-M - sx) / zk), r = Math.min(d.hb[1], (W + M - sx) / zk);
      const t = Math.max(d.hb[2], (-M - sy) / zk), b = Math.min(d.hb[3], (H + M - sy) / zk);
      if (r <= l || b <= t) continue;
      let a = 1;
      if (OCCLUDERS.has(d.k ?? '') && d.hx * u.x + fy * u.y < pd - 20 && pcx > sx + l * zk && pcx < sx + r * zk && pcy > sy + t * zk && pcy < sy + b * zk) a = 0.38;
      if (shot && (OCCLUDERS.has(d.k ?? '') || d.k === 'D·地面小景') && !BACKDROP.has(d.k ?? '')) a = Math.min(a, this.occFadeOf(d.hx, fy, d.hx * u.x + fy * u.y, sx + l * zk, sx + r * zk, sy + t * zk, sy + b * zk, shot));
      // 优化：复用 V 对象池，避免每帧上千个短命对象
      let v = this._vPool[vIdx];
      if (!v) { v = { d, l, r, t, b, fy, air: d.y - fy > 100000, a, k, slot: -1, layered: false }; this._vPool[vIdx] = v; }
      else { v.d = d; v.l = l; v.r = r; v.t = t; v.b = b; v.fy = fy; v.air = d.y - fy > 100000; v.a = a; v.k = k; v.slot = -1; v.layered = false; v.overlay = undefined; v.underSlot = undefined; v.underlay = undefined; }
      vIdx++;
      vis.push(v);
      const ar = (r - l) * (b - t) * k * k; area += ar;
      // r14：人物（主角另算）单独记面积。分层缓存的人物（staticLayers）位图进人物图集、不占这里的动态图集，不算
      if (d.k === 'D·主角') heroArea += ar; else if (ACTORS.has(d.k ?? '') && !d.staticLayers && !d.staticSprite) actorArea += ar;
    }
    // 透视相机下画面下方离镜头更近、显得更大：位图多留两成清晰度
    const full = z * this.dpr * (hd.persp ? 1.2 : 1), room = hd.atlasFree() * 0.85;
    // r14「人物糊」：以前所有立板共用一个清晰度——满屏的树、房子把图集面积占满，主角和路人跟着一起降到屏幕所需的四成上下（拉近时放大两三倍，糊）。
    // 现在主角先拿（最多两成五图集）、其余人物再拿（最多三成五），剩下的给景物；景物按原来的算法在剩下的面积里分
    const heroScale = Math.min(full, Math.sqrt(room * HERO_ROOM / Math.max(1, heroArea)));
    const baseScale = Math.min(full, Math.sqrt(room / Math.max(1, area)));
    const actorScale = Math.max(baseScale, Math.min(full, Math.sqrt(room * ACTOR_ROOM / Math.max(1, actorArea))));
    const restArea = Math.max(1, area - heroArea - actorArea), restRoom = Math.max(room * 0.3, room - heroArea * heroScale * heroScale - actorArea * actorScale * actorScale);
    const scale = Math.min(baseScale, Math.sqrt(restRoom / restArea)) || baseScale;
    const scaleOf = (d: Drawable) => d.k === 'D·主角' ? heroScale : ACTORS.has(d.k ?? '') ? actorScale : scale;
    // 先给人物分格、再给景物：真不够时宁可景物糊或缺，人物（尤其主角）必须在
    const ordered: (V | Drawable)[] = [], occ: (V | Drawable)[] = [];
    for (const v of vis) ('fy' in v && OCCLUDERS.has(v.d.k ?? '') ? occ : ordered).push(v);
    for (const v of occ) ordered.push(v);
    const requests: HdAllocRequest[] = [], seqBase = hd.items.length;
    let extraSlots = Math.max(0, MAX_BB - seqBase - vIdx);
    for (let i = 0; i < ordered.length; i++) {
      const v = ordered[i];
      if (!('fy' in v)) continue;
      // 缓存位图（人物等）的清晰度按档位走，不吃透视那两成余量：否则每张位图大一倍，静态图集装不下，
      // 装不下的人会退回主线程逐帧重画（实测 1080p 缩放扫描里每帧有 10 个人因此回退）
      const seq = seqBase + i, layers = v.d.staticLayers?.(scale * v.k / (hd.persp ? 1.2 : 1));
      if (layers) {
        const count = hd.items.length;
        const extra = layers.sprites.length + (layers.overlay ? 1 : 0) + (layers.underlay ? 1 : 0) - 1;
        let packed = extra <= extraSlots;
        // 同一个人的各层按 垫层 → 静态层 → 叠层 排在同一个整数序号之内
        const parts = layers.sprites.length + 3;
        for (let layer = 0; packed && layer < layers.sprites.length; layer++) {
          if (!hd.allocStatic(v.d.hx!, v.fy, v.l, v.r, v.t, v.b, layers.sprites[layer], v.air, v.a, v.k, seq + (layer + 1) / parts)) packed = false;
        }
        if (prof.on) prof.addMs(packed ? 'R·人物静态立板成功' : 'R·人物静态立板回退', 0, 1);
        if (packed) {
          extraSlots -= extra; v.layered = true;
          if (layers.underlay) {
            const b = layers.underlay.bounds, l = Math.max(v.l, b[0]), r = Math.min(v.r, b[1]), t = Math.max(v.t, b[2]), bottom = Math.min(v.b, b[3]);
            if (r > l && bottom > t) {
              v.underSlot = requests.length; v.underlay = layers.underlay.draw;
              requests.push({ x: v.d.hx!, y: v.fy, l, r, t, b: bottom, scale: scaleOf(v.d) * v.k, air: v.air, alpha: v.a, k: v.k, seq, priority: 0 });
            }
          }
          if (layers.overlay) {
            const b = layers.overlay.bounds, l = Math.max(v.l, b[0]), r = Math.min(v.r, b[1]), t = Math.max(v.t, b[2]), bottom = Math.min(v.b, b[3]);
            if (r > l && bottom > t) {
              v.slot = requests.length; v.overlay = layers.overlay.draw;
              requests.push({ x: v.d.hx!, y: v.fy, l, r, t, b: bottom, scale: scaleOf(v.d) * v.k, air: v.air, alpha: v.a, k: v.k,
                seq: seq + (parts - 1) / parts, priority: 0 });
            }
          }
          continue;
        }
        hd.items.length = count;
      }
      const sprite = v.d.staticSprite?.();
      // 单张的静态立板都是景物（树、小景、城中小件），放景物图集；人物的分层位图在上面走人物图集
      if (sprite && hd.allocStatic(v.d.hx!, v.fy, v.l, v.r, v.t, v.b, sprite, v.air, v.a, v.k, seq, true)) continue;
      v.slot = requests.length;
      requests.push({ x: v.d.hx!, y: v.fy, l: v.l, r: v.r, t: v.t, b: v.b,
        scale: scaleOf(v.d) * v.k, air: v.air, alpha: v.a, k: v.k, seq, priority: v.d.k === 'D·主角' ? 1 : 0, add: v.d.add });
    }
    const slots = hd.allocBatch(requests);
    prof.add('R·HD立板打包', packStart);
    let missing = 0;
    for (const v of ordered) {
      if ('fy' in v) {
        if (v.layered) {
          v.d.afterStatic?.();
          if (v.underlay && v.underSlot !== undefined) {
            const cell = slots[v.underSlot];
            if (!cell) missing++;
            else {
              this.Z = cell.Z; this.ox = cell.ox; this.oy = cell.oy;
              ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.beginPath(); ctx.rect(cell.clip[0], cell.clip[1], cell.clip[2], cell.clip[3]); ctx.clip(); this.world();
              if (prof.on) { const start = performance.now(); v.underlay(ctx); prof.add('D·人物动态状态', start); }
              else v.underlay(ctx);
              ctx.restore();
            }
          }
          if (v.overlay && v.slot >= 0) {
            const cell = slots[v.slot];
            if (!cell) missing++;
            else {
              this.Z = cell.Z; this.ox = cell.ox; this.oy = cell.oy;
              ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.beginPath(); ctx.rect(cell.clip[0], cell.clip[1], cell.clip[2], cell.clip[3]); ctx.clip(); this.world();
              if (prof.on) { const start = performance.now(); v.overlay(ctx); prof.add('D·人物动态状态', start); }
              else v.overlay(ctx);
              ctx.restore();
            }
          }
          continue;
        }
        const c = v.slot < 0 ? null : slots[v.slot];
        if (v.slot >= 0 && !c) missing++;
        if (c) {
          this.Z = c.Z; this.ox = c.ox; this.oy = c.oy;
          ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.beginPath(); ctx.rect(c.clip[0], c.clip[1], c.clip[2], c.clip[3]); ctx.clip();
          this.world();
          if (prof.on) { const start = performance.now(); v.d.draw(ctx); prof.add(v.d.k ?? 'D·其他', start); }
          else v.d.draw(ctx);
          ctx.restore();
        }
        continue;   // 图集实在装不下就这一帧不画，绝不平贴到地上（平贴的会跟着地面转）
      }
      this.Z = dx.Z; this.ox = dx.ox; this.oy = dx.oy;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.beginPath(); ctx.rect(0, 0, hd.decalW, hd.decalH); ctx.clip(); this.world();
      if (prof.on) { const start = performance.now(); v.draw(ctx); prof.add(v.k ?? 'D·其他', start); }
      else v.draw(ctx);
      ctx.restore();
    }
    if (prof.on) {
      prof.addMs('R·动态立板请求', 0, requests.length);
      prof.addMs('R·动态立板未分配', 0, missing);
    }
    this.characterWorkers.endFrame();
    this.Z = dx.Z; this.ox = dx.ox; this.oy = dx.oy; this.world();
  }
  /** 设回世界变换 */
  private world() {
    this.ctx.setTransform(this.Z, 0, 0, this.Z, this.ox, this.oy);
  }

  layout(l: LocDef) {
    let L = this.layouts.get(l.id);
    if (!L) { L = getLayout(l); this.layouts.set(l.id, L); }
    return L;
  }

  // ---------------------------------------------------------------- 主渲染
  /** v0.52.5：换场景 / 读档 / 瞬移后调用，清掉静止跳画和世界层纹理沿用状态，强制下一帧完整重画重传。 */
  /** 换了地图：凡是按位置、按地点缓存的东西全部作废（地面网格、建筑、城镇布局、山形、瀑布、地名牌、飘云、粒子） */
  onMapChanged(carry?: { dx: number; dy: number }) {
    this.layouts.clear(); this.mtnMeta.clear(); this.fallMeta.clear(); this.labelCache.clear();
    this.overlay = null; this.overlayKey = ''; this.gBake = null;
    for (const T of this.paveCache.values()) T.c.width = T.c.height = 0; this.paveCache.clear();   // 收官返工 3：村镇铺装的块
    // carryDy：飞过交界中线的换图——眼前的地面是同一片，只差平移：地面网格、粒子、飘云都原样挪过去，不清
    if (carry) { for (const q of this.particles) { q.x += carry.dx; q.y += carry.dy; } for (const c of this.driftClouds) { c.x += carry.dx; c.y += carry.dy; } this.hd?.shiftTerrain(carry.dx, carry.dy, CHUNK); return; }
    this.particles.length = 0; this.driftClouds.length = 0;
    this.hd?.invalidateTerrain();
    this.resetStill();
  }
  resetStill() {
    this.stillFrames = 0; this.skipSceneNow = false; this.lastStillZ = -1;
    this.stillCam.x = NaN; this.stillCam.y = NaN;
    const st = this.stage as any; if (st) { st.sceneUp = false; }
  }
  /** v0.52.7：视野内是否还有「会动的东西」——路人、伴侣、灵宠、妖兽、飞剑。
   *  只要有一个，世界层就不能靠上一帧的纹理糊过去，否则人在走、画面却定住了。 */
  private liveInView(camX: number, camY: number, vw: number, vh: number) {
    const g = this.game;
    const hw = vw / 2 + 240, hh = vh / 2 + 320;
    for (const a of g.npcs.active.values()) {
      if (!a.d.alive) continue;
      const s = a.st;
      if (Math.abs(s.x - camX) < hw && Math.abs(s.y - camY) < hh) return true;
    }
    const pe = g.pets?.ent;
    if (pe && Math.abs(pe.x - camX) < hw && Math.abs(pe.y - camY) < hh) return true;
    for (const e of g.combat?.enemies ?? []) {
      if (!e.dead && Math.abs(e.x - camX) < hw && Math.abs(e.y - camY) < hh) return true;
    }
    return false;
  }
  render(dt: number) {
    const t0 = performance.now();
    textCacheTick();
    let _p = prof.t();
    // let：HD2D 模式下本帧前半段要换成立板工作画布；绘制闭包按引用捕获 ctx，换了也跟着走
    let ctx = this.ctx; const game = this.game;
    this.adapt(dt);
    // 帧预算：按近期帧时间 EMA 收紧或放宽装饰预算
    this.frameBudget.begin(LOD.emaMs());
    if (!sprites.unlimited) sprites.frameMs = game.time < 2 ? 28 : 7; // 开场预热：多生成一些位图
    sprites.beginFrame(); grassFrame();
    if (this.seasonCache) this.pumpTreeWarm();
    tickBld2(dt);
    const z = game.cam.zoom;
    resTier.update(z * this.dpr, dt);
    const W = this.W, H = this.H, dpr = this.dpr;
    this._sceneW = W; this._sceneH = H;
    const GL = !!this.stage && !this.stage.lost;
    const hd = GL && this.hd ? this.hd : null, worldCtx = this.ctx;
    if (!hd) this.releaseCharacterWorkers();   // 立体的秘境也用人物绘制线程：这里要是每帧放掉，下面又每帧重建，页面几秒就卡死
    const ui = GL ? this.uiCtx : ctx;
    const t = game.time;
    const season = game.season as Season;
    // 树片金字塔：每帧重置状态（decoRevision 用 frame 代替）
    this.treePatches.beginFrame(game.terrain, season, game.terrain.frame);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    // 统一用 low：medium 会在每次缩放采样时走更贵的重采样核，实测同一场景 CPU 光栅要多花两成多，
    // 而水墨画风对这点锐度差异几乎无感（世界层本来就是近似 1:1 绘制）
    ctx.imageSmoothingQuality = 'low';
    // v0.54：身在秘境——另走一条精简管线（不画大地图的地表、山树、城镇、天气）
    this.hdTarget = null;
    if (!game.mijing.active && this.realmCache) { this.realmCache = null; hd?.invalidateTerrain(); hd?.hideRealm(); }   // 出了秘境：它的地面、墙不能留在外面的世界里
    if (game.mijing.active) {
      // 秘境不走下面的正常管线；UI 层仍要清一次，避免把上一步的月/地名留在画面上
      if (GL) { ui.setTransform(1, 0, 0, 1, 0, 0); ui.clearRect(0, 0, this.domCanvas.width, this.domCanvas.height); }
      // 立体画面里秘境也是立体的；着色器、画布任何一样没备好就退回平面的老画法
      if (hd && GL && this.fx && typeof document !== 'undefined') { try { this.renderRealmHD(dt, hd); return; } catch (e) { if (!this.realmWarned) { this.realmWarned = true; console.warn('[秘境] 立体画法出错，退回平面', e); } } }
      // 一开始就走平面画法（没有特效层等）：平面秘境不用人物绘制线程，放掉线程和它占着的位图。
      // 立体画法出错退回平面的那一帧不放（下一帧还会再试立体，每帧放了又建会卡死）
      else this.releaseCharacterWorkers();
      this.renderRealm(dt, GL); return;
    }
    // 身在虚空：界内的一切都不画，只画星渊与诸界
    if (hd && game.xukong.inVoid && !game.xukong.warming) {
      // 虚空里斗法：镜头拉到位以后换成界内那一套画法，背景垫虚空的画面
      if (game.xukong.fight.handed && this.fx) { try { this.renderVoidArena(dt, hd); return; } catch (e) { if (!this.arenaWarned) { this.arenaWarned = true; console.warn('[虚空斗法] 立体画法出错', e); } } }
      this.renderXukong(dt, hd); return;
    }
    const T0 = game.terrain;
    if (GL && this.groundWanted && !this.groundSet && T0.land) { this.stage!.setTerrain(T0.glData()); this.groundSet = true; }
    const GROUND = !hd && GL && this.groundWanted && this.stage!.groundReady;
    this.groundOn = GROUND;
    // ---------- 静止跳画 ----------
    // 镜头没动、没有粒子/敌人/天象、主角站定、也没有界面弹出 → 世界层这一帧画出来跟上一帧一模一样。
    // 连续 2 帧都是这样，就整块跳过（不画、不上传），GPU 继续用上一张纹理，只跑后期 + UI 层。
    // 一旦有任何变化（走一步、放个技能、天黑了一点）立刻恢复，玩家无感。
    {
      const pl = game.player;
      const camB = game.cam;
      // 判定要严：镜头、主角、敌人、宠物、粒子、天气、时辰，任何一样在变都不跳过
      const camStill = Math.abs(camB.x - this.stillCam.x) < 0.3 && Math.abs(camB.y - this.stillCam.y) < 0.3;
      // 只有「视野内、活着、且在追你」的敌人才算动态；地图另一头的怪不该让全世界每帧重画
      const vw = this.W / (game.cam.zoom || 1), vh = this.H / (game.cam.zoom || 1);
      const nearFoe = !!game.combat?.enemies?.some((e) => !e.dead && e.aggro
        && Math.abs(e.x - camB.x) < vw && Math.abs(e.y - camB.y) < vh);
      // v0.52.7：站着不动 ≠ 世界不动。视野里只要有活物（路人、伴侣、灵宠、妖兽），
      // 它就是在走、在呼吸、在摇扇子，世界层必须继续重画；否则别人看着所有行人一起定格。
      const live = this.liveInView(camB.x, camB.y, vw, vh) || !!modx?.animating;   // 模组在画会动的东西，也不能跳帧
      this.liveNow = live;
      const wth = game.weather;
      const badWeather = !!wth && wth.kind !== 'clear' && wth.k > 0.04;
      const still = GL && camStill && !pl.moving && !pl.flying && !(pl as any).attacking
        && !this.particles.length && !game.tianxiang.active
        && !nearFoe && !live && !badWeather
        && !game.combat?.fxq?.length && game.cam.zoom === this.lastStillZ
        && this._sceneW === this.W && this._sceneH === this.H;
      // 调试：HUD 里能看到当前是否在跳帧
      (globalThis as any).__still = { camStill, moving: pl.moving, fly: !!pl.flying, parts: this.particles.length, zoom: game.cam.zoom, lastStillZ: this.lastStillZ, frames: this.stillFrames };
      this.stillFrames = still ? this.stillFrames + 1 : 0;
      this.lastStillZ = game.cam.zoom;
      // 即便判定「静止」，每 4 帧也真画一帧：草在摇、树在摆、炊烟在散，
      // 全冻住的话玩家会觉得世界停了（这与「角色卡住」是同一类体感问题）。
      // 设备吃紧（已自动降过档）且只是站在人群里看人走路时，改按 30fps 重绘世界层：
      // 行人动作仍然连贯，世界层开销减半；一旦自己走动/镜头移动立刻恢复满帧。
      const weak = this.lowered >= 2;   // 只在降过两档以上的弱机上才开半帧率
      const halfRate = weak && !still && camStill && !pl.moving && !pl.flying && !(pl as any).attacking
        && !game.tianxiang.active && !this.particles.length;
      // 只有 WebGL 合成（纹理还在显存里）才能「不画世界层」，否则画布上什么都没有
      // 静止跳过只在「已经降过两档」的机器上生效：正常机器站着不动也必须满帧，
      // 否则草树摇摆一跳一跳，玩家会当成卡顿（正常机器降到 0 档时这条永远不触发）。
      const canSkipScene = this.lowered >= 2;
      this.skipSceneNow = !hd && GL && ((canSkipScene && this.stillFrames >= 2 && this.stillFrames % 4 !== 0) || (halfRate && (game.frameNo & 1) === 1));
      this.stillCam.x = camB.x; this.stillCam.y = camB.y;
      (globalThis as any).__skipN = ((globalThis as any).__skipN || 0) + (this.skipSceneNow ? 1 : 0);
      (globalThis as any).__drawN = ((globalThis as any).__drawN || 0) + 1;
      const S = (globalThis as any).__sk || ((globalThis as any).__sk = {});
      S.GL = GL; S.skip = this.skipSceneNow; S.camStill = camStill; S.moving = !!pl.moving; S.fly = !!pl.flying; S.atk = !!(pl as any).attacking;
      S.parts = this.particles.length; S.tx = !!game.tianxiang.active; S.enemy = !!game.combat?.enemies?.some((e) => !e.dead);
      S.fxq = game.combat?.fxq?.length || 0; S.zoomSame = game.cam.zoom === this.lastStillZ; S.size = (this._sceneW === this.W && this._sceneH === this.H);
      S.live = this.liveNow; S.paused = !!game.paused; S.modal = !!game.modal; S.dead = !!game.hero?.dead; S.keys = [...(game.input?.keys || [])].join(',');
      // 氛围层半速：只在自己没走动、镜头没动、天气晴好的时候省；人群走动不影响云影
      this.atmoStep = this.atmoReady && camStill && !pl.moving && !pl.flying && !(pl as any).attacking ? 2 : 1;
      this.atmoSkipNow = this.atmoStep === 2 && (game.frameNo & 1) === 1 && !this.skipSceneNow;
    }
    if (GROUND || hd) ctx.clearRect(0, 0, W, H);
    else { ctx.fillStyle = '#e9dfc6'; ctx.fillRect(0, 0, W, H); }

    const sh = (this.sense.alarm > 0.3 ? (this.sense.alarm - 0.3) * 5 : 0) / z;
    // 震屏：创伤值平方 × 平滑噪声（随时间连续，不抖成白噪）
    const tr = game.trauma, tk = tr * tr * 15 / z, rt = performance.now() / 1000;
    const camX = game.cam.x + (sh ? Math.sin(game.time * 47) * sh : 0) + (tk ? (Math.sin(rt * 41.3) + Math.sin(rt * 67.1) * 0.5) * tk : 0);
    const camY = game.cam.y + (sh ? Math.cos(game.time * 53) * sh : 0) + (tk ? (Math.cos(rt * 37.7) + Math.sin(rt * 59.3) * 0.5) * tk : 0);
    let left = camX - W / 2 / z, top = camY - H / 2 / z, right = camX + W / 2 / z, bottom = camY + H / 2 / z;
    this.Z = z * dpr; this.ox = W * dpr / 2 - camX * this.Z; this.oy = H * dpr / 2 - camY * this.Z;
    this.world();
    if (hd) {
      // HD2D：相机就位；可见范围改为屏幕四角在地面上的外接矩形（倾斜 / 旋转后不再是轴对齐的屏幕框）；
      // 从这里到场景渲染前，所有 2D 绘制都进立板工作画布：先是地贴区域
      hd.yaw = game.camYaw;
      { const w = game.flyBaseW; hd.cruiseW = w > 0.001 && game.flyBase === game.flyBase ? w : 0; hd.cruiseBase = game.flyBase; }   // 御剑巡航：镜头盯平滑过的高度
      hd.begin(camX, camY, z, dpr);
      hd.setGpuGround(GROUND);
      game.npcs.labelsInUi = true;   // 返工：界内立体画法里 NPC 名牌画在界面层（别的画法照旧画进人物立板）   // GPU 地表在后期里按斜视角采样垫在底下；没有时才用 Canvas 地形块
      if (GROUND) hd.syncGround([], CHUNK);
      const gb = hd.groundBounds(320);
      // 借鉴 taixu071：远景时 HD2D 透视相机的地面投影比 2D 正交范围小很多，
      // 导致缩放远后加载范围不够。当 z < 0.35 时，取两者并集扩大加载区域。
      // 性能由已有 LOD 系统保障：树片金字塔(z<0.19)、代表树(z<0.25)、哈希剔除、
      // 地形预览块、FrameBudget 门控——远处多加载的内容都是低开销的。
      if (z < 0.35) {
        const ortho2d_l = camX - W / 2 / z, ortho2d_t = camY - H / 2 / z;
        const ortho2d_r = camX + W / 2 / z, ortho2d_b = camY + H / 2 / z;
        left = Math.min(gb.l, ortho2d_l); top = Math.min(gb.t, ortho2d_t);
        right = Math.max(gb.r, ortho2d_r); bottom = Math.max(gb.b, ortho2d_b);
      } else {
        left = gb.l; top = gb.t; right = gb.r; bottom = gb.b;
      }
      ctx = this.ctx = hd.wctx;
      const x = hd.decalXf(); this.Z = x.Z; this.ox = x.ox; this.oy = x.oy; this.world();
    }
    const T = game.terrain;
    T.season = season;

    prof.add('R·准备', _p); _p = prof.t();
    // 静止：世界层整块跳过。注意地面是 GPU 地表（在后期里按世界坐标实时采样），
    // 所以只要不重画世界层、光照参数照旧，画面与上一帧完全一致。
    if (this.skipSceneNow) {
      // 光照参数与上一帧相同（世界没变），直接复用上一帧算好的值
      const L = this.lastLight;
      this.postGL(camX, camY, z, W, H, L.night, L.dusk, L.gloom, L.dayK, L.mul, this.sense.dispR, false);
      return;
    }
    // 只有真正要重画时才清 UI 层：静止跳帧时保留上一帧的月/地名/文字，
    // 否则清完直接 return，会看到月亮和「青霞谷」这类文字每 4 帧闪一次。
    if (GL) { ui.setTransform(1, 0, 0, 1, 0, 0); ui.clearRect(0, 0, this.domCanvas.width, this.domCanvas.height); }
    // ---------- 1. 底图分块（GPU 地表开启时跳过）----------
    const cx0 = Math.floor(left / CHUNK), cx1 = Math.floor(right / CHUNK);
    const cy0 = Math.floor(top / CHUNK), cy1 = Math.floor(bottom / CHUNK);
    if (!GROUND) {
    let builds = 0;
    const maxBuilds = this.pendingBuilds > 0 ? 3 : 5;
    const order = planTerrainChunks({ left, top, right, bottom }, camX, camY, game.player.st.vx, game.player.st.vy, CHUNK, WORLD_W, WORLD_H, (cx, cy) => T.hasChunk(cx, cy));
    T.setChunkView(order);
    const background = terrainChunkJobs(T).request(order);
    let missing = 0;
    // P10：预览块按时间限量。最远镜头（0.13）御剑横穿宗门时，一帧里新露出来的地块有几十上百块，
    // 原来每块都当场算一张 12×12 的预览（144 次取色 + 建画布），一帧四五十毫秒、连着几十帧；
    // 现在一帧最多花 3 毫秒（按 order 的先后，近处、前进方向的先做），剩下的下一帧接着做——反正地块网格一帧也只建六块
    const previewUntil = performance.now() + 3;
    const hdChunks: { cx: number; cy: number; canvas: HTMLCanvasElement }[] = [];
    for (const { cx, cy, visible } of order) {
      if (background && !visible) continue;
      let ch = T.getChunk(cx, cy, false);
      if ((!ch || ch.preview || ch.season !== T.season) && !background && builds < maxBuilds) { const q = prof.t(); ch = T.getChunk(cx, cy, true); builds++; prof.add('R┊地块现建', q); }
      if (!ch && background && visible && (!hd || performance.now() < previewUntil)) { const q = prof.t(); ch = T.previewChunk(cx, cy); prof.add('R┊地块预览', q); }
      if (!ch || ch.preview || ch.season !== T.season) missing++;
      if (ch && visible) { if (hd) hdChunks.push(ch); else ctx.drawImage(ch.canvas, cx * CHUNK - 0.6, cy * CHUNK - 0.6, CHUNK + 1.2, CHUNK + 1.2); }
    }
    if (hd) { const q = prof.t(); hd.syncGround(hdChunks, CHUNK); prof.add('R┊地块网格', q); }
    this.pendingBuilds = missing;
    } else this.pendingBuilds = 0;
    prof.add('R┊底图分块(含于底图水面)', _p, 0);   // 收官 P7：拆开计时，分清是建地块还是画水波

    // ---------- 2. 水波（GPU 地表自带流水、浪花、粼光）----------
    // LOD 波段平滑：水面波纹在 z∈[0.33,0.38] 渐显，避免硬切跳变
    { const waterK = LOD.k(LOD.BAND.water, z);
      if (waterK > 0.01 && !GROUND && !game.jueyu.seaOwnsWater) {
        const prevAlpha = ctx.globalAlpha;
        if (waterK < 0.99) ctx.globalAlpha *= waterK;
        this.drawWater(left, top, right, bottom, t);
        ctx.globalAlpha = prevAlpha;
      }
    }
    // ---------- 2b. 草丛 ----------
    // 第十九步：原设名地的地面贴花（熔岩湖、血潭、白玉广场……）
    prof.add('R·底图水面', _p); _p = prof.t();
    game.landmarks.drawGround(ctx, { left, top, right, bottom }, z, dpr, t);
    // 野外破坏（world/wreck.ts）：镜头方向给它（倒树的姿势要按屏幕横、纵分解），坑、沟、龟裂画进地贴
    const WR = game.combat.wreck;
    { const V = WR.view; if (hd) { const rd = hd.rightDir, ud = hd.upDir; V.rx = rd.x; V.ry = rd.y; V.ux = ud.x; V.uy = ud.y; V.fs = hd.foreshorten; } else { V.rx = 1; V.ry = 0; V.ux = 0; V.uy = -1; V.fs = 1; } }
    WR.drawGround(ctx, left, top, right, bottom);
    prof.add('R·名地地面', _p); _p = prof.t();
    // LOD 波段平滑：草丛在 z∈[0.40,0.46] 渐显
    { const grassK = LOD.k(LOD.BAND.grass, z);
      if (grassK > 0.01) {
        const prevAlpha = ctx.globalAlpha;
        if (grassK < 0.99) ctx.globalAlpha *= grassK;
        this.drawGrass(left, top, right, bottom, t, season, z);
        ctx.globalAlpha = prevAlpha;
      }
    }
    prof.add('R·草', _p); _p = prof.t();

    // ---------- 3. 收集装饰 ----------
    // GC 优化：复用数组，避免每帧 new Array
    const list = this._drawList; list.length = 0;
    const reflect = this._drawReflect; reflect.length = 0;
    const prefetch = this._drawPrefetch; prefetch.length = 0;
    // 优化：弱机（降过 2 档以上）提前切到更保守的 LOD——远处的树更早跳过
    const lodMax = this.lowered >= 2
      ? (z < 0.4 ? 0 : z < 0.6 ? 1 : 2)
      : (z < 0.3 ? 0 : z < 0.45 ? 1 : 2);
    const alienSea = !!game.jueyu.alienMedium;
    let nTrees = 0, nM = 0, nD = 0, decoBuilt = 0;
    // 优化：每帧预算风摆三角函数——所有树共用 sin(t*1.3)/cos(t*1.3)/sin(t*2.9)/cos(t*2.9)，
    // 每棵树只用自己的相位做 sin(a+b) 展开（加减乘，不再有三角函数调用）
    this._wSinA = Math.sin(t * 1.3); this._wCosA = Math.cos(t * 1.3);
    this._wSinB = Math.sin(t * 2.9); this._wCosB = Math.cos(t * 2.9);
    this._wGlobal = this.flatTrees ? 0 : this.game.weather.gustAt(game.cam.x, game.cam.y, t);
    const wkOn = WR.downCount > 0;
    const decoT0 = performance.now();
    const fixedTrees = this.treeSpriteZoom > 0;   // 选了固定清晰度档：树的数量不再随缩放变
    // ── 树片金字塔：远景（z < 0.19）用宏片替代逐棵绘制 ──
    const useMacroPatches = hd && z < 0.19 && !fixedTrees;
    let macroPatchTrees = 0;
    if (useMacroPatches) {
      macroPatchTrees = this.emitMacroTreePatches(T, season, z, left, top, right, bottom, list);
      nTrees += macroPatchTrees;
    }
    for (let cy = cy0 - 1; cy <= cy1 + 2; cy++) for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
      if (!T.hasChunk(cx, cy)) continue;
      // P10：山树也每帧限量生成新块（画面里的先生成；生成过的直接用）
      let ds = T.peekDecos(cx, cy);
      if (!ds) { const inView = cx >= cx0 && cx <= cx1 && cy >= cy0 && cy <= cy1; if (decoBuilt >= (inView ? 3 : 1) || performance.now() - decoT0 > 4) continue; decoBuilt++; ds = T.getDecos(cx, cy); }
      for (const d of ds) {
        // 收官 B4：别界险地的流沙、熔岩、冰面上不撒「水波纹」那几笔蓝白的浪（地形装饰按「这里是水」撒的）
        if (alienSea && d.kind === 'img' && d.img === T.waveGlyph) continue;
        const vis = !(d.x + d.w / 2 < left || d.x - d.w / 2 > right || d.y - d.h > bottom + 20 || d.y < top - 20);
        if (d.kind === 'mtn') {
          if (hd) continue;
          const dd = d as MtnDeco & { _refl?: number };
          if (!vis) { if (d.x + d.w > left - 1200 && d.x - d.w < right + 1200 && d.y - d.h < bottom + 1200 && d.y > top - 1200) prefetch.push(d); continue; }
          nM++;
          list.push({ y: d.y, k: 'D·山', hx: d.x, hb: hdBox.mountain(d.w, d.h), draw: () => this.drawMountain(d, t), occ: { get: () => this.mtnSprite(d, z), x: d.x, y: d.y, flip: d.flip, footY: d.y, k: 0.5, ent: d } });
          // v0.48 云断山腰（高远）：大山约一半横一条烟岚
          const wseed = hash2(Math.round(d.x), Math.round(d.y), 77);
          if (d.h > 260 && wseed < 0.55 && z >= 0.35 && this.lowered < 4) list.push({ y: d.y + 0.5, k: 'D·山腰云', hx: d.x, hb: hdBox.mountain(d.w, d.h), draw: () => { this.world(); mood.drawWaistMist(ctx, d, t, wseed / 0.55); } });
          if (dd._refl === undefined) dd._refl = (!T.isLand(d.x, d.y + 60) || !T.isLand(d.x - d.w * 0.25, d.y + 50) || !T.isLand(d.x + d.w * 0.25, d.y + 50)) ? 1 : 0;
          if (dd._refl) reflect.push(d);
        } else if (d.kind === 'tree') {
          if (wkOn) { const ws = WR.treeAt(d); if (ws) { if (d.lod <= lodMax) this.wreckDeco(list, d, ws, lodMax < 2 ? (lodMax === 0 ? 1.25 : 1.1) : 1, left, top, right, bottom); continue; } }   // 野外破坏：倒了的树（倒下、躺着、树桩、长回来）
          // 树片金字塔：远景时已由宏片替代，跳过逐棵绘制
          if (useMacroPatches) continue;
          if (!vis) continue;
          // 树木 LOD：
          // - 「树木精灵清晰度」选了固定档（treeSpriteZoom > 0）时数量固定——视野里有多少画多少，
          //   不按缩放剔除、不做缩放淡入；缩放全程数量只随视野面积变。
          // - 「跟随缩放（原版）」才走原 LOD，只是把硬剔除改成按缩放淡入淡出，
          //   避免跨阈值时几十上百棵树凭空出现/消失。
          const ta = fixedTrees ? 1 : d.lod === 0 ? 1 : d.lod === 1 ? clamp((z - 0.28) / 0.04, 0, 1) : clamp((z - 0.42) / 0.06, 0, 1);
          if (ta <= 0.02) continue;
          // P10：拉到比 0.19 还远（只有占山宗门里拉得到 0.13）时一屏五六千棵树，光是排序打包立板就一帧二三十毫秒、飞越时连着几十帧过 50 毫秒：
          // 按位置哈希只留一部分（0.13 时约六成），留下的放大一点补满林冠——这么远看不出少了，帧时降下来（取哈希不动随机序列）
          const thin = hd && z < 0.19 && !fixedTrees;
          if (thin && hash2(Math.round(d.x), Math.round(d.y), 91) > Math.pow(z / 0.19, 1.4)) continue;
          // 优化：远景代表树系统（借鉴 taixu071）
          // 当 zoom 很远时（z < 0.25），用屏幕空间网格把树分组，每组只画一棵"代表树"
          // 比哈希剔除更稳定：树不会随机闪烁，森林密度视觉一致
          if (hd && z < 0.25 && z >= 0.19 && !fixedTrees) {
            // 屏幕空间网格：每格约 40×40 像素，同格内只留离格心最近的一棵
            const gridSize = 40 / (z * dpr);  // 世界坐标下的格大小
            const gx = Math.floor(d.x / gridSize), gy = Math.floor(d.y / gridSize);
            const repHash = hash2(gx, gy, 137);
            // 每格约留 1/3 的树（repHash < 0.33），视觉上足够密
            if (repHash > 0.33) continue;
          }
          // 优化：拉近时（z > 0.8）树多且每棵都大，帧预算紧时用屏幕空间网格疏化
          // 只在缩放变化中（stillFrames < 8）或弱机（lowered >= 1）触发，稳定后恢复全量
          if (hd && z > 0.8 && !fixedTrees && (this.stillFrames < 8 || this.lowered >= 1)) {
            const budgetK = this.frameBudget.budgetMs < 6 ? 0.55 : this.frameBudget.budgetMs < 8 ? 0.75 : 1;
            if (budgetK < 1) {
              const gs = 55 / (z * dpr);
              const gx = Math.floor(d.x / gs), gy = Math.floor(d.y / gs);
              if (hash2(gx, gy, 211) > budgetK) continue;
            }
          }
          nTrees++;
          const td = d as TreeDeco & { _refl?: number; _dw?: Drawable; _dwk?: number; _ts?: number; _ta?: number; _cosPh?: number; _sinPh?: number; _cosPh2?: number; _sinPh2?: number };
          const treeScale = fixedTrees ? 1 : lodMax < 2 ? (lodMax === 0 ? (thin ? 1.45 : 1.25) : 1.1) : 1;
          // 镜头拉远后树的摇摆不到几个像素：直接把树的位图当静态立板摆上去（同一种树共用图集里的一格），
          // 不再每帧往画布里画一遍。最远缩放时视野里有上千棵树，这是那时最大的一笔开销。
          // P10 收尾：每棵树的绘制项（对象 + 两个闭包）记在树上反复用——占山宗门镜头 0.13 时一屏五千棵树，
          // 每帧重新造一遍是每秒上百兆的垃圾，飞越时一次次整堆回收就是几十上百毫秒的长帧
          const st = !!hd && z * dpr < 0.5 && ta > 0.98;
          // 优化：dk 不再含 ta（透明度每帧渐变，原来一渐变就重建闭包 → 大量短命对象）；
          // treeScale 和 ta 记在 TreeDeco 上，draw 闭包从对象读，只需建一次
          const dk = treeScale * 2 + (st ? 1 : 0);
          td._ts = treeScale; td._ta = ta;
          let dw = td._dw;
          if (!dw || td._dwk !== dk) {
            td._dwk = dk;
            dw = td._dw = { y: d.y, k: 'D·树', hx: d.x, hb: hdBox.tree(d.w, d.h),
              staticSprite: st ? () => this.treeStatic(td, td._ts) : undefined,
              draw: () => this.drawTree(td, this.game.time, td._ts, td._ta),
              occ: { get: () => this.treeSprite(td, z), x: d.x, y: d.y, flip: d.flip, footY: d.y, k: 0.42, ent: d } };
          }
          list.push(dw);
          if (z > 0.45 && ta > 0.55) {
            if (td._refl === undefined) td._refl = !T.isLand(d.x, d.y + 30) ? 1 : 0;
            if (td._refl) reflect.push(d);
          }
        } else if (d.kind === 'fall') {
          // P3：高山模式的立体画面里瀑布贴着真实山体挂下来（hd2d/terrainFalls.ts），不再立那张画好的崖壁立板
          if (hd && MOUNTAINS && !(globalThis as { __oldFalls?: boolean }).__oldFalls) { if (!(d.x + d.w < left - 1500 || d.x - d.w > right + 1500 || d.y - d.h - 1500 > bottom || d.y + 1500 < top)) hd.terrainFalls.add(d); continue; }
          if (!(d.x + d.w < left || d.x - d.w > right || d.y - d.h - 100 > bottom || d.y + d.w * 0.4 < top)) { nM++; list.push({ y: d.y, k: 'D·瀑布', hx: d.x, hb: hdBox.fall(d.w, d.h), draw: () => this.drawFall(d, t), occ: { get: () => this.wfSprite(d, z), x: d.x, y: d.y, footY: d.y, k: 0.5, ent: d } }); }
        } else {
          if (wkOn) { const ws = WR.treeAt(d); if (ws) { if (z >= 0.3) this.wreckDeco(list, d, ws, 1, left, top, right, bottom); continue; } }   // 野外破坏：压倒的灌木、芦苇，打碎的小石景
          if (!vis || z < 0.3) continue;
          nD++;
          // 同上：绘制项和静态立板记在小景上反复用（画的时候取 this.ctx：HD2D 下绘制前会换画布的变换，画布本身不换）
          const dd = d as typeof d & { _dw?: Drawable };
          if (!dd._dw) {
            const ss: StaticSprite = { image: d.img, l: -d.w / 2, r: d.w / 2, t: -d.h, b: 0, flip: d.flip, alpha: d.alpha };
            dd._dw = { y: d.y, k: 'D·地面小景', hx: d.x, hb: hdBox.deco(d.w, d.h), staticSprite: () => ss,
              draw: () => { const c = this.ctx; c.globalAlpha = d.alpha * this._occA; if (d.flip) { c.save(); c.translate(d.x, 0); c.scale(-1, 1); c.drawImage(d.img, -d.w / 2, d.y - d.h, d.w, d.h); c.restore(); } else c.drawImage(d.img, d.x - d.w / 2, d.y - d.h, d.w, d.h); c.globalAlpha = 1; },
              occ: { get: () => null, x: d.x, y: d.y - d.h * 0.5, footY: d.y, ent: d, mode: 'rect', box: [d.x - d.w / 2, d.y - d.h, d.x + d.w / 2, d.y], k: 0.5 } };
          }
          list.push(dd._dw);
        }
      }
    }
    this.stats.trees = nTrees; this.stats.mtns = nM; this.stats.decos = nD;
    if (WR.props.length || WR.carries.length) this.wreckExtra(list, left, top, right, bottom);   // 野外破坏：扔出去落地的树、拔起来拿着 / 飞着的树
    prof.add('R·收集山树', _p); _p = prof.t();

    // 倒影（贴在水面上）—— 帧预算控制：掉帧时跳过
    this.frameBudget.syncElapsed();
    // LOD 波段平滑：倒影在 z∈[0.33,0.38] 渐显
    { const reflK = LOD.k(LOD.BAND.reflect, z);
      if (reflect.length && reflK > 0.01 && this.lowered < 4 && this.frameBudget.allow(RenderPriority.DECO, 0.7)) {
        const prevAlpha = ctx.globalAlpha;
        if (reflK < 0.99) ctx.globalAlpha *= reflK;
        this.drawReflections(reflect, t);
        ctx.globalAlpha = prevAlpha;
      }
    }
    prof.add('R·倒影', _p); _p = prof.t();

    // ---------- 4. 地点 ----------
    const visibleLocs: LocDef[] = [];
    const barriers: { L: LocLayout; x: number; y: number }[] = [];
    for (const l of LOCATIONS) {
      const x = l.x * WORLD_SCALE, y = l.y * WORLD_SCALE;
      // 先按一个宽松的大小粗筛：离画面远的地点不必去排布局（南荒放大后有两千多处地点，头一帧不能把它们的布局全排一遍）
      { const far = l.type === 'city' ? 22000 : l.type === 'sect' ? 16000 : l.minor ? 4000 : 9000; if (x + far < left || x - far > right || y + far < top || y - far > bottom) continue; }
      const L = this.layout(l);
      const hw = L.gw * LOC_SCALE * 0.6, hh = L.gh * LOC_SCALE * 0.6;
      if (x + hw < left - 200 || x - hw > right + 200 || y + hh < top - 200 || y - hh - 600 > bottom) continue;
      visibleLocs.push(l);
      const _g = prof.t();
      if (drawCityGround(ctx, L, x, y, left, top, right, bottom)) { /* P10：成片街坊的城，分块缓存的铺装（cityGround.ts） */ }
      else if (L.v2) this.drawLocGround2(L, x, y, t, left, top, right, bottom);
      else if (L.ground.length) this.drawLocGround(L, x, y, z);   // 占山的宗门没有平面铺地（台地石板画在地形底图里）
      prof.add(L.v2 ? 'R·城镇铺装' : 'R·旧式地点地面', _g);
      const res = resBucket(resTier.k * z * dpr * LOC_SCALE, 1.4);
      const cts = (globalThis as any).__treeDensity;
      const tts = (this.game.terrain as any)._treeStride;
      const treeStride = Number.isFinite(cts) ? Math.max(0, Math.min(8, Math.round(cts)))
        : Number.isFinite(tts) ? Math.max(0, Math.min(8, Math.round(tts))) : 1;
      L.pieces.forEach((pc, i) => {
        if (hd && canModelPiece(pc)) return;
        const px = x + pc.x * LOC_SCALE, py = y + pc.y * LOC_SCALE;
        // 城镇/名地摆件树也跟随「树木密度」：0 = 不生成，>1 按坐标取子集（否则调密度城里不变）
        if (pc.kind === 'tree') {
          if (treeStride === 0) return;
          if (treeStride > 1 && (((Math.round(px) * 5 + Math.round(py) * 3) >>> 0) % treeStride) !== 0) return;
        }
        // 第二十二步：贴图建筑 / 墙段直接绘制（不另存位图）
        if (pc.kind === 'B') {
          const w = pc.p.w, h = pc.p.h;
          if (px + w / 2 < left - 100 || px - w / 2 > right + 100 || py < top - 120 || py - h - 60 > bottom) return;
          list.push({ y: py, k: 'D·建筑', hx: px, hb: hdBox.building(w, h), draw: () => this.drawBldPiece(pc, px, py, t) });
          return;
        }
        if (pc.kind === 'W') {
          const len = pc.p.len;
          if (px + len / 2 < left - 100 || px - len / 2 > right + 100 || py < top - 80 || py - pc.p.hh - 40 > bottom) return;
          const draw = () => { const a = this.xray(pc, px - len / 2, px + len / 2, py, pc.p.hh); drawWallRun(ctx, pc.p.k, px - len / 2, px + len / 2, py, pc.p.hh, t, a); };
          if (!hd) { list.push({ y: py, k: 'D·城墙', draw }); return; }
          // HD2D：长墙切成一段段立板（像《饥荒》的墙），每段立在自己的位置上，转镜头后仍顺着地面上的走向；
          // 每段用同一个绘制函数，靠图集格子裁出属于自己的那一截
          const n = Math.max(1, Math.ceil(len / 140)), seg = len / n;
          for (let i = 0; i < n; i++) list.push({ y: py, k: 'D·城墙', hx: px - len / 2 + seg * (i + 0.5), hb: [-seg / 2 - 1, seg / 2 + 1, -pc.p.hh - 70, 50], draw });
          return;
        }
        if (pc.kind === 'WV') {
          if (px + 80 < left || px - 80 > right || py + 40 < top || py - pc.p.len - pc.p.h - 60 > bottom) return;
          const draw = () => this.drawWallV(pc, px, py);
          if (!hd) { list.push({ y: py, k: 'D·城墙', draw }); return; }
          // HD2D：南北走向的墙沿长度分段，每段立在自己的脚下（墙头在 2D 里比地面高 h）
          const L = pc.p.len, h = pc.p.h, tw = pc.p.t, n = Math.max(1, Math.ceil(L / 120)), seg = L / n;
          for (let i = 0; i < n; i++) { const fy = py - L + seg * (i + 1); list.push({ y: fy, k: 'D·城墙', hx: px, hb: [-tw / 2 - 30, tw / 2 + 30, -(seg + h + 12), 6], draw }); }
          return;
        }
        const zs = pc.p.z ?? 1;
        const ts = pc.kind === 'tree' ? (pc.p.s ?? 0.55) : zs;
        const tz = this.treeSpriteZoom > 0 ? this.treeSpriteZoom : resTier.k * z;
        const pres = pc.kind === 'tree' ? resBucket(tz * dpr * LOC_SCALE * ts, 1.4) : zs !== 1 ? resBucket(resTier.k * z * dpr * LOC_SCALE * zs, 1.4) : res;
        if (px < left - 600 || px > right + 600 || py < top - 50 || py - 900 > bottom) return;
        if (z < 0.3 && pc.kind === 'tree' && i % 2) return;
        // P10 收尾：城里、宗门里的小件和树，绘制项（对象 + 三个闭包 + 贴图键字符串）记在构件上反复用——
        // 占山的宗门、成片的城一屏几百上千件，原来每帧全部重造；同季、同清晰度、同远近档时不重造。
        // 镜头拉远后（同野外的树）树也当静态立板摆上去，不再每帧往画布里画一遍
        // 城镇破坏：城里倒了的树（照野外的画法：倒下、躺着、树桩、长回来；贴图还是这棵树自己的）
        if (wkOn && pc.kind === 'tree') {
          const fk = WR.town.treeDeco(l, L, x, y, i) as unknown as (Deco & { _spr?: () => Spr | null }) | null, ws = fk && WR.treeAt(fk as Deco);
          if (fk && ws) { fk._spr = () => sprites.getAsync(`P:${l.id}:${i}:${season}`, pres, (r) => ({ kind: 'T', sp: pc.p.sp, season, seed: pc.seed, res: r }), (r) => renderPiece(pc, L.pal, r, season) as Spr) as Spr | null; this.wreckDeco(list, fk as Deco, ws, 1, left, top, right, bottom); return; }
        }
        const stTree = pc.kind === 'tree' && !!hd && z * dpr < 0.5;
        const pk = (pc.kind === 'tree' ? 1 : 2) * 1e6 + (stTree ? 5e5 : 0) + season * 1e4 + Math.round(pres * 100);
        const C = pc as Piece & { _dw?: Drawable; _dwk?: number; _dwl?: string; _ss?: StaticSprite; _ssS?: Spr };
        if (!C._dw || C._dwk !== pk || C._dwl !== l.id) {
          const key = pc.kind === 'tree' ? `P:${l.id}:${i}:${season}` : `P:${l.id}:${i}`;
          const getSprite = () => pc.kind === 'tree'
              ? sprites.getAsync(key, pres, (r) => ({ kind: 'T', sp: pc.p.sp, season, seed: pc.seed, res: r }), (r) => renderPiece(pc, L.pal, r, season) as Spr)
              : sprites.get(key, pres, (r) => renderPiece(pc, L.pal, r, season) as Spr);
          const still = (s: Spr, k: number): StaticSprite => {
            if (C._ssS === s && C._ss) return C._ss;
            const src = s.canvas as unknown;
            let image: StaticSprite['image'] = s.canvas;
            if (typeof ImageBitmap !== 'undefined' && src instanceof ImageBitmap) { let f = treeFrames.get(src); if (!f) { f = new BitmapFrame(src); treeFrames.set(src, f); } image = f; }
            C._ssS = s; return C._ss = { image, l: -s.ax * k, r: (s.w - s.ax) * k, t: -s.ay * k, b: (s.h - s.ay) * k };
          };
          C._dwk = pk; C._dwl = l.id;
          C._dw = { y: py, k: pc.kind === 'tree' ? 'D·城中树' : 'D·城中小件', hx: px, hb: hdBox.piece(pc.kind === 'tree' ? ts * 1.6 : zs),
            occ: { get: () => null, x: px, y: py, footY: py, mode: 'rect', box: [px - (pc.p.w ?? 90) * LOC_SCALE * 0.45, py - (pc.p.h ?? 220) * LOC_SCALE * 0.9, px + (pc.p.w ?? 90) * LOC_SCALE * 0.45, py], k: pc.kind === 'tree' ? 0.42 : 0.5, ent: pc },
            staticSprite: pc.kind === 'tree' ? (stTree ? () => { const s = getSprite(); return s ? still(s, LOC_SCALE * ts) : null; } : undefined) : () => {
              const s = getSprite(); return s ? still(s, LOC_SCALE * zs) : null;
            },
            draw: () => {
            const s = getSprite();
            if (!s) return;
            const g = this.ctx, gm = this.game, tt = gm.time;
            if (pc.kind === 'tree') {
              const gw = gm.weather.gustAt(px, py, tt);
              const sw = this.flatTrees ? 0 : Math.sin(tt * 1.3 + i) * 0.02 * (0.35 + gw) + gw * 0.03 * gm.weather.windLean;
              const k = this.Z * LOC_SCALE * ts;
              g.setTransform(k, 0, sw * k, k, px * this.Z + this.ox, py * this.Z + this.oy);
              g.drawImage(s.canvas, -s.ax, -s.ay, s.w, s.h);
              this.world();
            } else { const k = LOC_SCALE * zs; g.drawImage(s.canvas, px - s.ax * k, py - s.ay * k, s.w * k, s.h * k); }
          } };
        }
        list.push(C._dw);
      });
      // 旗帜、炊烟
      for (const f of L.flags) { const fx = x + f.x * LOC_SCALE, fy = y + f.y * LOC_SCALE; list.push({ y: fy + 1, k: 'D·旗帜', hx: fx, hb: hdBox.flag, draw: () => this.drawFlag(fx, fy, f.color, t) }); }
      if (L.barrier) barriers.push({ L, x, y });
    }

    // 城镇破坏：城里地面的石板碎裂画进地贴（在铺装之后）
    if (WR.town.here()) list.push({ y: top - 1, k: 'D·城中裂痕', draw: (g) => drawTownMarks(g as CanvasRenderingContext2D, game, left, top, right, bottom) });
    // 宗门等级：大宗门 3（主殿放大、重檐、高台基），一般宗门 2，江湖小门派 1，其他地点 0
    if (hd) {
      hd.buildings.sync(visibleLocs.map((l) => ({ id: l.id, layout: this.layout(l), x: l.x * WORLD_SCALE, y: l.y * WORLD_SCALE,
        tier: l.type === 'sect' ? ((l.scale ?? 1) < 1 ? 1 : l.major ? 3 : 2) : 0 })), hd.heightAt, { l: left, t: top, r: right, b: bottom });
      hd.buildings.update(t, game.player.x, game.player.y);
      (this.indoorGl ??= new IndoorGl(hd)).update(game, dt);   // 收官 P8（丁）：屋里的地面、墙、陈设，进屋时这一栋屋顶淡出
      if (this.townGl || game.ws.townwreck || game.combat.wreck.town.falls.length) (this.townGl ??= new TownWreckGl(hd)).update(game, dt);   // 城镇破坏：替身、倒下的过程、城墙焦痕（没东西坏过就不建）
      (this.huajuanGl ??= new HuajuanGl(hd)).update(game);   // 收官 P8（丁）：画中洞天的卷轴
    }
    prof.add('R·地点(含城镇地面)', _p); _p = prof.t();
    // ---------- 5. 采集点（仅神识内可见）----------
    const p = game.player;
    this.modsT -= dt;
    if (this.modsT <= 0) { this.modsT = 1; this.senseMods = senseMods({ ...game.hero, treasures: [...((game.hero as any).treasures ?? []), ...game.hero.bag.map((b) => b.id.replace(/^(art|mat)_/, '')), ...game.hero.arts.map((a) => a.id)] } as any); this.sense.warm(game.hero.realm, this.senseMods); }
    this.sense.hidden += ((game.concealed ? 1 : 0) - this.sense.hidden) * Math.min(1, dt * 3);
    this.sense.update(dt, game.senseRadius);
    const R = this.sense.dispR;
    game.life.sense.x = p.x; game.life.sense.y = p.y; game.life.sense.R = game.revealAll && game.debugSeeAll ? 1e9 : R;
    for (const n of game.nodes.inRect(p.x - R, p.y - R, p.x + R, p.y + R)) {
      if (!game.nodes.available(n, game.day)) continue;
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d > R) continue;
      const a = clamp((R - d) / 120, 0, 1);
      const hl = game.gatherTarget === n;
      list.push({ y: n.y, k: 'D·采集点', hx: n.x, hb: hdBox.node, draw: () => drawNode(ctx, n, t, a, hl) });
    }
    prof.add('R·神识采集点', _p); _p = prof.t();

    // ---------- 6. 生灵（地面）+ 玩家 ----------
    const view = { left, top, right, bottom };
    ctx.save();
    game.life.drawShadows(ctx, t);
    ctx.restore();
    prof.add('R·生灵影子', _p); _p = prof.t();
    let _n = list.length;
    const tag = (k: string) => { for (let i = _n; i < list.length; i++) if (!list[i].k) list[i].k = k; _n = list.length; };
    tag('D·其他');
    game.life.collectGround(list, view, t, dt); tag('D·生灵(人兽)');
    collectCombat(game.combat, list, view, t, dt, !!hd); tag('D·战斗单位');
    if (!hd) { game.jueyu.collect2D(list as never, ctx); tag('D·海上大件'); }   // 收官 B3：纯 2D 回退下鲸背、触须、蛟身、灵舟、鬼船、祭坛、遗迹（HD 下在 seathings 网格里）
    // 远景 NPC 剔除：zoom 远时缩小收集范围，减少 60-80% 的 NPC 绘制
    this.frameBudget.syncElapsed();
    { const npcView = z < 0.3
      ? (() => { const cx = (left + right) / 2, cy = (top + bottom) / 2, hw = (right - left) * 0.35, hh = (bottom - top) * 0.35; return { left: cx - hw, top: cy - hh, right: cx + hw, bottom: cy + hh }; })()
      : view;
      game.npcs.collect(list, npcView, t, dt); game.indoor.collect(list, npcView, t, dt); collectTownWorkers(game, list, npcView, dt); tag('D·NPC');
    }
    game.events.collect(list, view, t, dt); game.story.collect(list, view, t, dt); tag('D·事件剧情');
    game.landmarks.collect(list, view, t); tag('D·名地');
    game.sites.collect(list, view, t, dt); game.home.collect(list, view, t); game.happen.collect(list, view, t, dt); game.enyuan.collect(list); game.daoxin.collect(list, view, t, dt); game.pianju.collect(list, view, t); game.pets.collect(list); game.heartx.collect(list); tag('D·遗府奇遇');
    game.yuanying.collect(list); game.shen?.collect(list); game.zhenfa.collect(list, view, t); game.mijing.collectWorld(list, view, t); tag('D·元婴阵法秘境');
    if (hd) game.life.collectSky(list, view, t, (x, y, h) => hd.altScale(x, y, h));   // 第五轮返工：海鸥按镜头把高处放大了多少缩回去   // 飞鸟、御剑修士：HD2D 下立成空中的立板（下面第 8 步那一版会平铺在地上）
    // 立体画面里炊烟不进立板（炊烟贴图是给 2D 俯视画的一抹淡烟：立成立板几乎看不见、还被屋顶挡住）——收官返工 9 改在特效层冒烟缕粒子（emitSmoke）。2D 画法照旧画
    list.push({ y: p.flying && !game.yuanying.active ? p.y + 200000 : p.y, k: 'D·主角', hx: p.x, hy: p.y, hb: charBox(1.12, p.st.lift + 40), draw: () => this.drawPlayer(dt) });   // 御器飞行：在山树之上
    if (modx) { modx.collect(list); tag('D·模组'); }   // v0.56：模组的绘制
    prof.add('R·收集单位', _p); _p = prof.t();

    // 优化：Y 桶计数排序 O(n)，替代 Array.sort O(n log n)
    // 借鉴 taixu071 的 2048 桶方案：绘制项的 Y 跨度大但分布均匀，
    // 桶数够多时同桶内的顺序不影响视觉（同深度的谁先谁后无所谓）
    {
      const N = list.length;
      if (N > 64) {
        const BUCKETS = 2048;
        let minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < N; i++) { const y = list[i].y; if (y < minY) minY = y; if (y > maxY) maxY = y; }
        const range = maxY - minY || 1;
        const counts = new Int32Array(BUCKETS + 1);
        for (let i = 0; i < N; i++) {
          const b = Math.min(BUCKETS - 1, ((list[i].y - minY) / range * BUCKETS) | 0);
          counts[b + 1]++;
        }
        for (let i = 1; i <= BUCKETS; i++) counts[i] += counts[i - 1];
        const sorted: typeof list = new Array(N);
        for (let i = 0; i < N; i++) {
          const b = Math.min(BUCKETS - 1, ((list[i].y - minY) / range * BUCKETS) | 0);
          sorted[counts[b]++] = list[i];
        }
        list.length = 0;
        for (let i = 0; i < N; i++) list.push(sorted[i]);
      } else {
        list.sort((a, b) => a.y - b.y);
      }
    }
    prof.add('R·排序', _p);
    // 分层：先画静态件（山、树、屋、草），再画人在上面
    if (hd) this.drawListHD(list, hd);
    else if (prof.on) {
      // 精细计时用 gpu 级时间戳：performance.now() 在 Chrome 里被压到 100µs 粒度，
      // 一个 78ms 的桶里到底塞了什么，只有用高精度时钟才分得开。
      for (const d of list) {
        const q = performance.now(); d.draw(ctx);
        const dtms = performance.now() - q;
        prof.add(d.k ?? 'D·其他', q);
        if (dtms > 2) prof.add('·慢:' + (d.k ?? '其他'), q);
      }
    }
    else this.drawList(list, ctx);
    prof.add('R·全量绘制', _p);
    _p = prof.t();
    this.world();

    // 第十九步：名地的雾、光罩、余烬、名字
    game.landmarks.drawOver(ctx, view, t);
    game.scenery.drawOver(ctx, game, view, t);
    this.world();
    // 遮挡处理：谁挡住主角谁淡开（山/树/瀑布崖/地面小景，见 occAlpha），主角只画一次
    // 遮挡时的人影（透过树木建筑仍可见）。HD2D 下它会被画成贴地的平面人影，先不画
    if (!hd) this.drawPlayerGhost();

    // 炊烟（极简档不画：纯氛围，一帧十几团渐变）—— 帧预算控制
    this.frameBudget.syncElapsed();
    if (this.lowered < 4 && !hd && this.frameBudget.allow(RenderPriority.DECO, 0.25)) for (const l of visibleLocs) { const L = this.layout(l); for (const s of L.smoke) if (Math.hypot(l.x * WORLD_SCALE + s.x * LOC_SCALE - p.x, l.y * WORLD_SCALE + s.y * LOC_SCALE - p.y) < R) this.drawSmoke(l.x * WORLD_SCALE + s.x * LOC_SCALE, l.y * WORLD_SCALE + s.y * LOC_SCALE, t, hash2(s.x, s.y, 3)); }

    // ---------- 7. 护山大阵 ----------
    // HD2D 下护山大阵是立体光罩（hd2d/buildings.ts），不再往地面上画平面的那一版
    // 帧预算控制：掉帧时跳过
    this.frameBudget.syncElapsed();
    if (this.lowered < 4 && !hd && this.frameBudget.allow(RenderPriority.DECO, 0.2)) for (const b of barriers) this.drawBarrier(b.L, b.x, b.y, t);

    // 预取视野外的山（有剩余预算时）
    if (sprites.canBuild()) {
      prefetch.sort((a, b) => Math.hypot(a.x - camX, a.y - camY) - Math.hypot(b.x - camX, b.y - camY));
      for (const d of prefetch.slice(0, 3)) { if (!sprites.canBuild()) break; this.mtnSprite(d, z); }
    }

    prof.add('R·名地雾/人影/炊烟/大阵', _p); _p = prof.t();
    // ---------- 8. 天空：飞鸟、仙鹤、御剑修士；粒子；目的地 ----------
    if (!hd) game.life.drawSky(ctx, t);
    prof.add('R·天空飞禽', _p); _p = prof.t();
    this.updateParticles(dt);
    // 第四十六步：突破天象（世界坐标：灵阵、灵气、风云、天雷、光柱、元婴、花雨、大字）
    if (game.tianxiang.active) { this.world(); game.tianxiang.drawWorld(ctx, z); }
    if (game.destination) {
      const { x, y } = game.destination;
      ctx.save();
      ctx.strokeStyle = 'rgba(160,50,40,0.85)'; ctx.lineWidth = 3 / z;
      const r = 18 + Math.sin(t * 5) * 4;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x, y, r * 0.4, r * 0.2, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(160,50,40,0.6)'; ctx.fill();
      ctx.restore();
    }

    // ---------- 8.5 四季飘物：春花瓣、夏柳絮、秋落叶（仅神识圈内）----------
    // 帧预算控制：掉帧时跳过飘物
    this.frameBudget.syncElapsed();
    if (this.frameBudget.allow(RenderPriority.DECO, 0.2)) this.drawSeasonFx(dt, season, p.x, p.y, R);

    prof.add('R·粒子四季飘物', _p); _p = prof.t();
    if (hd) {
      // Three 直接绘入 GLStage 的共享目标，Canvas 仅保留后续屏幕覆盖层。
      this.stage!.hdrWorld = this.gfxOn;   // P2：世界层用半浮点（最低档、设置关掉时退回 8 位）
      this.hdTarget = this.stage!.worldTarget(this.stage!.W, this.stage!.H);
      // 影子跟着时辰走；阴天、雾天变淡；最低两档画质不做投影
      hd.shadowsEnabled = this.lowered < 3;
      // 阴影图按画质档降分辨率：0档=2048, 1档=1024, 2档=512, 3档=512
      hd.shadowSize = this.lowered === 0 ? 2048 : this.lowered === 1 ? 1024 : 512;
      hd.setSun(game.dayPhase, game.night, game.weather.gloom + game.tianxiang.gloom);
      { const W0 = game.weather; hd.buildings.setSway(t, Math.cos(W0.windDir), Math.sin(W0.windDir), 0.45 + W0.wind * 1.1); }   // P4：幡、旗、灯笼随风摆
      hd.setClouds(game.time, game.terrain.surfaceHeight(p.x, p.y) + p.st.lift);
      hd.setCloudDeck(this.worldCloudDeck(hd, dt), dt);
      // P2：阵法 / 结界立起光墙（阵界一圈，底边亮、往上渐隐，篆文上流）
      { const walls: ZhenWall[] = [];
        for (const i of game.zhenfa.list) {
          if (i.dead || i.map !== ACTIVE_MAP || i.x + i.r < left - 200 || i.x - i.r > right + 200 || i.y + i.r < top - 200 || i.y - i.r > bottom + 400) continue;
          const born = clamp(i.t / 0.8, 0, 1), fade = i.left < 3 && i.untilDay === undefined ? Math.max(0, i.left / 3) : 1, dome = i.def.id === 'xuanwu' || i.def.id === 'liangyi';
          const c = (i.owner === 'e' ? (i.def.id === 'dihuo' ? '255,110,60' : '200,80,90') : i.def.color).split(',').map((v) => +v / 255);
          walls.push({ key: String(i.bornAt) + ':' + i.x, x: i.x, y: i.y, ground: hd.heightAt(i.x, i.y), r: i.r, h: dome ? clamp(i.r * 0.85, 240, 900) : clamp(i.r * 0.42, 140, 520), color: [c[0] || 1, c[1] || 1, c[2] || 1], alpha: born * fade * (dome ? 0.85 : 0.6), dome });
        }
        // 收官 P5：虚空挪移开阵时脚下升起的光柱（出阵后在落点散去）——细高的一圈光墙，篆文上流
        { const pl = game.nuoyi.pillar;
          if (pl && pl.k > 0.01) { const c = NUOYI_STYLE[game.nuoyi.kind].light; walls.push({ key: 'nuoyi', x: pl.x, y: pl.y, ground: hd.heightAt(pl.x, pl.y), r: 110, h: 260 + 640 * pl.k, color: [c[0], c[1], c[2]], alpha: 0.9 * pl.k, dome: false }); } }
        hd.zhenWalls.sync(walls, t);
      }
      { const sv = game.seabeast.view(); if (this.seaThings || game.jueyu.sea || sv.sprites.length + sv.ribbons.length + sv.flats.length) { this.seaThings ??= new SeaThings(hd.scene); const _s = prof.t(); this.seaThings.update(sv, hd, this.hdTarget ? { tex: this.hdTarget.groundDepth, w: this.hdTarget.w, h: this.hdTarget.h, gl: hd.gl } : null); game.seabeast.hdReady = this.seaThings.ready; prof.add('R·海兽网格', _s); } }   // 收官 B2：海兽在 HD 场景里单独画；第五轮返工：一进险地就开始加载贴图（原来要等海兽出水才加载，那几息里触须退回立板图集，画成平躺的小紫条）
      { const bv = bossViewOf(game); if (this.bossThings || bv.sprites.length) { this.bossThings ??= new BossThings(hd.scene); const _s = prof.t(); this.bossThings.update(bv, hd); bossReadyTo(game, this.bossThings.ready); prof.add('R·首领立板', _s); } }   // r16 夜无赦：首领（几个人高的魔躯）不进共享立板图集，在 HD 场景里单独画（hd2d/bossthings.ts）
      this.fx3dFrame(hd, dt);   // r7-fx3d
      hd.render(this.hdTarget);
      ctx = this.ctx = worldCtx;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      this.Z = z * dpr; this.ox = W * dpr / 2 - camX * this.Z; this.oy = H * dpr / 2 - camY * this.Z; this.world();
      prof.add('R·HD2D 场景', _p); _p = prof.t();
    }
    // ---------- 9. 昼夜 + 天气暗化（multiply）----------
    const night = game.night, light = game.light;
    const dusk = clamp(1 - Math.abs(light - 0.52) / 0.2, 0, 1) * (1 - night) * 0.7;
    const gloom = game.weather.gloom + game.weather.flash * -0.3 + game.tianxiang.gloom - game.tianxiang.flash * 0.5;
    let mulR = 255, mulG = 255, mulB = 255;
    if (night > 0.01 || dusk > 0.01 || gloom > 0.01) {
      let r = 255, g = 255, bb = 255;
      r += (255 - r) * dusk; g += (200 - g) * dusk; bb += (160 - bb) * dusk;
      r += (70 - r) * night * 0.85; g += (80 - g) * night * 0.85; bb += (130 - bb) * night * 0.85;
      const gl = clamp(gloom, 0, 0.6);
      r += (150 - r) * gl; g += (156 - g) * gl; bb += (168 - bb) * gl;
      mulR = r; mulG = g; mulB = bb;
    }
    if (!GL && (night > 0.01 || dusk > 0.01 || gloom > 0.01)) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgb(${mulR | 0},${mulG | 0},${mulB | 0})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.restore();
    }
    // v0.48 时辰色罩（weather.ts 色罩表）：非 GL 用 soft-light 罩整个世界层；GL 并入着色器 tint
    const mm = mood.enabled ? moodMask(game.dayPhase, night, game.weather.kind, game.weather.k) : [1, 1, 1, 0];
    if (!GL && mm[3] > 0.005) {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = `rgba(${mm[0] * 255 | 0},${mm[1] * 255 | 0},${mm[2] * 255 | 0},${Math.min(0.6, mm[3] * 1.5)})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); ctx.restore();
    }
    // 调色：白昼略增反差与暖意（避免发灰），晨昏金色柔光
    const dayK = (1 - night) * (1 - clamp(gloom, 0, 1));
    if (!GL) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'soft-light';
      if (dayK > 0.05) { ctx.fillStyle = `rgba(255,236,196,${0.22 * dayK * (1 - dusk)})`; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); }
      if (dusk > 0.03) {
        const gr = ctx.createLinearGradient(0, 0, this.canvas.width, this.canvas.height * 0.6);
        gr.addColorStop(0, `rgba(255,170,80,${0.75 * dusk})`); gr.addColorStop(1, `rgba(255,120,90,${0.2 * dusk})`);
        ctx.fillStyle = gr; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.globalCompositeOperation = 'screen';
        const cw = this.canvas.width, chh = this.canvas.height;
        const sg = ctx.createRadialGradient(cw * 0.1, -chh * 0.1, 0, cw * 0.1, -chh * 0.1, Math.max(cw, chh) * 1.1);
        sg.addColorStop(0, `rgba(255,170,90,${0.3 * dusk})`); sg.addColorStop(1, 'rgba(255,150,90,0)');
        ctx.fillStyle = sg; ctx.fillRect(0, 0, cw, chh);
      }
      ctx.restore();
    }
    // 灯火
    const F = this.fx;
    if (GL && F) {
      // WebGL 批次：神识圈（最底）→ 灯火 → 战斗特效 → 粒子
      const B = this.stage!.batch;
      B.reset(camX, camY, z, W, H, this.stage!.atlas);
      B.hd = hd; B.gpuDecals = !!hd && GPU_DECALS;
      F.update(dt);
      if (!(game.revealAll && game.debugSeeAll)) this.sense.drawGL(F, this.stage!, p.x, p.y, Math.min(5, game.hero.realm), this.senseMods, game.time, z);
      const lightK = !!hd && this.gfxLights;   // 点光源：见 gfxOn 上面的分档表
      if (lightK) this.lights.begin(p.x, p.y);
      if (night > 0.05) {
        for (const l of visibleLocs) {
          const L = this.layout(l), lx = l.x * WORLD_SCALE, ly = l.y * WORLD_SCALE;
          const grand = isGrandSect(l) || !!L.final;   // 占山的大宗门、成片街坊的城：满城灯火，不只神识圈里亮
          const dark = game.combat.wreck.town.broken(l.id)?.lamps;   // r7-fix：砸坏的灯杆（修好为止）那一处不亮
          L.lights.forEach((li, i) => {
            if (dark && lampDark(dark, lx + li.x * LOC_SCALE, ly + li.y * LOC_SCALE)) return;
            if (grand) { const wx = lx + li.x * LOC_SCALE, wy = ly + li.y * LOC_SCALE; if (wx < left - 300 || wx > right + 300 || wy < top - 300 || wy > bottom + 600) return; }
            const vis = grand ? 1 : clamp((R - Math.hypot(lx + li.x * LOC_SCALE - p.x, ly + li.y * LOC_SCALE - p.y)) / 120, 0, 1);
            if (vis <= 0) return;
            const fl = 0.85 + 0.15 * Math.sin(t * 7 + i * 1.7) * Math.sin(t * 3.1 + i);
            // 成片的城、大宗门拉远看时光晕跟着放大一些，远景里也看得出万家灯火（近看不变）
            const rr = li.r * LOC_SCALE * 2.4 * fl * (grand ? Math.min(2.2, Math.max(1, 0.42 / z)) : 1);
            // P2：灯真的照亮周围的地面和墙（半径按灯的大小，不跟镜头远近走）；暖色，魔道的灯偏青红
            if (lightK) { const wx = lx + li.x * LOC_SCALE, wy = ly + li.y * LOC_SCALE, lc = li.c ?? [1, 0.72, 0.4]; this.lights.add(wx, hd!.heightAt(wx, wy) + (li.h || 40), wy, li.r * LOC_SCALE * 6.5, lc[0], lc[1] * 0.86, lc[2] * 0.66, night * 1.9 * fl * vis); }   // 一盏一汪光，不把整个院子照成白天
            if (li.h && hd) {   // 挂在半空的灯（窗、灯笼）：光晕画在灯所在的高度
              B.pt(lx + li.x * LOC_SCALE, ly + li.y * LOC_SCALE, -li.h / hd.heightBoost);
              const lc = li.c ?? [1, 0.72, 0.4];   // 灯色（魔道偏青红）
              B.quadS(0, B.ox, B.oy, rr * 1.6 * B.os, rr * 1.4 * B.os, 0, lc[0], lc[1], lc[2], night * 0.55, 1, undefined, 1, B.od);
              B.quadS(1, B.ox, B.oy, rr * 0.3 * B.os, rr * 0.26 * B.os, 0, Math.min(1, lc[0] + 0.15), Math.min(1, lc[1] + 0.15), Math.min(1, lc[2] + 0.2), night * 0.8, 1, undefined, 1, B.od);
              return;
            }
            B.quad(0, lx + li.x * LOC_SCALE, ly + li.y * LOC_SCALE, rr * 2, rr * 1.6, 0, 1, 0.72, 0.4, night * 0.6 * vis, 1);
            B.quad(1, lx + li.x * LOC_SCALE, ly + li.y * LOC_SCALE, rr * 0.35, rr * 0.3, 0, 1, 0.85, 0.6, night * 0.8 * vis, 1);
          });
        }
        if (lightK) this.indoorGl?.lights((x, h, z, r, cr, cg, cb, i) => this.lights.add(x, h, z, r, cr, cg, cb, i), game, night);   // 返工：屋里的灯火登记成点光源（替掉室内线临时的地上光斑 + 光晕）
        B.quad(0, p.x, p.y - 50, 320, 240, 0, 1, 0.8, 0.55, night * 0.22, 1);
        // P2：夜里主角身边一圈淡淡的暖光，近处总是看得清
        if (lightK) this.lights.add(p.x, hd!.heightAt(p.x, p.y) + p.st.lift * hd!.boost + 120, p.y, 420, 1, 0.86, 0.66, night * 0.6);
        game.life.collectGlow(night, (x, y, r, a) => { B.quad(0, x, y, r * 2.6, r * 2.6, 0, 0.85, 1, 0.55, a, 1); B.quad(26, x, y, r * 0.5, r * 0.5, 0, 1, 1, 0.8, a, 1); });
      }
      // 收官返工 9：炊烟——立体画面里改用特效层的烟缕粒子（柔和、稀疏、往上飘散；只在神识圈以内，点缀用，不糊建筑）
      if (hd && this.lowered < 4) this.emitSmoke(F, visibleLocs, dt, R, night);   // 同 2D：只有极简档不画
      prof.add('R·GL神识灯火', _p); _p = prof.t();
      let fxMark = prof.t(), fxVertex = B.n;
      drawCombatGL(F, game.combat, t, dt);
      prof.add('FX·战斗', fxMark, B.n - fxVertex); fxMark = prof.t(); fxVertex = B.n;
      game.story.drawGL(F, t);
      game.jueyu.drawGL(F, t, dt);   // 绝域：空间裂缝、落雷、飓风的雨与浪花、鬼雾幻影、泅水的水纹
      F.drawRings(dt);
      prof.add('FX·剧情光环', fxMark, B.n - fxVertex); fxMark = prof.t(); fxVertex = B.n;
      F.drawParticles();
      prof.add('FX·粒子', fxMark, B.n - fxVertex); fxMark = prof.t(); fxVertex = B.n;
      F.flushBake(this.stage!.atlas);
      prof.add('FX·烘焙贴图', fxMark, B.n - fxVertex); fxMark = prof.t(); fxVertex = B.n;
      this.vfxSprites!.draw(game.combat, t);
      prof.add('FX·关键贴图', fxMark, B.n - fxVertex);
      if (lightK) {
        // P2：法术命中、爆点、雷光、弹道照亮周围——按「强度 × 半径 ÷ 离主角远近」取前几盏，随寿命淡出
        const fl = F.flashLights, order = fl.map((_, i) => i);
        if (order.length > MAX_FLASH_LIGHTS) order.sort((a, b) => fl[b].i * fl[b].r / (400 + Math.hypot(fl[b].x - p.x, fl[b].y - p.y)) - fl[a].i * fl[a].r / (400 + Math.hypot(fl[a].x - p.x, fl[a].y - p.y)));
        for (let k = 0; k < Math.min(order.length, MAX_FLASH_LIGHTS); k++) {
          const L = fl[order[k]], u = L.life > 0 ? 1 - L.t / L.life : 1;
          this.lights.add(L.x, hd!.heightAt(L.x, L.y) + L.h * hd!.boost, L.y, L.r, L.c[0], L.c[1], L.c[2], L.i * u * u * (0.3 + 0.7 * night));   // 白天也亮一下，但收着（天光下本来就亮）
        }
        // 掉落物：按品阶的颜色在脚下照一小圈（夜里看得见地上有东西）
        if (night > 0.05) for (const l of game.combat.loot) if (l.x > left && l.x < right && l.y > top && l.y < bottom) { const c = lootGlow(l.id); this.lights.add(l.x, hd!.heightAt(l.x, l.y) + 50, l.y, 220, c[0], c[1], c[2], night * 1.6); }
        this.lights.finish(); this.lightsReady = true;
      }
      if (prof.on) prof.addMs('FX·批次段数', 0, B.segs.length);
      prof.add('R·GL特效批次', _p); _p = prof.t();
    } else {
      game.combat.fxq.length = 0;
    }
    if (!GL && night > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const l of visibleLocs) {
        const L = this.layout(l), lx = l.x * WORLD_SCALE, ly = l.y * WORLD_SCALE;
        const dark = game.combat.wreck.town.broken(l.id)?.lamps;
        L.lights.forEach((li, i) => {
          if (dark && lampDark(dark, lx + li.x * LOC_SCALE, ly + li.y * LOC_SCALE)) return;
          const vis = clamp((R - Math.hypot(lx + li.x * LOC_SCALE - p.x, ly + li.y * LOC_SCALE - p.y)) / 120, 0, 1);
          if (vis <= 0) return;
          const fl = 0.85 + 0.15 * Math.sin(t * 7 + i * 1.7) * Math.sin(t * 3.1 + i);
          const rr = li.r * LOC_SCALE * 2.4 * fl;
          ctx.globalAlpha = night * 0.75 * vis;
          ctx.drawImage(this.glow, lx + li.x * LOC_SCALE - rr, ly + li.y * LOC_SCALE - rr * 0.8, rr * 2, rr * 1.6);
        });
      }
      // 采集点灵光、玩家周身微光
      ctx.globalAlpha = night * 0.35;
      ctx.drawImage(this.glow, p.x - 160, p.y - 170, 320, 240);
      ctx.restore();
      game.life.drawGlow(ctx, t, night);
    }

    // 战斗特效（发光，夜里亦明亮）
    this.world();
    if (!GL) drawCombatFx(ctx, game.combat, t);

    // ---------- 10. 氛围层 ----------
    _p = prof.t();
    let _a = prof.t();
    // v0.52.8 性能：氛围层（云影 / 未探迷雾 / 云本体）每帧全部重画在一张约 1/4 分辨率的画布上，
    // 整块合起来比画面里所有人物加起来还贵。云影是按真实时间漂的，看不出一帧十毫秒的差别，
    // 所以降到半速（30fps）重画，中间帧沿用上一张——观感几乎无变化，省一半。
    // 一旦镜头在动或天气不是晴，立刻恢复逐帧。
    const atmok = !this.atmoSkipNow;
    if (atmok) this.drawAtmosphere(left, top, right, bottom, (this.atmoStep === 2 ? dt : 0) * 2);
    this.atmoSkipNow = false;
    prof.add('A┊云影/雾块', _a); _a = prof.t();
    prof.add('R·氛围层', _p); _p = prof.t();
    if (!GL && this.atmoReady) ctx.drawImage(this.atmo, this.atmoRect.x, this.atmoRect.y, this.atmoRect.w, this.atmoRect.h);

    // —— 以下为 UI 层（GL 模式下画在透明画布上，不受调色、记忆水墨影响）
    const sceneCtx = this.ctx, sceneZ = this.Z, sceneOx = this.ox, sceneOy = this.oy, sceneDpr = this.dpr;
    if (GL) {
      this.ctx = ui; this.dpr = this.uiDpr;
      this.Z = z * this.uiDpr; this.ox = W * this.uiDpr / 2 - camX * this.Z; this.oy = H * this.uiDpr / 2 - camY * this.Z;
      this.world();
    }
    if (hd) {
      const ud = this.uiDpr, A = hd.aff;
      // 锚点处的局部缩放：透视相机下远处的名牌、血条、伤害字跟着人一起变小
      hdUi.at = (g, x, y) => { const s = hd.ground(x, y), k = s.s * ud; g.setTransform(k, 0, 0, k, s.x * ud - x * k, s.y * ud - y * k); };
      hdUi.ground = (g, x, y) => { const L = hd.groundAffineAt(x, y); g.setTransform(L[0] * ud, L[3] * ud, L[1] * ud, L[4] * ud, L[2] * ud, L[5] * ud); };
      hdUi.dir = (vx, vy) => Math.atan2(A[3] * vx + A[4] * vy, A[0] * vx + A[1] * vy);
    }
    // 血条与伤害数字
    drawCombatUI(this.ctx, game.combat, t, z);
    if (hd) game.npcs.drawLabelsHD(this.ctx, { left, top, right, bottom });   // 返工：NPC 名牌、对话气泡画在界面层（见 npc.ts labelsInUi）
    if (game.tianxiang.active) { game.tianxiang.drawScreen(this.ctx, W, H, this.dpr, GL, camX, camY, z); this.world(); }

    prof.add('R·特效关键图血条', _p); _p = prof.t();
    // ---------- 11. 名牌 ----------
    for (const l of visibleLocs) {
      const x = l.x * WORLD_SCALE, y = l.y * WORLD_SCALE;
      const explored = game.isExplored(x, y);
      if (!explored && !l.major) continue;
      const L = this.layout(l);
      hdUi.at?.(this.ctx, x, y + L.gh * LOC_SCALE * 0.36);
      this.drawLabel(l, x, y + L.gh * LOC_SCALE * 0.36, explored);
    }
    // 大地点（缩小时，距离远的也显示名牌）
    if (z < 0.6) for (const l of LOCATIONS) {
      if (!l.major || visibleLocs.includes(l)) continue;
      const x = l.x * WORLD_SCALE, y = l.y * WORLD_SCALE;
      if (x < left || x > right || y < top || y > bottom) continue;
      hdUi.at?.(this.ctx, x, y);
      this.drawLabel(l, x, y, game.isExplored(x, y));
    }
    hdUi.at = null; hdUi.ground = null; hdUi.dir = null; this.world();
    // LOD 波段平滑：建筑名牌 z∈[0.45,0.55] 渐显
    { const bldK = LOD.k(LOD.BAND.bld, z);
      if (hd && bldK > 0.01) {
        const prevAlpha = this.ctx.globalAlpha;
        if (bldK < 0.99) this.ctx.globalAlpha *= bldK;
        this.drawBuildingNames(hd, visibleLocs, z, W, H);
        this.ctx.globalAlpha = prevAlpha;
      }
    }
    if (hd) game.stall?.drawSigns(this.ctx, hd, W, H, this.uiDpr);   // 收官 D：摊主头顶的招牌（world/stall.ts，界面层）
    if (hd && game.dunkong?.ambush) this.drawAmbushPointer(hd, W, H);   // 第五轮：遁空被拦截时，拦截点在画面外就在屏幕边上指过去

    prof.add('R·名牌', _p); _p = prof.t();
    // v0.52.9：洞府门口的「进府」指引——以前走到洞口也不知道按什么，进去还容易以为是黑屏
    {
      const hh = game.ws.home;
      if (hh && hh.map === ACTIVE_MAP) {
        const hx = hh.x - 30, hy = hh.y + 60;
        const sx = W / 2 + (hx - camX) * z, sy = H / 2 + (hy - camY) * z;
        const dd = Math.hypot(hx - p.x, hy - p.y);
        if (dd < 520 && sx > -200 && sx < W + 200 && sy > -200 && sy < H + 200) {
          const near = dd < 320;
          const u = this.ctx;
          u.setTransform(dpr, 0, 0, dpr, 0, 0);
          u.globalAlpha = clamp(1 - (dd - 200) / 320, 0.35, 1);
          u.textAlign = 'center';
          u.font = `${near ? 17 : 15}px "Noto Serif SC", serif`;
          const label = near ? `进洞府（${IS_TOUCH ? '点' : keyLabel(bindOf('interact'))}）` : `洞府 · ${Math.max(1, Math.round(dd / 30))} 丈`;
          const tw = u.measureText(label).width;
          u.fillStyle = 'rgba(20,16,10,0.55)';
          u.fillRect(sx - tw / 2 - 8, sy - 44, tw + 16, 24);
          u.strokeStyle = near ? 'rgba(255,220,140,0.95)' : 'rgba(255,220,140,0.5)';
          u.lineWidth = 1.2; u.strokeRect(sx - tw / 2 - 8, sy - 44, tw + 16, 24);
          u.fillStyle = near ? '#fff2cc' : 'rgba(255,242,204,0.8)';
          u.fillText(label, sx, sy - 27);
          u.globalAlpha = 1;
          this.world();
        }
      }
    }
    // ---------- 12. 神识 ----------
    if (!GL) this.drawSense();
    prof.add('R·神识圈', _p); _p = prof.t();
    // Canvas2D 的「圈外记忆水墨」：对齐反编译版整屏铺色（圈内挖空），不是关掉
    if (!GL && !(game.revealAll && game.debugSeeAll)) {
      const sx = (W / 2 + (p.x - camX) * z) * dpr, sy = (H / 2 + (p.y - camY) * z) * dpr;
      this.sense.drawMemory(ctx, sx, sy, R * z * dpr, this.canvas.width, this.canvas.height, this.lowered >= 1);
      this.world();
    }
    prof.add('R·神识水墨', _p); _p = prof.t();

    // ---------- 13. 屏幕空间：天气、大区域名、纸纹 ----------
    const cdx = dt > 0 ? (camX - this.lastCam.x) / dt * z : 0, cdy = dt > 0 ? (camY - this.lastCam.y) / dt * z : 0;
    this.lastCam.x = camX; this.lastCam.y = camY;
    // 雨雪画在世界层（GL 模式下整屏雾/闪电的填色交给着色器）
    const overlayDpr = this.canvas.width / W;
    sceneCtx.setTransform(overlayDpr, 0, 0, overlayDpr, 0, 0);
    // 是否允许本帧上传世界层（见文件末 canUpload）：镜头在动、或有动画（换天象）、或本帧有粒子/特效时都要传
    this.sceneMoving = Math.abs(camX - this.lastUpCam.x) > 0.5 || Math.abs(camY - this.lastUpCam.y) > 0.5
      || game.tianxiang.active || this.particles.length > 0 || this.liveNow
      || (game.weather.kind !== 'clear' && game.weather.k > 0.04)
      || !!game.combat?.enemies?.some((e) => !e.dead && e.aggro);
    this.lastUpCam.x = camX; this.lastUpCam.y = camY;
    if (hd) this.sceneMoving = true;
    game.weather.noFills = GL;
    game.weather.shelter = hd ? game.hanshan?.shelter((x, y, h) => hd.project(x, y, h)) ?? null : null;   // r7：雨不沾撼山客的身（雨丝在他身边绕开）
    game.weather.draw(sceneCtx, W, H, dt, clamp(cdx, -800, 800), clamp(cdy, -800, 800));
    prof.add('R·雨雪', _p); _p = prof.t();
    // v0.48 空气层：远山长卷 / 天空意象 / 雨幕 / 雁阵 / 留白雾带（经调色）；月与星（不经调色）
    mood.update(dt, game, camX, camY);
    sceneCtx.setTransform(overlayDpr, 0, 0, overlayDpr, 0, 0);
    mood.drawBack(sceneCtx, W, H, game, camX, z, GL, t);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // 返工：立体画面是俯视镜头，看不到天——月亮和星河画上去会贴在屋顶、山上（大殿夜景上方那一弯月），立体画面里不画
    if (!hd) mood.drawSky(this.ctx, W, H, game, z, camX);
    // GL 模式下纸纹与暗角已由后期着色器一次算完，这里不再重复叠两张全屏图（每帧两次全屏混合）；
    // 非 GL 路径在 out 循环末尾统一调用一次 mood.drawPost。
    prof.add('R·意境空气层', _p); _p = prof.t();
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (z < 0.6) {
      const a = clamp((0.6 - z) / 0.3, 0, 1) * 0.55;
      this.ctx.globalAlpha = a;
      for (const b of BIG_LABELS) {
        const sx = W / 2 + (b.at[0] * WORLD_SCALE - camX) * z, sy = H / 2 + (b.at[1] * WORLD_SCALE - camY) * z;
        if (sx < -400 || sx > W + 400 || sy < -200 || sy > H + 200) continue;
        const spr = this.bigLabel(b.name, Math.round(b.size * 16 + 18));
        const w = spr.width / dpr, h = spr.height / dpr;
        this.ctx.drawImage(spr, sx - w / 2, sy - h / 2, w, h);
      }
      this.ctx.globalAlpha = 1;
    }
    if (GL) {
      this.ctx = sceneCtx; this.Z = sceneZ; this.ox = sceneOx; this.oy = sceneOy; this.dpr = sceneDpr;
      _p = prof.t();
      // 世界层几乎没变时（镜头静止、没有粒子/角色动作/天象/战斗），跳过本帧所有世界层绘制，GPU 继续用上一张纹理。
      // 这是省 CPU 最有效的一刀：静止时整帧从 ~14ms 压到 ~2ms。
      // 世界层每帧都重画、每帧都上传。
      // 以前这里「静止时最多每 8 帧传一次」：画布其实每帧都在重画，但 GPU 纹理 8 帧才换一次，
      // 玩家看到的世界约 7.5fps，草树摇摆一跳一跳。CPU 已按满帧画，省这一次上传没有意义。
      const up = true;
      this.lastLight = { night, dusk, gloom, dayK, mul: [mulR, mulG, mulB] };
      this.postGL(camX, camY, z, W, H, night, dusk, gloom, dayK, [mulR, mulG, mulB], R, up);
      prof.add(up ? 'R·GL合成(地表+上传)' : 'R·GL合成(沿用上帧)', _p);
      this.stats.ms = performance.now() - t0;
      return;
    }
    const month = Math.floor(game.day / 30) % 12;
    const key = Math.floor(month / 3) + ':' + Math.ceil(W) + 'x' + Math.ceil(H);
    if (key !== this.overlayKey) { this.buildOverlay(month); this.overlayKey = key; }
    if (this.overlay) ctx.drawImage(this.overlay, 0, 0, W, H);
    mood.drawPost(ctx, W, H, false);
    // 重伤时的血色暗角、倒下后的黑场
    const hpk = game.hero.hp;
    if (hpk < 0.35 && !game.hero.dead) {
      const a = (0.35 - hpk) / 0.35 * (0.45 + 0.15 * Math.sin(t * 5));
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(120,10,10,0)'); vg.addColorStop(1, `rgba(120,10,10,${a})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }
    if (game.modFlash.a > 0) { const [r, g2, b] = game.modFlash.c; ctx.fillStyle = `rgba(${r * 255 | 0},${g2 * 255 | 0},${b * 255 | 0},${Math.min(1, game.modFlash.a) * 0.8})`; ctx.fillRect(0, 0, W, H); }
    if (game.combat.fade > 0) { ctx.fillStyle = `rgba(10,8,6,${Math.min(1, game.combat.fade * 1.4)})`; ctx.fillRect(0, 0, W, H); }
    this.stats.ms = performance.now() - t0;
  }


  // ---------------------------------------------------------------- B 版：立体的秘境
  /** 秘境地面的分块（按 1024 一块，画进自己的画布）与墙体（一座「地点」，由一个个石块拼成）的缓存 */
  private realmCache: { key: string; chunks: Map<string, { canvas: HTMLCanvasElement; t: number }>; walls: LocLayout | null } | null = null;
  /**
   * 第五轮返工：进秘境之前（人走向云门 / 画的那一两秒，MijingSys.warm 每帧调一次）一帧备一点，换场那一帧 renderRealmHD 直接接过去：
   * 落脚那一屏的地面画布（一帧两张）→ 把它们传上显卡（一帧两张）→ 石柱那座「地点」→ 台底岩体、铁索、云海的网格与着色器 → 头一回画摆件的缓存。
   * 原来这些全挤在换场那一两帧里（走进画中洞天那一刻最长一帧三百多毫秒）。备好了返回 true。
   */
  private realmPre: { key: string; chunks: Map<string, { canvas: HTMLCanvasElement; t: number }>; todo: [number, number][]; up: HTMLCanvasElement[]; walls: LocLayout | null; stage: number; n: number } | null = null;
  prewarmRealm(spec: MjSpec, fi: number, F: MjFloor, at: { x: number; y: number }, withF: <T>(fn: () => T) => T): boolean {
    const hd = this.hd, M = this.game.mijing;
    if (!hd || !this.fx || typeof document === 'undefined' || M.active) return true;
    const key = spec.seed + ':' + fi + ':' + flagstoneVersion();
    let P = this.realmPre;
    if (P?.key !== key) {
      hd.preloadGround(null);
      hd.warmGround();   // 收官返工：地块网格的着色器在最开头就交去编（离换场还有一两秒，链接在显卡那边做完，换场那一帧不再等它）
      // 落脚之后头一帧看得到的那些块：按此刻的镜头缩放估一屏（俯角下纵向多看一截），近的先画
      const z = Math.max(0.3, this.game.cam.zoom), hw = this.W / 2 / z + 520, hh = this.H / 2 / z * 1.6 + 520, todo: [number, number][] = [];
      withF(() => { for (let cy = Math.floor((at.y - hh) / CHUNK); cy <= Math.floor((at.y + hh) / CHUNK); cy++) for (let cx = Math.floor((at.x - hw) / CHUNK); cx <= Math.floor((at.x + hw) / CHUNK); cx++) if (!F.isles || M.chunkHasFloor(cx * CHUNK, cy * CHUNK, (cx + 1) * CHUNK, (cy + 1) * CHUNK)) todo.push([cx, cy]); });
      todo.sort((a, b) => Math.hypot((a[0] + 0.5) * CHUNK - at.x, (a[1] + 0.5) * CHUNK - at.y) - Math.hypot((b[0] + 0.5) * CHUNK - at.x, (b[1] + 0.5) * CHUNK - at.y));
      P = this.realmPre = { key, chunks: new Map(), todo, up: [], walls: null, stage: 0, n: 0 };
      this.warmPieces(at, withF);   // 收官返工：落脚处的摆件、古阵先画一遍——画材在后面几帧里解码（原来到第 7 步才开始解码，换场那一帧还在等）
    }
    const T = THEMES[spec.theme], RES = 512;
    switch (P.stage) {
      case 0: {   // 地面画布：一帧两张
        for (let n = 0; n < 2 && P.todo.length; n++) {
          const [cx, cy] = P.todo.shift()!, cv = document.createElement('canvas'); cv.width = cv.height = RES;
          const c = cv.getContext('2d')!; c.setTransform(RES / CHUNK, 0, 0, RES / CHUNK, -cx * CHUNK * RES / CHUNK, -cy * CHUNK * RES / CHUNK);
          withF(() => M.drawFloorHD(c, cx * CHUNK, cy * CHUNK, (cx + 1) * CHUNK, (cy + 1) * CHUNK, flagstone(), `rgba(${T.ambient},0.16)`));
          P.chunks.set(cx + ',' + cy, { canvas: cv, t: 0 }); P.up.push(cv);
        }
        if (!P.todo.length) P.stage = 1;
        return false;
      }
      case 1: {   // 传上显卡：一帧两张
        for (let n = 0; n < 2 && P.up.length; n++) hd.preloadGround(P.up.shift()!);
        if (!P.up.length) P.stage = 2;
        return false;
      }
      case 2: P.walls = withF(() => M.wallLayout('#a9ada2', '#c9cbbf')); P.stage = 3; return false;
      case 3: {   // 台底岩体、铁索、云海：网格建好、着色器编好，先藏着（world 那条画法不画它）
        if (F.isles && F.bound) { const R3 = hd.realm(); R3.sync(key, F.isles, F.bridges ?? [], F.chains ?? [], F.bound, realmLook(spec.theme)); hd.gl.compile(hd.scene, hd.cam); hd.hideRealm(); }
        P.stage = 4; return false;
      }
      // 收官返工：只编不画不够——显卡那边头一回画时才生成真正的着色器（地块网格那一下在换场那一帧卡了 150 毫秒上下）。
      // 地块网格、台底岩体那一组、它们投影那一遍，一帧一样，在一张 16×16 的小图上实际画一遍
      case 4: hd.warmDraw(0); P.stage = 5; return false;
      case 5: if (F.isles && F.bound) hd.warmDraw(1); P.stage = 6; return false;
      case 6: if (F.isles && F.bound) hd.warmDraw(2); P.stage = 7; return false;
      case 7: {   // 落脚处一带的摆件、古阵：头一回画会建画法缓存，先往一张小画布上画一遍。
        // 收官返工：画材解码后的加工（调色、缩略、抠黑底）每帧只做两张，一帧画一遍不够——连画六帧，换场那一帧不再现做（原来那两帧各卡二三十毫秒）
        this.warmPieces(at, withF);
        if (++P.n >= 6) P.stage = 8;
        return false;
      }
    }
    return true;
  }
  /** 落脚处一带的摆件、古阵往一张小画布上画一遍：头一回画会开始解码画材、建画法缓存（只为预热，画出来的不用） */
  private warmPieces(at: { x: number; y: number }, withF: <T>(fn: () => T) => T) {
    const M = this.game.mijing, view = { left: at.x - 1400, top: at.y - 1000, right: at.x + 1400, bottom: at.y + 900 }, list: Drawable[] = [];
    const cv = (this.warmCanvas ??= document.createElement('canvas')); cv.width = cv.height = 64; const c = cv.getContext('2d')!;
    withF(() => { M.collect(list, view, this.game.time); for (const d of list) { c.save(); try { d.draw(c); } catch { /* 只为预热 */ } c.restore(); } });
  }
  private warmCanvas: HTMLCanvasElement | null = null;
  /**
   * 秘境在立体画面里的画法（用户 2026-11-13：有墙的窄通道「修仙施展不开」，要像演武台那样开阔）：
   * 一座座石台悬在留白的云雾里，石桥相连，没有墙；台面铺水墨石板，台沿画出石壁与落在云里的影；石台中间的石墩是矮石块；
   * 摆件、宝箱、妖物、人物都是立板；天光明亮。镜头、光影、后期与界外同一套。
   */
  private renderRealmHD(dt: number, hd: HdScene) {
    this.game.npcs.labelsInUi = false;   // 秘境画法没有界面层的名牌那一步：名牌照旧画进人物立板
    const t0 = performance.now();
    const game = this.game, M = game.mijing, F = M.floor!, cur = M.cur!, T = THEMES[cur.spec.theme];
    const z = game.cam.zoom, W = this.W, H = this.H, dpr = this.dpr, t = game.time, p = game.player, worldCtx = this.ctx;
    this.groundOn = false; this.skipSceneNow = false; this.stillFrames = 0;
    const tr = game.trauma, tk = tr * tr * 15 / z, rt = performance.now() / 1000;
    const camX = game.cam.x + (tk ? (Math.sin(rt * 41.3) + Math.sin(rt * 67.1) * 0.5) * tk : 0);
    const camY = game.cam.y + (tk ? (Math.cos(rt * 37.7) + Math.sin(rt * 59.3) * 0.5) * tk : 0);
    hd.yaw = game.camYaw; hd.cruiseW = 0; hd.begin(camX, camY, z, dpr); hd.setGpuGround(false); hd.setGroundBackdrop(null);
    const gb = hd.groundBounds(320), view = { left: gb.l, top: gb.t, right: gb.r, bottom: gb.b };
    // —— 地面：秘境的地砖，一块块画好交给立体场景（画材还在解码的头几息里隔一阵重画一次）
    const key = cur.spec.seed + ':' + cur.fi + ':' + flagstoneVersion();   // 石板图解码好了要重铺一遍
    if (this.realmCache?.key !== key) { const pre = this.realmPre?.key === key ? this.realmPre : null; this.realmCache = { key, chunks: pre ? pre.chunks : new Map(), walls: pre?.walls ?? null }; this.realmPre = null; hd.invalidateTerrain(); }   // 第五轮返工：进来之前备好的地面画布、墙接过来
    const RC = this.realmCache, chunks: { cx: number; cy: number; canvas: HTMLCanvasElement }[] = [], RES = 512;
    for (let cy = Math.floor(view.top / CHUNK); cy <= Math.floor(view.bottom / CHUNK); cy++) for (let cx = Math.floor(view.left / CHUNK); cx <= Math.floor(view.right / CHUNK); cx++) {
      // 石台群：这一块里没有台面也没有桥，就不建画布（放大后的秘境九成的块是空的云海）
      if (F.isles && !M.chunkHasFloor(cx * CHUNK, cy * CHUNK, (cx + 1) * CHUNK, (cy + 1) * CHUNK)) continue;
      const k = cx + ',' + cy; let e = RC.chunks.get(k);
      if (!e) {
        const cv = document.createElement('canvas'); cv.width = cv.height = RES;
        const c = cv.getContext('2d')!; c.setTransform(RES / CHUNK, 0, 0, RES / CHUNK, -cx * CHUNK * RES / CHUNK, -cy * CHUNK * RES / CHUNK);
        M.drawFloorHD(c, cx * CHUNK, cy * CHUNK, (cx + 1) * CHUNK, (cy + 1) * CHUNK, flagstone(), `rgba(${T.ambient},0.16)`);
        RC.chunks.set(k, e = { canvas: cv, t: cur.t });
      }
      e.t = cur.t;
      chunks.push({ cx, cy, canvas: e.canvas });
    }
    // 画布一张约 1 MB：留着的总数有上限（最远镜头一屏约四十块），最久没看到的先扔
    if (RC.chunks.size > 110) {
      const old = [...RC.chunks.entries()].sort((a, b) => a[1].t - b[1].t);
      for (let i = 0; i < old.length - 80; i++) RC.chunks.delete(old[i][0]);
    }
    hd.syncGround(chunks, CHUNK);
    // —— 墙：一座「地点」
    RC.walls ??= M.wallLayout('#a9ada2', '#c9cbbf');
    // 石台群：台底岩体、石桥桥身、铁索、台下的云海（凶险的主题是透着光的深渊）、篆文界壁
    if (F.isles && F.bound) {
      const R3 = hd.realm(), look = realmLook(cur.spec.theme);
      R3.sync(key, F.isles, F.bridges ?? [], F.chains ?? [], F.bound, look);
      R3.update(t);
    } else hd.hideRealm();
    hd.buildings.sync(RC.walls ? [{ id: 'mj:' + key, layout: RC.walls, x: REALM_OX, y: REALM_OY, tier: 0 }] : [], () => 0);
    this.ctx = hd.wctx;
    { const x = hd.decalXf(); this.Z = x.Z; this.ox = x.ox; this.oy = x.oy; this.world(); }
    const list = this._drawList; list.length = 0;
    M.collect(list, view, t);
    collectCombat(game.combat, list, view, t, dt);
    game.npcs.collect(list, view, t, dt);
    game.zhenfa.collect(list, view, t);
    game.yuanying.collect(list); game.shen?.collect(list);
    game.pets.collect(list);
    list.push({ y: p.y, k: 'D·主角', hx: p.x, hy: p.y, hb: charBox(1.12, p.st.lift + 40), draw: () => this.drawPlayer(dt) });
    modx?.collect(list);
    list.sort((a, b) => a.y - b.y);
    this.drawListHD(list, hd);
    this.world();
    this.updateParticles(dt);
    // —— 立体场景：洞里没有日头，光从正上方漫下来，整体按主题压暗
    this.hdTarget = this.stage!.worldTarget(this.stage!.W, this.stage!.H);
    hd.shadowsEnabled = this.lowered < 3;
    hd.setSun(0.4, 0, 0.08);   // 石台悬在天光里：亮堂、有清楚的影子
    hd.setClouds(game.time, 0); hd.setCloudDeck(null, dt);
    hd.render(this.hdTarget);
    this.ctx = worldCtx;
    worldCtx.setTransform(1, 0, 0, 1, 0, 0); worldCtx.globalAlpha = 1; worldCtx.globalCompositeOperation = 'source-over';
    this.Z = z * dpr; this.ox = W * dpr / 2 - camX * this.Z; this.oy = H * dpr / 2 - camY * this.Z; this.world();
    const Fx = this.fx;
    if (Fx) {
      const B2 = this.stage!.batch;
      B2.reset(camX, camY, z, W, H, this.stage!.atlas);
      B2.hd = hd; B2.gpuDecals = GPU_DECALS;
      Fx.update(dt);
      // 灯火：秘境里的灯、主角身周的一圈光
      for (const o of F.objs) if (o.kind === 'light' && !o.hidden && o.x > view.left - 200 && o.x < view.right + 200 && o.y > view.top - 200 && o.y < view.bottom + 200) {
        const fl = 0.85 + 0.15 * Math.sin(t * 7 + o.x * 0.01) * Math.sin(t * 3.1 + o.y * 0.01);
        B2.quad(0, o.x, o.y - 40, 300 * fl, 230 * fl, 0, 1, 0.78, 0.46, 0.22, 1);
      }
      drawCombatGL(Fx, game.combat, t, dt);
      Fx.drawRings(dt);
      Fx.drawParticles();
      Fx.flushBake(this.stage!.atlas);
      this.vfxSprites!.draw(game.combat, t);
    } else game.combat.fxq.length = 0;
    // 血条、伤害字等画在界面层
    this.ctx = this.uiCtx; this.dpr = this.uiDpr;
    this.Z = z * this.uiDpr; this.ox = W * this.uiDpr / 2 - camX * this.Z; this.oy = H * this.uiDpr / 2 - camY * this.Z; this.world();
    drawCombatUI(this.ctx, game.combat, t, z);
    this.ctx = worldCtx; this.dpr = dpr; this.Z = z * dpr; this.ox = W * dpr / 2 - camX * this.Z; this.oy = H * dpr / 2 - camY * this.Z;
    { const ac = this.atmo?.getContext('2d'); if (ac) ac.clearRect(0, 0, this.atmo.width, this.atmo.height); }
    const amb = T.ambient.split(',').map(Number), mulC = [255 - (255 - amb[0]) * 0.22, 255 - (255 - amb[1]) * 0.22, 255 - (255 - amb[2]) * 0.22];
    // 云影 / 未探索迷雾那一层是界外的东西：秘境里不要（否则整屏被界外的「未探索」盖成白纸）
    this.atmoOff = true;
    try { this.postGL(camX, camY, z, W, H, 0, 0, 0, 0.6, mulC, 1e6, false); } finally { this.atmoOff = false; }
    // 云门：秘境这一侧也盖同一层云（和界外那一侧是同一个函数、同一个流动，换边的那一刻两边都是满的）
    if (game.mijing.veil > 0.003) { const M = game.mijing, S = M.spot; hd.veilVoid(M.veil, game.time, 2.4, 0, S ? hd.gateSpot(S.x, S.y, 70, 240, M.core) : null); }   // 第五轮返工：门洞那团云只盖门心一带
    this.stats.ms = performance.now() - t0;
  }
  // ---------------------------------------------------------------- v0.54 秘境
  private renderRealm(dt: number, GL: boolean) {
    const t0 = performance.now();
    const { ctx, game } = this, M = game.mijing;
    const z = game.cam.zoom, W = this.W, H = this.H, dpr = this.dpr, t = game.time, p = game.player;
    this.groundOn = false; this.skipSceneNow = false; this.stillFrames = 0;
    const tr = game.trauma, tk = tr * tr * 15 / z, rt = performance.now() / 1000;
    const camX = game.cam.x + (tk ? (Math.sin(rt * 41.3) + Math.sin(rt * 67.1) * 0.5) * tk : 0);
    const camY = game.cam.y + (tk ? (Math.cos(rt * 37.7) + Math.sin(rt * 59.3) * 0.5) * tk : 0);
    const left = camX - W / 2 / z, top = camY - H / 2 / z, right = camX + W / 2 / z, bottom = camY + H / 2 / z;
    const view = { left, top, right, bottom };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#121014'; ctx.fillRect(0, 0, W, H);
    this.Z = z * dpr; this.ox = W * dpr / 2 - camX * this.Z; this.oy = H * dpr / 2 - camY * this.Z;
    this.world();
    M.drawFloor(ctx, view);
    const list = this._drawList; list.length = 0;
    M.collect(list, view, t);
    collectCombat(game.combat, list, view, t, dt);
    game.npcs.collect(list, view, t, dt);
    game.zhenfa.collect(list, view, t);
    game.yuanying.collect(list); game.shen?.collect(list);
    game.pets.collect(list);
    list.push({ y: p.y, k: 'D·主角', draw: () => this.drawPlayer(dt) });
    modx?.collect(list);
    list.sort((a, b) => a.y - b.y);
    this.drawList(list, ctx);
    this.world();
    this.updateParticles(dt);
    M.drawDark(ctx, view);
    const F = this.fx;
    if (GL && F) {
      const B = this.stage!.batch;
      B.reset(camX, camY, z, W, H, this.stage!.atlas);
      B.hd = null;
      F.update(dt);
      drawCombatGL(F, game.combat, t, dt);
      F.drawRings(dt);
      F.drawParticles();
      F.flushBake(this.stage!.atlas);
      this.vfxSprites!.draw(game.combat, t);
    } else game.combat.fxq.length = 0;
    this.world();
    if (!GL) drawCombatFx(ctx, game.combat, t);
    const sceneCtx = this.ctx, sceneZ = this.Z, sceneOx = this.ox, sceneOy = this.oy, sceneDpr = this.dpr;
    if (GL) {
      this.ctx = this.uiCtx; this.dpr = this.uiDpr;
      this.Z = z * this.uiDpr; this.ox = W * this.uiDpr / 2 - camX * this.Z; this.oy = H * this.uiDpr / 2 - camY * this.Z;
      this.world();
    }
    drawCombatUI(this.ctx, game.combat, t, z);
    if (GL) {
      this.ctx = sceneCtx; this.Z = sceneZ; this.ox = sceneOx; this.oy = sceneOy; this.dpr = sceneDpr;
      // 云影层在秘境里没有：清空，免得后期把大地图的云影叠上来
      const ac = this.atmo?.getContext('2d'); if (ac) ac.clearRect(0, 0, this.atmo.width, this.atmo.height);
      this.postGL(camX, camY, z, W, H, 0, 0, 0, 0.5, [255, 255, 255], 1e6, true);
    } else {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const hpk = game.hero.hp;
      if (hpk < 0.35 && !game.hero.dead) { const a = (0.35 - hpk) / 0.35 * (0.45 + 0.15 * Math.sin(t * 5)); const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); vg.addColorStop(0, 'rgba(120,10,10,0)'); vg.addColorStop(1, `rgba(120,10,10,${a})`); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H); }
      if (game.combat.fade > 0) { ctx.fillStyle = `rgba(10,8,6,${Math.min(1, game.combat.fade * 1.4)})`; ctx.fillRect(0, 0, W, H); }
    }
    this.stats.ms = performance.now() - t0;
  }

  // ---------------------------------------------------------------- GPU 地表参数
  /** 收官 B2：海兽的 HD 网格（到了海上才建） */
  private seaThings: SeaThings | null = null;
  /** r16 夜无赦：首领立板（有首领要画时才建） */
  private bossThings: BossThings | null = null;
  // ---------------------------------------------------------------- r7-fx3d：立体打击特效（hd2d/hsfx3d.ts）
  private hsFx: HsFx3D | null = null;
  /** r9-hitfeel：立体特效整组在正式画面里画过一遍（着色器编好了）；撤销那一帧临时改的显隐 */
  private hsPrimed = false;
  /** 有坑 / 地浪：立体画面的取高减去坑深（没有时一个判断都不多做） */
  private dentOn = false;
  /** 每帧、hd.render 之前：撼山客在附近（或你学了他的招）时先把着色器一种一种编好；有特效时更新、交给场景；坑交给地形着色器 */
  private fx3dFrame(hd: HdScene, dt: number) {
    const g = this.game, S = fx3dPeek(g);
    const want = !!S?.busy || !!this.hsFx?.busy;
    // r9-hitfeel：全游戏的打击感也用这套立体特效（命中「终」档、法术法器的四层爆炸）——画质不在低档就先建好、每帧编一种着色器（十几帧编完；不等到头一回爆炸时一口气全编、卡一大下）
    const near = !!g.hanshan?.ent || !!g.yewushe?.ent || g.hero.arts.some((a) => a.id === 'bxm_qianjunzhui' || a.id === 'bxm_pojie') || hfLevel(g) > 0;   // r16：夜无赦在附近也先编着色器
    if (!this.hsFx && (want || near)) { this.hsFx = new HsFx3D(hd); hd.buildings.fx.add(this.hsFx.group); }
    const F = this.hsFx; if (!F) return;
    // r9-hitfeel：长帧排查（CDP 采样）抓到打斗中 getProgramInfoLog ← onFirstUse 一下 125 毫秒——立体特效的着色器在另开的预热场景里编过，
    // 到了正式画面那一遍又等了一回。第一版改成「建好后头一帧在正式画面里整组画一遍」，结果十几个着色器挤在同一帧里同步编，量到一帧五到七秒。
    // 现在：建好后用 three 的 compileAsync（按正式场景的灯光 / 雾编，显卡驱动支持并行编译时不卡主线程）把整组交出去后台编，之后不再逐个预热
    if (near && !this.hsPrimed) {
      this.hsPrimed = true;
      const r = (hd as unknown as { gl?: { compileAsync?: (o: import('three').Object3D, c: import('three').Camera, s?: import('three').Scene) => Promise<unknown> } }).gl;
      let root: import('three').Object3D = F.group; while (root.parent) root = root.parent;
      if (r?.compileAsync) { const undo = primeGroup(F.group); try { void r.compileAsync(F.group, hd.cam, root as import('three').Scene).catch(() => { /* 编不了：真用到时再编 */ }); } catch { /* 同上 */ } undo(); }
      else this.hsPrimed = false;   // 老驱动没有 compileAsync：退回逐个预热
    }
    if (!want) { F.group.visible = false; if (near && !F.warmed && !this.hsPrimed) { const _w = prof.t(); F.warmStep(); prof.add('R·立体特效预热', _w); } }
    else { const _f = prof.t(); F.update(S, dt); prof.add('R·立体特效', _f); }
    const dn = S && !g.offWorld && (S.dents.length || S.ripples.length) ? HsFx3D.dentUniforms(S) : null;
    if (dn || this.dentOn) { hd.setDents(dn?.d ?? [], dn?.rip ?? null); this.dentOn = !!dn && (dn.d.length > 0 || !!dn.rip); }
    this.ywsFx3dFrame(hd, dt, S);   // r16：夜无赦的魔修特效
  }
  /** r16：夜无赦的魔修特效（hd2d/ywsfx3d.ts）：他在附近时建好、每帧预热一种着色器；有东西时更新 */
  private ywsFx: YwsFx3D | null = null;
  private ywsFx3dFrame(hd: HdScene, dt: number, S: ReturnType<typeof fx3dPeek>) {
    const want = !!S?.ywsBusy || !!this.ywsFx?.busy, near = !!this.game.yewushe?.ent;
    if (!this.ywsFx && (want || near)) { this.ywsFx = new YwsFx3D(hd); hd.buildings.fx.add(this.ywsFx.group); }
    const F = this.ywsFx; if (!F) return;
    if (!want) { F.group.visible = false; if (near && !F.warmed) F.warmStep(); return; }
    const _f = prof.t(); F.update(S, dt); prof.add('R·魔修特效', _f);
  }
  private realmWarned = false;
  /** 收官 P8（丁）：屋里的画法（hd2d/indoorGl.ts） */
  indoorGl: IndoorGl | null = null;
  /** 城镇破坏的立体画面（hd2d/townwreckGl.ts） */
  townGl: TownWreckGl | null = null;
  /** 收官 P8（丁）：画中洞天的卷轴、离屏画、走进画里时盖的那层画（hd2d/huajuanGl.ts） */
  huajuanGl: HuajuanGl | null = null;
  private atmoOff = false;
  private groundWanted = false; private groundSet = false; groundOn = false;
  private gSeg = new Float32Array(MAX_SEG * 16);
  private gZone = new Float32Array(MAX_ZONE * 4);
  private gTown = new Float32Array(MAX_TOWN * 4); private gTownS = new Int32Array(MAX_TOWN * 4);
  /** 地表缓存需要重画时才调用：收集缓存范围内（中心 camX,camY，半宽 hw0/hh0）的河段、路段、城镇 */
  private segProvider: SegProvider = (camX, camY, hw0, hh0) => this.groundSegs(camX, camY, hw0, hh0);
  /** 地表缓存分辨率（每 CSS 像素纹素数），随画质自适应 */
  groundScale = 1.25;
  private groundSegs(camX: number, camY: number, hw0: number, hh0: number): GroundSegs {
    const game = this.game, T = game.terrain, seg = this.gSeg, ROW = MAX_SEG * 4;
    const hw = hw0 + 60, hh = hh0 + 60;
    const cull = (A: Float32Array, row: number, pad: number) => {
      let n = 0;
      for (let q = 0; q < A.length && n < MAX_SEG; q += 8) {
        const ax = A[q] - camX, ay = A[q + 1] - camY, bx = A[q + 2] - camX, by = A[q + 3] - camY, m = A[q + 4] + pad;
        if ((ax > bx ? ax : bx) < -hw - m || (ax < bx ? ax : bx) > hw + m || (ay > by ? ay : by) < -hh - m || (ay < by ? ay : by) > hh + m) continue;
        const o = row * ROW + n * 4, o2 = o + ROW;
        seg[o] = ax; seg[o + 1] = ay; seg[o + 2] = bx; seg[o + 3] = by;
        seg[o2] = A[q + 4]; seg[o2 + 1] = A[q + 5]; seg[o2 + 2] = A[q + 6]; seg[o2 + 3] = 0;
        n++;
      }
      return n;
    };
    const nRiv = cull(T.rivSegW, 0, 820), nRoad = cull(T.roadSegW, 2, 200);
    let nTown = 0;
    for (const l of LOCATIONS) {
      if (nTown >= MAX_TOWN) break;
      if (l.type !== 'city' && l.type !== 'town') continue;
      const [hole, RR] = T.fieldR(l);
      const lx = l.x * WORLD_SCALE - camX, ly = l.y * WORLD_SCALE - camY;
      if (Math.abs(lx) > hw + RR + 400 || Math.abs(ly) > hh + RR + 400) continue;
      const o = nTown * 4;
      this.gTown[o] = lx; this.gTown[o + 1] = ly; this.gTown[o + 2] = RR; this.gTown[o + 3] = (hash2(l.x, l.y, 77) - 0.5) * 0.7;
      this.gTownS[o] = (l.x * 7) | 0; this.gTownS[o + 1] = (l.y * 13) | 0; this.gTownS[o + 2] = hole | 0;
      nTown++;
    }
    // 第三十步：魔道宗门 / 凶地周边的地域底色（取离缓存中心最近的若干个）
    const zs: [number, number, number, number, number][] = [];
    for (const z of groundZones()) {
      const lx = z.x - camX, ly = z.y - camY;
      if (Math.abs(lx) > hw + z.r * 1.2 || Math.abs(ly) > hh + z.r * 1.2) continue;
      zs.push([lx, ly, z.r, z.t, lx * lx + ly * ly]);
    }
    zs.sort((a, b) => a[4] - b[4]);
    const nZone = Math.min(MAX_ZONE, zs.length);
    for (let i = 0; i < nZone; i++) { const o = i * 4; this.gZone[o] = zs[i][0]; this.gZone[o + 1] = zs[i][1]; this.gZone[o + 2] = zs[i][2]; this.gZone[o + 3] = zs[i][3]; }
    return { seg: seg.slice(), nRiv, nRoad, town: this.gTown.slice(0, nTown * 4), townS: this.gTownS.slice(0, nTown * 4), nTown, zone: this.gZone.slice(0, nZone * 4), nZone };
  }
  private groundView(camX: number, camY: number, z: number, W: number, H: number): GroundView {
    if (this.hd) {
      // HD2D：缓存覆盖屏幕四角投到地面的外接矩形（倾斜 / 旋转后不再是轴对齐屏幕框），后期按逆仿射从屏幕采样
      const b = this.hd.groundBounds(0);
      return { camX: (b.l + b.r) / 2, camY: (b.t + b.b) / 2, zoom: z, cssW: (b.r - b.l) * z, cssH: (b.b - b.t) * z, season: this.game.season, scale: Math.min(this.groundScale, this.dpr), inv: this.hd.inverse(), screenW: W };
    }
    return { camX, camY, zoom: z, cssW: W, cssH: H, season: this.game.season, scale: Math.min(this.groundScale, this.dpr) };
  }

  // ---------------------------------------------------------------- WebGL 后期
  private postGL(camX: number, camY: number, z: number, W: number, H: number, night: number, dusk: number, gloom: number, dayK: number, mul: number[], R: number, uploadScene = true) {
    const game = this.game, p = game.player, st = this.stage!, F = this.fx!;
    const wt = game.weather;
    const month = Math.floor(game.day / 30) % 12;
    const tint: [number, number, number, number] = month < 3 ? [0.7, 0.86, 0.67, 0.05] : month < 6 ? [1, 0.9, 0.63, 0.05] : month < 9 ? [0.9, 0.59, 0.31, 0.07] : [0.78, 0.84, 0.94, 0.12];
    const tierS = TIERS[Math.min(5, game.hero.realm)];
    const hd = this.hdTarget ? this.hd : null;
    const heroScreen = hd ? hd.ground(p.x, p.y) : { x: W / 2 + (p.x - camX) * z, y: H / 2 + (p.y - camY) * z };
    const sx = heroScreen.x, sy = heroScreen.y;
    const hpk = game.hero.hp;
    const hurt = (hpk < 0.35 && !game.hero.dead ? (0.35 - hpk) / 0.35 * (0.45 + 0.15 * Math.sin(game.time * 5)) : 0) + game.hurtFlash * 0.35;
    const k = wt.k;
    const fog: [number, number, number, number] = wt.kind === 'sand' ? [0.77, 0.63, 0.43, 0.28 * k] : wt.kind === 'fog' ? [0.9, 0.91, 0.89, 0.18 * k] : [0, 0, 0, 0];
    const mind = game.story?.mind ?? 0;
    const tintM: [number, number, number, number] = mind > 0.01 ? [tint[0] + (0.55 - tint[0]) * mind, tint[1] + (0.12 - tint[1]) * mind, tint[2] + (0.14 - tint[2]) * mind, tint[3] + 0.38 * mind] : tint;
    const P: PostParams = {
      t: game.time,
      mul: [mul[0] / 255, mul[1] / 255, mul[2] / 255],
      warm: dayK > 0.05 ? 0.22 * dayK * (1 - dusk) : 0,
      dusk: dusk > 0.03 ? dusk : 0,
      sense: { x: sx, y: sy, R: R * z, on: !(game.revealAll && game.debugSeeAll), ink: tierS.ink.map((v) => v / 255) as [number, number, number], glow: tierS.glow.map((v) => v / 255) as [number, number, number], hide: this.sense.hidden, alarm: this.sense.alarm },
      atmo: this.atmoOff ? null : hd ? { canvas: this.atmo, ...this.atmoRect } : { canvas: this.atmo, x: W / 2 + (this.atmoRect.x - camX) * z, y: H / 2 + (this.atmoRect.y - camY) * z, w: this.atmoRect.w * z, h: this.atmoRect.h * z },
      fog, fogBands: wt.kind === 'fog' ? k : 0,
      flash: game.modFlash.a > Math.max(game.tianxiang.flash, wt.flash * 0.55) ? [...game.modFlash.c, Math.min(1, game.modFlash.a)] : game.tianxiang.flash > wt.flash ? [game.tianxiang.flashCol[0], game.tianxiang.flashCol[1], game.tianxiang.flashCol[2], Math.min(1, game.tianxiang.flash * 0.9)] : [0.92, 0.94, 1, wt.flash * 0.55],
      tint: (() => { const mm = mood.enabled ? moodMask(game.dayPhase, game.night, wt.kind, wt.k) : [1, 1, 1, 0]; const ms = mm[3] * 0.55; if (ms < 0.005) return tintM; const ta = tintM[3] + ms; return [(tintM[0] * tintM[3] + mm[0] * ms) / ta, (tintM[1] * tintM[3] + mm[1] * ms) / ta, (tintM[2] * tintM[3] + mm[2] * ms) / ta, Math.min(0.55, ta)] as [number, number, number, number]; })(),
      vig: 1 + mind * 0.8, hurt: Math.min(0.8, hurt + mind * 0.18), fade: Math.min(1, game.combat.fade * 1.4),
      aberr: (game.trauma > 0.25 ? (game.trauma - 0.25) * 1.2 : 0) + game.aberrKick * 0.9,
      bloom: 0.9, grain: grainAmount(), ink: game.combat.brawl.impact?.inkK() ?? 0,   // r7 黑白闪（world/impactfx.ts）
      shocks: F.shocks.map((s) => {
        const batch = st.batch, previous = batch.billboard;
        batch.billboard = s.anchor; batch.pt(s.x, s.y); batch.billboard = previous;
        return { x: batch.ox, y: batch.oy, r: s.r * batch.os, amp: s.amp * Math.min(1.5, z * 1.2) };
      }),
      // 高山模式下神识圈外的水墨留白减淡：保留一半颜色，圈外的山形和岩色还看得见（样板阶段的取值，待定）
      sat: MOUNTAINS ? 0.5 : 0,
      // 高山模式：视距之外交给远山雾（雾色取纸色偏青，之后照常过昼夜调色）
      // 高山模式：视距之外交给远山雾（雾色取纸色偏青，之后照常过昼夜调色）
      haze: MOUNTAINS && hd?.persp ? { start: hd.viewDistance * 1.5, end: hd.viewDistance * 2.0, strength: 0.94, color: [0.86, 0.88, 0.865] as const } : undefined,
      ground: this.groundOn ? { view: this.groundView(camX, camY, z, W, H), provider: this.segProvider } : null,
      // 绝域：海况交给后期着色器。r10：离岸距离场还在分帧算的那几秒（开局、读档后），绝域按「离图边多远」估了个 2000 的占位深度、
      // 报「在海里」——人在陆上时这是假的，不交给后期（否则要为它现编一份冷编十几二十秒的海面着色器）；人真在海上时 jueyu.tick 会当场把场算完
      sea: game.jueyu.F.ready ? game.jueyu.post(sx, sy) : null,
      // 遁空：人物和航向都按屏幕位置给后期（取人物腰身的高度，前方一点取同样的海拔，方向才不受地势影响）
      warp: (() => {
        const dk = game.dunkong;
        if (!hd || (dk.k < 0.004 && dk.spool <= 0)) return brawlWarp(game, hd);   // 不在遁空：近战的速度线（欺身、被打飞）借这道拉丝
        const top = hd.heightAt(p.x, p.y) + (p.st.lift + 46) * hd.boost;
        const at = hd.projectAbsolute(p.x, p.y, top), ahead = hd.projectAbsolute(p.x + Math.cos(dk.heading) * 400, p.y + Math.sin(dk.heading) * 400, top);
        const dx = ahead.x - at.x, dy = ahead.y - at.y, dl = Math.hypot(dx, dy) || 1;
        return { k: dk.k, burst: dk.burst, spool: dk.spool, t: dk.clock, x: at.x, y: at.y, dx: dx / dl, dy: dy / dl, color: DUNKONG_COLOR };
      })(),
    };
    // P2：高动态范围、点光源、时辰分色调、高度雾（界内立体画法、画质不是最低档、设置没关时）
    if (hd && this.gfxOn && !this.postPlain) {
      const B0 = hd.buildings; B0.setEmission(st.worldIsHdr ? 1.6 : 0);
      P.hdr = st.worldIsHdr;
      P.lights = this.lightsReady ? this.lights : null;
      const gloom0 = clamp(gloom, 0, 1);
      P.grade = gradeFor(game.dayPhase, night, gloom0);
      // 清晨天光未亮透：黄昏的那层橙色柔光在清晨减半，金色交给分色调（同一层橙色早晚都用，早上就分不出是晨是昏）
      // 黄昏那层也收一些：整片的橙色柔光会把画面洗平，橙紫的层次交给分色调（亮部橙、暗部紫）
      P.dusk *= game.dayPhase < 0.5 ? 0.45 : 0.5;
      if (this.gfxFog) P.heightFog = fogFor(game.dayPhase, night, gloom0, wt.kind === 'fog' ? k : 0, hd.viewDistance, hd.heightAt(p.x, p.y), MOUNTAINS);
      // 返工：绝域（海、流沙、浮冰、熔岩、冥河、瘴泽）里介质的画面在后期里自己画，自带视野收拢和鬼雾：
      // 我的高度雾、分色调、圈外压暗都不叠上去（叠了会把介质洗成一片平色、夜里鬼船整条看不见）
      if (P.sea) { P.heightFog = null; P.grade = null; P.inkDark = false; }
      { const dbg = (globalThis as { __gfxDbg?: string }).__gfxDbg ?? '';   // 截图排查用：逐项关掉看是哪一项
        if (dbg.includes('fog')) P.heightFog = null; if (dbg.includes('grade')) P.grade = null; if (dbg.includes('hdr')) P.hdr = false; if (dbg.includes('light')) P.lights = null; }
    } else hd?.buildings.setEmission(0);
    this.lightsReady = false;
    if (this.postPlain) { P.tint = [1, 1, 1, 0]; P.vig = 1; P.warm = 0; P.dusk = 0; P.sat = 0; P.haze = undefined; }
    if (P.sea) { const k = 1 - Math.min(0.85, P.sea.dark); P.fog = [P.fog[0], P.fog[1], P.fog[2], P.fog[3] * k]; P.fogBands *= k; }   // 绝域：深海里寻常的雾天不再把画面刷白（那里有自己的鬼雾和视野收拢）
    P.mono = hs3Post(game, hd, W, H, camX, camY, z);   // 撼山客第三批：天地变黑白、远山缺口、定格特写（gl/hsmoves3gl.ts）
    // r7-fx3d：空间扭曲冲击波（球心、半径投到屏幕上）；终结技的白闪两帧
    P.dist = hd && this.hsFx?.group.visible ? this.hsFx.postDist() : null;
    { const wk = game.combat.brawl.impact?.whiteK() ?? 0; if (wk > 0) P.flash = [1, 0.985, 0.95, wk]; }
    P.world = this.hdTarget;
    if (hd) P.worldCamera = {
      inverse: hd.inverseViewProjection, x: p.x, y: p.y, zoom: z,
      focusDepth: hd.depthAt(p.x, p.y, hd.heightAt(p.x, p.y) + p.st.lift * hd.boost) * 0.5 + 0.5,
      depthRange: hd.cam.far - hd.cam.near, near: hd.cam.near, far: hd.cam.far, perspective: hd.persp,
      viewProj: hd.viewProj, projScale: hd.projScale, eye: hd.eye,
    };
    st.frame(this.canvas, W, H, st.W / W, P, uploadScene);
    // 虚空挪移：甬道画在合成好的世界之上；穿行时把名牌血条那层界面画布藏起来
    const ny = this.game.nuoyi, fade = hd ? ny.fade : 0;
    if (hd && fade > 0.003) {
      const style = NUOYI_STYLE[ny.kind];
      const B = TUNNEL_BLADE;
      // 收官返工：进出甬道不再整屏淡入淡出、白闪，改成洞口张开（进阵：洞口在主角脚下的阵纹里；出阵：在甬道尽头）
      const ir = ny.iris, foot = ir && !ir.out ? hd.ground(this.game.player.x, this.game.player.y) : null;
      hd.renderPassage({ time: ny.clock, fade, flash: 0, exiting: ny.exiting, swayX: ny.swayX, swayY: ny.swayY, wall: style.wall, light: style.light, cut: ny.cut, surge: ny.surge, surgeDepth: SURGE_DEPTH,
        iris: ir ? { out: ir.out, k: ir.k, x: foot?.x ?? this.W / 2, y: foot?.y ?? this.H / 2 } : undefined },
        (canvas) => this.paintHero(canvas),
        ny.riders.map((r) => ({ paint: (canvas: HTMLCanvasElement) => this.paintFigure(canvas, r.look, r.st), x: r.x, y: r.y, z: r.z, hostile: r.hostile })),
        // 收官 P5：追兵掷来的飞剑
        ny.blades.map((b) => { const r = ny.riders[b.from]; return { fx: r?.x ?? 0, fy: r?.y ?? 0, fz: r?.z ?? 150, sx: b.sx, sy: b.sy, sz: b.sz,
          warn: Math.min(1, b.t / B.warn), fly: b.t < B.warn ? 0 : Math.min(1, (b.t - B.warn) / B.fly), after: Math.max(0, b.t - B.warn - B.fly) * (b.state === 'hit' || b.state === 'miss' ? 1 : 0), hit: b.state === 'hit' }; }));
    }
    const hideUi = hd && ny.cover > 0.5 ? '0' : '';
    if (this.domCanvas.style.opacity !== hideUi) this.domCanvas.style.opacity = hideUi;
    // 往天外升降：界内那一段盖一层云气；从天外降回来、界内的地面还在备着时，仍画界外的画面盖在上面
    const xk = this.game.xukong;
    if (hd && xk.inVoid && xk.warming) this.drawXukongScene(0.016, hd);
    else if (hd && xk.corridor && xk.cloud > 0.003) hd.veilVoid(xk.cloud * this.hsThin(), xk.clock, Math.log(xk.h) * 3, this.game.night);
    // 秘境的云门：走近门心，这层云越来越浓（world/mijing.ts）
    else if (hd && this.game.mijing.veil > 0.003) { const M = this.game.mijing, S = M.spot; hd.veilVoid(M.veil, this.game.time, 2.4, this.game.night, S ? hd.gateSpot(S.x, S.y, 70, 240, M.core) : null); }   // 第五轮返工：门洞那团云只盖门心一带
    if (hd) (this.huajuanGl ??= new HuajuanGl(hd)).overlay(this.game);   // 收官 P8（丁）：画中洞天——离屏画按需重画；走进画里时那层画铺满屏幕、进去后洇开散去
    if (hd && (xk.ripple > 0.004 || xk.pushing > 0.04)) drawXukongOverlay(this.uiCtx, W, H, this.uiDpr, this.game, null, this.xukongGlyphs ??= glyphAtlas());
  }

  // ---------------------------------------------------------------- 界内的体积云
  /** 界内能不能画体积云：立体画面、不是高山模式（它有自己的云海）、画质不在最低两档 */
  private get volumetric(): boolean { return !!this.hd && !MOUNTAINS && this.lowered < 3; }
  /** 低云的云量随天气增减 */
  private cloudCover(): number { const k = this.game.weather.kind; return k === 'clear' ? 0.42 : k === 'sand' ? 0.38 : k === 'fog' ? 0.62 : k === 'storm' ? 0.8 : 0.68; }   // 界内要看得见地面：晴天只留稀疏的几朵
  private cloudGround = 0;
  /**
   * r7-polish：被撼山客一拳打穿云层、斗法、一脚踢回来的那一趟（xukong.force 推着升降，或第三批的 trip 还在走）：
   * 穿云的那层云气、界内的低云、天外看下来的近地低云都淡一半——无缝、不闪白，地面和人一直看得清（平时自己飞出天穹照旧）
   */
  private hsThin(): number { const g = this.game; return g.xukong.force || hs3Peek(g)?.trip ? 0.5 : 1; }
  /**
   * 界内这一帧的低云：贴近地面的一层（见 LOW_CLOUD），飞到高空时在脚下成云海；低飞、走路时不显示——
   * 镜头是从上往下看的，云若在人头顶上就把人挡住了。和从天外看这一界时近地面的那层是同一层云（同一张天气图、同一份噪声）。
   */
  private worldCloudDeck(hd: HdScene, dt: number): CloudDeck | null {
    const g = this.game, p = g.player;
    const k = Math.max(0, Math.min(1, (p.z - LOW_CLOUD.showFrom) / (LOW_CLOUD.showFull - LOW_CLOUD.showFrom)));
    // 云层跟着脚下的地势缓缓起落
    this.cloudGround += (hd.heightAt(p.x, p.y) - this.cloudGround) * Math.min(1, dt * 0.6);
    if (k <= 0.004 || !this.volumetric) return null;
    const r = realmOfMap(ACTIVE_MAP), c = voidToPoint(ACTIVE_MAP, r.x, r.y), W = realmWeather(r);
    const thin = this.hsThin();
    return { x: c.x, z: c.y, rx: r.rx * VOID_SCALE, ry: r.ry * VOID_SCALE, ground: this.cloudGround, base: LOW_CLOUD.base, top: LOW_CLOUD.top, tile: LOW_CLOUD.tile,
      threshold: W.threshold, scale: W.scale / VOID_SCALE, outline: W.outline, tint: r.color, time: g.time, fade: k * k * (3 - 2 * k) * thin, night: 0, cover: this.cloudCover(), haze: 0, dense: LOW_CLOUD.dense, floor: LOW_CLOUD.floor };
  }

  // ---------------------------------------------------------------- 虚空
  private xukongHome: HomeMap | null = null;
  private xukongDetail: GroundDetail | null = null;
  private xukongGlyphs: HTMLCanvasElement | null = null;
  /**
   * 往天外升之前 / 从天外降下来时，把脚下的细节备好：着色器先编好，那张图的地形在后台建，再现画两块近地面的细节图。
   * 每帧调一次，返回备好了没有（xukong.ts 据此决定能不能换手）。
   */
  xukongPrepare(map: MapId, x: number, y: number): boolean {
    const hd = this.hd; if (!hd) return true;
    const warm = hd.warmVoid(HOME);   // 着色器编好、体积云的立体噪声算好
    (this.xukongHome ??= new HomeMap()).update();
    return (this.xukongDetail ??= new GroundDetail()).request(map, x, y) && warm;
  }
  /** 身在界外时的一帧：星渊与诸界（立体，见 hd2d/voidscene.ts），上面盖界名和涟漪 */
  private renderXukong(dt: number, hd: HdScene) {
    this.groundOn = false; this.skipSceneNow = false; this.stillFrames = 0;
    this.drawXukongScene(dt, hd);
    if (this.domCanvas.style.opacity !== '') this.domCanvas.style.opacity = '';
  }
  /** 这一帧虚空画面的取景与内容。arena：给斗法场垫底（人物和交手的对手在立体场景里画，这里都不画） */
  private xukongView(dt: number, hd: HdScene, arena: boolean): VoidView {
    const game = this.game, xk = game.xukong, dk = game.dunkong, H = this.H;
    const home = this.xukongHome ??= new HomeMap();
    home.update();
    const V = xk.view(H, hd.boost), ref = xk.ref;
    // 悬在别界上空时，在后台把它的山河建出来——走近了才看得清真容
    const refMap = ref === HOME ? null : (`realm-${ref.index}` as MapId);
    if (refMap && xk.over === ref) prebuildTerrain(refMap, 4);
    const detail = this.xukongDetail, own = detail && detail.mapId && realmOfMap(detail.mapId) === ref;
    const refView = refMap ? mapOverview(refMap) : null;
    // 人物：按真实的大小画，但在画面上不小于三十来个像素（升高后人相对大地早已小得看不见）
    const figure = 90 * PLAYER_SCALE / VOID_SCALE * V.pxPerUnit, k = Math.max(1, 34 / Math.max(0.01, figure));
    // 收官 P9：交手那一刻网格换立板——立板先排好（交接中的立板带不透明度），交接中的网格模型跟在飞行平面那一层的东西后面
    const handoff: VoidThing[] = [], figures = arena ? [] : this.xukongFigures(k, handoff, V.heroY);
    const near = xk.lift > 0.5 ? xk.life.near : [];
    return {
      time: game.time, dt, x: xk.x, y: xk.y, heroY: V.heroY,
      cam: { tx: V.tx, ty: V.ty, ground: V.ground, D: V.D, yaw: game.camYaw || 0, pitch: hd.pitch },
      vx: xk.vx, vy: xk.vy, streak: arena ? 0 : dk.k, spool: arena ? 0 : dk.spool,
      cloud: xk.cloud * this.hsThin(), high: xk.lift, night: game.night, flow: Math.log(xk.h) * 3,
      // 贴地的那层低云：从界内带出来，升高后薄得看不见了就不画
      lowCloud: (this.volumetric ? 1 - Math.max(0, Math.min(1, (xk.lift - 0.012) / 0.02)) : 0) * this.hsThin(), cover: this.cloudCover(),
      realms: xk.realms, homeMap: home.canvas, homeRev: home.rev,
      things: handoff.length ? near.concat(handoff) : near, thingsFade: Math.max(0, Math.min(1, (xk.lift - 0.5) / 0.3)),
      detail: { realmId: ref.id, map: refView, rev: ref.index, patches: own ? detail!.patches() : [null, null] },
      heroW: arena ? 0 : 340 * PLAYER_SCALE / VOID_SCALE * k, heroFoot: 330 * PLAYER_SCALE / VOID_SCALE * k,
      figures, fight: xk.fight.camK,
    };
  }
  /**
   * 虚空里别的立板：交手中（镜头还没拉到位）的对手、追出来的追兵。和人物一样放大到看得见。
   * 收官 P9：从网格模型交接过来的虚空兽，交接中的网格模型放进 meshes（和立板同一位置、同一朝向、同样大小地交接，见 VoidFight.handoff）
   */
  /** 第五轮返工：虚空立板上每种妖兽实际画出来的身子占画布多大（宽占几成、中心在画布高的几成处） */
  private figBox = new Map<string, { w: number; h: number; cy: number; n: number }>();
  private xukongFigures(k: number, meshes: VoidThing[] = [], heroY = 0): VoidFigure[] {
    const xk = this.game.xukong, F = xk.fight, out: VoidFigure[] = [];
    const add = (key: string, e: Enemy, x: number, y: number) => {
      if (e.def.kind === 'human' && e.look && e.cs) {
        const st = e.cs, look = e.look;
        out.push({ key, x, y, w: 340 * PLAYER_SCALE / VOID_SCALE * k, foot: 330 * PLAYER_SCALE / VOID_SCALE * k, cw: 384, ch: 448, paint: (c) => this.paintFigure(c, look, st) });
      } else if (e.def.look) {
        const sz = e.def.look.size;
        out.push({ key, x, y, w: 300 * sz / VOID_SCALE * k, foot: 240 * sz / VOID_SCALE * k, cw: 512, ch: 480, paint: (c) => { this.paintBeast(c, e); const q = this.figBox.get(e.def.id); if (!q || q.n < 12) { const m = alphaBox(c); this.figBox.set(e.def.id, { ...m, n: (q?.n ?? 0) + 1 }); } } });   // 第五轮返工：记下画出来的身子占画布多大（交接时网格按它收拢）；头十来回都重量（贴图可能还没解码完）
      }
    };
    if (F.on && !F.handed) for (const f of F.foes) if (!f.e.dead) {
      const n = out.length; add('f' + f.src.id, f.e, 0, 0);
      const fig = out[n]; if (!fig) continue;
      if (!this.figBox.has(f.e.def.id) && typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = fig.cw; c.height = fig.ch; fig.paint(c); }   // 立板还没画过（交接前段它是透明的）：先在一张小画布上画一回量出来
      const bx = this.figBox.get(f.e.def.id);   // 第五轮返工：按立板上实际画出来的身子定网格收拢到多大、停在多高
      const h = F.handoff(f, fig.w, this.game.camYaw || 0, bx ? fig.w * bx.w : 0, bx ? fig.w * fig.ch / fig.cw * bx.h : 0);
      fig.x = h.x; fig.y = h.y; fig.alpha = h.figAlpha;
      if (h.mesh) meshes.push({ id: 'handoff-' + f.src.id, kind: 'beast', name: f.src.name, hot: true, ...h.mesh, lift: heroY + fig.foot - fig.w * fig.ch / fig.cw * (bx ? bx.cy : 0.5) });
      if (h.figAlpha < 0.004) out.splice(n, 1);
    }
    const c = xk.life.chaser;
    if (c && !c.fight && !c.enemy.dead) add('chaser', c.enemy, c.x, c.y);
    // 收官 E3：被一拳砸向下界的流星（或者把你砸下去、正追下来的那个）：一路往下画，火尾由 xukongfx 的叠层画
    const m = xk.fall.figure();
    if (m && !m.e.dead) { const n = out.length; add('fall', m.e, m.vx, m.vy); if (out[n]) out[n].h = -xk.refDepth + m.h / VOID_SCALE; }
    return out;
  }
  /** 把一头妖兽画进一张小画布（虚空里的立板）：和界内同一套画法 */
  private paintBeast(canvas: HTMLCanvasElement, e: Enemy) {
    const g = canvas.getContext('2d')!, L = e.def.look!, s = L.size;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height);
    const k = canvas.width / (300 * s);
    g.setTransform(k, 0, 0, k, canvas.width / 2, 240 * s * k);
    e.anim.t += 0.016; e.anim.flying = true;
    drawBeast(g, L, 0, 0, e.facing || 1, e.anim, 1);
  }
  private drawXukongScene(dt: number, hd: HdScene) {
    const scene = hd.renderVoid(this.xukongView(dt, hd, false), (canvas) => this.paintHero(canvas));
    drawXukongOverlay(this.uiCtx, this.W, this.H, this.uiDpr, this.game, scene, this.xukongGlyphs ??= glyphAtlas());
  }

  /**
   * 虚空里斗法（镜头拉到位以后）：界内那一套画法——人物、敌人、法术、法宝、伤害字——画在一块没有地面的斗法场上，
   * 底下垫着这一帧实时画的虚空（同一个取景），所以和交手前、交手后看到的是同一片星渊。
   */
  private arenaWarned = false;
  private postPlain = false;
  private renderVoidArena(dt: number, hd: HdScene) {
    const t0 = performance.now();
    const game = this.game, z = game.cam.zoom, W = this.W, H = this.H, dpr = this.dpr, t = game.time, p = game.player, worldCtx = this.ctx;
    this.groundOn = false; this.skipSceneNow = false; this.stillFrames = 0;
    if (this.realmCache) { this.realmCache = null; hd.invalidateTerrain(); }
    hd.hideRealm();
    const tr = game.trauma, tk = tr * tr * 15 / z, rt = performance.now() / 1000;
    const camX = game.cam.x + (tk ? (Math.sin(rt * 41.3) + Math.sin(rt * 67.1) * 0.5) * tk : 0);
    const camY = game.cam.y + (tk ? (Math.cos(rt * 37.7) + Math.sin(rt * 59.3) * 0.5) * tk : 0);
    // 背景：虚空（人物不画），取景和界内镜头一样
    const scene = hd.renderVoidBackdrop(this.xukongView(dt, hd, true));
    hd.yaw = game.camYaw; hd.cruiseW = 0; hd.begin(camX, camY, z, dpr); hd.setGpuGround(false); hd.setGroundBackdrop(null);
    const gb = hd.groundBounds(320), view = { left: gb.l, top: gb.t, right: gb.r, bottom: gb.b };
    hd.syncGround([], CHUNK);
    hd.buildings.sync([], () => 0);
    this.ctx = hd.wctx;
    { const x = hd.decalXf(); this.Z = x.Z; this.ox = x.ox; this.oy = x.oy; this.world(); }
    // 虚空里没有遮挡、没有迷雾：神识圈不限（敌人照神识圈显隐，界内那一套是在世界层画的时候才定圈的位置）
    game.life.sense.x = p.x; game.life.sense.y = p.y; game.life.sense.R = 1e9;
    const list = this._drawList; list.length = 0;
    collectCombat(game.combat, list, view, t, dt);
    game.zhenfa.collect(list, view, t);
    game.yuanying.collect(list); game.shen?.collect(list);
    list.push({ y: p.y, k: 'D·主角', hx: p.x, hy: p.y, hb: charBox(1.12, p.st.lift + 40), draw: () => this.drawPlayer(dt) });
    modx?.collect(list);
    list.sort((a, b) => a.y - b.y);
    this.drawListHD(list, hd);
    this.world();
    this.updateParticles(dt);
    this.hdTarget = this.stage!.worldTarget(this.stage!.W, this.stage!.H);
    hd.shadowsEnabled = false;   // 没有地面，影子无处可落
    hd.setSun(0.4, 0, 0.3);
    hd.setClouds(game.time, 0); hd.setCloudDeck(null, dt);
    this.fx3dFrame(hd, dt);   // r7-fx3d：虚空斗法场里一样画（一脚还界那一下）
    try { hd.render(this.hdTarget); } finally { hd.clearBackdrop(); }
    this.ctx = worldCtx;
    worldCtx.setTransform(1, 0, 0, 1, 0, 0); worldCtx.globalAlpha = 1; worldCtx.globalCompositeOperation = 'source-over';
    this.Z = z * dpr; this.ox = W * dpr / 2 - camX * this.Z; this.oy = H * dpr / 2 - camY * this.Z; this.world();
    const Fx = this.fx!;
    const B2 = this.stage!.batch;
    B2.reset(camX, camY, z, W, H, this.stage!.atlas);
    B2.hd = hd; B2.gpuDecals = GPU_DECALS;
    Fx.update(dt);
    drawCombatGL(Fx, game.combat, t, dt);
    Fx.drawRings(dt);
    Fx.drawParticles();
    Fx.flushBake(this.stage!.atlas);
    this.vfxSprites!.draw(game.combat, t);
    // 血条、伤害字等画在界面层
    this.ctx = this.uiCtx; this.dpr = this.uiDpr;
    this.Z = z * this.uiDpr; this.ox = W * this.uiDpr / 2 - camX * this.Z; this.oy = H * this.uiDpr / 2 - camY * this.Z; this.world();
    drawCombatUI(this.ctx, game.combat, t, z);
    this.ctx = worldCtx; this.dpr = dpr; this.Z = z * dpr; this.ox = W * dpr / 2 - camX * this.Z; this.oy = H * dpr / 2 - camY * this.Z;
    { const ac = this.atmo?.getContext('2d'); if (ac) ac.clearRect(0, 0, this.atmo.width, this.atmo.height); }
    // 后期：不调色、不压暗（虚空那边已经调好了），也不要神识圈和界外的迷雾
    this.atmoOff = true; this.postPlain = true;
    try { this.postGL(camX, camY, z, W, H, 0, 0, 0, 0, [255, 255, 255], 1e6, false); } finally { this.atmoOff = false; this.postPlain = false; }
    drawXukongOverlay(this.uiCtx, W, H, this.uiDpr, game, scene, this.xukongGlyphs ??= glyphAtlas());
    this.stats.ms = performance.now() - t0;
  }

  // ---------------------------------------------------------------- 水
  private drawWater(left: number, top: number, right: number, bottom: number, t: number) {
    const { ctx, game } = this;
    const T = game.terrain;
    const step = 105;
    ctx.save();
    const ga0 = ctx.globalAlpha;
    ctx.lineCap = 'round';
    const gx0 = Math.floor(left / step), gx1 = Math.floor(right / step), gy0 = Math.floor(top / step), gy1 = Math.floor(bottom / step);
    const z = game.cam.zoom;
    game.scenery.drawWaterUnder(ctx, game, { left, top, right, bottom });
    ctx.lineWidth = Math.max(1.2, 1.6 / z);
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
      const h1 = hash2(gx, gy, 61);
      if (h1 > 0.62) continue;
      const h2 = hash2(gx, gy, 62), h3 = hash2(gx, gy, 63);
      const x = (gx + h2) * step, y = (gy + h3) * step;
      // 收官 P7：图外（交界地带、外圈海）先查绝域的水遮罩，查得到就不去现算地形（那是图外海面掉帧的主因）
      const out = x < 0 || y < 0 || x > WORLD_W || y > WORLD_H, mw = out ? game.jueyu.maskWater(x, y) : null;
      if (mw === false || (mw === null && T.isLand(x, y))) continue;
      const deep = mw === true || T.sample(x, y).land < 0.2;
      // 波纹：缓慢漂移、明灭
      const ph = (t * (deep ? 0.22 : 0.35) + h1 * 7) % 1;
      const a = Math.sin(ph * Math.PI);
      const len = (deep ? 50 : 30) + h2 * 40;
      const dx = Math.sin(t * 0.3 + h3 * 6) * 14 + ph * 20;
      // 第五轮性能：透明度走 globalAlpha，颜色串固定（原来每一笔拼一个 rgba 字符串，一屏几千笔）
      ctx.strokeStyle = 'rgb(30,64,80)'; ctx.globalAlpha = ga0 * 0.16 * a;
      ctx.beginPath(); ctx.moveTo(x - len * 0.45 + dx, y + 4); ctx.quadraticCurveTo(x + dx, y - 1 - h1 * 4, x + len * 0.45 + dx, y + 4); ctx.stroke();
      ctx.strokeStyle = 'rgb(248,252,250)'; ctx.globalAlpha = ga0 * 0.55 * a;
      ctx.beginPath();
      ctx.moveTo(x - len / 2 + dx, y);
      ctx.quadraticCurveTo(x + dx, y - 5 - h1 * 4, x + len / 2 + dx, y);
      ctx.stroke();
      if (h1 < 0.18) {
        ctx.strokeStyle = 'rgb(40,70,80)'; ctx.globalAlpha = ga0 * 0.18 * a;
        ctx.beginPath(); ctx.moveTo(x - len * 0.4 + dx, y + 7); ctx.quadraticCurveTo(x + dx, y + 3, x + len * 0.4 + dx, y + 7); ctx.stroke();
      }
    }
    // 粼光：日光下的细碎闪点（夜里换成月色）—— LOD 波段平滑 z∈[0.40,0.50]
    { const sparkleK = LOD.k(LOD.BAND.sparkle, z);
    if (sparkleK > 0.01) {
      const gs = 70, day = 1 - game.night;
      ctx.globalAlpha = ga0;
      const col = day > 0.5 ? 'rgb(255,252,232)' : 'rgb(220,230,255)';
      for (let gy = Math.floor(top / gs); gy <= Math.floor(bottom / gs); gy++) for (let gx = Math.floor(left / gs); gx <= Math.floor(right / gs); gx++) {
        const h = hash2(gx, gy, 71);
        if (h > 0.3) continue;
        const x = (gx + hash2(gx, gy, 72)) * gs, y = (gy + hash2(gx, gy, 73)) * gs;
        { const out = x < 0 || y < 0 || x > WORLD_W || y > WORLD_H, mw = out ? game.jueyu.maskWater(x, y) : null; if (mw === false || (mw === null && T.isLand(x, y))) continue; }   // 收官 P7：同上
        const gl = Math.sin(t * (1.6 + h * 3) + h * 40);
        if (gl < 0.55) continue;
        const k = (gl - 0.55) / 0.45, a = k * k * (day > 0.5 ? 0.85 : 0.45);
        const L = 5 + h * 20;
        ctx.fillStyle = col; ctx.globalAlpha = ga0 * a;
        ctx.beginPath(); ctx.ellipse(x, y, L * (0.5 + k * 0.5), 1.6, 0, 0, Math.PI * 2); ctx.fill();
        if (h < 0.04 && k > 0.7) { ctx.fillRect(x - 0.6, y - 5 * k, 1.2, 10 * k); }
      }
    } }
    // 岸边浪花：贴着画出的岸线一涨一退 —— LOD 波段平滑 z∈[0.36,0.46]
    { const shoreK = LOD.k(LOD.BAND.shore, z);
    if (shoreK > 0.01) {
      const fs = 34;
      ctx.lineWidth = Math.max(1.3, 1.8 / z);
      for (let gy = Math.floor(top / fs); gy <= Math.floor(bottom / fs); gy++) for (let gx = Math.floor(left / fs); gx <= Math.floor(right / fs); gx++) {
        let x = (gx + 0.5) * fs, y = (gy + 0.5) * fs;
        const L0 = T.visLand(x, y);
        if (Math.abs(L0 - 0.5) > 0.09) continue;
        const ex = (T.visLand(x + 8, y) - T.visLand(x - 8, y)) / 16, ey = (T.visLand(x, y + 8) - T.visLand(x, y - 8)) / 16;
        const g2 = ex * ex + ey * ey;
        if (g2 < 1e-9) continue;
        // 牛顿一步投到岸线上
        const k0 = (L0 - 0.5) / g2;
        x -= ex * k0; y -= ey * k0;
        if (Math.abs(x - (gx + 0.5) * fs) > fs * 0.6 || Math.abs(y - (gy + 0.5) * fs) > fs * 0.6) continue;
        const n = Math.sqrt(g2), nx = ex / n, ny = ey / n; // 指向陆地
        const h = hash2(gx, gy, 75);
        for (let w = 0; w < 2; w++) {
          const ph = (t * 0.22 + h * 0.5 + w * 0.5 + (x + y) * 0.0003) % 1;
          const a = Math.sin(ph * Math.PI) * (w ? 0.45 : 0.7);
          const back = 3 + (1 - ph) * 16 + w * 4;   // 浪从外向岸推进
          const cx2 = x - nx * back, cy2 = y - ny * back, hl = 13 + h * 6;
          ctx.strokeStyle = 'rgb(252,253,248)'; ctx.globalAlpha = ga0 * a;
          ctx.beginPath();
          ctx.moveTo(cx2 - ny * hl, cy2 + nx * hl);
          ctx.quadraticCurveTo(cx2 + nx * 4, cy2 + ny * 4, cx2 + ny * hl, cy2 - nx * hl);
          ctx.stroke();
        }
      }
    } }
    ctx.globalAlpha = ga0;
    // 河流：顺流而下的细碎水光 —— LOD 波段平滑 z∈[0.32,0.42]
    { const riverK = LOD.k(LOD.BAND.river, z);
    if (riverK > 0.01) {
      ctx.lineCap = 'round';
      for (const rv of T.rivers) {
        const bb = (rv as any)._bb ?? ((rv as any)._bb = (() => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const [px, py] of rv.pts) { a = Math.min(a, px); b = Math.min(b, py); c = Math.max(c, px); d = Math.max(d, py); } return [a * WORLD_SCALE - 200, b * WORLD_SCALE - 200, c * WORLD_SCALE + 200, d * WORLD_SCALE + 200]; })());
        if (bb[2] < left || bb[0] > right || bb[3] < top || bb[1] > bottom) continue;
        const pts = rv.pts;
        const w = 70 * rv.w;
        for (let lane = -1; lane <= 1; lane++) {
          ctx.beginPath();
          let started = false;
          for (let k = 0; k < pts.length; k++) {
            const x = pts[k][0] * WORLD_SCALE, y = pts[k][1] * WORLD_SCALE;
            const k2 = Math.min(pts.length - 1, k + 1), k1 = Math.max(0, k - 1);
            let tx = pts[k2][0] - pts[k1][0], ty = pts[k2][1] - pts[k1][1]; const tn = Math.hypot(tx, ty) || 1; tx /= tn; ty /= tn;
            const off = lane * w * 0.26;
            const px = x - ty * off, py = y + tx * off;
            if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
          }
          ctx.setLineDash([10 + lane * 3, 46 + lane * 9]);
          ctx.lineDashOffset = -t * (34 + lane * 6);
          ctx.strokeStyle = `rgba(250,254,252,${lane === 0 ? 0.5 : 0.3})`;
          ctx.lineWidth = lane === 0 ? 2.2 : 1.6;
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    } }
    game.scenery.drawWaterOver(ctx, game, { left, top, right, bottom }, t);
    ctx.restore();
  }

  private drawReflections(items: (TreeDeco | MtnDeco)[], t: number) {
    const ctx = this.ctx, z = this.game.cam.zoom;
    ctx.save();
    ctx.globalAlpha = 0.2;
    for (const d of items) {
      let s: Spr | null; let sc = 1;
      if (d.kind === 'mtn') { s = this.mtnSprite(d, z, true); }
      else { s = this.treeSprite(d, z); sc = d.s * TREE_K; }
      if (!s) continue;
      const fl = d.flip ? -1 : 1;
      const wob = this.flatTrees ? 0 : Math.sin(t * 1.4 + d.x * 0.01) * 0.015;
      const k = this.Z * sc;
      ctx.setTransform(fl * k, 0, wob * k, -k * 0.55, d.x * this.Z + this.ox, (d.y + 4) * this.Z + this.oy);
      ctx.drawImage(s.canvas, -s.ax, -s.ay, s.w, s.h);
    }
    ctx.restore();
    this.world();
  }

  // ---------------------------------------------------------------- 树、山
  /** P10 收尾：同一帧里同种、同季、同变体、同清晰度的树只查一次贴图缓存（一屏五千棵树只有几十种组合）；键是数，不再每棵树拼两个字符串 */
  private treeMemo = new Map<number, Spr | null>(); private treeMemoFrame = -1;
  private treeSprite(d: TreeDeco, z: number) {
    const season = this.game.season as Season;
    // 固定基准分辨率：缓存键里的 res 不再随 zoom 变，缩放只缩放同一张精灵，不会重烘/闪 fallback。
    // treeSpriteZoom=0 → 跟随缩放（原版行为）。
    const baseZ = this.treeSpriteZoom > 0 ? this.treeSpriteZoom : resTier.k * z;
    const res = resBucket(baseZ * this.dpr * d.s * TREE_K, 1.4);
    if (this.treeMemoFrame !== sprites.frame) { this.treeMemo.clear(); this.treeMemoFrame = sprites.frame; }
    const sp = SP_INDEX[d.sp] ?? 0, mk = ((sp * 4 + season) * 256 + d.v) * 1024 + Math.round(res * 100);
    const hit = this.treeMemo.get(mk);
    if (hit !== undefined) return hit;
    const seed = sp * 1000 + d.v * 37 + 11;
    const s = sprites.getAsync(`T:${d.sp}:${season}:${d.v}`, res, (r) => ({ kind: 'T', sp: d.sp, season, seed, res: r }), (r) => makeTree(d.sp, season, seed, r) as Spr);
    if (this.seasonCache) this.warmTreeSeasons(d, season, res);
    this.treeMemo.set(mk, s);
    return s;
  }
  // ---------------------------------------------------------------- 野外破坏（world/wreck.ts）：倒了的树、灌木的画法
  private wkPose: WreckPose = { wx: 1, wy: 0, ux: 0, uy: -1, a: 1 };
  /** 装饰物的贴图（相对脚底的世界范围 l t w h、是否左右翻、透明度）；树的贴图还没生成好返回 null */
  private wreckSrc(d: Deco, lodScale: number): { img: CanvasImageSource; l: number; t: number; w: number; h: number; fl: number; a: number } | null {
    const tw = (d as Deco & { _spr?: () => Spr | null; s?: number });
    if (tw._spr) { const s = tw._spr(); if (!s) return null; const k = LOC_SCALE * (tw.s ?? 0.55); return { img: s.canvas as CanvasImageSource, l: -s.ax * k, t: -s.ay * k, w: s.w * k, h: s.h * k, fl: 1, a: 1 }; }   // 城里的树（布局里的构件）
    if (d.kind === 'tree') {
      const s = this.treeSprite(d, this.game.cam.zoom); if (!s) return null;
      const k = d.s * TREE_K * lodScale;
      return { img: s.canvas as CanvasImageSource, l: -s.ax * k, t: -s.ay * k, w: s.w * k, h: s.h * k, fl: d.flip ? -1 : 1, a: 1 };
    }
    if (d.kind === 'img') return { img: d.img, l: -d.w / 2, t: -d.h, w: d.w, h: d.h, fl: d.flip ? -1 : 1, a: d.alpha };
    return null;
  }
  /**
   * 一棵倒了的树：倒下 / 长回来的时候是立板（贴图按姿势转过去：横轴 (wx, wy)、「向上」(ux, uy)，都在立板平面里），
   * 躺在地上的时候画进地贴（顺着落地那一刻定下的方向平铺，跟着地形起伏、受光照）；树桩是静态立板。
   */
  private wreckDeco(list: Drawable[], d: Deco, st: WreckDown, lodScale: number, left: number, top: number, right: number, bottom: number) {
    const W = this.game.combat.wreck, R = d.h * 1.5 + d.w;
    if (d.x + R < left || d.x - R > right || d.y - R > bottom + 40 || d.y + R < top - 40) return;
    const sa = W.stumpAlpha(st);
    if (sa > 0.02) {
      const S = W.stumpSprite(st), sx = d.x, sy = d.y;
      if (S.image) list.push({ y: sy, k: 'D·树桩', hx: sx, hb: [S.l, S.r, S.t, S.b], staticSprite: sa >= 0.99 ? () => S : undefined,
        draw: () => { const c = this.ctx; c.globalAlpha = sa; c.drawImage(S.image, sx + S.l, sy + S.t, S.r - S.l, S.b - S.t); c.globalAlpha = 1; } });
    }
    if (st.ph !== 'fall' && st.ph !== 'grow' && st.ph !== 'lie' && st.ph !== 'rot') return;
    const src = this.wreckSrc(d, lodScale); if (!src) return;
    const { img, l, t, w, h, fl } = src, x = d.x, y = d.y;
    if (st.ph === 'fall' || st.ph === 'grow') {
      const P = W.pose(st, this.wkPose), wx = P.wx * fl, wy = P.wy * fl, ux = P.ux, uy = P.uy, a = P.a * src.a;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const cx of [l, l + w]) for (const cy of [t, t + h]) { const X = cx * wx - cy * ux, Y = cx * wy - cy * uy; if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; }
      list.push({ y, k: 'D·倒树', hx: x, hb: [x0 - 8, x1 + 8, y0 - 8, y1 + 8], draw: () => {
        // r9：在调用方给的世界坐标系上再叠一层（原来直接 setTransform 成经典 2D 地图的变换——HD2D 下立板是画进图集格子的，
        // 那套变换和格子对不上，倒树被画歪、只露出被格子裁下来的几截树干，画面上飘着一根根黑棍）
        const c = this.ctx; c.save(); c.globalAlpha *= a;
        c.translate(x, y); c.transform(wx, wy, -ux, -uy, 0, 0); c.drawImage(img, l, t, w, h);
        c.restore();
      } });
      return;
    }
    // 躺着：画进地贴（没有 hx）
    const a = W.lieAlpha(st) * src.a, px = st.px * fl, py = st.py * fl, lx = st.lx, ly = st.ly;
    list.push({ y, k: 'D·倒树(地)', draw: () => {
      const c = this.ctx, Z = this.Z; c.globalAlpha = a;
      c.setTransform(Z * px, Z * py, -Z * lx, -Z * ly, x * Z + this.ox, y * Z + this.oy); c.drawImage(img, l, t, w, h);
      this.world(); c.globalAlpha = 1;
    } });
  }
  /** 扔出去落地躺着的树、拔起来拿着 / 飞着的树（石头那份在 wreck.collect） */
  private wreckExtra(list: Drawable[], left: number, top: number, right: number, bottom: number) {
    const W = this.game.combat.wreck;
    for (const s of W.props) if (s.deco) this.wreckDeco(list, s.deco, s, 1, left, top, right, bottom);
    for (const cr of W.carries) {
      if (cr.st === 'done' || !cr.deco) continue;
      const src = this.wreckSrc(cr.deco, 1); if (!src) continue;
      const { img, l, t, w, h, fl } = src, x = cr.x, y = cr.y, z = cr.z, rot = cr.rot, mid = t + h * 0.5;
      if (x + h < left || x - h > right || y - h - z > bottom || y + h < top) continue;
      const c0 = Math.cos(rot), s0 = Math.sin(rot), Rr = Math.hypot(w, h) * 0.55 + 10;
      list.push({ y, k: 'D·拔树', hx: x, hy: y, hb: [-Rr, Rr, -z + mid - Rr, Math.max(20, -z + mid + Rr)], draw: () => {
        const c = this.ctx;
        // 绕树身中间转：先挪到（脚底 - 离地 + 中间），转，再把贴图挪回来（r9：同倒树，叠在调用方的世界坐标系上）
        c.save(); c.translate(x, y - z + mid); c.transform(c0 * fl, s0 * fl, -s0, c0, 0, 0);
        c.drawImage(img, l, t - mid, w, h);
        c.restore();
      } });
    }
  }
  /** 远景树的静态立板：位图取自树的贴图缓存（后台线程生成的是 ImageBitmap，包一层以便图集按位图方向上传） */
  private treeStatic(d: TreeDeco, lodScale: number): StaticSprite | null {
    const s = this.treeSprite(d, this.game.cam.zoom);
    if (!s) return null;
    // 同一张位图、同一档比例时上一帧的结果原样用（记在树上）
    const c = d as TreeDeco & { _ss?: StaticSprite; _ssS?: Spr; _ssK?: number };
    if (c._ssS === s && c._ssK === lodScale && c._ss) return c._ss;
    const k = d.s * TREE_K * lodScale, l = -s.ax * k, r = (s.w - s.ax) * k;
    const source = s.canvas as unknown;
    let image: StaticSprite['image'];
    if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
      let frame = treeFrames.get(source);
      if (!frame) { frame = new BitmapFrame(source); treeFrames.set(source, frame); }   // 这份引用一直留着：位图归贴图缓存管，图集不去关它
      image = frame;
    } else image = s.canvas;
    c._ssS = s; c._ssK = lodScale;
    return c._ss = { image, l: d.flip ? -r : l, r: d.flip ? -l : r, t: -s.ay * k, b: (s.h - s.ay) * k, flip: d.flip };
  }
  /** 四季缓存：把另外三季的树排进预热队列（每帧最多 2 张），换季瞬间有图可用 */
  private warmTreeSeasons(d: TreeDeco, cur: Season, res: number) {
    // 队列/集合必须有上限：拉远到 0.22 时一屏上千棵树，每棵 3 季，
    // 若来多少排多少，队列会无限增长且 Array.shift 越来越贵——玩一会儿就整个卡死。
    if (this.treeWarmQ.length >= 128) return;
    if (this.treeWarmSet.size > 4096) this.treeWarmSet.clear();
    for (let s2 = 0 as Season; s2 < 4; s2 = (s2 + 1) as Season) {
      if (s2 === cur) continue;
      const base = `T:${d.sp}:${s2}:${d.v}`;
      if (sprites.peek(base, res)) continue;
      const key = base + '@' + res;
      if (this.treeWarmSet.has(key)) continue;
      this.treeWarmSet.add(key);
      this.treeWarmQ.push({ d, season: s2, res });
    }
  }
  private pumpTreeWarm() {
    for (let i = 0; i < 2 && this.treeWarmQ.length; i++) {
      const t = this.treeWarmQ.shift()!;
      const base = `T:${t.d.sp}:${t.season}:${t.d.v}`;
      if (sprites.peek(base, t.res)) continue;
      const seed = (SP_INDEX[t.d.sp] ?? 0) * 1000 + t.d.v * 37 + 11;
      sprites.getAsync(base, t.res, (r) => ({ kind: 'T', sp: t.d.sp, season: t.season, seed, res: r }), (r) => makeTree(t.d.sp, t.season, seed, r) as Spr);
    }
  }
  /** 设置面板：四季缓存开关（关掉更省内存，换季会重画树） */
  setSeasonCache(on: boolean) {
    this.seasonCache = !!on;
    if (!on) { this.treeWarmQ.length = 0; this.treeWarmSet.clear(); }
    try { localStorage.setItem('taixu.seasonCache', on ? '1' : '0'); } catch { /* */ }
    this.game.toast(on ? '四季缓存：开（换季更快）' : '四季缓存：关（更省内存）', 'info');
  }
  /** 设置面板：树精灵固定分辨率基准（0 = 跟随缩放/原版） */
  setTreeSpriteZoom(v: number) {
    this.treeSpriteZoom = Math.max(0, Math.min(1.7, Number(v) || 0));
    try { localStorage.setItem('taixu.treeSprite', String(this.treeSpriteZoom)); } catch { /* */ }
    this.game.toast(this.treeSpriteZoom > 0
      ? `树木精灵：固定 ${this.treeSpriteZoom.toFixed(2)}×（缩放不重烘）`
      : '树木精灵：跟随缩放（原版，缩放会重烘）', 'info');
  }
  /** 设置面板：树风摆（关掉走轴对齐快路径） */
  /** 设置面板：山峰贴图分辨率（0 = follow zoom；>0 = fixed, no rebuild on zoom） */
  setMtnSpriteZoom(v: number) {
    this.mtnSpriteZoom = Math.max(0, Math.min(1.6, Number(v) || 0));
    try { localStorage.setItem('taixu.mtnSprite', String(this.mtnSpriteZoom)); } catch { /* */ }
  }
  setTreeSway(on: boolean) {
    this.flatTrees = !on;
    try {
      if (on) localStorage.removeItem('taixu.treeSway');
      else localStorage.setItem('taixu.treeSway', '0');
    } catch { /* */ }
    this.game.toast(on ? '树风摆：开（原版默认）' : '树风摆：关（密林更流畅，树不再轻摆）', 'info');
  }
  /** 设置面板：世界层分辨率上限（0 = 不限制）。世界层每帧整张上传 GL，压它最省带宽 */
  setWorldDprCap(v: number, silent = false) {
    const cap = Math.max(0, Math.min(2, Number(v) || 0));
    this.worldDprCap = cap;
    try {
      if (cap) localStorage.setItem('taixu.worldDpr', String(cap));
      else localStorage.removeItem('taixu.worldDpr');
    } catch { /* */ }
    this.resize();
    if (!silent) this.game.toast(cap ? `世界层分辨率：上限 ${cap.toFixed(2)}×（画质略软，更省）` : '世界层分辨率：不限制（最清晰，最费）', 'info');
  }
  // ── 树片金字塔（移植自 taixu071）──────────────────────────────────
  /** 把一张已烘焙的树片包装成 Drawable */
  private makeTreePatchDrawable(patch: TreePatch): Drawable {
    const spr = patch.spr!;
    return {
      y: patch.sortY,
      k: 'D·树片',
      hx: patch.wx + patch.ww / 2,
      hb: [0, patch.ww, -patch.wh, 0],
      draw: () => {
        const ctx = this.ctx;
        const k = this.Z;
        ctx.setTransform(k, 0, 0, k, this.ox, this.oy);
        if (this._occA < 1) {
          ctx.save(); ctx.globalAlpha *= this._occA;
          ctx.drawImage(spr.canvas, patch.wx, patch.wy, patch.ww, patch.wh);
          ctx.restore();
        } else {
          ctx.drawImage(spr.canvas, patch.wx, patch.wy, patch.ww, patch.wh);
        }
        this.world();
      },
    };
  }

  /**
   * 远景树片发射：z < 0.19 时用树片金字塔替代逐棵绘制。
   * 返回本帧用树片替代了多少棵树（用于统计）。
   */
  private emitMacroTreePatches(
    T: Terrain, season: Season, z: number,
    left: number, top: number, right: number, bottom: number,
    list: Drawable[],
  ): number {
    const decoRev = T.frame;
    const macroLevel: 1 | 2 = z < 0.05 ? 2 : 1;
    const chunksPerMacro = macroLevel === 1 ? 2 : 4;
    const macroSpan = chunksPerMacro * CHUNK;
    const stripH = macroSpan / PATCH_MACRO_STRIPS;
    const maxGx = Math.floor(WORLD_W / macroSpan);
    const maxGy = Math.floor(WORLD_H / macroSpan);
    const gx0 = Math.max(0, Math.floor(left / macroSpan));
    const gx1 = Math.min(maxGx, Math.floor(right / macroSpan));
    const gy0 = Math.max(0, Math.floor(top / macroSpan));
    const gy1 = Math.min(maxGy, Math.floor(bottom / macroSpan));

    // 按离镜头距离排序：近的优先烘焙
    const camX = this.game.cam.x, camY = this.game.cam.y;
    const cells: { gx: number; gy: number; d2: number }[] = [];
    for (let gy = gy0; gy <= gy1; gy++) {
      const cy = (gy + 0.5) * macroSpan - camY;
      for (let gx = gx0; gx <= gx1; gx++) {
        const cx = (gx + 0.5) * macroSpan - camX;
        cells.push({ gx, gy, d2: cx * cx + cy * cy });
      }
    }
    cells.sort((a, b) => a.d2 - b.d2);

    // 树精灵模板：用 sprites.peek 查已有缓存，未命中则跳过（不阻塞帧）
    const getTpl: PatchTemplateFn = (d: TreeDeco) => {
      const seed = d.sp.charCodeAt(0) * 1000 + d.v * 37 + 11;
      const base = `T:${d.sp}:${season}:${d.v}`;
      return sprites.peek(base, 0.35) ?? null;
    };

    const budget: PatchBakeBudget = {
      t0: performance.now(),
      budgetMs: this.treePatches.size === 0 ? 6 : 2.5,  // 首帧多给预算
      bakes: 0, scans: 0, pending: false,
    };

    let treeCount = 0;
    const fallbacks: TreePatch[] = [];
    for (let i = 0; i < cells.length; i++) {
      const { gx, gy } = cells[i];
      for (let strip = 0; strip < PATCH_MACRO_STRIPS; strip++) {
        const sy0 = gy * macroSpan + strip * stripH;
        const sy1 = sy0 + stripH;
        if (sy1 < top - 300 || sy0 > bottom + 300) continue;
        const p = this.treePatches.getMacroStrip(T, macroLevel, decoRev, season, gx, gy, strip, budget, getTpl);
        if (p && !p.empty && p.spr) {
          list.push(this.makeTreePatchDrawable(p));
          treeCount += p.treeCount;
        } else if (p === null) {
          // 未就绪：用已缓存的子级片顶替
          fallbacks.length = 0;
          this.treePatches.collectCachedFallbackPatches(macroLevel, decoRev, season, gx, gy, strip, fallbacks);
          for (let f = 0; f < fallbacks.length; f++) {
            const fb = fallbacks[f];
            if (!fb.empty && fb.spr) {
              list.push(this.makeTreePatchDrawable(fb));
              treeCount += fb.treeCount;
            }
          }
        }
      }
    }
    return treeCount;
  }

  private drawTree(d: TreeDeco, t: number, lodScale: number, lodA = 1) {
    const z = this.game.cam.zoom;
    const s = this.treeSprite(d, z);
    if (!s) return;
    // 优化：风场用镜头中心的值近似（gustAt 本身有 3 次 sin + 2 次 cos/乘，
    // 一屏 500 棵树就是 2500 次三角函数；改用预计算后只做加减乘）。
    // 每棵树的视觉差异由 d.ph 相位保证——sin(a+b) 展开，相位项缓存在树上。
    const td = d as TreeDeco & { _cosPh?: number; _sinPh?: number; _cosPh2?: number; _sinPh2?: number };
    const cosPh = td._cosPh ?? (td._cosPh = Math.cos(d.ph));
    const sinPh = td._sinPh ?? (td._sinPh = Math.sin(d.ph));
    const cosPh2 = td._cosPh2 ?? (td._cosPh2 = Math.cos(d.ph * 2));
    const sinPh2 = td._sinPh2 ?? (td._sinPh2 = Math.sin(d.ph * 2));
    const wind = this._wGlobal;
    const W = this.game.weather;
    const sw = this.flatTrees ? 0
      : ((this._wSinA * cosPh + this._wCosA * sinPh) * 0.022
       + (this._wSinB * cosPh2 + this._wCosB * sinPh2) * 0.008) * (0.35 + wind)
       + wind * 0.03 * W.windLean;
    const k = this.Z * d.s * TREE_K * lodScale;
    const fl = d.flip ? -1 : 1;
    this.ctx.setTransform(fl * k, 0, sw * k, k, d.x * this.Z + this.ox, d.y * this.Z + this.oy);
    const aTree = lodA * this._occA;
    if (aTree < 1) this.ctx.globalAlpha = aTree;
    this.ctx.drawImage(s.canvas, -s.ax, -s.ay, s.w, s.h);
    if (aTree < 1) this.ctx.globalAlpha = 1;
    this.world();
  }
  private mtnSprite(d: MtnDeco, z: number, noBuild = false) {
    // 单张山体贴图上限 2.4MP（原来 1440 屏下一张能到 4.3MP：每建一张就是几十毫秒的像素填充）
    const cap = Math.min(1800 / d.w, Math.sqrt(2.4e6 / (d.w * d.h)));
    // fixed level: use the set value (never rebuilds on zoom); follow-zoom: bucket by resTier, cap 0.75
    const res = this.mtnSpriteZoom > 0 ? Math.min(this.mtnSpriteZoom, 1.6, cap) : Math.min(resBucket(resTier.k * z * this.dpr, 0.75), cap);
    const r = Math.round(res * 100) / 100;
    const make = (rr: number) => {
      const m = makeMountain({ ...d.spec, tex: rr });
      let meta = this.mtnMeta.get(d.id);
      if (!meta) { meta = { falls: m.falls, seen: this.game.time }; this.mtnMeta.set(d.id, meta); if (this.mtnMeta.size > 2000) this.mtnMeta.clear(); }
      meta.falls = m.falls;
      return { canvas: m.canvas, w: m.w, h: m.h, ax: m.ax, ay: m.ay } as Spr;
    };
    if (noBuild && !sprites.has('M:' + d.id)) return null;
    return sprites.getAsync('M:' + d.id, r, (rr) => ({ kind: 'M', spec: { ...d.spec, tex: rr } }), make, (m) => {
      let meta = this.mtnMeta.get(d.id);
      if (!meta) { meta = { falls: m.falls ?? [], seen: this.game.time }; this.mtnMeta.set(d.id, meta); if (this.mtnMeta.size > 2000) this.mtnMeta.clear(); }
      meta.falls = m.falls ?? [];
    });
  }
  private fallMeta = new Map<string, FallMeta>();
  private wfSprite(d: FallDeco, z: number): Spr | null {
    const spec = { seed: d.seed, w: d.w, h: d.h, tiers: d.tiers };
    const res = Math.round(Math.min(resBucket(z * this.dpr, 1), Math.sqrt(2.2e6 / (d.w * 1.3 * (d.h + d.w * 0.4)))) * 100) / 100;
    return sprites.get('WF:' + d.id, res, (r) => makeFallCliff(spec, r) as Spr);
  }
  private drawFall(d: FallDeco, t: number) {
    const z = this.game.cam.zoom;
    const spec = { seed: d.seed, w: d.w, h: d.h, tiers: d.tiers };
    const res = Math.round(Math.min(resBucket(resTier.k * z * this.dpr, 1), Math.sqrt(2.2e6 / (d.w * 1.3 * (d.h + d.w * 0.4)))) * 100) / 100;
    const s = sprites.get('WF:' + d.id, res, (r) => makeFallCliff(spec, r) as Spr);
    if (!s) return;
    let m = this.fallMeta.get(d.id); if (!m) { m = fallGeometry(spec); this.fallMeta.set(d.id, m); if (this.fallMeta.size > 300) this.fallMeta.clear(); }
    const ctx = this.ctx;
    ctx.drawImage(s.canvas, d.x - s.ax, d.y - s.ay, s.w, s.h);
    drawFallAnim(ctx, m, d.x, d.y, t, clamp(this.game.light, 0, 1) * (1 - clamp(this.game.weather.gloom * 2, 0, 1)), z > 0.45);
    this.world();
  }
  private drawMountain(d: MtnDeco, t: number) {
    const z = this.game.cam.zoom;
    let _q = prof.t();
    const s = this.mtnSprite(d, z);
    prof.add('D·山┊取图', _q, 1); _q = prof.t();
    if (!s) return;
    const meta = this.mtnMeta.get(d.id);
    const fade = meta ? clamp((t - meta.seen) / 0.5, 0, 1) : 1;
    const ctx = this.ctx;
    ctx.globalAlpha = fade * this._occA;
    const fl = d.flip ? -1 : 1;
    ctx.setTransform(fl * this.Z, 0, 0, this.Z, d.x * this.Z + this.ox, d.y * this.Z + this.oy);
    ctx.drawImage(s.canvas, -s.ax, -s.ay, s.w, s.h);
    prof.add('D·山┊贴图', _q, 1); _q = prof.t();
    // 瀑布流动与水雾 —— LOD 波段平滑 z∈[0.26,0.36]
    { const fallK = LOD.k(LOD.BAND.fall, z);
    if (meta?.falls.length && fallK > 0.01) {
      ctx.save();
      ctx.lineCap = 'round';
      for (const f of meta.falls) {
        const x = f.x, y0 = f.y, h = f.h;
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = Math.max(1, f.w * 0.16);
        ctx.setLineDash([h * 0.12, h * 0.1]);
        ctx.lineDashOffset = -t * h * 0.9;
        for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(x + k * f.w * 0.22, y0); ctx.lineTo(x + k * f.w * 0.26, y0 + h); ctx.stroke(); }
        ctx.setLineDash([]);
        for (let k = 0; k < 4; k++) {
          const ph = (t * 0.6 + k / 4) % 1;
          ctx.fillStyle = `rgba(250,252,252,${0.35 * (1 - ph)})`;
          ctx.beginPath(); ctx.ellipse(x + Math.sin(k * 2.1 + t) * f.w * 0.6, y0 + h - ph * f.w * 1.2, f.w * (0.5 + ph * 1.1), f.w * (0.3 + ph * 0.5), 0, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    } }
    ctx.globalAlpha = 1;
    this.world();
  }

  // ---------------------------------------------------------------- 地点（第二十二步：贴图建筑）
  /**
   * 收官返工 3：村镇的铺装分块缓存（成片街坊的城早就这样做了，见 cityGround.ts）。原来每帧把每一块街面、田、地饰用纹理图样重新铺进地贴，
   * 有纹理时一帧 4–7 毫秒、单帧最长六七十到一百多毫秒（被打死送回村子那一下正是这样），整页帧率掉到个位数。
   * 现在按地贴清晰度取一档（每档 2 倍），512 像素一块（够大，浏览器用显卡画它，往地贴上贴时不用从显卡读回）画好留着，每帧只贴块；一帧最多花 3 毫秒补新块（离画面中心近的先补），
   * 还没画好的先用粗一档的块顶上。纹理还没解码好时画出来的块记成「待重画」，之后补上。池塘有水纹在动，照旧每帧画
   */
  private paveCache = new Map<string, { c: HTMLCanvasElement; used: number; stale: boolean }>();
  private paveExtent = new WeakMap<LocLayout, { x0: number; y0: number; x1: number; y1: number }>();
  private paveFrame = -1; private paveSpent = 0; private paveMiss = false;
  private drawLocGround2(L: LocLayout, ox: number, oy: number, t: number, left: number, top: number, right: number, bottom: number) {
    const ctx = this.ctx, S = LOC_SCALE, TILE = 512, C = this.paveCache;
    const m = ctx.getTransform(), px = Math.hypot(m.a, m.b);
    const lv = Math.max(-6, Math.min(0, Math.round(Math.log2(Math.max(1e-4, px))))), tw = TILE / Math.pow(2, lv);
    let E = this.paveExtent.get(L);
    if (!E) {
      E = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
      for (const g of L.ground) { if (g.kind === 'pond') continue; E.x0 = Math.min(E.x0, (g.x - g.w / 2) * S - 14); E.x1 = Math.max(E.x1, (g.x + g.w / 2) * S + 14); E.y0 = Math.min(E.y0, (g.y - g.h / 2) * S - 10); E.y1 = Math.max(E.y1, (g.y + g.h / 2) * S + 10); }
      this.paveExtent.set(L, E);
    }
    const f = this.game.frameNo; if (this.paveFrame !== f) { this.paveFrame = f; this.paveSpent = 0; }
    const x0 = Math.max(E.x0, left - ox), x1 = Math.min(E.x1, right - ox), y0 = Math.max(E.y0, top - oy), y1 = Math.min(E.y1, bottom - oy);
    if (x0 < x1 && y0 < y1) {
      const i0 = Math.floor(x0 / tw), i1 = Math.floor(x1 / tw), j0 = Math.floor(y0 / tw), j1 = Math.floor(y1 / tw), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const order: [number, number, number][] = [];
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) order.push([i, j, Math.hypot((i + 0.5) * tw - cx, (j + 0.5) * tw - cy)]);
      order.sort((a, b) => a[2] - b[2]);
      for (const [i, j] of order) {
        const key = `${L.id}:${lv}:${i}:${j}`;
        let T = C.get(key);
        if ((!T || T.stale) && this.paveSpent < 3) {
          const a = performance.now(), c = T?.c ?? document.createElement('canvas');
          if (!T) { c.width = c.height = TILE; }
          const g = c.getContext('2d')!, res = Math.pow(2, lv);
          g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, TILE, TILE);
          g.setTransform(res, 0, 0, res, -i * tw * res, -j * tw * res);
          this.paveMiss = false;
          this.paveStatic(g, L, 0, 0, t, i * tw, j * tw, (i + 1) * tw, (j + 1) * tw);
          T = { c, used: f, stale: this.paveMiss }; C.set(key, T);
          this.paveSpent += performance.now() - a;
        }
        if (T) { T.used = f; ctx.drawImage(T.c, ox + i * tw, oy + j * tw, tw, tw); continue; }
        // 还没画好：粗一档（或更粗）的块里对应的那一截先顶上
        for (let up = 1; up <= 3; up++) {
          const l2 = lv - up; if (l2 < -6) break;
          const tw2 = TILE / Math.pow(2, l2), i2 = Math.floor(i * tw / tw2), j2 = Math.floor(j * tw / tw2), T2 = C.get(`${L.id}:${l2}:${i2}:${j2}`);
          if (!T2) continue;
          const sw = tw / tw2 * TILE; T2.used = f;
          ctx.drawImage(T2.c, (i * tw - i2 * tw2) / tw2 * TILE, (j * tw - j2 * tw2) / tw2 * TILE, sw, sw, ox + i * tw, oy + j * tw, tw, tw);
          break;
        }
      }
    }
    // 池塘：水纹在动，每帧画
    if (L.ground.some((g) => g.kind === 'pond')) this.paveStatic(ctx, L, ox, oy, t, left, top, right, bottom, true);
    // 只留最近用过的
    if (C.size > 56) { const old = [...C.entries()].sort((a, b) => a[1].used - b[1].used); for (const [k, T] of old) { if (C.size <= 40) break; if (T.used >= f) continue; C.delete(k); T.c.width = T.c.height = 0; } }
  }
  /** 铺装的画法：先压一圈淡墨边，再以纹理平铺（相邻街面纹理在世界坐标里对齐，交口无缝）。ponds＝只画池塘，否则画池塘以外的一切 */
  private paveStatic(ctx: CanvasRenderingContext2D, L: LocLayout, ox: number, oy: number, t: number, left: number, top: number, right: number, bottom: number, ponds = false) {
    const S = LOC_SCALE;
    const vis = (g: { x: number; y: number; w: number; h: number }) => { const x = ox + g.x * S, y = oy + g.y * S, w = g.w * S / 2, h = g.h * S / 2; return !(x + w < left - 40 || x - w > right + 40 || y + h < top - 40 || y - h > bottom + 40); };
    // 1) 边
    ctx.save();
    if (L.wet) {
      // 河从城中穿过：挖掉水面，铺装与贴花都不压在河上
      ctx.beginPath(); ctx.rect(left - 50, top - 50, right - left + 100, bottom - top + 100);
      for (const r of L.wet) { const x = ox + r.x * S, y = oy + r.y * S; if (x > right + 50 || x + r.w * S < left - 50 || y > bottom + 50 || y + r.h * S < top - 50) continue; ctx.rect(x, y, r.w * S, r.h * S); }
      ctx.clip('evenodd');
    }
    for (const g of L.ground) {
      if (ponds || g.kind !== 'pat' || !g.p?.edge || !vis(g)) continue;
      const x = ox + g.x * S, y = oy + g.y * S, w = g.w * S, h = g.h * S;
      ctx.fillStyle = 'rgba(70,62,48,0.16)'; ctx.fillRect(x - w / 2 - 12, y - h / 2 - 9, w + 24, h + 18);
      ctx.fillStyle = 'rgba(64,56,44,0.30)'; ctx.fillRect(x - w / 2 - 5, y - h / 2 - 4, w + 10, h + 8);
    }
    // 2) 面
    for (const g of L.ground) {
      if (!vis(g) || ponds !== (g.kind === 'pond')) continue;
      const x = ox + g.x * S, y = oy + g.y * S, w = g.w * S, h = g.h * S;
      if (g.kind === 'pat') {
        // CanvasPattern 大块平铺在部分城镇极慢（移植版实测 527kpx ≈ 35ms/帧）；
        // 改成逐格 drawImage，纹理缺失时回落纯色（素材加载失败时的老行为）。
        const tl = g.p!.tile ?? 300;
        const fallback = g.p!.tex.startsWith('farm') ? '#a08a62' : g.p!.tex.startsWith('road') ? '#b8a684' : '#b4ae9c';
        if (g.p!.edge === false) {
          // 土路、田：边缘羽化（不画硬边）
          ctx.globalAlpha = 0.9;
          if (!fillPatternTiled(ctx, g.p!.tex, tl, t, x - w / 2 + 10, y - h / 2 + 6, w - 20, h - 12)) {
            ctx.fillStyle = fallback; ctx.fillRect(x - w / 2 + 10, y - h / 2 + 6, w - 20, h - 12);
          }
          ctx.globalAlpha = 0.45;
          if (!fillPatternTiled(ctx, g.p!.tex, tl, t, x - w / 2, y - h / 2, w, h)) {
            ctx.fillStyle = fallback; ctx.fillRect(x - w / 2, y - h / 2, w, h);
          }
          ctx.globalAlpha = 1;
        } else if (!fillPatternTiled(ctx, g.p!.tex, tl, t, x - w / 2, y - h / 2, w, h)) {
          ctx.fillStyle = fallback; ctx.fillRect(x - w / 2, y - h / 2, w, h);
        }
      } else if (g.kind === 'dec') {
        if (!drawDecal(ctx, g.p!.tex, x, y, w, h, t)) { this.paveMiss = true; ctx.fillStyle = 'rgba(200,196,180,0.8)'; ctx.beginPath(); ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill(); }
      } else if (g.kind === 'pond') {
        ctx.fillStyle = 'rgba(70,64,52,0.35)'; ctx.beginPath(); ctx.ellipse(x, y + 4, w / 2 + 10, h / 2 + 8, 0, 0, Math.PI * 2); ctx.fill();
        const gr = ctx.createRadialGradient(x, y, 0, x, y, w / 2); gr.addColorStop(0, 'rgba(130,168,170,0.96)'); gr.addColorStop(1, 'rgba(92,130,136,0.96)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(240,246,240,0.35)'; ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) { const r = ((t * 0.12 + k / 3) % 1); ctx.globalAlpha = 1 - r; ctx.beginPath(); ctx.ellipse(x + w * 0.1, y, w * 0.12 + r * w * 0.2, h * 0.12 + r * h * 0.2, 0, 0, Math.PI * 2); ctx.stroke(); }
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(70,120,70,0.85)';
        for (let k = 0; k < 7; k++) { const a = k * 2.4, rr = 0.25 + (k % 3) * 0.18; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * w * rr * 0.5, y + Math.sin(a) * h * rr * 0.5, 14, 7, 0, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    ctx.restore();
  }
  /** 主角走到屋后：整座屋子淡出，露出人影 */
  /** 建筑/城墙的遮挡：统一走 occAlpha（矩形模式），全场景只有一套判定与平滑 */
  private xray(pc: Piece, x0: number, x1: number, by: number, h: number) {
    return this.occAlpha({
      get: () => null, x: (x0 + x1) / 2, y: by, footY: by,
      mode: 'rect', box: [x0 + 20, by - h * 0.92, x1 - 20, by - 4], k: 0.42, ent: pc,
    });
  }
  private drawBldPiece(pc: Piece, x: number, y: number, t: number) {
    const ctx = this.ctx, P = pc.p, w = P.w, h = P.h;
    const a = this.xray(pc, x - w * 0.44, x + w * 0.44, y, h);
    if (!drawBld(ctx, P.k, x, y, t, P.s ?? 1, !!P.f, a)) {
      // 画材未就绪：淡淡的屋形占位（极短暂）
      ctx.fillStyle = 'rgba(120,110,96,0.25)'; ctx.fillRect(x - w * 0.42, y - h * 0.55, w * 0.84, h * 0.55);
      return;
    }
    // 水车：转轮
    if (P.k.startsWith('b31') && !P.k.startsWith('b31_')) { /* 轮子另作构件 */ }
    // 匾额：有店名的门口挂一块木匾（图案烘成小图缓存，不再每帧排版文字）
    // 低于显示阈值时也先把名字排进空闲预热队列，越过阈值时只 drawImage，不会卡一帧。
    if (P.name && P.fn) this.queuePlaqueWarm(P.name);
    if (P.name && P.fn && this.Z > 0.45) {
      const name: string = P.name;
      const fs = 30, bw = name.length * fs * 1.06 + 30, bh = fs + 18;
      const by = y - Math.min(h * 0.58, 230);
      const spr = this.plaqueSprite(name, bw, bh);
      ctx.save();
      if (a < 1) ctx.globalAlpha = a;
      ctx.drawImage(spr, x - bw / 2, by - bh / 2, bw, bh);
      ctx.restore();
    }
  }
  /** 南北向城墙：俯视所见的墙头（垛口在外侧）与内侧阴影 */
  private drawWallV(pc: Piece, x: number, y: number) {
    const ctx = this.ctx, P = pc.p, len = P.len, h = P.h, tw = P.t;
    const y0 = y - len - h, y1 = y - h;
    const outer = x < (this.game.player.x) ? -1 : 1;
    void outer;
    ctx.save();
    // 内外两侧地面的投影
    ctx.fillStyle = 'rgba(40,36,28,0.16)'; ctx.fillRect(x - tw / 2 - 26, y - len, tw + 52, len);
    // 墙身（以墙头示意）
    const g = ctx.createLinearGradient(x - tw / 2, 0, x + tw / 2, 0);
    g.addColorStop(0, '#6e6a60'); g.addColorStop(0.25, P.col ?? '#8e8a7e'); g.addColorStop(0.75, P.col ?? '#8e8a7e'); g.addColorStop(1, '#66625a');
    ctx.fillStyle = g; ctx.fillRect(x - tw / 2, y0, tw, y1 - y0 + 2);
    // 马道砖缝
    ctx.strokeStyle = 'rgba(40,36,30,0.28)'; ctx.lineWidth = 1.5;
    for (let yy = y0 + 18; yy < y1; yy += 26) { ctx.beginPath(); ctx.moveTo(x - tw / 2 + 12, yy); ctx.lineTo(x + tw / 2 - 12, yy); ctx.stroke(); }
    // 两侧垛口
    ctx.fillStyle = '#5e5a52';
    for (let yy = y0; yy < y1; yy += 40) { ctx.fillRect(x - tw / 2, yy, 11, 24); ctx.fillRect(x + tw / 2 - 11, yy, 11, 24); }
    ctx.strokeStyle = 'rgba(30,26,20,0.65)'; ctx.lineWidth = 2; ctx.strokeRect(x - tw / 2, y0, tw, y1 - y0 + 2);
    // 墙脚（看得见的一小段立面，给墙“站起来”的感觉）
    const fg = ctx.createLinearGradient(0, y1, 0, y);
    fg.addColorStop(0, 'rgba(110,104,92,0.95)'); fg.addColorStop(1, 'rgba(80,76,66,0.95)');
    ctx.fillStyle = fg; ctx.fillRect(x - tw / 2, y1, tw, Math.min(h, len) * 0.0 + 0);
    ctx.restore();
  }
  /** 第三十八步：旧式地点地面换分辨率不再同步重画（以前每次缩放跨档都卡 ~125ms）：
   *  先用最接近的已有版本，新分辨率分帧烘（每帧 ≤3ms），画完再换；小幅缩放有回差，不触发重烘 */
  private gBake: { base: string; res: number; it: Generator<void, Spr> } | null = null;
  private drawLocGround(L: LocLayout, x: number, y: number, z: number) {
    const resWant = resBucket(resTier.k * z * this.dpr * LOC_SCALE, 1);
    const res = Math.min(resWant, Math.sqrt(5e6 / (L.gw * L.gh)));
    const r = Math.round(res * 100) / 100, base = 'G:' + L.id;
    let s = sprites.peek(base, r);
    if (!s) {
      const fb = sprites.best(base, r);
      if (!fb) s = sprites.get(base, r, (rr) => renderGround(L, rr) as Spr, true);   // 第一次出现：只能同步
      else {
        s = fb.s;
        const k = fb.res / r;
        if (k < 0.72 || k > 2.1) {
          const B = this.gBake;
          if (!B || B.base !== base || Math.abs(B.res / r - 1) > 0.3) this.gBake = { base, res: r, it: renderGroundGen(L, r) as Generator<void, Spr> };
        }
      }
    }
    const B = this.gBake;
    if (B && B.base === base) {
      const t0 = performance.now();
      for (;;) { const st = B.it.next(); if (st.done) { sprites.adopt(base, B.res, st.value); this.gBake = null; break; } if (performance.now() - t0 > 3) break; }
    }
    if (!s) return;
    this.ctx.drawImage(s.canvas, x - s.ax * LOC_SCALE, y - s.ay * LOC_SCALE, s.w * LOC_SCALE, s.h * LOC_SCALE);
  }
  private drawFlag(x: number, y: number, color: string, t: number) {
    const ctx = this.ctx, w = this.game.weather.wind;
    ctx.save();
    ctx.strokeStyle = '#3a2a1e'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 110); ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(x, y - 108);
    const L = 46, hgt = 26;
    for (let i = 0; i <= 6; i++) { const u = i / 6; ctx.lineTo(x + u * L, y - 108 + Math.sin(t * (4 + w * 3) - u * 4) * 5 * u); }
    for (let i = 6; i >= 0; i--) { const u = i / 6; ctx.lineTo(x + u * L, y - 108 + hgt + Math.sin(t * (4 + w * 3) - u * 4 + 0.4) * 5 * u); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(30,20,10,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }
  /**
   * 收官返工 9：立体画面里的炊烟。原来那张炊烟贴图是给 2D 俯视画的一抹淡烟，立成立板几乎看不见、还被屋顶挡住，就关掉了；
   * 这里每一缕烟口在屋顶以上（锚在烟口脚下、往上抬）一秒冒一两团淡墨灰的烟（比纸色地面深一点才看得出，透明度压在三成），慢慢升、被风吹偏、越升越散越淡——普通混合的淡墨色，不发光。
   * 浓淡同 2D：清晨、黄昏最浓，夜里、阴雨淡去
   */
  private emitSmoke(F: FxSys, locs: LocDef[], dt: number, R: number, night: number) {
    const g = this.game, p = g.player, mw = mood.w, wind = g.weather.wind;
    const a = (0.6 + 0.4 * (mw.dusk + mw.dawn)) * (1 - night * 0.7) * (1 - clamp(g.weather.gloom * 1.5, 0, 0.7));
    if (a < 0.05) return;
    const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
    for (const l of locs) {
      const L = this.layout(l);
      if (!L.smoke.length) continue;
      for (const s of L.smoke) {
        const x = l.x * WORLD_SCALE + s.x * LOC_SCALE, y = l.y * WORLD_SCALE + s.y * LOC_SCALE;
        if (Math.hypot(x - p.x, y - p.y) > R || Math.random() > dt * 1.8) continue;
        const h = hash2(s.x, s.y, 3);
        F.B.billboard = { x, y, offsetY: -(170 + h * 50) };
        F.emit({ x: x + rnd(-5, 5), y, vx: 10 + wind * 45 + rnd(-5, 5), vy: -rnd(34, 50), life: rnd(4.2, 5.6), s0: rnd(50, 70), s1: rnd(260, 340), c: [0.5, 0.49, 0.47], a: 0.62 * a, add: 0, cell: smokeCell(), rot: rnd(0, 6.28), vr: rnd(-0.2, 0.2), drag: 0.12 });
      }
    }
    F.B.billboard = null;
  }
  private drawSmoke(x: number, y: number, t: number, h: number, g?: CanvasRenderingContext2D) {
    const ctx = g ?? this.ctx, w = this.game.weather.wind;
    // v0.48 一缕直上的炊烟（暧暧远人村）：黄昏、清晨最浓，夜里淡去
    const sm = mood.img('cooking_smoke');
    if (sm) {
      const mw = mood.w, a = (0.3 + 0.55 * (mw.dusk + mw.dawn)) * (1 - mw.night * 0.6) * (1 - clamp(this.game.weather.gloom * 1.5, 0, 0.7));
      const hh = 250 + h * 90, ww = hh * sm.naturalWidth / sm.naturalHeight;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y + 6);
      ctx.transform(1, 0, -(0.08 + w * 0.35) + Math.sin(t * 0.35 + h * 9) * 0.05, 1, 0, 0);
      ctx.drawImage(sm, -ww / 2, -hh, ww, hh); ctx.restore();
      return;
    }
    for (let k = 0; k < 5; k++) {
      const ph = (t * 0.18 + h + k / 5) % 1;
      ctx.fillStyle = `rgba(236,232,224,${0.32 * (1 - ph) * Math.min(1, ph * 6)})`;
      ctx.beginPath(); ctx.arc(x + ph * 60 * (0.4 + w) + Math.sin(ph * 6 + h * 10) * 8, y - ph * 170, 9 + ph * 26, 0, Math.PI * 2); ctx.fill();
    }
  }
  private drawBarrier(L: LocLayout, x: number, y: number, t: number) {
    const b = L.barrier!; const ctx = this.ctx, p = this.game.player;
    const cx = x + b.x * LOC_SCALE, cy = y + b.y * LOC_SCALE, rx = b.rx * LOC_SCALE, ry = b.ry * LOC_SCALE;
    const dx = (p.x - cx) / rx, dy = (p.y - cy) / ry, dd = Math.sqrt(dx * dx + dy * dy);
    const near = clamp(1.6 - dd, 0, 1);
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.2);
    const domeH = Math.min(rx, ry * 2) * 0.75;
    ctx.save();
    // 穹顶：半椭圆 + 地面圈
    const gr = ctx.createRadialGradient(cx, cy - domeH * 0.3, Math.min(rx, domeH) * 0.2, cx, cy - domeH * 0.3, Math.max(rx, domeH) * 1.05);
    gr.addColorStop(0, hexA(b.color, 0)); gr.addColorStop(0.75, hexA(b.color, 0.04 + near * 0.05)); gr.addColorStop(1, hexA(b.color, 0.16 + near * 0.12 + pulse * 0.04));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI, false);
    ctx.ellipse(cx, cy, rx, domeH + ry * 0.2, 0, Math.PI, Math.PI * 2, false);
    ctx.fill();
    ctx.strokeStyle = hexA(b.color, 0.35 + near * 0.3); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = hexA(b.color, 0.18 + near * 0.25); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, domeH + ry * 0.2, 0, Math.PI, Math.PI * 2); ctx.stroke();
    // 经纬阵纹
    ctx.strokeStyle = hexA(b.color, 0.1 + near * 0.18);
    for (let i = 1; i < 4; i++) {
      const k = i / 4;
      ctx.beginPath(); ctx.ellipse(cx, cy - (domeH + ry * 0.2) * Math.sin(k * Math.PI / 2) * 0.95, rx * Math.cos(k * Math.PI / 2), ry * Math.cos(k * Math.PI / 2) * 0.6, 0, Math.PI, Math.PI * 2); ctx.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI + (t * 0.05) % (Math.PI / 6);
      ctx.beginPath(); ctx.ellipse(cx, cy, Math.abs(Math.cos(a)) * rx, domeH + ry * 0.2, 0, Math.PI, Math.PI * 2); ctx.stroke();
    }
    // 符文光点沿地面圈流转
    ctx.fillStyle = hexA(b.color, 0.6 + near * 0.3);
    for (let i = 0; i < 12; i++) { const a = t * 0.25 + (i / 12) * Math.PI * 2; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  // ---------------------------------------------------------------- 人物
  private drawPlayer(dt: number) {
    const { ctx, game } = this;
    const p = game.player, st = p.st;
    ctx.save();
    const lift = st.lift;
    ctx.fillStyle = `rgba(40,40,30,${0.3 - Math.min(0.15, lift / 400)})`;
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 22 + Math.min(lift, 140) * 0.3, 7 + Math.min(lift, 140) * 0.06, 0, 0, Math.PI * 2); ctx.fill();
    // 飞得高了：脚下垂一条虚线到地面，落点画个小圈——一眼看得出人在哪个位置的上空、离地多高
    if (lift > ALT.plumb) {
      ctx.strokeStyle = 'rgba(235,245,255,0.42)'; ctx.lineWidth = 1.6; ctx.setLineDash([7, 9]);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - lift + 8); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(235,245,255,0.55)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 15, 5, 0, 0, Math.PI * 2); ctx.stroke();
    }
    // 打坐时的灵气环绕
    if (p.sitting) {
      const t = game.time;
      for (let i = 0; i < 6; i++) {
        const a = t * 1.4 + (i / 6) * Math.PI * 2;
        ctx.fillStyle = `rgba(150,240,200,${0.35 + 0.25 * Math.sin(t * 3 + i)})`;
        ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * 46, p.y - 30 + Math.sin(a) * 16, 3.2, 0, Math.PI * 2); ctx.fill();
      }
      if (Math.random() < dt * 6) { const pt = this._acquireParticle(); pt.x = p.x + (Math.random() - 0.5) * 140; pt.y = p.y + (Math.random() - 0.5) * 50; pt.vx = 0; pt.vy = -30; pt.life = 0; pt.max = 1.2; pt.size = 3; pt.color = '160,240,210'; this.particles.push(pt); }
    }
    if (game.gathering) {
      const k = game.gathering.t / 1.2;
      ctx.strokeStyle = 'rgba(255,240,180,0.9)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(p.x, p.y - 120, 14, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    const eq = game.hero.equip ?? {}, mount = p.flying ? eq.flight : undefined;
    const mg = mount ? artLook(mount).glow : '120,230,170';
    if (st.action === 'fly' && p.moving && Math.random() < 0.8) {
      const a = st.yaw;
      { const pt = this._acquireParticle(); pt.x = p.x - Math.sin(a) * 30 + (Math.random() - 0.5) * 20; pt.y = p.y - lift - Math.cos(a) * 10; pt.vx = -Math.sin(a) * 40; pt.vy = -Math.cos(a) * 20; pt.life = 0; pt.max = 0.6 + Math.random() * 0.5; pt.size = 3 + Math.random() * 4; pt.color = Math.random() < 0.5 ? mg : '220,240,255'; this.particles.push(pt); }
    }
    // 踏云靴：足下生云
    if (!p.flying && eq.boots && p.moving && Math.random() < (p.running ? 0.9 : 0.45)) {
      { const pt = this._acquireParticle(); pt.x = p.x + (Math.random() - 0.5) * 26; pt.y = p.y + 2; pt.vx = -Math.sin(st.yaw) * 30 + (Math.random() - 0.5) * 20; pt.vy = -6 - Math.random() * 10; pt.life = 0; pt.max = 0.5 + Math.random() * 0.4; pt.size = 5 + Math.random() * 5; pt.color = '245,248,255'; this.particles.push(pt); }
    }
    const hideMount = !!this.stage && !!this.fx && (!!game.combat.wing || (p.flying && p.boosting && game.boostKind === 'thunder'));
    // v0.53：元婴出窍——画缩小的主角 + 金光（肉身在 yuanying.collect 里另画）
    if (game.yuanying.active) { game.yuanying.drawYing(ctx, dt, PLAYER_SCALE * YING_SCALE); return; }
    const wet = game.jueyu.sink < -1;   // 绝域：泅水时人沉到水线，只画水线以上（下半截在水里）
    if (wet) { ctx.save(); ctx.beginPath(); ctx.rect(p.x - 600, p.y - 3000, 1200, 3000 + 3); ctx.clip(); }
    if (hasBeastSprite('p:hero') && drawBeastSprite(ctx, 'p:hero', p.x, p.y, Math.sin(st.yaw) >= 0 ? 1 : -1, charAnim(st, game.time), 1)) { if (wet) ctx.restore(); return; }   // v0.56：模组给主角换了图
    drawCharacter(ctx, p.look, st, PLAYER_SCALE, dt, { mount, hideMount });
    if (wet) ctx.restore();
  }
  /** 目的地的地面分块或景物贴图还有没生成完的（虚空挪移据此决定何时出阵） */
  get streaming(): boolean { return this.pendingBuilds > 0 || sprites.pending > 0; }
  /** 把主角单独画进一张小画布（虚空甬道里的人物立板用）：和世界里是同一套画法，换装、飞剑、模组换图都一致 */
  paintHero(canvas: HTMLCanvasElement) {
    const g = canvas.getContext('2d')!, p = this.game.player, st = p.st;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height);
    // 人物画法以 (st.x, st.y - lift) 为脚下，占左右各 170、上 330 下 70（乘缩放）的范围
    const k = canvas.width / (340 * PLAYER_SCALE);
    g.setTransform(k, 0, 0, k, -(st.x - 170 * PLAYER_SCALE) * k, -(st.y - st.lift - 330 * PLAYER_SCALE) * k);
    if (hasBeastSprite('p:hero') && drawBeastSprite(g, 'p:hero', p.x, p.y - st.lift, 1, charAnim(st, this.game.time), 1)) return;
    const flight = (this.game.hero.equip ?? {}).flight;
    drawCharacter(g, p.look, st, PLAYER_SCALE, 0, { mount: flight });
  }
  /** 把甬道里的其他人（同行的修士、追兵）画进各自的小画布：和主角同一套画法、同样的取景 */
  paintFigure(canvas: HTMLCanvasElement, look: Look, st: CharState) {
    const g = canvas.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height);
    const k = canvas.width / (340 * PLAYER_SCALE);
    g.setTransform(k, 0, 0, k, -(st.x - 170 * PLAYER_SCALE) * k, -(st.y - st.lift - 330 * PLAYER_SCALE) * k);
    drawCharacter(g, look, st, PLAYER_SCALE, 0, {});
  }
  private drawPlayerGhost() {
    const { ctx, game } = this;
    const p = game.player;
    if (hasBeastSprite('p:hero')) return;
    ctx.save();
    drawCharacter(ctx, p.look, p.st, PLAYER_SCALE * (game.yuanying.active ? YING_SCALE : 1), 0, { ghost: true, alpha: 0.28 });
    ctx.restore();
  }

  private updateParticles(dt: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // GC 优化：就地压缩 + 回收死亡粒子到对象池（避免 filter 创建新数组）
    { let w = 0;
      for (let i = 0; i < this.particles.length; i++) {
        const pt = this.particles[i];
        pt.life += dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt;
        const k = 1 - pt.life / pt.max;
        if (k <= 0) { if (this._particlePool.length < 500) this._particlePool.push(pt); continue; }
        ctx.fillStyle = `rgba(${pt.color},${0.5 * k})`;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * k, 0, Math.PI * 2); ctx.fill();
        this.particles[w++] = pt;
      }
      // 超量粒子回收到池
      while (this.particles.length > w) {
        const pt = this.particles.pop()!;
        if (this._particlePool.length < 500) this._particlePool.push(pt);
      }
      this.particles.length = w;
      if (w > 400) {
        for (let i = 0; i < w - 400; i++) if (this._particlePool.length < 500) this._particlePool.push(this.particles[i]);
        this.particles.splice(0, w - 400);
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- 名牌
  private labelCache = new Map<string, HTMLCanvasElement>(); private fontT0 = 0;
  /** 店招/门牌：名字固定，按 dpr 烘一张最高缩放档的小图；缩放只 drawImage，不再重排文字 */
  private plaqueCache = new Map<string, { cv: HTMLCanvasElement; dpr: number }>();
  private plaqueSize(name: string) { const fs = 30; return { bw: name.length * fs * 1.06 + 30, bh: fs + 18 }; }
  private plaqueSprite(name: string, bw: number, bh: number): HTMLCanvasElement {
    const hit = this.plaqueCache.get(name);
    if (hit && hit.dpr === this.dpr) return hit.cv;
    // 按最大镜头缩放（1.6）× dpr 烘一次，之后任何缩放都只缩放这张图
    const sc = Math.max(1, Math.min(3, 1.6 * this.dpr));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(bw * sc)); c.height = Math.max(1, Math.ceil(bh * sc));
    const g = c.getContext('2d')!;
    g.scale(sc, sc);
    g.fillStyle = 'rgba(20,14,8,0.35)'; g.fillRect(4, 5, bw, bh);
    g.fillStyle = '#3b2617'; g.fillRect(0, 0, bw, bh);
    g.strokeStyle = '#b8903c'; g.lineWidth = 3; g.strokeRect(4, 4, bw - 8, bh - 8);
    g.fillStyle = '#ecd08a'; g.font = 'bold 30px "STKaiti","KaiTi","Kaiti SC","Noto Serif SC",serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(name, bw / 2, bh / 2 + 1);
    if (this.plaqueCache.size > 64) { this.plaqueCache.clear(); this.plaqueWarmSet.clear(); }
    this.plaqueCache.set(name, { cv: c, dpr: this.dpr });
    return c;
  }
  /** 缩放到阈值前先在空闲帧把店招烘好，越过阈值时只做 drawImage，不再一帧内集中排版文字 */
  private plaqueWarm: string[] = [];
  private plaqueWarmSet = new Set<string>();
  private plaqueWarmTimer: number | null = null;
  private queuePlaqueWarm(name: string) {
    if (this.plaqueCache.has(name) || this.plaqueWarmSet.has(name)) return;
    this.plaqueWarmSet.add(name); this.plaqueWarm.push(name);
    if (this.plaqueWarmTimer !== null) return;
    const run = () => {
      this.plaqueWarmTimer = null;
      const n = this.plaqueWarm.shift();
      if (n) { const { bw, bh } = this.plaqueSize(n); this.plaqueSprite(n, bw, bh); }
      if (this.plaqueWarm.length) this.schedulePlaqueWarm();
    };
    const ric = (window as any).requestIdleCallback as ((cb: () => void, o?: { timeout: number }) => number) | undefined;
    this.plaqueWarmTimer = ric ? ric(run, { timeout: 240 }) : window.setTimeout(run, 24);
  }
  private schedulePlaqueWarm() { this.plaqueWarmTimer = null; const n = this.plaqueWarm[0]; if (n) this.plaqueWarmTimer = window.setTimeout(() => { this.plaqueWarm.shift(); const { bw, bh } = this.plaqueSize(n); this.plaqueSprite(n, bw, bh); this.plaqueWarmTimer = null; if (this.plaqueWarm.length) this.schedulePlaqueWarm(); }, 16); }
  private fontReady(text: string) {
    try {
      if (!document.fonts) return true;
      const f = '20px "Ma Shan Zheng"';
      if (document.fonts.check(f, text)) return true;
      // 第三十八步：字体加载失败 / 太慢时 3 秒后照样缓存，免得每帧重建名牌
      if (!this.fontT0) this.fontT0 = performance.now();
      if (performance.now() - this.fontT0 > 3000) return true;
      document.fonts.load(f, text).catch(() => {});
      return false;
    } catch { return true; }
  }
  private cacheSprite(key: string, make: () => HTMLCanvasElement, text = '') {
    let c = this.labelCache.get(key);
    if (c) return c;
    c = make();
    if (this.fontReady(text + '城镇宗险秘岛（传闻）')) {
      if (this.labelCache.size > 2000) this.labelCache.clear();
      this.labelCache.set(key, c);
    }
    return c;
  }
  private makeLabel(l: LocDef, explored: boolean, fs: number) {
    const d = this.dpr;
    const m = document.createElement('canvas').getContext('2d')!;
    const font = `${fs}px "Ma Shan Zheng", "STKaiti", "KaiTi", serif`;
    m.font = font;
    const text = explored ? l.name : l.name + '（传闻）';
    const tw = m.measureText(text).width;
    const seal = fs * 1.05, pad = fs * 0.45;
    const bw = tw + seal + pad * 3, bh = fs * 1.5, lw = Math.max(1.2, fs * 0.07);
    const c = document.createElement('canvas');
    c.width = Math.ceil((bw + lw * 2 + 4) * d); c.height = Math.ceil((bh + lw * 2 + 4) * d);
    const g = c.getContext('2d')!;
    g.scale(d, d); g.translate(lw + 2, lw + 2);
    g.fillStyle = 'rgba(246,239,222,0.94)';
    g.strokeStyle = 'rgba(60,50,40,0.75)'; g.lineWidth = lw;
    const r = bh * 0.18;
    g.beginPath();
    g.moveTo(r, 0); g.lineTo(bw - r, 0); g.quadraticCurveTo(bw, 0, bw, r);
    g.lineTo(bw, bh - r); g.quadraticCurveTo(bw, bh, bw - r, bh);
    g.lineTo(r, bh); g.quadraticCurveTo(0, bh, 0, bh - r); g.lineTo(0, r); g.quadraticCurveTo(0, 0, r, 0);
    g.fill(); g.stroke();
    g.fillStyle = LOC_SEAL_COLOR[l.type];
    const sx = pad, sy = (bh - seal) / 2;
    g.fillRect(sx, sy, seal, seal);
    g.textBaseline = 'middle'; g.textAlign = 'center';
    g.fillStyle = '#f7eedb';
    g.font = `${seal * 0.78}px "Ma Shan Zheng", "STKaiti", serif`;
    g.fillText(LOC_SEAL[l.type], sx + seal / 2, sy + seal / 2 + seal * 0.04);
    g.fillStyle = explored ? '#2a2620' : '#5a544a';
    g.font = font; g.textAlign = 'left';
    g.fillText(text, sx + seal + pad, bh / 2 + fs * 0.04);
    return c;
  }
  /**
   * P10 收尾：重要建筑的名牌。匾额上的字镜头一拉远就看不清，拉近到 0.45 以上时在城门、钟鼓楼、衙署 / 寺院山门、
   * 开张的铺子、府第、宗门各殿的屋顶上方浮一块小纸牌（要紧的 0.45 起渐显，次要的 0.75 起）。
   * 牌子画在界面层（屏幕坐标），挡到主角、身边说得上话的人就不画；彼此压住的只留要紧的、离画面中心近的。
   */
  private drawBuildingNames(hd: HdScene, locs: LocDef[], z: number, W: number, H: number) {
    const g = this.ctx, ud = this.uiDpr, game = this.game, p = game.player;
    const cand: { sx: number; sy: number; t: string; k: number; d: number }[] = [];
    for (const l of locs) {
      const L = this.layout(l); if (!L.names?.length) continue;
      const ox = l.x * WORLD_SCALE, oy = l.y * WORLD_SCALE;
      const arches = game.combat.wreck.town.broken(l.id)?.arches;   // r7-fix：断了的牌坊（修好为止）头顶不挂名牌
      for (const n of L.names) {
        if (n.k > 0 && z < 0.75) continue;
        const x = ox + n.x * LOC_SCALE, y = oy + n.y * LOC_SCALE;
        if (arches && lampDark(arches, x, y, 40)) continue;
        if (game.indoor.fadeRoom && game.indoor.fade > 0.3 && game.indoor.contains(game.indoor.fadeRoom, x, y, 60)) continue;   // 收官 P8（丁）：屋顶溶掉了，浮在屋顶上的名牌也收起来（不压着屋里的人）
        const g0 = hd.heightAt(x, y), s = hd.projectAbsolute(x, y, g0 + n.h);
        let sy = s.y;
        // 拉近时高楼的顶常在画面上沿外：楼身还在画面里就把牌子压到画面上沿以内
        if (sy < 34) { const b0 = hd.projectAbsolute(x, y, g0); if (b0.y < 80) continue; sy = 34; }
        if (s.x < -80 || s.x > W + 80 || sy > H - 20) continue;
        cand.push({ sx: s.x, sy, t: n.t, k: n.k, d: Math.hypot(s.x - W / 2, sy - H / 2) });
      }
    }
    if (!cand.length) return;
    cand.sort((a, b) => a.k - b.k || a.d - b.d);
    // 不挡人：主角、眼前能说话的人（屏幕上的身形框）
    const avoid: [number, number, number, number][] = [];
    const body = (x: number, y: number) => { hd.groundAt(x, y); const k = Math.max(0.4, hd.ss); avoid.push([hd.sx - 45 * k, hd.sy - 150 * k, hd.sx + 45 * k, hd.sy + 10 * k]); };
    body(p.x, p.y);
    const nf = game.npcs.focus; if (nf) body(nf.st.x, nf.st.y);
    const fs = Math.round(Math.max(12, Math.min(17, 11 + z * 5))), a0 = Math.max(0, Math.min(1, (z - 0.45) / 0.15));
    const used: [number, number, number, number][] = [];
    g.save(); g.setTransform(ud, 0, 0, ud, 0, 0);
    let n = 0;
    for (const c of cand) {
      if (n >= 28) break;
      const spr = this.cacheSprite(`N|${c.t}|${fs}|${ud}`, () => this.makeNamePlate(c.t, fs), c.t);
      const w = spr.width / ud, h = spr.height / ud, x0 = c.sx - w / 2, y0 = c.sy - h;
      const r: [number, number, number, number] = [x0, y0, x0 + w, y0 + h];
      const hit = (q: [number, number, number, number]) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1];
      if (avoid.some(hit) || used.some(hit)) continue;
      used.push([r[0] - 4, r[1] - 3, r[2] + 4, r[3] + 3]); n++;
      g.globalAlpha = a0 * (c.k ? 0.85 : 1);
      g.drawImage(spr, x0, y0, w, h);
    }
    g.restore(); g.globalAlpha = 1;
  }
  /** 名牌：一块淡纸色的小牌，墨色楷书，左右两道朱色短边 */
  private makeNamePlate(text: string, fs: number) {
    const d = this.uiDpr, font = `${fs}px "Ma Shan Zheng", "STKaiti", "KaiTi", serif`;
    const m = document.createElement('canvas').getContext('2d')!; m.font = font;
    const tw = m.measureText(text).width, pw = fs * 0.55, bw = tw + pw * 2 + 4, bh = fs * 1.45;
    const c = document.createElement('canvas'); c.width = Math.ceil((bw + 4) * d); c.height = Math.ceil((bh + 4) * d);
    const x = c.getContext('2d')!; x.scale(d, d); x.translate(2, 2);
    x.fillStyle = 'rgba(246,240,224,0.9)'; x.strokeStyle = 'rgba(70,58,44,0.6)'; x.lineWidth = 1;
    x.beginPath(); x.rect(0, 0, bw, bh); x.fill(); x.stroke();
    x.fillStyle = 'rgba(150,52,40,0.85)'; x.fillRect(0, 0, 2.5, bh); x.fillRect(bw - 2.5, 0, 2.5, bh);
    x.fillStyle = '#2a241c'; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, bw / 2, bh / 2 + fs * 0.05);
    return c;
  }
  private drawLabel(l: LocDef, x: number, y: number, explored: boolean) {
    const { ctx, game } = this;
    const z = game.cam.zoom;
    if (!l.major && z < 0.35) return;
    const fsW = (l.major ? 22 : 18) / Math.max(z, 0.5) * Math.min(1, 0.55 + z * 0.6);
    const fs = Math.max(8, Math.round(fsW * z / 2) * 2); // 字号量化到 2px 台阶，缩放时不再逐像素重建名牌
    const spr = this.cacheSprite(`L|${l.id}|${explored ? 1 : 0}|${fs}|${this.dpr}`, () => this.makeLabel(l, explored, fs), l.name);
    const k = 1 / (z * this.dpr);
    ctx.globalAlpha = explored ? 1 : 0.72;
    ctx.drawImage(spr, x - (spr.width * k) / 2, y, spr.width * k, spr.height * k);
    ctx.globalAlpha = 1;
  }
  private bigLabel(name: string, size: number) {
    return this.cacheSprite(`B|${name}|${size}|${this.dpr}`, () => {
      const d = this.dpr;
      const font = `${size}px "Ma Shan Zheng", "STKaiti", "KaiTi", serif`;
      const m = document.createElement('canvas').getContext('2d')!; m.font = font;
      const text = [...name].join(' ');
      const tw = m.measureText(text).width;
      const c = document.createElement('canvas'); c.width = Math.ceil((tw + 20) * d); c.height = Math.ceil(size * 1.5 * d);
      const g = c.getContext('2d')!; g.scale(d, d);
      g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgb(50,45,38)';
      g.fillText(text, (tw + 20) / 2, size * 0.75);
      return c;
    }, name);
  }

  private drawSense() {
    const { ctx, game } = this;
    const p = game.player;
    const tier = Math.min(5, game.hero.realm);
    // v0.52.8：低画质 / 软件渲染下用「整圈烤成一张图」的版本；其余用快慢两层预合成版。
    // 两者都不再逐个贴 20 多张大图，软件光栅下的开销从近百毫秒降到几次贴图。
    const cheap = this.lowered >= 4 || !!this.stage?.softGPU;
    if (cheap) { this.sense.drawCheap(ctx, p.x, p.y, game.time, tier); return; }
    const simple = this.lowered >= 2 || (!this.fixedQuality && this.lowered >= 1);
    if (simple) {
      this.sense.markSimple(tier);
      this.sense.drawSimple(ctx, p.x, p.y, game.time);
      return;
    }
    const kind = tier * 100 + this.senseMods.length;
    if (!this.sense.hasPooled || (this as any)._poolKind !== kind) {
      this.sense.buildPooled(tier, this.senseMods);
      (this as any)._poolKind = kind;
    }
    this.sense.drawPooled(ctx, p.x, p.y, game.time);
  }

  atmoRect = { x: 0, y: 0, w: 0, h: 0 };
  private cloudPar = { x: 0, y: 0, x2: 0, y2: 0, cx: NaN, cy: NaN };
  private drawAtmosphere(left: number, top: number, right: number, bottom: number, dt: number) {
    const { game } = this;
    // 高空视差：云比地面更靠近镜头，镜头移动时云掠得更快
    const cp = this.cloudPar, alt = game.alt;
    if (!isNaN(cp.cx)) { const mx = game.cam.x - cp.cx, my = game.cam.y - cp.cy; if (Math.abs(mx) + Math.abs(my) < 3000) { cp.x += mx * 0.6 * alt; cp.y += my * 0.6 * alt; cp.x2 += mx * 1.6 * alt; cp.y2 += my * 1.6 * alt; } }
    cp.cx = game.cam.x; cp.cy = game.cam.y;
    const a = this.atmoCtx, AW = this.atmo.width, AH = this.atmo.height;
    const k = Math.min((AW - 2) / (right - left), (AH - 2) / (bottom - top));
    // 对齐到氛围层像素网格，避免低分辨率层随镜头移动而闪烁
    left = Math.floor(left * k) / k; top = Math.floor(top * k) / k;
    right = left + AW / k; bottom = top + AH / k;
    this.atmoRect.x = left; this.atmoRect.y = top; this.atmoRect.w = AW / k; this.atmoRect.h = AH / k;
    a.setTransform(1, 0, 0, 1, 0, 0);
    a.clearRect(0, 0, AW, AH);
    a.setTransform(k, 0, 0, k, -left * k, -top * k);
    a.imageSmoothingEnabled = true;
    const fieldW = 9000, fieldH = 6000;
    const clouds: [number, number, number][] = [];
    const wind = 1 + game.weather.wind;
    for (const c of this.driftClouds) {
      c.x += c.v * dt * wind;
      const s = 1400 * c.s;
      const bx = Math.floor((left - s - c.x) / fieldW) * fieldW + c.x;
      const by = Math.floor((top - s - c.y) / fieldH) * fieldH + c.y;
      for (let x = bx; x < right + s; x += fieldW) for (let y = by; y < bottom + s; y += fieldH) clouds.push([x, y, s]);
    }
    a.globalAlpha = 0.16 * (1 - game.night * 0.8);
    let _q = prof.t();
    for (const [x, y, s] of clouds) a.drawImage(this.cloudShadow, x - s / 2 + 260, y - s / 2 + 420, s, s * 0.6);
    prof.add('A2┊云影', _q, clouds.length); _q = prof.t();
    if (!game.revealAll) {
      const fx0 = Math.max(0, Math.floor(left / FOG_CELL) - 1), fx1 = Math.min(FOG_W - 1, Math.floor(right / FOG_CELL) + 1);
      const fy0 = Math.max(0, Math.floor(top / FOG_CELL) - 1), fy1 = Math.min(FOG_H - 1, Math.floor(bottom / FOG_CELL) + 1);
      const t = game.time;
      a.globalAlpha = 0.97;
      for (let fy = fy0; fy <= fy1; fy++) for (let fx = fx0; fx <= fx1; fx++) {
        let fa = 0.97;
        if (game.explored[fy * FOG_W + fx]) {
          const rt = game.revealT.get(fy * FOG_W + fx);
          if (rt === undefined) continue;
          const k2 = (game.time - rt) / 1.8;
          if (k2 >= 1) { game.revealT.delete(fy * FOG_W + fx); continue; }
          fa = 0.97 * (1 - k2 * k2 * (3 - 2 * k2));
        }
        a.globalAlpha = fa;
        const h1 = hash2(fx, fy, 31), h2 = hash2(fx, fy, 32);
        const s = FOG_CELL * (2.0 + h1 * 0.5);
        const x = (fx + 0.5) * FOG_CELL + (h2 - 0.5) * 300 + Math.sin(t * 0.15 + h1 * 6) * 60;
        const y = (fy + 0.5) * FOG_CELL + (h1 - 0.5) * 300;
        a.drawImage(this.cloud, x - s / 2, y - s / 2, s, s);
      }
    }
    prof.add('A2┊未探雾块', _q); _q = prof.t();
    // 用户（2026-11-14）：屏幕上的云太多、看不清——叠在画面上的云一律减到原来的三分之一左右，只当点缀
    const baseA = (game.cam.zoom < 0.5 ? 0.14 : clamp(0.04 + (0.75 - game.cam.zoom) * 0.3, 0.03, 0.1)) * (game.weather.kind === 'clear' ? 1 : 1.4);
    if (alt < 0.02) {
      a.globalAlpha = baseA;
      for (const [x, y, s] of clouds) a.drawImage(this.cloud, x - s / 2, y - s / 2, s, s * 0.6);
    } else if (!this.volumetric) {
      // 云层（中景）：带视差，越高越浓（能画体积云时不画这些云图，高空的云交给体积云）
      a.globalAlpha = Math.min(0.2, baseA + 0.07 * alt) * (1 - game.night * 0.5);
      for (const c of this.driftClouds) {
        const s = 1400 * c.s, ox = c.x - cp.x, oy = c.y - cp.y;
        const bx = Math.floor((left - s - ox) / fieldW) * fieldW + ox, by = Math.floor((top - s - oy) / fieldH) * fieldH + oy;
        for (let x = bx; x < right + s; x += fieldW) for (let y = by; y < bottom + s; y += fieldH) a.drawImage(this.cloud, x - s / 2, y - s / 2, s, s * 0.6);
      }
      // 近云：从身边飞快掠过的薄云絮
      if (alt > 0.15) {
        a.globalAlpha = 0.13 * (alt - 0.15) / 0.85 * (1 - game.night * 0.5);
        const fw = 4200, fh = 3000;
        for (let i = 0; i < this.driftClouds.length; i++) {
          const c = this.driftClouds[i], s = 900 * c.s, ox = c.x * 0.7 + i * 1300 - cp.x2, oy = c.y * 0.6 + i * 900 - cp.y2;
          const bx = Math.floor((left - s - ox) / fw) * fw + ox, by = Math.floor((top - s - oy) / fh) * fh + oy;
          for (let x = bx; x < right + s; x += fw) for (let y = by; y < bottom + s; y += fh) a.drawImage(this.cloud, x - s / 2, y - s / 2, s * 1.3, s * 0.5);
        }
      }
    }
    a.globalAlpha = 1;
    this.atmoReady = true;
    prof.add('A2┊云本体', _q, clouds.length);
  }
}

// ---------------------------------------------------------------- 世界层上传节流
// 世界层的绘制对象（山、树、屋、NPC、粒子……）大部分只在「位置/动作」变化时才变，
// 镜头静止且内容未变时，复用纹理可减少 Canvas 上传及浏览器可能产生的同步/拷贝。
// 现在：镜头静止、且这一帧没有任何计时打点超过阈值的绘制时，最多 8 帧上传一次，
// 让 GPU 继续用上一张纹理；一旦有动画/移动/技能，立刻恢复逐帧上传。
const __dirty = new WeakMap<HTMLCanvasElement, boolean>();
const __lastUp = new WeakMap<HTMLCanvasElement, number>();
let __fno = 0;
export function unmarkDirty(cv: HTMLCanvasElement) { __dirty.set(cv, true); }
/** 世界层是否允许本帧上传 */
export function canUpload(cv: HTMLCanvasElement, movingScene: boolean, frameNo: number): boolean {
  if (movingScene) { __dirty.set(cv, false); __lastUp.set(cv, frameNo); return true; }
  const was = __dirty.get(cv); if (was) { __dirty.set(cv, false); __lastUp.set(cv, frameNo); return true; }
  const last = __lastUp.get(cv);
  if (last === undefined) return true;
  if (frameNo - last >= 8) { __lastUp.set(cv, frameNo); return true; }
  return false;
}

function hexA(hex: string, a: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}
export type { Deco };

/** 石台群的云海、深渊、界壁按主题的颜色（renderRealmHD 与进秘境之前的预备共用） */
function realmLook(th: string): Parameters<ReturnType<HdScene['realm']>['sync']>[5] {
  return (th === 'fire' ? { seaLight: [0.62, 0.52, 0.46], seaDark: [0.3, 0.2, 0.18], glow: [1.0, 0.36, 0.12, 0.9], wall: [1.0, 0.7, 0.4] }
    : th === 'blood' ? { seaLight: [0.6, 0.5, 0.5], seaDark: [0.28, 0.16, 0.18], glow: [0.9, 0.12, 0.14, 0.8], wall: [1.0, 0.56, 0.5] }
    : th === 'tomb' ? { seaLight: [0.72, 0.75, 0.8], seaDark: [0.36, 0.4, 0.5], glow: [0.4, 0.5, 0.9, 0.35], wall: [0.74, 0.84, 1.0] }
    : th === 'ice' ? { seaLight: [0.96, 0.98, 1.0], seaDark: [0.68, 0.8, 0.9], glow: [0, 0, 0, 0], wall: [0.8, 0.94, 1.0] }
    : th === 'shanshui' ? { seaLight: [0.97, 0.955, 0.92], seaDark: [0.6, 0.6, 0.58], glow: [0, 0, 0, 0], wall: [0.86, 0.8, 0.66] }   // 收官 P8（丁）：画中洞天——纸色的留白、墨色的深处
    : { seaLight: [0.95, 0.94, 0.9], seaDark: [0.7, 0.74, 0.78], glow: [0, 0, 0, 0], wall: [1.0, 0.86, 0.5] }) as Parameters<ReturnType<HdScene['realm']>['sync']>[5];
}

/** 第五轮返工：一张画布里不透明部分的包围盒（宽、高各占几成，中心在高的几成处）；阈值压过地上那块半透明的影子（飘着的兽影子离身子很远）。每种虚空兽只在头十来回画时量 */
function alphaBox(c: HTMLCanvasElement): { w: number; h: number; cy: number } {
  const W = c.width, H = c.height, d = c.getContext('2d')!.getImageData(0, 0, W, H).data;
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (d[(y * W + x) * 4 + 3] > 100) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? { w: 0.32, h: 0.3, cy: 0.5 } : { w: (x1 - x0 + 2) / W, h: (y1 - y0 + 2) / H, cy: (y0 + y1) / 2 / H };
}

/** r7-fix：(x, y) 离 pts（平铺的 x, y, x, y…）里哪一点不到 r：砸坏的灯杆那一处的灯、断了的牌坊的名牌 */
function lampDark(pts: number[], x: number, y: number, r = 150): boolean {
  for (let i = 0; i < pts.length; i += 2) if (Math.abs(pts[i] - x) < r && Math.abs(pts[i + 1] - y) < r) return true;
  return false;
}

/**
 * r9-hitfeel：把一组立体特效的每个网格临时设成「看得见、不剔除、实例数至少 1」画一帧（正式画面里编好着色器），返回撤销函数。
 * 网格的材质透明度不动——几何多半缩在原点、实例都在别处，这一帧画出来几乎看不见，只为了让 three 在正式的那一遍里把程序编好
 */
function primeGroup(group: import('three').Group): () => void {
  const undo: (() => void)[] = [];
  const gv = group.visible; group.visible = true; undo.push(() => { group.visible = gv; });
  group.traverse((o) => {
    const m = o as import('three').Mesh & { count?: number; isMesh?: boolean };
    if (o !== group) { const v = o.visible, fc = o.frustumCulled; o.visible = true; o.frustumCulled = false; undo.push(() => { o.visible = v; o.frustumCulled = fc; }); }
    if (m.isMesh) {
      const sc = m.scale.clone(); m.scale.setScalar(1e-4); undo.push(() => { m.scale.copy(sc); });
      if (m.count === 0) { m.count = 1; undo.push(() => { m.count = 0; }); }
      const geo = m.geometry as { instanceCount?: number };
      if (geo && geo.instanceCount === 0) { geo.instanceCount = 1; undo.push(() => { geo.instanceCount = 0; }); }
    }
  });
  return () => { for (let i = undo.length - 1; i >= 0; i--) undo[i](); };
}
