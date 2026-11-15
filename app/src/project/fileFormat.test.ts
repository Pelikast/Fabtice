import { mkdtempSync, openSync, closeSync, readSync, rmSync, writeSync, fstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHUNK, pcmFromChannels, type Chunk, type PcmAudio } from '../audio/pcm';
import { emptyCorrections } from '../model/corrections';
import type { ProjectDocument } from '../model/document';
import type { Track } from '../model/project';
import { sampleDocument } from '../test/sampleDocument';
import {
  instrumentsFileBytes,
  openProjectFile,
  PROJECT_FILE_VERSION,
  projectFileName,
  projectFileSize,
  ProjectFileError,
  writeProjectFile,
  type ProjectFileInput,
} from './fileFormat';
import { bytesSource, readZipDirectory, ZipStreamWriter, type ByteSink, type ByteSource } from './zip';

const SR = 48000;

/** Collects what the writer produces. */
function memorySink(): ByteSink & { bytes(): Uint8Array } {
  const parts: Uint8Array[] = [];
  return {
    write: (c) => void parts.push(c),
    bytes: () => {
      const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let o = 0;
      for (const p of parts) {
        out.set(p, o);
        o += p.length;
      }
      return out;
    },
  };
}

const tone = (frames: number, hz: number, amp = 0.4) => Float32Array.from({ length: frames }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));

function separatedTrack(id: string, name: string, stem: 'bass' | 'other', frames: number, channels: number): Track {
  return { id: `track-${id}`, name, role: stem === 'bass' ? 'basse' : 'autres', mute: false, solo: stem === 'bass', volume: 0.7, stem, audio: { id, origin: 'separated', channels, sampleRate: SR, frames } };
}

/** A separated piece: two instruments shown (one stereo, one mono), the whole piece aside, chords corrected by hand. */
function separatedInput(frames = SR * 3 + 123): { input: ProjectFileInput; bass: PcmAudio; other: PcmAudio } {
  const base = sampleDocument();
  const bass = pcmFromChannels([tone(frames, 55), tone(frames, 82)], SR);
  const other = pcmFromChannels([tone(frames, 440, 0.2), tone(frames, 440, 0.2)], SR);
  expect(other.mono).toBe(true);
  const doc: ProjectDocument = {
    ...base,
    tracks: [separatedTrack('sep-bass', 'Basse', 'bass', frames, 2), separatedTrack('sep-other', 'Autres', 'other', frames, 2)],
    separation: {
      result: {
        id: 'sep',
        modelId: 'htdemucs-6s',
        modelName: 'HTDemucs 6 sources',
        modelSha256: 'a'.repeat(64),
        backend: 'cpu',
        fellBack: true,
        stems: ['bass', 'other'],
        kept: ['bass'],
        startedAt: '2026-11-13T10:00:00.000Z',
        finishedAt: '2026-11-13T10:03:00.000Z',
        computeSeconds: 180,
        pieceSeconds: frames / SR,
      },
      showing: 'instruments',
      aside: base.tracks,
    },
    corrections: { ...emptyCorrections(), key: { tonic: 3, mode: 'major' } as never },
  };
  const originals = new Map([['audio-1', { bytes: Uint8Array.from({ length: 70_001 }, (_, i) => (i * 7) & 255).buffer, mimeType: 'audio/mpeg', fileName: 'Blues du dimanche.mp3' }]]);
  return { input: { document: doc, originals, instruments: new Map([['sep-bass', bass], ['sep-other', other]]) }, bass, other };
}

function samePcm(a: PcmAudio, b: PcmAudio): boolean {
  if (a.frames !== b.frames || a.mono !== b.mono || a.channelCount !== b.channelCount || a.chunks.length !== b.chunks.length) return false;
  return a.chunks.every((c, i) => {
    const d = b.chunks[i]!;
    const n = Math.min(CHUNK, a.frames - i * CHUNK);
    for (let k = 0; k < n; k++) if (c.l[k] !== d.l[k] || (c.r?.[k] ?? 0) !== (d.r?.[k] ?? 0)) return false;
    return true;
  });
}

