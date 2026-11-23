// 旧建筑接口：使用程序画材适配既有宗门、城市、名胜与船只绘制。
import type { Pal } from './building';
import { townShopMips } from './townShops';
import { townHouseMips } from './townHouses';
import { townGateMips } from './townGates';
import { townWallMips } from './townWalls';
import { townPropMips } from './townProps';

const KEYS: Record<string,string> = {
 hall_grey:'f3_hall', hall_jade:'f1_hall_b', hall_dark:'f5_hall', hall_rose:'f4_hall',
 pagoda:'b07', paifang:'b04', house_a:'b02', house_b:'b03', hut:'b30', yurt:'b24a',
 stall:'p_stall_herb', tower:'f6_watchtower', citygate:'b20', wall:'b36_strip', lion:'p_lion_l',
 ding:'p_cauldron', stele:'p_stele_a', well:'p_well', lantern:'p_slantern', boat:'p_boat_s',
};
/** 保留旧初始化签名；程序画材按需生成，无异步替换造成的缓存失效。 */
export function loadBldTex(_cb:()=>void) { }
export function bldTex(name:string):HTMLCanvasElement|null {
 const key=KEYS[name]; if(!key)return null;
 return (townShopMips(key) ?? townHouseMips(key) ?? townGateMips(key) ?? townWallMips(key) ?? townPropMips(key))?.[0] ?? null;
}

const lum = (hex: string) => { const v = parseInt(hex.slice(1), 16); return (((v >> 16) & 255) * 0.3 + ((v >> 8) & 255) * 0.59 + (v & 255) * 0.11) / 255; };
const rgb = (hex: string) => { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
/** 按配色选殿宇贴图家族：魔道（暗）/ 青绿琉璃 / 粉紫 / 灰瓦 */
export function hallFamily(pal: Pal): string {
  const [r, g, b] = rgb(pal.roof);
  if (lum(pal.wall) < 0.4 || (lum(pal.roof) < 0.16 && lum(pal.wall) < 0.6)) return 'hall_dark';
  if (g > r + 12 && g >= b - 10) return 'hall_jade';
  if (b > g + 12 && r > g + 8) return 'hall_rose';
  return 'hall_grey';
}
/** 暗色宗门里的普通房屋压暗，粉紫宗门略带粉调 */
export function houseFilter(pal: Pal): string {
  const f = hallFamily(pal);
  return f === 'hall_dark' ? 'brightness(0.62) saturate(0.7) sepia(0.15)' : f === 'hall_rose' ? 'hue-rotate(-12deg) saturate(1.05)' : 'none';
}
