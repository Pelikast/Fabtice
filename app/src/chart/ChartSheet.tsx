// « Grille d'accords »: the sheet, faithful to the mockup (`.vue-grille`,
// `.feuille`, `.grille`, `.case`) and to DESIGN.md: four bars per line, ink
// bar lines, boxed section letters, a double bar at section changes, the loop
// as a brass veil, the current bar filled by an ember hairline.
//
// This file: the sheet, its title line (with the key correction and the
// instrument choice) and the empty states. The bars and everything done on
// them are in ChartGrid.tsx; the editors in ChordEditor.tsx and KeyEditor.tsx.

import { useEffect, useRef } from 'react';
import { nominalBpm } from '../grid/tempoMap';
import { formatBarNumber, RANGE_DASH } from '../grid/format';
import { withAccidentals } from '../harmony/ChordSymbol';
import { keyLabel } from '../harmony/key';
import { formatNumber, t } from '../i18n';
import { INSTRUMENTS, type Instrument } from '../model/harmony';
import { partName } from '../model/structureLabels';
import { setViewMode } from '../store/actions';
import { selectAnalysisStatus, selectChartBars, selectDisplayContext } from '../store/chartSelectors';
import { selectChartDisplay, selectShownBars, selectShownPart } from '../store/chartDisplay';
import { openPrint } from '../store/exportActions';
import { selectSimplifiedChart } from '../store/simplifiedSelectors';
import { setInstrument } from '../store/harmonyActions';
import { isTempoKnown, shownBpm } from '../store/derived';
import { useApp } from '../store/store';
import { runAnalysis } from '../analysis/runner';
import { AnalysisProgressNote } from '../components/AnalysisStatus';
import { PrinterIcon } from '../ui/icons';
import { usePhoneLayout } from '../util/media';
import type { ChartBar } from './layout';
import { ChartGrid } from './ChartGrid';
import { StructureBar, StructureColumn } from './StructureColumn';
import { KeyEditor } from './KeyEditor';

const EMPTY_BARS = 8;

export function ChartSheet() {
  const project = useApp((s) => s.project);
  const status = useApp(selectAnalysisStatus);
  const bars = useApp(selectChartBars);
  const shown = useApp(selectShownBars);
  const display = useApp(selectChartDisplay);
  const phone = usePhoneLayout();
  const hasChords = bars.some((b) => b.chords.length > 0);
  const scroller = useRef<HTMLDivElement>(null);
  // Another display starts at the top of the sheet.
  const displayKey = display.kind === 'part' ? `part:${display.id}` : display.kind;
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [displayKey]);
  return (
    <div className="vue vue-structure" data-affichage={displayKey}>
      {project && !phone && <StructureColumn />}
      <div className="vue-grille" ref={scroller} data-testid="grille-feuille">
        <div className="feuille">
          {project && <ChartHeader canPrint={hasChords} />}
          {project && phone && <StructureBar />}
          {!project ? (
            <div className="vide-message">
              <p>{t('chart.noPiece')}</p>
            </div>
          ) : hasChords ? (
            <>
              <ShownNote shown={shown} />
              <ChartGrid bars={shown} scroller={scroller} />
            </>
          ) : (
            <EmptyChart status={status} />
          )}
        </div>
      </div>
    </div>
  );
}

/** A quiet line above the bars when they are not the whole chart: the part shown, or the simplified chart that is not written yet. */
function ShownNote({ shown }: { shown: ChartBar[] }) {
  const display = useApp(selectChartDisplay);
  const part = useApp(selectShownPart);
  const simplified = useApp(selectSimplifiedChart);
  if (display.kind === 'simplified' && simplified === null) {
    return (
      <p className="structure-note" data-testid="structure-note">
        {t('structure.simplifiedSoon')}
      </p>
    );
  }
  const first = shown[0];
  const last = shown[shown.length - 1];
  if (display.kind !== 'part' || !part || !first || !last) return null;
  const bars = first.bar === last.bar ? formatBarNumber(first.bar) : `${formatBarNumber(first.bar)}${RANGE_DASH}${formatBarNumber(last.bar)}`;
  return (
    <p className="structure-note" data-testid="structure-note">
      {t('structure.shown', { name: partName(part, t), bars })}
    </p>
  );
}

