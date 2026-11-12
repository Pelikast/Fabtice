'use strict';

// Downloads, verifies and updates the official yt-dlp standalone executable.
// It is never shipped inside the app bundle: it lives in the user-data folder.
//
// Asset choice (yt-dlp README, release 2026.10.26): "yt-dlp_macos — Universal
// MacOS (10.15+) standalone executable (recommended for MacOS)". One file runs
// natively on both Intel and Apple Silicon. "yt-dlp_linux" is only used so the
// flow can be exercised on a Linux development machine.

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');

const REPO = 'yt-dlp/yt-dlp';
const ASSETS = { darwin: 'yt-dlp_macos', linux: 'yt-dlp_linux' };
const OVERRIDE_ENV = 'FABTICE_YTDLP_PATH';

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

class YtDlpManager {
  constructor({ userDataDir, fetchImpl, platform = process.platform, env = process.env }) {
    this.asset = ASSETS[platform] || null;
    this.platform = platform;
    this.dir = path.join(userDataDir, 'yt-dlp');
    this.binPath = this.asset ? path.join(this.dir, this.asset) : null;
    this.metaPath = path.join(this.dir, 'installed.json');
    this.fetch = fetchImpl;
    this.overridePath = env[OVERRIDE_ENV] || null;
    this.busy = null;
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
    const intact = meta && meta.sha256 === sha256;
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
    const res = await this.fetch(url, { headers: { Accept: '*/*' }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
    return res.text();
  }

  // Latest release: the tag comes from the GitHub API when it answers (it is
  // rate-limited), the checksum from the release's own SHA2-256SUMS file, which
  // is what decides whether an update is needed.
  async latest() {
    if (!this.asset) throw new Error('plateforme non prise en charge');
    let tag = null;
    try {
      const res = await this.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) tag = (await res.json()).tag_name || null;
    } catch {
      tag = null;
    }
    if (tag && !/^[0-9A-Za-z._-]{1,64}$/.test(tag)) tag = null;
    const base = tag
      ? `https://github.com/${REPO}/releases/download/${tag}`
      : `https://github.com/${REPO}/releases/latest/download`;
    const sums = parseSums(await this.fetchText(`${base}/SHA2-256SUMS`));
    const sha256 = sums.get(this.asset);
    if (!sha256) throw new Error(`${this.asset} absent de SHA2-256SUMS`);
    return { tag, sha256, url: `${base}/${this.asset}`, sumsUrl: `${base}/SHA2-256SUMS` };
  }

  async checkForUpdate() {
    if (this.overridePath) return { skipped: true, reason: `variable ${OVERRIDE_ENV} définie` };
    const [current, latest] = await Promise.all([this.status(), this.latest()]);
    return {
      skipped: false,
      latest,
      installed: current.installed,
      updateAvailable: current.installed && current.sha256 !== latest.sha256,
    };
  }

  install(onProgress = () => {}) {
    if (this.overridePath) return Promise.reject(new Error(`variable ${OVERRIDE_ENV} définie : rien à installer`));
    if (!this.busy) this.busy = this._install(onProgress).finally(() => { this.busy = null; });
    return this.busy;
  }

  async _install(onProgress) {
    const latest = await this.latest();
    await fsp.mkdir(this.dir, { recursive: true });
    const tmp = `${this.binPath}.download`;
    await fsp.rm(tmp, { force: true });

    onProgress({ phase: 'download', received: 0, total: null });
    const res = await this.fetch(latest.url);
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} pour ${latest.url}`);
    const total = Number(res.headers.get('content-length')) || null;
    const hash = crypto.createHash('sha256');
    const out = fs.createWriteStream(tmp, { mode: 0o700 });
    let received = 0;
    let lastReport = 0;
    try {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        hash.update(value);
        received += value.length;
        if (!out.write(value)) await new Promise((r) => out.once('drain', r));
        const now = Date.now();
        if (now - lastReport > 100) {
          lastReport = now;
          onProgress({ phase: 'download', received, total });
        }
      }
    } finally {
      await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
    }
    onProgress({ phase: 'verify', received, total });

    const actual = hash.digest('hex');
    if (actual !== latest.sha256) {
      await fsp.rm(tmp, { force: true });
      throw new Error(`empreinte SHA-256 incorrecte : attendu ${latest.sha256}, obtenu ${actual}`);
    }
    await fsp.chmod(tmp, 0o755);
    if (this.platform === 'darwin') {
      // Files written by this process are not normally quarantined; remove the
      // attribute anyway in case the app itself runs quarantined.
      await new Promise((r) => execFile('/usr/bin/xattr', ['-d', 'com.apple.quarantine', tmp], () => r()));
    }
    const v = await runVersion(tmp);
    if (!v.ok) {
      await fsp.rm(tmp, { force: true });
      throw new Error(`le binaire téléchargé ne démarre pas : ${v.error}`);
    }
    await fsp.rename(tmp, this.binPath);
    const meta = {
      version: v.version,
      tag: latest.tag,
      sha256: actual,
      size: received,
      url: latest.url,
      installedAt: new Date().toISOString(),
    };
    await fsp.writeFile(this.metaPath, JSON.stringify(meta, null, 2));
    onProgress({ phase: 'done', received, total });
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

module.exports = { YtDlpManager, parseSums, sha256File, OVERRIDE_ENV };
