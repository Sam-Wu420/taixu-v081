// 撼山客出招时的特写镜头（brawl.stageCam：推近、侧面取景、把两人框进画面）。
// 用户 2026-11-18：「撼山客不要拉近镜头的效果啊，不然玩家很难受的」——正式游戏里默认关，设置里能打开（记在本机 taixu.hscam）。
// 试玩页（tools/perf-acceptance.html，对照图、录像都靠它）默认开，网址加 &hscam=0 可关；Node 测试里开着（测试按原来的取景断言）。
// 关着时招式照常放、全屏演出照常有，只是镜头不被他接管：照常跟着你走。
const KEY = 'taixu.hscam';
function load(): boolean {
  if (typeof window === 'undefined' || typeof location === 'undefined') return true;
  try {
    const q = new URLSearchParams(location.search).get('hscam');
    if (q === '1') return true;
    if (q === '0') return false;
    if (/perf-acceptance/.test(location.pathname)) return true;
    return localStorage.getItem(KEY) === '1';
  } catch { return false; }
}
export const hsCamSetting = { on: load() };
export function setHsCam(on: boolean) {
  hsCamSetting.on = on;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* 无痕窗口等 */ }
}
