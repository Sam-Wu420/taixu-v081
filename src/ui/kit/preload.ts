// 第五轮：界面贴图预载。储物袋第一次打开时洞府夜景底图、匾额、角花要现下载现解码，开头约一秒是空的（只有漆色底）；
// 标题页闲着时（或直接进游戏时）先把这几张拿下来并解码，留着引用，之后开面板直接有图。
import sceneUrl from '../../assets/kit/inv_scene.webp';
import ebonyUrl from '../../assets/kit/ebony.webp';
import plaqueUrl from '../../assets/wanbao/plaque.webp';
import cornerUrl from '../../assets/wanbao/corner.webp';
import paperUrl from '../../assets/wanbao/paper.webp';

const keep: HTMLImageElement[] = [];
export function preloadUiArt(): void {
  if (keep.length || typeof Image === 'undefined') return;
  for (const u of [sceneUrl, plaqueUrl, cornerUrl, ebonyUrl, paperUrl]) {
    const im = new Image(); im.decoding = 'async'; (im as HTMLImageElement & { fetchPriority?: string }).fetchPriority = 'high'; im.src = u; keep.push(im);   // 开发服务器上几百个模块排着队，不提优先级要等十来秒
    try { void im.decode?.().catch(() => { /* 解不了就等真用到时再说 */ }); } catch { /* 老浏览器没有 decode */ }
  }
}
