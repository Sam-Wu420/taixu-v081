export interface CameraFollowOpts {
  /** 本帧角色常规移动位移：镜头直接随动该位移，防止高速移动时人物落后偏离中心甚至出屏 */
  stepX?: number;
  stepY?: number;
  /** 角色实际锚点与最大允许偏离半屏的安全半径（仅常规视角，避免瞬移/高速时角色出屏） */
  anchorX?: number;
  anchorY?: number;
  maxOffsetX?: number;
  maxOffsetY?: number;
}

/** 平滑跟随时，运动轴上的镜头位移不应超过角色本帧位移。
 * 否则战斗取景切换/镜头追赶会让持续向前走的人物在屏幕上瞬间倒退。
 * 仅限制主动移动时的前向分量；侧向取景、停步、瞬移和镜头特写仍保持原有行为。
 */
export function followCamera(
  cx: number, cy: number, tx: number, ty: number, dt: number,
  dx: number, dy: number, constrain: boolean,
  opts?: CameraFollowOpts,
): { x: number; y: number } {
  const stepX = opts?.stepX ?? 0;
  const stepY = opts?.stepY ?? 0;
  const bx = cx + stepX;
  const by = cy + stepY;
  const k = Math.min(1, Math.max(0, dt * 6));
  let sx = (tx - bx) * k, sy = (ty - by) * k;
  const distance = Math.hypot(dx, dy);
  if (constrain && distance > 1e-6) {
    const ux = dx / distance, uy = dy / distance;
    const budget = Math.max(0, distance - (stepX * ux + stepY * uy));
    const excess = sx * ux + sy * uy - budget;
    if (excess > 0) { sx -= excess * ux; sy -= excess * uy; }
  }
  let nx = bx + sx, ny = by + sy;
  if (opts?.anchorX !== undefined && opts.maxOffsetX !== undefined && opts.maxOffsetX > 0) {
    const dxA = nx - opts.anchorX;
    if (Math.abs(dxA) > opts.maxOffsetX) nx = opts.anchorX + Math.sign(dxA) * opts.maxOffsetX;
  }
  if (opts?.anchorY !== undefined && opts.maxOffsetY !== undefined && opts.maxOffsetY > 0) {
    const dyA = ny - opts.anchorY;
    if (Math.abs(dyA) > opts.maxOffsetY) ny = opts.anchorY + Math.sign(dyA) * opts.maxOffsetY;
  }
  return { x: nx, y: ny };
}
