#!/usr/bin/env python3
"""Fabtice extraction service (phase 0).

Fetches the audio track of a single YouTube video with yt-dlp and relays it to
the browser. Nothing is kept: the file lives in a RAM-backed temp directory for
the duration of the request and is deleted as soon as it has been sent.
"""
import asyncio
import hmac
import json
import os
import re
import shutil
import tempfile
import time
from collections import defaultdict, deque
from pathlib import Path
from urllib.parse import quote

from aiohttp import web

PORT = int(os.environ.get("PORT", "8080"))
BIND = os.environ.get("BIND", "127.0.0.1")
COMMIT = os.environ.get("FABTICE_COMMIT", "dev")
TMP_ROOT = os.environ.get("FABTICE_TMP", "/tmp")
TOKEN_FILE = Path(os.environ.get("FABTICE_TOKEN_FILE", "/etc/fabtice/admin_token"))
ARGS_FILE = Path(__file__).with_name("ytdlp_args.json")

MAX_DURATION_S = 20 * 60
MAX_FILESIZE = "80M"
AUDIO_FORMAT = "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best"
MAX_PARALLEL = 3
PER_IP_PER_HOUR = 20
GLOBAL_PER_HOUR = 200

ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
URL_ID_RE = re.compile(
    r"(?:[?&]v=|youtu\.be/|/shorts/|/embed/|/live/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])"
)
CONTENT_TYPES = {
    "m4a": "audio/mp4",
    "mp4": "audio/mp4",
    "webm": "audio/webm",
    "opus": "audio/ogg",
    "ogg": "audio/ogg",
    "mp3": "audio/mpeg",
}

slots = asyncio.Semaphore(MAX_PARALLEL)
hits_by_ip = defaultdict(deque)
hits_global = deque()
recent_log = deque(maxlen=400)


def log(msg):
    line = f"[{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}] {msg}"
    recent_log.append(line)
    print(line, flush=True)


def extra_args():
    try:
        value = json.loads(ARGS_FILE.read_text())
        return [str(a) for a in value] if isinstance(value, list) else []
    except (OSError, ValueError):
        return []


def parse_video_id(value):
    value = (value or "").strip()
    if ID_RE.match(value):
        return value
    found = URL_ID_RE.search(value)
    return found.group(1) if found else None


def client_ip(request):
    forwarded = request.headers.get("X-Forwarded-For", "")
    return forwarded.split(",")[0].strip() or (request.remote or "?")


def admin_token():
    try:
        return TOKEN_FILE.read_text().strip()
    except OSError:
        return ""


def is_admin(request):
    token = admin_token()
    given = request.headers.get("Authorization", "")
    return bool(token) and hmac.compare_digest(given, f"Bearer {token}")


def rate_limited(ip):
    now = time.time()
    for bucket in (hits_by_ip[ip], hits_global):
        while bucket and now - bucket[0] > 3600:
            bucket.popleft()
    if len(hits_by_ip[ip]) >= PER_IP_PER_HOUR or len(hits_global) >= GLOBAL_PER_HOUR:
        return True
    hits_by_ip[ip].append(now)
    hits_global.append(now)
    return False


async def run(cmd, timeout, cwd=None):
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=cwd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        return -9, "", f"timeout after {timeout}s"
    return proc.returncode, out.decode(errors="replace"), err.decode(errors="replace")


def ytdlp_base():
    return ["yt-dlp", "--no-playlist", "--no-progress", "--no-cache-dir", *extra_args()]


def short_error(stderr):
    lines = [ln for ln in stderr.strip().splitlines() if ln.startswith("ERROR")]
    return (lines[-1] if lines else stderr.strip()[-400:]) or "unknown error"


def json_error(status, code, detail=""):
    return web.json_response({"error": code, "detail": detail}, status=status)


@web.middleware
async def cors(request, handler):
    if request.method == "OPTIONS":
        response = web.Response(status=204)
    else:
        try:
            response = await handler(request)
        except web.HTTPException as exc:
            response = exc
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
    response.headers["Access-Control-Expose-Headers"] = "X-Fabtice-Meta, Content-Length"
    return response


async def health(request):
    return web.json_response({"ok": True, "service": "fabtice-extractor", "commit": COMMIT})


async def info(request):
    video_id = parse_video_id(request.query.get("url") or request.query.get("id"))
    if not video_id:
        return json_error(400, "bad_link", "Not a YouTube video link.")
    if not is_admin(request) and rate_limited(client_ip(request)):
        return json_error(429, "rate_limited")
    async with slots:
        code, out, err = await run(
            [*ytdlp_base(), "-J", f"https://www.youtube.com/watch?v={video_id}"], 90
        )
    if code != 0:
        log(f"info {video_id} FAILED: {short_error(err)}")
        return json_error(502, "extraction_failed", short_error(err))
    data = json.loads(out)
    return web.json_response(
        {
            "id": data.get("id"),
            "title": data.get("title"),
            "channel": data.get("channel") or data.get("uploader"),
            "duration": data.get("duration"),
            "is_live": bool(data.get("is_live")),
        }
    )


