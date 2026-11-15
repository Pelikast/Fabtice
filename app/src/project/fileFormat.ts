// The `.fab` project file (owner's decisions of 15 November): one file the
// user can keep, copy and send, holding the project document, the original
// audio as it was imported (never re-encoded), EVERY separation made on the
// piece (one per tool) and the last applied render, these in lossless FLAC.
// The layout is described in FORMAT.md (French).
//
// Written and read piece by piece (`zip.ts`): the writer hands its bytes to a
// sink as they are produced; the reader reads ranges of the file. The FLAC
// tracks are encoded by libFLAC (the export's WebAssembly encoder, in a worker)
// and decoded by `audio/flac/decode.ts` straight into the app's 16-bit
// blocks: never a Float32 copy of a track, never the whole file in memory
// (except the original audio, which is decoded whole anyway, as an import does).

import { CHUNK, newChunkChannel, pcmFromChunks, type Chunk, type PcmAudio } from '../audio/pcm';
import { FlacDecoder, FlacError } from '../audio/flac/decode';
import { PROJECT_DOCUMENT_VERSION, type ProjectDocument } from '../model/document';
import type { Track } from '../model/project';
import type { StoredAudio } from '../storage/ProjectStorage';
import { readDocument } from '../storage/documentFormat';
import { readEntry, readEntryBytes, readZipDirectory, ZipFormatError, ZipStreamWriter, type ByteSink, type ByteSource, type ZipEntryInfo } from './zip';

/** First entry of every `.fab` file, stored as is: its name and content sit at fixed offsets (bytes 30 to 58). */
export const MIMETYPE_ENTRY = 'mimetype';
export const PROJECT_MIME = 'application/x-fabtice';
export const MANIFEST_ENTRY = 'fabtice.json';
export const DOCUMENT_ENTRY = 'projet.json';
export const FILE_EXTENSION = '.fab';

/**
 * Version of the file's layout (the entries and the manifest), not of the
 * project document inside, which has its own (`ProjectDocument.version`,
 * migrated as the device's copy is). 2: FLAC tracks, every separation, the
 * kept render (1, with WAV instruments, was never published).
 */
export const PROJECT_FILE_VERSION = 2;

export interface ManifestAudio {
  /** `AudioRef.id` of the track(s) it is the audio of. */
  id: string;
  entry: string;
  fileName: string;
  mimeType: string;
  bytes: number;
}

/** A track in FLAC (16-bit, lossless): a separated instrument or a track of the kept render. */
export interface ManifestTrack {
  /** Its audio id: `AudioRef.id` of a separated track, or `KeptRender.tracks[].audioId`. */
  id: string;
  kind: 'separated' | 'render';
  entry: string;
  frames: number;
  sampleRate: number;
  /** Channels as made (1 or 2). */
  channelCount: 1 | 2;
  /** One channel written (both equal): the FLAC is mono. */
  mono: boolean;
}

export interface ProjectManifest {
  format: 'fabtice';
  formatVersion: number;
  /** Version of the document inside (informative: the document says it itself). */
  documentVersion: number;
  title: string;
  savedAt: string;
  audio: ManifestAudio[];
  tracks: ManifestTrack[];
}

export type ProjectFileErrorCode =
  /** Not a Fabtice project at all (another kind of file). */
  | 'not-project'
  /** A Fabtice project, but cut short or damaged. */
  | 'damaged'
  /** Written by a later version of Fabtice. */
  | 'too-recent'
  /** Over 4 GB: cannot be written. */
  | 'too-large';

export class ProjectFileError extends Error {
  constructor(
    readonly code: ProjectFileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectFileError';
  }
}

// ---------------------------------------------------------------- names

/** A file name safe in an archive and on every system (accents kept). */
export function safeEntryName(name: string, fallback: string): string {
  const cleaned = name
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  return (cleaned || fallback).slice(0, 120);
}

/** The name proposed for the file: the piece's title, cleaned, with the extension. */
export function projectFileName(title: string): string {
  return `${safeEntryName(title, 'Morceau')}${FILE_EXTENSION}`;
}

