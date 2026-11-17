// The printed sheets: fixed-size pages (paper, orientation, margins in mm) each
// holding whole lines of four bars. The preview of the print dialog and the
// pages the browser or the Mac app print are THIS component, drawn once: the
// preview only shrinks the sheets (`--ech`), the print style (`styles/print.css`)
// puts that back to 1 and breaks the page after each sheet. The pagination is
// `printLayout.ts#paginate`; the browser never paginates.
//
// The bars follow DESIGN.md on paper: four per line, ink on white, chords at the
// place of their beat, ONE size for every chord of the chart (`fit.ts`: a bar with
// two chords is not written smaller), section letters boxed, a double bar at a
// section change, the signature where it changes, the bar number in the corner.
// Nothing here is interactive: no veil, no ember, no « doubtful » style.

import { memo, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { formatBarNumber } from '../grid/format';
import { ChordSymbol, withAccidentals } from '../harmony/ChordSymbol';
import { keyLabel } from '../harmony/key';
import { t } from '../i18n';
import type { Instrument } from '../model/harmony';
import { fitChart, type BarFit, type ChartBar as FitBar, type FitChord } from './fit';
import type { ChartBar, ChartLine } from './layout';
import { headerForm, headerInfo, headerPart, headerTitle, type PrintChart } from './printChart';
import { printBarGeometry, sheetNumberShown, type PrintHeader, type PrintLayout } from './printLayout';

/**
 * What the style sheet draws from, as CSS variables: the sheet and its margins in mm, and everything that depends on
 * the scale already multiplied by it (the width of the content, a line, the unit of the drawing: a 206th of a bar),
 * and the scale itself (`--e`) for the lengths the style sheet writes in mm and pt. The content is never scaled by a
 * transform: the browser cuts a page by layout height, so what is drawn must have the height it prints at.
 */
function sheetStyle(layout: PrintLayout): CSSProperties {
  return {
    '--pl': `${layout.sheet.w}mm`,
    '--ph': `${layout.sheet.h}mm`,
    '--marge': `${layout.margin}mm`,
    '--larg': `${layout.content.w * layout.scale}mm`,
    '--u': `${layout.unitMm * layout.scale}mm`,
    '--e': layout.scale,
    '--ligne': `${layout.lineMm * layout.scale}mm`,
  } as CSSProperties;
}

interface SheetsProps {
  chart: PrintChart;
  layout: PrintLayout;
  header: PrintHeader;
  instrument: Instrument;
}

export const PrintSheets = memo(function PrintSheets({ chart, layout, header, instrument }: SheetsProps) {
  const root = useRef<HTMLDivElement>(null);
  // The size of the chords is the chart's, measured once the sheets are drawn, before the paint.
  useLayoutEffect(() => {
    if (root.current) fitPrintSheets(root.current, layout);
  });
  useLayoutEffect(() => {
    const host = root.current;
    if (!host) return;
    const run = () => fitPrintSheets(host, layout);
    let alive = true;
    // The symbols are wider or narrower once the real fonts are in.
    void document.fonts?.ready.then(() => alive && run());
    document.fonts?.addEventListener?.('loadingdone', run);
    return () => {
      alive = false;
      document.fonts?.removeEventListener?.('loadingdone', run);
    };
  }, [layout]);
  const total = layout.sheets.length;
  const last = chart.lines[chart.lines.length - 1]?.bars.at(-1)?.bar;
  const title = headerTitle(chart, header);
  const info = headerInfo(chart, header, instrument);
  const part = headerPart(chart);
  const form = headerForm(chart, header);
  return (
    <div className="pp-pages" ref={root} data-testid="apercu-pages" data-pages={total} data-echelle={layout.scale}>
      {layout.sheets.map((sheet, i) => (
        <figure className="pp-cadre" key={i} data-page={i + 1}>
          <div className="pp-papier" style={sheetStyle(layout)}>
            <div className="pp-contenu">
              {i === 0 && (title !== null || info.length > 0 || part !== null || form !== null) && (
                <div className="pp-tete" data-testid="apercu-tete">
                  {title !== null && <h1 className="pp-titre">{title}</h1>}
                  {part !== null && <p className="pp-partie">{part}</p>}
                  {info.length > 0 && <p className="pp-infos">{withAccidentals(info.join(' · '))}</p>}
                  {form !== null && <p className="pp-forme">{form}</p>}
                </div>
              )}
              {chart.lines.slice(sheet.first, sheet.first + sheet.count).map((line) => (
                <PrintLine key={line.bars[0]!.bar} line={line} chart={chart} last={last} />
              ))}
            </div>
            {sheetNumberShown(total) && (
              <span className="pp-numero-page" data-testid="apercu-numero">
                {i + 1} / {total}
              </span>
            )}
          </div>
          <figcaption className="pp-legende pas-imprime">{t('print.pageOf', { n: i + 1, total })}</figcaption>
        </figure>
      ))}
    </div>
  );
});

function PrintLine({ line, chart, last }: { line: ChartLine; chart: PrintChart; last: number | undefined }) {
  return (
    <div className={`pp-ligne${line.pickup ? ' pp-levee' : ''}`}>
      {line.bars.map((bar) => (
        <PrintBar key={bar.bar} bar={bar} chart={chart} final={bar.bar === last} />
      ))}
    </div>
  );
}

function PrintBar({ bar, chart, final }: { bar: ChartBar; chart: PrintChart; final: boolean }) {
  const n = bar.chords.length;
  const modulationText = bar.keyChange ? keyLabel(modulationKey(bar, chart).key, modulationKey(bar, chart).minor) : '';
  const cls = ['pp-case', bar.doubleBar ? 'pp-double' : '', bar.signature ? 'pp-signee' : '', bar.keyChange ? 'pp-modulee' : bar.section ? 'pp-lettree' : '', final ? 'pp-finale' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls} data-mesure={bar.bar} data-temps={n > 0 ? bar.beats : undefined} data-accords={n}>
      {bar.keyChange ? (
        // C10: the letter and the key of a modulation share the top row, side by side.
        <div className="pp-entete-case">
          {bar.section && <span className="pp-section">{bar.section}</span>}
          <span className="pp-modulation" data-cle={modulationText}>
            <span className="pp-modulation-mot">{t('modulation.label')}</span> {withAccidentals(modulationText)}
          </span>
        </div>
      ) : (
        bar.section && <span className="pp-section">{bar.section}</span>
      )}
      {bar.signature && (
        <span className="pp-signature" data-signature={`${bar.signature.numerator}/${bar.signature.denominator}`}>
          <span>{bar.signature.numerator}</span>
          <span>{bar.signature.denominator}</span>
        </span>
      )}
      <span className="pp-numero">{formatBarNumber(bar.bar)}</span>
      {bar.chords.map((c, i) => (
        <span key={i} className="pp-accord" data-debut={c.beatInBar} data-rang={i % 2} style={{ '--debut': c.beatInBar / bar.beats } as CSSProperties}>
          <ChordSymbol chord={c.chord} ctx={chart.contexts.get(bar.bar) ?? chart.ctx} />
        </span>
      ))}
      {n === 0 && bar.repeat && (
        <span className="pp-repete" aria-hidden="true">
          𝄎
        </span>
      )}
    </div>
  );
}

