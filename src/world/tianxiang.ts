// 突破天象终极重制（纯代码实时绘制 · 零静态人物贴图 · 大世界实机天象 + 全屏 HDR 仙家异象）
// 四重境界层层递进：
//   · 筑基（灵液化海 · 六合青玉八卦阵 · 双螺旋灵带 · 青莲绽放）
//   · 结丹（百川归鼎 · 九宫子午金丹阵 · 三重丹劫紫雷 · 九转金丹凝丸 · 金霞贯日）
//   · 结婴（周天星斗太极古阵 · 万剑悬空朝宗 · 九重紫霄神雷至万雷齐发 · 极昼黑白破丹闪帧 ·
//          十六道破壳神芒 · 百六十枚金丹星璇倒卷 · 九品功德金莲 · 纯代码元婴真灵 + 百丈元婴法相显圣 ·
//          大日紫府神轮 · 九重仙门洞开 · 紫气东来三万里）
//   · 化神（太虚五色混沌大阵 · 苍穹虚空星河裂隙 · 八道天道法则锁链崩断 · 五色元神法天象地 · 人界之巅）
import type { Game } from './game';
import { CharState, drawCharacter, HANLI_LOOK, type Look } from '../gfx/character';
import { audio } from './audio';

export type TxKind = 'zhuji' | 'jiedan' | 'jieying' | 'huashen';
type G = CanvasRenderingContext2D;

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (k: number) => { k = clamp01(k); return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; };
const smooth = (a: number, b: number, x: number) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

interface Ribbon {
  a: number; r: number; rMax: number; sp: number; w: number; col: string; ph: number; zOff: number;
  hist: [number, number][];
}
interface Bolt {
  pts: [number, number][];
  branches: [number, number][][];
  t: number; dur: number; w: number; col: string; finale?: boolean;
}
interface Shard {
  x: number; y: number; vx: number; vy: number; t: number; s: number; rot: number; vr: number;
  sides: number; col: string;
}
interface FloatRock {
  a: number; r: number; h: number; sp: number; sz: number; rot: number; vr: number; sword?: boolean;
}
interface Petal {
  x: number; y: number; vx: number; vy: number; t: number; s: number; rot: number; col: string;
}
interface LawChain {
  a: number; broken: boolean; breakT: number; vib: number;
}
interface VoidRift {
  x: number; y: number; len: number; ang: number; w: number;
}

const BAGUA_BITS = [7, 6, 5, 4, 3, 2, 1, 0]; // 乾兑离震巽坎艮坤 三爻
const ZHI_RUNES = '子丑寅卯辰巳午未申酉戌亥';
const DAO_RUNES = '乾坤震巽坎离艮兑太虚阴阳造化玄黄紫府元神天道无极';
const WUXING_RGB = ['255,216,115', '120,245,175', '115,205,255', '255,125,95', '215,155,255'];

interface Theme {
  main: string;
  glow: [number, number, number];
  subGlow: [number, number, number];
  bolt: string;
  txt: string;
  subTxt: string;
  seal: string;
}

const PALETTE: Record<TxKind, Theme> = {
  zhuji: {
    main: '#9cf0ff',
    glow: [130, 232, 255],
    subGlow: [255, 232, 165],
    bolt: '165,235,255',
    txt: '大道筑基',
    subTxt: '灵液化海 · 百脉俱通 · 自此超凡脱俗',
    seal: '築基',
  },
  jiedan: {
    main: '#ffd875',
    glow: [255, 214, 108],
    subGlow: [255, 148, 82],
    bolt: '255,220,140',
    txt: '九转金丹',
    subTxt: '金霞贯日 · 丹成一啸 · 寿享五百春秋',
    seal: '結丹',
  },
  jieying: {
    main: '#ffeaa0',
    glow: [255, 228, 138],
    subGlow: [198, 142, 255],
    bolt: '212,168,255',
    txt: '碎丹成婴',
    subTxt: '百丈法相 · 万道朝宗 · 紫气东来三万里',
    seal: '元嬰',
  },
  huashen: {
    main: '#f5b8ff',
    glow: [242, 168, 255],
    subGlow: [255, 215, 128],
    bolt: '255,150,245',
    txt: '元神化道',
    subTxt: '法则臣服 · 人界之巅 · 两千载与天同寿',
    seal: '化神',
  },
};

interface PlanDef {
  dur: number;
  gather: [number, number];
  storm: [number, number];
  bolts: number[];
  hush: number;
  burst: number;
  birth: [number, number];
  awaken: number;
  text: number;
}

const PLAN: Record<TxKind, PlanDef> = {
  zhuji: {
    dur: 12.5,
    gather: [0, 4.8],
    storm: [3.2, 6.8],
    bolts: [4.8, 6.1],
    hush: 6.4,
    burst: 7.0,
    birth: [7.2, 11.2],
    awaken: 7.8,
    text: 8.1,
  },
  jiedan: {
    dur: 18.5,
    gather: [0, 5.5],
    storm: [3.8, 10.6],
    bolts: [5.8, 7.8, 9.6],
    hush: 10.1,
    burst: 11.0,
    birth: [11.3, 17.0],
    awaken: 12.2,
    text: 12.8,
  },
  jieying: {
    dur: 27.5,
    gather: [0, 6.2],
    storm: [4.5, 14.1],
    bolts: [6.2, 7.6, 8.9, 10.0, 11.0, 11.9, 12.7, 13.4, 14.0],
    hush: 14.15,
    burst: 15.4,
    birth: [15.7, 25.2],
    awaken: 18.1,
    text: 19.0,
  },
  huashen: {
    dur: 28.5,
    gather: [0, 6.4],
    storm: [4.5, 14.5],
    bolts: [6.0, 7.3, 8.5, 9.6, 10.6, 11.5, 12.4, 13.2, 14.0, 14.4],
    hush: 14.55,
    burst: 15.8,
    birth: [16.1, 26.2],
    awaken: 18.6,
    text: 19.5,
  },
};

/** 递归中点位移分形雷电生成（纯几何折线，绝无贴图） */
function buildFractalBolt(
  x0: number, y0: number, x1: number, y1: number,
  depth: number, sway: number, branches: [number, number][][],
): [number, number][] {
  let pts: [number, number][] = [[x0, y0], [x1, y1]];
  let disp = sway;
  for (let d = 0; d < depth; d++) {
    const next: [number, number][] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const mx = (a[0] + b[0]) * 0.5 + rnd(-disp, disp);
      const my = (a[1] + b[1]) * 0.5 + rnd(-disp * 0.28, disp * 0.28);
      next.push([mx, my], b);
      if (d <= 2 && Math.random() < 0.28 && branches.length < 18) {
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const ang = Math.atan2(dy, dx) + (Math.random() < 0.5 ? 1 : -1) * rnd(0.35, 0.85);
        const len = Math.hypot(dx, dy) * rnd(0.55, 0.95);
        const sub = buildFractalBolt(mx, my, mx + Math.cos(ang) * len, my + Math.sin(ang) * len, Math.max(2, depth - d - 2), disp * 0.55, branches);
        branches.push(sub);
      }
    }
    pts = next;
    disp *= 0.52;
  }
  return pts;
}

/** 程序化绘制八卦单卦三爻 */
function drawTrigram(ctx: G, bits: number, w: number, h: number) {
  const gap = h / 3;
  for (let row = 0; row < 3; row++) {
    const yang = ((bits >> row) & 1) === 1;
    const y = (row - 1) * gap;
    ctx.beginPath();
    if (yang) {
      ctx.moveTo(-w * 0.5, y);
      ctx.lineTo(w * 0.5, y);
    } else {
      ctx.moveTo(-w * 0.5, y);
      ctx.lineTo(-w * 0.12, y);
      ctx.moveTo(w * 0.12, y);
      ctx.lineTo(w * 0.5, y);
    }
    ctx.stroke();
  }
}

/** 程序化绘制阴阳太极双鱼图 */
function drawTaiji(ctx: G, r: number, colA: string, colB: string) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
  ctx.arc(0, r * 0.5, r * 0.5, Math.PI / 2, -Math.PI / 2, true);
  ctx.arc(0, -r * 0.5, r * 0.5, Math.PI / 2, -Math.PI / 2, false);
  ctx.closePath();
  ctx.fillStyle = colA;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI / 2, -Math.PI / 2, false);
  ctx.arc(0, -r * 0.5, r * 0.5, -Math.PI / 2, Math.PI / 2, false);
  ctx.arc(0, r * 0.5, r * 0.5, -Math.PI / 2, Math.PI / 2, true);
  ctx.closePath();
  ctx.fillStyle = colB;
  ctx.fill();

  ctx.fillStyle = colB;
  ctx.beginPath(); ctx.arc(0, -r * 0.5, r * 0.14, 0, TAU); ctx.fill();
  ctx.fillStyle = colA;
  ctx.beginPath(); ctx.arc(0, r * 0.5, r * 0.14, 0, TAU); ctx.fill();
  ctx.restore();
}

export class Tianxiang {
  kind: TxKind | null = null;
  ok = true;
  t = 0;
  dur = 0;
  /** 画面暗化、整屏闪白（供 render.ts 读取） */
  gloom = 0;
  flash = 0;
  flashCol: [number, number, number] = [1, 1, 1];

  private ribbons: Ribbon[] = [];
  private bolts: Bolt[] = [];
  private shards: Shard[] = [];
  private rocks: FloatRock[] = [];
  private petals: Petal[] = [];
  private chains: LawChain[] = [];
  private rifts: VoidRift[] = [];
  private cracks: [number, number][][] = [];
  private ringT: number[] = [];

  private boltI = 0;
  private burstDone = false;
  private birthBell = false;
  private awakenDone = false;
  private said = new Set<string>();
  private lift = 0;
  private shieldHit = 0;
  private impactFrameT = 0;
  private px = 0;
  private py = 0;
  private look: Look = HANLI_LOOK;
  private soulSt = new CharState(0, 0);
  private savedZoom = 0.85;

  get active() { return !!this.kind; }
  get phase(): 'gather' | 'storm' | 'burst' | 'birth' | 'after' | 'none' {
    if (!this.kind) return 'none';
    const P = PLAN[this.kind];
    if (this.t < P.storm[0]) return 'gather';
    if (this.t < P.burst) return 'storm';
    if (this.t < P.birth[0]) return 'burst';
    if (this.t < P.birth[1]) return 'birth';
    return 'after';
  }

