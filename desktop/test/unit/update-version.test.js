'use strict';

// The version file of the automatic update (C16): numbers compared as numbers, never the same version or an
// older one; the reader strict on every field; the file made by ci/make-version-file.js read back by it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseVersion, compareVersions, isNewer, systemAtLeast, isReleaseAddress, readVersionFile, MAX_NOTES } = require('../../src/update-version');
const { makeVersionFile, firstSection, main } = require('../../ci/make-version-file');

const HEX = 'a'.repeat(64);
const good = (patch = {}) => ({
  format: 1,
  version: '1.0.1',
  publishedAt: '2026-12-01T10:00:00Z',
  notes: '### Nouveautés\n- Une chose.',
  page: 'https://github.com/pelikast/fabtice/releases/tag/v1.0.1',
  minimumSystemVersion: '12.0',
  downloads: {
    arm64: { name: 'Fabtice-mac-apple-silicon.zip', url: 'https://github.com/pelikast/fabtice/releases/download/v1.0.1/Fabtice-mac-apple-silicon.zip', sha256: HEX, size: 123456789 },
    x64: { name: 'Fabtice-mac-intel.zip', url: 'https://github.com/pelikast/fabtice/releases/download/v1.0.1/Fabtice-mac-intel.zip', sha256: 'b'.repeat(64), size: 123456780 },
  },
  ...patch,
});
const read = (data) => readVersionFile(typeof data === 'string' ? data : JSON.stringify(data));

test('versions are three numbers, compared as numbers', () => {
  assert.deepEqual(parseVersion('1.0.0'), [1, 0, 0]);
  assert.deepEqual(parseVersion('10.20.300'), [10, 20, 300]);
  for (const bad of ['v1.0.0', '1.0', '1.0.0.0', '1.0.0-beta', '01.0.0', '1.0.0 ', '', null, 1, '1..0', '1.0.x', '9999999.0.0']) assert.equal(parseVersion(bad), null, String(bad));
  assert.equal(compareVersions('1.0.10', '1.0.9'), 1, 'not compared as text');
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('2.0.0', '10.0.0'), -1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.throws(() => compareVersions('1.0', '1.0.0'));
});

test('an update is only a strictly newer version: never the same, never an older one', () => {
  assert.equal(isNewer('1.0.1', '1.0.0'), true);
  assert.equal(isNewer('1.1.0', '1.0.9'), true);
  assert.equal(isNewer('1.0.0', '1.0.0'), false, 'the same version');
  assert.equal(isNewer('0.9.9', '1.0.0'), false, 'a downgrade');
  assert.equal(isNewer('1.0.9', '1.0.10'), false);
  assert.equal(isNewer('garbage', '1.0.0'), false);
  assert.equal(isNewer('1.0.1', 'garbage'), false);
});

test('the system version: macOS 12 minimum', () => {
  assert.equal(systemAtLeast('12.0', '12.0'), true);
  assert.equal(systemAtLeast('12.7.6', '12.0'), true);
  assert.equal(systemAtLeast('15.1', '12.0'), true);
  assert.equal(systemAtLeast('11.7', '12.0'), false);
  assert.equal(systemAtLeast('13.0', '13.0.1'), false);
  assert.equal(systemAtLeast('', '12.0'), false);
});

