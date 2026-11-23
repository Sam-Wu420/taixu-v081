// 收官 B3：海上大件（鲸背、触须、蛟身、灵舟、鬼船、祭坛、遗迹）在「没有 WebGL」的纯 2D 回退里的画法要用的图。
// 贴图和 HD 场景是同一份（gfx/seaTexData.ts 的 data URL，懒加载）；这里只缓存成 Image，画的时候没加载好就先不画那一件。
let SRC: Record<string, string> | null = null, started = false;
const cache = new Map<string, HTMLImageElement | null>();

/** 取一张图（没加载好返回 null，下一帧再问） */
export function seaImg(key: string): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  if (!started) { started = true; import('./seaTexData').then((m) => { SRC = m.SEA_SRC; }).catch(() => { /* 没有图就只画程序化的那部分 */ }); }
  const have = cache.get(key);
  if (have) return have.complete && have.naturalWidth > 0 ? have : null;
  if (have === null || !SRC?.[key]) return null;
  const im = new Image(); im.src = SRC[key]; cache.set(key, im);
  return null;
}
