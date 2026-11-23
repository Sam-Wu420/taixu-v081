// convexHull 新旧实现对拍：随机点云 + 共线 / 重复点，要求输出序列逐点相同
import { convexHull } from '../src/gfx/character';

function old<T extends { x: number; y: number }>(pts: T[]): T[] {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: T, a: T, b: T) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: T[] = [], up: T[] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up);
}
let s = 1; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
let bad = 0, n = 0;
for (let t = 0; t < 20000; t++) {
  const m = 1 + Math.floor(rnd() * 70), pts: { x: number; y: number; tag: number }[] = [];
  const grid = t % 3 === 0;   // 三分之一用整数格点，制造共线与重复
  for (let i = 0; i < m; i++) pts.push(grid ? { x: Math.floor(rnd() * 6), y: Math.floor(rnd() * 6), tag: i } : { x: rnd() * 200 - 100, y: rnd() * 300, tag: i });
  const a = old(pts), b = convexHull(pts); n++;
  const same = a.length === b.length && a.every((q, i) => q === b[i]);
  const sameGeom = a.length === b.length && a.every((q, i) => q.x === b[i].x && q.y === b[i].y);
  if (!sameGeom) { bad++; if (bad < 4) console.log('不同', m, grid, JSON.stringify(a.map((q) => [q.x, q.y])), JSON.stringify(b.map((q) => [q.x, q.y]))); }
  else if (!same && !grid) { bad++; if (bad < 4) console.log('同形不同对象', m); }
}
// 速度
const big = Array.from({ length: 60 }, () => ({ x: rnd() * 60, y: rnd() * 120, tag: 0 }));
for (const [name, f] of [['旧', old], ['新', convexHull]] as const) { const t0 = performance.now(); for (let i = 0; i < 200000; i++) f(big); console.log(name, ((performance.now() - t0) / 200).toFixed(2), 'µs/次'); }
console.log(bad ? `✗ ${bad}/${n} 不一致` : `✓ ${n} 组全部一致`);
process.exit(bad ? 1 : 0);
