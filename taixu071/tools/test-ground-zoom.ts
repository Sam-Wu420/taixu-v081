import assert from 'node:assert/strict';
import { Ground, type GroundTerrain, type GroundSegs } from '../src/gl/ground';

function makeMockGL(): WebGL2RenderingContext {
  let seq = 0;
  const noop = () => {};
  const gl: Record<string, any> = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    TEXTURE_2D: 10, TEXTURE_2D_ARRAY: 11, RGBA: 12, RGBA8: 13, RGBA16F: 14, RGBA32F: 15,
    UNSIGNED_BYTE: 16, FLOAT: 17, NEAREST: 18, LINEAR: 19, LINEAR_MIPMAP_LINEAR: 20,
    TEXTURE_MIN_FILTER: 21, TEXTURE_MAG_FILTER: 22, TEXTURE_WRAP_S: 23, TEXTURE_WRAP_T: 24,
    CLAMP_TO_EDGE: 25, REPEAT: 26, FRAMEBUFFER: 27, COLOR_ATTACHMENT0: 28, COLOR_ATTACHMENT1: 29,
    TEXTURE0: 30, TRIANGLES: 31, SCISSOR_TEST: 32, BLEND: 33, DEPTH_TEST: 34,
    UNPACK_FLIP_Y_WEBGL: 35, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 36,
    createProgram: () => ({ id: ++seq }),
    createShader: (t: number) => ({ id: ++seq, t }),
    shaderSource: noop, compileShader: noop, attachShader: noop, linkProgram: noop,
    detachShader: noop, deleteShader: noop, deleteProgram: noop,
    getShaderParameter: () => true, getProgramParameter: () => true,
    getShaderInfoLog: () => '', getProgramInfoLog: () => '',
    getUniformLocation: (_p: any, n: string) => ({ n }),
    createTexture: () => ({ id: ++seq }),
    deleteTexture: noop,
    createFramebuffer: () => ({ id: ++seq }),
    deleteFramebuffer: noop,
    bindFramebuffer: noop,
    framebufferTexture2D: noop,
    drawBuffers: noop,
    bindTexture: noop,
    texImage2D: noop,
    texSubImage2D: noop,
    texImage3D: noop,
    texSubImage3D: noop,
    texParameteri: noop,
    texParameterf: noop,
    generateMipmap: noop,
    getExtension: () => null,
    activeTexture: noop,
    useProgram: noop,
    uniform1i: noop, uniform1f: noop, uniform2f: noop, uniform3fv: noop, uniform4fv: noop, uniform4iv: noop,
    bindVertexArray: noop,
    viewport: noop,
    scissor: noop,
    enable: noop,
    disable: noop,
    drawArrays: noop,
    pixelStorei: noop,
  };
  return gl as unknown as WebGL2RenderingContext;
}

const terrain: GroundTerrain = {
  a: new Float32Array(16 * 16 * 4),
  b: new Float32Array(16 * 16 * 4),
  W: 16,
  H: 16,
  macro: [1, 1],
  scale: 1,
};

const emptySegs: GroundSegs = {
  river: [],
  road: [],
  town: [],
  zone: [],
  sect: [],
  forest: [],
};

const provider = () => emptySegs;
const vao = {} as WebGLVertexArrayObject;

