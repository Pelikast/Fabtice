// Export of the chord chart to iReal Pro: from `ExportChart` (export/chartExport.ts)
// to one `irealb://` link, and the small HTML page that carries it.
//
// The format, its sources and every choice made here are written in
// IREAL-FORMAT.md next to this file; read it before changing anything.
//
//   irealb://  encodeURIComponent(  title=composer==style=key==MUSIC=feel=bpm=repeats  )
//   MUSIC = « 1r34LbKcu7 » + scrambled chart string
//   chart string = bars written cell by cell: [*AT44C^7   |D-7 G7 |…  Z
//
// One cell is one beat (so a 4/4 bar is four cells and a chord is a token that
// takes the cell of its beat; an empty cell is a space). Chords sit at
// concert pitch, in the key the user plays (the transport's transposition is
// applied by `chartForExport`); iReal Pro transposes for instruments itself.

import { chordParts } from '../harmony/chord';
import { keyLabel } from '../harmony/key';
import { sameMeter } from '../grid/tempoMap';
import { t } from '../i18n';
import type { Key } from '../model/harmony';
import type { Meter } from '../model/tempoMap';
import { iRealNote, iRealQualityFor } from './irealChords';
import type { ExportBar, ExportChart, ExportChord } from './chartExport';

export interface IRealExport {
  /** The `irealb://…` link (one song). */
  url: string;
  /** The older, unscrambled `irealbook://…` link of the same song (kept for tools that only read that one). */
  legacyUrl: string;
  /** A self-contained HTML page with the link and a sentence in French (to save or open). */
  html: string;
  /** Suggested file name for `html` (« Blues du dimanche.html »). */
  fileName: string;
}

