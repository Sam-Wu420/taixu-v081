// 撼山客招式批量截图（总审看图用）。用法：node tools/shots-hs/run.mjs <批次 1|2|3|p> [--jobs=2] [--only=招,招]
// 每一招开一次页面：等就绪标记 → 按给的时刻定格截图（第二批用 __hs2.go(T)：逐帧固定步长重放到 T 定住）。图在 tools/out/hs-review/<招>-<i>.png
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const batch = process.argv[2] ?? '2', JOBS = Number(arg('jobs', '2')), ONLY = arg('only', '').split(',').filter(Boolean), PORT = arg('port', '5202');
const D = 'tools/shots-hs/gen/', O = 'tools/out/hs-review/'; mkdirSync(D, { recursive: true }); mkdirSync(O, { recursive: true });
const T = (q) => `http://127.0.0.1:${PORT}/tools/perf-acceptance.html?auto=new&map=tiannan&${q}`;
const HS2 = { liuxing: [0.5, 1.0, 1.36], yanhui: [0.3, 0.95, 1.25], shifang: [0.3, 1.0, 1.4, 1.72], tiandi: [0.35, 0.52, 1.3, 1.86], dianxue: [0.3, 1.0, 2.4, 3.3],
  lidi: [0.25, 0.8, 1.2, 1.6, 1.9, 2.2], lunren: [0.12, 0.6, 1.25, 1.36], yunxing: [0.25, 0.8, 1.05, 1.22], zhishan: [0.45, 0.95, 1.4, 1.6] };
const jobs = [];
if (batch === '2') for (const [id, ts] of Object.entries(HS2)) {
  if (ONLY.length && !ONLY.includes(id)) continue;
  const ready = `${D}ready2.js`; writeFileSync(ready, `(async () => { const s = (ms) => new Promise(r => setTimeout(r, ms)); const t0 = performance.now(); while (!window.__hs2Ready && performance.now() - t0 < 40000) await s(500); return { ready: !!window.__hs2Ready }; })()`);
  const steps = ts.map((t, i) => { const f = `${D}go2-${t}.js`; writeFileSync(f, `(async () => { await window.__hs2.go(${t}); return ${t}; })()`); return `--step=0.2|${O}${id}-${i + 1}.png|${f}`; });
  jobs.push({ id, args: [T(`try=hanshan&move=${id}`), '--size=1600x900', '--wait=30', '--extra=200', `--eval=${ready}`, ...steps] });
}
if (batch === 'lidi-me') {
  const ready = `${D}ready2.js`;
  const steps = [0.3, 0.9, 1.4].map((t, i) => { const f = `${D}go2-${t}.js`; writeFileSync(f, `(async () => { await window.__hs2.go(${t}); return ${t}; })()`); return `--step=0.2|${O}lidi-me-${i + 1}.png|${f}`; });
  jobs.push({ id: 'lidi-me', args: [T('try=hanshan&move=lidi&on=me'), '--size=1600x900', '--wait=30', '--extra=200', `--eval=${ready}`, ...steps] });
}
// 第三批：等 __hs3Ready → again() 从头放 → 每隔一段拍一张（长招，固定间隔）
const HS3 = { pojie: [0.6, 1.2, 2.0, 3.0, 4.2, 5.5, 7.0], wuji: [0.6, 1.2, 1.7, 2.6, 3.8], qianjunzhui: [0.3, 0.8, 1.3, 1.6, 2.6], jiexing: [0.6, 1.2, 1.8] };
if (batch === '3') for (const [id, ts] of Object.entries(HS3)) {
  if (ONLY.length && !ONLY.includes(id)) continue;
  const ready = D + 'ready3.js'; writeFileSync(ready, '(async () => { const s = (ms) => new Promise(r => setTimeout(r, ms)); const t0 = performance.now(); while (!window.__hs3Ready && performance.now() - t0 < 40000) await s(500); await s(3000); window.__hs3?.again?.(); return { ready: !!window.__hs3Ready }; })()');
  let prev = 0; const steps = ts.map((t, i) => { const w = +(t - prev).toFixed(2); prev = t; return '--step=' + w + '|' + O + id + '-' + (i + 1) + '.png'; });
  jobs.push({ id, args: [T('try=hanshan&move=' + id + (id === 'pojie' || id === 'jiexing' ? '&on=me' : '')), '--size=1600x900', '--wait=30', '--extra=200', '--eval=' + ready, ...steps] });
}
// 第一批：等就绪 → 镜头挪到他和木人桩中间 → 每 0.3 秒拍一张（招在循环放）
const HS1 = ['suodi', 'takong', 'yicunbeng', 'quanya', 'zhenjiao', 'qihe', 'kongshou', 'jingang', 'houfa'];
if (batch === '1') for (const id of HS1) {
  if (ONLY.length && !ONLY.includes(id)) continue;
  const ready = D + 'ready1-' + id + '.js'; writeFileSync(ready, '(async () => { const s = (ms) => new Promise(r => setTimeout(r, ms)); const t0 = performance.now(); while (!(window.__hsReady && window.__hsDummy) && performance.now() - t0 < 40000) await s(500); const g = window.__game, H = window.__hs, Dm = window.__hsDummy; if (H?.ent && Dm) g.teleport((H.ent.x + Dm.x) / 2 - 380, H.ent.y - ' + (id === 'takong' ? 900 : 300) + '); await s(2500); return { ready: !!window.__hsReady }; })()');
  const steps = Array.from({ length: 6 }, (_, i) => '--step=0.35|' + O + id + '-' + (i + 1) + '.png');
  jobs.push({ id, args: [T('try=hanshan&move=' + id), '--size=1600x900', '--wait=30', '--extra=200', '--eval=' + ready, ...steps] });
}
let next = 0;
async function worker() { for (;;) { const j = jobs[next++]; if (!j) return; await new Promise((res) => { const c = spawn('node', ['tools/edge-shot.mjs', ...j.args], { env: { ...process.env, MSYS_NO_PATHCONV: '1' } }); let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; }); c.on('exit', (code) => { console.log(`${code === 0 ? '✓' : '✗'} ${j.id} ${code === 0 ? '' : out.split('\n').filter(Boolean).slice(-2).join(' | ').slice(0, 200)}`); res(); }); }); } }
console.log(`共 ${jobs.length} 招，${JOBS} 路`);
await Promise.all(Array.from({ length: JOBS }, worker));
