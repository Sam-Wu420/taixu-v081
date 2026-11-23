// 浏览器内性能对比（开发服务器下）：页面打开 /?auto=new 进入游戏后，在控制台执行
//   const b = await import('/tools/bench-browser.ts'); await b.bench('crowd', 10)
// 场景：crowd 梁京来回走 / battle 刷 40 只妖兽混战 / travel 高空直飞赶路 / idle 原地站立（看自动存档与日结长帧）。
// 逐帧记录 update / render 的真实耗时（不受垂直同步影响）与 rAF 间隔（长帧），并附 __prof 分项前 12。
import { prof } from '../src/core/prof';
import { ENEMY_LIST } from '../src/data/enemies';

type Stat = { p50: number; p95: number; p99: number; max: number; avg: number };
const stat = (a: number[]): Stat => {
  const s = [...a].sort((x, y) => x - y), q = (f: number) => +s[Math.min(s.length - 1, Math.floor(s.length * f))].toFixed(2);
  return { p50: q(0.5), p95: q(0.95), p99: q(0.99), max: +s[s.length - 1].toFixed(2), avg: +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(2) };
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const loc = (id: string) => (window as any).__taixuLoc(id) as { x: number; y: number };

export async function bench(scene: 'crowd' | 'battle' | 'mob' | 'travel' | 'idle', secs = 10) {
  const g = (window as any).__game;
  if (!g?.renderer) throw new Error('先进入游戏（/?auto=new）');
  g.story.skipAll?.(); g.story.openT = -1; g.modal = null; g.emitModal?.();
  g.hero.realm = 3; g.hero.stage = 1;
  const l = loc('yuejing'), x0 = l.x * 300, y0 = l.y * 300 + 400;
  g.teleport(x0, y0); g.cam.zoom = g.cam.targetZoom = 0.8; g.player.flying = false;
  let tick: (() => void) | null = null;
  if (scene === 'crowd') tick = () => { const k = Math.floor(performance.now() / 3000) % 2 ? 1 : -1; g.destination = { x: x0 + k * 1500, y: y0 }; };
  if (scene === 'battle') {
    const pool = ENEMY_LIST.filter((d: any) => !d.boss && (d.realm ?? 1) <= 2).slice(0, 8).map((d: any) => d.id);
    g.debugSpawn(Array.from({ length: 40 }, (_, i) => pool[i % pool.length]), 2, 2, 380);
    tick = () => { g.combat.invulnT = 9; g.hero.hp = 1e9; g.hero.mp = 1e9; };
  }
  if (scene === 'mob') {   // 40 个人形修士混战：矢量人物最重的情形
    const pool = ENEMY_LIST.filter((d: any) => d.kind === 'human' && !d.boss).slice(0, 8).map((d: any) => d.id);
    g.debugSpawn(Array.from({ length: 40 }, (_, i) => pool[i % pool.length]), 2, 2, 420);
    tick = () => { g.combat.invulnT = 9; g.hero.hp = 1e9; g.hero.mp = 1e9; };
  }
  if (scene === 'travel') { g.player.flying = true; tick = () => { g.player.flying = true; g.destination = { x: x0 + 90000, y: y0 }; }; }
  if (scene === 'idle') { g.destination = null; tick = () => { g.saveTimer = Math.max(g.saveTimer, 0); }; }
  await sleep(1500);   // 预热：位图缓存、地形块
  const upd: number[] = [], ren: number[] = [], gap: number[] = [];
  const u0 = g.update, r0 = g.renderer.render;
  let tu = 0;
  // 慢 update 归因：这一帧里各 prof 分项的耗时（只在 update 超过 8ms 时留下）
  const fmap = new Map<string, number>(), slowUpd: { ms: number; top: [string, number][] }[] = [];
  const add0 = prof.add.bind(prof);
  (prof as any).add = (k: string, t0: number, n = 1) => { if (prof.on) fmap.set(k, (fmap.get(k) ?? 0) + performance.now() - t0); add0(k, t0, n); };
  g.update = function (dt: number) {
    fmap.clear(); const t = performance.now();
    try { return u0.call(this, dt); } finally {
      tu = performance.now() - t;
      if (tu > 8) slowUpd.push({ ms: +tu.toFixed(1), top: [...fmap].filter(([k]) => k.startsWith('U·')).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => [k, +v.toFixed(1)] as [string, number]) });
    }
  };
  g.renderer.render = function (dt: number) { const t = performance.now(); try { return r0.call(this, dt); } finally { upd.push(tu); ren.push(performance.now() - t); } };
  prof.on = true; prof.reset();
  g.showPerf = true;   // 打开 GL 舞台的 GPU 计时（timer query）
  // 长动画帧（Chrome LoAF）：把 prof 覆盖不到的长帧归因到具体脚本 / 布局 / 渲染
  const loaf: any[] = [];
  let po: PerformanceObserver | null = null;
  try {
    po = new PerformanceObserver((l) => { for (const e of l.getEntries() as any[]) loaf.push({
      dur: Math.round(e.duration), block: Math.round(e.blockingDuration ?? 0), render: Math.round(e.renderStart ? e.startTime + e.duration - e.renderStart : 0), style: Math.round(e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0),
      scripts: (e.scripts ?? []).map((s: any) => ({ ms: Math.round(s.duration), lay: Math.round(s.forcedStyleAndLayoutDuration ?? 0), inv: s.invoker, fn: s.sourceFunctionName, src: (s.sourceURL ?? '').split('/').slice(-1)[0] + ':' + (s.sourceCharPosition ?? '') , type: s.invokerType })).sort((a: any, b: any) => b.ms - a.ms).slice(0, 4),
    }); });
    po.observe({ type: 'long-animation-frame', buffered: false });
  } catch { /* 不支持 LoAF 的浏览器 */ }
  let last = performance.now(), live = true;
  const raf = () => { const t = performance.now(); gap.push(t - last); last = t; tick?.(); if (live) requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  await sleep(secs * 1000);
  live = false; po?.disconnect();
  g.update = u0; g.renderer.render = r0; (prof as any).add = add0;
  const top = prof.report(12), spikes = prof.spikes.slice(-5);
  prof.on = false;
  const frame = upd.map((u, i) => u + ren[i]);
  return {
    scene, frames: upd.length, fps: +(gap.length / secs).toFixed(1),
    cpuFrame: stat(frame), update: stat(upd), render: stat(ren), rafGap: stat(gap.slice(1)),
    longFrames: gap.filter((x) => x > 50).length, enemies: g.combat.enemies.length, npcActive: g.npcs.active.size,
    quality: g.renderer.qualityLevel, gl: !!g.renderer.stage, top, spikes,
    slowUpdate: slowUpd.slice(0, 6),
    gpu: g.renderer.stage ? { ms: +g.renderer.stage.gpuMs.toFixed(2), sec: Object.fromEntries(Object.entries(g.renderer.stage.gpuSec as Record<string, number>).map(([k, v]) => [k, +v.toFixed(2)])), px: `${g.renderer.stage.W}x${g.renderer.stage.H}` } : null,
    loaf: loaf.sort((a, b) => b.dur - a.dur).slice(0, 8),
    // 所有长帧里各脚本的强制布局合计（按来源）
    forcedLayout: Object.entries(loaf.flatMap((f) => f.scripts).reduce((m: Record<string, number>, s: any) => { if (s.lay) m[`${s.fn}@${s.src}`] = (m[`${s.fn}@${s.src}`] ?? 0) + s.lay; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6),
  };
}
