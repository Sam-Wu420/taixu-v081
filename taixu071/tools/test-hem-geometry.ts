import assert from 'node:assert/strict';
import { hemGeometry } from '../src/gfx/hemGeometry';
// The old formula gave zero sway whenever legNeed >= restRadius.
for (const r of [3, 7, 12]) for (const legs of [0.8, 1, 1.2, 1.35, 2]) {
  const still = hemGeometry(r, r * legs, 0, 0);
  let prev = 0;
  for (let i = 0; i <= 200; i++) {
    const h = hemGeometry(r, r * legs, i * r / 20, r * .1);
    assert.ok(h.motion > 0, 'nonzero available sway even with spread legs');
    assert.ok(h.radius + 1e-9 >= h.leg + h.motion, 'estimated leg clearance reserved before offset');
    assert.ok(h.extent <= 1.65 * r + 1e-9, 'geometry remains bounded at extreme speed');
    assert.ok(h.motion >= prev - 1e-9, 'soft limit is monotonic');
    if (i > 0) assert.ok(h.motion - prev < .06 * r, 'no hard transition');
    prev = h.motion;
  }
  assert.equal(still.motion, 0);
}
console.log('hem geometry: nonzero sway, leg-envelope reserve, smooth saturation and bounded relative radius passed');
