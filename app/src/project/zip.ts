// The container of a `.fab` file: a ZIP archive, files stored as they are
// (method 0), written and read piece by piece. See FORMAT.md.
//
// Writing: `ZipStreamWriter` hands its bytes to a sink as they are produced;
// each entry's CRC-32 is computed on the way and written after it (a « data
// descriptor », bit 3), so nothing is ever read twice and nothing waits for
// the whole file in memory. Reading: the central directory at the end gives
// every entry's place and size; an entry is then read by ranges from a
// random-access source (a `Blob`/`File` in a page, a file handle in a test),
// and its CRC is checked as it is read.
//
// No ZIP64: a `.fab` file stays under 4 GB (twenty minutes of seven
// stereo instruments is 1.6 GB). Bigger is refused before anything is written.

import { crc32 } from '../export/audio/zip';

export { crc32 };

/** Where the bytes of a file being written go. Each chunk handed over belongs to the sink (never reused). */
export interface ByteSink {
  write(chunk: Uint8Array<ArrayBuffer>): void | Promise<void>;
}

/** A file being read, by ranges: a `File` in a page, a file on disk in a test, a bridge in the Mac app. */
export interface ByteSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

/** Largest offset a ZIP without ZIP64 can name. */
export const ZIP_LIMIT = 0xffffffff;

export class ZipFormatError extends Error {
  constructor(
    readonly code: 'not-zip' | 'damaged' | 'too-large',
    message: string,
  ) {
    super(message);
    this.name = 'ZipFormatError';
  }
}

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
const DESCRIPTOR = 0x08074b50;
const UTF8 = 0x0800;
const HAS_DESCRIPTOR = 0x0008;

