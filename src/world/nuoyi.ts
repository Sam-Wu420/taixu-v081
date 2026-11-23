// 虚空挪移：传送不再是「一闪就到」，而是 开阵 → 人物在虚空甬道里穿行 → 出阵。
// 目的地、花费、条件都由调用方决定，这里只管过程：
//   开阵（1.5 秒）：脚下阵纹逐圈点亮；最后半秒洞口从脚下的阵纹里张开，四周的世界画面打着旋卷进甬道壁（不闪白）；
//   穿行：一进甬道就执行真正的位移（被甬道画面盖着，玩家看不到），此后一边飞一边等目的地的地面和贴图准备好——
//         甬道就是加载画面，最短 1.1 秒，最长 6 秒；
//   出阵（0.45 秒）：甬道尽头张开一个洞口，目的地的画面从洞里旋开、铺满全屏（反着来，同样不闪白）。
// 穿行期间可以用方向键让人物在甬道里小幅挪动，只是手感，不影响结果。
//
// 甬道里不止你一个人：
//   同行：城镇传送阵、上古传送阵是公用的，同一时刻进阵的别的修士也在甬道里（只是过客，出阵后各奔东西）；
//   追入：正被追杀时，追兵若还锁着你，会跟着闯进甬道，出阵后片刻从你身边破空而出——传送不再是白送的脱身；
//         公用的阵谁都能跟（2600 以内），回府符、空间裂缝这类私人的挪移，只有结丹以上、且在 1200 以内的追兵能循着空间波动追来；
//   截断：追兵是结丹以上、又逼到 1000 以内时，会一掌拍在阵上把甬道截断——你从半途跌出来，落在起点与终点之间，
//         追兵随即杀到（规则取自重构版：结丹以上可封锁甬道、封锁半径 1000）。两次截断之间至少隔 45 秒。
//   飞剑：追兵跟进甬道（没截断）时，会从身后往你身上掷飞剑。每一柄先亮落点和来向（预警 0.8 秒），再飞到落点：
//         落点就是预警那一刻你所在的位置——左右上下挪开（方向键 / 摇杆），或者催动 / 松开疾行往前蹿、往后落（加减速），就躲开了；
//         躲不开就挨一下（伤害走 combat.hitPlayer），身形被拖慢一阵（挪得慢、蹿不动），追兵趁机逼近，这一趟也飞得更久。
//         被追着的这一趟甬道至少飞 3.6 秒（够掷两三柄）。没被追杀时甬道里什么都不多出来。落点的偏移和节奏按哈希取，不取 Math.random。
import type { Game } from './game';
import type { Enemy } from './combat';
import type { Pursuer } from './pursuit';
import type { Look } from '../gfx/renwu/types';
import { CharState, randomLook } from '../gfx/character';
import { dunOf } from './foemind';
import { audio } from './audio';
import { hashU } from '../core/rng';

export type NuoyiKind = 'array' | 'ancient' | 'talisman' | 'rift' | 'edge';
export interface NuoyiRequest {
  kind: NuoyiKind;
  /** 真正的位移（瞬移、扣天数、提示等），在进入甬道的那一刻执行 */
  arrive: () => void;
  /** 目的地（世界坐标）。给了才可能被截断在半途；不给就只会被追入 */
  to?: { x: number; y: number };
  /**
   * 跨图：甬道飞够时间后执行 arrive（换图）。换图在游戏里直接完成的话，接着飞到新图的地面备好再出阵；
   * 若退回了「重新载入页面」的老办法，甬道就停在这里等页面重载。
   */
  leaves?: boolean;
}
/** 甬道里的其他人。x、y 是偏离中轴的距离；z 是相对主角的前后：负＝在前方深处，正＝在主角身后（离镜头更近） */
export interface Rider { look: Look; st: CharState; x: number; y: number; z: number; hostile: boolean; seed: number }

