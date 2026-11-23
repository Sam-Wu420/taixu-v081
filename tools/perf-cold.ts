import type { Game } from '../src/world/game';

type GameWindow = Window & { __game?: Game };
type HeapPerformance = Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } };
interface StartSample {
  run: number;
  readyMs: number;
  navigationType: NavigationTimingType;
  responseEndMs: number;
  domContentLoadedMs: number;
  resources: { count: number; transferBytes: number; decodedBytes: number; apparentlyCached: number };
  viewport: { width: number; height: number; dpr: number; canvasWidth: number; canvasHeight: number };
  heap: HeapPerformance['memory'] | null;
  gpu: { renderer: string | null; software: boolean | null };
}
interface StartRun { running: boolean; samples: StartSample[] }

const key = 'taixu-perf-startup-runs';
const freshOrigin = new URLSearchParams(location.search).has('fresh');
const get = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少界面元素 ${id}`);
  return node as T;
};
const status = get<HTMLElement>('cold-status'), results = get<HTMLElement>('cold-results');
const start = get<HTMLButtonElement>('cold-start'), stop = get<HTMLButtonElement>('cold-stop');
const download = get<HTMLButtonElement>('cold-download');
const stored = sessionStorage.getItem(key);
const state: StartRun = freshOrigin ? { running: true, samples: [] } : stored ? JSON.parse(stored) as StartRun : { running: false, samples: [] };
let nextReload = 0;
performance.setResourceTimingBufferSize(5000);

function display() {
  results.textContent = state.samples.length ? JSON.stringify(state.samples, null, 2) : '尚无结果';
  start.disabled = state.running;
  stop.disabled = !state.running;
  download.disabled = !state.samples.length;
}
function save() { sessionStorage.setItem(key, JSON.stringify(state)); display(); }
function sample(g: Game): StartSample {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  const stage = g.renderer.stage;
  const memory = (performance as HeapPerformance).memory;
  return {
    run: state.samples.length + 1,
    readyMs: Math.round(performance.now() * 100) / 100,
    navigationType: nav.type,
    responseEndMs: Math.round(nav.responseEnd * 100) / 100,
    domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd * 100) / 100,
    resources: {
      count: entries.length,
      transferBytes: entries.reduce((sum, entry) => sum + entry.transferSize, 0),
      decodedBytes: entries.reduce((sum, entry) => sum + entry.decodedBodySize, 0),
      apparentlyCached: entries.filter(entry => entry.transferSize === 0 && entry.decodedBodySize > 0).length,
    },
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, canvasWidth: g.renderer.domCanvas.width, canvasHeight: g.renderer.domCanvas.height },
    heap: memory ? { usedJSHeapSize: memory.usedJSHeapSize, totalJSHeapSize: memory.totalJSHeapSize, jsHeapSizeLimit: memory.jsHeapSizeLimit } : null,
    gpu: { renderer: stage?.gpuName ?? null, software: stage?.softGPU ?? null },
  };
}

start.addEventListener('click', () => {
  state.running = true; state.samples = []; save(); location.reload();
});
stop.addEventListener('click', () => {
  state.running = false; clearTimeout(nextReload); save(); status.textContent = '已停止；已有结果保留。';
});
download.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state.samples, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `taixu-startup-${location.port}-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
});
get<HTMLButtonElement>('cold-back').addEventListener('click', () => { location.href = '/tools/perf-acceptance.html?auto=new&hd2d=1'; });
document.addEventListener('visibilitychange', () => {
  if (!state.running) return;
  if (document.hidden) { clearTimeout(nextReload); status.textContent = '页面在后台，启动测试暂停；返回后重试当前次。'; }
  else location.reload();
});
display();

const poll = window.setInterval(() => {
  if (document.hidden && state.running) { status.textContent = '页面在后台，启动测试暂停；返回后重试当前次。'; return; }
  const g = (window as GameWindow).__game;
  if (g?.running && g.frameNo > 1) {
    clearInterval(poll);
    if (!state.running) { status.textContent = '游戏已启动；可开始 5 次页面启动。'; return; }
    state.samples.push(sample(g));
    if (freshOrigin || state.samples.length >= 5) {
      state.running = false; save(); status.textContent = freshOrigin ? '本次独立 origin 启动完成；请保存 JSON。' : '5 次页面启动完成；请下载 JSON。';
    } else {
      save(); status.textContent = `完成 ${state.samples.length}/5 次，准备下一次。`;
      nextReload = window.setTimeout(() => location.reload(), 1000);
    }
  } else if (state.running && performance.now() > 120000) {
    clearInterval(poll); state.running = false; save();
    status.textContent = `本次启动超过 120 秒，已停止；已完成 ${state.samples.length}/5 次。`;
  } else if (state.running) status.textContent = `第 ${state.samples.length + 1}/5 次启动中：${Math.floor(performance.now() / 1000)} 秒`;
}, 100);
