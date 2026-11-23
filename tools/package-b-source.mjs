import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = resolve(root, '..', '验证');
const output = resolve(process.argv[2] ?? join(work, 'taixu-v0.57-B-source-preview.zip'));
// 用户给定的硬线：源码包不得超过 120 MB；超过 100 MB 先警告。
const limit = 120 * 1024 * 1024;
const warnAt = 100 * 1024 * 1024;
const paths = [
  'src', 'public', 'docs', 'desktop', 'platform', '.claude', 'taixu-mod', 'tools',
  'mods/sdk', 'mods/qingming', 'mods/xianzong', 'mods/yizhan', 'mods/leize', 'mods/shahe', 'mods/README.md',
  '.env.production', '.gitignore', 'README.md', 'package.json', 'package-lock.json',
  'pnpm-lock.yaml', 'tsconfig.json', 'index.html', 'vite.config.ts', 'vite.slim.config.ts', 'vite.lowmem.config.ts',
  'B版交接说明.md',
];
// 可有可无的：v0.8.1 合并作者版本后 B版交接说明.md 不在了（交接看 docs/交接-*.md）
const OPTIONAL = new Set(['B版交接说明.md']);
const excluded = new Set(['tools/out', 'desktop/node_modules', 'desktop/release', 'platform/node_modules', 'docs/art-brief/ref_v054']);
mkdirSync(work, { recursive: true });
mkdirSync(dirname(output), { recursive: true });
const stage = mkdtempSync(join(work, 'b-source-'));
const pending = output + '.building.zip';
if (!stage.startsWith(work + sep)) throw new Error('临时目录不在验证目录中');

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, TSX_DISABLE_CACHE: '1', TEMP: work, TMP: work },
  });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || result.error?.message || '命令失败').trim());
}

function files(dir) {
  const result = [];
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (lstatSync(file).isDirectory()) result.push(...files(file));
    else result.push(file);
  }
  return result;
}

function hash(file) { return createHash('sha256').update(readFileSync(file)).digest('hex'); }
function slash(path) { return path.split(sep).join('/'); }

try {
  for (const name of paths) {
    const source = join(root, name);
    if (!existsSync(source)) { if (OPTIONAL.has(name)) continue; throw new Error('交付文件缺失：' + name); }
    if (name === 'tools') {
      mkdirSync(join(stage, name), { recursive: true });
      for (const child of readdirSync(source)) {
        if (child !== 'out') cpSync(join(source, child), join(stage, name, child), { recursive: true });
      }
      continue;
    }
    cpSync(source, join(stage, name), {
      recursive: true,
      filter: file => !excluded.has(slash(relative(root, file))),
    });
  }
  if (!existsSync(join(root, 'node_modules/vite'))) throw new Error('请先在源码目录运行 npm ci');
  symlinkSync(join(root, 'node_modules'), join(stage, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');

  console.log('构建快照预览与沙盒模组…');
  run(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build',
    '--config', 'tools/vite-b-preview.config.ts', '--outDir', 'preview'], stage);
  run(process.execPath, [join(root, 'node_modules/tsx/dist/cli.mjs'), 'tools/mod-pack.ts', 'mods/shahe', 'dist-mods'], stage);
  unlinkSync(join(stage, 'node_modules'));

  const originals = new Map();
  for (const dir of ['src/assets', 'public']) {
    for (const file of files(join(stage, dir))) originals.set(hash(file), slash(relative(stage, file)));
  }
  const map = {};
  for (const file of files(join(stage, 'preview/assets'))) {
    const original = originals.get(hash(file));
    if (!original) continue;
    map[slash(relative(join(stage, 'preview'), file))] = original;
    unlinkSync(file);
  }
  writeFileSync(join(stage, 'preview/asset-map.json'), JSON.stringify(map, null, 2));
  const manifest = JSON.parse(readFileSync(join(stage, 'mods/shahe/manifest.json'), 'utf8'));
  const mod = join(stage, 'dist-mods', `${manifest.id}-${manifest.version}.fmod`);
  if (!existsSync(mod)) throw new Error('沙盒包未生成');
  console.log(`预览复用 ${Object.keys(map).length} 个源码素材；沙盒包 ${manifest.id}-${manifest.version}.fmod`);

  run(process.platform === 'win32' ? 'tar.exe' : 'bsdtar',
    ['-a', '--options', 'zip:hdrcharset=UTF-8', '-cf', pending, '-C', stage, '.'], root);
  const bytes = statSync(pending).size;
  if (bytes > limit) throw new Error(`压缩包 ${bytes} 字节，超过上限 ${limit} 字节`);
  if (existsSync(output)) unlinkSync(output);
  renameSync(pending, output);
  console.log(`交付包：${output}`);
  console.log(`大小：${bytes} 字节（${(bytes / 1048576).toFixed(1)} MB）；上限：${limit} 字节；余量：${limit - bytes} 字节`);
  if (bytes > warnAt) console.warn(`警告：压缩包已超过 ${warnAt / 1048576} MB，接近 ${limit / 1048576} MB 硬线`);
} finally {
  if (existsSync(pending)) unlinkSync(pending);
  if (existsSync(join(stage, 'node_modules'))) unlinkSync(join(stage, 'node_modules'));
  // 只清理由本次 mkdtemp 创建的目录。
  rmSync(stage, { recursive: true, force: true });
}
