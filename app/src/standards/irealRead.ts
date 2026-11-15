// Reader of iReal Pro charts (`irealb://` and the old `irealbook://` links, and
// the HTML pages or text files that carry them), for the « known charts of
// standards » safety net of the chord analysis.
//
// The format is described next to the writer, in `../export/IREAL-FORMAT.md`
// (which says what is written there); what a REAL playlist adds is handled
// here and listed in `README` of this folder: repeats and endings, codas,
// `x` / `r` repeat signs, alternate chords, `W`, small chords, several
// meters, links that are percent-encoded only field by field.
//
// What comes out is the chart UNFOLDED to the linear form as played: every bar
// that is played is a bar of `bars`, in playing order (a repeated section
// appears twice, a first and second ending each once, `D.C.` / `D.S.` / coda
// followed once). Each bar holds chords at integer beat positions, in the
// app's own `ChordSymbol`. A chord with no exact counterpart is the closest one
// and `approximate` is set; the original text is always kept (`text`).
//
// Pure: no DOM, no I/O, runs in the main process, a worker or the page. A bad
// song never throws for the playlist: it is listed in `skipped` with a reason.

import { chord as makeChord, NO_CHORD_TEXT } from '../harmony/chord';
import { sortExtensions } from '../harmony/parse';
import { IREAL_TEXT_MEANING } from '../export/irealChords';
import { parseNoteName, pitchClassOf } from '../harmony/pitch';
import type { ChordExtension, ChordQuality, ChordSymbol, Key } from '../model/harmony';
import { isChordExtension } from '../harmony/chord';
import type { Meter } from '../model/tempoMap';

export { NO_CHORD_TEXT };

export const IREAL_MUSIC_PREFIX = '1r34LbKcu7';

// ---------------------------------------------------------------- result types

/** A chord that starts at `beat` (0-based, in beats of the bar's meter) and lasts `duration` beats. */
export interface ReadChord {
  beat: number;
  duration: number;
  /** null = « N.C. ». */
  chord: ChordSymbol | null;
  /** The chord as the chart writes it (« Bb^7#11/D », « n »). */
  text: string;
  /** The app's chord is the closest one: iReal's text has no exact equivalent (« C5 », an unknown extension…). */
  approximate: boolean;
}

/** A chord written small above the main one (in parentheses): kept as an alternative, never played in place of it. */
export interface ReadAlternate {
  beat: number;
  chord: ChordSymbol | null;
  text: string;
  approximate: boolean;
}

export interface ReadBar {
  /** Index of the bar in the chart as written (0-based): a bar played twice appears twice with the same `source`. */
  source: number;
  meter: Meter;
  /** Chords that START in this bar, by beat. A bar with none (or none on beat 0) continues the chord of the previous bar. */
  chords: ReadChord[];
  alternates: ReadAlternate[];
  /** Section mark (« A », « B », « C », « D », « i » intro, « v » verse) when one starts here. */
  section: string | null;
  /** Comments of the chart (« D.S. al Coda », « Fine », free texts), trimmed. */
  comments: string[];
  /** 1-based pass through the repeat this bar was played in (1 outside repeats). */
  pass: number;
  /** Ending (1, 2, 3) this bar belongs to, or null. */
  ending: number | null;
  /** The bar is a copy made by the sign `x` (one bar) or `r` (two bars). */
  simile: 'x' | 'r' | null;
}

export interface StandardChart {
  /** Position in the playlist (0-based). */
  index: number;
  /** « The Girl From Ipanema » (iReal writes « Girl From Ipanema, The »). */
  title: string;
  /** The title as it is in the link. */
  rawTitle: string;
  /** « Antonio-Carlos Jobim » (iReal writes « Jobim Antonio-Carlos » when there are two names). */
  composer: string;
  composerRaw: string;
  /** iReal style (« Medium Swing », « Bossa Nova »…). */
  style: string;
  /** Playback feel (« Jazz-Medium Swing »), when the link has one. */
  feel: string | null;
  /** Key of the chart as written; null when it is not one of the 24 iReal keys. */
  key: Key | null;
  /** The key text (« Bb », « F#- »). */
  keyText: string;
  /** Tempo of the chart, when given. */
  bpm: number | null;
  /** Meter at the start; `meters` lists every meter the chart uses, in order of appearance. */
  meter: Meter;
  meters: Meter[];
  /** Bars in the chart as written (before unfolding). */
  writtenBars: number;
  /** The chart unfolded: every bar in playing order. */
  bars: ReadBar[];
  /** Remarks on what could not be read exactly (English, for diagnostics). */
  warnings: string[];
}

export interface SkippedSong {
  index: number;
  title: string;
  reason: string;
}

export interface IRealPlaylist {
  /** « Jazz 1460 »; null for a single song. */
  name: string | null;
  songs: StandardChart[];
  skipped: SkippedSong[];
  /** Number of `irealb://` / `irealbook://` links found. */
  linkCount: number;
}

/** A song cut out of the link but not yet read: cheap (title, composer), the chart is read by `readIRealSong`. */
export interface RawIRealSong {
  index: number;
  format: 'irealb' | 'irealbook';
  title: string;
  composer: string;
  style: string;
  key: string;
  transpose: string;
  /** The music field as in the link (with its magic prefix for `irealb`). */
  music: string;
  feel: string;
  bpm: string;
}

// ---------------------------------------------------------------- text helpers

/** `decodeURIComponent` that never throws: bad escapes stay as they are. */
export function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
      try {
        return decodeURIComponent(run);
      } catch {
        return run;
      }
    });
  }
}

const HTML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (all, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : all;
    }
    return HTML_ENTITIES[e] ?? all;
  });
}

