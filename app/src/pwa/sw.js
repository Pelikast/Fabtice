// Fabtice — the web app's service worker (lot 4: the app opens and plays a
// kept piece with no network). Written by hand, filled in by the build
// (`vite.config.ts`, `pwaFiles`): VERSION, PRECACHE and ASSETS below.
//
// Rules (app/README.md, « Hors ligne ») :
//   - only the app's own files are touched: the page (`./`, `index.html`), its
//     `assets/`, the manifest and the icons. Everything else goes to the network
//     untouched: the mockup and the spikes next to the app, the remote lists of
//     tools and collections, the tools downloaded from Hugging Face (they live in
//     IndexedDB, not here);
//   - the page: network first (a few seconds at most), then the copy kept with
//     this version. A new version is never kept from being seen: as soon as the
//     network answers, the page is the newest one;
//   - assets: their names carry a hash, so a kept copy is always right: kept
//     copy first, else the network, then kept. The small ones come with the
//     version (`PRECACHE`); the big ONNX Runtime WebAssembly files (15 and 29 MB)
//     and the detailed chord model's graph are kept on first use only;
//   - every answer given from here carries the isolation headers (COOP/COEP):
//     without them the audio engine loses its shared memory;
//   - a new version installs quietly and takes over at the next launch (when
//     no page of the old one is open any more); the old one's copies are then
//     dropped, except the big files the new version still names.

const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const ASSETS = __ASSETS__;

const SHELL_CACHE = `fabtice-app-${VERSION}`;
/** Shared across versions: files kept on first use; pruned to what the active version names. */
const LAZY_CACHE = 'fabtice-assets';
const NAVIGATION_TIMEOUT_MS = 4000;

const scope = new URL(self.registration.scope);
const OWN = new Set(['', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']);

/** The path of a request inside the app's scope, or null when it is not one of the app's files. */
function ownPath(url) {
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return null;
  const rest = url.pathname.slice(scope.pathname.length);
  return OWN.has(rest) || rest.startsWith('assets/') ? rest : null;
}

/** The same answer, with the isolation headers the audio engine needs. */
function isolated(response) {
  if (!response || response.type === 'opaque' || response.type === 'opaqueredirect') return response;
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // `reload`: never a copy from the browser's HTTP cache, which could be older than this version.
      await cache.addAll(PRECACHE.map((p) => new Request(new URL(p, scope).href, { cache: 'reload' })));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('fabtice-app-') && name !== SHELL_CACHE) await caches.delete(name);
      }
      const lazy = await caches.open(LAZY_CACHE);
      const wanted = new Set(ASSETS.map((p) => new URL(p, scope).href));
      for (const request of await lazy.keys()) if (!wanted.has(request.url)) await lazy.delete(request);
      await self.clients.claim();
    })(),
  );
});

async function fromShell(path) {
  const cache = await caches.open(SHELL_CACHE);
  return cache.match(new URL(path, scope).href);
}

async function navigation(request) {
  const network = fetch(request).then((r) => (r.ok ? r : Promise.reject(new Error(`status ${r.status}`))));
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NAVIGATION_TIMEOUT_MS));
  try {
    const response = await Promise.race([network, timeout]);
    // The newest page, kept for the next time there is no network.
    const copy = response.clone();
    void caches.open(SHELL_CACHE).then((c) => c.put(new URL('index.html', scope).href, copy)).catch(() => {});
    return isolated(response);
  } catch {
    const kept = await fromShell('index.html');
    if (kept) return isolated(kept);
    return isolated(await network);
  }
}

async function asset(request, path) {
  const kept = (await fromShell(path)) || (await (await caches.open(LAZY_CACHE)).match(request.url));
  if (kept) return isolated(kept);
  const response = await fetch(request);
  if (response.ok && response.type === 'basic' && ASSETS.includes(path)) {
    // Read whole once (15 or 29 MB, once per version of the file), then kept and given to the page: a big
    // body streamed into the cache, or read as a Blob, fails in Chromium (measured: « network error »).
    const bytes = await response.arrayBuffer();
    const headers = { 'Content-Type': response.headers.get('content-type') || 'application/octet-stream' };
    void caches
      .open(LAZY_CACHE)
      .then((c) => c.put(request.url, new Response(bytes.slice(0), { status: 200, headers })))
      .catch(() => {});
    return isolated(new Response(bytes, { status: 200, headers }));
  }
  return isolated(response);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const path = ownPath(url);
  if (path === null) return;
  if (request.mode === 'navigate') {
    // Only the app's page (any query: `?demo`, `?debug`…); the mockup and the spikes are not ours.
    if (path === '' || path === 'index.html') event.respondWith(navigation(request));
    return;
  }
  // A range request (media) is left to the network: the kept copies are whole files.
  if (request.headers.has('range')) return;
  event.respondWith(path === '' || path === 'index.html' ? navigation(request) : asset(request, path === '' ? 'index.html' : path));
});
