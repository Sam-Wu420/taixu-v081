import { CharState, drawCharacter, randomLook, type Action, type Look } from '../src/gfx/character';

interface Case { action: Action; yaw: number; look: Look; cpu: boolean }
interface Result { bitmap: ImageBitmap; ms: number }
const width = 128, height = 192;

function paint(ctx: CanvasRenderingContext2D, input: Case): number {
  const state = new CharState(0, 0);
  state.t = 1; state.seed = 17; state.action = input.action;
  state.yaw = state.targetYaw = input.yaw;
  state.speed = 160; state.vx = 80; state.windX = 20;
  const start = performance.now();
  for (let frame = 0; frame < 24; frame++) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, width, height);
    ctx.setTransform(0.55, 0, 0, 0.55, width / 2, 158);
    state.update(1 / 60);
    drawCharacter(ctx, input.look, state, 1.06, 1 / 60);
  }
  return performance.now() - start;
}

if (typeof document === 'undefined') {
  const worker = self as unknown as DedicatedWorkerGlobalScope;
  worker.onmessage = (event: MessageEvent<Case>) => {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: event.data.cpu })!;
    const ms = paint(ctx as unknown as CanvasRenderingContext2D, event.data);
    const bitmap = canvas.transferToImageBitmap();
    worker.postMessage({ bitmap, ms } satisfies Result, [bitmap]);
  };
} else {
  const button = document.getElementById('run') as HTMLButtonElement;
  const output = document.getElementById('result')!;
  const view = document.getElementById('view')!;
  button.onclick = async () => {
    button.disabled = true;
    const worker = new Worker(new URL('./character-offscreen-check.ts', import.meta.url), { type: 'module' });
    let seed = 20261113;
    const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
    const cpu = new URLSearchParams(location.search).get('cpu') === '1';
    const cases = (['idle', 'walk', 'run', 'cast', 'hit', 'fly', 'dodge', 'sit', 'gather'] as Action[])
      .flatMap(action => [0, Math.PI / 4, Math.PI / 2, Math.PI].map(yaw => ({ action, yaw, look: randomLook(random, 'cultivator'), cpu })));
    const results = [];
    for (const input of cases) {
      output.textContent = `正在比较 ${input.action} / ${Math.round(input.yaw * 180 / Math.PI)}°`;
      const original = document.createElement('canvas'); original.width = width; original.height = height;
      const ctx = original.getContext('2d', { willReadFrequently: false })!;
      const directMs = paint(ctx, input);
      const pending = new Promise<Result>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent<Result>) => resolve(event.data);
        worker.onerror = event => reject(new Error(event.message));
      });
      worker.postMessage(input);
      const result = await pending;
      const copy = document.createElement('canvas'); copy.width = width; copy.height = height;
      const copyCtx = copy.getContext('2d')!;
      copyCtx.drawImage(result.bitmap, 0, 0); result.bitmap.close();
      const a = ctx.getImageData(0, 0, width, height).data;
      const b = copyCtx.getImageData(0, 0, width, height).data;
      let sum = 0, max = 0, changed = 0, pixels = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (!a[i + 3] && !b[i + 3]) continue;
        pixels++;
        let delta = 0;
        for (let channel = 0; channel < 4; channel++) {
          const difference = Math.abs(a[i + channel] - b[i + channel]);
          sum += difference; max = Math.max(max, difference); delta = Math.max(delta, difference);
        }
        if (delta > 8) changed++;
      }
      results.push({ action: input.action, yaw: input.yaw, mean: sum / (pixels * 4), max,
        changedOver8Percent: changed / pixels * 100, directMs, workerMs: result.ms });
      const pair = document.createElement('div'); pair.className = 'pair';
      const label = document.createElement('p'); label.textContent = `${input.action} ${Math.round(input.yaw * 180 / Math.PI)}°，原画布 / Worker`;
      pair.append(label, original, copy); view.append(pair);
    }
    worker.terminate();
    output.textContent = JSON.stringify({ cpu, cases: results.length, results }, null, 2);
    button.disabled = false;
  };
}
