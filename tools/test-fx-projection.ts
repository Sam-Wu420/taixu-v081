import assert from 'node:assert/strict';
import { OrthographicCamera, Vector3 } from 'three';
import { Batch, FLOATS, type HdProjection } from '../src/gl/batch';
import { FxSys } from '../src/gl/fx';
import { C } from '../src/gl/atlas';

const W = 1280, H = 800, pitch = Math.PI / 4;
const near = (actual: number, expected: number, epsilon = 1e-3) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);
let cases = 0;
for (const yaw of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 3]) for (const zoom of [0.5, 1, 2]) for (const base of [0, 180, 360]) {
  const heightAt = (x: number, y: number) => base + x * 0.04 - y * 0.025;
  const camera = new OrthographicCamera(-W / 2 / zoom, W / 2 / zoom, H / 2 / zoom, -H / 2 / zoom, 1, 40000);
  const target = new Vector3(50, heightAt(50, 70), 70), up = { x: Math.sin(yaw), y: -Math.cos(yaw) };
  camera.position.set(target.x - up.x * Math.cos(pitch) * 20000, target.y + Math.sin(pitch) * 20000, target.z - up.y * Math.cos(pitch) * 20000);
  camera.up.set(0, 1, 0); camera.lookAt(target); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  const screen = (x: number, y: number, h: number) => { const q = new Vector3(x, h, y).project(camera); return { x: (q.x + 1) * W / 2, y: (1 - q.y) * H / 2, depth: q.z }; };
  const p0 = screen(0, 0, 0), px = screen(1000, 0, 0), py = screen(0, 1000, 0), ph = screen(0, 0, 1);
  const hd: HdProjection = {
    affine: [(px.x - p0.x) / 1000, (py.x - p0.x) / 1000, p0.x, (px.y - p0.y) / 1000, (py.y - p0.y) / 1000, p0.y],
    heightAt, heightScale: p0.y - ph.y, heightBoost: 1 / Math.cos(pitch),
    depthAt: (x, y, h) => screen(x, y, h).depth,
    groundBounds: () => ({ l: -10000, t: -10000, r: 10000, b: 10000 }),
  };
  const B = new Batch(); B.reset(50, 70, zoom, W, H, null); B.hd = hd;
  const gx = 120, gy = 180, right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  B.pt(gx, gy); const ground = screen(gx, gy, heightAt(gx, gy));
  near(B.ox, ground.x); near(B.oy, ground.y); near(B.od, ground.depth);
  for (const lift of [0, 60, 180]) {
    B.billboard = { x: gx, y: gy, offsetY: -lift };
    const dx = 25, dy = -75;
    B.pt(gx + dx, gy + dy);
    const expected = screen(gx + right.x * dx, gy + right.z * dx, heightAt(gx, gy) + (lift - dy) * hd.heightBoost);
    near(B.ox, expected.x); near(B.oy, expected.y); near(B.od, expected.depth);
    cases++;
  }
  B.billboard = null;
  const projectedDirection = B.direction(3, -7);
  const a = screen(0, 0, 0), b = screen(3, -7, 0);
  near(projectedDirection, Math.atan2(b.y - a.y, b.x - a.x), 1e-8);

  B.reset(50, 70, zoom, W, H, null); B.hd = hd;
  B.groundQuad(C.Ring, gx, gy, 150, 0, 1, 1, 1, 1, 1, 0.5);
  assert(B.n > 54, '地面贴花应沿 64 单位地形网格切分');
  const corner0 = screen(gx - 150, gy - 150, heightAt(gx - 150, gy - 150) + 0.7);
  const corner1 = screen(gx + 150, gy + 150, heightAt(gx + 150, gy + 150) + 0.7);
  for (const corner of [corner0, corner1]) {
    const indices = Array.from({ length: B.n }, (_, i) => i * FLOATS);
    const found = indices.find(i => Math.hypot(B.data[i] - corner.x, B.data[i + 1] - corner.y) < 1e-3);
    assert.notEqual(found, undefined, '裁切后必须保留贴图角点');
    near(B.data[found! + 8], corner.depth, 1e-6);
  }

  B.reset(50, 70, zoom, W, H, null); B.hd = hd;
  const points = [gx, gy, gx + 30, gy + 20];
  B.strip(C.Beam, points, 2, () => 4, () => 1, 1, 1, 1, 1, [-30, -90]);
  const d0 = screen(gx, gy, heightAt(gx, gy) + 30 * hd.heightBoost).depth;
  const d1 = screen(gx + 30, gy + 20, heightAt(gx + 30, gy + 20) + 90 * hd.heightBoost).depth;
  near(B.data[8], d0, 1e-6); near(B.data[2 * FLOATS + 8], d1, 1e-6);

  B.reset(50, 70, zoom, W, H, null); B.hd = hd;
  const F = new FxSys(B);
  F.emit({ x: gx, y: gy, z: -45, vx: 0, vy: -10, life: 1, s0: 10, c: [1, 1, 1] });
  F.update(0.1); F.drawParticles();
  const expectedParticle = screen(gx, gy, heightAt(gx, gy) + 46 * hd.heightBoost);
  near((B.data[0] + B.data[2 * FLOATS]) / 2, expectedParticle.x);
  near((B.data[1] + B.data[2 * FLOATS + 1]) / 2, expectedParticle.y);
  near(B.data[8], expectedParticle.depth, 1e-6);
}
console.log(`PASS Three 正交矩阵与真实 Batch：${cases} 组 yaw/zoom/地形/升空；地贴分格、深度、条带、粒子 z 和立板速度`);