async def audio(request):
    video_id = parse_video_id(request.query.get("url") or request.query.get("id"))
    if not video_id:
        return json_error(400, "bad_link", "Not a YouTube video link.")
    if not is_admin(request) and rate_limited(client_ip(request)):
        return json_error(429, "rate_limited")

    tmpdir = tempfile.mkdtemp(prefix="fab-", dir=TMP_ROOT)
    started = time.time()
    try:
        async with slots:
            code, out, err = await run(
                [
                    *ytdlp_base(),
                    "-f", AUDIO_FORMAT,
                    "--max-filesize", MAX_FILESIZE,
                    "--match-filter", f"!is_live & duration<={MAX_DURATION_S}",
                    "--no-simulate",
                    "--print", "after_move:%(.{id,title,channel,duration,ext,acodec,abr,asr,format_id})j",
                    "-o", "audio.%(ext)s",
                    f"https://www.youtube.com/watch?v={video_id}",
                ],
                300,
                cwd=tmpdir,
            )
        files = [p for p in Path(tmpdir).iterdir() if p.is_file() and p.stat().st_size > 0]
        if code != 0 or not files:
            reason = short_error(err) if code != 0 else "too long, live, or no audio"
            log(f"audio {video_id} FAILED ({time.time() - started:.1f}s): {reason}")
            status = 502 if code != 0 else 422
            return json_error(status, "extraction_failed", reason)

        path = max(files, key=lambda p: p.stat().st_size)
        meta = {}
        for line in reversed(out.strip().splitlines()):
            try:
                meta = json.loads(line)
                break
            except ValueError:
                continue
        size = path.stat().st_size
        log(f"audio {video_id} ok {size} bytes {path.suffix} in {time.time() - started:.1f}s")

        response = web.StreamResponse(
            headers={
                "Content-Type": CONTENT_TYPES.get(path.suffix.lstrip("."), "application/octet-stream"),
                "Content-Length": str(size),
                "Cache-Control": "no-store",
                "X-Fabtice-Meta": quote(json.dumps(meta, ensure_ascii=False)),
            }
        )
        await response.prepare(request)
        with path.open("rb") as handle:
            while chunk := handle.read(256 * 1024):
                await response.write(chunk)
        await response.write_eof()
        return response
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


async def admin_ytdlp(request):
    """Phase 0 diagnostics: run yt-dlp with arbitrary arguments. Remove before v1."""
    if not is_admin(request):
        return json_error(401, "unauthorized")
    body = await request.json()
    args = [str(a) for a in body.get("args", [])]
    timeout = min(int(body.get("timeout", 120)), 600)
    use_base = body.get("base", True)
    tmpdir = tempfile.mkdtemp(prefix="fab-adm-", dir=TMP_ROOT)
    started = time.time()
    try:
        cmd = [*(ytdlp_base() if use_base else ["yt-dlp"]), *args]
        code, out, err = await run(cmd, timeout, cwd=tmpdir)
        produced = [
            {"name": p.name, "bytes": p.stat().st_size}
            for p in Path(tmpdir).iterdir()
            if p.is_file()
        ]
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
    return web.json_response(
        {
            "code": code,
            "seconds": round(time.time() - started, 1),
            "stdout": out[-30000:],
            "stderr": err[-30000:],
            "files": produced,
        }
    )


async def admin_env(request):
    if not is_admin(request):
        return json_error(401, "unauthorized")
    result = {"commit": COMMIT, "extra_args": extra_args()}
    for name, cmd in {
        "yt_dlp": ["yt-dlp", "--version"],
        "deno": ["deno", "--version"],
        "ffmpeg": ["ffmpeg", "-version"],
        "ip_addr": ["ip", "-brief", "addr"],
        "ip6_route": ["ip", "-6", "route"],
    }.items():
        try:
            _, out, err = await run(cmd, 15)
            result[name] = [ln[:200] for ln in (out or err).strip().splitlines()[:12]]
        except OSError as exc:
            result[name] = [f"unavailable: {exc}"]
    return web.json_response(result)


async def admin_logs(request):
    if not is_admin(request):
        return json_error(401, "unauthorized")
    return web.Response(text="\n".join(recent_log) + "\n")


def make_app():
    app = web.Application(middlewares=[cors])
    app.router.add_get("/", health)
    app.router.add_get("/health", health)
    app.router.add_get("/api/info", info)
    app.router.add_get("/api/audio", audio)
    app.router.add_post("/admin/ytdlp", admin_ytdlp)
    app.router.add_get("/admin/env", admin_env)
    app.router.add_get("/admin/logs", admin_logs)
    app.router.add_route("OPTIONS", "/{tail:.*}", health)
    return app


if __name__ == "__main__":
    log(f"starting commit={COMMIT} admin={'on' if admin_token() else 'off'}")
    web.run_app(make_app(), host=BIND, port=PORT, print=None)
