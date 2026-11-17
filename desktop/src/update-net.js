'use strict';

// The network side of the automatic update (C16): the version file and the archive, fetched by the
// main process (never by the page), on a closed list of hosts.
//
//   - https only, no credentials, no port, no fragment; no cookies, a plain generic user agent;
//   - the first address is always the project's release on github.com; GitHub answers a release
//     asset with a redirect to its storage host: `objects.githubusercontent.com` (seen on 17 November
//     2026) or `release-assets.githubusercontent.com` (used by GitHub in 2025, still possible).
//     Redirects are followed by hand, at most MAX_REDIRECTS, and every hop is checked against the list;
//   - sizes are capped while reading; the archive must have exactly the size the version file gives,
//     and its SHA-256 is computed while it is written;
//   - a call can be cancelled, and gives up when nothing arrives for STALL_MS.
//
// The test address. FABTICE_UPDATE_TEST_ORIGIN replaces the network by a local server, only for the
// tests, and only when all of this holds:
//   - FABTICE_HOLD_WINDOW=1 is set too: the switch every end-to-end test of the app already uses (the
//     app then waits for the test to open its first window; nobody runs Fabtice like that);
//   - the value is `http://127.0.0.1:<port>`, `http://localhost:<port>` or `http://[::1]:<port>`:
//     loopback only, which is why plain http is then allowed.
// The hosts are still checked on the real addresses first; the request then goes to
// `<origin>/<host><path>` (the same rule as FABTICE_STANDARDS_TEST_ORIGIN in standards-fetch.js).

const crypto = require('node:crypto');
const fs = require('node:fs');

const VERSION_FILE_URL = 'https://github.com/pelikast/fabtice/releases/latest/download/fabtice-version.json';
const ALLOWED_HOSTS = ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'];
const MAX_REDIRECTS = 5;
const MAX_VERSION_FILE_BYTES = 128 * 1024;
const VERSION_TIMEOUT_MS = 30_000;
const STALL_MS = 60_000;
const USER_AGENT = 'Fabtice';
const TEST_ORIGIN_ENV = 'FABTICE_UPDATE_TEST_ORIGIN';

/** @returns {{ ok: true, url: URL } | { ok: false, error: 'invalid-url' | 'host-not-allowed' }} */
function checkUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4000) return { ok: false, error: 'invalid-url' };
  let url;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: 'invalid-url' };
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '' || url.hash !== '') return { ok: false, error: 'invalid-url' };
  if (!ALLOWED_HOSTS.includes(url.hostname)) return { ok: false, error: 'host-not-allowed' };
  return { ok: true, url };
}

/** The test server, or null (see the rule above). */
function testOrigin(env = process.env) {
  const origin = env[TEST_ORIGIN_ENV];
  if (env.FABTICE_HOLD_WINDOW !== '1' || typeof origin !== 'string') return null;
  return /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d{2,5}$/.test(origin) ? origin : null;
}

/** Where a checked address is really asked: itself, or the test server. */
function targetOf(url, fake) {
  return fake ? `${fake}/${url.hostname}${url.pathname}${url.search}` : url.href;
}

class NetError extends Error {
  /** @param {'invalid-url'|'host-not-allowed'|'redirect'|'http'|'too-large'|'timeout'|'network'|'cancelled'|'size'} code */
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
    this.detail = detail;
    this.status = undefined;
  }
}

/**
 * GET with the redirects followed by hand: resolves the final response (2xx) and its address.
 * @param {string} value
 * @param {{ fetchImpl: typeof fetch, env?: object, signal: AbortSignal, accept: string }} options
 */
async function getFollowing(value, { fetchImpl, env, signal, accept }) {
  const first = checkUrl(value);
  if (!first.ok) throw new NetError(first.error);
  const fake = testOrigin(env);
  let url = first.url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetchImpl(targetOf(url, fake), {
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      cache: 'no-store',
      signal,
      headers: { 'User-Agent': USER_AGENT, Accept: accept },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => {});
      if (!location) throw new NetError('redirect');
      let next;
      try {
        next = new URL(location, url);
      } catch {
        throw new NetError('redirect');
      }
      const checked = checkUrl(next.href);
      if (!checked.ok) throw new NetError(checked.error === 'host-not-allowed' ? 'host-not-allowed' : 'redirect', next.hostname);
      url = checked.url;
      continue;
    }
    if (response.status === 0) throw new NetError('redirect');
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      const error = new NetError('http', String(response.status));
      error.status = response.status;
      throw error;
    }
    return { response, url: url.href };
  }
  throw new NetError('redirect', 'too many');
}

/**
 * The version file's text. Resolves `{ ok: true, text }` or `{ ok: false, error, status? }`; never throws.
 * @param {{ fetchImpl: typeof fetch, env?: object, url?: string, timeoutMs?: number, signal?: AbortSignal }} options
 */
