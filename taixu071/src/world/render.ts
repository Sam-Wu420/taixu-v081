import { effectiveFlightMount } from './flightMount';
import { guidanceInfoVisible } from './guidanceFilter';
import { SegmentIndex } from './segmentIndex';
import { FarGeometry } from './farGeometry';
import { representativeTrees, drawFarTreeSprites, forEachFarTreeSprite } from './decoOutline';
import { LocationOutlineCache, locationDetailWeight, drawLocationOutlineFallback, drawLocationPieceFallback, drawMissingLocationPiece, locationTinyPieceMode, locationStructureDetail, locationPieceVisualHeight } from '../gfx/locationLod';
import { farSummaryMode } from './farView';
// 大地图渲染：水墨底图 → 水波 → 倒影 → 地点地面 → (山/树/建筑/生灵/人物 Y 排序) → 护山大阵 → 天空生灵
//            → 昼夜 → 灯火 → 云雾/迷雾 → 名牌 → 神识 → 天气 → 季节纸纹
import { modx } from '../mod/hooks';
import { takeDecoChunks, DecoListCache, type DecoScan } from './decoScan';
import { FrameBudget, RenderPriority, type DirtyRect } from './frameBudget';
import { charFrames, getDotSprite } from '../gfx/charAtlas';
import { beginDiscipleSheetFrame } from './warformation';
import { FarPyramid } from './farPyramid';
import {
  TreePatchCache, stripTreesFromChunk, PATCH_MACRO_STRIPS, PATCH_MIN_TREES_L0, PATCH_RES_L0, PATCH_STRIP_N,
  type PatchBakeBudget, type PatchTemplateFn, type TreePatch,
} from './treePatch';
import { SYMBOL_MAX, locToSymbolKind } from './symbolLayer';
import { prof } from '../core/prof';
import { LOD as L, BAND, k as Lk, TREE_TIER, cloudZoomFade } from '../gfx/lod';
/** 树木烘焙的细节档：档内数量随 det 连续，档间靠 alpha 交叉淡入（4 档足够平滑） */
function LODFadeLocation(ctx: CanvasRenderingContext2D, alpha: number, draw: () => void) { ctx.save(); ctx.globalAlpha *= alpha; draw(); ctx.restore(); }
const TREE_DET_STEPS = 4;
export const TREE_DET_LEVELS = [0.45, 0.65, 0.85, 1];
/** 树木的 drawImage 变体，供遮挡 sprite 也用同一档 */
import { grassSprite, grassRes } from '../gfx/grass';
import type { Game } from './game';
import { FOG_CELL, FOG_W, FOG_H } from './game';
import { CHUNK, Deco, TreeDeco, MtnDeco, FallDeco, type Terrain } from './terrain';
import { makeFallCliff, fallGeometry, drawFallAnim, type FallMeta } from '../gfx/waterfall';
import { LOCATIONS, LocDef, WORLD_SCALE, WORLD_W, WORLD_H, RANGES, BIG_LABELS, groundZones, zoneAt, ACTIVE_MAP } from '../data/world';
import { hash2, clamp } from '../core/rng';
import { IS_TOUCH } from '../core/touch';
import { bindOf, keyLabel } from '../core/keymap';
import { sprites, resBucket, Spr } from '../gfx/sprites';
import { spriteJobs } from '../gfx/spriteJobs';
const EMPTY_MTNS: readonly MtnDeco[] = [];
const FAR_MTN_CHUNKS_MAX = 16384;
const CHUNK_ENTRY_CACHE_MAX = 2048;
const FAR_TREE_CHUNKS_MAX = 4096;
const LABEL_CACHE_MAX = IS_TOUCH ? 800 : 2000;
const GROUND_TOWNS = LOCATIONS.filter((l) => l.type === 'city' || l.type === 'town');
import { makeTree, Season } from '../gfx/tree';
import { drawTreeCover, tiersFor } from './landCover';
import { CanopyLayer } from './canopy';

/** 每块地最多画几棵树：越大越全，画不了的部分由林色底补上 */
const treeCapFor = (z: number) => Math.round(32 + 224 * Math.max(0, Math.min(1, (z - .045) / .12)));
/**
 * 按当前视口块数与缩放计算单块实际代表树上限：
 * - 远中景（z < 0.10）把全屏总树数按 ~2400 摊到可见区块上，防止缩到 0.06 时整屏上万棵树把 D·树 拖垮；
 * - 0.10 → 0.18 随 smoothstep 平滑放开回单块上限 treeCapFor(z)；
 * - 中近景（z >= 0.18）严格保持 treeCapFor(z)（256），不因视口块数误砍近景密林。
 */
