// The sheets of paper (printLayout.ts): how many lines of four bars a sheet holds
// by paper, orientation, margins and scale; « Tenir sur une page »; the title
// block; the kept choices; the chart's own parts for printing (printChart.ts).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { constantTempoMap } from '../grid/tempoMap';
import { withMeterFrom } from '../grid/meters';
import { chord } from '../harmony/chord';
import { chartBars, chartLines, resolveChords } from './layout';
import { emptyCorrections } from '../model/corrections';
import type { AnalysedChord } from '../model/analysis';
import { fitChart } from './fit';
import { headerForm, headerInfo, headerPart, headerTitle, partCaption, printLines } from './printChart';
import { barsOfRange } from './structureDisplay';
import { loadPrintOptions, pageRule, savePrintOptions } from './print';
import {
  BAR_UNITS,
  DEFAULT_HEADER,
  HEADER_ROWS_MM,
  LINE_MM,
  MARGIN_MM,
  MIN_FIT_SCALE,
  PAPER_MM,
  defaultPrintOptions,
  fitScale,
  headerHeightMm,
  linesPerSheet,
  normalizePrintOptions,
  paginate,
  paperForLocale,
  previewScale,
  printBarGeometry,
  type PrintOptions,
} from './printLayout';

const base = (patch: Partial<PrintOptions> = {}): PrintOptions => ({ ...defaultPrintOptions('fr-FR'), ...patch });
const FULL_HEADER = headerHeightMm({ title: true, info: true });
const total = (layout: ReturnType<typeof paginate>) => layout.sheets.reduce((n, s) => n + s.count, 0);

describe('the sheet of paper', () => {
  it('is the paper, turned on its side for landscape, with the margins inside', () => {
    const a4 = paginate(10, base(), FULL_HEADER);
    expect(a4.sheet).toEqual({ w: 210, h: 297 });
    expect(a4.margin).toBe(MARGIN_MM.normales);
    expect(a4.content).toEqual({ w: 180, h: 267 });
    expect(a4.barMm).toBe(45);
    expect(a4.unitMm).toBeCloseTo(45 / BAR_UNITS, 9);
    const land = paginate(10, base({ orientation: 'paysage', paper: 'lettre', margins: 'larges' }), FULL_HEADER);
    expect(land.sheet).toEqual({ w: PAPER_MM.lettre.h, h: PAPER_MM.lettre.w });
    expect(land.content.w).toBeCloseTo(279.4 - 50, 6);
    expect(land.content.h).toBeCloseTo(215.9 - 50, 6);
    expect(land.lineMm).toBe(LINE_MM.paysage);
  });

  it('the title block is as high as the rows that are shown, plus a gap; nothing when nothing is shown', () => {
    expect(headerHeightMm({ title: true, info: true })).toBe(HEADER_ROWS_MM.title + HEADER_ROWS_MM.info + HEADER_ROWS_MM.gap);
    expect(headerHeightMm({ title: true, info: false })).toBe(HEADER_ROWS_MM.title + HEADER_ROWS_MM.gap);
    expect(headerHeightMm({ title: false, info: true })).toBe(HEADER_ROWS_MM.info + HEADER_ROWS_MM.gap);
    expect(headerHeightMm({ title: false, info: false })).toBe(0);
  });
});

