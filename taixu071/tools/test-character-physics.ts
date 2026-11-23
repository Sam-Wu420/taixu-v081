// 人物布料数值稳定性与多方向/动作渲染冒烟。不能自动证明没有视觉穿模。
import assert from 'node:assert/strict';
import { createCanvas } from './env';
(globalThis as any).window = { innerWidth: 360, innerHeight: 360, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { CharState, HANLI_LOOK, drawCharacter, dressLook, DEFAULT_WARDROBE } = await import('../src/gfx/character');
const cv = createCanvas(360, 360), ctx = cv.getContext('2d') as any;
const combos = [
  dressLook(HANLI_LOOK, { ...DEFAULT_WARDROBE.m, outfit: 'yueying', hairStyle: 'ponytail', ribbon: '#c03040', pin: 'gold', back: 'sword' }),
  dressLook(HANLI_LOOK, { ...DEFAULT_WARDROBE.f, outfit: 'guangxiu', hairStyle: 'long', ribbon: '#c03040', pin: 'jade', earring: '#d6b968' }),
  dressLook(HANLI_LOOK, { ...DEFAULT_WARDROBE.f, outfit: 'xingyun', clothingStyle: { over: 'cape', sleeve: 'wide', skirt: 'pleat' }, hand: 'fan', waist: 'jade' }),
];
const actions = ['idle', 'walk', 'run', 'cast', 'sit', 'fly', 'hit', 'dodge'] as const;
let draws = 0, strands = 0, maxRatio = 0;
for (const look of combos) for (const action of actions) for (let angle = 0; angle < 8; angle++) {
  const st = new CharState(180, 270); st.seed = 42; st.t = 1; st.yaw = st.targetYaw = angle * Math.PI / 4;
  st.setAction(action); st.speed = action === 'run' || action === 'fly' ? 240 : action === 'walk' ? 100 : 0;
  st.vx = Math.sin(st.yaw) * st.speed; st.vy = Math.cos(st.yaw) * st.speed; st.lift = action === 'fly' ? 12 : 0;
  for (let frame = 0; frame < 8; frame++) {
    const dt = [1 / 60, 1 / 30, 1 / 144, 1 / 60][frame % 4];
    st.x += st.vx * dt * 0.1; st.y += st.vy * dt * 0.1; st.update(dt);
    ctx.clearRect(0, 0, 360, 360);
    const points = drawCharacter(ctx, look, st, 1.6, dt);
    for (const v of Object.values(points)) assert.ok(Number.isFinite(v), `${action} ${angle} anchor`);
    for (const [name, s] of st.strands as any) {
      strands++;
      for (let i = 0; i < s.n; i++) {
        assert.ok(Number.isFinite(s.x[i]) && Number.isFinite(s.y[i]) && Number.isFinite(s.ox[i]) && Number.isFinite(s.oy[i]), `${action}/${angle}/${name} invalid`);
        const r = Math.hypot(s.x[i] - s.x[0], s.y[i] - s.y[0]) / Math.max(s.len, 1e-6);
        maxRatio = Math.max(maxRatio, r); assert.ok(r < 40, `${action}/${angle}/${name} stretch ${r}`);
      }
    }
    draws++;
  }
  const pixels = ctx.getImageData(0, 0, 360, 360).data;
  let visible = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 5) visible++;
  assert.ok(visible > 30, `${action}/${angle}: no visible character`);
}
// 切换服装后重新显示披风：旧的静止轨迹不应留在远处。
{
  const st = new CharState(180, 270); st.t = 1;
  const cape = combos[0], noCape = dressLook(HANLI_LOOK, DEFAULT_WARDROBE.m);
  for (let i = 0; i < 20; i++) { st.update(1 / 60); drawCharacter(ctx, cape, st, 1.6, 1 / 60); }
  for (let i = 0; i < 50; i++) { st.x += 1; st.update(1 / 60); drawCharacter(ctx, noCape, st, 1.6, 1 / 60); }
  drawCharacter(ctx, cape, st, 1.6, 1 / 60);
  const s: any = st.strands.get('capeL');
  assert.ok(s && Math.hypot(s.x[s.n - 1] - s.x[0], s.y[s.n - 1] - s.y[0]) / s.len < 8);
}
console.log(`character physics: ${draws} renders, ${strands} strand samples, max stretch ${maxRatio.toFixed(2)} lengths; 3 looks × 8 actions × 8 directions passed`);
