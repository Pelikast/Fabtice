'use strict';

// Putting the new version in place (C16), next to the installed app, on the same volume:
//
//   <folder>/Fabtice.app                  the installed app (the one running)
//   <folder>/.Fabtice-maj-<random>/       the work folder of this update (made fresh, removed at the end)
//       Fabtice.zip                       the archive, downloaded and checked (size, SHA-256)
//       Fabtice.app                       the archive unpacked by `ditto -x -k` (keeps the signature and attributes)
//   <folder>/.Fabtice-ancienne.app        the old app, set aside during the swap, removed at the next start
//
// The unpacked app is checked before anything is touched (`inspectBundle`): one `Fabtice.app`, a real
// folder; its Info.plist says `org.fabtice.desktop` and the announced version; its executable is there,
// is a Mach-O file for this chip and runs (`ELECTRON_RUN_AS_NODE=1 <exe> -e …`: on an Apple chip the
// system refuses to start a program whose signature is broken); on an Apple chip `codesign --verify`
// passes. Only then the swap (`swap`): the installed app renamed aside, the new one renamed into its
// place, the result read back. A failure at any step puts the old app back where it was (`rollback`):
// it stays intact and usable, and nothing inside an app bundle is ever modified.
//
// Every system call goes through `deps` (`fs`, `run`), so that the plan can be tested on a folder tree of
// fake apps (test/unit/update-install.test.js).

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { ASIDE_NAME, STAGING_PREFIX } = require('./update-place');

const BUNDLE_ID = 'org.fabtice.desktop';
const UNPACKED = 'Fabtice.app';
const ARCHIVE = 'Fabtice.zip';
const CPU = { x64: 0x01000007, arm64: 0x0100000c };

/** `execFile` as a promise: `{ code, stdout, stderr }` (never rejects on a non-zero exit). */
function run(file, args, options = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: options.timeout ?? 120_000, env: options.env ?? process.env, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : -1) : 0, stdout: String(stdout || ''), stderr: String(stderr || ''), error: err ? err.message : null });
    });
  });
}

const defaultDeps = () => ({ fs, run, platform: process.platform });

class InstallError extends Error {
  /** @param {string} step where it failed (for the diagnostics; the page says one sentence for all) */
  constructor(step, detail) {
    super(`${step}${detail ? `: ${detail}` : ''}`);
    this.step = step;
  }
}

// ---------------------------------------------------------------- the work folder

/** A new, empty work folder next to the installed app. */
function makeStaging(folder, deps = defaultDeps()) {
  const dir = path.join(folder, `${STAGING_PREFIX}${crypto.randomBytes(6).toString('hex')}`);
  deps.fs.mkdirSync(dir, { mode: 0o755 });
  return { dir, archive: path.join(dir, ARCHIVE), unpacked: path.join(dir, UNPACKED) };
}

function removeQuiet(p, deps = defaultDeps()) {
  try {
    deps.fs.rmSync(p, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- the archive

/**
 * The total size of the files of a zip archive (from its central directory), to follow the unpacking.
 * Null when the archive cannot be read that way (the progress then uses an estimate).
 */
function zipUncompressedSize(file, fsImpl = fs) {
  let fd;
  try {
    fd = fsImpl.openSync(file, 'r');
    const size = fsImpl.fstatSync(fd).size;
    const tailLength = Math.min(size, 22 + 65535);
    const tail = Buffer.alloc(tailLength);
    fsImpl.readSync(fd, tail, 0, tailLength, size - tailLength);
    let eocd = -1;
    for (let i = tailLength - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) return null;
    const entries = tail.readUInt16LE(eocd + 10);
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    if (entries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff || cdOffset + cdSize > size) return null;
    const cd = Buffer.alloc(cdSize);
    fsImpl.readSync(fd, cd, 0, cdSize, cdOffset);
    let total = 0;
    let at = 0;
    for (let n = 0; n < entries; n++) {
      if (at + 46 > cd.length || cd.readUInt32LE(at) !== 0x02014b50) return null;
      const uncompressed = cd.readUInt32LE(at + 24);
      if (uncompressed === 0xffffffff) return null;
      total += uncompressed;
      at += 46 + cd.readUInt16LE(at + 28) + cd.readUInt16LE(at + 30) + cd.readUInt16LE(at + 32);
    }
    return total;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        fsImpl.closeSync(fd);
      } catch {
        // ignore
      }
    }
  }
}

/** Bytes of the files under `dir` (links not followed), for the progress of the unpacking. */
function treeBytes(dir, fsImpl = fs) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let names;
    try {
      names = fsImpl.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of names) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else {
        try {
          total += fsImpl.lstatSync(p).size;
        } catch {
          // being written
        }
      }
    }
  }
  return total;
}

