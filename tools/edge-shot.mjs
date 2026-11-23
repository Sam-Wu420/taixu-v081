// 用系统自带的 Edge（无头模式）打开一个页面，按真实时间跑一阵，执行几段脚本、截几张图。
// 独立进程：页面卡死只影响它自己，到时间一律结束。给自动化检查画面用。
//
// 用法：node tools/edge-shot.mjs <网址> [--wait=秒] [--size=1600x900] [--out=图.png] [--eval=脚本.js] [--step=秒|图.png[|脚本.js]] ...
//   --wait   打开后先等多少秒（默认 8）
//   --eval   等完后在页面里执行这个文件里的表达式（可以是 async 的立即执行函数），结果打印成 JSON
//   --out    然后截一张图
//   --step   再等若干秒、可选地执行一段脚本、再截一张图；可以写多个，按顺序做
//   --flags  额外的浏览器启动参数，逗号分隔（如 --flags=--enable-precise-memory-info 让 performance.memory 逐帧准确）
//   --cpu    CPU 降速倍数（CDP Emulation.setCPUThrottlingRate），--eval 跑完之后才开始降速（页面加载不受影响），如 --cpu=4 模拟慢机器 / 机器很忙时量帧
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2), url = args.find((a) => !a.startsWith('--'));
if (!url) { console.error('缺网址'); process.exit(2); }
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const [W, H] = opt('size', '1600x900').split('x').map(Number);
const steps = args.filter((a) => a.startsWith('--step=')).map((a) => { const [s, out, js] = a.slice(7).split('|'); return { wait: Number(s), out, js }; });
// r9：无头 Edge 在这台机器上跑一分钟上下 requestAnimationFrame 就整个停住（空白页、关 GPU、发鼠标输入、关 EcoQoS / 遮挡计算 / vsync、重载页面都一样；
// 同样的参数换 Chrome 跑两分钟一直六十帧以上）——装了 Chrome 就用 Chrome，HEADLESS_BROWSER 环境变量可以指定
const EDGE = [process.env.HEADLESS_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync);
if (!EDGE) { console.error('找不到 Edge / Chrome'); process.exit(2); }
const profile = mkdtempSync(join(tmpdir(), 'edge-shot-')), port = 9300 + Math.floor(Math.random() * 500);
const child = spawn(EDGE, ['--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${port}`, `--window-size=${W},${H}`,
  '--hide-scrollbars', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion', ...opt('flags', '').split(',').filter(Boolean), 'about:blank'], { stdio: 'ignore', env: { ...process.env, TEMP: profile, TMP: profile } })   // 主线 8f28288：浏览器的临时目录放进各自的配置目录（被强关时 scoped_dir* 随配置目录一起删）;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const budget = (Number(opt('wait', '8')) + steps.reduce((a, s) => a + s.wait, 0) + 60 + Number(opt('extra', '0'))) * 1000;   // --extra=秒：脚本本身跑得久时放宽总时限
const killer = setTimeout(() => { console.error('超时，结束'); done(3); }, budget);
// 收尾：等 Edge 真正退出再删临时配置目录（原来 kill 后 400 毫秒就删，Edge 还占着文件，删不掉的目录一份两百多兆，
// 一天下来在临时目录里攒了 30GB、把 C 盘写满）；删不掉就隔一会儿再试几次
let exited = false; child.on('exit', () => { exited = true; });
function done(code) {
  clearTimeout(killer); try { child.kill(); } catch { /* */ }
  let tries = 0;
  const clean = () => {
    tries++;
    if (!exited && tries < 20) { setTimeout(clean, 250); return; }
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); } catch { /* */ }
    if (existsSync(profile) && tries < 40) { setTimeout(clean, 500); return; }
    process.exit(code);
  };
  setTimeout(clean, 300);
}

try {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) { await sleep(250); try { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); target = list.find((t) => t.type === 'page'); } catch { /* 还没起来 */ } }
  if (!target) throw new Error('浏览器没起来');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('连不上调试端口')); });
  let seq = 0; const pending = new Map(), logs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') logs.push('异常 ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 300));
    else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) logs.push(m.params.type + ' ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  };
  const send = (method, params = {}, timeout = 60000) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(method + ' 没有回应（页面可能卡死）')); } }, timeout); });
  await send('Page.enable'); await send('Runtime.enable');
  // r9：无头页一直当成「在前台、有焦点」——跑久了 rAF 停住的一个来由是页面被当成后台 / 被遮挡（屏幕关了、锁屏时 Windows 报窗口被遮挡），rAF 整个暂停
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {}); await send('Page.bringToFront').catch(() => {});
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  const run = async (file) => {
    const r = await send('Runtime.evaluate', { expression: readFileSync(file, 'utf8'), awaitPromise: true, returnByValue: true }, 45000);
    if (r.exceptionDetails) return { error: (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text).slice(0, 500) };
    return r.result.value;
  };
  const shot = async (file) => { const r = await send('Page.captureScreenshot', { format: 'png' }, 30000); writeFileSync(file, Buffer.from(r.data, 'base64')); console.log('截图 ' + file); };
  await sleep(Number(opt('wait', '8')) * 1000);
  if (opt('eval')) console.log('结果 ' + JSON.stringify(await run(opt('eval'))));
  if (Number(opt('cpu', '1')) > 1) await send('Emulation.setCPUThrottlingRate', { rate: Number(opt('cpu', '1')) });
  if (opt('out')) await shot(opt('out'));
  for (const s of steps) { await sleep(s.wait * 1000); if (s.js) console.log('结果 ' + JSON.stringify(await run(s.js))); if (s.out) await shot(s.out); }
  if (logs.length) console.log('页面报错 / 警告（前 8 条）：\n  ' + [...new Set(logs)].slice(0, 8).join('\n  '));
  done(0);
} catch (e) { console.error('失败：' + (e?.message ?? e)); done(1); }
