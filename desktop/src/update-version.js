'use strict';

// The version file of the automatic update (C16), `fabtice-version.json`, a release asset read at
// https://github.com/pelikast/fabtice/releases/latest/download/fabtice-version.json
//
//   {
//     "format": 1,
//     "version": "1.0.1",
//     "publishedAt": "2026-12-01T10:00:00Z",
//     "notes": "the first section of CHANGELOG.md (Markdown, French)",
//     "page": "https://github.com/pelikast/fabtice/releases/tag/v1.0.1",
//     "minimumSystemVersion": "12.0",
//     "downloads": {
//       "arm64": { "name": "Fabtice-mac-apple-silicon.zip", "url": "https://github.com/pelikast/fabtice/releases/download/v1.0.1/Fabtice-mac-apple-silicon.zip", "sha256": "<64 hex>", "size": 123456789 },
//       "x64":   { "name": "Fabtice-mac-intel.zip", "url": "…/Fabtice-mac-intel.zip", "sha256": "<64 hex>", "size": 123456789 }
//     }
//   }
//
// It is made by `desktop/ci/make-version-file.js` (the build) and read here, strictly: an unknown
// `format`, a missing or ill-typed field, a value out of its bounds, an address outside the project's
// releases on GitHub, and the whole file is « not readable » (the app then says so on a manual search,
// and nothing at all at opening). A later format is published under the same name only if this reader
// still reads it; otherwise a new file name, so that the versions already installed keep working.
//
// Versions are three numbers `a.b.c`, compared as numbers. An update is offered only for a version
// strictly newer than the running one: never the same, never an older one.

const FORMAT = 1;
const MAX_NOTES = 64 * 1024;
const MAX_ARCHIVE_BYTES = 2 * 1024 ** 3;
const MIN_ARCHIVE_BYTES = 1024 * 1024;
const REPO_PATH = '/pelikast/fabtice/';
const ARCHIVE_NAMES = { arm64: 'Fabtice-mac-apple-silicon.zip', x64: 'Fabtice-mac-intel.zip' };

/** `"1.2.3"` → `[1, 2, 3]`, or null when it is not three plain numbers (no « v », no suffix, no leading zero). */
function parseVersion(value) {
  if (typeof value !== 'string' || value.length > 32) return null;
  const m = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.exec(value);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** -1, 0 or 1 as `a` is older than, the same as, or newer than `b`. Throws on a value that is not a version. */
function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) throw new Error(`not a version: ${!x ? a : b}`);
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

/** True only when `candidate` is strictly newer than `current` (both valid versions). */
function isNewer(candidate, current) {
  try {
    return compareVersions(candidate, current) > 0;
  } catch {
    return false;
  }
}

/** A macOS version such as « 12.0 » or « 13.6.1 » as numbers, or null. */
function parseSystemVersion(value) {
  if (typeof value !== 'string' || !/^\d{1,3}(\.\d{1,3}){0,2}$/.test(value)) return null;
  const parts = value.split('.').map(Number);
  while (parts.length < 3) parts.push(0);
  return parts;
}

/** True when the system `running` is at least `minimum` (both « 12.0 »-like); false when either cannot be read. */
function systemAtLeast(running, minimum) {
  const r = parseSystemVersion(running);
  const m = parseSystemVersion(minimum);
  if (!r || !m) return false;
  for (let i = 0; i < 3; i++) {
    if (r[i] !== m[i]) return r[i] > m[i];
  }
  return true;
}

/** An address of the project's own releases on GitHub: `https://github.com/pelikast/fabtice/releases/…`, nothing else. */
function isReleaseAddress(value, kind) {
  if (typeof value !== 'string' || value.length > 500) return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) return false;
  // GitHub does not mind the case of the owner and the repository (the repository is « Pelikast/Fabtice »).
  const p = url.pathname;
  if (!p.toLowerCase().startsWith(REPO_PATH)) return false;
  const rest = p.slice(REPO_PATH.length);
  if (kind === 'page') return /^releases(\/tag\/v\d{1,6}\.\d{1,6}\.\d{1,6})?\/?$/.test(rest);
  return /^releases\/download\/v\d{1,6}\.\d{1,6}\.\d{1,6}\/[A-Za-z0-9._-]{1,100}$/.test(rest);
}

function readDownload(value, arch, version) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { name, url, sha256, size } = value;
  if (name !== ARCHIVE_NAMES[arch]) return null;
  if (!isReleaseAddress(url, 'download')) return null;
  // The archive of this version, under its own name: `…/releases/download/v<version>/<name>`.
  if (!new URL(url).pathname.endsWith(`/releases/download/v${version}/${name}`)) return null;
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) return null;
  if (!Number.isSafeInteger(size) || size < MIN_ARCHIVE_BYTES || size > MAX_ARCHIVE_BYTES) return null;
  return { name, url, sha256, size };
}

/**
 * Reads the text of a version file. Answers `{ ok: true, info }` or `{ ok: false, reason }`, where reason is
 * `json` (not JSON), `format` (a format this version does not know) or `field:<name>` (missing, ill-typed or
 * out of bounds). Never throws.
 * @param {string} text
 */
function readVersionFile(text) {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_NOTES + 8192) return { ok: false, reason: 'json' };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'json' };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, reason: 'json' };
  if (data.format !== FORMAT) return { ok: false, reason: 'format' };
  const fail = (name) => ({ ok: false, reason: `field:${name}` });
  if (!parseVersion(data.version)) return fail('version');
  const version = data.version;
  if (typeof data.publishedAt !== 'string' || data.publishedAt.length > 40 || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?Z$/.test(data.publishedAt) || Number.isNaN(Date.parse(data.publishedAt))) return fail('publishedAt');
  if (typeof data.notes !== 'string' || data.notes.length > MAX_NOTES) return fail('notes');
  if (!isReleaseAddress(data.page, 'page')) return fail('page');
  if (!parseSystemVersion(data.minimumSystemVersion)) return fail('minimumSystemVersion');
  if (!data.downloads || typeof data.downloads !== 'object' || Array.isArray(data.downloads)) return fail('downloads');
  const downloads = {};
  for (const arch of Object.keys(ARCHIVE_NAMES)) {
    const d = readDownload(data.downloads[arch], arch, version);
    if (!d) return fail(`downloads.${arch}`);
    downloads[arch] = d;
  }
  return {
    ok: true,
    info: {
      version,
      publishedAt: data.publishedAt,
      notes: data.notes.replace(/\r\n?/g, '\n').trim(),
      page: data.page,
      minimumSystemVersion: data.minimumSystemVersion,
      downloads,
    },
  };
}

module.exports = {
  FORMAT,
  MAX_NOTES,
  ARCHIVE_NAMES,
  parseVersion,
  compareVersions,
  isNewer,
  systemAtLeast,
  isReleaseAddress,
  readVersionFile,
};