describe('how many lines a sheet holds', () => {
  it('A4 portrait, normal margins: the first sheet has the title block, the others the whole height', () => {
    const l = paginate(30, base(), FULL_HEADER);
    // (267 - 22) / 24 = 10.2 lines on the first sheet, 267 / 24 = 11.1 on the next ones.
    expect(l.sheets).toEqual([
      { first: 0, count: 10 },
      { first: 10, count: 11 },
      { first: 21, count: 9 },
    ]);
  });

  it('a short chart is one sheet; the lines are all there, once, in order', () => {
    const l = paginate(6, base(), FULL_HEADER);
    expect(l.sheets).toEqual([{ first: 0, count: 6 }]);
    for (const lines of [1, 9, 10, 11, 25, 58, 101]) {
      const p = paginate(lines, base(), FULL_HEADER);
      expect(total(p)).toBe(lines);
      p.sheets.forEach((s, i) => expect(s.first).toBe(i === 0 ? 0 : p.sheets[i - 1]!.first + p.sheets[i - 1]!.count));
      expect(p.sheets.every((s) => s.count >= 1)).toBe(true);
    }
  });

  it('landscape lines are lower, so a sheet on its side holds fewer lines', () => {
    const portrait = linesPerSheet(paginate(1, base(), 0).content.h, LINE_MM.portrait, 0, 1).next;
    const land = paginate(1, base({ orientation: 'paysage' }), 0);
    expect(linesPerSheet(land.content.h, LINE_MM.paysage, 0, 1).next).toBeLessThan(portrait);
    // 180 mm of content, 21 mm lines: 8 lines; 5 lines of title block less.
    expect(paginate(20, base({ orientation: 'paysage' }), 0).sheets.map((s) => s.count)).toEqual([8, 8, 4]);
  });

  it('Letter is shorter than A4 upright and longer on its side', () => {
    const a4 = paginate(40, base({ paper: 'a4' }), 0);
    const letter = paginate(40, base({ paper: 'lettre' }), 0);
    expect(letter.sheets[0]!.count).toBeLessThan(a4.sheets[0]!.count);
    expect(letter.sheets.length).toBeGreaterThanOrEqual(a4.sheets.length);
    // On its side Letter is wider (bars wider) but lower: 215.9 against 210.
    expect(paginate(1, base({ paper: 'lettre', orientation: 'paysage' }), 0).content.w).toBeGreaterThan(paginate(1, base({ paper: 'a4', orientation: 'paysage' }), 0).content.w - 20);
  });

  it('wide margins leave fewer lines on a sheet, narrow ones more', () => {
    const per = (margins: PrintOptions['margins']) => paginate(60, base({ margins }), 0).sheets[0]!.count;
    expect(per('etroites')).toBeGreaterThanOrEqual(per('normales'));
    expect(per('normales')).toBeGreaterThan(per('larges'));
    expect(per('etroites')).toBe(Math.floor((297 - 20) / 24));
    expect(per('normales')).toBe(Math.floor((297 - 30) / 24));
    expect(per('larges')).toBe(Math.floor((297 - 50) / 24));
    // The bars are narrower with wide margins too: the chart is not just lower, it is smaller.
    expect(paginate(1, base({ margins: 'larges' }), 0).barMm).toBeLessThan(paginate(1, base({ margins: 'etroites' }), 0).barMm);
  });

  it('a smaller scale puts more lines on a sheet, and the width is scaled with it (the chart is centred by the sheet)', () => {
    const at = (scale: number) => paginate(80, base({ scale }), 0);
    expect(at(100).sheets[0]!.count).toBe(11);
    expect(at(50).sheets[0]!.count).toBe(22);
    expect(at(50).scale).toBe(0.5);
    expect(at(70).sheets[0]!.count).toBe(Math.floor(267 / 0.7 / 24));
    expect(at(50).sheets.length).toBeLessThan(at(100).sheets.length);
  });

  it('the title block takes its room from the first sheet only; hidden, the first sheet holds as many as the others', () => {
    const shown = paginate(40, base(), FULL_HEADER);
    const hidden = paginate(40, base(), headerHeightMm({ title: false, info: false }));
    expect(shown.sheets[0]!.count).toBe(10);
    expect(hidden.sheets[0]!.count).toBe(11);
    expect(hidden.sheets[0]!.count).toBe(hidden.sheets[1]!.count);
    expect(shown.sheets[1]!.count).toBe(11);
  });

  it('never leaves a sheet empty, even where the title block is as high as the page', () => {
    const p = paginate(3, base({ orientation: 'paysage', margins: 'larges', scale: 100 }), 150);
    expect(total(p)).toBe(3);
    expect(p.sheets.every((s) => s.count >= 1)).toBe(true);
  });

  it('no line at all is one empty sheet', () => {
    expect(paginate(0, base(), 0).sheets).toEqual([{ first: 0, count: 0 }]);
  });
});