// 第五轮：开阵从 0.6 秒放到 1.5 秒——原来三圈阵纹刚亮甬道就盖上来了，验收时只看见旋涡墙；现在三圈由里往外每隔 0.35 秒亮一圈、光柱跟着升起，最后 0.28 秒甬道才淡入
export const OPEN = 1.5;
const EXIT = 0.45, MIN_PASSAGE = 1.1, MAX_PASSAGE = 6, LEAVE_AFTER = 1.7;
/** 收官返工：进阵时洞口用开阵的最后这几秒张开；出阵时洞口在这几秒里铺满全屏（出阵剩下的几帧是完整的目的地画面） */
const IRIS_IN = 0.5, IRIS_OUT = EXIT * 0.9;
/** 开阵的三圈阵纹：半径、相邻两圈亮起的间隔（秒） */
const OPEN_RINGS = [90, 170, 250], OPEN_STEP = 0.35;
/** 出阵后落点的光柱再亮多久（秒） */
const LAND_GLOW = 0.9;
/** 追入：公用的阵多远以内跟得进来 / 私人挪移多远以内追得上（且须结丹以上） */
const FOLLOW_SHARED = 2600, FOLLOW_PRIVATE = 1200;
/** 截断：结丹（境界 3）以上、逼到这个距离以内；两次截断的间隔（秒）；进甬道后多久被截断 */
const BLOCK_REALM = 3, BLOCK_RANGE = 1000, BLOCK_GAP = 45, BLOCK_AT = 0.95;
/**
 * 甬道里的飞剑（只在被追进甬道、没被截断时有）：
 *   first：进甬道后多久掷第一柄；gap：两柄之间隔多久；warn：落点先亮多久；fly：出手后多久到落点；
 *   r：落点多大（甬道横截面上的偏移，和 swayX / swayY / surge 一个刻度，-1..1）；
 *   passage：被追着的这一趟甬道至少飞多久；drag：挨一下后被拖慢多久；slow：拖慢时挪动、蹿动的快慢倍率；
 *   extra：每挨一下这一趟多飞多久；close：每挨一下追兵逼近多少（甬道里的远近）
 */
export const TUNNEL_BLADE = { first: 0.7, gap: 1.15, warn: 0.8, fly: 0.22, r: 0.42, passage: 3.6, drag: 1.4, slow: 0.3, extra: 0.5, close: 30 } as const;
/** 往前蹿到底时人在甬道里往深处挪多远（画面用，单位同甬道） */
export const SURGE_DEPTH = 220;
/**
 * 一柄飞剑。from：哪位追兵掷的（riders 的下标）；sx / sy / sz：落点（sz 是前后：0＝原位，1＝蹿到最前）；
 * t：从亮出落点起过了几秒；state：warn 预警中 / fly 飞向落点 / hit 打中了 / miss 躲开了（之后再留一会儿给画面收尾）
 */
export interface TunnelBlade { from: number; sx: number; sy: number; sz: number; t: number; state: 'warn' | 'fly' | 'hit' | 'miss' }
/** 各类挪移的甬道配色：[云墙色, 符光色]，以及开阵时的灵光颜色 */
export const NUOYI_STYLE: Record<NuoyiKind, { wall: [number, number, number]; light: [number, number, number]; ring: string }> = {
  array: { wall: [0.08, 0.30, 0.42], light: [0.72, 0.95, 1.0], ring: '140,230,255' },      // 城镇传送阵：青
  ancient: { wall: [0.26, 0.13, 0.44], light: [0.95, 0.82, 1.0], ring: '210,170,255' },    // 上古传送阵：紫
  talisman: { wall: [0.08, 0.34, 0.26], light: [0.72, 1.0, 0.86], ring: '150,240,200' },   // 回府符：碧
  rift: { wall: [0.10, 0.09, 0.15], light: [0.80, 0.76, 0.92], ring: '200,190,230' },      // 空间裂缝：幽暗
  edge: { wall: [0.36, 0.26, 0.10], light: [1.0, 0.92, 0.70], ring: '255,225,160' },       // 边境远行：金
};

