# rubberband-nosimd.wasm

The offline renderer of « Appliquer » and of the audio export: Rubber Band
Library 4.0 (GPL-2.0-or-later, Breakfast Quay), engine R3 « finer », compiled
to WebAssembly (WASI reactor, no SIMD). The licence text sits next to the
binary (`LICENSE-rubberband-GPL.txt`) and is copied into the build
(`assets/`). Fabtice is GPL-3.0-or-later, which this licence allows.

This is a byte-for-byte copy of `web/spikes/lecteur/engines/rubberband-nosimd.wasm`.
The SIMD build of the prototype is not shipped: measured on 30 s of mono audio
it was within the noise of this one (2.7 s against 3.1 s at tempo 1, 4.4 s
against 4.1 s at 0.7), for a second 509 KB file and a feature test.

The C source of the small API around the library (`fe_*`) is
`web/spikes/lecteur/engines/src/rubberband.cpp`; the compiler flags and the
upstream revision (rubberband e4296ac, v4.0) are in
`web/spikes/lecteur/engines/build.sh` (needs Zig: `pip install ziglang`).
Do not rebuild it without measuring again.

The C API is the real-time one (`OptionProcessRealTime`, `OptionEngineFiner`,
`OptionPitchHighConsistency`, formants shifted or preserved). It is used here
offline by feeding it blocks as fast as it computes, then silence until the
last wanted frame has come out (`stretcher.ts`); its start delay is wrong by a
few milliseconds for settings other than the neutral ones, so it is measured
for the settings at hand and compensated (`measureDelay`).
