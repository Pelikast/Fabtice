// The `.fabtice` project file (lot 4): one file the user can keep, copy and
// send, holding the project document, the original audio as it was imported
// (never re-encoded) and, when the user asks for it, the separated
// instruments. The layout is described in FORMAT.md (French).
//
// Written and read piece by piece (`zip.ts`): the writer hands its bytes to a
// sink as they are produced; the reader reads ranges of the file. The
// instruments go from the in-memory 16-bit chunks to the file, and back, one
// slice at a time: never a Float32 copy of a track, never the whole file in
// memory (except the original audio, which is decoded whole anyway, as an
// import does).

import { CHUNK, newChunkChannel, pcmFromChunks, type Chunk, type PcmAudio } from '../audio/pcm';
import { PROJECT_DOCUMENT_VERSION, type ProjectDocument } from '../model/document';
import type { StoredAudio } from '../storage/ProjectStorage';
import { readDocument } from '../storage/documentFormat';
import {
  END_RECORD_BYTES,
  entryFootprint,
  readEntry,
  readEntryBytes,
  readZipDirectory,
  ZIP_LIMIT,
  ZipFormatError,
  ZipStreamWriter,
  type ByteSink,
  type ByteSource,
  type ZipEntryInfo,
} from './zip';

/** First entry of every `.fabtice` file, stored as is: its name and content sit at fixed offsets (bytes 30 to 58). */
export const MIMETYPE_ENTRY = 'mimetype';
export const PROJECT_MIME = 'application/x-fabtice';
export const MANIFEST_ENTRY = 'fabtice.json';
export const DOCUMENT_ENTRY = 'projet.json';
export const FILE_EXTENSION = '.fabtice';

/**
 * Version of the file's layout (the entries and the manifest), not of the
 * project document inside, which has its own (`ProjectDocument.version`,
 * migrated as the device's copy is). Bump it with a reader for the old one.
 */
export const PROJECT_FILE_VERSION = 1;

export interface ManifestAudio {
  /** `AudioRef.id` of the track(s) it is the audio of. */
  id: string;
  entry: string;
  fileName: string;
  mimeType: string;
  bytes: number;
}

