// 通用打击表现（r7 撼山客招式第一批起；以后几批和玩家学的招都用这里）。画面在 gl/impactgl.ts，界面的定格特写在 ui/CutIn.tsx。
//
// 一份挂在 BrawlSys 上（combat.brawl.impact），招式里这样用（c 是 brawlmoves 的 MoveCtx）：
//   const I = c.B.impact;
//   I.inkFlash();                                  黑白闪：整个画面黑白反相定格五帧（前三帧全反相、后两帧半反相；后期着色器的 uInk），有频率上限，返回闪没闪
//   I.inkFlash({ force: true })                    终结技命中那一下：不受「8 息 3 次」的名额限制，只要和上一次隔开 0.5 息（别闪成癫痫）
//   I.backBlast(c, x, y, dir, { power: 3 });       背后炸开的冲击波：从 (x, y)（对手身上）朝 dir 锥形炸出去——wreck.cone 倒树碎石、
//                                                  锥里的人（对出招者有敌意的）被掀飞、挨一下；画面是锥形气浪、扬尘、碎石
//   I.fistWind(c, x, y, dir, { len: 1100 });       拳压：拳没到风先到——一道压缩的气浪沿直线推过去（3000/秒），wreck.line 压草、裂石、犁沟，
//                                                  线上的人被推开（目标挨一下）
//   I.blink(x0, y0, x1, y1, z0, z1)                超高速追击：人消失，只剩一道线和落点的气爆（没有中间帧；位置由招式自己 c.place）
//   I.cutIn('fist' | 'eyes' | 'stomp')             定格特写：全屏切入半秒（ui/CutIn.tsx），同时世界放到 0.06 倍；一场最多两次、两次之间至少 25 息
//   I.airRing(x, y, z)                             踏空气环：空中踩一步，脚下炸开一圈气环
//   I.finisher('無極', { keep: [他, 对手] })        终结技最重那一击的全屏演出（r7-fx3d）：白闪两帧 → 黑白闪五帧 →（有定格特写就等它切完）→ 书法大字砸屏带墨溅；
//                                                  漫画集中线从四周往中心收（开头那几帧）；整屏压暗（只留 keep 里的人和发光的特效亮着）贯穿到大字落定。
//                                                  一场里两次之间至少隔 IMP.finGap 息（隔不够只出黑白闪），返回演没演
//   I.affect(c, units, …)                          破坏系统返回的受波及单位：只打对出招者有敌意的（他打妖王时旁观的你、路过的人不挨）
// 伤害一律走 MoveCtx.hit（hitEnemy / hitPlayer / npcHit），击飞走 MoveCtx.launch（近战的击飞物理，shell 的单位自动跳过）。
// 随机数：这里一个都不取（画面那边的抖动在 GL 里取，不在招式路径上）。
import type { BrawlSys } from './brawl';
import type { Enemy } from './combat';
import type { MoveCtx } from './brawlmoves';
import type { WreckHit, WreckResult } from './wreck';

/** 可调的数 */
/** 定格特写的立绘切入开不开（用户要求关掉） */
const CUT_SHOW = false;
export const IMP = {
  /** 黑白闪：持续几帧（前 inkHard 帧全反相，之后半反相）；两次之间至少隔多久（世界秒）；任意 8 息里最多几次；终结技的那一下至少隔多久
   *  r7-fx3d：原来是 2 帧，而且置位的那一帧在同一次更新里就减掉一帧——实际只亮 1 帧（16 毫秒），录屏按 30 帧取样时多半取不到，用户说「黑白闪也没有」 */
  inkFrames: 5, inkHard: 3, inkGap: 1.6, inkWin: 8, inkMax: 3, inkForceGap: 0.5,
  /** 定格特写：半秒（真实秒）；世界放到多慢；两次之间至少隔多久；一场最多几次（隔这么久没再切就算新的一场） */
  cutDur: 0.5, cutTimeK: 0.06, cutGap: 25, cutPerFight: 2, fightGap: 90,
  /** 终结技全屏演出：白闪几帧、压暗几帧（有定格特写时一直压到特写切完）、两次之间至少隔多久（世界秒） */
  finWhite: 2, finDim: 34, finGap: 3,
} as const;

