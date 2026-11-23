// 贴身斗法（高速近战）：欺身 → 连击 → 轰飞 → 缩地追击 → 脱困；给以后的体修打底。
//
// 用户要的（2026-11-15）：冲刺欺身进近战、拼招角力、重击把人轰飞几十米、瞬移到落点前继续打、
// 挨打的人可耗灵力脱困；能把人砸进海里、撞碎礁石；能在虚空里一拳把人打进某一界。
// 操作两套都要：「近战架势」（切换后左键轻击、右键重击、Shift 欺身、空格追击 / 脱困）和技能栏招式；手机有按钮。
// 这一轮（E1）做核心：近战身体、四式、罡气、击飞物理、两人同框的镜头、单位级顿帧、一个会还手的体修原型。
// 下一轮（E2）留的口：拼招（两边同时欺身 / 重击撞上）、可破坏物（wallHit 里撞到的东西）、砸海（landWater）、
// 敌人正式会用（markBrawler 给任意 Enemy 挂上近战 AI；foeskills 的招式类型 'brawl' 接到这里）。
// E3 留的口：slam() 把人往下砸——虚空里往下砸、下方够得着某一界时，由 VoidFight 接成「坠落」结局。
//
// 接到哪里：
//   combat.ts：update 每帧调一次 update()；reset 清状态；updateEnemies 里每个单位先问 skipAI()（被击飞 / 顿帧 / 破防硬直 /
//              正在出近战招式的单位这一帧不走寻常 AI）；hitEnemy 的 src.brawl 表示「这一下的击退和顿帧由近战自己管」；
//              cast() 里 cast==='melee' 的功法交给 castArt()；canMove / actionOverride 问 holdsPlayer / action()。
//   game.ts：playerTick 在主角移动积分之后（主角被打飞、欺身扑出去的位移走这里）；
//            cameraTick 返回 true 表示这一帧镜头由近战接管（两人同框），game 就不再做寻常的跟随；
//            key() / mouse() 在键盘、鼠标处理的最前面（架势里接管左右键、Shift、空格）；playerLift / animK 给人物抬高、定格。
//
// 和模组的约定（别破）：每一下伤害（含撞击）都走 combat.hitEnemy / hitPlayer，才会触发 damage 钩子；
// 击飞的物理不碰被模组接管的单位（e.shell）和被定身的单位（e.busy、定身 / 冰冻 / 镇压、或者模组每帧把 kx / ky 清零——
// 被击飞时 kx / ky 照着外力速度写一份，下一帧发现被清零就当作被定住了，也可以直接调 clear(e)）；旧的击退公式和积分顺序不动。
// 新的随机数只在近战自己的分支里取（brawlrng.ts 的 brnd，不碰 Math.random），旧路径上一个都不多取。
//
// E2（第二轮）加的：
//   · 拼招角力（clash.ts）：两边同时欺身、重击撞上重击 → 0.2 倍慢放里三选一（攻克破、破克卸、卸克攻），平手连按拼点；
//   · 可破坏物（breakables.ts）：礁石、巨石、枯树、船骸，被击飞的人撞上就碎，结算二次撞击伤害，减速但继续飞；
//   · 砸海与犁水：往下砸进水里起冲天水柱、浪环，人沉入水中 1.5 息（打不到、不动）再破水而出；贴着水面平飞犁出白浪水沟；
//     主角被砸进水里沉 1 息再浮起，进绝域的泅水（jueyu.ts）。真正的水下战斗留给海渊：onSubmerge 回调；
//   · 敌人和 NPC 也会近战（brawlfoe.ts）：招式类型 'brawl'、体修流派、走兽连咬带甩、变招、NPC 互斗、流派克制（撞阵被拦）；
//   · 手感：重击和收式有前摇（蓄力闪光）、打空有硬直、连段计数、收尾大字；手机上不推摇杆时重击朝锁定目标；
//   · P6 跃击：空中对低处的目标按重击是「俯冲砸击」，落差越大伤害和气浪越大。
//
// 兵器接进近战（r7-forge）：这里拆成「框架 + 兵器谱」。
//   · 框架（不分兵器）：架势、罡气、击飞物理与撞碎、缩地追击、脱困、拼招、定向、砸海、镜头、俯冲砸击——都在这个文件里，逻辑没动；
//   · 兵器谱：data/weapons.ts 的 WEAPONS[kind].feel（WeaponFeel：够多远、连段几下与每下的伤血 / 削罡 / 顿帧 / 出手时刻、重击、
//     轰飞系数、霸体、横扫弧度与人数、直刺穿人、上挑分量、突进、剑气、震波）。手里的兵器每帧、每次出手前按 heldWeapon 刷新（this.wk），
//     框架用到这些数的地方一律读 this.F（拳脚那一页的数和原来写死的一样，test-brawl 卡着逐位相同）；
//   · 拳脚照原来的路子出手（near：近身一个圈）；兵器（剑 / 重兵 / 长枪）播 WEAPON_MOVES 里的动作，到动作的出手时刻（兵器谱的 at，落在 ACTION_HIT 里）
//     才按刃轨迹（world/blade.ts，和刀光同一份）判谁被砍中——只在出手那一刻算一次；
//   · 敌人和 NPC：brawlfoe.ts 按它外观上的兵器出招（foeKind）；寻常近战（combat.ts 的 0.4 息前摇）也播兵器动作（meleeAct，只管画面）；
//   · 特殊招式的挂载点：brawlmoves.ts（注册表、接口）+ brawlmoverun.ts（运行）。撼山客的招式从那里挂进来。
import { Enemy } from './combat';
import type { Combat } from './combat';
import type { Hero } from './cultivation';
import { mod as statMod, STAT_POISE, STAT_MELEE } from './cultivation';
import { ARTS, BRAWL_ARTS } from '../data/arts';
import { itemDef } from '../data/items';
import { ENEMIES, type EnemyDef } from '../data/enemies';
import { REALMS } from '../data/realms';
import { isBoss } from './foeskills';
import { audio } from './audio';
import type { Action } from '../gfx/character';
import { IS_TOUCH } from '../core/touch';
import { ascendLabel, bindOf, keyLabel, keyNote } from '../core/keymap';
import { ALT } from './alt';
import { ClashSys, type Pick } from './clash';
import { BreakSys, BK, type Rock } from './breakables';
import { FoeBrawl, newAI, type BrawlAI } from './brawlfoe';
import { brnd, reseedBrawl } from './brawlrng';
import { VOIDFALL } from './voidfall';
import { WEAPONS, HELD_NOW, weaponTierMul, weaponTier, type WeaponFeel, type WeaponKind, type HeavyFeel } from '../data/weapons';
import { heldWeapon } from './cultivation';
import { WEAPON_MOVES, ACTION_DUR, ACTION_HIT, isWeaponAction, type WeaponAction } from '../gfx/character';
import { bladeLocal, bladeWorld, bladeHits, formOfLook, PSCALE, type Seg } from './blade';
import { moveOfArt, type SpecialMove } from './brawlmoves';
import { startMove as runMove, tickMoves, type MoveRun } from './brawlmoverun';
import { armsTick, foeKind } from './brawlarms';
import { ImpactFx } from './impactfx';
import { hsCamSetting } from './hscam';

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** 撼山客收招后镜头再框他们多久（息），之后缓回寻常跟随 */
const STAGE_HOLD = 1.1;
/** r8-p2：撼山客出招时推近到他约占画面高度的这么多（参考视频人约占三分之一）；最近推到多少 */
const STAGE_FILL = 0.38, STAGE_ZMAX = 3.0, STAGE_HMAX = 1100;
/** r9：他（撼山客）的人物立板在世界里有多高（离地多少到头顶；量过：离地 170 的竖线投到画面上，人物立板只有它的八成） */
const FIG_H = 138;

/** 拳脚的兵器谱（出招手感的数都在 data/weapons.ts 的 WEAPONS[kind].feel 里；框架按手里的兵器读那一页） */
const FIST: WeaponFeel = WEAPONS.fist.feel;
/** 框架可调的数（单位：世界单位、秒、法力占上限的比例）。各兵器不同的那些（够多远、连段、伤害、前摇……）在兵器谱里 */
export const BX = {
  /** 化虹欺身耗灵力（拳脚那一页的值；留着给老代码和测试读） */
  rushMp: FIST.rush.mp,
  /** 单位级顿帧：重击（缩地截住、俯冲砸击这些框架自己的出手用） */
  freezeHeavy: FIST.heavy.freeze,
  /** 轰飞距离：寻常、上下限；首领只飞这么一小段（比例） */
  launchBase: 2200, launchMin: 1500, launchMax: 3000, bossLaunchK: 0.24,
  /** 击飞的物理：空中阻尼（低）、贴地犁行阻尼、重力（高速时很小，飞得平）、高速的门槛、落地弹起的门槛 */
  airDrag: 0.95, plowDrag: 5.5, grav: 2300, gravFast: 420, fastV: 1100, bounceVz: 380,
  /** 缩地追击：每一次耗多少灵力、一次倒飞最多几次 */
  pursuitMp: [0.05, 0.08, 0.12], pursuitMax: 3,
  /** 脱困：耗四分之一灵力（被连得越久越便宜）、冷却、震开多远 */
  techMp: 0.25, techCd: 5, techPush: 520,
  /** 罡气：多久没挨打开始回、每秒回多少（占上限）；破罡后的窗口（首领短） */
  poiseIdle: 1.6, poiseRegen: 0.5, breakT: 1.7, bossBreakT: 1.0,
  /** 被击飞者的残影上限、尾迹点数 */
  ghostMax: 6, trailMax: 64,
  /** E2：打空的硬直（轻、重）。重击 / 收式的前摇在兵器谱里（heavy.at、收式那一下的 at） */
  whiffLight: 0.22, whiffHeavy: 0.4,
  /** 砸进水里：敌人沉多久、主角沉多久；离水面多低算「贴着水面」（犁水）；犁水的浪多久一记 */
  subEnemy: 1.5, subPlayer: 1.0, plowZ: 90, wakeGap: 0.045,
  /** 连段计数：两下之间隔多久还算一套 */
  comboGap: 1.4,
  /** P6 跃击：比目标高多少才算俯冲、俯冲的水平速度、最远多远 */
  diveMin: 60, diveSpeed: 2300, diveMax: 640,
  /**
   * r7 重击定向：按住右键多久算「按住」（之前松开＝轻点，立刻出手）、按住后世界放慢到几倍、最多撑多久自动出手（都按真实时间）；
   * 放慢 / 恢复的快慢（每秒走多少，免得一下子顿住画面发闪）
   */
  aimHold: 0.16, aimSlowK: 0.3, aimMax: 1.0, aimIn: 9, aimOut: 6,
  /** r7 上挑：往上打多高（首领按 bossLaunchK 缩）、最高不过飞行上限再往下让出多少（你瞬移到他头顶还在上限以内）、到顶滞空多久、水平带出去的速度 */
  upRise: 380, upRoom: 70, upHang: 0.6, upV: 330,
  /** r7 平时脚下的淡箭头：锁定的对手离你多远以内才画 */
  hintR: 700,
} as const;

/** 每个单位多出来的「近战身体」（WeakMap 挂在主角和 Enemy 上，不动构造函数） */
export interface Body {
  /** 外力速度、竖直速度、击飞时的离地高度 */
  vx: number; vy: number; vz: number; z: number;
  /** 被击飞中 / 击飞前就在空中（只阻尼、不受重力，除非被往下砸）/ 已经贴地犁行 */
  air: boolean; flier: boolean; grounded: boolean;
  flightT: number; travel: number;
  /** 这次倒飞被缩地追击了几次；撞过的人（一次倒飞每人只撞一次） */
  chain: number; bumped: Set<Enemy> | null;
  /** 罡气、上限、破罡窗口剩余、多久没挨打 */
  poise: number; poiseMax: number; breakT: number; idle: number;
  /** 单位级顿帧、霸体、破防硬直 */
  freezeT: number; armorT: number; staggerT: number;
  /** 被连了多少下（脱困越连越便宜；会近战的 NPC 按这个决定什么时候脱困）；脱困冷却 */
  combo: number; techCd: number;
  /** 最后打它的人（撞击伤害算谁的）、那人的境界与攻力 */
  by: Enemy | 'p' | null; byRealm: number; byAtk: number;
  /** 尾迹（画面用）、残影计时、上一处站得住的地方 */
  trail: [number, number, number][]; ghostT: number; safeX: number; safeY: number;
  /** 被击飞时照外力速度写进 kx / ky 的那一份（下一帧被清零 = 被模组定住了） */
  mx: number; my: number;
  /** 会近战的单位的出手（brawlfoe.ts）；罡气上限按「会近战」重算过没有 */
  ai?: BrawlAI; aiMarked?: boolean;
  /** E2：这次飞行是被往下砸出来的（落水起大水柱）；沉在水里还剩几息、沉下去的地方；犁水的浪计时 */
  slam: boolean; subT: number; subX: number; subY: number; wakeT: number;
  /** 被往下砸的那一刻离地多高（从高空砸下来的，落地的坑 / 水柱跟着加大：界内御剑高度砸人和虚空坠界是同一套演出） */
  dropH: number;
  /** E3：这次是从天上砸下来的流星（1 = 被打下来的，落地吃撞击、嵌地 / 沉海；2 = 追下来的，落地只起坑不伤自己） */
  meteor: 0 | 1 | 2;
  /** r7：这次是被上挑打上天的（到顶滞空 hangT 息再落下；追击是瞬移到他头顶、默认往下砸） */
  up: boolean; hangT: number;
  /** r7 金刚不坏：站着硬吃，这期间打不飞、挑不起（特殊招式自己开关） */
  iron?: boolean;
  /** 兵器线：正在出的特殊招式（brawlmoves 挂进来的；期间不走寻常 AI） */
  move?: MoveRun;
}
/** 剑气：斩出去往前飞的一道弧光（by = null 是主角斩的） */
export interface Wave { x: number; y: number; z: number; ux: number; uy: number; left: number; sp: number; w: number; dmg: number; hit: Set<Enemy>; by: Enemy | null; realm: number; atk: number; t: number; color: string; pHit?: boolean }
/** 突进扑到跟前那一下播的动作（剑平斩、重兵横扫、枪直刺） */
const RUSH_END: Record<Exclude<WeaponKind, 'fist'>, WeaponAction> = { sword: 'swordL3', heavy: 'heavyL2', spear: 'spearL1', scythe: 'scytheL2' };
/** 收尾大字的招名 */
const FIN_NAME: Record<WeaponKind, { light: string; heavy: string; up: string; sweep: string }> = {
  fist: { light: '上挑', heavy: '崩山', up: '挑天', sweep: '崩山' },
  sword: { light: '回身斩', heavy: '断岳', up: '撩天', sweep: '断岳' },
  heavy: { light: '劈山', heavy: '撼地', up: '撩天', sweep: '撼地' },
  spear: { light: '回马枪', heavy: '挑枪', up: '挑天', sweep: '横扫千军' },
  scythe: { light: '回身劈', heavy: '回旋', up: '勾天', sweep: '回旋' },
};
/** 挥兵器、砍中的声音 */
const SWING_SFX = { sword: 'wswing_sword', heavy: 'wswing_heavy', spear: 'wswing_spear', scythe: 'wswing_heavy' } as const;   // r16 魂镰：借重兵的风声、刀的砍中声
const HIT_SFX = { sword: 'whit_sword', heavy: 'whit_heavy', spear: 'whit_spear', scythe: 'whit_sword' } as const;
/** 重击的竖直方向：1 = 上挑、0 = 平着轰飞、-1 = 往下砸 */
export type Vert = -1 | 0 | 1;
/** r7：重击定向的预演（画面上的箭头、落点圈、沿途要撞上的东西；brawlgl 读它） */
export interface AimView {
  e: Enemy; v: Vert;
  /** 这一下真能把人打飞（罡气已破、或这一下就打破）；false 时箭头画成灰的、不画落点 */
  ok: boolean;
  /** 按住右键的完整预演（true）还是平时脚下那根淡箭头（false） */
  full: boolean;
  ux: number; uy: number;
  /** 飞行路径（x、y、离地高度），从对手身上起 */
  pts: [number, number, number][];
  /** 停在哪（落点圈）；water = 落进水里 */
  land: { x: number; y: number; water: boolean } | null;
  /** 沿途会撞上的：礁石 / 树 / 巨石 / 船骸（rock）、别的人（unit）、墙（wall） */
  hits: { x: number; y: number; r: number; k: 'rock' | 'unit' | 'wall' }[];
  /** 按住定向还剩多少（1 → 0，到 0 自动出手）；淡箭头恒为 1 */
  left: number;
}
/** 主角正在做的位移：欺身（远扑）、出拳前垫的一步、俯冲砸击（P6 跃击） */
/** chase：一键追击的俯冲（追砸下去的人：它在半空、嵌在坑里、沉在海里都追得上；按住上升作罢） */
interface Move { kind: 'rush' | 'lunge' | 'dive'; e: Enemy; speed: number; max: number; went: number; then: (e: Enemy) => void; sx: number; sy: number; z0?: number; chase?: boolean }
/** 被击飞者的残影（世界层画，限 6 个） */
/** 残影。r7-fx3d：sx / sy 给了就是高速冲刺的模糊残影——沿这个方向（世界单位）多画两层、越往后越淡，看着是被拉糊了的 */
export interface Ghost { e: Enemy | null; x: number; y: number; z: number; t: number; dur: number; yaw: number; color: string; sx?: number; sy?: number }

function newBody(): Body {
  return { vx: 0, vy: 0, vz: 0, z: 0, air: false, flier: false, grounded: false, flightT: 0, travel: 0, chain: 0, bumped: null,
    poise: -1, poiseMax: 0, breakT: 0, idle: 99, freezeT: 0, armorT: 0, staggerT: 0, combo: 0, techCd: 0,
    by: null, byRealm: 0, byAtk: 0, trail: [], ghostT: 0, safeX: NaN, safeY: NaN, mx: 0, my: 0, slam: false, subT: 0, subX: 0, subY: 0, wakeT: 0, meteor: 0, dropH: 0, up: false, hangT: 0 };
}

/**
 * 竖直方向一步（重力、落地、弹起）加水平阻尼。击飞的积分和「轰飞多远」的预演共用这一份，算出来的距离才对得上。
 * 返回 0 = 照常；1 = 这一步落地弹起；2 = 这一步落地贴住（开始犁行）。
 */
function vertical(b: Body, dt: number): 0 | 1 | 2 {
  let r: 0 | 1 | 2 = 0;
  const hang = !b.grounded && b.hangT > 0 && b.vz <= 90;
  if (!b.grounded) {
    const sp = Math.hypot(b.vx, b.vy);
    if (hang) { b.hangT -= dt; b.vz = Math.max(-45, b.vz * Math.exp(-7 * dt) - 30 * dt); }   // r7 上挑：到顶滞空一会儿（只是慢慢往下沉）
    else if (b.flier && b.vz > -600) b.vz *= Math.exp(-3 * dt);   // 原本就在空中的：御器稳住身形，不往下掉
    else b.vz -= (sp > BX.fastV ? BX.gravFast : BX.grav) * dt;
    b.z += b.vz * dt;
    if (b.z <= 0) {
      b.z = 0;
      if (b.vz < -BX.bounceVz) { b.vz = -b.vz * 0.32; b.vx *= 0.72; b.vy *= 0.72; r = 1; }
      else { b.vz = 0; b.grounded = true; r = 2; }
    }
  }
  const k = Math.exp(-(b.grounded ? BX.plowDrag : hang ? 2.4 : BX.airDrag) * dt); b.vx *= k; b.vy *= k;
  return r;
}
/** 停下来了没有 */
const settled = (b: Body) => (b.grounded || b.flier) && Math.hypot(b.vx, b.vy) < 110 && Math.abs(b.vz) < 120;
/** 预演：初速 v、竖直初速 vz 能在平地上走多远 */
function flightDist(v: number, vz: number, z: number, flier: boolean): number {
  const b = newBody(); b.vx = v; b.vz = vz; b.z = z; b.flier = flier;
  let d = 0;
  for (let i = 0; i < 600 && !settled(b); i++) { vertical(b, 1 / 60); d += b.vx / 60; }
  return d;
}
/** 要飞 D 远，初速该给多少（三次定点迭代，几百次乘法） */
function speedFor(D: number, vz: number, z: number, flier: boolean): number {
  let v = D * BX.airDrag;
  for (let i = 0; i < 4; i++) { const d = flightDist(v, vz, z, flier); if (d > 1) v *= D / d; }
  return v;
}

/**
 * 高速位移时衣摆、飘带不追物理：人物画法里衣摆是弹簧（一帧挪几十的时候会落后一两百，画成一条长长的绿带），
 * 这里每帧把弹簧和飘带标成「没初始化」，下一次画的时候直接贴到该在的位置。
 */
function snapCloth(st: { springs: Map<string, { inited: boolean }>; strands: Map<string, { inited: boolean }> }) {
  for (const s of st.springs.values()) s.inited = false;
  for (const s of st.strands.values()) s.inited = false;
}

/** 缩地截住的那一点：在他飞行方向的前方（越快越远，最多两百多） */
function pursuitLead(b: Body) { const sp = Math.hypot(b.vx, b.vy) || 1, L = Math.min(260, sp * 0.06 + 110); return { x: b.vx / sp * L, y: b.vy / sp * L }; }

/** 装备（和天赋）给的近战加成，都是比例：poise = 罡气上限加几成，melee = 近战伤害加几成（护腕、崩山套；数值约定见 data/gear.ts） */
export function gearBrawl(h: Hero): { poise: number; melee: number } { return { poise: statMod(h, STAT_POISE), melee: statMod(h, STAT_MELEE) }; }

/** 体修功法：身上会几门（金刚、象甲、明王、化龙、法相……），每门加罡气上限三成、近战伤害一成二 */
function bodyArts(h: Hero) { let n = 0; for (const a of h.arts) { const s = ARTS[a.id]; if (s && s.school === '体' && s.cast !== 'melee') n++; } return Math.min(5, n); }

/** 体修原型：会还手（欺身、连击、轰飞）的散修。下一轮铺给门派时换成各派自己的人 */
function brawlerDef(): EnemyDef {
  const base = ENEMIES.yelang ?? Object.values(ENEMIES).find((d) => d.kind === 'human')!;
  return { ...base, id: 'bx_tixiu', name: '铁拳散修', title: '体修', robe: '#6a3a22', hp: 1.6, atk: 1.25, def: 1.1, speed: 175, melee: { range: 80, power: 1.1, cd: 1.3 }, ranged: undefined, drops: [{ id: 'mat_lingshi', ch: 1, n: [8, 30] }] };
}
/** 木人：不还手、不挪步，试招用 */
function dummyDef(): EnemyDef {
  const base = ENEMIES.yelang ?? Object.values(ENEMIES).find((d) => d.kind === 'human')!;
  return { ...base, id: 'bx_muren', name: '木人桩', title: '试招', robe: '#7a5a3a', hp: 6, atk: 0.1, def: 0.6, speed: 0, melee: undefined, ranged: undefined, drops: [] };
}

export class BrawlSys {
  /** 是否在近战架势里 */
  stance = false;
  private readonly B = new WeakMap<object, Body>();
  /** 身上有事（被击飞、顿帧、硬直、罡气没满、会近战）的单位：每帧只扫这些 */
  private live = new Set<Enemy>();
  /** 主角的近战身体 */
  pb: Body = newBody();
  /** 交手的对象和「还在交手」的计时（镜头两人同框、界面显示对方罡气都看它） */
  foe: Enemy | null = null; engageT = 0;
  /** 最近一个被你轰飞的（缩地追击找它） */
  flung: Enemy | null = null;
  /** 最近一个被你从高处砸下去的（一键追击俯冲找它）和砸下去的时刻 */
  slamFoe: Enemy | null = null; private slamAt = -99;
  /** 主角：正在做的位移、出手后定身、连段第几下、连段窗口、两拳间隔、动作覆盖与剩余时间、缓冲的一下 */
  private mv: Move | null = null;
  private recT = 0; comboI = 0; private comboT = 0; private gapT = 0;
  private act: Action | null = null; private actT = 0;
  private queued: { k: 'light' | 'heavy'; slam: boolean; up?: boolean; t: number } | null = null;
  /**
   * r7 重击定向（按住右键 / 手机长按「崩」）：t = 按了多久（真实时间）；src = 鼠标还是触屏；
   * jx / jy = 触屏小摇杆拖出来的方向（屏幕上，-1–1）；vt = 触屏点的「升」「降」（1 / -1，0 = 没点）
   */
  aim: { t: number; src: 'mouse' | 'touch'; jx: number; jy: number; vt: Vert } | null = null;
  /** 定向放慢的倍率（缓进缓出，按真实时间走） */
  private aimK = 1;
  /** 触屏定向出手时拖出来的方向（世界里的单位向量）：这一记重击按它轰；用掉就清 */
  private shotDir: { x: number; y: number; t: number } | null = null;
  /** r7：瞬移到上挑起来的人头顶时，人在半空（没御剑）：离地多高、竖直速度、还悬停多久 */
  private aloft: { z: number; vz: number; hold: number } | null = null;
  /** 预演缓存（每帧最多算一次；按住时每 3 帧算一次路径） */
  private aimCache: { f: number; v: AimView | null } = { f: -1, v: null };
  /** 主角被击飞时画面上的离地高度（地面上被打飞时那一段弧线）；自己的尾迹 */
  playerLift = 0;
  pTrail: [number, number, number][] = [];
  ghosts: Ghost[] = [];
  /** 速度线（后期的径向拉丝）：强度、方向 */
  warpK = 0; warpDx = 1; warpDy = 0;
  /** 镜头弹簧 */
  private cam = { on: false, x: 0, y: 0, vx: 0, vy: 0, z: 1, vz: 0 };
  /**
   * 重击命中的「镜头猛推再回弹」：一个欠阻尼的小弹簧，x 是镜头远近要乘的 (1 + x)。
   * 每帧先除掉上一帧乘上去的那一份、再乘这一帧的（game 的寻常缩放平滑不会被它带偏）；kickF 给虚空的取景用。
   */
  private kick = { x: 0, v: 0 }; kickF = 1;
  /** 测试用：每一下近战伤害记一笔（kind、目标、伤害） */
  log: { k: string; who: string; dmg: number }[] | null = null;
  /** 领悟提示只说一次 */
  private taught = false;
  /** E2：拼招、可破坏物、敌人的近战 */
  readonly clash: ClashSys;
  readonly brk: BreakSys;
  readonly foes: FoeBrawl;
  /** 重击 / 收式的前摇：到点才真正出手（期间和对方的重击前摇撞上就拼招） */
  private wind: { t: number; heavy: boolean; run: () => void } | null = null;
  /** 主角沉在水里还剩几息；最近一次脱困的时刻（会近战的 NPC 追一手） */
  pSubT = 0; techAt = -99;
  /** 连段计数：这一套第几下、最后一下的时刻；收尾大字 */
  comboN = 0; private comboAt = -99; finisher: { s: string; t: number } | null = null;
  /** 世界放慢（拼招）：game 主循环这一帧实际乘上的倍率（近战自己的计时按真实时间走） */
  private appliedK = 1;
  /**
   * 海渊（下一轮）的入口：有人被砸进水里沉下去时调一次（who = 敌人，或 null 表示主角）。
   * 现在只是沉 1–1.5 息再浮上来；挂上回调后可以把这场打斗带进水下。
   */
  onSubmerge: ((who: Enemy | null, x: number, y: number) => void) | null = null;

