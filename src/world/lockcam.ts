// r11-lock：锁定跟随镜头（可在设置里关，记在本机 taixu.lockcam；默认开）。
// 像动作游戏的软锁：锁定了目标，镜头焦点取「你—目标」连线上靠你这一侧的一点（三成五处），目标离得太远（过了跟随距离）就渐渐不跟；
// 同时略微拉远，把两人框进画面。焦点的偏移走临界阻尼弹簧（不来回晃、换目标也不跳）。
// 已有专门镜头的情况让它们优先：近战 / 撼山客出招（brawl.cameraTick 接管时整个镜头位置都由它定，这里的偏移不起作用）、
// 御剑高空、遁空、虚空（含虚空斗法、往天外升降）、海渊、虚空挪移——这些时候偏移收回零。
// 关掉时 game.ts 照原来的写法（锁定在投放距离内时偏三成二，指数平滑）。
import type { Game } from './game';
import { ALT } from './alt';

const KEY = 'taixu.lockcam';
function load(): boolean { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } }
export const lockCamSetting = { on: load() };
export function setLockCam(on: boolean) {
  lockCamSetting.on = on;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* 无痕窗口等 */ }
}

/** 焦点落在连线上的哪一处（0 = 你，1 = 目标） */
export const LOCKCAM_LEAN = 0.35;
/** 弹簧角频率（越大越跟得紧）；临界阻尼 */
export const LOCKCAM_W = 4.2;

export class LockCam {
  x = 0; y = 0; vx = 0; vy = 0;
  /** 这一帧的跟随权重（0 不跟 → 1 全跟），给测试和取景读 */
  w = 0;
  /** 有专门镜头的情况：返回原因（不跟），否则 '' */
  yieldReason(g: Game): string {
    const p = g.player;
    if (g.xukong.active || g.xukong.fight.on || g.xukong.worldZoom) return 'void';
    if (g.dunkong.active) return 'dunkong';
    if (g.nuoyi.active) return 'nuoyi';
    if (g.jueyu?.deep?.active) return 'abyss';
    if (p.flying && p.z > ALT.lowMax) return 'high';
    return '';
  }
  /** 想要的焦点偏移和取景缩放（不平滑）；null = 没有锁定或要让出镜头 */
  target(g: Game): { x: number; y: number; fz: number; w: number } | null {
    const c = g.combat, e = c.lock, p = g.player;
    this.w = 0;
    if (!e || e.dead || g.halted || this.yieldReason(g)) return null;
    const dx = e.x - p.x, dy = e.y - 40 - (e.z - p.z) * 0.5 - p.y, d = Math.hypot(e.x - p.x, e.y - p.y);
    // 跟随距离：投放距离的 1.25 倍（至少 700、至多 1800）；最后两成慢慢放掉，不会一出界就跳回
    const far = Math.max(700, Math.min(1800, c.reach * 1.25)), near = far * 0.78;
    const w = d <= near ? 1 : d >= far ? 0 : 1 - (d - near) / (far - near);
    if (w <= 0) return null;
    this.w = w;
    const W = (typeof window !== 'undefined' && window.innerWidth) || 1280, H = (typeof window !== 'undefined' && window.innerHeight) || 800;
    const L = LOCKCAM_LEAN * w, zNeed = Math.min(W * 0.4 / Math.max(1, Math.abs(dx) * (1 - L)), H * 0.34 / Math.max(1, Math.abs(dy) * (1 - L)));
    const z0 = Math.max(g.minZoom, g.cam.targetZoom * (1 - 0.3 * g.alt));
    const fz = Math.max(0.5, Math.min(1, Math.max(0.42, zNeed) / z0));
    return { x: dx * L, y: dy * L, fz: 1 + (fz - 1) * w, w };
  }
  /** 临界阻尼弹簧：把 (x, y) 拉向 (tx, ty)；dt 抖动时分几步走 */
  spring(tx: number, ty: number, dt: number) {
    const n = dt > 0.034 ? 3 : 2, h = Math.min(0.1, dt) / n, w = LOCKCAM_W;
    for (let i = 0; i < n; i++) {
      this.vx += (w * w * (tx - this.x) - 2 * w * this.vx) * h; this.vy += (w * w * (ty - this.y) - 2 * w * this.vy) * h;
      this.x += this.vx * h; this.y += this.vy * h;
    }
  }
  /** 从别的写法接手时，从当前偏移起步（不跳） */
  sync(x: number, y: number) { this.x = x; this.y = y; this.vx = this.vy = 0; }
}
