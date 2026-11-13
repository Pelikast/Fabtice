# signalsmith-nosimd.wasm

Time-stretch and pitch-shift engine of the live preview: Signalsmith Stretch
1.3.2 (MIT) with Signalsmith Linear (MIT), compiled to WebAssembly (WASI
reactor, no SIMD: measured as not slower than the SIMD build). The licence
texts sit next to the binary and are copied into the build (`assets/`).

Where the C++ source lives (this is what was compiled, with its build script
and the exact upstream revisions):

- `web/spikes/lecteur/engines/src/signalsmith.cpp`: the small C API (`fe_*`)
  around the library;
- `web/spikes/lecteur/engines/build.sh`: compiler flags and upstream revisions
  (signalsmith-stretch 88061fd = v1.3.2, signalsmith-audio/linear 7bb1c8f).
  Needs Zig (`pip install ziglang`).

This binary is a byte-for-byte copy of
`web/spikes/lecteur/engines/signalsmith-nosimd.wasm`. Do not rebuild it
without measuring again.
