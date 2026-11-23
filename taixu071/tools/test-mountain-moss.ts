import './env';
import assert from 'node:assert/strict';
import { makeMountain } from '../src/gfx/mountain';

// 1) 静态与运行时防护：同一个 Path2D 上连续追加多个 ellipse 时，每次 ellipse 前必须先 moveTo，
// 否则 Canvas2D 规范会用直线把前后椭圆相连，在山脊之间拉出跨山暗块多边形。
const OrigPath2D = globalThis.Path2D;
const subpathsReady = new WeakMap<object, boolean>();
class GuardedPath2D extends OrigPath2D {
  override moveTo(x: number, y: number) {
    subpathsReady.set(this, true);
    return super.moveTo(x, y);
  }
  override lineTo(x: number, y: number) {
    subpathsReady.set(this, true);
    return super.lineTo(x, y);
  }
  override closePath() {
    subpathsReady.set(this, false);
    return super.closePath();
  }
  override ellipse(x: number, y: number, rx: number, ry: number, rot: number, sa: number, ea: number, ccw?: boolean) {
    assert.equal(
      subpathsReady.get(this),
      true,
      'Path2D.ellipse() called without preceding moveTo(), which chains ellipses with connecting lines',
    );
    super.ellipse(x, y, rx, ry, rot, sa, ea, ccw);
    subpathsReady.set(this, false);
  }
}
(globalThis as any).Path2D = GuardedPath2D;

try {
  // 2) 实测曾复现跨山暗块/斜带的两座典型山体（m130_152_0 矮丘与 wf31_38_bg 双层青绿山）
  const hillSpec = {
    seed: 22542114, style: 'hill' as const, w: 598.46, h: 257.68,
    cliff: false, waterfall: false, path: false, snowcap: false, pavilion: false, clouds: false, layers: 1,
  };
  const qinglvSpec = {
    seed: 128401976, style: 'qinglv' as const, w: 1308.43, h: 1086.22,
    cliff: true, waterfall: false, path: false, pavilion: false, snowcap: false, clouds: true, layers: 2,
  };

  for (const det of [0.15, 0.35, 0.5, 0.85]) {
    const m1 = makeMountain({ ...hillSpec, tex: 0.35, det });
    const m2 = makeMountain({ ...qinglvSpec, tex: 0.35, det });
    assert.ok(m1.canvas.width > 0 && m1.canvas.height > 0);
    assert.ok(m2.canvas.width > 0 && m2.canvas.height > 0);
  }

  // 3) 像素对比：m130_152_0 在 det=0.35（开启苔点）vs det=0.34（关闭苔点）时，不应出现大面积被深色块覆写
  const ref = makeMountain({ ...hillSpec, tex: 0.35, det: 0.34 });
  const cur = makeMountain({ ...hillSpec, tex: 0.35, det: 0.5 });
  const rw = ref.canvas.width, rh = ref.canvas.height;
  assert.equal(cur.canvas.width, rw);
  assert.equal(cur.canvas.height, rh);
  const dRef = (ref.canvas.getContext('2d')!).getImageData(0, 0, rw, rh).data;
  const dCur = (cur.canvas.getContext('2d')!).getImageData(0, 0, rw, rh).data;
  let darkened = 0;
  let opaque = 0;
  for (let i = 0; i < dRef.length; i += 4) {
    if (dRef[i + 3] < 200) continue;
    opaque++;
    const lRef = (dRef[i] + dRef[i + 1] + dRef[i + 2]) / 3;
    const lCur = (dCur[i] + dCur[i + 1] + dCur[i + 2]) / 3;
    if (lRef - lCur > 28) darkened++;
  }
  const darkRatio = darkened / Math.max(1, opaque);
  assert.ok(darkRatio < 0.03, `山体不应在开启苔点后大面积变暗（darkRatio=${darkRatio.toFixed(4)}）`);
  console.log(`mountain moss Path2D isolation passed (darkRatio=${darkRatio.toFixed(4)})`);
} finally {
  (globalThis as any).Path2D = OrigPath2D;
}
