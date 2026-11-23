// 精灵生成 Worker：山（~40ms）与树（含 getImageData 回读）放到后台线程生成，主线程不再卡顿。
// 生成完转成 ImageBitmap 零拷贝传回。
import { setCanvasFactory } from '../core/canvas';
import { makeMountain, type MtnSpec, type MtnSprite } from './mountain';
import { makeTree, type Species, type Season } from './tree';

// Worker 里的画布一律用 CPU 光栅化。默认的 OffscreenCanvas 2D 会交给 GPU 进程光栅化：一座山几千条路径，
// 浏览器实测在 GPU 主线程上一次占 90–130ms（trace 里是 RendererBlinkWorker 的 Flush），而游戏主画面也要排这条线程，
// 于是赶路时出一座新山就整帧卡住。改成 CPU 光栅化后，重活留在本 Worker 线程里并行做，GPU 只在首次绘制时上传一次成品。
setCanvasFactory((w, h) => {
  const c = new OffscreenCanvas(w, h);
  const get = c.getContext.bind(c) as (t: string, o?: object) => unknown;
  (c as unknown as { getContext: (t: string, o?: object) => unknown }).getContext = (t, o) => get(t, t === '2d' ? { ...(o ?? {}), willReadFrequently: true } : o);
  return c as unknown as HTMLCanvasElement;
});

export type SpriteJob =
  | { id: number; kind: 'M'; spec: MtnSpec }
  | { id: number; kind: 'T'; sp: Species; season: Season; seed: number; res: number };
export interface SpriteDone { id: number; bmp?: ImageBitmap; w: number; h: number; ax: number; ay: number; falls?: MtnSprite['falls']; err?: string }

const toBitmap = (c: HTMLCanvasElement): ImageBitmap => (c as unknown as OffscreenCanvas).transferToImageBitmap();

self.onmessage = (e: MessageEvent<SpriteJob>) => {
  const j = e.data;
  try {
    if (j.kind === 'M') {
      const m = makeMountain(j.spec);
      const bmp = toBitmap(m.canvas as HTMLCanvasElement);
      (self as unknown as Worker).postMessage({ id: j.id, bmp, w: m.w, h: m.h, ax: m.ax, ay: m.ay, falls: m.falls } as SpriteDone, [bmp]);
    } else {
      const t = makeTree(j.sp, j.season, j.seed, j.res);
      const bmp = toBitmap(t.canvas);
      (self as unknown as Worker).postMessage({ id: j.id, bmp, w: t.w, h: t.h, ax: t.ax, ay: t.ay } as SpriteDone, [bmp]);
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: j.id, w: 0, h: 0, ax: 0, ay: 0, err: String(err) } as SpriteDone);
  }
};
