// v0.52.4：触屏判定集中到一处
// 旧版只看 pointer: coarse 或 ontouchstart —— 带触摸屏的 Windows 笔记本会被误判成手机，
// 整个界面切成触屏布局。现在要求「粗指针」或「小屏 + 有触点」，桌面触屏本仍走桌面布局。

export const IS_TOUCH = (() => {
  if (typeof window === 'undefined') return false;
  try {
    const coarse = !!window.matchMedia?.('(pointer: coarse)').matches;
    const touch = (navigator.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window;
    const small = Math.min(window.innerWidth || 1920, window.innerHeight || 1080) < 820;
    return coarse || (touch && small);
  } catch { return false; }
})();

/** 纯手机（窄屏）：决定按钮大小、字号这类更细的取舍 */
export const IS_PHONE = IS_TOUCH && typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 720;
