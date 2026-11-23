// P0 回归测试：FrameBudget 调度、LOD 持续掉帧偏置、StageGL 局部脏矩形 texSubImage2D 上传
import './env';
import assert from 'node:assert/strict';
import { createCanvas } from './env';
import { FrameBudget, RenderPriority, clampDirty, unionDirty } from '../src/world/frameBudget';
import { noteFrame, biasNow, emaMs } from '../src/gfx/lod';
import { GLStage, type PostParams } from '../src/gl/stage';

// 1) FrameBudget 优先级与预算收敛
const fb = new FrameBudget(8.3);
assert.equal(fb.begin(12), 8.3);
assert.equal(fb.allow(RenderPriority.DECO, 5), true);
assert.equal(fb.allow(RenderPriority.DECO, 5), false, 'decorative item beyond budget must yield');
assert.equal(fb.allow(RenderPriority.PLAYER, 5), true, 'player priority must always pass');
assert.equal(fb.allow(RenderPriority.TARGET, 5), true, 'target priority must always pass');
assert.equal(fb.allow(RenderPriority.LANDMARK, 5), true, 'landmark priority must always pass');
assert.ok(fb.skipped >= 1);

const tight = fb.begin(24);
assert.ok(tight < 8.3 && tight >= 3.2, `slow emaMs should tighten optional budget, got ${tight}`);

// 2) DirtyRect 并集与裁剪
assert.deepEqual(
  clampDirty(unionDirty({ x: -10, y: 20, w: 50, h: 40 }, { x: 80, y: 10, w: 30, h: 60 }), 100, 100),
  { x: 0, y: 10, w: 100, h: 60 },
);
assert.equal(clampDirty({ x: 120, y: 120, w: 20, h: 20 }, 100, 100), null);

// 3) LOD 持续 <65fps 两秒回调 -0.05
const startBias = biasNow();
for (let i = 0; i < 125; i++) noteFrame(17.5); // ~125 * 17.5ms > 2000ms
assert.ok(emaMs() > 15.38);
assert.ok(biasNow() <= startBias - 0.05 + 1e-9, `expected bias drop >= 0.05, got ${startBias} -> ${biasNow()}`);

// 4) GLStage 局部脏矩形 texSubImage2D 上传与零上传跳过
function makeTrackingGL() {
  let seq = 0;
  const pixelStore = new Map<number, number>();
  const subUploads: Array<{ x: number; y: number; w: number; h: number; rowLen: number; skipX: number; skipY: number }> = [];
  let texImageCount = 0;
  const noop = () => {};
  const gl: Record<string, any> = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    TEXTURE_2D: 10, TEXTURE_2D_ARRAY: 11, RGBA: 12, RGBA8: 13, RGBA16F: 14, RGBA32F: 15,
    UNSIGNED_BYTE: 16, FLOAT: 17, NEAREST: 18, LINEAR: 19, LINEAR_MIPMAP_LINEAR: 20,
    TEXTURE_MIN_FILTER: 21, TEXTURE_MAG_FILTER: 22, TEXTURE_WRAP_S: 23, TEXTURE_WRAP_T: 24,
    CLAMP_TO_EDGE: 25, REPEAT: 26, FRAMEBUFFER: 27, COLOR_ATTACHMENT0: 28, COLOR_ATTACHMENT1: 29,
    TEXTURE0: 30, TRIANGLES: 31, SCISSOR_TEST: 32, BLEND: 33, DEPTH_TEST: 34, CULL_FACE: 35,
    UNPACK_FLIP_Y_WEBGL: 36, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 37,
    UNPACK_ROW_LENGTH: 38, UNPACK_SKIP_PIXELS: 39, UNPACK_SKIP_ROWS: 40,
    ARRAY_BUFFER: 41, DYNAMIC_DRAW: 42, COLOR_BUFFER_BIT: 43, MAX_TEXTURE_SIZE: 44, RENDERER: 45, FRAMEBUFFER_COMPLETE: 46,
    checkFramebufferStatus: () => 46,
    createProgram: () => ({ id: ++seq }),
    createShader: (t: number) => ({ id: ++seq, t }),
    shaderSource: noop, compileShader: noop, attachShader: noop, linkProgram: noop,
    detachShader: noop, deleteShader: noop, deleteProgram: noop,
    getShaderParameter: () => true, getProgramParameter: () => true,
    getShaderInfoLog: () => '', getProgramInfoLog: () => '',
    getUniformLocation: (_p: any, n: string) => ({ n }),
    createBuffer: () => ({ id: ++seq }),
    bindBuffer: noop,
    bufferData: noop,
    bufferSubData: noop,
    createVertexArray: () => ({ id: ++seq }),
    bindVertexArray: noop,
    enableVertexAttribArray: noop,
    vertexAttribPointer: noop,
    createTexture: () => ({ id: ++seq }),
    deleteTexture: noop,
    createFramebuffer: () => ({ id: ++seq }),
    deleteFramebuffer: noop,
    bindFramebuffer: noop,
    framebufferTexture2D: noop,
    drawBuffers: noop,
    bindTexture: noop,
    texImage2D: () => { texImageCount++; },
    texSubImage2D: (...args: any[]) => {
      if (args.length === 7) {
        const [, , x, y, , , src] = args;
        subUploads.push({
          x, y, w: src.width, h: src.height,
          rowLen: pixelStore.get(38) ?? 0,
          skipX: pixelStore.get(39) ?? 0,
          skipY: pixelStore.get(40) ?? 0,
        });
      } else {
        const [, , x, y, w, h] = args;
        subUploads.push({
          x, y, w, h,
          rowLen: pixelStore.get(38) ?? 0,
          skipX: pixelStore.get(39) ?? 0,
          skipY: pixelStore.get(40) ?? 0,
        });
      }
    },
    texImage3D: noop,
    texSubImage3D: noop,
    texParameteri: noop,
    texParameterf: noop,
    generateMipmap: noop,
    getParameter: (p: number) => (p === 44 ? 4096 : p === 45 ? 'TestGPU' : 0),
    getExtension: () => null,
    activeTexture: noop,
    useProgram: noop,
    uniform1i: noop, uniform1f: noop, uniform2f: noop, uniform3f: noop, uniform4f: noop, uniform2fv: noop, uniform3fv: noop, uniform4fv: noop, uniform4iv: noop,
    viewport: noop,
    scissor: noop,
    enable: noop,
    disable: noop,
    clearColor: noop,
    clear: noop,
    blendFunc: noop,
    drawArrays: noop,
    pixelStorei: (k: number, v: number) => { pixelStore.set(k, Number(v)); },
  };
  return { gl: gl as unknown as WebGL2RenderingContext, pixelStore, subUploads, getTexImageCount: () => texImageCount };
}

