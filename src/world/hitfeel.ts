// r9-hitfeel：全游戏的打击感。把撼山客那套（参考视频 DNF 男散打的「通用做法」：实心白星 + 方向冲击线、被打者闪白、后滑拖土、
// 四层爆炸、慢放、扭曲冲击波）推广到所有出手——拳脚、兵器、法术、法器、妖兽招式、NPC 之间互殴。
//
// 分三档（hfTier 定规则，按伤害占对方血量的比例、招式类型、暴击 / 破罡 / 破护体灵光 / 击杀 / 轰飞）：
//   轻：小号实心白星 + 2–3 条方向线、被打者闪白 1 帧、0–1 帧单位顿帧
//   重：大一号白星 + 4–6 条方向线 + 挥击弧光、闪白 2 帧 + 往后滑拖土、2–3 帧单位顿帧、轻微震屏
//   终：四层立体爆炸 + 0.15 秒慢放 + 一圈扭曲冲击波、尸身顺着方向飞出去
// 玩家挨打用偏红的一版（星和线朝来向）。兵器各一套：剑细长、重兵粗短带碎屑、枪一条贯穿线（画面在 gl/hitfeelgl.ts）。
//
// 时序：命中当下（hitEnemy / npcHit / hitPlayer）只记一笔、照旧往 fxq 推 'hit' / 'phit'（模组和测试认的事件不变）；
// 这一帧的逻辑跑完（combat.update 末尾，或画面那边先到时）flush 一次——这时才知道这一下有没有破罡、把人轰飞、打死，
// 定档、把档位写进那个事件（画面按档画）、放声音（同一帧合并、限流）、顿帧 / 慢放 / 震屏、报立体特效。
// 规矩：一个 Math.random 都不取（固定种子的路径不受影响）；远处的（离镜头远）只做数值不出特效；画质低档时画面那边走轻量版。
import type { Combat, Enemy } from './combat';
import type { FxEvent } from '../gl/combatgl';
import type { Game } from './game';
import { fx3dOf, fx3dPeek as fx3dPeekOf, FX3D, type Fx3dEv, type Fx3dPalette, type RGB3 } from './fx3d';
import { p1 } from './p1fx';
import { audio, type HfSfx } from './audio';
import { isBoss } from './foeskills';
import { formOfLook } from './blade';
import { ARTS } from '../data/arts';
import { hfSetting } from './hfsetting';

export type HfTier = 1 | 2 | 3;
/** 这一下是什么打的：拳脚 / 剑 / 重兵 / 枪 / 法术法器 / 妖兽的爪牙 */
export type HfWeapon = 'fist' | 'sword' | 'heavy' | 'spear' | 'scythe' | 'spell' | 'beast';
/** 四层爆炸的配色（fire / gold / frost / void 用三维模块原有的；ink、venom、thunder、earth、wind 是这里配的，见 gl/hitfeelgl.ts） */
export type HfPal = 'fire' | 'gold' | 'ink' | 'frost' | 'void' | 'venom' | 'thunder' | 'earth' | 'wind';

/** 可调的数 */
export const HF = {
  /** 离镜头多远以外只做数值（不出特效、不出声） */
  far: 2200,
  /** 离镜头多远以内出完整版（再远一档只出轻量版） */
  near: 1300,
  /** 一帧最多几个被打者闪白、几个后滑拖土 */
  flashMax: 6, skidMax: 3,
  /** 场上的人多（混战、兽潮）时：一帧最多几个闪白（闪白要把人照姿势再画一遍，几十个人一起挨打时很贵） */
  flashCrowd: 2, crowd: 15,
  /** 「终」限流：这么多毫秒里最多几次 */
  t3Win: 400, t3Max: 2,
  /** 一帧最多放几种命中声；同一种隔多少毫秒才能再放 */
  sfxPerFrame: 3, sfxGap: 45,
  /** 爆炸限流（每秒最多几个立体爆炸；小的弹着点另算） */
  blastPerSec: 5, popPerSec: 6,
} as const;

