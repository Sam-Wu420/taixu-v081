// 帧率上限只控制主游戏循环；浏览器/显示器仍决定实际可达到的帧率。
export const FRAME_LIMITS = [0, 30, 60, 90, 120, 144] as const;
export type FrameLimit = typeof FRAME_LIMITS[number]; // 0 = 不主动限制
export const FRAME_LIMIT_KEY = 'fanren.frameLimit';
export function parseFrameLimit(value: unknown): FrameLimit {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return FRAME_LIMITS.includes(n as FrameLimit) ? n as FrameLimit : 60;
}
/** 将有意的低帧率间隔折算到 60 帧预算，避免自动 LOD 因 30 帧上限而误降。 */
export function adaptiveFrameSeconds(seconds: number, limit: FrameLimit): number {
  return limit > 0 && limit < 60 ? seconds * limit / 60 : seconds;
}
export class FramePacer {
  private next = 0;
  private limit: FrameLimit = 0;
  reset() { this.next = 0; }
  shouldRun(now: number, limit: FrameLimit): boolean {
    if (limit !== this.limit) { this.limit = limit; this.next = 0; }
    if (!limit) return true;
    const interval = 1000 / limit;
    if (!this.next || now < this.next - interval * 2 || now > this.next + interval * 4) this.next = now;
    if (now + 0.5 < this.next) return false;
    this.next += interval;
    return true;
  }
}