export class Nuoyi {
  phase: 'idle' | 'open' | 'passage' | 'exit' = 'idle';
  kind: NuoyiKind = 'array';
  /** 当前阶段已过的秒数；clock 是整段挪移的累计秒数（甬道的流动用它） */
  t = 0; clock = 0;
  /** 人物在甬道里的左右 / 上下偏移，-1..1 */
  swayX = 0; swayY = 0;
  /** 甬道里的其他人：同行的修士、追进来的追兵 */
  riders: Rider[] = [];
  /** 甬道被截断的那一下（1 → 0 衰减），画面据此泛红、震动；挨了飞剑也会轻轻一震 */
  cut = 0;
  /** 往前蹿的程度 0..1（按住疾行往前蹿，松开落回原位） */
  surge = 0;
  /** 追兵掷来的飞剑（见 TUNNEL_BLADE） */
  blades: TunnelBlade[] = [];
  /** 挨了飞剑后还要被拖慢几秒 */
  drag = 0;
  /** 出阵落地后那道光柱还要亮几秒（甬道淡出后接着散） */
  private landT = 0;
  /**
   * 开阵、出阵时自己推进去的地面阵纹圈。挪移途中整个世界是停着的（halted），战斗那边不推进特效的时间，
   * 这几个圈由这里替它推进（回到 idle 后交还给战斗那边，不会重复推进）
   */
  private rings: { t: number; [k: string]: unknown }[] = [];
  /** 这一趟挨了几柄、掷了几柄 */
  bladeHits = 0; private bladeN = 0; private bladeSeed = 0;
  private request: NuoyiRequest | null = null;
  private arrived = false;
  private restoreAction: string | null = null;
  private origin = { x: 0, y: 0 };
  /** 这一趟跟进来的追兵；block＝会把甬道截断 */
  private chase: { P: Pursuer; block: boolean } | null = null;
  /** 追兵出阵的倒计时（挪移结束后仍在走） */
  private foeT = 0; private foeNear = false;
  /** 跨图：换图前先等两帧（原来这两帧亮满屏的光，收官返工去掉了：换图那一下就停在甬道里）；switched＝已在游戏里换好图 */
  private holdFrames = 0; private switched = false;
  private lastBlock = -1e9;

  constructor(private readonly game: Game) {}

  get active() { return this.phase !== 'idle'; }
  /** 有追兵跟在甬道里 */
  get chased() { return !!this.chase; }
  /**
   * 甬道画面画不画（0 / 1）。收官返工：原来开阵末尾整屏淡入、出阵整屏淡出，进出各加一记白闪——和「无缝」相违；
   * 现在甬道画面本身总是不透明的，进出靠洞口（见 iris）一点点张开，没有整屏的淡入淡出，也没有白闪
   */
  get fade(): number {
    if (this.phase === 'open') return this.t >= OPEN - IRIS_IN ? 1 : 0;
    if (this.phase === 'passage') return 1;
    if (this.phase === 'exit') return this.t < IRIS_OUT ? 1 : 0;
    return 0;
  }
  /** 进出甬道的白闪：收官返工去掉了，恒为 0（留着给旧的调用方） */
  get flash(): number { return 0; }
  /**
   * 收官返工：洞口。out=false 是进阵——洞口从脚下张开，洞里是甬道、洞外是世界，k 从 0 到 1 洞口由小到盖满全屏；
   * out=true 是出阵——甬道尽头张开，洞里是目的地、洞外是甬道，k 到 1 时目的地铺满全屏。不在过渡里为 null
   */
  get iris(): { out: boolean; k: number } | null {
    if (this.phase === 'open' && this.t >= OPEN - IRIS_IN) return { out: false, k: Math.min(1, (this.t - (OPEN - IRIS_IN)) / IRIS_IN) };
    if (this.phase === 'exit' && this.t < IRIS_OUT) return { out: true, k: this.t / IRIS_OUT };
    return null;
  }
  /** 甬道画面盖住了屏幕的几成（名牌血条那层界面过半就藏起来）：洞口半径按 k^1.7 长，盖住的面积约是它的平方 */
  get cover(): number {
    const I = this.iris;
    if (!I) return this.fade;
    const a = Math.pow(I.k, 3.4);
    return I.out ? 1 - a : a;
  }
  /**
   * 收官 P5：脚下那道光柱（开阵时在起点升起，出阵后在落点散去）：x / y 是位置，k 是亮度 0..1；没有就是 null。
   * 画在 render.ts 的阵法光墙里（hd2d/zhenwall.ts 那一套，只加调用）。
   */
  get pillar(): { x: number; y: number; k: number } | null {
    if (this.phase === 'open') { const u = Math.min(1, this.t / (OPEN * 0.7)); return { x: this.origin.x, y: this.origin.y, k: u * u * (3 - 2 * u) }; }
    if (this.landT > 0) { const p = this.game.player; return { x: p.x, y: p.y, k: Math.min(1, this.landT / LAND_GLOW * 1.6) }; }
    return null;
  }
  /** 出阵进度 0..1：甬道尽头的亮光迎面扑来 */
  get exiting(): number { return this.phase === 'exit' ? Math.min(1, this.t / EXIT) : this.phase === 'passage' && this.arrived && this.ready() ? 0.15 : 0; }

