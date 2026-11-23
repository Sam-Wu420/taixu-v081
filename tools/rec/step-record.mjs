// r7-fx3d：逐帧录。机器忙的时候 record.mjs 用的 CDP 录屏会断帧（量过只剩每秒 4–7 帧），这一份改成：
// 页面就绪后接管 requestAnimationFrame、游戏用固定步长（1/30 秒），推一步截一张，出来的视频每一帧都在、时长和游戏时间一致；
// 界面的 CSS 动画（定格特写、大字砸屏）按量出来的每步真实耗时放慢（Animation.setPlaybackRate），和游戏的钟对齐；途中弹出的对话框自动关掉。
// 用法：node tools/rec/step-record.mjs <端口> <网址参数> <就绪表达式> <触发表达式> <录几秒> <输出.mp4> [字幕] [副标题]
//   例：node tools/rec/step-record.mjs 5219 "try=hanshan&move=wuji" "!!window.__hs3Ready" "window.__hs3.again()" 3.6 tools/out/rec/22-wuji.mp4 无极一击 踏地一冲
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const [PORT, Q, READY, TRIG, SECS, OUTF, TITLE = '', SUB = ''] = process.argv.slice(2);
// r9：无头 Edge 在这台机器上跑一分钟上下 requestAnimationFrame 就整个停住（空白页、关 GPU、发鼠标输入、关 EcoQoS / 遮挡计算 / vsync、重载页面都一样；
// 同样的参数换 Chrome 跑两分钟一直六十帧以上）——装了 Chrome 就用 Chrome，HEADLESS_BROWSER 环境变量可以指定
const EDGE = [process.env.HEADLESS_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-shot-')), port = 9300 + Math.floor(Math.random() * 500);
const child = spawn(EDGE, ['--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${port}`,
  '--window-size=1600,900', '--hide-scrollbars', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion', 'about:blank'], { stdio: 'ignore', env: { ...process.env, TEMP: profile, TMP: profile } })   // 主线 8f28288：浏览器的临时目录放进各自的配置目录（被强关时 scoped_dir* 随配置目录一起删）;
let exited = false; child.on('exit', () => { exited = true; });
const dir = resolve(OUTF + '.frames'); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
let ws; const pending = new Map(); let seq = 0; const waiters = [];
const send = (method, params = {}, timeout = 60000) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(method + ' 超时')); } }, timeout); });
const ev = async (expr, timeout = 30000) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, timeout)).result?.value;
try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* */ } }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } else if (d.method === 'Emulation.virtualTimeBudgetExpired') { const w = waiters.shift(); if (w) w(); } };
  await send('Page.enable'); await send('Runtime.enable');
  // r9：无头页一直当成「在前台、有焦点」——跑久了 rAF 停住的一个来由是页面被当成后台 / 被遮挡（屏幕关了、锁屏时 Windows 报窗口被遮挡），rAF 整个暂停
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {}); await send('Page.bringToFront').catch(() => {});
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/tools/perf-acceptance.html?auto=new&map=tiannan&${Q}` });
  await sleep(15000);
  const t0 = Date.now(); let ok = false;
  while (Date.now() - t0 < 150000) { try { if (await ev(READY, 10000)) { ok = true; break; } } catch { /* */ } await sleep(800); }
  if (!ok) throw new Error('没就绪');
  await sleep(4000);
  if (TITLE) await ev(`(() => { const st = document.createElement('style'); st.textContent = '.toasts{display:none!important}#perf-panel{display:none!important}.cap-hs{position:fixed;left:48px;bottom:118px;z-index:9999;font-family:"Ma Shan Zheng","STKaiti","KaiTi",serif;color:#f6ead0;text-shadow:0 2px 10px rgba(0,0,0,.85),0 0 2px #000;pointer-events:none}.cap-hs b{display:block;font-size:56px;letter-spacing:.12em;font-weight:normal}.cap-hs i{display:block;font-style:normal;font-size:24px;opacity:.9;margin-top:2px}'; document.head.appendChild(st); const d = document.createElement('div'); d.className = 'cap-hs'; d.innerHTML = ${JSON.stringify(`<b>${TITLE}</b><i>${SUB}</i>`)}; document.body.appendChild(d); return 1; })()`);
  await ev(`(() => { const g = window.__game; g.debugFixedDt = 1 / 30; window.__q = []; const raf0 = window.requestAnimationFrame.bind(window); window.__raf0 = raf0;
    window.requestAnimationFrame = (cb) => { window.__q.push(cb); return 0; };
    window.__step = () => new Promise((res) => { for (let i = 0; i < 4 && g.modal; i++) { try { g.closeModal(true); } catch (e) {} } const q = window.__q; window.__q = []; const t = performance.now(); for (const cb of q) { try { cb(t); } catch (e) { console.error(e); } } raf0(() => raf0(() => res(q.length))); });
    return 1; })()`);
  await send('Animation.enable');
  const N = Math.round(Number(SECS) * 30);
  const step = () => ev('window.__step()', 20000);
  for (let i = 0; i < 15; i++) await step();   // 0.5 秒空跑
  let t1 = Date.now(); for (let i = 0; i < 10; i++) await step();
  const per = (Date.now() - t1) / 10; await send('Animation.setPlaybackRate', { playbackRate: Math.min(1, (1000 / 30) / per) });
  console.log(`每步约 ${per.toFixed(0)} 毫秒，界面动画放慢到 ${Math.min(1, (1000 / 30) / per).toFixed(2)}`);
  ev(`(() => { try { return String(${TRIG}); } catch (e) { return 'ERR ' + e.message; } })()`).catch(() => {});
  for (let i = 0; i < N; i++) {
    await step();
    const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 }, 20000);
    writeFileSync(join(dir, `s${String(i).padStart(5, '0')}.jpg`), Buffer.from(r.data, 'base64'));
  }
  const g = await ev('(() => { const g = window.__game; return g ? g.time : null; })()');
  console.log(`录了 ${N} 帧，游戏时间 ${g}`);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', join(dir, 's%05d.jpg'), '-vf', 'scale=1280:720', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', OUTF], { encoding: 'utf8' });
  console.log(r.status === 0 ? '✓ ' + OUTF : '✗ ffmpeg ' + r.stderr.slice(0, 200));
} catch (e) { console.log('✗ ' + e.message); }
try { child.kill(); } catch { /* */ }
for (let i = 0; i < 40 && !exited; i++) await sleep(250);
try { rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); } catch { /* */ }
process.exit(0);
