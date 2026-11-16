import { closeSync, fstatSync, mkdtempSync, openSync, readSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { demoSwingResult } from '../analysis/fromDemoSwing';
import { CHUNK, pcmFromChannels, type PcmAudio } from '../audio/pcm';
import { emptyCorrections } from '../model/corrections';
import { PROJECT_DOCUMENT_VERSION, type ProjectDocument } from '../model/document';
import type { Track } from '../model/project';
import type { SeparationSummary } from '../model/separation';
import { nodeFlacEncode } from '../test/flacEncode';
import { sampleDocument } from '../test/sampleDocument';
import { openProjectFile, PROJECT_FILE_VERSION, projectFileName, ProjectFileError, readReusableFile, ReuseError, trackEntries, writeProjectFile, type FlacEncode, type ProjectFileInput } from './fileFormat';
import { bytesSource, readZipDirectory, ZipStreamWriter, type ByteSink, type ByteSource } from './zip';

const SR = 48000;

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

let seed = 3;
const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5);
const tone = (frames: number, hz: number, amp = 0.4) => Float32Array.from({ length: frames }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR) + 0.01 * noise());

function track(id: string, name: string, stem: 'bass' | 'other' | 'vocals', frames: number): Track {
  return { id: `track-${id}`, name, role: stem === 'bass' ? 'basse' : stem === 'vocals' ? 'voix' : 'autres', mute: false, solo: stem === 'bass', volume: 0.7, stem, audio: { id, origin: 'separated', channels: 2, sampleRate: SR, frames } };
}

const summary = (id: string, modelId: string, modelName: string): SeparationSummary => ({
  id,
  modelId,
  modelName,
  modelSha256: 'a'.repeat(64),
  backend: 'cpu',
  fellBack: true,
  stems: ['bass', 'other'],
  kept: ['bass'],
  startedAt: '2026-11-13T10:00:00.000Z',
  finishedAt: '2026-11-13T10:03:00.000Z',
  computeSeconds: 180,
  pieceSeconds: 3,
});

/**
 * A worked-on piece: two separations (HTDemucs current, BS-RoFormer kept aside, each with its mix), one
 * stereo and one mono instrument each, and a kept render of the shown tracks.
 */
