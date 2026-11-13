#!/bin/bash
# Rebuilds the WebAssembly engines from upstream sources (the .wasm files are committed:
# the site has no build step).
#
#   pip install ziglang          # zig bundles clang + wasi-libc + libc++; no emscripten needed
#   git clone --depth 1 https://github.com/Signalsmith-Audio/signalsmith-stretch
#   git clone --depth 1 https://github.com/Signalsmith-Audio/linear
#   git clone --depth 1 https://github.com/breakfastquay/rubberband
#   SS=... SL=... RB=... ./build.sh
#
# Upstream revisions used for the committed binaries:
#   signalsmith-stretch 88061fd (v1.3.2, MIT), signalsmith-audio/linear 7bb1c8f (MIT),
#   rubberband e4296ac (v4.0, GPL-2.0-or-later).
set -e
cd "${0%/*}"
: "${SS:?path to signalsmith-stretch checkout}" "${SL:?path to signalsmith linear checkout}" "${RB:?path to rubberband checkout}"
ZIG="${ZIG:-python3 -m ziglang}"
INC=$(mktemp -d)
ln -s "$SL" "$INC/signalsmith-linear"
ln -s "$SS/signalsmith-stretch.h" "$INC/signalsmith-stretch.h"

COMMON="-O3 -fno-exceptions -fno-rtti -std=c++17 -target wasm32-wasi -mexec-model=reactor -Wl,--no-entry -Wl,--strip-all"
for simd in simd nosimd; do
  flags="$COMMON"; suffix=""
  if [ $simd = simd ]; then flags="$flags -msimd128"; else suffix="-nosimd"; fi
  $ZIG c++ $flags -ffast-math -I "$INC" -o "signalsmith$suffix.wasm" src/signalsmith.cpp
  # Rubber Band 4.0, single-file build (built-in FFT and resampler), R2 + R3 engines
  $ZIG c++ $flags -I "$RB" -I "$RB/rubberband" "-Dthrow=__builtin_trap();(void)" -DLACK_POSIX_MEMALIGN -DMALLOC_IS_ALIGNED -o "rubberband$suffix.wasm" src/rubberband.cpp "$RB/single/RubberBandSingle.cpp"
done
rm -r "$INC"
ls -la *.wasm
