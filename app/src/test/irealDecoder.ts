// A reader of iReal Pro links, for the tests of the export only. It is written
// from the format as documented in src/export/IREAL-FORMAT.md, and on purpose
// shares nothing with the encoder but the chord data types: its own unscrambling
// (formulated as the concatenation of reversed slices, not as swaps), its own
// tokenizer, and a grammar for quality texts instead of the encoder's table.

import { NO_CHORD_TEXT } from '../harmony/chord';
import type { ChordExtension, ChordQuality, ChordSymbol } from '../model/harmony';

export interface DecodedBar {
  /** Opening bracket `[` or repeat sign `{` before the bar. */
  open: '' | '[' | '{';
  /** How the bar ends: `|`, `]`, `}` or `Z`. */
  close: '|' | ']' | '}' | 'Z';
  section: string | null;
  /** Text comments (`<…>`). */
  comments: string[];
  /** `T44` → `{ numerator: 4, denominator: 4 }`; present where the signature is written. */
  timeSignature: { numerator: number; denominator: number } | null;
  /** The raw cells: a chord text, `n`, `p`, `x` or an empty string for an empty cell. */
  cells: string[];
}

export interface DecodedSong {
  title: string;
  composer: string;
  style: string;
  key: string;
  transpose: string;
  feel: string;
  bpm: number;
  repeats: number;
  /** The chart string once unscrambled. */
  music: string;
  bars: DecodedBar[];
}

export class IRealDecodeError extends Error {}

const PREFIX = '1r34LbKcu7';

/** Unscrambling, formulated as the pieces the Perl reader concatenates. */
export function unhussle(text: string): string {
  let rest = text;
  let out = '';
  const rev = (s: string) => [...s].reverse().join('');
  while (rest.length > 50) {
    const seg = rest.slice(0, 50);
    rest = rest.slice(50);
    if (rest.length < 2) {
      out += seg;
      continue;
    }
    out += rev(seg.slice(45, 50)) + seg.slice(5, 10) + rev(seg.slice(26, 40)) + seg.slice(24, 26) + rev(seg.slice(10, 24)) + seg.slice(40, 45) + rev(seg.slice(0, 5));
  }
  return out + rest;
}

/** The chart string of the music field (with its magic prefix). */
export function decodeMusicField(field: string): string {
  if (!field.startsWith(PREFIX)) throw new IRealDecodeError('the music field does not start with 1r34LbKcu7');
  return unhussle(field.slice(PREFIX.length)).replaceAll('XyQ', '   ').replaceAll('LZ', ' |').replaceAll('Kcl', '| x');
}

/** Splits the link into songs (usually one) and decodes each. */
export function decodeIRealLink(link: string): DecodedSong[] {
  const m = /^irealb:\/\/(.*)$/s.exec(link);
  if (!m) throw new IRealDecodeError('not an irealb:// link');
  const songs = decodeURIComponent(m[1]!).split('===');
  return songs.map((s) => decodeSong(s));
}

/** The old plain link. */
export function decodeIRealBookLink(link: string): { title: string; composer: string; style: string; key: string; bars: DecodedBar[]; music: string } {
  const m = /^irealbook:\/\/(.*)$/s.exec(link);
  if (!m) throw new IRealDecodeError('not an irealbook:// link');
  const f = decodeURIComponent(m[1]!).split('=');
  if (f.length !== 6) throw new IRealDecodeError(`irealbook song with ${f.length} fields`);
  return { title: f[0]!, composer: f[1]!, style: f[2]!, key: f[3]!, music: f[5]!, bars: tokenize(f[5]!) };
}

function decodeSong(text: string): DecodedSong {
  const f = text.split('=');
  if (f.length !== 10) throw new IRealDecodeError(`song with ${f.length} fields, expected 10`);
  if (f[2] !== '') throw new IRealDecodeError('field 3 is expected empty');
  const music = decodeMusicField(f[6]!);
  return {
    title: f[0]!,
    composer: f[1]!,
    style: f[3]!,
    key: f[4]!,
    transpose: f[5]!,
    feel: f[7]!,
    bpm: Number(f[8]),
    repeats: Number(f[9]),
    music,
    bars: tokenize(music),
  };
}

