import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadImage, createCanvas } from '@napi-rs/canvas';
const base = 'tools/out/edge-flicker/arena-floor-';
const left = process.argv[2] ?? 'old', right = process.argv[3] ?? 'new';
const oldReport = JSON.parse(readFileSync(base + left + '.json', 'utf8')), newReport = JSON.parse(readFileSync(base + right + '.json', 'utf8'));
assert.deepEqual(oldReport.cases.map((c: { name: string }) => c.name), newReport.cases.map((c: { name: string }) => c.name));
async function pixels(path: string) {
  const im = await loadImage(path), c = createCanvas(im.width, im.height), g = c.getContext('2d'); g.drawImage(im, 0, 0);
  return { width: im.width, height: im.height, data: g.getImageData(0, 0, im.width, im.height).data };
}
const cases = [];
for (const { name } of oldReport.cases as { name: string }[]) {
  const a = await pixels(`${base}${left}-${name}.png`), b = await pixels(`${base}${right}-${name}.png`);
  assert.deepEqual([a.width, a.height], [b.width, b.height]);
  let sum = 0, over5 = 0, over20 = 0, max = 0;
  for (let i = 0; i < a.data.length; i += 4) for (let k = 0; k < 3; k++) {
    const d = Math.abs(a.data[i + k] - b.data[i + k]); sum += d; max = Math.max(max, d);
    if (d > 5) over5++; if (d > 20) over20++;
  }
  const n = a.width * a.height * 3;
  cases.push({ name, meanChannelDiff: +(sum / n).toFixed(3), channelsOver5Pct: +(over5 / n * 100).toFixed(3), channelsOver20Pct: +(over20 / n * 100).toFixed(3), max });
}
for (const suffix of [left, right]) {
  const initial = await pixels(`${base}${suffix}-unready.png`), stone = await pixels(`${base}${suffix}-stone.png`), complete = await pixels(`${base}${suffix}-all.png`);
  let stoneChanged = 0, arrayChanged = 0;
  for (let i = 0; i < initial.data.length; i++) { if (initial.data[i] !== stone.data[i]) stoneChanged++; if (stone.data[i] !== complete.data[i]) arrayChanged++; }
  assert(stoneChanged > 10000, `${suffix}: delayed stone must change visible pixels`);
  assert(arrayChanged > 10000, `${suffix}: delayed array/clouds must change visible pixels`);
}
writeFileSync(base + left + '-' + right + '-comparison.json', JSON.stringify({ note: 'real fmod/ModHost/collect Canvas pixel comparison; cached resampling is not expected to be identical to direct vector rasterization', cases }, null, 2));
console.log(JSON.stringify(cases, null, 2));
