// 无边海的海兽生态（收官 B2）。挂在 game.seabeast 上，由 jueyu.tick 每帧驱动（jueyu.ts 的末尾）。
//
// 用户要的：少数存活的海妖兽（巨型凶鱼、水怪）战力可达元婴，结丹落水极险。采纳的设计——
//   · 海里没有固定刷怪点。水下游着的是轻量的「黑影」记录（照 voidlife.ts 的 Beast：按大陆坐标的格子和种子生成、有巡游路线，不是 Enemy），
//     越深越大越凶，近海只是小鱼群的影子。黑影画在海面着色器里（gl/seaGlsl.ts 的 uShade），比人大十倍的半透明墨影。
//   · 气味：击杀留下的血、放大招的灵力波动、落水的人、挨打流的血。黑影顺着气味聚拢，聚到近处才破水——
//     水面鼓包、炸开水柱、怪跃出来，然后才是真正的 Enemy。破水不走 combat.spawnTick，也不触发模组的 spawn 钩子
//     （klkport 的 spawn 钩子有千分之二把野怪换成不会飞的傀儡，不能出现在海中央）。脱战、人离远后潜回水下变回黑影。
//   · 血腥连锁：杀了五阶以上的海兽，三十息内裂海玄蛟（八阶）从深处破水突袭；杀了蛟还会引来更多；飞得够远就甩掉。
//   · 五种新海兽：鬼齿凶鱼、墨触海魔（触须是子单位，能锁定、能斩断、会缠人）、裂海玄蛟、雾中船灵（只在鬼雾里）、雷鳐（只跟着飓风）。
//   · 覆海玄鲸：沿核心海域的大圈巡游的活岛，浮出水面时背上能落脚、打坐（微弱灵脉，核心区也回灵）、采灵草，下潜前示警。
//
// 怎么接（尽量不碰共享文件）：
//   海兽都挂 e.shell = true（drgnext 接管单位的同一个约定）：combat 的寻常 AI 跳过它们，移动、出手全在这里；
//   伤害一律走 combat.hitPlayer / hitEnemy（模组的 damage 钩子照常触发）；撞飞人走 combat.brawl.launchPlayer。
//   HD 场景里的画法（立板、触须和蛟身的带子、鲸背、雷鳐）在 hd2d/seathings.ts，这里只交出每帧的 view()；
//   黑影交给 jueyu.post() 一起进后期；特效在 drawGL（jueyu.drawGL 末尾调）。
//
// 随机数：这里一个 Math.random 都不取（全是按大陆坐标、时间、海兽种子取的哈希）；构造 Enemy 时它自己要取的那几个，
//   临时换成自己的序列（quiet），所以海上多了海兽也不扰动日结算、天气、刷怪的随机序列。画特效时粒子系统自己取的不算。
import type { Game } from './game';
import { Enemy } from './combat';
import { ENEMIES, lvRealm, type EnemyDef } from '../data/enemies';
import { ACTIVE_MAP, mapFrame } from '../data/world';
import { hashU, mulberry32 } from '../core/rng';
import { WUBIAN, type BeastSkin, type ZoneProfile } from './jueyuProfile';   // 收官 B4：别界险地的怪物表（换名、换掉落、调色）
import { gearDropId, weaponDrop, SETS } from '../data/gear';
import { itemDef } from '../data/items';
import { audio } from './audio';
import { C } from '../gl/atlas';
import type { FxSys, RGB } from '../gl/fx';
import { prof } from '../core/prof';
import { seaImg } from '../gfx/seaImg';

// ================================================================ 给画面的东西（hd2d/seathings.ts、gl/seaGlsl.ts 读）
/** 水下的黑影（本图坐标）：kind 0 鱼 · 1 鱼群 · 2 海魔 · 3 蛟 · 4 鲸；rise 0–1 是破水前水面鼓起来的程度 */
export interface SeaShade { x: number; y: number; len: number; a: number; ang: number; ph: number; kind: number; rise: number; n: number }
/** 竖着的立板：key 是贴图名（sb_guichi_2 这种），lift 离水面多高，sink 水线以下藏掉多少（世界单位，HD 场景里按水线裁） */
export interface SeaSprite { key: string; x: number; y: number; lift: number; H: number; face: number; alpha: number; flash: number; sx: number; sy: number; rot: number; glow: number;
  /** 收官 B3：整个画出来、不按水线裁（水下的东西、沉在海渊里的船） */
  noClip?: boolean;
  /** 收官 B3：调色（乘在贴图上：遗迹守卫借凶鱼的图调成石青、鬼市摊主借船灵的图）、辉光的颜色 */
  tint?: [number, number, number]; glowCol?: [number, number, number];
  /** 收官 B3：先画（大件：船身、鬼船、祭坛——站在上面的人、摊主后画，深度贴得很近时不会被船身盖住） */
  under?: boolean;
}
/** 带状网格（触须、蛟身）：pts 每点 x, y, z（本图坐标，z 是离水面的高度，负的在水下被裁掉），w 每点的半宽 */
export interface SeaRibbon { id: number; kind: 'arm' | 'jiao'; n: number; pts: Float32Array; w: Float32Array; alpha: number; flash: number; tint?: [number, number, number] }
/** 平铺的贴图（鲸背、雷鳐）：中心、离水面高度、朝向（弧度，头的方向）、宽高、wet 0–1 是海水漫上来的程度、flap 扇翅的幅度 */
export interface SeaFlat { key: string; x: number; y: number; z: number; ang: number; w: number; h: number; alpha: number; wet: number; flap: number; t: number; shake: number; tint?: [number, number, number] }
export interface SeaView { sprites: SeaSprite[]; ribbons: SeaRibbon[]; flats: SeaFlat[] }

/** 触须能缠的东西：人、下一轮（B3）的灵舟。pos 本图坐标与离水面的高度 */
export interface GrabTarget {
  kind: 'player' | 'boat';
  pos(): { x: number; y: number; z: number };
  /** 被缠住的这一帧：定身、往下拖 */
  hold(dt: number, rootX: number, rootY: number): void;
  /** 勒一下（伤害走 hitPlayer / 船的耐久） */
  hurt(raw: number, by: Enemy): void;
  /** 挣扎了多久（秒，够了就挣脱） */
  struggle(dt: number): number;
  alive(): boolean;
}

// ================================================================ 调参
/** 黑影按大陆坐标分格；每格最多两条 */
const SH_CELL = 7000, SH_REACH = 2;
/** 破水前水面鼓起多久；同时在场的海兽群上限；两次破水最少隔多久 */
const RISE_T = 1.2, MOB_CAP = 3, BREACH_GAP = 5;
/** 血腥连锁：多少息后蛟到；飞离血迹多远算甩掉 */
export const BLOOD_T = 30, BLOOD_LOSE = 5200;
/** 覆海玄鲸：巡游一圈的秒数、浮沉周期、圈的中心与半径（大陆坐标，无边海海峡正中） */
const WHALE = { loop: 1800, period: 300, cx: 675808, cy: 205000, rx: 22000, ry: 105000, w: 3000, h: 1990 };
/** 鲸背上的灵草（贴图像素坐标，图 1400×929，头朝左） */
const HERB_PX: [number, number][] = [[450, 400], [512, 432], [745, 378], [772, 522], [1005, 410], [410, 506]];
const CACHE_PX: [number, number] = [530, 335];
const BLOWHOLE_PX: [number, number] = [232, 455];

type Kind = 'guichi' | 'mochu' | 'liehai' | 'chuanling' | 'leiyao';
type Species = Kind | 'school';
const SPECIES_DEF: Record<Kind, string> = { guichi: 'sb_guichi', mochu: 'sb_mochu', liehai: 'sb_liehai', chuanling: 'sb_chuanling', leiyao: 'sb_leiyao' };
/** 黑影的长度（世界单位；人约 60 宽、108 高——大的这几种面积都在人的十倍以上） */
const SHADE_LEN: Record<Species, number> = { school: 420, guichi: 1000, mochu: 1700, liehai: 2800, chuanling: 0, leiyao: 0 };
const SHADE_KIND: Record<Species, number> = { school: 1, guichi: 1, mochu: 2, liehai: 3, chuanling: 0, leiyao: 0 };

interface Shade {
  id: number; sp: Species; cx: number; cy: number; ang: number; v: number; len: number; n: number; seed: number;
  /** 巡游路线：格心、半径、角速度、相位、路线的朝向 */
  tx: number; ty: number; R: number; w: number; ph: number; rot: number;
  mood: 'roam' | 'seek' | 'circle' | 'rise' | 'leave'; t: number; circleT: number; cool: number; rise: number;
  /** 被气味引来的那一刻（用来挑破水的位置）；summoned＝落水者招来的，不在格子里 */
  aimX: number; aimY: number; summoned?: boolean; hpFrac: number; a: number;
  /** 收官 B3：正循着落水的人游过来（同时这样追的有上限） */
  swimSeek?: boolean;
}
interface Scent { x: number; y: number; k0: number; t0: number; tau: number; kind: 'blood' | 'surge' | 'hurt' }

/** 触须 */
interface Arm {
  e: Enemy; i: number; rootA: number; L: number; st: 'rise' | 'idle' | 'whip' | 'slam' | 'grab' | 'hold' | 'cut' | 'gone'; t: number; cd: number;
  pts: Float32Array; w: Float32Array; len: number; grab: GrabTarget | null; grabHp: number; hitDone: boolean; dir: number; tipX: number; tipY: number; tipZ: number;
}
interface Mob {
  kind: Kind; e: Enemy; group: number; st: string; t: number; cd: number; seed: number; n: number;
  /** 立板沉到水线下的比例 0–1、透明度、自己的离水高度（弧线）、朝向 */
  sink: number; alpha: number; lift: number; ang: number; vx: number; vy: number;
  slot: number; away: number; quiet: number; shade: Shade | null; lastHp: number; dmgT: number;
  leap?: { x0: number; y0: number; x1: number; y1: number; t: number; dur: number; H: number; bit: boolean; z0: number };
  arms?: Arm[]; exposed?: boolean;
  path?: number[]; ribbon?: SeaRibbon; body?: { und: number };
  lamp?: Enemy | null; lampOut?: boolean;
  stormId?: number; orbitA?: number;
  aim?: { x: number; y: number; dx: number; dy: number };
  hitDone?: boolean;
}
interface Zap { x: number; y: number; t0: number; warn: number; r: number; raw: number; realm: number; src: Enemy | null; done: boolean; kind: 'thunder' | 'ray' | 'burst' }
interface Wave { x: number; y: number; t0: number; sp: number; R: number; raw: number; realm: number; src: Enemy; hit: boolean }
interface Chain { x0: number; y0: number; x: number; y: number; vx: number; vy: number; t: number; st: 'fly' | 'pull' | 'back'; src: Mob; life: number }
interface Ink { x: number; y: number; t0: number; life: number; r: number }
interface FxEv { k: 'splash' | 'column' | 'bubbles' | 'burst' | 'ring' | 'spout' | 'ink' | 'mist' | 'gather' | 'bolt'; x: number; y: number; s: number; z?: number; x2?: number; y2?: number }

const smooth01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const sstep = (a: number, b: number, x: number) => smooth01((x - a) / (b - a));
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const H = (a: number, b: number, s: number) => hashU(a | 0, b | 0, s | 0);
/** 构造 Enemy 时它自己要取几个 Math.random（id、出手间隔……）：临时换成自己的序列，海上多了海兽也不扰动别处的随机序列 */
function quiet<T>(seed: number, f: () => T): T { const r = Math.random; Math.random = mulberry32(seed | 0); try { return f(); } finally { Math.random = r; } }

export class SeaBeasts {
  /** 测试用：整套关掉 */
  off = false;
  /** 测试 / 量性能：海魔固定伸几条触须（0 = 按种子四到六条） */
  debugArms = 0;
  /** 试玩 / 测试：鲸的时钟拨快几秒（只影响鲸） */
  whaleShift = 0;
  /** HD 场景里的网格（hd2d/seathings.ts）贴图都好了：海兽不再进共享的立板图集（render.ts 每帧写） */
  hdReady = false;
  /** 黑影（大陆坐标） */
  shades: Shade[] = [];
  mobs: Mob[] = [];
  scents: Scent[] = [];
  /** 血腥连锁：血迹处（大陆坐标）、起算时刻、这一波来几条 */
  chain: { cx: number; cy: number; t0: number; n: number; T: number; warned: boolean } | null = null;
  /** 泅水了多久 */
  swimT = 0;
  /** 墨雾把视野压下去的程度 0–1（jueyu.updateSea 读） */
  ink = 0;
  /** 鲸 */
  whale = { cx: 0, cy: 0, x: 0, y: 0, ang: 0, st: 'under' as 'up' | 'warn' | 'dive' | 'under' | 'rise', k: 0, wet: 0, startle: -1e9, onBack: false, sitBonus: 0, gatherI: -1, gatherT: 0, spoutT: 0, warnedAt: -1, lastX: NaN, lastY: NaN, lastA: 0 };
  /** 界面（罗盘旁的提示读它） */
  hud = { lurk: 0, blood: 0, bloodN: 0, whaleDir: 0, whaleDist: Infinity, whaleUp: false, whaleWarn: false, held: 0 };
  private zaps: Zap[] = []; private waves: Wave[] = []; private chains: Chain[] = []; private inks: Ink[] = [];
  private fxq: FxEv[] = [];
  private gone = new Map<number, number>();
  private seenDead = new WeakSet<Enemy>();
  private mine = new WeakMap<Enemy, Mob>();
  private scanT = 0; private breachCd = 0; private groupN = 0; private summonT = 0;
  private fdx = 0; private fdy = 0; private mp0 = -1; private hp0 = -1;
  private wraithCd = 0; private rayCd = 0; private rayStorm = 0;
  private push = { vx: 0, vy: 0, t: 0 };
  /** 被打散、等着在雾的另一头重聚的船灵 */
  private reforms: { t: number; seed: number }[] = [];
  /** 这一趟出海杀了几条蛟（越杀引来的越多；回到近海清零） */
  private jiaoKills = 0;
  private player: GrabTarget;
  private struggleT = 0;
  private lurkHinted = false;
  /** 收官 B3：祭坛的「辟兽」余效（秒）：黑影不破水、在场的海兽潜走 */
  repelT = 0;
  /** 收官 B3：泅水时被触须缠了多久（缠久了拖进海渊） */
  private heldSwimT = 0;

  constructor(readonly game: Game) {
    const g = game;
    this.player = {
      kind: 'player',
      pos: () => ({ x: g.player.x, y: g.player.y, z: g.player.z }),
      hold: (dt, rx, ry) => {
        const p = g.player, c = g.combat;
        c.pst.root = { t: Math.max(c.pst.root?.t ?? 0, 0.25), dps: 0 };
        // 往下拖：飞着的人被拽向水面，拽进水里就成了泅水
        if (p.flying) { p.zTarget = 0; p.z = Math.max(0, p.z - 110 * dt); if (p.z < 6 && !g.jueyu.onWater(p.x, p.y).stand && g.terrain.isLand(p.x, p.y) === false) { p.flying = false; p.boosting = false; this.say('触须把你硬生生拖进了海里！', 'warn'); } }
        // 慢慢往根上拽
        const dx = rx - p.x, dy = ry - p.y, d = Math.hypot(dx, dy);
        if (d > 160) { p.x += dx / d * 60 * dt; p.y += dy / d * 60 * dt; }
        if (p.sitting) g.stand();
        // 收官 B3：泅水时被缠住太久，就被拖进海渊（水下照样能砍断它、挣脱）
        if (g.jueyu.swimming) { this.heldSwimT += dt; if (this.heldSwimT > 2.8) { this.heldSwimT = 0; g.jueyu.deep.pullUnder(220, '触须缠着你往下一沉——海水灌进耳朵，四周一下子暗了！'); } }
        else if (g.jueyu.deep.active) g.jueyu.deep.d = Math.min(g.jueyu.deep.floor, g.jueyu.deep.d + 60 * dt);
      },
      hurt: (raw, by) => g.combat.hitPlayer(raw, by.realm, undefined, by.x, by.y, by),
      struggle: (dt) => {
        const k = g.input.keys, j = g.input.joy;
        const want = k.has('w') || k.has('a') || k.has('s') || k.has('d') || k.has('arrowup') || k.has('arrowdown') || k.has('arrowleft') || k.has('arrowright') || Math.hypot(j.x, j.y) > 0.3;
        if (want) this.struggleT += dt; return this.struggleT;
      },
      alive: () => !g.hero.dead,
    };
    // 鲸背：浮着的时候能落脚（jueyu 的 footholds，泅水、起降、走动都问它）
    g.jueyu.footholds.push((x, y) => this.onWhale(x, y));
  }

  /** 换图、读档、新开局 */
  reset() {
    for (const m of this.mobs) this.dropEnemy(m);
    this.shades = []; this.mobs = []; this.scents = []; this.chain = null; this.swimT = 0; this.ink = 0;
    this.zaps = []; this.waves = []; this.chains = []; this.inks = []; this.fxq = []; this.gone.clear();
    this.scanT = 0; this.breachCd = 0; this.summonT = 0; this.mp0 = -1; this.hp0 = -1; this.push.t = 0; this.struggleT = 0;
    this.reforms = []; this.jiaoKills = 0; this.wraithCd = 0; this.rayCd = 0;
    const f = mapFrame(ACTIVE_MAP); this.fdx = f.dx; this.fdy = f.dy;
    this.whale.lastX = NaN; this.whale.onBack = false; this.whalePose();
    this.hud.lurk = 0; this.hud.blood = 0; this.hud.held = 0;
  }
  /** 不在险地里（陆上、秘境、虚空）：海兽潜走，界面收起 */
  idle() {
    if (this.mobs.length) { for (const m of this.mobs) this.dropEnemy(m); this.mobs = []; }
    if (this.shades.length) this.shades = [];
    this.chain = null; this.ink = 0; this.hud.lurk = 0; this.hud.blood = 0; this.hud.whaleDist = Infinity; this.hud.whaleWarn = false; this.hud.held = 0;
    this.whale.onBack = false;
  }

