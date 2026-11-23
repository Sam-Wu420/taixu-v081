import './env';
import assert from 'node:assert/strict';

const { HdScene } = await import('../src/hd2d/scene');
const { Renderer } = await import('../src/world/render');
const { charBox } = await import('../src/hd2d/boxes');
const { mulberry32 } = await import('../src/core/rng');

function makeScene(yaw: number) {
  const co = Math.cos(yaw), si = Math.sin(yaw), fs = Math.SQRT1_2;
  return Object.assign(Object.create(HdScene.prototype) as HdScene, {
    decalW: 2048, decalH: 2048, atlasH: 2048, work: { height: 4096 },
    items: [], px: 0, py: 2048, rowH: 0, pitch: 45, yaw, decal: { l: 0, t: 0, s: 1 },
    ground: (x: number, y: number) => ({ x: 960 + co * x + si * y, y: 540 + (-si * x + co * y) * fs }),
    // 立板逐个投影现在走 groundAt（结果留在 sx / sy / ss 上，不造对象）：夹具照同一套平面投影填
    groundAt(this: { sx: number; sy: number; ss: number }, x: number, y: number) { this.sx = 960 + co * x + si * y; this.sy = 540 + (-si * x + co * y) * fs; this.ss = 1; },
  });
}

for (const yaw of [0, Math.PI / 4, Math.PI / 2]) {
  const hd = makeScene(yaw), co = Math.cos(yaw), si = Math.sin(yaw), rng = mulberry32(71);
  const drawn: number[] = [];
  const list = Array.from({ length: 1000 }, (_, id) => {
    const sx = rng() * 1920 - 960, sy = (rng() * 1080 - 540) / Math.SQRT1_2;
    const x = co * sx - si * sy, y = si * sx + co * sy;
    return { id, y, hx: x, hy: y, hb: charBox(1.06, id % 3 * 120), draw: () => { drawn.push(id); } };
  }).sort((a, b) => a.y - b.y);
  const ctx = { save() {}, restore() {}, setTransform() {}, beginPath() {}, rect() {}, clip() {} };
  const renderer = Object.assign(Object.create(Renderer.prototype) as Renderer, {
    ctx, game: { cam: { zoom: 1 }, player: { x: 0, y: 0 } }, W: 1920, H: 1080, dpr: 1,
  });
  (renderer as any).drawListHD(list, hd);
  assert.equal(hd.items.length, 1000, '屏内人物不能因装箱碎片消失');
  assert.deepEqual(drawn, list.map(d => d.id), '人物绘制顺序应保持');
  const items = [...hd.items].sort((a, b) => a.seq - b.seq);
  for (let i = 0; i < list.length; i++) {
    assert.equal(items[i].x, list[i].hx);
    assert.equal(items[i].y, list[i].hy);
  }
}

const interleaved = makeScene(0);
Object.assign(interleaved, { bbMat: { uniforms: { uStatic: { value: null } } } });
const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
const painted: string[] = [], box = [-8, 8, -16, 0] as const;
const common = { y: 0, hx: 0, hy: 0, hb: box };
const items = [
  { ...common, draw: () => { painted.push('first'); } },
  { y: 0, draw: () => { painted.push('ground'); } },
  { ...common, staticSprite: () => ({ image: canvas, l: -8, r: 8, t: -16, b: 0 }), draw: () => { painted.push('static'); } },
  { ...common, draw: () => { painted.push('last'); } },
];
const renderer = Object.assign(Object.create(Renderer.prototype) as Renderer, {
  ctx: { save() {}, restore() {}, setTransform() {}, beginPath() {}, rect() {}, clip() {} },
  game: { cam: { zoom: 1 }, player: { x: 0, y: 0 } }, W: 1920, H: 1080, dpr: 1,
});
(renderer as any).drawListHD(items, interleaved);
assert.deepEqual(painted, ['first', 'ground', 'last'], '动态项与地贴保持原绘制顺序');
assert.deepEqual([...interleaved.items].sort((a, b) => a.seq - b.seq).map(item => item.seq), [0, 2, 3]);
assert.deepEqual([...interleaved.items].sort((a, b) => a.seq - b.seq).map(item => item.static), [false, true, false]);

const hd = makeScene(0);
const requests = Array.from({ length: 1000 }, (_, seq) => ({
  x: seq, y: 0, l: -170, r: 170, t: -330, b: 70,
  scale: 1, air: false, alpha: 1, k: 1, seq, priority: 0,
}));
const cells = hd.allocBatch(requests);
assert.equal(cells.filter(Boolean).length, requests.length, '图集不足时应降低分辨率重排');
assert.equal(hd.items.length, requests.length);
assert(cells.every(cell => cell && cell.Z < 1));
console.log('HD atlas packing: 1000 visible characters, original order and scale retry passed');
