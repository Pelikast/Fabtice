'use strict';

// After a publication, the real update chain walked with the app's own code (ci/update-chain.js): the version
// file of « latest » must give the number published, each chip's .zip must be reached through allowed hosts only;
// GitHub being slow is tried again, a host outside the list is not.

const test = require('node:test');
const assert = require('node:assert/strict');
const { checkUpdateChain } = require('../../ci/update-chain');

const dl = (version, name) => ({ name, url: `https://github.com/pelikast/fabtice/releases/download/v${version}/${name}`, sha256: 'a'.repeat(64), size: 2_000_000 });
const versionFile = (version) => JSON.stringify({
  format: 1,
  version,
  publishedAt: '2026-12-01T10:00:00Z',
  notes: '- Une chose.',
  page: `https://github.com/pelikast/fabtice/releases/tag/v${version}`,
  minimumSystemVersion: '12.0',
  downloads: { arm64: dl(version, 'Fabtice-mac-apple-silicon.zip'), x64: dl(version, 'Fabtice-mac-intel.zip') },
});

/** GitHub as a fake `fetch`: `served()` the version in « latest »; where the version file and the zips are stored. */
function fakeGitHub({ served, zipHost = 'release-assets.githubusercontent.com', fileHost = 'objects.githubusercontent.com' }) {
  const asked = [];
  const fetchImpl = async (input, init) => {
    const url = new URL(input);
    asked.push(`${init.method} ${url.host}${url.pathname}`);
    assert.equal(init.redirect, 'manual');
    if (url.hostname === 'github.com' && url.pathname.endsWith('/latest/download/fabtice-version.json')) return new Response(null, { status: 302, headers: { location: `https://${fileHost}/v` } });
    if (url.hostname === 'github.com' && url.pathname.endsWith('.zip')) return new Response(null, { status: 302, headers: { location: `https://${zipHost}/z${url.pathname}` } });
    if (url.pathname === '/v') return new Response(versionFile(served()), { status: 200 });
    if (url.pathname.startsWith('/z/')) return new Response(new Uint8Array(1024), { status: 200 });
    return new Response('no', { status: 404 });
  };
  return { fetchImpl, asked };
}

test('the chain works: the version published, both zips through allowed hosts', async () => {
  const gh = fakeGitHub({ served: () => '1.0.1' });
  const r = await checkUpdateChain({ version: '1.0.1', fetchImpl: gh.fetchImpl, sleep: async () => assert.fail('no wait') });
  assert.deepEqual(r, { ok: true, hosts: { arm64: 'release-assets.githubusercontent.com', x64: 'release-assets.githubusercontent.com' } });
  assert.equal(gh.asked.length, 6);
});

test('GitHub still serves the former version for a moment: tried again, spaced, then fine', async () => {
  let n = 0;
  const gh = fakeGitHub({ served: () => (++n < 3 ? '1.0.0' : '1.0.1') });
  const waits = [];
  const lines = [];
  const r = await checkUpdateChain({ version: '1.0.1', fetchImpl: gh.fetchImpl, delayMs: 7, sleep: async (ms) => waits.push(ms), log: (l) => lines.push(l) });
  assert.equal(r.ok, true);
  assert.deepEqual(waits, [7, 7]);
  assert.match(lines[0], /essai 1\/6 : .* donne la version 1\.0\.0, pas 1\.0\.1/);
  // Never the right one: the last answer after every attempt.
  const never = await checkUpdateChain({ version: '1.0.2', fetchImpl: fakeGitHub({ served: () => '1.0.1' }).fetchImpl, attempts: 3, sleep: async () => {} });
  assert.equal(never.ok, false);
  assert.equal(never.final, false);
  assert.match(never.message, /donne la version 1\.0\.1, pas 1\.0\.2/);
});

test('a redirect to a host outside the list: failure at once, the host named, never asked', async () => {
  for (const [opts, host] of [[{ zipHost: 'evil.example.com' }, 'evil.example.com'], [{ fileHost: 'storage.example.net' }, 'storage.example.net']]) {
    const gh = fakeGitHub({ served: () => '1.0.1', ...opts });
    const waits = [];
    const r = await checkUpdateChain({ version: '1.0.1', fetchImpl: gh.fetchImpl, sleep: async (ms) => waits.push(ms) });
    assert.equal(r.ok, false);
    assert.equal(r.final, true);
    assert.equal(r.host, host);
    assert.match(r.message, new RegExp(`« ${host.replace(/\./g, '\\.')} », hors de la liste`));
    assert.deepEqual(waits, [], 'not tried again');
    assert.ok(!gh.asked.some((a) => a.startsWith(`GET ${host}`)), 'the refused host is never asked');
  }
});

test('no network: failures said, tried again, never thrown', async () => {
  const r = await checkUpdateChain({ version: '1.0.1', fetchImpl: async () => { throw new TypeError('fetch failed'); }, attempts: 2, sleep: async () => {} });
  assert.equal(r.ok, false);
  assert.match(r.message, /ne se lit pas \(network\)/);
});
