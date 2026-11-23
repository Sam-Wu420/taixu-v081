// 旧图标入口保留给调用方和模组：原版物品回到程序生成，显式注册的图标优先。
import { ITEMS } from '../data/items';
import { proceduralItemIcon } from './itemProcedural';
const overrides = new Map<string,string>();
export function paintedIcon(id:string):string|null {
  const custom=overrides.get(id);if(custom)return custom;
  const item=ITEMS[id];return item?proceduralItemIcon(item):null;
}
export function registerIcons(map:Record<string,string>){
  for(const [id,url] of Object.entries(map))if(typeof url==='string'&&url)overrides.set(id,url);
}