async function errorCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return e instanceof ProjectFileError ? e.code : `other: ${String(e)}`;
  }
  return 'no error';
}

describe('the .fabtice file', () => {
  it('round trip: document, original bytes untouched, instruments to the sample', async () => {
    const { input, bass, other } = separatedInput();
    const sink = memorySink();
    const { bytes } = await writeProjectFile(input, sink, { now: new Date('2026-11-15T08:00:00Z') });
    const file = sink.bytes();
    expect(file.length).toBe(bytes);
    expect(projectFileSize(input)).toBe(bytes);
    // The fixed signature: « PK », then the mimetype entry and its content at byte 30.
    expect(new TextDecoder().decode(file.subarray(30, 59))).toBe('mimetypeapplication/x-fabtice');

    const opened = await openProjectFile(bytesSource(file));
    expect(opened.manifest.formatVersion).toBe(PROJECT_FILE_VERSION);
    expect(opened.document).toEqual(JSON.parse(JSON.stringify(input.document)));
    const original = await opened.readOriginal('audio-1');
    expect(new Uint8Array(original.bytes)).toEqual(new Uint8Array(input.originals.get('audio-1')!.bytes));
    expect(original.fileName).toBe('Blues du dimanche.mp3');
    expect(samePcm(await opened.readInstrument('sep-bass'), bass)).toBe(true);
    const back = await opened.readInstrument('sep-other');
    expect(back.mono).toBe(true);
    expect(back.channelCount).toBe(2);
    expect(samePcm(back, other)).toBe(true);
  });

  it('is an ordinary archive: the original and the instruments can be taken out with any tool', async () => {
    const { input } = separatedInput();
    const sink = memorySink();
    await writeProjectFile(input, sink);
    const names = (await readZipDirectory(bytesSource(sink.bytes()))).map((e) => e.name);
    expect(names).toEqual(['mimetype', 'fabtice.json', 'projet.json', 'audio/Blues du dimanche.mp3', 'instruments/Basse.wav', 'instruments/Autres.wav']);
  });

  it('without the instruments: the size says what they add', async () => {
    const { input, bass, other } = separatedInput();
    const whole = { ...input, document: { ...input.document, tracks: input.document.separation.aside, separation: { result: null, showing: 'whole' as const, aside: [] } }, instruments: new Map() };
    expect(projectFileSize(input) - projectFileSize(whole)).toBeGreaterThan(instrumentsFileBytes([bass, other]));
    const sink = memorySink();
    await writeProjectFile(whole, sink);
    const opened = await openProjectFile(bytesSource(sink.bytes()));
    expect(opened.instrumentIds).toEqual([]);
    expect(opened.document.separation.result).toBeNull();
  });

  it('refuses to write a document that names an audio it was not given', async () => {
    const { input } = separatedInput();
    await expect(writeProjectFile({ ...input, instruments: new Map() }, memorySink())).rejects.toThrow(/no audio/);
  });

  it('opens a file whose document is from an older version (migrated, as the device copy is)', async () => {
    const { input } = separatedInput();
    const old = JSON.parse(JSON.stringify(input.document)) as Record<string, unknown>;
    old.version = 3;
    delete old.metronome;
    delete old.markers;
    const sink = memorySink();
    await writeProjectFile({ ...input, document: old as unknown as ProjectDocument }, sink);
    const opened = await openProjectFile(bytesSource(sink.bytes()));
    expect(opened.document.version).toBe(4);
    expect(opened.document.markers).toEqual({ loops: [] });
    expect(opened.document.metronome.countInBars).toBe(0);
  });

  it('says « too recent » for a later file layout or a later document', async () => {
    const { input } = separatedInput();
    const newerDoc = memorySink();
    await writeProjectFile({ ...input, document: { ...input.document, version: 5 as 4 } }, newerDoc);
    expect(await errorCode(openProjectFile(bytesSource(newerDoc.bytes())))).toBe('too-recent');

    // A later layout: same entries, manifest version 2.
    const sink = memorySink();
    const zip = new ZipStreamWriter(sink);
    const enc = (s: string) => new TextEncoder().encode(s) as Uint8Array<ArrayBuffer>;
    await zip.addSmall('mimetype', enc('application/x-fabtice'));
    await zip.addSmall('fabtice.json', enc(JSON.stringify({ format: 'fabtice', formatVersion: 2, audio: [], instruments: [] })));
    await zip.finish();
    expect(await errorCode(openProjectFile(bytesSource(sink.bytes())))).toBe('too-recent');
  });

  it('tells a damaged file from another kind of file', async () => {
    const { input } = separatedInput();
    const sink = memorySink();
    await writeProjectFile(input, sink);
    const good = sink.bytes();

    expect(await errorCode(openProjectFile(bytesSource(new TextEncoder().encode('ID3 not a project at all, an mp3 maybe'))))).toBe('not-project');
    expect(await errorCode(openProjectFile(bytesSource(new Uint8Array(0))))).toBe('not-project');
    // Any other archive is not a project.
    const other = memorySink();
    const zip = new ZipStreamWriter(other);
    await zip.addSmall('readme.txt', new TextEncoder().encode('hello') as Uint8Array<ArrayBuffer>);
    await zip.finish();
    expect(await errorCode(openProjectFile(bytesSource(other.bytes())))).toBe('not-project');

    // Cut short anywhere: damaged, never a crash.
    for (const keep of [40, 2000, Math.floor(good.length / 2), good.length - 30, good.length - 1]) {
      expect(await errorCode(openProjectFile(bytesSource(good.subarray(0, keep))))).toBe('damaged');
    }

    // One byte changed in an instrument: the file opens, the instrument is refused by its checksum.
    const flipped = good.slice();
    flipped[good.length - 2000] = flipped[good.length - 2000]! ^ 0xff;
    const opened = await openProjectFile(bytesSource(flipped));
    expect(await errorCode(opened.readInstrument('sep-other'))).toBe('damaged');
    // In the original audio.
    const flippedAudio = good.slice();
    const entry = (await readZipDirectory(bytesSource(good))).find((e) => e.name.startsWith('audio/'))!;
    const at = entry.headerOffset + 30 + new TextEncoder().encode(entry.name).length + 500;
    flippedAudio[at] = flippedAudio[at]! ^ 0xff;
    expect(await errorCode((await openProjectFile(bytesSource(flippedAudio))).readOriginal('audio-1'))).toBe('damaged');

  });

  it('a document of the wrong shape inside a well-formed file is damaged', async () => {
    const sink = memorySink();
    const zip = new ZipStreamWriter(sink);
    const enc = (s: string) => new TextEncoder().encode(s) as Uint8Array<ArrayBuffer>;
    await zip.addSmall('mimetype', enc('application/x-fabtice'));
    await zip.addSmall('fabtice.json', enc(JSON.stringify({ format: 'fabtice', formatVersion: 1, audio: [], instruments: [] })));
    await zip.addSmall('projet.json', enc(JSON.stringify({ ...sampleDocument(), tracks: [{ nonsense: true }] })));
    await zip.finish();
    expect(await errorCode(openProjectFile(bytesSource(sink.bytes())))).toBe('damaged');
    // And a document that names an audio the file does not hold.
    const sink2 = memorySink();
    const zip2 = new ZipStreamWriter(sink2);
    await zip2.addSmall('mimetype', enc('application/x-fabtice'));
    await zip2.addSmall('fabtice.json', enc(JSON.stringify({ format: 'fabtice', formatVersion: 1, audio: [], instruments: [] })));
    await zip2.addSmall('projet.json', enc(JSON.stringify(sampleDocument())));
    await zip2.finish();
    expect(await errorCode(openProjectFile(bytesSource(sink2.bytes())))).toBe('damaged');
  });

  it('names the file after the piece', () => {
    expect(projectFileName('Blue Bossa / take 2')).toBe('take 2.fabtice');
    expect(projectFileName('Lover Man')).toBe('Lover Man.fabtice');
    expect(projectFileName('  ')).toBe('Morceau.fabtice');
  });
});