export type CutImg = 'fist' | 'eyes' | 'stomp';
/** 定格特写的图（public/art/cutin/） */
export const CUT_SRC: Record<CutImg, string> = { fist: './art/cutin/yqj_fist.webp', eyes: './art/cutin/yqj_eyes.webp', stomp: './art/cutin/yqj_stomp.webp' };
export interface CutIn { id: number; img: CutImg; t: number; dur: number; line?: string }
/** 终结技全屏演出的界面事件：lines 集中线（开头）、word 书法大字（白闪、黑白闪、定格特写都过去之后） */
export interface FinEv { id: number; kind: 'lines' | 'word'; word: string }

/** 招式进行中要在画面上持续画的：金刚不坏的金色罡气、两指夹住的飞剑 */
export interface ImpAura { who: Enemy | null; t: number; dur: number }
export interface ImpHeld { x: number; y: number; z: number; ang: number; color: string; fx: string; t: number }

export class ImpactFx {
  /** 黑白闪还剩几帧（> 0 时后期着色器反相） */
  inkF = 0;
  private inkTimes: number[] = [];
  private inkLast = -1e9;
  cut: CutIn | null = null;
  /** 等黑白闪闪完再切进来的定格特写（r7-fx3d：原来两样同一帧出，黑白闪被特写那一条盖住看不见） */
  private cutWait: CutIn | null = null;
  /** 终结技全屏演出：白闪还剩几帧、压暗还剩几帧、等着砸屏的大字、上一次的时刻、界面事件（CutIn.tsx 订阅） */
  whiteF = 0; dimF = 0; private finWord: string | null = null; private finLast = -1e9; private finId = 0; private wordWait = 0;
  fin: FinEv | null = null;
  /** 压暗时留着亮的人（他和对手） */
  finKeep: (Enemy | 'p')[] = [];
  private cutId = 0; private cutLast = -1e9; private cutN = 0;
  /** 持续的画面状态（GL 读） */
  auras: ImpAura[] = [];
  held: ImpHeld[] = [];
  /** 测试 / 交付说明用的计数 */
  stats = { ink: 0, inkDenied: 0, cut: 0, cutDenied: 0, blast: 0, press: 0, blink: 0, ring: 0, fin: 0 };
  /** 界面（定格特写）订阅：切入 / 切出时通知 */
  readonly listeners = new Set<() => void>();

  constructor(readonly B: BrawlSys) {}
  private get g() { return this.B.g; }
  private get c() { return this.B.combat; }

  reset() { this.inkF = 0; this.inkTimes = []; this.inkLast = -1e9; this.cut = null; this.cutWait = null; this.cutLast = -1e9; this.cutN = 0; this.auras = []; this.held = []; this.whiteF = 0; this.dimF = 0; this.finWord = null; this.finLast = -1e9; this.fin = null; this.finKeep = []; this.notify(); }
  private notify() { for (const f of this.listeners) { try { f(); } catch { /* 界面出错不拖垮战斗 */ } } }

