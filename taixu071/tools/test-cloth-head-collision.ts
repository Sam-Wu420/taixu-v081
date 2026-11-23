import assert from 'node:assert/strict';
import './env';
import { createCanvas } from '@napi-rs/canvas';
import { avoidProjectedHead, type CollisionStrand } from '../src/gfx/clothCollision';
(globalThis as any).window = { innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const strand = (): CollisionStrand => ({ n: 4, len: 4, x: Float32Array.from([0, 3, 5, 7]), y: Float32Array.from([0, 0, 0, 0]), ox: Float32Array.from([0, 3, 5, 7]), oy: Float32Array.from([0, 0, 0, 0]) });
const head = { x: 5, y: 0, rx: 2, ry: 3, depth: 0, depthRadius: 2 };
{
  const s = strand(), before = Array.from(s.x);
  assert.equal(avoidProjectedHead(s, head, 3), 0, 'depth-separated objects can overlap on screen');
  assert.deepEqual(Array.from(s.x), before);
  assert.ok(avoidProjectedHead(s, head, 0) > 0, 'same-depth penetration is handled');
  assert.equal(s.x[0], 0); assert.equal(s.x[1], 3);
  assert.ok(Math.abs(s.x[2] - head.x) >= head.rx - 1e-6, 'reachable point leaves proxy');
  for (let i = 1; i < s.n; i++) assert.ok(Math.hypot(s.x[i]-s.x[i-1], s.y[i]-s.y[i-1]) <= s.len + 1e-5);
  assert.equal(s.x[2] - s.ox[2], 0, 'depenetration does not add false velocity');
}
{
  const none = strand(), half = strand(), full = strand();
  assert.equal(avoidProjectedHead(none, head, 0, 0), 0);
  avoidProjectedHead(half, head, 0, .5); avoidProjectedHead(full, head, 0, 1);
  assert.ok(Math.abs(half.x[2] - none.x[2]) > 0 && Math.abs(half.x[2] - none.x[2]) < Math.abs(full.x[2] - none.x[2]), 'LOD contact fades smoothly');
}
const { CharState, HANLI_LOOK, drawCharacter } = await import('../src/gfx/character');
const ctx = createCanvas(480, 360).getContext('2d') as any;
const look = { ...HANLI_LOOK, hero: true, hairStyle: 'bun' as const, ribbon: '#c03040', headTex: undefined };
function make() {
  const st = new CharState(200, 280); st.t = 1; st.seed = 8; st.yaw = st.targetYaw = 0;
  const pos = drawCharacter(ctx, look, st, 1.5, 1/60);
  const s: any = st.strands.get('rib1'); assert.ok(s);
  // Force a reachable collision at the head in otherwise identical character states.
  for (let i = 1; i < s.n; i++) { s.x[i] = s.ox[i] = pos.headX; s.y[i] = s.oy[i] = pos.headY; }
  return st;
}
const near = make(), far = make();
drawCharacter(ctx, look, near, 1.5, 0, { detail: 1 });
drawCharacter(ctx, look, far, 1.5, 0, { detail: 10 });
const a: any = near.strands.get('rib1'), b: any = far.strands.get('rib1');
assert.ok(Math.hypot(a.x[2]-b.x[2], a.y[2]-b.y[2]) > .05, 'real near-player draw applies contact, far LOD skips it');
const snapshot = Array.from(a.x).concat(Array.from(a.y), Array.from(a.ox), Array.from(a.oy));
drawCharacter(ctx, look, near, 1.5, 0, { ghost: true });
assert.deepEqual(Array.from(a.x).concat(Array.from(a.y), Array.from(a.ox), Array.from(a.oy)), snapshot, 'ghost contact does not modify live strand');
console.log('head collision: depth-separated overlap, same-slice contact, constrained lengths, no fake velocity, actual near/far renderer and ghost isolation passed');
