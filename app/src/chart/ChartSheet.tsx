// « Grille d'accords »: the sheet, faithful to the mockup (`.vue-grille`,
// `.feuille`, `.grille`, `.case`) and to DESIGN.md: four bars per line, ink
// bar lines, boxed section letters, a double bar at section changes, the loop
// as a brass veil, the current bar filled by an ember hairline (frame loop,
// `usePlayheadBar`). Read-only for now.
//
// Seams for what comes next (see app/README.md, « Grille d'accords ») :
//   - every bar cell carries `data-mesure` (bar index) and every chord
//     `data-accord` (its index in the bar): gestures (click to seek, drag to
//     loop, click a chord to edit) can be added on `.grille` by delegation;
//   - `ChartGrid` takes `onBarPointerDown` / `onChordClick` props, unused here;
//   - layout and edits are pure functions in `chart/layout.ts` and `chart/edits.ts`.

import { useRef, type CSSProperties, type PointerEvent } from 'react';
import { formatBarNumber } from '../grid/format';
import { nominalBpm } from '../grid/tempoMap';
import { ChordSymbol, withAccidentals } from '../harmony/ChordSymbol';
import { keyLabel } from '../harmony/key';
import type { DisplayContext } from '../harmony/display';
import { formatNumber, t } from '../i18n';
import { INSTRUMENTS, type Instrument } from '../model/harmony';
import { setViewMode } from '../store/actions';
import { selectAnalysisStatus, selectChartBars, selectDisplayContext } from '../store/chartSelectors';
import { setInstrument } from '../store/harmonyActions';
import { isTempoKnown } from '../store/derived';
import { useApp } from '../store/store';
import { runAnalysis } from '../analysis/runner';
import { AnalysisProgressNote } from '../components/AnalysisStatus';
import { chartLines, loopBars, type ChartBar, type ChartLine } from './layout';
import { usePlayheadBar } from './usePlayheadBar';

const EMPTY_BARS = 8;

export function ChartSheet() {
  const project = useApp((s) => s.project);
  const status = useApp(selectAnalysisStatus);
  const bars = useApp(selectChartBars);
  const hasChords = bars.some((b) => b.chords.length > 0);
  return (
    <div className="vue vue-grille">
      <div className="feuille">
        {project && <ChartHeader />}
        {!project ? (
          <div className="vide-message">
            <p>{t('chart.noPiece')}</p>
          </div>
        ) : hasChords ? (
          <ChartGrid bars={bars} />
        ) : (
          <EmptyChart status={status} />
        )}
      </div>
    </div>
  );
}

/** Title line: title, key as displayed, meter and tempo; the instrument the chart is written for. */
function ChartHeader() {
  const title = useApp((s) => s.project!.title);
  const ctx = useApp(selectDisplayContext);
  const minor = useApp((s) => s.settings.minorNotation);
  const meter = useApp((s) => s.tempoMap.meters[0]!.meter);
  const bpm = useApp((s) => (isTempoKnown(s.tempoMap) ? nominalBpm(s.tempoMap, s.project?.duration) : null));
  const instrument = useApp((s) => s.view.instrument);
  return (
    <div className="feuille-tete">
      <h1>{title}</h1>
      <div className="feuille-infos">
        <p data-testid="grille-ton">
          {ctx.key && (
            <>
              {t('chart.keyOf')} {withAccidentals(keyLabel(ctx.key, minor))}
              {instrument !== 'ut' && ` ${t('chart.forInstrument', { instrument: t(`chart.instrument.${instrument}`) })}`}
              {' · '}
            </>
          )}
          {meter.numerator}/{meter.denominator}
          {bpm !== null && ` · ${t('chart.tempo', { bpm: formatNumber(Math.round(bpm), 0) })}`}
        </p>
        <InstrumentChoice value={instrument} />
      </div>
    </div>
  );
}

function InstrumentChoice({ value }: { value: Instrument }) {
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

export interface ChartGridProps {
  bars: ChartBar[];
  /** Seam for the gestures (click to seek, drag to loop); not wired yet. */
  onBarPointerDown?: (bar: number, e: PointerEvent<HTMLDivElement>) => void;
  /** Seam for the chord editor; not wired yet. */
  onChordClick?: (bar: number, index: number) => void;
}

/** The bars, four per line, with the loop veil and the current-bar hairline. */
export function ChartGrid({ bars, onBarPointerDown, onChordClick }: ChartGridProps) {
  const root = useRef<HTMLDivElement>(null);
  const ctx = useApp(selectDisplayContext);
  // As one string: a new object each time would re-render forever.
  const loopKey = useApp((s) => {
    const l = loopBars(s.tempoMap, s.loop.region, s.loop.enabled);
    return l ? `${l.first}:${l.last}` : '';
  });
  const loop = loopKey ? { first: Number(loopKey.split(':')[0]), last: Number(loopKey.split(':')[1]) } : null;
  usePlayheadBar(root);
  const lines: ChartLine[] = chartLines(bars);
  const last = bars[bars.length - 1]?.bar;
  return (
    <div className="grille" ref={root} data-testid="grille">
      {lines.map((line) => (
        <div key={line.bars[0]!.bar} className={`ligne${line.pickup ? ' levee' : ''}`}>
          {line.bars.map((b) => (
            <BarCell
              key={b.bar}
              bar={b}
              ctx={ctx}
              inLoop={loop !== null && b.bar >= loop.first && b.bar <= loop.last}
              final={b.bar === last}
              onPointerDown={onBarPointerDown}
              onChordClick={onChordClick}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function BarCell({
  bar,
  ctx,
  inLoop,
  final,
  onPointerDown,
  onChordClick,
}: {
  bar: ChartBar;
  ctx: DisplayContext;
  inLoop: boolean;
  final: boolean;
  onPointerDown?: ChartGridProps['onBarPointerDown'];
  onChordClick?: ChartGridProps['onChordClick'];
}) {
  const n = bar.chords.length;
  const cls = ['case', n === 2 ? 'deux' : n > 2 ? 'trois' : '', bar.doubleBar ? 'double' : '', inLoop ? 'dans-boucle' : '', final ? 'finale' : '']
    .filter(Boolean)
    .join(' ');
  const label = formatBarNumber(bar.bar);
  return (
    <div
      className={cls}
      data-mesure={bar.bar}
      aria-label={t('chart.bar', { n: label })}
      onPointerDown={onPointerDown ? (e) => onPointerDown(bar.bar, e) : undefined}
    >
      {bar.section && <span className="section">{bar.section}</span>}
      <span className="numero">{label}</span>
      {bar.chords.map((c, i) => (
        <span
          key={i}
          className={`accord-case${c.origin === 'manual' ? ' main' : ''}`}
          data-accord={i}
          data-origine={c.origin}
          // A chord that does not start on the bar line sits where its beat is.
          style={i === 0 && c.beatInBar > 0 ? ({ '--debut': c.beatInBar / bar.beats } as CSSProperties) : undefined}
          onClick={onChordClick ? () => onChordClick(bar.bar, i) : undefined}
        >
          <ChordSymbol chord={c.chord} ctx={ctx} doubtful={c.doubtful} />
        </span>
      ))}
      {bar.repeat && (
        <span className="repete" role="img" aria-label={t('chord.repeat')}>
          𝄎
        </span>
      )}
    </div>
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
