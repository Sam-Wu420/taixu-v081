// r15-touchctl：手机摇杆的推力换算（纯函数，tools/test-joystick.ts 测）。
//
// 以前的毛病（「拉到最边缘的时候人物移动很慢」）：触点拉出推满半径后，先把 dx、dy 夹到半径上，
// 再拿「夹过的 dx」除以「没夹的距离 d」当方向——方向向量的长度变成 max / d，拉得越远越短：
// 推到摇杆外沿（底盘半径，推满半径的 1 / 0.62 倍）只剩六成速度，手指滑出圈外更慢，可推力 joyMag 又是 1、疾行圈照样亮着。
// 跟设备像素比无关：触点（clientX）和底盘尺寸（getBoundingClientRect）都是 CSS 像素。
//
// 现在：方向一律是单位向量，推力 = min(1, d / 推满半径)，线性——推一半半速，推到推满半径及圈外都是满速；
// 中心一小圈死区（推满半径的 8%）不动，免得手指一放上去人就挪。

/** 推满半径占底盘半径的比例（摇杆头最远走到这里） */
export const JOY_REACH = 0.62;
/** 死区：推满半径的这一成以内算没推 */
export const JOY_DEAD = 0.08;

export interface JoyOut {
  /** 写进 game.input.joy 的向量（长度 = mag） */
  x: number; y: number;
  /** 推力 0–1（写进 game.input.joyMag；> 0.86 自动疾行） */
  mag: number;
  /** 摇杆头的位移（和 dx、dy 同一单位，长度不超过 max） */
  kx: number; ky: number;
}

/**
 * dx、dy：触点相对底盘圆心的偏移；max：推满半径（和 dx、dy 同一单位）。
 * 返回的方向连续、推力线性，拉出圈外不衰减。
 */
export function joyFromDrag(dx: number, dy: number, max: number, dead = JOY_DEAD): JoyOut {
  const d = Math.hypot(dx, dy);
  if (!(max > 0) || !(d > 0)) return { x: 0, y: 0, mag: 0, kx: 0, ky: 0 };
  const ux = dx / d, uy = dy / d, kd = Math.min(d, max);
  const m = Math.min(1, d / max);
  if (m <= dead) return { x: 0, y: 0, mag: 0, kx: ux * kd, ky: uy * kd };
  return { x: ux * m, y: uy * m, mag: m, kx: ux * kd, ky: uy * kd };
}
