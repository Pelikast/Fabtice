'use strict';

// Runs yt-dlp in two steps, always with an argument array (never a shell):
//   1. "-J": extraction only, yielding title, channel, duration and live status
//      so that live streams and long videos are refused before any download;
//   2. "--load-info-json": downloads the already-selected audio format from the
//      step-1 JSON, without asking YouTube for the page a second time.
// The audio is read into memory and the temporary folder is always deleted.

const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { canonicalUrl } = require('./video-id');
const { sniffContainer } = require('./container');

const FORMAT = 'bestaudio[ext=m4a][acodec^=mp4a]/bestaudio[ext=m4a]/bestaudio';
const MAX_DURATION_S = 20 * 60;
const STDERR_TAIL_LINES = 40;
const INFO_TIMEOUT_MS = 3 * 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;

function tailLines(text, n) {
  const lines = text.replace(/\r/g, '\n').split('\n').filter((l) => l.length > 0);
  return lines.slice(-n);
}

function runProcess(file, args, { env, timeoutMs, onStdoutLine, signal }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(file, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    let stderr = '';
    let pending = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    const onAbort = () => child.kill('SIGKILL');
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (chunk) => {
      stdout.push(chunk);
      if (onStdoutLine) {
        pending += chunk.toString('utf8');
        const lines = pending.split(/\r?\n/);
        pending = lines.pop();
        for (const line of lines) onStdoutLine(line);
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 2_000_000) stderr = stderr.slice(-1_000_000);
    });
    const finish = (exitCode, sig, spawnError) => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve({
        exitCode,
        signal: sig,
        spawnError: spawnError ? spawnError.message : null,
        timedOut,
        durationMs: Date.now() - started,
        stdout: Buffer.concat(stdout),
        stderr,
      });
    };
    child.on('error', (err) => finish(null, null, err));
    child.on('close', (code, sig) => finish(code, sig, null));
  });
}

function stepReport(label, file, args, result) {
  return {
    label,
    executable: file,
    args,
    exitCode: result.exitCode,
    signal: result.signal,
    spawnError: result.spawnError,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    stderrTail: tailLines(result.stderr, STDERR_TAIL_LINES),
  };
}

// Lines of yt-dlp's verbose header that the diagnostics want verbatim.
function pickDebugLines(stderr) {
  const wanted = [/^\[debug\] yt-dlp version/, /^\[debug\] JS runtimes:/, /^\[debug\] Optional libraries:/,
    /^\[debug\] Python /, /^\[debug\] exe versions:/, /\[jsc[^\]]*\]/, /challenge solver/i];
  const out = [];
  for (const line of stderr.split(/\r?\n/)) {
    if (wanted.some((re) => re.test(line)) && !out.includes(line)) out.push(line);
    if (out.length >= 15) break;
  }
  return out;
}

function baseArgs(jsRuntime, cacheDir) {
  const args = ['--ignore-config', '--no-playlist', '--verbose'];
  if (jsRuntime) args.push('--no-js-runtimes', '--js-runtimes', `node:${jsRuntime.path}`);
  args.push('--cache-dir', cacheDir);
  return args;
}

function lastError(stderr) {
  const errors = stderr.split(/\r?\n/).filter((l) => l.startsWith('ERROR:'));
  return errors.length ? errors[errors.length - 1] : null;
}

