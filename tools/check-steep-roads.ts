// 山路坡度与地点平台贴坡的统计（高山模式）。能当回归工具反复跑。
//   npx tsx tools/check-steep-roads.ts [--map=tiannan|luanxing|dajin|all] [--top=20] [--sites] [--out=文件]
// 一、山路：沿每条路（terrain.roadSegW，按路的顺序首尾相接）每 25 单位取一次路面高度（地形网格高度），
//     一步的坡度 = 高差 ÷ 步长。连续超标的几步算一「段」。列出坡度大于 1.5、大于 1.0 的段数与最陡的几段（坡度、坐标、最近地点）。
//     路面上画成石阶的段（Terrain.roadStairAt）另计：石阶段允许到 STAIR_MAX。
// 二、平台（--sites）：每处整了平台的地点（非占山宗门），沿平台边缘一圈量「平台面和台外地形的高差」：
//     台外 = 平台核心边往外 PROBE 处的地形网格高度。高出台外 = 悬空（台沿要收边），低于台外 = 深埋（台沿是一道切坡）。
//     列出超过 LIMIT 的地点，以及台沿最陡的坡度（台沿是否成了竖墙 / 斜插）。
import './env';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => args.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const mapArg = opt('map', 'all'), top = Number(opt('top', '20')), wantSites = args.includes('--sites'), outFile = opt('out', '');
const maps = mapArg === 'all' ? ['tiannan', 'luanxing', 'dajin'] : [mapArg];

if (maps.length > 1) {
  // 每张图各开一个进程（地图在模块加载时就定了），结果拼起来
  const { spawnSync } = await import('node:child_process');
  let all = '';
  for (const m of maps) {
    const r = spawnSync(process.execPath, [...process.execArgv, process.argv[1], `--map=${m}`, ...args.filter(a => !a.startsWith('--map=') && !a.startsWith('--out='))], { encoding: 'utf8', maxBuffer: 64 << 20 });
    process.stderr.write(r.stderr ?? '');
    all += r.stdout ?? '';
    if (r.status) { console.log(all); process.exit(r.status); }
  }
  console.log(all);
  if (outFile) (await import('node:fs')).writeFileSync(outFile, all);
  process.exit(0);
}

(globalThis as { __TAIXU_MAP?: string }).__TAIXU_MAP = maps[0];
(globalThis as { __TAIXU_MOUNTAINS?: boolean }).__TAIXU_MOUNTAINS = true;
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (key: string) => store[key] ?? null, setItem: (key: string, value: string) => { store[key] = value; }, removeItem: (key: string) => { delete store[key]; } };

const { Terrain } = await import('../src/world/terrain');
const { LOCATIONS, WORLD_SCALE, ACTIVE_MAP } = await import('../src/data/world');
const { grandSectPlan } = await import('../src/data/sectPlan');
const t0 = Date.now();
const terrain = new Terrain();
terrain.build();
const S = terrain.surface, R = terrain.roadSegW;
const lines: string[] = [];
const say = (s: string) => lines.push(s);

const locs = LOCATIONS.map(l => ({ l, x: l.x * WORLD_SCALE, y: l.y * WORLD_SCALE }));
const nearest = (x: number, y: number) => {
  let best = locs[0], bd = Infinity;
  for (const o of locs) { const d = Math.hypot(o.x - x, o.y - y); if (d < bd) { bd = d; best = o; } }
  return { name: best.l.name, id: best.l.id, d: Math.round(bd) };
};
const stairAt = (terrain as unknown as { roadStairAt?: (x: number, y: number) => boolean }).roadStairAt?.bind(terrain);

