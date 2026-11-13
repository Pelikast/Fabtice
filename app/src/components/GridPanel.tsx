import { useEffect, useState, type Ref } from 'react';
import { formatClock } from '../grid/format';
import { addTap, tapTempo } from '../grid/tapTempo';
import { BPM_MAX, BPM_MIN, NUMERATOR_MAX, NUMERATOR_MIN, firstDownbeat, nominalBpm } from '../grid/tempoMap';
import { decimalSeparator, formatNumber, t } from '../i18n';
import { setDownbeatAtPlayhead, setManualGrid } from '../store/actions';
import { isTempoKnown } from '../store/derived';
import { useApp } from '../store/store';

const NUMERATORS = Array.from({ length: NUMERATOR_MAX - NUMERATOR_MIN + 1 }, (_, i) => NUMERATOR_MIN + i);

/** Parses « 118,4 » or « 118.4 »; null if not a number. */
function parseBpm(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Manual grid entry (no analysis yet): tempo of the piece, tap tempo, beats
 * per bar, and « Premier temps ici » at the playhead.
 */
export function GridPanel({ ref }: { ref: Ref<HTMLDivElement> }) {
  const map = useApp((s) => s.tempoMap);
  const duration = useApp((s) => s.project?.duration);
  const bpm = nominalBpm(map, duration);
  const numerator = map.meters[0]!.meter.numerator;
  const downbeat = firstDownbeat(map);
  const known = isTempoKnown(map);

  const [draft, setDraft] = useState(formatNumber(bpm, 1));
  const [taps, setTaps] = useState<number[]>([]);
  useEffect(() => setDraft(formatNumber(bpm, 1)), [bpm]);

  const commit = () => {
    const n = parseBpm(draft);
    if (n === null) setDraft(formatNumber(bpm, 1));
    else setManualGrid({ bpm: n });
  };
  const step = (d: 1 | -1) => setManualGrid({ bpm: Math.round(bpm) + d });
  const tap = () => {
    const next = addTap(taps, performance.now());
    setTaps(next);
    const tapped = tapTempo(next);
    if (tapped !== null) setManualGrid({ bpm: tapped });
  };

  return (
    <div ref={ref} className="fenetre panneau-grille" role="dialog" aria-label={t('grid.title')}>
      <h2 className="libelle">{t('grid.title')}</h2>

      <div className="panneau-ligne">
        <span>
          {t('grid.bpm')}
          <small>{t('grid.bpmUnit')}</small>
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

      <button className="bouton-cadre" onClick={tap}>
        {t('grid.tap')}
      </button>
      <p className="panneau-note" aria-live="polite">
        {taps.length >= 2 ? t('grid.tapCount', { n: taps.length }) : t('grid.tapHint')}
      </p>

      <div className="panneau-ligne">
        <span>{t('grid.beatsPerBar')}</span>
        <span className="duo temps-mesure" role="group" aria-label={t('grid.beatsPerBar')}>
          {NUMERATORS.map((n) => (
            <button key={n} aria-pressed={n === numerator} onClick={() => setManualGrid({ numerator: n })}>
              {n}
            </button>
          ))}
        </span>
      </div>

      <hr className="panneau-separe" />
      <button className="bouton-cadre" onClick={setDownbeatAtPlayhead}>
        {t('grid.downbeat')}
      </button>
      <p className="panneau-note">
        {known ? t('grid.downbeatAt', { time: formatClock(downbeat, decimalSeparator()) }) : t('grid.downbeatHint')}
      </p>
    </div>
  );
}