/** Where each FLAC track goes in the archive: `separations/<outil>/<instrument>.flac`, `rendu/<piste>.flac`. */
export function trackEntries(doc: ProjectDocument): { id: string; kind: 'separated' | 'render'; entry: string }[] {
  const out: { id: string; kind: 'separated' | 'render'; entry: string }[] = [];
  const used = new Set<string>();
  const unique = (dir: string, name: string) => {
    let entry = `${dir}/${name}.flac`;
    for (let i = 2; used.has(entry.toLowerCase()); i++) entry = `${dir}/${name} ${i}.flac`;
    used.add(entry.toLowerCase());
    return entry;
  };
  const sep = doc.separation;
  const current = [...doc.tracks, ...sep.aside].filter((tr) => tr.audio.origin === 'separated');
  const sets: { tool: string; tracks: Track[] }[] = [];
  if (sep.result) sets.push({ tool: sep.result.modelName, tracks: current });
  for (const o of sep.others ?? []) sets.push({ tool: o.result.modelName, tracks: o.tracks });
  for (const set of sets) {
    const dir = `separations/${safeEntryName(set.tool, 'outil')}`;
    for (const tr of set.tracks) out.push({ id: tr.audio.id, kind: 'separated', entry: unique(dir, safeEntryName(tr.name, 'instrument')) });
  }
  const names = new Map(doc.tracks.map((tr) => [tr.id, tr.name]));
  for (const t of doc.keptRender?.tracks ?? []) out.push({ id: t.audioId, kind: 'render', entry: unique('rendu', safeEntryName(names.get(t.trackId) ?? 'piste', 'piste')) });
  return out;
}

// ---------------------------------------------------------------- writing

/** Encodes a track in FLAC (16-bit, lossless; mono when `pcm.mono`). The app's is libFLAC in a worker. */
export type FlacEncode = (pcm: PcmAudio, options: { onProgress?: (fraction: number) => void; signal?: AbortSignal }) => Promise<Blob>;

export interface ProjectFileInput {
  document: ProjectDocument;
  /** The original audio of each original track, by `AudioRef.id`. */
  originals: ReadonlyMap<string, StoredAudio>;
  /**
   * The samples of every FLAC track the document names (`trackEntries`), by
   * audio id, each read when it is its turn (from memory or the device) and
   * let go after: only a few are held at a time.
   */
  tracks: ReadonlyMap<string, () => Promise<PcmAudio>>;
}

export interface WriteOptions {
  encode: FlacEncode;
  now?: Date;
  /** 0…1: the FLAC encoding (the long part), then the writing. */
  onProgress?: (fraction: number) => void;
  /** Lets the page breathe between slices (the app passes `yieldToMain`). */
  tick?: () => Promise<void>;
  signal?: AbortSignal;
  /** Tracks encoded at the same time (one worker each). */
  parallel?: number;
}

const json = (v: unknown) => new TextEncoder().encode(JSON.stringify(v, null, 1)) as Uint8Array<ArrayBuffer>;
const SLICE = 4 * 1024 * 1024;

/**
 * Writes the project file into `sink`, piece by piece. Rejects with
 * `ProjectFileError('too-large')` when the file would pass 4 GB, or with an
 * `AbortError` when `signal` is aborted.
 */