// 1) Initial cold frame + continuous zoom out (1.0 -> 0.044) -> settle -> continuous zoom in (0.044 -> 1.0)
{
  const g = new Ground(makeMockGL());
  g.setTerrain(terrain);

  const view = (zoom: number, camX = 0, camY = 0) => ({
    camX, camY, zoom, cssW: 1647, cssH: 952, scale: 1.5, season: 0,
  });

  // Cold start: front must be ready in frame 1
  assert.equal(g.update(view(1.0), provider, vao, 4096), true);
  assert.ok(g.front);
  assert.equal(g.rebuilds, 1);

  // Smooth zoom out across 40 frames (~7.5% per frame, mirroring user scroll wheel)
  let z = 1.0;
  let maxZoomOutTexels = 0;
  const startsBeforeOut = g.jobsStarted;
  const rebuildsBeforeOut = g.rebuilds;
  for (let i = 0; i < 40; i++) {
    z *= 0.925;
    assert.equal(g.update(view(z, i * 18, i * 6), provider, vao, 4096), true);
    maxZoomOutTexels = Math.max(maxZoomOutTexels, g.texelsThisFrame);
    const F = g.front!;
    const hw = 1647 / 2 / z, hh = 952 / 2 / z;
    assert.ok(F.W / F.tpw >= 2 * hw + 4 && F.H / F.tpw >= 2 * hh + 4, `zoomOut frame ${i}: front must cover viewport`);
  }
  const fullArea = g.front!.W * g.front!.H;
  assert.ok(maxZoomOutTexels <= fullArea * 0.35, `zoomOut must never do full-buffer sync dump (${maxZoomOutTexels} vs ${fullArea})`);
  assert.equal(g.jobsStarted - startsBeforeOut, g.rebuilds - rebuildsBeforeOut,
    'zoomOut must finish every started job without mid-flight aborts');

  // Settle at far zoom for 20 frames -> refines cleanly to exact tpw at <= 2 strips/frame
  let maxSettleTexels = 0;
  for (let i = 0; i < 20; i++) {
    g.update(view(z, 720, 240), provider, vao, 4096);
    maxSettleTexels = Math.max(maxSettleTexels, g.texelsThisFrame);
  }
  assert.ok(maxSettleTexels <= fullArea * 0.28, `settle must stay incremental (${maxSettleTexels} vs ${fullArea})`);
  assert.ok(Math.abs(g.front!.tpw / (z * Math.min(1.5, Math.sqrt(10.5e6 / ((1647 + 0.5 * 1647) * 1.5 * (952 + 0.5 * 1647) * 1.5)) * 1.5)) - 1) < 0.08);

  // Smooth zoom in across 40 frames
  let maxZoomInTexels = 0;
  for (let i = 0; i < 40; i++) {
    z /= 0.925;
    assert.equal(g.update(view(z, 720 - i * 10, 240 - i * 4), provider, vao, 4096), true);
    maxZoomInTexels = Math.max(maxZoomInTexels, g.texelsThisFrame);
    const F = g.front!;
    const hw = 1647 / 2 / z, hh = 952 / 2 / z;
    assert.ok(F.W / F.tpw >= 2 * hw + 4 && F.H / F.tpw >= 2 * hh + 4, `zoomIn frame ${i}: front must cover viewport`);
  }
  assert.ok(maxZoomInTexels <= fullArea * 0.35, `zoomIn must never do full-buffer sync dump (${maxZoomInTexels} vs ${fullArea})`);
}

// 2) Instant 20x jump (teleport / keybind zoom reset): must fall back to full sync rebuild so viewport is covered
{
  const g = new Ground(makeMockGL());
  g.setTerrain(terrain);
  const view = (zoom: number) => ({ camX: 0, camY: 0, zoom, cssW: 1647, cssH: 952, scale: 1.5, season: 0 });
  g.update(view(1.0), provider, vao, 4096);
  const before = g.rebuilds;
  g.update(view(0.05), provider, vao, 4096);
  assert.equal(g.rebuilds, before + 1, 'instant 20x jump must synchronously rebuild front');
  const F = g.front!;
  assert.ok(F.W / F.tpw >= (1647 / 0.05) + 4, 'rebuilt front covers jumped viewport');
}

// 3) Streaming macro window: front.scroll and back.drawAbs must never ping-pong winStep/packWindow inside the same frame
{
  let packCount = 0;
  const stepsSeen: number[] = [];
  const streamTerrain: GroundTerrain = {
    W: 4096,
    H: 4096,
    macro: [1, 1],
    scale: 16,
    packWindow(_x0, _y0, _w, _h, step) {
      packCount++;
      stepsSeen.push(step);
    },
  };
  const g = new Ground(makeMockGL());
  g.setTerrain(streamTerrain);
  const view = (zoom: number, camX = 32768, camY = 32768) => ({
    camX, camY, zoom, cssW: 1647, cssH: 952, scale: 1.5, season: 0,
  });
  assert.equal(g.update(view(0.6), provider, vao, 4096), true);
  let z = 0.6;
  for (let i = 0; i < 30; i++) {
    const before = packCount;
    z *= 0.94;
    g.update(view(z, 32768 + i * 25, 32768 + i * 10), provider, vao, 4096);
    assert.ok(packCount - before <= 1, `frame ${i}: macro window must not re-upload twice in one frame`);
  }
  for (let i = 1; i < stepsSeen.length; i++) {
    assert.ok(stepsSeen[i] >= stepsSeen[i - 1], `zoomOut winStep must be monotonic without ping-pong (${stepsSeen.join(',')})`);
  }
}

console.log('Ground zoom cache test passed: 0 full-frame sync stalls across smooth zoom in/out, full viewport coverage preserved');
