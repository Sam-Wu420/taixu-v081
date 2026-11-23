// 模组打包：把一个模组文件夹打成 .fmod（单个 JSON 文件），可直接导入游戏或上传到模组平台。
// 用法：npx tsx tools/mod-pack.ts mods/qingming [输出目录=dist-mods]
// 文件夹里要有 manifest.json 与入口 index.js（可以 import 同文件夹里的其他 .js，打包时并成一个文件）；
// 图片（png / webp / jpg / gif）与声音（mp3 / ogg / wav）转成 data: 网址，.json / .txt 保留原文。
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'fs';
import { join, extname, relative, resolve } from 'path';
import { build } from 'esbuild';
import { MOD_FORMAT, type ModBundle } from '../src/mod/types';
import { validateBundle, MOD_MAX_BYTES } from '../src/mod/validate';

const dir = resolve(process.argv[2] ?? '');
const out = resolve(process.argv[3] ?? 'dist-mods');
if (!process.argv[2]) { console.error('用法：npx tsx tools/mod-pack.ts <模组文件夹> [输出目录]'); process.exit(1); }
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const main = manifest.main ?? 'index.js';
delete manifest.main;

const MIME: Record<string, string> = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
const TEXT = new Set(['.json', '.txt', '.md']);
const files: Record<string, string> = {};
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f), rel = relative(dir, p).split('\\').join('/');
    if (statSync(p).isDirectory()) { if (f !== 'node_modules' && !f.startsWith('.')) walk(p); continue; }
    const ext = extname(f).toLowerCase();
    if (rel === 'manifest.json' || ext === '.js' || ext === '.ts' || ext === '.mjs') continue;
    if (MIME[ext]) files[rel] = `data:${MIME[ext]};base64,` + readFileSync(p).toString('base64');
    else if (TEXT.has(ext)) files[rel] = readFileSync(p, 'utf8');
  }
};
walk(dir);
// 入口代码：打成一个 ES 模块（不压缩，方便别人看；游戏只认默认导出 setup）
const r = await build({ entryPoints: [join(dir, main)], bundle: true, format: 'esm', platform: 'browser', target: 'es2020', write: false, legalComments: 'none', charset: 'utf8' });
files['index.js'] = r.outputFiles[0].text;

const bundle: ModBundle = { format: MOD_FORMAT, manifest, main: 'index.js', files };
const err = validateBundle(bundle);
if (err) { console.error('模组包不合格：' + err); process.exit(1); }
const text = JSON.stringify(bundle);
if (text.length > MOD_MAX_BYTES) { console.error(`模组包太大：${(text.length / 1048576).toFixed(1)}MB（上限 20MB）`); process.exit(1); }
mkdirSync(out, { recursive: true });
const file = join(out, `${manifest.id}-${manifest.version}.fmod`);
writeFileSync(file, text);
console.log(`已打包 ${file}（${(text.length / 1024).toFixed(0)} KB，${Object.keys(files).length} 个文件）`);
