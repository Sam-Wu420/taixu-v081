import type { Game } from '../src/world/game';
import { LOC_BY_ID, WORLD_SCALE, WORLD_W, WORLD_H } from '../src/data/world';
import { prof } from '../src/core/prof';
import * as C from '../src/world/cultivation';
import { Enemy } from '../src/world/combat';
import { ENEMIES } from '../src/data/enemies';
import { Flock, Flier } from '../src/world/life';
import { tryBrawl } from './try-brawl';
import { tryWubian } from './try-wubian';

type Scenario = 'crowd' | 'battle' | 'travel' | 'daily' | 'zoom';
type WindowWithGame = Window & { __game?: Game };
type HeapPerformance = Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } };
type Stats = { p50: number; p95: number; max: number; avg: number } | null;
interface TimerExtension { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }
interface Point { x: number; y: number }

const names: Record<Scenario, string> = { crowd: '梁京来回', battle: '40 敌连续施法', travel: '长途飞行', daily: '跨日与自动存档', zoom: '缩放扫描与飞行升降' };
const params = new URLSearchParams(location.search);
// 浏览器面板不在前台时 rAF 会被降到约 1 Hz，测不出东西。?drive=free 改用 MessageChannel 连续驱动帧：
// 此时「帧间隔」是每帧 CPU 更新加提交的实际耗时，不含等待显示，适合前后对比，不代表玩家看到的帧率。
const freeDrive = params.get('drive') === 'free';
// 几个无头浏览器同时跑（多条线一起截图）时，无头页面偶尔被判成「在后台」、计时整场暂停、结果为空。
// &nohide=1 把页面当成始终在前台（只给自动化用；配合 drive=free 帧照常推进）
if (params.get('nohide') === '1') { Object.defineProperty(document, 'hidden', { get: () => false }); Object.defineProperty(document, 'visibilityState', { get: () => 'visible' }); }
if (freeDrive) {
  const channel = new MessageChannel(), queue = new Map<number, FrameRequestCallback>();
  let id = 0, pending = false;
  channel.port1.onmessage = () => {
    pending = false;
    const callbacks = [...queue.values()]; queue.clear();
    const time = performance.now();
    for (const callback of callbacks) callback(time);
  };
  window.requestAnimationFrame = callback => {
    queue.set(++id, callback);
    if (!pending) { pending = true; channel.port2.postMessage(0); }
    return id;
  };
  window.cancelAnimationFrame = handle => { queue.delete(handle); };
}
const numberParam = (key: string, fallback: number, min: number, max: number) => {
  const raw = params.get(key);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
};
const seconds = numberParam('seconds', 60, 1, 600);
const repeats = Math.floor(numberParam('runs', 3, 1, 10));
const warmup = numberParam('warmup', 5, 0, 120);
const get = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少界面元素 ${id}`);
  return node as T;
};
const status = get<HTMLElement>('perf-status'), resultNode = get<HTMLElement>('perf-results');
const config = get<HTMLElement>('perf-config');
const runAll = get<HTMLButtonElement>('run-all'), stop = get<HTMLButtonElement>('stop');
const download = get<HTMLButtonElement>('download'), copy = get<HTMLButtonElement>('copy');
const scenarioButtons: Record<Scenario, HTMLButtonElement> = {
  crowd: get('run-crowd'), battle: get('run-battle'), travel: get('run-travel'), daily: get('run-daily'), zoom: get('run-zoom'),
};
config.textContent = `预热 ${warmup} 秒，每场 ${seconds} 秒 × ${repeats} 次；浏览器窗口 ${innerWidth}×${innerHeight}。`;
const results: unknown[] = [];
let stopped = false, busy = false, game: Game;

function stats(values: readonly number[]): Stats {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rounded = (v: number) => Math.round(v * 100) / 100;
  const at = (q: number) => rounded(sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))]);
  return { p50: at(0.5), p95: at(0.95), max: rounded(sorted[sorted.length - 1]), avg: rounded(sorted.reduce((sum, n) => sum + n, 0) / sorted.length) };
}
function heap() {
  const m = (performance as HeapPerformance).memory;
  return m ? { used: m.usedJSHeapSize, total: m.totalJSHeapSize, limit: m.jsHeapSizeLimit } : null;
}
function showResults() {
  resultNode.textContent = JSON.stringify(results, null, 2);
  download.disabled = copy.disabled = results.length === 0;
}
function buttons() {
  runAll.disabled = busy;
  for (const button of Object.values(scenarioButtons)) button.disabled = busy;
  stop.disabled = !busy;
}
function wait(ms: number) { return new Promise<void>(resolve => setTimeout(resolve, ms)); }

function cityRoute(g: Game): Point[] {
  const city = LOC_BY_ID.get('yuejing');
  if (!city) throw new Error('当前地图没有梁京');
  const x = city.x * WORLD_SCALE, y = city.y * WORLD_SCALE;
  // 南荒放大、梁京改成成片街坊以后，原来那段官道的起点落在城墙上，人原地不动（验收一直无效）：
  // 先在城里找一条直街——从城中心沿几个方向每 250 一步，取最长的一段「站得住、两点之间走得通」的连续点
  let street: Point[] = [];
  for (const [ux, uy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [0.7, 0.7], [-0.7, 0.7]]) {
    let run: Point[] = [];
    for (let d = 1200; d <= 9000; d += 250) {
      const p = { x: x + ux * d, y: y + uy * d }, last = run[run.length - 1];
      g.space.update(1, p.x, p.y);
      const ok = g.terrain.walkFactor(p.x, p.y) > 0 && !g.space.blocked(p.x, p.y) && (!last || g.terrain.canTraverse(last.x, last.y, p.x, p.y) && !g.space.blocked((last.x + p.x) / 2, (last.y + p.y) / 2));
      if (ok) run.push(p); else { if (run.length > street.length) street = run; run = []; }
    }
    if (run.length > street.length) street = run;
  }
  if (street.length >= 8) return street;
  for (const road of g.terrain.roads) {
    const points = road.pts.map(([px, py]) => ({ x: px * WORLD_SCALE, y: py * WORLD_SCALE }));
    const first = Math.hypot(points[0].x - x, points[0].y - y);
    const last = Math.hypot(points[points.length - 1].x - x, points[points.length - 1].y - y);
    if (Math.min(first, last) > WORLD_SCALE * 1.3) continue;
    if (last < first) points.reverse();
    const path = points.filter(p => { const d = Math.hypot(p.x - x, p.y - y); return d >= 1600 && d <= 6500; });
    if (path.length > 4 && path.every(p => g.terrain.walkFactor(p.x, p.y) > 0)) return path;
  }
  throw new Error('没有找到梁京附近可用道路');
}

function battleSite(g: Game): Point {
  const city = LOC_BY_ID.get('yuejing');
  if (!city) throw new Error('当前地图没有梁京');
  const x = city.x * WORLD_SCALE, y = city.y * WORLD_SCALE;
  // 南荒放大后梁京的城圈宽两三万：原来 5000–11000 的一圈全落在城的安全区里，找不到战场（验收直接失败），放宽到 40000
  for (let radius = 5000; radius <= 40000; radius += 1000) for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8, px = x + Math.cos(angle) * radius, py = y + Math.sin(angle) * radius;
    if (g.combat.safeAt(px, py)) continue;
    let land = true;
    for (let j = 0; j < 8; j++) if (g.terrain.walkFactor(px + Math.cos(j * Math.PI / 4) * 450, py + Math.sin(j * Math.PI / 4) * 270) <= 0) land = false;
    if (land && g.terrain.walkFactor(px, py) > 0) return { x: px, y: py };
  }
  throw new Error('没有找到梁京附近的陆地战场');
}

function prepare(g: Game, scene: Scenario) {
  g.reset();
  g.story['skipAll']();
  g.story['openT'] = -1;
  g.closeModal(true); g.paused = false; g.debugFixedDt = 0;
  g.hero.realm = 2; g.hero.stage = 1; g.hero.hp = 1; g.hero.mp = 1;
  if (!Object.values(g.stats).every(Number.isFinite)) throw new Error('测试角色派生数值无效');
  g.cam.zoom = g.cam.targetZoom = 0.8;
  g.input.keys.clear(); g.input.joy.x = g.input.joy.y = 0; g.input.run = false;
  const city = LOC_BY_ID.get('yuejing');
  if (!city) throw new Error('当前地图没有梁京');
  const center = { x: city.x * WORLD_SCALE, y: city.y * WORLD_SCALE };
  let route: Point[] = [];
  if (scene === 'crowd') { route = cityRoute(g); g.teleport(route[0].x, route[0].y); }
  else if (scene === 'battle') { const p = battleSite(g); g.teleport(p.x, p.y); }
  else { g.teleport(center.x, center.y + 400); }
  if (scene === 'travel') { g.player.flying = true; g.input.run = true; }
  if (scene === 'daily') { g.player.sitting = true; g.destination = null; }
  if (scene === 'battle') {
    for (const id of ['huodan', 'bingzhui', 'huoshe', 'fengren']) if (!g.hero.arts.some(art => art.id === id)) g.hero.arts.push({ id, xp: 0 });
  }
  return { route, center };
}

function gpuTimer(g: Game) {
  const hd = g.renderer.hd;
  if (!hd) return { supported: false, renderer: null as string | null, samples: [] as number[], finish() {} };
  const gl = hd.gl.getContext();
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = String(debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  const samples: number[] = [], pending: WebGLQuery[] = [];
  const original = hd.render;
  if (!('beginQuery' in gl)) return { supported: false, renderer, samples, finish() {} };
  const extension = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null;
  if (!extension) return { supported: false, renderer, samples, finish() {} };
  hd.render = (...args: Parameters<typeof original>) => {
    const invalid = !!gl.getParameter(extension.GPU_DISJOINT_EXT);
    while (pending.length && (invalid || gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE))) {
      const q = pending.shift();
      if (q) { if (!invalid) samples.push(Number(gl.getQueryParameter(q, gl.QUERY_RESULT)) / 1e6); gl.deleteQuery(q); }
    }
    if (pending.length >= 8) return original.apply(hd, args);
    const query = gl.createQuery();
    if (!query) return original.apply(hd, args);
    gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
    try { return original.apply(hd, args); }
    finally { gl.endQuery(extension.TIME_ELAPSED_EXT); pending.push(query); }
  };
  return {
    supported: true, renderer, samples,
    finish() { hd.render = original; for (const query of pending) gl.deleteQuery(query); },
  };
}

async function trial(g: Game, scene: Scenario, run: number, host: unknown) {
  const { route, center } = prepare(g, scene);
  let waypoint = 1, direction = 1, turns = 0, nextCast = 0, casts = 0, attempts = 0, spawned = 0, nextSpawn = 0;
  let movingDistance = 0, previous = { x: g.player.x, y: g.player.y };
  let nextZoom = 0, zoomDir = -1, zoomSteps = 0, zoomStart = 0, resizes = 0;
  const enemyIds = ['wolf', 'redwolf', 'boar', 'greensnake', 'spider', 'hawk', 'bandit'];
  const spells = ['huodan', 'bingzhui', 'huoshe', 'fengren'];
  const enemyCounts: number[] = [], memory: number[] = [], gpuStage: number[] = [], saves: { slot: number; ms: number; ok: boolean; day: number }[] = [];
  const castIds: Record<string, number> = {};
  let nextSample = 0, castIndex = 0;
  const drive = (now: number) => {
    movingDistance += Math.hypot(g.player.x - previous.x, g.player.y - previous.y);
    previous = { x: g.player.x, y: g.player.y };
    if (g.modal) g.closeModal(true);
    if (scene === 'crowd') {
      const point = route[waypoint];
      if (Math.hypot(point.x - g.player.x, point.y - g.player.y) < 60) {
        if (waypoint === route.length - 1 || waypoint === 0) { direction *= -1; turns++; }
        waypoint += direction;
      }
      const target = route[waypoint]; g.setDestination(target.x, target.y);
    }
    if (scene === 'travel') g.setDestination(Math.min(WORLD_W - 400, center.x + 90000), Math.min(WORLD_H - 400, center.y + 400));
    if (scene === 'zoom') {
      // 每 80 ms 一格滚轮，在 0.22↔1.6 之间来回；每 5 秒切换一次飞行，覆盖高度引起的取景变化
      if (!zoomStart) zoomStart = now;
      if (now >= nextZoom) {
        const z = g.cam.targetZoom;
        if (z >= 1.59) zoomDir = -1; else if (z <= 0.23) zoomDir = 1;
        g.zoomBy(zoomDir > 0 ? 1.12 : 1 / 1.12); zoomSteps++; nextZoom = now + 80;
      }
      g.player.flying = Math.floor((now - zoomStart) / 5000) % 2 === 1;
    }
    if (scene === 'battle') {
      g.hero.hp = 1; g.hero.mp = 1; g.combat.invulnT = 1;
      if (now >= nextSpawn) {
        const live = g.combat.enemies.filter(enemy => !enemy.dead).length, needed = Math.max(0, 40 - live);
        const before = g.combat.enemies.length;
        if (needed) g.debugSpawn(Array.from({ length: needed }, (_, i) => enemyIds[(i + spawned) % enemyIds.length]), 2, 2, 380);
        for (const enemy of g.combat.enemies.slice(before)) enemy.aggro = true;
        spawned += needed; nextSpawn = now + 1000;
      }
      if (now >= nextCast) {
        const id = spells[castIndex++ % spells.length], before = g.combat.cdLeft(id);
        g.combat.cast(id); attempts++;
        if (before <= 0 && g.combat.cdLeft(id) > 0) { casts++; castIds[id] = (castIds[id] ?? 0) + 1; }
        nextCast = now + 500;
      }
    }
    if (now >= nextSample) {
      enemyCounts.push(g.combat.enemies.filter(enemy => !enemy.dead).length);
      const h = heap(); if (h) memory.push(h.used);
      if (g.renderer.stage?.gpuMs) gpuStage.push(g.renderer.stage.gpuMs);
      nextSample = now + 1000;
    }
  };
  const originalUpdate = g.update, originalRender = g.renderer.render, originalSave = g.save, originalError = g['onFrameError'];
  const originalResize = g.renderer['resize'];
  g.renderer['resize'] = function (this: typeof g.renderer) { if (measured) resizes++; return originalResize.call(this); };
  const beforeProfiler = g.showPerf, frameErrors: string[] = [];
  let measured = false, active = false, lastUpdate = 0, lastFrame = 0, gpu: ReturnType<typeof gpuTimer> | null = null;
  let hiddenSince: number | null = document.hidden ? performance.now() : null, hiddenTotal = 0, backgroundPauses = document.hidden ? 1 : 0;
  const hiddenTime = () => hiddenTotal + (hiddenSince === null ? 0 : performance.now() - hiddenSince);
  const visibleNow = () => performance.now() - hiddenTime();
  const visibility = () => {
    if (document.hidden) {
      hiddenSince = performance.now(); backgroundPauses++; lastFrame = 0;
      status.textContent = `${names[scene]} ${run}/${repeats}：页面在后台，计时暂停。`;
    } else if (hiddenSince !== null) { hiddenTotal += performance.now() - hiddenSince; hiddenSince = null; lastFrame = 0; }
  };
  document.addEventListener('visibilitychange', visibility);
  const updates: number[] = [], renders: number[] = [], cpuFrame: number[] = [], gaps: number[] = [];
  g.update = function (dt: number) {
    if (document.hidden) return;
    drive(performance.now());
    const start = performance.now();
    try { return originalUpdate.call(g, dt); }
    finally { lastUpdate = performance.now() - start; if (measured) updates.push(lastUpdate); }
  };
  g.renderer.render = function (dt: number) {
    if (document.hidden) return;
    const start = performance.now();
    try { return originalRender.call(g.renderer, dt); }
    finally { if (measured) { const duration = performance.now() - start; renders.push(duration); cpuFrame.push(lastUpdate + duration); } }
  };
  g.save = function (slot = 0) {
    const start = performance.now(), ok = originalSave.call(g, slot);
    if (measured && !document.hidden) saves.push({ slot, ms: Math.round((performance.now() - start) * 100) / 100, ok, day: g.day });
    return ok;
  };
  g['onFrameError'] = function (where: string, error: unknown) {
    if (measured) frameErrors.push(`${where}: ${error instanceof Error ? error.message : String(error)}`);
    originalError.call(g, where, error);
  };
  try {
  status.textContent = `${names[scene]} ${run}/${repeats}：预热 ${warmup} 秒`;
  const warmStart = visibleNow();
  while (!stopped && visibleNow() - warmStart < warmup * 1000) await wait(250);
  if (stopped) return null;
  gpu = gpuTimer(g);
  g.showPerf = true; prof.reset();
  const start = visibleNow(), startHidden = hiddenTime(), startPauses = backgroundPauses, startDay = g.day, startPoint = { x: g.player.x, y: g.player.y }, heapStart = heap();
  movingDistance = 0; previous = { ...startPoint }; turns = 0; zoomSteps = 0; resizes = 0; attempts = 0; casts = 0; spawned = 0; enemyCounts.length = memory.length = gpuStage.length = 0;
  for (const key of Object.keys(castIds)) delete castIds[key];
  g['saveTimer'] = 0; measured = true;
  active = true;
  const frame = (time: number) => {
    if (!active) return;
    if (document.hidden) lastFrame = 0;
    else { if (lastFrame) gaps.push(time - lastFrame); lastFrame = time; }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  let shown = -1;
  while (!stopped && visibleNow() - start < seconds * 1000) {
    const elapsed = Math.floor((visibleNow() - start) / 1000);
    if (!document.hidden && elapsed !== shown) { shown = elapsed; status.textContent = `${names[scene]} ${run}/${repeats}：${elapsed}/${seconds} 秒`; }
    await wait(250);
  }
  active = false; measured = false;
  const duration = (visibleNow() - start) / 1000;
  const top = prof.report(15), stage = g.renderer.stage;
  const count = enemyCounts.length, autoSaves = saves.filter(save => save.slot === 0 && save.ok).length;
  const valid = !stopped && !g.hero.dead && frameErrors.length === 0 && (scene !== 'crowd' || movingDistance > Math.min(1000, seconds * 50) && (seconds < 30 || turns > 0))
    && (scene !== 'travel' || Math.hypot(g.player.x - startPoint.x, g.player.y - startPoint.y) > Math.min(5000, seconds * 200))
    && (scene !== 'battle' || casts >= Math.ceil(seconds * 0.2) && count > 0 && enemyCounts.reduce((a, b) => a + b, 0) / count >= 35)
    && (scene !== 'daily' || g.day > startDay && (seconds < 30 || autoSaves >= 1))
    && (scene !== 'zoom' || zoomSteps >= seconds * 5);
  return {
    scenario: scene, name: names[scene], run, drive: freeDrive ? 'free' : 'raf', requestedSeconds: seconds, durationSeconds: +duration.toFixed(2), warmupSeconds: warmup, valid, interrupted: stopped,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, canvasWidth: g.renderer.domCanvas.width, canvasHeight: g.renderer.domCanvas.height },
    frames: gaps.length, fps: +(gaps.length / duration).toFixed(2), frameIntervalMs: stats(gaps), longFramesOver50ms: gaps.filter(ms => ms > 50).length,
    backgroundPauses: backgroundPauses - startPauses, backgroundSeconds: +((hiddenTime() - startHidden) / 1000).toFixed(2), frameErrors,
    cpu: { updateMs: stats(updates), renderSubmitMs: stats(renders), updateAndRenderMs: stats(cpuFrame), logicalProcessors: navigator.hardwareConcurrency, note: 'JS 主线程实际计时，不是系统 CPU 占用率' },
    gpu: { hdTimerSupported: gpu.supported, hdRenderer: gpu.renderer, hdGpuMs: stats(gpu.samples), hdSamples: gpu.samples.length, compositeGpuSmoothedMs: stats(gpuStage), compositeSegmentsMs: stage ? { ...stage.gpuSec } : null, compositeRenderer: stage?.gpuName ?? null, software: stage?.softGPU ?? null },
    memory: { heapStart, heapEnd: heap(), usedHeapSampleMaxBytes: memory.length ? Math.max(...memory) : null, note: '仅浏览器暴露的 JS 堆，不含进程总内存和显存' },
    workload: { startPoint, endPoint: { x: g.player.x, y: g.player.y }, movementUnits: Math.round(movingDistance), turns, pathPoints: route.length,
      enemyLive: stats(enemyCounts), spawnedDuringMeasurement: spawned, castAttempts: attempts, successfulCasts: casts, spells: castIds,
      gameDaysElapsed: +(g.day - startDay).toFixed(2), autoSaves, saves, npcTotal: g.npcs.list.length, npcActive: g.npcs.active.size },
    zoom: scene === 'zoom' ? { steps: zoomSteps, resizeCalls: resizes, qualityLevel: g.renderer.qualityLevel } : null,
    profiler: { top, counters: prof.counters(), recentSpikes: prof.spikes.slice(-8) }, host,
  };
  } finally {
    active = false; measured = false;
    g.update = originalUpdate; g.renderer.render = originalRender; g.save = originalSave; g['onFrameError'] = originalError;
    g.renderer['resize'] = originalResize;
    document.removeEventListener('visibilitychange', visibility); gpu?.finish(); g.showPerf = beforeProfiler;
  }
}

async function runScenes(scenes: Scenario[]) {
  busy = true; stopped = false; buttons();
  config.textContent = `预热 ${warmup} 秒，每场 ${seconds} 秒 × ${repeats} 次；浏览器窗口 ${innerWidth}×${innerHeight}。`;
  let host: unknown = null;
  try {
    const response = await fetch('/tools/perf-host.json');
    if (response.ok) host = await response.json();
    for (const scene of scenes) for (let i = 1; i <= repeats && !stopped; i++) {
      const result = await trial(game, scene, i, host);
      if (result) { results.push(result); showResults(); }
    }
    status.textContent = stopped ? '已停止；已有结果保留。' : '测试完成；请下载 JSON。';
  } catch (error) { status.textContent = `测试失败：${error instanceof Error ? error.message : String(error)}`; }
  finally { busy = false; buttons(); }
}

runAll.addEventListener('click', () => { void runScenes(['crowd', 'battle', 'travel', 'daily', 'zoom']); });
// 自动化入口：?auto=new&run=zoom,battle 进游戏后直接跑，结果挂在 window.__perfResults
const autoScenes = (params.get('run') ?? '').split(',').filter((s): s is Scenario => s in names);
(window as unknown as { __perfResults: unknown[] }).__perfResults = results;
for (const scene of Object.keys(scenarioButtons) as Scenario[]) scenarioButtons[scene].addEventListener('click', () => { void runScenes([scene]); });
stop.addEventListener('click', () => { stopped = true; });
download.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `taixu-performance-${location.port}-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
});
copy.addEventListener('click', () => { void navigator.clipboard.writeText(JSON.stringify(results, null, 2)); });
get<HTMLButtonElement>('cold').addEventListener('click', () => { location.href = '/tools/perf-cold.html?auto=new&hd2d=1'; });

