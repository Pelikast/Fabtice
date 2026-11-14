'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const proto = require('../../src/protocol');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-proto-'));
const ui = path.join(tmp, 'ui');
const diag = path.join(tmp, 'diag');
fs.mkdirSync(path.join(ui, 'assets'), { recursive: true });
fs.mkdirSync(diag);
fs.writeFileSync(path.join(ui, 'index.html'), '<!doctype html><title>x</title>');
fs.writeFileSync(path.join(ui, 'assets', 'engine.wasm'), Buffer.from([0, 0x61, 0x73, 0x6d]));
fs.writeFileSync(path.join(ui, 'assets', 'a b.woff2'), 'font');
fs.writeFileSync(path.join(ui, 'assets', 'worklet.mjs'), 'export {}');
fs.writeFileSync(path.join(ui, 'assets', 'app.js'), 'console.log(1)');
fs.writeFileSync(path.join(ui, 'assets', 'unknown.xyz'), 'zzz');
fs.writeFileSync(path.join(tmp, 'secret.txt'), 'secret');
fs.writeFileSync(path.join(diag, 'index.html'), 'diag page');
try { fs.symlinkSync(path.join(tmp, 'secret.txt'), path.join(ui, 'assets', 'link.txt')); } catch { /* no symlinks */ }
const roots = { app: ui, diagnostic: diag };
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const get = (url, method) => proto.respond(url, roots, method);

test('serves files with the right MIME type', async () => {
  const cases = {
    'fabtice://app/index.html': 'text/html; charset=utf-8',
    'fabtice://app/assets/engine.wasm': 'application/wasm',
    'fabtice://app/assets/a%20b.woff2': 'font/woff2',
    'fabtice://app/assets/worklet.mjs': 'text/javascript; charset=utf-8',
    'fabtice://app/assets/app.js': 'text/javascript; charset=utf-8',
    'fabtice://app/assets/unknown.xyz': 'application/octet-stream',
  };
  for (const [url, type] of Object.entries(cases)) {
    const res = get(url);
    assert.equal(res.status, 200, url);
    assert.equal(res.headers.get('content-type'), type, url);
    await res.arrayBuffer();
  }
});

test('root path serves index.html; body and length are right', async () => {
  const res = get('fabtice://app/');
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '<!doctype html><title>x</title>');
  assert.equal(get('fabtice://app/assets/engine.wasm').headers.get('content-length'), '4');
  assert.equal(get('fabtice://diagnostic/index.html').status, 200);
  assert.equal(await get('fabtice://diagnostic/').text(), 'diag page');
});

test('every answer carries the isolation headers and the CSP', async () => {
  const res = get('fabtice://app/index.html');
  assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin');
  assert.equal(res.headers.get('cross-origin-embedder-policy'), 'require-corp');
  assert.equal(res.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  const csp = res.headers.get('content-security-policy');
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self' 'wasm-unsafe-eval'(;|$)/);
  assert.match(csp, /worker-src 'self' blob:/);
  assert.match(csp, /media-src 'self' blob:/);
  assert.doesNotMatch(csp, /script-src[^;]*('unsafe-eval'|'unsafe-inline')/);
  await res.arrayBuffer();
});

test('the policy lets the interface reach the model hosts, and nothing else', () => {
  const directives = Object.fromEntries(proto.CSP.split(';').map((d) => d.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));
  // The download of the analysis tools: Hugging Face and its content network, in https only.
  assert.deepEqual(directives['connect-src'], ["'self'", 'blob:', 'https://huggingface.co', 'https://*.cdn.hf.co']);
  assert.deepEqual(proto.MODEL_HOSTS, ['https://huggingface.co', 'https://*.cdn.hf.co']);
  // Nothing wider in what can load or run: scripts, workers and the rest are as before.
  assert.deepEqual(directives['default-src'], ["'none'"]);
  assert.deepEqual(directives['script-src'], ["'self'", "'wasm-unsafe-eval'"]);
  assert.deepEqual(directives['worker-src'], ["'self'", 'blob:']);
  for (const [name, values] of Object.entries(directives)) {
    if (name !== 'connect-src') assert.ok(!values.some((v) => /^https?:|^\*$|^data:$/.test(v) && !(name === 'img-src' && v === 'data:')), `${name} is open to the network`);
  }
  assert.ok(!directives['connect-src'].includes('*'));
  assert.ok(!directives['connect-src'].some((v) => v.startsWith('http:')));
});

test('missing file, unknown host and directories are 404', () => {
  assert.equal(get('fabtice://app/nope.js').status, 404);
  assert.equal(get('fabtice://app/assets').status, 404);
  assert.equal(get('fabtice://other/index.html').status, 404);
  assert.equal(get('fabtice://constructor/index.html').status, 404);
  assert.equal(get('fabtice://app/nope.js').headers.get('content-security-policy'), null);
});

test('path traversal is refused', () => {
  for (const url of [
    'fabtice://app/../secret.txt',
    'fabtice://app/assets/../../secret.txt',
    'fabtice://app/%2e%2e/secret.txt',
    'fabtice://app/assets/%2e%2e%2f%2e%2e%2fsecret.txt',
    'fabtice://app/..%2fsecret.txt',
  ]) {
    const status = get(url).status;
    assert.ok(status === 403 || status === 404, `${url} -> ${status}`);
    assert.notEqual(status, 200);
  }
  assert.equal(get('fabtice://app/assets/..%5c..%5csecret.txt').status, 400);
  assert.equal(get('fabtice://app/%00').status, 400);
  assert.equal(get('fabtice://app/%E0%A4%A').status, 400);
});

test('a symlink leading outside the folder is refused', { skip: !fs.existsSync(path.join(ui, 'assets', 'link.txt')) }, () => {
  assert.equal(get('fabtice://app/assets/link.txt').status, 403);
});

test('only GET and HEAD; other schemes refused', async () => {
  assert.equal(get('fabtice://app/index.html', 'POST').status, 405);
  const head = get('fabtice://app/index.html', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(get('file:///etc/passwd').status, 400);
  assert.equal(get('not a url').status, 400);
});

test('IPC sender check accepts only our two origins', () => {
  assert.equal(proto.isTrustedUrl('fabtice://app/index.html'), true);
  assert.equal(proto.isTrustedUrl('fabtice://app/index.html#vue=x'), true);
  assert.equal(proto.isTrustedUrl('fabtice://diagnostic/index.html'), true);
  for (const bad of ['', 'file:///x/index.html', 'https://app/index.html', 'fabtice://evil/index.html',
    'fabtice://app@evil/index.html', 'fabtice://app:99/index.html', 'fabtice://app.evil/index.html', 'about:blank']) {
    assert.equal(proto.isTrustedUrl(bad), false, bad);
  }
});
