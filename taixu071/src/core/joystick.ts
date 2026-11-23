/** 移动端虚拟摇杆线性比例映射（轻推 <= 0.86 按推力比例调速，> 0.86 触发疾行/遁光） */

export const JOY_DEAD_PX = 4;
export const JOY_DEAD_MAG = 0.05;
export const JOY_RUN_MAG = 0.86;

export interface JoystickOutput {
  /** 写入 game.input.joy.x：按推力比例 mag 缩放后的方向分量 */
  x: number;
  /** 写入 game.input.joy.y：按推力比例 mag 缩放后的方向分量 */
  y: number;
  /** 原始归一化推力（0–1），> JOY_RUN_MAG 时触发自动疾行/遁光 */
  mag: number;
  /** 摇杆钮视觉偏移（px，已夹紧在有效行程内） */
  knobX: number;
  knobY: number;
}

/**
 * 将摇杆相对圆心的像素位移映射为移动向量与摇杆钮位置：
 * - 死区内（d <= 4px 或 mag <= 0.05）：静止（x=0, y=0, mag=0）
 * - 轻推区（0.05 < mag <= 0.86）：速度严格随推力比例 mag 线性变化
 * - 疾行区（mag > 0.86）：保持全向推力并触发疾行/遁光
 */
export function mapJoystickVector(rawX: number, rawY: number, radiusPx: number): JoystickOutput {
  const max = Math.max(1, radiusPx * 0.62);
  const d = Math.hypot(rawX, rawY);
  let knobX = rawX;
  let knobY = rawY;
  if (d > max) {
    knobX = (rawX / d) * max;
    knobY = (rawY / d) * max;
  }
  if (d <= JOY_DEAD_PX) {
    return { x: 0, y: 0, mag: 0, knobX, knobY };
  }
  const mag = Math.min(1, d / max);
  if (mag <= JOY_DEAD_MAG) {
    return { x: 0, y: 0, mag: 0, knobX, knobY };
  }
  return {
    x: (rawX / d) * mag,
    y: (rawY / d) * mag,
    mag,
    knobX,
    knobY,
  };
}