describe('« Tenir sur une page »', () => {
  it('keeps the natural size when the chart already fits', () => {
    const l = paginate(6, base({ fitOne: true }), FULL_HEADER);
    expect(l.fitted).toBe(true);
    expect(l.scale).toBe(1);
    expect(l.sheets).toEqual([{ first: 0, count: 6 }]);
  });

  it('shrinks until every line is on the first sheet, whatever the paper, orientation or margins', () => {
    for (const orientation of ['portrait', 'paysage'] as const) {
      for (const paper of ['a4', 'lettre'] as const) {
        for (const margins of ['etroites', 'normales', 'larges'] as const) {
          for (const lines of [12, 18, 25, 34]) {
            const l = paginate(lines, base({ orientation, paper, margins, fitOne: true }), FULL_HEADER);
            if (!l.fitPossible) continue;
            expect(l.sheets, `${orientation} ${paper} ${margins} ${lines}`).toHaveLength(1);
            expect(l.sheets[0]!.count).toBe(lines);
            expect(l.scale).toBeLessThanOrEqual(1);
            expect(l.scale).toBeGreaterThanOrEqual(MIN_FIT_SCALE);
            // Fills the page: the next scale up would not fit.
            const needed = lines * l.lineMm + l.headerMm;
            expect(needed * (l.scale + 0.002)).toBeGreaterThan(l.content.h);
            expect(needed * l.scale).toBeLessThanOrEqual(l.content.h + 1e-6);
          }
        }
      }
    }
  });

  it('is the one scale for the whole chart; ignores the scale choice while it is on', () => {
    const a = paginate(25, base({ fitOne: true, scale: 100 }), FULL_HEADER);
    const b = paginate(25, base({ fitOne: true, scale: 50 }), FULL_HEADER);
    expect(a.scale).toBe(b.scale);
    expect(a.sheets).toEqual(b.sheets);
  });

  it('says it cannot when the chords would be too small, and then paginates at the chosen scale', () => {
    const l = paginate(100, base({ fitOne: true, scale: 80 }), FULL_HEADER);
    expect(l.fitPossible).toBe(false);
    expect(l.fitted).toBe(false);
    expect(l.fitScale).toBeNull();
    expect(l.scale).toBe(0.8);
    expect(l.sheets.length).toBeGreaterThan(1);
    expect(fitScale(100, 267, 24, 22)).toBeNull();
    // The limit: a line is 24 mm, 40 % of it is 9.6 mm: 27 lines on 267 mm.
    expect(fitScale(27, 267, 24, 0)).not.toBeNull();
    expect(fitScale(28, 267, 24, 0)).toBeNull();
  });

  it('a long piece of more than a hundred bars is several sheets as it is, and the first needs a smaller scale than the whole', () => {
    const lines = 28; // 112 bars
    const natural = paginate(lines, base(), FULL_HEADER);
    expect(natural.sheets.length).toBe(3);
    const fit = paginate(lines, base({ fitOne: true }), FULL_HEADER);
    expect(fit.fitPossible).toBe(false);
    const landscape = paginate(lines, base({ orientation: 'paysage' }), FULL_HEADER);
    expect(landscape.sheets.length).toBe(4);
  });
});