export function effectiveTreeCap(z: number, viewW: number, viewH: number): number {
  const cap = treeCapFor(z);
  const chunksInView = Math.max(1, Math.ceil(Math.max(1, viewW) / CHUNK) * Math.ceil(Math.max(1, viewH) / CHUNK));
  const budgetCap = Math.max(1, Math.round(1200 / chunksInView));
  const blend = L.smooth(0.10, 0.18, z);
  return Math.min(cap, Math.max(1, Math.round(budgetCap + (cap - budgetCap) * blend)));
}
import { makeMountain } from '../gfx/mountain';
import { getLayout, renderPiece, renderGround, renderGroundGen, LOC_SCALE, LocLayout, Piece, drawSectParallaxBack, drawSectParallaxFore } from '../gfx/building';
import { loadBld2, tickBld2, drawBld, drawWallRun, fillPatternTiled, drawDecal, warmBld } from '../gfx/bldTex2';
import { drawCharacter } from '../gfx/character';
import { equipmentAppearance } from '../gfx/equipmentAppearance';
import { YING_SCALE } from './yuanying';
import { itemArtLook } from '../data/itemArtLook';
import { collectGatherVisuals } from './gatherVisual';
import type { Drawable } from './life';
import { SenseFx, senseMods } from './sense';
import { collectCombat, drawCombatFx, drawCombatUI, drawCombatSprites } from './combatfx';
import { REALMS } from '../data/realms';
import { GLStage, PostParams } from '../gl/stage';
import type { WorldSpriteBatch } from '../gl/worldBatch';
import { loadBldTex } from '../gfx/bldTex';
import { loadHeadTex } from '../gfx/headTex';
import { loadBeastTex, hasBeastSprite, drawBeastSprite, charAnim } from '../gfx/beastTex';
import { MAX_SEG, MAX_TOWN, MAX_ZONE, type GroundSegs, type GroundView, type SegProvider } from '../gl/ground';
import { FxSys } from '../gl/fx';
import { drawCombatGL } from '../gl/combatgl';
import { drawRealmFootGL, drawRealmFoot2D } from '../gl/realmFoot';
import { TIERS } from './sense';
import { mood, grainEnabled } from './mood';
import { moodMask } from './weather';

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
  /** 触发半透淡出的脚底死区像素（默认 20，小摆件可用更小值） */
  deadzone?: number;
  /** 平滑状态 key（默认用传入的对象本身） */
  ent?: object;
}
const MASK_N = 64;
const MASK_CACHE = new WeakMap<HTMLCanvasElement, Uint8Array>();
let maskScratchCv: HTMLCanvasElement | null = null;
let maskScratchCtx: CanvasRenderingContext2D | null = null;
function spriteMask(cv: HTMLCanvasElement): Uint8Array {
  const hit = MASK_CACHE.get(cv); if (hit) return hit;
  let m: Uint8Array;
  try {
    if (!maskScratchCv) {
      maskScratchCv = document.createElement('canvas');
      maskScratchCv.width = maskScratchCv.height = MASK_N;
      maskScratchCtx = maskScratchCv.getContext('2d', { willReadFrequently: true });
    }
    const g = maskScratchCtx!;
    g.clearRect(0, 0, MASK_N, MASK_N);
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
export const SP_INDEX: Record<string, number> = { pine: 1, broad: 2, willow: 3, bamboo: 4, maple: 5, ymaple: 6, plum: 7, peach: 8, cypress: 9, snowpine: 10, dead: 11, palm: 12, apricot: 13 };

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string }
interface MtnMeta { falls: { x: number; y: number; w: number; h: number }[] }
interface ChunkDecoItem {
  d: Drawable;
  cntKind: -1 | 0 | 1 | 2;
  visMode: 0 | 1;
  x: number; y: number; w: number; h: number;
}
interface ChunkTreeStrip {
  trees: ChunkDecoItem[];
  raw: TreeDeco[];
  minX: number; minY: number; maxX: number; maxY: number;
}
interface ChunkDecoEntry {
  cx?: number;
  cy?: number;
  strips?: ChunkTreeStrip[];
  trees: ChunkDecoItem[];
  items: ChunkDecoItem[];
  reflect: (TreeDeco | MtnDeco)[];
  mtns: readonly MtnDeco[];
  farTrees: TreeDeco[];
  stN: number;
  stH: number;
  mtnCount: number;
  decoCount: number;
  minX: number; minY: number; maxX: number; maxY: number;
}

export class Renderer {
  game: Game;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dpr = 1; W = 0; H = 0;
  cloud: HTMLCanvasElement;
  glow: HTMLCanvasElement;
  particles: Particle[] = [];
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
  readonly frameBudget = new FrameBudget();
  private sprAtlasKey = new WeakMap<object, string>();
  private nextAtlasId = 1;
  private glCam = { x: 0, y: 0, z: 1, W: 0, H: 0 };
  private lastSceneValid = false;
  private lastSceneTime = NaN;
  private lastSceneCam = { x: NaN, y: NaN };
  private lastSceneZoom = NaN;
  private lastSceneW = 0;
  private lastSceneH = 0;
  private lastSceneGround = false;
  private lastSceneDecoRev = -1;
  private lastSceneLowered = -1;
  private lastSceneSeason = -1;
  private lastSceneDay = -1;
  private lastSceneFarSummary = false;
  private lastSceneSeeAll = false;
  farSummary = false;
  private readonly locationOutlines = new LocationOutlineCache(256);
  private lastDetailRadius = NaN;
  private farGeometry: FarGeometry | null = null;
  private farGeometryTerrain: Terrain | null = null;
  private liveNow = false;   // v0.52.7：本帧视野内是否有活物（路人/灵宠/妖兽）
  private atmoSkipNow = false;   // v0.52.8：本帧跳过氛围层重画（沿用上一张）
  private atmoStep = 1;          // 氛围层每几帧重画一次（1 = 逐帧，2 = 半速）
  private atmoRevision = 0;
  private atmoReady = false;     // 氛围层已经有内容（首帧必须先画一次）
  private lastStillZ = NaN;
  private _sceneW = 0; private _sceneH = 0;
  /** 四季缓存：提前烘好另外三季的树（移植版附加项；原版线上没有，默认关） */
  seasonCache = false;
  /** 树风摆关掉：走轴对齐快路径，密林更流畅，树不再轻摆（默认开＝原版） */
  flatTrees = false;
  private treeWarmQ: { d: TreeDeco; season: Season; res: number }[] = [];
  private treeWarmSet = new Set<string>();
  private farTreeChunks = new Map<number, TreeDeco[]>();
  /** 已扫描 chunk 的代表山：极远时继续保留真实山体轮廓，不被宏观模式整批剔除。 */
  private farMountainChunks = new Map<number, readonly MtnDeco[]>();
  private farMtnScan: DecoScan | null = null;
  private farMtnScanKey = '';
  /** 极远摘要的区块遍历缓存：区块集合一变就累加，用来跳过每帧的「展开 Map + filter + 带闭包 sort」 */
  private farChunkEpoch = 0;
  private farTreeEpoch = 0;
  private farMtnEpoch = 0;
  private farTreeOrderKey = '';
  private farTreeOrder: number[] = [];
  private farMtnOrderKey = '';
  private farMtnOrder: { cx: number; cy: number; mtns: MtnDeco[] }[] = [];
  private farTreeTerrain: Terrain | null = null;
  private locGridMap = '';
  private locGrid = new Map<number, LocDef[]>();
  private playerFlyCv: HTMLCanvasElement | null = null;
  private playerFlyRes = 0;
  private flyPlayerTex: WebGLTexture | null = null;
  private flyPlayerTexW = 0;
  private flyPlayerTexH = 0;
  private pyrTexCache = new Map<string, WebGLTexture>();
  private pyrTexGl: WebGL2RenderingContext | null = null;
  private atmoCache: {
    left: number; top: number; right: number; bottom: number;
    zoom: number; exploredCount: number; step: number; t: number; map: string;
  } | null = null;
  /** 本帧因为 chunk 预算用尽而没遍历完（迁移自 fanren）：下一帧继续，避免一次性卡住主线程 */
  dlPending = false;
  private dlScanPending = false;
  /** 装饰列表缓存（fanren11 render.ts:800）：chunkKey 变才重建区块表，缩放变化时零重建直接按 perChunkTreeCap 切片输出 */
  private dlCache = new DecoListCache<Drawable, TreeDeco | MtnDeco, MtnDeco>();
  private dlShownChunks: ChunkDecoEntry[] = [];
  private dlShownChunkKey = '';
  private dlShownBox = { cx0: 0, cy0: 0, cx1: -1, cy1: -1, stateKey: '' };
  private zoomFrozenTreeCap = -1;
  private dlBuildChunks: ChunkDecoEntry[] = [];
  private dlBuildChunkKey = '';
  /** 极远景「整片林子」色块（按缩放烘一张位图，每帧一次贴图）。F3 面板会读它的状态 */
  canopy = new CanopyLayer();
  farPyramid = new FarPyramid();
  treePatches = new TreePatchCache();
  private farBox: { x0: number; y0: number; x1: number; y1: number }[] = [];
  private dlDecoRevision = -1;
  private dlT = 0;
  private dlZ = 1;
  private dlDecoK = 1;
  private dlMistK = 1;
  private dlLowered = 0;
  private prevFrameZ = NaN;
  private zoomStableN = 6;
  private grassLastRes = 0;
  get isZoomActive() { return this.zoomStableN < 6; }
  /** 单区块装饰条目缓存（仅按地图/季节/装饰修订号隔离，不随缩放清缓存）：缩放和飞行平移均可跨 dkey 直接复用 */
  private chunkEntryCache = new Map<number, ChunkDecoEntry>();
  private chunkEntryStateKey = '';
  private lastLight = { night: 0, dusk: 0, gloom: 0, dayK: 1, mul: [255, 255, 255] as number[] };
  private firstFramePainted = false;
  isFirstFrameReady(): boolean {
    return this.firstFramePainted && (!this.stage || this.stage.lost || !this.groundWanted || this.stage.groundReady);
  }
  readonly renderCam = { x: 0, y: 0, zoom: 0 };
  private Z = 1; private ox = 0; private oy = 0;
  stats = { decos: 0, trees: 0, mtns: 0, ms: 0, grass: 0 };
  sense = new SenseFx();
  senseMods: string[] = [];
  private modsT = 0;

  /** WebGL 合成层（不可用时为 null，回退纯 Canvas2D） */
  stage: GLStage | null = null;
  fx: FxSys | null = null;
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
    this.pushAtlasSpr = this.pushAtlasSpr.bind(this);
    // 位图缓存预算：桌面（GL 路径 + 独显）给到 140MP，手机上 40MP——山树建筑不再反复重建
    try {
      const touchDev = IS_TOUCH;
      sprites.setBudget(touchDev ? 40e6 : 140e6);
      this.seasonCache = localStorage.getItem('fanren.seasonCache') === '1';
      this.worldDprCap = Number(localStorage.getItem('fanren.worldDpr') || 0) || 0;
      // 树 / 山的精灵分辨率不再有「固定档」：一律跟随缩放（连续 LOD），
      // 固定档那套（fanren.treeSprite / fanren.mtnSprite）已废弃，读到也不再使用。
      try { localStorage.removeItem('fanren.treeSprite'); localStorage.removeItem('fanren.mtnSprite'); } catch { /* */ }
      this.flatTrees = localStorage.getItem('fanren.treeSway') === '0';
    } catch { /* */ }
    const q = typeof location !== 'undefined' ? location.search : '';
    let wantGL = !/[?&]gl=0/.test(q);
    try { if (localStorage.getItem('fanren.gl') === '0' && !/[?&]gl=1/.test(q)) wantGL = false; } catch { /* */ }
    this.stage = wantGL ? GLStage.create() : null;
    if (this.stage) {
      this.canvas = document.createElement('canvas');
      // 透明：底下是 GPU 地表（gl/ground.ts），Canvas 只画地表之上的东西
      this.ctx = this.canvas.getContext('2d', { alpha: true })!;
      this.groundWanted = !/[?&]ground=0/.test(q);
      this.uiCtx = canvas.getContext('2d')!;
      const gc = this.stage.canvas; gc.className = 'game-gl';
      canvas.parentElement?.insertBefore(gc, canvas);
      this.fx = new FxSys(this.stage.batch);
      this.stage.onContextChange = () => this.resetStill();
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
  private ro: ResizeObserver | null = null;
  private onResize = () => this.resize();

  private disposeGlCaches() {
    if (!this.stage) return;
    const gl = this.stage.gl;
    if (this.flyPlayerTex) { gl.deleteTexture(this.flyPlayerTex); this.flyPlayerTex = null; }
    for (const tex of this.pyrTexCache.values()) gl.deleteTexture(tex);
    this.pyrTexCache.clear();
    this.pyrTexGl = null;
  }

  dispose() {
    this.firstFramePainted = false;
    this.locationOutlines.clear();
    this.labelCache.clear();
    this.plaqueCache.clear();
    this.plaqueWarm.length = 0;
    this.plaqueWarmSet.clear();
    this.chunkEntryCache.clear();
    this.farTreeChunks.clear();
    this.farMountainChunks.clear();
    this.treeWarmQ.length = 0;
    this.treeWarmSet.clear();
    window.removeEventListener('resize', this.onResize);
    this.ro?.disconnect(); this.ro = null;
    this.disposeGlCaches();
    if (this.stage) this.stage.onContextChange = null;
    if (this.stage) {
      this.stage.ground?.dispose();
      this.stage.worldAtlas?.dispose();
      this.stage.canvas.remove();
      this.stage.gl.getExtension('WEBGL_lose_context')?.loseContext();
      this.stage = null;
    }
    if (this.canvas !== this.domCanvas) { this.canvas.width = this.canvas.height = 0; }
    this.atmo.width = this.atmo.height = 0;
  }

  resize() {
    const isMobile = IS_TOUCH || Math.min(window.innerWidth, window.innerHeight) < 600;
    const el = this.domCanvas;
    const oldW = this.W, oldH = this.H;
    this.W = el.clientWidth || window.innerWidth;
    this.H = el.clientHeight || window.innerHeight;
    // 改了尺寸就必须重画一帧：面板开着时世界层是停画的（v0.71），画布刚被清空时不能留着空白
    this.game.requestFrame();
    // 世界层按「像素预算」定分辨率，而不是按 devicePixelRatio 死算。
    // 以前 4K 屏（或 150% 缩放的 2K 屏）会按 1.5 倍渲染，一帧世界层就是 3000×2000 上下、二十多兆，
    // 每帧都要从 Canvas 拷进 GPU 纹理，光这一项就能把任何显卡拖垮——画面简单却卡，根源在这里。
    // 现在给世界层一个总像素上限（桌面 2.2MP / 手机 1.0MP），超出就等比降采样；水墨画风放大后几乎看不出。
    let want = Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 2, this.maxDpr ?? 1.5);
    // 世界层 DPR 上限（设置面板）：只压世界层，HUD 仍用 uiDpr
    if (this.worldDprCap > 0) want = Math.min(want, this.worldDprCap);
    const area = Math.max(1, this.W * this.H);
    const budget = isMobile ? Math.min(this.pxBudget, 1.5e6) : this.pxBudget;
    if (area * want * want > budget) want = Math.sqrt(budget / area);
    this.dpr = Math.max(0.55, Math.min(want, 2));
    // 只有尺寸真的变了才改 canvas 宽高：赋值一次就会清空整张贴图，
    // 自适应降档/恢复（applyLevel → resize）如果尺寸没变却照赋值，画面就会白闪一帧、
    // 人/树"消失一下又出现"。这就是缩放时闪烁的来源之一。
    const cw = Math.round(this.W * this.dpr), chh = Math.round(this.H * this.dpr);
    let sceneChanged = this.canvas.width !== cw || this.canvas.height !== chh || oldW !== this.W || oldH !== this.H;
    if (this.canvas.width !== cw || this.canvas.height !== chh) {
      this.canvas.width = cw;
      this.canvas.height = chh;
    }
    if (this.stage) {
      // UI 层与 GL 输出用设备像素比（文字清晰），世界层可按画质降采样
      const ud = Math.min(window.devicePixelRatio || 1, 2);
      const uw = Math.round(this.W * ud), uh = Math.round(this.H * ud);
      if (this.domCanvas.width !== uw || this.domCanvas.height !== uh) sceneChanged = true;
      if (this.domCanvas.width !== uw) this.domCanvas.width = uw;
      if (this.domCanvas.height !== uh) this.domCanvas.height = uh;
      this.uiDpr = ud;
      // 后期输出与世界层同分辨率（高分屏上不再按 2× 跑整套后期）
      // 后期输出也跟着世界层走（略高 15%，保证世界层放大后不糊），4K 屏不再按满像素跑整套着色器
      const sd = Math.min(ud, Math.max(0.8, this.dpr * 1.15));
      this.stage.bloomOn = true;   // 第三十八步：泛光属于特效，任何降档都不关
      this.stage.bloomLevels = this.lowered >= 1 ? 2 : 3;   // 降过档就少跑一级泛光（省 3 个全屏 pass）
      this.stage.resize(this.W * sd, this.H * sd);
    }
    if (this.atmo) {
      const aw = Math.ceil(this.W * Renderer.AS) + 2, ah = Math.ceil(this.H * Renderer.AS) + 2;
      if (this.atmo.width !== aw || this.atmo.height !== ah) { this.atmo.width = aw; this.atmo.height = ah; this.atmoReady = false; this.atmoCache = null; this.atmoRevision++; }
    }
    if (sceneChanged) { this.stillFrames = 0; this.stillCam.x = NaN; this.stillCam.y = NaN; this.lastSceneValid = false; }
    this.overlayKey = '';
  }

  /** 按 y 排序好的 list 统一绘制：遮挡淡出只在这里判一次 */
  private insertionSortY(arr: Drawable[], lo: number, hi: number) {
    for (let i = lo + 1; i < hi; i++) {
      const v = arr[i];
      const vy = v.y;
      let j = i - 1;
      while (j >= lo && arr[j].y > vy) { arr[j + 1] = arr[j]; j--; }
      arr[j + 1] = v;
    }
  }

  /** 计数排序（按 y 分桶，P5 零分配）：预分配 2048 桶，小桶用内联插入排序，无闭包与临时数组 */
  private sortByY(list: Drawable[]) {
    const n = list.length;
    if (n < 48) { this.insertionSortY(list, 0, n); return; }
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < n; i++) { const y = list[i].y; if (y < min) min = y; if (y > max) max = y; }
    const span = max - min;
    if (!(span > 0) || !isFinite(span)) { this.insertionSortY(list, 0, n); return; }
    const nb = Math.min(2048, Math.max(64, n >> 1));
    if (!this.sortBuckets) {
      this.sortBuckets = new Array<Drawable[]>(2048);
      for (let i = 0; i < 2048; i++) this.sortBuckets[i] = [];
    }
    const buckets = this.sortBuckets;
    for (let i = 0; i < nb; i++) buckets[i].length = 0;
    const scale = (nb - 0.0001) / span;
    for (let i = 0; i < n; i++) { const d = list[i]; buckets[((d.y - min) * scale) | 0].push(d); }
    let k = 0;
    for (let i = 0; i < nb; i++) {
      const b = buckets[i];
      const bl = b.length;
      if (bl === 0) continue;
      if (bl <= 16) {
        if (bl > 1) this.insertionSortY(b, 0, bl);
      } else {
        b.sort((a, bb) => a.y - bb.y);
      }
      for (let j = 0; j < bl; j++) list[k++] = b[j];
      b.length = 0;
    }
  }
  private sortBuckets: Drawable[][] | null = null;
  private frameList: Drawable[] = [];
  private decoReflectList: (TreeDeco | MtnDeco)[] = [];
  private decoPrefetchList: MtnDeco[] = [];
  private sceneGroundRects: { left: number; top: number; right: number; bottom: number }[] = [];
  private overlapsSceneGround(d: Drawable): boolean {
    const rects = this.sceneGroundRects;
    if (!rects.length) return false;
    const dx = (d as { x?: number }).x;
    const dy = d.y;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (dy >= r.top - 40 && dy <= r.bottom + 320 && (dx === undefined || (dx >= r.left - 240 && dx <= r.right + 240))) {
        return true;
      }
    }
    return false;
  }
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
    if (pl.flying || this.dlZ < 0.25) return 1;   // 飞行或远景缩小时不判定（缩小时主角极小，避免全屏查遮挡）
    const ent = o.ent ?? o;
    const behind = pl.y < o.footY - (o.deadzone ?? 20);
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
      // 先做世界空间包围盒邻近剔除：主角不在物件投影范围内时，绝不取 sprite 或调 spriteMask(getImageData)
      const entObj = o.ent as { w?: number; h?: number } | undefined;
      const reachX = Math.max(360, (entObj?.w ?? 420) * 0.65 + 40);
      const reachY = Math.max(420, (entObj?.h ?? 520) + 180);
      if (Math.abs(pl.x - o.x) <= reachX && o.footY - pl.y <= reachY) {
        const spr = o.get();
        want = spr && coveredRatio(spr, o, pl) > 0.25 ? 1 : 0;
      }
    }
    const target = want ? (o.k ?? 0.5) : 1;
    const a0 = OCCL_A.get(ent) ?? 1;
    let a = Math.abs(a0 - target) < 0.02 ? target : a0 + (target - a0) * 0.18;
    if (a === 1) OCCL_A.delete(ent); else OCCL_A.set(ent, a);
    return a;
  }

  private locsInView(left: number, top: number, right: number, bottom: number): LocDef[] {
    const CELL = 4096;
    if (this.locGridMap !== ACTIVE_MAP || this.locGrid.size === 0) {
      this.locGridMap = ACTIVE_MAP;
      this.locGrid.clear();
      for (const l of LOCATIONS) {
        const x = l.x * WORLD_SCALE, y = l.y * WORLD_SCALE;
        const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
        const k = cx * 256 + cy;
        let arr = this.locGrid.get(k);
        if (!arr) { arr = []; this.locGrid.set(k, arr); }
        arr.push(l);
      }
    }
    const cx0 = Math.floor(left / CELL), cx1 = Math.floor(right / CELL);
    const cy0 = Math.floor(top / CELL), cy1 = Math.floor(bottom / CELL);
    const out: LocDef[] = [];
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const arr = this.locGrid.get(cx * 256 + cy);
        if (arr) for (const l of arr) out.push(l);
      }
    }
    return out;
  }
  viewRect() {
    const z = this.game.cam.zoom, W = this.W || window.innerWidth, H = this.H || window.innerHeight;
    return { left: this.game.cam.x - W / 2 / z, top: this.game.cam.y - H / 2 / z, right: this.game.cam.x + W / 2 / z, bottom: this.game.cam.y + H / 2 / z };
  }

  burst(x: number, y: number, color: string, n = 26) {
    const c = color.startsWith('#') ? `${parseInt(color.slice(1, 3), 16)},${parseInt(color.slice(3, 5), 16)},${parseInt(color.slice(5, 7), 16)}` : color;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 90;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 40, life: 0, max: 0.7 + Math.random() * 0.8, size: 2 + Math.random() * 4, color: c });
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
    // 30 帧上限的正常间隔不应被误判为设备性能不足。
    if (this.game.frameLimit > 0 && this.game.frameLimit < 60) dt *= this.game.frameLimit / 60;
    if (dt > 0.05) this.spikes++;
    if (dt <= 0 || this.fixedQuality) return;
    if (dt > 0.25) return; // 切页、加载造成的单次长帧不计入
    // 连续缩放期间会集中重烘地表/图集/金字塔，瞬时耗时不计入画质降档窗口，避免缩放途中触发 resize 闪屏与锁死模糊档位
    if (this.zoomStableN < 12) return;
    this.perfT += dt; this.perfN++; this.perfAcc += dt;
    if (this.perfT <= 2.5) return;
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

  private pushWorldSpr(
    batch: WorldSpriteBatch,
    spr: { canvas: HTMLCanvasElement | HTMLImageElement; w: number; h: number; ax: number; ay: number },
    wx: number, wy: number, sxScale: number, syScale: number,
    flip: boolean, alpha: number, swayCss = 0, keyOverride?: string,
    r = 1, g = 1, b = 1, dirty = false, deferOnThrottle = false,
  ): boolean {
    const atlas = this.stage?.worldAtlas;
    if (!atlas) return false;
    if (!(alpha > 0.004)) return true;
    const img = spr.canvas as HTMLImageElement;
    const cw = img.naturalWidth || spr.canvas.width || spr.w, ch = img.naturalHeight || spr.canvas.height || spr.h;
    if (!(cw > 0 && ch > 0)) return false;
    let ak = keyOverride;
    if (!ak) {
      ak = this.sprAtlasKey.get(spr.canvas);
      if (!ak) { ak = 'S' + (this.nextAtlasId++); this.sprAtlasKey.set(spr.canvas, ak); }
    }
    const e = atlas.ensure(ak, spr.canvas, cw, ch, dirty);
    if (!e) {
      if (deferOnThrottle && atlas.throttled) return true;
      return false;
    }
    const { x: camX, y: camY, z, W, H } = this.glCam;
    const sx = (wx - camX) * z + W * 0.5, sy = (wy - camY) * z + H * 0.5;
    const dw = spr.w * sxScale * z, dh = spr.h * syScale * z;
    const dx = flip ? sx - (spr.w - spr.ax) * sxScale * z : sx - spr.ax * sxScale * z;
    const dy = sy - spr.ay * syScale * z;
    if (dx + dw < -4 || dx > W + 4 || dy + dh < -4 || dy > H + 4) return true;
    batch.push(e.tex, dx, dy, dw, dh, flip ? e.u1 : e.u0, e.v0, flip ? e.u0 : e.u1, e.v1, r, g, b, alpha, swayCss);
    return true;
  }

  /** P2/P3 公开合批入口：向 WorldSpriteBatch 推入任意贴图（含角色帧图集、远景2px点、脚影、符号牌） */
  pushAtlasSpr(
    batch: WorldSpriteBatch,
    spr: { canvas: HTMLCanvasElement | HTMLImageElement; w: number; h: number; ax: number; ay: number },
    wx: number, wy: number, sxScale: number, syScale: number,
    flip: boolean, alpha: number, keyOverride?: string,
    r = 1, g = 1, b = 1, deferOnThrottle = false,
  ): boolean {
    return this.pushWorldSpr(batch, spr, wx, wy, sxScale, syScale, flip, alpha, 0, keyOverride, r, g, b, false, deferOnThrottle);
  }

  private treeSwayWeight(d: TreeDeco, z: number): number {
    if (z >= 0.65) return 1;
    const pl = this.game?.player;
    if (!pl) return 1;
    const dist = Math.hypot(d.x - pl.x, d.y - pl.y);
    const prox = 1 - L.smooth(420, 640, dist);
    const zoomK = L.smooth(0.55, 0.65, z);
    return prox + (1 - prox) * zoomK;
  }

  private getPatchTemplateFn(season: Season): PatchTemplateFn {
    return (d) => {
      const seed = (SP_INDEX[d.sp] ?? 0) * 1000 + d.v * 37 + 11;
      const base = `T:${d.sp}:${season}:${d.v}:d0`;
      return sprites.get(base, PATCH_RES_L0, (r) => makeTree(d.sp, season, seed, r, TREE_DET_LEVELS[0]) as Spr, true);
    };
  }

  private makeTreePatchDrawable(patch: TreePatch): Drawable {
    const spr = patch.spr!;
    return {
      y: patch.sortY,
      k: 'D·树片',
      gl: (b, occA) => this.pushWorldSpr(b, spr, patch.wx, patch.wy, 1, 1, false, occA, 0, patch.key, 1, 1, 1, false, false),
      draw: () => {
        const ctx = this.ctx;
        if (this._occA < 1) {
          ctx.save(); ctx.globalAlpha *= this._occA;
          ctx.drawImage(spr.canvas, patch.wx, patch.wy, patch.ww, patch.wh);
          ctx.restore();
        } else {
          ctx.drawImage(spr.canvas, patch.wx, patch.wy, patch.ww, patch.wh);
        }
      },
    };
  }

  private emitMacroTreePatches(
    T: Terrain,
    season: Season,
    z: number,
    camX: number,
    camY: number,
    dlLeft: number,
    dlTop: number,
    dlRight: number,
    dlBottom: number,
    budget: PatchBakeBudget,
    getTpl: PatchTemplateFn,
    glBatch: WorldSpriteBatch | null,
    list: Drawable[] | null,
  ): number {
    const decoRev = T.decoRevision ?? 0;
    const macroLevel: 1 | 2 = z < 0.042 ? 2 : 1;
    const chunksPerMacro = macroLevel === 1 ? 2 : 4;
    const macroSpan = chunksPerMacro * CHUNK;
    const stripH = macroSpan / PATCH_MACRO_STRIPS;
    const maxGx = Math.floor(WORLD_W / macroSpan);
    const maxGy = Math.floor(WORLD_H / macroSpan);
    const gx0 = Math.max(0, Math.floor(dlLeft / macroSpan));
    const gx1 = Math.min(maxGx, Math.floor(dlRight / macroSpan));
    const gy0 = Math.max(0, Math.floor(dlTop / macroSpan));
    const gy1 = Math.min(maxGy, Math.floor(dlBottom / macroSpan));
    const cells: { gx: number; gy: number; d2: number }[] = [];
    for (let gy = gy0; gy <= gy1; gy++) {
      const cy = (gy + 0.5) * macroSpan - camY;
      for (let gx = gx0; gx <= gx1; gx++) {
        const cx = (gx + 0.5) * macroSpan - camX;
        cells.push({ gx, gy, d2: cx * cx + cy * cy });
      }
    }
    cells.sort((a, b) => a.d2 - b.d2);

    const ctx = this.ctx;
    const atlas = this.stage?.worldAtlas;
    const emitPatch = (p: TreePatch) => {
      if (p.empty || !p.spr) return 0;
      if (p.wx + p.ww < dlLeft || p.wx > dlRight || p.wy + p.wh < dlTop || p.wy > dlBottom) return 0;
      if (list) {
        list.push(this.makeTreePatchDrawable(p));
        return p.treeCount;
      }
      if (glBatch && this.pushWorldSpr(glBatch, p.spr, p.wx, p.wy, 1, 1, false, this._occA, 0, p.key, 1, 1, 1, false, false)) {
        return p.treeCount;
      }
      if (atlas?.throttled) budget.pending = true;
      if (this._occA < 1) {
        ctx.save(); ctx.globalAlpha *= this._occA;
        ctx.drawImage(p.spr.canvas, p.wx, p.wy, p.ww, p.wh);
        ctx.restore();
      } else {
        ctx.drawImage(p.spr.canvas, p.wx, p.wy, p.ww, p.wh);
      }
      return p.treeCount;
    };

    let treeCount = 0;
    const fallbacks: TreePatch[] = [];
    for (let i = 0; i < cells.length; i++) {
      const { gx, gy } = cells[i];
      for (let strip = 0; strip < PATCH_MACRO_STRIPS; strip++) {
        const sy0 = gy * macroSpan + strip * stripH;
        const sy1 = sy0 + stripH;
        if (sy1 < dlTop - 300 || sy0 > dlBottom + 300) continue;
        const p = this.treePatches.getMacroStrip(T, macroLevel, decoRev, season, gx, gy, strip, budget, getTpl);
        if (p) {
          treeCount += emitPatch(p);
        } else {
          fallbacks.length = 0;
          this.treePatches.collectCachedFallbackPatches(macroLevel, decoRev, season, gx, gy, strip, fallbacks);
          for (let f = 0; f < fallbacks.length; f++) treeCount += emitPatch(fallbacks[f]);
        }
      }
    }
    return treeCount;
  }

  private pushTreeGl(batch: WorldSpriteBatch, d: TreeDeco, t: number, lodScale: number, alpha: number): boolean {
    const z = this.game.cam.zoom;
    const wind = this.game.weather.wind;
    const kk = this.Z * d.s * TREE_K * lodScale;
    const sw = this.flatTrees || d.h * kk < 20 ? 0 : ((Math.sin(t * 1.3 + d.ph) * 0.022 + Math.sin(t * 2.9 + d.ph * 2) * 0.008) * (0.5 + wind) + wind * 0.012) * this.treeSwayWeight(d, z);
    const q = Lk(BAND.treeFar, L.pxPerUnit(z, this.dpr) * d.s * TREE_K) * (TREE_DET_STEPS - 1);
    const lo = Math.max(0, Math.min(TREE_DET_STEPS - 1, Math.floor(q)));
    const hi = Math.min(TREE_DET_STEPS - 1, lo + 1);
    const mix = q - lo;
    const sLo = this.treeSprite(d, z, lo);
    if (!sLo) return true;
    const sc = d.s * TREE_K * lodScale;
    const memoLo = (d as any)._tsp as { base: string; season: number; res: number; det: number } | undefined;
    const keyLo = memoLo && memoLo.det === lo ? `${memoLo.base}@${memoLo.res}` : `T:${d.sp}:${this.game.season}:${d.v}:d${lo}@${sLo.w}x${sLo.h}`;
    const atlas = this.stage?.worldAtlas;
    let drawSpr = sLo, drawKey = keyLo;
    if (atlas?.throttled && !atlas.peek(keyLo)) {
      const prev = (d as any)._glPrev as { key: string; spr: Spr } | undefined;
      if (prev && atlas.peek(prev.key)) { drawSpr = prev.spr; drawKey = prev.key; }
    }
    const swayCss = -sw * sc * drawSpr.ay * z;
    if (!this.pushWorldSpr(batch, drawSpr, d.x, d.y, sc, sc, !!d.flip, alpha, swayCss, drawKey, 1, 1, 1, false, true)) return false;
    if (drawKey === keyLo && atlas?.peek(keyLo)) (d as any)._glPrev = { key: keyLo, spr: sLo };
    if (mix > 0.02 && hi !== lo) {
      const sHi = this.treeSprite(d, z, hi);
      if (sHi) {
        const memoHi = (d as any)._tsp as { base: string; season: number; res: number; det: number } | undefined;
        const keyHi = memoHi && memoHi.det === hi ? `${memoHi.base}@${memoHi.res}` : `T:${d.sp}:${this.game.season}:${d.v}:d${hi}@${sHi.w}x${sHi.h}`;
        this.pushWorldSpr(batch, sHi, d.x, d.y, sc, sc, !!d.flip, alpha * mix, -sw * sc * sHi.ay * z, keyHi, 1, 1, 1, false, true);
      }
    }
    return true;
  }

  private pushMtnGl(batch: WorldSpriteBatch, d: MtnDeco, z: number, alpha: number, far: boolean, preSpr?: Spr | null): boolean {
    const s = preSpr === undefined ? this.mtnSprite(d, z, far) : preSpr;
    if (!s) return true;
    const memoM = (d as any)._msp as { base: string; r: number; dq: number } | undefined;
    const mKey = memoM ? `${memoM.base}@${memoM.r}` : `M:${d.id}@${s.w}x${s.h}`;
    const atlas = this.stage?.worldAtlas;
    let drawSpr = s, drawKey = mKey;
    if (atlas?.throttled && !atlas.peek(mKey)) {
      const prev = (d as any)._glPrev as { key: string; spr: Spr } | undefined;
      if (prev && atlas.peek(prev.key)) { drawSpr = prev.spr; drawKey = prev.key; }
    }
    if (far) {
      const invZ = 1 / Math.max(0.001, this.Z);
      const targetH = L.mountainSizePx(drawSpr.h * this.Z);
      const k = Math.max(0.001, (targetH * invZ) / Math.max(1, drawSpr.h));
      const ok = this.pushWorldSpr(batch, drawSpr, d.x, d.y, k, k, !!d.flip, alpha, 0, drawKey, 1, 1, 1, false, true);
      if (ok && drawKey === mKey && atlas?.peek(mKey)) (d as any)._glPrev = { key: mKey, spr: s };
      return ok;
    }
    const meta = this.mtnMeta.get(d.id);
    if (meta?.falls.length && Lk(BAND.fall, z) > L.GONE) return false;
    const ok = this.pushWorldSpr(batch, drawSpr, d.x, d.y, 1, 1, !!d.flip, alpha, 0, drawKey, 1, 1, 1, false, true);
    if (ok && drawKey === mKey && atlas?.peek(mKey)) (d as any)._glPrev = { key: mKey, spr: s };
    return ok;
  }

  /** 实时草丛：缓存位图 + 斜切摇摆（只有神识圈内会动，圈外是静止的记忆） */
  private drawGrass(left: number, top: number, right: number, bottom: number, t: number, season: number, z: number, gk = 1) {
    const { ctx, game } = this;
    const T = game.terrain;
    const zdpr = z * this.dpr;
    let res = this.grassLastRes;
    if (res === 1) res = zdpr > 1.70 ? 3 : zdpr > 0.96 ? 2 : 1;
    else if (res === 2) res = zdpr > 1.70 ? 3 : zdpr < 0.84 ? 1 : 2;
    else if (res === 3) res = zdpr < 0.84 ? 1 : zdpr < 1.50 ? 2 : 3;
    else res = grassRes(zdpr);
    this.grassLastRes = res;
    // 草的三档密度也走全局表：不再是 z<0.65 一刀砍掉两档，而是按概率逐档抽稀（同一坐标恒定，不会闪）
    const tierK = Lk(BAND.grassTier, L.pxPerUnit(z, this.dpr));
    const wind = game.weather.wind;
    const px = game.player.x, py = game.player.y, R = game.detailSenseRadius, R2 = R * R;
    const thin = this.lowered >= 3 ? 4 : this.lowered >= 2 ? 2 : 1;
    const atlas = this.groundOn ? this.stage?.worldAtlas : undefined;
    const glBatch = atlas ? this.stage!.worldUnder : null;
    let n = 0;
    for (let cy = Math.floor((top - 10) / CHUNK); cy <= Math.floor((bottom + 60) / CHUNK); cy++) for (let cx = Math.floor((left - 40) / CHUNK); cx <= Math.floor((right + 40) / CHUNK); cx++) {
      if (cx < 0 || cy < 0 || cx * CHUNK > WORLD_W || cy * CHUNK > WORLD_H) continue;
      if (!this.groundOn && !T.getChunk(cx, cy, false)) continue;
      // 第三十步：魔道地界 / 阴地里的草是枯的（按块取一次地域）
      const zq = zoneAt((cx + 0.5) * CHUNK, (cy + 0.5) * CHUNK);
      const gs = zq.k > 0.45 ? (zq.t === 1 ? 2 : 3) : season;
      const grassList = this.groundOn ? T.getFgGrass(cx, cy) : T.getGrass(cx, cy);
      for (const c of grassList) {
        if (!L.keep(c.lod, tierK, hash2(c.x, c.y, 9))) continue;
        if (c.x < left - 40 || c.x > right + 40 || c.y < top - 5 || c.y > bottom + 60) continue;
        // v0.52.8 性能：低画质时按位置稀疏化草丛（按坐标散列抽稀，不会整片变秃）
        if (thin > 1 && ((c.x * 0.37 + c.y * 0.71 + c.v) % thin) >= 1) continue;
        const sp = grassSprite(c.kind, c.v, gs, res);
        const dx = c.x - px, dy = c.y - py;
        const d2 = dx * dx + dy * dy;
        let sk = wind * 0.12;
        if (d2 < R2) {
          sk += (Math.sin(t * 1.7 + c.ph + c.x * 0.004) * 0.16 + Math.sin(t * 3.1 + c.ph * 2) * 0.05) * (0.45 + wind);
          // 人走过时草向两侧分开
          if (d2 < 3600) sk += (dx > 0 ? 1 : -1) * (1 - Math.sqrt(d2) / 60) * 0.5;
        }
        const s = c.s;
        if (glBatch && atlas) {
          const gKey = `G:${c.kind}:${c.v}:${gs}:${res}`;
          const sway = -sk * s * sp.h * 0.5 * z;
          if (this.pushWorldSpr(glBatch, sp as any, c.x, c.y, s, s, false, gk, sway, gKey)) {
            n++;
            continue;
          }
          if (atlas.throttled) {
            const fbRes = res === 3 ? [2, 1] : res === 2 ? [1, 3] : [2, 3];
            let drewFb = false;
            for (const fr of fbRes) {
              const fbKey = `G:${c.kind}:${c.v}:${gs}:${fr}`;
              if (atlas.peek(fbKey)) {
                const fbSp = grassSprite(c.kind, c.v, gs, fr);
                if (this.pushWorldSpr(glBatch, fbSp as any, c.x, c.y, s, s, false, gk, sway, fbKey)) {
                  n++; drewFb = true; break;
                }
              }
            }
            if (drewFb || atlas.throttled) continue;
          }
        }
        // Canvas2D 回退：直接在已设好的世界变换里画，摇摆量折算成水平位移
        ctx.drawImage(
          sp.canvas,
          c.x - sp.ax * s - sk * s * sp.h * 0.5,
          c.y - sp.ay * s,
          sp.w * s,
          sp.h * s,
        );
        n++;
      }
    }
    this.stats.grass = n;
    this.world();
  }

  private sfx: { x: number; y: number; vx: number; vy: number; r: number; vr: number; life: number; age: number; c: string; s: number; k: number }[] = [];
  private drawSeasonFx(dt: number, season: number, px: number, py: number, R: number) {
    const { ctx, game } = this;
    const wk = game.weather.kind as string;
    // 落花飞雪：密度随缩放连续变稀（原先在 0.4 处整片开关，拉远会「啪」地一下全没）
    const sfrac = Lk(BAND.sparkle, game.cam.zoom);
    const ok = (wk === 'clear' || wk === 'cloudy') && season !== 3 && sfrac > L.GONE;
    const wind = game.weather.wind;
    if (ok && dt > 0) {
      const rate = (season === 2 ? 7 : season === 0 ? 6 : 2.5) * sfrac;
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
  resetStill() {
    this.stillFrames = 0; this.skipSceneNow = false; this.lastStillZ = -1;
    this.stillCam.x = NaN; this.stillCam.y = NaN; this.lastSceneValid = false;
    const st = this.stage as any; if (st) { st.sceneUp = false; }
    this.game.requestFrame();   // 停画状态下也要保证下一帧真画出来
  }
  /** v0.52.7：视野内是否还有「会动的东西」——路人、道侣、灵宠、妖兽、飞剑。
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
      if (!e.dead && !e.gone && Math.abs(e.x - camX) < hw && Math.abs(e.y - camY) < hh) return true;
    }
    for (const e of g.combat?.allies ?? []) {
      if (!e.dead && !e.gone && Math.abs(e.x - camX) < hw && Math.abs(e.y - camY) < hh) return true;
    }
    for (const pr of g.combat?.projs ?? []) {
      if (Math.abs(pr.x - camX) < hw && Math.abs(pr.y - camY) < hh) return true;
    }
    for (const sk of g.sectwar?.hasActiveRenderUnitsNear?.(camX, camY, hw, hh) ? [1] : []) {
      void sk;
      return true;
    }
    return false;
  }
  render(dt: number) {
    this.renderFrame(dt);
    // GL 上下文丢失时世界仍画在离屏画布；将 Canvas2D 回退结果送到可见 UI 画布。
    if (this.stage?.lost) {
      const g = this.uiCtx; g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, this.domCanvas.width, this.domCanvas.height);
      g.drawImage(this.canvas, 0, 0, this.domCanvas.width, this.domCanvas.height); g.restore();
    }
    this.firstFramePainted = true;
  }
  private renderFrame(dt: number) {
    const t0 = performance.now();
    this.frameBudget.begin(L.emaMs());
    let _p = prof.t();
    const { ctx, game } = this;
    const z = game.cam.zoom;
    const zoomMoving = Number.isFinite(this.prevFrameZ) && Math.abs(z / this.prevFrameZ - 1) > 0.0025;
    this.zoomStableN = zoomMoving ? 0 : Math.min(32, this.zoomStableN + 1);
    this.prevFrameZ = z;
    this.adapt(dt);
    const zoomTargetPending = Number.isFinite(game.cam.targetZoom) && Math.abs(game.cam.targetZoom / Math.max(1e-4, z) - 1) > 0.015;
    sprites.zoomActive = this.zoomStableN < 16 || zoomTargetPending;
    if (!sprites.unlimited) {
      sprites.frameMs = game.time < 2 ? 28 : sprites.zoomActive ? 2.5 : this.zoomStableN < 24 ? 4.5 : this.zoomStableN < 32 ? 5.5 : 7; // 开场预热；缩放期（含滚轮间歇）收紧预算，停稳后渐进放开避免重建尖峰
    }
    sprites.beginFrame();
    if (this.seasonCache) this.pumpTreeWarm();
    tickBld2(dt);
    const W = this.W, H = this.H, dpr = this.dpr;
    this._sceneW = W; this._sceneH = H;
    const GL = !!this.stage && !this.stage.lost;
    const ui = GL ? this.uiCtx : ctx;
    const t = game.time;
    const season = game.season as Season;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    // 统一用 low：medium 会在每次缩放采样时走更贵的重采样核，实测同一场景 CPU 光栅要多花两成多，
    // 而水墨画风对这点锐度差异几乎无感（世界层本来就是近似 1:1 绘制）
    ctx.imageSmoothingQuality = 'low';
    // v0.54：身在秘境——另走一条精简管线（不画大地图的地表、山树、城镇、天气）
    if (game.mijing.active) {
      // 秘境不走下面的正常管线；UI 层仍要清一次，避免把上一步的月/地名留在画面上
      if (GL) { ui.setTransform(1, 0, 0, 1, 0, 0); ui.clearRect(0, 0, this.domCanvas.width, this.domCanvas.height); }
      this.renderRealm(dt, GL); return;
    }
    const T0 = game.terrain;
    if (GL && this.groundWanted && !this.groundSet && T0.ready) { this.stage!.setTerrain(T0.glData()); this.groundSet = true; }
    const GROUND = GL && this.groundWanted && this.stage!.groundReady;
    this.groundOn = GROUND;
    const detailRadius = game.detailSenseRadius;
    if (detailRadius !== this.lastDetailRadius) { this.stillFrames = 0; this.stillCam.x = NaN; this.stillCam.y = NaN; this.lastDetailRadius = detailRadius; }
    if (GROUND) this.advanceSegmentIndices(T0);
    const far = farSummaryMode(this.farSummary, z, GROUND);
    if (far !== this.farSummary) {
      this.farSummary = far; this.dlCache.reset(); this.dlPending = false;
      this.stillFrames = 0; this.stillCam.x = NaN; this.stillCam.y = NaN;
    }
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
      // v0.52.7：站着不动 ≠ 世界不动。视野里只要有活物（路人、道侣、灵宠、妖兽），
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
      const exactStaticReuse = GL && this.lastSceneValid && !this.dlPending && t === this.lastSceneTime
        && Math.abs(camB.x - this.lastSceneCam.x) < 1e-4 && Math.abs(camB.y - this.lastSceneCam.y) < 1e-4
        && z === this.lastSceneZoom && W === this.lastSceneW && H === this.lastSceneH
        && GROUND === this.lastSceneGround && T0.decoRevision === this.lastSceneDecoRev
        && this.lowered === this.lastSceneLowered && season === this.lastSceneSeason
        && game.day === this.lastSceneDay && this.farSummary === this.lastSceneFarSummary
        && !!(game.revealAll && game.debugSeeAll) === this.lastSceneSeeAll
        && !game.destination && !this.particles.length && !game.tianxiang.active
        && !(game.trauma > 0) && this.sense.alarm <= 0.3 && !modx?.animating;
      this.skipSceneNow = exactStaticReuse || (GL && !this.dlPending && ((canSkipScene && this.stillFrames >= 2 && this.stillFrames % 4 !== 0) || (halfRate && (game.frameNo & 1) === 1)));
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
    if (GROUND) ctx.clearRect(0, 0, W, H);
    else { ctx.fillStyle = '#e9dfc6'; ctx.fillRect(0, 0, W, H); }

    const sh = (this.sense.alarm > 0.3 ? (this.sense.alarm - 0.3) * 5 : 0) / z;
    // 震屏：创伤值平方 × 平滑噪声（随时间连续，不抖成白噪）
    const tr = game.trauma, tk = tr * tr * 15 / z, rt = performance.now() / 1000;
    const camX = game.cam.x + (sh ? Math.sin(game.time * 47) * sh : 0) + (tk ? (Math.sin(rt * 41.3) + Math.sin(rt * 67.1) * 0.5) * tk : 0);
    const camY = game.cam.y + (sh ? Math.cos(game.time * 53) * sh : 0) + (tk ? (Math.cos(rt * 37.7) + Math.sin(rt * 59.3) * 0.5) * tk : 0);
    const left = camX - W / 2 / z, top = camY - H / 2 / z, right = camX + W / 2 / z, bottom = camY + H / 2 / z;
    this.Z = z * dpr; this.ox = W * dpr / 2 - camX * this.Z; this.oy = H * dpr / 2 - camY * this.Z;
    this.renderCam.x = camX; this.renderCam.y = camY; this.renderCam.zoom = z;
    this.world();
    const T = game.terrain;
    T.season = season;

    prof.add('R·准备', _p); _p = prof.t();
    // 静止：世界层整块跳过。注意地面是 GPU 地表（在后期里按世界坐标实时采样），
    // 所以只要不重画世界层、光照参数照旧，画面与上一帧完全一致。
    if (this.skipSceneNow) {
      // 光照参数与上一帧相同（世界没变），直接复用上一帧算好的值
      const L = this.lastLight;
      this.postGL(camX, camY, z, W, H, L.night, L.dusk, L.gloom, L.dayK, L.mul, game.detailSenseRadius, false);
      return;
    }
    // 只有真正要重画时才清 UI 层：静止跳帧时保留上一帧的月/地名/文字，
    // 否则清完直接 return，会看到月亮和「青霞谷」这类文字每 4 帧闪一次。
    charFrames.beginFrame();
    beginDiscipleSheetFrame();
    this.sceneGroundRects.length = 0;
    if (GL) {
      ui.setTransform(1, 0, 0, 1, 0, 0); ui.clearRect(0, 0, this.domCanvas.width, this.domCanvas.height);
      const wa = this.stage!.worldAtlas;
      if (wa) {
        wa.beginFrame();
        wa.maxMipPages = 2;
        wa.maxNewUploadMB = sprites.zoomActive ? 2.8 : 3.5;
      }
      this.stage!.worldUnder.reset();
      this.stage!.worldOver.reset();
      this.glCam.x = camX; this.glCam.y = camY; this.glCam.z = z; this.glCam.W = W; this.glCam.H = H;
    }
    // ---------- 1. 底图分块（GPU 地表开启时跳过）----------
    const cx0 = Math.floor(left / CHUNK), cx1 = Math.floor(right / CHUNK);
    const cy0 = Math.floor(top / CHUNK), cy1 = Math.floor(bottom / CHUNK);
    if (!GROUND) {
    let builds = 0;
    const maxBuilds = this.pendingBuilds > 0 ? 3 : 5;
    const order: [number, number, number][] = [];
    for (let cy = cy0 - 1; cy <= cy1 + 1; cy++) for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
      order.push([cx, cy, Math.hypot((cx + 0.5) * CHUNK - camX, (cy + 0.5) * CHUNK - camY)]);
    }
    order.sort((a, b) => a[2] - b[2]);
    let missing = 0;
    for (const [cx, cy] of order) {
      if (cx < 0 || cy < 0 || cx * CHUNK > WORLD_W || cy * CHUNK > WORLD_H) continue;
      let ch = T.getChunk(cx, cy, false);
      if ((!ch || ch.season !== T.season) && builds < maxBuilds) { ch = T.getChunk(cx, cy, true); builds++; }
      if (!ch) { missing++; continue; }
      const inView = (cx + 1) * CHUNK > left && cx * CHUNK < right && (cy + 1) * CHUNK > top && cy * CHUNK < bottom;
      if (inView) ctx.drawImage(ch.canvas, cx * CHUNK - 0.6, cy * CHUNK - 0.6, CHUNK + 1.2, CHUNK + 1.2);
    }
    this.pendingBuilds = missing;
    } else this.pendingBuilds = 0;

    // ---------- 2. 水波（GPU 地表自带流水、浪花、粼光）----------
    // 全局 LOD 标尺：E = zoom × dpr（一个世界单位占多少设备像素）。水面 / 草 / 树 / 装饰 / 标签
    // 都按这张表淡入淡出，不再是各自一套 z<0.35 之类的硬阈值。
    const unitE = L.pxPerUnit(z, this.dpr);
    const waterK = Lk(BAND.water, unitE);
    if (waterK > L.GONE && !GROUND) L.fade(ctx, waterK, () => this.drawWater(left, top, right, bottom, t));
    // ---------- 2b. 草丛 ----------
    // 第十九步：原著名地的地面贴花（熔岩湖、血潭、白玉广场……）
    prof.add('R·底图水面', _p); _p = prof.t();
    game.landmarks.drawGround(ctx, { left, top, right, bottom }, z, dpr, t, this.sceneGroundRects);
    prof.add('R·名地地面', _p); _p = prof.t();
    const grassK = Lk(BAND.grass, unitE);
    this.frameBudget.syncElapsed();
    if (grassK > L.GONE) this.drawGrass(left, top, right, bottom, t, season, z, grassK);
    prof.add('R·草', _p); _p = prof.t();

    // ---------- 3. 收集装饰 ----------
    const list = this.frameList; list.length = 0;
    const reflect = this.decoReflectList; reflect.length = 0;
    const prefetch = this.decoPrefetchList; prefetch.length = 0;
    let nTrees = 0, nM = 0, nD = 0;
    const decoK = Lk(BAND.deco, unitE);
    const mistK = Lk(BAND.cloud, unitE);
    const reflectOn = Lk(BAND.reflect, unitE) > L.GONE;
    // 植被密度：这一帧有多少棵树的"屏上高度"已经不足 1 像素，按 chunk 累计，
    // 稍后在绘制队列之前用一块柔和的林色代表它们（树消失后"林子还在"）。

    // ---------- 装饰列表缓存（二级解耦：区块扫描只随区块集合与赛季/地形版本号更新，缩放变化零重建）----------
    if (this.farTreeTerrain !== T || this.dlDecoRevision !== T.decoRevision) { this.chunkEntryCache.clear(); this.chunkEntryStateKey = ''; this.farTreeChunks.clear(); this.farMountainChunks.clear(); this.farMtnScan = null; this.farMtnScanKey = ''; this.farChunkEpoch++; this.farTreeEpoch++; this.farMtnEpoch++; this.farTreeOrderKey = ''; this.farMtnOrderKey = ''; this.farTreeOrder.length = 0; this.farMtnOrder.length = 0; this.farTreeTerrain = T; this.dlDecoRevision = T.decoRevision; this.dlCache.reset(); this.dlShownChunks = []; this.dlShownChunkKey = ''; this.dlShownBox.stateKey = ''; this.zoomFrozenTreeCap = -1; this.dlBuildChunks = []; this.dlBuildChunkKey = ''; this.dlPending = false; this.dlScanPending = false; this.treePatches.clear(); }
    const pad = z < 0.08 ? CHUNK * 0.45 : z < 0.25 ? CHUNK / 2 : CHUNK / 4, dlLeft = left - pad, dlRight = right + pad, dlTop = top - pad, dlBottom = bottom + pad;
    const dlStateKey = `${ACTIVE_MAP}|${Math.round(dpr * 100)}|${this.game.season}|${this.lowered}|${T.decoRevision}`;
    const chunkKey = `${ACTIVE_MAP}|${cx0},${cy0},${cx1},${cy1}|${Math.round(dpr * 100)}|${this.game.season}|${this.lowered}|${T.decoRevision}`;
    const dkey = chunkKey;
    this.dlT = t;
    this.dlZ = z;
    this.dlDecoK = decoK;
    this.dlMistK = mistK;
    this.dlLowered = this.lowered;
    const glFarBatch = GROUND && this.stage?.worldAtlas ? this.stage.worldUnder : null;
    this.treePatches.beginFrame(T, season as Season, T.decoRevision ?? 0);
    const patchBudget: PatchBakeBudget = {
      t0: performance.now(),
      budgetMs: this.treePatches.size === 0 ? 6.5 : sprites.zoomActive ? 1.6 : 3.4,
      bakes: 0,
      scans: 0,
      pending: false,
    };
    const patchTpl = this.getPatchTemplateFn(season as Season);
    const useMacroTrees = z < 0.085;
    // 仅在无 GPU 地表时用 FarGeometry 宏观线框保底（不再往 GPU 地表叠加绿滤镜铺底）
    if (!GROUND && (this.farSummary || z < 0.07)) {
      if (this.farGeometryTerrain !== T || !this.farGeometry) {
        this.farGeometryTerrain = T;
        this.farGeometry = new FarGeometry(RANGES, T.rivers, T.roads, WORLD_SCALE);
      }
      this.farGeometry.step(); this.farGeometry.draw(ctx, z);
    }
    if (this.farSummary) {
      const maxCx=Math.floor(WORLD_W/CHUNK), maxCy=Math.floor(WORLD_H/CHUNK);
      const mx0=Math.max(0,cx0-1), mx1=Math.min(maxCx,cx1+1), my0=Math.max(0,cy0-1), my1=Math.min(maxCy,cy1+2);

      const mkey=`${ACTIVE_MAP}|${mx0},${my0},${mx1},${my1}|${T.decoRevision}`;
      if(mkey!==this.farMtnScanKey||!this.farMtnScan){
        this.farMtnScan={x0:mx0,x1:mx1,y0:my0,y1:my1,cursor:0};
        this.farMtnScanKey=mkey;
      }
      const mtnStart = performance.now();
      const mtnBudget = sprites.zoomActive ? (this.lowered >= 2 ? 32 : 64) : (this.lowered >= 2 ? 64 : 128);
      const mtnBatch=takeDecoChunks(this.farMtnScan,mtnBudget,(cx,cy)=>!this.farMountainChunks.has(cx*4096+cy));
      for(const [cx,cy] of mtnBatch.chunks){ this.farMountainChunks.set(cx*4096+cy,T.getMountains(cx,cy)); this.farChunkEpoch++; this.farMtnEpoch++; }
      if(this.farMountainChunks.size>FAR_MTN_CHUNKS_MAX){this.farChunkEpoch++;this.farMtnEpoch++;while(this.farMountainChunks.size>FAR_MTN_CHUNKS_MAX)this.farMountainChunks.delete(this.farMountainChunks.keys().next().value!);}
      const mtnScanMs = performance.now() - mtnStart;
      void mtnScanMs;

      // 极远按当前视口范围从北到南绘制山峰；借鉴 MSAGLJS TileCapacity，对 4×4 宏观单元（4096²）按峰高限流核心主峰，避免全图上万散峰无差别遍历。
      let farMountainDraws=0;
      const warmList:{d:MtnDeco;d2:number}[]=[];
      const mtnTier = z < 0.03 ? 0 : 1;
      const mtnOrderKey = `${mkey}|${this.farMtnEpoch}|${mtnTier}`;
      if (mtnOrderKey !== this.farMtnOrderKey) {
        // 按单个 chunk 独立保留主峰（每块至多 chunkCap 座），避免流式加载邻块时把已绘块中的山峰挤掉引发闪烁
        const chunkCap = mtnTier === 0 ? 3 : 5;
        const cells: { cx: number; cy: number; mtns: MtnDeco[] }[] = [];
        for (const [key, m] of this.farMountainChunks) {
          if (!m.length) continue;
          const cx = Math.floor(key / 4096), cy = key % 4096;
          if (cy < my0 || cy > my1 || cx < mx0 || cx > mx1) continue;
          const mtns = m.length > chunkCap
            ? [...m].sort((a, b) => b.h - a.h).slice(0, chunkCap)
            : [...m];
          if (mtns.length > 1) mtns.sort((a, b) => a.y - b.y || a.x - b.x);
          cells.push({ cx, cy, mtns });
        }
        cells.sort((a, b) => a.cy - b.cy || a.cx - b.cx);
        this.farMtnOrder = cells; this.farMtnOrderKey = mtnOrderKey;
      }
      for(const cell of this.farMtnOrder){
          const cx=cell.cx, cy=cell.cy;
          if(cy<my0||cy>my1||cx<mx0||cx>mx1)continue;
          if((cy+1)*CHUNK<top-300||cy*CHUNK>bottom+300)continue;
          if((cx+1)*CHUNK<left-300||cx*CHUNK>right+300)continue;
          for(const d of cell.mtns){
            const sprite=this.mtnSprite(d,z,true);
            if(sprite){
              if (!(glFarBatch && this.pushMtnGl(glFarBatch, d, z, this._occA, true, sprite))) this.mtnFar(d,z,true,sprite);
              farMountainDraws++;
            }
            else warmList.push({d,d2:(d.x-camX)**2+(d.y-camY)**2});
          }
      }
      if(warmList.length){
        warmList.sort((a,b)=>a.d2-b.d2);
        const J=spriteJobs();
        const maxW = sprites.zoomActive ? 4 : 16;
        const maxS = sprites.zoomActive ? 3 : 12;
        if(J.ok){
          for(let i=0;i<warmList.length&&i<maxW&&J.queued<J.maxInflight;i++) this.mtnSprite(warmList[i].d,z);
        }else{
          for(let i=0;i<warmList.length&&i<maxS&&sprites.canBuild();i++) this.mtnSprite(warmList[i].d,z);
        }
      }
      // 极远树林直接走同源真树宏片批绘，不砍成每块 1 棵也不往地面铺绿滤镜
      const treeStart = prof.t();
      const farTreeCount = this.emitMacroTreePatches(
        T, season as Season, z, camX, camY, left - 300, top - 300, right + 300, bottom + 300,
        patchBudget, patchTpl, glFarBatch, null,
      );
      prof.add('R·极远林批绘',treeStart); _p = prof.t();
      this.dlScanPending = false;
      this.dlPending = (!GROUND && (this.farGeometry?.pending ?? false)) || mtnBatch.pending || patchBudget.pending;
      this.stats.trees = farTreeCount; this.stats.mtns = farMountainDraws; this.stats.decos = 0;
      (this.stats as any).keepRatio = 0; (this.stats as any).dlPending = this.dlPending ? 1 : 0;
    } else {
    const pl = game.player;
    const patchCtx = {
      season: season as Season,
      decoRev: T.decoRevision ?? 0,
      playerX: pl.x,
      playerY: pl.y,
      skipTrees: useMacroTrees,
      allSingle: z >= 0.65,
      nearSingle: z >= 0.12 && z < 0.65,
      budget: patchBudget,
      getTpl: patchTpl,
    };
    if (
      dkey === this.dlCache.key
      || (!this.dlScanPending && chunkKey === this.dlShownChunkKey)
      || (sprites.zoomActive && !this.dlScanPending && this.dlShownChunks.length > 0 && this.dlShownBox.stateKey === dlStateKey && cx0 - 1 >= this.dlShownBox.cx0 && cx1 + 1 <= this.dlShownBox.cx1 && cy0 - 1 >= this.dlShownBox.cy0 && cy1 + 2 <= this.dlShownBox.cy1)
    ) {
      if (this.dlScanPending) { this.dlCache.cancelScan(); this.dlBuildChunks = []; this.dlBuildChunkKey = ''; this.dlScanPending = false; }
      const emitBuild = { list, reflect, prefetch, counts: [0, 0, 0] as [number, number, number] };
      for (const entry of this.dlShownChunks) {
        this.emitChunkEntry(entry, dlLeft, dlRight, dlTop, dlBottom, 256, this.Z, emitBuild, patchCtx);
      }
      if (useMacroTrees) {
        emitBuild.counts[0] += this.emitMacroTreePatches(
          T, season as Season, z, camX, camY, dlLeft, dlTop, dlRight, dlBottom,
          patchBudget, patchTpl, null, list,
        );
      }
      this.dlPending = patchBudget.pending;
      [nTrees, nM, nD] = emitBuild.counts;
      this.stats.trees = nTrees; this.stats.mtns = nM; this.stats.decos = nD;
      (this.stats as any).dlPending = this.dlPending ? 1 : 0;
      prof.add('R·收集山树(缓存命中)', _p); _p = prof.t();
    } else {
    const keepRatio = 1;
    const missBudget = sprites.zoomActive ? 12 : (this.lowered >= 2 ? 24 : this.lowered >= 1 ? 36 : 48);
    const scanBudgetMs = sprites.zoomActive ? 1.5 : 2.5;
    const entryStateKey = `${ACTIVE_MAP}|${season}|${T.decoRevision}`;
    if (entryStateKey !== this.chunkEntryStateKey) {
      this.chunkEntryCache.clear();
      this.chunkEntryStateKey = entryStateKey;
    }
    const scan = this.dlCache.begin(dkey, cx0 - 1, cx1 + 1, cy0 - 1, cy1 + 2);
    if (this.dlBuildChunkKey !== chunkKey) {
      this.dlBuildChunks = [];
      this.dlBuildChunkKey = chunkKey;
    }
    let misses = 0;
    let pending = true;
    const tScan0 = performance.now();
    while (pending && misses < missBudget) {
      const batch = takeDecoChunks(scan, 8, (cx, cy) =>
        cx >= 0 && cy >= 0 && cx * CHUNK <= WORLD_W && cy * CHUNK <= WORLD_H);
      pending = batch.pending;
      for (const [cx, cy] of batch.chunks) {
        const ck = cx * 4096 + cy;
        let entry = this.chunkEntryCache.get(ck);
        if (!entry) {
          entry = this.buildChunkEntry(T, cx, cy, ck, season as Season, 256, decoK, mistK, reflectOn);
          this.chunkEntryCache.set(ck, entry);
          misses++;
        } else {
          this.chunkEntryCache.delete(ck);
          this.chunkEntryCache.set(ck, entry);
          if (!this.farTreeChunks.has(ck)) { this.farTreeChunks.set(ck, entry.farTrees); this.farChunkEpoch++; this.farTreeEpoch++; }
          if (!this.farMountainChunks.has(ck)) { this.farMountainChunks.set(ck, entry.mtns); this.farChunkEpoch++; this.farMtnEpoch++; }
        }
        this.dlBuildChunks.push(entry);
      }
      if (misses >= (sprites.zoomActive ? 1 : 2) && performance.now() - tScan0 > scanBudgetMs) break;
    }
    while (this.chunkEntryCache.size > CHUNK_ENTRY_CACHE_MAX) this.chunkEntryCache.delete(this.chunkEntryCache.keys().next().value!);
    if (this.farTreeChunks.size > FAR_TREE_CHUNKS_MAX) { this.farChunkEpoch++; this.farTreeEpoch++; while (this.farTreeChunks.size > FAR_TREE_CHUNKS_MAX) this.farTreeChunks.delete(this.farTreeChunks.keys().next().value!); }
    if (this.farMountainChunks.size > FAR_MTN_CHUNKS_MAX) { this.farChunkEpoch++; this.farMtnEpoch++; while (this.farMountainChunks.size > FAR_MTN_CHUNKS_MAX) this.farMountainChunks.delete(this.farMountainChunks.keys().next().value!); }
    this.dlScanPending = pending;
    this.dlCache.finish(dkey, this.dlScanPending);
    if (!this.dlScanPending) {
      this.dlShownChunks = this.dlBuildChunks;
      this.dlShownChunkKey = this.dlBuildChunkKey;
      this.dlShownBox = { cx0: cx0 - 1, cy0: cy0 - 1, cx1: cx1 + 1, cy1: cy1 + 2, stateKey: dlStateKey };
      this.dlBuildChunks = [];
      this.dlBuildChunkKey = '';
    }
    const activeChunks = this.dlCache.key !== '' ? this.dlShownChunks : this.dlBuildChunks;
    const shown = this.dlCache.display();
    void shown;
    const emitBuild = { list, reflect, prefetch, counts: [0, 0, 0] as [number, number, number] };
    for (const entry of activeChunks) {
      this.emitChunkEntry(entry, dlLeft, dlRight, dlTop, dlBottom, 256, this.Z, emitBuild, patchCtx);
    }
    if (useMacroTrees) {
      emitBuild.counts[0] += this.emitMacroTreePatches(
        T, season as Season, z, camX, camY, dlLeft, dlTop, dlRight, dlBottom,
        patchBudget, patchTpl, null, list,
      );
    }
    this.dlPending = this.dlScanPending || patchBudget.pending;
    [nTrees, nM, nD] = emitBuild.counts;
    this.stats.trees = nTrees; this.stats.mtns = nM; this.stats.decos = nD;
    (this.stats as any).keepRatio = keepRatio;
    (this.stats as any).dlPending = this.dlPending ? 1 : 0;
    prof.add('R·收集山树', _p); _p = prof.t();
    }
    }

    // 倒影（贴在水面上）
    this.frameBudget.syncElapsed();
    if (reflect.length && reflectOn && this.lowered < 4 && this.frameBudget.allow(RenderPriority.DECO, 0.7)) this.drawReflections(reflect, t);
    prof.add('R·倒影', _p); _p = prof.t();

    // ---------- 4. 地点 ----------
    const visibleLocs: LocDef[] = [];
    const barriers: { L: LocLayout; x: number; y: number; alpha: number; sect: boolean }[] = [];
    const detailWeight = locationDetailWeight(z);
    // 轮廓在 detailWeight < 0.85 时保持实底避免城池半透透底，并在 0.85..1.0 平滑退场；极远景同样推进 refine
    const outlineAlpha = detailWeight < 0.999 ? (detailWeight < 0.85 ? 1 : (1 - detailWeight) / 0.15) : 0;
    const dotSpr = getDotSprite();
    const locPad = z < 0.12 ? 1200 : 3500;
    const locStart = performance.now();
    let layoutBuilds = 0, outlineBuilds = 0, outlineNearest = Infinity;
    let outlinePreferred: LocLayout | null = null;
    for (const l of this.locsInView(left - locPad, top - locPad, right + locPad, bottom + locPad)) {
      const x = l.x * WORLD_SCALE, y = l.y * WORLD_SCALE;
      if (this.farSummary) {
        if (x < left - locPad || x > right + locPad || y < top - locPad || y > bottom + locPad) continue;
        const explored = game.isExplored(x, y);
        if (!explored && !l.major) continue;
        // 未探索的大地点沿用公开的地点符号，不暴露内部建筑布局。
        if (!explored) {
          const colHex = LOC_SEAL_COLOR[l.type] ?? '#765f47';
          const r = (l.major ? 3 : 1.8) / z;
          if (glFarBatch) {
            const cr = parseInt(colHex.slice(1, 3), 16) / 255 || 0.46;
            const cg = parseInt(colHex.slice(3, 5), 16) / 255 || 0.37;
            const cb = parseInt(colHex.slice(5, 7), 16) / 255 || 0.28;
            if (this.pushAtlasSpr(glFarBatch, dotSpr, x, y, r * 0.5, r * 0.5, false, 1, 'LOC:SEAL', cr, cg, cb)) continue;
          }
          ctx.fillStyle = colHex;
          ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
          continue;
        }
      }
      // 远景（z<=0.10）高速飞行时，每帧节流同步 getLayout 构建数，防止几十座新城镇同帧触发长卡顿
      if (!this.farSummary && detailWeight <= 0.001 && !this.layouts.has(l.id)) {
        if (x < left - 900 || x > right + 900 || y < top - 900 || y > bottom + 900) continue;
        if (layoutBuilds >= 2 || performance.now() - locStart >= 3.0) {
          const colHex = LOC_SEAL_COLOR[l.type] ?? '#765f47';
          const r = (l.major ? 4 : 2.5) / z;
          if (glFarBatch) {
            const cr = parseInt(colHex.slice(1, 3), 16) / 255 || 0.46;
            const cg = parseInt(colHex.slice(3, 5), 16) / 255 || 0.37;
            const cb = parseInt(colHex.slice(5, 7), 16) / 255 || 0.28;
            if (this.pushAtlasSpr(glFarBatch, dotSpr, x, y, r * 0.5, r * 0.5, false, 0.75, 'LOC:SEAL', cr, cg, cb)) continue;
          }
          ctx.fillStyle = colHex;
          ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
          continue;
        }
        layoutBuilds++;
      }
      const L = this.layout(l);
      const hw = L.gw * LOC_SCALE * 0.6, hh = L.gh * LOC_SCALE * 0.6;
      if (x + hw < left - 200 || x - hw > right + 200 || y + hh < top - 200 || y - hh - 600 > bottom) continue;
      if (!this.farSummary) visibleLocs.push(l);
      // 宗门 2D 视差远山云岚背景层（预烘焙单张贴图 + 相机视差，零额外算力开销）
      if (!this.farSummary && l.type === 'sect' && detailWeight > 0.001) {
        LODFadeLocation(ctx, detailWeight, () => drawSectParallaxBack(ctx, L, x, y, camX, camY));
        this.sceneGroundRects.push({
          left: x - L.gw * LOC_SCALE * 0.55,
          top: y - L.gh * LOC_SCALE * 0.55,
          right: x + L.gw * LOC_SCALE * 0.55,
          bottom: y + L.gh * LOC_SCALE * 0.55,
        });
      }
      // Ground must precede the house silhouettes: otherwise its partial opacity washes
      // out the fallback as the detailed layer fades in.
      if (!this.farSummary && detailWeight > 0.001) {
        const _g = prof.t();
        const groundAlpha = detailWeight >= 0.85 ? 1 : detailWeight;
        LODFadeLocation(ctx, groundAlpha, () => {
          if (L.v2) this.drawLocGround2(L, x, y, t, left, top, right, bottom);
          else this.drawLocGround(L, x, y, z);
        });
        prof.add(L.v2 ? 'R·城镇铺装' : 'R·旧式地点地面', _g);
      }
      if (outlineAlpha > 0.004) {
        let outline = this.locationOutlines.get(L,season);
        // 远景按 3.5ms 时间片构建多座城镇轮廓（避免其余城镇落回逐构件 Canvas2D 临时轮廓）；中近景或缩放期保持单座同步上限
        const maxOutlineBuilds = (detailWeight <= 0.001 && !sprites.zoomActive) ? 3 : 1;
        if (!outline && outlineBuilds < maxOutlineBuilds && (outlineBuilds === 0 || performance.now() - locStart < 3.5)) {
          outline = this.locationOutlines.build(L,season);
          outlineBuilds++;
        }
        if (outline && this.locationOutlines.isPending(L)) {
          const distance = Math.hypot(x - game.player.x, y - game.player.y);
          if (distance < outlineNearest) { outlineNearest = distance; outlinePreferred = L; }
        }
        const drawOutline2D = () => {
          ctx.save(); ctx.globalAlpha *= outlineAlpha;
          if (outline) {
            const ox=x-outline.ax*LOC_SCALE, oy=y-outline.ay*LOC_SCALE, ow=outline.w*LOC_SCALE, oh=outline.h*LOC_SCALE;
            const blend=this.locationOutlines.blend(outline), alpha=ctx.globalAlpha;
            if (blend < 1) { ctx.globalAlpha=alpha*(1-blend); ctx.drawImage(outline.canvas,ox,oy,ow,oh); }
            if (outline.refined && blend > 0) { ctx.globalAlpha=alpha*blend; ctx.drawImage(outline.refined,ox,oy,ow,oh); }
          } else drawLocationOutlineFallback(ctx, L, x, y, season);
          ctx.restore();
        };
        if (detailWeight <= 0.001) {
          if (outline) {
            // 纯轮廓远景城池进 Y 排序表的 .gl 合批通道（与林/山合入 worldUnder，避免逐城打断合批）
            const o = outline;
            list.push({
              y: y - L.gh * LOC_SCALE * 0.4,
              k: 'D·城廓',
              draw: drawOutline2D,
              gl: (b) => {
                const blend = this.locationOutlines.blend(o);
                if (blend < 1) {
                  const k = LOC_SCALE;
                  const spr = { canvas: o.canvas, w: o.w, h: o.h, ax: o.ax, ay: o.ay };
                  if (!this.pushWorldSpr(b, spr, x, y, k, k, false, outlineAlpha * (1 - blend), 0, `LOCO:${L.id}:${season}:0`, 1, 1, 1, false, true)) return false;
                }
                if (o.refined && blend > 0) {
                  const k = LOC_SCALE;
                  const spr = { canvas: o.refined, w: o.w, h: o.h, ax: o.ax, ay: o.ay };
                  if (!this.pushWorldSpr(b, spr, x, y, k, k, false, outlineAlpha * blend, 0, `LOCO:${L.id}:${season}:1`, 1, 1, 1, false, true)) return false;
                }
                return true;
              },
            });
          } else {
            // 远景单帧超出时间片时用轻量基底色块占位，避免 256 件 fallback 同步重绘打爆 Canvas2D
            const fw = L.gw * LOC_SCALE, fh = L.gh * LOC_SCALE;
            if (glFarBatch) {
              this.pushAtlasSpr(glFarBatch, dotSpr, x, y, fw * 0.16, fh * 0.16, false, outlineAlpha * 0.6, 'LOC:SEAL', 0.65, 0.58, 0.48);
            } else {
              ctx.save(); ctx.globalAlpha *= outlineAlpha * 0.6; ctx.fillStyle = L.pal.ground; ctx.fillRect(x - fw * 0.45, y - fh * 0.45, fw * 0.9, fh * 0.9); ctx.restore();
            }
          }
        } else {
          drawOutline2D();
          this.sceneGroundRects.push({
            left: x - L.gw * LOC_SCALE * 0.5,
            top: y - L.gh * LOC_SCALE * 0.5,
            right: x + L.gw * LOC_SCALE * 0.5,
            bottom: y + L.gh * LOC_SCALE * 0.5,
          });
        }
      }
      if (this.farSummary || detailWeight <= 0.001) continue;
      const locationListStart = list.length;
      const res = resBucket(z * dpr * LOC_SCALE, 1.4);
      L.pieces.forEach((pc, i) => {
        if (pc.kind === 'tree') return; // 全局统一只保留野外树木，不再绘制城镇/地点景观树
        const px = x + pc.x * LOC_SCALE, py = y + pc.y * LOC_SCALE;
        // 第二十二步：贴图建筑 / 墙段直接绘制（不另存位图）
        if (pc.kind === 'B') {
          const w = pc.p.w, h = pc.p.h;
          if (px + w / 2 < left - 100 || px - w / 2 > right + 100 || py < top - 120 || py - h - 60 > bottom) return;
          list.push({ y: py, k: 'D·建筑', draw: () => this.drawBldPiece(pc, px, py, t, L) });
          return;
        }
        if (pc.kind === 'W') {
          const len = pc.p.len;
          if (px + len / 2 < left - 100 || px - len / 2 > right + 100 || py < top - 80 || py - pc.p.hh - 40 > bottom) return;
          list.push({ y: py, k: 'D·城墙', draw: () => { const a = this.xray(pc, px - len / 2, px + len / 2, py, pc.p.hh); drawWallRun(ctx, pc.p.k, px - len / 2, px + len / 2, py, pc.p.hh, t, a); } });
          return;
        }
        if (pc.kind === 'WV') {
          if (px + 80 < left || px - 80 > right || py + 40 < top || py - pc.p.len - pc.p.h - 60 > bottom) return;
          list.push({ y: py, k: 'D·城墙', draw: () => this.drawWallV(pc, px, py) });
          return;
        }
        const zs = pc.p.z ?? 1;
        const pres = zs !== 1 ? resBucket(z * dpr * LOC_SCALE * zs, 1.4) : res;
        if (px < left - 600 || px > right + 600 || py < top - 50 || py - 900 > bottom) return;
        // 城镇小件（摊位/灯/井/石/旗…）远景只剩一两像素：整件精灵不画了，改画 2px 的点（支持 GL 实例化）。
        const pieceVisH = locationPieceVisualHeight(pc);
        const piecePx = pieceVisH * LOC_SCALE * z;
        const tinyMode = locationTinyPieceMode(pc, piecePx);
        if (tinyMode === 'outline') {
          list.push({ y: py, k: 'D·建筑轮廓', draw: () => drawLocationPieceFallback(ctx, pc, L, px, py, season) });
          return;
        }
        if (tinyMode === 'dot') {
          const dotR = Math.max(1.2, 1.8 / this.Z);
          const dotY = py - 4 * this.Z * 4;
          list.push({
            y: py, k: 'D·城中小件',
            draw: () => {
              ctx.fillStyle = 'rgba(58,50,42,0.55)';
              ctx.beginPath(); ctx.arc(px, dotY, dotR, 0, Math.PI * 2); ctx.fill();
            },
            gl: (b) => this.pushAtlasSpr(b, dotSpr, px, dotY, dotR * 0.25, dotR * 0.25, false, 0.55 * detailWeight, 'LOC:DOT', 0.23, 0.20, 0.16),
          });
          return;
        }
        const key = `P:${l.id}:${i}`;
        list.push({ y: py, k: 'D·城中小件', occ: { get: () => null, x: px, y: py, footY: py, mode: 'rect', box: [px - (pc.p.w ?? 90) * LOC_SCALE * 0.45, py - Math.max(pieceVisH, pc.p.h ?? 120) * LOC_SCALE * 0.9, px + (pc.p.w ?? 90) * LOC_SCALE * 0.45, py], k: 0.5, ent: pc }, draw: () => {
          // 命中必须经过缓存以刷新 LRU；不能持有被淘汰、已释放的旧画布。
          // 分辨率回退不记作精确命中，后台完成后可自然升级到目标分辨率。
          const s = sprites.peek(key, pres) ?? sprites.get(key, pres, (r) => renderPiece(pc, L.pal, r, season) as Spr);
          if (drawMissingLocationPiece(ctx, pc, L, px, py, s, season)) return;
          if (!s) return;
          const structural = locationTinyPieceMode(pc, 0) === 'outline';
          const detail = structural ? locationStructureDetail(piecePx) : 1;
          if (detail < 1) {
            ctx.save(); ctx.globalAlpha *= 1 - detail; drawLocationPieceFallback(ctx, pc, L, px, py, season); ctx.restore();
          }
          if (detail <= 0) return;
          ctx.save(); ctx.globalAlpha *= detail;
          const k = LOC_SCALE * zs;
          ctx.drawImage(s.canvas, px - s.ax * k, py - s.ay * k, s.w * k, s.h * k);
          ctx.restore();
        } });
      });
      // 旗帜、炊烟
      for (const f of L.flags) { const fx = x + f.x * LOC_SCALE, fy = y + f.y * LOC_SCALE; list.push({ y: fy + 1, k: 'D·旗帜', draw: () => this.drawFlag(fx, fy, f.color, t) }); }
      if (L.barrier) barriers.push({ L, x, y, alpha: detailWeight, sect: l.type === 'sect' });
      if (detailWeight < 0.999) for (let j = locationListStart; j < list.length; j++) {
        const d = list[j], draw = d.draw;
        d.draw = (gc) => LODFadeLocation(gc, detailWeight, () => draw(gc));
      }
    }

    if (outlineAlpha > 0.004 && !this.farSummary && this.zoomStableN >= 8) this.locationOutlines.step(outlinePreferred, 1.5);
    prof.add('R·地点(含城镇地面)', _p); _p = prof.t();
    // ---------- 5. 采集点（仅神识内可见）----------
    const p = game.player;
    this.modsT -= dt;
    if (this.modsT <= 0) { this.modsT = 1; this.senseMods = senseMods({ ...game.hero, treasures: [...((game.hero as any).treasures ?? []), ...game.hero.bag.map((b) => b.id.replace(/^(art|mat)_/, '')), ...game.hero.arts.map((a) => a.id)] } as any); this.sense.warm(game.hero.realm, this.senseMods); }
    this.sense.hidden += ((game.concealed ? 1 : 0) - this.sense.hidden) * Math.min(1, dt * 3);
    this.sense.update(dt, game.awarenessRadius, game.detailSenseRadius);
    const R = game.detailSenseRadius;
    game.life.sense.x = p.x; game.life.sense.y = p.y; game.life.sense.R = game.revealAll && game.debugSeeAll ? 1e9 : R;
    const gatherRen = GROUND && this.stage?.worldAtlas ? {
      pushAtlasSpr: (b: WorldSpriteBatch, spr: { canvas: HTMLCanvasElement; w: number; h: number; ax: number; ay: number }, wx: number, wy: number, sx: number, sy: number, flip: boolean, alpha: number, keyOverride?: string, r?: number, g?: number, bCol?: number) =>
        this.pushAtlasSpr(b, spr, wx, wy, sx, sy, flip, alpha, keyOverride, r, g, bCol),
    } : undefined;
    collectGatherVisuals(list,game.nodes,{x:p.x,y:p.y,radius:R,day:game.day,
      view:{left,top,right,bottom},time:t,zoom:z,deviceScale:this.Z,target:game.gatherTarget??null,showBeam:n=>guidanceInfoVisible(game,'灵物','node',n),ren:gatherRen});
    prof.add('R·神识采集点', _p); _p = prof.t();

    // ---------- 6. 生灵（地面）+ 玩家 ----------
    const view = { left, top, right, bottom };
    ctx.save();
    game.life.drawShadows(ctx, t);
    game.sectwar?.drawFormationGround(ctx, view, t, z);
    ctx.restore();
    prof.add('R·生灵影子', _p); _p = prof.t();
    let _n = list.length;
    const tag = (k: string) => { for (let i = _n; i < list.length; i++) if (!list[i].k) list[i].k = k; _n = list.length; };
    tag('D·其他');
    game.life.collectGround(list, view, t, dt, this, z, dpr); tag('D·生灵(人兽)');
    collectCombat(game.combat, list, view, t, dt, !!(GROUND && this.stage?.worldAtlas)); tag('D·战斗单位');
    game.npcs.collect(list, view, t, dt); tag('D·NPC');
    game.events.collect(list, view, t, dt); game.story.collect(list, view, t, dt); tag('D·事件剧情');
    game.landmarks.collect(list, view, t); tag('D·名地');
    game.sites.collect(list, view, t, dt); game.home.collect(list, view, t); game.happen.collect(list, view, t, dt); game.daoxin.collect(list, view, t, dt); game.pianju.collect(list, view, t); game.pets.collect(list); game.heartx.collect(list); tag('D·遗府奇遇');
    game.yuanying.collect(list); game.shen?.collect(list); game.zhenfa.collect(list, view, t); game.mijing.collectWorld(list, view, t); game.sectwar?.collectWorld(list, view, t, z, this, this.farSummary); tag('D·元婴阵法秘境');
    list.push({
      y: p.flying && !game.yuanying.active ? p.y + 200000 : p.y,
      k: 'D·主角',
      gl: p.flying && !game.yuanying.active && !hasBeastSprite('p:hero')
        ? (b, occA) => this.pushFlyingPlayerGl(b, dt, occA)
        : undefined,
      draw: () => this.drawPlayer(dt),
    });   // 御器飞行：在山树之上
    if (modx) { modx.collect(list); tag('D·模组'); }   // v0.56：模组的绘制
    prof.add('R·收集单位', _p); _p = prof.t();

    // 【已删除】原来这里有一层「植被密度色斑」：把细到不足 1 像素的树按 chunk 用绿色径向渐变盖住。
    // 它铺在地面之后，会把**河流 / 道路 / 城墙**这些主线一起糊掉；而且哪些块被盖随缩放变化，
    // 于是出现"某些缩放挡下河流线直接消失"。树本身在远景已经淡到看不见，不需要这层色块。

    this.sortByY(list);
    prof.add('R·排序', _p);
    // 分层：Canvas2D 前后两端的静态精灵批提交给 GPU 实例化绘制，中间混合段中的战阵/单位仍尽量走 GPU 实例化
    const glStage = GROUND && this.stage?.worldAtlas ? this.stage : null;
    if (glStage && list.length) {
      let firstC2D = -1, lastC2D = -1;
      for (let i = 0; i < list.length; i++) {
        if (!list[i].gl) { if (firstC2D < 0) firstC2D = i; lastC2D = i; }
      }
      const underEnd = firstC2D < 0 ? list.length : firstC2D;
      let splitUnder = 0;
      for (; splitUnder < underEnd; splitUnder++) {
        const d = list[splitUnder];
        // 若地面已画进 sceneTex（如农田/城镇铺装/名地贴花），不能放进 worldUnder，否则会被 sceneTex 地面盖住
        if (this.overlapsSceneGround(d)) break;
        const q = prof.on ? performance.now() : 0;
        const occA = d.occ ? this.occAlpha(d.occ) : 1;
        const ok = d.gl!(glStage.worldUnder, occA);
        if (prof.on && ok) prof.add(d.k ?? 'D·其他', q);
        if (!ok) break;
      }
      const canOver = firstC2D >= 0 && !game.tianxiang.active && barriers.length === 0
        && !(game.weather && game.weather.kind !== 'clear' && game.weather.k > 0.04);
      let splitOver = list.length;
      if (canOver && lastC2D + 1 < list.length) {
        const overStart = lastC2D + 1;
        const savedN = glStage.worldOver.n;
        const savedSegs = glStage.worldOver.segs.length;
        const savedLastCnt = savedSegs > 0 ? glStage.worldOver.segs[savedSegs - 1].count : 0;
        let allOk = true;
        for (let i = overStart; i < list.length; i++) {
          const d = list[i];
          const q = prof.on ? performance.now() : 0;
          const occA = d.occ ? this.occAlpha(d.occ) : 1;
          if (!d.gl!(glStage.worldOver, occA)) { allOk = false; break; }
          if (prof.on) prof.add(d.k ?? 'D·其他', q);
        }
        if (allOk) {
          splitOver = overStart;
        } else {
          // 遇到必须回退 Canvas2D 的物件（如带动画瀑布的山）：整段退回 Canvas2D 保证精确 Y 序
          glStage.worldOver.n = savedN;
          glStage.worldOver.segs.length = savedSegs;
          if (savedSegs > 0) glStage.worldOver.segs[savedSegs - 1].count = savedLastCnt;
        }
      }
      for (let i = splitUnder; i < splitOver; i++) {
        const d = list[i];
        const q = prof.on ? performance.now() : 0;
        const occA = d.occ ? this.occAlpha(d.occ) : 1;
        const dk = d.k ?? '';
        // 战场方阵/单位/后方设施若被零星 Canvas2D 物件（如大营/瀑布/云岚）夹在中间，依然直接路由到 worldOver / worldUnder 实例化合批，避免上千士兵退回 Canvas2D
        if (d.gl && !this.overlapsSceneGround(d) && (
          dk === 'D·战阵兵' || dk === 'D·战阵旗' || dk === 'D·前线哨兵' ||
          dk === 'D·营地弟子' || dk === 'D·战斗单位' ||
          (dk === 'D·主角' && canOver && p.flying) ||
          (detailWeight <= 0.001 && !game.tianxiang.active && barriers.length === 0 && (
            dk === 'D·树' || dk === 'D·树片' || dk === 'D·地面小景' || dk === 'D·山' || dk === 'D·山腰云' || dk === 'D·城廓'
          ))
        )) {
          const targetBatch = dk === 'D·主角' || (canOver && (p.flying || d.y >= p.y) && dk !== 'D·树' && dk !== 'D·树片' && dk !== 'D·地面小景' && dk !== 'D·山' && dk !== 'D·山腰云' && dk !== 'D·城廓') ? glStage.worldOver : glStage.worldUnder;
          if (d.gl(targetBatch, occA)) {
            if (prof.on) prof.add(dk || 'D·其他', q);
            continue;
          }
        }
        this._occA = occA;
        d.draw(ctx);
        this._occA = 1;
        if (prof.on) {
          const dtms = performance.now() - q;
          prof.add(d.k ?? 'D·其他', q);
          if (dtms > 2) prof.add('·慢:' + (d.k ?? '其他'), q);
        }
      }
    } else if (prof.on) {
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

    // 炊烟（极简档不画：纯氛围，一帧十几团渐变）
    this.frameBudget.syncElapsed();
    if (this.lowered < 4 && detailWeight > 0.001 && this.frameBudget.allow(RenderPriority.DECO, 0.25)) for (const l of visibleLocs) { const L = this.layout(l); for (const s of L.smoke) if (Math.hypot(l.x * WORLD_SCALE + s.x * LOC_SCALE - p.x, l.y * WORLD_SCALE + s.y * LOC_SCALE - p.y) < R) LODFadeLocation(ctx, detailWeight, () => this.drawSmoke(l.x * WORLD_SCALE + s.x * LOC_SCALE, l.y * WORLD_SCALE + s.y * LOC_SCALE, t, hash2(s.x, s.y, 3))); }

    // ---------- 7. 护山大阵 + 宗门前景掠云视差 ----------
    if (this.lowered < 4) for (const b of barriers) LODFadeLocation(ctx, b.alpha, () => {
      if (b.sect) drawSectParallaxFore(ctx, b.L, b.x, b.y, camX, camY, t);
      this.drawBarrier(b.L, b.x, b.y, t);
    });

    // 预取视野外的山（有剩余预算时）
    this.frameBudget.syncElapsed();
    if (this.zoomStableN >= 12 && sprites.canBuild() && this.frameBudget.allow(RenderPriority.DECO, 0.4)) {
      prefetch.sort((a, b) => Math.hypot(a.x - camX, a.y - camY) - Math.hypot(b.x - camX, b.y - camY));
      for (const d of prefetch.slice(0, 3)) { if (!sprites.canBuild()) break; this.mtnSprite(d, z); }
    }

    prof.add('R·名地雾/人影/炊烟/大阵', _p); _p = prof.t();
    // ---------- 8. 天空：飞鸟、仙鹤、御剑修士；粒子；目的地 ----------
    game.life.drawSky(ctx, t, z, dpr);
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
    this.frameBudget.syncElapsed();
    if (this.frameBudget.allow(RenderPriority.DECO, 0.2)) this.drawSeasonFx(dt, season, p.x, p.y, R);

    prof.add('R·粒子四季飘物', _p); _p = prof.t();
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
      F.update(dt);
      if (!(game.revealAll && game.debugSeeAll)) {
        const senseTier = Math.max(0, Math.min(TIERS.length - 1, game.hero.realm));
        this.sense.drawGL(F, this.stage!, p.x, p.y, senseTier, this.senseMods, game.time, z);
        this.sense.drawInnerGL(F, this.stage!, p.x, p.y, senseTier, game.time, z);
      }
      if (night > 0.05) {
        for (const l of visibleLocs) {
          const L = this.layout(l), lx = l.x * WORLD_SCALE, ly = l.y * WORLD_SCALE;
          L.lights.forEach((li, i) => {
            const vis = clamp((R - Math.hypot(lx + li.x * LOC_SCALE - p.x, ly + li.y * LOC_SCALE - p.y)) / 120, 0, 1);
            if (vis <= 0) return;
            const fl = 0.96 + 0.04 * Math.sin(t * 1.6 + i * 1.7);
            const rr = li.r * LOC_SCALE * 2.4 * fl;
            B.quad(0, lx + li.x * LOC_SCALE, ly + li.y * LOC_SCALE, rr * 2, rr * 1.6, 0, 1, 0.72, 0.4, night * 0.6 * vis, 1);
            B.quad(1, lx + li.x * LOC_SCALE, ly + li.y * LOC_SCALE, rr * 0.35, rr * 0.3, 0, 1, 0.85, 0.6, night * 0.8 * vis, 1);
          });
        }
        B.quad(0, p.x, p.y - 50, 320, 240, 0, 1, 0.8, 0.55, night * 0.22, 1);
        game.life.collectGlow(night, (x, y, r, a) => { B.quad(0, x, y, r * 2.6, r * 2.6, 0, 0.85, 1, 0.55, a, 1); B.quad(26, x, y, r * 0.5, r * 0.5, 0, 1, 1, 0.8, a, 1); });
      }
      prof.add('R·GL神识灯火', _p); _p = prof.t();
      if (!game.hero.dead) drawRealmFootGL(F, this.stage!, p.x, p.y - (p.st?.lift ?? 0) + 3, game.hero.realm, t, dt, { concealed: game.concealed, burst: game.senseBurstT > 0, sitting: p.sitting, flying: p.flying });
      drawCombatGL(F, game.combat, t, dt);
      game.story.drawGL(F, t);
      F.drawRings(dt);
      F.drawParticles();
      F.flushBake(this.stage!.atlas);
      prof.add('R·GL特效批次', _p); _p = prof.t();
    } else {
      game.combat.fxq.length = 0;
    }
    if (!GL && night > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const l of visibleLocs) {
        const L = this.layout(l), lx = l.x * WORLD_SCALE, ly = l.y * WORLD_SCALE;
        L.lights.forEach((li, i) => {
          const vis = clamp((R - Math.hypot(lx + li.x * LOC_SCALE - p.x, ly + li.y * LOC_SCALE - p.y)) / 120, 0, 1);
          if (vis <= 0) return;
          const fl = 0.96 + 0.04 * Math.sin(t * 1.6 + i * 1.7);
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
    const uiDpr = GL ? this.uiDpr : dpr;
    if (GL) {
      this.ctx = ui; this.dpr = this.uiDpr;
      this.Z = z * this.uiDpr; this.ox = W * this.uiDpr / 2 - camX * this.Z; this.oy = H * this.uiDpr / 2 - camY * this.Z;
      this.world();
    }
    // 2D 程序化法术贴图仅在非 WebGL（或粒子渲染器不可用）兜底时绘制；WebGL 端已由 drawCombatGL 完整承担
    if (!GL || !this.fx) drawCombatSprites(this.ctx, game.combat, t);
    // 百人战阵护罩与中军铭牌（置于全军上方，不打断 WebGL 精灵合批；远景自动切换兵棋旗牌）
    game.sectwar?.drawFormationOverlays(this.ctx, view, t, z);
    // 血条与伤害数字
    drawCombatUI(this.ctx, game.combat, t, z);
    if (game.tianxiang.active) { game.tianxiang.drawScreen(this.ctx, W, H, uiDpr, GL, camX, camY, z); this.world(); }
    // 极远缩略模式（farSummary，卫星沙盘视角）下再叠加简洁大营徽记；常规缩放始终保留实景连营与人员 LOD，不切走营帐也不在场景内画虚线
    if (this.farSummary) { this.world(); game.sectwar?.collectFarWorld?.(this.ctx, view, z); }

    prof.add('R·特效关键图血条', _p); _p = prof.t();
    // ---------- 11. 名牌（远近景严格沿用同一套宣纸圆角印章名牌样式、分宗样式与山门下方锚点） ----------
    if (this.farSummary || z < 0.22) {
      const cands: { l: LocDef; explored: boolean; isBranch: boolean; priority: number; sx: number; sy: number }[] = [];
      for (const l of LOCATIONS) {
        const x = l.x * WORLD_SCALE, y = l.y * WORLD_SCALE;
        if (x < left - 300 || x > right + 300 || y < top - 300 || y > bottom + 300) continue;
        const explored = game.isExplored(x, y);
        // 远景保留全部宗门（含非 major 宗门）、所有 major 地点以及已探索的重要城镇
        if (!l.major && l.type !== 'sect' && !(explored && (l.type === 'city' || l.type === 'town'))) continue;
        const L = this.layout(l);
        const anchorOff = Math.max(6, L.gh * LOC_SCALE * 0.36 * z);
        const sx = W / 2 + (x - camX) * z, sy = H / 2 + (y - camY) * z + anchorOff;
        if (sx < -160 || sx > W + 160 || sy < -80 || sy > H + 80) continue;
        const isBranch = l.type === 'sect' && !!game.sectwar?.isBranch?.(l.id);
        const kind = locToSymbolKind(l.type);
        const priority = l.type === 'sect'
          ? (l.major ? (explored ? 0 : 1) : (explored ? 1 : 2))
          : kind === 'city'
            ? (explored ? 1 : 2)
            : (explored ? 3 : 4);
        cands.push({ l, explored, isBranch, priority, sx, sy });
      }
      cands.sort((a, b) => a.priority - b.priority || (a.explored === b.explored ? 0 : a.explored ? -1 : 1) || a.l.id.localeCompare(b.l.id));
      const farCap = Math.min(SYMBOL_MAX, z < 0.05 ? 48 : z < 0.12 ? 64 : 80);
      const fs = z < 0.06 ? 12 : 14, padPx = z < 0.06 ? 4 : 8;
      const boxes = this.farBox; boxes.length = 0;
      const u = this.ctx;
      let drew = 0;
      for (const item of cands) {
        if (drew >= farCap) break;
        const spr = this.cacheSprite(
          `L|${item.l.id}|${item.explored ? 1 : 0}|${item.isBranch ? 1 : 0}|${fs}|${uiDpr}`,
          () => this.makeLabel(item.l, item.explored, fs, uiDpr, item.isBranch),
          item.l.name,
        );
        const w = spr.width / uiDpr, h = spr.height / uiDpr;
        const sx = Math.round(item.sx * uiDpr) / uiDpr, sy = Math.round(item.sy * uiDpr) / uiDpr;
        const x0 = sx - w * 0.5, y0 = sy, x1 = x0 + w, y1 = y0 + h;
        let hit = false;
        for (let i = 0; i < boxes.length; i++) {
          const b = boxes[i];
          if (x0 < b.x1 + padPx && x1 + padPx > b.x0 && y0 < b.y1 + padPx && y1 + padPx > b.y0) { hit = true; break; }
        }
        if (hit) continue;
        boxes.push({ x0, y0, x1, y1 });
        if (drew === 0) u.setTransform(uiDpr, 0, 0, uiDpr, 0, 0);
        u.globalAlpha = item.explored ? 1 : 0.72;
        u.drawImage(spr, x0, y0, w, h);
        drew++;
      }
      if (drew > 0) { u.globalAlpha = 1; this.world(); }
    } else {
      for (const l of visibleLocs) {
        const x = l.x * WORLD_SCALE, y = l.y * WORLD_SCALE;
        const explored = game.isExplored(x, y);
        if (!explored && !l.major && l.type !== 'sect') continue;
        const L = this.layout(l);
        this.drawLabel(l, x, y + L.gh * LOC_SCALE * 0.36, explored);
      }
      // 大地点与宗门（缩小时，距离远的也显示名牌）
      if (z < 0.6) for (const l of LOCATIONS) {
        if ((!l.major && l.type !== 'sect') || visibleLocs.includes(l)) continue;
        const x = l.x * WORLD_SCALE, y = l.y * WORLD_SCALE;
        if (x < left || x > right || y < top || y > bottom) continue;
        const L = this.layout(l);
        this.drawLabel(l, x, y + L.gh * LOC_SCALE * 0.36, game.isExplored(x, y));
      }
    }

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
          u.setTransform(uiDpr, 0, 0, uiDpr, 0, 0);
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
    sceneCtx.setTransform(sceneDpr, 0, 0, sceneDpr, 0, 0);
    this.lastUpCam.x = camX; this.lastUpCam.y = camY;
    game.weather.noFills = GL;
    game.weather.draw(sceneCtx, W, H, dt, clamp(cdx, -800, 800), clamp(cdy, -800, 800));
    prof.add('R·雨雪', _p); _p = prof.t();
    // v0.48 空气层：远山长卷 / 天空意象 / 雨幕 / 雁阵 / 留白雾带（经调色）；月与星（不经调色）
    mood.update(dt, game, camX, camY);
    sceneCtx.setTransform(sceneDpr, 0, 0, sceneDpr, 0, 0);
    mood.drawBack(sceneCtx, W, H, game, camX, z, GL, t);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    mood.drawSky(this.ctx, W, H, game, z, camX);
    // GL 模式下纸纹与暗角已由后期着色器一次算完，这里不再重复叠两张全屏图（每帧两次全屏混合）；
    // 非 GL 路径在 out 循环末尾统一调用一次 mood.drawPost。
    prof.add('R·意境空气层', _p); _p = prof.t();
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (z < 0.6) {
      const a = clamp((0.6 - z) / 0.3, 0, 1) * 0.55;
      this.ctx.globalAlpha = a;
      for (const b of BIG_LABELS) {
        const sx = Math.round((W / 2 + (b.at[0] * WORLD_SCALE - camX) * z) * uiDpr) / uiDpr;
        const sy = Math.round((H / 2 + (b.at[1] * WORLD_SCALE - camY) * z) * uiDpr) / uiDpr;
        if (sx < -400 || sx > W + 400 || sy < -200 || sy > H + 200) continue;
        const spr = this.bigLabel(b.name, Math.round(b.size * 16 + 18));
        const w = spr.width / this.dpr, h = spr.height / this.dpr;
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
      this.lastSceneValid = true;
      this.lastSceneTime = t;
      this.lastSceneCam.x = game.cam.x; this.lastSceneCam.y = game.cam.y;
      this.lastSceneZoom = z; this.lastSceneW = W; this.lastSceneH = H;
      this.lastSceneGround = GROUND; this.lastSceneDecoRev = T.decoRevision;
      this.lastSceneLowered = this.lowered; this.lastSceneSeason = season;
      this.lastSceneDay = game.day; this.lastSceneFarSummary = this.farSummary;
      this.lastSceneSeeAll = !!(game.revealAll && game.debugSeeAll);
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

  // ---------------------------------------------------------------- v0.54 秘境
  private renderRealm(dt: number, GL: boolean) {
    const t0 = performance.now();
    const { ctx, game } = this, M = game.mijing;
    const z = game.cam.zoom, W = this.W, H = this.H, dpr = this.dpr, t = game.time, p = game.player;
    this.groundOn = false; this.skipSceneNow = false; this.stillFrames = 0;
    game.life.sense.x = p.x; game.life.sense.y = p.y;
    game.life.sense.R = game.revealAll && game.debugSeeAll ? 1e9 : game.detailSenseRadius;
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
    const list = this.frameList; list.length = 0;
    M.collect(list, view, t);
    collectCombat(game.combat, list, view, t, dt);
    game.npcs.collect(list, view, t, dt);
    game.zhenfa.collect(list, view, t);
    game.yuanying.collect(list); game.shen?.collect(list);
    game.pets.collect(list);
    list.push({ y: p.y, k: 'D·主角', draw: () => this.drawPlayer(dt) });
    modx?.collect(list);
    this.sortByY(list);
    this.drawList(list, ctx);
    this.world();
    this.updateParticles(dt);
    M.drawDark(ctx, view);
    const F = this.fx;
    if (GL && F) {
      const B = this.stage!.batch;
      B.reset(camX, camY, z, W, H, this.stage!.atlas);
      F.update(dt);
      if (!game.hero.dead) drawRealmFootGL(F, this.stage!, p.x, p.y - (p.st?.lift ?? 0) + 3, game.hero.realm, t, dt, { concealed: game.concealed, burst: game.senseBurstT > 0, sitting: p.sitting, flying: p.flying });
      drawCombatGL(F, game.combat, t, dt);
      F.drawRings(dt);
      F.drawParticles();
      F.flushBake(this.stage!.atlas);
    } else game.combat.fxq.length = 0;
    this.world();
    if (!GL) drawCombatFx(ctx, game.combat, t);
    const sceneCtx = this.ctx, sceneZ = this.Z, sceneOx = this.ox, sceneOy = this.oy, sceneDpr = this.dpr;
    if (GL) {
      this.ctx = this.uiCtx; this.dpr = this.uiDpr;
      this.Z = z * this.uiDpr; this.ox = W * this.uiDpr / 2 - camX * this.Z; this.oy = H * this.uiDpr / 2 - camY * this.Z;
      this.world();
      if (!F) drawCombatSprites(this.ctx, game.combat, t);
    }
    drawCombatUI(this.ctx, game.combat, t, z);
    if (GL) {
      this.ctx = sceneCtx; this.Z = sceneZ; this.ox = sceneOx; this.oy = sceneOy; this.dpr = sceneDpr;
      // 云影层在秘境里没有：清空，免得后期把大地图的云影叠上来
      const ac = this.atmoReady ? this.atmo?.getContext('2d') : null; if (ac) { ac.clearRect(0, 0, this.atmo.width, this.atmo.height); this.atmoRevision++; this.atmoReady = false; }
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
  private groundWanted = false; private groundSet = false; groundOn = false;
  /** 一次来源查询的安全上限；单个 GPU 图块仍受 MAX_SEG 约束。 */
  static readonly MAX_GROUND_SOURCE_SEG = 8192;
  private riverIndex: SegmentIndex | null = null; private roadIndex: SegmentIndex | null = null;
  private advanceSegmentIndices(T: Pick<Terrain, 'rivSegW' | 'roadSegW'>) {
    if (!this.riverIndex || this.riverIndex.source !== T.rivSegW) this.riverIndex = new SegmentIndex(T.rivSegW, 820);
    if (!this.roadIndex || this.roadIndex.source !== T.roadSegW) this.roadIndex = new SegmentIndex(T.roadSegW, 200);
    this.riverIndex.step(64, 0.6); this.roadIndex.step(64, 0.6);
  }
  private gZone = new Float32Array(MAX_ZONE * 4);
  private gTown = new Float32Array(MAX_TOWN * 4); private gTownS = new Int32Array(MAX_TOWN * 4);
  private gSegBuf = new Float32Array(MAX_SEG * 4 * 4);
  private gRivOff: number[] = [];
  private gRoadOff: number[] = [];
  private gTownTmp: { lx: number; ly: number; RR: number; hole: number; rx: number; ry: number; d2: number }[] = [];
  private gZoneTmp: [number, number, number, number, number][] = [];
  private getPyrTex(gl: WebGL2RenderingContext, key: string, cv: HTMLCanvasElement): WebGLTexture | null {
    if (this.pyrTexGl !== gl) {
      for (const tex of this.pyrTexCache.values()) this.pyrTexGl?.deleteTexture(tex);
      this.pyrTexCache.clear();
      this.pyrTexGl = gl;
    }
    let tex = this.pyrTexCache.get(key);
    if (tex) {
      this.pyrTexCache.delete(key);
      this.pyrTexCache.set(key, tex);
      return tex;
    }
    tex = gl.createTexture();
    if (!tex) return null;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    } finally {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    }
    this.pyrTexCache.set(key, tex);
    while (this.pyrTexCache.size > 64) {
      const oldest = this.pyrTexCache.keys().next().value!;
      const oldTex = this.pyrTexCache.get(oldest);
      this.pyrTexCache.delete(oldest);
      if (oldTex) gl.deleteTexture(oldTex);
    }
    return tex;
  }
  /** 地表缓存需要重画时才调用：收集缓存范围内（中心 camX,camY，半宽 hw0/hh0）的河段、路段、城镇 */
  private segProvider: SegProvider = (camX, camY, hw0, hh0) => this.groundSegs(camX, camY, hw0, hh0);
  /** 地表缓存分辨率（每 CSS 像素纹素数），随画质自适应 */
  groundScale = 1.25;
  private groundSegs(camX: number, camY: number, hw0: number, hh0: number): GroundSegs {
    const game = this.game, T = game.terrain;
    const hw = hw0 + 60, hh = hh0 + 60;
    const select = (A: Float32Array, pad: number, index: SegmentIndex | null, offsets: number[]) => {
      offsets.length = 0;
      const candidates = index?.source === A ? index.candidates(camX - hw, camY - hh, camX + hw, camY + hh) : null;
      const end = candidates ? candidates.length : Math.floor(A.length / 8);
      let truncated = false;
      for (let i = 0; i < end; i++) {
        const q = candidates ? candidates[i] : i * 8;
        const ax = A[q] - camX, ay = A[q + 1] - camY, bx = A[q + 2] - camX, by = A[q + 3] - camY, m = A[q + 4] + pad;
        if ((ax > bx ? ax : bx) < -hw - m || (ax < bx ? ax : bx) > hw + m || (ay > by ? ay : by) < -hh - m || (ay < by ? ay : by) > hh + m) continue;
        if (offsets.length >= Renderer.MAX_GROUND_SOURCE_SEG) { truncated = true; break; }
        offsets.push(q);
      }
      return { offsets, truncated };
    };
    const riv = select(T.rivSegW, 820, this.riverIndex, this.gRivOff), road = select(T.roadSegW, 200, this.roadIndex, this.gRoadOff);
    const nRiv = riv.offsets.length, nRoad = road.offsets.length, stride = Math.max(MAX_SEG, nRiv, nRoad), ROW = stride * 4;
    const needLen = ROW * 4;
    if (this.gSegBuf.length < needLen) this.gSegBuf = new Float32Array(needLen);
    const seg = this.gSegBuf.subarray(0, needLen);
    seg.fill(0);
    const pack = (A: Float32Array, offsets: number[], row: number) => {
      for (let i = 0; i < offsets.length; i++) {
        const q = offsets[i], o = row * ROW + i * 4;
        seg[o] = A[q] - camX; seg[o+1] = A[q+1] - camY; seg[o+2] = A[q+2] - camX; seg[o+3] = A[q+3] - camY;
        seg[o+ROW] = A[q+4]; seg[o+ROW+1] = A[q+5]; seg[o+ROW+2] = A[q+6];
      }
    };
    pack(T.rivSegW, riv.offsets, 0); pack(T.roadSegW, road.offsets, 2);
    const townList = this.gTownTmp; townList.length = 0;
    for (const l of GROUND_TOWNS) {
      const [hole, RR] = T.fieldR(l);
      const lx = l.x * WORLD_SCALE - camX, ly = l.y * WORLD_SCALE - camY;
      if (Math.abs(lx) > hw + RR + 400 || Math.abs(ly) > hh + RR + 400) continue;
      townList.push({ lx, ly, RR, hole, rx: l.x, ry: l.y, d2: lx * lx + ly * ly });
    }
    townList.sort((a, b) => a.d2 - b.d2);
    const nTown = Math.min(MAX_TOWN, townList.length);
    for (let i = 0; i < nTown; i++) {
      const tw = townList[i], o = i * 4;
      this.gTown[o] = tw.lx; this.gTown[o + 1] = tw.ly; this.gTown[o + 2] = tw.RR; this.gTown[o + 3] = (hash2(tw.rx, tw.ry, 77) - 0.5) * 0.7;
      this.gTownS[o] = (tw.rx * 7) | 0; this.gTownS[o + 1] = (tw.ry * 13) | 0; this.gTownS[o + 2] = tw.hole | 0;
    }
    // 第三十步：魔道宗门 / 凶地周边的地域底色（取离缓存中心最近的若干个）
    const zs = this.gZoneTmp; zs.length = 0;
    for (const z of groundZones()) {
      const lx = z.x - camX, ly = z.y - camY;
      if (Math.abs(lx) > hw + z.r * 1.4 || Math.abs(ly) > hh + z.r * 1.4) continue;
      zs.push([lx, ly, z.r, z.t, lx * lx + ly * ly]);
    }
    zs.sort((a, b) => a[4] - b[4]);
    const nZone = Math.min(MAX_ZONE, zs.length);
    for (let i = 0; i < nZone; i++) { const o = i * 4; this.gZone[o] = zs[i][0]; this.gZone[o + 1] = zs[i][1]; this.gZone[o + 2] = zs[i][2]; this.gZone[o + 3] = zs[i][3]; }
    return { seg, stride, sourceTruncated: riv.truncated || road.truncated, nRiv, nRoad, town: this.gTown.subarray(0, nTown * 4), townS: this.gTownS.subarray(0, nTown * 4), nTown, zone: this.gZone.subarray(0, nZone * 4), nZone };
  }
  private groundView(camX: number, camY: number, z: number, W: number, H: number): GroundView {
    // 地表完全跑在 GPU 离屏缓冲上，不应被 2D 画布的上传像素预算（this.dpr）或大屏 farScale 反向压糊；
    // 改按显示器物理像素密度与画质档独立取目标倍率（软件渲染时沿用 this.dpr 保帧率）。
    const dispDpr = Math.min(typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1, 2);
    const capDpr = this.stage?.softGPU ? this.dpr : Math.max(this.dpr, Math.min(2, dispDpr * 1.25));
    return { camX, camY, zoom: z, cssW: W, cssH: H, season: this.game.season, scale: Math.max(0.50, Math.min(this.groundScale, capDpr)) };
  }

  // ---------------------------------------------------------------- WebGL 后期
  private postGL(camX: number, camY: number, z: number, W: number, H: number, night: number, dusk: number, gloom: number, dayK: number, mul: number[], R: number, uploadScene = true, dirty?: DirtyRect | null) {
    const game = this.game, p = game.player, st = this.stage!, F = this.fx!;
    const wt = game.weather;
    const month = Math.floor(game.day / 30) % 12;
    const tint: [number, number, number, number] = month < 3 ? [0.7, 0.86, 0.67, 0.05] : month < 6 ? [1, 0.9, 0.63, 0.05] : month < 9 ? [0.9, 0.59, 0.31, 0.07] : [0.78, 0.84, 0.94, 0.12];
    const tierS = TIERS[Math.max(0, Math.min(TIERS.length - 1, game.hero.realm))];
    const sx = W / 2 + (p.x - camX) * z, sy = H / 2 + (p.y - camY) * z;
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
      atmo: this.atmoReady ? { canvas: this.atmo, revision: this.atmoRevision, x: W / 2 + (this.atmoRect.x - camX) * z, y: H / 2 + (this.atmoRect.y - camY) * z, w: this.atmoRect.w * z, h: this.atmoRect.h * z } : null,
      fog, fogBands: wt.kind === 'fog' ? k : 0,
      flash: game.modFlash.a > Math.max(game.tianxiang.flash, wt.flash * 0.55) ? [...game.modFlash.c, Math.min(1, game.modFlash.a)] : game.tianxiang.flash > wt.flash ? [game.tianxiang.flashCol[0], game.tianxiang.flashCol[1], game.tianxiang.flashCol[2], Math.min(1, game.tianxiang.flash * 0.9)] : [0.92, 0.94, 1, wt.flash * 0.55],
      tint: (() => { const mm = mood.enabled ? moodMask(game.dayPhase, game.night, wt.kind, wt.k) : [1, 1, 1, 0]; const ms = mm[3] * 0.55; if (ms < 0.005) return tintM; const ta = tintM[3] + ms; return [(tintM[0] * tintM[3] + mm[0] * ms) / ta, (tintM[1] * tintM[3] + mm[1] * ms) / ta, (tintM[2] * tintM[3] + mm[2] * ms) / ta, Math.min(0.55, ta)] as [number, number, number, number]; })(),
      vig: 1 + mind * 0.8, hurt: Math.min(0.8, hurt + mind * 0.18), fade: Math.min(1, game.combat.fade * 1.4),
      aberr: (game.trauma > 0.25 ? (game.trauma - 0.25) * 1.2 : 0) + game.aberrKick * 0.9,
      bloom: 0.9, grain: grainEnabled() ? 1 : 0,
      shocks: F.shocks.map((s) => ({ x: W / 2 + (s.x - camX) * z, y: H / 2 + (s.y - camY) * z, r: s.r * z, amp: s.amp * Math.min(1.5, z * 1.2) })),
      sat: 0,
      ground: this.groundOn ? { view: this.groundView(camX, camY, z, W, H), provider: this.segProvider } : null,
    };
    st.frame(this.canvas, W, H, st.W / W, P, uploadScene, dirty);
  }

  // ---------------------------------------------------------------- 水
  private drawWater(left: number, top: number, right: number, bottom: number, t: number) {
    const { ctx, game } = this;
    const T = game.terrain;
    const step = 105;
    ctx.save();
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
      if (T.isLand(x, y)) continue;
      const s = T.sample(x, y);
      const deep = s.land < 0.2;
      // 波纹：缓慢漂移、明灭
      const ph = (t * (deep ? 0.22 : 0.35) + h1 * 7) % 1;
      const a = Math.sin(ph * Math.PI);
      const len = (deep ? 50 : 30) + h2 * 40;
      const dx = Math.sin(t * 0.3 + h3 * 6) * 14 + ph * 20;
      ctx.strokeStyle = `rgba(30,64,80,${0.16 * a})`;
      ctx.beginPath(); ctx.moveTo(x - len * 0.45 + dx, y + 4); ctx.quadraticCurveTo(x + dx, y - 1 - h1 * 4, x + len * 0.45 + dx, y + 4); ctx.stroke();
      ctx.strokeStyle = `rgba(248,252,250,${0.55 * a})`;
      ctx.beginPath();
      ctx.moveTo(x - len / 2 + dx, y);
      ctx.quadraticCurveTo(x + dx, y - 5 - h1 * 4, x + len / 2 + dx, y);
      ctx.stroke();
      if (h1 < 0.18) {
        ctx.strokeStyle = `rgba(40,70,80,${0.18 * a})`;
        ctx.beginPath(); ctx.moveTo(x - len * 0.4 + dx, y + 7); ctx.quadraticCurveTo(x + dx, y + 3, x + len * 0.4 + dx, y + 7); ctx.stroke();
      }
    }
    // 粼光：日光下的细碎闪点（夜里换成月色）
    const spk = Lk(BAND.sparkle, z);
    if (spk > L.GONE) {
      const gs = 70, day = 1 - game.night;
      const col = day > 0.5 ? '255,252,232' : '220,230,255';
      for (let gy = Math.floor(top / gs); gy <= Math.floor(bottom / gs); gy++) for (let gx = Math.floor(left / gs); gx <= Math.floor(right / gs); gx++) {
        const h = hash2(gx, gy, 71);
        if (h > 0.3 * spk) continue;
        const x = (gx + hash2(gx, gy, 72)) * gs, y = (gy + hash2(gx, gy, 73)) * gs;
        if (T.isLand(x, y)) continue;
        const gl = Math.sin(t * (1.6 + h * 3) + h * 40);
        if (gl < 0.55) continue;
        const k = (gl - 0.55) / 0.45, a = k * k * (day > 0.5 ? 0.85 : 0.45) * spk;
        const L = 5 + h * 20;
        ctx.fillStyle = `rgba(${col},${a})`;
        ctx.beginPath(); ctx.ellipse(x, y, L * (0.5 + k * 0.5), 1.6, 0, 0, Math.PI * 2); ctx.fill();
        if (h < 0.04 && k > 0.7) { ctx.fillRect(x - 0.6, y - 5 * k, 1.2, 10 * k); }
      }
    }
    // 岸边浪花：贴着画出的岸线一涨一退
    const shk = Lk(BAND.shore, z);
    if (shk > L.GONE) {
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
          const a = Math.sin(ph * Math.PI) * (w ? 0.45 : 0.7) * shk;
          const back = 3 + (1 - ph) * 16 + w * 4;   // 浪从外向岸推进
          const cx2 = x - nx * back, cy2 = y - ny * back, hl = 13 + h * 6;
          ctx.strokeStyle = `rgba(252,253,248,${a})`;
          ctx.beginPath();
          ctx.moveTo(cx2 - ny * hl, cy2 + nx * hl);
          ctx.quadraticCurveTo(cx2 + nx * 4, cy2 + ny * 4, cx2 + ny * hl, cy2 - nx * hl);
          ctx.stroke();
        }
      }
    }
    // 河流：顺流而下的细碎水光
    const rvk = Lk(BAND.river, z);
    if (rvk > L.GONE) {
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
          ctx.strokeStyle = `rgba(250,254,252,${(lane === 0 ? 0.5 : 0.3) * rvk})`;
          ctx.lineWidth = lane === 0 ? 2.2 : 1.6;
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    }
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
  private drawChunkTree(d: TreeDeco, season: Season, stN: number, stH: number) {
    const stPx = stH * this.Z * TREE_K;
    if (stN && stPx < TREE_TIER[1]) {
      // 小树换挡带：屏上树高 1.5px 以下全画林色，1.5→6px 之间精灵与林色互补淡入淡出，
      // 6px 以上回正常路径画真树。三段共享同一批树位，交接处墨量不变，看不出切换。
      const tt = tiersFor(stPx);
      const ctx = this.ctx;
      if (tt.cover > L.GONE) { ctx.save(); ctx.globalAlpha *= this._occA; drawTreeCover(ctx, d, season, tt.cover, TREE_K); ctx.restore(); }
      if (tt.sprite > L.GONE) L.fade(ctx, tt.sprite * this._occA, () => this.drawTree(d, this.dlT, 1, 1));
      return;
    }
    this.drawTree(d, this.dlT, 1, 1);
  }
  private buildChunkEntry(
    T: Terrain, cx: number, cy: number, ck: number,
    season: Season, _treeCap = 256, _decoK = 1, _mistK = 1, _reflectOn = true,
  ): ChunkDecoEntry {
    const ctx = this.ctx;
    const chunkDecos = T.getDecos(cx, cy);
    const chunkTrees: TreeDeco[] = [];
    const mtns: MtnDeco[] = [];
    let hSum = 0;
    for (const d of chunkDecos) {
      if (d.kind === 'tree') { chunkTrees.push(d); hSum += d.h; }
      else if (d.kind === 'mtn') mtns.push(d);
    }
    const farTrees = representativeTrees(chunkTrees, cx, cy, CHUNK, 24);
    const mtnList: readonly MtnDeco[] = mtns.length ? mtns : EMPTY_MTNS;
    this.farTreeChunks.set(ck, farTrees);
    this.farMountainChunks.set(ck, mtnList);
    this.farChunkEpoch++;
    this.farTreeEpoch++;
    this.farMtnEpoch++;
    const stN = chunkTrees.length;
    const stH = stN ? hSum / stN : 0;
    // 预生成按 8×8 网格交错排布的树序：任意前 K 棵天然空间均匀，缩放换档时无需整块重建缓存
    const orderedTrees = representativeTrees(chunkTrees, cx, cy, CHUNK, 256, true);

    const trees: ChunkDecoItem[] = [];
    const items: ChunkDecoItem[] = [];
    const reflect: (TreeDeco | MtnDeco)[] = [];
    const strips: ChunkTreeStrip[] = Array.from({ length: PATCH_STRIP_N }, () => ({
      trees: [], raw: [], minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity,
    }));
    const stripRaw = stripTreesFromChunk(chunkTrees, cy);
    const stripItemMap = new Map<TreeDeco, ChunkDecoItem>();
    let mtnCount = 0, decoCount = 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const expandBox = (it: ChunkDecoItem) => {
      if (it.visMode === 1) {
        if (it.x - it.w < minX) minX = it.x - it.w;
        if (it.x + it.w > maxX) maxX = it.x + it.w;
        if (it.y - it.h - 100 < minY) minY = it.y - it.h - 100;
        if (it.y + it.w * 0.4 > maxY) maxY = it.y + it.w * 0.4;
      } else {
        const hw = it.w * 0.5;
        if (it.x - hw < minX) minX = it.x - hw;
        if (it.x + hw > maxX) maxX = it.x + hw;
        if (it.y - it.h < minY) minY = it.y - it.h;
        if (it.y > maxY) maxY = it.y;
      }
    };
    const pushItem = (it: ChunkDecoItem) => {
      items.push(it);
      if (it.cntKind === 1) mtnCount++;
      else if (it.cntKind === 2) decoCount++;
      expandBox(it);
    };

    const makeTreeItem = (d: TreeDeco): ChunkDecoItem => ({
      cntKind: 0, visMode: 0, x: d.x, y: d.y, w: d.w, h: d.h,
      d: {
        y: d.y, k: 'D·树',
        draw: () => this.drawTree(d, this.dlT, 1, 1),
        gl: (b, occA) => this.pushTreeGl(b, d, this.dlT, 1, occA),
        occ: { get: () => this.treeSprite(d, this.dlZ), x: d.x, y: d.y, flip: d.flip, footY: d.y, k: 0.42, ent: d },
      },
    });
    for (const d of orderedTrees) {
      const td = d as TreeDeco & { _refl?: number };
      const it = makeTreeItem(d);
      trees.push(it);
      stripItemMap.set(d, it);
      expandBox(it);
      if (td._refl === undefined) td._refl = !T.isLand(d.x, d.y + 30) ? 1 : 0;
      if (td._refl) reflect.push(d);
    }
    for (let s = 0; s < PATCH_STRIP_N; s++) {
      const st = strips[s];
      st.raw = stripRaw[s];
      for (let i = 0; i < st.raw.length; i++) {
        const d = st.raw[i];
        st.trees.push(stripItemMap.get(d) ?? makeTreeItem(d));
        const hw = d.w * 0.5;
        if (d.x - hw < st.minX) st.minX = d.x - hw;
        if (d.x + hw > st.maxX) st.maxX = d.x + hw;
        if (d.y - d.h < st.minY) st.minY = d.y - d.h;
        if (d.y > st.maxY) st.maxY = d.y;
      }
    }

    for (const d of chunkDecos) {
      if (d.kind === 'mtn') {
        const dd = d as MtnDeco & { _refl?: number };
        pushItem({
          cntKind: 1, visMode: 0, x: d.x, y: d.y, w: d.w, h: d.h,
          d: {
            y: d.y, k: 'D·山',
            draw: () => { if (d.h * this.Z < 12) this.mtnFar(d, this.dlZ); else this.drawMountain(d, this.dlT); },
            gl: (b, occA) => this.pushMtnGl(b, d, this.dlZ, occA, d.h * this.Z < 12),
            occ: { get: () => this.mtnSprite(d, this.dlZ), x: d.x, y: d.y, flip: d.flip, footY: d.y, k: 0.5, ent: d } },
        });
        // v0.48 云断山腰（高远）：大山约一半横一条烟岚
        const wseed = hash2(Math.round(d.x), Math.round(d.y), 77);
        if (d.h > 260 && wseed < 0.55) {
          pushItem({
            cntKind: -1, visMode: 0, x: d.x, y: d.y, w: d.w, h: d.h,
            d: {
              y: d.y + 0.5, k: 'D·山腰云',
              draw: () => { if (this.dlLowered < 4 && this.dlMistK > L.GONE && d.h * this.Z >= 12) { this.world(); L.fade(ctx, this.dlMistK, () => mood.drawWaistMist(ctx, d, this.dlT, wseed / 0.55)); } },
              gl: (b, occA) => {
                if (this.dlLowered >= 4 || this.dlMistK <= L.GONE || d.h * this.Z < 12) return true;
                const info = mood.waistMistInfo(d, this.dlT, wseed / 0.55);
                if (!info) return true;
                const bw = info.band.width || 1, bh = info.band.height || 1;
                const spr = { canvas: info.band as unknown as HTMLCanvasElement, w: bw, h: bh, ax: bw * 0.5, ay: bh * 0.5 };
                return this.pushWorldSpr(b, spr, info.x, info.y, info.w / bw, info.h / bh, info.flip, info.alpha * this.dlMistK * occA, 0, 'MOOD:mist_band');
              },
            },
          });
        }
        if (dd._refl === undefined) dd._refl = (!T.isLand(d.x, d.y + 60) || !T.isLand(d.x - d.w * 0.25, d.y + 50) || !T.isLand(d.x + d.w * 0.25, d.y + 50)) ? 1 : 0;
        if (dd._refl) reflect.push(d);
      } else if (d.kind === 'fall') {
        pushItem({ cntKind: 1, visMode: 1, x: d.x, y: d.y, w: d.w, h: d.h, d: { y: d.y, k: 'D·瀑布', draw: () => this.drawFall(d, this.dlT), occ: { get: () => this.wfSprite(d, this.dlZ), x: d.x, y: d.y, footY: d.y, k: 0.5, ent: d } } });
      } else if (d.kind === 'img') {
        pushItem({
          cntKind: 2, visMode: 0, x: d.x, y: d.y, w: d.w, h: d.h,
          d: {
            y: d.y, k: 'D·地面小景',
            draw: () => {
              const far = this.dlDecoK <= L.GONE;
              if (far && d.h * this.Z < 0.75) return;
              if (far) {
                if (d.flip) { ctx.save(); ctx.globalAlpha *= d.alpha * this._occA; ctx.translate(d.x, 0); ctx.scale(-1, 1); ctx.drawImage(d.img, -d.w / 2, d.y - d.h, d.w, d.h); ctx.restore(); }
                else { const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * d.alpha * this._occA; ctx.drawImage(d.img, d.x - d.w / 2, d.y - d.h, d.w, d.h); ctx.globalAlpha = a0; }
              } else {
                ctx.globalAlpha = d.alpha * this._occA;
                if (d.flip) { ctx.save(); ctx.translate(d.x, 0); ctx.scale(-1, 1); ctx.drawImage(d.img, -d.w / 2, d.y - d.h, d.w, d.h); ctx.restore(); }
                else ctx.drawImage(d.img, d.x - d.w / 2, d.y - d.h, d.w, d.h);
                ctx.globalAlpha = 1;
              }
            },
            gl: (b, occA) => {
              if (this.dlDecoK <= L.GONE && d.h * this.Z < 0.75) return true;
              const spr = { canvas: d.img, w: d.w, h: d.h, ax: d.w * 0.5, ay: d.h };
              return this.pushWorldSpr(b, spr, d.x, d.y, 1, 1, !!d.flip, d.alpha * occA, 0, undefined, 1, 1, 1, false, true);
            },
            occ: { get: () => null, x: d.x, y: d.y - d.h * 0.5, footY: d.y, ent: d, mode: 'rect', box: [d.x - d.w / 2, d.y - d.h, d.x + d.w / 2, d.y], k: 0.5 },
          },
        });
      }
    }
    return { cx, cy, strips, trees, items, reflect, mtns: mtnList, farTrees, stN, stH, mtnCount, decoCount, minX, minY, maxX, maxY };
  }

  private emitChunkEntry(
    entry: ChunkDecoEntry, dlLeft: number, dlRight: number, dlTop: number, dlBottom: number,
    treeCap: number, curZ: number,
    build: { list: Drawable[]; reflect: (TreeDeco | MtnDeco)[]; prefetch: MtnDeco[]; counts: [number, number, number] },
    patchCtx?: {
      season: Season;
      decoRev: number;
      playerX: number;
      playerY: number;
      skipTrees: boolean;
      allSingle: boolean;
      nearSingle: boolean;
      budget: PatchBakeBudget;
      getTpl: PatchTemplateFn;
    },
  ) {
    const insideAll = entry.minX >= dlLeft && entry.maxX <= dlRight && entry.minY >= dlTop && entry.maxY <= dlBottom;
    if (patchCtx && this.treePatches && entry.strips && entry.cx !== undefined && entry.cy !== undefined) {
      if (!patchCtx.skipTrees) {
        if (patchCtx.allSingle) {
          const trees = entry.trees;
          if (insideAll) {
            for (let i = 0; i < trees.length; i++) build.list.push(trees[i].d);
            build.counts[0] += trees.length;
          } else {
            for (let i = 0; i < trees.length; i++) {
              const it = trees[i];
              if (it.x + it.w / 2 < dlLeft || it.x - it.w / 2 > dlRight || it.y - it.h > dlBottom + 20 || it.y < dlTop - 20) continue;
              build.list.push(it.d);
              build.counts[0]++;
            }
          }
        } else {
          for (let s = 0; s < entry.strips.length; s++) {
            const st = entry.strips[s];
            if (!st.raw.length) continue;
            if (!insideAll && (st.maxX < dlLeft || st.minX > dlRight || st.minY > dlBottom + 20 || st.maxY < dlTop - 20)) continue;
            const isNear = patchCtx.nearSingle
              && patchCtx.playerX >= st.minX - 640 && patchCtx.playerX <= st.maxX + 640
              && patchCtx.playerY >= st.minY - 640 && patchCtx.playerY <= st.maxY + 640;
            if (!isNear && st.raw.length >= PATCH_MIN_TREES_L0) {
              const patch = this.treePatches.getL0Strip(
                patchCtx.decoRev, patchCtx.season, entry.cx, entry.cy, s, st.raw, patchCtx.budget, patchCtx.getTpl,
              );
              if (patch) {
                if (!patch.empty && patch.spr) {
                  build.list.push(this.makeTreePatchDrawable(patch));
                  build.counts[0] += patch.treeCount;
                }
                continue;
              }
            }
            if (insideAll) {
              for (let i = 0; i < st.trees.length; i++) build.list.push(st.trees[i].d);
              build.counts[0] += st.trees.length;
            } else {
              for (let i = 0; i < st.trees.length; i++) {
                const it = st.trees[i];
                if (it.x + it.w / 2 < dlLeft || it.x - it.w / 2 > dlRight || it.y - it.h > dlBottom + 20 || it.y < dlTop - 20) continue;
                build.list.push(it.d);
                build.counts[0]++;
              }
            }
          }
        }
      }
    } else {
      const trees = entry.trees;
      const treeLim = Math.min(treeCap, trees.length);
      const smallTreeMode = entry.stN > 0 && entry.stH * curZ * TREE_K < TREE_TIER[1];
      if (insideAll) {
        for (let i = 0; i < treeLim; i++) build.list.push(trees[i].d);
        if (!smallTreeMode) build.counts[0] += treeLim;
      } else {
        for (let i = 0; i < treeLim; i++) {
          const it = trees[i];
          if (it.x + it.w / 2 < dlLeft || it.x - it.w / 2 > dlRight || it.y - it.h > dlBottom + 20 || it.y < dlTop - 20) continue;
          build.list.push(it.d);
          if (!smallTreeMode) build.counts[0]++;
        }
      }
    }

    if (insideAll) {
      const items = entry.items;
      const mistOff = this.dlLowered >= 4 || this.dlMistK <= L.GONE;
      const decoOff = this.dlDecoK <= L.GONE;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.d.k === 'D·山腰云' && (mistOff || it.h * curZ < 12)) continue;
        if (it.cntKind === 2 && decoOff && it.h * curZ < 1.5) continue;
        build.list.push(it.d);
      }
      const refl = entry.reflect;
      for (let i = 0; i < refl.length; i++) build.reflect.push(refl[i]);
      build.counts[1] += entry.mtnCount;
      if (!decoOff) build.counts[2] += entry.decoCount;
      return;
    }
    const items = entry.items;
    const mistOff = this.dlLowered >= 4 || this.dlMistK <= L.GONE;
    const decoOff = this.dlDecoK <= L.GONE;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.d.k === 'D·山腰云' && (mistOff || it.h * curZ < 12)) continue;
      if (it.cntKind === 2 && decoOff && it.h * curZ < 1.5) continue;
      const vis = it.visMode === 1
        ? !(it.x + it.w < dlLeft || it.x - it.w > dlRight || it.y - it.h - 100 > dlBottom || it.y + it.w * 0.4 < dlTop)
        : !(it.x + it.w / 2 < dlLeft || it.x - it.w / 2 > dlRight || it.y - it.h > dlBottom + 20 || it.y < dlTop - 20);
      if (!vis) continue;
      build.list.push(it.d);
      if (it.cntKind !== -1) build.counts[it.cntKind]++;
    }
    const refl = entry.reflect;
    for (let i = 0; i < refl.length; i++) {
      const d = refl[i];
      if (!(d.x + d.w / 2 < dlLeft || d.x - d.w / 2 > dlRight || d.y - d.h > dlBottom + 20 || d.y < dlTop - 20)) build.reflect.push(d);
    }
    const mtns = entry.mtns;
    for (let i = 0; i < mtns.length; i++) {
      const d = mtns[i];
      const vis = !(d.x + d.w / 2 < dlLeft || d.x - d.w / 2 > dlRight || d.y - d.h > dlBottom + 20 || d.y < dlTop - 20);
      if (!vis && d.x + d.w > dlLeft - 1200 && d.x - d.w < dlRight + 1200 && d.y - d.h < dlBottom + 1200 && d.y > dlTop - 1200) build.prefetch.push(d);
    }
  }
  private treeSprite(d: TreeDeco, z: number, detIdx = TREE_DET_STEPS - 1) {
    const season = this.game.season as Season;
    // 分辨率跟随缩放（固定档已废弃）：缩放只缩放同一张精灵，跨 res 档才重烘。
    const res = resBucket(z * this.dpr * d.s * TREE_K, 1.4);
    const seasonIdx = season as number;
    const memo = (d as any)._tsp as { base: string; season: number; res: number; det: number } | undefined;
    const base = memo && memo.season === seasonIdx && memo.res === res && memo.det === detIdx
      ? memo.base : `T:${d.sp}:${season}:${d.v}:d${detIdx}`;
    const hit = sprites.peek(base, res);
    if (hit) { (d as any)._tsp = { base, season: seasonIdx, res, det: detIdx }; return hit; }
    if (sprites.zoomActive && memo && memo.season === seasonIdx) {
      const cached = sprites.peek(memo.base, memo.res);
      if (cached) return cached;
    }
    const seed = (SP_INDEX[d.sp] ?? 0) * 1000 + d.v * 37 + 11;
    const det = TREE_DET_LEVELS[detIdx] ?? 1;
    const s = sprites.getAsync(base, res,
      (r) => ({ kind: 'T', sp: d.sp, season, seed, res: r, det }),
      (r) => makeTree(d.sp, season, seed, r, det) as Spr);
    // 仅记精确缓存项；getAsync 可能返回其他分辨率的临时回退。
    if (s && sprites.peek(base, res) === s) (d as any)._tsp = { base, season: seasonIdx, res, det: detIdx };
    if (this.seasonCache && detIdx === TREE_DET_STEPS - 1) this.warmTreeSeasons(d, season, res);
    if (!s) {
      if (detIdx === 0) {
        const patchTpl = sprites.peek(base, PATCH_RES_L0);
        if (patchTpl) return patchTpl;
      }
      if (memo) return sprites.peek(memo.base, memo.res);
    }
    return s;
  }
  /** 四季缓存：把另外三季的树排进预热队列（每帧最多 2 张），换季瞬间有图可用 */
  private warmTreeSeasons(d: TreeDeco, cur: Season, res: number) {
    // 队列/集合必须有上限：拉远到 0.22 时一屏上千棵树，每棵 3 季，
    // 若来多少排多少，队列会无限增长且 Array.shift 越来越贵——玩一会儿就整个卡死。
    if (this.treeWarmQ.length >= 128) return;
    if (this.treeWarmSet.size > 4096) this.treeWarmSet.clear();
    for (let s2 = 0 as Season; s2 < 4; s2 = (s2 + 1) as Season) {
      if (s2 === cur) continue;
      const base = `T:${d.sp}:${s2}:${d.v}:d${TREE_DET_STEPS - 1}`;   // 只预热最细那一档（其余档按需现烘）
      if (sprites.peek(base, res)) continue;
      const key = base + '@' + res;
      if (this.treeWarmSet.has(key)) continue;
      this.treeWarmSet.add(key);
      this.treeWarmQ.push({ d, season: s2, res });
    }
  }
  private pumpTreeWarm() {
    if (!spriteJobs().ok) return;
    for (let i = 0; i < 2 && this.treeWarmQ.length; i++) {
      const t = this.treeWarmQ.shift()!;
      const base = `T:${t.d.sp}:${t.season}:${t.d.v}:d${TREE_DET_STEPS - 1}`;
      if (sprites.peek(base, t.res)) continue;
      const seed = (SP_INDEX[t.d.sp] ?? 0) * 1000 + t.d.v * 37 + 11;
      sprites.getAsync(base, t.res, (r) => ({ kind: 'T', sp: t.d.sp, season: t.season, seed, res: r }), (r) => makeTree(t.d.sp, t.season, seed, r, 1) as Spr);
    }
  }
  /** 设置面板：四季缓存开关（关掉更省内存，换季会重画树） */
  setSeasonCache(on: boolean) {
    this.seasonCache = !!on;
    if (!on) { this.treeWarmQ.length = 0; this.treeWarmSet.clear(); }
    try { localStorage.setItem('fanren.seasonCache', on ? '1' : '0'); } catch { /* */ }
    this.game.toast(on ? '四季缓存：开（换季更快）' : '四季缓存：关（更省内存）', 'info');
  }
  /** 设置面板：树风摆（关掉走轴对齐快路径） */
  setTreeSway(on: boolean) {
    this.flatTrees = !on;
    try {
      if (on) localStorage.removeItem('fanren.treeSway');
      else localStorage.setItem('fanren.treeSway', '0');
    } catch { /* */ }
    this.game.toast(on ? '树风摆：开（原版默认）' : '树风摆：关（密林更流畅，树不再轻摆）', 'info');
  }
  /** 设置面板：世界层分辨率上限（0 = 不限制）。世界层每帧整张上传 GL，压它最省带宽 */
  setWorldDprCap(v: number, silent = false) {
    const cap = Math.max(0, Math.min(2, Number(v) || 0));
    this.worldDprCap = cap;
    try {
      if (cap) localStorage.setItem('fanren.worldDpr', String(cap));
      else localStorage.removeItem('fanren.worldDpr');
    } catch { /* */ }
    this.resize();
    if (!silent) this.game.toast(cap ? `世界层分辨率：上限 ${cap.toFixed(2)}×（画质略软，更省）` : '世界层分辨率：不限制（最清晰，最费）', 'info');
  }
  private drawTree(d: TreeDeco, t: number, lodScale: number, lodA = 1) {
    const z = this.game.cam.zoom;
    const wind = this.game.weather.wind;
    const kk = this.Z * d.s * TREE_K * lodScale;
    // 屏上不足 20px 时风摆根本看不出来，直接冻结：省掉一次斜坡矩阵，也让远景画面是"静止的"
    // （静止帧才有可能做脏矩形上传——这是后面上传优化的前提）。
    const sw = this.flatTrees || d.h * kk < 20 ? 0 : ((Math.sin(t * 1.3 + d.ph) * 0.022 + Math.sin(t * 2.9 + d.ph * 2) * 0.008) * (0.5 + wind) + wind * 0.012) * this.treeSwayWeight(d, z);
    const fl = d.flip ? -1 : 1;
    this.ctx.setTransform(fl * kk, 0, sw * kk, kk, d.x * this.Z + this.ox, d.y * this.Z + this.oy);
    const aTree = lodA * this._occA;
    // 细节量连续：屏幕上越大，叶簇/点叶越多。烘焙只能出离散变体，
    // 所以让相邻两档 alpha 交叉淡入（0..1 之间两张叠加，同一棵树慢慢变细/变密，不跳）。
    const q = Lk(BAND.treeFar, L.pxPerUnit(z, this.dpr) * d.s * TREE_K) * (TREE_DET_STEPS - 1);
    const lo = Math.max(0, Math.min(TREE_DET_STEPS - 1, Math.floor(q)));
    const hi = Math.min(TREE_DET_STEPS - 1, lo + 1);
    const mix = q - lo;
    const sLo = this.treeSprite(d, z, lo);
    if (!sLo) { this.world(); return; }
    const ctx = this.ctx;
    if (aTree < 1) ctx.globalAlpha = aTree;
    ctx.drawImage(sLo.canvas, -sLo.ax, -sLo.ay, sLo.w, sLo.h);
    if (mix > 0.02 && hi !== lo) {
      const sHi = this.treeSprite(d, z, hi);
      if (sHi) {
        ctx.globalAlpha = aTree * mix;
        ctx.drawImage(sHi.canvas, -sHi.ax, -sHi.ay, sHi.w, sHi.h);
        ctx.globalAlpha = aTree < 1 ? aTree : 1;
      }
    }
    if (aTree < 1) ctx.globalAlpha = 1;
    this.world();
  }
  /** 远景「极简山影」（不要三角符号）：把这座山自己的精灵缩到屏上恒定 ~8px 高，
   *  只用它的轮廓与配色——不是另造一个几何符号，所以远看还是"那几座山"，只是细节被压到极致。
   *  尺寸用 1/Z 抵消缩放 → 屏幕上大小恒定，拉远拉近都不会变成一颗颗三角。 */
  private mtnFar(d: MtnDeco, z: number, noBuild = false, sprite?: Spr | null) {
    // 远景循环已解析过该山的贴图，直接复用，避免每座山每帧重复算分辨率、拼键和查缓存。
    const s = sprite === undefined ? this.mtnSprite(d, z, noBuild) : sprite;
    if (!s) return;
    const ctx = this.ctx;
    const invZ = 1 / Math.max(0.001, this.Z);
    const screenH = s.h * this.Z;
    // 小于 5px 时保留可辨认的 8px 山影；5→12px 连续长到真实尺寸，
    // 12px 后自然按世界尺度增长，避免「小山符号」啪地切成真山。
    const targetH = L.mountainSizePx(screenH);
    const k = Math.max(0.001, (targetH * invZ) / Math.max(1, s.h));
    const fl = d.flip ? -1 : 1;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.scale(fl * k, k);
    ctx.globalAlpha *= this._occA;
    ctx.drawImage(s.canvas, -s.ax, -s.ay, s.w, s.h);
    ctx.restore();
    this.world();
  }
  private mtnSprite(d: MtnDeco, z: number, noBuild = false) {
    // 单张山体贴图上限 0.48MP（宽至多 840px），可单页图集容纳 6–8 座山，避免群山处频繁淘汰与退回 Canvas2D
    const cap = Math.min(840 / d.w, Math.sqrt(0.48e6 / (d.w * d.h)));
    // 分辨率跟随缩放（固定档已废弃）：跨档才重烘
    const res = Math.min(resBucket(z * this.dpr, 0.75), cap);
    const r = Math.round(res * 100) / 100;
    // 远景降细节：山在屏上越小，越少画小松/苔点/裂纹这些碎点缀（山形、山色、峰数一概不动）。
    // 量化成 9 个内部细节级（轮廓保持不变），缩放时只切换点缀密度，不改整座山的透明度。
    const mh = d.h * z * this.dpr;                    // 山在屏上的像素高
    const det = L.mountainTextureDetail(mh);
    const detQ = Math.round((det - 0.15) / 0.85 * 8);
    const key = `M:${d.id}:d${detQ}`;
    const make = (rr: number) => {
      const m = makeMountain({ ...d.spec, tex: rr, det });
      let meta = this.mtnMeta.get(d.id);
      if (!meta) { meta = { falls: m.falls }; this.mtnMeta.set(d.id, meta); if (this.mtnMeta.size > 2000) this.mtnMeta.clear(); }
      meta.falls = m.falls;
      return { canvas: m.canvas, w: m.w, h: m.h, ax: m.ax, ay: m.ay } as Spr;
    };
    // 山体贴图按 (res, 细节档) 记忆在 deco 上：每帧每座山都拼一次键再查 Map 同样是垃圾源
    const memoM = (d as any)._msp as { base: string; r: number; dq: number } | undefined;
    const hit = sprites.peek(key, r);
    if (hit) { (d as any)._msp = { base: key, r, dq: detQ }; return hit; }
    // noBuild 模式不新建贴图，但允许复用当前细节档的其它分辨率或旧细节档已缓存图（避免缩到 0.022 跨档后山峰全消失）
    if (noBuild) return sprites.best(key, r)?.s ?? (memoM ? sprites.peek(memoM.base, memoM.r) : null);
    if (sprites.zoomActive && memoM) {
      const cached = sprites.peek(memoM.base, memoM.r);
      if (cached) return cached;
    }
    const out = sprites.getAsync(key, r, (rr) => ({ kind: 'M', spec: { ...d.spec, tex: rr, det } }), make, (m) => {
      let meta = this.mtnMeta.get(d.id);
      if (!meta) { meta = { falls: m.falls ?? [] }; this.mtnMeta.set(d.id, meta); if (this.mtnMeta.size > 2000) this.mtnMeta.clear(); }
      meta.falls = m.falls ?? [];
    });
    if (out && sprites.peek(key, r) === out) (d as any)._msp = { base: key, r, dq: detQ };
    // 只沿用仍在缓存里的旧图，不能使用已释放的位图。
    if (!out && memoM) return sprites.peek(memoM.base, memoM.r);
    return out;
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
    const res = Math.round(Math.min(resBucket(z * this.dpr, 1), Math.sqrt(2.2e6 / (d.w * 1.3 * (d.h + d.w * 0.4)))) * 100) / 100;
    const s = sprites.get('WF:' + d.id, res, (r) => makeFallCliff(spec, r) as Spr);
    if (!s) return;
    let m = this.fallMeta.get(d.id); if (!m) { m = fallGeometry(spec); this.fallMeta.set(d.id, m); if (this.fallMeta.size > 300) this.fallMeta.clear(); }
    const ctx = this.ctx;
    ctx.drawImage(s.canvas, d.x - s.ax, d.y - s.ay, s.w, s.h);
    drawFallAnim(ctx, m, d.x, d.y, t, clamp(this.game.light, 0, 1) * (1 - clamp(this.game.weather.gloom * 2, 0, 1)), Lk(BAND.fallAnim, z) > 0.5);
    this.world();
  }
  private drawMountain(d: MtnDeco, t: number) {
    const z = this.game.cam.zoom;
    let _q = prof.t();
    const s = this.mtnSprite(d, z);
    prof.add('D·山┊取图', _q, 1); _q = prof.t();
    if (!s) return;
    const meta = this.mtnMeta.get(d.id);
    const ctx = this.ctx;
    ctx.globalAlpha = this._occA;
    const fl = d.flip ? -1 : 1;
    ctx.setTransform(fl * this.Z, 0, 0, this.Z, d.x * this.Z + this.ox, d.y * this.Z + this.oy);
    ctx.drawImage(s.canvas, -s.ax, -s.ay, s.w, s.h);
    prof.add('D·山┊贴图', _q, 1); _q = prof.t();
    // 瀑布流动与水雾
    if (meta?.falls.length && Lk(BAND.fall, z) > L.GONE) {
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
    }
    ctx.globalAlpha = 1;
    this.world();
  }

  // ---------------------------------------------------------------- 地点（第二十二步：贴图建筑）
  /** 铺装：先压一圈淡墨边，再以纹理平铺（相邻街面纹理在世界坐标里对齐，交口无缝） */
  private drawLocGround2(L: LocLayout, ox: number, oy: number, t: number, left: number, top: number, right: number, bottom: number) {
    const ctx = this.ctx, S = LOC_SCALE, baseAlpha = ctx.globalAlpha;
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
      if (g.kind !== 'pat' || !g.p?.edge || !vis(g)) continue;
      const x = ox + g.x * S, y = oy + g.y * S, w = g.w * S, h = g.h * S;
      ctx.fillStyle = 'rgba(70,62,48,0.16)'; ctx.fillRect(x - w / 2 - 12, y - h / 2 - 9, w + 24, h + 18);
      ctx.fillStyle = 'rgba(64,56,44,0.30)'; ctx.fillRect(x - w / 2 - 5, y - h / 2 - 4, w + 10, h + 8);
    }
    // 2) 面
    for (const g of L.ground) {
      if (!vis(g)) continue;
      const x = ox + g.x * S, y = oy + g.y * S, w = g.w * S, h = g.h * S;
      this.sceneGroundRects.push({ left: x - w / 2, top: y - h / 2, right: x + w / 2, bottom: y + h / 2 });
      if (g.kind === 'pat') {
        // CanvasPattern 大块平铺在部分城镇极慢（移植版实测 527kpx ≈ 35ms/帧）；
        // 改成逐格 drawImage，纹理缺失时回落纯色（素材加载失败时的老行为）。
        const tl = g.p!.tile ?? 300;
        const fallback = g.p!.tex.startsWith('farm') ? '#a08a62' : g.p!.tex.startsWith('road') ? '#b8a684' : '#b4ae9c';
        if (g.p!.edge === false) {
          // 土路、田：边缘羽化（不画硬边）
          ctx.globalAlpha = baseAlpha * 0.9;
          if (!fillPatternTiled(ctx, g.p!.tex, tl, t, x - w / 2 + 10, y - h / 2 + 6, w - 20, h - 12)) {
            ctx.fillStyle = fallback; ctx.fillRect(x - w / 2 + 10, y - h / 2 + 6, w - 20, h - 12);
          }
          ctx.globalAlpha = baseAlpha * 0.45;
          if (!fillPatternTiled(ctx, g.p!.tex, tl, t, x - w / 2, y - h / 2, w, h)) {
            ctx.fillStyle = fallback; ctx.fillRect(x - w / 2, y - h / 2, w, h);
          }
          ctx.globalAlpha = baseAlpha;
        } else if (!fillPatternTiled(ctx, g.p!.tex, tl, t, x - w / 2, y - h / 2, w, h)) {
          ctx.fillStyle = fallback; ctx.fillRect(x - w / 2, y - h / 2, w, h);
        }
      } else if (g.kind === 'dec') {
        if (!drawDecal(ctx, g.p!.tex, x, y, w, h, t)) { ctx.fillStyle = 'rgba(200,196,180,0.8)'; ctx.beginPath(); ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill(); }
      } else if (g.kind === 'pond') {
        ctx.fillStyle = 'rgba(70,64,52,0.35)'; ctx.beginPath(); ctx.ellipse(x, y + 4, w / 2 + 10, h / 2 + 8, 0, 0, Math.PI * 2); ctx.fill();
        const gr = ctx.createRadialGradient(x, y, 0, x, y, w / 2); gr.addColorStop(0, 'rgba(130,168,170,0.96)'); gr.addColorStop(1, 'rgba(92,130,136,0.96)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(240,246,240,0.35)'; ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) { const r = ((t * 0.12 + k / 3) % 1); ctx.globalAlpha = baseAlpha * (1 - r); ctx.beginPath(); ctx.ellipse(x + w * 0.1, y, w * 0.12 + r * w * 0.2, h * 0.12 + r * h * 0.2, 0, 0, Math.PI * 2); ctx.stroke(); }
        ctx.globalAlpha = baseAlpha;
        ctx.fillStyle = 'rgba(70,120,70,0.85)';
        for (let k = 0; k < 7; k++) { const a = k * 2.4, rr = 0.25 + (k % 3) * 0.18; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * w * rr * 0.5, y + Math.sin(a) * h * rr * 0.5, 14, 7, 0, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    ctx.restore();
  }
  /** 主角走到屋后：整座屋子淡出，露出人影 */
  /** 建筑/城墙的遮挡：统一走 occAlpha（矩形模式），全场景只有一套判定与平滑 */
  private xray(pc: Piece, x0: number, x1: number, by: number, h: number) {
    const pad = pc.p.prop ? Math.min(12, (x1 - x0) * 0.12) : 20;
    return this.occAlpha({
      get: () => null, x: (x0 + x1) / 2, y: by, footY: by,
      mode: 'rect', box: [x0 + pad, by - h * 0.92, x1 - pad, by - 4], k: 0.42,
      deadzone: pc.p.prop ? 4 : 20, ent: pc,
    });
  }
  private drawBldPiece(pc: Piece, x: number, y: number, t: number, layout: LocLayout) {
    // 建筑一律走原本的完整绘制。之前按屏幕尺寸换成"墙块+屋顶梯形"是我自作主张加的，
    // 结果远景变成几块黑方块、轮廓也没了——已撤销。要不要另做"只留轮廓、内部简化"的表示，
    // 等作者明确形态后再加。
    this.drawBldPieceFull(pc, x, y, t, layout);
  }
  private drawBldPieceFull(pc: Piece, x: number, y: number, t: number, layout: LocLayout) {
    const ctx = this.ctx, P = pc.p, w = P.w, h = P.h;
    const a = this.xray(pc, x - w * 0.44, x + w * 0.44, y, h);
    if (!drawBld(ctx, P.k, x, y, t, P.s ?? 1, !!P.f, a)) {
      // 画材尚未就绪仍保留该建筑/摆件的完整轮廓，且继承原有遮挡透明度。
      ctx.save();ctx.globalAlpha *= a;drawLocationPieceFallback(ctx,pc,layout,x,y);ctx.restore();
      return;
    }
    // 水车：转轮
    if (P.k.startsWith('b31') && !P.k.startsWith('b31_')) { /* 轮子另作构件 */ }
    // 匾额：有店名的门口挂一块木匾（图案烘成小图缓存，不再每帧排版文字）
    // 低于显示阈值时也先把名字排进空闲预热队列，越过阈值时只 drawImage，不会卡一帧。
    if (P.name && P.fn) this.queuePlaqueWarm(P.name);
    // 匾额：全城几百块牌匾，低于「字不足 1 像素」就不再画；中间按全局表淡出
    const plaqueK = Lk(BAND.bld, L.pxPerUnit(this.game.cam.zoom, this.dpr));
    if (P.name && P.fn && plaqueK > L.GONE) {
      const name: string = P.name;
      const fs = 30, bw = name.length * fs * 1.06 + 30, bh = fs + 18;
      const by = y - Math.min(h * 0.58, 230);
      const spr = this.plaqueSprite(name, bw, bh);
      L.fade(ctx, plaqueK, () => {
        ctx.save();
        if (a < 1) ctx.globalAlpha *= a;
        ctx.drawImage(spr, x - bw / 2, by - bh / 2, bw, bh);
        ctx.restore();
      });
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
    const resWant = resBucket(z * this.dpr * LOC_SCALE, 1);
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
    this.sceneGroundRects.push({
      left: x - s.ax * LOC_SCALE,
      top: y - s.ay * LOC_SCALE,
      right: x + (s.w - s.ax) * LOC_SCALE,
      bottom: y + (s.h - s.ay) * LOC_SCALE,
    });
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
  private drawSmoke(x: number, y: number, t: number, h: number) {
    const ctx = this.ctx, w = this.game.weather.wind;
    // v0.48 一缕直上的炊烟（暧暧远人村）：黄昏、清晨最浓，夜里淡去
    const sm = mood.img('cooking_smoke');
    if (sm) {
      const mw = mood.w, a = (0.3 + 0.55 * (mw.dusk + mw.dawn)) * (1 - mw.night * 0.6) * (1 - clamp(this.game.weather.gloom * 1.5, 0, 0.7));
      const hh = 250 + h * 90, ww = hh * sm.width / sm.height;
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

  private pushFlyingPlayerGl(batch: WorldSpriteBatch, dt: number, occA: number): boolean {
    if (typeof document === 'undefined') return false;
    const p = this.game.player;
    const res = this.Z <= 0.4 ? 0.5 : this.Z <= 1.0 ? 1.0 : Math.min(4, Math.ceil(this.Z * 2) / 2);
    const W = 340, H = 480, AX = 170, AY = 410;
    const pw = Math.ceil(W * res), ph = Math.ceil(H * res);
    if (!this.playerFlyCv || this.playerFlyRes !== res) {
      this.playerFlyCv = document.createElement('canvas');
      this.playerFlyCv.width = pw;
      this.playerFlyCv.height = ph;
      this.playerFlyRes = res;
    }
    const pctx = this.playerFlyCv.getContext('2d');
    if (!pctx) return false;
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, pw, ph);
    pctx.setTransform(res, 0, 0, res, (AX - p.x) * res, (AY - p.y) * res);
    const prevCtx = this.ctx;
    this.ctx = pctx;
    try {
      this.drawPlayer(dt);
    } finally {
      this.ctx = prevCtx;
    }
    const st = this.stage;
    if (!st) {
      return this.pushWorldSpr(
        batch,
        { canvas: this.playerFlyCv, w: pw, h: ph, ax: AX * res, ay: AY * res },
        p.x, p.y, 1 / res, 1 / res, false, occA, 0, 'PLAYER:FLY', 1, 1, 1, true,
      );
    }
    // 飞行主角每帧都在重绘，改用独立无 mipmap 的 LINEAR 小纹理，彻底避免把 2048×2048 WorldAtlas 页标脏并每帧整页 generateMipmap
    const gl = st.gl;
    if (!this.flyPlayerTex) {
      this.flyPlayerTex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, this.flyPlayerTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, this.flyPlayerTex);
    }
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    try {
      if (this.flyPlayerTexW !== pw || this.flyPlayerTexH !== ph) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.playerFlyCv);
        this.flyPlayerTexW = pw;
        this.flyPlayerTexH = ph;
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.playerFlyCv);
      }
    } finally {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    }
    const { x: camX, y: camY, z, W: vw, H: vh } = this.glCam;
    const sx = (p.x - camX) * z + vw * 0.5, sy = (p.y - camY) * z + vh * 0.5;
    const dw = W * z, dh = H * z;
    const dx = sx - AX * z, dy = sy - AY * z;
    if (dx + dw >= -4 && dx <= vw + 4 && dy + dh >= -4 && dy <= vh + 4) {
      batch.push(this.flyPlayerTex, dx, dy, dw, dh, 0, 0, 1, 1, 1, 1, 1, occA, 0);
    }
    return true;
  }

  // ---------------------------------------------------------------- 人物
  private drawPlayer(dt: number) {
    const { ctx, game } = this;
    const p = game.player, st = p.st;
    ctx.save();
    const lift = st.lift;
    ctx.fillStyle = `rgba(40,40,30,${Math.max(0.1, 0.3 - lift / 560)})`;
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 22 + lift * 0.22, 7 + lift * 0.04, 0, 0, Math.PI * 2); ctx.fill();
    // Canvas2D 回退路径下的脚底境界法阵（与 WebGL 共用同一套专属高清阵纹）
    if ((!this.stage || !this.fx) && game.hero.realm >= 1 && !game.hero.dead) {
      drawRealmFoot2D(ctx, p.x, p.y - lift + 3, game.hero.realm, game.time, {
        concealed: game.concealed,
        burst: game.senseBurstT > 0,
        sitting: p.sitting,
        flying: p.flying,
      });
    }
    // 打坐时的灵气环绕
    if (p.sitting) {
      const t = game.time;
      for (let i = 0; i < 6; i++) {
        const a = t * 1.4 + (i / 6) * Math.PI * 2;
        ctx.fillStyle = `rgba(150,240,200,${0.35 + 0.25 * Math.sin(t * 3 + i)})`;
        ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * 46, p.y - 30 + Math.sin(a) * 16, 3.2, 0, Math.PI * 2); ctx.fill();
      }
      if (Math.random() < dt * 6) this.particles.push({ x: p.x + (Math.random() - 0.5) * 140, y: p.y + (Math.random() - 0.5) * 50, vx: 0, vy: -30, life: 0, max: 1.2, size: 3, color: '160,240,210' });
    }
    if (game.gathering) {
      const k = game.gathering.t / 1.2;
      ctx.strokeStyle = 'rgba(255,240,180,0.9)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(p.x, p.y - 120, 14, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    const eq = game.hero.equip ?? {}, mount = p.flying ? effectiveFlightMount(game.hero) : undefined;
    st.naturalFlight = true;
    st.setFreeFlight(p.flying && !mount);
    const mg = mount ? itemArtLook(mount).glow : '120,230,170';
    if (st.action === 'fly' && p.moving && Math.random() < 0.8) {
      const a = st.yaw;
      this.particles.push({ x: p.x - Math.sin(a) * 30 + (Math.random() - 0.5) * 20, y: p.y - lift - Math.cos(a) * 10, vx: -Math.sin(a) * 40, vy: -Math.cos(a) * 20, life: 0, max: 0.6 + Math.random() * 0.5, size: 3 + Math.random() * 4, color: Math.random() < 0.5 ? mg : '220,240,255' });
    }
    // 踏云靴：足下生云（仅疾行奔跑且接地移动时触发，步行不出现）
    if (!p.flying && eq.boots && p.moving && p.running && dt > 0 && !game.paused && (st.lift ?? 0) < 8 && st.speed > 10 && Math.random() < 0.9) {
      this.particles.push({ x: p.x + (Math.random() - 0.5) * 26, y: p.y + 2, vx: -Math.sin(st.yaw) * 30 + (Math.random() - 0.5) * 20, vy: -6 - Math.random() * 10, life: 0, max: 0.5 + Math.random() * 0.4, size: 5 + Math.random() * 5, color: '245,248,255' });
    }
    const hideMount = mount === 'art_fenglei' && !!this.stage && !!this.fx && (!!game.combat.wing || (p.flying && p.boosting && game.boostKind === 'thunder')); 
    // v0.53：元婴出窍——画缩小的主角 + 金光（肉身在 yuanying.collect 里另画）
    if (game.yuanying.active) { game.yuanying.drawYing(ctx, dt, PLAYER_SCALE * YING_SCALE); return; }
    if (hasBeastSprite('p:hero') && drawBeastSprite(ctx, 'p:hero', p.x, p.y, Math.sin(st.yaw) >= 0 ? 1 : -1, charAnim(st, game.time), 1)) return;   // v0.56：模组给主角换了图
    const equippedLook = equipmentAppearance(p.look, eq, game.hero.wardrobe?.showEquipment === true);
    drawCharacter(ctx, equippedLook, st, PLAYER_SCALE, dt, { mount, hideMount, noDefaultMount: true, flightCloud: p.flying && !mount });
  }


  private updateParticles(dt: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this.particles = this.particles.filter((pt) => {
      pt.life += dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      const k = 1 - pt.life / pt.max;
      if (k <= 0) return false;
      ctx.fillStyle = `rgba(${pt.color},${0.5 * k})`;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * k, 0, Math.PI * 2); ctx.fill();
      return true;
    });
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
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
    // 匾额按「场景最大放大倍数」（Game.ZOOM_MAX = 2.5）× dpr 烘一次，
    // 之后任何缩放都只是缩放这张图：拉到最近也够清晰，不用每帧重排文字。
    const sc = Math.max(1, Math.min(6, 2.5 * this.dpr));
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
    if (c) {
      this.labelCache.delete(key);
      this.labelCache.set(key, c);
      return c;
    }
    c = make();
    if (this.fontReady(text + '城镇宗险秘岛（传闻）')) {
      if (this.labelCache.size >= LABEL_CACHE_MAX) {
        const drop = Math.max(1, Math.floor(LABEL_CACHE_MAX / 2));
        for (let i = 0; i < drop; i++) {
          const oldest = this.labelCache.keys().next().value as string | undefined;
          if (oldest === undefined) break;
          this.labelCache.delete(oldest);
        }
      }
      this.labelCache.set(key, c);
    }
    return c;
  }
  private makeLabel(l: LocDef, explored: boolean, fs: number, d = this.dpr, isBranch = false) {
    const m = document.createElement('canvas').getContext('2d')!;
    const font = `${fs}px "Ma Shan Zheng", "STKaiti", "KaiTi", serif`;
    m.font = font;
    const baseName = isBranch ? `${l.name}（分宗）` : l.name;
    const text = explored ? baseName : baseName + '（传闻）';
    const tw = m.measureText(text).width;
    const seal = fs * 1.05, pad = fs * 0.45;
    const bw = tw + seal + pad * 3, bh = fs * 1.5, lw = Math.max(1.2, fs * 0.07);
    const c = document.createElement('canvas');
    c.width = Math.ceil((bw + lw * 2 + 4) * d); c.height = Math.ceil((bh + lw * 2 + 4) * d);
    const g = c.getContext('2d')!;
    g.scale(d, d); g.translate(lw + 2, lw + 2);
    g.fillStyle = 'rgba(246,239,222,0.94)';
    g.strokeStyle = isBranch ? 'rgba(184,122,28,0.85)' : 'rgba(60,50,40,0.75)'; g.lineWidth = lw;
    const r = bh * 0.18;
    g.beginPath();
    g.moveTo(r, 0); g.lineTo(bw - r, 0); g.quadraticCurveTo(bw, 0, bw, r);
    g.lineTo(bw, bh - r); g.quadraticCurveTo(bw, bh, bw - r, bh);
    g.lineTo(r, bh); g.quadraticCurveTo(0, bh, 0, bh - r); g.lineTo(0, r); g.quadraticCurveTo(0, 0, r, 0);
    g.fill(); g.stroke();
    g.fillStyle = isBranch ? '#b87a1c' : LOC_SEAL_COLOR[l.type];
    const sx = pad, sy = (bh - seal) / 2;
    g.fillRect(sx, sy, seal, seal);
    g.textBaseline = 'middle'; g.textAlign = 'center';
    g.fillStyle = '#f7eedb';
    g.font = `${seal * 0.78}px "Ma Shan Zheng", "STKaiti", serif`;
    g.fillText(isBranch ? '舵' : LOC_SEAL[l.type], sx + seal / 2, sy + seal / 2 + seal * 0.04);
    g.fillStyle = explored ? '#2a2620' : '#5a544a';
    g.font = font; g.textAlign = 'left';
    g.fillText(text, sx + seal + pad, bh / 2 + fs * 0.04);
    return c;
  }
  private drawLabel(l: LocDef, x: number, y: number, explored: boolean) {
    const { ctx, game } = this;
    const z = game.cam.zoom;
    if (!l.major && Lk(BAND.label, L.pxPerUnit(z, this.dpr)) <= L.GONE) return;
    const isBranch = l.type === 'sect' && !!game.sectwar?.isBranch?.(l.id);
    const fsW = (l.major ? 22 : 18) / Math.max(z, 0.5) * Math.min(1, 0.55 + z * 0.6);
    const fs = Math.max(14, Math.round(fsW * z / 2) * 2); // 字号量化到 2px 台阶且不低于远景 14px，缩放无缝衔接
    const spr = this.cacheSprite(`L|${l.id}|${explored ? 1 : 0}|${isBranch ? 1 : 0}|${fs}|${this.dpr}`, () => this.makeLabel(l, explored, fs, this.dpr, isBranch), l.name);
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
    const tier = Math.max(0, Math.min(TIERS.length - 1, game.hero.realm));
    const z = game.cam.zoom;
    // v0.52.8：低画质 / 软件渲染下用「整圈烤成一张图」的版本；其余用快慢两层预合成版。
    // 两者都不再逐个贴 20 多张大图，软件光栅下的开销从近百毫秒降到几次贴图。
    const cheap = this.lowered >= 4 || !!this.stage?.softGPU;
    if (cheap) { this.sense.drawCheap(ctx, p.x, p.y, game.time, tier); this.sense.drawInner(ctx, p.x, p.y, tier, game.time, z); return; }
    const simple = this.lowered >= 2 || (!this.fixedQuality && this.lowered >= 1);
    if (simple) {
      this.sense.markSimple(tier);
      this.sense.drawSimple(ctx, p.x, p.y, game.time);
      this.sense.drawInner(ctx, p.x, p.y, tier, game.time, z);
      return;
    }
    const kind = tier * 100 + this.senseMods.length;
    if (!this.sense.hasPooled || (this as any)._poolKind !== kind) {
      this.sense.buildPooled(tier, this.senseMods);
      (this as any)._poolKind = kind;
    }
    this.sense.drawPooled(ctx, p.x, p.y, game.time);
    this.sense.drawInner(ctx, p.x, p.y, tier, game.time, z);
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
    const zc2 = game.cam.zoom;
    // 云层与云影统一随视角缩放连续淡入淡出（0.16 以下平滑归零，高空飞行不再强行压住远景与神识外灰地）
    const cloudFade = cloudZoomFade(zc2);
    const thick = zc2 < 0.5 ? 0.30 : clamp(0.1 + (0.75 - zc2) * 0.6, 0.06, 0.24);
    const clearSky = game.weather.kind === 'clear' && game.night < 0.5;
    const baseA = clearSky ? 0 : thick * cloudFade * (game.weather.kind === 'clear' ? 1 : 1.4);
    const flyMidA = Math.min(0.42, baseA + 0.16 * alt * cloudFade) * (1 - game.night * 0.5);
    const flyNearA = alt > 0.15 ? 0.34 * ((alt - 0.15) / 0.85) * cloudFade * (1 - game.night * 0.5) : 0;
    const cloudActive = cloudFade > 0.01 && (baseA > 0.006 || flyMidA > 0.006 || flyNearA > 0.006);
    if (!cloudActive && game.revealAll) {
      this.atmoReady = false;
      this.atmoCache = null;
      return;
    }
    const step = zc2 < 0.09 ? 2 : 1;
    const tNow = game.time;
    const ac = this.atmoCache;
    if (!cloudActive && !game.revealAll && game.revealT.size === 0 && this.atmoReady && ac
      && ac.map === ACTIVE_MAP && ac.exploredCount === game.exploredCount && ac.step === step
      && Math.abs(zc2 / ac.zoom - 1) <= 0.06
      && (tNow - ac.t) < 0.8
      && left >= ac.left && right <= ac.right && top >= ac.top && bottom <= ac.bottom) {
      return;
    }
    const padX = !cloudActive ? (right - left) * 0.18 : 0;
    const padY = !cloudActive ? (bottom - top) * 0.18 : 0;
    const bLeft = left - padX, bTop = top - padY, bRight = right + padX, bBottom = bottom + padY;
    const k = (AW - 2) / (bRight - bLeft);
    // 对齐到氛围层像素网格，避免低分辨率层随镜头移动而闪烁
    left = Math.floor(bLeft * k) / k; top = Math.floor(bTop * k) / k;
    right = left + AW / k; bottom = top + AH / k;
    this.atmoRect.x = left; this.atmoRect.y = top; this.atmoRect.w = AW / k; this.atmoRect.h = AH / k;
    a.setTransform(1, 0, 0, 1, 0, 0);
    a.clearRect(0, 0, AW, AH);
    a.setTransform(k, 0, 0, k, -left * k, -top * k);
    a.imageSmoothingEnabled = true;
    const fieldW = 9000, fieldH = 6000;
    const clouds: [number, number, number][] = [];
    if (cloudActive) {
      const wind = 1 + game.weather.wind;
      for (const c of this.driftClouds) {
        c.x += c.v * dt * wind;
        const s = 1400 * c.s;
        const bx = Math.floor((left - s - c.x) / fieldW) * fieldW + c.x;
        const by = Math.floor((top - s - c.y) / fieldH) * fieldH + c.y;
        for (let x = bx; x < right + s; x += fieldW) for (let y = by; y < bottom + s; y += fieldH) clouds.push([x, y, s]);
      }
    }
    // 云影与云本体先绘制，并在神识圈活跃时于圈缘柔和淡出（仅留神识内圈飞行云岚，不在神识外灰地残留云斑）
    a.globalAlpha = 0.16 * cloudFade * (1 - game.night * 0.8);
    let _q = prof.t();
    if (cloudActive && baseA > 0.006) for (const [x, y, s] of clouds) a.drawImage(this.cloudShadow, x - s / 2 + 260, y - s / 2 + 420, s, s * 0.6);
    prof.add('A2┊云影', _q, clouds.length); _q = prof.t();
    if (cloudActive && alt < 0.02 && baseA > 0.006) {
      a.globalAlpha = baseA;
      for (const [x, y, s] of clouds) a.drawImage(this.cloud, x - s / 2, y - s / 2, s, s * 0.6);
    } else if (cloudActive && (flyMidA > 0.006 || flyNearA > 0.006)) {
      if (flyMidA > 0.006) {
        a.globalAlpha = flyMidA;
        for (const c of this.driftClouds) {
          const s = 1400 * c.s, ox = c.x - cp.x, oy = c.y - cp.y;
          const bx = Math.floor((left - s - ox) / fieldW) * fieldW + ox, by = Math.floor((top - s - oy) / fieldH) * fieldH + oy;
          for (let x = bx; x < right + s; x += fieldW) for (let y = by; y < bottom + s; y += fieldH) a.drawImage(this.cloud, x - s / 2, y - s / 2, s, s * 0.6);
        }
      }
      if (flyNearA > 0.006) {
        a.globalAlpha = flyNearA;
        const fw = 4200, fh = 3000;
        for (let i = 0; i < this.driftClouds.length; i++) {
          const c = this.driftClouds[i], s = 900 * c.s, ox = c.x * 0.7 + i * 1300 - cp.x2, oy = c.y * 0.6 + i * 900 - cp.y2;
          const bx = Math.floor((left - s - ox) / fw) * fw + ox, by = Math.floor((top - s - oy) / fh) * fh + oy;
          for (let x = bx; x < right + s; x += fw) for (let y = by; y < bottom + s; y += fh) a.drawImage(this.cloud, x - s / 2, y - s / 2, s * 1.3, s * 0.5);
        }
      }
    }
    // 仅保留神识内圈的云岚：在画未探迷雾前按神识半径做柔和径向裁剪，神识外灰地彻底干净
    if (cloudActive && !game.revealAll) {
      const sr = Math.max(1, game.detailSenseRadius), px = game.player.x, py = game.player.y;
      a.save();
      a.globalAlpha = 1;
      a.globalCompositeOperation = 'destination-in';
      const rg = a.createRadialGradient(px, py, sr * 0.72, px, py, sr * 1.04);
      rg.addColorStop(0, 'rgba(0,0,0,1)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      a.fillStyle = rg;
      a.fillRect(left - 64, top - 64, right - left + 128, bottom - top + 128);
      a.restore();
    }
    prof.add('A2┊云本体', _q, clouds.length); _q = prof.t();
    if (!game.revealAll) {
      const fx0 = Math.max(0, Math.floor(left / FOG_CELL) - 1), fx1 = Math.min(FOG_W - 1, Math.floor(right / FOG_CELL) + 1);
      const fy0 = Math.max(0, Math.floor(top / FOG_CELL) - 1), fy1 = Math.min(FOG_H - 1, Math.floor(bottom / FOG_CELL) + 1);
      const t = game.time;
      // 任何视野都采用柔和云团贴图（远景自适应跳步放大云团尺寸），彻底消除低缩放时的硬边白方块矩形
      const pad = step > 1 ? 1 : 0;
      const sx0 = Math.max(0, (Math.floor(fx0 / step) - pad) * step);
      const sy0 = Math.max(0, (Math.floor(fy0 / step) - pad) * step);
      for (let fy = sy0; fy <= fy1; fy += step) for (let fx = sx0; fx <= fx1; fx += step) {
        let fa = 0;
        if (step === 1) {
          if (game.explored[fy * FOG_W + fx]) {
            const rt = game.revealT.get(fy * FOG_W + fx);
            if (rt === undefined) continue;
            const k2 = (t - rt) / 1.8;
            if (k2 >= 1) { game.revealT.delete(fy * FOG_W + fx); continue; }
            fa = 0.97 * (1 - k2 * k2 * (3 - 2 * k2));
          } else {
            fa = 0.97;
          }
        } else {
          let hiddenCnt = 0, totalCnt = 0;
          for (let dy = 0; dy < step && fy + dy <= fy1; dy++) for (let dx = 0; dx < step && fx + dx <= fx1; dx++) {
            totalCnt++;
            if (!game.explored[(fy + dy) * FOG_W + (fx + dx)]) hiddenCnt++;
          }
          if (!hiddenCnt) continue;
          fa = 0.95 * Math.min(1, hiddenCnt / Math.max(1, totalCnt * 0.65));
        }
        a.globalAlpha = fa;
        const h1 = hash2(fx, fy, 31), h2 = hash2(fx, fy, 32);
        const s = FOG_CELL * (2.2 + h1 * 0.55) * (step > 1 ? step * 0.92 : 1);
        const x = (fx + step * 0.5) * FOG_CELL + (h2 - 0.5) * 300 * step + Math.sin(t * 0.15 + h1 * 6) * 60;
        const y = (fy + step * 0.5) * FOG_CELL + (h1 - 0.5) * 300 * step;
        a.drawImage(this.cloud, x - s / 2, y - s / 2, s, s);
      }
    }
    prof.add('A2┊未探雾块', _q);
    a.globalAlpha = 1;
    this.atmoReady = true; this.atmoRevision++;
    this.atmoCache = (!cloudActive && !game.revealAll && game.revealT.size === 0)
      ? { left, top, right, bottom, zoom: zc2, exploredCount: game.exploredCount, step, t: tNow, map: ACTIVE_MAP }
      : null;
  }
}

function hexA(hex: string, a: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}
export type { Deco };