export interface ManifestInstrument {
  /** `AudioRef.id` of the separated track. */
  id: string;
  /** A 16-bit PCM WAV file at 48 kHz (any player reads it). */
  entry: string;
  frames: number;
  sampleRate: number;
  /** Channels as separated (1 or 2). */
  channelCount: 1 | 2;
  /** One channel written (both equal): the WAV is mono. */
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
  instruments: ManifestInstrument[];
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

// ---------------------------------------------------------------- WAV

const WAV_HEADER = 44;

function wavHeader(frames: number, channels: number, sampleRate: number): Uint8Array<ArrayBuffer> {
  const data = frames * channels * 2;
  const h = new Uint8Array(WAV_HEADER);
  const v = new DataView(h.buffer);
  const tag = (at: number, s: string) => {
    for (let i = 0; i < 4; i++) h[at + i] = s.charCodeAt(i);
  };
  tag(0, 'RIFF');
  v.setUint32(4, 36 + data, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  tag(36, 'data');
  v.setUint32(40, data, true);
  return h;
}

function wavBytes(pcm: PcmAudio): number {
  return WAV_HEADER + pcm.frames * (pcm.mono ? 1 : 2) * 2;
}

/** Chunks per write: 32 chunks, 4 MB of stereo samples. */
const CHUNKS_PER_WRITE = 32;

/** Writes the samples of `pcm` into the open entry, interleaved little-endian 16-bit, a few MB at a time. */
async function writeWav(zip: ZipStreamWriter, pcm: PcmAudio, onBytes: (n: number) => void, tick: () => Promise<void>): Promise<void> {
  const channels = pcm.mono ? 1 : 2;
  await zip.write(wavHeader(pcm.frames, channels, pcm.sampleRate));
  const littleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
  for (let c0 = 0; c0 < pcm.chunks.length; c0 += CHUNKS_PER_WRITE) {
    const c1 = Math.min(pcm.chunks.length, c0 + CHUNKS_PER_WRITE);
    const frames = Math.min(pcm.frames, c1 * CHUNK) - c0 * CHUNK;
    const out = new Int16Array(frames * channels);
    let o = 0;
    for (let c = c0; c < c1; c++) {
      const chunk = pcm.chunks[c]!;
      const n = Math.min(CHUNK, pcm.frames - c * CHUNK);
      if (channels === 1) {
        out.set(chunk.l.subarray(0, n), o);
        o += n;
      } else {
        const l = chunk.l;
        const r = chunk.r ?? chunk.l;
        for (let i = 0; i < n; i++) {
          out[o++] = l[i]!;
          out[o++] = r[i]!;
        }
      }
    }
    const bytes = new Uint8Array(out.buffer);
    if (!littleEndian) for (let i = 0; i < bytes.length; i += 2) [bytes[i], bytes[i + 1]] = [bytes[i + 1]!, bytes[i]!];
    await zip.write(bytes);
    onBytes(bytes.length);
    await tick();
  }
}

// ---------------------------------------------------------------- writing

export interface ProjectFileInput {
  /** The document as it is now (version 4); when no instrument is given, it must not cite separated tracks. */
  document: ProjectDocument;
  /** The original audio of each original track, by `AudioRef.id`. */
  originals: ReadonlyMap<string, StoredAudio>;
  /** The separated tracks to include, by `AudioRef.id` (empty: « sans les instruments séparés »). */
  instruments: ReadonlyMap<string, PcmAudio>;
}

export interface WriteOptions {
  now?: Date;
  /** 0…1, as bytes are written. */
  onProgress?: (fraction: number) => void;
  /** Lets the page breathe between slices (the app passes `yieldToMain`). */
  tick?: () => Promise<void>;
  signal?: AbortSignal;
}

const json = (v: unknown) => new TextEncoder().encode(JSON.stringify(v, null, 1)) as Uint8Array<ArrayBuffer>;

function plan(input: ProjectFileInput, now: Date): { manifest: ProjectManifest; total: number } {
  const used = new Set<string>();
  const unique = (dir: string, name: string) => {
    let entry = `${dir}/${name}`;
    for (let i = 2; used.has(entry.toLowerCase()); i++) entry = `${dir}/${i}-${name}`;
    used.add(entry.toLowerCase());
    return entry;
  };
  const doc = input.document;
  const audio: ManifestAudio[] = [...input.originals].map(([id, a]) => ({
    id,
    entry: unique('audio', safeEntryName(a.fileName, 'morceau')),
    fileName: a.fileName,
    mimeType: a.mimeType,
    bytes: a.bytes.byteLength,
  }));
  const names = new Map([...doc.tracks, ...doc.separation.aside].map((tr) => [tr.audio.id, tr.name]));
  const instruments: ManifestInstrument[] = [...input.instruments].map(([id, pcm]) => ({
    id,
    entry: unique('instruments', `${safeEntryName(names.get(id) ?? 'instrument', 'instrument')}.wav`),
    frames: pcm.frames,
    sampleRate: pcm.sampleRate,
    channelCount: pcm.channelCount,
    mono: pcm.mono,
  }));
  const manifest: ProjectManifest = {
    format: 'fabtice',
    formatVersion: PROJECT_FILE_VERSION,
    documentVersion: doc.version,
    title: doc.project.title,
    savedAt: now.toISOString(),
    audio,
    instruments,
  };
  let total = entryFootprint(MIMETYPE_ENTRY, PROJECT_MIME.length, false) + entryFootprint(MANIFEST_ENTRY, json(manifest).length, false);
  total += entryFootprint(DOCUMENT_ENTRY, json(doc).length, false);
  for (const a of audio) total += entryFootprint(a.entry, a.bytes);
  for (const [i, m] of instruments.entries()) total += entryFootprint(m.entry, wavBytes([...input.instruments.values()][i]!));
  return { manifest, total: total + END_RECORD_BYTES };
}

/** Bytes the file will take, exactly (to show before saving, and to refuse a file over 4 GB). */
export function projectFileSize(input: ProjectFileInput): number {
  return plan(input, new Date(0)).total;
}

/** What instruments add to a file, in bytes (shown next to « avec les instruments séparés »). */
export function instrumentsFileBytes(instruments: Iterable<PcmAudio>): number {
  let n = 0;
  for (const pcm of instruments) n += wavBytes(pcm);
  return n;
}

/**
 * Writes the project file into `sink`, piece by piece. Rejects with
 * `ProjectFileError('too-large')` before writing anything when the file would
 * be over 4 GB, or with an `AbortError` when `signal` is aborted.
 */
export async function writeProjectFile(input: ProjectFileInput, sink: ByteSink, options: WriteOptions = {}): Promise<{ bytes: number; manifest: ProjectManifest }> {
  const now = options.now ?? new Date();
  const { manifest, total } = plan(input, now);
  if (total > ZIP_LIMIT) throw new ProjectFileError('too-large', `${total} bytes`);
  for (const tr of [...input.document.tracks, ...input.document.separation.aside]) {
    const known = tr.audio.origin === 'separated' ? input.instruments.has(tr.audio.id) : input.originals.has(tr.audio.id);
    if (!known) throw new Error(`no audio for track ${tr.id}`);
  }
  const tick = options.tick ?? (async () => {});
  let done = 0;
  const progress = (n: number) => {
    done += n;
    options.onProgress?.(Math.min(1, done / total));
    if (options.signal?.aborted) throw new DOMException('cancelled', 'AbortError');
  };
  const zip = new ZipStreamWriter(sink, now);
  await zip.addSmall(MIMETYPE_ENTRY, new TextEncoder().encode(PROJECT_MIME) as Uint8Array<ArrayBuffer>);
  await zip.addSmall(MANIFEST_ENTRY, json(manifest));
  await zip.addSmall(DOCUMENT_ENTRY, json(input.document));
  for (const a of manifest.audio) {
    const bytes = new Uint8Array(input.originals.get(a.id)!.bytes);
    await zip.begin(a.entry);
    const SLICE = 4 * 1024 * 1024;
    for (let at = 0; at < bytes.length; at += SLICE) {
      await zip.write(bytes.slice(at, Math.min(bytes.length, at + SLICE)));
      progress(Math.min(SLICE, bytes.length - at));
      await tick();
    }
    await zip.end();
  }
  for (const m of manifest.instruments) {
    await zip.begin(m.entry);
    await writeWav(zip, input.instruments.get(m.id)!, progress, tick);
    await zip.end();
  }
  await zip.finish();
  options.onProgress?.(1);
  return { bytes: zip.written, manifest };
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
  if (!Array.isArray(raw.audio) || !Array.isArray(raw.instruments)) damaged('manifest lists');
  for (const a of raw.audio as unknown[]) {
    if (!isRec(a) || !isStr(a.id) || !isStr(a.entry) || !isStr(a.fileName) || !isStr(a.mimeType) || !isCount(a.bytes)) damaged('manifest audio');
  }
  for (const m of raw.instruments as unknown[]) {
    if (!isRec(m) || !isStr(m.id) || !isStr(m.entry) || !isCount(m.frames) || !isCount(m.sampleRate) || m.sampleRate === 0) damaged('manifest instrument');
    if ((m.channelCount !== 1 && m.channelCount !== 2) || typeof m.mono !== 'boolean') damaged('manifest instrument channels');
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
   * A separated track, read slice by slice straight into 16-bit chunks
   * (shared memory when the page has it), checked against its CRC.
   * `onFraction` follows the reading.
   */
  readInstrument(id: string, onFraction?: (fraction: number) => void): Promise<PcmAudio>;
  /** Ids of the separated tracks the file holds. */
  instrumentIds: string[];
}

function asFileError(e: unknown): never {
  if (e instanceof ProjectFileError) throw e;
  if (e instanceof ZipFormatError) throw new ProjectFileError(e.code === 'not-zip' ? 'not-project' : e.code === 'too-large' ? 'too-large' : 'damaged', e.message);
  if (isRec(e) && (e as { name?: unknown }).name === 'StorageError') throw new ProjectFileError('damaged', String((e as { message?: unknown }).message));
  throw e;
}

/**
 * Opens a project file: checks that it is one, reads its manifest and its
 * document (migrated from an older version, refused when too recent), and
 * checks that every track it names is in the file. Nothing big is read yet:
 * the audio comes with `readOriginal` and `readInstrument`.
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
  const instruments = new Map(manifest.instruments.map((m) => [m.id, m]));
  for (const tr of [...document.tracks, ...document.separation.aside]) {
    const listed = tr.audio.origin === 'separated' ? instruments.get(tr.audio.id) : audio.get(tr.audio.id);
    if (!listed || !byName.has(listed.entry)) damaged(`no audio for track ${tr.id}`);
  }
  for (const a of audio.values()) if (entry(a.entry).size !== a.bytes) damaged(`size of ${a.entry}`);
  for (const m of instruments.values()) {
    if (entry(m.entry).size !== WAV_HEADER + m.frames * (m.mono ? 1 : 2) * 2) damaged(`size of ${m.entry}`);
  }

  return {
    manifest,
    document,
    instrumentIds: [...instruments.keys()],
    async readOriginal(id) {
      const a = audio.get(id) ?? damaged(`no audio ${id}`);
      try {
        const bytes = await readEntryBytes(source, entry(a.entry));
        return { bytes: bytes.buffer, mimeType: a.mimeType, fileName: a.fileName };
      } catch (e) {
        asFileError(e);
      }
    },
    async readInstrument(id, onFraction) {
      const m = instruments.get(id) ?? damaged(`no instrument ${id}`);
      try {
        return await readWavInto(source, entry(m.entry), m, onFraction);
      } catch (e) {
        asFileError(e);
      }
    },
  };
}

/** Reads a WAV entry into chunks, slice by slice; checks its header against the manifest. */
async function readWavInto(source: ByteSource, entry: ZipEntryInfo, m: ManifestInstrument, onFraction?: (f: number) => void): Promise<PcmAudio> {
  const channels = m.mono ? 1 : 2;
  const frameBytes = channels * 2;
  const chunkCount = Math.ceil(m.frames / CHUNK);
  const chunks: Chunk[] = [];
  for (let c = 0; c < chunkCount; c++) chunks.push({ l: newChunkChannel(), r: m.mono ? null : newChunkChannel() });
  // A frame cut by the end of a slice is carried over to the next one (slices are 4 MB: it does not happen in practice).
  let frame = 0;
  let carry: Uint8Array | null = null;
  const take = (bytes: Uint8Array) => {
    let data = bytes;
    if (carry) {
      const joined = new Uint8Array(carry.length + bytes.length);
      joined.set(carry);
      joined.set(bytes, carry.length);
      data = joined;
      carry = null;
    }
    const whole = Math.floor(data.length / frameBytes);
    const v = new DataView(data.buffer, data.byteOffset, whole * frameBytes);
    for (let i = 0; i < whole; i++, frame++) {
      const chunk = chunks[frame >> 15]!;
      const k = frame & (CHUNK - 1);
      chunk.l[k] = v.getInt16(i * frameBytes, true);
      if (chunk.r) chunk.r[k] = v.getInt16(i * frameBytes + 2, true);
    }
    if (whole * frameBytes < data.length) carry = data.slice(whole * frameBytes);
  };
  let headerSeen = false;
  await readEntry(source, entry, (bytes, at) => {
    let body = bytes;
    if (!headerSeen) {
      if (at !== 0 || bytes.length < WAV_HEADER) damaged(`${entry.name}: header`);
      const v = new DataView(bytes.buffer, bytes.byteOffset, WAV_HEADER);
      const tag = (o: number) => String.fromCharCode(bytes[o]!, bytes[o + 1]!, bytes[o + 2]!, bytes[o + 3]!);
      if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || tag(12) !== 'fmt ' || tag(36) !== 'data') damaged(`${entry.name}: not a WAV`);
      if (v.getUint16(20, true) !== 1 || v.getUint16(22, true) !== channels || v.getUint32(24, true) !== m.sampleRate || v.getUint16(34, true) !== 16) {
        damaged(`${entry.name}: unexpected format`);
      }
      if (v.getUint32(40, true) !== m.frames * frameBytes) damaged(`${entry.name}: data size`);
      headerSeen = true;
      body = bytes.subarray(WAV_HEADER);
    }
    take(body);
    onFraction?.(Math.min(1, (at + bytes.length) / entry.size));
  });
  if (frame !== m.frames || carry) damaged(`${entry.name}: ${frame} frames, ${m.frames} expected`);
  return pcmFromChunks(chunks, m.frames, m.sampleRate, m.channelCount);
}
