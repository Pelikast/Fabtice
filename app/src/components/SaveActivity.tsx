// What « Enregistrer » shows: nothing while it is quick, a progress window if it takes a while (a new separation
// to encode), a short « Projet enregistré. » when it is done, a calm sentence if it failed.

import type { CSSProperties } from 'react';
import { useStore } from 'zustand';
import { t, type MessageKey } from '../i18n';
import { cancelSave, dismissSaveActivity, saveActivity } from '../project/saveFlow';

export function SaveActivity() {
  const a = useStore(saveActivity);
  if (a.phase === 'saved') {
    return (
      <div className="avis-enregistre" role="status" data-testid="projet-enregistre">
        {t('saveProject.saved')}
      </div>
    );
  }
  if ((a.phase === 'working' && a.visible) || a.phase === 'error') {
    return (
      <div className="voile ouverte" role="dialog" aria-modal="true" aria-labelledby="enregistrement-titre" data-testid="enregistrement">
        <div className="accueil export-son enregistrer-projet">
          <div className="accueil-entete">
            <h2 id="enregistrement-titre">{t('saveProject.title')}</h2>
          </div>
          {a.phase === 'working' ? (
            <div className="import-etat" role="status" aria-live="polite">
              <div className="phase">
                <span>{t('saveProject.saving')}</span>
                <span>{t('import.percent', { n: Math.round(a.fraction * 100) })}</span>
              </div>
              <div className="jauge" style={{ '--avance': a.fraction } as CSSProperties}>
                <span />
              </div>
              <div className="import-actions">
                <button className="bouton-cadre" onClick={cancelSave}>
                  {t('saveProject.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="import-erreur" role="alert">
                <p>{t(`saveProject.error.${a.code as 'failed'}` as MessageKey)}</p>
              </div>
              <div className="import-actions">
                <button className="bouton-cadre" autoFocus onClick={dismissSaveActivity}>
                  {t('saveProject.dismiss')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }
  return null;
}