/** 近战里算「重」的那几下（重击、砸地、追击、俯冲、冲撞、震地、拼招赢了那一下、连段收式、撞墙撞人） */
const HEAVY_BRAWL = new Set(['heavy', 'slam', 'slam-ground', 'slam-water', 'pursuit', 'dive', 'rush', 'quake', 'clash', 'finisher', 'impact']);
/** 会把人打飞的那几下（打完人在天上 = 轰飞了） */
const LAUNCH_BRAWL = new Set(['heavy', 'pursuit', 'finisher', 'dive', 'rush', 'slam-ground']);
/** 近战框架自己的几种；不在这里头的 brawl 名是特殊招式（撼山客那几招自己出打击表现：p1fx.hit），这里不重复画 */
const STD_BRAWL = new Set([...HEAVY_BRAWL, 'light', 'bump', 'qi', 'rush-line', 'dive-wave']);

export interface HfIn {
  /** 伤害占对方气血上限的比例 */
  frac: number; crit: boolean;
  /** 近战的哪一种（hitEnemy 的 src.brawl） */
  kind?: string;
  /** 法术 id / 'art:法器 id' */
  skill?: string;
  /** 飞剑 / 飞针 */
  sword?: boolean;
  wardBreak?: boolean; poiseBreak?: boolean; kill?: boolean;
  /** 被打的是精英 / 首领 */
  bigFoe?: boolean;
  /** 这一下把人轰飞了 */
  launched?: boolean;
}
/** 定档 */
export function hfTier(i: HfIn): HfTier {
  if (i.kill && i.bigFoe) return 3;
  if (i.launched) return 3;
  const art = i.skill && !i.skill.startsWith('art:') ? ARTS[i.skill] : undefined;
  if (art && art.tier >= 3 && i.frac >= 0.08) return 3;   // 大招（地 / 天阶）打实了
  if (i.crit || i.wardBreak || i.poiseBreak) return 2;
  if (i.kind && HEAVY_BRAWL.has(i.kind)) return 2;
  if (i.sword) return i.frac >= 0.15 ? 2 : 1;   // 飞剑擦伤
  if (i.skill?.startsWith('art:')) return i.frac >= 0.03 ? 2 : 1;   // 法器砸中
  if (art) return art.tier >= 2 || i.frac >= 0.12 ? 2 : 1;   // 中法术 / 小法术
  return i.frac >= 0.18 ? 2 : 1;
}

/** 总开关（world/hfsetting.ts）：?hf=0 / localStorage taixu.hitfeel=0 退回原来的画法 */
export { hfSetting };
/** 画面档：2 完整（立体特效全开）/ 1 中（立体特效减量）/ 0 轻量（只有平面的星和线，不报立体特效）。没有立体场景、画质低档、光影关掉都是 0 */
export function hfLevel(g: Game): 0 | 1 | 2 {
  const R = g.renderer as unknown as { hd?: unknown; tier?: number; gfxOn?: boolean } | null | undefined;
  if (!R || !R.hd) return 0;
  if ((R.tier ?? 2) <= 0 || R.gfxOn === false) return 0;
  return (R.tier ?? 2) >= 2 ? 2 : 1;
}