/** 试玩入口：?auto=new&try=dunkong —— 直接给元婴修为和遁空梭、开全图、收起验收面板，方便看遁空 */
function tryDunkong(g: Game) {
  const h = g.hero;
  // 新开局稍后会弹开场对话，挡着就按不了键：试玩页里替你关掉
  const closer = window.setInterval(() => { if (g.modal) g.closeModal(true); }, 300);
  window.setTimeout(() => clearInterval(closer), 6000);
  h.realm = 4; h.stage = 0; h.hp = 1; h.mp = 1;
  (h.equip ??= {} as typeof h.equip).flight = 'art_dunkongsuo';
  g.revealAll = true;
  // 出生点青霞谷紧挨着东边界，朝东三秒就撞到天地尽头：初始航向改成朝西
  g.player.facing = -1; g.travel.dir.x = -1; g.travel.dir.y = 0;
  get<HTMLElement>('perf-panel').style.display = 'none';
  g.updateUI(true);
  g.toast('已备好元婴修为和遁空梭：按 ` 键（数字 1 左边）或点右下「梭」催动，再按一次收势。先在地图上点个去处，会自动飞过去。', 'good');
}

/** 试玩入口：?auto=new&try=xukong —— 给元婴修为和遁空梭，起飞后直接破界进虚空（平时是升到高空的顶再按住上升一息） */
function tryXukong(g: Game) {
  tryDunkong(g);
  window.setTimeout(() => {
    if (!g.player.flying) g.toggleFly();
    // 替你按住上升键，一路升到巡航的高度再松开（平时就是自己按住 PageUp）
    window.setTimeout(() => { g.xukong.leave(); g.input.keys.add('ascend'); const up = window.setInterval(() => { if (g.xukong.phase === 'none' || g.xukong.lift >= 0.999) { g.input.keys.delete('ascend'); clearInterval(up); } }, 200); }, 1200);
  }, 6500);
  g.toast('稍等片刻，会替你按住上升键一路升出界外。之后：方向键飞行，PageUp / PageDown 升降，滚轮拉远镜头，` 键催动遁空梭；飞到一界的正上方按住 PageDown 就降进去。', 'good');
}

