# 凡人修仙传 v0.51 · Windows 桌面版打包说明

这个目录把仓库里的网页版包成一个**单文件 .exe**，双击就跑，不联网、不需要装浏览器、不需要 Node。

> 只能在 **Windows** 上打包运行（Electron 的 Windows 构建链在 Linux 上跑不出原生 exe）。

## 一、打包（三步）

```bat
:: 1) 先构建网页版（在仓库根目录）
pnpm install
pnpm build

:: 2) 进桌面目录装依赖
cd desktop
pnpm install

:: 3) 打 exe
pnpm dist
```

完成后产物在 `desktop/release/凡人修仙传-v0.51-Windows-x64.exe`，**一个文件，约 180~220MB**，拷到任何 Win10/Win11 机器双击即玩。

想要安装包（开始菜单快捷方式 + 卸载）就把最后一步换成：

```bat
pnpm dist:nsis
```

## 二、国内镜像加速

Electron 的二进制包默认从 GitHub 下载，国内常常卡住。打包前先设环境变量：

```bat
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
```

npm 源也换国内：

```bat
npm config set registry https://registry.npmmirror.com
```

## 三、它做了什么

- 主进程 `main.js`：开一个 1440×900 基准的自适应窗口，禁右键菜单、禁缩放，`F11` 全屏、`F12` 调试。
- `preload.js`：只暴露一个只读的 `window.__desktop`（平台/版本号），**不给游戏任何 Node 权限**。
- 游戏资源从 `resources/game/` 读（打包时自动把仓库的 `dist/` 整个塞进去），所以离线可玩。
- 存档在 `%APPDATA%\凡人修仙传\` 下，删掉这个目录＝清档。

## 四、常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 打包时报下载 electron 超时 | 没设镜像 | 设 `ELECTRON_MIRROR`（见上） |
| 双击 exe 白屏 | 没先跑 `pnpm build`，`dist/` 是空的 | 回到根目录构建 |
| 窗口太小/太大 | 按屏幕比例的，小屏笔记本偏小 | 改 `main.js` 里的 `Math.max(1024, …)` |
| 想改窗口标题/图标 | — | 图标换 `desktop/build/icon.ico`，标题改 `main.js` 的 `title` |

## 五、为什么不用 file:// 打开（踩过的坑）

第一个版本用 `win.loadFile()` 直接开 `index.html`，结果**场景全黑、UI 正常**，控制台刷：

```
SecurityError: Failed to execute 'texImage2D' ... Tainted canvases may not be loaded.
SecurityError: Failed to execute 'getImageData' ... The canvas has been tainted by cross-origin data.
```

原因：`file://` 下每张图都算"跨源"，画布一旦贴上去就被**污染**。这游戏要把 canvas 读回来做地表缓存、缩略图、贴图合并（`getImageData` / `texImage2D`），一读就抛异常，世界层直接画不出来。

解法：注册自定义协议 `app://`，在 `protocol.handle('app', …)` 里把请求映射到本地游戏目录，自己读文件、自己给 `content-type`。同源、不联网、不受跨域限制。

```js
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);
// …whenReady 之后
win.loadURL('app://game/index.html');
```

> 注意：不要用 `net.fetch(pathToFileURL(...))` 代替自己读文件——不同 Electron 版本对 `file://` 的支持不一致，实测容易 404。
