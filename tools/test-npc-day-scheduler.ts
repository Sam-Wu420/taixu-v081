import assert from 'node:assert/strict';
import { NpcDayScheduler } from '../src/world/npc-day';

function fixture() {
  const events: { day: number; days: number; value: number }[] = [];
  const scheduler = new NpcDayScheduler(
    function* (days, day, random) {
      for (let i = 0; i < 5; i++) { events.push({ day, days, value: random() }); yield; }
    },
    work => work.next(),
  );
  scheduler.enqueue(1, 61, 42);
  scheduler.enqueue(3, 64, 99);
  return { scheduler, events };
}

const synchronous = fixture(), sliced = fixture();
synchronous.scheduler.flush();
while (sliced.scheduler.pending) { Math.random(); Math.random(); sliced.scheduler.pump(0); }
assert.deepEqual(sliced.events, synchronous.events, '分帧不能改变任务日期、随机序列或顺序');
assert.deepEqual(sliced.events.map(event => event.day), [61, 61, 61, 61, 61, 64, 64, 64, 64, 64]);
const cleared = fixture();
cleared.scheduler.pump(0);
cleared.scheduler.clear();
assert(!cleared.scheduler.pending, '重置后不得执行旧任务');
console.log('npc day scheduler tests passed');
