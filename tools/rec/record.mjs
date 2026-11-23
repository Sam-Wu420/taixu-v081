// 录撼山客招式展示视频：每一招开一个无头 Edge 页面，等就绪 → 打上招名字幕 → 用 CDP 的录屏（Page.startScreencast）逐帧抓 → 触发这一招 → 录够时长；
// 每招一段帧序列，按帧的时间戳用 ffmpeg 拼成 30 帧的 mp4，最后把各段接成一个视频。
// 用法：node tools/rec/record.mjs [--port=5202] [--jobs=2] [--only=段名片段,…] [--out=tools/out/rec] [--join-only]
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const PORT = arg('port', '5202'), JOBS = Number(arg('jobs', '2')), ONLY = arg('only', '').split(',').filter(Boolean), OUT = resolve(arg('out', 'tools/out/rec'));
const JOIN_ONLY = process.argv.includes('--join-only');
mkdirSync(OUT, { recursive: true });
// r9：无头 Edge 在这台机器上跑一分钟上下 requestAnimationFrame 就整个停住（空白页、关 GPU、发鼠标输入、关 EcoQoS / 遮挡计算 / vsync、重载页面都一样；
// 同样的参数换 Chrome 跑两分钟一直六十帧以上）——装了 Chrome 就用 Chrome，HEADLESS_BROWSER 环境变量可以指定
const EDGE = [process.env.HEADLESS_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const U = (q) => `http://127.0.0.1:${PORT}/tools/perf-acceptance.html?auto=new&map=tiannan&${q}`;

// 就绪条件、触发脚本
const R1 = '!!(window.__hsReady && window.__hsDummy && window.__hs && window.__hs.ent && window.__game && window.__game.combat.brawl.stageOn)';   // 第一批自己循环出招：等他起手、镜头推上来再开录
const R2 = '!!window.__hs2Ready';
const R3 = '!!window.__hs3Ready';
const T2 = 'window.__hs2.go()';
const T3 = 'window.__hs3.again()';

/** [段名, 字幕, 一句说明, 网址参数, 就绪, 触发, 录几秒] */
const SEG = [
  ['00-near', '撼山客 · 岳千钧', '游荡南荒的体修大能', 'try=hanshan&at=near&met=1', '!!(window.__hs && window.__hs.ent)', 'window.__hs.drinkT = 2.1', 4],
  ['01-suodi', '缩地成寸', '人没了，只剩一道线', 'try=hanshan&move=suodi', R1, '', 4],
  ['02-takong', '踏空步', '空中每一步炸开气环', 'try=hanshan&move=takong', R1, '', 4],
  ['03-yicunbeng', '一寸崩', '停半拍，力从背后炸出去', 'try=hanshan&move=yicunbeng', R1, '', 4],
  ['04-quanya', '拳压·开山', '拳未到，风先到', 'try=hanshan&move=quanya', R1, '', 4],
  ['05-zhenjiao', '震脚', '一脚跺下，周围全震上天', 'try=hanshan&move=zhenjiao', R1, '', 4],
  ['06-qihe', '气合', '一声大喝，法术尽碎', 'try=hanshan&move=qihe', R1, '', 4],
  ['07-kongshou', '空手接宝', '两指夹住飞剑，丢回去', 'try=hanshan&move=kongshou', R1, '', 5],
  ['08-jingang', '金刚不坏', '站着硬吃，再反震', 'try=hanshan&move=jingang', R1, '', 4],
  ['09-houfa', '后发先至', '你的重击还没出，他的肘先到', 'try=hanshan&move=houfa', R1, '', 4],
  ['10-liuxing', '流星百裂', '一秒二十拳', 'try=hanshan&move=liuxing', R2, T2, 2.6],
  ['11-yanhui', '燕回', '五角星穿身，来回连打', 'try=hanshan&move=yanhui', R2, T2, 2.4],
  ['12-shifang', '十方弹', '打飞、瞬移、再打回来', 'try=hanshan&move=shifang', R2, T2, 3],
  ['13-tiandi', '天地往返', '踢上天，砸下来，三个来回', 'try=hanshan&move=tiandi', R2, T2, 3.2],
  ['14-dianxue', '点穴延爆', '点完转身就走——三息', 'try=hanshan&move=dianxue', R2, T2, 4.4],
  ['15-lidi', '犁地', '按头进地，冲刺磨出一道沟', 'try=hanshan&move=lidi', R2, T2, 3],
  ['16-lidi-me', '犁地（被按着的是你）', '连按方向键挣脱', 'try=hanshan&move=lidi&on=me', R2, T2, 3],
  ['17-lunren', '抡人为棍', '抓脚当兵器抡', 'try=hanshan&move=lunren', R2, T2, 2.6],
  ['18-yunxing', '陨星坠', '抱上高空，倒栽砸下', 'try=hanshan&move=yunxing', R2, T2, 2.6],
  ['19-zhishan', '掷山', '拔起巨石砸过来', 'try=hanshan&move=zhishan', R2, T2, 2.8],
  ['20-jiexing', '借星', '虚空里蹬碎陨石折返', 'try=hanshan&move=jiexing&on=me&noauto=1', R3, T3, 6],
  ['21-pojie', '一拳破界 · 一脚还界', '一拳打进虚空，一脚踢回人间', 'try=hanshan&move=pojie&on=me&noauto=1', R3, T3, 10],
  ['22-wuji', '无极一击', '踏地一冲，一拳犁开山河', 'try=hanshan&move=wuji&noauto=1', R3, T3, 6],
  ['23-qianjunzhui', '千钧坠', '高空一脚，大地塌陷', 'try=hanshan&move=qianjunzhui&noauto=1', R3, T3, 6],
  ['24-wuji-sea', '无极一击 · 海上', '一拳劈开海面', 'try=hanshan&move=wuji&sea=1&noauto=1', R3, T3, 6],
  // r8-p2 第二阶段（字幕用暂名）
  ['25-p2jie', '赤阳罡 · 解放', '逼出他的真本事——从此燃身', 'try=hanshan&move=p2jie&noauto=1', R3, T3, 6],
  ['26-p2xuan', '赤焰回旋腿', '横扫火弧，旋身火环，一脚火柱冲天', 'try=hanshan&move=p2xuan&noauto=1', R3, T3, 5.2],
  ['27-p2yan', '燕旋', '飓风环卷进去，炸上天', 'try=hanshan&move=p2yan&noauto=1', R3, T3, 3],
  ['28-p2sui', '碎心踢', '风刃甩出，火轮撞心', 'try=hanshan&move=p2sui&noauto=1', R3, T3, 3],
  ['29-p2zhui', '坠火踢', '一字马劈落，火柱贯地', 'try=hanshan&move=p2zhui&noauto=1', R3, T3, 3],
  ['30-p2pao', '炎阳炮拳', '举拳蓄火，一冲一拳', 'try=hanshan&move=p2pao&noauto=1', R3, T3, 2.8],
  ['31-p2bahuang', '霸皇蹴（觉醒）', '火柱踏天，爆碎', 'try=hanshan&move=p2bahuang&noauto=1', R3, T3, 6.2],
  ['32-p2zhuri', '逐日（觉醒）', '一拳一色，拳里炸出一轮赤日', 'try=hanshan&move=p2zhuri&noauto=1', R3, T3, 10.2],
  // r8-p1：撼山客第一阶段照参考视频还原的十一招（tools/try-hsp1.ts）
  ['p1-01-yicunbeng', '一寸崩', '停半拍，一帧切出直拳', 'try=hsp1&move=yicunbeng&loop=0&real=1', '!!window.__p1Ready', 'window.__p1.go()', 4.0],
  ['p1-02-jingang', '金刚不坏', '霸体：头顶一团白光、全身金边', 'try=hsp1&move=jingang&loop=0&real=1', '!!window.__p1Ready', 'window.__p1.go()', 5.0],
  ['p1-03-houfa', '后发先至', '提膝蓄，弓步一肘', 'try=hsp1&move=houfa&loop=0&real=1', '!!window.__p1Ready', 'window.__p1.go()', 3.6],
  ['p1-04-suodi', '缩地成寸', '闪步：人直接到了', 'try=hsp1&move=suodi&loop=0&real=1', '!!window.__p1Ready', 'window.__p1.go()', 3.6],
  ['p1-05-liuxing', '流星百裂', '闪击快打：三拳一勾一高踢', 'try=hsp1&move=liuxing&loop=0&real=1', '!!window.__p1Ready', 'window.__p1.go()', 3.8],
  ['p1-06-yanhui', '燕回', '闪电之舞：闪步穿身、扫腿侧踢', 'try=hsp1&move=yanhui&loop=0&real=1', '!!window.__p1Ready', 'window.__p1.go()', 4.4],
  ['p1-07-shifang', '十方弹', '闪步追打，天上地下', 'try=hsp1&move=shifang&loop=0&real=1', '!!window.__p1Ready', 'window.__p1.go()', 5.0],
  ['p1-08-duanmai', '断脉腿', '伏身蓄劲，后仰一脚', 'try=hsp1&move=duanmai&loop=0&real=1', '!!window.__p1Ready', 'window.__p1.go()', 4.0],
  ['p1-09-zhuangshan', '撞山靠', '沉马、一靠撞飞', 'try=hsp1&move=zhuangshan&loop=0&real=1', '!!window.__p1Ready', 'window.__p1.go()', 3.8],
  ['p1-10-dingxin', '顶心膝', '一膝顶心，再一顶', 'try=hsp1&move=dingxin&loop=0&real=1', '!!window.__p1Ready', 'window.__p1.go()', 3.8],
  ['p1-11-yingzong', '影踪连环踢', '化作蓝影连踢，最后一脚是真身', 'try=hsp1&move=yingzong&loop=0&real=1', '!!window.__p1Ready', 'window.__p1.go()', 4.4],
];

/** 页面里打字幕：藏掉消息条和验收面板，左下角写招名 */
function caption(title, sub) {
  const css = '.toasts{display:none!important}#perf-panel{display:none!important}.hud>.hz-lc{opacity:0!important}'   // 展示片里收起左侧任务列（引导、宗门差事那一栏）
    + '.cap-hs{position:fixed;left:48px;bottom:118px;z-index:9999;font-family:"Ma Shan Zheng","STKaiti","KaiTi",serif;color:#f6ead0;'
    + 'text-shadow:0 2px 10px rgba(0,0,0,.85),0 0 2px #000;pointer-events:none}'
    + '.cap-hs b{display:block;font-size:56px;letter-spacing:.12em;font-weight:normal}.cap-hs i{display:block;font-style:normal;font-size:24px;opacity:.9;margin-top:2px}'
    // 录屏只在画面有变化时才出帧：定格特写、慢放那几下画面几乎不动，录屏就停了。角落里放一个一直在转的小点，逼它一直出帧（看不出来）
    + '.rec-tick{position:fixed;right:1px;bottom:1px;width:2px;height:2px;background:rgba(0,0,0,.02);z-index:9999;animation:recTick .1s linear infinite}@keyframes recTick{to{transform:rotate(360deg)}}';
  return `(() => { const st = document.createElement('style'); st.textContent = ${JSON.stringify(css)}; document.head.appendChild(st);
    const d = document.createElement('div'); d.className = 'cap-hs'; d.innerHTML = ${JSON.stringify(`<b>${title}</b><i>${sub}</i>`)}; document.body.appendChild(d);
    const k = document.createElement('div'); k.className = 'rec-tick'; document.body.appendChild(k); return 1; })()`;
}

async function record([name, title, sub, q, ready, trigger, secs]) {
  const profile = mkdtempSync(join(tmpdir(), 'edge-shot-')), port = 9300 + Math.floor(Math.random() * 500);
  const child = spawn(EDGE, ['--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${port}`,
    '--window-size=1600,900', '--hide-scrollbars', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore', env: { ...process.env, TEMP: profile, TMP: profile } })   // 主线 8f28288：浏览器的临时目录放进各自的配置目录（被强关时 scoped_dir* 随配置目录一起删）;
  let exited = false; child.on('exit', () => { exited = true; });
  const dir = join(OUT, 'frames', name); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const frames = [];
  let audioFile = null, audioT0 = 0;
  try {
    let target = null;
    for (let i = 0; i < 80 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* 还没起来 */ } }
    if (!target) throw new Error('浏览器没起来');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('连不上调试端口')); });
    let seq = 0, rec = false; const pending = new Map();
    const send = (method, params = {}, timeout = 60000) => new Promise((res, rej) => {
      const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(method + ' 超时')); } }, timeout);
    });
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
      if (m.method === 'Page.screencastFrame') {
        const { data, metadata, sessionId } = m.params;
        if (rec) { const f = join(dir, `f${String(frames.length).padStart(5, '0')}.jpg`); writeFileSync(f, Buffer.from(data, 'base64')); frames.push({ f, t: metadata.timestamp }); }
        ws.send(JSON.stringify({ id: ++seq, method: 'Page.screencastFrameAck', params: { sessionId } }));
      }
    };
    const ev = async (expr, timeout = 45000) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, timeout); return r.result?.value; };
    await send('Page.enable'); await send('Runtime.enable');
  // r9：无头页一直当成「在前台、有焦点」——跑久了 rAF 停住的一个来由是页面被当成后台 / 被遮挡（屏幕关了、锁屏时 Windows 报窗口被遮挡），rAF 整个暂停
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {}); await send('Page.bringToFront').catch(() => {});
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: U(q) });
    await sleep(15000);
    // r9：等就绪时盯着游戏的钟——钟不走了（rAF 停住）就把页面重新拉到前台、还不走就重载一次，并把原因打出来（原来 22-wuji 连试四次都「没就绪」）
    let t0 = Date.now(), ok = false, lastT = -1, lastAt = Date.now(), nudged = false, reloaded = false;
    while (Date.now() - t0 < 150000) {
      try { if (await ev(ready, 10000)) { ok = true; break; } } catch { /* 页面还在载入 */ }
      let gt = -1; try { gt = await ev('window.__game ? window.__game.time : -1', 5000); } catch { /* */ }
      if (gt !== lastT) { lastT = gt; lastAt = Date.now(); }
      else if (gt > 0 && Date.now() - lastAt > 8000 && !nudged) { nudged = true; let vis = '?'; try { vis = await ev('document.visibilityState', 3000); } catch { /* */ } console.log(`  ${name}：游戏的钟停在 ${gt.toFixed(1)}（页面 ${vis}），拉回前台`); await send('Page.bringToFront').catch(() => {}); await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {}); }
      else if (gt > 0 && Date.now() - lastAt > 20000 && !reloaded) { reloaded = true; nudged = false; console.log(`  ${name}：钟还是不走，重载`); await send('Page.reload').catch(() => {}); await sleep(15000); t0 = Date.now(); lastAt = Date.now(); }
      await sleep(800);
    }
    if (!ok) { let why = ''; try { why = JSON.stringify(await ev('({ t: window.__game ? window.__game.time : null, vis: document.visibilityState, hs: !!window.__hs, ent: !!(window.__hs && window.__hs.ent), hs3: !!window.__hs3Ready })', 5000)); } catch (e) { why = '页面没有回应：' + e.message; } throw new Error('没就绪 ' + why); }
    await sleep(3500);
    await ev(caption(title, sub));
    // 声音：游戏的声音是 WebAudio 现合成的，录屏抓不到——在页面里从声音引擎的总输出接一路 MediaRecorder，录完取回来和画面合
    const aOk = await ev(`(() => { try { const A = window.__taixuAudio; const st = A && A.recordStream(); if (!st) return 'no-audio';
      const mt = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const r = new MediaRecorder(st, { mimeType: mt, audioBitsPerSecond: 160000 }); window.__recChunks = []; r.ondataavailable = (e) => { if (e.data.size) window.__recChunks.push(e.data); };
      r.start(250); window.__recA = r; window.__recA0 = Date.now(); return 'ok'; } catch (e) { return 'ERR ' + e.message; } })()`);
    if (aOk !== 'ok') console.log(`  ${name} 录音：${aOk}`);
    await send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
    rec = true; await sleep(500);
    if (trigger) { const tr = await ev(`(() => { try { return String(${trigger}); } catch (e) { return 'ERR ' + e.message; } })()`); if (String(tr).startsWith('ERR') || tr === 'false') console.log(`  ${name} 触发：${tr}`); }
    // 录屏有时在定格特写之后就不再出帧（页面本身没卡）：断了 150 毫秒以上就改用截图补帧
    const end = Date.now() + secs * 1000; let shots = 0;
    while (Date.now() < end) {
      const lastT = frames.length ? frames.at(-1).t * 1000 : 0;
      if (Date.now() - lastT > 150) {
        try {
          const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 }, 5000);
          const f = join(dir, `f${String(frames.length).padStart(5, '0')}.jpg`); writeFileSync(f, Buffer.from(r.data, 'base64')); frames.push({ f, t: Date.now() / 1000 }); shots++;
        } catch { await sleep(50); }
      } else await sleep(30);
    }
    if (shots) console.log(`  ${name}：录屏断了，截图补了 ${shots} 帧`);
    rec = false; await send('Page.stopScreencast');
    if (aOk === 'ok') {
      const got = await ev(`new Promise((res) => { const r = window.__recA; r.onstop = async () => { const b = new Blob(window.__recChunks, { type: r.mimeType }); const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); res({ t0: window.__recA0, b64: btoa(s) }); }; r.stop(); })`, 60000);
      if (got?.b64) { audioFile = join(dir, 'audio.webm'); writeFileSync(audioFile, Buffer.from(got.b64, 'base64')); audioT0 = got.t0 / 1000; }
    }
    ws.close();
  } catch (e) { console.log(`✗ ${name}：${e.message}`); }
  // r9：先让浏览器自己关（CDP Browser.close），再 kill、按进程树强杀兜底（child.kill 有时只结束了启动器，浏览器本体还占着两三百兆）
  try { const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); const bw = new WebSocket(v.webSocketDebuggerUrl); await new Promise((r) => { bw.onopen = r; bw.onerror = r; setTimeout(r, 3000); }); bw.send(JSON.stringify({ id: 1, method: 'Browser.close' })); await sleep(1500); } catch { /* */ }
  try { child.kill(); } catch { /* */ }
  try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* */ }
  for (let i = 0; i < 40 && !exited; i++) await sleep(250);
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); } catch { /* */ }
  if (frames.length < 10) { console.log(`✗ ${name}：只录到 ${frames.length} 帧`); return null; }
  // 按真实时间均匀取帧：每 1/30 秒取那一刻最近的一帧，排成连号的序列（录屏的帧率不均、有时上百帧每秒，直接按时间戳拼 ffmpeg 会把时长拉长）
  const seqDir = join(dir, 'seq'); mkdirSync(seqDir, { recursive: true });
  const t0 = frames[0].t, n = Math.max(1, Math.round((frames.at(-1).t - t0) * 30));
  for (let k = 0, j = 0; k <= n; k++) {
    const tk = t0 + k / 30; while (j + 1 < frames.length && frames[j + 1].t <= tk) j++;
    copyFileSync(frames[j].f, join(seqDir, `s${String(k).padStart(5, '0')}.jpg`));
  }
  const seg = join(OUT, `${name}.mp4`);
  // 声音对齐：录音比第一帧早开始 off 秒（off 为负就是晚），从录音里截掉这一段；没录到声音就配一段静音（各段都有声轨，接起来才不乱）
  const vlen = (n + 1) / 30, off = audioFile ? t0 - audioT0 : 0;
  const ain = audioFile ? (off >= 0 ? ['-ss', off.toFixed(3), '-i', audioFile] : ['-itsoffset', (-off).toFixed(3), '-i', audioFile]) : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'];
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', join(seqDir, 's%05d.jpg'), ...ain, '-map', '0:v', '-map', '1:a',
    '-vf', 'scale=1280:720', '-af', 'aresample=48000,apad', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '160k', '-ac', '2', '-t', vlen.toFixed(3), seg], { encoding: 'utf8' });
  if (r.status !== 0) { console.log(`✗ ${name}：ffmpeg ${r.stderr.slice(0, 200)}`); return null; }
  const dur = frames.at(-1).t - frames[0].t;
  console.log(`✓ ${name}  ${frames.length} 帧 / ${dur.toFixed(1)} 秒（平均 ${(frames.length / dur).toFixed(0)} 帧/秒）`);
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ }   // 逐帧图用完就删（一段几十 MB，整片两 GB）
  return seg;
}

