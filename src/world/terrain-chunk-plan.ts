export interface TerrainView { left: number; top: number; right: number; bottom: number }
export interface TerrainChunkPlan { cx: number; cy: number; visible: boolean; distance: number }

export function planTerrainChunks(view: TerrainView, cameraX: number, cameraY: number, vx: number, vy: number,
  chunk: number, worldWidth: number, worldHeight: number, hasChunk?: (cx: number, cy: number) => boolean): TerrainChunkPlan[] {
  const speed = Math.hypot(vx, vy), lead = Math.min(chunk * 3, speed * 3);
  const lx = speed ? vx / speed * lead : 0, ly = speed ? vy / speed * lead : 0;
  const x0 = Math.floor((view.left + Math.min(0, lx)) / chunk) - 1, x1 = Math.floor((view.right + Math.max(0, lx)) / chunk) + 1;
  const y0 = Math.floor((view.top + Math.min(0, ly)) / chunk) - 1, y1 = Math.floor((view.bottom + Math.max(0, ly)) / chunk) + 1;
  const order: TerrainChunkPlan[] = [];
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    // hasChunk：地形自己说哪些分块有地面（图外的交界地带也算）；不给就只认地图矩形
    if (hasChunk ? !hasChunk(cx, cy) : cx < 0 || cy < 0 || cx * chunk > worldWidth || cy * chunk > worldHeight) continue;
    const visible = (cx + 1) * chunk > view.left && cx * chunk < view.right && (cy + 1) * chunk > view.top && cy * chunk < view.bottom;
    const x = (cx + 0.5) * chunk, y = (cy + 0.5) * chunk;
    order.push({ cx, cy, visible, distance: Math.hypot(x - cameraX - (visible ? 0 : lx), y - cameraY - (visible ? 0 : ly)) });
  }
  order.sort((a, b) => Number(b.visible) - Number(a.visible) || a.distance - b.distance);
  return order;
}
