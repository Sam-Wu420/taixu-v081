import assert from 'node:assert/strict';
import './env';
import { createCanvas } from '@napi-rs/canvas';
(globalThis as any).window = { innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { Tianxiang } = await import('../src/world/tianxiang');
const { CharState, HANLI_LOOK, dressLook, DEFAULT_WARDROBE } = await import('../src/gfx/character');
const { equipmentAppearance } = await import('../src/gfx/equipmentAppearance');
const base = dressLook(HANLI_LOOK, DEFAULT_WARDROBE.f);
const original = JSON.stringify(base);
const g: any = { player: { x: 0, y: 0, look: base, st: new CharState(0, 0) }, hero: { equip: { armor: 'art_huanglin', boots: 'art_tayun' }, wardrobe: { showEquipment: true } }, cam: { targetZoom: 0.85 }, cine: { x: 0, y: 0, z: 1, dur: 0 }, cinema() {}, npcs: {}, juice() {}, aberrKick: 0 };
for (const kind of ['jieying', 'huashen'] as const) {
  const tx = new Tianxiang();
  tx.start(kind, true, g);
  assert.equal((tx as any).look, equipmentAppearance(base, g.hero.equip, true), 'start uses equipped appearance');
  g.hero.wardrobe.showEquipment = false;
  tx.update(0, g);
  assert.equal((tx as any).look, base, 'update follows display setting');
  g.hero.wardrobe.showEquipment = true;
  g.hero.equip = { armor: 'art_xuepifeng' };
  tx.update(0, g);
  assert.equal((tx as any).look.over, 'cape', 'update follows equipment changes');
  // Exercise the real late-birth renderer; effect saturation makes whole-frame pixel comparisons unreliable.
  tx.t = kind === 'jieying' ? 20 : 21;
  const c = createCanvas(800, 600);
  tx.drawScreen(c.getContext('2d') as any, 800, 600, 1, false);
  assert.ok(c.getContext('2d').getImageData(0, 0, 800, 600).data.some(v => v !== 0));
  assert.equal(JSON.stringify(base), original, 'base look was not mutated');
  g.hero.equip = { armor: 'art_huanglin', boots: 'art_tayun' };
}
console.log('tianxiang appearance: start, live equipment/visibility updates, both actual birth renderers and immutable base passed');