export async function writeProjectFile(input: ProjectFileInput, sink: ByteSink, options: WriteOptions): Promise<{ bytes: number; manifest: ProjectManifest }> {
  const now = options.now ?? new Date();
  const doc = input.document;
  const tick = options.tick ?? (async () => {});
  const aborted = () => {
    if (options.signal?.aborted) throw new DOMException('cancelled', 'AbortError');
  };
  for (const tr of [...doc.tracks, ...doc.separation.aside]) {
    if (tr.audio.origin !== 'separated' && !input.originals.has(tr.audio.id)) throw new Error(`no audio for track ${tr.id}`);
  }
  const planned = trackEntries(doc);
  for (const p of planned) if (!input.tracks.has(p.id)) throw new Error(`no audio for ${p.entry}`);

  // 1. The FLAC tracks, a few at a time (the encoding is the long part): each Blob may live on disk.
  const encoded = new Map<string, { blob: Blob; pcm: Omit<PcmAudio, 'chunks'> }>();
  const fractions = new Array<number>(planned.length).fill(0);
  const report = () => options.onProgress?.(0.95 * (planned.length ? fractions.reduce((a, b) => a + b, 0) / planned.length : 1));
  let next = 0;
  const lane = async () => {
    while (next < planned.length) {
      const i = next++;
      aborted();
      const p = planned[i]!;
      const pcm = await input.tracks.get(p.id)!();
      const view: PcmAudio = pcm.mono ? { ...pcm, channelCount: 1 } : pcm;
      const blob = await options.encode(view, {
        signal: options.signal,
        onProgress: (f) => {
          fractions[i] = Math.min(1, Math.max(fractions[i]!, f));
          report();
        },
      });
      fractions[i] = 1;
      report();
      const { chunks: _c, ...meta } = pcm;
      encoded.set(p.id, { blob, pcm: meta });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(options.parallel ?? 1, planned.length)) }, lane));
  aborted();

  // 2. The archive.
  const manifest: ProjectManifest = {
    format: 'fabtice',
    formatVersion: PROJECT_FILE_VERSION,
    documentVersion: doc.version,
    title: doc.project.title,
    savedAt: now.toISOString(),
    audio: [...input.originals].map(([id, a], i) => ({
      id,
      entry: `audio/${i > 0 ? `${i + 1}-` : ''}${safeEntryName(a.fileName, 'morceau')}`,
      fileName: a.fileName,
      mimeType: a.mimeType,
      bytes: a.bytes.byteLength,
    })),
    tracks: planned.map((p) => {
      const m = encoded.get(p.id)!.pcm;
      return { id: p.id, kind: p.kind, entry: p.entry, frames: m.frames, sampleRate: m.sampleRate, channelCount: m.channelCount, mono: m.mono };
    }),
  };
  const total = [...input.originals.values()].reduce((n, a) => n + a.bytes.byteLength, 0) + [...encoded.values()].reduce((n, e) => n + e.blob.size, 0);
  let done = 0;
  const wrote = (n: number) => {
    done += n;
    options.onProgress?.(0.95 + 0.05 * Math.min(1, done / Math.max(1, total)));
  };
  try {
    const zip = new ZipStreamWriter(sink, now);
    await zip.addSmall(MIMETYPE_ENTRY, new TextEncoder().encode(PROJECT_MIME) as Uint8Array<ArrayBuffer>);
    await zip.addSmall(MANIFEST_ENTRY, json(manifest));
    await zip.addSmall(DOCUMENT_ENTRY, json(doc));
    for (const a of manifest.audio) {
      const bytes = new Uint8Array(input.originals.get(a.id)!.bytes);
      await zip.begin(a.entry);
      for (let at = 0; at < bytes.length; at += SLICE) {
        await zip.write(bytes.slice(at, Math.min(bytes.length, at + SLICE)));
        wrote(Math.min(SLICE, bytes.length - at));
        await tick();
        aborted();
      }
      await zip.end();
    }
    for (const t of manifest.tracks) {
      const blob = encoded.get(t.id)!.blob;
      await zip.begin(t.entry);
      for (let at = 0; at < blob.size; at += SLICE) {
        await zip.write(new Uint8Array(await blob.slice(at, Math.min(blob.size, at + SLICE)).arrayBuffer()));
        wrote(Math.min(SLICE, blob.size - at));
        aborted();
      }
      await zip.end();
    }
    await zip.finish();
    options.onProgress?.(1);
    return { bytes: zip.written, manifest };
  } catch (e) {
    if (e instanceof ZipFormatError && e.code === 'too-large') throw new ProjectFileError('too-large', e.message);
    throw e;
  }
}

// ---------------------------------------------------------------- reading

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

function damaged(what: string): never {
  throw new ProjectFileError('damaged', what);
}

