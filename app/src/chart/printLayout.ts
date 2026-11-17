// « Imprimer »: what the sheets of paper are, as pure functions (tested in
// printLayout.test.ts). Nothing here knows about React, the store or the screen.
//
// The chart is paginated by us, never by the browser: a sheet is a fixed size
// in mm (paper, orientation, margins), and a sheet holds a whole number of
// lines of four bars. The preview in the dialog and the printed pages are the
// SAME sheets (`PrintSheets.tsx`), so they cannot differ.
//
// The content of a sheet is laid out at its natural size (the width of the
// page less its margins is four bars, a line is `lineMm` high) and scaled as a
// whole by the chosen scale, centred on the page. « Tenir sur une page » picks
// the scale itself: the largest one at which every line fits the first sheet.
// What the dialog offers to print besides the full chart (« Ce qu'on imprime »:
// the simplified chart, one section: C14) only changes the list of lines handed
// to `paginate`; everything here depends on the number of lines.

export type PrintOrientation = 'portrait' | 'paysage';
export type PrintPaper = 'a4' | 'lettre';
export type PrintMargins = 'etroites' | 'normales' | 'larges';
/** « Ce qu'on imprime » (C14): the whole chart, the simplified chart, or the bars of one part of the structure. */
export type PrintWhat = 'full' | 'simplified' | 'part';

/** Which parts of the title block are written (each can be left out). */
export interface PrintHeader {
  title: boolean;
  key: boolean;
  tempo: boolean;
  /** « Forme : AABC », under the key and tempo, when the form of the piece is known. */
  form: boolean;
}

export interface PrintOptions {
  orientation: PrintOrientation;
  paper: PrintPaper;
  margins: PrintMargins;
  /** The chosen scale, in percent (one of `SCALES`); ignored while `fitOne` is on and possible. */
  scale: number;
  /** « Tenir sur une page »: the scale is the one that puts every line on the first sheet. */
  fitOne: boolean;
  header: PrintHeader;
  /** « Ce qu'on imprime ». Which part is printed (when `what` is `part`) is the dialog's own choice, never kept. */
  what: PrintWhat;
}

export const SCALES: readonly number[] = [50, 60, 70, 80, 90, 100];
export const PRINT_ORIENTATIONS: readonly PrintOrientation[] = ['portrait', 'paysage'];
export const PRINT_PAPERS: readonly PrintPaper[] = ['a4', 'lettre'];
export const PRINT_MARGINS: readonly PrintMargins[] = ['etroites', 'normales', 'larges'];
export const PRINT_WHATS: readonly PrintWhat[] = ['full', 'simplified', 'part'];

/** Paper sizes in mm, upright. */
export const PAPER_MM: Record<PrintPaper, { w: number; h: number }> = {
  a4: { w: 210, h: 297 },
  lettre: { w: 215.9, h: 279.4 },
};

/** Margin on the four sides of a sheet, in mm. */
export const MARGIN_MM: Record<PrintMargins, number> = { etroites: 10, normales: 15, larges: 25 };

/** Height of a line of four bars at the natural size, in mm (a little lower on its side: the page is). */
export const LINE_MM: Record<PrintOrientation, number> = { portrait: 24, paysage: 21 };

/**
 * Height of the title row, of the row under it (key, meter, tempo), of the quiet line that names the part printed
 * (« Thème 1 · mesures 3–10 », under the title), of the one that gives the form (« Forme : AABC », under the key
 * row) and the gap before the first line, in mm.
 */
export const HEADER_ROWS_MM = { title: 11, info: 6, part: 5, form: 5, gap: 5 } as const;

/** Height of the heading band over the first line of a block of the simplified chart (« A », « Intro »), in mm. */
export const HEADING_MM = 9;

/** The smallest scale « Tenir sur une page » will use: below it the chords are too small to read. */
export const MIN_FIT_SCALE = 0.4;

/** Bars drawn as 206 units wide, a chord 30 units high: the unit of the chart on paper. */
export const BAR_UNITS = 206;

export const DEFAULT_HEADER: PrintHeader = { title: true, key: true, tempo: true, form: true };

/** US Letter in the regions that use it, A4 elsewhere (the same list as the Mac app's main process). */
export function paperForLocale(locale: string | undefined): PrintPaper {
  const region = /[-_]([A-Za-z]{2})\b/.exec(String(locale ?? ''));
  return region && ['US', 'CA', 'MX', 'CL', 'CO', 'PH', 'VE'].includes(region[1]!.toUpperCase()) ? 'lettre' : 'a4';
}

