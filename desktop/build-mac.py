#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
太虚问道录 · macOS 打包脚本（在 Windows 上运行，无需 Mac）

做法：直接把官方 Electron darwin 包（zip）逐条流式复制进新的 zip，
绝不在 Windows 上解压（Electron Framework.framework 里的符号链接会被破坏）。
同时改名 Electron.app -> 太虚问道录.app、改 Info.plist、换图标、塞入 app/ 与 game/。

用法：python desktop/build-mac.py            # 同时打 arm64 和 x64
      python desktop/build-mac.py arm64      # 只打一个
产物：desktop/release/太虚问道录-v0.8.1-macOS-<arch>.zip（未签名）
"""
import io
import json
import os
import plistlib
import shutil
import stat
import sys
import time
import urllib.request
import zipfile

ELECTRON_VERSION = "38.8.6"
MIRROR = "https://npmmirror.com/mirrors/electron/%s/" % ELECTRON_VERSION
APP_NAME = "太虚问道录"
APP_ID = "com.qwasx.taixu"
VERSION = "0.8.1"
ICNS_NAME = "icon.icns"
ARCHES = ("arm64", "x64")

HERE = os.path.dirname(os.path.abspath(__file__))          # desktop/
ROOT = os.path.dirname(HERE)                                 # 项目根
DIST = os.path.join(ROOT, "dist")
RELEASE = os.path.join(HERE, "release")
SRC_APP = "Electron.app/"
DST_APP = APP_NAME + ".app/"

S_IFLNK = 0o120000
S_IFREG = 0o100000
S_IFDIR = 0o040000

README_TXT = """太虚问道录 v{ver} · Mac 版说明（{arch_cn}）

本包适用于：{arch_desc}
（arm64 = Apple 芯片 M1–M4；x64 = Intel 芯片的 Mac）

1. 解压后把「太虚问道录.app」拖进「应用程序（Applications）」文件夹。
2. 本程序未经苹果签名/公证，第一次打开请：在 App 上点右键 → 打开 → 再点「打开」。
3. 如果提示「已损坏」或「无法打开」，打开「终端」执行：
     xattr -cr /Applications/太虚问道录.app
   仍然打不开的话，再执行：
     codesign --force --deep --sign - /Applications/太虚问道录.app
4. 存档位置：~/Library/Application Support/太虚问道录
   （换电脑或重装前可以把这个文件夹备份一下）
