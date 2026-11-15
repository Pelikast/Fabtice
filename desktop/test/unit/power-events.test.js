'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { installPowerEvents, processLabel } = require('../../src/power-events');
const { createAudioJournal, sourceFromUrl, JOURNAL_SIZE } = require('../../src/audio-journal');
const protocol = require('../../src/protocol');

function setup() {
  const powerMonitor = new EventEmitter();
  const app = new EventEmitter();
  const journal = createAudioJournal({ dir: null });
  const sent = [];
  const off = installPowerEvents({ powerMonitor, app, journal, send: (p) => sent.push(p) });
  return { powerMonitor, app, journal, sent, off };
}

test('sleep, wake and the screen lock are journaled and forwarded to the windows', () => {
  const s = setup();
  s.powerMonitor.emit('suspend');
  s.powerMonitor.emit('resume');
  s.powerMonitor.emit('lock-screen');
  s.powerMonitor.emit('unlock-screen');
  assert.deepEqual(s.sent, [{ kind: 'suspend' }, { kind: 'resume' }, { kind: 'lock-screen' }, { kind: 'unlock-screen' }]);
  assert.deepEqual(
    s.journal.entries().map((e) => [e.source, e.event, e.text]),
    [
      ['system', 'app-start', 'Fabtice démarre'],
      ['system', 'sleep', 'Le Mac se met en veille'],
      ['system', 'wake', 'Le Mac sort de veille'],
      ['system', 'lock-screen', 'Écran verrouillé'],
      ['system', 'unlock-screen', 'Écran déverrouillé'],
    ],
  );
});

test('the heat of the Mac, its shutdown and the end of a Chromium process are journaled only', () => {
  const s = setup();
  s.powerMonitor.emit('thermal-state-change', { state: 'serious' });
  s.powerMonitor.emit('shutdown');
  s.app.emit('child-process-gone', {}, { type: 'Utility', serviceName: 'audio.mojom.AudioService', name: 'Audio Service', reason: 'crashed', exitCode: 11 });
  s.app.emit('child-process-gone', {}, { type: 'GPU', reason: 'killed' });
  s.app.emit('render-process-gone', {}, {}, { reason: 'oom' });
  const texts = s.journal.entries().slice(1).map((e) => e.text);
  assert.deepEqual(texts, [
    'Température du Mac : élevée',
    'Arrêt ou redémarrage du Mac',
    'le service audio de Chromium s’est arrêté (raison : crashed, code 11)',
    'le processus graphique s’est arrêté (raison : killed)',
    'Une fenêtre de Fabtice s’est arrêtée (raison : oom)',
  ]);
  assert.deepEqual(s.sent, []);
  assert.equal(processLabel({ type: 'Utility', name: 'Network Service' }), 'le service réseau');
});

test('a window that went away does not break the forwarding; the listeners can be removed', () => {
  const powerMonitor = new EventEmitter();
  const app = new EventEmitter();
  const journal = createAudioJournal({ dir: null });
  const off = installPowerEvents({ powerMonitor, app, journal, send: () => { throw new Error('destroyed'); } });
  assert.doesNotThrow(() => powerMonitor.emit('suspend'));
  off();
  assert.equal(powerMonitor.listenerCount('suspend') + powerMonitor.listenerCount('resume') + app.listenerCount('child-process-gone') + app.listenerCount('before-quit'), 0);
});

