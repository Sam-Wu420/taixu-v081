// 游戏核心：状态、循环、输入、相机；第一步大地图 + 第二步修炼与角色
import { pressKey, keyNote, keyOr } from '../core/keymap';   // 第五轮：说明里的键位从 keymap 取，触屏换说法
import { grandSectPlan, isMajorSect } from '../data/sectPlan';
import { settleInSect, settleOutOfSect } from './sectSettle';
import { toastLevel, toastRoute, toastMode, toastMs, toastQueueCap, TOAST_DEFER_MAX_AGE, type ToastLv, type ToastOpt } from './toastPolicy';
import { usesNewCity } from '../gfx/citySize';
import { NpcChat } from './npcchat';
import { TUNING } from '../data/tuning';
import { modx } from '../mod/hooks';
import { LivingWorld } from './living';
import { prof } from '../core/prof';
import { LOD } from '../gfx/lod';
import { ARTS as ARTS_ALL } from '../data/arts';
import { Terrain } from './terrain';
import { Renderer } from './render';
import { REALMS, realmName, MAJOR_BREAKS } from '../data/realms';
import { renameText } from '../data/rename';
import { LOCATIONS, LocDef, WORLD_SCALE, WORLD_W, WORLD_H, regionAt, regionNameAt, Region, ACTIVE_MAP, MapId, MAP_NAME, MAP_IDS, fromLegacyWorld, mapSize, setActiveMap, seamsOf, seamSpan, seamOut, mapFrame, type MapSeam , TN_K } from '../data/world';
import { rebuildLandmarks } from '../data/landmarks';
import { releaseTerrainChunkJobs } from './terrain-chunk-jobs';
import { Travel, encodeFog, decodeFog } from './travel';
import { clamp } from '../core/rng';
import { audio } from './audio';
import { Nuoyi } from './nuoyi';
import { Dunkong } from './dunkong';
import { populateRealm } from './realmfolk';
import { Wanbao } from './wanbao';
import { AuctionSys } from './auction';
import { PartySys, type PartyMember } from './party';
import { FellowsSys } from './fellows';
import { Enyuan } from './enyuan';
import { Zhifa } from './zhifa';     // 恩怨重做 · 第三批：NPC 执法
import { Laifang } from './laifang'; // 恩怨重做 · 第三批：NPC 主动找你
import { Dazi } from './dazi';       // 恩怨重做 · 第三批：搭档
import { Duobao } from './duobao';   // 恩怨重做 · 第三批：夺宝局   // 恩怨重做 · 第二批：化解、宗门外交、队伍指令、报官、口碑、江湖传音
import { isAmbient } from './toastPolicy';
import { StallSys } from './stall';
import { IndoorSys } from './indoor';
import { HuajuanSys } from './huajuan';   // 收官 P8（丁）：画中洞天   // 收官 P8（丁）：走进客栈、酒楼、铺子、宗门大殿（原地分层，全无缝）   // 收官 D（甲）：NPC 摆摊
import { Tutorial } from './tutorial';   // 收官 I（甲）：新手引导的步骤机
import { Xukong } from './xukong';
import { Jueyu, type Reach } from './jueyu';
import { SeaBeasts } from './seabeast';   // 收官 B2：无边海的海兽生态
import { carryAcrossSeam } from './seamCarry';   // 收官 P7：宠物、同伴跟着过交界
import { ALT, settleAltitude, stepAltitude, bandName } from './alt';
import { Tianxiang, TxKind } from './tianxiang';
import { Scenery } from './scenery';
import { CharState, HANLI_LOOK, Look, dressLook, type Wardrobe } from '../gfx/character';
import { Life } from './life';
import { Weather, WEATHER_NAME, WeatherKind } from './weather';
import { NodeField, GatherNode } from './nodes';
import { itemDef, ITEMS } from '../data/items';
import { actionOfKey, ascendLabel, bindOf, canonicalOf, keyLabel } from '../core/keymap';
import { IS_TOUCH } from '../core/touch';
import * as C from './cultivation';
import { PursuitSys } from './pursuit';
import { Roster } from './roster';
import { Garrison } from './garrison';
import { WarSys } from './war';
import { Relations } from './relations';
import { OrigStory } from './origstory';
import { talentById, GONGFA } from '../data/skills';
import { MySectSys, registerMyArts } from './mysect';
import { SectWarSys } from './sectwar';
import { Combat, Enemy } from './combat';
import { ENEMY_LIST } from '../data/enemies';
import { ARTS, profLevel } from '../data/arts';
import type { Hero, Msg } from './cultivation';
import { NpcWorld, npcMap } from './npc';
import { Hearts } from './hearts';
import { Towns } from './town';
import { TownSpace } from './townspace';
import { Events } from './events';
import { Story } from './story';
import { SiteSys } from './sites';
import { HomeSys } from './home';
import { PetSys } from './pets';
import { Happen } from './happen';
import { CanJuan } from './canjuan';
import { LandmarkSys } from './landmarks';
import { HeartLife } from './heartsx';
import { XinMo } from './xinmo';
import { RenxinSys } from './renxin';
import { JianghuSys } from './jianghu';
import { DaoxinSys } from './daoxin';
import { PianjuSys } from './pianju';
import { ShentongSys } from './shentong';
import { YuanyingSys } from './yuanying';
import { NpcShen } from './npcshen';
import { ZhenfaSys } from './zhenfa';
import { FriendsSys } from './friends';
import { MijingSys } from './mijing';
import { ZhongshengSys } from './zhongsheng';
import { warm53 } from '../gfx/v053Tex';
import { WorldState, newWorldState, SECT_RANKS } from './worldstate';
import { dirName } from './sites';
import { ITEM_LIST } from '../data/items';
import { syncHeroArms } from './arms';   // 近战兵器线：主角外观跟着兵器槽走
import { LOC_BY_ID, locHere } from '../data/world';
import type { Modal, DNode, DOpt, Shop } from './modal';
import { Hanshan } from './hanshan';   // r7：撼山客 · 岳千钧（游荡、被发现、搭话、切磋）
import { Yewushe } from './yewushe';   // r16：噬魂魔尊 · 夜无赦（邪修世界首领：周期降临、走近生成、三形态）
import { LockCam, lockCamSetting } from './lockcam';   // r11-lock：锁定跟随镜头
import { pickAtScreen } from './locktarget';   // r11-lock：点选锁定按身子在屏幕上的投影找
const TOUCH = IS_TOUCH;

/** 第四十五步：大境界突破过场（结丹 / 结婴 / 化神） */
export interface AscendInfo { kind: 'jiedan' | 'jieying' | 'huashen'; ok: boolean; name: string; age: number; realm: string; life: number; place: string }

export const DAYS_PER_SEC = 0.5;    // 现实 1 分钟 = 游戏 1 个月（30 天）
export const MEDITATE_SPEED = 3;    // 打坐时光阴流速（第四十六步：4 → 3，炼气一层不再是一两分钟的事）
export const DAY_CYCLE = 240;       // 昼夜循环（现实秒）
export const FOG_CELL = 1000;
/** 迷雾网格的宽高（随当前地图的大小变；换图时重算） */
export let FOG_W = Math.ceil(WORLD_W / FOG_CELL);
export let FOG_H = Math.ceil(WORLD_H / FOG_CELL);
/** 建好的地形按地图留着：回到去过的图不用重建（建一张约 0.8 秒）。各图的全图缩略也一样 */
const TERRAINS = new Map<MapId, Terrain>();
const OVERVIEWS = new WeakMap<Terrain, HTMLCanvasElement>();
/** 迷雾放大：旧的 ow×oh 格子图按 k 倍铺成新的（南荒放大时用） */
function scaleFog(str: string, ow: number, oh: number, k: number): string {
  const old = new Uint8Array(ow * oh); decodeFog(str, old);
  const nw = Math.ceil(ow * k), nh = Math.ceil(oh * k), out = new Uint8Array(nw * nh);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) out[y * nw + x] = old[Math.min(oh - 1, Math.floor(y / k)) * ow + Math.min(ow - 1, Math.floor(x / k))];
  return encodeFog(out);
}
/** 取当前地图的地形：没有就现建。调用前必须已经 setActiveMap 到那张图（地形是照着「当前地图」的数据建的） */
function activeTerrain(): Terrain {
  let t = TERRAINS.get(ACTIVE_MAP);
  if (!t) {
    const job = PREBUILD.get(ACTIVE_MAP);   // 后台建到一半的：接着一口气做完
    if (job) { while (!job.steps.next().done) { /* */ } t = job.terrain; PREBUILD.delete(ACTIVE_MAP); }   // 全图缩略没画完的，用到时再现画
    else { t = new Terrain(); t.build(); }
    TERRAINS.set(ACTIVE_MAP, t);
  }
  return t;
}
/** 后台分片建别的图的地形（靠近交界时用）：每次只做 budgetMs 毫秒，建完返回 true。地形要照着那张图的数据建，所以每一片都临时把当前地图切过去、做完再切回来 */
const PREBUILD = new Map<MapId, { terrain: Terrain; steps: Generator<void, void, void>; overview?: Generator<void, HTMLCanvasElement, void> }>();
export function prebuildTerrain(map: MapId, budgetMs: number): boolean {
  if (TERRAINS.has(map)) return true;
  const back = ACTIVE_MAP;
  if (map === back || !setActiveMap(map)) return false;
  try {
    let job = PREBUILD.get(map);
    if (!job) { const terrain = new Terrain(); job = { terrain, steps: terrain.buildSteps() }; PREBUILD.set(map, job); }
    const t0 = performance.now();
    do {
      if (!job.overview) { if (job.steps.next().done) job.overview = job.terrain.overviewSteps(1); continue; }
      // 地形建完，接着把全图缩略也画好（换图那一下就不用现画了）
      const r = job.overview.next();
      if (r.done) { OVERVIEWS.set(job.terrain, r.value); TERRAINS.set(map, job.terrain); PREBUILD.delete(map); return true; }
    } while (performance.now() - t0 < budgetMs);
    return false;
  } finally { setActiveMap(back); }
}
/** 某张图的全图缩略（虚空里俯瞰人界用）：那张图的地形还没建过就返回 null（可先用 prebuildTerrain 在后台建） */
/** 某张图的地形（建过才有）：世界地图画图外那一圈时问它每一点的地色 */
export function mapTerrain(map: MapId): Terrain | null { return TERRAINS.get(map) ?? null; }
export function mapOverview(map: MapId): HTMLCanvasElement | null { const t = TERRAINS.get(map); return t ? overviewOf(t) : null; }
/**
 * 现画一块局部的俯瞰图（从天外降近地面时垫在脚下的细节）：以 (x0, y0) 宏观单位为左上角、边长 span 宏观单位、px 像素见方。
 * 分片画：每次调 next() 画几行。那张图的地形必须已经建好（否则返回 null）。
 */
export function* mapPatchSteps(map: MapId, x0: number, y0: number, span: number, px: number): Generator<void, HTMLCanvasElement | null, void> {
  const t = TERRAINS.get(map);
  if (!t) return null;
  const cv = document.createElement('canvas'); cv.width = cv.height = px;
  const g = cv.getContext('2d')!, img = g.createImageData(px, px), scale = px / span;
  for (let row = 0; row < px; row += 8) {
    const back = ACTIVE_MAP, other = map !== back && setActiveMap(map);   // 取色读的是「当前地图」的数据
    try { t.overviewRows(img, x0, y0, scale, row, Math.min(px, row + 8)); } finally { if (other) setActiveMap(back); }
    yield;
  }
  g.putImageData(img, 0, 0);
  return cv;
}
function overviewOf(t: Terrain): HTMLCanvasElement { let c = OVERVIEWS.get(t); if (!c) { c = t.buildOverview(1); OVERVIEWS.set(t, c); } return c; }
/** 交界换图时，把一批带坐标的活物（敌人、弹道、特效、飘字、小动物……）整体纵向平移 */
function shiftLive(list: unknown, dx: number, dy: number): void {
  if (!Array.isArray(list)) return;
  const YS = ['y', 'hy', 'ty', 'y2', 'lastY', 'homeY', 'oy0'], XS = ['x', 'hx', 'tx', 'x2', 'lastX', 'homeX', 'ox0'];
  const move = (o: any) => { for (const k of YS) if (typeof o[k] === 'number') o[k] += dy; if (dx) for (const k of XS) if (typeof o[k] === 'number') o[k] += dx; };
  for (const o of list) {
    if (!o || typeof o !== 'object') continue;
    move(o);
    for (const sub of ['cs', 'st', 'anchor'] as const) { const q = (o as any)[sub]; if (q && typeof q === 'object' && typeof q.y === 'number' && typeof q.x === 'number') { q.y += dy; q.x += dx; } }
  }
}
/** 游戏内换图的开关：localStorage taixu.switch=reload 时退回「重新载入页面」的老办法 */
const SWITCH_IN_PLACE = (() => { try { return localStorage.getItem('taixu.switch') !== 'reload'; } catch { return true; } })();
export const GATHER_RANGE = 130;
export const GATHER_TIME = 1.2;
const LEGACY_KEY = 'taixu_step1_save';
export const SLOT_KEYS = ['taixu_save_auto', 'taixu_save_1', 'taixu_save_2', 'taixu_save_3'];
export const SLOT_NAMES = ['自动存档', '存档一', '存档二', '存档三'];

export interface PlayerState {
  name: string; x: number; y: number;
  facing: 1 | -1; moving: boolean; flying: boolean; walkT: number;
  /** 离地高度（见 alt.ts）和想去的高度。站在地上是 0；飞着时由升降键、锁定的目标或默认的悬停高度决定 */
  z: number; zTarget: number;
  running: boolean; sitting: boolean;
  st: CharState; look: Look;
  /** 飞行中催动遁光（Shift） */
  boosting?: boolean;
}

export interface UIState {
  date: { year: number; month: number; season: string };
  region: string; regionParent: string;
  nearby: LocDef | null;
  realmText: string; sense: number; senseRadius: number;
  flying: boolean; canFlyNative: boolean;
  /** 祭着遁空梭且已元婴时才有：遁空的阶段与剩余冷却（息） */
  dunkong: { phase: string; cd: number } | null;
  /** 身在虚空时才有：身在何处、最近的别界、能不能入界 */
  xukong: { where: string; near: string; hint: string } | null;
  /** 同行者（队伍框） */
  party: PartyMember[];
  /** 离地高度和所在的高度带（地面 / 低空 / 高空） */
  alt: number; altBand: string;
  /** v0.52.5：走 / 跑开关状态 */
  run: boolean;
  zoom: number; px: number; py: number;
  explored: number;
  // 第二步
  hp: number; mp: number; exp: number; need: number; bottleneck: 'none' | 'small' | 'major';
  sitting: boolean; concealed: boolean; age: number; maxLife: number; expRate: number; place: string;
  gather: { name: string; kind: string } | null; gatherP: number;
  weather: string; timeName: string; night: number;
  bottle: number; pendingTalent: boolean; dead: boolean; rootName: string;
  talk: string | null;
  daoHurt: { days: number; why: string } | null;
}

export interface Toast { id: number; text: string; kind?: 'info' | 'warn' | 'region' | 'good'; lv?: ToastLv; at?: number }
/** r14-toast：「讯」角标里的一条消息记录 */
export interface ToastLogEntry { id: number; text: string; kind: NonNullable<Toast['kind']>; lv: ToastLv; day: number; shown: boolean; read: boolean }
export interface SlotMeta { slot: number; key: string; name: string; empty: boolean; time?: number; realm?: string; year?: number; region?: string; age?: number }
export interface SeclusionReport { days: number; from: string; to: string; expGain: number; msgs: Msg[]; reason: string }

export class Game {
  terrain: Terrain;
  renderer!: Renderer;
  canvas!: HTMLCanvasElement;
  player: PlayerState;
  hero: Hero = C.newHero();
  nodes: NodeField;
  life = new Life();
  weather = new Weather();
  day = 60; // 从第一年三月开始
  clock = DAY_CYCLE * 0.3; // 昼夜时钟（现实秒），开局为上午
  explored = new Uint8Array(FOG_W * FOG_H);
  /** 各图的探索迷雾（当前图的在 explored 里，存档时写回） */
  fogs: Partial<Record<MapId, string>> = {};
  travel!: Travel;
  /** 换图动画（由界面设置；动画结束后调用 switchMap） */
  onTravel?: (to: MapId, via: 'portal' | 'edge') => void;
  /** 第四十五步：结丹 / 结婴 / 化神过场 */
  onAscend?: (a: AscendInfo) => void;
  private pendingAscend: AscendInfo['kind'] | null = null;
  revealAll = false;
  debugSeeAll = false;            // 调试：无视神识
  revealT = new Map<number, number>(); // 迷雾格揭开时间（用于淡出）
  // 目的地：自动寻路目标。带 name 才能在「取消导航 / 已到达」时说出地名
  destination: { x: number; y: number; name?: string } | null = null;
  cam = { x: 0, y: 0, zoom: 0.8, targetZoom: 0.8 };
  /** joyMag：摇杆推力（0–1），推到底自动疾行；run：手机「疾行」按钮的开关 */
  /** climb：屏幕上的升降按钮（按住为 1 / -1，松手为 0） */
  input = { keys: new Set<string>(), joy: { x: 0, y: 0 }, joyMag: 0, run: false, climb: 0, mouse: { x: 0, y: 0, t: -99, active: false, sx: NaN, sy: NaN } };   // sx / sy：鼠标最后在屏幕上的位置（近战定向每帧按它重新取脚下的地面点：镜头在动、鼠标没动时也指得准）
  combat: Combat;
  /** 第十四步：追杀 */
  pursuit: PursuitSys;
  /** 第二十九步：人情世故 */
  rel: Relations;
  /** 第三十六步：宗门名册 */
  roster: Roster;
  /** 第四十步：大城坐镇的元婴 / 结丹 */
  garrison: Garrison;
  /** 第三十六步：大战与传音玉符 */
  war: WarSys;
  orig: OrigStory;
  private relAcc = 0;
  /** 高空：0 地面 – 1 高空疾遁（镜头拉远、云层掠过） */
  alt = 0;
  private boostSfxT = 0;
  private roamPursuitT = 60;
  ws: WorldState = newWorldState();
  /** 太虚问道录：NPC 自由对话（只在有后端的创空间版里出现） */
  chat!: NpcChat;
  npcs!: NpcWorld;
  /** 第四十三步：活世界 */
  living!: LivingWorld;
  hearts!: Hearts;
  towns!: Towns;
  /** v0.60：自家宗门（开宗立派） */
  mysect!: MySectSys;
  sectwar!: SectWarSys;
  /** 第二十二步：城镇空间（建筑碰撞、门、街巷导航） */
  space = new TownSpace();
  events!: Events;
  story!: Story;
  landmarks!: LandmarkSys; sites!: SiteSys; home!: HomeSys; pets!: PetSys; happen!: Happen; canjuan!: CanJuan; heartx!: HeartLife; xinmo!: XinMo; renxin!: RenxinSys; jianghu!: JianghuSys;
  /** 第五十一步「天道」：道心难度分层 / 死亡即碑 / 资源限供 / 灵草争夺；骗局池收尾四件 */
  daoxin!: DaoxinSys; pianju!: PianjuSys;
  /** v0.53：本命神通（化形授予 / 观兽悟形）、元婴出窍、阵法禁制 */
  shentong!: ShentongSys; yuanying!: YuanyingSys; zhenfa!: ZhenfaSys;
  /** v0.54：友（友人录、同行、邀约） */
  friends!: FriendsSys;
  /** v0.54：秘境（可以走进去的独立场景） */
  mijing!: MijingSys;
  /** v0.54：众生行（巡山、猎妖、斗法、秘境人潮） */
  zhongsheng!: ZhongshengSys;
  /** v0.54.2：敌人与同伴的化形、出窍 */
  shen!: NpcShen;
  /** v0.55：外挂模组（由 mod/host 挂上） */
  mods?: { tick(dt: number): void; day(days: number): void };
  modal: Modal | null = null;
  private modalStack: Modal[] = [];
  modalListeners = new Set<() => void>();
  paused = false;
  /** v0.52.5：洞府独立场景（主角在洞府里，世界照常流转但不吃移动 / 战斗输入，世界层停画） */
  inCave = false;
  cinemaHideHud = false;
  onCave?: (on: boolean) => void;
  private renderErrs = 0;
  private runDown = -99;
  /** 第四十六步：大地图里的突破天象（不再有过场 CG） */
  tianxiang = new Tianxiang();
  /** 第四十六步：湖的意境（锦鲤、游雾、雨圈、蜻蜓、鬼火） */
  scenery = new Scenery();
  running = false;
  time = 0;
  ui!: UIState;
  listeners = new Set<() => void>();
  toasts: Toast[] = [];
  toastListeners = new Set<() => void>();
  gathering: { node: GatherNode; t: number } | null = null;
  gatherTarget: GatherNode | null = null;
  timeScale = 1;
  /**
   * B 版 HD2D 相机方位角（弧度，0 = 正对北方）。像《饥荒》：[ ] 每次转 45°，平滑转过去；纸片始终正对镜头。
   * 俯角固定（hd2d/scene.ts 的 HD_PITCH），不给玩家调：立板高度按俯角补偿，乱调会让人物比例走样。
   */
  camYawTarget = (() => { try { const v = +(localStorage.getItem('taixu.hd2d.yaw') ?? 0) || 0; return Math.round(v / (Math.PI / 4)) * (Math.PI / 4); } catch { return 0; } })();
  camYaw = this.camYawTarget;
  private uiTimer = 0; private regionTimer = 0; private saveTimer = 0; private blockedTimer = 0; private gatherScan = 0;
  private lastCastSeq = 0;
  private currentRegionId = '';
  private last = 0;
  private raf = 0;
  onOpenMap?: () => void;
  onPanel?: (p: 'char' | 'bag' | 'alchemy' | 'save' | 'seclude' | 'skills' | 'wardrobe' | 'cloud' | 'zhenfa' | 'friends', force?: boolean) => void;
  overview!: HTMLCanvasElement;     // 1000×700 全图缩略（小地图/世界地图共用）
  debugTeleport = false;            // 体验：世界地图点选瞬移

  constructor(terrain: Terrain) {
    this.terrain = terrain;
    this.nodes = new NodeField(terrain);
    this.combat = new Combat(this);
    this.pursuit = new PursuitSys(this);
    this.rel = new Relations(this);
    this.roster = new Roster(this);
    this.garrison = new Garrison(this);
    this.war = new WarSys(this);
    this.orig = new OrigStory(this);
    this.living = new LivingWorld(this);
    this.npcs = new NpcWorld(this);
    this.npcs.newWorld();
    this.hearts = new Hearts(this);
    this.towns = new Towns(this);
    this.mysect = new MySectSys(this);
    this.sectwar = new SectWarSys(this);
    this.events = new Events(this);
    this.story = new Story(this);
    this.landmarks = new LandmarkSys(this);
    this.renxin = new RenxinSys(this);
    this.jianghu = new JianghuSys(this);
    this.daoxin = new DaoxinSys(this);
    this.pianju = new PianjuSys(this);
    this.shentong = new ShentongSys(this); this.yuanying = new YuanyingSys(this); this.zhenfa = new ZhenfaSys(this); this.shen = new NpcShen(this); this.friends = new FriendsSys(this); this.mijing = new MijingSys(this); this.zhongsheng = new ZhongshengSys(this);
    warm53([]);
    this.chat = new NpcChat(this); this.sites = new SiteSys(this); this.home = new HomeSys(this); this.pets = new PetSys(this); this.happen = new Happen(this); this.canjuan = new CanJuan(this); this.heartx = new HeartLife(this); this.xinmo = new XinMo(this);
    this.travel = new Travel(this);
    this.hookCombat();
    const start = this.startPos();
    const st = new CharState(start.x, start.y);
    this.player = { name: '苏寒', x: start.x, y: start.y, facing: 1, moving: false, flying: false, walkT: 0, running: false, sitting: false, z: 0, zTarget: 0, st, look: HANLI_LOOK };
    this.cam.x = this.player.x; this.cam.y = this.player.y;
    this.weather.onThunder = () => audio.sfx('thunder');
    this.updateUI();
  }

  private startPos() {
    // 开局：青霞谷山门前（宗门地界南缘，面朝山门）；其他地图（仅调试 / 读档前的占位）取该图的大城
    const i = Math.max(0, LOCATIONS.findIndex((l) => l.id === (ACTIVE_MAP === 'tiannan' ? 'huangfeng' : ACTIVE_MAP === 'luanxing' ? 'kuixing' : 'shuozhou')));
    const L = LOCATIONS[i], z = this.terrain.locZones?.[i];
    // P10：占山的大宗门——出生在山门内的广场上
    const plan = grandSectPlan(L);
    if (plan) { const x = L.x * WORLD_SCALE + plan.spawn.x, y = L.y * WORLD_SCALE + plan.spawn.y; if (this.canStand(x, y)) return { x, y }; }
    const cx = z ? z.x : L.x * WORLD_SCALE, cy = z ? z.y + z.ry + 140 : L.y * WORLD_SCALE + 600;
    for (let r = 0; r < 3000; r += 60) {
      for (let a = 0; a < 12; a++) {
        const x = cx + Math.cos(a / 12 * Math.PI * 2) * r, y = cy + Math.abs(Math.sin(a / 12 * Math.PI * 2)) * r * 0.6;
        if (this.canStand(x, y) && !this.terrain.inLocZone(x, y, 20)) return { x, y };
      }
    }
    return { x: cx, y: cy };
  }

