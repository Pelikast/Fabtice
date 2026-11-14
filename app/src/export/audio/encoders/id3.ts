// A minimal ID3v2.3 tag with a title, for the start of an mp3 file. ID3v2.3
// is the version every player reads; the title is UTF-16 with a byte-order
// mark, so accents and « – » survive everywhere.

/** Size as ID3 writes it: four bytes of seven bits. */
function syncsafe(n: number): number[] {
  return [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f];
}

function utf16le(text: string): Uint8Array {
  const out = new Uint8Array(2 + text.length * 2);
  out[0] = 0xff;
  out[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out[2 + 2 * i] = c & 0xff;
    out[3 + 2 * i] = c >> 8;
  }
  return out;
}

/** The tag bytes (header, then one TIT2 frame), or an empty array for an empty title. */
export function id3Title(title: string): Uint8Array<ArrayBuffer> {
  const text = title.trim().slice(0, 200);
  if (!text) return new Uint8Array(0);
  const body = utf16le(text);
  const frameSize = 1 + body.length;
  const out = new Uint8Array(10 + 10 + frameSize);
  out.set([0x49, 0x44, 0x33, 3, 0, 0, ...syncsafe(10 + frameSize)], 0); // « ID3 », v2.3.0, no flags, size of what follows
  out.set([0x54, 0x49, 0x54, 0x32], 10); // TIT2
  new DataView(out.buffer).setUint32(14, frameSize, false);
  out[20] = 1; // text encoding: UTF-16 with BOM
  out.set(body, 21);
  return out;
}
