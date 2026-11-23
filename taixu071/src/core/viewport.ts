// 锁定页面缩放：移动端双指/双击、桌面 Ctrl+滚轮 / Ctrl +/- 都不改浏览器缩放。
// 只阻止「缩放」，不阻止游戏内自己的镜头缩放、弹窗滚动和单指操作。
export function lockViewportZoom() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // Safari 的捏合手势（Chrome/Android 由 viewport + touch-action 兜底）
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  }

  // 双指拖动：阻止页面缩放，但面板里的单指滚动不受影响
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  // 桌面浏览器：Ctrl/⌘ + 滚轮、Ctrl/⌘ + +/-/0 不缩放页面
  document.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
  }, { passive: false });
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0') e.preventDefault();
  }, { passive: false });
}
