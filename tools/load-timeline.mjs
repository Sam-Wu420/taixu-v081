// r10：进游戏加载的时间线。开一个无头 Chrome（没有就 Edge），照真人的点法点按钮，从点下去那一刻起逐帧记：
//   · 画面：CDP 录屏（Page.startScreencast）每一帧的时间戳；相邻两帧缩成 160×90 比像素，变了才算「画面在动」
//   · 主线程：页面里的 longtask 观察器（50 毫秒以上的任务）、requestAnimationFrame 的间隔（主线程被占住时 rAF 停）
//   · 阶段：页面里 MutationObserver 看哪一屏在（标题 / 开场字幕 / 加载画面 / 画布 / 界面），以及 performance.mark('ld:*')
// 三条路径：
//   new       标题页 → 点「踏入仙途」→ 点「凡人」道心 → 开场字幕点「跳过」→ 加载 → 能玩
//   continue  先 ?auto=new 开一局存进自动存档位，再回标题 → 点「继续仙途」→ 加载 → 能玩
//   shahe     先在 /tools/install-mods.html 装好模组（没有存档）→ 标题页点「天工试场」→ 点「入阵」（整页重载、开临时新局）→ 进到云上演武台 → 能玩
// 「能玩」：加载画面已经不在（或已淡出）、游戏的主循环在跑，且此后连续 1 秒 rAF 间隔都不超过 100 毫秒。
// 用法：node tools/load-timeline.mjs --path=new|continue|shahe [--port=5213] [--size=1600x900] [--out=结果.json] [--frames=目录（留下录屏帧做视频）] [--after=秒（能玩以后再录几秒）]
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const PATH = arg('path', 'new'), PORT = arg('port', '5213'), [W, H] = arg('size', '1600x900').split('x').map(Number);
const OUT = arg('out', ''), AFTER = Number(arg('after', '3')), PROFILE = arg('profile', '');
// --video=成片.mp4：留下 1280×720 的录屏帧、录声音，最后合成视频（帧用完即删）；--walk：能玩以后按键走几步
const VIDEO = arg('video', ''), WALK = process.argv.includes('--walk'), FRAMES = arg('frames', '') || (VIDEO ? join(tmpdir(), 'lt-video-' + Date.now()) : '');
const BASE = `http://127.0.0.1:${PORT}`;
const BROWSER = [process.env.HEADLESS_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 页面里的记录器：每个新文档一开始就装上
const PROBE = `(() => {
  const T = () => performance.timeOrigin + performance.now();
  const L = window.__lt = { raf: [], lt: [], ev: [], marks: [], t0: T() };
  const tick = () => { L.raf.push(T()); requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) L.lt.push([performance.timeOrigin + e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name.startsWith('ld:')) L.marks.push([e.name, performance.timeOrigin + e.startTime]); }).observe({ type: 'mark', buffered: true }); } catch (e) {}
  let st = null;
  const scan = () => {
    const q = (s) => document.querySelector(s);
    const ld = q('.loading');
    const s = [q('.title-screen') && 'title', q('.intro') && 'intro', ld && ('loading' + (ld.classList.contains('out') ? '-out' : '')), q('canvas.game-canvas') && 'canvas', q('.hud') && 'hud', q('.sh-gate:not([hidden])') && 'gate', q('.sh-hud:not([hidden])') && 'shahe'].filter(Boolean).join('+') || 'blank';
    if (s !== st) { st = s; L.ev.push([T(), s]); }
  };
  const start = () => { scan(); new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] }); };
  if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start);
  addEventListener('pointerdown', (e) => L.ev.push([T(), 'pointerdown ' + ((e.target && e.target.textContent) || '').trim().replace(/\\s+/g, '').slice(0, 8)]), true);
})()`;

const profile = mkdtempSync(join(tmpdir(), 'edge-shot-')), dport = 9300 + Math.floor(Math.random() * 500);
const child = spawn(BROWSER, ['--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${dport}`, `--window-size=${W},${H}`,
  '--hide-scrollbars', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--disable-features=CalculateNativeWinOcclusion', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore', env: { ...process.env, TEMP: profile, TMP: profile } });
let exited = false; child.on('exit', () => { exited = true; });
const frameDir = FRAMES ? resolve(FRAMES) : mkdtempSync(join(tmpdir(), 'lt-frames-'));
mkdirSync(frameDir, { recursive: true });
let ws, seq = 0; const pending = new Map(); const frames = []; let rec = false;
const send = (method, params = {}, timeout = 60000) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(method + ' 超时')); } }, timeout); });
const ev = async (expr, timeout = 30000) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, timeout); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result?.value; };
const evq = async (expr, timeout = 3000) => { try { return await ev(expr, timeout); } catch { return undefined; } };
async function waitFor(expr, ms, step = 200) { const t = Date.now(); while (Date.now() - t < ms) { if (await evq(expr)) return true; await sleep(step); } return false; }
/** 真点：取按钮中心坐标，用 CDP 发鼠标按下 / 抬起（和真人一样走浏览器的输入管线；主线程忙时排队） */
async function click(selExpr, label) {
  let r = null;
  for (let i = 0; i < 40 && !r; i++) { r = await evq(`(() => { const b = ${selExpr}; if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`); if (!r) await sleep(250); }
  if (!r) throw new Error('找不到按钮：' + label + ' ' + JSON.stringify(await evq(`({ url: location.href, btns: [...document.querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => b.textContent.trim().slice(0, 8)).slice(0, 20) })`)));
  const t = Date.now();
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  console.log(`  点「${label}」`);
  return t;
}
const btn = (text, sel = 'button') => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((b) => b.textContent.replace(/[\\s　]/g, '').startsWith(${JSON.stringify(text)}) && b.offsetParent && !b.disabled)`;

async function main() {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${dport}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* */ } }
  if (!target) throw new Error('浏览器没起来');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('连不上调试端口')); });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
    if (m.method === 'Page.screencastFrame') {
      const { data, metadata, sessionId } = m.params;
      if (rec) { const f = join(frameDir, `f${String(frames.length).padStart(5, '0')}.jpg`); writeFileSync(f, Buffer.from(data, 'base64')); frames.push({ f, t: metadata.timestamp * 1000 }); }
      ws.send(JSON.stringify({ id: ++seq, method: 'Page.screencastFrameAck', params: { sessionId } }));
    }
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {}); await send('Page.bringToFront').catch(() => {});
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < H || H < 500 });
  if (W < H || H < 500) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }).catch(() => {});

  // —— 准备
  if (PATH === 'continue') {
    await send('Page.navigate', { url: `${BASE}/?auto=new` });
    if (!await waitFor('!!(window.__game && window.__game.frameNo > 120)', 120000)) throw new Error('准备存档：游戏没起来');
    const ok = await ev('window.__game.save(0)'); console.log('  准备：存进自动存档位 ' + ok);
  }
  if (PATH === 'shahe') {
    await send('Page.navigate', { url: `${BASE}/tools/install-mods.html` });
    await waitFor('!document.querySelector("#go").disabled', 30000);
    await ev('document.querySelector("#go").click(), 1');
    if (!await waitFor('[...document.querySelectorAll("li")].length > 0 && [...document.querySelectorAll("li")].every((x) => x.className === "ok")', 120000, 500)) throw new Error('模组没装上');
    console.log('  准备：模组装好');
  }
  await send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });
  await send('Page.navigate', { url: `${BASE}/` });
  if (!await waitFor(`!!(${btn('踏入仙途', '.title-menu button')})`, 60000)) throw new Error('标题页没出来');
  if (PATH === 'shahe' && !await waitFor(`!!(${btn('天工试场', '.title-menu button')})`, 60000)) throw new Error('标题页没有「天工试场」');
  // 真人看一眼标题再点：按钮浮现完（3.2 秒）再等一会儿
  await sleep(4000);
  await send('Page.startScreencast', { format: 'jpeg', quality: FRAMES ? 80 : 50, maxWidth: FRAMES ? 1280 : 640, maxHeight: FRAMES ? 720 : 360, everyNthFrame: 1 });
  rec = true; await sleep(600);
  // 录屏带声音：游戏的声音是 WebAudio 现合成的，录屏抓不到——从声音引擎的总输出接一路 MediaRecorder（同 tools/rec/record.mjs）
  if (VIDEO) {
    const a = await evq(`(() => { try { const A = window.__taixuAudio; const st = A && A.recordStream(); if (!st) return 'no-audio';
      const mt = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const r = new MediaRecorder(st, { mimeType: mt, audioBitsPerSecond: 160000 }); window.__recChunks = []; r.ondataavailable = (e) => { if (e.data.size) window.__recChunks.push(e.data); };
      r.start(250); window.__recA = r; window.__recA0 = Date.now(); return 'ok'; } catch (e) { return 'ERR ' + e.message; } })()`, 5000);
    if (a !== 'ok') console.log('  录音：' + a);
  }
  if (PROFILE) { await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 2000 }); await send('Profiler.start'); }

  // —— 点按钮
  let t0;
  if (PATH === 'new') {
    t0 = await click(btn('踏入仙途', '.title-menu button'), '踏入仙途');
    if (!await waitFor('!!document.querySelector(".tt-dao-card.d-taixu")', 15000, 50)) throw new Error('道心弹窗没出来');
    await sleep(900);
    await click('document.querySelector(".tt-dao-card.d-taixu")', '凡人道心');
    if (!await waitFor('!!document.querySelector(".intro-skip")', 15000, 50)) throw new Error('开场字幕没出来');
    await sleep(1500);
    await click('document.querySelector(".intro-skip")', '跳过');
  } else if (PATH === 'continue') {
    t0 = await click(btn('继续仙途', '.title-menu button'), '继续仙途');
  } else {
    t0 = await click(btn('天工试场', '.title-menu button'), '天工试场');
    if (!await waitFor('!!document.querySelector(".sh-gate:not([hidden]) .sh-go")', 15000, 50)) throw new Error('入阵卷轴没出来');
    await sleep(900);
    await click('document.querySelector(".sh-gate .sh-go")', '入阵');
  }

  // —— 等到能玩：游戏在跑、加载画面不在，此后 1 秒 rAF 间隔都 ≤ 100 毫秒（试场再加一条：已经入阵）
  const need = PATH === 'shahe' ? '&& !!document.querySelector(".sh-hud:not([hidden])")' : '';
  const deadline = Date.now() + 120000; let playable = null;
  while (Date.now() < deadline) {
    const r = await evq(`(() => { const L = window.__lt; if (!L || !window.__game || !window.__game.running) return null; if (document.querySelector('.loading:not(.out)')) return null; if (!(true ${need})) return null;
      const now = performance.timeOrigin + performance.now(); const raf = L.raf; let k = raf.length - 1; if (k < 2) return null;
      if (now - raf[k] > 100) return null;   // 眼下这一帧本身就卡着（这段脚本是排在长任务后面才跑到的）
      // 从后往前找最后一次 > 100ms 的间隔；它之后连续 1 秒以上都顺就算
      let last = raf[0]; for (let i = raf.length - 1; i > 0; i--) if (raf[i] - raf[i - 1] > 100) { last = raf[i]; break; }
      return now - last >= 1000 ? last : null; })()`, 5000);
    if (r) { playable = r; break; }
    await sleep(250);
  }
  if (!playable) {
    console.log('  两分钟内没到「能玩」：' + JSON.stringify(await evq(`({ url: location.href, game: !!window.__game, running: !!(window.__game && window.__game.running), loading: !!document.querySelector('.loading'), gate: !!document.querySelector('.sh-gate:not([hidden])'), shud: !!document.querySelector('.sh-hud:not([hidden])'), ev: (window.__lt && window.__lt.ev.slice(-6)) })`)));
    try { const r = await send('Page.captureScreenshot', { format: 'png' }, 15000); writeFileSync(join(tmpdir(), 'lt-stuck.png'), Buffer.from(r.data, 'base64')); console.log('  截图 ' + join(tmpdir(), 'lt-stuck.png')); } catch { /* */ }
  }
  // 能玩以后真按一下键走几步（录屏里看得出「能操作了」）：W 一秒半、D 一秒
  if (WALK && playable) {
    const key = async (type, k, code, vk) => send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await sleep(600); await key('keyDown', 'w', 'KeyW', 87); await sleep(1500); await key('keyUp', 'w', 'KeyW', 87);
    await key('keyDown', 'd', 'KeyD', 68); await sleep(1000); await key('keyUp', 'd', 'KeyD', 68);
  }
  await sleep(AFTER * 1000);
  rec = false; await send('Page.stopScreencast').catch(() => {});
  let audio = null;
  if (VIDEO) {
    const got = await evq(`new Promise((res) => { const r = window.__recA; if (!r) return res(null); r.onstop = async () => { const b = new Blob(window.__recChunks, { type: r.mimeType }); const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); res({ t0: window.__recA0, b64: btoa(s) }); }; r.stop(); })`, 60000);
    if (got?.b64) { audio = { file: join(frameDir, 'audio.webm'), t0: got.t0 }; writeFileSync(audio.file, Buffer.from(got.b64, 'base64')); }
  }
  if (PROFILE) {
    // CPU 采样：按函数（名字 + 文件 + 行）合计「含子调用」的时间，列前 45
    const { profile: P } = await send('Profiler.stop', {}, 120000);
    const byId = new Map(P.nodes.map((n) => [n.id, n])), parent = new Map();
    for (const n of P.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
    const cnt = new Map(); for (const s of P.samples) cnt.set(s, (cnt.get(s) ?? 0) + 1);
    const dt = (P.endTime - P.startTime) / 1000 / P.samples.length;
    const incl = new Map(), self = new Map();
    const key = (n) => `${n.callFrame.functionName || '(匿名)'} ${n.callFrame.url.replace(/^.*\/src\//, 'src/').replace(/\?.*$/, '')}:${n.callFrame.lineNumber + 1}`;
    for (const [id, c] of cnt) {
      const seen = new Set(); let n = byId.get(id); self.set(key(n), (self.get(key(n)) ?? 0) + c * dt);
      for (let k = id; k != null; k = parent.get(k)) { const kk = key(byId.get(k)); if (seen.has(kk)) continue; seen.add(kk); incl.set(kk, (incl.get(kk) ?? 0) + c * dt); }
    }
    const top = (m) => [...m].filter(([k]) => !/^\((root|program|idle|garbage collector)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 45).map(([k, v]) => `${String(Math.round(v)).padStart(7)}ms  ${k}`).join('\n');
    writeFileSync(PROFILE, `含子调用\n${top(incl)}\n\n自身\n${top(self)}\n`); console.log('  CPU 采样 → ' + PROFILE);
  }
  const L = await ev('(() => { const L = window.__lt; return { raf: L.raf, lt: L.lt, ev: L.ev, marks: L.marks, t0: L.t0 }; })()', 30000);
  return { t0, playable, L, audio };
}

/** 录屏帧按真实时间均匀取成 30 帧每秒的序列（同 tools/rec/record.mjs），配上录到的声音，压成 mp4；左上角写「点下按钮后 x.x 秒」 */
function makeVideo(out, fr, t0, audio) {
  const seqDir = join(frameDir, 'seq'); mkdirSync(seqDir, { recursive: true });
  const s0 = fr[0].t, n = Math.max(1, Math.round((fr.at(-1).t - s0) * 30 / 1000));
  for (let k = 0, j = 0; k <= n; k++) { const tk = s0 + k * 1000 / 30; while (j + 1 < fr.length && fr[j + 1].t <= tk) j++; copyFileSync(fr[j].f, join(seqDir, `s${String(k).padStart(5, '0')}.jpg`)); }
  const vlen = (n + 1) / 30, off = audio ? (s0 - audio.t0) / 1000 : 0;
  const ain = audio ? (off >= 0 ? ['-ss', off.toFixed(3), '-i', audio.file] : ['-itsoffset', (-off).toFixed(3), '-i', audio.file]) : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'];
  // 计时字幕：从点下按钮那一刻起算（drawtext 的 pts:hms 加偏移；字体用 Windows 自带的微软雅黑）
  const st = ((s0 - t0) / 1000).toFixed(3);
  const vf = String.raw`scale=1280:720,drawtext=fontfile='C\:/Windows/Fonts/msyh.ttc':text='点下按钮后 %{pts\:hms\:` + st + String.raw`}':x=18:y=14:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.45:boxborderw=8`;
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', join(seqDir, 's%05d.jpg'), ...ain, '-map', '0:v', '-map', '1:a', '-vf', vf, '-af', 'aresample=48000,apad',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '160k', '-ac', '2', '-t', vlen.toFixed(3), out], { encoding: 'utf8' });
  console.log(r.status === 0 ? `  视频 → ${out}（${vlen.toFixed(1)} 秒）` : '  ffmpeg 失败：' + r.stderr.slice(0, 400));
}

function fmt(ms) { return ms == null ? '—' : (ms / 1000).toFixed(2) + 's'; }
async function motion(fr) {
  // 每一帧缩成 320×180，和「约 200 毫秒以前」的那一帧比：超过 12 个像素的灰度差 > 8 就算「这段时间画面在动」。
  // （不和紧挨着的上一帧比：录屏一秒上百帧时，慢慢起伏的人物、慢慢飘的云相邻两帧几乎一样，会被误判成不动）
  const W2 = 320, H2 = 180, c = createCanvas(W2, H2), x = c.getContext('2d'); const out = [], hist = [];
  for (const f of fr) {
    try { const img = await loadImage(readFileSync(f.f)); x.drawImage(img, 0, 0, W2, H2); } catch { out.push({ t: f.t, moved: false }); continue; }
    const d = x.getImageData(0, 0, W2, H2).data, g = new Uint8Array(W2 * H2);
    for (let i = 0; i < g.length; i++) g[i] = (d[i * 4] * 3 + d[i * 4 + 1] * 6 + d[i * 4 + 2]) / 10;
    while (hist.length > 1 && hist[1].t <= f.t - 200) hist.shift();
    const ref = hist.length && hist[0].t <= f.t - 200 ? hist[0] : null;
    let n = 0; if (ref) for (let i = 0; i < g.length; i++) if (Math.abs(g[i] - ref.g[i]) > 8) n++;
    out.push({ t: f.t, moved: !ref || n > 12, n }); hist.push({ t: f.t, g });
  }
  return out;
}

let res = null, err = null;
try { res = await main(); } catch (e) { err = e; console.log('失败：' + e.message); }
try { const v = await (await fetch(`http://127.0.0.1:${dport}/json/version`)).json(); const bw = new WebSocket(v.webSocketDebuggerUrl); await new Promise((r) => { bw.onopen = r; bw.onerror = r; setTimeout(r, 3000); }); bw.send(JSON.stringify({ id: 1, method: 'Browser.close' })); await sleep(1500); } catch { /* */ }
try { child.kill(); } catch { /* */ }
try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* */ }
for (let i = 0; i < 40 && !exited; i++) await sleep(250);
try { rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); } catch { /* */ }

