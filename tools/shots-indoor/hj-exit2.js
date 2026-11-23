// 接着走进阵心：云气遮满时回到画前（云还裹着）
(async () => {
  const g = window.__game, mj = g.mijing, p = g.player, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 200 && mj.active; i++) await sleep(30);
  g.destination = null; await sleep(150);
  return { active: mj.active, veil: mj.veil, hj: g.huajuan.cur?.id ?? null, p: [p.x, p.y] };
})()
