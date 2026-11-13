'use strict';

// The interface tells two bridge answers apart by the start of their French
// sentence (app/src/import/fromLink.ts). Pin them from both sides.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const messages = require('../../src/messages');

const FROM_LINK = path.join(__dirname, '..', '..', '..', 'app', 'src', 'import', 'fromLink.ts');

test('the two sentences keep the beginning the interface looks for', () => {
  assert.ok(messages.LINK_NOT_RECOGNISED.startsWith('Lien non reconnu'));
  assert.ok(messages.BUSY.startsWith('Une importation est déjà en cours'));
});

test('main.js answers with those constants, not with its own copies', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'main.js'), 'utf8');
  assert.match(main, /error: messages\.BUSY/);
  assert.match(main, /error: messages\.LINK_NOT_RECOGNISED/);
  assert.doesNotMatch(main, /'Lien non reconnu|'Une importation est déjà/);
});

test('app/src/import/fromLink.ts still matches on the same beginnings', { skip: !fs.existsSync(FROM_LINK) }, () => {
  const source = fs.readFileSync(FROM_LINK, 'utf8');
  const prefixes = [...source.matchAll(/error\.startsWith\('([^']+)'\)/g)].map((m) => m[1]);
  assert.deepEqual(prefixes.sort(), ['Lien non reconnu', 'Une importation est déjà en cours'].sort());
  for (const prefix of prefixes) {
    assert.ok([messages.BUSY, messages.LINK_NOT_RECOGNISED].some((m) => m.startsWith(prefix)), prefix);
  }
});
