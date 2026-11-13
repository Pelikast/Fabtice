// Audio file decoding (to 44.1 kHz stereo) and WAV encoding for the separation spike.

export const RATE = 44100;

function readExtended80(dv, off) {
  // IEEE 754 80-bit extended, big-endian, as used by AIFF's COMM sample rate.
  const exp = dv.getUint16(off) & 0x7fff;
  const sign = dv.getUint16(off) & 0x8000 ? -1 : 1;
  const hi = dv.getUint32(off + 2), lo = dv.getUint32(off + 6);
  if (exp === 0 && hi === 0 && lo === 0) return 0;
  return sign * (hi * 2 ** (exp - 16383 - 31) + lo * 2 ** (exp - 16383 - 63));
}

// Minimal AIFF / AIFF-C reader (uncompressed PCM and float); Chromium does not decode AIFF.
function parseAiff(buf) {
  const dv = new DataView(buf);
  const tag = (o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  if (tag(0) !== 'FORM' || !['AIFF', 'AIFC'].includes(tag(8))) return null;
  let off = 12, ch = 0, frames = 0, bits = 0, rate = 0, comp = 'NONE', data = -1;
  while (off + 8 <= dv.byteLength) {
    const id = tag(off), size = dv.getUint32(off + 4), body = off + 8;
    if (id === 'COMM') {
      ch = dv.getInt16(body); frames = dv.getUint32(body + 2); bits = dv.getInt16(body + 6);
      rate = readExtended80(dv, body + 8);
      if (tag(8) === 'AIFC' && size >= 22) comp = tag(body + 18);
    } else if (id === 'SSND') {
      data = body + 8 + dv.getUint32(body);
    }
    off = body + size + (size & 1);
  }
  if (data < 0 || !ch || !frames) throw new Error('fichier AIFF illisible');
  const little = comp === 'sowt';
  const float = comp === 'fl32' || comp === 'FL32';
  if (!['NONE', 'sowt', 'fl32', 'FL32', 'twos'].includes(comp)) throw new Error(`AIFF compressé (${comp}) non pris en charge`);
  const bytes = float ? 4 : Math.ceil(bits / 8);
  const out = Array.from({ length: ch }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < ch; c++) {
      const o = data + (i * ch + c) * bytes;
      let v;
      if (float) v = dv.getFloat32(o, little);
      else if (bytes === 1) v = dv.getInt8(o) / 128;
      else if (bytes === 2) v = dv.getInt16(o, little) / 32768;
      else if (bytes === 3) {
        const b0 = dv.getUint8(o), b1 = dv.getUint8(o + 1), b2 = dv.getUint8(o + 2);
        let x = little ? (b2 << 16) | (b1 << 8) | b0 : (b0 << 16) | (b1 << 8) | b2;
        if (x & 0x800000) x -= 0x1000000;
        v = x / 8388608;
      } else v = dv.getInt32(o, little) / 2147483648;
      out[c][i] = v;
    }
  }
  return { channels: out, rate };
}

async function resample(channels, rate) {
  const length = Math.ceil((channels[0].length * RATE) / rate);
  const ctx = new OfflineAudioContext(channels.length, length, RATE);
  const buf = ctx.createBuffer(channels.length, channels[0].length, rate);
  channels.forEach((c, i) => buf.copyToChannel(c, i));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start();
  const r = await ctx.startRendering();
  return Array.from({ length: r.numberOfChannels }, (_, i) => r.getChannelData(i));
}

// Decodes a File into { left, right, duration, info } at 44.1 kHz stereo.
export async function decodeFile(file) {
  const buf = await file.arrayBuffer();
  let channels, origRate = RATE, how;
  const aiff = parseAiff(buf);
  if (aiff) {
    origRate = aiff.rate;
    channels = aiff.rate === RATE ? aiff.channels : await resample(aiff.channels, aiff.rate);
    how = 'lecteur AIFF intégré';
  } else {
    const ctx = new OfflineAudioContext(2, RATE, RATE);
    const decoded = await ctx.decodeAudioData(buf);
    channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
    how = 'decodeAudioData';
  }
  const left = channels[0];
  const right = channels.length > 1 ? channels[1] : channels[0];
  return {
    left, right,
    duration: left.length / RATE,
    info: { channels: channels.length, origRate, how },
  };
}

// 16-bit PCM WAV from two Float32Arrays.
export function encodeWav(left, right, rate = RATE) {
  const n = left.length;
  const buf = new ArrayBuffer(44 + n * 4);
  const dv = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); str(8, 'WAVE');
  str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true);
  str(36, 'data'); dv.setUint32(40, n * 4, true);
  const pcm = new Int16Array(buf, 44, n * 2);
  for (let i = 0; i < n; i++) {
    pcm[2 * i] = Math.max(-32768, Math.min(32767, Math.round(left[i] * 32767)));
    pcm[2 * i + 1] = Math.max(-32768, Math.min(32767, Math.round(right[i] * 32767)));
  }
  return new Blob([buf], { type: 'audio/wav' });
}
