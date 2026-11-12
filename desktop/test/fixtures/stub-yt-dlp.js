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

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
const mode = process.env.FABTICE_STUB_MODE || 'dash';

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
  const fx = FIXTURES[mode] || FIXTURES.dash;
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
    filesize: fs.statSync(path.join(__dirname, fx.file)).size,
    protocol: 'https',
    formats: [],
  };
  process.stdout.write(JSON.stringify(info));
  process.exit(0);
}

const infoPath = value('--load-info-json');
if (infoPath) {
  if (value('--fixup') !== 'never') {
    process.stderr.write('ERROR: stub expects --fixup never\n');
    process.exit(2);
  }
  const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
  const fx = Object.values(FIXTURES).find((f) => f.ext === info.ext) || FIXTURES.dash;
  const out = value('--output').replace('%(ext)s', fx.ext);
  for (const pct of ['0.0', '50.0', '100.0']) process.stdout.write(`[download] ${pct.padStart(5)}% of 34.00KiB\n`);
  fs.copyFileSync(path.join(__dirname, fx.file), out);
  process.stdout.write(`[download] Destination: ${out}\n`);
  process.exit(0);
}

process.stderr.write('ERROR: stub does not understand these arguments\n');
process.exit(2);
