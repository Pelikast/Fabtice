'use strict';

// Runs the extraction module against the stub yt-dlp with plain Node as the
// JavaScript runtime. The Electron-as-Node runtime is covered by the e2e test.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { extractAudio, tailLines } = require('../../src/extract');
const { sniffContainer } = require('../../src/container');
const { parseSums } = require('../../src/ytdlp-manager');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const STUB = path.join(FIXTURES, 'stub-yt-dlp.js');
const ID = 'dQw4w9WgXcQ';

function withMode(mode, fn) {
  return async () => {
    const before = process.env.FABTICE_STUB_MODE;
    process.env.FABTICE_STUB_MODE = mode;
    try {
      await fn();
    } finally {
      if (before === undefined) delete process.env.FABTICE_STUB_MODE;
      else process.env.FABTICE_STUB_MODE = before;
    }
  };
}

const common = () => ({
  ytdlpPath: STUB,
  videoId: ID,
  jsRuntime: { name: 'node', path: process.execPath, env: {} },
  cacheDir: fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-test-cache-')),
});

test('dash m4a: two steps, argument arrays, temp folder removed', withMode('dash', async () => {
  const progress = [];
  const r = await extractAudio({ ...common(), onProgress: (p) => progress.push(p) });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.meta.title, 'Tonalité d’essai');
  assert.equal(r.report.steps.length, 2);
  const [info, dl] = r.report.steps;
  assert.equal(info.exitCode, 0);
  assert.equal(info.args.at(-1), `https://www.youtube.com/watch?v=${ID}`);
  assert.ok(info.args.includes('--dump-single-json'));
  assert.ok(dl.args.includes('--fixup') && dl.args[dl.args.indexOf('--fixup') + 1] === 'never');
  assert.equal(dl.args[dl.args.indexOf('--js-runtimes') + 1], `node:${process.execPath}`);
  assert.ok(r.report.debugLines.some((l) => /JS runtimes: node-/.test(l)), r.report.debugLines.join('\n'));
  assert.ok(info.stderrTail.some((l) => l.includes('stub challenge solved')), info.stderrTail.join('\n'));
  assert.equal(r.report.file.container.kind, 'mp4-fragmented');
  assert.equal(r.report.tempDeleted, true);
  assert.equal(r.audio.length, fs.statSync(path.join(FIXTURES, 'tone-dash.m4a')).size);
  assert.ok(progress.some((p) => p.phase === 'download' && p.percent === 100));
}));

test('live streams are refused before download', withMode('live', async () => {
  const r = await extractAudio(common());
  assert.equal(r.ok, false);
  assert.equal(r.refused, true);
  assert.equal(r.report.steps.length, 1);
}));

test('videos over 20 minutes are refused before download', withMode('long', async () => {
  const r = await extractAudio(common());
  assert.equal(r.refused, true);
  assert.match(r.error, /20 minutes/);
  assert.equal(r.report.steps.length, 1);
}));

test('yt-dlp errors are reported with their text', withMode('fail', async () => {
  const r = await extractAudio(common());
  assert.equal(r.ok, false);
  assert.match(r.error, /^ERROR: .*Stub failure/);
  assert.equal(r.report.steps[0].exitCode, 1);
}));

test('missing executable is reported, not thrown', async () => {
  const r = await extractAudio({ ...common(), ytdlpPath: path.join(FIXTURES, 'does-not-exist') });
  assert.equal(r.ok, false);
  assert.ok(r.report.steps[0].spawnError);
});

test('container sniffing', () => {
  const dash = sniffContainer(fs.readFileSync(path.join(FIXTURES, 'tone-dash.m4a')));
  assert.equal(dash.kind, 'mp4-fragmented');
  assert.equal(dash.majorBrand, 'dash');
  assert.ok(dash.moofCount >= 1);
  assert.equal(sniffContainer(fs.readFileSync(path.join(FIXTURES, 'tone.webm'))).kind, 'webm');
  assert.equal(sniffContainer(Buffer.from('hello world, not audio')).kind, 'inconnu');
});

test('SHA2-256SUMS parsing and stderr tail', () => {
  const sums = parseSums('0f922c15ccc0b83eefa1c8bc9104e434318c4bf16e408e1ee93b7745a6efe0aa  yt-dlp_macos\n'
    + '20d98fa608998eff87d1d35a6e9fb65e4b874639a6cc89addc19da3becde3ef1  yt-dlp_macos.zip\n');
  assert.equal(sums.get('yt-dlp_macos'), '0f922c15ccc0b83eefa1c8bc9104e434318c4bf16e408e1ee93b7745a6efe0aa');
  assert.equal(sums.size, 2);
  const text = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
  assert.deepEqual(tailLines(text, 40), Array.from({ length: 40 }, (_, i) => `line ${i + 60}`));
});
