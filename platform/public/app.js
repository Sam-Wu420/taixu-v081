// 模组坊网页：浏览 / 搜索 / 详情 / 下载 / 评分 / 注册登录 / 发布 / 我的模组
// 一律用 textContent 填字（玩家写的内容不当 HTML 解析）
const $ = (s) => document.querySelector(s);
const app = $('#app');
const API = '';   // 与网页同一站点
let session = JSON.parse(localStorage.getItem('modfang.session') || 'null');   // { name, token }

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
async function api(path, opt = {}) {
  const headers = { ...(opt.headers || {}) };
  if (session) headers.Authorization = 'Bearer ' + session.token;
  if (opt.json !== undefined) { headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(opt.json); }
  const r = await fetch(API + path, { ...opt, headers });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && session && !path.startsWith('/api/auth')) { setSession(null); }
  if (!r.ok) throw new Error(data.error || `出错了（${r.status}）`);
  return data;
}
const fmtDate = (t) => new Date(t).toLocaleDateString('zh-CN');
const fmtSize = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const stars = (r, n) => (n ? '★'.repeat(Math.round(r)) + '☆'.repeat(5 - Math.round(r)) + ` ${r.toFixed(1)}（${n}）` : '尚无评分');
const icon = (m, big) => (m.icon ? h('img', { class: 'ico', src: `${API}/api/mods/${m.id}/icon?v=${m.updated}`, alt: '' }) : h('div', { class: 'ico' }, m.name[0] || '模'));

function setSession(s) {
  session = s;
  if (s) localStorage.setItem('modfang.session', JSON.stringify(s)); else localStorage.removeItem('modfang.session');
  renderWho();
}
function renderWho() {
  const w = $('#who'); w.replaceChildren();
  if (session) w.append(h('a', { href: '#/me' }, session.name), h('a', { href: '#/', onclick: async () => { try { await api('/api/auth/logout', { method: 'POST' }); } catch {} setSession(null); } }, '退出'));
  else w.append(h('a', { href: '#/login' }, '登录 / 注册'));
}

// ------------------------------------------------------------ 列表
const state = { q: '', sort: 'downloads', tag: '', page: 0 };
async function viewList() {
  const sorts = [['downloads', '下载最多'], ['new', '最新'], ['rating', '评分最高']];
  const bar = h('div', { class: 'bar' }, sorts.map(([k, n]) => h('button', { class: 'tab' + (state.sort === k ? ' on' : ''), onclick: () => { state.sort = k; state.page = 0; viewList(); } }, n)));
  if (state.tag) bar.append(h('span', { class: 'tag', onclick: () => { state.tag = ''; viewList(); } }, `标签：${state.tag} ×`));
  const count = h('span', { class: 'count' }, '载入中…'); bar.append(count);
  const grid = h('div', { class: 'grid' });
  app.replaceChildren(bar, grid);
  try {
    const r = await api(`/api/mods?q=${encodeURIComponent(state.q)}&sort=${state.sort}&tag=${encodeURIComponent(state.tag)}&page=${state.page}`);
    count.textContent = `共 ${r.total} 个模组`;
    if (!r.mods.length) grid.replaceWith(h('div', { class: 'empty' }, state.q ? '没有找到相关模组。' : '还没有模组。来发布第一个吧！'));
    for (const m of r.mods) grid.append(h('a', { class: 'card', href: `#/mod/${m.id}` }, icon(m), h('div', { class: 'meta' },
      h('b', {}, m.name, m.unsafe ? h('span', { class: 'unsafe', title: '这个模组要求高级权限：能改游戏的一切，也可能坏得更彻底' }, '高级权限') : null), h('span', { class: 'sub' }, `v${m.version} · ${m.author} · 下载 ${m.downloads}`),
      h('span', { class: 'stars' }, stars(m.rating, m.ratings)), h('span', { class: 'desc' }, m.desc),
      m.tags.length ? h('div', { class: 'tags' }, m.tags.map((t) => h('span', { class: 'tag', onclick: (e) => { e.preventDefault(); state.tag = t; state.page = 0; viewList(); } }, t))) : null)));
    if (r.total > (state.page + 1) * 24 || state.page > 0) app.append(h('div', { class: 'bar' },
      h('button', { disabled: state.page === 0, onclick: () => { state.page--; viewList(); } }, '上一页'),
      h('button', { disabled: r.total <= (state.page + 1) * 24, onclick: () => { state.page++; viewList(); } }, '下一页')));
  } catch (e) { count.textContent = ''; grid.replaceWith(h('div', { class: 'msg err' }, e.message)); }
}

