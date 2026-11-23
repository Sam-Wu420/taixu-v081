(async () => { const g = window.__game, mj = g.mijing, p = g.player, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const o = mj.floor.objs.find((q) => q.kind === 'exit' && q.room === 0); const out = [];
  out.push({ d0: Math.hypot(p.x - o.x, p.y - o.y), armed: mj.armed, quiet: mj.quiet });
  g.setDestination(o.x + 430, o.y + 60); for (let i = 0; i < 120 && Math.hypot(p.x - o.x, p.y - o.y) < 400; i++) await sleep(50);
  out.push({ d1: Math.hypot(p.x - o.x, p.y - o.y), dest: g.destination, armed: mj.armed, quiet: mj.quiet, walk: mj.walk(o.x + 430, o.y + 60) });
  return out; })()