/** Title line: title, key as displayed, meter and tempo; the instrument the chart is written for. */
function ChartHeader({ canPrint }: { canPrint: boolean }) {
  const title = useApp((s) => s.project!.title);
  const ctx = useApp(selectDisplayContext);
  const minor = useApp((s) => s.settings.minorNotation);
  // The signature the piece starts with; later ones are written in their bars (chart/layout.ts#ChartBar.signature).
  const meter = useApp((s) => s.tempoMap.meters[0]!.meter);
  const bpm = useApp((s) => (isTempoKnown(s.tempoMap) ? shownBpm(s.tempoMap, nominalBpm(s.tempoMap, s.project?.duration), s.project?.duration) : null));
  const instrument = useApp((s) => s.view.instrument);
  return (
    <>
    <div className="feuille-tete">
      <h1>{title}</h1>
      <div className="feuille-infos">
        <p data-testid="grille-ton">
          {ctx.key ? (
            <>
              <KeyEditor>
                {t('chart.keyOf')} {withAccidentals(keyLabel(ctx.key, minor))}
              </KeyEditor>
              {instrument !== 'ut' && ` ${t('chart.forInstrument', { instrument: t(`chart.instrument.${instrument}`) })}`}
              {' · '}
            </>
          ) : (
            <>
              <KeyEditor>{t('chart.keyChoose')}</KeyEditor>
              {' · '}
            </>
          )}
          {meter.numerator}/{meter.denominator}
          {bpm !== null && ` · ${t('chart.tempo', { bpm: formatNumber(Math.round(bpm), 0) })}`}
        </p>
        <InstrumentChoice value={instrument} />
        {canPrint && (
          <button className="imprimer-bouton" data-testid="imprimer-grille" title={t('chart.printHint')} onClick={openPrint}>
            <PrinterIcon />
            <span>{t('chart.print')}</span>
          </button>
        )}
      </div>
    </div>
    <p className="aide-doigt">{t('chart.touchHint')}</p>
    </>
  );
}

export function InstrumentChoice({ value }: { value: Instrument }) {
  return (
    <span className="duo instrument" role="group" aria-label={t('chart.instrumentLabel')} title={t('chart.instrumentHint')}>
      {INSTRUMENTS.map((i) => (
        <button key={i} aria-pressed={value === i} onClick={() => setInstrument(i)}>
          {withAccidentals(t(`chart.instrument.${i}`))}
        </button>
      ))}
    </span>
  );
}

/** No chord yet: empty bar lines and a calm sentence (analysis running, failed, or never run). */
function EmptyChart({ status }: { status: ReturnType<typeof selectAnalysisStatus> }) {
  return (
    <>
      <div className="grille-vide" aria-hidden="true">
        {Array.from({ length: EMPTY_BARS }, (_, i) => (
          <span key={i} />
        ))}
      </div>
      <div className="vide-message" data-etat={status}>
        {status === 'running' ? (
          <>
            <h2>{t('chart.analysingTitle')}</h2>
            <p>{t('chart.analysingText')}</p>
            <AnalysisProgressNote />
          </>
        ) : status === 'error' ? (
          <>
            <h2>{t('chart.errorTitle')}</h2>
            <p>{t('chart.errorText')}</p>
            <button className="bouton-cadre" onClick={() => void runAnalysis()}>
              {t('analysis.again')}
            </button>
          </>
        ) : status === 'done' ? (
          <>
            <h2>{t('chart.noChordsTitle')}</h2>
            <p>{t('chart.noChordsText')}</p>
            <button className="bouton-cadre" onClick={() => setViewMode('pistes')}>
              {t('chart.emptyAction')}
            </button>
          </>
        ) : (
          <>
            <h2>{t('chart.emptyTitle')}</h2>
            <p>{t('chart.emptyText')}</p>
            <button className="bouton-cadre" onClick={() => void runAnalysis()}>
              {t('analysis.start')}
            </button>
          </>
        )}
      </div>
    </>
  );
}
