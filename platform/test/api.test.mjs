// 模组平台接口测试：起一个临时实例（临时数据目录、随机端口），把注册 → 发布 → 搜索 → 下载 → 评分 → 更新 → 下架走一遍
// 用法：node test/api.test.mjs [示例模组包路径]
import { spawn } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';

const HERE = fileURLToPath(new URL('..', import.meta.url));
const fmodPath = process.argv[2] || join(HERE, '..', 'dist-mods', 'qingming-1.0.0.fmod');
const data = mkdtempSync(join(tmpdir(), 'modfang-'));
const port = 20000 + Math.floor(Math.random() * 20000);
const srv = spawn(process.execPath, [join(HERE, 'server.mjs')], { env: { ...process.env, PORT: String(port), DATA_DIR: data, ADMIN_TOKEN: 'admin-secret-test' }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((res) => srv.stdout.on('data', (d) => { if (String(d).includes('已启动')) res(); }));
const base = `http://127.0.0.1:${port}`;
let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('  ✗', msg); } else console.log('  ✓', msg); };
const call = async (method, path, { json, body, token, headers = {} } = {}) => {
  const h = { ...headers }; if (token) h.Authorization = 'Bearer ' + token; if (json !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  const r = await fetch(base + path, { method, headers: h, body });
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, data: ct.includes('json') ? await r.json() : await r.arrayBuffer(), headers: r.headers };
};
try {
  const fmod = readFileSync(fmodPath, 'utf8');
  const bundle = JSON.parse(fmod);
  console.log('一、账号');
  let r = await call('POST', '/api/auth/register', { json: { name: '青冥', password: '123456' } });
  ok(r.status === 200 && r.data.token, '注册');
  const tA = r.data.token;
  ok((await call('POST', '/api/auth/register', { json: { name: '青冥', password: '123456' } })).status === 409, '重名注册被拒');
  ok((await call('POST', '/api/auth/register', { json: { name: 'x', password: '1' } })).status === 400, '用户名 / 密码不合规被拒');
  ok((await call('POST', '/api/auth/login', { json: { name: '青冥', password: 'wrong!!' } })).status === 401, '密码错误被拒');
  r = await call('POST', '/api/auth/login', { json: { name: '青冥', password: '123456' } });
  ok(r.status === 200 && r.data.token, '登录');
  const tB = (await call('POST', '/api/auth/register', { json: { name: '路人乙', password: 'abcdef' } })).data.token;

  console.log('二、发布');
  ok((await call('POST', '/api/mods', { body: fmod })).status === 401, '没登录不能发布');
  ok((await call('POST', '/api/mods', { body: '{"format":"x"}', token: tA })).status === 400, '不合格的包被拒');
  r = await call('POST', '/api/mods', { body: fmod, token: tA });
  ok(r.status === 200 && r.data.id === 'qingming' && r.data.version === '1.0.0', '发布示例模组');
  ok((await call('POST', '/api/mods', { body: fmod, token: tA })).status === 409, '同版本重复发布被拒');
  ok((await call('POST', '/api/mods', { body: fmod, token: tB })).status === 403, '别人不能占用已有的模组 id');

  console.log('三、浏览、搜索、详情、图标、下载');
  r = await call('GET', '/api/mods');
  ok(r.data.total === 1 && r.data.mods[0].name === '青冥剑修', '列表');
  ok((await call('GET', '/api/mods?q=' + encodeURIComponent('剑修'))).data.total === 1 && (await call('GET', '/api/mods?q=nothing')).data.total === 0, '搜索');
  ok((await call('GET', '/api/mods?tag=' + encodeURIComponent('示例'))).data.total === 1, '按标签筛选');
  r = await call('GET', '/api/mods/qingming');
  ok(r.data.versions.length === 1 && r.data.versions[0].sha256, '详情含版本记录与校验值');
  r = await call('GET', '/api/mods/qingming/icon');
  ok(r.status === 200 && r.headers.get('content-type') === 'image/png' && r.data.byteLength > 1000, '图标');
  r = await call('GET', '/api/mods/qingming/download');
  ok(r.status === 200 && r.data.manifest?.id === 'qingming' && r.data.files['index.js'].length > 100, '下载得到完整模组包（游戏直接装）');
  ok((await call('GET', '/api/mods/qingming')).data.downloads === 1, '下载次数 +1');
  ok((await call('GET', '/api/mods/nosuchmod/download')).status === 404 && (await call('GET', '/api/mods/..%2f..%2fetc/download')).status === 404, '不存在 / 路径穿越都是 404');
  r = await fetch(base + '/api/mods', { method: 'OPTIONS' });
  ok(r.status === 204 && r.headers.get('access-control-allow-origin') === '*', '跨域预检（游戏在 file:// 或别的域名下也能连）');

  console.log('四、评分、更新、下架');
  ok((await call('POST', '/api/mods/qingming/rate', { json: { stars: 5 }, token: tA })).status === 403, '不能给自己打分');
  r = await call('POST', '/api/mods/qingming/rate', { json: { stars: 4 }, token: tB });
  ok(r.status === 200 && r.data.rating === 4 && r.data.ratings === 1, '别人打 4 星');
  const v2 = JSON.stringify({ ...bundle, manifest: { ...bundle.manifest, version: '1.1.0', desc: bundle.manifest.desc + '\n1.1.0：修了点东西。' } });
  r = await call('POST', '/api/mods', { body: v2, token: tA });
  ok(r.status === 200 && r.data.version === '1.1.0' && r.data.versions.length === 2, '发布 1.1.0');
  const v0 = JSON.stringify({ ...bundle, manifest: { ...bundle.manifest, version: '0.9.0' } });
  ok((await call('POST', '/api/mods', { body: v0, token: tA })).status === 409, '版本号倒退被拒');
  ok((await call('GET', '/api/mods/qingming/download?v=1.0.0')).data.manifest.version === '1.0.0', '还能下旧版本');
  ok((await call('DELETE', '/api/mods/qingming', { token: tB })).status === 403, '别人不能下架');
  ok((await call('DELETE', '/api/mods/qingming', { token: tA })).status === 200 && (await call('GET', '/api/mods')).data.total === 0 && (await call('GET', '/api/mods/qingming/download')).status === 404, '作者下架后搜不到、下不了');
  ok((await call('GET', '/api/me', { token: tA })).data.mods[0].hidden === true, '「我的模组」里看得到已下架');
  ok((await call('POST', '/api/admin/mods/qingming/hidden', { json: { hidden: false }, headers: { 'X-Admin-Token': 'nope' } })).status === 403, '管理口令不对被拒');
  ok((await call('POST', '/api/admin/mods/qingming/hidden', { json: { hidden: false }, headers: { 'X-Admin-Token': 'admin-secret-test' } })).status === 200 && (await call('GET', '/api/mods')).data.total === 1, '管理员可以重新上架');

  console.log('五、网页与持久化');
  r = await fetch(base + '/');
  const html = await r.text();
  ok(r.status === 200 && html.includes('模组坊') && (r.headers.get('content-security-policy') || '').includes("script-src 'self'"), '网页首页（带内容安全策略）');
  srv.kill('SIGTERM'); await new Promise((res) => srv.on('exit', res));
  const srv2 = spawn(process.execPath, [join(HERE, 'server.mjs')], { env: { ...process.env, PORT: String(port), DATA_DIR: data }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res) => srv2.stdout.on('data', (d) => { if (String(d).includes('已启动')) res(); }));
  r = await call('GET', '/api/mods/qingming');
  ok(r.status === 200 && r.data.versions.length === 2 && r.data.ratings === 1, '重启后数据都在');
  srv2.kill('SIGTERM');
} finally {
  try { srv.kill('SIGTERM'); } catch {}
  setTimeout(() => rmSync(data, { recursive: true, force: true }), 300);
}
console.log(fails ? `${n - fails}/${n} 通过，${fails} 项失败` : `${n}/${n} 通过`);
setTimeout(() => process.exit(fails ? 1 : 0), 400);