test('addresses: the project releases on github.com only', () => {
  assert.equal(isReleaseAddress('https://github.com/pelikast/fabtice/releases/tag/v1.0.1', 'page'), true);
  assert.equal(isReleaseAddress('https://github.com/Pelikast/Fabtice/releases/tag/v1.0.1', 'page'), true, 'GitHub ignores the case');
  assert.equal(isReleaseAddress('https://github.com/pelikast/fabtice/releases', 'page'), true);
  assert.equal(isReleaseAddress('https://github.com/pelikast/fabtice/releases/download/v1.0.1/Fabtice-mac-intel.zip', 'download'), true);
  for (const bad of [
    'http://github.com/pelikast/fabtice/releases/tag/v1.0.1',
    'https://github.com.evil.example/pelikast/fabtice/releases/tag/v1.0.1',
    'https://evil.example/pelikast/fabtice/releases/tag/v1.0.1',
    'https://github.com/someone/fabtice/releases/tag/v1.0.1',
    'https://github.com/pelikast/fabtice-fork/releases/tag/v1.0.1',
    'https://github.com/pelikast/fabtice/releases/tag/v1.0.1?x=1',
    'https://github.com/pelikast/fabtice/releases/tag/v1.0.1#top',
    'https://user@github.com/pelikast/fabtice/releases/tag/v1.0.1',
    'https://github.com:444/pelikast/fabtice/releases/tag/v1.0.1',
    'https://github.com/pelikast/fabtice/issues',
    'javascript:alert(1)',
  ]) assert.equal(isReleaseAddress(bad, 'page'), false, bad);
  assert.equal(isReleaseAddress('https://github.com/pelikast/fabtice/releases/download/v1.0.1/../../x', 'download'), false);
  assert.equal(isReleaseAddress('https://objects.githubusercontent.com/pelikast/fabtice/releases/download/v1.0.1/a.zip', 'download'), false, 'the first address is github.com; the storage host only comes as a redirect');
});

test('the reader: a good file', () => {
  const r = read(good({ notes: 'Ligne\r\nautre\r\n' }));
  assert.equal(r.ok, true);
  assert.equal(r.info.version, '1.0.1');
  assert.equal(r.info.notes, 'Ligne\nautre');
  assert.equal(r.info.downloads.arm64.size, 123456789);
  assert.equal(r.info.downloads.x64.name, 'Fabtice-mac-intel.zip');
  // Unknown extra fields are no trouble (a later format 1 may add some).
  assert.equal(read({ ...good(), extra: { anything: true } }).ok, true);
});

test('the reader is strict: unknown format, missing, ill-typed or out-of-bound fields', () => {
  assert.deepEqual(read('not json'), { ok: false, reason: 'json' });
  assert.deepEqual(read('[]'), { ok: false, reason: 'json' });
  assert.deepEqual(read(''), { ok: false, reason: 'json' });
  assert.deepEqual(read(good({ format: 2 })), { ok: false, reason: 'format' });
  assert.deepEqual(read(good({ format: '1' })), { ok: false, reason: 'format' });
  const { format, ...noFormat } = good();
  assert.deepEqual(read(noFormat), { ok: false, reason: 'format' });
  const cases = [
    [{ version: 'v1.0.1' }, 'version'],
    [{ version: 101 }, 'version'],
    [{ publishedAt: 'yesterday' }, 'publishedAt'],
    [{ publishedAt: '2026-13-45T99:00:00Z' }, 'publishedAt'],
    [{ notes: 42 }, 'notes'],
    [{ notes: 'x'.repeat(MAX_NOTES + 1) }, 'notes'],
    [{ page: 'https://evil.example/' }, 'page'],
    [{ minimumSystemVersion: 'Monterey' }, 'minimumSystemVersion'],
    [{ downloads: null }, 'downloads'],
    [{ downloads: [] }, 'downloads'],
  ];
  for (const [patch, field] of cases) assert.deepEqual(read(good(patch)), { ok: false, reason: `field:${field}` }, JSON.stringify(patch).slice(0, 80));
  const dl = (arch, patch) => {
    const d = good();
    d.downloads[arch] = patch === null ? undefined : { ...d.downloads[arch], ...patch };
    return d;
  };
  for (const [arch, patch] of [
    ['arm64', null],
    ['x64', null],
    ['arm64', { name: 'Fabtice-mac-intel.zip' }],
    ['arm64', { sha256: 'A'.repeat(64) }],
    ['arm64', { sha256: 'a'.repeat(63) }],
    ['arm64', { size: -1 }],
    ['arm64', { size: 12.5 }],
    ['arm64', { size: '123456789' }],
    ['arm64', { size: 3 * 1024 ** 3 }],
    ['arm64', { size: 10 }],
    ['arm64', { url: 'https://evil.example/Fabtice-mac-apple-silicon.zip' }],
    ['arm64', { url: 'http://github.com/pelikast/fabtice/releases/download/v1.0.1/Fabtice-mac-apple-silicon.zip' }],
    // An archive of another version under this version's number.
    ['arm64', { url: 'https://github.com/pelikast/fabtice/releases/download/v1.0.0/Fabtice-mac-apple-silicon.zip' }],
    ['x64', { url: 'https://github.com/pelikast/fabtice/releases/download/v1.0.1/Fabtice-mac-apple-silicon.zip' }],
  ]) assert.deepEqual(read(dl(arch, patch)), { ok: false, reason: `field:downloads.${arch}` }, `${arch} ${JSON.stringify(patch)}`);
});

