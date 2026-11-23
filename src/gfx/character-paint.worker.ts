import { characterPhysicsBuffers, paintCharacter } from './character-worker-paint';
import type { CharacterPaintBatchReply, CharacterPaintBatchRequest, CharacterPaintReply } from './character-worker-protocol';

const canvas = new OffscreenCanvas(1, 1);
const context = canvas.getContext('2d', { willReadFrequently: true })! as unknown as CanvasRenderingContext2D;
const worker = self as unknown as Worker;

worker.onmessage = (event: MessageEvent<CharacterPaintBatchRequest>) => {
  const results: CharacterPaintReply[] = [], transfers: Transferable[] = [];
  for (const request of event.data.requests) {
    const physics = paintCharacter(context, request);
    const image = canvas.transferToImageBitmap();
    results.push({ image, physics }); transfers.push(image, ...characterPhysicsBuffers(physics));
  }
  worker.postMessage({ results } satisfies CharacterPaintBatchReply, transfers);
};
