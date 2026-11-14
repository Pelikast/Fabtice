// The URL of the mp3 encoder's WebAssembly file, as the build serves it (under
// `assets/`, relative to this module: right with the desktop build's `./` base
// too). Its own module so the Node unit tests never have to resolve Vite's
// special imports; the driver loads it when the first mp3 is made.

// (The package's export map names this file `wasm/mp3`; its `wasm/mp3.wasm` entry points at a wrong path.)
import mp3WasmUrl from 'wasm-media-encoders/wasm/mp3?url';

export { mp3WasmUrl };