  /** 每帧（brawl.update）：rdt 是真实秒（世界被放慢时已除回去） */
  tick(rdt: number) {
    // 先白闪（两帧），白闪完了黑白闪才开始数帧
    if (this.whiteF > 0) this.whiteF--;
    else if (this.inkF > 0) this.inkF--;
    if (this.cutWait && this.inkF <= 0 && this.whiteF <= 0) { this.cut = this.cutWait; this.cutWait = null; this.notify(); }
    // 大字：白闪、黑白闪、定格特写都过去了再砸
    if (this.finWord && this.whiteF <= 0 && this.inkF <= 0 && !this.cut && !this.cutWait && this.wordWait > 0) this.wordWait -= rdt;   // r8-p2：大字晚一点砸（先让火球炸开）
    else if (this.finWord && this.whiteF <= 0 && this.inkF <= 0 && !this.cut && !this.cutWait) { this.fin = { id: ++this.finId, kind: 'word', word: this.finWord }; this.finWord = null; this.dimF = Math.max(this.dimF, 16); this.notify(); }
    if (this.dimF > 0 && !this.cut && !this.cutWait && !this.finWord) this.dimF--;
    if (this.dimF <= 0 && this.finKeep.length && !this.finWord) this.finKeep = [];
    if (this.cut) { this.cut.t += rdt; if (this.cut.t >= this.cut.dur) { this.cut = null; this.notify(); } }
    if (this.auras.length) { for (const a of this.auras) a.t += rdt; this.auras = this.auras.filter((a) => a.t < a.dur); }
  }
  /** 定格特写在切（或等着黑白闪闪完就切） */
  get cutting(): boolean { return !!(this.cut || this.cutWait); }
  /** 世界的时间倍率（定格特写时几乎停住；brawl.worldK 取最小的那个） */
  timeK(): number { return this.cut || this.cutWait ? IMP.cutTimeK : 1; }
  /** 后期着色器的黑白反相强度：头几帧 1（全反相），后两帧 0.55，之后 0 */
  inkK(): number { return this.inkF <= 0 || this.whiteF > 0 ? 0 : this.inkF > this.inkLen - (this.inkLen < IMP.inkFrames ? this.inkLen - 1 : IMP.inkHard) ? 1 : 0.55; }
  /** r8-p2：这一次黑白闪多少帧（终结技的短一些：两帧全反相、一帧半反相——不让一大团墨盖住火球太久） */
  private inkLen: number = IMP.inkFrames;
  /** 终结技的白闪（0‥1，后期的 uFlash） */
  whiteK(): number { return this.whiteF <= 0 ? 0 : this.whiteF >= IMP.finWhite ? 0.62 : 0.4; }
  /** 终结技的整屏压暗（0‥1；最后八帧缓回去） */
  dimK(): number { return this.dimF <= 0 ? 0 : Math.min(1, this.dimF / 8); }

  /** 终结技最重那一击的全屏演出（见文件头）。黑白闪一定闪（force），白闪、压暗、集中线、大字有间隔 */
  finisher(word: string, o: { keep?: (Enemy | 'p')[]; ink?: number; wordDelay?: number } = {}): boolean {
    const t = this.g.time;
    this.inkFlash({ force: true, frames: o.ink });
    if (t - this.finLast < IMP.finGap) return false;
    this.finLast = t;
    this.whiteF = IMP.finWhite + 1;   // +1：同一次更新里 tick 先减一帧
    this.dimF = IMP.finDim; this.finWord = word; this.finKeep = (o.keep ?? []).slice(0, 3);
    this.wordWait = o.wordDelay ?? 0;
    this.fin = { id: ++this.finId, kind: 'lines', word };
    this.stats.fin++;
    this.notify();
    return true;
  }

