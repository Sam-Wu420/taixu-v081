// 贴图清晰度档位：把「程序位图按多大分辨率生成」和「镜头实时缩放」解开。
// 以前清晰度直接跟着 cam.zoom 走，缩放途中树、草、城镇、人物缓存会一路重画，这是缩放卡顿的主因之一。
// 现在只取四档（texel / 世界单位，已含 dpr）：缩放停稳 0.25 秒后才换档，换档带回差；途中沿用旧档，由采样去缩放。
const TIERS = [0.25, 0.5, 1, 2];
/** 允许的最大放大倍数：需求超过当前档这么多才升档 */
const UPSCALE = 1.18;
/** 每秒对数变化率低于它才算「缩放已停」 */
const STILL_RATE = 0.05;
const SETTLE = 0.25;

class ResTier {
  /** 当前档位（texel / 世界单位，含 dpr） */
  value = 1;
  /** 档位 ÷ 实时需求：调用点原来写 z*dpr*系数，乘上它就变成 档位*系数 */
  k = 1;
  /** 缩放仍在变化（自动画质等据此暂停统计） */
  busy = false;
  /** localStorage taixu.restier=0 可关，退回按实时缩放取清晰度 */
  enabled = true;
  private last = 0;
  private still = SETTLE;
  private started = false;

  constructor() {
    try { if (typeof localStorage !== 'undefined' && localStorage.getItem('taixu.restier') === '0') this.enabled = false; } catch { /* 无存储环境 */ }
  }

  /** 每帧调用一次。want = cam.zoom * dpr；返回本帧是否换了档 */
  update(want: number, dt: number): boolean {
    if (!(want > 0)) return false;
    if (!this.enabled) { this.value = want; this.k = 1; this.busy = false; return false; }
    const rate = this.last > 0 && dt > 0 ? Math.abs(Math.log(want / this.last)) / dt : 0;
    this.last = want;
    if (rate > STILL_RATE) this.still = 0; else this.still += dt;
    this.busy = this.still < SETTLE;
    let changed = false;
    if (!this.started || !this.busy) {
      const next = this.pick(want, this.started ? this.value : 0);
      if (next !== this.value) { this.value = next; changed = true; }
      this.started = true;
    }
    this.k = this.value / want;
    return changed;
  }

  private pick(want: number, current: number): number {
    const top = TIERS[TIERS.length - 1];
    // 升档：当前档放大超过 UPSCALE 才升，升到刚好够用的那一档
    if (current === 0 || want > current * UPSCALE) {
      for (const tier of TIERS) if (tier * UPSCALE >= want) return tier;
      return top;
    }
    // 降档：下一档不需要任何放大时才降（与升档之间留出回差）
    for (const tier of TIERS) if (tier >= want) return Math.min(tier, current);
    return current;
  }
}

export const resTier = new ResTier();
