'use strict';

// The complete trial of the automatic update (C16), on a GitHub Mac (macOS only: ditto, codesign, open):
//
//   1. the app as built (its own number) is installed in a writable folder whose name has spaces and accents;
//   2. a fake newer version, a real second build of the same sources with a higher number, is served with its
//      version file (made by ci/make-version-file.js) from a local server standing for GitHub: the release
//      address, then a redirect to the storage host, as GitHub does (the test address of update-net.js);
//   3. the installed app is launched, finds the new version, updates itself, quits and is relaunched; the
//      relaunched app writes its trial report (its number, its place, what it cleaned): the new number is
//      read from the app that runs, the old copy is gone, the signature of the bundle still verifies, it
//      is not in quarantine;
//   4. a tampered archive (one byte off) is refused: the installed app is unchanged and still starts;
//   5. a folder this account cannot write (chmod), and the protected place of App Translocation (a copy
//      under …/AppTranslocation/…/d/, the path macOS gives): said, nothing touched.
//
// Environment:
//   FABTICE_TRIAL_APP_ZIP   the archive of the app as built (Fabtice-mac-apple-silicon.zip or …-intel.zip)
//   FABTICE_TRIAL_NEW_ZIP   the archive of the fake newer build, same name, in another folder
//   FABTICE_TRIAL_ARCH      arm64 or x64
//   FABTICE_TRIAL_OUT       where the reports and logs are copied (optional)
//
//   node test/trial/update-trial.js

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { makeVersionFile } = require('../../ci/make-version-file');
const { ARCHIVE_NAMES } = require('../../src/update-version');

const APP_ZIP = process.env.FABTICE_TRIAL_APP_ZIP;
const NEW_ZIP = process.env.FABTICE_TRIAL_NEW_ZIP;
const ARCH = process.env.FABTICE_TRIAL_ARCH;
const OUT = process.env.FABTICE_TRIAL_OUT || null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[trial ${new Date().toISOString().slice(11, 19)}]`, ...a);

function sh(file, args, opts = {}) {
  const r = spawnSync(file, args, { encoding: 'utf8', ...opts });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}`.trim() };
}

const plistValue = (bundle, key) => execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, path.join(bundle, 'Contents', 'Info.plist')], { encoding: 'utf8' }).trim();

/** A fresh copy of the app as built, unpacked by ditto into `folder` (made here). */
function installInto(folder) {
  fs.mkdirSync(folder, { recursive: true });
  execFileSync('/usr/bin/ditto', ['-x', '-k', APP_ZIP, folder]);
  const bundle = path.join(folder, 'Fabtice.app');
  assert.ok(fs.existsSync(bundle), 'the archive holds Fabtice.app');
  return fs.realpathSync(bundle);
}

