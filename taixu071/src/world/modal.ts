// 通用对话 / 交易 / 城镇面板的数据结构（第四步起，NPC、红颜、奇遇、大事件共用）
import type { Look } from '../gfx/character';
import type { LocDef } from '../data/world';

export interface DOpt {
  label: string;
  hint?: string;
  disabled?: boolean;
  tone?: 'good' | 'bad' | 'love' | 'gold';
  /** 返回下一段对话；返回 null / undefined 则关闭 */
  act?: () => DNode | null | void;
}
export interface DNode {
  speaker: string;
  title?: string;           // 称谓、境界
  portrait?: string;        // 立绘（仅红颜）
  look?: Look;              // 无立绘时，用代码绘制的半身像
  text: string;
  options: DOpt[];
  mood?: 'love' | 'danger' | 'mystic' | 'normal';
  /** 太虚问道录：可以当面打字交谈的对象（有后端时对话框下方出现输入框） */
  chat?: import('./npcchat').ChatTarget;
}

export type FakeKind = 'dyed' | 'toxic' | 'broken';
export interface ShopStock {
  id: string; price: number; n: number; age?: number;
  /** 天道篇·资源限供：本月本地还剩多少（掌柜会告诉你「只剩 n 件」） */
  quota?: number;
  /** 人心篇：伪劣丹药 / 残缺伪简暗标（未鉴定时外观与真品无异） */
  fake?: FakeKind; seller?: string; sellerName?: string; ident?: boolean; origPrice?: number;
}
export interface Shop {
  title: string; desc?: string;
  stock: ShopStock[];
  sellRate: number;                 // 卖出价格比例
  currency?: 'lingshi' | 'contrib'; // 灵石 / 宗门贡献
  noSell?: boolean;
  zone?: string;                    // 第三十七步：所在价区（卖出价按此浮动）
  isStall?: boolean;                // 地摊 / 鬼市（可能混有假货，可神识掌眼）
  sellerId?: string;
  loc?: string;                     // 天道篇：所在城镇 id（资源限供按月按产区记账）
  cacheKey?: string;                // 防刷账本键（同一进货周期内开关界面不重置库存）
}

export type Modal =
  | { kind: 'dialog'; node: DNode }
  | { kind: 'shop'; shop: Shop }
  | { kind: 'town'; loc: LocDef; fac?: string }
  | { kind: 'auction'; loc: LocDef }
  /** v0.71：宗门面板；tab = 打开时落在「本宗 / 天下宗门」哪一页 */
  | { kind: 'sect'; tab?: 'mine' | 'world' }
  | { kind: 'hearts' }
  | { kind: 'chronicle' }
  | { kind: 'relations'; tab?: 'party' | 'friend' | 'foe' | 'sect' | 'log' }
  | { kind: 'help' }
  /** v0.53：破禁之局 */
  | { kind: 'pojin'; puzzle: import('./zhenfa').Puzzle }
  /** v0.56：模组面板 */
  | { kind: 'mod'; mod: string; panel: string };