  /**
   * 发起一次挪移。没有立体画面可用时（经典画面、无头测试）直接执行位移并返回 false，调用方不必再处理；
   * 已经在挪移途中则忽略并返回 true。
   */
  start(request: NuoyiRequest): boolean {
    if (this.active) return true;
    const g = this.game;
    if (!g.renderer?.hd || g.mijing?.active) { if (!request.leaves) request.arrive(); return false; }
    this.request = request; this.kind = request.kind; this.phase = 'open'; this.t = 0; this.clock = 0; this.arrived = false;
    this.swayX = this.swayY = 0; this.cut = 0; this.foeT = 0; this.holdFrames = 0; this.switched = false;
    this.surge = 0; this.blades = []; this.drag = 0; this.bladeHits = 0; this.bladeN = 0;
    const p = g.player;
    this.origin = { x: p.x, y: p.y };
    g.destination = null;
    this.gather(request);
    // 收官 P5：开阵——阵纹由里往外逐圈点亮（warn：一圈描边 + 转动的篆文，到点才亮），光柱随之升起（见 pillar，画在 render.ts 的阵法光墙里）。
    // 原来那两圈 ring 的灵光在泛光下是一大团白，把人盖住了，换成这三圈阵纹
    const col = NUOYI_STYLE[request.kind].ring;
    this.rings = OPEN_RINGS.map((r, i) => ({ kind: 'warn', x: p.x, y: p.y, r, t: -i * OPEN_STEP, dur: OPEN + 0.3 - i * OPEN_STEP, color: col }));
    for (const v of this.rings) g.combat.vfx.push(v as never);
    audio.sfx('zhenopen'); if (request.kind === 'ancient') audio.sfx('thunder');   // 上古传送阵另有一声雷
    return true;
  }

