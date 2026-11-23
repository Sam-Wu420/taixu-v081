# -*- coding: utf-8 -*-
"""太虚问道录 · 寰宇篇 —— 静态单页游戏托管（Docker SDK / 纯 FastAPI，不依赖 Gradio）。

设计要点
--------
1. 平台只要求「7860 端口上有 HTTP 服务」，Docker SDK 下不再需要 Gradio 协议外壳，
   根路径可以干净地返回游戏首页，避免平台探活拿到 Gradio 默认页。
2. 首屏优化：index.html 极小且无阻塞脚本，主 JS 3.9MB / gzip 1.7MB，
   预压缩的 .gz 直接以 Content-Encoding: gzip 输出，省掉运行期压缩开销。
3. 缓存策略：带哈希的 JS 与 media 走 immutable 长缓存，index.html 走 no-cache，
   确保发版后不会拿到旧壳。
4. 云存档：/api/cloud*，JSON 落盘，按需分页。
"""
from __future__ import annotations

import gzip as _gzip
import json
import os
import re
import shutil
import threading
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from starlette.middleware.gzip import GZipMiddleware

BASE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(BASE, "assets")
ART = os.path.join(BASE, "art")
MEDIA = os.path.join(BASE, "media")
STORE = os.path.join(BASE, "cloudstore")
os.makedirs(STORE, exist_ok=True)

MAX_CHARS = 900_000
MAX_META_CHARS = 8192
MAX_CLOUD_BODY_BYTES = 1_200_000
MAX_NPC_BODY_BYTES = 64_000
SAVE_ID_RE = re.compile(r"^[0-9a-fA-F]{8,32}$")
COMPRESSIBLE = (".js", ".css", ".html", ".json", ".svg", ".txt", ".map")
GZIP_MIN = 2048

MIME = {
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".txt": "text/plain; charset=utf-8",
    ".wasm": "application/wasm",
}


def _mime(path: str) -> str:
    return MIME.get(os.path.splitext(path)[1].lower(), "application/octet-stream")


# ---------------- 预压缩：启动时把文本资源压成 .gz ----------------
def _precompress() -> None:
    t0 = time.time()
    n = 0
    for root, dirs, files in os.walk(BASE):
        dirs[:] = [d for d in dirs if d not in (".git", "__pycache__", "cloudstore")]
        for fn in files:
            if not fn.lower().endswith(COMPRESSIBLE):
                continue
            p = os.path.join(root, fn)
            try:
                if os.path.getsize(p) < GZIP_MIN:
                    continue
            except OSError:
                continue
            gz = p + ".gz"
            try:
                if os.path.exists(gz) and os.path.getmtime(gz) >= os.path.getmtime(p):
                    continue
                with open(p, "rb") as f, _gzip.open(gz, "wb", compresslevel=6) as g:
                    shutil.copyfileobj(f, g, 1 << 20)
                n += 1
            except Exception as exc:  # noqa: BLE001
                print(f"[taixu] 压缩失败 {fn}: {exc}", flush=True)
    if n:
        print(f"[taixu] 预压缩 {n} 个文件，用时 {time.time() - t0:.1f}s", flush=True)


# ---------------- 静态文件响应 ----------------
def _send(request: Request, path: str, cache: str, allow_gzip: bool = True) -> Response:
    if not os.path.isfile(path):
        return JSONResponse({"error": "not found"}, status_code=404)
    ext = os.path.splitext(path)[1].lower()
    mime = _mime(path)
    headers = {"Cache-Control": cache}

    if allow_gzip and ext in COMPRESSIBLE and "gzip" in request.headers.get("accept-encoding", "").lower():
        gz = path + ".gz"
        if os.path.exists(gz):
            headers["Content-Encoding"] = "gzip"
            headers["Vary"] = "Accept-Encoding"
            return FileResponse(gz, media_type=mime, headers=headers)

    return FileResponse(path, media_type=mime, headers=headers)


def _resolve(root: str, rel: str) -> str | None:
    rel = (rel or "").lstrip("/")
    if not rel:
        return None
    p = os.path.normpath(os.path.join(root, rel))
    if p != root and not p.startswith(root + os.sep):
        return None
    return p if os.path.isfile(p) else None


