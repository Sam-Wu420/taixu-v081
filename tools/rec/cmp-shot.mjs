// r9：对照图用的逐帧截图——页面就绪后接管 requestAnimationFrame（同 step-record.mjs），游戏按固定步长一步步推，
// 触发一招之后按「这一招自己的钟」（第二阶段的招 run.data.T、其余的 run.t：命中顿帧时钟停住）走到要的几个时刻各截一张。
// 起手时刻用招式自己的钟对齐，不估。每张旁边记一行取景数据（他占画面几成、推多近、对手框没框进来）。
// 环境变量 CMP_WHO=yewushe：按夜无赦（game.yewushe）的招式钟截（默认撼山客）
// 用法：node tools/rec/cmp-shot.mjs <端口> <网址参数> <就绪表达式> <触发表达式> <时刻,时刻,…> <输出目录> [前缀]
//   例：node tools/rec/cmp-shot.mjs 5219 "try=hanshan&move=p2xuan&noauto=1" "!!window.__hs3Ready" "window.__hs3.again()" 0.2,0.53,1.72,2.72 tools/out/sanda-cmp/raw p2xuan
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename } from 'node:path';
const [PORT, Q, READY, TRIG, TIMES, OUTD, PRE = 'shot'] = process.argv.slice(2);
const times = TIMES.split(',').map(Number).sort((a, b) => a - b);
// r9：无头 Edge 在这台机器上跑一分钟上下 requestAnimationFrame 就整个停住（空白页、关 GPU、发鼠标输入、关 EcoQoS / 遮挡计算 / vsync、重载页面都一样；
// 同样的参数换 Chrome 跑两分钟一直六十帧以上）——装了 Chrome 就用 Chrome，HEADLESS_BROWSER 环境变量可以指定
const EDGE = [process.env.HEADLESS_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-shot-')), port = 9300 + Math.floor(Math.random() * 500);
const child = spawn(EDGE, ['--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${port}`,
  '--window-size=1600,900', '--hide-scrollbars', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion', 'about:blank'], { stdio: 'ignore', env: { ...process.env, TEMP: profile, TMP: profile } })   // 主线 8f28288：浏览器的临时目录放进各自的配置目录（被强关时 scoped_dir* 随配置目录一起删）;
let exited = false; child.on('exit', () => { exited = true; });
const killer = setTimeout(() => { console.log('✗ 超时'); finish(3); }, 420000);
mkdirSync(resolve(OUTD), { recursive: true });
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
try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* */ } }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  // r9：无头页一直当成「在前台、有焦点」——跑久了 rAF 停住的一个来由是页面被当成后台 / 被遮挡（屏幕关了、锁屏时 Windows 报窗口被遮挡），rAF 整个暂停
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {}); await send('Page.bringToFront').catch(() => {});
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/tools/perf-acceptance.html?auto=new&map=tiannan&${Q}` });
  await sleep(15000);
  const t0 = Date.now(); let ok = false;
  while (Date.now() - t0 < 150000) { try { if (await ev(READY, 10000)) { ok = true; break; } } catch { /* */ } await sleep(800); }
  if (!ok) throw new Error('没就绪');
  await sleep(2500);
  await ev(`(() => { const st = document.createElement('style'); st.textContent = '.toasts{display:none!important}#perf-panel{display:none!important}'; document.head.appendChild(st); return 1; })()`);
  // 接管 rAF：推一步 = 把排着的回调跑一遍（固定步长 1/60），再等浏览器真画两帧
  await ev(`(() => { const g = window.__game; g.debugFixedDt = 1 / 60; window.__q = []; const raf0 = window.requestAnimationFrame.bind(window); window.__raf0 = raf0;
    window.requestAnimationFrame = (cb) => { window.__q.push(cb); return 0; };
    window.__step = (n = 1) => new Promise((res) => { for (let k = 0; k < n; k++) { for (let i = 0; i < 4 && g.modal; i++) { try { g.closeModal(true); } catch (e) {} } const q = window.__q; window.__q = []; const t = performance.now(); for (const cb of q) { try { cb(t); } catch (e) { console.error(e); } } } raf0(() => raf0(() => res(1))); });
    window.__clk = () => { const H = g[${JSON.stringify(process.env.CMP_WHO || 'hanshan')}], e = H && H.ent; const B = g.combat.brawl; for (const r of B.runs) if (r.user === e && !r.done) { const T = r.data && typeof r.data.T === 'number' ? r.data.T : r.t; return { id: r.def.id, T }; } return null; };
    if (window.__noShadow) g.renderer.hd.shadowsEnabled = false;
    window.__info = () => { const B = g.combat.brawl, s = B.shotInfo || {}; return { fill: +(s.fill || 0).toFixed(3), zoom: +(g.cam.zoom).toFixed(2), both: !!s.both, shot: !!B.shotWho }; };
    return 1; })()`);
  await send('Animation.enable');
  for (let i = 0; i < 10; i++) await ev('window.__step()');
  // r9：界面的 CSS 动画（书法大字、横贯光线）按真实时间走，游戏这边一步一步推得慢——量出每步真实耗时，把动画放慢到和游戏的钟一样快（同 step-record.mjs）
  { const t1 = Date.now(); for (let i = 0; i < 10; i++) await ev('window.__step()'); const per = (Date.now() - t1) / 10; await send('Animation.setPlaybackRate', { playbackRate: Math.min(1, (1000 / 60) / per) }); }
  const tr = await ev(`(() => { try { return String(${TRIG}); } catch (e) { return 'ERR ' + e.message; } })()`);
  if (String(tr).startsWith('ERR')) console.log('触发：' + tr);
  // 等这一招起手（最多 6 息游戏时间）
  let clk = null;
  for (let i = 0; i < 360 && !clk; i++) { await ev('window.__step()'); clk = await ev('window.__clk()'); }
  if (!clk) throw new Error('招没起手');
  console.log('起手：' + clk.id);
  const log = [];
  for (const T of times) {
    let n = 0;
    for (;;) { clk = await ev('window.__clk()'); if (!clk || clk.T >= T - 1e-4) break; await ev('window.__step()'); if (++n > 900) break; }
    if (!clk) { console.log(`  ${T}：招已经收了`); }
    // 定格再画几帧（游戏时间几乎不走）：人物是画人线程异步画的、画面也会晚一两帧上屏——不等这几帧，截到的是好几步以前的人和镜头
    await ev(`(async () => { const g = window.__game, f = () => new Promise((r) => window.__raf0(() => window.__raf0(r))); for (let i = 0; i < 6; i++) { try { g.renderer.render(0); } catch (e) {} await f(); await new Promise((r) => setTimeout(r, 30)); } return 1; })()`);   // 只重画、不走世界（不调 update：步长取极小会让衣带、发丝的弹簧甩成长线，暂停又照样走钟）
    let r; try { r = await send('Page.captureScreenshot', { format: 'png' }, 60000); } catch { await sleep(3000); r = await send('Page.captureScreenshot', { format: 'png' }, 90000); }   // 机器内存紧时截图会慢，再试一次
    const f = join(resolve(OUTD), `${PRE}-${T.toFixed(2)}.png`);
    writeFileSync(f, Buffer.from(r.data, 'base64'));
    const info = await ev('window.__info()');
    if (process.env.CMP_EVAL) { try { console.log('    ' + JSON.stringify(await ev(process.env.CMP_EVAL))); } catch (e) { console.log('    eval ✗ ' + e.message); } }   // 环境变量 CMP_EVAL：每张截完在页面里算一下、打印出来（查参数用）
    log.push({ T, at: clk?.T ?? null, ...info });
    console.log(`  ${T.toFixed(2)}（钟 ${clk ? clk.T.toFixed(3) : '-'}）占画面 ${(info.fill * 100).toFixed(0)}%  推近 ${info.zoom}  ${info.both ? '两人同框' : '只框他'}  → ${f}`);
  }
  writeFileSync(join(resolve(OUTD), `${PRE}.json`), JSON.stringify(log, null, 1));
  await finish(0);
} catch (e) { console.log('✗ ' + e.message); await finish(1); }
