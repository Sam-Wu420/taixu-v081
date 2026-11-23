// 代码绘制的人物（人物重做）
//  · 男女共用一套 3D 骨骼、动作、布料物理与分件绘制；脸（五官）、头型、身材、服饰全部是参数（gfx/renwu/*）。
//  · 换衣系统：衣裳 = 款式（领 / 袖 / 下裳 / 外罩 / 纹样）+ 染色；NPC 按身份挑衣裳，玩家在「衣橱」里换。
//  · 手：掌 + 五指 3D 骨架，12 种手势平滑过渡；手腕可用 IK 摆到指定位置（负手、交手、剑诀当胸、法诀）。
//    施法四式（剑指 / 推掌 / 掐诀 / 托天）：蓄 → 发（带过冲）→ 运劲微颤，指尖劲气 + 出手残影。
//  · 工笔画风：同色系描线、柔和明暗、领缘 / 袖口 / 下摆镶边与纹样；细节按屏幕像素分级（远景省掉手指、五官细节）。
import { shade as shade0, rgba as rgba0 } from '../core/canvas';
import { prof } from '../core/prof';
import { headTex, headTexReady, type HeadView } from './headTex';
import { drawArt } from './artifact';
import { artLook } from '../data/artlooks';
import type { Look, Gesture } from './renwu/types';
import { resolveLook, type RLook } from './renwu/params';
import { GESTURES, G_N, drawHand, armHandFrame, aimHandFrame, blendFrame, PALM_L, type HandFrame } from './renwu/hand';
import { headHullPts, drawFace, drawBeard, type FaceCtx } from './renwu/face';
import { OUTFIT_BY_ID, ROLE_OUTFITS, applyOutfit, type NpcRole } from './renwu/outfits';
import { weaponPaint, weaponSpan, paintWeapon, type WeaponPaint, type WeaponAxis } from './weapon';
import type { WeaponKind } from '../data/weapons';

export type { Look, Sex, HairStyle, Fringe, FaceParams, HeadParams, BodyParams, Gesture, IdleStyle, EyeShape, BrowShape } from './renwu/types';
export type { NpcRole, Wardrobe, Outfit, Dye } from './renwu/outfits';
export { OUTFITS, OUTFIT_BY_ID, outfitsFor, applyOutfit, dressLook, DEFAULT_WARDROBE, HAIR_COLORS, SKIN_COLORS, HAIR_NAMES, IDLE_NAMES } from './renwu/outfits';
export { FACE_SLIDERS, HEAD_SLIDERS, BODY_SLIDERS, EYE_NAMES, BROW_NAMES, FRINGE_NAMES, genFace, genHead, genBody, defaultFace, defaultHead, defaultBody, resolveLook } from './renwu/params';
export { GESTURES, GESTURE_NAMES } from './renwu/hand';

// 颜色运算缓存（人群里每帧要算上千次）
// 两级表（颜色 → 数值 → 结果），不再每次拼字符串当键
const SHC = new Map<string, Map<number, string>>(), RGC = new Map<string, Map<number, string>>();
let shN = 0;
function memo(tab: Map<string, Map<number, string>>, c: string, k: number, f: (c: string, k: number) => string) {
  let m = tab.get(c);
  if (!m) { if (shN > 6000) { SHC.clear(); RGC.clear(); shN = 0; } m = new Map(); tab.set(c, m); }
  let r = m.get(k);
  if (r === undefined) { r = f(c, k); m.set(k, r); shN++; }
  return r;
}
function shade(c: string, k: number) { return memo(SHC, c, k, shade0); }
function rgba(c: string, a: number) { return memo(RGC, c, a, rgba0); }
const inkOf = (c: string) => rgba(shade(c, -0.62), 0.92);

// punch / smash / rush / tumble：贴身斗法（world/brawl.ts）的出拳、重击、化虹欺身、被击飞
// grab（抓投：双手揪住、拧身往肩后甩）、feint（佯攻后撤：虚晃一拳、重心后坐）是收官第三轮加的近战姿势
// 近战兵器线（只增不改）：剑五式轻击 swordL1–L5、斩 swordH、突进 swordR；重兵三式 heavyL1–L3、抡砸 heavyH、冲撞 heavyR；
// 长枪四式 spearL1–L4、挑 spearH、扫 spearS、突刺 spearR。兵器动作一律把兵器拿在手里（不看 CharState.armed）。
export type WeaponAction =
  | 'swordL1' | 'swordL2' | 'swordL3' | 'swordL4' | 'swordL5' | 'swordH' | 'swordR'
  | 'heavyL1' | 'heavyL2' | 'heavyL3' | 'heavyH' | 'heavyR'
  | 'spearL1' | 'spearL2' | 'spearL3' | 'spearL4' | 'spearH' | 'spearS' | 'spearR'
  // r16 魂镰（只增不改）：撩 scytheL1、横扫 scytheL2、回身劈 scytheL3（收式）、回旋 scytheH、空斩 scytheR——照夜无赦的魂镰三式、回旋魂镰、空斩
  | 'scytheL1' | 'scytheL2' | 'scytheL3' | 'scytheH' | 'scytheR';
// r7 撼山客（只增不改）：drink 喝酒、stomp 震脚、elbow 侧身一肘（后发先至）、shout 气合（第一批）
// 撼山客招式第二批（连击、擒拿；只增不改）：姿势在文件末尾 hsPose。名字以 hs 开头（poseFor 按前缀分发）
export type HsAction =
  | 'hsDrag' | 'hsDragged' | 'hsBarrage' | 'hsPoke' | 'hsKick' | 'hsHammer' | 'hsHug' | 'hsInvert' | 'hsPlunge'
  | 'hsSwing' | 'hsSwung' | 'hsLift' | 'hsHurl';
const HS_ACTION_NAMES: Record<HsAction, string> = {
  hsDrag: '按头疾冲', hsDragged: '被按着拖行', hsBarrage: '百裂拳', hsPoke: '点穴', hsKick: '踢天', hsHammer: '双拳砸落', hsHug: '抱摔',
  hsInvert: '被倒栽', hsPlunge: '倒栽俯冲', hsSwing: '抡人', hsSwung: '被抡起', hsLift: '举山', hsHurl: '掷山',
};
// r8-p1 撼山客第一阶段照参考视频还原的动作（只增不改）：关键帧表在文件末尾「关键帧动作」一段（卡帧、拉长手脚、多重肢体、拖影帧）
export type P1Action =
  | 'p1Guard' | 'p1Cross' | 'p1Armor' | 'p1Duanmai' | 'p1Elbow' | 'p1Kao' | 'p1Dash' | 'p1Jab' | 'p1Upper'
  | 'p1HighKick' | 'p1SideKick' | 'p1Sweep' | 'p1JumpKick' | 'p1Knee' | 'p1Crouch' | 'p1FlyKick';
const P1_ACTION_NAMES: Record<P1Action, string> = {
  p1Guard: '架势', p1Cross: '崩拳（停半拍）', p1Armor: '金刚架', p1Duanmai: '断脉腿', p1Elbow: '弓步顶肘', p1Kao: '铁山靠', p1Dash: '闪步',
  p1Jab: '直拳', p1Upper: '勾拳', p1HighKick: '高侧踢', p1SideKick: '侧踢', p1Sweep: '扫腿', p1JumpKick: '腾空旋踢', p1Knee: '冲膝', p1Crouch: '伏身蓄势', p1FlyKick: '飞身侧踹',
};
export type Action = 'idle' | 'walk' | 'run' | 'fly' | 'sit' | 'cast' | 'hit' | 'dodge' | 'gather' | 'punch' | 'smash' | 'rush' | 'tumble' | 'grab' | 'feint' | 'swim' | 'drink' | 'stomp' | 'elbow' | 'shout' | WeaponAction | HsAction | Hs3Action | P1Action | P2Action;
export const ACTION_NAMES: Record<Action, string> = {
  idle: '待机', walk: '行走', run: '奔跑', fly: '御剑', sit: '打坐', cast: '施法', hit: '受击', dodge: '闪避', gather: '采集',
  punch: '出拳', smash: '重击', rush: '欺身', tumble: '倒飞', grab: '抓投', feint: '虚晃', swim: '划水',
  drink: '喝酒', stomp: '震脚', elbow: '侧身肘击', shout: '气合',
  swordL1: '剑·斜劈', swordL2: '剑·反撩', swordL3: '剑·平斩', swordL4: '剑·直刺', swordL5: '剑·回身劈', swordH: '剑·斩', swordR: '剑·突进',
  heavyL1: '重兵·斜劈', heavyL2: '重兵·横扫', heavyL3: '重兵·上撩', heavyH: '重兵·抡砸', heavyR: '重兵·冲撞',
  spearL1: '枪·直刺', spearL2: '枪·上刺', spearL3: '枪·横拦', spearL4: '枪·回马刺', spearH: '枪·挑', spearS: '枪·扫', spearR: '枪·突刺',
  scytheL1: '镰·撩', scytheL2: '镰·横扫', scytheL3: '镰·回身劈', scytheH: '镰·回旋', scytheR: '镰·空斩',
  hs3Crouch: '沉身蓄劲', hs3Upper: '冲天拳', hs3Kick: '还界脚', hs3Stomp: '千钧踩落', hs3Leap: '纵身',   // 撼山客第三批（文件末尾那一段）
  hs3Spin: '旋身甩火', hs3Brace: '弓步举拳蓄力', hs3Cannon: '弓步炮拳', hs3AirPunch: '空中回身拳',   // r7-fx3d：照参考视频「烈火强拳」「强袭重击」
  ...HS_ACTION_NAMES,
  p2Xuan: '赤焰回旋腿', p2Yan: '燕旋', p2Sui: '碎心踢', p2Zhui: '坠火踢', p2Jie: '解放', p2Ba: '霸皇蹴', p2Ri: '逐日', p2Gang: '赤阳罡',   // r8-p2 撼山客第二阶段（文件末尾那一段）
  ...P1_ACTION_NAMES,
};

export const HANLI_LOOK: Look = applyOutfit({
  sex: 'm', height: 1, build: 1, skin: '#f1d9bd', hair: '#1d1a17', hairStyle: 'bun',
  robe: '#3f6a4c', inner: '#ece6d6', trim: '#2b4636', belt: '#1f2420', pants: '#8a7a62', boots: '#2a2622',
  robeLen: 'long', sleeve: 'wide', ribbon: '#2a3a30', back: 'none', waist: 'pouch', hand: 'none',
  swordColor: '#7ff0c0', hero: true, idle: 'behind',
  face: { eye: 'narrow', eyeSize: 0.97, eyeTilt: 0.12, brow: 'sword', browW: 1.0, smile: 0.05, blush: 0.1, iris: '#3a2a1e' },
  head: { jaw: 0.4, cheek: 0.12 }, body: {},
}, 'qingshan', 0);

// ---------------------------------------------------------------- 姿态
export interface Pose {
  rootY: number; rootX: number; rootZ: number;
  lean: number; side: number; twist: number;
  /** 腾空（贴地之后再整体抬起，用于奔跑的腾空期） */
  air: number;
  headPitch: number; headYaw: number; breath: number;
  lSh: number; lShR: number; lEl: number; lFr: number;
  rSh: number; rShR: number; rEl: number; rFr: number;
  lHip: number; lHipR: number; lKn: number;
  rHip: number; rHipR: number; rKn: number;
  lFoot: number; rFoot: number;
  sit: number; eyes: number; ground: number;
  /** 手腕 IK：权重 + 目标（躯干坐标，x 以该手一侧为正）+ 指向 + 掌心朝向 */
  lIK: number; lTx: number; lTy: number; lTz: number; lAx: number; lAy: number; lAz: number; lNx: number; lNy: number; lNz: number;
  rIK: number; rTx: number; rTy: number; rTz: number; rAx: number; rAy: number; rAz: number; rNx: number; rNy: number; rNz: number;
  /** 前臂旋后（掌心朝上/朝前为正）、腕屈（向掌心为正） */
  lSup: number; rSup: number; lWb: number; rWb: number;
  /** 劲气（出手发力的强度）、张口 */
  lFx: number; rFx: number; mouth: number;
  lG: Gesture; rG: Gesture;
  /** 近战兵器：wArm > 0.5 拿在手里（否则斜背在背后）；wD 刃向（躯干坐标：x 角色左、y 上、z 前）；w2 双手握；wSlide 手在杆上往刃尖挪了多少（持枪而立时枪尾拄地） */
  wArm: number; wDx: number; wDy: number; wDz: number; w2: number; wSlide: number;
  /** r8-p1 拉长手脚（squash & stretch）：四肢骨长倍数、拳头大小倍数（默认 1；出手那一两帧临时放大，收招弹回） */
  lArmS: number; rArmS: number; lLegS: number; rLegS: number; lHandS: number; rHandS: number;
}
const POSE_KEYS: (keyof Pose)[] = ['rootY', 'rootX', 'rootZ', 'lean', 'side', 'twist', 'air', 'headPitch', 'headYaw', 'breath',
  'lSh', 'lShR', 'lEl', 'lFr', 'rSh', 'rShR', 'rEl', 'rFr', 'lHip', 'lHipR', 'lKn', 'rHip', 'rHipR', 'rKn', 'lFoot', 'rFoot', 'sit', 'eyes', 'ground',
  'lIK', 'lTx', 'lTy', 'lTz', 'lAx', 'lAy', 'lAz', 'lNx', 'lNy', 'lNz', 'rIK', 'rTx', 'rTy', 'rTz', 'rAx', 'rAy', 'rAz', 'rNx', 'rNy', 'rNz',
  'lSup', 'rSup', 'lWb', 'rWb', 'lFx', 'rFx', 'mouth', 'wArm', 'wDx', 'wDy', 'wDz', 'w2', 'wSlide',
  'lArmS', 'rArmS', 'lLegS', 'rLegS', 'lHandS', 'rHandS'];

function neutral(): Pose {
  return {
    rootY: 0, rootX: 0, rootZ: 0, lean: 0.02, side: 0, twist: 0, air: 0, headPitch: 0, headYaw: 0, breath: 0,
    lSh: 0.05, lShR: 0.11, lEl: 0.26, lFr: 0.06, rSh: 0.05, rShR: 0.11, rEl: 0.26, rFr: 0.06,
    lHip: 0, lHipR: 0.035, lKn: 0.05, rHip: 0, rHipR: 0.035, rKn: 0.05, lFoot: 0, rFoot: 0,
    sit: 0, eyes: 1, ground: 1,
    lIK: 0, lTx: 0, lTy: 0, lTz: 0, lAx: 0, lAy: 0, lAz: 0, lNx: 0, lNy: 0, lNz: 0,
    rIK: 0, rTx: 0, rTy: 0, rTz: 0, rAx: 0, rAy: 0, rAz: 0, rNx: 0, rNy: 0, rNz: 0,
    lSup: -0.15, rSup: -0.15, lWb: 0.1, rWb: 0.1, lFx: 0, rFx: 0, mouth: 0, lG: 'relax', rG: 'relax',
    wArm: 0, wDx: 0, wDy: 0, wDz: 1, w2: 0, wSlide: 0,
    lArmS: 1, rArmS: 1, lLegS: 1, rLegS: 1, lHandS: 1, rHandS: 1,
  };
}
type T3 = [number, number, number];
/** 手腕 IK（躯干坐标：x 以该手一侧为正——自动左右镜像；y 相对胸口向上；z 向前） */
function ik(p: Pose, side: 1 | -1, w: number, t: T3, aim: T3, palm: T3, g?: Gesture) {
  if (side > 0) { p.lIK = w; [p.lTx, p.lTy, p.lTz] = t; [p.lAx, p.lAy, p.lAz] = aim; [p.lNx, p.lNy, p.lNz] = palm; if (g) p.lG = g; }
  else { p.rIK = w; [p.rTx, p.rTy, p.rTz] = t; [p.rAx, p.rAy, p.rAz] = aim; [p.rNx, p.rNy, p.rNz] = palm; if (g) p.rG = g; }
}

// ---------------------------------------------------------------- 布料
export class Strand {
  /** 世界绝对坐标需要双精度，避免远处节点的高帧率速度被量化。 */
  x: Float64Array<ArrayBuffer>; y: Float64Array<ArrayBuffer>; ox: Float64Array<ArrayBuffer>; oy: Float64Array<ArrayBuffer>; n: number; len: number; inited = false;
  /** 上一子步的步长（x - ox 是在这段时间里走的位移） */
  private hPrev = 0;
  constructor(n: number, len: number) {
    this.n = n; this.len = len;
    this.x = new Float64Array(n); this.y = new Float64Array(n); this.ox = new Float64Array(n); this.oy = new Float64Array(n);
  }
  reset(ax: number, ay: number, dx = 0, dy = 1) {
    for (let i = 0; i < this.n; i++) { this.x[i] = this.ox[i] = ax + dx * this.len * i; this.y[i] = this.oy[i] = ay + dy * this.len * i; }
    this.inited = true; this.hPrev = 0;
  }
  step(ax: number, ay: number, dt: number, gx: number, gy: number, wx: number, wy: number, drag: number, len: number, maxSteps = 8) {
    this.len = len;
    if (!this.inited || Math.abs(ax - this.x[0]) > len * 30 || Math.abs(ay - this.y[0]) > len * 30) this.reset(ax, ay);
    const n = this.n;
    this.x[0] = ax; this.y[0] = ay;
    if (dt <= 0) return;
    // 布料稳定性（参照重构版）：子步上限 4 → 8；Verlet 速度要除以「上一步」的步长——帧时波动（60↔144Hz、卡顿后）
    // 时用本帧步长去除会把速度算错，飘带头发抖动甚至甩飞。稳定 60Hz 时与原结果完全相同。
    const steps = Math.min(maxSteps, Math.max(1, Math.ceil(dt / (1 / 60))));
    const h = dt / steps;
    let hv = this.hPrev || h;
    for (let s = 0; s < steps; s++) {
      for (let i = 1; i < n; i++) {
        const vx = (this.x[i] - this.ox[i]) / hv, vy = (this.y[i] - this.oy[i]) / hv;
        const k = i / (n - 1);
        const ax2 = gx + (wx - vx) * drag * (0.4 + k * 0.6), ay2 = gy + (wy - vy) * drag * (0.4 + k * 0.6);
        this.ox[i] = this.x[i]; this.oy[i] = this.y[i];
        this.x[i] += vx * h * 0.985 + ax2 * h * h;
        this.y[i] += vy * h * 0.985 + ay2 * h * h;
      }
      hv = h;
      for (let it = 0; it < 3; it++) {
        for (let i = 1; i < n; i++) {
          const dx = this.x[i] - this.x[i - 1], dy = this.y[i] - this.y[i - 1];
          const d = Math.hypot(dx, dy) || 1e-4;
          const diff = (d - len) / d;
          if (i === 1) { this.x[i] -= dx * diff; this.y[i] -= dy * diff; }
          else {
            this.x[i] -= dx * diff * 0.5; this.y[i] -= dy * diff * 0.5;
            this.x[i - 1] += dx * diff * 0.5; this.y[i - 1] += dy * diff * 0.5;
          }
        }
        this.x[0] = ax; this.y[0] = ay;
      }
    }
    this.hPrev = h;
  }
}

class Spring {
  x = 0; y = 0; vx = 0; vy = 0; inited = false;
  step(tx: number, ty: number, dt: number, k: number, c: number, maxSteps = 4) {
    if (!this.inited || Math.abs(tx - this.x) > 400 || Math.abs(ty - this.y) > 400) { this.x = tx; this.y = ty; this.vx = this.vy = 0; this.inited = true; return; }
    if (dt <= 0) return;
    const steps = Math.min(maxSteps, Math.max(1, Math.ceil(dt / (1 / 60))));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.vx += ((tx - this.x) * k - this.vx * c) * h;
      this.vy += ((ty - this.y) * k - this.vy * c) * h;
      this.x += this.vx * h; this.y += this.vy * h;
    }
  }
}

export type CharacterPhysics = Pick<CharState, 'strands' | 'springs' | 'hp'>;

/** structured clone 保留数值和数组，但需要恢复物理对象的方法。 */
export function restoreCharacterPhysics(st: CharState, physics: CharacterPhysics): void {
  for (const strand of physics.strands.values()) Object.setPrototypeOf(strand, Strand.prototype);
  for (const spring of physics.springs.values()) Object.setPrototypeOf(spring, Spring.prototype);
  st.strands = physics.strands; st.springs = physics.springs; st.hp = physics.hp;
}

// ---------------------------------------------------------------- 角色状态
export class CharState {
  x = 0; y = 0;
  yaw = 0; targetYaw = 0;
  action: Action = 'idle';
  /** gait: walk / run / null —— 由 game 每帧写入，决定腿部是否摆（否则只有上半身动） */
  gait: 'walk' | 'run' | null = null;
  actionT = 0;
  phase = 0;
  speed = 0; vx = 0; vy = 0;
  lift = 0;
  t = Math.random() * 100;
  seed = Math.random() * 1000;
  blend = 1;
  from: Pose | null = null;
  last: Pose | null = null;
  strands = new Map<string, Strand>();
  springs = new Map<string, Spring>();
  windX = 0; windY = 0;
  /** 两只手当前的指节角度（向目标手势平滑过渡） */
  hands: [Float32Array, Float32Array] = [GESTURES.relax.slice(), GESTURES.relax.slice()];
  handInit = false;
  /** 第几次出手（轮换施法四式） */
  castN = 0;
  /** 上一帧手的位置（相对脚底，画出手残影） */
  hp: [number, number, number, number] = [NaN, NaN, NaN, NaN];
  /** 近战兵器线：外观上有兵器时，true = 拿在手里（站、走、跑都是持兵器的架势），false = 收着（斜背在背后）。兵器动作不看它，一律拿在手里 */
  armed = false;
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }

  setAction(a: Action) {
    if (a === this.action) return;
    this.from = this.last ? { ...this.last } : null;
    this.blend = 0;
    this.action = a; this.actionT = 0;
    if (a === 'cast') this.castN++;
  }
  /** 同一个动作再来一遍（连拳：每一拳都从头出，castN 顺带轮换出拳的式子；castN 也是人物缓存 / 画人线程认的键） */
  restart(a: Action) {
    this.from = this.last ? { ...this.last } : null;
    this.blend = this.action === a ? 0.45 : 0;   // 连着出拳时少过渡一点，拳头才收得回、打得出
    this.action = a; this.actionT = 0; this.castN++;
  }
  /** 每次真正起手施法都强制重启手势：连续施法会打断上一式，并轮换下一式 */
  castPose() {
    this.from = this.last ? { ...this.last } : null;
    this.blend = 0;
    this.action = 'cast';
    this.actionT = 0;
    this.castN++;
  }
  /** 根据移动向量设置朝向（8 方向），dx/dy 为地图方向 */
  faceToward(dx: number, dy: number, eight = true) {
    if (Math.abs(dx) + Math.abs(dy) < 1e-4) return;
    let a = Math.atan2(dx, dy);
    if (eight) a = Math.round(a / (Math.PI / 4)) * (Math.PI / 4);
    this.targetYaw = a;
  }
  update(dt: number) {
    this.t += dt; this.actionT += dt;
    this.blend = Math.min(1, this.blend + dt / 0.16);
    let d = this.targetYaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const turn = Math.min(1, dt * 11);
    this.yaw += d * turn;
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2; else if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
    if (this.action === 'walk') this.phase += dt * (3.2 + this.speed * 0.028);
    else if (this.action === 'run') this.phase += dt * (6.5 + this.speed * 0.012);
    // 移动中施法：腿在走/跑，步频也得跟着走（否则步态相位冻在 1.2 的待机速率上）
    else if (this.gait === 'run') this.phase += dt * (6.5 + this.speed * 0.012);
    else if (this.gait === 'walk') this.phase += dt * (3.2 + this.speed * 0.028);
    else this.phase += dt * 1.2;
  }
}

// ---------------------------------------------------------------- 体型尺寸
interface Dims { sw: number; hw: number; ww: number; td: number; hk: number; torsoL: number; upL: number; foL: number; thL: number; shL: number; handK: number }
const DIMS = new WeakMap<RLook, Dims>();
function dimsOf(look: Look, R: RLook): Dims {
  let d = DIMS.get(R);
  if (d) return d;
  const f = R.fem, B = R.body;
  d = {
    sw: (f ? 6.8 : 8.5) * look.build * B.shoulder,
    hw: (f ? 7.4 : 6.9) * B.hip * (0.9 + 0.1 * B.heft),
    ww: (f ? 4.9 : 6.3) * B.waist * (0.72 + 0.28 * B.heft),
    td: (f ? 4.4 : 5.2) * (0.8 + 0.2 * B.heft),
    hk: (f ? 1.0 : 1.05) * R.head.size,
    torsoL: f ? 20.4 : 21.4,
    upL: 13.6 * B.arm, foL: 11.4 * B.arm,
    thL: 22.8 * B.leg, shL: 21.8 * B.leg,
    handK: (f ? 0.84 : 0.97) * (0.94 + 0.06 * B.heft),
  };
  DIMS.set(R, d);
  return d;
}

// ---------------------------------------------------------------- 动作 → 姿态
function smooth01(t: number) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
function backOut(t: number) { t = Math.max(0, Math.min(1, t)); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 待机 / 行走时的手：负手、交手、当胸（权重 w 便于行走时减弱） */
function idleHands(p: Pose, R: RLook, D: Dims, look: Look, w = 1) {
  const td = D.td;
  const behind = (side: 1 | -1, k = 1) => ik(p, side, w * k, [-1.7, -15.4, -(td + 2.7)], [-1, -0.3, -0.1], [0.1, 0.15, -1], side > 0 ? 'relax' : 'fist');
  if (look.hand === 'staff') {
    p.rSh = 0.16; p.rShR = 0.26; p.rEl = 0.78; p.rFr = 0; p.rSup = 0.05; p.rWb = 0.05; p.rG = 'grip';
    if (R.idle === 'behind') behind(1);
    return;
  }
  if (look.hand === 'fan') {
    ik(p, -1, w, [0.6, -5.5, td + 3.6], [-0.25, 0.8, 0.5], [-1, 0.1, 0.25], 'grip');
    if (R.idle === 'behind' || !R.fem) behind(1, 0.9);
    return;
  }
  if (R.idle === 'behind') { behind(1); if (R.old > 0.5) behind(-1, 1); }
  else if (R.idle === 'clasp') {
    ik(p, 1, w, [-0.8, -14.0, td + 1.5], [-0.9, -0.45, 0.12], [0, 0.15, -1], 'relax');
    ik(p, -1, w, [-0.2, -13.2, td + 2.3], [-0.9, -0.4, 0.18], [0, 0.1, -1], 'relax');
  } else if (R.idle === 'chest') {
    if (R.fem) {
      ik(p, -1, w, [-1.2, -4.8, td + 3.1], [-0.25, 0.9, 0.35], [-1, 0, 0.3], 'lotus');
      ik(p, 1, w, [-0.9, -14.0, td + 1.6], [-0.9, -0.45, 0.12], [0, 0.15, -1], 'relax');
    } else {
      ik(p, -1, w, [-1.6, -6.2, td + 3.0], [-1, 0.1, 0.25], [0, -0.3, -1], 'relax');
      behind(1);
    }
  }
}

/** 主角 / 所有人共用的奔跑：高抬膝、腾空、肩髋反向扭转、屈肘摆臂 */


function poseFor(st: CharState, look: Look, R: RLook): Pose {
  const p = neutral();
  const D = dimsOf(look, R);
  const t = st.t, a = st.action, at = st.actionT, fem = R.fem, td = D.td;
  const br = Math.sin(t * 1.7 + st.seed);
  if (a === 'idle') {
    p.breath = br;
    p.lSh = 0.05 + 0.02 * Math.sin(t * 1.7 + 1); p.rSh = 0.05 + 0.02 * Math.sin(t * 1.7 + 1.3);
    p.side = 0.02 * Math.sin(t * 0.45 + st.seed);
    p.lHipR = (fem ? 0.02 : 0.05) + p.side; p.rHipR = (fem ? 0.02 : 0.05) - p.side;
    if (fem) { p.lHip = 0.06; p.rHip = -0.04; p.rKn = 0.16; p.side += 0.03; }   // 女：一腿微屈，重心偏一侧
    const g = Math.sin(t * 0.37 + st.seed * 3) + Math.sin(t * 0.21 + st.seed);
    p.headYaw = g > 1.2 ? 0.35 : g < -1.3 ? -0.3 : 0;
    p.headPitch = 0.02 * br + (fem ? 0.04 : 0);
    idleHands(p, R, D, look);
  } else if (a === 'walk') {
    const ph = st.phase, s = Math.sin(ph), c = Math.cos(ph);
    const A = fem ? 0.32 : 0.4;
    p.lHip = A * s; p.rHip = -A * s;
    p.lKn = 0.08 + 0.75 * Math.pow(Math.max(0, c), 2); p.rKn = 0.08 + 0.75 * Math.pow(Math.max(0, -c), 2);
    p.lFoot = -0.25 * Math.max(0, -s); p.rFoot = -0.25 * Math.max(0, s);
    const sw = fem ? 0.18 : 0.3;
    p.lSh = -sw * s; p.rSh = sw * s;
    p.lEl = 0.24 + 0.25 * Math.max(0, -s); p.rEl = 0.24 + 0.25 * Math.max(0, s);
    p.lWb = 0.12 - 0.18 * c; p.rWb = 0.12 + 0.18 * c;
    p.twist = 0.07 * s; p.lean = 0.06; p.side = 0.025 * c;
    if (fem) { p.side += 0.035 * s; p.rootX = 0.5 * s; p.lHipR = p.rHipR = 0.0; }
    p.rootY = 0.5 * Math.cos(ph * 2);
    p.breath = br * 0.5;
    if (R.idle !== 'stand' || look.hand !== 'none') {
      idleHands(p, R, D, look, 1);
      // 负手而行：另一只手照常摆
    }
  } else if (a === 'run') {
    runPose(p, st, R);
  } else if (a === 'fly') {
    const mv = Math.min(1, st.speed / 200);
    p.lHip = 0.2; p.rHip = -0.25; p.lKn = 0.32; p.rKn = 0.18; p.lHipR = 0.1; p.rHipR = 0.1;
    p.rFoot = -0.15;
    ik(p, -1, 1, [-1.3, -3.0, td + 3.4], [-0.12, 1, 0.3], [-1, 0, 0.2], fem ? 'lotus' : 'sword');   // 剑诀当胸
    ik(p, 1, 1, [-1.7, -15.0, -(td + 2.7)], [-1, -0.3, -0.1], [0.1, 0.15, -1], 'relax');             // 负手
    p.lean = 0.06 + 0.16 * mv; p.headPitch = -0.05 * mv;
    p.breath = br * 0.6;
  } else if (a === 'sit') {
    p.sit = 1; p.ground = 0;
    p.lHip = 1.35; p.rHip = 1.35; p.lHipR = 0.8; p.rHipR = 0.8; p.lKn = 2.6; p.rKn = 2.6;
    ik(p, 1, 1, [-1.5, -19.6, td + 2.2], [-0.75, 0, 0.65], [0, 1, 0], 'seal');
    ik(p, -1, 1, [-1.2, -19.0, td + 2.6], [-0.75, 0, 0.65], [0, 1, 0], 'seal');
    p.lean = 0.0; p.headPitch = 0.12; p.eyes = 0;
    p.breath = Math.sin(t * 0.9 + st.seed) * 1.2;
    p.rootY = 1.2 * Math.sin(t * 0.8);
  } else if (a === 'swim') {
    // 收官 B4 / 打磨：划水（蛙泳）。原先水下、泅水时还是站着走路的样子。
    // 身子前倾、抬头；双臂往前探、向两侧划开再收回胸前；腿一收一蹬，比划臂慢半拍。停着也慢慢踩水（节奏随速度加快）
    const ph = t * (1.7 + Math.min(2.2, st.speed / 110)) + st.seed, s = Math.sin(ph), c = Math.cos(ph);
    const pull = 0.5 + 0.5 * s, kick = 0.5 + 0.5 * Math.sin(ph - 1.3);
    p.lean = 0.3 + 0.05 * c; p.headPitch = -0.25;
    // 人物立板是正对镜头的：手臂往前举在画面上就成了「举过头顶」——所以划臂主要往两侧张开、收回胸前（正面看是踩水划水），只略往前探
    p.lSh = p.rSh = 0.55 - 0.35 * pull;
    p.lShR = p.rShR = 0.35 + 1.0 * pull;
    p.lEl = p.rEl = 0.5 + 0.9 * Math.max(0, -c);
    p.lFr = p.rFr = -0.3; p.lSup = p.rSup = 0.35; p.lWb = p.rWb = 0.15 * c;
    p.lG = p.rG = 'open';
    p.lHip = p.rHip = -0.2 + 0.85 * kick; p.lKn = p.rKn = 0.15 + 1.55 * kick;
    p.lHipR = p.rHipR = 0.12 + 0.38 * kick; p.lFoot = p.rFoot = -0.45;
    p.rootY = 1.6 * s; p.breath = br * 0.4; p.mouth = 0.15;
  } else if (a === 'cast') {
    castPose(p, st, R, D);
  } else if (a === 'punch' || a === 'smash' || a === 'rush' || a === 'tumble' || a === 'grab' || a === 'feint') {
    brawlPose(p, st, R, D, a);
  } else if (KEY_TRACKS.has(a)) {
    trackPose(p, st, a);   // r8-p1 / r9：关键帧动作（卡帧、拉长手脚、多重肢体、拖影帧；第一、第二阶段同一套，文件末尾「关键帧动作」一段）
  } else if (HS3_ACTION_SET.has(a)) {
    hs3Pose(p, st, R, D, a as Hs3Action);   // 撼山客第三批（文件末尾那一段）
  } else if (WEAPON_ACTION_SET.has(a)) {
    weaponPose(p, st, look, R, D, a as WeaponAction);
  } else if (a.startsWith('hs')) {
    hsPose(p, st, R, D, a as HsAction);   // 撼山客招式第二批（文件末尾）
  } else if (a === 'gather') {
    const k = smooth01(at / 0.3);
    p.lHip = 1.25 * k; p.lKn = 2.0 * k + 0.05; p.rHip = -0.35 * k; p.rKn = 1.5 * k + 0.05; p.rFoot = 0.6 * k;
    p.lean = 0.42 * k; p.headPitch = 0.3 * k;
    p.rSh = 0.05 + 1.05 * k + Math.sin(at * 6) * 0.06 * k; p.rEl = 0.25; p.rShR = 0.05; p.rSup = -0.6 * k; p.rWb = 0.35 * k; p.rG = 'pinch';
    p.lSh = 0.3 * k; p.lEl = 1.4 * k + 0.2; p.lFr = -0.5 * k; p.lSup = -0.8 * k; p.lG = 'relax';
  } else if (a === 'hit') {
    // r12-anim：后仰到顶（0.225 息）以后不再回到笔直的站姿——长的硬直、眩晕、被定住时原先过了 0.45 息就是一个「站着不动」的人，
    // 这时再被推着、拖着走就是站姿在平移。现在到顶后慢慢回落到四成，带一点晃，看得出还在挨打发懵
    const k = at < 0.225 ? Math.sin(Math.PI * at / 0.45) : 0.4 + 0.6 * Math.exp(-(at - 0.225) * 5) + 0.06 * Math.sin(t * 5.3 + st.seed) * smooth01((at - 0.4) / 0.3);
    p.lean = -0.38 * k; p.headPitch = -0.35 * k;
    p.lShR = 0.13 + 0.7 * k; p.rShR = 0.13 + 0.7 * k; p.lSh = 0.05 + 0.4 * k; p.rSh = 0.05 + 0.35 * k;
    p.lEl = 0.2 + 0.6 * k; p.rEl = 0.2 + 0.6 * k; p.lWb = -0.5 * k; p.rWb = -0.5 * k;
    p.rootZ = -3.5 * k; p.lKn = 0.05 + 0.35 * k; p.rKn = 0.05 + 0.25 * k; p.lHip = -0.25 * k; p.rHip = 0.2 * k;
    p.lG = p.rG = k > 0.2 ? 'open' : 'relax'; p.mouth = 0.7 * k; p.eyes = k > 0.5 ? 0 : 1;
  } else if (a === 'dodge') {
    const k = Math.sin(Math.PI * Math.min(1, at / 0.38));
    p.lean = 0.32 * k; p.side = 0.45 * k; p.rootX = 5 * k;
    p.lKn = 0.05 + 0.85 * k; p.rKn = 0.05 + 0.7 * k; p.lHip = 0.5 * k; p.rHip = 0.1 * k;
    p.lHipR = 0.04 + 0.35 * k; p.rHipR = 0.04 + 0.1 * k;
    p.lShR = 0.13 + 0.9 * k; p.rShR = 0.13 + 0.5 * k; p.lEl = 0.6 * k + 0.2; p.rEl = 0.4 * k + 0.2;
    p.lSup = 0.6 * k; p.rSup = 0.3 * k; p.lG = 'open'; p.rG = k > 0.3 ? 'palm' : 'relax';
    p.headYaw = -0.2 * k;
  } else if (a === 'drink' || a === 'stomp' || a === 'elbow' || a === 'shout') {
    tixiuPose(p, st, R, D, a);
  }
  // 近战兵器线：拿着兵器站、走、跑（架势里）——腿照常，手换成持兵器的样子
  if (st.armed && (a === 'idle' || a === 'walk' || a === 'run' || a === 'dodge') && armedKind(look)) armedHands(p, st, look, R, D);
  if (fem && a !== 'sit') { p.lShR -= 0.03; p.rShR -= 0.03; }
  return p;
}

// ---------------------------------------------------------------- 近战兵器：握法与出招姿势
const WEAPON_ACTION_SET = new Set<Action>(['swordL1', 'swordL2', 'swordL3', 'swordL4', 'swordL5', 'swordH', 'swordR', 'heavyL1', 'heavyL2', 'heavyL3', 'heavyH', 'heavyR', 'spearL1', 'spearL2', 'spearL3', 'spearL4', 'spearH', 'spearS', 'spearR', 'scytheL1', 'scytheL2', 'scytheL3', 'scytheH', 'scytheR']);
/** 这个动作是不是兵器动作 */
export function isWeaponAction(a: Action): a is WeaponAction { return WEAPON_ACTION_SET.has(a); }
/** 每种兵器的招：轻击连段（按顺序）、重击（枪有挑、扫两种）、突进。空手用原来的出拳 / 重击 / 欺身 */
export const WEAPON_MOVES: Record<WeaponKind, { light: Action[]; heavy: Action[]; rush: Action }> = {
  fist: { light: ['punch', 'punch', 'punch'], heavy: ['smash'], rush: 'rush' },
  sword: { light: ['swordL1', 'swordL2', 'swordL3', 'swordL4', 'swordL5'], heavy: ['swordH'], rush: 'swordR' },
  heavy: { light: ['heavyL1', 'heavyL2', 'heavyL3'], heavy: ['heavyH'], rush: 'heavyR' },
  spear: { light: ['spearL1', 'spearL2', 'spearL3', 'spearL4'], heavy: ['spearH', 'spearS'], rush: 'spearR' },
  scythe: { light: ['scytheL1', 'scytheL2', 'scytheL3'], heavy: ['scytheH'], rush: 'scytheR' },
};
/** 兵器动作从头到收势的时长（秒）。下一步接出招时可以按这个放慢 / 加快（actionT 照常走） */
export const ACTION_DUR: Record<WeaponAction, number> = {
  swordL1: 0.34, swordL2: 0.32, swordL3: 0.34, swordL4: 0.32, swordL5: 0.46, swordH: 0.62, swordR: 0.42,
  heavyL1: 0.5, heavyL2: 0.5, heavyL3: 0.52, heavyH: 0.8, heavyR: 0.5,
  spearL1: 0.32, spearL2: 0.34, spearL3: 0.38, spearL4: 0.42, spearH: 0.56, spearS: 0.66, spearR: 0.44,
  scytheL1: 0.42, scytheL2: 0.44, scytheL3: 0.52, scytheH: 0.64, scytheR: 0.44,
};
/** 每个动作的「出手」时段（秒）：从蓄到刃挥过的那一段，刀光、判定按这段取 */
export const ACTION_HIT: Record<WeaponAction, [number, number]> = {
  swordL1: [0.07, 0.17], swordL2: [0.06, 0.16], swordL3: [0.07, 0.18], swordL4: [0.06, 0.15], swordL5: [0.12, 0.24], swordH: [0.2, 0.36], swordR: [0.04, 0.3],
  heavyL1: [0.14, 0.28], heavyL2: [0.14, 0.3], heavyL3: [0.14, 0.3], heavyH: [0.28, 0.44], heavyR: [0.05, 0.32],
  spearL1: [0.06, 0.15], spearL2: [0.07, 0.17], spearL3: [0.08, 0.2], spearL4: [0.1, 0.21], spearH: [0.14, 0.3], spearS: [0.14, 0.38], spearR: [0.04, 0.32],
  scytheL1: [0.1, 0.24], scytheL2: [0.11, 0.27], scytheL3: [0.14, 0.3], scytheH: [0.2, 0.46], scytheR: [0.04, 0.32],
};
const armedKind = (look: Look): WeaponKind | null => { const k = look.weapon?.kind; return k && k !== 'fist' && weaponPaint(look.weapon) ? k : null; };
const nrm3 = (x: number, y: number, z: number): T3 => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
const cross3 = (a: T3, b: T3): T3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const perp3 = (a: T3, ax: T3): T3 => { const k = a[0] * ax[0] + a[1] * ax[1] + a[2] * ax[2]; return nrm3(a[0] - ax[0] * k, a[1] - ax[1] * k, a[2] - ax[2] * k); };
/**
 * 握兵器：主手（右手）握点 g、刃向 d（躯干坐标，x 角色左、y 上、z 前；原点在胸口），双手兵器的副手（左手）握在主手后面 gap 处。
 * 手指绕着杆握（四指方向和刃向垂直，拇指一侧朝刃尖），所以手画出来是攥着杆的样子。
 */
function wield(p: Pose, D: Dims, g: T3, d: T3, two: number, gap: number, w = 1, palmHint: T3 = [1, -0.25, 0.2]) {
  const dn = nrm3(d[0], d[1], d[2]);
  const off = PALM_L * 0.55 * D.handK;
  // 右手：掌心朝里（角色左）为主；刃向和它太接近时换一个
  let n = perp3(palmHint, dn); if (Math.abs(palmHint[0] * dn[0] + palmHint[1] * dn[1] + palmHint[2] * dn[2]) > 0.92) n = perp3([0, 1, 0.3], dn);
  const a = cross3(n, dn);   // 右手：t = a × n = dn
  ik(p, -1, w, [-(g[0] - a[0] * off), g[1] - a[1] * off, g[2] - a[2] * off], [-a[0], a[1], a[2]], [-n[0], n[1], n[2]], 'grip');
  if (two > 0.01) {
    const g2: T3 = [g[0] - dn[0] * gap, g[1] - dn[1] * gap, g[2] - dn[2] * gap];
    let n2 = perp3([-1, -0.25, 0.2], dn); if (Math.abs(-dn[0] - 0.25 * dn[1] + 0.2 * dn[2]) > 0.92) n2 = perp3([0, 1, 0.3], dn);
    const a2 = cross3(dn, n2);   // 左手：t = n × a = dn
    ik(p, 1, w * two, [g2[0] - a2[0] * off, g2[1] - a2[1] * off, g2[2] - a2[2] * off], a2, n2, 'grip');
  }
  p.wArm = 1; p.wDx = dn[0]; p.wDy = dn[1]; p.wDz = dn[2]; p.w2 = two;
}
/** 剑诀当胸（左手） */
const jueL = (p: Pose, D: Dims, fem: boolean, w = 1) => ik(p, 1, w, [-1.0, -3.4, D.td + 3.2], [-0.1, 1, 0.3], [-1, 0, 0.15], fem ? 'lotus' : 'sword');
/** 弓步：front=1 左脚在前 */
function lunge(p: Pose, k: number, front: 1 | -1, fem: boolean) {
  const s = fem ? 0.75 : 1;
  if (front > 0) { p.lHip = 0.42 * k * s; p.lKn = 0.06 + 0.42 * k * s; p.rHip = -0.36 * k * s; p.rKn = 0.06 + 0.22 * k * s; p.rFoot = 0.18 * k; }
  else { p.rHip = 0.42 * k * s; p.rKn = 0.06 + 0.42 * k * s; p.lHip = -0.36 * k * s; p.lKn = 0.06 + 0.22 * k * s; p.lFoot = 0.18 * k; }
  p.rootY = -1.8 * k * s; p.lHipR = p.rHipR = 0.07 + 0.05 * k;
}
const formOf = (look: Look) => { const P = weaponPaint(look.weapon); return P ? P.form : null; };
/** 双手兵器两手的间距（刀、锤、枪、棍各不同） */
const gapOf = (look: Look) => { const P = weaponPaint(look.weapon); return P ? P.S.gap : 10; };

/** 拿着兵器站、走、跑的手（腿另算） */
function armedHands(p: Pose, st: CharState, look: Look, R: RLook, D: Dims) {
  const kind = armedKind(look)!, f = formOf(look), run = st.action === 'run', walk = st.action === 'walk';
  const bob = run ? Math.sin(st.phase) * 1.2 : walk ? Math.sin(st.phase * 2) * 0.4 : Math.sin(st.t * 1.7 + st.seed) * 0.3;
  p.lIK = p.rIK = 0; p.lFx = p.rFx = 0;
  if (kind === 'sword') {
    if (run) { wield(p, D, [-11, -12 + bob, -3], [-0.12, -0.32, -0.94], 0, 0); p.lSh = 0.55 * Math.sin(st.phase) + 0.05; p.lEl = 1.1; p.lG = R.fem ? 'palm' : 'fist'; }
    else { wield(p, D, [-10.5, -15 + bob, 5], [-0.12, -0.52, 0.84], 0, 0); jueL(p, D, R.fem); }   // 持剑而立：剑尖斜指地，左手剑诀当胸
  } else if (kind === 'heavy') {
    // 扛在右肩上：双手握柄，刀身 / 锤头越过肩头朝后上方
    wield(p, D, [-5, -7 + bob, 8], f === 'hammer' ? [-0.3, 0.72, -0.62] : [-0.32, 0.6, -0.74], 1, gapOf(look));
  } else {
    // 长枪：站着时持枪而立（枪尾拄地、枪尖高过头），走跑时斜持在身侧
    if (run || walk) { wield(p, D, [-10, -7 + bob, 6], [-0.08, 0.62, 0.78], 0, 0); p.wSlide = 26; if (run) { p.lSh = 0.55 * Math.sin(st.phase) + 0.05; p.lEl = 1.1; } }
    else { wield(p, D, [-11.5, -6 + bob, 3.5], [-0.05, 1, 0.1], 0, 0); p.wSlide = 34; }
  }
}

type Key = { g: T3; d: T3 };
const K = (g: T3, d: T3): Key => ({ g, d });
interface Move { A: Key; M?: Key; B: Key; two: number; body: (p: Pose, k: number, wind: number, rec: number, R: RLook, D: Dims) => void; left?: 'jue' | 'back' }
const bez = (a: number, m: number, b: number, t: number) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * m + t * t * b;
/** 出招：蓄（到 A）→ 发（经 M 到 B，先快后慢）→ 收（往持兵器的架势回三成） */
const MOVES: Record<WeaponAction, Move> = {
  // —— 剑：单手，左手剑诀或后摆
  swordL1: { A: K([-12, 7, 3], [-0.45, 0.78, -0.42]), M: K([-6, 2, 20], [-0.1, 0.25, 1]), B: K([5, -12, 15], [0.62, -0.45, 0.62]), two: 0, left: 'jue',
    body: (p, k, w) => { p.twist = -0.3 * w * (1 - k) + 0.42 * k; p.lean = 0.06 + 0.14 * k; lunge(p, 0.5 + 0.5 * k, 1, false); p.headPitch = 0.04 * k; } },
  swordL2: { A: K([6, -14, 12], [0.62, -0.5, 0.6]), M: K([-3, -4, 21], [0, 0.1, 1]), B: K([-12, 8, 13], [-0.6, 0.62, 0.48]), two: 0, left: 'back',
    body: (p, k, w) => { p.twist = 0.35 * w * (1 - k) - 0.38 * k; p.lean = 0.12 - 0.08 * k; lunge(p, 0.7, -1, false); p.headPitch = -0.1 * k; } },
  swordL3: { A: K([-15, -2, 1], [-0.95, 0.05, -0.25]), M: K([-5, -1, 21], [0, 0.04, 1]), B: K([9, -2, 13], [0.9, 0.04, 0.42]), two: 0, left: 'back',
    body: (p, k, w) => { p.twist = -0.45 * w * (1 - k) + 0.55 * k; p.lean = 0.1; lunge(p, 0.85, 1, false); p.rootY += -1.2 * k; } },
  swordL4: { A: K([-9, -6, 1], [-0.05, 0.04, 1]), B: K([-3, -1, 24], [0, 0, 1]), two: 0, left: 'back',
    body: (p, k, w) => { p.twist = 0.2 * w * (1 - k) + 0.32 * k; p.lean = 0.08 + 0.26 * k; lunge(p, 0.6 + 0.75 * k, 1, false); p.headPitch = -0.05 * k; } },
  swordL5: { A: K([-4, 17, 1], [-0.05, 0.9, -0.42]), M: K([-3, 10, 19], [0, 0.55, 0.84]), B: K([-2, -14, 18], [0, -0.58, 0.82]), two: 0, left: 'jue',
    body: (p, k, w) => { p.lean = -0.12 * w * (1 - k) + 0.34 * k; p.headPitch = -0.2 * w * (1 - k) + 0.12 * k; lunge(p, 0.4 + 0.9 * k, 1, false); p.air = 3.5 * w * (1 - k); p.twist = 0.15 * k; } },
  swordH: { A: K([-14, 11, -5], [-0.62, 0.6, -0.5]), M: K([-8, 4, 18], [-0.15, 0.15, 1]), B: K([8, -16, 17], [0.52, -0.62, 0.58]), two: 0, left: 'back',
    body: (p, k, w) => { p.twist = -0.6 * w * (1 - k) + 0.7 * k; p.lean = -0.06 * w * (1 - k) + 0.3 * k; lunge(p, 0.6 * w + 1.3 * k, 1, false); p.rootY += -2.4 * w * (1 - k); p.headPitch = 0.08 * k; p.mouth = 0.4 * k * (1 - k) * 4; } },
  swordR: { A: K([-5, -1, 22], [0, 0.02, 1]), B: K([-4, 0, 25], [0, 0, 1]), two: 0, left: 'back',
    body: (p) => { p.lean = 0.62; p.headPitch = -0.3; p.twist = 0.2; p.lHip = 0.75; p.lKn = 1.05; p.rHip = -0.55; p.rKn = 0.7; p.rFoot = -0.35; p.lHipR = 0.08; p.rHipR = 0.06; p.ground = 0; p.air = 5; } },
  // —— 重兵：双手
  heavyL1: { A: K([-8, 9, 3], [-0.32, 0.85, -0.42]), M: K([-4, 2, 18], [-0.05, 0.3, 0.95]), B: K([3, -16, 15], [0.35, -0.62, 0.7]), two: 1,
    body: (p, k, w) => { p.twist = -0.4 * w * (1 - k) + 0.45 * k; p.lean = 0.04 + 0.24 * k; lunge(p, 0.5 + 0.8 * k, 1, false); p.headPitch = 0.08 * k; } },
  heavyL2: { A: K([9, -9, 7], [0.9, -0.12, 0.42]), M: K([-1, -9, 19], [0, -0.1, 1]), B: K([-11, -9, 12], [-0.88, -0.12, 0.46]), two: 1,
    body: (p, k, w) => { p.twist = 0.5 * w * (1 - k) - 0.55 * k; p.lean = 0.16; lunge(p, 1.1, -1, false); p.rootY += -1.6; } },
  heavyL3: { A: K([-7, -17, 9], [-0.2, -0.78, 0.58]), M: K([-3, -4, 17], [0, 0.2, 1]), B: K([-2, 13, 9], [0, 0.88, 0.45]), two: 1,
    body: (p, k, w) => { p.lean = 0.24 * w * (1 - k) - 0.14 * k; p.headPitch = -0.22 * k; lunge(p, 0.9, 1, false); p.rootY += -2.4 * w * (1 - k) + 1.2 * k; p.air = 2.4 * k; } },
  heavyH: { A: K([0, 19, -3], [0, 0.55, -0.83]), M: K([0, 12, 14], [0, 0.6, 0.8]), B: K([0, -20, 19], [0, -0.85, 0.5]), two: 1,
    body: (p, k, w) => { p.lean = -0.18 * w * (1 - k) + 0.48 * k; p.headPitch = -0.25 * w * (1 - k) + 0.15 * k; lunge(p, 0.5 * w + 1.4 * k, 1, false); p.air = 6 * w * (1 - k); p.rootY += -3 * k; p.mouth = 0.6 * k * (1 - k) * 4; } },
  heavyR: { A: K([-2, -10, 14], [0, -0.12, 1]), B: K([-2, -9, 16], [0, -0.1, 1]), two: 1,
    body: (p) => { p.lean = 0.55; p.headPitch = -0.28; p.twist = 0.1; p.lHip = 0.7; p.lKn = 1.0; p.rHip = -0.5; p.rKn = 0.65; p.rFoot = -0.3; p.lHipR = 0.08; p.rHipR = 0.06; p.ground = 0; p.air = 4; } },
  // —— 长枪：双手，主手在前
  spearL1: { A: K([-6, -6, 3], [0, 0.04, 1]), B: K([-3, -3, 22], [0, 0, 1]), two: 1,
    body: (p, k, w) => { p.twist = 0.15 * w * (1 - k) + 0.25 * k; p.lean = 0.08 + 0.2 * k; lunge(p, 0.6 + 0.6 * k, 1, false); } },
  spearL2: { A: K([-6, -10, 3], [0, 0.18, 1]), B: K([-2, -1, 20], [0, 0.38, 0.93]), two: 1,
    body: (p, k) => { p.twist = 0.22 * k; p.lean = 0.12 + 0.1 * k; lunge(p, 0.9, 1, false); p.headPitch = -0.12 * k; } },
  spearL3: { A: K([-11, -4, 7], [-0.45, 0, 0.9]), M: K([-3, -4, 16], [0, 0, 1]), B: K([7, -4, 13], [0.72, 0, 0.7]), two: 1,
    body: (p, k, w) => { p.twist = -0.35 * w * (1 - k) + 0.45 * k; p.lean = 0.12; lunge(p, 1, -1, false); } },
  spearL4: { A: K([-5, -8, 5], [0, -0.1, 1]), B: K([-3, -11, 24], [0, -0.26, 0.97]), two: 1,
    body: (p, k, w) => { p.twist = -0.25 * w * (1 - k) + 0.3 * k; p.lean = 0.1 + 0.32 * k; lunge(p, 0.5 + 1.0 * k, 1, false); p.rootY += -1.5 * k; p.headPitch = 0.06 * k; } },
  spearH: { A: K([-4, -15, 12], [0, -0.5, 0.86]), M: K([-4, -6, 15], [0, 0.1, 1]), B: K([-4, 8, 12], [0, 0.72, 0.7]), two: 1,
    body: (p, k, w) => { p.lean = 0.24 * w * (1 - k) - 0.12 * k; p.headPitch = -0.24 * k; lunge(p, 1, 1, false); p.rootY += -2 * w * (1 - k); p.air = 1.6 * k; } },
  spearS: { A: K([-12, -10, -2], [-0.9, -0.2, -0.38]), M: K([-4, -10, 18], [0, -0.2, 1]), B: K([11, -10, 4], [0.92, -0.2, -0.32]), two: 1,
    body: (p, k, w) => { p.twist = -0.7 * w * (1 - k) + 0.75 * k; p.lean = 0.2; lunge(p, 1.3, -1, false); p.rootY += -2.5; } },
  spearR: { A: K([-6, -4, 11], [0, 0.03, 1]), B: K([-3, -1, 24], [0, 0, 1]), two: 1,
    body: (p) => { p.lean = 0.6; p.headPitch = -0.3; p.twist = 0.18; p.lHip = 0.75; p.lKn = 1.05; p.rHip = -0.55; p.rKn = 0.7; p.rFoot = -0.35; p.lHipR = 0.08; p.rHipR = 0.06; p.ground = 0; p.air = 5; } },
  // —— r16 魂镰：双手，镰刃在杆头往回勾；每下都是大弧（照夜无赦的魂镰三式）
  scytheL1: { A: K([-8, -9, 4], [-0.3, -0.75, -0.6]), M: K([-4, -3, 16], [0, 0.1, 1]), B: K([-2, 11, 10], [0, 0.85, 0.5]), two: 1,
    body: (p, k, w) => { p.lean = 0.2 * w * (1 - k) - 0.12 * k; p.headPitch = -0.18 * k; p.twist = -0.3 * w * (1 - k) + 0.25 * k; lunge(p, 0.8, 1, false); p.rootY += -1.8 * w * (1 - k); } },
  scytheL2: { A: K([11, -6, 6], [0.95, -0.1, 0.3]), M: K([-1, -6, 19], [0, -0.1, 1]), B: K([-13, -6, 8], [-0.95, -0.1, 0.3]), two: 1,
    body: (p, k, w) => { p.twist = 0.65 * w * (1 - k) - 0.7 * k; p.lean = 0.18; lunge(p, 1.2, -1, false); p.rootY += -2.2; } },
  scytheL3: { A: K([0, 18, -4], [0, 0.6, -0.8]), M: K([0, 10, 14], [0, 0.5, 0.85]), B: K([0, -14, 17], [0, -0.8, 0.6]), two: 1,
    body: (p, k, w) => { p.twist = 0.5 * w * (1 - k) - 0.2 * k; p.lean = -0.16 * w * (1 - k) + 0.44 * k; p.headPitch = -0.2 * w * (1 - k) + 0.14 * k; lunge(p, 0.5 * w + 1.3 * k, 1, false); p.air = 4 * w * (1 - k); p.rootY += -2.6 * k; p.mouth = 0.5 * k * (1 - k) * 4; } },
  scytheH: { A: K([12, -4, 2], [1, 0, -0.2]), M: K([-1, -4, 18], [0, 0, 1]), B: K([-12, -4, -2], [-1, 0, -0.3]), two: 1,
    body: (p, k, w) => { p.twist = 0.9 * w * (1 - k) - 1.5 * k; p.lean = 0.14; lunge(p, 1.1, -1, false); p.rootY += -2.4 * w * (1 - k) - 1.2 * k; p.air = 2.5 * Math.sin(Math.PI * k); } },
  scytheR: { A: K([-4, -12, -6], [-0.2, -0.4, -0.9]), B: K([-3, -6, 14], [0, -0.1, 1]), two: 1,
    body: (p) => { p.lean = 0.58; p.headPitch = -0.3; p.twist = 0.12; p.lHip = 0.72; p.lKn = 1.0; p.rHip = -0.52; p.rKn = 0.68; p.rFoot = -0.32; p.lHipR = 0.08; p.rHipR = 0.06; p.ground = 0; p.air = 4.5; } },
};
/** 兵器动作的姿势：外观上不是对应的兵器也照摆（没兵器时就是空手比划） */
function weaponPose(p: Pose, st: CharState, look: Look, R: RLook, D: Dims, a: WeaponAction) {
  const mv = MOVES[a], [h0, h1] = ACTION_HIT[a], dur = ACTION_DUR[a], at = st.actionT;
  const wind = smooth01(at / Math.max(0.04, h0));
  const t = Math.max(0, Math.min(1, (at - h0) / Math.max(0.05, h1 - h0)));
  const k = 1 - Math.pow(1 - t, 3);
  const rec = smooth01((at - h1 - 0.04) / Math.max(0.05, dur - h1 - 0.04)) * 0.35;
  const M = mv.M ?? K([(mv.A.g[0] + mv.B.g[0]) / 2, (mv.A.g[1] + mv.B.g[1]) / 2, (mv.A.g[2] + mv.B.g[2]) / 2], [(mv.A.d[0] + mv.B.d[0]) / 2, (mv.A.d[1] + mv.B.d[1]) / 2, (mv.A.d[2] + mv.B.d[2]) / 2]);
  let g: T3 = [bez(mv.A.g[0], M.g[0], mv.B.g[0], k), bez(mv.A.g[1], M.g[1], mv.B.g[1], k), bez(mv.A.g[2], M.g[2], mv.B.g[2], k)];
  let d: T3 = [bez(mv.A.d[0], M.d[0], mv.B.d[0], k), bez(mv.A.d[1], M.d[1], mv.B.d[1], k), bez(mv.A.d[2], M.d[2], mv.B.d[2], k)];
  // 收势：往持兵器的架势回一点（剑尖斜指地 / 扛肩 / 枪平端）
  const ready: Key = a.startsWith('sword') ? K([-9, -10, 9], [-0.1, -0.3, 0.95]) : a.startsWith('heavy') ? K([-4, -6, 11], [-0.2, 0.5, 0.84]) : a.startsWith('scythe') ? K([-6, -5, 9], [-0.05, 0.75, 0.6]) : K([-5, -5, 10], [0, 0.12, 1]);
  if (rec > 0) { g = [lerp(g[0], ready.g[0], rec), lerp(g[1], ready.g[1], rec), lerp(g[2], ready.g[2], rec)]; d = [lerp(d[0], ready.d[0], rec), lerp(d[1], ready.d[1], rec), lerp(d[2], ready.d[2], rec)]; }
  // 突进类：持续往前冲，刃稳着微颤
  if (a.endsWith('R')) { const sw = Math.sin(st.t * 30) * 0.4; g = [g[0], g[1] + sw, g[2]]; }
  const two = mv.two > 0 && (look.weapon?.kind === 'heavy' || look.weapon?.kind === 'spear' || look.weapon?.kind === 'scythe' || !look.weapon) ? mv.two : 0;
  wield(p, D, g, d, two, gapOf(look));
  if (!two) {
    if (mv.left === 'jue') jueL(p, D, R.fem, 1 - rec);
    else { const sw = a.endsWith('R') ? Math.sin(st.t * 30) * 0.04 : 0; p.lSh = lerp(-0.2, -0.75, k) + sw; p.lShR = 0.4 + 0.15 * k; p.lEl = 0.35; p.lFr = -0.2; p.lG = 'open'; }
  }
  p.breath = Math.sin(st.t * 2.4) * 0.3;
  mv.body(p, k, wind, rec, R, D);
  if (R.fem) { p.lHip *= 0.85; p.rHip *= 0.85; p.mouth *= 0.4; }
}

/**
 * 兵器在人物局部坐标里的摆放（x 角色左、y 上、z 前，脚底为原点，单位是人物局部单位；和 drawCharacter 画的完全一致）。
 * held：拿在手里（否则斜背在背后）；origin 是 u = 0 的位置（沿轴 origin + dir·u）；edge 是刃口方向；off 是副手握点。
 */
export interface WeaponPlace { held: boolean; origin: V3Pub; dir: V3Pub; edge: V3Pub; grip: V3Pub; off: V3Pub | null; P: WeaponPaint }
export type V3Pub = { x: number; y: number; z: number };
function weaponPlace(sk: Skel, pose: Pose, look: Look): WeaponPlace | null {
  const P = weaponPaint(look.weapon); if (!P) return null;
  const D = sk.D, hk = D.handK, U = sk.up, FW = sk.fw, LT = sk.lt;
  const torso = (x: number, y: number, z: number): V3 => add(add({ x: LT.x * x, y: LT.y * x, z: LT.z * x }, U, y), FW, z);
  if (pose.wArm > 0.5) {
    const grip = add(sk.rWr, sk.rH.a, PALM_L * 0.55 * hk);
    let dir = nrm(torso(pose.wDx, pose.wDy, pose.wDz));
    let off: V3 | null = null;
    if (pose.w2 > 0.5) {
      off = add(sk.lWr, sk.lH.a, PALM_L * 0.55 * hk);
      const hd = sub(grip, off), L = len3(hd);
      if (L > 3) { const hn = { x: hd.x / L, y: hd.y / L, z: hd.z / L }; if (dot3(hn, dir) > 0.2) dir = nrm(lerpV(dir, hn, 0.85)); }
    }
    let edge = sub(sk.rH.a, { x: dir.x * dot3(sk.rH.a, dir), y: dir.y * dot3(sk.rH.a, dir), z: dir.z * dot3(sk.rH.a, dir) });
    edge = len3(edge) > 1e-3 ? nrm(edge) : nrm(crs(dir, v(0, 1, 0)));
    const origin = add(grip, dir, -pose.wSlide);
    return { held: true, origin, dir, edge, grip, off, P };
  }
  // 收着：斜背在背后（剑、刀柄在右肩上；锤头、枪尖在左肩上方）
  const back = -D.td - 1.8;
  let a: V3, b: V3;
  const at = (x: number, y: number, z: number) => add(sk.chest, torso(x, y, z));
  if (P.form === 'jian' || P.form === 'dao') { a = at(-6.5, 8.5, back); b = at(8, -18, back); }
  else if (P.form === 'hammer') { a = at(-5, -14, back - 0.6); b = at(6, 12, back - 0.6); }
  else { a = at(-9, -12, back - 0.8); b = at(9, 4, back - 0.8); }   // 长枪比人高：斜得平一些（约四十度），上下都不出头太多
  const dir = nrm(sub(b, a));
  const edge = nrm(crs(dir, FW));
  const sp = weaponSpan(P.form);
  // 剑、刀：u 的最尾（剑首 / 刀柄尾）放在 a；锤：握点放在 a 往上一点；枪、棍：整根的正中落在背心
  const mid = (sp.uMin + sp.uTip) / 2;
  const origin = P.form === 'jian' || P.form === 'dao' ? add(a, dir, -sp.uMin) : P.form === 'hammer' ? add(a, dir, 4) : add(at(0, -4, back - 0.8), dir, -mid);
  return { held: false, origin, dir, edge, grip: origin, off: null, P };
}

/** 刃（兵器）在某一刻的位置：grip 主手握点、base 刃 / 枪头 / 锤头起点、tip 刃尖 / 枪尖 / 锤顶、dir 刃向；都是人物局部坐标（x 角色左、y 上、z 前，脚底为原点，人物局部单位） */
export interface BladePose { grip: V3Pub; base: V3Pub; tip: V3Pub; dir: V3Pub; held: boolean }
/**
 * 刃轨迹的取法（给刀光、判定范围用）：动作 action 进行到 k（0–1，按 ACTION_DUR 折成秒）时，兵器的两端在人物坐标里的位置。
 * 和 drawCharacter 画出来的同一套骨骼 / 握法（不含动作切换时的过渡）。外观上没有兵器返回 null。
 * 想要世界（地图）坐标就再过一遍 charToMap，屏幕上的位置用 charToScreen。
 *   例：for (let i = 0; i <= 8; i++) { const b = bladeAt(look, 'swordL1', i / 8); ... charToMap(st, look, scale, b.tip) }
 */
export function bladeAt(look: Look, action: Action, k: number, opts: { castN?: number; seed?: number; armed?: boolean } = {}): BladePose | null {
  if (!weaponPaint(look.weapon)) return null;
  // 兵器接进近战（r7-forge）：复用一份暂存的人物状态。新建 CharState 会取两个 Math.random（t、seed 的初值），
  // 近战判定、刀光每次取刃轨迹都新建一份就会把固定种子的随机数序列打乱
  const st = bladeScratch();
  st.seed = opts.seed ?? 0; st.t = 0; st.castN = opts.castN ?? 0; st.armed = opts.armed ?? true;
  st.phase = 0; st.speed = 0; st.vx = st.vy = 0; st.lift = 0; st.blend = 1; st.from = null;
  st.action = action;
  const dur = isWeaponAction(action) ? ACTION_DUR[action] : 0.4;
  st.actionT = Math.max(0, Math.min(1, k)) * dur;
  const R = resolveLook(look), pose = poseFor(st, look, R), sk = solve(pose, look, R);
  const W = weaponPlace(sk, pose, look); if (!W) return null;
  const sp = weaponSpan(W.P.form);
  return { grip: W.grip, base: add(W.origin, W.dir, sp.uBlade), tip: add(W.origin, W.dir, sp.uTip), dir: W.dir, held: W.held };
}
let BLADE_ST: CharState | null = null;
/** bladeAt 用的暂存人物状态：头一回建的时候把 Math.random 临时换掉（一个也不取） */
function bladeScratch(): CharState {
  if (!BLADE_ST) { const r = Math.random; Math.random = () => 0.5; try { BLADE_ST = new CharState(0, 0); } finally { Math.random = r; } }
  return BLADE_ST;
}
/** 人物局部坐标 → 地图坐标（x、y 是地面上的位置，h 是离地高度；scale 是画人物时传给 drawCharacter 的那个比例） */
export function charToMap(st: Pick<CharState, 'x' | 'y' | 'yaw' | 'lift'>, look: Look, scale: number, p: V3Pub) {
  const S = scale * look.height, cy = Math.cos(st.yaw), sy = Math.sin(st.yaw);
  const X = p.x * cy + p.z * sy, Z = -p.x * sy + p.z * cy;
  return { x: st.x + X * S, y: st.y + Z * S, h: p.y * S + st.lift };
}
/** 人物局部坐标 → 画布上的点（和 drawCharacter 的投影一致；画刀光用） */
export function charToScreen(st: Pick<CharState, 'x' | 'y' | 'yaw' | 'lift'>, look: Look, scale: number, p: V3Pub) {
  const S = scale * look.height, cy = Math.cos(st.yaw), sy = Math.sin(st.yaw);
  const X = p.x * cy + p.z * sy, Z = -p.x * sy + p.z * cy;
  return { x: st.x + X * S, y: st.y - st.lift + (-p.y * CP + Z * SP) * S };
}

/** 施法四式：蓄（0–0.09s）→ 发（带过冲，0.08–0.22s）→ 运劲（微颤，指尖劲气渐收） */
function castPose(p: Pose, st: CharState, R: RLook, D: Dims) {
  const at = st.actionT, fem = R.fem, td = D.td;
  const style = (st.castN + Math.floor(st.seed)) % 4;
  const wind = smooth01(at / 0.09);
  const go = backOut((at - 0.08) / 0.14);
  const hold = smooth01((at - 0.2) / 0.1);
  const trem = Math.sin(at * 43) * 0.022 * hold;
  const fx = at < 0.08 ? 0 : (0.32 + 0.68 * Math.exp(-Math.max(0, at - 0.16) * 7)) * smooth01((at - 0.08) / 0.05);
  const stance = (k: number) => {
    const s = fem ? 0.7 : 1;
    p.lHip = 0.34 * k * s; p.lKn = 0.05 + 0.32 * k * s; p.rHip = -0.3 * k * s; p.rKn = 0.05 + 0.2 * k * s; p.rFoot = 0.12 * k;
    p.rootY = -1.3 * k * s; p.lHipR = p.rHipR = 0.06 + 0.04 * k;
  };
  const jue = (side: 1 | -1, w: number) => ik(p, side, w, [-1.0, -3.4, td + 3.2], [-0.1, 1, 0.3], [-1, 0, 0.15], fem ? 'lotus' : 'sword');
  p.breath = Math.sin(st.t * 1.7) * 0.4;
  if (style === 0) {
    // 剑指：右手后引蓄势，猛然前刺；左手剑诀当胸
    const k = go;
    p.rSh = lerp(0.25 - 0.55 * wind, 1.36, k) + trem; p.rShR = lerp(0.3, 0.1, k); p.rEl = lerp(1.5, 0.06, k); p.rFr = 0;
    p.rSup = lerp(-0.2, 0.05, k); p.rWb = lerp(0.45, -0.08, k); p.rG = 'sword';
    jue(1, smooth01(at / 0.12));
    p.twist = -0.12 * wind * (1 - k) + 0.3 * k; p.lean = 0.04 + 0.14 * k;
    stance(k); p.headPitch = -0.04 * k; p.rFx = fx; p.mouth = fem ? 0 : 0.3 * fx * (1 - hold);
  } else if (style === 1) {
    // 推掌：双掌收于腰侧，沉身前推，掌根发力
    const k = go;
    for (const side of [1, -1] as const) {
      const tx = lerp(4.0, 2.3, k), ty = lerp(-12.8, -2.8, k) + trem * 8, tz = lerp(2.4, 18.2, k);
      ik(p, side, 1, [tx, ty, tz], [lerp(0, 0.05, k), lerp(0.1, 1, k), lerp(1, 0.18, k)], [lerp(-1, -0.05, k), lerp(0.2, 0.08, k), lerp(0.1, 1, k)], k > 0.25 ? 'palm' : 'relax');
    }
    p.lean = 0.05 + 0.2 * k; stance(k); p.twist = 0; p.lFx = p.rFx = fx; p.mouth = fem ? 0 : 0.35 * fx * (1 - hold);
  } else if (style === 2) {
    // 掐诀：双手当胸结印，右手剑指向斜上方一引
    const k = go;
    ik(p, 1, 1, [-1.3, -6.6, td + 3.0], [-0.8, 0.05, 0.5], [0, 1, 0], 'cup');
    ik(p, -1, 1, [lerp(-0.8, 1.6, k), lerp(-4.6, 9.4, k) + trem * 6, lerp(td + 3.4, 13.2, k)], [lerp(0, 0.06, k), lerp(1, 0.78, k), lerp(0.2, 0.68, k)], [-1, 0, 0.1], 'sword');
    p.headPitch = -0.16 * k; p.lean = -0.03 * k; p.lHip = 0.12 * k; p.rHip = -0.1 * k; p.rFx = fx;
  } else {
    // 托天：右手擎天张掌，左手剑诀当胸
    const k = go;
    ik(p, -1, 1, [lerp(5.0, 2.6, k), lerp(-8, 20.5, k) + trem * 6, lerp(4, 3.2, k)], [-0.75, lerp(-0.2, 0.1, k), -0.25], [0, 1, 0.2], k > 0.3 ? 'open' : 'relax');
    jue(1, smooth01(at / 0.12));
    p.lean = -0.08 * k; p.headPitch = -0.28 * k; stance(k * 0.6); p.rFx = fx;
  }
}

/**
 * 贴身斗法的四种姿势（world/brawl.ts 驱动），写法照 castPose：蓄（几十毫秒）→ 发（backOut 带过冲）→ 收。
 *   punch：出拳三式轮换（右直拳、左直拳、上挑掌），castN 决定这一拳是哪一式；
 *   smash：重击（崩山）——扭身把右拳拉到身后，弓步整个人砸出去，左臂后甩；
 *   rush ：化虹欺身——身子压低前倾，右拳领前，左臂后掠，双脚离地；
 *   tumble：被击飞——后仰，手脚乱甩，蜷腿，不贴地。
 */
function brawlPose(p: Pose, st: CharState, R: RLook, D: Dims, a: Action) {
  const at = st.actionT, td = D.td, fem = R.fem;
  const guard = (side: 1 | -1, w = 1) => ik(p, side, w, [-0.9, 4.2, td + 7.2], [0.05, 0.85, 0.5], [-1, 0, 0.2], 'fist');   // 拳护下颌
  const stance = (k: number, front: 1 | -1) => {   // 弓步：front=1 左脚在前
    const s = fem ? 0.75 : 1;
    if (front > 0) { p.lHip = 0.42 * k * s; p.lKn = 0.06 + 0.42 * k * s; p.rHip = -0.36 * k * s; p.rKn = 0.06 + 0.22 * k * s; p.rFoot = 0.18 * k; }
    else { p.rHip = 0.42 * k * s; p.rKn = 0.06 + 0.42 * k * s; p.lHip = -0.36 * k * s; p.lKn = 0.06 + 0.22 * k * s; p.lFoot = 0.18 * k; }
    p.rootY = -1.8 * k * s; p.lHipR = p.rHipR = 0.07 + 0.05 * k;
  };
  p.breath = Math.sin(st.t * 2.4) * 0.3;
  if (a === 'punch') {
    const style = (st.castN + Math.floor(st.seed)) % 3;
    const go = backOut((at - 0.025) / 0.085), rec = smooth01((at - 0.2) / 0.14), k = go * (1 - rec * 0.65);
    const fx = at < 0.03 ? 0 : Math.exp(-Math.max(0, at - 0.1) * 9) * smooth01((at - 0.03) / 0.04);
    if (style < 2) {
      const side: 1 | -1 = style === 0 ? -1 : 1;   // 0 右直拳，1 左直拳
      ik(p, side, 1, [lerp(2.6, -1.4, k), lerp(-2.5, 1.6, k), lerp(5, 25.5, k)], [lerp(0.1, 0, k), lerp(0.6, 0.05, k), lerp(0.7, 1, k)], [-1, 0, 0.1], 'fist');
      guard(side > 0 ? -1 : 1);
      p.twist = (side < 0 ? 0.38 : -0.38) * k; p.lean = 0.1 + 0.14 * k; stance(0.6 + 0.4 * k, side < 0 ? 1 : -1);
      if (side < 0) p.rFx = fx; else p.lFx = fx;
    } else {
      // 上挑掌：先沉身，再整个人往上一托（收式那一下把人挑起来）
      const crouch = smooth01(at / 0.05) * (1 - go);
      ik(p, -1, 1, [lerp(2.2, -0.6, k), lerp(-13, 13.5, k), lerp(7, 17, k)], [0, lerp(0.2, 0.85, k), lerp(0.95, 0.5, k)], [-0.2, -0.1, 1], k > 0.3 ? 'palm' : 'fist');
      guard(1);
      p.lean = 0.08 - 0.14 * k; p.headPitch = -0.22 * k; p.twist = 0.2 * k;
      stance(0.8, 1); p.rootY += -3.2 * crouch + 1.5 * k; p.air = 2.5 * k * (1 - rec);
      p.rFx = fx;
    }
    p.mouth = fem ? 0 : 0.3 * fx;
  } else if (a === 'smash') {
    const wind = smooth01(at / 0.11), go = backOut((at - 0.1) / 0.13), rec = smooth01((at - 0.38) / 0.16), k = go * (1 - rec * 0.6);
    const fx = at < 0.1 ? 0 : Math.exp(-Math.max(0, at - 0.2) * 5) * smooth01((at - 0.1) / 0.05);
    const back = wind * (1 - go);
    ik(p, -1, 1, [lerp(lerp(2.2, 4.2, back), -2.2, k), lerp(-1, 0.5, k), lerp(lerp(5, -9, back), 28.5, k)], [lerp(0, 0, k), lerp(0.3, 0.02, k), lerp(-0.4, 1, k)], [-1, 0, 0.1], 'fist');
    // 左臂：蓄势时前探引路，发力时向后甩开
    p.lSh = lerp(0.9 * back + 0.1, -0.75, k); p.lShR = 0.3 + 0.25 * k; p.lEl = lerp(0.9, 0.35, k); p.lG = 'fist';
    p.twist = -0.5 * back + 0.62 * k; p.lean = -0.04 * back + 0.36 * k; p.headPitch = -0.1 * k;
    stance(0.5 * back + 1.25 * k, 1); p.rootY += -2.2 * back;
    p.rFx = fx * 1.4; p.mouth = fem ? 0.2 * fx : 0.55 * fx;
  } else if (a === 'grab') {
    // 抓投：两手往前一揪（0.12 息），再拧身把人往肩后甩（腰带着肩转过去、重心压低）
    const reach = smooth01(at / 0.12), turn = smooth01((at - 0.14) / 0.18), k = reach * (1 - turn * 0.3);
    ik(p, -1, 1, [lerp(2.4, -0.6, k) + 3 * turn, lerp(-2, 2.5, k) + 4 * turn, lerp(6, 21, k) - 14 * turn], [0, 0.4, 0.8], [-1, 0, 0.2], 'fist');
    ik(p, 1, 1, [lerp(-2.4, 0.8, k) + 3 * turn, lerp(-2, 1.8, k) + 4 * turn, lerp(6, 20, k) - 14 * turn], [0, 0.4, 0.8], [1, 0, 0.2], 'fist');
    p.twist = 0.15 * reach - 0.95 * turn; p.lean = 0.28 * reach - 0.12 * turn; p.side = 0.12 * turn; p.headPitch = 0.1 - 0.2 * turn;
    stance(0.9 + 0.5 * turn, 1); p.rootY += -2.5 * turn;
    p.mouth = fem ? 0.2 * turn : 0.6 * turn;
  } else if (a === 'feint') {
    // 佯攻后撤：前手虚晃一下（不发力），身子往后坐、后脚一撤——一个看得懂的「虚」架子
    const poke = Math.sin(Math.min(1, at / 0.16) * Math.PI), back = smooth01((at - 0.08) / 0.2);
    ik(p, 1, 1, [lerp(-2, -0.4, poke), lerp(-1, 1.5, poke), lerp(9, 18, poke) - 4 * back], [0, 0.3, 0.9], [1, 0, 0.1], 'open');
    guard(-1);
    p.lean = 0.12 * poke - 0.26 * back; p.twist = -0.2 * poke + 0.18 * back; p.headPitch = 0.08 * back;
    stance(0.7, -1); p.rootY += -1.5 * back; p.lHip -= 0.3 * back;
  } else if (a === 'rush') {
    const sw = Math.sin(st.t * 30) * 0.04;
    ik(p, -1, 1, [-1.2, 2.5, 22], [0, 0.05, 1], [-1, 0, 0.1], 'fist');
    p.lSh = -0.95 + sw; p.lShR = 0.45; p.lEl = 0.25; p.lFr = -0.2; p.lG = 'open';
    p.lean = 0.62; p.headPitch = -0.32; p.twist = 0.18;
    p.lHip = 0.75; p.lKn = 1.05; p.rHip = -0.55; p.rKn = 0.7; p.rFoot = -0.35; p.lHipR = 0.08; p.rHipR = 0.06;
    p.ground = 0; p.air = 5; p.rFx = 0.7;
  } else {
    // 倒飞：后仰、手脚乱甩、蜷腿（不贴地，离地高度由人物的 lift 抬）
    // 腿往胸前蜷（髋屈得深、膝盖收紧），衣摆才不会拖成一长条
    const ph = st.t * 7.5;
    p.lean = -0.42 + 0.2 * Math.sin(ph); p.side = 0.22 * Math.sin(ph * 0.7); p.twist = 0.25 * Math.sin(ph * 0.5);
    p.lSh = -0.5 + 0.55 * Math.sin(ph); p.lShR = 1.05 + 0.2 * Math.cos(ph * 1.3); p.lEl = 0.5;
    p.rSh = -0.35 + 0.55 * Math.cos(ph * 0.9); p.rShR = 0.95 + 0.2 * Math.sin(ph * 1.1); p.rEl = 0.6;
    p.lHip = 1.55 + 0.2 * Math.sin(ph * 1.2); p.lKn = 2.1; p.rHip = 1.2 + 0.25 * Math.cos(ph); p.rKn = 1.8; p.lFoot = -0.3; p.rFoot = -0.2;
    p.rootY = 10;   // 蜷起来以后身子整体抬一点，别让脚底「贴地」的那条线把人往下拽
    p.headPitch = -0.45; p.mouth = 0.6; p.eyes = 0; p.lG = p.rG = 'open'; p.ground = 0; p.air = 8;
  }
}

/**
 * r7 撼山客的四个姿势（只增不改），写法照 brawlPose：蓄 → 发（backOut 带过冲）→ 收。
 *   drink：右手举葫芦（葫芦本身在 drawCharacter 里画在右手上）到嘴边、仰头灌一口，左手叉腰；0.35 举起，1.6 放下，2.0 收完；
 *   stomp：右膝提到胸前（两臂张开稳住），0.26 一脚跺下——马步压低、双掌往下一按、张口吐气；
 *   elbow：后发先至——先往旁边一闪（0.08），右肘端平、拧腰一肘撞出去，左手护在胸前；
 *   shout：气合——先沉身吸气、两拳收到腰间，0.16 起扩胸仰头一声大喝（两肘后撑、劲气外放）。
 */
function tixiuPose(p: Pose, st: CharState, R: RLook, D: Dims, a: Action) {
  const at = st.actionT, td = D.td;
  p.breath = Math.sin(st.t * 1.7) * 0.4;
  if (a === 'drink') {
    const up = smooth01(at / 0.35), down = smooth01((at - 1.6) / 0.35), k = up * (1 - down);
    const gulp = k * (at > 0.45 && at < 1.55 ? 0.5 + 0.5 * Math.sin(at * 9) : 0);
    // 右手：葫芦嘴凑到嘴边（手在下巴前上方，葫芦身朝天斜上去）
    ik(p, -1, k, [lerp(4.2, 0.6, k), lerp(-11, 8.6, k), lerp(3, td + 5.2, k)], [lerp(0, -0.7, k), lerp(-1, 0.55, k), lerp(0.2, 0.45, k)], [0.1, -0.2, -1], 'grip');
    // 左手叉腰：手背顶在腰侧，肘往外撑
    ik(p, 1, 1, [7.6, -13.5, 0.6], [-0.35, -0.45, 0.6], [-1, 0, 0.1], 'fist');
    p.lean = -0.1 * k; p.headPitch = -0.52 * k + 0.04 * gulp; p.side = 0.04 * k;
    p.lHip = 0.06; p.rHip = -0.08; p.lHipR = p.rHipR = 0.09; p.rKn = 0.1;
    p.mouth = 0.25 * k; p.eyes = k > 0.6 ? 0 : 1;
    return;
  }
  if (a === 'stomp') {
    const lift = smooth01(at / 0.26), drop = smooth01((at - 0.26) / 0.06), rec = smooth01((at - 0.8) / 0.35);
    const up = lift * (1 - drop), k = drop * (1 - rec * 0.75);
    p.rHip = 1.35 * up - 0.05 * k; p.rKn = 0.05 + 2.0 * up + 0.8 * k; p.rHipR = 0.06 + 0.1 * up + 0.32 * k; p.rFoot = 0.4 * up;
    p.lHip = 0.08 * up - 0.05 * k; p.lKn = 0.12 + 0.2 * up + 0.8 * k; p.lHipR = 0.05 + 0.32 * k;
    p.rootY = -1.2 * up - 5.6 * k; p.lean = -0.07 * up + 0.18 * k; p.headPitch = 0.1 * k - 0.06 * up;
    p.lSh = p.rSh = 0.2 * up + 0.5 * k; p.lShR = p.rShR = 0.2 + 0.85 * up + 0.3 * k;
    p.lEl = p.rEl = 0.45 * up + 0.45 * k; p.lWb = p.rWb = -0.5 * k; p.lSup = p.rSup = -0.9 * k;
    p.lG = p.rG = k > 0.3 ? 'palm' : 'fist';
    p.mouth = 0.65 * k; p.lFx = p.rFx = 0.55 * k * (1 - rec);
    return;
  }
  if (a === 'elbow') {
    const slip = smooth01(at / 0.08), go = backOut((at - 0.07) / 0.09), rec = smooth01((at - 0.32) / 0.2), k = go * (1 - rec * 0.7);
    p.side = 0.22 * slip * (1 - rec); p.rootX = 6 * slip * (1 - rec);
    p.twist = -0.25 * slip * (1 - go) + 0.62 * k; p.lean = 0.08 + 0.24 * k;
    // 右肘：上臂端平朝前、小臂折回胸前，肘尖领着整个身子撞出去
    p.rSh = lerp(0.3, 1.5, k); p.rShR = lerp(0.2, 0.42, k); p.rEl = lerp(0.9, 2.35, k); p.rFr = 0.1; p.rG = 'fist'; p.rSup = 0.3;
    ik(p, 1, 1, [-0.9, 4.2, td + 7.2], [0.05, 0.85, 0.5], [-1, 0, 0.2], 'fist');   // 左拳护下颌
    const s = 1;
    p.lHip = 0.42 * k * s; p.lKn = 0.06 + 0.5 * k; p.rHip = -0.36 * k; p.rKn = 0.06 + 0.25 * k; p.rFoot = 0.18 * k;
    p.rootY = -2.2 * k; p.lHipR = p.rHipR = 0.08 + 0.06 * k;
    p.rFx = Math.exp(-Math.max(0, at - 0.16) * 8) * smooth01((at - 0.07) / 0.05); p.mouth = 0.4 * k;
    return;
  }
  // shout
  const inh = smooth01(at / 0.16), go = backOut((at - 0.15) / 0.12), rec = smooth01((at - 0.9) / 0.3), k = go * (1 - rec);
  const b = inh * (1 - go);
  p.rootY = -2.2 * b - 3.2 * k; p.lean = 0.12 * b - 0.14 * k; p.headPitch = 0.12 * b - 0.32 * k;
  p.lHip = p.rHip = 0.1 + 0.25 * k; p.lKn = p.rKn = 0.12 + 0.55 * k + 0.3 * b; p.lHipR = p.rHipR = 0.1 + 0.22 * k;
  // 两拳收到腰间、肘往后撑开（扩胸）
  p.lSh = p.rSh = -0.35 * b - 0.6 * k; p.lShR = p.rShR = 0.18 + 0.35 * k; p.lEl = p.rEl = 1.3 * b + 1.65 * k; p.lFr = p.rFr = 0;
  p.lSup = p.rSup = 0.6 * k; p.lG = p.rG = 'fist'; p.breath = 1.2 * b + 0.9 * k;
  p.mouth = Math.max(0.15 * b, 1.0 * k); p.eyes = 1; p.lFx = p.rFx = 0.35 * k;
}

function blendPose(a: Pose, b: Pose, t: number): Pose {
  const o = { ...b };
  for (const k of POSE_KEYS) (o as any)[k] = (a as any)[k] + ((b as any)[k] - (a as any)[k]) * t;
  return o;
}

function updateHands(st: CharState, pose: Pose, dt: number) {
  const tg = [GESTURES[pose.lG] ?? GESTURES.relax, GESTURES[pose.rG] ?? GESTURES.relax];
  const k = !st.handInit ? 1 : dt > 0 ? 1 - Math.exp(-dt * 15) : 0;
  for (let h = 0; h < 2; h++) {
    const cur = st.hands[h], t = tg[h];
    for (let i = 0; i < G_N; i++) cur[i] += (t[i] - cur[i]) * k;
  }
  st.handInit = true;
}

// ---------------------------------------------------------------- 骨骼求解（局部 3D：x=角色左, y=上, z=前）
type V3 = { x: number; y: number; z: number };
const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
const add = (a: V3, b: V3, k = 1): V3 => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot3 = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const len3 = (a: V3) => Math.hypot(a.x, a.y, a.z);
const nrm = (a: V3): V3 => { const l = len3(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
const crs = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const lerpV = (a: V3, b: V3, t: number): V3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
function limbDir(pitch: number, roll: number, side: number): V3 {
  const cp = Math.cos(pitch);
  return { x: side * cp * Math.sin(roll), y: -cp * Math.cos(roll), z: Math.sin(pitch) };
}
/** 两节骨 IK：肩 S → 腕 T，肘朝 pole 一侧 */
function ik2(S: V3, T: V3, l1: number, l2: number, pole: V3) {
  const d = sub(T, S); let L = len3(d);
  const dir = L > 1e-4 ? { x: d.x / L, y: d.y / L, z: d.z / L } : v(0, -1, 0);
  L = Math.max(Math.abs(l1 - l2) + 0.05, Math.min(l1 + l2 - 0.05, L));
  const a = (l1 * l1 - l2 * l2 + L * L) / (2 * L), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  let pp = sub(pole, { x: dir.x * dot3(pole, dir), y: dir.y * dot3(pole, dir), z: dir.z * dot3(pole, dir) });
  const pl = len3(pp); pp = pl > 1e-4 ? { x: pp.x / pl, y: pp.y / pl, z: pp.z / pl } : v(0, -1, 0);
  return { E: add(add(S, dir, a), pp, h), W: add(S, dir, L) };
}

interface Skel {
  pelvis: V3; chest: V3; neck: V3; head: V3; up: V3; fw: V3; lt: V3;
  lSh: V3; rSh: V3; lEl: V3; rEl: V3; lWr: V3; rWr: V3; lH: HandFrame; rH: HandFrame;
  lHip: V3; rHip: V3; lKn: V3; rKn: V3; lAn: V3; rAn: V3; lToe: V3; rToe: V3;
  D: Dims;
}

function solve(p: Pose, look: Look, R: RLook): Skel {
  const f = R.fem, B = R.body, D = dimsOf(look, R);
  let pelvis = v(p.rootX, 51 + p.rootY, p.rootZ);
  if (p.sit > 0.5) pelvis = v(p.rootX, 13 + p.rootY, p.rootZ - 1);
  const lean = p.lean + B.stoop * 0.12;
  const up = v(Math.sin(p.side) * Math.cos(lean), Math.cos(lean) * Math.cos(p.side), Math.sin(lean));
  const chest = add(pelvis, up, D.torsoL + p.breath * 0.35);
  const neckDir = nrm(add(up, v(0, 0, 1), B.stoop * 0.55));
  const neck = add(chest, neckDir, (f ? 5.3 : 4.8) * R.head.neck + p.breath * 0.12);
  const head = add(neck, v(Math.sin(p.side) * 0.5, Math.cos(p.headPitch), Math.sin(p.headPitch) + up.z * 0.4 + B.stoop * 0.3), 6.5 * D.hk);
  const tw = p.twist;
  const fw = nrm(sub(v(Math.sin(tw), 0, Math.cos(tw)), { x: up.x * Math.sin(tw) * 0 + up.x * (up.x * Math.sin(tw) + up.z * Math.cos(tw)), y: up.y * (up.x * Math.sin(tw) + up.z * Math.cos(tw)), z: up.z * (up.x * Math.sin(tw) + up.z * Math.cos(tw)) }));
  const lt = crs(up, fw);
  const shY = 0.5 + p.breath * 0.25;
  const lSh = add(add(chest, lt, D.sw), up, shY), rSh = add(add(chest, lt, -D.sw), up, shY);
  // r8-p1：骨长按拉长倍数（默认 1，和原来逐位相同）
  const laS = p.lArmS ?? 1, raS = p.rArmS ?? 1, llS = p.lLegS ?? 1, rlS = p.rLegS ?? 1;
  const lUp = limbDir(p.lSh, p.lShR, 1), rUp = limbDir(p.rSh, p.rShR, -1);
  let lEl = add(lSh, lUp, D.upL * laS), rEl = add(rSh, rUp, D.upL * raS);
  const lFo = limbDir(p.lSh + p.lEl, p.lFr, 1), rFo = limbDir(p.rSh + p.rEl, p.rFr, -1);
  let lWr = add(lEl, lFo, D.foL * laS), rWr = add(rEl, rFo, D.foL * raS);
  const tgt = (tx: number, ty: number, tz: number, s: number) => add(add(add(chest, lt, tx * s), up, ty), fw, tz);
  const vec = (x: number, y: number, z: number, s: number) => add(add({ x: lt.x * x * s, y: lt.y * x * s, z: lt.z * x * s }, up, y), fw, z);
  if (p.lIK > 0.001) {
    const T = lerpV(lWr, tgt(p.lTx, p.lTy, p.lTz, 1), p.lIK);
    const r = ik2(lSh, T, D.upL * laS, D.foL * laS, add(nrm(sub(lEl, lSh)), v(0.9, -0.2, -0.5), p.lIK));
    lEl = r.E; lWr = r.W;
  }
  if (p.rIK > 0.001) {
    const T = lerpV(rWr, tgt(p.rTx, p.rTy, p.rTz, -1), p.rIK);
    const r = ik2(rSh, T, D.upL * raS, D.foL * raS, add(nrm(sub(rEl, rSh)), v(-0.9, -0.2, -0.5), p.rIK));
    rEl = r.E; rWr = r.W;
  }
  let lH = armHandFrame(lWr, nrm(sub(lWr, lEl)), 1, p.lSup, p.lWb);
  let rH = armHandFrame(rWr, nrm(sub(rWr, rEl)), -1, p.rSup, p.rWb);
  if (p.lIK > 0.001 && (p.lAx || p.lAy || p.lAz)) lH = blendFrame(lH, aimHandFrame(lWr, vec(p.lAx, p.lAy, p.lAz, 1), vec(p.lNx, p.lNy, p.lNz, 1), 1), p.lIK, 1);
  if (p.rIK > 0.001 && (p.rAx || p.rAy || p.rAz)) rH = blendFrame(rH, aimHandFrame(rWr, vec(p.rAx, p.rAy, p.rAz, -1), vec(p.rNx, p.rNy, p.rNz, -1), -1), p.rIK, -1);
  const hx = f ? 4.3 : 4.3, ht = -tw * 0.5;
  const lHip = add(pelvis, v(hx * Math.cos(ht), -1, -hx * Math.sin(ht)));
  const rHip = add(pelvis, v(-hx * Math.cos(ht), -1, hx * Math.sin(ht)));
  let lKn: V3, rKn: V3, lAn: V3, rAn: V3, lToe: V3, rToe: V3;
  const all = () => [pelvis, chest, neck, head, lSh, rSh, lEl, rEl, lWr, rWr, lHip, rHip, lKn, rKn, lAn, rAn, lToe, rToe];
  if (p.sit > 0.5) {
    lKn = add(pelvis, v(11, -6, 5)); rKn = add(pelvis, v(-11, -6, 5));
    lAn = add(pelvis, v(-4, -9, 7)); rAn = add(pelvis, v(4, -9, 8));
    lToe = add(rKn, v(-1, -1, 3)); rToe = add(lKn, v(1, -1, 3));
  } else {
    const lTh = limbDir(p.lHip, p.lHipR, 1), rTh = limbDir(p.rHip, p.rHipR, -1);
    lKn = add(lHip, lTh, D.thL * llS); rKn = add(rHip, rTh, D.thL * rlS);
    const lSn = limbDir(p.lHip - p.lKn, p.lHipR * 0.6, 1), rSn = limbDir(p.rHip - p.rKn, p.rHipR * 0.6, -1);
    lAn = add(lKn, lSn, D.shL * llS); rAn = add(rKn, rSn, D.shL * rlS);
    lToe = add(lAn, v(0, -3.2 - Math.sin(p.lFoot) * 4, 6.2 * Math.cos(p.lFoot)));
    rToe = add(rAn, v(0, -3.2 - Math.sin(p.rFoot) * 4, 6.2 * Math.cos(p.rFoot)));
    if (p.ground > 0.5) {
      const low = Math.min(lAn.y - 3.4, rAn.y - 3.4, lToe.y, rToe.y);
      for (const q of all()) q.y -= low;
    }
    if (p.air > 0.01) for (const q of all()) q.y += p.air;
  }
  return { pelvis, chest, neck, head, up, fw, lt, lSh, rSh, lEl, rEl, lWr, rWr, lH, rH, lHip, rHip, lKn, rKn, lAn, rAn, lToe, rToe, D };
}

type Pt = { x: number; y: number; z?: number; tag?: number };
/**
 * 凸包（逆时针，起点为 x 最小、其次 y 最小的点，共线点只留两端）。
 * 礼品包装法：不复制、不排序。人物每帧要算好几次（裙摆 / 衣片），原先的「复制 + 带比较函数排序」占混战主线程约 7%。
 * 输出与原单调链实现逐点一致（tools/test-hull.ts 对拍）。
 */
export function convexHull<T extends { x: number; y: number }>(pts: T[]): T[] {
  const n = pts.length;
  if (n < 3) return pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  let s = 0;
  for (let i = 1; i < n; i++) { const q = pts[i], b = pts[s]; if (q.x < b.x || (q.x === b.x && q.y < b.y)) s = i; }
  const out: T[] = [];
  let p = s;
  do {
    const P = pts[p]; out.push(P);
    let q = -1, qx = 0, qy = 0, qd = 0;
    for (let r = 0; r < n; r++) {
      const R = pts[r], rx = R.x - P.x, ry = R.y - P.y;
      if (rx === 0 && ry === 0) continue;   // 与当前点重合
      if (q < 0) { q = r; qx = rx; qy = ry; qd = rx * rx + ry * ry; continue; }
      const c = qx * ry - qy * rx, d = rx * rx + ry * ry;
      // r 在 p→q 右侧（顺时针）就换成 r；共线取更远的
      if (c < 0 || (c === 0 && d > qd)) { q = r; qx = rx; qy = ry; qd = d; }
    }
    if (q < 0) break;   // 全部重合
    p = q;
  } while (p !== s && out.length <= n);
  return out;
}

// ---------------------------------------------------------------- 投影与绘制
const PITCH = 0.36; // 俯视角
const CP = Math.cos(PITCH), SP = Math.sin(PITCH);
type P2 = { x: number; y: number; z: number };
const TAU = Math.PI * 2;

// 头部贴图的尺寸/锚点（旧：手绘头）
const HEAD_NECK_UP = 3.2, HEAD_TOP_Y = 9.6, HEAD_TEX_K = 1.08, HEAD_NECK_SINK = 0.06;

export interface DrawOpts { alpha?: number; ghost?: boolean; glow?: number; preview?: boolean; pose?: Pose; physicsDt?: number; /** 遁具法器 id（飞行时脚下/背后） */ mount?: string; /** GL 大雷翼展开时不画背上的小翅 */ hideMount?: boolean; /** 细节档：>1 抬高精细度门槛（远处路人省掉靴缝/衣纹/袖口里子等） */ detail?: number }

function characterPose(st: CharState, look: Look, R: RLook, dt: number, ghost: boolean): Pose {
  let pose = poseFor(st, look, R);
  if (st.from && st.blend < 1 && !KEY_TRACKS.get(st.action)?.snapIn) pose = blendPose(st.from, pose, smooth01(st.blend));   // r8-p1：卡帧动作起手直接切过去，不补帧
  if (!ghost) { st.last = pose; updateHands(st, pose, dt); }
  return pose;
}

export function advanceCharacterPose(look: Look, st: CharState, dt: number): Pose {
  return characterPose(st, look, resolveLook(look), dt, false);
}

const LEG_KEYS: (keyof Pose)[] = ['lHip', 'lHipR', 'lKn', 'lFoot', 'rHip', 'rHipR', 'rKn', 'rFoot', 'rootX', 'rootY', 'air'];

function overlayGait(p: Pose, st: CharState, R: RLook) {
  if (!st.gait) return;
  const q = neutral();
  if (st.gait === 'run') runPose(q, st, R); else walkLegs(q, st, R);
  for (const k of LEG_KEYS) (p as any)[k] = (q as any)[k];
}

function walkLegs(p: Pose, st: CharState, R: RLook) {
  const ph = st.phase, s = Math.sin(ph), c = Math.cos(ph);
  const A = R.fem ? 0.32 : 0.4;
  p.lHip = A * s; p.rHip = -A * s;
  p.lKn = 0.08 + 0.75 * Math.pow(Math.max(0, c), 2); p.rKn = 0.08 + 0.75 * Math.pow(Math.max(0, -c), 2);
  p.lFoot = -0.25 * Math.max(0, -s); p.rFoot = -0.25 * Math.max(0, s);
  p.rootY = 0.5 * Math.cos(ph * 2);
  if (R.fem) { p.lHipR = p.rHipR = 0; p.rootX = 0.5 * s; }
}

function runPose(p: Pose, st: CharState, R: RLook) {
  const ph = st.phase, s = Math.sin(ph), c = Math.cos(ph);
  const sp = Math.min(1.25, Math.max(0.7, st.speed / 260)) * (R.fem ? 0.88 : 1);
  const hipL = 0.14 + (s > 0 ? 0.68 : 0.5) * s * sp, hipR = 0.14 - (s < 0 ? 0.68 : 0.5) * s * sp;
  p.lHip = hipL; p.rHip = hipR;
  const fold = (k: number) => Math.pow(Math.max(0, k), 1.3);
  const reach = (sn: number, cs: number) => 0.62 * Math.pow(Math.max(0, sn), 2) * (0.5 + 0.5 * Math.max(-1, Math.min(1, cs * 3)));
  p.lKn = 0.26 + 1.7 * fold(Math.cos(ph + 0.2)) * sp + reach(s, c); p.rKn = 0.26 + 1.7 * fold(-Math.cos(ph + 0.2)) * sp + reach(-s, -c);
  p.lKn += 0.2 * Math.max(0, 1 - Math.abs(hipL - 0.05) * 3) * (c < 0 ? 1 : 0);
  p.rKn += 0.2 * Math.max(0, 1 - Math.abs(hipR - 0.05) * 3) * (c > 0 ? 1 : 0);
  p.lFoot = -0.55 * Math.max(0, -s) + 0.15 * Math.max(0, s); p.rFoot = -0.55 * Math.max(0, s) + 0.15 * Math.max(0, -s);
  p.lHipR = 0.06; p.rHipR = 0.06;
  p.lSh = -0.78 * s * sp + 0.05; p.rSh = 0.78 * s * sp + 0.05;
  p.lEl = 1.05 + 0.45 * Math.max(0, -s); p.rEl = 1.05 + 0.45 * Math.max(0, s);
  p.lShR = 0.24; p.rShR = 0.24; p.lFr = -0.2; p.rFr = -0.2;
  p.lSup = 0.1; p.rSup = 0.1; p.lWb = -0.1 + 0.25 * c; p.rWb = -0.1 - 0.25 * c;
  p.lG = p.rG = R.fem ? 'palm' : 'fist';
  p.lean = 0.33 + 0.035 * Math.cos(ph * 2) + 0.04 * (sp - 1);
  p.twist = 0.2 * s; p.side = 0.035 * c;
  p.headPitch = -0.16; p.headYaw = -0.05 * s;
  p.breath = 0.4 * Math.sin(ph * 2);
  p.air = 2.2 * Math.pow(Math.abs(s), 2.2) * sp;
}

export function drawCharacter(ctx: CanvasRenderingContext2D, look: Look, st: CharState, scale: number, dt: number, opts: DrawOpts = {}) {
  const timing = prof.on;
  let start = timing ? performance.now() : 0;
  const R = resolveLook(look);
  const pose = opts.pose ?? characterPose(st, look, R, dt, !!opts.ghost);
  if (!opts.ghost && st.gait) overlayGait(pose, st, R);   // 移动中施法/受击：下半身交回步态，避免站着滑行
  if (!opts.ghost && KEY_TRACKS.has(st.action)) drawKeyFx(ctx, look, st, scale, R, opts);   // r8-p1：多重肢体、拖影帧（画在身子后面）
  const sk = solve(pose, look, R);
  if (timing) { prof.add('R·人物骨架', start); start = performance.now(); }
  const D = sk.D, B = R.body, fem = R.fem;
  const S = scale * look.height;
  const tf = typeof (ctx as any).getTransform === 'function' ? ctx.getTransform() : null;
  const zs = tf ? Math.hypot(tf.a, tf.b) || 1 : 1;
  const E = S * zs;                      // 局部单位 → 屏幕像素（细节分级）
  const dk = opts.detail ?? 1;
  const far = E < (dk > 1 ? 2.6 * dk : 1.0);
  if (!opts.ghost) { st.last = pose; if (!far) updateHands(st, pose, dt); }
  const fine = E > 1.6 * (opts.detail ?? 1);   // detail > 1：远处的路人提前降档
  const yaw = st.yaw, cy = Math.cos(yaw), sy = Math.sin(yaw);
  const bx = st.x, by = st.y - st.lift;
  const P = (q: V3): P2 => {
    const X = q.x * cy + q.z * sy, Z = -q.x * sy + q.z * cy;
    return { x: bx + X * S, y: by + (-q.y * CP + Z * SP) * S, z: Z };
  };
  const cam = (n: V3) => n.y * SP + (-n.x * sy + n.z * cy) * CP;
  const lw = Math.max(0.42 * S, 0.7 / zs);
  const front = cy;
  const parts: { z: number; f: () => void }[] = [];
  const physDt = opts.ghost ? 0 : opts.physicsDt ?? dt;
  const physSlices = opts.physicsDt === undefined ? 1 : Math.max(1, Math.ceil(physDt / Math.max(dt, 1 / 60)));
  const hero = !!(look.hero || look.headTex);
  /** r7 体修赤膊（撼山客）：上身露肉、缠拳布、腰间系着残破的道袍 */
  const TX = look.tixiu;
  const flying = st.action === 'fly';
  const flutter = (flying ? 1 : st.action === 'run' ? (hero ? 0.85 : 0.55) : 0.15) * Math.sin(st.t * 13 + st.seed);
  const runK = st.action === 'run' && hero ? 1.35 : 1;
  const windX = -st.vx * runK + st.windX + flutter * 40 * S;
  const windY = -st.vy * runK + st.windY + flutter * 20 * S;
  const grav = 520 * S;
  const strand = (key: string, n: number, len: number, ax: number, ay: number, drag = 2.2, gScale = 1) => {
    let s = st.strands.get(key);
    if (!s) { s = new Strand(n, len * S); st.strands.set(key, s); }
    s.step(ax, ay, physDt, 0, grav * gScale, windX, windY, drag, len * S, 8 * physSlices);
    return s;
  };
  const spring = (key: string, tx: number, ty: number, k = 160, c = 15) => {
    let s = st.springs.get(key);
    if (!s) { s = new Spring(); st.springs.set(key, s); }
    s.step(tx, ty, physDt, k, c, 4 * physSlices);
    return s;
  };
  const g = ctx;
  g.save();
  if (opts.alpha !== undefined) g.globalAlpha *= opts.alpha;
  g.lineJoin = 'round'; g.lineCap = 'round';

  // ---------- 工具 ----------
  const tube = (a: P2 | Pt, b: P2 | Pt, ra: number, rb: number, fill: string | CanvasGradient, stroke: string | null = inkOf(typeof fill === 'string' ? fill : '#555555')) => {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-3;
    const nx = -dy / d, ny = dx / d, ang = Math.atan2(dy, dx);
    g.beginPath();
    g.moveTo(a.x + nx * ra, a.y + ny * ra);
    g.lineTo(b.x + nx * rb, b.y + ny * rb);
    g.arc(b.x, b.y, rb, ang + Math.PI / 2, ang - Math.PI / 2, true);
    g.lineTo(a.x - nx * ra, a.y - ny * ra);
    g.arc(a.x, a.y, ra, ang - Math.PI / 2, ang + Math.PI / 2, true);
    g.closePath();
    g.fillStyle = fill; g.fill();
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
  };
  const ribbon = (s: Strand, w0: number, w1: number, fill: string, stroke = true, extra?: { x: number; y: number }) => {
    const n = s.n; const L: [number, number][] = [], Rr: [number, number][] = [];
    const xs: number[] = [], ys: number[] = [];
    if (extra) { xs.push(extra.x); ys.push(extra.y); }
    for (let i = 0; i < n; i++) { xs.push(s.x[i]); ys.push(s.y[i]); }
    const m = xs.length;
    for (let i = 0; i < m; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(m - 1, i + 1);
      const dx = xs[i1] - xs[i0], dy = ys[i1] - ys[i0], d = Math.hypot(dx, dy) || 1;
      const w = (w0 + (w1 - w0) * (i / (m - 1))) * S * 0.5;
      L.push([xs[i] - dy / d * w, ys[i] + dx / d * w]); Rr.push([xs[i] + dy / d * w, ys[i] - dx / d * w]);
    }
    g.beginPath();
    g.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < m; i++) g.quadraticCurveTo(L[i - 1][0], L[i - 1][1], (L[i - 1][0] + L[i][0]) / 2, (L[i - 1][1] + L[i][1]) / 2);
    g.lineTo(L[m - 1][0], L[m - 1][1]); g.lineTo(Rr[m - 1][0], Rr[m - 1][1]);
    for (let i = m - 2; i >= 0; i--) g.quadraticCurveTo(Rr[i + 1][0], Rr[i + 1][1], (Rr[i + 1][0] + Rr[i][0]) / 2, (Rr[i + 1][1] + Rr[i][1]) / 2);
    g.lineTo(Rr[0][0], Rr[0][1]);
    g.closePath(); g.fillStyle = fill; g.fill();
    if (stroke) { g.strokeStyle = inkOf(fill); g.lineWidth = lw * 0.8; g.stroke(); }
  };
  const smoothPoly = (pts: { x: number; y: number }[]) => {
    const n = pts.length; g.beginPath();
    g.moveTo((pts[n - 1].x + pts[0].x) / 2, (pts[n - 1].y + pts[0].y) / 2);
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; g.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2); }
    g.closePath();
  };
  const polyline = (pts: { x: number; y: number }[]) => {
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) g.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
    if (pts.length > 1) g.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  };
  const shadeFill = (x0: number, x1: number, y: number, base: string): string | CanvasGradient => {
    if (!fine) return base;
    const gr = g.createLinearGradient(x0, y, x1, y);
    gr.addColorStop(0, shade(base, 0.14)); gr.addColorStop(0.42, base); gr.addColorStop(1, shade(base, -0.24));
    return gr;
  };

  // ---------- 躯干截面环（相对骨盆沿脊柱的高度 y；w 半宽，df/db 前后半厚，tk 扭转比例）----------
  const U = sk.up, FW = sk.fw, LT = sk.lt, tw = pose.twist;
  type Ring = { y: number; w: number; df: number; db: number; tk: number };
  const cl = 0.55;
  const rings: Ring[] = fem ? [
    { y: 0.5, w: D.hw + cl, df: D.td + 0.4, db: D.td + 1.0, tk: 0 },
    { y: 7.6, w: D.ww + cl, df: D.td - 0.4 + B.belly * 2.4, db: D.td - 0.6, tk: 0.25 },
    { y: 13.4, w: D.sw * 0.8 + cl, df: D.td + 0.1, db: D.td - 0.3, tk: 0.6 },
    { y: 16.8, w: D.sw * 0.88 + cl, df: D.td + 1.45 * B.chest, db: D.td - 0.2, tk: 0.85 },
    { y: 21.0, w: D.sw * 0.98, df: 3.2, db: 3.4, tk: 1 },
    { y: 24.4, w: 2.2, df: 2.1, db: 2.3, tk: 1 },
  ] : [
    { y: 0.5, w: D.hw + cl, df: D.td + 0.2, db: D.td + 0.5, tk: 0 },
    { y: 7.6, w: D.ww + cl, df: D.td - 0.2 + B.belly * 3.0, db: D.td - 0.5, tk: 0.25 },
    { y: 13.8, w: D.sw * 0.85 + cl, df: D.td + 0.35 * B.chest, db: D.td, tk: 0.6 },
    { y: 17.8, w: D.sw * 0.93 + cl, df: D.td + 0.6 * B.chest, db: D.td + 0.1, tk: 0.85 },
    { y: 21.9, w: D.sw * 1.0, df: 3.6, db: 3.8, tk: 1 },
    { y: 25.2, w: 2.6, df: 2.4, db: 2.6, tk: 1 },
  ];
  const frameK = (tk: number) => {
    const dl = (1 - tk) * tw, c = Math.cos(dl), s = Math.sin(dl);
    return { l: add({ x: LT.x * c, y: LT.y * c, z: LT.z * c }, FW, s), f: add({ x: FW.x * c, y: FW.y * c, z: FW.z * c }, LT, -s) };
  };
  const ringAt = (y: number): Ring => {
    if (y <= rings[0].y) return rings[0];
    for (let i = 0; i < rings.length - 1; i++) {
      const a = rings[i], b = rings[i + 1];
      if (y <= b.y) { const t = (y - a.y) / (b.y - a.y); return { y, w: lerp(a.w, b.w, t), df: lerp(a.df, b.df, t), db: lerp(a.db, b.db, t), tk: lerp(a.tk, b.tk, t) }; }
    }
    return rings[rings.length - 1];
  };
  const ringPt = (r: Ring, u: number, out = 0): V3 => {
    const fr = frameK(r.tk), cu = Math.cos(u), su = Math.sin(u);
    const c = add(sk.pelvis, U, r.y);
    return add(add(c, fr.l, su * (r.w + out)), fr.f, cu * ((cu >= 0 ? r.df : r.db) + out));
  };
  /** 躯干正面某高度、横向比例 s（-1 右 … 1 左）处的表面点 */
  const surf = (y: number, s: number, out = 0.15): V3 => {
    const r = ringAt(y), fr = frameK(r.tk), c = add(sk.pelvis, U, y);
    return add(add(c, fr.l, s * (r.w + out)), fr.f, Math.sqrt(Math.max(0, 1 - s * s)) * (r.df + out));
  };
  /** 环朝镜头的一半（屏幕左→右） */
  const nearArc = (r: Ring, out = 0, N = 14) => {
    const fr = frameK(r.tk);
    const pts: P2[] = [];
    for (let i = 0; i <= N * 2; i++) {
      const u = -Math.PI + (i / (N * 2)) * TAU;
      const nrmv = add({ x: fr.l.x * Math.sin(u), y: fr.l.y * Math.sin(u), z: fr.l.z * Math.sin(u) }, fr.f, Math.cos(u));
      if (cam(nrmv) >= -0.02) pts.push(P(ringPt(r, u, out)));
    }
    // 可见段可能跨越 u=±π 被切成两截：按屏幕 x 排序即可（近半环在屏幕上单调）
    pts.sort((a, b) => a.x - b.x);
    return pts;
  };
  const extremes = (r: Ring, out = 0) => {
    let L: P2 | null = null, Rr: P2 | null = null;
    for (let i = 0; i < 12; i++) { const q = P(ringPt(r, (i / 12) * TAU, out)); if (!L || q.x < L.x) L = q; if (!Rr || q.x > Rr.x) Rr = q; }
    return [L!, Rr!] as const;
  };

  const pel = P(sk.pelvis), che = P(sk.chest), hed = P(sk.head);
  const torsoZ = (pel.z + che.z) / 2;
  const fv = cam(FW);                // 胸前朝镜头程度

  // ---------- 飞剑 / 遁具 ----------
  if (flying) {
    const L = opts.mount ? artLook(opts.mount) : null;
    if (L && L.shape === 'boat') parts.push({ z: -999, f: () => drawBoatUnderFeet(g, bx, by, yaw, S, st.t, opts.mount!) });
    else if (L && L.shape === 'wings' && opts.hideMount) { /* GL 雷翼代替 */ }
    else if (L && (L.shape === 'wings' || L.shape === 'cloak')) {
      const back = Math.cos(yaw) > 0;
      parts.push({ z: back ? -998 : 999, f: () => drawBackMount(g, che.x, che.y, yaw, S, st.t, opts.mount!) });
    } else parts.push({ z: -999, f: () => drawSwordUnderFeet(g, bx, by, yaw, S, st.t, look.swordColor || '#7ff0c0') });
  }
  if (opts.glow && opts.glow > 0) {
    parts.push({ z: -1000, f: () => {
      const r = 34 * S;
      const gr = g.createRadialGradient(bx, by - 30 * S, 0, bx, by - 30 * S, r * 1.6);
      gr.addColorStop(0, `rgba(150,255,210,${0.32 * opts.glow!})`); gr.addColorStop(1, 'rgba(150,255,210,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(bx, by - 30 * S, r * 1.3, r * 1.6, 0, 0, Math.PI * 2); g.fill();
    } });
  }

  // ---------- 下半身：腿 + 下裳 ----------
  const seated = pose.sit > 0.5;
  const legThick = (fem ? 0.9 : 1) * (0.85 + 0.15 * B.heft);
  const shortSkirt = R.skirt === 'pants' || R.skirt === 'split';
  const legOne = (side: 1 | -1) => {
    const hip = side > 0 ? sk.lHip : sk.rHip, kn = side > 0 ? sk.lKn : sk.rKn, an = side > 0 ? sk.lAn : sk.rAn, toe = side > 0 ? sk.lToe : sk.rToe;
    const H = P(hip), K = P(kn), A = P(an), T = P(toe);
    tube(H, K, 4.0 * legThick * S, 3.2 * legThick * S, look.pants);
    tube(K, A, 3.2 * legThick * S, 2.2 * legThick * S, look.pants);
    if (shortSkirt) {
      // 靴筒 + 绑腿
      const m = P(lerpV(kn, an, 0.36));
      tube(m, A, 2.95 * legThick * S, 2.4 * legThick * S, look.boots);
      if (E > 2.2) { g.strokeStyle = rgba(shade(look.boots, 0.35), 0.6); g.lineWidth = lw * 0.8; g.beginPath(); g.moveTo(m.x - 2.6 * S, m.y + 0.6 * S); g.lineTo(m.x + 2.6 * S, m.y + 0.6 * S); g.stroke(); }
    }
    const heel = P(add(an, v(0, -2.4, -1.3)));
    tube(heel, T, 2.3 * S * legThick, 1.7 * S * legThick, look.boots);
    if (fine) {
      g.strokeStyle = rgba(shade(look.boots, -0.5), 0.8); g.lineWidth = 0.9 * S;
      g.beginPath(); g.moveTo(heel.x, heel.y + 1.9 * S * legThick); g.lineTo(T.x, T.y + 1.4 * S * legThick); g.stroke();
      if (fem) { g.fillStyle = shade(look.boots, 0.25); g.beginPath(); g.arc(T.x, T.y - 0.4 * S, 0.9 * S, 0, TAU); g.fill(); }
    }
  };
  const legs = () => {
    if (seated) return;
    const L = { z: P(sk.lKn).z, f: () => legOne(1) }, Rr = { z: P(sk.rKn).z, f: () => legOne(-1) };
    (L.z < Rr.z ? [L, Rr] : [Rr, L]).forEach((o) => o.f());
  };
  const skirtCol = R.over === 'beizi' ? R.overColor : R.skirtColor;
  const heroRun = st.action === 'run' && hero;
  /**
   * r7 酒葫芦：(ax, ay) 系绳的地方（null = 不画绳，拿在手里），(ex, ey) 葫芦嘴；葫芦身顺着 (ux, uy) 往外长（不给就顺着绳子往下垂）。k 大小
   */
  const gourdAt = (ax: number | null, ay: number, ex: number, ey: number, k: number, ux?: number, uy?: number) => {
    if (ax !== null) { g.strokeStyle = 'rgba(150,40,34,0.9)'; g.lineWidth = 0.8 * S; g.beginPath(); g.moveTo(ax, ay); g.lineTo(ex, ey); g.stroke(); }
    let dx = ux ?? (ax === null ? 0 : ex - ax), dy = uy ?? (ax === null ? 1 : ey - ay); const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    if (ux === undefined) { dx = dx * 0.35; dy = 0.65 + 0.35 * Math.max(0, dy); const l2 = Math.hypot(dx, dy) || 1; dx /= l2; dy /= l2; }
    const c1x = ex + dx * 1.7 * S * k, c1y = ey + dy * 1.7 * S * k, c2x = ex + dx * 5.0 * S * k, c2y = ey + dy * 5.0 * S * k;
    const col = '#cdb06e';
    g.fillStyle = col; g.beginPath(); g.arc(c1x, c1y, 1.55 * S * k, 0, TAU); g.arc(c2x, c2y, 2.5 * S * k, 0, TAU); g.fill();
    g.strokeStyle = inkOf(col); g.lineWidth = lw * 0.7; g.beginPath(); g.arc(c1x, c1y, 1.55 * S * k, 0, TAU); g.stroke(); g.beginPath(); g.arc(c2x, c2y, 2.5 * S * k, 0, TAU); g.stroke();
    // 腰上一道红绳、受光的一点
    g.strokeStyle = 'rgba(160,36,30,0.95)'; g.lineWidth = 0.7 * S * k; g.beginPath(); g.moveTo(c1x - dy * 1.3 * S * k + dx * 1.4 * S * k, c1y + dx * 1.3 * S * k + dy * 1.4 * S * k); g.lineTo(c1x + dy * 1.3 * S * k + dx * 1.4 * S * k, c1y - dx * 1.3 * S * k + dy * 1.4 * S * k); g.stroke();
    if (fine) { g.fillStyle = 'rgba(255,236,190,0.45)'; g.beginPath(); g.arc(c2x - 0.9 * S * k, c2y - 0.8 * S * k, 0.7 * S * k, 0, TAU); g.fill(); }
    g.fillStyle = '#5a3a1e'; g.beginPath(); g.arc(ex - dx * 0.3 * S * k, ey - dy * 0.3 * S * k, 0.6 * S * k, 0, TAU); g.fill();   // 塞子
  };
  /** r7 残破道袍的下摆：沿下摆链每隔一小段垂一绺撕开的布条（长短按序号取哈希，随动作轻轻摆），外加一道磨毛的暗边 */
  const tatters = (chain: Pt[], color: string) => {
    let L = 0; const seg: number[] = [0];
    for (let i = 1; i < chain.length; i++) { L += Math.hypot(chain[i].x - chain[i - 1].x, chain[i].y - chain[i - 1].y); seg.push(L); }
    const step = 2.3 * S, n = Math.max(2, Math.floor(L / step));
    const sway = (st.action === 'walk' || st.action === 'run' ? 0.9 : 0.35) + (st.action === 'rush' || st.action === 'tumble' ? 1.2 : 0);
    g.fillStyle = shade(color, -0.04); g.strokeStyle = inkOf(color); g.lineWidth = lw * 0.7;
    let j = 1;
    for (let i = 0; i <= n; i++) {
      const s = (i / n) * L;
      while (j < chain.length - 1 && seg[j] < s) j++;
      const a = chain[j - 1], b = chain[j], u = seg[j] > seg[j - 1] ? (s - seg[j - 1]) / (seg[j] - seg[j - 1]) : 0;
      const x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u;
      const h = ((i * 2654435761) >>> 0) / 4294967296, len = (1.2 + 3.0 * h) * S, w = (0.8 + 0.5 * h) * S;
      const sw = Math.sin(st.t * 4 + i * 1.7 + st.seed) * 0.6 * S * sway;
      g.beginPath(); g.moveTo(x - w, y - 0.6 * S); g.lineTo(x + w, y - 0.6 * S); g.lineTo(x + sw + w * 0.2, y + len); g.closePath(); g.fill(); g.stroke();
    }
    g.strokeStyle = rgba(shade(color, -0.5), 0.7); g.lineWidth = 1.1 * S; polyline(chain); g.stroke();
  };
  const skirt = () => {
    const col = skirtCol;
    if (seated) {
      const lk = P(sk.lKn), rk = P(sk.rKn), wl = P(add(sk.pelvis, v(D.ww, 8, 0))), wr = P(add(sk.pelvis, v(-D.ww, 8, 0)));
      const base = P(add(sk.pelvis, v(0, -10, 4)));
      const lx = Math.min(lk.x, rk.x) - 4 * S, rx = Math.max(lk.x, rk.x) + 4 * S;
      const top = Math.min(wl.y, wr.y), yb = Math.max(lk.y, rk.y, base.y) + 3 * S;
      g.beginPath();
      g.moveTo(Math.min(wl.x, wr.x), top);
      g.bezierCurveTo(lx - 1 * S, top + 6 * S, lx - 6 * S, yb - 6 * S, lx + 2 * S, yb);
      g.quadraticCurveTo((lx + rx) / 2, yb + 5 * S, rx - 2 * S, yb);
      g.bezierCurveTo(rx + 6 * S, yb - 6 * S, rx + 1 * S, top + 6 * S, Math.max(wl.x, wr.x), top);
      g.closePath();
      g.fillStyle = shadeFill(lx, rx, top, col); g.fill();
      g.strokeStyle = inkOf(col); g.lineWidth = lw; g.stroke();
      g.strokeStyle = rgba(shade(col, -0.5), 0.45); g.lineWidth = lw * 0.8;
      const cx = (lx + rx) / 2;
      g.beginPath();
      for (const k of [-1, 1]) { g.moveTo(cx + k * 6 * S, top + 8 * S); g.quadraticCurveTo(cx + k * 10 * S, yb - 4 * S, cx + k * 15 * S, yb); }
      g.moveTo(cx, top + 10 * S); g.quadraticCurveTo(cx + 1 * S, yb - 2 * S, cx, yb + 3 * S);
      g.stroke();
      g.strokeStyle = look.trim; g.lineWidth = 1.6 * S;
      g.beginPath(); g.moveTo(lx + 2 * S, yb); g.quadraticCurveTo(cx, yb + 5 * S, rx - 2 * S, yb); g.stroke();
      g.fillStyle = look.boots; g.beginPath(); g.ellipse(cx - 5 * S, yb - 0.5 * S, 2.6 * S, 1.6 * S, 0, 0, TAU); g.fill();
      return;
    }
    const kind = R.skirt, len = look.robeLen;
    const hemOf = (hip: V3, kn: V3, an: V3) => {
      if (kind === 'pleat') { const q = lerpV(kn, an, 1.04); q.y = Math.max(q.y, 1.0); return q; }
      return len === 'long' ? lerpV(kn, an, 0.8) : len === 'mid' ? lerpV(kn, an, 0.28) : lerpV(hip, kn, 0.62);
    };
    let hL = hemOf(sk.lHip, sk.lKn, sk.lAn), hR = hemOf(sk.rHip, sk.rKn, sk.rAn);
    if (heroRun) { const m = lerpV(hL, hR, 0.5); hL = add(lerpV(hL, m, 0.3), U, 1.6); hR = add(lerpV(hR, m, 0.3), U, 1.6); }
    const mid = lerpV(hL, hR, 0.5);
    const flare = kind === 'pleat' ? 1.3 : len === 'short' ? 0.82 : 1.0;
    const R0 = (len === 'short' ? 5.6 : len === 'mid' ? 6.1 : 6.6) * flare * (0.9 + 0.1 * B.heft) * (fem ? 0.94 : 1);
    const cL = lerpV(hL, mid, 0.35), cR = lerpV(hR, mid, 0.35);
    const fl = flying ? 1 : heroRun ? 0.9 : st.action === 'run' ? 0.6 : 0.2;
    const off = (key: string, c: V3) => { const C = P(c); const s = spring(key, C.x, C.y, 110, 10); return { dx: s.x - C.x, dy: s.y - C.y }; };
    const oL = off('hemL', cL), oR = off('hemR', cR);
    const fr0 = frameK(0);
    const topR = rings[1], hipR = rings[0];
    const build = (filter: (cu: number) => boolean) => {
      const pts: Pt[] = [];
      for (let i = 0; i < 14; i++) { const u = (i / 14) * TAU; if (!filter(Math.cos(u))) continue; const q = P(ringPt(topR, u, 0.25)); pts.push({ x: q.x, y: q.y, tag: 2 }); const h = P(ringPt(hipR, u, 0.6)); pts.push({ x: h.x, y: h.y, tag: 0 }); }
      ([[cL, oL, 1], [cR, oR, -1]] as [V3, { dx: number; dy: number }, number][]).forEach(([c, o, side]) => {
        for (let i = 0; i < 16; i++) {
          const u = (i / 16) * TAU, cu = Math.cos(u), su = Math.sin(u);
          if (!filter(cu)) continue;
          const q = P(add(add(c, fr0.l, su * R0 * 0.95), fr0.f, cu * R0 * 0.86));
          const k = 0.55 + 0.45 * Math.abs(su);
          const flut = Math.sin(st.t * 10 + side * 2 + i * 1.3) * fl * 1.2 * S;
          pts.push({ x: q.x + o.dx * k + flut, y: q.y + o.dy * k, tag: 1 });
        }
      });
      return convexHull(pts);
    };
    const panel = (hull: Pt[], color: string, front: boolean) => {
      if (hull.length < 3) return;
      g.beginPath(); hull.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const q of hull) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
      g.fillStyle = shadeFill(x0, x1, y0, color); g.fill();
      g.strokeStyle = inkOf(color); g.lineWidth = lw; g.stroke();
      // 下摆链（hull 上连续的 tag=1 点）
      const n = hull.length; let best = -1, bl = 0;
      for (let i = 0; i < n; i++) {
        if (hull[i].tag !== 1 || hull[(i - 1 + n) % n].tag === 1) continue;
        let l = 0; while (l < n && hull[(i + l) % n].tag === 1) l++;
        if (l > bl) { bl = l; best = i; }
      }
      if (bl === n) best = 0;
      const chain: Pt[] = []; for (let l = 0; l < bl; l++) chain.push(hull[(best + l) % n]);
      g.save(); g.clip();
      if (fine) {
        // 衣褶：腰→两膝（受力褶）+ 垂褶；百褶裙则是一排竖褶
        const wl = P(surf(topR.y - 0.5, 0.55)), wr = P(surf(topR.y - 0.5, -0.55)), wc = P(surf(topR.y - 0.5, 0));
        const kl = P(cL), kr = P(cR);
        g.lineWidth = lw * 0.75;
        if (kind === 'pleat') {
          const N = 9;
          for (let i = 1; i < N; i++) {
            const tx = x0 + (x1 - x0) * i / N;
            g.strokeStyle = rgba(shade(color, -0.45), 0.3);
            g.beginPath(); g.moveTo(tx + (wc.x - (x0 + x1) / 2) * 0.6, y0 + 3 * S); g.quadraticCurveTo(tx, (y0 + y1) / 2, tx + (tx - (x0 + x1) / 2) * 0.12, y1); g.stroke();
            g.strokeStyle = rgba(shade(color, 0.4), 0.28);
            g.beginPath(); g.moveTo(tx + 1.1 * S + (wc.x - (x0 + x1) / 2) * 0.6, y0 + 4 * S); g.lineTo(tx + 1.1 * S + (tx - (x0 + x1) / 2) * 0.12, y1 - 1 * S); g.stroke();
          }
        } else {
          g.strokeStyle = rgba(shade(color, -0.5), 0.38);
          g.beginPath();
          g.moveTo(wl.x, wl.y + 2 * S); g.quadraticCurveTo((wl.x + kl.x) / 2 + 1.5 * S, (wl.y + kl.y) / 2, kl.x + oL.dx * 0.6, kl.y + oL.dy * 0.6);
          g.moveTo(wr.x, wr.y + 2 * S); g.quadraticCurveTo((wr.x + kr.x) / 2 - 1.5 * S, (wr.y + kr.y) / 2, kr.x + oR.dx * 0.6, kr.y + oR.dy * 0.6);
          g.moveTo(wc.x, wc.y + 3 * S); g.quadraticCurveTo(wc.x + 0.6 * S, (wc.y + y1) / 2, (kl.x + kr.x) / 2 + (oL.dx + oR.dx) * 0.3, y1 - 0.5 * S);
          g.stroke();
          g.strokeStyle = rgba(shade(color, 0.45), 0.3);
          g.beginPath(); g.moveTo(wl.x - 1.2 * S, wl.y + 3 * S); g.quadraticCurveTo((wl.x + kl.x) / 2, (wl.y + kl.y) / 2, kl.x - 1.2 * S, kl.y); g.stroke();
        }
        // 衣襟（正面）：交领袍下摆的门襟线 / 对襟、褙子的前开
        if (front && fv > 0.05) {
          g.save(); g.globalAlpha *= Math.min(1, fv * 2);
          if (R.collar === 'open' || R.over === 'beizi') {
            const a0 = P(surf(topR.y, 0.16)), a1 = P(surf(topR.y, -0.16));
            const hb = P(lerpV(cL, cR, 0.5)), bo = (oL.dx + oR.dx) / 2;
            if (R.over === 'beizi') {
              g.fillStyle = R.skirtColor;
              g.beginPath(); g.moveTo(a0.x, a0.y); g.lineTo(hb.x + bo + 2.2 * S, y1 + 2 * S); g.lineTo(hb.x + bo - 2.2 * S, y1 + 2 * S); g.lineTo(a1.x, a1.y); g.closePath(); g.fill();
            }
            g.strokeStyle = look.trim; g.lineWidth = 1.5 * S;
            g.beginPath(); g.moveTo(a0.x, a0.y); g.lineTo(hb.x + bo + 2.2 * S, y1 + 2 * S); g.moveTo(a1.x, a1.y); g.lineTo(hb.x + bo - 2.2 * S, y1 + 2 * S); g.stroke();
          } else if (R.collar === 'cross' && kind !== 'pleat') {
            const a0 = P(surf(topR.y, -0.42)), hb = P(add(lerpV(cL, cR, 0.5), fr0.l, -R0 * 0.25));
            g.strokeStyle = look.trim; g.lineWidth = 1.3 * S;
            g.beginPath(); g.moveTo(a0.x, a0.y); g.quadraticCurveTo(a0.x + (hb.x - a0.x) * 0.4, (a0.y + hb.y) / 2, hb.x + (oL.dx + oR.dx) * 0.4, y1 + 2 * S); g.stroke();
          }
          g.restore();
        }
      }
      // r7 体修：系在腰间的残破道袍——下摆没有镶边，是撕开的一绺一绺（加两块破洞）
      if (TX && chain.length > 1) {
        if (fine) {
          // 两块破洞（按下摆位置取稳定的形状，不取随机数）
          const n = chain.length, c0 = chain[Math.floor(n * 0.3)], c1 = chain[Math.floor(n * 0.72)];
          g.fillStyle = rgba(shade(color, -0.6), 0.75);
          for (const [q, k] of [[c0, 1], [c1, -1]] as [Pt, number][]) {
            const hx = q.x + k * 1.2 * S, hy = q.y - 4.2 * S;
            g.beginPath(); g.moveTo(hx - 1.4 * S, hy); g.lineTo(hx - 0.3 * S, hy - 1.1 * S); g.lineTo(hx + 1.3 * S, hy - 0.4 * S); g.lineTo(hx + 0.6 * S, hy + 1.2 * S); g.lineTo(hx - 0.9 * S, hy + 0.9 * S); g.closePath(); g.fill();
          }
        }
        g.restore();
        tatters(chain, color);
        return;
      }
      // 下摆镶边（+ 纹样）
      if (chain.length > 1) {
        const tw2 = (kind === 'pleat' ? 2.0 : 2.6) * S;
        g.strokeStyle = look.trim; g.lineWidth = tw2 * 2; polyline(chain); g.stroke();
        if (E > 2.4 && look.pattern && look.pattern !== 'none') hemPattern(g, chain, tw2, look.pattern, shade(look.trim, 0.45), S);
      }
      g.restore();
    };
    if (kind === 'split') {
      const fh = build((cu) => cu >= -0.25), bh = build((cu) => cu <= 0.25);
      const facing = fv > 0;
      const order = facing ? [() => panel(bh, shade(col, -0.08), false), legs, () => panel(fh, col, true)] : [() => panel(fh, shade(col, -0.08), true), legs, () => panel(bh, col, false)];
      order.forEach((f) => f());
    } else {
      legs();
      panel(build(() => true), col, true);
    }
    // 轻甲：腰下甲片（裙甲）
    if (R.over === 'armor' && fv > -0.3) armorTassets();
  };
  const armorTassets = () => {
    const col = R.overColor;
    for (const s of [-0.62, -0.2, 0.22, 0.64]) {
      const n = cam(add(frameK(0).f, frameK(0).l, s));
      if (n < -0.05) continue;
      const a = P(surf(7.4, s - 0.2, 0.9)), b = P(surf(7.4, s + 0.2, 0.9)), c2 = P(surf(-2.4, s + 0.24, 1.6)), d2 = P(surf(-2.4, s - 0.24, 1.6));
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c2.x, c2.y); g.quadraticCurveTo((c2.x + d2.x) / 2, (c2.y + d2.y) / 2 + 1.2 * S, d2.x, d2.y); g.closePath();
      g.fillStyle = shadeFill(Math.min(a.x, d2.x), Math.max(b.x, c2.x), a.y, col); g.fill();
      g.strokeStyle = inkOf(col); g.lineWidth = lw * 0.8; g.stroke();
      if (E > 2.5) { g.strokeStyle = rgba(shade(col, 0.5), 0.5); g.beginPath(); g.moveTo((a.x + d2.x) / 2, (a.y + d2.y) / 2); g.lineTo((b.x + c2.x) / 2, (b.y + c2.y) / 2); g.stroke(); }
    }
  };
  parts.push({ z: torsoZ - 0.5, f: skirt });

  // ---------- 披风（在背后，随风飘）----------
  if (R.over === 'cape' && !seated) {
    const col = R.overColor;
    const a0 = P(add(add(sk.lSh, FW, -D.td * 0.7), U, 1.2)), a1 = P(add(add(sk.rSh, FW, -D.td * 0.7), U, 1.2)), am = P(add(add(sk.chest, FW, -D.td - 0.6), U, 2.6));
    const capeLen = look.robeLen === 'short' ? 5.6 : 7.4;
    const sL = strand('capeL', 6, capeLen, a0.x, a0.y, 1.7, 0.9), sR = strand('capeR', 6, capeLen, a1.x, a1.y, 1.7, 0.9), sM = strand('capeM', 6, capeLen * 1.04, am.x, am.y, 1.5, 0.9);
    const zb = P(add(sk.chest, FW, -D.td - 2.5)).z;
    parts.push({ z: zb, f: () => {
      const n = sL.n - 1;
      g.beginPath(); g.moveTo(a0.x, a0.y);
      for (let i = 1; i <= n; i++) g.lineTo(sL.x[i], sL.y[i]);
      g.quadraticCurveTo(sM.x[n] + (sM.x[n] - (sL.x[n] + sR.x[n]) / 2) * 0.4, sM.y[n] + 2 * S, sR.x[n], sR.y[n]);
      for (let i = n - 1; i >= 1; i--) g.lineTo(sR.x[i], sR.y[i]);
      g.lineTo(a1.x, a1.y); g.quadraticCurveTo(am.x, am.y - 1.5 * S, a0.x, a0.y); g.closePath();
      g.fillStyle = shadeFill(Math.min(sL.x[n], sR.x[n]), Math.max(sL.x[n], sR.x[n]), a0.y, col); g.fill();
      g.strokeStyle = inkOf(col); g.lineWidth = lw; g.stroke();
      if (fine) {
        g.strokeStyle = rgba(shade(col, -0.5), 0.4); g.lineWidth = lw * 0.8;
        g.beginPath(); for (const k of [0.33, 0.66]) { g.moveTo(lerp(a0.x, a1.x, k), lerp(a0.y, a1.y, k) + 2 * S); g.quadraticCurveTo(lerp(sL.x[3], sR.x[3], k), lerp(sL.y[3], sR.y[3], k), lerp(sL.x[n], sR.x[n], k), lerp(sL.y[n], sR.y[n], k)); } g.stroke();
        g.strokeStyle = look.trim; g.lineWidth = 1.4 * S;
        g.beginPath(); g.moveTo(sL.x[n], sL.y[n]); g.quadraticCurveTo(sM.x[n], sM.y[n] + 2 * S, sR.x[n], sR.y[n]); g.stroke();
      }
    } });
  }

  // ---------- 躯干 ----------
  const torso = () => {
    const ext = [1, 2, 3, 4].map((i) => extremes(rings[i]));
    const neckE = extremes(rings[5], 0.2);
    const top = ext[3];
    const path = () => {
      g.beginPath();
      g.moveTo(top[0].x, top[0].y + 0.8 * S);
      g.quadraticCurveTo(ext[2][0].x - 0.3 * S, ext[2][0].y, (ext[2][0].x + ext[1][0].x) / 2, (ext[2][0].y + ext[1][0].y) / 2);
      g.quadraticCurveTo(ext[1][0].x, ext[1][0].y, (ext[1][0].x + ext[0][0].x) / 2, (ext[1][0].y + ext[0][0].y) / 2);
      g.lineTo(ext[0][0].x, ext[0][0].y + 2 * S);
      g.lineTo(ext[0][1].x, ext[0][1].y + 2 * S);
      g.lineTo((ext[1][1].x + ext[0][1].x) / 2, (ext[1][1].y + ext[0][1].y) / 2);
      g.quadraticCurveTo(ext[1][1].x, ext[1][1].y, (ext[2][1].x + ext[1][1].x) / 2, (ext[2][1].y + ext[1][1].y) / 2);
      g.quadraticCurveTo(ext[2][1].x + 0.3 * S, ext[2][1].y, top[1].x, top[1].y + 0.8 * S);
      g.quadraticCurveTo(top[1].x - 0.6 * S, top[1].y - 2.2 * S, neckE[1].x, neckE[1].y);
      g.lineTo(neckE[0].x, neckE[0].y);
      g.quadraticCurveTo(top[0].x + 0.6 * S, top[0].y - 2.2 * S, top[0].x, top[0].y + 0.8 * S);
      g.closePath();
    };
    const overTorso = R.over === 'banbi' || R.over === 'vest' || R.over === 'beizi';
    const baseCol = TX ? look.skin : overTorso ? R.overColor : look.robe;
    path();
    const x0 = Math.min(ext[2][0].x, top[0].x), x1 = Math.max(ext[2][1].x, top[1].x);
    g.fillStyle = shadeFill(x0, x1, ext[2][0].y, baseCol); g.fill();
    g.strokeStyle = TX ? rgba(shade(look.skin, -0.6), 0.9) : inkOf(baseCol); g.lineWidth = lw; g.stroke();
    if (E < 1.0) { belt(); return; }
    g.save(); path(); g.clip();
    if (TX) { bareChest(TX); g.restore(); belt(); return; }
    // 齐胸襦裙：裙头系在胸上
    if (look.waistline === 'chest') {
      const arc = nearArc(ringAt(16.4), 0.5);
      if (arc.length > 1) {
        g.beginPath(); g.moveTo(arc[0].x, arc[0].y);
        for (const q of arc) g.lineTo(q.x, q.y);
        g.lineTo(arc[arc.length - 1].x + 30 * S, arc[arc.length - 1].y + 60 * S); g.lineTo(arc[0].x - 30 * S, arc[0].y + 60 * S); g.closePath();
        g.fillStyle = shadeFill(x0, x1, arc[0].y, R.skirtColor); g.fill();
        g.strokeStyle = look.trim; g.lineWidth = 2.2 * S; polyline(arc); g.stroke();
      }
    }
    // 女：胸下柔影
    if (fem && fine && fv > 0.1 && look.waistline !== 'chest') {
      const a = P(surf(14.6, 0.6)), b = P(surf(14.6, -0.6)), c2 = P(surf(13.4, 0));
      g.strokeStyle = rgba(shade(baseCol, -0.5), 0.22 * fv); g.lineWidth = 1.6 * S;
      g.beginPath(); g.moveTo(a.x, a.y); g.quadraticCurveTo(c2.x, c2.y + 1.2 * S, b.x, b.y); g.stroke();
    }
    // 衣褶：腋下 → 腰
    if (fine) {
      g.strokeStyle = rgba(shade(baseCol, -0.5), 0.3); g.lineWidth = lw * 0.7;
      for (const s of [0.72, -0.72]) { const a = P(surf(19.5, s)), b = P(surf(10.5, s * 0.55)); g.beginPath(); g.moveTo(a.x, a.y); g.quadraticCurveTo((a.x + b.x) / 2 + s * 0.8 * S, (a.y + b.y) / 2, b.x, b.y); g.stroke(); }
    }
    const fa = Math.min(1, Math.max(0, fv * 2.4));
    if (fv > 0.02) {
      g.save(); g.globalAlpha *= fa;
      const yN = rings[5].y - 0.6, yW = 8.8;
      if (overTorso || R.collar === 'open') {
        // 对襟：中间露出内衫（或半臂下的长袍）
        const inner = overTorso ? look.robe : look.inner;
        const L0 = P(surf(yN, 0.34)), R0 = P(surf(yN, -0.34)), L1 = P(surf(yW, 0.2)), R1 = P(surf(yW, -0.2)), Lm = P(surf((yN + yW) / 2, 0.2)), Rm = P(surf((yN + yW) / 2, -0.2));
        g.fillStyle = inner;
        g.beginPath(); g.moveTo(L0.x, L0.y); g.quadraticCurveTo(Lm.x, Lm.y, L1.x, L1.y); g.lineTo(R1.x, R1.y); g.quadraticCurveTo(Rm.x, Rm.y, R0.x, R0.y); g.closePath(); g.fill();
        if (overTorso && R.collar === 'cross') crossCollar(0.55);
        g.strokeStyle = look.trim; g.lineWidth = 1.7 * S;
        g.beginPath(); g.moveTo(L0.x, L0.y); g.quadraticCurveTo(Lm.x, Lm.y, L1.x, L1.y); g.moveTo(R0.x, R0.y); g.quadraticCurveTo(Rm.x, Rm.y, R1.x, R1.y); g.stroke();
        if (E > 2.6 && look.pattern === 'flower') for (const q of [Lm, Rm]) dotFlower(g, q.x, q.y, 0.9 * S, shade(look.trim, 0.5));
      } else if (R.collar === 'round') {
        const arc = nearArc(ringAt(rings[5].y - 0.2), 0.9);
        if (arc.length > 1) { g.strokeStyle = inkOf(look.trim); g.lineWidth = 2.6 * S; polyline(arc); g.stroke(); g.strokeStyle = look.trim; g.lineWidth = 2.0 * S; polyline(arc); g.stroke(); }
        const a = P(surf(rings[5].y - 1.2, -0.42)), b = P(surf(rings[4].y - 1.6, -0.82));
        g.strokeStyle = rgba(shade(look.robe, -0.5), 0.5); g.lineWidth = lw * 0.8; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      } else {
        crossCollar(1);
      }
      if (R.collar === 'high') {
        const r5 = rings[5];
        const lo = nearArc({ ...r5, y: r5.y - 0.3 }, 0.6), hi = nearArc({ ...r5, y: r5.y + 1.7 }, 0.45);
        if (lo.length > 1 && hi.length > 1) {
          g.beginPath(); g.moveTo(lo[0].x, lo[0].y); for (const q of lo) g.lineTo(q.x, q.y); for (let i = hi.length - 1; i >= 0; i--) g.lineTo(hi[i].x, hi[i].y); g.closePath();
          g.fillStyle = look.trim; g.fill(); g.strokeStyle = inkOf(look.trim); g.lineWidth = lw * 0.8; g.stroke();
        }
      }
      g.restore();
    } else if (fv < -0.2) {
      g.strokeStyle = rgba(shade(baseCol, -0.5), 0.45); g.lineWidth = lw * 0.7;
      const a = P(add(sk.chest, FW, -D.td)), b = P(add(add(sk.pelvis, U, 8), FW, -D.td));
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
    // 轻甲：护心甲
    if (R.over === 'armor' && fv > -0.25) armorChest();
    g.restore();
    // 袈裟（斜披，不裁剪：可盖到下裳上）
    if (R.over === 'kasaya' && fv > -0.3) kasaya();
    belt();
  };
  const crossCollar = (alpha: number) => {
    const yN = rings[5].y - 0.4, yW = 8.6;
    const N = 9, edge: P2[] = [], innerC: P2[] = [];
    for (let i = 0; i <= N; i++) { const t = i / N; edge.push(P(surf(lerp(yN, yW, t), lerp(0.66, -0.9, Math.pow(t, 0.8))))); }
    for (let i = 0; i <= 5; i++) { const t = i / 5; innerC.push(P(surf(lerp(yN + 0.2, lerp(yN, yW, 0.32), t), lerp(-0.62, -0.02, t)))); }
    g.save(); g.globalAlpha *= alpha;
    g.lineCap = 'round';
    g.strokeStyle = look.inner; g.lineWidth = 1.9 * S; polyline(innerC); g.stroke();
    g.strokeStyle = inkOf(look.trim); g.lineWidth = 2.3 * S + lw * 1.4; polyline(edge); g.stroke();
    g.strokeStyle = look.trim; g.lineWidth = 2.3 * S; polyline(edge); g.stroke();
    if (fine) { g.strokeStyle = look.inner; g.lineWidth = 0.7 * S; const e2 = edge.slice(0, 4).map((q) => ({ x: q.x - 1.1 * S, y: q.y - 0.4 * S })); polyline(e2); g.stroke(); }
    if (E > 2.6 && look.pattern && look.pattern !== 'none') hemPattern(g, edge, 1.15 * S, look.pattern, shade(look.trim, 0.45), S);
    g.restore();
  };
  /**
   * r7 赤膊的上身（已按躯干轮廓裁剪）：锁骨、胸大肌下缘和受光面、胸骨到腹直肌的中线、三排腹肌、两侧前锯肌；
   * 胸口两道斜着的旧疤（暗边 + 发白的疤芯 + 几针缝过的横纹）；背面是脊沟和两块肩胛。线都很淡，近看才见。
   */
  const bareChest = (T: NonNullable<Look['tixiu']>) => {
    const sk2 = (k: number, a: number) => rgba(shade(look.skin, k), a);
    if (!fine) return;
    if (fv > 0.02) {
      g.save(); g.globalAlpha *= Math.min(1, fv * 2.2); g.lineCap = 'round';
      // 胸大肌：受光的一侧亮一块，下缘一道深弧
      for (const s of [1, -1]) {
        const c0 = P(surf(19.3, s * 0.42, 0.2));
        g.fillStyle = s > 0 ? 'rgba(255,236,214,0.16)' : 'rgba(90,40,24,0.10)';
        g.beginPath(); g.ellipse(c0.x, c0.y, 4.2 * S, 2.6 * S, 0, 0, TAU); g.fill();
        const a0 = P(surf(19.8, s * 0.88)), m0 = P(surf(15.6, s * 0.52)), b0 = P(surf(16.6, s * 0.05));
        g.strokeStyle = sk2(-0.55, 0.62); g.lineWidth = lw * 1.25;
        g.beginPath(); g.moveTo(a0.x, a0.y); g.quadraticCurveTo(m0.x, m0.y, b0.x, b0.y); g.stroke();
        // 锁骨
        const k0 = P(surf(22.4, s * 0.1)), k1 = P(surf(22.9, s * 0.72)), km = P(surf(23.4, s * 0.4));
        g.strokeStyle = sk2(-0.45, 0.42); g.lineWidth = lw * 0.8;
        g.beginPath(); g.moveTo(k0.x, k0.y); g.quadraticCurveTo(km.x, km.y, k1.x, k1.y); g.stroke();
        // 前锯肌：腋下三道短斜纹
        g.strokeStyle = sk2(-0.5, 0.32); g.lineWidth = lw * 0.7;
        for (let i = 0; i < 3; i++) { const y = 16.2 - i * 1.5, q0 = P(surf(y, s * 0.86)), q1 = P(surf(y - 0.9, s * 0.7)); g.beginPath(); g.moveTo(q0.x, q0.y); g.lineTo(q1.x, q1.y); g.stroke(); }
      }
      // 中线、腹直肌（三排）
      g.strokeStyle = sk2(-0.5, 0.4); g.lineWidth = lw * 0.85;
      { const a0 = P(surf(21.2, 0)), b0 = P(surf(9.4, 0)); g.beginPath(); g.moveTo(a0.x, a0.y); g.lineTo(b0.x, b0.y); g.stroke(); }
      for (const y of [14.2, 12.3, 10.5]) for (const s of [1, -1]) { const a0 = P(surf(y, s * 0.06)), b0 = P(surf(y - 0.3, s * 0.36)); g.beginPath(); g.moveTo(a0.x, a0.y); g.lineTo(b0.x, b0.y); g.stroke(); }
      for (const s of [1, -1]) { const a0 = P(surf(15.0, s * 0.38)), b0 = P(surf(9.0, s * 0.42)); g.beginPath(); g.moveTo(a0.x, a0.y); g.quadraticCurveTo(P(surf(12, s * 0.46)).x, P(surf(12, s * 0.46)).y, b0.x, b0.y); g.stroke(); }
      if (T.scar) {
        // 两道旧疤（对照立绘）：一道从左胸斜划到胸口正中，一道在右腹斜着往下
        const scars: [number, number, number, number][] = [[21.0, 0.72, 16.6, 0.05], [14.8, -0.06, 10.6, -0.62]];
        for (const [ya, sa, yb, sb] of scars) {
          const A = P(surf(ya, sa, 0.25)), Bq = P(surf(yb, sb, 0.25)), M = P(surf((ya + yb) / 2 + 0.4, (sa + sb) / 2, 0.3));
          g.strokeStyle = sk2(-0.4, 0.55); g.lineWidth = lw * 2.3;
          g.beginPath(); g.moveTo(A.x, A.y); g.quadraticCurveTo(M.x, M.y, Bq.x, Bq.y); g.stroke();
          g.strokeStyle = 'rgba(236,204,188,0.9)'; g.lineWidth = lw * 1.05;
          g.beginPath(); g.moveTo(A.x, A.y); g.quadraticCurveTo(M.x, M.y, Bq.x, Bq.y); g.stroke();
          if (E > 2.6) {
            g.strokeStyle = sk2(-0.45, 0.5); g.lineWidth = lw * 0.55;
            const dx = Bq.x - A.x, dy = Bq.y - A.y, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
            for (let i = 1; i < 5; i++) { const u = i / 5, x = (1 - u) * (1 - u) * A.x + 2 * u * (1 - u) * M.x + u * u * Bq.x, y = (1 - u) * (1 - u) * A.y + 2 * u * (1 - u) * M.y + u * u * Bq.y; g.beginPath(); g.moveTo(x - nx * 0.9 * S, y - ny * 0.9 * S); g.lineTo(x + nx * 0.9 * S, y + ny * 0.9 * S); g.stroke(); }
          }
        }
      }
      g.restore();
    } else if (fv < -0.2) {
      // 背：脊沟、两块肩胛
      g.strokeStyle = sk2(-0.5, 0.45); g.lineWidth = lw * 0.9;
      const a0 = P(add(add(sk.chest, FW, -D.td), U, 1)), b0 = P(add(add(sk.pelvis, U, 8), FW, -D.td));
      g.beginPath(); g.moveTo(a0.x, a0.y); g.lineTo(b0.x, b0.y); g.stroke();
      for (const s of [1, -1]) {
        const c0 = P(add(add(add(sk.chest, LT, s * D.sw * 0.5), U, -2.5), FW, -D.td - 0.4));
        g.beginPath(); g.ellipse(c0.x, c0.y, 3.0 * S, 2.2 * S, s * 0.5, 0.3, 2.6); g.stroke();
      }
    }
  };
  const armorChest = () => {
    const col = R.overColor;
    const pts = [P(surf(21.0, 0.72, 0.5)), P(surf(21.6, 0, 0.6)), P(surf(21.0, -0.72, 0.5)), P(surf(13.0, -0.82, 0.7)), P(surf(11.2, 0, 0.9)), P(surf(13.0, 0.82, 0.7))];
    smoothPoly(pts);
    g.fillStyle = shadeFill(pts[0].x, pts[2].x, pts[0].y, col); g.fill();
    g.strokeStyle = inkOf(col); g.lineWidth = lw; g.stroke();
    if (E > 2.2) {
      g.save(); smoothPoly(pts); g.clip();
      g.strokeStyle = rgba(shade(col, -0.45), 0.6); g.lineWidth = lw * 0.7;
      for (let y = 19.6; y > 11; y -= 1.7) { const row = [-0.85, -0.42, 0, 0.42, 0.85].map((s) => P(surf(y, s, 0.7))); g.beginPath(); for (let i = 0; i < row.length - 1; i++) { const a = row[i], b = row[i + 1]; g.moveTo(a.x, a.y); g.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.9 * S, b.x, b.y); } g.stroke(); }
      const hl = P(surf(18, 0.35, 0.8)); g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(hl.x, hl.y, 2.6 * S, 1.4 * S, -0.4, 0, TAU); g.fill();
      g.restore();
      const c = P(surf(16.5, 0, 1.0)); g.fillStyle = '#c8a050'; g.beginPath(); g.arc(c.x, c.y, 1.3 * S, 0, TAU); g.fill(); g.strokeStyle = inkOf('#c8a050'); g.lineWidth = lw * 0.6; g.stroke();
    }
  };
  const kasaya = () => {
    const col = R.overColor;
    const N = 8, Lp: P2[] = [], Rp: P2[] = [];
    for (let i = 0; i <= N; i++) { const t = i / N, y = lerp(21.4, 2.5, t), s = lerp(0.78, -0.95, t); Lp.push(P(surf(y + 2.4, Math.min(0.98, s + 0.1), 0.6))); Rp.push(P(surf(y - 2.4, Math.max(-0.98, s - 0.12), 0.6))); }
    const all = [...Lp, ...Rp.reverse()];
    g.save(); g.globalAlpha *= Math.min(1, Math.max(0.2, fv * 2 + 0.4));
    g.beginPath(); all.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath();
    g.fillStyle = shadeFill(all[0].x, all[N].x, all[0].y, col); g.fill(); g.strokeStyle = inkOf(col); g.lineWidth = lw; g.stroke();
    if (E > 2) {
      g.save(); g.clip();
      g.strokeStyle = rgba(shade(col, 0.4), 0.55); g.lineWidth = lw * 0.8;
      for (let i = 1; i < N; i++) { const a = Lp[i], b = all[all.length - 1 - i]; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
      g.restore();
      const rc = Lp[1]; g.strokeStyle = '#d8b860'; g.lineWidth = 0.9 * S; g.beginPath(); g.arc(rc.x, rc.y + 1 * S, 1.3 * S, 0, TAU); g.stroke();
    }
    g.restore();
  };
  const belt = () => {
    if (look.waistline === 'chest') return;
    const r0 = ringAt(7.0), r1 = ringAt(9.6);
    const lo = nearArc(r0, 0.85), hi = nearArc(r1, 0.75);
    if (lo.length < 2 || hi.length < 2) return;
    g.beginPath(); g.moveTo(lo[0].x, lo[0].y); polyCont(lo); g.lineTo(hi[hi.length - 1].x, hi[hi.length - 1].y);
    for (let i = hi.length - 1; i >= 0; i--) g.lineTo(hi[i].x, hi[i].y);
    g.closePath();
    g.fillStyle = look.belt; g.fill(); g.strokeStyle = inkOf(look.belt); g.lineWidth = lw * 0.85; g.stroke();
    if (fine) { g.strokeStyle = rgba(shade(look.belt, 0.45), 0.55); g.lineWidth = 0.6 * S; polyline(hi.map((q) => ({ x: q.x, y: q.y + 0.6 * S }))); g.stroke(); }
    // 带扣 / 结
    if (fv > 0.1) {
      const k = P(surf(8.3, -0.12, 1.0));
      g.fillStyle = look.trim === look.belt ? shade(look.belt, 0.4) : look.trim;
      g.beginPath(); g.ellipse(k.x, k.y, 1.25 * S, 1.05 * S, 0, 0, TAU); g.fill(); g.strokeStyle = inkOf(look.belt); g.lineWidth = lw * 0.6; g.stroke();
    }
  };
  const polyCont = (pts: P2[]) => { for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y); };
  parts.push({ z: torsoZ, f: torso });

  // 齐胸襦裙的系带 / 腰带垂绦 / 腰间配饰
  {
    if (look.waistline === 'chest') {
      const K = P(surf(16.2, 0.05, 1.0));
      const s1 = strand('tie1', 6, 3.4, K.x, K.y, 2.4, 0.9), s2 = strand('tie2', 5, 3.4, K.x + 0.8 * S, K.y, 2.4, 0.9);
      parts.push({ z: K.z + 0.4, f: () => {
        if (fv < -0.1) return;
        ribbon(s2, 0.9, 0.6, look.belt); ribbon(s1, 1.0, 0.7, look.belt);
        g.fillStyle = look.belt; g.beginPath(); g.ellipse(K.x - 1.2 * S, K.y, 1.5 * S, 0.9 * S, 0.5, 0, TAU); g.ellipse(K.x + 1.4 * S, K.y, 1.5 * S, 0.9 * S, -0.5, 0, TAU); g.fill();
      } });
    }
    const kn3 = surf(8.2, -0.25, 1.2), K = P(kn3);
    if (look.sash && look.waistline !== 'chest') {
      const s1 = strand('sash1', 4, 3.6, K.x, K.y, 2.6), s2 = strand('sash2', 3, 3.6, K.x + 1.2 * S, K.y, 2.6);
      parts.push({ z: K.z + 0.2, f: () => { ribbon(s2, 1.8, 1.4, look.sash!); ribbon(s1, 2.0, 1.6, look.sash!); } });
    }
    if (TX?.tied) {
      // r7：道袍的两只袖子在腰前打个结垂下来（随动作甩）
      const Kt = P(surf(8.6, 0.2, 1.4)), col = TX.tied;
      const s1 = strand('tiedA', 5, 4.6, Kt.x, Kt.y, 3.2, 1.7), s2 = strand('tiedB', 5, 3.7, Kt.x + 1.4 * S, Kt.y + 0.4 * S, 3.2, 1.7);   // 布厚、往下坠：别被风吹成横着的一条（远看像多了一条胳膊）
      parts.push({ z: Kt.z + 0.25, f: () => {
        if (fv < -0.25) return;
        ribbon(s2, 2.6, 1.7, shade(col, -0.08)); ribbon(s1, 3.0, 2.0, col);
        g.fillStyle = shade(col, 0.06); g.beginPath(); g.ellipse(Kt.x + 0.6 * S, Kt.y, 2.2 * S, 1.6 * S, 0.3, 0, TAU); g.fill();
        g.strokeStyle = inkOf(col); g.lineWidth = lw * 0.8; g.stroke();
      } });
    }
    if (look.waist && look.waist !== 'none' && !(TX && st.action === 'drink')) {
      const W = P(surf(7.6, 0.72, 1.2)), big = TX ? 1.5 : 1;
      const pend = strand('pend', 3, TX ? 4.2 : 3, W.x, W.y, TX ? 1.3 : 1.8);
      parts.push({ z: W.z + 0.3, f: () => {
        const ex = pend.x[pend.n - 1], ey = pend.y[pend.n - 1];
        if (TX && look.waist === 'gourd') { gourdAt(W.x, W.y, ex, ey, big); return; }
        g.strokeStyle = 'rgba(150,40,34,0.9)'; g.lineWidth = 0.7 * S;
        g.beginPath(); g.moveTo(W.x, W.y); g.lineTo(ex, ey); g.stroke();
        if (look.waist === 'jade') {
          g.fillStyle = '#a8d8bc'; g.beginPath(); g.arc(ex, ey + 1.8 * S, 1.9 * S, 0, TAU); g.fill(); g.strokeStyle = inkOf('#a8d8bc'); g.lineWidth = lw * 0.6; g.stroke();
          if (fine) { g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(ex - 0.6 * S, ey + 1.2 * S, 0.5 * S, 0, TAU); g.fill(); g.strokeStyle = 'rgba(190,40,40,0.85)'; g.lineWidth = 0.5 * S; g.beginPath(); for (const o of [-0.6, 0, 0.6]) { g.moveTo(ex + o * S, ey + 3.6 * S); g.lineTo(ex + o * 1.3 * S, ey + 6.2 * S); } g.stroke(); }
        } else if (look.waist === 'gourd') { g.fillStyle = '#c08a3a'; g.beginPath(); g.arc(ex, ey + 1.5 * S, 1.6 * S, 0, TAU); g.arc(ex, ey + 4.6 * S, 2.4 * S, 0, TAU); g.fill(); g.strokeStyle = inkOf('#c08a3a'); g.lineWidth = lw * 0.6; g.stroke(); }
        else { g.fillStyle = '#6a5038'; g.beginPath(); g.ellipse(ex, ey + 2.4 * S, 2.4 * S, 2.8 * S, 0, 0, TAU); g.fill(); g.strokeStyle = inkOf('#6a5038'); g.lineWidth = lw * 0.6; g.stroke(); if (fine) { g.strokeStyle = '#c8a050'; g.lineWidth = 0.5 * S; g.beginPath(); g.moveTo(ex - 1.8 * S, ey + 1 * S); g.lineTo(ex + 1.8 * S, ey + 1 * S); g.stroke(); } }
      } });
    }
  }

  // ---------- 近战兵器（拿在手里 / 斜背在背后）----------
  const WP = look.weapon ? weaponPlace(sk, pose, look) : null;
  // ---------- 背后配饰（背着兵器时不再画那口装饰用的背剑）----------
  if (look.back && look.back !== 'none' && !(look.back === 'sword' && WP)) {
    const bz = P(add(add(sk.chest, U, -4), FW, -D.td - 1.5)).z;
    const bp = (x: number, y: number, z: number) => P(add(add(add(sk.chest, LT, x), U, y), FW, z));
    parts.push({ z: bz, f: () => {
      if (look.back === 'sword') {
        const a = bp(-7, 9, -D.td - 1.2), b = bp(8, -19, -D.td - 1);
        tube(a, b, 1.3 * S, 1.1 * S, '#3a2a20');
        const h = bp(-9, 13, -D.td - 1.2);
        g.strokeStyle = '#b89a50'; g.lineWidth = 2.2 * S; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(h.x, h.y); g.stroke();
        g.strokeStyle = '#d8c070'; g.lineWidth = 1.6 * S; const gx = bp(-7.6, 10.2, -D.td - 1.2);
        g.beginPath(); g.moveTo(gx.x - 2.4 * S, gx.y + 1.2 * S); g.lineTo(gx.x + 2.4 * S, gx.y - 1.2 * S); g.stroke();
      } else if (look.back === 'basket') {
        const c = bp(0, -6, -D.td - 4), w = 7 * S * (0.45 + 0.55 * Math.abs(cy));
        g.fillStyle = '#b8935a'; g.beginPath(); g.moveTo(c.x - w, c.y - 9 * S); g.lineTo(c.x + w, c.y - 9 * S); g.lineTo(c.x + w * 0.8, c.y + 9 * S); g.lineTo(c.x - w * 0.8, c.y + 9 * S); g.closePath(); g.fill();
        g.strokeStyle = inkOf('#b8935a'); g.lineWidth = lw * 0.7; g.stroke();
        g.strokeStyle = 'rgba(90,64,30,0.6)'; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(c.x + i * w / 3, c.y - 9 * S); g.lineTo(c.x + i * w / 3.6, c.y + 9 * S); g.stroke(); }
        g.fillStyle = '#5f8a4a'; g.beginPath(); g.ellipse(c.x, c.y - 9.5 * S, w * 0.9, 2.5 * S, 0, 0, TAU); g.fill();
      } else if (look.back === 'box') {
        const c = bp(0, -4, -D.td - 3.5), w = 6 * S * (0.5 + 0.5 * Math.abs(cy));
        g.fillStyle = '#6a4630'; g.fillRect(c.x - w, c.y - 10 * S, w * 2, 18 * S); g.strokeStyle = inkOf('#6a4630'); g.lineWidth = lw * 0.7; g.strokeRect(c.x - w, c.y - 10 * S, w * 2, 18 * S);
        g.fillStyle = '#c8a860'; g.fillRect(c.x - w, c.y - 3 * S, w * 2, 1.4 * S);
      }
    } });
  }

  // ---------- 手臂、袖、手 ----------
  const hd = { g, P, cam, S, E, skin: look.skin, lw };
  const hk = D.handK;
  const fxCol = look.swordColor || '#7ff0c0';
  const headZ = hed.z;
  const arm = (side: 1 | -1) => {
    const hk = D.handK * ((side > 0 ? pose.lHandS : pose.rHandS) ?? 1);   // r8-p1：出拳那一两帧拳头放大
    const sh = side > 0 ? sk.lSh : sk.rSh, el = side > 0 ? sk.lEl : sk.rEl, wr = side > 0 ? sk.lWr : sk.rWr, H = side > 0 ? sk.lH : sk.rH;
    const curl = st.hands[side > 0 ? 0 : 1];
    const S0 = P(sh), E2 = P(el), W2 = P(wr);
    const fdir = nrm(sub(wr, el));
    const facing = cam(fdir);                       // 前臂指向镜头（>0 袖口朝向我们）
    let z = (E2.z + W2.z) / 2 + 0.6;
    const fxv = side > 0 ? pose.lFx : pose.rFx;
    const wide = look.sleeve === 'wide', cuffed = look.sleeve === 'cuffed';
    const upCol = TX ? look.skin : R.over === 'banbi' || R.over === 'beizi' ? R.overColor : look.robe;
    const rUp = (fem ? 2.75 : 3.25) * (0.86 + 0.14 * B.heft) * (TX ? 1.16 : 1);
    // r7 缠拳布：腕上垂出的两条布条（随出拳、奔跑、被打飞甩开）
    const tails = TX ? [strand('wrapT' + side, 5, 3.6, W2.x, W2.y, 1.8, 0.75), strand('wrapU' + side, 4, 2.4, W2.x + side * 0.6 * S, W2.y, 1.9, 0.8)] : null;
    // 广袖：袖底垂布挂在肘下，随重力与惯性摆动
    const dx = W2.x - E2.x, dy = W2.y - E2.y, d = Math.hypot(dx, dy) || 1;
    let nx = -dy / d, ny = dx / d;
    const outward = (E2.x - che.x) * nx + (E2.y - che.y) * ny;
    if (ny < -0.35 || (Math.abs(ny) <= 0.35 && outward < 0)) { nx = -nx; ny = -ny; }
    const r0 = rUp * 1.05 * S;
    const hang = wide ? strand('sleeve' + side, 5, 3.0 + 1.2 * R.sleeveK, E2.x + nx * r0, E2.y + ny * r0, 2.0, 1) : null;
    // 袖口圆（垂直于前臂）
    let u1 = crs(fdir, v(0, 1, 0)); if (len3(u1) < 0.2) u1 = crs(fdir, v(1, 0, 0)); u1 = nrm(u1);
    const u2 = crs(fdir, u1);
    const rc = (wide ? 3.5 + 0.7 * R.sleeveK : 2.6) * (fem ? 0.92 : 1);
    const cuffC = add(wr, fdir, wide ? 0.4 : 0.1);
    const cuff = (r: number) => { const o: P2[] = []; for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; o.push(P(add(add(cuffC, u1, Math.cos(a) * r), u2, Math.sin(a) * r))); } return o; };
    // 举到脸前的手要盖过头
    if (W2.z > headZ + 1.5 && wr.y > sk.chest.y - 6) z = torsoZ + 3.5;
    return {
      z, f: () => {
        const hand = () => {
          // 出手残影（施法 / 受击时手快速划过）
          const rel = { x: 0, y: 0 };
          const hc = P(add(wr, H.a, PALM_L * 0.6 * hk));
          rel.x = hc.x - bx; rel.y = hc.y - by;
          const i0 = side > 0 ? 0 : 2;
          if (!opts.ghost && physDt > 0) {
            const px = st.hp[i0], py = st.hp[i0 + 1];
            if ((st.action === 'cast' || st.action === 'hit' || st.action === 'dodge') && !isNaN(px)) {
              const vx = (rel.x - px) / physDt, vy = (rel.y - py) / physDt, sp = Math.hypot(vx, vy);
              if (sp > 140 * S) {
                const k = Math.min(1, (sp - 140 * S) / (500 * S));
                g.save(); g.lineCap = 'round';
                g.strokeStyle = rgba(fxv > 0.05 ? fxCol : '#fff8ec', 0.32 * k); g.lineWidth = 4.2 * hk * S;
                g.beginPath(); g.moveTo(bx + px, by + py); g.lineTo(hc.x, hc.y); g.stroke();
                g.strokeStyle = rgba('#ffffff', 0.5 * k); g.lineWidth = 1.4 * hk * S;
                g.beginPath(); g.moveTo(bx + (px + rel.x) / 2, by + (py + rel.y) / 2); g.lineTo(hc.x, hc.y); g.stroke();
                g.restore();
              }
            }
            st.hp[i0] = rel.x; st.hp[i0 + 1] = rel.y;
          }
          // 手持之物：杖在手后，扇在手前
          if (side < 0 && look.hand === 'staff' && !WP?.held) {
            const c = add(wr, H.a, PALM_L * 0.55 * hk);
            const tdir = H.t.y >= 0 ? H.t : { x: -H.t.x, y: -H.t.y, z: -H.t.z };
            const down = Math.max(10, c.y / Math.max(0.3, tdir.y));
            const bot = P(add(c, tdir, -down)), topp = P(add(c, tdir, 24));
            tube(bot, topp, 0.62 * S, 0.8 * S, '#6a4a2a');
            g.fillStyle = '#b07a32'; g.beginPath(); g.arc(topp.x, topp.y - 1.1 * S, 1.05 * S, 0, TAU); g.arc(topp.x, topp.y + 0.9 * S, 1.45 * S, 0, TAU); g.fill(); g.strokeStyle = inkOf('#b07a32'); g.lineWidth = lw * 0.6; g.stroke();
            g.strokeStyle = 'rgba(170,40,34,0.9)'; g.lineWidth = 0.5 * S; g.beginPath(); g.moveTo(topp.x, topp.y); g.lineTo(topp.x + 1.2 * S, topp.y + 5 * S); g.stroke();
          }
          const geo = drawHand(hd, H, curl, hk);
          if (TX) {
            // r7：拳头上也缠着布（掌心到指根一圈），喝酒时右手里是葫芦（嘴朝上凑到嘴边，身子朝外斜上去）
            const pc = P(add(wr, H.a, PALM_L * 0.5 * hk)), w0 = P(wr);
            tube(w0, pc, 2.55 * hk * S, 2.35 * hk * S, TX.wrap);
            if (side < 0 && st.action === 'drink') {
              const tip = P(add(add(wr, H.a, PALM_L * 0.55 * hk), H.t, 2.6 * hk)), mouth = { x: hed.x, y: hed.y + 2.2 * S };
              let ux = tip.x - mouth.x, uy = tip.y - mouth.y; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
              gourdAt(null, 0, mouth.x + (tip.x - mouth.x) * 0.3, mouth.y + (tip.y - mouth.y) * 0.3, 1.35, ux * 0.7, uy * 0.4 - 0.9);
            }
          }
          if (side < 0 && look.hand === 'fan' && !WP?.held) fan(add(wr, H.a, PALM_L * 0.8 * hk), H);
          // 劲气：指尖灵光 + 劲风
          if (fxv > 0.04) {
            const tp = P(geo.tip), wp = P(wr);
            const r = (4 + 7 * fxv) * S;
            g.save(); g.globalCompositeOperation = 'lighter';
            const gr = g.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, r);
            gr.addColorStop(0, rgba('#ffffff', Math.min(1, 0.8 * fxv))); gr.addColorStop(0.35, rgba(fxCol, 0.55 * fxv)); gr.addColorStop(1, rgba(fxCol, 0));
            g.fillStyle = gr; g.beginPath(); g.arc(tp.x, tp.y, r, 0, TAU); g.fill();
            const ang = Math.atan2(tp.y - wp.y, tp.x - wp.x);
            g.strokeStyle = rgba(fxCol, 0.7 * fxv); g.lineWidth = 0.8 * S;
            for (let i = -1; i <= 1; i++) {
              const a2 = ang + i * 0.5, r1 = r * (0.7 + 0.15 * Math.sin(st.t * 30 + i)), r2 = r * (1.5 + 0.4 * fxv);
              g.beginPath(); g.moveTo(tp.x + Math.cos(a2) * r1, tp.y + Math.sin(a2) * r1); g.lineTo(tp.x + Math.cos(a2) * r2, tp.y + Math.sin(a2) * r2); g.stroke();
            }
            g.restore();
          }
        };
        // 上臂
        if (tails) for (const s of tails) ribbon(s, 1.15, 0.45, TX!.wrap, true);
        tube(S0, E2, rUp * S, (wide ? rUp * 1.12 : rUp * 0.85) * S, upCol);
        if (TX && fine) {
          // 二头肌 / 三角肌的轮廓：外侧一道鼓起的暗线、肩头一块受光
          const m = P(lerpV(sh, el, 0.5)), a0 = P(lerpV(sh, el, 0.2)), b0 = P(lerpV(sh, el, 0.82));
          const bul = rUp * 0.62 * S, ud = Math.hypot(E2.x - S0.x, E2.y - S0.y) || 1;
          let px = -(E2.y - S0.y) / ud, py = (E2.x - S0.x) / ud;
          if ((m.x - che.x) * px + (m.y - che.y) * py < 0) { px = -px; py = -py; }
          g.strokeStyle = rgba(shade(look.skin, -0.55), 0.5); g.lineWidth = lw * 0.9;
          g.beginPath(); g.moveTo(a0.x + px * bul * 0.6, a0.y + py * bul * 0.6); g.quadraticCurveTo(m.x + px * bul * 1.25, m.y + py * bul * 1.25, b0.x + px * bul * 0.5, b0.y + py * bul * 0.5); g.stroke();
          g.fillStyle = 'rgba(255,236,214,0.15)'; g.beginPath(); g.ellipse(a0.x - px * bul * 0.2, a0.y - py * bul * 0.2, rUp * 0.75 * S, rUp * 0.5 * S, Math.atan2(E2.y - S0.y, E2.x - S0.x), 0, TAU); g.fill();
        }
        if (R.over === 'banbi') {
          // 半臂袖口：肘上翻出的短袖镶边
          const m = P(lerpV(sh, el, 0.78));
          g.strokeStyle = look.trim; g.lineWidth = 1.6 * S;
          g.beginPath(); g.moveTo(m.x + nx * rUp * 1.15 * S, m.y + ny * rUp * 1.15 * S); g.lineTo(m.x - nx * rUp * 1.15 * S, m.y - ny * rUp * 1.15 * S); g.stroke();
        }
        if (R.over === 'armor') {
          // 肩吞：三片叠甲
          const col = R.overColor;
          for (let i = 2; i >= 0; i--) {
            const c = P(add(lerpV(sh, el, 0.08 + i * 0.16), U, 1.2 - i * 0.3));
            g.fillStyle = shade(col, -i * 0.06); g.beginPath(); g.ellipse(c.x, c.y, (rUp + 1.6 - i * 0.3) * S, (2.6 - i * 0.2) * S, Math.atan2(E2.y - S0.y, E2.x - S0.x) + Math.PI / 2, 0, TAU); g.fill();
            g.strokeStyle = inkOf(col); g.lineWidth = lw * 0.7; g.stroke();
          }
        }
        const handFirst = facing < -0.25;            // 手在袖后（指向远离镜头）
        if (handFirst) hand();
        if (wide && hang) {
          const pts: Pt[] = [];
          for (const q of cuff(rc)) pts.push(q);
          for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; pts.push(P(add(add(el, u1, Math.cos(a) * rUp * 1.02), u2, Math.sin(a) * rUp * 1.02))); }
          for (let i = 1; i < hang.n; i++) pts.push({ x: hang.x[i], y: hang.y[i] });
          const hull = convexHull(pts);
          smoothPoly(hull);
          let x0 = 1e9, x1 = -1e9, y0 = 1e9;
          for (const q of hull) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); }
          const sc = look.robe;
          g.fillStyle = shadeFill(x0, x1, y0, shade(sc, -0.03)); g.fill();
          g.strokeStyle = inkOf(sc); g.lineWidth = lw; g.stroke();
          if (fine) {
            g.save(); smoothPoly(hull); g.clip();
            g.strokeStyle = rgba(shade(sc, -0.5), 0.38); g.lineWidth = lw * 0.75;
            const e = hang.n - 1;
            g.beginPath(); g.moveTo(E2.x, E2.y); g.quadraticCurveTo((E2.x + hang.x[e]) / 2 + nx * 1.5 * S, (E2.y + hang.y[e]) / 2, hang.x[e], hang.y[e]);
            g.moveTo((E2.x + W2.x) / 2, (E2.y + W2.y) / 2); g.quadraticCurveTo((W2.x + hang.x[e]) / 2, (W2.y + hang.y[e]) / 2 + 1 * S, (hang.x[e] + W2.x) / 2 + nx * 2 * S, hang.y[e] - 1 * S);
            g.stroke();
            g.restore();
          }
          // 袖口：朝向镜头时看得见里子
          const cf = cuff(rc * 0.98);
          if (facing > 0.3) {
            const ci = cuff(rc * 0.72);
            g.beginPath(); ci.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath();
            g.fillStyle = rgba(shade(look.robe, -0.45), Math.min(0.55, (facing - 0.3) * 1.6)); g.fill();
          }
          g.strokeStyle = look.trim; g.lineWidth = 1.7 * S;
          g.beginPath(); cf.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath(); g.stroke();
        } else if (TX) {
          // r7 前臂：粗壮的小臂，从小臂中段往下一圈圈缠着拳布（斜着的缠绕纹）
          tube(E2, W2, 3.55 * S, 2.95 * S, look.skin);
          const m = P(lerpV(el, wr, 0.3)), wc = TX.wrap;
          tube(m, W2, 3.35 * S, 3.0 * S, wc);
          if (E > 2.0) {
            g.strokeStyle = rgba(shade(wc, -0.45), 0.55); g.lineWidth = 0.55 * S; g.beginPath();
            for (const k of [0.12, 0.34, 0.56, 0.78, 0.96]) { const q = { x: m.x + (W2.x - m.x) * k, y: m.y + (W2.y - m.y) * k }, q2 = { x: m.x + (W2.x - m.x) * Math.min(1, k + 0.14), y: m.y + (W2.y - m.y) * Math.min(1, k + 0.14) }; g.moveTo(q.x + nx * 3.1 * S, q.y + ny * 3.1 * S); g.lineTo(q2.x - nx * 3.1 * S, q2.y - ny * 3.1 * S); }
            g.stroke();
          }
        } else {
          tube(E2, W2, (cuffed ? 3.1 : 3.2) * S * (fem ? 0.9 : 1), 2.6 * S * (fem ? 0.9 : 1), look.robe);
          if (cuffed) {
            const m = P(lerpV(el, wr, 0.4));
            tube(m, W2, 2.95 * S * (fem ? 0.9 : 1), 2.7 * S * (fem ? 0.9 : 1), R.cuff);
            if (E > 2.4) { g.strokeStyle = rgba(shade(R.cuff, 0.4), 0.6); g.lineWidth = 0.5 * S; g.beginPath(); for (const k of [0.3, 0.6]) { const q = { x: m.x + (W2.x - m.x) * k, y: m.y + (W2.y - m.y) * k }; g.moveTo(q.x + nx * 2.7 * S, q.y + ny * 2.7 * S); g.lineTo(q.x - nx * 2.7 * S, q.y - ny * 2.7 * S); } g.stroke(); }
          } else {
            g.strokeStyle = look.trim; g.lineWidth = 1.4 * S;
            g.beginPath(); g.moveTo(W2.x + nx * 2.7 * S, W2.y + ny * 2.7 * S); g.lineTo(W2.x - nx * 2.7 * S, W2.y - ny * 2.7 * S); g.stroke();
          }
        }
        if (!handFirst) hand();
      },
    };
  };
  const fan = (pivot: V3, H: HandFrame) => {
    const Rf = 9.5 * hk, pts: P2[] = [], inner: P2[] = [];
    for (let i = 0; i <= 10; i++) {
      const th = -1.0 + (i / 10) * 2.0;
      const dir = add({ x: H.a.x * Math.cos(th), y: H.a.y * Math.cos(th), z: H.a.z * Math.cos(th) }, H.t, Math.sin(th));
      pts.push(P(add(pivot, dir, Rf))); inner.push(P(add(pivot, dir, Rf * 0.42)));
    }
    const pv = P(pivot);
    g.beginPath(); g.moveTo(inner[0].x, inner[0].y); for (const q of pts) g.lineTo(q.x, q.y); for (let i = inner.length - 1; i >= 0; i--) g.lineTo(inner[i].x, inner[i].y); g.closePath();
    g.fillStyle = '#f2ead8'; g.fill(); g.strokeStyle = inkOf('#e8dcc0'); g.lineWidth = lw * 0.7; g.stroke();
    g.strokeStyle = 'rgba(120,90,60,0.6)'; g.lineWidth = Math.max(0.3, 0.3 * S);
    g.beginPath(); for (let i = 0; i <= 10; i += 2) { g.moveTo(pv.x, pv.y); g.lineTo(pts[i].x, pts[i].y); } g.stroke();
    if (E > 2.5) { g.strokeStyle = 'rgba(60,70,60,0.5)'; g.lineWidth = 0.5 * S; g.beginPath(); g.moveTo(lerp(inner[2].x, pts[2].x, 0.7), lerp(inner[2].y, pts[2].y, 0.7)); g.quadraticCurveTo(lerp(inner[5].x, pts[5].x, 0.45), lerp(inner[5].y, pts[5].y, 0.45), lerp(inner[8].x, pts[8].x, 0.75), lerp(inner[8].y, pts[8].y, 0.75)); g.stroke(); }
  };
  const armL = arm(1), armR = arm(-1);
  const armZ = (z: number) => (z > torsoZ + 3 ? z : z < torsoZ - 2.2 ? Math.min(z, torsoZ - 2.5) : torsoZ + 0.4 + (z - torsoZ) * 0.01);
  for (const a of [armL, armR]) parts.push({ z: armZ(a.z), f: a.f });
  // 兵器：沿轴切成几段，各按自己的远近排序（刃伸到身后就被身子挡住，伸到身前就盖过身子）；
  // 握在手里那一小段排在那只手的手臂之前一点，手指攥着杆盖在上面
  if (WP) {
    const Pw = WP.P, sp = weaponSpan(Pw.form);
    const o2 = P(WP.origin), a1 = P(add(WP.origin, WP.dir, 1)), e1 = P(add(WP.origin, WP.edge, 1));
    const axis: WeaponAxis = { ox: o2.x, oy: o2.y, ax: a1.x - o2.x, ay: a1.y - o2.y, ex: e1.x - o2.x, ey: e1.y - o2.y, S };
    const piece = (from: number, to: number) => () => paintWeapon(g, Pw, axis, { sheathed: !WP.held, t: st.t, lw: lw * 0.85, fine, from, to, face: 0.6 });
    if (!WP.held) parts.push({ z: P(add(add(sk.chest, U, -4), FW, -D.td - 1.5)).z - 0.05, f: piece(-1e9, 1e9) });
    else {
      const zAt = (u: number) => o2.z + (a1.z - o2.z) * u;
      const uh = pose.wSlide, uo = WP.off ? uh - Pw.S.gap : NaN;
      const wins: [number, number, number][] = [[uh - 2.4, uh + 2.4, armZ(armR.z) - 0.002]];
      if (WP.off) wins.push([uo - 2.4, uo + 2.4, armZ(armL.z) - 0.002]);
      wins.sort((x, y) => x[0] - y[0]);
      let u = sp.uMin - 0.5;
      const push = (u0: number, u1: number, z?: number) => {
        if (u1 <= u0 + 1e-3) return;
        if (z !== undefined) { parts.push({ z, f: piece(u0, u1) }); return; }
        const n = Math.max(1, Math.ceil((u1 - u0) / 26));
        for (let i = 0; i < n; i++) { const a = u0 + (u1 - u0) * i / n, b = u0 + (u1 - u0) * (i + 1) / n; parts.push({ z: zAt((a + b) / 2), f: piece(a, b) }); }
      };
      for (const [w0, w1, z] of wins) { const s0 = Math.max(u, w0); push(u, s0); push(s0, Math.max(s0, w1), z); u = Math.max(u, w1); }
      push(u, sp.uTip + 2);
    }
  }

  // 披帛：从背后绕过双臂，自肘弯垂落，随风飘曳
  if (look.shawl) {
    const lE = P(add(sk.lEl, v(1.5, -1, -1))), rE = P(add(sk.rEl, v(-1.5, -1, -1)));
    const s1 = strand('shawlL', 9, 4.0, lE.x, lE.y, 1.4, 0.72), s2 = strand('shawlR', 9, 4.0, rE.x, rE.y, 1.4, 0.72);
    const lB = P(add(sk.lSh, add(U, FW, -D.td - 0.5), -2.4)), rB = P(add(sk.rSh, add(U, FW, -D.td - 0.5), -2.4));
    const mid = P(add(add(sk.chest, U, -11), FW, -D.td - 2));
    const zb = P(add(sk.chest, FW, -D.td - 2)).z;
    const col = rgba(look.shawl, 0.78), edge = rgba(shade(look.shawl, -0.35), 0.6);
    parts.push({ z: zb, f: () => {
      g.strokeStyle = col; g.lineWidth = 2.4 * S;
      g.beginPath(); g.moveTo(lE.x, lE.y); g.quadraticCurveTo(lB.x, lB.y, mid.x, mid.y); g.quadraticCurveTo(rB.x, rB.y, rE.x, rE.y); g.stroke();
    } });
    const flow = (s: Strand, ph: number) => {
      const n = s.n; const L: [number, number][] = [], Rr: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
        const dx = s.x[i1] - s.x[i0], dy = s.y[i1] - s.y[i0], d = Math.hypot(dx, dy) || 1;
        const t = i / (n - 1);
        const wob = Math.sin(t * 5 + st.t * 2.2 + ph) * 1.6 * S * t;
        const w = (1.6 - 0.5 * t) * S * (0.6 + 0.4 * Math.abs(Math.cos(t * 4 + st.t * 1.7 + ph)));
        const cx = s.x[i] - dy / d * wob, cyy = s.y[i] + dx / d * wob;
        L.push([cx - dy / d * w, cyy + dx / d * w]); Rr.push([cx + dy / d * w, cyy - dx / d * w]);
      }
      g.beginPath(); g.moveTo(L[0][0], L[0][1]);
      for (let i = 1; i < n; i++) g.quadraticCurveTo(L[i - 1][0], L[i - 1][1], (L[i - 1][0] + L[i][0]) / 2, (L[i - 1][1] + L[i][1]) / 2);
      g.lineTo(L[n - 1][0], L[n - 1][1]); g.lineTo(Rr[n - 1][0], Rr[n - 1][1]);
      for (let i = n - 2; i >= 0; i--) g.quadraticCurveTo(Rr[i + 1][0], Rr[i + 1][1], (Rr[i + 1][0] + Rr[i][0]) / 2, (Rr[i + 1][1] + Rr[i][1]) / 2);
      g.closePath(); g.fillStyle = col; g.fill(); g.strokeStyle = edge; g.lineWidth = Math.max(0.3, 0.3 * S); g.stroke();
    };
    const zl = (P(sk.lEl).z + P(sk.lWr).z) / 2 + 0.8, zr = (P(sk.rEl).z + P(sk.rWr).z) / 2 + 0.8;
    parts.push({ z: zl, f: () => flow(s1, 0) });
    parts.push({ z: zr, f: () => flow(s2, 1.7) });
  }

  // ---------- 头部（3D 头型 + 发际线投影 + 五官）----------
  const hkH = D.hk * (fem ? 0.95 : 1);
  const Hd = R.head;
  const hyaw = pose.headYaw, chy = Math.cos(hyaw), shy = Math.sin(hyaw);
  const hp = (pose.headPitch + B.stoop * -0.15) * 0.8, chp = Math.cos(hp), shp = Math.sin(hp);
  const Yh = yaw + hyaw, cY = Math.cos(Yh), sY = Math.sin(Yh);
  const HP = (x: number, y: number, z: number): P2 => {
    x *= hkH; y *= hkH; z *= hkH;
    const y2 = y * chp - z * shp, z2 = y * shp + z * chp;
    return P(add(sk.head, v(x * chy + z2 * shy, y2, -x * shy + z2 * chy)));
  };
  const visN = (nx: number, ny: number, nz: number) => {
    const l = Math.hypot(nx, ny, nz) || 1;
    const ny2 = ny * chp - nz * shp, nz2 = ny * shp + nz * chp;
    const X = nx * chy + nz2 * shy, Z = -nx * shy + nz2 * chy;
    return (ny2 * SP + (-X * sy + Z * cy) * CP) / l;
  };
  const style = look.hairStyle;
  const texHead = look.headTex && headTexReady(look.headTex) ? look.headTex : null;
  const bald = style === 'bald';
  const drape = style === 'long' || style === 'halfup' || style === 'twin';
  const fringe = R.fringe;
  const blink = pose.eyes > 0.5 && ((st.t * 0.9 + st.seed) % 4.3) < 0.13;
  const dHead = S * hkH, dPx = E * hkH;
  const surfH = (a: number, y: number, inf = 1) => {
    const yy = Math.max(-2.2, Math.min(y, 6.75));
    const f = Math.sqrt(Math.max(0.04, 1 - ((yy - 1) / 5.8) ** 2));
    let rx = 4.8 * Hd.width * f * inf, rz = 5.3 * f * inf;
    if (y < -2.2) { const k = Math.max(0.6, 1 + (y + 2.2) * 0.1); rx *= k; rz *= k; }
    const x = Math.sin(a) * rx, z = Math.cos(a) * rz - 0.3;
    return { x, y, z, n: visN(x / 22.6, (yy - 1) / 33.6, (z + 0.3) / 28.1) };
  };
  const hairline = (a: number) => {
    const t = Math.abs(a);
    let y = t < 0.9 ? 3.25 - t / 0.9 * 1.25 : t < 1.6 ? 2.0 - (t - 0.9) / 0.7 * 1.1 : 0.9 - (t - 1.6) / (Math.PI - 1.6) * 5.1;
    if (drape && t > 1.15) y = Math.min(y, 2.0 - (t - 1.15) * 7);
    if (fringe === 'part' && t < 0.22) y += 0.55 * (1 - t / 0.22);
    if (fringe === 'full' && t < 0.85) y = Math.min(y, 2.5);
    if (fringe === 'side' && a > -0.2 && a < 0.9) y = Math.min(y, 2.7);
    return y;
  };
  const hullLocal = headHullPts(Hd, fem);
  // ---- 背后长发 ----
  if (drape && !texHead) {
    const nape = HP(0, -1.2, -4.4);
    const Lh = fem ? (style === 'twin' ? 4.8 : 6.6) : 5.2;
    const s = strand('hairLong', 6, Lh, nape.x, nape.y, 1.5, 1.05);
    const bandT = TX?.band ? strand('bandT', 4, 2.6, s.x[0], s.y[0], 1.8, 0.8) : null;
    const zz = P(add(sk.chest, FW, -D.td - 1)).z;
    parts.push({ z: zz, f: () => {
      const lt = HP(4.95 * Hd.width, 1.4, -0.9), rt = HP(-4.95 * Hd.width, 1.4, -0.9), top = HP(0, 7.2, -1.2);
      const W0 = Math.max(Math.abs(lt.x - rt.x) / 2, 3.2 * S) * (fem ? 1.04 : 0.98);
      const xs = [nape.x, ...Array.from(s.x)], ys = [nape.y, ...Array.from(s.y)];
      const m = xs.length; const Lp: [number, number][] = [], Rp: [number, number][] = [];
      for (let i = 0; i < m; i++) {
        const i0 = Math.max(0, i - 1), i1 = Math.min(m - 1, i + 1);
        const dx = xs[i1] - xs[i0], dy = ys[i1] - ys[i0], d = Math.hypot(dx, dy) || 1;
        const t = i / (m - 1);
        const w = W0 * (1.04 - 0.46 * t * t) * (1 + 0.06 * Math.sin(t * 5 + st.t * 1.3));
        Lp.push([xs[i] - dy / d * w, ys[i] + dx / d * w]); Rp.push([xs[i] + dy / d * w, ys[i] - dx / d * w]);
      }
      const path = () => {
        g.beginPath();
        g.moveTo(lt.x, lt.y);
        g.quadraticCurveTo(Lp[0][0], (lt.y + Lp[0][1]) / 2, Lp[1][0], Lp[1][1]);
        for (let i = 2; i < m; i++) g.quadraticCurveTo(Lp[i - 1][0], Lp[i - 1][1], (Lp[i - 1][0] + Lp[i][0]) / 2, (Lp[i - 1][1] + Lp[i][1]) / 2);
        const e = m - 1, ex = xs[e], ey = ys[e], ldx = Lp[e][0] - ex, ldy = Lp[e][1] - ey;
        const dx = xs[e] - xs[e - 1], dy = ys[e] - ys[e - 1], dl = Math.hypot(dx, dy) || 1, fx = dx / dl, fy = dy / dl;
        g.lineTo(Lp[e][0], Lp[e][1]);
        g.lineTo(ex + ldx * 0.55 + fx * 3.2 * S, ey + ldy * 0.55 + fy * 3.2 * S);
        g.lineTo(ex + ldx * 0.25, ey + ldy * 0.25);
        g.lineTo(ex + fx * 4.2 * S, ey + fy * 4.2 * S);
        g.lineTo(ex - ldx * 0.25, ey - ldy * 0.25);
        g.lineTo(ex - ldx * 0.55 + fx * 2.6 * S, ey - ldy * 0.55 + fy * 2.6 * S);
        g.lineTo(Rp[e][0], Rp[e][1]);
        for (let i = m - 2; i >= 1; i--) g.quadraticCurveTo(Rp[i + 1][0], Rp[i + 1][1], (Rp[i + 1][0] + Rp[i][0]) / 2, (Rp[i + 1][1] + Rp[i][1]) / 2);
        g.quadraticCurveTo(Rp[0][0], (rt.y + Rp[0][1]) / 2, rt.x, rt.y);
        g.bezierCurveTo(rt.x, top.y - 1 * S, lt.x, top.y - 1 * S, lt.x, lt.y);
        g.closePath();
      };
      path();
      if (fine) { const gr = g.createLinearGradient(0, top.y, 0, ys[m - 1] + 4 * S); gr.addColorStop(0, shade(look.hair, 0.12)); gr.addColorStop(0.5, look.hair); gr.addColorStop(1, shade(look.hair, -0.25)); g.fillStyle = gr; }
      else g.fillStyle = look.hair;
      g.fill();
      g.strokeStyle = inkOf(look.hair); g.lineWidth = lw * 0.85; g.stroke();
      if (fine) {
        g.save(); path(); g.clip();
        g.lineWidth = Math.max(0.35, 0.3 * S);
        for (let k = -4; k <= 4; k++) {
          const f = k / 4.6;
          g.strokeStyle = k % 2 ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.26)';
          g.beginPath();
          for (let i = 0; i < m; i++) {
            const x = xs[i] + (Lp[i][0] - xs[i]) * f, y = ys[i] + (Lp[i][1] - ys[i]) * f;
            if (i === 0) g.moveTo(lt.x + (rt.x - lt.x) * (0.5 - f / 2), top.y + 3 * S); else g.lineTo(x, y);
          }
          g.stroke();
        }
        g.restore();
      }
      if (TX?.band && m > 2) {
        // r7：后颈一条束发的布带（两头的短布条随风摆）
        const bx0 = Lp[1][0] + (xs[1] - Lp[1][0]) * 0.05, by0 = Lp[1][1], bx1 = Rp[1][0], by1 = Rp[1][1];
        g.strokeStyle = inkOf(TX.band); g.lineWidth = 2.4 * S; g.beginPath(); g.moveTo(bx0, by0); g.lineTo(bx1, by1); g.stroke();
        g.strokeStyle = TX.band; g.lineWidth = 1.7 * S; g.beginPath(); g.moveTo(bx0, by0); g.lineTo(bx1, by1); g.stroke();
        if (bandT) ribbon(bandT, 1.1, 0.5, TX.band, true);
      }
    } });
  }
  // ---- 发髻、发带、马尾 ----
  const bunL = style === 'ponytail' ? [0, 5.0, -4.7] : style === 'updo' ? [0, 7.5, -2.8] : style === 'halfup' ? [0, 5.6, -3.9] : [0, 6.95, -1.4];
  const bun = HP(bunL[0], bunL[1], bunL[2]);
  const hairBackZ = P(add(sk.head, v(0, 0, -6))).z;
  let ribbons: Strand[] = [];
  if (look.ribbon && !bald && !texHead) {
    const rb = style === 'twin' ? [HP(3.9, 5.2, -1.4), HP(-3.9, 5.2, -1.4)] : [{ x: bun.x - 0.8 * S, y: bun.y + 1 * S }, { x: bun.x + 0.8 * S, y: bun.y + 1 * S }];
    ribbons = [strand('rib1', 6, fem ? 4.2 : 3.6, rb[0].x, rb[0].y, 2.6, 0.7), strand('rib2', 5, fem ? 4.6 : 3.6, rb[1].x, rb[1].y, 2.6, 0.7)];
  }
  const ponytail = style === 'ponytail' && !texHead ? strand('pony', 6, fem ? 5.2 : 4.6, bun.x, bun.y, 1.8, 1) : null;
  const lockA = HP(5.2 * Hd.width, -0.4, 0.4), lockB = HP(-5.2 * Hd.width, -0.4, 0.4);
  const locks = (drape || fringe === 'part') && !texHead && !bald ? [strand('lockL', 5, 3.4, lockA.x, lockA.y, 1.6, 1), strand('lockR', 5, 3.4, lockB.x, lockB.y, 1.6, 1)] : [];
  const wA = HP(4.35 * Hd.width, 2.2, 2.6), wB = HP(-4.35 * Hd.width, 2.2, 2.6);
  const wisps = fringe === 'wisp' && !texHead && !bald ? [strand('wispL', 5, 2.2, wA.x, wA.y, 1.2, 0.9), strand('wispR', 5, 2.2, wB.x, wB.y, 1.2, 0.9)] : [];
  const pinA = HP(2.6, 6.2, -1.8);
  const tassel = look.pin === 'gold' || look.pin === 'jade' ? strand('tassel', 4, 1.5, pinA.x + 1.5 * S, pinA.y, 1.2, 1) : null;
  if (ribbons.length) parts.push({ z: Math.min(hairBackZ, bun.z) - 0.5, f: () => { for (const r of ribbons) ribbon(r, 1.6, 1.0, look.ribbon!, true); } });
  if (ponytail) parts.push({ z: bun.z - 0.6, f: () => ribbon(ponytail, 4.4, 1.2, look.hair, true) });

  const drawBun = (c: P2, rx: number, ry: number) => {
    if (fine) {
      const gr = g.createRadialGradient(c.x - rx * 0.35, c.y - ry * 0.4, 0, c.x, c.y, rx * 1.2);
      gr.addColorStop(0, shade(look.hair, 0.3)); gr.addColorStop(0.6, look.hair); gr.addColorStop(1, shade(look.hair, -0.2));
      g.fillStyle = gr;
    } else g.fillStyle = look.hair;
    g.beginPath(); g.ellipse(c.x, c.y, rx, ry, 0, 0, TAU); g.fill();
    g.strokeStyle = inkOf(look.hair); g.lineWidth = lw * 0.8; g.stroke();
    if (fine) {
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = Math.max(0.35, 0.3 * S);
      g.beginPath(); g.ellipse(c.x + rx * 0.1, c.y + ry * 0.05, rx * 0.62, ry * 0.55, 0.3, 0.4, 4.2); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.24)'; g.lineWidth = Math.max(0.4, 0.5 * S);
      g.beginPath(); g.ellipse(c.x, c.y, rx * 0.7, ry * 0.6, 0, Math.PI * 1.1, Math.PI * 1.65); g.stroke();
    }
  };

  const texHeadDraw = (name: string) => {
    const a = Math.atan2(sY, cY), aa = Math.abs(a);
    const view: HeadView = aa < 0.39 ? 'front' : aa < 1.18 ? 'q' : aa < 1.96 ? 'side' : aa < 2.75 ? 'qb' : 'back';
    const flip = (view === 'q' || view === 'side' || view === 'qb') && a < 0;
    const nb = P(add(sk.chest, U, HEAD_NECK_UP)), top = HP(0, HEAD_TOP_Y, -1.2);
    const Hh = Math.max(4, (nb.y - top.y) * HEAD_TEX_K);
    const t = headTex(name, view, Hh); if (!t) return false;
    const W = Hh * t.img.w / t.img.h, ang = Math.atan2(hed.x - nb.x, nb.y - hed.y) * 0.7;
    g.save(); g.translate(nb.x, nb.y + Hh * HEAD_NECK_SINK); g.rotate(ang); if (flip) g.scale(-1, 1);
    g.imageSmoothingQuality = 'high'; g.drawImage(t.src, -t.img.neckX * W, -Hh, W, Hh); g.restore();
    return true;
  };

  const headDraw = () => {
    if (texHead && texHeadDraw(texHead)) return;
    // 颈
    const neckTop = HP(0, -4.6, -0.7), neckBot = P(add(sk.chest, U, 2.6));
    const nr = (fem ? 1.75 : 2.15) * hkH * Hd.width;
    tube(neckBot, neckTop, nr * S, nr * 0.92 * S, shade(look.skin, -0.06), rgba(shade(look.skin, -0.55), 0.85));
    if (fine) { g.fillStyle = rgba(shade(look.skin, -0.45), 0.28); g.beginPath(); g.ellipse(neckTop.x, neckTop.y + 0.8 * S, nr * S * 1.05, nr * S * 0.55, 0, 0, TAU); g.fill(); }
    if (bun.z < hed.z - 0.5 && (style === 'bun' || style === 'crown' || style === 'halfup' || style === 'updo')) drawBun(bun, (style === 'updo' ? 3.4 : 2.9) * S * hkH, (style === 'updo' ? 3.0 : 2.5) * S * hkH);
    if (style === 'twin') for (const sx of [1, -1]) { const b = HP(sx * 3.7, 5.9, -1.1); if (b.z < hed.z) drawBun(b, 2.5 * S * hkH, 2.3 * S * hkH); }
    // 轮廓
    const hull = convexHull(hullLocal.map(([x, y, z]) => HP(x, y, z)));
    const sil = () => smoothPoly(hull);
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const q of hull) { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y); }
    sil(); g.fillStyle = look.skin; g.fill();
    g.save(); sil(); g.clip();
    if (fine) {
      // 面部明暗：左上受光；远侧脸颊、下颌柔影
      const lg = g.createLinearGradient(minX, minY, maxX, maxY);
      lg.addColorStop(0, 'rgba(255,248,236,0.26)'); lg.addColorStop(0.55, 'rgba(255,255,255,0)'); lg.addColorStop(1, 'rgba(150,72,52,0.24)');
      g.fillStyle = lg; g.fillRect(minX, minY, maxX - minX, maxY - minY);
    }
    const faceVis = visN(0, -0.1, 1);
    if (faceVis > -0.25) {
      const fc: FaceCtx = { g, HP, vis: visN, d: dHead, px: dPx, f: R.face, fem, closed: pose.eyes < 0.5 || blink, sY, hair: look.hair, lip: look.lip, lash: look.lash ?? fem, huadian: look.huadian, mouthOpen: pose.mouth, gaze: -shy * 0.6 };
      drawFace(fc);
    }
    // ---- 头发（发际线以上）----
    if (!bald) {
      const N = 36; const pts: { x: number; y: number; n: number; a: number }[] = [];
      for (let i = 0; i < N; i++) {
        const a = -Math.PI + (i / N) * TAU;
        const s = surfH(a, hairline(a), 1.06); const q = HP(s.x, s.y, s.z);
        pts.push({ x: q.x, y: q.y, n: s.n, a });
      }
      let best = -1, bestLen = 0;
      for (let i = 0; i < N; i++) {
        if (pts[i].n <= 0 || pts[(i - 1 + N) % N].n > 0) continue;
        let l = 0; while (l < N && pts[(i + l) % N].n > 0) l++;
        if (l > bestLen) { bestLen = l; best = i; }
      }
      const cx = (minX + maxX) / 2, BIG = 60 * S;
      const hairPath = (oy: number) => {
        g.beginPath();
        if (best < 0) { g.rect(minX - 2, minY - 2, maxX - minX + 4, maxY - minY + 4); return; }
        const run = []; for (let l = 0; l < bestLen; l++) run.push(pts[(best + l) % N]);
        const A = run[0], Bq = run[run.length - 1];
        const sa = Math.sign(A.x - cx) || -1, sb = Math.sign(Bq.x - cx) || 1;
        g.moveTo(A.x + sa * BIG, A.y + oy); g.lineTo(A.x, A.y + oy);
        for (let i = 1; i < run.length; i++) g.quadraticCurveTo(run[i - 1].x, run[i - 1].y + oy, (run[i - 1].x + run[i].x) / 2, (run[i - 1].y + run[i].y) / 2 + oy);
        g.lineTo(Bq.x, Bq.y + oy); g.lineTo(Bq.x + sb * BIG, Bq.y + oy); g.lineTo(Bq.x + sb * BIG, minY - BIG); g.lineTo(A.x + sa * BIG, minY - BIG); g.closePath();
      };
      // 发际线下的淡影（头发投在额上）
      if (fine && faceVis > 0 && best >= 0) { hairPath(0.75 * hkH * S); g.fillStyle = rgba(shade(look.skin, -0.5), 0.18); g.fill(); }
      hairPath(0);
      g.save(); g.clip();
      if (fine) {
        const hg = g.createLinearGradient(minX, minY, maxX, maxY);
        hg.addColorStop(0, shade(look.hair, 0.24)); hg.addColorStop(0.5, look.hair); hg.addColorStop(1, shade(look.hair, -0.25));
        g.fillStyle = hg;
      } else g.fillStyle = look.hair;
      g.fillRect(minX - 2, minY - 2, maxX - minX + 4, maxY - minY + 4);
      if (fine) {
        const crown = HP(0, 7.0, -0.8);
        g.lineWidth = Math.max(0.3, 0.26 * S);
        // 发丝合批：一个人头 10~20 次描边；同一循环、同层不交叉，合并成两条 Path2D 栅格结果一致
        {
          const seg = [new Path2D(), new Path2D()];
          for (let i = 0; i < N; i += (dHead > 4 ? 1 : 2)) {
            const p = pts[i]; if (p.n < -0.2) continue;
            const mid = surfH(p.a, (hairline(p.a) + 6.5) / 2, 1.13); const mq = HP(mid.x, mid.y, mid.z);
            const path = seg[i % 4 ? 0 : 1];
            path.moveTo(crown.x, crown.y); path.quadraticCurveTo(mq.x, mq.y, p.x, p.y);
          }
          g.strokeStyle = 'rgba(255,255,255,0.08)'; g.stroke(seg[0]);
          g.strokeStyle = 'rgba(0,0,0,0.2)'; g.stroke(seg[1]);
        }
        // 光泽环
        g.strokeStyle = 'rgba(255,255,255,0.2)'; g.lineWidth = 1.3 * S; g.beginPath();
        let started = false;
        for (let i = 0; i <= 24; i++) {
          const a = -Math.PI + (i / 24) * TAU; const s = surfH(a, 4.4, 1.07);
          if (s.n <= 0.05) { started = false; continue; }
          const q = HP(s.x, s.y, s.z); if (!started) { g.moveTo(q.x, q.y); started = true; } else g.lineTo(q.x, q.y);
        }
        g.stroke();
      }
      g.restore();
      // 刘海
      if (faceVis > 0) {
        g.fillStyle = look.hair;
        if (fringe === 'full') {
          for (let i = -3; i <= 3; i++) {
            const a0 = i * 0.2; const s0 = surfH(a0 - 0.08, 3.4, 1.06), s1 = surfH(a0 + 0.1, 3.4, 1.06), s2 = surfH(a0 + 0.04 * Math.sign(i || 1), 1.75 + Math.abs(i) * 0.15 + (i % 2 ? 0.12 : 0), 1.08);
            if (s2.n < 0) continue;
            const q0 = HP(s0.x, s0.y, s0.z), q1 = HP(s1.x, s1.y, s1.z), q2 = HP(s2.x, s2.y, s2.z);
            g.beginPath(); g.moveTo(q0.x, q0.y); g.quadraticCurveTo(q0.x, q2.y - 1 * S, q2.x, q2.y); g.quadraticCurveTo(q1.x, q2.y - 1.2 * S, q1.x, q1.y); g.closePath(); g.fill();
          }
        } else if (fringe === 'side') {
          for (let i = 0; i < 5; i++) {
            const a0 = 0.75 - i * 0.32; const s0 = surfH(a0 + 0.12, 4.0, 1.06), s1 = surfH(a0 - 0.12, 3.8, 1.06), s2 = surfH(a0 - 0.42, 2.9 - i * 0.28, 1.09);
            if (s2.n < 0.05) continue;
            const q0 = HP(s0.x, s0.y, s0.z), q1 = HP(s1.x, s1.y, s1.z), q2 = HP(s2.x, s2.y, s2.z);
            g.beginPath(); g.moveTo(q0.x, q0.y); g.quadraticCurveTo((q0.x + q2.x) / 2, q0.y + 0.3 * S, q2.x, q2.y); g.quadraticCurveTo((q1.x + q2.x) / 2, q1.y + 1.2 * S, q1.x, q1.y); g.closePath(); g.fill();
          }
        } else if (fringe === 'part' && Math.abs(sY) < 0.5) {
          for (const sx of [1, -1]) {
            const s0 = surfH(sx * 0.1, 3.7, 1.07), s1 = surfH(sx * 0.55, 2.7, 1.08), s2 = surfH(sx * 0.95, 0.3, 1.1), s3 = surfH(sx * 1.2, 2.2, 1.07);
            if (s2.n < 0.2 || s1.n < 0.2) continue;
            const q0 = HP(s0.x, s0.y, s0.z), q1 = HP(s1.x, s1.y, s1.z), q2 = HP(s2.x, s2.y, s2.z), q3 = HP(s3.x, s3.y, s3.z);
            g.beginPath(); g.moveTo(q0.x, q0.y); g.quadraticCurveTo(q1.x, q1.y + 0.6 * S, q2.x, q2.y); g.quadraticCurveTo(q3.x, q3.y, q0.x, q0.y - 0.5 * S); g.closePath(); g.fill();
            if (fine) { g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = Math.max(0.3, 0.3 * S); g.beginPath(); g.moveTo(q0.x, q0.y); g.quadraticCurveTo(q1.x, q1.y + 0.2 * S, q2.x, q2.y); g.stroke(); }
          }
        }
      }
    }
    g.restore();
    // 耳
    if (!(drape && fem) || bald) {
      for (const sx of [1, -1]) {
        const k = visN(sx, 0, 0.35); if (k < 0.3) continue;
        const e = HP(sx * 4.75 * Hd.width, -0.7, -0.35), et = HP(sx * 4.9 * Hd.width, 0.6, -0.6);
        const ang = Math.atan2(et.y - e.y, et.x - e.x) + Math.PI / 2;
        g.fillStyle = shade(look.skin, -0.04);
        g.beginPath(); g.ellipse(e.x, e.y, 0.95 * S * hkH * Math.min(1, k * 1.5), 1.75 * S * hkH, ang, 0, TAU); g.fill();
        g.strokeStyle = rgba(shade(look.skin, -0.55), 0.8); g.lineWidth = Math.max(0.35, 0.35 * S); g.stroke();
        if (fine) { g.strokeStyle = 'rgba(150,80,60,0.45)'; g.beginPath(); g.ellipse(e.x, e.y, 0.45 * S * hkH * Math.min(1, k * 1.5), 1.0 * S * hkH, ang, -1, 1.6); g.stroke(); }
        if (look.earring && fem) {
          const e0 = HP(sx * 5.0 * Hd.width, -1.9, 0.3), sw = Math.sin(st.t * 3 + sx) * 0.3 * dHead / zs;
          g.strokeStyle = rgba(look.earring, 0.85); g.lineWidth = Math.max(0.3, 0.22 * S);
          g.beginPath(); g.moveTo(e0.x, e0.y); g.lineTo(e0.x + sw, e0.y + 2.3 * S * hkH); g.stroke();
          g.fillStyle = rgba(look.earring, 0.95); g.beginPath(); g.arc(e0.x + sw, e0.y + 2.6 * S * hkH, 0.6 * S * hkH, 0, TAU); g.fill();
        }
      }
    }
    // 轮廓描边（暖褐细线）
    g.strokeStyle = rgba(shade(look.skin, -0.6), 0.9); g.lineWidth = lw * 0.85; sil(); g.stroke();
    if (look.beard) drawBeard({ g, HP, vis: visN, d: dHead, px: dPx, f: R.face, fem, closed: false, sY, hair: look.hair, lash: false, mouthOpen: 0, gaze: 0 }, look.beard, R.old, st.t);
    // 鬓发 / 胸前发缕 / 碎发
    for (let li = 0; li < locks.length; li++) { if (visN(li ? -1 : 1, 0, 0.9) < 0.3) continue; ribbon(locks[li], fem ? 0.9 : 0.75, 0.12, look.hair, false); }
    for (let li = 0; li < wisps.length; li++) { if (visN(li ? -1 : 1, 0, 0.8) < 0.2) continue; ribbon(wisps[li], 0.45, 0.06, look.hair, false); }
    // 发髻 / 冠 / 簪
    if (bun.z >= hed.z - 0.5 && (style === 'bun' || style === 'crown' || style === 'halfup' || style === 'updo')) drawBun(bun, (style === 'updo' ? 3.4 : 2.9) * S * hkH, (style === 'updo' ? 3.0 : 2.5) * S * hkH);
    if (style === 'twin') for (const sx of [1, -1]) { const b = HP(sx * 3.7, 5.9, -1.1); if (b.z >= hed.z) drawBun(b, 2.5 * S * hkH, 2.3 * S * hkH); }
    if (style === 'ponytail') drawBun(bun, 1.6 * S * hkH, 1.5 * S * hkH);
    if (style === 'crown') {
      const c = HP(0, 8.1, -1.2), w = 2.4 * S * hkH;
      g.fillStyle = '#efeadc'; g.beginPath(); g.moveTo(c.x - w, c.y + 1.6 * S); g.lineTo(c.x - w * 0.8, c.y - 1.4 * S); g.quadraticCurveTo(c.x, c.y - 2.6 * S, c.x + w * 0.8, c.y - 1.4 * S); g.lineTo(c.x + w, c.y + 1.6 * S); g.closePath(); g.fill();
      g.strokeStyle = inkOf('#efeadc'); g.lineWidth = lw * 0.6; g.stroke();
      g.fillStyle = 'rgba(120,170,140,0.7)'; g.beginPath(); g.arc(c.x, c.y - 0.2 * S, 0.7 * S, 0, TAU); g.fill();
    }
    if (style === 'bun' || style === 'crown' || style === 'updo' || look.pin) {
      const ca = Math.cos(Yh);
      const pc = style === 'halfup' || style === 'twin' || style === 'long' ? pinA : bun;
      g.strokeStyle = look.pin === 'gold' ? '#d8b050' : look.pin === 'jade' ? '#a8d8c0' : style === 'crown' ? '#e8e0c8' : '#8a6a42';
      g.lineWidth = 0.8 * S;
      g.beginPath(); g.moveTo(pc.x - 4.5 * S * Math.abs(ca) - 1.3 * S, pc.y + 0.4 * S); g.lineTo(pc.x + 4.5 * S * Math.abs(ca) + 1.3 * S, pc.y - 0.4 * S); g.stroke();
      if (look.pin === 'flower') {
        for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; g.fillStyle = '#f0b8c8'; g.beginPath(); g.arc(pc.x + Math.cos(a) * 1.1 * S, pc.y + Math.sin(a) * 1.1 * S, 0.8 * S, 0, TAU); g.fill(); }
        g.fillStyle = '#f8e070'; g.beginPath(); g.arc(pc.x, pc.y, 0.5 * S, 0, TAU); g.fill();
      }
      if (tassel) {
        g.strokeStyle = look.pin === 'gold' ? 'rgba(216,176,80,0.9)' : 'rgba(168,216,192,0.9)'; g.lineWidth = 0.35 * S;
        g.beginPath(); g.moveTo(tassel.x[0], tassel.y[0]); for (let i = 1; i < tassel.n; i++) g.lineTo(tassel.x[i], tassel.y[i]); g.stroke();
        g.fillStyle = look.pin === 'gold' ? '#e8c060' : '#b8e8d0';
        g.beginPath(); g.arc(tassel.x[tassel.n - 1], tassel.y[tassel.n - 1], 0.6 * S, 0, TAU); g.fill();
        g.fillStyle = '#e05060'; g.beginPath(); g.arc(tassel.x[1], tassel.y[1], 0.4 * S, 0, TAU); g.fill();
      }
    }
    if (look.hat === 'douli') {
      const top = HP(0, 10, 0), brim = HP(0, 5.0, 0);
      g.fillStyle = '#c8a76a';
      g.beginPath(); g.ellipse(brim.x, brim.y, 14 * S, 14 * S * SP * 1.3, 0, 0, TAU); g.fill(); g.strokeStyle = inkOf('#c8a76a'); g.lineWidth = lw; g.stroke();
      g.beginPath(); g.moveTo(brim.x - 13 * S, brim.y); g.quadraticCurveTo(top.x, top.y - 6 * S, brim.x + 13 * S, brim.y); g.closePath();
      g.fillStyle = '#d6b87c'; g.fill(); g.stroke();
      g.strokeStyle = 'rgba(110,80,40,0.45)'; g.lineWidth = lw * 0.6;
      for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(top.x, top.y - 3 * S); g.lineTo(brim.x + i * 5.5 * S, brim.y + 1.2 * S); g.stroke(); }
    }
  };
  parts.push({ z: torsoZ + 3, f: headDraw });

  // 排序绘制
  if (timing) { prof.add('R·人物分件准备', start); start = performance.now(); }
  parts.sort((a, b) => a.z - b.z);
  for (const p of parts) p.f();
  if (timing) prof.add('R·人物分件绘制', start);
  g.restore();
  const rh = P(add(sk.rWr, sk.rH.a, PALM_L * 0.55 * hk)), lh = P(add(sk.lWr, sk.lH.a, PALM_L * 0.55 * hk));
  return { headX: hed.x, headY: hed.y, handX: rh.x, handY: rh.y, lHandX: lh.x, lHandY: lh.y, front };
}

// 下摆 / 领缘纹样（云纹、水波、回纹、碎花、竹叶）：沿镶边折线等距布置
function hemPattern(g: CanvasRenderingContext2D, chain: { x: number; y: number }[], w: number, pat: string, col: string, S: number) {
  let total = 0; const seg: number[] = [];
  for (let i = 1; i < chain.length; i++) { const d = Math.hypot(chain[i].x - chain[i - 1].x, chain[i].y - chain[i - 1].y); seg.push(d); total += d; }
  const step = Math.max(3.2 * S, w * 2.6);
  g.save(); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = Math.max(0.35, 0.32 * S);
  for (let s = step * 0.5; s < total; s += step) {
    let acc = 0, i = 0; while (i < seg.length && acc + seg[i] < s) { acc += seg[i]; i++; }
    if (i >= seg.length) break;
    const t = (s - acc) / seg[i], a = chain[i], b = chain[i + 1];
    const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, ang = Math.atan2(b.y - a.y, b.x - a.x);
    g.save(); g.translate(x, y); g.rotate(ang);
    const r = w * 0.55;
    if (pat === 'cloud') { g.beginPath(); g.arc(-r * 0.5, 0, r * 0.5, Math.PI, Math.PI * 2.6); g.arc(r * 0.5, 0, r * 0.45, Math.PI * 1.2, Math.PI * 2.9); g.stroke(); }
    else if (pat === 'wave') { g.beginPath(); g.arc(0, r * 0.4, r * 0.8, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
    else if (pat === 'fret') { g.beginPath(); g.moveTo(-r, r * 0.6); g.lineTo(-r, -r * 0.6); g.lineTo(r * 0.6, -r * 0.6); g.lineTo(r * 0.6, r * 0.2); g.lineTo(-r * 0.3, r * 0.2); g.stroke(); }
    else if (pat === 'flower') dotFlower(g, 0, 0, r * 0.75, col);
    else if (pat === 'bamboo') { g.beginPath(); g.ellipse(0, 0, r, r * 0.3, -0.5, 0, TAU); g.fill(); }
    g.restore();
  }
  g.restore();
}
function dotFlower(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) {
  g.fillStyle = col;
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; g.beginPath(); g.arc(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.38, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = 'rgba(255,230,120,0.9)'; g.beginPath(); g.arc(x, y, r * 0.3, 0, Math.PI * 2); g.fill();
}

// 脚下飞舟（神风舟等）：侧视造型按朝向斜投影，舷下风纹灵光
function headingAxis(yaw: number) {
  const dx = Math.sin(yaw), dz = Math.cos(yaw);
  let ex = dx; const ey = dz * 0.32;
  if (Math.abs(ex) < 0.55) ex = (ex < 0 ? -1 : 1) * 0.55;
  return [ex, ey] as const;
}
export function drawBoatUnderFeet(g: CanvasRenderingContext2D, x: number, y: number, yaw: number, S: number, t: number, id: string) {
  const L = artLook(id), [ex, ey] = headingAxis(yaw), bob = Math.sin(t * 2.2) * 1.5 * S;
  g.save();
  g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(x, y + 8 * S, 0, x, y + 8 * S, 60 * S);
  gr.addColorStop(0, `rgba(${L.glow},0.32)`); gr.addColorStop(1, `rgba(${L.glow},0)`);
  g.fillStyle = gr; g.beginPath(); g.ellipse(x, y + 8 * S, 60 * S, 18 * S, 0, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'source-over';
  g.translate(x, y + 9 * S + bob);
  g.transform(ex, ey, 0, 1, 0, 0);
  drawArt(g, L, -6 * S, 0, 118 * S, Math.sin(t * 1.7) * 0.03);
  g.restore();
}
// 背后遁具：云雷双翼（扇动 + 雷纹）/ 血色披风（随风飘摆）
export function drawBackMount(g: CanvasRenderingContext2D, x: number, y: number, yaw: number, S: number, t: number, id: string) {
  const L = artLook(id), side = Math.abs(Math.sin(yaw));
  g.save();
  if (L.shape === 'wings') {
    const flap = Math.sin(t * 7);
    g.translate(x, y - 4 * S);
    g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 70 * S);
    gr.addColorStop(0, `rgba(${L.glow},${0.28 + 0.1 * flap})`); gr.addColorStop(1, `rgba(${L.glow},0)`);
    g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, 80 * S * (1 - side * 0.55), 50 * S, 0, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.scale((1 - side * 0.6) * (0.9 + 0.12 * flap), 0.9 - 0.08 * flap);
    drawArt(g, L, 0, -6 * S, 132 * S);
    g.globalCompositeOperation = 'lighter'; g.strokeStyle = `rgba(${L.glow},0.8)`; g.lineWidth = 1.2 * S;
    const seed = Math.floor(t * 18);
    for (const s of [-1, 1]) { g.beginPath(); let px = s * 20 * S, py = -14 * S; g.moveTo(px, py); for (let i = 0; i < 4; i++) { px += s * 9 * S; py += (((seed * 7 + i * 13 + (s > 0 ? 5 : 0)) % 9) - 5) * 1.6 * S; g.lineTo(px, py); } g.stroke(); }
  } else {
    const sway = Math.sin(t * 3.1) * 0.08;
    g.translate(x, y - 10 * S); g.rotate(sway + Math.sin(yaw) * -0.25);
    g.scale(1 - side * 0.35, 1.15);
    drawArt(g, L, 0, 30 * S, 72 * S);
    g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(0, 40 * S, 0, 0, 40 * S, 60 * S);
    gr.addColorStop(0, `rgba(${L.glow},0.18)`); gr.addColorStop(1, `rgba(${L.glow},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(0, 40 * S, 60 * S, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// 脚下飞剑
export function drawSwordUnderFeet(g: CanvasRenderingContext2D, x: number, y: number, yaw: number, S: number, t: number, color: string) {
  const L = 22 * S;
  const dx = Math.sin(yaw), dz = Math.cos(yaw);
  const gp = 0.55;
  const tipX = x + dx * L, tipY = y + dz * L * gp, tailX = x - dx * L * 0.85, tailY = y - dz * L * 0.85 * gp;
  g.save();
  g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(x, y, 0, x, y, L * 1.2);
  gr.addColorStop(0, rgba0(color, 0.38)); gr.addColorStop(1, rgba0(color, 0));
  g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, L * 1.2, L * 0.55, 0, 0, Math.PI * 2); g.fill();
  g.restore();
  const nx = -(tipY - tailY), ny = tipX - tailX; const nd = Math.hypot(nx, ny) || 1;
  const w = 2.2 * S;
  g.fillStyle = '#e8f4f0';
  g.beginPath();
  g.moveTo(tipX, tipY);
  g.lineTo(x + nx / nd * w, y + ny / nd * w);
  g.lineTo(tailX + nx / nd * w * 0.8, tailY + ny / nd * w * 0.8);
  g.lineTo(tailX - nx / nd * w * 0.8, tailY - ny / nd * w * 0.8);
  g.lineTo(x - nx / nd * w, y - ny / nd * w);
  g.closePath(); g.fill();
  g.strokeStyle = rgba0(color, 0.9); g.lineWidth = 0.9 * S; g.stroke();
  const gx = tailX + (x - tailX) * 0.15, gy = tailY + (y - tailY) * 0.15;
  g.strokeStyle = '#c8a050'; g.lineWidth = 1.6 * S;
  g.beginPath(); g.moveTo(gx + nx / nd * w * 2, gy + ny / nd * w * 2); g.lineTo(gx - nx / nd * w * 2, gy - ny / nd * w * 2); g.stroke();
  g.strokeStyle = '#3a2a20'; g.lineWidth = 1.8 * S;
  g.beginPath(); g.moveTo(gx, gy); g.lineTo(tailX - dx * 6 * S, tailY - dz * 6 * S * gp); g.stroke();
  void t;
}

// ---------------------------------------------------------------- NPC 外观随机（按身份挑衣裳，脸 / 头 / 身材由种子生成）
const HAIRS = ['#1d1a17', '#241f1b', '#2a2420', '#151311', '#3a2e26'];
const SKINS = ['#f1d9bd', '#ecd2b2', '#e6c8a6', '#f4ddc4', '#dcb894'];
const LIPS = ['#c84a5a', '#b8404e', '#d06070', '#a83a48', '#c85a5a'];

export function randomLook(rnd: () => number, role?: NpcRole): Look {
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const r = role ?? pick<NpcRole>(['cultivator', 'cultivator', 'scholar', 'farmer', 'merchant', 'female', 'female', 'elder', 'guard']);
  const fem = r === 'female';
  let L: Look = {
    sex: fem ? 'f' : 'm', height: (0.93 + rnd() * 0.13) * (fem ? 0.95 : 1), build: fem ? 0.88 + rnd() * 0.06 : 0.92 + rnd() * 0.16,
    skin: pick(SKINS), hair: pick(HAIRS), hairStyle: 'bun',
    robe: '#3f6a4c', inner: '#ece6d6', trim: '#2b2b2b', belt: '#1f2420', pants: '#6a5f50', boots: '#2a2622',
    robeLen: 'long', sleeve: 'wide', back: 'none', waist: 'none', hand: 'none',
    swordColor: pick(['#7ff0c0', '#9fc8ff', '#ffd27a', '#ff9a8a', '#d0a8ff']),
    faceSeed: Math.floor(rnd() * 4294967295),
  };
  const oid = pick(ROLE_OUTFITS[r]);
  L = applyOutfit(L, oid, Math.floor(rnd() * OUTFIT_BY_ID[oid].dyes.length));
  if (r === 'cultivator') {
    L.hairStyle = pick(['bun', 'crown', 'ponytail', 'bun', 'halfup']);
    L.ribbon = rnd() < 0.6 ? shade0(L.robe, -0.3) : undefined;
    L.back = rnd() < 0.4 ? 'sword' : 'none';
    L.waist = pick(['jade', 'pouch', 'gourd', 'none']);
  } else if (r === 'scholar') {
    L.hairStyle = 'crown'; L.hand = rnd() < 0.5 ? 'fan' : 'none'; L.back = rnd() < 0.3 ? 'box' : 'none'; L.waist = 'jade';
  } else if (r === 'farmer') {
    L.hat = rnd() < 0.6 ? 'douli' : 'none'; L.back = rnd() < 0.4 ? 'basket' : 'none'; L.hairStyle = pick(['bun', 'bun', 'ponytail']);
  } else if (r === 'merchant') {
    L.hairStyle = 'crown'; L.build *= 1.08; L.waist = 'pouch';
    L.body = { belly: 0.35 + rnd() * 0.6, heft: 1.1 + rnd() * 0.15, waist: 1.1 };
  } else if (r === 'female') {
    L.hairStyle = pick(['halfup', 'twin', 'long', 'halfup', 'updo', 'updo']);
    L.ribbon = rnd() < 0.5 ? pick(['#c03040', '#f0f0f0', '#5070a0', '#e0a0b0']) : undefined;
    L.fringe = L.hairStyle === 'twin' ? (rnd() < 0.7 ? 'full' : 'side') : L.hairStyle === 'updo' ? (rnd() < 0.7 ? 'wisp' : 'side') : pick(['part', 'part', 'side', 'full', 'wisp']);
    L.bangs = L.fringe === 'full';
    L.pin = pick<Look['pin']>(['gold', 'jade', 'flower', undefined, 'gold']);
    L.earring = rnd() < 0.5 ? pick(['#e8c060', '#bfe0ff', '#f0a0b0']) : undefined;
    L.lash = true; L.lip = pick(LIPS); L.huadian = rnd() < 0.22 ? pick(['#d0303a', '#e8a030']) : undefined;
    L.waist = 'jade';
  } else if (r === 'elder') {
    L.hair = '#d8d4cc'; L.beard = '#e4e0d8'; L.hairStyle = 'crown'; L.hand = rnd() < 0.5 ? 'staff' : 'none'; L.height *= 0.97;
    L.body = { stoop: 0.25 + rnd() * 0.35, heft: 0.92 };
  } else if (r === 'guard') {
    L.back = 'sword'; L.hairStyle = 'ponytail'; L.build *= 1.1;
  } else if (r === 'monk') {
    L.hairStyle = 'bald';
  }
  return L;
}

// ---------------------------------------------------------------- 撼山客招式第三批（world/hsmoves3.ts）的姿势：只增不改，放在这一段
/** 蓄劲沉身（马步、双拳收在腰）、冲天拳、虚空里的一脚、高空踩落、纵身跃起 */
export type Hs3Action = 'hs3Crouch' | 'hs3Upper' | 'hs3Kick' | 'hs3Stomp' | 'hs3Leap' | 'hs3Spin' | 'hs3Brace' | 'hs3Cannon' | 'hs3AirPunch';
const HS3_ACTION_SET = new Set<Action>(['hs3Crouch', 'hs3Upper', 'hs3Kick', 'hs3Stomp', 'hs3Leap', 'hs3Spin', 'hs3Brace', 'hs3Cannon', 'hs3AirPunch']);
function hs3Pose(p: Pose, st: CharState, R: RLook, D: Dims, a: Hs3Action) {
  // r7-fx3d：卡帧（照格斗游戏的做法）——这几个新姿势按每 1/20 息一档跳着走（60 帧下每档停 3 帧），不平滑插值；起手、出手「啪」地切过去
  const STEP = a === 'hs3Spin' || a === 'hs3Brace' || a === 'hs3Cannon' || a === 'hs3AirPunch';
  const at = STEP ? Math.floor(st.actionT * 20) / 20 + 0.025 : st.actionT, td = D.td, fem = R.fem, tr = Math.sin(st.t * 41) * 0.02;
  p.breath = 0;
  if (a === 'hs3Crouch') {
    // 马步沉身：两膝外撑、身子压低，双拳收在腰间往后拉（越蓄越低，劲在发抖）
    const k = smooth01(at / 0.22);
    p.lHip = p.rHip = 0.95 * k; p.lKn = p.rKn = 0.08 + 1.35 * k; p.lHipR = p.rHipR = 0.05 + 0.32 * k; p.lFoot = p.rFoot = -0.2 * k;
    p.rootY = -7.5 * k; p.lean = 0.12 + 0.18 * k; p.twist = -0.15 * k + tr; p.side = tr * 0.5;
    for (const side of [1, -1] as const) ik(p, side, 1, [lerp(1.5, 4.2, k), lerp(-4, -13.5, k), lerp(6, -3, k)], [0, -0.15, 1], [side > 0 ? -1 : 1, 0, 0.1], 'fist');
    p.headPitch = 0.08 * k; p.mouth = fem ? 0 : 0.25 * k; p.lFx = p.rFx = 0.5 * k;
  } else if (a === 'hs3Upper') {
    // 冲天拳：从马步里整个人往上一顶，右拳直贯头顶，左臂往下后甩，抬膝、仰头
    const go = backOut(at / 0.14), k = Math.min(1, go);
    ik(p, -1, 1, [lerp(4, -0.4, k), lerp(-12, 24, k), lerp(-2, 5, k)], [0, lerp(-0.2, 1, k), lerp(1, 0.12, k)], [-1, 0, 0.15], 'fist');
    p.lSh = lerp(0.1, -0.7, k); p.lShR = 0.35 + 0.2 * k; p.lEl = lerp(1.2, 0.25, k); p.lG = 'fist';
    p.rHip = lerp(0.9, 1.25, k); p.rKn = lerp(1.4, 1.6, k); p.lHip = lerp(0.9, -0.12, k); p.lKn = lerp(1.4, 0.1, k); p.lFoot = 0.35 * k; p.lHipR = p.rHipR = 0.08;
    p.rootY = lerp(-7.5, 3, k); p.lean = lerp(0.25, -0.16, k); p.twist = 0.3 * k; p.headPitch = -0.45 * k;
    p.rFx = 1.5 * k; p.mouth = fem ? 0.2 : 0.6 * k; p.air = 4 * k; p.ground = 1 - k;
  } else if (a === 'hs3Kick') {
    // 一脚：身子后仰，右腿蹬直往前下踢出，左腿收在胸前；左拳护颌，右臂往后甩开
    const go = backOut(at / 0.12), k = Math.min(1, go);
    p.rHip = lerp(0.6, 1.5, k); p.rKn = lerp(1.6, 0.05, k); p.rFoot = 0.45 * k; p.rHipR = 0.1;
    p.lHip = 1.25; p.lKn = 2.0; p.lHipR = 0.15; p.lFoot = -0.3;
    p.lean = lerp(0.1, -0.5, k); p.twist = -0.35 * k; p.side = 0.08;
    ik(p, 1, 1, [-0.9, 4.2, td + 7.2], [0.05, 0.85, 0.5], [-1, 0, 0.2], 'fist');
    p.rSh = -0.8; p.rShR = 0.55; p.rEl = 0.3; p.rG = 'fist';
    p.headPitch = 0.15; p.mouth = fem ? 0.2 : 0.55 * k; p.ground = 0; p.air = 6; p.rootY = 4;
  } else if (a === 'hs3Stomp') {
    // 高空踩落：一腿笔直往下踩，另一腿高抬，双臂张开往上扬（像一座山往下压），低头盯着落点
    const k = smooth01(at / 0.15);
    p.rHip = 0.05; p.rKn = 0.04; p.rFoot = 0.55 * k; p.rHipR = 0.05;
    p.lHip = 1.45 * k; p.lKn = 1.95 * k + 0.05; p.lHipR = 0.18;
    p.lSh = -0.25; p.lShR = 1.25 * k + 0.2; p.lEl = 0.45; p.rSh = -0.25; p.rShR = 1.25 * k + 0.2; p.rEl = 0.45; p.lG = p.rG = 'fist';
    p.lean = 0.1; p.headPitch = 0.32 * k; p.mouth = fem ? 0.15 : 0.5 * k; p.ground = 0; p.air = 2; p.rFx = p.lFx = 0.4;
  } else if (a === 'hs3Spin') {
    // r7-fx3d 旋身甩火（「烈火强拳」起手）：半蹲拧身，双臂平着甩开（转身由招式转朝向），右拳领着一圈火
    const k = smooth01(at / 0.08);
    p.lHip = p.rHip = 0.55 * k; p.lKn = p.rKn = 0.75 * k; p.lHipR = p.rHipR = 0.18; p.rootY = -3.5 * k;
    p.twist = -0.55 * k; p.lean = 0.12;
    ik(p, -1, 1, [8, 8, 9], [0.7, 0, 0.7], [0, 1, 0], 'fist');
    ik(p, 1, 1, [9, 7, -3], [1, 0, -0.3], [0, 1, 0], 'fist');
    p.rFx = 1.2 * k; p.mouth = fem ? 0.1 : 0.4 * k;
  } else if (a === 'hs3Brace') {
    // r7-fx3d 弓步举拳蓄力（「烈火强拳」100.2–100.8）：左腿前弓、右腿后蹬直，身子前压；右拳高举在头侧往后拉（拳上一团火），左手前伸护着；越蓄越抖
    const k = smooth01(at / 0.12), sh = Math.sin(st.t * 47) * 0.025 * k;
    p.lHip = 1.05 * k; p.lKn = 1.15 * k; p.lFoot = -0.25 * k; p.rHip = -0.55 * k; p.rKn = 0.12; p.rFoot = 0.25 * k; p.lHipR = 0.1; p.rHipR = 0.12;
    p.rootY = -5 * k; p.lean = 0.3 * k + sh; p.twist = -0.42 * k + sh; p.side = sh;
    ik(p, -1, 1, [4.5, lerp(10, 20, k), lerp(4, -4, k)], [0, 0.4, -0.6], [-1, 0, 0], 'fist');
    ik(p, 1, 1, [1.5, 9, 12], [0, 0.2, 1], [1, 0, 0.2], 'claw');
    p.headPitch = 0.12 * k; p.mouth = fem ? 0.1 : 0.45 * k; p.rFx = 1.6 * k;
  } else if (a === 'hs3Cannon') {
    // r7-fx3d 弓步炮拳（「烈火强拳」101.2）：整个人往前扑成一条线，右拳直直打出去、左臂往后扯开，后腿蹬直
    const go = backOut(at / 0.08), k = Math.min(1, go);
    p.lHip = lerp(1.0, 1.2, k); p.lKn = lerp(1.1, 1.3, k); p.lFoot = -0.3; p.rHip = lerp(-0.5, -0.85, k); p.rKn = 0.05; p.rFoot = 0.4; p.lHipR = 0.1; p.rHipR = 0.12;
    p.rootY = -6; p.lean = lerp(0.3, 0.55, k); p.twist = lerp(-0.4, 0.5, k);
    ik(p, -1, 1, [-0.5, lerp(16, 12, k), lerp(-2, 30, k)], [0, 0, 1], [-1, 0, 0], 'fist');
    ik(p, 1, 1, [5, 9, -9], [0.3, -0.2, -1], [1, 0, 0], 'fist');
    p.headPitch = 0.05; p.mouth = fem ? 0.3 : 0.8 * k; p.rFx = 2 * k;
  } else if (a === 'hs3AirPunch') {
    // r7-fx3d 空中回身一拳（「强袭重击」17.67）：在半空蜷着腿拧身，右拳往前下方砸出去（带一圈火），左臂往后上甩
    const go = backOut(at / 0.1), k = Math.min(1, go);
    p.lHip = 1.3; p.lKn = 1.9; p.rHip = 0.9; p.rKn = 1.5; p.lFoot = p.rFoot = -0.3; p.lHipR = p.rHipR = 0.12;
    p.lean = lerp(-0.1, 0.45, k); p.twist = lerp(-0.6, 0.45, k);
    ik(p, -1, 1, [-0.5, lerp(14, 6, k), lerp(0, 26, k)], [0, -0.45, 0.9], [-1, 0, 0], 'fist');
    p.lSh = -0.9; p.lShR = 0.7; p.lEl = 0.4; p.lG = 'fist';
    p.headPitch = 0.3 * k; p.mouth = fem ? 0.2 : 0.7 * k; p.ground = 0; p.air = 4; p.rFx = 1.8 * k;
  } else {
    // 纵身：蜷膝起跳，右拳领着往上冲，左臂往后下甩
    const k = smooth01(at / 0.12);
    p.lHip = 1.1 * k; p.lKn = 1.9 * k + 0.05; p.rHip = 0.75 * k; p.rKn = 1.55 * k + 0.05; p.lFoot = p.rFoot = -0.35 * k; p.lHipR = p.rHipR = 0.1;
    ik(p, -1, 1, [-0.6, lerp(4, 19, k), 7], [0, 0.95, 0.3], [-1, 0, 0.1], 'fist');
    p.lSh = -0.55 * k; p.lShR = 0.4; p.lEl = 0.35; p.lG = 'fist';
    p.lean = -0.06; p.headPitch = -0.35 * k; p.ground = 0; p.air = 5 * k; p.rootY = 6 * k;
  }
}
// ================================================================ 撼山客招式第二批：连击、擒拿的姿势（只增不改，world/hsmoves2.ts 驱动）
// 躯干坐标（IK 目标）：x 以该手一侧为正、y 沿躯干朝头、z 朝胸前；四肢的 pitch 是世界的（不跟躯干转），所以躺倒、倒栽的姿势手用 IK、腿直接给角度。
// 躺着 / 倒栽的姿势 ground = 0（不按脚底贴地），骨盆高度由 rootY 定（站立时骨盆在 51）。
/** 冲刺腿（复用奔跑的腿，节奏按 st.t 走：'run' 以外的动作 st.phase 走得很慢） */
function hsSprintLegs(p: Pose, st: CharState, R: RLook, hz: number) {
  runPose(p, { phase: st.t * hz + st.seed, speed: 620 } as CharState, R);
}
function hsPose(p: Pose, st: CharState, R: RLook, D: Dims, a: HsAction) {
  const at = st.actionT, t = st.t, td = D.td;
  p.breath = Math.sin(t * 2.4) * 0.3;
  switch (a) {
    case 'hsDrag': {
      // 按头疾冲：起手 0.3 息深蹲、整条右臂往下一按（把对手的脸砸进地里）；之后前倾冲刺，右臂一直往前下方按着，左臂后掠
      const press = 1 - smooth01((at - 0.22) / 0.16), slam = backOut(at / 0.1);
      if (press > 0.01) {
        p.lean = lerp(0.55, 1.05, slam); p.headPitch = 0.35 * slam; p.twist = 0.25;
        p.lHip = 1.25; p.lKn = 1.9; p.rHip = -0.55; p.rKn = 0.9; p.rFoot = -0.3; p.lHipR = p.rHipR = 0.14;
        ik(p, -1, 1, [-1, lerp(6, -2, slam), lerp(14, 40, slam)], [0, -0.2, 1], [0, -1, 0.2], 'claw');
        p.lSh = -0.5; p.lShR = 0.7; p.lEl = 0.5; p.lG = 'fist';
        p.rFx = slam * (1 - smooth01((at - 0.12) / 0.2)); p.mouth = 0.7 * slam;
      }
      if (press < 0.99) {
        const q: Pose = neutral();
        hsSprintLegs(q, st, R, 15);
        q.lean = 1.0; q.headPitch = -0.45; q.twist = 0.12; q.side = 0.04 * Math.sin(t * 15);
        ik(q, -1, 1, [-1.5, -1, 40], [0, -0.25, 1], [0, -1, 0.2], 'claw');
        q.lSh = -1.05 + 0.18 * Math.sin(t * 15 + st.seed); q.lShR = 0.42; q.lEl = 0.35; q.lFr = -0.2; q.lG = 'open';
        q.mouth = 0.45; q.rFx = 0.6; q.ground = 1;
        if (press <= 0.01) Object.assign(p, q);
        else for (const k of POSE_KEYS) (p as any)[k] = (q as any)[k] + ((p as any)[k] - (q as any)[k]) * press;
      }
      break;
    }
    case 'hsDragged': {
      // 被按着拖行：脸朝下、身子斜着贴地，腿在后面拖、偶尔被颠起来；砸进地里的头 0.3 息身子弓起来（腿往上一翘）
      const arch = at < 0.32 ? Math.sin(Math.PI * at / 0.32) : 0;
      const bump = Math.max(0, Math.sin(t * 11 + st.seed)) * 0.18;
      p.ground = 0; p.rootY = -41 + 5 * arch; p.lean = 1.42 - 0.35 * arch; p.headPitch = 1.75 - 0.6 * arch; p.side = 0.08 * Math.sin(t * 7);
      p.lHip = -1.42 + 0.9 * arch + bump; p.rHip = -1.5 + 0.75 * arch + 0.6 * bump; p.lKn = 0.1 + 1.1 * arch + 0.5 * bump; p.rKn = 0.15 + 0.9 * arch;
      p.lHipR = 0.16; p.rHipR = 0.12; p.lFoot = p.rFoot = -0.6;
      ik(p, 1, 1, [9 + 3 * arch, -6 + 7 * Math.sin(t * 9 + 1), 5], [0.4, 0.2, 0.9], [0, 0, 1], 'claw');
      ik(p, -1, 1, [10, 10 + 6 * Math.cos(t * 8), 6], [0.2, 0.9, 0.3], [0, 0, 1], 'open');
      p.mouth = 0.7; p.eyes = 0;
      break;
    }
    case 'hsBarrage': {
      // 百裂：马步，两拳一秒二十来下交替打出（画面上是一片残拳），身子跟着左右扭
      const ph = t * 52, s = Math.sin(ph), kr = Math.max(0, s), kl = Math.max(0, -s);
      const j = Math.sin(Math.floor(ph / Math.PI) * 2.3) * 5;
      ik(p, -1, 1, [lerp(3.5, -1, kr), lerp(-3, 2 + j, kr), lerp(5, 27, kr)], [0, 0.05, 1], [-1, 0, 0.1], 'fist');
      ik(p, 1, 1, [lerp(3.5, -1, kl), lerp(-3, 2 - j, kl), lerp(5, 27, kl)], [0, 0.05, 1], [-1, 0, 0.1], 'fist');
      p.twist = 0.28 * (kr - kl); p.lean = 0.2; p.headPitch = -0.08;
      p.lHip = p.rHip = 0.3; p.lHipR = p.rHipR = 0.34; p.lKn = p.rKn = 0.8; p.lFoot = p.rFoot = 0.1;
      p.rFx = kr; p.lFx = kl; p.mouth = 0.65 + 0.2 * Math.sin(t * 9);
      break;
    }
    case 'hsPoke': {
      // 点穴：左手负在身后，右手剑指连点（高低错开），点完一下收回一下
      const ph = t * 30, k = Math.max(0, Math.sin(ph)), lv = Math.sin(Math.floor(ph / (2 * Math.PI)) * 1.7);
      ik(p, -1, 1, [lerp(3, -0.5 + lv * 2, k), lerp(-4, 4 + lv * 8, k), lerp(6, 25, k)], [0, 0.1, 1], [-1, 0, 0.1], 'sword');
      ik(p, 1, 1, [-1.7, -15.4, -(td + 2.7)], [-1, -0.3, -0.1], [0.1, 0.15, -1], 'fist');
      p.twist = 0.2 + 0.1 * k; p.lean = 0.14; p.headPitch = 0.04;
      p.lHip = 0.38; p.lKn = 0.42; p.rHip = -0.3; p.rKn = 0.2; p.rFoot = 0.15; p.lHipR = p.rHipR = 0.1;
      p.rFx = k * 0.8;
      break;
    }
    case 'hsKick': {
      // 踢天：撑地腿微屈，右腿从下往上一脚踢到头顶，身子后仰
      const go = backOut((at - 0.03) / 0.13), rec = smooth01((at - 0.26) / 0.2), k = go * (1 - rec * 0.7);
      p.rHip = lerp(-0.4, 2.55, k); p.rKn = lerp(1.0, 0.08, k); p.rFoot = -0.3; p.rHipR = 0.06;
      p.lHip = -0.12 * k; p.lKn = 0.3; p.lHipR = 0.08;
      p.lean = -0.4 * k; p.headPitch = -0.3 * k; p.twist = -0.15 * k;
      p.lSh = -0.55 * k; p.lShR = 0.75; p.lEl = 0.4; p.rSh = 0.5 * k; p.rShR = 0.7; p.rEl = 0.5; p.lG = p.rG = 'fist';
      p.mouth = 0.5 * k;
      break;
    }
    case 'hsHammer': {
      // 双拳砸落（悬在半空）：两拳举过头顶，整个人往前一折，两拳砸到身前下方；腿收在身下
      const wind = smooth01(at / 0.1), go = backOut((at - 0.1) / 0.12), rec = smooth01((at - 0.4) / 0.2), k = go * (1 - rec * 0.4);
      for (const side of [1, -1] as const) ik(p, side, 1, [lerp(lerp(2, 3, wind), 1, k), lerp(lerp(-2, 25, wind), -10, k), lerp(lerp(8, -3, wind), 20, k)], [0, lerp(1, -0.4, k), lerp(0, 0.9, k)], [-1, 0, 0], 'fist');
      p.lean = lerp(-0.25 * wind, 0.7, k); p.headPitch = lerp(-0.3 * wind, 0.3, k);
      p.ground = 0; p.lHip = 0.9; p.lKn = 1.7; p.rHip = 0.5; p.rKn = 1.4; p.lFoot = p.rFoot = -0.4;
      p.lFx = p.rFx = k * (1 - rec); p.mouth = 0.7 * k;
      break;
    }
    case 'hsHug': {
      // 抱摔：两臂从两侧把人箍在胸前，腿收起（跃起时）
      for (const side of [1, -1] as const) ik(p, side, 1, [-2.5, -2, 15], [-1, 0, 0.25], [0, 0, -1], 'fist');
      p.lean = 0.12; p.headPitch = 0.1;
      p.lHip = 0.55; p.lKn = 1.0; p.rHip = 0.2; p.rKn = 0.7; p.lFoot = p.rFoot = -0.3; p.mouth = 0.4;
      break;
    }
    case 'hsInvert': {
      // 被倒栽：头朝下，腿朝天乱蹬，两臂往下乱抓
      p.ground = 0; p.rootY = 0; p.lean = Math.PI - 0.2 + 0.08 * Math.sin(t * 6); p.headPitch = Math.PI - 0.25;
      p.lHip = Math.PI - 0.25 + 0.3 * Math.sin(t * 9); p.rHip = Math.PI + 0.25 + 0.3 * Math.cos(t * 8); p.lKn = 0.6 + 0.4 * Math.sin(t * 11); p.rKn = 0.3; p.lHipR = 0.25; p.rHipR = 0.3;
      ik(p, 1, 1, [10, 14 + 5 * Math.sin(t * 10), 4], [0.3, 0.9, 0], [0, 0, 1], 'open');
      ik(p, -1, 1, [11, 12 + 5 * Math.cos(t * 9), -2], [0.3, 0.9, 0], [0, 0, 1], 'claw');
      p.mouth = 0.85; p.eyes = 0;
      break;
    }
    case 'hsPlunge': {
      // 倒栽俯冲：整个人头朝下，两臂往下箍着对手，腿并拢朝天
      p.ground = 0; p.rootY = 0; p.lean = Math.PI - 0.18; p.headPitch = Math.PI - 0.5;
      p.lHip = Math.PI - 0.1; p.rHip = Math.PI + 0.12; p.lKn = 0.25; p.rKn = 0.4; p.lHipR = p.rHipR = 0.05; p.lFoot = p.rFoot = 0.4;
      for (const side of [1, -1] as const) ik(p, side, 1, [-1.5, 12, 13], [-0.8, 0.5, 0.2], [0, 0, -1], 'fist');
      p.mouth = 0.6;
      break;
    }
    case 'hsSwing': {
      // 抡人：两手攥着对手的脚踝伸在胸前，身子往后仰着压住离心力，两脚叉开碾着地转
      for (const side of [1, -1] as const) ik(p, side, 1, [0.5, 2 + 1.5 * Math.sin(t * 20), 24], [0, 0.1, 1], [-1, 0, 0], 'fist');
      p.lean = -0.26; p.headPitch = -0.12; p.twist = 0.1 * Math.sin(t * 14);
      p.lHip = 0.32; p.lHipR = 0.3; p.lKn = 0.5; p.rHip = -0.28; p.rHipR = 0.3; p.rKn = 0.35; p.rFoot = 0.2;
      p.mouth = 0.6;
      break;
    }
    case 'hsSwung': {
      // 被抡起：身子横着被甩直（头朝外，脚在他手里），两臂被甩到头前面
      p.ground = 0; p.rootY = -38; p.lean = Math.PI / 2 + 0.06 * Math.sin(t * 13); p.headPitch = 1.4; p.side = 0.1 * Math.sin(t * 7);
      p.lHip = p.rHip = -Math.PI / 2; p.lKn = p.rKn = 0.05; p.lHipR = 0.04; p.rHipR = 0.04; p.lFoot = p.rFoot = -1.2;
      ik(p, 1, 1, [7, 25, 2 + 4 * Math.sin(t * 15)], [0, 1, 0], [0, 0, 1], 'open');
      ik(p, -1, 1, [8, 24, -2 + 4 * Math.cos(t * 14)], [0, 1, 0], [0, 0, 1], 'open');
      p.mouth = 0.8; p.eyes = 0;
      break;
    }
    case 'hsLift': {
      // 举山：先沉身两手扣住，再挺身举过头顶
      const k = smooth01((at - 0.1) / 0.35);
      for (const side of [1, -1] as const) ik(p, side, 1, [lerp(8, 7, k), lerp(-16, 27, k), lerp(16, 3, k)], [0, lerp(-0.3, 1, k), lerp(1, 0.1, k)], [-1, 0, 0], 'open');
      p.lean = lerp(0.55, -0.12, k); p.headPitch = lerp(0.3, -0.2, k);
      p.lHip = lerp(1.0, 0.25, k); p.rHip = lerp(1.0, 0.25, k); p.lHipR = p.rHipR = 0.3; p.lKn = lerp(1.6, 0.4, k); p.rKn = lerp(1.6, 0.4, k);
      p.mouth = 0.6 * (1 - k) + 0.3;
      break;
    }
    case 'hsHurl': {
      // 掷山：从头顶后方往前一砸，弓步，身子跟着压下去
      const go = backOut((at - 0.06) / 0.14), rec = smooth01((at - 0.35) / 0.25), k = go * (1 - rec * 0.5);
      for (const side of [1, -1] as const) ik(p, side, 1, [lerp(6, 5, k), lerp(25, -2, k), lerp(-8, 26, k)], [0, lerp(1, 0.1, k), lerp(-0.3, 1, k)], [-1, 0, 0], 'open');
      p.lean = lerp(-0.3, 0.55, k); p.headPitch = lerp(-0.25, 0.15, k);
      p.lHip = 0.5 * k; p.lKn = 0.06 + 0.5 * k; p.rHip = -0.4 * k; p.rKn = 0.06 + 0.25 * k; p.rFoot = 0.2 * k; p.lHipR = p.rHipR = 0.1;
      p.mouth = 0.8 * k * (1 - rec); p.lFx = p.rFx = k * (1 - rec);
      break;
    }
  }
}

// ================================================================ r8-p2 撼山客第二阶段（赤阳罡、火焰腿法、两个觉醒大招）的姿势：只增不改，放在这一段（world/hsp2.ts 驱动）
// 照参考视频逐个关键帧摆（docs/撼山客-参考视频动作分解.md 第三、四、五节）：一招一个动作，整招的关键帧排成一张表，时刻和视频一一对应（游戏 1 秒 = 视频 1 秒）。
// r9：这张表在文件末尾转成 defineKeyTrack 的关键帧（和第一阶段同一套）：每个关键姿势在它的时刻到位（切进去只用最后零点零几息），
// 一直定到下一个关键帧；踢腿、冲拳那一下自动加拉长手脚、多重肢体、拖影帧，旋身加多重肢体。
// 姿势时间由招式每帧写（st.actionT = 招式自己的钟，命中顿帧时钟停住、姿势也停住）。合并时主线统一成一套卡帧 / 关键帧写法。
// 关键帧写法：'L=髋,膝[,外展] R=髋,膝[,外展] lean=前倾 tw=拧身 sd=侧倾 y=骨盆上下 air=腾空 g=贴地(1/0) hp=低头 m=张口 rf/lf=拳上的劲 lF/rF=脚背 rh=x,y,z lh=x,y,z（手的 IK 目标，躯干坐标：x 朝该手外侧、y 朝头、z 朝前）'
// 髋：0 腿直垂、1.57 往前平举、2.5 踢到头高、3 竖着一字马，负的往后；膝：0 直、1.5 弯成直角。
export type P2Action = 'p2Xuan' | 'p2Yan' | 'p2Sui' | 'p2Zhui' | 'p2Jie' | 'p2Ba' | 'p2Ri' | 'p2Gang';
export const P2_ACTION_SET = new Set<string>(['p2Xuan', 'p2Yan', 'p2Sui', 'p2Zhui', 'p2Jie', 'p2Ba', 'p2Ri', 'p2Gang']);
const P2_GUARD = 'L=.35,.45,.12 R=-.3,.2,.1 lean=.12 tw=-.25 y=-3 rh=-1,5,11 lh=1,2,8 hp=.05';
/** 每招的关键帧（时刻：秒，从出招算） */
const P2_KEYS: Record<P2Action, [number, string][]> = {
  // 赤焰回旋腿（视频 27.3–30.7）：背身半蹲 → 低身横扫甩出一道火弧 → 原地旋身两圈（火环）→ 往前一脚带火 → 第二段：前踢、腾空换腿踢、高踢、提膝、单腿高抬一字踢（火柱冲天）
  p2Xuan: [
    [0, P2_GUARD],
    [0.08, 'L=.75,1.15,.2 R=.45,1.05,.15 lean=.32 tw=-1.1 y=-8 rh=5,-6,6 lh=6,-8,4 hp=.1'],
    [0.2, 'L=1.05,1.7,.25 R=1.25,.1,.75 lean=.45 tw=-.3 sd=.15 y=-16 rh=14,4,2 lh=13,2,-2 rf=1 m=.5'],
    [0.37, 'L=.95,1.55,.25 R=1.3,.12,.8 lean=.4 tw=.4 sd=-.1 y=-15 rh=15,5,0 lh=15,5,0 rf=.8'],
    [0.53, 'L=1,1.6,.25 R=1.35,.1,.85 lean=.42 tw=1.1 y=-16 rh=15,6,-2 lh=15,4,2'],
    [0.7, 'L=.5,.7,.15 R=-.2,.3,.15 lean=.15 tw=.2 y=-6 rh=-1,5,10 lh=6,-2,6'],
    [0.87, 'L=.9,1.4,.25 R=1.1,.25,.6 lean=.35 tw=-.6 y=-12 rh=13,4,0 lh=13,3,0'],
    [1.03, 'L=.1,.25,.1 R=1.55,.06,.1 rF=.4 lean=-.32 tw=.35 y=0 rh=-1,6,11 lh=4,4,-6 rf=.6 m=.6'],
    [1.25, P2_GUARD],
    [1.55, 'L=.45,.55,.12 R=-.35,.25,.1 lean=.2 tw=-.35 y=-4 rh=-1,5,11 lh=1,2,8'],
    [1.72, 'L=.12,.2,.1 R=1.62,.05,.1 rF=.45 lean=-.38 tw=.4 rh=-1,6,10 lh=5,3,-7 m=.6'],
    [1.88, 'L=1.75,.08,.1 R=.9,1.5,.12 lF=.4 lean=-.42 tw=-.45 air=8 g=0 y=4 rh=1,6,9 lh=-1,5,11 m=.7'],
    [2.05, 'L=.4,.6,.12 R=.2,.7,.12 lean=.1 y=-5 rh=-1,5,11 lh=1,2,8'],
    [2.22, 'L=.08,.15,.08 R=2.35,.04,.12 rF=.5 lean=-.55 tw=.45 sd=.1 rh=-2,7,9 lh=6,2,-8 m=.7 rf=.5'],
    [2.38, 'L=.08,.15,.08 R=2.3,.06,.12 rF=.5 lean=-.52 tw=.45 sd=.1 rh=-2,7,9 lh=6,2,-8'],
    [2.55, 'L=.2,.35,.1 R=1.95,1.7,.12 lean=-.15 tw=.2 y=-2 rh=-1,6,11 lh=5,4,-4'],
    [2.72, 'L=-.1,.05,.06 R=2.85,.03,.1 rF=.6 lean=-.62 tw=.3 air=12 g=0 y=6 rh=-3,8,8 lh=8,6,-6 m=.8 rf=.6'],
    [2.88, 'L=-.05,.08,.06 R=2.6,.05,.1 lean=-.5 tw=.25 air=6 g=0 y=3 rh=-3,8,8 lh=8,6,-6'],
    [3.05, 'L=.4,.7,.12 R=.3,.6,.12 lean=.12 y=-6 rh=-1,5,11 lh=1,2,8'],
    [3.25, P2_GUARD],
  ],
  // 燕旋（视频 81.0–82.0）：冲刺 → 原地高速旋身（一腿横着甩开，像个陀螺，裹在飓风环里）→ 环往前撞上去炸开 → 站定
  p2Yan: [
    [0, P2_GUARD],
    [0.06, 'L=.9,1.3,.15 R=-.6,.35,.1 lean=.62 tw=-.2 y=-9 rh=4,-8,-8 lh=4,-8,-8 m=.4'],
    [0.17, 'L=.55,.9,.3 R=1.45,.08,.95 lean=.15 sd=.25 y=-8 rh=16,7,0 lh=15,9,0 rf=.6 lf=.6 m=.6'],
    [0.33, 'L=.5,.85,.3 R=1.5,.06,1 lean=.12 sd=.3 y=-8 rh=16,9,0 lh=16,8,0 rf=.8 lf=.8'],
    [0.5, 'L=.6,.95,.3 R=1.4,.1,.95 lean=.18 sd=.25 y=-9 rh=16,7,0 lh=16,7,0'],
    [0.62, 'L=.45,.6,.12 R=-.2,.3,.1 lean=.1 tw=-.3 y=-4 rh=-1,6,11 lh=2,3,9 m=.3'],
    [0.9, P2_GUARD],
  ],
  // 碎心踢（视频 83.7–85.0）：侧身 → 跳起旋踢（身后一道大风刃）→ 落地蹲 → 再蓄（提膝）→ 腾空侧踹（火轮撞上去）→ 收势
  p2Sui: [
    [0, P2_GUARD],
    [0.05, 'L=.5,.7,.12 R=-.1,.4,.1 lean=.2 tw=-.8 y=-6 rh=2,4,8 lh=4,0,4'],
    [0.17, 'L=.3,1.6,.15 R=2.2,.08,.3 rF=.4 lean=-.62 tw=-1.1 sd=-.2 air=10 g=0 y=6 rh=8,10,-6 lh=10,4,4 m=.7'],
    [0.33, 'L=1.1,1.7,.3 R=.6,1.3,.3 lean=.42 tw=.2 y=-16 rh=12,-4,6 lh=12,-6,2'],
    [0.5, 'L=.55,.8,.15 R=1.45,1.85,.1 lean=.05 tw=-.4 y=-6 rh=-1,6,11 lh=4,4,-4 m=.3'],
    [0.67, 'L=.4,1.2,.12 R=1.62,.03,.12 rF=.5 lean=-.58 tw=.55 sd=.1 air=10 g=0 y=6 rh=-1,7,10 lh=7,4,-8 m=.8 rf=.4'],
    [0.83, 'L=.3,1,.12 R=1.55,.06,.12 lean=-.5 tw=.5 air=4 g=0 rh=-1,7,10 lh=7,4,-8'],
    [1.0, 'L=.6,.9,.12 R=.1,.6,.12 lean=.18 y=-7 rh=-1,5,11 lh=1,2,8'],
    [1.25, P2_GUARD],
  ],
  // 坠火踢（视频 96.2–97.3）：起跳 → 竖着一脚往上踢成一字马（脚尖一团光核）→ 往下劈落、落地蹲（火柱从天贯下）→ 火爆里站着
  p2Zhui: [
    [0, P2_GUARD],
    [0.08, 'L=.7,1.2,.12 R=.5,1.1,.12 lean=.2 y=-10 rh=4,0,8 lh=5,-2,6'],
    [0.17, 'L=.3,.6,.1 R=.6,.9,.1 lean=-.1 air=14 g=0 y=6 rh=6,12,4 lh=8,10,2'],
    [0.33, 'L=-.25,.04,.06 R=3.05,.02,.06 rF=.6 lean=-.22 air=10 g=0 y=4 rh=12,8,0 lh=12,8,0 m=.7 rf=.5'],
    [0.5, 'L=1.2,1.6,.15 R=1.05,.2,.1 rF=.3 lean=.55 tw=.1 y=-15 rh=8,-6,10 lh=9,-4,4 m=.8'],
    [0.67, 'L=1.15,1.55,.15 R=1,.2,.1 lean=.5 y=-14 rh=8,-6,10 lh=9,-4,4'],
    [0.85, 'L=.6,.8,.12 R=.4,.5,.12 lean=.2 y=-6 rh=-1,5,11 lh=2,2,8'],
    [1.1, P2_GUARD],
  ],
  // 解放（视频 70.7–74.3）：双拳在胸前收拢 → 胸前光核 → 全身赤红、双拳往两边一撑 → 一人多高的火里往前走 → 前方火海、他冲过去
  p2Jie: [
    [0, P2_GUARD],
    [0.3, 'L=.4,.55,.15 R=.3,.5,.15 lean=.1 y=-5 rh=2,4,9 lh=2,4,9 hp=.15'],
    [0.6, 'L=.6,.8,.2 R=.5,.75,.2 lean=.22 y=-9 rh=1,6,7 lh=1,6,7 hp=.25 rf=1 lf=1 m=.3'],
    [1.0, 'L=.55,.75,.3 R=.45,.7,.3 lean=-.08 y=-8 rh=15,-6,4 lh=15,-6,4 hp=-.25 rf=1.4 lf=1.4 m=1'],
    [1.3, 'L=.4,.5,.15 R=-.2,.25,.12 lean=.15 tw=-.2 y=-4 rh=4,-4,8 lh=5,-6,6 rf=1 lf=1 m=.4'],
    [2.9, 'L=.45,.5,.15 R=-.25,.25,.12 lean=.25 tw=-.25 y=-5 rh=3,0,10 lh=5,-4,6 rf=1.2'],
    [3.0, 'L=1.05,1.1,.1 R=-.65,.1,.12 lean=.5 tw=.45 y=-7 rh=-.5,12,30 lh=5,9,-9 rf=2 m=.8'],
    [3.6, 'L=1,1.05,.1 R=-.6,.12,.12 lean=.45 tw=.4 y=-7 rh=-.5,12,28 lh=5,9,-9 rf=1'],
    [3.9, P2_GUARD],
  ],
  // 霸皇蹴（视频 103.0–106.75）：弓步蓄 → 闪步冲到对手身后 → 回身踏地（一排火柱）→ 踏着火柱往前 → 高踢火龙冲天 → 双拳下砸（整屏红、爆碎）→ 火爆 → 站定
  p2Ba: [
    [0, P2_GUARD],
    [0.25, 'L=1,1.05,.1 R=-.6,.12,.12 lean=.45 tw=-.4 y=-8 rh=3,2,10 lh=5,-2,4 rf=.6'],
    [0.5, 'L=.9,1.3,.15 R=-.8,.3,.1 lean=.75 tw=.3 y=-12 rh=-.5,10,28 lh=4,-6,-10 rf=1 m=.6'],
    [0.75, 'L=.5,.8,.15 R=.2,.6,.12 lean=.2 tw=-.9 y=-7 rh=6,0,6 lh=6,-2,4'],
    [1.0, 'L=.1,.15,.1 R=1.2,.25,.12 rF=-.2 lean=.15 tw=.2 y=-2 rh=8,2,6 lh=9,2,2 m=.5'],
    [1.12, 'L=.45,.7,.12 R=.6,1.1,.12 lean=.35 y=-9 rh=8,-4,8 lh=9,-4,4'],
    [1.25, 'L=.1,.2,.1 R=1.5,.1,.1 lean=-.2 tw=.3 rh=-1,6,10 lh=6,4,-6'],
    [1.5, 'L=.9,1.3,.15 R=-.5,.3,.12 lean=.55 tw=.1 y=-6 rh=4,-6,-8 lh=4,-6,-8'],
    [1.75, 'L=-.4,.3,.12 R=1,1.2,.12 lean=.5 tw=-.1 y=-4 rh=4,-6,-8 lh=4,-6,-8'],
    [2.0, 'L=-.05,.08,.06 R=2.75,.03,.1 rF=.6 lean=-.58 tw=.35 air=6 g=0 y=3 rh=-3,8,8 lh=9,6,-6 m=.9 rf=.6'],
    [2.25, 'L=.6,1.3,.12 R=.5,1.2,.12 lean=.35 air=10 g=0 y=4 rh=3,22,2 lh=3,22,2 m=.7'],
    [2.5, 'L=1,1.6,.2 R=.8,1.4,.2 lean=.85 y=-16 rh=2,-10,22 lh=2,-10,22 rf=1.5 lf=1.5 m=1'],
    [3.0, 'L=1,1.6,.2 R=.8,1.4,.2 lean=.82 y=-16 rh=2,-10,22 lh=2,-10,22 rf=1.2 lf=1.2'],
    [3.4, 'L=.55,.8,.15 R=.2,.6,.12 lean=.25 y=-7 rh=-1,5,11 lh=1,2,8'],
    [3.75, P2_GUARD],
  ],
  // 逐日（视频 126.5–136.8 压缩成四段，每段照视频的节奏）：甩手 → 胸前光核 → 压黑紫光；挥拳凤翼 → 冲拳穿环连打；黑底连打 → 大爆；拳头炸出赤日 → 回身上甩凤翼 → 收
  p2Ri: [
    [0, P2_GUARD],
    [0.12, 'L=.5,.6,.15 R=-.4,.2,.12 lean=.25 tw=.3 y=-5 rh=-1,8,26 lh=4,0,4 rf=1 m=.4'],
    [0.2, 'L=.5,.7,.2 R=.4,.65,.2 lean=.1 y=-7 rh=1,6,7 lh=1,6,7 rf=1.5 lf=1.5 hp=.2'],
    [0.5, 'L=.55,.75,.3 R=.45,.7,.3 lean=-.1 y=-8 rh=15,-4,4 lh=15,-4,4 hp=-.3 rf=1.6 lf=1.6 m=1'],
    [0.85, P2_GUARD],
    [1.0, 'L=.7,.9,.15 R=-.3,.2,.12 lean=.3 tw=-.9 y=-7 rh=8,10,-6 lh=6,-2,6 rf=1.5'],
    [1.25, 'L=1,1.05,.1 R=-.65,.1,.12 lean=.5 tw=.6 y=-7 rh=-.5,12,30 lh=5,9,-9 rf=2 m=.8'],
    [1.7, 'L=.9,1.3,.15 R=-.8,.3,.1 lean=.75 tw=.3 y=-12 rh=-.5,10,28 lh=4,-6,-10 rf=1.5 m=.6'],
    [2.0, 'L=1.05,1.1,.1 R=-.65,.1,.12 lean=.5 tw=-.5 y=-7 rh=5,9,-9 lh=-.5,12,30 lf=2'],
    [2.2, 'L=.12,.2,.1 R=1.62,.05,.1 rF=.45 lean=-.38 tw=.4 rh=-1,6,10 lh=5,3,-7'],
    [2.4, 'L=1.05,1.1,.1 R=-.65,.1,.12 lean=.5 tw=.5 y=-7 rh=-.5,12,30 lh=5,9,-9 rf=2'],
    [2.9, 'L=.55,.8,.15 R=.25,.6,.12 lean=.2 y=-8 rh=4,-6,8 lh=5,-6,6 rf=1 lf=1'],
    [3.2, 'L=1.05,1.1,.1 R=-.65,.1,.12 lean=.5 tw=.5 y=-7 rh=-.5,12,30 lh=5,9,-9 rf=2'],
    [3.4, 'L=1,1.05,.1 R=-.6,.1,.12 lean=.45 tw=-.5 y=-7 rh=5,9,-9 lh=-.5,12,30 lf=2'],
    [3.6, 'L=1.05,1.1,.1 R=-.65,.1,.12 lean=.55 tw=.6 y=-8 rh=-.5,12,30 lh=5,9,-9 rf=2.2 m=1'],
    [4.4, P2_GUARD],
    [4.8, 'L=1.05,1.1,.1 R=-.65,.1,.12 lean=.5 tw=.5 y=-8 rh=-.5,13,30 lh=5,9,-9 rf=2.5 m=1'],
    [5.7, 'L=1,1.05,.1 R=-.6,.12,.12 lean=.45 tw=.45 y=-7 rh=-.5,12,28 lh=5,9,-9 rf=2'],
    [6.2, 'L=.7,1,.15 R=-.2,.3,.12 lean=.1 tw=-1 y=-8 rh=10,-8,4 lh=6,-2,6 rf=1.5'],
    [6.45, 'L=.3,.4,.12 R=-.4,.2,.12 lean=-.3 tw=.6 y=0 rh=8,24,4 lh=6,0,6 rf=2 m=.8'],
    [7.2, P2_GUARD],
  ],
  // 赤阳罡（玩家开燃身）：沉身一握拳、往两边一撑
  p2Gang: [
    [0, P2_GUARD],
    [0.15, 'L=.6,.8,.2 R=.5,.75,.2 lean=.22 y=-9 rh=1,6,7 lh=1,6,7 hp=.25 rf=1 lf=1'],
    [0.4, 'L=.55,.75,.3 R=.45,.7,.3 lean=-.08 y=-8 rh=15,-6,4 lh=15,-6,4 hp=-.25 rf=1.4 lf=1.4 m=1'],
    [0.7, P2_GUARD],
  ],
};
type P2Pose = Record<string, number>;
const P2_FIELD: Record<string, string[]> = {
  L: ['lHip', 'lKn', 'lHipR'], R: ['rHip', 'rKn', 'rHipR'], rh: ['rhx', 'rhy', 'rhz'], lh: ['lhx', 'lhy', 'lhz'],
  lean: ['lean'], tw: ['twist'], sd: ['side'], y: ['rootY'], air: ['air'], g: ['ground'], hp: ['headPitch'], m: ['mouth'], rf: ['rFx'], lf: ['lFx'], lF: ['lFoot'], rF: ['rFoot'],
};
const P2_ZERO: P2Pose = { lHip: 0, lKn: 0.05, lHipR: 0.04, rHip: 0, rKn: 0.05, rHipR: 0.04, lean: 0.02, twist: 0, side: 0, rootY: 0, air: 0, ground: 1, headPitch: 0, mouth: 0, rFx: 0, lFx: 0, lFoot: 0, rFoot: 0, rhx: -1, rhy: 5, rhz: 11, lhx: 1, lhy: 2, lhz: 8 };
/** 每个关键帧只写变了的，别的字段沿用上一帧——拳上的劲、张口、脚背、腾空、侧倾、贴地这几样不沿用（每帧不写就回到默认） */
const P2_TRANSIENT = ['mouth', 'rFx', 'lFx', 'lFoot', 'rFoot', 'air', 'side', 'ground'];
const P2_TABLE = new Map<P2Action, { t: number; p: P2Pose }[]>();
function p2Table(a: P2Action) {
  let T = P2_TABLE.get(a);
  if (T) return T;
  T = [];
  let prev: P2Pose = { ...P2_ZERO };
  for (const [t, s] of P2_KEYS[a]) {
    const p: P2Pose = { ...prev };
    for (const k of P2_TRANSIENT) p[k] = P2_ZERO[k];
    for (const tok of s.split(/\s+/)) {
      if (!tok) continue;
      const [k, v] = tok.split('='), f = P2_FIELD[k]; if (!f || v === undefined) continue;
      v.split(',').forEach((x, i) => { if (f[i] !== undefined && x !== '') p[f[i]] = Number(x); });
    }
    T.push({ t, p }); prev = p;
  }
  P2_TABLE.set(a, T);
  return T;
}
// r9：第二阶段原来自己的一套插值（p2At「前四成切过去再定住」）和 p2Pose 删掉了——上面这张表在文件末尾转成 defineKeyTrack 的关键帧，
// 和第一阶段同一套（卡帧、拉长手脚、多重肢体、拖影帧都用得上）。以后新招只用 defineKeyTrack。
// ================================================================ 关键帧动作（r8-p1 起；通用：以后的招也可以 defineKeyTrack 挂进来）
// 照 3D 格斗 / 动作游戏（罪恶装备 Xrd、街霸 6）和《蜘蛛侠：纵横宇宙》的做法：
//   · 卡帧（stepped）：姿势按关键帧跳着走，关键帧之间默认不插值——每个关键姿势停到下一个关键帧（照视频的帧时间填），
//     起手 → 出手 → 命中那几下「啪」地切过去；个别要缓的段落给 tw（这一段末尾用多少秒缓进下一个关键帧）；
//     起手也不和上一个动作补帧（snapIn），收招回站姿时才走人物原有的 0.16 息过渡。
//   · 拉长手脚：lArmS / rArmS / lLegS / rLegS（骨长倍数）、lHandS / rHandS（拳头大小）——出手那一两帧放大，下一个关键帧弹回。
//   · 多重肢体（multiples）：关键帧带 mult = n 时，切到它之后的 0.1 息里，在身子后面沿上一帧 → 这一帧的挥动弧线多画 n 份半透明的自己
//     （躯干和本体重合被盖住，露出来的就是一串拳 / 腿），越靠前越淡。
//   · 拖影帧（smear）：关键帧带 smear = ['rL'] 这类时，切到它之后的 0.08 息里，把那条肢体从上一帧扫到这一帧的那片面积画成一条半透明的拖影带。
//   · 顿帧：命中时出手的人和被打的人一起停住（近战的 freezeT / 世界的 hitStop：actionT 不走，姿势就定在那一帧），之后直接切收招的关键帧。
// 关键帧的 IK 目标（L / R）用躯干坐标（x 以该手一侧为正、y 沿躯干朝头、z 朝胸前），null = 这只手改用肩肘角度（lSh / lEl…）。
// 只看 st.action / st.actionT / st.t（画人线程也拿得到），不碰随机数。
type KeyVal = number | T3 | null | string | undefined;
/** 一个关键帧的姿势（只写要改的；没写的沿用上一个关键帧） */
export type KeySpec = { [k: string]: KeyVal } & { L?: T3 | null; R?: T3 | null; LA?: T3; RA?: T3; LN?: T3; RN?: T3; lG?: Gesture; rG?: Gesture; shake?: number };
export interface KeyDef { t: number; k: KeySpec; /** 末尾用多少秒缓进这一帧（0 = 卡帧：到点直接切） */ tw?: number; /** 多重肢体：多画几份 */ mult?: number; /** 拖影帧：哪几条肢体 */ smear?: ('lA' | 'rA' | 'lL' | 'rL')[] }
interface KeyTrack { keys: KeyDef[]; spec: KeySpec[]; snapIn: boolean; smearCol: string }
const KEY_TRACKS = new Map<Action, KeyTrack>();
const KEY_NUM = new Set<string>(POSE_KEYS.filter((k) => !/^[lr](IK|T[xyz]|A[xyz]|N[xyz])$/.test(k)));
const MULT_DUR = 0.1, SMEAR_DUR = 0.085;
const FIST_AIM: T3 = [0, 0.05, 1], FIST_PALM: T3 = [-1, 0, 0.1];
/** 挂一条关键帧动作（同一个动作再挂就覆盖）。base：第一个关键帧之前的底子 */
export function defineKeyTrack(a: Action, keys: KeyDef[], o: { base?: KeySpec; snapIn?: boolean; smearCol?: string } = {}) {
  const ks = keys.slice().sort((x, y) => x.t - y.t), spec: KeySpec[] = [];
  let cur: KeySpec = { ...(o.base ?? {}) };
  for (const k of ks) { cur = { ...cur, ...k.k }; if (!('shake' in k.k)) cur.shake = 0; spec.push(cur); }
  KEY_TRACKS.set(a, { keys: ks, spec, snapIn: o.snapIn ?? true, smearCol: o.smearCol ?? '235,246,255' });
}
/** 这个动作是不是关键帧动作 */
export function isKeyTrack(a: Action): boolean { return KEY_TRACKS.has(a); }
function keyIdx(tr: KeyTrack, at: number): number { let i = 0; while (i + 1 < tr.keys.length && tr.keys[i + 1].t <= at) i++; return i; }
function keyApply(p: Pose, s: KeySpec, t: number) {
  for (const k in s) { const v = s[k]; if (typeof v === 'number' && KEY_NUM.has(k)) (p as unknown as Record<string, number>)[k] = v; }
  if (s.lG) p.lG = s.lG; if (s.rG) p.rG = s.rG;
  if (s.L) ik(p, 1, 1, s.L, s.LA ?? FIST_AIM, s.LN ?? FIST_PALM, s.lG ?? 'fist');
  if (s.R) ik(p, -1, 1, s.R, s.RA ?? FIST_AIM, s.RN ?? FIST_PALM, s.rG ?? 'fist');
  const sh = s.shake ?? 0;
  if (sh > 0) { p.rootX += sh * 1.1 * Math.sin(t * 53); p.lean += sh * 0.025 * Math.sin(t * 47 + 1); p.twist += sh * 0.03 * Math.sin(t * 41 + 2); }
}
function keyLerp(p: Pose, a: KeySpec, b: KeySpec, e: number, t: number) {
  const pa = neutral(), pb = neutral();
  keyApply(pa, a, t); keyApply(pb, b, t);
  Object.assign(p, blendPose(pa, pb, e));
}
/** 关键帧动作的姿势（poseFor 分发进来） */
function trackPose(p: Pose, st: CharState, a: Action) {
  const tr = KEY_TRACKS.get(a)!, at = st.actionT, i = keyIdx(tr, at), j = i + 1;
  p.breath = 0;
  if (j < tr.keys.length) {
    const tw = tr.keys[j].tw ?? 0, t0 = tr.keys[j].t - tw;
    if (tw > 0 && at > t0) { keyLerp(p, tr.spec[i], tr.spec[j], smooth01((at - t0) / tw), st.t); return; }
  }
  keyApply(p, tr.spec[i], st.t);
}
function keyPoseAt(tr: KeyTrack, i: number, t: number): Pose { const p = neutral(); p.breath = 0; keyApply(p, tr.spec[i], t); return p; }
/**
 * 多重肢体、拖影帧：画在本体之前（也就是身子后面）。多重肢体 = 沿上一关键帧 → 这一关键帧的弧线多画几份半透明的自己；
 * 拖影帧 = 那条肢体从上一帧扫到这一帧的那片面积，画成一条由淡到亮的半透明带
 */
function drawKeyFx(ctx: CanvasRenderingContext2D, look: Look, st: CharState, scale: number, R: RLook, opts: DrawOpts) {
  const tr = KEY_TRACKS.get(st.action); if (!tr) return;
  const at = st.actionT, i = keyIdx(tr, at); if (i === 0) return;
  const K = tr.keys[i], dk = at - K.t;
  const mult = K.mult && dk < MULT_DUR ? K.mult : 0, smear = K.smear && dk < SMEAR_DUR ? K.smear : null;
  if (!mult && !smear) return;
  const A = keyPoseAt(tr, i - 1, st.t), B = keyPoseAt(tr, i, st.t);
  if (smear) {
    const sa = solve(A, look, R), sb = solve(B, look, R), S = scale * look.height, cy = Math.cos(st.yaw), sy = Math.sin(st.yaw), bx = st.x, by = st.y - st.lift;
    const P = (q: V3) => ({ x: bx + (q.x * cy + q.z * sy) * S, y: by + (-q.y * CP + (-q.x * sy + q.z * cy) * SP) * S });
    const fade = 1 - dk / SMEAR_DUR;
    ctx.save();
    for (const lb of smear) {
      const chain = (s: Skel): V3[] => lb === 'lA' ? [s.lSh, s.lEl, s.lWr, add(s.lWr, s.lH.a, PALM_L * 1.1)] : lb === 'rA' ? [s.rSh, s.rEl, s.rWr, add(s.rWr, s.rH.a, PALM_L * 1.1)]
        : lb === 'lL' ? [s.lHip, s.lKn, s.lAn, s.lToe] : [s.rHip, s.rKn, s.rAn, s.rToe];
      const ca = chain(sa).map(P), cb = chain(sb).map(P);
      // 外端（拳 / 脚）扫过的那片：上一帧的 肘→拳 和这一帧的 拳→肘 围成一片，再加一条从上一帧拳到这一帧拳的宽带
      const g0 = ctx.createLinearGradient(ca[3].x, ca[3].y, cb[3].x, cb[3].y);
      g0.addColorStop(0, rgbaS(tr.smearCol, 0)); g0.addColorStop(0.55, rgbaS(tr.smearCol, 0.16 * fade)); g0.addColorStop(1, rgbaS('255,255,255', 0.45 * fade));   // r9：淡一半（推近后一大片扇形的平涂盖过人）
      ctx.fillStyle = g0;
      ctx.beginPath(); ctx.moveTo(ca[1].x, ca[1].y); ctx.lineTo(ca[2].x, ca[2].y); ctx.lineTo(ca[3].x, ca[3].y);
      ctx.lineTo(cb[3].x, cb[3].y); ctx.lineTo(cb[2].x, cb[2].y); ctx.lineTo(cb[1].x, cb[1].y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = g0; ctx.lineCap = 'round'; ctx.lineWidth = 7 * S;
      ctx.beginPath(); ctx.moveTo(ca[3].x, ca[3].y); ctx.quadraticCurveTo((ca[2].x + cb[3].x) / 2, (ca[2].y + cb[3].y) / 2, cb[3].x, cb[3].y); ctx.stroke();
    }
    ctx.restore();
  }
  if (mult) {
    const fade = 1 - dk / MULT_DUR;
    for (let j = 1; j <= mult; j++) {
      const u = j / (mult + 1);
      ctx.save(); ctx.globalAlpha *= (0.12 + 0.34 * u) * fade;
      drawCharacter(ctx, look, st, scale, 0, { ...opts, pose: blendPose(A, B, u), ghost: true });
      ctx.restore();
    }
    // r9：多出来的几份染成亮的残影色（原来是本人原色的半透明，深色裤子、皮肤叠在亮草地上是一块块灰黑的板子；视频里是亮的残影）。
    // 只刷人身上那一截（脚底往上），不碰地上的影子；这时本体还没画，刷不到本人
    const S2 = scale * look.height, by = st.y - st.lift;
    ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.globalAlpha = 0.78; ctx.fillStyle = `rgb(${tr.smearCol})`;
    ctx.fillRect(st.x - 1.3 * S2, by - 1.6 * S2, 2.6 * S2, 1.55 * S2);
    ctx.restore();
  }
}
const rgbaS = (c: string, a: number) => `rgba(${c},${a.toFixed(3)})`;
/** 关键帧动作里某一帧的时刻（招式按这个对时：命中那一下、收招） */
export function keyTime(a: Action, i: number): number { return KEY_TRACKS.get(a)?.keys[i]?.t ?? 0; }

// ---------------------------------------------------------------- 撼山客第一阶段：照参考视频（DNF 男散打）逐帧摆的关键帧
// 帧时间照抄视频（游戏 1 秒 = 视频 1 秒），注释里是对应的视频时刻。人朝 +z，左脚在前（正架），右手是重拳。
const G_: KeySpec = {   // 架势（视频 4.27）：两脚岔开、微屈膝，两拳护在胸前
  lHip: 0.38, lKn: 0.4, rHip: -0.32, rKn: 0.22, rFoot: 0.15, lHipR: 0.12, rHipR: 0.12, lFoot: 0, rootY: -2.5, rootX: 0, rootZ: 0,
  lean: 0.1, side: 0, twist: -0.2, air: 0, ground: 1, headPitch: 0.05, headYaw: 0, mouth: 0, lFx: 0, rFx: 0,
  L: [-0.5, 2.6, 14.5], R: [-0.9, 3.4, 12], lG: 'fist', rG: 'fist', LA: FIST_AIM, RA: FIST_AIM, LN: FIST_PALM, RN: FIST_PALM,
  lArmS: 1, rArmS: 1, lLegS: 1, rLegS: 1, lHandS: 1, rHandS: 1,
  lSh: 0.05, lShR: 0.11, lEl: 0.26, lFr: 0.06, rSh: 0.05, rShR: 0.11, rEl: 0.26, rFr: 0.06,
};
/** 右拳往「世界的正前方」打出去 L 远（IK 目标是躯干坐标：身子拧了 tw，目标要往外侧补回来，不然拳头跟着躯干拧到镜头里去了） */
const fwdR = (L: number, y: number, tw: number, x = 0): T3 => [x + L * Math.sin(tw), y, L * Math.cos(tw)];
const aimR = (tw: number, up = 0.05): T3 => [Math.sin(tw), up, Math.cos(tw)];
const STAND: KeySpec = { ...G_, lHip: 0.12, lKn: 0.1, rHip: -0.1, rKn: 0.08, rFoot: 0, rootY: -0.5, lean: 0.04, twist: -0.1, L: [0.8, -9, 6], R: [0.8, -9, 5] };
/** 招式对时用的关键帧时刻（hsmoves*.ts 读） */
export const P1T = {
  cross: { hit: 0.42, end: 0.8 },
  armor: { set: 0.3 },
  duanmai: { cock: 0.07, hit: 0.53, end: 1.0 },
  elbow: { hit: 0.13, end: 0.5 },
  kao: { hit: 0.3, end: 0.75 },
  dash: { arrive: 0.07, end: 0.3 },
  jab: { hit: 0.04, end: 0.22 },
  upper: { hit: 0.05, end: 0.26 },
  highKick: { hit: 0.05, end: 0.36 },
  sideKick: { hit: 0.05, end: 0.32 },
  sweep: { hit: 0.04, end: 0.3 },
  jumpKick: { hit: 0.07, end: 0.42 },
  knee: { hit: 0.13, fin: 0.47, end: 0.75 },
  flyKick: { hit: 0.05, end: 0.3 },
} as const;
defineKeyTrack('p1Guard', [{ t: 0, k: G_ }]);
// 一寸崩 ← 强拳（视频 4.27 架势 → 4.34 一帧切到直拳伸满 → 4.47 收 → 4.6 回架势）。贴身先「停半拍」：拳收到腰、身子拧回去、发着抖
defineKeyTrack('p1Cross', [
  { t: 0, k: G_ },
  { t: 0.06, k: { twist: -0.48, R: [3.4, -5.5, 2], L: [-0.4, 3.2, 17], LN: [-0.2, 0, 1], lG: 'palm', lean: 0.04, rootY: -4.8, lHip: 0.5, lKn: 0.6, rHip: -0.42, rKn: 0.38, headPitch: 0.1, shake: 0.5 } },
  { t: 0.24, k: { shake: 0.9, lFx: 0, rFx: 0.5 } },
  { t: P1T.cross.hit, k: { twist: 0.66, lean: 0.3, side: -0.05, R: fwdR(38, 2.6, 0.66, -1.6), RA: aimR(0.66), rArmS: 1.38, rHandS: 1.4, L: [1.6, 0.5, 7], LN: FIST_PALM, lG: 'fist', lHip: 0.62, lKn: 0.72, rHip: -0.62, rKn: 0.02, rFoot: 0.38, rootY: -5.5, rootZ: 3, rFx: 1.6, mouth: 0.75, headPitch: -0.04 }, mult: 3, smear: ['rA'] },
  { t: 0.5, k: { rArmS: 1.12, rHandS: 1.15, rFx: 1.0 } },
  { t: 0.58, k: { rArmS: 1.0, rHandS: 1.0, R: fwdR(30, 2.6, 0.66, -1.4), rFx: 0.4 } },
  { t: 0.66, k: { ...G_, twist: 0.05, rootY: -3 } },
  { t: P1T.cross.end, k: G_, tw: 0.1 },
], { base: G_ });
// 金刚不坏 ← 霸体护甲（视频 7.6 右拳前举的架势 → 8.0 两拳垂在身侧攥紧、挺胸，头顶一团白光、全身一圈亮边）
defineKeyTrack('p1Armor', [
  { t: 0, k: G_ },
  { t: 0.1, k: { R: [-0.6, 1.6, 17], L: [3.2, -6, 3], twist: 0.18, lean: 0.06, rootY: -3.5, lHip: 0.32, rHip: -0.28 } },
  { t: P1T.armor.set, k: { L: null, R: null, lSh: 0.12, lShR: 0.38, lEl: 0.32, rSh: 0.12, rShR: 0.38, rEl: 0.32, lFr: 0, rFr: 0, lG: 'fist', rG: 'fist', lSup: 0.4, rSup: 0.4,
    twist: 0, lean: -0.06, headPitch: -0.12, rootY: -2, lHip: 0.22, rHip: -0.18, lKn: 0.25, rKn: 0.2, lHipR: 0.2, rHipR: 0.2, mouth: 0.55, lFx: 0.6, rFx: 0.6, shake: 0.35 } },
], { base: G_ });
// 断脉腿 ← 碎骨（11.87 架势 → 11.94 伏身、后腿往后上提（脚跟蓄劲，脚下炸星）→ 12.40 一帧切：身子后仰成一条斜线、后腿蹬直斜踹对手膝下 → 12.67 收回站定）
defineKeyTrack('p1Duanmai', [
  { t: 0, k: G_ },
  { t: P1T.duanmai.cock, k: { lean: 0.58, rootY: -9, lHip: 0.78, lKn: 1.3, lHipR: 0.16, rHip: -1.05, rKn: 2.05, rFoot: -0.45, rHipR: 0.1, L: [0, 2.2, 13], R: [0.6, 3, 10], headPitch: -0.28, twist: -0.18, shake: 0.35 } },
  { t: 0.3, k: { shake: 0.7, rKn: 2.15, rootY: -10 } },
  { t: P1T.duanmai.hit, k: { lean: -0.88, twist: -0.6, side: 0.1, rHip: 1.15, rKn: 0.02, rFoot: 0.6, rHipR: 0.06, rLegS: 1.38, lHip: 0.12, lKn: 0.6, lHipR: 0.08, rootY: -6,
    L: null, R: null, lSh: -0.95, lShR: 0.6, lEl: 0.55, rSh: -0.75, rShR: 0.75, rEl: 0.65, lG: 'fist', rG: 'fist', headPitch: 0.28, mouth: 0.85 }, mult: 3, smear: ['rL'] },
  { t: 0.6, k: { rLegS: 1.14 } },
  { t: 0.67, k: { rLegS: 1.0, rHip: 0.95, lean: -0.7 } },
  { t: 0.76, k: { ...STAND, lean: 0.0, rHip: -0.15, rKn: 0.35 } },
  { t: 0.88, k: G_, tw: 0.08 },
], { base: G_ });
// 后发先至 ← 肘击（13.74 侧身站 → 13.87 提膝、右拳举到脑后 → 14.0 一帧切：大弓步前冲、右肘端平撞出、左臂往后甩 → 14.14 定住 → 14.2 收回站姿）
defineKeyTrack('p1Elbow', [
  { t: 0, k: { ...STAND, twist: -0.4 } },
  { t: 0.06, k: { lHip: 1.15, lKn: 1.75, lFoot: 0.3, rHip: -0.08, rKn: 0.18, lean: -0.12, twist: -0.8, R: [3.6, 9.5, -3], RA: [0, 1, 0], L: [-0.5, 0.5, 14], rootY: -1, headPitch: 0.05 } },
  { t: P1T.elbow.hit, k: { lHip: 0.98, lKn: 1.02, rHip: -0.88, rKn: 0.02, rFoot: 0.38, lHipR: 0.14, rHipR: 0.12, lFoot: 0, rootY: -10, lean: 0.18, twist: 0.78,
    R: null, rSh: 1.5, rShR: 0.4, rEl: 2.4, rFr: 0.1, rSup: 0.3, rG: 'fist', L: null, lSh: -1.15, lShR: 0.55, lEl: 0.2, lG: 'open', rArmS: 1.28, rFx: 1.4, mouth: 0.7, headPitch: -0.05 }, mult: 2, smear: ['rA'] },
  { t: 0.2, k: { rArmS: 1.1 } },
  { t: 0.28, k: { rArmS: 1.0, rFx: 0.4 } },
  { t: 0.4, k: { ...STAND, twist: -0.2 }, tw: 0.1 },
  { t: P1T.elbow.end, k: G_, tw: 0.08 },
], { base: STAND });
// 撞山靠 ← 铁山靠（15.4 转身 → 15.5 侧身沉成马步、左肩对着对手（身上一圈黄亮边、再一圈红）→ 15.7 一帧切：整个人往前一撞，左肩背撞出 → 16.0 站起）
defineKeyTrack('p1Kao', [
  { t: 0, k: G_ },
  { t: 0.1, k: { twist: -1.15, lean: 0.12, side: 0.15, lHip: 0.55, lKn: 1.05, rHip: -0.25, rKn: 1.0, lHipR: 0.38, rHipR: 0.38, rootY: -11,
    L: null, lSh: 0.25, lShR: 0.25, lEl: 0.6, lG: 'fist', R: [1.5, 5, 7], headPitch: 0.12, shake: 0.4 } },
  { t: 0.22, k: { shake: 0.8, rootY: -12 } },
  { t: P1T.kao.hit, k: { lean: 0.3, side: 0.38, twist: -1.28, lHip: 1.02, lKn: 1.08, rHip: -0.98, rKn: 0.02, rFoot: 0.42, rootY: -13, rootZ: 6, lSh: 0.55, lShR: 0.5, lEl: 0.95, R: [2, 2, 3], mouth: 0.85, headPitch: 0.05 }, mult: 2 },
  { t: 0.42, k: { rootZ: 3 } },
  { t: 0.54, k: { ...STAND, twist: -0.5 }, tw: 0.1 },
  { t: P1T.kao.end - 0.05, k: G_, tw: 0.1 },
], { base: G_ });
// 闪步（21.7 伏身蹬地、前膝高抬 → 21.9 人已在落点：提膝独立、两拳护胸 → 22.3 站定）
defineKeyTrack('p1Dash', [
  { t: 0, k: { ...G_, lean: 0.45, rootY: -6, lHip: 1.1, lKn: 1.7, rHip: -0.35, rKn: 0.6, rFoot: -0.3, L: [0, 3, 11], R: [0.5, 2.5, 9], headPitch: -0.2, twist: -0.15 } },
  { t: P1T.dash.arrive, k: { ...G_, lHip: 1.38, lKn: 1.8, lFoot: 0.35, rHip: -0.05, rKn: 0.12, rFoot: 0, lean: -0.08, twist: -0.28, rootY: 0, L: [-0.2, 4, 11], R: [-0.5, 3, 8], headPitch: 0.05 } },
  { t: 0.22, k: G_, tw: 0.1 },
], { base: G_ });
// 直拳（闪击快打的第一、二下；缩地回身那一拳）：一帧伸满，拳头放大，收回
defineKeyTrack('p1Jab', [
  { t: 0, k: { ...G_, twist: -0.35, R: [1.5, 0, 6] } },
  { t: P1T.jab.hit, k: { ...G_, R: fwdR(36, 2.6, 0.52, -1.6), RA: aimR(0.52), rArmS: 1.32, rHandS: 1.3, twist: 0.52, lean: 0.24, rHip: -0.55, rKn: 0.04, rFoot: 0.32, lHip: 0.52, lKn: 0.58, L: [1.5, 1, 8], rFx: 1.2, rootZ: 2, mouth: 0.5 }, mult: 2, smear: ['rA'] },
  { t: 0.1, k: { rArmS: 1.1, rHandS: 1.1, rFx: 0.6 } },
  { t: 0.15, k: { ...G_, twist: 0.1 } },
  { t: P1T.jab.end, k: G_, tw: 0.05 },
], { base: G_ });
// 勾拳（23.95：拧身、右拳带一抹红光往上勾）
defineKeyTrack('p1Upper', [
  { t: 0, k: { ...G_, twist: -0.35, R: [3, -7, 5], lean: 0.22, rootY: -6, lKn: 0.7, rKn: 0.5 } },
  { t: P1T.upper.hit, k: { ...G_, R: fwdR(12, 16, 0.58, -0.8), RA: [Math.sin(0.58) * 0.2, 1, Math.cos(0.58) * 0.2], rArmS: 1.28, rHandS: 1.3, twist: 0.58, lean: -0.16, headPitch: -0.3, rootY: 0, rHip: -0.25, rKn: 0.05, lHip: 0.3, lKn: 0.22, air: 3, L: [1.5, 0, 8], rFx: 1.4 }, mult: 2, smear: ['rA'] },
  { t: 0.12, k: { rArmS: 1.08, rHandS: 1.1 } },
  { t: 0.18, k: { ...G_, twist: 0.2 } },
  { t: P1T.upper.end, k: G_, tw: 0.06 },
], { base: G_ });
/** 侧踢的出脚（h：腿抬多高，弧度；lean：身子后仰多少） */
const kickOut = (h: number, lean: number): KeySpec => ({ rHip: h, rKn: 0.0, rFoot: 0.6, rHipR: 0.08, rLegS: 1.34, lean, twist: -0.7, side: -0.14, lHip: -0.05, lKn: 0.16, lHipR: 0.1,
  L: [1, 3, 7], R: null, rSh: -0.6, rShR: 0.55, rEl: 0.65, rG: 'fist', headPitch: 0.15, mouth: 0.6, rootY: -1 });
const kickChamber = (h: number): KeySpec => ({ ...G_, rHip: h, rKn: 2.25, rFoot: -0.2, lean: -0.22, twist: -0.5, lHip: -0.02, lKn: 0.2, L: [0, 3, 10], R: [0.5, 2.2, 8] });
// 高侧踢（24.01：右腿抬到肩高横踹出去，身子后仰；24.1 定住；24.25 收腿）
defineKeyTrack('p1HighKick', [
  { t: 0, k: kickChamber(1.45) },
  { t: P1T.highKick.hit, k: kickOut(1.78, -0.62), mult: 3, smear: ['rL'] },
  { t: 0.14, k: { rLegS: 1.12 } },
  { t: 0.22, k: { ...kickChamber(1.3), rLegS: 1 } },
  { t: P1T.highKick.end - 0.04, k: G_, tw: 0.07 },
], { base: G_ });
// 侧踢（32.0：腰高横踹，脚上一道青蓝光柱往前喷）
defineKeyTrack('p1SideKick', [
  { t: 0, k: kickChamber(1.15) },
  { t: P1T.sideKick.hit, k: kickOut(1.42, -0.48), mult: 3, smear: ['rL'] },
  { t: 0.13, k: { rLegS: 1.1 } },
  { t: 0.2, k: { ...kickChamber(1.0), rLegS: 1 } },
  { t: P1T.sideKick.end - 0.03, k: G_, tw: 0.06 },
], { base: G_ });
// 扫腿（31.8 / 33.0：伏低身子，一条腿贴地扫过去，橙色弧光）
defineKeyTrack('p1Sweep', [
  { t: 0, k: { ...G_, rootY: -14, lean: 0.5, lHip: 1.2, lKn: 2.2, twist: 0.6, rHip: 0.2, rKn: 1.4, L: [4, -14, 10], R: [2, -6, 8] } },
  { t: P1T.sweep.hit, k: { ...G_, rootY: -18, lean: 0.55, lHip: 1.3, lKn: 2.4, lHipR: 0.2, rHip: 1.25, rKn: 0.02, rHipR: 0.9, rFoot: 0.4, rLegS: 1.32, twist: -0.8, L: [3.5, -12, 12], R: [2, -4, 8], headPitch: -0.1 }, mult: 3, smear: ['rL'] },
  { t: 0.12, k: { rLegS: 1.1 } },
  { t: 0.2, k: { ...G_, rootY: -8, lean: 0.3, lKn: 1.2, rKn: 0.9 } },
  { t: P1T.sweep.end - 0.02, k: G_, tw: 0.08 },
], { base: G_, smearCol: '255,170,90' });
// 腾空旋踢（33.5 起跳旋身 → 33.7 半空侧踢命中、一个大的蓝白光球 → 落地）
defineKeyTrack('p1JumpKick', [
  { t: 0, k: { ...G_, air: 30, ground: 0, rootY: 8, lHip: 1.2, lKn: 2.0, rHip: 1.0, rKn: 2.0, lean: -0.1, twist: -1.2, L: [0.5, 2, 8], R: [0.5, 1.5, 7] } },
  { t: P1T.jumpKick.hit, k: { ...kickOut(1.62, -0.78), air: 36, ground: 0, rootY: 8, rLegS: 1.42, lHip: 0.9, lKn: 1.9, lSh: -0.5, lShR: 0.9, L: null, lEl: 0.5, rShR: 0.9 }, mult: 3, smear: ['rL'] },
  { t: 0.18, k: { rLegS: 1.15, air: 26 } },
  { t: 0.3, k: { ...G_, rootY: -6, lKn: 0.9, rKn: 0.7, air: 0, ground: 1 } },
  { t: P1T.jumpKick.end, k: G_, tw: 0.08 },
], { base: G_ });
// 冲膝（25.28 上步、两手往前一揽 → 25.35 一帧切：右膝顶到胸口高、支撑腿蹬直、身子后仰 → 25.68 再一顶 → 25.95 回架势）
defineKeyTrack('p1Knee', [
  { t: 0, k: G_ },
  { t: 0.07, k: { ...G_, lHip: 0.6, lKn: 0.42, rHip: -0.62, rKn: 0.15, lean: 0.25, L: [0.5, 6, 16], R: [0.5, 6, 16], LN: [-0.3, -0.6, 0.6], RN: [-0.3, -0.6, 0.6], lG: 'claw', rG: 'claw', rootY: -2 } },
  { t: P1T.knee.hit, k: { rHip: 1.78, rKn: 2.3, rFoot: 0.4, rLegS: 1.18, lHip: -0.1, lKn: 0.05, lFoot: 0.3, air: 6, lean: -0.22, twist: 0.25, L: [0, 4, 15], R: [0.5, 3.5, 14], headPitch: 0.1, mouth: 0.8, rootY: 0 }, mult: 2, smear: ['rL'] },
  { t: 0.2, k: { rLegS: 1.05, air: 5 } },
  { t: 0.4, k: { rHip: 1.4, rKn: 2.1, air: 2, lean: -0.1 } },
  { t: P1T.knee.fin, k: { rHip: 1.85, rKn: 2.25, rLegS: 1.28, air: 8, lean: -0.28, mouth: 0.9 }, mult: 2, smear: ['rL'] },
  { t: 0.56, k: { rLegS: 1.05 } },
  { t: 0.64, k: G_, tw: 0.08 },
], { base: G_ });
// 伏身蓄势（35.48：压低成弓步、身上一圈红亮边，下一瞬化成蓝影冲出去）
defineKeyTrack('p1Crouch', [
  { t: 0, k: { ...G_, twist: -0.5 } },
  { t: 0.07, k: { ...G_, rootY: -12, lean: 0.38, lHip: 0.88, lKn: 1.42, rHip: -0.55, rKn: 1.0, rHipR: 0.3, lHipR: 0.3, twist: -0.85, L: [0, 2, 12], R: [1, 1, 7], headPitch: -0.12, shake: 0.4 } },
], { base: G_ });
// 飞身侧踹（36.02–36.15：蓝影横着飞起一脚，身子几乎放平）
defineKeyTrack('p1FlyKick', [
  { t: 0, k: { ...kickChamber(1.3), air: 30, ground: 0, rootY: 10, lean: -0.5 } },
  { t: P1T.flyKick.hit, k: { ...kickOut(1.62, -1.05), air: 40, ground: 0, rootY: 10, rLegS: 1.4, lHip: 1.05, lKn: 2.1, lSh: -0.4, lShR: 1.0, L: null, lEl: 0.4 }, mult: 3, smear: ['rL'] },
  { t: 0.15, k: { rLegS: 1.12 } },
  { t: P1T.flyKick.end, k: { ...G_, air: 6, ground: 0, rootY: 4 }, tw: 0.06 },
], { base: G_ });

// ---------------------------------------------------------------- r9：第二阶段的关键帧表（上面的 P2_KEYS）转成同一套 defineKeyTrack
// 每个关键姿势在表里的时刻到位（时刻照抄视频）：切进去用这一段的四成、最多 0.08 息（卡帧），之后定住到下一帧。
// 照视频自动加：踢出去那一下（髋抬到 1.4 以上、膝几乎蹬直、比上一帧抬高了一截）那条腿拉长到 1.32、多画三份腿、扫一道拖影，0.07 息后弹回 1.1；
// 冲拳（拳上劲足、手往前伸满）那条胳膊拉长、拳头放大、多画两份；一帧里身子拧过一大截（旋身）多画两份。
const p2Spec = (q: P2Pose): KeySpec => {
  const hand = (x: number, y: number, z: number): { t: T3; a: T3 } => { const ax = x - 6, ay = y - 6, L = Math.hypot(ax, ay, z) || 1; return { t: [x, y, z], a: [ax / L, ay / L, z / L] }; };
  const r = hand(q.rhx, q.rhy, q.rhz), l = hand(q.lhx, q.lhy, q.lhz);
  return {
    lHip: q.lHip, lKn: q.lKn, lHipR: q.lHipR, rHip: q.rHip, rKn: q.rKn, rHipR: q.rHipR, lean: q.lean, twist: q.twist, side: q.side, rootY: q.rootY, rootX: 0, rootZ: 0,
    air: q.air, ground: q.ground > 0.5 ? 1 : 0, headPitch: q.headPitch, headYaw: 0, mouth: q.mouth, rFx: q.rFx, lFx: q.lFx, lFoot: q.lFoot, rFoot: q.rFoot,
    R: r.t, RA: r.a, RN: [0, -1, 0.2], L: l.t, LA: l.a, LN: [0, -1, 0.2], lG: 'fist', rG: 'fist',
    lArmS: 1, rArmS: 1, lLegS: 1, rLegS: 1, lHandS: 1, rHandS: 1,
  };
};
for (const a of Object.keys(P2_KEYS) as P2Action[]) {
  const T = p2Table(a), keys: KeyDef[] = [];
  for (let i = 0; i < T.length; i++) {
    const { t, p: q } = T[i], prev = i ? T[i - 1].p : q, next = T[i + 1]?.t ?? t + 1;
    const k = p2Spec(q), def: KeyDef = { t, k, tw: i ? Math.min(0.08, (t - T[i - 1].t) * 0.4) : 0 };
    const extra: KeySpec = {};
    for (const [hip, kn, legS, lb] of [['rHip', 'rKn', 'rLegS', 'rL'], ['lHip', 'lKn', 'lLegS', 'lL']] as const) {
      if (q[hip] >= 1.4 && q[kn] < 0.3 && q[hip] - prev[hip] > 0.5) { k[legS] = 1.32; def.mult = 3; def.smear = [...(def.smear ?? []), lb]; extra[legS] = 1.1; }
    }
    for (const [fx, hz, armS, handS, lb] of [['rFx', 'rhz', 'rArmS', 'rHandS', 'rA'], ['lFx', 'lhz', 'lArmS', 'lHandS', 'lA']] as const) {
      if (q[fx] >= 1.5 && q[hz] >= 26 && prev[hz] < q[hz] - 4) { k[armS] = 1.3; k[handS] = 1.35; def.mult = Math.max(def.mult ?? 0, 2); def.smear = [...(def.smear ?? []), lb]; extra[armS] = 1.1; extra[handS] = 1.1; }
    }
    if (!def.mult && Math.abs(q.twist - prev.twist) > 1.0) def.mult = 2;
    keys.push(def);
    if (Object.keys(extra).length && next - t > 0.1) keys.push({ t: t + 0.07, k: extra });
  }
  defineKeyTrack(a, keys, { base: p2Spec(T[0].p), smearCol: a === 'p2Sui' ? '170,225,255' : '255,200,150' });
}
/** r9：此刻是不是踢出去 / 打出去的那一下（关键帧带拖影帧、切进去不到 0.14 息）：哪几条肢体、那一帧腿抬多高（髋角）。燃身时给拳脚带火尾用 */
export function keyStrike(st: CharState): { limbs: ('lA' | 'rA' | 'lL' | 'rL')[]; hip: number; dk: number } | null {
  const tr = KEY_TRACKS.get(st.action); if (!tr) return null;
  const i = keyIdx(tr, st.actionT), K = tr.keys[i], dk = st.actionT - K.t;
  if (!K.smear || dk > 0.14 || dk < 0) return null;
  const sp = tr.spec[i], hip = Math.max(typeof sp.rHip === 'number' ? sp.rHip : 0, typeof sp.lHip === 'number' ? sp.lHip : 0);
  return { limbs: K.smear, hip, dk };
}
/** r9：关键帧动作有多长（最后一个关键帧的时刻；测试、对照图用） */
export function keyLen(a: Action): number { const tr = KEY_TRACKS.get(a); return tr ? tr.keys[tr.keys.length - 1].t : 0; }
/** r9：关键帧动作在 at 这一刻的姿势（测试用：只取数值字段；卡帧 / 缓进照 trackPose） */
export function keySample(a: Action, at: number): Record<string, number> {
  const st = { action: a, actionT: at, t: 0 } as unknown as CharState, p = neutral();
  trackPose(p, st, a);
  const o: Record<string, number> = {};
  for (const [k, v] of Object.entries(p)) if (typeof v === 'number') o[k] = v;
  return o;
}