  constructor(readonly combat: Combat) {
    reseedBrawl(0x5eedb2a1);   // 每局从同一个种子起：同一份开局（测试里新建的 Game）近战的出手一模一样
    this.clash = new ClashSys(this); this.brk = new BreakSys(this); this.foes = new FoeBrawl(this);
    this.impact = new ImpactFx(this);
  }
  /** r7 通用打击表现（黑白闪、背后炸开、拳压、超高速追击、定格特写、踏空气环）：world/impactfx.ts */
  readonly impact: ImpactFx;
  get g() { return this.combat.game; }
  /** 手里的兵器：种类、品阶、从哪来（兵器槽 / 本命飞剑 / 空手）。每帧、每次出手前刷新（背包里换了兵器，下一次出手就是新的） */
  wk: WeaponKind = 'fist'; wt = 0; wFrom: 'slot' | 'bond' | 'none' = 'none';
  /** 手里这把兵器的那一页兵器谱 */
  get F(): WeaponFeel { return WEAPONS[this.wk].feel; }
  /** 兵器品阶给的近战伤害倍率（空手 1） */
  get tierMul(): number { return weaponTierMul(this.wk, this.wt); }
  /** 主角这一下近战的攻力：攻力 × 近战加成（体修功法、护腕）× 兵器品阶 */
  get patk(): number { return this.combat.pStats.atk * this.meleeMul * this.tierMul; }
  /** 剑气（往前飞的弧光）；兵器拿在手里还剩多久（出手后不在架势里，过一会儿收回背上） */
  waves: Wave[] = []; armHold = 0;
  /** 正在进行的特殊招式（主角那一招单独记一份，holdsPlayer / action 读它） */
  runs: MoveRun[] = []; pMove: MoveRun | null = null;
  /** 刷新手里的兵器（兵器槽 > 剑类本命法宝 > 空手） */
  syncWeapon() {
    const w = heldWeapon(this.g.hero);
    this.wk = w.kind; this.wt = w.tier; this.wFrom = w.from; HELD_NOW.kind = w.kind; HELD_NOW.tier = w.tier;
  }
  /** 这种兵器的招式表（拳：出拳 / 重击 / 欺身） */
  get wMoves() { return WEAPON_MOVES[this.wk]; }
  /** 重击 / 追击 / 俯冲时播的动作 */
  private get heavyAct(): Action { return this.wk === 'fist' ? 'smash' : this.wMoves.heavy[0]; }

  /** 换图、读档、新开局 */
  reset() {
    this.stance = false; this.live.clear(); this.pb = newBody(); this.foe = null; this.engageT = 0; this.flung = null;
    this.mv = null; this.recT = 0; this.comboI = 0; this.comboT = 0; this.gapT = 0; this.act = null; this.actT = 0; this.queued = null;
    this.playerLift = 0; this.pTrail = []; this.ghosts = []; this.warpK = 0; this.cam.on = false;
    this.wind = null; this.pSubT = 0; this.techAt = -99; this.comboN = 0; this.comboAt = -99; this.finisher = null; this.appliedK = 1;
    this.kick.x = this.kick.v = 0; this.slamFoe = null; this.slamAt = -99;
    this.aim = null; this.aimK = 1; this.shotDir = null; this.aloft = null; this.aimCache.f = -1; this.aimCache.v = null;
    this.waves.length = 0; this.armHold = 0; this.runs.length = 0; this.pMove = null;
    this.clash.reset(); this.brk.reset(); this.impact?.reset();
    this.syncDocClass();
  }
  /** 把单位放进每帧要扫的那一批 */
  track(e: Enemy) { this.live.add(e); }
  /** 这一点是不是落不了脚的水（无边海、湖；鲸背浮岛这类能落脚的不算） */
  deepWater(x: number, y: number): boolean {
    const g = this.g;
    if (g.mijing.active || g.xukong.fight.on || g.xukong.active) return false;
    const w = g.jueyu?.onWater(x, y);
    return w ? w.water && !w.stand : !g.terrain.isLand(x, y);
  }
  /** 主角此刻是不是正欺身扑向 e（e = null：扑向谁都算） */
  rushingAt(e: Enemy | null) { return this.mv?.kind === 'rush' && (!e || this.mv.e === e); }
  /** 主角正在重击前摇里（和对方的重击撞上就拼招） */
  get heavyWinding() { return !!this.wind?.heavy; }
  /** 敌人打中你以后，你定住多久（出手被打断）。heavy = 重击 / 抓投；霸体（重兵出手到命中之间）挡得住轻击，挡不住重击 */
  holdPlayer(t: number, heavy = false) { if (this.pb.armorT > 0 && !heavy) return; this.recT = Math.max(this.recT, t); this.mv = null; this.wind = null; }
  /** 拼招开始：两人手上的事都作废 */
  haltForClash(e: Enemy) {
    this.mv = null; this.wind = null; this.queued = null; this.pTrail.length = 0;
    const b = this.body(e); b.air = false; b.vx = b.vy = b.vz = 0; b.trail.length = 0; if (b.ai) { b.ai.st = 'idle'; b.ai.wind = 0; }
    if (e.cast) this.combat.foe.interrupt(e);
    e.windup = 0; e.kx = e.ky = 0;
    this.live.add(e); this.engage(e);
  }
  /** 拼招中：对方钉在原地（不出招、不挪步） */
  clashHold(e: Enemy) { const b = this.body(e); b.freezeT = Math.max(b.freezeT, 0.02); e.kx = e.ky = 0; this.engage(e); }
  /** 世界此刻放慢到几倍（game 主循环：拼招期间整个世界放慢，结果出来后缓缓恢复） */
  worldK(): number { const k = Math.min(this.clash.timeK(), this.aimK, this.impact?.timeK() ?? 1); this.appliedK = k; return k; }   // r7：按住右键定向时也放慢（和拼招同一套：主循环缩 dt，近战自己的计时按真实时间走）
  /** 阵地拦下的特效（brawlfoe 也用） */
  blockFx(x: number, y: number, z: number, color: string) {
    this.combat.fxq.push({ k: 'bxblock', anchor: { x, y, offsetY: -z }, x, y: y - 60, color, power: 2 });
    this.combat.texts.push({ anchor: { x, y, offsetY: -z }, x, y: y - 150, s: '被阵势拦下！', color: '#bfe0ff', t: 0, vy: -26, big: true } as never);
    audio.sfx('clang', x, y);
  }

  // ------------------------------------------------------------ 身体与罡气
  body(e: Enemy): Body {
    let b = this.B.get(e);
    if (!b) { b = newBody(); this.B.set(e, b); }
    if (b.poise < 0) { b.poiseMax = this.poiseMaxOf(e); b.poise = b.poiseMax; }
    return b;
  }
  peek(e: Enemy): Body | undefined { return this.B.get(e); }
  /** 罡气上限：敌人按境界、体格、会不会近战；首领厚四倍 */
  poiseMaxOf(e: Enemy): number {
    let m = 50 + 15 * e.realm;
    if (e.def.kind === 'human') m *= e.def.melee ? 1.3 : 1;
    else m *= 0.6 + 0.4 * Math.min(3, e.def.hp);
    if (this.B.get(e)?.ai) m *= 1.5;
    if (isBoss(e)) m *= 4;
    return Math.round(m);
  }
  /** 主角的罡气上限：境界、体修功法、装备 */
  get playerPoiseMax(): number {
    const h = this.g.hero;
    return Math.round((80 + 30 * h.realm) * (1 + 0.3 * bodyArts(h)) * (1 + gearBrawl(h).poise));
  }
  /** 主角的近战伤害倍率 */
  get meleeMul(): number { const h = this.g.hero; return 1 + 0.12 * bodyArts(h) + gearBrawl(h).melee; }
  /** 被打飞的 / 被定格的 / 硬直中 */
  isAir(e: Enemy) { return !!this.B.get(e)?.air; }
  frozen(e: Enemy) { return (this.B.get(e)?.freezeT ?? 0) > 0; }

  /** 模组入口：把这个单位从近战物理里放下来（定身、接管时调） */
  clear(e: Enemy) {
    const b = this.B.get(e); if (!b) return;
    if (b.air) { e.lift = 0; if (b.flier) e.flyH = Math.max(e.flyH, b.z); }
    b.air = false; b.vx = b.vy = b.vz = 0; b.z = 0; b.grounded = false; b.freezeT = 0; b.staggerT = 0; b.trail.length = 0; b.up = false; b.hangT = 0;
    if (b.ai) b.ai.st = 'idle';
    if (this.flung === e) this.flung = null;
  }
  /** 能不能被击飞：模组接管的（shell）、定身 / 冰冻 / 镇压、正与同类相争的、死的都不行 */
  launchable(e: Enemy): boolean {
    return !e.dead && !(e as { shell?: boolean }).shell && !e.busy && !e.st.root && !e.st.freeze && e.sup < 2 && !(e.hideT > 0) && !e.gone && !this.B.get(e)?.iron;
  }

  poiseDmg(b: Body, amt: number, e: Enemy | null) {
    b.idle = 0; b.combo++;
    if (b.breakT > 0) return;
    b.poise -= amt;
    if (b.poise <= 0) {
      b.poise = 0; b.breakT = e && isBoss(e) ? BX.bossBreakT : BX.breakT;
      const g = this.g, x = e ? e.x : g.player.x, y = e ? e.y : g.player.y, z = e ? e.z : g.player.z + this.playerLift;
      this.combat.texts.push({ anchor: { x, y, offsetY: -z }, x, y: y - 150, s: '破罡！', color: '#ffcf6a', t: 0, vy: -36, big: true } as never);
      this.combat.fxq.push({ k: 'bxguard', anchor: { x, y, offsetY: -z }, x, y: y - 60, color: '255,200,110', big: true, power: e && isBoss(e) ? 3 : 2 });
      g.juice(0, 0.3); audio.sfx('break', x, y);   // 只震屏不顿帧：全局顿帧只留给收尾一击
    }
  }

  // ------------------------------------------------------------ 每帧（战斗主循环里，清尸之前）
  update(dt: number) {
    const c = this.combat, g = this.g;
    // 兵器：手里拿的是什么、拿在手里还是收着（主角和身边的人形对手）；剑气；特殊招式
    this.syncWeapon();
    armsTick(this, dt);
    if (this.waves.length) this.wavesTick(dt);
    if (this.runs.length) tickMoves(this, dt);
    this.impact?.tick(dt / Math.max(0.05, this.appliedK));   // r7 打击表现：黑白闪按帧数、定格特写按真实时间
    // 拼招：按真实时间走（世界被放慢了，这里把倍率除回去）
    this.clash.tick(dt / Math.max(0.05, this.appliedK));
    // r7 重击定向：按了多久、放慢的缓进缓出、到点自动出手（真实时间）
    if (this.aim || this.aimK < 1) this.aimTick(dt / Math.max(0.05, this.appliedK));
    // 拼招期间：周围的飘字（别人的伤害、状态、喊话）先压住，只留两个人身边的——让两个人和三选一看得清
    { const S = this.clash.st; if (S && S.phase !== 'result') this.quiet(S.x, S.y); }
    // 主角的罡气
    const pb = this.pb, pmax = this.playerPoiseMax;
    if (pb.poise < 0 || pb.poiseMax !== pmax) { pb.poise = pb.poise < 0 ? pmax : Math.min(pmax, pb.poise); pb.poiseMax = pmax; }
    this.tickPoise(pb, dt);
    pb.techCd = Math.max(0, pb.techCd - dt);
    // 单位
    for (const e of this.live) {
      const b = this.B.get(e);
      if (!b || e.dead || e.gone || !(c.enemies.includes(e) || c.allies.includes(e))) {
        if (b?.air && e.dead) this.handOffCorpse(e, b);
        if (b && b.subT > 0) { b.subT = 0; if (e.hideT > 0 && !this.earthHiding(e)) e.hideT = 0; }
        this.live.delete(e); if (this.flung === e) this.flung = null; continue;
      }
      if (b.subT > 0) { this.underwater(e, b, dt); continue; }   // 沉在水里：打不到、不动，到点破水而出
      if (b.move) continue;   // 特殊招式接管着它（tickMoves 推进）
      if (b.freezeT > 0) { b.freezeT -= dt; continue; }   // 顿帧：这一帧不动、不出招
      b.staggerT = Math.max(0, b.staggerT - dt); b.armorT = Math.max(0, b.armorT - dt); b.techCd = Math.max(0, b.techCd - dt);
      this.tickPoise(b, dt);
      if (b.air) {
        // 被模组清零了 kx / ky（或者被谁挪走了）：当它被定住，放下来
        if ((e.kx === 0 && e.ky === 0 && (b.mx !== 0 || b.my !== 0)) || !this.launchable(e)) { this.clear(e); continue; }
        this.fly(e, b, dt);
        if (b.air) this.npcTech(e, b);
      } else if (b.ai) this.foes.tick(e, b, dt);
      // 刚砸进水里沉下去的（这一帧在 fly 里落水）不能放走：沉水的计时、浮上来都靠这里（原先会漏掉，不会近战的单位就一直藏在水下）
      if (!b.air && !b.ai && !b.move && b.subT <= 0 && b.staggerT <= 0 && b.freezeT <= 0 && b.breakT <= 0 && b.poise >= b.poiseMax) this.live.delete(e);
    }
    // 可破坏物：摆放、回收；贴地的人被石头挡住（从石头里推出来）
    this.brk.update(dt);
    if (this.brk.n) { this.rockPush(); this.aoeRocks(); }
    // 法修 / 剑修被体修盯上：后撤布阵
    this.foes.kite(dt);
    // 收尾大字
    if (this.finisher) { this.finisher.t += dt; if (this.finisher.t > 1.6) this.finisher = null; }
    // 残影
    for (const gh of this.ghosts) gh.t += dt;
    if (this.ghosts.length) this.ghosts = this.ghosts.filter((gh) => gh.t < gh.dur);
    // 交手的对象没了
    if (this.foe && (this.foe.dead || this.foe.gone || !c.enemies.includes(this.foe) || g.hero.dead)) { this.foe = null; }
    // 速度线：欺身、被轰飞的人从身边掠过、自己被打飞
    let wk = 0;
    if (this.mv?.kind === 'rush') { wk = 0.24; const d = Math.hypot(this.mv.e.x - g.player.x, this.mv.e.y - g.player.y) || 1; this.warpDx = (this.mv.e.x - g.player.x) / d; this.warpDy = (this.mv.e.y - g.player.y) / d; }
    else if (pb.air) { const s = Math.hypot(pb.vx, pb.vy); if (s > 700) { wk = Math.min(0.2, s / 12000); this.warpDx = pb.vx / s; this.warpDy = pb.vy / s; } }
    else { const f = this.flung, fb = f && this.B.get(f); if (fb?.air) { const s = Math.hypot(fb.vx, fb.vy); if (s > 1200) { wk = Math.min(0.14, s / 20000); this.warpDx = fb.vx / s; this.warpDy = fb.vy / s; } } }
    this.warpK += (wk - this.warpK) * Math.min(1, dt * (wk > this.warpK ? 14 : 5));
    // 缓冲的一下：定身结束了就打出去
    if (this.queued) { this.queued.t -= dt; if (this.queued.t <= 0) this.queued = null; else if (!this.holdsPlayer) { const q = this.queued; this.queued = null; if (q.k === 'light') this.light(); else this.heavy(q.slam, !!q.up); } }
  }
  /** 拼招时清掉离两人远的飘字、附近行人的喊话气泡（只是画面上的字，不动任何逻辑） */
  private quiet(x: number, y: number) {
    const c = this.combat;
    // 只留拼招自己的大字（两人中间、big）；伤害数字、状态、别人的喊话（哪怕就在身边）都先收掉
    if (c.texts.length) c.texts = c.texts.filter((t) => { const q = t as { anchor?: { x: number; y: number }; big?: boolean }, a = q.anchor, tx = a ? a.x : t.x, ty = a ? a.y : t.y + 120; return !!q.big && Math.hypot(tx - x, ty - y) < 120; });
    const act = (this.g.npcs as unknown as { active?: Map<string, { bubble?: unknown }> }).active;
    if (act) for (const a of act.values()) if (a.bubble) a.bubble = undefined;
  }
  private tickPoise(b: Body, dt: number) {
    b.idle += dt;
    if (b.breakT > 0) { b.breakT -= dt; if (b.breakT <= 0) { b.breakT = 0; b.poise = b.poiseMax; b.combo = 0; } return; }
    if (b.idle > BX.poiseIdle) { b.poise = Math.min(b.poiseMax, b.poise + b.poiseMax * BX.poiseRegen * dt); b.combo = 0; }
  }

  /** 被击飞的单位（敌人）这一帧的位移：按路径步进查碰撞 */
  private fly(e: Enemy, b: Body, dt: number) {
    b.flightT += dt;
    const ox = e.x, oy = e.y;
    this.stepMove(e, b, dt);
    b.travel += Math.hypot(e.x - ox, e.y - oy);
    const r = vertical(b, dt);
    if (r) this.landed(e, b, r);
    if (!b.air) return;
    e.flyH = 0; e.lift = b.z;
    e.kx = b.mx = b.vx; e.ky = b.my = b.vy;   // 照外力速度写一份：下一帧被清零就是被模组定住了
    if (e.cs) { e.cs.x = e.x; e.cs.y = e.y; e.cs.lift = 0; }
    // 尾迹与残影
    const T = b.trail; T.push([e.x, e.y, -b.z - 50]); if (T.length > BX.trailMax) T.shift();
    const sp = Math.hypot(b.vx, b.vy);
    b.ghostT -= dt;
    if (sp > 900 && b.ghostT <= 0 && this.ghosts.length < BX.ghostMax) { b.ghostT = 0.07; this.ghosts.push({ e, x: e.x, y: e.y, z: b.z, t: 0, dur: 0.32, yaw: e.cs?.yaw ?? 0, color: '255,214,150' }); }
    this.plow(e.x, e.y, b, dt);
    if (settled(b) || b.flightT > 5) this.endFlight(e, b);
  }
  /** 贴着水面平飞：身后犁出一道白浪水沟，两侧水墙翻起再合上（隔一小会儿发一记「浪」） */
  private plow(x: number, y: number, b: Body, dt: number) {
    const sp = Math.hypot(b.vx, b.vy);
    if (b.z > BX.plowZ || sp < 520) return;
    b.wakeT -= dt;
    if (b.wakeT > 0) return;
    b.wakeT = BX.wakeGap;
    if (!this.deepWater(x, y)) return;
    this.combat.fxq.push({ k: 'wake', x, y, dir: Math.atan2(b.vy, b.vx), power: Math.min(2.5, sp / 1300), r: b.z });
  }
  private endFlight(e: Enemy, b: Body) {
    b.slam = false;
    b.air = false; b.grounded = false; b.vx = b.vy = b.vz = 0; e.kx = e.ky = 0; b.mx = b.my = 0;
    if (b.flier) { e.flyH = Math.max(0, b.z); } e.lift = 0; b.z = 0; b.trail.length = 0;
    b.up = false; b.hangT = 0;
    b.staggerT = Math.max(b.staggerT, b.flier ? 0.25 : 0.45);   // 爬起来要一会儿
    b.chain = 0; b.bumped = null;
    if (this.flung === e) this.flung = null;
  }
  /** 落地：弹起或贴地犁行；砸得重就起坑 */
  private landed(e: Enemy | null, b: Body, r: 1 | 2) {
    const g = this.g, x = e ? e.x : g.player.x, y = e ? e.y : g.player.y;
    const vz0 = r === 1 ? b.vz / 0.32 : 0;   // 弹起前那一刻的竖直速度（向下为负）
    const sp = Math.hypot(b.vx, b.vy);
    if (b.meteor) { this.meteorLand(e, b, x, y, vz0); return; }
    const high = b.slam ? Math.max(0, b.dropH) : 0;   // 从多高砸下来的（御剑高度砸人：坑和水柱跟着加大）
    if (this.deepWater(x, y)) {
      // 落在水里：
      //   · 往下砸进来的（或者重重摔进来的）——冲天水柱、浪环、震屏，人沉入水中（打不到、不动），过一会儿破水而出；
      //   · 高速擦着水面弹起来的——打水漂，接着飞；
      //   · 其余——一圈水花，沉一小会儿再冒出来。
      const hard = b.slam || vz0 < -900;
      if (!hard && r === 1 && sp > 700) { this.combat.fxq.push({ k: 'splash', x, y, power: Math.min(2.5, sp / 900) }); return; }
      if (hard) {
        this.combat.fxq.push({ k: 'pillar', x, y, power: clamp(Math.abs(vz0) / 800 + (b.slam ? 0.8 : 0) + high / 260, 1.5, 4.2), r: 220 + Math.min(160, high * 0.35) });
        g.juice(0.06, 0.6); g.aberrKick = Math.max(g.aberrKick, 0.5); this.punchCam(0.6 + Math.min(0.6, high / 600));
        audio.sfx('boom', x, y);
        this.impactDmg(e, b, Math.abs(vz0) * 0.7 + sp * 0.2, x, y + 30);
        this.shove(x, y, 260, e);
      } else this.combatSplash(x, y, Math.min(3, (sp + Math.abs(vz0)) / 900));
      b.slam = false;
      this.submerge(e, b, x, y, hard ? (e ? BX.subEnemy : BX.subPlayer) : (e ? 0.6 : 0.5));
      return;
    }
    if (vz0 < -1100 || (r === 1 && sp > 1600)) {
      const big = vz0 < -1500;
      // 从高空砸下来的：和虚空坠界同一种大坑（放射裂纹、飞石、冲击波），按落差放大
      if (big && high > 220) { this.combat.fxq.push({ k: 'meteor', x, y, power: clamp(2 + high / 300, 2.4, 3.6), r: 200 + Math.min(180, high * 0.4) }); this.punchCam(0.5 + Math.min(0.6, high / 600)); }
      else this.combat.fxq.push({ k: big ? 'slam' : 'crater', x, y, power: big ? 3 : 2, r: big ? 230 : 140, dir: Math.atan2(b.vy, b.vx) });
      this.wreckAt(x, y, big && high > 220 ? 200 + Math.min(180, high * 0.4) : big ? 230 : 140, big ? clamp(2.6 + high / 300, 2.6, 3.8) : 1.6, b.by);
      g.juice(0, big ? 0.45 : 0.18);
      audio.sfx(big ? 'boom' : 'land', x, y);
      this.impactDmg(e, b, Math.abs(vz0) * 0.8 + sp * 0.3, x, y + 30);
      if (big) this.shove(x, y, 260, e);
    } else if (r === 2 && sp > 500) this.combat.fxq.push({ k: 'crater', x, y, power: 1, r: 80, dir: Math.atan2(b.vy, b.vx) });
  }
  /**
   * E3：流星落地（虚空里被打下来的、或者追下来的）。陆上是大坑、放射裂纹、飞石、冲击波，人嵌在坑里（硬直）；
   * 海里是冲天的大水柱、浪环，人沉下去（沉海的硬直）。打下来的吃撞击伤害（走 hitEnemy / hitPlayer），追下来的不伤自己。
   */
  private meteorLand(e: Enemy | null, b: Body, x: number, y: number, vz0: number) {
    const g = this.g, follow = b.meteor === 2, water = this.deepWater(x, y);
    const v = Math.max(Math.abs(vz0), Math.abs(b.vz), 1600);
    b.meteor = 0; b.slam = false; b.dropH = 0;
    b.air = false; b.grounded = false; b.vx = b.vy = b.vz = 0; b.z = 0; b.trail.length = 0;
    if (e) { e.kx = e.ky = 0; b.mx = b.my = 0; e.lift = 0; e.flyH = 0; if (this.flung === e) this.flung = null; }
    const k = follow ? 0.6 : 1;
    if (water) {
      this.combat.fxq.push({ k: 'pillar', x, y, power: 4.4 * k, r: 340 * k, big: !follow });
      if (!follow) this.impactDmg(e, b, v * 0.9, x, y + 30);
      this.shove(x, y, 460 * k, e);
      this.submerge(e, b, x, y, follow ? 0.5 : e ? VOIDFALL.stunSea : 1.2);
    } else {
      this.combat.fxq.push({ k: 'meteor', x, y, power: 4 * k, r: 380 * k, big: !follow });
      this.wreckAt(x, y, 380 * k, 4 * k, b.by);
      if (!follow) this.impactDmg(e, b, v * 0.9, x, y + 30);
      this.shove(x, y, 460 * k, e);
      if (e) b.staggerT = Math.max(b.staggerT, follow ? 0.3 : VOIDFALL.stunLand);
      else { b.staggerT = Math.max(b.staggerT, 1.0); this.playerLift = 0; this.pTrail.length = 0; }
    }
    g.juice(follow ? 0.03 : 0.1, follow ? 0.5 : 0.95); g.aberrKick = Math.max(g.aberrKick, follow ? 0.3 : 0.8);
    this.punchCam(follow ? 0.6 : 1.3);
    if (!follow) { g.slowmo(0.16); this.finisher = { s: water ? '坠海！' : '坠地！', t: 0 }; }
    audio.sfx('boom', x, y); if (!follow) audio.sfx('thunder', x, y);
  }
  /** E3：让一个敌人从 z0 高处以 vz 的速度砸下去（流星）。by：撞击伤害算谁的；follow：追下来的（落地不伤自己） */
  meteorIn(e: Enemy, by: 'p' | Enemy | null, z0: number, vz: number, follow: boolean) {
    const b = this.body(e), g = this.g;
    b.air = true; b.grounded = false; b.flier = false; b.flightT = 0; b.travel = 0; b.chain = 0; b.bumped = null;
    b.z = z0; b.vz = vz; b.vx = 0; b.vy = 0; b.slam = true; b.meteor = follow ? 2 : 1; b.dropH = z0; b.trail.length = 0; b.up = false; b.hangT = 0;
    b.by = by; b.byRealm = by === 'p' ? g.hero.realm : by?.realm ?? e.realm; b.byAtk = by === 'p' ? this.combat.pStats.atk * this.meleeMul : by?.atk ?? 0;
    b.safeX = e.x; b.safeY = e.y; b.subT = 0; b.freezeT = 0;
    e.flyH = 0; e.lift = z0; e.kx = b.mx = 0.001; e.ky = b.my = 0;   // kx 记一个非零的小数：下一帧被模组清零才算被定住
    if (e.cast) this.combat.foe.interrupt(e);
    e.windup = 0;
    if (b.ai) { b.ai.st = 'idle'; b.ai.wind = 0; }
    this.live.add(e);
    if (!follow) { this.flung = e; this.engage(e); }
  }
  /** E3：主角被从虚空砸下来，降到高空的顶以后接着直坠到地上 / 海里（落地吃撞击伤害、硬直；途中照常能脱困） */
  meteorPlayer(by: Enemy | null) {
    const g = this.g, p = g.player, b = this.pb;
    const z0 = Math.max(p.z, ALT.max);
    p.flying = false; p.z = 0; p.zTarget = 0; this.aloft = null;
    b.air = true; b.grounded = false; b.flier = false; b.flightT = 0; b.z = z0; b.vz = -2600; b.vx = b.vy = 0;
    b.slam = true; b.meteor = 1; b.dropH = z0; this.pTrail.length = 0;
    b.by = by; b.byRealm = by?.realm ?? g.hero.realm; b.byAtk = by?.atk ?? 0; b.safeX = p.x; b.safeY = p.y;
    this.mv = null; this.recT = 0; this.wind = null;
    if (by) this.engage(by);
  }
  /** 镜头猛推再回弹（重击命中、坠地、坠界）：k 越大推得越近 */
  punchCam(k: number) { this.kick.v = Math.min(4, this.kick.v + 2.4 * k); }
  private combatSplash(x: number, y: number, power: number) { this.combat.fxq.push({ k: 'splash', x, y, power }); }

