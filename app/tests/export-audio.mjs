// « Exporter » → « Audio… » in Chromium, with the REAL encoders (LAME and libFLAC as
// WebAssembly, in a worker) and a piece of known samples:
//   - the mix as heard (mute, solo, volumes) against the tracks at full level;
//   - the loop only, exact in frames;
//   - the three formats: WAV compared sample for sample, FLAC decoded by the
//     browser (`decodeAudioData`) and compared sample for sample, with its
//     STREAMINFO (length, MD5 of the samples) and title read from the file; MP3
//     decoded and compared within a stated error, allowing for the codec delay,
//     with its frame header (MPEG-1 layer III, 48 kHz, 320 kbit/s by default, joint stereo),
//     its title tag and its duration; every constant bit rate of the window (96 to 320);
//   - Wave at every rate (44.1, 48, 88.2, 96 kHz) and quantization (16, 24, 32 bits float): read back
//     (header, length, rate, bits; ffprobe agrees), 24 and 32 bits equal to the 16-bit codes, the tone
//     where it was, and a tone above the new Nyquist frequency not folded back into the band;
//   - several tracks ticked: one file each (archive) or one file mixing them at their volumes;
//   - the archive: UTF-8 names, CRCs, checked here and by `unzip -t` when present;
//   - cancel in the middle leaves nothing behind (no worker, no file link);
//   - an encoder that cannot load: a calm message, and WAV and FLAC still work;
//   - the export at another key and tempo goes through the offline renderer, and lasts
//     what the renderer's contract says;
//   - speed of each encoder, per minute of audio; screenshots of the dialog.
//   npm run build && npm run test:export-audio
// Screenshots go to $FABTICE_EXPORT_OUT (default: a temporary folder).

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const out = process.env.FABTICE_EXPORT_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-export-'));
fs.mkdirSync(out, { recursive: true });

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const note = (s) => console.log(`NOTE  ${s}`);

const TITLE = 'Pièce d’essai – ça swingue';
const SR = 48000;
const SECONDS = 12;

const { srv, url } = await startServer(0);
// A UTF-8 locale: without one (a bare container), Chromium renames non-ASCII download names.
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'], env: { ...process.env, LANG: process.env.LANG || 'C.UTF-8' } });

// ---------------------------------------------------------------- readers written here, from the formats

/** The files of a ZIP, from its central directory. */
function readZip(buf) {
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('no end of central directory');
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const files = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error('bad central header');
    const flags = buf.readUInt16LE(at + 8);
    const method = buf.readUInt16LE(at + 10);
    const crc = buf.readUInt32LE(at + 16);
    const size = buf.readUInt32LE(at + 24);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    files.push({ name, flags, method, crc, size, data: buf.subarray(dataAt, dataAt + size) });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

/** 16-bit interleaved samples of a PCM WAV (header checked). */
function readWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV');
  const channels = buf.readUInt16LE(22);
  const rate = buf.readUInt32LE(24);
  const bits = buf.readUInt16LE(34);
  const bytes = buf.readUInt32LE(40);
  const samples = new Int16Array(bytes / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = buf.readInt16LE(44 + 2 * i);
  return { channels, rate, bits, frames: bytes / (2 * channels), samples, declared: buf.readUInt32LE(4) + 8 === buf.length };
}

/** Any WAV (16, 24 bits integer or 32 bits float), read chunk by chunk: header fields and a sample reader (full scale = 1). */
function readWavAny(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV');
  let at = 12;
  let fmt = null;
  let fact = null;
  while (at + 8 <= buf.length) {
    const id = buf.toString('ascii', at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    if (id === 'fmt ') fmt = { tag: buf.readUInt16LE(at + 8), channels: buf.readUInt16LE(at + 10), rate: buf.readUInt32LE(at + 12), byteRate: buf.readUInt32LE(at + 16), align: buf.readUInt16LE(at + 20), bits: buf.readUInt16LE(at + 22), size };
    else if (id === 'fact') fact = buf.readUInt32LE(at + 8);
    else if (id === 'data') {
      const frames = size / fmt.align;
      const bytes = fmt.bits / 8;
      const read = (i, ch) => {
        const o = at + 8 + i * fmt.align + ch * bytes;
        if (fmt.bits === 32) return buf.readFloatLE(o);
        if (fmt.bits === 24) return buf.readIntLE(o, 3) / 8388608;
        return buf.readInt16LE(o) / 32768;
      };
      const code16 = (i, ch) => buf.readInt16LE(at + 8 + i * fmt.align + ch * bytes + (fmt.bits === 24 ? 1 : 0));
      return { ...fmt, frames, fact, read, code16, declared: buf.readUInt32LE(4) + 8 === buf.length && at + 8 + size === buf.length };
    }
    at += 8 + size + (size % 2);
  }
  throw new Error('no data chunk');
}

/** Amplitude of the component at `hz` of a signal given as a function of the frame (a single-bin Fourier sum over [from, to)). */
function amplitudeAt(get, rate, hz, from, to) {
  let re = 0;
  let im = 0;
  for (let i = from; i < to; i++) {
    const v = get(i);
    re += v * Math.cos((2 * Math.PI * hz * i) / rate);
    im += v * Math.sin((2 * Math.PI * hz * i) / rate);
  }
  return (2 * Math.hypot(re, im)) / (to - from);
}

/** What ffprobe says of a file (null when it is not installed). */
function ffprobe(buf, ext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-probe-'));
  const file = path.join(dir, `a.${ext}`);
  fs.writeFileSync(file, buf);
  try {
    const raw = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name,sample_rate,channels,bits_per_sample,bit_rate,duration', '-show_entries', 'format=bit_rate,duration', '-of', 'json', file], { encoding: 'utf8' });
    return JSON.parse(raw);
  } catch (e) {
    if (/ENOENT/.test(String(e))) return null;
    throw e;
  }
}

/** STREAMINFO and the Vorbis comments of a FLAC file. */
function readFlacHeader(buf) {
  if (buf.toString('ascii', 0, 4) !== 'fLaC') throw new Error('not a FLAC');
  const info = { comments: {} };
  let at = 4;
  for (;;) {
    const last = buf[at] & 0x80;
    const type = buf[at] & 0x7f;
    const size = (buf[at + 1] << 16) | (buf[at + 2] << 8) | buf[at + 3];
    const body = buf.subarray(at + 4, at + 4 + size);
    if (type === 0) {
      info.rate = (body[10] << 12) | (body[11] << 4) | (body[12] >> 4);
      info.channels = ((body[12] >> 1) & 7) + 1;
      info.bits = (((body[12] & 1) << 4) | (body[13] >> 4)) + 1;
      info.total = (body[13] & 15) * 2 ** 32 + body.readUInt32BE(14);
      info.md5 = body.subarray(18, 34).toString('hex');
    } else if (type === 4) {
      let p = 4 + body.readUInt32LE(0);
      const n = body.readUInt32LE(p);
      p += 4;
      for (let i = 0; i < n; i++) {
        const len = body.readUInt32LE(p);
        const [k, ...v] = body.toString('utf8', p + 4, p + 4 + len).split('=');
        info.comments[k.toUpperCase()] = v.join('=');
        p += 4 + len;
      }
    }
    at += 4 + size;
    if (last) break;
  }
  info.audioAt = at;
  return info;
}

/** The first frame header of an mp3 file (after any ID3v2 tag) and the title of that tag. */
function readMp3Header(buf) {
  let at = 0;
  let title = null;
  if (buf.toString('ascii', 0, 3) === 'ID3') {
    const size = (buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9];
    let f = 10;
    while (f < 10 + size && buf.toString('ascii', f, f + 4) === 'TIT2') {
      const len = buf.readUInt32BE(f + 4);
      const body = buf.subarray(f + 10, f + 10 + len);
      if (body[0] === 1) title = body.subarray(3).toString('utf16le'); // BOM FF FE then UTF-16LE
      f += 10 + len;
    }
    at = 10 + size;
  }
  const h = buf.readUInt32BE(at);
  const bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const rates = [44100, 48000, 32000, 0];
  const frame = {
    sync: (h >>> 21) === 0x7ff,
    version: (h >>> 19) & 3, // 3 = MPEG-1
    layer: (h >>> 17) & 3, // 1 = layer III
    kbps: bitrates[(h >>> 12) & 15],
    rate: rates[(h >>> 10) & 3],
    mode: (h >>> 6) & 3, // 0 stereo, 1 joint stereo, 3 mono
  };
  const frameBytes = Math.floor((144 * frame.kbps * 1000) / frame.rate) + ((h >>> 9) & 1);
  // The Info frame (Xing/LAME header) first: frames, bytes, delay and padding.
  let info = null;
  const infoAt = at + 4 + (frame.mode === 3 ? 17 : 32);
  if (buf.toString('ascii', infoAt, infoAt + 4) === 'Info') {
    const tag = infoAt + 120;
    info = {
      frames: buf.readUInt32BE(infoAt + 8),
      bytes: buf.readUInt32BE(infoAt + 12),
      version: buf.toString('ascii', tag, tag + 9),
      delay: (buf[tag + 21] << 4) | (buf[tag + 22] >> 4),
      padding: ((buf[tag + 22] & 15) << 8) | buf[tag + 23],
    };
    at += frameBytes;
  }
  // Walk every frame to count them.
  let frames = 0;
  let p = at;
  while (p + 4 <= buf.length && buf.readUInt32BE(p) >>> 21 === 0x7ff) {
    const hh = buf.readUInt32BE(p);
    p += Math.floor((144 * bitrates[(hh >>> 12) & 15] * 1000) / rates[(hh >>> 10) & 3]) + ((hh >>> 9) & 1);
    frames++;
  }
  return { ...frame, frameBytes, title, frames, info, audioBytes: p - at, trailing: buf.length - p };
}

/** Decodes a file with ffmpeg (an independent decoder) to 16-bit stereo, or null when it is not installed. */
function ffmpegDecode(buf, ext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-ffmpeg-'));
  const file = path.join(dir, `a.${ext}`);
  fs.writeFileSync(file, buf);
  try {
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 's16le', '-ac', '2', '-ar', '48000', '-'], { maxBuffer: 1 << 30 });
    return new Int16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length - (raw.length % 2)));
  } catch (e) {
    if (/ENOENT/.test(String(e))) return null;
    throw e;
  }
}

