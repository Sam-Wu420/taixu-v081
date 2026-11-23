// 撼山客第一阶段（照参考视频 DNF 男散打还原）的通用打击表现（r8-p1）。规格：docs/撼山客-参考视频动作分解.md 第一节。
// 每招都用的几样（招式里 const X = p1(c.B)）：
//   X.hit(c, who, dir, tier, o)     命中：白色星形闪 + 3–6 条朝打击方向射出的冲击线 + 挥击弧光（拳脚划过的一段蓝白弧）+ 被打者闪白一帧 + 往后滑、脚下拖一道土 + 顿帧。三档大小
//   X.dash(c, from, to, o)          冲刺 / 闪步：起步脚下炸一团土（往后喷）、身后 3–4 个白色半透明人形残影（同一姿势、越往后越淡）、一条青蓝速度带连到落点、
//                                   地面一道往后的黄色冲击刺、到位一个小冲击。人直接「到了」（位置由招式自己摆）
//   X.boom(x, y, z, power)          四层爆炸：白核 → 橙黄火焰往外往上喷（带光刺）→ 暗红余烬火星 → 灰褐烟尘（散得快，不留一屏雾）
//   X.whiteout(k)                   整屏偏白一帧（只在最重那一下；不是纯白，画面看得出轮廓）——后期的白闪（impactfx.whiteF）
//   X.shock(x, y, z, dir, power)    竖着的冲击环 + 屏幕空间扭曲冲击波（三维模块的 ring + warp）
//   X.outline(who, color, dur)      全身一圈亮边（霸体、铁山靠蓄劲、瞬影伏身）
//   X.shadow(who, color, dur)       整个人变成半透明的蓝影（瞬影连环踢）
//   X.flash(who)                    被打者整体闪白一帧
// 画面：人形的（残影、亮边、蓝影、闪白）是立板（combatfx 收集 p1Drawables），光效走 GL（gl/p1gl.ts 认 p1* 事件）。
// r9：四层爆炸、扭曲冲击波、三维残影（模糊拖影管）、整屏白闪都换成三维特效模块（world/fx3d.ts → hd2d/hsfx3d.ts、后期）的立体版本。
// 随机数：招式路径上一个都不取（GL 那边的抖动用自己的小序列）。
import type { BrawlSys } from './brawl';
import type { Enemy } from './combat';
import type { MoveCtx } from './brawlmoves';
import type { Drawable } from './life';
import { charBox } from '../hd2d/boxes';
import { drawCharacter, CharState, type Look, type Pose } from '../gfx/character';
import { audio, type P1Sfx } from './audio';
import { fx3dOf } from './fx3d';

type W = Enemy | 'p';
export interface P3 { x: number; y: number; z: number }
/** 人形的特效：snap = 起手那一刻的姿势定格在一处（残影）；over = 跟着人、盖在身上（蓝影、闪白）；rim = 跟着人、垫在身后的一圈亮边 */
interface Sil {
  mode: 'snap' | 'over' | 'rim'; who: W; x: number; y: number; z: number; yaw: number; t: number; dur: number; color: string; a: number;
  scale: number; w: number;
  /** 残影：起手那一刻的姿势（拷一份） */
  pose?: Pose;
  /** 残影的描边颜色（同一姿势染成青蓝、错开一两个单位垫在白影后面：亮草地上白影才看得出轮廓） */
  edge?: string;
}

export class P1Fx {
  sils: Sil[] = [];
  /** 测试 / 交付说明用的计数 */
  stats = { hit: 0, dash: 0, boom: 0, white: 0, sil: 0 };
  /** 整屏白闪还剩几帧 */
  whiteF = 0; whiteK = 0;
  constructor(readonly B: BrawlSys) {}
  private get fxq() { return this.B.combat.fxq as unknown as Record<string, unknown>[]; }
  /**
   * 发事件。挂在人身上的光（anchor）整体往镜头那边挪一点：立板是竖着的一片，光的锚点和人站在同一处时深度一样，
   * 会被人的立板吃掉一半（命中的星闪正好在被打者胸口）
   */
  private push(ev: Record<string, unknown>) {
    const a = ev.anchor as { x: number; y: number; offsetY?: number } | undefined;
    if (a && !ev.noLift) {
      const hd = this.B.g.renderer?.hd, u = hd ? hd.upDir : { x: 0, y: -1 }, k = 46, dx = -u.x * k, dy = -u.y * k;
      ev.anchor = { x: a.x + dx, y: a.y + dy, offsetY: a.offsetY };
      if (typeof ev.x === 'number') ev.x = (ev.x as number) + dx;
      if (typeof ev.y === 'number') ev.y = (ev.y as number) + dy;
    }
    this.fxq.push(ev);
  }

