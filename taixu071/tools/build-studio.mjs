// 魔搭创空间版打包：品牌「太虚问道录 · 寰宇篇」，素材外置成文件（首屏只下几 MB、之后走缓存），
// 附上创空间后端（FastAPI 托管 + 云存档 + NPC 自由对话），输出到 dist-studio/，可直接推到创空间仓库。
// 用法：node tools/build-studio.mjs
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, copyFileSync, cpSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import path from 'path';

const OUT = 'dist-studio', WEB = path.join(OUT, '_web');
rmSync(OUT, { recursive: true, force: true }); mkdirSync(WEB, { recursive: true });
execFileSync('npx', ['vite', 'build', '--config', 'vite.lowmem.config.ts', '--outDir', WEB, '--emptyOutDir'], { stdio: 'inherit', env: { ...process.env, VITE_BRAND: 'taixu', BUILD_OUT: WEB } });

// ---- 素材外置：占位符 __INLn__ 与 assets/ 里的素材 → media/<内容哈希>.<扩展名>
const map = JSON.parse(readFileSync(path.join(WEB, '.inl.json'), 'utf8'));
const MEDIA = path.join(OUT, 'media'); mkdirSync(MEDIA, { recursive: true });
const put = (src) => { const b = readFileSync(src), n = createHash('sha1').update(b).digest('hex').slice(0, 14) + path.extname(src).toLowerCase(); const dst = path.join(MEDIA, n); if (!existsSync(dst)) writeFileSync(dst, b); return './media/' + n; };
const A = path.join(WEB, 'assets'); mkdirSync(path.join(OUT, 'assets'), { recursive: true });
const files = readdirSync(A);
let js = '';
for (const f of files.filter((f) => /\.(js|css)$/.test(f))) {
  let s = readFileSync(path.join(A, f), 'utf8');
  const fix = (u) => u.replace('./media/', '/media/');   // 一律从站点根取（脚本里 new URL(…, 脚本地址) 与 CSS 都不会解析错）
  s = s.replace(/__INL(\d+)__/g, (_, i) => fix(put(map[+i])));
  s = s.replace(/(?:\.\/)?(?:assets\/)?([\w.-]+\.(?:webp|png|jpe?g|gif|ogg|mp3|wav|m4a|woff2?|ttf|svg))(?=["')])/g, (m, f2) => (files.includes(f2) ? fix(put(path.join(A, f2))) : m));
  writeFileSync(path.join(OUT, 'assets', f), s);
  if (f.endsWith('.js')) js = f;
}
// ---- 首页：品牌、iframe 存档兜底、主脚本延后注入（平台外层 iframe 不会误判超时）
let html = readFileSync(path.join(WEB, 'index.html'), 'utf8');
const ver = createHash('sha1').update(readFileSync(path.join(OUT, 'assets', js))).digest('hex').slice(0, 8);
html = html.replace(/<title>[^<]*<\/title>/, '<title>太虚问道录 · 寰宇篇</title>\n  <meta name="description" content="一介凡人，逆天修仙。开放地图、宗门任务、坊市交易、斗法与渡劫，与人界众生自由交谈；打开即玩，支持云存档与存档分享。" />')
  .replace('<div class="t1">太虚问道录</div>', '<div class="t1">太虚问道录</div>').replace('<div class="t2">人 界 篇</div>', '<div class="t2">寰 宇 篇</div>')
  .replace(/正在载入人界……<br><b>[^<]*<\/b>[^<]*/, '正在载入太虚……<br><b>首次进入约需下载 15 MB</b>，之后走缓存几乎秒开')
  .replace(/<script defer src="\.\/assets\/[^"]+"><\/script>\s*/g, '')
  .replace('<head>', `<head>\n  <script>${readFileSync('studio/storage-probe.js', 'utf8')}</script>`)
  .replace('</body>', `  <script>${readFileSync('studio/loader.js', 'utf8').replace(/__MAIN__/g, `./assets/${js}?v=${ver}`)}</script>\n</body>`);
writeFileSync(path.join(OUT, 'index.html'), html);
for (const d of ['art']) if (existsSync(path.join(WEB, d))) cpSync(path.join(WEB, d), path.join(OUT, d), { recursive: true });
for (const f of ['favicon.png', 'cloud.json']) if (existsSync(path.join(WEB, f))) copyFileSync(path.join(WEB, f), path.join(OUT, f));
rmSync(WEB, { recursive: true, force: true });
// ---- 后端
for (const f of ['app.py', 'npc_llm.py', 'Dockerfile', 'requirements.txt', 'start.sh', '.gitattributes', '.dockerignore', 'README.md']) copyFileSync(path.join('studio', f), path.join(OUT, f));
copyFileSync('studio/gitignore.txt', path.join(OUT, '.gitignore'));
const n = readdirSync(MEDIA).length;
console.log(`创空间版已生成：${OUT}/（主脚本 ${js} ${(readFileSync(path.join(OUT, 'assets', js)).length / 1048576).toFixed(1)} MB，素材 ${n} 个文件）`);