if (!JOIN_ONLY) {
  const jobs = SEG.filter((s) => !ONLY.length || ONLY.some((o) => s[0].includes(o)));
  let next = 0;
  const worker = async () => { for (;;) { const j = jobs[next++]; if (!j) return; await record(j); } };
  await Promise.all(Array.from({ length: JOBS }, worker));
}
// 接成一个视频：照 FINAL 的顺序（第一阶段用 p1-* 侧面近景那几段，替掉旧的同名招；只接录成了的）
const FINAL = ['00-near', 'p1-04-suodi', 'p1-01-yicunbeng', 'p1-02-jingang', 'p1-03-houfa', 'p1-05-liuxing', 'p1-06-yanhui', 'p1-07-shifang',
  'p1-08-duanmai', 'p1-09-zhuangshan', 'p1-10-dingxin', 'p1-11-yingzong', '02-takong', '04-quanya', '05-zhenjiao', '06-qihe', '07-kongshou',
  '13-tiandi', '14-dianxue', '15-lidi', '16-lidi-me', '17-lunren', '18-yunxing', '19-zhishan', '20-jiexing', '21-pojie', '22-wuji', '24-wuji-sea', '23-qianjunzhui',
  '25-p2jie', '26-p2xuan', '27-p2yan', '28-p2sui', '29-p2zhui', '30-p2pao', '31-p2bahuang', '32-p2zhuri'];
const have = new Set(readdirSync(OUT));
const segs = FINAL.map((n) => `${n}.mp4`).filter((f) => have.has(f));
writeFileSync(join(OUT, 'all.txt'), segs.map((f) => `file '${join(OUT, f).replace(/\\/g, '/')}'`).join('\n') + '\n');
const final = join(OUT, '撼山客-招式展示.mp4');
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(OUT, 'all.txt'), '-c', 'copy', final], { encoding: 'utf8' });
console.log(r.status === 0 ? `合成：${final}（${segs.length} 段）` : 'ffmpeg 合成失败 ' + r.stderr.slice(0, 300));
