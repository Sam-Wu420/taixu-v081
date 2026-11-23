// v0.57：游戏节奏参数（集中在一处，模组可通过数据表 tuning 修改）
export const TUNING = {
  /** 现实每秒过几日（0.5：现实 1 分钟 = 游戏 1 个月） */
  daysPerSec: 0.5,
  /** 打坐时光阴流速倍数 */
  meditateSpeed: 3,
  /** 一日修为的基数（境界各层所需修为 = 所需天数 × 它） */
  expPerDay: 10,
};