/** DOS date and time of `d` (what ZIP stores). */
function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: (Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

interface CentralRecord {
  name: Uint8Array<ArrayBuffer>;
  crc: number;
  size: number;
  offset: number;
  flags: number;
}

/** Size, in the archive, of an entry named `name` holding `size` bytes (headers and descriptor included). */
export function entryFootprint(name: string, size: number, withDescriptor = true): number {
  const n = new TextEncoder().encode(name).length;
  return 30 + n + size + (withDescriptor ? 16 : 0) + 46 + n;
}

/** Size of the end record. */
export const END_RECORD_BYTES = 22;

export class ZipStreamWriter {
  private readonly enc = new TextEncoder();
  private readonly when: { time: number; date: number };
  private readonly central: CentralRecord[] = [];
  private offset = 0;
  private open: { record: CentralRecord; crc: number; size: number } | null = null;

  constructor(
    private readonly sink: ByteSink,
    now = new Date(),
  ) {
    this.when = dosDateTime(now);
  }

  /** Bytes handed to the sink so far. */
  get written(): number {
    return this.offset;
  }

  private async emit(chunk: Uint8Array<ArrayBuffer>): Promise<void> {
    if (chunk.length === 0) return;
    if (this.offset + chunk.length > ZIP_LIMIT) throw new ZipFormatError('too-large', 'archive over 4 GB');
    this.offset += chunk.length;
    await this.sink.write(chunk);
  }

  private localHeader(name: Uint8Array<ArrayBuffer>, flags: number, crc: number, size: number): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(30 + name.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, LOCAL, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, flags, true);
    v.setUint16(8, 0, true);
    v.setUint16(10, this.when.time, true);
    v.setUint16(12, this.when.date, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, size, true);
    v.setUint32(22, size, true);
    v.setUint16(26, name.length, true);
    v.setUint16(28, 0, true);
    out.set(name, 30);
    return out;
  }

  /** A small entry whose bytes are all known (written with its CRC in the header, no descriptor). */
  async addSmall(name: string, data: Uint8Array<ArrayBuffer>): Promise<void> {
    if (this.open) throw new Error('an entry is still open');
    const n = this.enc.encode(name) as Uint8Array<ArrayBuffer>;
    const crc = crc32(data);
    const record: CentralRecord = { name: n, crc, size: data.length, offset: this.offset, flags: UTF8 };
    await this.emit(this.localHeader(n, UTF8, crc, data.length));
    // A copy: the sink owns what it is given.
    await this.emit(data.slice());
    this.central.push(record);
  }

  /** Starts an entry written piece by piece with `write`, closed by `end`. */
  async begin(name: string): Promise<void> {
    if (this.open) throw new Error('an entry is still open');
    const n = this.enc.encode(name) as Uint8Array<ArrayBuffer>;
    const flags = UTF8 | HAS_DESCRIPTOR;
    this.open = { record: { name: n, crc: 0, size: 0, offset: this.offset, flags }, crc: 0, size: 0 };
    await this.emit(this.localHeader(n, flags, 0, 0));
  }

  /** Bytes of the open entry. The sink takes ownership of `chunk`: do not reuse it. */
  async write(chunk: Uint8Array<ArrayBuffer>): Promise<void> {
    const e = this.open;
    if (!e) throw new Error('no entry open');
    e.crc = crc32(chunk, e.crc);
    e.size += chunk.length;
    await this.emit(chunk);
  }

  async end(): Promise<void> {
    const e = this.open;
    if (!e) throw new Error('no entry open');
    this.open = null;
    const d = new Uint8Array(16);
    const v = new DataView(d.buffer);
    v.setUint32(0, DESCRIPTOR, true);
    v.setUint32(4, e.crc, true);
    v.setUint32(8, e.size, true);
    v.setUint32(12, e.size, true);
    await this.emit(d);
    this.central.push({ ...e.record, crc: e.crc, size: e.size });
  }

  /** The central directory and the end record. */
  async finish(): Promise<void> {
    if (this.open) throw new Error('an entry is still open');
    const start = this.offset;
    for (const r of this.central) {
      const rec = new Uint8Array(46 + r.name.length);
      const v = new DataView(rec.buffer);
      v.setUint32(0, CENTRAL, true);
      v.setUint16(4, 20, true);
      v.setUint16(6, 20, true);
      v.setUint16(8, r.flags, true);
      v.setUint16(10, 0, true);
      v.setUint16(12, this.when.time, true);
      v.setUint16(14, this.when.date, true);
      v.setUint32(16, r.crc, true);
      v.setUint32(20, r.size, true);
      v.setUint32(24, r.size, true);
      v.setUint16(28, r.name.length, true);
      v.setUint32(42, r.offset, true);
      rec.set(r.name, 46);
      await this.emit(rec);
    }
    const end = new Uint8Array(22);
    const v = new DataView(end.buffer);
    v.setUint32(0, END, true);
    v.setUint16(8, this.central.length, true);
    v.setUint16(10, this.central.length, true);
    v.setUint32(12, this.offset - start, true);
    v.setUint32(16, start, true);
    await this.emit(end);
  }
}

// ---------------------------------------------------------------- reading

export interface ZipEntryInfo {
  name: string;
  crc: number;
  size: number;
  /** Offset of the entry's local header. */
  headerOffset: number;
}