/**
 * 试玩入口：?auto=new&try=voidfight —— 同 xukong 一路升出界外；到了巡航高度，把你挪到离一头元婴品阶虚空兽不远的地方，
 * 它察觉到你就会扑上来交手（虚空里的即时斗法）。打不过就飞开（或催动遁空梭）甩脱。
 */
function tryVoidFight(g: Game) {
  tryXukong(g);
  const wait = window.setInterval(() => {
    const xk = g.xukong;
    if (xk.phase !== 'void' || xk.lift < 0.999) return;
    clearInterval(wait);
    type Thing = { kind: string; x: number; y: number; tier?: number };
    const L = xk.life as unknown as { cell(cx: number, cy: number, realms: unknown): Thing[] };
    let best: Thing | null = null, bd = Infinity;
    const cx0 = Math.floor(xk.x / 9000), cy0 = Math.floor(xk.y / 9000);
    for (let j = -12; j <= 12; j++) for (let i = -12; i <= 12; i++) for (const t of L.cell(cx0 + i, cy0 + j, xk.realms)) {
      if (t.kind !== 'beast' || t.tier !== 4) continue;
      const d = Math.hypot(t.x - xk.x, t.y - xk.y); if (d < bd) { bd = d; best = t; }
    }
    if (!best) { g.toast('附近没找到虚空兽，自己飞一飞找找看。', 'info'); return; }
    xk.x = best.x + 2200; xk.y = best.y; xk.vx = xk.vy = 0;
    g.hero.hp = 1; g.hero.mp = 1;
    g.toast('前面有一头虚空兽——等它扑上来，或者自己飞过去撞它。交手后照常施法、锁定、升降；飞开足够远就算甩脱。', 'warn');
    (window as unknown as { __vfReady?: boolean }).__vfReady = true;
  }, 300);
}