test('the journal keeps 200 one-line events, refuses malformed ones, keeps the last play apart', () => {
  let t = Date.parse('2026-11-15T10:00:00Z');
  const journal = createAudioJournal({ dir: null, now: () => new Date((t += 1000)), redact: (x) => String(x).split('/Users/someone').join('~') });
  for (let i = 0; i < JOURNAL_SIZE + 5; i++) journal.add('page', 'reopen', `Sortie audio rouverte en ${i} ms`);
  assert.equal(journal.entries().length, JOURNAL_SIZE);
  assert.equal(journal.entries()[0].text, 'Sortie audio rouverte en 5 ms');
  assert.equal(journal.add('page', 'Bad Event', 'x'), null);
  assert.equal(journal.add('elsewhere', 'reopen', 'x'), null);
  assert.equal(journal.add('page', 'reopen', '   '), null);
  assert.equal(journal.addFromPage('page', null), null);
  const e = journal.add('diagnostic', 'context-created', 'ligne\nsur deux /Users/someone/x');
  assert.equal(e.text, 'ligne sur deux ~/x');
  assert.equal(journal.add('page', 'x', 'é'.repeat(400)).text.length, 300);
  journal.addFromPage('page', { event: 'play', text: 'lecture démarrée en 12 ms', sticky: true });
  const text = journal.text();
  assert.match(text, /^=== Fabtice — journal audio ===\nCopié le \d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}\nDernière lecture réussie : .+ — lecture démarrée en 12 ms\n200 événement\(s\)/);
  assert.match(text, /\[diagnostic\] ligne sur deux ~\/x/);
  assert.equal(journal.entries().some((x) => x.event === 'play'), false);
});

test('the journal survives a restart: written to the user-data folder, read back before the new events', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-journal-'));
  try {
    const first = createAudioJournal({ dir, saveDelayMs: 5 });
    first.add('system', 'sleep', 'Le Mac se met en veille');
    first.addFromPage('page', { event: 'play', text: 'lecture démarrée en 30 ms', sticky: true });
    await first.flush();
    const second = createAudioJournal({ dir });
    second.add('system', 'app-start', 'Fabtice démarre');
    await second.load();
    assert.deepEqual(second.entries().map((e) => e.event), ['sleep', 'app-start']);
    assert.equal(second.lastPlay().text, 'lecture démarrée en 30 ms');
    fs.writeFileSync(path.join(dir, 'audio-journal.json'), '{ not json');
    const third = createAudioJournal({ dir });
    await third.load();
    assert.deepEqual(third.entries(), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an event comes from the interface or the diagnostic window, told by the address only', () => {
  assert.equal(sourceFromUrl('fabtice://app/index.html', protocol), 'page');
  assert.equal(sourceFromUrl('fabtice://diagnostic/index.html', protocol), 'diagnostic');
  assert.equal(sourceFromUrl('https://app/index.html', protocol), null);
  assert.equal(sourceFromUrl('fabtice://other/', protocol), null);
  assert.equal(sourceFromUrl('not a url', protocol), null);
});

test('the IPC handlers add what a page sends and give the text back', async () => {
  const journal = createAudioJournal({ dir: null });
  const handlers = {};
  journal.registerIpc((channel, fn) => { handlers[channel] = fn; }, { sourceOf: (url) => sourceFromUrl(url, protocol) });
  assert.equal(await handlers['fabtice:audio-journal-add']({ senderFrame: { url: 'fabtice://app/index.html' } }, { event: 'release', text: 'Sortie audio rendue au système (inactivité)' }), true);
  await assert.rejects(handlers['fabtice:audio-journal-add']({ senderFrame: { url: 'https://example.org/' } }, { event: 'release', text: 'x' }));
  const answer = await handlers['fabtice:audio-journal']();
  assert.equal(answer.count, 1);
  assert.match(answer.text, /\[interface\] Sortie audio rendue au système \(inactivité\)/);
});

// The owner's Mac must be able to sleep: nothing in the app may hold it awake.
test('the main process never prevents sleep (no powerSaveBlocker anywhere in the app)', () => {
  const src = path.join(__dirname, '..', '..', 'src');
  const files = [];
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (/\.(js|cjs|mjs|html)$/.test(name)) files.push(full);
    }
  };
  walk(src);
  assert.ok(files.some((f) => f.endsWith('main.js')));
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(text, /powerSaveBlocker|prevent-app-suspension|prevent-display-sleep|preventAppSuspension/, path.basename(f));
  }
});
