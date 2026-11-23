// 收官 H3：动效清理的自查——界面动画只许动 transform / opacity。
// 扫 src 下所有 .css：@keyframes 里出现的属性、transition 里列的属性，凡不是 transform / opacity（及 visibility / translate / scale / rotate）的都列出来。
// 用法：node tools/check-anim.mjs　　没有问题时输出「动效检查：通过」，退出码 0；有就逐条列出、退出码 1。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const files = []; (function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.css')) files.push(p); } })('src');
const OK = /^(opacity|transform|translate|scale|rotate|visibility|offset|animation-timing-function)$/;
const bad = [];
for (const f of files) {
  const s = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of s.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/g)) {
    const props = [...new Set([...m[2].matchAll(/([\w-]+)\s*:/g)].map((x) => x[1]).filter((p) => !OK.test(p)))];
    if (props.length) bad.push(`${f}  @keyframes ${m[1]}：${props.join(', ')}`);
  }
  for (const m of s.matchAll(/(?<![\w-])transition\s*:\s*([^;}]+)/g)) {
    const top = []; let dep = 0, cur = ''; for (const ch of m[1]) { if (ch === '(') dep++; if (ch === ')') dep--; if (ch === ',' && !dep) { top.push(cur); cur = ''; } else cur += ch; } top.push(cur);
    const props = top.map((x) => x.trim().split(/\s+/)[0]).filter((p) => p && !OK.test(p) && p !== 'none');
    if (props.length) bad.push(`${f}  transition：${props.join(', ')}　（${m[1].trim().slice(0, 50)}）`);
  }
}
if (bad.length) { console.log(bad.join('\n')); console.log(`动效检查：${bad.length} 处不合规`); process.exit(1); }
console.log(`动效检查：通过（${files.length} 个样式文件，@keyframes 和 transition 里只有 transform / opacity）`);
