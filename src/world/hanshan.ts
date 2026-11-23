// 撼山客 · 岳千钧：世界里的存在（游荡、被发现、搭话、切磋、惹他）。设计定稿见 docs/撼山客与破坏系统-设计.md 第一、二节。
//
// 他是谁：独行的体修大能，中立，不进城、不进宗门，在南荒的险地之间走。境界始终比你高一个大境界（封顶化神）。
// 招式（25 招）下一步才做：这一步他打人用现有的敌人近战（brawl.ts 的体修原型 AI、brawlfoe 的 npcHit / 轰飞）。
//
// 怎么存在：
//   · 远处只是存档里的一个坐标（ws.flags.hanshan）——不建实体、不占性能；按游戏日推进（catchUp：从上次推进到的那一天逐日走），
//     每天朝下一个落脚点走一段（一游戏日两秒，他走 WALK 那么远），到了停十几二十天（打妖王或喝酒歇着）再换下一个。
//     路线用自己的随机序列（mulberry32(hash32(种子, 日子))），日结算、布局生成、刷怪路径上一个 Math.random 都不碰。
//   · 你走近到 SPAWN_R 以内才生成真的人（一个 Enemy：自己 push 进 combat.enemies，不走刷怪路径、不触发模组的 spawn 钩子），
//     走远到 DESPAWN_R 外收起，位置写回存档。生成时 Enemy 构造里的那几个 Math.random 换成自己的序列（构造签名不动）。
//   · 平时他由这里驱动（e.shell = true：寻常 AI 跳过，照模组的 shell 约定）；要打架（妖兽扑上来、切磋、被惹怒）时放回寻常 AI，
//     出手是 brawl 的体修原型（markBrawler），伤害一律走 hitPlayer / npcHit。
//
// 怎么被发现（四条线索）：
//   · 江湖传闻：每隔二三十到五十来个游戏日在消息栏报一条（离你越近越勤），带方位和地区名，十来条文案轮着用；
//   · 痕迹：他走过、打过的地方留拳坑、枯树、犁开的沟（数据：位置、种类、朝向、大小、哪天留的；有上限、随游戏日变淡、存档）。
//     画法收在 paintTrace / unpaintTrace 里（现在用 combat.scorch 的地贴加 breakables 的枯树、碎石凑）；破坏系统（r7-wreck）合并后换成正式接口；
//   · 动静：他在两万以内和妖兽打架时，屏幕边缘朝他那边一闪一闪的冲击光（HanshanQuake.tsx）、隔几息一声闷雷、小地图边缘一个震动标记；
//   · 目击：亲眼见过他一次之后，世界地图上「撼山客 · 上次见于某地（几天前）」。
//
// 三种遇法：看他打妖王（停留处刷一头妖王级的妖兽，只打他；打完他喝一口酒，掉落留在地上归你）、搭话（请教 / 攀谈 / 告辞）、
// 切磋（让三招，之后用近战把你打一顿、不致死，按撑的时间给奖励并记下他答应传哪几招 taught()）、惹他（先动手 / 当他面杀凡人：真打致死，几十日不搭理你）。
import type { Game } from './game';
import { Enemy, realmTakeK } from './combat';
import type { EnemyDef } from '../data/enemies';
import { ENEMIES, lvRealm } from '../data/enemies';
import { REALMS, realmName } from '../data/realms';
import { LOCATIONS, WORLD_SCALE, ACTIVE_MAP, regionNameAt, type LocDef } from '../data/world';
import { CharState, type Look } from '../gfx/character';
import { mulberry32 } from '../core/rng';
import { hash32 } from './brawlrng';
import { dirName } from './sites';
import { audio } from './audio';
import * as C from './cultivation';
import { ITEMS } from '../data/items';
import { BRAWL_ARTS } from '../data/arts';
import type { DNode, DOpt } from './modal';
import { HS_BATCH1, HS_MOVE_DEFS, hsReady, windingAt, type HsMoveId } from './hsmoves';   // r7 招式第一批（注册在模块加载时）
import { learnMove, MOVES } from './brawlmoves';
import { registerHsBatch2 } from './hsmoves2';   // 招式第二批（连击、擒拿）
import { registerHsP1 } from './hsmovesp1';   // r8-p1：照参考视频新增的四招（断脉腿、撞山靠、顶心膝、影踪连环踢）

// ------------------------------------------------------------------ 可调的数
export const HS = {
  /** 走近多远生成真人、走远多远收起；多远以内看得见他和妖兽打架的动静 */
  spawnR: 8000, despawnR: 9500, quakeR: 20000,
  /** 每游戏日走多远（一游戏日两秒：约每秒 120，和他真人走路的速度对得上）；真人走路的速度 */
  walk: 240, walkV: 120,
  /** 到了落脚点停多少天（含）、打妖王的几率 */
  stay: [16, 40] as [number, number], fightCh: 0.6,
  /** 下一个落脚点离这里多远（太近没意思，太远一走半年） */
  hop: [9000, 60000] as [number, number],
  /** 痕迹：最多几处、多少游戏日淡完、赶路时每天留一处的几率 */
  traceMax: 48, traceLife: 150, traceCh: 0.2,
  /** 传闻间隔：最近（离你两万以内）多少天一条、最远（十二万外）多少天一条，再加 0–8 天的抖动 */
  rumorNear: 20, rumorFar: 45,
  /** 切磋冷却（游戏日）、惹怒后多少游戏日不搭理你、切磋最长打多久（息）、让几招 */
  sparCd: 12, angryDays: 60, sparMax: 75, yieldN: 3,
  /** 切磋按撑的时间（息，从他还手算起）分三档 */
  tiers: [10, 25, 45] as [number, number, number],
  /** 第一下误伤只警告；这么多息之内再打他就翻脸 */
  warnWin: 30,
} as const;

/** 他答应传的六招（设计文档第一节），按切磋撑过的时间逐招记下；化神后再加一拳破界 */
export const HS_MOVES: { id: string; name: string; need: number; realm?: number }[] = [
  { id: 'yicunbeng', name: '一寸崩', need: 10 },
  { id: 'zhenjiao', name: '震脚', need: 20 },
  { id: 'yanhui', name: '燕回', need: 30 },
  { id: 'shifangdan', name: '十方弹', need: 40 },
  { id: 'lidi', name: '犁地', need: 50 },
  { id: 'qianjunzhui', name: '千钧坠', need: 60 },
  { id: 'pojie', name: '一拳破界', need: 60, realm: 5 },
];

export type TraceKind = 'pit' | 'tree' | 'furrow';
/** 一处痕迹：位置、种类、朝向（弧度）、大小（倍率）、哪天留的 */
export interface HsTrace { x: number; y: number; k: TraceKind; a: number; s: number; d: number }
/** 存档里的他（ws.flags.hanshan；旧存档没有这一项时第一次用到才给初始值，存档版本不升） */
export interface HsSave {
  v: 1; seed: number;
  x: number; y: number;
  /** 去哪（落脚点坐标、落脚点序号）；go = 在路上、stay = 停在落脚点（停到 until 那天） */
  tx: number; ty: number; stop: number; mode: 'go' | 'stay'; until: number;
  /** 这一处打不打妖王 / 已经打完了 */
  fight: boolean; fought: boolean;
  /** 推进到了哪一天（整数） */
  day: number;
  traces: HsTrace[];
  /** 下一条传闻在哪天、报过几条（轮文案） */
  rumorAt: number; rumorN: number;
  /** 上次亲眼见到（世界坐标、日子、地名）；见过 / 搭过话 */
  seen?: { x: number; y: number; d: number; place: string }; spotted?: boolean; met?: boolean;
  talkN?: number;
  /** 切磋：次数、最近一次的日子、撑得最久（息）、打中他最多几下、到过的最高档 */
  spars?: number; lastSpar?: number; best?: number; bestHits?: number; tier?: number;
  /** 他答应传的招（HS_MOVES 的 id） */
  taught?: string[];
  /** 惹怒到哪天 */
  angryUntil?: number;
  /** 实拍 / 测试用：他的位置被手动摆过（try=hanshan 入口），这一天不推进 */
  pin?: number;
}

/** 切磋这一场的记录（不存档） */
interface Spar { t0: number; yieldHits: number; counterAt: number; hits: number; hpPrev: number; far: number; done: boolean }
/** 一处痕迹画出来用到的东西（unpaintTrace 收掉） */
export interface Painted { k: number; marks: WreckMark[]; rocks: { dead: boolean }[]; placed: boolean }

import type { WreckMark } from './wreck';
import { registerHsBatch3 } from './hsmoves3';
import { registerHsP2 } from './hsp2';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;

/**
 * 他的样子（对照立绘 public/art/npc/yueqianjun.webp）：比常人高大一圈、宽肩厚背；赤膊（肌肉轮廓、胸口两道旧疤）；
 * 双前臂到拳头缠着米灰的拳布（腕上布条随动作飘）；深石青的残破道袍系在腰间垂下（下摆撕成一绺一绺，两只袖子在腰前打结）；
 * 长发披散、鬓边几缕碎发、后颈一条米白布带；腰挂酒葫芦（走路时晃）。专属画法在 gfx/character.ts 的 Look.tixiu
 */
export const HANSHAN_LOOK: Look = {
  sex: 'm', height: 1.4, build: 1.55, skin: '#c08a5e', hair: '#15110e', hairStyle: 'long', fringe: 'wisp',
  robe: '#3d4046', inner: '#c08a5e', trim: '#2a2c30', belt: '#c8bc9c', pants: '#34363b', boots: '#1e1a16',
  robeLen: 'mid', sleeve: 'cuffed', cuff: '#cfc4a8', collar: 'open', skirt: 'split', skirtColor: '#3d4046', over: 'none',
  waist: 'gourd', back: 'none', hand: 'none', beard: '#1a1612', idle: 'stand',   // 两手垂着（负手站着像个书生；他是个打架的）
  face: { eye: 'narrow', eyeSize: 0.9, brow: 'thick', browW: 1.4, smile: 0.3, age: 0.35, iris: '#2a1a10' },
  head: { jaw: 0.95, width: 1.06, neck: 0.95 },
  body: { shoulder: 1.2, chest: 1.3, waist: 1.08, heft: 1.35, arm: 1.06, leg: 1.04 },
  tixiu: { wrap: '#cfc4a8', scar: true, tied: '#3d4046', band: '#cbbf9f' },
};

/** 他的敌人定义（不进 ENEMIES：不进刷怪池、不改任何按表挑的随机序列） */
const HANSHAN_DEF: EnemyDef = {
  id: 'hanshan', name: '赤膊大汉', kind: 'human', robe: '#2b2622', title: '体修', minDanger: 99, maxDanger: -1,
  hp: 3.2, atk: 1.4, def: 1.6, speed: 170, drops: [], aggro: 1,
};