app = FastAPI(title="太虚问道录 · 寰宇篇", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(GZipMiddleware, minimum_size=4096)

INDEX = os.path.join(BASE, "index.html")
IMMUTABLE = "public, max-age=31536000, immutable"
LONG = "public, max-age=604800"


@app.on_event("startup")
def _on_start() -> None:
    _precompress()
    print(f"[taixu] 就绪 · media={os.path.isdir(MEDIA)} · 存档 {len(_all())} 条", flush=True)


@app.get("/")
@app.get("/index.html")
def index(request: Request):
    return _send(request, INDEX, "no-cache")


@app.get("/assets/{path:path}")
def assets(request: Request, path: str):
    p = _resolve(ASSETS, path)
    return _send(request, p, IMMUTABLE) if p else JSONResponse({"error": "not found"}, status_code=404)


@app.get("/media/{path:path}")
def media(request: Request, path: str):
    p = _resolve(MEDIA, path)
    return _send(request, p, IMMUTABLE) if p else JSONResponse({"error": "not found"}, status_code=404)


@app.get("/art/{path:path}")
def art(request: Request, path: str):
    p = _resolve(ART, path)
    return _send(request, p, LONG) if p else JSONResponse({"error": "not found"}, status_code=404)


@app.get("/favicon.png")
def favicon(request: Request):
    return _send(request, os.path.join(BASE, "favicon.png"), LONG)


@app.get("/favicon.ico")
def favicon_ico(request: Request):
    return _send(request, os.path.join(BASE, "favicon.png"), LONG)


# ---------------- 云存档 ----------------
_STORE_LOCK = threading.Lock()
_INDEX: list[dict] = []
_INDEX_LOADED = False
_NEXT_SEQ = 1


def _now() -> int:
    return int(time.time())


def _meta_entry(rec: dict) -> dict:
    meta = rec.get("meta") if isinstance(rec.get("meta"), dict) else {}
    return {
        "id": str(rec["id"]),
        "no": rec.get("no"),
        "seq": int(rec.get("seq") or 0),
        "time": rec.get("time"),
        "meta": meta,
        "meta_lc": json.dumps(meta, ensure_ascii=False).lower(),
    }


def _ensure_index() -> list[dict]:
    global _INDEX_LOADED, _NEXT_SEQ
    with _STORE_LOCK:
        if _INDEX_LOADED:
            return list(_INDEX)
        out: list[dict] = []
        try:
            names = os.listdir(STORE)
        except OSError as exc:
            print(f"[taixu] 读取存档目录失败: {exc}", flush=True)
            names = []
        for fn in names:
            if not fn.endswith(".json"):
                continue
            try:
                with open(os.path.join(STORE, fn), encoding="utf-8") as f:
                    rec = json.load(f)
                if isinstance(rec, dict) and rec.get("id"):
                    out.append(_meta_entry(rec))
            except Exception as exc:  # noqa: BLE001
                print(f"[taixu] 跳过损坏存档 {fn}: {exc}", flush=True)
                continue
        out.sort(key=lambda r: r.get("seq", 0))
        _INDEX.clear()
        _INDEX.extend(out)
        max_seq = max((int(r.get("seq") or 0) for r in out), default=0)
        _NEXT_SEQ = max(max_seq + 1, len(out) + 1)
        _INDEX_LOADED = True
        return list(_INDEX)


def _all() -> list[dict]:
    return _ensure_index()


def _load(rec_id: str) -> dict | None:
    if not SAVE_ID_RE.fullmatch(rec_id or ""):
        return None
    p = os.path.join(STORE, f"{rec_id}.json")
    if not os.path.isfile(p):
        return None
    try:
        with open(p, encoding="utf-8") as f:
            rec = json.load(f)
        return rec if isinstance(rec, dict) else None
    except Exception as exc:  # noqa: BLE001
        print(f"[taixu] 读取存档 {rec_id} 失败: {exc}", flush=True)
        return None


async def _read_json_limited(request: Request, max_bytes: int) -> tuple[dict | None, int]:
    cl = request.headers.get("content-length")
    if cl:
        try:
            if int(cl) > max_bytes:
                return None, 413
        except ValueError:
            return None, 400
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > max_bytes:
            return None, 413
        chunks.append(chunk)
    try:
        raw = b"".join(chunks).decode("utf-8")
        obj = json.loads(raw)
    except Exception:  # noqa: BLE001
        return None, 400
    if not isinstance(obj, dict):
        return None, 400
    return obj, 200


def _write_json_atomic(path: str, obj: dict) -> None:
    tmp = f"{path}.tmp.{uuid.uuid4().hex[:8]}"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False)
            f.flush()
            try:
                os.fsync(f.fileno())
            except OSError:
                pass
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


