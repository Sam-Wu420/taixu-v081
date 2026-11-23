import './env';
import assert from 'node:assert/strict';
import { CanvasTexture, Raycaster, Scene, Vector3 } from 'three';
import { createCanvas } from '@napi-rs/canvas';
import { mulberry32 } from '../src/core/rng';
import { HdGround } from '../src/hd2d/scene';
import { CHUNK, Terrain } from '../src/world/terrain';
import { LOC_BY_ID, WORLD_SCALE } from '../src/data/world';
import { SURFACE_MAX_HEIGHT } from '../src/world/surface';

const terrain = new Terrain(); terrain.build();
const site = LOC_BY_ID.get('qixuan'); assert(site);
const x0 = site.x * WORLD_SCALE, y0 = site.y * WORLD_SCALE;
const roads: number[] = [];
for (let i = 0; i < terrain.roadSegW.length; i += 8) if (Math.hypot(terrain.roadSegW[i] - x0, terrain.roadSegW[i + 1] - y0) < 18000) roads.push(i);
assert(roads.length);
const canvas = createCanvas(1, 1) as unknown as HTMLCanvasElement, texture = new CanvasTexture(canvas);
const ground = new HdGround(new Scene(), (x, y) => terrain.surfaceHeight(x, y), texture, 1, 1, 1);
const ray = new Raycaster(), direction = new Vector3(0, -1, 0);
function meshHeight(x: number, y: number): number {
  const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK), key = `${cx},${cy}`;
  let chunk = ground['chunks'].get(key);
  if (!chunk) {
    ground.begin(0, 0, 1); ground.sync([{ cx, cy, canvas }], CHUNK);
    chunk = ground['chunks'].get(key);
  }
  assert(chunk);
  // 射线从地面可能的最高处之上往下打（高山模式下山比 3000 高得多）
  chunk.mesh.updateMatrixWorld(); ray.set(new Vector3(x, SURFACE_MAX_HEIGHT + 1000, y), direction);
  const hit = ray.intersectObject(chunk.mesh, false)[0]; assert(hit);
  return hit.point.y;
}
const rnd = mulberry32(20261113);
const errors = { road: [] as number[], slope: [] as number[] };
for (let i = 0; i < 1500; i++) {
  const j = roads[Math.floor(rnd() * roads.length)], ax = terrain.roadSegW[j], ay = terrain.roadSegW[j + 1];
  const dx = terrain.roadSegW[j + 2] - ax, dy = terrain.roadSegW[j + 3] - ay, len = Math.hypot(dx, dy), t = rnd(), offset = (rnd() - 0.5) * 500;
  const x = ax + dx * t - dy / len * offset, y = ay + dy * t + dx / len * offset;
  errors.road.push(Math.abs(terrain.surfaceHeight(x, y) - meshHeight(x, y)));
}
while (errors.slope.length < 1500) {
  const x = x0 + (rnd() - 0.5) * 36000, y = y0 + (rnd() - 0.5) * 36000;
  const sample = terrain.surface.sample(x, y);
  if (!terrain.isLand(x, y) || sample.slope < 0.03) continue;
  errors.slope.push(Math.abs(sample.height - meshHeight(x, y)));
}
for (const [name, values] of Object.entries(errors)) {
  const max = Math.max(...values);
  assert(max < 1e-6, `${name} 高度与真实三角网格不一致：${max}`);
  console.log(`${name}: ${values.length} samples, max height error ${max}`);
}
ground.dispose(); texture.dispose();
console.log('surface mesh tests passed');
