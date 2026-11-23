// 近战（brawl / clash / brawlfoe / breakables）自己的随机序列。
// 不从 Math.random 取：固定种子的老测试（test-gore、test-melee、test-pursuit、test-combat-spatial、test-combat-terrain……）
// 靠 Math.random 的序列复现结果，近战新加的分支一个数都不能从那里多取。
import { mulberry32 } from '../core/rng';

let gen = mulberry32(0x5eedb2a1);
/** 0‥1 */
export const brnd = () => gen();
/** a‥b */
export const brange = (a: number, b: number) => a + gen() * (b - a);
/** 测试用：重置序列 */
export function reseedBrawl(seed: number) { gen = mulberry32(seed >>> 0); }
/** 按若干整数取一个稳定的种子（可破坏物按分块取种子用） */
export function hash32(...n: number[]): number {
  let h = 2166136261;
  for (const v of n) { h ^= v | 0; h = Math.imul(h, 16777619); h ^= h >>> 13; }
  return h >>> 0;
}
