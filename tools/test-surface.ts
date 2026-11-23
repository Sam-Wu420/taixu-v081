import assert from 'node:assert/strict';
import { TerrainSurface, type SurfaceRoad } from '../src/world/surface';

const surface = new TerrainSurface({
  elevationAt: (x, y) => x > 18000 ? Math.min(1, (x - 18000) / 300) : 0.08 + 0.03 * Math.sin(x / 500) * Math.cos(y / 500),
  sites: [
    { id: 'qixuan', x: 6000, y: 6000, radius: 500, kind: 'sect' },
    { id: 'huangfeng', x: 6000, y: 14000, radius: 600, kind: 'sect' },
  ],
  roads: [
    { x1: 6000, y1: 6000, x2: 12000, y2: 6000, width: 180 },
    { x1: 6000, y1: 14000, x2: 12000, y2: 14000, width: 180 },
  ],
});
assert.equal(surface.heightAt(6000, 6000), 360);
assert.equal(surface.heightAt(6000, 14000), 420);
for (const y of [6000, 14000]) {
  assert(surface.canTraverse(6000, y, 12000, y), '门派与山路连续可通行');
  assert(Math.abs(surface.heightAt(9000, y) - surface.heightAt(9000, y + 80)) < 0.001, '路面横向平整');
}
assert(!surface.canTraverse(17900, 22000, 18400, 22000), '陡坡不可通行');
for (const x of [6500, 8100]) {
  assert(Math.abs(surface.heightAt(x - 1, 6000 + 1000) - surface.heightAt(x + 1, 6000 + 1000)) < 2, '平台边缘连续');
}
assert(surface.sample(6000, 6000).walkable);

const gradedRoad: SurfaceRoad[] = [];
for (let x = 6000; x < 10000; x += 100) gradedRoad.push({ x1: x, y1: 6000, x2: x + 100, y2: 6000, width: 80 });
const raised = new TerrainSurface({
  elevationAt: () => 0,
  sites: [{ id: 'qixuan', x: 6000, y: 6000, radius: 500, kind: 'sect' }],
  roads: gradedRoad,
});
for (let x = -500; x <= 500; x += 50) for (let y = -500; y <= 500; y += 50) {
  if (Math.hypot(x, y) <= 500) assert.equal(raised.heightAt(6000 + x, 6000 + y), 360, '平台不能被道路压低');
}
assert(raised.canTraverse(6000, 6000, 10000, 6000), '短道路段需平顺连接平台');
console.log('surface tests passed');
