'use strict';

// Project files handed over by macOS (double-click, « Ouvrir avec »): only a
// `.fab` regular file is kept, the page reads it by ranges with a token,
// and nothing else on the disk can be read that way.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createOpenFiles, projectPathsIn, MAX_READ_BYTES } = require('../../src/open-files');
const { saveDialogOptions } = require('../../src/downloads');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-open-'));
}

test('a .fab file handed over before the page listens waits for it, then is read by ranges', async () => {
  const dir = tempDir();
  try {
    const file = path.join(dir, 'Blues du dimanche.fab');
    const bytes = Buffer.from(Array.from({ length: 100_000 }, (_, i) => i & 255));
    fs.writeFileSync(file, bytes);
    const opened = createOpenFiles();
    const entry = await opened.accept(file);
    assert.equal(entry.name, 'Blues du dimanche.fab');
    assert.equal(entry.size, bytes.length);
    assert.match(entry.token, /^[0-9a-f]{32}$/);
    assert.deepEqual(opened.takePending(), [entry]);
    assert.deepEqual(opened.takePending(), [], 'handed over once');

    assert.deepEqual(Buffer.from(await opened.read(entry.token, 0, 4)), bytes.subarray(0, 4));
    assert.deepEqual(Buffer.from(await opened.read(entry.token, 99_990, 100)), bytes.subarray(99_990), 'a range past the end is cut at the end');
    assert.equal((await opened.read(entry.token, bytes.length, 10)).length, 0);

    // Once the page listens, the next files go straight to it.
    const seen = [];
    opened.onOpen((e) => seen.push(e));
    const second = path.join(dir, 'Autre.FAB');
    fs.writeFileSync(second, 'x');
    await opened.accept(second);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].name, 'Autre.FAB');
    assert.deepEqual(opened.takePending(), []);

    opened.release(entry.token);
    await assert.rejects(opened.read(entry.token, 0, 1), /unknown file/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('refuses anything but a .fab regular file, and any odd range', async () => {
  const dir = tempDir();
  try {
    const opened = createOpenFiles();
    const audio = path.join(dir, 'morceau.mp3');
    fs.writeFileSync(audio, 'x');
    fs.mkdirSync(path.join(dir, 'dossier.fab'));
    for (const bad of [audio, path.join(dir, 'dossier.fab'), path.join(dir, 'absent.fab'), 'relatif.fab', 42, null, undefined]) {
      assert.equal(await opened.accept(bad), null, String(bad));
    }
    assert.deepEqual(opened.takePending(), []);
    await assert.rejects(opened.read('not-a-token', 0, 1), /unknown file/);
    const file = path.join(dir, 'p.fab');
    fs.writeFileSync(file, 'abc');
    const { token } = await opened.accept(file);
    for (const [offset, length] of [[-1, 1], [0, -1], [0, MAX_READ_BYTES + 1], [1.5, 1], [10, 1], ['0', 1]]) {
      await assert.rejects(opened.read(token, offset, length), /invalid range/, `${offset}, ${length}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('finds the project files in a command line', () => {
  assert.deepEqual(projectPathsIn(['/Applications/Fabtice.app', '--flag', '/Users/x/Mon projet.fab', 'rel.fab', '/a/b.mp3']), ['/Users/x/Mon projet.fab']);
  assert.deepEqual(projectPathsIn(undefined), []);
});

test('the save panel of a project keeps its extension and says « projet »', () => {
  const o = saveDialogOptions('Lover Man.fab', '/Users/x/Downloads');
  assert.equal(o.title, 'Enregistrer le projet');
  assert.equal(o.defaultPath, path.join('/Users/x/Downloads', 'Lover Man.fab'));
  assert.deepEqual(o.filters, [{ name: 'Projet Fabtice', extensions: ['fab'] }]);
  assert.equal(saveDialogOptions('a.wav', '/d').filters, undefined);
});
