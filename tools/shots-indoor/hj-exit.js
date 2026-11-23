// 画里：站到入口古阵（画外之门）东边门外，再自己走进阵心——云气渐浓；走到一半截一张
// （截图脚本为省时间，先把人放到门外 380 处；之后一路是自己走）
(async () => {
  const g = window.__game, mj = g.mijing, p = g.player, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const o = mj.floor.objs.find((q) => q.kind === 'exit' && q.room === 0);
  p.x = o.x + 380; p.y = o.y + 30; p.st.x = p.x; p.st.y = p.y; g.cam.x = p.x; g.cam.y = p.y;
  await sleep(600);
  const go = () => { if (!mj.active) return; g.setDestination(o.x, o.y); setTimeout(go, 100); };
  go();
  for (let i = 0; i < 200 && mj.veil < 0.6; i++) await sleep(25);
  window.__hjGo = false;
  return { veil: mj.veil, active: mj.active, armed: mj.armed, d: Math.hypot(p.x - o.x, p.y - o.y) };
})()