/**
 * 试玩入口：?auto=new&try=wanbao —— 送到梁京城里，给些灵石和可寄售的东西，替你把万宝楼开张后几个月的行情先跑出来，再打开万宝楼
 * （平时：大城里按交互键打开城镇面板，选「万宝楼」）
 */
function tryWanbao(g: Game) {
  const closer = window.setInterval(() => { if (g.modal && g.modal.kind !== 'wanbao') g.closeModal(true); }, 300);
  window.setTimeout(() => {
    clearInterval(closer);
    if (g.modal) g.closeModal(true);
    const loc = LOC_BY_ID.get('yuejing')!;
    g.teleport(loc.x * WORLD_SCALE, loc.y * WORLD_SCALE);
    const h = g.hero; h.realm = Math.max(h.realm, 2); h.stage = 0;
    C.addItem(h, 'mat_lingshi', 60000);
    for (const [id, n] of [['herb_lingzhi', 6], ['herb_jinxin', 10], ['pill_liaoshang', 8], ['tal_fire', 6], ['mat_yaodan3', 2]] as [string, number][]) C.addItem(h, id, n);
    // 开张：先摆货、贴求购，再快进二十来天的撮合（只动万宝楼，不动别的）
    const W = g.wanbao; W.daily();
    const day0 = g.day;
    for (let d = 3; d <= 24; d += 3) { g.day = day0 + d; W.match(); if (Math.floor(g.day / 30) !== W.S.lastMonth) { W.S.lastMonth = Math.floor(g.day / 30); W.monthly(); } }
    g.day = day0 + 24;
    get<HTMLElement>('perf-panel').style.display = 'none';
    g.openModal({ kind: 'wanbao', loc });
    (window as unknown as { __wbReady?: boolean }).__wbReady = true;
  }, 6500);
}

