(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), want = Number(new URLSearchParams(location.search).get('runs') ?? 3), t0 = performance.now();
  while ((window.__perfResults?.length ?? 0) < want && performance.now() - t0 < 400000) await sleep(1000);
  return (window.__perfResults ?? []).map((r) => ({ scene: r.scenario, valid: r.valid, fps: r.fps, frames: r.frames, p50: r.frameIntervalMs?.p50, p95: r.frameIntervalMs?.p95, max: r.frameIntervalMs?.max, avg: r.frameIntervalMs?.avg, over50: r.longFramesOver50ms,
    upd95: r.cpu?.updateMs?.p95, ren95: r.cpu?.renderSubmitMs?.p95, cpu95: r.cpu?.updateAndRenderMs?.p95, cpuAvg: r.cpu?.updateAndRenderMs?.avg, enemies: r.workload?.enemyLive?.avg, casts: r.workload?.successfulCasts }));
})()
