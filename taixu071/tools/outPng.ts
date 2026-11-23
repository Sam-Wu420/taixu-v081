// 测试截图输出：统一写到 tools/out/（.gitignore 已忽略），跨平台可用。
// 原先各测试直接写死 /home/user/xxx.png，在 Windows / CI 上会 ENOENT，等于这些测试根本跑不了。
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');

/** 把一张 PNG 缓冲写进 tools/out/，返回落盘路径 */
export function outPng(name: string, data: Uint8Array) {
  mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  writeFileSync(file, data);
  return file;
}