  // ------------------------------------------------------------ 砸进水里：沉下去、浮上来
  /** 沉入水中（敌人：打不到、不动，立板沉到水线下只露水花；主角：沉一会儿再浮起，进泅水） */
  private submerge(e: Enemy | null, b: Body, x: number, y: number, T: number) {
    const g = this.g;
    b.air = false; b.grounded = false; b.vx = b.vy = b.vz = 0; b.z = 0; b.trail.length = 0; b.up = false; b.hangT = 0;
    b.subT = T; b.subX = x; b.subY = y;
    if (e) {
      e.lift = 0; e.flyH = 0; e.kx = e.ky = 0; b.mx = b.my = 0;
      e.hideT = T + 0.05;   // 沉在水下：看不见、打不到、不走寻常 AI（combat 里 hideT > 0 的一律跳过）
      if (e.cast) this.combat.foe.interrupt(e);
      e.windup = 0;
      if (b.ai) { b.ai.st = 'idle'; b.ai.wind = 0; }
      this.live.add(e);
      if (this.flung === e) this.flung = null;
      this.combat.texts.push({ x, y: y - 120, s: '沉入水中', color: '#bfe8ff', t: 0, vy: -26 } as never);
    } else {
      this.pSubT = T; this.playerLift = -120; this.pTrail.length = 0;
      this.combat.invulnT = Math.max(this.combat.invulnT, T);
      if (g.isFlying) { g.player.flying = false; g.player.zTarget = 0; }
      g.player.z = 0;
    }
    this.onSubmerge?.(e, x, y);
  }
  /**
   * hideT 是全战斗共用的「看不见、打不到」：追杀系统的土遁潜行和近战的沉水都借它。两边不会同时写——
   * 土遁中的人 launchable 为假，砸不进水里；沉在水里的人追杀系统只会把 hideT 往下减（这里每帧又补回去）、不会起土遁。
   * 唯一要防的是浮上来那一下把它清零时，正好碰上它在土遁：这里只在不是土遁时清（见 test-voidfall 第 8 段）。
   */
  earthHiding(e: Enemy): boolean { const P = this.g.pursuit?.cur; return !!P && P.e === e && !!(P as { earth?: unknown }).earth; }
  /** 敌人沉在水里的这一帧：钉在原地，冒泡；到点破水而出 */
  private underwater(e: Enemy, b: Body, dt: number) {
    b.subT -= dt;
    e.x = b.subX; e.y = b.subY; e.kx = e.ky = 0; e.lift = 0;
    if (b.subT > 0) { e.hideT = Math.max(e.hideT, Math.min(b.subT + 0.05, 0.2)); return; }
    b.subT = 0; if (!this.earthHiding(e)) e.hideT = 0;
    this.emerge(e, b);
  }
  /** 破水而出：会御器的直接腾空；不会的跃回上一处站得住的地方；海里的妖物就在水里 */
  private emerge(e: Enemy, b: Body) {
    const c = this.combat;
    c.fxq.push({ k: 'breach', x: e.x, y: e.y, power: 1.6 });
    audio.sfx('land', e.x, e.y);
    b.staggerT = Math.max(b.staggerT, 0.35);
    if (!this.deepWater(e.x, e.y) || e.sea) return;
    if (e.canFly) { e.flyH = ALT.hover; return; }
    if (b.safeX === b.safeX) {
      const dx = b.safeX - e.x, dy = b.safeY - e.y, D = Math.hypot(dx, dy);
      if (D > 30 && this.launchable(e)) { this.launch(e, dx, dy, D, 700, null, 0, 0, false); this.body(e).flier = false; }
      else { e.x = b.safeX; e.y = b.safeY; }
    }
  }
  /** 主角沉在水里：1 息后浮起（有绝域的海就进泅水，没有的被浪推回上一处站得住的地方） */
  private playerUnderwater(dt: number) {
    const g = this.g, p = g.player, b = this.pb;
    this.pSubT -= dt;
    const k = Math.max(0, this.pSubT) / BX.subPlayer;
    this.playerLift = -120 * Math.min(1, k * 1.6);
    if (this.pSubT > 0) return;
    this.pSubT = 0; this.playerLift = 0;
    this.combat.fxq.push({ k: 'breach', x: p.x, y: p.y, power: 1.2 });
    const inSea = !!(g.jueyu as unknown as { profile?: unknown }).profile;
    if (!inSea && this.deepWater(p.x, p.y) && b.safeX === b.safeX) { p.x = b.safeX; p.y = b.safeY; }
    b.staggerT = 0.3;
  }

  /**
   * 贴地的人被石头挡住：从石头里推出来（主角、身边的敌人）。
   * 第三轮：冲你来的敌人也算（原先只推正和近战打交道的，别的敌人会穿过石头）——做法是最小的那一种：
   * 不改寻路，只是每帧把站进石头里的人沿径向推到石头外缘，走着走着就绕过去了；石头只在海边、荒野里摆，
   * 镜头外的不管（只查你身边一千六 × 一千二以内）。不取随机数。试过连 NPC 之间互斗的也推，会翻固定种子的 test-melee
   * （它们身边有自动摆的石头，走位一变结果就变），所以互斗的 NPC 仍不推。
   */
  private rockPush() {
    const g = this.g, p = g.player, B = this.brk;
    if (!g.isFlying || p.z < 40) { const o = B.pushOut(p.x, p.y, p.z + this.playerLift, 22); if (o && !this.pb.air) { p.x = o.x; p.y = o.y; } }
    for (const e of this.combat.enemies) {
      // 正冲你来的（仇恨在你身上）和正在近战里的都算；NPC 之间互斗的不推（固定种子的老测试 test-melee 里它们的走位一点不变）
      if (!this.live.has(e) && !(e.aggro && e.tgP)) continue;
      if (e.dead || Math.abs(e.x - p.x) > 1600 || Math.abs(e.y - p.y) > 1200 || e.def.flying || e.z > 40 || (e as { shell?: boolean }).shell) continue;
      const b = this.B.get(e); if (b?.air || (b && b.subT > 0)) continue;
      const o = B.pushOut(e.x, e.y, e.z, 20 * (e.def.look?.size ?? 1)); if (o) { e.x = o.x; e.y = o.y; if (e.cs) { e.cs.x = e.x; e.cs.y = e.y; } }
    }
  }
  /** 第三轮：敌人的大范围招式（落地炸开的大圈）也能把礁石、巨石、枯树轰碎 */
  private aoeRocks() {
    const hz = this.combat.foe?.hz; if (!hz?.length) return;
    for (const h of hz) {
      if (!h.fired || this.rockHz.has(h) || h.k !== 'circle' || (h.r < 110 && !h.big)) continue;
      this.rockHz.add(h);
      for (const rk of this.brk.near(h.x, h.y, h.r + 40)) {
        if (rk.dead || Math.hypot(rk.x - h.x, (rk.y - h.y) * 1.3) > h.r + rk.r * 0.5) continue;
        this.brk.smash(rk, Math.atan2(rk.y - h.y, rk.x - h.x), 1.4);
      }
    }
  }
  private rockHz = new WeakSet<object>();

  /** 死在半空的：把速度交给打击感那边的尸身抛射，接着飞 */
  private handOffCorpse(e: Enemy, b: Body) {
    const T = (e as Enemy & { toss?: { vx: number; vy: number; vz: number; z: number } }).toss;
    if (T) { T.vx = b.vx; T.vy = b.vy; T.z = Math.max(T.z, b.z); T.vz = Math.max(T.vz, b.vz); }
    b.air = false; b.trail.length = 0;
  }

  /** 沿位移步进：撞墙（不可走的地形、城墙屋舍、安全区边）、撞人 */
  private stepMove(e: Enemy | null, b: Body, dt: number) {
    const g = this.g;
    let x = e ? e.x : g.player.x, y = e ? e.y : g.player.y;
    const dx = b.vx * dt, dy = b.vy * dt, L = Math.hypot(dx, dy);
    const n = Math.max(1, Math.min(24, Math.ceil(L / 36)));
    const bounds = e ? null : g.bounds;   // 图边（主角才有；取一次，别每一小步都算交界）
    const rocks = this.brk.n > 0 && b.z < 200;
    for (let i = 0; i < n; i++) {
      const nx = x + dx / n, ny = y + dy / n;
      const hit = this.blocked(e, x, y, nx, ny, b.z, bounds);
      if (hit) { this.wallHit(e, b, x, y, hit); break; }
      // 可破坏物：够快就撞碎（吃二次撞击伤害、减速、接着飞），不够快就当墙撞停
      if (rocks) {
        const rk = this.brk.hit(nx, ny, b.z, e ? 18 * (e.def.look?.size ?? 1) + 10 : 26);
        if (rk && !this.smashRock(e, b, rk, nx, ny)) { this.wallHit(e, b, x, y, 'wall'); break; }
      }
      x = nx; y = ny;
      if (this.standable(e, x, y)) { b.safeX = x; b.safeY = y; }
      if (e && Math.hypot(b.vx, b.vy) > 500 && this.bump(e, b, x, y)) break;
    }
    if (e) { e.x = x; e.y = y; } else { g.player.x = x; g.player.y = y; }
  }
  private standable(e: Enemy | null, x: number, y: number) {
    const g = this.g, T = g.terrain;
    if (g.xukong.fight.on) return true;
    if (g.mijing.active) return g.mijing.walk(x, y);
    if (e?.sea) return !T.isLand(x, y);
    return T.walkFactor(x, y) > 0;
  }
  /** 这一步撞没撞上：返回撞上的是什么（'wall' 地形 / 'house' 屋舍城墙），没撞上是空串 */
  private blocked(e: Enemy | null, x: number, y: number, nx: number, ny: number, z: number, B: { x0: number; x1: number; y0: number; y1: number } | null): '' | 'wall' | 'house' {
    const g = this.g, T = g.terrain;
    if (g.xukong.fight.on) return '';
    if (z > 150) return '';   // 飞得够高：从上面过去
    if (g.mijing.active) return z < 40 && !g.mijing.walk(nx, ny) && g.mijing.walk(x, y) ? 'wall' : '';
    if (e) {
      if (e.def.flying) return '';
      // E2：水不再是墙——被轰向海里的人飞过去、落进水里（砸海、犁水）；只有陆上的崖壁、陡坡挡人
      if (e.sea ? T.isLand(nx, ny) : T.isLand(nx, ny) && ((T.walkFactor(nx, ny) <= 0 && z < 60) || !T.canTraverse(x, y, nx, ny))) return 'wall';
      if (z < 120 && g.space.blocked(nx, ny) && !g.space.blocked(x, y)) return 'house';
      if (this.combat.safeAt(nx, ny) && !this.combat.safeAt(x, y)) return 'wall';
      return '';
    }
    if (g.isFlying) return '';
    if (B && !g.mijing.active && (nx < B.x0 || nx > B.x1 || ny < B.y0 || ny > B.y1)) return 'wall';
    if (T.isLand(nx, ny) && ((T.walkFactor(nx, ny) <= 0 && z < 60) || !T.canTraverse(x, y, nx, ny))) return 'wall';   // E2：水不是墙（会被打进海里）
    if (z < 120 && g.space.blocked(nx, ny) && !g.space.blocked(x, y)) return 'house';
    return '';
  }
  /** 撞上地形 / 屋舍：结算撞击伤害、起坑、弹开（速度不够就只是停下） */
  private wallHit(e: Enemy | null, b: Body, x: number, y: number, what: 'wall' | 'house') {
    const sp = Math.hypot(b.vx, b.vy);
    const ux = b.vx / (sp || 1), uy = b.vy / (sp || 1);
    if (sp > 420) {
      this.combat.fxq.push({ k: 'crater', x: x + ux * 30, y: y + uy * 30, power: sp > 1600 ? 3 : 2, r: 90 + Math.min(160, sp / 14), dir: Math.atan2(uy, ux), kind: what });
      this.impactDmg(e, b, sp, x + ux * 40, y + uy * 40);
      if (sp > 1600) this.wreckAt(x + ux * 30, y + uy * 30, 90 + Math.min(160, sp / 14), 2.2, b.by, 'crack');
      else if (what === 'house') { try { this.combat.wreck?.town?.impact(x + ux * 30, y + uy * 30, Math.atan2(uy, ux), clamp(sp / 900, 0.5, 3), b.by); } catch { /* 城镇破坏出错不能拖垮出招 */ } }   // 轰进房子：房子掉耐久（快的那种已经走上面的龟裂进了城镇层）
      b.freezeT = Math.max(b.freezeT, 0.07);
      this.g.juice(0, Math.min(0.5, sp / 4000));
      audio.sfx(sp > 1600 ? 'boom' : 'land', x, y);
    }
    // 弹开：反着退一点，贴地犁行停下
    b.vx = -ux * sp * 0.22; b.vy = -uy * sp * 0.22;
    if (!b.flier) { b.grounded = b.z <= 1; }
  }
  /** 被击飞的人撞上一块石头 / 一棵枯树：够快就撞碎它（返回 true），自己吃二次撞击伤害、减速但继续飞 */
  private smashRock(e: Enemy | null, b: Body, rk: Rock, x: number, y: number): boolean {
    const sp = Math.hypot(b.vx, b.vy);
    if (sp < BK.smashV) return false;
    const dir = Math.atan2(b.vy, b.vx);
    this.brk.smash(rk, dir, sp / 900);
    this.impactDmg(e, b, sp * 0.6 * (rk.kind === 'boulder' ? 1.2 : rk.kind === 'tree' ? 0.7 : 1), x, y);
    const k = rk.kind === 'boulder' ? 0.58 : rk.kind === 'reef' ? 0.66 : 0.78;
    b.vx *= k; b.vy *= k; if (!b.grounded) b.vz = Math.max(b.vz, 120);
    b.freezeT = Math.max(b.freezeT, 0.05);
    this.g.juice(0, Math.min(0.55, sp / 3200));
    return true;
  }
  /** 撞上别的人：两个都吃撞击伤害，被撞的也飞出去一小段（不用破罡），撞人的减速 */
  private bump(e: Enemy, b: Body, x: number, y: number): boolean {
    const c = this.combat, sp = Math.hypot(b.vx, b.vy);
    for (const o of c.enemies) {
      if (o === e || o.dead || o.hideT > 0) continue;
      if (Math.abs(o.x - x) > 60 || Math.abs(o.y - y) > 46 || Math.abs(o.z - b.z) > 110) continue;
      if (b.bumped?.has(o)) continue;
      if ((o.x - x) * b.vx + (o.y - y) * b.vy <= 0) continue;   // 往外飞的人撞不上身后的人（贴身出手时，被轰飞的人不会回头把出手的人撞飞）
      (b.bumped ??= new Set()).add(o);
      const ux = b.vx / sp, uy = b.vy / sp;
      this.impactDmg(e, b, sp * 0.7, x, y);
      if (b.by === 'p') this.dealTo(o, b.byAtk * 0.45 * Math.min(2, sp / 1600), 'bump', x - ux * 40, y - uy * 40);
      if (this.launchable(o)) { const ob = this.body(o); if (!ob.air) this.launch(o, ux, uy, Math.min(900, sp * 0.3), 300, b.by, b.byRealm, b.byAtk, false); }
      c.fxq.push({ k: 'crater', x, y, power: 1, r: 70, dir: Math.atan2(uy, ux), kind: 'unit' });
      b.vx *= 0.55; b.vy *= 0.55;
      return true;
    }
    return false;
  }
  /** 撞击伤害：撞墙、撞人、砸地都走这里（敌人走 hitEnemy、主角走 hitPlayer，照常触发模组的 damage 钩子） */
  private impactDmg(e: Enemy | null, b: Body, speed: number, fx: number, fy: number) {
    const k = clamp(speed / 1600, 0.25, 2.2);
    if (e) {
      if (b.by === 'p' || !b.by) this.dealTo(e, (b.byAtk || this.combat.pStats.atk) * 0.5 * k * this.meleeMul, 'impact', fx, fy);
      else if (!b.by.dead) { this.combat.npcHit(b.by, e, b.byAtk * 0.5 * k, b.byRealm, undefined, fx, fy); this.log?.push({ k: 'npc-impact', who: e.name, dmg: 1 }); }   // NPC 把 NPC 轰进墙 / 礁石：算出手的那个 NPC 的
      return;
    }
    const src = b.by && b.by !== 'p' ? b.by : undefined;
    this.hurtPlayer(b.byAtk * 0.45 * k, b.byRealm, fx, fy, src, 'impact');
  }
  /**
   * 落地、砸地、高速撞墙顺带的破坏（world/wreck.ts）：周围的树倒、石头裂、地上留坑 / 龟裂。
   * 画面（坑的特效、震屏）和推人、伤人仍是近战自己的那一套，这里只要破坏系统的那部分（fx:false，返回的单位清单不用）。
   * src：这一下算谁的（城镇破坏记账用）——被击飞的人砸出来的算把他打飞的那个。
   */
  private wreckAt(x: number, y: number, r: number, power: number, src: Enemy | 'p' | null, mark: 'pit' | 'crack' = 'pit') {
    const W = this.combat.wreck; if (!W) return;
    try { W.radial(x, y, r, power, src ?? null, { mark, fx: false }); } catch { /* 破坏系统出错不能拖垮出招 */ }
  }
  /** 往下砸、重落地：周围一圈的人被震开（不伤，只推） */
  private shove(x: number, y: number, R: number, except: Enemy | null) {
    for (const o of this.combat.enemies) {
      if (o === except || o.dead) continue;
      const d = Math.hypot(o.x - x, o.y - y); if (d > R || d < 1) continue;
      if (this.launchable(o) && !this.body(o).air) { o.kx += (o.x - x) / d * 420; o.ky += (o.y - y) / d * 300; }
    }
  }

  // ------------------------------------------------------------ 打与挨打
  /** 主角打敌人：走 hitEnemy（模组 damage 钩子、暴击、护体灵光、gore 都在里面）。返回这一下有没有真打进去 */
  dealTo(e: Enemy, raw: number, kind: string, fx: number, fy: number): boolean {
    const hp0 = e.hp;
    this.combat.hitEnemy(e, raw, { realm: this.g.hero.realm, stCh: 0, school: '体', brawl: kind } as never, fx, fy);
    const landed = e.dead || e.hp < hp0;
    this.log?.push({ k: kind, who: e.name, dmg: landed ? hp0 - Math.max(0, e.hp) : 0 });
    if (landed) {
      this.live.add(e); this.engage(e);
      // 连段计数（撞击、撞人这种「顺带」的不算一下）
      if (kind !== 'impact' && kind !== 'bump') { const t = this.g.time; this.comboN = t - this.comboAt < BX.comboGap ? this.comboN + 1 : 1; this.comboAt = t; }
    }
    return landed;
  }
  /**
   * 收尾一击的大字（连段数 + 招名）：只出界面上那一行（BrawlHUD）。原先头顶还飘一行同样的字，两行重复——主线看图后去掉了。
   * e、big 留着是为了调用处不用改。
   */
  combo(e: Enemy, name: string, big = true) {
    const n = this.comboN, s = n >= 2 ? `${n} 连 · ${name}！` : `${name}！`;
    this.finisher = { s, t: 0 };
    void e; void big;
  }
  /** 敌人打主角：走 hitPlayer。返回有没有真打进去（闪避、无敌、被模组改成 0 都不算） */
  hurtPlayer(raw: number, realm: number, fx: number, fy: number, src: Enemy | undefined, kind: string): boolean {
    const c = this.combat, h = this.g.hero, hp0 = h.hp, sh0 = c.shield?.amt ?? 0;
    const ld0 = (c.lingdun?.hp ?? []).reduce((a, b) => a + b, 0);   // 灵力护盾挡下的也算挨了这一下：不然近战的削罡、硬直、轰飞会被护罩整个吃掉
    c.hitPlayer(raw, realm, undefined, fx, fy, src);
    const ld1 = (c.lingdun?.hp ?? []).reduce((a, b) => a + b, 0);
    const landed = h.hp < hp0 || (c.shield?.amt ?? 0) < sh0 || ld1 < ld0;
    this.log?.push({ k: kind, who: '主角', dmg: landed ? 1 : 0 });
    if (landed && src) this.engage(src);
    return landed;
  }
  private engage(e: Enemy) { this.foe = e; this.engageT = 2.6; }
  /** r9-hitfeel：单位级顿帧（法术、法器、NPC 互殴的命中由 world/hitfeel.ts 按档冻住被打的人 sec 秒；和兵器谱的顿帧同一个计时） */
  hitFreeze(e: Enemy, sec: number) {
    if (e.dead || (e as { shell?: boolean }).shell) return;
    const b = this.body(e); b.freezeT = Math.max(b.freezeT, sec); this.live.add(e);
  }