/**
 * Unpacks the archive into the work folder with `ditto -x -k` (the Finder's own way: it keeps the
 * signature, the links and the extended attributes of the bundle). `onProgress(fraction)` follows it.
 */
async function unpack(staging, deps = defaultDeps(), onProgress) {
  const expected = zipUncompressedSize(staging.archive, deps.fs) ?? deps.fs.statSync(staging.archive).size * 2.4;
  const timer = onProgress
    ? setInterval(() => onProgress(Math.min(0.99, treeBytes(path.join(staging.dir, UNPACKED), deps.fs) / Math.max(1, expected))), 300)
    : null;
  try {
    const result = await deps.run('/usr/bin/ditto', ['-x', '-k', staging.archive, staging.dir], { timeout: 10 * 60_000 });
    if (result.code !== 0) throw new InstallError('unpack', (result.stderr || result.error || '').trim().slice(0, 300));
  } finally {
    if (timer) clearInterval(timer);
  }
  onProgress?.(1);
}

// ---------------------------------------------------------------- what was unpacked

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** The top-level string values of an XML property list (`<key>K</key><string>V</string>` at the first depth). */
function readXmlPlist(text) {
  const out = {};
  const re = /<(\/?)([A-Za-z]+)\b[^>]*?(\/?)>/g;
  const valueTags = new Set(['key', 'string', 'integer', 'real', 'date', 'data']);
  let depth = 0;
  let key = null;
  let m;
  while ((m = re.exec(text))) {
    const [, closing, tag, selfClosing] = m;
    if (tag === 'dict' || tag === 'array') {
      if (!closing && depth === 1) key = null;
      if (!selfClosing) depth += closing ? -1 : 1;
      continue;
    }
    if (tag === 'true' || tag === 'false') {
      if (depth === 1) key = null;
      continue;
    }
    if (closing || selfClosing || !valueTags.has(tag)) continue;
    const end = text.indexOf(`</${tag}>`, re.lastIndex);
    if (end < 0) break;
    const value = text.slice(re.lastIndex, end).replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => XML_ENTITIES[e]);
    re.lastIndex = end + tag.length + 3;
    if (depth !== 1) continue;
    if (tag === 'key') {
      key = value;
    } else {
      if (tag === 'string' && key !== null && !(key in out)) out[key] = value;
      key = null;
    }
  }
  return out;
}

/** The top-level values of a bundle's Info.plist: through `plutil` on macOS (any format), else as XML. */
async function readInfoPlist(bundle, deps = defaultDeps()) {
  const file = path.join(bundle, 'Contents', 'Info.plist');
  if (deps.platform === 'darwin') {
    const r = await deps.run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file], { timeout: 30_000 });
    if (r.code !== 0) throw new InstallError('plist', r.stderr.trim().slice(0, 200));
    const data = JSON.parse(r.stdout);
    if (!data || typeof data !== 'object') throw new InstallError('plist', 'not a dictionary');
    return data;
  }
  return readXmlPlist(deps.fs.readFileSync(file, 'utf8'));
}