export class ExportNotReadyError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented yet`);
    this.name = 'ExportNotReadyError';
  }
}

/** The iReal Pro export is written: the « Exporter » menu offers it. */
export const IREAL_EXPORT_READY = true;

export const IREAL_DEFAULT_COMPOSER = 'Unknown';
export const IREAL_DEFAULT_STYLE = 'Medium Swing';
/** The playback feel that goes with it (the « Jazz-Medium Swing » of iReal Pro's own files). Always written: some readers drop an empty field and shift the ones after it. */
export const IREAL_DEFAULT_FEEL = 'Jazz-Medium Swing';
/** Tempo range iReal Pro accepts; outside it (or unknown) the field is 0 and iReal Pro uses the style's tempo. */
export const IREAL_TEMPO_RANGE = { min: 40, max: 400 } as const;
export const IREAL_MUSIC_PREFIX = '1r34LbKcu7';
/** Longest link the export hands out (the Mac app's `openInIRealPro` accepts the same bound, see desktop/src/ireal-link.js). */
export const IREAL_URL_MAX_LENGTH = 200_000;

// ---------------------------------------------------------------- text fields

/** A free text field of the link: `=` separates fields and `===` songs, so neither may appear; no line breaks. */
export function iRealText(text: string, fallback: string): string {
  const clean = text
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/=+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return clean === '' ? fallback : clean;
}

const MAJOR_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const MINOR_KEYS = ['C-', 'C#-', 'D-', 'Eb-', 'E-', 'F-', 'F#-', 'G-', 'G#-', 'A-', 'Bb-', 'B-'] as const;

/** iReal Pro's 24 keys (« Bb », « F#- »); C major when the piece's key is unknown. */
export function iRealKey(key: Key | null): string {
  if (!key) return 'C';
  return (key.mode === 'major' ? MAJOR_KEYS : MINOR_KEYS)[((key.tonic % 12) + 12) % 12]!;
}

// ---------------------------------------------------------------- chords

/** `Bb`, `C^7`, `G7b9`, `D-7/G`: the chord as iReal Pro writes it. */
export function iRealChordText(chord: NonNullable<ExportChord['chord']>, key: Key | null, next: ExportChord['next'] = null): string {
  const parts = chordParts(chord, { key, next });
  return `${iRealNote(parts.root)}${iRealQualityFor(chord).text}${parts.bass ? `/${iRealNote(parts.bass)}` : ''}`;
}

// ---------------------------------------------------------------- time signatures

/**
 * The time signatures iReal Pro has: its `T` tokens are two figures (`T44`,
 * `T68`; `T12` is 12/8), the list of its editor, the one `standards/irealRead.ts`
 * reads (IREAL-FORMAT.md).
 */
export const IREAL_METERS: readonly Meter[] = [
  { numerator: 2, denominator: 4 },
  { numerator: 3, denominator: 4 },
  { numerator: 4, denominator: 4 },
  { numerator: 5, denominator: 4 },
  { numerator: 6, denominator: 4 },
  { numerator: 7, denominator: 4 },
  { numerator: 2, denominator: 2 },
  { numerator: 3, denominator: 2 },
  { numerator: 3, denominator: 8 },
  { numerator: 5, denominator: 8 },
  { numerator: 6, denominator: 8 },
  { numerator: 7, denominator: 8 },
  { numerator: 9, denominator: 8 },
  { numerator: 12, denominator: 8 },
];

/** The `T` token of a signature iReal Pro has. */
export function iRealMeterToken(m: Meter): string {
  return m.numerator === 12 && m.denominator === 8 ? 'T12' : `T${m.numerator}${m.denominator}`;
}

/**
 * The signature written for `m`: itself when iReal Pro has it; else the one of
 * iReal Pro's whose bar lasts nearest (in quarters: 7/16 → 3/8, 11/16 → 5/8,
 * 1/4 → 3/8, 9/4 → 7/4, 64/32 → 7/4), the nearest denominator, then the
 * smaller numerator, on a tie. The export then writes the real signature as
 * a text comment in that bar (`<7/16>`), so the file is never broken and the
 * reader still sees it.
 */
export function iRealMeterFor(m: Meter): { meter: Meter; exact: boolean } {
  const own = IREAL_METERS.find((x) => sameMeter(x, m));
  if (own) return { meter: own, exact: true };
  const quarters = (x: Meter) => (x.numerator * 4) / x.denominator;
  const dist = (x: Meter) => Math.abs(Math.log2(x.denominator) - Math.log2(m.denominator));
  let best = IREAL_METERS[0]!;
  for (const x of IREAL_METERS) {
    const d = Math.abs(quarters(x) - quarters(m)) - Math.abs(quarters(best) - quarters(m));
    if (d < -1e-9 || (Math.abs(d) <= 1e-9 && (dist(x) < dist(best) || (dist(x) === dist(best) && x.numerator < best.numerator)))) best = x;
  }
  return { meter: best, exact: false };
}

/**
 * A bar's chords moved to the cells of the signature written for it (one cell per beat; a later chord
 * wins a shared cell). iReal Pro has one chord per beat at most: a chord written between two beats
 * (1.0.3, up to eight chords in a bar) goes to the next beat when that beat is free, else it is left
 * out — the chords on the beats are always kept.
 */
function onWrittenBeats(bar: ExportBar, own: Meter, written: Meter): ExportBar {
  const onBeat = (c: ExportChord) => Number.isInteger(c.beat);
  if (sameMeter(own, written) && bar.chords.every(onBeat)) return bar;
  const byCell = new Map<number, ExportChord>();
  const place = (c: ExportChord) => (c.beat * written.numerator) / own.numerator;
  for (const c of bar.chords) {
    if (!onBeat(c) || c.beat < 0 || c.beat >= own.numerator) continue;
    const cell = Math.min(written.numerator - 1, Math.round(place(c)));
    byCell.set(cell, { ...c, beat: cell });
  }
  for (const c of bar.chords) {
    if (onBeat(c) || c.beat < 0 || c.beat >= own.numerator) continue;
    const cell = Math.ceil(place(c) - 1e-9);
    if (cell < written.numerator && !byCell.has(cell)) byCell.set(cell, { ...c, beat: cell });
  }
  return { ...bar, chords: [...byCell.values()].sort((a, b) => a.beat - b.beat) };
}

// ---------------------------------------------------------------- the chart string

/** Rehearsal marks iReal Pro draws as such; any other label is written as a text comment. */
function sectionToken(label: string): string {
  const clean = label.replace(/[<>*]/g, '').trim();
  if (clean === '') return '';
  const lower = clean.toLowerCase();
  if (/^[abcd]$/.test(lower)) return `*${lower.toUpperCase()}`;
  if (lower === 'i' || lower === 'intro') return '*i';
  if (lower === 'v' || lower === 'verse' || lower === 'couplet') return '*v';
  return `<${clean}>`;
}

/**
 * « Ton : Ab », « Ton : F#m »: a modulation as a comment of the chart, the key in American letters as
 * everywhere (owner's decision, 17 November 2026), in iReal Pro's ASCII like its chords (no `<`, `>`, `*`, `=`).
 */
export function keyChangeComment(key: Key): string {
  const ascii = keyLabel(key, 'm').replace(/♭/g, 'b').replace(/♯/g, '#');
  return t('export.ireal.keyChange', { key: ascii }).replace(/[<>*=]/g, '');
}

/** Cells of one bar: `beats` tokens, one per beat. */
function barCells(bar: ExportBar, beats: number, ctx: BarContext): string[] {
  const cells: string[] = new Array<string>(beats).fill(' ');
  const written = bar.chords.filter((c) => c.beat >= 0 && c.beat < beats);
  if (written.length === 0) {
    if (bar.repeat && ctx.going) {
      // The chord of the previous bar goes on. After a bar with a single chord, iReal Pro's own sign for it is « x »
      // (one bar, shown as the simile mark like the chart's); after a bar with several, slashes carry the last chord on.
      if (ctx.lastBarSingle) {
        cells[beats > 1 ? 1 : 0] = 'x';
      } else {
        cells.fill('p');
      }
    }
    return cells;
  }
  const first = written[0]!;
  // The chord of the previous bar sounds on until this bar's first chord: slashes, so iReal Pro keeps the beats.
  if (first.beat > 0 && ctx.going) for (let b = 0; b < first.beat; b++) cells[b] = 'p';
  for (const c of written) cells[c.beat] = c.chord === null ? 'n' : iRealChordText(c.chord, ctx.key, c.next ?? null);
  return cells;
}

interface BarContext {
  key: Key | null;
  /** A chord (not « N.C. ») is going on at the start of the bar. */
  going: boolean;
  /** The previous bar had one chord (or was a repeat of such a bar): « x » can stand for it. */
  lastBarSingle: boolean;
}

/** Joins cells; two chord tokens in a row are separated by a comma, as iReal Pro does. */
function joinCells(cells: readonly string[]): string {
  let out = '';
  let previousChord = false;
  for (const cell of cells) {
    const isChord = cell !== ' ' && cell !== 'p' && cell !== 'x';
    if (isChord && previousChord) out += ',';
    out += cell;
    previousChord = isChord;
  }
  return out;
}

/** The unscrambled chart string of a chart, e.g. `[*AT44C^7   |D-7 G7 |…Z`. */
export function iRealMusic(chart: ExportChart): string {
  let out = '';
  let meter = chart.timeSignature;
  const ctx: BarContext = { key: chart.key, going: false, lastBarSingle: false };
  chart.bars.forEach((source, i) => {
    const m = source.timeSignature ?? meter;
    if (source.timeSignature || i === 0) meter = m;
    // A signature iReal Pro does not have is written as the nearest one it has, the real one in a comment.
    const target = iRealMeterFor(m);
    const bar = onWrittenBeats(source, m, target.meter);
    const beats = Math.max(1, Math.min(target.meter.numerator, 12));
    const next = chart.bars[i + 1];
    const section = bar.section ? sectionToken(bar.section) : '';
    const signature = i === 0 || bar.timeSignature;
    // A double bar line closes the bar before a section and opens this one; the first bar opens the chart.
    // C14: a repeat sign opens the bar instead (`{`).
    out += bar.repeatStart ? '{' : i === 0 || bar.doubleBarBefore ? '[' : '';
    out += section.startsWith('*') ? section : '';
    out += signature ? iRealMeterToken(target.meter) : '';
    out += signature && !target.exact ? `<${m.numerator}/${m.denominator}>` : '';
    out += section.startsWith('<') ? section : '';
    // C10: one key per chart in iReal Pro; a later passage is written as a comment on its bar, and its chords in its key.
    if (bar.keyChange) out += `<${keyChangeComment(bar.keyChange)}>`;
    // C14: a note on the bar (« A2 », « 3x »): a comment, none of `<`, `>`, `*`, `=` in it.
    if (bar.note) out += `<${bar.note.replace(/[<>*=]/g, '')}>`;
    ctx.key = bar.key === undefined ? chart.key : bar.key;
    const cells = barCells(bar, beats, ctx);
    out += joinCells(cells);
    // What goes on into the next bar.
    const written = bar.chords.filter((c) => c.beat >= 0 && c.beat < beats);
    if (written.length > 0) {
      ctx.going = written[written.length - 1]!.chord !== null;
      ctx.lastBarSingle = written.length === 1 && written[0]!.beat === 0 && ctx.going;
    } else if (!(bar.repeat && ctx.going)) {
      ctx.going = false;
      ctx.lastBarSingle = false;
    }
    // The end of a repeat is `}`; the end of the chart is `Z` (after the `}` when a repeat ends there).
    const end = bar.final || !next;
    out += end ? (bar.repeatEnd ? '}Z' : 'Z') : bar.repeatEnd ? '}' : next.doubleBarBefore || next.repeatStart ? ']' : '|';
  });
  return out;
}

// ---------------------------------------------------------------- scrambling

/**
 * The reversible shuffle iReal Pro applies to the chart string: it is cut in
 * pieces of 50 characters and in each piece, characters 0-4 swap with 49-45
 * and 10-23 with 39-26 (a piece is left alone when fewer than two characters
 * follow it, and the last, shorter piece always is). Applying it twice gives
 * the original back.
 */
export function hussle(text: string): string {
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

/** Plain chart string → what the link holds: three substitutions, the shuffle, then the magic prefix. */
export function obfuscate(plain: string): string {
  return IREAL_MUSIC_PREFIX + hussle(plain.replace(/ {3}/g, 'XyQ').replace(/ \|/g, 'LZ').replace(/\| x/g, 'Kcl'));
}

// ---------------------------------------------------------------- link and page

function tempoField(tempo: number | null): string {
  if (tempo === null || !(tempo >= IREAL_TEMPO_RANGE.min && tempo <= IREAL_TEMPO_RANGE.max)) return '0';
  return String(Math.round(tempo));
}

/** The fields of the song, before percent-encoding: title=composer==style=key==music=feel=bpm=repeats. */
export function iRealSong(chart: ExportChart): string {
  return [
    iRealText(chart.title, 'Untitled'),
    iRealText(chart.composer ?? IREAL_DEFAULT_COMPOSER, IREAL_DEFAULT_COMPOSER),
    '',
    iRealText(chart.style ?? IREAL_DEFAULT_STYLE, IREAL_DEFAULT_STYLE),
    iRealKey(chart.key),
    '',
    obfuscate(iRealMusic(chart)),
    chart.style === null ? IREAL_DEFAULT_FEEL : '',
    tempoField(chart.tempo),
    '0',
  ].join('=');
}

/** The old plain link: title=composer=style=key=n=chart string, no scrambling. */
export function iRealBookSong(chart: ExportChart): string {
  return [
    iRealText(chart.title, 'Untitled'),
    iRealText(chart.composer ?? IREAL_DEFAULT_COMPOSER, IREAL_DEFAULT_COMPOSER),
    iRealText(chart.style ?? IREAL_DEFAULT_STYLE, IREAL_DEFAULT_STYLE),
    iRealKey(chart.key),
    'n',
    iRealMusic(chart),
  ].join('=');
}

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A name the file systems of the Mac and of Windows accept, after the piece. */
export function iRealFileName(title: string): string {
  const base = title
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.-]+|[\s.-]+$/g, '')
    .slice(0, 80)
    .trim();
  return `${base === '' ? 'grille' : base}.html`;
}

/** The page iReal Pro opens a chart from: a link, and a sentence telling what to do with it. */
export function iRealPage(title: string, url: string): string {
  const name = escapeHtml(iRealText(title, 'Untitled'));
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name} · iReal Pro</title>
<style>body{font-family:Georgia,serif;background:#f4ecdf;color:#2b1f17;max-width:34em;margin:3em auto;padding:0 1em;line-height:1.5}a{color:#2b1f17}</style>
</head>
<body>
<h1>${name}</h1>
<p>${escapeHtml(t('export.irealPageSentence'))}</p>
<p><a href="${url}">${escapeHtml(t('export.irealPageLink', { title: iRealText(title, 'Untitled') }))}</a></p>
</body>
</html>
`;
}

/** Encodes the chart for iReal Pro: the link, the page that carries it and a file name. Pure. */
export function exportToIRealPro(chart: ExportChart): IRealExport {
  const url = `irealb://${encodeURIComponent(iRealSong(chart))}`;
  const legacyUrl = `irealbook://${encodeURIComponent(iRealBookSong(chart))}`;
  return { url, legacyUrl, html: iRealPage(chart.title, url), fileName: iRealFileName(chart.title) };
}