/** 法术的 fx / 系别 → 爆炸配色 */
const FX_PAL: Record<string, HfPal> = {
  fireball: 'fire', firesnake: 'fire', flame: 'fire', dragon: 'fire', talisman: 'fire', crow: 'fire',
  icicle: 'frost', frost: 'frost', water: 'frost', icefire: 'frost',
  lightning: 'thunder', goldthunder: 'thunder',
  gold: 'gold', sword: 'gold', bigsword: 'gold', star: 'gold', magnet: 'gold', array: 'gold', palm: 'gold',
  rock: 'earth', vine: 'venom', leaf: 'venom', poison: 'venom',
  blood: 'ink', ghost: 'ink', mind: 'void', wind: 'wind', tornado: 'wind', roar: 'earth',
};
const SCHOOL_PAL: Record<string, HfPal> = { 火: 'fire', 冰: 'frost', 雷: 'thunder', 风: 'wind', 土: 'earth', 木: 'venom', 剑: 'gold', 体: 'gold', 御: 'earth', 魔: 'ink', 识: 'void', 阵: 'gold', 身: 'wind', 符: 'fire', 神: 'gold' };
/** 只有颜色时按色相猜 */
export function palOfColor(color: string | undefined): HfPal {
  if (!color) return 'gold';
  const [r, g, b] = color.split(',').map(Number);
  if (!(r >= 0)) return 'gold';
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx < 90) return 'ink';
  if (mx - mn < 30) return mx > 200 ? 'gold' : 'ink';
  if (r >= g && r >= b) return g > r * 0.75 ? 'gold' : b > g * 1.3 ? 'void' : 'fire';
  if (g >= r && g >= b) return b > g * 0.85 ? 'frost' : 'venom';
  return r > g * 1.2 ? 'void' : g > r * 1.5 ? 'frost' : 'thunder';
}
export function palOf(fx?: string, school?: string, color?: string): HfPal {
  return (fx && FX_PAL[fx]) || (school && SCHOOL_PAL[school]) || palOfColor(color);
}
/** 三维模块的配色名（新配的四种由 gl/hitfeelgl.ts 登记进 hsfx3d 的配色表） */
const PAL3D: Record<HfPal, string> = { fire: 'fire', gold: 'gold', ink: 'hf_ink', frost: 'frost', void: 'hf_void', venom: 'hf_venom', thunder: 'hf_thunder', earth: 'hf_earth', wind: 'hf_wind' };
const BOOM_SFX: Record<HfPal, HfSfx> = { fire: 'hfBoomFire', gold: 'hfBoomGold', ink: 'hfBoomInk', frost: 'hfBoomFrost', void: 'hfBoomVoid', venom: 'hfBoomVenom', thunder: 'hfBoomThunder', earth: 'hfBoomEarth', wind: 'hfBoomWind' };

// ---------------------------------------------------------------- 立体特效（直接排进三维模块的队列：不走它自带的爆炸声，声音这里按系别配）
function push3d(g: Game, e: Partial<Fx3dEv> & Pick<Fx3dEv, 'k' | 'x' | 'y'>) {
  const S = fx3dOf(g);
  S.q.push({ z: 0, x2: 0, y2: 0, z2: 0, r: 0, p: 1, dur: 0, n: 0, dir: 0, spread: Math.PI, up: 1, delay: 0, vx: 0, vy: 0, vz: 0, col: null, ...e } as Fx3dEv);
  S.stats.ev++;
  if (S.q.length > FX3D.queueMax) { S.q.shift(); S.stats.dropped++; }
}
/** 四层立体爆炸（白核 → 火焰 → 余烬 → 烟）。power < 2.4（不出半屏大的火球闪：不许长时间满屏发白） */
export function hfBlast3D(g: Game, x: number, y: number, z: number, power: number, pal: HfPal, r: number, delay = 0) {
  push3d(g, { k: 'blast', x, y, z, p: Math.min(2.2, power), r, pal: PAL3D[pal] as Fx3dPalette, delay });
}
/** 一圈扭曲冲击波（立体的薄球壳 + 屏幕空间的折射） */
export function hfWarp(g: Game, x: number, y: number, z: number, r: number, power = 0.9, dur = 0.45) { push3d(g, { k: 'warp', x, y, z, r, p: power, dur }); }
/** 贴地一圈激波环 */
export function hfRing(g: Game, x: number, y: number, z: number, r: number, col: RGB3 | null = null, dur = 0.34) { push3d(g, { k: 'ring', x, y, z, x2: 0, y2: 0, z2: 1, r, p: 1, col, dur }); }
/** 焦痕（几秒后余烬熄、再淡掉） */
export function hfScorch(g: Game, x: number, y: number, r: number, dur = 5) { push3d(g, { k: 'scorch', x, y, r, dur }); }
/** 碎石 */
export function hfDebris(g: Game, x: number, y: number, o: { n: number; r: number; power: number; dir: number; spread: number; up: number; z: number; size: number; hot?: boolean }) {
  push3d(g, { k: 'debris', x, y, z: o.z, n: o.n, r: o.r, p: o.power, dir: o.dir, spread: o.spread, up: o.up, dur: o.size, col: o.hot ? [0.7, 0.3, 0.15] : null });
}