  start(kind: TxKind, ok: boolean, g: Game) {
    this.kind = kind;
    this.ok = ok;
    this.t = 0;
    const P = PLAN[kind];
    this.dur = ok ? P.dur : Math.min(P.dur, P.burst + 4.4);
    this.ribbons = [];
    this.bolts = [];
    this.shards = [];
    this.rocks = [];
    this.petals = [];
    this.chains = [];
    this.rifts = [];
    this.cracks = [];
    this.ringT = [];

    this.boltI = 0;
    this.burstDone = false;
    this.birthBell = false;
    this.awakenDone = false;
    this.said.clear();
    this.lift = 0;
    this.shieldHit = 0;
    this.impactFrameT = 0;
    this.gloom = 0;
    this.flash = 0;

    this.px = g.player.x;
    this.py = g.player.y;
    this.look = g.player.look || HANLI_LOOK;
    this.soulSt = new CharState(0, 0);
    this.soulSt.yaw = this.soulSt.targetYaw = Math.PI / 2;
    this.soulSt.setAction('sit');
    (this.soulSt as any).blend = 1;
    for (let i = 0; i < 20; i++) this.soulSt.update(1 / 60);

    this.savedZoom = clamp(g.cam.targetZoom || 0.85, 0.55, 1.4);

    const big = kind === 'jieying' || kind === 'huashen';
    const C = PALETTE[kind];

    // 1. 灵气长河丝带
    const nRib = kind === 'zhuji' ? 85 : kind === 'jiedan' ? 140 : 230;
    for (let i = 0; i < nRib; i++) {
      const rMax = (big ? 980 : 680) + Math.random() * (big ? 750 : 480);
      const col = big
        ? WUXING_RGB[i % WUXING_RGB.length]
        : i % 3 === 0
        ? `${C.subGlow[0]},${C.subGlow[1]},${C.subGlow[2]}`
        : `${C.glow[0]},${C.glow[1]},${C.glow[2]}`;
      this.ribbons.push({
        a: Math.random() * TAU,
        r: 180 + Math.random() * rMax,
        rMax,
        sp: 0.65 + Math.random() * 0.95,
        w: 1.4 + Math.random() * (big ? 2.8 : 2.0),
        col,
        ph: Math.random() * TAU,
        zOff: rnd(-40, 120),
        hist: [],
      });
    }

    // 2. 反重力浮石与万剑朝宗悬剑
    const nRocks = kind === 'zhuji' ? 16 : kind === 'jiedan' ? 28 : 54;
    for (let i = 0; i < nRocks; i++) {
      const sword = big && i % 2 === 0;
      this.rocks.push({
        a: (i / nRocks) * TAU + rnd(-0.1, 0.1),
        r: sword ? 120 + (i % 4) * 68 + rnd(-14, 14) : 75 + Math.random() * (big ? 330 : 210),
        h: Math.random() * 24,
        sp: (sword ? 0.32 : 0.18) + Math.random() * 0.25,
        sz: sword ? 22 + Math.random() * 14 : 4 + Math.random() * 7,
        rot: Math.random() * TAU,
        vr: rnd(-2.2, 2.2),
        sword,
      });
    }

    // 3. 金丹龟裂纹路（16 道分叉裂隙）
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * TAU + rnd(-0.14, 0.14);
      const pts: [number, number][] = [[0, 0]];
      let x = 0, y = 0, ang = a0;
      const steps = 6 + ((i * 3) % 4);
      for (let s = 0; s < steps; s++) {
        ang += rnd(-0.42, 0.42);
        const step = (1 / steps) * rnd(0.85, 1.18);
        x += Math.cos(ang) * step;
        y += Math.sin(ang) * step;
        const d = Math.hypot(x, y);
        if (d >= 1) { pts.push([x / d, y / d]); break; }
        pts.push([x, y]);
      }
      this.cracks.push(pts);
    }

    // 4. 化神专属：八道天道法则锁链 + 苍穹虚空裂隙
    if (kind === 'huashen') {
      for (let i = 0; i < 8; i++) {
        this.chains.push({ a: (i / 8) * TAU + 0.22, broken: false, breakT: 0, vib: 0 });
      }
      for (let i = 0; i < 6; i++) {
        this.rifts.push({
          x: rnd(-0.36, 0.36),
          y: rnd(-0.40, -0.14),
          len: rnd(140, 260),
          ang: rnd(-0.45, 0.45),
          w: rnd(10, 22),
        });
      }
    }

