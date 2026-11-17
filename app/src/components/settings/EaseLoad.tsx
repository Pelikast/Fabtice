// « Alléger le travail pour l'appareil » (C2, stage 6): the case (« Nouveau projet », Réglages → Général, the
// launch of a separation later: one setting, the same everywhere) and the slider of Réglages → Avancé.
// The rules and what they do to each computation are `settings/easeLoad.ts`.

import { useId } from 'react';
import { t } from '../../i18n';
import { EASE_LOAD_MAX, EASE_LOAD_MIN } from '../../model/project';
import { setEaseLoad, setEaseLoadPercent } from '../../store/settingsActions';
import { useApp } from '../../store/store';
import { CheckRow } from './parts';

/** True while one of the three heavy computations runs: a change is then for the next one. */
function useComputing(): boolean {
  return useApp((s) => s.separationRun.status === 'running' || s.analysisRun.status === 'running' || s.render.status === 'rendering');
}

/** The case, the same everywhere it is offered, with its note (the percentage in force). */
export function EaseLoadCheck({ testId = 'alleger' }: { testId?: string }) {
  const on = useApp((s) => s.settings.easeLoad);
  const percent = useApp((s) => s.settings.easeLoadPercent);
  const busy = useComputing();
  const note = t('ease.note', { percent }) + (busy ? ` ${t('ease.noteBusy')}` : '');
  return <CheckRow checked={on} onChange={setEaseLoad} label={t('ease.label')} note={note} testId={testId} />;
}

/** The slider (20 to 99 %), with its honest sentence about long slices. */
export function EaseLoadSlider() {
  const id = useId();
  const on = useApp((s) => s.settings.easeLoad);
  const percent = useApp((s) => s.settings.easeLoadPercent);
  const value = t('ease.slider.value', { percent });
  return (
    <div className="option option-colonne alleger-curseur" data-testid="alleger-curseur">
      <label className="alleger-ligne" htmlFor={id}>
        <span>{t('ease.slider.label')}</span>
        <strong data-testid="alleger-valeur">{value}</strong>
      </label>
      <input
        id={id}
        type="range"
        min={EASE_LOAD_MIN}
        max={EASE_LOAD_MAX}
        step={1}
        value={percent}
        data-testid="alleger-pourcentage"
        aria-valuetext={value}
        aria-describedby={`${id}-note`}
        onChange={(e) => setEaseLoadPercent(Number(e.target.value))}
      />
      <small id={`${id}-note`}>
        {t('ease.slider.note')}
        {!on && ` ${t('ease.slider.inactive')}`}
      </small>
    </div>
  );
}
