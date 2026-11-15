'use strict';

// « Projets récents »: most recent first, a short list, files gone dropped,
// handed to macOS, opened by a token of the listing only.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRecentProjects, MAX_RECENT } = require('../../src/recent-projects');
const { createProjects } = require('../../src/projects');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-recent-'));
}

test('most recent first, no twice the same, a short list, kept across a restart, files gone dropped', async () => {
  const dir = tempDir();
  try {
    const system = [];
    const file = path.join(dir, 'data', 'recent-projects.json');
    const recent = createRecentProjects({ file, home: dir, addRecentDocument: (p) => system.push(p) });
    const paths = Array.from({ length: MAX_RECENT + 2 }, (_, i) => path.join(dir, 'Projets', `Morceau ${i}.fab`));
    fs.mkdirSync(path.join(dir, 'Projets'));
    for (const p of paths) fs.writeFileSync(p, 'x');
    for (const [i, p] of paths.entries()) await recent.add(p, new Date(2026, 10, 15, 10, i));
    await recent.add(paths[3], new Date(2026, 10, 15, 11));
    await recent.add(path.join(dir, 'pas-un-projet.mp3'));
    await recent.add('relatif.fab');
    let list = await recent.list();
    assert.equal(list.length, MAX_RECENT);
    assert.equal(list[0].name, 'Morceau 3.fab');
    assert.equal(list[1].name, `Morceau ${MAX_RECENT + 1}.fab`);
    assert.equal(list[0].folder, `~${path.sep}Projets`, 'the home folder is written « ~ »');
    assert.ok(!JSON.stringify(list).includes(dir), 'no full path in what the page sees');
    assert.equal(system.length, MAX_RECENT + 3, 'each one handed to macOS');

    // A restart: the same list; a file deleted meanwhile is dropped.
    fs.rmSync(paths[3]);
    const again = createRecentProjects({ file, home: dir });
    list = await again.list();
    assert.equal(list.length, MAX_RECENT - 1);
    assert.equal(list[0].name, `Morceau ${MAX_RECENT + 1}.fab`);
    assert.equal(again.pathFor(list[0].token), paths[MAX_RECENT + 1]);
    assert.equal(again.pathFor('made-up'), null);
    // Tokens are for the last listing only.
    const old = list[0].token;
    await again.list();
    assert.equal(again.pathFor(old), null);
    await again.clear();
    assert.deepEqual(await again.list(), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a project saved or opened goes in the list; the page opens one by its token and receives it as from the Finder', async () => {
  const dir = tempDir();
  try {
    const projects = createProjects({ userData: () => dir });
    const handlers = new Map();
    projects.registerIpc((channel, fn) => handlers.set(channel, fn));
    const sent = [];
    const event = { sender: { isDestroyed: () => false, send: (channel, payload) => sent.push({ channel, payload }) } };
    assert.deepEqual(await handlers.get('fabtice:pending-projects')(event), []);

    const saved = path.join(dir, 'Lover Man.fab');
    fs.writeFileSync(saved, 'PK');
    projects.saved(saved);
    projects.saved(path.join(dir, 'export.wav'));
    await new Promise((r) => setTimeout(r, 50));
    const list = await handlers.get('fabtice:recent-projects')(event);
    assert.deepEqual(list.map((e) => e.name), ['Lover Man.fab']);
    assert.deepEqual(await handlers.get('fabtice:open-recent-project')(event, list[0].token), { ok: true });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].channel, 'fabtice:open-project');
    assert.equal(sent[0].payload.name, 'Lover Man.fab');
    assert.deepEqual(Buffer.from(await handlers.get('fabtice:read-project')(event, sent[0].payload.token, 0, 2)).toString(), 'PK');
    assert.deepEqual(await handlers.get('fabtice:open-recent-project')(event, 'nope'), { ok: false });

    // From the page's own picker: only a real .fab file is remembered.
    const picked = path.join(dir, 'Autre.fab');
    fs.writeFileSync(picked, 'PK');
    assert.equal(await handlers.get('fabtice:remember-project')(event, picked), true);
    assert.equal(await handlers.get('fabtice:remember-project')(event, path.join(dir, 'absent.fab')), false);
    assert.equal(await handlers.get('fabtice:remember-project')(event, '/etc/passwd'), false);
    assert.deepEqual((await handlers.get('fabtice:recent-projects')(event)).map((e) => e.name), ['Autre.fab', 'Lover Man.fab']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