    g.player.sitting = true;
    g.cinema(g.player.x, g.player.y - 75, big ? 1.16 : 1.14, this.dur);
    this.playToneChord([130.8, 196.0, 261.6], 3.2, 0.04);
    audio.sfx('chime');
    this.exclaim(g, 'gather');
  }

  skip(g: Game) {
    if (!this.kind) return;
    this.end(g);
  }

  private playToneChord(freqs: number[], dur: number, vol = 0.045) {
    const A: any = audio;
    const c: AudioContext | null = A.ctx;
    if (!c || !A.enabled) return;
    try {
      const now = c.currentTime;
      for (const f of freqs) {
        const osc = c.createOscillator();
        const gn = c.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now);
        gn.gain.setValueAtTime(0.0001, now);
        gn.gain.exponentialRampToValueAtTime(vol, now + 0.18);
        gn.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        osc.connect(gn);
        gn.connect(A.revIn || A.sfxBus || c.destination);
        osc.start(now);
        osc.stop(now + dur + 0.05);
      }
    } catch { /* ignore */ }
  }

  update(dt: number, g: Game) {
    if (!this.kind) return;
    const k = this.kind, P = PLAN[k], p = g.player, st = p.st;
    const big = k === 'jieying' || k === 'huashen';
    this.t += dt;
    this.px = p.x;
    this.py = p.y;
    this.look = p.look || HANLI_LOOK;
    this.soulSt.update(dt);
    const t = this.t;
    p.sitting = true;

    // ---- 四幕电影级镜头推拉编排 ----
    let wantZoom = big ? 1.14 : 1.18;
    if (t >= P.storm[0] && t < P.hush) {
      wantZoom = big ? 1.00 : 1.08;
    } else if (t >= P.hush && t < P.burst) {
      // 碎丹前寂静特写猛推镜头！
      const hk = ease(smooth(P.hush, P.burst - 0.12, t));
      wantZoom = (big ? 1.00 : 1.08) + hk * (big ? 0.52 : 0.34);
    } else if (t >= P.burst && t < P.birth[1]) {
      // 碎丹炸裂瞬间拉远展现百丈法相与九重仙门！
      const bk = smooth(P.burst, P.burst + 0.55, t);
      wantZoom = (big ? 1.52 : 1.42) - bk * (big ? 0.44 : 0.28);
    } else if (t >= P.birth[1]) {
      wantZoom = this.savedZoom;
    }
    g.cine.x = p.x;
    g.cine.y = p.y - (big && t >= P.birth[0] ? 115 : 75);
    g.cine.z += (wantZoom - g.cine.z) * Math.min(1, dt * (t >= P.burst && t < P.burst + 0.6 ? 9 : 2.6));
    g.cine.dur = Math.max(g.cine.dur, 0.5);

    // ---- 天色压暗（衬托顶层 HDR 雷劫与金莲法相） ----
    const maxDark = k === 'zhuji' ? 0.42 : k === 'jiedan' ? 0.62 : 0.78;
    const wantGloom = !this.ok && t > P.burst
      ? maxDark * 0.7 * (1 - smooth(P.burst, P.burst + 3.2, t))
      : maxDark * smooth(P.gather[0] + 0.6, P.storm[0] + 1.8, t) * (1 - smooth(P.birth[1] - 1.2, this.dur, t) * 0.75);
    this.gloom += (wantGloom - this.gloom) * Math.min(1, dt * 2.5);
    this.flash = Math.max(0, this.flash - dt * (this.flash > 0.6 ? 2.1 : 3.2));
    this.shieldHit = Math.max(0, this.shieldHit - dt * 2.8);
    this.impactFrameT = Math.max(0, this.impactFrameT - dt);

    // ---- 主角凌空盘坐悬浮 ----
    const wantLift = k === 'zhuji'
      ? smooth(P.storm[0], P.burst, t) * 18 * (1 - smooth(P.birth[1], this.dur, t))
      : (smooth(P.storm[0], P.storm[0] + 3, t) * 32 + smooth(P.burst, P.burst + 1.4, t) * 44) * (1 - smooth(P.birth[1], this.dur - 0.4, t));
    this.lift += (wantLift - this.lift) * Math.min(1, dt * 2.2);
    if (this.lift > 0.5) st.lift = this.lift;

    // ---- 灵气长河螺旋倒灌 ----
    const gk = smooth(P.gather[0], P.gather[0] + 2.2, t);
    const suckBoost = t >= P.hush && t < P.burst ? 5.2 : 1;
    for (const rb of this.ribbons) {
      if (t < P.burst) {
        const pull = (0.45 + gk * 1.25) * rb.sp * suckBoost;
        rb.r -= pull * 155 * dt;
        rb.a += (1.1 + 190 / Math.max(36, rb.r)) * dt * rb.sp * 0.72;
        if (rb.r <= 18) {
          rb.r = rb.rMax * rnd(0.75, 1.15);
          rb.a = Math.random() * TAU;
          rb.hist.length = 0;
        }
      } else if (this.ok) {
        // 出世期：化作冲霄环绕灵带
        rb.r = 90 + (rb.rMax * 0.45) * ((rb.ph / TAU));
        rb.a += dt * rb.sp * 1.4;
      } else {
        rb.r += 340 * dt;
      }
      const rx = Math.cos(rb.a) * rb.r;
      const ry = Math.sin(rb.a) * rb.r * 0.46 - (1 - clamp01(rb.r / 520)) * 55;
      rb.hist.push([rx, ry]);
      if (rb.hist.length > 9) rb.hist.shift();
    }

    // ---- 浮石与悬空飞剑更新 ----
    for (const rk of this.rocks) {
      rk.a += rk.sp * dt * (t >= P.hush && t < P.burst ? 2.4 : 1);
      rk.rot += rk.vr * dt;
      const targetH = t < P.burst
        ? smooth(P.gather[0] + 1, P.burst, t) * (rk.sword ? 115 : 85)
        : this.ok && rk.sword
        ? 115 + smooth(P.birth[0], P.birth[0] + 2.2, t) * 520
        : Math.max(0, 85 * (1 - smooth(P.burst, P.burst + 1.8, t)));
      rk.h += (targetH - rk.h) * Math.min(1, dt * 3.5);
    }

    // ---- 九霄神雷劈落 ----
    while (this.boltI < P.bolts.length && t >= P.bolts[this.boltI]) {
      const idx = this.boltI++;
      const isFinale = idx === P.bolts.length - 1 && big;
      this.strike(g, idx, isFinale);
    }
    for (const b of this.bolts) b.t += dt;
    this.bolts = this.bolts.filter((b) => b.t < b.dur);

    // ---- 法则锁链震颤 ----
    for (const ch of this.chains) {
      ch.vib = Math.max(0, ch.vib - dt * 3);
      if (ch.broken) ch.breakT += dt;
    }

    // ---- 碎丹 / 凝丹 / 破茧核心爆发 ----
    if (!this.burstDone && t >= P.burst) {
      this.burstDone = true;
      if (this.ok) {
        if (big) this.impactFrameT = 0.11; // 极昼黑白张力闪帧！
        this.flash = k === 'zhuji' ? 0.65 : 1.0;
        this.flashCol = k === 'huashen' ? [1, 0.88, 1] : k === 'zhuji' ? [0.85, 0.98, 1] : [1, 0.97, 0.86];
        g.juice(big ? 0.11 : 0.06, big ? 1.15 : 0.65);
        g.aberrKick = Math.max(g.aberrKick, big ? 1.4 : 0.7);
        const fx = (g.renderer as any)?.fx;
        if (fx) {
          fx.shock(p.x, p.y - 70, big ? 1450 : 850, big ? 28 : 16, big ? 1.05 : 0.7);
          setTimeout(() => fx.shock(p.x, p.y - 70, big ? 1850 : 950, big ? 20 : 10, 0.95), 160);
        }
        audio.sfx(k === 'zhuji' ? 'break' : 'boom');
        setTimeout(() => audio.sfx('thunder'), 90);
        this.playToneChord(big ? [146.8, 220, 293.7, 440, 587.3] : [196, 293.7, 392], 4.2, 0.06);

        this.ringT = [0, -0.18, -0.36, -0.56];
        for (const ch of this.chains) { ch.broken = true; ch.breakT = 0; }

        const nShards = k === 'zhuji' ? 32 : k === 'jiedan' ? 68 : 165;
        for (let i = 0; i < nShards; i++) {
          const a = Math.random() * TAU;
          const sp = (big ? 320 : 220) + Math.random() * (big ? 780 : 420);
          this.shards.push({
            x: Math.cos(a) * rnd(2, 18),
            y: Math.sin(a) * rnd(2, 18),
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp * 0.78 - rnd(30, 130),
            t: 0,
            s: (big ? 4.5 : 3) + Math.random() * (big ? 9.5 : 5.5),
            rot: Math.random() * TAU,
            vr: rnd(-14, 14),
            sides: 3 + (i % 3),
            col: k === 'huashen' ? WUXING_RGB[i % WUXING_RGB.length] : i % 4 === 0 ? '255,255,255' : `${PALETTE[k].glow.join(',')}`,
          });
        }
        g.renderer?.burst(p.x, p.y - 75, PALETTE[k].main, big ? 120 : 70);
        this.exclaim(g, 'burst');
      } else {
        this.flash = 0.9;
        this.flashCol = [1, 0.25, 0.22];
        g.juice(0.12, 0.95);
        g.aberrKick = Math.max(g.aberrKick, 1.1);
        (g.renderer as any)?.fx?.shock(p.x, p.y - 70, 900, 22, 0.8);
        audio.sfx('fail');
        audio.sfx('thunder');
        for (let i = 0; i < 85; i++) {
          const a = Math.random() * TAU, v = 90 + Math.random() * 340;
          this.shards.push({
            x: 0, y: 0, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.55 - 60,
            t: 0, s: 3 + Math.random() * 6, rot: Math.random() * TAU, vr: rnd(-10, 10),
            sides: 3, col: '255,85,70',
          });
        }
        this.exclaim(g, 'fail');
      }
    }

    for (let i = 0; i < this.ringT.length; i++) this.ringT[i] += dt;

    // ---- 碎片运动：结婴/化神成功时悬停并化作星璇倒卷凝婴！ ----
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.t += dt;
      if (this.ok && big) {
        if (s.t < 0.65) {
          const drag = Math.exp(-3.4 * dt);
          s.vx *= drag; s.vy *= drag;
        } else {
          // 银河双螺旋倒卷归元！
          const pull = clamp01((s.t - 0.65) / 0.85);
          const d = Math.hypot(s.x, s.y) + 1;
          const nx = -s.x / d, ny = -s.y / d;
          s.vx += (nx * 1350 - ny * 680) * pull * dt;
          s.vy += (ny * 1350 + nx * 680) * pull * dt;
          s.vx *= Math.exp(-1.8 * dt);
          s.vy *= Math.exp(-1.8 * dt);
          if (d < 16 && s.t > 1.0) { this.shards.splice(i, 1); continue; }
        }
      } else {
        s.vy += (this.ok ? 180 : 480) * dt;
        s.vx *= Math.exp(-1.5 * dt);
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.vr * dt;
      if (s.t > (this.ok ? 2.6 : 3.2)) this.shards.splice(i, 1);
    }

    // ---- 出世异象：金莲、百丈法相开眼、仙鹤朝拜、漫天灵雨 ----
    if (this.ok && t >= P.birth[0]) {
      if (!this.birthBell) {
        this.birthBell = true;
        audio.sfx('bell');
        setTimeout(() => audio.sfx('chime'), 420);
        this.exclaim(g, 'birth');
        (g.life as any).summonCranes?.(p.x, p.y, k === 'zhuji' ? 2 : big ? 6 : 4);
      }
      if (!this.awakenDone && t >= P.awaken) {
        this.awakenDone = true;
        // 元婴 / 法相睁眼一震！
        this.flash = Math.max(this.flash, big ? 0.55 : 0.32);
        this.flashCol = k === 'huashen' ? [1, 0.9, 1] : [1, 0.96, 0.82];
        g.juice(0.05, big ? 0.65 : 0.35);
        g.aberrKick = Math.max(g.aberrKick, big ? 0.95 : 0.4);
        (g.renderer as any)?.fx?.shock(p.x, p.y - 120, big ? 1600 : 900, big ? 20 : 10, 0.85);
        audio.sfx('bell');
        this.playToneChord([261.6, 329.6, 392.0, 523.3, 659.3], 5.0, 0.055);
      }
      const maxPetals = k === 'zhuji' ? 55 : big ? 165 : 105;
      if (this.petals.length < maxPetals && t < P.birth[1]) {
        for (let i = 0; i < 4; i++) {
          this.petals.push({
            x: rnd(-0.55, 0.55),
            y: rnd(-0.62, -0.45),
            vx: rnd(-0.04, 0.04),
            vy: rnd(0.08, 0.17),
            t: 0,
            s: rnd(4, big ? 9.5 : 7),
            rot: Math.random() * TAU,
            col: k === 'huashen'
              ? (i % 2 === 0 ? '#f6b8ff' : '#ffe8a8')
              : k === 'zhuji'
              ? (i % 2 === 0 ? '#a8f4ff' : '#fff4c8')
              : (i % 3 === 0 ? '#ffd0dc' : i % 3 === 1 ? '#ffe694' : '#fffaf0'),
          });
        }
      }
      if (t >= P.text && !this.said.has('text')) {
        this.said.add('text');
        audio.sfx('gain');
      }
    }
    for (const f of this.petals) {
      f.t += dt;
      f.x += (f.vx + Math.sin(f.t * 2.2 + f.rot) * 0.035) * dt;
      f.y += f.vy * dt;
      f.rot += dt * 1.9;
    }
    this.petals = this.petals.filter((f) => f.y < 0.62 && f.t < 12);

    if (t >= this.dur) this.end(g);
  }

  private strike(g: Game, idx: number, finale: boolean) {
    const k = this.kind!, C = PALETTE[k], p = g.player;
    const count = finale ? 5 : 1;
    for (let m = 0; m < count; m++) {
      const spread = finale ? (m - 2) * 145 + rnd(-25, 25) : rnd(-70, 70);
      const tx = finale ? (m - 2) * 26 : rnd(-10, 10);
      const branches: [number, number][][] = [];
      const pts = buildFractalBolt(spread, -920, tx, -68 - this.lift, 6, finale ? 105 : 82, branches);
      const boltCol = k === 'jieying'
        ? (idx < 3 ? '175,220,255' : idx < 6 ? '255,195,120' : '218,155,255')
        : C.bolt;
      this.bolts.push({
        pts,
        branches,
        t: 0,
        dur: finale ? 0.68 : 0.44,
        w: finale ? 5.5 + (m === 2 ? 2.5 : 0) : 3.4 + Math.min(3, idx * 0.35),
        col: boltCol,
        finale,
      });
    }
    this.shieldHit = 1;
    for (const ch of this.chains) ch.vib = 1;
    if (finale) this.impactFrameT = 0.07;
    this.flash = Math.max(this.flash, finale ? 0.92 : 0.48 + Math.min(0.28, idx * 0.04));
    this.flashCol = k === 'huashen' ? [0.98, 0.82, 1] : [0.92, 0.90, 1];
    g.juice(finale ? 0.07 : 0.025, finale ? 0.92 : 0.48 + idx * 0.04);
    g.aberrKick = Math.max(g.aberrKick, finale ? 1.15 : 0.45);
    (g.renderer as any)?.fx?.shock(p.x, p.y - 70, finale ? 1150 : 560, finale ? 22 : 11, finale ? 0.75 : 0.45);
    audio.sfx('thunder');
    if (finale) audio.sfx('boom');
    g.renderer?.burst(p.x, p.y - 75 - this.lift, k === 'huashen' ? '#f5b0ff' : '#ebe0ff', finale ? 65 : 28);
    if (idx === 1) this.exclaim(g, 'storm');
  }

  /** 周围修士驻足、惊呼、跪拜 */
  private exclaim(g: Game, when: 'gather' | 'storm' | 'burst' | 'birth' | 'fail') {
    if (this.said.has(when)) return;
    this.said.add(when);
    const k = this.kind!;
    const name = k === 'zhuji' ? '筑基' : k === 'jiedan' ? '结丹' : k === 'jieying' ? '结婴' : '化神';
    const L: Record<string, string[]> = {
      gather: ['天地灵气怎会如此狂暴？！', '有人在此冲击大境界！', '快看脚下的古阵灵光！', '方圆百里的灵气都在倒灌！'],
      storm: ['九霄劫雷！这是' + name + '天劫！', '快退！莫被天威波及！', '这雷劫威势……简直骇人听闻！', '苍穹都要裂开了！'],
      burst: k === 'zhuji'
        ? ['灵液化海，道基成了！', '恭喜前辈大道筑基！']
        : k === 'jiedan'
        ? ['九转金霞！他结成金丹了！', '丹成一啸动百里，拜见结丹宗师！']
        : k === 'jieying'
        ? ['碎丹成婴！！百丈元婴法相！', '跪下！快跪下参拜元婴老祖！', '紫气东来三万里……此生竟能亲眼得见真君出世！', '参见元婴大修士！']
        : ['法则锁链断了……是化神！！', '天哪！人界竟又出了一尊化神老怪！', '五体投地，叩见化神神君！！'],
      birth: ['九重仙门虚影都显化了……', '万剑朝宗，灵鹤来仪！', '恭贺前辈证就大道！', '此等旷世天象，足以载入人界史册！'],
      fail: ['不好——灵光溃散，功败垂成了！', '天威难测，可惜啊……', '快退开，莫被反噬气浪伤着！'],
    };
    const r = k === 'zhuji' ? 1600 : k === 'jiedan' ? 3000 : 5200;
    (g.npcs as any).exclaim?.(
      g.player.x,
      g.player.y,
      r,
      L[when],
      when === 'burst' || when === 'birth' ? (k === 'jieying' || k === 'huashen' ? 'kneel' : 'bow') : 'watch',
    );
  }

  private end(g: Game) {
    const k = this.kind;
    if (!k) return;
    this.kind = null;
    this.gloom = 0;
    this.flash = 0;
    this.lift = 0;
    this.impactFrameT = 0;
    g.player.st.lift = 0;
    g.cine.dur = 0;
    g.cam.targetZoom = this.savedZoom;
    if (this.ok && k !== 'zhuji') g.ascendDone?.();
    g.updateUI(true);
  }

  // ============================================================================
  // 第一层：大地图世界坐标绘制（脚下周天古阵、地裂熔金、浮石与万剑悬空、地面震波）
  // ============================================================================
  drawWorld(ctx: G, _z: number) {
    if (!this.kind) return;
    const k = this.kind, P = PLAN[k], C = PALETTE[k], T = this.t;
    const px = this.px, py = this.py;
    const big = k === 'jieying' || k === 'huashen';
    const [gr, gg, gb] = C.glow;
    const [sr, sg, sb] = C.subGlow;

    ctx.save();

    // 1. 地面周天星斗 / 八卦太极 / 五行混沌大阵
    const ak = smooth(P.gather[0], P.gather[0] + 2.0, T) * (1 - smooth(this.dur - 2.2, this.dur, T));
    if (ak > 0.01) {
      const R0 = (k === 'zhuji' ? 165 : k === 'jiedan' ? 250 : k === 'jieying' ? 375 : 430) * (0.85 + 0.15 * ease(smooth(0, 2.2, T)));
      const pulse = 0.82 + 0.18 * Math.sin(T * 5.2);

      // 地裂金泉（结丹以上，随风暴蔓延）
      if (k !== 'zhuji' && T > P.storm[0] + 0.8) {
        const ck = smooth(P.storm[0] + 0.8, P.storm[0] + 4.5, T) * (1 - smooth(this.dur - 2.8, this.dur, T));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        const nCracks = big ? 14 : 8;
        for (let i = 0; i < nCracks; i++) {
          const baseA = (i / nCracks) * TAU + 0.31;
          const L = (R0 * 0.55 + ((i * 53) % 140)) * ck;
          for (const [lw, al, white] of [[6, 0.24, false], [2.2, 0.78, true]] as [number, number, boolean][]) {
            ctx.strokeStyle = white ? `rgba(255,250,230,${al * ck * pulse})` : `rgba(${gr},${gg},${gb},${al * ck})`;
            ctx.lineWidth = lw;
            ctx.beginPath();
            ctx.moveTo(px, py + 4);
            for (let s = 1; s <= 6; s++) {
              const u = s / 6;
              const sway = Math.sin(s * 2.7 + i * 1.9) * 0.18;
              ctx.lineTo(px + Math.cos(baseA + sway) * L * u, py + 4 + Math.sin(baseA + sway) * L * u * 0.46);
            }
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      // 透视压扁的地面多层阵盘
      ctx.save();
      ctx.translate(px, py + 6);
      ctx.scale(1, 0.46);
      ctx.globalCompositeOperation = 'lighter';

      // 阵底柔光海
      const baseGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, R0 * 1.08);
      baseGrad.addColorStop(0, `rgba(${gr},${gg},${gb},${0.34 * ak * pulse})`);
      baseGrad.addColorStop(0.55, `rgba(${sr},${sg},${sb},${0.16 * ak})`);
      baseGrad.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
      ctx.fillStyle = baseGrad;
      ctx.beginPath(); ctx.arc(0, 0, R0 * 1.08, 0, TAU); ctx.fill();

      // 阵心阴阳太极图（结婴 / 化神 / 结丹）
      if (k !== 'zhuji') {
        ctx.save();
        ctx.rotate(T * 0.9);
        drawTaiji(
          ctx,
          R0 * 0.24,
          `rgba(255,248,220,${0.42 * ak * pulse})`,
          `rgba(${sr},${sg},${sb},${0.36 * ak * pulse})`,
        );
        ctx.restore();
      }

      // 多重逆向旋转阵环与刻度
      const rings = k === 'zhuji' ? 3 : k === 'jiedan' ? 4 : 5;
      for (let rIdx = 0; rIdx < rings; rIdx++) {
        const rr = R0 * (1 - rIdx * 0.165);
        const dir = rIdx % 2 === 0 ? 1 : -1;
        const rot = T * (0.32 + rIdx * 0.12) * dir;
        const ringCol = rIdx % 2 === 1 ? `${sr},${sg},${sb}` : `${gr},${gg},${gb}`;
        ctx.strokeStyle = `rgba(${ringCol},${(0.72 - rIdx * 0.1) * ak * pulse})`;
        ctx.lineWidth = rIdx === 0 ? 3.4 : rIdx === 1 ? 2.2 : 1.6;
        ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();

        // 周天刻度线
        if (rIdx <= 2) {
          const ticks = rIdx === 0 ? 64 : rIdx === 1 ? 32 : 16;
          ctx.lineWidth = 1.3;
          for (let j = 0; j < ticks; j++) {
            const a = rot + (j / ticks) * TAU;
            const len = j % 8 === 0 ? 18 : j % 2 === 0 ? 10 : 5;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
            ctx.lineTo(Math.cos(a) * (rr - len), Math.sin(a) * (rr - len));
            ctx.stroke();
          }
        }
      }

      // 交错星芒多边形（六芒/八芒/十二芒星轨）
      const polyN = k === 'zhuji' ? 6 : k === 'huashen' ? 5 : 8;
      for (let layer = 0; layer < 2; layer++) {
        const rot = -T * 0.38 * (layer ? -1 : 1) + (layer * Math.PI) / polyN;
        const pr = R0 * (layer ? 0.82 : 0.66);
        ctx.strokeStyle = `rgba(${layer ? `${sr},${sg},${sb}` : `${gr},${gg},${gb}`},${0.48 * ak})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let j = 0; j <= polyN; j++) {
          const step = k === 'huashen' ? (j * 2) % polyN : j % polyN;
          const a = rot + (step / polyN) * TAU;
          const x = Math.cos(a) * pr, y = Math.sin(a) * pr;
          if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }

      // 八卦三爻真形（纯几何绘制）
      ctx.save();
      ctx.rotate(T * 0.24);
      ctx.strokeStyle = `rgba(255,250,228,${0.82 * ak * pulse})`;
      ctx.lineWidth = 2.4;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        ctx.save();
        ctx.translate(Math.cos(a) * R0 * 0.74, Math.sin(a) * R0 * 0.74);
        ctx.rotate(a + Math.PI / 2);
        drawTrigram(ctx, BAGUA_BITS[i], R0 * 0.09, R0 * 0.075);
        ctx.restore();
      }
      ctx.restore();

      // 外圈古篆符文（结丹 / 结婴 / 化神）
      if (k !== 'zhuji') {
        ctx.save();
        ctx.rotate(-T * 0.22);
        const nRunes = big ? 18 : 12;
        ctx.font = `bold ${Math.round(R0 * 0.075)}px "Ma Shan Zheng","Noto Serif SC",serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(255,245,205,${0.85 * ak * pulse})`;
        for (let i = 0; i < nRunes; i++) {
          const a = (i / nRunes) * TAU;
          ctx.save();
          ctx.translate(Math.cos(a) * R0 * 0.91, Math.sin(a) * R0 * 0.91);
          ctx.rotate(a + Math.PI / 2);
          ctx.fillText((big ? DAO_RUNES : ZHI_RUNES)[i % (big ? DAO_RUNES.length : ZHI_RUNES.length)], 0, 0);
          ctx.restore();
        }
        ctx.restore();
      }

      // 二十八宿星轨连线与阵眼星辰（结婴 / 化神）
      const nNodes = k === 'zhuji' ? 6 : 8;
      for (let i = 0; i < nNodes; i++) {
        const a = -T * 0.35 + (i / nNodes) * TAU;
        const nx = Math.cos(a) * R0, ny = Math.sin(a) * R0;
        const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, 24);
        ng.addColorStop(0, `rgba(255,255,255,${0.95 * ak})`);
        ng.addColorStop(0.35, `rgba(${gr},${gg},${gb},${0.65 * ak})`);
        ng.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
        ctx.fillStyle = ng;
        ctx.beginPath(); ctx.arc(nx, ny, 24, 0, TAU); ctx.fill();
      }
      ctx.restore();

      // 阵眼冲霄细光柱（世界立面，环绕主角八方）
      if (big || k === 'jiedan') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const pCount = big ? 8 : 6;
        const pH = (big ? 280 : 170) * ak * pulse;
        for (let i = 0; i < pCount; i++) {
          const a = -T * 0.35 + (i / pCount) * TAU;
          const bx = px + Math.cos(a) * R0, by = py + 6 + Math.sin(a) * R0 * 0.46;
          const pg = ctx.createLinearGradient(bx, by, bx, by - pH);
          const cStr = k === 'huashen' ? WUXING_RGB[i % WUXING_RGB.length] : `${gr},${gg},${gb}`;
          pg.addColorStop(0, `rgba(${cStr},${0.58 * ak})`);
          pg.addColorStop(1, `rgba(${cStr},0)`);
          ctx.fillStyle = pg;
          ctx.fillRect(bx - 3.5, by - pH, 7, pH);
        }
        ctx.restore();
      }
    }

    // 2. 反重力浮石与万剑朝宗悬空灵剑
    if (ak > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const rk of this.rocks) {
        if (rk.h < 2 || rk.h > 560) continue;
        const x = px + Math.cos(rk.a) * rk.r;
        const y = py + Math.sin(rk.a) * rk.r * 0.46 - rk.h;
        const al = clamp01(rk.h / 30) * (1 - clamp01((rk.h - 420) / 140)) * ak;
        if (rk.sword) {
          // 纯几何矢量飞剑：剑气拖尾 + 剑锋 + 剑格
          ctx.save();
          ctx.translate(x, y);
          const tilt = Math.sin(T * 4 + rk.a) * 0.06;
          ctx.rotate(tilt);
          const sg2 = ctx.createLinearGradient(0, rk.sz * 1.4, 0, -rk.sz);
          sg2.addColorStop(0, `rgba(${gr},${gg},${gb},0)`);
          sg2.addColorStop(0.5, `rgba(${gr},${gg},${gb},${0.45 * al})`);
          sg2.addColorStop(1, `rgba(255,255,255,${0.95 * al})`);
          ctx.fillStyle = sg2;
          ctx.beginPath();
          ctx.moveTo(0, -rk.sz);
          ctx.lineTo(3.2, rk.sz * 0.45);
          ctx.lineTo(0, rk.sz * 0.65);
          ctx.lineTo(-3.2, rk.sz * 0.45);
          ctx.closePath();
          ctx.fill();
          // 剑格护手
          ctx.strokeStyle = `rgba(255,240,185,${0.9 * al})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-7, rk.sz * 0.36); ctx.lineTo(7, rk.sz * 0.36); ctx.stroke();
          // 剑尾灵丝
          ctx.strokeStyle = `rgba(${sr},${sg},${sb},${0.35 * al})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(0, rk.sz * 0.55); ctx.lineTo(0, rk.sz * 1.8); ctx.stroke();
          ctx.restore();
        } else {
          // 多边形灵晶碎岩
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(rk.rot);
          ctx.fillStyle = `rgba(${gr},${gg},${gb},${0.65 * al})`;
          ctx.beginPath();
          ctx.moveTo(-rk.sz, -rk.sz * 0.4);
          ctx.lineTo(0, -rk.sz);
          ctx.lineTo(rk.sz * 0.9, -rk.sz * 0.2);
          ctx.lineTo(rk.sz * 0.5, rk.sz * 0.8);
          ctx.lineTo(-rk.sz * 0.7, rk.sz * 0.6);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();
    }

    // 3. 地面扩散冲击波神环
    for (const rt of this.ringT) {
      if (rt < 0 || rt > 2.4) continue;
      const u = rt / 2.4;
      const rr = ease(u) * (big ? 1950 : 1050);
      const a = (1 - u) * 0.88;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${gr},${gg},${gb},${a})`;
      ctx.lineWidth = 18 * (1 - u) + 2;
      ctx.beginPath(); ctx.ellipse(px, py, rr, rr * 0.46, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${a * 0.75})`;
      ctx.lineWidth = 4 * (1 - u) + 1;
      ctx.beginPath(); ctx.ellipse(px, py, rr * 0.97, rr * 0.46 * 0.97, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  // ============================================================================
  // 第二层：全屏 HDR 顶层天象（不受昼夜阴云压暗！雷劫、碎丹、九品金莲、元婴与百丈法相）
  // ============================================================================
  drawScreen(ctx: G, W: number, H: number, dpr: number, glMode: boolean, camX = this.px, camY = this.py, z = 1) {
    if (!this.kind) return;
    const k = this.kind, P = PLAN[k], C = PALETTE[k], T = this.t;
    const big = k === 'jieying' || k === 'huashen';
    const [gr, gg, gb] = C.glow;
    const [sr, sg, sb] = C.subGlow;

    const sx = W * 0.5 + (this.px - camX) * z;
    const sy = H * 0.5 + (this.py - camY) * z;
    const headY = sy - (68 + this.lift) * z;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // ---- 0. 极昼黑白动画闪帧（Impact Frame：碎丹/终劫瞬间 2~6 帧超高张力黑白放射闪光！） ----
    if (this.impactFrameT > 0.001) {
      const inv = this.impactFrameT > 0.055;
      ctx.save();
      ctx.fillStyle = inv ? '#08060c' : '#fffdf6';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = inv ? '#fffdf6' : '#0b0812';
      ctx.fillStyle = inv ? '#fffdf6' : '#0b0812';
      const cy = headY;
      // 72 道穿透全屏的张力放射速度线
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * TAU + (i % 3) * 0.02;
        const rIn = (45 + (i * 29) % 75) * z;
        const rOut = Math.max(W, H) * 1.3;
        const wAng = 0.008 + ((i * 7) % 5) * 0.004;
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a) * rIn, cy + Math.sin(a) * rIn);
        ctx.lineTo(sx + Math.cos(a - wAng) * rOut, cy + Math.sin(a - wAng) * rOut);
        ctx.lineTo(sx + Math.cos(a + wAng) * rOut, cy + Math.sin(a + wAng) * rOut);
        ctx.closePath();
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(sx, cy, 42 * z, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.restore();
      return;
    }

    // ---- 1. 苍穹雷渊星璇漩涡 & 化神虚空星河裂隙 ----
    const stormK = smooth(P.storm[0], P.storm[0] + 2.8, T) * (1 - (this.ok ? smooth(P.birth[0], P.birth[0] + 2.6, T) : smooth(P.burst, P.burst + 2.4, T)));
    if (stormK > 0.01) {
      const vx = sx, vy = Math.max(50, sy - (big ? 340 : 270) * z);
      const vR = Math.max(W, H) * (big ? 0.58 : 0.42);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // 雷眼核心涡光
      const eyeG = ctx.createRadialGradient(vx, vy, 0, vx, vy, vR * 0.65);
      eyeG.addColorStop(0, `rgba(${gr},${gg},${gb},${0.45 * stormK * (0.8 + 0.2 * Math.sin(T * 6))})`);
      eyeG.addColorStop(0.35, `rgba(${sr},${sg},${sb},${0.22 * stormK})`);
      eyeG.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = eyeG;
      ctx.beginPath(); ctx.ellipse(vx, vy, vR * 0.65, vR * 0.28, 0, 0, TAU); ctx.fill();

      // 6 条旋转星云旋臂（纯代码渐变曲线，零云团贴图）
      const arms = big ? 7 : 5;
      ctx.lineCap = 'round';
      for (let aIdx = 0; aIdx < arms; aIdx++) {
        ctx.beginPath();
        for (let i = 0; i <= 42; i++) {
          const u = i / 42;
          const ang = (aIdx / arms) * TAU + u * 4.8 - T * (1.1 + stormK * 0.6);
          const rr = (0.04 + u * 0.96) * vR;
          const x = vx + Math.cos(ang) * rr;
          const y = vy + Math.sin(ang) * rr * 0.34;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${aIdx % 2 ? `${sr},${sg},${sb}` : `${gr},${gg},${gb}`},${0.14 * stormK})`;
        ctx.lineWidth = (18 - (aIdx % 3) * 4) * stormK;
        ctx.stroke();
      }

      // 化神专属：苍穹撕裂出虚空星河裂隙
      if (k === 'huashen') {
        for (let rIdx = 0; rIdx < this.rifts.length; rIdx++) {
          const rf = this.rifts[rIdx];
          const rx = sx + rf.x * W, ry = sy + rf.y * H;
          const rw = rf.w * stormK;
          ctx.save();
          ctx.translate(rx, ry);
          ctx.rotate(rf.ang);
          ctx.fillStyle = `rgba(18,6,34,${0.88 * stormK})`;
          ctx.strokeStyle = `rgba(245,175,255,${0.9 * stormK})`;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(-rf.len * 0.5, 0);
          ctx.quadraticCurveTo(-rf.len * 0.15, -rw, 0, -rw * 0.85);
          ctx.quadraticCurveTo(rf.len * 0.2, -rw * 1.1, rf.len * 0.5, 0);
          ctx.quadraticCurveTo(rf.len * 0.15, rw, 0, rw * 0.9);
          ctx.quadraticCurveTo(-rf.len * 0.2, rw * 1.1, -rf.len * 0.5, 0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          // 裂隙内深空星芒
          ctx.fillStyle = `rgba(255,245,210,${0.9 * stormK})`;
          for (let stI = -3; stI <= 3; stI++) {
            ctx.beginPath();
            ctx.arc(stI * rf.len * 0.11, Math.sin(stI * 2.3 + T) * rw * 0.35, 1.6, 0, TAU);
            ctx.fill();
          }
          ctx.restore();
        }
      }
      ctx.restore();
    }

    // ---- 2. 化神专属：八道横贯天地的法则神链（突破瞬间寸寸崩断！） ----
    if (k === 'huashen' && T > P.storm[0] + 0.5) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const appear = smooth(P.storm[0] + 0.5, P.storm[0] + 2.5, T);
      for (const ch of this.chains) {
        if (ch.broken && ch.breakT > 1.3) continue;
        const fade = ch.broken ? 1 - ch.breakT / 1.3 : appear;
        const maxR = Math.max(W, H) * 0.78;
        const links = 22;
        for (let i = 2; i < links; i++) {
          const u = i / links;
          const explode = ch.broken ? ch.breakT * 220 * (1 - u * 0.5) * Math.sin(i * 3.1) : 0;
          const jit = ch.vib * Math.sin(T * 45 + i) * 5;
          const lx = sx + Math.cos(ch.a) * maxR * u + Math.sin(ch.a) * (jit + explode * 0.4);
          const ly = headY + Math.sin(ch.a) * maxR * u * 0.65 - Math.cos(ch.a) * jit + (ch.broken ? ch.breakT * ch.breakT * 140 : 0);
          ctx.save();
          ctx.translate(lx, ly);
          ctx.rotate(ch.a + (ch.broken ? ch.breakT * (i % 2 ? 5 : -5) : 0));
          ctx.strokeStyle = i % 2 ? `rgba(255,220,145,${0.75 * fade})` : `rgba(235,165,255,${0.75 * fade})`;
          ctx.lineWidth = i % 2 ? 2.4 : 1.8;
          ctx.beginPath();
          ctx.ellipse(0, 0, 14, i % 2 ? 5.5 : 2.2, 0, 0, TAU);
          ctx.stroke();
          ctx.restore();
        }
      }
      ctx.restore();
    }

    // ---- 3. 五行百川灵气丝带（丝滑发光曲线流） ----
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const rb of this.ribbons) {
      if (rb.hist.length < 2) continue;
      const distFade = clamp(1.15 - rb.r / (rb.rMax * 1.05), 0.08, 0.92);
      const endFade = 1 - smooth(this.dur - 2.4, this.dur, T);
      const al = distFade * endFade * (this.ok || T < P.burst ? 1 : 1 - smooth(P.burst, P.burst + 1.5, T));
      if (al <= 0.01) continue;
      ctx.strokeStyle = `rgba(${rb.col},${al * 0.62})`;
      ctx.lineWidth = rb.w * Math.max(0.75, z);
      ctx.beginPath();
      for (let i = 0; i < rb.hist.length; i++) {
        const [hx, hy] = rb.hist[i];
        const px2 = sx + hx * z, py2 = headY + hy * z;
        if (i === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
      }
      ctx.stroke();
      const [lx, ly] = rb.hist[rb.hist.length - 1];
      const cx2 = sx + lx * z, cy2 = headY + ly * z;
      ctx.fillStyle = `rgba(255,255,255,${al * 0.92})`;
      ctx.beginPath(); ctx.arc(cx2, cy2, rb.w * 0.95 * Math.max(0.75, z), 0, TAU); ctx.fill();
    }
    ctx.restore();

    // ---- 4. 护体金钟道纹罩 & 碎丹前龟裂金丹特写（十六道破壳体积神芒！） ----
    if (T < P.burst) {
      const auraK = smooth(P.gather[0] + 0.4, P.gather[1], T);
      if (auraK > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // 筑基双螺旋青玉灵带
        if (k === 'zhuji') {
          for (let hIdx = 0; hIdx < 2; hIdx++) {
            ctx.strokeStyle = hIdx ? `rgba(255,235,165,${0.7 * auraK})` : `rgba(130,238,255,${0.8 * auraK})`;
            ctx.lineWidth = 3 * z;
            ctx.beginPath();
            for (let s = 0; s <= 32; s++) {
              const u = s / 32;
              const ang = u * TAU * 2.5 - T * 4.5 + hIdx * Math.PI;
              const rr = (58 * (1 - u * 0.55) + Math.sin(T * 3) * 4) * z;
              const x = sx + Math.cos(ang) * rr, y = sy - u * 165 * z;
              if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
        }

        // 受雷击时显形的六合护体金钟罩
        const domeA = (0.16 * auraK + this.shieldHit * 0.72) * (T >= P.storm[0] ? 1 : 0.35);
        if (domeA > 0.02) {
          const dR = 68 * z, dH = 135 * z;
          const dg = ctx.createRadialGradient(sx, sy - dH * 0.48, 4, sx, sy - dH * 0.48, dH * 0.75);
          dg.addColorStop(0, `rgba(255,255,255,${0.08 * domeA})`);
          dg.addColorStop(0.75, `rgba(${gr},${gg},${gb},${0.32 * domeA})`);
          dg.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
          ctx.fillStyle = dg;
          ctx.beginPath();
          ctx.moveTo(sx - dR, sy);
          ctx.bezierCurveTo(sx - dR * 1.15, sy - dH * 0.65, sx - dR * 0.45, sy - dH, sx, sy - dH);
          ctx.bezierCurveTo(sx + dR * 0.45, sy - dH, sx + dR * 1.15, sy - dH * 0.65, sx + dR, sy);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = `rgba(255,248,215,${0.75 * domeA})`;
          ctx.lineWidth = 2.2;
          ctx.stroke();
        }

        // 结丹 / 结婴 / 化神：胸前悬停的九转金丹（结婴/化神时寸寸龟裂并射出 16 道刺目破壳神芒！）
        if (k !== 'zhuji' && T > P.storm[0] + 0.8) {
          const dk = smooth(P.storm[0] + 0.8, P.burst - 0.2, T);
          const crackP = big ? ease(smooth(P.storm[1] - 2.6, P.burst - 0.05, T)) : 0;
          const jitX = crackP > 0.2 ? rnd(-4.5, 4.5) * crackP * z : 0;
          const jitY = crackP > 0.2 ? rnd(-4.5, 4.5) * crackP * z : 0;
          const cx = sx + jitX, cy = headY - 22 * z + jitY;
          const coreR = (k === 'jiedan' ? 10 + dk * 18 : 22 + crackP * 10) * Math.max(0.85, z);

          // 破壳神芒（从裂缝中刺出的体积光锥！）
          if (crackP > 0.08) {
            const nRays = Math.min(16, Math.ceil(crackP * 16));
            for (let rI = 0; rI < nRays; rI++) {
              const a = (rI / 16) * TAU + Math.sin(rI * 3.1) * 0.15 + T * 0.18;
              const rayL = (80 + crackP * 380 + (rI % 3) * 65) * z;
              const wA = 0.025 + crackP * 0.045;
              const rg = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * rayL, cy + Math.sin(a) * rayL);
              rg.addColorStop(0, `rgba(255,255,255,${0.95 * crackP})`);
              rg.addColorStop(0.4, `rgba(${gr},${gg},${gb},${0.55 * crackP})`);
              rg.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
              ctx.fillStyle = rg;
              ctx.beginPath();
              ctx.moveTo(cx, cy);
              ctx.lineTo(cx + Math.cos(a - wA) * rayL, cy + Math.sin(a - wA) * rayL);
              ctx.lineTo(cx + Math.cos(a + wA) * rayL, cy + Math.sin(a + wA) * rayL);
              ctx.closePath();
              ctx.fill();
            }
          }

          // 金丹外层日冕光晕
          const haloG = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 3.4);
          haloG.addColorStop(0, `rgba(255,255,255,${0.9 * dk})`);
          haloG.addColorStop(0.35, `rgba(${gr},${gg},${gb},${0.65 * dk})`);
          haloG.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
          ctx.fillStyle = haloG;
          ctx.beginPath(); ctx.arc(cx, cy, coreR * 3.4, 0, TAU); ctx.fill();

          // 金丹金属质感球体本体
          ctx.globalCompositeOperation = 'source-over';
          const sphereG = ctx.createRadialGradient(cx - coreR * 0.32, cy - coreR * 0.32, coreR * 0.08, cx, cy, coreR);
          if (k === 'huashen') {
            sphereG.addColorStop(0, '#ffffff');
            sphereG.addColorStop(0.45, '#e8a8ff');
            sphereG.addColorStop(0.85, '#8a34c8');
            sphereG.addColorStop(1, '#3b1064');
          } else {
            sphereG.addColorStop(0, '#fffef5');
            sphereG.addColorStop(0.45, '#ffe074');
            sphereG.addColorStop(0.85, '#d68418');
            sphereG.addColorStop(1, '#6e3406');
          }
          ctx.fillStyle = sphereG;
          ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, TAU); ctx.fill();

          // 九转丹纹星环
          ctx.globalCompositeOperation = 'lighter';
          for (let rI = 0; rI < 2; rI++) {
            ctx.strokeStyle = `rgba(255,246,205,${0.7 * dk})`;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.ellipse(cx, cy, coreR * 1.55, coreR * 0.48, T * (rI ? -1.8 : 2.1) + rI, 0, TAU);
            ctx.stroke();
          }

          // 金丹表面炽白龟裂闪电纹
          if (crackP > 0.02) {
            const vis = Math.ceil(this.cracks.length * Math.min(1, crackP * 1.35));
            for (let i = 0; i < vis; i++) {
              const pts = this.cracks[i];
              for (const [lw, al] of [[coreR * 0.16, 0.45], [coreR * 0.055, 1]] as [number, number][]) {
                ctx.strokeStyle = `rgba(255,255,245,${al})`;
                ctx.lineWidth = Math.max(1.1, lw);
                ctx.beginPath();
                pts.forEach(([ux, uy], idx2) => {
                  const px3 = cx + ux * coreR, py3 = cy + uy * coreR;
                  if (idx2 === 0) ctx.moveTo(px3, py3); else ctx.lineTo(px3, py3);
                });
                ctx.stroke();
              }
            }
          }
        }
        ctx.restore();
      }
    }

    // ---- 5. 九霄分形等离子神雷（四层辉光叠加 + 地面炸裂电蛇） ----
    if (this.bolts.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const b of this.bolts) {
        const a = b.t < 0.09 ? 1 : clamp01(1 - (b.t - 0.09) / (b.dur - 0.09));
        const flick = 0.78 + 0.22 * Math.random();
        const passes: [number, string, number][] = [
          [b.w * 5.2, `rgba(${b.col},${0.20 * a * flick})`, 1],
          [b.w * 2.4, `rgba(${b.col},${0.55 * a * flick})`, 1],
          [b.w * 1.0, `rgba(235,245,255,${0.92 * a})`, 0.7],
          [b.w * 0.42, `rgba(255,255,255,${a})`, 0.45],
        ];
        for (const [lw, stCol, brMul] of passes) {
          ctx.strokeStyle = stCol;
          ctx.lineWidth = lw * Math.max(0.8, z);
          ctx.beginPath();
          b.pts.forEach(([bx, by], i) => {
            const x = sx + bx * z, y = sy + by * z;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          });
          ctx.stroke();
          ctx.lineWidth = lw * 0.5 * brMul * Math.max(0.75, z);
          for (const br of b.branches) {
            ctx.beginPath();
            br.forEach(([bx, by], i) => {
              const x = sx + bx * z, y = sy + by * z;
              if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();
          }
        }
        const endPt = b.pts[b.pts.length - 1];
        const ix = sx + endPt[0] * z, iy = sy + endPt[1] * z;
        const ir = (95 + b.t * 260) * z;
        const ig = ctx.createRadialGradient(ix, iy, 0, ix, iy, ir);
        ig.addColorStop(0, `rgba(255,255,255,${0.95 * a})`);
        ig.addColorStop(0.35, `rgba(${b.col},${0.55 * a})`);
        ig.addColorStop(1, `rgba(${b.col},0)`);
        ctx.fillStyle = ig;
        ctx.beginPath(); ctx.arc(ix, iy, ir, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    // ---- 6. 碎丹晶芒碎片（悬停 -> 双螺旋星璇倒卷凝婴） ----
    if (this.shards.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const s of this.shards) {
        const life = this.ok ? 2.6 : 3.2;
        const a = clamp01(1.25 - s.t / life);
        const x = sx + s.x * z, y = headY - 18 * z + s.y * z;
        const sz = s.s * Math.max(0.8, z);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(s.rot);
        const sg2 = ctx.createRadialGradient(0, 0, 0, 0, 0, sz * 2.4);
        sg2.addColorStop(0, `rgba(255,255,255,${0.9 * a})`);
        sg2.addColorStop(0.4, `rgba(${s.col},${0.55 * a})`);
        sg2.addColorStop(1, `rgba(${s.col},0)`);
        ctx.fillStyle = sg2;
        ctx.beginPath(); ctx.arc(0, 0, sz * 2.4, 0, TAU); ctx.fill();

        ctx.fillStyle = `rgba(255,252,235,${a})`;
        ctx.beginPath();
        for (let v = 0; v < s.sides; v++) {
          const va = (v / s.sides) * TAU;
          const vr = v % 2 === 0 ? sz : sz * 0.52;
          if (v === 0) ctx.moveTo(Math.cos(va) * vr, Math.sin(va) * vr);
          else ctx.lineTo(Math.cos(va) * vr, Math.sin(va) * vr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }

    // ---- 7. 终幕重头戏：贯日通天霞柱 · 九重仙门 · 九品功德金莲 · 纯代码元婴真灵 + 百丈元婴法相显圣！ ----
    if (this.ok && T >= P.birth[0]) {
      const bk = ease(smooth(P.birth[0], P.birth[0] + 1.3, T));
      const fade = 1 - smooth(this.dur - 2.6, this.dur - 0.25, T);
      const scale = Math.max(0.78, z);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // 7.1 紫气东来极光漫天霞幕（结婴 / 化神专属）
      if (big) {
        const auroraG = ctx.createLinearGradient(0, 0, W, H * 0.55);
        auroraG.addColorStop(0, `rgba(175,110,255,${0.20 * bk * fade})`);
        auroraG.addColorStop(0.5, `rgba(255,225,135,${0.26 * bk * fade})`);
        auroraG.addColorStop(1, `rgba(220,145,255,${0.12 * bk * fade})`);
        ctx.fillStyle = auroraG;
        ctx.fillRect(0, 0, W, H * 0.65);
      }

      // 7.2 贯日通天灵柱 + 双螺旋盘龙问仙光带
      const pw = (k === 'zhuji' ? 46 : k === 'jiedan' ? 78 : 132) * scale * (0.92 + 0.08 * Math.sin(T * 5));
      const pOuter = ctx.createLinearGradient(sx - pw * 2.2, 0, sx + pw * 2.2, 0);
      pOuter.addColorStop(0, `rgba(${sr},${sg},${sb},0)`);
      pOuter.addColorStop(0.3, `rgba(${sr},${sg},${sb},${0.22 * bk * fade})`);
      pOuter.addColorStop(0.5, `rgba(${gr},${gg},${gb},${0.52 * bk * fade})`);
      pOuter.addColorStop(0.7, `rgba(${sr},${sg},${sb},${0.22 * bk * fade})`);
      pOuter.addColorStop(1, `rgba(${sr},${sg},${sb},0)`);
      ctx.fillStyle = pOuter;
      ctx.fillRect(sx - pw * 2.2, 0, pw * 4.4, sy + 18 * scale);

      const pCore = ctx.createLinearGradient(sx - pw * 0.55, 0, sx + pw * 0.55, 0);
      pCore.addColorStop(0, `rgba(${gr},${gg},${gb},0)`);
      pCore.addColorStop(0.5, `rgba(255,255,255,${0.78 * bk * fade})`);
      pCore.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
      ctx.fillStyle = pCore;
      ctx.fillRect(sx - pw * 0.55, 0, pw * 1.1, sy + 10 * scale);

      // 双螺旋升天金龙光带缠柱而上
      for (let hIdx = 0; hIdx < 2; hIdx++) {
        ctx.strokeStyle = hIdx === 0
          ? `rgba(255,250,220,${0.65 * bk * fade})`
          : `rgba(${sr},${sg},${sb},${0.55 * bk * fade})`;
        ctx.lineWidth = (big ? 4.5 : 3) * scale;
        ctx.beginPath();
        const steps = 48;
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          const py2 = sy - u * (sy + 40);
          const ang = u * TAU * 3.2 - T * 4.2 + hIdx * Math.PI;
          const px2 = sx + Math.sin(ang) * pw * 0.72;
          if (s === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
        }
        ctx.stroke();
      }

      // 7.3 苍穹九重仙门洞开 + 二十四道天门圣光（结丹 / 结婴 / 化神）
      const gateY = Math.max(64, sy - (big ? 330 : 255) * scale);
      const nRays = k === 'zhuji' ? 8 : big ? 24 : 14;
      for (let i = 0; i < nRays; i++) {
        const a = T * 0.16 + (i / nRays) * TAU;
        const L = Math.max(W, H) * (0.55 + 0.2 * Math.sin(i * 1.9 + T * 1.7));
        const wA = 0.032 + 0.015 * Math.sin(i + T * 2);
        const rg = ctx.createLinearGradient(sx, gateY, sx + Math.cos(a) * L, gateY + Math.sin(a) * L * 0.55);
        rg.addColorStop(0, `rgba(255,252,235,${0.26 * bk * fade})`);
        rg.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.moveTo(sx, gateY);
        ctx.lineTo(sx + Math.cos(a - wA) * L, gateY + Math.sin(a - wA) * L * 0.55);
        ctx.lineTo(sx + Math.cos(a + wA) * L, gateY + Math.sin(a + wA) * L * 0.55);
        ctx.closePath();
        ctx.fill();
      }
      if (big) {
        // 纯几何绘制九重仙门玉阙立柱与飞檐虚影
        const gw = 115 * scale * bk, gh = 86 * scale * bk;
        ctx.strokeStyle = `rgba(255,242,190,${0.52 * bk * fade})`;
        ctx.lineWidth = 2.6;
        for (const side of [-1, 1]) {
          const gx = sx + side * gw;
          const colG = ctx.createLinearGradient(gx, gateY + gh * 0.5, gx, gateY - gh);
          colG.addColorStop(0, `rgba(255,235,175,0)`);
          colG.addColorStop(0.5, `rgba(255,238,185,${0.48 * bk * fade})`);
          colG.addColorStop(1, `rgba(255,255,255,${0.7 * bk * fade})`);
          ctx.fillStyle = colG;
          ctx.fillRect(gx - 6 * scale, gateY - gh * 0.85, 12 * scale, gh * 1.35);
        }
        // 仙门飞檐双曲横梁
        for (let tier = 0; tier < 2; tier++) {
          const ty = gateY - gh * (0.68 + tier * 0.24);
          const span = gw * (1.28 - tier * 0.16);
          ctx.beginPath();
          ctx.moveTo(sx - span, ty - 10 * scale);
          ctx.quadraticCurveTo(sx, ty + 12 * scale, sx + span, ty - 10 * scale);
          ctx.stroke();
        }
      }

      // 7.4 主角脚下 / 丹田绽放二十四瓣三层九品功德道莲（纯代码贝塞尔花瓣，绝无贴图！）
      const soulRise = smooth(P.birth[0] + 0.2, P.birth[0] + 2.2, T);
      const soulScale = ease(soulRise);
      const lotusY = big ? headY - (42 + soulScale * 58) * scale : sy + 4 * scale;
      if (soulScale > 0.02) {
        for (let tier = 0; tier < 3; tier++) {
          const nPet = tier === 0 ? 12 : 8;
          const pr = (big ? 46 : 36) * (1 - tier * 0.2) * scale * soulScale;
          const rot = T * (tier % 2 ? -0.35 : 0.45) + tier * 0.35;
          for (let i = 0; i < nPet; i++) {
            const a = rot + (i / nPet) * TAU;
            const px2 = sx + Math.cos(a) * pr;
            const py2 = lotusY + Math.sin(a) * pr * 0.36;
            ctx.save();
            ctx.translate(px2, py2);
            ctx.rotate(Math.cos(a) * 0.55);
            const pCol = k === 'huashen'
              ? `rgba(${WUXING_RGB[(i + tier) % WUXING_RGB.length]},${(0.58 + tier * 0.12) * fade})`
              : k === 'zhuji'
              ? `rgba(155,242,255,${(0.55 + tier * 0.12) * fade})`
              : `rgba(255,${218 + tier * 14},${130 + tier * 35},${(0.62 + tier * 0.12) * fade})`;
            ctx.fillStyle = pCol;
            ctx.strokeStyle = `rgba(255,255,240,${0.75 * fade})`;
            ctx.lineWidth = 1.1;
            const pw2 = 10 * scale * soulScale, ph2 = 22 * scale * soulScale;
            ctx.beginPath();
            ctx.moveTo(0, -ph2);
            ctx.quadraticCurveTo(pw2, -ph2 * 0.25, 0, ph2 * 0.35);
            ctx.quadraticCurveTo(-pw2, -ph2 * 0.25, 0, -ph2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      // 7.5 结丹成：九转浑圆金丹悬天放光；结婴 / 化神成：纯代码元婴真灵 + 背后百丈法相虚影显圣！
      if (big && soulScale > 0.04) {
        const dharmaAwake = smooth(P.awaken - 0.3, P.awaken + 1.0, T);
        const breathe = 1 + 0.03 * Math.sin(T * 3.2);

        // (A) 背后百丈元婴 / 五色元神法相虚影 + 大日紫府十二辐神轮！
        const idolScale = (k === 'huashen' ? 2.85 : 2.45) * scale * ease(smooth(P.birth[0] + 0.5, P.birth[0] + 2.8, T)) * breathe;
        const idolY = sy - 38 * scale;
        if (idolScale > 0.1) {
          const wheelY = idolY - 108 * idolScale * 0.52;
          const wheelR = 68 * idolScale * 0.62;

          // 大日紫府神轮（多重几何曼陀罗轮盘）
          ctx.save();
          ctx.translate(sx, wheelY);
          for (let wL = 0; wL < 3; wL++) {
            const rr = wheelR * (1 - wL * 0.24);
            ctx.strokeStyle = wL === 1
              ? `rgba(${sr},${sg},${sb},${0.68 * fade})`
              : `rgba(255,236,168,${0.78 * fade})`;
            ctx.lineWidth = wL === 0 ? 3.2 : 1.8;
            ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
          }
          // 十二道神轮辐条与莲尖
          const spokes = 12;
          ctx.strokeStyle = `rgba(255,246,205,${0.65 * fade})`;
          ctx.lineWidth = 2;
          for (let i = 0; i < spokes; i++) {
            const a = T * 0.45 + (i / spokes) * TAU;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * wheelR * 0.28, Math.sin(a) * wheelR * 0.28);
            ctx.lineTo(Math.cos(a) * wheelR * 1.14, Math.sin(a) * wheelR * 1.14);
            ctx.stroke();
          }
          ctx.restore();

          // 百丈法相本体：调用主角程序化骨骼模型放大绘制纯金/紫神魂法相（绝不用贴图！）
          ctx.save();
          this.soulSt.x = sx;
          this.soulSt.y = idolY;
          ctx.globalAlpha = (0.36 + 0.22 * dharmaAwake) * fade;
          drawCharacter(ctx, this.look, this.soulSt, idolScale, 0, { ghost: true, alpha: 1 });
          ctx.globalAlpha = (0.28 + 0.18 * dharmaAwake) * fade;
          drawCharacter(ctx, this.look, this.soulSt, idolScale * 1.03, 0, { ghost: true, alpha: 1 });
          ctx.restore();

          // 百丈法相眉心开眼十字神芒！
          if (dharmaAwake > 0.02) {
            const browY = idolY - 64 * idolScale;
            const flareL = (65 + 95 * Math.sin(dharmaAwake * Math.PI * 0.5)) * scale * (0.9 + 0.1 * Math.sin(T * 9));
            ctx.save();
            ctx.translate(sx, browY);
            const fg = ctx.createRadialGradient(0, 0, 0, 0, 0, flareL * 0.55);
            fg.addColorStop(0, `rgba(255,255,255,${0.95 * dharmaAwake * fade})`);
            fg.addColorStop(0.35, `rgba(${gr},${gg},${gb},${0.65 * dharmaAwake * fade})`);
            fg.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
            ctx.fillStyle = fg;
            ctx.beginPath(); ctx.arc(0, 0, flareL * 0.55, 0, TAU); ctx.fill();
            ctx.fillStyle = `rgba(255,252,230,${0.95 * dharmaAwake * fade})`;
            for (const rot of [0, Math.PI / 2]) {
              ctx.save();
              ctx.rotate(rot);
              ctx.beginPath();
              ctx.moveTo(-flareL, 0);
              ctx.quadraticCurveTo(0, -4.5 * scale, flareL, 0);
              ctx.quadraticCurveTo(0, 4.5 * scale, -flareL, 0);
              ctx.fill();
              ctx.restore();
            }
            ctx.restore();
          }
        }

        // (B) 九品金莲中央盘坐的寸许「元婴真灵」（主角同貌缩小程序化绘制 + 飞天飘带 + 头后圆光）
        const miniScale = 0.62 * scale * soulScale * breathe;
        const miniY = lotusY - 2 * scale;
        // 飞天灵绶飘带（两条向上舞动的金色贝塞尔流光带）
        for (const side of [-1, 1]) {
          ctx.strokeStyle = `rgba(255,235,165,${0.78 * fade})`;
          ctx.lineWidth = 2.6 * scale;
          ctx.beginPath();
          ctx.moveTo(sx + side * 12 * scale, miniY - 18 * scale);
          ctx.bezierCurveTo(
            sx + side * (42 + Math.sin(T * 4 + side) * 12) * scale,
            miniY - 46 * scale,
            sx + side * (26 - Math.sin(T * 3.5) * 14) * scale,
            miniY - 82 * scale,
            sx + side * (48 + Math.cos(T * 5) * 10) * scale,
            miniY - 106 * scale,
          );
          ctx.stroke();
        }
        // 元婴背光圆轮
        const yHalo = ctx.createRadialGradient(sx, miniY - 24 * scale, 2, sx, miniY - 24 * scale, 52 * scale * soulScale);
        yHalo.addColorStop(0, `rgba(255,252,230,${0.85 * fade})`);
        yHalo.addColorStop(0.5, `rgba(${gr},${gg},${gb},${0.45 * fade})`);
        yHalo.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
        ctx.fillStyle = yHalo;
        ctx.beginPath(); ctx.arc(sx, miniY - 24 * scale, 52 * scale * soulScale, 0, TAU); ctx.fill();

        ctx.strokeStyle = `rgba(255,248,210,${0.9 * fade})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.arc(sx, miniY - 36 * scale, 16 * scale * soulScale, 0, TAU); ctx.stroke();

        // 元婴本体：真实角色程序化绘制 + 金光灵体罩层
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.96 * fade;
        this.soulSt.x = sx;
        this.soulSt.y = miniY;
        drawCharacter(ctx, this.look, this.soulSt, miniScale, 0);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.45 * fade;
        drawCharacter(ctx, this.look, this.soulSt, miniScale, 0, { ghost: true, alpha: 1 });
        ctx.restore();
      } else if (k === 'jiedan' && soulScale > 0.02) {
        // 结丹大成：头顶悬浮璀璨九转金丹放万丈豪光
        const cy = headY - 56 * scale * soulScale;
        const r = 24 * scale * soulScale * (1 + 0.05 * Math.sin(T * 5));
        const dg = ctx.createRadialGradient(sx - r * 0.28, cy - r * 0.28, 2, sx, cy, r * 2.5);
        dg.addColorStop(0, '#ffffff');
        dg.addColorStop(0.35, '#ffe27a');
        dg.addColorStop(1, 'rgba(255,210,95,0)');
        ctx.fillStyle = dg;
        ctx.beginPath(); ctx.arc(sx, cy, r * 2.5, 0, TAU); ctx.fill();
      }

      // 7.6 漫天灵莲花瓣与星火飘落
      ctx.globalCompositeOperation = 'lighter';
      for (const f of this.petals) {
        const pa = clamp01(f.t * 1.6) * fade;
        const fx2 = sx + f.x * W, fy2 = sy + f.y * H;
        ctx.save();
        ctx.translate(fx2, fy2);
        ctx.rotate(f.rot);
        ctx.globalAlpha = pa * 0.92;
        ctx.fillStyle = f.col;
        ctx.beginPath();
        ctx.moveTo(0, -f.s);
        ctx.quadraticCurveTo(f.s * 0.7, 0, 0, f.s);
        ctx.quadraticCurveTo(-f.s * 0.7, 0, 0, -f.s);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // ---- 8. 突破失败血雾反噬 ----
    if (!this.ok && T > P.burst) {
      const fk = (1 - smooth(P.burst, P.burst + 3.2, T)) * 0.6;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const rg = ctx.createRadialGradient(sx, headY, 0, sx, headY, 280 * z);
      rg.addColorStop(0, `rgba(255,65,50,${fk})`);
      rg.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(sx, headY, 280 * z, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // ---- 9. 全屏闪白与电影级暗角 ----
    if (!glMode && this.flash > 0.01) {
      const [r, g2, b] = this.flashCol;
      ctx.fillStyle = `rgba(${(r * 255) | 0},${(g2 * 255) | 0},${(b * 255) | 0},${Math.min(1, this.flash) * 0.88})`;
      ctx.fillRect(0, 0, W, H);
    }
    const vigK = clamp(this.gloom * 0.95 + 0.18, 0, 0.72) * (1 - smooth(this.dur - 1.5, this.dur, T));
    if (vigK > 0.02) {
      const vg = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.28, W * 0.5, H * 0.5, Math.max(W, H) * 0.76);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, `rgba(4,3,10,${vigK})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }

    // ---- 10. 电影宽银幕黑边 + 史诗章回字幕 + 终幕烫金书法巨字与镇世朱印 ----
    const barK = ease(smooth(0, 0.9, T)) * (1 - ease(smooth(this.dur - 1.2, this.dur, T)));
    const barH = Math.round(H * 0.072 * barK);
    if (barH > 1) {
      ctx.fillStyle = 'rgba(6,5,10,0.94)';
      ctx.fillRect(0, 0, W, barH);
      ctx.fillRect(0, H - barH, W, barH);
      ctx.strokeStyle = `rgba(${gr},${gg},${gb},${0.35 * barK})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, barH + 0.5); ctx.lineTo(W, barH + 0.5);
      ctx.moveTo(0, H - barH - 0.5); ctx.lineTo(W, H - barH - 0.5);
      ctx.stroke();

      // 底部章回诗句字幕
      const caption = this.captionAt(T);
      if (caption) {
        ctx.save();
        ctx.font = `${Math.max(14, Math.min(19, Math.round(W * 0.015)))}px "Noto Serif SC",serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(244,234,208,${0.92 * barK})`;
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 8;
        ctx.fillText(caption, W * 0.5, H - barH * 0.5);
        ctx.restore();
      }
    }

    // 终幕：天道昭告烫金大字 + 砸落朱砂宝印
    if (this.ok && T >= P.text) {
      const tk = ease(smooth(P.text, P.text + 0.85, T)) * (1 - smooth(this.dur - 2.0, this.dur - 0.2, T));
      if (tk > 0.01) {
        const slam = 1 + (1 - ease(smooth(P.text, P.text + 0.42, T))) * 0.45;
        const tx = W * 0.5;
        const ty = Math.max(barH + 86, Math.min(H * 0.24, headY - 210 * z));
        ctx.save();
        ctx.translate(tx, ty);
        ctx.scale(slam, slam);
        ctx.globalAlpha = tk;

        // 背后墨金横幅底衬
        const bw = big ? 360 : 290, bh = big ? 96 : 80;
        const bgGrad = ctx.createLinearGradient(-bw, 0, bw, 0);
        bgGrad.addColorStop(0, 'rgba(12,9,18,0)');
        bgGrad.addColorStop(0.25, 'rgba(12,9,18,0.68)');
        bgGrad.addColorStop(0.75, 'rgba(12,9,18,0.68)');
        bgGrad.addColorStop(1, 'rgba(12,9,18,0)');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(-bw, -bh * 0.55, bw * 2, bh * 1.35);

        const fSize = big ? Math.min(84, Math.max(54, Math.round(W * 0.062))) : Math.min(68, Math.max(46, Math.round(W * 0.05)));
        ctx.font = `${fSize}px "Ma Shan Zheng","Noto Serif SC",serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 璀璨金紫光晕描边
        ctx.shadowColor = `rgba(${gr},${gg},${gb},0.95)`;
        ctx.shadowBlur = 28;
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(24,14,10,0.92)';
        ctx.strokeText(C.txt, 0, -6);

        const txtGrad = ctx.createLinearGradient(0, -fSize * 0.5, 0, fSize * 0.5);
        txtGrad.addColorStop(0, '#ffffff');
        txtGrad.addColorStop(0.48, C.main);
        txtGrad.addColorStop(1, k === 'huashen' ? '#d884ff' : '#e09b2d');
        ctx.fillStyle = txtGrad;
        ctx.fillText(C.txt, 0, -6);

        // 副标题箴言
        ctx.shadowBlur = 10;
        ctx.font = `${Math.max(13, Math.round(fSize * 0.23))}px "Noto Serif SC",serif`;
        ctx.fillStyle = 'rgba(255,244,214,0.92)';
        ctx.fillText(C.subTxt, 0, fSize * 0.58);

        // 朱砂天道方印（延迟 0.3s 砰然盖下）
        const sealK = ease(smooth(P.text + 0.28, P.text + 0.62, T));
        if (sealK > 0.02) {
          const sealScale = 1 + (1 - sealK) * 0.8;
          ctx.save();
          ctx.translate(fSize * 2.35, -4);
          ctx.rotate(0.07);
          ctx.scale(sealScale, sealScale);
          ctx.globalAlpha = tk * sealK;
          ctx.shadowColor = 'rgba(220,40,30,0.75)';
          ctx.shadowBlur = 16;
          ctx.fillStyle = 'rgba(182,28,24,0.94)';
          ctx.fillRect(-23, -23, 46, 46);
          ctx.strokeStyle = 'rgba(255,232,205,0.85)';
          ctx.lineWidth = 1.6;
          ctx.strokeRect(-19, -19, 38, 38);
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#fff5e4';
          ctx.font = 'bold 17px "Noto Serif SC",serif';
          ctx.fillText(C.seal[0], 0, -8);
          ctx.fillText(C.seal[1], 0, 10);
          ctx.restore();
        }
        ctx.restore();
      }
    }

    ctx.restore();
  }

  private captionAt(t: number): string {
    const k = this.kind!, P = PLAN[k];
    if (!this.ok && t >= P.burst) {
      return k === 'jieying' ? '金丹崩裂，灵力溃散，此番结婴功亏一篑……' : k === 'huashen' ? '天道法则反噬，元神未能成形……' : '灵力逆冲经脉，冲关失利……';
    }
    if (t < P.storm[0]) {
      return k === 'zhuji'
        ? '六合阵起 · 四方灵气化雨入体'
        : k === 'jiedan'
        ? '九宫聚鼎 · 百里灵气滚滚倒灌'
        : k === 'jieying'
        ? '周天星斗大阵全开 · 方圆百里灵气如江河倒灌，万剑齐鸣！'
        : '太虚混沌阵启 · 抽取人界稀薄天地元气，万法震颤！';
    }
    if (t < P.hush) {
      return k === 'zhuji'
        ? '气冲百脉 · 伐毛洗髓铸仙基'
        : k === 'jiedan'
        ? '劫云压城 · 以肉身金钟硬撼三重丹劫神雷！'
        : k === 'jieying'
        ? '风云倒卷 · 九重紫霄神雷接连轰顶，向天争命！'
        : '虚空撕裂 · 八道天道法则神链锁困苍穹，十重混沌劫雷齐落！';
    }
    if (t < P.burst) {
      return k === 'zhuji'
        ? '丹田灵雾压缩至极点……破！'
        : k === 'jiedan'
        ? '百川灵液坍缩为一……凝丹！'
        : k === 'jieying'
        ? '苦修百载之金丹寸寸龟裂——不破不立，碎丹成婴！！'
        : '元婴燃尽旧壳，一剑斩断天道枷锁——给我破！！';
    }
    if (t < P.awaken) {
      return k === 'zhuji'
        ? '青玉道莲绽放 · 道基初成！'
        : k === 'jiedan'
        ? '金霞冲霄 · 九转金丹凝结成形！'
        : k === 'jieying'
        ? '漫天金丹星璇倒卷归元 · 九品功德金莲绽放，元婴出世！'
        : '法则神链寸寸崩断 · 五色混沌神光冲破九霄！';
    }
    return k === 'zhuji'
      ? '大道筑基已成 · 寿增二百二十载，御剑乘风去！'
      : k === 'jiedan'
      ? '金丹大道既成 · 方圆数十里修士皆望霞光而拜！'
      : k === 'jieying'
      ? '百丈元婴法相睁眼显圣 · 九重仙门洞开，百里众修尽皆跪拜！'
      : '五色元神凌驾苍穹 · 证道人界至高「化神初期」，俯瞰万古人间！';
  }
}
