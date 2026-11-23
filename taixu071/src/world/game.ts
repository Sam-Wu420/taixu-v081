import { effectiveFlightMount } from './flightMount';
import { enemyAtPointer } from './farView';
import { baseSenseRange, detailSenseRange, awarenessBaseRange, effectiveAwarenessRange, senseFitZoom, SENSE_BURST_MULTIPLIER } from './senseRange';
import { SLOT_KEYS, AUTO_SAVE_KEY } from './saveKeys';
export { SLOT_KEYS } from './saveKeys';
import { followCamera } from '../core/cameraFollow';
import { JOY_RUN_MAG } from '../core/joystick';
// 游戏核心：状态、循环、输入、相机；第一步大地图 + 第二步修炼与角色
import { NpcChat } from './npcchat';
import { TUNING } from '../data/tuning';
import { modx } from '../mod/hooks';
import { LivingWorld } from './living';
import { prof } from '../core/prof';
import { SaveNumberError, validateSaveNumbers, validateSaveForLoad, stringifySave, SAVE_VERSION } from './saveGuard';
import { FramePacer, FRAME_LIMIT_KEY, parseFrameLimit, adaptiveFrameSeconds, type FrameLimit } from '../core/framePacer';
import { noteFrame as lodNote } from '../gfx/lod';
import { ARTS as ARTS_ALL } from '../data/arts';
import { Terrain } from './terrain';
import { Renderer } from './render';
import { REALMS, realmDef, realmName, slowWalkCap, flyCruiseCap, MAJOR_BREAKS, isAtRealmCap, realmCapDesc, realmCapLabel } from '../data/realms';
import { renameText } from '../data/rename';
import { LOCATIONS, LocDef, WORLD_SCALE, WORLD_W, WORLD_H, regionAt, Region, ACTIVE_MAP, ACTIVE_WORLD, ALL_MAP_IDS, LOC_BY_ID, MapId, MAP_NAME, MAP_IDS, fromLegacyWorld, mapSize } from '../data/world';
import { worldOfMap, worldDef, worldSpeedScale, planeDefaultEnemyId, type WorldId } from '../data/worldHierarchy';
import { Travel, encodeFog, decodeFog, canCrossWorld } from './travel';
import * as HP from './higherPlane';
import { parseFog } from './fog';
import { clamp } from '../core/rng';
import { audio } from './audio';
import { Tianxiang, TxKind } from './tianxiang';
import { Scenery } from './scenery';
import { CharState, HANLI_LOOK, Look, dressLook, normalizeWardrobe, type Wardrobe } from '../gfx/character';
import { Life } from './life';
import { Weather, WEATHER_NAME, WeatherKind } from './weather';
import { NodeField, GatherNode } from './nodes';
import { itemDef, ITEMS } from '../data/items';
import { actionOfKey, bindOf, canonicalOf, keyLabel } from '../core/keymap';
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
import { ENEMIES, ENEMY_LIST } from '../data/enemies';
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
import { BEAUTY_BY_ID } from '../data/beauties';
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
import { WorldState, newWorldState, migrateSectState, ensureWorldSlice, SECT_RANKS } from './worldstate';
import { dirName } from './sites';
import { ITEM_LIST } from '../data/items';
import { locHere } from '../data/world';
import {
  DAYS_PER_YEAR,
  DESTINATION_ARRIVE_RADIUS,
  GUIDE_ARRIVE_RADIUS,
  isActiveWorldMap,
  withinArrivalRadius,
} from './contracts';
import type { Modal, DNode, DOpt, Shop } from './modal';
const TOUCH = IS_TOUCH;

/** 第四十五步：大境界突破过场（结丹 / 结婴 / 化神） */
export interface AscendInfo { kind: 'jiedan' | 'jieying' | 'huashen'; ok: boolean; name: string; age: number; realm: string; life: number; place: string }

export const DAYS_PER_SEC = TUNING.daysPerSec;    // 常态光阴流速（240 秒 = 1 日）
export const MEDITATE_SPEED = TUNING.meditateSpeed; // 打坐时光阴倍率（120×，即 2 秒 = 1 日）
export const DAY_CYCLE = TUNING.dayCycle;         // 昼夜循环（现实秒）
export const FOG_CELL = 1000;
export const FOG_W = Math.ceil(WORLD_W / FOG_CELL);
export const FOG_H = Math.ceil(WORLD_H / FOG_CELL);
export const GATHER_RANGE = 130;
export const GATHER_TIME = 1.2;
const LEGACY_KEY = 'fanren_step1_save';
export const SLOT_NAMES = ['自动存档', '存档一', '存档二', '存档三'];

// 存档压缩（savezip.ts）：活世界大档 1MB 级，localStorage 同源只有约 5MB，
// 四格 + 碑林很快顶满（玩家看到的是「本地存档失败」）。写入压缩、读出解压；
// 旧明文档 unzipSave 原样透传，老档透明兼容，读到一次重新存档就换成压缩格式。
import { unzipSave, zipSave, zipSaveAsync } from './savezip';
import { protectedDrops, type SavedDrops } from './savedDrops';
import {
  migrateSaveFogs,
  migrateSavedDrops,
  migrateSavedNpcs,
  migrateWorldStateAndCoords,
  resolveSaveLocation,
} from './saveMigration';

export interface PlayerState {
  name: string; x: number; y: number;
  facing: 1 | -1; moving: boolean; flying: boolean; walkT: number;
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

export type ToastLevel = 'urgent' | 'high' | 'low';
export type ToastMode = 'all' | 'important' | 'quiet';
export interface Toast { id: number; text: string; kind?: 'info' | 'warn' | 'region' | 'good'; lv?: ToastLevel; at?: number }
/** 「讯」里的一条记录：弹没弹过（shown）、看没看过（read） */
export interface LogToast { id: number; text: string; kind: Toast['kind']; lv: ToastLevel; day: number; shown: boolean; read: boolean }
export const TOAST_MODE_KEY = 'fanren.toastmode';
export const TOAST_MODE_OPTIONS: { id: ToastMode; name: string; desc: string }[] = [
  { id: 'all', name: '全部显示', desc: '所有消息都弹出；打斗中闲讯暂缓' },
  { id: 'important', name: '只显示重要的', desc: '追杀、危险、突破、引导、要紧物品照弹；神识中的旁人事件、传闻只记进「讯」' },
  { id: 'quiet', name: '安静', desc: '只弹追杀、危险这类紧要的；其余都记进「讯」' },
];
/** 神识路人事件 / 江湖传闻这类"闲讯"的开头特征：安静档里只记不弹 */
const LOW_MSG_RX = /^(神识中[：:]|江湖传闻|【传闻】|传闻[：:]|得到一则传闻|远处|街上|风里)/;
function toastLevelOf(text: string, kind?: Toast['kind']): ToastLevel {
  if (kind === 'warn') return 'urgent';
  if (LOW_MSG_RX.test(text) && !text.includes('你')) return 'low';
  return 'high';
}
/** 按档位决定：弹出 / 只记进「讯」/ 打斗中暂缓 */
function toastBudget(mode: ToastMode, lv: ToastLevel, fighting: boolean): 'show' | 'log' | 'defer' {
  if (lv === 'urgent') return 'show';
  if (lv === 'high') return mode === 'quiet' ? 'log' : 'show';
  return mode !== 'all' ? 'log' : fighting ? 'defer' : 'show';
}
function toastMs(lv: ToastLevel, touch: boolean, busy: boolean) {
  return touch ? (lv === 'urgent' ? (busy ? 3000 : 3600) : busy ? 2400 : 3000) : busy ? 3000 : 4200;
}
export function readToastMode(): ToastMode {
  try { const v = localStorage.getItem(TOAST_MODE_KEY); if (v === 'all' || v === 'important' || v === 'quiet') return v; } catch { /* ignore */ }
  return IS_TOUCH ? 'important' : 'all';
}
export function saveToastMode(m: ToastMode) { try { localStorage.setItem(TOAST_MODE_KEY, m); } catch { /* ignore */ } }
export interface SlotMeta { slot: number; key: string; name: string; empty: boolean; invalid?: boolean; unavailable?: boolean; time?: number; realm?: string; year?: number; region?: string; age?: number }
export interface SecludeInterrupt { kind: 'sect_attack' | 'war_call' | 'event' | 'sos'; title: string; desc: string; remainDays: number }
export interface SeclusionReport { days: number; from: string; to: string; expGain: number; msgs: Msg[]; reason: string; interrupted?: SecludeInterrupt }
export interface SeclusionProgress {
  done: boolean;
  phase: 'meditate' | 'catchup';
  daysDone: number;
  daysTarget: number;
  progress: number;
  exp: number;
  need: number;
  realmText: string;
  age: number;
  maxLife: number;
  report?: SeclusionReport;
}
export interface SeclusionSession {
  step(budgetMs?: number): SeclusionProgress;
  cancelEarly(): SeclusionProgress;
}

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
  exploredCount = 0;
  /** 各图的探索迷雾（当前图的在 explored 里，存档时写回） */
  fogs: Partial<Record<MapId, string>> = {};
  /** 逆返下界天道排斥满溢时延后到帧末执行跨界回弹，避免战斗遍历途中切图 */
  private pendingPlaneReturn: WorldId | null = null;
  /** 其他地域尚未拾取的受保护补发物；当前地域以战斗掉落列表为准。 */
  savedDrops: SavedDrops = {};
  travel!: Travel;
  /** 换图动画（由界面设置；动画结束后调用 switchMap） */
  onTravel?: (to: MapId, via: 'portal' | 'edge') => void;
  /** 第四十五步：结丹 / 结婴 / 化神过场 */
  onAscend?: (a: AscendInfo) => void;
  private pendingAscend: AscendInfo['kind'] | null = null;
  revealAll = false;
  debugSeeAll = false;            // 调试：无视神识
  revealT = new Map<number, number>(); // 迷雾格揭开时间（用于淡出）
  // 目的地：自动寻路目标。带 name 才能在「取消导航 / 已到达」时说出地名；followNpcId 用于动态追踪会走动的目标 NPC
  destination: { x: number; y: number; name?: string; followNpcId?: string } | null = null;
  /** v0.73：长途托管御剑赶路状态（遇敌 / 劫粮 / 低蓝自动停驻） */
  autoFlight: { x: number; y: number; name: string; followNpcId?: string } | null = null;
  cam = { x: 0, y: 0, zoom: 0.8, targetZoom: 0.8 };
  /** joyMag：摇杆推力（0–1），推到底自动疾行；run：手机「疾行」按钮的开关 */
  input = { keys: new Set<string>(), joy: { x: 0, y: 0 }, joyMag: 0, run: false, mouse: { x: 0, y: 0, t: -99, active: false } };
  private lastJoyRun = false;
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
  /**
   * v0.71：某个全屏面板正开着（角色 / 宗门 / 设置 / 手机抽屉…）。
   * 世界此刻完全静止，主循环据此停画——否则每帧照旧整幅重画，按钮点击只能排在它后面。
   */
  uiHold = false;
  /** 面板打开后先补几帧当背景，之后收手（0 = 不在停画状态） */
  private holdFrames = 0;
  /** 强制下一帧重画：改尺寸、换地图、出错恢复之类的时点要调一次 */
  requestFrame() { this.holdFrames = 0; }
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
  /** 「讯」：最近 40 条消息（弹出过的也记，便于回看） */
  toastLog: LogToast[] = [];
  toastQueue: Toast[] = [];
  toastDeferred: Toast[] = [];
  toastMax = TOUCH ? 1 : 2;
  toastListeners = new Set<() => void>();
  gathering: { node: GatherNode; t: number } | null = null;
  gatherTarget: GatherNode | null = null;
  timeScale = 1;
  private uiTimer = 0; private regionTimer = 0; private saveTimer = 0; private blockedTimer = 0; private gatherScan = 0;
  /** v0.73：打坐防昼夜频闪冻结时间戳 + 分帧错峰日结算队列 */
  private sitClockFreeze: number | null = null;
  private sitDays = 0;
  private dailyQueue: { d: number; slot: number }[] = [];
  /** 自动存档失败只提醒一次（配额满 / 无存储权限时不要每二十秒弹一次） */
  private saveWarned = false;
  private lastCastSeq = 0;
  private currentRegionId = '';
  private last = 0;
  frameLimit: FrameLimit = 60;
  setFrameLimit(value: unknown) {
    this.frameLimit = parseFrameLimit(value);
    try { localStorage.setItem(FRAME_LIMIT_KEY, String(this.frameLimit)); } catch { /* 存储不可用时本次仍生效 */ }
  }
  private raf = 0;
  onOpenMap?: () => void;
  onPanel?: (p: 'char' | 'bag' | 'alchemy' | 'save' | 'seclude' | 'skills' | 'wardrobe' | 'cloud' | 'zhenfa' | 'friends', force?: boolean) => void;
  overview!: HTMLCanvasElement;     // 1000×700 全图缩略（小地图/世界地图共用）
  debugTeleport = false;            // 体验：世界地图点选瞬移

  constructor(terrain: Terrain) {
    this.terrain = terrain;
    // 自动运镜：默认开；手动关掉记在本地，下次进来照旧关着
    try { this.autoCam = localStorage.getItem('fanren.autoCam') !== '0'; } catch { /* 无存储权限：只在本次生效 */ }
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
    this.player = { name: '苏寒', x: start.x, y: start.y, facing: 1, moving: false, flying: false, walkT: 0, running: false, sitting: false, st, look: HANLI_LOOK };
    this.cam.x = this.player.x; this.cam.y = this.player.y; this.camCenterReady = false;
    this.weather.onThunder = () => audio.sfx('thunder');
    this.updateUI();
  }

  private startPos() {
    // 开局：青霞谷山门前；其他地图按各自核心城镇或飞升接引台落脚
    const startMapLoc: Record<MapId, string> = {
      renjie: 'huangfeng',
      lingjie: 'tianyuan_feishengtai',
      xianjie: 'beihan_xilianchi',
    };
    const i = Math.max(0, LOCATIONS.findIndex((l) => l.id === (startMapLoc[ACTIVE_MAP] ?? 'huangfeng')));
    const L = LOCATIONS[i], z = this.terrain.locZones?.[i];
    const cx = z ? z.x : L.x * WORLD_SCALE, cy = z ? z.y + z.ry + 140 : L.y * WORLD_SCALE + 600;
    for (let r = 0; r < 3000; r += 60) {
      for (let a = 0; a < 12; a++) {
        const x = cx + Math.cos(a / 12 * Math.PI * 2) * r, y = cy + Math.abs(Math.sin(a / 12 * Math.PI * 2)) * r * 0.6;
        if (this.terrain.walkFactor(x, y) > 0 && !this.terrain.inLocZone(x, y, 20)) return { x, y };
      }
    }
    return { x: cx, y: cy };
  }

  /** 新开一局 */
  reset() {
    this.yingEsc = null;   // v0.70：新开局清掉元婴遁体
    const s = this.startPos();
    Object.assign(this.player, { x: s.x, y: s.y, facing: 1, moving: false, flying: false, walkT: 0, running: false, sitting: false });
    this.input.keys.clear(); this.input.joy.x = 0; this.input.joy.y = 0; this.input.joyMag = 0; this.input.run = false; this.lastJoyRun = false;
    this.player.st = new CharState(s.x, s.y);
    this.hero = C.newHero();
    if (this.player) this.player.look = HANLI_LOOK;
    this.nodes.fromSave([]);
    this.day = 60; this.clock = DAY_CYCLE * 0.3; this.explored.fill(0); this.exploredCount = 0; this.fogs = {}; this.savedDrops = {}; this.travel.pending = null; this.revealAll = false; this.destination = null; this.debugTeleport = false;
    this.cam.x = this.player.x; this.cam.y = this.player.y; this.cam.zoom = this.cam.targetZoom = 0.8; this.camCenterReady = false;
    this.currentRegionId = ''; this.gathering = null;
    if (this.mijing?.cur) this.mijing.cur = null;
    this.combat.reset(); this.pursuit?.reset();
    this.ws = newWorldState();
    this.sites.reset();
    this.npcs.newWorld();
    // 第五十一步「天道」：立下道心；前世的碑与那个杀你的人（带着你的储物袋）都放进这一世
    this.daoxin.reset(); this.pianju.reset(); this.yuanying.reset(); this.zhenfa.reset(); this.zhongsheng.reset(); this.shen.reset();
    this.daoxin.adoptChosen();
    this.daoxin.seedLegacy();
    this.modal = null; this.modalStack = []; this.emitModal();
    this.story.start();
    // 人界开局已是青霞谷外门弟子（持问仙令入门）；上界开局无下界宗门牵绊
    if (ACTIVE_WORLD === 'human') {
      this.ws.sect = { id: 'huangfeng', rank: 0, contrib: 50, joined: this.day, lastPay: this.day, tasks: [], done: 0 };
      ensureWorldSlice(this.ws, ACTIVE_WORLD).sect = this.ws.sect;
      this.towns.refreshTasks();
    } else {
      this.ws.sect = null;
      ensureWorldSlice(this.ws, ACTIVE_WORLD).sect = null;
    }
    this.player.st.faceToward(0, -1, true);
    this.updateUI();
  }

