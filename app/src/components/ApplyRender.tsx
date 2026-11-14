// « Appliquer » (lot 3): the button in the transport when key or tempo differ
// from the original and the best render is not in place, its short waiting
// screen, and the quiet « rendu appliqué » once it is. Ink only: the one red
// thing stays the play button and the playhead.

import { useEffect, useRef, type CSSProperties } from 'react';
import { t } from '../i18n';
import { applyRender, cancelRender, selectApplyError, selectApplyState } from '../render/controller';
import { secondsLeft, useRenderProgress } from '../render/progress';
import { appStore, useApp } from '../store/store';

export function ApplyControl() {
  const state = useApp(selectApplyState);
  if (state === 'original') return null;
  if (state === 'applied') {
    return (
      <span className="applique" data-testid="applique" title={t('apply.buttonTitle')}>
        {t('apply.applied')}
      </span>
    );
  }
  return (
    <button className="appliquer" data-testid="appliquer" title={t('apply.buttonTitle')} disabled={state === 'rendering'} onClick={() => void applyRender()}>
      {t('apply.button')}
    </button>
  );
}

/** « encore environ 2 min », once the pace is known (a few seconds in); null before. */
function timeLeft(seconds: number | null): string | null {
  if (seconds === null) return null;
  if (seconds < 60) return t('apply.remainingShort');
  const minutes = Math.round(seconds / 60);
  const time = minutes < 60 ? t('wait.minutes', { n: minutes }) : t('wait.hours', { h: Math.floor(minutes / 60), m: String(minutes % 60).padStart(2, '0') });
  return t('apply.remaining', { time });
}

/** The waiting screen while rendering, and the calm sentence if it did not work. */
export function ApplyWaiting() {
  const rendering = useApp((s) => s.render.status === 'rendering');
  const error = useApp(selectApplyError);
  const fraction = useRenderProgress((p) => Math.round(p.apply * 100) / 100);
  const startedAt = useRenderProgress((p) => p.applyStartedAt);
  const left = timeLeft(startedAt ? secondsLeft(Date.now() - startedAt, fraction) : null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const open = rendering || error !== null;
  useEffect(() => {
    if (open) buttonRef.current?.focus({ preventScroll: true });
  }, [open]);
  if (!open) return null;
  return (
    <div className="voile ouverte attente-voile" role="dialog" aria-modal="true" aria-labelledby="attente-titre" data-testid="attente-rendu">
      <div className="accueil attente">
        <h2 id="attente-titre">{t('apply.waitTitle')}</h2>
        {rendering ? (
          <>
            <p>{t('apply.waitText')}</p>
            <div className="import-etat" role="status" aria-live="polite">
              <div className="phase">
                <span>{t('apply.working')}</span>
                <span>{t('import.percent', { n: Math.round(fraction * 100) })}</span>
              </div>
              <div className="jauge" style={{ '--avance': fraction } as CSSProperties}>
                <span />
              </div>
              {left && <p className="panneau-note">{left}</p>}
            </div>
            <div className="import-actions">
              <button ref={buttonRef} className="bouton-cadre" onClick={cancelRender}>
                {t('apply.cancel')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="import-erreur" role="alert">
              <p>{t(`apply.error.${error!}`)}</p>
            </div>
            <div className="import-actions">
              <button ref={buttonRef} className="bouton-cadre" onClick={() => appStore.setState({ render: { status: 'none' } })}>
                {t('storage.dismiss')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