  /** 某人此刻在哪（z 离地高度） */
  pos(w: W): P3 {
    if (w === 'p') { const p = this.B.g.player; return { x: p.x, y: p.y, z: this.B.g.isFlying ? p.z : this.B.playerLift }; }
    return { x: w.x, y: w.y, z: w.flyH + w.lift };
  }
  private stOf(w: W): { st: CharState; look: Look; scale: number } | null {
    if (w === 'p') { const p = this.B.g.player; return { st: p.st, look: p.look, scale: 1.12 }; }
    if (!w.cs || !w.look) return null;
    return { st: w.cs, look: w.look, scale: (w as { ying?: unknown }).ying ? 1.06 * 0.46 : 1.06 };
  }

  // ------------------------------------------------------------ 命中
  /**
   * 命中：白色星形闪 + 朝打击方向的冲击线 + 挥击弧光 + 被打者闪白一帧、往后滑拖一道土 + 顿帧（出手的人和被打的人一起停 2–3 帧）。
   * tier 1 轻 / 2 重 / 3 终结；arc：拳脚划过的三个点（不给就按方向画一段短弧）；col：弧光颜色（蓝白、扫腿橙、勾拳红）；z：命中点离地多高
   */
  hit(c: MoveCtx, who: W, dir: number, tier: 1 | 2 | 3, o: { arc?: P3[]; col?: string; z?: number; stop?: boolean; slide?: boolean; snd?: P1Sfx } = {}) {
    const q = this.pos(who), z = q.z + (o.z ?? 95);
    this.stats.hit++;
    // 声音和命中同一刻：破风（快的尖、重的闷）+ 命中（轻脆、重闷带骨裂、终结叠低频），肘击 / 靠击换成沉闷的一撞
    this.sfx(tier === 3 ? 'p1swingHeavy' : 'p1swing', q.x, q.y);
    this.sfx(o.snd ?? (tier === 1 ? 'p1hit' : tier === 2 ? 'p1hitHeavy' : 'p1hitFin'), q.x, q.y);
    if (tier >= 2 && o.slide !== false) this.sfx('p1slide', q.x, q.y);
    this.push({ k: 'p1star', x: q.x, y: q.y, dir, power: tier, r: z, color: o.col ?? '200,230,255', anchor: { x: q.x, y: q.y, offsetY: -z } });
    if (o.arc && o.arc.length >= 2) this.push({ k: 'p1arc', x: q.x, y: q.y, pts: o.arc, power: tier, color: o.col ?? '170,220,255' });
    if (o.slide !== false) this.push({ k: 'p1slide', x: q.x, y: q.y, dir, power: tier });
    this.flash(who);
    // r9：他燃着身（第二阶段）放第一阶段的招：命中处再炸一团火（立体火爆，按档大小），重的一下带一圈火舌往外卷
    if (this.B.burnOf?.(c.user)) {
      const F = fx3dOf(this.B.g), d = Math.atan2(q.y - (c.user?.y ?? q.y), q.x - (c.user?.x ?? q.x));
      F.blast(q.x + Math.cos(d) * 25, q.y + Math.sin(d) * 25, 0.45 + 0.25 * tier, 'fire', { z: Math.max(0, z - 25), r: 40 + 16 * tier });
      if (tier >= 2) F.jet(q.x, q.y, z - 10, Math.cos(d), Math.sin(d), { len: 110 + 60 * tier, power: 0.5 + 0.2 * tier, spread: 0.35 });
    }
    if (o.stop !== false) { const T = [0, 0.045, 0.07, 0.1][tier]; this.B.g.juice(T, 0.1 + tier * 0.12); c.freeze(T * 0.5); }   // 顿帧：世界停一下（2–3 帧），两人的动作一起定住
  }
  /** 被打者整体闪白一帧 */
  flash(who: W, color = '255,255,255', dur = 0.05) { this.addSil({ mode: 'over', who, dur, color, a: 0.42 }); }   // r9：0.92 → 0.42（闪一下白，人还看得见）
  /** 全身一圈亮边（w：亮边多粗） */
  outline(who: W, color: string, dur: number, w = 3.2, a = 0.95) { this.addSil({ mode: 'rim', who, dur, color, a, w }); }
  /** 整个人变成半透明的影子（盖在身上） */
  shadow(who: W, color: string, dur: number, a = 0.72) { this.addSil({ mode: 'over', who, dur, color, a }); }
  /** 收掉某人身上持续的人形特效（亮边、影子） */
  clear(who: W, mode?: Sil['mode']) { this.sils = this.sils.filter((s) => !(s.who === who && (!mode || s.mode === mode) && s.mode !== 'snap')); }

