// 预加载：桌面版给页面标记一下，游戏里可以据此显示"桌面版"或调整全屏行为。
// 刻意不暴露任何 Node 能力——游戏代码完全当作普通网页跑。
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('__desktop', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
  isDesktop: true,
});

// 桌面版：Ctrl+滚轮不让页面自己缩放（游戏按固定排版绘制）
window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
