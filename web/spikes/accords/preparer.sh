#!/usr/bin/env bash
# Re-creates everything the bench needs, in data/ (never committed):
# Node and Python dependencies, the soundfont, the synthetic corpus, the
# GuitarSet recordings. Needs: node >= 22, python3 >= 3.11, ffmpeg, fluidsynth.
set -euo pipefail
cd "$(dirname "$0")"
for tool in node python3 ffmpeg fluidsynth curl; do
  command -v "$tool" >/dev/null || { echo "Il manque : $tool"; exit 1; }
done
npm install --no-audit --no-fund
[ -x .venv/bin/python ] || python3 -m venv .venv
.venv/bin/pip install -q -r requirements.txt
.venv/bin/python corpus/prepare.py --jobs "${JOBS:-4}"
.venv/bin/python corpus/reel_guitarset.py
node banc/build.mjs
echo "Prêt. Lancer le banc : node dist/run.mjs --variant base"
