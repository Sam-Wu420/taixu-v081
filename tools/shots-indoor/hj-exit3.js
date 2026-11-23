// 出来以后往外走（离开画）：云随着走远散开
(async () => { const g = window.__game, mj = g.mijing, p = g.player; g.setDestination(p.x + 60, p.y + 300); await new Promise((r) => setTimeout(r, 1500)); g.destination = null; return { veil: mj.veil, p: [p.x, p.y] }; })()