/** 传闻（{who}：没见过时是「一赤膊大汉」，见过之后是「撼山客」；{at}：方位和地名） */
const RUMORS = [
  '有人在{at}一带，见{who}一拳打断了山梁。',
  '{at}的樵夫说，前几日山里闷雷不断，天上却没有一丝云——有{who}在和妖王硬碰硬。',
  '猎妖的散修在{at}撞见{who}，扛着半截妖兽的獠牙走路，脚下的石头一步一个坑。',
  '{at}一带的山道被人犁开一道深沟，足有半里长，沟底还冒着热气。都说是{who}和什么东西打了一架。',
  '有行商从{at}回来，说那边林子倒了一大片，倒下的树全朝一个方向——像是被一拳的风推倒的。',
  '{at}的妖兽这些天都不见了踪影。有人说，是{who}在那儿住了几日。',
  '{at}的山民夜里听见一声大喝，第二天发现河边那块卧牛石裂成了两半。',
  '一伙劫修在{at}拦了{who}的路。后来谁也没再见过那伙人，只在路边找到几柄折成两截的飞剑。',
  '{at}有座破庙，墙上多了一个拳印，入墙三寸。庙里的老和尚说，那人喝了他半坛酒，留下一块妖丹当酒钱。',
  '据说{at}一带有{who}在找人切磋，见了修士就问：「接得住我一拳么？」',
  '有人在{at}看见两道身影从山顶滚到山脚，所过之处寸草不留。其中一个，赤着膊。',
  '{at}的妖王巢穴空了。巢外的山壁上，嵌着那头妖王的半边身子。',
];
/** 攀谈：他是个豪爽、话不多、看淡输赢的人，走遍南荒找能接他一拳的人 */
const CHATS = [
  '南荒这块地，我从西边的荒漠走到东边的海，走了三遍。能接我一拳不倒的，十个指头数得过来。',
  '输赢？输了就再练，赢了就喝酒。想那么多做什么。',
  '（他晃了晃酒葫芦）这酒是梁国一个老农酿的。他不知道我是谁，我也没告诉他。好喝。',
  '法修那套，隔着八丈远放火放雷——我不讨厌，就是嫌他们站得太远。打起来没滋味。',
  '妖王皮厚，打着顺手。上回那头三只眼的，挨了七拳才肯趴下，是条好汉。',
  '宗门请过我，供奉、长老，什么都给。我问他们，山门那块石头能不能让我打一拳。他们就不请了。',
  '人这一身骨头，你不去磨它，它就是一根柴。磨上一百年，它就是一座山。',
  '我没收过徒弟。谁接得住我十拳，我就跟谁喝一坛。到现在，那坛酒还封着。',
  '（他低头看了看缠着布的拳头）这布换了二十多回了。拳头没换。',
  '你问我多大？忘了。只记得头一回打碎山石那年，山下的桃花开得正好。',
  '走路就走路，飞什么。脚底下踩着地，心里才踏实。',
  '有人说我是疯子，满南荒找人打架。……也没说错。',
];

/** r7 他传招时说的话（切磋撑过对应档位，当场教会） */
const TEACH_LINE: Record<string, string> = {
  yicunbeng: '看好了——这一手叫「一寸崩」。贴上去，别急着打，停半拍。力从脚底起，过腰，过肩，最后才到拳头上——不是打在他身上，是打穿他，从他背后出去。',
  zhenjiao: '这一手叫「震脚」。提膝，往下一跺——不是用脚跺，是整个人往地里砸。地接住了你这一下，就会替你把周围的人都掀起来。',
};

/** 南荒的落脚点：险地（含妖兽巢穴这类小地点）外缘的一块站得住的野地 */
interface Stop { x: number; y: number; name: string }

export class Hanshan {
  /** 真人（走近才有）；下一步做招式的人从这里拿他 */
  ent: Enemy | null = null;
  /** 他这一处在打的妖王（只打他） */
  beast: Enemy | null = null;
  private stopsCache: { map: string; list: Stop[] } | null = null;
  private away: HsSave | null = null;
  private wsRef: unknown = null;
  /** 痕迹画到了哪（按痕迹对象） */
  private painted = new Map<HsTrace, Painted>();
  private paintT = 0;
  /** 打架的动静：下一闪在什么时候、屏幕边缘的闪光（给界面读）、小地图的震动 */
  private quakeT = 0; private rumbleAt = 0; private rumbleK = 0;
  flashes: { id: number; ang: number; k: number; t: number }[] = [];
  private flashId = 0;
  /** 打架 / 切磋 / 惹怒；平时（calm） */
  mode: 'calm' | 'brawl' | 'spar' | 'angry' = 'calm';
  private calmT = 0;
  spar: Spar | null = null;
  /** 第一下误伤的时刻（警告过了） */
  private warnAt = -99;
  /** 走路时脚下的尘印、喝酒的小动作、真人的「头一回被看见」 */
  private stepT = 0; private drinkT = 0; private drinkLeft = 0;
  /** 切磋 / 惹怒结束后等一下再开的对话（不切画面：只是对话框） */
  private pending: { at: number; node: () => DNode } | null = null;
  /** 自己的帧上随机序列（闪光间隔、尘土方向）：不碰 Math.random */
  private rnd = mulberry32(0x4a5d1);
  /** 测试用：日推进跑了几天 */
  stepped = 0;
  /** 下一步做招式的人挂招用：id → 出招（返回出没出） */
  readonly moves = new Map<string, (tg: Enemy | null) => boolean>();
  /** 招式线的钩子：每帧最先调；返回 true = 他这一帧被招式接管（这里不收起、不驱动他）。第三批（hsmoves3）的破界 → 还界要带他进虚空 */
  hold: ((dt: number) => boolean) | null = null;

  constructor(readonly game: Game) {
    // r7 招式第一批：九招都走近战的特殊招式（brawlmoves.registerMove，在 hsmoves.ts 里注册）；这里把它们挂进他自己的出招表
    for (const id of HS_BATCH1) this.registerMove(id, (tg) => this.cast(id, tg));
    registerHsBatch2(this);   // 第二批：连击、擒拿（world/hsmoves2.ts）
    registerHsP1(this);   // r8-p1：断脉腿、撞山靠、顶心膝、影踪连环踢（world/hsmovesp1.ts）
    registerHsBatch3(game, this);   // 第三批：破界、还界、借星、无极一击（拳路上是海就分海）、千钧坠（world/hsmoves3.ts）
    registerHsP2(game, this);   // r8-p2 第二阶段：赤阳罡、火焰腿法、觉醒大招（world/hsp2.ts；接在第三批的每帧钩子外面）
  }

  // ------------------------------------------------------------------ 存档
  /** 存档里的他（没有就给一个初始位置） */
  get s(): HsSave {
    const f = this.game.ws.flags as Record<string, unknown>;
    let s = f.hanshan as HsSave | undefined;
    if (!s || s.v !== 1 || !Number.isFinite(s.x) || !Number.isFinite(s.y)) {
      if (ACTIVE_MAP !== 'tiannan') return this.away ??= { v: 1, seed: 0, x: NaN, y: NaN, tx: NaN, ty: NaN, stop: -1, mode: 'stay', until: 0, fight: false, fought: false, day: 0, traces: [], rumorAt: 1e9, rumorN: 0 };   // 人不在南荒：先不给他定位置（回南荒时再给）
      s = this.fresh(); f.hanshan = s;
    }
    return s;
  }
  /** 这一局的种子：取活世界前几个人的种子（开局按 Math.random 生成的，每局不同、存档里固定）——这里一个 Math.random 都不取 */
  private seedOf(): number {
    let h = 0x2545f491;
    const list = (this.game.npcs as unknown as { list: { seed: number }[] }).list ?? [];
    for (let i = 0; i < Math.min(8, list.length); i++) h = hash32(h, list[i].seed | 0);
    return h >>> 0;
  }
  private fresh(): HsSave {
    const g = this.game, seed = this.seedOf(), day = Math.floor(g.day);
    const st = this.stops(), p = g.player;
    // 开局离你远一点（青霞谷开局的地方四万以外），免得一出门就撞见
    const far = st.map((q, i) => [i, Math.hypot(q.x - p.x, q.y - p.y)] as [number, number]).filter(([, d]) => d > 40000);
    const pool = far.length ? far : st.map((_, i) => [i, 0] as [number, number]);
    const r = mulberry32(hash32(seed, 0x11));
    const i = pool.length ? pool[Math.floor(r() * pool.length)][0] : -1;
    const at = i >= 0 ? st[i] : { x: p.x + 60000, y: p.y };
    return { v: 1, seed, x: at.x, y: at.y, tx: at.x, ty: at.y, stop: i, mode: 'stay', until: day + 6 + Math.floor(r() * 10), fight: r() < HS.fightCh, fought: false, day, traces: [], rumorAt: day + 12 + Math.floor(r() * 10), rumorN: Math.floor(r() * RUMORS.length) };
  }

  /** 他答应传哪几招（HS_MOVES 的 id，按解锁先后） */
  taught(): string[] { return [...(this.s.taught ?? [])]; }
  /** 见过 / 搭过话 */
  get met() { return !!this.s.met; }
  /** 名牌 */
  get plate() { return this.s.met ? '撼山客 · 岳千钧' : '赤膊大汉'; }
  /** 他的境界：比你高一个大境界，封顶化神 */
  realmOf(): { realm: number; stage: number } {
    const h = this.game.hero, top = REALMS.length - 1;
    if (h.realm >= top) return { realm: top, stage: REALMS[top].hp.length - 1 };
    const r = Math.max(2, h.realm + 1), n = REALMS[r].hp.length;
    const st = h.realm <= 1 ? Math.min(n - 1, Math.floor(h.stage / 5)) : Math.min(n - 1, h.stage);
    return { realm: r, stage: st };
  }
  get angry() { const s = this.s; return (s.angryUntil ?? -1) > this.game.day; }

