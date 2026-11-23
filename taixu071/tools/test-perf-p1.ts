// P1 回归测试：WorldAtlas 2048² shelf-packing/LRU淘汰、WorldSpriteBatch 实例化合批、GLStage 5000 树=1 draw call
import './env';
import assert from 'node:assert/strict';
import { createCanvas } from './env';
import { WorldAtlas, WORLD_ATLAS_MAX_PAGES, WORLD_ATLAS_PAD, WORLD_ATLAS_SIZE } from '../src/gl/worldAtlas';
import { WorldSpriteBatch, WORLD_INST_FLOATS } from '../src/gl/worldBatch';
import { GLStage, type PostParams } from '../src/gl/stage';

function makeInstMockGL() {
  let seq = 0;
  const instDraws: Array<{ mode: number; first: number; count: number; primCount: number }> = [];
  const uniforms: Record<string, any> = {};
  const texSubUploads: Array<{ x: number; y: number }> = [];
  const noop = () => {};
  const gl: Record<string, any> = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    TEXTURE_2D: 10, TEXTURE_2D_ARRAY: 11, RGBA: 12, RGBA8: 13, RGBA16F: 14, RGBA32F: 15,
    UNSIGNED_BYTE: 16, FLOAT: 17, NEAREST: 18, LINEAR: 19, LINEAR_MIPMAP_LINEAR: 20,
    TEXTURE_MIN_FILTER: 21, TEXTURE_MAG_FILTER: 22, TEXTURE_WRAP_S: 23, TEXTURE_WRAP_T: 24,
    CLAMP_TO_EDGE: 25, REPEAT: 26, FRAMEBUFFER: 27, COLOR_ATTACHMENT0: 28, COLOR_ATTACHMENT1: 29,
    TEXTURE0: 30, TRIANGLES: 31, TRIANGLE_STRIP: 32, SCISSOR_TEST: 33, BLEND: 34, DEPTH_TEST: 35, CULL_FACE: 36,
    UNPACK_FLIP_Y_WEBGL: 37, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 38,
    UNPACK_ROW_LENGTH: 39, UNPACK_SKIP_PIXELS: 40, UNPACK_SKIP_ROWS: 41,
    ARRAY_BUFFER: 42, DYNAMIC_DRAW: 43, STATIC_DRAW: 44, COLOR_BUFFER_BIT: 45,
    MAX_TEXTURE_SIZE: 46, RENDERER: 47, FRAMEBUFFER_COMPLETE: 48,
    checkFramebufferStatus: () => 48,
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
    vertexAttribDivisor: noop,
    createTexture: () => ({ id: ++seq }),
    deleteTexture: noop,
    createFramebuffer: () => ({ id: ++seq }),
    deleteFramebuffer: noop,
    bindFramebuffer: noop,
    framebufferTexture2D: noop,
    drawBuffers: noop,
    bindTexture: noop,
    texImage2D: noop,
    texSubImage2D: (_t: number, _l: number, x: number, y: number) => { texSubUploads.push({ x, y }); },
    texImage3D: noop,
    texSubImage3D: noop,
    texParameteri: noop,
    texParameterf: noop,
    generateMipmap: noop,
    getParameter: (p: number) => (p === 46 ? 4096 : p === 47 ? 'TestGPU' : 0),
    getExtension: () => null,
    activeTexture: noop,
    useProgram: noop,
    uniform1i: (u: any, v: number) => { if (u?.n) uniforms[u.n] = v; },
    uniform1f: (u: any, v: number) => { if (u?.n) uniforms[u.n] = v; },
    uniform2f: noop, uniform3f: noop, uniform4f: noop,
    uniform2fv: noop, uniform3fv: noop, uniform4fv: noop, uniform4iv: noop,
    viewport: noop,
    scissor: noop,
    enable: noop,
    disable: noop,
    clearColor: noop,
    clear: noop,
    blendFunc: noop,
    drawArrays: noop,
    drawArraysInstanced: (mode: number, first: number, count: number, primCount: number) => {
      instDraws.push({ mode, first, count, primCount });
    },
    pixelStorei: noop,
  };
  return { gl: gl as unknown as WebGL2RenderingContext, instDraws, uniforms, texSubUploads };
}

// 1) WorldAtlas shelf packing + padding + LRU page eviction
const m1 = makeInstMockGL();
const atlas = new WorldAtlas(m1.gl);
const cvA = createCanvas(64, 96) as unknown as HTMLCanvasElement;
const cvB = createCanvas(128, 80) as unknown as HTMLCanvasElement;
atlas.beginFrame();
const eA = atlas.ensure('treeA', cvA, 64, 96)!;
const eB = atlas.ensure('treeB', cvB, 128, 80)!;
assert.ok(eA && eB);
assert.equal(eA.page, 0);
assert.equal(eB.page, 0);
assert.equal(eA.px, WORLD_ATLAS_PAD);
assert.equal(eA.py, WORLD_ATLAS_PAD);
assert.equal(eB.px, WORLD_ATLAS_PAD + 64 + WORLD_ATLAS_PAD * 2);
assert.ok(atlas.uploadMB > 0);

// 命中缓存零上传
atlas.beginFrame();
const eA2 = atlas.ensure('treeA', cvA, 64, 96)!;
assert.strictEqual(eA2, eA);
assert.equal(atlas.uploadMB, 0);

// 同尺寸新图源原地覆盖更新（不增页、不泄漏槽位）
const cvA2 = createCanvas(64, 96) as unknown as HTMLCanvasElement;
const eA3 = atlas.ensure('treeA', cvA2, 64, 96)!;
assert.strictEqual(eA3, eA);
assert.equal(atlas.entryCount, 2);
assert.ok(atlas.uploadMB > 0);

