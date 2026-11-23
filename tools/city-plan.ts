// 城池新布局的平面示意图（俯视、按布局数据画：地面铺装、碰撞块、构件位置），看整座城的格局用：
//   npx tsx tools/city-plan.ts [输出目录]   → <目录>/plan_jiayuan.png、plan_yuejing.png
// 游戏里最远只能拉到 0.22 倍，一屏看不全国都；这张图是示意，不是游戏画面。
import './env';
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'tools/out';
mkdirSync(out, { recursive: true });
const { Terrain } = await import('../src/world/terrain');
const { LOCATIONS, WORLD_SCALE } = await import('../src/data/world');
const { getLayout, LOC_SCALE } = await import('../src/gfx/building');
const t = new Terrain(); for (const _ of t.buildSteps()) void _;
const COL: Record<number, string> = { 0: '#d9cfb4', 1: '#a9a294', 2: '#b8b0a0', 3: '#c2bcb0', 4: '#e6dfcd', 5: '#cfc7b4', 6: '#7fa8ae', 7: '#9cb486', 8: '#d8c79c', 9: '#ddd2bc', 10: '#f0ece2', 11: '#e2dccf', 12: '#cfc2a0', 13: '#a7bb7c' };
const PC: Record<string, string> = { ccourt: '#5a6068', cshop: '#a8603a', chall: '#8a2e24', cwall: '#5a5650', cgate: '#3a2a20', ctower: '#3a2a20', cpagoda: '#6a4a8a', tree: '#4a7a3a', ckit: '#c89a3a', cbridge: '#f0f0f0', chouse: '#6a6a60' };
for (const id of ['jiayuan', 'yuejing']) {
  const l = LOCATIONS.find((q) => q.id === id)!, L = getLayout(l) as ReturnType<typeof getLayout> & { cityInfo?: { extent: { x0: number; y0: number; x1: number; y1: number } } };
  const e = L.cityInfo!.extent, S = LOC_SCALE, px = 2400 / (e.x1 - e.x0), W = 2400, H = Math.ceil((e.y1 - e.y0) * px);
  const c = createCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#8fa070'; g.fillRect(0, 0, W, H);
  // 天然水面（地形）
  const ox = l.x * WORLD_SCALE, oy = l.y * WORLD_SCALE;
  g.fillStyle = '#6f98a0';
  for (let y = e.y0; y < e.y1; y += 100) for (let x = e.x0; x < e.x1; x += 100) if (!t.isLand(ox + x, oy + y) || t.riverEdge(ox + x, oy + y) < 0) g.fillRect((x - e.x0) * px, (y - e.y0) * px, 100 * px + 1, 100 * px + 1);
  const X = (x: number) => (x * S - e.x0) * px, Y = (y: number) => (y * S - e.y0) * px;
  for (const it of L.ground) {
    if (it.kind !== 'cg') continue;
    g.fillStyle = COL[it.p!.t] ?? '#ccc';
    if (it.p!.o) { g.beginPath(); g.ellipse(X(it.x), Y(it.y), it.w * S * px / 2, it.h * S * px / 2, 0, 0, Math.PI * 2); g.fill(); }
    else g.fillRect(X(it.x - it.w / 2), Y(it.y - it.h / 2), it.w * S * px, it.h * S * px);
  }
  g.fillStyle = 'rgba(70,64,58,0.55)';
  for (const b of L.blocks) g.fillRect(X(b.x), Y(b.y), b.w * S * px, b.h * S * px);
  for (const p of L.pieces) { g.fillStyle = PC[p.kind] ?? '#222'; g.fillRect(X(p.x) - 2, Y(p.y) - 2, 4, 4); }
  g.strokeStyle = 'rgba(200,40,40,0.5)'; g.lineWidth = 1;
  const P = L.nav!.pts;
  for (let i = 0; i < L.nav!.adj.length; i++) for (const j of L.nav!.adj[i]) if (j > i) { g.beginPath(); g.moveTo(X(P[i * 2]), Y(P[i * 2 + 1])); g.lineTo(X(P[j * 2]), Y(P[j * 2 + 1])); g.stroke(); }
  g.fillStyle = '#000'; g.font = '28px sans-serif'; g.fillText(`${id} plan  ${Math.round(e.x1 - e.x0)} x ${Math.round(e.y1 - e.y0)} world units   grey = collision, red = pedestrian nav`, 20, 40);   // 画布里没有中文字体，标题用英文
  writeFileSync(join(out, `plan_${id}.png`), c.toBuffer('image/png'));
  console.log('写出', join(out, `plan_${id}.png`));
}
