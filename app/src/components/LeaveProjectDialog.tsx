// The alert of C5: « Les modifications du projet en cours n’ont pas été sauvegardées,
// voulez-vous enregistrer ? ». « Enregistrer » is the default (Enter), Escape is
// « Annuler ». While the save runs, this window gives way to the save's own.

import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { t } from '../i18n';
import { answerLeave, leaveDialog } from '../project/leave';

export function LeaveProjectDialog() {
  const { open, saving } = useStore(leaveDialog);
  if (!open || saving) return null;
  return <LeaveProjectBox />;
}

function LeaveProjectBox() {
  const saveRef = useRef<HTMLButtonElement>(null);
  useEffect(() => saveRef.current?.focus({ preventScroll: true }), []);
  return (
    <div
      className="voile ouverte"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="alerte-titre"
      aria-describedby="alerte-texte"
      data-testid="alerte-projet"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          void answerLeave('cancel');
        }
      }}
    >
      <div className="accueil alerte-projet">
        <h2 id="alerte-titre">{t('leave.title')}</h2>
        <p id="alerte-texte" data-testid="alerte-texte">
          {t('leave.text')}
        </p>
        <div className="alerte-actions">
          <button ref={saveRef} className="plein" data-testid="alerte-enregistrer" onClick={() => void answerLeave('save')}>
            {t('leave.save')}
          </button>
          <button className="bouton-cadre abandonner" data-testid="alerte-abandonner" onClick={() => void answerLeave('discard')}>
            {t('leave.discard')}
          </button>
          <button className="bouton-cadre annuler" data-testid="alerte-annuler" onClick={() => void answerLeave('cancel')}>
            {t('leave.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
