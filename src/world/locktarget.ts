// r11-lock：锁定目标的表现层逻辑（不改 combat.lock 的语义：它仍是「下一招会打谁」，手动 / 自动都写它）。
//   · lockStance：被锁的人对你是什么态度——敌对（冲你来的）朱红、中立（没交手、切磋）金色、友方（同阵）青色；
//   · LockTrack：每帧看 combat.lock 换没换人，记下「锁上多久了」「这次是不是手动锁的」——画面上的锁定环收缩落定、头顶箭头落下、
//     「咔」一声都按它来（只有手动锁上——Tab、点选——才响，自动锁定跟着最近的敌人换人时只轻轻收一下，不响）；
//   · lockHeadH：头顶标记的高度（和界面层名牌同一个算法，标记在名牌上方）；
//   · pickAtScreen：触屏 / 鼠标点选——按单位在屏幕上的身子（立体画面里投影出来的位置）找，不再只看脚下那一点。
// 这里不取 Math.random（固定种子路径上不多取随机数）。
import type { Combat, Enemy } from './combat';
import type { Game } from './game';
import { audio } from './audio';
import { beastSpriteTop } from '../gfx/beastTex';

export type LockStance = 'foe' | 'neutral' | 'ally';
/** 敌对 / 中立 / 友方 */
export function lockStance(e: Enemy): LockStance {
  if (e.ally) return 'ally';
  if (e.aggro && !e.spar) return 'foe';
  return 'neutral';
}
/** 三种态度的颜色（0..1 RGB，给立体标记）与界面上的色（CSS） */
export const LOCK_RGB: Record<LockStance, [number, number, number]> = { foe: [1, 0.26, 0.14], neutral: [1, 0.78, 0.28], ally: [0.3, 0.9, 0.96] };
export const LOCK_CSS: Record<LockStance, string> = { foe: '#ff5a3c', neutral: '#ffc84a', ally: '#4fe6f2' };
export const LOCK_NAME: Record<LockStance, string> = { foe: '敌', neutral: '中', ally: '友' };

/** 锁定落定的时长（秒）：环从大收到原大、头顶箭头落下 */
export const LOCK_SNAP = 0.32;

/** 每帧跟着 combat.lock：换了人 / 从自动变成手动 → since 归零（画面上重放一次锁定动画）；手动锁上时「咔」一声 */
export class LockTrack {
  cur: Enemy | null = null;
  /** 这个目标锁上多久了（秒） */
  since = 99;
  /** 这次锁上是手动的（Tab / 点选）：动画更重、有声音 */
  hard = false;
  /** 手动锁上的次数（测试读） */
  snaps = 0;
  private wasManual = false;
  tick(c: Combat, dt: number) {
    const L = c.lock && !c.lock.dead ? c.lock : null, manual = !!L && c.manual;
    if (L !== this.cur || (manual && !this.wasManual)) {
      this.cur = L; this.since = 0; this.hard = manual;
      if (manual) { this.snaps++; audio.sfx('lock'); }
    } else this.since += dt;
    this.wasManual = manual;
  }
  reset() { this.cur = null; this.since = 99; this.hard = false; this.wasManual = false; }
}

/** 头顶标记离脚下多高（世界单位，2D 的「向上」量；不含飞行 / 腾起）：与界面层名牌的 top 同一算法，再往上让出名牌的一行 */
export function lockHeadH(e: Enemy, zoom: number): number {
  const k = 1 / Math.max(0.45, zoom), size = e.def.look?.size ?? 1;
  const st = e.def.kind === 'human' ? 0 : beastSpriteTop('e:' + e.def.id, !!e.anim.flying);
  const top = st ? st + 18 : (e.def.kind === 'human' ? 150 : e.anim.flying ? 150 : 100) * size;
  return top + (e.affix ? 32 : 12) * k;
}