// ---------------------------------------------------------------- size and memory

/** A file on disk as a sink and as a source. */
function diskFile() {
  const dir = mkdtempSync(path.join(tmpdir(), 'fabtice-format-'));
  const file = path.join(dir, 'big.fabtice');
  const fd = openSync(file, 'w+');
  const sink: ByteSink = { write: (c) => void writeSync(fd, c) };
  const source = (): ByteSource => ({
    size: fstatSync(fd).size,
    read: async (offset, length) => {
      const out = new Uint8Array(length);
      const n = readSync(fd, out, 0, length, offset);
      return out.subarray(0, n);
    },
  });
  return { sink, source, done: () => (closeSync(fd), rmSync(dir, { recursive: true, force: true })) };
}

/**
 * A long stereo instrument whose chunks all share one buffer: hundreds of MB
 * of samples to write while holding one chunk (the input itself costs nothing).
 */
function hugeTrack(chunks: number): PcmAudio {
  const l = new Int16Array(CHUNK);
  const r = new Int16Array(CHUNK);
  for (let i = 0; i < CHUNK; i++) {
    l[i] = (i * 13) & 0x7fff;
    r[i] = -((i * 7) & 0x7fff);
  }
  const one: Chunk = { l, r };
  const list = new Array<Chunk>(chunks).fill(one);
  return { sampleRate: SR, frames: chunks * CHUNK, channelCount: 2, mono: false, chunks: list, bytes: chunks * CHUNK * 4 };
}