/** The local GitHub: the version file and the archives, with GitHub's redirects. `tamper`: the archive served one byte off. */
async function fakeGitHub(dir, versionFile, options) {
  const seen = [];
  const srv = http.createServer((req, res) => {
    seen.push(req.url);
    const url = req.url;
    const tag = `v${versionFile.version}`;
    if (url === '/github.com/pelikast/fabtice/releases/latest/download/fabtice-version.json') {
      return res.writeHead(302, { location: `https://github.com/pelikast/fabtice/releases/download/${tag}/fabtice-version.json` }).end();
    }
    if (url === `/github.com/pelikast/fabtice/releases/download/${tag}/fabtice-version.json`) {
      return res.writeHead(302, { location: 'https://objects.githubusercontent.com/github-production-release-asset-2e65be/1/version?X-Amz-Signature=abc' }).end();
    }
    if (url === '/objects.githubusercontent.com/github-production-release-asset-2e65be/1/version?X-Amz-Signature=abc') {
      return res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(JSON.stringify(versionFile));
    }
    for (const name of Object.values(ARCHIVE_NAMES)) {
      if (url === `/github.com/pelikast/fabtice/releases/download/${tag}/${name}`) {
        return res.writeHead(302, { location: `https://release-assets.githubusercontent.com/github-production-release-asset/2/${name}?sp=r&sig=def` }).end();
      }
      if (url === `/release-assets.githubusercontent.com/github-production-release-asset/2/${name}?sp=r&sig=def`) {
        const file = path.join(dir, name);
        const size = fs.statSync(file).size;
        res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': size });
        if (!options.tamper) return fs.createReadStream(file).pipe(res);
        const bytes = fs.readFileSync(file);
        bytes[Math.floor(bytes.length / 2)] ^= 0x01;
        return res.end(bytes);
      }
    }
    res.writeHead(404).end('not here');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { origin: `http://127.0.0.1:${srv.address().port}`, seen, close: () => new Promise((r) => (srv.closeAllConnections(), srv.close(r))) };
}

/** Launches the installed app (Playwright, held first window, as the e2e tests do) on the debug address. */
async function launch(bundle, env) {
  process.env.FABTICE_E2E_APP = path.join(bundle, 'Contents', 'MacOS', 'Fabtice');
  // helpers.js reads FABTICE_E2E_APP when it launches.
  const { launchApp, windowByUrl } = require('../e2e/helpers');
  const app = await launchApp({ FABTICE_E2E_QUERY: '?debug', ...env });
  const page = await windowByUrl(app, 'fabtice://app/');
  await page.waitForFunction(() => typeof window.fabtice?.checkForUpdate === 'function', null, { timeout: 60000 });
  return { app, page };
}

const status = (page) => page.evaluate(() => window.fabtice.updateStatus());

async function waitFor(get, ok, ms, what) {
  const end = Date.now() + ms;
  let last;
  for (;;) {
    try {
      last = await get();
      if (ok(last)) return last;
    } catch (e) {
      last = { error: String(e && e.message) };
    }
    if (Date.now() > end) throw new Error(`${what}: timed out; last ${JSON.stringify(last).slice(0, 600)}`);
    await sleep(250);
  }
}

function processGone(pid) {
  try {
    process.kill(pid, 0);
    return false;
  } catch {
    return true;
  }
}

function copyOut(file, name) {
  if (!OUT || !fs.existsSync(file)) return;
  fs.mkdirSync(OUT, { recursive: true });
  fs.copyFileSync(file, path.join(OUT, name));
}

async function main() {
  assert.equal(process.platform, 'darwin', 'the complete trial needs macOS');
  assert.ok(APP_ZIP && NEW_ZIP && (ARCH === 'arm64' || ARCH === 'x64'), 'FABTICE_TRIAL_APP_ZIP, FABTICE_TRIAL_NEW_ZIP, FABTICE_TRIAL_ARCH');
  const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-trial-')));
  log('work folder', work);

  // ---------------------------------------------------------------- the two versions
  const probe = installInto(path.join(work, 'probe'));
  const current = plistValue(probe, 'CFBundleShortVersionString');
  fs.rmSync(path.join(work, 'probe'), { recursive: true, force: true });
  const probeNew = path.join(work, 'probe-new');
  fs.mkdirSync(probeNew);
  execFileSync('/usr/bin/ditto', ['-x', '-k', NEW_ZIP, probeNew]);
  const next = plistValue(path.join(probeNew, 'Fabtice.app'), 'CFBundleShortVersionString');
  assert.equal(plistValue(path.join(probeNew, 'Fabtice.app'), 'CFBundleIdentifier'), 'org.fabtice.desktop');
  fs.rmSync(probeNew, { recursive: true, force: true });
  log(`installed version ${current}, fake newer build ${next} (${ARCH})`);
  assert.notEqual(current, next);

  // The served folder: this chip's new archive, and a stand-in for the other chip's (the version file names both).
  const served = path.join(work, 'served');
  fs.mkdirSync(served);
  const mine = ARCHIVE_NAMES[ARCH];
  const other = ARCHIVE_NAMES[ARCH === 'arm64' ? 'x64' : 'arm64'];
  fs.copyFileSync(NEW_ZIP, path.join(served, mine));
  fs.writeFileSync(path.join(served, other), crypto.randomBytes(1_100_000));
  const changelog = path.join(work, 'CHANGELOG.md');
  fs.writeFileSync(changelog, `# Nouveautés\n\n## Version ${next}\n\n### Essai\n- Une version factice, pour l'essai de la mise à jour.\n\n## Version ${current}\n\n- Avant.\n`);
  const versionFile = makeVersionFile({ version: next, tag: `v${next}`, zips: { arm64: path.join(served, ARCHIVE_NAMES.arm64), x64: path.join(served, ARCHIVE_NAMES.x64) }, changelog });
  fs.writeFileSync(path.join(work, 'fabtice-version.json'), JSON.stringify(versionFile, null, 2));
  copyOut(path.join(work, 'fabtice-version.json'), `trial-${ARCH}-fabtice-version.json.txt`);
  log('version file', JSON.stringify(versionFile.downloads[ARCH]));

  const results = [];
  const step = async (name, fn) => {
    log(`---- ${name}`);
    const started = Date.now();
    await fn();
    results.push(`${name}: ok (${Math.round((Date.now() - started) / 1000)} s)`);
    log(`---- ${name}: ok`);
  };

  // ---------------------------------------------------------------- 1. the real update
  await step('update to the fake newer version, relaunch, old copy removed', async () => {
    const net = await fakeGitHub(served, versionFile, { tamper: false });
    const folder = path.join(work, 'Applications d’essai é', 'Mes apps');
    const bundle = installInto(folder);
    const report = path.join(work, 'report-update.json');
    const env = {
      FABTICE_UPDATE_TEST_ORIGIN: net.origin,
      FABTICE_USER_DATA: path.join(work, 'user-data-update'),
      FABTICE_UPDATE_TRIAL_REPORT: report,
      // The question about closing is asked for real (no piece open: the page lets the app go at once).
      FABTICE_NO_CLOSE_GUARD: '0',
    };
    const { app, page } = await launch(bundle, env);
    const oldPid = app.process().pid;
    // The first start of the installed app writes its own report: nothing to clean, its own number.
    const first = await waitFor(() => JSON.parse(fs.readFileSync(report, 'utf8')), (r) => r.pid === oldPid, 30000, 'first report');
    assert.equal(first.version, current);
    fs.rmSync(report);
    const checked = await page.evaluate(() => window.fabtice.checkForUpdate('page'));
    log('check', JSON.stringify({ phase: checked.phase, available: checked.available && checked.available.version, blocked: checked.blocked, error: checked.error }));
    assert.equal(checked.phase, 'available');
    assert.equal(checked.available.version, next);
    assert.equal(checked.blocked, null);
    const started = await page.evaluate(() => window.fabtice.startUpdate());
    assert.deepEqual(started, { ok: true });
    const phases = [];
    await waitFor(async () => {
      if (processGone(oldPid)) return { gone: true };
      const s = await status(page);
      if (phases.at(-1) !== s.phase) phases.push(s.phase);
      return s;
    }, (s) => s.gone || s.phase === 'restarting' || (s.phase === 'available' && s.error), 6 * 60000, 'update');
    const last = processGone(oldPid) ? null : await status(page).catch(() => null);
    if (last && last.error) throw new Error(`the update failed: ${JSON.stringify(last.error)}`);
    log('phases seen', phases.join(' → '));
    await waitFor(() => processGone(oldPid), (g) => g, 60000, 'the old app quits');
    await app.close().catch(() => {});
    // The relaunched app, started by `open -n` once the old one had quit, writes its report.
    const r = await waitFor(() => JSON.parse(fs.readFileSync(report, 'utf8')), (x) => x.pid !== oldPid, 120000, 'report of the relaunched app');
    copyOut(report, `trial-${ARCH}-report-update.json.txt`);
    copyOut(`${report}.relaunch.log`, `trial-${ARCH}-relaunch.log.txt`);
    log('relaunched app', JSON.stringify(r));
    if (fs.existsSync(`${report}.relaunch.log`)) log('relaunch log:', fs.readFileSync(`${report}.relaunch.log`, 'utf8').trim() || '(empty)');
    try {
      assert.equal(r.version, next, 'the relaunched app runs the new number');
      assert.equal(r.execPath, path.join(bundle, 'Contents', 'MacOS', 'Fabtice'), 'from the same place');
      assert.equal(r.cleaned.removedAside, true, 'the old copy is removed at the next start');
      assert.equal(r.asideLeft, false);
    } finally {
      try {
        process.kill(r.pid, 'SIGTERM');
      } catch {
        // gone
      }
      await waitFor(() => processGone(r.pid), (g) => g, 20000, 'the relaunched app quits').catch(() => process.kill(r.pid, 'SIGKILL'));
    }
    assert.equal(plistValue(bundle, 'CFBundleShortVersionString'), next, 'the bundle in place is the new version');
    assert.deepEqual(fs.readdirSync(folder).sort(), ['Fabtice.app'], 'no old copy, no work folder left');
    const sign = sh('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', bundle]);
    log('codesign', sign.code, sign.out.split('\n').slice(-2).join(' | '));
    assert.equal(sign.code, 0, 'the signature of the new bundle verifies');
    const quarantine = sh('/usr/bin/xattr', ['-p', 'com.apple.quarantine', bundle]);
    log('quarantine attribute of the new bundle:', quarantine.code === 0 ? quarantine.out : 'none');
    assert.notEqual(quarantine.code, 0, 'the new bundle is not in quarantine');
    const hits = net.seen.filter((u) => u.includes('release-assets.githubusercontent.com') && u.includes(mine)).length;
    assert.equal(hits, 1, 'the archive went through the redirect to the storage host, once');
    // And it starts again, by itself, on its new number.
    const again = await launch(bundle, { FABTICE_USER_DATA: path.join(work, 'user-data-update') });
    assert.equal(await again.app.evaluate(({ app: a }) => a.getVersion()), next);
    await again.app.close();
    await net.close();
  });

  // ---------------------------------------------------------------- 2. a tampered archive
  await step('a tampered archive is refused; the installed app is unchanged and starts', async () => {
    const net = await fakeGitHub(served, versionFile, { tamper: true });
    const folder = path.join(work, 'Applications altérées');
    const bundle = installInto(folder);
    const env = { FABTICE_UPDATE_TEST_ORIGIN: net.origin, FABTICE_USER_DATA: path.join(work, 'user-data-tamper') };
    const { app, page } = await launch(bundle, env);
    assert.equal((await page.evaluate(() => window.fabtice.checkForUpdate('page'))).phase, 'available');
    assert.deepEqual(await page.evaluate(() => window.fabtice.startUpdate()), { ok: true });
    const s = await waitFor(() => status(page), (x) => x.phase === 'available' && x.error, 5 * 60000, 'refusal');
    assert.deepEqual(s.error, { code: 'damaged', during: 'update' });
    await app.close();
    assert.equal(plistValue(bundle, 'CFBundleShortVersionString'), current);
    assert.deepEqual(fs.readdirSync(folder).sort(), ['Fabtice.app'], 'nothing left beside it');
    const again = await launch(bundle, env);
    assert.equal(await again.app.evaluate(({ app: a }) => a.getVersion()), current, 'it still starts, on its number');
    await again.app.close();
    await net.close();
  });

  // ---------------------------------------------------------------- 3. a folder that cannot be written
  await step('a folder this account cannot write: said, nothing touched', async () => {
    const net = await fakeGitHub(served, versionFile, { tamper: false });
    const folder = path.join(work, 'Dossier protégé');
    const bundle = installInto(folder);
    fs.chmodSync(folder, 0o555);
    try {
      const { app, page } = await launch(bundle, { FABTICE_UPDATE_TEST_ORIGIN: net.origin, FABTICE_USER_DATA: path.join(work, 'user-data-ro') });
      const s = await page.evaluate(() => window.fabtice.checkForUpdate('page'));
      assert.deepEqual(s.blocked, { code: 'not-writable' });
      assert.deepEqual(await page.evaluate(() => window.fabtice.startUpdate()), { ok: false, reason: 'not-writable' });
      await app.close();
      assert.equal(plistValue(bundle, 'CFBundleShortVersionString'), current);
      assert.ok(!net.seen.some((u) => u.endsWith('.zip')), 'nothing downloaded');
    } finally {
      fs.chmodSync(folder, 0o755);
      await net.close();
    }
  });

  // ---------------------------------------------------------------- 4. the protected place of App Translocation
  await step('the protected place of App Translocation (path rule): said, nothing touched', async () => {
    const net = await fakeGitHub(served, versionFile, { tamper: false });
    // The temporary folder of the runner is under /private/var/folders/…: the place macOS gives such a copy.
    const folder = path.join(work, 'AppTranslocation', '0F1E2D3C-ESSA-I000-0000-000000000000', 'd');
    const bundle = installInto(folder);
    assert.match(bundle, /^\/private\/var\/folders\/.+\/AppTranslocation\//);
    const { app, page } = await launch(bundle, { FABTICE_UPDATE_TEST_ORIGIN: net.origin, FABTICE_USER_DATA: path.join(work, 'user-data-tr') });
    const s = await page.evaluate(() => window.fabtice.checkForUpdate('page'));
    assert.deepEqual(s.blocked, { code: 'translocated' });
    assert.deepEqual(await page.evaluate(() => window.fabtice.startUpdate()), { ok: false, reason: 'translocated' });
    await app.close();
    assert.deepEqual(fs.readdirSync(folder), ['Fabtice.app']);
    await net.close();
  });

  log('==== all done');
  for (const r of results) log(r);
  fs.rmSync(work, { recursive: true, force: true });
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(`[trial] FAILED: ${e && e.stack ? e.stack : e}`);
    process.exit(1);
  },
);
