// A Standard MIDI File writer, the most classic kind: format 1, a fixed
// resolution in ticks per quarter note, running status never used (every
// event spelled out), meta-events of the 1.0 specification only. Pure.
//
//   Set Tempo       FF 51 03 tttttt      microseconds per quarter note
//   Time Signature  FF 58 04 nn dd cc bb dd = log2(denominator), cc = MIDI clocks per click, bb = 8
//   Key Signature   FF 59 02 sf mi       sf = −7…7 (flats < 0), mi = 0 major, 1 minor
//   Marker          FF 06 len text
//   Track Name      FF 03 len text
//   End of Track    FF 2F 00
//
// Text in a MIDI file has no defined encoding: `asciiText()` keeps it to
// printable ASCII (accents removed), which every reader shows the same way.

export const FORMAT_MULTI_TRACK = 1;

export type MidiEvent =
  | { tick: number; kind: 'tempo'; microsPerQuarter: number }
  | { tick: number; kind: 'timeSignature'; numerator: number; denominator: number; clocksPerClick: number }
  | { tick: number; kind: 'keySignature'; sharps: number; minor: boolean }
  | { tick: number; kind: 'marker'; text: string }
  | { tick: number; kind: 'trackName'; text: string }
  | { tick: number; kind: 'text'; text: string }
  | { tick: number; kind: 'noteOn'; channel: number; note: number; velocity: number }
  | { tick: number; kind: 'noteOff'; channel: number; note: number }
  | { tick: number; kind: 'program'; channel: number; program: number };

export interface MidiTrack {
  events: MidiEvent[];
  /** Tick of the End of Track event (at least the last event's). */
  endTick: number;
}

/** Largest value of a Set Tempo event (24 bits). */
export const MAX_MICROS_PER_QUARTER = 0xffffff;

/** Printable ASCII only: accents taken off (« Thème » -> « Theme »), the rest of the signs replaced. */
export function asciiText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/♭/g, 'b')
    .replace(/♯/g, '#')
    .replace(/△/g, 'maj7')
    .replace(/°/g, 'dim')
    .replace(/[  ]/g, ' ')
    .replace(/[^\x20-\x7e]/g, '?');
}

function vlq(value: number): number[] {
  if (!Number.isInteger(value) || value < 0 || value > 0x0fffffff) throw new RangeError(`delta time out of range: ${value}`);
  const bytes = [value & 0x7f];
  let v = value >>> 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  return bytes;
}

const textBytes = (text: string): number[] => [...asciiText(text)].map((c) => c.charCodeAt(0));

function meta(type: number, data: number[]): number[] {
  return [0xff, type, ...vlq(data.length), ...data];
}

function eventBytes(e: MidiEvent): number[] {
  switch (e.kind) {
    case 'tempo': {
      const t = Math.round(e.microsPerQuarter);
      if (t < 1 || t > MAX_MICROS_PER_QUARTER) throw new RangeError(`tempo out of range: ${t}`);
      return meta(0x51, [(t >> 16) & 0xff, (t >> 8) & 0xff, t & 0xff]);
    }
    case 'timeSignature': {
      const dd = Math.log2(e.denominator);
      if (!Number.isInteger(dd) || e.numerator < 1 || e.numerator > 255) throw new RangeError('invalid time signature');
      return meta(0x58, [e.numerator, dd, e.clocksPerClick, 8]);
    }
    case 'keySignature':
      return meta(0x59, [e.sharps & 0xff, e.minor ? 1 : 0]);
    case 'marker':
      return meta(0x06, textBytes(e.text));
    case 'trackName':
      return meta(0x03, textBytes(e.text));
    case 'text':
      return meta(0x01, textBytes(e.text));
    case 'noteOn':
      return [0x90 | e.channel, e.note & 0x7f, e.velocity & 0x7f];
    case 'noteOff':
      return [0x80 | e.channel, e.note & 0x7f, 0];
    case 'program':
      return [0xc0 | e.channel, e.program & 0x7f];
  }
}

/** At the same tick: names, signatures and tempos first, then markers, then note offs before note ons. */
const ORDER: Record<MidiEvent['kind'], number> = {
  trackName: 0,
  text: 1,
  timeSignature: 2,
  keySignature: 3,
  tempo: 4,
  marker: 5,
  program: 6,
  noteOff: 7,
  noteOn: 8,
};

function trackChunk(track: MidiTrack): Uint8Array {
  const events = track.events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.tick - b.e.tick || ORDER[a.e.kind] - ORDER[b.e.kind] || a.i - b.i)
    .map((x) => x.e);
  const body: number[] = [];
  let at = 0;
  for (const e of events) {
    if (!Number.isInteger(e.tick) || e.tick < 0) throw new RangeError(`invalid tick ${e.tick}`);
    body.push(...vlq(e.tick - at), ...eventBytes(e));
    at = e.tick;
  }
  body.push(...vlq(Math.max(0, track.endTick - at)), 0xff, 0x2f, 0x00);
  const out = new Uint8Array(8 + body.length);
  out.set([0x4d, 0x54, 0x72, 0x6b], 0);
  new DataView(out.buffer).setUint32(4, body.length);
  out.set(body, 8);
  return out;
}

/** The bytes of a format 1 file with these tracks (the first one is the tempo track). */
export function writeSmf(tracks: readonly MidiTrack[], ticksPerQuarter: number): Uint8Array {
  if (!Number.isInteger(ticksPerQuarter) || ticksPerQuarter < 1 || ticksPerQuarter > 0x7fff) throw new RangeError('invalid resolution');
  const chunks = tracks.map(trackChunk);
  const header = new Uint8Array(14);
  const v = new DataView(header.buffer);
  header.set([0x4d, 0x54, 0x68, 0x64], 0);
  v.setUint32(4, 6);
  v.setUint16(8, FORMAT_MULTI_TRACK);
  v.setUint16(10, tracks.length);
  v.setUint16(12, ticksPerQuarter);
  const out = new Uint8Array(header.length + chunks.reduce((n, c) => n + c.length, 0));
  out.set(header, 0);
  let at = header.length;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
