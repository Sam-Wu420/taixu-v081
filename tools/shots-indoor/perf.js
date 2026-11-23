// 实测进出一栋楼的帧：先站着量 3 秒（基线），再沿屋里的路走进去、站一会、走出来，量每一帧的间隔
(async () => {
  const g = window.__game, w = window.__indoor; if (!g || !w) return 'no';
  const I = g.indoor, r = w.room, P = w.plan, p = g.player;
  const toW = (x, z) => r.rot === 0 ? [r.ax + x, r.ay + z] : r.rot === 1 ? [r.ax + z, r.ay - x] : r.rot === 2 ? [r.ax - x, r.ay - z] : [r.ax - z, r.ay + x];
  const toL = (x, y) => { const dx = x - r.ax, dy = y - r.ay; return r.rot === 0 ? [dx, dy] : r.rot === 1 ? [-dy, dx] : r.rot === 2 ? [-dx, -dy] : [dy, -dx]; };
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const measure = async (ms) => { const f = []; let last = performance.now(), on = true; const tick = () => { const n = performance.now(); f.push(n - last); last = n; if (on) requestAnimationFrame(tick); }; requestAnimationFrame(tick); await sleep(ms); on = false; f.shift(); f.sort((a, b) => b - a); return { n: f.length, worst: +f[0].toFixed(1), p95: +f[Math.floor(f.length * 0.05)].toFixed(1), over50: f.filter((x) => x > 50).length, med: +f[Math.floor(f.length / 2)].toFixed(1) }; };
  const walk = async (to) => { const [lx, lz] = toL(p.x, p.y); const path = (I.route(r, lx, lz, to[0], to[1]) || [to]).map(([x, z]) => toW(x, z)); for (const q of path) { g.setDestination(q[0], q[1]); for (let i = 0; i < 100 && Math.hypot(q[0] - p.x, q[1] - p.y) > 26; i++) await sleep(50); } };
  await sleep(2000);
  const base = await measure(3000);
  const gl0 = { ...g.renderer.indoorGl?.stats };
  const inP = measure(9000);
  await walk([P.front.x, P.front.z]); await sleep(1500); await walk([0, r.plat + r.ramp + 80]);
  const io = await inP;
  return { base, io, build: g.renderer.indoorGl?.stats, gl0, inside: I.inside?.id ?? null, fade: I.fade };
})()