describe('the drawing on paper', () => {
  it('has the room of a line in units, so that landscape (shorter lines, wider bars) keeps the old geometry', () => {
    const land = paginate(1, base({ orientation: 'paysage' }), 0);
    const g = printBarGeometry(land, false);
    expect(g.width).toBe(206);
    expect(g.padLeft).toBe(16);
    expect(g.padRight).toBe(8);
    expect(g.room).toBeGreaterThan(48);
    expect(g.room).toBeLessThan(56);
    expect(printBarGeometry(land, true).padLeft).toBe(30);
    // Portrait lines are 24 mm on bars of 45 mm.
    expect(printBarGeometry(paginate(1, base(), 0), false).room).toBeCloseTo(24 / (45 / 206) - 14, 6);
  });

  it('ONE size for the whole chart: a bar with two chords is not written smaller (the fit does not depend on the sheet it is on)', () => {
    const geometry = printBarGeometry(paginate(1, base(), 0), false);
    const one = { chords: [{ frac: 0, em: 1.4 }], geometry };
    const two = { chords: [{ frac: 0, em: 1.6 }, { frac: 0.5, em: 1.6 }], geometry };
    const fit = fitChart([one, two, one, two]);
    expect(fit.step).toBe(0);
    expect(fit.bars.every((b) => b.fits)).toBe(true);
    const crowded = { chords: [0, 0.25, 0.5, 0.75].map((frac) => ({ frac, em: 2.4 })), geometry };
    const cramped = fitChart([one, two, crowded]);
    // One step for all of them, never a step per bar.
    expect(cramped.bars).toHaveLength(3);
    expect(Number.isInteger(cramped.step)).toBe(true);
  });

  it('a chart with signature changes keeps whole lines: the pick-up bars are a line of their own on the first sheet', () => {
    const c44 = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
    const map = withMeterFrom(c44, 4, { numerator: 6, denominator: 8 });
    const chords: AnalysedChord[] = [{ time: 0, chord: chord(0, 'maj7'), confidence: 0.9, doubtful: false, alternatives: [] }];
    const bars = chartBars({ map, chords: resolveChords(map, chords, emptyCorrections()), sections: [], duration: 40 });
    expect(bars.some((b) => b.signature !== null && b.signature.numerator === 6)).toBe(true);
    const lines = printLines(bars);
    expect(lines).toEqual(chartLines(bars));
    const p = paginate(lines.length, base({ margins: 'larges', scale: 100 }), FULL_HEADER);
    expect(total(p)).toBe(lines.length);
  });
});

describe('what is printed: the whole chart or one part', () => {
  const m = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
  const bars = chartBars({ map: m, chords: [], sections: [], duration: 48 });

  it('the whole chart by default', () => {
    expect(printLines(bars)).toEqual(chartLines(bars));
    expect(printLines(bars, null)).toEqual(chartLines(bars));
  });

  it('one part is the lines of its bars, bar numbers kept, four to a line from its first bar', () => {
    const lines = printLines(bars, { first: 2, end: 11 });
    expect(lines.map((l) => l.bars.map((b) => b.bar))).toEqual([[2, 3, 4, 5], [6, 7, 8, 9], [10]]);
  });

  it('says which part, with the bars as musicians count them', () => {
    expect(partCaption('Thème 1', barsOfRange(bars, { first: 2, end: 10 }))).toBe('Thème 1 · mesures 3–10');
    expect(partCaption('Intro', barsOfRange(bars, { first: 0, end: 1 }))).toBe('Intro · mesures 1');
    expect(partCaption('Intro', [])).toBeNull();
  });

  it('the form and the part have their own rows in the title block', () => {
    const rows = HEADER_ROWS_MM;
    expect(headerHeightMm({ title: true, info: true, part: true, form: true })).toBe(rows.title + rows.part + rows.info + rows.form + rows.gap);
    expect(headerHeightMm({ title: true, info: true, form: true })).toBe(rows.title + rows.info + rows.form + rows.gap);
    expect(headerHeightMm({ title: false, info: false, part: false, form: false })).toBe(0);
    expect(headerHeightMm({ title: false, info: false, form: true })).toBe(rows.form + rows.gap);
  });

  it('« Forme : AABC » only when it is chosen and known', () => {
    expect(headerForm({ form: 'AABC' }, DEFAULT_HEADER)).toBe('Forme : AABC');
    expect(headerForm({ form: 'AABC' }, { ...DEFAULT_HEADER, form: false })).toBeNull();
    expect(headerForm({ form: null }, DEFAULT_HEADER)).toBeNull();
    expect(headerPart({ partLabel: 'Solo · mesures 3–6' })).toBe('Solo · mesures 3–6');
    expect(headerPart({ partLabel: null })).toBeNull();
  });
});