// 超大贴图拒绝打包，交回 Canvas2D 回退
assert.equal(atlas.ensure('tooBig', cvA, WORLD_ATLAS_SIZE, 100), null);

// 塞满 4 页后触发 LRU 页淘汰
const bigBlock = createCanvas(1020, 1020) as unknown as HTMLCanvasElement;
for (let i = 0; i < WORLD_ATLAS_MAX_PAGES * 4 + 2; i++) {
  atlas.beginFrame();
  atlas.ensure('big' + i, bigBlock, 1020, 1020);
}
assert.equal(atlas.pageCount, WORLD_ATLAS_MAX_PAGES, 'atlas pages must stay capped at MAX_PAGES');
assert.equal(atlas.get('treeB'), null, 'oldest unused page entries must be evicted on LRU recycle');

// 2) WorldSpriteBatch 自动合批与容量倍增
const batch = new WorldSpriteBatch();
const tex1 = { id: 101 } as unknown as WebGLTexture;
const tex2 = { id: 102 } as unknown as WebGLTexture;
for (let i = 0; i < 9000; i++) {
  batch.push(tex1, i, i, 32, 48, 0, 0, 1, 1, 1, 1, 1, 1, 0.5);
}
batch.push(tex2, 0, 0, 16, 16, 0, 0, 1, 1, 1, 1, 1, 1, 0);
assert.equal(batch.n, 9001);
assert.equal(batch.segs.length, 2);
assert.equal(batch.segs[0].count, 9000);
assert.equal(batch.segs[1].count, 1);
assert.equal(batch.data.length, 16384 * WORLD_INST_FLOATS);

// 3) GLStage 5000 棵同图集树 = 1 次 drawArraysInstanced，总 drawCalls <= 8
const m2 = makeInstMockGL();
const stageCanvas = createCanvas(1280, 800) as unknown as HTMLCanvasElement;
(stageCanvas as any).addEventListener = () => {};
const stage = new GLStage(stageCanvas, m2.gl);
stage.resize(1280, 800);
assert.ok(stage.worldAtlas, 'GLStage must initialize WorldAtlas when instancing is supported');

// 假造 ground.ready + terrain 令 groundOn = true
(stage as any).ground = {
  ready: true,
  update: () => true,
  tilesThisFrame: 1,
  texelsThisFrame: 0,
  front: { a: { id: 201 }, b: { id: 202 }, tpw: 1, W: 64, H: 64 },
  noise: { id: 203 },
  sampleOrigin: () => [0, 0],
};

const treeCv = createCanvas(48, 64) as unknown as HTMLCanvasElement;
const treeEntry = stage.worldAtlas!.ensure('T:pine:0:1', treeCv, 48, 64)!;
for (let i = 0; i < 5000; i++) {
  stage.worldUnder.push(
    treeEntry.tex, (i % 100) * 12, Math.floor(i / 100) * 14, 48, 64,
    treeEntry.u0, treeEntry.v0, treeEntry.u1, treeEntry.v1, 1, 1, 1, 1, 1.5,
  );
}

const sceneCv = createCanvas(1280, 800) as unknown as HTMLCanvasElement;
const P: PostParams = {
  t: 1, mul: [1, 1, 1], warm: 0, dusk: 0,
  sense: { x: 640, y: 400, R: 600, on: true, ink: [0, 0, 0], glow: [1, 1, 1], hide: 0, alarm: 0 },
  atmo: null, fog: [0, 0, 0, 0], fogBands: 0, flash: [0, 0, 0, 0], tint: [0, 0, 0, 0],
  vig: 0, hurt: 0, fade: 0, aberr: 0, bloom: 0, grain: 0, shocks: [], sat: 0,
  ground: { view: { camX: 0, camY: 0, zoom: 1, cssW: 1280, cssH: 800, season: 0, scale: 1 }, provider: () => ({} as any) },
};
stage.frame(sceneCv, 1280, 800, 1, P, true);
assert.equal(m2.instDraws.length, 1, '5000 trees on one atlas page must issue exactly 1 instanced draw call');
assert.equal(m2.instDraws[0].primCount, 5000);
assert.equal(m2.uniforms.uWorldUnderOn, 1);
assert.equal(m2.uniforms.uWorldOverOn, 0);
assert.ok(stage.drawCalls <= 8, `expected <= 8 total GL draw calls, got ${stage.drawCalls}`);

// 静止帧沿用上一帧世界层时：不再重复提交 worldUnder instanced draw，仍保持 uWorldUnderOn=1
m2.instDraws.length = 0;
stage.frame(sceneCv, 1280, 800, 1, P, false);
assert.equal(m2.instDraws.length, 0);
assert.equal(m2.uniforms.uWorldUnderOn, 1);

// 4) WorldAtlas Mipmap 支持：仅对脏页执行 generateMipmap，未更新帧零冗余生成
let mipGens = 0;
const mipGl = {
  ...m1.gl,
  TEXTURE_MAX_LEVEL: 0x813d,
  LINEAR_MIPMAP_NEAREST: 0x2701,
  generateMipmap: () => { mipGens++; },
} as unknown as WebGL2RenderingContext;
const mipAtlas = new WorldAtlas(mipGl);
mipAtlas.beginFrame();
mipAtlas.ensure('m1', cvA, 64, 96);
mipAtlas.flushMipmaps();
assert.equal(mipGens, 1, 'dirty page generates mipmap once on flush');
mipAtlas.beginFrame();
mipAtlas.ensure('m1', cvA, 64, 96);
mipAtlas.flushMipmaps();
assert.equal(mipGens, 1, 'clean cached frame must not regenerate mipmap');

console.log('P1 instanced sprite pipeline: WorldAtlas, WorldSpriteBatch (5000 trees = 1 draw call), and GLStage composition passed');
