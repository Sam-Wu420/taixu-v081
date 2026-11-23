import { setCanvasFactory } from '../core/canvas';
import { TerrainBaker } from './terrain-baker';
import type { TerrainWorkerReply, TerrainWorkerRequest } from './terrain-bake-protocol';

// 后台画布用 CPU 光栅，避免与前台画面争用 GPU 光栅线程。
setCanvasFactory((width, height) => {
  const canvas = new OffscreenCanvas(width, height);
  const get = canvas.getContext.bind(canvas) as (type: string, options?: object) => unknown;
  (canvas as unknown as { getContext: (type: string, options?: object) => unknown }).getContext = (type, options) =>
    get(type, type === '2d' ? { ...options, willReadFrequently: true } : options);
  return canvas as unknown as HTMLCanvasElement;
});

const scope = self as unknown as {
  onmessage: (event: MessageEvent<TerrainWorkerRequest>) => void;
  postMessage: (reply: TerrainWorkerReply, transfer?: Transferable[]) => void;
};
let baker: TerrainBaker;
scope.onmessage = event => {
  const request = event.data;
  if (request.kind === 'init') {
    baker = new TerrainBaker(request.data);
    scope.postMessage({ kind: 'ready' });
    return;
  }
  const start = performance.now();
  const canvas = baker.bake(request.cx, request.cy, request.season) as unknown as OffscreenCanvas;
  const bitmap = canvas.transferToImageBitmap();
  scope.postMessage({ kind: 'done', cx: request.cx, cy: request.cy, season: request.season, bitmap, ms: performance.now() - start }, [bitmap]);
};
