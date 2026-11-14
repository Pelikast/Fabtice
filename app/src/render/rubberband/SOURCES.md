# rubberband.wasm and rubberband-nosimd.wasm

The offline renderer of « Appliquer » and of the audio export: Rubber Band
Library 4.0 (GPL-2.0-or-later, Breakfast Quay), engine R3 « finer », compiled
to WebAssembly (WASI reactor), with and without SIMD. The licence text sits
next to the binaries (`LICENSE-rubberband-GPL.txt`) and is copied into the build
(`assets/`). Fabtice is GPL-3.0-or-later, which this licence allows.

These are byte-for-byte copies of
`web/spikes/lecteur/engines/rubberband.wasm` and `rubberband-nosimd.wasm`.
The C source of the small API around the library (`fe_*`) is
`web/spikes/lecteur/engines/src/rubberband.cpp`, the compiler flags and the
upstream revision (rubberband e4296ac, v4.0) are in
`web/spikes/lecteur/engines/build.sh` (needs Zig: `pip install ziglang`).
Do not rebuild them without measuring again.

The C API is the real-time one (`OptionProcessRealTime`, `OptionEngineFiner`,
`OptionPitchHighConsistency`, formants shifted or preserved). It is used here
offline by feeding it blocks as fast as it computes, then silence until the last
wanted frame has come out (`stretcher.ts`).