/**
 * 试玩入口：?auto=new&try=party —— 三位同行者在身边（队伍框里看血条蓝条、点卡片下指令、定作风），附近放几头妖兽打一打；
 * 再在不远处摆一支 NPC 猎妖队（名牌下有队名，走近按交谈能「问问这支猎妖队」「入伙同行」）。
 * （平时：友人录里邀人同行；路上碰到结伴的 NPC 交谈）
 */
function tryParty(g: Game) {
  const closer = window.setInterval(() => { if (g.modal) g.closeModal(true); }, 300);
  window.setTimeout(() => {
    clearInterval(closer);
    const h = g.hero, p = g.player; h.realm = Math.max(h.realm, 2); h.stage = 2; h.hp = 1; h.mp = 1;
    const near = g.npcs.list.filter((d) => d.alive && d.realm >= 1 && !d.canon && !d.beauty && !d.ros && !d.gz && (d.map ?? 'tiannan') === 'tiannan').slice(0, 40);
    const picks = near.slice(0, 3);
    for (const d of picks) { d.met = true; d.favor = 60; d.bond = 'companion'; d.bondUntil = g.day + 60; g.npcs.summon(d.id); }
    g.fellows.setMyStyle('hunt');
    // 附近一支猎妖队
    const f = g.fellows.form('hunt', 'tiannan');
    if (f) for (const [i, id] of f.members.entries()) { const d = g.npcs.byId.get(id)!; d.x = d.tx = p.x + 520 + i * 70; d.y = d.ty = p.y - 160 + i * 40; d.favor = 20; d.met = true; }
    // 几头妖兽
    for (let i = 0; i < 3; i++) { const e = new Enemy(ENEMIES.redwolf, p.x - 620 + i * 60, p.y + 180 + i * 50, 2, 0); e.aggro = true; g.combat.enemies.push(e); }
    get<HTMLElement>('perf-panel').style.display = 'none';
    g.updateUI(true);
    (window as unknown as { __pfReady?: boolean }).__pfReady = true;
    g.toast('三位同行者在身边：左上队伍框里看血条、蓝条，点卡片下指令（跟随 / 集火 / 各自为战 / 等候 / 撤退），上面一行定作风。东边不远有一支猎妖队，走近交谈试试入伙。', 'good');
  }, 6500);
}

