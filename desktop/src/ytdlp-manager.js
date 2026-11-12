'use strict';

// Downloads, verifies and updates the official yt-dlp standalone executable.
// It is never shipped inside the app bundle: it lives in the user-data folder.
//
// Asset choice (yt-dlp README, release 2026.10.26): "yt-dlp_macos — Universal
// MacOS (10.15+) standalone executable (recommended for MacOS)". One file runs
// natively on both Intel and Apple Silicon. "yt-dlp_linux" is only used so the
// flow can be exercised on a Linux development machine.
//
// Every network step (release lookup, checksum file, binary) is retried with
// backoff, and each attempt is logged for the diagnostics. The binary is
// written to "<name>.download", restarted from scratch on each attempt, and
// only renamed into place once its SHA-256 matches the release's
// SHA2-256SUMS: a half-written file is never treated as installed.

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');

const REPO = 'yt-dlp/yt-dlp';
const ASSETS = { darwin: 'yt-dlp_macos', linux: 'yt-dlp_linux' };
const OVERRIDE_ENV = 'FABTICE_YTDLP_PATH';
// Test seams: serve releases from a local server, shorten the waits.
const RELEASE_BASE_ENV = 'FABTICE_RELEASE_BASE';
const RETRY_DELAYS_ENV = 'FABTICE_RETRY_DELAYS_MS';

// 4 attempts: waits of 2 s, 5 s and 10 s between them (about 20 s in all).
const DEFAULT_RETRY_DELAYS_MS = [2000, 5000, 10000];
const SMALL_FILE_TIMEOUT_MS = 20000;
const DOWNLOAD_STALL_MS = 30000;
const MAX_LOG = 60;

class AttemptError extends Error {
  constructor(message, { retryable = true, httpStatus = null } = {}) {
    super(message);
    this.retryable = retryable;
    this.httpStatus = httpStatus;
  }
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(file)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')));
  });
}

function parseSums(text) {
  const sums = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([0-9a-f]{64})\s+\*?(\S+)$/i);
    if (m) sums.set(m[2], m[1].toLowerCase());
  }
  return sums;
}

function runVersion(binPath, timeoutMs = 120000) {
  // The first launch of a PyInstaller one-file binary unpacks itself and can be
  // slow on an older Intel Mac, hence the generous timeout.
  return new Promise((resolve) => {
    execFile(binPath, ['--version'], { timeout: timeoutMs, env: process.env }, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, error: `${err.message}${stderr ? `\n${stderr.trim()}` : ''}` });
      else resolve({ ok: true, version: stdout.trim() });
    });
  });
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return '?';
  }
}

function errorText(e) {
  if (!e) return 'erreur inconnue';
  if (e.name === 'TimeoutError') return `délai dépassé (${e.message})`;
  const cause = e.cause && e.cause.message && e.cause.message !== e.message ? ` (${e.cause.message})` : '';
  return `${e.message || String(e)}${cause}`;
}

function httpError(res, url) {
  const transient = res.status >= 500 || res.status === 408 || res.status === 429;
  return new AttemptError(`HTTP ${res.status} pour ${url}`, { retryable: transient, httpStatus: res.status });
}

function parseDelays(text) {
  if (!text) return null;
  const list = text.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n >= 0);
  return list.length ? list : null;
}

class YtDlpManager {
  constructor({ userDataDir, fetchImpl, platform = process.platform, env = process.env, retryDelaysMs, sleep }) {
    this.asset = ASSETS[platform] || null;
    this.platform = platform;
    this.dir = path.join(userDataDir, 'yt-dlp');
    this.binPath = this.asset ? path.join(this.dir, this.asset) : null;
    this.tmpPath = this.binPath ? `${this.binPath}.download` : null;
    this.metaPath = path.join(this.dir, 'installed.json');
    this.fetch = fetchImpl;
    this.overridePath = env[OVERRIDE_ENV] || null;
    const base = (env[RELEASE_BASE_ENV] || '').replace(/\/+$/, '');
    this.githubBase = base || 'https://github.com';
    this.apiBase = base ? `${base}/api` : 'https://api.github.com';
    this.retryDelaysMs = retryDelaysMs || parseDelays(env[RETRY_DELAYS_ENV]) || DEFAULT_RETRY_DELAYS_MS;
    this.sleep = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.attempts = [];
    this.busy = null;
  }

  // Network attempts of this session, oldest first, for the diagnostics.
  attemptLog() {
    return this.attempts.slice();
  }

  log(entry) {
    this.attempts.push(entry);
    if (this.attempts.length > MAX_LOG) this.attempts.splice(0, this.attempts.length - MAX_LOG);
  }

