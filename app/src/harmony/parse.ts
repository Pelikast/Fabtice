// Reading chord symbols: what a player types (« Bb-7 », « F7(b9) », « Ebmaj7/G »,
// « C△ », « Dø », « N.C. »), and the Harte labels of the analysis models
// (« C#:min7(9) », « B:7(#9) », « N »).

import type { ChordExtension, ChordQuality, ChordSymbol } from '../model/harmony';
import { chord, isChordExtension } from './chord';
import { parseNoteName, pc, pitchClassOf } from './pitch';

/** Result of reading a symbol: a chord, « N.C. » (`chord: null`), or not understood. */
export type ParsedChord = { ok: true; chord: ChordSymbol | null } | { ok: false };

const NOT_UNDERSTOOD: ParsedChord = { ok: false };

// Aliases of the quality, tried longest first on the normalised text
// (♭ -> b, ♯ -> #, △ Δ ^ -> ^, – − - -> -, words in lower case). Each gives a
// quality and the extensions it implies (C9 = C7 with a 9).
const QUALITY_ALIASES: [string, ChordQuality, ChordExtension[]][] = [
  ['m7b5', 'hdim7', []], ['-7b5', 'hdim7', []], ['min7b5', 'hdim7', []], ['ø7', 'hdim7', []], ['ø', 'hdim7', []], ['h7', 'hdim7', []],
  ['dim7', 'dim7', []], ['°7', 'dim7', []], ['o7', 'dim7', []], ['dim', 'dim', []], ['°', 'dim', []], ['o', 'dim', []],
  ['m(maj7)', 'minmaj7', []], ['m(^7)', 'minmaj7', []], ['minmaj7', 'minmaj7', []], ['mmaj7', 'minmaj7', []], ['mM7', 'minmaj7', []],
  ['m^7', 'minmaj7', []], ['-^7', 'minmaj7', []], ['m^', 'minmaj7', []], ['-^', 'minmaj7', []],
  ['maj13', 'maj7', ['13']], ['maj9', 'maj7', ['9']], ['^13', 'maj7', ['13']], ['^9', 'maj7', ['9']],
  ['maj7', 'maj7', []], ['ma7', 'maj7', []], ['M7', 'maj7', []], ['^7', 'maj7', []], ['^', 'maj7', []],
  ['m11', 'min7', ['11']], ['-11', 'min7', ['11']], ['m9', 'min7', ['9']], ['-9', 'min7', ['9']],
  ['min7', 'min7', []], ['mi7', 'min7', []], ['m7', 'min7', []], ['-7', 'min7', []],
  ['m69', 'min6', ['9']], ['-69', 'min6', ['9']], ['m6/9', 'min6', ['9']], ['-6/9', 'min6', ['9']],
  ['min6', 'min6', []], ['m6', 'min6', []], ['-6', 'min6', []],
  ['min', 'min', []], ['mi', 'min', []], ['m', 'min', []], ['-', 'min', []],
  ['13sus4', '7sus4', ['13']], ['13sus', '7sus4', ['13']], ['9sus4', '7sus4', ['9']], ['9sus', '7sus4', ['9']],
  ['7sus4', '7sus4', []], ['7sus', '7sus4', []], ['sus4', 'sus4', []], ['sus2', 'sus2', []], ['sus', 'sus4', []],
  ['aug7', 'aug7', []], ['7#5', 'aug7', []], ['7+5', 'aug7', []], ['+7', 'aug7', []], ['7+', 'aug7', []], ['aug', 'aug', []], ['+', 'aug', []],
  ['6/9', 'maj6', ['9']], ['69', 'maj6', ['9']], ['6', 'maj6', []],
  ['7alt', '7', ['alt']], ['alt', '7', ['alt']], ['13', '7', ['13']], ['11', '7', ['11']], ['9', '7', ['9']], ['7', '7', []],
  ['maj', 'maj', []], ['M', 'maj', []],
].sort((a, b) => (b[0] as string).length - (a[0] as string).length) as [string, ChordQuality, ChordExtension[]][];

function normalise(text: string): string {
  return text
    .replace(/♭/g, 'b')
    .replace(/♯/g, '#')
    .replace(/[△Δ∆]/g, '^')
    .replace(/[–−—]/g, '-')
    .replace(/\s+/g, '')
    .replace(/maj|min|dim|aug|sus|alt|add/gi, (w) => w.toLowerCase());
}

