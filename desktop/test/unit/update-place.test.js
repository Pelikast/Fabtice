'use strict';

// Where the app runs and whether it can replace itself there (C16): the protected copy macOS makes of an app
// opened where it was downloaded, a read-only volume (the disk image), a folder this account cannot write, a
// copy that is not a packaged app.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const place = require('../../src/update-place');
const { fakeApp } = require('../update-fixtures');

const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-update-place-')));

test('the bundle of an executable', () => {
  assert.equal(place.bundleOf('/Applications/Fabtice.app/Contents/MacOS/Fabtice'), '/Applications/Fabtice.app');
  assert.equal(place.bundleOf('/Users/x/Mes apps é/Fabtice 2.app/Contents/MacOS/Fabtice'), '/Users/x/Mes apps é/Fabtice 2.app');
  assert.equal(place.bundleOf('/usr/lib/electron/electron'), null);
  assert.equal(place.bundleOf('/Applications/Fabtice/Contents/MacOS/Fabtice'), null);
  assert.equal(place.bundleOf(undefined), null);
});

test('the protected copy of App Translocation', () => {
  assert.equal(place.isTranslocated('/private/var/folders/x1/abcd1234/T/AppTranslocation/0F1E2D3C-AAAA-BBBB-CCCC-123456789012/d/Fabtice.app'), true);
  assert.equal(place.isTranslocated('/Applications/Fabtice.app'), false);
  assert.equal(place.isTranslocated('/Users/x/Downloads/AppTranslocation/Fabtice.app'), false, 'a folder of that name elsewhere is not it');
  assert.equal(place.isTranslocated('/var/folders/x1/abcd/T/AppTranslocation/U/d/Fabtice.app'), false, 'the rule reads real paths (/private/var)');
});

test('locate: a packaged app in a folder it can write', () => {
  const root = tmp();
  try {
    const bundle = fakeApp(path.join(root, 'Applications', 'Fabtice.app'));
    const at = place.locate({ execPath: path.join(bundle, 'Contents', 'MacOS', 'Fabtice'), packaged: true, platform: 'darwin' });
    assert.deepEqual(at, { ok: true, bundle, folder: path.join(root, 'Applications') });
    assert.deepEqual(fs.readdirSync(path.join(root, 'Applications')), ['Fabtice.app'], 'the probe left nothing');
    // Through a link: the real place is the one updated.
    fs.symlinkSync(path.join(root, 'Applications'), path.join(root, 'Raccourci'));
    const linked = place.locate({ execPath: path.join(root, 'Raccourci', 'Fabtice.app', 'Contents', 'MacOS', 'Fabtice'), packaged: true, platform: 'darwin' });
    assert.equal(linked.bundle, bundle);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('locate: the cases where it cannot update itself', () => {
  const root = tmp();
  try {
    const bundle = fakeApp(path.join(root, 'Applications', 'Fabtice.app'));
    const exe = path.join(bundle, 'Contents', 'MacOS', 'Fabtice');
    assert.deepEqual(place.locate({ execPath: exe, packaged: true, platform: 'linux' }), { ok: false, code: 'not-mac' });
    assert.deepEqual(place.locate({ execPath: exe, packaged: false, platform: 'darwin' }), { ok: false, code: 'not-packaged' });
    assert.deepEqual(place.locate({ execPath: '/usr/bin/electron', packaged: true, platform: 'darwin' }), { ok: false, code: 'not-packaged' });
    assert.deepEqual(place.locate({ execPath: path.join(root, 'Nowhere.app', 'Contents', 'MacOS', 'Fabtice'), packaged: true, platform: 'darwin' }), { ok: false, code: 'not-packaged' });
    // A translocated copy (its real path).
    const translocated = { ...fs, realpathSync: () => '/private/var/folders/x1/abcd/T/AppTranslocation/0F1E/d/Fabtice.app' };
    assert.deepEqual(place.locate({ execPath: exe, packaged: true, platform: 'darwin', fsImpl: translocated }), { ok: false, code: 'translocated' });
    // The disk image: a read-only volume.
    const readOnly = { ...fs, writeFileSync: () => { throw Object.assign(new Error('read-only'), { code: 'EROFS' }); } };
    assert.deepEqual(place.locate({ execPath: exe, packaged: true, platform: 'darwin', fsImpl: readOnly }), { ok: false, code: 'read-only' });
    // A folder for administrators only.
    const denied = { ...fs, writeFileSync: () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); } };
    assert.deepEqual(place.locate({ execPath: exe, packaged: true, platform: 'darwin', fsImpl: denied }), { ok: false, code: 'not-writable' });
    // The real thing, where the account is not root (on the GitHub Macs): chmod 555.
    if (process.getuid && process.getuid() !== 0) {
      fs.chmodSync(path.join(root, 'Applications'), 0o555);
      try {
        assert.deepEqual(place.locate({ execPath: exe, packaged: true, platform: 'darwin' }), { ok: false, code: 'not-writable' });
      } finally {
        fs.chmodSync(path.join(root, 'Applications'), 0o755);
      }
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the test seam stands for the bundle, on any system', () => {
  const root = tmp();
  try {
    const bundle = fakeApp(path.join(root, 'Fabtice.app'));
    assert.deepEqual(place.locate({ execPath: '/usr/bin/electron', packaged: false, platform: 'linux', testBundle: bundle }), { ok: true, bundle, folder: root });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('room on the disk: three times the archive, the free space as the system says', async () => {
  assert.equal(place.roomNeeded(100), 300);
  const free = await place.freeBytes(os.tmpdir());
  assert.ok(Number.isFinite(free) && free > 0);
  assert.equal(await place.freeBytes('/does/not/exist'), null);
});