  /**
   * 击飞：沿 (ux, uy) 飞 D 远（平地上），竖直初速 vz。首领只飞一小段。
   * by：谁打的（撞击伤害算谁的）。返回有没有飞起来。
   */
  launch(e: Enemy, ux: number, uy: number, D: number, vz: number, by: Enemy | 'p' | null, byRealm: number, byAtk: number, chainKeep: boolean): boolean {
    if (!this.launchable(e)) return false;
    const b = this.body(e);
    if (isBoss(e)) D *= BX.bossLaunchK;
    const z0 = e.flyH + e.lift;   // 禽类平时悬着的那 40 由 Enemy.z 自己加，这里不重复算
    b.flier = (z0 > 30 || !!e.def.flying) && e.canFly;
    if (b.flier && vz > 0) vz *= 0.15;   // E2：本来就在空中的（御器 / 禽类）被平着轰出去，不再往上窜——贴着水面飞才犁得出水沟
    if (!b.air) { b.z = z0; b.trail.length = 0; b.travel = 0; if (!chainKeep) { b.chain = 0; b.bumped = null; } }
    b.air = true; b.grounded = false; b.flightT = 0; b.up = false; b.hangT = 0;
    const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
    const v = speedFor(D, vz, b.z, b.flier);
    b.vx = ux * v; b.vy = uy * v * 0.82; b.vz = vz;   // 纵向（屏幕上下）压一点：俯视角里上下飞得太远看着假
    b.by = by; b.byRealm = byRealm; b.byAtk = byAtk; b.safeX = e.x; b.safeY = e.y;
    e.flyH = 0; e.lift = b.z; e.kx = b.mx = b.vx; e.ky = b.my = b.vy;
    if (e.cast) this.combat.foe.interrupt(e);
    e.windup = 0;
    this.live.add(e);
    return true;
  }
  /**
   * r7 上挑：把人打上天（顶不过飞行上限减 upRoom——你瞬移到他头顶还在上限以内），到顶滞空 upHang 息再落下；水平只带出去一小段。
   * 御器的、禽类也一样按重力落（不然打上去就一直悬着）。首领只挑起一小段、几乎不滞空。返回有没有飞起来。
   */
  launchUp(e: Enemy, ux: number, uy: number, byRealm: number, byAtk: number, chainKeep: boolean, riseK = 1): boolean {
    if (!this.launchable(e)) return false;
    const b = this.body(e), boss = isBoss(e);
    const z0 = e.flyH + e.lift;
    if (!b.air) { b.z = z0; b.trail.length = 0; b.travel = 0; if (!chainKeep) { b.chain = 0; b.bumped = null; } }
    const top = ALT.max - BX.upRoom, rise = BX.upRise * (boss ? BX.bossLaunchK * 1.5 : 1) * riseK;   // riseK：枪的「挑」不按上升键也挑起一截（兵器谱 upLift）
    const H = Math.max(40, Math.min(top, b.z + rise) - b.z);
    b.air = true; b.grounded = false; b.flier = false; b.flightT = 0; b.slam = false; b.meteor = 0;
    b.up = true; b.hangT = boss ? 0.1 : BX.upHang;
    const L = Math.hypot(ux, uy) || 1, sp = BX.upV * (boss ? 0.5 : 1);
    b.vx = ux / L * sp; b.vy = uy / L * sp * 0.82; b.vz = Math.sqrt(2 * BX.grav * H);
    b.by = 'p'; b.byRealm = byRealm; b.byAtk = byAtk; b.safeX = e.x; b.safeY = e.y;
    e.flyH = 0; e.lift = b.z; e.kx = b.mx = b.vx || 0.001; e.ky = b.my = b.vy;
    if (e.cast) this.combat.foe.interrupt(e);
    e.windup = 0;
    if (b.ai) { b.ai.st = 'idle'; b.ai.wind = 0; }
    this.live.add(e);
    return true;
  }
  /** 主角被打飞（体修原型的重击、NPC 脱困时的震开都走这里） */
  launchPlayer(ux: number, uy: number, D: number, vz: number, by: Enemy | null, slam = false) {
    const g = this.g, b = this.pb, L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
    if (this.pSubT > 0) return;
    if (slam && g.isFlying) {
      // 被往下砸：遁光被打散，从当时的高度直坠下去
      const z0 = g.player.z; g.player.flying = false; g.player.z = 0; g.player.zTarget = 0;
      b.air = false; b.flier = false; b.z = z0; this.pTrail.length = 0;
      b.air = true; b.grounded = false; b.flightT = 0; b.slam = true; b.dropH = z0;
      const v = speedFor(D, vz, b.z, false);
      b.vx = ux * v; b.vy = uy * v * 0.82; b.vz = vz;
      b.by = by; b.byRealm = by?.realm ?? g.hero.realm; b.byAtk = by?.atk ?? 0; b.safeX = g.player.x; b.safeY = g.player.y;
      this.mv = null; this.recT = 0; this.wind = null;
      if (by) this.engage(by);
      return;
    }
    b.flier = g.isFlying; b.slam = slam;
    if (!b.air) { b.z = this.aloft?.z ?? 0; this.pTrail.length = 0; }   // r7：悬在半空（瞬移到上挑起来的人头顶）时被打飞：从那个高度接着飞
    this.aloft = null;
    b.air = true; b.grounded = false; b.flightT = 0;
    const v = speedFor(D, vz, b.z, b.flier);
    b.vx = ux * v; b.vy = uy * v * 0.82; b.vz = b.flier ? 0 : vz;
    b.by = by; b.byRealm = by?.realm ?? g.hero.realm; b.byAtk = by?.atk ?? 0; b.safeX = g.player.x; b.safeY = g.player.y;
    this.mv = null; this.recT = 0; this.wind = null;
    if (g.player.sitting) g.stand();
    if (by) this.engage(by);   // 镜头：框住打飞你的人
  }