// ------------------------------------------------------------ 详情
async function viewMod(id) {
  app.replaceChildren(h('div', { class: 'empty' }, '载入中…'));
  let m;
  try { m = await api(`/api/mods/${id}`); } catch (e) { app.replaceChildren(h('div', { class: 'msg err' }, e.message)); return; }
  const rateBox = h('div', { class: 'rate' });
  const msg = h('div');
  if (session && session.name !== m.owner) {
    rateBox.append('给它打分：', ...[1, 2, 3, 4, 5].map((s) => h('button', { title: `${s} 星`, onclick: async () => {
      try { await api(`/api/mods/${id}/rate`, { method: 'POST', json: { stars: s } }); msg.replaceChildren(h('div', { class: 'msg' }, `已打 ${s} 星，谢谢！`)); setTimeout(() => viewMod(id), 600); }
      catch (e) { msg.replaceChildren(h('div', { class: 'msg err' }, e.message)); }
    } }, '★'.repeat(s))));
  } else if (!session) rateBox.append(h('a', { href: '#/login' }, '登录后可以打分'));
  const vers = h('table', { class: 'vers' }, h('tr', {}, h('th', {}, '版本'), h('th', {}, '发布'), h('th', {}, '大小'), h('th', {}, '下载'), h('th', {})),
    m.versions.map((v) => h('tr', {}, h('td', {}, 'v' + v.version), h('td', {}, fmtDate(v.at)), h('td', {}, fmtSize(v.size)), h('td', {}, v.downloads), h('td', {}, h('a', { href: `${API}/api/mods/${id}/download?v=${v.version}&dl=1` }, '下载')))));
  app.replaceChildren(h('div', { class: 'detail' },
    h('div', {},
      h('div', { class: 'panel' },
        h('div', { class: 'head' }, icon(m, true), h('div', {}, h('h1', {}, m.name, m.unsafe ? h('span', { class: 'unsafe', title: '这个模组要求高级权限：能改游戏的一切，也可能坏得更彻底' }, '高级权限') : null), h('div', { class: 'stars' }, stars(m.rating, m.ratings)),
          m.tags.length ? h('div', { class: 'tags' }, m.tags.map((t) => h('span', { class: 'tag', onclick: () => { state.tag = t; state.page = 0; location.hash = '#/'; } }, t))) : null)),
        h('div', { class: 'prose' }, m.desc || '（作者没写简介）')),
      h('div', { class: 'panel gap' }, h('h3', {}, '版本记录'), vers)),
    h('div', { class: 'side' }, h('div', { class: 'panel' },
      h('a', { class: 'btn primary', href: `${API}/api/mods/${id}/download?dl=1` }, `下载 v${m.version}（.fmod）`),
      h('p', { class: 'note' }, '在游戏里装更方便：标题画面 → 模组 → 模组平台，连上本站后点「安装」。下载的 .fmod 文件也可以在「模组 → 导入模组文件」里装。'),
      h('dl', {}, h('dt', {}, '模组 id'), h('dd', {}, m.id), h('dt', {}, '作者'), h('dd', {}, m.author), h('dt', {}, '发布者'), h('dd', {}, m.owner),
        h('dt', {}, '下载'), h('dd', {}, String(m.downloads)), h('dt', {}, '更新'), h('dd', {}, fmtDate(m.updated)), h('dt', {}, '大小'), h('dd', {}, fmtSize(m.size)),
        m.deps.length ? [h('dt', {}, '依赖'), h('dd', {}, m.deps.map((d) => h('a', { href: `#/mod/${d}` }, d + ' ')))] : null),
      rateBox, msg))));
}

