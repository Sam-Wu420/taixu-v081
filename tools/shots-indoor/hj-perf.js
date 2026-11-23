// 实测：站在画前 3 秒（画按 10 Hz 重画）的帧、自己走进画里那一段的帧、从画外之门走出来那一段的帧
(async () => {
  const g = window.__game, H = g.huajuan, mj = g.mijing, p = g.player, s = window.__hj.s, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const measure = () => { const f = []; let last = performance.now(), on = true; const tick = () => { const n = performance.now(); f.push(n - last); last = n; if (on) requestAnimationFrame(tick); }; requestAnimationFrame(tick); return () => { on = false; f.shift(); f.sort((a, b) => b - a); return { n: f.length, worst: +f[0].toFixed(1), p95: +f[Math.floor(f.length * 0.05)].toFixed(1), over50: f.filter((x) => x > 50).length, med: +f[Math.floor(f.length / 2)].toFixed(1) }; }; };
  await sleep(1500);
  let m = measure(); await sleep(3000); const idle = m(); const p0 = g.renderer.huajuanGl.stats.paints;
  m = measure(); g.setDestination(s.x, s.y - 30); for (let i = 0; i < 200 && !H.cur; i++) await sleep(30); g.setDestination(p.x + 60, p.y + 400); await sleep(2500); g.destination = null; const enter = m();
  const o = mj.floor.objs.find((q) => q.kind === 'exit' && q.room === 0);
  p.x = o.x + 380; p.y = o.y + 30; p.st.x = p.x; p.st.y = p.y; await sleep(800);
  m = measure(); const go = () => { if (!mj.active) return; g.setDestination(o.x, o.y); setTimeout(go, 100); }; go(); for (let i = 0; i < 300 && mj.active; i++) await sleep(30); g.setDestination(p.x, p.y + 400); await sleep(2500); g.destination = null; const exit = m();
  return { idle, paints3s: g.renderer.huajuanGl.stats.paints - p0, paintMs: g.renderer.huajuanGl.stats.paintMs, enter, exit, out: !mj.active };
})()
