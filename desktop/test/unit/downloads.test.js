'use strict';

// The save panel of a download: a clean name (accents kept), a French title, the
// right starting folder.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { saveName, saveDialogOptions, installDownloads, FALLBACK_NAME, MAX_NAME } = require('../../src/downloads');

test('keeps a name with accents and dashes as it is', () => {
  assert.equal(saveName('Blues du dimanche – mélange (+2 demi-tons, tempo 80 %).wav'), 'Blues du dimanche – mélange (+2 demi-tons, tempo 80 %).wav');
  assert.equal(saveName('Été à Paris – pistes.zip'), 'Été à Paris – pistes.zip');
});

test('drops any path, control character and reserved sign', () => {
  assert.equal(saveName('../../etc/passwd'), 'passwd');
  assert.equal(saveName('C:\\Users\\x\\a.wav'), 'a.wav');
  assert.equal(saveName('a/b:c*d?e"f<g>h|i.wav'), 'b c d e f g h i.wav');
  assert.equal(saveName('tab\there\u0000.wav'), 'tab here .wav');
  assert.equal(saveName('.hidden.wav'), 'hidden.wav');
});

test('falls back on a name when nothing is left, and shortens a very long one keeping its extension', () => {
  for (const bad of ['', '   ', '///', '...', null, undefined, '***']) assert.equal(saveName(bad), FALLBACK_NAME);
  const long = `${'a'.repeat(400)}.flac`;
  const cut = saveName(long);
  assert.equal(cut.length, MAX_NAME);
  assert.ok(cut.endsWith('.flac'));
});

test('the panel starts in the given folder with the cleaned name and a French title', () => {
  const o = saveDialogOptions('Pièce.wav', '/Users/x/Downloads');
  assert.equal(o.defaultPath, path.join('/Users/x/Downloads', 'Pièce.wav'));
  assert.equal(o.title, 'Enregistrer le fichier');
  assert.equal(o.buttonLabel, 'Enregistrer');
});

test('every download gets the panel options, and the next starts where the last one went', () => {
  const session = new EventEmitter();
  installDownloads(session, { downloadsDir: () => '/home/x/Downloads' });
  const download = (filename, savedTo, state = 'completed') => {
    const item = new EventEmitter();
    item.options = null;
    item.getFilename = () => filename;
    item.setSaveDialogOptions = (o) => (item.options = o);
    item.getSavePath = () => savedTo;
    session.emit('will-download', {}, item);
    item.emit('done', {}, state);
    return item;
  };
  assert.equal(download('a.wav', '/home/x/Music/a.wav').options.defaultPath, path.join('/home/x/Downloads', 'a.wav'));
  assert.equal(download('b.zip', '/home/x/Desktop/b.zip', 'cancelled').options.defaultPath, path.join('/home/x/Music', 'b.zip'));
  // A cancelled one does not move the folder.
  assert.equal(download('c.mp3', '').options.defaultPath, path.join('/home/x/Music', 'c.mp3'));
});