async function fetchVersionFile(options) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? VERSION_TIMEOUT_MS);
  try {
    const { response } = await getFollowing(options.url ?? VERSION_FILE_URL, { ...options, signal: controller.signal, accept: 'application/json, application/octet-stream;q=0.9, */*;q=0.5' });
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_VERSION_FILE_BYTES) {
      await response.body?.cancel().catch(() => {});
      return { ok: false, error: 'too-large' };
    }
    const chunks = [];
    let total = 0;
    if (response.body) {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_VERSION_FILE_BYTES) {
          await reader.cancel().catch(() => {});
          return { ok: false, error: 'too-large' };
        }
        chunks.push(value);
      }
    }
    return { ok: true, text: Buffer.concat(chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength))).toString('utf8') };
  } catch (e) {
    if (options.signal?.aborted) return { ok: false, error: 'cancelled' };
    if (controller.signal.aborted) return { ok: false, error: 'timeout' };
    if (e instanceof NetError) return { ok: false, error: e.code, ...(e.status ? { status: e.status } : {}) };
    return { ok: false, error: 'network', detail: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Downloads the archive to `file` (created new, never an existing file), computing its SHA-256 on the way.
 * Resolves `{ ok: true, bytes, sha256 }` or `{ ok: false, error }` (error `size` when the server sends
 * more or less than `size`; `cancelled` on `signal`; `timeout` when nothing arrives for `stallMs`). A file
 * left by a failure is removed. Never throws.
 * @param {{ url: string, size: number, file: string, fetchImpl: typeof fetch, env?: object, signal?: AbortSignal,
 *   onProgress?: (p: { received: number, total: number }) => void, stallMs?: number }} options
 */
async function downloadArchive(options) {
  const { url, size, file } = options;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (options.signal?.aborted) return { ok: false, error: 'cancelled' };
  options.signal?.addEventListener('abort', onAbort, { once: true });
  const stallMs = options.stallMs ?? STALL_MS;
  let stalled = false;
  let stallTimer = null;
  const arm = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      stalled = true;
      controller.abort();
    }, stallMs);
  };
  let out = null;
  let created = false;
  try {
    arm();
    const { response } = await getFollowing(url, { ...options, signal: controller.signal, accept: 'application/zip, application/octet-stream;q=0.9, */*;q=0.5' });
    const declared = response.headers.get('content-length');
    if (declared !== null && Number(declared) !== size) {
      await response.body?.cancel().catch(() => {});
      throw new NetError('size', `declared ${declared}`);
    }
    if (!response.body) throw new NetError('size', 'no body');
    // `wx`: a new file only (the folder is made fresh for this download).
    out = fs.createWriteStream(file, { flags: 'wx', mode: 0o600 });
    const opened = new Promise((resolve, reject) => {
      out.once('open', resolve);
      out.once('error', reject);
    });
    await opened;
    created = true;
    const hash = crypto.createHash('sha256');
    const reader = response.body.getReader();
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      arm();
      received += value.byteLength;
      if (received > size) {
        await reader.cancel().catch(() => {});
        throw new NetError('size', 'more than announced');
      }
      const chunk = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
      hash.update(chunk);
      if (!out.write(chunk)) await new Promise((resolve, reject) => {
        out.once('drain', resolve);
        out.once('error', reject);
      });
      options.onProgress?.({ received, total: size });
    }
    if (received !== size) throw new NetError('size', `received ${received}`);
    await new Promise((resolve, reject) => {
      out.end((e) => (e ? reject(e) : resolve()));
    });
    out = null;
    return { ok: true, bytes: received, sha256: hash.digest('hex') };
  } catch (e) {
    let error;
    if (options.signal?.aborted) error = 'cancelled';
    else if (stalled) error = 'timeout';
    else if (e instanceof NetError) error = e.code;
    else if (e && (e.code === 'ENOSPC' || e.code === 'EDQUOT')) error = 'disk-full';
    else if (e && typeof e.code === 'string' && e.code.startsWith('E')) error = 'write';
    else error = 'network';
    if (out) {
      const stream = out;
      if (!stream.closed) await new Promise((r) => {
        stream.once('close', r);
        stream.destroy();
      });
    }
    // Only a file this call made: an existing one (`wx` refused it) is not touched.
    if (created) await fs.promises.rm(file, { force: true }).catch(() => {});
    return { ok: false, error, detail: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(stallTimer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

/** SHA-256 of a whole file, as 64 hex characters. */
function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(file)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')));
  });
}

module.exports = {
  VERSION_FILE_URL,
  ALLOWED_HOSTS,
  MAX_REDIRECTS,
  TEST_ORIGIN_ENV,
  NetError,
  checkUrl,
  testOrigin,
  getFollowing,
  fetchVersionFile,
  downloadArchive,
  sha256File,
};
