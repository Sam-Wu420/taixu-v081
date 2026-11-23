// 浏览器内单项计时：存档、界面刷新、各日结。用法同 bench-browser：(await import('/tools/bench-probe.ts')).probe()
const stat = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return { p50: +s[s.length >> 1].toFixed(2), max: +s[s.length - 1].toFixed(2) }; };
function time(n: number, f: () => void) { const r: number[] = []; for (let i = 0; i < n; i++) { const t = performance.now(); f(); r.push(performance.now() - t); } return stat(r); }

export function probe() {
  const g = (window as any).__game;
  const out: Record<string, unknown> = {};
  out.save = time(6, () => g.save(0));
  out.saveKB = Math.round((localStorage.getItem('taixu_save_auto') ?? '').length / 1024);
  out.stringify = time(6, () => JSON.stringify({ hero: g.hero, world: g.ws, npcs: g.npcs.toSave(), nodes: g.nodes.toSave() }));
  out.npcsToSave = time(6, () => g.npcs.toSave());
  out.updateUI = time(50, () => g.updateUI());
  for (const k of ['rel', 'jianghu', 'roster', 'garrison', 'war', 'orig', 'daoxin', 'pianju', 'friends', 'mijing']) if (g[k]?.daily) out['daily.' + k] = time(6, () => g[k].daily(0.5));
  out['daily.living(1)'] = time(8, () => g.living.daily(1));
  const lv = g.living; g.living = null;
  out['daily.npcs-only(1)'] = time(8, () => g.npcs.daily(1));
  g.living = lv;
  out['daily.npcs(1)'] = time(8, () => g.npcs.daily(1));
  // 逐次记录，看长尾是不是周期性的
  out['daily.npcs seq'] = Array.from({ length: 12 }, () => { const t = performance.now(); g.npcs.daily(1); return +(performance.now() - t).toFixed(1); });
  return out;
}
