import assert from 'node:assert/strict';
import './env';
import { createCanvas } from '@napi-rs/canvas';
(globalThis as any).window = { innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { CharState, HANLI_LOOK, drawCharacter, dressLook, DEFAULT_WARDROBE } = await import('../src/gfx/character');
const ctx = createCanvas(480, 360).getContext('2d') as any;
const look = dressLook(HANLI_LOOK, { ...DEFAULT_WARDROBE.f, outfit: 'guangxiu', hairStyle: 'ponytail', ribbon: '#c03040', pin: 'jade', clothingStyle: { over: 'cape', sleeve: 'wide', skirt: 'pleat' } });
let maxRatio = 0, frames = 0;
for (const action of ['run', 'fly'] as const) for (const scale of [0.25, 1.2]) for (const dt of [1 / 30, 1 / 60, 1 / 144]) for (const speed of [500, 2000, 12000]) {
  const st = new CharState(100, 180); st.seed = 42; st.t = 0; st.action = action; st.yaw = st.targetYaw = Math.PI / 2;
  let active = 0;
  for (let frame = 0; frame < 80; frame++) {
    const sign = frame < 40 ? 1 : -1;
    st.vx = sign * speed; st.vy = 0; st.speed = speed; st.x += st.vx * dt;
    st.update(dt); drawCharacter(ctx, look, st, scale, dt);
    for (const [name, s] of st.strands as any) {
      for (let i = 1; i < s.n; i++) {
        const ratio = Math.hypot(s.x[i] - s.x[i-1], s.y[i] - s.y[i-1]) / s.len;
        assert.ok(Number.isFinite(ratio), `${action}/${scale}/${dt}/${speed}/${name} finite`);
        maxRatio = Math.max(maxRatio, ratio); active++;
        assert.ok(ratio <= 1.025, `${action}/${scale}/${dt}/${speed}/${name} frame ${frame} segment ${i} stretched ${ratio}`);
      }
    }
    frames++;
  }
  assert.ok(active > 100, 'cloth actually simulated');
}
// Controlled movement must still produce relative wind displacement, not a frozen rigid attachment.
function windOffset(speed: number) {
  const st = new CharState(100, 180); st.seed = 42; st.t = 0; st.action = 'fly'; st.yaw = st.targetYaw = Math.PI / 2;
  for (let i = 0; i < 120; i++) { st.vx = speed; st.speed = speed; st.x += speed / 60; st.update(1 / 60); drawCharacter(ctx, look, st, 1.2, 1 / 60); }
  const s: any = st.strands.get('rib1');
  return (s.x[s.n - 1] - s.x[0]) / s.len;
}
const still = windOffset(0), fast = windOffset(2000);
assert.ok(Math.abs(fast - still) > 0.25, `wind remains visible: ${still} / ${fast}`);
// Irregular frames, diagonal motion, flight turns and zoom changes stay bounded too.
{
  const st = new CharState(20000, 30000); st.seed = 17; st.t = 0; st.action = 'fly';
  for (let i = 0; i < 240; i++) {
    const dt = [1/144, 1/30, 1/60, 1/24, 1/120][i % 5], angle = i * 0.04;
    st.vx = 4000 * Math.cos(angle); st.vy = 4000 * Math.sin(angle); st.speed = 4000;
    st.x += st.vx * dt; st.y += st.vy * dt; st.targetYaw = angle; st.update(dt);
    drawCharacter(ctx, look, st, 0.5 + 0.003 * i, dt);
    for (const [name, s] of st.strands as any) for (let j = 1; j < s.n; j++) {
      const ratio = Math.hypot(s.x[j] - s.x[j-1], s.y[j] - s.y[j-1]) / s.len;
      assert.ok(Number.isFinite(ratio) && ratio <= 1.03, `irregular frame ${i} ${name}: ${ratio}`);
    }
  }
}
// The zero-time and sudden unannounced teleport paths must not leave old trajectories behind.
{
  const st = new CharState(0, 100); st.t = 0; st.action = 'fly';
  for (let i = 0; i < 20; i++) { st.update(1/60); drawCharacter(ctx, look, st, 1, 1/60); }
  st.x += 50000; st.vx = 0; st.update(1/60); drawCharacter(ctx, look, st, 1, 1/60);
  for (const [, s] of st.strands as any) for (let i=1; i<s.n; i++) assert.ok(Math.hypot(s.x[i]-s.x[0], s.y[i]-s.y[0]) <= s.len * (s.n-1) * 1.03);
  st.x += 100; drawCharacter(ctx, look, st, 1, 0);
  for (const [, s] of st.strands as any) for (let i=1; i<s.n; i++) assert.ok(Math.hypot(s.x[i]-s.x[0], s.y[i]-s.y[0]) <= s.len * (s.n-1) * 1.03);
}
console.log(`high-speed cloth: ${frames} frames, reversal, 30/60/144fps, scales, run/fly; max segment ${maxRatio.toFixed(3)}×`);
