#!/usr/bin/env bash
# Runs yt-dlp's own EJS challenge-solver integration test with the app's
# Electron binary standing in for "node" (yt-dlp's NodeJCP provider, the same
# code path the official executable uses). The test fetches YouTube player
# JavaScript files (static assets), so it needs youtube.com to be reachable.
# Usage: ejs-node-test.sh <path to Fabtice.app/Contents/MacOS/Fabtice>
set -uo pipefail
APP_BIN="$1"
VERSION=2026.10.26
WORK="$RUNNER_TEMP/ejs-test"
rm -rf "$WORK" && mkdir -p "$WORK/shim" && cd "$WORK" || exit 1

printf '#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "%s" "$@"\n' "$APP_BIN" > shim/node
chmod +x shim/node
PATH="$WORK/shim:$PATH" node --version

python3 -m venv venv && . venv/bin/activate || exit 1
pip install --quiet "yt-dlp[default]==$VERSION" pytest==9.1.1 || exit 1  # pytest version of yt-dlp's own CI
git clone --quiet --depth 1 --branch "$VERSION" https://github.com/yt-dlp/yt-dlp src || exit 1
cd src || exit 1
PATH="$WORK/shim:$PATH" python -m pytest -p no:cacheprovider test/test_jsc/test_ejs_integration.py -k NodeJCP -v 2>&1 | tail -30
exit "${PIPESTATUS[0]}"
