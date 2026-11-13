// URLs of the two files the engine loads at run time. Kept in their own module
// so the Node unit tests, which never start an AudioContext, do not have to
// resolve Vite's special imports; `WorkletEngine` loads it on first use.
//
//  - `?worker&url`: Vite bundles the worklet and everything it imports into
//    one self-contained script under `assets/` and gives its URL (relative to
//    this module, so it works with the desktop build's `./` base too);
//  - `?url`: the WebAssembly binary as an asset. It is fetched and its bytes
//    are posted to the worklet (a compiled `WebAssembly.Module` cannot be
//    posted to an AudioWorklet in Chromium).

import workletUrl from './worklet/processor.ts?worker&url';
import wasmUrl from './wasm/signalsmith-nosimd.wasm?url';

export { workletUrl, wasmUrl };