describe('the preview', () => {
  it('shows the whole sheet in the area, never above life size', () => {
    const sheet = { w: 210, h: 297 };
    expect(previewScale({ w: 2000, h: 3000 }, sheet)).toBe(1);
    const wide = previewScale({ w: 400, h: 4000 }, sheet);
    expect(wide).toBeCloseTo(400 / (210 * (96 / 25.4)), 6);
    const tall = previewScale({ w: 4000, h: 500 }, sheet);
    expect(tall).toBeCloseTo(500 / (297 * (96 / 25.4)), 6);
    expect(previewScale({ w: 0, h: 0 }, sheet)).toBeGreaterThan(0);
  });
});

describe('the title block', () => {
  const chart = { title: 'Blues du dimanche', key: 'A♭', meter: { numerator: 4, denominator: 4 }, bpm: 110 };
  it('says the key with the instrument, the meter and the tempo, each one when it is chosen', () => {
    expect(headerInfo(chart, DEFAULT_HEADER, 'ut')).toEqual(['Tonalité de A♭ pour instrument en Ut', '4/4 · tempo 110']);
    expect(headerInfo(chart, { ...DEFAULT_HEADER, tempo: false }, 'sib')).toEqual(['Tonalité de A♭ pour instrument en Si♭']);
    expect(headerInfo(chart, { title: true, key: false, tempo: true, form: true }, 'ut')).toEqual(['4/4 · tempo 110']);
  });
  it('keeps saying the instrument when the key is left out and it is not in C; nothing at all when nothing is chosen', () => {
    expect(headerInfo(chart, { title: true, key: false, tempo: false, form: true }, 'mib')).toEqual(['Pour instrument en Mi♭']);
    expect(headerInfo(chart, { title: true, key: false, tempo: false, form: true }, 'ut')).toEqual([]);
    expect(headerInfo({ ...chart, key: null }, DEFAULT_HEADER, 'ut')).toEqual(['4/4 · tempo 110']);
    expect(headerInfo({ ...chart, bpm: null }, DEFAULT_HEADER, 'ut')).toEqual(['Tonalité de A♭ pour instrument en Ut', '4/4']);
  });
  it('the title is left out when it is not chosen, or when the piece has none', () => {
    expect(headerTitle(chart, DEFAULT_HEADER)).toBe('Blues du dimanche');
    expect(headerTitle(chart, { ...DEFAULT_HEADER, title: false })).toBeNull();
    expect(headerTitle({ title: '  ' }, DEFAULT_HEADER)).toBeNull();
  });
  it('leaving the rows out gives their room to the lines', () => {
    const full = paginate(40, base(), headerHeightMm({ title: true, info: true }));
    const titleOnly = paginate(40, base(), headerHeightMm({ title: true, info: false }));
    const none = paginate(40, base(), headerHeightMm({ title: false, info: false }));
    expect(full.headerMm).toBeGreaterThan(titleOnly.headerMm);
    expect(titleOnly.headerMm).toBeGreaterThan(none.headerMm);
    expect(none.sheets[0]!.count).toBeGreaterThanOrEqual(full.sheets[0]!.count);
  });
});

