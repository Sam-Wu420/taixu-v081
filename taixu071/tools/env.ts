// Node 截图与测试环境：注册 ?inline 静态资源加载钩子、注入画布工厂与 Path2D / Image 桩
import { register } from 'node:module';
import { createCanvas, Path2D, GlobalFonts } from '@napi-rs/canvas';
import { setCanvasFactory } from '../src/core/canvas';

const inlineHook = `
export async function load(url, context, nextLoad) {
  const clean = url.split('?')[0];
  if (/\\.(webp|png|jpe?g|gif|ogg|mp3|wav|m4a|woff2?|ttf|svg)$/i.test(clean)) {
    return { format: 'module', shortCircuit: true, source: 'export default "";' };
  }
  return nextLoad(url, context);
}
`;
register('data:text/javascript,' + encodeURIComponent(inlineHook));

(globalThis as any).Path2D = Path2D;
if (!(globalThis as any).Image) {
  (globalThis as any).Image = class MockImage {
    width = 64; height = 64; naturalWidth = 64; naturalHeight = 64; complete = false;
    onload: (() => void) | null = null; onerror: (() => void) | null = null;
    private _src = '';
    get src() { return this._src; }
    set src(v: string) { this._src = v; this.complete = !!v; }
  };
}
setCanvasFactory((w, h) => createCanvas(w, h) as any);
(globalThis as any).document = {
  createElement: (t: string) => { if (t === 'canvas') { const c: any = createCanvas(1, 1); return c; } return {}; },
  fonts: { check: () => true, load: () => Promise.resolve() },
};
export { createCanvas, GlobalFonts };
import { writeFileSync } from 'fs';
export function save(c: any, name: string) { writeFileSync(new URL('./out/' + name, import.meta.url), c.toBuffer('image/png')); console.log('saved', name); }