  // ------------------------------------------------------------ 画面风格：黑白闪、定格特写
  /** 黑白闪：重击命中那一瞬，整屏黑白反相定格两帧。频率上限（别闪成癫痫）：两次至少隔 1.6 息、任意 8 息里最多 3 次。返回闪没闪 */
  inkFlash(o: { force?: boolean; frames?: number } = {}): boolean {
    const t = this.g.time;
    this.inkTimes = this.inkTimes.filter((x) => t - x < IMP.inkWin);
    const last = this.inkTimes.length ? this.inkTimes[this.inkTimes.length - 1] : -1e9;
    if (o.force) { if (t - this.inkLast < IMP.inkForceGap) { this.stats.inkDenied++; return false; } }
    else if (t - last < IMP.inkGap || this.inkTimes.length >= IMP.inkMax) { this.stats.inkDenied++; return false; }
    this.inkTimes.push(t); this.inkLast = t;
    this.inkLen = Math.max(1, Math.min(IMP.inkFrames, o.frames ?? IMP.inkFrames));
    this.inkF = this.inkLen + 1;   // +1：置位这一帧的 tick 会先减一帧（招式在 tick 之前推进）
    this.stats.ink++;
    return true;
  }
  /** 定格特写：终结一击出手那一瞬全屏切入半秒（同时世界几乎停住），切出后接着打。一场最多两次、两次之间至少 25 息。返回切没切 */
  /** 定格特写（立绘切入）：默认关，见 cutIn 里的说明 */
  static cutShow = CUT_SHOW;
  cutIn(img: CutImg, line?: string): boolean {
    const t = this.g.time;
    if (t - this.cutLast > IMP.fightGap) this.cutN = 0;
    if (this.cut || this.cutWait || t - this.cutLast < IMP.cutGap || this.cutN >= IMP.cutPerFight) { this.stats.cutDenied++; return false; }
    this.cutLast = t; this.cutN++; this.stats.cut++;
    // 2026-11-18 用户：「出招的那个老虎贴图……一下把屏幕中心挡住了，不需要那个（不是书法大字）」——定格特写的立绘不再切进来，世界也不再为它停半秒；
    // 次数、间隔照记（招式按返回值决定要不要退回慢镜头，测试也读这些计数），书法大字、黑白闪、压暗都不受影响
    if (!CUT_SHOW) return true;
    const c: CutIn = { id: ++this.cutId, img, t: 0, dur: IMP.cutDur, line };
    // 黑白闪还在闪：等它闪完再切进来（世界照样停住）；同一帧里后调 inkFlash 也一样——tick 那一刻才看
    this.cutWait = c;
    return true;
  }

  // ------------------------------------------------------------ 冲击：背后炸开、拳压、超高速追击、踏空气环
  /**
   * 背后炸开的冲击波：从 (x, y)（对手身上）朝 dir 锥形炸出去。破坏走 wreck.cone（倒树、碎石、龟裂），锥里的人被掀飞（launch）、挨一下（k 倍攻力）。
   * skip：不算进去的人（通常是正挨这一拳的对手——他由招式自己打飞）。返回破坏系统的结果（没有破坏系统时 null）
   */
  backBlast(c: MoveCtx, x: number, y: number, dir: number, o: { len?: number; half?: number; power?: number; k?: number; D?: number; vz?: number; kind?: string; skip?: Enemy | 'p' | null; z?: number } = {}): WreckResult | null {
    const len = o.len ?? 760, half = o.half ?? 0.42, power = o.power ?? 3;
    this.stats.blast++;
    const src = c.user ?? 'p';
    let res: WreckResult | null = null;
    try { res = this.c.wreck?.cone(x, y, dir, len, half, power, src) ?? null; } catch { res = null; }
    this.c.fxq.push({ k: 'hsblast', x, y, dir, r: len, power, kind: String(half), anchor: { x, y, offsetY: -(o.z ?? 0) } } as never);
    if (res) this.affect(c, res.units, { k: o.k ?? 0.6, kind: o.kind ?? 'hs-blast', D: o.D ?? 900, vz: o.vz ?? 520, skip: o.skip ?? null });
    return res;
  }
  /**
   * 拳压：拳没到风先到。从 (x, y) 朝 dir 一道直线（长 len、宽 w）：wreck.line 压倒草、树往两边倒、石头裂开、犁出一道沟；
   * 线上的人被推开（D、vz），target 再挨一下（k）。画面是一道沿线推过去的压缩气浪（3000/秒，和倒树的先后对得上）
   */
  fistWind(c: MoveCtx, x: number, y: number, dir: number, o: { len?: number; w?: number; power?: number; k?: number; kOthers?: number; D?: number; vz?: number; kind?: string } = {}): WreckResult | null {
    const len = o.len ?? 1100, w = o.w ?? 130, power = o.power ?? 2.2;
    const x1 = x + Math.cos(dir) * len, y1 = y + Math.sin(dir) * len;
    this.stats.press++;
    let res: WreckResult | null = null;
    try { res = this.c.wreck?.line(x, y, x1, y1, w, power, c.user ?? 'p') ?? null; } catch { res = null; }
    this.c.fxq.push({ k: 'hspress', x, y, x2: x1, y2: y1, r: w, power, dir } as never);
    if (res) this.affect(c, res.units, { k: o.kOthers ?? 0.25, kTarget: o.k ?? 0.9, kind: o.kind ?? 'hs-press', D: o.D ?? 520, vz: o.vz ?? 260, along: { ux: Math.cos(dir), uy: Math.sin(dir) } });
    return res;
  }
  /** 超高速追击：人消失，只剩一道线和落点的气爆（没有中间帧）。z0 / z1 起落的离地高度 */
  blink(x0: number, y0: number, x1: number, y1: number, z0 = 0, z1 = 0, color = '255,226,170') {
    this.stats.blink++;
    this.c.fxq.push({ k: 'hsblink', x: x0, y: y0, x2: x1, y2: y1, r: z0, power: z1, color, dir: Math.atan2(y1 - y0, x1 - x0) } as never);
  }
  /** 踏空气环：在 (x, y) 上空 z 处踩一步，脚下炸开一圈气环 */
  airRing(x: number, y: number, z: number, power = 1) {
    this.stats.ring++;
    this.c.fxq.push({ k: 'hsring', x, y, r: z, power, anchor: { x, y, offsetY: -z } } as never);
  }
  /** 金刚不坏的金色罡气（持续 dur 息；who = null 是主角） */
  aura(who: Enemy | null, dur: number) { this.auras.push({ who, t: 0, dur }); }