  // ------------------------------------------------------------ 冲刺 / 闪步
  /**
   * 冲刺 / 闪步：从 a 到 b（人已经由招式摆到 b）。起步一团往后喷的土、身后几个同一姿势的白色残影（越往后越淡）、一条青蓝速度带、
   * 地上一道往后的黄色冲击刺、到位一个小冲击。who：冲的人（残影照他此刻的姿势）；n：残影几个；col：速度带颜色
   */
  dash(who: W, a: P3, b: P3, o: { n?: number; col?: string; ghost?: string; spikes?: boolean } = {}) {
    this.stats.dash++;
    this.sfx('p1dash', a.x, a.y); this.sfx('p1blink', b.x, b.y);
    const dir = Math.atan2(b.y - a.y, b.x - a.x), L = Math.hypot(b.x - a.x, b.y - a.y);
    this.push({ k: 'p1dust', x: a.x, y: a.y, dir: dir + Math.PI, power: 1.2 });
    this.push({ k: 'p1band', x: a.x, y: a.y, x2: b.x, y2: b.y, r: a.z, power: b.z, color: o.col ?? '90,225,255' });
    if (o.spikes !== false && L > 120 && a.z < 30 && b.z < 30) this.push({ k: 'p1spikes', x: b.x, y: b.y, x2: a.x, y2: a.y });
    this.push({ k: 'p1land', x: b.x, y: b.y, r: b.z, dir });
    // 残影：同一姿势，沿路排在身后（越往后越淡）；r9：再加一段立体的模糊拖影管（三维模块的 smear：身形管 + 绕着路径的速度线）
    if (L > 60) { const cc = (o.col ?? '90,225,255').split(',').map((v) => Number(v) / 255) as [number, number, number]; fx3dOf(this.B.g).smear(a.x, a.y, a.z + 95, b.x, b.y, b.z + 95, { w: 26, dur: 0.22, col: [0.35 + cc[0] * 0.5, 0.35 + cc[1] * 0.5, 0.35 + cc[2] * 0.5] }); }
    const n = o.n ?? 3, S = this.stOf(who);
    if (S && L > 60) {
      const pose = S.st.last ? { ...S.st.last } : undefined, color = o.ghost ?? '250,252,255';
      for (let i = 1; i <= n; i++) {
        const u = i / (n + 1) * Math.min(1, 260 / L * 1.6);   // 挤在落点身后一两个身位里（视频里残影就贴在身后）
        this.sils.push({ mode: 'snap', who, x: b.x + (a.x - b.x) * u, y: b.y + (a.y - b.y) * u, z: b.z + (a.z - b.z) * u, yaw: S.st.yaw, t: 0, dur: 0.15 + 0.08 * (n - i) / n, color, a: 0.9 * (1 - (i - 1) / (n + 0.5)), pose, edge: '70,170,255', scale: S.scale, w: 0 });
      }
      this.stats.sil += n;
    }
  }
  /** 一个残影（此刻的姿势定格在原地，dur 息淡掉） */
  ghost(who: W, color = '245,250,255', dur = 0.3, a = 0.55) {
    const S = this.stOf(who); if (!S) return;
    const q = this.pos(who);
    this.sils.push({ mode: 'snap', who, x: q.x, y: q.y, z: q.z, yaw: S.st.yaw, t: 0, dur, color, a, pose: S.st.last ? { ...S.st.last } : undefined, scale: S.scale, w: 0 });
    this.stats.sil++;
  }

