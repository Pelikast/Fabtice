import type { Ref } from 'react';
import { formatSigned } from '../grid/format';
import { formatNumber, t } from '../i18n';
import { resetTransposition, setCents } from '../store/actions';
import { tuningInForce, tuningOffer } from '../store/chartSelectors';
import { CENTS } from '../store/derived';
import { compensateTuning, dismissTuningOffer } from '../store/harmonyActions';
import { useApp } from '../store/store';
import { useFitPanel } from '../ui/useFitPanel';

/** Fine tuning in cents, kept out of the way: opened by the Tonalité value. */
export function TuningPanel({ ref }: { ref: Ref<HTMLDivElement> }) {
  const cents = useApp((s) => s.playback.cents);
  const semitones = useApp((s) => s.playback.semitones);
  const fitRef = useFitPanel(ref, true);
  return (
    <div ref={fitRef} className="fenetre panneau-accord" role="dialog" aria-label={t('key.fine')}>
      <h2 className="libelle">{t('key.centsLabel')}</h2>
      <div className="cents">
        <button aria-label={t('key.centsDown')} disabled={cents <= CENTS.min} onClick={() => setCents(cents - 1)}>
          −
        </button>
        <strong data-testid="cents">{t('key.cents', { cents: formatSigned(cents) })}</strong>
        <button aria-label={t('key.centsUp')} disabled={cents >= CENTS.max} onClick={() => setCents(cents + 1)}>
          +
        </button>
      </div>
      <input
        type="range"
        min={CENTS.min}
        max={CENTS.max}
        step={1}
        value={cents}
        aria-label={t('key.centsLabel')}
        onChange={(e) => setCents(Number(e.target.value))}
      />
      <RecordingTuning />
      <div className="remise">
        <button className="lien" disabled={cents === 0 && semitones === 0} onClick={resetTransposition}>
          {t('key.reset')}
        </button>
      </div>
    </div>
  );
}

/** A = how many hertz for a distance in cents from 440. */
const hertz = (cents: number) => 440 * 2 ** (cents / 1200);

/**
 * What the analysis measured: the recording's distance from A = 440 Hz, and
 * the offer to compensate it with the cents above (once compensated or
 * declined, only the measure stays).
 */
function RecordingTuning() {
  // Primitive selections only: a new object each time would re-render forever.
  const measured = useApp((s) => tuningInForce(s).cents);
  const compensation = useApp((s) => tuningOffer(s)?.compensation ?? null);
  if (measured === null) return null;
  const measure = t('tuning.measured', { hz: formatNumber(hertz(measured), 1), cents: formatSigned(Math.round(measured)) });
  return (
    <div className="accordage" data-testid="accordage">
      <p className="panneau-note">{measure}</p>
      {compensation !== null && (
        <div className="accordage-offre">
          <button className="bouton-cadre" onClick={compensateTuning}>
            {t('tuning.compensate', { cents: formatSigned(compensation) })}
          </button>
          <button className="lien" onClick={dismissTuningOffer}>
            {t('tuning.dismiss')}
          </button>
        </div>
      )}
    </div>
  );
}
