import type { Ref } from 'react';
import { formatSigned } from '../grid/format';
import { t } from '../i18n';
import { resetTransposition, setCents } from '../store/actions';
import { CENTS } from '../store/derived';
import { useApp } from '../store/store';

/** Fine tuning in cents, kept out of the way: opened by the Tonalité value. */
export function TuningPanel({ ref }: { ref: Ref<HTMLDivElement> }) {
  const cents = useApp((s) => s.playback.cents);
  const semitones = useApp((s) => s.playback.semitones);
  return (
    <div ref={ref} className="fenetre panneau-accord" role="dialog" aria-label={t('key.fine')}>
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
      <div className="remise">
        <button className="lien" disabled={cents === 0 && semitones === 0} onClick={resetTransposition}>
          {t('key.reset')}
        </button>
      </div>
    </div>
  );
}
