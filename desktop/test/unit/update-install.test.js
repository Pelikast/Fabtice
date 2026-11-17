'use strict';

// Putting the new version in place (C16), on a folder tree of fake apps: what the archive held is checked
// (identifier, version, executable, chip, on macOS that it starts and its signature), then the swap; a failure
// at each step leaves the installed app intact where it was; what an update leaves is cleaned at the next start.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const install = require('../../src/update-install');
const { fakeApp, marker, machO, plist, zipFolder } = require('../update-fixtures');

const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-update-install-')));
const linux = (extra = {}) => ({ fs, run: async () => ({ code: 0, stdout: '', stderr: '' }), platform: 'linux', ...extra });

/** A folder like /Applications with the installed app and the work folder of an update holding the new one. */
function scene({ newVersion = '1.0.1', newArchs = ['x64'], name = 'Fabtice.app' } = {}) {
  const root = tmp();
  const folder = path.join(root, 'Applications d’essai é');
  fs.mkdirSync(folder);
  const target = fakeApp(path.join(folder, name), { version: '1.0.0', archs: ['x64'], marker: 'old' });
  const staging = install.makeStaging(folder, linux());
  fakeApp(staging.unpacked, { version: newVersion, archs: newArchs, marker: 'new' });
  fs.writeFileSync(staging.archive, 'zip');
  return { root, folder, target, staging, aside: path.join(folder, '.Fabtice-ancienne.app') };
}

/** `fs` whose n-th call of `method` fails (EIO). */
function failing(method, n) {
  let calls = 0;
  return {
    ...fs,
    [method]: (...args) => {
      calls++;
      if (calls === n) throw Object.assign(new Error(`${method} failed`), { code: 'EIO' });
      return fs[method](...args);
    },
  };
}

test('Info.plist: the top-level values only, entities decoded', () => {
  const values = install.readXmlPlist(plist({ id: 'org.fabtice.desktop', version: '1.2.3', exe: 'Fabtice' }));
  assert.equal(values.CFBundleIdentifier, 'org.fabtice.desktop', 'not the one of the nested document type');
  assert.equal(values.CFBundleShortVersionString, '1.2.3', 'after a <true/>');
  assert.equal(values.CFBundleExecutable, 'Fabtice');
  assert.equal(values.NSHumanReadableCopyright, 'Fabtice & co');
  assert.equal(values.CFBundleTypeExtensions, undefined);
  assert.deepEqual(install.readXmlPlist('nothing here'), {});
});