// ---------------------------------------------------------------- bars and cells

const CHORD = /^([A-G][b#]?)((?:sus|alt|add|[+\-^\dhob#])*)(\/[A-G][b#]?)?/;

/** Reads a chart string into bars of cells. A bar is what lies between two bar lines. */
export function tokenize(music: string): DecodedBar[] {
  const bars: DecodedBar[] = [];
  let cur: DecodedBar = fresh();
  let started = false;
  let s = music;
  const close = (c: DecodedBar['close']) => {
    cur.close = c;
    bars.push(cur);
    cur = fresh();
    started = false;
  };
  function fresh(): DecodedBar {
    return { open: '', close: '|', section: null, comments: [], timeSignature: null, cells: [] };
  }
  while (s.length > 0) {
    let m: RegExpExecArray | null;
    const c = s[0]!;
    if ((m = /^T(\d)(\d)/.exec(s))) {
      cur.timeSignature = { numerator: Number(m[1]), denominator: Number(m[2]) };
      s = s.slice(m[0].length);
    } else if ((m = /^\*([A-Za-z])/.exec(s))) {
      cur.section = m[1]!;
      s = s.slice(m[0].length);
    } else if ((m = /^<([^>]*)>/.exec(s))) {
      cur.comments.push(m[1]!);
      s = s.slice(m[0].length);
    } else if (c === '[' || c === '{') {
      if (started && cur.cells.length > 0) throw new IRealDecodeError(`opening ${c} inside a bar`);
      cur.open = c;
      s = s.slice(1);
    } else if (c === '|' || c === ']' || c === '}' || c === 'Z') {
      close(c);
      s = s.slice(1);
    } else if (c === ' ') {
      cur.cells.push('');
      started = true;
      s = s.slice(1);
    } else if (c === ',' || c === 'Y' || c === 'U' || c === 'S' || c === 'Q' || c === 'f' || c === 's' || c === 'l') {
      s = s.slice(1);
    } else if (c === 'n' || c === 'p' || c === 'x') {
      cur.cells.push(c);
      started = true;
      s = s.slice(1);
    } else if ((m = CHORD.exec(s))) {
      cur.cells.push(m[0]);
      started = true;
      s = s.slice(m[0].length);
    } else {
      throw new IRealDecodeError(`unexpected « ${s.slice(0, 8)} » in the chart string`);
    }
  }
  if (cur.cells.length > 0) throw new IRealDecodeError('chart string ends inside a bar');
  return bars;
}

// ---------------------------------------------------------------- chords

const ROOTS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function rootOf(name: string): number {
  const letter = ROOTS[name[0]!];
  if (letter === undefined) throw new IRealDecodeError(`bad note « ${name} »`);
  return (letter + (name[1] === '#' ? 1 : name[1] === 'b' ? -1 : 0) + 12) % 12;
}

/** What a quality text means, by grammar. */
export function qualityOf(text: string): { quality: ChordQuality; extensions: ChordExtension[] } {
  const alterations = (s: string): ChordExtension[] => {
    const out: ChordExtension[] = [];
    let rest = s;
    while (rest.length > 0) {
      const m = /^(b9|#9|b5|#5|#11|b13)/.exec(rest);
      if (!m) throw new IRealDecodeError(`unknown alteration « ${rest} » in « ${text} »`);
      out.push(m[1] as ChordExtension);
      rest = rest.slice(m[0].length);
    }
    return out;
  };
  const fixed: Record<string, [ChordQuality, ChordExtension[]]> = {
    '': ['maj', []], add9: ['maj', ['9']], '6': ['maj6', []], '69': ['maj6', ['9']],
    '-': ['min', []], '-b6': ['min', ['b13']], '-#5': ['min', ['#5']], '-6': ['min6', []], '-69': ['min6', ['9']],
    o: ['dim', []], o7: ['dim7', []], h7: ['hdim7', []], h9: ['hdim7', ['9']], '+': ['aug', []], '2': ['sus2', []], sus: ['sus4', []],
    '^7': ['maj7', []], '^9': ['maj7', ['9']], '^13': ['maj7', ['13']], '^7#11': ['maj7', ['#11']], '^9#11': ['maj7', ['9', '#11']], '^7#5': ['maj7', ['#5']],
    '-7': ['min7', []], '-9': ['min7', ['9']], '-11': ['min7', ['11']], '-7b5': ['min7', ['b5']],
    '-^7': ['minmaj7', []], '-^9': ['minmaj7', ['9']],
    '7alt': ['7', ['alt']],
  };
  const hit = fixed[text];
  if (hit) return { quality: hit[0], extensions: [...hit[1]] };
  let m: RegExpExecArray | null;
  // Suspended dominants: 7sus, 9sus, 13sus, 7b9sus, 7b13sus.
  if ((m = /^(7|9|13)((?:b9|b13)?)sus$/.exec(text))) {
    const ext: ChordExtension[] = m[1] === '7' ? [] : [m[1] as ChordExtension];
    return { quality: '7sus4', extensions: [...ext, ...alterations(m[2]!)] };
  }
  // Dominants: 7 / 9 / 11 / 13 followed by alterations.
  if ((m = /^(7|9|11|13)((?:b9|#9|b5|#5|#11|b13)*)$/.exec(text))) {
    const ext: ChordExtension[] = m[1] === '7' ? [] : [m[1] as ChordExtension];
    return { quality: '7', extensions: [...ext, ...alterations(m[2]!)] };
  }
  throw new IRealDecodeError(`unknown chord quality « ${text} »`);
}

const EXT_ORDER = ['6', 'b5', '#5', 'b9', '9', '#9', '11', '#11', 'b13', '13', 'alt'];

/** A chord token (`Bb-7/Eb`, `n`) as an app chord; null for « N.C. ». */
export function decodeChord(token: string): ChordSymbol | null {
  if (token === 'n') return null;
  const m = CHORD.exec(token);
  if (!m || m[0] !== token) throw new IRealDecodeError(`not a chord: « ${token} »`);
  const q = qualityOf(m[2]!);
  return {
    root: rootOf(m[1]!),
    quality: q.quality,
    extensions: [...q.extensions].sort((a, b) => EXT_ORDER.indexOf(a) - EXT_ORDER.indexOf(b)),
    bass: m[3] ? rootOf(m[3].slice(1)) : null,
  };
}

/** The notes of a key field: `Bb`, `F#-`. */
export function decodeKey(text: string): { tonic: number; mode: 'major' | 'minor' } {
  const minor = text.endsWith('-');
  return { tonic: rootOf(minor ? text.slice(0, -1) : text), mode: minor ? 'minor' : 'major' };
}

// ---------------------------------------------------------------- beats

export interface DecodedChartBar {
  /** Chords starting at beat `beat` (the cell index: this export writes one cell per beat). */
  chords: { beat: number; chord: ChordSymbol | null }[];
  /** The previous bar's chord(s) go on all through the bar (`x`, or only slashes / empty cells). */
  repeat: boolean;
  section: string | null;
  comments: string[];
  doubleBarBefore: boolean;
  timeSignature: { numerator: number; denominator: number } | null;
  beats: number;
  final: boolean;
}

/**
 * The bars as the app reads a chart: chords by beat, with `x` and slashes
 * meaning « the chord goes on ». The meter in force gives the number of beats.
 */
export function chartBarsOf(bars: readonly DecodedBar[]): DecodedChartBar[] {
  return bars.map((b, i) => {
    const chords: DecodedChartBar['chords'] = [];
    b.cells.forEach((cell, beat) => {
      if (cell === '' || cell === 'p' || cell === 'x') return;
      chords.push({ beat, chord: decodeChord(cell) });
    });
    const prev = bars[i - 1];
    return {
      chords,
      repeat: chords.length === 0 && b.cells.some((c) => c === 'x' || c === 'p'),
      section: b.section,
      comments: b.comments,
      doubleBarBefore: i > 0 && (b.open === '[' || prev?.close === ']'),
      timeSignature: b.timeSignature,
      beats: b.cells.length,
      final: b.close === 'Z',
    };
  });
}

export { NO_CHORD_TEXT };
