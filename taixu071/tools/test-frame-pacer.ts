import assert from 'node:assert/strict';
import { FramePacer, parseFrameLimit, adaptiveFrameSeconds } from '../src/core/framePacer';

assert.equal(parseFrameLimit('0'), 0);
assert.equal(parseFrameLimit('144'), 144);
assert.equal(parseFrameLimit('garbage'), 60);
assert.equal(parseFrameLimit(''), 60);
assert.equal(parseFrameLimit('500'), 60);
assert.equal(adaptiveFrameSeconds(1 / 30, 30), 1 / 60);
for (const refresh of [60, 120, 144]) {
  for (const cap of [30, 60, 90, 120, 144, 0] as const) {
    const pacer = new FramePacer(); let count = 0;
    for (let i = 0; i < refresh * 10; i++) if (pacer.shouldRun(1000 + i * 1000 / refresh, cap)) count++;
    const target = Math.min(refresh, cap || refresh) * 10;
    assert.ok(Math.abs(count - target) <= 2, `${refresh}Hz / ${cap}: ${count} vs ${target}`);
  }
}
const pacer = new FramePacer();
assert.equal(pacer.shouldRun(1000, 30), true);
assert.equal(pacer.shouldRun(1005, 30), false);
assert.equal(pacer.shouldRun(1010, 0), true);
assert.equal(pacer.shouldRun(100000, 30), true);
console.log('frame pacer: parsing, refresh rates, changes and long pauses passed');
