import './env';
import assert from 'node:assert/strict';
import { HdStaticAtlas } from '../src/hd2d/staticAtlas';

function sprite(color: string, width = 6) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = 6;
  const g = canvas.getContext('2d')!; g.fillStyle = color; g.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

const atlas = new HdStaticAtlas(16);
atlas.begin();
const first = Array.from({ length: 16 }, (_, i) => sprite(`rgb(${i * 10},0,0)`));
const cells = first.map(image => atlas.get(image)!);
assert(cells.every(Boolean));
const retained = [0, 4, 8, 12];
for (let frame = 0; frame < 121; frame++) {
  atlas.begin();
  for (const i of retained) assert.equal(atlas.get(first[i]), cells[i]);
}
const second = Array.from({ length: 12 }, (_, i) => sprite(`rgb(0,${i * 10},0)`));
const replacements = second.map(image => atlas.get(image));
assert.equal(replacements.filter(Boolean).length, 12, '连续重建时应复用其他角色的过期同尺寸槽位');
for (const i of retained) assert.equal(atlas.get(first[i]), cells[i], '当前帧还在使用的槽位不能被覆盖');

for (let wave = 0; wave < 4; wave++) {
  for (let frame = 0; frame < 121; frame++) { atlas.begin(); for (const i of retained) atlas.get(first[i]); }
  const next = Array.from({ length: 12 }, (_, i) => sprite(`rgb(0,0,${i * 10})`));
  assert.equal(next.filter(image => atlas.get(image)).length, 12, `第 ${wave + 3} 波应继续复用过期槽位`);
}
atlas.dispose();

const resizing = new HdStaticAtlas(32); resizing.begin();
const changing = sprite('red'), old = resizing.get(changing)!;
changing.width = 10;
assert(resizing.get(changing), '改尺寸后应分配新位置');
const sameFrame = resizing.get(sprite('blue'))!;
assert.notDeepEqual(sameFrame, old, '当前帧已引用的旧槽位不能被新图片覆盖');
resizing.begin();
assert.deepEqual(resizing.get(sprite('green')), old, '下一帧可以复用已释放的同尺寸槽位');
resizing.dispose();
console.log('PASS 真实静态图集连续重建波次、过期槽位复用和当帧保护');
