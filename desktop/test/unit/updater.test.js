'use strict';

// The whole update (C16) in one process, on a folder tree of fake apps and a local server standing for
// GitHub (the test address): the check and its answers, the download, a tampered archive refused, the
// question about closing refused, a new app that is not what was announced, cancel, twice, no room, the
// swap and the relaunch; the left-overs cleaned at the next start; the manual download's page.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { createUpdater, relaunchAfterExit, LATEST_PAGE } = require('../../src/updater');
const { fakeApp, marker, zipFolder } = require('../update-fixtures');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The installed app, the new version's archive, its version file, and a server for both. */
async function world({ newVersion = '1.0.1', announced = newVersion, tamper = false, slow = false, versionFile } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-updater-')));
  const folder = path.join(root, 'Mes Applications é');
  fs.mkdirSync(folder);
  const installed = fakeApp(path.join(folder, 'Fabtice.app'), { version: '1.0.0', archs: ['x64'], marker: 'old' });
  const source = path.join(root, 'source');
  const newApp = fakeApp(path.join(source, 'Fabtice.app'), { version: newVersion, archs: ['x64'], marker: 'new' });
  fs.writeFileSync(path.join(newApp, 'Contents', 'Resources', 'app.asar'), crypto.randomBytes(1_200_000));
  const zip = path.join(root, 'Fabtice-mac-intel.zip');
  zipFolder(source, zip);
  const good = fs.readFileSync(zip);
  const served = Buffer.from(good);
  if (tamper) served[Math.floor(served.length / 2)] ^= 0xff;
  const sha = crypto.createHash('sha256').update(good).digest('hex');
  const dl = (arch, name) => ({ name, url: `https://github.com/pelikast/fabtice/releases/download/v${announced}/${name}`, sha256: sha, size: good.length });
  const file = versionFile ?? JSON.stringify({
    format: 1,
    version: announced,
    publishedAt: '2026-12-01T10:00:00Z',
    notes: '### Mieux\n- Une chose.',
    page: `https://github.com/pelikast/fabtice/releases/tag/v${announced}`,
    minimumSystemVersion: '12.0',
    downloads: { arm64: dl('arm64', 'Fabtice-mac-apple-silicon.zip'), x64: dl('x64', 'Fabtice-mac-intel.zip') },
  });
  const seen = [];
  const srv = http.createServer(async (req, res) => {
    seen.push(req.url);
    if (req.url === '/github.com/pelikast/fabtice/releases/latest/download/fabtice-version.json') {
      if (file === 404) return res.writeHead(404).end();
      return res.writeHead(302, { location: 'https://objects.githubusercontent.com/version?sig=1' }).end();
    }
    if (req.url === '/objects.githubusercontent.com/version?sig=1') return res.writeHead(200).end(file);
    if (req.url === `/github.com/pelikast/fabtice/releases/download/v${announced}/Fabtice-mac-intel.zip`) {
      return res.writeHead(302, { location: 'https://release-assets.githubusercontent.com/zip?sig=2' }).end();
    }
    if (req.url === '/release-assets.githubusercontent.com/zip?sig=2') {
      res.writeHead(200, { 'content-length': served.length });
      for (let at = 0; at < served.length; at += 64 * 1024) {
        if (res.destroyed) return;
        res.write(served.subarray(at, at + 64 * 1024));
        await sleep(slow ? 40 : 0);
      }
      return res.end();
    }
    res.writeHead(404).end();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${srv.address().port}`;
  return {
    root,
    folder,
    installed,
    newApp,
    seen,
    env: { FABTICE_HOLD_WINDOW: '1', FABTICE_UPDATE_TEST_ORIGIN: origin, FABTICE_UPDATE_TEST_APP: installed },
    close: async () => {
      srv.closeAllConnections();
      await new Promise((r) => srv.close(r));
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

/** An updater over the world, with the system calls faked: `ditto` copies the new app in, the rest answers « fine ». */
function updaterFor(w, o = {}) {
  const sent = [];
  const calls = { relaunch: [], quit: 0, asked: 0, opened: [] };
  const run = async (file, args) => {
    if (file === '/usr/bin/ditto') {
      fs.cpSync(path.dirname(w.newApp), args[3], { recursive: true });
      return { code: 0, stdout: '', stderr: '' };
    }
    return { code: 1, stdout: '', stderr: '' };
  };
  const updater = createUpdater({
    currentVersion: o.current ?? '1.0.0',
    arch: 'x64',
    platform: 'darwin',
    osVersion: o.osVersion ?? '14.6',
    execPath: '/usr/bin/electron',
    packaged: false,
    env: w.env,
    fetchImpl: fetch,
    send: (s) => sent.push(s),
    askToLeave: async () => {
      calls.asked++;
      return o.mayClose ?? true;
    },
    relaunch: (plan) => calls.relaunch.push(plan),
    quit: () => calls.quit++,
    openExternal: async (url) => calls.opened.push(url),
    deps: { fs: o.fs ?? fs, run, platform: 'linux' },
  });
  return { updater, sent, calls };
}

async function until(get, test, ms = 10000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = get();
    if (test(v)) return v;
    if (Date.now() > end) throw new Error(`timed out; last ${JSON.stringify(v).slice(0, 300)}`);
    await sleep(20);
  }
}
const leftInFolder = (w) => fs.readdirSync(w.folder).sort();

test('check: a newer version is available; the same or an older one is not; who asked is kept', async () => {
  const w = await world();
  try {
    const { updater, sent } = updaterFor(w);
    const s = await updater.check('launch');
    assert.equal(s.phase, 'available');
    assert.equal(s.origin, 'launch');
    assert.deepEqual(s.available, { version: '1.0.1', notes: '### Mieux\n- Une chose.', publishedAt: '2026-12-01T10:00:00Z', size: s.available.size });
    assert.equal(s.blocked, null);
    assert.equal(s.current, '1.0.0');
    assert.ok(sent.some((x) => x.phase === 'checking') && sent.at(-1).phase === 'available');
    assert.equal((await updater.check('menu')).origin, 'menu');
    assert.equal(updater.state().seq, 2);
    assert.equal((await updaterFor(w, { current: '1.0.1' }).updater.check()).phase, 'up-to-date', 'the same version');
    assert.equal((await updaterFor(w, { current: '1.2.0' }).updater.check()).phase, 'up-to-date', 'never an older one');
    // Too old a macOS for the new version: said, and no update offered.
    const old = await updaterFor(w, { osVersion: '11.7' }).updater.check();
    assert.deepEqual(old.blocked, { code: 'system', minimum: '12.0' });
  } finally {
    await w.close();
  }
});

test('check: no network, no file, a file this version cannot read', async () => {
  const none = await world({ versionFile: 404 });
  try {
    assert.deepEqual((await updaterFor(none).updater.check('page')).error, { code: 'unreadable', during: 'check' });
  } finally {
    await none.close();
  }
  const later = await world({ versionFile: JSON.stringify({ format: 2, anything: true }) });
  try {
    const s = await updaterFor(later).updater.check('page');
    assert.equal(s.phase, 'failed');
    assert.deepEqual(s.error, { code: 'unreadable', during: 'check' });
  } finally {
    await later.close();
  }
  const w = await world();
  const env = { ...w.env };
  await w.close();
  const offline = updaterFor({ ...w, env });
  const s = await offline.updater.check('page');
  assert.deepEqual(s.error, { code: 'network', during: 'check' });
});

test('the update: downloaded, checked, the page asked, the swap, the relaunch', async () => {
  const w = await world();
  try {
    const { updater, sent, calls } = updaterFor(w);
    await updater.check('launch');
    assert.deepEqual(updater.start(), { ok: true });
    assert.deepEqual(updater.start(), { ok: false, reason: 'busy' }, 'asked twice');
    await until(() => calls.quit, (n) => n === 1);
    const phases = [...new Set(sent.map((s) => s.phase))];
    assert.deepEqual(phases, ['checking', 'available', 'downloading', 'preparing', 'closing', 'restarting']);
    const fractions = sent.filter((s) => s.progress).map((s) => s.progress.fraction);
    assert.ok(fractions.every((f, i) => i === 0 || f >= fractions[i - 1]), 'the progress never goes back');
    assert.equal(fractions.at(-1), 1);
    assert.equal(calls.asked, 1);
    assert.equal(marker(w.installed), 'new');
    assert.deepEqual(calls.relaunch, [{ bundle: w.installed, executable: path.join(w.installed, 'Contents', 'MacOS', 'Fabtice') }]);
    assert.deepEqual(leftInFolder(w), ['.Fabtice-ancienne.app', 'Fabtice.app'], 'the work folder is gone; the old app waits aside');
    // The redirects were followed through the allowed hosts.
    assert.ok(w.seen.includes('/release-assets.githubusercontent.com/zip?sig=2'));
    // The next start: the old app goes.
    const next = updaterFor(w, { current: '1.0.1' }).updater;
    assert.deepEqual(next.afterStart(), { removedAside: true, removedStaging: 0 });
    assert.deepEqual(leftInFolder(w), ['Fabtice.app']);
  } finally {
    await w.close();
  }
});

test('a tampered archive is refused: nothing changed, nothing left', async () => {
  const w = await world({ tamper: true });
  try {
    const { updater, calls } = updaterFor(w);
    await updater.check();
    updater.start();
    const s = await until(() => updater.state(), (x) => x.phase === 'available' && x.error);
    assert.deepEqual(s.error, { code: 'damaged', during: 'update' });
    assert.equal(marker(w.installed), 'old');
    assert.deepEqual(leftInFolder(w), ['Fabtice.app']);
    assert.equal(calls.asked, 0, 'the page was not even asked');
    assert.equal(calls.quit, 0);
    // It can be tried again (the same answer).
    assert.deepEqual(updater.start(), { ok: true });
    await until(() => updater.state(), (x) => x.phase === 'available' && x.error);
  } finally {
    await w.close();
  }
});

test('the page refuses to close (changes not saved): the update is cancelled, nothing changed', async () => {
  const w = await world();
  try {
    const { updater, calls } = updaterFor(w, { mayClose: false });
    await updater.check();
    updater.start();
    const s = await until(() => updater.state(), (x) => x.phase === 'available' && x.error);
    assert.deepEqual(s.error, { code: 'refused', during: 'update' });
    assert.equal(calls.asked, 1);
    assert.equal(marker(w.installed), 'old');
    assert.deepEqual(leftInFolder(w), ['Fabtice.app']);
    assert.equal(calls.quit, 0);
  } finally {
    await w.close();
  }
});

test('an archive that does not hold the version announced: refused before anything moves', async () => {
  const w = await world({ newVersion: '1.0.2', announced: '1.0.1' });
  try {
    const { updater, calls } = updaterFor(w);
    await updater.check();
    updater.start();
    const s = await until(() => updater.state(), (x) => x.phase === 'available' && x.error);
    assert.deepEqual(s.error, { code: 'install', during: 'update' });
    assert.equal(calls.asked, 0);
    assert.equal(marker(w.installed), 'old');
    assert.deepEqual(leftInFolder(w), ['Fabtice.app']);
  } finally {
    await w.close();
  }
});

test('the swap fails: the old app is back, the update said as failed', async () => {
  const w = await world();
  try {
    let renames = 0;
    const fsx = { ...fs, renameSync: (a, b) => (++renames === 2 ? (() => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); })() : fs.renameSync(a, b)) };
    const { updater, calls } = updaterFor(w, { fs: fsx });
    await updater.check();
    updater.start();
    const s = await until(() => updater.state(), (x) => x.phase === 'available' && x.error);
    assert.deepEqual(s.error, { code: 'install', during: 'update' });
    assert.equal(marker(w.installed), 'old');
    assert.deepEqual(leftInFolder(w), ['Fabtice.app']);
    assert.equal(calls.quit, 0);
    assert.deepEqual(calls.relaunch, []);
  } finally {
    await w.close();
  }
});

test('cancel while it downloads: nothing changed, nothing left', async () => {
  const w = await world({ slow: true });
  try {
    const { updater } = updaterFor(w);
    await updater.check();
    updater.start();
    await until(() => updater.state(), (x) => x.phase === 'downloading' && x.progress.received > 100_000);
    assert.equal(updater.cancel(), true);
    const s = await until(() => updater.state(), (x) => x.phase === 'available');
    assert.equal(s.error, null);
    assert.equal(marker(w.installed), 'old');
    assert.deepEqual(leftInFolder(w), ['Fabtice.app']);
    assert.equal(updater.cancel(), false, 'nothing to cancel any more');
  } finally {
    await w.close();
  }
});

test('not enough room on the disk: said before downloading', async () => {
  const w = await world();
  try {
    const fsx = { ...fs, promises: { ...fs.promises, statfs: async () => ({ bavail: 100, bsize: 4096 }) } };
    const { updater } = updaterFor(w, { fs: fsx });
    await updater.check();
    updater.start();
    const s = await until(() => updater.state(), (x) => x.phase === 'available' && x.error);
    assert.equal(s.error.code, 'disk-space');
    assert.equal(s.room.needed, s.available.size * 3);
    assert.ok(!w.seen.some((u) => u.includes('zip')), 'nothing downloaded');
  } finally {
    await w.close();
  }
});

test('places where it cannot work: said at the check, refused at the start', async () => {
  const w = await world();
  try {
    const { updater } = updaterFor(w, { fs: { ...fs, writeFileSync: () => { throw Object.assign(new Error('ro'), { code: 'EROFS' }); } } });
    const s = await updater.check('launch');
    assert.deepEqual(s.blocked, { code: 'read-only' });
    assert.deepEqual(updater.start(), { ok: false, reason: 'read-only' });
    assert.deepEqual(updater.state().error, { code: 'read-only', during: 'update' });
    assert.equal(marker(w.installed), 'old');
  } finally {
    await w.close();
  }
});

test('the page of the version, for the manual download: GitHub release pages only', async () => {
  const w = await world();
  try {
    const { updater, calls } = updaterFor(w);
    await updater.openPage();
    assert.deepEqual(calls.opened, [LATEST_PAGE]);
    await updater.check();
    await updater.openPage();
    assert.equal(calls.opened[1], 'https://github.com/pelikast/fabtice/releases/tag/v1.0.1');
  } finally {
    await w.close();
  }
});

test('the trial report (test mode only) says the version, the place and what was cleaned', async () => {
  const w = await world();
  try {
    const report = path.join(w.root, 'report.json');
    fakeApp(path.join(w.folder, '.Fabtice-ancienne.app'));
    const u = createUpdater({ currentVersion: '1.0.1', arch: 'x64', platform: 'linux', osVersion: '', execPath: process.execPath, packaged: false, env: { ...w.env, FABTICE_UPDATE_TRIAL_REPORT: report }, fetchImpl: fetch, send() {}, askToLeave: async () => true, relaunch() {}, quit() {}, openExternal: async () => {} });
    u.afterStart();
    const r = JSON.parse(fs.readFileSync(report, 'utf8'));
    assert.equal(r.version, '1.0.1');
    assert.equal(r.place.bundle, w.installed);
    assert.deepEqual(r.cleaned, { removedAside: true, removedStaging: 0 });
    assert.equal(r.asideLeft, false);
    // Without the switch of the tests, no report and no test app.
    const plain = createUpdater({ currentVersion: '1.0.1', arch: 'x64', platform: 'linux', osVersion: '', execPath: process.execPath, packaged: false, env: { FABTICE_UPDATE_TRIAL_REPORT: `${report}.2`, FABTICE_UPDATE_TEST_APP: w.installed }, fetchImpl: fetch, send() {}, askToLeave: async () => true, relaunch() {}, quit() {}, openExternal: async () => {} });
    plain.afterStart();
    assert.equal(fs.existsSync(`${report}.2`), false);
    assert.deepEqual(plain.where(), { ok: false, code: 'not-mac' });
  } finally {
    await w.close();
  }
});

test('the relaunch: a detached shell waits for this process, then opens the new bundle; paths as arguments', () => {
  const spawned = [];
  const spawnImpl = (file, args, options) => {
    spawned.push({ file, args, options });
    return { unref() {} };
  };
  relaunchAfterExit({ bundle: '/Applications/Mes apps é/Fabtice.app', executable: '/Applications/Mes apps é/Fabtice.app/Contents/MacOS/Fabtice' }, { env: { HOME: '/x' }, pid: 4242, spawnImpl });
  const [one] = spawned;
  assert.equal(one.file, '/bin/sh');
  assert.equal(one.options.detached, true);
  assert.deepEqual(one.args.slice(3), ['4242', '/Applications/Mes apps é/Fabtice.app', '/Applications/Mes apps é/Fabtice.app/Contents/MacOS/Fabtice']);
  assert.ok(!one.args[1].includes('Mes apps'), 'no path inside the script');
  assert.match(one.args[1], /\/usr\/bin\/open -n/);
  // In test mode the FABTICE_ variables travel with `open --env`.
  relaunchAfterExit({ bundle: '/a/Fabtice.app', executable: '/a/Fabtice.app/Contents/MacOS/Fabtice' }, { env: { FABTICE_HOLD_WINDOW: '1', FABTICE_USER_DATA: '/tmp/u', OTHER: 'no' }, pid: 1, spawnImpl });
  assert.deepEqual(spawned[1].args.slice(6), ['--env', 'FABTICE_HOLD_WINDOW=1', '--env', 'FABTICE_USER_DATA=/tmp/u']);
});