  // ------------------------------------------------------------ 敌人那边：体修原型的出手、按境界自己脱困
  /** 给任意敌人挂上近战 AI（下一轮 foeskills 的招式类型 'brawl' 接到这里） */
  markBrawler(e: Enemy) { const b = this.body(e); b.ai = newAI(true, e.def.kind !== 'human'); b.aiMarked = true; b.poiseMax = this.poiseMaxOf(e); b.poise = b.poiseMax; this.live.add(e); }
  /** 刷一个会还手的体修（试玩入口、测试用）：自己驱动的近战（不放别的招式） */
  spawnBrawler(x: number, y: number, realm: number, stage = 1): Enemy {
    const e = new Enemy(brawlerDef(), x, y, realm, stage);
    e.school = 'tixiu'; e.kit = [];
    (e as unknown as { noMind?: boolean }).noMind = true;   // 体修原型只走近战：别让心智 AI 再给它套护体灵光、法器、闪避
    this.combat.enemies.push(e); this.markBrawler(e);
    return e;
  }
  /** 刷一个木人（不还手、不挪步） */
  spawnDummy(x: number, y: number, realm: number): Enemy {
    const e = new Enemy(dummyDef(), x, y, realm, 0);
    e.maxHp = e.hp = e.maxHp * 30;
    // 陪练不是真的修士：不凝护体灵光、不瞬移闪避、不施法（心智 AI 与 kits 都跳过）
    e.kit = []; (e as unknown as { noMind?: boolean }).noMind = true;
    // r9：陪练不背剑、不拿兵器（随机长相里那柄深色长剑，推近的镜头里被打飞时是一根横着的黑棍）
    if (e.look) { const L = e.look as { back?: string; weapon?: unknown }; L.back = 'none'; L.weapon = undefined; }
    this.combat.enemies.push(e);
    return e;
  }
  /** 刷一个人形的陪练（劫修的样子；和木人一样不还手、不挪步、血很厚）——试玩页演示擒拿、摔打用，被按着拖、被抡起来看得出是个人 */
  spawnSparMan(x: number, y: number, realm: number): Enemy {
    const base = ENEMIES.bandit ?? dummyDef();
    const e = new Enemy({ ...base, id: 'bx_sparman', name: '劫修', title: '陪练', hp: 6, atk: 0.1, def: 0.6, speed: 0, melee: undefined, ranged: undefined, drops: [] }, x, y, realm, 0);
    e.maxHp = e.hp = e.maxHp * 30;
    e.kit = []; (e as unknown as { noMind?: boolean }).noMind = true;   // 同上：陪练不施法、不凝护罩
    this.combat.enemies.push(e);
    return e;
  }
  private canTech(e: Enemy, b: Body) {
    if (e.def.kind === 'human') return (!!e.def.melee || !!b.ai) && e.realm >= 2;
    return e.blv >= 5 || isBoss(e);
  }
  /** NPC / 大妖被打飞时按境界自己脱困：被追得越狠越早 */
  private npcTech(e: Enemy, b: Body) {
    if (b.techCd > 0 || b.flightT < 0.28 || !this.canTech(e, b)) return;
    const need = isBoss(e) || e.realm >= 4 ? 1 : e.realm >= 3 ? 2 : 3;
    if (b.chain < need && !(b.flightT > 0.55 && b.combo >= 10 - e.realm)) return;
    b.techCd = 7; b.vx = b.vy = 0; b.vz = Math.max(0, b.vz); b.armorT = 0.7; b.poise = b.poiseMax * 0.5; b.breakT = 0;
    const g = this.g, p = g.player;
    this.combat.fxq.push({ k: 'tech', anchor: { x: e.x, y: e.y, offsetY: -b.z }, x: e.x, y: e.y - 60, color: '255,226,150', r: 260 });
    this.combat.texts.push({ anchor: { x: e.x, y: e.y, offsetY: -b.z }, x: e.x, y: e.y - 140, s: '脱困', color: '#ffe0a0', t: 0, vy: -30, big: true } as never);
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    if (d < 340 && !this.pb.air) this.launchPlayer(p.x - e.x || 1, p.y - e.y, 420, 260, e);
    audio.sfx('whoosh');
  }
  /** combat.updateEnemies 里每个单位先问一句：这一帧要不要跳过寻常 AI（被击飞、顿帧、破防硬直、正在出近战招式） */
  skipAI(e: Enemy, dt: number): boolean {
    const b = this.B.get(e);
    if (!b) return false;
    if (b.subT > 0) return true;   // 沉在水里
    if (b.move) { if (e.cs) { e.cs.x = e.x; e.cs.y = e.y; e.cs.lift = e.flyH + e.lift; e.cs.update(dt); } return true; }   // 特殊招式接管
    if (this.clash.st?.e === e) {   // 拼招：拳对拳顶住
      e.anim.move = 0;
      const ca: Action = foeKind(e) === 'fist' ? 'smash' : WEAPON_MOVES[foeKind(e)].heavy[0];   // 拿兵器的：兵器对兵器顶住
      if (e.cs) { e.cs.x = e.x; e.cs.y = e.y; e.cs.lift = e.flyH; e.cs.speed = 0; if (e.cs.action !== ca) e.cs.setAction(ca); e.cs.update(dt * (this.clash.st.phase === 'result' ? 1 : 0.15)); }
      return true;
    }
    if (b.freezeT > 0) return true;   // 定格：连动画都不走
    if (b.air) {
      e.anim.move = 0; e.anim.atk = 0;
      if (e.cs) { e.cs.x = e.x; e.cs.y = e.y; e.cs.lift = 0; e.cs.speed = 0; e.cs.vx = -0.75 * b.vx; e.cs.vy = -0.75 * b.vy; snapCloth(e.cs); e.cs.setAction('tumble'); e.cs.update(dt); }   // 风向和身体同向（见 clothWind）
      return true;
    }
    if (b.staggerT > 0) {
      e.anim.move = 0;
      if (e.cs) { e.cs.x = e.x; e.cs.y = e.y; e.cs.lift = e.flyH; e.cs.speed = 0; e.cs.setAction('hit'); e.cs.update(dt); }
      return true;
    }
    if (b.ai && b.ai.st !== 'idle') {
      const p = this.g.player, o = b.ai.tg, tx = o ? o.x : p.x, ty = o ? o.y : p.y;
      e.anim.move = 0; e.facing = tx > e.x ? 1 : -1;
      if (b.ai.beast) { e.anim.atk = b.ai.st === 'wind' || b.ai.st === 'combo' ? 0.8 : 0.3; e.anim.move = b.ai.st === 'rush' ? 1 : 0; e.anim.t += dt; }
      if (e.cs) {
        e.cs.x = e.x; e.cs.y = e.y; e.cs.lift = e.flyH; e.cs.faceToward(tx - e.x, ty - e.y, false);
        // 佯攻后撤用「虚晃后坐」的架子；抓投、佯攻的前摇架子别被拳架子顶掉
        const fk = foeKind(e);
        if (b.ai.st === 'rush') e.cs.setAction(fk === 'fist' ? 'rush' : WEAPON_MOVES[fk].rush); else if (b.ai.st === 'back') { if (e.cs.action !== 'feint') e.cs.setAction('feint'); } else if (e.cs.action !== 'punch' && e.cs.action !== 'smash' && e.cs.action !== 'grab' && e.cs.action !== 'feint' && !isWeaponAction(e.cs.action)) e.cs.setAction(fk === 'fist' ? 'punch' : WEAPON_MOVES[fk].light[0]);
        e.cs.update(dt);
        // 拿兵器的重击前摇（重兵抡起、枪往后引）：前摇比动作的蓄更长时，停在蓄足的那一下（看得出要砸了）
        if (b.ai.st === 'wind' && b.ai.hold > 0 && isWeaponAction(e.cs.action)) { b.ai.hold -= dt; e.cs.actionT = Math.min(e.cs.actionT, ACTION_HIT[e.cs.action][0] * 0.9); }
      }
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------ 主角：每帧（移动积分之后）
  playerTick(dt: number) {
    const g = this.g, p = g.player, b = this.pb;
    if (this.pSubT > 0) { this.playerUnderwater(dt); return; }   // 沉在水里：浮上来之前动不了
    if (this.clash.st && this.clash.st.phase !== 'result') return;   // 拼招：拳对拳顶住（悬停的高度由 clash 管）
    if (b.freezeT > 0) { b.freezeT -= dt; return; }   // 顿帧：定在原地
    this.recT = Math.max(0, this.recT - dt); this.gapT = Math.max(0, this.gapT - dt);
    if (b.armorT > 0) b.armorT = Math.max(0, b.armorT - dt);   // 霸体（重兵出手到命中之间）
    this.comboT -= dt; if (this.comboT <= 0) this.comboI = 0;
    this.actT -= dt; if (this.actT <= 0) this.act = null;
    b.staggerT = Math.max(0, b.staggerT - dt);
    // 前摇：重击蓄力（和对方的重击前摇撞上就拼招）、收式
    const W = this.wind;
    if (W) {
      if (b.air || b.staggerT > 0) this.wind = null;
      else {
        W.t -= dt;
        if (W.heavy) for (const e of this.live) { const ai = this.B.get(e)?.ai; if (ai?.st === 'wind' && ai.windK === 'h' && !ai.tg && Math.hypot(e.x - p.x, e.y - p.y) < 230 && this.clash.can(e)) { this.clash.start(e, 'heavy'); return; } }
        if (W.t <= 0) { this.wind = null; W.run(); }
      }
    }
    // 欺身 / 垫步 / 俯冲
    const m = this.mv;
    if (m) {
      const e = m.e;
      if (e.dead || (e.hideT > 0 && !m.chase) || b.air || (m.chase && g.input.keys.has('ascend'))) { this.mv = null; if (m.chase) this.pTrail.length = 0; }
      else {
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1, R = this.reachTo(e) * (m.kind === 'dive' ? 0.35 : 0.8);
        const step = Math.min(Math.max(0, d - R), m.speed * dt);
        const nx = p.x + dx / d * step, ny = p.y + dy / d * step;
        const okGo = g.isFlying || g.mijing.active ? true : g.terrain.walkFactor(nx, ny) > 0 && g.terrain.canTraverse(p.x, p.y, nx, ny);
        if (!okGo) { this.mv = null; this.act = null; }
        else {
          p.x = nx; p.y = ny; m.went += step;
          p.st.faceToward(dx, dy, false);
          // r7：御剑时欺身 / 垫步连高度一起追（对手比你高 / 低也扑得到他跟前，不是隔着几百高度出拳）
          let zLeft = 0;
          if (g.isFlying && (m.kind === 'rush' || m.kind === 'lunge')) {
            const zT = clamp(e.z, ALT.lowMin, ALT.max), dz = zT - p.z, far = Math.max(1, d - R);
            const zs = Math.sign(dz) * Math.min(Math.abs(dz), Math.max(m.speed * 0.6 * dt, Math.abs(dz) * Math.min(1, step / far)));
            p.z += zs; p.zTarget = p.z; m.went += Math.abs(zs) * 0.5;
            zLeft = Math.abs(zT - p.z);
          }
          if (m.kind === 'dive') {
            // 俯冲：高度跟着水平距离一起收，到头顶时刚好落到它的高度
            const zT = e.z + 20, left = Math.max(1, d - R);
            p.z += (zT - p.z) * Math.min(1, step / left); p.zTarget = p.z;
            const T = this.pTrail; T.push([p.x, p.y, -p.z - 50]); if (T.length > 30) T.shift();
          }
          if (m.kind === 'rush') {
            this.combat.invulnT = Math.max(this.combat.invulnT, 0.08); const T = this.pTrail; T.push([p.x, p.y, -p.z - 50]); if (T.length > 30) T.shift();
            // 两边同时欺身：拼招
            const ai = this.B.get(e)?.ai;
            if (ai?.st === 'rush' && !ai.tg && d < 260 && this.clash.can(e)) { this.clash.start(e, 'rush'); return; }
            // 流派克制：扑进敌方布下的阵地（火墙、剑阵、毒瘴……）被拦下
            const bar = this.foes.barrier(p.x, p.y, null, m.sx, m.sy);
            if (bar) { this.rushBlocked(bar); return; }
            // 兵器的突进是一道直线：途中擦过的人也挨一下（拳的欺身不擦）
            if (this.F.rush.line > 0) this.rushLine(e);
          }
          if (d - step <= R + 1 && zLeft < 60) { this.mv = null; m.then(e); }   // 光带留着，下面慢慢收掉
          else if (m.went >= m.max) { this.mv = null; this.act = null; this.pTrail.length = 0; }
        }
      }
    } else if (this.pTrail.length && !b.air) this.pTrail.splice(0, Math.max(1, Math.ceil(this.pTrail.length * dt * 8)));
    // 自己被打飞
    if (b.air) {
      b.flightT += dt;
      this.stepMove(null, b, dt);
      const r = vertical(b, dt);
      if (r) this.landed(null, b, r);
      if (this.pSubT > 0 || !b.air) return;   // 砸进水里沉下去了；坠地嵌进坑里（meteorLand 已经放下来了）
      this.playerLift = b.flier ? 0 : b.z;
      const T = this.pTrail; T.push([p.x, p.y, -p.z - b.z - 50]); if (T.length > BX.trailMax) T.shift();
      this.plow(p.x, p.y, b, dt);
      if (settled(b) || b.flightT > 5) { b.air = false; b.slam = false; b.vx = b.vy = b.vz = 0; b.z = 0; this.playerLift = 0; b.staggerT = 0.3; this.pTrail.length = 0; }
    } else if (this.aloft) this.aloftTick(dt);
    else if (!this.clash.st) this.playerLift = 0;
    if (this.standable(null, p.x, p.y) && !b.air) { b.safeX = p.x; b.safeY = p.y; }
  }
  /**
   * r7：没御剑、瞬移到上挑起来的人头顶——人悬在半空砸完这一下，悬一小会儿再落回地上（轻轻落地，不算摔：不起坑、不伤自己）。
   * 这时候祭起了遁光，就接成御剑（高度照留）。
   */
  private aloftTick(dt: number) {
    const A = this.aloft!, g = this.g, p = g.player;
    if (g.isFlying) { p.z = p.zTarget = Math.max(p.z, A.z); this.aloft = null; this.playerLift = 0; return; }
    if (A.hold > 0) A.hold -= dt;
    else { A.vz = Math.max(-1500, A.vz - 2600 * dt); A.z += A.vz * dt; }
    if (A.z <= 0) {
      this.aloft = null; this.playerLift = 0;
      this.combat.fxq.push({ k: 'crater', x: p.x, y: p.y, power: 1, r: 70, dir: 0, kind: 'blink' });
      audio.sfx('land', p.x, p.y);
      return;
    }
    this.playerLift = A.z;
  }
  /** 主角此刻悬在半空（瞬移到上挑起来的人头顶、还没落回地面） */
  get aloftZ(): number { return this.aloft?.z ?? 0; }
  /** 主角欺身撞上敌方的阵地：冲刺中断、吃伤害、短硬直 */
  private rushBlocked(bar: { dmg: number; realm: number; color: string; src?: Enemy; x: number; y: number }) {
    const p = this.g.player;
    this.mv = null; this.act = null; this.pTrail.length = 0; this.combat.invulnT = 0;
    this.hurtPlayer(bar.dmg, bar.realm, bar.x, bar.y, bar.src, 'blocked');
    this.pb.staggerT = Math.max(this.pb.staggerT, 0.55);
    this.blockFx(p.x, p.y, p.z, bar.color);
    this.g.juice(0.03, 0.35);
  }
  /** 主角此刻被近战占住（不能走动）：欺身中、被打飞、顿帧、出手后的定身、破防硬直、前摇、拼招、沉在水里 */
  get holdsPlayer(): boolean { const b = this.pb; return !!this.mv || b.air || b.freezeT > 0 || this.recT > 0 || b.staggerT > 0 || !!this.wind || !!this.clash.st || this.pSubT > 0 || !!this.pMove; }
  /** 人物动作覆盖（game.ts 地面与飞行都问它） */
  action(): Action | null {
    if (this.clash.st) return this.heavyAct;
    if (this.pSubT > 0) return 'hit';
    if (this.pb.air) return 'tumble';
    if (this.mv) return this.wk === 'fist' ? 'rush' : this.wMoves.rush;
    if (this.pMove && this.act) return this.act;
    if (this.pb.staggerT > 0) return 'hit';
    return this.act;
  }
  /** 人物动画的时间倍率：顿帧时定格；拼招时几乎定住（拳对拳顶着发颤） */
  get animK(): number { return this.pb.freezeT > 0 ? 0 : this.clash.st && this.clash.st.phase !== 'result' ? 0.15 : 1; }

  // ------------------------------------------------------------ 出手
  /** 够得着的距离：对方体型越大越远 */
  private reachTo(e: Enemy) { return this.F.reach + (e.def.kind === 'human' ? 0 : 16 * (e.def.look?.size ?? 1)); }
  /** 高度够不够得着：地上 / 低空差两百二以内；r7：御剑时高低都算（欺身、垫步会连高度一起追过去） */
  private zOk(e: Enemy) { const dz = Math.abs(this.g.player.z + this.playerLift - e.z); return dz < 220 || (this.g.isFlying && dz < ALT.max + 100); }
  /** 御剑时和对手的高度差大到要先扑过去（不然就是隔着几百高度出拳） */
  private zFar(e: Enemy) { return this.g.isFlying && Math.abs(this.g.player.z - clamp(e.z, ALT.lowMin, ALT.max)) > 90; }
  /** 近身的目标：锁定的优先，否则面前最近的 */
  private target(R: number): Enemy | null {
    const c = this.combat, p = this.g.player;
    const L = c.lock;
    if (L && !L.dead && !(L.hideT > 0) && Math.hypot(L.x - p.x, L.y - p.y) <= R && this.zOk(L)) return L;
    let best: Enemy | null = null, bd = R;
    for (const e of c.enemies) {
      if (e.dead || e.hideT > 0 || (e.spar && !e.aggro) || !this.zOk(e)) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  /** 瞄准方向：鼠标 → 摇杆 → 方向键 → 面朝 */
  aimDir(): { x: number; y: number } {
    const g = this.g, p = g.player, M = g.input.mouse;
    if (M.active && g.time - M.t < 6) { const dx = M.x - p.x, dy = M.y - p.y, d = Math.hypot(dx, dy); if (d > 40) return { x: dx / d, y: dy / d }; }
    let mx = g.input.joy.x, my = g.input.joy.y;
    const k = g.input.keys;
    if (Math.hypot(mx, my) < 0.3) { mx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0); my = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0); }
    if (mx || my) {
      if (g.renderer?.hd && g.camYaw) { const c = Math.cos(g.camYaw), s = Math.sin(g.camYaw); const wx = mx * c - my * s, wy = mx * s + my * c; mx = wx; my = wy; }
      const d = Math.hypot(mx, my); return { x: mx / d, y: my / d };
    }
    const yaw = p.st.yaw; return { x: Math.sin(yaw), y: Math.cos(yaw) };
  }
  private canFight(): boolean {
    const g = this.g;
    if (g.hero.dead || g.halted || g.xukong.active || g.inCave) return false;
    if (!this.combat.canAct) return false;
    return true;
  }
  private gate(realm: number, what: string): boolean {
    if (this.g.hero.realm >= realm) return true;
    this.hint(`${what}要到${REALMS[realm].name}期才使得出来。`); return false;
  }
  private spend(mp: number): boolean {
    const h = this.g.hero;
    if (h.mp < mp - 1e-6) { this.hint('灵力不足。'); return false; }
    h.mp -= mp; this.combat.combatT = 0; this.combat.landT = 0; return true;   // 第六轮返工：近战出手就不再有落地保护
  }
  /** 提示：同一句两息半内只说一次（空格连按时不刷屏） */
  private hintT = new Map<string, number>();
  private hint(msg: string) { const t = this.g.time; if ((this.hintT.get(msg) ?? -99) > t - 2.5) return; this.hintT.set(msg, t); this.g.toast(msg, 'info'); }
  private setCd(id: string, t: number) { this.combat.cds.set(id, t); this.combat.cdMax.set(id, t); }
  private standUp() { const g = this.g; if (g.player.sitting) g.stand(); g.gathering = null; g.destination = null; }
  /**
   * 重击把人轰向哪边：触屏定向拖出来的方向 → 鼠标（电脑上刚动过）：从对手指向鼠标落点（r7：把鼠标放在礁石上，他就撞礁石；
   * 鼠标就压在他身上时退回「从你指向鼠标」）→ 摇杆 / 方向键（推着的）→ 从你指向对手（把人推开）。
   * 手机上不推摇杆时原先按面朝打，容易打歪；现在朝锁定的目标打。
   */
  launchDir(e: Enemy): { x: number; y: number } {
    const g = this.g, p = g.player;
    const A = this.aim; if (A?.src === 'touch') { const w = this.touchVec(A.jx, A.jy); if (w) return w; }
    const m = this.mouseAt();
    if (m) {
      let dx = m.x - e.x, dy = m.y - e.y, d = Math.hypot(dx, dy);
      if (d > 40) return { x: dx / d, y: dy / d };
      dx = m.x - p.x; dy = m.y - p.y; d = Math.hypot(dx, dy);
      if (d > 40) return { x: dx / d, y: dy / d };
    }
    const pushed = Math.hypot(g.input.joy.x, g.input.joy.y) >= 0.3 || ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].some((k) => g.input.keys.has(k));
    if (pushed) return this.aimDir();
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
    if (d > 1) return { x: dx / d, y: dy / d };
    return this.aimDir();
  }
  /**
   * 鼠标此刻指着的地面点（电脑上、六息内动过鼠标才算）：有屏幕坐标就按这一帧的镜头重新投到地面上
   * （镜头在跟着两个人走、鼠标没动时，指着的还是屏幕上那一处），没有（测试、脚本直接写世界坐标）就用记下的世界坐标。
   */
  mouseAt(): { x: number; y: number } | null {
    const g = this.g, M = g.input.mouse as { x: number; y: number; t: number; active: boolean; sx?: number; sy?: number };
    if (IS_TOUCH || !M.active || g.time - M.t > 6) return null;
    if (M.sx !== undefined && M.sy !== undefined && M.sx === M.sx && M.sy === M.sy) {
      try { const w = g.screenToWorld(M.sx, M.sy); if (w && Number.isFinite(w.x) && Number.isFinite(w.y)) return w; } catch { /* 镜头还没好 */ }
    }
    return { x: M.x, y: M.y };
  }
  /** 触屏小摇杆拖出来的屏幕方向 → 世界方向（HD2D 转过镜头的照着转）；拖得太短算没拖 */
  private touchVec(jx: number, jy: number): { x: number; y: number } | null {
    if (Math.hypot(jx, jy) < 0.25) return null;
    const g = this.g; let mx = jx, my = jy;
    if (g.renderer?.hd && g.camYaw) { const c = Math.cos(g.camYaw), s = Math.sin(g.camYaw); const wx = mx * c - my * s, wy = mx * s + my * c; mx = wx; my = wy; }
    const d = Math.hypot(mx, my) || 1; return { x: mx / d, y: my / d };
  }
  /**
   * r7：重击往哪个竖直方向打——按住上升键（御剑时就是闪避键、默认空格；手机「升」）＝上挑，按住下降键（「降」）＝往下砸，
   * 都不按＝平着轰飞；对手是被上挑打上天、正在你脚下的（你追到了他头顶），不按就是往下砸。
   */
  vertMode(e: Enemy | null, pursuit = false): Vert {
    const g = this.g, k = g.input.keys, A = this.aim;
    if (A && A.vt) return A.vt;
    // 'dodge'：闪避键正按着（地上没在定向时，game 不把它记成 ascend）；缩地追击本身就是按这个键出的，那一下不算
    if (k.has('ascend') || (!pursuit && k.has('dodge')) || g.input.climb > 0) return 1;
    if (k.has('descend') || g.input.climb < 0) return -1;
    if (e) { const b = this.B.get(e); if (b?.air && b.up && e.z < this.g.player.z + this.playerLift - 20) return -1; }
    return 0;
  }

  /**
   * r7 重击定向的预演（画面用，每帧最多算一次；不取任何随机数、不改任何状态）：
   *   · 按住右键 / 长按「崩」进了放慢：完整的一份——这一下打中的人沿什么路飞、撞上哪些石头 / 树 / 人 / 墙、停在哪；
   *   · 平时：架势里锁定着对手、他的罡气已破（能被轰飞）、离你不远——只给方向和上下（对手脚下一根淡箭头）。
   */
  aimView(): AimView | null {
    const t = this.g.time;
    if (this.aimCache.f === t) return this.aimCache.v;
    const v = this.aimBuild();
    this.aimCache.f = t; this.aimCache.v = v;
    return v;
  }
  private aimBuild(): AimView | null {
    const g = this.g, c = this.combat, p = g.player;
    if (!this.stance || g.hero.dead || this.pb.air || this.clash.st || this.pSubT > 0 || g.xukong.active) return null;
    const full = this.aimSlow;
    const L = c.lock, near = (q: Enemy | null) => !!q && !q.dead && !(q.hideT > 0) && Math.hypot(q.x - p.x, q.y - p.y) <= BX.hintR;
    let e: Enemy | null;
    if (full) e = this.target(this.F.lunge) ?? (near(L) ? L : null);
    else {
      if (!near(L) || this.mv) return null;
      const lb = this.B.get(L!);
      if (!lb || lb.breakT <= 0 || lb.armorT > 0 || lb.air || lb.subT > 0 || !this.launchable(L!)) return null;
      e = L;
    }
    if (!e) return null;
    const b = this.B.get(e);
    const ok = this.launchable(e) && !(b && b.armorT > 0) && ((b?.breakT ?? 0) > 0 || (b ? b.poise : this.poiseMaxOf(e)) <= this.F.heavy.poise * this.gapK(e) + 1e-6);
    const a = this.launchDir(e);
    let v = this.vertMode(e);
    if (v !== 1 && g.isFlying && this.diveTarget() === e) v = -1;   // 御剑对下方的人：俯冲砸击，破了罡就砸下去
    const A = this.aim, left = A && full ? clamp(1 - (A.t - BX.aimHold) / BX.aimMax, 0, 1) : 1;
    const z0 = b?.air ? b.z : e.flyH + e.lift;
    const out: AimView = { e, v, ok, full, ux: a.x, uy: a.y, pts: [[e.x, e.y, z0]], land: null, hits: [], left };
    if (!full) return out;
    if (!ok) { out.pts.push([e.x + a.x * 260, e.y + a.y * 213, z0]); return out; }
    if (v === -1) {
      // 往下砸：空中的直坠到他脚下的地面 / 水面；地上的当场砸进地里（一个大坑）
      const lx = e.x + a.x * 40, ly = e.y + a.y * 33;
      if (z0 > 40) out.pts.push([e.x + a.x * 20, e.y + a.y * 16, z0 * 0.5], [lx, ly, 0]);
      else out.pts.unshift([e.x - a.x * 30, e.y - a.y * 25, 260]);
      out.land = { x: lx, y: ly, water: this.deepWater(lx, ly) };
      return out;
    }
    this.simulate(e, v, a.x, a.y, z0, out);
    return out;
  }
  /** 照 launch / launchUp 的初速把这一下飞行预演一遍（和真的击飞共用 vertical()；撞石头、撞人、撞墙的判法照 stepMove） */
  private simulate(e: Enemy, v: 0 | 1, ux: number, uy: number, z0: number, out: AimView) {
    const g = this.g, s = newBody(), boss = isBoss(e);
    s.z = z0;
    if (v === 1) {
      const H = Math.max(40, Math.min(ALT.max - BX.upRoom, z0 + BX.upRise * (boss ? BX.bossLaunchK * 1.5 : 1)) - z0), sp = BX.upV * (boss ? 0.5 : 1);
      s.vx = ux * sp; s.vy = uy * sp * 0.82; s.vz = Math.sqrt(2 * BX.grav * H); s.hangT = boss ? 0.1 : BX.upHang;
    } else {
      let D = this.launchD(e);
      if (boss) D *= BX.bossLaunchK;
      s.flier = (z0 > 30 || !!e.def.flying) && e.canFly;
      const vz = s.flier ? 300 * 0.15 : 300, sp = speedFor(D, vz, z0, s.flier);
      s.vx = ux * sp; s.vy = uy * sp * 0.82; s.vz = vz;
    }
    const others = this.combat.enemies.filter((o) => o !== e && !o.dead && !(o.hideT > 0) && Math.abs(o.x - e.x) < 3600 && Math.abs(o.y - e.y) < 3000);
    const seenR = new Set<Rock>(), seenU = new Set<Enemy>(), rad = 18 * (e.def.look?.size ?? 1) + 10;
    let x = e.x, y = e.y, stop = false;
    const dt = 1 / 20;
    for (let i = 0; i < 120 && !stop; i++) {
      const dx = s.vx * dt, dy = s.vy * dt, n = Math.max(1, Math.min(24, Math.ceil(Math.hypot(dx, dy) / 60)));
      for (let j = 0; j < n && !stop; j++) {
        const nx = x + dx / n, ny = y + dy / n;
        if (this.blocked(e, x, y, nx, ny, s.z, null)) { out.hits.push({ x: nx, y: ny, r: 70, k: 'wall' }); stop = true; break; }
        if (this.brk.n && s.z < 200) for (const rk of this.brk.near(nx, ny, rad + 100)) {
          if (rk.dead || seenR.has(rk) || s.z > rk.h * 0.9) continue;
          const qx = nx - rk.x, qy = (ny - rk.y) * 1.4;
          if (qx * qx + qy * qy >= (rk.r + rad) * (rk.r + rad)) continue;
          seenR.add(rk); out.hits.push({ x: rk.x, y: rk.y, r: rk.r, k: 'rock' });
          if (Math.hypot(s.vx, s.vy) < BK.smashV) { stop = true; break; }
          const k = rk.kind === 'boulder' ? 0.58 : rk.kind === 'reef' ? 0.66 : 0.78;
          s.vx *= k; s.vy *= k; if (!s.grounded) s.vz = Math.max(s.vz, 120);
        }
        if (stop) break;
        x = nx; y = ny;
        if (Math.hypot(s.vx, s.vy) > 500) for (const o of others) {
          if (seenU.has(o) || Math.abs(o.x - x) > 60 || Math.abs(o.y - y) > 46 || Math.abs(o.z - s.z) > 110) continue;
          seenU.add(o); out.hits.push({ x: o.x, y: o.y, r: 40 * (o.def.look?.size ?? 1), k: 'unit' });
          s.vx *= 0.55; s.vy *= 0.55; break;
        }
      }
      if (stop) break;
      const r = vertical(s, dt);
      out.pts.push([x, y, s.z]);
      if (r && this.deepWater(x, y)) { const vz0 = r === 1 ? s.vz / 0.32 : 0; if (!(r === 1 && vz0 > -900 && Math.hypot(s.vx, s.vy) > 700)) break; }   // 落进水里（打水漂的接着飞）
      if (settled(s)) break;
    }
    const last = out.pts[out.pts.length - 1];
    if (last[0] !== x || last[1] !== y) out.pts.push([x, y, s.z]);
    out.land = { x, y, water: this.deepWater(x, y) };
  }
  private chargeFx(power: number, r: number) { const p = this.g.player; this.combat.fxq.push({ k: 'bxcharge', anchor: { x: p.x, y: p.y, offsetY: -p.z - this.playerLift }, x: p.x, y: p.y - 60, color: power >= 2 ? '255,170,80' : '255,220,150', power, r }); }
  /** 轰飞多远（平地上）：境界差、近战加成、兵器的轰飞系数（拳 1） */
  private launchD(e: Enemy): number {
    const gap = this.g.hero.realm - e.realm, K = this.F.launchK;
    return clamp(BX.launchBase * (1 + 0.18 * gap) * (0.85 + 0.15 * this.meleeMul) * K, BX.launchMin * K, BX.launchMax * K);
  }

  /** 轻击：连段第几下由窗口决定，最后一下是收式（挑起，有一点前摇） */
  light() {
    if (!this.canFight()) return;
    if (this.holdsPlayer || this.gapT > 1e-6) { if (!this.pb.air && this.pSubT <= 0 && !this.clash.st) this.queued = { k: 'light', slam: false, t: 0.25 }; return; }
    this.standUp();
    const F = this.F;
    const i = this.comboT > 0 ? (this.comboI + 1) % F.light.length : 0, S = F.light[i];
    this.comboI = i; this.comboT = F.win; this.gapT = F.gap;
    if (this.wk !== 'fist') { this.wLight(i); return; }
    if (S.fin) {
      // 收式：拧身蓄一下劲（前摇），再出上挑掌
      this.swing('punch', F.rec + F.finRec + S.at);
      this.wind = { t: S.at, heavy: false, run: () => this.lightGo(i) };
      this.chargeFx(1, S.at);
      return;
    }
    this.swing('punch', F.rec);
    this.lightGo(i);
  }
  private lightGo(i: number) {
    const F = this.F, e = this.target(F.lunge), p = this.g.player;
    if (!e) { this.whiff(false); return; }
    const go = (t: Enemy) => this.lightHit(t, i);
    if (Math.hypot(e.x - p.x, e.y - p.y) > this.reachTo(e) || this.zFar(e)) this.mv = { kind: 'lunge', e, speed: F.lungeSpeed, max: F.lunge + (this.zFar(e) ? 500 : 0), went: 0, then: go, sx: p.x, sy: p.y };
    else go(e);
  }
  private lightHit(e: Enemy, i: number) {
    const F = this.F, S = F.light[i];
    const g = this.g, p = g.player, atk = this.patk, fin = !!S.fin;
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
    p.st.faceToward(dx, dy, false);
    p.st.restart('punch'); this.act = 'punch'; this.actT = 0.3;
    if (!this.dealTo(e, atk * S.dmg, fin ? 'finisher' : 'light', p.x, p.y)) { this.recT = F.rec; return; }
    const b = this.body(e);
    this.poiseDmg(b, S.poise * this.gapK(e), e);
    // 拳风：命中处的爆点 + 一圈拳风冲击波（第几下越往后越重）
    this.combat.fxq.push({ k: 'bxhit', anchor: { x: e.x, y: e.y, offsetY: -e.z }, x: e.x - dx / d * 18, y: e.y - this.combat.hitY(e), color: fin ? '255,210,120' : '255,236,200', power: fin ? 2.2 : 1 + i * 0.25, dir: Math.atan2(dy, dx), r: this.comboN });
    audio.dir.hit(e.x, e.y, '体', fin ? 2 : 1);
    if (b.armorT > 0 && !fin) return;
    b.freezeT = Math.max(b.freezeT, S.freeze);
    this.pb.freezeT = Math.max(this.pb.freezeT, S.freeze);
    b.staggerT = Math.max(b.staggerT, S.stagger * (isBoss(e) ? 0.4 : 1));
    if (fin && b.breakT > 0 && b.armorT <= 0) {
      // 收式：挑起（上挑掌）——全局顿帧和慢放只给这一下
      if (this.launch(e, dx, dy, F.finLaunch.D, F.finLaunch.vz, 'p', g.hero.realm, atk, false)) { this.flung = e; this.combat.fxq.push({ k: 'launch', anchor: { x: e.x, y: e.y, offsetY: -e.z }, x: e.x, y: e.y - 60, color: '255,214,140', power: 2, dir: -Math.PI / 2 }); g.juice(0.06, 0.32); g.slowmo(0.12); this.combo(e, '上挑'); }
    }
  }
  private gapK(e: Enemy) { return clamp(Math.pow(1.5, this.g.hero.realm - e.realm), 0.3, 2.5) * (1 + (this.meleeMul - 1) * 0.5); }
  /** 打空：一阵拳风扑了个空，收不住势（硬直） */
  private whiff(heavy: boolean) {
    const g = this.g, p = g.player, a = this.aimDir();
    this.combat.fxq.push({ k: 'bxhit', x: p.x + a.x * 60, y: p.y - 60 + a.y * 30, color: '230,230,230', power: 0.4, dir: Math.atan2(a.y, a.x) });
    this.recT = Math.max(this.recT, heavy ? BX.whiffHeavy : BX.whiffLight);
    audio.sfx('whoosh');
  }
  private swing(a: Action, rec: number) { this.act = a; this.actT = Math.max(rec + 0.15, 0.28); this.recT = Math.max(this.recT, rec); }

  /** 重击（崩山）：前摇蓄力，罡气已破就沿瞄准方向轰飞；slam = 按住下降键往下砸；在空中对低处的目标是俯冲砸击 */
  heavy(slam = false, up = false) {
    if (!this.canFight()) return;
    if (this.holdsPlayer) { if (!this.pb.air && this.pSubT <= 0 && !this.clash.st) this.queued = { k: 'heavy', slam, up, t: 0.3 }; return; }
    if ((this.combat.cds.get('bx_bengshan') ?? 0) > 0) return;
    this.standUp();
    this.syncWeapon();
    const F = this.F;
    this.setCd('bx_bengshan', F.heavy.cd);
    const inCombo = this.comboT > 0 && this.comboI >= 1;   // 枪：连段中按重击是横扫
    this.comboI = 0; this.comboT = 0;
    const v: Vert = slam ? -1 : up ? 1 : 0;
    // P6 跃击：御器在空中，对下方的目标按重击——人先俯冲到它头顶再砸（r7：选了上挑就不俯冲，照常挑它）
    const dv = v === 1 ? null : this.diveTarget();
    if (dv) { this.startDive(dv); return; }
    if (this.wk !== 'fist') { this.wHeavy(v, inCombo); return; }
    this.swing('smash', F.heavy.rec + F.heavy.at);
    this.g.player.st.restart('smash');
    this.wind = { t: F.heavy.at, heavy: true, run: () => this.heavyGo(v) };
    this.chargeFx(2, F.heavy.at);
  }
  private heavyGo(v: Vert) {
    const F = this.F, e = this.target(F.lunge), p = this.g.player;
    if (!e) { this.whiff(true); this.shotDir = null; return; }
    const go = (t: Enemy) => this.heavyHit(t, v, false);
    if (Math.hypot(e.x - p.x, e.y - p.y) > this.reachTo(e) || this.zFar(e)) this.mv = { kind: 'lunge', e, speed: F.lungeSpeed, max: F.lunge + (this.zFar(e) ? 500 : 0), went: 0, then: go, sx: p.x, sy: p.y };
    else go(e);
  }
  /**
   * 重击落到身上；v = 上挑 / 平飞 / 往下砸；forced = 缩地追击截住时的那一下（对方罡气还在破罡窗口里，必飞）。
   * H：这一下用哪份重击手感（默认手里兵器的重击；枪的横扫传 sweep）；flat = 横扫（不带枪的上挑分量）
   */
  private heavyHit(e: Enemy, v: Vert, forced: boolean, H: HeavyFeel = this.F.heavy, flat = false) {
    const g = this.g, p = g.player, atk = this.patk;
    // 枪：重击默认是「挑」——不按上升键也挑起一截（upLift），按了挑得更高（upBoost）；往下砸、横扫、缩地截住的那一下不挑
    let riseK = 1;
    if (!forced && !flat && v !== -1 && this.F.upLift > 0) { riseK = v === 1 ? this.F.upBoost : this.F.upLift; v = 1; }
    const slam = v === -1;
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
    p.st.faceToward(dx, dy, false);
    const shot = this.shotDir; this.shotDir = null;
    if (!this.dealTo(e, atk * (slam ? H.slamDmg : H.dmg), slam ? 'slam' : forced ? 'pursuit' : 'heavy', p.x, p.y)) return;
    const b = this.body(e);
    this.poiseDmg(b, H.poise * this.gapK(e), e);
    b.freezeT = Math.max(b.freezeT, H.freeze); this.pb.freezeT = Math.max(this.pb.freezeT, H.freeze);
    if (this.wk === 'fist') { this.combat.fxq.push({ k: 'bxhit', anchor: { x: e.x, y: e.y, offsetY: -e.z }, x: e.x - dx / d * 20, y: e.y - this.combat.hitY(e), color: '255,190,110', power: 3, dir: Math.atan2(dy, dx), r: this.comboN }); audio.dir.hit(e.x, e.y, '体', 3); }
    else this.wHitFx(e, dx / d, dy / d, 3);
    if (b.breakT <= 0 || b.armorT > 0) { b.staggerT = Math.max(b.staggerT, isBoss(e) ? 0.15 : 0.4); g.juice(0, 0.18); return; }
    if (slam) { this.slam(e, b, atk); return; }
    // 轰飞：从对手指向鼠标落点（把鼠标放在礁石上，他就撞礁石）；手机拖了小摇杆按拖的方向；都没有就朝对手那边（把人推开）
    const a = shot ?? this.launchDir(e);
    if (v === 1) {
      // r7 上挑：打上天，到顶滞空一会儿再落下（追击是瞬移到他头顶、默认往下砸）
      if (this.launchUp(e, a.x, a.y, g.hero.realm, atk, forced, riseK)) {
        this.flung = e;
        this.combat.fxq.push({ k: 'launch', anchor: { x: e.x, y: e.y, offsetY: -e.z }, x: e.x, y: e.y - 60, color: '170,225,255', power: 3, dir: -Math.PI / 2, r: 1 });
        g.juice(0.07, 0.42); g.slowmo(0.14); g.aberrKick = Math.max(g.aberrKick, 0.5); this.punchCam(0.8);
        audio.sfx('boom', e.x, e.y);
        this.combo(e, forced ? '缩地·挑天' : FIN_NAME[this.wk].up);
      }
      return;
    }
    const D = this.launchD(e);
    if (this.launch(e, a.x, a.y, D, 300, 'p', g.hero.realm, atk, forced)) {
      this.flung = e;
      // 轰出时的一道贯穿光柱（r = 1）、爆闪、两层气浪
      this.combat.fxq.push({ k: 'launch', anchor: { x: e.x, y: e.y, offsetY: -e.z }, x: e.x, y: e.y - 60, color: '255,200,120', power: 3, dir: Math.atan2(a.y, a.x), r: 1 });
      g.juice(0.07, 0.42); g.slowmo(0.14); g.aberrKick = Math.max(g.aberrKick, 0.55); this.punchCam(0.9);   // 第三轮：重击轰飞——镜头猛推再回弹、短促色散（全屏的径向扭曲在 brawlgl 的 launch 里）
      audio.sfx('boom', e.x, e.y);
      this.combo(e, forced ? '缩地·' + FIN_NAME[this.wk].heavy : flat ? FIN_NAME[this.wk].sweep : FIN_NAME[this.wk].heavy);
    }
  }
  /** 往下砸：空中的直接砸向地面 / 水面；地上的当场砸进地里（起坑、弹起一点、硬直更久）；水里的砸沉下去 */
  private slam(e: Enemy, b: Body, atk: number) {
    const g = this.g, a = this.launchDir(e);
    // E3：虚空斗法里往下砸、脚下够得着一界——一拳把人打进下界（流星、穿界壁、你自己俯冲追下去）
    if (g.xukong.fight.on && g.xukong.fall.canDrop(e)) { g.xukong.fall.punch(e); return; }
    // 御剑高度（一百二以上）把人往下砸：和虚空坠界同一套——带火尾的流星直坠下去，落地大坑 / 冲天水柱，人嵌在坑里 / 沉进海里；
    // 你按一下追击就俯冲追下去（见 chaseTarget / startChase）。这是日常任何一场战斗都用得上的那一版。
    if (e.z > 120 && this.launchable(e)) {
      const z0 = e.z;
      this.meteorIn(e, 'p', z0, -1900 - Math.min(900, z0 * 1.5), false);
      const bb = this.body(e); bb.vx = a.x * 260; bb.vy = a.y * 260 * 0.82;
      this.slamFoe = e; this.slamAt = g.time;
      this.combat.fxq.push({ k: 'voidpunch', anchor: { x: e.x, y: e.y, offsetY: -z0 }, x: e.x, y: e.y - 60, color: '255,170,90', power: 2.4 });
      g.juice(0.08, 0.5); g.slowmo(0.14); g.aberrKick = Math.max(g.aberrKick, 0.6); this.punchCam(1);
      audio.sfx('boom', e.x, e.y);
      this.combo(e, this.deepWater(e.x, e.y) ? '坠海' : '坠星');
      return;
    }
    if (e.z > 40) {
      const z0 = e.z;
      this.slamFoe = e; this.slamAt = g.time;
      if (this.launch(e, a.x, a.y, 260, -2400, 'p', g.hero.realm, atk, true)) { const bb = this.body(e); bb.flier = false; bb.slam = true; bb.dropH = z0; this.flung = e; }
      this.combat.fxq.push({ k: 'launch', anchor: { x: e.x, y: e.y, offsetY: -e.z }, x: e.x, y: e.y - 60, color: '255,170,90', power: 3, dir: Math.PI / 2, r: 1 });
      g.juice(0.07, 0.4); g.slowmo(0.12);
      this.combo(e, this.deepWater(e.x, e.y) ? '坠海' : '坠星');
      return;
    }
    if (this.deepWater(e.x, e.y)) {
      this.combat.fxq.push({ k: 'pillar', x: e.x, y: e.y, power: 2.8, r: 220 });
      this.dealTo(e, atk * 0.6, 'slam-water', e.x, e.y - 1);
      this.shove(e.x, e.y, 260, e);
      if (this.launchable(e)) this.submerge(e, b, e.x, e.y, BX.subEnemy);
      g.juice(0.08, 0.6); g.slowmo(0.12); g.aberrKick = Math.max(g.aberrKick, 0.4);
      audio.sfx('boom', e.x, e.y);
      this.combo(e, '砸海');
      return;
    }
    this.combat.fxq.push({ k: 'slam', x: e.x, y: e.y, power: 3, r: 220, dir: Math.atan2(a.y, a.x) });
    this.wreckAt(e.x, e.y, 220, 2.8, 'p');
    this.dealTo(e, atk * 0.6, 'slam-ground', e.x, e.y - 1);
    this.shove(e.x, e.y, 260, e);
    b.staggerT = Math.max(b.staggerT, isBoss(e) ? 0.3 : 0.9);
    if (this.launchable(e)) this.launch(e, a.x, a.y, 120, 520, 'p', g.hero.realm, atk, true);
    g.juice(0.08, 0.55); g.slowmo(0.12); g.aberrKick = Math.max(g.aberrKick, 0.4);
    audio.sfx('boom', e.x, e.y);
    this.combo(e, '崩山·砸地');
  }

  // ------------------------------------------------------------ 兵器（剑 / 重兵 / 长枪）：照兵器谱出招，按刃轨迹判谁中了
  /** 突进途中擦过的人（一次突进每人只挨一下） */
  private lineHit: Set<Enemy> | null = null;
  /** 刃轨迹换到地图坐标后的暂存（每次出手只算一次） */
  private wSegs: Seg[] = [];
  /** 立刻播一个动作；兵器动作跳过「蓄」直接从出手那一刻起（缩地截住、俯冲砸到、突进扑到时伤害当场就结算，刀光要和它对上） */
  private playNow(a: Action, actT: number) {
    const st = this.g.player.st;
    st.restart(a); this.act = a;
    if (isWeaponAction(a)) { st.actionT = ACTION_HIT[a][0]; this.actT = ACTION_DUR[a] - ACTION_HIT[a][0]; this.armHold = 3; } else this.actT = actT;
  }
  /** 兵器的金属色（'r,g,b'；刀光、命中的火花跟着它，高阶更亮）；本命飞剑用那口剑自己的光色 */
  metalRGB(kind: WeaponKind = this.wk, tier = this.wt, override: string | undefined = kind === this.wk && tier === this.wt && this.wFrom === 'bond' ? this.g.player.look.weapon?.color : undefined): string {
    const hex = override ?? (kind === 'fist' ? '#ffe6b0' : weaponTier(kind, tier)?.metal ?? '#d8dce0');
    const n = parseInt(hex.slice(1), 16), k = 1 + (weaponTier(kind, tier)?.glow ?? 0) * 0.35;
    const ch = (v: number) => Math.min(255, Math.round(v * k));
    return `${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)}`;
  }
  /** 轻击（兵器）：要扑过去的先垫步，到了跟前起手——动作播到出手那一刻（兵器谱的 at）才判刃扫到了谁 */
  private wLight(i: number) {
    const F = this.F, S = F.light[i], L = this.wMoves.light, a = L[i % L.length];
    const e = this.target(F.lunge), p = this.g.player;
    const go = (t: Enemy | null) => this.wSwing(a, S.at, t, false, () => this.wLightStrike(i, a, t));
    if (e && (Math.hypot(e.x - p.x, e.y - p.y) > this.reachTo(e) || this.zFar(e))) this.mv = { kind: 'lunge', e, speed: F.lungeSpeed, max: F.lunge + (this.zFar(e) ? 500 : 0), went: 0, then: go, sx: p.x, sy: p.y };
    else go(e);
    if (S.fin) this.chargeFx(1, S.at);
  }
  /** 起手：转向对手（没有对手就转向瞄的方向）、播兵器动作、到出手那一刻结算；重兵整段有霸体 */
  private wSwing(a: Action, at: number, e: Enemy | null, heavy: boolean, strike: () => void) {
    const p = this.g.player;
    if (e) p.st.faceToward(e.x - p.x, e.y - p.y, false); else { const d = this.aimDir(); p.st.faceToward(d.x, d.y, false); }
    p.st.yaw = p.st.targetYaw;   // 刀光、判定都按这一刀的朝向（人物转身本来要几帧，这里一下转过去）
    p.st.restart(a); this.act = a; this.actT = isWeaponAction(a) ? ACTION_DUR[a] : 0.4;
    this.wind = { t: at, heavy, run: strike };
    if (this.F.armor) this.pb.armorT = Math.max(this.pb.armorT, at + 0.03);
    this.armHold = 3;
    if (this.wk !== 'fist') audio.sfx(SWING_SFX[this.wk], p.x, p.y);
  }
  private wLightStrike(i: number, a: Action, e0: Enemy | null) {
    const F = this.F, S = F.light[i];
    this.recT = Math.max(this.recT, F.rec + (S.fin ? F.finRec : 0));
    const hits = this.wTargets(a, S.arc ?? 0, S.pierce ?? 0, S.hits ?? 1, e0);
    if (!hits.length) { this.whiff(false); return; }
    for (const t of hits) this.wLightHit(t, i);
  }
  /** 兵器轻击落到一个人身上（伤害、削罡、顿帧、硬直；收式在破罡时挑起） */
  private wLightHit(e: Enemy, i: number) {
    const F = this.F, S = F.light[i], g = this.g, p = g.player, atk = this.patk, fin = !!S.fin;
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (!this.dealTo(e, atk * S.dmg, fin ? 'finisher' : 'light', p.x, p.y)) return;
    const b = this.body(e);
    this.poiseDmg(b, S.poise * this.gapK(e), e);
    this.wHitFx(e, dx / d, dy / d, fin ? 2 : 1 + i * 0.2);
    if (b.armorT > 0 && !fin) return;
    b.freezeT = Math.max(b.freezeT, S.freeze);
    this.pb.freezeT = Math.max(this.pb.freezeT, S.freeze);
    b.staggerT = Math.max(b.staggerT, S.stagger * (isBoss(e) ? 0.4 : 1));
    if (fin && b.breakT > 0 && b.armorT <= 0 && this.launch(e, dx, dy, F.finLaunch.D * F.launchK, F.finLaunch.vz, 'p', g.hero.realm, atk, false)) {
      this.flung = e;
      this.combat.fxq.push({ k: 'launch', anchor: { x: e.x, y: e.y, offsetY: -e.z }, x: e.x, y: e.y - 60, color: this.metalRGB(), power: 2, dir: -Math.PI / 2 });
      g.juice(0.06, 0.32); g.slowmo(0.12); this.combo(e, FIN_NAME[this.wk].light);
    }
  }
  /** 兵器命中的画面和声音：沿刀路的一记斩痕火花（brawlgl 的 bxwhit），声音分剑 / 重兵 / 枪 */
  private wHitFx(e: Enemy, ux: number, uy: number, power: number) {
    const c = this.combat;
    c.fxq.push({ k: 'bxwhit', anchor: { x: e.x, y: e.y, offsetY: -e.z }, x: e.x - ux * 16, y: e.y - c.hitY(e), color: this.metalRGB(), power, dir: Math.atan2(uy, ux), kind: this.wk, r: this.comboN });
    if (this.wk !== 'fist') audio.sfx(HIT_SFX[this.wk], e.x, e.y);
  }
  /**
   * 这一刀砍中了谁：刃轨迹（出手时段里刃从握点到刃尖扫过的范围，按兵器谱 bladeExt 往外放）扫到的、
   * 横扫弧（arc）里够得着的、直刺那条线上（pierce）的；扑向的那一个只要在正前方够得着就算。最近的在前，最多 maxHits 个。
   * 只在出手那一刻算一次（不是每帧扫所有人）。
   */
  private wTargets(a: Action, arc: number, pierce: number, maxHits: number, primary: Enemy | null): Enemy[] {
    const g = this.g, p = g.player, st = p.st, F = this.F;
    const fl = formOfLook(p.look), T = fl ? bladeLocal(fl.kind, fl.form, a) : null;
    const yaw = st.targetYaw, fx = Math.sin(yaw), fy = Math.cos(yaw), pz = p.z + this.playerLift;
    const segs = T ? bladeWorld(T, { x: p.x, y: p.y, yaw, lift: pz, S: PSCALE * (p.look.height ?? 1) }, F.bladeExt, this.wSegs) : null;
    const out: { e: Enemy; d: number }[] = [];
    for (const e of this.combat.enemies) {
      if (e.dead || e.hideT > 0 || (e.spar && !e.aggro) || !this.zOk(e)) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy), reach = this.reachTo(e);
      if (d > reach + pierce + 120) continue;
      const r = 30 + (e.def.kind === 'human' ? 0 : 16 * (e.def.look?.size ?? 1)), along = dx * fx + dy * fy;
      let hit = e === primary && d <= reach + 30 && along >= d * 0.3;
      if (!hit && segs) hit = bladeHits(segs, e.x, e.y, e.z, r);
      if (!hit && arc > 0 && d <= reach + 30) hit = along >= d * Math.cos(arc / 2);
      if (!hit && pierce > 0) hit = along > 0 && along <= reach + pierce && Math.abs(dx * fy - dy * fx) <= r + 26;
      if (hit) out.push({ e, d: e === primary ? -1 : d });
    }
    out.sort((u, v) => u.d - v.d);
    if (out.length > maxHits) out.length = Math.max(1, maxHits);
    return out.map((o) => o.e);
  }
  /** 重击（兵器）：斩 / 抡砸 / 挑；枪在连段中按是横扫。前摇照动作走，到出手那一刻判刃扫到了谁 */
  private wHeavy(v: Vert, inCombo: boolean) {
    const F = this.F, sweep = !!F.sweep && inCombo && v === 0;
    const H = sweep ? F.sweep! : F.heavy, a = this.wMoves.heavy[sweep && this.wMoves.heavy.length > 1 ? 1 : 0];
    if (sweep) this.setCd('bx_bengshan', H.cd);
    const e = this.target(F.lunge), p = this.g.player;
    const go = (t: Enemy | null) => this.wSwing(a, H.at, t, true, () => this.wHeavyStrike(v, H, sweep, a, t));
    if (e && (Math.hypot(e.x - p.x, e.y - p.y) > this.reachTo(e) || this.zFar(e))) this.mv = { kind: 'lunge', e, speed: F.lungeSpeed, max: F.lunge + (this.zFar(e) ? 500 : 0), went: 0, then: go, sx: p.x, sy: p.y };
    else go(e);
    this.chargeFx(2, H.at);
  }
  private wHeavyStrike(v: Vert, H: HeavyFeel, sweep: boolean, a: Action, e0: Enemy | null) {
    const F = this.F, g = this.g, p = g.player;
    this.recT = Math.max(this.recT, H.rec);
    const hits = this.wTargets(a, H.arc, H.pierce ?? 0, H.maxHits, e0);
    const yaw = p.st.targetYaw, fx = Math.sin(yaw), fy = Math.cos(yaw);
    // 剑：斩出一道剑气往前飞（砍没砍中都飞出去；这一斩砍中的人剑气不再打）
    if (F.wave && v !== -1) this.qiWave(p.x + fx * 60, p.y + fy * 60, p.z + this.playerLift + 50, fx, fy, null, this.patk, g.hero.realm, F.wave, hits);
    // 重兵：砸地起一圈震波（上撩的不砸地）
    if (F.quake && v !== 1) this.quake(p.x + fx * 90, p.y + fy * 90, F.quake, null, this.patk, g.hero.realm, hits[0] ?? null);
    if (!hits.length) { this.whiff(true); this.shotDir = null; return; }
    this.heavyHit(hits[0], sweep ? 0 : v, false, H, sweep);
    for (let i = 1; i < hits.length; i++) this.wSideHeavy(hits[i], H);
  }
  /** 横扫 / 穿刺里顺带砍中的（不是瞄着的那一个）：照样伤血削罡、顿一下；罡气已破的被扫飞一段 */
  private wSideHeavy(o: Enemy, H: HeavyFeel) {
    const g = this.g, p = g.player, atk = this.patk, dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (!this.dealTo(o, atk * H.dmg * 0.85, 'heavy', p.x, p.y)) return;
    const b = this.body(o);
    this.poiseDmg(b, H.poise * 0.85 * this.gapK(o), o);
    b.freezeT = Math.max(b.freezeT, H.freeze); b.staggerT = Math.max(b.staggerT, isBoss(o) ? 0.15 : 0.4);
    this.wHitFx(o, dx / d, dy / d, 2);
    if (b.breakT > 0 && b.armorT <= 0) this.launch(o, dx, dy, this.launchD(o) * 0.7, 300, 'p', g.hero.realm, atk, false);
  }
  /** 剑气：从 (x, y) 高 z 处朝 (ux, uy) 飞出去（by = null 是主角斩的，打敌人；by = 某个敌人，打主角） */
  qiWave(x: number, y: number, z: number, ux: number, uy: number, by: Enemy | null, atk: number, realm: number, W: { range: number; speed: number; dmg: number; w: number }, skip: readonly Enemy[] = [], color = by ? this.metalRGB(foeKind(by), by.look?.weapon?.tier ?? 2) : this.metalRGB()) {
    while (this.waves.length >= 6) this.waves.shift();
    this.waves.push({ x, y, z, ux, uy, left: W.range, sp: W.speed, w: W.w, dmg: W.dmg, hit: new Set(skip), by, realm, atk, t: 0, color });
    audio.sfx('wswing_sword', x, y);
  }
  private wavesTick(dt: number) {
    const c = this.combat, g = this.g, p = g.player;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const W = this.waves[i], step = Math.min(W.left, W.sp * dt);
      W.x += W.ux * step; W.y += W.uy * step; W.left -= step; W.t += dt;
      if (W.left <= 0 || (!this.standable(null, W.x, W.y) && !this.deepWater(W.x, W.y) && W.z < 150)) { this.waves.splice(i, 1); continue; }
      const R = W.w * (0.7 + 0.3 * Math.min(1, W.t * 4));
      if (!W.by) {
        for (const e of c.enemies) {
          if (W.hit.has(e) || e.dead || e.hideT > 0 || (e.spar && !e.aggro) || Math.abs(e.z + 50 - W.z) > 150) continue;
          if (Math.abs(e.x - W.x) > R + 40 || Math.abs(e.y - W.y) > R + 40 || Math.hypot(e.x - W.x, e.y - W.y) > R + 20) continue;
          W.hit.add(e);
          if (this.dealTo(e, W.atk * W.dmg, 'qi', W.x - W.ux * 40, W.y - W.uy * 40)) {
            const b = this.body(e); this.poiseDmg(b, 10 * this.gapK(e), e); b.staggerT = Math.max(b.staggerT, isBoss(e) ? 0.1 : 0.25);
            c.fxq.push({ k: 'bxwhit', anchor: { x: e.x, y: e.y, offsetY: -e.z }, x: e.x, y: e.y - c.hitY(e), color: W.color, power: 1.4, dir: Math.atan2(W.uy, W.ux), kind: 'sword' });
          }
        }
      } else if (!W.pHit && !W.by.dead && Math.hypot(p.x - W.x, p.y - W.y) < R + 20 && Math.abs(p.z + this.playerLift + 50 - W.z) < 150) {
        W.pHit = true;
        if (this.hurtPlayer(W.atk * W.dmg, W.realm, W.x, W.y, W.by, 'npc-qi')) this.poiseDmg(this.pb, 10, null);
      }
    }
  }
  /** 砸地震波：一圈地面炸开，圈里的人吃一下、被掀开一段（范围击退，不用破罡）；圈里的石头、枯树一并震碎 */
  quake(x: number, y: number, Q: { r: number; dmg: number; push: number }, by: Enemy | null, atk: number, realm: number, main: Enemy | null) {
    const c = this.combat, g = this.g;
    c.fxq.push({ k: 'bxquake', x, y, r: Q.r, power: 2.4, color: by ? this.metalRGB(foeKind(by), by.look?.weapon?.tier ?? 2) : this.metalRGB() });
    g.juice(0.03, 0.42); this.punchCam(0.45);
    audio.sfx('boom', x, y);
    if (!by) {
      for (const o of c.enemies) {
        if (o === main || o.dead || o.hideT > 0 || o.z > 160 || (o.spar && !o.aggro)) continue;
        const dx = o.x - x, dy = o.y - y, d = Math.hypot(dx, dy); if (d > Q.r) continue;
        if (!this.dealTo(o, atk * Q.dmg, 'quake', x, y)) continue;
        const b = this.body(o); this.poiseDmg(b, 16 * this.gapK(o), o); b.staggerT = Math.max(b.staggerT, isBoss(o) ? 0.1 : 0.35);
        if (this.launchable(o) && !b.air) this.launch(o, dx || 1, dy, Q.push * (1 - 0.5 * d / Q.r) * (isBoss(o) ? 0.3 : 1), 360, 'p', realm, atk, false);
      }
    } else {
      const p = g.player, d = Math.hypot(p.x - x, p.y - y);
      if (d < Q.r && p.z + this.playerLift < 160 && !this.pb.air && this.hurtPlayer(atk * Q.dmg, realm, x, y, by, 'npc-quake')) { this.poiseDmg(this.pb, 16, null); this.launchPlayer(p.x - x || 1, p.y - y, Q.push * 0.8, 300, by); }
    }
    if (this.brk.n) for (const rk of this.brk.near(x, y, Q.r)) if (!rk.dead && Math.hypot(rk.x - x, (rk.y - y) * 1.3) < Q.r) this.brk.smash(rk, Math.atan2(rk.y - y, rk.x - x), 1.2);
  }
  /** 兵器的突进是一道直线：扑的途中擦过身边的人（每人一下，伤害按兵器谱 rush.line） */
  private rushLine(tg: Enemy) {
    const p = this.g.player, R = this.F.rush, S = (this.lineHit ??= new Set([tg]));
    for (const o of this.combat.enemies) {
      if (S.has(o) || o.dead || o.hideT > 0 || (o.spar && !o.aggro) || !this.zOk(o)) continue;
      if (Math.abs(o.x - p.x) > 90 || Math.abs(o.y - p.y) > 90 || Math.hypot(o.x - p.x, o.y - p.y) > 70 + (o.def.kind === 'human' ? 0 : 16 * (o.def.look?.size ?? 1))) continue;
      S.add(o);
      if (!this.dealTo(o, this.patk * R.dmg * R.line, 'rush-line', p.x, p.y)) continue;
      const b = this.body(o); this.poiseDmg(b, R.poise * 0.6 * this.gapK(o), o); b.staggerT = Math.max(b.staggerT, isBoss(o) ? 0.1 : 0.3);
      const dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy) || 1;
      this.wHitFx(o, dx / d, dy / d, 1.6);
    }
  }
  /**
   * 寻常近战（combat.ts 里敌人的 0.4 息前摇、到点 tankHit）播什么动作：空手照旧「施法」的架子；拿兵器的播那种兵器的一式轻击，
   * 动作的出手那一段正好落在前摇结束（伤害结算）那一刻，之前端着兵器。只管画面，伤害、随机数都不碰。
   */
  meleeAct(e: Enemy): Action {
    if (!(e.windup > 0)) return 'cast';
    const k = foeKind(e); if (k === 'fist') return 'cast';
    const L = WEAPON_MOVES[k].light, a = L[(Math.floor(this.g.time * 0.7) + e.id) % L.length];
    if (e.cs?.action === a || (e.cs && isWeaponAction(e.cs.action) && e.windup <= ACTION_HIT[a][1] + 0.02)) return e.cs!.action;
    return e.windup <= ACTION_HIT[a as WeaponAction][1] + 0.02 ? a : 'idle';
  }
  /** 特殊招式（brawlmoves 挂进来的）：user = null 是主角出招 */
  startMove(def: SpecialMove, user: Enemy | null, target?: Enemy | 'p' | null): boolean { return runMove(this, def, user, target); }
  /** 招式里播动作（主角）：who = 'p' 时由近战的动作覆盖接管 */
  playAct(a: Action, dur: number) { const st = this.g.player.st; st.restart(a); this.act = a; this.actT = dur; }
  /**
   * r12-anim：收掉招式给主角摆的动作（a 给了就只收这一个）。被擒拿的姿势（被按着拖、被抡、倒栽、空中挨打）是按「抓多久摆多久」给的长时长，
   * 放开时不收的话会一直盖在走路、奔跑上——人在地上滑、姿势卡在躺着 / 悬空 / 站着（用户报的「被打后姿势卡住平移」）。
   */
  dropAct(a?: Action) { if (this.act && (!a || this.act === a)) { this.act = null; this.actT = 0; } }
  /** 主角身上这一刻的招式动作和剩余时长（测试、探针用） */
  get actNow(): { a: Action | null; t: number } { return { a: this.act, t: this.actT }; }
  /**
   * r12-anim：一招收场（tickMoves 调）。招式里给主角摆的动作若还剩很长（长时长只给「招式进行期间一直摆着」的姿势用：被擒拿 30 息、
   * 第二阶段招式 4 息），收场后只留一小段收势，交还给走 / 跑 / 站 / 翻滚。正常的出拳、收势（一息上下）不动。
   */
  moveEnded() { if (!this.pMove && this.act && this.actT > 1) this.actT = 0.3; }   // 你自己的招还在进行（别人那一招收场）：不动你的

  // ------------------------------------------------------------ P6 跃击：俯冲砸击
  /** 御器在空中、下方有够得着的目标（比你低 diveMin 以上、平面距离 diveMax 以内）：锁定的优先 */
  private diveTarget(): Enemy | null {
    const g = this.g, p = g.player, c = this.combat;
    if (!g.isFlying || p.z < BX.diveMin + 10) return null;
    const ok = (e: Enemy) => !e.dead && !(e.hideT > 0) && !(e.spar && !e.aggro) && e.z < p.z - BX.diveMin && Math.hypot(e.x - p.x, e.y - p.y) <= BX.diveMax;
    const L = c.lock; if (L && ok(L)) return L;
    // 锁定的对手就在身边、同一高度：这一记是冲它去的（往下砸它），不去俯冲底下别的人
    if (L && !L.dead && Math.hypot(L.x - p.x, L.y - p.y) <= this.F.lunge && this.zOk(L)) return null;
    let best: Enemy | null = null, bd: number = BX.diveMax;
    for (const e of c.enemies) { if (!ok(e)) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; best = e; } }
    return best;
  }
  private startDive(e: Enemy) {
    const g = this.g, p = g.player;
    this.swing(this.heavyAct, 0.2);
    p.st.restart(this.heavyAct);
    const z0 = p.z;
    this.mv = { kind: 'dive', e, speed: BX.diveSpeed, max: BX.diveMax * 1.6, went: 0, then: (t) => this.diveHit(t, z0), sx: p.x, sy: p.y, z0 };
    this.pTrail.length = 0;
    this.combat.fxq.push({ k: 'rush', anchor: { x: p.x, y: p.y, offsetY: -p.z }, x: p.x, y: p.y - 60, x2: e.x, y2: e.y - 60, color: '255,200,120' });
    this.chargeFx(2, FIST.heavy.at);
    audio.sfx('whoosh');
    this.engage(e);
  }
  /** 俯冲到头顶，砸下去：落差越大伤害和气浪越大；破了罡的直接砸进地里 / 海里 */
  private diveHit(e: Enemy, z0: number) {
    const g = this.g, p = g.player, atk = this.patk;
    // 一键追击扑进海里：把沉在水下的人一拳从海里轰出来（先破水，再吃这一下）
    { const sb = this.B.get(e); if (sb && sb.subT > 0) { sb.subT = 0; e.hideT = 0; this.combat.fxq.push({ k: 'breach', x: e.x, y: e.y, power: 2.2 }); } }
    const drop = Math.max(0, z0 - e.z), k = clamp(1 + drop / 240, 1, 2.8);
    this.playNow(this.heavyAct, 0.35); this.recT = 0.25;
    const water = this.deepWater(e.x, e.y) && e.z < 40;
    const R = 160 + drop * 0.6;
    this.combat.fxq.push(water ? { k: 'pillar', x: e.x, y: e.y, power: clamp(1.4 + drop / 220, 1.5, 3.2), r: R } : { k: 'slam', x: e.x, y: e.y, power: 3, r: R, dir: -Math.PI / 2 });
    if (!water) this.wreckAt(e.x, e.y, R, clamp(2.2 + drop / 300, 2.2, 3.6), 'p');
    this.combat.fxq.push({ k: 'launch', anchor: { x: e.x, y: e.y, offsetY: -e.z }, x: e.x, y: e.y - 60, color: '255,200,120', power: 3, dir: Math.PI / 2, r: 1 });
    g.juice(0.08, Math.min(0.9, 0.45 + k * 0.12)); g.slowmo(0.12); g.aberrKick = Math.max(g.aberrKick, 0.5);
    audio.sfx('boom', e.x, e.y);
    // 气浪：周围的人吃一下、被推开
    for (const o of this.combat.enemies) { if (o === e || o.dead || o.hideT > 0) continue; const dd = Math.hypot(o.x - e.x, o.y - e.y); if (dd < R && o.z < 160) this.dealTo(o, atk * 0.3 * k, 'dive-wave', e.x, e.y); }
    this.shove(e.x, e.y, R * 1.2, e);
    if (g.isFlying) { p.z = Math.max(water ? 150 : ALT.lowMin, e.z + 10); p.zTarget = p.z; }   // 扑进海里的：砸完弹回水面上方（不然人埋在水柱里看不见）
    if (!this.dealTo(e, atk * 1.35 * k, 'dive', p.x, p.y)) return;
    const b = this.body(e);
    this.poiseDmg(b, 48 * k * this.gapK(e), e);
    b.freezeT = Math.max(b.freezeT, BX.freezeHeavy); this.pb.freezeT = Math.max(this.pb.freezeT, BX.freezeHeavy);
    if (b.breakT > 0 && b.armorT <= 0) this.slam(e, b, atk);   // 破了罡：接着砸进地里 / 海里（大字由 slam 出，免得两行叠在一起）
    else { this.combo(e, drop > 200 ? '天坠' : '俯冲砸击'); b.staggerT = Math.max(b.staggerT, isBoss(e) ? 0.3 : 0.7); }
  }

  /**
   * 一键追击：刚被你从高处砸下去的人（还在往下掉、嵌在坑里、沉在海里），你还御剑在它上方——
   * 按一下追击就朝它俯冲下去砸（不用自己找它掉在哪）。途中按住上升作罢；俯冲本身就是 P6 的跃击，落差越大越重。
   */
  chaseTarget(): Enemy | null {
    const g = this.g, e = this.slamFoe, p = g.player;
    if (!e || e.dead || e.gone || !this.combat.enemies.includes(e) || g.time - this.slamAt > 7) return null;
    if (!g.isFlying || p.z < BX.diveMin + 10 || this.mv || this.pb.air || this.clash.st) return null;
    const b = this.B.get(e); if (!b) return null;
    if (!(b.air || b.subT > 0 || b.staggerT > 0)) return null;
    if (Math.hypot(e.x - p.x, e.y - p.y) > 4200 || !(e.z < p.z - 40 || b.subT > 0)) return null;
    return e;
  }
  private startChase(e: Enemy) {
    const g = this.g, p = g.player, d = Math.hypot(e.x - p.x, e.y - p.y);
    this.swing(this.heavyAct, 0.2); p.st.restart(this.heavyAct);
    const z0 = p.z;
    this.mv = { kind: 'dive', e, speed: 3400, max: d * 1.6 + 600, went: 0, then: (t) => this.diveHit(t, z0), sx: p.x, sy: p.y, z0, chase: true };
    this.pTrail.length = 0; this.recT = 0; this.queued = null; this.wind = null;
    this.combat.fxq.push({ k: 'rush', anchor: { x: p.x, y: p.y, offsetY: -p.z }, x: p.x, y: p.y - 60, x2: e.x, y2: e.y - 60, color: '255,200,120' });
    this.chargeFx(2, FIST.heavy.at); this.punchCam(0.5);
    audio.sfx('whoosh');
    this.engage(e);
  }

  /** 化虹欺身：扑向锁定的对手（筑基起） */
  rush() {
    if (!this.canFight() || this.pb.air || this.pSubT > 0 || this.clash.st) return;
    if (!this.gate(2, '化虹欺身')) return;
    this.syncWeapon();
    if ((this.combat.cds.get('bx_qishen') ?? 0) > 0) return;
    if (this.mv?.kind === 'rush') return;
    const c = this.combat, p = this.g.player, R = this.F.rush;
    let e = c.pickTarget();
    if (e && (Math.hypot(e.x - p.x, e.y - p.y) > R.max || !this.zOk(e))) e = null;
    if (!e) e = this.target(R.max);
    if (!e) { this.hint('近处没有可以欺身的对手。'); return; }
    if (!this.spend(R.mp)) return;
    this.standUp();
    this.setCd('bx_qishen', R.cd);
    this.mv = { kind: 'rush', e, speed: R.speed, max: R.max, went: 0, then: (t) => this.rushHit(t), sx: p.x, sy: p.y };
    this.pTrail.length = 0; this.recT = 0; this.queued = null; this.wind = null;
    c.fxq.push({ k: 'rush', anchor: { x: p.x, y: p.y, offsetY: -p.z }, x: p.x, y: p.y - 60, x2: e.x, y2: e.y - 60, color: this.wk === 'fist' ? '255,236,180' : this.metalRGB() });
    if (this.wk !== 'fist') { this.lineHit = new Set([e]); this.armHold = 3; audio.sfx(SWING_SFX[this.wk]); }
    audio.sfx('whoosh');
    this.engage(e);
  }
  private rushHit(e: Enemy) {
    const g = this.g, p = g.player, atk = this.patk;
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (this.wk === 'fist') { p.st.restart('smash'); this.act = 'smash'; this.actT = 0.3; } else this.playNow(RUSH_END[this.wk], 0.3);
    this.recT = 0.12;
    this.combat.fxq.push({ k: 'launch', anchor: { x: e.x, y: e.y, offsetY: -e.z }, x: e.x - dx / d * 30, y: e.y - 60, color: '255,236,180', power: 2, dir: Math.atan2(dy, dx), kind: 'rush' });
    const R = this.F.rush;
    if (!this.dealTo(e, atk * R.dmg, 'rush', p.x, p.y)) return;
    const b = this.body(e);
    this.poiseDmg(b, R.poise * this.gapK(e), e);
    if (b.armorT <= 0) b.staggerT = Math.max(b.staggerT, R.stagger * (isBoss(e) ? 0.4 : 1));   // 破防硬直半息
    b.freezeT = Math.max(b.freezeT, R.freeze); this.pb.freezeT = Math.max(this.pb.freezeT, R.freeze);
    if (e.cast) this.combat.foe.interrupt(e);
    e.windup = 0;
    if (b.ai && b.ai.st !== 'idle') { b.ai.st = 'idle'; b.ai.wind = 0; }   // 撞散了它正在出的招
    this.shove(e.x, e.y, R.shove, e);
    g.juice(0, 0.3);
    if (this.wk === 'fist') audio.dir.hit(e.x, e.y, '体', 2.5); else this.wHitFx(e, dx / d, dy / d, 2.5);
  }

  /** 空格 / 缩地：自己被打飞时是脱困，对方倒飞途中是缩地追击 */
  /** r7 撼山客第三批（hsmoves3）的钩子：追击 / 脱困键先问它，返回 true = 被接走了（被一拳打上天时脱困、冲天追上去） */
  escape: (() => boolean) | null = null;
  pursue() {
    if (this.g.xukong.fall.live && this.g.xukong.fall.act()) return;   // E3：坠界途中——俯冲追击 / 脱困（技能栏缩地、手机「追」也走这里）
    if (this.escape?.()) return;
    if (this.pb.air) { this.tech(); return; }
    if (!this.canFight() || this.clash.st || this.pSubT > 0) return;
    { const ct = this.chaseTarget(); if (ct) { this.startChase(ct); return; } }   // 一键追击：俯冲追砸下去的人
    const e = this.flung, b = e && this.B.get(e);
    if (!e || !b?.air || e.dead) { this.hint('对方没在倒飞——先一记崩山把人轰出去，再缩地追上。'); return; }
    if (!this.gate(3, '缩地追击')) return;
    if (b.chain >= BX.pursuitMax) { this.hint('一口气只追得上三次。'); return; }
    if (this.mv || this.pb.freezeT > 0) return;
    const cost = BX.pursuitMp[Math.min(BX.pursuitMp.length - 1, b.chain)];
    const g = this.g, p = g.player;
    // r7：被上挑打上天的——瞬移到他头顶（稍稍错开一点，画面上看得见两个人），接着这一下默认是往下砸
    const above = b.up && e.z > 60;
    // 截到他飞行轨迹的前方（约 0.12 息后的位置再往前一点），回身面对他
    const sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
    const L = above ? { x: b.vx * 0.12 - 26, y: b.vy * 0.12 + 14 } : pursuitLead(b);
    let tx = e.x + L.x, ty = e.y + L.y;
    if (!g.isFlying && !g.mijing.active && !g.xukong.fight.on && g.terrain.walkFactor(tx, ty) <= 0) { tx = e.x + ux * 90; ty = e.y + uy * 90; if (g.terrain.walkFactor(tx, ty) <= 0) { this.hint('落脚处无处立足。'); return; } }
    if (!this.spend(cost)) return;
    b.chain++;
    const ox = p.x, oy = p.y, oz0 = p.z + this.playerLift;
    // 高度：御剑的人飞到他头顶那一层；没御剑的悬在半空（aloftTick 砸完再落回地上）。平着追的，御剑时跟到他的高度
    if (above) {
      const zz = Math.min(ALT.max, e.z + BX.upRoom);
      if (g.isFlying) { p.z = p.zTarget = zz; } else { this.aloft = { z: zz, vz: 0, hold: 0.5 }; this.playerLift = zz; }
    } else if (g.isFlying) { p.z = p.zTarget = clamp(e.z, ALT.lowMin, ALT.max); }
    this.combat.fxq.push({ k: 'blinkstep', anchor: { x: ox, y: oy, offsetY: -p.z }, x: ox, y: oy - 60, x2: tx, y2: ty - 60, color: '120,90,200' });
    // 第三轮：缩地的残影拉成一串——从原地到落点排四五个，越靠近落点越淡、消得越快
    // r7：瞬移到头顶的（竖着往上一大段）只在原地留一个残影——一串叠起来像一根黑柱子
    for (let i = 0; i < (above ? 1 : 5); i++) { const u = i / 5; this.ghosts.push({ e: null, x: ox + (tx - ox) * u, y: oy + (ty - oy) * u, z: oz0 + (p.z + this.playerLift - oz0) * u, t: 0, dur: 0.6 - u * 0.3, yaw: p.st.yaw, color: i ? '90,70,160' : '40,30,60' }); }
    while (this.ghosts.length > BX.ghostMax + 6) this.ghosts.shift();
    p.x = tx; p.y = ty; p.st.x = tx; p.st.y = ty;
    p.st.faceToward(e.x - tx, e.y - ty, false);
    g.destination = null;
    this.recT = 0; this.queued = null; this.wind = null;
    // 落点：地面炸裂一圈（缩地的「落」要有分量）
    this.combat.fxq.push({ k: 'crater', x: tx, y: ty, power: 2, r: 120, dir: Math.atan2(ty - oy, tx - ox), kind: 'blink' });
    this.playNow(this.heavyAct, 0.35);
    // 截住：默认把人打回来路（面朝他），瞄了别的方向就照瞄的打；按住下降键是往下砸、上升键是再挑上去；
    // r7：追到上挑起来的人头顶时，不按键就是往下砸（打上天再砸下来）
    b.breakT = Math.max(b.breakT, 0.3);
    this.heavyHit(e, this.vertMode(e, true), true);
    this.recT = 0.15;
    audio.sfx('whoosh');
  }
  /** 脱困：耗灵力定住身形、震开追击者，有冷却 */
  tech() {
    const g = this.g, b = this.pb, p = g.player;
    if (!b.air || g.hero.dead) return;
    if (b.techCd > 0) { this.hint('脱困还在调息中。'); return; }
    const cost = this.techCost;
    if (!this.spend(cost)) return;
    b.techCd = BX.techCd; b.vx = b.vy = b.vz = 0; b.air = false; b.grounded = false; b.z = 0; b.slam = false; this.playerLift = 0; this.pTrail.length = 0;   // 定住身形，落回脚下
    this.techAt = g.time;   // 会近战的 NPC 看见你脱困，会追一手（brawlfoe）
    this.combat.invulnT = Math.max(this.combat.invulnT, 0.6);
    b.poise = Math.max(b.poise, b.poiseMax * 0.5); b.breakT = 0;
    this.combatFx('tech', p.x, p.y, -p.z - b.z, '170,230,255');
    for (const o of this.combat.enemies) {
      if (o.dead) continue;
      const d = Math.hypot(o.x - p.x, o.y - p.y); if (d > 360 || d < 1) continue;
      const ob = this.body(o); ob.staggerT = Math.max(ob.staggerT, 0.5); if (ob.ai) ob.ai.st = 'idle';
      if (this.launchable(o)) this.launch(o, o.x - p.x, o.y - p.y, BX.techPush, 260, 'p', g.hero.realm, this.combat.pStats.atk * 0.3, false);
    }
    g.toast(`脱困！（耗灵力 ${Math.round(cost * 100)}%）`, 'good');
    audio.sfx('whoosh');
  }
  /** 脱困要多少灵力：底价四分之一，被连得越久越便宜（最低一成） */
  get techCost(): number { return BX.techMp * Math.max(0.4, 1 - 0.08 * this.pb.combo); }
  private combatFx(k: 'tech', x: number, y: number, offY: number, color: string) { this.combat.fxq.push({ k, anchor: { x, y, offsetY: offY }, x, y: y - 60, color, r: 300 }); }

  // ------------------------------------------------------------ 技能栏四式（不进架势也能放）
  castArt(id: string) {
    const g = this.g, s = ARTS[id];
    if (!s) return;
    if (g.hero.realm < s.realm) { g.toast(`${s.name}需${REALMS[s.realm].name}期方可施展。`, 'warn'); return; }
    this.syncWeapon(); if (this.wk !== 'fist') this.armHold = 3;   // 不进架势直接放，也把兵器拿出来打
    { const mv = moveOfArt(id); if (mv) { this.startMove(mv, null); this.combat.gainXp(id, 1); return; } }   // 挂进来的特殊招式
    if (id === 'bx_lianquan') this.light();
    else if (id === 'bx_bengshan') {
      const f = this.flung, fb = f && this.B.get(f);
      if (fb?.air && g.hero.realm >= 3 && fb.chain < BX.pursuitMax && !this.pb.air) this.pursue();   // 击飞后再按这一格就是追击
      else { const v = this.vertMode(this.target(this.F.lunge)); this.heavy(v === -1, v === 1); }   // r7：同轻点右键——朝鼠标落点轰；按住上升键上挑、下降键往下砸
    }
    else if (id === 'bx_qishen') this.rush();
    else if (id === 'bx_suodi') this.pursue();
    this.combat.gainXp(id, 1);
  }
  /** 按境界领悟四式（进架势时、试玩入口里） */
  learn(silent = false) {
    const h = this.g.hero, got: string[] = [];
    for (const a of BRAWL_ARTS) if (h.realm >= a.realm && !h.arts.some((x) => x.id === a.id)) { h.arts.push({ id: a.id, xp: 0 }); got.push(a.name); }
    if (got.length && !silent) this.g.toast(`领悟贴身斗法：${got.join('、')}。可在法术书${keyNote('skills')}里放进技能栏，不进架势也能放。`, 'good');
    return got;
  }

  // ------------------------------------------------------------ 输入
  /** 进出近战架势 */
  toggleStance() {
    this.stance = !this.stance;
    const g = this.g;
    if (this.stance) {
      this.learn();
      if (!this.taught) { this.taught = true; g.toast((IS_TOUCH ? '近战架势：右下四个大按钮——轻击、崩山（轻点出手；长按变小摇杆定方向，按着点「升」「降」选上挑 / 下砸）、欺身、追击 / 脱困；走位用摇杆。' : `近战架势：左键轻击；右键崩山——轻点出手、按住定向（时间放慢，箭头跟着鼠标，松开出手），同时按住 ${ascendLabel()} 上挑、${keyLabel(bindOf('descend'))} 下砸；${keyLabel(bindOf('run'))} 欺身；${keyLabel(bindOf('dodge'))} 追击 / 被打飞时脱困。再按 ${keyLabel(bindOf('brawl'))} 或鼠标中键收势。`) + '手里有兵器就用兵器（兵器槽里的，或剑类本命法宝握在手里当剑），空着手就是拳脚。', 'info'); }
      this.syncWeapon(); if (this.wk !== 'fist') g.toast(`手持${this.weaponName}：${this.F.tip}。`, 'info');
      audio.sfx(this.wk === 'fist' ? 'clang' : 'sword');
    }
    this.syncDocClass();
    g.updateUI?.(true);
  }
  /** 界面层：进架势时手机上的快捷栏换成四个大按钮（BrawlHUD 读这个 class） */
  private syncDocClass() { try { if (typeof document !== 'undefined') document.documentElement.classList.toggle('brawl-stance', this.stance); } catch { /* 无头测试 */ } }
  /** 键盘：game.ts 的 keydown 最前面问一句（返回 true = 近战用掉了这个键） */
  key(act: string | undefined, repeat: boolean): boolean {
    const g = this.g;
    if (!act || g.paused || g.hero.dead || g.xukong.active || g.inCave) return false;
    // 拼招：左 / 上 / 右（默认 A / W / D）= 攻 / 破 / 卸；连按拼点时这三个键、空格都算一下（架势外撞上拼招也一样）
    if (this.clash.st && this.clash.st.phase !== 'result') {
      const k: Pick | null = act === 'left' ? 'atk' : act === 'up' ? 'brk' : act === 'right' ? 'par' : null;
      if (!repeat && k) { this.clash.pick(k); return true; }
      if (!repeat && (act === 'dodge' || act === 'down') && this.clash.st.phase === 'mash') { this.clash.mash(); return true; }
      if (k || act === 'down' || act === 'dodge' || act === 'run') return true;
    }
    // E3：坠界途中，追击键（架势外也算）是「俯冲追下去」/ 被砸下去时的「脱困」
    if (act === 'dodge' && g.xukong.fall.live) { if (repeat) return true; if (g.xukong.fall.act()) return true; }
    if (act === 'dodge' && !repeat && this.escape?.()) return true;   // r7 撼山客第三批：被一拳打上天时的脱困 / 冲天追上去（hsmoves3）
    // 一键追击：屏幕上亮着「追！」的时候，空格（架势外也算）就是俯冲追砸
    if (act === 'dodge' && !repeat && this.chaseTarget()) { this.pursue(); return true; }
    if (act === 'brawl') { if (!repeat) this.toggleStance(); return true; }
    if (!this.stance) return false;
    // 架势里 Shift、空格整个归近战：按住不放也不会变成疾行 / 遁光加速
    if (act === 'run') { if (!repeat) this.rush(); return true; }
    if (act === 'dodge') {
      // r7：按住右键定向时空格是「选上挑」（game 记成 ascend，不追击）；御剑、手上没有可追的人时，空格放行成「上升」
      if (this.aim) return false;
      if (!repeat && !this.pb.air && g.isFlying && !this.pursuable()) return false;
      if (!repeat) this.pursue();
      return true;
    }
    return false;
  }
  /** 空格此刻在近战里有事做：被打飞（脱困）、坠界途中、一键追击、对方正倒飞（缩地） */
  private pursuable(): boolean {
    const g = this.g;
    if (this.pb.air || g.xukong.fall.live || this.chaseTarget()) return true;
    const f = this.flung, fb = f && this.B.get(f);
    return !!(fb?.air && f && !f.dead && fb.chain < BX.pursuitMax && g.hero.realm >= 3);
  }
  /** 鼠标按下：中键切换架势；架势里左键轻击、右键重击（r7：轻点立刻出手；按住是定向——时间放慢、箭头跟着鼠标，松开出手） */
  mouse(button: number): boolean {
    const g = this.g;
    if (g.paused || g.hero.dead || g.xukong.active || g.inCave || g.modal) return false;
    if (this.clash.st) { if (this.clash.st.phase === 'mash') this.clash.mash(); return true; }   // 拼招：连按拼点时鼠标也算一下
    if (button === 1) { this.toggleStance(); return true; }
    if (!this.stance) return false;
    if (button === 0) { if (!this.aim) this.light(); return true; }
    if (button === 2) { if (!this.aim && !this.aimStart('mouse')) { const v = this.vertMode(null); this.heavy(v === -1, v === 1); } return true; }
    return false;
  }
  /** 鼠标松开：松开右键＝定向出手（按得短就是轻点，立刻出手） */
  mouseUp(button: number): boolean {
    if (button !== 2 || this.aim?.src !== 'mouse') return false;
    this.aimRelease();
    return true;
  }

  // ------------------------------------------------------------ r7 重击定向
  /** 按住右键 / 长按「崩」：在这一刻能不能进定向（被打飞、拼招、沉在水里、出不了手的时候不行） */
  get aiming(): boolean { return !!this.aim; }
  /** 定向已经进了「放慢」那一段（按住超过 aimHold） */
  get aimSlow(): boolean { return !!this.aim && this.aim.t >= BX.aimHold; }
  /** t0：已经按了多久（手机长按「崩」是长按够了才进来的，直接从放慢那一段起） */
  aimStart(src: 'mouse' | 'touch', t0 = 0): boolean {
    if (!this.canFight() || this.pb.air || this.pSubT > 0 || this.clash.st || this.aim) return false;
    this.aim = { t: t0, src, jx: 0, jy: 0, vt: 0 };
    this.aimCache.f = -1;
    return true;
  }
  /** 触屏小摇杆：拖出来的方向（屏幕上，-1–1） */
  aimDrag(jx: number, jy: number) { const A = this.aim; if (A) { A.jx = jx; A.jy = jy; this.aimCache.f = -1; } }
  /** 触屏「升」「降」：点一下选上挑 / 下砸，再点一下取消 */
  aimVert(v: Vert) { const A = this.aim; if (A) { A.vt = A.vt === v ? 0 : v; this.aimCache.f = -1; } }
  /** 出手：照这一刻选的方向、上下打出去 */
  aimRelease() {
    const A = this.aim; if (!A) return;
    const e = this.target(this.F.lunge) ?? this.combat.lock;
    const v = this.vertMode(e);
    if (A.src === 'touch') { const w = this.touchVec(A.jx, A.jy); this.shotDir = w ? { ...w, t: this.g.time } : null; }
    this.aim = null; this.aimCache.f = -1;
    this.heavy(v === -1, v === 1);
  }
  /** 作罢（拼招撞上了、被打飞、倒下……）：不出手 */
  aimCancel() { this.aim = null; this.aimCache.f = -1; }
  /** 每帧（真实时间）：按了多久、放慢缓进缓出、撑到头自动出手 */
  private aimTick(rdt: number) {
    const A = this.aim, g = this.g;
    if (A && (this.pb.air || this.pSubT > 0 || this.clash.st || g.hero.dead || g.paused || g.modal || !this.stance)) this.aimCancel();
    if (this.aim) { this.aim.t += rdt; if (this.aim.t >= BX.aimHold + BX.aimMax) this.aimRelease(); }
    const want = this.aimSlow ? BX.aimSlowK : 1;
    this.aimK = want < this.aimK ? Math.max(want, this.aimK - BX.aimIn * rdt) : Math.min(want, this.aimK + BX.aimOut * rdt);
  }

  // ------------------------------------------------------------ 镜头：两人同框
  /**
   * 近战期间接管：焦点取两人连线约四成处（偏自己这边），按两人的包围盒算远近（下限 minZoom），
   * 位置和远近都用临界阻尼弹簧——缩地瞬移时焦点跳了，镜头只是追过去，不跳、不晕。
   * 脱离近战后返回 false，game.ts 那套一阶跟随从当前位置接着走，自然交还。
   */
  cameraTick(dt: number): boolean {
    const g = this.g;
    if (this.kickF !== 1) { g.cam.zoom /= this.kickF; this.kickF = 1; }   // 先除掉上一帧乘上去的猛推
    const rdt = dt / Math.max(0.05, this.appliedK);
    const on = this.camInner(dt);
    // 猛推再回弹：欠阻尼弹簧（按真实时间走；两个子步）
    const K = this.kick;
    if (K.v !== 0 || K.x !== 0) {
      // r19：夜无赦在场（开打 / 演示）时只要一下很短的冲击——硬、阻尼大的弹簧（约 0.12 息一缩一弹就回原样）、幅度封顶 5%，取景基本不变；别的时候照旧
      const q = ywsCamQuiet(this.g), w = q ? 42 : 16, zeta = q ? 0.75 : 0.34, n = q ? 4 : 2, h = Math.min(0.05, rdt) / n;
      for (let i = 0; i < n; i++) { K.v += (-w * w * K.x - 2 * zeta * w * K.v) * h; K.x += K.v * h; }
      if (Math.abs(K.x) < 1e-4 && Math.abs(K.v) < 1e-3) K.x = K.v = 0;
      this.kickF = 1 + (q ? clamp(K.x, -0.02, 0.05) : clamp(K.x, -0.1, 0.24));
      g.cam.zoom *= this.kickF;
    }
    return on;
  }
  private camInner(dt: number): boolean {
    const g = this.g, p = g.player;
    // r7：按住右键定向（放慢那一段）：把对手、预演的落点、上挑的顶都框进来（落点在画外就看不见圈）
    const av0 = this.aimSlow ? this.aimView() : null, aimF = av0 && av0.full && av0.ok && av0.land ? av0 : null;
    const o = aimF ? aimF.e : this.foe;
    this.clothWind();
    // 拼招时世界放慢了：镜头按真实时间走（推近、两人居中）
    dt = dt / Math.max(0.05, this.appliedK); this.appliedK = 1;
    const S = this.clash.st;
    if (S && S.phase !== 'result') {
      const C = this.cam;
      if (!C.on) { C.on = true; C.x = g.cam.x; C.y = g.cam.y; C.vx = C.vy = 0; C.z = g.cam.zoom; C.vz = 0; }
      const fx = S.x, fy = S.y - 70, zT = clamp(Math.max(g.cam.targetZoom, 1.0) * 1.18, g.minZoom, 1.6);
      const k = Math.min(1, dt * 7);
      C.x += (fx - C.x) * k; C.y += (fy - C.y) * k; C.z += (zT - C.z) * Math.min(1, dt * 4); C.vx = C.vy = C.vz = 0;
      g.cam.x = C.x + g.debugCamDX; g.cam.y = C.y; g.cam.zoom = C.z;
      return true;
    }
    // r7-polish / r9：撼山客出招——侧面近景（两人同框、他约占画面三成半），收招后缓回（第一阶段的侧面取景并进了这一套）
    // 2026-11-18：特写镜头默认关（world/hscam.ts）——关着时取景照样算（躲遮挡、招式读 stageOn 都不变），但镜头不被他接管，照常跟着你
    { const cx = g.cam.x, cy = g.cam.y, cz = g.cam.zoom;
      if (this.stageCam(dt)) { if (hsCamSetting.on) return true; g.cam.x = cx; g.cam.y = cy; g.cam.zoom = cz; this.cam.on = false; } }

    this.engageT = Math.max(0, this.engageT - dt);
    const ob = o ? this.B.get(o) : undefined;
    const on = !!o && (this.engageT > 0 || !!ob?.air || !!aimF) && !o.dead && !o.gone && !g.halted && !g.xukong.active && !g.xukong.fight.on && Math.hypot(o.x - p.x, o.y - p.y) < 6000;
    const C = this.cam;
    if (!on || !o) { C.on = false; return false; }
    if (!C.on) { C.on = true; C.x = g.cam.x; C.y = g.cam.y; C.vx = C.vy = 0; C.z = g.cam.zoom; C.vz = 0; }
    const pl = p.st.lift, oz = o.z;
    // 高处的人（被上挑打上天、你悬在他头顶）：斜视角下高度在画面上占得多，按 1.4 倍算（平时 0.5 倍，人不高）
    const hk = ob?.up || this.aloft ? 1.4 : 0.5;
    // 被轰飞的人跑得快：焦点按 0.15 息后的位置取（弹簧的滞后正好抵掉），远近按 0.3 息后的位置框（提前拉远，不等他出画）
    const air = !!ob?.air, vx = air ? ob!.vx : 0, vy = air ? ob!.vy : 0;
    const ax = p.x, ay = p.y - pl * hk, bx = o.x + vx * 0.15, by = o.y + vy * 0.15 - oz * hk;
    let fx = ax + (bx - ax) * 0.4, fy = ay + (by - ay) * 0.4;
    // 定向：焦点取你、对手、落点、上挑顶点的包围盒中心（不偏向哪一边）
    const aimPts: [number, number][] = [];
    if (aimF) {
      aimPts.push([aimF.land!.x, aimF.land!.y]);
      let top = aimF.pts[0]; for (const q of aimF.pts) if (q[2] > top[2]) top = q;
      aimPts.push([top[0], top[1] - top[2] * 0.5]);
      let x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
      for (const [x, y] of aimPts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      fx = (x0 + x1) / 2; fy = (y0 + y1) / 2;
    }
    const W = (typeof window !== 'undefined' && window.innerWidth) || 1280, H = (typeof window !== 'undefined' && window.innerHeight) || 800;
    let spanX = 0, spanY = 0;
    const frame = (x: number, y: number) => { spanX = Math.max(spanX, Math.abs(x - fx) + 110); spanY = Math.max(spanY, Math.abs(y - fy) + 150); };
    frame(ax, ay); frame(o.x, o.y - oz * hk); frame(bx, by);
    for (const [x, y] of aimPts) frame(x, y);
    if (air) {
      frame(o.x + vx * 0.3, o.y + vy * 0.3 - oz * hk);
      // 还能缩地追击：把「截住的那一点」（他前方）也框进来，瞬移过去时人已经在画面里，镜头只需要慢慢跟
      if (o === this.flung && ob!.chain < BX.pursuitMax && g.hero.realm >= 3) { const L = pursuitLead(ob!); frame(o.x + L.x, o.y + L.y - oz * hk); }
    }
    const base = Math.max(g.minZoom, g.cam.targetZoom * (1 - 0.3 * g.alt));
    let zNeed = Math.min(W * 0.4 / spanX, H * 0.3 / spanY);   // 俯视有透视，纵向一单位在屏幕上比横向长，纵向多留些
    // 有真镜头（HD2D）就再用上一帧的投影校一遍：谁离画面边缘不到一成，就按比例再拉远
    const hd = g.renderer?.hd;
    if (hd) {
      try {
        let k = 0;
        const chk = (x: number, y: number, h: number) => { const q = hd.project(x, y, h); k = Math.max(k, Math.abs(q.x - W / 2) / (W * 0.42), Math.abs(q.y - H / 2) / (H * 0.4)); };
        chk(p.x, p.y, pl + 60); chk(o.x, o.y, oz + 60); if (air) chk(o.x + vx * 0.3, o.y + vy * 0.3, oz + 60);
        if (aimF) { chk(aimF.land!.x, aimF.land!.y, 0); let top = aimF.pts[0]; for (const q of aimF.pts) if (q[2] > top[2]) top = q; chk(top[0], top[1], top[2] + 120); }
        if (k > 1) zNeed = Math.min(zNeed, C.z / k);
      } catch { /* 镜头还没好 */ }
    }
    // 定向时最远只拉到 0.5（落点实在太远就让它贴着画边，不为它把人缩成一粒）
    const zT = clamp(Math.min(base, zNeed), aimF ? Math.min(base, Math.max(g.minZoom, 0.5)) : g.minZoom, Math.max(g.minZoom, base));
    // 临界阻尼弹簧（两个子步，dt 抖一点也稳）
    const n = dt > 0.034 ? 3 : 2, h = dt / n;
    const wP = 7.5, wZ = zT < C.z * 0.95 ? 12 : 5;   // 有人要出画了：拉远要快，推近慢慢来
    for (let i = 0; i < n; i++) {
      C.vx += (wP * wP * (fx - C.x) - 2 * wP * C.vx) * h; C.vy += (wP * wP * (fy - C.y) - 2 * wP * C.vy) * h;
      C.x += C.vx * h; C.y += C.vy * h;
      C.vz += (wZ * wZ * (zT - C.z) - 2 * wZ * C.vz) * h; C.z += C.vz * h;
    }
    C.z = clamp(C.z, g.minZoom, 1.6);
    g.cam.x = C.x + g.debugCamDX; g.cam.y = C.y; g.cam.zoom = C.z;
    return true;
  }
  /** 撼山客出招的取景：谁在打谁、还要框住多久（收招后留 STAGE_HOLD 息再交还） */
  private stage: { a: Enemy | null; b: Enemy | 'p' | null; t: number } = { a: null, b: null, t: 0 };
  /** 取景焦点上一帧在哪、平滑过的速度（往前补弹簧的滞后） */
  private stageV = { on: false, x: 0, y: 0, vx: 0, vy: 0 };
  /** r9 测试 / 对照图读：取景这一帧量到的他一人高占画面几成、推到多近、对手框没框进来 */
  shotInfo = { fill: 0, zoom: 0, both: false };
  /**
   * r9 撼山客出招的取景（一套）：原来第一阶段的侧面取景（sideCam）和大招 / 第二阶段的出招取景（stageCam）合成这一套——
   * 照参考视频的侧面近景：焦点在两人中间（招式给了 lead 就往出招方向多看一截），推到他一人高约占画面高度 STAGE_FILL（三成半），
   * 推多近按「他此刻在画面上有多高」量出来（上一帧的投影），不写死倍数；两人都框进画面（左右留一成、上下留一成），
   * 对手被轰飞得太远（要拉到推近量的一半以下才框得住）就不追着框——镜头留在他身上，人飞出画面（照视频）。
   * 位置、远近都是临界阻尼弹簧，不跳；收招后再框 STAGE_HOLD 息，之后交还给寻常跟随（一阶跟随从当前位置接着走，缓缓回去）。
   * 你旁观（不是被打的那个）：离得远、或者你自己正和别人交手，就不接管。
   * 查过的旧问题（r8-p2 的 stageCam 推近在录像里看不出来）：① 量「一人高」用的是离地 170 的一根竖线，人物立板实际只有它的八成，
   * 推到「三成」时人只占两成出头；② 两人框住（zNeed）按焦点留了四成半的边，冲刺、闪步时对手和落点一拉开就把镜头拉回 1.1 上下，
   * 对手被打飞后还一直追着框（直到 stageFar 才放），整段大招多半时间人只占一成多；③ 第一阶段的 sideCam 写死了最多推到 1.6。这一版三处都改了。
   */
  private stageCam(dt: number): boolean {
    const g = this.g, p = g.player, S = this.stage, Sd = this.side;
    const H = (g as { hanshan?: { ent: Enemy | null } }).hanshan?.ent ?? null;
    let run: MoveRun | null = null;
    if (H && !H.dead) for (const r of this.runs) if (r.user === H && r.target && !r.done) { run = r; break; }
    if (Sd.t > 0 && Sd.a) { S.a = Sd.a; S.b = Sd.b; S.t = Math.max(S.t, STAGE_HOLD * 0.6); Sd.t = Math.max(0, Sd.t - dt); }
    else if (run) { S.a = H; S.b = run.target; S.t = STAGE_HOLD; } else S.t = Math.max(0, S.t - dt);
    if (Sd.t <= 0) Sd.lead = 0;
    const a = S.a, bt = S.b, C = this.cam;
    const off = () => { S.t = 0; S.a = S.b = null; Sd.t = 0; C.on = false; this.stageV.on = false; this.stageFar = 3000; return false; };
    if (S.t <= 0 || !a || !bt || a.dead || g.halted || g.offWorld || g.xukong.fight.on || !this.combat.enemies.includes(a)) return S.a ? off() : false;
    const onMe = bt === 'p', pl = p.st.lift;
    // 往天外升 / 从天外砸回来的那一段（xukong 的通道）：远近归通道管（它按高度算、和虚空那边无缝接上），这里只管把你留在画面里
    const cor = g.xukong.corridor;
    // 你在旁观（不是被打的那个）：离得远、或者你自己正和别人交手，就不接管（照常跟着你）
    if (!onMe && (Math.hypot(p.x - a.x, p.y - a.y) > 2600 || (this.engageT > 0 && this.foe !== a))) return off();
    const hd = g.renderer?.hd;
    const u = hd ? hd.upDir : { x: 0, y: -1 }, r = hd ? hd.rightDir : { x: 1, y: 0 };
    const W = (typeof window !== 'undefined' && window.innerWidth) || 1280, Hh = (typeof window !== 'undefined' && window.innerHeight) || 800;
    if (!C.on) { C.on = true; C.x = g.cam.x; C.y = g.cam.y; C.vx = C.vy = 0; C.z = g.cam.zoom; C.vz = 0; }
    // 点：(x, y, 离地高度)。人按脚和头两处算
    type P3 = [number, number, number];
    const self: P3[] = [], other: P3[] = [];
    const add = (to: P3[], x: number, y: number, h: number) => { h = Math.min(h, STAGE_HMAX); to.push([x, y, h], [x, y, h + FIG_H + 25]); };
    if (!(cor && onMe)) add(self, a.x, a.y, a.z);   // 通道里他在云下面（看不见），只框你
    let bx = a.x, by = a.y;
    if (onMe) { add(cor ? self : other, p.x, p.y, pl); bx = p.x; by = p.y; }
    else if (!bt.dead && !bt.gone && Math.hypot(bt.x - a.x, bt.y - a.y) < (this.stageFar ?? 3000)) { add(other, bt.x, bt.y, bt.z); bx = bt.x; by = bt.y; }
    // r7-fix：招式要求一并框进来的地方（分海 / 无极一击犁开的沟）——r9：只许把镜头拉远到推近量的八成半（再远人就小了）
    const extra: P3[] = !cor && this.stagePts ? this.stagePts : [];
    // 推多近：他一人高在画面上占 STAGE_FILL（按上一帧的投影量）
    let zFill = clamp(Math.max(g.cam.targetZoom, 0.85) * 1.9, g.minZoom, STAGE_ZMAX);
    if (hd && !(cor && onMe)) { try { const q0 = hd.project(a.x, a.y, a.z), q1 = hd.project(a.x, a.y, a.z + FIG_H), hp = Math.abs(q0.y - q1.y); if (hp > 4) zFill = clamp(g.cam.zoom * Hh * STAGE_FILL / hp, g.minZoom, STAGE_ZMAX); } catch { /* 镜头还没好 */ } }
    // 屏幕轴上的包围盒（横 = 沿右方，纵 = 沿上方 + 高度·hk）。r9：hk 按此刻镜头量（离地一单位在画面上抵得上地面往上几单位）——
    // 原来写死 √2（正交 45 度的值），透视镜头下高处的人（千钧坠跳到一千高）焦点算低了，人整个出了画面
    let hk = 1.414;
    if (hd) { try { const q0 = hd.project(C.x, C.y, 0), qh = hd.project(C.x, C.y, 100), qg = hd.project(C.x + u.x * 100, C.y + u.y * 100, 0), gp = q0.y - qg.y; if (gp > 1 && q0.y - qh.y > 1) hk = clamp((q0.y - qh.y) / gp, 0.8, 3); } catch { /* */ } }
    const box = (L: P3[]) => { let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const [x, y, h] of L) { const sx = x * r.x + y * r.y, sy = x * u.x + y * u.y + h * hk; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); } return { x0, x1, y0, y1 }; };
    // 这些点都框进画面要多近（左右留一成、上下留一成；按「镜头到了焦点之后」量：相对焦点的投影）
    const need = (L: P3[], fx: number, fy: number) => {
      let k = 0;
      if (hd) { try { const qf = hd.project(fx, fy, 0); for (const [x, y, h] of L) { const q = hd.project(x, y, h); k = Math.max(k, Math.abs(q.x - qf.x) / (W * 0.42), Math.abs(q.y - qf.y) / (Hh * 0.4)); } } catch { /* 镜头还没好 */ } }
      else { const B0 = box(L); k = Math.max(((B0.x1 - B0.x0) / 2 + 60) * C.z / (W * 0.42), ((B0.y1 - B0.y0) / 2 + 40) * 0.71 * C.z / (Hh * 0.4)); }
      return k > 1e-6 ? C.z / k : STAGE_ZMAX;
    };
    // 焦点：框进来的点的包围盒中心；lead 往出招方向多看一截
    const focus = (L: P3[]) => {
      const B0 = box(L), as = a.x * r.x + a.y * r.y, bs = bx * r.x + by * r.y;
      const fsx = (B0.x0 + B0.x1) / 2 + (bs - as) * 0.18 * Sd.lead, fsy = (B0.y0 + B0.y1) / 2 - 8;
      return { x: r.x * fsx + u.x * fsy, y: r.y * fsx + u.y * fsy };
    };
    // 两人一起框；对手太远（要拉到推近量的一半以下）就只框他自己
    let pts: P3[] = self.length ? [...self, ...other] : other;
    if (!pts.length) pts = [[a.x, a.y, a.z]];
    let F = focus(pts), zNeed = need(pts, F.x, F.y), both = other.length > 0;
    if (other.length && self.length && zNeed < zFill * 0.5) { pts = self; F = focus(self); zNeed = need(self, F.x, F.y); both = false; }
    if (extra.length) zNeed = Math.min(zNeed, Math.max(zFill * 0.85, need([...pts, ...extra], F.x, F.y)));   // 犁开的沟只框得进多少算多少：人还是三成上下
    let fx = F.x, fy = F.y;
    // 跑得快的（犁地狂奔、被轰飞）：弹簧追匀速目标会落后「速度 × 2/ω」，按平滑过的速度往前补上；一帧跳太远（缩地、瞬移）不算速度
    const SV = this.stageV;
    if (SV.on && dt > 1e-4) {
      const jx = fx - SV.x, jy = fy - SV.y, jump = Math.hypot(jx, jy) > 500;
      // r9：一帧跳出三百以上（闪步、缩地一下子到了）：镜头当场跟过去一半，不然人到了画面边上、还被裁掉半个身子
      if (Math.hypot(jx, jy) > 300 && C.on) { C.x += jx * 0.5; C.y += jy * 0.5; }
      const vx = clamp(jump ? 0 : jx / dt, -3000, 3000), vy = clamp(jump ? 0 : jy / dt, -3000, 3000);
      // r7-fix：刹车——前视量跟着速度一起掉（降得比升得快四倍），镜头弹簧自己攒的速度也一并卸掉大半
      const sNow = Math.hypot(vx, vy), sOld = Math.hypot(SV.vx, SV.vy), brake = sNow < sOld * 0.85;
      const k = Math.min(1, dt * (brake ? 56 : 14));
      SV.vx += (vx - SV.vx) * k; SV.vy += (vy - SV.vy) * k;
      if (brake && C.on && sNow < Math.hypot(C.vx, C.vy) * 0.6) { const kd = Math.min(1, dt * 8); C.vx += (vx - C.vx) * kd; C.vy += (vy - C.vy) * kd; }
    } else if (!SV.on) { SV.vx = SV.vy = 0; }
    SV.on = true; SV.x = fx; SV.y = fy;
    fx += SV.vx * 0.18; fy += SV.vy * 0.18;
    const zT = clamp(Math.min(zFill, zNeed), g.minZoom, STAGE_ZMAX);
    // r9：他一下子到了画面边上（闪步、缩地落点在画外）：镜头当场往焦点挪六成，不等弹簧慢慢追（不然人被画边裁掉半个身子）
    if (hd && C.on && !cor) { try { const q = hd.project(a.x, a.y, a.z + FIG_H * 0.5); if (Math.abs(q.x - W / 2) > W * 0.4 || Math.abs(q.y - Hh / 2) > Hh * 0.4) { C.x += (fx - C.x) * 0.6; C.y += (fy - C.y) * 0.6; C.vx *= 0.3; C.vy *= 0.3; } } catch { /* */ } }
    this.shotInfo.zoom = C.z; this.shotInfo.both = both;
    if (hd) { try { const q0 = hd.project(a.x, a.y, a.z), q1 = hd.project(a.x, a.y, a.z + FIG_H); this.shotInfo.fill = Math.abs(q0.y - q1.y) / Hh; } catch { /* */ } }
    if (cor) { C.z = g.cam.zoom; C.vz = 0; }
    // 临界阻尼弹簧（位置 ω=8；推近 ω=7、要出画时拉远 ω=12）：起手那一下就推到位，不晕、不拖
    const n = dt > 0.034 ? 3 : 2, h = dt / n;
    const wP = 8, wZ = zT < C.z * 0.95 ? 12 : 10;
    for (let i = 0; i < n; i++) {
      C.vx += (wP * wP * (fx - C.x) - 2 * wP * C.vx) * h; C.vy += (wP * wP * (fy - C.y) - 2 * wP * C.vy) * h;
      C.x += C.vx * h; C.y += C.vy * h;
      if (!cor) { C.vz += (wZ * wZ * (zT - C.z) - 2 * wZ * C.vz) * h; C.z += C.vz * h; }
    }
    if (!cor) C.z = clamp(C.z, g.minZoom, STAGE_ZMAX);
    g.cam.x = C.x + g.debugCamDX; g.cam.y = C.y; g.cam.zoom = C.z;
    return true;
  }
  /** r8-p2：撼山客取景时对手离他多远以内才框进来（大招把人轰飞时招式调小：镜头留在他身上，被打的人飞出画面） */
  stageFar = 3000;
  /** r8-p1 侧面取景的那一份：谁在打谁、还剩多久、焦点往出招方向多看多少（r9：远近不再由招式给，按人占画面的比例量） */
  private side: { a: Enemy | null; b: Enemy | 'p' | null; t: number; lead: number } = { a: null, b: null, t: 0, lead: 0 };
  /**
   * 侧面取景（r8-p1 起，招式每帧调一次）：dur 息内镜头交给上面那一套（stageCam），焦点往出招方向多看 lead（0–1）。
   * push 是 r8 写死的推近倍数，r9 起不用了（推多近按人占画面的比例量），留着参数只为不改调用处
   */
  sideShot(a: Enemy, b: Enemy | 'p', dur = 0.5, push = 1.7, lead = 0) { void push; const S = this.side; S.a = a; S.b = b; S.t = Math.max(S.t, dur); S.lead = lead; }
  /** r9：招式命中时伤害再乘多少（撼山客燃身时第一阶段的招 ×1.15；world/hsp2.ts 挂上），不挂就是 1 */
  moveHitK: ((run: MoveRun) => number) | null = null;
  /** r9：这个人此刻燃着身没有（撼山客第二阶段；第一阶段的招燃身时带火，world/p1fx.ts 读） */
  burnOf: ((u: Enemy | null) => boolean) | null = null;
  /** 测试、试玩页读：侧面取景开着没有 */
  get sideOn() { return this.side.t > 0 && !!this.side.a; }
  /** r9：取景期间镜头里要看得见的人（render 把挡在镜头和他们之间的树、房渐隐）；没在取景就是 null */
  get shotWho(): (Enemy | 'p')[] | null { const S = this.stage; return S.t > 0 && S.a && this.cam.on ? (S.b ? [S.a, S.b] : [S.a]) : null; }
  /** 招式之外的一段也要框着（破界的那一趟：招已经交给 hsmoves3 的 trip 推着走了）：每帧调一次 */
  stageKeep(a: Enemy, b: Enemy | 'p') { const S = this.stage; S.a = a; S.b = b; S.t = Math.max(S.t, STAGE_HOLD); }
  /** 撼山客取景时另外要框进来的点 (x, y, 离地高度)：招式自己每帧写、用完清空（分海把劈开的那段海沟放进来） */
  stagePts: [number, number, number][] = [];
  /** 测试、试玩页读：撼山客出招的取景是不是开着 */
  get stageOn() { return this.stage.t > 0 && !!this.stage.a; }
  /**
   * 衣带、发丝随身飞：人物画法里飘带的风是「-st.vx + 风」（为了跑起来往后飘）。被击飞、欺身时人一帧要挪几十，
   * 照那个算飘带会被甩成两三倍长的直条；这里把 st.vx 换成「身体速度的负七成半」，风就和身体同向，飘带只是略往后拖。
   * （game.ts 每帧在移动积分后写 st.vx，镜头这一步在它之后、画面之前，所以放在这里。敌人的在 skipAI 里写。）
   */
  private clothWind() {
    const p = this.g.player, b = this.pb;
    if (b.air) { p.st.vx = -0.75 * b.vx; p.st.vy = -0.75 * b.vy; snapCloth(p.st); }
    else if (this.mv) { const e = this.mv.e, d = Math.hypot(e.x - p.x, e.y - p.y) || 1; p.st.vx = -0.75 * (e.x - p.x) / d * this.mv.speed; p.st.vy = -0.75 * (e.y - p.y) / d * this.mv.speed; snapCloth(p.st); }
  }
  /** 镜头现在是不是在近战手里（测试、界面用） */
  get camOn() { return this.cam.on; }

  // ------------------------------------------------------------ 界面
  /** 罡气条等（BrawlHUD 每 0.1 息读一次） */
  hud() {
    const pb = this.pb, o = this.foe, ob = o && this.B.get(o);
    const f = this.flung, fb = f && this.B.get(f);
    return {
      stance: this.stance,
      poise: pb.poise < 0 ? this.playerPoiseMax : pb.poise, poiseMax: pb.poiseMax || this.playerPoiseMax, broken: pb.breakT > 0,
      air: pb.air, techCd: pb.techCd, techCost: this.techCost,
      canPursue: !!(fb?.air && fb.chain < BX.pursuitMax && this.g.hero.realm >= 3), chain: fb?.chain ?? 0,
      /** 「追！」：一键追击俯冲（界内砸下去的人 / 虚空里坠向下界的流星）；ang = 屏幕上从你指向它的方向（弧度，算不出时为 null） */
      chase: this.chaseHud(),
      /** 被砸向下界、正在坠（按追击键脱困） */
      dropped: this.g.xukong.fall.mode === 'dropped',
      // 交手的对象：死了、不在战斗里了（换图、被救回、传送走）、你倒下了、离得太远，都不再挂着它的罡气条
      foe: o && !o.dead && !this.g.hero.dead && this.combat.enemies.includes(o) && Math.hypot(o.x - this.g.player.x, o.y - this.g.player.y) < 6000 && (this.engageT > 0 || ob?.air) ? { name: o.name, poise: ob ? Math.max(0, ob.poise) : this.poiseMaxOf(o), poiseMax: ob?.poiseMax || this.poiseMaxOf(o), broken: (ob?.breakT ?? 0) > 0, hp: Math.max(0, o.hp / o.maxHp) } : null,
      /** 拼招（三个选项、倒计时、结果） */
      clash: this.clash.hud(),
      /** 连段数（两下以上、还在连的时候显示）、收尾大字 */
      combo: this.g.time - this.comboAt < BX.comboGap && this.comboN >= 2 ? this.comboN : 0,
      finisher: this.finisher && this.finisher.t < 1.4 ? this.finisher.s : '',
      sunk: this.pSubT > 0,
      /** r7 重击定向：按着没有（touch = 触屏的小摇杆）、进了放慢没有、还剩多少（1 → 0）、选的上下、这一下能不能把人打飞、有没有对着人 */
      aim: this.aimHud(),
      /** 兵器线：手里的兵器（种类、名字、要点一句） */
      weapon: { kind: this.wk, name: this.weaponName, tip: this.F.tip },
    };
  }
  /** 手里兵器的名字（兵器槽里的物品名 / 本命飞剑的名字 / 空手） */
  get weaponName(): string {
    if (this.wk === 'fist') return '空手';
    const w = heldWeapon(this.g.hero);
    if (w.from === 'bond' && w.item) return `本命飞剑·${itemDef(w.item).name}`;
    return weaponTier(this.wk, this.wt)?.name ?? WEAPONS[this.wk].name;
  }
  private aimHud(): { touch: boolean; slow: boolean; left: number; v: Vert; ok: boolean; foe: boolean; jx: number; jy: number } | null {
    const A = this.aim; if (!A) return null;
    const av = this.aimView();
    return { touch: A.src === 'touch', slow: this.aimSlow, left: av?.left ?? clamp(1 - (A.t - BX.aimHold) / BX.aimMax, 0, 1), v: av?.v ?? this.vertMode(null), ok: !!av?.ok, foe: !!av, jx: A.jx, jy: A.jy };
  }
  private chaseHud(): { ang: number | null; void: boolean; plunging: boolean } | null {
    const g = this.g, V = g.xukong.fall;
    if (V.mode === 'meteor' && !V.drop?.placed) return { ang: Math.PI / 2, void: true, plunging: V.plunge };
    const e = this.chaseTarget(); if (!e) return null;
    let ang: number | null = null;
    const hd = g.renderer?.hd, p = g.player;
    if (hd) { try { const a = hd.project(p.x, p.y, p.st.lift + 40), b = hd.project(e.x, e.y, e.z + 40); ang = Math.atan2(b.y - a.y, b.x - a.x); } catch { /* 镜头还没好 */ } }
    return { ang, void: false, plunging: false };
  }
  /** 测试 / 试玩：让对手（会近战的）现在就扑过来——一上来就拼招用 */
  forceRush(e: Enemy) {
    const b = this.body(e); b.ai ??= newAI(true, e.def.kind !== 'human');
    const ai = b.ai; ai.tg = null; ai.pat = 'jjh'; ai.i = 0; ai.st = 'rush'; ai.t = 0; ai.sx = e.x; ai.sy = e.y; ai.cd = 0;
    this.live.add(e);
  }
  /** 测试用：近战自己的随机序列（给测试重置种子） */
  static rnd = brnd;
}


/** r19：夜无赦在场开打（或试玩演示）——这期间镜头的猛推换成很短很轻的一下（cameraTick） */
function ywsCamQuiet(g: unknown): boolean { const Y = (g as unknown as { yewushe?: { ent: unknown; mode: string } }).yewushe; return !!Y?.ent && (Y.mode === 'fight' || Y.mode === 'demo'); }
