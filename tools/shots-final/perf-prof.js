(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), t0 = performance.now();
  while ((window.__perfResults?.length ?? 0) < 1 && performance.now() - t0 < 300000) await sleep(1000);
  const r = (window.__perfResults ?? [])[0]; if (!r) return null;
  return { avg: r.frameIntervalMs?.avg, p95: r.frameIntervalMs?.p95, upd: r.cpu?.updateMs, ren: r.cpu?.renderSubmitMs, q: window.__game?.renderer?.qualityLevel, top: (r.profiler?.top ?? []).slice(0, 22).map((t) => JSON.stringify(t).slice(0, 110)) };
})()