  // Runs fn(url) up to retryDelaysMs.length + 1 times. fn returns
  // { value, finalUrl } or throws; AttemptError.retryable === false stops early.
  async withRetries(op, url, fn) {
    const total = this.retryDelaysMs.length + 1;
    let lastError = null;
    for (let n = 1; n <= total; n++) {
      const started = Date.now();
      const entry = { at: new Date(started).toISOString(), op, host: hostOf(url), attempt: n, of: total };
      try {
        const { value, finalUrl } = await fn(url);
        this.log({ ...entry, ok: true, ms: Date.now() - started, finalHost: finalUrl ? hostOf(finalUrl) : null });
        return value;
      } catch (e) {
        lastError = e;
        const retryable = e.retryable !== false;
        this.log({ ...entry, ok: false, ms: Date.now() - started, error: errorText(e), httpStatus: e.httpStatus || null });
        if (!retryable || n === total) break;
        await this.sleep(this.retryDelaysMs[n - 1]);
      }
    }
    const err = new Error(errorText(lastError));
    err.attempts = this.attempts.filter((a) => a.op === op).length;
    throw err;
  }

  async status() {
    if (this.overridePath) {
      const v = await runVersion(this.overridePath, 30000);
      return {
        source: 'override',
        sourceLabel: `variable ${OVERRIDE_ENV}`,
        path: this.overridePath,
        installed: v.ok,
        version: v.ok ? v.version : null,
        error: v.ok ? null : v.error,
        sha256: null,
      };
    }
    if (!this.asset) {
      return { source: 'managed', installed: false, path: null, error: `plateforme non prise en charge : ${this.platform}` };
    }
    let meta = null;
    try {
      meta = JSON.parse(await fsp.readFile(this.metaPath, 'utf8'));
    } catch {
      meta = null;
    }
    let sha256 = null;
    try {
      sha256 = await sha256File(this.binPath);
    } catch {
      return { source: 'managed', sourceLabel: 'téléchargé par Fabtice', path: this.binPath, installed: false, version: null, sha256: null };
    }
    const intact = Boolean(meta && meta.sha256 === sha256);
    return {
      source: 'managed',
      sourceLabel: 'téléchargé par Fabtice',
      path: this.binPath,
      installed: true,
      version: meta ? meta.version : null,
      tag: meta ? meta.tag : null,
      sha256,
      intact,
      error: intact ? null : 'empreinte SHA-256 différente de celle enregistrée à l’installation',
    };
  }

  async fetchText(url) {
    const res = await this.fetch(url, { headers: { Accept: '*/*' }, signal: AbortSignal.timeout(SMALL_FILE_TIMEOUT_MS) });
    if (!res.ok) throw httpError(res, url);
    return { value: await res.text(), finalUrl: res.url || url };
  }

  // Latest release: the tag comes from the GitHub API when it answers (it is
  // rate-limited, so an HTTP refusal is not retried and only costs the label),
  // the checksum from the release's own SHA2-256SUMS file, which is what
  // decides whether an update is needed.
  async latest() {
    if (!this.asset) throw new Error('plateforme non prise en charge');
    let tag = null;
    try {
      tag = await this.withRetries('version', `${this.apiBase}/repos/${REPO}/releases/latest`, async (url) => {
        const res = await this.fetch(url, {
          headers: { Accept: 'application/vnd.github+json' },
          signal: AbortSignal.timeout(SMALL_FILE_TIMEOUT_MS),
        });
        if (!res.ok) throw httpError(res, url);
        return { value: (await res.json()).tag_name || null, finalUrl: res.url || url };
      });
    } catch {
      tag = null;
    }
    if (tag && !/^[0-9A-Za-z._-]{1,64}$/.test(tag)) tag = null;
    const base = tag
      ? `${this.githubBase}/${REPO}/releases/download/${tag}`
      : `${this.githubBase}/${REPO}/releases/latest/download`;
    const text = await this.withRetries('sommes', `${base}/SHA2-256SUMS`, (url) => this.fetchText(url));
    const sha256 = parseSums(text).get(this.asset);
    if (!sha256) throw new Error(`${this.asset} absent de SHA2-256SUMS`);
    return { tag, sha256, url: `${base}/${this.asset}`, sumsUrl: `${base}/SHA2-256SUMS` };
  }

  async checkForUpdate() {
    if (this.overridePath) return { skipped: true, reason: `variable ${OVERRIDE_ENV} définie` };
    const current = await this.status();
    try {
      const latest = await this.latest();
      return {
        skipped: false,
        latest,
        installed: current.installed,
        updateAvailable: current.installed && current.sha256 !== latest.sha256,
      };
    } catch (e) {
      return { skipped: false, installed: current.installed, intact: current.intact, error: e.message };
    }
  }

