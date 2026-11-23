// 用本机 Chrome（无头、独立 profile、真实 GPU）跑 tools/bench-browser.ts 的场景，不依赖 puppeteer。
// 先启动开发服务器，然后：node tools/bench-cdp.mjs <port> <label> [scenes=crowd,battle,travel,idle] [secs=10] [--headful]
// 结果写 tools/out/browser-<label>.json。profile 放系统临时目录（或环境变量 BENCH_PROFILE）。
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [port = '5201', label = 'run', sceneArg = 'crowd,battle,travel,idle', secArg = '10'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const headful = process.argv.includes('--headful');
const out = fileURLToPath(new URL('./out/', import.meta.url));
mkdirSync(out, { recursive: true });
// profile 不能放进项目：vite 会监视它并因文件被占用而崩溃
const profile = (process.env.BENCH_PROFILE || (await import('node:os')).tmpdir() + '/taixu-bench-profile') + '-' + port;
rmSync(profile, { recursive: true, force: true });
const exe = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const dbg = 9300 + Math.floor(Math.random() * 500);
const proc = spawn(exe, [
  ...(headful ? [] : ['--headless=new']), `--remote-debugging-port=${dbg}`, `--user-data-dir=${profile}`,
  '--window-size=1600,900', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 60 && !ws; i++) {
  await sleep(250);
  try { const list = await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json(); const pg = list.find((t) => t.type === 'page'); if (pg) ws = pg.webSocketDebuggerUrl; } catch { /* 还没起来 */ }
}
if (!ws) { proc.kill(); throw new Error('Chrome 调试端口没起来'); }
const sock = new WebSocket(ws);
await new Promise((r) => sock.addEventListener('open', r, { once: true }));
let id = 0; const wait = new Map();
sock.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') console.log('[页面异常]', m.params.exceptionDetails?.exception?.description?.slice(0, 300)); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => { const m = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (m.result?.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description ?? JSON.stringify(m.result.exceptionDetails)); return m.result?.result?.value; };
await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable');
const errors = [];
sock.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text.slice(0, 200) + ' ' + (m.params.entry.url ?? ''));
  if (m.method === 'Network.loadingFailed' && !m.params.canceled) errors.push('网络失败 ' + m.params.errorText);
});
const result = { label, port, at: new Date().toISOString(), scenes: {} };
for (const scene of sceneArg.split(',')) {
  // --ls=k=v,k2=v2：进游戏前写 localStorage（如 taixu.textcache=0 关文字缓存做画面对比）
  const ls = (process.argv.find((a) => a.startsWith('--ls=')) ?? '').slice(5);
  if (ls) { await send('Page.navigate', { url: `http://127.0.0.1:${port}/package.json` }); await sleep(800); await evaluate(`(${JSON.stringify(ls)}).split(',').forEach((kv) => { const [k, v] = kv.split('='); localStorage.setItem(k, v); }); true`); }
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?auto=new` });
  const t0 = Date.now();
  await sleep(1500);
  const ok = await evaluate(`new Promise((r) => { const t = Date.now(); const f = () => window.__game?.renderer && window.__game.running ? r(true) : Date.now() - t > 90000 ? r(false) : setTimeout(f, 200); f(); })`);
  if (!ok) { console.log('游戏没进来：', await evaluate(`JSON.stringify({ url: location.href, game: !!window.__game, renderer: !!window.__game?.renderer, running: window.__game?.running, text: document.body.innerText.slice(0, 300) })`)); sock.close(); proc.kill(); process.exit(1); }
  const boot = Date.now() - t0;
  const mem = () => evaluate('performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1');
  const env = await evaluate(`(() => { const c = document.createElement('canvas').getContext('webgl2'); const d = c?.getExtension('WEBGL_debug_renderer_info'); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a'; })()`);
  const tracing = process.argv.includes('--trace');
  const events = [];
  let traceDone = null;
  if (tracing) {
    sock.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.method === 'Tracing.dataCollected') events.push(...m.params.value); if (m.method === 'Tracing.tracingComplete') traceDone?.(); });
    await send('Tracing.start', { categories: 'devtools.timeline,v8,v8.gc,disabled-by-default-v8.gc,blink,gpu,cc,viz,toplevel', transferMode: 'ReportEvents' });
  }
  if (scene === 'boot') {   // 构建产物也能用：只测进游戏耗时、内存、截图与报错
    await sleep(4000);
    const shot = (await send('Page.captureScreenshot', { format: 'png' })).result.data;
    writeFileSync(out + `shot-${label}-boot.png`, Buffer.from(shot, 'base64'));
    const info = await evaluate(`(() => { const g = window.__game; return { heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1, totalHeapMB: performance.memory ? Math.round(performance.memory.totalJSHeapSize / 1048576) : -1, res: performance.getEntriesByType('resource').length, kb: Math.round(performance.getEntriesByType('resource').reduce((s, e) => s + (e.transferSize || e.encodedBodySize || 0), 0) / 1024), fps: g?.perf?.fps }; })()`);
    console.log(`[boot] ${(boot / 1000).toFixed(2)}s`, JSON.stringify(info), `错误 ${errors.length}`, errors.slice(0, 5).join(' | '));
    result.scenes.boot = { bootMs: boot, ...info, errors };
    continue;
  }
  if (scene === 'cast') {   // 施法动作连拍：放一次法术，在 0.05/0.2/0.35/0.55 秒各截一张主角特写
    await evaluate(`(() => { const g = window.__game; g.story.skipAll?.(); g.story.openT = -1; g.modal = null; g.emitModal?.(); g.cam.zoom = g.cam.targetZoom = 1.6; g.hero.mp = 1e6; return true; })()`);
    await sleep(1500);
    const pos = await evaluate(`(() => { const g = window.__game, r = g.canvas.getBoundingClientRect(), z = g.cam.zoom; return { x: r.left + r.width / 2 + (g.player.x - g.cam.x) * z, y: r.top + r.height / 2 + (g.player.y - g.cam.y) * z }; })()`);
    await evaluate(`(() => { const g = window.__game; const id = g.hero.arts[0].id; g.combat.cds.delete(id); g.combat.cast(id); return id; })()`);
    const t0 = Date.now();
    for (const at of [50, 200, 350, 550]) {
      await sleep(Math.max(0, at - (Date.now() - t0)));
      const shot = (await send('Page.captureScreenshot', { format: 'png', clip: { x: Math.round(pos.x - 150), y: Math.round(pos.y - 230), width: 300, height: 300, scale: 1 } })).result.data;
      writeFileSync(out + `cast-${label}-${at}.png`, Buffer.from(shot, 'base64'));
    }
    console.log('[cast] 已截图', label);
    continue;
  }
  if (scene === 'eval') {   // 调试：进游戏后执行 --js=<文件> 里的表达式（可 await），打印结果
    const file = (process.argv.find((a) => a.startsWith('--js=')) ?? '').slice(5);
    const { readFileSync } = await import('node:fs');
    await sleep(3000);
    console.log('[eval]', JSON.stringify(await evaluate(`(async () => { ${readFileSync(file, 'utf8')} })()`)));
    if (process.argv.includes('--shot')) { const shot = (await send('Page.captureScreenshot', { format: 'png' })).result.data; writeFileSync(out + `shot-${label}-eval.png`, Buffer.from(shot, 'base64')); }
    continue;
  }
  if (scene === 'probe') { console.log('[probe]', JSON.stringify(await evaluate(`import('/tools/bench-probe.ts').then((b) => b.probe())`))); continue; }
  const cpu = process.argv.includes('--cpu');
  if (cpu) { await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 200 }); await send('Profiler.start'); }
  const r = await evaluate(`import('/tools/bench-browser.ts').then((b) => b.bench(${JSON.stringify(scene)}, ${Number(secArg)}))`);
  if (cpu) {
    const { profile } = (await send('Profiler.stop')).result;
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    // 长样本窗口：把连续样本按 rAF 帧切不了，这里给出整体自耗时 + 含子调用的总耗时排行
    const self = new Map(), parent = new Map();
    for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
    const total = new Map(); let all = 0;
    for (let i = 0; i < profile.samples.length; i++) {
      const ms = (profile.timeDeltas[i] ?? 0) / 1000; all += ms;
      let n = byId.get(profile.samples[i]); const key = (x) => `${x.callFrame.functionName || '(anon)'} ${x.callFrame.url.split('/').pop()}:${x.callFrame.lineNumber + 1}`;
      self.set(key(n), (self.get(key(n)) ?? 0) + ms);
      const seen = new Set();
      for (let id = n.id; id != null; id = parent.get(id)) { const k = key(byId.get(id)); if (!seen.has(k)) { seen.add(k); total.set(k, (total.get(k) ?? 0) + ms); } }
    }
    const fmt = (m) => [...m].filter(([k]) => !/^\((idle|program|root)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 22).map(([k, v]) => `      ${(v / all * 100).toFixed(1).padStart(5)}% ${v.toFixed(0).padStart(6)}ms ${k}`).join('\n');
    console.log(`    CPU 自耗时 (共 ${all.toFixed(0)}ms):\n${fmt(self)}\n    含子调用:\n${fmt(total)}`);
    // 指定的原生函数（--who=measureText,drawImage）按直接调用者归因
    const who = (process.argv.find((a) => a.startsWith('--who=')) ?? '').slice(6).split(',').filter(Boolean);
    for (const w of who) {
      const by = new Map();
      for (let i = 0; i < profile.samples.length; i++) {
        const n = byId.get(profile.samples[i]); if (n.callFrame.functionName !== w) continue;
        const p = byId.get(parent.get(n.id)); const k = p ? `${p.callFrame.functionName || '(anon)'} ${p.callFrame.url.split('/').pop().split('?')[0]}:${p.callFrame.lineNumber + 1}` : '?';
        by.set(k, (by.get(k) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
      }
      console.log(`    ${w} 的调用者:\n` + [...by].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `      ${v.toFixed(0).padStart(6)}ms ${k}`).join('\n'));
    }
  }
  if (tracing) {
    const done = new Promise((res) => { traceDone = res; }); await send('Tracing.end'); await done;
    // 主线程上的完整事件（X），按名称汇总总时长与 >8ms 的次数；只算渲染进程主线程
    const main = new Set(events.filter((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain').map((e) => `${e.pid}:${e.tid}`));
    const agg = new Map();
    for (const e of events) if (e.ph === 'X' && e.dur && main.has(`${e.pid}:${e.tid}`)) { const a = agg.get(e.name) ?? { ms: 0, n: 0, big: 0, max: 0 }; a.ms += e.dur / 1000; a.n++; if (e.dur > 8000) a.big++; a.max = Math.max(a.max, e.dur / 1000); agg.set(e.name, a); }
    const top = [...agg].filter(([, a]) => a.max > 4).sort((a, b) => b[1].max - a[1].max).slice(0, 18);
    console.log('    trace(主线程, 按单次最长):\n' + top.map(([k, a]) => `      ${k.padEnd(34)} max ${a.max.toFixed(1)}ms  >8ms×${a.big}  total ${a.ms.toFixed(0)}ms ×${a.n}`).join('\n'));
    writeFileSync(out + `trace-${label}-${scene}.json`, JSON.stringify({ traceEvents: events }));
  }
  result.scenes[scene] = { bootMs: boot, heapMB: await mem(), gpu: env, ...r };
  if (process.argv.includes('--shot')) {
    // 冻结在同一时刻再截：暂停游戏，镜头回到固定点
    await evaluate(`(() => { const g = window.__game; g.paused = true; return true; })()`); await sleep(300);
    const shot = (await send('Page.captureScreenshot', { format: 'png' })).result.data;
    writeFileSync(out + `shot-${label}-${scene}.png`, Buffer.from(shot, 'base64'));
  }
  const c = r.cpuFrame, u = r.update, d = r.render;
  console.log(`[${scene}] boot ${(boot / 1000).toFixed(1)}s heap ${result.scenes[scene].heapMB}MB fps ${r.fps} 长帧 ${r.longFrames} | 帧CPU p50 ${c.p50} p95 ${c.p95} p99 ${c.p99} max ${c.max} | update p95 ${u.p95} max ${u.max} | render p50 ${d.p50} p95 ${d.p95} | q${r.quality} gl=${r.gl}`);
  if (r.charCache) console.log(`    人物缓存 baked ${r.charCache.baked} reused ${r.charCache.reused} direct ${r.charCache.direct} ${JSON.stringify(r.charCache.why)}`);
  if (r.gpu) console.log(`    GPU ${r.gpu.ms}ms ${r.gpu.px} ` + JSON.stringify(r.gpu.sec));
  if (r.forcedLayout?.length) console.log('    强制布局: ' + r.forcedLayout.map(([k, v]) => `${k} ${v}ms`).join(' | '));
  if (r.slowUpdate?.length) console.log('    慢 update: ' + r.slowUpdate.map((s) => `${s.ms}ms←${s.top.map(([k, v]) => k + ' ' + v).join('/')}`).join(' | '));
  console.log('    ' + r.top.slice(0, 8).map((t) => `${t.k} ${t.ms}`).join(' · '));
  for (const f of (r.loaf ?? []).slice(0, process.argv.includes('--loaf') ? 8 : 0)) console.log(`    LoAF ${f.dur}ms (render ${f.render} style ${f.style}) ` + f.scripts.map((s) => `${s.ms}ms(布局${s.lay}) ${s.type}:${s.inv} ${s.fn}@${s.src}`).join(' | '));
  if (r.spikes.length) console.log('    长帧: ' + r.spikes.map((s) => `${s.ms}ms←${s.top.map((x) => x.k + ' ' + x.ms).join('/')}`).join(' | '));
}
writeFileSync(out + `browser-${label}.json`, JSON.stringify(result, null, 1));
console.log('GPU:', Object.values(result.scenes)[0]?.gpu);
sock.close(); proc.kill();
