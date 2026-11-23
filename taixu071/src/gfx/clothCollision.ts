// 投影椭圆 + 深度切片近似：只用于明确有同一深度可能性的头饰。
// 不是完整三维布料碰撞；长度和锚点优先，无法同时满足时允许残留交叠。
export interface ProjectedBodyEllipse { x: number; y: number; rx: number; ry: number; depth: number; depthRadius: number }
export interface CollisionStrand { x: Float32Array; y: Float32Array; ox: Float32Array; oy: Float32Array; n: number; len: number }
export function avoidProjectedHead(s: CollisionStrand, head: ProjectedBodyEllipse, depth: number, strength = 1): number {
  if (!(head.rx > 0 && head.ry > 0 && head.depthRadius > 0 && s.len > 0) || !Number.isFinite(depth) || !Number.isFinite(strength) || strength <= 0) return 0;
  strength = Math.min(1, strength);
  const d = (depth - head.depth) / head.depthRadius;
  if (Math.abs(d) >= 1) return 0; // 深度分离时允许投影重叠。
  const slice = Math.sqrt(1 - d * d), rx = head.rx * slice, ry = head.ry * slice;
  if (rx < 1e-5 || ry < 1e-5) return 0;
  let count = 0;
  // 跳过紧贴固定点的第一节，避免将绑在头上的发带直接扯离锚点。
  for (let i = 2; i < s.n; i++) {
    const x = s.x[i], y = s.y[i], dx = (x - head.x) / rx, dy = (y - head.y) / ry;
    const r = Math.hypot(dx, dy);
    let tx = x, ty = y;
    if (r < 1) {
      let nx = dx, ny = dy, inv = r;
      if (r < 1e-8) { nx = s.x[0] < head.x ? -1 : 1; ny = 0; inv = 1; }
      tx = x + (head.x + nx / inv * rx - x) * strength;
      ty = y + (head.y + ny / inv * ry - y) * strength;
      count++;
    } else if (!count) continue;
    // 不能为避碰而把布料拉长：无解时保留少量相交而不是产生爆炸。
    const sx = tx - s.x[i-1], sy = ty - s.y[i-1], dist = Math.hypot(sx, sy);
    if (dist > s.len) { tx = s.x[i-1] + sx * s.len / dist; ty = s.y[i-1] + sy * s.len / dist; }
    const mx = tx - x, my = ty - y;
    s.x[i] = tx; s.y[i] = ty; s.ox[i] += mx; s.oy[i] += my;
  }
  return count;
}
