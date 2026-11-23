import type { Game } from '../src/world/game';
import type { Enemy } from '../src/world/combat';
import type { ModBundle } from '../src/mod/types';
import { modHost } from '../src/mod/host';
import { prof } from '../src/core/prof';

interface SandboxObject { e: Enemy; team: 'ally' | 'foe' }
interface SpawnOptions { count: number; realm: number; stage: number; team: 'ally' | 'foe'; noP: boolean; stats?: { hp: number; maxHp: number } }
interface Sandbox {
  S: { active: boolean; hud: boolean; origin: { x: number; y: number }; objs: Map<string, SandboxObject> };
  enter(options: { fresh: boolean; who: string; realm: number; stage: number; place: string }): boolean;
  spawn(id: string, x: number, y: number, options: SpawnOptions): string[];
  clearAll(): void;
  setCtl(key: string, value: boolean | number | string): void;
  toggle(): void;
}
type TestWindow = Window & { __game?: Game; __shahe: Sandbox };
type HeapPerformance = Performance & { memory?: { usedJSHeapSize: number } };
const page = window as TestWindow;
const query = new URLSearchParams(location.search);
// 面板不在前台时 rAF 被降到约 1 Hz。?drive=free 改用 MessageChannel 连续驱动帧，测的是每帧 CPU 耗时，不是显示帧率。
if (query.get('drive') === 'free') {
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
// ?run=1000 进场后自动开始一轮（人数），结果在 #stress-results
const autoRun = Number(query.get('run') ?? 0);
const workCanvas = query.get('workCanvas') === 'cpu' ? 'cpu' : 'default';
const characterCanvasOption = query.get('characterCanvas');
const characterCanvas = characterCanvasOption === 'cpu' || characterCanvasOption === 'gpu' ? characterCanvasOption : 'default';
const atlasCanvas = query.get('atlasCanvas') === 'cpu' ? 'cpu' : 'default';
const traceGlUploads = query.get('traceGlUploads') === '1';
const glOperations = ['texSubImage2D', 'pixelStorei', 'bindTexture', 'getParameter'] as const;
type GlOperation = typeof glOperations[number];
const glCalls = Object.fromEntries(glOperations.map(name => [name, { count: 0, ms: 0 }])) as Record<GlOperation, { count: number; ms: number }>;
const tracedContexts = new WeakSet<object>();
function traceGl(context: WebGL2RenderingContext): void {
  if (tracedContexts.has(context)) return;
  tracedContexts.add(context);
  const methods = context as unknown as Record<GlOperation, (...args: unknown[]) => unknown>;
  for (const name of glOperations) {
    const original = methods[name];
    methods[name] = (...args: unknown[]) => {
      const start = name === 'texSubImage2D' ? performance.now() : 0;
      const value = Reflect.apply(original, context, args);
      glCalls[name].count++;
      if (name === 'texSubImage2D') glCalls[name].ms += performance.now() - start;
      return value;
    };
  }
}
let workCanvasReadFrequently = false;
let characterCanvasReadFrequently = false, atlasCanvasReadFrequently = false;
const getCanvasContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id: string, options?: unknown): RenderingContext | null {
  const work = id === '2d' && this.width === 2048 && this.height === 4096;
  const character = id === '2d' && this.width === 1 && this.height === 1;
  const atlas = id === '2d' && this.width === 4096 && this.height === 4096;
  const forceCpu = (work && workCanvas === 'cpu') || (character && characterCanvas === 'cpu') || (atlas && atlasCanvas === 'cpu');
  const forceGpu = character && characterCanvas === 'gpu';
  const settings = forceCpu || forceGpu ? { ...(options as CanvasRenderingContext2DSettings), willReadFrequently: forceCpu } : options;
  const context = Reflect.apply(getCanvasContext, this, [id, settings]) as RenderingContext | null;
  if (id === 'webgl2' && context && traceGlUploads) traceGl(context as WebGL2RenderingContext);
  if ((work || character || atlas) && context) {
    const actual = (context as CanvasRenderingContext2D).getContextAttributes().willReadFrequently ?? false;
    if (work) workCanvasReadFrequently = actual;
    if (character) characterCanvasReadFrequently = actual;
    if (atlas) atlasCanvasReadFrequently = actual;
  }
  return context;
} as typeof HTMLCanvasElement.prototype.getContext;
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = element('stress-status'), live = element('stress-live'), output = element('stress-results');
const start = element<HTMLButtonElement>('stress-start'), stop = element<HTMLButtonElement>('stress-stop');
const results: unknown[] = [];
let game: Game, sandbox: Sandbox, stopped = false;
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function summarize(values: number[]) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const round = (value: number) => Math.round(value * 100) / 100;
  return { p50: round(sorted[Math.floor((sorted.length - 1) * 0.5)]), p95: round(sorted[Math.floor((sorted.length - 1) * 0.95)]), max: round(sorted[sorted.length - 1]), mean: round(values.reduce((sum, value) => sum + value, 0) / values.length) };
}