// ------------------------------------------------------------ 登录 / 注册
function viewLogin() {
  const name = h('input', { required: true, maxlength: 20, autocomplete: 'username' });
  const pw = h('input', { type: 'password', required: true, minlength: 6, autocomplete: 'current-password' });
  const msg = h('div');
  const go = async (path) => {
    try { const r = await api(path, { method: 'POST', json: { name: name.value.trim(), password: pw.value } }); setSession(r); location.hash = '#/me'; }
    catch (e) { msg.replaceChildren(h('div', { class: 'msg err' }, e.message)); }
  };
  app.replaceChildren(h('div', { class: 'panel form' }, h('h2', {}, '登录 / 注册'),
    h('label', {}, '用户名（2–20 位，可用中文）', name), h('label', {}, '密码（至少 6 位）', pw), msg,
    h('div', { class: 'bar' }, h('button', { class: 'primary', onclick: () => go('/api/auth/login') }, '登录'), h('button', { onclick: () => go('/api/auth/register') }, '注册新账号'))));
}

// ------------------------------------------------------------ 发布
function viewUpload() {
  if (!session) { viewLogin(); return; }
  const file = h('input', { type: 'file', accept: '.fmod,application/json' });
  const msg = h('div');
  const btn = h('button', { class: 'primary', onclick: async () => {
    const f = file.files[0]; if (!f) { msg.replaceChildren(h('div', { class: 'msg err' }, '先选一个 .fmod 文件')); return; }
    btn.disabled = true; msg.replaceChildren(h('div', { class: 'msg' }, '上传中…'));
    try {
      const text = await f.text();
      const r = await api('/api/mods', { method: 'POST', body: text, headers: { 'Content-Type': 'application/json' } });
      msg.replaceChildren(h('div', { class: 'msg' }, `「${r.name}」v${r.version} 发布成功！`));
      setTimeout(() => { location.hash = `#/mod/${r.id}`; }, 800);
    } catch (e) { msg.replaceChildren(h('div', { class: 'msg err' }, e.message)); }
    btn.disabled = false;
  } }, '发布');
  app.replaceChildren(h('div', { class: 'panel form' }, h('h2', {}, '发布 / 更新模组'),
    h('p', {}, '用游戏开发包里的打包工具把模组文件夹打成 .fmod：', h('code', {}, 'npx tsx tools/mod-pack.ts mods/你的模组')),
    h('p', {}, '同一个模组 id 只属于第一个发布它的人；更新时把清单里的版本号调高再上传即可。'),
    h('label', {}, '模组文件（.fmod，最大 20MB）', file), msg, h('div', {}, btn)));
}

// ------------------------------------------------------------ 我的模组
async function viewMe() {
  if (!session) { viewLogin(); return; }
  app.replaceChildren(h('div', { class: 'empty' }, '载入中…'));
  try {
    const r = await api('/api/me');
    const rows = r.mods.map((m) => h('tr', {}, h('td', {}, h('a', { href: `#/mod/${m.id}` }, m.name)), h('td', {}, 'v' + m.version), h('td', {}, String(m.downloads)), h('td', {}, m.hidden ? '已下架' : '上架中'),
      h('td', {}, m.hidden ? '' : h('button', { onclick: async () => { if (!confirm(`下架「${m.name}」？玩家将搜不到、下不了它。`)) return; await api(`/api/mods/${m.id}`, { method: 'DELETE' }); viewMe(); } }, '下架'))));
    app.replaceChildren(h('div', { class: 'panel' }, h('h2', {}, `${r.name} 的模组`),
      r.mods.length ? h('table', { class: 'vers mine' }, h('tr', {}, h('th', {}, '模组'), h('th', {}, '版本'), h('th', {}, '下载'), h('th', {}, '状态'), h('th', {})), rows) : h('p', {}, '还没发布过模组。'),
      h('p', {}, h('a', { class: 'btn primary', href: '#/upload' }, '发布新模组'))));
  } catch (e) { app.replaceChildren(h('div', { class: 'msg err' }, e.message)); }
}

// ------------------------------------------------------------ 路由
function route() {
  const hsh = location.hash.replace(/^#/, '') || '/';
  const m = /^\/mod\/([a-z0-9]+)$/.exec(hsh);
  window.scrollTo(0, 0);
  if (m) viewMod(m[1]);
  else if (hsh === '/login') viewLogin();
  else if (hsh === '/upload') viewUpload();
  else if (hsh === '/me') viewMe();
  else viewList();
}
$('#search').addEventListener('submit', (e) => { e.preventDefault(); state.q = $('#q').value.trim(); state.page = 0; if (location.hash.replace(/^#/, '') !== '/' && location.hash) location.hash = '#/'; else viewList(); });
$('#site').textContent = location.origin;
window.addEventListener('hashchange', route);
renderWho();
route();
