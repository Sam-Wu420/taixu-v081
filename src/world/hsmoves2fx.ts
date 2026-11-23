// 撼山客招式第二批（world/hsmoves2.ts）交给画面（gl/hsmoves2gl.ts）的东西：一次性的事件队列，加几样按时间画的场景件。
// 纯数据、不引任何模块（世界和画面两边都引它）。无头测试里没人取，所以每样都有上限、旧的先丢。
import type { Enemy } from './combat';

/** 被画的人：敌人，或 'p'（主角） */
export type Hs2Who = Enemy | 'p';

/**
 * 一次性的事件（画面那边每帧取走）。x、y 是脚下的世界坐标，z 是离地高度。
 *   fist   流星百裂的一记残拳（dir 拳路方向）            pass    燕回穿身而过（x,y → x2,y2）
 *   blink  超高速追击线（x,y,z → x2,y2,z2）              ring    踏空气环（空中一脚蹬出去）
 *   burst  背后炸开的冲击波（dir 冲击的方向、p 力度）     ink     黑白闪（本地小版：一团墨爆 + 色差）
 *   poke   点穴的一点                                    pop     穴位炸开
 *   slamdirt 按地那一下（脸砸进地里：一圈碎土）          grind   犁地途中撞碎石头 / 树
 *   lift   拔山、跃起时脚下炸开一圈                      plunge  陨星坠落地
 *   swing  抡人砸中旁人
 */
export interface Hs2Ev { k: string; x: number; y: number; z?: number; x2?: number; y2?: number; z2?: number; dir?: number; p?: number; c?: string; rock?: boolean }

/** 燕回留下的交叉残影线（t0 起两息内淡掉） */
export interface Hs2Line { x0: number; y0: number; x1: number; y1: number; z: number; t0: number; dur: number; c: string }
/** 点穴的穴位（跟着人走；boom 那一刻炸） */
export interface Hs2Mark { who: Hs2Who; ox: number; oz: number; t0: number; boom: number; done: boolean }
/** 犁地：正在拖（画面每帧在接触点喷泥土 / 火星、地上拖出新沟的亮边、两边的速度线） */
export interface Hs2Drag { user: Hs2Who; who: Hs2Who; dir: number; rock: boolean; sp: number; on: boolean; t0: number }
/** 流星百裂：拳影成片（画面每帧在他身前撒残拳） */
export interface Hs2Barrage { user: Hs2Who; who: Hs2Who; dir: number; on: boolean }
/** 陨星坠 / 天地往返：高速坠落的火尾 */
export interface Hs2Fall { who: Hs2Who; on: boolean; hot: number }
/** 抡人为棍：脚下转着的一圈风 */
export interface Hs2Spin { user: Hs2Who; r: number; on: boolean }

export const HS2 = {
  q: [] as Hs2Ev[],
  lines: [] as Hs2Line[],
  marks: [] as Hs2Mark[],
  drags: [] as Hs2Drag[],
  barrages: [] as Hs2Barrage[],
  falls: [] as Hs2Fall[],
  spins: [] as Hs2Spin[],
};

const cap = <T>(a: T[], n: number) => { if (a.length > n) a.splice(0, a.length - n); };
/** 发一个事件 */
export function hs2fx(ev: Hs2Ev) { HS2.q.push(ev); cap(HS2.q, 96); }
/** 加一样场景件（返回它本身，招式收场时把 on 置 false） */
export function hs2add<K extends 'lines' | 'marks' | 'drags' | 'barrages' | 'falls' | 'spins'>(k: K, it: (typeof HS2)[K][number]): (typeof HS2)[K][number] {
  const a = HS2[k] as unknown[]; a.push(it); cap(a, k === 'lines' ? 30 : k === 'marks' ? 24 : 6);
  return it;
}
/** 换图、读档：全清 */
export function hs2clear() { for (const k of Object.keys(HS2) as (keyof typeof HS2)[]) HS2[k].length = 0; }
