// 游戏内换图 与 「重新载入页面再读档」 两条路，结果应当一致。
// 做法：开两个子进程——
//   A（游戏内换图）：在南荒开一局，走几步，经上古传送阵去沧溟海（Game.switchMap 在游戏里直接换图并读档），把当时写下的自动存档和换图后的快照交出来；
//   B（重新载入）：一启动就是沧溟海（等同于页面重载后的状态），读同一份自动存档，交出快照。
// 再比较两份快照：地图数据、地点、地标、地形（校验和 + 三百个采样点）、迷雾、人物、NPC、采集点、遗府、裂缝、再存一次档的内容。
// 还顺带验一遍回程：A 再换回南荒，南荒的数据应当和最初一致（地形是留着的，不重建）。
import './env';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const mode = arg('mode');

if (!mode) {
  // ------------------------------------------------------------ 主进程：起两个子进程，比较结果
  const dir = mkdtempSync(join(tmpdir(), 'taixu-switch-')), self = fileURLToPath(import.meta.url);
  const run = (m: string, map: string, extra: string[] = []) => {
    const out = join(dir, m + '.json');
    const r = spawnSync(process.execPath, [...process.execArgv, self, `--mode=${m}`, `--out=${out}`, ...extra], { env: { ...process.env, TAIXU_MAP: map }, encoding: 'utf8' });
    if (r.status !== 0) { console.error(r.stdout, r.stderr); throw new Error(`子进程 ${m} 失败`); }
    return JSON.parse(readFileSync(out, 'utf8'));
  };
  const A = run('switch', 'tiannan');
  writeFileSync(join(dir, 'save.json'), A.save);
  const B = run('reload', 'luanxing', [`--save=${join(dir, 'save.json')}`]);
  const diff: string[] = [];
  for (const key of Object.keys(B.snapshot)) {
    const a = JSON.stringify(A.snapshot[key]), b = JSON.stringify(B.snapshot[key]);
    if (a !== b) { let i = 0; while (i < a.length && a[i] === b[i]) i++; diff.push(`${key}：换图 …${a.slice(Math.max(0, i - 40), i + 60)}… ／ 重载 …${b.slice(Math.max(0, i - 40), i + 60)}…`); }
  }
  assert.equal(diff.length, 0, '游戏内换图与重新载入的结果不一致：\n' + diff.join('\n'));
  assert.equal(A.snapshot.map, 'luanxing'); assert.ok(A.snapshot.locations.length > 50); assert.ok(A.switchedInPlace, '应当是在游戏里直接换的图');
  // 回程：南荒的静态数据（地点、地标、地形、采样）和最初一致
  for (const key of ['map', 'size', 'locations', 'water', 'landmarks', 'scenic', 'terrain', 'samples', 'fogSize', 'rifts', 'sceneryLakes', 'overview']) {
    assert.equal(JSON.stringify(A.back[key]), JSON.stringify(A.home[key]), `回到南荒后「${key}」应与出发前一致`);
  }
  assert.equal(A.modStarts, 2, '去程、回程各通知模组一次「开始」');
  console.log(`PASS 游戏内换图：与重新载入后读档的结果一致（${Object.keys(B.snapshot).length} 项，含 ${A.snapshot.samples.length} 个地形采样、${A.snapshot.npcs[0]} 个 NPC、再存档内容）；回程后南荒数据与出发前一致；去程换图 ${A.firstMs} 毫秒（现建地形），回程 ${A.backMs} 毫秒`);
} else {
  // ------------------------------------------------------------ 子进程
  (globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
  (globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const W = await import('../src/data/world');
  const LM = await import('../src/data/landmarks');
  const G = await import('../src/world/game');
  const hash = (a: ArrayLike<number>) => { let h = 2166136261; for (let i = 0; i < a.length; i++) { h ^= Math.round(a[i] * 1000) & 0xffff; h = Math.imul(h, 16777619); } return (h >>> 0).toString(16) + ':' + a.length; };
  const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v;
  let seed = 1;
  const seeded = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const realRandom = Math.random;

  function snapshot(g: InstanceType<typeof G.Game>, withSave: boolean) {
    const T = g.terrain as any, pts: [number, number][] = [];
    let s = 12345; const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
    for (let i = 0; i < 300; i++) pts.push([200 + rnd() * (W.WORLD_W - 400), 200 + rnd() * (W.WORLD_H - 400)]);
    let resave: unknown = null;
    if (withSave) { g.save(1); const d = JSON.parse(store['taixu_save_1']); delete d.time; resave = canon(d); }
    return {
      map: W.ACTIVE_MAP, size: [W.WORLD_W, W.WORLD_H, W.MACRO_W, W.MACRO_H],
      locations: W.LOCATIONS.map((l) => `${l.id}@${l.x},${l.y}`),
      water: [W.LAKES.length, W.RIVERS.length, W.RANGES.length, W.MAINLAND.length, W.LAKE_ISLES.length, W.BIG_LABELS.length, W.REGIONS.map((r) => r.id).join(',')],
      zones: W.groundZones().map((z) => `${Math.round(z.x)},${Math.round(z.y)},${z.t}`),
      landmarks: LM.LANDMARKS.map((L: any) => `${L.id ?? L.name}@${Math.round(L.x)},${Math.round(L.y)},${Math.round(L.r)}`),
      scenic: [LM.SCENIC.peaks.length, LM.SCENIC.falls.length, LM.SCENIC.groves.length],
      terrain: [T.W, T.H, hash(T.land), hash(T.elev), hash(T.arid), hash(T.cold), hash(T.forest), hash(T.roadMask), T.roads.length, T.locZones.length, T.islands.length, T.rivers.length],
      samples: pts.map(([x, y]) => [T.isLand(x, y) ? 1 : 0, +T.walkFactor(x, y).toFixed(3), +T.surfaceHeight(x, y).toFixed(1), T.inLocZone(x, y, 0) ? 1 : 0, T.onRoad(x, y) ? 1 : 0,
        W.regionAt(x / W.WORLD_SCALE, y / W.WORLD_SCALE, T.isLand(x, y))?.id ?? '', LM.landmarkAt(x, y)?.name ?? '']),
      fogSize: [G.FOG_W, G.FOG_H, g.explored.length],
      fog: g.explored.reduce((n, v) => n + v, 0),
      player: [Math.round(g.player.x), Math.round(g.player.y), g.player.flying, g.day.toFixed(3), g.hero.realm, g.hero.stage, g.hero.exp],
      npcs: [g.npcs.list.length, hash(g.npcs.list.map((d: any) => (d.x ?? 0) + (d.y ?? 0))), g.npcs.list.slice(0, 40).map((d: any) => d.id + ':' + (d.loc ?? '')).join('|')],
      nodes: pts.slice(0, 150).map(([x, y]) => { const n = g.nodes.nearest(x, y, 900, g.day) as any; return n ? `${n.kind}:${n.item}@${Math.round(n.x)},${Math.round(n.y)}` : ''; }),
      sites: pts.slice(0, 120).map(([x, y]) => { const st = (g.sites as any).gen(Math.floor(x / 4000), Math.floor(y / 4000)); return st ? `${st.kind ?? st.type}:${Math.round(st.x)},${Math.round(st.y)}` : ''; }),
      rifts: (g.landmarks as any).rifts.map((r: any) => `${Math.round(r.x)},${Math.round(r.y)},${r.L.name}`),
      sceneryLakes: (g.scenery as any).lakes.map((l: any) => `${Math.round(l.x)},${Math.round(l.y)},${l.name}`),
      overview: [g.overview.width, g.overview.height],
      region: g.ui.region,
      resave,
    };
  }

  const out: Record<string, unknown> = {};
  const g = await G.createGame(() => {});
  const load0 = g.load.bind(g);
  // 两条路读档时用同一串随机数（读档里有少量随机，比如找落脚点）
  g.load = (k?: string) => { seed = 20261113; Math.random = seeded; try { return load0(k); } finally { Math.random = realRandom; } };
  if (mode === 'switch') {
    g.reset();
    let modStarts = 0; (g as any).mods = { tick() {}, day() {}, start() { modStarts++; } };
    g.input.keys.add('a'); for (let i = 0; i < 40; i++) g.update(0.1); g.input.keys.clear();
    out.home = snapshot(g, false);
    const dest = W.locsOf('luanxing').find((l) => l.type === 'city') ?? W.locsOf('luanxing')[0];
    const switch0 = g.switchMap.bind(g);
    let ms = 0;
    g.switchMap = (map, key) => { out.save ??= store['taixu_save_auto']; const t = performance.now(); const r = switch0(map, key); ms = performance.now() - t; return r; };
    const epoch = g.mapEpoch;
    g.travel.go('luanxing', dest.x * W.WORLD_SCALE, dest.y * W.WORLD_SCALE + 500, 3, 'portal');
    out.switchedInPlace = g.mapEpoch === epoch + 1 && W.ACTIVE_MAP === 'luanxing';
    out.firstMs = Math.round(ms);
    out.snapshot = snapshot(g, true);
    // 回程
    g.travel.go('tiannan', (out.home as any).player[0], (out.home as any).player[1], 0, 'edge');
    out.backMs = Math.round(ms);
    out.back = snapshot(g, false);
    out.modStarts = modStarts;
  } else {
    store['taixu_save_auto'] = readFileSync(arg('save')!, 'utf8');
    assert.equal(W.ACTIVE_MAP, 'luanxing');
    assert.ok(g.load('taixu_save_auto'), '重新载入后应能读档');
    out.snapshot = snapshot(g, true);
  }
  writeFileSync(arg('out')!, JSON.stringify(out));
}