  // ------------------------------------------------------------------ 落脚点与路线（只用自己的随机序列）
  /** 南荒的险地外缘、站得住、离城镇宗门远的一处（按地图缓存） */
  stops(): Stop[] {
    if (this.stopsCache?.map === ACTIVE_MAP) return this.stopsCache.list;
    const out: Stop[] = [];
    if (ACTIVE_MAP === 'tiannan') {
      for (const l of LOCATIONS) {
        if (l.type !== 'danger' || (l.map ?? 'tiannan') !== 'tiannan') continue;
        const cx = l.x * WORLD_SCALE, cy = l.y * WORLD_SCALE;
        let got: Stop | null = null;
        for (const R of [1400, 2200, 900, 3000]) {
          for (let k = 0; k < 8 && !got; k++) { const a = (k + (l.id.length % 3) * 0.33) / 8 * TAU, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R; if (this.okAt(x, y, 2200)) got = { x, y, name: l.name }; }
          if (got) break;
        }
        if (got) out.push(got);
      }
    }
    this.stopsCache = { map: ACTIVE_MAP, list: out };
    return out;
  }
  private civil = new Map<string, boolean>();
  /** 城、镇、宗门、海岛、驿站的地界（加 pad）以内 */
  private inCivil(x: number, y: number, pad: number): boolean {
    for (const z of this.game.terrain.locZones) {
      const dx = (x - z.x) / (z.rx + pad), dy = (y - z.y) / (z.ry + pad);
      if (dx * dx + dy * dy > 1) continue;
      let c = this.civil.get(z.id);
      if (c === undefined) { const l: LocDef | undefined = LOCATIONS.find((q) => q.id === z.id); c = !!l && (l.type === 'city' || l.type === 'town' || l.type === 'sect' || l.type === 'isle' || l.type === 'inn'); this.civil.set(z.id, c); }
      if (c) return true;
    }
    return false;
  }
  /** 这一点他能不能待：陆地、走得通、不在城镇宗门里 */
  okAt(x: number, y: number, pad = 900): boolean {
    const T = this.game.terrain;
    return T.isLand(x, y) && T.walkFactor(x, y) > 0 && !this.inCivil(x, y, pad);
  }
  /** 走不通就在附近找一处能待的（找不到返回 null） */
  private nudge(x: number, y: number): { x: number; y: number } | null {
    if (this.okAt(x, y)) return { x, y };
    for (let R = 300; R <= 3000; R += 300) for (let k = 0; k < 12; k++) { const a = k / 12 * TAU, nx = x + Math.cos(a) * R, ny = y + Math.sin(a) * R; if (this.okAt(nx, ny)) return { x: nx, y: ny }; }
    return null;
  }
  /** 挑下一个落脚点：九千到六万之间、一路上大半是陆地野地 */
  private nextStop(s: HsSave, r: () => number): number {
    const st = this.stops(); if (!st.length) return -1;
    const c: number[] = [];
    for (let i = 0; i < st.length; i++) { if (i === s.stop) continue; const d = Math.hypot(st[i].x - s.x, st[i].y - s.y); if (d >= HS.hop[0] && d <= HS.hop[1]) c.push(i); }
    if (!c.length) { let bi = -1, bd = Infinity; for (let i = 0; i < st.length; i++) { if (i === s.stop) continue; const d = Math.hypot(st[i].x - s.x, st[i].y - s.y); if (d < bd) { bd = d; bi = i; } } return bi; }
    for (let k = 0; k < 8; k++) {
      const i = c[Math.floor(r() * c.length)], q = st[i], L = Math.hypot(q.x - s.x, q.y - s.y), n = Math.max(2, Math.ceil(L / 3000));
      let bad = 0; for (let j = 1; j < n; j++) { const u = j / n; if (!this.okAt(s.x + (q.x - s.x) * u, s.y + (q.y - s.y) * u, 300)) bad++; }
      if (bad <= Math.max(1, n * 0.15)) return i;
    }
    return c[Math.floor(r() * c.length)];
  }
  /** 一天：在路上就朝落脚点走 WALK，到了就停；停够了挑下一个。live = 真人在场（位置归真人管，这里只看到没到） */
  private stepDay(s: HsSave, d: number, live: boolean) {
    const r = mulberry32(hash32(s.seed, d, 0x7a11));
    this.stepped++;
    if (s.mode === 'stay') {
      if (d >= s.until) {
        const i = this.nextStop(s, r);
        if (i >= 0) { const q = this.stops()[i]; s.stop = i; s.tx = q.x; s.ty = q.y; s.mode = 'go'; }
        else s.until = d + 10;
      }
    } else {
      const dx = s.tx - s.x, dy = s.ty - s.y, L = Math.hypot(dx, dy);
      if (L <= (live ? 260 : HS.walk)) {
        if (!live) { s.x = s.tx; s.y = s.ty; }
        s.mode = 'stay'; s.until = d + HS.stay[0] + Math.floor(r() * (HS.stay[1] - HS.stay[0] + 1)); s.fight = r() < HS.fightCh; s.fought = false;
        if (s.fight) for (let i = 0, n = 2 + Math.floor(r() * 2); i < n; i++) { const a = r() * TAU, R = 300 + r() * 900; this.addTrace(s, s.x + Math.cos(a) * R, s.y + Math.sin(a) * R * 0.8, i === 0 ? 'pit' : r() < 0.5 ? 'furrow' : 'tree', r() * TAU, 0.9 + r() * 0.6, d); }
      } else if (!live) {
        const k = HS.walk / L, q = this.nudge(s.x + dx * k, s.y + dy * k);
        if (q) { s.x = q.x; s.y = q.y; }
        if (r() < HS.traceCh) { const roll = r(); this.addTrace(s, s.x, s.y, roll < 0.45 ? 'furrow' : roll < 0.75 ? 'pit' : 'tree', Math.atan2(dy, dx), 0.7 + r() * 0.5, d); }
      }
    }
    // 传闻
    if (d >= s.rumorAt) this.rumor(s, d, r);
  }
  /** 推进到今天（日结算里、每帧都问一句；整数日变了才走）。真人在场时位置归真人管 */
  catchUp() {
    if (ACTIVE_MAP !== 'tiannan') return;
    const s = this.s, today = Math.floor(this.game.day);
    if (s.pin !== undefined) { if (today > s.pin) delete s.pin; else { s.day = today; return; } }
    if (today <= s.day) return;
    if (today - s.day > 400) s.day = today - 400;   // 闭关十年这种：只补最近四百天（路线照样按日子定）
    const live = !!this.ent;
    if (live) { s.x = this.ent!.x; s.y = this.ent!.y; }
    for (let d = s.day + 1; d <= today; d++) this.stepDay(s, d, live);
    s.day = today;
    // 痕迹过期
    if (s.traces.length) s.traces = s.traces.filter((t) => today - t.d < HS.traceLife);
  }
  /** 日结算（game.ts 的 relAcc 那一组）里走一步 */
  daily() { this.catchUp(); }
  /** 留一处痕迹（有上限：超了丢最旧的） */
  addTrace(s: HsSave, x: number, y: number, k: TraceKind, a: number, sz: number, d: number) {
    s.traces.push({ x: Math.round(x), y: Math.round(y), k, a: Math.round(a * 100) / 100, s: Math.round(sz * 100) / 100, d });
    if (s.traces.length > HS.traceMax) s.traces.splice(0, s.traces.length - HS.traceMax);
  }

  // ------------------------------------------------------------------ 传闻
  /** 「梁国北边的黑风岭」：所在地区 + 在地区里偏哪边 + 最近的一处险地 / 地名 */
  placeName(x: number, y: number, withDir = true): string {
    const mx = x / WORLD_SCALE, my = y / WORLD_SCALE;
    const rg = regionNameAt(mx, my, true);
    let near: LocDef | null = null, nd = 90;
    for (const l of LOCATIONS) { if ((l.map ?? 'tiannan') !== ACTIVE_MAP) continue; if (l.type === 'city' || l.type === 'sect' || l.type === 'town' || l.type === 'inn') continue; const d = Math.hypot(l.x - mx, l.y - my); if (d < nd) { nd = d; near = l; } }
    let dir = '';
    if (withDir && rg) {
      let cx = 0, cy = 0, n = 0;
      for (const l of LOCATIONS) { if ((l.map ?? 'tiannan') !== ACTIVE_MAP || l.minor) continue; const r2 = regionNameAt(l.x, l.y, true); if (r2?.name === rg.name) { cx += l.x; cy += l.y; n++; } }
      if (n) { cx /= n; cy /= n; if (Math.hypot(mx - cx, my - cy) > 12) dir = dirName(mx - cx, my - cy) + '边'; }
    }
    const reg = rg ? (rg.parent && rg.parent !== rg.name && rg.parent !== '南荒' ? rg.parent : rg.name) : '南荒';
    return `${reg}${dir}${near ? (dir ? '的' : '') + near.name : dir ? '' : '的荒野'}`;
  }
  private rumor(s: HsSave, d: number, r: () => number) {
    const g = this.game, p = g.player, dist = Math.hypot(s.x - p.x, s.y - p.y);
    const k = clamp((dist - 20000) / 100000, 0, 1);
    s.rumorAt = d + Math.round(HS.rumorNear + (HS.rumorFar - HS.rumorNear) * k + r() * 8);
    if (this.ent) return;   // 人就在你附近：不传了
    const tpl = RUMORS[s.rumorN % RUMORS.length]; s.rumorN++;
    const text = '江湖传闻：' + tpl.replace('{at}', this.placeName(s.x, s.y)).replace(/\{who\}/g, s.met ? '撼山客' : '一赤膊大汉');
    g.toast(text, 'info');
    g.news(text, 'rumor', d);
  }
  /** 立刻报一条（试玩入口用） */
  rumorNow() { const s = this.s; s.rumorAt = Math.floor(this.game.day); this.rumor(s, s.rumorAt, mulberry32(hash32(s.seed, s.rumorAt, 0x7a11))); }

  // ------------------------------------------------------------------ 每帧
  tick(dt: number) {
    const g = this.game;
    if (g.ws !== this.wsRef) { this.wsRef = g.ws; this.dropLive(); this.painted.clear(); this.flashes = []; this.pending = null; try { this.syncTaught(); } catch { /* 存档还没就绪 */ } }
    if (this.hold?.(dt)) return;   // 招式线的钩子（第三批：他被打进 / 追进虚空的那一趟）
    if (ACTIVE_MAP !== 'tiannan' || g.offWorld) { if (this.ent) this.despawn(ACTIVE_MAP === 'tiannan'); if (this.painted.size) { for (const P of this.painted.values()) unpaintTrace(g, P); this.painted.clear(); } return; }
    this.catchUp();
    const s = this.s, p = g.player;
    if (this.ent && !g.combat.enemies.includes(this.ent)) this.dropLive();   // 读档、换图把敌人清掉了
    const d = Math.hypot(s.x - p.x, s.y - p.y);
    if (!this.ent && d < HS.spawnR && !g.hero.dead) this.spawn();
    else if (this.ent && d > HS.despawnR && this.mode !== 'spar') this.despawn();
    if (this.ent) this.live(dt);
    this.quake(dt, d);
    this.paintT -= dt; if (this.paintT <= 0) { this.paintT = 0.25; this.paintNear(); }
    for (const P of this.painted.values()) pinTrace(g, P);
    if (this.pending && g.time >= this.pending.at && !g.modal) { const n = this.pending.node; this.pending = null; g.openDialog(n()); }
  }

  // ------------------------------------------------------------------ 真人
  private spawn() {
    const g = this.game, s = this.s, { realm, stage } = this.realmOf();
    // Enemy 构造里会取几个 Math.random（id、计时、外貌种子）：这一下换成自己的序列，外面的随机序列一个不动
    const R = Math.random; Math.random = mulberry32(hash32(s.seed, s.day, 0x5a));
    let e: Enemy;
    try { e = new Enemy(HANSHAN_DEF, s.x, s.y, realm, stage); e.cs = new CharState(s.x, s.y); } finally { Math.random = R; }
    e.look = HANSHAN_LOOK; e.name = this.plate; e.team = 'hanshan'; e.school = 'tixiu'; e.kit = []; e.skT = 1e9; e.cdRanged = 1e9;
    (e as unknown as { noP: boolean }).noP = true;
    (e as unknown as { veto: (x: Enemy) => boolean }).veto = (x) => { x.hp = Math.max(1, x.maxHp * 0.3); return true; };   // 打不死（被打空了只是退一步）
    this.applyStats(e);
    e.hx = e.x; e.hy = e.y; e.speed = 0;
    this.shell(e, true);
    g.combat.enemies.push(e);
    g.combat.brawl.markBrawler(e);
    const b = g.combat.brawl.body(e); b.poiseMax = Math.round(g.combat.brawl.poiseMaxOf(e) * 2.5); b.poise = b.poiseMax;
    this.ent = e; this.mode = 'calm'; this.calmT = 0; this.spar = null;
  }
  /** 收起真人：位置写回存档 */
  private despawn(keep = true) {
    const e = this.ent; if (!e) return;
    if (keep) { const s = this.s; s.x = e.x; s.y = e.y; }   // 飞过交界换了图：坐标已经平移过，不写回
    e.dead = true; e.deathT = 1; e.spar = true; e.aggro = false; e.gone = true;   // 不结算、不掉东西（和放走的人一样）
    const c = this.game.combat; c.enemies = c.enemies.filter((x) => x !== e); if (c.lock === e) c.lock = null;
    if (this.beast && !this.beast.dead) { this.beast.gone = true; c.enemies = c.enemies.filter((x) => x !== this.beast); }
    this.dropLive();
  }
  private dropLive() { this.ent = null; this.beast = null; this.mode = 'calm'; this.spar = null; this.dir = null; this.demo = null; }
  /** 按境界给足（比你高一个大境界的体修）；你突破了他跟着变 */
  private applyStats(e: Enemy) {
    const { realm, stage } = this.realmOf(), R = REALMS[realm], st = Math.min(stage, R.hp.length - 1);
    const fr = e.maxHp ? e.hp / e.maxHp : 1;
    e.realm = realm; e.stage = st; e.level = realm * 13 + st;
    e.maxHp = Math.round(R.hp[st] * HANSHAN_DEF.hp * 1.25 * 1.6); e.hp = Math.max(1, Math.round(e.maxHp * fr));
    e.atk = R.atk[st] * HANSHAN_DEF.atk * 1.1; e.dfn = R.def[st] * HANSHAN_DEF.def;
  }
  /** 平时由这里驱动（shell：寻常 AI 跳过）；打架时放回寻常 AI */
  private shell(e: Enemy, on: boolean) { (e as unknown as { shell: boolean }).shell = on; }