/**
 * 试玩入口：?auto=new&map=tiannan&try=auction —— 到梁京、把日子拨到本季拍卖会开拍那天、给些灵石，直接坐进拍卖厅。
 * 台下竞价的是梁京所在价区里真实的修士（花他们自己的灵石）；你拍走别人急需的东西，他会记仇，出城后可能被他尾随。
 * （平时：大城的城镇面板里每季末第 80–89 日「拍卖会」）
 */
function tryAuction(g: Game) {
  const closer = window.setInterval(() => { if (g.modal && g.modal.kind !== 'auction') g.closeModal(true); }, 300);
  window.setTimeout(() => {
    clearInterval(closer);
    if (g.modal) g.closeModal(true);
    const loc = LOC_BY_ID.get('yuejing')!;
    g.teleport(loc.x * WORLD_SCALE, loc.y * WORLD_SCALE);
    const h = g.hero; h.realm = Math.max(h.realm, 3); h.stage = 0; h.mp = 1;
    C.addItem(h, 'mat_lingshi', 30000);
    // 拨到本季第 81 日（拍卖会第二天）；季末结算的标记跟着挪，免得把这一季当成已过
    const q = Math.floor(g.day / 90), d = q * 90 + 81;
    if (g.day < d) g.day = d;
    g.auction.S.q = Math.floor(g.day / 90);
    get<HTMLElement>('perf-panel').style.display = 'none';
    g.openModal({ kind: 'auction', loc });
    (window as unknown as { __aucReady?: boolean }).__aucReady = true;
  }, 6500);
}

/**
 * 试玩入口：?auto=new&try=gore —— 结丹修为、带「会心」天赋，身边围一圈火狼和几只毒蛛：打中溅血、血雾、地上血迹，
 * 普通击杀被打飞落地散，暴击击杀 / 一下打爆的炸成碎块，最后一只放慢。（血腥程度在设置里：关 / 适中 / 浓烈）
 */
