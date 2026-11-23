// 太虚问道录 · Windows 桌面版主进程
// 把打包好的网页（resources/game/index.html）装进一个无边框窗口里跑，
// 关掉网络也没关系：所有资源都在本地，存档走 localStorage（在 userData 目录里持久保存）。
const { app, BrowserWindow, screen, Menu, globalShortcut, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

// 关键：不能用 file:// 直接打开。
// 游戏会把画好的 canvas 读回来做地表缓存、缩略图和贴图合并，file:// 下的图片被判定为
// "跨源"，画布一旦被污染，getImageData / texImage2D 全部抛 SecurityError，场景直接黑屏。
// 所以注册一个自定义协议 app://，把所有请求都映射到本地游戏目录——同源、不受跨域限制，且不联网。
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// 游戏是"一屏装下"的排版，禁掉浏览器缩放/右键菜单，免得玩家误触
app.commandLine.appendSwitch('disable-pinch');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// —— 显卡相关（这是「画面很简单却卡」的最大嫌疑）——
// 1) ignore-gpu-blocklist：不少 Windows 驱动（尤其是老驱动、厂商定制驱动、虚拟机/远程桌面）
//    会被 Chromium 列进黑名单，于是整个游戏退回 CPU 软件光栅化——显卡再好也一点没用上，
//    分辨率越高反而越卡。这一行直接把黑名单忽略掉。
app.commandLine.appendSwitch('ignore-gpu-blocklist');
// 2) 双显卡笔记本默认可能跑核显：强制高性能 GPU（独显）
app.commandLine.appendSwitch('force_high_performance_gpu');
// 3) 光栅化与零拷贝上传：世界层每帧要从 Canvas 拷进 GL 纹理，走 GPU 光栅 + 零拷贝能省掉一次全屏内存搬运
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
// 4) 不要因为一次 GPU 进程崩溃就永久退回软件渲染
app.commandLine.appendSwitch('disable-gpu-process-crash-limit');

let win = null;

function gameDir() {
  // 开发模式（electron .）直接用源码目录里的 dist；打包后从 resources/game 读
  const packed = path.join(process.resourcesPath, 'game');
  if (fs.existsSync(path.join(packed, 'index.html'))) return packed;
  return path.join(__dirname, '..', 'dist');
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  // 以 1440×900 为设计基准，按屏幕大小等比缩放（小屏笔记本也不会被裁）
  const w = Math.min(1920, Math.max(1024, Math.round(width * 0.92)));
  const h = Math.min(1200, Math.max(640, Math.round(height * 0.92)));

  win = new BrowserWindow({
    width: w, height: h,
    minWidth: 960, minHeight: 600,
    backgroundColor: '#161a17',
    title: '太虚问道录 v0.8.1',
    autoHideMenuBar: true,
    // 窗口立刻显示（先是深色底，游戏自己的加载画面随后出来），不再等页面准备好才露面——
    // 原来 show:false + ready-to-show 会让玩家多对着空白桌面等两三秒，以为没反应
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      webgl: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Mac：保留系统菜单（没有菜单栏时 ⌘Q 退出、⌘C/⌘V 复制粘贴、⌘M 最小化、⌘H 隐藏都不起作用）；Windows 照旧不要菜单栏
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null);
  // 走自定义协议而不是 file://，避免画布被跨源污染
  win.loadURL('app://game/index.html');

  win.focus();

  // F11 全屏切换、F12 开发者工具（方便你在本地调试）
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.key === 'F12') { win.webContents.toggleDevTools(); e.preventDefault(); }
  });

  // 存档目录提示（首次运行时打印，方便你备份）
  if (process.argv.includes('--debug')) {
    console.log('存档目录:', app.getPath('userData'));
    console.log('游戏目录:', gameDir());
  }
}

// 单实例：重复双击不再开第二个窗口
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  // GPU 进程崩了会在日志里留痕：真机排查「为什么这么卡」时先看这里
  app.on('child-process-gone', (_e, d) => {
    if (d.type === 'GPU') console.error('[GPU] 进程退出：', d.reason, d.exitCode);
  });
  app.on('gpu-info-update', () => {
    try { console.log('[GPU]', JSON.stringify(app.getGPUFeatureStatus())); } catch (e) { /* */ }
  });

  app.whenReady().then(() => {
    // app://game/xxx → <游戏目录>/xxx
    // 自己读文件返回，不依赖 net.fetch 对 file:// 的支持（不同 Electron 版本行为不一致）
    const root = path.resolve(gameDir());
    const MIME = {
      '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
      '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
      '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
      '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
    };
    protocol.handle('app', async (req) => {
      let p = decodeURIComponent(new URL(req.url).pathname);
      if (p === '/' || p === '') p = '/index.html';
      const file = path.join(root, path.normalize(p).replace(/^([/\\])+/, ''));
      // 目录穿越防护（按分隔符比较，避免 /game-x 被 /game 前缀误放行）
      if (file !== root && !file.startsWith(root + path.sep)) return new Response('forbidden', { status: 403 });
      try {
        const buf = await fs.promises.readFile(file);
        const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
        return new Response(buf, { status: 200, headers: { 'content-type': type } });
      } catch (e) {
        return new Response('not found: ' + p, { status: 404 });
      }
    });
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { app.quit(); });
  app.on('will-quit', () => globalShortcut.unregisterAll());
}