  /** 新开一局 */
  reset() {
    this.yingEsc = null;   // v0.70：新开局清掉元婴遁体
    const s = this.startPos();
    Object.assign(this.player, { x: s.x, y: s.y, facing: 1, moving: false, flying: false, walkT: 0, running: false, sitting: false, z: 0, zTarget: 0 });
    this.player.st = new CharState(s.x, s.y);
    this.hero = C.newHero();
    if (this.player) this.player.look = HANLI_LOOK;
    this.nodes.fromSave([]);
    this.day = 60; this.clock = DAY_CYCLE * 0.3; this.explored.fill(0); this.fogs = {}; this.travel.pending = null; this.revealAll = false; this.destination = null; this.debugTeleport = false;
    this.cam.x = this.player.x; this.cam.y = this.player.y; this.cam.zoom = this.cam.targetZoom = 0.8;
    this.currentRegionId = ''; this.gathering = null;
    this.combat.reset(); this.pursuit?.reset(); this.dunkong?.reset(); this.xukong?.reset(); this.jueyu?.reset(); this.events.reset(); this.war.reset(); this.friends.reset(); this.happen.reset();
    this.ws = newWorldState();
    this.npcs.newWorld();
    // 第五十一步「天道」：立下道心；前世的碑与那个杀你的人（带着你的储物袋）都放进这一世
    this.daoxin.reset(); this.pianju.reset(); this.yuanying.reset(); this.zhenfa.reset(); this.zhongsheng.reset(); this.shen.reset();
    this.daoxin.adoptChosen();
    this.daoxin.seedLegacy();
    this.modal = null; this.modalStack = []; this.emitModal();
    this.story.start();
    // 已是青霞谷外门弟子（持问仙令入门）
    this.ws.sect = { id: 'huangfeng', rank: 0, contrib: 50, joined: this.day, lastPay: this.day, tasks: [], done: 0 };
    this.towns.refreshTasks();
    this.player.st.faceToward(0, -1, true);
    this.updateUI();
  }

  // ---------- 第四～六步：NPC、知交、城镇、大事件 ----------
  private hookCombat() {
    const c = this.combat as any;
    const prevKill = c.onKill, prevSpar = c.onSparEnd;
    c.onKill = (e: any) => {
      prevKill?.(e);
      this.hanshan.onKill(e);
      const er = e?.realm ?? 1, hr = this.hero.realm;
      if (er >= hr) {
        this.hero.peerKills = (this.hero.peerKills ?? 0) + 1;
        C.temperDao(this.hero, 0.40);
      } else if (er >= hr - 1) {
        C.temperDao(this.hero, 0.14);
      } else {
        C.temperDao(this.hero, 0.03);
      }
      this.daoxin.onContestWon(e); this.pianju.onLawWon(e); this.npcs.onEnemyKilled(e); this.towns.onKill(e.def.id); this.events.onKill(e); this.sites.onKill(e); this.pets.onKill(e); this.happen.onKill(e); this.shentong.onKill(e);
    };
    // 第三十九步：混战里死于旁人之手——不算你的杀孽，也不给你修为 / 悬赏 / 任务进度
    c.onNpcKill = (e: any, by: any) => {
      if (e.npcId) { const d = this.npcs.byId.get(e.npcId); if (d && d.alive) this.npcs.die(d, `死于乱战（${by?.name ?? '旁人'}之手）`); }
      this.events.onKill(e); this.happen.onNpcKill(e);
    };
    c.onYield = (e: any) => this.npcs.onYield(e);
    c.onSparEnd = (e: any, won: boolean) => { prevSpar?.(e, won); if (this.hanshan.onSpar(e, won)) return; if (this.enyuan.onSpar(e, won)) return; if (!this.events.onSpar(e, won) && !this.happen.onSpar(e, won)) this.npcs.onSpar(e, won); };
  }
  /** 虚空挪移（传送过程）：开阵、甬道穿行、出阵 */
  readonly nuoyi = new Nuoyi(this);
  /** 遁空：催动遁空梭破空疾行 */
  readonly dunkong = new Dunkong(this);
  /** 虚空：飞出天穹、在诸界之间飞行、再落回界内 */
  readonly xukong = new Xukong(this);
  /** 绝域：无边海这类越深入越凶险的地带（world/jueyu.ts） */
  readonly jueyu = new Jueyu(this);
  /** 收官 B2：无边海的海兽生态（黑影、破水、血腥连锁、覆海玄鲸；world/seabeast.ts），由 jueyu.tick 驱动 */
  readonly seabeast = new SeaBeasts(this);
  /** P11 万宝楼：寄售、求购、行情（world/wanbao.ts） */
  readonly wanbao = new Wanbao(this);
  /** P11d 拍卖会：真 NPC 竞价、季末结算（world/auction.ts） */
  readonly auction = new AuctionSys(this);
  /** 结伴：同行者的法力、指令、队伍框（world/party.ts） */
  readonly party = new PartySys(this);
  /** 结伴作风：NPC 的队伍、你的队伍作风（world/fellows.ts） */
  readonly fellows = new FellowsSys(this);
  /** 恩怨重做 · 第二批：化解恩怨、宗门调停与外交、队伍指令、报官反悬赏、各地口碑、江湖传音（world/enyuan.ts） */
  readonly enyuan = new Enyuan(this);
  /** 恩怨重做 · 第三批：NPC 执法（zhifa.ts）、NPC 主动找你（laifang.ts）、搭档（dazi.ts）、夺宝局（duobao.ts） */
  readonly zhifa = new Zhifa(this);
  readonly laifang = new Laifang(this);
  readonly dazi = new Dazi(this);
  readonly duobao = new Duobao(this);
  /** 「神识中…」「江湖传闻…」这类闲讯收进江湖传音、不再弹出（test-toast 测旧的弹出规则时关掉） */
  feedAmbient = true;
  /** 收官 D（甲）：NPC 摆摊——摊主、摊位、买卖、头顶招牌（world/stall.ts） */
  readonly stall = new StallSys(this);
  /** 收官 P8（丁）：能走进去的屋——屋顶淡出、陈设、屋里的人、交谈开设施面板（world/indoor.ts） */
  readonly indoor = new IndoorSys(this);
  /** 收官 P8（丁）：画中洞天——走进画里就到了画中那处天地（world/huajuan.ts） */
  readonly huajuan = new HuajuanSys(this);
  /** 收官 I（甲）：新手引导——入门一课、情境小课、任务列的「下一步」（world/tutorial.ts）。只读状态、不改别的系统 */
  readonly tutorial = new Tutorial(this);
  /** r7：撼山客 · 岳千钧——在南荒游荡的体修（world/hanshan.ts）：远处是存档里的一个坐标，走近才有真人 */
  readonly hanshan = new Hanshan(this);
  /** r16：噬魂魔尊 · 夜无赦——周期降临在陨魔谷外围的邪修世界首领（world/yewushe.ts）：远处是存档里的一份，走近才有真身 */
  readonly yewushe = new Yewushe(this);
  get halted() { return this.paused || !!this.modal || this.nuoyi.active || this.xukong.active; }
  /** 人在地图之外的专属坐标里（秘境、虚空斗法场）：大地图上的那些系统（迷雾、区域、交界、采集、刷怪、行人……）一概不碰 */
  get offWorld(): boolean { return this.mijing.active || this.xukong.fight.on; }
  openModal(m: Modal) {
    if (this.modal && (this.modal.kind === 'town' || this.modal.kind === 'hearts' || this.modal.kind === 'chronicle' || this.modal.kind === 'relations')) this.modalStack.push(this.modal);
    this.modal = m; this.stand(); this.input.keys.clear(); this.emitModal();
  }
  openDialog(node: DNode | null | undefined) {
    if (!node) { console.warn('[dialog] 空对话节点，已忽略'); return; }   // r14：数据缺项时别再整层崩掉（洞府黑屏）
    if (modx?.has('dialog')) { const n = modx.dialogHook(node); if (!n) return; node = n; }   // v0.57：模组可改原版对话
    if (this.modal?.kind === 'dialog') { this.modal = { kind: 'dialog', node }; this.emitModal(); return; }
    this.openModal({ kind: 'dialog', node });
  }
  openShop(shop: Shop) {
    if (modx?.has('shop')) {   // v0.57：模组可改货架、价格，或不让开
      const c = modx.fire('shop', { title: shop.title, loc: shop.loc ?? null, stock: shop.stock.map((s) => ({ ...s })) });
      if (c.cancel) return;
      shop = { ...shop, stock: (Array.isArray(c.stock) ? c.stock : []).filter((s) => s && ITEMS[s.id]).map((s) => ({ ...s, price: Math.max(0, Math.round(+s.price || 0)), n: Math.max(1, Math.round(+s.n || 1)) })) };
    }
    if (this.modal?.kind === 'dialog') this.modal = null; this.openModal({ kind: 'shop', shop });
  }
  closeModal(all = false) {
    if (all) this.modalStack = [];
    let m = this.modalStack.pop() ?? null;
    // 掌门谈话退不出去：从门口 / 屋里掌柜那儿开的城镇面板带着 fac（直接办那件事），TownPanel 一挂上就办。
    // 叠在上面的对话 / 货架关掉、城镇面板从栈里弹回来时组件会重新挂上——fac 还在就又办一遍（宗门对话、货架无限重开）。
    // 弹回来的只是城镇总览：去掉 fac（传送阵那项只是默认展开列表，留着）
    if (m?.kind === 'town' && m.fac && m.fac !== 'teleport') m = { ...m, fac: undefined };
    this.modal = m; this.emitModal(); this.updateUI(true);
  }
  emitModal() { this.modalListeners.forEach((f) => f()); }
  subscribeModal(f: () => void) { this.modalListeners.add(f); return () => { this.modalListeners.delete(f); }; }
  /** 新手提示：每条只出现一次 */
  hint(id: string, text: string) {
    if (this.ws.hints.includes(id)) return;
    if (this.tutorial.mutes(id, text)) return;   // 收官 I：入门一课教过的（开局操作、交谈、施法、御剑、进城）不再另弹；别的等下了课再弹
    this.ws.hints.push(id); this.toast(text, 'good');
  }
  private hintTick() {
    const p = this.player, h = this.hero;
    if (this.npcs.focus) this.hint('talk', TOUCH ? '提示：点右侧「谈」，或直接点人，就能与他说话。' : `提示：按 ${keyLabel(bindOf('interact'))}（或点击下方按钮）与身旁之人交谈。`);
    const l = this.ui?.nearby;
    if (l && this.towns.canEnter(l)) this.hint('town', TOUCH
      ? `提示：点下方「进入」进${l.name}——坊市、酒楼、客栈、传送阵${l.type === 'sect' ? '、拜入宗门' : ''}。`
      : `提示：按 ${keyLabel(bindOf('town'))} 进入${l.name}——坊市、酒楼、客栈、传送阵${l.type === 'sect' ? '、拜入宗门' : ''}。`);
    if (this.events.enc.some((e) => e.seen)) this.hint('enc', TOUCH ? '提示：奇遇只在神识之内显现。走近后点「交谈」查看。' : `提示：奇遇只在神识之内显现。走近后按 ${keyLabel(bindOf('interact'))} 查看。`);
    if (Object.values(this.ws.hearts).some((s) => s.met)) this.hint('hearts', TOUCH ? '提示：点「≡ 菜单 → 友人」查看同行、知交与邀约。' : `提示：按 ${keyLabel(bindOf('hearts'))} 打开友人录，查看好感与故事线索。`);
    if (this.ws.news.length) this.hint('chron', TOUCH ? '提示：点「≡ 菜单 → 机缘」打开大事记——人界大事会按年份发生，你可以改变结局。' : `提示：按 ${keyLabel(bindOf('chronicle'))} 打开大事记——人界大事会按年份发生，你可以改变结局。`);
    if (this.combat.enemies.some((e) => !e.dead && e.aggro && Math.hypot(e.x - p.x, e.y - p.y) < this.senseRadius)) this.hint('fight', TOUCH ? '提示：点右下法诀盘施法，自动锁定最近的敌人（淡金环）；点敌人或按『锁』锁定，再按『锁』换下一个，长按取消。' : `提示：${keyLabel(bindOf('slot1'))}–${keyLabel(bindOf('slot5'))}、${keyLabel(bindOf('slot6'))}、${keyLabel(bindOf('slot7'))} 等快捷栏键施法，自动锁定最近的敌人（淡金环）；点击敌人或按 ${keyLabel(bindOf('lock'))} 可换目标。`);
    if (C.bottleneck(h) !== 'none') this.hint('bottle', TOUCH ? '提示：修为已满，点「≡ 菜单 → 角色」冲关。' : `提示：修为已满，按 ${keyLabel(bindOf('char'))} 打开角色面板冲关。`);
    if (h.realm === 1 && h.stage >= 5 && !this.ws.sect) this.hint('sect', '提示：炼气五层后可拜入青霞谷等大宗门；持问仙令可直接入青霞谷。');
    if (this.canFlyNative) this.hint('fly', TOUCH ? '提示：已可御剑飞行——点右手边的「剑」随时起落，再点「剑」落地；打坐、采集时会自动落地。' : `提示：已可御剑飞行——按 ${keyLabel(bindOf('fly'))}（或右下「剑」按钮）随时起落；打坐、采集时会自动落地。`);
    if (this.ws.flags.invasion) this.hint('inv', '魔道入侵梁国！在梁国斩杀魔修削弱攻势，再前往青霞谷破敌。');
  }
  news(text: string, kind: 'canon' | 'rumor' | 'personal' = 'rumor', day = this.day) {
    this.ws.news.push({ day: Math.floor(day), text, kind });
    if (kind === 'personal') this.enyuan?.deed(text);   // 恩怨重做：你做的事在江湖传音里传开、被议论
    if (this.ws.news.length > 160) this.ws.news.splice(0, this.ws.news.length - 160);
  }
  /** 打听到某地：在地图上揭开周围 */
  markKnown(l: LocDef) {
    const cx = l.x * WORLD_SCALE, cy = l.y * WORLD_SCALE, r = 1600;
    for (let y = Math.floor((cy - r) / FOG_CELL); y <= Math.floor((cy + r) / FOG_CELL); y++) for (let x = Math.floor((cx - r) / FOG_CELL); x <= Math.floor((cx + r) / FOG_CELL); x++) {
      if (x < 0 || y < 0 || x >= FOG_W || y >= FOG_H) continue;
      if (Math.hypot((x + 0.5) * FOG_CELL - cx, (y + 0.5) * FOG_CELL - cy) < r) this.explored[y * FOG_W + x] = 1;
    }
  }
  /** T：与身旁的人交谈 / 查看奇遇 */
  interact() {
    const p = this.player;
    if (this.jueyu.interact()) return;   // 收官 B3：鬼市摊主、说书鬼、潮汐祭坛
    // v0.54：秘境里只认秘境里的东西（宝箱、禁制门、出口……）与同行之人
    if (this.mijing.active) { if (this.mijing.interact()) return; if (this.npcs.focus) { this.npcs.interact(); return; } if (this.time - this.interactMiss > 3) { this.interactMiss = this.time; this.toast('近前无甚可看之物。'); } return; }
    const sf = this.story.focus;
    if (sf) { const dsf = Math.hypot(sf.x - p.x, sf.y - p.y); const dn0 = this.npcs.focus ? Math.hypot(this.npcs.focus.st.x - p.x, this.npcs.focus.st.y - p.y) : 1e9; if (dsf <= dn0 + 40) { this.story.interact(sf); return; } }
    // v0.52.5：同行伴侣走 I、灵宠走 U，T 只管奇遇 / 路人 / 机缘——三者不再互相抢键
    const n0 = this.npcs.focus, e = this.events.focus;
    const n = n0 && n0.d.beauty && this.ws.hearts[n0.d.beauty]?.follow ? null : n0;
    // v0.54：同行者整天贴在身边，T 先让给别的东西（秘境入口、阵眼、奇遇……），没别的才与同行者说话
    const dn = n ? Math.hypot(n.st.x - p.x, n.st.y - p.y) + ((n as any).act === 'follow' ? 1e8 : 0) : 1e9, de = e ? Math.hypot(e.x - p.x, e.y - p.y) : 1e9;
    // v0.52.6：洞府就建在灵脉上，两者距离几乎一样——按距离排序时「查看灵脉」会把进府抢走，
    // 于是同一个位置有时能进、有时进不去。这里让洞府在 40 以内无条件优先。
    const hh = this.ws.home;
    const hd = hh && hh.map === ACTIVE_MAP ? Math.hypot(hh.x - 30 - p.x, hh.y - 60 - p.y) : 1e9;
    const siteD = this.sites.focus && this.sites.focusD < 210 ? this.sites.focusD : 1e9;
    const homeFirst = hd < 320 && hd <= siteD + 40;
    // 第十八步：机缘、洞府、会动的奇遇、灵宠——取最近的一个
    const cands: [number, () => boolean][] = [
      [dn, () => { this.npcs.interact(); return true; }],
      [this.hanshan.focusD(), () => this.hanshan.talk()],   // r7：撼山客
      [de, () => this.events.interact(e)],
      [homeFirst ? 1e9 : siteD, () => this.sites.interact()],
      [homeFirst ? hd : 1e9, () => this.home.interact()],
      [this.happen.focus ? this.happen.focusD : 1e9, () => this.happen.interact()],
      [this.daoxin.focusDist(), () => this.daoxin.interact()],
      [this.pianju.focus ? this.pianju.focusD : 1e9, () => this.pianju.interact()],
      [this.happen.heraldFocus ? 150 : 1e9, () => this.happen.heraldInteract()],
      [this.happen.great.focus ? 140 : 1e9, () => this.happen.great.interact()],
      [this.landmarks.focus ? this.landmarks.focusD + 30 : 1e9, () => this.landmarks.interact()],
      [this.zhenfa.focus ? this.zhenfa.focusD - 20 : 1e9, () => this.zhenfa.interact()],
      [this.mijing.entFocus ? this.mijing.entFocusD : 1e9, () => this.mijing.interactWorld()],
      [this.indoor.focus ? this.indoor.focusD - 30 : 1e9, () => this.indoor.interact()],   // 收官 P8（丁）：屋里的掌柜、执事
      [this.space.doorFocus && !this.isFlying && !this.indoor.inside ? this.space.doorFocus.d + 20 : 1e9, () => this.enterDoor()],   // 人已在屋里：交谈键给掌柜，不再「进入」
    ];
    cands.sort((a, b) => a[0] - b[0]);
    for (const [d, f] of cands) { if (d >= 1e9) break; if (d === dn && !n) continue; if (d === de && !e) continue; if (f()) return; }
    if (this.travel.tryPortal()) return;
    const l = this.ui?.nearby;
    if (l && this.towns.canEnter(l)) { this.enterTown(); return; }
    // v0.52.4：手机点了「交谈」却没人——得说一声，不然像按钮坏了
    if (this.time - this.interactMiss > 3) { this.interactMiss = this.time; this.toast('近前无人，也无甚可看之物。走近些再试。'); }
  }
  private interactMiss = -99;
  /** 第二十二步：走到铺子门口直接进店 */
  enterDoor(): boolean {
    const f = this.space.doorFocus; if (!f) return false;
    if (!this.towns.canEnter(f.loc)) return false;
    audio.sfx('open');
    this.towns.open(f.loc, f.door.fn);
    return true;
  }
  enterTown() {
    if (this.mijing.active) return;
    if (this.yuanying.active) this.yuanying.back('leave');
    if (this.travel.tryPortal()) return;
    const l = this.nearbyLocation();
    if (!l || !this.towns.canEnter(l)) { this.toast('附近没有可以进入的城镇或宗门。', 'warn'); return; }
    if (l.type === 'sect' && this.rel.sectRep(l.id) <= -45 && this.ws.sect?.id !== l.id) { this.toast(`山门弟子横剑拦住了你：「${l.name}与你仇深似海，休想踏进山门半步！」`, 'warn'); return; }
    this.towns.open(l);
  }
  private townZoom: number | null = null;
  /** 主角上一刻的绝对高度（桥面判断用） */
  private deckAbs: number | null = null;
  /** 到宗门/城镇附近只记录到访，不再自动放大视角（玩家要求保留当前缩放） */
  private townAutoZoom() {
    const l = this.ui?.nearby;
    const inTown = !!l && (l.type === 'city' || l.type === 'town' || l.type === 'sect') && !this.isFlying;
    if (inTown && this.townZoom === null) { this.townZoom = this.cam.targetZoom; this.towns.onVisit(l!.id); }
    else if (!inTown && this.townZoom !== null) this.townZoom = null;
    if (l && !inTown) this.towns.onVisit(l.id);
  }