@app.get("/api/cloud/list")
def cloud_list(offset: int = 0, limit: int = 200, q: str = ""):
    rows = _all()
    if q:
        ql = q.strip()[:100].lower()
        if ql:
            rows = [r for r in rows if ql in r.get("meta_lc", "")]
    total = len(rows)
    off = max(0, offset)
    lim = max(1, min(limit, 500))
    rows = rows[off: off + lim]
    return {"total": total, "whole": total,
            "items": [{"id": r["id"], "no": r.get("no"), "time": r.get("time"), "meta": r.get("meta", {})}
                      for r in rows]}


@app.post("/api/cloud")
async def cloud_save(request: Request):
    body, code = await _read_json_limited(request, MAX_CLOUD_BODY_BYTES)
    if code == 413:
        return JSONResponse({"error": "存档过大"}, status_code=413)
    if body is None:
        return JSONResponse({"error": "请求格式错误"}, status_code=400)
    data = body.get("data")
    if data is None:
        return JSONResponse({"error": "缺少存档数据"}, status_code=400)
    if len(json.dumps(data, ensure_ascii=False)) > MAX_CHARS:
        return JSONResponse({"error": "存档过大"}, status_code=413)
    meta = body.get("meta")
    if meta is None:
        meta = {}
    elif not isinstance(meta, dict):
        return JSONResponse({"error": "meta 格式错误"}, status_code=400)
    elif len(json.dumps(meta, ensure_ascii=False)) > MAX_META_CHARS:
        return JSONResponse({"error": "meta 过大"}, status_code=413)
    ts = body.get("time")
    if ts is not None and (isinstance(ts, bool) or not isinstance(ts, (int, float))):
        return JSONResponse({"error": "time 格式错误"}, status_code=400)

    _ensure_index()
    global _NEXT_SEQ
    with _STORE_LOCK:
        seq = _NEXT_SEQ
        _NEXT_SEQ += 1
        rec = {
            "id": uuid.uuid4().hex[:16],
            "no": seq,
            "seq": seq,
            "time": ts if ts is not None else _now(),
            "saved": _now(),
            "meta": meta,
            "data": data,
        }
        try:
            _write_json_atomic(os.path.join(STORE, f"{rec['id']}.json"), rec)
        except OSError as exc:
            print(f"[taixu] 写入云存档失败: {exc}", flush=True)
            return JSONResponse({"error": "存档写入失败"}, status_code=500)
        _INDEX.append(_meta_entry(rec))
    return {"id": rec["id"], "no": rec["no"]}


@app.get("/api/cloud/one")
def cloud_one(id: str):
    if not SAVE_ID_RE.fullmatch(id or ""):
        return JSONResponse({"error": "存档编号格式无效"}, status_code=400)
    rec = _load(id)
    if not rec:
        return JSONResponse({"error": "存档不存在"}, status_code=404)
    return {"id": rec["id"], "no": rec.get("no"), "time": rec.get("time"),
            "meta": rec.get("meta", {}), "data": rec["data"]}


@app.get("/api/health")
def health():
    return {"ok": True, "saves": len(_all())}


# ---------------- NPC 自由对话 ----------------
import npc_llm  # noqa: E402


@app.get("/api/npc/health")
def npc_health():
    return npc_llm.health()


@app.post("/api/npc/chat")
async def npc_chat(request: Request):
    payload, code = await _read_json_limited(request, MAX_NPC_BODY_BYTES)
    if payload is None:
        return JSONResponse({"ok": False, "fallback": True, "why": "bad-request" if code == 400 else "too-large"})
    ip = (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
          or (request.client.host if request.client else "0.0.0.0"))
    res = await npc_llm.chat(payload, ip)
    return JSONResponse(res)


# ---------------- SPA 兜底 ----------------
@app.get("/{path:path}")
def fallback(request: Request, path: str):
    if path.startswith("api/"):
        return JSONResponse({"error": "not found"}, status_code=404)
    for root in (ASSETS, MEDIA, ART):
        p = _resolve(root, path)
        if p:
            return _send(request, p, LONG)
    return _send(request, INDEX, "no-cache")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "7860")), log_level="warning")