function readManifest(raw: unknown): ProjectManifest {
  if (!isRec(raw) || raw.format !== 'fabtice') damaged('manifest');
  if (!isCount(raw.formatVersion) || raw.formatVersion < 1) damaged('manifest version');
  // A later layout: say so, rather than guess (« mettez Fabtice à jour »).
  if (raw.formatVersion > PROJECT_FILE_VERSION) throw new ProjectFileError('too-recent', `file version ${raw.formatVersion}`);
  // Version 1 (WAV instruments) was never published.
  if (raw.formatVersion < PROJECT_FILE_VERSION) throw new ProjectFileError('not-project', `file version ${raw.formatVersion}`);
  if (!Array.isArray(raw.audio) || !Array.isArray(raw.tracks)) damaged('manifest lists');
  for (const a of raw.audio as unknown[]) {
    if (!isRec(a) || !isStr(a.id) || !isStr(a.entry) || !isStr(a.fileName) || !isStr(a.mimeType) || !isCount(a.bytes)) damaged('manifest audio');
  }
  for (const m of raw.tracks as unknown[]) {
    if (!isRec(m) || !isStr(m.id) || !isStr(m.entry) || !isCount(m.frames) || !isCount(m.sampleRate) || m.sampleRate === 0) damaged('manifest track');
    if ((m.kind !== 'separated' && m.kind !== 'render') || (m.channelCount !== 1 && m.channelCount !== 2) || typeof m.mono !== 'boolean') damaged('manifest track kind');
  }
  return raw as unknown as ProjectManifest;
}

export interface OpenedProjectFile {
  manifest: ProjectManifest;
  /** The document, migrated to the current version and checked (the same reader as the device's copy). */
  document: ProjectDocument;
  /** The original audio of `id`, checked against its CRC. */
  readOriginal(id: string): Promise<StoredAudio>;
  /**
   * A FLAC track (separated instrument or render), decoded slice by slice
   * straight into 16-bit chunks (shared memory when the page has it),
   * checked against its CRC and the manifest. `onFraction` follows it.
   */
  readTrack(id: string, onFraction?: (fraction: number) => void): Promise<PcmAudio>;
  /** Checks every entry's CRC, reading the whole file once by slices (before anything is replaced). */
  verify(onFraction?: (fraction: number) => void): Promise<void>;
}

function asFileError(e: unknown): never {
  if (e instanceof ProjectFileError) throw e;
  if (e instanceof ZipFormatError) throw new ProjectFileError(e.code === 'not-zip' ? 'not-project' : e.code === 'too-large' ? 'too-large' : 'damaged', e.message);
  if (e instanceof FlacError) throw new ProjectFileError('damaged', e.message);
  if (isRec(e) && (e as { name?: unknown }).name === 'StorageError') throw new ProjectFileError('damaged', String((e as { message?: unknown }).message));
  throw e;
}

/**
 * Opens a project file: checks that it is one, reads its manifest and its
 * document (migrated from an older version, refused when too recent), and
 * checks that every track it names is in the file. Nothing big is read yet.
 */
export async function openProjectFile(source: ByteSource): Promise<OpenedProjectFile> {
  try {
    return await openChecked(source);
  } catch (e) {
    asFileError(e);
  }
}

