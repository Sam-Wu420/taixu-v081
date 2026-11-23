(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isTry = location.pathname.includes('perf-acceptance'), t0 = performance.now();
  // 试玩入口摆好场面后会把性能面板藏起来——以它为就绪标记；真实游戏页等 __game（标题页没有，等 12 秒就拍）
  const ready = () => isTry ? (!!window.__game && getComputedStyle(document.querySelector('#perf-panel') ?? document.body).display === 'none') : !!window.__game;
  if (!window.__probed) { const lim = isTry ? 150000 : 12000; while (!ready() && performance.now() - t0 < lim) await sleep(500); if (ready()) await sleep(isTry ? 6000 : 4000); window.__probed = true; }
  const g = window.__game; if (!g) return { game: false, title: !!document.querySelector('.title-menu'), waited: Math.round((performance.now() - t0) / 1000) };
  const t = (f) => { try { return f(); } catch { return 'x'; } };
  return { game: true, ready: ready(), waited: Math.round((performance.now() - t0) / 1000), modal: t(() => g.modal?.kind ?? null), mj: t(() => !!g.mijing?.active), indoor: t(() => !!g.indoor?.inside),
    off: t(() => !!g.offWorld), foes: t(() => g.combat?.enemies?.length ?? null), dead: t(() => !!g.hero?.dead), fly: t(() => !!g.isFlying),
    over: t(() => document.documentElement.scrollWidth > innerWidth + 1) };
})()