  // ================================================================ 小工具
  private get t() { return this.game.time; }
  private rnd(m: { seed: number; n: number }) { return H(m.seed, m.n++, 9917); }
  private toLocal(cx: number, cy: number): [number, number] { return [cx + this.fdx, cy + this.fdy]; }
  private toHome(x: number, y: number): [number, number] { return [x - this.fdx, y - this.fdy]; }
  private fx(k: FxEv['k'], x: number, y: number, s: number, extra: Partial<FxEv> = {}) { if (this.fxq.length < 96) this.fxq.push({ k, x, y, s, ...extra }); }
  /** 收官 B4：当前险地的怪物表（无边海、沧海是 null＝原样） */
  private get skin(): Record<Kind, BeastSkin> | null { return (this.game.jueyu.profile?.beasts as Record<Kind, BeastSkin> | null | undefined) ?? null; }
  private get prof(): ZoneProfile { return this.game.jueyu.profile ?? WUBIAN; }
  /** 收官 B4：提示里的海兽、海面换成这一处险地的说法（原话写的是无边海） */
  private say(s: string, tone: Parameters<Game['toast']>[1]) { this.game.toast(this.reskin(s), tone); }
  private reskin(s: string): string {
    const K = this.skin, P = this.prof; if (!K) return s;
    const M = P.medium, surf: Record<string, string> = { sand: '沙面', ice: '冰海', lava: '熔岩', ming: '河面', miasma: '泽面' };
    const lamp = ({ sand: '蜃珠', ice: '冰魄心灯', lava: '火灵心焰', ming: '渡魂灯', miasma: '瘴魅灯' } as Record<string, string>)[M.kind] ?? '魂灯';
    const arm = ({ sand: '流沙触', ice: '冰触', lava: '熔岩触', ming: '冥手', miasma: '巨藤' } as Record<string, string>)[M.kind] ?? '触须';
    const R: [string, string][] = [
      ['雨幕里掠过几道带着电光的影子——雷鳐循着雷暴来了！', `${P.weather.storm.name}里掠过几道影子——${K.leiyao.name}循着${P.weather.storm.name}来了！`],
      ['雾里亮起一点幽绿的灯火，一道披着破帆的影子提着灯飘了过来——雾中船灵。', `${P.weather.ghost.name}里亮起一点灯火，一道影子提着灯飘了过来——${K.chuanling.name}。`],
      ['鬼齿凶鱼', K.guichi.name], ['墨触海魔', K.mochu.name], ['海魔', K.mochu.name], ['裂海玄蛟', K.liehai.name], ['玄蛟', K.liehai.name],
      ['雾中船灵', K.chuanling.name], ['船灵', K.chuanling.name], ['魂灯', lamp], ['雷鳐', K.leiyao.name], ['触须', arm],
      ['海面', surf[M.kind] ?? '海面'], ['海水', M.name], ['海里', M.name + '里'], ['水下', M.name + '下'], ['水面', surf[M.kind] ?? '水面'], ['黑水', M.name], ['深海', '深处'],
    ];
    for (const [a, b] of R) s = s.split(a).join(b);
    return s;
  }
  /** 收官 B4：掉落换成这一处险地的材料（常见的、稀有的） */
  private dropId(id: string): string {
    const K = this.skin; if (!K) return id;
    return id === 'mat_sb_jiaolin' || id === 'mat_sb_jiaojiao' || id === 'mat_sb_hundeng' ? K.guichi.rare : K.guichi.drop;
  }
  /** 这一点是不是开阔的海（不是岛、不是浅滩边上） */
  private openSea(x: number, y: number) { return !this.game.terrain.isLand(x, y) && this.game.jueyu.depthAt(x, y) > 2500; }
  /** 是不是海兽（自己这套的） */
  isMine(e: Enemy) { return this.mine.has(e); }
  /**
   * 这只海兽此刻在不在水下（给下一轮 B3 的海渊、砸海用）：潜下去的蛟、正在下潜的、沉到水线以下的都算。
   * 水下的黑影本身就是「在水下」的海兽（shades），破水之前没有 Enemy。
   */
  submerged(e: Enemy): boolean { const m = this.mine.get(e); if (!m) return false; return m.st === 'under' || m.st === 'diveDown' || m.st === 'dive' || m.sink > 0.9; }