/**
 * Every `irealb://…` and `irealbook://…` link of a text: an HTML page (`href="…"`), a text file
 * holding the link, or several links. Percent-encoded text stops at a quote, `<`, `>` or a space.
 */
export function extractIRealLinks(text: string): string[] {
  const out: string[] = [];
  // `'` is legal inside a link (encodeURIComponent leaves it alone: « 'S Wonderful »): it ends a link
  // only when the link was opened by one.
  const re = /(["']?)(irealb(?:ook)?:\/\/)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[1]!.length;
    const stop = m[1] === "'" ? /['<>\s]/ : /["<>\s]/;
    const rest = text.slice(start);
    const end = rest.search(stop);
    const link = end < 0 ? rest : rest.slice(0, end);
    out.push(decodeEntities(link));
    re.lastIndex = start + link.length;
  }
  return out;
}

/**
 * Links to playlist FILES an HTML page points to (a forum thread whose playlist is an attached `.html`
 * file, or a page that links to `.html` / `.txt` files): `href` values that contain « /attachments/ » or end in `.html`, `.htm` or `.txt`, made absolute against `baseUrl`. Only the
 * addresses on the same host as `baseUrl` are returned, de-duplicated, in page order.
 */
export function extractPlaylistFileLinks(html: string, baseUrl: string): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const out: string[] = [];
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = decodeEntities(m[1]!);
    if (!/\/attachments\/|\.(?:html?|txt)(?:[?#].*)?$/i.test(href)) continue;
    try {
      const url = new URL(href, base);
      if (url.protocol === 'https:' && url.host === base.host && !out.includes(url.href)) out.push(url.href);
    } catch {
      // not a link
    }
  }
  return out;
}

/** The shuffle of iReal's chart string (its own inverse): pieces of 50 characters, shuffled unless fewer than two follow. */
export function unhussle(text: string): string {
  let rest = text;
  let out = '';
  while (rest.length > 50) {
    const piece = rest.slice(0, 50);
    rest = rest.slice(50);
    if (rest.length < 2) {
      out += piece;
      continue;
    }
    const c = piece.split('');
    const o = c.slice();
    for (let i = 0; i < 5; i++) {
      o[49 - i] = c[i]!;
      o[i] = c[49 - i]!;
    }
    for (let i = 10; i < 24; i++) {
      o[49 - i] = c[i]!;
      o[i] = c[49 - i]!;
    }
    out += o.join('');
  }
  return out + rest;
}

/** The music field of an `irealb` song (with its prefix) as the plain chart string. */
export function deobfuscate(field: string): string {
  const body = field.startsWith(IREAL_MUSIC_PREFIX) ? field.slice(IREAL_MUSIC_PREFIX.length) : field;
  return unhussle(body).replaceAll('XyQ', '   ').replaceAll('LZ', ' |').replaceAll('Kcl', '| x');
}

// ---------------------------------------------------------------- keys, titles

const KEY_RE = /^([A-G])([b#]?)(-|m)?$/;

/** « Bb » → B♭ major, « F#- » → F♯ minor; null when it is not a key. */
export function parseIRealKey(text: string): Key | null {
  const m = KEY_RE.exec(text.trim());
  if (!m) return null;
  const note = parseNoteName(m[1]! + m[2]!);
  if (!note) return null;
  return { tonic: pitchClassOf(note), mode: m[3] ? 'minor' : 'major' };
}

/** « Gentle Rain, The » → « The Gentle Rain ». */
export function displayTitle(raw: string): string {
  const t = raw.trim().replace(/\s+/g, ' ');
  const m = /^(.*\S),\s*(The|A|An|Les?|La|L'|Il|Das|Der|Die|El|Os?|As?)$/i.exec(t);
  if (!m) return t;
  const article = m[2]!;
  return article.endsWith("'") ? `${article}${m[1]!}` : `${article} ${m[1]!}`;
}

/** « Jobim Antonio-Carlos » → « Antonio-Carlos Jobim » (iReal puts the last name first when there are two names). */
export function displayComposer(raw: string): string {
  const t = raw.trim().replace(/\s+/g, ' ');
  const parts = t.split(' ');
  return parts.length === 2 ? `${parts[1]!} ${parts[0]!}` : t;
}

// ---------------------------------------------------------------- the chord text

interface QualityMeaning {
  quality: ChordQuality;
  ext: ChordExtension[];
  approximate: boolean;
}

const ALTERATION = /^(b|#)(5|9|11|13)/;

/** What a quality text (« 7b9 », « ^7#11 », « -7 », « h7 », « sus »…) means in the app's vocabulary. */
export function iRealQualityMeaning(text: string): QualityMeaning {
  const exact = IREAL_TEXT_MEANING.get(text);
  if (exact) return { quality: exact.quality, ext: sortExtensions([...exact.ext]), approximate: false };
  let s = text.replace(/ø/g, 'h').replace('6/9', '69');
  const exact2 = IREAL_TEXT_MEANING.get(s);
  if (exact2) return { quality: exact2.quality, ext: sortExtensions([...exact2.ext]), approximate: false };

  type Family = 'dom' | 'maj' | 'min' | 'mm' | 'dim' | 'hdim' | 'aug';
  let family: Family = 'dom';
  if (s.startsWith('-^')) {
    family = 'mm';
    s = s.slice(2);
  } else if (s.startsWith('^')) {
    family = 'maj';
    s = s.slice(1);
  } else if (s.startsWith('-')) {
    family = 'min';
    s = s.slice(1);
  } else if (s.startsWith('o')) {
    family = 'dim';
    s = s.slice(1);
  } else if (s.startsWith('h')) {
    family = 'hdim';
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    family = 'aug';
    s = s.slice(1);
  }
  const numMatch = /^(69|13|11|9|7|6|5|2)/.exec(s);
  const num = numMatch ? numMatch[1]! : '';
  s = s.slice(num.length);

  let approximate = false;
  const ext: ChordExtension[] = [];
  const addExt = (e: string): void => {
    if (isChordExtension(e)) {
      if (!ext.includes(e)) ext.push(e);
    } else approximate = true;
  };
  let sus = false;
  let alt = false;
  let dimMajor = false;
  for (let guard = 0; s !== '' && guard < 20; guard++) {
    let m: RegExpExecArray | null;
    if (s.startsWith('sus')) {
      sus = true;
      s = s.slice(3).replace(/^[24]/, (d) => (d === '2' ? ((approximate = true), '') : ''));
    } else if (s.startsWith('alt')) {
      alt = true;
      s = s.slice(3);
    } else if ((m = /^add(\d+)/.exec(s))) {
      addExt(m[1]!);
      s = s.slice(m[0].length);
    } else if ((m = ALTERATION.exec(s))) {
      addExt(m[0]);
      s = s.slice(m[0].length);
    } else if (family === 'dim' && s.startsWith('^7')) {
      // « Co^7 »: a diminished triad with a major seventh; the diminished seventh is the closest chord
      dimMajor = true;
      approximate = true;
      s = s.slice(2);
    } else if ((m = /^(\d+)/.exec(s))) {
      // a second number: « 7 9 » style leftovers; an extension if the app has it
      addExt(m[1]!);
      s = s.slice(m[0].length);
    } else {
      approximate = true;
      break;
    }
  }

  let quality: ChordQuality;
  const withNum = (): void => {
    if (num === '9' || num === '11' || num === '13') addExt(num);
  };
  switch (family) {
    case 'maj':
      quality = num === '6' ? 'maj6' : num === '69' ? 'maj6' : 'maj7';
      if (num === '69') addExt('9');
      else if (num === '5') approximate = true;
      else withNum();
      break;
    case 'min':
      quality = num === '' ? 'min' : num === '6' || num === '69' ? 'min6' : 'min7';
      if (num === '69') addExt('9');
      else if (num === '5' || num === '2') approximate = true;
      else withNum();
      break;
    case 'mm':
      quality = 'minmaj7';
      withNum();
      break;
    case 'dim':
      quality = num === '7' ? 'dim7' : 'dim';
      if (num === '9' || num === '11' || num === '13') approximate = true;
      break;
    case 'hdim':
      quality = 'hdim7';
      withNum();
      break;
    case 'aug':
      quality = num === '' ? 'aug' : 'aug7';
      withNum();
      break;
    case 'dom':
    default:
      if (num === '') quality = sus ? 'sus4' : 'maj';
      else if (num === '2') quality = 'sus2';
      else if (num === '5') {
        quality = 'maj';
        approximate = true;
      } else if (num === '6' || num === '69') {
        quality = 'maj6';
        if (num === '69') addExt('9');
      } else {
        quality = sus ? '7sus4' : '7';
        withNum();
      }
      break;
  }
  if (dimMajor) quality = 'dim7';
  if (alt) {
    if (quality === 'maj' || quality === 'sus4') quality = '7';
    addExt('alt');
  }
  if (sus && quality !== '7sus4' && quality !== 'sus4' && quality !== 'sus2') approximate = true;
  return { quality, ext: sortExtensions(ext), approximate };
}

/** `Bb^7#11/D`-style text (without the alternate chord) → app chord. Null when it is not a chord. */
export function chordFromIRealText(text: string): { chord: ChordSymbol; approximate: boolean } | null {
  const m = /^([A-G][b#]?)(.*?)(?:\/([A-G][b#]?))?$/.exec(text);
  if (!m) return null;
  const root = parseNoteName(m[1]!);
  if (!root) return null;
  const bassNote = m[3] ? parseNoteName(m[3]) : null;
  const q = iRealQualityMeaning(m[2]!.replace(/\*[^*]*\*/g, ''));
  return {
    chord: makeChord(pitchClassOf(root), q.quality, q.ext, bassNote ? pitchClassOf(bassNote) : null),
    approximate: q.approximate,
  };
}

/**
 * The chord as the chord analysis would name it, to compare a chart with what is heard: iReal writes
 * a half-diminished chord « m7♭5 » (`-7b5`) and an augmented seventh « 7♯5 »; the analysis calls them
 * `hdim7` and `aug7`. Everything else is returned as it is. (The reader itself keeps what the chart
 * says, so that a chart this app writes reads back identical.)
 */
export function asAnalysisChord(c: ChordSymbol): ChordSymbol {
  if (c.quality === 'min7' && c.extensions.includes('b5')) return makeChord(c.root, 'hdim7', c.extensions.filter((e) => e !== 'b5'), c.bass);
  if (c.quality === '7' && c.extensions.includes('#5') && !c.extensions.includes('alt')) return makeChord(c.root, 'aug7', c.extensions.filter((e) => e !== '#5'), c.bass);
  return c;
}

// ---------------------------------------------------------------- the chart string: tokens

type Cell =
  | { k: 'sp' }
  | { k: 'p' }
  | { k: 'x' }
  | { k: 'r' }
  | { k: 'nc'; short: boolean }
  | { k: 'chord'; text: string; short: boolean }
  | { k: 'W'; bass: string | null; short: boolean };

interface CellAlt {
  /** Index in `cells` of the cell the alternate chord belongs to. */
  cell: number;
  text: string;
}

interface WrittenBar {
  open: '' | '[' | '{';
  close: '|' | ']' | '}' | 'Z';
  section: string | null;
  meter: Meter | null;
  /** `N1`…`N3` seen in this bar (0 = « no ending »). */
  ending: number | null;
  coda: 'start' | 'end' | null;
  segno: boolean;
  end: boolean;
  comments: string[];
  cells: Cell[];
  alts: CellAlt[];
}

const CHORD_TOKEN = /([A-G][b#]?)((?:sus|alt|add|6\/9|[+\-^\dhoøb#])*)(\*[^*]*\*)*(\/[A-G][b#]?)?(\([^)]*\))?/y;
const FILLER_TOKEN = /([ Wp])(\/[A-G][b#]?)?(\([^)]*\))?/y;
const METER_TOKEN = /T(\d)(\d)/y;

const METERS: Record<string, Meter> = {
  '24': { numerator: 2, denominator: 4 },
  '34': { numerator: 3, denominator: 4 },
  '44': { numerator: 4, denominator: 4 },
  '54': { numerator: 5, denominator: 4 },
  '64': { numerator: 6, denominator: 4 },
  '74': { numerator: 7, denominator: 4 },
  '38': { numerator: 3, denominator: 8 },
  '58': { numerator: 5, denominator: 8 },
  '68': { numerator: 6, denominator: 8 },
  '78': { numerator: 7, denominator: 8 },
  '98': { numerator: 9, denominator: 8 },
  '12': { numerator: 12, denominator: 8 },
  '22': { numerator: 2, denominator: 2 },
  '32': { numerator: 3, denominator: 2 },
};

const DEFAULT_METER: Meter = { numerator: 4, denominator: 4 };

function freshBar(): WrittenBar {
  return { open: '', close: '|', section: null, meter: null, ending: null, coda: null, segno: false, end: false, comments: [], cells: [], alts: [] };
}

const isContent = (c: Cell): boolean => c.k !== 'sp';

interface Tokenized {
  bars: WrittenBar[];
  /** Characters of the chart string that were not understood (each skipped). */
  unknown: string;
}

/** The plain chart string → written bars. Padding (empty cells between sections, empty bars) is dropped. */
export function tokenizeChart(music: string): Tokenized {
  const bars: WrittenBar[] = [];
  let cur = freshBar();
  let smallChords = false;
  let unknown = '';
  let pendingR = false;
  let carry: WrittenBar | null = null;
  let pos = 0;

  const hasContent = (b: WrittenBar): boolean => b.cells.some(isContent);

  const closeBar = (close: WrittenBar['close']): void => {
    cur.close = close;
    const last = bars[bars.length - 1];
    if (hasContent(cur)) {
      bars.push(cur);
      pendingR = cur.cells.some((c) => c.k === 'r');
    } else if (pendingR && last) {
      // the second bar of a two-bar repeat « r » is empty on purpose
      cur.cells = [{ k: 'r' }];
      bars.push(cur);
      pendingR = false;
    } else {
      // an empty bar is padding: only its closing line (end repeat, double bar, end) counts, for the previous bar
      if (last && close !== '|' && last.close === '|') last.close = close;
      // its marks move to the next bar: a section, a meter, an ending, a coda sign (which then starts that bar), a comment
      carry = cur;
    }
    const next = freshBar();
    if (carry) {
      if (carry.section) next.section = carry.section;
      if (carry.meter) next.meter = carry.meter;
      if (carry.ending !== null) next.ending = carry.ending;
      if (carry.coda) next.coda = 'start';
      if (carry.segno) next.segno = true;
      if (carry.end) next.end = true;
      next.comments.push(...carry.comments);
      carry = null;
    }
    cur = next;
  };

  while (pos < music.length) {
    const c = music[pos]!;
    let m: RegExpExecArray | null;
    if (c === '[' || c === '{') {
      // an opening line: cells before it that are only spaces are padding
      if (!hasContent(cur)) {
        cur.cells = [];
        cur.alts = [];
      } else closeBar('|');
      cur.open = c;
      pos++;
    } else if (c === '|' || c === ']' || c === '}' || c === 'Z') {
      closeBar(c);
      pos++;
    } else if (c === '*' && /[A-Za-z]/.test(music[pos + 1] ?? '')) {
      cur.section = music[pos + 1]!;
      pos += 2;
    } else if (c === 'T' && ((METER_TOKEN.lastIndex = pos), (m = METER_TOKEN.exec(music)))) {
      const key = m[1]! + m[2]!;
      const meter = METERS[key] ?? (m[2] === '2' || m[2] === '4' || m[2] === '8' ? { numerator: Number(m[1]), denominator: Number(m[2]) } : null);
      if (meter) cur.meter = { ...meter };
      else unknown += m[0];
      pos += m[0].length;
    } else if (c === 'N' && /\d/.test(music[pos + 1] ?? '')) {
      const n = Number(music[pos + 1]);
      cur.ending = n;
      pos += 2;
    } else if (c === '<') {
      const end = music.indexOf('>', pos + 1);
      if (end < 0) {
        pos++;
        unknown += c;
      } else {
        const text = music.slice(pos + 1, end).replace(/^\*\d+/, '').replace(/\s+/g, ' ').trim();
        if (text !== '') cur.comments.push(text);
        pos = end + 1;
      }
    } else if (c === 'Q') {
      cur.coda = hasContent(cur) ? 'end' : 'start';
      pos++;
    } else if (c === 'S') {
      cur.segno = true;
      pos++;
    } else if (c === 'U') {
      cur.end = true;
      pos++;
    } else if (c === 's') {
      smallChords = true;
      pos++;
    } else if (c === 'l') {
      smallChords = false;
      pos++;
    } else if (c === 'f' || c === 'Y' || c === ',') {
      pos++;
    } else if (c === 'n' || c === 'x' || c === 'r') {
      cur.cells.push(c === 'n' ? { k: 'nc', short: smallChords } : { k: c });
      pos++;
      // an alternate chord may follow: « x(C7b9) »
      if (music[pos] === '(') {
        const close = music.indexOf(')', pos);
        if (close > 0) {
          cur.alts.push({ cell: cur.cells.length - 1, text: music.slice(pos + 1, close) });
          pos = close + 1;
        }
      }
    } else if (/[A-G]/.test(c) && ((CHORD_TOKEN.lastIndex = pos), (m = CHORD_TOKEN.exec(music)))) {
      const text = m[1]! + m[2]! + (m[4] ?? '');
      cur.cells.push({ k: 'chord', text, short: smallChords });
      if (m[5]) cur.alts.push({ cell: cur.cells.length - 1, text: m[5].slice(1, -1) });
      pos += m[0].length;
    } else if ((c === ' ' || c === 'W' || c === 'p') && ((FILLER_TOKEN.lastIndex = pos), (m = FILLER_TOKEN.exec(music)))) {
      const bass = m[2] ? m[2].slice(1) : null;
      if (m[1] === 'W') cur.cells.push({ k: 'W', bass, short: smallChords });
      else if (m[1] === 'p') cur.cells.push({ k: 'p' });
      else cur.cells.push({ k: 'sp' });
      if (m[3]) cur.alts.push({ cell: cur.cells.length - 1, text: m[3].slice(1, -1) });
      pos += m[0].length;
    } else {
      unknown += c;
      pos++;
    }
  }
  if (hasContent(cur)) {
    cur.close = 'Z';
    bars.push(cur);
  }
  return { bars, unknown };
}

// ---------------------------------------------------------------- beats in a bar

interface Resolved {
  meter: Meter;
  chords: ReadChord[];
  alternates: ReadAlternate[];
  simile: 'x' | 'r' | null;
}

interface Token {
  /** Cell index where the token starts. */
  start: number;
  kind: 'chord' | 'carry';
  short: boolean;
  spaces: number;
  cell: Cell | null;
}

/**
 * The rules of iReal Pro's player, as its forum documents them: a chord lasts at least one beat,
 * every empty cell (or slash) after it adds one; empty cells before the first chord are dropped;
 * if the bar is then longer than its meter, spaces are cut (first chord first); if shorter, the
 * free beats are shared out from the first chord on. Small chords (`s`) always last one beat.
 */
function placeChords(bar: WrittenBar, meter: Meter, lastChord: { text: string; chord: ChordSymbol | null; approximate: boolean } | null, warn: (m: string) => void): { chords: ReadChord[]; alternates: ReadAlternate[] } {
  const beats = Math.max(1, Math.min(meter.numerator, 16));
  const tokens: Token[] = [];
  bar.cells.forEach((cell, i) => {
    const prev = tokens[tokens.length - 1];
    if (cell.k === 'chord' || cell.k === 'nc' || cell.k === 'W') {
      tokens.push({ start: i, kind: 'chord', short: cell.short, spaces: 0, cell });
    } else if (cell.k === 'p' || cell.k === 'sp') {
      if (prev) {
        if (!prev.short) prev.spaces++;
      } else if (cell.k === 'p') {
        tokens.push({ start: i, kind: 'carry', short: false, spaces: 0, cell: null });
      }
      // empty cells before the first chord are dropped
    }
  });
  if (tokens.length > beats) {
    warn(`bar with ${tokens.length} chords in ${meter.numerator}/${meter.denominator}`);
    tokens.length = beats;
  }
  let total = tokens.reduce((n, t) => n + 1 + t.spaces, 0);
  if (tokens.length > 0) {
    while (total > beats) {
      let cut = false;
      for (const t of tokens) {
        if (total > beats && t.spaces > 0) {
          t.spaces--;
          total--;
          cut = true;
        }
      }
      if (!cut) break;
    }
    while (total < beats) {
      let grew = false;
      for (const t of tokens) {
        if (total < beats && !t.short) {
          t.spaces++;
          total++;
          grew = true;
        }
      }
      if (!grew) break;
    }
  }
  const chords: ReadChord[] = [];
  const beatOfCell = new Map<number, number>();
  let beat = 0;
  let lastText = lastChord;
  for (const t of tokens) {
    const duration = 1 + t.spaces;
    for (let k = 0; k < duration; k++) beatOfCell.set(t.start + k, beat + k);
    if (t.kind === 'chord' && t.cell) {
      const cell = t.cell;
      if (cell.k === 'nc') {
        chords.push({ beat, duration, chord: null, text: 'n', approximate: false });
        lastText = { text: 'n', chord: null, approximate: false };
      } else if (cell.k === 'chord') {
        const mapped = chordFromIRealText(cell.text);
        if (mapped) {
          chords.push({ beat, duration, chord: mapped.chord, text: cell.text, approximate: mapped.approximate });
          lastText = { text: cell.text, chord: mapped.chord, approximate: mapped.approximate };
        } else {
          warn(`unreadable chord « ${cell.text} »`);
          chords.push({ beat, duration, chord: null, text: cell.text, approximate: true });
        }
      } else if (cell.k === 'W') {
        // invisible chord: the previous chord again, with this bass note
        if (lastText && lastText.chord) {
          const bassNote = cell.bass ? parseNoteName(cell.bass) : null;
          const base = lastText.chord;
          const next = makeChord(base.root, base.quality, base.extensions, bassNote ? pitchClassOf(bassNote) : base.bass);
          const text = `${lastText.text.replace(/\/[A-G][b#]?$/, '')}${cell.bass ? `/${cell.bass}` : ''}`;
          chords.push({ beat, duration, chord: next, text, approximate: lastText.approximate });
          lastText = { text, chord: next, approximate: lastText.approximate };
        }
      }
    }
    beat += duration;
  }
  const alternates: ReadAlternate[] = [];
  for (const a of bar.alts) {
    const mapped = chordFromIRealText(a.text);
    if (!mapped) continue;
    const at = beatOfCell.get(a.cell);
    // a lone alternate before the first chord has no beat of its own: it goes with the first beat
    alternates.push({ beat: at ?? 0, chord: mapped.chord, text: a.text, approximate: mapped.approximate });
  }
  return { chords, alternates };
}

// ---------------------------------------------------------------- unfolding

interface DirectiveSet {
  /** « D.C. » / « D.S. ». */
  jump?: { kind: 'dc' | 'ds'; to: 'coda' | 'fine' | 'end'; ending: number | null };
  fine?: boolean;
  times?: number;
}

function directivesOf(comments: readonly string[]): DirectiveSet {
  const out: DirectiveSet = {};
  for (const raw of comments) {
    const text = raw.trim();
    let m: RegExpExecArray | null;
    if ((m = /^d\.?\s*([cs])\.?\s*al\s*(coda|fine|(\d)(?:st|nd|rd|th)?\s*end(?:ing)?\.?)$/i.exec(text))) {
      const to = /coda/i.test(m[2]!) ? 'coda' : /fine/i.test(m[2]!) ? 'fine' : 'end';
      out.jump = { kind: m[1]!.toLowerCase() === 'c' ? 'dc' : 'ds', to, ending: m[3] ? Number(m[3]) : null };
    } else if (/^fine$/i.test(text)) {
      out.fine = true;
    } else if ((m = /^(?:play\s+)?(\d+)\s*x$/i.exec(text))) {
      out.times = Number(m[1]);
    }
  }
  return out;
}

const MAX_UNFOLDED_BARS = 1500;

interface Played {
  source: number;
  pass: number;
  ending: number | null;
}

/**
 * Order in which the written bars are played.
 *
 * - `{ … }` repeats once (twice played), or as many times as its highest ending number, or as « 3x » says.
 * - `N1`, `N2`, `N3` start an ending that lasts to its end line (`}`, `]`, `Z`) or to the next ending or
 *   section; each pass plays its own ending. A `}` with no `{` before it repeats from the start (or from
 *   the end of the previous repeat).
 * - `D.C.` goes back to the start, `D.S.` to the segno; `al Fine` stops at « Fine » (or at the END mark
 *   `U`), `al Coda` plays to the first coda sign (« To Coda », at the end of its bar) and jumps to the
 *   last one (the coda itself, at the start of its bar); `al 2nd End.` plays that ending. Repeats are
 *   not taken again after a `D.C.` / `D.S.`, and the last ending is the one played.
 * - The chart stops at its final bar line `Z`; what lies after it (a written-out coda) is only reached by a jump.
 */
function playingOrder(bars: readonly WrittenBar[], warn: (m: string) => void): Played[] {
  const n = bars.length;
  // The ending in force for each bar: from an `N` mark to the end of its group of bars.
  const endingOf: number[] = new Array<number>(n).fill(0);
  let cur = 0;
  for (let i = 0; i < n; i++) {
    const b = bars[i]!;
    if (b.ending !== null) cur = b.ending;
    else if (cur !== 0 && (b.open !== '' || b.section !== null)) cur = 0;
    endingOf[i] = cur;
    if (cur !== 0 && (b.close === '}' || b.close === ']' || b.close === 'Z')) cur = 0;
  }
  const dir = bars.map((b) => directivesOf(b.comments));
  const codaBars: number[] = [];
  bars.forEach((b, i) => {
    if (b.coda) codaBars.push(i);
  });
  const segnoBar = bars.findIndex((b) => b.segno);

  /** Passes of the repeat that starts at `from` and first closes at `close`. */
  const passesOf = (from: number, close: number): number => {
    let maxEnding = 0;
    let times = 0;
    for (let k = from; k < n; k++) {
      if (k > close && endingOf[k] === 0) break;
      if (endingOf[k]! > maxEnding) maxEnding = endingOf[k]!;
      if (k <= close && dir[k]!.times) times = Math.max(times, dir[k]!.times!);
    }
    return Math.min(8, Math.max(2, maxEnding, times));
  };

  /** The ending played on a D.C. / D.S.: the one asked for, else the highest of the group that contains bar `i`. */
  const endingAfterJump = (i: number, asked: number | null): number => {
    if (asked !== null) return asked;
    let top = endingOf[i]!;
    for (let j = i; j >= 0 && endingOf[j] !== 0; j--) top = Math.max(top, endingOf[j]!);
    for (let j = i; j < n && endingOf[j] !== 0; j++) top = Math.max(top, endingOf[j]!);
    return top;
  };

  const order: Played[] = [];
  const doneJumps = new Set<number>();
  let repeatStart = 0;
  let pass = 1;
  let i = 0;
  let jumpedBack = false;
  let groupEnd = -1;
  let after: { to: 'coda' | 'fine' | 'end'; ending: number | null } | null = null;
  let toCodaDone = false;

  while (i < n && order.length < MAX_UNFOLDED_BARS) {
    const b = bars[i]!;
    const e = endingOf[i]!;
    if (e !== 0) {
      const want = after ? endingAfterJump(i, after.ending) : pass;
      if (e !== want) {
        // after « D.C. al 2nd End. » the player goes straight to that ending; otherwise the other endings are skipped one by one
        const target = after && after.ending !== null ? endingOf.findIndex((x, j) => j > i && x === want) : -1;
        i = target > 0 ? target : i + 1;
        continue;
      }
    }
    if (!after && pass > 1 && i > groupEnd) {
      // past the last ending: the repeat is over
      pass = 1;
      repeatStart = i;
    }
    if (b.open === '{' && !after && !jumpedBack) {
      repeatStart = i;
      pass = 1;
    }
    jumpedBack = false;
    order.push({ source: i, pass: after ? 1 : pass, ending: e === 0 ? null : e });

    const d = dir[i]!;
    if (after && after.to === 'fine' && (d.fine || b.end)) break;
    if (after && after.to === 'coda' && !toCodaDone && b.coda === 'end' && codaBars.length >= 2 && codaBars[codaBars.length - 1] !== i) {
      toCodaDone = true;
      after = { to: 'end', ending: after.ending };
      i = codaBars[codaBars.length - 1]!;
      continue;
    }
    if (b.close === '}' && !after) {
      const passes = passesOf(repeatStart, i);
      if (pass < passes) {
        pass++;
        groupEnd = i;
        while (groupEnd + 1 < n && endingOf[groupEnd + 1] !== 0) groupEnd++;
        i = repeatStart;
        jumpedBack = true;
        continue;
      }
      pass = 1;
      repeatStart = i + 1;
    }
    if (d.jump && !doneJumps.has(i)) {
      doneJumps.add(i);
      if (d.jump.kind === 'ds' && segnoBar < 0) warn('D.S. without a segno: played from the start');
      if (d.jump.to === 'coda' && codaBars.length < 2) warn('al Coda without two coda signs');
      after = { to: d.jump.to, ending: d.jump.ending };
      toCodaDone = false;
      i = d.jump.kind === 'ds' && segnoBar >= 0 ? segnoBar : 0;
      continue;
    }
    if (b.close === 'Z') break;
    i++;
  }
  if (order.length >= MAX_UNFOLDED_BARS) warn('unfolding stopped at the size limit');
  return order;
}

// ---------------------------------------------------------------- one song

function bpmOf(text: string): number | null {
  const n = Number(text);
  return Number.isFinite(n) && n >= 20 && n <= 500 ? Math.round(n) : null;
}

/** Cuts a link into its songs and the playlist name; never throws (a bad piece becomes a `skipped` entry). */
export function splitIRealLink(link: string): { name: string | null; songs: RawIRealSong[]; skipped: SkippedSong[] } {
  const skipped: SkippedSong[] = [];
  const m = /^irealb(ook)?:\/\/([\s\S]*)$/.exec(link.trim());
  if (!m) return { name: null, songs: [], skipped: [{ index: 0, title: '', reason: 'not an irealb:// or irealbook:// link' }] };
  const old = m[1] === 'ook';
  const body = safeDecode(m[2]!);
  const songs: RawIRealSong[] = [];
  let name: string | null = null;
  if (old) {
    const parts = body.split('=');
    let i = 0;
    while (i + 5 < parts.length) {
      const f = parts.slice(i, i + 6);
      songs.push({ index: songs.length, format: 'irealbook', title: f[0]!, composer: f[1]!, style: f[2]!, key: f[3]!, transpose: '', music: f[5]!, feel: '', bpm: '' });
      i += 6;
      while (i < parts.length && parts[i] === '') i++;
    }
    if (i < parts.length) {
      const rest = parts.slice(i).join('=').trim();
      if (rest !== '' && songs.length > 0) name = rest;
    }
    return { name, songs, skipped };
  }
  const pieces = body.split('===');
  if (pieces.length > 1) {
    const last = pieces[pieces.length - 1]!;
    // the playlist name is the last piece, when it is not a song
    if (!last.includes('=') ) {
      name = last.trim() === '' ? null : last.trim();
      pieces.pop();
    }
  }
  pieces.forEach((piece, k) => {
    const f = piece.split('=');
    const musicAt = f.findIndex((x) => x.startsWith(IREAL_MUSIC_PREFIX));
    const title = f[0] ?? '';
    if (musicAt < 0) {
      skipped.push({ index: k, title, reason: 'no chart (music field) found' });
      return;
    }
    if (f.length === 10 && musicAt === 6) {
      songs.push({ index: k, format: 'irealb', title: f[0]!, composer: f[1]!, style: f[3]!, key: f[4]!, transpose: f[5]!, music: f[6]!, feel: f[7]!, bpm: f[8]!});
      return;
    }
    // other layouts (older exports): fields in order, blanks dropped, music field as the anchor
    const g = f.filter((x) => x !== '');
    const at = g.findIndex((x) => x.startsWith(IREAL_MUSIC_PREFIX));
    if (at < 4) {
      skipped.push({ index: k, title, reason: `unexpected layout (${f.length} fields)` });
      return;
    }
    const before = g.slice(0, at);
    const after = g.slice(at + 1);
    const feel = after.length > 0 && !/^\d+$/.test(after[0]!) ? after.shift()! : '';
    songs.push({
      index: k,
      format: 'irealb',
      title: before[0]!,
      composer: before[1] ?? '',
      style: before[2] ?? '',
      key: before[3] ?? '',
      transpose: before[4] ?? '',
      music: g[at]!,
      feel,
      bpm: after[0] ?? '',
    });
  });
  return { name, songs, skipped };
}

/** Reads one song of a link. Throws only `Error`s with a reason (callers catch them per song). */
export function readIRealSong(raw: RawIRealSong): StandardChart {
  const warnings: string[] = [];
  const warn = (m: string): void => {
    if (warnings.length < 20 && !warnings.includes(m)) warnings.push(m);
  };
  const plain = raw.format === 'irealb' ? deobfuscate(raw.music) : raw.music;
  const { bars: written, unknown } = tokenizeChart(plain);
  if (unknown !== '') warn(`unknown characters in the chart: ${unknown.slice(0, 12)}`);
  if (written.length === 0) throw new Error('the chart has no bars');

  // meter in force for each written bar, then the chords of each written bar
  let meter: Meter = DEFAULT_METER;
  const meters: Meter[] = [];
  const resolved: Resolved[] = [];
  let lastChord: { text: string; chord: ChordSymbol | null; approximate: boolean } | null = null;
  written.forEach((bar, i) => {
    if (bar.meter) meter = bar.meter;
    if (!meters.some((m) => m.numerator === meter.numerator && m.denominator === meter.denominator)) meters.push({ ...meter });
    const isX = bar.cells.some((c) => c.k === 'x');
    const isR = !isX && bar.cells.some((c) => c.k === 'r');
    if (isX || isR) {
      // « x » repeats the bar before, « r » the two bars before (its own bar and the empty one after it)
      const from = i - (isR ? 2 : 1);
      const src = from >= 0 ? resolved[from] : undefined;
      if (!src) {
        warn('repeat sign with nothing to repeat');
        resolved.push({ meter, chords: [], alternates: [], simile: isX ? 'x' : 'r' });
        return;
      }
      // alternate chords written in this bar (« (G-7)x (C7) ») are its own, on their cells; else the copy has the ones of the original
      const own: ReadAlternate[] = [];
      for (const a of bar.alts) {
        const mapped = chordFromIRealText(a.text);
        if (mapped) own.push({ beat: Math.min(a.cell, Math.max(0, meter.numerator - 1)), chord: mapped.chord, text: a.text, approximate: mapped.approximate });
      }
      resolved.push({
        meter,
        chords: src.chords.map((c) => ({ ...c })),
        alternates: own.length > 0 ? own : src.alternates.map((a) => ({ ...a })),
        simile: isX ? 'x' : 'r',
      });
      const lastC = src.chords[src.chords.length - 1];
      if (lastC) lastChord = { text: lastC.text, chord: lastC.chord, approximate: lastC.approximate };
      return;
    }
    const placed = placeChords(bar, meter, lastChord, warn);
    const lastC = placed.chords[placed.chords.length - 1];
    if (lastC) lastChord = { text: lastC.text, chord: lastC.chord, approximate: lastC.approximate };
    resolved.push({ meter, chords: placed.chords, alternates: placed.alternates, simile: null });
  });

  const order = playingOrder(written, warn);
  const bars: ReadBar[] = order.map((o) => {
    const wb = written[o.source]!;
    const rb = resolved[o.source]!;
    return {
      source: o.source,
      meter: { ...rb.meter },
      chords: rb.chords.map((c) => ({ ...c })),
      alternates: rb.alternates.map((a) => ({ ...a })),
      section: wb.section,
      comments: [...wb.comments],
      pass: o.pass,
      ending: o.ending,
      simile: rb.simile,
    };
  });
  const keyText = raw.key.trim();
  const key = parseIRealKey(keyText);
  if (!key) warn(`unknown key « ${keyText} »`);
  return {
    index: raw.index,
    title: displayTitle(raw.title),
    rawTitle: raw.title,
    composer: displayComposer(raw.composer),
    composerRaw: raw.composer,
    style: raw.style.trim(),
    feel: raw.feel.trim() === '' ? null : raw.feel.trim(),
    key,
    keyText,
    bpm: bpmOf(raw.bpm),
    meter: { ...(meters[0] ?? DEFAULT_METER) },
    meters,
    writtenBars: written.length,
    bars,
    warnings,
  };
}

/**
 * Reads one link (one playlist, or one song). Never throws: songs that cannot be read are in `skipped`.
 * `firstIndex` is added to the indices, for a text that holds several links.
 */
export function readIRealLink(link: string, firstIndex = 0): IRealPlaylist {
  const songs: StandardChart[] = [];
  const skipped: SkippedSong[] = [];
  let split: ReturnType<typeof splitIRealLink>;
  try {
    split = splitIRealLink(link);
  } catch (e) {
    return { name: null, songs, skipped: [{ index: firstIndex, title: '', reason: e instanceof Error ? e.message : String(e) }], linkCount: 1 };
  }
  for (const s of split.skipped) skipped.push({ ...s, index: firstIndex + s.index });
  for (const raw of split.songs) {
    try {
      songs.push(readIRealSong({ ...raw, index: firstIndex + raw.index }));
    } catch (e) {
      skipped.push({ index: firstIndex + raw.index, title: raw.title, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  skipped.sort((a, b) => a.index - b.index);
  return { name: split.name, songs, skipped, linkCount: 1 };
}

/**
 * Reads whatever carries iReal charts (an `irealb://` link, an HTML page with links, a text file)
 * and gives one playlist per link: the official page holds several playlists, each its own link.
 */
export function readIRealPlaylists(text: string): IRealPlaylist[] {
  const out: IRealPlaylist[] = [];
  let offset = 0;
  for (const link of extractIRealLinks(text)) {
    const pl = readIRealLink(link, offset);
    out.push(pl);
    offset += Math.max(pl.songs.length + pl.skipped.length, 1);
  }
  return out;
}

/** Same, all links together as one playlist (named after the first link that has a name). */
export function readIRealText(text: string): IRealPlaylist {
  const all = readIRealPlaylists(text);
  return {
    name: all.find((p) => p.name !== null)?.name ?? null,
    songs: all.flatMap((p) => p.songs),
    skipped: all.flatMap((p) => p.skipped),
    linkCount: all.length,
  };
}
