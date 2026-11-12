'use strict';

// The yt-dlp downloader with a scripted fetch: transient failures are retried,
// persistent ones leave nothing behind, and SHA-256 stays the final gate.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { YtDlpManager } = require('../../src/ytdlp-manager');

const BINARY = Buffer.from('#!/bin/sh\necho 2099.02.02-fake\n'.padEnd(4096, '#'));
const SHA = crypto.createHash('sha256').update(BINARY).digest('hex');
const SUMS = `${SHA}  yt-dlp_linux\n${'0'.repeat(64)}  yt-dlp_macos\n`;
const TAG = '2099.02.02';

function bodyResponse(bytes, { failAfter = null, contentLength = bytes.length } = {}) {
  const stream = new ReadableStream({
    start(controller) {
      if (failAfter === null) {
        controller.enqueue(new Uint8Array(bytes));
        controller.close();
      } else {
        controller.enqueue(new Uint8Array(bytes.subarray(0, failAfter)));
        setTimeout(() => controller.error(new TypeError('net::ERR_CONNECTION_RESET')), 5);
      }
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-length': String(contentLength) } });
}

// plan: { version: [...], sums: [...], binary: [...] }, each entry one attempt:
// 'ssl' | 'timeout' | 'midway' | 'corrupt' | '404' | '503' | 'ok'. The last entry repeats.
function scriptedFetch(plan) {
  const counters = { version: 0, sums: 0, binary: 0 };
  const calls = [];
  const fetchImpl = async (url) => {
    const kind = url.includes('/api/') || url.includes('api.github.com') ? 'version'
      : url.endsWith('SHA2-256SUMS') ? 'sums' : 'binary';
    const steps = plan[kind];
    const step = steps[Math.min(counters[kind]++, steps.length - 1)];
    calls.push({ kind, url, step });
    switch (step) {
      case 'ssl': throw new TypeError('net::ERR_SSL_PROTOCOL_ERROR');
      case 'timeout': throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      case '404': return new Response('not found', { status: 404 });
      case '503': return new Response('busy', { status: 503 });
      case 'midway': return bodyResponse(BINARY, { failAfter: 1000 });
      case 'corrupt': return bodyResponse(Buffer.from(BINARY).fill(0x41, 100, 200));
      case 'ok':
        if (kind === 'version') return Response.json({ tag_name: TAG });
        if (kind === 'sums') return new Response(SUMS);
        return bodyResponse(BINARY);
      default: throw new Error(`bad step ${step}`);
    }
  };
  return { fetchImpl, calls };
}

function makeManager(plan) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-mgr-'));
  const { fetchImpl, calls } = scriptedFetch(plan);
  const manager = new YtDlpManager({
    userDataDir, fetchImpl, platform: 'linux', env: {}, retryDelaysMs: [1, 1, 1],
  });
  return { manager, calls, dir: path.join(userDataDir, 'yt-dlp') };
}

const listDir = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []);

test('transient failures on every step are retried and the install succeeds', async () => {
  const { manager, calls, dir } = makeManager({
    version: ['ssl', 'ok'],
    sums: ['timeout', '503', 'ok'],
    binary: ['midway', 'corrupt', 'ok'],
  });
  const meta = await manager.install();
  assert.equal(meta.version, '2099.02.02-fake');
  assert.equal(meta.tag, TAG);
  assert.equal(meta.sha256, SHA);
  assert.deepEqual(listDir(dir), ['installed.json', 'yt-dlp_linux']);
  const status = await manager.status();
  assert.equal(status.installed, true);
  assert.equal(status.intact, true);
  assert.equal(calls.filter((c) => c.kind === 'binary').length, 3);
  assert.ok(calls.find((c) => c.kind === 'binary').url.includes(`/releases/download/${TAG}/yt-dlp_linux`));

  const log = manager.attemptLog();
  assert.deepEqual(log.map((a) => `${a.op}:${a.attempt}:${a.ok}`), [
    'version:1:false', 'version:2:true',
    'sommes:1:false', 'sommes:2:false', 'sommes:3:true',
    'binaire:1:false', 'binaire:2:false', 'binaire:3:true',
  ]);
  assert.match(log[0].error, /ERR_SSL_PROTOCOL_ERROR/);
  assert.match(log[2].error, /délai dépassé/);
  assert.match(log[3].error, /HTTP 503/);
  assert.match(log[5].error, /ERR_CONNECTION_RESET/);
  assert.match(log[6].error, /SHA-256 incorrecte/);
  for (const a of log) {
    assert.equal(a.host, a.op === 'version' ? 'api.github.com' : 'github.com');
    assert.ok(Date.parse(a.at));
  }
});

test('persistent download failure leaves no partial file', async () => {
  const { manager, calls, dir } = makeManager({ version: ['ok'], sums: ['ok'], binary: ['midway'] });
  await assert.rejects(manager.install(), /ERR_CONNECTION_RESET/);
  assert.equal(calls.filter((c) => c.kind === 'binary').length, 4);
  assert.deepEqual(listDir(dir), []);
  assert.equal((await manager.status()).installed, false);
  assert.equal(await manager.executable(), null);
});

test('a checksum that never matches is never installed', async () => {
  const { manager, dir } = makeManager({ version: ['ok'], sums: ['ok'], binary: ['corrupt'] });
  await assert.rejects(manager.install(), /SHA-256 incorrecte/);
  assert.deepEqual(listDir(dir), []);
});

test('API refusal falls back to the latest/download URLs without retrying', async () => {
  const { manager, calls } = makeManager({ version: ['404'], sums: ['ok'], binary: ['ok'] });
  const meta = await manager.install();
  assert.equal(meta.tag, null);
  assert.equal(calls.filter((c) => c.kind === 'version').length, 1);
  assert.ok(calls.find((c) => c.kind === 'binary').url.endsWith('/releases/latest/download/yt-dlp_linux'));
});

test('HTTP 404 on the binary is not retried', async () => {
  const { manager, calls, dir } = makeManager({ version: ['ok'], sums: ['ok'], binary: ['404'] });
  await assert.rejects(manager.install(), /HTTP 404/);
  assert.equal(calls.filter((c) => c.kind === 'binary').length, 1);
  assert.deepEqual(listDir(dir), []);
});

test('update check failing with yt-dlp installed reports, never throws', async () => {
  const plan = { version: ['ok'], sums: ['ok'], binary: ['ok'] };
  const { manager } = makeManager(plan);
  await manager.install();
  plan.version = ['ssl'];
  plan.sums = ['ssl'];
  const fresh = new YtDlpManager({
    userDataDir: path.dirname(manager.dir), fetchImpl: scriptedFetch(plan).fetchImpl,
    platform: 'linux', env: {}, retryDelaysMs: [1, 1, 1],
  });
  const check = await fresh.checkForUpdate();
  assert.equal(check.installed, true);
  assert.equal(check.intact, true);
  assert.match(check.error, /ERR_SSL_PROTOCOL_ERROR/);
  assert.equal(fresh.attemptLog().filter((a) => a.op === 'sommes').length, 4);
});

test('default backoff is four attempts within about 20 seconds', () => {
  const { DEFAULT_RETRY_DELAYS_MS } = require('../../src/ytdlp-manager');
  assert.equal(DEFAULT_RETRY_DELAYS_MS.length, 3);
  const total = DEFAULT_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0);
  assert.ok(total >= 10000 && total <= 25000, String(total));
});
