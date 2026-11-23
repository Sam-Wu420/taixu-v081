// 把几个模组放进构建好的游戏目录（dist/bundled-mods/），桌面版、安卓版第一次启动时自动装上并启用（src/mod/store.ts 的 seedBundled）。
// 用法：node tools/bundle-mods.mjs [--into=dist] [--mods=wanbao,shahe]
//   版本取 dist-mods/b-set.json 里登记的那一版（B 版适配过的），名单里没有就取 dist-mods 里版本号最大的那个。
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const INTO = resolve(arg('into', 'dist')), MODS = arg('mods', 'wanbao,shahe').split(',').filter(Boolean), SRC = resolve('dist-mods');
if (!existsSync(join(INTO, 'index.html'))) { console.error(`${INTO} 里没有 index.html：先 npm run build`); process.exit(1); }
const set = existsSync(join(SRC, 'b-set.json')) ? JSON.parse(readFileSync(join(SRC, 'b-set.json'), 'utf8')) : [];
const vnum = (v) => v.split('.').map((s) => parseInt(s, 10) || 0).reduce((a, x) => a * 1000 + x, 0);
const out = join(INTO, 'bundled-mods');
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const list = [];
for (const id of MODS) {
  let ver = set.find((m) => m.id === id)?.version;
  if (!ver) ver = readdirSync(SRC).map((f) => f.match(new RegExp(`^${id}-(\\d+\\.\\d+\\.\\d+)\\.fmod$`))?.[1]).filter(Boolean).sort((a, b) => vnum(b) - vnum(a))[0];
  if (!ver) { console.error(`找不到模组 ${id}`); process.exit(1); }
  const file = `${id}-${ver}.fmod`, b = JSON.parse(readFileSync(join(SRC, file), 'utf8'));
  if (b?.manifest?.id !== id || b.manifest.version !== ver) { console.error(`${file} 内容不对`); process.exit(1); }
  copyFileSync(join(SRC, file), join(out, file));
  list.push({ id, version: ver, file, name: b.manifest.name });
  console.log(`  ${b.manifest.name} v${ver}`);
}
writeFileSync(join(out, 'index.json'), JSON.stringify(list, null, 2) + '\n');
console.log(`随包模组 ${list.length} 个 → ${out}`);
