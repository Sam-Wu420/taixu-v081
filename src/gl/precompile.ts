// r10：着色器提前在后台编译。
// 以前进游戏时 GLStage.init 一口气同步编十来个大着色器（后期合成那一个最大），浏览器的着色器缓存是冷的时候（第一次进、更新以后第一次进）
// 要二三十秒，期间主线程卡死、显卡进程也在忙，连 CSS 动画都不动，看着就是死机。
// 现在：加载画面里先建好 WebGL 上下文、把这些程序全部发出去编（compileShader / linkProgram 本身不等结果），
// 用 KHR_parallel_shader_compile 的 COMPLETION_STATUS_KHR 每帧问一次编好没有——不阻塞，加载动画照常走；
// 编好以后正式建 GLStage 时，各处的 compile() 先来这里认领现成的程序，查 LINK_STATUS 就是立刻返回。
// 不支持这个扩展的浏览器：照旧在用到时同步编（加载画面已经画出来了再编）。

interface Pending { p: WebGLProgram; vs: WebGLShader; fs: WebGLShader }
const PRE = new WeakMap<WebGL2RenderingContext, Map<string, Pending>>();
const key = (vs: string, fs: string) => vs + '\u0000' + fs;

/** 发出编译（不查结果）。同一份源码只发一次 */
export function startProgram(gl: WebGL2RenderingContext, vs: string, fs: string): Pending {
  let m = PRE.get(gl); if (!m) { m = new Map(); PRE.set(gl, m); }
  const k = key(vs, fs), had = m.get(k); if (had) return had;
  const mk = (t: number, s: string) => { const sh = gl.createShader(t)!; gl.shaderSource(sh, s); gl.compileShader(sh); return sh; };
  const p = gl.createProgram()!, v = mk(gl.VERTEX_SHADER, vs), f = mk(gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
  const r = { p, vs: v, fs: f }; m.set(k, r); return r;
}

/** 认领提前编好的程序（没有就返回 null，由调用方照旧自己编）。编失败时抛出和原来一样的错 */
export function takeProgram(gl: WebGL2RenderingContext, vs: string, fs: string, tag = 'shader'): WebGLProgram | null {
  const m = PRE.get(gl), k = key(vs, fs), r = m?.get(k); if (!r) return null;
  m!.delete(k);
  if (!gl.getProgramParameter(r.p, gl.LINK_STATUS)) {
    const log = (gl.getShaderParameter(r.vs, gl.COMPILE_STATUS) ? '' : gl.getShaderInfoLog(r.vs)) || (gl.getShaderParameter(r.fs, gl.COMPILE_STATUS) ? '' : gl.getShaderInfoLog(r.fs)) || gl.getProgramInfoLog(r.p) || 'link';
    throw new Error(tag + ': ' + log);
  }
  return r.p;
}

/** 这一批编好了几个（不阻塞）；没有并行编译扩展时返回 -1（问不了，只能等真用时同步编） */
export function programsDone(gl: WebGL2RenderingContext, list: Pending[]): number {
  const ext = gl.getExtension('KHR_parallel_shader_compile') as { COMPLETION_STATUS_KHR: number } | null;
  if (!ext) return -1;
  let n = 0; for (const r of list) if (gl.getProgramParameter(r.p, ext.COMPLETION_STATUS_KHR) === true) n++;
  return n;
}
