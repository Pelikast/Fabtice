#!/usr/bin/env bash
# Checks, on a real Mac, the official yt-dlp macOS executable together with the
# app's Electron binary used as yt-dlp's Node.js runtime.
# Usage: ytdlp-check.sh <path to Fabtice.app/Contents/MacOS/Fabtice> [--youtube]
# With --youtube, also asks YouTube for one video's metadata (no download);
# a refusal from YouTube on a datacenter address is expected and only reported.
set -uo pipefail
APP_BIN="$1"
WORK="$RUNNER_TEMP/ytdlp-check"
BASE=https://github.com/yt-dlp/yt-dlp/releases/latest/download
rm -rf "$WORK" && mkdir -p "$WORK" && cd "$WORK" || exit 1

curl -fsSL -o SHA2-256SUMS "$BASE/SHA2-256SUMS" || exit 1
curl -fsSL -o yt-dlp_macos "$BASE/yt-dlp_macos" || exit 1
curl -fsSL -o yt-dlp_macos.zip "$BASE/yt-dlp_macos.zip" || exit 1
grep -E ' (yt-dlp_macos|yt-dlp_macos\.zip)$' SHA2-256SUMS | shasum -a 256 -c - || exit 1
chmod +x yt-dlp_macos

echo "== yt-dlp_macos"
file yt-dlp_macos
lipo -archs yt-dlp_macos
./yt-dlp_macos --version

echo "== minimum macOS of the Mach-O files in yt-dlp_macos.zip (same build, unpacked)"
mkdir onedir && ditto -x -k yt-dlp_macos.zip onedir
find onedir -type f | while read -r f; do
  if file "$f" | grep -q 'Mach-O'; then
    otool -l "$f" | awk '/LC_BUILD_VERSION/{b=1} b&&/minos/{print $2; b=0} /LC_VERSION_MIN_MACOSX/{v=1} v&&/version/{print $2; v=0}'
  fi
done | sort -V | uniq -c

echo "== Electron as Node"
ELECTRON_RUN_AS_NODE=1 "$APP_BIN" --version
echo 'console.log(JSON.stringify({ok: 1 + 1 === 2, node: process.version, arch: process.arch}))' \
  | ELECTRON_RUN_AS_NODE=1 "$APP_BIN" --permission - ; echo "exit=$?"

echo "== yt-dlp verbose header with the app as JS runtime"
# Without a URL yt-dlp exits with status 2 after printing its header.
header=$(ELECTRON_RUN_AS_NODE=1 ./yt-dlp_macos -v --ignore-config --no-js-runtimes --js-runtimes "node:$APP_BIN" 2>&1)
printf '%s\n' "$header" | head -12
if ! printf '%s\n' "$header" | grep -q 'JS runtimes: node-'; then
  echo "FAIL: yt-dlp did not accept the app as its node runtime"
  exit 1
fi

if [ "${2:-}" = "--youtube" ]; then
  echo "== informational: metadata of one Creative Commons video (Big Buck Bunny), no download"
  ELECTRON_RUN_AS_NODE=1 ./yt-dlp_macos -v --ignore-config --no-playlist --no-js-runtimes --js-runtimes "node:$APP_BIN" \
    --format 'bestaudio[ext=m4a][acodec^=mp4a]/bestaudio[ext=m4a]/bestaudio' \
    --print '%(title)s | %(duration)s s | format %(format_id)s %(ext)s %(acodec)s %(container)s' \
    -- 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' 2>&1 | grep -vE '^\[debug\] (Proxy map|Request Handlers|Plugin|Loaded)' | tail -40
  echo "exit=${PIPESTATUS[0]}"
fi
exit 0