if (res) {
  const { t0, L } = res; let { playable } = res;
  // 「能玩」不早于加载画面开始淡出 / 消失的那一刻（盖着的时候游戏帧再顺也操作不到）
  if (playable) { let seen = false; for (const [t, s] of L.ev) { if (t < t0 - 50) continue; if (/loading/.test(s) && !/loading-out/.test(s)) seen = true; else if (seen) { playable = Math.max(playable, t); break; } } }
  const mv = await motion(frames.filter((f) => f.t >= t0 - 200));
  const rel = (t) => t - t0;
  // 画面静止段：两帧之间超过 250 毫秒没有新帧，或一串帧都没变化超过 250 毫秒
  const still = []; let lastMove = mv.length ? mv[0].t : t0;
  for (const m of mv) { if (m.moved) { if (m.t - lastMove > 250) still.push([rel(lastMove), rel(m.t)]); lastMove = m.t; } }
  const end = playable ?? (mv.length ? mv.at(-1).t : t0);
  if (end - lastMove > 250) still.push([rel(lastMove), rel(end)]);
  const ev2 = L.ev.filter((e) => e[0] >= t0 - 50).map(([t, s]) => [Math.round(rel(t)), s]);
  const lts = L.lt.filter((e) => e[0] >= t0 - 50 && e[0] <= end).map(([t, d]) => [Math.round(rel(t)), Math.round(d)]);
  const gaps = []; for (let i = 1; i < L.raf.length; i++) { const a = L.raf[i - 1], b = L.raf[i]; if (b >= t0 && a <= end && b - a > 100) gaps.push([Math.round(rel(a)), Math.round(b - a)]); }
  const first = (re) => { const e = ev2.find((x) => re.test(x[1])); return e ? e[0] : null; };
  const sum = {
    path: PATH, size: `${W}x${H}`,
    loadingShown: first(/loading/), canvasShown: first(/canvas/), hudShown: first(/hud/), loadingGone: (() => { let seen = false; for (const e of ev2) { if (/loading/.test(e[1])) seen = true; else if (seen) return e[0]; } return null; })(),
    playable: playable ? Math.round(rel(playable)) : null,
    longTaskTotal: lts.reduce((a, x) => a + x[1], 0), longTaskMax: lts.reduce((a, x) => Math.max(a, x[1]), 0),
    stillTotal: Math.round(still.reduce((a, s) => a + (s[1] - s[0]), 0)), stillMax: Math.round(still.reduce((a, s) => Math.max(a, s[1] - s[0]), 0)),
    frames: mv.length,
  };
  console.log(`\n${PATH}（${W}×${H}）：能玩 ${fmt(sum.playable)}；加载画面 ${fmt(sum.loadingShown)} → ${fmt(sum.loadingGone)}；画布 ${fmt(sum.canvasShown)}；界面 ${fmt(sum.hudShown)}`);
  console.log(`  主线程长任务合计 ${fmt(sum.longTaskTotal)}，最长 ${sum.longTaskMax}ms；画面不动合计 ${fmt(sum.stillTotal)}，最长一段 ${sum.stillMax}ms（录屏帧 ${mv.length}）`);
  console.log('  阶段：' + ev2.map(([t, s]) => `${t}ms ${s}`).join(' | '));
  console.log('  ld 标记：' + L.marks.filter((m) => m[1] >= t0 - 50).map(([n, t]) => `${n}@${Math.round(rel(t))}`).join(' '));
  console.log('  画面不动：' + still.map(([a, b]) => `${Math.round(a)}–${Math.round(b)}`).join(', '));
  console.log('  长任务（≥200ms）：' + lts.filter((x) => x[1] >= 200).map(([t, d]) => `${t}+${d}`).join(', '));
  console.log('  rAF 断档（>100ms）：' + gaps.map(([t, d]) => `${t}+${d}`).join(', '));
  if (OUT) { mkdirSync(dirname(resolve(OUT)), { recursive: true }); writeFileSync(OUT, JSON.stringify({ sum, still, ev: ev2, lts, gaps, marks: L.marks.map(([n, t]) => [n, Math.round(rel(t))]), motion: mv.map((m) => [Math.round(rel(m.t)), m.moved ? 1 : 0, m.n ?? 0]), t0 }, null, 1)); console.log('  写入 ' + OUT); }
  if (VIDEO) { mkdirSync(dirname(resolve(VIDEO)), { recursive: true }); makeVideo(resolve(VIDEO), frames.filter((f) => f.t >= t0 - 1200), t0, res.audio); }
}
if (!FRAMES || VIDEO) try { rmSync(frameDir, { recursive: true, force: true }); } catch { /* */ }
process.exit(err ? 1 : 0);
