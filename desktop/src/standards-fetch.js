'use strict';

// Download of the chart collections (« recueils » of standards) for the interface.
// A page cannot read another site, so the main process does the GET and hands the
// text back. What it will fetch is deliberately narrow:
//
//   - https only, no credentials, no port, no fragment;
//   - the host must be in a fixed list (the same hosts as `COLLECTION_HOSTS` in
//     app/src/standards/collections.ts; test/unit/standards-fetch.test.js pins the two
//     lists against each other);
//   - redirects are followed by hand, at most MAX_REDIRECTS, and only to allowed hosts;
//   - the body is capped (MAX_BYTES) while it is read, and the whole call has a timeout;
//   - no cookies, no credentials, a plain generic user agent.
//
// It answers with data, never throws: `{ ok: true, text, url, bytes }` or
// `{ ok: false, error, status? }` where `error` is one of ERRORS.

const ALLOWED_HOSTS = ['www.irealpro.com', 'irealpro.com', 'forums.irealpro.com', 'www.irealb.com', 'irealb.com', 'raw.githubusercontent.com'];
const MAX_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 60_000;
const MAX_REDIRECTS = 5;
const USER_AGENT = 'Fabtice';
const TEST_ORIGIN_ENV = 'FABTICE_STANDARDS_TEST_ORIGIN';

const ERRORS = ['invalid-url', 'host-not-allowed', 'redirect', 'http', 'too-large', 'timeout', 'network'];

/** @returns {{ ok: true, url: URL } | { ok: false, error: string }} */
function checkUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2000) return { ok: false, error: 'invalid-url' };
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

/**
 * Test seam: when FABTICE_STANDARDS_TEST_ORIGIN is set (an `http://127.0.0.1:port` address) AND the
 * window is held for a test (FABTICE_HOLD_WINDOW=1, like every other seam), the request of an allowed
 * host goes to that server instead, at `/<host><path>`. The allowlist is checked on the real address first.
 */
function testOrigin(env) {
  const origin = env[TEST_ORIGIN_ENV];
  if (env.FABTICE_HOLD_WINDOW !== '1' || typeof origin !== 'string' || !/^http:\/\/(?:127\.0\.0\.1|localhost):\d{2,5}$/.test(origin)) return null;
  return origin;
}

/** Reads the body as UTF-8 text, giving up past `maxBytes`. */
async function readCapped(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return { tooLarge: true };
  if (!response.body) {
    const text = await response.text();
    return text.length > maxBytes ? { tooLarge: true } : { text, bytes: text.length };
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return { tooLarge: true };
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return { text: new TextDecoder('utf-8').decode(all), bytes: total };
}

/**
 * @param {string} value the address asked by the interface
 * @param {{ fetchImpl: typeof fetch, env?: Record<string, string | undefined>, maxBytes?: number, timeoutMs?: number }} options
 */
async function fetchStandardsText(value, options) {
  const { fetchImpl } = options;
  const env = options.env ?? process.env;
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  const first = checkUrl(value);
  if (!first.ok) return { ok: false, error: first.error };
  const fake = testOrigin(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);
  try {
    let url = first.url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const target = fake ? `${fake}/${url.hostname}${url.pathname}${url.search}` : url.href;
      const response = await fetchImpl(target, {
        method: 'GET',
        redirect: 'manual',
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,text/plain;q=0.9,*/*;q=0.5' },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return { ok: false, error: 'redirect', status: response.status };
        let next;
        try {
          next = new URL(location, url);
        } catch {
          return { ok: false, error: 'redirect', status: response.status };
        }
        const checked = checkUrl(next.href);
        if (!checked.ok) return { ok: false, error: checked.error === 'host-not-allowed' ? 'host-not-allowed' : 'redirect', status: response.status };
        await response.body?.cancel().catch(() => {});
        url = checked.url;
        continue;
      }
      if (response.status === 0) return { ok: false, error: 'redirect' };
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        return { ok: false, error: 'http', status: response.status };
      }
      const body = await readCapped(response, maxBytes);
      if (body.tooLarge) return { ok: false, error: 'too-large' };
      return { ok: true, text: body.text, url: url.href, bytes: body.bytes };
    }
    return { ok: false, error: 'redirect' };
  } catch (e) {
    if (controller.signal.aborted) return { ok: false, error: 'timeout' };
    return { ok: false, error: 'network', detail: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A `fetch`-shaped function over Electron's `net.request`, for what `fetchStandardsText` needs: no
 * cookies, no credentials, and redirects NOT followed (a 3xx comes back as a response with its
 * `location`, so that the caller checks the next host itself). Electron's own `net.fetch` cannot do
 * that: with `redirect: 'manual'` it cancels the request at the first redirect.
 *
 * @param {{ request: (options: object) => any }} net Electron's `net` module
 * @returns {typeof fetch}
 */
function electronFetch(net) {
  return (url, init = {}) =>
    new Promise((resolve, reject) => {
      const signal = init.signal;
      if (signal && signal.aborted) return reject(new DOMException('aborted', 'AbortError'));
      const request = net.request({ url: String(url), method: 'GET', redirect: 'manual', credentials: 'omit', useSessionCookies: false });
      for (const [name, value] of Object.entries(init.headers || {})) request.setHeader(name, value);
      const onAbort = () => {
        request.abort();
        reject(new DOMException('aborted', 'AbortError'));
      };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      const done = () => signal && signal.removeEventListener('abort', onAbort);
      const toHeaders = (raw) => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(raw || {})) {
          for (const v of Array.isArray(value) ? value : [value]) headers.append(name, String(v));
        }
        return headers;
      };
      request.on('redirect', (statusCode, _method, redirectUrl, responseHeaders) => {
        const headers = toHeaders(responseHeaders);
        headers.set('location', redirectUrl);
        request.abort(); // the caller decides whether to follow it
        done();
        resolve(new Response(null, { status: statusCode >= 300 && statusCode < 400 ? statusCode : 302, headers }));
      });
      request.on('response', (res) => {
        const body = new ReadableStream({
          start(controller) {
            res.on('data', (chunk) => controller.enqueue(new Uint8Array(chunk)));
            res.on('end', () => {
              done();
              controller.close();
            });
            res.on('error', (e) => controller.error(e));
            res.on('aborted', () => controller.error(new Error('aborted')));
          },
          cancel() {
            request.abort();
          },
        });
        const status = res.statusCode >= 200 && res.statusCode <= 599 ? res.statusCode : 502;
        resolve(new Response(status === 204 || status === 205 || status === 304 ? null : body, { status, headers: toHeaders(res.headers) }));
      });
      request.on('error', (e) => {
        done();
        reject(e);
      });
      request.end();
    });
}

module.exports = { electronFetch, fetchStandardsText, checkUrl, ALLOWED_HOSTS, MAX_BYTES, MAX_REDIRECTS, ERRORS, TEST_ORIGIN_ENV };
