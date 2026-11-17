'use strict';

// Fake apps and archives for the tests of the automatic update (unit and end-to-end): a `Fabtice.app`
// folder with an XML Info.plist and an « executable » that starts like a Mach-O file of the chip asked,
// and a plain zip writer (stored entries) with no dependency.

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const CPU = { x64: 0x01000007, arm64: 0x0100000c };

function plist({ id = 'org.fabtice.desktop', version = '1.0.0', exe = 'Fabtice' } = {}) {
  // Nested dictionaries first, with keys of the same names, as a real one may have (the reader keeps the top level).
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDocumentTypes</key>
  <array>
    <dict>
      <key>CFBundleIdentifier</key>
      <string>not.this.one</string>
      <key>CFBundleTypeExtensions</key>
      <array><string>fab</string></array>
    </dict>
  </array>
  <key>CFBundleExecutable</key>
  <string>${exe}</string>
  <key>CFBundleIdentifier</key>
  <string>${id}</string>
  <key>LSRequiresNativeExecution</key>
  <true/>
  <key>CFBundleShortVersionString</key>
  <string>${version}</string>
  <key>NSHumanReadableCopyright</key>
  <string>Fabtice &amp; co</string>
</dict>
</plist>
`;
}

/** A Mach-O-looking header: thin (one chip) or fat (several). */
function machO(archs) {
  if (archs.length === 1) {
    const b = Buffer.alloc(64);
    b.writeUInt32LE(0xfeedfacf, 0);
    b.writeInt32LE(CPU[archs[0]] ?? 0x12, 4);
    return b;
  }
  const b = Buffer.alloc(8 + archs.length * 20 + 16);
  b.writeUInt32BE(0xcafebabe, 0);
  b.writeUInt32BE(archs.length, 4);
  archs.forEach((a, i) => b.writeInt32BE(CPU[a], 8 + i * 20));
  return b;
}

/**
 * A fake app bundle at `bundle` (made fresh). `marker` is written inside, to tell the copies apart.
 * @param {string} bundle
 * @param {{ id?: string, version?: string, archs?: string[], exe?: string, executable?: boolean, marker?: string }} [o]
 */
function fakeApp(bundle, o = {}) {
  const exe = o.exe ?? 'Fabtice';
  fs.mkdirSync(path.join(bundle, 'Contents', 'MacOS'), { recursive: true });
  fs.mkdirSync(path.join(bundle, 'Contents', 'Resources'), { recursive: true });
  fs.writeFileSync(path.join(bundle, 'Contents', 'Info.plist'), plist({ id: o.id, version: o.version, exe }));
  const exePath = path.join(bundle, 'Contents', 'MacOS', exe);
  if (o.executable !== false || o.archs) fs.writeFileSync(exePath, Buffer.concat([machO(o.archs ?? ['x64']), Buffer.alloc(4096)]));
  fs.chmodSync(exePath, o.executable === false ? 0o644 : 0o755);
  fs.writeFileSync(path.join(bundle, 'Contents', 'Resources', 'marker.txt'), o.marker ?? o.version ?? '1.0.0');
  return bundle;
}

const marker = (bundle) => fs.readFileSync(path.join(bundle, 'Contents', 'Resources', 'marker.txt'), 'utf8');

function crc32(buf) {
  return zlib.crc32 ? zlib.crc32(buf) : 0;
}

/** A zip of the files under `dir`, paths relative to `dir` (entries stored, no compression). */
function zipFolder(dir, file) {
  const entries = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else entries.push({ name: path.relative(dir, p).split(path.sep).join('/'), data: fs.readFileSync(p) });
    }
  };
  walk(dir);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const n = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(n.length, 26);
    locals.push(local, n, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc >>> 0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  fs.writeFileSync(file, Buffer.concat([...locals, cd, end]));
  return { entries: entries.length, bytes: entries.reduce((n, e) => n + e.data.length, 0) };
}

module.exports = { fakeApp, marker, machO, plist, zipFolder, CPU };
