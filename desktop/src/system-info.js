'use strict';

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { app } = require('electron');

// yt-dlp needs a JavaScript runtime to solve YouTube's player challenges. The
// lightest one available is the app itself: Electron's executable behaves as
// plain Node.js when ELECTRON_RUN_AS_NODE=1 (the RunAsNode fuse is left at its
// default, enabled). yt-dlp's "node" provider runs `<path> --version`, then
// `<path> --permission -` with the solver script on stdin; it inherits our
// environment, so the variable reaches both calls. Without it, the executable
// would start a second copy of the app instead.
function jsRuntime() {
  return {
    name: 'node',
    path: process.execPath,
    env: { ELECTRON_RUN_AS_NODE: '1' },
  };
}

function probeJsRuntime(runtime) {
  return new Promise((resolve) => {
    const started = Date.now();
    execFile(runtime.path, ['--version'], { env: { ...process.env, ...runtime.env }, timeout: 20000 }, (err, stdout, stderr) => {
      resolve({
        ok: !err && /^v\d+\.\d+\.\d+/.test(stdout.trim()),
        version: stdout.trim() || null,
        stderr: stderr.trim() || null,
        error: err ? err.message : null,
        durationMs: Date.now() - started,
      });
    });
  });
}

function buildInfo() {
  try {
    return JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'build-info.json'), 'utf8'));
  } catch {
    return null;
  }
}

async function collectSystemInfo() {
  const cpus = os.cpus();
  const runtime = jsRuntime();
  const probe = await probeJsRuntime(runtime);
  return {
    appVersion: app.getVersion(),
    build: buildInfo(),
    packaged: app.isPackaged,
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      v8: process.versions.v8,
    },
    platform: process.platform,
    osVersion: process.getSystemVersion(),
    osRelease: os.release(),
    arch: process.arch,
    cpuModel: cpus.length ? cpus[0].model : null,
    cpuCount: cpus.length,
    memoryGb: Math.round((os.totalmem() / 2 ** 30) * 10) / 10,
    // true when an x64 process runs on Apple Silicon through Rosetta 2.
    rosetta: process.platform === 'darwin' ? app.runningUnderARM64Translation : null,
    execPath: process.execPath,
    userData: app.getPath('userData'),
    jsRuntime: { ...runtime, probe },
  };
}

module.exports = { collectSystemInfo, jsRuntime };
