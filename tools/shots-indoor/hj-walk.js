// 往画里走：目的地设在画脚下（游戏里点地前往的同一条路），等走到「铺了一半」
(async () => { const g = window.__game, s = window.__hj?.s; if (!s) return 'no'; g.setDestination(s.x, s.y - 30); for (let i = 0; i < 100 && g.huajuan.k < 0.5; i++) await new Promise((r) => setTimeout(r, 30)); g.destination = null; return { k: g.huajuan.k, cover: g.huajuan.cover }; })()
