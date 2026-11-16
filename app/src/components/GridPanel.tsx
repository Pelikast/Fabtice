import { useEffect, useState, type Ref } from 'react';
import { runAnalysis } from '../analysis/runner';
import { formatClock } from '../grid/format';
import { addTap, tapTempo } from '../grid/tapTempo';
import { isBeatGrid } from '../grid/corrections';
import { feltBeat, mainMeter } from '../grid/meters';
import { isCompound } from '../grid/tempoMap';
import { BPM_MAX, BPM_MIN, NUMERATOR_MAX, NUMERATOR_MIN, firstDownbeat, nominalBpm } from '../grid/tempoMap';
import { decimalSeparator, formatNumber, t } from '../i18n';
import { closePanel, openSettings, setManualGrid } from '../store/actions';
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
import { useFitPanel } from '../ui/useFitPanel';

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
 * analysis, analyse again). The corrections are shared with the tab
 * « Tempo et analyse » of « Réglages » (the components below).
 */
export function GridPanel({ ref }: { ref: Ref<HTMLDivElement> }) {
  const map = useApp((s) => s.tempoMap);
  const duration = useApp((s) => s.project?.duration);
  const status = useApp(selectAnalysisStatus);
  // Shown and typed per felt beat (the dotted quarter in 6/8) of the main signature; the grid counts denominator units (lot 4, C13).
  const felt = feltBeat(map, duration);
  const dotted = isCompound(mainMeter(map, duration));
  const bpm = nominalBpm(map, duration) / felt;
  const beats = isBeatGrid(map);

  const [draft, setDraft] = useState(formatNumber(bpm, 1));
  const [taps, setTaps] = useState<number[]>([]);
  useEffect(() => setDraft(formatNumber(bpm, 1)), [bpm]);

  const commit = () => {
    const n = parseBpm(draft);
    if (n === null || Math.abs(n - bpm) < 0.05) setDraft(formatNumber(bpm, 1));
    else setManualGrid({ bpm: n * felt });
  };
  const step = (d: 1 | -1) => setManualGrid({ bpm: (Math.round(bpm) + d) * felt });
  const tap = () => {
    const next = addTap(taps, performance.now());
    setTaps(next);
    const tapped = tapTempo(next);
    if (tapped !== null) setManualGrid({ bpm: tapped * felt });
  };

  const fitRef = useFitPanel(ref);
  const hasAnalysis = useApp((s) => s.analysis !== null);

  return (
    <div ref={fitRef} className="fenetre panneau-grille" role="dialog" aria-label={t('grid.title')}>
      <h2 className="libelle">{t('grid.title')}</h2>

      <div className="panneau-ligne">
        <span>
          {t('grid.bpm')}
          <small>{beats ? t('grid.bpmVaries') : t(dotted ? 'grid.bpmUnitDotted' : 'grid.bpmUnit')}</small>
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

      <BeatsPerBarSetting />
      <TempoFixSetting />

      <hr className="panneau-separe" />
      <DownbeatSetting />

      <hr className="panneau-separe" />
      <GridOriginNote />
      {hasAnalysis && <p className="panneau-note">{t('grid.tempoMenuHint')}</p>}
      <div className="panneau-actions">
        <BackToAnalysisButton />
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
      <p className="panneau-note panneau-tous">
        <button className="lien discret" data-testid="tous-reglages-tempo" onClick={() => openSettings('tempo')}>
          {t('settingsWin.allSettings')}
        </button>
      </p>
    </div>
  );
}

/** « Temps par mesure »: the numerator of the signature, one to the maximum. */
export function BeatsPerBarSetting() {
  const map = useApp((s) => s.tempoMap);
  const numerator = map.meters[0]!.meter.numerator;
  return (
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
  );
}

/** « Tempo trouvé »: × 2 and ÷ 2, for an analysis that counted the eighths or only every other beat. */
export function TempoFixSetting() {
  const known = useApp((s) => isTempoKnown(s.tempoMap));
  const canDouble = useApp((s) => gridCorrectionsAvailable(s).double);
  const canHalve = useApp((s) => gridCorrectionsAvailable(s).halve);
  return (
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
  );
}

/** « Premier temps ici » and the first beat one beat earlier or later. */
export function DownbeatSetting() {
  const map = useApp((s) => s.tempoMap);
  const known = isTempoKnown(map);
  const downbeat = firstDownbeat(map);
  return (
    <>
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
      <p className="panneau-note">{known ? t('grid.downbeatAt', { time: formatClock(downbeat, decimalSeparator()) }) : t('grid.downbeatHint')}</p>
    </>
  );
}

/** Where the grid in force comes from (default, typed, analysed, corrected). */
export function GridOriginNote() {
  const origin = useApp((s) => t(`grid.origin.${s.tempoMap.origin}`));
  const status = useApp(selectAnalysisStatus);
  return (
    <p className="panneau-note origine" data-testid="grille-origine">
      {status === 'running' ? t('grid.analysing') : origin}
    </p>
  );
}

/** « Revenir à l'analyse »: only when there is an analysis and the grid is no longer its own. */
export function BackToAnalysisButton() {
  const show = useApp((s) => s.analysis !== null && s.tempoMap.origin !== 'analysis');
  if (!show) return null;
  return (
    <button className="lien" onClick={resetGridToAnalysis}>
      {t('grid.backToAnalysis')}
    </button>
  );
}
