#!/usr/bin/env node
'use strict';

// Writes `fabtice-version.json`, the file the Mac app reads to know whether a newer version is published
// (C16; format in src/update-version.js and desktop/README.md, « Mise à jour automatique »).
//
//   node ci/make-version-file.js <version> <tag> <apple-silicon.zip> <intel.zip> <CHANGELOG.md> <output.json>
//
//   version    the number of the version, « 1.0.1 » (three numbers)
//   tag        the tag of the GitHub release, which must be « v<version> »: the downloads are
//              https://github.com/pelikast/fabtice/releases/download/<tag>/<archive name>
//   zips       the two archives as they are uploaded (Fabtice-mac-apple-silicon.zip, Fabtice-mac-intel.zip):
//              their size and SHA-256 are computed here
//   CHANGELOG  its first « ## » section (without its title line) becomes the notes
//   output     where the file is written
//
// No dependency. The file written is read back with the app's own reader before the script ends: a file the
// app could not read is never published.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { readVersionFile, parseVersion, FORMAT, MAX_NOTES, ARCHIVE_NAMES } = require('../src/update-version');

const REPO = 'https://github.com/pelikast/fabtice';
const NOTES_LIMIT = MAX_NOTES - 4096;

/** The body of the first « ## » section of a changelog (Markdown), trimmed and bounded. */
function firstSection(markdown) {
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex((l) => /^## /.test(l));
  if (start < 0) return '';
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  let text = lines.slice(start + 1, end).join('\n').trim();
  if (text.length > NOTES_LIMIT) {
    const cut = text.lastIndexOf('\n', NOTES_LIMIT);
    text = `${text.slice(0, cut > 0 ? cut : NOTES_LIMIT).trimEnd()}\n\n…`;
  }
  return text;
}

function sha256(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(1 << 20);
    for (;;) {
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      if (n === 0) break;
      hash.update(buf.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

/**
 * @param {{ version: string, tag: string, zips: { arm64: string, x64: string }, changelog: string, minimumSystemVersion?: string, publishedAt?: string }} input
 * @returns {object} the content of the version file
 */
function makeVersionFile(input) {
  if (!parseVersion(input.version)) throw new Error(`not a version: ${input.version}`);
  if (input.tag !== `v${input.version}`) throw new Error(`the tag must be v${input.version}, not ${input.tag}`);
  const minimum = input.minimumSystemVersion ?? JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).build.mac.minimumSystemVersion;
  const downloads = {};
  for (const arch of Object.keys(ARCHIVE_NAMES)) {
    const file = input.zips[arch];
    const name = ARCHIVE_NAMES[arch];
    if (path.basename(file) !== name) throw new Error(`the ${arch} archive must be named ${name}, not ${path.basename(file)}`);
    downloads[arch] = { name, url: `${REPO}/releases/download/${input.tag}/${name}`, sha256: sha256(file), size: fs.statSync(file).size };
  }
  const data = {
    format: FORMAT,
    version: input.version,
    publishedAt: input.publishedAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    notes: firstSection(fs.readFileSync(input.changelog, 'utf8')),
    page: `${REPO}/releases/tag/${input.tag}`,
    minimumSystemVersion: minimum,
    downloads,
  };
  const check = readVersionFile(JSON.stringify(data));
  if (!check.ok) throw new Error(`the app would not read this file (${check.reason})`);
  return data;
}

function main(argv) {
  if (argv.length !== 6) {
    process.stderr.write('usage: make-version-file.js <version> <tag> <apple-silicon.zip> <intel.zip> <CHANGELOG.md> <output.json>\n');
    return 2;
  }
  const [version, tag, arm64, x64, changelog, output] = argv;
  try {
    const data = makeVersionFile({ version, tag, zips: { arm64, x64 }, changelog });
    fs.writeFileSync(output, `${JSON.stringify(data, null, 2)}\n`);
    process.stdout.write(`${output}: ${data.version}, notes ${data.notes.length} characters, ${Object.values(data.downloads).map((d) => `${d.name} ${d.size} ${d.sha256}`).join(', ')}\n`);
    return 0;
  } catch (e) {
    process.stderr.write(`make-version-file: ${e.message}\n`);
    return 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { makeVersionFile, firstSection, main };
