/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
// Licence text of the offline renderer's binaries (Rubber Band, GPL), which travels with them.
const RENDER_DIR = path.resolve(here, 'src/render/rubberband');
const RENDER_LICENCES = ['LICENSE-rubberband-GPL.txt'];
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
// Encoders of « Exporter le son »: LAME (LGPL-2.1+), libFLAC (BSD-3-Clause) and the wasm wrappers (MIT).
const ENCODERS_DIR = path.resolve(here, 'src/export/audio/encoders');
const ENCODER_LICENCES = ['LICENSE-lame.txt', 'LICENSE-wasm-media-encoders.txt', 'LICENSE-libflac.txt', 'LICENSE-audio-encode-flac.txt'];
// Lot 4, the web app offline (PWA): the hand-written service worker, filled in at build time, the icons
// (made from the brand by src/assets/icons/make-icons.mjs) and the manifest. Web build only: the Mac app
// serves its pages from the disk and has no service worker.
const PWA_DIR = path.resolve(here, 'src/pwa');
const ICONS_DIR = path.resolve(here, 'src/assets/icons');
const ICONS = ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];
// Kept on first use rather than with each version: ONNX Runtime's WebAssembly (15 MB, and 29 MB for the
// graphics chip) and the detailed chord model's graph. Everything else (about 3 MB) comes with the version.
const LAZY_ASSET = /(^|\/)ort-wasm-.*\.wasm$|\.onnx$/;
const MANIFEST = {
  name: 'Fabtice',
  short_name: 'Fabtice',
  description: 'Un outil de travail pour musiciens : boucles, tonalité, tempo, grille d’accords.',
  lang: 'fr',
  start_url: './',
  scope: './',
  display: 'standalone',
  background_color: '#f4ecdf',
  theme_color: '#f4ecdf',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

/** Writes the manifest, the icons and the service worker next to the built page (web build). */
function writePwaFiles(outDir: string, files: string[]): void {
  for (const icon of ICONS) copyFileSync(path.join(ICONS_DIR, icon), path.join(outDir, icon));
  writeFileSync(path.join(outDir, 'manifest.webmanifest'), JSON.stringify(MANIFEST, null, 2));
  const own = ['index.html', 'manifest.webmanifest', ...ICONS];
  const assets = files.filter((f) => f.startsWith('assets/')).sort();
  const precache = [...own, ...assets.filter((f) => !LAZY_ASSET.test(f))];
  // The version: what the page and its files are (their names carry their hash; the page is hashed whole).
  const version = createHash('sha256')
    .update(readFileSync(path.join(outDir, 'index.html')))
    .update(assets.join('\n'))
    .digest('hex')
    .slice(0, 16);
  const sw = readFileSync(path.join(PWA_DIR, 'sw.js'), 'utf8')
    .replace("'__VERSION__'", JSON.stringify(version))
    .replace('__PRECACHE__', JSON.stringify(precache))
    .replace('__ASSETS__', JSON.stringify(assets));
  writeFileSync(path.join(outDir, 'sw.js'), sw);
}

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
        for (const f of ['sw.js', 'manifest.webmanifest', ...ICONS]) rmSync(path.join(WEB_OUT, f), { force: true });
      }
    },
    generateBundle() {
      for (const name of FONT_LICENCES) {
        this.emitFile({ type: 'asset', fileName: `assets/${name}`, source: readFileSync(path.join(FONTS, name)) });
      }
      for (const name of WASM_LICENCES) {
        this.emitFile({ type: 'asset', fileName: `assets/${name}`, source: readFileSync(path.join(WASM_DIR, name)) });
      }
      for (const name of RENDER_LICENCES) {
        this.emitFile({ type: 'asset', fileName: `assets/${name}`, source: readFileSync(path.join(RENDER_DIR, name)) });
      }
      for (const name of ENCODER_LICENCES) {
        this.emitFile({ type: 'asset', fileName: `assets/${name}`, source: readFileSync(path.join(ENCODERS_DIR, name)) });
      }
      this.emitFile({ type: 'asset', fileName: `assets/${ORT_LICENCE}`, source: readFileSync(path.join(ANALYSIS_DIR, ORT_LICENCE)) });
    },
    writeBundle(options, bundle) {
      if (mode !== 'desktop' && options.dir) writePwaFiles(options.dir, Object.keys(bundle));
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        if (!ctx.bundle) return [];
        const fonts = Object.keys(ctx.bundle)
          .filter((file) => PRELOADED_FONTS.test(path.basename(file)))
          .map((file) => ({
            tag: 'link',
            attrs: { rel: 'preload', href: `./${file}`, as: 'font', type: 'font/woff2', crossorigin: '' },
            injectTo: 'head' as const,
          }));
        if (mode === 'desktop') return fonts;
        const pwa = [
          { tag: 'link', attrs: { rel: 'manifest', href: './manifest.webmanifest' }, injectTo: 'head' as const },
          { tag: 'link', attrs: { rel: 'apple-touch-icon', href: './apple-touch-icon.png' }, injectTo: 'head' as const },
          { tag: 'link', attrs: { rel: 'icon', type: 'image/png', sizes: '192x192', href: './icon-192.png' }, injectTo: 'head' as const },
        ];
        return [...fonts, ...pwa];
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
