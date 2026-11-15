'use strict';

// The main process's download of chart collections: a fixed list of hosts, https only, redirects
// followed by hand and only to allowed hosts, a size cap, a timeout. A local fake server stands in
// for the real hosts through the test seam (FABTICE_STANDARDS_TEST_ORIGIN, only with FABTICE_HOLD_WINDOW=1).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { fetchStandardsText, checkUrl, ALLOWED_HOSTS } = require('../../src/standards-fetch');

const COLLECTIONS_TS = path.join(__dirname, '..', '..', '..', 'app', 'src', 'standards', 'collections.ts');

/** A fake server: `routes` maps `/<host><path>` to a handler. Records the requests. */
async function fakeServer(routes) {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ url: req.url, headers: req.headers });
    const handler = routes[req.url];
    if (!handler) {
      res.writeHead(404).end('nope');
      return;
    }
    handler(req, res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    seen,
    close: () => {
      server.closeAllConnections();
      return new Promise((r) => server.close(r));
    },
  };
}

const envFor = (origin) => ({ FABTICE_HOLD_WINDOW: '1', FABTICE_STANDARDS_TEST_ORIGIN: origin });
const options = (origin, extra = {}) => ({ fetchImpl: fetch, env: envFor(origin), ...extra });

test('the host list is the one of app/src/standards/collections.ts', { skip: !fs.existsSync(COLLECTIONS_TS) }, () => {
  const source = fs.readFileSync(COLLECTIONS_TS, 'utf8');
  const block = /COLLECTION_HOSTS: readonly string\[\] = \[([^\]]*)\]/.exec(source)[1];
  const hosts = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...hosts].sort(), [...ALLOWED_HOSTS].sort());
});

test('checkUrl: https, an allowed host, nothing else', () => {
  assert.equal(checkUrl('https://www.irealpro.com/main-playlists/').ok, true);
  assert.equal(checkUrl('https://raw.githubusercontent.com/a/b/c.txt').ok, true);
  const refused = {
    'http://www.irealpro.com/': 'invalid-url',
    'https://user:pw@www.irealpro.com/': 'invalid-url',
    'https://www.irealpro.com:8443/': 'invalid-url',
    'https://www.irealpro.com/#x': 'invalid-url',
    'ftp://www.irealpro.com/': 'invalid-url',
    'not a url': 'invalid-url',
    'https://evil.example/': 'host-not-allowed',
    'https://irealpro.com.evil.example/': 'host-not-allowed',
    'https://evilirealpro.com/': 'host-not-allowed',
    'https://127.0.0.1/': 'host-not-allowed',
    'https://localhost/': 'host-not-allowed',
  };
  for (const [url, error] of Object.entries(refused)) assert.deepEqual(checkUrl(url), { ok: false, error }, url);
  assert.deepEqual(checkUrl(42), { ok: false, error: 'invalid-url' });
  assert.deepEqual(checkUrl(undefined), { ok: false, error: 'invalid-url' });
});

test('gives the text of an allowed host, with no cookie and a plain user agent', async () => {
  const server = await fakeServer({
    '/www.irealpro.com/main-playlists/': (req, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<a href="irealb://x">Café</a>'),
  });
  try {
    const r = await fetchStandardsText('https://www.irealpro.com/main-playlists/', options(server.origin));
    assert.equal(r.ok, true);
    assert.equal(r.text, '<a href="irealb://x">Café</a>');
    assert.equal(r.url, 'https://www.irealpro.com/main-playlists/');
    const h = server.seen[0].headers;
    assert.equal(h['user-agent'], 'Fabtice');
    assert.equal(h.cookie, undefined);
    assert.equal(h.authorization, undefined);
  } finally {
    await server.close();
  }
});

test('the test seam does nothing without FABTICE_HOLD_WINDOW, or for a non-local origin', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return new Response('ok', { status: 200 });
  };
  await fetchStandardsText('https://www.irealpro.com/x', { fetchImpl, env: { FABTICE_STANDARDS_TEST_ORIGIN: 'http://127.0.0.1:1234' } });
  await fetchStandardsText('https://www.irealpro.com/y', { fetchImpl, env: { FABTICE_HOLD_WINDOW: '1', FABTICE_STANDARDS_TEST_ORIGIN: 'http://example.org' } });
  assert.deepEqual(calls, ['https://www.irealpro.com/x', 'https://www.irealpro.com/y']);
});