// ---------- 一、山路 ----------
const STEP = 25, STAIR_MAX = 1.6;
interface Run { g: number; x: number; y: number; n: number; stair: boolean; len: number }
const runs: Run[] = [];
let samples = 0, over1 = 0, over15 = 0, cur: Run | null = null, lastEnd = [NaN, NaN];
const close = () => { if (cur) runs.push(cur); cur = null; };
for (let i = 0; i < R.length; i += 8) {
  const ax = R[i], ay = R[i + 1], bx = R[i + 2], by = R[i + 3], len = Math.hypot(bx - ax, by - ay);
  if (ax !== lastEnd[0] || ay !== lastEnd[1]) close();
  lastEnd = [bx, by];
  if (len < 1) continue;
  const n = Math.max(1, Math.ceil(len / STEP)), st = len / n;
  let prev = S.terrainHeightAt(ax, ay);
  for (let k = 1; k <= n; k++) {
    const x = ax + (bx - ax) * k / n, y = ay + (by - ay) * k / n, h = S.terrainHeightAt(x, y);
    const g = Math.abs(h - prev) / st; prev = h; samples++;
    if (!terrain.isLand(x, y)) { close(); continue; }
    if (g > 1) over1++;
    if (g > 1.5) over15++;
    if (g > 1) {
      const stair = !!stairAt?.(x - (bx - ax) / n / 2, y - (by - ay) / n / 2);
      if (!cur) cur = { g, x, y, n: 0, stair, len: 0 };
      cur.n++; cur.len += st; cur.stair = cur.stair && stair;
      if (g > cur.g) { cur.g = g; cur.x = x; cur.y = y; }
    } else close();
  }
}
close();
const r15 = runs.filter(r => r.g > 1.5), r10 = runs.filter(r => r.g > 1.0);
const r15bare = r15.filter(r => !(r.stair && r.g <= STAIR_MAX)), r10bare = r10.filter(r => !r.stair);
say(`【${ACTIVE_MAP}】道路 ${R.length / 8} 段、采样 ${samples} 步（每步约 ${STEP}）；建地形 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
say(`  坡度>1.5：${r15.length} 段（${over15} 步）；其中不是石阶 / 超出石阶上限 ${STAIR_MAX} 的 ${r15bare.length} 段`);
say(`  坡度>1.0：${r10.length} 段（${over1} 步）；其中没画成石阶的 ${r10bare.length} 段`);
say(`  最陡：${runs.length ? Math.max(...runs.map(r => r.g)).toFixed(2) : '无'}`);
for (const r of [...r10].sort((a, b) => b.g - a.g).slice(0, top)) {
  const nb = nearest(r.x, r.y), m = S.massifAt(r.x, r.y);
  say(`  坡度 ${r.g.toFixed(2)}  (${Math.round(r.x)}, ${Math.round(r.y)})  长 ${Math.round(r.len)}  近「${nb.name}」(${nb.id}) ${nb.d}${r.stair ? '  石阶' : ''}${m ? '  宗门地界' : ''}`);
}

// ---------- 二、平台贴坡 ----------
if (wantSites) {
  // 台沿外 PROBE 以内：「整地造出来的坡」（地面和原地形差 150 以上的地方）最陡多少；台沿比 PROBE 外的地面高 / 低多少。
  // 原地形本身的峭壁不算（山里本来就有），只算平台整地改出来的那部分；路基两侧 450 以内（路堤、路堑）另算，不归平台。
  const PROBE = 640, WALL = 1.5, LIMIT = 600;
  type P = { id: string; radius: number; height: number; edge: number; x: number; y: number; kind: string; flat?: boolean; natural?: number };
  const plats = new Map<string, P>();
  const SI = S as unknown as { platforms: Map<number, P[]>; shaped(x: number, y: number): number };
  for (const bucket of SI.platforms.values()) for (const p of bucket) plats.set(p.id, p);
  const rows: { id: string; name: string; kind: string; up: number; down: number; wall: number; moved: number; x: number; y: number; wx: number; wy: number }[] = [];
  const MARGIN = Math.SQRT2 * 64;
  for (const p of plats.values()) {
    const loc = LOCATIONS.find(l => l.id === p.id)!;
    if (grandSectPlan(loc)) continue;
    let up = 0, down = 0, wall = 0, wx = 0, wy = 0;
    const core = p.radius + MARGIN;
    for (let k = 0; k < 64; k++) {
      const a = k / 64 * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a);
      const ex = p.x + cx * core, ey = p.y + cy * core;
      if (!terrain.isLand(ex, ey) || !terrain.isLand(ex + cx * PROBE, ey + cy * PROBE)) continue;   // 岛的台沿外就是海，不算
      const hEdge = S.terrainHeightAt(ex, ey);
      const hOut = S.terrainHeightAt(ex + cx * PROBE, ey + cy * PROBE);
      up = Math.max(up, hEdge - hOut); down = Math.max(down, hOut - hEdge);
      let prev = hEdge;
      for (let d = 16; d <= PROBE; d += 16) {
        const x = ex + cx * d, y = ey + cy * d, h = S.terrainHeightAt(x, y), g = Math.abs(h - prev) / 16;
        prev = h;
        if (g > wall && Math.abs(h - SI.shaped(x, y)) > 150 && !terrain.nearRoad(x, y, 450)) { wall = g; wx = x; wy = y; }
      }
    }
    if (up > LIMIT || down > LIMIT || wall > WALL) rows.push({ id: p.id, name: loc.name, kind: p.kind + (p.flat ? '/城' : ''), up: Math.round(up), down: Math.round(down), wall: +wall.toFixed(2), moved: Math.round(p.height - (p.natural ?? p.height)), x: Math.round(p.x), y: Math.round(p.y), wx: Math.round(wx), wy: Math.round(wy) });
  }
  rows.sort((a, b) => b.wall - a.wall);
  const hang = rows.filter(r => r.up > LIMIT).length, bury = rows.filter(r => r.down > LIMIT).length, walls = rows.filter(r => r.wall > WALL).length;
  say(`  平台 ${plats.size} 处（不含占山宗门）：整地造出的台沿坡陡过 ${WALL} 的 ${walls} 处；台沿比台外 ${PROBE} 处高 ${LIMIT} 以上（悬空）${hang} 处、低 ${LIMIT} 以上（深埋）${bury} 处`);
  for (const r of rows.slice(0, top)) say(`  ${r.name}(${r.id}, ${r.kind})  台沿整地坡 ${r.wall}@(${r.wx}, ${r.wy})  悬 ${r.up}  埋 ${r.down}  台面挪了 ${r.moved}  中心 (${r.x}, ${r.y})`);
}
console.log(lines.join('\n'));