async function extractAudio({ ytdlpPath, videoId, jsRuntime, cacheDir, onProgress = () => {}, signal }) {
  const url = canonicalUrl(videoId);
  const env = { ...process.env, ...(jsRuntime ? jsRuntime.env : {}) };
  const report = { url, videoId, format: FORMAT, steps: [], debugLines: [] };
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'fabtice-'));
  const started = Date.now();
  try {
    // Step 1: metadata.
    onProgress({ phase: 'info' });
    const infoArgs = [...baseArgs(jsRuntime, cacheDir), '--format', FORMAT, '--dump-single-json', '--', url];
    const info = await runProcess(ytdlpPath, infoArgs, { env, timeoutMs: INFO_TIMEOUT_MS, signal });
    report.steps.push(stepReport('infos (-J)', ytdlpPath, infoArgs, info));
    report.debugLines = pickDebugLines(info.stderr);
    if (info.exitCode !== 0) {
      return { ok: false, error: lastError(info.stderr) || 'yt-dlp a échoué pendant la lecture des informations', report };
    }
    let meta;
    try {
      meta = JSON.parse(info.stdout.toString('utf8'));
    } catch (e) {
      return { ok: false, error: `réponse JSON illisible : ${e.message}`, report };
    }
    const summary = {
      id: meta.id,
      title: meta.title || null,
      channel: meta.channel || meta.uploader || null,
      duration: typeof meta.duration === 'number' ? meta.duration : null,
      liveStatus: meta.live_status || null,
      isLive: Boolean(meta.is_live),
      formatId: meta.format_id || null,
      ext: meta.ext || null,
      acodec: meta.acodec || null,
      container: meta.container || null,
      abr: meta.abr || null,
      asr: meta.asr || null,
      audioChannels: meta.audio_channels || null,
      filesize: meta.filesize || meta.filesize_approx || null,
      protocol: meta.protocol || null,
    };
    report.meta = summary;

    if (summary.isLive || ['is_live', 'is_upcoming', 'post_live'].includes(summary.liveStatus)) {
      return { ok: false, refused: true, error: 'Les directs ne peuvent pas être importés pour l’instant.', meta: summary, report };
    }
    if (summary.duration === null) {
      return { ok: false, refused: true, error: 'Durée inconnue : import refusé par prudence.', meta: summary, report };
    }
    if (summary.duration > MAX_DURATION_S) {
      return { ok: false, refused: true, error: 'Cette vidéo dure plus de 20 minutes : import refusé pour l’instant.', meta: summary, report };
    }

    // Step 2: download, no remux (no ffmpeg is shipped).
    const infoPath = path.join(tmp, 'info.json');
    await fsp.writeFile(infoPath, info.stdout);
    const dlArgs = [...baseArgs(jsRuntime, cacheDir), '--load-info-json', infoPath, '--format', FORMAT,
      '--fixup', 'never', '--no-part', '--no-mtime', '--newline', '--output', path.join(tmp, 'audio.%(ext)s')];
    onProgress({ phase: 'download', percent: 0, meta: summary });
    const dl = await runProcess(ytdlpPath, dlArgs, {
      env,
      timeoutMs: DOWNLOAD_TIMEOUT_MS,
      signal,
      onStdoutLine: (line) => {
        const m = line.match(/^\[download\]\s+([\d.]+)%/);
        if (m) onProgress({ phase: 'download', percent: Number(m[1]) });
      },
    });
    report.steps.push(stepReport('téléchargement', ytdlpPath, dlArgs, dl));
    if (dl.exitCode !== 0) {
      return { ok: false, error: lastError(dl.stderr) || 'yt-dlp a échoué pendant le téléchargement', meta: summary, report };
    }
    const files = (await fsp.readdir(tmp)).filter((f) => f.startsWith('audio.'));
    if (files.length !== 1) {
      return { ok: false, error: `fichier audio introuvable (${files.join(', ') || 'aucun'})`, meta: summary, report };
    }
    const audio = await fsp.readFile(path.join(tmp, files[0]));
    report.file = {
      name: files[0],
      size: audio.length,
      container: sniffContainer(audio),
    };
    report.totalMs = Date.now() - started;
    return { ok: true, audio, meta: summary, report };
  } finally {
    report.totalMs = report.totalMs || Date.now() - started;
    await fsp.rm(tmp, { recursive: true, force: true });
    report.tempDeleted = true;
  }
}

module.exports = { extractAudio, FORMAT, MAX_DURATION_S, tailLines, pickDebugLines };
