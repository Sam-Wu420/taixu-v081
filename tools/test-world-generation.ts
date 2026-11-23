import assert from 'node:assert/strict';
import './env';
import { WORLD_W, WORLD_H } from '../src/data/world';
import { CHUNK, Terrain } from '../src/world/terrain';
import { NodeField } from '../src/world/nodes';
import { hash2, hashU } from '../src/core/rng';

const first = new Terrain(); first.build();
const second = new Terrain(); second.build();
const a = new NodeField(first), b = new NodeField(second);
const anchors: { x: number; y: number }[] = [];
for (let x = WORLD_W - 6000; x > WORLD_W * 0.5 && anchors.length < 6; x -= 7000) {
  for (let y = 6000; y < WORLD_H - 6000 && anchors.length < 6; y += 13000) {
    if (!first.isLand(x, y)) continue;
    const nodes = a.inRect(x - 2200, y - 2200, x + 2200, y + 2200);
    if (!nodes.length) continue;
    anchors.push({ x, y });
  }
}
assert.equal(anchors.length, 6, '需找到 6 处世界远端的有效陆地');
let nodeCount = 0, decoCount = 0, grassCount = 0;
for (const { x, y } of anchors) {
  const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
  assert.deepEqual(first.sample(x, y), second.sample(x, y));
  assert.deepEqual(first.surface.sample(x, y), second.surface.sample(x, y));
  const nodes = a.inRect(x - 2200, y - 2200, x + 2200, y + 2200);
  const decos = first.getDecos(cx, cy), grass = first.getGrass(cx, cy);
  assert.deepEqual(nodes, b.inRect(x - 2200, y - 2200, x + 2200, y + 2200));
  assert.deepEqual(decos, second.getDecos(cx, cy));
  assert.deepEqual(grass, second.getGrass(cx, cy));
  assert.equal(new Set(nodes.map((n) => n.key)).size, nodes.length);
  assert.ok(nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
  assert.ok(decos.every((d) => Number.isFinite(d.x) && Number.isFinite(d.y)));
  assert.ok(grass.every((g) => Number.isFinite(g.x) && Number.isFinite(g.y)));
  first.decoCache.delete(cx + ',' + cy); first.grassCache.delete(cx + ',' + cy);
  assert.deepEqual(first.getDecos(cx, cy), decos, '缓存逐出后装饰应原样重建');
  assert.deepEqual(first.getGrass(cx, cy), grass, '缓存逐出后草丛应原样重建');
  nodeCount += nodes.length; decoCount += decos.length; grassCount += grass.length;
}
const item = a.inRect(anchors[0].x - 2200, anchors[0].y - 2200, anchors[0].x + 2200, anchors[0].y + 2200)[0];
assert.ok(a.available(item, 60));
a.harvest(item, 60, 0, 0);
b.fromSave(a.toSave());
assert.equal(b.available(item, 60), false, '远端资源采集状态应经存读档保存');
assert.deepEqual(b.toSave(), a.toSave());
assert.equal(b.available(item, 1000), true, '资源应在再生日期后恢复');
for (const hash of [hash2, hashU]) {
  const values = new Set<number>();
  for (let i = 0; i < 1000; i++) {
    const h = hash(Math.floor(WORLD_W / 40) - i, Math.floor(WORLD_H / 40) + i, 41);
    assert.ok(h >= 0 && h < 1 && Number.isFinite(h));
    values.add(h);
  }
  assert.ok(values.size > 990, '远端邻近网格不应出现明显重复');
}
console.log(JSON.stringify({ world: [WORLD_W, WORLD_H], anchors, nodeCount, decoCount, grassCount }, null, 2));
console.log('PASS 远端真实地形/资源/装饰重建、采集存档和相邻坐标散列');
