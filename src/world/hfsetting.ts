// r9-hitfeel 的总开关（单独一个没有依赖的小文件：底层的 gl/fx.ts 也要读，免得引进整个打击感模块造成循环引用）。
// 网址带 ?hf=0、或 localStorage taixu.hitfeel=0 时关掉（退回原来的画法，对照「改前」用）
export const hfSetting = { on: (() => {
  try {
    if (typeof location !== 'undefined') { const q = new URLSearchParams(location.search).get('hf'); if (q === '0' || q === '1') localStorage.setItem('taixu.hitfeel', q); }
    return typeof localStorage === 'undefined' || localStorage.getItem('taixu.hitfeel') !== '0';
  } catch { return true; }
})() };