  // ---------- 存档 ----------
  /** 人物重做：换衣（衣橱写进存档，立即换上） */
  setWardrobe(w: Wardrobe) {
    this.hero.wardrobe = w;
    this.player.look = dressLook(HANLI_LOOK, w);
  }
  static hasSave() { try { return SLOT_KEYS.some((k) => !!localStorage.getItem(k)) || !!localStorage.getItem(LEGACY_KEY); } catch { return false; } }
  static latestSlot(): string | null {
    let best: string | null = null, bt = -1;
    try {
      for (const k of SLOT_KEYS) { const raw = localStorage.getItem(k); if (!raw) continue; const t = JSON.parse(raw).time ?? 0; if (t > bt) { bt = t; best = k; } }
      if (!best && localStorage.getItem(LEGACY_KEY)) best = LEGACY_KEY;
    } catch { /* */ }
    return best;
  }
  static listSlots(): SlotMeta[] {
    return SLOT_KEYS.map((key, slot) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return { slot, key, name: SLOT_NAMES[slot], empty: true };
        const d = JSON.parse(renameText(raw));
        return { slot, key, name: SLOT_NAMES[slot], empty: false, time: d.time, realm: d.meta?.realm, year: d.meta?.year, region: d.meta?.region, age: d.meta?.age };
      } catch { return { slot, key, name: SLOT_NAMES[slot], empty: true }; }
    });
  }
  save(slot = 0) {
    if (this.hero.dead) return false;
    if (this.daoxin?.hardcore?.()) slot = 0;   // 天道档：单存档自动盖写，无路可回
    try {
      this.npcs.catchUp();
      const p = this.player, tp = this.travel.pending;
      this.fogs[ACTIVE_MAP] = encodeFog(this.explored);
      this.mijing?.persist();   // 第六轮返工：人在秘境 / 画中洞天里存档，打到哪儿记进 ws.flags.mjProg
      const data = {
        v: 3, ws: WORLD_SCALE, tn: TN_K, time: Date.now(), map: tp?.map ?? ACTIVE_MAP, arrive: tp ? tp.via : undefined,
        p: tp ? { x: tp.x, y: tp.y, flying: false } : this.mijing?.cur ? { ...this.mijing.cur.back } : this.xukong?.fight.on ? { ...this.xukong.fight.back } : this.yuanying?.active && this.yuanying.body ? { x: this.yuanying.body.x, y: this.yuanying.body.y, flying: this.yuanying.body.flying } : { x: p.x, y: p.y, flying: p.flying }, day: this.day, clock: this.clock, fogs: this.fogs, zoom: this.cam.targetZoom, revealAll: this.revealAll,
        hero: this.hero, nodes: this.nodes.toSave(), world: this.ws, npcs: this.npcs.toSave(),
        meta: { realm: realmName(this.hero.realm, this.hero.stage), year: Math.floor(this.day / 360) + 1, region: tp ? MAP_NAME[tp.map] : `${MAP_NAME[ACTIVE_MAP]}·${this.ui?.region ?? ''}`, age: Math.floor(this.hero.age) },
      };
      localStorage.setItem(SLOT_KEYS[slot], JSON.stringify(data));
      return true;
    } catch { return false; }
  }
  /**
   * 自动存档：序列化 + 写 localStorage 一次要几毫秒（后期存档 600KB+），原先直接压在到点的那一帧上。
   * 改为等浏览器空闲时再存（最多晚 2 秒）。仍然调用 this.save(0)，模组对 save 的包装照常生效。
   */
  private autoSavePending = false;
  private autoSaveIdle() {
    if (this.autoSavePending) return;
    const ric = (globalThis as any).requestIdleCallback as ((f: () => void, o: { timeout: number }) => number) | undefined;
    this.autoSavePending = true;
    const schedule = () => { if (ric) ric(run, { timeout: 2000 }); else setTimeout(run, 16); };
    const run = () => {
      if (!this.running) { this.autoSavePending = false; return; }
      if (this.npcs.pendingDays) { schedule(); return; }
      this.autoSavePending = false;
      const t = prof.t(); this.save(0); prof.add('U·自动存档', t);
    };
    schedule();
  }
  /**
   * 读档修复（参照重构版的存档生命周期修复）：知交求援、异宝出世、悬赏、玉符求救在刷出敌人时会把 spawned 记进存档，
   * 敌人本身却不存。原样读回会出错：求援 / 异宝看到「敌人全灭」直接白给好感、白拿异宝，玉符求救永远卡住，
   * 悬赏目标要走远再回来才重新出现。敌人既然不在存档里，「已刷出」也不该留着——读档时清掉，走近后照常重新刷出。
   */
  private resetTransientSpawns() {
    const f = this.ws.flags as Record<string, any>;
    if (f.sos?.spawned) { delete f.sos.spawned; f.sos.until = Math.max(f.sos.until ?? 0, (this.day ?? 0) + 1); }
    if (f.herald?.spawned && !f.herald.done) { delete f.herald.spawned; delete f.herald.taker; delete f.herald.seize; }
    for (const b of this.ws.bounties ?? []) if (b.spawned && !b.done) b.spawned = false;
    for (const j of (f.jade ?? []) as { kind?: string; done?: boolean; spawned?: boolean }[]) if (j.kind === '求救' && !j.done && j.spawned) j.spawned = false;
  }
  load(key?: string) {
    try {
      const k = key ?? Game.latestSlot();
      if (!k) return false;
      const raw = localStorage.getItem(k);
      if (!raw) return false;
      const d = JSON.parse(renameText(raw));   // v0.70：旧存档里的原设人名 / 地名换成新名字
      const p = this.player;
      // 地图比例变化（第三步 180 → 第四步 300）：坐标与迷雾按比例迁移
      const ws0 = d.ws ?? (d.hero?.arts ? 180 : 100), wk = WORLD_SCALE / ws0;
      // 第十六步：三图。旧存档（统一大地图）按位置迁到对应的新图
      const legacy = !d.map;
      let map: MapId = d.map ?? 'tiannan', px = d.p.x * wk, py = d.p.y * wk;
      if (legacy) { const r = fromLegacyWorld(px, py); map = r.map; px = r.x; py = r.y; }
      // 南荒放大（TN_K）之前的存档：南荒里的一切位置乘上倍数
      const tk = TN_K / (d.tn ?? 1);
      if (tk !== 1 && !legacy) {
        if (map === 'tiannan') { px *= tk; py *= tk; }
        for (const n of (d.npcs ?? []) as { map?: string; x: number; y: number; tx: number; ty: number }[]) if ((n.map ?? 'tiannan') === 'tiannan') { n.x *= tk; n.y *= tk; n.tx *= tk; n.ty *= tk; }
        if (d.fogs?.tiannan) d.fogs.tiannan = scaleFog(d.fogs.tiannan, Math.ceil(1000 * WORLD_SCALE / (d.tn ?? 1) / FOG_CELL), Math.ceil(700 * WORLD_SCALE / (d.tn ?? 1) / FOG_CELL), tk);
        const w = d.world as { home?: { map?: string; x: number; y: number } | null; mj?: { ents?: { map: string; x: number; y: number }[] } } | undefined;
        if (w?.home && (w.home.map ?? 'tiannan') === 'tiannan') { w.home.x *= tk; w.home.y *= tk; }
        for (const e of w?.mj?.ents ?? []) if (e.map === 'tiannan') { e.x *= tk; e.y *= tk; }
        d.tn = TN_K;
      }
      if (map !== ACTIVE_MAP) { if (tk !== 1) { d.p.x = px / wk; d.p.y = py / wk; try { localStorage.setItem(k, JSON.stringify(d)); } catch { /* */ } } return this.switchMap(map, k); }
      p.x = px; p.y = py; p.flying = !!d.p.flying; p.sitting = false; p.moving = false; p.z = p.zTarget = p.flying ? ALT.hover : 0;
      // 远行落脚 / 旧统一大地图存档：落在有街巷的城镇里就上最近的街（P10 的街坊城一两万见方，
      // 原来的「找陆地」避开一切地点的地界，会把人从观星城里挪到城外近万步远）；不在城里照旧找附近的空地
      if (d.arrive || legacy) { const s = this.space?.streetAt(p.x, p.y); const q = s && this.canStand(s.x, s.y) ? s : this.findLand(p.x, p.y); p.x = q.x; p.y = q.y; p.flying = false; }
      if (!p.flying && this.terrain.walkFactor(p.x, p.y) <= 0) p.flying = true;   // 旧存档：筑基后停在海上时保持飞行
      if (!p.flying && !this.terrain.surface.sample(p.x, p.y).walkable) { const q = this.findLand(p.x, p.y, false); p.x = q.x; p.y = q.y; }      // P10：旧存档的位置落在新宗门的山体里（崖上、殿阁里、台地间够不着的坡上）：挪到最近的台面落脚点
      { const q = p.flying ? null : settleInSect(this.terrain, p.x, p.y); if (q) { p.x = q.x; p.y = q.y; } }
      this.travel.pending = null;
      p.st = new CharState(p.x, p.y);
      this.day = d.day ?? 60;
      this.clock = d.clock ?? DAY_CYCLE * 0.3;
      this.explored.fill(0);
      if (d.fogs) { this.fogs = { ...d.fogs }; decodeFog(d.fogs[ACTIVE_MAP], this.explored); }
      else if (d.fog) { this.fogs = this.migrateFog(d.fog, ws0); decodeFog(this.fogs[ACTIVE_MAP], this.explored); }
      this.cam.x = p.x; this.cam.y = p.y;
      this.cam.zoom = this.cam.targetZoom = d.zoom ?? 0.8;
      this.revealAll = !!d.revealAll;
      // v1（第一步）存档迁移：新建角色
      this.hero = d.v >= 2 && d.hero ? Object.assign(C.newHero(), d.hero) : C.newHero();
      if (this.hero.realm >= 5) { this.hero.realm = 5; this.hero.stage = 0; this.hero.exp = C.need(this.hero); }
      this.player.look = this.hero.wardrobe ? dressLook(HANLI_LOOK, this.hero.wardrobe) : HANLI_LOOK;
      if (d.v < 2 || !d.v) { this.hero.realm = d.p?.realm ?? 1; this.hero.stage = d.p?.stage ?? 0; }
      this.hero.stats = Object.assign(C.newHero().stats, this.hero.stats ?? {});
      C.mergeHerbs(this.hero);   // v0.70：灵草不计年份，旧存档分年份的灵草合成一格
      this.yingEsc = null;
      if ((this.hero as any).yingEscP) { (this.hero as any).yingEscP = undefined; C.inflictDaoHurt(this.hero, 60, '肉身被毁，元婴重塑'); this.hero.exp = Math.floor(this.hero.exp * 0.8); this.hero.hp = Math.max(this.hero.hp, 0.5); }
      this.nodes.fromSave(d.nodes);
      this.destination = null; this.currentRegionId = ''; this.gathering = null;
      this.combat.reset(); this.pursuit?.reset(); this.dunkong?.reset(); this.xukong?.reset(); this.jueyu?.reset(); this.events.reset(); this.war.reset(); this.landmarks?.reset(); this.sites?.reset(); this.happen?.reset(); this.pets?.reset();
      // 第三步存档迁移
      const nh = C.newHero();
      if (!Array.isArray(this.hero.arts) || !this.hero.arts.length) this.hero.arts = nh.arts;
      if (!Array.isArray(this.hero.hotbar) || this.hero.hotbar.length !== 9) this.hero.hotbar = nh.hotbar;
      this.hero.equip = this.hero.equip ?? {}; this.hero.looted = this.hero.looted ?? []; this.hero.kills = this.hero.kills ?? 0;
      C.syncWorn(this.hero); C.ensureBagPos(this.hero); this.hero.hotbar = this.hero.hotbar.map((x) => (x?.startsWith('pill:') && !ITEMS[x.slice(5)] ? null : x));   // 收官 C（甲）：穿戴记号对齐、旧存档补格子排位、快捷栏丹药条目校验（存档版本不升）
      // 第四步起：世界状态与 NPC
      this.ws = Object.assign(newWorldState(), d.world ?? {});
      this.resetTransientSpawns();
      this.friends.restore();
      registerMyArts(this.ws); this.mysect?.sync();   // v0.60：自创功法先登记、自家山门先上图
      if (legacy) this.npcs.mergeLegacy(d.npcs); else this.npcs.fromSave(d.npcs, wk);
      this.rel.feud.normalize();   // 恩怨重做：旧档里玩家在 hate 里的 'hero' 统一成 'me'
      populateRealm(this, ACTIVE_MAP);   // 头一回落到某一界：按种子撒一批有名有姓的人
      this.settleSects();
      this.npcs.dropBeauties(); this.ws.hearts = {};   // v0.70：知交不再登场——旧存档里的知交与情缘一并移除
      this.modal = null; this.modalStack = []; this.emitModal();
      // v0.52.5：读档后清掉一切会让画面发黑的残留（淡出遮罩、顿帧、洞府场景、静止跳画）
      this.inCave = false; this.combat.fade = 0; this.hitStop = 0; this.slowT = 0; this.onCave?.(false); this.renderer?.resetStill();
      this.daoxin.reset(); this.pianju.reset(); this.yuanying.reset(); this.zhenfa.reset(); this.zhongsheng.reset(); this.shen.reset();
      this.hearts.restore();
      this.story.resume();
      this.updateUI(true);
      if (this.running) this.living?.prewarm();   // 读档换了一批 NPC：空闲时补身家，免得第一个游戏日卡一下
      return true;
    } catch (e) { console.warn(e); return false; }
  }
  /** 换过几次图（界面据此知道该重画地图相关的东西；虚空挪移据此知道是不是已经在游戏里换好了） */
  mapEpoch = 0;
  private switching = false;
  /**
   * 换到另一张图：只换地形和依赖地图的数据，Game 和各子系统都不重建——对模组来说等同于读了一次档。
   * 换完由 switchMap 接着读档。地形第一次去要现建（约 0.8 秒），之后留着。
   */
  /** 最近一次换图各步骤的耗时（毫秒），调优用 */
  switchProfile: Record<string, number> = {};
  private rebindMap(map: MapId, carry?: { dx: number; dy: number }) {
    const old = this.terrain;
    if (!setActiveMap(map)) return;
    const P: Record<string, number> = this.switchProfile = {}; let t0 = performance.now();
    const mark = (k: string) => { const t = performance.now(); P[k] = Math.round((t - t0) * 10) / 10; t0 = t; };
    rebuildLandmarks(); mark('地标数据');
    FOG_W = Math.ceil(WORLD_W / FOG_CELL); FOG_H = Math.ceil(WORLD_H / FOG_CELL);
    this.explored = new Uint8Array(FOG_W * FOG_H); this.revealT.clear();
    const terrain = activeTerrain(); mark('地形');
    // carryDy：飞过交界中线——眼前是同一片地，把地面的缓存原样接手过来，画面才不会闪
    if (carry) terrain.adoptOutland(old, carry.dx, carry.dy);
    releaseTerrainChunkJobs(old); old.dropCaches(); mark('地面缓存');
    this.terrain = terrain; this.nodes.rebind(terrain);
    this.overview = overviewOf(terrain); mark('全图缩略');
    this.landmarks.rebuild(); mark('地标');
    this.scenery = new Scenery(); this.space = new TownSpace();
    if (!carry) this.life = new Life();
    mark('景物');
    this.sites.onMapChanged();
    this.destination = null; this.currentRegionId = ''; this.gatherTarget = null; this.gathering = null;
    this.renderer?.onMapChanged(carry); mark('渲染器');
    this.mapEpoch++;
  }
  /** 人物此刻所在（或最靠近）的那条交界；这张图没有可飞越的边时是 null */
  get seam(): MapSeam | null {
    let best: MapSeam | null = null, out = -Infinity;
    for (const S of seamsOf(ACTIVE_MAP)) { const o = seamOut(ACTIVE_MAP, S, this.player.x, this.player.y); if (o > out) { out = o; best = S; } }
    return best;
  }
  /** 离图边多远（世界单位）：进了交界地带为正，在图内为负；这张图没有可飞越的边时是负无穷 */
  get seamDepth(): number { const S = this.seam; return S ? seamOut(ACTIVE_MAP, S, this.player.x, this.player.y) : -Infinity; }
  /** 人物可以到的范围：有交界的那几条边放开到交界地带里（留一成余量），其余的边照旧 */
  get bounds(): Reach {
    const b = { x0: 200, x1: WORLD_W - 200, y0: 200, y1: WORLD_H - 200 }, p = this.player;
    const cur = this.seam, inside = cur && seamOut(ACTIVE_MAP, cur, p.x, p.y) > 0 ? cur : null;
    for (const S of seamsOf(ACTIVE_MAP)) {
      if (inside && S !== inside) continue;
      // 两张图不一样大：交界地带只取两边都有的那一段，超出的那截边照旧不通
      const [lo, hi] = seamSpan(ACTIVE_MAP, S), far = S.depth * 0.9, ns = S.side === 'n' || S.side === 's';
      const along = ns ? p.x : p.y, a0 = Math.max(200, lo + 200), a1 = hi - 200;
      if (!inside && (along < a0 - 1 || along > a1 + 1)) continue;
      if (S.side === 'n') b.y0 = -far; else if (S.side === 's') b.y1 = WORLD_H + far; else if (S.side === 'w') b.x0 = -far; else b.x1 = WORLD_W + far;
      if (inside) { if (ns) { b.x0 = a0; b.x1 = a1; } else { b.y0 = a0; b.y1 = a1; } }
    }
    return this.jueyu.bounds(b);   // 绝域（无边海等）可以再放开或收紧
  }
  /** 交界地带里上一次折算天数时的深度；seamHinted＝这一趟已经提示过 */
  private seamMark = 0; private seamHinted = false;
  /**
   * 交界地带（南荒 ⇄ 中州之间的天穹草原、南荒 ⇄ 沧溟海之间的无边海）：可以直接飞过去（草原上还能走过去），不切画面。
   *   进去一段后，在后台分片把对面那张图的地形建好；
   *   过了中线、对面的地形也好了，就悄悄换图（crossSeam）；
   *   路上按走过的纵深折算天数。
   */
  private seamTick() {
    const S = this.seam; if (!S || this.offWorld || this.inCave) return;
    const depth = this.seamDepth;
    if (depth <= 0) { this.seamMark = 0; if (depth < -3000) this.seamHinted = false; return; }
    if (!this.seamHinted && depth > 400) {
      this.seamHinted = true;
      const dir = { n: '向北', s: '向南', e: '向东', w: '向西' }[S.side];
      this.toast(S.sea ? `已出海，前面是${S.name}——一路${dir}，尽头便是${MAP_NAME[S.to]}（横渡约 ${S.days} 日）。海上只有零星的荒岛可以落脚。`
        : `已入${S.name}——一路${dir}，便是${MAP_NAME[S.to]}（横穿约 ${S.days} 日）。草原上有一条商道，顺着走不会迷路。`, 'info');
    }
    // 路上的光阴：每走过交界纵深的十二分之一，过去十二分之一的行程天数
    const step = S.depth / 12;
    if (Math.abs(depth - this.seamMark) >= step) {
      this.seamMark += Math.sign(depth - this.seamMark) * step;
      const days = S.days / 12, msgs: Msg[] = [];
      const mpT = this.hero.mp;   // 绝域：横渡折算的光阴里，回上来的法力照分带打折（核心里不回）
      C.passDays(this.hero, days, false, 1, msgs); this.day += days; this.npcs.daily(days); this.flushMsgs(msgs);
      this.jueyu.afterTravel(mpT);
    }
    // 对面的地形：离中线越近给的时间越多；到了九成还没好就不等了
    const ready = depth > 2000 && prebuildTerrain(S.to, depth > S.depth * 0.42 ? 10 : 4);
    if (depth >= S.depth / 2 && (ready || depth > S.depth * 0.88)) this.crossSeam(S);
  }
  /**
   * 飞过交界的中线：悄悄换到对面的图。中线两侧是同一片地，两张图的坐标只差一个固定的平移，
   * 所以把人、镜头、去处、追兵、战斗里的一切都平移过去，地面的缓存和网格也原样挪过去——画面上看不出任何变化。
   */
  private crossSeam(S: MapSeam) {
    const from = mapFrame(ACTIVE_MAP), to = mapFrame(S.to);
    const dx = to.dx - from.dx, dy = to.dy - from.dy, p = this.player;
    this.fogs[ACTIVE_MAP] = encodeFog(this.explored);
    this.rebindMap(S.to, { dx, dy });
    decodeFog(this.fogs[ACTIVE_MAP], this.explored);
    p.x += dx; p.st.x += dx; this.cam.x += dx;
    p.y += dy; p.st.y += dy; this.cam.y += dy;
    if (this.destination) this.destination = null;
    for (const list of [this.combat.enemies, this.combat.projs, this.combat.vfx, this.combat.texts, (this.combat as any).summons, (this.life as any).ents]) shiftLive(list, dx, dy);
    carryAcrossSeam(this, S.to, dx, dy, (list) => shiftLive(list, dx, dy));   // 收官 P7：宠物、同伴、同阵修士一起搬过去
    this.combat.fxq.length = 0;
    const chase = this.pursuit?.cur; if (chase) { chase.lastX += dx; chase.lastY += dy; }
    this.seamMark = this.seamDepth; this.seamHinted = true;
    try { localStorage.setItem('taixu.map', ACTIVE_MAP); } catch { /* */ }
    this.updateUI(true);
  }
  /**
   * 换到另一张图并读档（key 不给＝远行 / 传送阵过去，读刚写下的自动存档）。
   * 能在游戏里直接换就直接换：不重新载入页面、不黑屏。做不到或中途出错，退回老办法——记下目标图，重新载入后自动读档。
   */
  switchMap(map: MapId, key?: string): boolean {
    const k = key ?? 'taixu_save_auto';
    try { localStorage.setItem('taixu.map', map); } catch { return false; }
    if (SWITCH_IN_PLACE && !this.switching && !(globalThis as any).__TAIXU_SWITCH_RELOAD) {
      this.switching = true;
      try {
        // 远行 / 传送阵：先把「人已到对面」写进自动存档（老办法里这一步是页面卸载时存的）
        if (!key && !this.save(0)) throw new Error('换图前存档失败');
        this.rebindMap(map);
        // 读档之后照例通知模组「开始了」（重新载入的老办法里，进游戏时也会通知这一次）
        if (this.load(k)) { (this.mods as { start?: () => void } | undefined)?.start?.(); return true; }
        console.warn('[换图] 换好了图却读不出存档，改为重新载入');
      } catch (e) { console.warn('[换图] 游戏内换图出错，改为重新载入', e); }
      finally { this.switching = false; }
    }
    try { sessionStorage.setItem('taixu.resume', k); } catch { return false; }
    if (typeof location !== 'undefined' && !(globalThis as any).__TAIXU_NORELOAD) {
      // 网址里带 ?map= 时它优先于本地记录——改写网址，否则会无限重载
      if (/[?&](map|auto)=/.test(location.search)) { const u = new URL(location.href); u.searchParams.set('map', map); u.searchParams.delete('auto'); location.replace(u.toString()); }
      else location.reload();
      return true;
    }
    return false;
  }
  /** 旧版统一地图的迷雾 → 三张新图各自的迷雾 */
  private migrateFog(fog: string, ws0: number): Partial<Record<MapId, string>> {
    const ow = Math.ceil(1000 * ws0 / FOG_CELL), wk = WORLD_SCALE / ws0;
    const arr = {} as Record<MapId, { a: Uint8Array; w: number; h: number }>;
    for (const m of MAP_IDS) { const S = mapSize(m), w = Math.ceil(S.W * WORLD_SCALE / FOG_CELL), h = Math.ceil(S.H * WORLD_SCALE / FOG_CELL); arr[m] = { a: new Uint8Array(w * h), w, h }; }
    const raw = new Uint8Array(fog.length); decodeFog(fog, raw);
    for (let i = 0; i < raw.length; i++) if (raw[i]) {
      const ox = (i % ow) * FOG_CELL * wk, oy = Math.floor(i / ow) * FOG_CELL * wk, os = FOG_CELL * wk;
      const a = fromLegacyWorld(ox, oy), b = fromLegacyWorld(ox + os, oy + os);
      if (a.map !== b.map) continue;
      const T = arr[a.map];
      for (let yy = Math.floor(a.y / FOG_CELL); yy <= Math.floor(b.y / FOG_CELL); yy++) for (let xx = Math.floor(a.x / FOG_CELL); xx <= Math.floor(b.x / FOG_CELL); xx++) if (xx >= 0 && yy >= 0 && xx < T.w && yy < T.h) T.a[yy * T.w + xx] = 1;
    }
    const out: Partial<Record<MapId, string>> = {};
    for (const m of MAP_IDS) out[m] = encodeFog(arr[m].a);
    return out;
  }
  /** 就近找一处可落脚的陆地（换图落点、旧存档迁移） */
  /** P10：读档后，这张图上落在新宗门山体里的 NPC 挪到台面落脚点上、洞府挪到宗门地界外（见 sectSettle.ts） */
  private settleSects() {
    for (const n of this.npcs.list) {
      if (npcMap(n) !== ACTIVE_MAP) continue;
      const q = settleInSect(this.terrain, n.x, n.y); if (q) { n.x = q.x; n.y = q.y; }
      const t = settleInSect(this.terrain, n.tx, n.ty); if (t) { n.tx = t.x; n.ty = t.y; }
    }
    const h = this.ws.home;
    if (h && (h.map ?? 'tiannan') === ACTIVE_MAP) { const q = settleOutOfSect(this.terrain, h.x, h.y); if (q) { h.x = q.x; h.y = q.y; } }
    this.settleMoved();
  }
  /**
   * P10 收尾：新布局的城、占山的宗门把落在里面的小地点挪到了外面（id、名字不变，按 id 引用的自然跟着走），
   * 但旧存档里有几样东西记的是当时的坐标，读档时挪一挪：
   *   · NPC 的打算（plan.to 是地点 id、plan.x / y 是当时那里的落点）：落点离这处地点太远（地点被挪走了）→ 换到它现在的位置一带；
   *   · 常住的人（stay）去处离住处太远 → 换到住处一带（人自己会走过去）；
   *   · 已接的悬赏、残图所指的藏宝处落在新城的城墙圈里或宗门山体里 → 挪到附近站得住、不在任何地点里的陆地上。
   * 新存档里这些本来就对得上，不会被挪动。
   */
  private settleMoved() {
    const T = this.terrain, WS = WORLD_SCALE, N = this.npcs;
    const zoneBy = new Map(T.locZones.map((z) => [z.id, z] as const));
    const reach = (l: LocDef) => { const z = zoneBy.get(l.id); return Math.max(z?.rx ?? 600, z?.ry ?? 600) + 2600; };
    const far = (x: number, y: number, l: LocDef) => Math.hypot(x - l.x * WS, y - l.y * WS) > reach(l);
    const rnd = Math.random;
    for (const n of N.list) {
      if (!n.alive || npcMap(n) !== ACTIVE_MAP) continue;
      const pl = n.plan;
      if (pl?.to && pl.x !== undefined && pl.y !== undefined && !pl.who) {
        const L = LOC_BY_ID.get(pl.to);
        if (L && L.map === ACTIVE_MAP && far(pl.x, pl.y, L)) {
          const q0 = N.homeAt(L, rnd, 1000, 700), q = settleInSect(T, q0.x, q0.y) ?? q0;
          pl.x = Math.round(q.x); pl.y = Math.round(q.y);
          if (!N.activeOf(n.id)) { n.tx = pl.x; n.ty = pl.y; }
        }
      } else if (n.stay && !pl) {
        const H = LOC_BY_ID.get(n.home);
        if (H && H.map === ACTIVE_MAP && far(n.tx, n.ty, H)) { const q0 = N.homeAt(H, rnd, 900, 600, 200), q = settleInSect(T, q0.x, q0.y) ?? q0; n.tx = q.x; n.ty = q.y; }
      }
    }
    // 落在新城墙圈里、宗门山体里：往外找站得住、不在任何地点里的陆地
    const inside = (x: number, y: number) => { const m = T.surface.massifAt(x, y); if (m && m.weight > 0) return true; const z = T.inLocZone(x, y, 0); return !!z && usesNewCity(LOC_BY_ID.get(z.id)!); };
    const out = (x: number, y: number) => {
      for (let r = 300; r < 30000; r += 150) for (let a = 0; a < 24; a++) {
        const qx = clamp(x + Math.cos(a / 24 * Math.PI * 2) * r, 400, WORLD_W - 400), qy = clamp(y + Math.sin(a / 24 * Math.PI * 2) * r, 400, WORLD_H - 400);
        if (this.canStand(qx, qy) && !T.inLocZone(qx, qy, 10) && !T.surface.massifAt(qx, qy)) return { x: qx, y: qy };
      }
      return null;
    };
    for (const b of this.ws.bounties ?? []) if ((b.map ?? 'tiannan') === ACTIVE_MAP && !b.done && inside(b.x, b.y)) { const q = out(b.x, b.y); if (q) { b.x = q.x; b.y = q.y; } }
    for (const c of this.ws.caches ?? []) if ((c.map ?? 'tiannan') === ACTIVE_MAP && !c.done && inside(c.x, c.y)) { const q = out(c.x, c.y); if (q) { c.x = q.x; c.y = q.y; } }
  }
  findLand(x: number, y: number, avoidLocations = true) {
    const T = this.terrain;
    for (let r = 0; r < 12000; r += 80) for (let a = 0; a < 16; a++) {
      const qx = clamp(x + Math.cos(a / 16 * Math.PI * 2) * r, 400, WORLD_W - 400), qy = clamp(y + Math.sin(a / 16 * Math.PI * 2) * r, 400, WORLD_H - 400);
      if (this.canStand(qx, qy) && (!avoidLocations || !T.inLocZone(qx, qy, 10))) return { x: qx, y: qy };
    }
    return { x, y };
  }
  private canStand(x: number, y: number) {
    return this.terrain.walkFactor(x, y) > 0 && this.terrain.surface.sample(x, y).walkable;
  }
  private canLand() {
    const p = this.player;
    if (this.mijing.active) { if (this.mijing.walk(p.x, p.y)) return true; this.toast('脚下是云海——飞到石台或石桥上再落。', 'warn'); return false; }
    if (this.jueyu.footholdAt(p.x, p.y)) return true;   // 收官 B2：鲸背这类浮在海上的落脚处
    if (this.terrain.walkFactor(p.x, p.y) <= 0) { this.toast('身下是大海，不能在此落下。', 'warn'); return false; }
    if (!this.terrain.surface.sample(p.x, p.y).walkable) { this.toast('山坡过陡，不能在此落下。', 'warn'); return false; }
    return true;
  }
  static deleteSlot(slot: number) { try { localStorage.removeItem(SLOT_KEYS[slot]); } catch { /* */ } }
  static clearAll() { try { for (const k of SLOT_KEYS) localStorage.removeItem(k); localStorage.removeItem(LEGACY_KEY); } catch { /* */ } }

  // ---------- 派生数值 ----------
  get stats() {
    const s = C.heroStats(this.hero);
    const nk = this.combat?.ni?.hpK ?? 1; if (nk !== 1) s.hp = Math.round(s.hp * nk);   // 鼓元术：气血上限暂涨
    if (this.hearts) { s.atk = Math.round(s.atk * (1 + this.hearts.bonus('atk'))); s.def = Math.round(s.def * (1 + this.hearts.bonus('def'))); s.sense = Math.round(s.sense * (1 + this.hearts.bonus('sense'))); s.luck += this.hearts.bonus('luck'); }
    return s;
  }
  get sense() { return this.stats.sense; }
  /** 基础神识半径（世界像素） */
  get baseSenseRadius() {
    const s = this.sense;
    let r = s <= 0 ? 380 : 450 + 55 * Math.sqrt(s);
    if (this.hero.gongfa === 'dayan') r *= 1.35; // 天衍诀：神识大增
    return r;
  }
  get senseRadius() {
    let r = this.baseSenseRadius;
    if (this.senseBurstT > 0) r *= 2;
    if (this.concealed) r *= 0.6;
    if (this.landmarks) r *= this.landmarks.senseK;   // 第十九步：陨魔谷迷雾等压制神识
    return r;
  }
  // ---------- 神识秘术 ----------
  camFrameZ = 1; camLeanX = 0; camLeanY = 0;
  /** r11-lock：锁定跟随镜头（world/lockcam.ts）；lockCamOn = 上一帧是不是它在管偏移（刚打开时从当前偏移起步，不跳） */
  readonly lockCam = new LockCam(); private lockCamOn = false;
  senseBurstT = 0; senseBurstCd = 0; concealed = false; senseAlarm = 0; private scanTimer = 20;
  /** 神识外放（持续型）：Q 开 / 再按 Q 收。半径 ×2；起手耗一成法力，之后持续耗蓝（外放期间法力不回），法力将尽时自动收回 */
  senseBurst() {
    if (this.senseBurstT > 0) { this.endSenseBurst('收回外放的神识。'); return; }
    if (this.senseBurstCd > 0) { this.toast(`神识刚收回，尚需调息 ${Math.ceil(this.senseBurstCd)} 息。`, 'warn'); return; }
    if (this.hero.mp < 0.15) { this.toast('法力不足，无法外放神识。', 'warn'); return; }
    this.hero.mp -= 0.1; this.senseBurstT = 1e9; this.concealed = false; this.senseWaveT = 0;
    if (this.renderer) this.renderer.sense.burst = 1;
    this.toast(`神识如潮水般向四方铺开……（持续耗法力，约可维持 ${Math.round((this.hero.mp - 0.03) / this.senseDrain())} 息；${pressKey('sense', '菜单里再点「外放」')}收回）`); audio.sfx('whoosh');
    this.revealAround(false);
    this.updateUI();
  }
  senseWaveT = 0;
  /** 外放每秒耗法力：境界越高、外放越熟练越省 */
  senseDrain() {
    const a = this.hero.arts.find((x) => x.id === 'waifang'), lv = a ? profLevel(0, a.xp ?? 0) : 0;
    return 0.022 / (1 + Math.max(0, this.hero.realm - 1) * 0.3) * (1 - lv * 0.15);
  }
  endSenseBurst(msg: string) {
    if (this.senseBurstT <= 0) return;
    this.senseBurstT = 0; this.senseBurstCd = 3;
    this.toast(msg); this.updateUI();
  }
  /** 敛息：收敛气息与神识，半径 ×0.6，不易被他人神识察觉 */
  toggleConceal() {
    this.concealed = !this.concealed;
    if (this.concealed) this.senseBurstT = 0;
    this.toast(this.concealed ? '运转敛气诀，收敛周身气息。神识随之内收。' : '散去敛气诀，神识重新外放。');
    this.updateUI();
  }
  private updateSense(dt: number) {
    if (this.senseBurstT > 0) {
      const h = this.hero;
      h.mp = Math.max(0, h.mp - this.senseDrain() * dt);
      // 外放中每隔数息再荡出一圈神识涟漪
      this.senseWaveT += dt; if (this.senseWaveT > 4) { this.senseWaveT = 0; if (this.renderer) this.renderer.sense.burst = Math.max(this.renderer.sense.burst, 0.45); this.revealAround(false); }
      if (h.mp <= 0.03) this.endSenseBurst('法力不支，外放的神识被迫收回。');
    }
    if (this.senseBurstCd > 0) this.senseBurstCd -= dt;
    this.senseAlarm = Math.max(0, this.senseAlarm - dt * 0.5);
    // 险地：偶有更强神识扫过（敛息可避）
    this.scanTimer -= dt;
    if (this.scanTimer <= 0) {
      this.scanTimer = 18 + Math.random() * 20;
      const p = this.player;
      let danger = 0;
      for (const l of LOCATIONS) {
        const d = Math.hypot(l.x * WORLD_SCALE - p.x, l.y * WORLD_SCALE - p.y);
        if (d < 4000) danger = Math.max(danger, (l.danger ?? 0) - this.hero.realm + 1);
      }
      if (danger >= 2 && Math.random() < 0.25 + danger * 0.1) {
        if (this.concealed && Math.random() < 0.8) { this.toast('一道陌生神识自远处扫过，所幸你气息内敛，未被察觉。'); }
        else { this.senseAlarm = 1; if (this.renderer) this.renderer.sense.alarm = 1; this.toast('一股远胜于你的神识扫过此地，你被盯上了！', 'warn'); audio.sfx('fail'); }
      }
    }
  }
  get canFlyNative() { return REALMS[this.hero.realm].fly; }
  /** 是否正在飞行（筑基后可随时起落，不再强制凌空） */
  get isFlying() { return this.player.flying; }
  /** 祭出的遁具 / 靴子带来的速度倍率 */
  equipSpeed(kind: 'flight' | 'boots') { const id = this.hero.equip?.[kind]; return (id && itemDef(id).art?.mapSpeed) || 1; }
  get speed() {
    const base = REALMS[this.hero.realm].speed * (1 + C.mod(this.hero, 'mapSpeed'));
    const fl = this.equipSpeed('flight');
    if (this.player.flying && !this.canFlyNative) return (this.hero.equip?.flight ? Math.max(420, base * 1.8 * fl) : 420) * this.boostMul; // 体验御剑 / 炼气乘舟
    if (this.yuanying?.active) return base * 2.2 * this.boostMul;   // v0.53：元婴遁速
    if (this.isFlying) return base * 1.8 * fl * this.boostMul;
    return (this.player.running ? base * 1.6 : base) * this.equipSpeed('boots');
  }
  /** 遁光类别：云雷双翼 → 雷遁；血色披风 → 血光遁；其余 → 催动遁光 */
  get boostKind(): 'thunder' | 'blood' | 'light' {
    const q = this.hero.equip ?? {};
    // 云雷双翼（飞行位）→ 雷遁；血色披风（护甲位，古宝）→ 血光遁
    return q.flight === 'art_fenglei' ? 'thunder' : q.armor === 'art_xuepifeng' || q.flight === 'art_xuepifeng' ? 'blood' : 'light';
  }
  get boostMul() { if (!this.player.boosting) return 1; const k = this.boostKind; return k === 'thunder' ? 1.8 : k === 'blood' ? 1.7 : 1.55; }
  /** 催动遁光每秒耗法力 */
  get boostDrain() { const k = this.boostKind; return (k === 'thunder' ? 0.045 : k === 'blood' ? 0.032 : 0.026) / (1 + Math.max(0, this.hero.realm - 2) * 0.2); }
  get season() { const m = Math.floor(this.day / 30) % 12; return m < 3 ? 0 : m < 6 ? 1 : m < 9 ? 2 : 3; }
  /** 日光 0（子夜）–1（正午） */
  get light() { return 0.5 - 0.5 * Math.cos(2 * Math.PI * this.dayPhase); }
  /** 夜色 0–1 */
  get night() { return clamp((0.62 - this.light) / 0.5, 0, 1); }
  get dayPhase() { return (this.clock / DAY_CYCLE) % 1; }
  /** 修炼地加成 */
  placeBonus(): { mult: number; name: string } {
    const p = this.player;
    let mult = 1, name = '野外';
    const loc = this.nearbyLocation();
    if (loc?.type === 'sect') { mult = 1.2; name = loc.name; }
    else if (loc?.type === 'secret' || loc?.type === 'danger') { mult = 1.1; name = loc.name; }
    if (this.nodes.springNear(p.x, p.y)) { mult *= 2; name = '灵泉畔'; }
    // 第十八步：洞府 / 小灵脉
    if (this.home?.atHome(p.x, p.y)) { const hm = this.home.placeMult(); if (hm > mult) { mult = hm; name = this.ws.home!.name; } }
    else { const v = this.sites?.veinAt(p.x, p.y); if (v) { const q = this.sites.veinQ(v); if (q > mult) { mult = q; name = '小灵脉'; } } }
    // v0.53：聚灵阵
    { const wv = this.seabeast?.placeMult(p.x, p.y); if (wv && wv.mult > mult) { mult = wv.mult; name = wv.name; } }   // 收官 B2：鲸背的微弱灵脉
    const zj = this.zhenfa?.placeMul(p.x, p.y) ?? 1; if (zj > 1) { mult *= zj; name = name === '野外' ? '聚灵阵中' : `${name}·聚灵阵`; }
    return { mult, name };
  }

  // ---------- 打击感 ----------
  hitStop = 0; trauma = 0; hurtFlash = 0;
  /** v0.56：模组的全屏闪光（颜色 0–1，强度 a） */
  modFlash = { c: [1, 1, 1] as [number, number, number], a: 0 };
  /** 慢镜头（真实秒）：大招结算的一瞬 */
  slowT = 0;
  slowmo(sec: number) { this.slowT = Math.max(this.slowT, Math.min(0.6, sec)); }
  /** 色差冲击（0..1，自行衰减） */
  aberrKick = 0;
  /** 大招运镜：拉远并看向某处 */
  cine = { t: 0, dur: 0, z: 1, x: 0, y: 0, k: 0 };
  cinema(x: number, y: number, zMul: number, dur: number) { this.cine = { t: 0, dur, z: zMul, x, y, k: this.cine.k }; }
  get showPerf() { return prof.on; }
  set showPerf(v: boolean) { if (v && !prof.on) prof.reset(); prof.on = v; }
  perf = { frames: 0, acc: 0, upd: 0, ren: 0, fps: 0, updMs: 0, renMs: 0, worst: 0, worstMs: 0 };
  /** 顿帧（秒）与震屏（0..1 创伤值，叠加） */
  juice(stop: number, shake: number) {
    if (stop > 0) this.hitStop = Math.max(this.hitStop, Math.min(0.12, stop));
    if (shake > 0) this.trauma = Math.min(1, this.trauma + shake);
  }

  /** 调试/自动化：固定帧步长（0 = 实时）与帧计数 */
  debugFixedDt = 0; frameNo = 0; debugCamDX = 0;
  /** 追杀的触发：拍卖后尾随、险地游荡被盯上 */
  private pursuitTriggers(dt: number) {
    const h = this.hero, p = this.player, f = this.ws.flags;
    this.rel.feud.frame(dt);   // 恩怨重做：出村预警、追近了转追杀、城外守候时限、宗门巡山救援
    this.enyuan.frame(dt);     // 恩怨重做 · 第二批：宗门外交、口碑、生死斗、传音
    this.zhifa.frame(dt); this.laifang.frame(dt); this.dazi.frame(dt); this.duobao.frame(dt);   // 第三批：执法弟子追人、NPC 来找你、搭档、夺宝局
    if (h.realm < 2 || this.pursuit.active || this.day < 63) return;   // 恩怨重做：练气期不会被尾随、盯上（门槛提到筑基）
    const inZone = !!this.terrain.inLocZone(p.x, p.y, 600);
    // 拍卖会上露了富：出城后被尾随
    if (f.auctionMark !== undefined && !inZone) {
      const ago = this.day - (f.auctionMark as number);
      delete f.auctionMark;
      if (ago < 20 && !this.auction.tailLoser() && !(Math.random() < 0.5 && this.rel.tail())) { this.pursuit.cd = 0; this.pursuit.schedule({ reason: '拍卖会上露了富，出城不久便被人尾随', gap: Math.random() < 0.6 ? 1 : 0, delay: 4 + Math.random() * 6 }); }
    }
    // 险地游荡：身怀重宝时偶尔被更强者盯上
    this.roamPursuitT -= dt;
    if (this.roamPursuitT <= 0) {
      this.roamPursuitT = 45 + Math.random() * 30;
      if (inZone) return;
      const d = this.combat.dangerAt(p.x, p.y).d;
      const wealth = h.bag.reduce((s, b) => s + (itemDef(b.id).type === 'artifact' ? itemDef(b.id).price : 0), 0);
      // v0.64：炼气前中期身无长物，少有人惦记；真被盯上，多半也是同阶
      const green = h.realm <= 1 && h.stage < 8;
      const ch = Math.min(0.12, 0.012 * d + (wealth > 20000 ? 0.03 : 0)) * (green ? 0.5 : 1);
      if (Math.random() < ch) this.pursuit.schedule({ reason: d >= 2 ? '在险地被一道强横的神识扫中' : '身上宝光外泄，被过路修士盯上', gap: green ? (Math.random() < 0.3 ? 1 : 0) : d >= 2.5 && Math.random() < 0.3 ? 1 : Math.random() < 0.7 ? 1 : 0, delay: 1 });
    }
  }
  /** 调试：立刻被追杀 */
  debugPursuit(gap = 1) { this.pursuit.cd = 0; this.pursuit.reset(); this.pursuit.cd = 0; return this.pursuit.start({ reason: '调试', gap, force: true }); }
  /** 调试：直接给物品（走 addItem，触发获宝提示） */
  debugGive(id: string, n = 1) { C.addItem(this.hero, id, n); }
  /** 调试/自动化：在玩家周围刷怪 */
  debugSpawn(ids: string[], realm = this.hero.realm, stage = 3, dist = 320) {
    ids.forEach((id, i) => {
      const def = ENEMY_LIST.find((d) => d.id === id); if (!def) return;
      const a = i / ids.length * Math.PI * 2;
      const e = new Enemy(def, this.player.x + Math.cos(a) * dist, this.player.y + Math.sin(a) * dist * 0.6, realm, stage);
      this.combat.enemies.push(e);
    });
  }
  /** 调试：习得并施放 */
  /** 调试：越过境界 / 法宝限制直接施展（自动化截图用） */
  debugExec(id: string, lv = 3) {
    const c = this.combat as any, s = ARTS_ALL[id]; if (!s) return;
    const sr = c.reachSkill(s), a = c.aim(sr.range || 400);
    this.player.st.faceToward(a.dx, a.dy, false);
    c.exec(sr, lv, a, c.pStats.atk, c.pStats.realm);
  }
  debugCast(id: string) {
    if (!this.hero.arts.some((a) => a.id === id)) this.hero.arts.push({ id, xp: 0 });
    (this.combat as any).cds.delete(id); this.hero.mp = 1;
    this.combat.cast(id);
  }

  // ---------- 生命周期 ----------
  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new Renderer(this, canvas);
    try { const q = localStorage.getItem('taixu.quality'); if (q && q !== 'auto') this.renderer.setQuality(+q); } catch { /* */ }
    this.bindInput();
    this.revealAround(true);
    this.updateUI(true);
    this.running = true;
    this.living?.prewarm();
    this.last = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      // 自动化截图：固定步长，逐帧可控
      const rdt = this.debugFixedDt > 0 ? this.debugFixedDt : Math.max(0, Math.min(0.1, (t - this.last) / 1000));
      this.last = t; this.frameNo++;
      // 顿帧：命中瞬间时间几近停滞
      let dt = rdt;
      if (this.hitStop > 0) { this.hitStop -= rdt; dt = rdt * 0.05; }
      else if (this.slowT > 0) { this.slowT -= rdt; dt *= 0.3; }
      dt *= this.combat.brawl.worldK();   // 近战 E2：拼招期间整个世界放到 0.2 倍（平时恒为 1；拼招自己的倒计时按真实时间走）
      this.trauma = Math.max(0, this.trauma - rdt * 1.8);
      this.aberrKick = Math.max(0, this.aberrKick - rdt * 2.2);
      this.hurtFlash = Math.max(0, this.hurtFlash - rdt * 2.2);
      this.modFlash.a = Math.max(0, this.modFlash.a - rdt * 2.5);
      const u0 = performance.now();
      // v0.52.5：任何一帧抛错都不能让主循环死掉（死掉 = 黑屏 / 定格）。记录、恢复、继续下一帧。
      try { this.update(dt); } catch (err) { this.onFrameError('update', err); }
      const u1 = performance.now();
      if (!this.inCave) { try { this.renderer.render(dt); } catch (err) { this.onFrameError('render', err); } }
      const u2 = performance.now();
      // LOD 自适应：喂帧时间给全局偏置（掉帧时整体少画细节）
      LOD.noteFrame(u2 - u1);
      prof.endFrame(rdt * 1000);
      const pf = this.perf; pf.frames++; pf.acc += rdt; pf.upd += u1 - u0; pf.ren += u2 - u1; pf.worst = Math.max(pf.worst, rdt * 1000);
      if (pf.acc >= 0.5) { pf.fps = pf.frames / pf.acc; pf.updMs = pf.upd / pf.frames; pf.renMs = pf.ren / pf.frames; pf.worstMs = pf.worst; pf.frames = 0; pf.acc = 0; pf.upd = 0; pf.ren = 0; pf.worst = 0; }
      if (this.renderer.stage) this.renderer.stage.gpuTiming = this.showPerf;
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private onFrameError(where: string, err: unknown) {
    this.renderErrs++;
    console.error(`[taixu] ${where} 帧异常 #${this.renderErrs}`, err);
    if (this.renderErrs === 1 || this.renderErrs % 300 === 0) this.toast('画面出了点岔子，已自动恢复。若反复出现请反馈（F12 控制台有详情）。', 'warn');
    try { this.combat.fade = 0; this.hitStop = 0; this.slowT = 0; this.renderer?.resetStill(); } catch { /* */ }
  }
  /** v0.52.5：进洞府——切到独立场景；v0.52.6 起失败必有回话，不再静默什么都不发生 */
  enterCave() {
    if (this.mijing?.active) { this.toast('身在秘境，回不得洞府。', 'warn'); return; }
    if (this.inCave) { this.leaveCave(); return; }   // 状态残留时先自愈，避免「再也进不去」
    const h = this.ws.home;
    if (!h) { this.toast('你还没有洞府。神识中寻到「灵脉」，便可开辟洞府。', 'info'); return; }
    if (h.map !== ACTIVE_MAP) { this.toast(`${h.name}不在此地域。`, 'warn'); return; }
    const d = Math.hypot(h.x - 30 - this.player.x, h.y - 60 - this.player.y);
    if (d > 360) { this.toast(`离${h.name}还远（约 ${Math.max(1, Math.round(d / 30))} 丈），再走近些。`, 'info'); return; }
    if (this.combat.inCombat) { this.toast('激战正酣，顾不上进洞府。', 'warn'); return; }
    if (this.yuanying.active) this.yuanying.back('leave');
    const p = this.player;
    this.stand(); this.destination = null; this.gathering = null; this.pendingGather = null; this.pendingTalk = null;
    if (p.flying) p.flying = false;
    this.input.keys.clear(); this.input.mouse.t = -99; this.input.joy.x = 0; this.input.joy.y = 0; this.input.joyMag = 0;
    this.inCave = true;
    this.towns?.onVisit?.('home');
    audio.sfx('open');
    this.onCave?.(true);
  }
  /** 出洞府：回到门口，并把渲染器的残留状态清干净 */
  leaveCave() {
    if (!this.inCave) return;
    this.inCave = false;
    const h = this.ws.home;
    if (h && h.map === ACTIVE_MAP) this.teleport(h.x - 30, h.y + 60);
    this.player.flying = false; this.player.sitting = false; this.player.moving = false;
    this.combat.fade = 0; this.hitStop = 0; this.slowT = 0;
    this.input.keys.clear();
    this.renderer?.resetStill();
    this.onCave?.(false);
    this.updateUI(true);
  }
  /** I：与同行伴侣交谈（不再与 T 抢键） */
  talkLover() {
    const f = this.hearts.follower();
    if (!f) { this.toast('身边没有同行的伴侣。', 'info'); return; }
    let a: any = null; for (const x of this.npcs.active.values()) if (x.d.beauty === f.id) { a = x; break; }
    this.hearts.talk(f.id, a);
  }
  /** U：灵宠在旁则逗弄，否则打开灵宠名册 */
  talkPet() {
    if (!this.ws.pets.length) { this.toast('你还没有灵宠。兽巢里的灵卵可以孵化。', 'info'); return; }
    if (this.pets.active && (this.inCave || this.pets.ent)) { if (!this.pets.interact()) this.openDialog(this.pets.menuNode()); }
    else this.openDialog(this.pets.menuNode());
  }
  detach() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.unbind?.();
    this.renderer?.dispose();
    this.save(0);
  }

  // ---------- 主更新 ----------
  update(dt: number) {
    // v0.52.5：人在洞府场景里——禁制护身，不吃移动输入；摇杆 / 鼠标残留一并清零
    if (this.inCave) { this.combat.invulnT = Math.max(this.combat.invulnT, 1); this.input.joy.x = 0; this.input.joy.y = 0; this.input.joyMag = 0; this.destination = null; this.input.mouse.active = false; }
    this.time += dt;
    if (this.toastDeferred.length) this.toastTick();   // r14-toast：打完了补弹压着的闲讯
    this.terrain.frame++;
    syncHeroArms(this);
    this.nuoyi.update(dt);
    this.tutorial.tick(dt);   // 收官 I：新手引导（暂停、开着面板时也走——储物袋那一步要在面板里教；自己包着 try，出错不影响主循环）
    if (this.hero.dead) { if (this.xukong.active || this.xukong.fight.on) { this.xukong.fight.finish('down'); this.xukong.reset(); } } else if (!this.paused && !this.modal) this.xukong.update(dt);
    if (this.hero.dead && this.dunkong.active) this.dunkong.reset();
    if (this.mods && !this.paused && !this.hero.dead) this.mods.tick(dt);
    if (this.visitQ && !this.modal && !this.paused && !this.hero.dead) { const n = this.visitQ; this.visitQ = null; audio.sfx('chime'); this.openDialog(n); }
    if (!this.halted) this.promoCheck(dt);
    if (!this.halted && !this.hero.dead) { const _s = prof.t(); this.updateSense(dt); prof.add('U·神识', _s); }
    const p = this.player, st = p.st, h = this.hero;
    // 高空：飞行时缓缓升高，疾遁时更高——镜头随之拉远
    const altT = this.dunkong.cruising ? 1.5 : this.player.flying ? (this.player.boosting || this.dunkong.active ? 1 : this.player.moving ? 0.5 : 0.3) : 0;   // 遁空疾行时飞得最高、镜头拉得最远
    this.alt += (altT - this.alt) * Math.min(1, dt * (altT > this.alt ? 0.7 : 1.6));
    // 战斗取景：锁定的敌人远在投放距离边缘时，镜头略微拉远并偏向对方，保证双方同在画面中
    {
      const c = this.combat, R = c.reach;
      let tg = c.lock && !c.lock.dead && Math.hypot(c.lock.x - p.x, c.lock.y - p.y) < R * 1.1 ? c.lock : null;
      if (!tg) { let bd = R; for (const e of c.enemies) { if (e.dead || !e.aggro || e.spar) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; tg = e; } } }
      let fz = 1, lx = 0, ly = 0;
      // r11-lock：锁定跟随（设置里可关）：焦点取你和锁定目标连线上靠你的一点，弹簧跟；关掉时照原来的写法
      const lc = lockCamSetting.on ? this.lockCam.target(this) : null;
      // 疾速赶路（御空 1.8×、催动遁光更高）时不做战斗取景：地跑是 1.6×base，取景按 1.9×base 起收
      // 沿途妖兽不断进入锁敌半径又被甩开，取景目标一换，镜头就被推回去一下——
      // 看着像人物"倒退一下"，其实位置/骨骼都不回退，动的是镜头。
      const base = REALMS[h.realm].speed;
      const fw = clamp((base * 1.9 - st.speed) / (base * 0.35), 0, 1);
      if (lockCamSetting.on) { if (lc) { fz = lc.fz; lx = lc.x; ly = lc.y; } }
      else if (tg && !this.halted && fw > 0.01) {
        const dx = tg.x - p.x, dy = tg.y - 40 - p.y, LEAN = 0.32;
        const W = (typeof window !== 'undefined' && window.innerWidth) || 1280, H = (typeof window !== 'undefined' && window.innerHeight) || 800;
        const zNeed = Math.min(W * 0.4 / Math.max(1, Math.abs(dx) * (1 - LEAN)), H * 0.34 / Math.max(1, Math.abs(dy) * (1 - LEAN)));
        const z0 = Math.max(this.minZoom, this.cam.targetZoom * (1 - 0.3 * this.alt));
        fz = 1 + (clamp(Math.max(0.42, zNeed) / z0, 0.5, 1) - 1) * fw;
        lx = dx * LEAN * fw; ly = dy * LEAN * fw;
      }
      // 大招运镜
      const cn = this.cine; cn.t += dt;
      const cOn = cn.t < cn.dur ? 1 : 0; cn.k += (cOn - cn.k) * Math.min(1, dt * (cOn ? 4 : 2));
      if (cn.k > 0.002) { fz *= 1 + (cn.z - 1) * cn.k; lx += (cn.x - p.x) * 0.5 * cn.k; ly += (cn.y - 40 - p.y) * 0.5 * cn.k; }
      const k = Math.min(1, dt * 2.2);
      this.camFrameZ += (fz - this.camFrameZ) * k;
      if (lockCamSetting.on) { const L = this.lockCam; if (!this.lockCamOn) L.sync(this.camLeanX, this.camLeanY); L.spring(lx, ly, dt); this.camLeanX = L.x; this.camLeanY = L.y; }
      else { this.camLeanX += (lx - this.camLeanX) * k; this.camLeanY += (ly - this.camLeanY) * k; }
      this.lockCamOn = lockCamSetting.on;
    }
    // 飞得越高，镜头再拉远一点（高空最多再远两成半）
    const zT = Math.max(this.minZoom, this.cam.targetZoom * (1 - 0.3 * this.alt) * (1 - Math.min(0.25, Math.max(0, this.player.z - ALT.lowMax) / 1200)) * this.camFrameZ);
    this.cam.zoom += (zT - this.cam.zoom) * Math.min(1, dt * (Math.abs(zT - this.cam.targetZoom) > 0.01 ? 3 : 10));
    { const xz = this.xukong.worldZoom; if (xz) this.cam.zoom = xz; }   // 往天外升降的那一段：镜头远近随高度走
    // HD2D 转镜头：0.3 秒左右平滑转到目标朝向（目标可以超过一圈，按差值走，不会绕远路）
    if (this.camYaw !== this.camYawTarget) { const d = this.camYawTarget - this.camYaw; this.camYaw = Math.abs(d) < 0.002 ? this.camYawTarget : this.camYaw + d * Math.min(1, dt * 9); }
    const active = !this.halted && !h.dead;
    if (active) {
      // 移动输入
      let mx = 0, my = 0;
      const k = this.input.keys;
      if (k.has('w') || k.has('arrowup')) my -= 1;
      if (k.has('s') || k.has('arrowdown')) my += 1;
      if (k.has('a') || k.has('arrowleft')) mx -= 1;
      if (k.has('d') || k.has('arrowright')) mx += 1;
      mx += this.input.joy.x; my += this.input.joy.y;
      // B 版 HD2D：方向键是「屏幕方向」，按相机方位转成世界方向（正北视角时不变）
      if (this.renderer?.hd && this.camYaw && (mx || my)) { const c = Math.cos(this.camYaw), s = Math.sin(this.camYaw); const wx = mx * c - my * s, wy = mx * s + my * c; mx = wx; my = wy; }
      // 手动接管：自动寻路作废（并在有名字时告知玩家，免得以为导航坏了）
      if (mx || my) {
        if (this.destination?.name) this.toast(`已取消导航：${this.destination.name}`, 'info');
        this.destination = null; this.pendingGather = null; this.pendingTalk = null;
      }
      // v0.52.4 手机：点了某人就一路跟过去，到跟前自动开口
      if (!mx && !my && this.pendingTalk) {
        const a = this.npcs.active.get(this.pendingTalk);
        if (!a || !a.d.alive || a.enemy) this.pendingTalk = null;
        else if (this.npcs.focus === a) { this.pendingTalk = null; this.destination = null; if (!this.stall.arrive(a)) this.interact(); }   // 收官 D：点招牌走过来的，到了开摊位
        else this.setDestination(a.st.x, a.st.y + 34);
      }
      if (!mx && !my && this.destination) {
        const dx = this.destination.x - p.x, dy = this.destination.y - p.y, d = Math.hypot(dx, dy);
        if (d < 24 || (this.pendingGather && Math.hypot(this.pendingGather.x - p.x, this.pendingGather.y - p.y) < GATHER_RANGE * 0.8)) {
          const arrived = this.destination.name;
          this.destination = null;
          if (arrived) this.toast(`已到达：${arrived}`, 'good');
          if (this.pendingGather) { this.pendingGather = null; this.tryGather(); }
        }
        else {
          // 收官 P8：直着走会被殿前月台的台沿、屋墙挡住的，先走到途经点（台阶口、门洞），见 indoor.steer
          const via = this.isFlying || this.mijing.active ? null : this.indoor.steer(this.destination);
          if (via) { const vx = via[0] - p.x, vy = via[1] - p.y, vd = Math.hypot(vx, vy) || 1; mx = vx / vd; my = vy / vd; }
          else { mx = dx / d; my = dy / d; }
        }
      }
      // 遁空：蓄势时悬停、可以转向；疾行与收势时沿航向直冲，方向键（或点过的去处）只是把航向带过去
      const dk = this.dunkong;
      dk.update(dt);
      if (dk.active) { dk.steer(mx, my, dt); if (dk.phase === 'charging') { mx = 0; my = 0; } else { mx = Math.cos(dk.heading); my = Math.sin(dk.heading); } }
      if (!this.combat.canMove || this.tianxiang.active) { mx = 0; my = 0; }
      const len = Math.hypot(mx, my);
      const wantMove = len > 0.05;
      if (wantMove && p.sitting) this.stand();
      if (wantMove && this.gathering) { this.gathering = null; }
      // v0.52.4：手机摇杆推到底（joyMag > 0.86）自动疾行，另有「疾行」按钮常开
      // 移植版 530843f 兜底：某项事件丢失时 joy 向量模长同样判定疾行
      const wantRun = k.has('shift') || this.input.run || this.input.joyMag > 0.86
        || Math.hypot(this.input.joy.x, this.input.joy.y) > 0.86;
      p.running = wantRun && !this.isFlying;
      const wantBoost = wantRun && this.isFlying && wantMove && !dk.active;   // 遁空与遁光加速互斥
      if (wantBoost && !p.boosting && h.mp > 0.06) { p.boosting = true; audio.sfx(this.boostKind === 'thunder' ? 'thunder' : 'whoosh'); }
      else if (!wantBoost || h.mp <= 0.01) { if (p.boosting && h.mp <= 0.01) this.toast('法力枯竭，遁光一黯。', 'warn'); p.boosting = false; }
      if (p.boosting) {
        h.mp = Math.max(0, h.mp - this.boostDrain * dt);
        this.boostSfxT -= dt; if (this.boostSfxT <= 0 && this.boostKind === 'thunder') { this.boostSfxT = 0.9 + Math.random() * 0.6; audio.sfx('thunder'); }
      }
      // 桥面只认「人在桥面高度附近」：先把上一刻的绝对高度告诉地表（见 surface.ts 的 deckRef）
      { const S = this.terrain.surface; S.deckRef = this.deckAbs ?? NaN; this.deckAbs = S.heightAt(p.x, p.y) + (p.z ?? 0); }
      p.moving = wantMove;
      let vx = 0, vy = 0;
      if (p.moving) {
        if (len > 1) { mx /= len; my /= len; }
        if (Math.abs(mx) > 0.15) p.facing = mx > 0 ? 1 : -1;
        const MJ = this.mijing.active, VF = this.xukong.fight.on;
        const wdK = this.isFlying || MJ ? 0 : this.combat.ni.waterK(p.x, p.y);   // 水遁：沧浪遁（江河）/ 覆海游（海）
        const factor = this.isFlying || MJ ? 1 : wdK || this.terrain.walkFactor(p.x, p.y) || 1;
        const sp = this.speed * factor * this.combat.speedMul * dk.speedMul * this.jueyu.speedMul;   // 绝域：泅水只有三成半的速度
        const ox = p.x, oy = p.y;
        const B = this.bounds;
        const nx = MJ || VF ? p.x + mx * sp * dt : clamp(p.x + mx * sp * dt, B.x0, B.x1), ny = MJ || VF ? p.y + my * sp * dt : clamp(p.y + my * sp * dt, B.y0, B.y1);
        this.travel.dir.x = mx; this.travel.dir.y = my;
        // 第二十二步：屋舍城墙挡路（已身陷其中时放行，便于走出）
        const S = this.space, free = this.isFlying || S.blocked(p.x, p.y);
        const okAt = (x: number, y: number) => MJ ? (this.isFlying ? this.mijing.inBound(x, y) : this.mijing.walk(x, y)) : (this.terrain.walkFactor(x, y) > 0 || this.combat.ni.waterOk(x, y)) && this.terrain.canTraverse(p.x, p.y, x, y) && (free || !S.blocked(x, y));
        if ((this.isFlying && !MJ) || (!MJ && this.jueyu.freeAt(nx, ny)) || okAt(nx, ny)) { p.x = nx; p.y = ny; }   // 绝域：泅水时水里也能游；站在鲸背上能在背上走（收官 B2）
        else if (nx !== p.x && okAt(nx, p.y)) { p.x = nx; }
        else if (ny !== p.y && okAt(p.x, ny)) { p.y = ny; }
        else if (MJ) { this.destination = null; }
        else {
          this.destination = null;
          if (this.blockedTimer <= 0) {
            const reason = this.terrain.walkFactor(nx, ny) <= 0 ? '前方是茫茫大海，需御器飞行或寻找传送阵、渡船。' : !this.terrain.canTraverse(p.x, p.y, nx, ny) ? '前方山坡过陡，寻找山路或御器飞越。' : '前方道路受阻。';
            this.toast(reason, 'warn');
            this.blockedTimer = 6;
          }
        }
        p.moving = p.x !== ox || p.y !== oy;
        vx = (p.x - ox) / Math.max(dt, 1e-4); vy = (p.y - oy) / Math.max(dt, 1e-4);
        if (p.moving) p.walkT += dt * (this.isFlying ? 1 : factor);
        st.faceToward(mx, my, false);
      }
      this.blockedTimer -= dt;
      this.combat.brawl.playerTick(dt);   // 近战：主角被打飞时的外力位移
      this.seamTick();
      this.jueyu.tick(dt);   // 绝域：分带、天象、灵力流失
      // 动作状态机
      st.x = p.x; st.y = p.y; st.vx = vx; st.vy = vy; st.speed = Math.hypot(vx, vy);
      st.windX = this.weather.wind * 30; st.windY = 0;
      this.altitudeTick(dt);
      // 步态写进 st：否则只有上半身有动作（走路时腿不摆）
      st.gait = p.moving ? (p.running ? 'run' : 'walk') : null;
      this.cruiseTick(dt);   // 御剑巡航高度：画面上不再贴着脚下每一处起伏（见 cruiseTick）
      if (this.isFlying) { st.setAction(this.combat.brawl.action() ?? 'fly'); st.gait = null; st.lift = p.z + this.combat.brawl.playerLift + this.cruiseLift; }   // 近战：空中出拳、被打飞也要有动作
      else {
        st.lift = p.z + this.combat.brawl.playerLift + this.jueyu.sink + this.cruiseLift;   // cruiseLift：刚落下遁光时从巡航高度平滑落回地面   // 近战：在地上被打飞时那一段弧线；绝域：泅水时立板沉到水线（地面把下半截挡住）
        // 先定下这一帧的最终动作再设一次（参照重构版）。原先先设基础动作、再被施法覆盖，
        // 动作在「走 / 施法」之间每帧来回切：actionT 恒为 0、施法动作播不出来，castN 每帧 +1 导致施法四式乱跳。
        const ov = this.combat.actionOverride(p.moving);   // r12-anim：自己在走时挨打照常走跑
        // 每一次真正起手施法都打断上一式手势：castSeq 变化时强制重播 cast
        if (ov === 'cast' && this.combat.castSeq !== this.lastCastSeq) {
          this.lastCastSeq = this.combat.castSeq;
          st.castPose();
        } else if (ov) st.setAction(ov);
        else st.setAction(this.gathering ? 'gather' : p.sitting ? 'sit' : this.jueyu.underwater || this.jueyu.swimming ? 'swim' : p.moving ? (p.running ? 'run' : 'walk') : 'idle');   // 收官 B4：水下、泅水时划水
      }
      let _t = prof.t(); this.combat.update(dt); prof.add('U·战斗', _t);
      const MJ2 = this.offWorld, VF2 = this.xukong.fight.on;
      _t = prof.t(); this.hanshan.tick(dt); prof.add('U·撼山客', _t);   // r7：撼山客（自己判断在不在南荒、在不在界外）
      _t = prof.t(); this.yewushe.tick(dt); prof.add('U·夜无赦', _t);   // r16：噬魂魔尊（自己判断降临没有、在不在界外）
      _t = prof.t(); if (!MJ2) { this.pursuit.update(dt); this.pursuitTriggers(dt); } prof.add('U·追杀', _t);
      _t = prof.t(); if (!VF2) { this.npcs.update(dt); this.stall.tick(dt); this.indoor.update(dt); } prof.add('U·NPC', _t);   // 收官 D：摆摊（stall.tick）   // 虚空斗法：同伴、行人都留在界内，不来追人
      _t = prof.t(); this.rel.update(dt); this.roster.update(dt); this.garrison.update(dt); this.war.update(dt); this.sectwar.update(dt); prof.add('U·人脉名册大战', _t);
      _t = prof.t(); if (!MJ2) { this.travel.update(dt); this.events.update(dt); this.story.update(dt); } prof.add('U·事件剧情', _t);
      _t = prof.t(); if (!MJ2) { this.landmarks.update(dt); this.sites.update(dt); this.home.update(dt); this.happen.update(dt); this.daoxin.update(dt); this.pianju.update(dt); } this.jianghu.tick(dt); if (!VF2) this.pets.update(dt); this.heartx.update(dt); prof.add('U·名地遗府奇遇', _t);
      _t = prof.t(); this.shentong.update(dt); this.yuanying.update(dt); this.tickYingEscape(dt); this.zhenfa.update(dt); this.shen.update(dt); if (!MJ2) { this.friends.update(dt); this.zhongsheng.update(dt); } this.mijing.update(dt); this.huajuan.update(dt); prof.add('U·神通阵法', _t);
      // 采集
      if (this.gathering) {
        this.gathering.t += dt;
        if (this.gathering.t >= GATHER_TIME) this.finishGather();
      }
      this.gatherScan -= dt;
      if (this.gatherScan <= 0) { this.gatherScan = 0.15; this.gatherTarget = this.isFlying || MJ2 ? null : this.nodes.nearest(p.x, p.y, GATHER_RANGE, this.day); }
      // 光阴流逝
      this.timeScale = p.sitting ? TUNING.meditateSpeed : 1;
      const days = dt * TUNING.daysPerSec * this.timeScale;
      this.day += days;
      this.ws.play = (this.ws.play ?? 0) + dt;   // 恩怨重做：累计游玩秒数（随存档；冷却按它和天数两个都到了才解除）
      this.mysect.sync();
      this.relAcc += days; if (this.relAcc >= 0.5) { const _d = prof.t(); this.rel.daily(this.relAcc); this.jianghu.daily(this.relAcc); this.roster.daily(this.relAcc); this.garrison.daily(this.relAcc); this.war.daily(this.relAcc); this.orig.daily(this.relAcc); this.daoxin.daily(this.relAcc); this.pianju.daily(this.relAcc); this.friends.daily(this.relAcc); this.mijing.daily(this.relAcc); this.mysect.daily(this.relAcc); this.sectwar.daily(this.relAcc); this.wanbao.daily(); this.auction.daily(); this.fellows.daily(); this.enyuan.daily(this.relAcc); this.zhifa.daily(); this.laifang.daily(); this.duobao.daily(); this.hanshan.daily(); this.yewushe.daily(); this.mods?.day(this.relAcc); this.relAcc = 0; prof.add('U·日结算', _d); }
      const msgs: Msg[] = [];
      const hadTalent = !!h.pendingTalent;
      const expB = this.hearts.bonus('exp'), e0 = h.exp;
      const mp0 = h.mp;
      C.passDays(h, days, p.sitting, this.placeBonus().mult, msgs);
      if (this.senseBurstT > 0 || p.boosting || this.dunkong.active) h.mp = Math.min(h.mp, mp0);   // 神识外放 / 催动遁光 / 遁空（蓄势到收势）期间法力不回
      if (expB > 0 && h.exp > e0) h.exp += (h.exp - e0) * expB;
      const rg = this.hearts.bonus('regen'); if (rg > 0 && !this.combat.inCombat) { h.hp = Math.min(1, h.hp + rg * 0.01 * dt); h.mp = Math.min(1, h.mp + rg * 0.01 * dt); }
      this.jueyu.manaTick(dt);   // 绝域：这一帧回上来的法力按带打折、再按境界流失（放在一切自然回气之后）
      this.flushMsgs(msgs);
      if (!hadTalent && h.pendingTalent) { this.stand(); this.onPanel?.('char', true); }
      if (p.sitting && C.bottleneck(h) !== 'none' && !this.bnWarned) {
        this.bnWarned = true;
        this.toast(C.bottleneck(h) === 'major' ? `修为已臻${realmName(h.realm, h.stage)}圆满，可尝试冲击${REALMS[h.realm + 1]?.name ?? ''}（${keyOr('char', '菜单 →')} 角色面板）。` : `修为已至瓶颈，需服丹冲关方能更进一步（${keyOr('char', '菜单 →')} 角色面板）。`, 'warn');
      }
      if (C.bottleneck(h) === 'none') this.bnWarned = false;
      if (h.dead) { this.stand(); this.updateUI(true); try { localStorage.removeItem(SLOT_KEYS[0]); } catch { /* */ } this.daoxin.onAgeDeath(); }
      if (!MJ2) { const _r = prof.t(); this.revealAround(false); prof.add('U·探索迷雾', _r); }
    }
    this.clock += dt * (active ? (p.sitting ? 2.5 : 1) : 0.2);
    let _u = prof.t(); st.update(dt * this.combat.brawl.animK); prof.add('U·主角骨骼', _u);   // 近战顿帧：人物定格
    // 天气 / 生灵
    _u = prof.t();
    const s = this.terrain.sample(p.x, p.y);
    this.weather.update(dt, { cold: s.cold, arid: s.arid, sea: !this.terrain.isLand(p.x, p.y) || s.land < 0.6, season: this.season });
    prof.add('U·天气', _u); _u = prof.t();
    if (this.renderer && !this.offWorld) {
      const v = this.renderer.viewRect();
      this.life.update(dt, this, v, this.night, this.season, this.weather.kind);
      this.scenery.update(dt, this, v);
    }
    prof.add('U·生灵', _u);
    // 第四十六步：突破天象
    this.tianxiang.update(dt, this);
    // 相机跟随
    // 遁空疾行时镜头不能落在后面：补上跟随的滞后（速度 ÷ 跟随率），再往前多看一截
    const dkK = this.dunkong.k, dkLead = dkK > 0.01 ? st.speed / 6 * 0.94 * Math.min(1, dkK * 2) + 300 * dkK : 0;
    const dkX = Math.cos(this.dunkong.heading) * dkLead, dkY = Math.sin(this.dunkong.heading) * dkLead;
    if (!this.combat.brawl.cameraTick(dt)) {   // 近战期间镜头由它接管（两人同框），否则照常跟随
      this.cam.x += (p.x + this.debugCamDX + this.camLeanX + dkX - this.cam.x) * Math.min(1, dt * 6);
      this.cam.y += (p.y - st.lift * this.jueyu.camLiftK + this.camLeanY + dkY - this.cam.y) * Math.min(1, dt * 6);   // 收官 B4：站在鬼船甲板、船上时镜头跟人的全高（jueyu.camLiftK）
    }

    _u = prof.t(); if (!this.offWorld) this.space.update(dt, p.x, p.y); prof.add('U·屋舍碰撞', _u);
    this.regionTimer -= dt;
    if (this.regionTimer <= 0 && this.offWorld) { this.regionTimer = 0.35; if (!this.halted) this.hintTick(); }
    if (this.regionTimer <= 0) { _u = prof.t(); this.regionTimer = 0.35; this.fellows.tick(); if (!this.halted && Math.random() < 0.012) this.fellows.ambush(); this.checkRegion(); this.exploreCheck(this.nearbyLocation()); this.townAutoZoom(); if (!this.halted) this.hintTick(); prof.add('U·区域检测', _u); }
    this.uiTimer -= dt;
    // HUD 刷新率：0.18s（约 5.5Hz）足够看，原来 0.12s 会让整棵 React HUD 每秒重渲染八次，
    // 在低端机上这部分布局/绘制开销并不小
    if (this.uiTimer <= 0) { _u = prof.t(); this.uiTimer = 0.18; this.updateUI(); prof.add('U·界面刷新', _u); }
    this.saveTimer += dt;
    if (this.saveTimer > 20) { this.saveTimer = 0; this.autoSaveIdle(); }
    _u = prof.t(); audio.tick(this, dt); prof.add('U·声音', _u);
  }
  private bnWarned = false;

  private flushMsgs(msgs: Msg[]) {
    for (const m of msgs) {
      this.toast(m.text, m.kind === 'warn' ? 'warn' : m.kind === 'good' ? 'good' : 'info');
      if (m.text.includes('晋入') || m.text.includes('成矣')) audio.sfx('break');
    }
  }

  // ---------- 第二步操作 ----------
  toggleSit() {
    const p = this.player;
    if (this.hero.dead) return;
    if (p.sitting) { this.stand(); return; }
    if (this.yuanying?.active) { this.toast('元婴在外，肉身已在打坐。（再按出窍键归窍）', 'info'); return; }
    if (this.isFlying) {
      if (!this.canLand()) return;
      p.flying = false; audio.sfx('land');   // 自动按下遁光，落地打坐
    }
    this.gathering = null; this.destination = null;
    p.sitting = true;
    const pl = this.placeBonus();
    this.toast(`盘膝打坐，运转${C.gongfaDef(this.hero).name}……（光阴流速 ×${TUNING.meditateSpeed}${pl.mult > 1 ? `，${pl.name}灵气充沛 ×${pl.mult.toFixed(1)}` : ''}）`);
    audio.sfx('chime');
  }
  stand() { if (this.player.sitting) { this.player.sitting = false; } }
  /** 第十八步：一次性度过若干日（参悟、双修、掩埋……） */
  passDays(n: number) { const msgs: Msg[] = []; C.passDays(this.hero, n, false, 1, msgs); this.day += n; this.flushMsgs(msgs.filter((m) => m.kind)); }
  /** 第十八步：地图上的通用标记（世界坐标） */
  mapMarks(): { x: number; y: number; glyph: string; color: string; ring?: number; name: string }[] {
    const out: { x: number; y: number; glyph: string; color: string; ring?: number; name: string }[] = [...this.friends.marks(), ...this.mijing.marks(), ...this.renxin.marks(), ...this.jianghu.marks(), ...this.daoxin.marks(), ...this.pianju.marks(), ...this.sites.marks(), ...this.happen.marks(), ...this.heartx.marks(), ...this.landmarks.marks(), ...this.combat.lairMarks(), ...this.war.marks(), ...this.hanshan.marks(), ...this.yewushe.marks(), ...this.sectwar.marks()];
    // v0.52.9：洞府没探明时也给个「府」标（以前只靠剧情推开才看得见），并带「可进府」提示
    out.push(...this.rel.feud.marks());
    out.push(...this.enyuan.marks());   // 恩怨重做 · 第二批：通缉犯、生死斗   // 恩怨重做：追杀者的搜捕范围
    const h = this.ws.home; if (h && h.map === ACTIVE_MAP) out.push({ x: h.x, y: h.y, glyph: '府', color: '#ffd890', name: `${h.name}（走近按 ${IS_TOUCH ? '互动' : keyLabel(bindOf('interact'))} 进府）` });
    const gd = this.guide; if (gd && gd.map === ACTIVE_MAP) out.push({ x: gd.x, y: gd.y, glyph: '指', color: '#9fe8ff', ring: 320, name: '指路：' + gd.name });
    // v0.52.5：宗门「猎杀 / 除魔」任务——已探明区域里离你最近的目标怪，打一个醒目的「任」字（小地图同样可见）
    // v0.52.9：所有宗门任务（猎杀 / 采集 / 巡查）都标「任」字；已达成的指向回宗门交差
    const s = this.ws.sect;
    if (s) for (const tk of s.tasks) {
      if (tk.until < this.day) continue;
      const have = Math.max(0, this.towns.taskProgress(tk)), done = have >= tk.need;
      const w = this.towns.taskWhere(tk);
      if (w.x === undefined || w.y === undefined) continue;
      out.push({ x: w.x, y: w.y, glyph: '任', color: done ? '#8fe08f' : '#ffd040', ring: done ? 200 : 260, name: `宗门任务：${tk.text}（${have}/${tk.need}）` });
    }
    // v0.56：模组任务
    if (modx) for (const q of modx.quests()) if (q.x !== undefined && q.y !== undefined && !q.done) out.push({ x: q.x, y: q.y, glyph: '任', color: '#c8a0ff', ring: 240, name: `${q.title}${q.need ? `（${q.have ?? 0}/${q.need}）` : ''}` });
    return out;
  }

  // ------------------------------------------------------------ 第三十八步：中期节奏
  /** 「指路」标记：大事记里点一下，地图与小地图上出现青色「指」字，走近自动消失 */
  guide: { x: number; y: number; name: string; map: string } | null = null;
  setGuide(x: number, y: number, name: string) {
    const p = this.player;
    this.guide = { x, y, name, map: ACTIVE_MAP };
    this.toast(`已指路：${name}——在${dirName(x - p.x, y - p.y)}方约 ${Math.round(Math.hypot(x - p.x, y - p.y) / 30)} 丈（地图上青色「指」字）`, 'info');
  }
  /** 大事记第三栏「眼下机缘」：此刻能做、值得做的事 */
  chances(): { t: string; d: string; x?: number; y?: number; hot?: boolean; tone?: string }[] {
    const out: { t: string; d: string; x?: number; y?: number; hot?: boolean; tone?: string }[] = [...this.renxin.chances(), ...this.jianghu.chances(), ...this.daoxin.chances(), ...this.pianju.chances()];
    const f = this.ws.flags as any, p = this.player, day = this.day;
    const far = (x: number, y: number) => this.mijing.active ? '界外' : `${dirName(x - p.x, y - p.y)}方约 ${Math.round(Math.hypot(x - p.x, y - p.y) / 30)} 丈`;   // 第五轮返工：人在秘境里，外界的方位、距离不算
    // 大夺宝
    const gc = this.happen.great.chance(); if (gc) out.push(gc);
    const yc = this.yewushe.chance(); if (yc) out.push(yc);   // r16：噬魂魔尊降临
    // 异宝（小夺宝）
    const hd = f.herald;
    if (hd && !hd.done && hd.day + 45 > day) {
      const left = Math.max(1, Math.ceil(hd.day + 45 - day));
      if (hd.map === ACTIVE_MAP) out.push({ t: '小夺宝·异宝出世', d: `${far(hd.x, hd.y)}，宝光冲天。${left} 日内无人取走，便会落入${hd.rival}之手。`, x: hd.x, y: hd.y, hot: true, tone: 'gold' });
      else out.push({ t: '异宝出世', d: `${MAP_NAME[hd.map as MapId] ?? '别处'}有异宝出世，余 ${left} 日。`, tone: 'gold' });
    } else if (f.heraldNext && f.heraldNext > day) {
      const m = Math.max(1, Math.round((f.heraldNext - day) / 30));
      out.push({ t: '宝光隐现', d: m <= 2 ? '近来天边时有宝光一闪——异宝怕是就要出世了。' : `散修们说，约莫 ${m} 个月后会有异宝出世。` });
    }
    // 宗门
    const s = this.ws.sect;
    if (s) {
      const L = LOC_BY_ID.get(s.id), pr = this.towns.promoteReq(), nx = SECT_RANKS[s.rank + 1];
      const here = locHere(s.id);
      const months = Math.floor((day - s.lastPay) / 30), pay = months > 0 ? months * [10, 25, 60, 150, 400][s.rank] : 0;
      let d = `${SECT_RANKS[s.rank]} · 贡献 ${s.contrib}`;
      if (pr.ok) d += `。可回山门晋升为「${nx}」！`;
      else if (nx) d += `。晋升「${nx}」：${pr.why}`;
      if (pay) d += `。可领俸禄 ${pay} 灵石`;
      out.push({ t: (L?.name ?? '宗门') + (pr.ok ? ' · 可晋升' : ''), d, x: here ? here.x * WORLD_SCALE : undefined, y: here ? here.y * WORLD_SCALE : undefined, hot: pr.ok, tone: pr.ok ? 'good' : undefined });
      // v0.52.9：每条宗门任务都带「指路」——写明去哪儿、多远，可一键在地图上标出
      for (const tk of s.tasks) {
        if (tk.until < day) continue;
        const have = Math.max(0, this.towns.taskProgress(tk)), done = have >= tk.need;
        const w = this.towns.taskWhere(tk);
        const dist = w.x !== undefined && w.y !== undefined ? (this.mijing.active ? '，界外' : `，${dirName(w.x - p.x, w.y - p.y)}方约 ${Math.max(1, Math.round(Math.hypot(w.x - p.x, w.y - p.y) / 30))} 丈`) : '';
        out.push({
          t: `宗门任务：${tk.text}`,
          d: `${done ? '✓ 已达成，回宗门交差' : '去向：' + w.spot}${dist}　（${have}/${tk.need} · 贡献 +${Math.round(tk.reward)}，余 ${Math.ceil(tk.until - day)} 日）`,
          x: w.x, y: w.y, hot: done, tone: done ? 'good' : undefined,
        });
      }
    }
    // 悬赏
    for (const b of this.ws.bounties ?? []) {
      if (b.done || b.until <= day) continue;
      const on = b.map === ACTIVE_MAP;
      out.push({ t: '悬赏', d: `「${b.name}」${realmName(b.realm, b.stage)} · 赏 ${b.reward} 灵石 · 余 ${Math.ceil(b.until - day)} 日${on ? '，' + far(b.x, b.y) : ''}`, x: on ? b.x : undefined, y: on ? b.y : undefined, tone: 'bad' });
    }
    // 战事传讯
    for (const j of this.war.inbox) {
      if (j.done || (j.until !== undefined && j.until < day) || j.kind === '交易') continue;
      out.push({ t: '玉符 · ' + j.kind, d: `${j.from}：${j.text.length > 42 ? j.text.slice(0, 42) + '…' : j.text}（传音玉符 O 中应召）`, x: j.x, y: j.y, hot: !j.read, tone: 'bad' });
    }
    // 下一件原设大事
    const ne = this.events.nextStart();
    if (ne) { const m = Math.max(0, Math.round((ne.day - day) / 30)); out.push({ t: '天下将变', d: m <= 0 ? `「${ne.name}」即将开始！` : `「${ne.name}」约 ${m} 个月后开始。` }); }
    // 知交
    for (const r of this.hearts.list()) if (r.s?.met && !r.s.flags.parted && r.hint && !r.hint.startsWith('故事') && !r.hint.startsWith('伴侣')) { out.push({ t: '知交 · ' + r.b.name, d: r.hint, tone: 'love' }); if (out.filter((o) => o.tone === 'love').length >= 2) break; }
    if (!out.length) out.push({ t: '风平浪静', d: '眼下没什么风声。多去酒楼坐坐、与人交谈；闭关出关后，也常有访客登门。' });
    return out;
  }

  /** 第三十八步：出关访客——每次闭关 30 日以上，出关时必有一位访客（宗门传讯 / 故交赠礼 / 散修报信，轮流） */
  private visitQ: DNode | null = null;
  private seclusionVisitor(days: number): string | null {
    if (days < 30 || this.hero.dead) return null;
    const f = this.ws.flags as any, h = this.hero;
    f.visitN = (f.visitN ?? 0) + 1;
    const close: DOpt = { label: '送客', act: () => null };
    const kinds: (() => [DNode, string] | null)[] = [
      // 宗门传讯
      () => {
        const s = this.ws.sect; if (!s) return null;
        const L = LOC_BY_ID.get(s.id);
        if (!s.tasks.filter((t) => t.until > this.day).length) this.towns.refreshTasks();
        const bonus = 10 + s.rank * 15; s.contrib += bonus;
        const pr = this.towns.promoteReq(), nx = SECT_RANKS[s.rank + 1];
        const tasks = s.tasks.filter((t) => t.until > this.day).map((t) => `「${t.text}」`).join('、');
        const text = `${L?.name ?? '宗门'}的传讯纸鹤落在洞府前。\n\n「${SECT_RANKS[s.rank]}苏寒闭关勤修，记贡献 ${bonus}。」${tasks ? `\n\n执事堂新近发布：${tasks}。` : ''}${pr.ok ? `\n\n另：你已够格晋升「${nx}」，速回山门。` : nx ? `\n\n晋升「${nx}」尚需：${pr.why}。` : ''}`;
        return [{ speaker: '传讯纸鹤', title: L?.name, text, options: [close] }, '宗门传讯纸鹤'];
      },
      // 故交赠礼
      () => {
        const fr = this.npcs.list.filter((d) => d.met && d.alive && d.favor >= 15 && d.faction !== 'mortal' && !d.beauty);
        if (!fr.length) return null;
        const d = fr[Math.floor(Math.random() * fr.length)];
        const pool = ITEM_LIST.filter((it) => it.type === 'pill' && it.tier >= Math.max(0, h.realm - 1) && it.tier <= h.realm && it.price > 0 && it.price <= 600 * (h.realm + 1) * (h.realm + 1));
        const it = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
        const n = it ? Math.max(1, Math.min(3, Math.round(300 * (h.realm + 1) / it.price))) : 0;
        if (it) C.addItem(h, it.id, n);
        d.favor = Math.min(100, d.favor + 2);
        const rumor = this.events.rumorFor(d) ?? this.npcs.rumor(d);
        const text = `${d.name}听说你出关，特来道贺。${it ? `\n\n「一点心意，苏道友收下。」——得到 ${it.name} ×${n}。` : ''}\n\n闲谈间，${d.name}说起：${rumor}`;
        return [{ speaker: d.name, title: realmName(d.realm, d.stage), text, options: [{ label: '多谢道友', tone: 'good', act: () => null }] }, d.name];
      },
      // 散修报信：异宝即将出世
      () => {
        const hd = f.herald; if (hd && !hd.done) return null;
        if (f.heraldNext && f.heraldNext - this.day < 40) return null;
        f.heraldNext = Math.min(f.heraldNext ?? Infinity, this.day + 2);
        const text = '一名过路散修在洞府外歇脚，向你讨了碗清水。\n\n「道友闭关有些时日了吧？外头可不太平——前几夜，有人看见远处山中宝光冲霄，怕是有异宝要出世了。」\n\n（出关后留意天边异象：地图上会标出「宝」字。）';
        return [{ speaker: '过路散修', title: '炼气期', text, options: [{ label: '多谢指点', act: () => null }] }, '一名过路散修'];
      },
      // 采药人：指点附近一处尚未见过的机缘
      () => {
        const p = this.player, st = this.sites.revealNear(p.x, p.y, 12000);
        if (!st) return null;
        const nm = this.sites.name(st), where = this.sites.hereDir(st);
        const text = `一个背着药篓的老采药人路过洞府，见你出关，咧嘴一笑。\n\n「仙师，小老儿前些日子进山，在${where}见着一处古怪地方——${nm}。小老儿凡人一个，不敢靠近，仙师兴许用得上。」\n\n（地图上已标出此处。）`;
        return [{ speaker: '老采药人', title: '凡人', text, options: [{ label: '指路', tone: 'gold', act: () => { this.setGuide(st.x, st.y, nm); return null; } }, { label: '谢过老丈', act: () => null }] }, '一位老采药人'];
      },
      // 落魄修士：兜售残图
      () => {
        if ((this.ws.caches ?? []).filter((c) => !c.done).length >= 3) return null;
        const price = 40 * (h.realm + 1) * (h.realm + 1), have = C.bagCount(h, 'mat_lingshi');
        const text = `一个衣衫褴褛的修士在洞府外踌躇良久，终于开口。\n\n「道友……在下手头拮据，有一角祖上传下的藏宝残图，愿以 ${price} 灵石相让。图是真的，只是在下修为低微，去了也是送死。」`;
        return [{ speaker: '落魄修士', title: realmName(Math.max(1, h.realm - 1), 3), text, options: [
          { label: `买下（${price} 灵石）`, tone: 'gold', disabled: have < price, hint: have < price ? '灵石不足' : undefined, act: () => { C.removeItem(h, 'mat_lingshi', price); const c = this.sites.makeCache(h.realm); return { speaker: '落魄修士', text: c ? '「多谢道友！」他接过灵石，头也不回地走了。\n\n你对照残图与地形，朱砂点很快对上了。' : '「多谢道友！」——可惜残图上的地形，你怎么也对不上。', options: [{ label: '收起残图', act: () => null }] }; } },
          { label: '婉拒', act: () => null },
        ] }, '一名落魄修士'];
      },
    ];
    // 第四十三步：闭关这些日子，众生照样过日子——出关先听听世事变迁
    this.npcs.catchUp();
    const news = this.living.seclusionNews(this.day - days);
    for (let i = 0; i < kinds.length; i++) {
      const r = kinds[(f.visitN + i) % kinds.length]();
      if (r) { const v = r[0]; this.visitQ = news ? { ...news, options: [{ label: '知道了', act: () => v }] } : v; return `出关时，${r[1]}已在洞府外等候。${news ? '闭关这些日子，外面也发生了不少事。' : ''}`; }
    }
    if (news) { this.visitQ = news; return '闭关这些日子，外面发生了不少事。'; }
    return null;
  }
  /** 第三十八步：够格晋升时提醒一次 */
  private promoT = 0;
  private promoCheck(dt: number) {
    this.promoT -= dt; if (this.promoT > 0) return; this.promoT = 1.5;
    const gd = this.guide, p = this.player;
    if (gd && gd.map === ACTIVE_MAP && Math.hypot(gd.x - p.x, gd.y - p.y) < 360) { this.guide = null; this.toast(`已到达：${gd.name}`, 'good'); }
    const s = this.ws.sect; if (!s) return;
    const f = this.ws.flags as any;
    if (this.towns.promoteReq().ok) {
      if (f.promoNote !== s.rank) { f.promoNote = s.rank; this.toast(`宗门传讯：你已够格晋升「${SECT_RANKS[s.rank + 1]}」，回山门即可晋升（${keyOr('chronicle', '') ? keyOr('chronicle', '') + ' 查看大事记' : '在「菜单 → 机缘」里查看'}）`, 'good'); audio.sfx('chime'); }
    }
  }

  tryGather() {
    const p = this.player;
    if (this.hero.dead || this.gathering) return;
    if (this.isFlying) {
      if (!this.canLand()) return;
      p.flying = false; audio.sfx('land');   // 自动落地采集
    }
    const n = this.nodes.nearest(p.x, p.y, GATHER_RANGE, this.day);
    if (!n) {
      const far = this.nodes.nearest(p.x, p.y, this.senseRadius, this.day);
      this.toast(far ? '神识中感应到附近有灵物，走近些再采。' : '神识所及，并无可采之物。', 'warn');
      return;
    }
    this.stand();
    this.destination = null;
    p.st.faceToward(n.x - p.x, n.y - p.y, false);
    this.gathering = { node: n, t: 0 };
  }
  private finishGather() {
    const g = this.gathering!; this.gathering = null;
    const got = this.nodes.harvest(g.node, this.day, C.mod(this.hero, 'herb'), C.mod(this.hero, 'luck') * 100);
    // 天道篇·资源限供：高价值灵草采到一半，另一道神识也锁定了这里——可谈、可分、可抢
    if (got.length && this.daoxin.contestGather(g.node, got)) { this.hero.stats.gathered++; this.updateUI(true); return; }
    const parts: string[] = [];
    // 结伴作风·采药：同行者帮着多采一份
    const helpers = this.fellows.myStyle === 'herb' ? this.npcs.followers().length : 0;
    for (const it of got) {
      const n = it.n + (helpers && itemDef(it.item).type === 'herb' ? Math.max(1, Math.round(it.n * 0.5 * helpers)) : 0);
      C.addItem(this.hero, it.item, n);
      parts.push(`${itemDef(it.item).name}×${n}${n > it.n ? '（同伴帮采）' : ''}`);
    }
    this.hero.stats.gathered++;
    C.temperDao(this.hero, 0.12);
    this.story.onGather();
    this.toast('采得 ' + parts.join('、'), 'good');
    audio.sfx('gather');
    this.renderer?.burst(g.node.x, g.node.y - 10, g.node.kind === 'ore' ? '#d8e0ff' : g.node.kind === 'spring' ? '#bff0ff' : '#c8ffb0');
    this.updateUI(true);
  }

  /** 闭关：days 天，或 0 表示直到瓶颈（最多 30 年） */
  seclude(days: number): SeclusionReport {
    const h = this.hero;
    const from = realmName(h.realm, h.stage);
    const msgs: Msg[] = [];
    let cap = days > 0 ? days : 360 * 60;
    let d = 0, gain = 0, reason = '期满出关';
    // 第三十六步：大事将起时提前出关（不至于一觉醒来错过）
    const nx = this.events.nextStart();
    let evCut = false;
    if (nx && nx.day - this.day < cap) { cap = Math.max(1, nx.day - this.day); evCut = true; }
    const place = this.placeBonus().mult;
    if (h.realm >= 5) {
      return { days: 0, from, to: from, expGain: 0, msgs: [{ text: '你已立于人界之巅「化神初期」，此界天地元气再难寸进。', kind: 'info' }], reason: '已臻人界至高境界' };
    }
    while (d < cap) {
      if (h.pendingTalent) { reason = '心有所感，逆天改命'; break; }
      if (C.bottleneck(h) !== 'none') { reason = C.bottleneck(h) === 'major' ? '修为圆满，触及大境界瓶颈' : '触及瓶颈，需服丹冲关'; break; }
      if (C.isMedStale(h)) {
        reason = '久居闭关不历红尘，道心滞涩难进——须外出斗法斩敌、探寻秘境古迹或完成悬赏宗门差事印证所学';
        msgs.push({ text: '苦坐经年而未历生死印证，丹田灵力渐生郁结——一味闭关无法窥见大道，当出关入世历练！', kind: 'warn' });
        break;
      }
      const step = Math.min(1, cap - d);
      const before = h.exp;
      const bl = h.realm * 100 + h.stage;
      C.passDays(h, step, true, place, msgs);
      gain += (h.realm * 100 + h.stage !== bl) ? C.expPerDay(h, place) * step : h.exp - before;
      d += step;
      if (h.pendingTalent) { reason = '心有所感，逆天改命'; break; }
      if (h.dead) { reason = '寿元耗尽'; break; }
    }
    if (evCut && d >= cap && reason === '期满出关') reason = `心血来潮——${nx!.name}将起，提前出关`;
    this.day += d;
    this.clock += 37; // 出关时辰随机变化
    const to = realmName(h.realm, h.stage);
    // 只保留重要消息
    const important = msgs.filter((m) => m.kind === 'good' || m.kind === 'warn');
    const collapsed: Msg[] = [];
    const drops = important.filter((m) => m.text.includes('墨露')).length;
    for (const m of important) if (!m.text.includes('墨露')) collapsed.push(m);
    if (drops) collapsed.push({ text: `问道残卷凝出墨露 ${drops} 滴。`, kind: 'good' });
    const vis = this.seclusionVisitor(d); if (vis) collapsed.push({ text: vis, kind: 'good' });
    if (from !== to) audio.sfx('break');
    this.save(0);
    this.updateUI(true);
    return { days: d, from, to, expGain: Math.round(gain), msgs: collapsed, reason };
  }

  breakthrough(pills: number, bonus?: number): { ok: boolean; msgs: Msg[] } {
    const major = C.bottleneck(this.hero) === 'major', from = this.hero.realm;
    if (major) {
      const gate = C.checkMajorGate(this.hero, this.ws, this.ui?.explored ?? 0);
      if (!gate.ok) {
        const miss = gate.list.filter((x) => !x.ok).map((x) => `${x.label}（${x.cur}/${x.need}）`).join('；');
        const msg: Msg = { text: `红尘历练与道基印证尚未圆满，一味闭关强冲必遭天谴！尚缺：${miss}`, kind: 'warn' };
        this.flushMsgs([msg]);
        audio.sfx('fail');
        return { ok: false, msgs: [msg] };
      }
      const mb = MAJOR_BREAKS[from];
      if (mb?.minItems && Math.min(pills, C.bagCount(this.hero, mb.item)) < mb.minItems) {
        const msg: Msg = { text: `冲击${REALMS[from + 1]?.name}至少须投入 ${mb.minItems} 份${itemDef(mb.item).name}！`, kind: 'warn' };
        this.flushMsgs([msg]);
        audio.sfx('fail');
        return { ok: false, msgs: [msg] };
      }
    }
    // 天道篇：天骄档「道心通明」——高阶冲关加成折半封顶，不破坏结婴/化神严苛度
    if (bonus !== undefined) bonus += (this.daoxin?.breakBonus?.() ?? 0) * (from >= 3 ? 0.35 : 0.75);
    // 结丹、结婴、化神前先渡心魔大劫；渡完直接进入大地图无遮挡史诗天象演出！
    if (bonus === undefined && this.xinmo.needed()) {
      (this.onPanel as any)?.('', false);
      if (this.inCave) this.leaveCave();
      this.xinmo.start((b) => {
        this.closeModal(true);
        this.breakthrough(pills, b);
      });
      return { ok: false, msgs: [] };
    }
    const r = C.tryBreak(this.hero, pills, bonus ?? 0);
    const fk = C.takeLastFake();
    if (fk) this.renxin.onConsumedFake(fk);
    this.flushMsgs(r.msgs);
    if (major && from >= 1 && from <= 4) {
      const h = this.hero, where = this.nearbyLocation()?.name ?? this.placeBonus().name;
      const kind: TxKind = from === 1 ? 'zhuji' : from === 2 ? 'jiedan' : from === 3 ? 'jieying' : 'huashen';
      if (r.ok && from >= 2) this.news(`${h.name}于${where}${kind === 'jiedan' ? '凝结九转金丹，金霞贯日' : kind === 'jieying' ? '碎丹成婴，百丈法相显圣，紫气东来三万里' : '勘破天堑晋入化神初期，五色神光震动整个人界'}！`, 'rumor');
      if (r.ok && from >= 2) this.pendingAscend = kind as AscendInfo['kind'];
      if (this.inCave) this.leaveCave();
      this.closeModal(true);
      (this.onPanel as any)?.('', false);
      this.tianxiang.start(kind, r.ok, this);
      this.updateUI(true);
      return r;
    }
    audio.sfx(r.ok ? 'break' : 'fail');
    if (r.ok) this.renderer?.burst(this.player.x, this.player.y - 60, '#fff2b0', 60);
    if (r.ok) (this.combat as any).vfx.push({ kind: 'aura', anchor: { x: this.player.x, y: this.player.y, offsetY: -this.player.st.lift }, x: this.player.x, y: this.player.y, r: 130, t: 0, dur: 2.4, color: '255,240,180', fx: 'breakthrough' });
    this.updateUI(true);
    return r;
  }
  /** 第四十五步：过场结束（界面回调） */
  ascendDone() { const k = this.pendingAscend; this.pendingAscend = null; if (k) this.ascendFx(k); }
  /** 突破后的天象余韵：在世界里继续的光柱、灵阵与金光 */
  private ascendFx(kind: AscendInfo['kind']) {
    const p = this.player, vfx = (this.combat as any).vfx as any[]; if (!vfx) return;
    const n = kind === 'jiedan' ? 3 : 6, col = kind === 'huashen' ? '255,200,240' : '255,236,170';
    for (let i = 0; i < n; i++) vfx.push({ kind: 'aura', anchor: { x: p.x, y: p.y, offsetY: -p.st.lift }, x: p.x, y: p.y, r: 140 + i * 55, t: 0, dur: 2.4 + i * 0.7, color: col, fx: 'breakthrough' });
    for (let i = 0; i < n; i++) this.renderer?.burst(p.x + (Math.random() - 0.5) * 260, p.y - 60 - Math.random() * 160, i % 2 ? '#fff2b0' : '#e8c8ff', 40);
    this.toast(kind === 'jiedan' ? '金丹初成，丹田中一片温热。' : kind === 'jieying' ? '元婴初成——方圆百里的修士都看见了那道冲天霞光。' : '化神已成，天地元气为你所用。', 'good');
  }
  usePill(id: string, ref?: number | C.BagItem) {   // 收官 C（甲）：ref 可以是袋中那一堆本身（不再依赖下标）
    if (modx?.useItem(id)) { this.updateUI(true); return true; }   // v0.57：模组定义的用法（或模组拦下了）
    { const r = this.jueyu.useItem(id); if (r !== null) { this.updateUI(true); return r; } }
    { const r = this.rel.feud.useItem(id); if (r !== null) { this.updateUI(true); return r; } }   // 恩怨重做：易容丹、传讯符   // 收官 B3：灵舟（祭出 / 修补）、避水丹、海渊残图
    const msgs: Msg[] = [];
    const ok = C.usePill(this.hero, id, msgs, ref);
    const fk = C.takeLastFake();
    if (fk) this.renxin.onConsumedFake(fk);
    this.flushMsgs(msgs);
    if (ok) audio.sfx(fk ? 'fail' : 'chime');
    this.updateUI(true);
    return ok;
  }
  useBottle(stack: C.BagItem) { const m = C.useBottle(this.hero, stack); this.flushMsgs([m]); if (m.kind === 'good') { audio.sfx('chime'); this.story.onBottle(); } this.updateUI(true); return m; }
  /** 地火：城镇法器阁 / 宗门炼器房 */
  get forgeFire() { const t = this.nearbyLocation()?.type; return t === 'city' || t === 'town' || t === 'sect' || t === 'isle'; }
  brew(r: import('../data/recipes').Recipe) {
    const res = C.brew(this.hero, r, this.forgeFire);
    if (res.days) { C.temperDao(this.hero, res.ok ? 0.16 : 0.06); const msgs: Msg[] = []; C.passDays(this.hero, res.days, false, 1, msgs); this.day += res.days; this.rel.daily(Math.min(res.days, 30)); this.flushMsgs(msgs.filter((m) => m.kind)); }
    audio.sfx(res.ok ? 'break' : 'fail');
    this.updateUI(true);
    return res;
  }
  chooseTalent(id: string) { C.chooseTalent(this.hero, id); audio.sfx('break'); this.toast(`逆天改命：获得「${talentById(id)?.name ?? id}」`, 'good'); this.updateUI(true); }

  revealAround(force: boolean) {
    const r = this.senseRadius;
    const p = this.player;
    const x0 = Math.max(0, Math.floor((p.x - r) / FOG_CELL)), x1 = Math.min(FOG_W - 1, Math.floor((p.x + r) / FOG_CELL));
    const y0 = Math.max(0, Math.floor((p.y - r) / FOG_CELL)), y1 = Math.min(FOG_H - 1, Math.floor((p.y + r) / FOG_CELL));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const cx = (x + 0.5) * FOG_CELL, cy = (y + 0.5) * FOG_CELL;
      if (Math.hypot(cx - p.x, cy - p.y) < r + FOG_CELL * 0.45 || force && Math.hypot(cx - p.x, cy - p.y) < r + FOG_CELL) {
        const i = y * FOG_W + x;
        if (!this.explored[i] && !force) this.revealT.set(i, this.time);
        this.explored[i] = 1;
      }
    }
  }

  isExplored(wx: number, wy: number) {
    if (this.revealAll) return true;
    const x = Math.floor(wx / FOG_CELL), y = Math.floor(wy / FOG_CELL);
    if (x < 0 || y < 0 || x >= FOG_W || y >= FOG_H) return this.terrain.inOutland(wx, wy) || this.jueyu.outside(wx, wy);   // 图外的交界地带、外圈海（绝域）不设迷雾
    return this.explored[y * FOG_W + x] === 1;
  }

  private checkRegion() {
    const p = this.player;
    const mx = p.x / WORLD_SCALE, my = p.y / WORLD_SCALE;
    const onLand = this.terrain.isLand(p.x, p.y);
    const r: Region | null = regionAt(mx, my, onLand);
    const id = r ? r.id : 'none';
    if (id !== this.currentRegionId) {
      const first = this.currentRegionId === '';
      this.currentRegionId = id;
      if (r && !first) this.toast(r.parent === r.name ? r.name : `${r.parent} · ${r.name}`, 'region');
    }
  }

  /** 战斗中倒下：按击倒者身份结算（妖兽道伤 / 劫修仇家搜袋销赃追回 / 死敌补刀回档 / 魔修掳入魔窟） */
  /** v0.70：元婴遁体——肉身被毁后以元婴之身再战；脱战一阵后重塑肉身（重度道伤、修为倒退两成） */
  yingEsc: { t: number; calm: number } | null = null;
  startYingEscape(): boolean {
    const h = this.hero, p = this.player;
    if (this.yingEsc || this.yuanying.active || this.mijing?.active) return false;
    this.yingEsc = { t: 0, calm: 0 }; (h as any).yingEscP = true;   // 记进存档：读档躲不掉重塑肉身的代价
    this.yuanying.active = true; this.yuanying.body = null; this.yuanying.t = 0;
    h.hp = 0.35; h.mp = Math.max(h.mp, 0.3);
    this.combat.invulnT = Math.max(this.combat.invulnT, 1.5);
    this.combat.impact(p.x, p.y, 2, '255,215,140');
    this.combat.texts.push({ x: p.x, y: p.y - 150, s: '肉身被毁·元婴遁出', color: '#ffd890', t: 0, vy: -24, big: true } as any);
    this.toast('肉身被毁！元婴破体而出——还能再战，也能遁走。元婴再被打散便是真死；脱战一阵，元婴会寻处灵气重塑肉身。', 'warn');
    audio.sfx('bell');
    this.updateUI(true);
    return true;
  }
  /** 元婴遁体：脱战（八息内没打没挨打）累计四十息，便重塑肉身 */
  private tickYingEscape(dt: number) {
    const Y = this.yingEsc; if (!Y) return;
    Y.t += dt;
    if (this.combat.combatT > 8) Y.calm += dt; else Y.calm = 0;
    if (Y.calm >= 40) this.endYingEscape('rebuild');
  }
  endYingEscape(why: 'rebuild' | 'dead') {
    const h = this.hero;
    if (!this.yingEsc) return;
    this.yingEsc = null; (h as any).yingEscP = undefined;
    this.yuanying.reset();
    if (why === 'rebuild') {
      C.inflictDaoHurt(h, 60, '肉身被毁，元婴重塑');
      h.exp = Math.floor(h.exp * 0.8);
      h.hp = Math.max(h.hp, 0.5);
      this.player.st.strands.clear(); this.player.st.springs.clear();
      this.toast('元婴耗尽元气，重塑了一具肉身——经脉尚未长全（道伤六十日），修为倒退两成。', 'warn');
      this.news('苏寒肉身被毁，以元婴之身逃出生天，耗尽元气重塑肉身。', 'personal');
    }
    this.updateUI(true);
  }
  onPlayerDown(killer?: Enemy) {
    if (this.mijing?.active) this.mijing.leave('down');
    if (this.xukong?.fight.on) { this.xukong.fight.finish('down'); this.xukong.reset(); }
    if (this.yuanying?.active) this.yuanying.back('force');
    if (this.story.onDown()) return;
    if (this.hanshan.onPlayerDown(killer)) return;   // r7：被撼山客打倒——照寻常战败回城，他不搜袋
    this.renxin.onPlayerDown(killer);
  }

  /** v0.60：参修心法玉简（转修主修功法）。主修只能一门：筑基以后改修要散去三成本层修为；改修魔功损声望 */
  learnGongfa(itemId: string, gid: string, sure = false): boolean {
    const h = this.hero, gf = GONGFA[gid];
    if (!gf || gf.aux) { this.toast('此卷所载乃辅修秘术，须机缘契合方可参修。', 'warn'); return false; }
    if (h.gongfa === gid) { this.toast(`你主修的正是《${gf.name}》。`, 'warn'); return false; }
    const cur = GONGFA[h.gongfa] ?? GONGFA.generic;
    const free = h.realm <= 1 || h.gongfa === 'generic' || h.gongfa === 'changchun';
    if (!sure) {
      this.openDialog({
        speaker: '心念', title: '转修功法',
        text: `现修《${cur.name}》：${cur.desc}\n\n欲转修《${gf.name}》：${gf.desc}\n\n${free ? '根基尚浅，改修并无损耗。' : '主修只能一门。改换根本功法须散功重修：本层已积的修为将损去三成。'}${gf.dao === 'mo' && cur.dao !== 'mo' ? '\n修炼魔功，正道必然侧目（声望 -8）。' : ''}${h.realm > gf.maxRealm ? `\n此功法只载到${REALMS[gf.maxRealm].name}期，以你如今的境界修它，进境减半。` : ''}`,
        options: [{ label: `转修《${gf.name}》`, tone: 'gold', act: () => { this.learnGongfa(itemId, gid, true); return null; } }, { label: '再想想', act: () => null }],
      });
      return false;
    }
    if (C.bagCount(h, itemId) <= 0) return false;
    C.removeItem(h, itemId, 1);
    if (!free) h.exp = Math.floor(h.exp * 0.7);
    h.gongfa = gid;
    if (gf.dao === 'mo' && cur.dao !== 'mo') this.ws.rep -= 8;
    this.toast(`功行周天，转修《${gf.name}》已然入门。`, 'good');
    audio.sfx('chime');
    this.updateUI(true);
    return true;
  }

  /** 参悟法术卷轴（人心篇：若为未鉴定的残缺伪简则引发经脉反噬与道伤） */
  learnScroll(itemId: string, ref?: number | C.BagItem) {   // 收官 C（甲）：ref 可以是袋中那一堆本身（不再依赖下标）
    const d = itemDef(itemId), h = this.hero;
    if (d.scroll?.zhen) return this.zhenfa.learnScroll(itemId, d.scroll.zhen);
    const b = C.bagRef(h, ref) ?? h.bag.find((x) => x.id === itemId);
    if (b && this.renxin.onTryLearnScroll(b)) return false;
    if (d.scroll?.gongfa) return this.learnGongfa(itemId, d.scroll.gongfa);   // v0.60：心法玉简
    const ALIAS: Record<string, string> = { leidian: 'zhangxin', lianqi: 'lianxi', dash: 'yufeng' };
    const sid = d.scroll?.skill ? (ARTS[d.scroll.skill] ? d.scroll.skill : ALIAS[d.scroll.skill]) : undefined;
    const s = sid ? ARTS[sid] : undefined;
    if (!s) { this.toast('此卷所载功法，需入宗门后方可参修（第五步开放）。', 'warn'); return false; }
    if (h.arts.some((a) => a.id === s.id)) { this.toast(`你早已习得${s.name}。`, 'warn'); return false; }
    if (h.realm < s.realm) { this.toast(`${s.name}需${REALMS[s.realm].name}期方可参悟。`, 'warn'); return false; }
    C.removeItem(h, itemId, 1);
    h.arts.push({ id: s.id, xp: 0 });
    const slot = h.hotbar.findIndex((x) => !x);
    if (slot >= 0) h.hotbar[slot] = s.id;
    this.toast(`参悟${s.name}，已然入门！${slot >= 0 ? `（已放入快捷栏 ${slot + 1}）` : `（${pressKey('skills', '在「≡ 菜单 → 法术书」里')}放入快捷栏）`}`, 'good');
    audio.sfx('chime');
    this.updateUI(true);
    return true;
  }

  /** 探索洞府遗迹：首次抵达时得宝，并惊动守护 */
  private exploreCheck(loc: LocDef | null) {
    if (!loc || loc.type !== 'secret' || !loc.minor) return;
    const h = this.hero;
    if (h.looted.includes(loc.id)) return;
    h.looted.push(loc.id);
    const dz = loc.danger ?? 1;
    const got: string[] = [];
    const ls = Math.round((20 + Math.random() * 60) * (1 + dz) * (1 + dz * 0.5));
    C.addItem(h, 'mat_lingshi', ls); got.push(`灵石 ${ls}`);
    const sc = this.combat.randomScroll(Math.min(4, Math.floor(dz / 1.2) + 1));
    if (sc) { C.addItem(h, sc, 1); got.push(itemDef(sc).name); }
    if (Math.random() < 0.35 + dz * 0.1) { const pills = ['pill_juqi', 'pill_huiqi', 'pill_liaoshang']; const pid = pills[Math.floor(Math.random() * pills.length)]; C.addItem(h, pid, 1 + Math.floor(Math.random() * 2)); got.push(itemDef(pid).name); }
    if (Math.random() < 0.12 * dz) { const arts = ['art_qingfeng', 'art_liuying', 'art_tengjia', 'art_jinguangzhuan', 'art_yinhui', 'art_songwen', 'art_xuantie', 'art_wulong', 'art_chiyaohuan', 'art_tayun', 'art_guike', 'art_hantanjian', 'art_qingning', 'art_luoxingsuo', 'art_hongxian', 'art_qianyexia']; const aid = arts[Math.floor(Math.random() * Math.min(arts.length, 2 + dz * 1.5))]; C.addItem(h, aid, 1); got.push(itemDef(aid).name); }
    this.toast(`探得${loc.name}：前人遗留的禁制已残破，得 ${got.join('、')}。`, 'good');
    audio.sfx('chime');
    if (Math.random() < 0.4 + dz * 0.15) { this.combat.spawnGuards(loc); this.toast('洞中守护的妖物被惊动了！', 'warn'); }
  }

  nearbyLocation(): LocDef | null {
    const p = this.player;
    let best: LocDef | null = null, bd = 1e9;
    const zones = this.terrain.locZones;
    for (let i = 0; i < LOCATIONS.length; i++) {
      const l = LOCATIONS[i], z = zones[i];
      const dx = l.x * WORLD_SCALE - p.x, dy = l.y * WORLD_SCALE - p.y;
      // 占山的大宗门地界有上万：粗筛按地点自己的范围放宽
      const far = z ? Math.max(4000, Math.max(z.rx, z.ry) * 1.25 + 200) : 4000;
      if (Math.abs(dx) > far || Math.abs(dy) > far) continue;
      const d = Math.hypot(dx, dy);
      const r = z ? Math.max(z.rx, z.ry) * 1.25 + 200 : (l.type === 'city' || l.type === 'sect' ? 620 : 520);
      if (d < r && d < bd) { bd = d; best = l; }
    }
    return best;
  }

  timeName() {
    const ph = this.dayPhase;
    const names = ['子时', '丑时', '寅时', '卯时', '辰时', '巳时', '午时', '未时', '申时', '酉时', '戌时', '亥时'];
    // ph=0 正午（午时），0.5 子夜
    const hour = ph * 24;
    return names[Math.floor(((hour + 1) % 24) / 2)];
  }

  updateUI(force = false) {
    void force;
    const p = this.player, h = this.hero;
    const totalMonths = Math.floor(this.day / 30);
    const year = Math.floor(totalMonths / 12) + 1, month = (totalMonths % 12) + 1;
    const season = month <= 3 ? '春' : month <= 6 ? '夏' : month <= 9 ? '秋' : '冬';
    const mx = p.x / WORLD_SCALE, my = p.y / WORLD_SCALE;
    const r = regionNameAt(mx, my, this.terrain.isLand(p.x, p.y));   // 第六轮返工：海岛上写岛名或所属海域，不再是「荒野」
    let ex = 0; for (let i = 0; i < this.explored.length; i++) ex += this.explored[i];
    const pl = this.placeBonus();
    const gt = this.gatherTarget;
    // 走进一个地点的地界就算认得它了：把它中心那一格记成探明，小地图和世界地图上才标得出它的印章和名字
    // （原来要神识圈扫到地点的中心点才算；占山的宗门、大城的中心离门口几千上万，人站在山门里地图上却没有这个地方）
    const near = this.xukong.inVoid ? null : this.nearbyLocation();
    if (near && !this.offWorld && !this.mijing.active) { const fx = Math.floor(near.x * WORLD_SCALE / FOG_CELL), fy = Math.floor(near.y * WORLD_SCALE / FOG_CELL); if (fx >= 0 && fy >= 0 && fx < FOG_W && fy < FOG_H) this.explored[fy * FOG_W + fx] = 1; }
    this.ui = {
      date: { year, month, season },
      // 第五轮返工：秘境的坐标在南荒东边图外，按坐标查地区会落到无边海——人在秘境 / 画中时地区名用秘境名
      region: this.xukong.inVoid ? '虚空' : this.mijing.cur ? (this.mijing.cur.spec.theme === 'shanshui' ? '画中洞天' : this.mijing.cur.spec.name) : r ? r.name : this.seamDepth > 0 ? this.seam!.name : '荒野', regionParent: this.xukong.inVoid || this.mijing.cur ? '' : r ? r.parent : '',
      nearby: near,
      realmText: realmName(h.realm, h.stage), sense: this.sense, senseRadius: Math.round(this.senseRadius),
      flying: this.isFlying, canFlyNative: this.canFlyNative, run: this.input.run,
      dunkong: this.dunkong.equipped && h.realm >= 4 ? { phase: this.dunkong.phase, cd: Math.ceil(this.dunkong.cooldown) } : null,
      xukong: this.xukong.info(),
      party: this.party.snapshot(),
      alt: Math.round(p.z), altBand: bandName(p.z),
      zoom: this.cam.targetZoom, px: p.x, py: p.y,
      explored: ex / this.explored.length,
      hp: h.hp, mp: h.mp, exp: h.exp, need: C.need(h), bottleneck: C.bottleneck(h),
      sitting: p.sitting, concealed: this.concealed, age: h.age, maxLife: C.maxLife(h), expRate: C.expPerDay(h, pl.mult), place: pl.name,
      gather: gt ? { name: itemDef(gt.item).name, kind: gt.kind } : null, gatherP: this.gathering ? this.gathering.t / GATHER_TIME : -1,
      weather: WEATHER_NAME[this.weather.kind], timeName: this.timeName(), night: this.night,
      bottle: h.bottle.drops, pendingTalent: !!h.pendingTalent, dead: h.dead, rootName: C.rootDef(h).name,
      talk: this.hanshan?.talkLabel() ?? (this.story?.focus ? (this.story.focus.look ? `与${this.story.focus.name}交谈` : '查看') : this.npcs?.focus ? `与${this.npcs.focus.d.met ? this.npcs.focus.d.name : '此人'}交谈` : this.events?.focus ? '查看' : this.indoor?.focus ? this.indoor.talkLabel() : this.space?.doorFocus && !this.isFlying && !this.indoor?.inside && this.towns.canEnter(this.space.doorFocus.loc) ? (this.space.doorFocus.door.fn === 'teleport' ? '踏上传送阵' : this.space.doorFocus.door.fn === 'board' ? `看${this.space.doorFocus.door.name}` : `进入${this.space.doorFocus.door.name}`) : null),
      daoHurt: C.hasDaoHurt(h) ? { days: Math.ceil(h.daoHurt!.days), why: h.daoHurt!.why } : null,
    };
    this.listeners.forEach((f) => f());
  }

  subscribe(f: () => void) { this.listeners.add(f); return () => { this.listeners.delete(f); }; }
  subscribeToasts(f: () => void) { this.toastListeners.add(f); return () => { this.toastListeners.delete(f); }; }

  private toastId = 0;
  /**
   * 第五轮：顶上的消息同一时刻最多出几条（地名横幅另算）；GameView 按设备设（电脑 2、手机 1）。
   * 多出来的排队（toastQueue），前面的一走后面的补上；排着队时每条少停一会儿，免得积压。同一句话正显示或在排队就不再加。
   * 以前一次堆四条，竖屏上半屏被消息、任务列、地点卡、引导气泡盖了一大半。
   */
  toastMax = 2;
  toastQueue: Toast[] = [];
  /** 打斗中压着的闲讯（at = 压下时的 game.time） */
  toastDeferred: Toast[] = [];
  /** 「讯」角标的消息记录：最近 40 条，新的在后；shown = 弹出过，read = 打开记录看过 */
  toastLog: ToastLogEntry[] = [];
  /** 手机布局（GameView 跟着 IS_TOUCH 设）：停留时长、排队上限按手机算 */
  toastTouch = IS_TOUCH;
  /** 正在打斗：锁定着活的目标、近战架势、或刚出手 / 挨打（combatT 不到 4 息）——闲讯先不弹 */
  toastFighting(): boolean {
    const c = this.combat; if (!c) return false;
    const L = c.lock;
    return (!!L && !L.dead) || c.combatT < 4 || !!c.brawl?.stance;
  }
  /** 「讯」角标上的数：没弹出过、也还没打开看过的消息（排着队、压着待补弹的不算） */
  get toastUnread(): number {
    let n = 0;
    for (const e of this.toastLog) if (!e.shown && !e.read && !this.toastQueue.some((t) => t.id === e.id) && !this.toastDeferred.some((t) => t.id === e.id)) n++;
    return n;
  }
  /** 打开消息记录：全部记成已读 */
  readToastLog() { let ch = false; for (const e of this.toastLog) if (!e.read) { e.read = true; ch = true; } if (ch) this.bumpToasts(); }
  private bumpToasts() { this.toasts = [...this.toasts]; this.toastListeners.forEach((f) => f()); }
  private logToast(t: Toast) {
    this.toastLog.push({ id: t.id, text: t.text, kind: t.kind ?? 'info', lv: t.lv ?? 'high', day: this.day, shown: false, read: false });
    if (this.toastLog.length > 40) this.toastLog.splice(0, this.toastLog.length - 40);
  }
  private markShown(t: Toast) { const e = this.toastLog.find((x) => x.id === t.id); if (e) e.shown = true; }
  toast(text: string, kind: Toast['kind'] = 'info', opt?: ToastOpt) {
    if (this.toasts.some((x) => x.text === text) || this.toastQueue.some((x) => x.text === text) || this.toastDeferred.some((x) => x.text === text)) return;
    const lv = kind === 'region' ? 'high' : toastLevel(text, kind, opt);
    if (lv === 'low' && this.feedAmbient && kind !== 'region' && isAmbient(text)) { this.enyuan.ambient(text); return; }   // 恩怨重做：闲讯收进江湖传音
    const t: Toast = { id: ++this.toastId, text, kind, lv };
    if (kind === 'region') { this.showToast(t); return; }
    this.logToast(t);
    const route = toastRoute(lv, toastMode(this.toastTouch), this.toastFighting());
    if (route === 'log') { this.bumpToasts(); return; }
    if (route === 'defer') { t.at = this.time; this.toastDeferred.push(t); if (this.toastDeferred.length > 6) this.toastDeferred.shift(); this.bumpToasts(); return; }
    this.enqueueToast(t);
  }
  private enqueueToast(t: Toast) {
    if (this.toasts.filter((x) => x.kind !== 'region').length >= this.toastMax) {
      if (t.lv === 'urgent') this.toastQueue.unshift(t); else this.toastQueue.push(t);   // 紧要的插到队头
      const cap = toastQueueCap(this.toastTouch);
      while (this.toastQueue.length > cap) {   // 太多了丢最旧的非紧要（只留在「讯」的记录里）；全是紧要的就丢最后一条
        const i = this.toastQueue.findIndex((x) => x.lv !== 'urgent');
        this.toastQueue.splice(i >= 0 ? i : this.toastQueue.length - 1, 1);
      }
      this.bumpToasts();   // 电脑的「还有 n 条」跟着变
      return;
    }
    this.showToast(t);
  }
  /** 每帧（有压着的闲讯时）：打完了就把还新鲜的补弹，太旧的只留记录；中途改成「只显示重要的 / 安静」的也不再弹 */
  private toastTick() {
    if (this.toastFighting()) return;
    const list = this.toastDeferred; this.toastDeferred = [];
    const mode = toastMode(this.toastTouch);
    for (const t of list) if (this.time - (t.at ?? 0) <= TOAST_DEFER_MAX_AGE && toastRoute(t.lv ?? 'low', mode, false) === 'show') this.enqueueToast(t);
    this.bumpToasts();
  }
  private showToast(t: Toast) {
    this.toasts = t.kind === 'region' ? [...this.toasts.filter((x) => x.kind !== 'region'), t] : [...this.toasts, t];
    if (t.kind !== 'region') this.markShown(t);
    this.toastListeners.forEach((f) => f());
    const ms = t.kind === 'region' ? 3200 : toastMs(t.lv ?? 'high', this.toastTouch, this.toastQueue.length > 0);
    setTimeout(() => {
      this.toasts = this.toasts.filter((x) => x.id !== t.id);
      let next: Toast | undefined;
      while (!next && this.toastQueue.length && this.toasts.filter((x) => x.kind !== 'region').length < this.toastMax) {
        const q = this.toastQueue.shift()!;
        // 排队期间打起来了：闲讯改成压着
        if (q.lv === 'low' && this.toastFighting()) { q.at = this.time; this.toastDeferred.push(q); } else next = q;
      }
      if (next) this.showToast(next); else this.toastListeners.forEach((f) => f());
    }, ms);
  }

  // ---------- 操作 ----------
  setZoom(z: number) { this.cam.targetZoom = clamp(z, this.minZoom, 1.6); }
  /** 镜头最远能拉到多远：平时 0.22；人在占山的大宗门地界里时再拉远一档（0.13），看得到一整座山 */
  get minZoom(): number {
    const m = this.terrain?.surface?.massifAt(this.player?.x ?? 0, this.player?.y ?? 0);
    return m && m.weight > 0.5 && isMajorSect(m.plan) ? 0.13 : 0.22;
  }
  zoomBy(f: number) { if (this.xukong.inVoid) this.xukong.zoomBy(f); else this.setZoom(this.cam.targetZoom * f); }
  /** 第三十五步：禁空（追兵的禁空令）剩余秒数 */
  noFlyT = 0;
  /** 能飞多高：筑基以上才上得了高空；炼气乘舟、体验御剑只在低空 */
  get altCeiling(): number { return this.jueyu.ceiling(this.mijing.active ? ALT.maxLow : this.hero.realm >= 2 ? ALT.max : ALT.maxLow); }   // 秘境里只许低空飞
  /** 自己按过升降键之后，这么久之内不被「锁定目标自动对齐」抢回去 */
  private altHold = 0;
  /**
   * 高度：站在地上是 0。飞着时——
   *   按住上升 / 下降键自己定高度；
   *   松手后若停在低空与高空之间，会吸到近的那一边；
   *   锁定了目标又没在按键，就自动飞到对方的高度（对方在地上则降到低空，近战够得着）。
   */
  private altitudeTick(dt: number) {
    const p = this.player, k = this.input.keys;
    if (!p.flying) { p.zTarget = 0; p.z += (0 - p.z) * Math.min(1, dt * 6); if (p.z < 0.5) p.z = 0; return; }
    if (this.xukong.corridor) { p.z = p.zTarget = this.xukong.h; return; }   // 正往天外升 / 从天外降回来：高度由 xukong 定
    // 第五轮返工：被触须缠住时高度由 seabeast 往下拖（原来这里把 zTarget 拉回悬停高度、又跟着锁定的触须升高，人根本拖不下去）
    if (this.seabeast?.hud.held) { p.z = stepAltitude(p.z, p.zTarget, dt); return; }
    const top = this.altCeiling;
    if (p.zTarget < ALT.lowMin) p.zTarget = ALT.hover;   // 刚起飞：先到悬停高度
    const dir = (k.has('ascend') || this.input.climb > 0 ? 1 : 0) - (k.has('descend') || this.input.climb < 0 ? 1 : 0);
    if (dir) {
      p.zTarget = Math.max(ALT.lowMin, Math.min(top, p.zTarget + dir * (dir > 0 ? ALT.climb : ALT.sink) * dt));
      this.altHold = 2.5;
      if (dir > 0 && p.zTarget >= top - 0.5 && top < ALT.max && this.blockedTimer <= 0) { this.toast('修为不够，飞不上高空——筑基之后方可。', 'info'); this.blockedTimer = 6; }
      // 已在高空的顶上还按着上升：再往上就是界壁（见 xukong.ts）
      this.xukong.pushSky(dir > 0 && top >= ALT.max && p.z >= top - 4, dt);
    } else {
      this.xukong.pushSky(false, dt);
      this.altHold = Math.max(0, this.altHold - dt);
      const lock = this.combat.lock;
      if (lock && !lock.dead && this.altHold <= 0) p.zTarget = Math.max(ALT.lowMin, Math.min(top, lock.z ?? 0));
      else p.zTarget = settleAltitude(p.zTarget, dt);
    }
    p.z = stepAltitude(p.z, p.zTarget, dt);
  }
  // ---------- 御剑巡航高度 ----------
  // 飞行高度 p.z 是「离脚下地面」的高度（空战判定都按它算），画面上人画在 地面高度 + p.z。
  // 以前御剑时地面高度取的是脚下那一点，镜头也盯着脚下那一点的地面——飞过丘陵沟壑，人和镜头跟着地形一起上下颠。
  // 现在另记一个「巡航基准」flyBase（绝对高度）：朝前方看一段路，取最高的地面，升得快、落得慢地追过去，
  // 永不低于脚下地面。画面上的抬升多出 (flyBase - 脚下地面)，镜头也盯 flyBase：小起伏看不出来，大山平滑越过、过了山慢慢落回。
  // 只改画面（st.lift 与镜头），p.z 的含义不变；打起来时（锁定、近战架势、刚出手挨打）收回 0，空战里看到的高低与判定一致。
  /** 巡航基准（绝对高度，与 terrain.surfaceHeight 同单位）；NaN = 还没起用 */
  flyBase = NaN;
  /** 巡航基准起作用的权重 0..1：御剑且不在打斗时趋向 1，落地 / 打斗时趋向 0（平滑过渡，不跳） */
  flyBaseW = 0;
  /** 这一帧画面上额外的抬升（立板高度单位，即与 st.lift 同单位） */
  cruiseLift = 0;
  private groundH(x: number, y: number): number { return this.offWorld ? 0 : this.terrain.surfaceHeight(x, y); }
  /** 画面上（含巡航抬升）主角脚底的绝对高度——测试和镜头用 */
  get cruiseGround(): number { const p = this.player, g0 = this.groundH(p.x, p.y); return this.flyBase === this.flyBase ? g0 + (this.flyBase - g0) * this.flyBaseW : g0; }
  private cruiseTick(dt: number) {
    const p = this.player, st = p.st, g0 = this.groundH(p.x, p.y);
    const special = this.offWorld || this.xukong.active || this.xukong.corridor || this.xukong.fight.on || !!this.seabeast?.hud.held;
    const on = p.flying && !special && !this.toastFighting() && !this.combat.brawl.pb.air;
    if (this.flyBase !== this.flyBase || special) this.flyBase = g0;
    if (p.flying && !special) {
      // 朝飞行方向看 0.25 / 0.5 / 0.9 / 1.4 息后的地面，取最高：山还没到脚下，基准就已经抬起来了
      let want = g0;
      for (const t of [0.25, 0.5, 0.9, 1.4]) want = Math.max(want, this.groundH(p.x + st.vx * t, p.y + st.vy * t));
      const k = want > this.flyBase ? 3.5 : 1;   // 升得快（约 0.3 息）、落得慢（约 1 息）
      this.flyBase += (want - this.flyBase) * Math.min(1, dt * k);
      if (Math.abs(want - this.flyBase) < 0.5) this.flyBase = want;   // 追上了就贴住（悬停时额外抬升正好归 0）
    } else if (this.flyBaseW < 0.01) this.flyBase = g0;   // 已落稳：基准归位，下次起飞从脚下起
    if (this.flyBase < g0) this.flyBase = g0;   // 永不钻进地里
    this.flyBaseW += ((on ? 1 : 0) - this.flyBaseW) * Math.min(1, dt * (p.flying ? 2.5 : 3.5));   // 落下遁光时约 1 息落回地面（从巡航高处落下也不一下砸到底）
    if (this.flyBaseW < 0.001 && !on) this.flyBaseW = 0;
    // 画面抬升 = 地面高度 + lift × boost（boost 随镜头俯角变，见 scene.ts），所以绝对高度差要除回 boost
    const boost = (this.renderer as unknown as { hd?: { boost: number } } | undefined)?.hd?.boost ?? Math.SQRT2;
    this.cruiseLift = (this.flyBase - g0) * this.flyBaseW / boost;
  }
  toggleFly() {
    if (this.xukong.active || this.xukong.corridor || this.xukong.fight.on) { this.toast('身在高天之上，脚下无处可落。', 'info'); return; }
    if (this.yuanying?.active) { this.toast('元婴本就凌空，无须御器。', 'info'); return; }
    if (!this.player.flying && this.noFlyT > 0) { this.toast(`禁空之力未散，遁光提不起来！（${Math.ceil(this.noFlyT)} 息）`, 'warn'); return; }
    if (!this.player.flying && this.jueyu.refuseFly()) return;   // 绝域：泅水时法力不够起不了飞
    this.stand(); this.gathering = null;
    if (this.player.flying && !this.canLand()) return;
    this.player.flying = !this.player.flying;
    const native = this.canFlyNative;
    const fid = this.hero.equip?.flight, fname = fid ? itemDef(fid).name : '';
    this.toast(this.player.flying ? (fid === 'art_fenglei' ? `云雷双翼一展，雷光缭绕，化作一道雷遁。${keyNote('fly', '菜单里点「落地」')}` : fid ? `祭出${fname}，乘风而起。${keyNote('fly', '菜单里点「落地」')}` : native ? `祭起法器，御剑而起。${keyNote('fly', '菜单里点「落地」')}` : '（体验模式）御剑而起，可自由飞越山海。') : '按下遁光，落地步行。');
    audio.sfx(this.player.flying ? 'whoosh' : 'land');
    // 头一回起飞：说一下升降怎么按
    // 第六轮返工：入门一课的「御剑」那一步自己教升降（或已经上过这一课），这条旧提示不再另弹一遍
    if (this.player.flying && !this.altHinted) { this.altHinted = true; if (!this.tutorial.mutes('fly')) this.toast(`${pressKey('ascend', '') ? `飞行时按住 ${ascendLabel()} 上升、${keyLabel(bindOf('descend'))} 下降` : '飞行时按住摇杆上方的「升」「降」调高度'}${this.hero.realm >= 2 ? '，可上高空' : '（筑基后可上高空）'}；锁定了目标会自动飞到对方的高度。`, 'info'); }
    this.updateUI();
  }
  private altHinted = false;
  setDestination(wx: number, wy: number, name?: string) {
    const B = this.bounds;
    this.destination = { x: clamp(wx, B.x0, B.x1), y: clamp(wy, B.y0, B.y1), name };
  }
  teleport(wx: number, wy: number) {
    if (this.mijing?.active && !(wx >= WORLD_W)) this.mijing.leave('force');
    if (this.xukong?.fight.on && !(wx >= WORLD_W)) this.xukong.fight.finish('force');
    if (this.yuanying?.active) this.yuanying.back('force');
    this.player.x = wx; this.player.y = wy; this.player.st.x = wx; this.player.st.y = wy; this.cam.x = wx; this.cam.y = wy; this.destination = null; this.deckAbs = null; this.flyBase = NaN;   // 瞬移：巡航基准从新落脚处重算
    this.combat?.landed();   // 第六轮返工：传送、换图落地给几息落地保护
    { const d = this.seamDepth; this.seamMark = d > 0 ? d : 0; }   // v0.8.1：传送进交界地带不折算路上的天数（没走过那段路；原来一传进草原深处就一下子过去几十天）
    this.revealAround(true);
    this.renderer?.resetStill();
    this.updateUI();
  }
  setWeather(k: WeatherKind | null) { this.weather.forced = k; this.weather.timer = 0; }

  screenToWorld(sx: number, sy: number) {
    const r = this.canvas.getBoundingClientRect();
    if (this.renderer?.hd) return this.renderer.hd.unproject(sx - r.left, sy - r.top);   // HD2D：从相机打一条射线到地面
    const z = this.cam.zoom;
    return { x: this.cam.x + (sx - r.left - r.width / 2) / z, y: this.cam.y + (sy - r.top - r.height / 2) / z };
  }

  private unbind?: () => void;
  /** 闪避键正当上升键按着（松开时把 ascend 一并放掉） */
  private dodgeUp = false;
  private bindInput() {
    // 方向键 / Shift 的备用映射（键位表里没被占用时生效，保持旧版手感）
    const ALIAS: Record<string, string> = { arrowup: 'w', arrowdown: 's', arrowleft: 'a', arrowright: 'd', shift: 'shift', pagedown: 'descend' };   // PageDown：下降的备用键
    const CAVE_KEYS = new Set(['map', 'char', 'bag', 'alchemy', 'seclude', 'skills', 'zhenfa', 'wardrobe', 'pets', 'lover', 'hearts', 'chronicle', 'relations', 'war', 'help']);
    // v0.52.2：键位改由 core/keymap 派发；默认值与旧版一致，玩家可在设置里自改
    // 按住 Shift 疾行时 e.key 是「!@#…」而不是数字：数字键一律按物理键位取，技能栏才放得出来
    const keyOf = (e: KeyboardEvent) => { const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code ?? ''); return m ? m[1] : e.key.toLowerCase(); };
    const kd = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const k = keyOf(e);
      const act = actionOfKey(k);
      const canon = act ? canonicalOf(act) : '';
      if (e.repeat && (act ? !canon : 'mfzecblpqrkthjgn?'.includes(k))) return;
      if (this.modal) return;
      // v0.52.5：洞府场景里只放行界面类按键（移动 / 交互由场景自己处理）
      if (this.inCave) {
        if (!act || !CAVE_KEYS.has(act) || this.hero.dead) return;
        if (act === 'map') this.onOpenMap?.();
        else if (act === 'pets') this.talkPet();
        else if (act === 'lover') this.talkLover();
        else if (act === 'hearts') this.onPanel?.('friends');
        else if (act === 'chronicle' || act === 'relations' || act === 'help') this.openModal({ kind: act } as any);
        else if (act === 'war') this.openDialog(this.war.inboxNode());
        else this.onPanel?.(act as any);
        return;
      }
      if (act === 'dodge') this.input.keys.add('dodge');   // r7：闪避键正按着（近战重击「出手那一刻按住上升键＝上挑」也认它；松开时清掉）
      if (this.combat.brawl.key(act, e.repeat)) { e.preventDefault(); return; }   // 近战：架势切换键；架势里 Shift 欺身、空格追击 / 脱困
      // 御剑、虚空、海渊里闪避本来就不起作用：闪避键（默认空格）按住＝上升（近战没用掉这一下才算）
      // 近战按住右键定向时，闪避键按住＝选「上挑」：只记成 ascend，不闪避、不追击
      const aimUp = act === 'dodge' && this.combat.brawl.aiming;
      if (act === 'dodge' && (this.isFlying || this.xukong.active || this.jueyu.deep.active || aimUp)) { this.input.keys.add('ascend'); this.dodgeUp = true; }
      if (aimUp) { e.preventDefault(); return; }
      // 只记「方位键」：改键后移动/闪避的旧逻辑仍读 w a s d shift；
      // 方向键与 Shift 在未被占用的前提下仍当备用键（沿用旧手感），被占用则不再偷偷生效
      if (canon) {
        this.input.keys.add(canon);
        // v0.52.5：Shift 轻点 = 走 / 跑开关（御剑时 = 遁光加速开关）；按住超过 0.35 秒则视为「临时疾行」，松手即停
        if (act === 'run' && !e.repeat) { this.runDown = this.time; this.input.run = !this.input.run; this.updateUI(true); }
      }
      else if (!act && ALIAS[k]) this.input.keys.add(ALIAS[k]);
      if (act === 'map') { if (this.mijing.active) this.toast('秘境之中，舆图无用——右上角是秘境图。'); else this.onOpenMap?.(); }
      if (this.paused || this.hero.dead) return;
      // B 版 HD2D 相机：[ ] 每次转 45°（记住朝向）
      if (!act && this.renderer?.hd && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
        if (!e.repeat) {
          this.camYawTarget += (e.code === 'BracketLeft' ? -1 : 1) * Math.PI / 4;
          try { localStorage.setItem('taixu.hd2d.yaw', String(((this.camYawTarget % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2))); } catch { /* */ }
        }
        return;
      }
      // 身在虚空：只放行遁空、缩放和看自己的那几个面板，其余（起落、打坐、施法、交互……）都没有对象
      if (this.xukong.active) {
        if (act === 'dunkong') { if (this.xukong.inVoid) this.dunkong.toggle(); }
        else if (act === 'interact') this.xukong.interact();
        else if (act === 'zoomIn') this.zoomBy(1.2); else if (act === 'zoomOut') this.zoomBy(1 / 1.2);
        else if (act === 'char' || act === 'bag' || act === 'skills' || act === 'wardrobe') this.onPanel?.(act);
        else if (act === 'help' || k === 'f1') { e.preventDefault(); this.openModal({ kind: 'help' }); }
        if (k === 'f3') { e.preventDefault(); this.showPerf = !this.showPerf; }
        if (k.startsWith('arrow') || k === ' ' || k === 'pageup' || k === 'pagedown') e.preventDefault();
        return;
      }
      if (!act && !e.repeat && modx?.key(k)) return;   // v0.56：模组的快捷键（只用游戏没占的键）
      switch (act) {
        case 'fly': this.toggleFly(); break;
        case 'sit': if (!this.enyuan.squadKey()) this.toggleSit(); break;   // 恩怨重做：带着队友交战时，打坐键改开队伍指令菜单
        case 'recall': this.home.recall(); break;
        case 'dunkong': this.dunkong.toggle(); break;
        case 'boat': this.jueyu.boat.toggle(); break;   // 收官 B3：灵舟
        case 'pets': this.talkPet(); break;
        case 'lover': this.talkLover(); break;
        case 'gather': this.tryGather(); break;
        case 'char': this.onPanel?.('char'); break;
        case 'bag': this.onPanel?.('bag'); break;
        case 'alchemy': this.onPanel?.('alchemy'); break;
        case 'seclude': this.onPanel?.('seclude'); break;
        case 'sense': this.senseBurst(); break;
        case 'lock': e.preventDefault(); this.combat.cycleLock(); break;
        case 'skills': this.onPanel?.('skills'); break;
        case 'zhenfa': this.onPanel?.('zhenfa'); break;
        case 'wardrobe': this.onPanel?.('wardrobe'); break;
        case 'conceal': this.toggleConceal(); break;
        case 'interact': this.interact(); break;
        case 'town': this.enterTown(); break;
        case 'hearts': this.onPanel?.('friends'); break;
        case 'chronicle': this.openModal({ kind: 'chronicle' }); break;
        case 'relations': this.openModal({ kind: 'relations' }); break;
        case 'war': this.openDialog(this.war.inboxNode()); break;
        case 'help': e.preventDefault(); this.openModal({ kind: 'help' }); break;
        case 'zoomIn': this.zoomBy(1.2); break;
        case 'zoomOut': this.zoomBy(1 / 1.2); break;
        case 'dodge': this.combat.dodge(); break;
        default: break;
      }
      // 技能栏（v0.52.5：可改键，默认 1–5 / 鼠标左右 / X / V）；固定键：F1 指南、F3 性能
      if (act && act.startsWith('slot')) this.combat.castSlot(+act.slice(4) - 1);
      // 宣传录屏 / 导演实机演武快捷键：Ctrl+Shift+1/2/3/4 预览筑基/结丹/元婴/化神天象（不改存档数值），Ctrl+Shift+H 切换纯享无UI录屏
      if (e.ctrlKey && e.shiftKey && !e.repeat) {
        const raw = e.code || '';
        if (raw === 'KeyH' || k === 'h') {
          e.preventDefault();
          this.cinemaHideHud = !this.cinemaHideHud;
          this.updateUI(true);
          return;
        }
        const mapKind: Record<string, TxKind> = { Digit1: 'zhuji', Digit2: 'jiedan', Digit3: 'jieying', Digit4: 'huashen', '1': 'zhuji', '2': 'jiedan', '3': 'jieying', '4': 'huashen', '!': 'zhuji', '@': 'jiedan', '#': 'jieying', '$': 'huashen' };
        const txk = mapKind[raw] ?? mapKind[k];
        if (txk) {
          e.preventDefault();
          if (this.inCave) this.leaveCave();
          this.closeModal(true);
          (this.onPanel as any)?.('', false);
          this.tianxiang.start(txk, true, this);
          this.updateUI(true);
          return;
        }
      }
      if (this.tianxiang.active && (k === 'escape' || k === ' ') && this.tianxiang.t > 2.5) {
        e.preventDefault();
        this.tianxiang.skip(this);
        return;
      }
      if (k === 'f1') { e.preventDefault(); this.openModal({ kind: 'help' }); }
      if (k === 'f3') { e.preventDefault(); this.showPerf = !this.showPerf; }
      if (k.startsWith('arrow') || k === ' ' || (act && ['up', 'down', 'left', 'right', 'dodge'].includes(act))) e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => {
      const k = keyOf(e);
      const act = actionOfKey(k);
      this.input.keys.delete(k);
      if (act === 'dodge' && this.dodgeUp) { this.dodgeUp = false; this.input.keys.delete('ascend'); }
      if (act === 'dodge') this.input.keys.delete('dodge');
      if (act) { const c = canonicalOf(act); if (c) this.input.keys.delete(c); if (act === 'run' && this.time - this.runDown > 0.35 && this.input.run) { this.input.run = false; this.updateUI(true); } }
      else if (ALIAS[k]) this.input.keys.delete(ALIAS[k]);
    };
    const blur = () => this.input.keys.clear();
    const wheel = (e: WheelEvent) => { e.preventDefault(); this.zoomBy(e.deltaY > 0 ? 1 / 1.12 : 1.12); };
    // 指针：点击移动 / 双指缩放
    const pointers = new Map<number, { x: number; y: number; sx: number; sy: number }>();
    let pinchStart = 0, pinchZoom = 1, moved = false;
    const pd = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && !this.inCave && this.combat.brawl.mouse(e.button)) {   // 近战：中键切换架势；架势里左键轻击、右键重击（按住是定向）
        e.preventDefault(); audio.unlock();
        if (this.combat.brawl.aiming) this.canvas.setPointerCapture?.(e.pointerId);   // 按住右键定向：松手落在界面上也收得到
        return;
      }
      this.canvas.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
      moved = false;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = Math.hypot(a.x - b.x, a.y - b.y); pinchZoom = this.cam.targetZoom;
      }
    };
    const pm = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') { const w = this.screenToWorld(e.clientX, e.clientY); const m = this.input.mouse; m.sx = e.clientX; m.sy = e.clientY; if (Math.hypot(w.x - m.x, w.y - m.y) > 3) { m.x = w.x; m.y = w.y; m.t = this.time; m.active = true; } }
      const pt = pointers.get(e.pointerId);
      if (!pt) return;
      pt.x = e.clientX; pt.y = e.clientY;
      if (Math.hypot(pt.x - pt.sx, pt.y - pt.sy) > (e.pointerType === 'mouse' ? 10 : 16)) moved = true;   // r13-lockbtn：手指点下去会抖几像素，触屏放宽到 16，免得点敌人被当成拖动
      if (pointers.size === 2 && pinchStart > 0) {
        const [a, b] = [...pointers.values()];
        this.setZoom(pinchZoom * Math.hypot(a.x - b.x, a.y - b.y) / pinchStart);
      }
    };
    const pu = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && this.combat.brawl.mouseUp(e.button)) { e.preventDefault(); return; }   // 近战：松开右键＝定向出手
      const pt = pointers.get(e.pointerId);
      const wasPinch = pointers.size >= 2;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStart = 0;
      const mact = actionOfKey('mouse' + e.button);
      if (this.inCave || this.modal || this.paused || this.xukong.active) return;
      if (pt && !moved && !wasPinch && mact === 'dodge' && !this.hero.dead) { this.combat.dodge(); return; }
      // v0.52.5：鼠标左右键绑技能栏（默认 6 / 7）。左键：神识内有敌（或已在战斗中）就施放，否则仍是点地前往；右键：直接施放
      // 收官 D：点中摊主头顶的招牌——近了开摊位，远了先走过去（排在施法、点人之前）
      if (pt && !moved && !wasPinch && e.button === 0 && !this.hero.dead && this.stall.click(e.clientX, e.clientY)) { this.input.mouse.t = -99; audio.unlock(); return; }
      if (pt && !moved && !wasPinch && e.pointerType === 'mouse' && mact && mact.startsWith('slot') && !this.hero.dead) {
        const w0 = this.screenToWorld(e.clientX, e.clientY);
        const P0 = this.player;
        const cr = this.canvas.getBoundingClientRect();
        const clicked = pickAtScreen(this, e.clientX - cr.left, e.clientY - cr.top, w0.x, w0.y) ?? this.combat.enemies.find((q) => !q.dead && Math.hypot(q.x - w0.x, q.y - 30 - w0.y) < 80);   // r11-lock：按身子在屏幕上的投影点选
        const foeNear = !!clicked || this.combat.inCombat || this.combat.enemies.some((q) => !q.dead && q.aggro && Math.hypot(q.x - P0.x, q.y - P0.y) < this.senseRadius);
        if (e.button !== 0 || foeNear) {
          if (clicked) { this.combat.lock = clicked; this.combat.manual = true; }
          this.combat.castSlot(+mact.slice(4) - 1); this.input.mouse.t = -99; audio.unlock();
          return;
        }
      }
      if (pt && !moved && !wasPinch && e.button === 0 && !this.hero.dead) {
        const w = this.screenToWorld(e.clientX, e.clientY);
        // 点击敌人：锁定
        // r11-lock：先按身子在屏幕上的投影找（飞着的、高大的都点得中），找不到再按脚下；点的正是手动锁着的那位 → 取消锁定（再点一次取消）
        // r13-lockbtn：手指点的范围比鼠标宽（最小半宽 38 像素，鼠标 26）
        const cr = this.canvas.getBoundingClientRect();
        const foe = pickAtScreen(this, e.clientX - cr.left, e.clientY - cr.top, w.x, w.y, e.pointerType === 'mouse' ? 26 : 38) ?? this.combat.enemies.find((q) => !q.dead && Math.hypot(q.x - w.x, q.y - 30 - w.y) < 70 && Math.hypot(q.x - this.player.x, q.y - this.player.y) < this.senseRadius);
        if (foe && this.hanshan.click(foe)) { this.input.mouse.t = -99; audio.unlock(); return; }   // r7：点撼山客是搭话，不是锁定
        if (foe && foe === this.combat.lock && this.combat.manual) { this.combat.unlock(); this.input.mouse.t = -99; audio.unlock(); return; }
        if (foe) { this.combat.lock = foe; this.combat.manual = true; this.input.mouse.t = -99; audio.unlock(); return; }
        // 点击某人：走近了直接开口，远则一路跟过去（手机没键盘，这是最自然的交谈方式）
        // 收官 P8（丁）：点屋里的掌柜 / 执事：近了开口，远了先走到柜台前
        if (this.indoor.click(w.x, w.y)) { this.pendingGather = null; this.input.mouse.t = -99; audio.unlock(); return; }
        const who = this.npcs.talkTargetAt(w.x, w.y, 52);
        if (who) {
          this.pendingGather = null;
          const dd = Math.hypot(who.st.x - this.player.x, who.st.y - this.player.y);
          if (dd < 190) { this.npcs.focus = who; this.destination = null; this.pendingTalk = null; this.interact(); }
          else { this.pendingTalk = who.d.id; this.setDestination(who.st.x, who.st.y + 34); }
          this.input.mouse.t = -99; audio.unlock();
          return;
        }
        // 点击灵物：走过去并采集
        const n = this.nodes.nearest(w.x, w.y, 60, this.day);
        if (n && Math.hypot(n.x - this.player.x, n.y - this.player.y) < this.senseRadius) {
          if (Math.hypot(n.x - this.player.x, n.y - this.player.y) < GATHER_RANGE) this.tryGather();
          else { this.setDestination(n.x, n.y + 30); this.pendingGather = n; }
        } else { this.setDestination(w.x, w.y); this.pendingGather = null; this.pendingTalk = null; }
        audio.unlock();
      }
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);
    this.canvas.addEventListener('wheel', wheel, { passive: false });
    this.canvas.addEventListener('pointerdown', pd);
    this.canvas.addEventListener('pointermove', pm);
    this.canvas.addEventListener('pointerup', pu);
    this.canvas.addEventListener('pointercancel', pu);
    const pl = () => { this.input.mouse.active = false; };
    this.canvas.addEventListener('pointerleave', pl);
    const cm = (e: Event) => e.preventDefault();
    this.canvas.addEventListener('contextmenu', cm);
    this.unbind = () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', blur);
      this.canvas.removeEventListener('wheel', wheel);
      this.canvas.removeEventListener('pointerdown', pd);
      this.canvas.removeEventListener('pointermove', pm);
      this.canvas.removeEventListener('pointerup', pu);
      this.canvas.removeEventListener('pointercancel', pu);
      this.canvas.removeEventListener('pointerleave', pl);
      this.canvas.removeEventListener('contextmenu', cm);
    };
  }
  pendingGather: GatherNode | null = null;
  /** v0.52.4 手机：点击某人后跟着走，到跟前自动交谈 */
  pendingTalk: string | null = null;
}


