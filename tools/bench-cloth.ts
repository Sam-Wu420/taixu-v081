import { performance } from 'node:perf_hooks';
import { Strand } from '../src/gfx/character';
import { WORLD_W, WORLD_H } from '../src/data/world';

type Coord = Float32Array | Float64Array;
type Coords = { x: Coord; y: Coord; ox: Coord; oy: Coord };
const population = 200, frames = 120;
const runs = (Ctor: Float32ArrayConstructor | Float64ArrayConstructor) => {
  const strands = Array.from({ length: population }, () => {
    const strand = new Strand(6, 4);
    const c = strand as unknown as Coords;
    c.x = new Ctor(c.x); c.y = new Ctor(c.y); c.ox = new Ctor(c.ox); c.oy = new Ctor(c.oy);
    strand.reset(WORLD_W - 2000, WORLD_H - 2000);
    return strand;
  });
  const begin = performance.now();
  for (let frame = 0; frame < frames; frame++) for (let i = 0; i < strands.length; i++) {
    const t = frame / 60, ax = WORLD_W - 2000 + Math.sin(t * 2) * 100 + i, ay = WORLD_H - 2000 + Math.cos(t) * 60;
    strands[i].step(ax, ay, 1 / 60, 0, 520, -200, 0, 2, 4);
  }
  return performance.now() - begin;
};
runs(Float32Array); runs(Float64Array);
const a: number[] = [], b: number[] = [];
for (let i = 0; i < 12; i++) {
  if (i % 2 === 0) { a.push(runs(Float32Array)); b.push(runs(Float64Array)); }
  else { b.push(runs(Float64Array)); a.push(runs(Float32Array)); }
}
const median = (values: number[]) => [...values].sort((x, y) => x - y)[Math.floor(values.length / 2)];
console.log(JSON.stringify({ population, frames, updatesPerSample: population * frames, samples: a.length, float32MedianMs: median(a), float64MedianMs: median(b), float32SamplesMs: a, float64SamplesMs: b }, null, 2));