  // ================================================================ 每帧
  tick(dt: number) { const _p = prof.t(); this.tickInner(dt); prof.add('U·海兽', _p); }
  private tickInner(dt: number) {
    const g = this.game, J = g.jueyu, p = g.player;
    if (this.off || !J.profile || !J.sea || g.offWorld || g.inCave || g.hero.dead) { if (this.off || !J.profile) this.idle(); else { if (!J.sea && (this.hud.held || this.mobs.length || this.ink > 0)) this.idle();   /* 人离了海（被救回岸上、遁走）：缠人的提示、墨、还挂着的海兽一并收掉，原先人回了岸「被触须缠住了」还挂在屏幕上 */ this.whaleTick(dt); } return; }
    // 换了图（飞过中线）：自己记的本图坐标跟着平移（敌人本身由 game.crossSeam 搬）
    const f = mapFrame(ACTIVE_MAP);
    if (f.dx !== this.fdx || f.dy !== this.fdy) this.shift(f.dx - this.fdx, f.dy - this.fdy);
    const t = this.t;
    this.breachCd = Math.max(0, this.breachCd - dt);
    // 收官 B3：辟兽——在场的海兽潜走
    if (this.repelT > 0) { this.repelT = Math.max(0, this.repelT - dt); for (const m of this.mobs) if (m.st !== 'dive' && m.kind !== 'chuanling' && m.kind !== 'leiyao' && !m.e.dead) this.startDive(m); }
    // —— 气味
    this.scentTick(dt);
    // —— 黑影
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 0.5; this.populate(); }
    this.shadeTick(dt);
    // —— 海兽
    for (const m of this.mobs) this.mobTick(m, dt);
    this.mobs = this.mobs.filter((m) => m.st !== 'gone');
    // —— 招式的余波：雷、浪、锚链、墨雾
    this.hazardTick(dt);
    // —— 血腥连锁、鬼雾里的船灵、飓风里的雷鳐
    this.chainTick(dt);
    this.wraithSpawn(dt);
    this.raySpawn(dt);
    // —— 鲸
    this.whaleTick(dt);
    // —— 被推（浪、尾巴）
    if (this.push.t > 0) {
      this.push.t -= dt;
      const B = g.bounds;
      p.x = Math.min(B.x1, Math.max(B.x0, p.x + this.push.vx * dt)); p.y = Math.min(B.y1, Math.max(B.y0, p.y + this.push.vy * dt));
    }
    // —— 界面
    let lurk = 0;
    for (const s of this.shades) {
      if (s.len < 800 || s.mood === 'leave') continue;
      const [x, y] = this.toLocal(s.cx, s.cy), d = Math.hypot(x - p.x, y - p.y);
      lurk = Math.max(lurk, (1 - sstep(900, 2600, d)) * Math.min(1, s.a * 1.6));
    }
    this.hud.lurk = lurk;
    if (lurk > 0.5 && !this.lurkHinted) { this.lurkHinted = true; g.hint('sea-lurk', this.reskin('脚下的海水暗了一大片——有什么庞然大物正在水下打转。别流血、别落水，它是循着气味来的。')); }
    this.hud.blood = this.chain ? Math.max(0, 1 - (t - this.chain.t0) / this.chain.T) : 0;
    this.hud.bloodN = this.chain?.n ?? 0;
    this.ink += ((this.inkAt(p.x, p.y)) - this.ink) * Math.min(1, dt * 3);
    if (this.fxq.length > 96) this.fxq.splice(0, this.fxq.length - 96);
  }

  private shift(dx: number, dy: number) {
    this.fdx += dx; this.fdy += dy;
    for (const m of this.mobs) {
      if (m.leap) { m.leap.x0 += dx; m.leap.y0 += dy; m.leap.x1 += dx; m.leap.y1 += dy; }
      if (m.path) for (let i = 0; i < m.path.length; i += 2) { m.path[i] += dx; m.path[i + 1] += dy; }
      if (m.arms) for (const a of m.arms) { for (let i = 0; i < a.pts.length; i += 3) { a.pts[i] += dx; a.pts[i + 1] += dy; } a.tipX += dx; a.tipY += dy; }
      if (m.aim) { m.aim.x += dx; m.aim.y += dy; }
      if (m.lamp && !this.game.combat.enemies.includes(m.lamp)) { m.lamp.x += dx; m.lamp.y += dy; }
    }
    for (const z of this.zaps) { z.x += dx; z.y += dy; }
    for (const w of this.waves) { w.x += dx; w.y += dy; }
    for (const c of this.chains) { c.x += dx; c.y += dy; c.x0 += dx; c.y0 += dy; }
    for (const k of this.inks) { k.x += dx; k.y += dy; }
    this.whale.lastX += dx; this.whale.lastY += dy;
  }

  // ================================================================ 气味
  private scentTick(dt: number) {
    const g = this.game, t = this.t, p = g.player, h = g.hero, J = g.jueyu;
    // 击杀留下的血（敌人死后在名单里还留 0.8 息，逐帧扫一遍就不会漏）
    for (const e of g.combat.enemies) {
      if (!e.dead || this.seenDead.has(e)) continue;
      this.seenDead.add(e);
      if (e.spar || e.gone) continue;
      const mob = this.mine.get(e);
      if (mob) this.onMobDead(mob, e);
      if (g.terrain.isLand(e.x, e.y)) continue;
      const [cx, cy] = this.toHome(e.x, e.y);
      this.scents.push({ x: cx, y: cy, k0: Math.min(2.6, 0.6 + 0.22 * (e.blv || e.realm * 2)), t0: t, tau: 26, kind: 'blood' });
      // 血腥连锁：五阶以上的海兽，死在迷雾断层往里
      const seaBeast = e.sea || e.def.zone === 'sea' || !!mob;
      if (seaBeast && e.blv >= 5 && !e.def.id.endsWith('_xu') && !e.def.id.endsWith('_deng') && J.depthAt(e.x, e.y) >= J.bandFrom('fog') && this.prof.mix.liehai > 0) this.startChain(cx, cy, e.def.id === 'sb_liehai' || mob?.kind === 'liehai');
    }
    // 放大招的灵力波动：一帧里法力掉了一大截（流失是细水长流，不会一下掉这么多）
    if (this.mp0 >= 0 && this.mp0 - h.mp > 0.08 && !p.boosting) { const [cx, cy] = this.toHome(p.x, p.y); this.scents.push({ x: cx, y: cy, k0: Math.min(2, (this.mp0 - h.mp) * 7), t0: t, tau: 14, kind: 'surge' }); }
    this.mp0 = h.mp;
    // 挨打流的血
    if (this.hp0 >= 0 && this.hp0 - h.hp > 0.06 && !g.terrain.isLand(p.x, p.y)) { const [cx, cy] = this.toHome(p.x, p.y); this.scents.push({ x: cx, y: cy, k0: Math.min(1.4, (this.hp0 - h.hp) * 5), t0: t, tau: 18, kind: 'hurt' }); }
    this.hp0 = h.hp;
    // 落水的人：泅水越久，气味越浓
    this.swimT = J.swimming ? this.swimT + dt : Math.max(0, this.swimT - dt * 3);
    if (J.depth < J.bandFrom('fog') * 0.75) this.jiaoKills = 0;
    this.scents = this.scents.filter((s) => s.k0 * Math.exp(-(t - s.t0) / s.tau) > 0.05);
    if (this.scents.length > 40) this.scents.splice(0, this.scents.length - 40);
  }
  /** 此刻最引它的那股气味（大陆坐标）：返回位置与强度；泅水的人算一股跟着人走的气味 */
  private bestScent(cx: number, cy: number, swimOk = true): { x: number; y: number; k: number; swim: boolean } | null {
    const t = this.t, g = this.game;
    let best: { x: number; y: number; k: number; swim: boolean } | null = null, bw = 0;
    for (const s of this.scents) {
      const k = s.k0 * Math.exp(-(t - s.t0) / s.tau), d = Math.hypot(s.x - cx, s.y - cy);
      if (d > 3000 + 3000 * Math.min(2, k)) continue;
      const w = k / (1 + d / 4000);
      if (w > bw) { bw = w; best = { x: s.x, y: s.y, k, swim: false }; }
    }
    if (g.jueyu.deep.active) {   // 收官 B3：人在水下——就在它们的地盘上，离得近的都闻得到
      const [px, py] = this.toHome(g.player.x, g.player.y), k = 0.8 + Math.min(1.2, g.jueyu.deep.d / 1500), d = Math.hypot(px - cx, py - cy);
      if (d < 1800 + 1200 * k) { const w = k / (1 + d / 4000) * 0.9; if (w > bw) { bw = w; best = { x: px, y: py, k, swim: true }; } }
    }
    if (swimOk && g.jueyu.swimming && this.swimT > 0.6) {   // 刚掉进去那一下不算（换图那一帧的误判也不会招来东西）
      const [px, py] = this.toHome(g.player.x, g.player.y), k = 0.6 + Math.min(1.6, this.swimT / 25), d = Math.hypot(px - cx, py - cy);
      if (d < 3000 + 3000 * k) { const w = k / (1 + d / 4000) * 1.4; if (w > bw) { bw = w; best = { x: px, y: py, k, swim: true }; } }
    }
    return best;
  }

  // ================================================================ 黑影
  /** 人四周 5×5 格：按格子的种子摆出黑影（没摆过的补上，远了的收掉） */
  private populate() {
    const g = this.game, [pcx, pcy] = this.toHome(g.player.x, g.player.y), t = this.t;
    const ci = Math.floor(pcx / SH_CELL), cj = Math.floor(pcy / SH_CELL);
    const have = new Set(this.shades.map((s) => s.id));
    for (let j = cj - SH_REACH; j <= cj + SH_REACH; j++) for (let i = ci - SH_REACH; i <= ci + SH_REACH; i++) {
      const cx = (i + 0.5) * SH_CELL, cy = (j + 0.5) * SH_CELL, d = this.game.jueyu.homeDepth(cx, cy);
      if (d < 2500) continue;
      for (let slot = 0; slot < 2; slot++) {
        const id = (Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ (slot * 83492791)) >>> 1;   // 格子里的取非负，招来的、试玩放的用负数
        if (have.has(id)) continue;
        const gone = this.gone.get(id); if (gone !== undefined && t < gone) continue;
        const sp = this.speciesAt(i, j, slot, d); if (!sp) continue;
        const s = this.makeShade(id, sp, i, j, slot);
        // 只在当前位置也是开阔海面时出来（岛边不出）
        if (this.game.jueyu.homeDepth(s.cx, s.cy) < 2000) continue;
        this.shades.push(s); have.add(id);
      }
    }
    // 远了的收掉（被招来的、正盯着人的留着）
    this.shades = this.shades.filter((s) => {
      const far = Math.abs(s.cx - pcx) > SH_CELL * (SH_REACH + 1.5) || Math.abs(s.cy - pcy) > SH_CELL * (SH_REACH + 1.5);
      return !far || (s.mood !== 'roam' && s.mood !== 'leave' && Math.hypot(s.cx - pcx, s.cy - pcy) < 26000);
    });
    if (this.gone.size > 400) for (const [k, v] of this.gone) if (v < t) this.gone.delete(k);
  }
  private speciesAt(i: number, j: number, slot: number, d: number): Species | null {
    const u = H(i, j, 7101 + slot * 13), v = H(i, j, 7102 + slot * 13);
    const P = this.prof, f1 = P === WUBIAN ? 12000 : P.bands.find((b) => b.id === 'fog')!.from, f2 = P === WUBIAN ? 34000 : P.bands.find((b) => b.id === 'core')!.from;
    if (d < f1) return slot === 0 && u < 0.5 ? 'school' : null;
    if (P !== WUBIAN) {
      // 收官 B4：别界的险地按配置的轻重（mix）挑；同一格同一个种子，所以每次去都一样
      const M = P.mix, pick = (w: [Species, number][]) => { const s = w.reduce((a, q) => a + q[1], 0); let x = v * s; for (const [k, q] of w) { if (x < q) return k; x -= q; } return w[w.length - 1][0]; };
      if (d < f2) { if (slot === 1 ? u > 0.25 : u > 0.75) return null; return pick([['guichi', 0.6 * M.guichi], ['mochu', (d > f1 + (f2 - f1) * 0.27 ? 0.3 : 0) * M.mochu], ['school', 0.1]]); }
      if (slot === 1 ? u > 0.35 : u > 0.85) return null;
      return pick([['guichi', 0.35 * M.guichi], ['mochu', 0.4 * M.mochu], ['liehai', 0.13 * M.liehai], ['school', 0.12]]);
    }
    if (d < 34000) { if (slot === 1 ? u > 0.25 : u > 0.75) return null; return v < 0.6 ? 'guichi' : v < 0.9 && d > 18000 ? 'mochu' : 'school'; }
    if (slot === 1 ? u > 0.35 : u > 0.85) return null;
    return v < 0.35 ? 'guichi' : v < 0.75 ? 'mochu' : v < 0.88 ? 'liehai' : 'school';
  }
  private makeShade(id: number, sp: Species, i: number, j: number, slot: number): Shade {
    const s0 = 7200 + slot * 31, hh = (k: number) => H(i, j, s0 + k);
    const R = 1200 + 1600 * hh(1), v = sp === 'school' ? 220 + 120 * hh(2) : sp === 'liehai' ? 160 : sp === 'mochu' ? 90 + 50 * hh(2) : 150 + 80 * hh(2);
    const sh: Shade = {
      id, sp, cx: 0, cy: 0, ang: 0, v, len: SHADE_LEN[sp] * (0.85 + 0.3 * hh(3)), n: sp === 'school' ? 5 + Math.floor(hh(4) * 4) : sp === 'guichi' ? 3 + Math.floor(hh(4) * 3) : 1, seed: id,
      tx: (i + 0.25 + 0.5 * hh(5)) * SH_CELL, ty: (j + 0.25 + 0.5 * hh(6)) * SH_CELL, R, w: v / R * (hh(7) < 0.5 ? 1 : -1), ph: hh(8) * Math.PI * 2, rot: hh(9) * Math.PI,
      mood: 'roam', t: 0, circleT: 0, cool: 0, rise: 0, aimX: 0, aimY: 0, hpFrac: 1, a: 0,
    };
    const q = this.trackAt(sh, this.t); sh.cx = q.x; sh.cy = q.y; sh.ang = q.ang;
    return sh;
  }
  /** 巡游路线上此刻的位置（按时间算：两张图看到的是同一条） */
  private trackAt(s: Shade, t: number) {
    const a = s.w * t + s.ph, c = Math.cos(s.rot), sn = Math.sin(s.rot);
    const lx = Math.cos(a) * s.R, ly = Math.sin(a) * s.R * 0.6;
    const vx = -Math.sin(a) * s.R * s.w, vy = Math.cos(a) * s.R * 0.6 * s.w;
    return { x: s.tx + lx * c - ly * sn, y: s.ty + lx * sn + ly * c, ang: Math.atan2(vx * sn + vy * c, vx * c - vy * sn) };
  }
  private shadeTick(dt: number) {
    const g = this.game, p = g.player, [pcx, pcy] = this.toHome(p.x, p.y), t = this.t;
    const pOverSea = !g.terrain.isLand(p.x, p.y);
    // 落水的人：越久招来的越多、越大
    if (g.jueyu.swimming && g.jueyu.depth > g.jueyu.bandFrom('fog') * 0.75 && this.swimT > 1.5) {
      this.summonT -= dt;
      const coming = this.shades.filter((s) => s.summoned && s.mood !== 'leave').length;
      // 收官 B3 调参：原来「2 + 泅水秒数 / 15」条在路上、最快五息招一条——结丹落水十息就围上十来条凶鱼，几乎必死。
      // 改成「极险但有一线生机」：头二十息只招一群（而且是两三条的小群，见 breach），之后每二十息多一群、最多三群同时在路上，
      // 招来的间隔最快八息。落水的人因此有十几息的窗口：嗑回气丹起飞、祭灵舟、同伴来救、或者拼死砍翻第一群。
      if (this.summonT <= 0 && coming < Math.min(3, 1 + Math.floor(this.swimT / 20))) {
        this.summonT = Math.max(8, 16 - this.swimT / 6);
        const n = this.shades.length + Math.floor(t * 10), a = H(n, 3, 7301) * Math.PI * 2, r = 3600 + 1400 * H(n, 4, 7302);
        let sp: Species = this.swimT < 15 ? 'guichi' : this.swimT < 40 ? (H(n, 5, 7303) < 0.55 ? 'guichi' : 'mochu') : (H(n, 5, 7303) < 0.5 ? 'mochu' : 'liehai');
        if (sp === 'liehai' && this.prof.mix.liehai <= 0) sp = 'mochu';   // 收官 B4：本界的小险地没有霸主
        const s = this.makeShade(-(1 + n), sp, Math.floor(pcx / SH_CELL), Math.floor(pcy / SH_CELL), 3);
        s.cx = pcx + Math.cos(a) * r; s.cy = pcy + Math.sin(a) * r; s.summoned = true; s.mood = 'seek'; s.a = 0;
        if (this.game.jueyu.homeDepth(s.cx, s.cy) > 2500) this.shades.push(s);
      }
    } else this.summonT = Math.min(this.summonT, 6);
    let swimSlots = 1 + Math.floor(this.swimT / 12) - this.shades.filter((s) => s.swimSeek && s.mood === 'seek').length;
    for (const s of this.shades) {
      s.t += dt; s.cool = Math.max(0, s.cool - dt);
      s.a += ((s.mood === 'leave' ? 0 : 1) - s.a) * Math.min(1, dt * 0.8);
      if (s.mood === 'rise') { this.riseTick(s, dt); continue; }
      const dP = Math.hypot(s.cx - pcx, s.cy - pcy);
      // 收官 B3 调参：落水的人的气味——原先附近每一条黑影都循着游过来（结丹落水十息就十来条）。同时循着它来的限成「1 + 泅水秒数 / 12」条：
      // 十息时一条、四十息时四条；别的照旧巡游。见下面 shadeTick 开头的 swimSlots
      const sc = s.sp === 'school' || s.cool > 0 || this.repelT > 0 ? null : this.bestScent(s.cx, s.cy, s.swimSeek || swimSlots > 0);   // 收官 B3：祭坛的「辟兽」
      if (sc?.swim && !s.swimSeek) { s.swimSeek = true; swimSlots--; } else if (!sc?.swim) s.swimSeek = false;
      let gx: number, gy: number, sp: number;
      if (s.mood === 'leave') {
        const q = this.trackAt(s, t); gx = q.x; gy = q.y; sp = s.v * 1.6;
        if (Math.hypot(q.x - s.cx, q.y - s.cy) < 300 && s.a < 0.2) { s.mood = 'roam'; s.cool = 30; }
        if (s.summoned && s.a < 0.05) s.mood = 'roam';
      } else if (sc) {
        s.mood = 'seek'; gx = sc.x; gy = sc.y; sp = s.sp === 'liehai' ? 640 : s.sp === 'mochu' ? 380 : 520;
        // 聚到近处、人也在旁边：破水
        const dS = Math.hypot(sc.x - s.cx, sc.y - s.cy);
        if (dS < 900 && dP < 2400 && pOverSea && this.canBreach(s)) { this.startRise(s, sc.swim); continue; }
      } else if (s.circleT > 0) {
        // 威慑：绕着人慢慢打转
        s.circleT -= dt; s.mood = 'circle';
        const a = Math.atan2(s.cy - pcy, s.cx - pcx) + 0.35, r = 520 + s.len * 0.15;
        gx = pcx + Math.cos(a) * r; gy = pcy + Math.sin(a) * r; sp = s.v * 1.8;
        if (s.circleT <= 0 || !pOverSea) { s.mood = 'leave'; s.cool = 60; }
      } else {
        s.mood = 'roam';
        if (s.len >= 900 && s.cool <= 0 && dP < 1500 && pOverSea && !s.summoned) { s.circleT = 16 + 10 * H(s.id, Math.floor(t / 60), 7310); s.cool = 0; }
        const q = this.trackAt(s, t); gx = q.x; gy = q.y; sp = s.v * (Math.hypot(q.x - s.cx, q.y - s.cy) > 200 ? 1.8 : 1);
        if (s.summoned) { s.mood = 'leave'; }
      }
      const dx = gx - s.cx, dy = gy - s.cy, d = Math.hypot(dx, dy);
      if (d > 1) {
        const want = Math.atan2(dy, dx), turn = (s.sp === 'liehai' ? 0.7 : 1.4) * dt;
        s.ang += Math.max(-turn, Math.min(turn, angDiff(s.ang, want)));
        const step = Math.min(d, sp * dt * (0.4 + 0.6 * Math.max(0, Math.cos(angDiff(s.ang, want)))));
        s.cx += Math.cos(s.ang) * step; s.cy += Math.sin(s.ang) * step;
      }
    }
  }
  private canBreach(s: Shade): boolean {
    if (this.breachCd > 0 || s.sp === 'school') return false;
    const groups = new Set(this.mobs.filter((m) => m.kind !== 'liehai' && m.kind !== 'chuanling' && m.kind !== 'leiyao').map((m) => m.group)).size;
    if (s.sp === 'liehai') return this.mobs.filter((m) => m.kind === 'liehai').length < 2;
    return groups < MOB_CAP;
  }
  private startRise(s: Shade, swim: boolean) {
    const g = this.game, p = g.player, [pcx, pcy] = this.toHome(p.x, p.y);
    s.mood = 'rise'; s.rise = 0; s.t = 0;
    // 落点：人旁边（泅水的人就在脚边；飞着的在前方不远）
    const a = Math.atan2(s.cy - pcy, s.cx - pcx), r = swim ? 200 + 120 * H(s.id, 1, 7320) : 260 + 220 * H(s.id, 1, 7320);
    s.aimX = pcx + Math.cos(a) * r; s.aimY = pcy + Math.sin(a) * r;
    this.breachCd = BREACH_GAP;
    audio.sfx('boom');
  }
  private riseTick(s: Shade, dt: number) {
    // 水面鼓包：黑影游到落点下面、越聚越浓，一圈圈泛白
    s.rise = Math.min(1, s.rise + dt / RISE_T);
    s.cx += (s.aimX - s.cx) * Math.min(1, dt * 4); s.cy += (s.aimY - s.cy) * Math.min(1, dt * 4);
    const [x, y] = this.toLocal(s.cx, s.cy);
    if (Math.floor(s.rise * 8) !== Math.floor((s.rise - dt / RISE_T) * 8)) this.fx('bubbles', x, y, s.len * 0.18 * (0.5 + s.rise));
    if (s.rise >= 1) { this.breach(s, x, y); }
  }
  /** 破水：炸开水柱，怪跃出来（真正的 Enemy 从这一刻才有） */
  private breach(s: Shade, x: number, y: number) {
    const g = this.game, sp = s.sp as Kind;
    this.shades = this.shades.filter((q) => q !== s);
    if (!s.summoned) this.gone.set(s.id, this.t + 400);
    const group = ++this.groupN, under = g.jueyu.deep.active;
    if (!under) { this.fx('burst', x, y, s.len * 0.32); this.fx('column', x, y, Math.min(900, 320 + s.len * 0.22)); }   // 收官 B3：人在水下时它们是从暗处游出来的，没有水柱
    g.juice(0.04, sp === 'liehai' ? 0.7 : 0.45); audio.sfx('boom');
    if (sp === 'guichi') {
      // 收官 B3：落水的人招来的头一群只有两三条（泅水二十息内）
      const nFish = s.summoned && this.swimT < 20 ? Math.min(s.n, 2 + (s.id & 1)) : s.n;
      for (let i = 0; i < nFish; i++) {
        const a = i / nFish * Math.PI * 2 + H(s.id, i, 7330), r = 60 + 90 * H(s.id, i, 7331);
        const m = this.spawn('guichi', x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, group, s, (s.seed ^ (i * 977)) | 0);
        if (m) { m.slot = i; m.st = 'leapOut'; this.leapOut(m, 0.55 + 0.25 * H(s.id, i, 7332), 180 + 120 * H(s.id, i, 7333)); }
      }
      this.say(this.skin?.guichi.breach || '海面炸开——一群鬼齿凶鱼跃出水面，獠牙森白！', 'warn');
    } else if (sp === 'mochu') {
      const m = this.spawn('mochu', x, y, group, s, s.seed); if (m) this.krakenInit(m);
      this.say(this.skin?.mochu.breach || '一颗墨紫的巨首从水下浮起，四周的海面一条条隆起——墨触海魔！', 'warn');
    } else if (sp === 'liehai') {
      const m = this.spawn('liehai', x, y, group, s, s.seed); if (m) this.jiaoInit(m, true);
      this.say(this.skin?.liehai.breach || '海面轰然裂开，一条墨鳞巨蛟破水而出——裂海玄蛟！', 'warn');
    }
  }
  /** 造一只海兽（不走 spawnTick，不触发模组的 spawn 钩子；构造时的随机数换成自己的序列） */
  private spawn(kind: Kind, x: number, y: number, group: number, shade: Shade | null, seed: number, defId = SPECIES_DEF[kind]): Mob | null {
    // 收官 B4：别界险地换成派生的那只（触须、魂灯跟着换：jy_*_xu、jy_*_deng）
    const K = this.skin;
    if (K) { const d0 = K[kind].def; defId = defId === 'sb_mochu_xu' ? K.mochu.def + '_xu' : defId === 'sb_chuanling_deng' ? K.chuanling.def + '_deng' : defId === SPECIES_DEF[kind] ? d0 : defId; }
    const g = this.game, def = ENEMIES[defId]; if (!def?.lv) return null;
    const lv = def.lv[0] + (def.lv[1] > def.lv[0] && H(seed, 1, 7340) < 0.4 ? 1 : 0), rs = lvRealm(lv);
    const e = quiet(seed, () => new Enemy(def, x, y, rs.realm, rs.stage, true));
    const E = e as Enemy & { shell?: boolean };
    E.shell = true; e.kit = []; e.aggro = true; e.hx = x; e.hy = y; e.facing = -1;
    if (shade && shade.hpFrac < 1) e.hp = Math.max(1, e.maxHp * shade.hpFrac);
    g.combat.enemies.push(e);
    const m: Mob = { kind, e, group, st: 'idle', t: 0, cd: 1.5 + 1.5 * H(seed, 2, 7341), seed, n: 3, sink: 0.5, alpha: 1, lift: 0, ang: Math.PI, vx: 0, vy: 0, slot: 0, away: 0, quiet: 0, shade, lastHp: e.hp, dmgT: 0 };
    this.mine.set(e, m); this.mobs.push(m);
    return m;
  }
  private dropEnemy(m: Mob) {
    const c = this.game.combat;
    const out = (e: Enemy | null | undefined) => { if (!e) return; const i = c.enemies.indexOf(e); if (i >= 0) c.enemies.splice(i, 1); if (c.lock === e) c.lock = null; };
    out(m.e); if (m.arms) for (const a of m.arms) out(a.e); out(m.lamp);
  }

  // ================================================================ 海兽：共用
  private mobTick(m: Mob, dt: number) {
    const g = this.game, e = m.e, p = g.player;
    m.t += dt; m.cd -= dt;
    { const hdOn = this.hdReady; (e as { seaHD?: boolean }).seaHD = hdOn; if (m.arms) for (const a of m.arms) (a.e as { seaHD?: boolean }).seaHD = hdOn; if (m.lamp) (m.lamp as { seaHD?: boolean }).seaHD = hdOn; }
    // 死了：挪出去之前再演一小会儿（翻肚、沉下去）
    if (e.dead) { m.st = 'dead'; (e.anim as { dead?: number }).dead = 1; m.sink = Math.min(1, m.sink + dt * 0.8); m.lift = Math.max(0, m.lift - 600 * dt); e.lift = m.lift; if (e.deathT > 0.75 || !g.combat.enemies.includes(e)) { m.st = 'gone'; this.cleanupDead(m); } return; }
    // 被别的系统清掉了（换图之外的 combat.reset、离人五千被裁掉）：当作潜回水下
    if (!g.combat.enemies.includes(e)) { this.submergeDone(m); return; }
    // 受伤记录（脱战判定用）
    if (e.hp < m.lastHp) { m.dmgT = 0; m.quiet = 0; } else m.dmgT += dt;
    m.lastHp = e.hp;
    const dP = Math.hypot(e.x - p.x, e.y - p.y);
    // 脱战：人离远了、或够不着又没人动手——潜回水下变回黑影
    if (m.st !== 'dive' && m.st !== 'leapOut' && m.kind !== 'chuanling' && m.kind !== 'leiyao') {
      const onLand = g.terrain.isLand(p.x, p.y);
      m.away = dP > 2600 || onLand ? m.away + dt : Math.max(0, m.away - dt * 2);
      m.quiet = m.dmgT > 20 && p.z > 260 ? m.quiet + dt : 0;
      if (m.away > 5 || m.quiet > 8) this.startDive(m);
    }
    switch (m.kind) {
      case 'guichi': this.fishTick(m, dt, dP); break;
      case 'mochu': this.krakenTick(m, dt, dP); break;
      case 'liehai': this.jiaoTick(m, dt, dP); break;
      case 'chuanling': this.wraithTick(m, dt, dP); break;
      case 'leiyao': this.rayTick(m, dt, dP); break;
    }
    if (m.st === 'dive') this.diveTick(m, dt);
  }
  private startDive(m: Mob) {
    if (m.kind === 'chuanling' || m.kind === 'leiyao') { m.st = 'dive'; m.t = 0; return; }
    // 一群凶鱼一起走
    for (const o of this.mobs) if (o.group === m.group && o.st !== 'dive' && !o.e.dead) { o.st = 'dive'; o.t = 0; o.leap = undefined; if (o.arms) for (const a of o.arms) if (a.grab) this.release(a, false); }
  }
  private diveTick(m: Mob, dt: number) {
    const e = m.e;
    m.sink = Math.min(1, m.sink + dt * 0.9); m.lift = Math.max(0, m.lift - 400 * dt); e.lift = m.lift;
    if (m.kind === 'chuanling' || m.kind === 'leiyao') m.alpha = Math.max(0, m.alpha - dt * 0.9);
    e.aggro = false;
    if (m.arms) for (const a of m.arms) { a.st = a.st === 'gone' ? 'gone' : 'cut'; }
    if (m.t > 1.2) { this.fx('splash', e.x, e.y, 120); this.submergeDone(m); }
  }
  /** 潜回水下：从名单里拿掉，变回黑影（记着剩多少血，下次破水接着来） */
  private submergeDone(m: Mob) {
    m.st = 'gone';
    this.dropEnemy(m);
    if (m.kind === 'chuanling' || m.kind === 'leiyao') return;
    // 同一群剩下的都走了才还原成黑影
    if (this.mobs.some((o) => o !== m && o.group === m.group && o.st !== 'gone')) return;
    const [cx, cy] = this.toHome(m.e.x, m.e.y), s0 = m.shade;
    const sp: Species = m.kind;
    const s = s0 ?? this.makeShade(-(9000 + m.group), sp, Math.floor(cx / SH_CELL), Math.floor(cy / SH_CELL), 4);
    s.cx = cx; s.cy = cy; s.mood = 'leave'; s.cool = 45; s.a = 1; s.rise = 0; s.circleT = 0;
    s.hpFrac = Math.min(1, m.e.hp / m.e.maxHp + 0.15);
    if (sp === 'guichi') s.n = Math.max(1, this.mobs.filter((o) => o.group === m.group && !o.e.dead).length);
    if (!this.shades.includes(s)) this.shades.push(s);
    if (s0 && !s0.summoned) this.gone.delete(s0.id);
  }
  private cleanupDead(m: Mob) {
    this.dropEnemy(m);
    if (m.kind === 'mochu' && m.arms) for (const a of m.arms) if (!a.e.dead) { a.e.dead = true; a.e.deathT = 0; }
  }
  /** 海兽死了：自己的掉落（只用自己的随机序列）、提示 */
  private onMobDead(m: Mob, e: Enemy) {
    const g = this.game, c = g.combat;
    if (e !== m.e) return;
    const r = () => this.rnd(m), drop = (id: string, n = 1) => { c.loot.push({ x: e.x + (r() - 0.5) * 80, y: e.y + (r() - 0.5) * 40, id: this.dropId(id), n, t: 0 }); };
    // 近战兵器线：掉装备的那几回另有三成机会多掉一件兵器——按这头海兽的种子另混哈希，不取 r()，原来的掉落逐位不变
    let wn = 0;
    const arms = (tier: number) => { const wd = weaponDrop((m.seed * 131 + (wn++) * 7919) | 0, tier, 0.3); if (wd) c.loot.push({ x: e.x + 30, y: e.y + 12, id: wd.id, n: 1, t: 0, affix: [wd.affix] }); };
    const gear = (tier: number, set: number) => { if (r() < set) { const P = SETS.xuangui.pieces; drop(P[Math.floor(r() * P.length)]); } else drop(gearDropId((m.seed ^ Math.floor(r() * 1e9)) | 0, tier)); arms(tier); };
    switch (m.kind) {
      case 'guichi': if (r() < 0.6) drop('mat_sb_guichi', 1 + Math.floor(r() * 2)); if (r() < 0.07) gear(3 + Math.floor(r() * 2), 0.3); break;
      case 'mochu': drop('mat_sb_monang'); if (r() < 0.3) gear(4 + Math.floor(r() * 2), 0.35); this.say('墨触海魔沉了下去，海面上漂起一大片墨。', 'good'); break;
      case 'liehai': this.jiaoKills++; drop('mat_sb_jiaolin', 2 + Math.floor(r() * 3)); if (r() < 0.5) drop('mat_sb_jiaojiao'); if (r() < 0.55) gear(5, 0.4); this.say('裂海玄蛟巨大的身躯翻过来，缓缓沉入黑水——快走，血已经散开了！', 'good'); break;
      case 'chuanling': if (m.lampOut) { drop('mat_sb_hundeng'); if (r() < 0.2) gear(4, 0.3); this.say('魂灯一灭，船灵再也聚不起来了。', 'good'); } break;
      case 'leiyao': if (r() < 0.7) drop('mat_sb_leiyi'); if (r() < 0.08) gear(4, 0.2); break;
    }
    // 雾中船灵：灯还亮着，打散了会在雾的另一头重聚
    if (m.kind === 'chuanling' && !m.lampOut && !(e as Enemy & { veto?: unknown }).veto) { this.reforms.push({ t: this.t + 9 + 4 * r(), seed: (m.seed * 31 + 7) | 0 }); this.fx('mist', e.x, e.y, 200); this.say('船灵被打散成一团磷火，往雾里去了……它手里那盏灯还亮着。', 'warn'); }
    void itemDef;
  }
  /** 出水的那一跃（程序动画的弧线）：从水下往外跳 */
  private leapOut(m: Mob, dur: number, H0: number) {
    const e = m.e, a = Math.atan2(this.game.player.y - e.y, this.game.player.x - e.x);
    m.leap = { x0: e.x, y0: e.y, x1: e.x + Math.cos(a) * 160, y1: e.y + Math.sin(a) * 110, t: 0, dur, H: H0, bit: true, z0: 0 };
    m.sink = 0; m.t = 0;
  }
  /** 推进一段弧线；落水那一刻返回 true */
  private leapStep(m: Mob, dt: number): boolean {
    const L = m.leap!, e = m.e;
    L.t += dt; const u = Math.min(1, L.t / L.dur);
    e.x = L.x0 + (L.x1 - L.x0) * u; e.y = L.y0 + (L.y1 - L.y0) * u;
    m.lift = L.z0 * (1 - u) + 4 * L.H * u * (1 - u); e.lift = m.lift;
    m.sink = u < 0.12 ? 0.5 * (1 - u / 0.12) : u > 0.9 ? (u - 0.9) * 5 : 0;
    if (Math.abs(L.x1 - L.x0) > 1) e.facing = L.x1 > L.x0 ? 1 : -1;
    if (u >= 1) { m.leap = undefined; m.lift = 0; e.lift = 0; this.fx('splash', e.x, e.y, 90); return true; }
    return false;
  }
  private sinkTo(m: Mob, k: number, dt: number) { m.sink += (k - m.sink) * Math.min(1, dt * 3); }

  // ================================================================ 鬼齿凶鱼
  private fishTick(m: Mob, dt: number, dP: number) {
    const g = this.game, e = m.e, p = g.player;
    if (m.st === 'dive') return;
    if (m.leap) {
      const landed = this.leapStep(m, dt), L = m.leap;
      // 咬：弧线的后半段扑到人身上
      if (L && L.bit && L.t / L.dur > 0.4) {
        const dz = Math.abs(m.lift - p.z), d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < 100 && dz < 95) {
          L.bit = false;
          e.anim.atk = 1;
          g.combat.hitPlayer(e.atk * 1.35, e.realm, { k: 'slow', dur: 1.6, ch: 1 }, e.x, e.y, e);
          // 咬住了往下拖一截
          if (p.flying) { p.z = Math.max(0, p.z - 80); p.zTarget = Math.min(p.zTarget, p.z + 10); this.say('鬼齿凶鱼咬住你往下一拖！', 'warn'); }
          else if (g.jueyu.swimming) g.jueyu.stagger = Math.max(g.jueyu.stagger, 0.4);
          this.fx('splash', p.x, p.y, 60);
        }
      }
      if (landed) { m.st = 'swim'; m.cd = 2.2 + 1.6 * this.rnd(m); }
      e.anim.atk = Math.max(0, e.anim.atk - dt * 2);
      return;
    }
    // 绕着人游（贴着水面，只露出背鳍）
    this.sinkTo(m, 0.55, dt);
    const n = Math.max(1, this.mobs.filter((o) => o.group === m.group).length);
    const ang = this.t * 0.55 + m.slot / n * Math.PI * 2, R = 360 + 60 * Math.sin(this.t * 0.7 + m.slot);
    const tx = p.x + Math.cos(ang) * R, ty = p.y + Math.sin(ang) * R * 0.75;
    this.swimTo(m, tx, ty, e.speed, dt);
    if (m.st === 'wind') {
      // 起跳前一顿：水面一圈涟漪，身子一缩
      e.anim.atk = Math.min(1, e.anim.atk + dt * 3);
      if (m.t > 0.35) {
        const lead = 0.45, L = Math.hypot(p.st.vx, p.st.vy) > 10 ? 1 : 0;
        const ax = p.x + p.st.vx * lead * L, ay = p.y + p.st.vy * lead * L, d = Math.hypot(ax - e.x, ay - e.y) || 1;
        const over = 140;   // 扑过头一点：咬不着也要从人身边擦过去，落在另一边的水里
        m.leap = { x0: e.x, y0: e.y, x1: ax + (ax - e.x) / d * over, y1: ay + (ay - e.y) / d * over, t: 0, dur: 0.7 + d / 2400, H: Math.max(150, p.z + 70) / 0.9, bit: true, z0: 0 };
        m.st = 'leap'; this.fx('splash', e.x, e.y, 70); audio.sfx('whoosh');
      }
    } else if (m.cd <= 0 && dP < 760 && p.z < 340) { m.st = 'wind'; m.t = 0; this.fx('ring', e.x, e.y, 70); }
    else e.anim.atk = Math.max(0, e.anim.atk - dt * 2);
  }
  /** 在水里游向一点（转身有惯性） */
  private swimTo(m: Mob, tx: number, ty: number, sp: number, dt: number) {
    const e = m.e, dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
    if (d < 4) { e.anim.move *= 0.9; return; }
    const k = Math.min(1, dt * 3), v = Math.min(sp, d * 2.5);
    m.vx += (dx / d * v - m.vx) * k; m.vy += (dy / d * v - m.vy) * k;
    const nx = e.x + m.vx * dt, ny = e.y + m.vy * dt;
    if (!this.game.terrain.isLand(nx, ny)) { e.x = nx; e.y = ny; }
    if (Math.abs(m.vx) > 8) e.facing = m.vx > 0 ? 1 : -1;
    e.anim.move = Math.min(1, Math.hypot(m.vx, m.vy) / sp); e.anim.phase += dt * 6;
    m.ang = Math.atan2(m.vy, m.vx);
  }

  // ================================================================ 墨触海魔与触须
  private krakenInit(m: Mob) {
    const e = m.e, n = this.debugArms || 4 + Math.floor(H(m.seed, 5, 7400) * 3);
    m.arms = []; m.sink = 0.9; m.st = 'emerge'; m.t = 0; m.exposed = false;
    e.guardT = 99;   // 护体：触须没被斩掉大半之前，本体只吃三成半伤害（combat.hitEnemy 的现成规则）
    for (let i = 0; i < n; i++) {
      const sub = this.spawn('mochu', e.x, e.y, m.group, null, (m.seed ^ (i * 7919 + 13)) | 0, 'sb_mochu_xu');
      if (!sub) continue;
      // 子单位不当独立的海兽算：从 mobs 里拿出来，挂在本体名下
      this.mobs.splice(this.mobs.indexOf(sub), 1); this.mine.set(sub.e, m);
      (sub.e as Enemy & { sbArm?: boolean }).sbArm = true;   // 第五轮返工：触须不单独出名牌（只在锁定的那条上显示血条），海魔本体一个名牌
      const N = 18;
      const arm: Arm = { e: sub.e, i, rootA: i / n * Math.PI * 2 + 0.4 * H(m.seed, i, 7401), L: 900 + 380 * H(m.seed, i, 7402), st: 'rise', t: -0.25 * i, cd: 1.5 + 2.5 * H(m.seed, i, 7403),
        pts: new Float32Array(N * 3), w: new Float32Array(N), len: 0, grab: null, grabHp: 0, hitDone: false, dir: 0, tipX: e.x, tipY: e.y, tipZ: 0 };
      m.arms.push(arm);
    }
  }
  private krakenTick(m: Mob, dt: number, dP: number) {
    const g = this.game, e = m.e, p = g.player;
    if (m.st === 'dive') { this.armsTick(m, dt); return; }
    if (m.st === 'emerge') { this.sinkTo(m, 0.42, dt); if (m.t > 1.4) { m.st = 'idle'; m.t = 0; } }
    // 慢慢往人那边挪（离得太远才挪）
    if (dP > 950) { const dx = p.x - e.x, dy = p.y - e.y; const nx = e.x + dx / dP * e.speed * dt, ny = e.y + dy / dP * e.speed * dt; if (!g.terrain.isLand(nx, ny)) { e.x = nx; e.y = ny; } }
    e.facing = p.x > e.x ? 1 : -1;
    // 触须被斩掉大半：露出弱点
    const alive = m.arms!.filter((a) => !a.e.dead).length;
    if (!m.exposed && alive <= Math.floor(m.arms!.length / 2)) {
      m.exposed = true; e.guardT = 0;
      this.say('墨触海魔的触须被斩断大半，本体痛得浮出水面——弱点露出来了！', 'good');
      g.combat.texts.push({ anchor: { x: e.x, y: e.y, offsetY: -e.flyH - e.lift }, x: e.x, y: e.y - 300, s: '弱点暴露', color: '#ffd27a', t: 0, big: true, vy: -30 } as never);
      audio.sfx('break');
    }
    if (!m.exposed) e.guardT = 99;
    this.sinkTo(m, m.st === 'emerge' ? 0.42 : m.exposed ? 0.18 : 0.38, dt);
    // 本体的招：喷墨、咆哮
    if (m.st === 'idle' && m.cd <= 0 && dP < 1400) {
      const r = this.rnd(m);
      m.st = r < 0.55 ? 'inkWind' : 'roarWind'; m.t = 0;
    }
    if (m.st === 'inkWind') { e.anim.atk = Math.min(1, m.t / 0.7); if (m.t > 0.7) { m.st = 'idle'; m.t = 0; m.cd = 10 + 4 * this.rnd(m); this.spitInk(m); } }
    else if (m.st === 'roarWind') {
      e.anim.atk = Math.min(1, m.t / 0.6);
      if (m.t > 0.6) {
        m.st = 'idle'; m.t = 0; m.cd = 8 + 4 * this.rnd(m);
        this.fx('ring', e.x, e.y, 520); g.juice(0.03, 0.4); audio.sfx('boom');
        if (dP < 520 && p.z < 300) { g.combat.hitPlayer(e.atk * 0.8, e.realm, { k: 'stun', dur: 0.6, ch: 0.6 }, e.x, e.y, e); this.shove((p.x - e.x) / (dP || 1) * 600, (p.y - e.y) / (dP || 1) * 600, 0.4); }
      }
    } else e.anim.atk = Math.max(0, e.anim.atk - dt * 2);
    this.armsTick(m, dt);
  }
  private spitInk(m: Mob) {
    const e = m.e, p = this.game.player, a = Math.atan2(p.y - e.y, p.x - e.x);
    const x = e.x + Math.cos(a) * 420, y = e.y + Math.sin(a) * 300;
    this.inks.push({ x, y, t0: this.t, life: 7, r: 900 });
    this.fx('ink', x, y, 900, { x2: e.x, y2: e.y });
    this.say('海魔喷出一大片墨，四下里顿时昏黑！', 'warn');
  }
  /** 触须：状态机 + 每帧按曲线铺出各节（只改顶点数组，不重建） */
  private armsTick(m: Mob, dt: number) {
    const g = this.game, e = m.e, p = g.player, t = this.t;
    for (const a of m.arms!) {
      a.t += dt; a.cd -= dt;
      const ae = a.e;
      if (a.st === 'gone') continue;
      if (ae.dead && a.st !== 'cut') {
        a.st = 'cut'; a.t = 0; if (a.grab) this.release(a, true);
        this.fx('splash', a.tipX, a.tipY, 140); this.fx('ink', (a.tipX + e.x) / 2, (a.tipY + e.y) / 2, 160);
        if (this.rnd(m) < 0.5) g.combat.loot.push({ x: a.tipX, y: a.tipY, id: this.dropId('mat_sb_chuxu'), n: 1, t: 0 });
      }
      const rx = e.x + Math.cos(a.rootA) * 210, ry = e.y + Math.sin(a.rootA) * 150;
      // 目标：tip 去哪、拱多高
      let tx: number, ty: number, tz: number, arc: number, len: number, coil = 0;
      const toP = Math.atan2(p.y - ry, p.x - rx), dRP = Math.hypot(p.x - rx, p.y - ry);
      const B = g.jueyu.boat, tgt = B.aboard ? B.grab : this.player;   // 收官 B3：人在船上，缠的是船
      const sway = Math.sin(t * 1.3 + a.i * 1.7), sway2 = Math.sin(t * 0.8 + a.i);
      const out = a.rootA + 0.5 * sway2 * 0.4;
      switch (a.st) {
        case 'rise': {
          const k = sstep(0, 1.3, a.t);
          len = a.L * 0.75 * k; tx = rx + Math.cos(out) * len * 0.3; ty = ry + Math.sin(out) * len * 0.22; tz = len * 0.75; arc = 0.2;
          if (a.t > 1.3) { a.st = 'idle'; a.t = 0; }
          break;
        }
        case 'idle': {
          len = a.L * 0.8; const lean = 0.45 + 0.15 * sway;
          const dir = dRP < a.L * 1.4 ? toP + (a.i - 2) * 0.35 : out;
          tx = rx + Math.cos(dir) * len * lean; ty = ry + Math.sin(dir) * len * lean * 0.75; tz = len * (0.5 + 0.12 * sway2); arc = 0.35;
          if (a.cd <= 0 && dRP < a.L * 1.15 && p.z < a.L * 0.9 && !ae.dead && m.st !== 'dive') {
            const busy = m.arms!.filter((o) => o.st === 'grab' || o.st === 'hold').length;
            const r = this.rnd(m);
            a.st = r < 0.35 && busy === 0 && !this.hud.held ? 'grab' : r < 0.7 ? 'slam' : 'whip'; a.t = 0; a.hitDone = false; a.dir = toP;
          }
          break;
        }
        case 'whip': {
          // 抽打：先往后扬，再横着扫过去
          const back = a.t < 0.5, u = back ? a.t / 0.5 : Math.min(1, (a.t - 0.5) / 0.3);
          const swing = back ? a.dir + 1.1 * u : a.dir + 1.1 - 2.2 * u;
          len = a.L; tx = rx + Math.cos(swing) * len * 0.9; ty = ry + Math.sin(swing) * len * 0.65; tz = back ? 260 + 200 * u : 120; arc = back ? 0.5 : 0.15;
          if (!back && !a.hitDone && this.nearCurve(a, p.x, p.y, 110) && p.z < 300) { a.hitDone = true; g.combat.hitPlayer(ae.atk * 1.2, ae.realm, { k: 'knock', dur: 0.3, ch: 1 }, a.tipX, a.tipY, ae); this.shove(Math.cos(swing + Math.PI / 2) * -500, Math.sin(swing + Math.PI / 2) * -500, 0.3); audio.sfx('clang'); }
          if (a.t > 0.85) { a.st = 'idle'; a.t = 0; a.cd = 2.5 + 2 * this.rnd(m); }
          break;
        }
        case 'slam': {
          // 拍击水面：高高举起（水面上一道预警线），再整条拍下来，起浪
          const up = a.t < 0.85, u = up ? a.t / 0.85 : Math.min(1, (a.t - 0.85) / 0.22);
          len = a.L; tx = rx + Math.cos(a.dir) * len * (up ? 0.35 : 0.98); ty = ry + Math.sin(a.dir) * len * (up ? 0.25 : 0.72); tz = up ? len * (0.7 + 0.25 * u) : len * 0.95 * (1 - u); arc = up ? 0.15 : 0.02;
          if (!up && u >= 1 && !a.hitDone) {
            a.hitDone = true;
            this.fx('column', tx, ty, 360); this.fx('burst', (rx + tx) / 2, (ry + ty) / 2, 260); g.juice(0.03, 0.45); audio.sfx('boom');
            if (this.nearCurve(a, p.x, p.y, 120) && p.z < 200) g.combat.hitPlayer(ae.atk * 1.6, ae.realm, { k: 'stun', dur: 0.5, ch: 0.7 }, tx, ty, ae);
            this.waves.push({ x: tx, y: ty, t0: this.t, sp: 700, R: 700, raw: ae.atk * 0.6, realm: ae.realm, src: ae, hit: false });
          }
          if (a.t > 1.6) { a.st = 'idle'; a.t = 0; a.cd = 3 + 2 * this.rnd(m); }
          break;
        }
        case 'grab': {
          // 伸过去缠
          const u = Math.min(1, a.t / 0.55);
          const gq = tgt.pos();
          len = a.L; tx = rx + (gq.x - rx) * u; ty = ry + (gq.y - ry) * u; tz = 200 + (gq.z + 50 - 200) * u; arc = 0.3;
          if (u >= 1) {
            if (Math.hypot(a.tipX - gq.x, a.tipY - gq.y) < 130 && Math.abs(a.tipZ - gq.z - 50) < 160 && !g.combat.invulnT) {
              a.st = 'hold'; a.t = 0; a.grab = tgt; a.grabHp = ae.hp; this.struggleT = 0; this.hud.held = 1; this.heldSwimT = 0;
              if (tgt.kind === 'boat') { this.say('触须缠住了船身，正把船往海里拖！拼命划桨（方向键）或斩断这条触须！', 'warn'); B.struggleReset(); }
              else this.say('触须缠住了你！拼命挣扎（按方向键）或斩断这条触须才能脱身。', 'warn');
              audio.sfx('clang');
            } else { a.st = 'idle'; a.t = 0; a.cd = 1.5; }
          }
          break;
        }
        case 'hold': {
          const T = a.grab!, q = T.pos();
          len = a.L; tx = q.x; ty = q.y; tz = q.z + 50; arc = 0.25; coil = 1;
          T.hold(dt, rx, ry);
          if (Math.floor(a.t) !== Math.floor(a.t - dt)) T.hurt(ae.atk * 0.55, ae);
          // 挣脱：这条触须被打掉一截（打断）、挣扎够了、或者缠了太久甩出去
          const need = 2.2 + Math.max(0, g.hero.realm - ae.realm) * 0.8;
          if (ae.hp < a.grabHp - ae.maxHp * 0.18) { this.release(a, true); this.say('触须吃痛一松——挣脱了！', 'good'); }
          else if (T.struggle(dt) >= need) { this.release(a, true); this.say('你奋力一挣，从触须里脱了出来！', 'good'); }
          else if ((a.t > 7 && T.kind === 'player') || !T.alive()) { this.release(a, false); if (T.kind === 'player') { g.combat.hitPlayer(ae.atk * 1.4, ae.realm, undefined, rx, ry, ae); this.fx('column', p.x, p.y, 300); } }   // 收官 B3：缠船的不松手，一直拖到船沉
          break;
        }
        case 'cut': default: {
          const k = 1 - sstep(0, 1, a.t);
          len = a.L * 0.35 * k; tx = rx + Math.cos(out) * len * 0.3; ty = ry + Math.sin(out) * len * 0.2; tz = len * 0.6 - 40 * (1 - k); arc = 0.1;
          if (a.t > 1.1) a.st = 'gone';
          break;
        }
      }
      this.layArm(a, rx, ry, tx, ty, tz, arc, coil, t);
      // 子单位的位置：曲线七成处（锁定、法术命中、血条都按它）
      const k7 = Math.floor(a.pts.length / 3 * 0.7) * 3;
      ae.x = a.pts[k7]; ae.y = a.pts[k7 + 1]; ae.lift = Math.max(0, a.pts[k7 + 2]); ae.flyH = 0;
      ae.aggro = m.st !== 'dive'; ae.hx = ae.x; ae.hy = ae.y;
    }
    this.hud.held = m.arms!.some((a) => a.st === 'hold') ? 1 : this.mobs.some((o) => o !== m && o.arms?.some((a) => a.st === 'hold')) ? 1 : 0;
  }
  private release(a: Arm, hurtArm: boolean) {
    a.grab = null; a.st = 'idle'; a.t = 0; a.cd = 3 + (hurtArm ? 1.5 : 0); this.struggleT = 0; this.hud.held = 0;
    const c = this.game.combat; if (c.pst.root) c.pst.root.t = Math.min(c.pst.root.t, 0.05);
  }
  /** 一点离这条触须的曲线多近 */
  private nearCurve(a: Arm, x: number, y: number, r: number): boolean {
    for (let i = 0; i < a.pts.length; i += 3) if (Math.abs(a.pts[i] - x) < r && Math.abs(a.pts[i + 1] - y) < r && Math.hypot(a.pts[i] - x, a.pts[i + 1] - y) < r) return true;
    return false;
  }
  /**
   * 把一条触须铺成 N 个点：从根部竖着出水，拱成一道弧伸向 tip，沿身子走一道行波（活的、在扭）。
   * coil = 1 时最后三成绕着目标盘两圈。顶点数组原地改写。
   */
  private layArm(a: Arm, rx: number, ry: number, tx: number, ty: number, tz: number, arc: number, coil: number, t: number) {
    const P = a.pts, W = a.w, N = W.length;
    const dx = tx - rx, dy = ty - ry, dh = Math.hypot(dx, dy) || 1, nx = -dy / dh, ny = dx / dh;
    const width = 46 + a.L * 0.03;
    for (let i = 0; i < N; i++) {
      const s = i / (N - 1);
      let x: number, y: number, z: number;
      if (coil && s > 0.68) {
        const u = (s - 0.68) / 0.32, th = u * Math.PI * 4 + t * 2, rr = 55 * (1 - 0.3 * u);
        x = tx + Math.cos(th) * rr; y = ty + Math.sin(th) * rr * 0.6; z = tz - 40 + u * 90 + Math.sin(th) * 12;
      } else {
        const ss = coil ? s / 0.68 : s;
        // 根部竖起：前两成主要往上长
        const rise = Math.min(1, ss / 0.2);
        const wave = Math.sin(ss * 7 - t * 4.2 + a.i * 1.3) * (30 + 70 * ss) * (1 - coil * 0.6);
        x = rx + dx * ss + nx * wave; y = ry + dy * ss + ny * wave * 0.8;
        z = -60 + (tz + 60) * Math.pow(ss, 0.8) * (0.6 + 0.4 * rise) + Math.sin(ss * Math.PI) * dh * arc + Math.sin(ss * 9 - t * 3 + a.i) * 18;
      }
      P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
      W[i] = width * (1 - 0.72 * s) * (a.st === 'cut' ? 1 : 1);
    }
    a.tipX = P[(N - 1) * 3]; a.tipY = P[(N - 1) * 3 + 1]; a.tipZ = P[(N - 1) * 3 + 2];
    let L = 0; for (let i = 1; i < N; i++) L += Math.hypot(P[i * 3] - P[i * 3 - 3], P[i * 3 + 1] - P[i * 3 - 2], P[i * 3 + 2] - P[i * 3 - 1]);
    a.len = L;
  }

  // ================================================================ 裂海玄蛟
  private jiaoInit(m: Mob, burst: boolean) {
    const e = m.e;
    m.path = []; m.body = { und: 0 };
    // 身子先沿出水的方向往后铺一段
    const a = Math.atan2(this.game.player.y - e.y, this.game.player.x - e.x) + Math.PI;
    for (let i = 0; i < 40; i++) m.path.push(e.x + Math.cos(a) * i * 70, e.y + Math.sin(a) * i * 70 * 0.8);
    const N = 26; m.ribbon = { id: m.seed, kind: 'jiao', n: N, pts: new Float32Array(N * 3), w: new Float32Array(N), alpha: 1, flash: 0 };
    if (burst) { m.leap = { x0: e.x, y0: e.y, x1: e.x + Math.cos(a + Math.PI) * 200, y1: e.y + Math.sin(a + Math.PI) * 140, t: 0, dur: 1.1, H: 520, bit: false, z0: 0 }; m.st = 'emerge'; }
    else m.st = 'prowl';
    m.cd = 2.5;
  }
  private jiaoTick(m: Mob, dt: number, dP: number) {
    const g = this.game, e = m.e, p = g.player;
    const toP = Math.atan2(p.y - e.y, p.x - e.x);
    if (m.leap) { if (this.leapStep(m, dt)) { m.st = m.st === 'burst' ? 'prowl' : 'prowl'; m.cd = 1.8; this.fx('burst', e.x, e.y, 260); } }
    else if (m.st === 'dive') { /* diveTick */ }
    else if (m.st === 'prowl' || m.st === 'emerge') {
      m.st = 'prowl';
      this.sinkTo(m, 0.35, dt);
      // 在人四周游弋，头微微抬出水面
      const ang = this.t * 0.32 + m.slot * 2, R = 1000 + 150 * Math.sin(this.t * 0.4);
      this.swimTo(m, p.x + Math.cos(ang) * R, p.y + Math.sin(ang) * R * 0.75, e.speed, dt);
      if (m.cd <= 0 && dP < 1700) {
        const r = this.rnd(m);
        m.st = r < 0.32 ? 'chargeWind' : r < 0.55 ? 'thunderWind' : r < 0.78 ? 'tailWind' : 'diveDown'; m.t = 0;
        m.aim = { x: p.x, y: p.y, dx: Math.cos(toP), dy: Math.sin(toP) };
        if (m.st === 'chargeWind') this.say('裂海玄蛟高高昂起头——它要撞过来了！', 'warn');
      }
      e.anim.atk = Math.max(0, e.anim.atk - dt * 2);
    } else if (m.st === 'chargeWind') {
      // 冲撞：昂首（立板抬高），水面上一道预警线
      this.sinkTo(m, 0.1, dt); e.anim.atk = Math.min(1, m.t); m.lift = 80 * sstep(0, 0.8, m.t); e.lift = m.lift;
      const A = m.aim!; const d = Math.hypot(p.x - e.x, p.y - e.y) || 1; A.dx += ((p.x - e.x) / d - A.dx) * dt * 2; A.dy += ((p.y - e.y) / d - A.dy) * dt * 2;
      const L = Math.hypot(A.dx, A.dy) || 1; A.dx /= L; A.dy /= L;
      if (m.t > 1.0) { m.st = 'charge'; m.t = 0; m.vx = A.dx * 2700; m.vy = A.dy * 2700; m.leap = undefined; m.hitDone = false; audio.sfx('whoosh'); }
    } else if (m.st === 'charge') {
      const nx = e.x + m.vx * dt, ny = e.y + m.vy * dt;
      if (!g.terrain.isLand(nx, ny)) { e.x = nx; e.y = ny; }
      e.facing = m.vx > 0 ? 1 : -1; m.ang = Math.atan2(m.vy, m.vx);
      if (Math.floor(m.t * 20) !== Math.floor((m.t - dt) * 20)) this.fx('splash', e.x, e.y, 110);
      if (!m.hitDone && Math.hypot(e.x - p.x, e.y - p.y) < 170 && p.z < 300) {
        m.hitDone = true;
        g.combat.hitPlayer(e.atk * 2.1, e.realm, undefined, e.x, e.y, e);
        g.combat.brawl.launchPlayer(m.vx, m.vy, 1700, 600, e);   // 撞飞：走近战线现成的击飞
        g.juice(0.08, 0.8); audio.sfx('boom'); this.fx('burst', p.x, p.y, 200);
      }
      m.lift = Math.max(0, m.lift - 300 * dt); e.lift = m.lift;
      if (m.t > 0.65) { m.st = 'prowl'; m.cd = 2.6 + 1.4 * this.rnd(m); m.vx *= 0.1; m.vy *= 0.1; }
    } else if (m.st === 'thunderWind') {
      // 吐雷：仰天含雷，前方一扇形落下几道雷（各有预警圈）
      this.sinkTo(m, 0.12, dt); e.anim.atk = 1; m.lift = 120 * sstep(0, 0.8, m.t); e.lift = m.lift;
      if (m.t > 1.1) {
        m.st = 'prowl'; m.cd = 3 + 1.5 * this.rnd(m);
        const base = Math.atan2(p.y - e.y, p.x - e.x);
        for (let i = 0; i < 6; i++) {
          const a = base + (i - 2.5) * 0.16, r = Math.min(1400, Math.max(300, dP)) * (0.55 + 0.25 * (i % 3)) + (i === 2 || i === 3 ? 0 : 60);
          const zx = i === 2 ? p.x : e.x + Math.cos(a) * r, zy = i === 2 ? p.y : e.y + Math.sin(a) * r * 0.85;
          this.zaps.push({ x: zx, y: zy, t0: this.t + i * 0.08, warn: 0.85, r: 170, raw: e.atk * 1.35, realm: e.realm, src: e, done: false, kind: 'thunder' });
        }
        audio.sfx('thunder');
      }
    } else if (m.st === 'tailWind') {
      // 甩尾：尾巴（身子最后一节）拍水，一圈巨浪往外推
      e.anim.atk = Math.min(1, m.t * 2);
      if (m.t > 0.7) {
        const P = m.path!, k = Math.min(P.length - 2, 36);
        const tx = P[k] ?? e.x, ty = P[k + 1] ?? e.y;
        this.waves.push({ x: tx, y: ty, t0: this.t, sp: 950, R: 1600, raw: e.atk * 1.1, realm: e.realm, src: e, hit: false });
        this.fx('column', tx, ty, 520); this.fx('burst', tx, ty, 320); g.juice(0.04, 0.6); audio.sfx('boom');
        m.st = 'prowl'; m.cd = 2.8 + 1.5 * this.rnd(m);
      }
    } else if (m.st === 'diveDown') {
      // 潜下去，从脚下破水：先沉，水下一个巨影追到人脚下，水面一圈预警越收越紧，然后冲天而起
      this.sinkTo(m, 1, dt); m.alpha = Math.max(0, 1 - m.t / 0.8);
      if (m.t > 0.8) { m.st = 'under'; m.t = 0; }
    } else if (m.st === 'under') {
      m.alpha = 0;
      const A = m.aim!; A.x += (p.x - A.x) * Math.min(1, dt * 1.5); A.y += (p.y - A.y) * Math.min(1, dt * 1.5);
      e.x += (A.x - e.x) * Math.min(1, dt * 2.5); e.y += (A.y - e.y) * Math.min(1, dt * 2.5);
      if (m.t > 1.7) {
        m.st = 'burst'; m.t = 0; m.alpha = 1; m.sink = 0;
        this.fx('column', e.x, e.y, 900); this.fx('burst', e.x, e.y, 380); g.juice(0.06, 0.9); audio.sfx('boom');
        m.leap = { x0: e.x, y0: e.y, x1: e.x + 40, y1: e.y + 30, t: 0, dur: 1.0, H: 460, bit: false, z0: 0 };
        if (Math.hypot(e.x - p.x, e.y - p.y) < 230 && p.z < 420) { g.combat.hitPlayer(e.atk * 2.4, e.realm, undefined, e.x, e.y + 40, e); g.combat.brawl.launchPlayer(p.x - e.x || 1, p.y - e.y, 900, 900, e); }
      }
    }
    if (m.alpha < 1 && m.st !== 'diveDown' && m.st !== 'under' && m.st !== 'dive') m.alpha = Math.min(1, m.alpha + dt * 3);
    this.jiaoBody(m, dt);
  }
  /** 蛟身：沿头走过的路铺开十几节（蛇行），大半在水下，只露出几段背脊；尾巴最后一节 */
  private jiaoBody(m: Mob, dt: number) {
    const e = m.e, P = m.path!, R = m.ribbon!, N = R.n, t = this.t;
    // 记路：头离上一个点超过 60 就记一个
    if (Math.hypot(P[0] - e.x, P[1] - e.y) > 60) { P.unshift(e.x, e.y); if (P.length > 160) P.length = 160; }
    m.body!.und += dt * (m.st === 'charge' ? 6 : 2.2);
    const spacing = 92, under = m.st === 'under' || m.st === 'diveDown';
    let acc = 0, j = 0, px = e.x, py = e.y;
    for (let i = 0; i < N; i++) {
      const want = i * spacing;
      while (j + 3 < P.length && acc + Math.hypot(P[j + 2] - P[j], P[j + 3] - P[j + 1]) < want) { acc += Math.hypot(P[j + 2] - P[j], P[j + 3] - P[j + 1]); j += 2; }
      const sx = P[j + 2] ?? px, sy = P[j + 3] ?? py, seg = Math.hypot(sx - (P[j] ?? px), sy - (P[j + 1] ?? py)) || 1, u = Math.max(0, Math.min(1, (want - acc) / seg));
      const x = (P[j] ?? px) + (sx - (P[j] ?? px)) * u, y = (P[j + 1] ?? py) + (sy - (P[j + 1] ?? py)) * u;
      px = x; py = y;
      // 横向蛇行 + 上下起伏：几段背脊拱出水面
      const s = i / (N - 1), wav = Math.sin(m.body!.und - i * 0.62);
      const z = (under ? -260 : -55 + 120 * wav * (0.4 + 0.6 * Math.sin(s * Math.PI))) + (i < 3 ? (e.lift + (1 - m.sink) * 160) * (1 - i / 3) : 0);
      R.pts[i * 3] = x + Math.sin(m.body!.und * 0.7 - i * 0.4) * 26 * s; R.pts[i * 3 + 1] = y; R.pts[i * 3 + 2] = z;
      R.w[i] = 92 * (s < 0.82 ? 1 - 0.35 * s : (1 - 0.35 * 0.82) * (1 - (s - 0.82) / 0.18 * 0.2));
    }
    R.alpha = m.alpha; R.flash = e.hitFlash > 0 ? 1 : 0;
  }

  // ================================================================ 雾中船灵
  private wraithSpawn(dt: number) {
    const g = this.game, J = g.jueyu, p = g.player;
    this.wraithCd = Math.max(0, this.wraithCd - dt);
    const [pcx, pcy] = this.toHome(p.x, p.y), fog = J.fogAt(pcx, pcy);
    for (const m of this.mobs) if (m.kind === 'chuanling') {
      // 离了雾：淡出
      const [wx, wy] = this.toHome(m.e.x, m.e.y);
      if (J.fogAt(wx, wy) < 0.12 && m.st !== 'dive') { m.st = 'dive'; m.t = 0; }
    }
    // 打散了的船灵：灯还亮着，过一阵在雾的另一头（离人一千二以外）重新聚起来
    for (const R of this.reforms) {
      if (this.t < R.t) continue;
      R.t = Infinity;
      if (fog < 0.2) continue;
      const a = H(R.seed, 1, 7510) * Math.PI * 2;
      for (let k = 0; k < 6; k++) {
        const r = 1300 + 300 * k, x = p.x + Math.cos(a + k) * r, y = p.y + Math.sin(a + k) * r * 0.8, [hx, hy] = this.toHome(x, y);
        if (J.fogAt(hx, hy) < 0.3) continue;
        const m = this.spawnWraith(x, y, R.seed, 0.65);
        if (m) { this.fx('mist', x, y, 220); this.say('雾的另一头，那点幽绿的灯火又亮了起来——船灵重新聚起来了。', 'warn'); }
        break;
      }
    }
    this.reforms = this.reforms.filter((R) => R.t !== Infinity);
    if (fog < 0.35 || this.wraithCd > 0 || J.depth < J.bandFrom('fog') || this.reforms.length || J.deep.active || this.mobs.some((m) => m.kind === 'chuanling')) return;
    this.wraithCd = 25;
    const n = Math.floor(this.t * 7), a = H(n, 1, 7500) * Math.PI * 2, r = 650 + 300 * H(n, 2, 7501);
    this.spawnWraith(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.8, (n * 2654435761) | 0, 1);
    this.say('雾里亮起一点幽绿的灯火，一道披着破帆的影子提着灯飘了过来——雾中船灵。', 'warn');
  }
  private spawnWraith(x: number, y: number, seed: number, hp: number) {
    const m = this.spawn('chuanling', x, y, ++this.groupN, null, seed); if (!m) return null;
    // 收官 B3：灯还亮着时「打散」不算打死——不走 combat.kill（不给修为、不掉落、不算杀敌），化作磷火往雾里去，过一阵重聚
    (m.e as Enemy & { veto?: (e: Enemy) => boolean }).veto = () => this.wraithScatter(m);
    m.alpha = 0; m.sink = 0; m.st = 'float'; m.cd = 2;
    if (hp < 1) m.e.hp = m.e.maxHp * hp;
    const lamp = this.spawn('chuanling', x, y, m.group, null, (seed ^ 0x5bd1) | 0, 'sb_chuanling_deng');
    if (lamp) { this.mobs.splice(this.mobs.indexOf(lamp), 1); this.mine.set(lamp.e, m); m.lamp = lamp.e; lamp.e.flyH = 0; }
    m.e.flyH = 0;
    return m;
  }
  /** 灯没灭时船灵被打到没血：散成一团磷火（不死、不结算），过九到十三息在雾的另一头重聚 */
  private wraithScatter(m: Mob): boolean {
    if (m.lampOut || m.st === 'gone') return false;
    const g = this.game, e = m.e;
    e.hp = Math.max(1, e.maxHp * 0.05);
    this.reforms.push({ t: this.t + 9 + 4 * this.rnd(m), seed: (m.seed * 31 + 7) | 0 });
    this.fx('mist', e.x, e.y, 200);
    this.say('船灵被打散成一团磷火，往雾里去了……它手里那盏灯还亮着。', 'warn');
    m.st = 'gone'; this.dropEnemy(m);
    return true;
  }
  private wraithTick(m: Mob, dt: number, dP: number) {
    const g = this.game, e = m.e, p = g.player;
    if (m.st === 'dive') { if (m.lamp) m.lamp.x = e.x; return; }
    m.alpha = Math.min(1, m.alpha + dt * 0.7);
    // 飘：离人四五百，绕着走
    const ang = Math.atan2(e.y - p.y, e.x - p.x) + dt * 0.3, R = 520;
    const tx = p.x + Math.cos(ang) * R, ty = p.y + Math.sin(ang) * R * 0.8;
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
    if (d > 4) { const v = Math.min(e.speed, d * 2); e.x += dx / d * v * dt; e.y += dy / d * v * dt; e.anim.move = Math.min(1, v / e.speed); }
    e.facing = p.x > e.x ? 1 : -1;
    m.lift = 50 + 14 * Math.sin(this.t * 1.6 + m.seed); e.lift = m.lift;
    // 灯：挂在它举灯的那只手边
    const L = m.lamp;
    if (L) {
      if (L.dead && !m.lampOut) { m.lampOut = true; this.say('魂灯碎了！船灵发出一声尖啸，身形淡了下去——现在打散它，它就再也聚不起来了。', 'good'); this.fx('burst', L.x, L.y, 120); e.dfn *= 0.6; }
      if (!L.dead) { L.x = e.x + e.facing * 70; L.y = e.y + 4; L.lift = m.lift + 120; L.flyH = 0; L.aggro = true; L.hx = L.x; L.hy = L.y; }
    }
    if (m.st === 'float' && g.jueyu.deep.active) m.cd = Math.max(m.cd, 1);   // 收官 B3：人在水下，雾里的船灵够不着
    if (m.st === 'float') {
      e.anim.atk = Math.max(0, e.anim.atk - dt * 2);
      if (m.cd <= 0 && dP < 900) { m.st = this.rnd(m) < 0.5 ? 'hookWind' : 'fireWind'; m.t = 0; }
    } else if (m.st === 'hookWind') {
      e.anim.atk = 0.3 + 0.7 * Math.min(1, m.t / 0.6);
      if (m.t > 0.6) {
        const a = Math.atan2(p.y - e.y, p.x - e.x);
        this.chains.push({ x0: e.x, y0: e.y, x: e.x, y: e.y, vx: Math.cos(a) * 1500, vy: Math.sin(a) * 1500 * 0.9, t: 0, st: 'fly', src: m, life: 0.75 });
        m.st = 'float'; m.cd = 3.5 + 2 * this.rnd(m); audio.sfx('clang');
      }
    } else if (m.st === 'fireWind') {
      e.anim.atk = 1;
      if (m.t > 0.7) {
        const c = g.combat;
        for (let i = 0; i < 3; i++) {
          const a = Math.atan2(p.y - e.y, p.x - e.x) + (i - 1) * 0.35, sp = 380;
          c.projs.push({ fac: 'e', visual: { groundOffsetY: 60, elevation: m.lift }, x: e.x, y: e.y - 60, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 2.4, fx: 'ghost', color: '120,255,200', dmg: e.atk * 0.8, realm: e.realm, stCh: 0, pierce: false, homing: false, hit: new Set(), r: 30, aoe: 0, size: 1.1, trail: [], lv: 0, src: e } as never);
        }
        m.st = 'float'; m.cd = 3 + 2 * this.rnd(m); audio.sfx('fire');
      }
    }
  }

  // ================================================================ 雷鳐
  private raySpawn(dt: number) {
    const g = this.game, J = g.jueyu, p = g.player;
    this.rayCd = Math.max(0, this.rayCd - dt);
    const st = J.stormNear(p.x, p.y);
    for (const m of this.mobs) if (m.kind === 'leiyao' && m.st !== 'dive') { if (!st || st.id !== m.stormId) { m.away += dt; if (m.away > 10) { m.st = 'dive'; m.t = 0; } } else m.away = 0; }
    if (!st || st.band < 0.4 || this.rayCd > 0 || g.jueyu.deep.active || this.mobs.some((m) => m.kind === 'leiyao')) return;
    this.rayCd = 60;
    const n = 2 + Math.floor(H(st.id, Math.floor(this.t / 60), 7600) * 2), group = ++this.groupN;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + H(st.id, i, 7601), r = 900;
      const m = this.spawn('leiyao', p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.8, group, null, (st.id * 31 + i * 7 + Math.floor(this.t)) | 0);
      if (!m) continue;
      m.alpha = 0; m.st = 'glide'; m.stormId = st.id; m.orbitA = a; m.slot = i; m.e.flyH = 220; m.cd = 2 + i * 1.3;
    }
    this.say('雨幕里掠过几道带着电光的影子——雷鳐循着雷暴来了！', 'warn');
  }
  private rayTick(m: Mob, dt: number, dP: number) {
    const g = this.game, e = m.e, p = g.player;
    if (m.st === 'dive') { m.alpha = Math.max(0, m.alpha - dt); e.flyH += 120 * dt; return; }
    m.alpha = Math.min(1, m.alpha + dt);
    if (g.jueyu.deep.active && m.st === 'glide') m.cd = Math.max(m.cd, 1);   // 收官 B3：人在水下，在水面上空盘旋的雷鳐够不着（不引雷）
    if (m.st === 'glide') {
      m.orbitA = (m.orbitA ?? 0) + dt * 0.7;
      const R = 760 + 120 * Math.sin(this.t * 0.5 + m.slot);
      const tx = p.x + Math.cos(m.orbitA) * R, ty = p.y + Math.sin(m.orbitA) * R * 0.75;
      const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
      if (d > 2) { const v = Math.min(e.speed, d * 2.2); m.vx += (dx / d * v - m.vx) * Math.min(1, dt * 2); m.vy += (dy / d * v - m.vy) * Math.min(1, dt * 2); }
      e.x += m.vx * dt; e.y += m.vy * dt; m.ang = Math.atan2(m.vy, m.vx); e.facing = m.vx > 0 ? 1 : -1;
      e.flyH += (230 + 30 * Math.sin(this.t + m.slot) - e.flyH) * Math.min(1, dt * 2);
      if (m.cd <= 0 && dP < 1100) {
        m.st = 'mark'; m.t = 0; m.aim = { x: p.x, y: p.y, dx: e.x, dy: e.y };
        this.zaps.push({ x: p.x, y: p.y, t0: this.t, warn: 0.9, r: 140, raw: e.atk * 1.3, realm: e.realm, src: e, done: false, kind: 'ray' });
      }
    } else if (m.st === 'mark') {
      // 俯冲：引着一道雷砸到预警圈上
      const A = m.aim!, u = sstep(0.45, 0.9, m.t);
      e.x = A.dx + (A.x - A.dx) * u; e.y = A.dy + (A.y - A.dy) * u; e.flyH = 230 * (1 - u) + Math.max(0, p.z - 40) * u;
      m.ang = Math.atan2(A.y - A.dy, A.x - A.dx); e.anim.atk = u;
      if (m.t > 1.0) { m.st = 'climb'; m.t = 0; m.vx = Math.cos(m.ang) * 500; m.vy = Math.sin(m.ang) * 500; }
    } else if (m.st === 'climb') {
      e.x += m.vx * dt; e.y += m.vy * dt; e.flyH += 260 * dt; e.anim.atk = Math.max(0, e.anim.atk - dt * 2);
      if (m.t > 0.9) { m.st = 'glide'; m.cd = 3 + 2.5 * this.rnd(m); m.orbitA = Math.atan2(e.y - p.y, e.x - p.x); }
    }
  }

  // ================================================================ 雷、浪、锚链、墨雾
  private hazardTick(dt: number) {
    const g = this.game, p = g.player, c = g.combat, t = this.t;
    for (const z of this.zaps) {
      if (z.done || t < z.t0 + z.warn) continue;
      z.done = true;
      this.fx('bolt', z.x, z.y, z.r);
      if (Math.hypot(p.x - z.x, p.y - z.y) < z.r && p.z < 320) c.hitPlayer(z.raw, z.realm, { k: 'shock', dur: 1.2, ch: 0.5 }, z.x, z.y, z.src ?? undefined);
      audio.sfx('thunder');
    }
    this.zaps = this.zaps.filter((z) => t < z.t0 + z.warn + 0.4);
    for (const w of this.waves) {
      const r = (t - w.t0) * w.sp;
      if (!w.hit && p.z < 170) {
        const d = Math.hypot(p.x - w.x, (p.y - w.y) / 0.8);
        if (Math.abs(d - r) < 80) {
          w.hit = true; c.hitPlayer(w.raw, w.realm, undefined, w.x, w.y, w.src);
          const k = 650 * (1 - r / w.R * 0.5); this.shove((p.x - w.x) / (d || 1) * k, (p.y - w.y) / (d || 1) * k, 0.45);
          if (g.jueyu.swimming) g.jueyu.stagger = Math.max(g.jueyu.stagger, 0.5);
        }
      }
    }
    this.waves = this.waves.filter((w) => (t - w.t0) * w.sp < w.R);
    for (const ch of this.chains) {
      ch.t += dt;
      const src = ch.src.e;
      if (ch.st === 'fly') {
        ch.x += ch.vx * dt; ch.y += ch.vy * dt;
        if (Math.hypot(ch.x - p.x, ch.y - p.y) < 80 && p.z < 260 && !c.invulnT) {
          ch.st = 'pull'; ch.t = 0;
          c.hitPlayer(src.atk * 0.9, src.realm, { k: 'root', dur: 0.6, ch: 1 }, src.x, src.y, src);
          this.say('锚链钩住了你，往船灵那边猛拽！', 'warn');
        } else if (ch.t > ch.life) { ch.st = 'back'; ch.t = 0; }
      } else if (ch.st === 'pull') {
        const dx = src.x - p.x, dy = src.y - p.y, d = Math.hypot(dx, dy);
        if (d > 120) { const v = 900 * dt; p.x += dx / d * v; p.y += dy / d * v; }
        ch.x = p.x; ch.y = p.y;
        if (ch.t > 0.35) { ch.st = 'back'; ch.t = 0; }
      } else {
        ch.x += (src.x - ch.x) * Math.min(1, dt * 8); ch.y += (src.y - ch.y) * Math.min(1, dt * 8);
      }
      ch.x0 = src.x; ch.y0 = src.y;
    }
    this.chains = this.chains.filter((ch) => !(ch.st === 'back' && ch.t > 0.4) && !ch.src.e.dead);
    this.inks = this.inks.filter((k) => t < k.t0 + k.life);
  }
  private inkAt(x: number, y: number): number {
    let k = 0; const t = this.t;
    for (const s of this.inks) { const age = t - s.t0, fade = sstep(0, 0.6, age) * (1 - sstep(s.life - 1.5, s.life, age)); k = Math.max(k, (1 - sstep(s.r * 0.6, s.r * 1.2, Math.hypot(x - s.x, y - s.y))) * fade); }
    return k;
  }
  /** 推人一把（浪、尾巴、咆哮） */
  private shove(vx: number, vy: number, t: number) { this.push.vx = vx; this.push.vy = vy; this.push.t = t; }

  // ================================================================ 血腥连锁
  private startChain(cx: number, cy: number, byJiao: boolean) {
    const g = this.game, t = this.t;
    if (this.chain && t - this.chain.t0 < this.chain.T) { this.chain.n = Math.min(3, this.chain.n + (byJiao ? 1 : 0)); this.chain.cx = cx; this.chain.cy = cy; return; }
    this.chain = { cx, cy, t0: t, n: 1 + Math.min(1, this.jiaoKills), T: BLOOD_T, warned: false };
    this.say(byJiao ? '玄蛟的血把整片海都染黑了——更深处，又有东西醒了。快走！' : '血腥味在水里散开了……三十息之内，深处的东西就会循着味道上来。杀完就走，绝不恋战！', 'warn');
    audio.sfx('bell');
  }
  /** 试玩 / 测试：在人脚下直接起一波血腥连锁（T 秒后蛟到） */
  forceChain(T = BLOOD_T) { const [cx, cy] = this.toHome(this.game.player.x, this.game.player.y); this.chain = { cx, cy, t0: this.t, n: 1, T, warned: false }; }
  private chainTick(_dt: number) {
    const ch = this.chain; if (!ch) return;
    const g = this.game, p = g.player, t = this.t, [pcx, pcy] = this.toHome(p.x, p.y), age = t - ch.t0, d = Math.hypot(pcx - ch.cx, pcy - ch.cy);
    // 飞远了就甩掉
    if (d > BLOOD_LOSE) { this.chain = null; this.say('血腥味淡了，身后的海面重归死寂——甩掉了。', 'good'); return; }
    // 后半段：远处一条巨大的蛟影朝血迹游来（看得见的倒计时）
    if (age > ch.T * 0.5 && !ch.warned) {
      ch.warned = true;
      const a = Math.atan2(pcy - ch.cy, pcx - ch.cx) + Math.PI * 0.8, s = this.makeShade(-(50000 + Math.floor(t)), 'liehai', 0, 0, 5);
      s.cx = ch.cx + Math.cos(a) * 6000; s.cy = ch.cy + Math.sin(a) * 6000; s.summoned = true; s.mood = 'seek'; s.a = 0; s.cool = 0;
      this.shades.push(s);
      this.say('脚下的海水在发暗——有一条极长的影子正从深处游上来！', 'warn');
    }
    if (age < ch.T) return;
    // 时候到了：从深处破水突袭
    this.chain = null;
    if (g.terrain.isLand(p.x, p.y)) return;
    this.shades = this.shades.filter((s) => !(s.summoned && s.sp === 'liehai' && s.mood === 'seek'));
    for (let i = 0; i < ch.n; i++) {
      const a = H(Math.floor(t), i, 7700) * Math.PI * 2, r = 260 + i * 500;
      const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r * 0.8;
      const m = this.spawn('liehai', x, y, ++this.groupN, null, (Math.floor(t * 13) + i * 104729) | 0);
      if (!m) continue;
      m.slot = i; this.jiaoInit(m, true);
      this.fx('burst', x, y, 420); this.fx('column', x, y, 1000);
    }
    g.juice(0.08, 1); audio.sfx('boom');
    this.say(ch.n > 1 ? `海面接连炸开——${ch.n} 条裂海玄蛟破水而出！` : '海面轰然炸开——裂海玄蛟循着血腥味破水而出！', 'warn');
  }

  // ================================================================ 覆海玄鲸
  /** 此刻鲸在哪（大陆坐标，按游戏时间算：换图不跳，两张图看到的是同一头）、什么状态 */
  whaleAt(t0: number) {
    const t = t0 + this.whaleShift, W = WHALE, th = (t / W.loop) * Math.PI * 2;
    const cx = W.cx + Math.cos(th) * W.rx, cy = W.cy + Math.sin(th) * W.ry;
    const ang = Math.atan2(Math.cos(th) * W.ry, -Math.sin(th) * W.rx);
    const ph = ((t + 37) % W.period + W.period) % W.period;
    let st: 'up' | 'warn' | 'dive' | 'under' | 'rise' = ph < 200 ? 'up' : ph < 208 ? 'warn' : ph < 212 ? 'dive' : ph < 292 ? 'under' : 'rise';
    let k = st === 'up' || st === 'warn' ? 1 : st === 'dive' ? 1 - (ph - 208) / 4 : st === 'rise' ? (ph - 292) / 8 : 0;
    const wet = st === 'warn' ? (ph - 200) / 8 : st === 'dive' ? 1 : st === 'rise' ? 1 - k : 0;
    // 被惊动：三息示警，再四息沉下去，一直沉到这一轮该浮起的时候
    const P = W.period, s = t - this.whale.startle;
    let wetK = wet;
    if (s >= 0 && s < P) {
      const ph0 = ((this.whale.startle + 37) % P + P) % P, wait = ((292 - ph0) % P + P) % P;
      if (s < wait) {
        if (s < 3) { if (st === 'up') { st = 'warn'; wetK = Math.max(wetK, s / 3); } }
        else if (s < 7) { st = 'dive'; k = Math.min(k, 1 - (s - 3) / 4); wetK = 1; }
        else { st = 'under'; k = 0; wetK = 1; }
      }
    }
    return { cx, cy, ang, st, k, wet: wetK };
  }
  /** 一点（本图坐标）在不在鲸背上（浮着的时候） */
  onWhale(x: number, y: number): boolean {
    const W = this.whale; if (!(W.k > 0.85) || (W.st !== 'up' && W.st !== 'warn')) return false;
    return this.whaleLocal(x, y, (u, v) => (u - 280) ** 2 / 1200 ** 2 + v ** 2 / 440 ** 2 < 1 || (u + 1250) ** 2 / 220 ** 2 + v ** 2 / 380 ** 2 < 1 || (u - 215) ** 2 / 300 ** 2 + (Math.abs(v) - 640) ** 2 / 170 ** 2 < 1);
  }
  private whaleLocal<T>(x: number, y: number, f: (u: number, v: number) => T): T {
    // 按此刻这张图的平移现算（飞过中线换图的那一帧，泅水的判定先于鲸的每帧更新）
    const W = this.whale, fr = mapFrame(ACTIVE_MAP), dx = x - (W.cx + fr.dx), dy = y - (W.cy + fr.dy), c = Math.cos(W.ang), s = Math.sin(W.ang);
    return f(dx * c + dy * s, -dx * s + dy * c);
  }
  /** 贴图像素 → 鲸背上的本图坐标 */
  private whalePx(px: number, py: number): [number, number] {
    const W = this.whale, fr = mapFrame(ACTIVE_MAP), sc = WHALE.w / 1400, u = (700 - px) * sc, v = (py - 465) * sc, c = Math.cos(W.ang), s = Math.sin(W.ang);
    return [W.cx + fr.dx + u * c - v * s, W.cy + fr.dy + u * s + v * c];
  }
  /** 鲸此刻的位置、朝向、浮沉（换图、读档、瞬移之后先摆好：泅水的判定在这之前就要问「脚下是不是鲸背」） */
  private whalePose() {
    const W = this.whale, q = this.whaleAt(this.t), f = mapFrame(ACTIVE_MAP);
    W.cx = q.cx; W.cy = q.cy; W.ang = q.ang; W.k = q.k; W.wet = q.wet; W.st = q.st;
    W.x = q.cx + f.dx; W.y = q.cy + f.dy;
  }
  private whaleTick(dt: number) {
    const g = this.game, p = g.player, W = this.whale, t = this.t, J = g.jueyu;
    const prevSt = W.st;
    this.whalePose();
    // 站在背上：跟着鲸一起走（位置和朝向都带上）
    const stand = !p.flying && !J.swimming && !g.terrain.isLand(p.x, p.y);
    if (W.lastX === W.lastX && stand && this.onWhaleAt(p.x, p.y, W.lastX, W.lastY, W.lastA)) {
      const dx = p.x - W.lastX, dy = p.y - W.lastY, da = W.ang - W.lastA, c = Math.cos(da), s = Math.sin(da);
      p.x = W.x + dx * c - dy * s; p.y = W.y + dx * s + dy * c;
    }
    W.lastX = W.x; W.lastY = W.y; W.lastA = W.ang;
    W.onBack = stand && this.onWhale(p.x, p.y);
    // 罗盘：一定距离内标出方位
    const dist = Math.hypot(W.x - p.x, W.y - p.y);
    this.hud.whaleDist = J.profile && J.sea ? dist : Infinity; this.hud.whaleDir = Math.atan2(W.y - p.y, W.x - p.x); this.hud.whaleUp = W.st === 'up' || W.st === 'warn'; this.hud.whaleWarn = W.st === 'warn' && W.onBack;
    if (dist > 9000) return;
    // 下潜前示警
    if (W.st === 'warn' && prevSt !== 'warn' && dist < 2600) { this.say('鲸背微微震颤，海水从四面漫上来——它要下潜了！趁早飞起来。', 'warn'); g.juice(0.02, 0.35); audio.sfx('bell'); }
    if (W.st === 'dive' && prevSt === 'warn' && W.onBack) this.say('覆海玄鲸沉了下去，你一脚踏空落进了海里。', 'warn');
    if (W.st === 'up' && prevSt === 'rise' && dist < 4000) this.say('远处的海面缓缓隆起，覆海玄鲸浮上来了——背上苔草青青，像一座岛。', 'info');
    // 喷水：浮着的时候隔一阵喷一次，远远就看得见
    if (W.st === 'up') { W.spoutT -= dt; if (W.spoutT <= 0) { W.spoutT = 9; const [bx, by] = this.whalePx(BLOWHOLE_PX[0], BLOWHOLE_PX[1]); this.fx('spout', bx, by, 1); } }
    // 被打：惊得下潜
    if ((W.st === 'up') && !W.onBack) {
      for (const pr of g.combat.projs) if (pr.fac === 'p' && Math.abs(pr.x - W.x) < 1400 && Math.abs(pr.y - W.y) < 1400 && this.onWhale(pr.x, pr.y)) { W.startle = t; this.say('法术打在鲸背上——覆海玄鲸受了惊，要沉下去了！', 'warn'); break; }
    }
    // 背上：灵草（按天重生）、前人留下的东西
    if (!W.onBack) { W.gatherI = -1; W.gatherT = 0; return; }
    if (!(g.ws.flags as Record<string, unknown>).whaleSeen) { (g.ws.flags as Record<string, unknown>).whaleSeen = 1; g.hint('sea-whale', '你落在了覆海玄鲸的背上。这里有一缕微弱的灵脉——打坐回灵比别处快，核心海域里也回得上来；背上的灵草每天会重新长出来。它隔一阵要下潜，示警时赶紧飞起来。'); }
    const F = g.ws.flags as Record<string, unknown>, herbs = (F.whaleHerb ??= {}) as Record<string, number>, day = Math.floor(g.day);
    let near = -1;
    HERB_PX.forEach(([hx, hy], i) => { if (herbs[i] === day) return; const [x, y] = this.whalePx(hx, hy); if (Math.hypot(x - p.x, y - p.y) < 85) near = i; });
    const cacheWeek = Math.floor(g.day / 7), hasCache = (F.whaleCache as number | undefined) !== cacheWeek && H(cacheWeek, 1, 7800) < 0.5;
    if (hasCache) { const [x, y] = this.whalePx(CACHE_PX[0], CACHE_PX[1]); if (Math.hypot(x - p.x, y - p.y) < 85) near = 99; }
    if (near !== W.gatherI) { W.gatherI = near; W.gatherT = 0; }
    if (near >= 0) {
      W.gatherT += dt;
      if (W.gatherT > 0.9) {
        const C2 = g.combat;
        if (near === 99) {
          F.whaleCache = cacheWeek;
          const r = H(cacheWeek, 2, 7801), id = r < 0.4 ? 'mat_sb_jingxian' : r < 0.75 ? 'mat_lingshi' : 'mat_yaodan6', n = id === 'mat_lingshi' ? 800 + Math.floor(H(cacheWeek, 3, 7802) * 1600) : 1;
          C2.loot.push({ x: p.x, y: p.y, id, n, t: 0.6 });
          this.say('苔草里压着一只锈蚀的储物袋——不知是哪位渡海的前人留下的。', 'good');
        } else {
          herbs[near] = day;
          C2.loot.push({ x: p.x, y: p.y, id: 'mat_sb_lingcao', n: 1, t: 0.6 });
        }
        const [x, y] = near === 99 ? this.whalePx(CACHE_PX[0], CACHE_PX[1]) : this.whalePx(HERB_PX[near][0], HERB_PX[near][1]);
        this.fx('gather', x, y, 1); audio.sfx('gather');
        W.gatherI = -1; W.gatherT = 0;
      }
    }
  }
  private onWhaleAt(x: number, y: number, wx: number, wy: number, wa: number): boolean {
    const W = this.whale, fr = mapFrame(ACTIVE_MAP), sx = W.cx, sy = W.cy, sa = W.ang; W.cx = wx - fr.dx; W.cy = wy - fr.dy; W.ang = wa;
    const r = this.onWhale(x, y); W.cx = sx; W.cy = sy; W.ang = sa; return r;
  }
  /** 鲸背上打坐的地利（game.placeBonus 读）：微弱灵脉 */
  placeMult(x: number, y: number): { mult: number; name: string } | null { return this.whale.onBack && this.onWhale(x, y) ? { mult: 1.6, name: '鲸背灵脉' } : null; }
  /** 灵力：鲸背上不受核心区「不回复」的限制，打坐还多回一些（jueyu.manaTick 读） */
  get sanctuary(): boolean { return this.whale.onBack && !this.game.player.flying; }

  // ================================================================ 试玩 / 测试
  /** 在一点（本图坐标）放一条黑影（被气味引来、或正在巡游的） */
  debugShade(sp: Species, x: number, y: number, mood: Shade['mood'] = 'roam'): Shade {
    const [cx, cy] = this.toHome(x, y), s = this.makeShade(-(70000 + this.shades.length), sp, Math.floor(cx / SH_CELL), Math.floor(cy / SH_CELL), 6);
    s.cx = cx; s.cy = cy; s.summoned = mood !== 'roam'; s.mood = mood; s.a = 1;
    if (mood === 'roam') { s.tx = cx; s.ty = cy; s.R = 400; }
    this.shades.push(s); return s;
  }
  /** 在一点（本图坐标）直接破水出一只（一群）海兽：照常演出水面鼓包、水柱、跃出 */
  debugBreach(sp: Kind, x: number, y: number) {
    const s = this.debugShade(sp, x, y, 'seek');
    if (sp === 'chuanling') { this.shades.pop(); return this.spawnWraith(x, y, 4242, 1); }
    if (sp === 'leiyao') { this.shades.pop(); const m = this.spawn('leiyao', x, y, ++this.groupN, null, 777); if (m) { m.st = 'glide'; m.e.flyH = 220; m.alpha = 0; } return m; }
    s.mood = 'rise'; s.rise = 0.999; s.aimX = s.cx; s.aimY = s.cy;
    this.riseTick(s, 0.01);
    return this.mobs[this.mobs.length - 1] ?? null;
  }
  /** 当前在场的海兽（测试看） */
  get debug() { return { shades: this.shades.length, seeking: this.shades.filter((s) => s.mood === 'seek' || s.mood === 'rise').length, mobs: this.mobs.length, kinds: this.mobs.map((m) => m.kind), scents: this.scents.length, chain: this.chain }; }
  armsOf(e: Enemy): { st: string; e: Enemy; t: number; cd: number }[] { return this.mine.get(e)?.arms ?? []; }
  mobOf(e: Enemy) { return this.mine.get(e) ?? null; }
  shadesHome(): { id: number; sp: string; cx: number; cy: number }[] { return this.shades.map((s) => ({ id: s.id, sp: s.sp, cx: s.cx, cy: s.cy })); }

  // ================================================================ 给画面
  /** 后期着色器的黑影：最近的八个（本图坐标） */
  shadesFor(px: number, py: number): SeaShade[] {
    const out: SeaShade[] = [], t = this.t;
    for (const s of this.shades) {
      const [x, y] = this.toLocal(s.cx, s.cy), d = Math.hypot(x - px, y - py);
      if (d > 5200 + s.len) continue;
      out.push({ x, y, len: s.len, a: s.a * (s.sp === 'school' ? 0.5 : 0.85) * (1 - sstep(4200, 5200 + s.len, d)), ang: s.ang, ph: t * (s.sp === 'liehai' ? 1.6 : 2.6) + (s.seed & 255), kind: SHADE_KIND[s.sp], rise: s.mood === 'rise' ? s.rise : 0, n: s.n });
    }
    // 潜在水下的蛟、正在下潜 / 浮起的鲸
    for (const m of this.mobs) {
      if (m.kind === 'liehai' && (m.st === 'under' || m.st === 'diveDown')) out.push({ x: m.e.x, y: m.e.y, len: 2400, a: 0.7, ang: m.ang, ph: t * 1.6, kind: 3, rise: m.st === 'under' ? sstep(0.8, 1.7, m.t) : 0, n: 1 });
    }
    const W = this.whale;
    if (W.k < 0.98 && Math.hypot(W.x - px, W.y - py) < 6000) out.push({ x: W.x, y: W.y, len: WHALE.w * 0.95, a: 0.6 * (1 - W.k * 0.6), ang: W.ang, ph: t * 0.8, kind: 4, rise: W.st === 'rise' ? 1 - W.k : 0, n: 1 });
    out.sort((a, b) => Math.hypot(a.x - px, a.y - py) - Math.hypot(b.x - px, b.y - py));
    return out.slice(0, 8);
  }
  private V: SeaView = { sprites: [], ribbons: [], flats: [] };
  /** 出招时用哪一帧（-1 = 不是出招） */
  private pose(m: Mob): number {
    const s = m.st;
    switch (m.kind) {
      case 'guichi': return m.leap && m.leap.bit !== undefined && m.st !== 'leapOut' ? (m.leap.t / m.leap.dur < 0.45 ? 2 : 3) : s === 'wind' ? 2 : -1;
      case 'mochu': return s === 'inkWind' ? 2 : s === 'roarWind' ? 3 : -1;
      case 'liehai': return s === 'thunderWind' ? 3 : s === 'chargeWind' || s === 'charge' || s === 'burst' || s === 'tailWind' ? 2 : -1;
      case 'chuanling': return s === 'hookWind' ? 2 : s === 'fireWind' ? 3 : -1;
      case 'leiyao': return s === 'mark' ? (m.t > 0.8 ? 3 : 2) : -1;
    }
  }
  /** HD 场景要画的（hd2d/seathings.ts 每帧读） */
  view(): SeaView {
    const V = this.V, g = this.game, t = this.t;
    V.sprites.length = 0; V.ribbons.length = 0; V.flats.length = 0;
    // 收官 B3：灵舟、海渊的遗迹与守卫、鬼船与祭坛（同伴、灵宠先站到甲板上）
    const J = g.jueyu; J.preRender(); J.boat.view(V); J.deep.view(V); J.qiyu.view(V);
    if (this.off) return V;
    const under = J.deep.k > 0.5;
    if (under) this.underView(V);
    for (const m of this.mobs) {
      const e = m.e, A = e.anim as typeof e.anim & { dead?: number };
      // 按状态切帧：0、1 待机，2、3 攻击（各有各的那一帧），4 受击，5 死亡
      const frame = (base: string) => {
        const pose = this.pose(m);
        const st = e.dead ? 5 : A.hit > 0.3 ? 4 : pose >= 0 ? pose : Math.floor(t * 2.5 + m.slot) % 2;
        return `${base}_${st}`;
      };
      const flash = e.hitFlash > 0 ? Math.min(1, e.hitFlash * 8) : 0, alpha = m.alpha * (e.dead ? Math.max(0, 1 - e.deathT / 0.8) : 1);
      if (under && (m.kind === 'leiyao' || m.kind === 'chuanling')) continue;   // 收官 B3：水面上空的东西，水下看不见
      const sk = this.skin?.[m.kind];
      if (m.kind === 'leiyao') {
        V.flats.push({ tint: sk?.tint, key: frame('sb_leiyao'), x: e.x, y: e.y, z: e.flyH + e.lift + 40, ang: m.ang, w: 300, h: 300 * 0.62, alpha, wet: 0, flap: m.st === 'mark' ? 0.2 : 1, t: t + m.slot, shake: flash });
        continue;
      }
      const H0 = m.kind === 'guichi' ? 150 : m.kind === 'mochu' ? 420 : m.kind === 'liehai' ? 400 : 210;
      // 程序动画：挤压拉伸（跃出水面时拉长、落水压扁）、上下起伏
      let sx = 1, sy = 1, rot = 0;
      if (m.leap) { const u = m.leap.t / m.leap.dur, v = Math.cos(u * Math.PI); sy = 1 + 0.12 * Math.abs(v); sx = 1 - 0.06 * Math.abs(v); rot = -v * 0.35 * e.facing; }
      else { const b = Math.sin(t * 2.4 + m.seed); sy = 1 + 0.025 * b; sx = 1 - 0.015 * b; }
      if (m.kind === 'mochu') { sy *= 1 + 0.04 * Math.sin(t * 1.7); sx *= 1 + 0.03 * Math.sin(t * 1.7 + 1); }
      if (m.kind === 'chuanling') rot = Math.sin(t * 1.1 + m.seed) * 0.05;
      V.sprites.push({ key: frame(`sb_${m.kind}`), x: e.x, y: e.y, lift: (m.kind === 'chuanling' ? e.lift : m.lift), H: H0, face: e.facing, alpha, flash, sx, sy, rot: rot + (e.dead ? 0.6 * e.facing * Math.min(1, e.deathT * 2) : 0), glow: Math.max(sk?.glowK ?? 0, m.kind === 'chuanling' ? 0.5 : m.kind === 'liehai' ? 0.25 : 0), tint: sk?.tint, glowCol: sk?.glow });
      // 沉到水线：sink 是立板高度的几成在水下，用 lift 往下压，水线以下由 seathings 裁掉
      // 收官 B3：人在水下时，海兽整条都看得见（浮在海底上方，不按水线裁）
      { const q = V.sprites[V.sprites.length - 1]; if (under) { q.noClip = true; q.lift = Math.max(40, q.lift) + 30 * Math.sin(t * 1.3 + m.seed); } else q.lift -= m.sink * H0 * sy; }
      if (m.arms) for (const a of m.arms) if (a.st !== 'gone') V.ribbons.push({ id: (m.seed ^ (a.i * 131)) | 0, kind: 'arm', n: a.w.length, pts: a.pts, w: a.w, alpha: m.alpha, flash: a.e.hitFlash > 0 ? 1 : 0, tint: sk?.tint });
      if (m.ribbon) { m.ribbon.tint = sk?.tint; V.ribbons.push(m.ribbon); }
    }
    const W = this.whale;
    if (!under && W.k > 0.02 && Math.hypot(W.x - g.player.x, W.y - g.player.y) < 7000) V.flats.push({ key: 'sb_fuhai', x: W.x, y: W.y, z: -6 + 10 * W.k, ang: W.ang, w: WHALE.w, h: WHALE.h, alpha: Math.min(1, W.k * 1.3), wet: W.wet, flap: 0, t, shake: W.st === 'warn' ? 1 : 0 });
    return V;
  }

  /**
   * 收官 B3：人在水下——黑影就是本体。按种类画成整条的立板（凶鱼一群几条、海魔的头、蛟头带一串身节），浮在海底上方，
   * 越远越淡（水下的光只照得到身边）。破水以后的 Enemy 照常在上面那一段画。
   */
  private underView(V: SeaView) {
    const p = this.game.player, t = this.t;
    for (const s of this.shades) {
      if (s.mood === 'rise') continue;
      const [x, y] = this.toLocal(s.cx, s.cy), d = Math.hypot(x - p.x, y - p.y);
      if (d > 3200 + s.len) continue;
      const a = s.a * (1 - sstep(1800, 3200 + s.len * 0.5, d)); if (a < 0.03) continue;
      const face = Math.cos(s.ang) >= 0 ? 1 : -1, fr = Math.floor(t * 2.5 + (s.seed & 7)) % 2, bob = Math.sin(t * 1.4 + (s.seed & 31)) * 20;
      if (s.sp === 'school' || s.sp === 'guichi') {
        const n = Math.min(s.n, 6), big = s.sp === 'guichi';
        for (let i = 0; i < n; i++) { const ox = (H(s.id, i, 7901) - 0.5) * s.len * 0.7, oy = (H(s.id, i, 7902) - 0.5) * s.len * 0.4; V.sprites.push({ key: `sb_guichi_${(fr + i) % 2}`, x: x + ox, y: y + oy, lift: 70 + bob + i * 9, H: big ? 150 : 70, face, alpha: a, flash: 0, sx: 1, sy: 1, rot: Math.sin(t * 3 + i) * 0.06, glow: 0, noClip: true, tint: big ? undefined : [0.7, 0.8, 0.85] }); }
      } else if (s.sp === 'mochu') {
        V.sprites.push({ key: `sb_mochu_${fr}`, x, y, lift: 60 + bob, H: 420, face, alpha: a, flash: 0, sx: 1, sy: 1 + 0.04 * Math.sin(t * 1.7), rot: 0, glow: 0.15, noClip: true });
      } else if (s.sp === 'liehai') {
        // 蛟：头在前，身子一节节往后拖，蛇行
        for (let i = 7; i >= 1; i--) { const bx = x - Math.cos(s.ang) * i * 150, by = y - Math.sin(s.ang) * i * 110 + Math.sin(t * 2 - i * 0.7) * 50; V.sprites.push({ key: i === 7 ? 'sb_liehai_body_1' : 'sb_liehai_body_0', x: bx, y: by, lift: 80 + bob + Math.sin(t * 2.2 - i * 0.6) * 30, H: 150 - i * 6, face, alpha: a, flash: 0, sx: 1, sy: 1, rot: 0, glow: 0.2, noClip: true, glowCol: [0.45, 0.65, 1] }); }
        V.sprites.push({ key: `sb_liehai_${fr}`, x, y, lift: 90 + bob, H: 400, face, alpha: a, flash: 0, sx: 1, sy: 1, rot: 0, glow: 0.3, noClip: true, glowCol: [0.45, 0.65, 1] });
      }
    }
  }
  /** 收官 B3：水下的光源——会发光的海兽（船灵、雷鳐、蛟的眼），别的海兽身上一点微光（看得清它们在哪） */
  lightsFor(px: number, py: number): { x: number; y: number; r: number; a: number; c: RGB }[] {
    const out: { x: number; y: number; r: number; a: number; c: RGB }[] = [];
    for (const m of this.mobs) {
      const e = m.e; if (e.dead || Math.hypot(e.x - px, e.y - py) > 2600) continue;
      const c: RGB = m.kind === 'chuanling' ? [0.45, 1, 0.8] : m.kind === 'leiyao' ? [0.6, 0.8, 1] : m.kind === 'liehai' ? [0.5, 0.7, 1] : [0.6, 0.8, 0.85];
      out.push({ x: e.x, y: e.y, r: m.kind === 'liehai' || m.kind === 'mochu' ? 420 : 240, a: m.kind === 'chuanling' || m.kind === 'leiyao' ? 0.8 : 0.4, c });
    }
    for (const s of this.shades) { if (s.sp === 'school' || s.len < 800) continue; const [x, y] = this.toLocal(s.cx, s.cy); if (Math.hypot(x - px, y - py) < 2200) out.push({ x, y, r: 260, a: 0.3, c: [0.5, 0.7, 1] }); }
    return out;
  }
  /**
   * 收官 B3：没有 WebGL（纯 2D 回退）时鲸背、触须、蛟身也要画——原来只在 HD 场景里有网格，2D 下人站在看不见的鲸背上。
   * under：鲸背（贴在海面上的一整张图）；over：触须、蛟身（沿曲线描一串渐细的笔画，离水面越高越往上画）。
   */
  draw2D(ctx: CanvasRenderingContext2D, layer: 'under' | 'over') {
    const W = this.whale, g = this.game;
    if (layer === 'under') {
      if (W.k > 0.02 && Math.hypot(W.x - g.player.x, W.y - g.player.y) < 7000) {
        const im = seaImg('sb_fuhai');
        ctx.save(); ctx.translate(W.x, W.y); ctx.rotate(W.ang + Math.PI); ctx.globalAlpha = Math.min(1, W.k * 1.3);
        if (im) ctx.drawImage(im, -WHALE.w / 2, -WHALE.h / 2, WHALE.w, WHALE.h);
        else { ctx.fillStyle = '#2b3b38'; ctx.beginPath(); ctx.ellipse(0, 0, WHALE.w * 0.45, WHALE.h * 0.3, 0, 0, Math.PI * 2); ctx.fill(); }
        if (W.wet > 0) { ctx.globalAlpha = W.wet * 0.7; ctx.fillStyle = '#0c1b1e'; ctx.beginPath(); ctx.ellipse(0, 0, WHALE.w * 0.5, WHALE.h * 0.33, 0, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
      return;
    }
    const strokeRib = (pts: Float32Array, w: Float32Array, n: number, col: string, edge: string) => {
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let pass = 0; pass < 2; pass++) for (let i = 1; i < n; i++) {
        const z0 = pts[i * 3 - 1], z1 = pts[i * 3 + 2]; if (z0 < -10 && z1 < -10) continue;
        ctx.strokeStyle = pass ? col : edge; ctx.lineWidth = w[i] * 1.1 * (pass ? 0.75 : 1);   // 半宽的一倍多：HD 里带子是朝镜头展开的，2D 里整宽描出来太粗
        ctx.beginPath(); ctx.moveTo(pts[i * 3 - 3], pts[i * 3 - 2] - Math.max(0, z0)); ctx.lineTo(pts[i * 3], pts[i * 3 + 1] - Math.max(0, z1)); ctx.stroke();
      }
      ctx.restore();
    };
    for (const m of this.mobs) {
      if (m.alpha < 0.05) continue;
      ctx.globalAlpha = m.alpha;
      if (m.arms) for (const a of m.arms) if (a.st !== 'gone') strokeRib(a.pts, a.w, a.w.length, '#4a2c5e', '#1c0f26');
      if (m.ribbon && m.st !== 'under') strokeRib(m.ribbon.pts, m.ribbon.w, m.ribbon.n, '#26324a', '#0b1020');
      ctx.globalAlpha = 1;
    }
  }
  /** 特效（jueyu.drawGL 末尾调）：破水、水柱、浪圈、雷、墨雾、锚链、鲸背上的灵光 */
  drawGL(F: FxSys, _t: number, dt: number) { const _p = prof.t(); this.drawInner(F, dt); prof.add('FX·海兽', _p); }
  private drawInner(F: FxSys, dt: number) {
    const g = this.game, p = g.player, t = this.t;
    const WATER: RGB = [0.82, 0.92, 0.96], FOAM: RGB = [0.92, 0.97, 1], INK: RGB = [0.05, 0.03, 0.08], BOLT: RGB = [0.7, 0.85, 1], GHOST: RGB = [0.45, 1, 0.8];
    const under = this.game.jueyu.deep.k > 0.5;   // 收官 B3：人在水下——水花、水柱、浪圈都换成一团团往上冒的气泡
    for (const ev of this.fxq) {
      if (Math.abs(ev.x - p.x) > 3200 || Math.abs(ev.y - p.y) > 2600) continue;
      if (under && ev.k !== 'ink' && ev.k !== 'mist' && ev.k !== 'gather' && ev.k !== 'bolt') {
        const n = ev.k === 'column' || ev.k === 'burst' ? 22 : 8;
        for (let i = 0; i < n; i++) F.emit({ x: ev.x + (Math.random() - 0.5) * Math.min(400, ev.s), y: ev.y + (Math.random() - 0.5) * Math.min(200, ev.s * 0.5), z: -30 - Math.random() * 80, vy: -80 - Math.random() * 160, vx: (Math.random() - 0.5) * 40, life: 1 + Math.random() * 0.8, s0: 6 + Math.random() * 12, s1: 14, c: [0.75, 0.95, 1], a: 0.6, add: 1, cell: C.RingSoft });
        continue;
      }
      switch (ev.k) {
        case 'splash': F.sparks(ev.x, ev.y - 10, WATER, 10 + Math.floor(ev.s / 10), 260 + ev.s * 2, 0.6, 5, -Math.PI / 2, 2.2); F.shockRing(ev.x, ev.y, ev.s, FOAM, 0.5, 0.5, 0.7, true); break;
        case 'bubbles': F.ground(C.RingSoft, ev.x, ev.y, ev.s * 1.4, t, FOAM, 0.45, 1, 0.5); for (let i = 0; i < 5; i++) F.emit({ x: ev.x + (Math.random() - 0.5) * ev.s * 1.6, y: ev.y + (Math.random() - 0.5) * ev.s, vy: -40, life: 0.6, s0: 12, s1: 26, c: FOAM, a: 0.5, add: 0, cell: C.Disc, groundMotion: true }); break;
        case 'ring': if (ev.s > 0) F.shockRing(ev.x, ev.y, ev.s, FOAM, 0.6, 0.5, 0.8, true); break;
        case 'burst': F.shockRing(ev.x, ev.y, ev.s * 1.6, FOAM, 0.7, 0.5, 1, true); F.shock(ev.x, ev.y, ev.s * 2, 9, 0.5); for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2; F.emit({ x: ev.x + Math.cos(a) * ev.s * 0.3, y: ev.y + Math.sin(a) * ev.s * 0.22, vx: Math.cos(a) * 320, vy: Math.sin(a) * 200 - 160, life: 0.9, s0: 40, s1: 120, c: FOAM, a: 0.55, add: 0, cell: C.Smoke, drag: 1.2, grav: 160 }); } F.sparks(ev.x, ev.y - 20, WATER, 40, 700, 0.9, 7, -Math.PI / 2, 1.6); break;
        case 'column': {
          // 冲天的水柱：一束顺着速度拉长的白色水线（芯），裹着一团团翻滚的白沫（身），顶上散开水雾、落下大水珠
          const S2 = ev.s;
          for (let i = 0; i < 34; i++) { const a = (Math.random() - 0.5) * 0.35, v = S2 * (1.5 + Math.random() * 0.9); F.emit({ x: ev.x + (Math.random() - 0.5) * 60, y: ev.y, vx: Math.sin(a) * v * 0.3, vy: -v, life: 0.8 + Math.random() * 0.5, s0: 16, s1: 9, c: FOAM, a: 0.9, add: 0, cell: C.Water, grav: S2 * 2.2, stretch: 0.07 }); }
          for (let i = 0; i < 22; i++) { const v = S2 * (0.5 + Math.random() * 1.3); F.emit({ x: ev.x + (Math.random() - 0.5) * 110, y: ev.y, vx: (Math.random() - 0.5) * 140, vy: -v, life: 1.1 + Math.random() * 0.6, s0: 46, s1: 150, c: FOAM, a: 0.6, add: 0, cell: C.Smoke, grav: S2 * 1.3, drag: 0.7, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 2 }); }
          for (let i = 0; i < 18; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = 200 + Math.random() * 380; F.emit({ x: ev.x, y: ev.y, z: -S2 * 0.9, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.0 + Math.random() * 0.5, s0: 30, s1: 60, c: WATER, a: 0.85, add: 0, cell: C.Water, grav: 900 }); }
          // 柱身：一摞往上叠的白沫团，一出来就是一根柱子的样子（再慢慢散、落回去）
          for (let i = 0; i < 14; i++) { const k = i / 13; F.emit({ x: ev.x + (Math.random() - 0.5) * 50 * (1 - k * 0.5), y: ev.y, z: -S2 * 1.1 * k, vx: (Math.random() - 0.5) * 60, vy: -120 - 200 * k, life: 1.0 + 0.5 * k, s0: 70 + 40 * (1 - k), s1: 170 + 90 * k, c: FOAM, a: 0.72, add: 0, cell: C.Smoke, grav: 260, drag: 0.8, rot: Math.random() * 6 }); }
          F.shockRing(ev.x, ev.y, S2 * 0.7, FOAM, 0.6, 0.5, 0.9, true);
          F.ground(C.Disc, ev.x, ev.y, S2 * 0.35, 0, FOAM, 0.5, 0, 0.5);
          F.flash(ev.x, ev.y - 60, 180, [0.85, 0.95, 1]);
          break;
        }
        case 'spout': {
          const S = 1;
          for (let i = 0; i < 30; i++) F.emit({ x: ev.x + (Math.random() - 0.5) * 40, y: ev.y, vx: (Math.random() - 0.5) * 80, vy: -(700 + Math.random() * 300) * S, life: 1.6, s0: 20, s1: 70, c: FOAM, a: 0.6, add: 0, cell: C.Water, grav: 520, drag: 0.2 });
          for (let i = 0; i < 6; i++) F.emit({ x: ev.x + (Math.random() - 0.5) * 90, y: ev.y - 700, vx: (Math.random() - 0.5) * 60, vy: 40, life: 2.2, s0: 80, s1: 200, c: FOAM, a: 0.3, add: 0, cell: C.Smoke, drag: 0.8 });
          break;
        }
        case 'ink': for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2, r = Math.random() * ev.s * 0.6; F.smoke(ev.x + Math.cos(a) * r, ev.y + Math.sin(a) * r * 0.7, 2, INK, 0.7, ev.s * 0.15, ev.s * 0.35); } break;
        case 'mist': for (let i = 0; i < 10; i++) F.emit({ x: ev.x + (Math.random() - 0.5) * ev.s, y: ev.y - 60 - Math.random() * 80, vy: -40, life: 1.4, s0: 20, s1: 6, c: GHOST, a: 0.8, add: 1, cell: C.Glow }); break;
        case 'gather': F.sparks(ev.x, ev.y - 20, [0.6, 1, 0.95], 22, 220, 0.9, 4, -Math.PI / 2, 1.2); F.flash(ev.x, ev.y - 20, 90, [0.6, 1, 0.9]); break;
        case 'bolt': F.bolt(ev.x, ev.y, ev.x, ev.y, Math.floor(Math.random() * 65535), 60, 10, BOLT, 1, 14, true, [-1400, 0]); F.flash(ev.x, ev.y - 30, ev.s * 1.2, BOLT); F.shockRing(ev.x, ev.y, ev.s * 1.4, BOLT, 0.45, 0.5, 1, true); F.sparks(ev.x, ev.y - 20, BOLT, 20, 520, 0.5, 4); break;
      }
    }
    this.fxq.length = 0;
    // 水线上的涟漪：每只露出水面的海兽身边一圈（人在水下时没有水线）
    if (!under) for (const m of this.mobs) {
      const e = m.e; if (e.dead || m.alpha < 0.3 || m.kind === 'leiyao' || m.kind === 'chuanling') continue;
      if (Math.abs(e.x - p.x) > 2800 || Math.abs(e.y - p.y) > 2200) continue;
      if (m.lift < 20) { const r = (m.kind === 'mochu' ? 260 : m.kind === 'liehai' ? 170 : 70) * (1 + 0.08 * Math.sin(t * 3 + m.seed)); F.ground(C.RingSoft, e.x, e.y, r, t * 0.5, FOAM, m.kind === 'guichi' ? 0.2 : 0.12, 1, 0.5); if (Math.random() < dt * 4) F.shockRing(e.x, e.y, r * 1.3, FOAM, 0.9, 0.5, 0.25, true); }
      if (m.arms) for (const a of m.arms) { if (a.st === 'gone') continue; const ex = a.pts[0], ey = a.pts[1]; F.ground(C.RingSoft, ex, ey, 70 + 8 * Math.sin(t * 4 + a.i), 0, FOAM, 0.3, 1, 0.5); if (a.st === 'slam' && a.t < 0.85) { F.beam(ex, ey, ex + Math.cos(a.dir) * a.L * 0.98, ey + Math.sin(a.dir) * a.L * 0.72, 130, [1, 0.35, 0.3], 0.22 + 0.15 * Math.sin(a.t * 18), C.Beam, 1, [0, 0]); } }
      if (m.ribbon && m.st !== 'under') { const R = m.ribbon; for (let i = 2; i < R.n; i += 3) { if (R.pts[i * 3 + 2] > -20 && R.pts[i * 3 + 2] < 30) F.ground(C.RingSoft, R.pts[i * 3], R.pts[i * 3 + 1], 120, 0, FOAM, 0.22, 1, 0.5); } }
      // 冲撞的预警线、潜下去之后人脚下越收越紧的预警圈
      if (m.st === 'chargeWind' && m.aim) F.beam(e.x, e.y, e.x + m.aim.dx * 2000, e.y + m.aim.dy * 1700, 220, [1, 0.3, 0.25], 0.18 + 0.12 * Math.sin(m.t * 16), C.Beam, 1, [0, 0]);
    }
    for (const m of this.mobs) if (m.kind === 'liehai' && m.st === 'under') { const u = Math.min(1, m.t / 1.7); F.ground(C.RingSoft, m.e.x, m.e.y, 520 - 300 * u, t, [1, 0.3, 0.25], 0.35 + 0.35 * u, 1, 0.5); F.ground(C.Disc, m.e.x, m.e.y, 240, 0, [0.05, 0.05, 0.1], 0.35 * u, 0, 0.5); }
    // 船灵的灯、锚链
    // 船灵：雾里透出来的一团幽光（特效层在雾之上，人在雾里也看得见它在哪）
    for (const m of this.mobs) if (m.kind === 'chuanling' && !m.e.dead && m.alpha > 0.1) { const e = m.e; F.glow(e.x, e.y - e.lift - 110, 170 + 20 * Math.sin(t * 2 + m.seed), GHOST, 0.22 * m.alpha); if (Math.random() < dt * 6) F.emit({ x: e.x + (Math.random() - 0.5) * 120, y: e.y - e.lift - 40 - Math.random() * 160, vy: -30, life: 1.3, s0: 26, s1: 60, c: GHOST, a: 0.25, add: 1, cell: C.Wisp }); }
    for (const m of this.mobs) if (m.kind === 'chuanling' && m.lamp && !m.lamp.dead && m.alpha > 0.1) { const L = m.lamp; F.flash(L.x, L.y - L.lift - 10, 70 + 10 * Math.sin(t * 7), GHOST, 0.05); F.ground(C.Glow, L.x, L.y, 180, 0, GHOST, 0.18 * m.alpha, 1, 0.5); }
    for (const ch of this.chains) { F.beam(ch.x0, ch.y0 - 80, ch.x, ch.y - 40, 10, [0.25, 0.28, 0.3], 0.95, C.Beam, 0, [0, 0]); F.beam(ch.x0, ch.y0 - 80, ch.x, ch.y - 40, 26, GHOST, 0.25, C.Beam, 1, [0, 0]); }
    // 雷的预警圈、浪圈
    for (const z of this.zaps) { if (z.done) continue; const u = Math.max(0, (t - z.t0) / z.warn); if (u <= 0) continue; F.ground(C.RingSoft, z.x, z.y, z.r * (1.6 - 0.6 * u), t, BOLT, 0.5 * (0.6 + 0.4 * Math.sin(t * 20)), 1, 0.5); F.ground(C.Disc, z.x, z.y, z.r, 0, [0.55, 0.7, 1], 0.12 + 0.2 * u, 1, 0.5); }
    for (const w of this.waves) { const r = (t - w.t0) * w.sp, k = 1 - r / w.R; F.ground(C.RingSoft, w.x, w.y, r, 0, FOAM, 0.6 * k, 1, 0.5 * 0.8); if (Math.random() < dt * 30) { const a = Math.random() * Math.PI * 2; F.sparks(w.x + Math.cos(a) * r, w.y + Math.sin(a) * r * 0.8, WATER, 3, 300, 0.5, 5, -Math.PI / 2, 1.2); } }
    // 墨雾
    for (const k of this.inks) { if (Math.random() < dt * 8) { const a = Math.random() * Math.PI * 2, r = Math.random() * k.r * 0.7; F.smoke(k.x + Math.cos(a) * r, k.y + Math.sin(a) * r * 0.7, 1, INK, 0.5, k.r * 0.15, k.r * 0.4); } }
    // 鲸背：灵脉的微光、还没采的灵草一闪一闪
    const W = this.whale;
    // 站在鲸背上：脚下一圈淡金的光，人在满背的青苔里也一眼找得到
    // （贴地的特效在 HD 里画进地面那一层，会被鲸背盖住，所以这里用立在画面上的那一种）
    if (W.onBack) F.ring(p.x, p.y, 54 + 4 * Math.sin(t * 3), [1, 0.86, 0.55], 0.6, 0.5, true);
    if (W.k > 0.9 && Math.hypot(W.x - p.x, W.y - p.y) < 3000) {
      const herbs = ((g.ws.flags as Record<string, unknown>).whaleHerb ?? {}) as Record<string, number>, day = Math.floor(g.day);
      HERB_PX.forEach(([hx, hy], i) => { if (herbs[i] === day) return; const [x, y] = this.whalePx(hx, hy); F.glow(x, y - 10, 60 + 14 * Math.sin(t * 3 + i), [0.5, 0.95, 1], 0.4); if (Math.random() < dt * 2) F.emit({ x, y: y - 10, vy: -50, life: 1.2, s0: 10, s1: 2, c: [0.6, 1, 1], a: 0.9, add: 1, cell: C.Glow }); });
      if (Math.random() < dt * 10) { const [x, y] = this.whalePx(400 + Math.random() * 700, 330 + Math.random() * 260); F.emit({ x, y, vy: -60, life: 1.6, s0: 8, s1: 2, c: [0.55, 1, 0.85], a: 0.7, add: 1, cell: C.Glow }); }
      if (W.st === 'warn') for (let i = 0; i < 2; i++) { const [x, y] = this.whalePx(100 + Math.random() * 1200, 300 + Math.random() * 330); if (Math.random() < 0.5) F.sparks(x, y, WATER, 2, 160, 0.5, 4, -Math.PI / 2, 1.5); }
    }
  }
}

/** 测试用：贴图登记的状态表（每个状态最多两帧） */
export const SEA_KINDS = Object.keys(SPECIES_DEF) as Kind[];
export type { Kind as SeaKind, EnemyDef as _EnemyDef };