  // ---------- 第四～六步：NPC、红颜、城镇、大事件 ----------
  private hookCombat() {
    const c = this.combat as any;
    const prevKill = c.onKill, prevSpar = c.onSparEnd;
    c.onKill = (e: any) => {
      prevKill?.(e);
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
    c.onSparEnd = (e: any, won: boolean) => { prevSpar?.(e, won); if (!this.events.onSpar(e, won) && !this.happen.onSpar(e, won)) this.npcs.onSpar(e, won); };
  }
  get halted() { return this.paused || !!this.modal || !!this.travel?.recoveryRequired; }
  openModal(m: Modal) {
    if (this.modal && (this.modal.kind === 'town' || this.modal.kind === 'hearts' || this.modal.kind === 'chronicle' || this.modal.kind === 'relations' || this.modal.kind === 'sect')) this.modalStack.push(this.modal);
    this.modal = m; this.stand(); this.input.keys.clear(); this.emitModal();
  }
  openDialog(node: DNode) {
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
    this.modal = this.modalStack.pop() ?? null; this.emitModal(); this.updateUI(true);
  }
  emitModal() { this.modalListeners.forEach((f) => f()); }
  subscribeModal(f: () => void) { this.modalListeners.add(f); return () => { this.modalListeners.delete(f); }; }
  /** 新手提示：每条只出现一次 */
  hint(id: string, text: string) {
    if (this.ws.hints.includes(id)) return;
    this.ws.hints.push(id); this.toast(text, 'good');
  }
  private hintTick() {
    const p = this.player, h = this.hero;
    if (this.npcs.focus) this.hint('talk', TOUCH ? '提示：点右侧「谈」，或直接点人，就能与他说话。' : '提示：按 T（或点击下方按钮）与身旁之人交谈。');
    const l = this.ui?.nearby;
    if (l && this.towns.canEnter(l)) this.hint('town', TOUCH
      ? `提示：点下方「进入」进${l.name}——坊市、酒楼、客栈、传送阵${l.type === 'sect' ? '、拜入宗门' : ''}。`
      : `提示：按 G 进入${l.name}——坊市、酒楼、客栈、传送阵${l.type === 'sect' ? '、拜入宗门' : ''}。`);
    if (this.events.enc.some((e) => e.seen)) this.hint('enc', TOUCH ? '提示：奇遇只在神识之内显现。走近后点「交谈」查看。' : '提示：奇遇只在神识之内显现。走近后按 T 查看。');
    if (Object.values(this.ws.hearts).some((s) => s.met)) this.hint('hearts', TOUCH ? '提示：点「≡ 菜单 → 友人」查看同行、知交与邀约。' : '提示：按 H 打开友人录（红颜在其中一页），查看好感与故事线索。');
    if (this.ws.news.length) this.hint('chron', TOUCH ? '提示：点「≡ 菜单 → 机缘」打开大事记——人界大事会按年份发生，你可以改变结局。' : '提示：按 J 打开大事记——人界大事会按年份发生，你可以改变结局。');
    if (this.combat.enemies.some((e) => !e.dead && e.aggro && Math.hypot(e.x - p.x, e.y - p.y) < this.senseRadius)) this.hint('fight', TOUCH ? '提示：点右下法诀盘施法，自动锁定最近的敌人（淡金环）；点敌人可换目标。' : '提示：数字键 1–9 施法，自动锁定最近的敌人（淡金环）；点击敌人或按 Tab 可换目标。');
    if (this.gatherTarget) this.hint('gather', TOUCH ? '提示：走近灵物会出现「采集」按钮，点它即可。' : `提示：按 ${keyLabel(bindOf('gather'))} 采集神识中的灵物。`);
    if (C.bottleneck(h, ACTIVE_WORLD) !== 'none') this.hint('bottle', TOUCH ? '提示：修为已满，点「≡ 菜单 → 角色」冲关。' : '提示：修为已满，按 C 打开角色面板冲关。');
    if (h.realm === 1 && h.stage >= 5 && !this.ws.sect) this.hint('sect', '提示：炼气五层后可拜入青霞谷等大宗门；持问仙令可直接入青霞谷。');
    if (this.canFlyNative) this.hint('fly', TOUCH ? '提示：已可御剑飞行——点「≡ → 御剑」随时起落；打坐、采集时会自动落地。' : `提示：已可御剑飞行——按 ${keyLabel(bindOf('fly'))}（或右下「剑」按钮）随时起落；打坐、采集时会自动落地。`);
    if (this.ws.flags.invasion) this.hint('inv', '魔道入侵梁国！在梁国斩杀魔修削弱攻势，再前往青霞谷破敌。');
  }
  news(text: string, kind: 'canon' | 'rumor' | 'personal' = 'rumor') {
    this.ws.news.push({ day: Math.floor(this.day), text, kind });
    if (this.ws.news.length > 160) this.ws.news.splice(0, this.ws.news.length - 160);
  }
  /** 打听到某地：在地图上揭开周围 */
  markKnown(l: LocDef) {
    const cx = l.x * WORLD_SCALE, cy = l.y * WORLD_SCALE, r = 1600;
    for (let y = Math.floor((cy - r) / FOG_CELL); y <= Math.floor((cy + r) / FOG_CELL); y++) for (let x = Math.floor((cx - r) / FOG_CELL); x <= Math.floor((cx + r) / FOG_CELL); x++) {
      if (x < 0 || y < 0 || x >= FOG_W || y >= FOG_H) continue;
      if (Math.hypot((x + 0.5) * FOG_CELL - cx, (y + 0.5) * FOG_CELL - cy) < r) {
        const i = y * FOG_W + x;
        if (!this.explored[i]) { this.explored[i] = 1; this.exploredCount++; }
      }
    }
  }
  /** T：与身旁的人交谈 / 查看奇遇 */
  interact() {
    const p = this.player;
    // v0.54：秘境里只认秘境里的东西（宝箱、禁制门、出口……）与同行之人
    if (this.mijing.active) { if (this.mijing.interact()) return; if (this.npcs.focus) { this.npcs.interact(); return; } if (this.time - this.interactMiss > 3) { this.interactMiss = this.time; this.toast('近前无甚可看之物。'); } return; }
    const sf = this.story.focus;
    if (sf) { const dsf = Math.hypot(sf.x - p.x, sf.y - p.y); const dn0 = this.npcs.focus ? Math.hypot(this.npcs.focus.st.x - p.x, this.npcs.focus.st.y - p.y) : 1e9; if (dsf <= dn0 + 40) { this.story.interact(sf); return; } }
    // v0.52.5：同行道侣走 I、灵宠走 U，T 只管奇遇 / 路人 / 机缘——三者不再互相抢键
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
    const campF = this.sectwar.campFocus(p.x, p.y);
    const frontF = this.sectwar.frontInteractFocus(p.x, p.y);
    // 第十八步：机缘、洞府、大营帅帐、前线对峙台/设施、会动的奇遇、灵宠——取最近的一个
    const cands: [number, () => boolean][] = [
      [dn, () => { this.npcs.interact(); return true; }],
      [de, () => this.events.interact(e)],
      [campF ? campF.dist * 0.5 : 1e9, () => { if (!campF) return false; this.openDialog(this.sectwar.warCampNode(campF.w, campF.side)); return true; }],
      [frontF ? frontF.dist * 0.52 : 1e9, () => { if (!frontF) return false; frontF.open(); return true; }],
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
      [this.space.doorFocus && !this.isFlying ? this.space.doorFocus.d + 20 : 1e9, () => this.enterDoor()],
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
    this.hero.wardrobe = normalizeWardrobe(w);
    this.player.look = dressLook(HANLI_LOOK, this.hero.wardrobe);
  }
  static hasSave() { try { return SLOT_KEYS.some((k) => !!localStorage.getItem(k)) || !!localStorage.getItem(LEGACY_KEY); } catch { return false; } }
  static latestSlot(): string | null {
    let best: string | null = null, bt = -1;
    try {
      for (const k of SLOT_KEYS) {
        try {
          const raw = localStorage.getItem(k); if (!raw) continue;
          const d = JSON.parse(unzipSave(raw)); validateSaveForLoad(d, ALL_MAP_IDS, WORLD_SCALE);
          const t = d.time ?? 0; if (t > bt) { bt = t; best = k; }
        } catch { /* 单个损坏档不影响选择其他存档 */ }
      }
      if (!best && localStorage.getItem(LEGACY_KEY)) best = LEGACY_KEY;
    } catch { /* */ }
    return best;
  }
  static listSlots(): SlotMeta[] {
    return SLOT_KEYS.map((key, slot) => {
      let raw: string | null;
      try { raw = localStorage.getItem(key); }
      catch { return { slot, key, name: SLOT_NAMES[slot], empty: false, unavailable: true }; }
      if (raw === null) return { slot, key, name: SLOT_NAMES[slot], empty: true };
      try {
        const d = JSON.parse(renameText(unzipSave(raw))); validateSaveForLoad(d, ALL_MAP_IDS, WORLD_SCALE);
        return { slot, key, name: SLOT_NAMES[slot], empty: false, time: d.time, realm: d.meta?.realm, year: d.meta?.year, region: d.meta?.region, age: d.meta?.age };
      } catch { return { slot, key, name: SLOT_NAMES[slot], empty: false, invalid: true }; }
    });
  }
  /** 最近一次 save() 失败的原因：'quota' 存储配额满 · 'denied' 浏览器禁用存储 · 'serialize' 数据序列化失败 · '' 没失败
   *  原先一个 catch 掉只返回 false，面板只能笼统提示「检查存储权限」；
   *  但玩家最常见的其实是 localStorage 约 5MB 被四个存档位 + 碑林占满，话要说准。 */
  saveLastError: '' | 'quota' | 'denied' | 'serialize' | 'invalidNumber' | 'travelRecovery' = '';
  /** 把 saveLastError 翻成人话：存档面板、万民卷宗、手动存档都用这一份，不再各写一套 */
  saveFailText() {
    switch (this.saveLastError) {
      case 'quota': return '本地存档失败：本地存储已满（约 5MB，四个存档位与碑林共用）。先导出存档码，再删掉用不着的存档位。';
      case 'denied': return '本地存档失败：浏览器禁用了本站存储（无痕模式 / 隐私设置），请检查站点存储权限。';
      case 'serialize': return '本地存档失败：存档数据序列化出错（多半是模组塞进了不可序列化的东西）。';
      case 'travelRecovery': return '自动存档已保护出发前检查点，请先重新载入自动存档恢复。';
      case 'invalidNumber': return '本地存档失败：角色或地图关键数值异常，已保护原存档不被覆盖。请保留旧档并反馈复现步骤。';
      default: return '本地存档失败，先检查浏览器存储权限。';
    }
  }
  /** v0.71 补：脚边「受保护」的补发掉落——背包拒收后留在原地、还没被收走的那些。
   *  秘境里连入口石台上的那份也算（与 save() 的取法一致）。 */
  protectedLoot(): { x: number; y: number; id: string; n: number }[] {
    const out = (this.combat?.loot ?? [])
      .filter((d) => d.blocked && !d.collected && !d.collecting)
      .map((d) => ({ x: d.x, y: d.y, id: d.id, n: d.n }));
    const realm = this.mijing?.cur;
    if (realm?.stashLoot?.length) out.unshift(...protectedDrops(realm.stashLoot, realm.back));
    return out;
  }
  /** 受保护的补发掉落不随战斗重置凭空消失：先摘下、再 reset、然后放回原处。
   *  用于「把玩家挪开」却不该没收他补偿奖励的路径（魔修掳走 / 战败被救回城镇）：
   *  掉落留在跌倒的地方，走回去还能捡。返回保住的数量。 */
  resetCombatKeepingDrops(): number {
    const keep = (this.combat?.loot ?? []).filter((d) => d.blocked && !d.collected && !d.collecting);
    this.combat.reset();
    if (keep.length) this.combat.loot.push(...keep);
    return keep.length;
  }
  private saveGen = 0;
  save(slot = 0, auto = false) {
    if (this.hero.dead) return false;
    if (this.daoxin?.hardcore?.()) slot = 0;   // 天道档：单存档自动盖写，无路可回
    if (slot === 0 && this.travel?.recoveryRequired) { this.saveLastError = 'travelRecovery'; return false; }
    this.saveLastError = '';
    const gen = ++this.saveGen;
    try {
      const p = this.player, tp = this.travel.pending;
      this.fogs[ACTIVE_MAP] = encodeFog(this.explored);
      const realm = this.mijing?.cur;
      const drops = realm
        ? [...protectedDrops(realm.stashLoot), ...protectedDrops(this.combat?.loot ?? [], realm.back)]
        : protectedDrops(this.combat?.loot ?? []);
      const savedDrops = { ...(this.savedDrops ?? {}), [ACTIVE_MAP]: drops };
      const targetWorld = tp ? worldOfMap(tp.map) : ACTIVE_WORLD;
      this.ws.world = targetWorld;
      const targetSlice = ensureWorldSlice(this.ws, targetWorld);
      if (!tp || targetWorld === ACTIVE_WORLD) {
        const sectLoc = this.ws.sect ? LOC_BY_ID.get(this.ws.sect.id) : undefined;
        const sectWorld = sectLoc ? worldOfMap(sectLoc.map) : undefined;
        targetSlice.sect = !this.ws.sect || !sectWorld || sectWorld === targetWorld ? (this.ws.sect ?? null) : (targetSlice.sect ?? null);
        const mySectWorld = this.ws.mySect ? worldOfMap(this.ws.mySect.map) : undefined;
        targetSlice.mySect = !this.ws.mySect || mySectWorld === targetWorld ? (this.ws.mySect ?? null) : (targetSlice.mySect ?? null);
      }
      const data = {
        savedDrops,
        v: SAVE_VERSION, ws: WORLD_SCALE, time: Date.now(), worldId: targetWorld, map: tp?.map ?? ACTIVE_MAP, arrive: tp ? tp.via : undefined,
        p: tp ? { x: tp.x, y: tp.y, flying: false } : this.mijing?.cur ? { ...this.mijing.cur.back } : this.yuanying?.active && this.yuanying.body ? { x: this.yuanying.body.x, y: this.yuanying.body.y, flying: this.yuanying.body.flying } : { x: p.x, y: p.y, flying: p.flying }, day: this.day, clock: this.effectiveClock(), fogs: this.fogs, zoom: this.cam.targetZoom, revealAll: this.revealAll,
        hero: this.hero, nodes: this.nodes.toSave(), world: this.ws, npcs: this.npcs.toSave(), ...(this.combat?.eco ? { eco: this.combat.eco.toSave(320, this.time) } : {}),
        meta: { realm: realmName(this.hero.realm, this.hero.stage), year: Math.floor(this.day / 360) + 1, region: tp ? MAP_NAME[tp.map] : `${MAP_NAME[ACTIVE_MAP]}·${this.ui?.region ?? ''}`, age: Math.floor(this.hero.age) },
      };
      validateSaveNumbers(data);
      const json = stringifySave(data);
      // 手动/关键存档校验实际序列化结果，避免 toJSON 或其他转换令写出的档在读取时立即失败；
      // 后台自动存档跳过重复 JSON.parse，在浏览器端优先把 ~40ms 的 LZSS 压缩卸载到 Worker 线程
      if (!auto) {
        validateSaveForLoad(JSON.parse(json), ALL_MAP_IDS, WORLD_SCALE);
        localStorage.setItem(SLOT_KEYS[slot], zipSave(json, false));
        return true;
      }
      const key = SLOT_KEYS[slot];
      const queued = zipSaveAsync(json, (zipped) => {
        if (gen !== this.saveGen) return;
        try {
          localStorage.setItem(key, zipped ?? zipSave(json, true));
        } catch (e: any) {
          const n = String(e?.name ?? ''), code = String(e?.code ?? '');
          this.saveLastError = /quota|22$/.test(n + code) ? 'quota' : /security|data_|denied|invalid_state/i.test(n + code) ? 'denied' : 'serialize';
          if (!this.saveWarned) {
            this.saveWarned = true;
            this.toast(`自动存档没能写进去——${this.saveFailText().replace(/^本地存档失败[：:]?/, '')}`, 'warn');
          }
        }
      });
      if (!queued) localStorage.setItem(key, zipSave(json, true));
      return true;
    } catch (e: any) {
      const n = String(e?.name ?? ''), code = String(e?.code ?? '');
      this.saveLastError = e instanceof SaveNumberError ? 'invalidNumber' : /quota|22$/.test(n + code) ? 'quota' : /security|data_|denied|invalid_state/i.test(n + code) ? 'denied' : 'serialize';
      console.warn('[save] 本地存档失败：', e);
      return false;
    }
  }
  load(key?: string) {
    try {
      const k = key ?? Game.latestSlot();
      if (!k) return false;
      const raw = localStorage.getItem(k);
      if (!raw) return false;
      const d = JSON.parse(renameText(unzipSave(raw)));   // v0.70：旧存档里的原著人名 / 地名换成新名字；v0.71：先解压
      validateSaveForLoad(d, ALL_MAP_IDS, WORLD_SCALE);
      const p = this.player;
      const mig = resolveSaveLocation(d, WORLD_SCALE, FOG_CELL);
      const { map, px, py, wk, legacy } = mig;
      if (map !== ACTIVE_MAP) return this.switchMap(map, k);
      p.x = px; p.y = py; p.flying = !!d.p.flying; p.sitting = false; p.moving = false; p.running = false;
      if (this.input) { this.input.keys?.clear?.(); if (this.input.joy) { this.input.joy.x = 0; this.input.joy.y = 0; } this.input.joyMag = 0; this.input.run = false; }
      this.lastJoyRun = false;
      let arrivalDetour = 0;
      if (d.arrive || legacy) { const q = this.findLand(p.x, p.y); arrivalDetour = Math.hypot(q.x - p.x, q.y - p.y); p.x = q.x; p.y = q.y; p.flying = false; }
      if (!p.flying && this.terrain.walkFactor(p.x, p.y) <= 0) p.flying = true;   // 旧存档：筑基后停在海上时保持飞行
      this.travel.pending = null;
      p.st = new CharState(p.x, p.y);
      this.day = d.day ?? 60;
      this.clock = d.clock ?? DAY_CYCLE * 0.3;
      const migratedFogs = migrateSaveFogs(d, ACTIVE_MAP, this.explored, mig, FOG_CELL, WORLD_SCALE, (f, ws0) => this.migrateFog(f, ws0));
      if (migratedFogs) this.fogs = migratedFogs;
      let exCnt = 0; for (let i = 0; i < this.explored.length; i++) exCnt += this.explored[i];
      this.exploredCount = exCnt;
      this.cam.x = p.x; this.cam.y = p.y; this.camCenterReady = false;
      this.cam.zoom = this.cam.targetZoom = d.zoom ?? 0.8;
      this.revealAll = !!d.revealAll;
      // v1（第一步）存档迁移：新建角色
      this.hero = d.v >= 2 && d.hero ? Object.assign(C.newHero(), d.hero) : C.newHero();
      if (this.hero.wardrobe) this.hero.wardrobe = normalizeWardrobe(this.hero.wardrobe);
      this.player.look = this.hero.wardrobe ? dressLook(HANLI_LOOK, this.hero.wardrobe) : HANLI_LOOK;
      if (d.v < 2 || !d.v) { this.hero.realm = d.p?.realm ?? 1; this.hero.stage = d.p?.stage ?? 0; }
      this.hero.stats = Object.assign(C.newHero().stats, this.hero.stats ?? {});
      C.mergeHerbs(this.hero);   // v0.70：灵草不计年份，旧存档分年份的灵草合成一格
      this.yingEsc = null;
      if ((this.hero as any).yingEscP) { (this.hero as any).yingEscP = undefined; C.inflictDaoHurt(this.hero, 60, '肉身被毁，元婴重塑'); this.hero.exp = Math.floor(this.hero.exp * 0.8); this.hero.hp = Math.max(this.hero.hp, 0.5); }
      this.nodes.fromSave(d.nodes);
      this.destination = null; this.currentRegionId = ''; this.gathering = null;
      if (this.mijing?.cur) this.mijing.cur = null;
      this.combat.reset();
      if (Array.isArray(d.eco) && !legacy) this.combat?.eco?.fromSave(d.eco);
      const { savedDrops, activeLoot } = migrateSavedDrops(d.savedDrops, ACTIVE_MAP, mig, WORLD_SCALE);
      this.savedDrops = savedDrops;
      this.combat.loot = activeLoot;
      this.pursuit?.reset(); this.landmarks?.reset(); this.sites?.reset(); this.happen?.reset(); this.pets?.reset();
      // 第三步存档迁移
      const nh = C.newHero();
      if (!Array.isArray(this.hero.arts) || !this.hero.arts.length) this.hero.arts = nh.arts;
      if (!Array.isArray(this.hero.hotbar) || this.hero.hotbar.length !== 9) this.hero.hotbar = nh.hotbar;
      this.hero.equip = this.hero.equip ?? {}; this.hero.looted = this.hero.looted ?? []; this.hero.kills = this.hero.kills ?? 0;
      // 第四步起：世界状态与 NPC
      this.ws = Object.assign(newWorldState(), d.world ?? {});
      migrateWorldStateAndCoords(this.ws, d.worldId, mig, WORLD_SCALE);
      registerMyArts(this.ws); this.mysect?.sync();   // v0.60：自创功法先登记、自家山门先上图（先于战事营地重检）
      this.sectwar?.migrateWarState();
      this.dailyQueue.length = 0;
      this.relAcc = 0;
      this.sitClockFreeze = null; this.sitDays = 0;
      this.happen?.restoreBountySpawns(); // 敌人不存档，避免悬赏目标读档后永远无法重建
      if (legacy) this.npcs.mergeLegacy(d.npcs);
      else this.npcs.fromSave(migrateSavedNpcs(d.npcs, mig, WORLD_SCALE) as any, wk);
      this.npcs.dropBeauties(); this.ws.hearts = {};   // v0.70：红颜不再登场——旧存档里的红颜与情缘一并移除
      this.modal = null; this.modalStack = []; this.emitModal();
      // v0.52.5：读档后清掉一切会让画面发黑的残留（淡出遮罩、顿帧、洞府场景、静止跳画）
      this.inCave = false; this.combat.fade = 0; this.hitStop = 0; this.slowT = 0; this.onCave?.(false); this.renderer?.resetStill();
      this.daoxin.reset(); this.pianju.reset(); this.yuanying.reset(); this.zhenfa.reset(); this.zhongsheng.reset(); this.shen.reset();
      this.hearts.restore();
      this.story.resume();
      if (this.travel.recoveryRequired) this.paused = false;
      this.travel.recoveryRequired = false; this.travel.finishRecovery?.();
      this.updateUI(true);
      if (d.arrive === 'edge' && arrivalDetour > 12000) this.toast?.(`边境临海或地势险阻，你绕行至距原定落点较远的陆地。`, 'info');
      return true;
    } catch (e) { console.warn(e); return false; }
  }
  /** 存档所在地图与当前不同：记下目标图，重新载入后自动读档 */
  switchMap(map: MapId, key?: string): boolean {
    if (typeof location === 'undefined' || (globalThis as any).__FANREN_NORELOAD) return false;
    let oldMap: string | null, oldResume: string | null;
    try { oldMap = localStorage.getItem('fanren.map'); oldResume = sessionStorage.getItem('fanren.resume'); }
    catch { return false; }
    try {
      localStorage.setItem('fanren.map', map); sessionStorage.setItem('fanren.resume', key ?? AUTO_SAVE_KEY);
      // 网址里带 ?map= 时它优先于本地记录——改写网址，否则会无限重载
      if (/[?&](map|auto)=/.test(location.search)) { const u = new URL(location.href); u.searchParams.set('map', map); u.searchParams.delete('auto'); location.replace(u.toString()); }
      else location.reload();
      return true;
    } catch {
      // 两个存储写入并非原子操作，失败时尽力恢复原值。
      try { if (oldMap === null) localStorage.removeItem('fanren.map'); else localStorage.setItem('fanren.map', oldMap); } catch { /* storage unavailable */ }
      try { if (oldResume === null) sessionStorage.removeItem('fanren.resume'); else sessionStorage.setItem('fanren.resume', oldResume); } catch { /* storage unavailable */ }
      return false;
    }
  }
  /** 旧版统一地图的迷雾 → 三张新图各自的迷雾 */
  private migrateFog(fog: string, ws0: number): Partial<Record<MapId, string>> {
    const ow = Math.ceil(1000 * ws0 / FOG_CELL), wk = WORLD_SCALE / ws0;
    const arr = {} as Record<MapId, { a: Uint8Array; w: number; h: number }>;
    for (const m of MAP_IDS) { const S = mapSize(m), w = Math.ceil(S.W * WORLD_SCALE / FOG_CELL), h = Math.ceil(S.H * WORLD_SCALE / FOG_CELL); arr[m] = { a: new Uint8Array(w * h), w, h }; }
    const raw = new Uint8Array(parseFog(fog).length); decodeFog(fog, raw);
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
  findLand(x: number, y: number) {
    const T = this.terrain;
    for (let r = 0; r < 12000; r += 80) for (let a = 0; a < 16; a++) {
      const qx = clamp(x + Math.cos(a / 16 * Math.PI * 2) * r, 400, WORLD_W - 400), qy = clamp(y + Math.sin(a / 16 * Math.PI * 2) * r, 400, WORLD_H - 400);
      if (T.walkFactor(qx, qy) > 0 && !T.inLocZone(qx, qy, 10)) return { x: qx, y: qy };
    }
    // 边境附近可能只有较远的陆地。先逐圈扩大搜索，而不是立刻送到最近城镇；
    // 粗粒度只用于极少见的回退，限制步数避免到达时卡顿。
    for (let r = 12000; r <= 48000; r += 240) for (let a = 0; a < 48; a++) {
      const qx = clamp(x + Math.cos(a / 48 * Math.PI * 2) * r, 400, WORLD_W - 400);
      const qy = clamp(y + Math.sin(a / 48 * Math.PI * 2) * r, 400, WORLD_H - 400);
      if (T.walkFactor(qx, qy) > 0 && !T.inLocZone(qx, qy, 10)) return { x: qx, y: qy };
    }
    // 扩大搜索仍无陆地时，退到最近地点附近；避免让低阶角色落进海里。
    const candidates = [...LOCATIONS].sort((a, b) =>
      Math.hypot(a.x * WORLD_SCALE - x, a.y * WORLD_SCALE - y) - Math.hypot(b.x * WORLD_SCALE - x, b.y * WORLD_SCALE - y));
    let fallback: { x: number; y: number } | null = null;
    for (const loc of candidates) {
      const cx = loc.x * WORLD_SCALE, cy = loc.y * WORLD_SCALE;
      for (let r = 0; r <= 2400; r += 120) for (let a = 0; a < 16; a++) {
        const qx = clamp(cx + Math.cos(a / 16 * Math.PI * 2) * r, 400, WORLD_W - 400);
        const qy = clamp(cy + Math.sin(a / 16 * Math.PI * 2) * r, 400, WORLD_H - 400);
        if (!(T.walkFactor(qx, qy) > 0)) continue;
        if (!T.inLocZone(qx, qy, 10)) return { x: qx, y: qy };
        fallback ??= { x: qx, y: qy }; // 最后兜底：陆地优先于落海。
      }
    }
    return fallback ?? { x, y }; // 地图本身没有任何可走地形时，保留旧兜底。
  }
  static deleteSlot(slot: number) { try { localStorage.removeItem(SLOT_KEYS[slot]); } catch { /* */ } }
  static clearAll() { try { for (const k of SLOT_KEYS) localStorage.removeItem(k); localStorage.removeItem(LEGACY_KEY); } catch { /* */ } }

  // ---------- 派生数值 ----------
  get stats() {
    const s = C.heroStats(this.hero);
    if (this.hearts) { s.atk = Math.round(s.atk * (1 + this.hearts.bonus('atk'))); s.def = Math.round(s.def * (1 + this.hearts.bonus('def'))); s.sense = Math.round(s.sense * (1 + this.hearts.bonus('sense'))); s.luck += this.hearts.bonus('luck'); }
    return s;
  }
  get sense() { return this.stats.sense; }
  /** 基础神识半径（世界像素） */
  get baseSenseRadius() {
    return baseSenseRange(this.sense, this.hero.gongfa === 'dayan' ? 1.35 : 1, 380, ACTIVE_WORLD);
  }
  get senseRadius() {
    let r = this.baseSenseRadius;
    if (this.senseBurstT > 0) r *= SENSE_BURST_MULTIPLIER;
    if (this.concealed) r *= 0.6;
    if (this.landmarks) r *= this.landmarks.senseK;   // 第十九步：陨魔谷迷雾等压制神识
    return r;
  }
  /** 不受收敛影响的实体及战斗基准；特殊地形压制和神识外放仍生效。 */
  get actionSenseRadius() {
    return this.baseSenseRadius * (this.senseBurstT > 0 ? SENSE_BURST_MULTIPLIER : 1) * (this.landmarks?.senseK ?? 1);
  }
  get detailSenseRadius() { return detailSenseRange(this.actionSenseRadius, this.hero?.realm ?? 0, ACTIVE_WORLD); }
  /** 只用于只读的信息探察；不能用于实体生成、迷雾或奖励发现。 */
  get fullAwarenessRadius() {
    return awarenessBaseRange(this.sense, this.hero.gongfa === 'dayan' ? 1.35 : 1, ACTIVE_WORLD) * (this.landmarks?.senseK ?? 1);
  }
  get awarenessRadius() {
    return effectiveAwarenessRange(this.fullAwarenessRadius, this.detailSenseRadius, this.senseBurstT > 0, this.concealed);
  }
  private camCenterReady = false;
  /** 角色脚底相对视觉中心的垂直偏移：直接取人物动态渲染包围盒中点，与缩放无关，缩放不产生镜头偏移 */
  private camAnchorY(): number {
    const p = this.player;
    const st = p.st as { lift?: number; visualCenterOffY?: number } | undefined;
    if (st && Number.isFinite(st.visualCenterOffY)) {
      return p.y - st.visualCenterOffY!;
    }
    return p.y - (st?.lift ?? 0) * 0.5;
  }
  /** 最远缩放限制按完整神识外圈、实际画布与相机偏移动态推导，而非固定 zoom 阈值。 */
  get minZoom() {
    const w = this.renderer?.W || (typeof window !== 'undefined' ? window.innerWidth : 1280);
    const h = this.renderer?.H || (typeof window !== 'undefined' ? window.innerHeight : 800);
    const p = this.player;
    const targetX = p.x + this.debugCamDX + this.camLeanX;
    const targetY = this.camAnchorY() + this.camLeanY;
    const offsetX = Math.max(Math.abs(p.x - this.cam.x), Math.abs(p.x - targetX));
    const offsetY = Math.max(Math.abs(p.y - this.cam.y), Math.abs(p.y - targetY));
    return senseFitZoom(Math.max(this.fullAwarenessRadius, this.awarenessRadius), w, h, Game.ZOOM_MIN, Game.ZOOM_MAX, 16, offsetX, offsetY);
  }
  // ---------- 神识秘术 ----------
  camFrameZ = 1; camLeanX = 0; camLeanY = 0;
  /** 自动运镜：飞行时镜头拉远、战斗时偏向锁定目标、大招运镜——关掉则镜头只按玩家自己的缩放 */
  autoCam = true;
  senseBurstT = 0; senseBurstCd = 0; concealed = false; senseAlarm = 0; private scanTimer = 20;
  /** 神识外放：信息圈达到当前潜力，旧玩法作用半径 ×1.4；起手耗蓝并持续消耗。 */
  senseBurst() {
    if (this.senseBurstT > 0) { this.endSenseBurst('收回外放的神识。'); return; }
    if (this.senseBurstCd > 0) { this.toast(`神识刚收回，尚需调息 ${Math.ceil(this.senseBurstCd)} 息。`, 'warn'); return; }
    if (this.hero.mp < 0.15) { this.toast('法力不足，无法外放神识。', 'warn'); return; }
    this.hero.mp -= 0.1; this.senseBurstT = 1e9; this.concealed = false; this.senseWaveT = 0;
    if (this.renderer) this.renderer.sense.burst = 1;
    this.toast(`神识如潮水般向四方铺开……（持续耗法力，约可维持 ${Math.round((this.hero.mp - 0.03) / this.senseDrain())} 息；再按 Q 收回）`); audio.sfx('whoosh');
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
  /** 敛息：信息圈收至精细圈，兼容玩法半径 ×0.6，不易被他人察觉。 */
  toggleConceal() {
    this.concealed = !this.concealed;
    if (this.concealed) this.senseBurstT = 0;
    this.toast(this.concealed ? '运转敛气诀，收敛周身气息。神识随之内收。' : '散去敛气诀，神识恢复平常探察。');
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
  get canFlyNative() { return realmDef(this.hero.realm).fly; }
  /** 当前能否起飞（筑基及以上可凌空/御剑；炼气须装备神风舟等飞行法器） */
  get canFly() { return this.canFlyNative || !!(this.hero.equip?.flight && C.bagCount(this.hero, this.hero.equip.flight) > 0); }
  /** 是否正在飞行（筑基后可随时起落，不再强制凌空） */
  get isFlying() { return this.player.flying; }
  /** 祭出的遁具 / 靴子带来的速度倍率 */
  equipSpeed(kind: 'flight' | 'boots') { const id = this.hero.equip?.[kind]; return (id && itemDef(id).art?.mapSpeed) || 1; }
  get speed() {
    const M = TUNING.move;
    const realm = this.hero.realm;
    const spaceSpeed = worldSpeedScale(realm, ACTIVE_WORLD);
    const base = realmDef(realm).speed * (1 + C.mod(this.hero, 'mapSpeed')) * this.stats.speed * spaceSpeed;
    const fl = this.equipSpeed('flight');
    if (this.player.flying && !this.canFlyNative) {
      const raw = Math.max(M.minBoatSpeed, base * M.flyMul * fl) * this.boostMul; // 炼气乘舟
      return this.player.boosting ? raw : Math.min(raw, flyCruiseCap(realm, fl, ACTIVE_WORLD));
    }
    if (this.yuanying?.active) {
      const raw = base * M.yuanyingMul * this.boostMul;   // v0.53：元婴遁速
      const cap = flyCruiseCap(realm, 1, ACTIVE_WORLD) * (M.yuanyingMul / M.flyMul);
      return this.player.boosting ? raw : Math.min(raw, cap);
    }
    if (this.isFlying) {
      const raw = base * M.flyMul * fl * this.boostMul;
      return this.player.boosting ? raw : Math.min(raw, flyCruiseCap(realm, fl, ACTIVE_WORLD));
    }
    const boots = this.equipSpeed('boots');
    if (this.player.running) return base * M.runMul * boots; // 疾行：按当前境界与界域空间法则速度
    return Math.min(base * boots, slowWalkCap());            // 慢行：固定炼气期最大速度
  }
  /** 遁光类别：云雷双翼 → 雷遁；血色披风 → 血光遁；其余 → 催动遁光 */
  get boostKind(): 'thunder' | 'blood' | 'light' {
    const q = this.hero.equip ?? {};
    // 云雷双翼（飞行位）→ 雷遁；血色披风（护甲位，古宝）→ 血光遁
    return q.flight === 'art_fenglei' ? 'thunder' : q.armor === 'art_xuepifeng' || q.flight === 'art_xuepifeng' ? 'blood' : 'light';
  }
  get boostMul() { if (!this.player.boosting) return 1; return TUNING.move.boostMul[this.boostKind]; }
  /** 催动遁光每秒耗法力 */
  get boostDrain() { const k = this.boostKind; return (k === 'thunder' ? 0.045 : k === 'blood' ? 0.032 : 0.026) / (1 + Math.max(0, this.hero.realm - 2) * 0.2); }
  get season() { const m = Math.floor(this.day / 30) % 12; return m < 3 ? 0 : m < 6 ? 1 : m < 9 ? 2 : 3; }
  /** 日光 0（子夜）–1（正午） */
  get light() { return 0.5 - 0.5 * Math.cos(2 * Math.PI * this.dayPhase); }
  /** 夜色 0–1（v0.73：light < 0.35 起渐入夜色，4 分钟一轮中白昼 ~143s、黑夜 ~97s） */
  get night() { return clamp((0.35 - this.light) / 0.25, 0, 1); }
  get dayPhase() {
    const c = this.sitClockFreeze !== null ? this.sitClockFreeze : this.clock;
    return (c / DAY_CYCLE) % 1;
  }
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
  /** 顿帧（秒）与震屏（0..1 创伤值，支持按调用方封顶 cap 避免多段连击无限叠满） */
  juice(stop: number, shake: number, cap = 1) {
    if (stop > 0) this.hitStop = Math.max(this.hitStop, Math.min(0.12, stop));
    if (shake > 0) {
      const c = Math.max(0.05, Math.min(1, cap));
      if (this.trauma < c) this.trauma = Math.min(c, this.trauma + shake);
    }
  }

  /** 调试/自动化：固定帧步长（0 = 实时）与帧计数 */
  debugFixedDt = 0; frameNo = 0; debugCamDX = 0;
  /** 追杀的触发：拍卖后尾随、险地游荡被盯上 */
  private pursuitTriggers(dt: number) {
    const h = this.hero, p = this.player, f = this.ws.flags;
    if (h.realm < 1 || this.pursuit.active || this.day < 63) return;
    const inZone = !!this.terrain.inLocZone(p.x, p.y, 600);
    // 拍卖会上露了富：出城后被尾随
    if (f.auctionMark !== undefined && !inZone) {
      const ago = this.day - (f.auctionMark as number);
      delete f.auctionMark;
      if (ago < 20 && !(Math.random() < 0.5 && this.rel.tail())) { this.pursuit.cd = 0; this.pursuit.schedule({ reason: '拍卖会上露了富，出城不久便被人尾随', gap: Math.random() < 0.6 ? 1 : 0, delay: 4 + Math.random() * 6 }); }
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
    try {
      const q = localStorage.getItem('fanren.quality'); if (q && q !== 'auto') this.renderer.setQuality(+q);
      const fps = localStorage.getItem(FRAME_LIMIT_KEY); this.frameLimit = fps === null ? 60 : parseFrameLimit(fps);
    } catch { /* */ }
    this.bindInput();
    this.revealAround(true);
    this.updateUI(true);
    this.running = true;
    this.last = performance.now();
    this.uiHold = false; this.holdFrames = 0;   // 重新挂载（读档 / 回标题再进）时不该停在"停画"状态
    const pacer = new FramePacer();
    const loop = (t: number) => {
      if (!this.running) return;
      if (!this.debugFixedDt && !pacer.shouldRun(t, this.frameLimit)) { this.raf = requestAnimationFrame(loop); return; }
      // 自动化截图：固定步长，逐帧可控
      const rdt = this.debugFixedDt > 0 ? this.debugFixedDt : Math.max(0, Math.min(0.1, (t - this.last) / 1000));
      this.last = t; this.frameNo++;
      // 顿帧：命中瞬间时间几近停滞
      let dt = rdt;
      if (this.hitStop > 0) { this.hitStop -= rdt; dt = rdt * 0.05; }
      else if (this.slowT > 0) { this.slowT -= rdt; dt *= 0.3; }
      this.trauma = Math.max(0, this.trauma - rdt * 1.8);
      this.aberrKick = Math.max(0, this.aberrKick - rdt * 2.2);
      this.hurtFlash = Math.max(0, this.hurtFlash - rdt * 2.2);
      this.modFlash.a = Math.max(0, this.modFlash.a - rdt * 2.5);
      const u0 = performance.now();
      // v0.52.5：任何一帧抛错都不能让主循环死掉（死掉 = 黑屏 / 定格）。记录、恢复、继续下一帧。
      try { this.update(dt); } catch (err) { this.onFrameError('update', err); }
      const u1 = performance.now();
      // v0.71：面板 / 对话框开着时世界静止，补两帧当背景就不再重画（原来每帧照画，满屏二十来个
      // 路人就是十几毫秒，点击只能排在它后面——「点了半天才反应」多半出自这里）。关掉面板自然恢复。
      const hold = !!this.modal || this.uiHold;
      this.holdFrames = hold ? this.holdFrames + 1 : 0;
      if (!this.inCave && this.holdFrames <= 1) { try { this.renderer.render(dt); } catch (err) { this.onFrameError('render', err); } }
      for (const fn of this.afterFrameListeners) { try { fn(t); } catch (err) { this.onFrameError('afterFrame', err); } }
      const u2 = performance.now();
      prof.endFrame(rdt * 1000);
      // v0.71 全局 LOD：把这一帧的真实耗时喂给自适应偏置（掉帧时所有系统一起少画细节，
      // 回到 60fps 附近再慢慢补回来），不用各系统自己写「低配模式」。
      lodNote(adaptiveFrameSeconds(rdt, this.frameLimit) * 1000);
      const pf = this.perf; pf.frames++; pf.acc += rdt; pf.upd += u1 - u0; pf.ren += u2 - u1; pf.worst = Math.max(pf.worst, rdt * 1000);
      if (pf.acc >= 0.5) { pf.fps = pf.frames / pf.acc; pf.updMs = pf.upd / pf.frames; pf.renMs = pf.ren / pf.frames; pf.worstMs = pf.worst; pf.frames = 0; pf.acc = 0; pf.upd = 0; pf.ren = 0; pf.worst = 0; }
      if (this.renderer.stage) this.renderer.stage.gpuTiming = this.showPerf;
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private onFrameError(where: string, err: unknown) {
    this.renderErrs++;
    console.error(`[fanren] ${where} 帧异常 #${this.renderErrs}`, err);
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
  /** I：与同行道侣交谈（不再与 T 抢键） */
  talkLover() {
    const f = this.hearts.follower();
    if (!f) { this.toast('身边没有同行的道侣。', 'info'); return; }
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
    this.terrain?.releaseCaches?.();
  }

  // ---------- 主更新 ----------
  update(dt: number) {
    // v0.52.5：人在洞府场景里——禁制护身，不吃移动输入；摇杆 / 鼠标残留一并清零
    if (this.inCave) { this.combat.invulnT = Math.max(this.combat.invulnT, 1); this.input.joy.x = 0; this.input.joy.y = 0; this.input.joyMag = 0; this.destination = null; this.input.mouse.active = false; }
    if (!this.halted && !this.hero.dead) this.time += dt;
    this.terrain.frame++;
    if (this.mods && !this.paused && !this.hero.dead) this.mods.tick(dt);
    if (this.visitQ && !this.modal && !this.paused && !this.hero.dead) { const n = this.visitQ; this.visitQ = null; audio.sfx('chime'); this.openDialog(n); }
    if (!this.halted) this.promoCheck(dt);
    if (!this.halted && !this.hero.dead) { const _s = prof.t(); this.updateSense(dt); prof.add('U·神识', _s); }
    const p = this.player, st = p.st, h = this.hero;
    const playerStartX = p.x, playerStartY = p.y;
    let moveDX = 0, moveDY = 0;
    // 高空：飞行时缓缓升高，疾遁时更高——镜头随之拉远
    const altT = this.player.flying ? (this.player.boosting ? 1 : this.player.moving ? 0.5 : 0.3) : 0;
    this.alt += (altT - this.alt) * Math.min(1, dt * (altT > this.alt ? 0.7 : 1.6));
    // 自动运镜（战斗取景）：锁定的敌人远在投放距离边缘时，镜头略微拉远并偏向对方，保证双方同在画面中。
    // 设置里「自动运镜」关掉就整块跳过，镜头只跟人物自己。
    {
      const c = this.combat, R = c.reach;
      let tg = this.autoCam && c.lock && !c.lock.dead && Math.hypot(c.lock.x - p.x, c.lock.y - p.y) < R * 1.1 ? c.lock : null;
      if (this.autoCam && !tg) { let bd = R; for (const e of c.enemies) { if (e.dead || !e.aggro || e.spar) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; tg = e; } } }
      let fz = 1, lx = 0, ly = 0;
      // 疾速赶路（御空 1.8×、催动遁光更高）时不做战斗取景：地跑是 1.6×base，取景按 1.9×base 起收
      // 沿途妖兽不断进入锁敌半径又被甩开，取景目标一换，镜头就被推回去一下——
      // 看着像人物"倒退一下"，其实位置/骨骼都不回退，动的是镜头。
      const base = realmDef(h.realm).speed;
      const fw = clamp((base * 1.9 - st.speed) / (base * 0.35), 0, 1);
      if (tg && !this.halted && fw > 0.01) {
        const dx = tg.x - p.x, dy = tg.y - 40 - p.y, LEAN = 0.32;
        const W = (typeof window !== 'undefined' && window.innerWidth) || 1280, H = (typeof window !== 'undefined' && window.innerHeight) || 800;
        const zNeed = Math.min(W * 0.4 / Math.max(1, Math.abs(dx) * (1 - LEAN)), H * 0.34 / Math.max(1, Math.abs(dy) * (1 - LEAN)));
        const z0 = Math.max(this.minZoom, this.cam.targetZoom * (1 - 0.3 * this.alt));
        fz = 1 + (clamp(Math.max(0.42, zNeed) / z0, 0.5, 1) - 1) * fw;
        lx = dx * LEAN * fw; ly = dy * LEAN * fw;
      }
      // 大招运镜（同样归「自动运镜」管）
      const cn = this.cine; cn.t += dt;
      const cOn = this.autoCam && cn.t < cn.dur ? 1 : 0; cn.k += (cOn - cn.k) * Math.min(1, dt * (cOn ? 4 : 2));
      if (cn.k > 0.002) { fz *= 1 + (cn.z - 1) * cn.k; lx += (cn.x - p.x) * 0.5 * cn.k; ly += (cn.y - 40 - p.y) * 0.5 * cn.k; }
      const k = Math.min(1, dt * 2.2);
      this.camFrameZ += (fz - this.camFrameZ) * k; this.camLeanX += (lx - this.camLeanX) * k; this.camLeanY += (ly - this.camLeanY) * k;
    }
    // 飞行高度带来的拉远也归「自动运镜」：关掉后缩放只由玩家自己控制
    const altK = this.autoCam ? 1 : 0;
    const minZoom = this.minZoom;
    if (this.cam.targetZoom < minZoom) this.cam.targetZoom = minZoom;
    const zT = Math.max(minZoom, this.cam.targetZoom * (1 - 0.3 * this.alt * altK) * this.camFrameZ);
    this.cam.zoom += (zT - this.cam.zoom) * Math.min(1, dt * (Math.abs(zT - this.cam.targetZoom) > 0.01 ? 3 : 10));
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
      // 手动接管：自动寻路与托管御剑作废（并在有名字时告知玩家，免得以为导航坏了）
      if (mx || my) {
        if (this.autoFlight) { this.autoFlight = null; this.toast('手动接管，已暂停托管御剑。', 'info'); }
        else if (this.destination?.name) this.toast(`已取消导航：${this.destination.name}`, 'info');
        this.destination = null; this.pendingGather = null; this.pendingTalk = null;
      }
      if (this.autoFlight) {
        if (this.isFlying && h.mp < 0.08) {
          this.stopAutoFlight('灵力低微，托管御剑停驻休整！');
        }
      }
      // v0.52.4 手机：点了某人就一路跟过去，到跟前自动开口
      if (!mx && !my && this.pendingTalk) {
        const a = this.npcs.active.get(this.pendingTalk);
        if (!a || !a.d.alive || a.enemy) this.pendingTalk = null;
        else if (this.npcs.focus === a) { this.pendingTalk = null; this.destination = null; this.interact(); }
        else this.setDestination(a.st.x, a.st.y + 34);
      }
      if (!mx && !my && this.destination) {
        if (this.destination.followNpcId) {
          const fn = this.npcs.byId.get(this.destination.followNpcId);
          if (!fn || !fn.alive || npcMap(fn) !== ACTIVE_MAP) {
            const nm = fn?.name ?? this.destination.name ?? '目标';
            this.destination = null; this.autoFlight = null;
            if (this.guide?.followNpcId) this.guide = null;
            this.toast(`${nm}已不在附近界域或已身陨，导航已取消。`, 'warn');
          } else {
            const act = this.npcs.active.get(fn.id);
            const nx = clamp(act ? act.st.x : fn.x, 200, WORLD_W - 200);
            const ny = clamp(act ? act.st.y : fn.y, 200, WORLD_H - 200);
            this.destination.x = nx; this.destination.y = ny;
            if (this.autoFlight?.followNpcId === fn.id) { this.autoFlight.x = nx; this.autoFlight.y = ny; }
            if (this.guide?.followNpcId === fn.id) { this.guide.x = nx; this.guide.y = ny; }
          }
        }
        if (this.destination) {
          const dx = this.destination.x - p.x, dy = this.destination.y - p.y, d = Math.hypot(dx, dy);
          if (d < DESTINATION_ARRIVE_RADIUS || (this.pendingGather && Math.hypot(this.pendingGather.x - p.x, this.pendingGather.y - p.y) < GATHER_RANGE * 0.8)) {
            const arrived = this.destination.name;
            this.destination = null;
            this.autoFlight = null;
            if (arrived) this.toast(`已到达：${arrived}`, 'good');
            if (this.pendingGather) { this.pendingGather = null; this.tryGather(); }
          }
          else { mx = dx / d; my = dy / d; }
        }
      }
      if (!this.combat.canMove || this.tianxiang.active) { mx = 0; my = 0; }
      const len = Math.hypot(mx, my);
      const wantMove = len > 0.05;
      if (wantMove && p.sitting) this.stand();
      if (wantMove && this.gathering) { this.gathering = null; }
      // v0.52.4：手机摇杆推到底（joyMag > 0.86）自动疾行，另有「疾行」按钮常开
      const joyRun = this.input.joyMag > JOY_RUN_MAG;
      if (joyRun !== this.lastJoyRun) {
        this.lastJoyRun = joyRun;
        this.updateUI(true);
      }
      const wantRun = k.has('shift') || this.input.run || joyRun;
      p.running = wantRun && !this.isFlying;
      const wantBoost = (wantRun || (!!this.autoFlight && h.mp > 0.28)) && this.isFlying && wantMove;
      if (wantBoost && !p.boosting && h.mp > 0.06) { p.boosting = true; audio.sfx(this.boostKind === 'thunder' ? 'thunder' : 'whoosh'); }
      else if (!wantBoost || h.mp <= 0.01) { if (p.boosting && h.mp <= 0.01) this.toast('法力枯竭，遁光一黯。', 'warn'); p.boosting = false; }
      if (p.boosting) {
        h.mp = Math.max(0, h.mp - this.boostDrain * dt);
        this.boostSfxT -= dt; if (this.boostSfxT <= 0 && this.boostKind === 'thunder') { this.boostSfxT = 0.9 + Math.random() * 0.6; audio.sfx('thunder'); }
      }
      p.moving = wantMove;
      let vx = 0, vy = 0;
      if (p.moving) {
        if (len > 1) { mx /= len; my /= len; }
        if (Math.abs(mx) > 0.15) p.facing = mx > 0 ? 1 : -1;
        const MJ = this.mijing.active;
        const factor = this.isFlying || MJ ? 1 : this.terrain.walkFactor(p.x, p.y) || 1;
        const sp = this.speed * factor * this.combat.speedMul;
        const ox = p.x, oy = p.y;
        const nx = MJ ? p.x + mx * sp * dt : clamp(p.x + mx * sp * dt, 200, WORLD_W - 200), ny = MJ ? p.y + my * sp * dt : clamp(p.y + my * sp * dt, 200, WORLD_H - 200);
        this.travel.dir.x = mx; this.travel.dir.y = my;
        // 第二十二步：屋舍城墙挡路（已身陷其中时放行，便于走出）
        const S = this.space, free = this.isFlying || S.blocked(p.x, p.y);
        const okAt = (x: number, y: number) => MJ ? this.mijing.walk(x, y) : this.terrain.walkFactor(x, y) > 0 && (free || !S.blocked(x, y));
        if ((this.isFlying && !MJ) || okAt(nx, ny)) { p.x = nx; p.y = ny; }
        else if (okAt(nx, p.y)) { p.x = nx; }
        else if (okAt(p.x, ny)) { p.y = ny; }
        else if (MJ) { this.destination = null; }
        else {
          this.destination = null;
          if (this.blockedTimer <= 0) {
            this.toast('前方是茫茫大海。炼气期修士无法渡海，需筑基御器，或寻找传送阵、乘坐渡船。', 'warn');
            this.blockedTimer = 6;
          }
        }
        moveDX = p.x - ox; moveDY = p.y - oy;
        vx = moveDX / Math.max(dt, 1e-4); vy = moveDY / Math.max(dt, 1e-4);
        p.walkT += dt * (this.isFlying ? 1 : factor * Math.min(1, len));
        if (this.combat.castT <= 0) st.faceToward(mx, my, false);
      }
      this.blockedTimer -= dt;
      // 动作状态机
      st.x = p.x; st.y = p.y; st.vx = vx; st.vy = vy; st.speed = Math.hypot(vx, vy);
      st.windX = this.weather.wind * 30; st.windY = 0;
      // 步态写进 st：否则只有上半身有动作（走路时腿不摆）；飞行时施法/受击/闪避也保留飞行下肢与脚下飞剑
      const ov = this.combat.actionOverride();
      st.gait = this.isFlying ? 'fly' : (p.moving ? (p.running ? 'run' : 'walk') : null);
      if (this.isFlying) st.lift += (96 + this.alt * 64 - st.lift) * Math.min(1, dt * 4);
      else st.lift += (0 - st.lift) * Math.min(1, dt * 6);
      // 一次性动作（施法/受击/闪避）优先：若先设基础站姿、再被 override 覆盖，
      // 每帧 idle/fly↔cast 来回切，castN 会持续自增、actionT 每帧清零（施法停在第 1 帧）。
      if (ov === 'cast' && this.combat.castSeq !== this.lastCastSeq) {
        this.lastCastSeq = this.combat.castSeq;
        st.castPose();
      } else if (ov) {
        st.setAction(ov);
      } else if (this.isFlying) {
        st.gait = null;
        st.setAction('fly');
      } else if (this.gathering) st.setAction('gather');
      else if (p.sitting) st.setAction('sit');
      else if (p.moving) st.setAction(p.running ? 'run' : 'walk');
      else st.setAction('idle');
      let _t = prof.t(); this.combat.update(dt); prof.add('U·战斗', _t);
      const MJ2 = this.mijing.active;
      _t = prof.t(); if (!MJ2) { this.pursuit.update(dt); this.pursuitTriggers(dt); } prof.add('U·追杀', _t);
      _t = prof.t(); this.npcs.update(dt); prof.add('U·NPC', _t);
      _t = prof.t(); this.rel.update(dt); this.roster.update(dt); this.garrison.update(dt); this.war.update(dt); this.sectwar.update(dt); prof.add('U·人脉名册大战', _t);
      _t = prof.t(); if (!MJ2) { this.travel.update(dt); this.events.update(dt); this.story.update(dt); } prof.add('U·事件剧情', _t);
      _t = prof.t(); if (!MJ2) { this.landmarks.update(dt); this.sites.update(dt); this.home.update(dt); this.happen.update(dt); this.daoxin.update(dt); this.pianju.update(dt); } this.jianghu.tick(dt); this.pets.update(dt); this.heartx.update(dt); prof.add('U·名地遗府奇遇', _t);
      _t = prof.t(); this.shentong.update(dt); this.yuanying.update(dt); this.tickYingEscape(dt); this.zhenfa.update(dt); this.shen.update(dt); if (!MJ2) { this.friends.update(dt); this.zhongsheng.update(dt); } this.mijing.update(dt); prof.add('U·神通阵法', _t);
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
      if (p.sitting) this.sitDays += days;
      this.mysect.sync();
      // v0.73：分帧错峰日结算（4 帧轮替分摊 13 个日结算系统，消除单帧卡顿尖峰）
      this.relAcc += days;
      const dailyStep = p.sitting ? 1.0 : 0.5;
      if (this.relAcc >= dailyStep) {
        this.dailyQueue.push({ d: this.relAcc, slot: 0 });
        this.relAcc = 0;
      }
      if (this.dailyQueue.length) {
        const _d = prof.t();
        const task = this.dailyQueue[0];
        this.runDailySlot(task.slot, task.d);
        task.slot++;
        if (task.slot >= 4) this.dailyQueue.shift();
        prof.add('U·日结算', _d);
      }
      const msgs: Msg[] = [];
      const hadTalent = !!h.pendingTalent;
      const expB = this.hearts.bonus('exp');
      const mp0 = h.mp;
      // 修炼加成在 gainExp 前合并，跨小境界及抵达瓶颈时都走相同的上限规则。
      C.passDays(h, days, p.sitting, this.placeBonus().mult, msgs, Number.isFinite(expB) && expB > 0 ? 1 + expB : 1, ACTIVE_WORLD);
      if (ACTIVE_WORLD === 'spirit' || (this.ws.ascendedWorlds?.includes('spirit'))) {
        msgs.push(...HP.collectSpiritDomains(h, this.ws, this.day));
      }
      if (h.realm >= 9) {
        msgs.push(...HP.tickFiveDecays(h, days, this.day, p.x, p.y));
      }
      HP.decayPlaneRejection(h, days);
      const canj = HP.absorbCanjuanPages(h);
      if (canj.msg) msgs.push({ text: canj.msg, kind: 'good' });
      if (this.senseBurstT > 0 || p.boosting) h.mp = Math.min(h.mp, mp0);   // 神识外放 / 催动遁光期间法力不回
      const rg = this.hearts.bonus('regen'); if (rg > 0 && !this.combat.inCombat) { h.hp = Math.min(1, h.hp + rg * 0.01 * dt); if (this.senseBurstT <= 0 && !p.boosting) h.mp = Math.min(1, h.mp + rg * 0.01 * dt); }
      this.flushMsgs(msgs);
      if (!hadTalent && h.pendingTalent) { this.stand(); this.onPanel?.('char', true); }
      const curBn = C.bottleneck(h, ACTIVE_WORLD);
      if (p.sitting && curBn !== 'none' && !this.bnWarned) {
        this.bnWarned = true;
        this.toast(curBn === 'major' ? `修为已臻${realmName(h.realm, h.stage)}圆满，可尝试冲击${REALMS[h.realm + 1]?.name ?? ''}（C 打开角色面板）。` : '修为已至瓶颈，需服丹冲关方能更进一步（C 打开角色面板）。', 'warn');
      }
      if (curBn === 'none') this.bnWarned = false;
      if (h.dead) { this.stand(); this.updateUI(true); try { localStorage.removeItem(SLOT_KEYS[0]); } catch { /* */ } this.daoxin.onAgeDeath(); }
      if (!MJ2) { const _r = prof.t(); this.revealAround(false); prof.add('U·探索迷雾', _r); }
    }
    if (active) {
      if (p.sitting && this.sitClockFreeze !== null) {
        // 打坐时仅保留极微缓静气律动，彻底杜绝昼夜高速频闪
        this.sitClockFreeze += dt * 0.12;
      } else {
        this.clock = (this.clock + dt) % (DAY_CYCLE * 10000);
      }
    }
    // 战斗击退、禁制、秘境校正等可能在普通移动之后再次改变坐标。
    // 骨骼与相机都应使用最终位置，避免人物画在上一处而影子/镜头已经移走。
    p.st.x = p.x; p.st.y = p.y;
    let _u = prof.t(); p.st.update(dt); prof.add('U·主角骨骼', _u);
    // 天气 / 生灵
    _u = prof.t();
    const s = this.terrain.sample(p.x, p.y);
    this.weather.update(dt, { cold: s.cold, arid: s.arid, sea: !this.terrain.isLand(p.x, p.y) || s.land < 0.6, season: this.season, map: ACTIVE_MAP });
    prof.add('U·天气', _u); _u = prof.t();
    if (this.renderer && !this.mijing.active) {
      const v = this.renderer.viewRect();
      this.life.update(dt, this, v, this.night, this.season, this.weather.kind);
      this.scenery.update(dt, this, v);
    }
    prof.add('U·生灵', _u);
    // 第四十六步：突破天象
    this.tianxiang.update(dt, this);
    // 相机跟随：常规移动由镜头同步随动人物位移，并按当前视口半宽做安全夹紧，避免高境界高速移动时人物偏出屏幕
    const stForCam = p.st as { visualCenterOffY?: number } | undefined;
    if (!this.camCenterReady && stForCam && Number.isFinite(stForCam.visualCenterOffY)) {
      this.camCenterReady = true;
      if (!p.moving && this.cine.k < 0.002) this.cam.y = this.camAnchorY();
    }
    const camAnchorY = this.camAnchorY();
    const freeCam = active && this.cine.k < 0.002;
    const vw = this.renderer?.W || (typeof window !== 'undefined' ? window.innerWidth : 1280);
    const vh = this.renderer?.H || (typeof window !== 'undefined' ? window.innerHeight : 800);
    const camZ = Math.max(0.2, this.cam.zoom);
    const follow = followCamera(this.cam.x, this.cam.y,
      p.x + this.debugCamDX + this.camLeanX, camAnchorY + this.camLeanY,
      dt, p.x - playerStartX, p.y - playerStartY,
      active && p.moving && this.cine.k < 0.002,
      freeCam ? {
        stepX: moveDX,
        stepY: moveDY,
        anchorX: p.x,
        anchorY: camAnchorY,
        maxOffsetX: (vw * 0.5 / camZ) * 0.55,
        maxOffsetY: (vh * 0.5 / camZ) * 0.55,
      } : undefined);
    this.cam.x = follow.x; this.cam.y = follow.y;

    _u = prof.t(); if (!this.mijing.active) this.space.update(dt, p.x, p.y); prof.add('U·屋舍碰撞', _u);
    this.regionTimer -= dt;
    if (this.regionTimer <= 0 && this.mijing.active) { this.regionTimer = 0.35; if (!this.halted) this.hintTick(); }
    if (this.regionTimer <= 0) { _u = prof.t(); this.regionTimer = 0.35; this.checkRegion(); this.exploreCheck(this.nearbyLocation()); this.townAutoZoom(); if (!this.halted) this.hintTick(); prof.add('U·区域检测', _u); }
    this.uiTimer -= dt;
    // HUD 刷新率：0.18s（约 5.5Hz）足够看，原来 0.12s 会让整棵 React HUD 每秒重渲染八次，
    // 在低端机上这部分布局/绘制开销并不小
    if (this.uiTimer <= 0) { _u = prof.t(); this.uiTimer = 0.18; if (!this.halted) this.updateUI(); prof.add('U·界面刷新', _u); }
    // 打斗结束（或暂停结束）后，把"闲讯暂缓"的那批补弹出来
    if (this.toastDeferred.length && !this.toastFighting()) this.toastTick();
    if (this.pendingPlaneReturn) {
      const target = this.pendingPlaneReturn;
      this.pendingPlaneReturn = null;
      this.executeReturnHigherPlane(target);
    }
    this.saveTimer += dt;
    if (this.saveTimer > 45 && ((!p.moving && !this.renderer?.isZoomActive && !this.combat.inCombat) || this.saveTimer > 60)) {
      _u = prof.t(); this.saveTimer = 0;
      // 自动存档失败不能一直闷着：玩家可能就这么玩了一下午，回头才发现进度没写进去。只提醒一次。
      if (!this.save(0, true) && !this.saveWarned) {
        this.saveWarned = true;
        this.toast(`自动存档没能写进去——${this.saveFailText().replace(/^本地存档失败[：:]?/, '')}`, 'warn');
      }
      prof.add('U·自动存档', _u);
    }
    _u = prof.t(); audio.tick(this, dt); prof.add('U·声音', _u);
  }
  private bnWarned = false;

  flushMsgs(msgs: Msg[]) {
    for (const m of msgs) {
      this.toast(m.text, m.kind === 'warn' ? 'warn' : m.kind === 'good' ? 'good' : 'info');
      if (m.text.includes('晋入') || m.text.includes('成矣')) audio.sfx('break');
    }
  }

  /** 奇遇等奖励统一按感悟池和瓶颈结算，返回实际修为并展示晋阶消息。 */
  gainInsightExp(amount: number): number {
    const msgs: Msg[] = [];
    const gained = C.gainExp(this.hero, amount, msgs, 'insight', ACTIVE_WORLD);
    this.flushMsgs(msgs);
    return gained;
  }

  // ---------- 第二步操作 ----------
  toggleSit() {
    const p = this.player;
    if (this.hero.dead) return;
    if (p.sitting) { this.stand(); return; }
    if (this.yuanying?.active) { this.toast('元婴在外，肉身已在打坐。（再按出窍键归窍）', 'info'); return; }
    if (this.isFlying) {
      if (this.terrain.walkFactor(p.x, p.y) <= 0) { this.toast('身下是大海，无法落脚打坐。', 'warn'); return; }
      p.flying = false; audio.sfx('land');   // 自动按下遁光，落地打坐
    }
    this.gathering = null; this.destination = null;
    this.sitClockFreeze = this.clock;
    this.sitDays = 0;
    p.sitting = true;
    const pl = this.placeBonus();
    this.toast(`盘膝打坐，运转${C.gongfaDef(this.hero).name}……（2 秒 1 日 · ×${TUNING.meditateSpeed}${pl.mult > 1 ? `，${pl.name}灵气充沛 ×${pl.mult.toFixed(1)}` : ''}）`);
    audio.sfx('chime');
  }
  stand() {
    if (this.player.sitting) {
      this.player.sitting = false;
      if (this.sitDays > 0) {
        this.clock = (this.clock + this.sitDays * DAY_CYCLE) % (DAY_CYCLE * 10000);
      }
      this.sitClockFreeze = null;
      this.sitDays = 0;
    }
  }
  private effectiveClock() {
    return this.player.sitting && this.sitDays > 0
      ? (this.clock + this.sitDays * DAY_CYCLE) % (DAY_CYCLE * 10000)
      : this.clock;
  }
  private runDailySlot(slot: number, d: number, skipSectwarDaily = false) {
    if (slot === 0) { this.rel.daily(d); this.jianghu.daily(d); this.orig.daily(d); }
    else if (slot === 1) { this.roster.daily(d); this.garrison.daily(d); this.friends.daily(d); }
    else if (slot === 2) { this.war.daily(d); if (!skipSectwarDaily) this.sectwar.daily(d); this.mysect.daily(d); }
    else if (slot === 3) { this.daoxin.daily(d); this.pianju.daily(d); this.mijing.daily(d); this.mods?.day(d); }
  }
  private flushDailyQueue(skipSectwarDaily = false) {
    while (this.dailyQueue.length) {
      const task = this.dailyQueue[0];
      this.runDailySlot(task.slot, task.d, skipSectwarDaily);
      task.slot++;
      if (task.slot >= 4) this.dailyQueue.shift();
    }
    if (this.relAcc > 0.01) {
      const d = this.relAcc; this.relAcc = 0;
      for (let s = 0; s < 4; s++) this.runDailySlot(s, d, skipSectwarDaily);
    }
  }
  advanceWorldDays(days: number, opts?: { skipSectwarDaily?: boolean }) {
    if (!Number.isFinite(days) || days <= 0) return;
    this.flushDailyQueue(!!opts?.skipSectwarDaily);
    for (let s = 0; s < 4; s++) this.runDailySlot(s, days, !!opts?.skipSectwarDaily);
  }
  /** 第十八步：一次性度过若干日（参悟、双修、掩埋……） */
  passDays(n: number, opts?: { skipWorldDaily?: boolean; skipSectwarDaily?: boolean }) {
    if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(this.day + n)) return;
    const msgs: Msg[] = [];
    C.passDays(this.hero, n, false, 1, msgs, 1, ACTIVE_WORLD);
    this.day += n;
    this.clock = (this.clock + n * DAY_CYCLE) % (DAY_CYCLE * 10000);
    if (!opts?.skipWorldDaily) {
      this.advanceWorldDays(n, { skipSectwarDaily: opts?.skipSectwarDaily });
      if (n >= 1) this.npcs.catchUp();
    }
    this.flushMsgs(msgs.filter((m) => m.kind));
  }
  /** 第十八步：地图上的通用标记（世界坐标） */
  mapMarks(): { x: number; y: number; glyph: string; color: string; ring?: number; name: string }[] {
    const out: { x: number; y: number; glyph: string; color: string; ring?: number; name: string }[] = [...this.friends.marks(), ...this.mijing.marks(), ...this.renxin.marks(), ...this.jianghu.marks(), ...this.daoxin.marks(), ...this.pianju.marks(), ...this.sites.marks(), ...this.happen.marks(), ...this.heartx.marks(), ...this.landmarks.marks(), ...this.combat.lairMarks(), ...this.war.marks(), ...this.sectwar.marks()];
    // v0.52.9：洞府没探明时也给个「府」标（以前只靠剧情推开才看得见），并带「可进府」提示
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
  guide: { x: number; y: number; name: string; map: string; followNpcId?: string } | null = null;
  setGuide(x: number, y: number, name: string, followNpcId?: string) {
    const p = this.player;
    this.guide = { x, y, name, map: ACTIVE_MAP, followNpcId };
    this.toast(`已指路：${name}——在${dirName(x - p.x, y - p.y)}方约 ${Math.round(Math.hypot(x - p.x, y - p.y) / 30)} 丈（地图上青色「指」字）`, 'info');
  }
  /** 汇总当前正在进行中的好友求援 / 玉符求救 / 玉符求助 / 红颜求援 / 友人之约，供导航与大地图直达 */
  activeSosTargets(): { id: string; tag: string; name: string; title: string; detail: string; x: number; y: number; daysLeft: number; map: string; urgent: boolean; inviteId?: number; jadeId?: number; followNpcId?: string }[] {
    const out: { id: string; tag: string; name: string; title: string; detail: string; x: number; y: number; daysLeft: number; map: string; urgent: boolean; inviteId?: number; jadeId?: number; followNpcId?: string }[] = [];
    const day = this.day;
    for (const inv of this.friends?.S?.invites ?? []) {
      if (inv.done || inv.declined || !isActiveWorldMap(inv.map) || !Number.isFinite(inv.x) || !Number.isFinite(inv.y)) continue;
      if (inv.kind !== 'help' && !inv.accepted) continue;
      const d = this.npcs.byId.get(inv.npc);
      const who = d?.name ?? '故人';
      const left = Math.max(0, Math.ceil(inv.until - day));
      out.push({
        id: `inv:${inv.id}`,
        tag: inv.kind === 'help' ? '求援' : '邀约',
        name: who,
        title: inv.kind === 'help' ? `${who}求援 · ${inv.place}` : `${who}之约 · ${inv.place}`,
        detail: `${inv.place} · 余 ${left} 日`,
        x: inv.x,
        y: inv.y,
        daysLeft: left,
        map: inv.map,
        urgent: inv.kind === 'help',
        inviteId: inv.id,
      });
    }
    for (const j of this.war?.inbox ?? []) {
      if (j.done) continue;
      if (j.kind === '求救' && j.x !== undefined && j.y !== undefined) {
        const d = j.fromId ? this.npcs.byId.get(j.fromId) : undefined;
        if (d && (!d.alive || (d.map ?? 'renjie') !== ACTIVE_MAP)) continue;
        const left = j.until !== undefined ? Math.max(0, Math.ceil(j.until - day)) : 3;
        out.push({
          id: `jade:${j.id}`,
          tag: '求救',
          name: j.from,
          title: `${j.from}遇险求救`,
          detail: `玉符传讯 · 余 ${left} 日`,
          x: j.x,
          y: j.y,
          daysLeft: left,
          map: ACTIVE_MAP,
          urgent: true,
        });
      } else if (j.kind === '求助' && j.foeId) {
        const foe = this.npcs.byId.get(j.foeId);
        if (foe && foe.alive && (foe.map ?? 'renjie') === ACTIVE_MAP) {
          const left = j.until !== undefined ? Math.max(0, Math.ceil(j.until - day)) : 7;
          const act = this.npcs.active.get(foe.id);
          out.push({
            id: `req:${j.id}`,
            tag: '求助',
            name: j.from,
            title: `${j.from}所托 · 寻${foe.name}`,
            detail: `仇敌行踪 · 余 ${left} 日`,
            x: act ? act.st.x : foe.x,
            y: act ? act.st.y : foe.y,
            daysLeft: left,
            map: ACTIVE_MAP,
            urgent: true,
            jadeId: j.id,
            followNpcId: foe.id,
          });
        }
      }
    }
    const sos = (this.ws.flags as any).sos;
    if (sos && Number.isFinite(sos.x) && Number.isFinite(sos.y)) {
      const b = BEAUTY_BY_ID[sos.id];
      const d = this.npcs.byId.get('b_' + sos.id);
      if (b && (!d || (d.alive && (d.map ?? 'renjie') === ACTIVE_MAP))) {
        const left = Math.max(0, Math.ceil((sos.until ?? day) - day));
        out.push({
          id: `beauty:${sos.id}`,
          tag: '求援',
          name: b.name,
          title: `${b.name}遇险求援`,
          detail: `红颜急讯 · 余 ${left} 日`,
          x: sos.x,
          y: sos.y,
          daysLeft: left,
          map: ACTIVE_MAP,
          urgent: true,
        });
      }
    }
    return out;
  }
  /** 大事记第三栏「眼下机缘」：此刻能做、值得做的事 */
  chances(): { t: string; d: string; x?: number; y?: number; hot?: boolean; tone?: string }[] {
    const out: { t: string; d: string; x?: number; y?: number; hot?: boolean; tone?: string }[] = [...this.renxin.chances(), ...this.jianghu.chances(), ...this.daoxin.chances(), ...this.pianju.chances()];
    const f = this.ws.flags as any, p = this.player, day = this.day;
    const far = (x: number, y: number) => `${dirName(x - p.x, y - p.y)}方约 ${Math.round(Math.hypot(x - p.x, y - p.y) / 30)} 丈`;
    // 大夺宝
    const gc = this.happen.great.chance(); if (gc) out.push(gc);
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
        const dist = w.x !== undefined && w.y !== undefined ? `，${dirName(w.x - p.x, w.y - p.y)}方约 ${Math.max(1, Math.round(Math.hypot(w.x - p.x, w.y - p.y) / 30))} 丈` : '';
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
    // v0.73：统帅部军令写入「眼下机缘」与大地图指路
    for (const ord of this.sectwar?.activeWarOrders() ?? []) {
      const on = ord.map === ACTIVE_MAP;
      const ox = on ? ord.x : undefined, oy = on ? ord.y : undefined;
      out.push({
        t: `军令 · ${ord.title}`,
        d: `${ord.desc}（战功 +${ord.merit}，余 ${Math.max(1, Math.ceil(ord.until - day))} 日${ox !== undefined ? '，' + far(ox, oy!) : ''}）`,
        x: ox, y: oy, hot: true, tone: 'gold',
      });
    }
    // 下一件原著大事
    const ne = this.events.nextStart();
    if (ne) { const m = Math.max(0, Math.round((ne.day - day) / 30)); out.push({ t: '天下将变', d: m <= 0 ? `「${ne.name}」即将开始！` : `「${ne.name}」约 ${m} 个月后开始。` }); }
    // 红颜
    for (const r of this.hearts.list()) if (r.s?.met && !r.s.flags.parted && r.hint && !r.hint.startsWith('故事') && !r.hint.startsWith('道侣')) { out.push({ t: '红颜 · ' + r.b.name, d: r.hint, tone: 'love' }); if (out.filter((o) => o.tone === 'love').length >= 2) break; }
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
    if (gd && gd.map === ACTIVE_MAP) {
      if (gd.followNpcId) {
        const fn = this.npcs.byId.get(gd.followNpcId);
        if (!fn || !fn.alive || npcMap(fn) !== ACTIVE_MAP) { this.guide = null; }
        else { const act = this.npcs.active.get(fn.id); gd.x = act ? act.st.x : fn.x; gd.y = act ? act.st.y : fn.y; }
      }
      if (this.guide && withinArrivalRadius(p.x, p.y, this.guide.x, this.guide.y, GUIDE_ARRIVE_RADIUS)) {
        const gname = this.guide.name;
        this.guide = null; this.toast(`已到达：${gname}`, 'good');
      }
    }
    const s = this.ws.sect; if (!s) return;
    const f = this.ws.flags as any;
    if (this.towns.promoteReq().ok) {
      if (f.promoNote !== s.rank) { f.promoNote = s.rank; this.toast(`宗门传讯：你已够格晋升「${SECT_RANKS[s.rank + 1]}」，回山门即可晋升（J 大事记查看）`, 'good'); audio.sfx('chime'); }
    }
  }

  tryGather() {
    const p = this.player;
    if (this.hero.dead || this.gathering) return;
    if (this.isFlying) {
      if (this.terrain.walkFactor(p.x, p.y) <= 0) { this.toast('身下是大海，需落地方可采集。', 'warn'); return; }
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
    for (const it of got) {
      C.addItem(this.hero, it.item, it.n, it.age);
      parts.push(`${itemDef(it.item).name}×${it.n}`);
    }
    this.hero.stats.gathered++;
    C.temperDao(this.hero, 0.12);
    this.story.onGather();
    this.toast('采得 ' + parts.join('、'), 'good');
    audio.sfx('gather');
    this.renderer?.burst(g.node.x, g.node.y - 10, g.node.kind === 'ore' ? '#d8e0ff' : g.node.kind === 'spring' ? '#bff0ff' : '#c8ffb0');
    this.updateUI(true);
  }

  /** 闭关（可切片异步版）：返回可按帧预算推进的会话对象，供 UI 展示实时进度并防止长闭关卡死浏览器 */
  startSeclude(days: number, opts?: { ignoreInterrupts?: boolean }): SeclusionSession {
    this.flushDailyQueue();
    const h = this.hero;
    const from = realmName(h.realm, h.stage);
    const msgs: Msg[] = [];
    let cap = days > 0 ? days : DAYS_PER_YEAR * 60;
    let d = 0, gain = 0, reason = '期满出关';
    let interrupted: SecludeInterrupt | undefined;
    // 第三十六步：大事将起时提前出关（不至于一觉醒来错过）
    const nx = this.events.nextStart();
    let evCut = false;
    if (nx && nx.day > this.day && nx.day - this.day < cap) { cap = Math.max(0.05, nx.day - this.day); evCut = true; }
    const place = this.placeBonus().mult;
    const atCap = isAtRealmCap(h.realm, h.stage, ACTIVE_WORLD);
    if (atCap && days <= 0) {
      const report: SeclusionReport = { days: 0, from, to: from, expGain: 0, msgs: [{ text: `${realmCapDesc(ACTIVE_WORLD)}，已无瓶颈可冲，可按指定日数闭关静养。`, kind: 'info' }], reason: `已臻${realmCapLabel(ACTIVE_WORLD)}极境` };
      const snap = (): SeclusionProgress => ({
        done: true, phase: 'meditate', daysDone: 0, daysTarget: 0, progress: 1,
        exp: h.exp, need: C.need(h), realmText: from, age: h.age, maxLife: C.maxLife(h), report,
      });
      return { step: snap, cancelEarly: snap };
    }
    const shortTactical = days > 0 && days <= 90;
    const worldFlushStep = shortTactical ? 1 : 5;
    const jadeBefore = new Set((this.war?.inbox ?? []).map((j) => j.id));
    const mySid = this.ws.mySect ? 'mysect' : this.ws.sect?.id;
    const underSiegeBefore = !!(mySid && this.sectwar?.warOf(mySid)?.tgt === mySid);
    let worldAcc = 0;
    let phase: 'meditate' | 'catchup' = 'meditate';
    let catchUpProg = 0;
    let finalReport: SeclusionReport | undefined;

    const finalize = (): SeclusionProgress => {
      if (!finalReport) {
        if (evCut && d >= cap && reason === '期满出关') reason = `心血来潮——${nx!.name}将起，提前出关`;
        else if (atCap && reason === '期满出关') reason = '期满出关（已臻此界极境，修为未增）';
        this.clock = (this.clock + d * DAY_CYCLE) % (DAY_CYCLE * 10000);
        const to = realmName(h.realm, h.stage);
        const important = msgs.filter((m) => m.kind === 'good' || m.kind === 'warn');
        const collapsed: Msg[] = [];
        const drops = important.filter((m) => m.text.includes('墨露')).length;
        for (const m of important) if (!m.text.includes('墨露')) collapsed.push(m);
        if (drops) collapsed.push({ text: `问道残卷凝出墨露 ${drops} 滴。`, kind: 'good' });
        const vis = this.seclusionVisitor(d); if (vis) collapsed.push({ text: vis, kind: 'good' });
        if (from !== to) audio.sfx('break');
        this.save(0);
        this.updateUI(true);
        finalReport = { days: d, from, to, expGain: Math.round(gain), msgs: collapsed, reason, interrupted };
      }
      return {
        done: true, phase, daysDone: d, daysTarget: days > 0 ? cap : 0, progress: 1,
        exp: h.exp, need: C.need(h), realmText: realmName(h.realm, h.stage), age: h.age, maxLife: C.maxLife(h),
        report: finalReport,
      };
    };

    const enterCatchUp = () => {
      if (worldAcc > 0) {
        const wd = worldAcc; worldAcc = 0;
        for (let s = 0; s < 4; s++) this.runDailySlot(s, wd);
      }
      const cuDays = this.npcs.beginCatchUp();
      if (cuDays > 0) { phase = 'catchup'; catchUpProg = 0; return false; }
      return true;
    };

    const snapshot = (): SeclusionProgress => {
      const need = C.need(h);
      const medP = days > 0
        ? Math.min(1, d / Math.max(1, cap))
        : Math.min(0.96, h.exp / Math.max(1, need));
      const progress = phase === 'meditate' ? medP * 0.86 : 0.86 + 0.14 * catchUpProg;
      return {
        done: false, phase, daysDone: d, daysTarget: days > 0 ? cap : 0, progress: Math.min(0.99, progress),
        exp: h.exp, need, realmText: realmName(h.realm, h.stage), age: h.age, maxLife: C.maxLife(h),
      };
    };

    const step = (budgetMs = 12): SeclusionProgress => {
      if (finalReport) return finalize();
      const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const t0 = now();
      if (phase === 'meditate') {
        let medDone = false;
        while (d < cap) {
          if (h.pendingTalent) { reason = '心有所感，逆天改命'; medDone = true; break; }
          if (C.bottleneck(h, ACTIVE_WORLD) !== 'none') { reason = C.bottleneck(h, ACTIVE_WORLD) === 'major' ? '修为圆满，触及大境界瓶颈' : '触及瓶颈，需服丹冲关'; medDone = true; break; }
          if (!shortTactical && !atCap && C.isMedStale(h)) {
            reason = '久居闭关不历红尘，道心滞涩难进——须外出斗法斩敌、探寻秘境古迹或完成悬赏宗门差事印证所学';
            msgs.push({ text: '苦坐经年而未历生死印证，丹田灵力渐生郁结——一味闭关无法窥见大道，当出关入世历练！', kind: 'warn' });
            medDone = true; break;
          }
          const inc = Math.min(1, cap - d);
          const before = h.exp;
          const bl = h.realm * 100 + h.stage;
          C.passDays(h, inc, true, place, msgs, 1, ACTIVE_WORLD);
          gain += (h.realm * 100 + h.stage !== bl) ? C.expPerDay(h, place, ACTIVE_WORLD) * inc : Math.max(0, h.exp - before);
          d += inc;
          this.day += inc;
          worldAcc += inc;
          if (worldAcc >= worldFlushStep) {
            const wd = worldAcc; worldAcc = 0;
            for (let s = 0; s < 4; s++) this.runDailySlot(s, wd);
          }
          if (h.pendingTalent) { reason = '心有所感，逆天改命'; medDone = true; break; }
          if (h.dead) { reason = '寿元耗尽'; medDone = true; break; }
          if (!opts?.ignoreInterrupts && cap - d >= 1) {
            const newUrgent = (this.war?.inbox ?? []).find((j) => !jadeBefore.has(j.id) && !j.done && (j.kind === '召集' || j.kind === '求救'));
            const underSiegeNow = !!(mySid && this.sectwar?.warOf(mySid)?.tgt === mySid);
            if (underSiegeNow && !underSiegeBefore) {
              const remainDays = Math.max(1, Math.ceil(cap - d));
              reason = '山门告急，闭关中断';
              interrupted = { kind: 'sect_attack', title: '山门大阵受袭', desc: '敌宗兵锋已抵山门外围，巡山弟子连敲聚灵钟传讯！是否破关迎敌？', remainDays };
              medDone = true; break;
            }
            if (newUrgent) {
              const remainDays = Math.max(1, Math.ceil(cap - d));
              reason = `传音玉符急震（${newUrgent.kind}）`;
              interrupted = { kind: newUrgent.kind === '求救' ? 'sos' : 'war_call', title: `${newUrgent.from} · ${newUrgent.kind}`, desc: `${newUrgent.text.slice(0, 120)}${newUrgent.text.length > 120 ? '……' : ''}`, remainDays };
              medDone = true; break;
            }
          }
          if (now() - t0 >= budgetMs) break;
        }
        if (d >= cap) medDone = true;
        if (medDone) {
          if (enterCatchUp()) return finalize();
        }
        return snapshot();
      }
      // phase === 'catchup'
      const remBudget = Math.max(2, budgetMs - (now() - t0));
      const cu = this.npcs.stepCatchUp(remBudget);
      catchUpProg = cu.progress;
      if (cu.done) return finalize();
      return snapshot();
    };

    const cancelEarly = (): SeclusionProgress => {
      if (finalReport) return finalize();
      if (phase === 'meditate') {
        if (d < cap) reason = '提前出关';
        if (enterCatchUp()) return finalize();
      }
      if (phase === 'catchup') {
        this.npcs.stepCatchUp(1e9);
      }
      return finalize();
    };

    return { step, cancelEarly };
  }

  /** 闭关：days 天，或 0 表示直到瓶颈（最多 60 年）；支持途中遇到重大战事/变故中断并询问 */
  seclude(days: number, opts?: { ignoreInterrupts?: boolean }): SeclusionReport {
    const sess = this.startSeclude(days, opts);
    let st = sess.step(1e9);
    while (!st.done) st = sess.step(1e9);
    return st.report!;
  }

  breakthrough(pills: number, bonus?: number): { ok: boolean; msgs: Msg[] } {
    const major = C.bottleneck(this.hero, ACTIVE_WORLD) === 'major', from = this.hero.realm;
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
    const r = C.tryBreak(this.hero, pills, bonus ?? 0, ACTIVE_WORLD);
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
    if (major && from >= 5 && r.ok) {
      this.news(`${this.hero.name}历经劫数磨砺，终破桎梏晋入${REALMS[this.hero.realm]?.name}！`, 'rumor');
    }
    audio.sfx(r.ok ? 'break' : 'fail');
    if (r.ok) this.renderer?.burst(this.player.x, this.player.y - 60, '#fff2b0', 60);
    if (r.ok) (this.combat as any).vfx.push({ kind: 'aura', x: this.player.x, y: this.player.y, r: 130, t: 0, dur: 2.4, color: '255,240,180', fx: 'breakthrough' });
    this.updateUI(true);
    return r;
  }

  /** 人界 → 灵界双路线飞升（'orthodox' 古飞升台 / 'smuggle' 空间节点偷渡） */
  ascendSpirit(mode: 'orthodox' | 'smuggle'): boolean {
    const res = HP.performSpiritAscension(this.hero, this.ws, mode);
    this.flushMsgs(res.msgs);
    if (!res.ok) {
      if (!res.survived) {
        C.inflictDaoHurt(this.hero, 30, '空间乱流撕裂经脉');
        this.teleport(this.player.x + 200, this.player.y + 120);
        this.updateUI(true);
      }
      return false;
    }
    const loc = LOC_BY_ID.get(res.locId!) ?? LOCATIONS[0];
    this.news(`${this.hero.name}${mode === 'orthodox' ? '引动接引神柱，自古飞升台正统飞升中千灵界' : '撕裂空间节点，险险偷渡进入灵界蛮荒古境'}！`, 'personal');
    const ok = this.travel.go(res.map!, loc.x * WORLD_SCALE, loc.y * WORLD_SCALE, 0, 'portal');
    if (!ok) this.updateUI(true);
    return ok;
  }

  /** 灵界 → 仙界飞升 */
  ascendImmortal(): boolean {
    const res = HP.performImmortalAscension(this.hero, this.ws);
    this.flushMsgs(res.msgs);
    if (!res.ok) return false;
    const loc = LOC_BY_ID.get(res.locId!) ?? LOCATIONS[0];
    this.news(`${this.hero.name}渡过飞仙大劫，破开界壁飞升大千仙界！`, 'personal');
    const ok = this.travel.go(res.map!, loc.x * WORLD_SCALE, loc.y * WORLD_SCALE, 0, 'portal');
    if (!ok) this.updateUI(true);
    return ok;
  }

  /** 斩仙榜：召出榜单强敌于眼前实打实决战 */
  summonImmortalRank(id: string): boolean {
    const chk = HP.canSummonImmortalRank(this.hero, this.ws, id);
    if (!chk.ok || !chk.target) {
      this.toast(chk.msg, 'warn');
      return false;
    }
    if (this.combat.enemies.some((e) => !e.dead && e.immortalRankId === id)) {
      this.toast(`「${chk.target.name}」已在眼前虎视眈眈！`, 'warn');
      return false;
    }
    const t = chk.target;
    const def = ENEMIES['xian_sanxiu'] ?? ENEMIES[planeDefaultEnemyId('immortal', 'evil')];
    const e = new Enemy(def, this.player.x + 280, this.player.y + 40, t.reqRealm, 2);
    e.name = t.name;
    e.shortName = t.name;
    e.boss = true;
    e.aggro = true;
    e.hunt = true;
    e.immortalRankId = id;
    e.maxHp = e.hp = Math.round(e.maxHp * 2.1);
    e.atk *= 1.25;
    this.combat.enemies.push(e);
    this.toast(`杀机降临！斩仙榜恶仙「${t.name}」破空现身！`, 'warn');
    this.updateUI(true);
    return true;
  }

  /** 主动跨界（已飞升位面之间往返 / 逆返下界） */
  crossWorldTo(toWorld: WorldId): boolean {
    const gate = canCrossWorld(this.hero, ACTIVE_WORLD, toWorld, this.ws, this.day);
    if (!gate.ok) {
      this.toast(gate.reason ?? '此刻无法跨界。', 'warn');
      return false;
    }
    if (gate.direction === 'ascend') {
      if (toWorld === 'spirit') {
        if (!this.ws.ascendedWorlds?.includes('spirit')) return this.ascendSpirit('orthodox');
      } else if (toWorld === 'immortal') {
        if (!this.ws.ascendedWorlds?.includes('immortal')) return this.ascendImmortal();
      }
    }
    const h = this.hero;
    const prevHp = h.hp, prevMp = h.mp, prevLost = h.lifeLost;
    const fromSlice = this.ws.worlds?.[ACTIVE_WORLD];
    const prevCd = fromSlice?.returnCooldownUntil;
    if (gate.direction === 'descend' && gate.returnCost) {
      h.mp = Math.max(0, h.mp - gate.returnCost.mpRatio);
      h.lifeLost += gate.returnCost.lifeCost;
      const sl = (this.ws.worlds ??= {})[ACTIVE_WORLD] ?? (this.ws.worlds[ACTIVE_WORLD] = {});
      sl.returnCooldownUntil = this.day + gate.returnCost.cooldownDays;
    }
    const hubMap: Record<WorldId, { map: MapId; loc: string }> = {
      human: { map: 'renjie', loc: 'huangfeng' },
      spirit: { map: 'lingjie', loc: 'tianyuan_feishengtai' },
      immortal: { map: 'xianjie', loc: 'beihan_xilianchi' },
    };
    const dest = hubMap[toWorld];
    const loc = LOC_BY_ID.get(dest.loc);
    const lx = (loc?.x ?? 450) * WORLD_SCALE, ly = (loc?.y ?? 350) * WORLD_SCALE;
    const ok = this.travel.go(dest.map, lx, ly, 0, 'portal', () => {
      h.hp = prevHp; h.mp = prevMp; h.lifeLost = prevLost;
      if (fromSlice) fromSlice.returnCooldownUntil = prevCd;
    });
    if (!ok) this.updateUI(true);
    return ok;
  }

  /** 逆返下界天道排斥满 100 时触发强制弹回上界（延后至帧末切图，不死不删档） */
  forceReturnHigherPlane(): void {
    const target = HP.returnTargetWorldForHero(this.hero, this.ws, ACTIVE_WORLD);
    if (!target || this.pendingPlaneReturn) return;
    this.pendingPlaneReturn = target;
  }

  private executeReturnHigherPlane(target: WorldId): void {
    const hubMap: Record<WorldId, { map: MapId; loc: string }> = {
      human: { map: 'renjie', loc: 'huangfeng' },
      spirit: { map: 'lingjie', loc: 'tianyuan_feishengtai' },
      immortal: { map: 'xianjie', loc: 'beihan_xilianchi' },
    };
    const dest = hubMap[target];
    const loc = LOC_BY_ID.get(dest.loc);
    this.hero.mp = Math.max(0.05, this.hero.mp * 0.25);
    this.toast(`下界天道排斥已达极限，虚空裂隙强行合拢，将你弹回${worldDef(target).name}！`, 'warn');
    this.travel.go(dest.map, (loc?.x ?? 450) * WORLD_SCALE, (loc?.y ?? 350) * WORLD_SCALE, 0, 'portal');
  }
  /** 第四十五步：过场结束（界面回调） */
  ascendDone() { const k = this.pendingAscend; this.pendingAscend = null; if (k) this.ascendFx(k); }
  /** 突破后的天象余韵：在世界里继续的光柱、灵阵与金光 */
  private ascendFx(kind: AscendInfo['kind']) {
    const p = this.player, vfx = (this.combat as any).vfx as any[]; if (!vfx) return;
    const n = kind === 'jiedan' ? 3 : 6, col = kind === 'huashen' ? '255,200,240' : '255,236,170';
    for (let i = 0; i < n; i++) vfx.push({ kind: 'aura', x: p.x, y: p.y, r: 140 + i * 55, t: 0, dur: 2.4 + i * 0.7, color: col, fx: 'breakthrough' });
    for (let i = 0; i < n; i++) this.renderer?.burst(p.x + (Math.random() - 0.5) * 260, p.y - 60 - Math.random() * 160, i % 2 ? '#fff2b0' : '#e8c8ff', 40);
    this.toast(kind === 'jiedan' ? '金丹初成，丹田中一片温热。' : kind === 'jieying' ? '元婴初成——方圆百里的修士都看见了那道冲天霞光。' : '化神已成，天地元气为你所用。', 'good');
  }
  usePill(id: string, bagIdx?: number) {
    if (modx?.useItem(id)) { this.updateUI(true); return true; }   // v0.57：模组定义的用法（或模组拦下了）
    const msgs: Msg[] = [];
    const ok = C.usePill(this.hero, id, msgs, bagIdx, ACTIVE_WORLD);
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
    if (res.days) { C.temperDao(this.hero, res.ok ? 0.16 : 0.06); this.passDays(res.days); }
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
        if (!this.explored[i]) {
          if (!force) this.revealT.set(i, this.time);
          this.explored[i] = 1;
          this.exploredCount++;
        }
      }
    }
  }

  isExplored(wx: number, wy: number) {
    if (this.revealAll) return true;
    const x = Math.floor(wx / FOG_CELL), y = Math.floor(wy / FOG_CELL);
    if (x < 0 || y < 0 || x >= FOG_W || y >= FOG_H) return false;
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
      if (r && !first) {
        this.toast(r.parent === r.name ? r.name : `${r.parent} · ${r.name}`, 'region');
        if (ACTIVE_MAP === 'renjie' && r.id === 'wubian') {
          this.toast('已入无边海：灵气渐稀、高阶海兽出没，跨海往沧溟海须借梁国古传送阵。', 'warn');
        } else if (ACTIVE_MAP === 'renjie' && r.id === 'wubian_deep') {
          this.toast('已入无边海深海：暴风海眼与八九级妖兽横行，纵飞至天涯亦难肉身渡海！', 'warn');
        }
      }
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
    if (this.yuanying?.active) this.yuanying.back('force');
    if (this.story.onDown()) return;
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
        text: `现修《${cur.name}》：${cur.desc}\n\n欲转修《${gf.name}》：${gf.desc}\n\n${free ? '根基尚浅，改修并无损耗。' : '主修只能一门。改换根本功法须散功重修：本层已积的修为将损去三成。'}${gf.dao === 'mo' && cur.dao !== 'mo' ? '\n修炼魔功，正道必然侧目（声望 -8）。' : ''}${h.realm > gf.maxRealm ? `\n此功法只载到${REALMS[gf.maxRealm]?.name ?? '极境'}期，以你如今的境界修它，进境减半。` : ''}`,
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
  learnScroll(itemId: string, bagIdx?: number) {
    const d = itemDef(itemId), h = this.hero;
    if (d.scroll?.zhen) return this.zhenfa.learnScroll(itemId, d.scroll.zhen);
    const idx = bagIdx ?? h.bag.findIndex((b) => b.id === itemId);
    if (idx >= 0 && this.renxin.onTryLearnScroll(idx)) return false;
    if (d.scroll?.gongfa) return this.learnGongfa(itemId, d.scroll.gongfa);   // v0.60：心法玉简
    const ALIAS: Record<string, string> = { leidian: 'zhangxin', lianqi: 'lianxi', dash: 'yufeng' };
    const sid = d.scroll?.skill ? (ARTS[d.scroll.skill] ? d.scroll.skill : ALIAS[d.scroll.skill]) : undefined;
    const s = sid ? ARTS[sid] : undefined;
    if (!s) { this.toast('此卷所载功法，需入宗门后方可参修（第五步开放）。', 'warn'); return false; }
    if (h.arts.some((a) => a.id === s.id)) { this.toast(`你早已习得${s.name}。`, 'warn'); return false; }
    if (h.realm < s.realm) { this.toast(`${s.name}需${REALMS[s.realm]?.name ?? '高阶'}期方可参悟。`, 'warn'); return false; }
    C.removeItem(h, itemId, 1);
    h.arts.push({ id: s.id, xp: 0 });
    const slot = h.hotbar.findIndex((x) => !x);
    if (slot >= 0) h.hotbar[slot] = s.id;
    this.toast(`参悟${s.name}，已然入门！${slot >= 0 ? `（已放入快捷栏 ${slot + 1}）` : '（按 K 打开法术书放入快捷栏）'}`, 'good');
    audio.sfx('chime');
    this.updateUI(true);
    return true;
  }

  /** 跨系统奖励入袋兜底：先尝试整批原子入袋，入不进去的自动作为受保护地面掉落留在脚边 */
  grantOrDrop(items: readonly C.InventoryOutput[], label?: string): { allAdded: boolean; dropped: number } {
    const clean = items.filter((it) => it && it.id && it.n > 0);
    if (!clean.length) return { allAdded: true, dropped: 0 };
    if (C.exchangeItemsWithCommit(this.hero, [], clean)) return { allAdded: true, dropped: 0 };
    let dropped = 0;
    const list = this.combat?.loot;
    const px = this.player?.x ?? 0, py = this.player?.y ?? 0;
    for (const it of clean) {
      if (!C.addItem(this.hero, it.id, it.n, it.age)) {
        if (list) list.push({ x: px, y: py, id: it.id, n: it.n, t: 0, blocked: true });
        dropped++;
      }
    }
    if (dropped > 0 && list) {
      this.toast(`${label ? label + '：' : ''}储物袋已满，${dropped} 件所得已落在脚边。`, 'warn');
    }
    return { allAdded: dropped === 0, dropped };
  }

  /** 探索洞府遗迹：首次抵达时得宝，并惊动守护 */
  private exploreCheck(loc: LocDef | null) {
    if (!loc || loc.type !== 'secret' || !loc.minor) return;
    const h = this.hero;
    if (h.looted.includes(loc.id)) return;
    h.looted.push(loc.id);
    const dz = loc.danger ?? 1;
    const plan: C.InventoryOutput[] = [];
    const got: string[] = [];
    const ls = Math.round((20 + Math.random() * 60) * (1 + dz) * (1 + dz * 0.5));
    plan.push({ id: 'mat_lingshi', n: ls }); got.push(`灵石 ${ls}`);
    const sc = this.combat.randomScroll(Math.min(4, Math.floor(dz / 1.2) + 1));
    if (sc) { plan.push({ id: sc, n: 1 }); got.push(itemDef(sc).name); }
    if (Math.random() < 0.35 + dz * 0.1) { const pills = ['pill_juqi', 'pill_huiqi', 'pill_liaoshang']; const pid = pills[Math.floor(Math.random() * pills.length)]; plan.push({ id: pid, n: 1 + Math.floor(Math.random() * 2) }); got.push(itemDef(pid).name); }
    if (Math.random() < 0.12 * dz) { const arts = ['art_qingfeng', 'art_jinguangzhuan', 'art_yinhui', 'art_xuantie', 'art_wulong', 'art_tayun', 'art_guike', 'art_qingning', 'art_hongxian']; const aid = arts[Math.floor(Math.random() * Math.min(arts.length, 2 + dz * 1.5))]; plan.push({ id: aid, n: 1 }); got.push(itemDef(aid).name); }
    this.grantOrDrop(plan, loc.name);
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
      if (Math.abs(dx) > 4000 || Math.abs(dy) > 4000) continue;
      const d = Math.hypot(dx, dy);
      const r = z ? Math.max(z.rx, z.ry) * 1.25 + 200 : (l.type === 'city' || l.type === 'sect' ? 620 : 520);
      if (d < r && d < bd) { bd = d; best = l; }
    }
    return best;
  }

  timeName() {
    const ph = this.dayPhase;
    const names = ['子时', '丑时', '寅时', '卯时', '辰时', '巳时', '午时', '未时', '申时', '酉时', '戌时', '亥时'];
    // ph=0 子夜（子时），0.25 卯时，0.5 正午（午时），0.75 酉时
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
    const r = regionAt(mx, my, this.terrain.isLand(p.x, p.y));
    const pl = this.placeBonus();
    const gt = this.gatherTarget;
    this.ui = {
      date: { year, month, season },
      region: r ? r.name : '荒野', regionParent: r ? r.parent : '',
      nearby: this.nearbyLocation(),
      realmText: realmName(h.realm, h.stage), sense: this.sense, senseRadius: Math.round(this.awarenessRadius),
      flying: this.isFlying, canFlyNative: this.canFlyNative, run: this.input.run || this.input.joyMag > JOY_RUN_MAG,
      zoom: this.cam.targetZoom, px: p.x, py: p.y,
      explored: this.exploredCount / this.explored.length,
      hp: h.hp, mp: h.mp, exp: h.exp, need: C.need(h), bottleneck: C.bottleneck(h, ACTIVE_WORLD),
      sitting: p.sitting, concealed: this.concealed, age: h.age, maxLife: C.maxLife(h), expRate: C.expPerDay(h, pl.mult, ACTIVE_WORLD), place: pl.name,
      gather: gt ? { name: itemDef(gt.item).name, kind: gt.kind } : null, gatherP: this.gathering ? this.gathering.t / GATHER_TIME : -1,
      weather: WEATHER_NAME[this.weather.kind], timeName: this.timeName(), night: this.night,
      bottle: h.bottle.drops, pendingTalent: !!h.pendingTalent, dead: h.dead, rootName: C.rootDef(h).name,
      talk: this.story?.focus ? (this.story.focus.look ? `与${this.story.focus.name}交谈` : '查看') : this.npcs?.focus ? `与${this.npcs.focus.d.met ? this.npcs.focus.d.name : '此人'}交谈` : this.events?.focus ? '查看' : this.space?.doorFocus && !this.isFlying && this.towns.canEnter(this.space.doorFocus.loc) ? (this.space.doorFocus.door.fn === 'teleport' ? '踏上传送阵' : this.space.doorFocus.door.fn === 'board' ? `看${this.space.doorFocus.door.name}` : `进入${this.space.doorFocus.door.name}`) : null,
      daoHurt: C.hasDaoHurt(h) ? { days: Math.ceil(h.daoHurt!.days), why: h.daoHurt!.why } : null,
    };
    this.listeners.forEach((f) => f());
  }

  private afterFrameListeners = new Set<(now: number) => void>();
  subscribe(f: () => void) { this.listeners.add(f); return () => { this.listeners.delete(f); }; }
  subscribeToasts(f: () => void) { this.toastListeners.add(f); return () => { this.toastListeners.delete(f); }; }
  onAfterFrame(f: (now: number) => void) { this.afterFrameListeners.add(f); return () => { this.afterFrameListeners.delete(f); }; }

  private toastId = 0;
  /** 未读消息数：没弹出来、也没点开看过的 */
  get toastUnread() {
    let n = 0;
    for (const e of this.toastLog) if (!e.shown && !e.read && !this.toastQueue.some((q) => q.id === e.id) && !this.toastDeferred.some((q) => q.id === e.id)) n++;
    return n;
  }
  /** 点开「讯」时把所有记录标为已看 */
  readToastLog() {
    let changed = false;
    for (const e of this.toastLog) if (!e.read) { e.read = true; changed = true; }
    if (changed) this.bumpToasts();
  }
  bumpToasts() { this.toasts = [...this.toasts]; this.toastListeners.forEach((f) => f()); }
  private logToast(t: Toast) {
    this.toastLog.push({ id: t.id, text: t.text, kind: t.kind ?? 'info', lv: t.lv ?? 'high', day: this.day, shown: false, read: false });
    if (this.toastLog.length > 40) this.toastLog.splice(0, this.toastLog.length - 40);
  }
  private markShown(t: Toast) { const e = this.toastLog.find((x) => x.id === t.id); if (e) e.shown = true; }
  /** 是否正在打斗（打斗中"闲讯"暂缓，打完再补） */
  toastFighting() {
    const c = this.combat; if (!c) return false;
    const lock = (c as unknown as { lock?: { dead?: boolean } | null }).lock;
    if (lock && !lock.dead) return true;
    if (((c as unknown as { combatT?: number }).combatT ?? 0) < 4) return true;
    return !!((c as unknown as { brawl?: { stance?: unknown } | null }).brawl?.stance);
  }
  private enqueueToast(t: Toast) {
    if (this.toasts.filter((x) => x.kind !== 'region').length >= this.toastMax) {
      if (t.lv === 'urgent') this.toastQueue.unshift(t); else this.toastQueue.push(t);
      const cap = TOUCH ? 2 : 12;
      while (this.toastQueue.length > cap) {
        const i = this.toastQueue.findIndex((x) => x.lv !== 'urgent');
        this.toastQueue.splice(i >= 0 ? i : this.toastQueue.length - 1, 1);
      }
      this.bumpToasts();
      return;
    }
    this.showToast(t);
  }
  /** 打斗结束后把暂缓的消息补弹出来 */
  toastTick() {
    if (this.toastFighting()) return;
    const pend = this.toastDeferred; this.toastDeferred = [];
    const mode = readToastMode();
    for (const s of pend) {
      if (this.time - (s.at ?? 0) <= 20 && toastBudget(mode, s.lv ?? 'low', false) === 'show') this.enqueueToast(s);
    }
    this.bumpToasts();
  }
  private showToast(t: Toast) {
    this.toasts = t.kind === 'region'
      ? [...this.toasts.filter((x) => x.kind !== 'region'), t]
      : [...this.toasts, t];
    if (t.kind !== 'region') this.markShown(t);
    this.toastListeners.forEach((f) => f());
    const ms = t.kind === 'region' ? 3200 : toastMs(t.lv ?? 'high', TOUCH, this.toastQueue.length > 0);
    setTimeout(() => {
      this.toasts = this.toasts.filter((x) => x.id !== t.id);
      let next: Toast | undefined;
      while (!next && this.toastQueue.length && this.toasts.filter((x) => x.kind !== 'region').length < this.toastMax) {
        const s = this.toastQueue.shift()!;
        if (s.lv === 'low' && this.toastFighting()) { s.at = this.time; this.toastDeferred.push(s); } else next = s;
      }
      if (next) this.showToast(next); else this.toastListeners.forEach((f) => f());
    }, ms);
  }
  /**
   * 消息提示：按「设置 → 消息提示」的档位决定弹出、只记进「讯」、还是打斗中暂缓。
   * 所有消息（除 region 横幅）都会进 toastLog，点左上「讯」可回看。
   */
  toast(text: string, kind: Toast['kind'] = 'info', opt?: { lv?: ToastLevel }) {
    if (this.toasts.some((r) => r.text === text) || this.toastQueue.some((r) => r.text === text) || this.toastDeferred.some((r) => r.text === text)) return;
    const lv: ToastLevel = kind === 'region' ? 'high' : (opt?.lv ?? toastLevelOf(text, kind));
    const t: Toast = { id: ++this.toastId, text, kind, lv };
    if (kind === 'region') { this.showToast(t); return; }
    this.logToast(t);
    const act = toastBudget(readToastMode(), lv, this.toastFighting());
    if (act === 'log') { this.bumpToasts(); return; }
    if (act === 'defer') {
      t.at = this.time; this.toastDeferred.push(t);
      if (this.toastDeferred.length > 6) this.toastDeferred.shift();
      this.bumpToasts();
      return;
    }
    this.enqueueToast(t);
  }

  // ---------- 操作 ----------
  /** 缩放绝对安全边界；实际最远值由 minZoom 按完整神识圈和画布尺寸动态收紧。 */
  static readonly ZOOM_MIN = 0.02;
  static readonly ZOOM_MAX = 2.5;
  setZoom(z: number) { this.cam.targetZoom = clamp(z, this.minZoom, Game.ZOOM_MAX); this.updateUI(); }
  zoomBy(f: number) { this.setZoom(this.cam.targetZoom * f); }
  /** 第三十五步：禁空（追兵的禁空令）剩余秒数 */
  noFlyT = 0;
  toggleFly() {
    if (this.yuanying?.active) { this.toast('元婴本就凌空，无须御器。', 'info'); return; }
    if (!this.player.flying && !this.canFly) {
      this.toast('炼气期尚未筑基，无法御剑凌空；须祭出神风舟等飞行法器方可御风而行。', 'warn');
      return;
    }
    if (!this.player.flying && this.noFlyT > 0) { this.toast(`禁空之力未散，遁光提不起来！（${Math.ceil(this.noFlyT)} 息）`, 'warn'); return; }
    this.stand(); this.gathering = null;
    this.player.flying = !this.player.flying;
    if (!this.player.flying && this.terrain.walkFactor(this.player.x, this.player.y) <= 0) {
      this.player.flying = true;
      this.toast('身下是大海，不能在此落下。', 'warn');
      return;
    }
    const fid = effectiveFlightMount(this.hero), fname = fid ? itemDef(fid).name : '';
    this.toast(this.player.flying ? (fid === 'art_fenglei' ? '云雷双翼一展，雷光缭绕，化作一道雷遁。（F 落地）' : fid ? `祭出${fname}，乘风而起。（F 落地）` : '凌空而起，御风飞行。（F 落地）') : '按下遁光，落地步行。');
    audio.sfx(this.player.flying ? 'whoosh' : 'land');
    this.updateUI();
  }
  setDestination(wx: number, wy: number, name?: string, followNpcId?: string) {
    this.destination = { x: clamp(wx, 200, WORLD_W - 200), y: clamp(wy, 200, WORLD_H - 200), name, followNpcId };
  }
  /** 一键直接导航：同步在图上持久指路「指」，并自动御剑赶路（无法御剑则自动寻路步行） */
  navigateTo(wx: number, wy: number, name = '目的地', followNpcId?: string): boolean {
    if (this.hero.dead) return false;
    const tx = clamp(wx, 200, WORLD_W - 200), ty = clamp(wy, 200, WORLD_H - 200);
    this.guide = { x: tx, y: ty, name, map: ACTIVE_MAP, followNpcId };
    if (this.canFly && this.noFlyT <= 0) {
      return this.startAutoFlight(tx, ty, name, followNpcId);
    }
    this.stand(); this.gathering = null;
    this.stopAutoFlight();
    this.setDestination(tx, ty, name, followNpcId);
    const p = this.player;
    const d = Math.max(1, Math.round(Math.hypot(tx - p.x, ty - p.y) / 30));
    this.toast(`开始导航：${name}（${dirName(tx - p.x, ty - p.y)}方约 ${d} 丈，地图已标「指」）`, 'good');
    this.updateUI();
    return true;
  }
  /** v0.73：长途托管御剑赶路（自动起飞、高速巡航、低蓝 / 拦截停驻） */
  startAutoFlight(wx: number, wy: number, name = '目的地', followNpcId?: string): boolean {
    if (this.hero.dead) return false;
    if (this.noFlyT > 0) { this.toast(`禁空之力未散，无法御剑赶路！（${Math.ceil(this.noFlyT)} 息）`, 'warn'); return false; }
    if (!this.canFly) {
      this.toast('炼气期尚未筑基，亦未祭出飞行法器，已改用寻路步行前往。', 'info');
      this.setDestination(wx, wy, name, followNpcId);
      return false;
    }
    this.stand(); this.gathering = null;
    this.player.flying = true;
    const tx = clamp(wx, 200, WORLD_W - 200), ty = clamp(wy, 200, WORLD_H - 200);
    this.autoFlight = { x: tx, y: ty, name, followNpcId };
    this.destination = { x: tx, y: ty, name, followNpcId };
    audio.sfx('whoosh');
    const fid = !this.canFlyNative ? (this.hero.equip?.flight ?? effectiveFlightMount(this.hero)) : undefined;
    this.toast(fid ? `乘${itemDef(fid).name}托管御风前往：${name}（低灵力或手动接管将停驻）` : `开始托管御剑前往：${name}（低灵力或手动接管将停驻）`, 'good');
    this.updateUI();
    return true;
  }
  stopAutoFlight(reason?: string) {
    if (!this.autoFlight) return;
    this.autoFlight = null;
    if (reason) {
      this.destination = null;
      this.toast(reason, 'warn');
    }
    this.updateUI();
  }
  teleport(wx: number, wy: number) {
    if (this.mijing?.active && !(wx >= WORLD_W)) this.mijing.leave('force');
    if (this.yuanying?.active) this.yuanying.back('force');
    this.player.x = wx; this.player.y = wy; this.player.st.x = wx; this.player.st.y = wy; this.cam.x = wx; this.cam.y = this.camAnchorY(); this.camCenterReady = false; this.destination = null;
    this.revealAround(true);
    this.renderer?.resetStill();
    this.updateUI();
  }
  setWeather(k: WeatherKind | null) { this.weather.forced = k; this.weather.timer = 0; }
  /** 设置项：自动运镜（飞行拉远 / 战斗取景 / 大招运镜）。关掉后镜头完全按玩家自己的缩放，不再自己动。 */
  setAutoCam(v: boolean) {
    this.autoCam = v;
    try { localStorage.setItem('fanren.autoCam', v ? '1' : '0'); } catch { /* 无存储权限就只在本次生效 */ }
    if (!v) { this.camFrameZ = 1; this.camLeanX = 0; this.camLeanY = 0; this.cine.t = this.cine.dur; this.cine.k = 0; }
  }

  screenToWorld(sx: number, sy: number) {
    const r = this.canvas.getBoundingClientRect();
    const z = this.cam.zoom;
    return { x: this.cam.x + (sx - r.left - r.width / 2) / z, y: this.cam.y + (sy - r.top - r.height / 2) / z };
  }

  private unbind?: () => void;
  private bindInput() {
    // 方向键 / Shift 的备用映射（键位表里没被占用时生效，保持旧版手感）
    const ALIAS: Record<string, string> = { arrowup: 'w', arrowdown: 's', arrowleft: 'a', arrowright: 'd', shift: 'shift' };
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
        else if (act === 'hearts') this.openModal({ kind: 'relations', tab: 'party' });
        else if (act === 'chronicle' || act === 'relations' || act === 'help') this.openModal({ kind: act } as any);
        else if (act === 'war') this.openDialog(this.war.inboxNode());
        else this.onPanel?.(act as any);
        return;
      }
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
      if (!act && !e.repeat && modx?.key(k)) return;   // v0.56：模组的快捷键（只用游戏没占的键）
      switch (act) {
        case 'fly': this.toggleFly(); break;
        case 'sit': this.toggleSit(); break;
        case 'recall': this.home.recall(); break;
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
        case 'hearts': this.openModal({ kind: 'relations', tab: 'party' }); break;
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
      if (act) { const c = canonicalOf(act); if (c) this.input.keys.delete(c); if (act === 'run' && this.time - this.runDown > 0.35 && this.input.run) { this.input.run = false; this.updateUI(true); } }
      else if (ALIAS[k]) this.input.keys.delete(ALIAS[k]);
    };
    const wheel = (e: WheelEvent) => { e.preventDefault(); this.zoomBy(e.deltaY > 0 ? 1 / 1.12 : 1.12); };
    // 指针：点击移动 / 双指缩放
    const pointers = new Map<number, { x: number; y: number; sx: number; sy: number }>();
    let pinchStart = 0, pinchZoom = 1, moved = false;
    let lastEnemyTap: { x: number; y: number; time: number; pointerType: string } | null = null;
    const pickEnemy = (e: PointerEvent, w: { x: number; y: number }, allowCycle = true) => {
      const prev = lastEnemyTap, elapsed = prev ? e.timeStamp - prev.time : Infinity;
      const cycle = allowCycle && this.cam.zoom < 0.38 && !!prev && prev.pointerType === e.pointerType && elapsed >= 0 && elapsed < 1200 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) <= 12;
      const p = this.player;
      const found = enemyAtPointer(this.combat.enemies, w.x, w.y, this.cam.zoom, p.x, p.y, this.detailSenseRadius, this.senseBurstT > 0, this.combat.lock, cycle);
      lastEnemyTap = found && allowCycle ? { x: e.clientX, y: e.clientY, time: e.timeStamp, pointerType: e.pointerType } : null;
      return found;
    };
    const pd = (e: PointerEvent) => {
      this.canvas.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
      // 多指手势结束后，最后松开的手指也不能被当作单击。
      if (pointers.size === 1) moved = false;
      else moved = true;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = Math.hypot(a.x - b.x, a.y - b.y); pinchZoom = this.cam.targetZoom;
      }
    };
    const pm = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') { const w = this.screenToWorld(e.clientX, e.clientY); const m = this.input.mouse; if (Math.hypot(w.x - m.x, w.y - m.y) > 3) { m.x = w.x; m.y = w.y; m.t = this.time; m.active = true; } }
      const pt = pointers.get(e.pointerId);
      if (!pt) return;
      pt.x = e.clientX; pt.y = e.clientY;
      if (Math.hypot(pt.x - pt.sx, pt.y - pt.sy) > 10) moved = true;
      if (pointers.size === 2 && pinchStart > 0) {
        const [a, b] = [...pointers.values()];
        this.setZoom(pinchZoom * Math.hypot(a.x - b.x, a.y - b.y) / pinchStart);
      }
    };
    const pu = (e: PointerEvent) => {
      const pt = pointers.get(e.pointerId);
      const wasPinch = pointers.size >= 2;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStart = 0;
      const mact = actionOfKey('mouse' + e.button);
      if (this.inCave || this.modal || this.paused) return;
      if (pt && !moved && !wasPinch && mact === 'dodge' && !this.hero.dead) { this.combat.dodge(); return; }
      // v0.52.5：鼠标左右键绑技能栏（默认 6 / 7）。左键：神识内有敌（或已在战斗中）就施放，否则仍是点地前往；右键：直接施放
      if (pt && !moved && !wasPinch && e.pointerType === 'mouse' && mact && mact.startsWith('slot') && !this.hero.dead) {
        const w0 = this.screenToWorld(e.clientX, e.clientY);
        const P0 = this.player;
        const clicked = this.combat.enemies.length ? pickEnemy(e, w0, false) : null;
        const clickedShip = this.sectwar?.pickAirshipAt(w0.x, w0.y) ?? null;
        const clickedForm = this.sectwar?.pickFormationAt(w0.x, w0.y) ?? null;
        const formTakesPriority = !!clickedForm && (!clicked || (clicked as any).warForm === clickedForm || ((clickedForm.shield ?? 0) > 0 && this.sectwar?.isPointInFormation?.(clickedForm, clicked.x, clicked.y, 24)));
        const foeNear = !!clicked || !!clickedShip || !!clickedForm || this.combat.inCombat || this.combat.enemies.some((q) => !q.dead && q.aggro && Math.hypot(q.x - P0.x, q.y - P0.y) < this.detailSenseRadius) || !!this.sectwar?.nearestFoeFormation(P0.x, P0.y, this.detailSenseRadius) || !!this.sectwar?.nearestFoeAirship(P0.x, P0.y, this.detailSenseRadius + 160);
        if (e.button !== 0 || foeNear) {
          if (clickedShip) { this.combat.lockAirship = clickedShip; this.combat.lockForm = null; this.combat.lock = null; this.combat.manual = true; }
          else if (formTakesPriority) { this.combat.lockForm = clickedForm; this.combat.lock = null; this.combat.lockAirship = null; this.combat.manual = true; }
          else if (clicked) { this.combat.lock = clicked; this.combat.lockForm = null; this.combat.lockAirship = null; this.combat.manual = true; }
          this.combat.castSlot(+mact.slice(4) - 1); this.input.mouse.t = -99; audio.unlock();
          return;
        }
      }
      if (pt && !moved && !wasPinch && e.button === 0 && !this.hero.dead) {
        const w = this.screenToWorld(e.clientX, e.clientY);
        // 点击敌人、敌方飞舟或敌方百人战阵：命中飞舟或方阵时优先锁定主体
        const foe = this.combat.enemies.length ? pickEnemy(e, w) : null;
        const foeShip = this.sectwar?.pickAirshipAt(w.x, w.y) ?? null;
        if (foeShip) {
          this.combat.lockAirship = foeShip; this.combat.lockForm = null; this.combat.lock = null; this.combat.manual = true; this.input.mouse.t = -99; return;
        }
        const foeForm = this.sectwar?.pickFormationAt(w.x, w.y) ?? null;
        if (foeForm && (!foe || (foe as any).warForm === foeForm || ((foeForm.shield ?? 0) > 0 && this.sectwar?.isPointInFormation?.(foeForm, foe.x, foe.y, 24)))) {
          this.combat.lockForm = foeForm; this.combat.lock = null; this.combat.lockAirship = null; this.combat.manual = true; this.input.mouse.t = -99; return;
        }
        if (foe) { this.combat.lock = foe; this.combat.lockForm = null; this.combat.lockAirship = null; this.combat.manual = true; this.input.mouse.t = -99; return; }
        // 点击某人：走近了直接开口，远则一路跟过去（手机没键盘，这是最自然的交谈方式）
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
        // 圈外盲点不能通过 nearest 生成潜在灵物；边缘保留命中半径。
        const n = Math.hypot(w.x - this.player.x, w.y - this.player.y) <= this.detailSenseRadius + 60
          ? this.nodes.nearest(w.x, w.y, 60, this.day) : null;
        if (n && Math.hypot(n.x - this.player.x, n.y - this.player.y) < this.detailSenseRadius) {
          if (Math.hypot(n.x - this.player.x, n.y - this.player.y) < GATHER_RANGE) this.tryGather();
          else { this.setDestination(n.x, n.y + 30); this.pendingGather = n; }
        } else { this.setDestination(w.x, w.y); this.pendingGather = null; this.pendingTalk = null; }
        audio.unlock();
      }
    };
    // 取消或丢失捕获不是 pointerup：不能触发移动、闪避或技能。
    const cancelPointer = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId); moved = true;
      if (pointers.size < 2) pinchStart = 0;
    };
    const blur = () => {
      if (this.input.keys.has('shift') && this.time - this.runDown > 0.35 && this.input.run) {
        this.input.run = false; this.updateUI(true);
      }
      this.input.keys.clear(); pointers.clear(); pinchStart = 0; moved = true;
      this.input.mouse.active = false;
      this.input.joy.x = 0; this.input.joy.y = 0; this.input.joyMag = 0;
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);
    this.canvas.addEventListener('wheel', wheel, { passive: false });
    this.canvas.addEventListener('pointerdown', pd);
    this.canvas.addEventListener('pointermove', pm);
    this.canvas.addEventListener('pointerup', pu);
    this.canvas.addEventListener('pointercancel', cancelPointer);
    this.canvas.addEventListener('lostpointercapture', cancelPointer);
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
      this.canvas.removeEventListener('pointercancel', cancelPointer);
      this.canvas.removeEventListener('lostpointercapture', cancelPointer);
      this.canvas.removeEventListener('pointerleave', pl);
      this.canvas.removeEventListener('contextmenu', cm);
      blur();
    };
  }
  pendingGather: GatherNode | null = null;
  /** v0.52.4 手机：点击某人后跟着走，到跟前自动交谈 */
  pendingTalk: string | null = null;
}


export async function createGame(onProgress: (p: number, msg: string) => void) {
  onProgress(0.1, '研墨铺纸…');
  await new Promise((r) => setTimeout(r, 30));
  onProgress(0.3, `勾勒${MAP_NAME[ACTIVE_MAP]}山川…`);
  await new Promise((r) => setTimeout(r, 30));
  const terrain = new Terrain();
  await terrain.buildAsync((f) => onProgress(0.3 + f * 0.52, `勾勒${MAP_NAME[ACTIVE_MAP]}山川…`), true);
  onProgress(0.84, '演化众生百态…');
  await new Promise((r) => setTimeout(r, 0));
  const g = new Game(terrain);
  onProgress(0.87, '点染江河湖海…');
  g.overview = await terrain.buildOverviewAsync(1, (f) => onProgress(0.87 + f * 0.12, '点染江河湖海…'));
  onProgress(1, '画卷已成');
  return g;
}
