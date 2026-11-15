// Lot 4, the web app offline (PWA), in Chromium with a persistent profile:
//   1. first visit (`?horsligne&debug`: the service worker is registered on a
//      page served from this machine only when asked; the REAL audio engine):
//      the worker installs and controls the page; the app's own small files are
//      kept, the big ONNX Runtime WebAssembly files are NOT (kept on first use);
//   2. a piece of a few MB is imported, kept on the device;
//   3. no network (`context.setOffline(true)`), reload: the app opens, is
//      cross-origin isolated (the audio engine's shared memory), the kept piece
//      comes back and PLAYS (the real engine's position moves);
//   4. a file the app downloads on first use (one of the big WebAssembly files,
//      fetched while online) is then kept, and served offline with the isolation
//      headers; the mockup next to the app is not touched by the worker;
//   5. back online, a new version of the page on the server is the one shown
//      at the next load (never a stale page for ever);
//   6. the manifest and its icons.
//   npm run build && npm run test:offline
// Screenshots in $FABTICE_OFFLINE_OUT (default: a temporary folder).

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, '../../web');
const out = process.env.FABTICE_OFFLINE_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-offline-'));
fs.mkdirSync(out, { recursive: true });

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A 16-bit stereo WAV of `seconds`, a slowly changing chord: a few MB, not trivially small. */
function writeWav(file, seconds) {
  const rate = 44100;
  const frames = Math.round(seconds * rate);
  const data = Buffer.alloc(frames * 4);
  for (let i = 0; i < frames; i++) {
    const t = i / rate;
    const env = 0.5 + 0.4 * Math.sin(2 * Math.PI * 0.25 * t);
    data.writeInt16LE(Math.round(env * 0.4 * Math.sin(2 * Math.PI * 220 * t) * 32767), i * 4);
    data.writeInt16LE(Math.round(env * 0.4 * Math.sin(2 * Math.PI * 330 * t) * 32767), i * 4 + 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(2, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 4, 28);
  head.writeUInt16LE(4, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([head, data]));
  return head.length + data.length;
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-offline-work-'));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-offline-profile-'));
const wav = path.join(work, 'Hors ligne.wav');
const wavBytes = writeWav(wav, 30);
const indexPath = path.join(web, 'index.html');
const indexBefore = fs.readFileSync(indexPath, 'utf8');

const { srv, url } = await startServer(0);
const context = await chromium.launchPersistentContext(profile, { args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'], viewport: { width: 1280, height: 800 } });
const errors = [];
const page = context.pages()[0] ?? (await context.newPage());
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const address = `${url}/?horsligne&debug`;

try {
  // 1. First visit.
  await page.goto(address);
  await page.waitForFunction(() => window.__fabtice, null, { timeout: 30000 });
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 30000 });
  check('the service worker is installed and controls the page', true);
  const kept = await page.evaluate(async () => {
    const out = {};
    for (const name of await caches.keys()) out[name] = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname);
    return out;
  });
  const shell = Object.entries(kept).find(([n]) => n.startsWith('fabtice-app-'));
  const shellFiles = shell ? shell[1] : [];
  check('the page, its scripts, styles, fonts and engine are kept with the version', ['/index.html', '/manifest.webmanifest', '/icon-192.png'].every((p) => shellFiles.includes(p)) && shellFiles.some((p) => /\/assets\/index-.*\.js$/.test(p)) && shellFiles.some((p) => /\.woff2$/.test(p)) && shellFiles.some((p) => /signalsmith.*\.wasm$/.test(p)), `${shellFiles.length} files`);
  check('the big ONNX Runtime WebAssembly files are not kept at the first visit', !Object.values(kept).flat().some((p) => /ort-wasm-.*\.wasm$/.test(p)), JSON.stringify(Object.values(kept).flat().filter((p) => /wasm/.test(p))));
  check('nothing from another site is kept', Object.values(kept).flat().every((p) => p.startsWith('/')));
  check('the page is cross-origin isolated online', await page.evaluate(() => crossOriginIsolated));

  // 2. A piece of a few MB, kept on the device.
  await page.locator('.accueil input[type="file"]').setInputFiles(wav);
  await page.waitForFunction(() => {
    const s = window.__fabtice.store.getState();
    return s.project && s.transport.engine === 'ready' && s.ui.import.kind === 'idle';
  }, null, { timeout: 60000 });
  const engineKind = await page.evaluate(() => window.__fabtice.engine.constructor.name);
  check('the real audio engine plays here', !/Mock/.test(engineKind), engineKind);
  const projectId = await page.evaluate(() => window.__fabtice.store.getState().project.id);
  await sleep(1500);

  // 4 (first half): a big file asked for while online is kept on first use.
  // The smaller of the two (15 MB): the one the analysis loads.
  const lazy = fs
    .readdirSync(path.join(web, 'assets'))
    .filter((f) => /^ort-wasm-.*\.wasm$/.test(f))
    .sort((x, y) => fs.statSync(path.join(web, 'assets', x)).size - fs.statSync(path.join(web, 'assets', y)).size)[0];
  await page.evaluate(async (p) => {
    const r = await fetch(p);
    await r.arrayBuffer();
  }, `./assets/${lazy}`);
  await sleep(1500);
  const lazyKept = await page.evaluate(async () => {
    const c = await caches.open('fabtice-assets');
    return (await c.keys()).map((r) => new URL(r.url).pathname);
  });
  check('a big file asked for online is kept on first use', lazyKept.includes(`/assets/${lazy}`), JSON.stringify(lazyKept));

  // 3. Offline.
  await context.setOffline(true);
  const reachable = await page.evaluate(() => fetch(`/manifest.webmanifest?${Date.now()}`, { cache: 'no-store' }).then(() => 'answered', () => 'no network'));
  await page.reload();
  await page.waitForFunction(() => window.__fabtice, null, { timeout: 30000 });
  check('offline, the app opens', (await page.title()) === 'Fabtice', reachable);
  check('offline, the page is cross-origin isolated (shared memory for the audio engine)', await page.evaluate(() => crossOriginIsolated && typeof SharedArrayBuffer === 'function'));
  await page.waitForFunction((id) => {
    const s = window.__fabtice.store.getState();
    return s.project && s.project.id === id && s.transport.engine === 'ready' && !s.ui.newPieceOpen;
  }, projectId, { timeout: 60000 });
  check('offline, the kept piece comes back', true);
  const p0 = await page.evaluate(() => window.__fabtice.engine.getPosition());
  await page.evaluate(() => window.__fabtice.actions.play());
  await sleep(1500);
  const playing = await page.evaluate(() => ({ state: window.__fabtice.store.getState().transport.engine, position: window.__fabtice.engine.getPosition() }));
  await page.evaluate(() => window.__fabtice.actions.pause());
  check('offline, the kept piece plays (the real engine moves on)', playing.state === 'playing' && playing.position > p0 + 0.5, JSON.stringify({ p0, ...playing }));
  await page.screenshot({ path: path.join(out, 'hors-ligne.png') });

  // 4 (second half): the big file, kept on first use, comes from the worker offline, with the isolation headers.
  const lazyOffline = await page.evaluate(async (p) => {
    try {
      const r = await fetch(p);
      return { ok: r.ok, bytes: (await r.arrayBuffer()).byteLength, coep: r.headers.get('cross-origin-embedder-policy'), coop: r.headers.get('cross-origin-opener-policy') };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }, `./assets/${lazy}`);
  check('a big file kept on first use is served offline, with the isolation headers', lazyOffline.ok && lazyOffline.bytes === fs.statSync(path.join(web, 'assets', lazy)).size && lazyOffline.coep === 'require-corp' && lazyOffline.coop === 'same-origin', JSON.stringify(lazyOffline));
  const mockup = await page.evaluate(() => fetch('./maquette/index.html').then((r) => `status ${r.status}`, () => 'no network'));
  check('the mockup next to the app is not served by the worker', mockup === 'no network', mockup);
  check('no page errors offline', errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|net::ERR/.test(e)).length === 0, errors.join(' | '));

  // 5. Back online: a new version of the page is shown at the next load.
  await context.setOffline(false);
  fs.writeFileSync(indexPath, indexBefore.replace('</head>', '<meta name="fabtice-essai" content="nouvelle-version"></head>'));
  await page.reload();
  await page.waitForFunction(() => window.__fabtice, null, { timeout: 30000 });
  check('online, the newest page is shown at the next load (no stale page)', (await page.evaluate(() => document.querySelector('meta[name="fabtice-essai"]')?.getAttribute('content'))) === 'nouvelle-version');
  fs.writeFileSync(indexPath, indexBefore);

  // 6. The manifest and its icons.
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    const m = await (await fetch(link.href)).json();
    const icons = await Promise.all(m.icons.map(async (i) => ({ ...i, ok: (await fetch(new URL(i.src, link.href))).ok })));
    const touch = document.querySelector('link[rel="apple-touch-icon"]');
    return { name: m.name, display: m.display, start: m.start_url, colour: m.background_color, icons, touch: touch ? (await fetch(touch.href)).ok : false };
  });
  check('the manifest: name, standalone, paper colour, icons that load', manifest.name === 'Fabtice' && manifest.display === 'standalone' && manifest.colour === '#f4ecdf' && manifest.icons.length === 3 && manifest.icons.every((i) => i.ok) && manifest.icons.some((i) => i.purpose === 'maskable') && manifest.touch, JSON.stringify(manifest));
  console.log(`(piece of ${(wavBytes / 1e6).toFixed(1)} MB; screenshots in ${out})`);
} finally {
  fs.writeFileSync(indexPath, indexBefore);
  await context.close();
  srv.close();
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(profile, { recursive: true, force: true });
}

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall offline checks passed');