/** Extensions after the quality: « (b9) », « b9#11 », « (9, 13) », « add9 ». */
function readExtensions(rest: string): ChordExtension[] | null {
  const out: ChordExtension[] = [];
  let s = rest;
  for (;;) {
    s = s.replace(/^[,()]+/, '');
    if (s === '') return out;
    const m = /^(?:add)?((?:b|#)?(?:13|11|9|6|5)|alt)/.exec(s);
    if (!m) return null;
    const e = m[1]!;
    if (!isChordExtension(e)) return null;
    if (!out.includes(e)) out.push(e);
    s = s.slice(m[0].length);
  }
}

/** Reads what a player types. Root letter in any case; « b » and « # » or ♭ ♯ for accidentals. */
export function parseChord(text: string): ParsedChord {
  const raw = text.trim();
  if (raw === '') return NOT_UNDERSTOOD;
  if (/^(n\.?\s*c\.?|nc)$/i.test(raw)) return { ok: true, chord: null };
  const s = normalise(raw);
  const head = /^([A-Ga-g])([b#]?)/.exec(s);
  if (!head) return NOT_UNDERSTOOD;
  const root = parseNoteName(head[1]! + head[2]!);
  if (!root) return NOT_UNDERSTOOD;
  let rest = s.slice(head[0].length);

  let bass: number | null = null;
  const slash = /\/([A-Ga-g][b#]?)$/.exec(rest);
  if (slash) {
    const b = parseNoteName(slash[1]!);
    if (!b) return NOT_UNDERSTOOD;
    bass = pitchClassOf(b);
    rest = rest.slice(0, slash.index);
  }

  let quality: ChordQuality = 'maj';
  let implied: ChordExtension[] = [];
  for (const [alias, q, ext] of QUALITY_ALIASES) {
    if (rest.startsWith(alias)) {
      quality = q;
      implied = ext;
      rest = rest.slice(alias.length);
      break;
    }
  }
  const extensions = readExtensions(rest);
  if (extensions === null) return NOT_UNDERSTOOD;
  const all = [...implied, ...extensions.filter((e) => !implied.includes(e))];
  return { ok: true, chord: chord(pitchClassOf(root), quality, all, bass) };
}

// ---------------------------------------------------------------- Harte labels

const HARTE_QUALITY: Record<string, [ChordQuality, ChordExtension[]]> = {
  '': ['maj', []], maj: ['maj', []], min: ['min', []], aug: ['aug', []], dim: ['dim', []],
  sus2: ['sus2', []], sus4: ['sus4', []], '7': ['7', []], maj7: ['maj7', []], min7: ['min7', []],
  minmaj7: ['minmaj7', []], maj6: ['maj6', []], min6: ['min6', []], dim7: ['dim7', []], hdim7: ['hdim7', []],
  '9': ['7', ['9']], maj9: ['maj7', ['9']], min9: ['min7', ['9']], '11': ['7', ['11']], min11: ['min7', ['11']],
  '13': ['7', ['13']], maj13: ['maj7', ['13']], min13: ['min7', ['13']],
};

/** Harte degrees (« b7 », « 3 », « #4 ») to semitones above the root. */
const DEGREE_SEMITONES: Record<string, number> = { '1': 0, '2': 2, '3': 4, '4': 5, '5': 7, '6': 9, '7': 11, '9': 2, '11': 5, '13': 9 };

function degreeSemitones(d: string): number | null {
  const m = /^([b#]*)(\d+)$/.exec(d);
  if (!m) return null;
  const base = DEGREE_SEMITONES[m[2]!];
  if (base === undefined) return null;
  let s = base;
  for (const ch of m[1]!) s += ch === 'b' ? -1 : 1;
  return s;
}

/**
 * Reads a Harte label (« C#:min7(9) », « B:7(#9) », « A:7(9,13) », « C:maj/5 »).
 * « N » is « N.C. »; « X » (unknown) and anything unreadable are not understood.
 * Degrees in parentheses that are extensions are kept; chord tones and
 * omissions (« *3 ») are dropped.
 */
export function parseHarte(label: string): ParsedChord {
  const s = label.trim();
  if (s === 'N') return { ok: true, chord: null };
  const m = /^([A-G])([b#]*):?([a-z0-9]*)(?:\(([^)]*)\))?(?:\/([b#]*\d+))?$/.exec(s);
  if (!m) return NOT_UNDERSTOOD;
  let root = 'CDEFGAB'.indexOf(m[1]!) >= 0 ? [0, 2, 4, 5, 7, 9, 11]['CDEFGAB'.indexOf(m[1]!)]! : 0;
  for (const ch of m[2]!) root += ch === 'b' ? -1 : 1;
  const q = HARTE_QUALITY[m[3] ?? ''];
  if (!q) return NOT_UNDERSTOOD;
  const [quality, implied] = q;
  const extensions: ChordExtension[] = [...implied];
  for (const d of (m[4] ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
    if (d.startsWith('*')) continue;
    if (isChordExtension(d) && !extensions.includes(d)) extensions.push(d);
  }
  let bass: number | null = null;
  if (m[5]) {
    const semis = degreeSemitones(m[5]);
    if (semis === null) return NOT_UNDERSTOOD;
    bass = pc(root + semis);
  }
  return { ok: true, chord: chord(pc(root), quality, sortExtensions(extensions), bass) };
}

const EXTENSION_ORDER: Record<ChordExtension, number> = { '6': 0, b5: 1, '#5': 2, b9: 3, '9': 4, '#9': 5, '11': 6, '#11': 7, b13: 8, '13': 9, alt: 10 };

/** Extensions in the order a chart writes them: 6, 5ths, 9ths, 11ths, 13ths, alt. */
export function sortExtensions(ext: ChordExtension[]): ChordExtension[] {
  return [...ext].sort((a, b) => EXTENSION_ORDER[a] - EXTENSION_ORDER[b]);
}