  private live(dt: number) {
    const g = this.game, c = g.combat, e = this.ent!, s = this.s, p = g.player;
    e.name = this.plate;
    if (this.mode !== 'angry') (c as unknown as { pressWarnT: number }).pressWarnT = Math.max((c as unknown as { pressWarnT: number }).pressWarnT, 5);   // 他和他的妖王不报「速逃」（只有惹怒时才是真要命）
    { const r = this.realmOf(); if (r.realm !== e.realm || r.stage !== e.stage) this.applyStats(e); }
    s.x = e.x; s.y = e.y;
    const dP = Math.hypot(e.x - p.x, e.y - p.y);
    // 亲眼见到
    if (dP < Math.max(1300, g.senseRadius) && !g.hero.dead) this.sight(e);
    // 被你打了（hitEnemy 把「不冲你来的人」翻了脸）：头一下警告、再打就真怒
    const N = e as unknown as { noP: boolean };
    if (this.mode !== 'spar' && this.mode !== 'angry' && N.noP === false) this.struck();
    // 妖王：这一处要打、还没打完、你走近了
    if (s.mode === 'stay' && s.fight && !s.fought && this.mode === 'calm' && !this.angry && !this.beast && dP < 5200) this.callBeast();
    if (this.beast && (this.beast.dead || !c.enemies.includes(this.beast))) {
      const B = this.beast; this.beast = null; s.fought = true;
      this.addTrace(s, B.x, B.y, 'pit', Math.atan2(B.y - e.y, B.x - e.x), 1.4, Math.floor(g.day));
      this.drinkT = 2.1;   // 打完喝一口（仰头灌一口：gfx/character.ts 的 drink 动作）
    }
    switch (this.mode) {
      case 'calm': this.calm(dt, dP); break;
      case 'brawl': if (this.demo) this.demoTick(dt); else this.brawling(dt); break;
      case 'spar': this.sparring(dt, dP); break;
      case 'angry': this.raging(dt, dP); break;
    }
  }
  /** 第一次被看见：大事记一条；每次看见都更新目击 */
  private sight(e: Enemy) {
    const g = this.game, s = this.s, day = Math.floor(g.day);
    if (!s.seen || day !== s.seen.d || Math.hypot(e.x - s.seen.x, e.y - s.seen.y) > 600) s.seen = { x: Math.round(e.x), y: Math.round(e.y), d: day, place: this.placeName(e.x, e.y, false) };
    if (!s.spotted) {
      s.spotted = true;
      g.news(`在${s.seen.place}遇见一位赤膊大汉：比常人高出一头，走过的地方草都伏下去。`, 'personal');
    }
  }

  /** 平时：在路上就走，停着就坐 / 站；你走近了转过来看你；打完架喝一口酒 */
  private calm(dt: number, dP: number) {
    const g = this.game, c = g.combat, e = this.ent!, s = this.s, cs = e.cs!, T = g.terrain;
    // 有妖兽扑上来（凶性已起、和他敌对）：放回寻常 AI 打
    // 只管扑上来的妖兽、冲他来的人（中立：别人斗法他不掺和）
    const foe = c.rivalNear(e, e.x, e.y, 900);
    if (foe && (foe.def.kind !== 'human' || foe.tgE === e || foe.grudge === e) && !this.angry) { this.toFight('brawl'); return; }
    let moving = false;
    if (s.mode === 'go' && this.drinkT <= 0 && !(dP < 260 && !g.modal)) {
      const dx = s.tx - e.x, dy = s.ty - e.y, L = Math.hypot(dx, dy);
      if (L > 40) {
        const v = HS.walkV * dt, ux = dx / L, uy = dy / L;
        for (const turn of [0, 0.6, -0.6, 1.2, -1.2]) {
          const cx = Math.cos(turn), sn = Math.sin(turn), mx = ux * cx - uy * sn, my = ux * sn + uy * cx, nx = e.x + mx * v, ny = e.y + my * v;
          if (T.isLand(nx, ny) && T.walkFactor(nx, ny) > 0 && !c.safeAt(nx, ny)) { e.x = nx; e.y = ny; cs.faceToward(mx, my, false); moving = true; break; }
        }
      }
    }
    e.hx = e.x; e.hy = e.y; e.aggro = false;
    cs.x = e.x; cs.y = e.y; cs.lift = 0; cs.speed = moving ? HS.walkV : 0; cs.vx = 0; cs.vy = 0;
    if (!moving && dP < 900) cs.faceToward(g.player.x - e.x, g.player.y - e.y, false);
    // 喝酒：仰头灌一口（小动作：抬手的架子 + 一行字）
    if (this.drinkT > 0) {
      if (this.drinkLeft <= 0) { this.drinkLeft = 1; c.texts.push({ anchor: { x: e.x, y: e.y, offsetY: 0 }, x: e.x, y: e.y - 230, s: '（仰头灌了一口酒）', color: '#e8d8b0', t: 0, vy: -12 } as never); }
      this.drinkT -= dt; if (this.drinkT <= 0) this.drinkLeft = 0;
    }
    const rest = s.mode === 'stay' && (!s.fight || s.fought) && dP > 700;
    cs.setAction(this.drinkT > 0 ? 'drink' : moving ? 'walk' : rest ? 'sit' : 'idle');
    e.anim.move = moving ? 1 : 0;
    cs.update(dt);
    if (moving) this.aura(dt);
  }
  /**
   * 平时的气场（便宜的，要淡）：每一步脚下一个微陷的浅印（左右脚交替、过三四息淡掉），落叶 / 尘土往外推开一点。
   * 雨不沾身在 render 里（weather.shelter = this.shelter(…)：雨丝在他身边绕开）
   */
  private footL = false;
  private aura(dt: number) {
    const c = this.game.combat, e = this.ent!;
    this.stepT -= dt; if (this.stepT > 0) return;
    this.stepT = 0.42;
    this.footL = !this.footL;
    const yaw = e.cs?.yaw ?? 0, sx = Math.cos(yaw) * (this.footL ? 11 : -11), sy = -Math.sin(yaw) * (this.footL ? 6 : -6);
    if (c.scorch.length < 20) c.scorch.push({ x: e.x + sx, y: e.y + 4 + sy, r: 30, t: 2.6, dur: 2.6 + 1.6, rot: this.rnd() * TAU, color: '120,100,70' });
    for (let i = 0; i < 3; i++) { const a = this.rnd() * TAU, v = 70 + this.rnd() * 60; c.sparks.push({ anchor: { x: e.x, y: e.y, offsetY: 0 }, x: e.x + Math.cos(a) * 20, y: e.y + Math.sin(a) * 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.4 - 10, t: 0, max: 0.7, size: 1.6, color: i ? '110,96,62' : '96,110,60' } as never); }
  }
  /** 叫一头妖王出来（只打他、不冲你来；你先打它它才回头找你） */
  private callBeast() {
    const g = this.game, s = this.s, e = this.ent!, { realm } = this.realmOf();
    const lv = realm >= 5 ? 10 : realm === 4 ? 9 : realm === 3 ? 7 : 4;
    const list = Object.values(ENEMIES).filter((d) => d.kind === 'beast' && d.lv && !d.flying && d.zone !== 'sea' && d.melee && !d.behave && !d.lm && !d.lair);
    if (!list.length) { s.fought = true; return; }
    const fit = list.filter((d) => d.lv![0] <= lv && lv <= d.lv![1] + 1);
    const pool = fit.length ? fit : list.slice().sort((a, b) => b.lv![1] - a.lv![1]).slice(0, 4);
    const r = mulberry32(hash32(s.seed, s.day, s.stop, 0xbe));
    const def = pool[Math.floor(r() * pool.length)];
    const a = r() * TAU;
    let bx = e.x + Math.cos(a) * 420, by = e.y + Math.sin(a) * 300;
    if (!this.okAt(bx, by, 0)) { bx = e.x - Math.cos(a) * 420; by = e.y - Math.sin(a) * 300; }
    const L = lvRealm(Math.min(lv, def.lv![1] + 1));
    const R = Math.random; Math.random = r;
    let B: Enemy;
    try { B = new Enemy(def, bx, by, L.realm, L.stage); } finally { Math.random = R; }
    B.blv = Math.max(B.blv, Math.min(10, lv));
    B.name = `${def.name}（妖王）`; B.maxHp = B.hp = Math.round(B.maxHp * 8); B.atk *= 1.2;
    B.aggro = true; B.grudge = e; B.grudgeT = g.time; B.tankRef = e; B.tankT = 2;
    B.kit = []; B.skT = 1e9; B.cdRanged = 1e9;   // 只拼肉身（不放范围法术：免得落到旁观的你头上）
    { const bb = g.combat.brawl.body(B); bb.poiseMax = Math.round(bb.poiseMax * 0.45); bb.poise = bb.poiseMax; }   // 罡气薄一些：他打得破、轰得飞
    (B as unknown as { noP: boolean }).noP = true;
    B.hx = e.x; B.hy = e.y;
    g.combat.enemies.push(B);
    this.beast = B;
    // 妖王身后两块巨石、一棵枯树：被他轰飞的妖王撞上就碎（breakables 手摆的，不碰随机序列）
    try { const ux = (bx - e.x) / 420, uy = (by - e.y) / 300, brk = g.combat.brawl.brk; brk.place('boulder', bx + ux * 520, by + uy * 380, 0.8, 1); brk.place('boulder', bx + ux * 820 - uy * 160, by + uy * 600 + ux * 120, 0.6, 2); brk.place('tree', bx + ux * 650 + uy * 260, by + uy * 470 - ux * 200, 0.7, 0); } catch { /* 无头 */ }
    this.toFight('brawl');
  }

  /** 放回寻常 AI 去打（妖兽 / 切磋 / 惹怒） */
  private toFight(m: 'brawl' | 'spar' | 'angry') {
    const e = this.ent!; this.mode = m; this.calmT = 0;
    this.shell(e, false);
    e.speed = m === 'spar' ? 0 : m === 'angry' ? 230 : 200;
    e.aggro = true;
  }
  private toCalm() {
    const e = this.ent!, g = this.game, B = g.combat.brawl;
    this.mode = 'calm'; this.spar = null; this.dir = null; this.demo = null;
    e.spar = false; e.aggro = false; e.guardT = 0; e.speed = 0; e.tgP = true; e.tgE = undefined; e.tankRef = undefined; e.hunt = false;
    this.applyStats(e);
    (e as unknown as { noP: boolean }).noP = true;
    B.clear(e);
    const b = B.peek(e); if (b?.ai) { b.ai.st = 'idle'; b.ai.cd = 1; b.ai.pow = 1; }
    if (g.combat.lock === e) g.combat.lock = null;
    this.shell(e, true);
  }
  /** 他这一下打多重：按对手算（按住打，免得把炼气的你一拳打没，也免得打妖王打半天） */
  private pace(tg: Enemy | null, frac: number) {
    const g = this.game, e = this.ent!, b = g.combat.brawl.peek(e); if (!b?.ai) return;
    let raw: number;
    if (!tg) { const ps = g.combat.pStats; raw = frac * ps.hp / realmTakeK(e.realm - g.hero.realm, g.hero.realm) + ps.def * 0.8; }
    else { raw = frac * tg.maxHp / (realmTakeK(clamp(e.realm - tg.realm, -3, 3), tg.realm) * 0.55) + tg.dfn * 0.8; }
    // 直接改他的攻力（撞墙、撞人的撞击伤害也按攻力算，跟着一起压住）；平时回到按境界的攻力
    e.atk = clamp(raw / 0.55, 1, 1e8); b.ai.pow = 1;
  }
  /** 和妖兽打：轻拳打掉一成上下；妖兽伤不了他根本（每帧回满） */
  private brawling(dt: number) {
    const g = this.game, e = this.ent!, b = g.combat.brawl.peek(e);
    e.hp = e.maxHp; e.speed = 200;
    // 妖王被一拳轰进水里（hideT）的那几帧：寻常 AI 找不到对手，又因为 noP 不许改打你，就把它「没对手」的怒气清了；
    // 接着 toCalm() 把九招的进度一起清掉——打妖王这一场还没完。对手只是暂时看不见，这里把仇恨按住
    if (this.beast && !this.beast.dead && !this.beast.gone) { e.aggro = true; e.tankRef = this.beast; e.tankT = Math.max(e.tankT, 2); }
    const tg = b?.ai?.tg ?? e.tgE ?? null;
    if (b?.ai) { b.ai.cd = Math.min(b.ai.cd, 0.6); this.pace(tg, tg && tg === this.beast ? 0.022 : 0.035); }
    // r7：打妖兽也用招式——打这一处的妖王时把九招轮着秀一遍（秀完照寻常的编排打），别的妖兽照寻常的编排
    if (tg && !tg.dead) this.direct(dt, tg, tg === this.beast);
    if (e.aggro) this.calmT = 0; else { this.calmT += dt; if (this.calmT > 1.2) this.toCalm(); }
  }

