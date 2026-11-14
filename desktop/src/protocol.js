'use strict';

// Custom protocol that serves the interface (ui/) and the diagnostic page
// (src/renderer/) from inside the app. file:// cannot be used: the interface
// needs cross-origin isolation (SharedArrayBuffer, AudioWorklet), which needs
// COOP/COEP response headers.
//
//   fabtice://app/...         the real interface (desktop/ui/)
//   fabtice://diagnostic/...  the prototype page kept as a diagnostic window

const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');

const SCHEME = 'fabtice';
const HOST_APP = 'app';
const HOST_DIAGNOSTIC = 'diagnostic';
const APP_URL = `${SCHEME}://${HOST_APP}/index.html`;
const DIAGNOSTIC_URL = `${SCHEME}://${HOST_DIAGNOSTIC}/index.html`;

// Self scripts and styles, WebAssembly, inline styles (React sets style
// attributes), blob: for media and workers. The network is reachable for one
// thing only: the analysis tools (models) the interface downloads at first
// use, from their public repositories on Hugging Face (checked against their
// SHA-256 by the interface). `huggingface.co` answers with a redirect to
// Hugging Face's own content network, `us.aws.cdn.hf.co` as observed (the first
// label is the region of the server, hence the wildcard on that one label of
// the domain `cdn.hf.co`); the policy is checked on every hop of a redirect.
// The separation tools come from the same hub. One more address: the list of
// separation tools (`app/src/separation/models.json`), read at launch from the
// project's public repository on GitHub (`raw.githubusercontent.com`), so that
// a tool can be withdrawn without a new version of the app; the interface
// checks it strictly and keeps its bundled copy if it cannot be had.
// Nothing else is allowed: no other host, no plain http.
const MODEL_HOSTS = ['https://huggingface.co', 'https://*.cdn.hf.co'];
const LIST_HOSTS = ['https://raw.githubusercontent.com'];
const CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  `connect-src 'self' blob: ${[...MODEL_HOSTS, ...LIST_HOSTS].join(' ')}`,
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function mimeFor(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

function headersFor(file) {
  return {
    'Content-Type': mimeFor(file),
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  };
}

function plain(status, text) {
  return new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } });
}

// Maps a request URL to a file inside one of the roots, or returns the HTTP
// status to answer with. Never leaves the root, even through symlinks.
// `roots` maps a host name to an absolute folder.
function resolveRequest(rawUrl, roots) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { status: 400 };
  }
  if (url.protocol !== `${SCHEME}:`) return { status: 400 };
  const rootDir = Object.prototype.hasOwnProperty.call(roots, url.hostname) ? roots[url.hostname] : null;
  if (!rootDir) return { status: 404 };

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return { status: 400 };
  }
  if (pathname.includes('\0') || pathname.includes('\\')) return { status: 400 };
  if (pathname.split('/').includes('..')) return { status: 403 };
  if (pathname === '/' || pathname === '') pathname = '/index.html';

  const root = path.resolve(rootDir);
  const candidate = path.resolve(root, `.${pathname}`);
  if (candidate !== root && !candidate.startsWith(root + path.sep)) return { status: 403 };

  let real;
  try {
    real = fs.realpathSync(candidate);
    const realRoot = fs.realpathSync(root);
    if (real !== realRoot && !real.startsWith(realRoot + path.sep)) return { status: 403 };
    if (!fs.statSync(real).isFile()) return { status: 404 };
  } catch {
    return { status: 404 };
  }
  return { status: 200, file: real };
}

function respond(rawUrl, roots, method = 'GET') {
  if (method !== 'GET' && method !== 'HEAD') return plain(405, 'Method not allowed');
  const found = resolveRequest(rawUrl, roots);
  if (found.status !== 200) {
    return plain(found.status, found.status === 404 ? 'Not found' : found.status === 403 ? 'Forbidden' : 'Bad request');
  }
  const headers = headersFor(found.file);
  headers['Content-Length'] = String(fs.statSync(found.file).size);
  if (method === 'HEAD') return new Response(null, { status: 200, headers });
  return new Response(Readable.toWeb(fs.createReadStream(found.file)), { status: 200, headers });
}

// IPC sender check: only our two pages, on their exact origin.
function isTrustedUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === `${SCHEME}:` && (url.hostname === HOST_APP || url.hostname === HOST_DIAGNOSTIC) && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}

// Must run before app.whenReady().
function registerScheme(protocol) {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);
}

function installHandler(protocol, roots) {
  protocol.handle(SCHEME, (request) => respond(request.url, roots, request.method));
}

module.exports = {
  SCHEME, HOST_APP, HOST_DIAGNOSTIC, APP_URL, DIAGNOSTIC_URL, CSP, MODEL_HOSTS, LIST_HOSTS,
  mimeFor, resolveRequest, respond, isTrustedUrl, registerScheme, installHandler,
};