  /** 这一趟甬道里还有谁：同行的过客、跟进来的追兵 */
  private gather(request: NuoyiRequest) {
    const g = this.game, p = g.player, kind = request.kind;
    this.riders = []; this.chase = null;
    let seed = (Math.random() * 0xffffffff) >>> 0;
    this.bladeSeed = seed;   // 飞剑的落点偏移按它取哈希（不另取随机数）
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const rider = (look: Look, x: number, y: number, z: number, hostile: boolean) => {
      const st = new CharState(0, 0); st.setAction('fly'); st.faceToward(0, -1); st.yaw = st.targetYaw;
      this.riders.push({ look, st, x, y, z, hostile, seed: rnd() * 100 });
    };
    const shared = kind === 'array' || kind === 'ancient' || kind === 'edge';
    // 同行：公用的阵里零到三位过客，散在前方
    if (kind === 'array' || kind === 'ancient') {
      const n = [0, 1, 2, 2, 3][Math.floor(rnd() * 5)];
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1;
        rider(randomLook(rnd, rnd() < 0.3 ? 'female' : 'cultivator'), side * (70 + rnd() * 90), -30 + rnd() * 90, -(380 + i * 330 + rnd() * 220), false);
      }
    }
    // 追入 / 截断
    const P = g.pursuit?.cur;
    if (!P || P.lost || P.e.dead || request.leaves) return;
    const dist = Math.hypot(P.e.x - p.x, P.e.y - p.y);
    const follow = shared ? dist < Math.min(P.lockR, FOLLOW_SHARED) : P.realm >= BLOCK_REALM && dist < FOLLOW_PRIVATE;
    if (!follow) return;
    const stuck = !!(P.e.st.freeze || P.e.st.stun || P.e.st.root);
    const block = !!request.to && P.realm >= BLOCK_REALM && dist < BLOCK_RANGE && !stuck && g.time - this.lastBlock > BLOCK_GAP;
    this.chase = { P, block };
    const foes: Enemy[] = [P.e, ...P.wings.filter((w) => !w.dead)].slice(0, 3);
    foes.forEach((e, i) => {
      const look = e.look ?? Object.assign(randomLook(rnd, 'cultivator'), { robe: P.faction.robe });
      rider(look, i === 0 ? 95 : i === 1 ? -120 : 150, i === 0 ? 10 : 40, 150 + i * 45, true);
    });
    g.toast(shared ? `${P.name}紧跟着闯进了传送阵！` : `${P.name}循着空间波动追了进来！`, 'warn');
  }

  update(dt: number): void {
    dt = Math.min(dt, 0.05);
    if (this.cut > 0) this.cut = Math.max(0, this.cut - dt * 1.6);
    if (this.foeT > 0 && this.phase === 'idle') { this.foeT -= dt; if (this.foeT <= 0) this.landFoes(); }
    if (this.landT > 0) this.landT = Math.max(0, this.landT - dt);
    if (this.phase === 'idle') { this.rings.length = 0; return; }
    const g = this.game, p = g.player;
    this.t += dt; this.clock += dt;
    for (const v of this.rings) v.t += dt;
    // 甬道里的小幅挪动
    const k = g.input.keys;
    const tx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + g.input.joy.x;
    const ty = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) - g.input.joy.y;
    // 挨了飞剑被拖慢时挪得慢（没被追杀时 drag 恒为 0，手感和原来一样）
    if (this.drag > 0) this.drag = Math.max(0, this.drag - dt);
    const nimble = this.drag > 0 ? TUNNEL_BLADE.slow : 1;
    this.swayX += (Math.max(-1, Math.min(1, tx)) - this.swayX) * Math.min(1, dt * 5 * nimble);
    this.swayY += (Math.max(-1, Math.min(1, ty)) - this.swayY) * Math.min(1, dt * 5 * nimble);
    // 加减速：按住疾行往前蹿，松开落回原位（只是手感；躲飞剑时用得上）
    const sz = this.phase === 'passage' && (k.has('shift') || g.input.run) ? 1 : 0;
    this.surge += (sz - this.surge) * Math.min(1, dt * 4 * nimble);
    // 其他人：各自轻轻浮动；追兵一点点逼近
    for (const r of this.riders) { r.st.update(dt); if (r.hostile && this.phase === 'passage' && r.z > 70) r.z = Math.max(70, r.z - dt * 28); }
    if (this.blades.length || this.bladeOn()) this.tickBlades(dt);
    const req = this.request!;
    if (this.phase === 'open' && this.t >= OPEN) {
      this.phase = 'passage'; this.t = 0;
      audio.sfx('warpin');
      // 人物摆成御空的姿势、背对镜头往里飞
      this.restoreAction = p.st.action;
      p.st.setAction('fly'); p.st.faceToward(0, -1);
      // 会被截断的这一趟先不位移：截断时直接落在半途，不算抵达（不扣天数、不报到达）
      if (!req.leaves && !this.chase?.block) { req.arrive(); this.arrived = true; p.st.setAction('fly'); p.st.faceToward(0, -1); }
    } else if (this.phase === 'passage') {
      if (req.leaves && !this.switched) {
        if (!this.arrived && this.t >= LEAVE_AFTER) {
          if (this.holdFrames < 2) this.holdFrames++;   // 先等两帧
          else {
            this.arrived = true;
            const epoch = g.mapEpoch;
            req.arrive();
            // 图已经在游戏里换好：人已在新图，接着在甬道里飞到地面备好再出阵。否则页面即将重新载入，甬道停在这里
            if (g.mapEpoch !== epoch) { this.switched = true; this.t = 0; this.riders = []; const q = g.player; q.st.setAction('fly'); q.st.faceToward(0, -1); this.restoreAction = 'idle'; }
          }
        }
      } else if (this.chase?.block && !this.arrived) {
        if (this.t >= BLOCK_AT) this.sever();
      } else if (this.bladeOn() ? this.bladesDone() : this.t >= MAX_PASSAGE || (this.t >= MIN_PASSAGE && this.ready())) {
        this.toExit();
        if (this.chase) { this.foeT = this.bladeHits ? 0.7 : 1.1; this.foeNear = false; }   // 挨过飞剑：追兵咬得更紧，出得更快
        audio.sfx('warpout');
      }
    } else if (this.phase === 'exit' && this.t >= EXIT) {
      this.phase = 'idle'; this.request = null; this.restoreAction = null; this.riders = []; this.blades = []; this.surge = 0; this.drag = 0;
    }
  }

  // ---------------------------------------------------------------- 甬道里的飞剑
  /** 这一趟会不会有飞剑：追兵跟了进来、没截断、人已经在甬道里抵达（跨图那一趟追兵本来就跟不进来） */
  private bladeOn(): boolean {
    return this.phase === 'passage' && !!this.chase && !this.chase.block && this.arrived && !this.switched && this.riders.some((r) => r.hostile);
  }
  /** 被追着的这一趟可以出阵了没有：飞够了时间（挨一下多飞一阵）、掷出去的都落定了、目的地也备好了 */
  private bladesDone(): boolean {
    const B = TUNNEL_BLADE, need = B.passage + this.bladeHits * B.extra;
    if (this.blades.some((b) => b.state === 'warn' || b.state === 'fly')) return false;
    return this.t >= need + 3 || (this.t >= need && this.ready());
  }
  /** 掷剑、飞剑、判中 */
  private tickBlades(dt: number) {
    const B = TUNNEL_BLADE;
    // 新掷一柄：按节奏来，且这一柄来得及在出阵前落定
    if (this.bladeOn()) {
      const at = B.first + this.bladeN * B.gap, need = B.passage + this.bladeHits * B.extra;
      if (this.t >= at && at + B.warn + B.fly <= need) {
        const foes = this.riders.map((r, i) => (r.hostile ? i : -1)).filter((i) => i >= 0);
        const s = this.bladeSeed, n = this.bladeN++;
        // 落点：就是你现在的位置，略偏一点（按哈希）；人在边上时落点不出甬道
        const jx = (hashU(s & 0xffff, n, 0x5a1) - 0.5) * 0.3, jy = (hashU(s >>> 16, n, 0x5a2) - 0.5) * 0.24;
        this.blades.push({ from: foes[n % foes.length], sx: Math.max(-1, Math.min(1, this.swayX + jx)), sy: Math.max(-1, Math.min(1, this.swayY + jy)), sz: this.surge, t: 0, state: 'warn' });
        audio.sfx('bladewarn');
      }
    }
    for (const b of this.blades) {
      b.t += dt;
      if (b.state === 'warn' && b.t >= B.warn) { b.state = 'fly'; audio.sfx('sword'); }
      else if (b.state === 'fly' && b.t >= B.warn + B.fly) {
        const d = Math.hypot(this.swayX - b.sx, this.swayY - b.sy, this.surge - b.sz);
        if (d < B.r) this.bladeHit(b); else { b.state = 'miss'; audio.sfx('whoosh'); }
      }
    }
    // 落定后再留半秒给画面（飞剑扎进人身上一闪、或擦身飞进深处）
    this.blades = this.blades.filter((b) => b.state === 'warn' || b.state === 'fly' || b.t < B.warn + B.fly + 0.5);
  }
  /** 挨了一柄：伤害走 hitPlayer；被拖慢、追兵逼近、这一趟多飞一阵 */
  private bladeHit(b: TunnelBlade) {
    const B = TUNNEL_BLADE, g = this.game, P = this.chase!.P, e = P.e;
    b.state = 'hit'; this.bladeHits++;
    this.drag = B.drag; this.cut = Math.max(this.cut, 0.32);
    for (const r of this.riders) if (r.hostile) r.z = Math.max(40, r.z - B.close);
    g.combat.hitPlayer(e.atk * 0.8, e.realm, undefined, e.x, e.y, e);
    audio.sfx('bladehit');
    if (this.bladeHits === 1) g.toast(`${P.name}的飞剑追进甬道，正中你身上——身形一滞，追兵逼得更近了！`, 'warn');
    // 在甬道里被打倒：别困在甬道里，直接出阵
    if (g.hero.dead || g.hero.hp <= 0) this.toExit();
  }

  private toExit() {
    const g = this.game, p = g.player;
    this.phase = 'exit'; this.t = 0; this.landT = LAND_GLOW;
    const ring = { kind: 'ring', x: p.x, y: p.y, r: 220, t: 0, dur: 0.9, color: NUOYI_STYLE[this.kind].ring, fx: 'array' };
    g.combat.vfx.push(ring as never); this.rings.push(ring);
    g.juice(0.05, 0.3);
    if (this.restoreAction) p.st.setAction(p.flying ? 'fly' : 'idle');
  }

  /** 甬道被截断：落在起点与终点之间的某处，追兵随即杀到 */
  private sever() {
    const g = this.game, p = g.player, P = this.chase!.P, o = this.origin, to = this.request!.to!;
    this.arrived = true; this.lastBlock = g.time; this.cut = 1;
    // 半途的落点：沿途三成到六成处，找一块站得住的地；实在找不到就被打回起点
    let x = o.x, y = o.y, found = false;
    for (let i = 0; i < 24 && !found; i++) {
      const f = 0.3 + Math.random() * 0.3, a = Math.random() * Math.PI * 2, r = i < 6 ? 0 : 200 + i * 70;
      const cx = o.x + (to.x - o.x) * f + Math.cos(a) * r, cy = o.y + (to.y - o.y) * f + Math.sin(a) * r;
      if (g.terrain.walkFactor(cx, cy) > 0 && !g.combat.safeAt(cx, cy)) { x = cx; y = cy; found = true; }
    }
    g.teleport(x, y);
    this.toExit();
    this.foeT = 0.55; this.foeNear = true;
    g.hurtFlash = Math.max(g.hurtFlash, 0.4); g.juice(0.08, 0.5); audio.sfx('thunder');
    g.toast(`${P.name}一掌拍在阵上——虚空甬道被生生截断，你从半途跌了出来！`, 'warn');
  }

  /** 追兵出阵：落在你身边（城里不敢动手，就落在城外） */
  private landFoes() {
    const g = this.game, c = g.combat, p = g.player, chase = this.chase;
    this.chase = null;
    if (!chase || g.pursuit?.cur !== chase.P) return;
    const P = chase.P, near = this.foeNear;
    const foes: Enemy[] = [P.e, ...P.wings.filter((w) => !w.dead)];
    const base = Math.random() * Math.PI * 2;
    let landed = false;
    foes.forEach((e, i) => {
      if (e.dead) return;
      for (let k = 0; k < 18; k++) {
        const a = base + i * 0.9 + k * 1.3, R = (near ? 480 : 660) + i * 90 + k * 130;
        const x = p.x + Math.cos(a) * R, y = p.y + Math.sin(a) * R * 0.8;
        if (c.safeAt(x, y) || !c.mind.canStand(e, x, y, false)) continue;
        e.x = x; e.y = y; e.kx = 0; e.ky = 0; e.hx = x; e.hy = y; if (e.cs) { e.cs.x = x; e.cs.y = y; }
        e.trailReset = true; e.aggro = true;
        c.fxq.push({ k: 'dunflash', x, y, x2: x, y2: y, kind: dunOf(e), color: P.faction.color });
        c.texts.push({ x, y: y - 130, s: '破空而出！', color: '#ffb0a0', t: 0, vy: -26, big: i === 0 });
        if (!c.enemies.includes(e)) c.enemies.push(e);
        if (i === 0) landed = true;
        break;
      }
    });
    if (!landed) return;   // 四下都是不能动手的地界：追兵没能出阵，按原来的规矩慢慢失去踪迹
    P.outT = 0; P.lost = false; P.searching = false; P.lastX = p.x; P.lastY = p.y; P.v = P.chase * 0.6;
    if (g.renderer) g.renderer.sense.alarm = 1;
    audio.sfx('whoosh');
    if (!near) g.toast(`${P.name}紧随其后，从虚空甬道里追了出来！`, 'warn');
  }

  /** 目的地准备好了没有：地面分块和景物贴图都不再有待生成的 */
  private ready(): boolean { return !this.game.renderer?.streaming; }
}
