/// <reference types="vitest/config" />
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB_OUT = path.resolve(here, '../web');
const DESKTOP_OUT = path.resolve(here, '../desktop/ui');
const FONTS = path.resolve(here, 'src/assets/fonts');
const FONT_LICENCES = ['LICENSE-Fraunces.txt', 'LICENSE-InstrumentSans.txt', 'LICENSE-NotoMusic.txt'];
// Licence texts of the audio engine (Signalsmith Stretch and Linear, MIT) that travel with the wasm binary.
const WASM_DIR = path.resolve(here, 'src/audio/wasm');
const WASM_LICENCES = ['LICENSE-signalsmith-stretch.txt', 'LICENSE-signalsmith-linear.txt'];
// ONNX Runtime Web (MIT), run by the analysis worker, and its licence text.
const ANALYSIS_DIR = path.resolve(here, 'src/analysis');
const ORT_LICENCE = 'LICENSE-onnxruntime-web.txt';
// The « extern wasm » build of ONNX Runtime Web: a small script that loads its
// WebAssembly files (served by the app itself, see the worker) instead of
// embedding them or fetching them from a CDN.
const ORT_WASM_ENTRY = path.resolve(here, 'node_modules/onnxruntime-web/dist/ort.wasm.min.mjs');
// The same, with WebGPU, for the separation on the graphics chip (its own WebAssembly binary, also served
// by the app); loaded by the separation worker only when a separation runs there.
const ORT_WEBGPU_ENTRY = path.resolve(here, 'node_modules/onnxruntime-web/dist/ort.webgpu.min.mjs');
// Fonts worth preloading: needed by the first paint of the shell.
const PRELOADED_FONTS = /^(fraunces-latin-full-normal|instrument-sans-latin-wght-normal|noto-music-music-400-normal)-.*\.woff2$/;

// The audio engine relies on SharedArrayBuffer, which needs cross-origin isolation.
const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

/**
 * Output plumbing:
 *  - the web build shares `web/` with the mockup and the spikes, so it cannot
 *    empty the folder: it only removes what it generated last time
 *    (`index.html` and `assets/`);
 *  - the font licence texts travel with the fonts (OFL), under stable names,
 *    and so do those of the audio engine's wasm binary (MIT);
 *  - the main fonts are preloaded.
 */
function fabticeOutput(mode: string): Plugin {
  return {
    name: 'fabtice-output',
    apply: 'build',
    buildStart() {
      if (mode !== 'desktop') {
        rmSync(path.join(WEB_OUT, 'assets'), { recursive: true, force: true });
        rmSync(path.join(WEB_OUT, 'index.html'), { force: true });
      }
    },
    generateBundle() {
      for (const name of FONT_LICENCES) {
        this.emitFile({ type: 'asset', fileName: `assets/${name}`, source: readFileSync(path.join(FONTS, name)) });
      }
      for (const name of WASM_LICENCES) {
        this.emitFile({ type: 'asset', fileName: `assets/${name}`, source: readFileSync(path.join(WASM_DIR, name)) });
      }
      this.emitFile({ type: 'asset', fileName: `assets/${ORT_LICENCE}`, source: readFileSync(path.join(ANALYSIS_DIR, ORT_LICENCE)) });
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        if (!ctx.bundle) return [];
        return Object.keys(ctx.bundle)
          .filter((file) => PRELOADED_FONTS.test(path.basename(file)))
          .map((file) => ({
            tag: 'link',
            attrs: { rel: 'preload', href: `./${file}`, as: 'font', type: 'font/woff2', crossorigin: '' },
            injectTo: 'head' as const,
          }));
      },
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  // No public dir: everything generated must land in assets/.
  publicDir: false,
  plugins: [react(), fabticeOutput(mode)],
  resolve: {
    alias: [
      { find: /^onnxruntime-web\/wasm$/, replacement: ORT_WASM_ENTRY },
      { find: /^onnxruntime-web\/webgpu$/, replacement: ORT_WEBGPU_ENTRY },
    ],
  },
  // The analysis and separation workers are ES module workers (they import ONNX Runtime and the app's own modules).
  worker: { format: 'es' },
  // Found only inside the worker, ONNX Runtime would be pre-bundled by the dev server on first use,
  // which reloads the page once: say so up front.
  optimizeDeps: { include: ['onnxruntime-web/wasm', 'onnxruntime-web/webgpu'] },
  build: {
    outDir: mode === 'desktop' ? DESKTOP_OUT : WEB_OUT,
    emptyOutDir: mode === 'desktop',
    assetsDir: 'assets',
    // Fonts must stay files (never inlined as data: URLs).
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  server: { headers: ISOLATION_HEADERS },
  preview: { headers: ISOLATION_HEADERS },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));
