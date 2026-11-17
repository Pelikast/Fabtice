// The `.als` container: the XML document in a gzip stream.
//
// Live writes a plain gzip member: no file name, no timestamp (header
// `1f 8b 08 00 00 00 00 00 .. ff`). A flag byte other than 0 (a stored file
// name, as `gzip` the tool writes) makes Live's browser refuse a clip file
// (abletoolz, measured on `.alc`); the header here is always Live's.
//
// The platform's CompressionStream does the deflate when it exists (browsers,
// Electron, Node 18+). Without it (older Safari), the document is stored in
// uncompressed deflate blocks: a valid gzip stream any reader opens, a few
// times larger.

import { crc32 } from '../audio/zip';

/** Gzip `data` with Live's header bytes. */
export async function gzipLive(data: Uint8Array): Promise<Uint8Array> {
  let out: Uint8Array;
  if (typeof CompressionStream === 'function') {
    const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('gzip'));
    out = new Uint8Array(await new Response(stream).arrayBuffer());
  } else {
    out = gzipStored(data);
  }
  return withLiveHeader(out);
}

/** A gzip stream of `data` in stored (uncompressed) deflate blocks. */
export function gzipStored(data: Uint8Array): Uint8Array {
  const MAX = 0xffff;
  const blocks = Math.max(1, Math.ceil(data.length / MAX));
  const out = new Uint8Array(10 + data.length + blocks * 5 + 8);
  out.set([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 0xff], 0);
  let o = 10;
  for (let b = 0; b < blocks; b++) {
    const start = b * MAX;
    const len = Math.min(MAX, data.length - start);
    out[o++] = b === blocks - 1 ? 1 : 0; // BFINAL, BTYPE = 00 (stored)
    out[o++] = len & 0xff;
    out[o++] = len >>> 8;
    out[o++] = ~len & 0xff;
    out[o++] = (~len >>> 8) & 0xff;
    out.set(data.subarray(start, start + len), o);
    o += len;
  }
  const view = new DataView(out.buffer);
  view.setUint32(o, crc32(data), true);
  view.setUint32(o + 4, data.length >>> 0, true);
  return out;
}

/** No flags, no time, no extra flags, OS « unknown »: the header Live writes (the bytes are outside the CRC). */
function withLiveHeader(gz: Uint8Array): Uint8Array {
  if (gz[0] !== 0x1f || gz[1] !== 0x8b || gz[2] !== 8) throw new Error('not a gzip stream');
  if (gz[3] !== 0) throw new Error('unexpected gzip flags');
  gz.fill(0, 4, 9);
  gz[9] = 0xff;
  return gz;
}
