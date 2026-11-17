// The checksum Live keeps beside every file a set refers to (`OriginalCrc`):
// CRC-16/UMTS (polynomial 0x8005, MSB first, initial value 0, no reflection,
// no final xor) of the file's first 16 384 bytes (or of the whole file when it
// is shorter). Measured by abletoolz on 1 268 files of Live 9 to 12 sets,
// every one a match (ALS-FORMAT.md).

export const LIVE_CRC_BYTES = 16384;

const TABLE = (() => {
  const t = new Uint16Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n << 8;
    for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x8005) & 0xffff : (c << 1) & 0xffff;
    t[n] = c;
  }
  return t;
})();

/** Live's checksum of a file whose first bytes are `head` (pass at least the first 16 384, or the whole file). */
export function liveFileCrc(head: Uint8Array): number {
  let crc = 0;
  const n = Math.min(head.length, LIVE_CRC_BYTES);
  for (let i = 0; i < n; i++) crc = ((crc << 8) & 0xffff) ^ TABLE[((crc >>> 8) ^ head[i]!) & 0xff]!;
  return crc;
}