  /** 惹怒：真打、致死；你跑远了 / 进了城（寻常 AI 自己收手）就回到平时，但几十日不搭理你 */
  private raging(dt: number, dP: number) {
    const g = this.game, e = this.ent!, b = g.combat.brawl.peek(e);
    e.speed = 230; e.hp = Math.max(e.hp, e.maxHp * 0.5);
    if (b?.ai) this.pace(null, 0.16);
    if (g.hero.dead) { this.toCalm(); return; }
    if (e.aggro && dP < 3200) this.direct(dt, null);
    if (!e.aggro || dP > 3200) { this.calmT += dt; if (this.calmT > 2) this.toCalm(); } else this.calmT = 0;
  }
  /** 你打了他（不在切磋里） */
  private struck() {
    const g = this.game, e = this.ent!;
    if (g.time - this.warnAt > HS.warnWin) {
      this.warnAt = g.time;
      (e as unknown as { noP: boolean }).noP = true; e.aggro = this.mode === 'brawl';
      e.hp = e.maxHp;
      g.combat.texts = g.combat.texts.filter((t) => !(t.s === '找死！' && Math.abs(t.x - e.x) < 4));   // hitEnemy 替「不冲你来的人」喊的那一声：他只是皱眉
      g.combat.texts.push({ anchor: { x: e.x, y: e.y, offsetY: 0 }, x: e.x, y: e.y - 200, s: '小子，拳头看清楚了再挥。', color: '#ffcf8a', t: 0, vy: -16, big: true } as never);
      g.toast('那赤膊大汉眉头一皱，回头看了你一眼。（再对他出手，他就不客气了）', 'warn');
      return;
    }
    this.provoke('hit');
  }
  /** 惹怒他 */
  provoke(why: 'hit' | 'murder') {
    const g = this.game, e = this.ent, s = this.s;
    s.angryUntil = Math.floor(g.day) + HS.angryDays;
    if (!e) return;
    if (this.mode === 'spar') this.endSpar('abort');
    if (this.beast && !this.beast.dead) { (this.beast as unknown as { noP: boolean }).noP = true; }
    this.toFight('angry');
    (e as unknown as { noP: boolean }).noP = false; e.spar = false; e.tankRef = undefined; e.tankT = 0; e.hunt = true;
    const b = g.combat.brawl.peek(e); if (b?.ai) b.ai.cd = 0.2;
    g.combat.texts.push({ anchor: { x: e.x, y: e.y, offsetY: 0 }, x: e.x, y: e.y - 200, s: why === 'murder' ? '手无寸铁的人你也下得去手？' : '找打！', color: '#ff8a6a', t: 0, vy: -16, big: true } as never);
    g.toast(why === 'murder' ? '撼山客的脸沉了下来——他要替那人讨个公道！' : '撼山客动了真怒！他的拳头可不会再收着了。', 'warn');
    g.news(why === 'murder' ? '当着撼山客的面滥杀凡人，惹得他动了真怒。' : '对撼山客出手，惹得他动了真怒。', 'personal');
    g.combat.lock = e; g.combat.manual = true;
  }
  /** 战斗钩子：有人被你杀了——在他面前杀不还手的凡人，他认真打 */
  onKill(e: Enemy) {
    const me = this.ent; if (!me || e === me || this.mode === 'angry') return;
    if (Math.hypot(e.x - me.x, e.y - me.y) > 1600) return;
    const d = e.npcId ? this.game.npcs.byId.get(e.npcId) : null;
    if (d && (d.faction === 'mortal' || d.realm === 0)) this.provoke('murder');
  }
  /** 你被他打倒：照寻常的战败处理（路人救回城、道伤），他不搜你的袋子；返回 true 表示已处理 */
  onPlayerDown(killer?: Enemy): boolean {
    const e = this.ent; if (!killer || !e || killer !== e) return false;
    const g = this.game;
    this.toCalm();
    const rx = g.renxin as unknown as { lastAttacker: Enemy | null; onPlayerDown(k?: Enemy | null): boolean };
    rx.lastAttacker = null;
    const fist = { name: '撼山客', def: { id: 'hanshan_fist', kind: 'beast', name: '撼山客' }, school: undefined, npcId: undefined } as unknown as Enemy;
    rx.onPlayerDown(fist);
    g.toast('（远远传来一句）下回动手之前，先想清楚。', 'warn');
    return true;
  }

  // ------------------------------------------------------------------ 切磋
  /** 开始切磋：他让三招（只挡不还手），然后还手；不致死 */
  startSpar() {
    const g = this.game, e = this.ent; if (!e) return false;
    if (this.beast && !this.beast.dead) return false;
    this.toFight('spar');
    e.spar = true; e.aggro = true; e.hp = e.maxHp; e.guardT = 0;
    // 切磋是点到为止：护体灵光会把「让三招」的拳脚全吃掉，他也就不数招了——切磋前先撤掉灵光（打完重新入战再凝）
    e.ward = undefined; e.wardRe = 0; e.wardFrac = 0;
    (e as unknown as { noP: boolean }).noP = false;
    const b = g.combat.brawl.peek(e); if (b?.ai) { b.ai.cd = 99; b.ai.st = 'idle'; }
    this.spar = { t0: g.time, yieldHits: 0, counterAt: -1, hits: 0, hpPrev: e.hp, far: 0, done: false };
    const s = this.s; s.spars = (s.spars ?? 0) + 1; s.lastSpar = Math.floor(g.day);
    if (s.spars === 1) g.news('与撼山客切磋。他说先让三招。', 'personal');
    g.combat.lock = e; g.combat.manual = true;
    g.combat.texts.push({ anchor: { x: e.x, y: e.y, offsetY: 0 }, x: e.x, y: e.y - 200, s: '来，先让你三招。', color: '#ffe0a0', t: 0, vy: -14, big: true } as never);
    return true;
  }
  private sparring(dt: number, dP: number) {
    const g = this.game, c = g.combat, e = this.ent!, S = this.spar!, b = c.brawl.peek(e);
    (c as unknown as { pressWarnT: number }).pressWarnT = 25;   // 切磋不报「对方高出一个大境界、速逃」
    const hit = e.hp < S.hpPrev - 0.5;
    if (S.counterAt < 0) {
      // 让招：只挡不还手（站定、护体、不扣血）
      e.speed = 0; e.guardT = 0.3; if (b?.ai) b.ai.cd = 99;
      if (hit) {
        S.yieldHits++; e.hp = S.hpPrev;
        c.fxq.push({ k: 'bxblock', anchor: { x: e.x, y: e.y, offsetY: 0 }, x: e.x, y: e.y - 70, color: '255,214,150', power: 1 } as never);
        const L = ['一招。', '两招。', '三招——该我了！'];
        c.texts.push({ anchor: { x: e.x, y: e.y, offsetY: 0 }, x: e.x, y: e.y - 190, s: L[Math.min(2, S.yieldHits - 1)], color: '#ffe0a0', t: 0, vy: -18, big: S.yieldHits >= HS.yieldN } as never);
        if (S.yieldHits >= HS.yieldN) { S.counterAt = g.time; e.speed = 200; e.guardT = 0; if (b?.ai) b.ai.cd = 0.5; }
      }
    } else {
      if (hit) S.hits++;
      e.speed = 200; if (b?.ai) { b.ai.cd = Math.min(b.ai.cd, 0.9); this.pace(null, 0.055); }
      if (g.time - S.counterAt > HS.sparMax) { this.endSpar('time'); return; }
      this.direct(dt, null);   // r7：试探 → 连招 → 喘口气喝酒 → 再来
    }
    S.hpPrev = e.hp;
    // 你跑开了
    if (dP > 1800) { S.far += dt; if (S.far > 4) { this.endSpar('fled'); return; } } else S.far = 0;
    if (g.hero.dead) this.endSpar('abort');
  }
  /** combat.onSparEnd（game.hookCombat 里先问这里）：是他就接管，返回 true */
  onSpar(e: Enemy, playerWon: boolean): boolean {
    if (!this.ent || e !== this.ent || this.mode !== 'spar') return false;
    // 切磋不致死：hitEnemy / hitPlayer 已把他标成 dead（照寻常切磋对手离场）——他不走，原地收手
    e.dead = false; e.deathT = 0;
    this.endSpar(playerWon ? 'won' : 'lost');
    return true;
  }
  /** 收场：记下撑了多久、打中几下，给话和奖励 */
  endSpar(why: 'won' | 'lost' | 'time' | 'fled' | 'abort') {
    this.s.lastSpar = Math.floor(this.game.day);   // 冷却从这一场打完算（三批招合进来以后一场能打到七十多息、几十天，从开打算冷却早就过了）
    const g = this.game, S = this.spar, e = this.ent; if (!S || !e || S.done) return;
    S.done = true;
    const s = this.s;
    const held = S.counterAt < 0 ? 0 : g.time - S.counterAt;
    this.toCalm();
    e.hp = e.maxHp;
    if (why === 'abort') return;
    if (why === 'fled') { g.toast('撼山客摆了摆手：「打不过就跑，也算本事。」', 'info'); return; }
    const tier = why === 'won' || why === 'time' ? 3 : held >= HS.tiers[2] ? 3 : held >= HS.tiers[1] ? 2 : held >= HS.tiers[0] ? 1 : 0;
    const first = (s.tier ?? -1) < tier;
    s.best = Math.max(s.best ?? 0, why === 'won' || why === 'time' ? Math.max(held, HS.tiers[2] + 15) : held);
    s.bestHits = Math.max(s.bestHits ?? 0, S.hits);
    s.tier = Math.max(s.tier ?? 0, tier);
    const before = (s.taught ?? []).length;
    this.unlock(s);
    const newMove = (s.taught ?? []).length > before;
    // r7：答应传的招里已经做出来的（一寸崩、震脚），当场手把手教会——法术书里多一门，能拖进技能栏
    const taughtNow = this.teach((s.taught ?? []).slice(before));
    const reward = this.reward(tier, first);
    if (first && tier > 0) g.news(`与撼山客切磋，撑过了${['', '十', '二十五', '四十五'][tier]}息。他看你的眼神不一样了。`, 'personal');
    const heldS = Math.round(held);
    const line = why === 'won' ? '（他愣了一愣，随即放声大笑）好小子！我这把老骨头，今天算是认了。'
      : why === 'time' ? '（他收了拳，喘着粗气直笑）够了够了——再打下去，这片山头就没了。痛快！'
      : ['（他收了拳，伸手把你从地上拽起来）站得太直，挨打就跟木头一样倒。下回膝盖弯一点。',
        '嗯，躲得还算机灵。就是手上没根——拳从腰上起，不是从肩上。',
        '（他抹了把汗，咧嘴笑了）好！挨了我那几下还站着。值一口酒。',
        '（他把酒葫芦往你怀里一扔）痛快！多少年没打得这么舒坦了。'][tier];
    const lesson = taughtNow.map((m) => TEACH_LINE[m.id] ?? `看好了——这一手叫「${m.name}」。`).join('\n\n');
    const more = taughtNow.length ? `\n\n（他拉开架势，慢慢比划了一遍）${lesson}\n\n（你学会了${taughtNow.map((m) => '「' + m.name + '」').join('、')}——法术书里多了这一门，可以拖进技能栏。）`
      : newMove ? '\n\n（他看你的眼神，多了几分认真。）再撑久些——我有几手压箱底的，到时候让你瞧瞧。' : tier < 3 ? '\n\n再撑久些。' : '';
    if (taughtNow.length) g.news(`撼山客手把手传了${taughtNow.map((m) => '「' + m.name + '」').join('、')}。`, 'personal');
    const text = `${line}${more}\n\n——你撑了 ${heldS} 息，打中他 ${S.hits} 下。${reward ? '\n' + reward : ''}`;
    this.pending = { at: g.time + 1.1, node: () => ({ speaker: '岳千钧', title: this.title(), portrait: './art/npc/yueqianjun.webp', text, mood: 'normal', options: [{ label: '多谢前辈指点', act: () => null }, { label: '再说几句', act: () => this.node() }] }) };
  }
  /** 他答应传的招：按撑得最久的时间逐招记下（化神后加一拳破界） */
  private unlock(s: HsSave) {
    const best = s.best ?? 0, have = new Set(s.taught ?? []);
    for (const m of HS_MOVES) if (!have.has(m.id) && best >= m.need && (m.realm === undefined || this.game.hero.realm >= m.realm)) { (s.taught ??= []).push(m.id); have.add(m.id); }
  }
  /** 奖励（先给实在的）：修为；近战四式的熟练度（还不会的手把手教会）；撑满一档第一次再给一件体修装备 */
  private reward(tier: number, first: boolean): string {
    const g = this.game, h = g.hero, out: string[] = [];
    const msgs: C.Msg[] = [];
    const exp = C.need(h) * C.INSIGHT * [0.015, 0.035, 0.06, 0.1][tier];
    const e0 = h.exp; C.gainExp(h, exp, msgs);
    const got = Math.round(h.exp - e0 > 0 ? h.exp - e0 : exp);
    if (got > 0) out.push(`修为 +${got}`);
    if (tier >= 1) {
      const learnt = g.combat.brawl.learn(true);
      if (learnt.length) out.push(`他手把手教了你几式贴身的路数：${learnt.join('、')}`);
      const xp = [0, 6, 12, 20][tier];
      const names: string[] = [];
      for (const a of BRAWL_ARTS) if (h.arts.some((x) => x.id === a.id)) { g.combat.gainXp(a.id, xp); names.push(a.name); }
      if (names.length) out.push(`近战四式熟练 +${xp}`);
    }
    if (first && tier >= 2) {
      const id = tier >= 3 ? 'gear_bs_belt' : 'gear_bs_wrist';
      if (ITEMS[id]) { C.addItem(h, id, 1); out.push(`他随手丢给你一件${ITEMS[id].name}：「我用不上，你拿着。」`); }
    }
    for (const m of msgs) g.toast(m.text, m.kind === 'warn' ? 'warn' : m.kind === 'good' ? 'good' : 'info');
    g.updateUI(true);
    return out.length ? '（' + out.join('；') + '）' : '';
  }

