// 界面底座：品阶色表与数字格式化——原来散在 WanbaoPanel / ModalLayer / CultPanels / AuctionHall / data/items 五处、格式化三处，收成这一份。
// 两套品阶色：纸底（宣纸上看得清的深色）与漆底（乌木上看得清的亮色）；data/items 的 TIER_COLORS 是中间调，给图标描边、获宝光圈用。
import { TIER_COLORS, TIER_NAMES } from '../../data/items';

/** 宣纸底上的品阶字色（万宝楼、储物袋、商店） */
export const TIER_INK = ['#5a544a', '#2f6b5e', '#2b5a8a', '#7a3a9a', '#b8802a', '#a8352a', '#d04a20'];
/** 乌木漆底上的品阶字色（拍卖会、详情卡、储物袋格子描边） */
export const TIER_LIT = ['#8a8270', '#4f9a7c', '#4f86c0', '#a066c8', '#d8a03a', '#d8553e', '#f07a3a'];
/** 中间调（图标、光圈；与 data/items 同一份） */
export const TIER_MID = TIER_COLORS;
export { TIER_NAMES };

const at = (a: string[], t: number) => a[Math.max(0, Math.min(a.length - 1, t | 0))];
/** 取品阶色：bg 是底色（paper 纸底 / lacquer 漆底 / mid 中间调） */
export function tierColor(t: number, bg: 'paper' | 'lacquer' | 'mid' = 'paper') { return at(bg === 'paper' ? TIER_INK : bg === 'lacquer' ? TIER_LIT : TIER_MID, t); }
export function tierName(t: number) { return at(TIER_NAMES, t); }

/** 灵石、价钱：十万以上记「万」（万宝楼、拍卖会的写法） */
export function fmtStone(n: number) { return n >= 100000 ? (n / 10000).toFixed(n >= 1000000 ? 0 : 1) + '万' : Math.round(n).toLocaleString('zh-CN'); }
/** 修为等一般大数：一万以上记「万」（角色面板、闭关的写法） */
export function fmtNum(n: number) { return n >= 10000 ? (n / 10000).toFixed(1) + '万' : Math.round(n).toLocaleString('zh-CN'); }
