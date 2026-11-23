// 绝域：把「越深入越凶险」的地带做成一套可以搬到别处的规则。无边海是第一份配置（world/jueyuProfile.ts）。
//
// 用户要的（2026-11-15）：无边海有飓风、鬼雾、偶发的空间裂缝；少数海妖兽可达元婴；
// 元婴备足丹药也难飞到头，化神优先走传送阵；不设空气墙——越深灵力流失越快、飞行被压得越低，
// 图外的深处由飓风把人硬吹回来。做好后按界的样貌铺到别的世界（流沙、冰海、熔岩海……）。
//
// 怎么接在游戏里（game.ts 的调用点）：
//   每帧 tick（移动积分之后）：分带、提示、天象、风推人推怪推弹道、力竭落水、泅水、海况；
//   manaTick（光阴结算之后）：回复按带打折、按境界流失；
//   bounds：海这一侧放开到外圈海的边上（留足余量，不出地形有块的范围），陆路交界照旧；
//   ceiling：飞行高度上限随深入压低；speedMul / swimming / sink：泅水的移动、立板沉到水线。
// 天象一律按「大陆坐标」（南荒的坐标）和游戏时间取种子：飞过中线换图，看到的还是同一场飓风、同一道裂缝。
// 这里用的随机数全是自己的哈希序列，不碰 Math.random（固定种子的测试和日结算不受影响）；只有画特效时粒子系统自己会取。
import type { Game } from './game';
import { mod as statMod } from './cultivation';
import { ACTIVE_MAP, mapFrame, MAP_SEAMS, mapShoreData, mapSize, WORLD_SCALE, type MapId, type P as Pt } from '../data/world';
import { hashU } from '../core/rng';
import { shoreField, realmField, type ShoreField } from './jueyuField';
import { WUBIAN, curveAt, type ZoneProfile, type ZoneBand } from './jueyuProfile';
import { KIND_MEDIUM, realmProfile, LOCAL_ZONES, type LocalZone } from './jueyuLooks';   // 收官 B4：别界与本界的小险地
import { realmOfMap } from '../data/zhujie';
import { audio } from './audio';
import { C } from '../gl/atlas';
import type { FxSys, RGB } from '../gl/fx';
import type { SeaPost } from '../gl/seaGlsl';
import type { Enemy } from './combat';
import { Lingzhou } from './lingzhou';   // 收官 B3：灵舟
import { Haiyuan } from './haiyuan';     // 收官 B3：万丈海渊
import { SeaQiyu } from './seaqiyu';     // 收官 B3：幽灵古船、潮汐祭坛
import { BOATS } from '../data/seabeasts';
import { returnCarried } from './seamCarry';

/** 人物可以到的范围（世界单位） */
export interface Reach { x0: number; x1: number; y0: number; y1: number }

/** 给后期着色器的海况：都已经是渐变过的量 */
export interface SeaState {
  /** 深入程度 0（岸边）–1（核心）；离岸距离按核心的起点归一 */
  deep: number;
  /** 绝域 0–1（外圈海里罡风的强度） */
  abyss: number;
  /** 浪高 0–1 */
  swell: number;
  /** 风向（弧度）与风力 0–1 */
  windDir: number; wind: number;
  /** 视野收拢 0（不收）–1（只剩身边一小圈） */
  shroud: number;
  /** 海色墨化 0–1、暗紫裂隙光 0–1 */
  dark: number; rift: number;
}

/** 罗盘、人物牌上的警示要的东西（界面每帧读，见 ui/Compass.tsx） */
export interface JueyuHud {
  show: boolean;
  /** 最近的岸在哪个方向（世界方向的弧度，0 = 正东，顺时针）与多远 */
  shoreDir: number; shoreDist: number;
  /** 罗盘乱转的程度 0–1；小地图是否锁死 */
  spin: number; lock: boolean;
  /** 每息流失多少法力（占上限的百分比），回复打几折 */
  drainPct: number; regenK: number;
  swimming: boolean; canTakeoff: boolean; takeoffAt: number;
  band: string; zone: string; gale: number;
}

interface Storm { id: number; x0: number; y0: number; vx: number; vy: number; t0: number; life: number; R: number; eye: number; vmax: number; spin: number; x: number; y: number; k: number }
interface Phantom { id: number; kind: 0 | 1 | 2; ox: number; oy: number; s: number }
interface GhostFog { id: number; x0: number; y0: number; vx: number; vy: number; t0: number; life: number; rx: number; ry: number; ang: number; x: number; y: number; k: number; ph: Phantom[] }
interface Rift { id: number; x: number; y: number; ang: number; len: number; t0: number; frac: number; tide: boolean }
interface Strike { id: number; x: number; y: number; t0: number; frac: number }

/** 裂缝：先亮（预警）、再撕开（碰到就伤）、再合拢 */
const RIFT_WARN = 1.2, RIFT_OPEN = 0.9, RIFT_CLOSE = 0.6;
/** 落雷：预警圈亮多久、打多大 */
const STRIKE_WARN = 1.1, STRIKE_R = 170;
/** 飓风：按大陆坐标分格、按游戏时间分段；每格每段最多生一场 */
const STORM_CELL = 36000, STORM_EPOCH = 300;
const FOG_CELL = 32000, FOG_EPOCH = 420;
const RIFT_CELL = 2200, RIFT_SLOT = 1.6, TIDE_CELL = 7000;
/** 风推人：飓风的风速乘这个数才是推人的速度（绝域的罡风全额推） */
const STORM_PUSH = 0.6;
/** 外圈海：离图边最多放开到这么远（地形在图外铺了六万宽的海，留三千余量，别走出有地块的范围） */
const OUTER_OPEN = 57000;

/** 收官 B4：落进去以后隔一阵推人一把的那一下叫什么 */
const WAVE_WORD: Record<string, string> = { sea: '浪头打来', sand: '沙涌', ice: '浮冰撞来', lava: '岩浪翻涌', ming: '暗流一卷', miasma: '泥浪一涌' };
const smooth01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const sstep = (a: number, b: number, x: number) => smooth01((x - a) / (b - a));
/** 自己的随机序列：按整数坐标与种子取 0–1 */
const H = (a: number, b: number, s: number) => hashU(a | 0, b | 0, s | 0);

/** 哪张图用哪份险地配置：人界三张图是无边海；别界按样貌和界的种子现配一份（收官 B4，见 jueyuLooks.ts） */
const realmProfiles = new Map<string, ZoneProfile>();
const isRealmMap = (map: MapId) => typeof map === 'string' && map.startsWith('realm-');
function profileOf(map: MapId): ZoneProfile | null {
  if (MAP_SEAMS[map]) return WUBIAN;
  if (!isRealmMap(map)) return null;
  let P = realmProfiles.get(map);
  if (!P) {
    const R = realmOfMap(map), kind = KIND_MEDIUM[R.kind];
    if (!kind) return null;
    const ZN: Record<string, string> = { sea: '外海', sand: '沙海', ice: '冰海', lava: '熔岩海', ming: '冥河', miasma: '瘴海' };
    P = realmProfile(kind, R.seed, ringOf(map), R.name + ZN[kind]);
    realmProfiles.set(map, P);
  }
  return P;
}
/** 收官 B4：别界的图，大陆到图边那一圈最窄处有多宽（世界单位）——分带按它摆。满是岛的沧海界按岛群外沿到图边算 */
export function ringOf(map: MapId): number {
  const D = mapShoreData(map), S = WORLD_SCALE;
  if (D.mainland.length < 3) { const F = D.islandField; return F ? Math.min(F.x0, D.W - F.x1, F.y0, D.H - F.y1) * S + 6000 : 30000; }
  const segD = (px: number, py: number) => {
    let best = Infinity; const L: Pt[] = D.mainland;
    for (let i = 0, k = L.length - 1; i < L.length; k = i++) {
      const a = L[k], b = L[i], ex = b[0] - a[0], ey = b[1] - a[1], t = Math.max(0, Math.min(1, ((px - a[0]) * ex + (py - a[1]) * ey) / (ex * ex + ey * ey || 1)));
      best = Math.min(best, Math.hypot(px - a[0] - ex * t, py - a[1] - ey * t));
    }
    return best;
  };
  // 沿四条图边取 24 个点，取离岸距离的下四分位：大陆有的地方几乎顶到图边（那一侧只有近海和断层），按最窄处摆会把整圈的分带压得太扁
  const ds: number[] = [];
  for (let i = 0; i < 6; i++) { const u = (i + 0.5) / 6; ds.push(segD(D.W * u, 0), segD(D.W * u, D.H), segD(0, D.H * u), segD(D.W, D.H * u)); }
  ds.sort((a, b) => a - b);
  return Math.max(12000, ds[Math.floor(ds.length / 4)] * S);
}
/** 安全点（引魂灯、林窗）与热浪口：按格摆的确定位置 */
export interface SafeSpot { x: number; y: number; r: number; type: 1 | 2 | 3; id: number }
/** 浮冰的格子边长（着色器里同一个数，见 gl/seaGlsl.ts 的 floeAt） */
export const FLOE_CELL = 560;
const SAFE_CELL = 2400;

export class Jueyu {
  /** 当前海况；不在险地里是 null */
  sea: SeaState | null = null;
  /** 当前所在图的险地配置 */
  profile: ZoneProfile | null = null;
  /** 离岸多远（大陆坐标，世界单位；未经平滑） */
  depth = 0;
  /** 绝域深入了多少（世界单位，海峡里恒为 0） */
  abyss = 0;
  /** 平滑过的各项参数 */
  k = { ceiling: 420, regen: 1, drain: 0, view: 1, dark: 0, swell: 0, rift: 0, spin: 0, mapLock: 0, dunkong: 1 };
  /** 当前在哪一带 */
  band: ZoneBand['id'] = 'near';
  /** 泅水：力竭落进水里（或被打进水里） */
  swimming = false;
  /** 立板沉到水线的量（负数，接在 st.lift 上） */
  sink = 0;
  /** 浪头打来的硬直剩余秒数 */
  stagger = 0;
  /** 本帧推人的风（世界单位 / 秒，当前图坐标） */
  wind = { x: 0, y: 0 };
  hud: JueyuHud = { show: false, shoreDir: 0, shoreDist: 0, spin: 0, lock: false, drainPct: 0, regenK: 1, swimming: false, canTakeoff: true, takeoffAt: 0.12, band: '', zone: '', gale: 0 };
  /**
   * 能落脚的东西（鲸背浮岛、灵舟……下一轮由它们登记）：给出这一点能不能站住。
   * carriers：正载着人的东西（灵舟），有它就不会力竭落水。
   */
  footholds: ((x: number, y: number) => boolean)[] = [];
  carriers: (() => boolean)[] = [];
  /** 测试 / 试玩用：强加的飓风、鬼雾（大陆坐标） */
  private forced: { storms: Storm[]; fogs: GhostFog[]; rifts: Rift[] } = { storms: [], fogs: [], rifts: [] };
  /** 测试用：关掉天象（只验规则时） */
  calm = false;

  private storms: Storm[] = []; private fogs: GhostFog[] = []; private rifts: Rift[] = []; private strikes: Strike[] = [];
  private scanT = 0;
  private hitRift = new Set<number>(); private hitRiftE = new WeakMap<Enemy, Set<number>>();
  private hitStrike = new Set<number>(); private struck = new Set<number>(); private opened = new Set<number>();
  private goneP = new Set<number>();
  /** 鬼雾幻影此刻摆在哪（本图坐标）、哪一刻浮出、哪一刻散的、累计偏了多少、散过几回（第六轮返工） */
  private phs = new Map<number, { x: number; y: number; born: number; gone: number; bend: number; n: number; on: boolean; a: number }>();
  private mpMark = 0; private healMark = 0;
  private waveT = 2; private waveV = { x: 0, y: 0, t: 0 };
  private flash = 0; private rippleT = 0; private rainAcc = 0;
  /** 当前图的平移：本图坐标 = 大陆坐标 + (fdx, fdy) */
  private fdx = 0; private fdy = 0;
  private grad = { x: 0, y: 0 };
  private lastBand: ZoneBand['id'] = 'near';
  /** 水遮罩（后期着色器用）：以人物为心 64×64 格 */
  private mask: { data: Uint8Array; n: number; x0: number; y0: number; size: number; ver: number } = { data: new Uint8Array(64 * 64), n: 64, x0: 0, y0: 0, size: 12800, ver: 0 };
  private maskJob: { data: Uint8Array; x0: number; y0: number; row: number } | null = null;
  private maskAt = { x: NaN, y: NaN };

  /** 收官 B3：灵舟、海渊、海上奇遇（各自的文件里；这里建、每帧驱动） */
  /** 收官 B4：介质的「气」0–1（瘴、冥雾、寒气、热浪）；人此刻在安全点（引魂灯、林窗）里的程度；热浪托举 */
  haze = 0; safe = 0; thermal = 0;
  /** 本帧所在的本界小险地（南荒的腐骨瘴泽）；没在里面是 null */
  local: LocalZone | null = null;
  private hazAcc = 0; private hazT = 0; private hazSaid = -99; private sandStill = 0; private pullT = 0;
  /** 冰裂开的窟窿（本图坐标）：一阵子之内那块浮冰站不住 */
  private holes: { x: number; y: number; r: number; t: number }[] = [];
  private spots: SafeSpot[] = []; private spotsAt = { x: NaN, y: NaN, id: '' };
  readonly boat: Lingzhou;
  readonly deep: Haiyuan;
  readonly qiyu: SeaQiyu;
  /** 祭坛「定风」的余效（秒）：风浪推不动人和船 */
  calmT = 0;
  private homeT = 0;

  constructor(readonly game: Game) {
    this.boat = new Lingzhou(game); this.deep = new Haiyuan(game); this.qiyu = new SeaQiyu(game);
    // 船（停着的那条）、鬼船甲板、祭坛礁盘：能落脚
    this.footholds.push((x, y) => !!this.qiyu.deckAt(x, y));
    this.footholds.push((x, y) => this.onFloe(x, y));   // 收官 B4：寒渊的浮冰
    this.carriers.push(() => this.boat.aboard);
  }

