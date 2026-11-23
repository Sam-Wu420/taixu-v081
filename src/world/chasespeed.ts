// 追杀速度的唯一口径：追兵遁速由「追兵自身境界」决定，而不是由玩家当前速度决定。
// 旧版两处实现都把目标速度往玩家的低速上缩放，或近身后扣掉自身身法，导致：
//   1. 玩家慢走，追兵也慢吞吞；2. 元婴后期步行逃命，御剑的元婴追兵反而咬不住。
// 这里拆成两条明确规则：
//   · 玩家正常赶路（步行 / 御器平飞）：同境与高境追兵保持自身境界遁速，稳定逼近；
//   · 玩家催动遁光：同境追兵只能吃到自己的平飞速度，甩不掉；高一大境者仍能强追。
// 低境追兵永远不会被硬抬到能追住高境玩家，避免“炼气追元婴”的荒唐情况。
import { REALMS } from '../data/realms';

export interface HuntTarget {
  /** 玩家当前实际速度（像素/秒） */
  v: number;
  flying: boolean;
  boosting: boolean;
  /** 玩家大境界 */
  realm: number;
}

const clampRealm = (realm: number) => Math.max(0, Math.min(REALMS.length - 1, Math.floor(realm)));

/** 追兵自身的基准遁速。大境界是硬门槛，小境界只给很小的加成。 */
export function hunterChaseSpeed(realm: number, stage = 0): number {
  const r = clampRealm(realm);
  const base = REALMS[r].speed;
  const stageK = 1 + Math.max(0, Math.min(2, stage)) * 0.025;
  // 炼气不能御器，靠轻身术 / 神行符；筑基起御剑或遁光。
  const flyK = r >= 2 ? 1 : 0.94;
  return base * 2.08 * flyK * stageK;
}

/**
 * 追兵此刻应该追求的速度。
 * 注意所有分支都有一个与玩家速度无关的自身遁速保底，所以玩家原地慢走时追兵不会跟着变慢。
 */
export function chaseTargetSpeed(realm: number, stage: number, target: HuntTarget): number {
  const own = hunterChaseSpeed(realm, stage);
  const gap = realm - target.realm;
  const v = Math.max(0, target.v);

  if (target.boosting) {
    // 遁光是玩家的保命本事：同境 / 低境追兵只余平飞速度，高一大境才会燃烧法力强追。
    if (gap >= 1) return Math.max(own * 1.22, v * 1.04);
    if (gap === 0) return Math.max(own * 0.88, v * 0.84);
    return Math.max(own * 0.82, v * 0.82);
  }

  // 正常逃跑：追兵先拿出自身遁速；若玩家（靴子 / 功法加成后）更快，才补到明显快于玩家。
  // 这个补速只向上补，绝不因为玩家慢而把追兵拉慢。
  const match = Math.max(own, target.flying ? v * 1.12 : v);
  if (gap >= 1) return match * 1.18 + 50;
  if (gap === 0) return match * 1.1 + 40;
  // 低于玩家一个大境界：追不上就是追不上，但仍以自身全速追赶。
  return Math.min(own * 0.96, match * 0.96);
}

/**
 * 近身缠斗时的身法（追到跟前之后用）。
 * 旧版追到 400 丈外就“停车”，或者近身后只剩斗法身法（元婴约 560~645），
 * 而元婴后期玩家光靠跑就有 976 —— 于是出现“御剑的追兵跟在屁股后面却永远贴不上来”。
 *   · 玩家站定斗法：用自身斗法身法（base × 1.3），正常走位；
 *   · 玩家拔腿就跑、未催遁光：同境 / 高境直接提到追击遁速，咬住不放；
 *   · 玩家催动遁光：同境 / 低境只剩自身平飞速度，会被拉开（保命手段依旧有效）。
 * base = 该敌人的斗法基础移速（foeBase / e.speed）。
 */
export function engageSpeed(base: number, realm: number, stage: number, target: HuntTarget): number {
  const fight = Math.max(1, base) * 1.3;
  if (target.v < 60) return fight;
  return Math.max(fight, chaseTargetSpeed(realm, stage, target));
}
