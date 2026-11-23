// 第五十一步「天道」3.4 资源限供——纯函数台账
//
// 为什么单独抽一个模块：坊市发货（daoxin.ts）与节奏模拟（tools/test-tiandao.ts）必须共用**同一份数学**。
// 原文的要求是「注意节奏模拟要同步跑，别把苏寒式玩家的丹药断供成苦修派」——
// 如果测试里另抄一套产量公式，限供一改，测试就成了自欺欺人。
//
// 数法（原著口径）：
// · 筑基丹主药（紫猴花 / 天灵果）：南荒一年十二株上下，中州稍多，沧溟海几乎不出；
// · 南荒筑基丹归七派把持，散修市面一月一颗上下，沧溟海反而常见；
// · 越高级的丹越少：四阶丹一月两颗、三阶四颗、其余九颗；
// · 城越大分到的月货越多：天下名城 50% · 雄城 32% · 大城 20% · 村镇 12%。

import { itemDef } from '../data/items';
import type { PZone } from '../data/market';

/** 筑基丹主药：全南荒一年就出那么多株 */
export const ZHUJI_HERBS = new Set(['herb_zihou', 'herb_tianling']);
export const QUOTA_MONTH = 30;

/** 稳定的散列随机（同一个月、同一产区、同一件货，各家铺子看到的是同一份产量） */
export function hash01(...xs: (string | number)[]): number {
  let h = 2166136261;
  const s = xs.join('|');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

/** 城越大，分到的月货越多 */
export const quotaShare = (cityT: number): number => (cityT >= 5 ? 0.5 : cityT >= 4 ? 0.32 : cityT >= 3 ? 0.2 : 0.12);

/** 这件货是否受月限 */
export function limitedItem(id: string): boolean {
  const it = itemDef(id);
  if (!it) return false;
  if (ZHUJI_HERBS.has(id) || id === 'pill_zhuji') return true;
  if (it.type === 'herb') return it.tier >= 2;
  if (it.type === 'pill') return it.tier >= 2;
  if (it.type === 'artifact' || it.type === 'scroll') return it.tier >= 3;
  return false;
}

/** 本月该产区该物的总产量（株 / 颗 / 件），同产区所有铺子共用一本账 */
export function supplyOfZone(pz: PZone, id: string, month: number): number {
  const it = itemDef(id);
  if (!it) return 99;
  const year = Math.floor(month / 12), m = month % 12;
  const h = hash01(pz, id, year, m);
  if (ZHUJI_HERBS.has(id)) {
    const annual = pz === 'TN' ? 12 : pz === 'DJ' ? 16 : 2;
    const per = annual / 12;
    return Math.max(0, Math.round(per * (0.4 + h * 1.5)));
  }
  if (id === 'pill_zhuji') return pz === 'LX' ? Math.round(h * 2) : (h < 0.45 ? 1 : 0);   // 南荒筑基丹归七派把持
  if (it.type === 'herb') return Math.round((it.tier >= 4 ? 2 : it.tier === 3 ? 5 : 11) * (pz === 'LX' ? 0.45 : pz === 'DJ' ? 1.25 : pz === 'LJ' ? 1.35 : pz === 'XJ' ? 1.5 : 1) * (0.6 + h * 0.9));
  if (it.type === 'pill') return Math.round((it.tier >= 4 ? 2 : it.tier === 3 ? 4 : 9) * (pz === 'LX' ? 1.1 : pz === 'DJ' ? 1.2 : pz === 'LJ' ? 1.4 : pz === 'XJ' ? 1.6 : 1) * (0.6 + h * 0.9));
  if (it.type === 'artifact') return Math.max(1, Math.round((it.tier >= 4 ? 1 : 3) * (pz === 'LJ' || pz === 'XJ' ? 1.5 : 1) * (0.5 + h)));
  if (it.type === 'scroll') return Math.max(1, Math.round((it.tier >= 4 ? 1 : 4) * (pz === 'LJ' || pz === 'XJ' ? 1.5 : 1) * (0.5 + h)));
  return 99;
}

/** 某城本月对这件货发了多少（产区总量 × 城池份额） */
export function quotaSupplyIn(pz: PZone, id: string, month: number, cityT: number): number {
  if (!limitedItem(id)) return 99;
  return Math.max(0, Math.round(supplyOfZone(pz, id, month) * (0.55 + quotaShare(cityT))));
}

/** 某城本月还剩多少可买（led = 该产区本月已购台账） */
export function quotaLeftIn(pz: PZone, id: string, month: number, cityT: number, led: Record<string, number>): number {
  return Math.max(0, quotaSupplyIn(pz, id, month, cityT) - (led[pz + '|' + id] ?? 0));
}