test('make-version-file: sizes and SHA-256 of the two archives, the first section of the changelog, read back by the app', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-version-file-')));
  try {
    const arm = path.join(dir, 'Fabtice-mac-apple-silicon.zip');
    const intel = path.join(dir, 'Fabtice-mac-intel.zip');
    fs.writeFileSync(arm, Buffer.alloc(1_200_000, 1));
    fs.writeFileSync(intel, Buffer.alloc(1_300_000, 2));
    const changelog = path.join(dir, 'CHANGELOG.md');
    fs.writeFileSync(changelog, '# Nouveautés de Fabtice\n\nIntro.\n\n## Version 1.0.1\n\n### Mieux\n- Une chose.\n- Une autre.\n\n## Version 1.0.0\n\n- Ancien.\n');
    const data = makeVersionFile({ version: '1.0.1', tag: 'v1.0.1', zips: { arm64: arm, x64: intel }, changelog, publishedAt: '2026-12-01T10:00:00Z' });
    assert.equal(data.notes, '### Mieux\n- Une chose.\n- Une autre.');
    assert.equal(data.minimumSystemVersion, '12.0', 'from desktop/package.json');
    assert.equal(data.page, 'https://github.com/pelikast/fabtice/releases/tag/v1.0.1');
    assert.equal(data.downloads.arm64.size, 1_200_000);
    assert.equal(data.downloads.arm64.sha256, require('node:crypto').createHash('sha256').update(Buffer.alloc(1_200_000, 1)).digest('hex'));
    assert.equal(data.downloads.x64.url, 'https://github.com/pelikast/fabtice/releases/download/v1.0.1/Fabtice-mac-intel.zip');
    assert.equal(read(data).ok, true);
    // The command line, as the build calls it.
    const out = path.join(dir, 'fabtice-version.json');
    const log = [];
    const write = process.stdout.write;
    process.stdout.write = (s) => log.push(s);
    let code;
    try {
      code = main(['1.0.1', 'v1.0.1', arm, intel, changelog, out]);
    } finally {
      process.stdout.write = write;
    }
    assert.equal(code, 0);
    assert.equal(read(fs.readFileSync(out, 'utf8')).ok, true);
    // Mistakes are refused: a tag that is not the version, archives under other names.
    assert.throws(() => makeVersionFile({ version: '1.0.1', tag: '1.0.1', zips: { arm64: arm, x64: intel }, changelog }), /tag/);
    assert.throws(() => makeVersionFile({ version: '1.0.1', tag: 'v1.0.1', zips: { arm64: intel, x64: arm }, changelog }), /named/);
    assert.throws(() => makeVersionFile({ version: 'v1.0.1', tag: 'v1.0.1', zips: { arm64: arm, x64: intel }, changelog }), /version/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the first section of a changelog, long ones cut at a line', () => {
  assert.equal(firstSection('# T\n\n## A\n\nun\n\n## B\ndeux'), 'un');
  assert.equal(firstSection('rien'), '');
  const long = firstSection(`## A\n${'ligne de nouveautés\n'.repeat(5000)}`);
  assert.ok(long.length < MAX_NOTES && long.endsWith('…'));
  // The real changelog of the repository makes a valid file.
  const real = firstSection(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'CHANGELOG.md'), 'utf8'));
  assert.ok(real.length > 100 && real.length < MAX_NOTES);
});
