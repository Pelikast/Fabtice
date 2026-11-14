import { useEffect, useState, type Ref } from 'react';
import { runAnalysis } from '../analysis/runner';
import { formatClock } from '../grid/format';
import { addTap, tapTempo } from '../grid/tapTempo';
import { isBeatGrid } from '../grid/corrections';
import { BPM_MAX, BPM_MIN, NUMERATOR_MAX, NUMERATOR_MIN, firstDownbeat, nominalBpm } from '../grid/tempoMap';
import { decimalSeparator, formatNumber, t } from '../i18n';
import { closePanel, setManualGrid } from '../store/actions';
import { selectAnalysisStatus } from '../store/chartSelectors';
import { isTempoKnown } from '../store/derived';
import {
  doubleTheTempo,
  gridCorrectionsAvailable,
  halveTheTempo,
  moveDownbeat,
  placeDownbeatAtPlayhead,
  resetGridToAnalysis,
  setBeatsPerBar,
} from '../store/gridActions';
import { useApp } from '../store/store';

const NUMERATORS = Array.from({ length: NUMERATOR_MAX - NUMERATOR_MIN + 1 }, (_, i) => NUMERATOR_MIN + i);

/** Parses « 118,4 » or « 118.4 »; null if not a number. */
function parseBpm(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * « Tempo et mesures »: the grid by hand (tempo of the piece, tap tempo,
 * beats per bar, « Premier temps ici ») and the corrections of an analysed
 * grid (tempo × 2 and ÷ 2, first beat one beat earlier or later, back to the
 * analysis, analyse again).
 */
export function GridPanel({ ref }: { ref: Ref<HTMLDivElement> }) {
  const map = useApp((s) => s.tempoMap);
  const duration = useApp((s) => s.project?.duration);
  const status = useApp(selectAnalysisStatus);
  const hasAnalysis = useApp((s) => s.analysis !== null);
  const canDouble = useApp((s) => gridCorrectionsAvailable(s).double);
  const canHalve = useApp((s) => gridCorrectionsAvailable(s).halve);
  const bpm = nominalBpm(map, duration);
  const numerator = map.meters[0]!.meter.numerator;
  const downbeat = firstDownbeat(map);
  const known = isTempoKnown(map);
  const beats = isBeatGrid(map);

  const [draft, setDraft] = useState(formatNumber(bpm, 1));
  const [taps, setTaps] = useState<number[]>([]);
  useEffect(() => setDraft(formatNumber(bpm, 1)), [bpm]);

  const commit = () => {
    const n = parseBpm(draft);
    if (n === null || Math.abs(n - bpm) < 0.05) setDraft(formatNumber(bpm, 1));
    else setManualGrid({ bpm: n });
  };
  const step = (d: 1 | -1) => setManualGrid({ bpm: Math.round(bpm) + d });
  const tap = () => {
    const next = addTap(taps, performance.now());
    setTaps(next);
    const tapped = tapTempo(next);
    if (tapped !== null) setManualGrid({ bpm: tapped });
  };

  const origin = t(`grid.origin.${map.origin}`);

  return (
    <div ref={ref} className="fenetre panneau-grille" role="dialog" aria-label={t('grid.title')}>
      <h2 className="libelle">{t('grid.title')}</h2>

      <div className="panneau-ligne">
        <span>
          {t('grid.bpm')}
          <small>{beats ? t('grid.bpmVaries') : t('grid.bpmUnit')}</small>
        </span>
        <span className="saisie">
          <button aria-label={t('grid.slower')} onClick={() => step(-1)} disabled={bpm <= BPM_MIN}>
            −
          </button>
          <input
            type="text"
            inputMode="decimal"
            aria-label={t('grid.bpm')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
            }}
          />
          <button aria-label={t('grid.faster')} onClick={() => step(1)} disabled={bpm >= BPM_MAX}>
            +
          </button>
        </span>
      </div>
      {beats && <p className="panneau-note">{t('grid.bpmReplaces')}</p>}

      <button className="bouton-cadre" onClick={tap}>
        {t('grid.tap')}
      </button>
      <p className="panneau-note" aria-live="polite">
        {taps.length >= 2 ? t('grid.tapCount', { n: taps.length }) : t('grid.tapHint')}
      </p>

      <div className="panneau-ligne empile">
        <span>{t('grid.beatsPerBar')}</span>
        <span className="duo temps-mesure" role="group" aria-label={t('grid.beatsPerBar')}>
          {NUMERATORS.map((n) => (
            <button key={n} aria-pressed={n === numerator} onClick={() => setBeatsPerBar(n)}>
              {n}
            </button>
          ))}
        </span>
      </div>

      <div className="panneau-ligne empile">
        <span>{t('grid.tempoFix')}</span>
        <span className="duo corrige" role="group" aria-label={t('grid.tempoFix')}>
          <button onClick={halveTheTempo} disabled={!known || !canHalve} title={t('grid.halveHint')}>
            {t('grid.halve')}
          </button>
          <button onClick={doubleTheTempo} disabled={!known || !canDouble} title={t('grid.doubleHint')}>
            {t('grid.double')}
          </button>
        </span>
      </div>

      <hr className="panneau-separe" />
      <div className="premier-temps">
        <button className="bouton-cadre pas-temps" aria-label={t('grid.downbeatEarlier')} title={t('grid.downbeatEarlier')} disabled={!known} onClick={() => moveDownbeat(-1)}>
          ‹
        </button>
        <button className="bouton-cadre" onClick={placeDownbeatAtPlayhead}>
          {t('grid.downbeat')}
        </button>
        <button className="bouton-cadre pas-temps" aria-label={t('grid.downbeatLater')} title={t('grid.downbeatLater')} disabled={!known} onClick={() => moveDownbeat(1)}>
          ›
        </button>
      </div>
      <p className="panneau-note">
        {known ? t('grid.downbeatAt', { time: formatClock(downbeat, decimalSeparator()) }) : t('grid.downbeatHint')}
      </p>

      <hr className="panneau-separe" />
      <p className="panneau-note origine" data-testid="grille-origine">
        {status === 'running' ? t('grid.analysing') : origin}
      </p>
      <div className="panneau-actions">
        {hasAnalysis && map.origin !== 'analysis' && (
          <button className="lien" onClick={resetGridToAnalysis}>
            {t('grid.backToAnalysis')}
          </button>
        )}
        <button
          className="lien"
          disabled={status === 'running'}
          onClick={() => {
            closePanel();
            void runAnalysis();
          }}
        >
          {status === 'none' ? t('analysis.start') : t('analysis.again')}
        </button>
      </div>
    </div>
  );
}
