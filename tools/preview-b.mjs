import { createServer } from 'node:http';
import { createReadStream, readFileSync, stat } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(root, 'preview/asset-map.json');
let assets;
try {
  assets = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch {
  console.error('缺少预览文件。请在交付包中运行，或先执行 node tools/package-b-source.mjs。');
  process.exit(1);
}
const port = 5302;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};

createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const name = pathname === '/' ? 'index.html' : pathname.slice(1);
  const target = assets[name] ?? (name === 'index.html' || name.startsWith('assets/') ? 'preview/' + name : 'public/' + name);
  const file = resolve(root, target);
  if (!file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  stat(file, (error, info) => {
    if (error || !info.isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': types[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`预览地址：http://127.0.0.1:${port}/`);
  console.log('按 Ctrl+C 停止。');
});