test('the chip of an executable, read from its Mach-O header', () => {
  const dir = tmp();
  try {
    const write = (name, bytes) => {
      const p = path.join(dir, name);
      fs.writeFileSync(p, bytes);
      return p;
    };
    assert.deepEqual(install.machOArchs(write('arm', machO(['arm64']))), ['arm64']);
    assert.deepEqual(install.machOArchs(write('intel', machO(['x64']))), ['x64']);
    assert.deepEqual(install.machOArchs(write('fat', machO(['x64', 'arm64']))), ['x64', 'arm64']);
    assert.deepEqual(install.machOArchs(write('script', '#!/bin/sh\necho hi\n')), []);
    assert.deepEqual(install.machOArchs(write('tiny', 'ab')), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the size a zip unpacks to, from its central directory', () => {
  const dir = tmp();
  try {
    fakeApp(path.join(dir, 'in', 'Fabtice.app'), { version: '1.0.1' });
    fs.writeFileSync(path.join(dir, 'in', 'Fabtice.app', 'Contents', 'Resources', 'big.bin'), Buffer.alloc(300_000, 7));
    const made = zipFolder(path.join(dir, 'in'), path.join(dir, 'a.zip'));
    assert.equal(install.zipUncompressedSize(path.join(dir, 'a.zip')), made.bytes);
    assert.equal(install.treeBytes(path.join(dir, 'in')), made.bytes);
    fs.writeFileSync(path.join(dir, 'b.zip'), 'not a zip at all');
    assert.equal(install.zipUncompressedSize(path.join(dir, 'b.zip')), null);
    assert.equal(install.zipUncompressedSize(path.join(dir, 'missing.zip')), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('unpacking: ditto -x -k into the work folder; a failure is said', async () => {
  const s = scene();
  try {
    const calls = [];
    const progress = [];
    await install.unpack(s.staging, linux({ run: async (file, args) => (calls.push([file, ...args]), { code: 0, stdout: '', stderr: '' }) }), (f) => progress.push(f));
    assert.deepEqual(calls, [['/usr/bin/ditto', '-x', '-k', s.staging.archive, s.staging.dir]]);
    assert.equal(progress.at(-1), 1);
    await assert.rejects(install.unpack(s.staging, linux({ run: async () => ({ code: 1, stdout: '', stderr: 'ditto: No space left on device' }) })), (e) => e.step === 'unpack' && /No space/.test(e.message));
  } finally {
    fs.rmSync(s.root, { recursive: true, force: true });
  }
});

test('what was unpacked is checked: identifier, version, executable, chip, nothing else beside it', async () => {
  const s = scene({ newArchs: ['x64'] });
  try {
    const ok = await install.inspectBundle(s.staging.unpacked, { version: '1.0.1', arch: 'x64' }, linux());
    assert.equal(ok.executableName, 'Fabtice');
    assert.deepEqual(ok.archs, ['x64']);
    const fails = async (expected, step, prepare) => {
      const t = scene({ newArchs: ['x64'] });
      try {
        if (prepare) prepare(t);
        await assert.rejects(install.inspectBundle(t.staging.unpacked, { version: '1.0.1', arch: 'x64', ...expected }, linux()), (e) => e.step === step, step);
      } finally {
        fs.rmSync(t.root, { recursive: true, force: true });
      }
    };
    await fails({ version: '1.0.2' }, 'version');
    await fails({ arch: 'arm64' }, 'chip');
    await fails({}, 'identifier', (t) => fs.writeFileSync(path.join(t.staging.unpacked, 'Contents', 'Info.plist'), plist({ id: 'com.someone.else', version: '1.0.1' })));
    await fails({}, 'executable', (t) => fs.rmSync(path.join(t.staging.unpacked, 'Contents', 'MacOS', 'Fabtice')));
    await fails({}, 'executable', (t) => fs.chmodSync(path.join(t.staging.unpacked, 'Contents', 'MacOS', 'Fabtice'), 0o644));
    await fails({}, 'executable', (t) => fs.writeFileSync(path.join(t.staging.unpacked, 'Contents', 'Info.plist'), plist({ version: '1.0.1', exe: '../../evil' })));
    await fails({}, 'content', (t) => fs.mkdirSync(path.join(t.staging.dir, 'Autre.app')));
    await fails({}, 'content', (t) => {
      fs.renameSync(t.staging.unpacked, path.join(t.staging.dir, 'Ailleurs.app'));
      fs.symlinkSync(path.join(t.staging.dir, 'Ailleurs.app'), t.staging.unpacked);
      fs.renameSync(path.join(t.staging.dir, 'Ailleurs.app'), path.join(t.root, 'Ailleurs.app'));
    });
    await fails({}, 'chip', (t) => fs.writeFileSync(path.join(t.staging.unpacked, 'Contents', 'MacOS', 'Fabtice'), '#!/bin/sh\n'));
  } finally {
    fs.rmSync(s.root, { recursive: true, force: true });
  }
});

test('on macOS: Info.plist through plutil, the new program must start, the signature must hold on an Apple chip', async () => {
  const s = scene({ newArchs: ['arm64'] });
  try {
    const calls = [];
    const fake = (answers) => async (file, args, options) => {
      calls.push(path.basename(file));
      if (file === '/usr/bin/plutil') return { code: 0, stdout: JSON.stringify({ CFBundleIdentifier: 'org.fabtice.desktop', CFBundleShortVersionString: '1.0.1', CFBundleExecutable: 'Fabtice' }), stderr: '' };
      if (file.endsWith('/MacOS/Fabtice')) {
        assert.equal(options.env.ELECTRON_RUN_AS_NODE, '1');
        return answers.start ?? { code: 0, stdout: '43.8.9', stderr: '' };
      }
      if (file === '/usr/bin/codesign') return answers.sign ?? { code: 0, stdout: '', stderr: '' };
      throw new Error(`unexpected ${file}`);
    };
    const mac = (answers) => ({ fs, platform: 'darwin', run: fake(answers) });
    const ok = await install.inspectBundle(s.staging.unpacked, { version: '1.0.1', arch: 'arm64' }, mac({}));
    assert.equal(ok.signature, 'ok');
    assert.deepEqual(calls, ['plutil', 'Fabtice', 'codesign']);
    await assert.rejects(install.inspectBundle(s.staging.unpacked, { version: '1.0.1', arch: 'arm64' }, mac({ start: { code: -1, stdout: '', stderr: '', error: 'killed' } })), (e) => e.step === 'start');
    await assert.rejects(install.inspectBundle(s.staging.unpacked, { version: '1.0.1', arch: 'arm64' }, mac({ start: { code: 0, stdout: 'garbage', stderr: '' } })), (e) => e.step === 'start');
    await assert.rejects(install.inspectBundle(s.staging.unpacked, { version: '1.0.1', arch: 'arm64' }, mac({ sign: { code: 1, stdout: '', stderr: 'a sealed resource is missing or invalid' } })), (e) => e.step === 'signature');
  } finally {
    fs.rmSync(s.root, { recursive: true, force: true });
  }
  // On Intel a signature that does not verify is said in the log, not refused (an Intel Mac starts the app all the same).
  const t = scene({ newArchs: ['x64'] });
  try {
    const run = async (file) => {
      if (file === '/usr/bin/plutil') return { code: 0, stdout: JSON.stringify({ CFBundleIdentifier: 'org.fabtice.desktop', CFBundleShortVersionString: '1.0.1', CFBundleExecutable: 'Fabtice' }), stderr: '' };
      if (file === '/usr/bin/codesign') return { code: 1, stdout: '', stderr: 'not signed at all' };
      return { code: 0, stdout: '43.8.9', stderr: '' };
    };
    const r = await install.inspectBundle(t.staging.unpacked, { version: '1.0.1', arch: 'x64' }, { fs, platform: 'darwin', run });
    assert.equal(r.signature, 'not signed at all');
  } finally {
    fs.rmSync(t.root, { recursive: true, force: true });
  }
});

test('the swap: the new app in place, the old one aside, paths with spaces and accents', async () => {
  const s = scene();
  try {
    const r = await install.swap({ target: s.target, unpacked: s.staging.unpacked, version: '1.0.1' }, linux());
    assert.equal(r.aside, s.aside);
    assert.equal(marker(s.target), 'new');
    assert.equal(marker(s.aside), 'old');
    assert.equal(fs.existsSync(s.staging.unpacked), false);
  } finally {
    fs.rmSync(s.root, { recursive: true, force: true });
  }
});

test('the swap fails at each step: the installed app is intact where it was', async () => {
  // 1. The old app cannot be moved aside: nothing moved.
  {
    const s = scene();
    try {
      await assert.rejects(install.swap({ target: s.target, unpacked: s.staging.unpacked, version: '1.0.1' }, linux({ fs: failing('renameSync', 1) })), (e) => e.step === 'move-old');
      assert.equal(marker(s.target), 'old');
      assert.equal(fs.existsSync(s.aside), false);
      assert.equal(marker(s.staging.unpacked), 'new');
    } finally {
      fs.rmSync(s.root, { recursive: true, force: true });
    }
  }
  // 2. The new app cannot be moved in: the old one goes back.
  {
    const s = scene();
    try {
      await assert.rejects(install.swap({ target: s.target, unpacked: s.staging.unpacked, version: '1.0.1' }, linux({ fs: failing('renameSync', 2) })), (e) => e.step === 'move-new');
      assert.equal(marker(s.target), 'old');
      assert.equal(fs.existsSync(s.aside), false);
    } finally {
      fs.rmSync(s.root, { recursive: true, force: true });
    }
  }
  // 3. What is in place does not read back as the new version: the new one goes back to the work folder, the old one in place.
  {
    const s = scene();
    try {
      let reads = 0;
      const fsx = { ...fs, readFileSync: (p, ...rest) => (String(p).endsWith('Info.plist') && ++reads === 1 ? plist({ version: '9.9.9' }) : fs.readFileSync(p, ...rest)) };
      await assert.rejects(install.swap({ target: s.target, unpacked: s.staging.unpacked, version: '1.0.1' }, linux({ fs: fsx })), (e) => e.step === 'read-back');
      assert.equal(marker(s.target), 'old');
      assert.equal(fs.existsSync(s.aside), false);
      assert.equal(marker(s.staging.unpacked), 'new');
    } finally {
      fs.rmSync(s.root, { recursive: true, force: true });
    }
  }
  // 4. An old copy left aside by an earlier update is removed first; one that cannot be removed stops it all before anything moves.
  {
    const s = scene();
    try {
      fakeApp(s.aside, { version: '0.9.0', marker: 'older' });
      await install.swap({ target: s.target, unpacked: s.staging.unpacked, version: '1.0.1' }, linux());
      assert.equal(marker(s.target), 'new');
      assert.equal(marker(s.aside), 'old');
    } finally {
      fs.rmSync(s.root, { recursive: true, force: true });
    }
    const t = scene();
    try {
      fakeApp(t.aside, { version: '0.9.0', marker: 'older' });
      await assert.rejects(install.swap({ target: t.target, unpacked: t.staging.unpacked, version: '1.0.1' }, linux({ fs: { ...fs, rmSync: () => {} } })), (e) => e.step === 'aside');
      assert.equal(marker(t.target), 'old');
    } finally {
      fs.rmSync(t.root, { recursive: true, force: true });
    }
  }
});

test('at the next start: the old app set aside and the work folders go; nothing else, never the running app', () => {
  const s = scene();
  try {
    fakeApp(s.aside, { marker: 'old' });
    const other = fakeApp(path.join(s.folder, 'Autre app.app'), { marker: 'other' });
    fs.writeFileSync(path.join(s.folder, 'notes.txt'), 'keep');
    const linked = path.join(s.folder, '.Fabtice-maj-lien');
    fs.symlinkSync(s.root, linked);
    const r = install.cleanLeftovers(s.folder, s.target, linux());
    assert.deepEqual(r, { removedAside: true, removedStaging: 1 });
    assert.equal(fs.existsSync(s.aside), false);
    assert.equal(fs.existsSync(s.staging.dir), false);
    assert.equal(marker(s.target), 'old');
    assert.equal(marker(other), 'other');
    assert.equal(fs.readFileSync(path.join(s.folder, 'notes.txt'), 'utf8'), 'keep');
    assert.equal(fs.lstatSync(linked).isSymbolicLink(), true, 'a link is not followed nor removed');
    // The running app itself is never removed, whatever its name.
    const running = fakeApp(path.join(s.folder, '.Fabtice-ancienne.app'), { marker: 'running' });
    install.cleanLeftovers(s.folder, running, linux());
    assert.equal(marker(running), 'running');
  } finally {
    fs.rmSync(s.root, { recursive: true, force: true });
  }
});
