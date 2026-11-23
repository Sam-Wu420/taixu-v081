// 凡人修仙传 · 模组平台（零依赖 Node 服务）
//   · 网页商店：浏览 / 搜索 / 详情 / 下载 / 注册登录 / 上传发布（public/）
//   · 游戏接口：游戏里的「模组 → 模组平台」直接调用 /api/mods……下载安装
// 运行：node server.mjs            环境变量见 README.md（PORT、DATA_DIR、ADMIN_TOKEN……）
import { createServer } from 'http';
import { readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync, existsSync, statSync, createReadStream } from 'fs';
import { join, extname, resolve } from 'path';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { openDb } from './lib/db.mjs';
import { validateBundle, cmpVersion, MOD_ID_RE, MOD_MAX_BYTES } from './lib/validate.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PORT = +(process.env.PORT || 8787);
const DATA = resolve(process.env.DATA_DIR || join(HERE, 'data'));
const ADMIN = process.env.ADMIN_TOKEN || '';
const CORS = process.env.CORS_ORIGIN || '*';
const PUB = join(HERE, 'public');
const VERSION = '1.0.0';
const TOKEN_DAYS = 30;
const PAGE = 24;

const db = openDb(DATA);
const D = db.data;
const modDir = (id) => join(DATA, 'mods', id);

// ------------------------------------------------------------ 小工具
const sha = (s) => createHash('sha256').update(s).digest('hex');
const now = () => Date.now();
class HttpErr extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const fail = (code, msg) => { throw new HttpErr(code, msg); };

function hashPw(pw, salt = randomBytes(16).toString('hex')) { return { salt, hash: scryptSync(pw, salt, 32).toString('hex') }; }
function checkPw(pw, u) { const h = scryptSync(pw, u.salt, 32); const want = Buffer.from(u.hash, 'hex'); return want.length === h.length && timingSafeEqual(h, want); }
function issueToken(name) {
  const t = randomBytes(24).toString('base64url');
  D.tokens[sha(t)] = { user: name, exp: now() + TOKEN_DAYS * 864e5 };
  // 顺手清掉过期的
  for (const [k, v] of Object.entries(D.tokens)) if (v.exp < now()) delete D.tokens[k];
  db.save();
  return t;
}
function userOf(req) {
  const m = /^Bearer\s+(\S+)$/.exec(req.headers.authorization || '');
  if (!m) return null;
  const rec = D.tokens[sha(m[1])];
  if (!rec || rec.exp < now()) return null;
  return D.users[rec.user] ? rec.user : null;
}
const needUser = (req) => userOf(req) ?? fail(401, '请先登录');
const isAdmin = (req) => !!ADMIN && typeof req.headers['x-admin-token'] === 'string' && req.headers['x-admin-token'].length === ADMIN.length && timingSafeEqual(Buffer.from(req.headers['x-admin-token']), Buffer.from(ADMIN));

// 限流：按 IP、按类别，滑动窗口
const buckets = new Map();
function limit(req, kind, max, winMs) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
  const key = kind + '|' + ip, t = now();
  const arr = (buckets.get(key) || []).filter((x) => t - x < winMs);
  if (arr.length >= max) fail(429, '操作太频繁，请稍后再试');
  arr.push(t); buckets.set(key, arr);
}
setInterval(() => {
  const t = now();
  for (const [k, a] of buckets) if (!a.some((x) => t - x < 36e5)) buckets.delete(k);
  let purged = false;
  for (const [k, v] of Object.entries(D.tokens)) if (!v || v.exp < t) { delete D.tokens[k]; purged = true; }
  if (purged) db.save();
}, 6e5).unref();

function readBody(req, max) {
  return new Promise((res, rej) => {
    let n = 0, settled = false;
    const chunks = [];
    const failOnce = (err) => { if (!settled) { settled = true; rej(err); } };
    req.on('data', (c) => {
      if (settled) return;
      n += c.length;
      if (n > max) {
        failOnce(new HttpErr(413, `内容太大（上限 ${Math.round(max / 1048576)}MB）`));
        req.destroy();
      } else {
        chunks.push(c);
      }
    });
    req.on('end', () => { if (!settled) { settled = true; res(Buffer.concat(chunks).toString('utf8')); } });
    req.on('error', failOnce);
  });
}
async function jsonBody(req, max = 64 * 1024) { const t = await readBody(req, max); try { return JSON.parse(t || '{}'); } catch { fail(400, '请求内容不是合法 JSON'); } }

function send(res, code, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body), isStr = typeof body === 'string';
  const data = isBuf || isStr ? body : JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': isBuf || isStr ? 'application/octet-stream' : 'application/json; charset=utf-8', ...headers });
  res.end(data);
}

