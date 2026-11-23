import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import './env';
(globalThis as any).window = { innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { HANLI_LOOK, CharState, drawCharacter, dressLook, DEFAULT_WARDROBE } = await import('../src/gfx/character');
const { equipmentAppearance } = await import('../src/gfx/equipmentAppearance');
const { ITEMS } = await import('../src/data/items');
const base = dressLook(HANLI_LOOK, DEFAULT_WARDROBE.f), snapshot = JSON.stringify(base);
const gear = { armor: 'art_huanglin', boots: 'art_tayun' };
assert.equal(equipmentAppearance(base, gear, false), base);
const wardrobe = JSON.parse(JSON.stringify({ ...DEFAULT_WARDROBE.f, showEquipment: true }));
assert.equal(wardrobe.showEquipment, true);
assert.equal(equipmentAppearance(dressLook(HANLI_LOOK, wardrobe), gear, wardrobe.showEquipment).over, 'armor');
const look = equipmentAppearance(base, gear, true);
assert.equal(look.over, 'armor'); assert.equal(look.overColor, '#c0a040'); assert.equal(look.boots, '#5a5048');
assert.equal(equipmentAppearance(base, gear, true), look, 'reuse look for renderer cache');
assert.equal(JSON.stringify(base), snapshot, 'must not mutate wardrobe look');
const cape = equipmentAppearance(base, { armor: 'art_xuepifeng' }, true); assert.equal(cape.over, 'cape'); assert.equal(cape.overColor, '#a82030');
assert.equal(equipmentAppearance(base, { armor: 'art_ruanwei' }, true), base, 'inner armor remains hidden');
assert.equal(equipmentAppearance(base, { armor: 'art_tayun', boots: 'art_huanglin' }, true), base, 'incorrect equipment slots are ignored');
assert.equal(equipmentAppearance(base, { armor: '__proto__', boots: 'missing' }, true), base);
const art: any = ITEMS.art_huanglin.art; const original = art.wear;
try {
  art.wear = { color: '#123456' }; assert.equal(equipmentAppearance(base, gear, true).overColor, '#123456');
  art.wear = { color: 'red;invalid' }; assert.equal(equipmentAppearance(base, gear, true).overColor, '#c0a040');
  art.wear = { visible: false }; assert.equal(equipmentAppearance(base, { armor: 'art_huanglin' }, true), base);
} finally { art.wear = original; }
const canvas = createCanvas(360, 360), ctx = canvas.getContext('2d') as any;
for (const outfit of [look, cape]) for (const action of ['idle', 'run', 'cast', 'sit', 'fly'] as const) for (let i = 0; i < 8; i++) {
  const st = new CharState(180, 270); st.t = 1; st.yaw = st.targetYaw = i * Math.PI / 4; st.setAction(action); st.lift = action === 'fly' ? 15 : 0;
  ctx.clearRect(0, 0, 360, 360); drawCharacter(ctx, outfit, st, 1.6, 1 / 60);
  const pixels = ctx.getImageData(0, 0, 360, 360).data; let n = 0; for (let j = 3; j < pixels.length; j += 4) if (pixels[j] > 5) n++;
  assert.ok(n > 100, `${action}/${i} empty`);
}
console.log('equipment appearance: opt-in, armor/cape/boots, hidden underarmor, validation, cache and 80 directional renders passed');
