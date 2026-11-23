// r15-touchctl：设置里的「画面颗粒」开关（记在本机 localStorage taixu.grain，默认开）。
//
// 画面上的颗粒是两处来的：
//   · WebGL 后期（gl/stage.ts 的「纸纹」那两行）：按屏幕像素撒的一层静止暗点（每点最多压暗 12%），镜头动它不动，手机上看着像一层砂；
//   · Canvas2D 兼容路径（world/mood.ts 的 drawPost）：一张平铺的宣纸纤维图，3.5%–6% 叠上去。
// 关掉：两处都不画。后期里另有一行很弱的逐像素抖动（±半级灰阶，看不出颗粒）一直开着，防止暗角、雾这些大片渐变出色带。
// 网址带 ?grain=0 / ?grain=1 会顺手写进去（对照截图用）。

const KEY = 'taixu.grain';

export const grainSetting = { on: (() => {
  try {
    if (typeof location !== 'undefined') { const q = new URLSearchParams(location.search).get('grain'); if (q === '0' || q === '1') localStorage.setItem(KEY, q); }
    return typeof localStorage === 'undefined' || localStorage.getItem(KEY) !== '0';
  } catch { return true; }
})() };

/** 设置面板里的「画面颗粒」开关：立刻生效，记在本机 */
export function setGrainOn(on: boolean): void {
  grainSetting.on = on;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* 隐私模式 */ }
}

/** 后期着色器的颗粒强度（uGrain）：开 1，关 0 */
export function grainAmount(): number { return grainSetting.on ? 1 : 0; }
