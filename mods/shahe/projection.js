// @ts-check
/** @typedef {{x: number, y: number}} Point */
/** @typedef {{zoom: number, project(x: number, y: number, height?: number): Point}} Projection */
/** Screen distance in world-sized units, measured at the visible body rather than on the ground. */
/** @param {Projection} hd @param {Point} mouse @param {number} x @param {number} y @param {number} height */
export function projectedDistance(hd, mouse, x, y, height) {
  const p = hd.project(x, y, height);
  return Math.hypot(p.x - mouse.x, p.y - mouse.y) / hd.zoom;
}