  // ------------------------------------------------------------ 爆炸、整屏白闪、点缀
  /** 四层爆炸：白核 → 橙黄火焰（往外往上喷、带光刺）→ 暗红余烬 → 灰褐烟尘。dir：往哪边喷得多（不给就四面） */
  boom(x: number, y: number, z: number, power = 1, dir?: number) {
    this.stats.boom++; this.sfx('p1boom', x, y);
    // r9：三维模块的四层爆炸（白核 → 立体火球 + 往外喷的火舌 → 余烬火星 → 烟），往打击方向偏一点；外加一圈扭曲冲击波
    const F = fx3dOf(this.B.g), ox = dir === undefined ? 0 : Math.cos(dir) * 20, oy = dir === undefined ? 0 : Math.sin(dir) * 20;
    F.blast(x + ox, y + oy, 1.1 * power, 'fire', { z: Math.max(0, z - 30), r: 130 * (0.6 + 0.4 * power) });
    F.warp(x, y, z, { r: 380 * power, power: 0.8 * power, dur: 0.45 });
  }
  /** r9：竖着的冲击环（垂直于打击方向）+ 屏幕空间扭曲冲击波——三维模块的 ring + warp（原来的平面 p1ring） */
  shock(x: number, y: number, z: number, dir: number, power = 1, color = '150,205,255') {
    const c = color.split(',').map((v) => Number(v) / 255), F = fx3dOf(this.B.g);
    F.ring(x, y, z, Math.cos(dir), Math.sin(dir), 0, { r: 200 * (0.8 + 0.2 * power), power: 0.9 * power, col: [0.8 + c[0] * 0.6, 0.8 + c[1] * 0.6, 0.8 + c[2] * 0.6], dur: 0.36 });
    F.warp(x, y, z, { r: 340 * (0.8 + 0.2 * power), power: power, dur: 0.5 });
  }
  /** 整屏偏白一帧（只在最重那一下）：r9 起走后期的白闪（和大招同一处，画面还看得出轮廓） */
  whiteout(k = 0.5) { this.stats.white++; this.whiteF = 2; this.whiteK = k; const I = this.B.impact; I.whiteF = Math.max(I.whiteF, 2); }
  /** 放一个音效（world/audio.ts 撼山客第一阶段那一段；无头测试里没有声卡，什么都不做） */
  sfx(kind: P1Sfx, x?: number, y?: number) { try { audio.p1(kind, x, y); } catch { /* 声卡出错不拖垮出招 */ } }
  /** 发一个画面事件（p1gl 认的那些） */
  fx(ev: Record<string, unknown>) { this.push(ev); }