function counts() {
  let allies = 0, enemies = 0;
  for (const object of sandbox.S.objs.values()) if (!object.e.dead && !object.e.gone) {
    if (object.team === 'ally') allies++; else enemies++;
  }
  return { allies, enemies, total: allies + enemies };
}

function prepare(total: number, sustain: boolean) {
  sandbox.setCtl('paused', true);
  sandbox.clearAll();
  const { x, y } = sandbox.S.origin;
  const options: SpawnOptions = { count: total / 2, realm: 2, stage: 1, team: 'ally', noP: false };
  if (sustain) options.stats = { hp: 10000000, maxHp: 10000000 };
  const allies = sandbox.spawn('bandit', x - 330, y, options);
  const enemies = sandbox.spawn('bandit', x + 330, y, { ...options, team: 'foe' });
  game.cam.zoom = game.cam.targetZoom = 0.55;
  game.camYaw = game.camYawTarget = Math.PI / 4;
  game.hero.hp = game.hero.mp = 1;
  sandbox.setCtl('god', true);
  if (sandbox.S.hud) sandbox.toggle();
  sandbox.setCtl('paused', false);
  return { allies: allies.length, enemies: enemies.length };
}

async function trial(total: number, seconds: number, sustain: boolean, run: number) {
  const spawned = prepare(total, sustain);
  status.textContent = `第 ${run} 轮预热 5 秒，友方 ${spawned.allies}，敌方 ${spawned.enemies}`;
  await wait(5000);
  const updates: number[] = [], renders: number[] = [], gaps: number[] = [], population: number[] = [];
  const originalUpdate = game.update, originalRender = game.renderer.render;
  let measured = true, lastFrame = 0, damageEvents = 0, lastCount = 0, minHp = Infinity;
  const originalHit = game.combat.npcHit;
  game.combat.npcHit = function (...args: Parameters<typeof originalHit>) { damageEvents++; return originalHit.apply(this, args); };
  game.update = function (dt: number) {
    const begin = performance.now();
    originalUpdate.call(this, dt);
    updates.push(performance.now() - begin);
  };
  game.renderer.render = function (...args: Parameters<typeof originalRender>) {
    const begin = performance.now();
    originalRender.apply(this, args);
    renders.push(performance.now() - begin);
  };
  const frame = (time: number) => {
    if (!measured) return;
    if (lastFrame) gaps.push(time - lastFrame);
    lastFrame = time;
    requestAnimationFrame(frame);
  };
  game.showPerf = true;
  prof.reset();
  const begin = performance.now(), simulationStart = game.time, heapStart = (performance as HeapPerformance).memory?.usedJSHeapSize;
  const glStart = Object.fromEntries(glOperations.map(name => [name, { ...glCalls[name] }])) as typeof glCalls;
  const qualityStart = game.renderer.qualityLevel;
  requestAnimationFrame(frame);
  try {
    while (!stopped && performance.now() - begin < seconds * 1000) {
      const current = counts(); population.push(current.total);
      lastCount = current.total;
      for (const object of sandbox.S.objs.values()) minHp = Math.min(minHp, object.e.hp);
      status.textContent = `第 ${run} 轮，${((performance.now() - begin) / 1000).toFixed(1)} / ${seconds} 秒`;
      live.textContent = `存活 ${current.total}（友 ${current.allies} / 敌 ${current.enemies}），本轮受击 ${damageEvents} 次，镜头 ${Math.round(game.camYaw * 180 / Math.PI)}°`;
      await wait(500);
    }
  } finally {
    measured = false;
    game.update = originalUpdate; game.renderer.render = originalRender; game.combat.npcHit = originalHit;
    sandbox.setCtl('paused', true);
  }
  const duration = (performance.now() - begin) / 1000;
  const gl = game.renderer.stage!.gl;
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  return { run, requested: total, sustain, spawned, duration, simulationSeconds: game.time - simulationStart, fps: +(gaps.length / duration).toFixed(2), frameMs: summarize(gaps), over50: gaps.filter(value => value > 50).length,
    updateMs: summarize(updates), renderMs: summarize(renders), population: summarize(population), lastCount, damageEvents, minHp,
    heapStart, heapEnd: (performance as HeapPerformance).memory?.usedJSHeapSize, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    workCanvas: { requested: workCanvas, willReadFrequently: workCanvasReadFrequently },
    characterCanvas: { requested: characterCanvas, willReadFrequently: characterCanvasReadFrequently },
    atlasCanvas: { requested: atlasCanvas, willReadFrequently: atlasCanvasReadFrequently },
    glCalls: traceGlUploads ? Object.fromEntries(glOperations.map(name => {
      const count = glCalls[name].count - glStart[name].count, ms = glCalls[name].ms - glStart[name].ms;
      return [name, { count, perFrame: +(count / renders.length).toFixed(2),
        ...(name === 'texSubImage2D' ? { ms: +ms.toFixed(2), msPerFrame: +(ms / renders.length).toFixed(2) } : {}) }];
    })) : null,
    gpu: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER) as string,
    quality: { fixed: game.renderer.fixedQuality, start: qualityStart, end: game.renderer.qualityLevel, width: game.renderer.W, height: game.renderer.H },
    profiler: prof.report(100), spikes: prof.spikes.slice(), interrupted: stopped, hidden: document.hidden };
}

