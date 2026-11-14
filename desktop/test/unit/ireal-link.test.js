'use strict';

// « Ouvrir dans iReal Pro » hands a link to shell.openExternal, which can start
// any program the system knows for a scheme: only an irealb:// chart link of a
// bounded length gets through.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateIRealLink, MAX_LENGTH } = require('../../src/ireal-link');

const song = (s) => `irealb://${encodeURIComponent(s)}`;

test('accepts the links the app writes: encodeURIComponent of a song', () => {
  const links = [
    song('Blues du dimanche=Unknown==Medium Swing=Ab==1r34LbKcu7[T44C^7XyQ|D-7 G7LZ=Jazz-Medium Swing=110=0'),
    song("Café = Été \"Live\" <b>&amp;</b> 100% ♭ — ç/é=x==y=C==z=w=0=0"),
    'irealb://a',
    'irealb://Title%3Dcomposer%3D%3Dstyle%3DC%3D%3Dmusic%3D%3D120%3D0',
    // What iReal Pro's own pages and files contain: raw `=`, `(`, `)`, `*`, `'`, `/`.
    "irealb://Don't%20Go=Muddy%20Waters%20(Joe)==Blues=Bb==1r34LbKcu7*A/%7B",
  ];
  for (const link of links) assert.deepEqual(validateIRealLink(link), { ok: true, url: link }, link);
});

test('accepts a link up to the bound and refuses one byte more', () => {
  const longest = `irealb://${'a'.repeat(MAX_LENGTH - 'irealb://'.length)}`;
  assert.equal(longest.length, MAX_LENGTH);
  assert.equal(validateIRealLink(longest).ok, true);
  assert.equal(validateIRealLink(`${longest}a`).ok, false);
  assert.equal(MAX_LENGTH, 200_000);
});

test('refuses everything that is not an irealb:// link', () => {
  const refused = [
    undefined,
    null,
    42,
    {},
    ['irealb://a'],
    '',
    'irealb://',
    'irealb:',
    'irealb:/a',
    'IREALB://a',
    ' irealb://a',
    'irealb://a ',
    'irealbook://a=b=c=C=n=d',
    'https://example.org/',
    'http://irealb://a',
    'file:///Applications/Calculator.app',
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    'x-man-page://ls',
    'ssh://host',
    'smb://host/share',
    'vscode://file/etc/passwd',
    'mailto:a@b.c',
    'irealb://a b',
    'irealb://a\nb',
    'irealb://a\tb',
    'irealb://a\u0000b',
    'irealb://a\u007fb',
    'irealb://a\\b',
    'irealb://a"b',
    'irealb://a<b>',
    'irealb://a#b',
    'irealb://a?b',
    'irealb://a&b',
    'irealb://a@b',
    'irealb://user:pass@host',
    'irealb://host:80/path',
    'irealb://a|b',
    'irealb://a;b',
    'irealb://é',
    'irealb://a%',
    'irealb://a%2',
    'irealb://a%zz',
    'irealb://a%2g',
    `irealb://${'a'.repeat(MAX_LENGTH)}`,
  ];
  for (const link of refused) {
    const out = validateIRealLink(link);
    assert.equal(out.ok, false, String(link).slice(0, 60));
    assert.equal(out.reason, 'invalid');
  }
});

test('what it returns is exactly what it was given', () => {
  const link = song('x=y');
  assert.equal(validateIRealLink(link).url, link);
});

test('the bound is the one the app writes', () => {
  const ts = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'app', 'src', 'export', 'ireal.ts'), 'utf8');
  assert.match(ts, new RegExp(`IREAL_URL_MAX_LENGTH = ${String(MAX_LENGTH).replace(/(\d)(?=(\d{3})+$)/g, '$1_')};`));
});

test('main.js answers through the validation and the preload exposes one method for it', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'preload.js'), 'utf8');
  assert.match(main, /validateIRealLink\(link\)/);
  assert.match(main, /shell\.openExternal\(checked\.url\)/);
  assert.equal((main.match(/shell\.openExternal\(/g) || []).length, 1, 'shell.openExternal is called from one place only');
  assert.match(preload, /openInIRealPro: \(link\) => ipcRenderer\.invoke\('fabtice:open-ireal', String\(link\)\)/);
  // The existing protections stay: no navigation, no new windows.
  assert.match(main, /contents\.on\('will-navigate', \(event\) => event\.preventDefault\(\)\)/);
  assert.match(main, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
});
