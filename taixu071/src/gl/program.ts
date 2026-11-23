/** 编译并链接 WebGL 程序；无论成功还是失败都释放临时着色器。 */
export function compileProgram(gl: WebGL2RenderingContext, vsSource: string, fsSource: string) {
  let program: WebGLProgram | null = null, vs: WebGLShader | null = null, fs: WebGLShader | null = null;
  try {
    const mk = (type: number, source: string) => {
      const shader = gl.createShader(type); if (!shader) throw new Error('WebGL shader allocation failed');
      // 在发生异常前登记，使失败路径也能释放。
      if (type === gl.VERTEX_SHADER) vs = shader; else fs = shader;
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'shader compilation failed');
      return shader;
    };
    program = gl.createProgram(); if (!program) throw new Error('WebGL program allocation failed');
    const v = mk(gl.VERTEX_SHADER, vsSource), f = mk(gl.FRAGMENT_SHADER, fsSource);
    gl.attachShader(program, v); gl.attachShader(program, f); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'program link failed');
    gl.detachShader(program, v); gl.detachShader(program, f);
    const p = program, uniforms = new Map<string, WebGLUniformLocation | null>();
    return { p, u: (name: string) => { if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(p, name)); return uniforms.get(name)!; } };
  } catch (e) {
    if (program) gl.deleteProgram(program);
    throw e;
  } finally {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
  }
}