/** The chips a Mach-O executable is built for (`x64`, `arm64`), read from its header. */
function machOArchs(file, fsImpl = fs) {
  const head = Buffer.alloc(4096);
  const fd = fsImpl.openSync(file, 'r');
  let n;
  try {
    n = fsImpl.readSync(fd, head, 0, head.length, 0);
  } finally {
    fsImpl.closeSync(fd);
  }
  if (n < 8) return [];
  const name = (cpu) => Object.keys(CPU).find((k) => CPU[k] === cpu) ?? `cpu-${cpu >>> 0}`;
  const magicLE = head.readUInt32LE(0);
  if (magicLE === 0xfeedfacf) return [name(head.readInt32LE(4))];
  const magicBE = head.readUInt32BE(0);
  if (magicBE === 0xcafebabe || magicBE === 0xcafebabf) {
    const count = head.readUInt32BE(4);
    const step = magicBE === 0xcafebabe ? 20 : 32;
    const out = [];
    for (let i = 0; i < count && 8 + i * step + 4 <= n; i++) out.push(name(head.readInt32BE(8 + i * step)));
    return out;
  }
  return [];
}

/**
 * Checks what the archive held. Throws an InstallError naming what is wrong; resolves the bundle's facts.
 * @param {string} bundle the unpacked `Fabtice.app`
 * @param {{ version: string, arch: string }} expected
 */
async function inspectBundle(bundle, expected, deps = defaultDeps()) {
  const dir = path.dirname(bundle);
  // Exactly what the archive is made of: one `Fabtice.app` (and the archive itself, next to it).
  const names = deps.fs.readdirSync(dir).filter((n) => n !== ARCHIVE && n !== '__MACOSX');
  if (names.length !== 1 || names[0] !== UNPACKED) throw new InstallError('content', names.join(', ').slice(0, 200));
  const st = deps.fs.lstatSync(bundle);
  if (!st.isDirectory() || st.isSymbolicLink()) throw new InstallError('content', 'not a folder');
  const info = await readInfoPlist(bundle, deps);
  if (info.CFBundleIdentifier !== BUNDLE_ID) throw new InstallError('identifier', String(info.CFBundleIdentifier).slice(0, 100));
  if (info.CFBundleShortVersionString !== expected.version) throw new InstallError('version', String(info.CFBundleShortVersionString).slice(0, 40));
  const exeName = info.CFBundleExecutable;
  if (typeof exeName !== 'string' || !/^[A-Za-z0-9 ._-]{1,100}$/.test(exeName)) throw new InstallError('executable', 'no name');
  const exe = path.join(bundle, 'Contents', 'MacOS', exeName);
  const est = deps.fs.lstatSync(exe, { throwIfNoEntry: false });
  if (!est || !est.isFile() || (est.mode & 0o111) === 0) throw new InstallError('executable', 'missing or not executable');
  const archs = machOArchs(exe, deps.fs);
  if (!archs.includes(expected.arch)) throw new InstallError('chip', archs.join(',') || 'not Mach-O');
  if (deps.platform === 'darwin') {
    // The new program starts (as plain Node: no window, no second app). On an Apple chip the system
    // kills a program whose signature does not hold, so this also proves the signature is usable.
    const started = await deps.run(exe, ['-e', 'process.stdout.write(String(process.versions.electron))'], { timeout: 60_000, env: { ...cleanEnv(), ELECTRON_RUN_AS_NODE: '1' } });
    if (started.code !== 0 || !/^\d+\.\d+\.\d+/.test(started.stdout.trim())) throw new InstallError('start', (started.stderr || started.error || `exit ${started.code}`).trim().slice(0, 200));
    const signed = await deps.run('/usr/bin/codesign', ['--verify', '--deep', bundle], { timeout: 120_000 });
    // Required on an Apple chip (an app whose signature fails is not started there); said in the log on Intel.
    if (signed.code !== 0 && expected.arch === 'arm64') throw new InstallError('signature', signed.stderr.trim().slice(0, 300));
    return { executable: exe, executableName: exeName, archs, signature: signed.code === 0 ? 'ok' : signed.stderr.trim().slice(0, 300) };
  }
  return { executable: exe, executableName: exeName, archs, signature: 'not checked' };
}

