// 礁石滩上几个体修连着打、碎块乱飞时每帧的耗时（try=brawl&at=rocks，不加 calm）：
// 先静置 4 息量一次（只有礁石、没开打），再让你每 0.7 息把最近的对手一记崩山轰向礁石、连打 10 息量一次。
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 400 && !window.__brawlReady; i++) await sleep(100);
  const g = window.__game, B = g.combat.brawl, p = g.player;
  const sample = async (sec) => {
    const ts = []; let last = performance.now(), run = true;
    const tick = () => { if (!run) return; const t = performance.now(); ts.push(t - last); last = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick); await sleep(sec * 1000); run = false;
    ts.sort((a, b) => a - b);
    const avg = ts.reduce((a, b) => a + b, 0) / ts.length;
    return { frames: ts.length, avgMs: +avg.toFixed(1), p95Ms: +ts[Math.floor(ts.length * 0.95)].toFixed(1), worstMs: +ts[ts.length - 1].toFixed(1) };
  };
  g.hero.hp = 1;
  const calm = await sample(4);
  let hits = 0, run = true;
  (async () => { while (run) { g.hero.hp = 1; g.hero.mp = 1; g.combat.cds.clear();
    const e = g.combat.enemies.filter((x) => !x.dead).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (e) { if (Math.hypot(e.x - p.x, e.y - p.y) > 300) { e.x = p.x + 110; e.y = p.y; } const b = B.body(e); b.poise = 0; b.breakT = 1.5; const rk = B.brk.rocks[hits % Math.max(1, B.brk.rocks.length)]; if (rk) { g.input.mouse.active = true; g.input.mouse.x = rk.x; g.input.mouse.y = rk.y; g.input.mouse.t = g.time; } B.heavy(false); hits++; }
    await sleep(700); } })();
  const fight = await sample(10);
  run = false;
  return { calm, fight, hits, smashed: B.brk.smashed, rocksLeft: B.brk.n, gibs: g.combat.gore.gibCount, ghosts: B.ghosts.length, enemies: g.combat.enemies.length };
})()