/** r10：分段建地形时各段在加载画面上的说法（跟着 Terrain.buildPhase 走，是真实阶段） */
const BUILD_PHASE_TEXT: Record<string, string> = {
  coast: '推演{map}地脉…', mountain: '隆起群山万壑…', climate: '分判寒暑燥湿…', river: '疏浚江河湖海…',
  road: '开辟官道山径…', site: '营建城郭宗门…', surface: '夯实大地…',
};
export async function createGame(onProgress: (p: number, msg: string) => void) {
  const nm = MAP_NAME[ACTIVE_MAP];
  const say = (k: string) => (BUILD_PHASE_TEXT[k] ?? BUILD_PHASE_TEXT.coast).replace('{map}', nm);
  const breathe = () => new Promise((r) => setTimeout(r, 0));
  onProgress(0.02, say('coast'));
  await breathe();
  // 南荒放大后建地形要三四秒：分步做，每四十毫秒让一下线程、报一次进度，加载画面不会僵住
  if (!TERRAINS.has(ACTIVE_MAP) && !PREBUILD.has(ACTIVE_MAP)) {
    const t = new Terrain(); let n = 0, last = performance.now();
    for (const _ of t.buildSteps()) {
      void _; n++;
      if (performance.now() - last > 40) { onProgress(0.04 + 0.78 * (1 - Math.exp(-n / 420)), say(t.buildPhase)); await breathe(); last = performance.now(); }
    }
    TERRAINS.set(ACTIVE_MAP, t);
  }
  const terrain = activeTerrain();
  // r10：全图缩略（一秒上下）也分段画、中间让出线程；画好放进缓存，new Game 里的 overviewOf 直接拿现成的
  if (!OVERVIEWS.has(terrain)) {
    onProgress(0.84, '绘制山河舆图…'); await breathe();
    const it = terrain.overviewSteps(1); let last = performance.now();
    for (;;) { const r = it.next(); if (r.done) { OVERVIEWS.set(terrain, r.value); break; } if (performance.now() - last > 40) { await breathe(); last = performance.now(); } }
  }
  onProgress(0.94, '安排天地气运…');
  await breathe();
  const g = new Game(terrain);
  g.overview = overviewOf(terrain);
  onProgress(1, '画卷已成');
  return g;
}
