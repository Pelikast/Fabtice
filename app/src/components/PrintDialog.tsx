// « Imprimer la grille »: a window of two zones, like the print windows people
// know. On the left the preview, the sheets exactly as they will come out (page
// by page, with their number); on the right the options, then « Enregistrer en
// PDF » and « Imprimer ». On a phone the window fills the screen: the preview
// on top (the pages side by side), the options under it, the two buttons stuck
// at the bottom.
//
// The sheets in the preview ARE the printed pages (`chart/PrintSheets.tsx`,
// paginated by `chart/printLayout.ts`): the print style sheet keeps nothing
// else on the page and puts the preview's reduction back to 1. What is printed
// (« ce qu'on imprime ») is `printLines` in `chart/printChart.ts`. The way the
// pages leave is `chart/print.ts`.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { PrintSheets } from '../chart/PrintSheets';
import { headerInfo, headerTitle, hasChords, usePrintChart } from '../chart/printChart';
import {
  PRINT_MARGINS,
  PRINT_ORIENTATIONS,
  PRINT_PAPERS,
  SCALES,
  headerHeightMm,
  paginate,
  previewScale,
  type PrintHeader,
  type PrintMargins,
  type PrintOptions,
  type PrintOrientation,
  type PrintPaper,
} from '../chart/printLayout';
import {
  canSavePdfDirectly,
  listPrinters,
  loadPrintOptions,
  loadPrinterName,
  pageRule,
  printSheets,
  saveSheetsPdf,
  savePrintOptions,
  savePrinterName,
} from '../chart/print';
import { selectChartBars } from '../store/chartSelectors';
import { withAccidentals } from '../harmony/ChordSymbol';
import { t } from '../i18n';
import { INSTRUMENTS, type Instrument } from '../model/harmony';
import type { PrinterInfo } from '../platform/desktopBridge';
import { closePrint } from '../store/exportActions';
import { appStore, useApp } from '../store/store';
import { CloseIcon } from '../ui/icons';

type Phase = { kind: 'choose' } | { kind: 'working' } | { kind: 'saved' } | { kind: 'error' };

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]';

export function PrintDialog() {
  const open = useApp((s) => s.ui.printOpen);
  if (!open) return null;
  return <PrintBox />;
}

/** The sheets' size as an `@page` rule in the document, for as long as the dialog is open; the print style sheet keeps only the sheets then. */
function usePageRule(rule: string | null) {
  useEffect(() => {
    if (!rule) return;
    document.documentElement.dataset.imprime = '';
    const style = document.createElement('style');
    style.dataset.impression = 'page';
    style.textContent = rule;
    document.head.append(style);
    return () => {
      style.remove();
      delete document.documentElement.dataset.imprime;
    };
  }, [rule]);
}

/** The area of the preview, observed: the sheets are shrunk to it (the whole sheet visible at once). */
function useAreaSize(ref: React.RefObject<HTMLElement | null>, active: boolean) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const measure = () => {
      const style = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const h = el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      setSize((old) => (Math.abs(old.w - w) < 0.5 && Math.abs(old.h - h) < 0.5 ? old : { w, h }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, active]);
  return size;
}

