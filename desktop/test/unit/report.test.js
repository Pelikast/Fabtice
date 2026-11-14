'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { extractAudio } = require('../../src/extract');
const { formatImportReport } = require('../../src/report');

const STUB = path.join(__dirname, '..', 'fixtures', 'stub-yt-dlp.js');
const ID = 'dQw4w9WgXcQ';

function withEnv(env, fn) {
  return async () => {
    const before = {};
    for (const [k, v] of Object.entries(env)) {
      before[k] = process.env[k];
      process.env[k] = v;
    }
    try {
      await fn();
    } finally {
      for (const [k, v] of Object.entries(before)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };
}

const common = () => ({
  ytdlpPath: STUB,
  videoId: ID,
  jsRuntime: { name: 'node', path: process.execPath, env: {} },
  cacheDir: fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-test-cache-')),
});

test('known size: « prepare » first, then only real progress, then the report says where the time went', withEnv({ FABTICE_STUB_MODE: 'dash', FABTICE_STUB_START_DELAY_MS: '400', FABTICE_STUB_PROGRESS_GAP_MS: '20' }, async () => {
  const events = [];
  const r = await extractAudio({ ...common(), onProgress: (p) => events.push(p) });
  assert.equal(r.ok, true, r.error);
  const names = events.map((p) => p.phase);
  assert.deepEqual(names.slice(0, 2), ['info', 'prepare']);
  assert.equal(events[1].meta.title, 'Tonalité d’essai');
  // Never a « download » event (hence never a percentage) before a progress line was read.
  assert.ok(names.slice(2).every((n) => n === 'download'));
  assert.ok(events.slice(2).every((p) => typeof p.percent === 'number' && p.totalBytes > 0));
  assert.equal(events.at(-1).percent, 100);

  const d = r.report.download;
  assert.ok(d.firstOutputMs >= 350, `the start-up delay shows: ${d.firstOutputMs} ms`);
  assert.ok(d.firstProgressMs >= d.firstOutputMs);
  assert.equal(d.sizeKnown, true);
  assert.ok(d.progressLines >= 5);
  assert.match(d.finishedLine, /^\[download\] 100% of/);
  assert.equal(d.fileBytes, r.report.file.size);
  assert.ok(d.bytesPerSecond > 0);
  assert.ok(r.report.steps[1].firstStderrMs >= 350, 'the step carries the first-word time');
  assert.equal(r.report.steps[0].firstStderrMs !== null, true);
}));

test('unknown size: amounts only, never a percentage', withEnv({ FABTICE_STUB_MODE: 'dash', FABTICE_STUB_PROGRESS: 'unknown' }, async () => {
  const events = [];
  const r = await extractAudio({ ...common(), onProgress: (p) => events.push(p) });
  assert.equal(r.ok, true, r.error);
  const downloads = events.filter((p) => p.phase === 'download');
  assert.ok(downloads.length >= 4);
  // All but the closing summary have no percentage; amounts only.
  const measured = downloads.slice(0, -1);
  assert.ok(measured.every((p) => p.percent === null && p.totalBytes === null && p.receivedBytes > 0), JSON.stringify(measured));
  assert.equal(r.report.download.sizeKnown, true, 'the closing summary announces the size');
  assert.match(r.report.download.firstProgressLine, /^\[download\]\s+\d/);
}));

test('no progress line at all: only « prepare », and the report says so', withEnv({ FABTICE_STUB_MODE: 'dash', FABTICE_STUB_PROGRESS: 'none' }, async () => {
  const events = [];
  const r = await extractAudio({ ...common(), onProgress: (p) => events.push(p) });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(events.map((p) => p.phase), ['info', 'prepare']);
  assert.equal(r.report.download.firstProgressMs, null);
  assert.equal(r.report.download.progressLines, 0);
  assert.equal(r.report.download.bytesPerSecond, null);
}));

test('the yt-dlp arguments are untouched: same options as before, no cookies, no client options', withEnv({ FABTICE_STUB_MODE: 'dash' }, async () => {
  const r = await extractAudio(common());
  const [info, dl] = r.report.steps;
  const flags = (args) => args.filter((a) => a.startsWith('--'));
  assert.deepEqual(flags(info.args), ['--ignore-config', '--no-playlist', '--verbose', '--no-js-runtimes', '--js-runtimes', '--cache-dir', '--format', '--dump-single-json', '--']);
  assert.deepEqual(flags(dl.args), ['--ignore-config', '--no-playlist', '--verbose', '--no-js-runtimes', '--js-runtimes', '--cache-dir', '--load-info-json', '--format', '--fixup', '--no-part', '--no-mtime', '--newline', '--output']);
  for (const a of [...info.args, ...dl.args]) assert.ok(!/cookie|extractor-args|impersonate|proxy/i.test(a), a);
}));

test('the text report names the times, speed and first progress line', withEnv({ FABTICE_STUB_MODE: 'dash', FABTICE_STUB_START_DELAY_MS: '300' }, async () => {
  const r = await extractAudio(common());
  const text = formatImportReport({ at: '2026-11-14T10:00:00.000Z', ok: true, error: undefined, report: r.report });
  assert.match(text, /^Rapport du dernier import fait depuis l’interface/);
  assert.match(text, /Résultat : réussi/);
  assert.match(text, /1\. Recherche du morceau/);
  assert.match(text, /2\. Téléchargement du son/);
  assert.match(text, /temps avant la première ligne de progression : \d+,\d s — affiché comme « Préparation du téléchargement »/);
  assert.match(text, /téléchargement proprement dit : .* soit [\d,]+ Mo\/s/);
  assert.match(text, /bilan de yt-dlp : \[download\] 100% of/);
  assert.match(text, /Détail technique/);
  assert.doesNotMatch(text, /undefined|NaN/);
}));

test('the text report of a failed or refused import still reads', async () => {
  const refused = formatImportReport({ at: 'x', ok: false, refused: true, error: 'Les directs ne peuvent pas être importés pour l’instant.', report: { steps: [] } });
  assert.match(refused, /Résultat : refusé — Les directs/);
  const crashed = formatImportReport({ at: 'x', ok: false, error: 'Erreur interne : boom', report: null });
  assert.match(crashed, /ÉCHEC — Erreur interne : boom/);
  assert.doesNotMatch(crashed, /undefined|NaN/);
});
