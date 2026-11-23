// P1 实例化精灵批次：预分配 8192 实例缓冲，按纹理连续段一次 drawArraysInstanced

export const WORLD_INST_FLOATS = 13; // x, y, w, h, u0, v0, u1, v1, r, g, b, a, sway
const INIT_CAP = 8192;

export const VS_WORLD_INST = `#version 300 es
layout(location=0) in vec2 aPos;
layout(location=1) in vec4 aInst;
layout(location=2) in vec4 aUV;
layout(location=3) in vec4 aCol;
layout(location=4) in float aSway;
uniform vec2 uRes;
out vec2 vUv;
out vec4 vCol;
void main() {
  vec2 p = aInst.xy + aPos * aInst.zw;
  p.x += (1.0 - aPos.y) * aSway;
  vec2 c = p / uRes * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
  vUv = mix(aUV.xy, aUV.zw, aPos);
  vCol = vec4(aCol.rgb * aCol.a, aCol.a);
}`;

export const FS_WORLD_INST = `#version 300 es
precision mediump float;
uniform sampler2D uTex;
in vec2 vUv;
in vec4 vCol;
out vec4 o;
void main() {
  vec4 t = texture(uTex, vUv);
  o = vec4(t.rgb * vCol.rgb, t.a * vCol.a);
}`;

export interface WorldBatchSeg {
  tex: WebGLTexture;
  start: number;
  count: number;
}

export class WorldSpriteBatch {
  data = new Float32Array(INIT_CAP * WORLD_INST_FLOATS);
  cap = INIT_CAP;
  n = 0;
  segs: WorldBatchSeg[] = [];

  reset() {
    this.n = 0;
    this.segs.length = 0;
  }

  push(
    tex: WebGLTexture,
    x: number, y: number, w: number, h: number,
    u0: number, v0: number, u1: number, v1: number,
    r = 1, g = 1, b = 1, a = 1, sway = 0,
  ) {
    if (a <= 0.002 || !(w > 0 && h > 0)) return;
    if (this.n >= this.cap) {
      const nextCap = this.cap * 2;
      const next = new Float32Array(nextCap * WORLD_INST_FLOATS);
      next.set(this.data);
      this.data = next;
      this.cap = nextCap;
    }
    const segs = this.segs;
    const last = segs.length ? segs[segs.length - 1] : null;
    if (last && last.tex === tex) {
      last.count++;
    } else {
      segs.push({ tex, start: this.n, count: 1 });
    }
    const o = this.n * WORLD_INST_FLOATS;
    const d = this.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = w; d[o + 3] = h;
    d[o + 4] = u0; d[o + 5] = v0; d[o + 6] = u1; d[o + 7] = v1;
    d[o + 8] = r; d[o + 9] = g; d[o + 10] = b; d[o + 11] = a;
    d[o + 12] = sway;
    this.n++;
  }
}