  // ------------------------------------------------------------------ r7 招式：出招、编排、试玩、传招
  /** 编排：试探（寻常拳脚）→ 连招（两三招接着放，最后一招可以切定格特写）→ 喘口气（退开喝一口，站着不出手）→ 再来。show = 打妖王时先把九招轮着秀一遍 */
  private dir: { ph: 'probe' | 'combo' | 'breath'; t: number; len: number; queue: string[]; gap: number; i: number; show: number; cuts: number; react: number; hp: number; hits: number[]; throwAt: number } | null = null;
  /** 试玩入口：对着木人桩循环放某一招（try=hanshan&move=…）；all = 九招轮着放 */
  demo: { id: HsMoveId | 'all'; tg: Enemy; t: number; hx: number; hy: number; ex: number; ey: number; n: number; thrown: boolean; after: number } | null = null;
  /** 编排开关（测试里一招一招手动放时关掉） */
  autoMoves = true;
  /** 放过的招（测试、试玩页读） */
  castLog: string[] = [];

  /** 放一招（registerMove 挂进出招表的那一份；perform 也走这里）。tg = null 是你；cut = 一套的收尾，允许切定格特写（频率上限在 impactfx） */
  cast(id: HsMoveId, tg: Enemy | null, cut = false): boolean {
    const e = this.ent; if (!e || this.mode === 'calm' || e.dead) return false;
    const B = this.game.combat.brawl; if (B.peek(e)?.move) return false;
    const def = HS_MOVE_DEFS[id]; if (!def) return false;
    if (!B.startMove(def, e, tg ?? 'p')) return false;
    const run = B.peek(e)?.move; if (run && cut) run.data.cut = true;
    this.castLog.push(id); if (this.castLog.length > 64) this.castLog.shift();
    return true;
  }
  /** 正在出招 */
  get moving(): boolean { const e = this.ent; return !!e && !!this.game.combat.brawl.peek(e)?.move; }
  /** 冲他来的法术 / 飞剑有几件（八百二以内） */
  private nIncoming(): number {
    const e = this.ent!; let n = 0;
    for (const pr of this.game.combat.projs) { const hostile = pr.fac === 'p' ? !pr.ally : pr.tk === e; if (!hostile) continue; const d = Math.hypot(pr.x - e.x, pr.y + (pr.visual?.groundOffsetY ?? 40) - e.y); if (d < 820 && pr.vx * (e.x - pr.x) + pr.vy * (e.y - pr.y - 40) > 0) n++; }
    return n;
  }
  /**
   * 一套连招（三批合在一起；自己的随机序列，不碰 Math.random）：
   *   第一批（起手、位移）多做开头和衔接，第二批（连击、擒拿）是中段的主菜，收尾多是一寸崩 / 震脚；
   *   隔一阵来一记第三批的大招（无极一击、千钧坠、一拳破界——它们自己有「两分钟最多两次」的名额，放不出就跳过）。
   *   切磋里你快撑不住了（气血不到四成五）只用第一批的寻常招收尾，不再上擒拿和大招。
   */
  /** r8-p2：第二阶段的连招表（world/hsp2.ts 挂上；他燃着时返回那一套，平时返回 null） */
  p2Combo: ((d: number, tg: Enemy | null, rnd: () => number) => string[] | null) | null = null;
  private pickCombo(d: number, tg: Enemy | null): string[] {
    const soft = !tg && this.mode === 'spar' && this.game.hero.hp < 0.45;
    { const q = soft ? null : this.p2Combo?.(d, tg, () => this.rnd()); if (q) return q; }
    const far: string[][] = [['quanya', 'suodi', 'yicunbeng'], ['suodi', 'yicunbeng'], ['takong', 'zhenjiao'], ['quanya', 'takong']];
    const near: string[][] = [['zhenjiao', 'suodi', 'yicunbeng'], ['yicunbeng'], ['zhenjiao', 'yicunbeng'], ['takong', 'zhenjiao'], ['suodi', 'yicunbeng']];
    if (!soft) {
      far.push(['zhishan', 'suodi', 'liuxing'], ['suodi', 'lidi'], ['quanya', 'shifang'], ['suodi', 'yanhui', 'yicunbeng']);
      near.push(['liuxing'], ['yanhui', 'yicunbeng'], ['shifang'], ['tiandi'], ['dianxue'], ['lidi'], ['yunxing'], ['zhenjiao', 'lunren'], ['suodi', 'tiandi'], ['yanhui', 'lidi']);
      // r8-p1：照参考视频新增的四招合进近身那一组（断脉腿、撞山靠、顶心膝、影踪连环踢），影踪连环踢起手要拉开三四个身位，远的那组也放
      near.push(['duanmai'], ['zhuangshan'], ['dingxin', 'yicunbeng'], ['yingzong'], ['suodi', 'dingxin'], ['duanmai', 'zhuangshan'], ['liuxing', 'dingxin']);
      far.push(['yingzong'], ['suodi', 'duanmai']);
    }
    const L = d > 520 ? far : near;
    const q = L[Math.floor(this.rnd() * L.length) % L.length].slice();
    if (!soft && this.rnd() < 0.18) q.push(['wuji', 'qianjunzhui', 'pojie'][Math.floor(this.rnd() * 3) % 3]);   // 收尾的大招（r7-fx3d：分海并进了无极一击——拳路上是海就劈开）
    return q;
  }
  /** 放连招里的一招：第一批走 cast（能切定格特写），第二、三批走各自挂进出招表的那一份（perform） */
  private fire(id: string, tg: Enemy | null, climax: boolean): boolean {
    if ((HS_BATCH1 as readonly string[]).includes(id)) return this.cast(id as HsMoveId, tg, climax);
    const ok = this.perform(id, tg);
    if (ok) { this.castLog.push(id); if (this.castLog.length > 64) this.castLog.shift(); }
    return ok;
  }
  private direct(dt: number, tg: Enemy | null, show = false) {
    const g = this.game, e = this.ent!, B = g.combat.brawl, b = B.peek(e); if (!b?.ai || !this.autoMoves) return;
    const D = (this.dir ??= { ph: 'probe', t: 0, len: 2.2, queue: [], gap: 0, i: 0, show: 0, cuts: 0, react: 0.5, hp: e.hp, hits: [], throwAt: -1 });
    D.t += dt; D.react -= dt;
    // 挨打计数（被连着打就站定硬吃：金刚不坏）
    if (e.hp < D.hp - 0.5) D.hits.push(g.time);
    D.hp = e.hp; D.hits = D.hits.filter((t) => g.time - t < 1.6);
    if (this.moving) { b.ai.cd = Math.max(b.ai.cd, 0.4); return; }
    const T = tg ?? g.player, d = Math.hypot(T.x - e.x, T.y - e.y), who: Enemy | 'p' = tg ?? 'p';
    // 应对（克制法修）：飞来的法术、飞剑、对手蓄重击、被连着打——随时插进来（喘气喝酒时不管）
    if (D.react <= 0 && D.ph !== 'breath') {
      const n = this.nIncoming();
      if (n === 1 && hsReady(B, 'kongshou', e, who) && this.cast('kongshou', tg)) { D.react = 1.6; return; }
      if (n >= 1 && hsReady(B, 'qihe', e, who) && this.cast('qihe', tg)) { D.react = 1.6; return; }
      if (d < 380 && windingAt(B, who) && hsReady(B, 'houfa', e, who) && this.cast('houfa', tg, D.cuts < 1)) { D.react = 1.4; if (D.cuts < 1) D.cuts++; return; }
      if (D.hits.length >= 3 && hsReady(B, 'jingang', e, who) && this.cast('jingang', tg)) { D.react = 2; D.hits = []; return; }
    }
    // 打妖王：九招轮着秀一遍（中间夹着寻常拳脚）；接宝、气合之前，妖王先朝他喷一团火、林子里飞来一柄劫修的飞剑
    if (show && D.show < HS_BATCH1.length) {
      if (D.ph === 'breath') { this.shell(e, false); D.ph = 'probe'; }
      b.ai.cd = Math.min(b.ai.cd, 0.7);
      if (D.t < 1.5) return;
      const id = HS_BATCH1[D.show];
      if ((id === 'kongshou' || id === 'qihe') && D.throwAt < 0) { D.throwAt = g.time; this.hurl(tg!, id === 'kongshou' ? 'sword' : 'fire', id === 'qihe' ? 3 : 1); return; }
      if ((id === 'kongshou' || id === 'qihe') && g.time - D.throwAt < (id === 'kongshou' ? 0.05 : 0.3)) return;   // 接宝：飞剑一出手就起势（妖王离得近，等久了剑已经打到身上）
      if (this.cast(id, tg, id === 'yicunbeng') || g.time - D.throwAt > 2.5 || (e.skCd[id] ?? 0) > 0) { D.show++; D.t = 0; D.throwAt = -1; }
      return;
    }
    switch (D.ph) {
      case 'probe': {
        b.ai.cd = Math.min(b.ai.cd, 0.7);   // 试探：寻常拳脚
        if (D.t < D.len) return;
        D.queue = this.pickCombo(d, tg); D.i = 0; D.ph = 'combo'; D.t = 0; D.gap = 0.12;
        return;
      }
      case 'combo': {
        b.ai.cd = 99;
        D.gap -= dt; if (D.gap > 0) return;
        if (D.i >= D.queue.length || D.t > 9) { D.ph = 'breath'; D.t = 0; return; }
        const id = D.queue[D.i], last = D.i === D.queue.length - 1, climax = last && (id === 'yicunbeng' || id === 'zhenjiao') && D.cuts < 2;
        if (this.fire(id, tg, climax)) { if (climax) D.cuts++; D.gap = 0.28; } else D.gap = 0.08;   // 放不出（冷却中、够不着、抓不动、不在水上）就跳过
        D.i++;
        return;
      }
      case 'breath': {
        // 喘口气：退开一步、仰头喝一口（站着不出手——你可以趁这时候打他）。打妖兽时只退开不喝
        b.ai.cd = 99;
        const drink = !tg || tg.def.kind === 'human';
        if (D.t < (drink ? 2.4 : 0.8)) { this.breathe(dt, T, drink); return; }
        this.shell(e, false);
        D.ph = 'probe'; D.t = 0; D.len = 2.2 + this.rnd() * 2.4;
        return;
      }
    }
  }
  /** 喘口气：前 0.4 息往后撤一步，然后站定仰头灌一口（手动驱动人物：寻常 AI 先放下） */
  private breathe(dt: number, from: { x: number; y: number }, drink: boolean) {
    const e = this.ent!, cs = e.cs!, D = this.dir!, T = this.game.terrain;
    this.shell(e, true);
    if (D.t < 0.4) {
      const dx = e.x - from.x, dy = e.y - from.y, L = Math.hypot(dx, dy) || 1, v = 520 * dt, nx = e.x + dx / L * v, ny = e.y + dy / L * v;
      if (T.walkFactor(nx, ny) > 0 && T.canTraverse(e.x, e.y, nx, ny)) { e.x = nx; e.y = ny; }
      cs.setAction('walk'); cs.speed = 300;
    } else { cs.setAction(drink ? 'drink' : 'idle'); cs.speed = 0; }
    cs.faceToward(from.x - e.x, from.y - e.y, false);
    e.hx = e.x; e.hy = e.y; cs.x = e.x; cs.y = e.y; cs.lift = e.flyH; e.anim.move = 0;
    cs.update(dt);
  }
  /** 朝他飞来一件东西（看他打妖王、试玩入口：给空手接宝、气合一个能接、能震的）——从 from 那儿发出，算 from 的 */
  hurl(from: Enemy, kind: 'sword' | 'fire', n = 1) {
    const e = this.ent; if (!e) return;
    const c = this.game.combat;
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2), sx = from.x + o * 50, sy = from.y - 40, a = Math.atan2(e.y - 40 - sy, e.x - sx) + o * 0.1, sp = kind === 'sword' ? 1050 : 720;
      c.projs.push({ fac: 'e', visual: { groundOffsetY: 40, elevation: from.z }, x: sx, y: sy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 3, fx: kind === 'sword' ? 'sword' : 'fireball', color: kind === 'sword' ? '200,228,255' : '255,140,60', dmg: from.atk * 0.5, realm: from.realm, stCh: 0, pierce: false, homing: false, hit: new Set(), r: 26, aoe: 0, size: 1, trail: [], lv: 0, tk: e, src: from } as never);
    }
  }
  /** 试玩入口：对着木人桩循环放一招（all = 九招轮着放）。木人桩被打飞了放回原处、他自己也回到起点 */
  startDemo(id: HsMoveId | 'all'): Enemy | null {
    const e = this.ent; if (!e) return null;
    const B = this.game.combat.brawl, far = id === 'quanya' || id === 'suodi' || id === 'takong' || id === 'kongshou' || id === 'qihe' || id === 'all';
    const tg = B.spawnSparMan(e.x + (far ? 620 : 160), e.y + 10, Math.max(1, e.realm - 1));   // r7-polish：人形陪练（被打、被摔看得出是个人）
    tg.kit = []; tg.skT = 1e9; tg.cdRanged = 1e9; tg.aggro = false; tg.speed = 0;
    this.toFight('brawl'); e.speed = 0; e.aggro = true; e.tgP = false; e.tgE = tg;
    this.demo = { id, tg, t: 1.2, hx: tg.x, hy: tg.y, ex: e.x, ey: e.y, n: 0, thrown: false, after: -1 };
    return tg;
  }
  private demoTick(dt: number) {
    const D = this.demo!, e = this.ent!, g = this.game, B = g.combat.brawl, b = B.peek(e), tg = D.tg;
    if (!g.combat.enemies.includes(tg)) { this.demo = null; this.toCalm(); return; }
    e.hp = e.maxHp; tg.hp = tg.maxHp; e.aggro = true; e.tgP = false; e.tgE = tg; tg.aggro = false;
    if (b?.ai) { b.ai.cd = 99; b.ai.st = 'idle'; this.pace(tg, 0.01); }
    if (D.after > 0 && g.time >= D.after) { D.after = -1; this.hurl(tg, 'sword'); }   // 金刚不坏：起手后朝他飞一柄剑，让他硬吃
    if (this.moving) return;
    D.t += dt;
    const id: HsMoveId = D.id === 'all' ? HS_BATCH1[D.n % HS_BATCH1.length] : D.id;
    // 歇一会儿：木人桩落地后放回原处，他也回到起点（缩地、踏空会把他带走）
    if (D.t > 0.9) {
      const tb = B.peek(tg);
      if (!tb?.air && Math.hypot(tg.x - D.hx, tg.y - D.hy) > 20) { B.clear(tg); tg.x = D.hx; tg.y = D.hy; tg.flyH = 0; tg.lift = 0; tg.kx = tg.ky = 0; }
      const far = id === 'quanya' || id === 'suodi' || id === 'takong' || id === 'kongshou' || id === 'qihe';
      const ex = D.hx - (far ? 620 : 160), ey = D.hy - 10;
      if (Math.hypot(e.x - ex, e.y - ey) > 20 && !B.isAir(e)) { e.x = ex; e.y = ey; e.flyH = 0; e.lift = 0; if (e.cs) { e.cs.x = ex; e.cs.y = ey; e.cs.lift = 0; } }
      e.cs?.faceToward(tg.x - e.x, tg.y - e.y, false);
    }
    // 接宝、气合：先朝他扔点东西（木人桩「发」的）；金刚不坏：起手后朝他飞一柄剑让他硬吃
    if ((id === 'kongshou' || id === 'qihe') && D.t > 1.7 && !D.thrown) { D.thrown = true; this.hurl(tg, id === 'kongshou' ? (D.n % 2 ? 'fire' : 'sword') : 'fire', id === 'qihe' ? 3 : 1); }
    if (D.t < 2.1) return;
    e.skCd[id] = 0;
    if (this.cast(id, tg, true)) {
      if (id === 'jingang') D.after = g.time + 0.25;
      D.t = 0; D.n++; D.thrown = false;
    }
  }
  /** 他答应传的招里已经做出来的：学会（放进法术书）。返回这一次新学会的 */
  private teach(ids: string[]): { id: string; name: string }[] {
    const h = this.game.hero, out: { id: string; name: string }[] = [];
    for (const id of ids) { const m = MOVES.get(id); if (!m) continue; const had = h.arts.some((a) => a.id === 'bxm_' + id); if (learnMove(h, id) && !had) out.push({ id, name: m.name }); }
    return out;
  }
  /** 读档 / 新开局：存档里记着答应传、法术书里却没有的（旧存档、那时还没做出来的招）补上 */
  syncTaught() { if (ACTIVE_MAP === 'tiannan') this.teach(this.s.taught ?? []); }
  /** 雨不沾身：屏幕上他身形的那一块椭圆（render 给 weather.shelter；只在下雨、他在场时） */
  shelter(project: (x: number, y: number, h: number) => { x: number; y: number }): { x: number; y: number; rx: number; ry: number } | null {
    const e = this.ent, W = this.game.weather; if (!e || (W.kind !== 'rain' && W.kind !== 'storm') || W.k < 0.05) return null;
    const a = project(e.x, e.y, e.z), b = project(e.x, e.y, e.z + 170);
    if (!Number.isFinite(a.x) || !Number.isFinite(b.y)) return null;
    const h = Math.abs(a.y - b.y); if (h < 4) return null;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, rx: h * 0.42, ry: h * 0.66 };
  }

  // ------------------------------------------------------------------ 搭话
  private title() { const r = this.realmOf(); return `${realmName(r.realm, r.stage)} · 体修 · 散人`; }
  /** 离你多近（交谈键排序用）；不在 / 正在打 / 惹怒中都不算 */
  focusD(): number {
    const e = this.ent; if (!e || this.mode !== 'calm') return 1e9;
    const p = this.game.player, d = Math.hypot(e.x - p.x, e.y - p.y);
    return d < 200 ? d : 1e9;
  }
  talkLabel(): string | null { return this.focusD() < 1e9 ? `与${this.s.met ? '岳千钧' : '赤膊大汉'}交谈` : null; }
  /** 交谈键 / 点他 */
  talk(): boolean {
    const g = this.game, e = this.ent; if (!e || this.mode !== 'calm') return false;
    if (this.angry) { g.toast(['撼山客背过身去，连眼皮都不抬：「走。」', '撼山客看也不看你：「我不跟背后下手的人说话。」'][Math.floor(g.day) % 2], 'warn'); return true; }
    g.openDialog(this.node(true));
    return true;
  }
  /** 手机点到他：近了开口，远了不锁定他（免得一锁定法术就打上去） */
  click(foe: Enemy): boolean {
    if (foe !== this.ent || this.mode !== 'calm') return false;
    const p = this.game.player;
    if (Math.hypot(foe.x - p.x, foe.y - p.y) < 220) this.talk(); else this.game.setDestination(foe.x, foe.y + 40);
    return true;
  }
  /** 对话 */
  node(open = false): DNode {
    const g = this.game, s = this.s, first = !s.met;
    if (open && first) { s.met = true; g.news('结识撼山客岳千钧——一个走遍南荒、到处找人打架的体修。', 'personal'); if (this.ent) this.ent.name = this.plate; }
    const cd = s.lastSpar !== undefined && g.day - s.lastSpar < HS.sparCd;
    const text = open
      ? (first ? '（那赤膊大汉上下打量你一眼，咧嘴一笑）姓岳，岳千钧。走江湖的朋友给面子，叫一声撼山客。\n你呢——是来看热闹，还是来挨揍的？'
        : (s.tier ?? 0) >= 2 ? '（他冲你扬了扬酒葫芦）又是你。骨头养好了？' : (s.spars ?? 0) > 0 ? '（他斜了你一眼）还想挨揍？' : '（他拎着酒葫芦，眯眼看你）有事？')
      : '（他靠着石头坐下，拔开酒葫芦的塞子）还有什么想问的？';
    const opts: DOpt[] = [
      { label: '请教一二（切磋）', hint: cd ? '他刚打完一场，说过几日再来' : '他让你三招，然后还手；点到为止，不伤性命', disabled: cd, tone: 'gold', act: () => { this.startSpar(); return null; } },
      { label: '攀谈', act: () => { const i = (s.talkN ?? 0) % CHATS.length; s.talkN = (s.talkN ?? 0) + 1; return { speaker: '岳千钧', title: this.title(), portrait: './art/npc/yueqianjun.webp', text: CHATS[i], mood: 'normal', options: [{ label: '还有呢？', act: () => this.node() }, { label: '告辞', act: () => null }] }; } },
      { label: '告辞', act: () => null },
    ];
    return { speaker: s.met ? '岳千钧' : '赤膊大汉', title: this.title(), portrait: './art/npc/yueqianjun.webp', text, mood: 'normal', options: opts };
  }

  // ------------------------------------------------------------------ 地图、小地图、动静
  /** 世界地图（和小地图）上的目击标记：见过之后才有 */
  marks(): { x: number; y: number; glyph: string; color: string; ring?: number; name: string }[] {
    const s = this.s; if (!s.seen || ACTIVE_MAP !== 'tiannan') return [];
    const ago = Math.max(0, Math.floor(this.game.day) - s.seen.d);
    return [{ x: s.seen.x, y: s.seen.y, glyph: '撼', color: '#f0b860', name: `撼山客 · 上次见于${s.seen.place}（${ago === 0 ? '今日' : ago + ' 天前'}）` }];
  }
  /** 小地图上的他（近处才有）：和普通人不一样的点 */
  dot(): { x: number; y: number; angry: boolean } | null { const e = this.ent; return e ? { x: e.x, y: e.y, angry: this.mode === 'angry' } : null; }
  /** 动静：两万以内、他正在和妖兽打（远处只是数据；近处真打但不在屏幕里）——方向（世界里的角度）和强弱（0–1） */
  quakeInfo(): { ang: number; k: number } | null {
    const g = this.game, p = g.player;
    if (ACTIVE_MAP !== 'tiannan' || g.offWorld) return null;
    const s = this.s;
    const fighting = this.ent ? this.mode === 'brawl' : s.mode === 'stay' && s.fight && !s.fought;
    if (!fighting) return null;
    const x = this.ent?.x ?? s.x, y = this.ent?.y ?? s.y, d = Math.hypot(x - p.x, y - p.y);
    if (d > HS.quakeR || d < 1300) return null;
    return { ang: Math.atan2(y - p.y, x - p.x), k: clamp(1.15 - d / HS.quakeR, 0.3, 1) };
  }
  private quake(dt: number, _d: number) {
    const g = this.game, q = this.quakeInfo();
    this.flashes = this.flashes.filter((f) => g.time - f.t < 1.4);
    if (!q || g.halted) return;
    this.quakeT -= dt;
    if (this.quakeT <= 0) {
      this.quakeT = 2.2 + this.rnd() * 1.6;
      this.flashes.push({ id: ++this.flashId, ang: q.ang, k: q.k, t: g.time });
      this.rumbleAt = g.time + 0.35 + (1 - q.k) * 0.6; this.rumbleK = q.k;
    }
    if (this.rumbleAt && g.time >= this.rumbleAt) { this.rumbleAt = 0; this.rumble(this.rumbleK); }
  }
  /** 远处的一声闷雷（现合成：audio 的堂鼓压低频、拉长衰减，离得越远越轻） */
  private rumble(k: number) {
    const A = audio as unknown as { ctx: AudioContext | null; enabled: boolean; sfxBus: AudioNode; drum(when: number, vol: number, dest: AudioNode, f0?: number, f1?: number, dec?: number): void };
    if (!A.ctx || !A.enabled || !A.sfxBus) return;
    try { const t = A.ctx.currentTime; A.drum(t, 0.16 + 0.3 * k, A.sfxBus, 70, 26, 1.3); A.drum(t + 0.09, 0.1 + 0.18 * k, A.sfxBus, 48, 22, 1.6); } catch { /* 没有声卡 */ }
  }

  // ------------------------------------------------------------------ 痕迹的画法
  /** 你身边的痕迹：近的画上、远的收起 */
  private paintNear() {
    const g = this.game, p = g.player, s = this.s, today = g.day;
    const live = new Set<HsTrace>();
    // 近的先画；地贴最多 20 块（combat.scorch 别的招也要用：重击的焦痕在 24 块以内才留）
    const near = s.traces.map((t) => [t, Math.hypot(t.x - p.x, t.y - p.y)] as [HsTrace, number]).filter(([, d]) => d < 2800).sort((a, b) => a[1] - b[1]);
    let budget = 20;
    for (const [t] of near) {
      const fade = clamp(1 - (today - t.d) / HS.traceLife, 0, 1);
      const cost = t.k === 'furrow' ? 8 : 2;
      if (fade <= 0 || cost > budget) continue;
      budget -= cost; live.add(t);
      this.painted.set(t, paintTrace(g, t, fade, this.painted.get(t) ?? null));
    }
    for (const [t, P] of this.painted) if (!live.has(t)) { unpaintTrace(g, P); this.painted.delete(t); }
  }

  // ------------------------------------------------------------------ 给下一步做招式的人
  /**
   * 让他出某一招（tg：对手，null = 你）。先找 moves 里挂上的招（registerMove）；没挂的用现有近战顶：
   * 'jab' 轻拳、'heavy' 重击（罡气破了就轰飞）、'grab' 抓投——都是 brawlfoe 的那一套，伤害走 hitPlayer / npcHit。
   * 真人不在、不在打架（平时 shell）时返回 false。
   */
  perform(id: string, tg: Enemy | null = null): boolean {
    const f = this.moves.get(id); if (f) return f(tg);
    const e = this.ent; if (!e || this.mode === 'calm') return false;
    const b = this.game.combat.brawl.peek(e); if (!b?.ai) return false;
    const ai = b.ai; ai.tg = tg; ai.pat = id === 'heavy' ? 'h' : id === 'grab' ? 'g' : 'j'; ai.i = 0; ai.n = 0; ai.st = 'combo'; ai.t = 0.22;
    return true;
  }
  /** 挂一招：fn(对手) 返回出没出。招式线做好一招就挂上来，AI 和 perform 都从这里取 */
  registerMove(id: string, fn: (tg: Enemy | null) => boolean) { this.moves.set(id, fn); }

  // ------------------------------------------------------------------ 试玩入口 / 测试
  /** 把他放到某处（试玩入口：near / fight / spar / trail / rumor） */
  place(x: number, y: number, mode: 'stay' | 'go', o: { fight?: boolean; tx?: number; ty?: number; until?: number } = {}) {
    const g = this.game, s = this.s, day = Math.floor(g.day);
    if (this.ent) this.despawn();
    s.x = x; s.y = y; s.mode = mode; s.tx = o.tx ?? x; s.ty = o.ty ?? y; s.until = o.until ?? day + 30; s.fight = !!o.fight; s.fought = false; s.day = day; s.pin = day;
  }
}