"""


def log(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------- 下载 Electron
def cache_dir():
    base = os.environ.get("LOCALAPPDATA")
    d = os.path.join(base, "electron", "Cache") if base else os.path.join(HERE, ".electron-cache")
    os.makedirs(d, exist_ok=True)
    return d


def zip_ok(path):
    try:
        with zipfile.ZipFile(path) as z:
            names = z.namelist()
            return any(n == SRC_APP + "Contents/Info.plist" for n in names)
    except (zipfile.BadZipFile, OSError):
        return False


def get_electron(arch):
    name = "electron-v%s-darwin-%s.zip" % (ELECTRON_VERSION, arch)
    path = os.path.join(cache_dir(), name)
    if os.path.isfile(path) and zip_ok(path):
        log("[缓存] " + path)
        return path
    url = MIRROR + name
    tmp = path + ".part"
    log("[下载] " + url)
    req = urllib.request.Request(url, headers={"User-Agent": "electron-mac-packager"})
    with urllib.request.urlopen(req, timeout=60) as r, open(tmp, "wb") as f:
        total = int(r.headers.get("Content-Length") or 0)
        done, last = 0, 0.0
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
            done += len(chunk)
            if time.time() - last > 2:
                last = time.time()
                log("   %.1f / %.1f MB" % (done / 1e6, total / 1e6))
    if not zip_ok(tmp):
        os.remove(tmp)
        raise SystemExit("下载的文件不是有效的 Electron zip：" + url)
    os.replace(tmp, path)
    return path


# ---------------------------------------------------------------- 图标
def build_icns():
    """从 desktop/build 里挑最大的 png（退而用 ico）生成 .icns 字节。"""
    from PIL import Image
    bdir = os.path.join(HERE, "build")
    best, best_px = None, 0
    for fn in os.listdir(bdir):
        if fn.lower().endswith((".png", ".ico")):
            p = os.path.join(bdir, fn)
            try:
                with Image.open(p) as im:
                    px = min(im.size)
                    if fn.lower().endswith(".ico"):
                        px = max(min(s) for s in im.info.get("sizes", [im.size]))
            except OSError:
                continue
            # 同尺寸时优先 png
            if px > best_px or (px == best_px and fn.lower().endswith(".png")):
                best, best_px = p, px
    if not best:
        raise SystemExit("desktop/build 里找不到可用的 png/ico 图标")
    im = Image.open(best)
    if best.lower().endswith(".ico"):
        im.size = max(im.info.get("sizes", [im.size]), key=lambda s: s[0] * s[1])
        im.load()
    im = im.convert("RGBA")
    # 补成正方形并放大/缩小到 1024（ICNS 最大规格）
    side = max(im.size)
    if im.size[0] != im.size[1]:
        sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        sq.paste(im, ((side - im.size[0]) // 2, (side - im.size[1]) // 2))
        im = sq
    if side != 1024:
        im = im.resize((1024, 1024), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="ICNS")
    log("[图标] %s (%dpx) -> %s" % (os.path.basename(best), best_px, ICNS_NAME))
    return buf.getvalue()


# ---------------------------------------------------------------- 打包
def new_info(name, mode, date_time=None):
    zi = zipfile.ZipInfo(name, date_time=date_time or time.localtime(time.time())[:6])
    zi.create_system = 3
    zi.external_attr = (mode & 0xFFFF) << 16
    if stat.S_ISDIR(mode):
        zi.external_attr |= 0x10
        zi.compress_type = zipfile.ZIP_STORED
    else:
        zi.compress_type = zipfile.ZIP_DEFLATED
    return zi


def write_bytes(out, name, data, mode=S_IFREG | 0o644):
    zi = new_info(name, mode)
    with out.open(zi, "w") as w:
        w.write(data)


def write_file(out, name, src, mode=S_IFREG | 0o644):
    st = os.stat(src)
    zi = new_info(name, mode, time.localtime(max(st.st_mtime, 315532800))[:6])
    zi.file_size = st.st_size
    with open(src, "rb") as r, out.open(zi, "w") as w:
        shutil.copyfileobj(r, w, 1 << 20)


def patch_main_plist(data):
    pl = plistlib.loads(data)
    pl["CFBundleName"] = APP_NAME
    pl["CFBundleDisplayName"] = APP_NAME
    pl["CFBundleIdentifier"] = APP_ID
    pl["CFBundleShortVersionString"] = VERSION
    pl["CFBundleVersion"] = VERSION
    pl["CFBundleIconFile"] = ICNS_NAME
    # 让 Retina 屏正常、允许深色模式，其余保持 Electron 默认（LSMinimumSystemVersion 不动）
    pl.setdefault("NSHighResolutionCapable", True)
    return plistlib.dumps(pl, fmt=plistlib.FMT_XML)


def minimal_package_json():
    with open(os.path.join(HERE, "package.json"), encoding="utf-8") as f:
        src = json.load(f)
    pkg = {k: src[k] for k in ("name", "productName", "version", "main") if k in src}
    return (json.dumps(pkg, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def build(arch, icns):
    src_zip = get_electron(arch)
    os.makedirs(RELEASE, exist_ok=True)
    out_path = os.path.join(RELEASE, "%s-v%s-macOS-%s.zip" % (APP_NAME, VERSION, arch))
    tmp_path = out_path + ".part"
    res = DST_APP + "Contents/Resources/"
    n_copy = n_link = 0
    with zipfile.ZipFile(src_zip) as src, \
            zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as out:
        for info in src.infolist():
            name = info.filename
            if not name.startswith(SRC_APP):
                continue  # LICENSE、version 等顶层杂项不要
            new_name = DST_APP + name[len(SRC_APP):]
            if new_name == res + "default_app.asar" or new_name == res + "electron.icns":
                continue
            mode = info.external_attr >> 16
            zi = zipfile.ZipInfo(new_name, date_time=info.date_time)
            zi.create_system = 3
            zi.external_attr = info.external_attr
            zi.file_size = info.file_size
            if stat.S_ISLNK(mode) or name.endswith("/"):
                zi.compress_type = zipfile.ZIP_STORED
                n_link += stat.S_ISLNK(mode)
            else:
                zi.compress_type = zipfile.ZIP_DEFLATED
            if new_name == DST_APP + "Contents/Info.plist":
                data = patch_main_plist(src.read(info))
                zi.file_size = len(data)
                out.writestr(zi, data)
                continue
            with src.open(info) as r, out.open(zi, "w") as w:
                shutil.copyfileobj(r, w, 1 << 20)
            n_copy += 1
        log("[%s] Electron 条目 %d 个（符号链接 %d）" % (arch, n_copy, n_link))

        # 图标
        write_bytes(out, res + ICNS_NAME, icns)
        # 主进程代码：Resources/app/（main.js 里 __dirname 即此处，preload 同目录）
        out.writestr(new_info(res + "app/", S_IFDIR | 0o755), b"")
        write_file(out, res + "app/main.js", os.path.join(HERE, "main.js"))
        write_file(out, res + "app/preload.js", os.path.join(HERE, "preload.js"))
        write_bytes(out, res + "app/package.json", minimal_package_json())
        # 游戏：Resources/game/**（main.js 用 process.resourcesPath/game/index.html）
        n_game = 0
        for dirpath, dirnames, filenames in os.walk(DIST):
            dirnames.sort()
            rel = os.path.relpath(dirpath, DIST).replace(os.sep, "/")
            base = res + "game/" + ("" if rel == "." else rel + "/")
            out.writestr(new_info(base, S_IFDIR | 0o755), b"")
            for fn in sorted(filenames):
                write_file(out, base + fn, os.path.join(dirpath, fn))
                n_game += 1
        log("[%s] 游戏文件 %d 个" % (arch, n_game))

        arch_cn = "Apple 芯片版" if arch == "arm64" else "Intel 版"
        arch_desc = "Apple 芯片（M1–M4）的 Mac" if arch == "arm64" else "Intel 芯片的 Mac"
        txt = README_TXT.format(ver=VERSION, arch_cn=arch_cn, arch_desc=arch_desc)
        write_bytes(out, "Mac 版说明.txt", txt.encode("utf-8"))
    os.replace(tmp_path, out_path)
    log("[%s] 完成：%s（%.1f MB）" % (arch, out_path, os.path.getsize(out_path) / 1e6))
    return out_path


def main():
    if not os.path.isfile(os.path.join(DIST, "index.html")):
        raise SystemExit("找不到 dist/index.html，请先构建网页版")
    arches = [a for a in sys.argv[1:] if a in ARCHES] or list(ARCHES)
    icns = build_icns()
    for arch in arches:
        build(arch, icns)


if __name__ == "__main__":
    main()
