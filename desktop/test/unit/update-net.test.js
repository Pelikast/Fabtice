'use strict';

// The network side of the update (C16): the closed list of hosts, redirects followed by hand and checked at
// every hop, the test-only address (with the e2e switch, loopback only), the download with its size and
// SHA-256, its progress, its cancel and its stall.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { checkUrl, testOrigin, fetchVersionFile, downloadArchive, sha256File, ALLOWED_HOSTS, VERSION_FILE_URL } = require('../../src/update-net');

async function server(routes) {
  const seen = [];
  const srv = http.createServer((req, res) => {
    seen.push({ url: req.url, headers: req.headers });
    const r = routes[req.url];
    if (!r) return res.writeHead(404).end('nope');
    if (typeof r === 'function') return r(req, res);
    res.writeHead(r.status ?? 200, r.headers ?? {}).end(r.body ?? '');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { origin: `http://127.0.0.1:${srv.address().port}`, seen, close: () => new Promise((r) => (srv.closeAllConnections(), srv.close(r))) };
}
const envFor = (origin) => ({ FABTICE_HOLD_WINDOW: '1', FABTICE_UPDATE_TEST_ORIGIN: origin });
const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-update-net-')));

test('the hosts: GitHub and its release storage, https only', () => {
  assert.deepEqual(ALLOWED_HOSTS, ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']);
  assert.equal(VERSION_FILE_URL, 'https://github.com/pelikast/fabtice/releases/latest/download/fabtice-version.json');
  assert.equal(checkUrl('https://github.com/pelikast/fabtice/releases/latest/download/fabtice-version.json').ok, true);
  assert.equal(checkUrl('https://objects.githubusercontent.com/github-production-release-asset-2e65be/1?X-Amz-Signature=x').ok, true, 'a signed address with its query');
  assert.deepEqual(checkUrl('http://github.com/x'), { ok: false, error: 'invalid-url' });
  assert.deepEqual(checkUrl('https://github.com:8443/x'), { ok: false, error: 'invalid-url' });
  assert.deepEqual(checkUrl('https://u:p@github.com/x'), { ok: false, error: 'invalid-url' });
  assert.deepEqual(checkUrl('https://github.com/x#y'), { ok: false, error: 'invalid-url' });
  assert.deepEqual(checkUrl('https://api.github.com/x'), { ok: false, error: 'host-not-allowed' });
  assert.deepEqual(checkUrl('https://github.com.evil.example/x'), { ok: false, error: 'host-not-allowed' });
  assert.deepEqual(checkUrl('https://evilgithub.com/x'), { ok: false, error: 'host-not-allowed' });
  assert.deepEqual(checkUrl('file:///etc/passwd'), { ok: false, error: 'invalid-url' });
  assert.deepEqual(checkUrl(42), { ok: false, error: 'invalid-url' });
});

test('the test address: only with the e2e switch, only on this machine', () => {
  assert.equal(testOrigin({ FABTICE_HOLD_WINDOW: '1', FABTICE_UPDATE_TEST_ORIGIN: 'http://127.0.0.1:8080' }), 'http://127.0.0.1:8080');
  assert.equal(testOrigin({ FABTICE_HOLD_WINDOW: '1', FABTICE_UPDATE_TEST_ORIGIN: 'http://localhost:51234' }), 'http://localhost:51234');
  assert.equal(testOrigin({ FABTICE_HOLD_WINDOW: '1', FABTICE_UPDATE_TEST_ORIGIN: 'http://[::1]:51234' }), 'http://[::1]:51234');
  assert.equal(testOrigin({ FABTICE_UPDATE_TEST_ORIGIN: 'http://127.0.0.1:8080' }), null, 'without the switch of the e2e tests');
  assert.equal(testOrigin({ FABTICE_HOLD_WINDOW: '0', FABTICE_UPDATE_TEST_ORIGIN: 'http://127.0.0.1:8080' }), null);
  for (const bad of ['http://192.168.1.2:8080', 'http://example.com:8080', 'https://127.0.0.1:8080', 'http://127.0.0.1', 'http://127.0.0.1:8080/path', 'http://127.0.0.1.evil.example:80', 'http://127.0.0.2:8080']) {
    assert.equal(testOrigin({ FABTICE_HOLD_WINDOW: '1', FABTICE_UPDATE_TEST_ORIGIN: bad }), null, bad);
  }
});

test('the version file: redirects followed by hand and checked; refused hops, statuses, size cap', async () => {
  const body = JSON.stringify({ format: 1 });
  const net = await server({
    '/github.com/pelikast/fabtice/releases/latest/download/fabtice-version.json': { status: 302, headers: { location: 'https://github.com/pelikast/fabtice/releases/download/v1.0.1/fabtice-version.json' } },
    '/github.com/pelikast/fabtice/releases/download/v1.0.1/fabtice-version.json': { status: 302, headers: { location: 'https://objects.githubusercontent.com/asset/1?sig=abc' } },
    '/objects.githubusercontent.com/asset/1?sig=abc': { body, headers: { 'content-type': 'application/octet-stream' } },
    '/github.com/to-evil': { status: 302, headers: { location: 'https://evil.example/steal' } },
    '/github.com/to-http': { status: 301, headers: { location: 'http://objects.githubusercontent.com/x' } },
    '/github.com/no-location': { status: 302 },
    '/github.com/loop': { status: 302, headers: { location: '/loop' } },
    '/github.com/broken': { status: 500 },
    '/github.com/big': { body: 'x'.repeat(200 * 1024) },
  });
  try {
    const env = envFor(net.origin);
    const ok = await fetchVersionFile({ fetchImpl: fetch, env });
    assert.deepEqual(ok, { ok: true, text: body });
    const first = net.seen[0];
    assert.equal(first.headers['user-agent'], 'Fabtice');
    assert.equal(first.headers.cookie, undefined);
    assert.equal(first.headers.authorization, undefined);
    const call = (u) => fetchVersionFile({ fetchImpl: fetch, env, url: `https://github.com/${u}` });
    assert.deepEqual(await call('to-evil'), { ok: false, error: 'host-not-allowed' });
    assert.deepEqual(await call('to-http'), { ok: false, error: 'redirect' });
    assert.deepEqual(await call('no-location'), { ok: false, error: 'redirect' });
    assert.deepEqual(await call('loop'), { ok: false, error: 'redirect' });
    assert.deepEqual(await call('broken'), { ok: false, error: 'http', status: 500 });
    assert.deepEqual(await call('missing'), { ok: false, error: 'http', status: 404 });
    assert.deepEqual(await call('big'), { ok: false, error: 'too-large' });
    assert.ok(!net.seen.some((s) => /evil\.example|steal/.test(s.url)), 'nothing asked from a host outside the list');
    assert.deepEqual(await fetchVersionFile({ fetchImpl: fetch, env, url: 'https://evil.example/x' }), { ok: false, error: 'host-not-allowed' });
  } finally {
    await net.close();
  }
  // No server at all: a network error, said as such.
  const closed = await server({});
  await closed.close();
  const dead = await fetchVersionFile({ fetchImpl: fetch, env: envFor(closed.origin) });
  assert.equal(dead.ok, false);
  assert.equal(dead.error, 'network');
  // A server that never answers: the time-out.
  const silent = await server({ '/github.com/slow': () => {} });
  try {
    assert.deepEqual(await fetchVersionFile({ fetchImpl: fetch, env: envFor(silent.origin), url: 'https://github.com/slow', timeoutMs: 300 }), { ok: false, error: 'timeout' });
  } finally {
    await silent.close();
  }
});

test('the archive: exact size, SHA-256 computed on the way, progress; refusals leave no file', async () => {
  const bytes = crypto.randomBytes(1_500_000);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const routes = {
    '/github.com/pelikast/fabtice/releases/download/v1.0.1/a.zip': { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/a?sig=1' } },
    '/release-assets.githubusercontent.com/a?sig=1': (req, res) => {
      res.writeHead(200, { 'content-length': bytes.length, 'content-type': 'application/zip' });
      // In pieces, so that the progress moves.
      let at = 0;
      const step = () => {
        if (at >= bytes.length) return res.end();
        res.write(bytes.subarray(at, at + 100_000));
        at += 100_000;
        setImmediate(step);
      };
      step();
    },
    '/github.com/short': (req, res) => {
      res.writeHead(200);
      res.end(bytes.subarray(0, 1_000_000));
    },
    '/github.com/long': (req, res) => {
      res.writeHead(200);
      res.end(Buffer.concat([bytes, Buffer.from('x')]));
    },
    '/github.com/declared': (req, res) => {
      res.writeHead(200, { 'content-length': 999 });
      res.end('x'.repeat(999));
    },
    '/github.com/stall': (req, res) => {
      res.writeHead(200);
      res.write(bytes.subarray(0, 1000));
    },
  };
  const net = await server(routes);
  const dir = tmp();
  try {
    const env = envFor(net.origin);
    const progress = [];
    const file = path.join(dir, 'a.zip');
    const got = await downloadArchive({ url: 'https://github.com/pelikast/fabtice/releases/download/v1.0.1/a.zip', size: bytes.length, file, fetchImpl: fetch, env, onProgress: (p) => progress.push(p.received) });
    assert.deepEqual(got, { ok: true, bytes: bytes.length, sha256: sha });
    assert.equal(await sha256File(file), sha);
    assert.ok(progress.length >= 5 && progress.every((v, i) => i === 0 || v >= progress[i - 1]) && progress.at(-1) === bytes.length, `${progress.length} steps`);
    // The file is new: an existing one is never written over.
    assert.equal((await downloadArchive({ url: 'https://github.com/pelikast/fabtice/releases/download/v1.0.1/a.zip', size: bytes.length, file, fetchImpl: fetch, env })).ok, false);
    fs.rmSync(file);
    for (const [route, error] of [
      ['short', 'size'],
      ['long', 'size'],
      ['declared', 'size'],
      ['missing', 'http'],
    ]) {
      const r = await downloadArchive({ url: `https://github.com/${route}`, size: bytes.length, file, fetchImpl: fetch, env });
      assert.equal(r.ok, false, route);
      assert.equal(r.error, error, `${route}: ${r.detail}`);
      assert.equal(fs.existsSync(file), false, `${route}: no file left`);
    }
    const stalled = await downloadArchive({ url: 'https://github.com/stall', size: bytes.length, file, fetchImpl: fetch, env, stallMs: 300 });
    assert.equal(stalled.error, 'timeout');
    assert.equal(fs.existsSync(file), false);
    // Cancelled in the middle.
    const controller = new AbortController();
    const cancelled = await downloadArchive({
      url: 'https://github.com/pelikast/fabtice/releases/download/v1.0.1/a.zip',
      size: bytes.length,
      file,
      fetchImpl: fetch,
      env,
      signal: controller.signal,
      onProgress: (p) => p.received > 300_000 && controller.abort(),
    });
    assert.equal(cancelled.error, 'cancelled');
    assert.equal(fs.existsSync(file), false);
    assert.equal((await downloadArchive({ url: 'https://evil.example/a.zip', size: 10, file, fetchImpl: fetch, env })).error, 'host-not-allowed');
  } finally {
    await net.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
