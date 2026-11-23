// 第三轮实拍脚本：把 _pre.js（等入口、冻结 / 解冻）拼到每个 *.src.js 前面，生成 *.js（给 edge-shot 的 --eval / --step 用）
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const pre = readFileSync(new URL('./_pre.js', import.meta.url), 'utf8');
for (const f of readdirSync(new URL('.', import.meta.url))) {
  if (!f.endsWith('.src.js')) continue;
  const body = readFileSync(new URL('./' + f, import.meta.url), 'utf8');
  writeFileSync(new URL('./' + f.replace('.src.js', '.js'), import.meta.url), '(async () => {\n' + pre + '\n' + body + '\n})()');
}
