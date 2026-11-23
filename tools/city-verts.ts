// 量城里各类构件拼出来的顶点数（网格大小、内存的来源）：npx tsx tools/city-verts.ts
import './env';
const { Terrain } = await import('../src/world/terrain');
const { LOCATIONS } = await import('../src/data/world');
const { getLayout, LOC_SCALE } = await import('../src/gfx/building');
const { ArchBuilder } = await import('../src/hd2d/arch');
const { PIECE_KINDS } = await import('../src/hd2d/pieceKinds');
await import('../src/hd2d/cityPieces');
const t = new Terrain(); for (const _ of t.buildSteps()) void _;
for (const id of ['jiayuan', 'yuejing']) {
  const l = LOCATIONS.find((q) => q.id === id)!, L = getLayout(l);
  const per: Record<string, [number, number, number]> = {};
  let total = 0; const t0 = performance.now();
  for (const p of L.pieces) {
    const f = PIECE_KINDS.get(p.kind); if (!f) continue;
    const B = new ArchBuilder(), a = performance.now();
    f({ builder: B, piece: p, layout: L, tier: 0, x: p.x * LOC_SCALE, y: 0, z: p.y * LOC_SCALE, pal: L.pal as any, groundAt: () => 0 });
    const q = per[p.kind] ?? (per[p.kind] = [0, 0, 0]); q[0]++; q[1] += B.vertexCount; q[2] += performance.now() - a; total += B.vertexCount;
  }
  console.log(`${id}: 顶点 ${total}（≈${(total * 44 / 1048576).toFixed(0)} MB Float32），拼全城 ${(performance.now() - t0).toFixed(0)} ms`);
  for (const [k, [n, v, ms]] of Object.entries(per).sort((a, b) => b[1][1] - a[1][1])) console.log(`  ${k.padEnd(10)} ×${n}  顶点 ${v}（每件 ${Math.round(v / n)}）  ${ms.toFixed(0)} ms`);
}