export function defaultPrintOptions(locale?: string): PrintOptions {
  return { orientation: 'portrait', paper: paperForLocale(locale), margins: 'normales', scale: 100, fitOne: false, header: { ...DEFAULT_HEADER }, what: 'full' };
}

/**
 * Whatever was kept (or nothing, or an older shape of it) as valid options: every field falls back to its
 * default. The first version of the dialog kept `orientation` and `size` (`une` = fitted to one page).
 */
export function normalizePrintOptions(raw: unknown, locale?: string): PrintOptions {
  const base = defaultPrintOptions(locale);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);
  const header = r.header && typeof r.header === 'object' ? (r.header as Record<string, unknown>) : {};
  const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
  return {
    orientation: pick(r.orientation, PRINT_ORIENTATIONS, base.orientation),
    paper: pick(r.paper, PRINT_PAPERS, base.paper),
    margins: pick(r.margins, PRINT_MARGINS, base.margins),
    scale: typeof r.scale === 'number' && SCALES.includes(r.scale) ? r.scale : base.scale,
    fitOne: typeof r.fitOne === 'boolean' ? r.fitOne : r.size === 'une',
    header: { title: flag(header.title, true), key: flag(header.key, true), tempo: flag(header.tempo, true), form: flag(header.form, true) },
    what: pick(r.what, PRINT_WHATS, base.what),
  };
}

/** Height of the title block (rows that are shown plus the gap before the lines), in mm; 0 when nothing is shown. */
export function headerHeightMm(shown: { title: boolean; info: boolean; part?: boolean; form?: boolean; formRows?: number }): number {
  const { title, info, part = false, form = false, formRows = 1 } = shown;
  if (!title && !info && !part && !form) return 0;
  // The form line of the simplified chart can be long: it is written on as many rows as it needs.
  return (title ? HEADER_ROWS_MM.title : 0) + (part ? HEADER_ROWS_MM.part : 0) + (info ? HEADER_ROWS_MM.info : 0) + (form ? HEADER_ROWS_MM.form * Math.max(1, formRows) : 0) + HEADER_ROWS_MM.gap;
}

/** Characters of the form line that fit on one row of the title block (10 pt on the width of a page; deliberately on the short side). */
export const FORM_ROW_CHARS = 88;

/** How many rows the form line takes. */
export const formRowsFor = (text: string): number => Math.max(1, Math.ceil(text.length / FORM_ROW_CHARS));

/** A range of the chart's lines: the lines `first` to `first + count - 1` are on this sheet. */
export interface SheetLines {
  first: number;
  count: number;
}

export interface PrintLayout {
  /** The sheet, in mm, as it is printed (landscape turns it). */
  sheet: { w: number; h: number };
  margin: number;
  /** The area inside the margins, in mm. */
  content: { w: number; h: number };
  /** The scale applied to the content (1 = natural size). */
  scale: number;
  /** True when « Tenir sur une page » is on and the chart fits at a readable scale. */
  fitted: boolean;
  /** False when even the smallest readable scale cannot put every line on one sheet. */
  fitPossible: boolean;
  /** The scale « Tenir sur une page » would use (null when it cannot fit). */
  fitScale: number | null;
  lineMm: number;
  headerMm: number;
  /** Width of a bar and the unit of the drawing (a 206th of a bar), in mm, at the natural size. */
  barMm: number;
  unitMm: number;
  /** One entry per sheet; the first sheet carries the title block. */
  sheets: SheetLines[];
}

const EPS = 1e-6;

/** The scale at which `lines` lines (and the title block) exactly fill the first sheet's content area, or null if it is below `MIN_FIT_SCALE`. */
export function fitScale(lines: number, contentH: number, lineMm: number, headerMm: number, extraMm = 0): number | null {
  if (lines <= 0) return 1;
  const need = lines * lineMm + extraMm + headerMm;
  const s = Math.min(1, Math.floor((contentH / need) * 1000 - EPS) / 1000);
  return s >= MIN_FIT_SCALE ? s : null;
}

/** How many lines go on the first sheet and on each later sheet at `scale` (at least one each: a sheet never stays empty). */
export function linesPerSheet(contentH: number, lineMm: number, headerMm: number, scale: number): { first: number; next: number } {
  const room = contentH / scale + EPS;
  return { first: Math.max(1, Math.floor((room - headerMm) / lineMm)), next: Math.max(1, Math.floor(room / lineMm)) };
}

