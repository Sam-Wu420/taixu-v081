// v0.70 原创化：按 src/data/rename.ts 的对照表，一次性改写源码 / 模组 / 文档里的文字（node 版，无需 tsx）。
// 用法：node tools/apply-rename.mjs [--dry]
// 只改中文文字（内部 id 全是英文，不受影响）；src/data/rename.ts 本身不改。
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname, sep } from 'path';

const DRY = process.argv.includes('--dry');
const ROOTS = ['src', 'mods', '.claude/skills', 'studio', 'index.html', 'README.md', 'tools', 'docs', 'android', 'desktop', 'dist-mods', 'platform', 'taixu-mod'];
const EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.py', '.html', '.css', '.txt']);
const SKIP = [join('src', 'data', 'rename.ts'), 'node_modules', join('tools', 'out'), join('tools', 'apply-rename'), join('android', 'build') + sep, join('desktop', 'release') + sep, join('dist-mods', 'build') + sep];
const SKIP_PREFIX = ['dist' + sep];
const HAN = [
  [/韩(?=大哥|师兄|师弟|道友|公子|前辈|兄|小子|长老|师叔|老魔|真人|仙师|姓|……|、韩)/g, '苏'],
  [/姓苏/g, '姓苏'],
];

const src = readFileSync('src/data/rename.ts', 'utf8');
const RENAME = [...src.matchAll(/\['([^']+)', '([^']+)'\]/g)].map((m) => [m[1], m[2]]);

const files = [];
const walk = (p) => {
  if (SKIP.some((s) => p.includes(s)) || SKIP_PREFIX.some((s) => p.startsWith(s))) return;
  let st; try { st = statSync(p); } catch { return; }
  if (st.isDirectory()) { for (const f of readdirSync(p)) walk(join(p, f)); return; }
  if (EXT.has(extname(p))) files.push(p);
};
for (const r of ROOTS) walk(r);

let changed = 0; const count = new Map();
for (const f of files) {
  const before = readFileSync(f, 'utf8');
  let s = before;
  for (const [a, b] of RENAME) {
    if (!s.includes(a)) continue;
    const n = s.split(a).length - 1; count.set(a, (count.get(a) ?? 0) + n);
    s = s.split(a).join(b);
  }
  for (const [re, b] of HAN) s = s.replace(re, () => { count.set('韩·', (count.get('韩·') ?? 0) + 1); return b; });
  if (s !== before) { changed++; if (!DRY) writeFileSync(f, s); }
}
console.log(`${DRY ? '（演练）' : ''}改动文件 ${changed} 个；替换：`);
console.log([...count].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(' '));
