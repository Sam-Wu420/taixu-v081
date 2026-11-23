// 真实高度与空战。
// 每个会飞的东西（主角、敌人、弹道）都有一个离地高度 z，单位和画面上人物被抬起的量一致（站着的人约 90 高）。
// 高度是连续的，但松手后会吸到两个高度带里，战场才看得清：
//   低空 40–120（刚起飞悬停在 56）：近战够得着地面，地面的人也够得着你；
//   高空 300 以上：地面的近战碰不到，只有远程和同样飞上来的才打得着。
// 判定一律按立体算：
//   近战——高度差在 MELEE_REACH 以内才打得到；
//   法术 / 飞剑——弹道自己有高度，朝目标的高度飞，高度差在命中半径之内才算打中；
//   落在地面的范围技——是一根 GROUND_AOE 高的圆柱，飞得比它高就从你脚下穿过去；
//   在空中炸开的范围技——是个球。
// 操作上不用管第三个方向：锁定了目标，就自动飞到对方的高度；想自己定高度，用上升 / 下降键。

export const ALT = {
  /** 刚起飞时悬停的高度 */
  hover: 56,
  /** 低空带、高空带 */
  lowMin: 40, lowMax: 120, high: 300,
  /** 飞行高度上限：筑基以上才上得了高空 */
  maxLow: 120, max: 420,
  /** 上升、下降的速度（每秒） */
  climb: 170, sink: 230,
  /** 近战够得着的高度差 */
  meleeReach: 72,
  /** 地面范围技的高度（圆柱） */
  groundAoe: 120,
  /** 超过这个高度，人物脚下画一条垂线连到地面 */
  plumb: 80,
} as const;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** 松手后的去向：两个高度带之间不停留，离哪边近就归到哪边 */
export function settleAltitude(target: number, dt: number): number {
  if (target <= ALT.lowMax || target >= ALT.high) return target;
  const to = target > (ALT.lowMax + ALT.high) / 2 ? ALT.high : ALT.lowMax;
  return target + (to - target) * Math.min(1, dt * 3);
}
/** 高度朝目标值走一步（升得慢、降得快） */
export function stepAltitude(z: number, target: number, dt: number): number {
  const dz = target - z, rate = (dz > 0 ? ALT.climb : ALT.sink) * 1.15 * dt;
  return z + clamp(dz, -rate, rate);
}
/** 身体中段的高度（瞄准点、弹道出手点）：z 是脚底的离地高度 */
export function chest(z: number, human = true): number { return z + (human ? 60 : 36); }
/** 两个高度之间，近战够不够得着 */
export function meleeReaches(za: number, zb: number, extra = 0): boolean { return Math.abs(za - zb) <= ALT.meleeReach + extra; }
/** 立体距离：平面上按原来的算法（纵向不压扁），再加上高度差 */
export function dist3(dx: number, dy: number, dz: number): number { return Math.hypot(dx, dy, dz); }
/** 地面范围技（圆柱）是否罩得住这个高度的人 */
export function inCylinder(z: number, height: number = ALT.groundAoe): boolean { return z <= height; }
/** 空中炸开的范围技（球）：平面距离 d、高度差 dz、半径 r */
export function inSphere(d: number, dz: number, r: number): boolean { return d * d + dz * dz <= r * r; }
/** 高度带的名字（界面上用） */
export function bandName(z: number): string { return z < 1 ? '地面' : z < (ALT.lowMax + ALT.high) / 2 ? '低空' : '高空'; }