// ------------------------------------------------------------ 模组数据的对外样子
function card(m) {
  const r = Object.values(m.ratings || {});
  return { id: m.id, name: m.name, version: m.latest, author: m.author, owner: m.owner, desc: m.desc, tags: m.tags || [], unsafe: !!m.unsafe, downloads: m.downloads, rating: r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0, ratings: r.length, updated: m.updated, created: m.created, size: m.versions.at(-1)?.size ?? 0, icon: !!m.icon };
}
function detail(m) { return { ...card(m), deps: m.deps || [], versions: m.versions.map((v) => ({ version: v.v, size: v.size, sha256: v.sha256, at: v.at, downloads: v.downloads })).reverse() }; }
const visible = (m) => m && !m.hidden;

// ------------------------------------------------------------ 路由
const routes = [];
const route = (method, path, fn) => routes.push({ method, re: new RegExp('^' + path.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn });

route('GET', '/api/health', () => ({ ok: true, version: VERSION, mods: Object.values(D.mods).filter(visible).length }));

route('POST', '/api/auth/register', async (req) => {
  limit(req, 'auth', 20, 6e5);
  const { name, password } = await jsonBody(req);
  if (typeof name !== 'string' || !/^[\w一-龥]{2,20}$/.test(name)) fail(400, '用户名 2–20 位，可用中文、字母、数字、下划线');
  if (typeof password !== 'string' || password.length < 6 || password.length > 100) fail(400, '密码至少 6 位');
  if (D.users[name]) fail(409, '这个用户名已经有人用了');
  D.users[name] = { ...hashPw(password), created: now() };
  db.save();
  return { name, token: issueToken(name) };
});
route('POST', '/api/auth/login', async (req) => {
  limit(req, 'auth', 20, 6e5);
  const { name, password } = await jsonBody(req);
  const u = typeof name === 'string' ? D.users[name] : null;
  if (!u || typeof password !== 'string' || !checkPw(password, u)) fail(401, '用户名或密码不对');
  return { name, token: issueToken(name) };
});
route('POST', '/api/auth/logout', (req) => { const m = /^Bearer\s+(\S+)$/.exec(req.headers.authorization || ''); if (m) { delete D.tokens[sha(m[1])]; db.save(); } return { ok: true }; });
route('GET', '/api/me', (req) => { const u = needUser(req); return { name: u, mods: Object.values(D.mods).filter((m) => m.owner === u).map((m) => ({ ...card(m), hidden: !!m.hidden })) }; });

route('GET', '/api/mods', (req, P, url) => {
  const q = (url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 50);
  const sort = url.searchParams.get('sort') || 'downloads';
  const tag = (url.searchParams.get('tag') || '').trim();
  const page = Math.max(0, Math.min(1000, +(url.searchParams.get('page') || 0) | 0));
  let list = Object.values(D.mods).filter(visible).map(card);
  if (q) list = list.filter((m) => (m.name + ' ' + m.id + ' ' + m.author + ' ' + m.desc + ' ' + m.tags.join(' ')).toLowerCase().includes(q));
  if (tag) list = list.filter((m) => m.tags.includes(tag));
  list.sort(sort === 'new' ? (a, b) => b.updated - a.updated : sort === 'rating' ? (a, b) => b.rating - a.rating || b.ratings - a.ratings : (a, b) => b.downloads - a.downloads);
  return { total: list.length, page, mods: list.slice(page * PAGE, page * PAGE + PAGE) };
});
route('GET', '/api/mods/:id', (req, P) => { const m = D.mods[P.id]; if (!visible(m)) fail(404, '没有这个模组'); return detail(m); });

route('GET', '/api/mods/:id/download', (req, P, url, res) => {
  const m = D.mods[P.id]; if (!visible(m)) fail(404, '没有这个模组');
  const want = url.searchParams.get('v') || m.latest;
  const ver = m.versions.find((v) => v.v === want); if (!ver) fail(404, '没有这个版本');
  const f = join(modDir(m.id), ver.v + '.fmod'); if (!existsSync(f)) fail(404, '文件丢失');
  ver.downloads = (ver.downloads || 0) + 1; m.downloads = (m.downloads || 0) + 1; db.save();
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': statSync(f).size, ...(url.searchParams.has('dl') ? { 'Content-Disposition': `attachment; filename="${m.id}-${ver.v}.fmod"` } : {}) });
  createReadStream(f).pipe(res);
  return undefined;
});
route('GET', '/api/mods/:id/icon', (req, P, url, res) => {
  const m = D.mods[P.id]; if (!visible(m) || !m.icon) fail(404, '没有图标');
  const f = join(modDir(m.id), m.icon.file); if (!existsSync(f)) fail(404, '没有图标');
  res.writeHead(200, { 'Content-Type': m.icon.mime, 'Cache-Control': 'public, max-age=600' });
  createReadStream(f).pipe(res);
  return undefined;
});

// 发布 / 更新：请求体就是 .fmod 文件的内容
route('POST', '/api/mods', async (req) => {
  const user = needUser(req);
  limit(req, 'upload', 30, 36e5);
  const text = await readBody(req, MOD_MAX_BYTES + 1024);
  let B; try { B = JSON.parse(text); } catch { fail(400, '不是有效的模组包（.fmod）'); }
  const err = validateBundle(B); if (err) fail(400, err);
  const man = B.manifest, id = man.id;
  let m = D.mods[id];
  if (m && m.owner !== user) fail(403, `模组 id「${id}」已被「${m.owner}」占用，请换一个 id`);
  if (m && m.versions.some((v) => v.v === man.version)) fail(409, `版本 ${man.version} 已经发布过，请把版本号调高`);
  if (m && cmpVersion(man.version, m.latest) < 0) fail(409, `新版本号要比当前的 ${m.latest} 高`);
  mkdirSync(modDir(id), { recursive: true });
  const writeAtomic = (target, content) => {
    const tmp = `${target}.tmp.${process.pid}`;
    try {
      writeFileSync(tmp, content);
      renameSync(tmp, target);
    } catch (err) {
      try { if (existsSync(tmp)) unlinkSync(tmp); } catch {}
      throw err;
    }
  };
  writeAtomic(join(modDir(id), man.version + '.fmod'), text);
  let icon = m?.icon;
  if (man.icon) {
    const mm = /^data:(image\/(png|webp|jpeg|gif));base64,(.*)$/.exec(B.files[man.icon]);
    if (mm) { const file = 'icon.' + (mm[2] === 'jpeg' ? 'jpg' : mm[2]); writeAtomic(join(modDir(id), file), Buffer.from(mm[3], 'base64')); icon = { file, mime: mm[1] }; }
  }
  const t = now();
  if (!m) m = D.mods[id] = { id, owner: user, created: t, downloads: 0, ratings: {}, versions: [] };
  Object.assign(m, { name: man.name, author: man.author || user, desc: man.desc, tags: man.tags || [], unsafe: !!man.unsafe, deps: man.deps || [], latest: man.version, updated: t, icon, hidden: false });
  m.versions.push({ v: man.version, size: text.length, sha256: sha(text), at: t, downloads: 0 });
  db.save();
  return detail(m);
});
route('POST', '/api/mods/:id/rate', async (req, P) => {
  const user = needUser(req);
  limit(req, 'rate', 60, 36e5);
  const m = D.mods[P.id]; if (!visible(m)) fail(404, '没有这个模组');
  const { stars } = await jsonBody(req);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) fail(400, '评分 1–5 星');
  if (m.owner === user) fail(403, '不能给自己的模组打分');
  m.ratings[user] = stars; db.save();
  return card(m);
});
// 下架（作者本人或管理员；文件保留，可再上架）
route('DELETE', '/api/mods/:id', (req, P) => {
  const m = D.mods[P.id]; if (!m) fail(404, '没有这个模组');
  if (!isAdmin(req) && m.owner !== needUser(req)) fail(403, '只能下架自己的模组');
  m.hidden = true; db.save();
  return { ok: true };
});
route('POST', '/api/admin/mods/:id/hidden', async (req, P) => {
  if (!isAdmin(req)) fail(403, '需要管理员口令');
  const m = D.mods[P.id]; if (!m) fail(404, '没有这个模组');
  const { hidden } = await jsonBody(req); m.hidden = !!hidden; db.save();
  return { ok: true, hidden: m.hidden };
});