function tryGore(g: Game) {
  const closer = window.setInterval(() => { if (g.modal) g.closeModal(true); }, 300);
  window.setTimeout(() => {
    clearInterval(closer);
    const h = g.hero, p = g.player; h.realm = 3; h.stage = 0; h.hp = 1; h.mp = 1;
    if (!h.talents.includes('t_huixin')) h.talents.push('t_huixin');
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, id = i % 3 === 2 ? 'spider' : 'redwolf'; const e = new Enemy(ENEMIES[id], p.x + Math.cos(a) * 320, p.y + Math.sin(a) * 220, 1, 0); e.aggro = true; g.combat.enemies.push(e); }
    get<HTMLElement>('perf-panel').style.display = 'none';
    g.updateUI(true);
    (window as unknown as { __goreReady?: boolean }).__goreReady = true;
    g.toast('身边围了一圈火狼和毒蛛：放法术打打看——溅血、血迹；暴击击杀会炸开，最后一只放慢。设置里可调血腥程度。', 'good');
  }, 6500);
}

/** 试玩入口：?auto=new&map=tiannan&try=sky —— 天上的飞鸟、仙鹤、御剑修士和身边的召唤物都立成立板（原先平铺在地上） */
function trySky(g: Game) {
  const closer = window.setInterval(() => { if (g.modal) g.closeModal(true); }, 300);
  window.setTimeout(() => {
    clearInterval(closer);
    const p = g.player, L = g.life; g.hero.realm = Math.max(g.hero.realm, 3);   // 结丹的神识圈够大，天上的东西不被雾遮
    // 从镜头左下飞向右上，几秒内都在画面里
    L.ents.push(new Flock(p.x - 700, p.y + 300, -0.35), new Flock(p.x - 500, p.y - 100, -0.15, true), new Flock(p.x - 900, p.y + 100, -0.2, true), new Flier(p.x - 1400, p.y + 200, -0.12));
    const kinds = ['fox', 'puppet', 'tihun', 'demon'] as const;
    kinds.forEach((kind, i) => { const an = i / kinds.length * Math.PI * 2 + 0.4; g.combat.summons.push({ kind, x: p.x + Math.cos(an) * 220, y: p.y + Math.sin(an) * 150, t: 600, dmg: 0, cd: 99, target: null, phase: 0, facing: 1, n: 1, lv: 1, age: 9, atk: 0, slot: i, big: 1 } as never); });
    get<HTMLElement>('perf-panel').style.display = 'none';
    (window as unknown as { __skyReady?: boolean }).__skyReady = true;
    g.toast('头顶飞过雁群、仙鹤和御剑修士，身边站着四只召唤物：都立起来了，转视角看看。', 'good');
  }, 6500);
}

/** 试玩入口：?auto=new&try=mijing[&theme=tomb][&tier=1|2|3][&rooms=7][&size=2.5] —— 直接走进一座秘境（平时要在大地图上找到入口，或进前人洞府「入府探查」）。
 *  tier 是档次（小 / 中 / 大，规模 2.5 / 3.5 / 5 倍）；size 直接指定规模系数（1 = 最早那版样板的大小）；&at=boss 落在祭坛前的引桥上；
 *  &gate=1 在身前开一道云门，自己走进去（无缝进出） */
