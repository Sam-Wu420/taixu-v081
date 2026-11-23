// 旧格式为 0/1 字符串，新格式为 r + 交替零/一段长度（36 进制）。
// 对外部存档进行大小和结构预检，避免错误数据被静默当作已探索地形。
export const MAX_FOG_CELLS = 2_000_000;
export function parseFog(s: string): { length: number; runs?: number[] } {
  if (typeof s !== 'string') throw new Error('invalid fog');
  if (s.length > MAX_FOG_CELLS * 4 + 1) throw new Error('fog too large');
  if (!s.startsWith('r')) {
    if (s.length > MAX_FOG_CELLS || !/^[01]*$/.test(s)) throw new Error('invalid legacy fog');
    return { length: s.length };
  }
  const parts = s.slice(1).split(',');
  if (parts.length > MAX_FOG_CELLS + 1) throw new Error('too many fog runs');
  let length = 0; const runs: number[] = [];
  for (const part of parts) {
    if (!/^[0-9a-z]+$/.test(part) || part.length > 6) throw new Error('invalid fog run');
    const n = parseInt(part, 36);
    if (!Number.isSafeInteger(n) || n > MAX_FOG_CELLS - length) throw new Error('fog too large');
    runs.push(n); length += n;
  }
  return { length, runs };
}
export function encodeFog(a: Uint8Array): string {
  let out = 'r', cur = 0, run = 0;
  for (let i = 0; i < a.length; i++) { const v = a[i] ? 1 : 0; if (v === cur) run++; else { out += run.toString(36) + ','; cur = v; run = 1; } }
  return out + run.toString(36);
}
export function decodeFog(s: string | undefined, into: Uint8Array) {
  if (!s) { into.fill(0); return; }
  const parsed = parseFog(s); // 验证成功之后才修改目标数组。
  into.fill(0);
  if (!parsed.runs) { for (let i = 0; i < Math.min(s.length, into.length); i++) into[i] = s[i] === '1' ? 1 : 0; return; }
  let i = 0, v = 0;
  for (const n of parsed.runs) { if (v) into.fill(1, i, Math.min(into.length, i + n)); i += n; v ^= 1; }
}