// —— r13-lockbtn：手机上的「锁」按钮（ui/GameView.tsx 的 LockButton）——
//   点一下：还没手动锁定 → 锁最合适的那位（Tab 的顺序里排第一的：敌对的先、近的先）；已经手动锁着 → 换下一个（到头了从头再来）；
//   长按（LOCK_HOLD_MS）：取消锁定（回到自动锁最近的敌人）。按钮本身只管按下 / 松手的时间，判定都在这里，测试直接调。
/** 长按多久算「取消锁定」（毫秒） */
export const LOCK_HOLD_MS = 450;
/** 点一下「锁」的结果：locked 锁上了（原来没手动锁定）、next 换了下一个、only 能锁的只有锁着的这一个、none 附近没有能锁的 */
export type LockTapResult = 'locked' | 'next' | 'only' | 'none';
export function lockButtonTap(c: Combat): LockTapResult {
  const list = c.lockOrder();
  if (!list.length) return 'none';
  const cur = c.manual && c.lock && !c.lock.dead ? list.indexOf(c.lock) : -1;
  if (cur < 0) { c.lock = list[0]; c.manual = true; return 'locked'; }
  if (list.length === 1) return 'only';
  c.lock = list[(cur + 1) % list.length]; c.manual = true;
  return 'next';
}
/** 长按「锁」：取消手动锁定；原来就没手动锁定时返回 false */
export function lockButtonHold(c: Combat): boolean { return c.unlock(); }
/** 按钮的状态：on 手动锁着一位（按钮朱红高亮）、idle 有能锁的、none 附近没有能锁的（按钮变灰） */
export function lockButtonState(c: Combat): 'on' | 'idle' | 'none' {
  if (c.manual && c.lock && !c.lock.dead) return 'on';
  return c.lockOrder().length ? 'idle' : 'none';
}
/** 按下 / 松手的计时：松手时没到 LOCK_HOLD_MS 算点一下；按着到了时长，poll 返回 true 一次（按钮在那一刻取消锁定，不用等松手） */
export class LockPress {
  private t0 = -1;
  private fired = false;
  get pressing() { return this.t0 >= 0; }
  down(now: number) { this.t0 = now; this.fired = false; }
  /** 按着时轮询：刚到长按时长返回 true（只一次） */
  poll(now: number): boolean {
    if (this.t0 < 0 || this.fired || now - this.t0 < LOCK_HOLD_MS) return false;
    this.fired = true; return true;
  }
  /** 松手：'tap' 点一下；'hold' 到了长按时长、计时器还没来得及触发（照长按办）；null 长按已经办过了 / 没按着 */
  up(now: number): 'tap' | 'hold' | null {
    if (this.t0 < 0) return null;
    const r = this.fired ? null : now - this.t0 >= LOCK_HOLD_MS ? 'hold' : 'tap';
    this.t0 = -1; this.fired = false;
    return r;
  }
  /** 手指滑走、被系统打断：这一下作废 */
  cancel() { this.t0 = -1; this.fired = false; }
}

/** 点选：屏幕点 (sx, sy)（画布内 CSS 像素）下面是谁。立体画面里按身子中段的投影量（飞着的、高大的都点得中），没有立体画面时退回地面距离。
 *  r13-lockbtn：minR = 点中范围的最小半宽（像素）；手指比鼠标粗，触屏传大一点 */
export function pickAtScreen(g: Game, sx: number, sy: number, wx: number, wy: number, minR = 26): Enemy | null {
  const p = g.player, R = g.senseRadius, hd = g.renderer?.hd;
  let best: Enemy | null = null, bd = Infinity;
  for (const q of g.combat.enemies) {
    if (q.dead || q.hideT > 0 || Math.hypot(q.x - p.x, q.y - p.y) > R) continue;
    let d: number;
    if (hd) {
      try {
        // r13-lockbtn：贴图妖兽按贴图的真实高度（和头顶标记同一个数），不再按 70×体型估——银翼夜叉这类高大的，以前只有下半截点得中
        const size = q.def.look?.size ?? 1, st = q.def.kind === 'human' ? 0 : beastSpriteTop('e:' + q.def.id, !!q.anim?.flying);
        const body = st > 0 ? st * 0.95 : (q.def.kind === 'human' ? 120 : 70) * Math.max(0.8, Math.min(2.4, size));
        const lo = hd.project(q.x, q.y, q.lift + q.flyH), hi = hd.project(q.x, q.y, q.lift + q.flyH + body);
        // 到「脚—头」这条竖线段的距离；半宽按身子在屏幕上的高度取（远处的人小，点的范围也小一点，但不少于 minR；高大的也不超过 64，免得把旁边的人罩进去）
        const vx = hi.x - lo.x, vy = hi.y - lo.y, L2 = vx * vx + vy * vy || 1;
        const u = Math.max(0, Math.min(1, ((sx - lo.x) * vx + (sy - lo.y) * vy) / L2));
        d = Math.hypot(sx - (lo.x + vx * u), sy - (lo.y + vy * u)) / Math.max(minR, Math.min(64, Math.sqrt(L2) * 0.42));
      } catch { d = Math.hypot(q.x - wx, q.y - 30 - wy) / (70 * minR / 26); }
    } else d = Math.hypot(q.x - wx, q.y - 30 - wy) / (70 * minR / 26);
    if (d < 1 && d < bd) { bd = d; best = q; }
  }
  return best;
}
