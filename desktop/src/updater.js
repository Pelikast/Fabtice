'use strict';

// The automatic update of the Mac app (C16), home-made: no Apple signature, no third-party updater.
//
//   check    the version file (update-version.js) read from the project's latest release on GitHub
//            (update-net.js); a version strictly newer than this one is « available ».
//   start    where the app is (update-place.js: a protected place, a read-only volume, a folder that
//            cannot be written are said, with the manual download); room on the disk (three times the
//            archive); the archive downloaded next to the app (same volume), its size and SHA-256
//            checked against the version file; unpacked and inspected (update-install.js); then the page
//            is asked whether the app may close (close-guard.js: changes not saved); then the swap and
//            the relaunch of the new app once this one has quit.
//   cancel   while it downloads or prepares: everything made is removed, nothing was changed.
//
// The page only ever says « check », « update », « cancel », « open the page »: it never hands a path or
// an address to this process. Its state comes back on `fabtice:update-state` (`state()`), to every window.
//
// Test seams (each only with FABTICE_HOLD_WINDOW=1, the switch of the end-to-end tests):
//   - FABTICE_UPDATE_TEST_ORIGIN: the network is a local server (update-net.js says the rule);
//   - FABTICE_UPDATE_TEST_APP: this folder stands for the installed app (on Linux, where there is no
//     bundle), to reach the download and its checks;
//   - FABTICE_UPDATE_TRIAL_REPORT: an absolute path where the app writes, once started, its version, its
//     path and what it cleaned (the complete trial on the GitHub Macs reads it after the relaunch).

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const versionFile = require('./update-version');
const updateNet = require('./update-net');
const place = require('./update-place');
const install = require('./update-install');

const LATEST_PAGE = 'https://github.com/pelikast/fabtice/releases/latest';
const PROGRESS_MS = 150;
const DOWNLOAD_SHARE = 0.9;

/** The test seams are on only with the switch of the end-to-end tests. */
function testSeams(env = process.env) {
  if (env.FABTICE_HOLD_WINDOW !== '1') return { app: null, report: null };
  const abs = (v) => (typeof v === 'string' && path.isAbsolute(v) ? v : null);
  return { app: abs(env.FABTICE_UPDATE_TEST_APP), report: abs(env.FABTICE_UPDATE_TRIAL_REPORT) };
}

/** Network errors of a check, as the page words them. */
function checkErrorOf(result) {
  if (result.error === 'http' && result.status === 404) return 'unreadable';
  if (result.error === 'http') return 'server';
  if (result.error === 'network' || result.error === 'timeout') return 'network';
  return 'unreadable';
}

/**
 * @param {{
 *   currentVersion: string, arch: string, platform: string, osVersion: string, execPath: string, packaged: boolean,
 *   env?: object, fetchImpl: typeof fetch, send: (state: object) => void,
 *   askToLeave: () => Promise<boolean>, relaunch: (plan: { bundle: string, executable: string }) => void, quit: () => void,
 *   openExternal: (url: string) => Promise<void>, log?: (line: string) => void, deps?: object,
 * }} options
 */