// ---------------------------------------------------------------- 一笔命中
interface Rec {
  ev: FxEvent | null;
  who: Enemy | 'p'; src: Enemy | 'p' | null;
  x: number; y: number; z: number; dir: number;
  frac: number; crit: boolean; kind?: string; skill?: string; school?: string; sword: boolean;
  ward0: boolean; brk0: number; kill: boolean; big: boolean; wk: HfWeapon;
  /** 撼山客的特殊招式：它自己出打击表现 */
  skip: boolean;
}

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class HitFeel {
  private q: Rec[] = [];
  /** 测试 / 交付说明用的计数 */
  stats = { hit: 0, t1: 0, t2: 0, t3: 0, skipped: 0, far: 0, sfx: 0, merged: 0, flash: 0, blast: 0, pop: 0 };
  private t3At: number[] = [];
  private sfxAt = new Map<string, number>();
  private blastAt: number[] = []; private popAt: number[] = [];
  /** 妖兽（没有人形姿势可照着画的）闪白到什么时候（performance.now 毫秒）：combatfx 画它时再盖一层白 */
  readonly beastFlash = new WeakMap<Enemy, number>();
  constructor(readonly c: Combat) {}
  get pending() { return this.q.length > 0; }

  /** 主角方打中敌人（hitEnemy 里，扣血之后） */
  enemyHit(e: Enemy, ev: FxEvent, o: { frac: number; crit: boolean; kind?: string; skill?: string; school?: string; sword: boolean; ward0: boolean; brk0: number; fx: number; fy: number }) {
    const c = this.c, kind = o.kind;
    const wk: HfWeapon = kind ? (kind === 'qi' ? 'sword' : kind === 'impact' || kind === 'bump' ? 'fist' : c.brawl.wk) : 'spell';
    this.q.push({ ev, who: e, src: 'p', x: e.x, y: e.y, z: e.flyH + e.lift, dir: ev.dir ?? 0, frac: o.frac, crit: o.crit, kind, skill: o.skill, school: o.school, sword: o.sword,
      ward0: o.ward0, brk0: o.brk0, kill: false, big: isBoss(e) || !!e.affix, wk, skip: !!kind && !STD_BRAWL.has(kind) });
    this.stats.hit++;
  }
  /** NPC 之间（只在主角看得见的近处调；远处粗模拟不经过这里） */
  npcHit(src: Enemy | undefined, t: Enemy, ev: FxEvent, frac: number) {
    const c = this.c;
    let wk: HfWeapon = 'spell';
    if (src) {
      const close = Math.hypot(src.x - t.x, src.y - t.y) < 260;
      if (src.def.kind !== 'human') wk = close ? 'beast' : 'spell';
      else if (close) wk = (formOfLook(src.look)?.kind as HfWeapon | undefined) ?? 'fist';
    }
    const skip = !!src && !!c.brawl.peek(src)?.move;   // 特殊招式（撼山客那几招）打的：它自己出星闪
    this.q.push({ ev, who: t, src: src ?? null, x: t.x, y: t.y, z: t.flyH + t.lift, dir: ev.dir ?? 0, frac, crit: false, sword: false,
      ward0: false, brk0: c.brawl.peek(t)?.breakT ?? 0, kill: false, big: isBoss(t) || !!t.affix, wk, skip });
    this.stats.hit++;
  }
  /** 主角挨打（hitPlayer 里，扣血之后）。dir：从出手的人指向你 */
  playerHit(ev: FxEvent, dir: number, frac: number, big: boolean, src?: Enemy) {
    const g = this.c.game, p = g.player;
    let wk: HfWeapon = 'spell';
    if (src && Math.hypot(src.x - p.x, src.y - p.y) < 260) wk = src.def.kind !== 'human' ? 'beast' : (formOfLook(src.look)?.kind as HfWeapon | undefined) ?? 'fist';
    const skip = !!src && !!this.c.brawl.peek(src)?.move;
    this.q.push({ ev, who: 'p', src: src ?? null, x: p.x, y: p.y, z: p.z, dir, frac, crit: big, sword: false, ward0: false, brk0: 0, kill: false, big: false, wk, skip });
    this.stats.hit++;
  }
  /** 这一帧被打死了（kill / npcKill 里调） */
  killed(e: Enemy) { for (const r of this.q) if (r.who === e) r.kill = true; }

  /** 这一帧撼山客的招式在这个人身上出过星闪（p1fx.hit 推的 p1star）：不重复 */
  private p1Near(r: Rec): boolean {
    for (const f of this.c.fxq as unknown as { k: string; x: number; y: number }[]) if (f.k === 'p1star' && Math.abs(f.x - r.x) < 140 && Math.abs(f.y - r.y) < 140) return true;
    return false;
  }

  /** 这一秒里大爆炸还不多（加料——往上翻的第二团火、碎块——只在不忙的时候加） */
  get calm(): boolean { const now = nowMs(); return this.blastAt.filter((t) => now - t < 1000).length <= 2 && this.c.enemies.length < HF.crowd; }
  /** 爆炸限流：这一秒里还能不能再出一个（pop：弹着点的小爆） */
  allowBlast(pop: boolean): boolean {
    const now = nowMs(), L = pop ? this.popAt : this.blastAt, max = pop ? HF.popPerSec : HF.blastPerSec;
    while (L.length && now - L[0] > 1000) L.shift();
    if (L.length >= max) return false;
    L.push(now); if (pop) this.stats.pop++; else this.stats.blast++;
    return true;
  }
  /** 一个爆炸的声音（各系一种；同一系 60 毫秒内只响一次） */
  boomSfx(pal: HfPal, x: number, y: number, pop: boolean, vol = 1) { this.sfx(pop ? 'hfPop' : BOOM_SFX[pal], x, y, vol, pop ? 50 : 60); }
  private sfx(k: HfSfx, x: number, y: number, vol: number, gap: number): boolean {
    const now = nowMs(), last = this.sfxAt.get(k);
    if (last !== undefined && now - last < gap) { this.stats.merged++; return false; }
    this.sfxAt.set(k, now); this.stats.sfx++;
    try { audio.hf(k, x, y, vol); } catch { /* 声卡出错不拖垮战斗 */ }
    return true;
  }

  /** 这一帧的命中定档、出声、顿帧 / 慢放 / 震屏、立体特效 */
  flush() {
    if (!this.q.length) return;
    const q = this.q; this.q = [];
    if (!hfSetting.on) return;   // 关掉：原来的画法（事件不带档位）
    const c = this.c, g = c.game, lv = hfLevel(g), now = nowMs(), cam = g.cam;
    while (this.t3At.length && now - this.t3At[0] > HF.t3Win) this.t3At.shift();
    let flashes = 0, skids = 0, slow = false;
    const flashMax = c.enemies.length >= HF.crowd ? HF.flashCrowd : HF.flashMax;
    const sounds = new Map<HfSfx, { x: number; y: number; n: number; pri: number }>();
    for (const r of q) {
      if (r.skip || this.p1Near(r)) { this.stats.skipped++; continue; }
      const d = Math.hypot(r.x - cam.x, r.y - cam.y);
      if (d > HF.far) { if (r.ev) r.ev.tier = 0; this.stats.far++; continue; }   // 远处：只做数值
      const e = r.who === 'p' ? null : r.who;
      let tier: HfTier;
      if (!e) tier = r.crit ? 2 : 1;
      else {
        const brk = c.brawl.peek(e)?.breakT ?? 0;
        tier = hfTier({ frac: r.frac, crit: r.crit, kind: r.kind, skill: r.skill, sword: r.sword, wardBreak: r.ward0 && !e.ward, poiseBreak: r.brk0 <= 0 && brk > 0,
          kill: r.kill, bigFoe: r.big, launched: !!r.kind && LAUNCH_BRAWL.has(r.kind) && c.brawl.isAir(e) });
      }
      if (tier === 3 && this.t3At.length >= HF.t3Max) tier = 2;   // 大招一下扫中一群：只有头两个炸开
      if (tier === 3) this.t3At.push(now);
      const vis: 0 | 1 | 2 = d < HF.near ? lv : 0;
      if (r.ev) { r.ev.tier = tier; r.ev.wk = r.wk; r.ev.lod = vis; if (!e) r.ev.red = true; }
      this.stats[tier === 1 ? 't1' : tier === 2 ? 't2' : 't3']++;
      const involve = r.who === 'p' || r.src === 'p' || d < 700;
      // 被打者闪白：人形照此刻的姿势再画一遍压成白（你挨打是偏红的）；妖兽在 combatfx 里盖一层白
      if (flashes < flashMax && d < HF.near) {
        flashes++; this.stats.flash++;
        const fr = tier === 1 ? 1 : 2, dur = fr / 60 + 0.002;
        try {
          if (!e) p1(c.brawl).flash('p', '255,150,140', dur);
          else if (e.cs && e.look) p1(c.brawl).flash(e, '255,255,255', dur);
          else this.beastFlash.set(e, now + fr * 17);
        } catch { /* 画人出错不拖垮战斗 */ }
      }
      // 单位级顿帧（近战框架自己的那几下由它按兵器谱冻住；这里补法术、法器、NPC 互殴）
      if (e && !e.dead && !r.kind) {
        const T = tier === 1 ? (r.frac >= 0.04 ? 1 / 60 : 0) : tier === 2 ? 0.045 : 0.07;
        if (T > 0) c.brawl.hitFreeze(e, T);
      }
      // 震屏：轻的只在跟你有关时轻轻一下；重的轻微；终的明显，再慢放 0.15 秒（你挨打的震屏 hitPlayer 自己有）
      if (e && tier === 1 && involve) g.juice(0, 0.04 + Math.min(0.08, r.frac));
      else if (e && tier === 2 && involve) g.juice(0, 0.14);
      else if (e && tier === 3) { g.juice(0, 0.42); if (involve) slow = true; }
      // 后滑拖土（重以上、贴地的）：脚下一路冒土（立体的尘团；平面的土粒在 hitfeelgl 里随命中一起崩）。
      // 原来还借撼山客的 p1slide 铺一大片贴地的尘，近镜头里是被打的人脚下一大团发白的雾，拿掉了
      if (tier >= 2 && e && !e.dead && skids < HF.skidMax && e.z < 40 && vis > 0) {
        skids++;
        const E = e; fx3dOf(g).skid(() => (E.dead || E.gone ? null : { x: E.x, y: E.y, z: E.z }), tier === 3 ? 0.5 : 0.32);
      }
      // 重兵：终档砸出立体的碎屑（重档只有平面的碎屑：立体碎石会带起一团尘，近镜头里在人脚下糊成一片）
      if (r.wk === 'heavy' && tier >= 3 && vis >= 1) hfDebris(g, r.x, r.y, { n: tier === 3 ? 10 : 5, r: 40, power: 0.55, dir: r.dir, spread: 0.9, up: 0.6, z: Math.max(0, r.z) + 50, size: 0.5 });
      // 终：四层立体爆炸 + 一圈扭曲冲击波；打死的尸身顺着这一下的方向飞出去
      if (tier === 3) {
        if (vis >= 1) {
          const pal: HfPal = r.wk === 'spell' ? palOf(undefined, r.school, (r.ev?.color as string | undefined)) : r.wk === 'sword' || r.wk === 'spear' ? 'gold' : 'fire';
          // 炸在被打的人身后（顺着打击方向挪开一截）：白核不把人整个吞掉
          const ox = Math.cos(r.dir) * 135, oy = Math.sin(r.dir) * 135, z = Math.max(0, r.z) + 70;
          hfBlast3D(g, r.x + ox, r.y + oy, z, vis === 2 ? 1.05 : 0.85, pal, vis === 2 ? 90 : 75);   // 白核半径约 50：挪开 135 不压在人身上
          hfWarp(g, r.x + ox, r.y + oy, z, vis === 2 ? 220 : 170, 0.5, 0.32);   // 扭曲冲击波收小、挪到爆心（原来罩住被打的人一整颗球、还拉出一圈色散）
          this.stats.blast++;
        }
        const T = e as (Enemy & { toss?: { vx: number; vy: number; vz: number } }) | null;
        if (T?.dead && T.toss) { T.toss.vx *= 1.7; T.toss.vy *= 1.7; T.toss.vz *= 1.2; }
      }
      // 声音：先按「这一下是什么、几档」归类，同一帧同一种合并成一声
      const k = sfxOf(r.wk, tier, !e), s = sounds.get(k);
      if (s) s.n++; else sounds.set(k, { x: r.x, y: r.y, n: 1, pri: tier * 10 + (e ? 0 : 5) });
    }
    if (slow) g.slowmo(0.15);
    // 放声音：一帧最多三种，重的先；同一种隔 45 毫秒才再响（几下叠在一起音量略大）
    let played = 0;
    for (const [k, s] of [...sounds].sort((a, b) => b[1].pri - a[1].pri)) {
      if (played >= HF.sfxPerFrame) { this.stats.merged += s.n; continue; }
      if (this.sfx(k, s.x, s.y, Math.min(1, 0.8 + 0.1 * Math.log2(s.n + 1)), HF.sfxGap)) played++;
      this.stats.merged += s.n - 1;
    }
  }
  reset() { this.q = []; this.t3At = []; this.blastAt = []; this.popAt = []; }
  /**
   * 三维模块的世界钟（后滑拖土的尘团、焦痕都按它走）原来只有撼山客的招式每帧推一下；他不在附近时由这里推。
   * 这一帧已经有别人推过（钟和上回推完时对不上）就不再推，免得走双倍
   */
  private last3d = NaN;
  tick3d(dt: number) {
    const S = fx3dPeekOf(this.c.game); if (!S || !S.busy) { this.last3d = NaN; return; }
    if (S.now !== this.last3d && !Number.isNaN(this.last3d)) { this.last3d = S.now; return; }
    S.tick(dt); this.last3d = S.now;
  }
}

/** 命中声：兵器各一套，你挨打一套，拳脚 / 法术 / 爪牙按档 */
function sfxOf(wk: HfWeapon, tier: HfTier, hurt: boolean): HfSfx {
  if (hurt) return tier >= 2 ? 'hfHurtHeavy' : 'hfHurt';
  if (tier === 3) return 'hfFin';
  if (wk === 'sword') return tier === 2 ? 'hfSwordHeavy' : 'hfSword';
  if (wk === 'heavy') return tier === 2 ? 'hfBluntHeavy' : 'hfBlunt';
  if (wk === 'spear') return tier === 2 ? 'hfSpearHeavy' : 'hfSpear';
  return tier === 2 ? 'hfHeavy' : 'hfLight';
}

const ALL = new WeakMap<Combat, HitFeel>();
/** 这一场的打击感（第一次用到时建） */
export function hitFeel(c: Combat): HitFeel { let h = ALL.get(c); if (!h) { h = new HitFeel(c); ALL.set(c, h); } return h; }
/** 画面那边用：有没有建过（没建过就什么都不做） */
export function hitFeelPeek(c: Combat): HitFeel | undefined { return ALL.get(c); }
