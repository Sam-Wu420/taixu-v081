// 接着往里走，走进画里；进去以后往前再走几步（画像墨迹一样散开）
(async () => { const g = window.__game, s = window.__hj?.s; g.setDestination(s.x, s.y - 30); for (let i = 0; i < 100 && !g.huajuan.cur; i++) await new Promise((r) => setTimeout(r, 30)); const p = g.player; window.__hjIn = { x: p.x, y: p.y }; g.destination = null; return { cur: g.huajuan.cur?.id, cover: g.huajuan.cover, mj: g.mijing.active }; })()