  /** 换图、读档、新开局时清掉天象与状态 */
  reset() {
    this.sea = null; this.swimming = false; this.sink = 0; this.stagger = 0; this.wind.x = this.wind.y = 0;
    this.storms = []; this.fogs = []; this.rifts = []; this.strikes = []; this.scanT = 0;
    this.hitRift.clear(); this.hitStrike.clear(); this.struck.clear(); this.opened.clear(); this.goneP.clear(); this.phs.clear();
    this.forced = { storms: [], fogs: [], rifts: [] };
    this.mpMark = this.game.hero?.mp ?? 0; this.healMark = 0; this.maskAt.x = NaN; this.maskJob = null;
    this.lastBand = 'near'; this.band = 'near';
    this.haze = 0; this.safe = 0; this.thermal = 0; this.hazAcc = 0; this.sandStill = 0; this.holes = []; this.spotsAt.id = ''; this.local = null;
    this.k = { ceiling: 420, regen: 1, drain: 0, view: 1, dark: 0, swell: 0, rift: 0, spin: 0, mapLock: 0, dunkong: 1 };
    this.snap = true;
    this.game.seabeast?.reset();   // 海兽（收官 B2）
    this.boat?.reset(); this.deep?.reset(); this.qiyu?.reset(); this.calmT = 0;   // 收官 B3
  }
  /** 下一帧直接取到位、不平滑（新开局、读档、瞬移之后） */
  private snap = true;

  // ------------------------------------------------------------ 装备加成（主线合并时接上 data/gear 的属性）
  /** 避水（waterward）减缓泅水的惩罚、抗风（windward）减小被风推的力度：来自装备和天赋（玄龟套等，data/gear.ts），封顶六成——绝域的罡风再怎么抗也顶不过去 */
  gearBonus(kind: 'waterward' | 'windward'): number { return Math.max(0, Math.min(0.6, statMod(this.game.hero, kind))); }

  // ------------------------------------------------------------ 坐标
  /** 本图坐标 → 大陆坐标 */
  toHome(x: number, y: number): [number, number] { return [x - this.fdx, y - this.fdy]; }
  /** 当前图用的离岸距离场：人界三张图共用一份，别界各一份（收官 B4） */
  get F(): ShoreField { return MAP_SEAMS[ACTIVE_MAP] || !isRealmMap(ACTIVE_MAP) ? shoreField : realmField(ACTIVE_MAP); }
  /**
   * 这一点（本图坐标）归哪份险地配置、离岸多远（收官 B4）：本界的小险地（南荒的腐骨瘴泽）在它的范围里优先，
   * 按「离陆地多远」分带（湖心最深），范围的外缘渐渐归零，和外面的无边海配置接得上。
   */
  zoneAt(x: number, y: number): { P: ZoneProfile; d: number; local: LocalZone | null } | null {
    const base = profileOf(ACTIVE_MAP); if (!base) return null;
    const f = mapFrame(ACTIVE_MAP), cx = x - f.dx, cy = y - f.dy;
    for (const z of LOCAL_ZONES) {
      if (z.map !== ACTIVE_MAP) continue;
      const r = Math.hypot(x - z.x, y - z.y); if (r >= z.R) continue;
      return { P: z.profile, d: shoreField.ready ? shoreField.landDepth(cx, cy) * (1 - sstep(z.R * 0.8, z.R, r)) : 0, local: z };
    }
    return { P: base, d: this.F.depthAt(cx, cy), local: null };
  }
  /** 某一点（本图坐标）离岸多远 */
  depthAt(x: number, y: number): number { return this.zoneAt(x, y)?.d ?? 0; }
  /** 某一点（大陆坐标）离岸多远：海兽、海渊、奇遇按大陆坐标排的东西问它（收官 B4：原先直接问人界的场） */
  homeDepth(cx: number, cy: number): number { const f = mapFrame(ACTIVE_MAP); return this.depthAt(cx + f.dx, cy + f.dy); }
  /** 当前配置里某一带从多远开始 */
  bandFrom(id: ZoneBand['id']): number { const P = this.profile ?? WUBIAN; return P.bands.find((b) => b.id === id)?.from ?? 0; }
  /** 收官 B4：灵舟在这里行不行（冰海行不得、熔岩只有宝船行得）；行得返回 null */
  boatRefusal(id: string): string | null {
    const M = this.profile?.medium; if (!M) return null;
    if (M.boat === 'none' || (M.boat === 'high' && !BOATS[id]?.dive)) return M.boatNo;
    return null;
  }
  /** 这一点（本图坐标）是不是在图的矩形之外、险地的外圈里（小地图、迷雾按「图外」处理） */
  outside(x: number, y: number): boolean {
    if (!profileOf(ACTIVE_MAP)) return false;
    const f = mapFrame(ACTIVE_MAP); return this.F.outsideRect(x - f.dx, y - f.dy) > 0;
  }
  /** 能不能落脚：给下一轮的鲸背浮岛、灵舟留的入口 */
  onWater(x: number, y: number): { water: boolean; stand: boolean } {
    const land = this.game.terrain.isLand(x, y);
    return { water: !land, stand: land || this.footholdAt(x, y) };
  }

  /**
   * 海面已经由后期着色器整片重画了（墨化过半：底色几乎只剩亮度，浪、沫、裂隙光都是着色器自己画的）——
   * 这时 render.ts 不必再在底图上逐格画波纹和粼光（看不见，却是图外海面比陆上慢一倍的主因：一屏几千笔描线加逐点问地形）。
   */
  get seaOwnsWater(): boolean { return !!this.sea && (this.k.dark > 0.3 || this.mediumAlways); }
  /** 收官 B4：别界的流沙、熔岩……和本界的小险地：人在这一界（这片瘴泽）里，看得见的「水」就一律画成那种介质（否则从岸上看是蓝水，飞出去一千五才变） */
  /** 收官 B4：人此刻在别界的非海水介质（或南荒的腐骨瘴泽）里：返回介质，海鸥、帆船、鱼跃这些水上的点缀按它关掉（life.ts 问） */
  get alienMedium(): string | null { const P = this.profile; return this.sea && P && (P.medium.kind !== 'sea' || P.local) ? P.medium.kind : null; }
  private get mediumAlways(): boolean { const P = this.profile; return !!P && (P.medium.kind !== 'sea' || !!P.local); }
  /**
   * 图外的一点是不是水：查人物四周那张 64×64 的水遮罩（后期着色器用的同一张），查不到返回 null。
   * 图外的地形要现算交界地带的噪声，render.ts 的底图波纹逐格问 isLand / sample 时，这一项占了大半帧。
   */
  maskWater(x: number, y: number): boolean | null {
    const M = this.mask; if (!M.ver) return null;
    const i = Math.floor((x - M.x0) / M.size * M.n), j = Math.floor((y - M.y0) / M.size * M.n);
    if (i < 0 || j < 0 || i >= M.n || j >= M.n) return null;
    return M.data[j * M.n + i] > 127;
  }
  /** 这一点有没有能落脚的东西（鲸背……）：game.canLand 和走动的判定问它 */
  footholdAt(x: number, y: number, noBoat = false): boolean { return this.footholds.some((f) => f(x, y)) || (!noBoat && (this.boat.standable(x, y) || (this.boat.aboard && Math.abs(x - this.boat.x) < 220 && Math.abs(y - this.boat.y) < 90))); }   // noBoat：找能放船的水面时不把船自己算进去
  /** 走到这一点（本图坐标）行不行：泅水时哪儿都能游，站在鲸背上只能在背上走（走到边上就停） */
  freeAt(x: number, y: number): boolean { return this.swimming || this.deep.active || (!this.game.terrain.isLand(x, y) && this.footholdAt(x, y)); }   // 收官 B3：水下哪儿都能游
  /** 迷雾断层往里，普通的野外刷怪停掉，只剩海兽那一套（combat.spawnTick 问） */
  quietSpawn(x: number, y: number): boolean {
    if (!profileOf(ACTIVE_MAP) || this.game.offWorld || this.game.terrain.isLand(x, y)) return false;
    const Z = this.zoneAt(x, y); return !!Z && Z.d >= (Z.P.bands.find((b) => b.id === 'fog')?.from ?? 12000);
  }
  /** 人附近（本图坐标）最近的那场飓风，以及这一点在它雨带里的程度（雷鳐跟着它出没） */
  stormNear(x: number, y: number): { id: number; band: number; eye?: boolean } | null {
    const [cx, cy] = this.toHome(x, y); let best: { id: number; band: number; eye?: boolean } | null = null;
    for (const s of this.storms) {
      if (s.k < 0.2) continue;
      const dr = Math.hypot(cx - s.x, cy - s.y);
      if (dr > s.R * 1.1) continue;
      const band = s.k * sstep(s.eye * 1.1, s.eye * 1.8, dr) * (1 - sstep(s.R * 0.85, s.R * 1.1, dr));
      if (!best || band > best.band) best = { id: s.id, band, eye: dr < s.eye * 1.4 };   // 第六轮返工：在风眼里（灵舟不挨浪）
    }
    return best;
  }