function workedOn(frames = SR * 3 + 123) {
  const base = sampleDocument();
  const pcm = new Map<string, PcmAudio>();
  const make = (id: string, hz: number, mono = false) => {
    const l = tone(frames, hz);
    pcm.set(id, pcmFromChannels(mono ? [l, l] : [l, tone(frames, hz * 1.5, 0.3)], SR));
  };
  make('a-bass', 55);
  make('a-other', 440, true);
  make('b-bass', 57);
  make('b-vocals', 330);
  make('r-0', 60);
  make('r-1', 450, true);
  const current = [track('a-bass', 'Basse', 'bass', frames), track('a-other', 'Autres', 'other', frames)];
  const other = [track('b-bass', 'Basse', 'bass', frames), { ...track('b-vocals', 'Voix', 'vocals', frames), mute: true }];
  const doc: ProjectDocument = {
    ...base,
    tracks: current,
    separation: { result: summary('a', 'htdemucs-6s', 'HTDemucs 6 sources'), showing: 'instruments', aside: base.tracks, others: [{ result: summary('b', 'bs-roformer-sw', 'BS-RoFormer SW'), tracks: other }] },
    corrections: { ...emptyCorrections(), key: { tonic: 3, mode: 'major' } as never },
    keptRender: {
      target: { semitones: 2, cents: -10, tempoRatio: 0.8, formants: false, audioKey: 'a-bass|a-other' },
      renderedAt: '2026-11-13T10:10:00.000Z',
      tracks: [
        { trackId: 'track-a-bass', audioId: 'r-0', frames, channels: 2 },
        { trackId: 'track-a-other', audioId: 'r-1', frames, channels: 2 },
      ],
    },
  };
  const originals = new Map([['audio-1', { bytes: Uint8Array.from({ length: 70_001 }, (_, i) => (i * 7) & 255).buffer, mimeType: 'audio/mpeg', fileName: 'Blues du dimanche.mp3' }]]);
  const tracks = new Map([...pcm].map(([id, p]) => [id, async () => p] as const));
  const input: ProjectFileInput = { document: doc, originals, tracks };
  return { input, pcm };
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

const write = async (input: ProjectFileInput) => {
  const sink = memorySink();
  const out = await writeProjectFile(input, sink, { encode: nodeFlacEncode, now: new Date('2026-11-15T08:00:00Z') });
  return { file: sink.bytes(), ...out };
};

describe('the .fab file', () => {
  it('round trip: document, original bytes untouched, every separation and the kept render to the sample, in FLAC', async () => {
    const { input, pcm } = workedOn();
    const { file, bytes } = await write(input);
    expect(file.length).toBe(bytes);
    expect(new TextDecoder().decode(file.subarray(30, 59))).toBe('mimetypeapplication/x-fabtice');
    const opened = await openProjectFile(bytesSource(file));
    await opened.verify();
    expect(opened.manifest.formatVersion).toBe(PROJECT_FILE_VERSION);
    expect(opened.document).toEqual(JSON.parse(JSON.stringify(input.document)));
    const original = await opened.readOriginal('audio-1');
    expect(new Uint8Array(original.bytes)).toEqual(new Uint8Array((input.originals.get('audio-1') as { bytes: ArrayBuffer }).bytes));
    for (const [id, p] of pcm) {
      const back = await opened.readTrack(id);
      expect(samePcm(back, p), id).toBe(true);
    }
    // FLAC: well under the 16-bit samples' size.
    const samples = [...pcm.values()].reduce((n, p) => n + p.frames * (p.mono ? 2 : 4), 0);
    expect(bytes).toBeLessThan(samples);
  });

  it('is an ordinary archive: each separation in its folder, the render apart, all in FLAC', async () => {
    const { file } = await write(workedOn().input);
    const names = (await readZipDirectory(bytesSource(file))).map((e) => e.name);
    expect(names).toEqual([
      'mimetype',
      'fabtice.json',
      'projet.json',
      'audio/Blues du dimanche.mp3',
      'separations/HTDemucs 6 sources/Basse.flac',
      'separations/HTDemucs 6 sources/Autres.flac',
      'separations/BS-RoFormer SW/Basse.flac',
      'separations/BS-RoFormer SW/Voix.flac',
      'rendu/Basse.flac',
      'rendu/Autres.flac',
    ]);
  });

  it('a piece never separated: just the document and the original', async () => {
    const base = sampleDocument();
    const { file } = await write({ document: base, originals: workedOn().input.originals, tracks: new Map() });
    const opened = await openProjectFile(bytesSource(file));
    expect(trackEntries(opened.document)).toEqual([]);
  });

  it('refuses to write a document that names an audio it was not given', async () => {
    const { input } = workedOn();
    await expect(writeProjectFile({ ...input, tracks: new Map() }, memorySink(), { encode: nodeFlacEncode })).rejects.toThrow(/no audio/);
  });

  it('opens a file whose document is from an older version (migrated, as the device copy is)', async () => {
    const { input } = workedOn();
    const old = JSON.parse(JSON.stringify(input.document)) as Record<string, unknown>;
    old.version = 3;
    delete old.metronome;
    delete old.markers;
    delete old.keptRender;
    const sep = old.separation as Record<string, unknown>;
    delete sep.others;
    const tracks = new Map([...input.tracks].filter(([id]) => id.startsWith('a-')));
    const { file } = await write({ ...input, document: old as unknown as ProjectDocument, tracks });
    const opened = await openProjectFile(bytesSource(file));
    expect(opened.document.version).toBe(PROJECT_DOCUMENT_VERSION);
    expect(opened.document.markers).toEqual({ loops: [] });
    expect(opened.document.separation.others).toEqual([]);
    expect(opened.document.keptRender).toBeNull();
  });

  it('opens a file of the published app (document version 5, analysis of version 1) with nothing lost, and writes version 6', async () => {
    const { input } = workedOn();
    const v5 = JSON.parse(JSON.stringify(input.document)) as Record<string, Record<string, unknown>>;
    v5.version = 5 as never;
    delete v5.corrections!.keyChanges;
    delete v5.corrections!.structure;
    const { keyChanges: _k, structure: _s, ...analysis } = demoSwingResult(3);
    v5.analysis = { ...analysis, version: 1 };
    const { file } = await write({ ...input, document: v5 as unknown as ProjectDocument });
    const opened = await openProjectFile(bytesSource(file));
    expect(opened.manifest.documentVersion).toBe(5);
    expect(opened.document.version).toBe(PROJECT_DOCUMENT_VERSION);
    expect(opened.document.analysis!.chords).toEqual(analysis.chords);
    expect(opened.document.corrections.key).toEqual({ tonic: 3, mode: 'major' });
    expect(opened.document.corrections.keyChanges).toBeNull();
    expect(opened.document.separation).toEqual(input.document.separation);
    const again = await write({ ...input, document: opened.document });
    const reopened = await openProjectFile(bytesSource(again.file));
    expect(reopened.manifest.documentVersion).toBe(6);
    expect(reopened.document).toEqual(opened.document);
  });

  it('says « too recent » for a later file layout or a later document', async () => {
    const { input } = workedOn();
    const { file } = await write({ ...input, document: { ...input.document, version: (PROJECT_DOCUMENT_VERSION + 1) as typeof PROJECT_DOCUMENT_VERSION } });
    expect(await errorCode(openProjectFile(bytesSource(file)))).toBe('too-recent');
    const sink = memorySink();
    const zip = new ZipStreamWriter(sink);
    const enc = (s: string) => new TextEncoder().encode(s) as Uint8Array<ArrayBuffer>;
    await zip.addSmall('mimetype', enc('application/x-fabtice'));
    await zip.addSmall('fabtice.json', enc(JSON.stringify({ format: 'fabtice', formatVersion: 3, audio: [], tracks: [] })));
    await zip.finish();
    expect(await errorCode(openProjectFile(bytesSource(sink.bytes())))).toBe('too-recent');
  });

  it('tells a damaged file from another kind of file, and finds damage before anything is replaced', async () => {
    const { input } = workedOn();
    const { file: good } = await write(input);
    expect(await errorCode(openProjectFile(bytesSource(new TextEncoder().encode('ID3 not a project at all, an mp3 maybe'))))).toBe('not-project');
    expect(await errorCode(openProjectFile(bytesSource(new Uint8Array(0))))).toBe('not-project');
    const other = memorySink();
    const zip = new ZipStreamWriter(other);
    await zip.addSmall('readme.txt', new TextEncoder().encode('hello') as Uint8Array<ArrayBuffer>);
    await zip.finish();
    expect(await errorCode(openProjectFile(bytesSource(other.bytes())))).toBe('not-project');
    for (const keep of [40, 2000, Math.floor(good.length / 2), good.length - 30, good.length - 1]) {
      expect(await errorCode(openProjectFile(bytesSource(good.subarray(0, keep))))).toBe('damaged');
    }
    // One byte changed in a FLAC track: the file opens, `verify` finds it, and so does reading the track.
    const entries = await readZipDirectory(bytesSource(good));
    const flac = entries.find((e) => e.name === 'separations/BS-RoFormer SW/Voix.flac')!;
    const flipped = good.slice();
    const at = flac.headerOffset + 30 + new TextEncoder().encode(flac.name).length + 900;
    flipped[at] = flipped[at]! ^ 0xff;
    const opened = await openProjectFile(bytesSource(flipped));
    expect(await errorCode(opened.verify())).toBe('damaged');
    expect(await errorCode(opened.readTrack('b-vocals'))).toBe('damaged');
  });

  it('names the file after the piece', () => {
    expect(projectFileName('Blue Bossa / take 2')).toBe('take 2.fab');
    expect(projectFileName('Lover Man')).toBe('Lover Man.fab');
    expect(projectFileName('  ')).toBe('Morceau.fab');
  });
});

// ---------------------------------------------------------------- « Enregistrer »: reusing the earlier file

describe('writing again over an earlier file', () => {
  /** The encoder, counting what it is given. */
  const counting = () => {
    const calls: number[] = [];
    const encode: FlacEncode = (pcm, o) => {
      calls.push(pcm.frames);
      return nodeFlacEncode(pcm, o);
    };
    return { encode, calls };
  };

  it('reuses every unchanged entry as it is: no track is encoded, the audio reads back identical', async () => {
    const { input, pcm } = workedOn();
    const first = await write(input);
    const reuse = await readReusableFile(bytesSource(first.file));
    expect(reuse).not.toBeNull();
    const spy = counting();
    const sink = memorySink();
    // Only the document changed (a title edit and a corrected key).
    const document = { ...input.document, project: { ...input.document.project, title: 'Blues du lundi' } };
    const out = await writeProjectFile({ ...input, document }, sink, { encode: spy.encode, reuse, now: new Date('2026-11-16T09:00:00Z') });
    expect(spy.calls).toEqual([]);
    expect(out.encoded).toEqual([]);
    expect(out.reused.length).toBe(trackEntries(document).length + 1);
    const file = sink.bytes();
    const opened = await openProjectFile(bytesSource(file));
    await opened.verify();
    expect(opened.document.project.title).toBe('Blues du lundi');
    for (const [id, p] of pcm) expect(samePcm(await opened.readTrack(id), p), id).toBe(true);
    expect(new Uint8Array((await opened.readOriginal('audio-1')).bytes)).toEqual(new Uint8Array((input.originals.get('audio-1') as { bytes: ArrayBuffer }).bytes));
    // The audio entries are byte for byte those of the first file.
    const a = await readZipDirectory(bytesSource(first.file));
    const b = await readZipDirectory(bytesSource(file));
    for (const e of a.filter((x) => x.name.endsWith('.flac') || x.name.startsWith('audio/'))) {
      const f = b.find((x) => x.name === e.name)!;
      expect([f.crc, f.size]).toEqual([e.crc, e.size]);
    }
  });

  it('encodes only what is new (a track added, a render replaced) and copies the rest', async () => {
    const { input } = workedOn();
    const first = await write(input);
    const reuse = await readReusableFile(bytesSource(first.file));
    // A new render: new audio ids; the separations stay.
    const frames = input.document.keptRender!.tracks[0]!.frames;
    const fresh = new Map<string, PcmAudio>([
      ['r2-0', pcmFromChannels([tone(frames, 70), tone(frames, 71)], SR)],
      ['r2-1', pcmFromChannels([tone(frames, 90), tone(frames, 91)], SR)],
    ]);
    const document: ProjectDocument = { ...input.document, keptRender: { ...input.document.keptRender!, tracks: input.document.keptRender!.tracks.map((t, i) => ({ ...t, audioId: `r2-${i}` })) } };
    const tracks = new Map(input.tracks);
    tracks.delete('r-0');
    tracks.delete('r-1');
    for (const [id, p] of fresh) tracks.set(id, async () => p);
    const spy = counting();
    const sink = memorySink();
    const out = await writeProjectFile({ document, originals: input.originals, tracks }, sink, { encode: spy.encode, reuse });
    expect(spy.calls.length).toBe(2);
    expect(out.encoded.sort()).toEqual(['r2-0', 'r2-1']);
    expect(out.reused.some((n) => n.startsWith('separations/'))).toBe(true);
    const opened = await openProjectFile(bytesSource(sink.bytes()));
    await opened.verify();
    for (const [id, p] of fresh) expect(samePcm(await opened.readTrack(id), p), id).toBe(true);
  });

  it('does not reuse a track whose length or format is not the same (same id, other audio)', async () => {
    const { input } = workedOn();
    const first = await write(input);
    const reuse = await readReusableFile(bytesSource(first.file));
    const changed = { ...input.document, tracks: input.document.tracks.map((t, i) => (i === 0 ? { ...t, audio: { ...t.audio, frames: t.audio.frames + 1 } } : t)) };
    const pcm = pcmFromChannels([tone(changed.tracks[0]!.audio.frames, 55), tone(changed.tracks[0]!.audio.frames, 56)], SR);
    const tracks = new Map(input.tracks);
    tracks.set(changed.tracks[0]!.audio.id, async () => pcm);
    const spy = counting();
    await writeProjectFile({ document: changed, originals: input.originals, tracks }, memorySink(), { encode: spy.encode, reuse });
    expect(spy.calls).toEqual([pcm.frames]);
  });

  it('reads the original from the device only when the earlier file does not hold it', async () => {
    const { input } = workedOn();
    const first = await write(input);
    const reuse = await readReusableFile(bytesSource(first.file));
    const stored = input.originals.get('audio-1') as { bytes: ArrayBuffer; mimeType: string; fileName: string };
    let loads = 0;
    const lazy = new Map([['audio-1', { fileName: stored.fileName, mimeType: stored.mimeType, byteLength: stored.bytes.byteLength, load: async () => (loads++, stored) }]]);
    await writeProjectFile({ ...input, originals: lazy }, memorySink(), { encode: nodeFlacEncode, reuse });
    expect(loads).toBe(0);
    await writeProjectFile({ ...input, originals: lazy }, memorySink(), { encode: nodeFlacEncode, reuse: null });
    expect(loads).toBe(1);
  });

  it('an entry that no longer reads back as recorded is a ReuseError, never a silently wrong file', async () => {
    const { input } = workedOn();
    const first = await write(input);
    const reuse = (await readReusableFile(bytesSource(first.file)))!;
    // The earlier file changed under us after its directory was read.
    const flipped = first.file.slice();
    const flac = reuse.entries.get('separations/HTDemucs 6 sources/Basse.flac')!;
    flipped[flac.headerOffset + 30 + new TextEncoder().encode(flac.name).length + 500] = flipped[flac.headerOffset + 30 + new TextEncoder().encode(flac.name).length + 500]! ^ 0xff;
    const damaged = { ...reuse, source: bytesSource(flipped) };
    await expect(writeProjectFile(input, memorySink(), { encode: nodeFlacEncode, reuse: damaged })).rejects.toBeInstanceOf(ReuseError);
    // The earlier file gone or cut short.
    const cut = { ...reuse, source: { size: 10, read: async () => { throw new Error('gone'); } } };
    await expect(writeProjectFile(input, memorySink(), { encode: nodeFlacEncode, reuse: cut })).rejects.toBeInstanceOf(ReuseError);
  });

  it('an earlier file that is not a project, or is cut short, is simply not reused', async () => {
    const { input } = workedOn();
    const first = await write(input);
    expect(await readReusableFile(bytesSource(new Uint8Array(1000)))).toBeNull();
    expect(await readReusableFile(bytesSource(first.file.subarray(0, first.file.length - 100)))).toBeNull();
  });
});

// ---------------------------------------------------------------- size, time and memory

function diskFile() {
  const dir = mkdtempSync(path.join(tmpdir(), 'fabtice-format-'));
  const file = path.join(dir, 'big.fab');
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
 * The owner's measure: a piece of `minutes` with six stereo instruments, FLAC in the `.fab` against the 16-bit
 * blocks the device keeps. Music-like signal (tones, a little noise), so FLAC has real work to do.
 */
async function measure(minutes: number) {
  const frames = Math.round(SR * 60 * minutes);
  const base = sampleDocument();
  const stems = ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'] as const;
  const pcm = new Map<string, PcmAudio>();
  const tracks: Track[] = stems.map((stem, i) => {
    const id = `m-${stem}`;
    pcm.set(id, pcmFromChannels([tone(frames, 110 * (i + 1), 0.3), tone(frames, 165 * (i + 1), 0.25)], SR));
    return { id: `t-${stem}`, name: stem, role: 'autres', mute: false, solo: false, volume: 1, stem, audio: { id, origin: 'separated', channels: 2, sampleRate: SR, frames } } as Track;
  });
  const doc: ProjectDocument = { ...base, tracks, separation: { result: { ...summary('m', 'htdemucs-6s', 'HTDemucs 6 sources'), stems: [...stems], kept: [...stems] }, showing: 'instruments', aside: base.tracks, others: [] } };
  const originals = new Map([['audio-1', { bytes: new Uint8Array(4_000_000).fill(3).buffer, mimeType: 'audio/mpeg', fileName: 'long.mp3' }]]);
  const blocks = [...pcm.values()].reduce((n, p) => n + p.bytes, 0);
  const disk = diskFile();
  try {
    global.gc?.();
    const before = process.memoryUsage();
    let peak = 0;
    const sample = () => {
      const m = process.memoryUsage();
      peak = Math.max(peak, m.rss - before.rss);
    };
    const watch = setInterval(sample, 5);
    const t0 = performance.now();
    const { bytes } = await writeProjectFile({ document: doc, originals, tracks: new Map([...pcm].map(([id, p]) => [id, async () => p] as const)) }, disk.sink, { encode: nodeFlacEncode, tick: async () => sample() });
    const saveMs = performance.now() - t0;
    const savePeak = peak;
    peak = 0;
    const t1 = performance.now();
    const opened = await openProjectFile(disk.source());
    await opened.verify();
    for (const id of pcm.keys()) await opened.readTrack(id);
    const openMs = performance.now() - t1;
    sample();
    clearInterval(watch);
    // eslint-disable-next-line no-console
    console.log(
      `[fab] ${minutes} min, 6 stereo instruments: blocks ${Math.round(blocks / 1e6)} MB, .fab ${Math.round(bytes / 1e6)} MB (${Math.round((100 * bytes) / blocks)} %); ` +
        `saved in ${(saveMs / 1000).toFixed(1)} s (one encoder; resident memory +${Math.round(savePeak / 1e6)} MB), ` +
        `checked and decoded in ${(openMs / 1000).toFixed(1)} s (resident memory +${Math.round(peak / 1e6)} MB, the decoded samples included)`,
    );
    return { bytes, blocks };
  } finally {
    disk.done();
  }
}

describe('FLAC in the .fab: size, time, memory', () => {
  it('four minutes, six instruments', { timeout: 600_000 }, async () => {
    const { bytes, blocks } = await measure(4);
    expect(bytes).toBeLessThan(blocks);
  });
  it.runIf(process.env.FABTICE_FAB_LONG === '1')('twelve minutes, six instruments', { timeout: 1_800_000 }, async () => {
    await measure(12);
  });
});