/** The environment for a child process, without what makes Electron act differently. */
function cleanEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

// ---------------------------------------------------------------- the swap

/**
 * Puts the unpacked app in place of the installed one. On success the old app is at `aside` (removed at the
 * next start). On failure the installed app is back at `target`, untouched, and the error says the step.
 * @param {{ target: string, unpacked: string, version: string }} plan
 * @returns {{ aside: string }}
 */
async function swap(plan, deps = defaultDeps()) {
  const { target, unpacked } = plan;
  const aside = path.join(path.dirname(target), ASIDE_NAME);
  // The running app is itself the set-aside copy (opened by hand): removing « the old copy » would remove it.
  // locate() refuses this place already; this is the last lock, before anything is touched.
  if (path.resolve(aside) === path.resolve(target)) throw new InstallError('aside', 'the app runs from the set-aside copy');
  // A set-aside app of an earlier update that could not be removed: it is not the one running (that one is at `target`).
  if (deps.fs.existsSync(aside)) {
    removeQuiet(aside, deps);
    if (deps.fs.existsSync(aside)) throw new InstallError('aside', 'an old copy is in the way');
  }
  try {
    deps.fs.renameSync(target, aside);
  } catch (e) {
    throw new InstallError('move-old', e.code || e.message);
  }
  try {
    deps.fs.renameSync(unpacked, target);
  } catch (e) {
    rollback({ target, aside, failed: null }, deps);
    throw new InstallError('move-new', e.code || e.message);
  }
  try {
    const info = await readInfoPlist(target, deps);
    if (info.CFBundleIdentifier !== BUNDLE_ID || info.CFBundleShortVersionString !== plan.version) throw new Error('not the new version');
  } catch (e) {
    rollback({ target, aside, failed: unpacked }, deps);
    throw new InstallError('read-back', e.message);
  }
  return { aside };
}

/**
 * Puts the old app back at `target`. The new one, if it is there, goes back to `failed` (the work folder,
 * removed with it) or is removed.
 */
function rollback({ target, aside, failed }, deps = defaultDeps()) {
  if (!deps.fs.existsSync(aside)) return false;
  if (deps.fs.existsSync(target)) {
    let moved = false;
    if (failed) {
      try {
        deps.fs.renameSync(target, failed);
        moved = true;
      } catch {
        // removed below
      }
    }
    if (!moved) removeQuiet(target, deps);
  }
  try {
    deps.fs.renameSync(aside, target);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- after the update

/**
 * At start: the app set aside by the last update and the work folders left by an update that did not end
 * are removed. Only from the folder of the running app, and never the running app itself.
 * @returns {{ removedAside: boolean, removedStaging: number }}
 */
function cleanLeftovers(folder, runningBundle, deps = defaultDeps()) {
  const out = { removedAside: false, removedStaging: 0 };
  let names;
  try {
    names = deps.fs.readdirSync(folder);
  } catch {
    return out;
  }
  const running = path.resolve(runningBundle);
  for (const name of names) {
    if (name !== ASIDE_NAME && !name.startsWith(STAGING_PREFIX)) continue;
    const p = path.join(folder, name);
    if (path.resolve(p) === running) continue;
    let st;
    try {
      st = deps.fs.lstatSync(p);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (!st.isDirectory() && !(name.startsWith(STAGING_PREFIX) && st.isFile())) continue;
    if (removeQuiet(p, deps) && !deps.fs.existsSync(p)) {
      if (name === ASIDE_NAME) out.removedAside = true;
      else out.removedStaging++;
    }
  }
  return out;
}

module.exports = {
  BUNDLE_ID,
  UNPACKED,
  ARCHIVE,
  InstallError,
  run,
  makeStaging,
  removeQuiet,
  zipUncompressedSize,
  treeBytes,
  unpack,
  readXmlPlist,
  readInfoPlist,
  machOArchs,
  inspectBundle,
  swap,
  rollback,
  cleanLeftovers,
};