  // ------------------------------------------------------------ 人形立板
  private addSil(o: { mode: Sil['mode']; who: W; dur: number; color: string; a: number; w?: number }) {
    // 同一个人同一种持续的效果只留一份（新的覆盖旧的）
    if (o.mode !== 'snap') this.sils = this.sils.filter((s) => !(s.who === o.who && s.mode === o.mode && (o.mode === 'rim' || s.dur > 0.1 || o.dur > 0.1)));
    const S = this.stOf(o.who); if (!S) return;
    if (this.sils.length > 40) this.sils.shift();
    this.sils.push({ mode: o.mode, who: o.who, x: 0, y: 0, z: 0, yaw: 0, t: 0, dur: o.dur, color: o.color, a: o.a, scale: S.scale, w: o.w ?? 0 });
    this.stats.sil++;
  }
  /**
   * r9：染色不再用画布滤镜（ctx.filter 的灰阶 / 褐化 / 色相那一串在显卡加速的画布上每画一次都要另开一层再合，
   * 金刚不坏的亮边、影踪连环踢的蓝影一亮就是每帧好几份，量到过帧间隔被拖成一秒一帧）——改成：人画进立板的格子（格子已按自己的范围裁好、
   * 每帧清空），再用「source-atop」在这一格里刷一层颜色：只盖到刚画上去的人形，白就是整片白，别的颜色留几成明暗。
   * k：盖多浓（1 = 整片纯色）
   */
  private tintOver(g: CanvasRenderingContext2D, color: string, k: number, x: number, y: number) {
    g.save();
    g.globalCompositeOperation = 'source-atop'; g.globalAlpha = k;
    g.fillStyle = `rgb(${color})`;
    g.fillRect(x - 400, y - 700, 800, 900);
    g.restore();
  }
  /** 这种颜色盖多浓：白整片盖死，别的颜色留三成明暗 */
  private tintK(color: string, flat: boolean): number { const [r, g, b] = color.split(',').map(Number); return r > 220 && g > 220 && b > 220 ? 1 : flat ? 0.78 : 0.62; }
  /** 照一份姿势把人画在 (x, y, z)（不动他的真实状态） */
  /**
   * 画在一份自己的人物状态上，不碰本人的那份：本人的衣摆、头发（strands / springs）这时可能正交给画人线程算，
   * 主线程拿它再画一遍会把那份物理弄乱（实测：无头浏览器里连放几招整个画面停住）
   */
  // r9：每个人形特效一份自己的人物状态（原来同一个人共用一份：闪步时两三个残影 + 蓝影同一帧画在不同地方，
  // 那一份状态的位置一帧里来回跳几百，衣带、发丝的弹簧当成高速甩动，拉成一根根横着的长条）
  private scratch = new WeakMap<object, CharState>();
  private drawAt(g: CanvasRenderingContext2D, S: { st: CharState; look: Look; scale: number }, pose: Pose | undefined, x: number, y: number, z: number, yaw: number, who: W, key: object = typeof who === 'string' ? this : who) {
    let st = this.scratch.get(key);
    if (!st) { st = new CharState(x, y); this.scratch.set(key, st); }
    const src = S.st;
    st.x = x; st.y = y; st.lift = z; st.yaw = st.targetYaw = yaw; st.action = src.action; st.actionT = src.actionT; st.t = src.t; st.seed = src.seed; st.castN = src.castN;
    st.hands = [src.hands[0].slice(), src.hands[1].slice()]; st.handInit = true;
    drawCharacter(g, S.look, st, S.scale, 0, { pose: pose ?? src.last ?? undefined, ghost: true });
  }
  /** 每帧（combatfx 收集立板时调）：人形特效老化、交出立板 */
  drawables(out: Drawable[], dt: number) {
    if (this.whiteF > 0) this.whiteF--;
    if (!this.sils.length) return;
    for (const s of this.sils) s.t += dt;
    this.sils = this.sils.filter((s) => s.t < s.dur && (s.who === 'p' || !s.who.dead || s.mode === 'snap'));
    for (const s of this.sils) {
      if (s.mode === 'snap') {
        const S = this.stOf(s.who); if (!S) continue;
        const k = 1 - s.t / s.dur, sc = s.scale, col = s.color || '250,252,255', tk = this.tintK(col, true);
        out.push({ y: s.y - 1, hx: s.x, hy: s.y, hb: charBox(sc, s.z), k: 'D·p1残影', draw: (g) => {
          // 先在格子里画出不透明的人形、染色，再整格按透明度淡掉（globalAlpha 留到染完再乘：先淡再染，染的那层会把淡掉的人形又盖实）
          g.save(); const a0 = g.globalAlpha;
          this.drawAt(g, S, s.pose, s.x, s.y, s.z, s.yaw, s.who, s); this.tintOver(g, col, tk, s.x, s.y - s.z);
          g.globalCompositeOperation = 'destination-in'; g.globalAlpha = 1; g.fillStyle = `rgba(0,0,0,${(a0 * s.a * k).toFixed(3)})`; g.fillRect(s.x - 400, s.y - s.z - 700, 800, 900);
          g.restore();
        } });
        continue;
      }
      const S = this.stOf(s.who); if (!S) continue;
      const q = this.pos(s.who), st = S.st;
      const fadeIn = Math.min(1, s.t / 0.04 + (s.dur < 0.1 ? 1 : 0)), fadeOut = Math.min(1, (s.dur - s.t) / 0.08 + (s.dur < 0.1 ? 1 : 0)), k = s.a * fadeIn * fadeOut;
      if (k < 0.02) continue;
      // 跟着人：照他此刻的姿势再画一遍——影子 / 闪白染了色盖在身上；亮边是染色的身形往四个方向错开一点、再把本人原样画在上面，
      // 所以和身子谁先画都一样（立板排序靠不住：同一处脚底两张立板的先后不定）。不用 drop-shadow：模糊滤镜每帧几毫秒，金刚不坏一亮一息半就掉帧
      const rim = s.mode === 'rim', w = s.w, pose = st.last ?? undefined, yaw = st.yaw;
      const tk = this.tintK(s.color, rim || s.dur <= 0.1);
      // 立板按脚底的深度排先后：亮边往镜头反方向挪一点（垫在身后），盖在身上的往镜头这边挪一点
      const hd = this.B.g.renderer?.hd, up = hd ? hd.upDir : { x: 0, y: -1 }, sh = rim ? 3 : -3;
      out.push({ y: q.y + (rim ? -0.5 : 0.5), hx: q.x + up.x * sh, hy: q.y + up.y * sh, hb: charBox(S.scale * 1.06, q.z), k: 'D·p1人形', draw: (g) => {
        g.save();
        const a0 = g.globalAlpha;
        if (rim) {
          // 亮边：错开几份画出人形、整格染成亮边的颜色、按透明度淡掉，再把本人原样画在上面
          const offs = s.dur > 0.5 ? [[-w, -w * 0.4], [w, -w * 0.4]] : [[-w, 0], [w, 0], [0, -w * 1.1], [0, w * 0.6]];   // 长的（金刚不坏一息半）只描左右两份，省一半
          for (const [ox, oy] of offs) this.drawAt(g, S, pose, q.x + ox, q.y, q.z - oy, yaw, s.who, s);
          this.tintOver(g, s.color, 1, q.x, q.y - q.z);
          g.globalCompositeOperation = 'destination-in'; g.fillStyle = `rgba(0,0,0,${(a0 * k).toFixed(3)})`; g.fillRect(q.x - 400, q.y - q.z - 700, 800, 900);
          g.globalCompositeOperation = 'source-over'; g.globalAlpha = a0;
          this.drawAt(g, S, pose, q.x, q.y, q.z, yaw, s.who, s);
        } else {
          // 盖在身上的（蓝影、闪白）：人形染色后按透明度淡掉——这一格只有这一层（本人在自己的格子里），淡掉的就透出底下的本人
          this.drawAt(g, S, pose, q.x, q.y, q.z, yaw, s.who, s); this.tintOver(g, s.color, tk, q.x, q.y - q.z);
          g.globalCompositeOperation = 'destination-in'; g.fillStyle = `rgba(0,0,0,${(a0 * k).toFixed(3)})`; g.fillRect(q.x - 400, q.y - q.z - 700, 800, 900);
        }
        g.restore();
      } });
    }
  }
  reset() { this.sils = []; this.whiteF = 0; }
}

/** 颜色的色相（度） */
function rgbHue(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d < 1e-6) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const ALL = new WeakMap<BrawlSys, P1Fx>();
/** 这一场近战的第一阶段打击表现（第一次用到时建） */
export function p1(B: BrawlSys): P1Fx { let x = ALL.get(B); if (!x) { x = new P1Fx(B); ALL.set(B, x); } return x; }
/** combatfx 收集立板时调（没用过就什么都不做） */
export function p1Drawables(B: BrawlSys, out: Drawable[], dt: number) { const x = ALL.get(B); if (x) x.drawables(out, dt); }
/** 整屏白闪的强度（后期 / 界面读：> 0 时那一帧整屏偏白） */
export function p1White(B: BrawlSys): number { const x = ALL.get(B); return x && x.whiteF > 0 ? x.whiteK : 0; }
