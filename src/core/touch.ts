// v0.52.4：触屏判定集中到一处
// 旧版只看 pointer: coarse 或 ontouchstart —— 带触摸屏的 Windows 笔记本会被误判成手机，
// 整个界面切成触屏布局。现在要求「粗指针」或「小屏 + 有触点」，桌面触屏本仍走桌面布局。
//
// 收官 H3：改成可订阅的状态。原来只在启动时判定一次——手机转屏、平板接上鼠标、桌面窗口拖窄，界面都不跟着变。
//   · IS_TOUCH / IS_PHONE 仍是导出的变量（ES 模块的导出是「活绑定」，重新判定后别处 import 进去的值也跟着变），
//     所以 `import { IS_TOUCH }` 的老代码照常能用；要跟着重渲染的界面用 subscribeTouch / ui/kit 的 useTouch。
//   · 重新判定的时机：改窗口大小、转屏、指针类型的媒体查询变化（接上 / 拔掉鼠标），以及「真的用鼠标动了」或「真的用手指点了」。
//   · 开发用开关：网址带 ?touch=1 强制触屏、?touch=0 强制电脑（无头截图拍手机版面要用；不写进存档、不影响正式游玩）。

const forced = (): boolean | null => {
  try {
    const q = new URLSearchParams(location.search).get('touch');
    return q === '1' ? true : q === '0' ? false : null;
  } catch { return null; }
};

/** 最近一次真正用过的指针：'mouse' 时即使窗口小也按电脑布局（平板接了鼠标）；'touch' 时小窗口按触屏布局 */
let lastPointer: '' | 'mouse' | 'touch' = '';

function detect(): boolean {
  if (typeof window === 'undefined') return false;
  const f = forced(); if (f !== null) return f;
  try {
    const coarse = !!window.matchMedia?.('(pointer: coarse)').matches;
    const touch = (navigator.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window;
    const small = Math.min(window.innerWidth || 1920, window.innerHeight || 1080) < 820;
    if (lastPointer === 'mouse' && !coarse) return false;
    if (lastPointer === 'touch' && small) return true;
    return coarse || (touch && small);
  } catch { return false; }
}
const phoneOf = (t: boolean) => t && typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 720;

export let IS_TOUCH = detect();
/** 纯手机（窄屏）：决定按钮大小、字号这类更细的取舍 */
export let IS_PHONE = phoneOf(IS_TOUCH);

const subs = new Set<() => void>();
/** 订阅触屏状态的变化（返回取消订阅） */
export function subscribeTouch(f: () => void): () => void { subs.add(f); return () => { subs.delete(f); }; }
export function isTouch(): boolean { return IS_TOUCH; }
/** 立刻重新判定一次（变了就通知订阅者） */
export function recheckTouch(): void {
  const t = detect(), p = phoneOf(t);
  if (t === IS_TOUCH && p === IS_PHONE) return;
  IS_TOUCH = t; IS_PHONE = p;
  for (const f of [...subs]) { try { f(); } catch (e) { console.warn('[touch] 订阅者出错', e); } }
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  let tm: ReturnType<typeof setTimeout> | undefined;
  const later = () => { clearTimeout(tm); tm = setTimeout(recheckTouch, 120); };   // 用全局的定时器，不经 window（测试里的假 window 没有这两个方法）
  window.addEventListener('resize', later);
  window.addEventListener('orientationchange', later);
  try { window.matchMedia?.('(pointer: coarse)').addEventListener?.('change', later); } catch { /* 老浏览器没有 */ }
  try { window.matchMedia?.('(any-pointer: fine)').addEventListener?.('change', later); } catch { /* */ }
  // 真用鼠标动了（有位移，不是触摸模拟出来的）/ 真用手指点了：记下来再判一次
  window.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && (e.movementX || e.movementY) && lastPointer !== 'mouse') { lastPointer = 'mouse'; later(); } }, { passive: true });
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && lastPointer !== 'touch') { lastPointer = 'touch'; later(); } }, { passive: true, capture: true });
}