/** The entries of an archive, from its central directory, in their order. */
export async function readZipDirectory(source: ByteSource): Promise<ZipEntryInfo[]> {
  if (source.size < END_RECORD_BYTES) throw new ZipFormatError('not-zip', 'too short');
  const first = await source.read(0, 4);
  if (first.length < 4 || new DataView(first.buffer, first.byteOffset, 4).getUint32(0, true) !== LOCAL) {
    throw new ZipFormatError('not-zip', 'no local header at the start');
  }
  // The end record is in the last 22 bytes (no archive comment is ever written); a comment is tolerated.
  const tailLength = Math.min(source.size, END_RECORD_BYTES + 0xffff);
  const tail = await source.read(source.size - tailLength, tailLength);
  const tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let at = -1;
  for (let i = tail.length - END_RECORD_BYTES; i >= 0; i--) {
    if (tv.getUint32(i, true) === END) {
      at = i;
      break;
    }
  }
  // A file that starts like an archive but has no end: cut short (a download or a copy interrupted).
  if (at < 0) throw new ZipFormatError('damaged', 'no end record (file cut short?)');
  const count = tv.getUint16(at + 10, true);
  const cdSize = tv.getUint32(at + 12, true);
  const cdOffset = tv.getUint32(at + 16, true);
  if (cdOffset + cdSize > source.size - (tail.length - at)) throw new ZipFormatError('damaged', 'central directory out of the file');
  const cd = await source.read(cdOffset, cdSize);
  const v = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const dec = new TextDecoder('utf-8', { fatal: false });
  const out: ZipEntryInfo[] = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > cd.length || v.getUint32(p, true) !== CENTRAL) throw new ZipFormatError('damaged', `central record ${i}`);
    const method = v.getUint16(p + 10, true);
    const crc = v.getUint32(p + 16, true);
    const compressed = v.getUint32(p + 20, true);
    const size = v.getUint32(p + 24, true);
    const nameLength = v.getUint16(p + 28, true);
    const extra = v.getUint16(p + 30, true);
    const comment = v.getUint16(p + 32, true);
    const headerOffset = v.getUint32(p + 42, true);
    if (p + 46 + nameLength > cd.length) throw new ZipFormatError('damaged', `central record ${i} name`);
    const name = dec.decode(cd.subarray(p + 46, p + 46 + nameLength));
    // Only stored entries: a .fab file re-packed by another tool with compression is not read.
    if (method !== 0 || compressed !== size) throw new ZipFormatError('damaged', `entry ${name} is compressed`);
    if (headerOffset + 30 + size > cdOffset) throw new ZipFormatError('damaged', `entry ${name} out of the file`);
    out.push({ name, crc, size, headerOffset });
    p += 46 + nameLength + extra + comment;
  }
  return out;
}

/** Offset of an entry's first data byte (after its local header). */
export async function entryDataOffset(source: ByteSource, entry: ZipEntryInfo): Promise<number> {
  const h = await source.read(entry.headerOffset, 30);
  const v = new DataView(h.buffer, h.byteOffset, h.byteLength);
  if (h.length < 30 || v.getUint32(0, true) !== LOCAL) throw new ZipFormatError('damaged', `local header of ${entry.name}`);
  const start = entry.headerOffset + 30 + v.getUint16(26, true) + v.getUint16(28, true);
  if (start + entry.size > source.size) throw new ZipFormatError('damaged', `entry ${entry.name} cut short`);
  return start;
}

/** Slice size when an entry is read piece by piece. */
export const READ_SLICE = 4 * 1024 * 1024;

/**
 * Reads an entry in slices of at most `slice` bytes, in order, handing each to
 * `onSlice` (which must not keep it beyond the call unless it copies it), then
 * checks the CRC. Rejects with `damaged` when the bytes do not match.
 */
export async function readEntry(source: ByteSource, entry: ZipEntryInfo, onSlice: (bytes: Uint8Array, at: number) => void | Promise<void>, slice = READ_SLICE): Promise<void> {
  const start = await entryDataOffset(source, entry);
  let crc = 0;
  for (let at = 0; at < entry.size; at += slice) {
    const n = Math.min(slice, entry.size - at);
    const bytes = await source.read(start + at, n);
    if (bytes.length !== n) throw new ZipFormatError('damaged', `entry ${entry.name} cut short`);
    crc = crc32(bytes, crc);
    await onSlice(bytes, at);
  }
  if (crc !== entry.crc) throw new ZipFormatError('damaged', `entry ${entry.name}: wrong checksum`);
}

/** A whole entry in memory (small ones, and the original audio, which is decoded whole anyway). */
export async function readEntryBytes(source: ByteSource, entry: ZipEntryInfo): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Uint8Array(entry.size);
  await readEntry(source, entry, (bytes, at) => out.set(bytes, at));
  return out;
}

/** A `Blob` (a `File` chosen or dropped) read by ranges: the browser never loads it whole. */
export function blobSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    read: async (offset, length) => new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer()),
  };
}

/** Bytes in memory as a source (tests, small files). */
export function bytesSource(bytes: Uint8Array): ByteSource {
  return { size: bytes.length, read: async (offset, length) => bytes.subarray(offset, Math.min(bytes.length, offset + length)) };
}