/**
 * Rows of different heights on sheets: `extras[i]` is what row `i` has over a line (the heading band of the simplified
 * chart). A row is never split from its heading, a sheet never stays empty. Returns how many rows go on each sheet.
 */
export function breakRows(extras: readonly number[], lineMm: number, roomFirst: number, roomNext: number): number[] {
  const counts: number[] = [];
  let used = 0;
  let count = 0;
  let room = roomFirst;
  for (const extra of extras) {
    const h = lineMm + extra;
    if (count > 0 && used + h > room + EPS) {
      counts.push(count);
      used = 0;
      count = 0;
      room = roomNext;
    }
    used += h;
    count++;
  }
  if (count > 0) counts.push(count);
  return counts;
}

/**
 * The sheets for `lines` lines of the chart under `options`. `headerMm` is the height of the title block
 * (`headerHeightMm`), which is on the first sheet only. `extras` (the simplified chart): per row, the height it has
 * over a line of bars, in mm (its heading band); without it every row is a line.
 */
export function paginate(lines: number, options: PrintOptions, headerMm: number, extras?: readonly number[]): PrintLayout {
  const paper = PAPER_MM[options.paper];
  const sheet = options.orientation === 'paysage' ? { w: paper.h, h: paper.w } : { w: paper.w, h: paper.h };
  const margin = MARGIN_MM[options.margins];
  const content = { w: sheet.w - 2 * margin, h: sheet.h - 2 * margin };
  const lineMm = LINE_MM[options.orientation];
  const extraSum = extras ? extras.reduce((a, b) => a + b, 0) : 0;
  const best = fitScale(lines, content.h, lineMm, headerMm, extraSum);
  const fitted = options.fitOne && best !== null;
  const scale = fitted ? best! : options.scale / 100;
  const per = linesPerSheet(content.h, lineMm, headerMm, scale);
  const sheets: SheetLines[] = [];
  if (lines <= 0) sheets.push({ first: 0, count: 0 });
  else if (extras && extras.length === lines) {
    const roomNext = content.h / scale + EPS;
    let at = 0;
    for (const count of breakRows(extras, lineMm, roomNext - headerMm, roomNext)) {
      sheets.push({ first: at, count });
      at += count;
    }
  } else {
    let at = 0;
    let room = per.first;
    while (at < lines) {
      const count = Math.min(room, lines - at);
      sheets.push({ first: at, count });
      at += count;
      room = per.next;
    }
  }
  const barMm = content.w / 4;
  return { sheet, margin, content, scale, fitted, fitPossible: best !== null, fitScale: best, lineMm, headerMm, barMm, unitMm: barMm / BAR_UNITS, sheets };
}

/** Geometry of one printed bar for `fitChart` (chart/fit.ts): the drawing is 206 units wide whatever the paper, `signed` bars keep room for the signature. */
export function printBarGeometry(layout: Pick<PrintLayout, 'lineMm' | 'unitMm'>, signed: boolean, signs: { opens?: boolean; closes?: boolean; final?: boolean } = {}) {
  const haut = 14;
  // The simplified chart's repeat signs (and its final double bar) take room at the ends of a bar (as `.pp-rep-*` in print.css).
  const padLeft = (signed ? 30 : 16) + (signs.opens ? 24 : 0);
  const padRight = 8 + (signs.closes ? 22 : signs.final ? 10 : 0);
  return { width: BAR_UNITS, padLeft, padRight, base: 30, room: layout.lineMm / layout.unitMm - haut };
}

/** Millimetres to CSS pixels. */
export const MM_TO_PX = 96 / 25.4;

/**
 * The reduction of a sheet in the preview: the whole sheet visible in `area` (px), never above life size.
 * A sheet drawn smaller than 5 % is not a preview any more: the area is then simply tiny.
 */
export function previewScale(area: { w: number; h: number }, sheet: { w: number; h: number }): number {
  const s = Math.min(area.w / (sheet.w * MM_TO_PX), area.h / (sheet.h * MM_TO_PX), 1);
  return Math.max(0.05, Number.isFinite(s) ? s : 1);
}

/** The number at the foot of a sheet is written only when there are several sheets. */
export const sheetNumberShown = (sheets: number): boolean => sheets > 1;
