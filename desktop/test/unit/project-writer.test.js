'use strict';

// « Enregistrer » in the Mac app (C5): the file of the open project is written
// through a temporary file renamed over the target, so that the old file stays
// whole whatever happens; only the project's own file or a path chosen in the
// save panel can be written; the page reads the project's file back by ranges.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createProjectWriter, WriterError, withExtension } = require('../../src/project-writer');

function tempDir() {
  // The real path: on macOS the temporary folder is reached through a link (/var -> /private/var).
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-writer-')));
}

const bytesOf = (n, seed = 1) => Buffer.from(Array.from({ length: n }, (_, i) => (i * 31 + seed) & 255));
const names = (dir) => fs.readdirSync(dir).sort();

function setup(extra = {}) {
  const dir = tempDir();
  const saved = [];
  const writer = createProjectWriter({ file: path.join(dir, 'user', 'project-files.json'), onSaved: (p) => saved.push(p), ...extra });
  return { dir, writer, saved, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

async function codeOf(promise) {
  try {
    await promise;
  } catch (e) {
    return e instanceof WriterError ? e.code : `other: ${e && e.message}`;
  }
  return 'no error';
}

test('overwrites the file of the project: a temporary file in the same folder, then a rename; nothing left behind', async () => {
  const { dir, writer, saved, cleanup } = setup();
  try {
    const file = path.join(dir, 'Blues du dimanche.fab');
    const old = bytesOf(5000, 1);
    fs.writeFileSync(file, old);
    assert.deepEqual(await writer.adopt('p1', file), { name: 'Blues du dimanche.fab' });

    const s = await writer.begin({ projectId: 'p1', target: 'current' });
    assert.equal(s.name, 'Blues du dimanche.fab');
    // While it is written, the target is the old file and the temporary file is beside it.
    const next = bytesOf(70_000, 2);
    await writer.write(s.session, next.subarray(0, 30_000));
    assert.deepEqual(fs.readFileSync(file), old, 'the old file is untouched until the end');
    const during = names(dir).filter((n) => n !== 'user');
    assert.equal(during.length, 2);
    assert.ok(during.some((n) => /^Blues du dimanche\.fab\.tmp-[0-9a-f]{16}$/.test(n)), during.join(', '));
    await writer.write(s.session, next.subarray(30_000));
    const done = await writer.finish(s.session);
    assert.deepEqual(done, { name: 'Blues du dimanche.fab', size: next.length });
    assert.deepEqual(fs.readFileSync(file), next);
    assert.deepEqual(names(dir).filter((n) => n !== 'user'), ['Blues du dimanche.fab'], 'no temporary file left');
    assert.deepEqual(saved, [file], 'a saved project goes in the recent list');
  } finally {
    cleanup();
  }
});

test('the file keeps its permissions when it is replaced', async () => {
  const { dir, writer, cleanup } = setup();
  try {
    const file = path.join(dir, 'a.fab');
    fs.writeFileSync(file, bytesOf(10));
    fs.chmodSync(file, 0o600);
    await writer.adopt('p1', file);
    const s = await writer.begin({ projectId: 'p1', target: 'current' });
    await writer.write(s.session, bytesOf(20));
    await writer.finish(s.session);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  } finally {
    cleanup();
  }
});

test('a failure in the middle leaves the old file byte for byte, removes the temporary file, and says so calmly', async () => {
  const { dir, cleanup } = setup();
  try {
    const file = path.join(dir, 'a.fab');
    const old = bytesOf(4096, 9);
    fs.writeFileSync(file, old);
    // The disk gets full on the third chunk.
    let calls = 0;
    const failing = {
      ...fsp,
      open: async (p, flags, mode) => {
        const handle = await fsp.open(p, flags, mode);
        if (!String(p).includes('.tmp-')) return handle;
        const write = handle.write.bind(handle);
        handle.write = async (...args) => {
          if (++calls === 3) throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
          return write(...args);
        };
        return handle;
      },
    };
    const writer = createProjectWriter({ file: path.join(dir, 'user', 'p.json'), fsp: failing });
    await writer.adopt('p1', file);
    const s = await writer.begin({ projectId: 'p1', target: 'current' });
    await writer.write(s.session, bytesOf(100));
    await writer.write(s.session, bytesOf(100));
    assert.equal(await codeOf(writer.write(s.session, bytesOf(100))), 'failed');
    assert.deepEqual(fs.readFileSync(file), old, 'the old file is intact');
    assert.deepEqual(names(dir).filter((n) => n !== 'user'), ['a.fab'], 'the temporary file is gone');
    // The save is over: nothing more can be added to it.
    assert.equal(await codeOf(writer.write(s.session, bytesOf(1))), 'unknown-session');
    assert.equal(await codeOf(writer.finish(s.session)), 'unknown-session');
  } finally {
    cleanup();
  }
});

test('a failure of the final rename leaves the old file and no temporary file', async () => {
  const { dir, cleanup } = setup();
  try {
    const file = path.join(dir, 'a.fab');
    const old = bytesOf(1000, 4);
    fs.writeFileSync(file, old);
    const writer = createProjectWriter({
      file: path.join(dir, 'user', 'p.json'),
      fsp: {
        ...fsp,
        rename: async () => {
          throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
        },
      },
    });
    await writer.adopt('p1', file);
    const s = await writer.begin({ projectId: 'p1', target: 'current' });
    await writer.write(s.session, bytesOf(2000));
    assert.equal(await codeOf(writer.finish(s.session)), 'failed');
    assert.deepEqual(fs.readFileSync(file), old);
    assert.deepEqual(names(dir).filter((n) => n !== 'user'), ['a.fab']);
  } finally {
    cleanup();
  }
});

test('the page starts the file again (an entry it copied did not read back): the temporary file is emptied, the old file stays', async () => {
  const { dir, writer, cleanup } = setup();
  try {
    const file = path.join(dir, 'a.fab');
    const old = bytesOf(300, 8);
    fs.writeFileSync(file, old);
    await writer.adopt('p1', file);
    const s = await writer.begin({ projectId: 'p1', target: 'current' });
    await writer.write(s.session, bytesOf(900, 1));
    await writer.restart(s.session);
    const next = bytesOf(500, 2);
    await writer.write(s.session, next);
    assert.deepEqual(await writer.finish(s.session), { name: 'a.fab', size: 500 });
    assert.deepEqual(fs.readFileSync(file), next, 'nothing of the first attempt remains');
    assert.equal(await codeOf(writer.restart(s.session)), 'unknown-session');
  } finally {
    cleanup();
  }
});

test('the page abandons the save: the temporary file goes, the target stays', async () => {
  const { dir, writer, cleanup } = setup();
  try {
    const file = path.join(dir, 'a.fab');
    const old = bytesOf(300);
    fs.writeFileSync(file, old);
    await writer.adopt('p1', file);
    const s = await writer.begin({ projectId: 'p1', target: 'current' });
    await writer.write(s.session, bytesOf(500));
    assert.equal(await writer.abort(s.session), true);
    assert.deepEqual(names(dir).filter((n) => n !== 'user'), ['a.fab']);
    assert.deepEqual(fs.readFileSync(file), old);
    // A new save replaces one left open.
    const first = await writer.begin({ projectId: 'p1', target: 'current' });
    const second = await writer.begin({ projectId: 'p1', target: 'current' });
    assert.equal(await codeOf(writer.write(first.session, bytesOf(1))), 'unknown-session');
    await writer.abort(second.session);
    assert.deepEqual(names(dir).filter((n) => n !== 'user'), ['a.fab']);
  } finally {
    cleanup();
  }
});

test('only the project\'s own file or a chosen path: no file known, another project, a wrong extension are all refused', async () => {
  const { dir, writer, cleanup } = setup();
  try {
    const file = path.join(dir, 'a.fab');
    fs.writeFileSync(file, bytesOf(10));
    const text = path.join(dir, 'notes.txt');
    fs.writeFileSync(text, 'hello');
    // Nothing adopted yet.
    assert.equal(await codeOf(writer.begin({ projectId: 'p1', target: 'current' })), 'no-file');
    // A file that is not a project, a relative path, a missing file: not adopted.
    assert.equal(await writer.adopt('p1', text), null);
    assert.equal(await writer.adopt('p1', 'a.fab'), null);
    assert.equal(await writer.adopt('p1', path.join(dir, 'gone.fab')), null);
    assert.equal(await writer.adopt('', file), null);
    await writer.adopt('p1', file);
    // The file belongs to p1: another project's id gets nothing (neither a write nor a read).
    assert.equal(await codeOf(writer.begin({ projectId: 'p2', target: 'current' })), 'no-file');
    assert.equal(await codeOf(writer.read('p2', 0, 10)), 'no-file');
    assert.equal(await writer.info('p2'), null);
    // No path from the page: only the three targets the writer knows.
    assert.equal(await codeOf(writer.begin({ projectId: 'p1', target: '/etc/passwd' })), 'invalid');
    assert.equal(await codeOf(writer.begin({ projectId: 'p1', target: 'choose', pickPath: async () => 'relative/x.fab' })), 'invalid');
    assert.equal(await codeOf(writer.begin({ projectId: 'p1', target: 'choose', pickPath: async () => null })), 'cancelled');
    // The project's file is gone from the disk: « Enregistrer » then has no file (the page asks where).
    fs.rmSync(file);
    assert.equal(await codeOf(writer.begin({ projectId: 'p1', target: 'current' })), 'no-file');
    assert.deepEqual(names(dir).filter((n) => n !== 'user'), ['notes.txt']);
  } finally {
    cleanup();
  }
});

test('« Enregistrer sous… »: the chosen path gets the .fab extension, becomes the project\'s file, and the old file is untouched', async () => {
  const { dir, writer, saved, cleanup } = setup();
  try {
    const first = path.join(dir, 'a.fab');
    const old = bytesOf(100);
    fs.writeFileSync(first, old);
    await writer.adopt('p1', first);
    const picked = [];
    const s = await writer.begin({
      projectId: 'p1',
      target: 'choose',
      suggestedName: 'Blues.fab',
      pickPath: async (name) => (picked.push(name), path.join(dir, 'Copie')),
    });
    assert.deepEqual(picked, ['Blues.fab']);
    assert.equal(s.name, 'Copie.fab');
    // While it is written, the old file can still be read (the page copies the sounds already encoded in it).
    assert.deepEqual(Buffer.from(await writer.read('p1', 10, 20)), old.subarray(10, 30));
    const next = bytesOf(300, 5);
    await writer.write(s.session, next);
    await writer.finish(s.session);
    assert.deepEqual(fs.readFileSync(path.join(dir, 'Copie.fab')), next);
    assert.deepEqual(fs.readFileSync(first), old);
    assert.equal(writer.pathFor('p1'), path.join(dir, 'Copie.fab'));
    assert.deepEqual(saved, [path.join(dir, 'Copie.fab')]);
    // Reading now serves the new file.
    assert.deepEqual(Buffer.from(await writer.read('p1', 0, 5)), next.subarray(0, 5));
  } finally {
    cleanup();
  }
});

test('a cancelled « Enregistrer sous… » changes nothing', async () => {
  const { dir, writer, cleanup } = setup();
  try {
    const first = path.join(dir, 'a.fab');
    fs.writeFileSync(first, bytesOf(10));
    await writer.adopt('p1', first);
    assert.equal(await codeOf(writer.begin({ projectId: 'p1', target: 'choose', pickPath: async () => null })), 'cancelled');
    assert.equal(writer.pathFor('p1'), first);
    assert.deepEqual(names(dir).filter((n) => n !== 'user'), ['a.fab']);
  } finally {
    cleanup();
  }
});

test('a link is followed: the file it points to is replaced, the link stays', async () => {
  const { dir, writer, cleanup } = setup();
  try {
    const real = path.join(dir, 'real.fab');
    const link = path.join(dir, 'link.fab');
    fs.writeFileSync(real, bytesOf(10));
    fs.symlinkSync(real, link);
    await writer.adopt('p1', link);
    const s = await writer.begin({ projectId: 'p1', target: 'current' });
    const next = bytesOf(50, 3);
    await writer.write(s.session, next);
    await writer.finish(s.session);
    assert.ok(fs.lstatSync(link).isSymbolicLink());
    assert.deepEqual(fs.readFileSync(real), next);
    assert.deepEqual(names(dir).filter((n) => n !== 'user'), ['link.fab', 'real.fab']);
  } finally {
    cleanup();
  }
});

test('reading the project\'s file by ranges: bounded, and only its own', async () => {
  const { dir, writer, cleanup } = setup();
  try {
    const file = path.join(dir, 'a.fab');
    const bytes = bytesOf(10_000);
    fs.writeFileSync(file, bytes);
    await writer.adopt('p1', file);
    assert.deepEqual(await writer.info('p1'), { name: 'a.fab', size: 10_000 });
    assert.deepEqual(Buffer.from(await writer.read('p1', 9990, 100)), bytes.subarray(9990), 'cut at the end');
    assert.equal((await writer.read('p1', 10_000, 10)).length, 0);
    for (const [offset, length] of [[-1, 10], [0, -1], [0, 17 * 1024 * 1024], [1.5, 2], [10_001, 1]]) {
      assert.equal(await codeOf(writer.read('p1', offset, length)), 'invalid', `${offset} ${length}`);
    }
  } finally {
    cleanup();
  }
});

test('a chunk that is not bytes ends the save without touching the file', async () => {
  const { dir, writer, cleanup } = setup();
  try {
    const file = path.join(dir, 'a.fab');
    const old = bytesOf(10);
    fs.writeFileSync(file, old);
    await writer.adopt('p1', file);
    const s = await writer.begin({ projectId: 'p1', target: 'current' });
    assert.equal(await codeOf(writer.write(s.session, 'not bytes')), 'invalid');
    assert.deepEqual(names(dir).filter((n) => n !== 'user'), ['a.fab']);
    assert.deepEqual(fs.readFileSync(file), old);
  } finally {
    cleanup();
  }
});

test('the file of a project is remembered across launches, if it is still there', async () => {
  const { dir, cleanup } = setup();
  try {
    const memory = path.join(dir, 'user', 'project-files.json');
    const file = path.join(dir, 'a.fab');
    fs.writeFileSync(file, bytesOf(10));
    const one = createProjectWriter({ file: memory });
    await one.adopt('p1', file);
    const two = createProjectWriter({ file: memory });
    assert.equal(two.pathFor('p1'), null, 'a new launch knows nothing until the page recalls');
    assert.deepEqual(await two.recall('p1'), { name: 'a.fab' });
    assert.equal(two.pathFor('p1'), file);
    assert.equal(await createProjectWriter({ file: memory }).recall('p2'), null);
    fs.rmSync(file);
    assert.equal(await createProjectWriter({ file: memory }).recall('p1'), null, 'a file that is gone is not recalled');
    // The memory file is not a place to write: a corrupt one is ignored.
    fs.writeFileSync(memory, '{{{');
    assert.equal(await createProjectWriter({ file: memory }).recall('p1'), null);
  } finally {
    cleanup();
  }
});

test('stale temporary files are removed (older than a minute, never the one being written, never other files)', async () => {
  const { dir, writer, cleanup } = setup({ now: () => Date.now() });
  try {
    const old = path.join(dir, 'a.fab.tmp-0123456789abcdef');
    const young = path.join(dir, 'b.fab.tmp-fedcba9876543210');
    const other = path.join(dir, 'notes.tmp-0123456789abcdef');
    const keep = path.join(dir, 'c.fab');
    for (const f of [old, young, other, keep]) fs.writeFileSync(f, 'x');
    const longAgo = new Date(Date.now() - 3600_000);
    fs.utimesSync(old, longAgo, longAgo);
    fs.utimesSync(other, longAgo, longAgo);
    await writer.cleanStale([dir, dir, path.join(dir, 'missing')]);
    assert.deepEqual(names(dir).filter((n) => n !== 'user'), ['b.fab.tmp-fedcba9876543210', 'c.fab', 'notes.tmp-0123456789abcdef']);
    // The save in progress is spared, however old.
    await writer.adopt('p1', keep);
    const s = await writer.begin({ projectId: 'p1', target: 'current' });
    const tmp = names(dir).find((n) => n.startsWith('c.fab.tmp-'));
    fs.utimesSync(path.join(dir, tmp), longAgo, longAgo);
    await writer.cleanStale([dir]);
    assert.ok(names(dir).includes(tmp));
    await writer.abort(s.session);
  } finally {
    cleanup();
  }
});

test('withExtension', () => {
  assert.equal(withExtension('/x/a'), '/x/a.fab');
  assert.equal(withExtension('/x/a.FAB'), '/x/a.FAB');
  assert.equal(withExtension('/x/a.txt'), '/x/a.txt.fab');
});