describe('the choices kept on the device', () => {
  afterEach(() => vi.unstubAllGlobals());
  const store = (initial: Record<string, string> = {}) => {
    const data = new Map(Object.entries(initial));
    vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) });
    return data;
  };

  it('Letter in the regions that use it, A4 elsewhere', () => {
    expect(paperForLocale('en-US')).toBe('lettre');
    expect(paperForLocale('fr_CA')).toBe('lettre');
    expect(paperForLocale('fr-FR')).toBe('a4');
    expect(paperForLocale('fr')).toBe('a4');
    expect(paperForLocale(undefined)).toBe('a4');
  });

  it('are kept and read back, field by field', () => {
    store();
    const chosen: PrintOptions = { orientation: 'paysage', paper: 'lettre', margins: 'larges', scale: 70, fitOne: true, header: { title: false, key: true, tempo: false, form: false }, what: 'part' };
    savePrintOptions(chosen);
    expect(loadPrintOptions()).toEqual(chosen);
  });

  it('what is wrong or missing falls back on the default, field by field', () => {
    expect(normalizePrintOptions({ orientation: 'diagonale', paper: 'a3', margins: 7, scale: 73, fitOne: 'oui', header: { title: 1, key: false } }, 'fr-FR')).toEqual({
      orientation: 'portrait',
      paper: 'a4',
      margins: 'normales',
      scale: 100,
      fitOne: false,
      header: { title: true, key: false, tempo: true, form: true },
      what: 'full',
    });
    expect(normalizePrintOptions(null, 'fr-FR')).toEqual(defaultPrintOptions('fr-FR'));
    expect(normalizePrintOptions('x', 'fr-FR')).toEqual(defaultPrintOptions('fr-FR'));
    expect(normalizePrintOptions({ paper: 'lettre' }, 'fr-FR').paper).toBe('lettre');
  });

  it("options kept before « Ce qu'on imprime » and « Forme » existed still load, with the defaults for them", () => {
    const old = { orientation: 'paysage', paper: 'a4', margins: 'larges', scale: 70, fitOne: false, header: { title: true, key: false, tempo: true } };
    expect(normalizePrintOptions(old, 'fr-FR')).toEqual({ ...old, header: { ...old.header, form: true }, what: 'full' });
  });

  it('a « what » that is not one of the three is the whole chart', () => {
    expect(normalizePrintOptions({ what: 'part' }, 'fr-FR').what).toBe('part');
    expect(normalizePrintOptions({ what: 'simplified' }, 'fr-FR').what).toBe('simplified');
    expect(normalizePrintOptions({ what: 'section' }, 'fr-FR').what).toBe('full');
    expect(normalizePrintOptions({ header: { form: false } }, 'fr-FR').header.form).toBe(false);
  });

  it('the first version of the dialog kept an orientation and a size: both are understood', () => {
    expect(normalizePrintOptions({ orientation: 'paysage', size: 'une' }, 'fr-FR')).toMatchObject({ orientation: 'paysage', fitOne: true, scale: 100 });
    expect(normalizePrintOptions({ orientation: 'portrait', size: 'libre' }, 'fr-FR').fitOne).toBe(false);
  });

  it('a blocked or broken storage gives the defaults, and saving does not throw', () => {
    vi.stubGlobal('navigator', { language: 'fr-FR' });
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadPrintOptions()).toEqual(defaultPrintOptions('fr-FR'));
    expect(() => savePrintOptions(defaultPrintOptions())).not.toThrow();
    store({ 'fabtice.print': '{not json' });
    expect(loadPrintOptions()).toEqual(defaultPrintOptions('fr-FR'));
  });

  it('the page rule has the sheet size and no margin', () => {
    expect(pageRule(paginate(1, base(), 0))).toBe('@page { size: 210mm 297mm; margin: 0; }');
    expect(pageRule(paginate(1, base({ paper: 'lettre', orientation: 'paysage' }), 0))).toBe('@page { size: 279.4mm 215.9mm; margin: 0; }');
  });
});