  install(onProgress = () => {}) {
    if (this.overridePath) return Promise.reject(new Error(`variable ${OVERRIDE_ENV} définie : rien à installer`));
    if (!this.busy) {
      this.busy = this._install(onProgress)
        .catch(async (e) => {
          await fsp.rm(this.tmpPath, { force: true });
          throw e;
        })
        .finally(() => { this.busy = null; });
    }
    return this.busy;
  }

  // One download attempt into tmpPath, from byte 0. Resolves with the SHA-256
  // and size; any network error, stall, short read or checksum mismatch throws
  // (retryable) after deleting the partial file.
  async downloadOnce(url, expectedSha, onProgress) {
    await fsp.rm(this.tmpPath, { force: true });
    const controller = new AbortController();
    let stallTimer = null;
    const armStall = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => controller.abort(new Error(`aucune donnée reçue depuis ${DOWNLOAD_STALL_MS / 1000} s`)), DOWNLOAD_STALL_MS);
    };
    const out = fs.createWriteStream(this.tmpPath, { mode: 0o700 });
    let writeError = null;
    out.on('error', (e) => { writeError = e; });
    let closing = null;
    const closeOut = () => {
      if (!closing) closing = new Promise((resolve) => { out.end(() => resolve()); });
      return closing;
    };
    const hash = crypto.createHash('sha256');
    let received = 0;
    try {
      armStall();
      const res = await this.fetch(url, { signal: controller.signal });
      if (!res.ok || !res.body) throw httpError(res, url);
      const total = Number(res.headers.get('content-length')) || null;
      onProgress({ phase: 'download', received: 0, total });
      const reader = res.body.getReader();
      let lastReport = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        armStall();
        hash.update(value);
        received += value.length;
        if (!out.write(value)) await new Promise((r) => out.once('drain', r));
        const now = Date.now();
        if (now - lastReport > 100) {
          lastReport = now;
          onProgress({ phase: 'download', received, total });
        }
      }
      clearTimeout(stallTimer);
      await closeOut();
      if (writeError) throw new AttemptError(`écriture impossible : ${writeError.message}`, { retryable: false });
      if (total && received !== total) throw new AttemptError(`téléchargement incomplet : ${received} octets sur ${total}`);
      onProgress({ phase: 'verify', received, total });
      const actual = hash.digest('hex');
      if (actual !== expectedSha) {
        throw new AttemptError(`empreinte SHA-256 incorrecte : attendu ${expectedSha}, obtenu ${actual} (${received} octets)`);
      }
      return { value: { sha256: actual, size: received }, finalUrl: res.url || url };
    } catch (e) {
      clearTimeout(stallTimer);
      await closeOut();
      await fsp.rm(this.tmpPath, { force: true });
      if (controller.signal.aborted && controller.signal.reason instanceof Error) {
        throw new AttemptError(controller.signal.reason.message);
      }
      throw e;
    }
  }

  async _install(onProgress) {
    const latest = await this.latest();
    await fsp.mkdir(this.dir, { recursive: true });
    onProgress({ phase: 'download', received: 0, total: null });
    const { sha256, size } = await this.withRetries('binaire', latest.url,
      (url) => this.downloadOnce(url, latest.sha256, onProgress));

    // Final gate: the file on disk must still hash to the published value.
    const onDisk = await sha256File(this.tmpPath);
    if (onDisk !== latest.sha256) throw new Error(`empreinte SHA-256 incorrecte sur le disque : ${onDisk}`);
    await fsp.chmod(this.tmpPath, 0o755);
    if (this.platform === 'darwin') {
      // Files written by this process are not normally quarantined; remove the
      // attribute anyway in case the app itself runs quarantined.
      await new Promise((r) => execFile('/usr/bin/xattr', ['-d', 'com.apple.quarantine', this.tmpPath], () => r()));
    }
    const v = await runVersion(this.tmpPath);
    if (!v.ok) throw new Error(`le binaire téléchargé ne démarre pas : ${v.error}`);
    await fsp.rename(this.tmpPath, this.binPath);
    const meta = {
      version: v.version,
      tag: latest.tag,
      sha256,
      size,
      url: latest.url,
      installedAt: new Date().toISOString(),
    };
    await fsp.writeFile(this.metaPath, JSON.stringify(meta, null, 2));
    onProgress({ phase: 'done', received: size, total: size });
    return meta;
  }

  // Path of the executable extraction should run, or null if none is usable.
  async executable() {
    if (this.overridePath) return this.overridePath;
    if (!this.binPath) return null;
    try {
      await fsp.access(this.binPath, fs.constants.X_OK);
      return this.binPath;
    } catch {
      return null;
    }
  }
}

module.exports = { YtDlpManager, parseSums, sha256File, OVERRIDE_ENV, DEFAULT_RETRY_DELAYS_MS };
