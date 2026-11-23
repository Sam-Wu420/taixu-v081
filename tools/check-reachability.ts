// 可达性检查：把当前地图按格子连通（相邻两格之间用游戏里同一套 walkFactor + canTraverse 判定），
// 报告每个地点从主城步行能不能走到。默认按高山模式检查；加 --plain 检查平地模式作对照。
//   npx tsx tools/check-reachability.ts [--plain] [--cell=240] [--from=yuejing]
import './env';

const args = process.argv.slice(2);
const plain = args.includes('--plain');
const cell = Number(args.find(a => a.startsWith('--cell='))?.slice(7) ?? 240);
const fromId = args.find(a => a.startsWith('--from='))?.slice(7) ?? 'yuejing';
(globalThis as { __TAIXU_MOUNTAINS?: boolean }).__TAIXU_MOUNTAINS = !plain;
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (key: string) => store[key] ?? null, setItem: (key: string, value: string) => { store[key] = value; }, removeItem: (key: string) => { delete store[key]; } };

const { Terrain } = await import('../src/world/terrain');
const { LOCATIONS, WORLD_SCALE, WORLD_W, WORLD_H, ACTIVE_MAP } = await import('../src/data/world');
const { MOUNTAINS } = await import('../src/world/surface');
const started = Date.now();
const terrain = new Terrain();
terrain.build();

const nx = Math.ceil(WORLD_W / cell), ny = Math.ceil(WORLD_H / cell), total = nx * ny;
const land = new Uint8Array(total);
for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) land[y * nx + x] = terrain.walkFactor((x + 0.5) * cell, (y + 0.5) * cell) > 0 ? 1 : 0;

// 并查集：相邻两格能互相走到就并成一片
const parent = new Int32Array(total); for (let i = 0; i < total; i++) parent[i] = i;
const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
const union = (a: number, b: number) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
let links = 0, blocked = 0;
for (let y = 0; y < ny; y++) {
  for (let x = 0; x < nx; x++) {
    const i = y * nx + x;
    if (!land[i]) continue;
    const ax = (x + 0.5) * cell, ay = (y + 0.5) * cell;
    if (x + 1 < nx && land[i + 1]) { if (terrain.canTraverse(ax, ay, ax + cell, ay)) { union(i, i + 1); links++; } else blocked++; }
    if (y + 1 < ny && land[i + nx]) { if (terrain.canTraverse(ax, ay, ax, ay + cell)) { union(i, i + nx); links++; } else blocked++; }
    // 斜着也能走：山道多是斜向的，路基又窄，只连上下左右会把沿斜向山道能走通的地方误判成断开
    if (y + 1 < ny && x + 1 < nx && land[i + nx + 1] && find(i) !== find(i + nx + 1) && terrain.canTraverse(ax, ay, ax + cell, ay + cell)) union(i, i + nx + 1);
    if (y + 1 < ny && x > 0 && land[i + nx - 1] && find(i) !== find(i + nx - 1) && terrain.canTraverse(ax, ay, ax - cell, ay + cell)) union(i, i + nx - 1);
  }
  if (y % 100 === 0) process.stderr.write(`\r连通 ${Math.round(y / ny * 100)}%`);
}
process.stderr.write('\r');

// 地点落在哪一片：取地点中心附近最近的陆地格（中心可能压在建筑或水边）
const cellOf = (wx: number, wy: number): number => {
  const cx = Math.floor(wx / cell), cy = Math.floor(wy / cell);
  for (let r = 0; r <= 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = cx + dx, y = cy + dy;
    if (x >= 0 && y >= 0 && x < nx && y < ny && land[y * nx + x]) return y * nx + x;
  }
  return -1;
};
const origin = LOCATIONS.find(l => l.id === fromId) ?? LOCATIONS.find(l => l.type === 'city')!;
const originCell = cellOf(origin.x * WORLD_SCALE, origin.y * WORLD_SCALE);
const main = originCell >= 0 ? find(originCell) : -1;
let landCells = 0, mainCells = 0;
for (let i = 0; i < total; i++) if (land[i]) { landCells++; if (find(i) === main) mainCells++; }

type Row = { id: string; name: string; type: string; major: boolean; minor: boolean; height: number; reachable: boolean; onLand: boolean };
const rows: Row[] = LOCATIONS.map(l => {
  const wx = l.x * WORLD_SCALE, wy = l.y * WORLD_SCALE, c = cellOf(wx, wy);
  return { id: l.id, name: l.name, type: l.type, major: !!l.major, minor: !!l.minor, height: Math.round(terrain.surfaceHeight(wx, wy)), onLand: c >= 0, reachable: c >= 0 && find(c) === main };
});
const mainland = rows.filter(r => r.onLand && r.type !== 'isle');
const byType: Record<string, { total: number; reachable: number }> = {};
for (const r of mainland) { const t = byType[r.type] ??= { total: 0, reachable: 0 }; t.total++; if (r.reachable) t.reachable++; }
const unreachable = mainland.filter(r => !r.reachable);
const report = {
  map: ACTIVE_MAP, mode: MOUNTAINS ? '高山' : '平地', cell, from: origin.name,
  seconds: Math.round((Date.now() - started) / 1000),
  land: { cells: landCells, reachablePct: +(mainCells / landCells * 100).toFixed(1), blockedLinksPct: +(blocked / (links + blocked) * 100).toFixed(1) },
  locations: { total: mainland.length, reachable: mainland.length - unreachable.length, byType },
  unreachableNamed: unreachable.filter(r => !r.minor).map(r => `${r.name}(${r.type}, 高 ${r.height})`),
  unreachableMinor: { count: unreachable.filter(r => r.minor).length, sample: unreachable.filter(r => r.minor).slice(0, 12).map(r => `${r.name}(${r.type}, 高 ${r.height})`) },
};
console.log(JSON.stringify(report, null, 2));