// ---------------------------------------------------------------- the page

async function open(query, viewport = { width: 1280, height: 800 }) {
  const page = await browser.newPage({ viewport, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  // Count the workers made and ended, and the file links made.
  await page.addInitScript(() => {
    const W = window.Worker;
    window.__workers = { made: 0, ended: 0 };
    window.Worker = class extends W {
      constructor(...a) {
        super(...a);
        window.__workers.made++;
      }
      terminate() {
        window.__workers.ended++;
        super.terminate();
      }
    };
    const create = URL.createObjectURL.bind(URL);
    window.__links = 0;
    URL.createObjectURL = (b) => {
      window.__links++;
      return create(b);
    };
  });
  await page.goto(`${url}/${query}`);
  await page.waitForFunction(() => window.__fabtice && window.__fabtice.lot3, null, { timeout: 20000 });
  await page.evaluate(() => window.__fabtice.ready);
  await page.evaluate(() => document.fonts.ready);
  return { page, errors };
}

/** Opens the known piece: three stereo tracks of 12 s of decaying tones and a little noise. */
async function openPiece(page) {
  await page.evaluate(
    async ({ title, seconds, sr }) => {
      const roles = ['basse', 'piano', 'voix'];
      const tracks = [];
      for (let k = 0; k < 3; k++) {
        const n = seconds * sr;
        const l = new Float32Array(n);
        const r = new Float32Array(n);
        let seed = 99 + k;
        const f = 110 * 2 ** (k * 0.5);
        for (let i = 0; i < n; i++) {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          const noise = (seed / 0x7fffffff - 0.5) * 0.01;
          const env = 0.6 + 0.4 * Math.sin((2 * Math.PI * (i / sr)) / (1.5 + k));
          const tone = 0.18 * Math.sin((2 * Math.PI * f * i) / sr) + 0.07 * Math.sin((2 * Math.PI * f * 3.01 * i) / sr) + 0.03 * Math.sin((2 * Math.PI * f * 7.02 * i) / sr);
          l[i] = env * tone + noise;
          r[i] = env * 0.9 * (0.18 * Math.sin((2 * Math.PI * f * i) / sr + 0.7) + 0.07 * Math.sin((2 * Math.PI * f * 3.01 * i) / sr)) + noise;
        }
        tracks.push({ role: roles[k], audio: { channels: [l, r], sampleRate: sr } });
      }
      await window.__fabtice.actions.openProject({ title, source: { kind: 'demo' }, tracks });
    },
    { title: TITLE, seconds: SECONDS, sr: SR },
  );
  await page.waitForFunction(() => window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 60000 });
  await page.evaluate(() => {
    // Helpers used by every check below: export with preferences, bytes back as base64, samples of a track.
    const f = window.__fabtice;
    const pcm = f.lot3.pcm;
    window.__bytes = async (prefs, chosen = null, options = {}) => {
      f.lot3.exportAudio.setExportPrefs(prefs);
      const s = f.store.getState();
      const plan = f.lot3.exportAudio.planAudioExport(s, s.exportPrefs, chosen);
      const t0 = performance.now();
      const file = await f.lot3.exportAudio.exportWithApp(plan, options);
      const ms = performance.now() - t0;
      const buf = new Uint8Array(await file.blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return { name: file.name, b64: btoa(bin), ms, plan: { files: plan.files.map((x) => ({ name: x.name, title: x.title, sources: x.sources })), archiveName: plan.archiveName, range: plan.range } };
    };
    /** Samples of a track from `from` frame, as Float32 (left, right). */
    window.__samples = (trackIndex, from, n) => {
      const s = f.store.getState();
      const audio = f.lot3.registry.getAudio(s.tracks[trackIndex].audio.id);
      const l = new Float32Array(n);
      const r = new Float32Array(n);
      pcm.readPcm(audio, 0, from, l);
      pcm.readPcm(audio, 1, from, r);
      return [Array.from(l), Array.from(r)];
    };
  });
}

const fromB64 = (r) => ({ ...r, buf: Buffer.from(r.b64, 'base64') });
// The choices not named are the defaults of the window (they are kept with the piece, so they would otherwise carry over from one call to the next).
const DEFAULTS = { waveRate: 48000, waveBits: 16, mp3Kbps: 320, separate: true };
const exp = async (page, prefs, chosen = null) => fromB64(await page.evaluate(([p, c]) => window.__bytes(p, c), [{ ...DEFAULTS, ...prefs }, chosen]));
/** Source samples (16-bit codes) of track `k` interleaved, from frame `from`, `n` frames. */
async function source(page, k, from, n) {
  const [l, r] = await page.evaluate(([k, from, n]) => window.__samples(k, from, n), [k, from, n]);
  const s = new Int16Array(2 * n);
  for (let i = 0; i < n; i++) {
    s[2 * i] = Math.round(l[i] * 32768);
    s[2 * i + 1] = Math.round(r[i] * 32768);
  }
  return s;
}
const decodeInPage = (page, b64) =>
  page.evaluate(async (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ctx = new OfflineAudioContext(2, 1, 48000);
    const a = await ctx.decodeAudioData(bytes.buffer);
    return { rate: a.sampleRate, length: a.length, channels: a.numberOfChannels, l: Array.from(a.getChannelData(0)), r: Array.from(a.getChannelData(a.numberOfChannels - 1)) };
  }, b64);

try {
  const { page, errors } = await open('?debug&analyse=aucune&moteur=factice');
  await openPiece(page);
  const ids = await page.evaluate(() => window.__fabtice.store.getState().tracks.map((t) => t.id));
  const TOTAL = SECONDS * SR;

  // ------------------------------------------------------------ the three encoders are there
  check('the three formats are offered, none « bientôt »', await page.evaluate(() => ['wav', 'mp3', 'flac'].every((f) => window.__fabtice.lot3.exportAudio.getEncoder(f))));

  // ------------------------------------------------------------ mix as heard
  // Track 0 at half volume, track 1 full, track 2 muted: the mix is 0.5 * t0 + t1.
  await page.evaluate((ids) => {
    const a = window.__fabtice.actions;
    a.setTrackVolume(ids[0], 0.5);
    a.toggleMute(ids[2]);
  }, ids);
  {
    const r = await exp(page, { what: 'mix', range: 'whole', format: 'wav' });
    const w = readWav(r.buf);
    const [s0, s1] = [await source(page, 0, 0, TOTAL), await source(page, 1, 0, TOTAL)];
    let worst = 0;
    for (let i = 0; i < w.samples.length; i++) worst = Math.max(worst, Math.abs(w.samples[i] - (0.5 * s0[i] + s1[i])));
    check('mix as heard: muted track out, volume applied (within one 16-bit step)', w.frames === TOTAL && worst <= 1.5, `${w.frames} frames, worst difference ${worst}`);
    check('the mix is one file named after the piece', r.name === `${TITLE} – mélange.wav` && r.plan.archiveName === null, r.name);
    check('WAV: header declares its size, 16 bits, 48 kHz, stereo', w.declared && w.bits === 16 && w.rate === 48000 && w.channels === 2);
  }
  // Solo on track 2 (which is muted): solo wins, and only it is heard.
  await page.evaluate((ids) => window.__fabtice.actions.toggleSolo(ids[2]), ids);
  {
    const r = await exp(page, { what: 'mix', range: 'whole', format: 'wav' });
    const w = readWav(r.buf);
    const s2 = await source(page, 2, 0, TOTAL);
    let worst = 0;
    for (let i = 0; i < w.samples.length; i++) worst = Math.max(worst, Math.abs(w.samples[i] - s2[i]));
    check('mix as heard: a soloed track alone, even if it was muted', worst <= 1.5 && r.plan.files[0].sources.length === 1, `worst ${worst}`);
  }
  await page.evaluate((ids) => window.__fabtice.actions.toggleSolo(ids[2]), ids);

  // ------------------------------------------------------------ tracks at full level, in an archive
  {
    const r = await exp(page, { what: 'tracks', range: 'whole', format: 'wav' });
    const zip = readZip(r.buf);
    const names = zip.map((f) => f.name);
    check('archive: named after the piece, three files, names in UTF-8 with accents', r.name === `${TITLE} – pistes.zip` && names.length === 3 && names.every((n) => n.startsWith(`${TITLE} – `)), `${r.name}: ${names.join(' | ')}`);
    check('archive: UTF-8 flag set on every entry, stored, CRC-32 right', zip.every((f) => (f.flags & 0x800) !== 0 && f.method === 0 && zlib.crc32(f.data) === f.crc));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-zip-'));
    const zipFile = path.join(dir, 'a.zip');
    fs.writeFileSync(zipFile, r.buf);
    let tool = 'no unzip tool here';
    try {
      const o = execFileSync('unzip', ['-t', zipFile], { encoding: 'utf8' });
      tool = /No errors detected/.test(o) ? 'unzip -t: no errors' : o.slice(-200);
    } catch (e) {
      tool = /ENOENT/.test(String(e)) ? 'no unzip tool here' : `unzip failed: ${String(e.stdout || e).slice(-200)}`;
    }
    try {
      const py = execFileSync('python3', ['-I', '-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print(z.testzip()); print("|".join(z.namelist()))', zipFile], { encoding: 'utf8' }).split('\n');
      check('archive: python zipfile reads it, no bad member, the same names', py[0] === 'None' && py[1] === names.join('|'), py.join(' / '));
    } catch (e) {
      note(`python zipfile not usable: ${String(e).slice(0, 100)}`);
    }
    check('archive: unzip -t agrees (when the tool exists)', tool === 'no unzip tool here' || tool === 'unzip -t: no errors', tool);
    // Each track at full level (the mute and the half volume are ignored), exactly the source.
    let exact = true;
    for (let k = 0; k < 3; k++) {
      const w = readWav(zip[k].data);
      const s = await source(page, k, 0, TOTAL);
      for (let i = 0; i < s.length && exact; i++) if (w.samples[i] !== s[i]) exact = false;
      if (w.frames !== TOTAL) exact = false;
    }
    check('tracks: each one at its full level, sample for sample (mute and volume ignored)', exact);
    // Only the ones ticked.
    const two = await exp(page, { what: 'tracks', range: 'whole', format: 'wav' }, [ids[0], ids[2]]);
    check('tracks: only the ticked ones go in', readZip(two.buf).length === 2);
  }

  // ------------------------------------------------------------ several tracks ticked: one file each, or one file mixing them
  // (track 0 is at half volume, track 2 is muted: the mute is ignored, the volume is kept in the one file)
  {
    const together = await exp(page, { what: 'tracks', range: 'whole', format: 'wav', separate: false }, [ids[0], ids[2]]);
    const w = readWav(together.buf);
    const [s0, s2] = [await source(page, 0, 0, TOTAL), await source(page, 2, 0, TOTAL)];
    let worst = 0;
    for (let i = 0; i < w.samples.length; i++) worst = Math.max(worst, Math.abs(w.samples[i] - (0.5 * s0[i] + s2[i])));
    check('one file for the ticked tracks: a single WAV, not an archive, named after the tracks', together.plan.archiveName === null && together.plan.files.length === 1 && together.name === `${TITLE} – Basse + Voix.wav`, together.name);
    check('one file for the ticked tracks: their sum at their volumes, the muted one heard (mute and solo ignored)', w.frames === TOTAL && worst <= 1.5, `worst ${worst}`);
    const apart = await exp(page, { what: 'tracks', range: 'whole', format: 'wav', separate: true }, [ids[0], ids[2]]);
    check('one file per track: the archive of the two ticked, each at full level', apart.plan.archiveName !== null && readZip(apart.buf).length === 2);
    const alone = await exp(page, { what: 'tracks', range: 'whole', format: 'wav', separate: false }, [ids[1]]);
    const one = readWav(alone.buf);
    const s1 = await source(page, 1, 0, TOTAL);
    let same = one.samples.length === s1.length;
    for (let i = 0; i < s1.length && same; i++) if (one.samples[i] !== s1[i]) same = false;
    check('one track ticked: always one file, at its full level, whatever the box says', alone.plan.archiveName === null && same);
  }

  // ------------------------------------------------------------ Wave: sampling rate and quantization
  {
    // Track 1 alone (full level), left channel; its component at 220 Hz·2^0.5 is the one we follow.
    const hz = 110 * 2 ** 0.5;
    const src = await source(page, 1, 0, TOTAL);
    const srcAmp = amplitudeAt((i) => src[2 * i] / 32768, SR, hz, 0, TOTAL);
    const pick = (waveRate, waveBits) => exp(page, { what: 'tracks', range: 'whole', format: 'wav', waveRate, waveBits, separate: false }, [ids[1]]);
    // At 48 kHz: 24 bits and 32 bits float are the 16-bit codes, widened (nothing is rounded).
    for (const bits of [24, 32]) {
      const r = await pick(48000, bits);
      const w = readWavAny(r.buf);
      let exactly = w.frames === TOTAL && w.declared;
      for (let i = 0; i < TOTAL && exactly; i++) for (let ch = 0; ch < 2 && exactly; ch++) if (Math.round(w.read(i, ch) * 32768) !== src[2 * i + ch] || w.read(i, ch) * 32768 !== src[2 * i + ch]) exactly = false;
      check(`Wave 48 kHz ${bits === 32 ? '32-bit float' : '24 bits'}: header (${bits === 32 ? 'format 3, fact chunk' : 'PCM'}) and every sample the 16-bit code exactly`, exactly && w.rate === 48000 && w.bits === bits && w.tag === (bits === 32 ? 3 : 1) && (bits === 32 ? w.fact === TOTAL : w.fact === null), JSON.stringify({ rate: w.rate, bits: w.bits, tag: w.tag, frames: w.frames, fact: w.fact }));
      const probe = ffprobe(r.buf, 'wav');
      if (probe) check(`Wave 48 kHz ${bits}: ffprobe reads it (${bits === 32 ? 'pcm_f32le' : 'pcm_s24le'}, 48000 Hz, 2 channels, ${SECONDS} s)`, probe.streams[0].codec_name === (bits === 32 ? 'pcm_f32le' : 'pcm_s24le') && probe.streams[0].sample_rate === '48000' && probe.streams[0].channels === 2 && Math.abs(Number(probe.format.duration) - SECONDS) < 0.001, JSON.stringify(probe.streams[0]));
    }
    for (const rate of [44100, 88200, 96000]) {
      for (const bits of [16, 24, 32]) {
        const r = await pick(rate, bits);
        const w = readWavAny(r.buf);
        const frames = Math.round((TOTAL * rate) / 48000);
        const amp = amplitudeAt((i) => w.read(i, 0), rate, hz, 0, w.frames);
        const gain = 20 * Math.log10(amp / srcAmp);
        check(`Wave ${rate / 1000} kHz ${bits === 32 ? '32-bit float' : `${bits} bits`}: header, exact length (${frames} frames), the tone where it was (${gain.toFixed(3)} dB)`, w.rate === rate && w.bits === bits && w.channels === 2 && w.frames === frames && w.declared && Math.abs(gain) < 0.02, JSON.stringify({ rate: w.rate, bits: w.bits, frames: w.frames, gain }));
        if (bits === 24 && rate === 96000) {
          const probe = ffprobe(r.buf, 'wav');
          if (probe) check('Wave 96 kHz 24 bits: ffprobe reads 96000 Hz, pcm_s24le, the duration of the piece', probe.streams[0].sample_rate === '96000' && probe.streams[0].codec_name === 'pcm_s24le' && Math.abs(Number(probe.format.duration) - SECONDS) < 0.001, JSON.stringify(probe.streams[0]));
        }
        if (bits === 16 && rate === 96000) {
          // Twice the rate keeps the original samples on the even frames.
          let worst = 0;
          for (let i = 100; i < TOTAL - 100; i += 5) worst = Math.max(worst, Math.abs(w.code16(2 * i, 0) - src[2 * i]));
          check('Wave 96 kHz: the original samples are still there on the even frames (within one 16-bit step)', worst <= 1, `worst ${worst}`);
        }
      }
    }
    // A tone above the new Nyquist frequency does not fold back into the band (measured in the page, on the real encoder).
    const folds = await page.evaluate(async () => {
      const f = window.__fabtice;
      const sr = 48000;
      const n = sr * 2;
      const result = {};
      for (const hz of [23000, 22500]) {
        const tone = Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / sr));
        const pcm = f.lot3.pcm.pcmFromChannels([tone], sr);
        const blob = await f.lot3.exportAudio.getEncoder('wav').encode(pcm, { sampleRate: 44100, bits: 16 });
        const dv = new DataView(await blob.arrayBuffer());
        const frames = (dv.byteLength - 44) / 2;
        const at = (alias) => {
          let re = 0;
          let im = 0;
          for (let i = 3000; i < frames - 3000; i++) {
            const v = dv.getInt16(44 + 2 * i, true) / 32768;
            re += v * Math.cos((2 * Math.PI * alias * i) / 44100);
            im += v * Math.sin((2 * Math.PI * alias * i) / 44100);
          }
          return (2 * Math.hypot(re, im)) / (frames - 6000);
        };
        result[hz] = 20 * Math.log10(Math.max(at(44100 - hz), 1e-9) / 0.5);
      }
      return result;
    });
    check('44.1 kHz: 23 kHz and 22.5 kHz (above 22.05) do not fold back to 21.1 and 21.6 kHz (below -75 dB; 16-bit rounding is the floor)', folds[23000] < -75 && folds[22500] < -75, JSON.stringify(folds));
  }

  // ------------------------------------------------------------ MP3: every constant bit rate of the window
  {
    for (const kbps of [96, 128, 160, 192, 256, 320]) {
      const r = await exp(page, { what: 'mix', range: 'whole', format: 'mp3', mp3Kbps: kbps });
      const h = readMp3Header(r.buf);
      const ok = h.sync && h.kbps === kbps && h.rate === 48000 && h.info && h.info.frames === h.frames && h.frames * 1152 - h.info.delay - h.info.padding === TOTAL && h.trailing === 0;
      const expected = (kbps * 1000 * SECONDS) / 8;
      check(`MP3 ${kbps} kbit/s: header says ${kbps}, Info frame and length exact, the size is that of a constant rate (${(r.buf.length / expected).toFixed(3)} of ${expected} bytes)`, ok && Math.abs(r.buf.length / expected - 1) < 0.02, JSON.stringify({ kbps: h.kbps, frames: h.frames }));
      const probe = ffprobe(r.buf, 'mp3');
      if (probe) check(`MP3 ${kbps} kbit/s: ffprobe reads ${kbps} kbit/s, 48000 Hz, ${SECONDS} s`, Math.abs(Number(probe.format.bit_rate) / 1000 - kbps) < kbps * 0.02 && probe.streams[0].sample_rate === '48000' && Math.abs(Number(probe.format.duration) - SECONDS) < 0.03, JSON.stringify(probe.format));
    }
  }

  // ------------------------------------------------------------ the loop only
  await page.evaluate((ids) => {
    const a = window.__fabtice.actions;
    a.setTrackVolume(ids[0], 1);
    a.toggleMute(ids[2]); // unmute
    a.setLoopRegion({ start: 2.0, end: 4.5 });
  }, ids);
  const region = await page.evaluate(() => window.__fabtice.store.getState().loop.region);
  const loopStart = Math.round(region.start * SR);
  const loopFrames = Math.round(region.end * SR) - loopStart;
  {
    const r = await exp(page, { what: 'tracks', range: 'loop', format: 'wav' }, [ids[1]]);
    // One track only: a single file, not an archive.
    const w = readWav(r.buf);
    const s = await source(page, 1, loopStart, loopFrames);
    let same = w.samples.length === s.length;
    for (let i = 0; i < s.length && same; i++) if (w.samples[i] !== s[i]) same = false;
    check('loop only: exactly the loop in frames, and its samples', w.frames === loopFrames && same, `${w.frames} frames, expected ${loopFrames}`);
    const trackName = await page.evaluate(() => window.__fabtice.store.getState().tracks[1].name);
    const mapInfo = await page.evaluate(() => JSON.stringify(window.__fabtice.store.getState().tempoMap.segments[0]));
    check('loop only: the name says so, one track is one file', r.name.startsWith(`${TITLE} – ${trackName} – boucle `) && r.name.endsWith('.wav'), `${r.name} (grid ${mapInfo})`);
  }
  // A loop that is not made of whole bars: the same exactness, and the name says where it is.
  {
    const free = { start: 2.2837, end: 4.6291 };
    await page.evaluate((r) => window.__fabtice.actions.setLoopRegion(r), free);
    const fStart = Math.round(free.start * SR);
    const fFrames = Math.round(free.end * SR) - fStart;
    const r = await exp(page, { what: 'tracks', range: 'loop', format: 'wav' }, [ids[1]]);
    const w = readWav(r.buf);
    const s = await source(page, 1, fStart, fFrames);
    let same = w.samples.length === s.length;
    for (let i = 0; i < s.length && same; i++) if (w.samples[i] !== s[i]) same = false;
    check('free loop (not on the grid): exactly its length in frames, to the sample', w.frames === fFrames && same, `${w.frames} frames, expected ${fFrames}`);
    check('free loop: the name carries where it is (bar.beat with « ≈ »)', / – boucle ≈\d+\.\d/.test(r.name), r.name);
    // On the grid at 120 BPM (a beat is 0.5 s): beat 2 of bar 2 to the 4th sixteenth of beat 3 of bar 4.
    await page.evaluate(() => window.__fabtice.actions.setLoopRegion({ start: 2.5, end: 7.375 }));
    const g = await exp(page, { what: 'tracks', range: 'loop', format: 'wav' }, [ids[1]]);
    const gw = readWav(g.buf);
    check('sub-grid loop: exactly 4.875 s, and the name reads « boucle 2.2 à 4.3 (4e double) »', gw.frames === Math.round(7.375 * SR) - Math.round(2.5 * SR) && g.name.includes(' – boucle 2.2 à 4.3 (4e double).wav'), `${gw.frames} frames, ${g.name}`);
    await page.evaluate(() => window.__fabtice.actions.setLoopRegion({ start: 2.0, end: 4.5 }));
  }

  // ------------------------------------------------------------ the formats
  await page.evaluate(() => window.__fabtice.actions.setLoopRegion(null));
  // WAV, FLAC, MP3 of the same mix (all three tracks audible).
  const mix = async (format) => exp(page, { what: 'mix', range: 'whole', format });
  const wav = await mix('wav');
  const wavSamples = readWav(wav.buf).samples;
  {
    const r = await mix('flac');
    const h = readFlacHeader(r.buf);
    const md5 = crypto.createHash('md5').update(Buffer.from(wavSamples.buffer)).digest('hex');
    check('FLAC: STREAMINFO says 48 kHz, 2 channels, 16 bits, the exact length', h.rate === 48000 && h.channels === 2 && h.bits === 16 && h.total === TOTAL, JSON.stringify({ r: h.rate, c: h.channels, b: h.bits, t: h.total }));
    check('FLAC: the MD5 of the samples in the file is the MD5 of the 16-bit samples', h.md5 === md5, `${h.md5} vs ${md5}`);
    check('FLAC: title tag', h.comments.TITLE === `${TITLE} – mélange`, h.comments.TITLE);
    const d = await decodeInPage(page, r.b64);
    let worst = 0;
    let mismatches = 0;
    // Chromium turns 16-bit codes into floats dividing by 32768 below zero and by 32767 above (decoded floats are
    // therefore not codes / 32768); this is its inverse.
    const code = (x) => Math.round(x < 0 ? x * 32768 : x * 32767);
    for (let i = 0; i < d.length; i++) {
      const a = code(d.l[i]) - wavSamples[2 * i];
      const b = code(d.r[i]) - wavSamples[2 * i + 1];
      if (a !== 0 || b !== 0) mismatches++;
      worst = Math.max(worst, Math.abs(a), Math.abs(b));
    }
    check('FLAC: decoded by the browser, sample for sample the 16-bit mix (lossless)', d.length === TOTAL && d.rate === 48000 && mismatches === 0, `${d.length} frames, ${mismatches} differing samples, worst ${worst}`);
    const ff = ffmpegDecode(r.buf, 'flac');
    if (ff) {
      let same = ff.length === wavSamples.length;
      for (let i = 0; i < ff.length && same; i++) if (ff[i] !== wavSamples[i]) same = false;
      check('FLAC: decoded by ffmpeg (libFLAC-independent decoder), identical to the 16-bit mix, every sample', same, `${ff.length} samples vs ${wavSamples.length}`);
    } else note('ffmpeg not installed: FLAC not cross-checked with a second decoder');
    note(`FLAC size ${(r.buf.length / 1048576).toFixed(2)} MB for ${SECONDS} s of this signal (WAV ${(wav.buf.length / 1048576).toFixed(2)} MB)`);
    fs.writeFileSync(path.join(out, r.name), r.buf);
  }
  {
    const r = await mix('mp3');
    const h = readMp3Header(r.buf);
    check('MP3: MPEG-1 layer III, 48 kHz, 320 kbit/s constant by default, joint stereo', h.sync && h.version === 3 && h.layer === 1 && h.rate === 48000 && h.kbps === 320 && h.mode === 1, JSON.stringify(h));
    check('MP3: Info frame first: frame count, byte count, delay 576 and the padding that makes the length exact', h.info && h.info.frames === h.frames && h.info.bytes === h.frameBytes * (h.frames + 1) && h.info.delay === 576 && h.frames * 1152 - h.info.delay - h.info.padding === TOTAL, JSON.stringify(h.info));
    check('MP3: title tag (UTF-16, accents kept)', h.title === `${TITLE} – mélange`, String(h.title));
    check('MP3: no stray bytes after the last frame', h.trailing === 0, `${h.trailing} bytes`);
    const ffm = ffmpegDecode(r.buf, 'mp3');
    if (ffm) check('MP3: ffmpeg, which reads the Info frame, decodes exactly the length of the piece (gapless)', ffm.length === wavSamples.length, `${ffm.length / 2} frames vs ${TOTAL}`);
    else note('ffmpeg not installed: mp3 length not cross-checked');
    const d = await decodeInPage(page, r.b64);
    // Align by correlation over a window around the codec delay (encoder 576 + decoder 529 = 1105 samples, which the Info frame makes 0).
    const ref = wavSamples;
    let best = { lag: 0, score: -Infinity };
    for (let lag = 0; lag <= 2400; lag++) {
      let s = 0;
      for (let i = 20000; i < 20000 + 4000; i++) s += (d.l[i + lag] * 32768) * ref[2 * i];
      if (s > best.score) best = { lag, score: s };
    }
    let errE = 0;
    let sigE = 0;
    let peak = 0;
    const from = 4800;
    const to = Math.min(TOTAL, d.length - best.lag) - 4800; // skip the first and the last 0.1 s (the edges of the codec)
    for (let i = from; i < to; i++) {
      for (const [dec, refv] of [[d.l[i + best.lag], ref[2 * i]], [d.r[i + best.lag], ref[2 * i + 1]]]) {
        const e = dec * 32768 - refv;
        errE += e * e;
        sigE += refv * refv;
        peak = Math.max(peak, Math.abs(e));
      }
    }
    const snr = 10 * Math.log10(sigE / errE);
    note(`MP3: decoded length ${d.length} frames for ${TOTAL} (${d.length - TOTAL} more), codec delay found ${best.lag} frames, signal-to-error ${snr.toFixed(1)} dB, largest error ${(peak / 32768).toFixed(4)} of full scale, size ${(r.buf.length / 1048576).toFixed(2)} MB`);
    check('MP3: decoded, already aligned with the source (the Info frame cuts the codec delay) and within a signal-to-error of 30 dB', snr >= 30 && best.lag <= 2, `${snr.toFixed(1)} dB at delay ${best.lag}`);
    check('MP3: the browser decodes it to the piece\'s length, to within the one frame of the codec (a player that ignores the Info frame adds 1105 samples)', Math.abs(d.length - TOTAL) <= 1152 + 1105, `${d.length} vs ${TOTAL}`);
    fs.writeFileSync(path.join(out, r.name), r.buf);
  }
  // An archive of mp3 and of flac tracks: names with the right extension.
  for (const format of ['mp3', 'flac']) {
    const r = await exp(page, { what: 'tracks', range: 'whole', format });
    const zip = readZip(r.buf);
    const magic = zip.every((f) => (format === 'flac' ? f.data.toString('ascii', 0, 4) === 'fLaC' : f.data.toString('ascii', 0, 3) === 'ID3'));
    check(`archive of ${format}: three .${format} files, each a real ${format} file, CRC right`, zip.length === 3 && zip.every((f) => f.name.endsWith(`.${format}`) && zlib.crc32(f.data) === f.crc) && magic);
  }
  const live = await page.evaluate(() => window.__workers);
  check('every encoder worker was ended after its file', live.made > 0 && live.made === live.ended, JSON.stringify(live));

  // ------------------------------------------------------------ speed
  {
    // One minute of stereo audio of the piece's kind (the piece repeated), encoded alone.
    const speeds = await page.evaluate(async () => {
      const f = window.__fabtice;
      const s = f.store.getState();
      const src = f.lot3.registry.getAudio(s.tracks[0].audio.id);
      const sr = 48000;
      const n = 60 * sr;
      const l = new Float32Array(n);
      const r = new Float32Array(n);
      const a = new Float32Array(src.frames);
      const b = new Float32Array(src.frames);
      f.lot3.pcm.readPcm(src, 0, 0, a);
      f.lot3.pcm.readPcm(src, 1, 0, b);
      for (let i = 0; i < n; i++) {
        l[i] = a[i % a.length];
        r[i] = b[i % b.length];
      }
      const minute = f.lot3.pcm.pcmFromChannels([l, r], sr);
      const res = {};
      for (const format of ['wav', 'mp3', 'flac']) {
        const t0 = performance.now();
        const blob = await f.lot3.exportAudio.getEncoder(format).encode(minute, {});
        res[format] = { ms: Math.round(performance.now() - t0), bytes: blob.size };
      }
      return res;
    });
    for (const [format, v] of Object.entries(speeds)) note(`speed ${format.toUpperCase()}: ${v.ms} ms per minute of stereo audio (${(60000 / v.ms).toFixed(0)}x real time), ${(v.bytes / 1048576).toFixed(2)} MB`);
  }

  // ------------------------------------------------------------ cancel
  {
    // Direct: abort in the middle of a long mp3 (the piece, five times over).
    const result = await page.evaluate(async () => {
      const f = window.__fabtice;
      const s = f.store.getState();
      const src = f.lot3.registry.getAudio(s.tracks[0].audio.id);
      const sr = 48000;
      const n = 240 * sr;
      const l = new Float32Array(n);
      const a = new Float32Array(src.frames);
      f.lot3.pcm.readPcm(src, 0, 0, a);
      for (let i = 0; i < n; i++) l[i] = a[i % a.length];
      const long = f.lot3.pcm.pcmFromChannels([l, l.map((v) => -v)], sr);
      const before = { ...window.__workers };
      const abort = new AbortController();
      let seen = 0;
      let outcome = '';
      const t0 = performance.now();
      let cancelledAfter = 0;
      try {
        await f.lot3.exportAudio.getEncoder('mp3').encode(long, {
          signal: abort.signal,
          onProgress: (x) => {
            seen = x;
            if (x > 0.3 && !abort.signal.aborted) {
              cancelledAfter = performance.now();
              abort.abort();
            }
          },
        });
        outcome = 'finished';
      } catch (e) {
        outcome = e.code ?? e.message;
      }
      const settled = performance.now();
      return { outcome, seen, ms: settled - cancelledAfter, made: window.__workers.made - before.made, ended: window.__workers.ended - before.ended, total: settled - t0 };
    });
    check('cancel in the middle of an mp3: rejected as « cancelled », at once, the worker ended', result.outcome === 'cancelled' && result.seen > 0.3 && result.seen < 1 && result.ms < 500 && result.made === result.ended && result.made === 1, JSON.stringify(result));
    // Before it starts: nothing is even created.
    const pre = await page.evaluate(async () => {
      const f = window.__fabtice;
      const s = f.store.getState();
      const abort = new AbortController();
      abort.abort();
      const before = window.__workers.made;
      let code = '';
      try {
        await f.lot3.exportAudio.getEncoder('flac').encode(f.lot3.registry.getAudio(s.tracks[0].audio.id), { signal: abort.signal });
      } catch (e) {
        code = e.code;
      }
      return { code, made: window.__workers.made - before };
    });
    check('cancel before the start: no worker is made', pre.code === 'cancelled' && pre.made === 0, JSON.stringify(pre));
  }
  {
    // Through the dialog: « Annuler » while the file is made, and nothing offered after.
    await page.evaluate(() => window.__fabtice.lot3.exportAudio.setExportPrefs({ what: 'tracks', range: 'whole', format: 'mp3' }));
    const before = await page.evaluate(() => ({ ...window.__workers, links: window.__links }));
    await page.evaluate(() => window.__fabtice.lot3.exportAudio.openExportAudio());
    await page.waitForSelector('[data-testid="export-son"]');
    await page.click('[data-testid="exporter-son"]');
    await page.waitForSelector('.import-etat .bouton-cadre', { timeout: 10000 });
    await page.waitForFunction(() => window.__workers.made > 0, null, { timeout: 10000 });
    await page.click('.import-etat .bouton-cadre');
    await page.waitForSelector('[data-testid="exporter-son"]', { timeout: 5000 });
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({ ...window.__workers, links: window.__links, file: document.querySelector('[data-testid="fichier-son"]') !== null }));
    check('cancel from the dialog: back to the choices, no file offered, no file link made, every worker ended', !after.file && after.links === before.links && after.made - before.made === after.ended - before.ended, JSON.stringify({ before, after }));
    await page.evaluate(() => window.__fabtice.lot3.exportAudio.closeExportAudio());
  }

  // ------------------------------------------------------------ key and tempo go through the renderer
  {
    await page.evaluate(() => {
      const f = window.__fabtice;
      const inner = f.lot3.renderer.getRenderer();
      window.__asked = [];
      f.lot3.renderer.replaceRenderer({
        kind: inner.kind,
        supportsFormants: inner.supportsFormants,
        render: (req) => {
          window.__asked.push({ semitones: req.semitones, cents: req.cents, tempoRatio: req.tempoRatio, range: req.range ?? null, frames: req.audio.frames });
          return inner.render(req);
        },
      });
      f.actions.stepSemitones(1);
      f.actions.stepSemitones(1);
      f.actions.stepSemitones(1);
      f.actions.setTempoRatio(0.75);
    });
    const r = await exp(page, { what: 'tracks', range: 'whole', format: 'wav' });
    const asked = await page.evaluate(() => window.__asked);
    const zip = readZip(r.buf);
    const expected = Math.round(TOTAL / 0.75);
    const lengths = zip.map((f) => readWav(f.data).frames);
    check('key and tempo: every track went through the renderer, with +3 semitones and tempo 0.75', asked.length === 3 && asked.every((a) => a.semitones === 3 && a.tempoRatio === 0.75 && a.cents === 0), JSON.stringify(asked.slice(0, 1)));
    check('key and tempo: each file lasts the piece divided by the tempo, exactly', lengths.every((n) => n === expected), `${lengths.join(', ')} vs ${expected}`);
    check('key and tempo: the names say so', zip.every((f) => f.name.includes('(+3 demi-tons, tempo 75 %)')), zip[0].name);
    // The mix: only the audible tracks are rendered, then summed; and mp3 of a changed tempo has the right duration too.
    await page.evaluate(() => (window.__asked = []));
    const m = await exp(page, { what: 'mix', range: 'whole', format: 'mp3' });
    const asked2 = await page.evaluate(() => window.__asked.length);
    const h = readMp3Header(m.buf);
    check('key and tempo: the mix renders each audible track, and the mp3 lasts the new duration', asked2 === 3 && h.frames * 1152 - h.info.delay - h.info.padding === expected, `${asked2} renders, ${h.frames * 1152 - h.info.delay - h.info.padding} samples vs ${expected}`);
    // The loop at that tempo: the renderer is asked for the loop only.
    await page.evaluate(() => {
      window.__asked = [];
      window.__fabtice.actions.setLoopRegion({ start: 2.0, end: 4.5 });
    });
    const lp = await exp(page, { what: 'tracks', range: 'loop', format: 'flac' }, [ids[0]]);
    const asked3 = await page.evaluate(() => window.__asked);
    const h2 = readFlacHeader(lp.buf);
    check('key and tempo with a loop: the renderer is asked for the loop range, the file lasts its length / tempo', asked3.length === 1 && asked3[0].range.start === 2 && asked3[0].range.end === 4.5 && h2.total === Math.round(loopFrames / 0.75), `${h2.total} vs ${Math.round(loopFrames / 0.75)}`);
    await page.evaluate(() => {
      window.__fabtice.actions.setLoopRegion(null);
      window.__fabtice.actions.setTempoRatio(1);
    });
  }
  check('no page errors', errors.length === 0, errors.join(' | '));
  await page.close();

  // ------------------------------------------------------------ the dialog: formats, an encoder that fails, screenshots
  for (const [w, h, tag] of [
    [1280, 800, 'bureau'],
    [390, 844, 'telephone'],
  ]) {
    const { page, errors } = await open('?demo&moteur=factice&separation=faite&export=ouvert', { width: w, height: h });
    await page.waitForSelector('[data-testid="export-son"]');
    const formats = await page.$$eval('.exp-formats button', (bs) => bs.map((b) => ({ text: b.textContent, disabled: b.disabled, on: b.getAttribute('aria-checked') })));
    check(`${tag}: the window offers Wave, Flac and MP3 in that order, none disabled, no « bientôt », Wave chosen`, formats.map((f) => f.text).join() === 'Wave,Flac,MP3' && formats.every((f) => !f.disabled && !/bientôt/.test(f.text)) && formats[0].on === 'true', JSON.stringify(formats));
    const win = page.locator('[data-testid="export-son"]');
    const prefs = () => page.evaluate(() => window.__fabtice.store.getState().exportPrefs);
    check(`${tag}: Wave opens at 48 kHz and 16 bits, with no remark about the rate`, (await page.inputValue('[data-testid="export-frequence"]')) === '48000' && (await page.getAttribute('.exp-duo [data-bits="16"]', 'aria-checked')) === 'true' && (await page.locator('[data-testid="export-note-frequence"]').count()) === 0);
    const rates = await page.$$eval('[data-testid="export-frequence"] option', (os) => os.map((o) => o.textContent));
    check(`${tag}: the rates offered are 44,1 / 48 / 88,2 / 96 kHz, the quantizations 16 / 24 / 32 bits flottant`, rates.join('|') === '44,1 kHz|48 kHz|88,2 kHz|96 kHz' && (await page.$$eval('.exp-duo [data-bits]', (bs) => bs.map((b) => b.textContent.trim()).join('|'))) === '16 bits|24 bits|32 bits flottant', rates.join('|'));
    await page.selectOption('[data-testid="export-frequence"]', '96000');
    await page.click('.exp-duo [data-bits="24"]');
    const remark = await page.locator('[data-testid="export-note-frequence"]').innerText();
    check(`${tag}: above 48 kHz the window says in one line that Fabtice works at 48 kHz and that more adds no quality`, /48 kHz/.test(remark) && /n’ajoute pas de qualité/.test(remark), remark);
    check(`${tag}: the choices are kept with the piece (96 kHz, 24 bits)`, (await prefs()).waveRate === 96000 && (await prefs()).waveBits === 24, JSON.stringify(await prefs()));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, `dialogue-wave-${tag}.png`) });
    await page.selectOption('[data-testid="export-frequence"]', '88200');
    check(`${tag}: 88,2 kHz carries the same remark; 44,1 kHz does not`, (await page.locator('[data-testid="export-note-frequence"]').count()) === 1 && (await (async () => (await page.selectOption('[data-testid="export-frequence"]', '44100'), await page.locator('[data-testid="export-note-frequence"]').count()))()) === 0);
    await page.selectOption('[data-testid="export-frequence"]', '48000');
    await page.click('.exp-duo [data-bits="16"]');
    // The sound of the loop line: whole bars as before, any other loop with its two points.
    const note = () => page.locator('.exp-carte[data-choix="loop"]').innerText();
    check(`${tag}: the window says « mesures 5–8 » for the demo's loop of whole bars`, (await note()).includes('mesures 5–8'), await note());
    await page.evaluate(() => {
      const f = window.__fabtice;
      const segs = f.store.getState().tempoMap.segments;
      const at = (b) => {
        const seg = segs.findLast((x) => x.beat <= b);
        return seg.time + ((b - seg.beat) * 60) / seg.bpm;
      };
      f.actions.setLoopRegion({ start: at(5), end: at(14.75) }); // beat 2 of bar 2, the 4th sixteenth of beat 3 of bar 4
    });
    await page.waitForFunction(() => document.querySelector('.exp-carte[data-choix="loop"]')?.textContent.includes('de 2.2 à 4.3 (4e double)'), null, { timeout: 3000 }).catch(() => {});
    check(`${tag}: … and « de 2.2 à 4.3 (4e double) » for a loop between beats`, (await note()).includes('de 2.2 à 4.3 (4e double)'), await note());
    // The format's own settings: Flac a line, MP3 its constant rate (320 by default, six choices from 96 to 320).
    await page.click('.exp-formats button[data-format="flac"]');
    check(`${tag}: Flac: no choice of rate or quantization, one line saying it is lossless`, (await page.locator('[data-testid="export-frequence"]').count()) === 0 && /Sans perte/.test(await page.locator('[data-testid="export-reglages-format"]').innerText()));
    await page.click('.exp-formats button[data-format="mp3"]');
    const kbps = await page.$$eval('[data-testid="export-debit"] option', (os) => os.map((o) => o.value));
    check(`${tag}: MP3: constant rate 320 chosen by default, among 96, 128, 160, 192, 256, 320`, (await page.inputValue('[data-testid="export-debit"]')) === '320' && kbps.join() === '96,128,160,192,256,320', kbps.join());
    await page.selectOption('[data-testid="export-debit"]', '192');
    check(`${tag}: the MP3 rate is kept with the piece`, (await prefs()).mp3Kbps === 192, JSON.stringify(await prefs()));
    await page.selectOption('[data-testid="export-debit"]', '320');
    await page.click('.exp-formats button[data-format="wav"]');
    // What leaves: the mix, or the tracks ticked; the box « Un fichier par piste » follows the number ticked.
    const sortie = () => page.locator('[data-testid="export-sortie"]').innerText();
    const box = page.locator('[data-testid="export-separes"]');
    check(`${tag}: the mix: one file, the box and the track list asleep`, (await box.isDisabled()) && (await page.locator('.exp-pistes input').first().isDisabled()) && /^Un fichier\s: Blues du dimanche – mélange\.wav$/.test(await sortie()), await sortie());
    await page.click('[data-testid="export-son"] [data-choix="tracks"]');
    const trackCount = await page.locator('.exp-pistes input').count();
    check(`${tag}: « Des pistes »: every track ticked, the box on and awake, the line says the archive`, trackCount >= 2 && (await page.locator('.exp-pistes input:checked').count()) === trackCount && (await box.isEnabled()) && (await box.isChecked()) && new RegExp(`^${trackCount} fichiers réunis dans Blues du dimanche – pistes\\.zip$`).test(await sortie()), await sortie());
    await page.screenshot({ path: path.join(out, `dialogue-pistes-${tag}.png`) });
    await box.uncheck();
    check(`${tag}: box off: one file mixing the ticked tracks, at their volumes (the line and the note say so)`, /^Un fichier\s: Blues du dimanche – mélange de \d+ pistes\.wav$/.test(await sortie()) && /un seul fichier/i.test(await page.locator('[data-testid="export-separes-note"]').innerText()) && (await prefs()).separate === false, await sortie());
    await page.screenshot({ path: path.join(out, `dialogue-pistes-un-fichier-${tag}.png`) });
    await box.check();
    // Down to one track: the box is of no concern (asleep), one file; none: nothing to export, the button asleep.
    const inputs = page.locator('.exp-pistes input');
    for (let i = 1; i < trackCount; i++) await inputs.nth(i).uncheck();
    check(`${tag}: one track ticked: the box asleep, one file named after the track, no archive`, (await box.isDisabled()) && /^Un fichier\s: Blues du dimanche – Voix\.wav$/.test(await sortie()) && /Une seule piste/.test(await page.locator('[data-testid="export-separes-note"]').innerText()), await sortie());
    await inputs.nth(0).uncheck();
    check(`${tag}: no track ticked: « Rien à exporter » and the button asleep`, (await page.locator('[data-testid="exporter-son"]').isDisabled()) && /Rien à exporter/.test(await sortie()), await sortie());
    await page.click('[data-testid="export-tout"]');
    check(`${tag}: « Tout cocher » ticks them all again`, (await page.locator('.exp-pistes input:checked').count()) === trackCount && (await page.locator('[data-testid="exporter-son"]').isEnabled()));
    check(`${tag}: the choices are kept with the piece (tracks, one file each)`, (await prefs()).what === 'tracks' && (await prefs()).separate === true, JSON.stringify(await prefs()));
    await page.click('[data-testid="export-son"] [data-choix="mix"]');
    check(`${tag}: no remark about the one-file box left over in the mix`, await box.isDisabled());
    await page.screenshot({ path: path.join(out, `dialogue-formats-${tag}.png`) });
    // An mp3 encoder whose wasm cannot be fetched: a calm sentence, a way back, and the other formats still work.
    await page.route(/mp3-.*\.wasm/, (route) => route.abort());
    await page.click('.exp-formats button[data-format="mp3"]');
    await page.click('[data-testid="exporter-son"]');
    await page.waitForSelector('.import-erreur', { timeout: 30000 });
    const msg = await page.locator('.import-erreur').innerText();
    check(`${tag}: encoder that cannot load: a calm message that names the way out`, /n’a pas pu être préparé/.test(msg) && /Wave/.test(msg), msg);
    await page.screenshot({ path: path.join(out, `dialogue-erreur-encodeur-${tag}.png`) });
    check(`${tag}: after the failure no worker is left`, await page.evaluate(() => window.__workers.made === window.__workers.ended), await page.evaluate(() => JSON.stringify(window.__workers)));
    await page.unroute(/mp3-.*\.wasm/);
    await page.click('.import-erreur ~ .import-actions button');
    await page.click('.exp-formats button[data-format="flac"]');
    await page.click('[data-testid="exporter-son"]');
    await page.waitForSelector('[data-testid="fichier-son"]', { timeout: 60000 });
    const link = await page.getAttribute('[data-testid="fichier-son"]', 'download');
    check(`${tag}: FLAC still works after the mp3 failure, named .flac`, link.endsWith('.flac'), link);
    await page.screenshot({ path: path.join(out, `dialogue-pret-flac-${tag}.png`) });
    // A real download of the mp3 through the link (the browser's own path).
    await page.click('button:has-text("Exporter autre chose")');
    await page.click('.exp-formats button[data-format="mp3"]');
    await page.click('[data-testid="exporter-son"]');
    await page.waitForSelector('[data-testid="fichier-son"]', { timeout: 60000 });
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid="fichier-son"]')]);
    const file = path.join(out, `telecharge-${tag}.mp3`);
    await download.saveAs(file);
    const bytes = fs.readFileSync(file);
    check(`${tag}: the mp3 downloads with its accented name and is a real mp3`, download.suggestedFilename() === 'Blues du dimanche – mélange.mp3' && readMp3Header(bytes).sync, download.suggestedFilename());
    await page.screenshot({ path: path.join(out, `dialogue-pret-mp3-${tag}.png`) });
    // A Wave at 96 kHz and 24 bits through the window, downloaded, read back.
    await page.click('button:has-text("Exporter autre chose")');
    await page.click('.exp-formats button[data-format="wav"]');
    await page.selectOption('[data-testid="export-frequence"]', '96000');
    await page.click('.exp-duo [data-bits="24"]');
    await page.click('[data-testid="exporter-son"]');
    await page.waitForSelector('[data-testid="fichier-son"]', { timeout: 60000 });
    const [dl96] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid="fichier-son"]')]);
    const file96 = path.join(out, `telecharge-${tag}-96k.wav`);
    await dl96.saveAs(file96);
    const w96 = readWavAny(fs.readFileSync(file96));
    const projectFrames = await page.evaluate(() => Math.round(window.__fabtice.store.getState().project.duration * 96000));
    check(`${tag}: the Wave downloads at 96 kHz, 24 bits, the whole length`, dl96.suggestedFilename() === 'Blues du dimanche – mélange.wav' && w96.rate === 96000 && w96.bits === 24 && Math.abs(w96.frames - projectFrames) <= 2 && w96.declared, `${w96.rate} Hz ${w96.bits} bits ${w96.frames} frames vs ${projectFrames}`);
    await page.screenshot({ path: path.join(out, `dialogue-pret-wave-${tag}.png`) });
    // The working state (mid-export), on a slow render.
    await page.click('button:has-text("Exporter autre chose")');
    await page.evaluate(() => {
      const f = window.__fabtice;
      const inner = f.lot3.renderer.getRenderer();
      f.lot3.renderer.replaceRenderer({ kind: inner.kind, supportsFormants: inner.supportsFormants, render: async (req) => (await new Promise((r) => setTimeout(r, 1500)), inner.render(req)) });
      f.actions.setTempoRatio(0.8);
    });
    await page.click('[data-testid="exporter-son"]');
    await page.waitForSelector('.import-etat');
    await page.screenshot({ path: path.join(out, `dialogue-en-cours-${tag}.png`) });
    check(`${tag}: no page errors in the dialog`, errors.length === 0, errors.join(' | '));
    await page.close();
  }
} finally {
  await browser.close();
  srv.close();
}
note(`files and screenshots: ${out}`);
if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nexport-audio: all checks passed');
