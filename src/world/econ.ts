// P11 总账：全世界的灵石从哪来、到哪去。
//
// 平时不记流水（ECON.on 为假，flow() 什么都不做）；百年经济模拟器（tools/sim-economy.ts）打开它，按月统计每条进水口、出水口。
// 存量（moneySupply）随时可算：活着的 NPC 身上的灵石 + 押在万宝楼求购里的出价。主角不算在内（主角的进出另有一套）。
import type { Game } from './game';

/** 进水口（灵石进入世界）与出水口（离开世界）的名字 */
export const FLOW_NAME: Record<string, string> = {
  salary: '宗门月俸', farm: '耕作营生', newcomer: '踏入仙途的盘缠', newborn: '新生修士的家底', shopSell: '卖给铺子', buyout: '万宝楼收滞销货',
  hunt: '结伴猎妖所得', herbs: '结伴采药所得', caravan: '商队跑货的赚头',
  /** 收官 D：你和摊主之间的买卖（转手：你付的进世界、他付你的出世界；不在进水口、出水口名单里） */
  stall: '摊位买卖（你与摊主转手）',
  shopBuy: '在铺子里买东西', fee: '万宝楼抽成', splurge: '大户挥霍（开府、收徒、供奉）', auction: '拍卖会成交（NPC 拍下）',
};
export const FAUCETS = ['salary', 'farm', 'newcomer', 'newborn', 'shopSell', 'buyout', 'hunt', 'herbs', 'caravan'] as const;
export const SINKS = ['shopBuy', 'fee', 'splurge', 'auction'] as const;

export const ECON = { on: false, f: {} as Record<string, number>, /** 模拟器对照用：关掉总账的自动调节 */ noRegulate: false,
  /** 11e：模拟器看的计数（拍卖成交 / 流拍、破境丹求购与成交、赊丹……），只在 ECON.on 时累计，不影响任何逻辑 */
  t: {} as Record<string, number> };
/** 记一笔流水（正数＝进水，负数＝出水） */
export function flow(k: string, v: number): void { if (ECON.on && v) ECON.f[k] = (ECON.f[k] ?? 0) + v; }
/** 记一个计数（模拟器用） */
export function tally(k: string, v = 1): void { if (ECON.on && v) ECON.t[k] = (ECON.t[k] ?? 0) + v; }

/**
 * 存量：活着的 NPC 身上的灵石 + 押在万宝楼求购里的出价。
 * perHead 只算修士（炼气以上）身上的：在万宝楼里买卖、物价跟着走的是他们；凡人攒的钱另有身家上限管着（凡人人均开局几十、
 * 攒到上限几百就停，那一步上台阶若算进人均，调节会以为通胀、一直压到底）
 */
export function moneySupply(g: Game): { total: number; cultivators: number; perHead: number; byRealm: number[]; heads: number[] } {
  let total = 0, cultivators = 0, cultMoney = 0;
  const byRealm = [0, 0, 0, 0, 0, 0], heads = [0, 0, 0, 0, 0, 0];
  for (const d of g.npcs.list) {
    if (!d.alive) continue;
    const w = Number.isFinite(d.wealth) ? Math.max(0, d.wealth) : 0;
    total += w;
    const r = Math.max(0, Math.min(5, d.realm));
    byRealm[r] += w; heads[r]++;
    if (d.realm >= 1) { cultivators++; cultMoney += w; }
  }
  for (const o of g.wanbao.S.orders) if (o.buyer !== 'hero') { const v = g.wanbao.held(o); total += v; cultMoney += v; }   // 赊购单只押了定金
  return { total, cultivators, perHead: cultMoney / Math.max(1, cultivators), byRealm, heads };
}
