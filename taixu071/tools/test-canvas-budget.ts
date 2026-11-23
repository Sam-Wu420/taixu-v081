// canvas 预算的逐出与记账：这是防止长时间游玩把几十 MB 画布一直留在内存里的唯一保险。
import './env';
import assert from 'node:assert/strict';
import { capCanvasCache, setCanvasBudget, canvasBudgetUsed, CANVAS_BUDGET_BYTES } from '../src/gfx/canvasBudget';
import { createCanvas } from './env';

const MB = 1024 * 1024;
const one = 512 * 512 * 4;   // 一张 512×512 画布的字节数 = 1 MiB

// 1. 默认预算存在且合理
assert.ok(CANVAS_BUDGET_BYTES >= 64 * MB, '默认预算应至少 64MB');
console.log(`默认预算 ${(CANVAS_BUDGET_BYTES / MB).toFixed(0)} MB`);

const save = setCanvasBudget(Number.MAX_SAFE_INTEGER);   // 先放开，避免用例之间互相逐出

// 2. 低于预算时不逐出，且记账准确
const start = canvasBudgetUsed();
const a = new Map<string, any>();
setCanvasBudget(start + 8 * MB);
for (let i = 0; i < 2; i++) { a.set('k' + i, [createCanvas(512, 512)]); capCanvasCache(a, 'k' + i); }
assert.equal(a.size, 2, '低于预算不应逐出');
assert.equal(canvasBudgetUsed() - start, 2 * one, '记账应等于两张 512² 画布');

// 3. 超预算时按插入顺序逐出最旧的，保留最新一条
const base = canvasBudgetUsed();
setCanvasBudget(base + 3 * MB);
const b = new Map<string, any>();
for (let i = 0; i < 6; i++) { b.set('k' + i, [createCanvas(512, 512)]); capCanvasCache(b, 'k' + i); }
assert.ok(canvasBudgetUsed() <= base + 3 * MB, `记账应回到预算内，实际 ${((canvasBudgetUsed() - base) / MB).toFixed(1)}MB`);
assert.ok(b.has('k5'), '最新写入的应保留');
assert.ok(!b.has('k0'), '最旧的应被逐出');
assert.equal(b.size, 3, '3MB 预算应只剩 3 条');

// 4. 单条就超预算时也要至少留一条（否则调用方拿到的就是已被逐出的对象）
const base2 = canvasBudgetUsed();
setCanvasBudget(base2 + 1 * MB);
const c = new Map<string, any>();
c.set('big', [createCanvas(2048, 2048)]); capCanvasCache(c, 'big');
assert.equal(c.size, 1, '单条超预算也必须保留，否则本帧要画的东西立刻失效');

// 5. 重复写入同一 key 不重复记账
const d = new Map<string, any>();
setCanvasBudget(Number.MAX_SAFE_INTEGER);
const beforeD = canvasBudgetUsed();
const cv = createCanvas(512, 512);
d.set('x', [cv]); capCanvasCache(d, 'x');
const afterOnce = canvasBudgetUsed();
d.set('x', [cv]); capCanvasCache(d, 'x');
assert.equal(canvasBudgetUsed(), afterOnce, '同一 key 重写不应重复累计');
assert.equal(afterOnce - beforeD, one, '单张画布应记 1MiB');

// 6. 数组里的多级 mip 一起计入
const e = new Map<string, any>();
const beforeM = canvasBudgetUsed();
const mips = [createCanvas(512, 512), createCanvas(256, 256), createCanvas(128, 128)];
e.set('m', mips); capCanvasCache(e, 'm');
assert.equal(canvasBudgetUsed() - beforeM, one + 256 * 256 * 4 + 128 * 128 * 4, 'mip 链应按总和记账');

setCanvasBudget(save);
console.log('canvas 预算：默认值、逐出顺序、单条保留、重复写入、mip 记账 全部通过');
