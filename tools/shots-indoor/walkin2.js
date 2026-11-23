// 走进去（同 walkin.js），并截「淡出中」：先按住溶解程度
(async () => {
  const g = window.__game, w = window.__indoor; if (!g || !w) return 'no';
  const I = g.indoor, r = w.room, P = w.plan, p = g.player, up = I.update.bind(I);
  I.update = (dt) => { up(dt); if (I.fade > 0.5) I.fade = 0.5; };
  window.__unhold = () => { I.update = up; };
  const toL = (x, y) => { const dx = x - r.ax, dy = y - r.ay; return r.rot === 0 ? [dx, dy] : r.rot === 1 ? [-dy, dx] : r.rot === 2 ? [-dx, -dy] : [dy, -dx]; };
  const toW = (x, z) => r.rot === 0 ? [r.ax + x, r.ay + z] : r.rot === 1 ? [r.ax + z, r.ay - x] : r.rot === 2 ? [r.ax - x, r.ay - z] : [r.ax - z, r.ay + x];
  const [lx, lz] = toL(p.x, p.y), path = (I.route(r, lx, lz, P.front.x, P.front.z) || [[P.front.x, P.front.z]]).map(([x, z]) => toW(x, z));
  window.__walk = path.slice();
  const go = () => { const q = window.__walk[0]; if (!q) return; if (Math.hypot(q[0] - p.x, q[1] - p.y) < 26) window.__walk.shift(); const n = window.__walk[0]; if (n) g.setDestination(n[0], n[1]); setTimeout(go, 80); };
  go();
  for (let i = 0; i < 80 && !I.inside; i++) await new Promise((res) => setTimeout(res, 40));
  await new Promise((res) => setTimeout(res, 380));
  return { inside: I.inside?.id, fade: I.fade };
})()