async function openChecked(source: ByteSource): Promise<OpenedProjectFile> {
  // The fixed beginning: « PK », then the « mimetype » entry with Fabtice's type.
  const signature = MIMETYPE_ENTRY + PROJECT_MIME;
  const head = await source.read(0, Math.min(source.size, 30 + signature.length));
  if (head.length < 4 || head[0] !== 0x50 || head[1] !== 0x4b || head[2] !== 3 || head[3] !== 4) throw new ProjectFileError('not-project', 'not an archive');
  const headText = new TextDecoder('latin1').decode(head.subarray(30));
  // The beginning of a project cut short is a damaged project, not another kind of file.
  if (!signature.startsWith(headText)) throw new ProjectFileError('not-project', 'no Fabtice signature');
  if (head.length < 30 + signature.length) throw new ProjectFileError('damaged', 'cut short');
  const entries = await readZipDirectory(source);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const entry = (name: string): ZipEntryInfo => byName.get(name) ?? damaged(`missing ${name}`);
  const parse = async (name: string): Promise<unknown> => {
    const bytes = await readEntryBytes(source, entry(name));
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    } catch {
      damaged(`${name} is not JSON`);
    }
  };
  const mime = new TextDecoder().decode(await readEntryBytes(source, entry(MIMETYPE_ENTRY)));
  if (mime !== PROJECT_MIME) throw new ProjectFileError('not-project', 'wrong type');
  const manifest = readManifest(await parse(MANIFEST_ENTRY));
  const raw = await parse(DOCUMENT_ENTRY);
  if (isRec(raw) && typeof raw.version === 'number' && raw.version > PROJECT_DOCUMENT_VERSION) {
    throw new ProjectFileError('too-recent', `document version ${raw.version}`);
  }
  const document = readDocument(raw);
  if (!document) throw new ProjectFileError('too-recent', 'document version');
  const audio = new Map(manifest.audio.map((a) => [a.id, a]));
  const tracks = new Map(manifest.tracks.map((m) => [m.id, m]));
  for (const tr of [...document.tracks, ...document.separation.aside]) {
    if (tr.audio.origin !== 'separated' && !audio.has(tr.audio.id)) damaged(`no audio for track ${tr.id}`);
  }
  for (const p of trackEntries(document)) if (!tracks.has(p.id)) damaged(`no audio for ${p.entry}`);
  for (const a of audio.values()) if (entry(a.entry).size !== a.bytes) damaged(`size of ${a.entry}`);
  for (const m of tracks.values()) entry(m.entry);

  return {
    manifest,
    document,
    async readOriginal(id) {
      const a = audio.get(id) ?? damaged(`no audio ${id}`);
      try {
        const bytes = await readEntryBytes(source, entry(a.entry));
        return { bytes: bytes.buffer, mimeType: a.mimeType, fileName: a.fileName };
      } catch (e) {
        asFileError(e);
      }
    },
    async readTrack(id, onFraction) {
      const m = tracks.get(id) ?? damaged(`no track ${id}`);
      try {
        return await readFlacInto(source, entry(m.entry), m, onFraction);
      } catch (e) {
        asFileError(e);
      }
    },
    async verify(onFraction) {
      const all = entries.filter((e) => e.size > 0);
      const total = all.reduce((n, e) => n + e.size, 0) || 1;
      let done = 0;
      try {
        for (const e of all) {
          await readEntry(source, e, (bytes) => {
            done += bytes.length;
            onFraction?.(done / total);
          });
        }
      } catch (e) {
        asFileError(e);
      }
    },
  };
}

/** Decodes a FLAC entry into chunks, slice by slice; checks it against the manifest. */
async function readFlacInto(source: ByteSource, entry: ZipEntryInfo, m: ManifestTrack, onFraction?: (f: number) => void): Promise<PcmAudio> {
  const channels = m.mono ? 1 : 2;
  const chunkCount = Math.ceil(m.frames / CHUNK);
  const chunks: Chunk[] = [];
  for (let c = 0; c < chunkCount; c++) chunks.push({ l: newChunkChannel(), r: m.mono ? null : newChunkChannel() });
  let frame = 0;
  const decoder = new FlacDecoder((out, n) => {
    if (out.length !== channels) throw new FlacError(`${out.length} channels, ${channels} expected`);
    if (frame + n > m.frames) throw new FlacError('more frames than announced');
    const l = out[0]!;
    const r = out[1];
    for (let i = 0; i < n; ) {
      const f = frame + i;
      const chunk = chunks[f >> 15]!;
      const k = f & (CHUNK - 1);
      const run = Math.min(n - i, CHUNK - k);
      // Int32 → Int16: exact for 16-bit files (anything else is refused below).
      chunk.l.set(l.subarray(i, i + run), k);
      if (chunk.r && r) chunk.r.set(r.subarray(i, i + run), k);
      i += run;
    }
    frame += n;
  });
  await readEntry(source, entry, (bytes, at) => {
    decoder.push(bytes);
    if (decoder.info && (decoder.info.bitsPerSample !== 16 || decoder.info.sampleRate !== m.sampleRate)) throw new FlacError('unexpected format');
    onFraction?.(Math.min(1, (at + bytes.length) / Math.max(1, entry.size)));
  });
  decoder.end();
  if (frame !== m.frames) throw new FlacError(`${entry.name}: ${frame} frames, ${m.frames} expected`);
  return pcmFromChunks(chunks, m.frames, m.sampleRate, m.channelCount);
}