  // ------------------------------------------------------------ 规则：高度、范围、遁空、起飞、施法、速度
  /** 改写飞行高度上限 */
  ceiling(c: number): number { return this.profile && this.sea ? Math.min(c, Math.max(this.k.ceiling, this.thermal > 0.05 ? 120 + 300 * this.thermal : 0)) : c; }   // 收官 B4：热浪口把高度上限托高
  /**
   * 改写人物可以到的范围：海这一侧放开。
   * 能到的地方 = 各图的矩形向外放开 OUTER_OPEN（外圈海）+ 陆路交界的梯形外包 + 海峡（两图之间、上下各放开 OUTER_OPEN）；
   * 再和当前这张地形有地块的范围取交。只给出「人此刻所在的那一横、那一竖」能走多远，所以人永远在范围里，不会被拽一下。
   */
  bounds(b: Reach): Reach {
    const g = this.game;
    if (!profileOf(ACTIVE_MAP) || !MAP_SEAMS[ACTIVE_MAP] || g.offWorld || g.inCave || g.xukong?.active) return b;   // 收官 B4：别界的险地在图内，范围照旧
    const f = mapFrame(ACTIVE_MAP), p = g.player, px = p.x - f.dx, py = p.y - f.dy;
    const boxes = this.reachBoxes(), cov = this.coverage();
    // 沿一条横线（或竖线）把各块的区间并起来，取人所在的那一段
    const span = (along: number, cross: number, horiz: boolean): [number, number] | null => {
      const iv: [number, number][] = [];
      for (const r of boxes) { const c0 = horiz ? r.y0 : r.x0, c1 = horiz ? r.y1 : r.x1; if (cross >= c0 && cross <= c1) iv.push(horiz ? [r.x0, r.x1] : [r.y0, r.y1]); }
      iv.sort((u, v) => u[0] - v[0]);
      const merged: [number, number][] = [];
      for (const s of iv) { const last = merged[merged.length - 1]; if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]); else merged.push([s[0], s[1]]); }
      let best: [number, number] | null = null, bd = Infinity;
      for (const m of merged) { const dd = along < m[0] ? m[0] - along : along > m[1] ? along - m[1] : 0; if (dd < bd) { bd = dd; best = m; } }
      return best && bd < 4000 ? best : null;
    };
    const sx = span(px, py, true), sy = span(py, px, false);
    if (!sx || !sy) return b;   // 不在任何一块里（不该发生）：照旧
    const x0 = Math.max(sx[0], cov.x0), x1 = Math.min(sx[1], cov.x1), y0 = Math.max(sy[0], cov.y0), y1 = Math.min(sy[1], cov.y1);
    // 在图内时也不比旧规则更紧
    return { x0: Math.min(b.x0, x0 + f.dx), x1: Math.max(b.x1, x1 + f.dx), y0: Math.min(b.y0, y0 + f.dy), y1: Math.max(b.y1, y1 + f.dy) };
  }
  private boxesCache: { x0: number; y0: number; x1: number; y1: number }[] | null = null;
  /** 能到的几块（大陆坐标） */
  private reachBoxes() {
    if (this.boxesCache) return this.boxesCache;
    const out: { x0: number; y0: number; x1: number; y1: number }[] = [], E = OUTER_OPEN;
    const rect = (m: MapId) => { const f = mapFrame(m), t = shoreRect(m); return { x0: -f.dx, y0: -f.dy, x1: -f.dx + t.w, y1: -f.dy + t.h }; };
    const maps = (Object.keys(MAP_SEAMS) as MapId[]);
    for (const m of maps) { const r = rect(m); out.push({ x0: r.x0 - E, y0: r.y0 - E, x1: r.x1 + E, y1: r.y1 + E }); }
    for (const m of maps) for (const S of MAP_SEAMS[m] ?? []) {
      if (m > S.to) continue;
      const a = rect(m), c = rect(S.to), e = S.sea ? E : 0, pad = S.sea ? 0 : 200;
      if (S.side === 'n' || S.side === 's') {
        const ya = S.side === 'n' ? a.y0 : a.y1, yb = S.side === 'n' ? c.y1 : c.y0;
        out.push({ x0: Math.max(a.x0, c.x0) + pad - e, x1: Math.min(a.x1, c.x1) - pad + e, y0: Math.min(ya, yb), y1: Math.max(ya, yb) });
      } else {
        const xa = S.side === 'w' ? a.x0 : a.x1, xb = S.side === 'w' ? c.x1 : c.x0;
        out.push({ y0: Math.max(a.y0, c.y0) + pad - e, y1: Math.min(a.y1, c.y1) - pad + e, x0: Math.min(xa, xb), x1: Math.max(xa, xb) });
      }
    }
    return (this.boxesCache = out);
  }
  /** 当前这张地形有地块的范围（大陆坐标，留 3000 余量）：交界那一侧到交界的深处，其余是外圈海 */
  private coverage() {
    const m = ACTIVE_MAP, f = mapFrame(m), t = shoreRect(m), E = OUTER_OPEN;
    const r = { x0: -f.dx - E, y0: -f.dy - E, x1: -f.dx + t.w + E, y1: -f.dy + t.h + E };
    for (const S of MAP_SEAMS[m] ?? []) {
      const d = S.depth - 3000;
      if (S.side === 'n') r.y0 = Math.min(r.y0, -f.dy - d); else if (S.side === 's') r.y1 = Math.max(r.y1, -f.dy + t.h + d);
      else if (S.side === 'w') r.x0 = Math.min(r.x0, -f.dx - d); else r.x1 = Math.max(r.x1, -f.dx + t.w + d);
    }
    return r;
  }
  /** 遁空梭能不能催动（核心区空间紊乱） */
  dunkongRefusal(): string | null { return this.profile && this.sea && this.k.dunkong < 0.5 ? this.profile.text.dunkong : null; }
  /** 泅水时法力不够就起不了飞 */
  refuseFly(): boolean {
    if (this.deep.active) { this.game.toast('人在水下，御不了器——先按住上升键浮上去。', 'warn'); return true; }   // 收官 B3：海渊里
    if (this.boat.aboard) return this.boat.beforeFly();   // 收官 B3：在船上按御剑＝收舟起飞
    if (!this.swimming || !this.profile) return false;
    if (this.game.hero.mp >= this.profile.swim.takeoff) return false;
    this.game.toast(this.profile.text.noTakeoff, 'warn');
    return true;
  }
  /** 泅水时只能用小招式（一二品的法术）；返回 true 表示拦下了 */
  refuseCast(s: { tier?: number | null; name: string }): boolean {
    if (!this.swimming) return false;
    if ((s.tier ?? 0) <= 1) return false;
    this.game.toast(`人在水里，${s.name}施展不开——只能用一二品的小法术。`, 'warn');
    return true;
  }
  /** 移动速度的倍率：泅水约三成半（避水能减轻），浪头打来的硬直里不能动 */
  get speedMul(): number {
    if (this.boat.aboard) return 0;   // 收官 B3：在船上，方向键推的是船（lingzhou.ts 自己读键）
    if (this.deep.active) return 0.55 * (1 + Math.min(0.6, this.deep.ward()) * 0.4) / (this.game.player.running ? 1.6 : 1);   // 收官 B3：水下游得慢，避水好的身法轻一些
    if (!this.swimming || !this.profile) return 1;
    if (this.stagger > 0) return 0;
    const run = this.game.player.running ? 1.6 : 1;
    return this.profile.swim.speed * (1 + this.gearBonus('waterward') * 0.8) / run;
  }

  // ------------------------------------------------------------ 每帧
  tick(dt: number) {
    const g = this.game, p = g.player, h = g.hero;
    this.homeT -= dt; if (this.homeT <= 0) { this.homeT = 2; returnCarried(this.game); }   // 收官 B3：被带过交界的人不再同行就回原处（陆上遣散的也算，所以放在最前）
    if (!shoreField.ready) shoreField.step(3);
    const base = profileOf(ACTIVE_MAP);
    if (!base || g.offWorld || g.inCave || g.xukong?.active || h.dead) { this.idle(); return; }
    const FD = this.F;
    if (!FD.ready && FD !== shoreField) FD.step(3);
    const f = mapFrame(ACTIVE_MAP); this.fdx = f.dx; this.fdy = f.dy;
    const cx = p.x - f.dx, cy = p.y - f.dy;
    if (!FD.ready && (FD.outsideRect(cx, cy) > 0 || (FD !== shoreField && !g.terrain.isLand(p.x, p.y)))) FD.ensure();   // 人已经在图外（读档落在海上）、别界里人在「海」上：等不及分片了
    // 收官 B4：本界的小险地在它的范围里优先；人在湖面上而场还没算好，就一口气算完
    if (!shoreField.ready && FD === shoreField && LOCAL_ZONES.some((z) => z.map === ACTIVE_MAP && Math.hypot(p.x - z.x, p.y - z.y) < z.R) && !g.terrain.isLand(p.x, p.y)) shoreField.ensure();
    const Z = this.zoneAt(p.x, p.y)!, prof = Z.P;
    if (this.profile && this.profile !== prof) this.lastBand = 'near';   // 换了一份配置（进出腐骨瘴泽）：分带提示从头算
    this.profile = prof; this.local = Z.local;
    const d = Z.d;
    this.depth = d;
    if (Z.local) { const r = Math.hypot(p.x - Z.local.x, p.y - Z.local.y) || 1, F0 = shoreField; F0.gradAt(cx, cy, this.grad); if (!this.grad.x && !this.grad.y) { this.grad.x = (Z.local.x - p.x) / r; this.grad.y = (Z.local.y - p.y) / r; } }
    else FD.gradAt(cx, cy, this.grad);
    const outW = Z.local ? 0 : sstep(0, 12000, FD.outsideChannel(cx, cy));
    this.abyss = Math.max(0, d - prof.abyssFrom) * outW;
    // 各项参数：按离岸距离查曲线，再平滑（换图、场刚算好的那一刻都不会跳）
    const K = prof.curves, a = Math.min(1, dt * 3), kk = this.k;
    const tgt = { ceiling: curveAt(K.ceiling, d), regen: curveAt(K.regen, d), drain: curveAt(K.drain, d), view: curveAt(K.view, d), dark: curveAt(K.dark, d), swell: curveAt(K.swell, d), rift: curveAt(K.rift, d), spin: curveAt(K.spin, d), mapLock: curveAt(K.mapLock, d), dunkong: curveAt(K.dunkong, d) };
    for (const key of Object.keys(tgt) as (keyof typeof tgt)[]) kk[key] += (tgt[key] - kk[key]) * (this.snap ? 1 : a);
    this.snap = false;
    // 分带与提示
    const bands = prof.bands;
    let band: ZoneBand['id'] = 'near';
    for (const B of bands) if (B.id !== 'abyss' && d >= B.from) band = B.id;
    if (this.abyss > 0) band = 'abyss';
    this.band = band;
    if (band !== this.lastBand) {
      const order = ['near', 'fog', 'core', 'abyss'];
      if (order.indexOf(band) > order.indexOf(this.lastBand)) { const B = bands.find((x) => x.id === band); if (B) g.hint(`jueyu-${prof.id}-${band}`, B.hint); }
      this.lastBand = band;
    }
    // 天象
    const t = g.time;
    const forced = this.forced.storms.length + this.forced.fogs.length + this.forced.rifts.length > 0;
    if (d > 6000 || forced || this.storms.length) {
      this.scanT -= dt;
      if (this.scanT <= 0) { this.scanT = 0.5; this.scan(prof, cx, cy, t); }
      this.advance(t);
    } else if (this.rifts.length || this.strikes.length || this.fogs.length) { this.rifts = []; this.strikes = []; this.fogs = []; }
    // 风：推人、推怪、推弹道
    this.applyWind(prof, dt, cx, cy);
    // 遁空梭：核心区失灵（正疾行的被迫收势）
    if (g.dunkong?.active && this.k.dunkong < 0.5 && g.dunkong.phase !== 'retracting') g.dunkong.retract(prof.text.dunkong);
    // 裂缝、落雷的结算
    this.resolveHazards(t);
    // 收官 B4：介质自己的险（毒瘴、寒气、熔岩、陷沙、冥雾拉人、热浪托举）
    this.mediumTick(prof, dt, cx, cy);
    // 收官 B3：灵舟（驾船、耐久）、海渊（下潜、水压、遗迹）、奇遇（鬼船、祭坛、甲板）——都在落水判定之前
    this.calmT = Math.max(0, this.calmT - dt);
    this.boat.tick(dt);
    this.deep.tick(dt);
    this.qiyu.tick(dt);
    // 力竭落水、泅水
    this.waterTick(prof, dt);
    // 法力：记下这一刻，光阴结算后（manaTick）按带折算回复
    this.mpMark = h.mp; this.healMark = (g.combat as unknown as { heal?: { mp: number } | null }).heal?.mp ?? 0;
    // 海况与界面
    this.flash = Math.max(0, this.flash - dt * 3);
    this.updateSea(prof, cx, cy);
    this.updateMask();
    this.updateHud(prof, cx, cy);
    // 海兽生态（收官 B2，world/seabeast.ts）：黑影、气味、破水、血腥连锁、鲸
    this.game.seabeast?.tick(dt);
  }
  private idle() {
    this.game.seabeast?.idle();   // 海兽：不在险地里就潜走
    this.boat?.tick(0); this.deep?.leave(); this.qiyu?.tick(0);   // 收官 B3：离了海——船收回袖中、人浮出水面、甲板落空
    if (this.sea || this.swimming || this.hud.show) { this.sea = null; this.swimming = false; this.sink = 0; this.hud.show = false; this.hud.swimming = false; this.hud.lock = false; this.hud.drainPct = 0; }
    this.profile = profileOf(ACTIVE_MAP);
    this.wind.x = this.wind.y = 0;
  }

  /**
   * 光阴结算之后调：这一帧里自然回上来的法力（战斗里的回气 + 光阴里的回气）按带打折，再按境界流失。
   * 丹药不受影响：瞬间回的丹药不在这一帧的窗口里，慢慢回的（combat.heal）单独扣掉不打折。
   */
  manaTick(dt: number) {
    const g = this.game, h = g.hero, prof = this.profile;
    if (!prof || !this.sea || h.dead) return;
    // 鲸背（收官 B2）：一缕微弱的灵脉——不受这一带「回复打折、灵力流失」的限制，打坐还多回一些
    if (g.seabeast?.sanctuary) { if (g.player.sitting) h.mp = Math.min(1, h.mp + 0.012 * dt); return; }
    const heal = (g.combat as unknown as { heal?: { mp: number } | null }).heal ? this.healMark * dt : 0;
    const gained = h.mp - this.mpMark - heal;
    // 收官 B3：灵舟上打坐——核心区原本不回气，船上的聚灵阵能回上来一点（打坐时光阴流得快，0.08 约每息回 2%，抵得过流失还有余）；迷雾断层照常减半
    const regen = this.boat.aboard && g.player.sitting ? Math.max(this.k.regen, 0.08) : this.k.regen;
    if (gained > 0) h.mp -= gained * (1 - regen);
    const rate = this.drainRate;
    if (rate > 0) h.mp = Math.max(0, h.mp - rate * dt);
  }
  /** 交界里按走过的纵深折算光阴（game.ts 的 seamTick）：那几日里回上来的法力也照分带打折——否则每飞一段就回满，流失形同虚设 */
  afterTravel(mp0: number) {
    const g = this.game, h = g.hero, prof = profileOf(ACTIVE_MAP);
    if (!prof || h.mp <= mp0 || g.offWorld) return;
    // 按此刻所在处现查（瞬移、读档后的头一帧，平滑过的参数还没跟上）
    h.mp = mp0 + (h.mp - mp0) * curveAt(prof.curves.regen, this.depthAt(g.player.x, g.player.y));
  }
  /** 此刻每息流失多少法力（占上限的比例） */
  get drainRate(): number {
    const prof = this.profile; if (!prof || !this.sea) return 0;
    const r = prof.drainByRealm[Math.max(0, Math.min(prof.drainByRealm.length - 1, this.game.hero.realm))] ?? 0;
    return r * this.k.drain * (this.swimming || this.deep.active ? prof.swim.drainK : 1) * this.boat.drainK;   // 收官 B3：水下同泅水；灵舟上降到四分之一（好船更少）
  }

  // ------------------------------------------------------------ 天象：按大陆坐标和时间取的确定序列
  private scan(prof: ZoneProfile, cx: number, cy: number, t: number) {
    const K = prof.curves;
    const live = (o: { t0: number; life: number }) => t >= o.t0 && t <= o.t0 + o.life;
    // 飓风
    const S: Storm[] = [];
    if (!this.calm) {
      const ci = Math.floor(cx / STORM_CELL), cj = Math.floor(cy / STORM_CELL), e0 = Math.floor(t / STORM_EPOCH);
      for (let e = e0 - 2; e <= e0; e++) for (let j = cj - 2; j <= cj + 2; j++) for (let i = ci - 2; i <= ci + 2; i++) {
        const seed = e * 7 + 1103;
        const x0 = (i + H(i, j, seed + 1)) * STORM_CELL, y0 = (j + H(i, j, seed + 2)) * STORM_CELL;
        const rate = curveAt(K.storm, this.homeDepth(x0, y0)) * 0.55 * prof.freq.storm;
        if (H(i, j, seed) >= rate) continue;
        const ang = H(i, j, seed + 3) * Math.PI * 2, sp = 50 + 60 * H(i, j, seed + 4), R = 2600 + 1800 * H(i, j, seed + 5);
        const st: Storm = { id: (e * 1000003 + j * 1009 + i) | 0, x0, y0, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, t0: e * STORM_EPOCH + H(i, j, seed + 6) * STORM_EPOCH * 0.4, life: 360 + 180 * H(i, j, seed + 7), R, eye: R * 0.12, vmax: 700 + 450 * H(i, j, seed + 8), spin: H(i, j, seed + 9) < 0.5 ? 1 : -1, x: 0, y: 0, k: 0 };
        if (!live(st)) continue;
        st.x = st.x0 + st.vx * (t - st.t0); st.y = st.y0 + st.vy * (t - st.t0);
        if (Math.hypot(st.x - cx, st.y - cy) < st.R + 14000) S.push(st);
      }
    }
    for (const s of this.forced.storms) if (live(s)) S.push(s);
    this.storms = S;
    // 鬼雾
    const Fg: GhostFog[] = [];
    if (!this.calm) {
      const ci = Math.floor(cx / FOG_CELL), cj = Math.floor(cy / FOG_CELL), e0 = Math.floor(t / FOG_EPOCH);
      for (let e = e0 - 1; e <= e0; e++) for (let j = cj - 2; j <= cj + 2; j++) for (let i = ci - 2; i <= ci + 2; i++) {
        const seed = e * 11 + 2207;
        const x0 = (i + H(i, j, seed + 1)) * FOG_CELL, y0 = (j + H(i, j, seed + 2)) * FOG_CELL;
        if (H(i, j, seed) >= curveAt(K.ghost, this.homeDepth(x0, y0)) * 0.6 * prof.freq.ghost) continue;
        const ang = H(i, j, seed + 3) * Math.PI * 2, sp = 15 + 30 * H(i, j, seed + 4);
        const fg: GhostFog = { id: (e * 1000033 + j * 1013 + i) | 0, x0, y0, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, t0: e * FOG_EPOCH + H(i, j, seed + 5) * FOG_EPOCH * 0.3, life: 500 + 200 * H(i, j, seed + 6),
          rx: 3500 + 3000 * H(i, j, seed + 7), ry: 1400 + 1200 * H(i, j, seed + 8), ang: H(i, j, seed + 9) * Math.PI, x: 0, y: 0, k: 0, ph: [] };
        if (!live(fg)) continue;
        fg.x = fg.x0 + fg.vx * (t - fg.t0); fg.y = fg.y0 + fg.vy * (t - fg.t0);
        if (Math.hypot(fg.x - cx, fg.y - cy) > fg.rx + 9000) continue;
        this.phantomsOf(fg, seed, i, j);
        Fg.push(fg);
      }
    }
    for (const fg of this.forced.fogs) if (live(fg)) Fg.push(fg);
    this.fogs = Fg;
  }
  private phantomsOf(fg: GhostFog, seed: number, i: number, j: number) {
    const n = 3 + Math.floor(H(i, j, seed + 20) * 3);
    for (let q = 0; q < n; q++) {
      const a = H(i + q, j, seed + 21) * Math.PI * 2, r = 0.25 + 0.6 * H(i, j + q, seed + 22);
      fg.ph.push({ id: fg.id * 8 + q, kind: Math.floor(H(i + q, j + q, seed + 23) * 3) as 0 | 1 | 2, ox: Math.cos(a) * r * fg.rx, oy: Math.sin(a) * r * fg.ry, s: 0.8 + 0.5 * H(i - q, j, seed + 24) });
    }
  }
  /** 位置、强度随时间走；裂缝、落雷按时段排出来 */
  private advance(t: number) {
    const ramp = (o: { t0: number; life: number }) => sstep(0, 40, t - o.t0) * sstep(0, 40, o.t0 + o.life - t);
    for (const s of this.storms) {
      s.x = s.x0 + s.vx * (t - s.t0); s.y = s.y0 + s.vy * (t - s.t0);
      // 靠岸就散：离岸越近越弱
      s.k = ramp(s) * sstep(this.bandFrom('fog') * 0.58, this.bandFrom('fog') * 1.25, this.homeDepth(s.x, s.y));   // 收官 B4：按这份配置的断层起点（无边海是 7000–15000）
    }
    const prof = this.profile!, fog0 = this.bandFrom('fog');
    for (const f of this.fogs) { f.x = f.x0 + f.vx * (t - f.t0); f.y = f.y0 + f.vy * (t - f.t0); f.k = ramp(f) * sstep(fog0 * 0.67, fog0 * 1.17, this.homeDepth(f.x, f.y)); }
    const [cx, cy] = this.toHome(this.game.player.x, this.game.player.y);
    // 裂缝：人四周 7×7 格，每格每个时段按深入程度掷一次
    const R: Rift[] = [];
    if (!this.calm) {
      const ci = Math.floor(cx / RIFT_CELL), cj = Math.floor(cy / RIFT_CELL), s0 = Math.floor(t / RIFT_SLOT);
      for (let s = s0 - 2; s <= s0; s++) for (let j = cj - 3; j <= cj + 3; j++) for (let i = ci - 3; i <= ci + 3; i++) {
        const seed = s * 13 + 3301;
        const x = (i + H(i, j, seed + 1)) * RIFT_CELL, y = (j + H(i, j, seed + 2)) * RIFT_CELL;
        if (H(i, j, seed) >= curveAt(prof.curves.riftRate, this.homeDepth(x, y)) * 0.05 * prof.freq.rift) continue;
        const r: Rift = { id: (s * 1000037 + j * 1031 + i) | 0, x, y, ang: H(i, j, seed + 3) * Math.PI, len: 300 + 650 * H(i, j, seed + 4), t0: s * RIFT_SLOT + H(i, j, seed + 5) * RIFT_SLOT, frac: 0.3 + 0.3 * H(i, j, seed + 6), tide: false };
        if (t >= r.t0 && t <= r.t0 + RIFT_WARN + RIFT_OPEN + RIFT_CLOSE) R.push(r);
      }
      // 裂隙潮：核心区里每个时段按格掷一次，一来就是一片
      const T = prof.riftTide, ti = Math.floor(cx / TIDE_CELL), tj = Math.floor(cy / TIDE_CELL), p0 = Math.floor(t / T.period);
      for (let pp = p0 - 1; pp <= p0; pp++) for (let j = tj - 1; j <= tj + 1; j++) for (let i = ti - 1; i <= ti + 1; i++) {
        const seed = pp * 17 + 4409, tx = (i + 0.5) * TIDE_CELL, ty = (j + 0.5) * TIDE_CELL;
        if (H(i, j, seed) >= T.chance * curveAt(prof.curves.drain, this.homeDepth(tx, ty))) continue;
        const start = pp * T.period + H(i, j, seed + 1) * (T.period - 6), n = T.count[0] + Math.floor(H(i, j, seed + 2) * (T.count[1] - T.count[0] + 1));
        for (let q = 0; q < n; q++) {
          const a = H(i + q, j, seed + 3) * Math.PI * 2, rr = 300 + 2600 * Math.sqrt(H(i, j + q, seed + 4));
          const r: Rift = { id: (pp * 1000039 + j * 1033 + i) * 16 + q | 0, x: (i + 0.5) * TIDE_CELL + (H(i, j, seed + 5) - 0.5) * TIDE_CELL * 0.6 + Math.cos(a) * rr, y: (j + 0.5) * TIDE_CELL + (H(i, j, seed + 6) - 0.5) * TIDE_CELL * 0.6 + Math.sin(a) * rr,
            ang: H(i - q, j, seed + 7) * Math.PI, len: 400 + 550 * H(i, j - q, seed + 8), t0: start + q * 0.3 + H(i + q, j - q, seed + 9) * 0.4, frac: 0.3 + 0.3 * H(i + 2 * q, j, seed + 10), tide: true };
          if (t >= r.t0 && t <= r.t0 + RIFT_WARN + RIFT_OPEN + RIFT_CLOSE) R.push(r);
        }
      }
    }
    for (const r of this.forced.rifts) if (t >= r.t0 && t <= r.t0 + RIFT_WARN + RIFT_OPEN + RIFT_CLOSE) R.push(r);
    this.rifts = R;
    // 落雷：每场飓风的雨带里隔一阵劈一道；人在雨带里时还会追着人劈
    const St: Strike[] = [];
    for (const s of this.storms) {
      if (s.k < 0.2) continue;
      const per = 2.2, n0 = Math.floor((t - s.t0) / per);
      for (let n = n0 - 1; n <= n0; n++) {
        const ts = s.t0 + n * per + H(s.id, n, 5501) * 1.2;
        if (t < ts || t > ts + STRIKE_WARN + 0.5) continue;
        const a = H(s.id, n, 5502) * Math.PI * 2, rr = s.eye * 1.8 + (s.R * 0.8 - s.eye * 1.8) * H(s.id, n, 5503);
        St.push({ id: s.id * 64 + (n & 63), x: s.x + Math.cos(a) * rr, y: s.y + Math.sin(a) * rr, t0: ts, frac: 0.14 + 0.06 * H(s.id, n, 5504) });
      }
      // 追人：人在雨带里（风眼外、外缘内）时每 4.5 息一道，落在人那一刻前方不远
      const dr = Math.hypot(cx - s.x, cy - s.y);
      if (dr > s.eye * 1.3 && dr < s.R * 0.95) {
        const per2 = 4.5, m = Math.floor(t / per2), ts = m * per2 + 0.3;
        if (t >= ts && t <= ts + STRIKE_WARN + 0.5) {
          const key = s.id * 997 + m;
          let hs = this.hunt.get(key);
          if (!hs) { hs = { x: cx + (H(s.id, m, 5511) - 0.5) * 300, y: cy + (H(s.id, m, 5512) - 0.5) * 300 }; this.hunt.set(key, hs); if (this.hunt.size > 32) this.hunt.delete(this.hunt.keys().next().value!); }
          St.push({ id: key * 2 + 1, x: hs.x, y: hs.y, t0: ts, frac: 0.16 });
        }
      }
    }
    this.strikes = St;
  }
  private hunt = new Map<number, { x: number; y: number }>();

  /** 某一点（大陆坐标）的风：飓风的旋转风 + 绝域的罡风（单位 / 秒）；out 返回推人的那一份 */
  windAt(cx: number, cy: number, out: { x: number; y: number; storm: number; gale: number }) {
    out.x = 0; out.y = 0; out.storm = 0; out.gale = 0;
    for (const s of this.storms) {
      if (s.k < 0.01) continue;
      const dx = cx - s.x, dy = cy - s.y, r = Math.hypot(dx, dy);
      if (r > s.R * 1.15 || r < 1) continue;
      const wall = s.eye * 1.9;
      const vt = r < wall ? s.vmax * sstep(s.eye * 0.8, wall, r) : s.vmax * Math.pow(wall / r, 0.55) * (1 - sstep(s.R * 0.75, s.R * 1.15, r));
      const tx = -dy / r * s.spin, ty = dx / r * s.spin, inflow = r < wall ? 0 : 0.28;
      const wx = (tx - dx / r * inflow) * vt * s.k, wy = (ty - dy / r * inflow) * vt * s.k;
      out.x += wx * STORM_PUSH; out.y += wy * STORM_PUSH;
      out.storm = Math.max(out.storm, vt * s.k / s.vmax);
    }
    // 绝域：朝岸的方向猛吹，越深越猛；带一点横向的打旋，不是一条直线
    const prof = this.profile;
    if (prof) {
      const FD = this.F, outW = sstep(0, 12000, FD.outsideChannel(cx, cy)), ab = prof.local ? 0 : Math.max(0, FD.depthAt(cx, cy) - prof.abyssFrom) * outW;
      if (ab > 0) {
        const W = prof.abyssWind, v = W.base * Math.pow(ab / W.scale, W.pow), gr = FD.gradAt(cx, cy, { x: 0, y: 0 });
        const sw = Math.sin(cx / 3100 + cy / 2700) * 0.35;
        out.x += (-gr.x - gr.y * sw) * v; out.y += (-gr.y + gr.x * sw) * v;
        out.gale = Math.min(1, ab / 10000);
      }
    }
    return out;
  }
  private wtmp = { x: 0, y: 0, storm: 0, gale: 0 };
  private applyWind(prof: ZoneProfile, dt: number, cx: number, cy: number) {
    const g = this.game, p = g.player;
    const w = this.windAt(cx, cy, this.wtmp), k = (1 - this.gearBonus('windward')) * (this.calmT > 0 ? 0.3 : 1);   // 收官 B3：祭坛的「定风」
    this.wind.x = w.x * k; this.wind.y = w.y * k;
    if ((p.flying || this.swimming) && (w.x || w.y)) {
      const B = g.bounds;
      p.x = Math.min(B.x1, Math.max(B.x0, p.x + this.wind.x * dt));
      p.y = Math.min(B.y1, Math.max(B.y0, p.y + this.wind.y * dt));
    }
    // 敌人、弹道：只算人附近的（风是一大片的，远处的不必推）
    if (!this.storms.length && this.abyss <= 0) return;
    const T = g.terrain, tmp = { x: 0, y: 0, storm: 0, gale: 0 };
    for (const e of g.combat.enemies) {
      if (e.dead || Math.abs(e.x - p.x) > 4000 || Math.abs(e.y - p.y) > 4000) continue;
      this.windAt(e.x - this.fdx, e.y - this.fdy, tmp);
      if (!tmp.x && !tmp.y) continue;
      const nx = e.x + tmp.x * dt * 0.8, ny = e.y + tmp.y * dt * 0.8;
      if (e.canFly || e.def.flying || T.walkFactor(nx, ny) > 0) { e.x = nx; e.y = ny; }
    }
    for (const pr of g.combat.projs) {
      if (Math.abs(pr.x - p.x) > 4000 || Math.abs(pr.y - p.y) > 4000) continue;
      this.windAt(pr.x - this.fdx, pr.y - this.fdy, tmp);
      pr.vx += tmp.x * dt * 1.2; pr.vy += tmp.y * dt * 1.2;
    }
    void prof;
  }

  /** 裂缝撕开、落雷劈下：对主角和敌人都结算（伤害一律走 hitPlayer / hitEnemy，模组的 damage 钩子照常触发） */
  private resolveHazards(t: number) {
    const g = this.game, p = g.player, c = g.combat;
    for (const r of this.rifts) {
      const age = t - r.t0;
      if (age < RIFT_WARN || age > RIFT_WARN + RIFT_OPEN) continue;
      const [lx, ly] = [r.x + this.fdx, r.y + this.fdy];
      if (!this.opened.has(r.id)) {
        this.opened.add(r.id); if (this.opened.size > 256) this.opened.delete(this.opened.values().next().value!);
        if (Math.hypot(lx - p.x, ly - p.y) < 2400) { const fx = g.renderer?.fx; if (fx) fx.shock(lx, ly, r.len * 0.9, 18, 0.6); g.juice?.(0.02, 0.25); audio.sfx('boom'); }
      }
      const ux = Math.cos(r.ang), uy = Math.sin(r.ang), open = sstep(0, 0.25, age - RIFT_WARN);
      const near = (x: number, y: number, rad: number) => { const dx = x - lx, dy = y - ly, a = Math.max(-r.len / 2, Math.min(r.len / 2, dx * ux + dy * uy)); return Math.hypot(dx - ux * a, dy - uy * a) < rad * open; };
      if (!this.hitRift.has(r.id) && !this.deep.active && near(p.x, p.y, 75)) {
        this.hitRift.add(r.id); if (this.hitRift.size > 256) this.hitRift.delete(this.hitRift.values().next().value!);
        this.hurtPlayer(r.frac, lx, ly, this.profile?.weather.rift.hit ?? '空间裂缝撕过肉身！', undefined, true);   // 天象不是斗法：护体灵光挡不住空间裂缝，否则脱战补满的罩子会把人变成刀枪不入
        if (this.profile?.medium.floes) this.crackIce(p.x, p.y);   // 收官 B4：冰裂——脚下那块浮冰碎了
      }
      for (const e of c.enemies) {
        if (e.dead || e.ally || (e as unknown as { noP?: boolean }).noP) continue;
        if (Math.abs(e.x - lx) > r.len || Math.abs(e.y - ly) > r.len || !near(e.x, e.y, 85)) continue;
        let set = this.hitRiftE.get(e); if (!set) { set = new Set(); this.hitRiftE.set(e, set); }
        if (set.has(r.id)) continue;
        set.add(r.id);
        c.hitEnemy(e, e.maxHp * r.frac, { realm: e.realm, stCh: 0 }, lx, ly);
      }
    }
    for (const s of this.strikes) {
      const age = t - s.t0;
      if (age < STRIKE_WARN || this.struck.has(s.id)) continue;
      this.struck.add(s.id); if (this.struck.size > 256) this.struck.delete(this.struck.values().next().value!);
      const lx = s.x + this.fdx, ly = s.y + this.fdy;
      const fx = g.renderer?.fx;
      const WS = this.profile?.weather.strike, bolt = !WS || WS.fx === 'bolt';
      if (fx && Math.hypot(lx - p.x, ly - p.y) < 2600) { this.bolts.push({ x: lx, y: ly, t: 0, seed: s.id & 0xffff }); this.strikeBurst(fx, lx, ly); if (bolt) this.flash = Math.max(this.flash, 0.55 * (1 - Math.min(1, Math.hypot(lx - p.x, ly - p.y) / 2600))); audio.sfx(bolt ? 'thunder' : 'boom'); }
      if (Math.hypot(lx - p.x, ly - p.y) < STRIKE_R && p.z < 260 && !this.deep.active) {
        this.hurtPlayer(s.frac, lx, ly, WS?.hit ?? '一道落雷劈在身上！', 'strike', true);
        // 收官 B4：勾魂手把飞着的人往下拖（拖进冥河就是落水）；冰锥砸碎脚下的浮冰
        if (WS?.fx === 'hand' && p.flying) { p.zTarget = 0; p.z = Math.max(0, p.z - 120); }
        if (WS?.fx === 'icicle') this.crackIce(p.x, p.y);
      }
      for (const e of c.enemies) if (!e.dead && !e.ally && Math.hypot(e.x - lx, e.y - ly) < STRIKE_R + 20) c.hitEnemy(e, e.maxHp * s.frac, { realm: e.realm, stCh: 0, school: bolt ? '雷' : undefined }, lx, ly);
    }
  }
  private bolts: { x: number; y: number; t: number; seed: number }[] = [];
  /** 按最大气血的比例伤主角（抵掉防御，按同境界算，护盾、阵法照常挡） */
  /** 收官 B3：海渊的水压、窒息也按最大气血的比例伤人（haiyuan.ts 调） */
  hurtFrac(frac: number, x: number, y: number, why: string | null) { this.hurtPlayer(frac, x, y, why, undefined, true); }
  private hurtPlayer(frac: number, x: number, y: number, why: string | null, kind?: 'strike', bypassShield = false) {
    const g = this.game, c = g.combat, ps = (c as unknown as { pStats: { hp: number; def: number } }).pStats;
    this.boat.onHazard(frac, kind);   // 收官 B3：人在船上，船也挨这一下
    const raw = frac * ps.hp / 0.95 + ps.def * 0.8;
    const hp0 = g.hero.hp;
    c.hitPlayer(raw, g.hero.realm, undefined, x, y, undefined, bypassShield);
    this.boat.syncHp();   // 第六轮返工：船已经按天象挨过这一下，人掉的血不再二次算到船上
    if (g.hero.hp < hp0 && why) g.toast(why, 'warn');
  }

  // ------------------------------------------------------------ 力竭落水、泅水
  private waterTick(prof: ZoneProfile, dt: number) {
    const g = this.game, p = g.player, h = g.hero;
    // 收官 B3：水下（海渊）不泅水；在船上、站在鬼船甲板 / 祭坛礁盘上：立板抬到甲板的高度
    if (this.deep.active) { this.swimming = false; this.stagger = 0; const lt = 60 + Math.sin(g.time * 1.8) * 8; this.sink += (lt - this.sink) * Math.min(1, dt * 4); return; }
    if (this.boat.aboard) { this.swimming = false; this.stagger = 0; this.sink = this.boat.deckLift(); return; }
    { const dl = this.qiyu.deckLift(); if (dl !== null && !p.flying) { this.swimming = false; this.stagger = 0; this.sink += (dl - this.sink) * Math.min(1, dt * 10); return; } }
    const here = this.onWater(p.x, p.y), carried = this.carriers.some((f) => f());
    if (p.flying && this.swimming) { this.swimming = false; this.stagger = 0; }
    if (p.flying && !carried && here.water && !here.stand && h.mp <= 0.002 && this.depth > 1500 && !g.yuanying?.active) {
      // 力竭：遁光溃散，坠进水里
      p.flying = false; p.boosting = false; p.zTarget = 0;
      if (g.dunkong?.active) g.dunkong.retract();
      this.swimming = true; this.stagger = 0.6; this.waveT = 2.5;
      g.toast(prof.text.fall, 'warn'); g.juice?.(0.05, 0.4); audio.sfx('land');
      const fx = g.renderer?.fx;
      if (fx) { fx.sparks(p.x, p.y - 10, [0.85, 0.92, 0.95], 26, 460, 0.7, 5, -Math.PI / 2, 2.2); fx.shockRing(p.x, p.y, 160, [0.85, 0.95, 1], 0.6, 0.55, 0.7, true); }
    }
    if (!p.flying && !this.swimming && here.water && !here.stand && !carried) this.swimming = true;   // 别的办法掉进水里（被打落、读档）
    if (this.swimming && (!here.water || here.stand)) { this.swimming = false; this.stagger = 0; if (here.water && this.game.seabeast.onWhale(p.x, p.y)) g.toast('攀上了覆海玄鲸的背——脚下是湿滑的苔草，总算不用泡在水里了。', 'info'); else if (!here.water) g.toast('爬上了岸，总算脚踏实地。', 'info'); else if (this.onFloe(p.x, p.y)) g.toast('攀上了一块浮冰——冰面滑得站不稳，好歹不用泡在冰水里了。', 'info'); }
    const sinkT = this.swimming ? -46 : 0;
    this.sink += (sinkT - this.sink) * Math.min(1, dt * 5);
    if (Math.abs(this.sink) < 0.3) this.sink = 0;
    if (!this.swimming) return;
    if (p.sitting) { g.stand(); g.toast(prof.medium.kind === 'sea' ? '浪涛之中坐不住，打坐不得。' : `人在${prof.medium.name}里，坐不住，打坐不得。`, 'warn'); }
    this.stagger = Math.max(0, this.stagger - dt);
    // 浪头：隔一阵推人一把、打出短硬直
    this.waveT -= dt;
    if (this.waveT <= 0) {
      const n = Math.floor(g.time / 0.37);
      this.waveT = (2.6 + 2.2 * H(n, 7, 6601)) * (1 + this.gearBonus('waterward'));
      const sw = Math.max(0.25, this.k.swell);
      const dir = Math.hypot(this.wind.x, this.wind.y) > 30 ? Math.atan2(this.wind.y, this.wind.x) : H(n, 3, 6602) * Math.PI * 2;   // 有风顺风推，没风四面乱涌
      this.waveV = { x: Math.cos(dir) * 520 * sw, y: Math.sin(dir) * 520 * sw, t: 0.45 };
      this.stagger = 0.35 * (1 - this.gearBonus('waterward'));
      const fx = g.renderer?.fx; if (fx) { fx.sparks(p.x, p.y - 20, [0.85, 0.93, 0.95], 16, 380, 0.6, 5, dir - Math.PI / 2, 1.4); }
      if (H(n, 9, 6603) < 0.4) g.combat.texts.push({ x: p.x, y: p.y - 100, s: WAVE_WORD[prof.medium.kind] ?? '浪头打来', color: '#bfe0ea', t: 0, vy: -30 } as never);
    }
    if (this.waveV.t > 0) {
      this.waveV.t -= dt;
      const B = g.bounds;
      p.x = Math.min(B.x1, Math.max(B.x0, p.x + this.waveV.x * dt)); p.y = Math.min(B.y1, Math.max(B.y0, p.y + this.waveV.y * dt));
    }
  }

  // ------------------------------------------------------------ 海况（后期着色器）、水遮罩、界面
  private updateSea(prof: ZoneProfile, cx: number, cy: number) {
    const k = this.k, d = this.depth;
    const fogK = this.fogAt(cx, cy);
    let view = Math.min(k.view, 1 - 0.82 * fogK, 1 - 0.7 * (this.game.seabeast?.ink ?? 0));   // 海魔喷的墨也把视野压下去
    view = Math.max(view, Math.min(0.85, this.safe * 0.9));   // 收官 B4：引魂灯、林窗底下照得开雾
    const wl = Math.hypot(this.wind.x, this.wind.y);
    const active = d > 1500 || this.mediumAlways || this.storms.some((s) => s.k > 0.01) || this.swimming || this.deep.k > 0.003 || this.boat.on || (this.game.seabeast?.ink ?? 0) > 0.02;
    if (!active) { this.sea = null; return; }
    this.sea = {
      deep: Math.min(1, d / (prof.bands.find((b) => b.id === 'core')?.from ?? 34000)), abyss: Math.min(1, this.abyss / 10000),
      swell: k.swell, windDir: wl > 1 ? Math.atan2(this.wind.y, this.wind.x) : Math.atan2(this.grad.y, this.grad.x), wind: Math.min(1, wl / 800),
      shroud: 1 - view, dark: k.dark, rift: k.rift,
    };
  }
  /** 一点（大陆坐标）的鬼雾浓度 */
  fogAt(cx: number, cy: number): number {
    let f = 0;
    for (const g of this.fogs) {
      if (g.k < 0.01) continue;
      const dx = cx - g.x, dy = cy - g.y, c = Math.cos(g.ang), s = Math.sin(g.ang);
      const q = Math.hypot((c * dx + s * dy) / g.rx, (-s * dx + c * dy) / g.ry);
      f = Math.max(f, (1 - sstep(0.55, 1.05, q)) * g.k);
    }
    return f;
  }
  /** 水遮罩：人走出中心一千六就重算一张（分几帧算，每帧 16 行） */
  private updateMask() {
    const g = this.game, p = g.player, M = this.mask;
    if (!this.sea) return;
    if (!this.maskJob && !(Math.abs(p.x - this.maskAt.x) < 1600 && Math.abs(p.y - this.maskAt.y) < 1600)) {
      const ox = Math.round(p.x / 1600) * 1600, oy = Math.round(p.y / 1600) * 1600;
      this.maskJob = { data: new Uint8Array(M.n * M.n), x0: ox - M.size / 2, y0: oy - M.size / 2, row: 0 };
      this.maskAt = { x: ox, y: oy };
    }
    const J = this.maskJob; if (!J) return;
    const T = g.terrain, cell = M.size / M.n, first = M.ver === 0;
    const rows = first ? M.n : 16;
    for (let r = 0; r < rows && J.row < M.n; r++, J.row++) {
      const y = J.y0 + (J.row + 0.5) * cell;
      for (let i = 0; i < M.n; i++) { const x = J.x0 + (i + 0.5) * cell; J.data[J.row * M.n + i] = T.isLand(x, y) ? 0 : 255; }
    }
    if (J.row >= M.n) { M.data = J.data; M.x0 = J.x0; M.y0 = J.y0; M.ver++; this.maskJob = null; }
  }
  private updateHud(prof: ZoneProfile, cx: number, cy: number) {
    const H2 = this.hud, d = this.depth, near = prof.bands.find((b) => b.id === 'fog')?.from ?? 12000;
    H2.show = d > near * (prof.local ? 0.8 : 0.5) || this.swimming;
    H2.shoreDir = Math.atan2(-this.grad.y, -this.grad.x); H2.shoreDist = this.local ? this.depth : this.F.trueDepthAt(cx, cy);
    H2.spin = Math.min(1, this.k.spin + this.fogAt(cx, cy) * 0.6);
    H2.lock = this.k.mapLock > 0.5;
    H2.drainPct = this.drainRate * 100; H2.regenK = this.k.regen;
    H2.swimming = this.swimming; H2.takeoffAt = prof.swim.takeoff; H2.canTakeoff = this.game.hero.mp >= prof.swim.takeoff;
    H2.band = prof.bands.find((b) => b.id === this.band)?.name ?? ''; H2.zone = prof.name; H2.gale = Math.min(1, this.abyss / 8000);
  }

  /** 给 render.ts 的后期参数：没在险地里是 null。sx、sy 是人物在屏幕上的位置（CSS 像素） */
  post(sx: number, sy: number): SeaPost | null {
    const S = this.sea, prof = this.profile; if (!S || !prof) return null;
    const p = this.game.player, d = this.depth, K = prof.curves, gx = this.grad.x, gy = this.grad.y;
    const dv = (c: typeof K.dark) => (curveAt(c, d + 600) - curveAt(c, Math.max(0, d - 600))) / 1200;
    const dd = dv(K.dark), ds = dv(K.swell), dr = dv(K.rift);
    const near = (o: { x: number; y: number }) => Math.hypot(o.x + this.fdx - p.x, o.y + this.fdy - p.y);
    const storms = this.storms.filter((s) => s.k > 0.01).sort((a, b) => near(a) - near(b)).slice(0, 2).map((s) => ({ x: s.x + this.fdx, y: s.y + this.fdy, R: s.R, eye: s.eye, k: s.k, spin: s.spin }));
    const fogs = this.fogs.filter((f) => f.k > 0.01).sort((a, b) => near(a) - near(b)).slice(0, 3).map((f) => ({ x: f.x + this.fdx, y: f.y + this.fdy, rx: f.rx, ry: f.ry, ang: f.ang, k: f.k }));
    return {
      cx: p.x, cy: p.y, dark: this.k.dark, swell: this.k.swell, rift: this.k.rift,
      gDark: [gx * dd, gy * dd], gSwell: [gx * ds, gy * ds], gRift: [gx * dr, gy * dr],
      windX: Math.cos(S.windDir), windY: Math.sin(S.windDir), wind: S.wind,
      view: 1 - S.shroud, sx, sy, flash: this.flash, storms, fogs, mask: this.mask.ver ? this.mask : null, gale: S.abyss,
      shades: this.deep.k > 0.6 ? [] : this.game.seabeast?.shadesFor(p.x, p.y) ?? [],   // 水下的黑影（收官 B2）；人在水下时黑影就是本体（画成立板），水面的墨影不画
      under: this.deep.post(),   // 收官 B3：万丈海渊（水下的暗与光）
      moon: this.qiyu.moonK,     // 收官 B3：血月
      ...this.mediumPost(sx, sy),   // 收官 B4：介质（颜色、波形、气、安全点、浮冰、冰窟窿）
    };
  }

  // ------------------------------------------------------------ 特效（render.ts 每帧调一次，在战斗特效之后）
  drawGL(F: FxSys, _t: number, dt: number) {
    const g = this.game, p = g.player;
    if (!this.profile || !this.sea) { this.bolts.length = 0; return; }
    const t = g.time;
    const WK = this.profile.weather, VIOLET: RGB = WK.rift.c, DEEP: RGB = WK.rift.deep, WHITE: RGB = [1, 0.95, 1];
    // —— 空间裂缝
    for (const r of this.rifts) {
      const lx = r.x + this.fdx, ly = r.y + this.fdy;
      if (Math.abs(lx - p.x) > 2600 || Math.abs(ly - p.y) > 2000) continue;
      const age = t - r.t0, ux = Math.cos(r.ang), uy = Math.sin(r.ang);
      const warn = age < RIFT_WARN, close = age > RIFT_WARN + RIFT_OPEN;
      const grow = warn ? sstep(0, RIFT_WARN * 0.7, age) : 1;
      const L = r.len * grow / 2, x1 = lx - ux * L, y1 = ly - uy * L, x2 = lx + ux * L, y2 = ly + uy * L;
      if (warn) {
        const pulse = 0.55 + 0.45 * Math.sin(age * 18);
        F.bolt(x1, y1, x2, y2, r.id & 0xffff, 26, 3, VIOLET, 0.55 * pulse, 14, false, [-4, -4]);
        F.beam(x1, y1, x2, y2, 30, DEEP, 0.5 * grow, C.Beam, 0, [-2, -2]);
        F.ground(C.Crack, lx, ly, r.len * 0.55, r.ang, VIOLET, 0.35 * pulse, 1, 0.5);
      } else {
        const o = close ? 1 - sstep(RIFT_WARN + RIFT_OPEN, RIFT_WARN + RIFT_OPEN + RIFT_CLOSE, age) : sstep(RIFT_WARN, RIFT_WARN + 0.2, age);
        const wob = 1 + 0.15 * Math.sin(age * 31);
        F.beam(x1, y1, x2, y2, 150 * o * wob, DEEP, 0.85 * o, C.Beam, 0, [-40, -40]);
        F.beam(x1, y1, x2, y2, 90 * o * wob, VIOLET, 0.9 * o, C.Beam, 1, [-40, -40]);
        F.bolt(x1, y1, x2, y2, (r.id + Math.floor(age * 12)) & 0xffff, 40, 7 * o, WHITE, 0.95 * o, 16, true, [-40, -40]);
        F.ground(C.Crack, lx, ly, r.len * 0.65, r.ang, VIOLET, 0.6 * o, 1, 0.5);
        F.ground(C.Swirl, lx, ly, r.len * 0.4, age * 3, DEEP, 0.35 * o, 0, 0.5);
        if (!close && Math.random() < dt * 30) { const a = (Math.random() - 0.5) * r.len; F.sparks(lx + ux * a, ly + uy * a, VIOLET, 3, 260, 0.6, 4); }
      }
    }
    // —— 落雷：预警圈、雷柱
    for (const s of this.strikes) {
      const lx = s.x + this.fdx, ly = s.y + this.fdy, age = t - s.t0;
      if (age >= STRIKE_WARN || Math.abs(lx - p.x) > 2600 || Math.abs(ly - p.y) > 2000) continue;
      const u = age / STRIKE_WARN, pulse = 0.6 + 0.4 * Math.sin(age * 20);
      const sc = WK.strike.c;
      F.ground(C.RingSoft, lx, ly, STRIKE_R * (1.6 - 0.6 * u), age, sc, 0.5 * pulse, 1, 0.5);
      F.ground(C.Disc, lx, ly, STRIKE_R, 0, [sc[0] * 0.8, sc[1] * 0.8, sc[2] * 0.85], 0.12 + 0.2 * u, 1, 0.5);
      if (WK.strike.fx === 'bomb' && u > 0.35) { const h = (1 - u) * 1400; F.sprite(C.Glow, lx + h * 0.25, ly - h, 90, 90, 0, [1, 0.6, 0.2], 0.9, 1); F.sprite(C.Streak, lx + h * 0.32, ly - h - 120, 26, 260, 0.25, [1, 0.45, 0.1], 0.6, 1); }   // 火山弹：天上落下来的那一团火
    }
    this.bolts = this.bolts.filter((b) => (b.t += dt) < 0.35);
    for (const b of this.bolts) { const a = 1 - b.t / 0.35; if (WK.strike.fx === 'bolt') F.bolt(b.x, b.y, b.x, b.y, b.seed, 60, 9, [0.75, 0.88, 1], a, 14, true, [-1500, 0]); F.ground(C.Glow, b.x, b.y, 260, 0, WK.strike.c, a * 0.6, 1, 0.5); }
    // —— 飓风的雨与浪花
    const cxy = this.toHome(p.x, p.y);
    const w = this.windAt(cxy[0], cxy[1], { x: 0, y: 0, storm: 0, gale: 0 });
    let rainK = 0;
    for (const s of this.storms) { const dr = Math.hypot(cxy[0] - s.x, cxy[1] - s.y); if (dr < s.R * 1.1 && dr > s.eye) rainK = Math.max(rainK, s.k * (1 - sstep(s.R * 0.8, s.R * 1.1, dr))); }
    this.rainAcc += dt * (rainK * 260 + w.gale * 60) * (this.deep.k > 0.5 ? 0 : 1);
    this.weatherFx(F, rainK, w.gale, dt);
    // —— 泅水：人四周的水纹
    if (this.swimming) {
      this.rippleT -= dt;
      if (this.rippleT <= 0) { this.rippleT = 0.55; F.shockRing(p.x, p.y, 90, [0.85, 0.94, 1], 0.9, 0.5, 0.45, true); }
      F.ground(C.RingSoft, p.x, p.y, 70 + 8 * Math.sin(t * 4), 0, [0.85, 0.95, 1], 0.28, 1, 0.5);
    }
    // —— 鬼雾里的幻影：远看像岛、像船、像人影，总在视野边上若隐若现；走近就散，再在偏开一点的方向冒出来（跟着走会被带偏）
    for (const v of this.phantomStep(t)) {
      if (v.puff) { for (let i = 0; i < 6; i++) F.smoke(v.x + (H(v.id, i, 9917) - 0.5) * 200 * v.ph.s, v.y, 2, [0.12, 0.14, 0.15], 0.45, 60, 120); continue; }   // 散掉的那一缕：偏移按哈希取（不取 Math.random）
      this.drawPhantom(F, v.ph, v.x, v.y, v.a, t);
    }
    this.game.seabeast?.drawGL(F, _t, dt);   // 海兽：破水、水柱、浪圈、雷、墨雾、锚链、鲸背的灵光
    this.boat.drawGL(F, dt); this.deep.drawGL(F, dt); this.qiyu.drawGL(F, dt);   // 收官 B3：灵舟的尾迹与护罩、海渊的气泡与遗迹、鬼船的鬼火与祭坛
    this.mediumFx(F, dt);   // 收官 B4：引魂灯、林窗的天光、热浪口、冰窟窿
    this.decks(F);
  }
  /**
   * 此刻视野的半径（本图世界单位）：照后期着色器 seaShroud 的算法——清楚的那圈半径 R = mix(140, 屏幕长边 × 0.62, 视野) CSS 像素，
   * 往外 R × 0.55 + 50 像素里压暗；取「开始压暗再往外三成五」那一圈当视野边，按镜头缩放换成世界单位。
   * 鬼雾里视野塌到一成八，1600×900、缩放 0.55 时约八百。
   */
  sightR(): number {
    const view = 1 - (this.sea?.shroud ?? 0), r = this.game.renderer as { W?: number; H?: number } | undefined;
    const big = Math.max(r?.W || 1600, r?.H || 900), R = 140 + (big * 0.62 - 140) * view, edge = R + (R * 0.55 + 50) * 0.35;
    return edge / (Math.max(0.05, this.game.cam?.zoom ?? 0.62) * 0.85);   // 立体镜头下人身边一个世界单位约合缩放的 0.85 倍像素（实拍量的：离人 655 的幻影在屏幕上约 300 像素）
  }
  /**
   * 第六轮返工：鬼雾幻影。原来幻影钉在雾里的固定点、只在离人 1.7 千–4.6 千才画，而人进了鬼雾视野塌到一千上下，永远看不见。
   * 现在每个幻影只取雾里那个点的「方位」：在人视野半径的 0.7–1.3 倍处淡入淡出（立体镜头南北向压扁，按椭圆算）；
   * 人走开了它在同一方位重新浮出来（总在招手）；人走近到 0.7 倍以内就散成一缕烟，六息后在偏开三十几度的方位再冒出来——跟着走就被带着兜圈子。
   * 散过四回就不再出。只在雾里（幻影所在处的鬼雾浓度够）才画。纯画面：方位偏转按哈希取，不取 Math.random。
   */
  phantomStep(t: number, Rv = this.sightR()): { ph: Phantom; id: number; x: number; y: number; a: number; puff: boolean }[] {
    const p = this.game.player, out: { ph: Phantom; id: number; x: number; y: number; a: number; puff: boolean }[] = [];
    const YS = 0.8;   // 屏幕上南北向压扁的比例：世界里南北走同样远，屏幕上短两成
    const ring = (dx: number, dy: number) => Math.hypot(dx, dy * YS);   // 按屏幕上的远近量
    for (const fg of this.fogs) {
      if (fg.k < 0.2) continue;
      for (const ph of fg.ph) {
        if (this.goneP.has(ph.id)) continue;
        const ax = fg.x + ph.ox + this.fdx, ay = fg.y + ph.oy + this.fdy;
        let s = this.phs.get(ph.id);
        if (!s) { s = { x: 0, y: 0, born: -1e9, gone: -1e9, bend: 0, n: 0, on: false, a: 0 }; this.phs.set(ph.id, s); }
        if (!s.on) {
          if (t - s.gone < 6) continue;
          // 在锚点的方位（再加上散过几回累积的偏转）、视野边上 1.12 倍处浮出来
          const b = Math.atan2(ay - p.y, ax - p.x) + s.bend, cb = Math.cos(b), sb = Math.sin(b), k = 1.12 * Rv / Math.hypot(cb, sb * YS);
          s.x = p.x + cb * k; s.y = p.y + sb * k; s.born = t; s.on = true; s.a = 0;
        }
        const d = ring(s.x - p.x, s.y - p.y);
        if (d < 0.7 * Rv) {   // 走近了：散（没露过脸的就悄悄换个地方，不冒烟、不记次数）
          s.on = false; s.gone = t;
          if (s.a < 0.05) continue;
          s.n++; s.bend += (H(ph.id, s.n, 7741) < 0.5 ? -1 : 1) * (0.5 + 0.25 * H(ph.id, s.n, 7742));
          if (s.n >= 4) this.goneP.add(ph.id);
          out.push({ ph, id: ph.id, x: s.x, y: s.y, a: 0, puff: true });
          continue;
        }
        if (d > 1.45 * Rv) { s.on = false; s.gone = t - 6; continue; }   // 人走开了：下一帧在原方位的视野边上重新浮出
        const fogHere = this.fogAt(s.x - this.fdx, s.y - this.fdy);
        const a = fg.k * Math.min(1, fogHere * 1.6) * Math.min(1, (t - s.born) / 1.5) * sstep(1.32 * Rv, 1.1 * Rv, d) * sstep(0.7 * Rv, 0.86 * Rv, d) * (0.7 + 0.3 * Math.sin(t * 0.8 + ph.id));
        s.a = Math.max(s.a * 0.98, a);
        if (a > 0.01) out.push({ ph, id: ph.id, x: s.x, y: s.y, a, puff: false });
      }
    }
    if (this.goneP.size > 512) this.goneP.clear();
    if (this.phs.size > 256) this.phs.clear();
    return out;
  }
  /** 幻影：几笔淡墨（岛是起伏的一抹，船是船身加桅杆和帆，人是一道立着的影子） */
  private drawPhantom(F: FxSys, ph: Phantom, x: number, y: number, a: number, t: number) {
    const ink: RGB = this.profile?.weather.ghost.ink ?? [0.07, 0.09, 0.1], s = ph.s, sway = Math.sin(t * 0.6 + ph.id) * 12;
    if (ph.kind === 0) {
      for (let i = 0; i < 5; i++) { const dx = (i - 2) * 160 * s, hh = (180 - Math.abs(i - 2) * 55) * s; F.sprite(C.Smoke, x + dx + sway, y - hh * 0.45, 260 * s, hh, 0, ink, a * 0.55, 0); }
      F.ground(C.Disc, x, y, 420 * s, 0, ink, a * 0.25, 0, 0.35);
    } else if (ph.kind === 1) {
      F.sprite(C.Disc, x + sway, y - 30 * s, 340 * s, 70 * s, 0, ink, a * 0.6, 0);
      F.sprite(C.Beam, x + sway, y - 190 * s, 22 * s, 300 * s, Math.PI / 2, ink, a * 0.6, 0);
      F.sprite(C.Seal, x + 50 * s + sway, y - 190 * s, 150 * s, 200 * s, 0.08, ink, a * 0.4, 0);
    } else {
      F.sprite(C.Disc, x + sway, y - 70 * s, 46 * s, 150 * s, 0, ink, a * 0.6, 0);
      F.sprite(C.Disc, x + sway, y - 160 * s, 40 * s, 40 * s, 0, ink, a * 0.6, 0);
      F.sprite(C.Wisp, x + sway - 30, y - 90 * s, 120 * s, 40 * s, 0.4, ink, a * 0.3, 0);
    }
  }

  // ------------------------------------------------------------ 收官 B3：接口
  /**
   * 给战斗线（以及以后别的系统）的水下层入口：把 who（null = 主角）带进海面以下。被砸进海里走 combat.brawl.onSubmerge（这里已接上）；
   * 「高空一键追击俯冲」追到海面以下时调这个。返回 false 表示这里不能下潜（近岸、陆上、鲸背、不在险地里），调用方照旧处理。
   */
  dive(who: Enemy | null, x = this.game.player.x, y = this.game.player.y, depth = 220): boolean { return !!this.profile && this.profile.medium.dive && this.deep.diveIn(who, x, y, depth); }
  /** 主角此刻在不在水下层 */
  get underwater(): boolean { return this.deep.active; }
  /** 某个敌人此刻在不在水下层 */
  isUnder(e: Enemy): boolean { return this.deep.isUnder(e); }
  /** 一场飓风此刻的中心（大陆坐标）：鬼船在黑水暴的风眼里 */
  stormCenter(id: number): { x: number; y: number } | null { const s = this.storms.find((q) => q.id === id); return s ? { x: s.x, y: s.y } : null; }
  /** 交谈键（game.interact 先问这里）：鬼市摊主、说书鬼、祭坛 */
  interact(): boolean { return !!this.profile && this.qiyu.interact(); }
  /** 储物袋 / 快捷栏「使用」（game.usePill 先问这里）：灵舟、避水丹、海渊残图。返回 null 表示不归这里管 */
  useItem(id: string): boolean | null {
    if (BOATS[id]) return this.boat.useItem(id);
    if (id === 'hy_bishuidan') return this.deep.drinkWard();
    if (id === 'hy_haitu') { const R = (this.game.ws.flags as Record<string, unknown>).hyRumor as { name: string } | undefined; this.game.toast(R ? `残图上的墨线指着${R.name}——罗盘上那个「遗」字就是它的大致方位。` : '残图上的墨迹早已洇开，看不出指的是哪儿了。', 'info'); return false; }
    return null;
  }
  /** 能放进快捷栏的这几样（储物袋问） */
  usable(id: string): boolean { return !!BOATS[id] || id === 'hy_bishuidan'; }
  /** 贴地特效抬到「活动落脚面」上：鲸背、船甲板、鬼船甲板、祭坛礁盘（gl/batch.ts 的 groundQuad 问；返回离水面多高，不在上面返回 0） */
  private deckFn = (x: number, y: number, r: number): number => {
    // 只抬人脚下那一小片（施法圈、闪避、受击的地裂、涟漪）：大圈（神识圈、风暴的雨带）抬起来会整圈飘在海面上方、盖住半个画面，照旧贴着海面
    if (!this.sea || r > 700) return 0;
    const g = this.game, p = g.player, dx = Math.abs(x - p.x), dy = Math.abs(y - p.y);
    if (this.boat.aboard) return r <= 160 && dx < 90 && dy < 60 ? this.boat.deckLift() + 2 : 0;   // 船身四周那圈水纹（以船为心、更大）留在水面
    if (this.qiyu.deck) return r <= 420 && dx < 220 && dy < 120 ? (this.qiyu.deckLift() ?? 0) + 2 : 0;
    return g.seabeast.onWhale(x, y) ? 9 : 0;
  };
  private decks(F: FxSys) { const B = F.B as unknown as { deckAt?: unknown }; if (B.deckAt !== this.deckFn) B.deckAt = this.deckFn; }
  /** 渲染前（seabeast.view 里调；2D 回退在 collect2D 里调）：同伴、灵宠站到甲板上 */
  preRender() { this.boat.preRender(); this.qiyu.preRender(); }
  /** 纯 2D 回退（没有 WebGL）：鲸背、触须、蛟身、灵舟、鬼船、祭坛、遗迹画进 2D 的绘制表（render.ts 第 6 步收集单位时调） */
  collect2D(list: { y: number; k?: string; draw: () => void }[], ctx: CanvasRenderingContext2D) {
    if (!this.profile) return;
    this.preRender();
    const g = this.game, S = g.seabeast;
    list.push({ y: g.player.y - 100000, k: 'D·海（底层）', draw: () => { this.deep.draw2D(ctx); S.draw2D(ctx, 'under'); this.boat.wake2D(ctx); } });
    list.push({ y: this.boat.y - 2, k: 'D·灵舟', draw: () => this.boat.draw2D(ctx) });
    list.push({ y: this.qiyu.ship.y - 1, k: 'D·鬼船祭坛', draw: () => this.qiyu.draw2D(ctx) });
    list.push({ y: g.player.y + 1, k: 'D·海兽带子', draw: () => S.draw2D(ctx, 'over') });
  }

  // ------------------------------------------------------------ 收官 B4：介质自己的险、安全点、浮冰、天上下的东西
  /** 每帧：介质的「气」、安全点与热浪口、毒瘴 / 寒气 / 熔岩 / 陷沙掉血、冥雾拉人、热浪托举 */
  private mediumTick(prof: ZoneProfile, dt: number, cx: number, cy: number) {
    const g = this.game, p = g.player, h = g.hero, M = prof.medium;
    this.haze = prof.curves.haze ? curveAt(prof.curves.haze, this.depth) : 0;
    this.updateSpots(prof);
    let safe = 0, th = 0;
    for (const s of this.spots) { const k = 1 - sstep(s.r * 0.6, s.r, Math.hypot(p.x - s.x, p.y - s.y)); if (s.type === 3) th = Math.max(th, k); else safe = Math.max(safe, k); }
    this.safe += (safe - this.safe) * Math.min(1, dt * 4); this.thermal = th;
    if (this.holes.length) this.holes = this.holes.filter((o) => (o.t -= dt) > 0);
    // 热浪口：飞着进去，往上托（高度上限同时被托高，见 ceiling）
    if (th > 0.05 && p.flying) p.zTarget = Math.max(p.zTarget, 120 + 300 * th);
    // 毒瘴、寒气、熔岩、陷沙：按介质的「气」（以及瘴雾、冰雾的浓度）每息掉血，攒满一息结算一次（伤害走 hitPlayer）
    const fogK = this.fogAt(cx, cy);
    let rate = 0, why = '';
    if (M.toxic > 0) { rate += M.toxic * Math.max(this.haze, fogK) * (p.flying && p.z > 200 ? 0.5 : 1) * (1 - this.safe); why = `${prof.weather.ghost.name}入体，气血一点点往下掉——找瘴气散开的林窗避一避。`; }
    if (M.chill > 0) { rate += M.chill * Math.max(this.haze, fogK * 0.8) * (this.swimming ? 2.2 : 1); why = this.swimming ? '冰水刺骨，气血掉得飞快——快爬上浮冰！' : '寒气透骨，气血一点点往下掉。'; }
    if (M.burn > 0 && this.swimming) { rate += M.burn; why = '熔岩烧灼着肉身！快服回气丹起飞！'; }
    if (M.kind === 'sand' && this.swimming) {
      const k = g.input.keys, j = g.input.joy, mv = k.has('w') || k.has('a') || k.has('s') || k.has('d') || k.has('arrowup') || k.has('arrowdown') || k.has('arrowleft') || k.has('arrowright') || Math.hypot(j.x, j.y) > 0.3;
      this.sandStill = mv ? Math.max(0, this.sandStill - dt * 2) : this.sandStill + dt;
      if (this.sandStill > 2.5) { rate += 0.03; why = '流沙没过了胸口——别停在原地，挣出去！'; }
    } else this.sandStill = 0;
    rate *= HP_K[Math.max(0, Math.min(HP_K.length - 1, h.realm))];
    if (rate > 0 && !this.deep.active) {
      this.hazAcc += rate * dt; this.hazT += dt;
      if (this.hazT >= 1) {
        const ps = (g.combat as unknown as { pStats: { hp: number; def: number } }).pStats;
        g.combat.hitPlayer(this.hazAcc * ps.hp / 0.95 + ps.def * 0.8, h.realm, undefined, p.x, p.y, undefined, true);   // 毒瘴、寒气、流沙是天象，不受灵力护盾格挡
        this.hazAcc = 0; this.hazT = 0;
        if (g.time - this.hazSaid > 9) { this.hazSaid = g.time; g.toast(why, 'warn'); }
      }
    } else { this.hazAcc = 0; this.hazT = 0; }
    // 冥雾拉人：冥河的雾里（离引魂灯远），雾里的东西攥着人往雾心里拖
    if (M.kind === 'ming' && !this.boat.aboard && this.safe < 0.3) {
      let best: GhostFog | null = null, bk = 0.45;
      for (const fg of this.fogs) { const q = this.fogAt1(fg, cx, cy); if (q > bk) { bk = q; best = fg; } }
      if (best) {
        const dx = best.x - cx, dy = best.y - cy, l = Math.hypot(dx, dy) || 1, v = 90 * bk * dt, B = g.bounds;
        p.x = Math.min(B.x1, Math.max(B.x0, p.x + dx / l * v)); p.y = Math.min(B.y1, Math.max(B.y0, p.y + dy / l * v));
        this.pullT += dt; if (this.pullT > 8) { this.pullT = 0; g.toast('雾里伸出一只冰凉的手，攥着你往雾心里拖！往引魂灯那边挣！', 'warn'); }
      } else this.pullT = Math.max(0, this.pullT - dt);
    }
  }
  /** 一片雾在某点（大陆坐标）的浓度 */
  private fogAt1(g: GhostFog, cx: number, cy: number): number {
    if (g.k < 0.01) return 0;
    const dx = cx - g.x, dy = cy - g.y, c = Math.cos(g.ang), s = Math.sin(g.ang);
    return (1 - sstep(0.55, 1.05, Math.hypot((c * dx + s * dy) / g.rx, (-s * dx + c * dy) / g.ry))) * g.k;
  }
  /** 人四周的引魂灯、林窗、热浪口（按格的种子摆，人走出一格才重排） */
  private updateSpots(prof: ZoneProfile) {
    const M = prof.medium, p = this.game.player;
    const kinds = ([[M.lamps, 1, 520], [M.glades, 2, 700], [M.thermal, 3, 340]] as [number, 1 | 2 | 3, number][]).filter((q) => q[0] > 0);
    if (!kinds.length) { this.spots.length = 0; return; }
    if (this.spotsAt.id === prof.id && Math.abs(p.x - this.spotsAt.x) < SAFE_CELL && Math.abs(p.y - this.spotsAt.y) < SAFE_CELL) return;
    this.spotsAt = { x: p.x, y: p.y, id: prof.id };
    const out: SafeSpot[] = [], ci = Math.floor(p.x / SAFE_CELL), cj = Math.floor(p.y / SAFE_CELL), fog0 = prof.bands.find((b) => b.id === 'fog')?.from ?? 0;
    for (let j = cj - 3; j <= cj + 3; j++) for (let i = ci - 3; i <= ci + 3; i++) for (const [pr, type, r] of kinds) {
      const s = 0x5afe + type * 17;
      if (H(i, j, s) >= pr) continue;
      const x = (i + 0.2 + 0.6 * H(i, j, s + 1)) * SAFE_CELL, y = (j + 0.2 + 0.6 * H(i, j, s + 2)) * SAFE_CELL;
      if (this.game.terrain.isLand(x, y) || this.depthAt(x, y) < fog0 * 0.6) continue;
      out.push({ x, y, r: r * (0.85 + 0.3 * H(i, j, s + 3)), type, id: (i * 7919 + j * 104729 + type) | 0 });
    }
    this.spots = out;
  }
  /** 人附近的安全点与热浪口（测试、试玩看） */
  get spotList(): readonly SafeSpot[] { return this.spots; }
  /** 浮冰在这一深处有多密（近岸是整片冰层，越往外越碎） */
  floeCov(d: number): number {
    const f1 = this.bandFrom('fog'), f2 = this.bandFrom('core'), f3 = this.profile?.abyssFrom ?? f2 * 1.6;
    return curveAt({ at: [0, f1 * 0.5, f1, f2, f3], v: [1, 1, 0.8, 0.42, 0.18] }, d);
  }
  /** 这一点（本图坐标）是不是浮冰（能落脚）：寒渊的冰海才有；冰裂开的窟窿一阵子之内站不住 */
  onFloe(x: number, y: number): boolean {
    const P = this.profile; if (!P || !P.medium.floes || this.game.terrain.isLand(x, y)) return false;
    for (const o of this.holes) if (Math.hypot(x - o.x, y - o.y) < o.r) return false;
    return floeAt(x, y, this.floeCov(this.depthAt(x, y)));
  }
  /** 冰裂、冰锥：脚下那块浮冰碎出一个窟窿（站在上面的人掉进冰水） */
  private crackIce(x: number, y: number) {
    if (!this.profile?.medium.floes || !this.onFloe(x, y)) return;
    this.holes.push({ x, y, r: 280, t: 25 }); if (this.holes.length > 6) this.holes.shift();
    const fx = this.game.renderer?.fx; if (fx) { fx.sparks(x, y - 10, [0.85, 0.95, 1], 26, 520, 0.6, 5, -Math.PI / 2, 2.4); fx.shockRing(x, y, 260, [0.7, 0.9, 1], 0.5, 0.55, 0.8, true); }
    audio.sfx('boom');
  }
  /** 落雷那一下的样子（按天象的换皮）：雷光、沙柱、冰锥、火山弹、勾魂手、毒藤 */
  private strikeBurst(fx: FxSys, x: number, y: number) {
    const S = this.profile!.weather.strike, c = S.c;
    switch (S.fx) {
      case 'bolt': fx.flash(x, y - 30, 120, [0.75, 0.85, 1]); fx.shock(x, y, 260, 10, 0.35); fx.sparks(x, y - 20, [0.8, 0.9, 1], 18, 520, 0.5, 4); break;
      case 'geyser': fx.sparks(x, y - 10, c, 46, 980, 0.9, 7, -Math.PI / 2, 0.45); fx.smoke(x, y - 40, 6, [0.62, 0.5, 0.32], 0.5, 90, 150); fx.shock(x, y, 300, 10, 0.4); break;
      case 'icicle': fx.flash(x, y - 20, 90, [0.85, 0.95, 1]); fx.sparks(x, y - 10, [0.85, 0.95, 1], 34, 640, 0.55, 6); fx.shockRing(x, y, 220, [0.7, 0.9, 1], 0.4, 0.55, 0.9, true); break;
      case 'bomb': fx.flash(x, y - 30, 220, [1, 0.6, 0.2], 0.25); fx.sparks(x, y - 20, [1, 0.6, 0.15], 44, 760, 0.8, 6); fx.smoke(x, y - 50, 8, [0.18, 0.12, 0.1], 0.55, 110, 170); fx.shock(x, y, 360, 14, 0.45); break;
      case 'hand': fx.sparks(x, y - 10, c, 26, 420, 0.8, 5, -Math.PI / 2, 0.7); fx.smoke(x, y - 30, 5, [0.08, 0.16, 0.13], 0.5, 60, 120); fx.shockRing(x, y, 200, c, 0.5, 0.55, 0.8, true); break;
      case 'vine': fx.sparks(x, y - 10, c, 24, 460, 0.6, 5, -Math.PI / 2, 1.2); fx.smoke(x, y - 20, 4, [0.2, 0.28, 0.1], 0.45, 60, 110); fx.shock(x, y, 240, 10, 0.35); break;
    }
  }
  /** 天上下的东西：雨丝（细、斜，雨带下贴着水面溅一点细沫）、沙尘、雪、火雨、魂火、孢子；没有天象时雪、火雨这几样也按介质的「气」飘一点 */
  private weatherFx(F: FxSys, rainK: number, gale: number, dt: number) {
    const p = this.game.player, R = this.profile!.medium.rain, kind = R.kind, c = R.c;
    const amb = kind === 'rain' || kind === 'sand' ? 0 : this.haze * 26;
    this.rainAcc += dt * (rainK * 260 + gale * 60 + amb) * (this.deep.k > 0.5 ? 0 : 1);
    const wx = this.wind.x, wy = this.wind.y, wl = Math.hypot(wx, wy), ux = wl > 30 ? wx / wl : 1, uy = wl > 30 ? wy / wl : 0;
    while (this.rainAcc >= 1) {
      this.rainAcc--;
      const x = p.x + (Math.random() - 0.5) * 2600, y = p.y + (Math.random() - 0.5) * 1800, r = Math.random();
      if (kind === 'rain') {
        // 收官 B4 / 打磨：原先雨带下另有三成是大块白色水花（14→46 的水滴图），远看像碎纸片——改成细长的雨丝，水面上只溅细小的沫
        if (rainK > 0.05 && r < 0.88) F.emit({ x, y, z: -650 - Math.random() * 350, vx: wx * 0.5, vy: 2100 + wy * 0.25, life: 0.36, s0: 1.4, s1: 1.1, c, a: 0.28 + 0.24 * rainK, cell: C.Streak, stretch: 0.05 });
        else F.emit({ x, y, vx: wx * 0.4, vy: -20 + wy * 0.2, life: 0.5, s0: 3, s1: 9, c: [0.86, 0.92, 0.95], a: 0.14, add: 0, cell: C.Glow, drag: 2, grav: 90, groundMotion: true });
      } else if (kind === 'sand') {
        // 沙暴：顺风横扫的沙线，低处更密
        F.emit({ x: x - ux * 600, y, z: -40 - Math.random() * 360, vx: ux * (900 + 600 * r) + wx * 0.3, vy: uy * 500 + 40, life: 0.7, s0: 1.8, s1: 1.4, c, a: 0.3 + 0.35 * rainK, cell: C.Streak, stretch: 0.035 });
      } else if (kind === 'snow') {
        F.emit({ x, y, z: -500 - Math.random() * 400, vx: wx * 0.45 + (r - 0.5) * 60, vy: 260 + wy * 0.2, life: 1.8, s0: 3 + r * 2.5, s1: 2, c, a: 0.75, add: 0, cell: C.Disc, drag: 0.2 });
      } else if (kind === 'ember') {
        F.emit({ x, y, z: -560 - Math.random() * 300, vx: wx * 0.35 + 80, vy: 620 + wy * 0.2, life: 0.9, s0: 3.2, s1: 1.2, c: [c[0], c[1] * (0.7 + 0.5 * r), c[2]], a: 0.9, cell: C.Glow, stretch: 0.012 });
      } else if (kind === 'wisp') {
        F.emit({ x, y, z: -60 - Math.random() * 240, vx: wx * 0.2 + (r - 0.5) * 40, vy: -26, life: 3.2, s0: 4, s1: 1.5, c, a: 0.55, cell: C.Glow, drag: 0.4 });
      } else {
        F.emit({ x, y, z: -40 - Math.random() * 300, vx: wx * 0.25 + (r - 0.5) * 50, vy: -12 + (r - 0.5) * 20, life: 3, s0: 3, s1: 2, c, a: 0.6, cell: C.Glow, drag: 0.3 });
      }
    }
  }
  /** 引魂灯、林窗的天光、热浪口（安全点的样子） */
  private mediumFx(F: FxSys, dt: number) {
    if (!this.profile) return;
    const p = this.game.player, t = this.game.time;
    for (const s of this.spots) {
      if (Math.hypot(s.x - p.x, s.y - p.y) > 2800) continue;
      if (s.type === 1) {
        // 引魂灯：一盏浮在河面上的灯，灯下照开一圈雾
        const bob = Math.sin(t * 1.3 + s.id) * 10;
        F.ground(C.Glow, s.x, s.y, s.r * 0.95, 0, [0.4, 1, 0.75], 0.2, 1, 0.5);
        F.sprite(C.Glow, s.x, s.y - 120 + bob, 170, 170, 0, [0.45, 1, 0.75], 0.5, 1);
        F.sprite(C.Core, s.x, s.y - 120 + bob, 52, 64, 0, [0.85, 1, 0.9], 0.95, 1);
        if (Math.random() < dt * 2) F.emit({ x: s.x + (Math.random() - 0.5) * 60, y: s.y, z: -120, vx: (Math.random() - 0.5) * 20, vy: -40, life: 1.6, s0: 6, s1: 2, c: [0.5, 1, 0.8], a: 0.6, cell: C.Glow });
      } else if (s.type === 2) {
        // 林窗：瘴气散开、透下一片天光
        F.ground(C.Glow, s.x, s.y, s.r * 0.8, 0, [1, 0.95, 0.72], 0.09, 1, 0.5);
        if (Math.random() < dt * 2) F.emit({ x: s.x + (Math.random() - 0.5) * s.r, y: s.y + (Math.random() - 0.5) * s.r * 0.5, z: -160 - Math.random() * 260, vx: 6, vy: 14, life: 3, s0: 4, s1: 3, c: [1, 1, 0.82], a: 0.55, cell: C.Glow });
      } else {
        // 热浪口：熔岩翻涌，热气往上冲
        F.ground(C.Glow, s.x, s.y, s.r * (0.55 + 0.05 * Math.sin(t * 3 + s.id)), 0, [1, 0.55, 0.15], 0.16, 1, 0.5);
        if (Math.random() < dt * 16) F.emit({ x: s.x + (Math.random() - 0.5) * s.r, y: s.y + (Math.random() - 0.5) * s.r * 0.5, z: -20, vx: (Math.random() - 0.5) * 30, vy: -340 - Math.random() * 220, life: 1.1, s0: 5, s1: 1, c: [1, 0.6 + Math.random() * 0.3, 0.2], a: 0.85, cell: C.Glow });
      }
    }
  }
  /** 给着色器的介质参数 */
  private mediumPost(_sx: number, _sy: number): Partial<SeaPost> {
    const P = this.profile!, M = P.medium, p = this.game.player;
    const spots = this.spots.map((s) => ({ s, d: Math.hypot(s.x - p.x, s.y - p.y) })).filter((q) => q.d < 2600).sort((a, b) => a.d - b.d).slice(0, 4).map((q) => ({ x: q.s.x, y: q.s.y, r: q.s.r, type: q.s.type }));
    let floe: SeaPost['floe'] = null;
    if (M.floes) { const d = this.depth, dv = (this.floeCov(d + 600) - this.floeCov(Math.max(0, d - 600))) / 1200; floe = { cov: this.floeCov(d), g: [this.grad.x * dv, this.grad.y * dv] }; }
    return { palette: M.palette, medium: { wave: M.look.wave, emit: M.look.emit, flow: M.look.flow, haze: this.haze, mist: P.weather.ghost.mist, rain: M.rain.c, rainKind: RAIN_KIND[M.rain.kind] }, spots, floe, holes: this.holes.slice(-2).map((o) => ({ x: o.x, y: o.y, r: o.r, k: Math.min(1, o.t / 3) })) };
  }

  // ------------------------------------------------------------ 测试 / 试玩：在指定处（本图坐标）强加一场天象
  /** 一场飓风：中心 (x, y)，半径 R；会一直在那儿（不移动），存活 life 秒 */
  forceStorm(x: number, y: number, R = 3600, life = 600) {
    const f = mapFrame(ACTIVE_MAP), t = this.game.time - 40;
    this.forced.storms.push({ id: -1 - this.forced.storms.length, x0: x - f.dx, y0: y - f.dy, vx: 0, vy: 0, t0: t, life, R, eye: R * 0.12, vmax: 1000, spin: 1, x: x - f.dx, y: y - f.dy, k: 1 });
    this.scanT = 0;
  }
  forceFog(x: number, y: number, rx = 5000, ry = 2200, life = 900) {
    const f = mapFrame(ACTIVE_MAP), t = this.game.time - 40;
    const fg: GhostFog = { id: -1 - this.forced.fogs.length, x0: x - f.dx, y0: y - f.dy, vx: 0, vy: 0, t0: t, life, rx, ry, ang: 0.3, x: x - f.dx, y: y - f.dy, k: 1, ph: [] };
    for (let q = 0; q < 5; q++) { const a = q / 5 * Math.PI * 2 + 0.4; fg.ph.push({ id: -100 - q - this.forced.fogs.length * 8, kind: (q % 3) as 0 | 1 | 2, ox: Math.cos(a) * rx * 0.55, oy: Math.sin(a) * ry * 0.55, s: 1 }); }
    this.forced.fogs.push(fg); this.scanT = 0;
  }
  /** 一道裂缝：delay 秒后开始预警 */
  forceRift(x: number, y: number, ang = 0.3, len = 700, delay = 0, frac = 0.45) {
    const f = mapFrame(ACTIVE_MAP);
    this.forced.rifts.push({ id: -1000 - this.forced.rifts.length, x: x - f.dx, y: y - f.dy, ang, len, t0: this.game.time + delay, frac, tide: false });
  }
  /** 一阵裂隙潮：以 (x, y) 为心 n 道 */
  forceTide(x: number, y: number, n = 9) {
    for (let q = 0; q < n; q++) { const a = q / n * Math.PI * 2, r = 500 + 900 * ((q * 37) % 10) / 10; this.forceRift(x + Math.cos(a) * r, y + Math.sin(a) * r, q * 0.7, 450 + (q * 53) % 400, q * 0.3); }
  }
  /**
   * 试玩 / 测试（收官 B4）：从 (x0, y0)（默认图心）沿 16 个方向往外走，找离岸距离到 want 的水面点，取离起点最近的那个；
   * 都到不了就取最深的一点。closest：改取「离岸距离最接近 want」的点、只在 reach 以内找（本界的小险地从湖心往外找）。
   */
  seekDepth(want: number, x0?: number, y0?: number, closest = false, reach = 400000): { x: number; y: number; d: number } {
    const M = mapSize(ACTIVE_MAP), Wd = M.W * WORLD_SCALE, Hd = M.H * WORLD_SCALE, T = this.game.terrain;
    const ox = x0 ?? Wd / 2, oy = y0 ?? Hd / 2;
    let best: { x: number; y: number; d: number; s: number } | null = null, deepest: { x: number; y: number; d: number } | null = null;
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, ux = Math.cos(a), uy = Math.sin(a);
      for (let s = 0; s < reach; s += 300) {
        const x = ox + ux * s, y = oy + uy * s;
        if (x < 800 || y < 800 || x > Wd - 800 || y > Hd - 800) break;
        if (T.isLand(x, y)) continue;
        const d = this.depthAt(x, y);
        if (!deepest || d > deepest.d) deepest = { x, y, d };
        if (closest) { if (!best || Math.abs(d - want) < Math.abs(best.d - want)) best = { x, y, d, s }; continue; }
        if (d >= want) { if (!best || s < best.s) best = { x, y, d, s }; break; }
      }
    }
    return best ?? deepest ?? { x: ox, y: oy, d: 0 };
  }
  /**
   * 收官 B4 / 打磨：镜头跟人站的高度走多少（game.ts 的相机跟随乘在立板抬高上）——平时跟一半（飞着时地面和人都在画面里），
   * 站在鬼船甲板、船上时跟全高：甲板比海面高出一大截，只跟一半人就偏到屏幕上方去了（手机横屏尤其明显）
   */
  get camLiftK(): number {
    if (!this.qiyu.deck && !this.boat.aboard) return 0.5;
    // HD 斜着看：立板抬高 L 在画面上约等于地面上往里 L / sin(俯角) 的距离（boost = 1 / cos(俯角)），所以要多跟一截
    const b = (this.game.renderer as unknown as { hd?: { boost?: number } } | undefined)?.hd?.boost ?? 0;
    // 再多跟半个身子（约七十），对准人的胸口而不是脚底
    return (b > 1.01 ? 1 / Math.sqrt(1 - 1 / (b * b)) : 1) * (1 + 70 / Math.max(60, this.sink));
  }
  /** 当前人附近的天象（测试看） */
  get debug() { return { storms: this.storms.length, fogs: this.fogs.length, rifts: this.rifts.length, strikes: this.strikes.length }; }
}