function createUpdater(options) {
  const env = options.env ?? process.env;
  const seams = testSeams(env);
  const log = options.log ?? (() => {});
  const deps = options.deps ?? { fs, run: install.run, platform: options.platform };
  const fsp = deps.fs.promises ?? fs.promises;

  /** What the page is shown. `seq` grows with each answer of a check. */
  let state = {
    current: options.currentVersion,
    phase: 'idle',
    origin: null,
    seq: 0,
    available: null,
    blocked: null,
    progress: null,
    error: null,
    room: null,
  };
  let info = null;
  let checking = null;
  let job = null;
  let lastSent = 0;
  let pendingSend = null;

  function set(patch, { throttle = false } = {}) {
    state = { ...state, ...patch };
    const now = Date.now();
    if (throttle && now - lastSent < PROGRESS_MS) {
      if (!pendingSend) pendingSend = setTimeout(flush, PROGRESS_MS - (now - lastSent));
      return;
    }
    flush();
  }
  function flush() {
    if (pendingSend) clearTimeout(pendingSend);
    pendingSend = null;
    lastSent = Date.now();
    try {
      options.send(state);
    } catch {
      // a window going away
    }
  }

  function where() {
    return place.locate({ execPath: options.execPath, packaged: options.packaged, platform: options.platform, fsImpl: deps.fs, testBundle: seams.app });
  }

  /** What stands in the way of an automatic update here (null: nothing), for the version `next`. */
  function blockerFor(next) {
    if (options.platform === 'darwin' && !versionFile.systemAtLeast(options.osVersion, next.minimumSystemVersion)) return { code: 'system', minimum: next.minimumSystemVersion };
    const at = where();
    return at.ok ? null : { code: at.code };
  }

  /**
   * Reads the version file. `origin`: `launch` (the page, at opening), `page` (Réglages), `menu` (the menu bar).
   * While an update runs, the state is answered as it is.
   */
  function check(origin = 'page') {
    if (job) return Promise.resolve(state);
    // The end-to-end tests run the real address of the page, whose search at opening must not depend on what is
    // published on GitHub that day: under their switch, only a test server is asked.
    if (origin === 'launch' && env.FABTICE_HOLD_WINDOW === '1' && !updateNet.testOrigin(env)) return Promise.resolve(state);
    if (checking) {
      // A manual search during the one at opening: its answer is for the person who asked.
      if (origin !== 'launch') state = { ...state, origin };
      return checking;
    }
    set({ phase: 'checking', origin, error: null, progress: null });
    checking = (async () => {
      const got = await updateNet.fetchVersionFile({ fetchImpl: options.fetchImpl, env });
      if (!got.ok) {
        log(`update check: ${got.error}${got.status ? ` ${got.status}` : ''}${got.detail ? ` (${got.detail})` : ''}`);
        set({ phase: 'failed', error: { code: checkErrorOf(got), during: 'check' }, seq: state.seq + 1, available: null, blocked: null });
        return state;
      }
      const read = versionFile.readVersionFile(got.text);
      if (!read.ok) {
        log(`update check: version file not readable (${read.reason})`);
        set({ phase: 'failed', error: { code: 'unreadable', during: 'check' }, seq: state.seq + 1, available: null, blocked: null });
        return state;
      }
      if (!versionFile.isNewer(read.info.version, options.currentVersion)) {
        info = null;
        set({ phase: 'up-to-date', available: null, blocked: null, error: null, seq: state.seq + 1 });
        return state;
      }
      info = read.info;
      const download = info.downloads[options.arch];
      set({
        phase: 'available',
        available: { version: info.version, notes: info.notes, publishedAt: info.publishedAt, size: download ? download.size : 0 },
        blocked: download ? blockerFor(info) : { code: 'not-mac' },
        error: null,
        seq: state.seq + 1,
      });
      return state;
    })()
      .catch((e) => {
        log(`update check failed: ${e && e.stack ? e.stack : e}`);
        set({ phase: 'failed', error: { code: 'unreadable', during: 'check' }, seq: state.seq + 1 });
        return state;
      })
      .finally(() => {
        checking = null;
      });
    return checking;
  }

  /** The end of an update that did not go through: the work folder removed, the old app in place, `error` said. */
  function giveUp(staging, error, extra = {}) {
    if (staging) install.removeQuiet(staging.dir, deps);
    job = null;
    set({ phase: info ? 'available' : 'idle', progress: null, error, ...extra });
  }

  /** « Mettre à jour Fabtice ». Answers at once; the progress and the result come through the state. */
  function start() {
    if (job) return { ok: false, reason: 'busy' };
    if (!info || (state.phase !== 'available' && state.phase !== 'failed')) return { ok: false, reason: 'not-available' };
    const next = info;
    const download = next.downloads[options.arch];
    if (!download) return { ok: false, reason: 'not-available' };
    const blocker = blockerFor(next);
    if (blocker) {
      set({ blocked: blocker, error: { code: blocker.code, during: 'update' } });
      return { ok: false, reason: blocker.code };
    }
    const controller = new AbortController();
    job = { controller };
    set({ phase: 'downloading', progress: { fraction: 0, received: 0, total: download.size }, error: null, blocked: null, room: null });
    void run(next, download, controller).catch((e) => {
      log(`update failed: ${e && e.stack ? e.stack : e}`);
      giveUp(job && job.staging, { code: 'install', during: 'update' });
    });
    return { ok: true };
  }

  async function run(next, download, controller) {
    const at = where();
    if (!at.ok) return giveUp(null, { code: at.code, during: 'update' });
    const target = at.bundle;
    const needed = place.roomNeeded(download.size);
    const free = await place.freeBytes(at.folder, fsp);
    if (free !== null && free < needed) return giveUp(null, { code: 'disk-space', during: 'update' }, { room: { needed, free } });
    let staging;
    try {
      staging = install.makeStaging(at.folder, deps);
    } catch (e) {
      log(`update: work folder: ${e.message}`);
      return giveUp(null, { code: 'not-writable', during: 'update' });
    }
    job.staging = staging;
    log(`update: ${options.currentVersion} -> ${next.version}, ${download.size} bytes into ${staging.dir}`);

    // 1. The archive, its size and its SHA-256.
    const got = await updateNet.downloadArchive({
      url: download.url,
      size: download.size,
      file: staging.archive,
      fetchImpl: options.fetchImpl,
      env,
      signal: controller.signal,
      onProgress: ({ received, total }) => set({ progress: { fraction: (received / total) * DOWNLOAD_SHARE, received, total } }, { throttle: true }),
    });
    if (!got.ok) {
      log(`update download: ${got.error} ${got.detail || ''}`);
      if (got.error === 'cancelled') return giveUp(staging, null);
      if (got.error === 'size') return giveUp(staging, { code: 'damaged', during: 'update' });
      if (got.error === 'disk-full') return giveUp(staging, { code: 'disk-space', during: 'update' }, { room: { needed, free } });
      return giveUp(staging, { code: 'download', during: 'update' });
    }
    if (got.sha256 !== download.sha256) {
      log(`update download: SHA-256 ${got.sha256} instead of ${download.sha256}`);
      return giveUp(staging, { code: 'damaged', during: 'update' });
    }
    if (controller.signal.aborted) return giveUp(staging, null);

    // A file this process writes is not put in quarantine by macOS; should it be (a system set up so), the
    // mark is taken off the archive, never off the app: else the new app would open from a protected place.
    if (options.platform === 'darwin') {
      const q = await deps.run('/usr/bin/xattr', ['-p', 'com.apple.quarantine', staging.archive], { timeout: 10_000 });
      if (q.code === 0) {
        log(`update: the archive was in quarantine (${q.stdout.trim()}): mark removed from the archive`);
        await deps.run('/usr/bin/xattr', ['-d', 'com.apple.quarantine', staging.archive], { timeout: 10_000 });
      } else {
        log('update: the archive is not in quarantine');
      }
    }

    // 2. Unpacked next to it, checked.
    set({ phase: 'preparing', progress: { fraction: DOWNLOAD_SHARE, received: download.size, total: download.size } });
    let inspected;
    try {
      await install.unpack(staging, deps, (f) => set({ progress: { fraction: DOWNLOAD_SHARE + f * (1 - DOWNLOAD_SHARE) * 0.8, received: download.size, total: download.size } }, { throttle: true }));
      if (controller.signal.aborted) return giveUp(staging, null);
      inspected = await install.inspectBundle(staging.unpacked, { version: next.version, arch: options.arch }, deps);
    } catch (e) {
      log(`update prepare: ${e.message}`);
      if (controller.signal.aborted) return giveUp(staging, null);
      return giveUp(staging, { code: e && e.step === 'unpack' && /No space|ENOSPC/i.test(e.message) ? 'disk-space' : 'install', during: 'update' });
    }
    log(`update: new app checked (${inspected.archs.join(',')}, signature ${inspected.signature})`);
    if (controller.signal.aborted) return giveUp(staging, null);
    set({ progress: { fraction: 1, received: download.size, total: download.size } });

    // 3. The page is asked whether the app may close (changes not saved): a refusal leaves everything as it was.
    set({ phase: 'closing' });
    let mayClose = false;
    try {
      mayClose = await options.askToLeave();
    } catch {
      mayClose = false;
    }
    if (!mayClose) {
      log('update: closing refused on the page');
      return giveUp(staging, { code: 'refused', during: 'update' });
    }

    // 4. The swap; at any failure the installed app is put back.
    try {
      await install.swap({ target, unpacked: staging.unpacked, version: next.version }, deps);
    } catch (e) {
      log(`update swap: ${e.message}`);
      return giveUp(staging, { code: 'install', during: 'update' });
    }
    install.removeQuiet(staging.dir, deps);
    set({ phase: 'restarting', progress: null });
    log(`update: ${next.version} in place, relaunching`);
    options.relaunch({ bundle: target, executable: path.join(target, 'Contents', 'MacOS', inspected.executableName) });
    options.quit();
  }

  /** « Annuler » while it downloads or prepares (not once the app is asked to close). */
  function cancel() {
    if (!job || (state.phase !== 'downloading' && state.phase !== 'preparing')) return false;
    job.controller.abort();
    return true;
  }

  /** The version's page in the browser (manual download): only the project's release pages on GitHub. */
  async function openPage() {
    const url = info && versionFile.isReleaseAddress(info.page, 'page') ? info.page : LATEST_PAGE;
    try {
      await options.openExternal(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * At start: what the last update left next to the app (the old app set aside, work folders) is removed,
   * now that this one runs; the trial report written in test mode.
   */
  function afterStart() {
    const at = where();
    let cleaned = { removedAside: false, removedStaging: 0 };
    if (at.ok) {
      cleaned = install.cleanLeftovers(at.folder, at.bundle, deps);
      if (cleaned.removedAside || cleaned.removedStaging) log(`update: left-overs removed (${JSON.stringify(cleaned)})`);
    }
    if (seams.report) {
      const report = {
        version: options.currentVersion,
        pid: process.pid,
        execPath: (() => {
          try {
            return fs.realpathSync(options.execPath);
          } catch {
            return options.execPath;
          }
        })(),
        place: at.ok ? { ok: true, bundle: at.bundle, folder: at.folder } : at,
        cleaned,
        asideLeft: at.ok ? fs.existsSync(path.join(at.folder, place.ASIDE_NAME)) : null,
        at: new Date().toISOString(),
      };
      try {
        fs.writeFileSync(seams.report, JSON.stringify(report, null, 2));
      } catch (e) {
        log(`update trial report: ${e.message}`);
      }
    }
    return cleaned;
  }

  return { state: () => state, check, start, cancel, openPage, afterStart, where };
}

/**
 * Starts the new app once this process has quit: a small detached shell waits for this process id to be
 * gone, then asks macOS to open the bundle (`open -n`, as the Finder does). Paths travel as arguments, never
 * inside the script. In test mode the variables `FABTICE_*` are handed on (`open --env`), so that the
 * relaunched app writes its trial report; should `open` fail, the executable is started directly.
 */
function relaunchAfterExit({ bundle, executable }, { env = process.env, pid = process.pid, spawnImpl = spawn } = {}) {
  const script = [
    'pid="$1"; bundle="$2"; exe="$3"; shift 3',
    'i=0; while kill -0 "$pid" 2>/dev/null && [ "$i" -lt 600 ]; do sleep 0.1; i=$((i+1)); done',
    'if [ "$#" -gt 0 ]; then /usr/bin/open -n "$@" "$bundle" || exec "$exe"; else /usr/bin/open -n "$bundle" || exec "$exe"; fi',
  ].join('\n');
  const passed = [];
  if (env.FABTICE_HOLD_WINDOW === '1') {
    for (const [k, v] of Object.entries(env)) {
      if (k.startsWith('FABTICE_') && typeof v === 'string' && !/[\n\r]/.test(v)) passed.push('--env', `${k}=${v}`);
    }
  }
  const trialLog = testSeams(env).report ? `${testSeams(env).report}.relaunch.log` : null;
  const out = trialLog ? fs.openSync(trialLog, 'a') : 'ignore';
  const child = spawnImpl('/bin/sh', ['-c', script, 'fabtice-relaunch', String(pid), bundle, executable, ...passed], {
    detached: true,
    stdio: ['ignore', out, out],
    env,
  });
  child.unref();
  return child;
}

module.exports = { createUpdater, relaunchAfterExit, testSeams, LATEST_PAGE };