/** The key written above a bar where a modulation starts, as displayed (the bar's own context). */
function modulationKey(bar: ChartBar, chart: PrintChart) {
  const ctx = chart.contexts.get(bar.bar) ?? chart.ctx;
  return { key: ctx.key ?? bar.keyChange!, minor: ctx.minor };
}

const px = (value: string) => {
  const v = parseFloat(value);
  return Number.isFinite(v) ? v : 0;
};

/**
 * Gives the whole chart ONE size for its chords and, where a bar needs it, two rows and a push back from the
 * end bar line (`fit.ts` decides; the symbols are measured here). The result is attributes the style sheet turns
 * into sizes: `data-taille` and `data-rangs` on a bar, `--pousse` (in units of 1/206 of a bar) on a chord.
 * The widths are measured in em, so the preview's reduction does not matter; the fit does not depend on the
 * margins or the scale, only on the line height and the width in units of the page.
 */
export function fitPrintSheets(root: HTMLElement, layout: Pick<PrintLayout, 'lineMm' | 'unitMm'>): void {
  const cells = [...root.querySelectorAll<HTMLElement>('.pp-case[data-temps]')];
  for (const cell of cells) {
    cell.removeAttribute('data-taille');
    cell.removeAttribute('data-rangs');
    for (const chord of cell.querySelectorAll<HTMLElement>('.pp-accord')) chord.style.removeProperty('--pousse');
  }
  const bars: FitBar[] = [];
  const buttons: HTMLElement[][] = [];
  for (const cell of cells) {
    // What the preview does to a sheet (a shrink) must not enter the measure of an em.
    const sheet = cell.closest<HTMLElement>('.pp-papier');
    const shrink = sheet && sheet.offsetWidth > 0 ? sheet.getBoundingClientRect().width / sheet.offsetWidth : 1;
    const base = px(getComputedStyle(cell).fontSize);
    const chords: FitChord[] = [];
    const mine: HTMLElement[] = [];
    const beats = Number(cell.dataset.temps) || 4;
    for (const chord of cell.querySelectorAll<HTMLElement>('.pp-accord')) {
      const symbol = chord.querySelector<HTMLElement>('.ch');
      if (!symbol || base <= 0 || shrink <= 0) continue;
      chords.push({ frac: Number(chord.dataset.debut) / beats, em: symbol.getBoundingClientRect().width / shrink / base });
      mine.push(chord);
    }
    buttons.push(mine);
    bars.push({ chords, geometry: printBarGeometry(layout, cell.classList.contains('pp-signee')) });
  }
  const fit = fitChart(bars);
  cells.forEach((cell, i) => {
    if (!bars[i]!.chords.length) return;
    if (fit.step > 0) cell.dataset.taille = String(fit.step);
    const barFit: BarFit = fit.bars[i]!;
    if (barFit.rows === 2) cell.dataset.rangs = '2';
    buttons[i]!.forEach((chord, k) => {
      const push = barFit.push[k]!;
      if (Math.abs(push) > 0.01) chord.style.setProperty('--pousse', push.toFixed(2));
    });
  });
  // A title longer than the sheet is written smaller rather than on two rows (the title block has a fixed height).
  const title = root.querySelector<HTMLElement>('.pp-titre');
  if (title) {
    title.style.removeProperty('font-size');
    if (title.scrollWidth > title.clientWidth + 1) {
      const natural = px(getComputedStyle(title).fontSize);
      title.style.fontSize = `${Math.max(natural * 0.55, (natural * title.clientWidth) / title.scrollWidth - 0.5)}px`;
    }
  }
}