const mock = makeTrackingGL();
const stageCanvas = createCanvas(1000, 800) as unknown as HTMLCanvasElement;
(stageCanvas as any).addEventListener = () => {};
const stage = new GLStage(stageCanvas, mock.gl);
stage.resize(1000, 800);
const sceneCanvas = createCanvas(1000, 800) as unknown as HTMLCanvasElement;

const post: PostParams = {
  t: 1,
  mul: [1, 1, 1],
  warm: 0,
  dusk: 0,
  sense: { x: 500, y: 400, R: 600, on: false, ink: [0, 0, 0], glow: [1, 1, 1], hide: 0, alarm: 0 },
  atmo: null,
  fog: [0, 0, 0, 0],
  fogBands: 0,
  flash: [0, 0, 0, 0],
  tint: [0, 0, 0, 0],
  vig: 0,
  hurt: 0,
  fade: 0,
  aberr: 0,
  bloom: 0,
  grain: 0,
  shocks: [],
  sat: 0,
  ground: null,
};

// 首帧完整初始化
stage.frame(sceneCanvas, 1000, 800, 1, post, true);
assert.ok(stage.uploadMB > 3, `initial scene upload must be full frame (~3.05MB), got ${stage.uploadMB}`);

// 局部脏矩形上传（64x64 ≈ 0.0156 MB）
mock.subUploads.length = 0;
stage.frame(sceneCanvas, 1000, 800, 1, post, true, { x: 100, y: 120, w: 64, h: 64 });
assert.equal(mock.subUploads.length, 1);
assert.deepEqual(mock.subUploads[0], { x: 100, y: 120, w: 64, h: 64, rowLen: 1000, skipX: 100, skipY: 120 });
assert.ok(stage.uploadMB > 0 && stage.uploadMB < 0.02, `expected tiny dirty uploadMB, got ${stage.uploadMB}`);
assert.equal(mock.pixelStore.get(mock.gl.UNPACK_ROW_LENGTH), 0, 'UNPACK_ROW_LENGTH must reset to 0');
assert.equal(mock.pixelStore.get(mock.gl.UNPACK_SKIP_PIXELS), 0, 'UNPACK_SKIP_PIXELS must reset to 0');
assert.equal(mock.pixelStore.get(mock.gl.UNPACK_SKIP_ROWS), 0, 'UNPACK_SKIP_ROWS must reset to 0');

// 明确空脏区：零上传
mock.subUploads.length = 0;
stage.frame(sceneCanvas, 1000, 800, 1, post, true, null);
assert.equal(mock.subUploads.length, 0);
assert.equal(stage.uploadMB, 0);

// 覆盖超过 72% 退回整帧上传
mock.subUploads.length = 0;
stage.frame(sceneCanvas, 1000, 800, 1, post, true, { x: 0, y: 0, w: 950, h: 750 });
assert.equal(mock.subUploads.length, 1);
assert.deepEqual(mock.subUploads[0], { x: 0, y: 0, w: 1000, h: 800, rowLen: 0, skipX: 0, skipY: 0 });
assert.ok(stage.uploadMB > 3);

console.log('P0 perf foundations: FrameBudget, LOD 65fps pressure, and WebGL2 dirty-rect upload passed');
