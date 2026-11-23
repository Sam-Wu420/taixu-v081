// 性能：从出拳到在界内再打中对手，逐帧记耗时（try=voidfall；同图落点，不换图）
const xk = g.xukong, V = xk.fall, e = W.e;
await sleep(2500);
const ts = []; let last = performance.now(), run = true, mark = {};
const tick = () => { if (!run) return; const t = performance.now(); ts.push([t - last, xk.phase + (xk.warming ? 'W' : '') + (xk.fight.handed ? 'H' : '') + '#' + ts.length + 'h' + Math.round(xk.h)]); last = t; requestAnimationFrame(tick); };
requestAnimationFrame(tick);
g.combat.cds.clear(); g.hero.mp = 1;
B.heavy(true);
await until(() => V.mode === 'meteor', 2000); mark.punch = ts.length;
await sleep(300);
B.key('dodge', false);
await until(() => xk.phase === 'none', 12000); mark.world = ts.length;
await until(() => !B.isAir(e), 3000);
const hp0 = e.hp; g.combat.cds.clear(); g.combat.lock = e;
for (let i = 0; i < 6 && e.hp >= hp0; i++) { B.pursue(); if (!B.mv) B.heavy(false); await sleep(450); }
mark.hit = ts.length; run = false;
const d = ts.slice(mark.punch).map((q) => q[0]);
const sorted = [...d].sort((a, b) => a - b);
const over = ts.slice(mark.punch).filter((q) => q[0] > 50).map((q) => q[1] + ':' + q[0].toFixed(0));
return { frames: d.length, avg: +(d.reduce((a, b) => a + b, 0) / d.length).toFixed(1), p95: +sorted[Math.floor(d.length * 0.95)].toFixed(1), worst: +sorted[d.length - 1].toFixed(1), over50: over, hitOk: e.hp < hp0, mark };
