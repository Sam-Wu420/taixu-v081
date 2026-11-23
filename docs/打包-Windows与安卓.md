# 打包：Windows 桌面版、安卓版（带随包模组）

三步都在 `B-HD2D` 目录下跑。

## 1. 构建网页版，放进随包模组

```bat
npm install
npm run build
node tools/bundle-mods.mjs --mods=wanbao,shahe
```

- `bundle-mods` 把模组包从 `dist-mods/` 拷进 `dist/bundled-mods/`，并写一份 `index.json`。版本取 `dist-mods/b-set.json` 里登记的 B 版适配版。
- 打包版第一次启动时，游戏读这份名单，把模组装进本地模组库并启用（`src/mod/store.ts` 的 `seedBundled`）。
- 每个模组的每个版本只装一次。玩家之后自己停用、卸载、换版本，都不会被改回来。
- 网页版和开发服务器没有这个目录，不受影响。

## 2. Windows 桌面版（Electron：安装版 + 便携版）

```bat
cd desktop
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
npm install
npx electron-builder --win --x64
```

- **产物**：都在 `desktop/release/`，各约 158 MB。
  - `太虚问道录-v0.57-B版-Windows-x64-安装版.exe`：**推荐发给玩家**。装一次（十几秒），会建桌面和开始菜单快捷方式，以后双击不到一秒就出窗口。
  - `太虚问道录-v0.57-B版-Windows-x64.exe`：便携版，免安装。
    - 每次双击都要先把约 380 MB 的游戏文件解压到临时目录，所以要等 15–20 秒。
    - 改成不压缩也一样慢：瓶颈是写盘和杀毒扫描，不是解压。
    - 解压期间会立刻显示启动图 `desktop/build/splash.bmp`，玩家不会以为没反应。启动图用 `python tools/make-splash.py` 生成，素材取加载界面那几张图。
- **为缩短启动做的改动（2026-11-19）**：
  - `main.js` 里窗口立即显示，不再等 `ready-to-show`。
  - 只带简体中文和英文两种 Electron 语言包（`electronLanguages`），少了 44 MB。
  - 压缩从 `maximum` 改成 `normal`。
- **存档**：两种版本都在 `%APPDATA%\太虚问道录`，互通。
- **报「Cannot create symbolic link」**：说明 Windows 没开开发者模式，electron-builder 解不开签名工具包。
  - 办法一：把 `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\` 下那个 `.7z` 手动解压到同目录的 `winCodeSign-2.6.0\`，忽略两个 mac 文件的报错，再重跑。
  - 办法二：开开发者模式。

## 3. 安卓版（WebView 外壳，不用 Gradle）

```bat
node android/build-apk.mjs
```

- **需要**：
  - JDK 17：`javac`、`keytool` 在 PATH 里。
  - 安卓 SDK：build-tools 34 以上、platforms/android-34 以上；`ANDROID_HOME` 指过去，不设就用 `C:\Android`。
  - Python 3。
- **产物**：`android/build/太虚问道录-v0.57-B版-Android.apk`，约 55 MB，最低安卓 7.0，横屏。
- **外壳**（`android/src/.../MainActivity.java`）：
  - 全屏 WebView，游戏文件在 APK 的 `assets/game`。
  - 用 `https://appassets.androidplatform.net/` 这个本地地址提供文件，同源、游戏文件不走网络，存档和模组库正常。
  - 模组坊（逛模组坊、检查更新、发布）要上网：`AndroidManifest.xml` 申请了 `INTERNET` 权限。2026-11-19 之前的包没申请，手机上模组坊一直连不上。
  - 返回键等于游戏里的 Esc。
- **签名钥匙**：第一次打包时生成在 `android/keystore/taixu-b.jks`，不进库。
  - 以后的更新包要用同一把钥匙签，才能覆盖安装、保住存档。这把钥匙要备份。
  - 口令默认 `taixu-b-0.57`，可用环境变量 `TAIXU_KS_PASS` 改。
- **中文路径**：aapt2 认不了带中文的路径，所以脚本在系统临时目录的 `taixu-b-apk\` 里编译，最后把 apk 拷回来。

## 4. Mac 版（v0.8.1 起；在 Windows 上拼，不签名）

```bat
npm run build
node tools/bundle-mods.mjs --mods=wanbao,shahe
python desktop/build-mac.py          :: 两个都打；只打一个：python desktop/build-mac.py arm64（或 x64）
```

- 产物：`desktop/release/太虚问道录-v0.8.1-macOS-arm64.zip`（Apple 芯片）、`…-macOS-x64.zip`（Intel），各约 175–180 MB。
- 做法：从 npmmirror 下 Electron 38.8.6 的 Mac 包（缓存在 `%LOCALAPPDATA%\electron\Cache`），逐项从原 zip 抄进新 zip——**不在 Windows 上解压**（框架里的符号链接解压就坏）；改 Info.plist（名字、包标识 com.qwasx.taixu、版本、图标）、去掉 default_app.asar，把 `desktop` 的 main.js / preload.js 放进 `Contents/Resources/app`、`dist` 放进 `Contents/Resources/game`。
- 没签名、没公证：玩家第一次右键「打开」；提示已损坏就在终端跑 `xattr -cr /Applications/太虚问道录.app`（zip 里的「Mac 版说明.txt」写了）。
- 存档在 `~/Library/Application Support/太虚问道录`。
- v0.8.1 起：安卓包名 `com.taixu.xiuxian.hz`、钥匙 `android/keystore/taixu-b.jks`（口令默认 `taixu-b-0.8`）。
