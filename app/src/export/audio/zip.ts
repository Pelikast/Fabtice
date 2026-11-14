// A minimal ZIP writer for « Exporter le son » with several tracks: files
// stored as they are (method 0, no compression: audio does not compress
// much, and wav, mp3 and flac are what they are), CRC-32, UTF-8 names. Enough
// for every archive tool (Finder, Windows, unzip). No ZIP64: the archive must
// stay under 4 GB (twenty minutes of seven stereo tracks in wav is 3.2 GB).

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array, crc = 0): number {
  let c = ~crc >>> 0;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return ~c >>> 0;
}

const SLICE = 8 * 1024 * 1024;

export interface ZipEntry {
  name: string;
  data: Blob;
}

/** DOS date and time of `d` (what ZIP stores). */
function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: (Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** Packs the entries, in order, into one .zip Blob. */
export async function zipStore(entries: readonly ZipEntry[], now = new Date()): Promise<Blob> {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(now);
  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name) as Uint8Array<ArrayBuffer>;
    // The CRC is read slice by slice: the file itself stays a Blob (never a second copy in memory).
    let crc = 0;
    const size = e.data.size;
    for (let at = 0; at < size; at += SLICE) crc = crc32(new Uint8Array(await e.data.slice(at, Math.min(size, at + SLICE)).arrayBuffer()), crc);
    if (offset + size > 0xffffffff) throw new Error('archive too large');
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(local.buffer, name, e.data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, date, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, size, true);
    cd.setUint32(24, size, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    const rec = new Uint8Array(46 + name.length);
    rec.set(new Uint8Array(cd.buffer), 0);
    rec.set(name, 46);
    central.push(rec);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}
