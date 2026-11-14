#!/usr/bin/env node
'use strict';

// Stand-in for yt-dlp used by the automated test (FABTICE_YTDLP_PATH points
// here). It answers the two calls Fabtice makes, copies a local audio file
// instead of downloading anything, and, like yt-dlp's "node" challenge
// provider, runs the JavaScript runtime it is given with `--version` and then
// `--permission -` with a script on stdin.
//
// FABTICE_STUB_MODE: dash (default) | webm | live | long | fail
// FABTICE_STUB_LOG: optional file receiving one JSON line per invocation
// FABTICE_STUB_FILE: hand back this file (any size, any extension) instead of
//   the small fixture, to test pieces of real size
// FABTICE_STUB_START_DELAY_MS: say nothing for this long when the download
//   starts (the self-extracting binary of an older Mac, slow to start)
// FABTICE_STUB_PROGRESS: known (default) | unknown (no total, like a download
//   whose size yt-dlp cannot know) | none (no progress line at all)
// FABTICE_STUB_PROGRESS_GAP_MS: pause between two progress lines
// The progress lines are the ones real yt-dlp prints (see parseProgressLine in
// src/extract.js and its unit test).

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
const mode = process.env.FABTICE_STUB_MODE || 'dash';
// Where the audio fixtures are (the stub may be installed elsewhere as a fake yt-dlp).
const FIXTURE_DIR = process.env.FABTICE_STUB_FIXTURES || __dirname;

if (process.env.FABTICE_STUB_LOG) {
  fs.appendFileSync(process.env.FABTICE_STUB_LOG, `${JSON.stringify({ args, electronRunAsNode: process.env.ELECTRON_RUN_AS_NODE || null })}\n`);
}

if (args.includes('--version')) {
  process.stdout.write('2099.01.01-stub\n');
  process.exit(0);
}

const value = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

function solveWithRuntime() {
  const spec = value('--js-runtimes');
  if (!spec || !spec.startsWith('node:')) {
    process.stderr.write('[debug] JS runtimes: none\n');
    return;
  }
  const runtime = spec.slice('node:'.length);
  const v = spawnSync(runtime, ['--version'], { encoding: 'utf8', timeout: 20000 });
  const version = (v.stdout || '').trim();
  if (!/^v\d+/.test(version)) {
    process.stderr.write(`[debug] JS runtimes: none (node --version gave ${JSON.stringify(version)} ${v.stderr || ''})\n`);
    return;
  }
  process.stderr.write(`[debug] JS runtimes: node-${version.slice(1)}\n`);
  const script = 'const n = (s) => s.split("").reverse().join(""); console.log(JSON.stringify({ type: "result", n: n("abc") }));';
  const r = spawnSync(runtime, ['--permission', '-'], { input: script, encoding: 'utf8', timeout: 20000 });
  const ok = r.status === 0 && !r.stderr && JSON.parse(r.stdout || '{}').n === 'cba';
  process.stderr.write(`[youtube] [jsc:node] stub challenge ${ok ? 'solved' : `FAILED status=${r.status} stderr=${JSON.stringify(r.stderr)}`}\n`);
}

const STUB_FILE = process.env.FABTICE_STUB_FILE || null;
const FIXTURES = {
  dash: { file: 'tone-dash.m4a', ext: 'm4a', container: 'm4a_dash', acodec: 'mp4a.40.2', formatId: '140' },
  webm: { file: 'tone.webm', ext: 'webm', container: 'webm_dash', acodec: 'opus', formatId: '251' },
};

process.stderr.write(`[debug] Command-line config: ${JSON.stringify(args)}\n`);
process.stderr.write('[debug] yt-dlp version stub@2099.01.01 (test stub)\n');

if (args.includes('--dump-single-json')) {
  solveWithRuntime();
  if (mode === 'fail') {
    process.stderr.write('ERROR: [youtube] xxxxxxxxxxx: Stub failure requested by FABTICE_STUB_MODE=fail\n');
    process.exit(1);
  }
  const url = args[args.length - 1];
  const id = new URL(url).searchParams.get('v');
  const fx = STUB_FILE
    ? { file: path.basename(STUB_FILE), ext: path.extname(STUB_FILE).slice(1), container: 'file', acodec: 'unknown', formatId: '0' }
    : FIXTURES[mode] || FIXTURES.dash;
  const info = {
    id,
    title: 'Tonalité d’essai',
    channel: 'Fabtice test',
    uploader: 'Fabtice test',
    duration: mode === 'long' ? 21 * 60 : 4,
    is_live: mode === 'live',
    live_status: mode === 'live' ? 'is_live' : 'not_live',
    format_id: fx.formatId,
    ext: fx.ext,
    acodec: fx.acodec,
    vcodec: 'none',
    container: fx.container,
    abr: 64,
    asr: 44100,
    audio_channels: 2,
    filesize: fs.statSync(STUB_FILE || path.join(FIXTURE_DIR, fx.file)).size,
    protocol: 'https',
    formats: [],
  };
  process.stdout.write(JSON.stringify(info));
  process.exit(0);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MIB = 1024 * 1024;
const size = (bytes) => (bytes >= MIB ? `${(bytes / MIB).toFixed(2)}MiB` : `${(bytes / 1024).toFixed(2)}KiB`).padStart(10);

async function download(source, out) {
  const startDelay = Number(process.env.FABTICE_STUB_START_DELAY_MS || 0);
  const gap = Number(process.env.FABTICE_STUB_PROGRESS_GAP_MS || 0);
  const kind = process.env.FABTICE_STUB_PROGRESS || 'known';
  if (startDelay > 0) await sleep(startDelay);
  const total = fs.statSync(source).size;
  process.stderr.write('[debug] stub: download starts\n');
  process.stdout.write(`[info] stub: Downloading 1 format(s): 140\n[download] Destination: ${out}\n`);
  // The lines real yt-dlp prints with --newline (observed against a local server).
  if (kind === 'known') {
    for (const pct of [0, 25, 50, 75, 100]) {
      process.stdout.write(`[download] ${`${pct.toFixed(1)}%`.padStart(6)} of ${size(total)} at ${pct === 0 ? ' Unknown B/s' : '  1.28MiB/s'} ETA ${pct === 100 ? '00:00' : '00:01'}\n`);
      if (gap) await sleep(gap);
    }
    process.stdout.write(`[download] 100% of ${size(total)} in 00:00:01 at 1.27MiB/s\n`);
  } else if (kind === 'unknown') {
    for (const fraction of [0.1, 0.35, 0.7, 1]) {
      process.stdout.write(`[download] ${size(Math.round(total * fraction))} at   1.28MiB/s (00:00:01)\n`);
      if (gap) await sleep(gap);
    }
    process.stdout.write(`[download] 100% of ${size(total)} in 00:00:01 at 1.27MiB/s\n`);
  }
  fs.copyFileSync(source, out);
  process.exit(0);
}

const infoPath = value('--load-info-json');
if (infoPath) {
  if (value('--fixup') !== 'never') {
    process.stderr.write('ERROR: stub expects --fixup never\n');
    process.exit(2);
  }
  const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
  const source = STUB_FILE || path.join(FIXTURE_DIR, (Object.values(FIXTURES).find((f) => f.ext === info.ext) || FIXTURES.dash).file);
  const ext = STUB_FILE ? path.extname(STUB_FILE).slice(1) : (Object.values(FIXTURES).find((f) => f.ext === info.ext) || FIXTURES.dash).ext;
  const out = value('--output').replace('%(ext)s', ext);
  download(source, out);
} else {
  process.stderr.write('ERROR: stub does not understand these arguments\n');
  process.exit(2);
}
