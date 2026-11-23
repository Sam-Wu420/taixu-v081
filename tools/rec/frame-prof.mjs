// r9：量招式放的时候的帧时间、找卡帧的真正原因（CDP 的 Profiler + 页面里的 Long Animation Frame）。
// 一个页面里：等就绪 → 每招先放一遍预热（不算）→ 再放 reps 遍，每遍按真实时间量每一帧的间隔（rAF）：最长帧、p95、超 50 毫秒的帧数；
// 最后一遍同时开 CPU 采样，把「连续忙超过 40 毫秒」的那几段里自己耗时最多的函数列出来（这就是卡帧的那一帧在干什么）。
// 用法：node tools/rec/frame-prof.mjs <端口> <网址参数> <就绪表达式> <触发模板（$ID 换成招名）> <招名,招名,…> <每招录几秒> [--reps=2] [--out=json]
//   例：node tools/rec/frame-prof.mjs 5219 "try=hsp1&move=jingang&loop=0&real=1" "!!window.__p1Ready" "window.__p1.go('$ID', undefined, true)" jingang,yingzong 3
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
const pos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const opt = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const [PORT, Q, READY, TRIG, IDS, SECS] = pos;
const REPS = Number(opt('reps', '2')), OUT = opt('out', '');
const [VW, VH] = opt('size', '1600x900').split('x').map(Number);   // r19：--size=1920x1080 按 1080p 量
// r9：无头 Edge 在这台机器上跑一分钟上下 requestAnimationFrame 就整个停住（空白页、关 GPU、发鼠标输入、关 EcoQoS / 遮挡计算 / vsync、重载页面都一样；
// 同样的参数换 Chrome 跑两分钟一直六十帧以上）——装了 Chrome 就用 Chrome，HEADLESS_BROWSER 环境变量可以指定
const EDGE = [process.env.HEADLESS_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-shot-')), port = 9300 + Math.floor(Math.random() * 500);
const child = spawn(EDGE, ['--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${port}`,
  `--window-size=${VW},${VH}`, '--hide-scrollbars', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion', 'about:blank'], { stdio: 'ignore', env: { ...process.env, TEMP: profile, TMP: profile } })   // 主线 8f28288：浏览器的临时目录放进各自的配置目录（被强关时 scoped_dir* 随配置目录一起删）;
let exited = false; child.on('exit', () => { exited = true; });
const killer = setTimeout(() => { console.log('✗ 超时'); finish(3); }, 570000);
let ws; const pending = new Map(); let seq = 0;
const send = (method, params = {}, timeout = 60000) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(method + ' 超时')); } }, timeout); });
const ev = async (expr, timeout = 30000) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, timeout); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description ?? r.exceptionDetails.text).slice(0, 300)); return r.result?.value; };
async function finish(code) {
  clearTimeout(killer);
  // r9：先让浏览器自己关（CDP Browser.close：整棵进程树一起退），再 kill / 按进程树强杀兜底
  try { const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); const bw = new WebSocket(v.webSocketDebuggerUrl); await new Promise((r) => { bw.onopen = r; bw.onerror = r; setTimeout(r, 3000); }); bw.send(JSON.stringify({ id: 1, method: 'Browser.close' })); await sleep(1500); } catch { /* */ }
  try { child.kill(); } catch { /* */ }
  for (let i = 0; i < 20 && !exited; i++) await sleep(250);
  // r9：child.kill 有时只结束了启动的那一个进程、浏览器本体还活着（一个两三百兆）——按进程树强杀
  try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* */ }
  try { const tag = basename(profile); spawnSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process | ? { ($_.Name -eq 'msedge.exe' -or $_.Name -eq 'chrome.exe') -and $_.CommandLine -like '*${tag}*' } | % { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: 'ignore', timeout: 20000 }); } catch { /* */ }
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); } catch { /* */ }
  process.exit(code);
}
/** CPU 采样里「连续忙」的段（相邻采样都不是空闲、合起来超过 40 毫秒），每段里自己耗时最多的函数 */
function busyWindows(prof) {
  const nodes = new Map(prof.nodes.map((n) => [n.id, n]));
  const idle = new Set(prof.nodes.filter((n) => n.callFrame.functionName === '(idle)').map((n) => n.id));
  const out = []; let cur = null, t = 0;
  for (let i = 0; i < prof.samples.length; i++) {
    const dt = (prof.timeDeltas[i] ?? 0) / 1000; t += dt;
    const id = prof.samples[i];
    if (idle.has(id) || dt > 8) { if (cur && cur.dur >= 40) out.push(cur); cur = idle.has(id) ? null : { at: t, dur: 0, self: new Map() }; if (!cur) continue; }
    if (!cur) cur = { at: t, dur: 0, self: new Map() };
    cur.dur += dt;
    const n = nodes.get(id), cf = n.callFrame, key = `${cf.functionName || '(匿名)'} ${(cf.url || '').split('/').pop()}:${cf.lineNumber + 1}`;
    cur.self.set(key, (cur.self.get(key) ?? 0) + dt);
  }
  if (cur && cur.dur >= 40) out.push(cur);
  return out.map((w) => ({ at: Math.round(w.at), dur: Math.round(w.dur), top: [...w.self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v.toFixed(1)}`) }));
}
try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* */ } }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } };
  await send('Page.enable'); await send('Runtime.enable'); await send('Profiler.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {}); await send('Page.bringToFront').catch(() => {});
  await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/tools/perf-acceptance.html?auto=new&map=tiannan&${Q}` });
  await sleep(15000);
  const t0 = Date.now(); let ok = false;
  while (Date.now() - t0 < 150000) { try { if (await ev(READY, 10000)) { ok = true; break; } } catch { /* */ } await sleep(800); }
  if (!ok) throw new Error('没就绪');
  await sleep(4000);
  // 页面里：rAF 量帧间隔；长动画帧（LoAF）记下脚本入口
  await ev(`(() => { const M = window.__fm = { on: false, f: [], loaf: [] }; let last = performance.now();
    const tick = (t) => { if (M.on) M.f.push(t - last); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    try { new PerformanceObserver((l) => { if (!M.on) return; for (const e of l.getEntries()) M.loaf.push({ d: Math.round(e.duration), render: e.renderStart ? Math.round(e.startTime + e.duration - e.renderStart) : 0, scripts: (e.scripts || []).map((s) => (s.sourceFunctionName || s.invoker || '?') + ' ' + Math.round(s.duration)).slice(0, 4) }); }).observe({ type: 'long-animation-frame' }); } catch (e) {}
    return 1; })()`);
  const rows = [];
  for (const id of IDS.split(',')) {
    const trig = TRIG.replaceAll('$ID', id);
    const runOnce = async (measure, prof) => {
      // 开采样本身会卡一下（头一两百毫秒到一秒多全是 (program)）：先开、等两秒再触发，那一段不算
      if (prof) { await send('Profiler.setSamplingInterval', { interval: 250 }).then(() => send('Profiler.start')); await sleep(2000); }
      // 游戏自己的分项计时（prof：>50 毫秒的帧里当帧最贵的三项）一起开
      if (measure) await ev('(() => { const M = window.__fm; M.f = []; M.loaf = []; M.on = true; const P = window.__prof; if (P) { P.reset(); P.on = true; } return 1; })()');
      ev(`(() => { try { return String(${trig}); } catch (e) { return 'ERR ' + e.message; } })()`, 60000).catch(() => {});
      await sleep(Number(SECS) * 1000);
      let diag = null; try { diag = await ev('({ vis: document.visibilityState, focus: document.hasFocus(), t: window.__game ? +window.__game.time.toFixed(2) : null })', 5000); } catch (e) { diag = { err: e.message }; }
      if (measure) console.log('   页面：' + JSON.stringify(diag));
      const r = measure ? await ev('(() => { const M = window.__fm; M.on = false; const P = window.__prof; let sp = [], top = []; if (P) { sp = P.spikes.slice(); top = P.report(6); P.on = false; } return { f: M.f, loaf: M.loaf, sp, top }; })()') : null;
      const p = prof ? (await send('Profiler.stop')).profile : null;
      await sleep(1500);
      return { r, p };
    };
    await runOnce(false, false);   // 预热（第一次编着色器、建网格的那一遍不算）
    const reps = [];
    for (let k = 1; k <= REPS + 1; k++) {
      const { r, p } = await runOnce(true, k === REPS + 1);   // 前 REPS 遍不开采样（量帧时间）；最后多放一遍开采样（找原因，帧时间不算）
      const f = r.f.filter((x) => x > 0).sort((a, b) => a - b), max = f.at(-1) ?? 0, p95 = f[Math.floor(f.length * 0.95)] ?? 0, over = f.filter((x) => x > 50).length;
      const rep = { rep: k, frames: f.length, max: +max.toFixed(1), p95: +p95.toFixed(1), over50: over, loaf: r.loaf.filter((l) => l.d > 50).slice(0, 4) };
      if (p) rep.busy = busyWindows(p).filter((w) => w.at > 1900).sort((a, b) => b.dur - a.dur).slice(0, 4);
      reps.push(rep);
      console.log(`${id} ${k > REPS ? '采样那一遍' : '第' + k + '遍'}：${f.length} 帧，最长 ${max.toFixed(1)} 毫秒，p95 ${p95.toFixed(1)}，超 50 毫秒 ${over} 帧`);
      for (const l of rep.loaf) console.log(`   长帧 ${l.d} 毫秒（画 ${l.render}）${l.scripts.join(' | ')}`);
      rep.spikes = r.sp; rep.avg = r.top;
      for (const x of r.sp.slice(0, 5)) console.log(`   分项：${x.ms} 毫秒 ← ${x.top.map((y) => y.k + ' ' + y.ms).join(' / ')}`);
      if (k === 1) console.log(`   平均每帧：${r.top.map((y) => y.k + ' ' + y.ms).join(' / ')}`);
      if (rep.busy) for (const w of rep.busy) console.log(`   忙 ${w.dur} 毫秒 @${w.at}：${w.top.join('；')}`);
    }
    rows.push({ id, reps });
  }
  if (OUT) writeFileSync(OUT, JSON.stringify(rows, null, 1));
  await finish(0);
} catch (e) { console.log('✗ ' + e.message); await finish(1); }
