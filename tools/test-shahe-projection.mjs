import assert from 'node:assert/strict';
import { OrthographicCamera, Vector3 } from 'three';
import { projectedDistance } from '../mods/shahe/projection.js';
for (const yaw of [0, Math.PI / 3, Math.PI]) for (const zoom of [0.5, 1, 2]) {
  const cam = new OrthographicCamera(-400 / zoom, 400 / zoom, 300 / zoom, -300 / zoom, 1, 40000);
  cam.position.set(Math.sin(yaw) * 1000, 1000, Math.cos(yaw) * 1000); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const hd = { zoom, project(x, y, h = 0) { const p = new Vector3(x, h * Math.SQRT2, y).project(cam); return { x: (p.x + 1) * 400, y: (1 - p.y) * 300 }; } };
  for (const lift of [0, 120]) {
    const body = hd.project(30, 40, 34 + lift);
    assert.ok(projectedDistance(hd, body, 30, 40, 34 + lift) < 1e-9);
    assert.ok(Math.abs(projectedDistance(hd, { x: body.x + 30 * zoom, y: body.y }, 30, 40, 34 + lift) - 30) < 1e-9);
  }
}
console.log('HD2D selection projection: 3 rotations × 3 zoom levels × 2 heights passed');