function PrintBox() {
  const bars = useApp(selectChartBars);
  const printable = hasChords(bars);
  const [options, setOptions] = useState<PrintOptions>(loadPrintOptions);
  // The instrument is the dialog's own choice (it starts as the screen's): printing for a trumpet does not rewrite the screen.
  const [instrument, setInstrument] = useState<Instrument>(() => appStore.getState().view.instrument);
  const [phase, setPhase] = useState<Phase>({ kind: 'choose' });
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [printer, setPrinter] = useState<string | null>(loadPrinterName);
  const [copies, setCopies] = useState(1);
  const box = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const working = phase.kind === 'working';
  const pdfDirect = canSavePdfDirectly();

  const chart = usePrintChart(instrument);
  const title = chart ? headerTitle(chart, options.header) : null;
  const info = chart ? headerInfo(chart, options.header, instrument) : [];
  const layout = useMemo(() => paginate(chart?.lines.length ?? 0, options, headerHeightMm({ title: title !== null, info: info.length > 0 })), [chart?.lines.length, options, title, info.length]);
  usePageRule(printable ? pageRule(layout) : null);

  const area = useAreaSize(scroller, printable);
  const echelle = area.w > 0 && area.h > 0 ? previewScale({ w: area.w, h: area.h - 30 }, layout.sheet) : 0.5;

  // Focus goes into the window, and comes back to where it was when the window closes.
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (firstRef.current ?? closeRef.current)?.focus({ preventScroll: true });
    return () => {
      if (before && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, []);
  // The printers the system lists (the Mac app); a browser has none to offer.
  useEffect(() => {
    let alive = true;
    void listPrinters().then((list) => alive && setPrinters(list));
    return () => {
      alive = false;
    };
  }, []);

  const choose = (patch: Partial<PrintOptions>) => {
    const next = { ...options, ...patch };
    setOptions(next);
    savePrintOptions(next);
    if (phase.kind !== 'working') setPhase({ kind: 'choose' });
  };
  const chooseHeader = (patch: Partial<PrintHeader>) => choose({ header: { ...options.header, ...patch } });
  const chosenPrinter = printers.find((p) => p.name === printer) ?? printers[0] ?? null;

  const run = async (action: 'print' | 'pdf') => {
    if (!chart || working) return;
    setPhase({ kind: 'working' });
    try {
      if (action === 'pdf') {
        const result = await saveSheetsPdf(options, chart.title);
        if (result.kind === 'browser') return closePrint();
        setPhase(result.kind === 'saved' ? { kind: 'saved' } : result.kind === 'cancelled' ? { kind: 'choose' } : { kind: 'error' });
        return;
      }
      const outcome = await printSheets(options, { printer: chosenPrinter?.name ?? null, copies });
      if (outcome.kind === 'done') return closePrint();
      setPhase(outcome.kind === 'cancelled' ? { kind: 'choose' } : { kind: 'error' });
    } catch {
      setPhase({ kind: 'error' });
    }
  };

  // Space chooses and ticks in this window; it must not reach the app's own Space (play and pause, `ui/useGlobalKeys.ts`).
  const keepSpace = (e: KeyboardEvent) => {
    if (e.key === ' ') e.stopPropagation();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    keepSpace(e);
    if (e.key === 'Escape' && !working) {
      e.stopPropagation();
      closePrint();
      return;
    }
    if (e.key !== 'Tab' || !box.current) return;
    // Focus stays in the window: Tab from the last control goes to the first, Shift+Tab the other way.
    const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const here = document.activeElement;
    if (e.shiftKey && (here === first || !box.current.contains(here))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (here === last || !box.current.contains(here))) {
      e.preventDefault();
      first.focus();
    }
  };

  const pagesLabel = layout.sheets.length === 1 ? t('print.pagesOne') : t('print.pagesMany', { n: layout.sheets.length });
  const fitOn = options.fitOne && layout.fitPossible;
  return (
    <div
      className="voile ouverte voile-impression"
      role="dialog"
      aria-modal="true"
      aria-labelledby="impression-titre"
      data-testid="impression"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !working) closePrint();
      }}
      onKeyDown={onKeyDown}
      onKeyUp={keepSpace}
    >
      <div className="fenetre-impression" ref={box} data-vide={printable ? undefined : ''}>
        <div className="imp-entete pas-imprime">
          <h2 id="impression-titre">{t('print.title')}</h2>
          <button ref={closeRef} className="fermer" aria-label={t('print.close')} onClick={closePrint} disabled={working}>
            <CloseIcon />
          </button>
        </div>

        {!printable || !chart ? (
          <div className="imp-vide pas-imprime" data-testid="impression-vide">
            <p>
              <strong>{t('print.empty')}</strong>
            </p>
            <p>{t('print.emptyHint')}</p>
          </div>
        ) : (
          <>
            <section className="imp-apercu" aria-label={t('print.preview')}>
              <div className="imp-apercu-tete pas-imprime">
                <span className="etiquette">{t('print.preview')}</span>
                <span data-testid="impression-pages">{pagesLabel}</span>
              </div>
              <div className="imp-apercu-defile" ref={scroller} style={{ '--ech': echelle } as React.CSSProperties} data-testid="apercu" tabIndex={0} aria-label={t('print.preview')}>
                <PrintSheets chart={chart} layout={layout} header={options.header} instrument={instrument} />
              </div>
            </section>

            <div className="imp-options pas-imprime" role="group" aria-label={t('print.options')}>
              <div className="imp-rangee">
                <Group label={t('print.orientation')}>
                  <Radios<PrintOrientation>
                    value={options.orientation}
                    items={PRINT_ORIENTATIONS.map((o) => [o, o === 'portrait' ? t('print.portrait') : t('print.landscape')])}
                    onPick={(orientation) => choose({ orientation })}
                    firstRef={firstRef}
                  />
                </Group>
                <Group label={t('print.paper')}>
                  <Radios<PrintPaper> value={options.paper} items={PRINT_PAPERS.map((p) => [p, p === 'a4' ? t('print.paperA4') : t('print.paperLetter')])} onPick={(paper) => choose({ paper })} />
                </Group>
              </div>

              <Group label={t('print.margins')}>
                <Radios<PrintMargins>
                  value={options.margins}
                  items={PRINT_MARGINS.map((m) => [m, m === 'etroites' ? t('print.marginsNarrow') : m === 'normales' ? t('print.marginsNormal') : t('print.marginsWide')])}
                  onPick={(margins) => choose({ margins })}
                />
              </Group>

              <Group label={t('print.scale')}>
                <div className="imp-echelle">
                  <select
                    className="imp-liste"
                    aria-label={t('print.scale')}
                    data-testid="impression-echelle"
                    value={Math.round((fitOn ? layout.scale * 100 : options.scale))}
                    disabled={fitOn}
                    onChange={(e) => choose({ scale: Number(e.target.value) })}
                  >
                    {fitOn && !SCALES.includes(Math.round(layout.scale * 100)) && <option value={Math.round(layout.scale * 100)}>{t('print.scaleValue', { n: Math.round(layout.scale * 100) })}</option>}
                    {SCALES.map((s) => (
                      <option key={s} value={s}>
                        {t('print.scaleValue', { n: s })}
                      </option>
                    ))}
                  </select>
                  <label className="imp-case">
                    <input
                      type="checkbox"
                      data-testid="impression-une-page"
                      checked={fitOn}
                      disabled={!layout.fitPossible}
                      aria-describedby="impression-une-note"
                      onChange={(e) => choose({ fitOne: e.target.checked })}
                    />
                    <span>{t('print.fitOne')}</span>
                  </label>
                </div>
                <p className="imp-note" id="impression-une-note" data-testid="impression-une-note">
                  {!layout.fitPossible ? t('print.fitOneTooLong') : fitOn ? t('print.fitOneScale', { n: Math.round(layout.scale * 100) }) : ''}
                </p>
              </Group>

              <Group label={t('print.instrument')}>
                <Radios<Instrument> value={instrument} items={INSTRUMENTS.map((i) => [i, t(`chart.instrument.${i}`)])} onPick={(i) => setInstrument(i)} accidentals />
              </Group>

              <Group label={t('print.header')}>
                <div className="imp-cases">
                  <label className="imp-case">
                    <input type="checkbox" data-testid="impression-titre-case" checked={options.header.title} onChange={(e) => chooseHeader({ title: e.target.checked })} />
                    <span>{t('print.headerTitle')}</span>
                  </label>
                  <label className="imp-case">
                    <input type="checkbox" data-testid="impression-ton-case" checked={options.header.key} onChange={(e) => chooseHeader({ key: e.target.checked })} />
                    <span>{t('print.headerKey')}</span>
                  </label>
                  <label className="imp-case">
                    <input type="checkbox" data-testid="impression-tempo-case" checked={options.header.tempo} onChange={(e) => chooseHeader({ tempo: e.target.checked })} />
                    <span>{t('print.headerTempo')}</span>
                  </label>
                </div>
              </Group>

              {printers.length > 0 && (
                <Group label={t('print.printer')}>
                  <div className="imp-imprimante" data-testid="impression-imprimante">
                    <select
                      className="imp-liste imp-liste-large"
                      aria-label={t('print.printer')}
                      value={chosenPrinter?.name ?? ''}
                      onChange={(e) => {
                        setPrinter(e.target.value);
                        savePrinterName(e.target.value);
                      }}
                    >
                      {printers.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.isDefault ? t('print.printerDefault', { name: p.displayName }) : p.displayName}
                        </option>
                      ))}
                    </select>
                    <label className="imp-copies">
                      <span>{t('print.copies')}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={99}
                        value={copies}
                        data-testid="impression-copies"
                        onChange={(e) => setCopies(Math.min(99, Math.max(1, Math.round(Number(e.target.value)) || 1)))}
                      />
                    </label>
                  </div>
                </Group>
              )}
            </div>

            <div className="imp-pied pas-imprime">
              {!pdfDirect && phase.kind === 'choose' && <p className="imp-note">{t('print.browserPdf')}</p>}
              {phase.kind === 'saved' && (
                <p className="imp-note" role="status" data-testid="impression-ok">
                  {t('print.saved')}
                </p>
              )}
              {phase.kind === 'error' && (
                <p className="imp-note imp-erreur" role="alert">
                  {t('print.failed')}
                </p>
              )}
              <div className="imp-actions">
                <button className="bouton-cadre" data-testid="impression-pdf" disabled={working} onClick={() => void run('pdf')}>
                  {t('print.savePdf')}
                </button>
                <button className="imp-principal" data-testid="impression-imprimer" disabled={working} onClick={() => void run('print')}>
                  {t('print.print')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="imp-groupe">
      <h3>{label}</h3>
      {children}
    </div>
  );
}

/** A group of buttons of which one is chosen (the look of the « m / – » choice of the settings). */
function Radios<T extends string>({
  value,
  items,
  onPick,
  firstRef,
  accidentals,
}: {
  value: T;
  items: [T, string][];
  onPick: (value: T) => void;
  firstRef?: React.Ref<HTMLButtonElement>;
  accidentals?: boolean;
}) {
  return (
    <div className="duo imp-duo" role="radiogroup">
      {items.map(([id, label], i) => (
        <button key={id} ref={i === 0 ? firstRef : undefined} role="radio" aria-checked={value === id} data-choix={id} onClick={() => onPick(id)}>
          {accidentals ? withAccidentals(label) : label}
        </button>
      ))}
    </div>
  );
}