/** 收官 B4：毒瘴、寒气、熔岩这类按比例掉血，境界高的扛得住些（凡人、炼气、筑基、结丹、元婴、化神） */
const HP_K = [1, 1, 1, 0.8, 0.55, 0.35];
const RAIN_KIND: Record<string, number> = { rain: 0, sand: 1, snow: 2, ember: 3, wisp: 4, spore: 5 };
/**
 * 浮冰：每 FLOE_CELL 一格，按格的种子决定有没有一块冰、冰心偏在哪、多大（略扁的圆）。cov 是这一处冰的疏密；
 * 近岸（cov 到顶）是整片冰层。着色器（gl/seaGlsl.ts 的 floeAt）用同一个整数哈希画出同样的冰，脚下站得住的就是看得见的那块。
 */
export function floeAt(x: number, y: number, cov: number): boolean {
  if (cov > 0.97) return true;
  const ci = Math.floor(x / FLOE_CELL), cj = Math.floor(y / FLOE_CELL);
  for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
    if (hashU(i, j, 462) >= cov) continue;
    const fx = (i + 0.2 + 0.6 * hashU(i, j, 463)) * FLOE_CELL, fy = (j + 0.2 + 0.6 * hashU(i, j, 464)) * FLOE_CELL, r = FLOE_CELL * (0.36 + 0.3 * hashU(i, j, 465));
    if (Math.hypot(x - fx, (y - fy) * 1.2) < r - 8) return true;
  }
  return false;
}
/** 一张图的宽高（世界单位） */
function shoreRect(m: MapId) { const r = shoreField.rects.find((q) => q.map === m)!; return { w: r.x1 - r.x0, h: r.y1 - r.y0 }; }
