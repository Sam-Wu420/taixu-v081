import './env';
import assert from 'node:assert/strict';
import { createCanvas } from './env';
import { CharacterFrameCache } from '../src/gfx/character-cache';
import { CharState, HANLI_LOOK, Strand } from '../src/gfx/character';

const cache = new CharacterFrameCache();
const canvas = createCanvas(600, 600), ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
const look = { ...HANLI_LOOK, hero: false, hairStyle: 'long' as const };
const st = new CharState(0, 0); st.t = 1.01; st.seed = 17;
let now = 0;
ctx.setTransform(1, 0, 0, 1, 300, 450);
assert.equal(cache.draw(ctx, look, st, 1.06, 0, true, true, now), 'refreshed');
const initial = ctx.getImageData(0, 0, 600, 600).data;
assert(initial.some(v => v !== 0), '缓存首帧应绘制真实人物像素');
ctx.clearRect(-300, -450, 600, 600);
st.x = 20; st.y = 10;
assert.equal(cache.draw(ctx, look, st, 1.06, 0, true, true, now), 'reused');
const moved = ctx.getImageData(0, 0, 600, 600).data;
for (let y = 0; y < 590; y++) for (let x = 0; x < 580; x++) {
  const a = (y * 600 + x) * 4, b = ((y + 10) * 600 + x + 20) * 4;
  for (let c = 0; c < 4; c++) assert.equal(moved[b + c], initial[a + c], '复用位图应跟随人物位移');
}
ctx.clearRect(-300, -450, 600, 600);
st.lift = 20;
assert.equal(cache.draw(ctx, look, st, 1.06, 0, true, true, now), 'reused');
const raised = ctx.getImageData(0, 0, 600, 600).data;
for (let y = 20; y < 600; y++) for (let x = 0; x < 600; x++) {
  const a = (y * 600 + x) * 4, b = ((y - 20) * 600 + x) * 4;
  for (let c = 0; c < 4; c++) assert.equal(raised[b + c], moved[a + c], '复用位图应跟随离地高度');
}

st.setAction('cast'); st.update(1 / 60);
assert.equal(cache.draw(ctx, look, st, 1.06, 1 / 60, true, true, now += 17), 'deferred', '缓存刷新不得超过 10 Hz');
assert.equal(cache.draw(ctx, look, st, 1.06, 0, true, false, now += 100), 'deferred', '未轮到时动作变化应沿用旧图');
assert.equal(cache.draw(ctx, look, st, 1.06, 0, true, true, now), 'refreshed', '轮到后应呈现施法动作');
const previousPose = st.last, hands = [...st.hands[0], ...st.hands[1]];
st.update(1 / 60);
assert.equal(cache.draw(ctx, look, st, 1.06, 1 / 60, true, true, now += 17), 'reused');
assert.notEqual(st.last, previousPose, '复用位图时姿态仍应推进');
assert([...st.hands[0], ...st.hands[1]].some((v, i) => v !== hands[i]), '复用位图时手势仍应推进');
st.setAction('hit'); st.update(1 / 60);
assert.equal(cache.draw(ctx, look, st, 1.06, 1 / 60, true, true, now += 100), 'refreshed', '轮到后受击动作应刷新');
st.yaw = Math.PI / 2;
assert.equal(cache.draw(ctx, look, st, 1.06, 0, true, true, now += 100), 'refreshed', '朝向跨档应刷新');
look.robe = '#a43230';
assert.equal(cache.draw(ctx, look, st, 1.06, 0, true, true, now += 100), 'refreshed', '外观变化应刷新');
ctx.setTransform(0.5, 0, 0, 0.5, 300, 450);
assert.equal(cache.draw(ctx, look, st, 1.06, 0, true, true, now += 100), 'refreshed', '缩放跨档应刷新');

const physics = new CharacterFrameCache(), st2 = new CharState(0, 0);
st2.t = 1.01; st2.seed = 17;
ctx.setTransform(1, 0, 0, 1, 300, 450);
const step = Strand.prototype.step, seen: number[] = [];
Strand.prototype.step = function (...args) { seen.push(args[2]); return step.apply(this, args); };
try {
  assert.equal(physics.draw(ctx, look, st2, 1.06, 0, true, true, now), 'refreshed');
  seen.length = 0;
  for (let i = 0; i < 5; i++) {
    st2.update(1 / 60);
    const mode = physics.draw(ctx, look, st2, 1.06, 1 / 60, true, true, now += 17);
    assert(mode === 'reused' || mode === 'deferred');
  }
  st2.update(1 / 60);
  assert.equal(physics.draw(ctx, look, st2, 1.06, 1 / 60, true, true, now += 17), 'refreshed');
  assert(seen.some(dt => Math.abs(dt - 0.1) < 1e-9), '重绘时布料应推进累计 dt');
  seen.length = 0; st2.update(1 / 60);
  assert.equal(physics.draw(ctx, look, st2, 1.06, 1 / 60, true, true, now += 17), 'reused');
  st2.update(1 / 60);
  assert.equal(physics.draw(ctx, look, st2, 1.06, 1 / 60, false, true, now += 17), 'direct');
  assert(seen.some(dt => Math.abs(dt - 2 / 60) < 1e-9), '退出缓存时应补齐未绘制的布料时间');
} finally { Strand.prototype.step = step; }

const slow = new CharacterFrameCache(), st3 = new CharState(0, 0);
st3.t = 1.01;
let refreshed = 0, deferred = 0;
for (let i = 0; i < 12; i++) {
  st3.update(0.1);
  const mode = slow.draw(ctx, look, st3, 1.06, 0.1, true, i % 4 === 0, i * 500);
  if (mode === 'refreshed') refreshed++;
  if (mode === 'deferred') deferred++;
}
assert.equal(refreshed, 3); assert.equal(deferred, 9, '低帧率下仍须在轮转以外复用位图');

console.log('PASS 真实角色缓存位移、高度、动作、手势、外观、缩放与累计布料');
