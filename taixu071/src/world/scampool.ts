// v0.52.1 天道 · 骗局频率台账（纯函数，无副作用）
//
// 原文 2.3「频率控制：骗局占同类事件的 15–25%，让玩家保持怀疑但不至于草木皆兵」。
// 此前野外奇遇池的权重写死在 happen.spawn()，各事件「是不是局」的概率又散落在 happen / jianghu / pianju 三处，
// 而 test-renxin 另抄了一份过时的权重表来断言 15–25%——美人局、渡劫局、商队夹带加进来以后，
// 真实占比早已越界（凡人档 ≈24.6%、天道档 ≈27%），测试却一直是绿的。
// 现在：事件池权重与每类事件的骗局概率只在这里写一次，游戏与测试共用同一份数学（同 quota.ts 的做法）。

export type HapKind = 'robber' | 'tribul' | 'chase' | 'caravan' | 'wager' | 'beastfight' | 'coopruin' | 'borrowknife' | 'duoshe' | 'escort';

/** 每类奇遇「是一场局」的基础概率（未乘道心系数） */
export const HAP_SCAM_BASE: Record<HapKind, number> = {
  robber: 0, chase: 0, wager: 0, beastfight: 0,
  tribul: 0.2,        // #9 渡劫局：劫云里混着雇来的杀手
  caravan: 0.24,      // #11 商队夹带：箱子里是魔道的货（随道心浮动）
  coopruin: 0.68,     // #1 合作探宝，分赃翻脸（按性格：贪 / 狠即为局）
  borrowknife: 0.68,  // #3 借刀杀人
  duoshe: 0.7,        // #5 夺舍老魔
  escort: 0.55,       // #4 美人局
};

/** 可疑奇遇（求援 / 邀约类）的基础权重——道心系数作用在「出现的频率」上，局的真假比例不变 */
const SUSPECT: Partial<Record<HapKind, [number, number]>> = {
  // [基础权重, 下限]
  coopruin: [7, 3], borrowknife: [8, 3], duoshe: [6, 2], escort: [6, 2],
};

/** 某类奇遇此刻是局的概率（sm = 道心骗局系数：天骄 0.55 / 凡人 1 / 天道 1.18） */
export function hapScamP(kind: HapKind, sm = 1): number {
  const b = HAP_SCAM_BASE[kind] ?? 0;
  if (kind === 'caravan') return Math.min(0.5, b * sm);
  return b;
}

/** 野外奇遇池权重（rep：正道声望；feared：先礼后兵翻脸打赢后劫修绕行） */
export function hapPool(sm = 1, rep = 0, feared = false): [HapKind, number][] {
  const s = (k: HapKind) => { const [w, lo] = SUSPECT[k]!; return Math.max(lo, Math.round(w * sm)); };
  const rob = rep < -30 ? 14 : 6, robW = Math.round(rob * (feared ? 0.25 : 1));
  return [
    ['robber', robW],
    ['tribul', 10],
    ['chase', 16],
    ['caravan', 10],
    ['wager', 14],
    // 劫修绕道而行，空出来的路让给山里的妖兽（不让骗局占比因此水涨船高）
    ['beastfight', 20 + (rob - robW)],
    ['coopruin', s('coopruin')],
    ['borrowknife', s('borrowknife')],
    ['duoshe', s('duoshe')],
    ['escort', s('escort')],
  ];
}

/** 期望骗局占比（全池里「遇上的是一场局」的概率） */
export function scamShare(sm = 1, rep = 0, feared = false): number {
  const pool = hapPool(sm, rep, feared);
  const tot = pool.reduce((a, b) => a + b[1], 0);
  return pool.reduce((a, [k, w]) => a + w * hapScamP(k, sm), 0) / tot;
}

/** 按权重抽一类奇遇 */
export function rollHapKind(sm = 1, rep = 0, feared = false, rnd: () => number = Math.random): HapKind {
  const pool = hapPool(sm, rep, feared);
  const tot = pool.reduce((a, b) => a + b[1], 0);
  let r = rnd() * tot;
  for (const [k, v] of pool) { r -= v; if (r <= 0) return k; }
  return pool[pool.length - 1][0];
}