start.addEventListener('click', async () => {
  const total = Number(element<HTMLInputElement>('stress-count').value), seconds = Number(element<HTMLInputElement>('stress-seconds').value), runs = Number(element<HTMLInputElement>('stress-runs').value);
  if (!Number.isInteger(total) || total < 2 || total > 2000 || total % 2 || seconds < 5 || seconds > 300 || runs < 1 || runs > 5) { status.textContent = '人数须为 2～2000 的偶数，秒数 5～300，轮数 1～5。'; return; }
  const sustain = element<HTMLInputElement>('stress-sustain').checked;
  start.disabled = true; stop.disabled = false; stopped = false;
  try {
    for (let run = 1; run <= runs && !stopped; run++) {
      results.push(await trial(total, seconds, sustain, run));
      output.textContent = JSON.stringify(results, null, 2);
    }
    status.textContent = stopped ? '已停止，结果保留。' : '采样完成，战场已暂停。';
  } catch (error) { status.textContent = `测试失败 ${error instanceof Error ? error.message : String(error)}`; }
  finally { start.disabled = false; stop.disabled = true; }
});
stop.addEventListener('click', () => { stopped = true; });
element('stress-pause').addEventListener('click', () => sandbox.setCtl('paused', !game.paused));
element('stress-rotate').addEventListener('click', () => { game.camYawTarget += Math.PI / 4; });
element('stress-hud').addEventListener('click', () => sandbox.toggle());

const bundle = await (await fetch('/dist-mods/shahe-1.3.7.fmod')).json() as ModBundle;
const loaded = await modHost.load(bundle);
if (loaded.state !== 'loaded') throw new Error(loaded.error);
await import('../src/main');
const ready = window.setInterval(() => {
  if (!page.__game?.running) return;
  game = page.__game; sandbox = page.__shahe;
  clearInterval(ready);
  sandbox.enter({ fresh: true, who: 'test', realm: 2, stage: 1, place: 'arena' });
  sandbox.setCtl('paused', true);
  status.textContent = '沙盒已进入云上演武台，可开始千人对战。';
  for (const id of ['stress-start', 'stress-pause', 'stress-rotate', 'stress-hud']) element<HTMLButtonElement>(id).disabled = false;
  if (autoRun >= 2) {
    element<HTMLInputElement>('stress-count').value = String(autoRun);
    element<HTMLInputElement>('stress-seconds').value = query.get('seconds') ?? '15';
    element<HTMLInputElement>('stress-runs').value = '1';
    element<HTMLInputElement>('stress-sustain').checked = true;
    start.click();
  }
}, 100);