  // ------------------------------------------------------------ 受波及的人
  /** 这个人该不该挨这一下：对出招者有敌意的才挨（他打妖王时旁观的你、路过的人、他自己不挨） */
  hostile(c: MoveCtx, h: WreckHit): boolean {
    const u = c.user, tg = c.target;
    if (!u) return !h.player && !!h.e && !h.e.dead && !h.e.ally && !h.ally;   // 主角出招：打敌人，不打同阵
    if (h.player) return tg === 'p';
    const e = h.e; if (!e || e === u || e.dead) return false;
    if (e === tg) return true;
    const hs = this.g.hanshan;
    if (hs && u === hs.ent && e === hs.beast) return true;
    return (e.tgE === u || e.grudge === u) && e.aggro;
  }
  /**
   * 把破坏系统返回的单位逐个打一下、掀出去。k 攻力倍数（kTarget：正对着的那个人另算）、D / vz 击飞的距离和竖直初速（按远近衰减 h.k）；
   * along：拳压——往前推（不只是往两边）。skip 的人跳过。伤害、击飞都走 MoveCtx（hitEnemy / hitPlayer / npcHit，近战的 launch）
   */
  affect(c: MoveCtx, units: WreckHit[], o: { k: number; kTarget?: number; kind: string; D: number; vz: number; skip?: Enemy | 'p' | null; along?: { ux: number; uy: number } }) {
    for (const h of units) {
      if (!this.hostile(c, h)) continue;
      const who: Enemy | 'p' = h.player ? 'p' : h.e!;
      if (o.skip && who === o.skip) continue;
      const isT = who === c.target;
      const k = (isT && o.kTarget !== undefined ? o.kTarget : o.k) * (0.5 + 0.5 * h.k);
      if (k > 0) c.hit(who, k, o.kind);
      let ux = h.ux, uy = h.uy;
      if (o.along) { ux = ux * 0.45 + o.along.ux * 0.8; uy = uy * 0.45 + o.along.uy * 0.8; const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l; }
      if (who === 'p' || h.launchable) c.launch(who, ux, uy, o.D * (0.45 + 0.55 * h.k), o.vz * (0.6 + 0.4 * h.k));
    }
  }
}