function tryMijing(g: Game) {
  window.setTimeout(() => {
    if (g.modal) g.closeModal(true);
    g.hero.realm = Math.max(g.hero.realm, 3);
    const theme = (params.get('theme') ?? 'cave') as 'cave';
    const tier = Math.max(1, Math.min(3, Number(params.get('tier') ?? 1))), size = Number(params.get('size') ?? 0) || undefined;
    const spec = { name: '试炼洞府', tier, theme, seed: 1234, floors: 1, rooms: Number(params.get('rooms') ?? (tier === 1 ? 7 : tier === 2 ? 10 : 12)), lv: 3, size } as Parameters<typeof g.mijing.enter>[0];
    // &gate=1：不直接进去，在身前开一道云门，自己走进去（真实游玩时就是这样进的）
    if (params.get('gate')) { g.mijing.openGate(spec); document.querySelector<HTMLElement>('#perf-panel')?.style.setProperty('display', 'none'); (window as unknown as { __mjReady?: boolean }).__mjReady = true; return; }
    g.mijing.enter(spec);
    g.setZoom(Number(params.get('zoom') ?? 0.6));
    if (params.get('at') === 'boss') { const F = g.mijing.floor!, b = F.isles![F.isles!.length - 1], h = F.isles![0], k = (b.r + 400) / Math.hypot(h.x - b.x, h.y - b.y); g.player.x = b.x + (h.x - b.x) * k; g.player.y = b.y + (h.y - b.y) * k; g.cam.x = g.player.x; g.cam.y = g.player.y; }
    document.querySelector<HTMLElement>('#perf-panel')?.style.setProperty('display', 'none');
    (window as unknown as { __mjReady?: boolean }).__mjReady = true;
    // 自动化检查用：&leave=秒数 —— 过这么久自己走出来，并把这段时间的帧数写在页面标题上
    const leave = Number(params.get('leave') ?? 0);
    if (leave > 0) {
      let frames = 0, worst = 0, last = performance.now();
      const tick = () => { const now = performance.now(); worst = Math.max(worst, now - last); last = now; frames++; if (g.mijing.active) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      window.setTimeout(() => { g.mijing.leave('exit'); document.title = `mj frames=${frames} worst=${Math.round(worst)}ms active=${g.mijing.active}`; }, leave * 1000);
    }
  }, 2500);
}

const ready = window.setInterval(() => {
  const candidate = (window as WindowWithGame).__game;
  if (!candidate?.running || !candidate.renderer) return;
  game = candidate; clearInterval(ready); status.textContent = '游戏已启动；可选择场景。'; buttons();
  // 试玩入口大多直接把境界设到筑基以上：除了看近战的入口，别让「突破后学欺身 / 缩地」的小课冒出来挡画面（前 30 秒里境界一变就记成学过）
  if (params.get('try') && params.get('try') !== 'brawl' && !params.get('tutorial')) { let n = 0; const t = window.setInterval(() => { try { const tu = candidate.tutorial as unknown as { coveredBrawl(): void; ctxCur: { id: string } | null }; tu.coveredBrawl(); if (tu.ctxCur && (tu.ctxCur.id === 'rush' || tu.ctxCur.id === 'suodi')) tu.ctxCur = null; } catch { /* 无引导 */ } if (++n > 120) clearInterval(t); }, 250); }
  if (params.get('try') === 'dunkong') tryDunkong(candidate);
  if (params.get('try') === 'xukong') tryXukong(candidate);
  if (params.get('try') === 'voidfight') tryVoidFight(candidate);
  if (params.get('try') === 'wanbao') tryWanbao(candidate);
  if (params.get('try') === 'party') tryParty(candidate);
  if (params.get('try') === 'gore') tryGore(candidate);
  if (params.get('try') === 'sky') trySky(candidate);
  if (params.get('try') === 'auction') tryAuction(candidate);
  if (params.get('try') === 'mijing') tryMijing(candidate);
  if (params.get('try') === 'brawl') tryBrawl(candidate, params);
  if (params.get('try') === 'voidfall') void import('./try-voidfall').then((m) => m.tryVoidfall(candidate, params));   // 收官 E3：虚空一拳打进世界（tools/try-voidfall.ts）   // 贴身斗法（tools/try-brawl.ts）
  if (params.get('try') === 'bag') void import('./try-bag').then((m) => m.tryBag(candidate));   // 收官 C（甲）：储物袋与整套装备
  if (params.get('try') === 'arms') void import('./try-arms').then((m) => m.tryArms(candidate, params));   // 近战兵器线：拿着兵器循环演示每个动作（tools/try-arms.ts）
  if (params.get('try') === 'hitfeel') void import('./try-hitfeel').then((m) => m.tryHitfeel(candidate, params));   // r9-hitfeel：全游戏打击感（tools/try-hitfeel.ts）
  if (params.get('try') === 'wubian') tryWubian(candidate);
  if (params.get('try') === 'huajuan') void import('./try-huajuan').then((m) => m.tryHuajuan(candidate, params));   // 收官 P8（丁）：画中洞天
  if (params.get('try') === 'indoor') void import('./try-indoor').then((m) => m.tryIndoor(candidate, params));   // 收官 P8（丁）：走进客栈、酒楼、铺子、宗门大殿
  if (params.get('try') === 'gfx') void import('./try-gfx').then((m) => m.tryGfx(candidate, params));   // 收官第四轮乙：光影与画面遗留的取景台（tools/try-gfx.ts）
  if (params.get('try') === 'jueyu') void import('./try-jueyu').then((m) => m.tryJueyu(candidate, params));   // 收官 B4：别界的险地（流沙、冰海、熔岩、冥河、瘴泽、沧海）与南荒的腐骨瘴泽
  if (params.get('try') === 'lanjie') void import('./try-lanjie').then((m) => m.tryLanjie(candidate));   // 收官 P5：遁空途中被高阶追兵拦截（tools/try-lanjie.ts）
  if (params.get('try') === 'nuoyi') void import('./try-nuoyi').then((m) => m.tryNuoyi(candidate, params));   // 收官 P5：虚空挪移——开阵、被追进甬道躲飞剑（tools/try-nuoyi.ts）
  if (params.get('try') === 'wreck') void import('./try-wreck').then((m) => m.tryWreck(candidate, params));   // 野外破坏：倒树、碎石、坑沟、分海（tools/try-wreck.ts）
  if (params.get('try') === 'townwreck') void import('./try-town').then((m) => m.tryTown(candidate, params));   // 城镇破坏与恢复：摊位、铺子三档、街心石板、修复、讨债（tools/try-town.ts）
  if (params.get('try') === 'stall') void import('./try-stall').then((m) => m.tryStall(candidate, params));   // 收官 D（甲）：NPC 摆摊   // 无边海（绝域，B1）：tools/try-wubian.ts
  if (params.get('try') === 'ywsart') void import('./try-ywsart').then((m) => m.tryYwsArt(candidate, params));   // r16 夜无赦画面线：木偶首领逐个播招式姿态（tools/try-ywsart.ts）
  if (params.get('try') === 'hanshan') void import('./try-hanshan').then((m) => m.tryHanshan(candidate, params));   // r7：撼山客 · 岳千钧（tools/try-hanshan.ts）
  if (params.get('try') === 'yewushe') void import('./try-yewushe').then((m) => m.tryYewushe(candidate, params));   // r16：噬魂魔尊 · 夜无赦（tools/try-yewushe.ts）
  if (params.get('try') === 'lock') void import('./try-lock').then((m) => m.tryLock(candidate, params));   // r11-lock：锁定标记、锁定目标的大血条、锁定跟随镜头（tools/try-lock.ts）
  if (params.get('try') === 'hpbar') void import('./try-hpbar').then((m) => m.tryHpbar(candidate, params));   // r11-lock：血条打击感（tools/try-hpbar.ts）
  if (params.get('try') === 'hsp1') void import('./try-hsp1').then((m) => m.tryHsp1(candidate, params));   // r8-p1：撼山客第一阶段照参考视频还原的十一招（tools/try-hsp1.ts）
  if (params.get('q')) candidate.renderer.setQuality(Number(params.get('q')));   // 固定画质档测性能：0 流畅 / 1 中 / 2 高（同设置面板）
  if (autoScenes.length) void runScenes(autoScenes);
}, 100);
