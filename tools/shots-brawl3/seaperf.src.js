// 性能：海面上空连续把人从御剑高度砸进海里（大水柱、浪环、V 形水墙）10 息，逐帧记耗时
const d = W.dummy; g.combat.enemies = g.combat.enemies.filter((q) => q === d);
p.flying = true; p.z = p.zTarget = 420; g.setZoom(0.7);
await sleep(800);
const ts = []; let last = performance.now(), run = true;
const tick = () => { if (!run) return; const t = performance.now(); ts.push(t - last); last = t; requestAnimationFrame(tick); };
requestAnimationFrame(tick);
let n = 0;
const t0 = performance.now();
while (performance.now() - t0 < 10000) {
  const b = B.body(d); B.clear(d); b.subT = 0; d.hideT = 0; d.x = p.x + 110; d.y = p.y + 4; d.flyH = 420; b.poise = 0; b.breakT = 30; g.combat.cds.clear(); g.combat.lock = d; g.hero.mp = 1; g.hero.hp = 1;
  B.heavy(true); n++;
  await sleep(500);
  if (n % 2 === 0) { B.pursue(); }
  await sleep(700);
}
run = false;
const s = [...ts].sort((a, b) => a - b);
return { slams: n, frames: ts.length, avg: +(ts.reduce((a, b) => a + b, 0) / ts.length).toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), worst: +s[s.length - 1].toFixed(1), over50: ts.filter((x) => x > 50).length, particles: fx.count };
