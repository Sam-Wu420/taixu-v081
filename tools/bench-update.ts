// P10 收尾：无界面下每帧 Game.update 的耗时（不画），按分项列出。用来查 NPC 更新里新加的东西有没有每帧线性扫描。
// 用法: TSX_DISABLE_CACHE=1 npx tsx tools/bench-update.ts [地点=yuejing,jiayuan,huangfeng] [帧数=1800] [sit]
//   walk：主角在原地左右来回走 1500（同 tools/bench.ts 的 crowd 场景，身边的 NPC 跟着刷新）
//   sit：主角打坐（光阴流转加快，日结算分帧在跑——和 tools/bench.ts 的 daily 场景一样）
//   每处：传送到地点（宗门传到山门广场），先空跑 300 帧暖身，再量 N 帧；Math.random 固定种子，结果可比。
import './env';
const seed = (s: number) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = seed(20261114);
const store = new Map<string, string>();
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { LOCATIONS, WORLD_SCALE } = await import('../src/data/world');
// 老版本（还没有占山宗门）没有 sectPlan：当作没有规划
const grandSectPlan: (l: unknown) => { spawn: { x: number; y: number } } | null = await import('../src/data/sectPlan').then((m) => m.grandSectPlan as never, () => () => null);
const { prof } = await import('../src/core/prof');

const where = (process.argv[2] || 'yuejing,jiayuan,huangfeng').split(','), N = Number(process.argv[3] || 1800), SIT = process.argv.includes('sit'), WALK = process.argv.includes('walk');
const terrain = new Terrain(); terrain.build();
for (const id of where) {
  const g: any = new Game(terrain);
  const l = LOCATIONS.find((q) => q.id === id)!, P = grandSectPlan(l);
  const x = l.x * WORLD_SCALE + (P ? P.spawn.x : 0), y = l.y * WORLD_SCALE + (P ? P.spawn.y : 400);
  g.hero.realm = 3; g.hero.stage = 1; g.teleport(x, y); g.day = 400; g.clock = 0.45 * 240;
  g.paused = false; g.story.skipAll?.(); g.story.openT = -1; g.modal = null;
  for (let i = 0; i < 300; i++) { g.update(1 / 60); if (g.modal) g.closeModal?.(true); }
  const ms: number[] = [];
  prof.on = true; prof.reset();
  for (let i = 0; i < N; i++) {
    if (SIT) g.player.sitting = true;
    if (WALK) { const k = Math.floor(i / 150) % 2 ? 1 : -1; g.destination = { x: x + k * 1500, y }; }
    const t0 = performance.now(); g.update(1 / 60); const d = performance.now() - t0;
    ms.push(d); prof.endFrame(d); if (g.modal) g.closeModal?.(true);
  }
  prof.on = false;
  const s = [...ms].sort((a, b) => a - b), avg = ms.reduce((a, b) => a + b, 0) / ms.length;
  const top = prof.report(10).filter((r) => r.k.startsWith('U·')).map((r) => `${r.k} ${r.ms}`).join(' · ');
  console.log(`[${id}] update 平均 ${avg.toFixed(3)} p50 ${s[s.length >> 1].toFixed(3)} p95 ${s[Math.floor(s.length * 0.95)].toFixed(3)} max ${s[s.length - 1].toFixed(2)} ms  NPC 活跃 ${g.npcs.active.size} / ${g.npcs.list.length}`);
  console.log('    ' + top);
}
