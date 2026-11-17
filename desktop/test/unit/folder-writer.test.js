'use strict';

// Folder exports (« Dossier pour Logic Pro… »): a new folder where the user
// chose, never over anything existing; plain files inside it only, by chunks
// in order; abort removes what the export made and nothing else.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createFolderWriter, registerFolderIpc, FolderError, shownPath } = require('../../src/folder-writer');

function tempDir() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-folder-')));
}

async function codeOf(promise) {
  try {
    await promise;
  } catch (e) {
    return e instanceof FolderError ? e.code : `other: ${e && e.message}`;
  }
  return 'no error';
}

const bytes = (n, seed = 3) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + seed) & 255);

test('a new folder where the panel said, files written by chunks, the name and the place answered with « ~ »', async () => {
  const home = tempDir();
  const writer = createFolderWriter({ home });
  const asked = [];
  const begun = await writer.begin({ suggestedName: 'Blues – Logic Pro', pickPath: async (name) => (asked.push(name), path.join(home, 'Musique', name)) }).catch((e) => e);
  assert.equal(await codeOf(Promise.reject(begun)), 'failed', 'the parent folder must exist');
  fs.mkdirSync(path.join(home, 'Musique'));
  const b = await writer.begin({ suggestedName: 'Blues – Logic Pro', pickPath: async (name) => path.join(home, 'Musique', name) });
  assert.equal(b.name, 'Blues – Logic Pro');
  assert.equal(b.where, `~${path.sep}Musique`);
  await writer.write(b.session, '01 Morceau.wav', 0, bytes(10));
  await writer.write(b.session, '01 Morceau.wav', 10, bytes(5, 9));
  await writer.write(b.session, 'Lisez-moi.txt', 0, bytes(3));
  assert.equal(await codeOf(writer.write(b.session, '01 Morceau.wav', 3, bytes(1))), 'invalid', 'a chunk out of order');
  assert.equal(await codeOf(writer.write(b.session, 'Lisez-moi.txt', 0, bytes(1))), 'invalid', 'a file written twice');
  const done = await writer.finish(b.session);
  assert.deepEqual(done, { name: 'Blues – Logic Pro', where: `~${path.sep}Musique`, files: 2 });
  const dir = path.join(home, 'Musique', 'Blues – Logic Pro');
  assert.deepEqual(fs.readdirSync(dir).sort(), ['01 Morceau.wav', 'Lisez-moi.txt']);
  assert.deepEqual([...fs.readFileSync(path.join(dir, '01 Morceau.wav'))], [...bytes(10), ...bytes(5, 9)]);
  assert.equal(writer.folderOf(b.session), dir);
  assert.equal(await codeOf(writer.write(b.session, 'x.txt', 0, bytes(1))), 'unknown-session', 'a finished export takes no more files');
  assert.deepEqual(asked, ['Blues – Logic Pro']);
  fs.rmSync(home, { recursive: true, force: true });
});

test('never over something existing: « name 2 » beside it, the old one untouched', async () => {
  const root = tempDir();
  const writer = createFolderWriter({ home: '' });
  fs.mkdirSync(path.join(root, 'Essai'));
  fs.writeFileSync(path.join(root, 'Essai', 'garder.txt'), 'à garder');
  fs.writeFileSync(path.join(root, 'Essai 2'), 'un fichier du même nom');
  const b = await writer.begin({ suggestedName: 'Essai', pickPath: async () => path.join(root, 'Essai') });
  assert.equal(b.name, 'Essai 3');
  assert.equal(fs.readFileSync(path.join(root, 'Essai', 'garder.txt'), 'utf8'), 'à garder');
  assert.equal(fs.readFileSync(path.join(root, 'Essai 2'), 'utf8'), 'un fichier du même nom');
  fs.rmSync(root, { recursive: true, force: true });
});

test('names stay inside the folder; abort removes only what the export wrote', async () => {
  const root = tempDir();
  const writer = createFolderWriter({ home: '' });
  const b = await writer.begin({ suggestedName: 'X', pickPath: async () => path.join(root, 'X') });
  for (const bad of ['../evil.txt', 'a/b.txt', '..', '.cache', '', 'a\\b', 'x\u0000y', `${'n'.repeat(300)}`]) {
    assert.equal(await codeOf(writer.write(b.session, bad, 0, bytes(1))), 'invalid', `refused: ${JSON.stringify(bad)}`);
  }
  assert.deepEqual(fs.readdirSync(root), ['X']);
  await writer.write(b.session, 'piste.wav', 0, bytes(4));
  await writer.abort(b.session);
  assert.deepEqual(fs.readdirSync(root), [], 'the folder made by the export is gone');
  // A folder that something else wrote into while exporting is kept (only our files go).
  const c = await writer.begin({ suggestedName: 'Y', pickPath: async () => path.join(root, 'Y') });
  await writer.write(c.session, 'piste.wav', 0, bytes(4));
  fs.writeFileSync(path.join(root, 'Y', 'autre.txt'), 'x');
  await writer.abort(c.session);
  assert.deepEqual(fs.readdirSync(path.join(root, 'Y')), ['autre.txt']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a cancelled panel is « cancelled »; a relative path is refused', async () => {
  const writer = createFolderWriter({ home: '' });
  assert.equal(await codeOf(writer.begin({ suggestedName: 'X', pickPath: async () => null })), 'cancelled');
  assert.equal(await codeOf(writer.begin({ suggestedName: 'X', pickPath: async () => 'relatif/X' })), 'invalid');
  assert.equal(shownPath('/Users/f/Musique/X', '/Users/f'), '~/Musique/X');
  assert.equal(shownPath('/Volumes/Disque/X', '/Users/f'), '/Volumes/Disque/X');
});

test('the IPC answers with data, the panel in French, the Finder shows the folder', async () => {
  const root = tempDir();
  const handlers = new Map();
  const panels = [];
  const shown = [];
  registerFolderIpc((channel, fn) => handlers.set(channel, fn), {
    dialog: { showSaveDialog: async (_w, o) => (panels.push(o), { canceled: false, filePath: path.join(root, 'Dossier') }) },
    shell: { showItemInFolder: (p) => shown.push(p) },
    window: () => null,
    downloadsDir: () => root,
  });
  const call = (channel, ...args) => handlers.get(channel)({}, ...args);
  const b = await call('fabtice:folder-begin', { suggestedName: 'Dossier' });
  assert.equal(b.ok, true);
  assert.equal(panels[0].title, 'Enregistrer le dossier');
  assert.equal(panels[0].defaultPath, path.join(root, 'Dossier'));
  assert.deepEqual(await call('fabtice:folder-write', b.session, '../x', 0, bytes(1)), { ok: false, reason: 'invalid' });
  assert.equal((await call('fabtice:folder-write', b.session, 'a.mid', 0, bytes(2))).ok, true);
  assert.equal((await call('fabtice:folder-finish', b.session)).ok, true);
  assert.equal(await call('fabtice:folder-reveal', b.session), true);
  assert.deepEqual(shown, [path.join(root, 'Dossier')]);
  assert.equal(await call('fabtice:folder-reveal', 'nope'), false);
  fs.rmSync(root, { recursive: true, force: true });
});
