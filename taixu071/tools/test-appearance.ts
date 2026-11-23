import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
import { defaultFace, resolveLook } from '../src/gfx/renwu/params';
import { drawFace } from '../src/gfx/renwu/face';
import { DEFAULT_WARDROBE, OUTFIT_BY_ID, dressLook } from '../src/gfx/renwu/outfits';
import type { FaceParams, Look } from '../src/gfx/renwu/types';

const base: Look = { sex: 'm', height: 1, build: 1, skin: '#f1d9bd', hair: '#1d1a17', hairStyle: 'bun', robe: '#3f6a4c', inner: '#ece6d6', trim: '#2b4636', belt: '#1f2420', pants: '#8a7a62', boots: '#2a2622', robeLen: 'long', sleeve: 'wide' };
const render = (f: FaceParams) => {
  const cv = createCanvas(256, 256), g = cv.getContext('2d');
  drawFace({ g: g as unknown as CanvasRenderingContext2D, HP: (x, y, z) => ({x: 128 + x * 9, y: 110 - y * 9, z}), vis: () => 1, d: 9, px: 5, f, fem: true, closed: false, sY: 0.5, hair: '#1d1a17', lash: true, mouthOpen: 0, gaze: 0 });
  return createHash('sha256').update(cv.toBuffer('image/png')).digest('hex');
};
const face = defaultFace('f');
for (const [field, value] of [['eyeHeight', .4], ['eyeWidth', 1.2], ['noseHeight', .4], ['mouthHeight', .3]] as const) {
  assert.notEqual(render(face), render({ ...face, [field]: value }), `${field} should change pixels`);
}
const old = resolveLook({ ...base, face: { eye: 'round' } });
assert.equal(old.face.eyeWidth, 1);
assert.equal(old.face.eyeHeight, 0);
for (const id of ['xingyun', 'yueying']) {
  assert.ok(OUTFIT_BY_ID[id]);
  assert.equal(dressLook(base, { ...DEFAULT_WARDROBE.m, outfit: id }).outfit, id);
  assert.equal(dressLook(base, { ...DEFAULT_WARDROBE.f, outfit: id }).outfit, id);
}
const w = { ...DEFAULT_WARDROBE.m, outfit: 'xingyun', clothingColors: { robe: '#112233', trim: '#abcdef' } };
const look = dressLook(base, w);
assert.equal(look.robe, '#112233'); assert.equal(look.trim, '#abcdef');
const styled = { ...w, clothingStyle: { collar: 'high', sleeve: 'narrow', over: 'cape', pattern: 'bamboo', skirt: 'split', robeLen: 'mid' } } as const;
const styledLook = dressLook(base, JSON.parse(JSON.stringify(styled)));
assert.equal(styledLook.collar, 'high'); assert.equal(styledLook.sleeve, 'narrow'); assert.equal(styledLook.over, 'cape'); assert.equal(styledLook.pattern, 'bamboo');
const invalidStyle = dressLook(base, { ...w, clothingStyle: { over: 'invalid' as any } });
assert.notEqual(invalidStyle.over, 'invalid');
const roundtrip = dressLook(base, JSON.parse(JSON.stringify(w)));
assert.equal(roundtrip.robe, '#112233');
assert.notEqual(dressLook(base, { ...w, clothingColors: { robe: 'invalid' } }).robe, 'invalid');
console.log('appearance: face pixels, defaults, outfits, colors and persistence passed');