// ------------------------------------------------------------ 静态网页
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function serveStatic(pathname, res) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (rel.includes('..')) return false;
  const f = join(PUB, rel);
  if (!f.startsWith(PUB) || !existsSync(f) || statSync(f).isDirectory()) return false;
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'", 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  createReadStream(f).pipe(res);
  return true;
}

// ------------------------------------------------------------ 服务
export function start(port = PORT) {
  const server = createServer(async (req, res) => {
    // 跨域：游戏可能跑在 file://、本地端口或别的域名
    res.setHeader('Access-Control-Allow-Origin', CORS);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const url = new URL(req.url || '/', 'http://x');
    try {
      if (url.pathname.startsWith('/api/')) {
        for (const r of routes) {
          if (r.method !== req.method) continue;
          const m = r.re.exec(url.pathname); if (!m) continue;
          const P = m.groups || {};
          if (P.id !== undefined && !MOD_ID_RE.test(P.id)) fail(404, '没有这个模组');
          const out = await r.fn(req, P, url, res);
          if (out !== undefined) send(res, 200, out);
          return;
        }
        fail(404, '没有这个接口');
      }
      if (req.method === 'GET' && serveStatic(url.pathname, res)) return;
      if (req.method === 'GET' && serveStatic('/', res)) return;
      fail(404, '找不到');
    } catch (e) {
      const code = e instanceof HttpErr ? e.code : 500;
      if (code === 500) console.error(e);
      if (!res.headersSent) send(res, code, { error: code === 500 ? '服务器出错了' : e.message });
      else res.end();
    }
  });
  server.listen(port, () => console.log(`模组平台已启动：http://localhost:${port}  数据目录 ${DATA}`));
  const stop = () => { db.flushNow(); server.close(); };
  process.once('SIGINT', () => { stop(); process.exit(0); });
  process.once('SIGTERM', () => { stop(); process.exit(0); });
  return { server, stop };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start();