/**
 * 画一处痕迹：拳坑、犁沟用破坏系统（world/wreck.ts）的坑和沟——贴着地形、有明暗；断树 = 一个小坑 + 新鲜时一棵枯树；新鲜的拳坑、犁沟边上再摆一两块碎石。
 * 坑和沟直接挂进 wreck.marks（不走 wreck.pit()：那会按它自己的规矩并坑、定寿命），浓淡由 pinTrace 跟着痕迹的新旧钉住；
 * 碎石 / 枯树是 breakables 手摆的（被人撞碎了就不再摆）。
 */
export function paintTrace(g: Game, t: HsTrace, fade: number, prev: Painted | null): Painted {
  const c = g.combat;
  const P: Painted = prev ?? { k: 1, marks: [], rocks: [], placed: false };
  if (!P.marks.length) {
    const ux = Math.cos(t.a), uy = Math.sin(t.a), seed = (Math.round(t.x) * 7 + Math.round(t.y) * 13) | 0;
    // 寿命给得很长，浓淡不靠它自己的时钟走——每帧由 pinTrace 按痕迹的新旧把计时钉住
    const mk = (k: 'pit' | 'furrow', x: number, y: number, r: number, x2?: number, y2?: number): WreckMark => ({ k, m: ACTIVE_MAP, x, y, x2, y2, r, s: seed, d: g.day, c: 0, keep: false, p: 2, life: TRACE_LIFE });
    if (t.k === 'pit') P.marks.push(mk('pit', t.x, t.y, 105 * t.s));
    else if (t.k === 'furrow') P.marks.push(mk('furrow', t.x - ux * 170 * t.s, t.y - uy * 170 * t.s, 52 * t.s, t.x + ux * 170 * t.s, t.y + uy * 170 * t.s));
    else P.marks.push(mk('pit', t.x, t.y, 48 * t.s));
  }
  P.k = 0.35 + 0.65 * fade;
  pinTrace(g, P);
  // 新鲜的（前四成）才摆碎石 / 枯树；摆过一次就不再摆（撞碎了也不长回来）
  if (!P.placed && fade > 0.6) {
    P.placed = true;
    const brk = c.brawl.brk;
    try {
      if (t.k === 'tree') P.rocks.push(brk.place('tree', t.x + 30, t.y - 10, 0.25, (t.x + t.y) & 3));
      else if (t.k === 'pit') { const a = t.a + 1.2; P.rocks.push(brk.place('boulder', t.x + Math.cos(a) * 130 * t.s, t.y + Math.sin(a) * 90 * t.s, 0.15, 1)); P.rocks.push(brk.place('boulder', t.x - Math.cos(a) * 110 * t.s, t.y - Math.sin(a) * 80 * t.s, 0.05, 2)); }
      else { const nx = -Math.sin(t.a), ny = Math.cos(t.a); P.rocks.push(brk.place('boulder', t.x + nx * 90 * t.s, t.y + ny * 70 * t.s, 0.08, 3)); }
    } catch { /* 无头测试：可破坏物照样摆，失败也不要紧 */ }
  }
  return P;
}
/** 挂在破坏系统里的那几块痕迹：寿命（它自己的时钟，秒）给得很长 */
const TRACE_LIFE = 1000;
/**
 * 每帧把痕迹的计时钉住：破坏系统画一处痕迹的浓淡 = min(1, (寿命 − 已过) / (寿命 × 0.35))，把「已过」定在让它等于 P.k 的位置；
 * 被清掉了（读档、换图、短命痕迹超了上限被挤掉）就补回去
 */
export function pinTrace(g: Game, P: Painted) {
  const W = g.combat.wreck;
  for (const m of P.marks) { m.c = W.clock - TRACE_LIFE * (1 - 0.35 * P.k); if (!W.marks.includes(m)) W.marks.push(m); }
}
/** 收起一处痕迹的画面件（地贴撤掉；碎石 / 枯树随可破坏物的分块回收） */
export function unpaintTrace(g: Game, P: Painted) {
  const c = g.combat;
  if (P.marks.length) c.wreck.marks = c.wreck.marks.filter((m) => !P.marks.includes(m));
}
