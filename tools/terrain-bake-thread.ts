import { createCanvas } from './env';
import { parentPort } from 'node:worker_threads';
import type { TerrainWorkerReply, TerrainWorkerRequest } from '../src/world/terrain-bake-protocol';

process.env.TAIXU_MAP = 'tiannan';
delete (globalThis as { document?: unknown }).document;
delete (globalThis as { Image?: unknown }).Image;
const scope = globalThis as unknown as {
  self: unknown;
  OffscreenCanvas: unknown;
  onmessage: (event: MessageEvent<TerrainWorkerRequest>) => void;
  postMessage: (reply: TerrainWorkerReply) => void;
};
scope.self = scope;
scope.OffscreenCanvas = class {
  constructor(width: number, height: number) {
    const canvas = createCanvas(width, height);
    return Object.assign(canvas, { transferToImageBitmap() { return canvas; } });
  }
};
scope.postMessage = reply => {
  if (reply.kind === 'ready') { parentPort!.postMessage(reply); return; }
  const canvas = reply.bitmap as unknown as HTMLCanvasElement;
  const pixels = new Uint8ClampedArray(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data);
  parentPort!.postMessage({ kind: 'done', cx: reply.cx, cy: reply.cy, season: reply.season, pixels, ms: reply.ms }, [pixels.buffer]);
};
await import('../src/world/terrain.worker');
parentPort!.on('message', (request: TerrainWorkerRequest) => scope.onmessage({ data: request } as MessageEvent<TerrainWorkerRequest>));