describe('a file of several hundred MB, written and read piece by piece', () => {
  it('never holds the file in memory', { timeout: 300_000 }, async () => {
    const chunks = 2400; // 2400 × 128 KiB = 315 MB of samples
    const big = hugeTrack(chunks);
    const base = sampleDocument();
    const doc: ProjectDocument = {
      ...base,
      tracks: [separatedTrack('big', 'Basse', 'bass', big.frames, 2)],
      separation: { result: separatedInput().input.document.separation.result, showing: 'instruments', aside: base.tracks },
    };
    const originals = new Map([['audio-1', { bytes: new Uint8Array(4_000_000).fill(3).buffer, mimeType: 'audio/mpeg', fileName: 'long.mp3' }]]);
    const disk = diskFile();
    try {
      global.gc?.();
      const before = process.memoryUsage();
      let peak = 0;
      const sample = () => {
        const m = process.memoryUsage();
        peak = Math.max(peak, m.arrayBuffers - before.arrayBuffers, m.rss - before.rss);
      };
      const watch = setInterval(sample, 5);
      const t0 = performance.now();
      const { bytes } = await writeProjectFile({ document: doc, originals, instruments: new Map([['big', big]]) }, disk.sink, { tick: async () => sample() });
      const writeMs = performance.now() - t0;
      sample();
      const writePeak = peak;
      expect(bytes).toBeGreaterThan(300_000_000);

      // Reading back: checked against the CRC, slice by slice, into a track (the only real allocation: the samples themselves).
      peak = 0;
      const t1 = performance.now();
      const opened = await openProjectFile(disk.source());
      const back = await opened.readInstrument('big');
      const readMs = performance.now() - t1;
      sample();
      clearInterval(watch);
      expect(back.frames).toBe(big.frames);
      expect(back.chunks[chunks - 1]!.l[CHUNK - 1]).toBe(l(CHUNK - 1));
      expect(back.chunks[1234]!.r![777]).toBe(-((777 * 7) & 0x7fff));
      const samples = back.bytes;
      // eslint-disable-next-line no-console
      console.log(`[format] ${Math.round(bytes / 1e6)} MB written in ${Math.round(writeMs)} ms (peak +${Math.round(writePeak / 1e6)} MB), read in ${Math.round(readMs)} ms (peak +${Math.round(peak / 1e6)} MB, of which ${Math.round(samples / 1e6)} MB are the samples read)`);
      // Writing holds a few slices, not the file.
      expect(writePeak).toBeLessThan(80_000_000);
      // Reading holds the samples read, plus a few slices.
      expect(peak).toBeLessThan(samples + 80_000_000);
    } finally {
      disk.done();
    }
    function l(i: number) {
      return (i * 13) & 0x7fff;
    }
  });
});
