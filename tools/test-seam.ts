// 交界地带（南荒北缘 ⇄ 中州南缘之间的天穹草原）：两张图各自算出来的必须是同一片地。
// 开两个子进程，一个是南荒、一个是中州，在交界地带的同一批位置上取：地貌、能否行走、地表高度、分块底图的像素、草丛和树石，
// 换算到同一个坐标系后逐项比较。另外检查各自图边内外的地貌是连续的（没有一刀切的断层）。
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
  const dir = mkdtempSync(join(tmpdir(), 'taixu-seam-')), self = fileURLToPath(import.meta.url);
  const run = (map: string) => {
    const out = join(dir, map + '.json');
    const r = spawnSync(process.execPath, [...process.execArgv, self, '--mode=dump', `--out=${out}`], { env: { ...process.env, TAIXU_MAP: map }, encoding: 'utf8' });
    if (r.status !== 0) { console.error(r.stdout, r.stderr); throw new Error(`子进程 ${map} 失败`); }
    return JSON.parse(readFileSync(out, 'utf8'));
  };
  const A = run('tiannan'), B = run('dajin'), C = run('luanxing');
  assert.deepEqual(A.frame, [0, 0]); assert.deepEqual(B.frame, [-219136, 384000]); assert.deepEqual(C.frame, [-751616, -83968]);
  for (const M of [B, C]) for (const v of M.frame) { assert.ok(v % 1024 === 0 && v % 64 === 0); }
  const same = (what: string, X: any, Y: any, nx: string, ny: string) => {
    for (const key of ['samples', 'heights', 'chunks', 'grass', 'decos'] as const) {
      const a = JSON.stringify(X[key]), b = JSON.stringify(Y[key]);
      if (a !== b) { let i = 0; while (i < a.length && a[i] === b[i]) i++; assert.fail(`${what}「${key}」两边不一致：${nx} …${a.slice(Math.max(0, i - 60), i + 80)}… ／ ${ny} …${b.slice(Math.max(0, i - 60), i + 80)}…`); }
    }
  };
  same('天穹草原', A.steppe, B.steppe, '南荒', '中州');
  same('无边海', A.sea, C.sea, '南荒', '沧溟海');
  const S = A.steppe, E = A.sea;
  assert.ok(S.samples.length >= 200 && S.chunks.length >= 6 && S.grassCount > 50, `取样太少：${S.samples.length} / ${S.chunks.length} / ${S.grassCount}`);
  assert.ok(S.samples.every((q: number[]) => q[0] === 1 && q[1] > 0), '草原中段整片是能走的陆地');
  const wet = E.samples.filter((q: number[]) => q[0] === 0).length;
  assert.ok(wet > E.samples.length * 0.85 && wet < E.samples.length, `无边海中段绝大部分是海，零星有岛：${wet} / ${E.samples.length}`);
  for (const M of [A, B, C]) assert.ok(M.edgeJump < 0.08 && M.edgeHeightJump < 30, `图边内外应当连续：地貌差 ${M.edgeJump}，高度差 ${M.edgeHeightJump}`);
  console.log(`PASS 交界地带：草原（南荒 / 中州）与无边海（南荒 / 沧溟海）两边各自一致（草原 ${S.samples.length} 个地貌采样、${S.chunks.length} 块底图逐像素、${S.grassCount} 丛草、${S.decoCount} 件树石；海上 ${E.samples.length} 个采样，其中 ${E.samples.length - wet} 个在岛上）；图边内外连续。`);
} else {
  (globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
  const W = await import('../src/data/world');
  const { Terrain, CHUNK } = await import('../src/world/terrain');
  const T = new Terrain(); T.build();
  const S = T.seam!, dx = S.dx, dy = S.dy;
  let s = 4242; const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const hashPixels = (c: any) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 2166136261; for (let i = 0; i < d.length; i += 3) { h ^= d[i]; h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
  // 大陆坐标（＝南荒的坐标）里的一批点和分块：只取中线两侧的一带（飞过中线换图时眼前看得见的范围；两边各自的地点都离这一带很远）
  const dump = (pts: [number, number][], cells: [number, number][]) => {
    const samples = pts.map(([gx, gy]) => { const x = gx + dx, y = gy + dy, q = T.sample(x, y); return [T.isLand(x, y) ? 1 : 0, r3(T.walkFactor(x, y)), r3(q.land), r3(q.elev), r3(q.arid), r3(q.cold), r3(q.forest), T.inOutland(x, y) ? 1 : 0]; });
    const heights = pts.map(([gx, gy]) => Math.round(T.surfaceHeight(gx + dx, gy + dy) * 10) / 10);
    const chunks: string[] = [], grass: string[] = [], decos: string[] = [];
    let grassCount = 0, decoCount = 0;
    for (const [gcx, gcy] of cells) {
      const cx = gcx + dx / CHUNK, cy = gcy + dy / CHUNK;
      chunks.push(`${gcx},${gcy}:${hashPixels(T.buildChunk(cx, cy).canvas)}`);
      const g = T.getGrass(cx, cy); grassCount += g.length;
      grass.push(g.map((c: any) => `${Math.round(c.x - dx)},${Math.round(c.y - dy)},${c.kind},${r3(c.s)}`).join(';'));
      const d = T.getDecos(cx, cy); decoCount += d.length;
      decos.push(d.map((o: any) => `${o.k ?? o.kind ?? o.type},${Math.round(o.x - dx)},${Math.round(o.y - dy)}`).join(';'));
    }
    return { samples, heights, chunks, grass, decos, grassCount, decoCount };
  };
  let steppe: unknown = null, sea: unknown = null;
  if (S.n || S.s) {
    const pts: [number, number][] = [];
    for (let i = 0; i < 240; i++) pts.push([240000 + rnd() * 290000, -W.SEAM_DEPTH / 2 + (rnd() - 0.5) * 20000]);
    steppe = dump(pts, [[250, -58], [251, -58], [330, -55], [390, -59], [391, -59], [440, -60], [440, -61], [500, -62], [230, -56], [360, -57]]);
  }
  if (S.e || S.w) {
    s = 977; const mid = 600000 + W.SEA_DEPTH / 2, pts: [number, number][] = [];
    for (let i = 0; i < 240; i++) pts.push([mid + (rnd() - 0.5) * 20000, 92000 + rnd() * 236000]);
    sea = dump(pts, [[656, 100], [660, 130], [661, 130], [664, 177], [658, 210], [660, 211], [662, 260], [659, 300]]);
  }
  // 图边内外连续：紧贴图边的里外两点，地貌和高度相差很小
  let edgeJump = 0, edgeHeightJump = 0;
  const WW = T.W * W.WORLD_SCALE, HH = T.H * W.WORLD_SCALE;
  for (const side of ['n', 's', 'e', 'w'] as const) {
    if (!S[side]) continue;
    for (let i = 0; i < 60; i++) {
      const u = 5000 + i * ((side === 'n' || side === 's' ? WW : HH) - 10000) / 60;
      const at = (d: number): [number, number] => side === 'n' ? [u, -d] : side === 's' ? [u, HH + d] : side === 'w' ? [-d, u] : [WW + d, u];
      const a = T.sample(...at(-320)), b = T.sample(...at(30));
      edgeJump = Math.max(edgeJump, Math.abs(a.elev - b.elev), Math.abs(a.arid - b.arid), Math.abs(a.forest - b.forest), Math.abs(a.land - b.land) > 0.2 ? 1 : 0);
      edgeHeightJump = Math.max(edgeHeightJump, Math.abs(T.surfaceHeight(...at(-40)) - T.surfaceHeight(...at(40))));
    }
  }
  writeFileSync(arg('out')!, JSON.stringify({ frame: [dx, dy], steppe, sea, edgeJump, edgeHeightJump }));
}
