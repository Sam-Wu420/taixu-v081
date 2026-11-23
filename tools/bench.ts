// 优化基线 / 对比：四个固定场景，Math.random 固定种子，逐帧记录 update 与 render（Skia CPU）耗时。
// 用法: npx tsx tools/bench.ts [label=run] [scenes=crowd,battle,daily,travel]
//   结果写入 tools/out/bench-<label>.json，并打印摘要。render 只作相对比较：浏览器里是 GPU 画布，绝对值不同。
import { createCanvas } from './env';
import { mkdirSync, writeFileSync } from 'fs';

const seed = (s: number) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = seed(20261112);
const CW = 1280, CH = 800;
const store = new Map<string, string>();
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
(globalThis as any).sessionStorage = (globalThis as any).localStorage;

const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Renderer } = await import('../src/world/render');
const { LOCATIONS, WORLD_SCALE } = await import('../src/data/world');
const { ENEMY_LIST } = await import('../src/data/enemies');
const { sprites } = await import('../src/gfx/sprites');
const { prof } = await import('../src/core/prof');

const label = process.argv[2] || 'run';
const scenes = (process.argv[3] || 'crowd,battle,daily,travel').split(',');
const terrain = new Terrain(); terrain.build();

type Stat = { p50: number; p95: number; max: number; avg: number };
const stat = (a: number[]): Stat => { const s = [...a].sort((x, y) => x - y); const q = (f: number) => +s[Math.min(s.length - 1, Math.floor(s.length * f))].toFixed(2); return { p50: q(0.5), p95: q(0.95), max: +s[s.length - 1].toFixed(2), avg: +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(2) }; };

function freshGame(loc: string) {
  const g: any = new Game(terrain);
  const l = LOCATIONS.find((q) => q.id === loc)!;
  g.hero.realm = 3; g.hero.stage = 1;
  g.teleport(l.x * WORLD_SCALE, l.y * WORLD_SCALE + 400);
  g.cam.zoom = g.cam.targetZoom = 0.8; g.day = 400; g.clock = 0.45 * 240;
  const cv: any = createCanvas(CW, CH);
  cv.clientWidth = CW; cv.clientHeight = CH; cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: CW, height: CH });
  g.canvas = cv;
  try { g.renderer = new Renderer(g, cv); } catch { /* Node 下 WebGL stage 不可用，Renderer 构造内部已降级 */ }
  g.paused = false; g.story.skipAll?.(); g.story.openT = -1; g.modal = null;
  sprites.frameMs = 1e9; (sprites as any).unlimited = true;
  for (let i = 0; i < 30; i++) { g.update(1 / 60); g.renderer.render(1 / 60); }
  (sprites as any).unlimited = false; sprites.frameMs = 7;
  return g;
}

function run(g: any, frames: number, each: (i: number) => void, render = true) {
  const upd: number[] = [], ren: number[] = [];
  prof.on = true; prof.reset();
  for (let i = 0; i < frames; i++) {
    each(i);
    const t0 = performance.now(); g.update(1 / 60);
    const t1 = performance.now(); if (render) g.renderer.render(1 / 60);
    const t2 = performance.now();
    upd.push(t1 - t0); ren.push(t2 - t1); prof.endFrame(t2 - t0);
  }
  const top = prof.report(14).filter((r) => r.k.startsWith('U·') || r.ms > 0.3);
  prof.on = false;
  return { update: stat(upd), render: render ? stat(ren) : null, top, spikes: prof.spikes.slice(-4) };
}

const out: Record<string, unknown> = { label, at: new Date().toISOString() };

if (scenes.includes('crowd')) {
  const g = freshGame('yuejing'), x0 = g.player.x, y0 = g.player.y;
  out.crowd = { ...run(g, 600, (i) => { const k = Math.floor(i / 150) % 2 ? 1 : -1; g.destination = { x: x0 + k * 1500, y: y0 }; }), npcActive: g.npcs.active.size };
}

if (scenes.includes('battle')) {
  const g = freshGame('yuejing');
  const pool = ENEMY_LIST.filter((d: any) => !d.boss && (d.realm ?? 1) <= 2).slice(0, 8).map((d: any) => d.id);
  const ids = Array.from({ length: 40 }, (_, i) => pool[i % pool.length]);
  g.debugSpawn(ids, 2, 2, 380);
  g.hero.hp = 1e9;
  out.battle = { ...run(g, 600, () => { g.combat.invulnT = 9; g.hero.hp = 1e9; g.hero.mp = 1e9; }), enemies: g.combat.enemies.length, pool };
}

if (scenes.includes('daily')) {
  const g = freshGame('yuejing');
  // 闭关加速：让日结频繁触发；不画，只看逻辑长帧
  g.player.sitting = true;
  const r = run(g, 900, () => { g.player.sitting = true; }, false);
  const saveMs: number[] = [], uiMs: number[] = [];
  for (let i = 0; i < 8; i++) { const t = performance.now(); g.save(0); saveMs.push(performance.now() - t); }
  for (let i = 0; i < 200; i++) { const t = performance.now(); g.updateUI(); uiMs.push(performance.now() - t); }
  const npcDaily: number[] = [];
  for (let i = 0; i < 20; i++) { const t = performance.now(); g.npcs.daily(0.5); npcDaily.push(performance.now() - t); }
  out.daily = { ...r, save: stat(saveMs), saveBytes: (store.get('taixu_save_auto') ?? '').length, updateUI: stat(uiMs), npcDaily: stat(npcDaily), npcs: g.npcs.list.length, days: +g.day.toFixed(1) };
}

if (scenes.includes('travel')) {
  const g = freshGame('yuejing');
  g.player.flying = true;
  const x0 = g.player.x, y0 = g.player.y;
  out.travel = { ...run(g, 600, (i) => { g.player.flying = true; g.destination = { x: x0 + 60000, y: y0 + (i % 2) }; }), moved: Math.round(Math.hypot(g.player.x - x0, g.player.y - y0)) };
}

mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
writeFileSync(new URL(`./out/bench-${label}.json`, import.meta.url), JSON.stringify(out, null, 1));
for (const s of scenes) {
  const r: any = out[s]; if (!r) continue;
  console.log(`[${s}] update p50=${r.update.p50} p95=${r.update.p95} max=${r.update.max}` + (r.render ? ` | render p50=${r.render.p50} p95=${r.render.p95} max=${r.render.max}` : ''));
  if (s === 'daily') console.log(`        save p50=${r.save.p50} max=${r.save.max} (${(r.saveBytes / 1024).toFixed(0)} KB)  updateUI p50=${r.updateUI.p50} max=${r.updateUI.max}  npcs.daily p50=${r.npcDaily.p50} max=${r.npcDaily.max} (${r.npcs} NPC)`);
  console.log('        ' + r.top.slice(0, 8).map((t: any) => `${t.k} ${t.ms}`).join(' · '));
}
