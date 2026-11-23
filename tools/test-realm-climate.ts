// 别界的气候分区：每种样貌各取一界，建出地形，看陆地上干旱 / 寒冷 / 林木三个量的分布——
// 一界之内要有差别（不是全境一个值），同时大势仍符合样貌（瀚漠多旱、寒渊多冷、灵木多林）。
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };

const Z = await import('../src/data/zhujie');
const W = await import('../src/data/world');
const { Terrain } = await import('../src/world/terrain');

const want = new Map<string, number>();
for (let i = 1; i < 400 && want.size < 6; i++) { const r = Z.realmAt(i); if (r.kind !== 'human' && !want.has(r.kind)) want.set(r.kind, i); }
assert.equal(want.size, 6, '六种样貌都要取到');
const lines: string[] = [];
for (const [kind, index] of want) {
  const id = `realm-${index}` as any;
  W.ensureMap(id); W.setActiveMap(id);
  const t = new Terrain(); t.build();
  const T = t as any, N = T.W * T.H;
  let land = 0, dry = 0, snow = 0, wood = 0, mild = 0;
  const cells = new Set<string>();
  for (let i = 0; i < N; i += 3) {
    if (T.land[i] < 0.6) continue;
    land++;
    const a = T.arid[i] > 0.75, c = T.cold[i] > 0.42, f = T.forest[i] > 0.3;
    if (a) dry++; if (c) snow++; if (f) wood++; if (!a && !c) mild++;
    cells.add(`${a ? 1 : 0}${c ? 1 : 0}${f ? 1 : 0}`);
  }
  const pct = (n: number) => Math.round(n / land * 100);
  lines.push(`${Z.REALM_KIND_NAME[kind as keyof typeof Z.REALM_KIND_NAME]}（第 ${index} 界，${T.W}×${T.H}）：旱 ${pct(dry)}%　寒 ${pct(snow)}%　林 ${pct(wood)}%　温润 ${pct(mild)}%　组合 ${cells.size} 种`);
  console.log(lines[lines.length - 1]);
  assert.ok(land > 1000, `${kind} 要有陆地`);
  assert.ok(cells.size >= 3, `${kind} 界内至少三种气候组合：${cells.size}`);
  if (kind === 'desert') assert.ok(pct(dry) >= 35 && pct(dry) <= 92, `瀚漠以旱为主但不是全境：${pct(dry)}%`);
  if (kind === 'frost') assert.ok(pct(snow) >= 50, `寒渊以冷为主：${pct(snow)}%`);
  if (kind === 'spiritwood') assert.ok(pct(wood) >= 45, `灵木多林：${pct(wood)}%`);
  if (kind === 'ember') assert.ok(pct(dry) >= 35 && pct(snow) === 0, `炎墟旱而不冷：${pct(dry)}% / ${pct(snow)}%`);
}
W.setActiveMap('tiannan');
console.log(lines.join('\n'));
console.log('PASS 别界气候分区：六种样貌各自有界内差别，大势仍符合样貌');
