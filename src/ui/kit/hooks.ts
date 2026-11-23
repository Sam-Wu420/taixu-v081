// 界面底座：跟着设备、设置变化而重渲染的小钩子。
//   useTouch      —— 触屏状态（core/touch.ts 可订阅之后，转屏、接鼠标、拖窄窗口都会重新判定）
//   useHudScale   —— 设置里的「界面大小」（80%–130%，存 localStorage），GameView 把它写进 --hud-scale
import { useSyncExternalStore } from 'react';
import { isTouch, subscribeTouch } from '../../core/touch';

export function useTouch(): boolean {
  return useSyncExternalStore(subscribeTouch, isTouch, isTouch);
}

const SCALE_KEY = 'taixu.hudScale';
export const HUD_SCALE_MIN = 0.8, HUD_SCALE_MAX = 1.3;
const clampScale = (v: number) => Math.round(Math.max(HUD_SCALE_MIN, Math.min(HUD_SCALE_MAX, v)) * 20) / 20;
let scale = (() => { try { const v = Number(localStorage.getItem(SCALE_KEY)); return Number.isFinite(v) && v > 0 ? clampScale(v) : 1; } catch { return 1; } })();
const scaleSubs = new Set<() => void>();
export function getHudScale(): number { return scale; }
export function setHudScale(v: number): void {
  const n = clampScale(v); if (n === scale) return;
  scale = n; try { localStorage.setItem(SCALE_KEY, String(n)); } catch { /* 隐私窗口存不了，只管这一局 */ }
  for (const f of [...scaleSubs]) f();
}
/**
 * 第五轮：手机上「界面大小」的可用范围收窄（85%–110%）：竖屏 390 宽放到 130% 时法诀盘压住摇杆、地点卡出屏；80% 时情境提示压住「架」。
 * 存下来的值不动（同一份设置换到电脑上照旧），只是手机上按这个范围夹一下再用。
 */
export const HUD_SCALE_TOUCH_MIN = 0.85, HUD_SCALE_TOUCH_MAX = 1.1;
export const hudScaleRange = (touch: boolean): [number, number] => (touch ? [HUD_SCALE_TOUCH_MIN, HUD_SCALE_TOUCH_MAX] : [HUD_SCALE_MIN, HUD_SCALE_MAX]);
export const effHudScale = (v: number, touch: boolean): number => { const [a, b] = hudScaleRange(touch); return Math.max(a, Math.min(b, v)); };
export function useHudScale(): number {
  const touch = useTouch();
  const v = useSyncExternalStore((f) => { scaleSubs.add(f); return () => { scaleSubs.delete(f); }; }, getHudScale, getHudScale);
  return effHudScale(v, touch);
}