test('follows a redirect to an allowed host, refuses one to another host', async () => {
  const server = await fakeServer({
    '/www.irealpro.com/old': (req, res) => res.writeHead(301, { location: 'https://forums.irealpro.com/new' }).end(),
    '/forums.irealpro.com/new': (req, res) => res.writeHead(200).end('moved'),
    '/www.irealpro.com/out': (req, res) => res.writeHead(302, { location: 'https://evil.example/steal' }).end(),
    '/www.irealpro.com/plain': (req, res) => res.writeHead(302, { location: 'http://forums.irealpro.com/new' }).end(),
    '/www.irealpro.com/none': (req, res) => res.writeHead(302).end(),
    '/www.irealpro.com/loop': (req, res) => res.writeHead(302, { location: '/loop' }).end(),
  });
  try {
    const ok = await fetchStandardsText('https://www.irealpro.com/old', options(server.origin));
    assert.equal(ok.ok, true);
    assert.equal(ok.text, 'moved');
    assert.equal(ok.url, 'https://forums.irealpro.com/new');
    assert.deepEqual(await fetchStandardsText('https://www.irealpro.com/out', options(server.origin)), { ok: false, error: 'host-not-allowed', status: 302 });
    assert.deepEqual(await fetchStandardsText('https://www.irealpro.com/plain', options(server.origin)), { ok: false, error: 'redirect', status: 302 });
    assert.deepEqual(await fetchStandardsText('https://www.irealpro.com/none', options(server.origin)), { ok: false, error: 'redirect', status: 302 });
    assert.deepEqual(await fetchStandardsText('https://www.irealpro.com/loop', options(server.origin)), { ok: false, error: 'redirect' });
    assert.ok(!server.seen.some((s) => s.url.includes('evil')), 'nothing was requested from the other host');
  } finally {
    await server.close();
  }
});

test('http errors, size cap (declared and streamed), timeout and network failure', async () => {
  const server = await fakeServer({
    '/www.irealpro.com/missing': (req, res) => res.writeHead(404).end('no'),
    '/www.irealpro.com/declared': (req, res) => res.writeHead(200, { 'content-length': '5000' }).end('x'.repeat(5000)),
    '/www.irealpro.com/streamed': (req, res) => {
      res.writeHead(200);
      res.write('x'.repeat(3000));
      res.end('y'.repeat(3000));
    },
    '/www.irealpro.com/exact': (req, res) => res.writeHead(200).end('x'.repeat(4000)),
    '/www.irealpro.com/slow': () => {},
  });
  try {
    assert.deepEqual(await fetchStandardsText('https://www.irealpro.com/missing', options(server.origin)), { ok: false, error: 'http', status: 404 });
    assert.deepEqual(await fetchStandardsText('https://www.irealpro.com/declared', options(server.origin, { maxBytes: 4000 })), { ok: false, error: 'too-large' });
    assert.deepEqual(await fetchStandardsText('https://www.irealpro.com/streamed', options(server.origin, { maxBytes: 4000 })), { ok: false, error: 'too-large' });
    assert.equal((await fetchStandardsText('https://www.irealpro.com/exact', options(server.origin, { maxBytes: 4000 }))).ok, true);
    assert.deepEqual(await fetchStandardsText('https://www.irealpro.com/slow', options(server.origin, { timeoutMs: 150 })), { ok: false, error: 'timeout' });
  } finally {
    await server.close();
  }
  const down = await fetchStandardsText('https://www.irealpro.com/x', options('http://127.0.0.1:9'));
  assert.equal(down.ok, false);
  assert.equal(down.error, 'network');
});
