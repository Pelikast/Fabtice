'use strict';

// Where the running app is, and whether it can replace itself there (C16).
//
// The update renames the installed `Fabtice.app` aside and puts the new one in its place, in the same
// folder. That needs a real, writable place. It cannot work when:
//   - macOS runs the app from a protected copy (« App Translocation »): an app downloaded from the
//     internet and opened where it landed (Téléchargements, the disk image) without being moved runs
//     from a random read-only folder such as
//     /private/var/folders/xx/yyyy/T/AppTranslocation/<UUID>/d/Fabtice.app ;
//   - the app is on a read-only volume (the mounted disk image itself: /Volumes/Fabtice/Fabtice.app);
//   - its folder cannot be written with this account (an /Applications set up for administrators only);
//   - it is not a packaged app bundle (development, `electron .`), or not on macOS.
// Each case has its code; the page says it in French and offers the manual download.

const fs = require('node:fs');
const path = require('node:path');

const BUNDLE_NAME = 'Fabtice.app';
const ASIDE_NAME = '.Fabtice-ancienne.app';
const STAGING_PREFIX = '.Fabtice-maj-';

/**
 * The `.app` bundle that holds an executable `…/X.app/Contents/MacOS/<exe>`, or null.
 * @param {string} execPath
 */
function bundleOf(execPath) {
  if (typeof execPath !== 'string') return null;
  const macos = path.dirname(execPath);
  const contents = path.dirname(macos);
  const bundle = path.dirname(contents);
  if (path.basename(macos) !== 'MacOS' || path.basename(contents) !== 'Contents' || !bundle.endsWith('.app')) return null;
  return bundle;
}

/** True for a path macOS's App Translocation gave (real path, i.e. with /private). */
function isTranslocated(realBundlePath) {
  return typeof realBundlePath === 'string' && /^\/private\/var\/folders\/.+\/AppTranslocation\//.test(realBundlePath);
}

/**
 * Can the folder of the bundle be written? A file is created and removed there (the only sure test: the
 * permission bits do not tell about a read-only volume, an ACL or a sandbox).
 * @returns {'ok' | 'read-only' | 'not-writable'}
 */
function probeWritable(folder, fsImpl = fs) {
  const probe = path.join(folder, `${STAGING_PREFIX}essai-${process.pid}-${Date.now()}`);
  try {
    fsImpl.writeFileSync(probe, '', { flag: 'wx' });
    fsImpl.rmSync(probe, { force: true });
    return 'ok';
  } catch (e) {
    if (e && e.code === 'EROFS') return 'read-only';
    return 'not-writable';
  }
}

/**
 * Where the app is and whether it can update itself there.
 * @param {{ execPath: string, packaged: boolean, platform: string, fsImpl?: typeof fs, testBundle?: string | null }} options
 *   `testBundle`: the test seam (FABTICE_UPDATE_TEST_APP, see updater.js): this folder stands for the bundle.
 * @returns {{ ok: true, bundle: string, folder: string } | { ok: false, code: 'not-packaged' | 'not-mac' | 'translocated' | 'read-only' | 'not-writable' }}
 */
function locate({ execPath, packaged, platform, fsImpl = fs, testBundle = null }) {
  let bundle;
  if (testBundle) {
    bundle = testBundle;
  } else {
    if (platform !== 'darwin') return { ok: false, code: 'not-mac' };
    if (!packaged) return { ok: false, code: 'not-packaged' };
    bundle = bundleOf(execPath);
    if (!bundle) return { ok: false, code: 'not-packaged' };
  }
  let real;
  try {
    real = fsImpl.realpathSync(bundle);
  } catch {
    return { ok: false, code: 'not-packaged' };
  }
  if (isTranslocated(real)) return { ok: false, code: 'translocated' };
  // A volume mounted from a disk image is read-only: the probe below says so (EROFS).
  const folder = path.dirname(real);
  const writable = probeWritable(folder, fsImpl);
  if (writable !== 'ok') return { ok: false, code: writable };
  return { ok: true, bundle: real, folder };
}

/** Free bytes on the volume of `folder`, or null when the system cannot tell. */
async function freeBytes(folder, fsp = fs.promises) {
  try {
    const s = await fsp.statfs(folder);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

/** The room the update needs next to the app: the archive, what it unpacks to and a margin (three times the archive). */
function roomNeeded(archiveBytes) {
  return archiveBytes * 3;
}

module.exports = { BUNDLE_NAME, ASIDE_NAME, STAGING_PREFIX, bundleOf, isTranslocated, probeWritable, locate, freeBytes, roomNeeded };
